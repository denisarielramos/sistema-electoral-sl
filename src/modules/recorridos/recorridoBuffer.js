// ======================= BUFFER OFFLINE DE PUNTOS GPS =======================
// Persistido en localStorage, acotado a un máximo de 500 puntos (igual al límite
// que acepta recorrido_registrar_ubicaciones por llamada — así un flush siempre
// puede mandar el buffer entero en un solo batch, sin tener que partirlo).
//
// Clave por sesion_id: si el chofer finaliza un recorrido y más tarde inicia uno
// nuevo (misma jornada u otra), cada sesión tiene su propio buffer aislado y no
// hay arrastre de puntos de un recorrido anterior.
//
// Decisión sobre el límite de 500: la consigna pide "no borrar puntos" mientras
// no hay conexión, así que ante un buffer lleno la respuesta correcta NO es
// descartar los puntos más viejos para hacerle lugar a uno nuevo (eso SÍ sería
// borrar datos ya capturados) — es simplemente dejar de encolar puntos nuevos
// hasta que el buffer se vacíe parcialmente con un flush exitoso. A ~1 punto
// cada 10s como mínimo, 500 puntos cubren más de 80 minutos continuos sin señal,
// un margen amplio para un corte de conectividad real.
//
// Cada punto guardado conserva su mismo punto_id hasta ser confirmado por el
// backend (ver recorridoService.registrarUbicaciones) — es la clave de la
// idempotencia: reenviar el mismo punto_id ante un reintento nunca duplica nada
// del lado del servidor (UNIQUE(sesion_id, punto_id) + ON CONFLICT DO NOTHING).

export const BUFFER_MAX_PUNTOS = 500;

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

const guardarBuffer = (sesionId, puntos) => {
  try {
    localStorage.setItem(claveBuffer(sesionId), JSON.stringify(puntos));
  } catch {
    // localStorage no disponible o cuota excedida: el punto sigue existiendo solo
    // en memoria para este ciclo; no es crítico, el próximo fix lo vuelve a intentar.
  }
  return puntos;
};

export const vaciarBuffer = (sesionId) => {
  try {
    localStorage.removeItem(claveBuffer(sesionId));
  } catch {
    // no crítico
  }
};

// Decide si un punto candidato debe encolarse, lo agrega si corresponde, y
// devuelve el estado resultante. `distanciaMetrosFn` se recibe por parámetro
// (en vez de importarla) solo para facilitar pruebas unitarias sin depender del
// módulo de utils; en producción siempre se le pasa `distanciaMetros` de
// recorridoUtils.js.
export const intentarEncolarPunto = (sesionId, puntoCandidato, distanciaMetrosFn) => {
  const buffer = leerBuffer(sesionId);
  const ultimo = buffer[buffer.length - 1] || null;

  if (buffer.length >= BUFFER_MAX_PUNTOS) {
    return { agregado: false, lleno: true, buffer };
  }

  if (ultimo) {
    const deltaMs = new Date(puntoCandidato.capturado_at).getTime() - new Date(ultimo.capturado_at).getTime();
    const dist = distanciaMetrosFn(ultimo.lat, ultimo.lng, puntoCandidato.lat, puntoCandidato.lng);
    const pasaUmbral = deltaMs >= UMBRAL_TIEMPO_MS || dist >= UMBRAL_DISTANCIA_METROS;
    if (!pasaUmbral) {
      return { agregado: false, lleno: false, buffer };
    }
  }

  const nuevoBuffer = guardarBuffer(sesionId, [...buffer, puntoCandidato]);
  return { agregado: true, lleno: false, buffer: nuevoBuffer };
};

// Quita del buffer los puntos cuyo punto_id vino confirmado (ok:true) en un
// batch — nunca se vacía el buffer entero a ciegas, solo lo que el backend
// efectivamente confirmó, para no perder puntos si un flush falla a mitad.
export const quitarConfirmados = (sesionId, idsConfirmados) => {
  const idsSet = new Set(idsConfirmados);
  const restante = leerBuffer(sesionId).filter((p) => !idsSet.has(p.punto_id));
  return guardarBuffer(sesionId, restante);
};
