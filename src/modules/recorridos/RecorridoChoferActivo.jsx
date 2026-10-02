// ======================= RECORRIDO ACTIVO DEL CHOFER =======================
// Pantalla montada desde RecorridoPublico.jsx una vez que hay una sesión de
// chofer válida. El GPS NUNCA arranca solo por mostrarse esta pantalla: arranca
// únicamente cuando el chofer pulsa "Comenzar recorrido" (fase "bienvenida") y
// el navegador concede el permiso de ubicación.
//
// Excepción deliberada: si `sesion.trackingIniciadoAt` ya existe (el chofer ya
// había arrancado el tracking antes en esta misma sesión y la pantalla se
// refrescó), se reintenta el GPS automáticamente al montar en vez de mostrar de
// nuevo la bienvenida — el permiso del navegador ya fue concedido una vez para
// este origen, y volver a pedirle "Comenzar recorrido" en cada refresh sería
// peor UX sin ganar nada en seguridad (la decisión real del chofer ya se tomó).
// Si el permiso hubiera sido revocado entre medio, el navegador simplemente
// vuelve a fallar con PERMISSION_DENIED y se muestra la misma pantalla de
// permiso denegado de siempre.
//
// No se promete tracking garantizado con la pantalla bloqueada o el navegador
// en segundo plano/suspendido — es una limitación del sistema operativo/
// navegador, no de este código, y se lo dice así al chofer en pantalla.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { MapPin, Wifi, WifiOff, CheckCircle2, AlertTriangle, Loader2, Truck, LogOut } from "lucide-react";
import { getDeviceHash } from "./recorridoDevice";
import { registrarUbicaciones, finalizarSesion } from "./recorridoService";
import { mensajeError, mensajeGeoError, GEO_ERROR_CODE, distanciaMetros, formatearHoraLocal } from "./recorridoUtils";
import { leerBuffer, intentarEncolarPunto, quitarConfirmados, vaciarBuffer, RPC_BATCH_MAX, BUFFER_MAX_LOCAL } from "./recorridoBuffer";
import { Tarjeta, Encabezado, Cargando, MensajeFinal, BotonPrimario, BotonSecundario } from "./components/RecorridoUI";

const INTERVALO_FLUSH_MS = 10_000; // reintento periódico de envío, igual de frecuente que la captura

const ESTADO_GPS_LABEL = {
  buscando: "Buscando señal…",
  activo: "GPS activo",
  permiso_denegado: "Permiso de ubicación denegado",
  sin_conexion: "Sin conexión — guardando localmente",
};

const ESTADO_GPS_COLOR = {
  buscando: "bg-amber-100 text-amber-700",
  activo: "bg-emerald-100 text-emerald-700",
  permiso_denegado: "bg-red-100 text-red-700",
  sin_conexion: "bg-slate-200 text-slate-600",
};

const RecorridoChoferActivo = ({ sesion, onActualizarSesion, onSesionInvalida, onFinalizado }) => {
  const [fase, setFase] = useState(sesion.trackingIniciadoAt ? "pidiendo_permiso" : "bienvenida");
  const [estadoGps, setEstadoGps] = useState("buscando");
  const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [pendientes, setPendientes] = useState(() => leerBuffer(sesion.sesionId).length);
  const [ultimoEnvioHora, setUltimoEnvioHora] = useState(null);
  const [mensajePermiso, setMensajePermiso] = useState("");
  const [errorFinalizar, setErrorFinalizar] = useState("");
  const [finalizando, setFinalizando] = useState(false);
  const [avisoAlmacenamiento, setAvisoAlmacenamiento] = useState("");

  const watchIdRef = useRef(null);
  const flushEnCursoRef = useRef(false);
  const montadoRef = useRef(true);

  const detenerSeguimiento = useCallback(() => {
    if (watchIdRef.current != null && "geolocation" in navigator) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  // Vacía el buffer local en batches SUCESIVOS de a lo sumo RPC_BATCH_MAX (500)
  // puntos cada uno — nunca manda más de 500 por llamada (es el máximo que
  // acepta recorrido_registrar_ubicaciones), pero el buffer local puede tener
  // muchos más, así que sigue mandando batch tras batch, EN SECUENCIA (nunca
  // en paralelo, gracias a flushEnCursoRef + los `await` dentro del loop),
  // mientras cada batch se vaya confirmando y queden puntos por mandar.
  // Si un batch falla, el loop se detiene ahí: los puntos de ESE batch (y los
  // que quedaban después) permanecen intactos en el buffer para el próximo
  // intento — nunca se descartan ni se asume que se enviaron.
  const intentarFlush = useCallback(async () => {
    if (flushEnCursoRef.current) return;
    flushEnCursoRef.current = true;
    try {
      for (;;) {
        const buffer = leerBuffer(sesion.sesionId);
        if (buffer.length === 0) break;
        if (!montadoRef.current) return;

        const batch = buffer.slice(0, RPC_BATCH_MAX);
        const deviceHash = await getDeviceHash();
        const data = await registrarUbicaciones(sesion.token, deviceHash, batch);
        if (!montadoRef.current) return;

        if (data?.ok) {
          const resultado = quitarConfirmados(sesion.sesionId, batch.map((p) => p.punto_id));
          setPendientes(resultado.buffer.length);
          setUltimoEnvioHora(new Date());

          if (!resultado.persistido) {
            // El backend SÍ confirmó este batch, pero no pudimos quitarlo del
            // buffer local (localStorage falló al escribir la remoción). Si
            // siguiéramos el loop, el próximo ciclo volvería a leer este mismo
            // batch (sigue ahí) y lo reenviaría sin fin dentro de este mismo
            // flush. Se corta acá en vez de seguir: se avisa en pantalla y se
            // reintenta recién en el próximo ciclo (próximo tick del
            // intervalo o evento "online"), nunca en un loop sin fin. Ningún
            // punto se borra ni se da por enviado sin estarlo, y un reenvío
            // posterior del mismo batch es inocuo: el backend lo ignora por
            // punto_id (idempotente).
            setAvisoAlmacenamiento(
              "El envío se confirmó pero no se pudo actualizar el almacenamiento local. " +
                "Se reintentará: si se reenvía el mismo lote, el servidor no lo duplica."
            );
            return;
          }

          if (resultado.buffer.length < BUFFER_MAX_LOCAL) setAvisoAlmacenamiento("");
          continue; // puede quedar más del buffer local por mandar: sigue el loop
        }

        if (data?.codigo === "SESION_INVALIDA_O_VENCIDA") {
          detenerSeguimiento();
          onSesionInvalida();
          return;
        }

        if (data?.codigo === "SESION_FINALIZADA") {
          // El backend ya considera finalizada esta sesión (ej. finalizada desde
          // otra pestaña/dispositivo con el mismo token) — se trata como éxito
          // idempotente del lado del cliente: se deja de transmitir.
          detenerSeguimiento();
          vaciarBuffer(sesion.sesionId);
          onFinalizado();
          setFase("finalizado");
          return;
        }

        // PUNTOS_INVALIDOS / PUNTOS_VACIO / PUNTOS_EXCEDEN_LIMITE / ERROR_TECNICO:
        // ninguno es fatal, pero tampoco se insiste con más batches en este
        // mismo ciclo — el buffer completo (este batch y lo que quedaba
        // después) se deja intacto y se reintenta en el próximo ciclo
        // (próximo tick del intervalo o próximo evento "online").
        break;
      }
    } finally {
      flushEnCursoRef.current = false;
    }
  }, [sesion.sesionId, sesion.token, detenerSeguimiento, onSesionInvalida, onFinalizado]);

  const onPosicion = useCallback(
    (pos) => {
      if (!montadoRef.current) return;
      setEstadoGps("activo");
      setFase((actual) => {
        if (actual === "tracking") return actual;
        if (!sesion.trackingIniciadoAt) {
          onActualizarSesion({ trackingIniciadoAt: new Date().toISOString() });
        }
        return "tracking";
      });

      const candidato = {
        punto_id: crypto.randomUUID(),
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy ?? null,
        speed: pos.coords.speed ?? null,
        heading: pos.coords.heading ?? null,
        capturado_at: new Date(pos.timestamp).toISOString(),
      };

      const resultado = intentarEncolarPunto(sesion.sesionId, candidato, distanciaMetros);
      setPendientes(resultado.buffer.length);

      if (resultado.lleno) {
        setAvisoAlmacenamiento(
          `El almacenamiento local llegó al máximo (${BUFFER_MAX_LOCAL} puntos sin confirmar). ` +
            "Se dejaron de guardar puntos nuevos hasta liberar espacio. Seguimos intentando sincronizar."
        );
      } else if (!resultado.persistido) {
        setAvisoAlmacenamiento(
          "No se pudo guardar tu última ubicación en este dispositivo (almacenamiento lleno o no disponible). " +
            "Seguimos intentando sincronizar lo que sí se guardó."
        );
      } else {
        setAvisoAlmacenamiento("");
      }

      // Deliberadamente NO se llama a intentarFlush() acá. La frecuencia de
      // CAPTURA (este callback, gateado por el umbral de ~15m/~10s de arriba)
      // es independiente de la frecuencia de ENVÍO a la red: un vehículo en
      // movimiento puede encolar varios puntos dentro de una misma ventana de
      // 10s, y se quiere seguir capturándolos todos, pero sin disparar una
      // llamada RPC por cada uno — para ~600 choferes eso multiplicaría la
      // carga de red/servidor sin necesidad. La sincronización corre sola, con
      // su propio ritmo de ~10s (ver el setInterval más abajo) + al reconectar
      // (evento "online") + al finalizar — nunca atada a cada punto capturado.
    },
    [sesion.sesionId, sesion.trackingIniciadoAt, onActualizarSesion]
  );

  const onErrorPosicion = useCallback(
    (err) => {
      if (!montadoRef.current) return;
      const codigo = GEO_ERROR_CODE[err.code] || "POSICION_NO_DISPONIBLE";
      if (codigo === "PERMISO_DENEGADO") {
        detenerSeguimiento();
        setMensajePermiso(mensajeGeoError(codigo));
        setFase("permiso_denegado");
        return;
      }
      // POSICION_NO_DISPONIBLE / TIEMPO_AGOTADO: watchPosition sigue intentando
      // solo, no es un error terminal — solo se refleja en el estado visible.
      setEstadoGps("buscando");
    },
    [detenerSeguimiento]
  );

  const comenzar = useCallback(() => {
    setMensajePermiso("");
    setFase("pidiendo_permiso");
    setEstadoGps("buscando");

    if (!("geolocation" in navigator)) {
      setMensajePermiso(mensajeGeoError("NO_SOPORTADO"));
      setFase("permiso_denegado");
      return;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(onPosicion, onErrorPosicion, {
      enableHighAccuracy: true,
      maximumAge: 0,
    });
  }, [onPosicion, onErrorPosicion]);

  // Arranque automático si el tracking ya se había iniciado antes de un refresh
  // (ver nota al inicio del archivo). Corre una sola vez al montar.
  useEffect(() => {
    if (sesion.trackingIniciadoAt) comenzar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Conectividad + reintento periódico de envío — vigentes durante toda la vida
  // del componente, independientemente de la fase (así una reconexión se
  // aprovecha apenas ocurre, y el intervalo sigue funcionando como red de
  // seguridad si el evento "online" del navegador no se dispara).
  useEffect(() => {
    const marcarOnline = () => {
      setOnline(true);
      intentarFlush();
    };
    const marcarOffline = () => setOnline(false);
    window.addEventListener("online", marcarOnline);
    window.addEventListener("offline", marcarOffline);

    const intervalo = setInterval(() => {
      if (navigator.onLine) intentarFlush();
    }, INTERVALO_FLUSH_MS);

    return () => {
      window.removeEventListener("online", marcarOnline);
      window.removeEventListener("offline", marcarOffline);
      clearInterval(intervalo);
    };
  }, [intentarFlush]);

  // Limpieza del watcher de geolocalización al desmontar el componente.
  useEffect(() => {
    montadoRef.current = true;
    return () => {
      montadoRef.current = false;
      detenerSeguimiento();
    };
  }, [detenerSeguimiento]);

  const finalizar = async () => {
    if (finalizando) return;
    setFinalizando(true);
    setErrorFinalizar("");
    try {
      await intentarFlush();
      const restantes = leerBuffer(sesion.sesionId).length;
      if (restantes > 0) {
        setErrorFinalizar(
          `Hay ${restantes} ${restantes === 1 ? "punto" : "puntos"} sin enviar por falta de conexión. ` +
            "Esperá a recuperar conexión e intentá finalizar de nuevo."
        );
        return;
      }

      const deviceHash = await getDeviceHash();
      const data = await finalizarSesion(sesion.token, deviceHash);
      if (data?.ok) {
        detenerSeguimiento();
        vaciarBuffer(sesion.sesionId);
        onFinalizado();
        setFase("finalizado");
        return;
      }
      if (data?.codigo === "SESION_INVALIDA_O_VENCIDA") {
        detenerSeguimiento();
        onSesionInvalida();
        return;
      }
      setErrorFinalizar(mensajeError(data?.codigo));
    } finally {
      setFinalizando(false);
    }
  };

  // ======================= RENDER =======================
  if (fase === "bienvenida") {
    return (
      <Tarjeta>
        <Encabezado
          icono={Truck}
          titulo={`Hola, ${sesion.chofer?.nombre || "chofer"}`}
          subtitulo={sesion.jornada?.nombre ? `Jornada: ${sesion.jornada.nombre}` : null}
        />
        <p className="text-sm text-slate-600 text-center mb-5">
          Vamos a usar la ubicación de tu teléfono durante el recorrido de hoy para que el
          equipo pueda seguir tu avance. Solo se transmite mientras el recorrido esté activo.
        </p>
        <BotonPrimario onClick={comenzar}>
          <MapPin className="w-4 h-4" /> Comenzar recorrido
        </BotonPrimario>
      </Tarjeta>
    );
  }

  if (fase === "pidiendo_permiso") {
    return <Cargando texto="Solicitando acceso a tu ubicación…" />;
  }

  if (fase === "permiso_denegado") {
    return (
      <Tarjeta>
        <Encabezado icono={AlertTriangle} titulo="No pudimos acceder a tu ubicación" />
        <p className="text-sm text-slate-600 text-center mb-5">{mensajePermiso}</p>
        <BotonPrimario onClick={comenzar}>Reintentar</BotonPrimario>
      </Tarjeta>
    );
  }

  if (fase === "finalizado") {
    return (
      <MensajeFinal
        icono={CheckCircle2}
        color="bg-emerald-50 text-emerald-600"
        titulo="Recorrido finalizado"
        mensaje="Gracias por tu trabajo hoy. Ya podés cerrar esta pantalla."
      />
    );
  }

  // fase === "tracking"
  const estadoVisible = fase === "permiso_denegado" ? "permiso_denegado" : !online ? "sin_conexion" : estadoGps;

  return (
    <Tarjeta>
      <Encabezado icono={Truck} titulo="Recorrido activo" subtitulo={sesion.jornada?.nombre} />

      <div className="space-y-3 mb-5">
        <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-slate-50 border border-slate-200">
          <span className="text-sm text-slate-600">Estado GPS</span>
          <span
            className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full ${ESTADO_GPS_COLOR[estadoVisible]}`}
          >
            {online ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            {ESTADO_GPS_LABEL[estadoVisible]}
          </span>
        </div>

        <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-slate-50 border border-slate-200">
          <span className="text-sm text-slate-600">Hora de inicio</span>
          <span className="text-sm font-medium text-slate-800">{formatearHoraLocal(sesion.trackingIniciadoAt)}</span>
        </div>

        <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-slate-50 border border-slate-200">
          <span className="text-sm text-slate-600">Última ubicación enviada</span>
          <span className="text-sm font-medium text-slate-800">
            {ultimoEnvioHora ? formatearHoraLocal(ultimoEnvioHora) : "Aún no se envió ningún punto"}
          </span>
        </div>

        <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-slate-50 border border-slate-200">
          <span className="text-sm text-slate-600">Puntos pendientes de sincronizar</span>
          <span className="text-sm font-medium text-slate-800">{pendientes}</span>
        </div>
      </div>

      <p className="flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-5">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        Mantené esta pantalla abierta durante el recorrido para que el seguimiento continúe
        correctamente. El tracking puede interrumpirse si bloqueás la pantalla o el navegador
        queda en segundo plano.
      </p>

      {avisoAlmacenamiento && (
        <p className="flex items-start gap-1.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 mb-3">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {avisoAlmacenamiento}
        </p>
      )}

      {errorFinalizar && (
        <p className="flex items-center gap-1.5 text-sm text-red-600 mb-3">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {errorFinalizar}
        </p>
      )}

      <BotonSecundario onClick={finalizar} disabled={finalizando}>
        {finalizando ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
        Finalizar recorrido
      </BotonSecundario>
    </Tarjeta>
  );
};

export default RecorridoChoferActivo;
