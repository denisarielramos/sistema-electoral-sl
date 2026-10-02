// ======================= BUFFER OFFLINE DE PUNTOS GPS =======================
// Persistido en localStorage. Dos límites DISTINTOS, a propósito:
//   - RPC_BATCH_MAX (500): lo que acepta recorrido_registrar_ubicaciones por
//     llamada — un límite del backend, no del almacenamiento local.
//   - BUFFER_MAX_LOCAL (5000): el techo del buffer local en sí. Antes este
//     módulo usaba el mismo número (500) para ambas cosas, lo que significaba
//     que una caída de datos móviles prolongada terminaba perdiendo parte del
//     recorrido: con la regla de encolado (~15m O ~10s) un vehículo en
//     movimiento genera puntos bastante más rápido que uno cada 10s, así que
//     500 puntos locales se agotan mucho antes de que el chofer recupere señal.
//     Ahora el buffer local puede crecer hasta 5000 puntos sin confirmar, y
//     intentarFlush (ver RecorridoChoferActivo.jsx) vacía ese buffer en
//     batches sucesivos de a lo sumo 500 por llamada — nunca manda más de 500
//     de una vez, pero tampoco limita el recorrido completo a 500.
//
// Clave por sesion_id: si el chofer finaliza un recorrido y más tarde inicia
// uno nuevo, cada sesión tiene su propio buffer aislado, sin arrastre.
//
// Decisión sobre el límite absoluto de 5000: la consigna pide "no borrar
// puntos" mientras no hay conexión, así que ante un buffer lleno la respuesta
// correcta NO es descartar los puntos más viejos para hacerle lugar a uno
// nuevo (eso SÍ sería perder datos ya capturados) — es dejar de encolar puntos
// NUEVOS hasta que un flush exitoso libere espacio, y reflejarlo claramente en
// la UI (ver `lleno` en intentarEncolarPunto). A ~1 punto cada 10s como
// mínimo, 5000 puntos cubren más de 13 horas continuas sin señal — muy por
// encima de cualquier jornada electoral real.
//
// Cada punto guardado conserva su mismo punto_id hasta ser confirmado por el
// backend — es la clave de la idempotencia: reenviar el mismo punto_id ante un
// reintento (de un batch completo o de un punto individual) nunca duplica nada
// del lado del servidor (UNIQUE(sesion_id, punto_id) + ON CONFLICT DO NOTHING).

export const RPC_BATCH_MAX = 500;
export const BUFFER_MAX_LOCAL = 5000;

// Distancia mínima (m) o tiempo mínimo (ms) desde el último punto ENCOLADO para
// que un nuevo fix del GPS valga la pena encolarse. Evita mandar cada callback
// crudo de watchPosition (que puede disparar varias veces por segundo).
const UMBRAL_TIEMPO_MS = 10_000; // ~10s
const UMBRAL_DISTANCIA_METROS = 15; // ~15m

const claveBuffer = (sesionId) => `recorrido_buffer_v1::${sesionId}`;

export const leerBuffer = (sesionId) => {
  try {
    const raw = localStorage.getItem(claveBuffer(sesionId));
    const puntos = raw ? JSON.parse(raw) : [];
    return Array.isArray(puntos) ? puntos : [];
  } catch {
    return [];
  }
};

// Intenta persistir `puntos` y SIEMPRE informa si realmente quedó guardado.
// Antes, si localStorage.setItem() fallaba (cuota excedida, modo privado,
// storage no disponible), esta función devolvía igual el array nuevo como si
// hubiese quedado persistido — eso hacía que la UI mostrara puntos
// "pendientes" que en realidad nunca se guardaron y se perderían sin aviso.
// Ahora, ante un fallo, se re-lee lo que REALMENTE hay en storage (puede ser
// el estado anterior, sin el punto nuevo) y se informa `ok:false` para que el
// llamador pueda reflejarlo en la UI en vez de simular un éxito que no ocurrió.
const guardarBuffer = (sesionId, puntos) => {
  try {
    localStorage.setItem(claveBuffer(sesionId), JSON.stringify(puntos));
    return { ok: true, puntos };
  } catch {
    return { ok: false, puntos: leerBuffer(sesionId) };
  }
};

export const vaciarBuffer = (sesionId) => {
  try {
    localStorage.removeItem(claveBuffer(sesionId));
  } catch {
    // no crítico: en el peor caso queda un buffer viejo huérfano, que de
    // todos modos ya no se va a leer porque la sesión fue finalizada.
  }
};

// Decide si un punto candidato debe encolarse, lo agrega si corresponde, y
// devuelve el estado resultante. `distanciaMetrosFn` se recibe por parámetro
// (en vez de importarla) solo para facilitar pruebas unitarias sin depender
// de recorridoUtils.js directamente; en producción siempre se le pasa
// `distanciaMetros` de ese módulo.
//
// Forma del resultado:
//   agregado  -> true solo si el punto quedó efectivamente agregado Y
//                persistido con éxito.
//   lleno     -> true si el buffer ya está en BUFFER_MAX_LOCAL y por eso NO
//                se intentó agregar nada (independiente de si hubo o no fallo
//                de persistencia).
//   persistido-> false si se intentó escribir en localStorage y la escritura
//                falló (cuota/no disponible). true si no hubo que escribir
//                (punto no pasó el umbral, o buffer lleno) o si escribió bien.
//   buffer    -> el estado REAL actual del buffer (nunca un array optimista
//                que no haya quedado efectivamente guardado).
export const intentarEncolarPunto = (sesionId, puntoCandidato, distanciaMetrosFn) => {
  const buffer = leerBuffer(sesionId);
  const ultimo = buffer[buffer.length - 1] || null;

  if (buffer.length >= BUFFER_MAX_LOCAL) {
    return { agregado: false, lleno: true, persistido: true, buffer };
  }

  if (ultimo) {
    const deltaMs = new Date(puntoCandidato.capturado_at).getTime() - new Date(ultimo.capturado_at).getTime();
    const dist = distanciaMetrosFn(ultimo.lat, ultimo.lng, puntoCandidato.lat, puntoCandidato.lng);
    const pasaUmbral = deltaMs >= UMBRAL_TIEMPO_MS || dist >= UMBRAL_DISTANCIA_METROS;
    if (!pasaUmbral) {
      return { agregado: false, lleno: false, persistido: true, buffer };
    }
  }

  const { ok, puntos } = guardarBuffer(sesionId, [...buffer, puntoCandidato]);
  return { agregado: ok, lleno: false, persistido: ok, buffer: puntos };
};

// Quita del buffer los puntos cuyo punto_id vino confirmado (ok:true) en un
// batch — nunca se vacía el buffer entero a ciegas, solo lo que el backend
// efectivamente confirmó, para no perder puntos si un flush falla a mitad de
// camino (ver el flush en batches sucesivos en RecorridoChoferActivo.jsx).
// Devuelve también si la escritura de la remoción se persistió; si falla,
// el peor caso es reintentar de más en el próximo flush (inocuo gracias a la
// idempotencia por punto_id), nunca una pérdida de datos.
export const quitarConfirmados = (sesionId, idsConfirmados) => {
  const idsSet = new Set(idsConfirmados);
  const restante = leerBuffer(sesionId).filter((p) => !idsSet.has(p.punto_id));
  const { ok, puntos } = guardarBuffer(sesionId, restante);
  return { persistido: ok, buffer: puntos };
};
