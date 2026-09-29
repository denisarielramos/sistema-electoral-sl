// ======================= FLUJO PÚBLICO DE ASISTENCIA (sin login) =======================
// Montado directamente desde src/main.jsx para /q/:slug y /check/:token — nunca se
// monta junto a App/Dashboard. Mobile-first: pantalla completa, botones grandes,
// una sola acción visible por paso.
//
// Reglas de seguridad que este componente NUNCA viola:
// - El perímetro/horario/duplicados los decide siempre el backend (RPC). Acá solo se
//   muestra lo que la RPC devuelve; no hay ningún cálculo de "adentro/afuera" propio.
// - El token de sesión nunca se imprime como texto en el DOM.
// - Todo código de error (`data.codigo`) se traduce con ERROR_MESSAGES; nunca se
//   muestra `error.message` de Supabase ni un código crudo.
import React, { useEffect, useState } from "react";
import { ShieldCheck, MapPin, Search, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import {
  getDeviceHash,
  marcarRegistradoLocalmente,
  yaRegistradoLocalmente,
} from "./asistenciaDevice";
import {
  iniciarSesionAsistencia,
  validarUbicacionAsistencia,
  buscarPersonaAsistencia,
  registrarAsistencia,
} from "./asistenciaService";
import {
  mensajeError,
  mensajeGeolocalizacion,
  obtenerUbicacionActual,
  soloDigitos,
  ESTADO_PUNTO_LABEL,
  puntoSeleccionable,
} from "./asistenciaUtils";
import { formatearDistancia } from "../../utils/geoHelpers";

const SESION_STORAGE_KEY = "asistencia_sesion_v1";

const guardarSesion = (sesion) => {
  try {
    sessionStorage.setItem(SESION_STORAGE_KEY, JSON.stringify(sesion));
  } catch {
    // sessionStorage no disponible: el paso /check siguiente mostrará "sesión inválida".
  }
};

const leerSesion = () => {
  try {
    const raw = sessionStorage.getItem(SESION_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

// ======================= UI BASE =======================
const Tarjeta = ({ children }) => (
  <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
    <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
      {children}
    </div>
  </div>
);

const Encabezado = ({ titulo, subtitulo, icono: Icono = ShieldCheck }) => (
  <div className="flex flex-col items-center text-center mb-5">
    <div className="p-2.5 bg-brand-50 rounded-full mb-3">
      {Icono && <Icono className="w-6 h-6 text-brand-600" />}
    </div>
    <h1 className="text-lg font-bold text-slate-800">{titulo}</h1>
    {subtitulo && <p className="text-sm text-slate-500 mt-1">{subtitulo}</p>}
  </div>
);

const Cargando = ({ texto }) => (
  <Tarjeta>
    <div className="flex flex-col items-center text-center py-6">
      <Loader2 className="w-8 h-8 text-brand-600 animate-spin mb-4" />
      <p className="text-sm text-slate-600">{texto}</p>
    </div>
  </Tarjeta>
);

const MensajeFinal = ({ icono: Icono, color, titulo, mensaje, children }) => (
  <Tarjeta>
    <div className="flex flex-col items-center text-center py-4">
      <div className={`p-3 rounded-full mb-4 ${color}`}>
        {Icono && <Icono className="w-7 h-7" />}
      </div>
      <h1 className="text-lg font-bold text-slate-800 mb-1">{titulo}</h1>
      {mensaje && <p className="text-sm text-slate-500">{mensaje}</p>}
      {children}
    </div>
  </Tarjeta>
);

const BotonPrimario = ({ children, ...props }) => (
  <button
    {...props}
    className="w-full inline-flex items-center justify-center gap-2 px-4 h-11 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium border-0 transition-colors"
  >
    {children}
  </button>
);

const BotonSecundario = ({ children, ...props }) => (
  <button
    {...props}
    className="w-full inline-flex items-center justify-center gap-2 px-4 h-11 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-medium transition-colors"
  >
    {children}
  </button>
);

const AsistenciaPublica = ({ modo, valor }) => {
  const [fase, setFase] = useState("iniciando");
  const [mensaje, setMensaje] = useState("");
  const [sesion, setSesion] = useState(null);
  const [seccionalElegida, setSeccionalElegida] = useState(null);
  const [ubicacionInfo, setUbicacionInfo] = useState(null);
  const [errorUbicacion, setErrorUbicacion] = useState("");
  const [ci, setCi] = useState("");
  const [errorCi, setErrorCi] = useState("");
  const [buscandoCi, setBuscandoCi] = useState(false);
  const [persona, setPersona] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState(null);
  // ======================= MODO "qr": iniciar sesión y redirigir =======================
  useEffect(() => {
    if (modo !== "qr") return;

    const slug = valor;
    if (!slug) {
      setFase("error_fatal");
      setMensaje(mensajeError("EVENTO_INVALIDO"));
      return;
    }

    if (yaRegistradoLocalmente(slug)) {
      setFase("ya_registrado_local");
      return;
    }

    let cancelado = false;
    (async () => {
      try {
        const deviceHash = await getDeviceHash();
        const data = await iniciarSesionAsistencia(slug, deviceHash);
        if (cancelado) return;

        if (!data?.ok) {
          if (data?.codigo === "DISPOSITIVO_YA_REGISTRADO") {
            marcarRegistradoLocalmente(slug);
            setFase("ya_registrado_local");
            return;
          }
          setFase("error_fatal");
          setMensaje(mensajeError(data?.codigo));
          return;
        }

        guardarSesion({
          token: data.token,
          expiresAt: data.expires_at,
          evento: data.evento,
          puntos: data.puntos || [],
          slug,
        });
        window.location.replace(`/check/${data.token}`);
      } catch {
        if (cancelado) return;
        setFase("error_fatal");
        setMensaje(mensajeError("ERROR_TECNICO"));
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [modo, valor]);

  // ======================= MODO "check": recuperar sesión guardada =======================
  useEffect(() => {
    if (modo !== "check") return;

    const guardada = leerSesion();
    if (!guardada || guardada.token !== valor) {
      setFase("sesion_invalida");
      return;
    }
    if (guardada.expiresAt && new Date(guardada.expiresAt).getTime() < Date.now()) {
      setFase("sesion_invalida");
      return;
    }
    if (yaRegistradoLocalmente(guardada.slug)) {
      setFase("ya_registrado_local");
      return;
    }

    setSesion(guardada);
    setFase("paso_seccional");
  }, [modo, valor]);

  // ======================= PASO 2: geolocalización + validación de ubicación =======================
  const intentarValidarUbicacion = async () => {
    setErrorUbicacion("");
    setFase("paso_ubicacion");
    try {
      const { latitud, longitud, precisionMetros } = await obtenerUbicacionActual();
      const deviceHash = await getDeviceHash();
      const data = await validarUbicacionAsistencia({
        sesionToken: sesion.token,
        deviceHash,
        seccional: seccionalElegida,
        latitud,
        longitud,
        precisionMetros,
      });

      if (!data?.ok) {
        let texto = mensajeError(data?.codigo);
        if (data?.codigo === "FUERA_DE_PERIMETRO" && data?.distancia_metros != null) {
          texto += ` (estás a ${formatearDistancia(data.distancia_metros)}, el límite es ${formatearDistancia(data.radio_metros)}).`;
        }
        setErrorUbicacion(texto);
        return;
      }

      setUbicacionInfo({
        distanciaMetros: data.distancia_metros,
        radioMetros: data.radio_metros,
        nombrePunto: data.nombre_punto,
      });
      setFase("paso_ci");
    } catch (err) {
      setErrorUbicacion(mensajeGeolocalizacion(err?.message));
    }
  };

  useEffect(() => {
    if (fase === "paso_ubicacion" && !ubicacionInfo && !errorUbicacion) {
      intentarValidarUbicacion();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fase]);

  const elegirSeccional = (seccional) => {
    setSeccionalElegida(seccional);
    setUbicacionInfo(null);
    setErrorUbicacion("");
    setFase("paso_ubicacion");
  };

  // ======================= PASO 3: búsqueda de CI (solo explícita) =======================
  const buscarCi = async (e) => {
    e.preventDefault();
    const digitos = soloDigitos(ci);
    if (!digitos) {
      setErrorCi(mensajeError("CI_INVALIDO"));
      return;
    }
    setErrorCi("");
    setBuscandoCi(true);
    try {
      const deviceHash = await getDeviceHash();
      const data = await buscarPersonaAsistencia({
        sesionToken: sesion.token,
        deviceHash,
        ci: Number(digitos),
      });
      if (!data?.ok) {
        if (data?.codigo === "DISPOSITIVO_YA_REGISTRADO") {
          marcarRegistradoLocalmente(sesion.slug);
          setFase("ya_registrado_local");
          return;
        }
        setErrorCi(mensajeError(data?.codigo));
        return;
      }
      setPersona(data.persona);
      setFase("paso_confirmar");
    } finally {
      setBuscandoCi(false);
    }
  };

  // ======================= PASO 4: confirmación y registro =======================
  const confirmarAsistencia = async () => {
    if (enviando) return;
    setEnviando(true);
    setErrorCi("");
    try {
      const deviceHash = await getDeviceHash();
      const data = await registrarAsistencia({
        sesionToken: sesion.token,
        deviceHash,
        ci: persona.ci,
      });
      if (!data?.ok) {
        if (data?.codigo === "DISPOSITIVO_YA_REGISTRADO" || data?.codigo === "REGISTRO_DUPLICADO") {
          marcarRegistradoLocalmente(sesion.slug);
          setFase("ya_registrado_local");
          return;
        }
        if (data?.codigo === "CI_YA_REGISTRADO") {
          setPersona(null);
          setCi("");
          setErrorCi(mensajeError(data.codigo));
          setFase("paso_ci");
          return;
        }
        setMensaje(mensajeError(data?.codigo));
        setFase("error_fatal");
        return;
      }
      marcarRegistradoLocalmente(sesion.slug);
      setResultado({ persona: data.persona, punto: data.punto, hora: new Date() });
      setFase("exito");
    } finally {
      setEnviando(false);
    }
  };

  // ======================= RENDER POR FASE =======================
  if (fase === "iniciando") {
    return <Cargando texto="Iniciando sesión…" />;
  }

  if (fase === "sesion_invalida") {
    return (
      <MensajeFinal
        icono={AlertTriangle}
        color="bg-amber-50 text-amber-600"
        titulo="Tu sesión no es válida"
        mensaje="Volvé a escanear el código QR para comenzar de nuevo."
      />
    );
  }

  if (fase === "ya_registrado_local") {
    return (
      <MensajeFinal
        icono={CheckCircle2}
        color="bg-emerald-50 text-emerald-600"
        titulo="Ya registraste tu asistencia"
        mensaje="Este dispositivo ya tiene una asistencia registrada para este evento."
      />
    );
  }

  if (fase === "error_fatal") {
    return (
      <MensajeFinal
        icono={AlertTriangle}
        color="bg-red-50 text-red-600"
        titulo="No se pudo continuar"
        mensaje={mensaje}
      >
        {mensaje === mensajeError("ERROR_TECNICO") && (
          <div className="mt-4 w-full">
            <BotonPrimario onClick={() => window.location.reload()}>Reintentar</BotonPrimario>
          </div>
        )}
      </MensajeFinal>
    );
  }

  if (fase === "exito") {
    return (
      <MensajeFinal
        icono={CheckCircle2}
        color="bg-emerald-50 text-emerald-600"
        titulo="¡Asistencia registrada!"
        mensaje={`${resultado.persona.nombre} ${resultado.persona.apellido} — ${resultado.punto.nombre}`}
      >
        <p className="text-xs text-slate-400 mt-3">
          Hora aproximada: {resultado.hora.toLocaleTimeString()} (no oficial)
        </p>
      </MensajeFinal>
    );
  }

  if (fase === "paso_seccional") {
    return (
      <Tarjeta>
        <Encabezado titulo={sesion?.evento?.nombre || "Registro de asistencia"} subtitulo="Elegí la seccional en la que te encontrás" />
        <div className="space-y-2">
          {(sesion?.puntos || []).map((punto) => {
            const habilitado = puntoSeleccionable(punto.estado);
            return (
              <button
                key={punto.seccional}
                type="button"
                disabled={!habilitado}
                onClick={() => elegirSeccional(punto.seccional)}
                className={`w-full flex items-center justify-between gap-3 px-4 h-14 rounded-lg border text-left transition-colors ${
                  habilitado
                    ? "border-brand-200 bg-brand-50 hover:bg-brand-100 text-slate-800"
                    : "border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed"
                }`}
              >
                <span className="font-medium">{punto.nombre}</span>
                <span className="text-xs">{ESTADO_PUNTO_LABEL[punto.estado] || punto.estado}</span>
              </button>
            );
          })}
        </div>
      </Tarjeta>
    );
  }

  if (fase === "paso_ubicacion") {
    if (errorUbicacion) {
      return (
        <Tarjeta>
          <Encabezado titulo="No pudimos validar tu ubicación" />
          <p className="text-sm text-slate-600 text-center mb-4">{errorUbicacion}</p>
          <div className="space-y-2">
            <BotonPrimario onClick={intentarValidarUbicacion}>Reintentar</BotonPrimario>
            <BotonSecundario onClick={() => setFase("paso_seccional")}>Elegir otra seccional</BotonSecundario>
          </div>
        </Tarjeta>
      );
    }
    return <Cargando texto="Obteniendo tu ubicación…" />;
  }

  if (fase === "paso_ci") {
    return (
      <Tarjeta>
        <Encabezado titulo="Buscá tu cédula" subtitulo="Ingresá tu número de cédula sin puntos" />
        <form onSubmit={buscarCi} className="space-y-3">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            value={ci}
            onChange={(e) => setCi(soloDigitos(e.target.value))}
            placeholder="Número de cédula"
            className="w-full px-3 py-3 border border-slate-300 rounded-lg text-base focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            style={{ fontSize: 16 }}
          />
          {errorCi && (
            <p className="flex items-center gap-1.5 text-sm text-red-600">
              <AlertTriangle className="w-4 h-4 shrink-0" /> {errorCi}
            </p>
          )}
          <BotonPrimario type="submit" disabled={buscandoCi || !ci}>
            {buscandoCi ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Buscar
          </BotonPrimario>
        </form>
      </Tarjeta>
    );
  }

  if (fase === "paso_confirmar" && persona) {
    return (
      <Tarjeta>
        <Encabezado titulo="Confirmá tus datos" icono={MapPin} />
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 mb-4 text-center">
          <p className="text-lg font-bold text-slate-800">
            {persona.nombre} {persona.apellido}
          </p>
          <p className="text-sm text-slate-500">CI {persona.ci}</p>
          {ubicacionInfo?.nombrePunto && (
            <p className="text-xs text-slate-400 mt-1">{ubicacionInfo.nombrePunto}</p>
          )}
        </div>
        {errorCi && (
          <p className="flex items-center gap-1.5 text-sm text-red-600 mb-3">
            <AlertTriangle className="w-4 h-4 shrink-0" /> {errorCi}
          </p>
        )}
        <BotonPrimario onClick={confirmarAsistencia} disabled={enviando}>
          {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
          Confirmar asistencia
        </BotonPrimario>
      </Tarjeta>
    );
  }

  return <Cargando texto="Cargando…" />;
};

export default AsistenciaPublica;
