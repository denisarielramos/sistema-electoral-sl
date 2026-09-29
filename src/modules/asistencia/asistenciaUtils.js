// ======================= HELPERS PUROS DEL MÓDULO DE ASISTENCIA =======================
// Traducción de códigos de error/estado a texto en español y utilidades de UI.
// Ninguna función de este archivo decide autoridad (perímetro, duplicados, horarios):
// esas decisiones son siempre de las RPC del backend. Acá solo se interpretan sus
// respuestas para mostrarlas de forma amigable.

// `codigo` viaja siempre en `data.codigo` de la respuesta jsonb de las RPC (nunca en
// `error.message` de Supabase JS). "ERROR_TECNICO" es sintético: lo agrega
// asistenciaService cuando la RPC falla por un motivo técnico (red/PostgREST) en vez
// de una validación funcional, para que la UI tenga un único punto de traducción.
export const ERROR_MESSAGES = {
  EVENTO_INVALIDO: "El código QR no es válido. Pedí uno nuevo al organizador.",
  DISPOSITIVO_INVALIDO: "No se pudo identificar tu dispositivo. Recargá la página e intentá de nuevo.",
  EVENTO_NO_DISPONIBLE: "Este evento no está disponible en este momento.",
  DISPOSITIVO_YA_REGISTRADO: "Ya registraste tu asistencia con este dispositivo.",
  SESION_INVALIDA: "Tu sesión no es válida. Escaneá el código QR nuevamente.",
  SESION_INVALIDA_O_VENCIDA: "Tu sesión expiró. Escaneá el código QR nuevamente.",
  UBICACION_INVALIDA: "No se pudo obtener tu ubicación. Verificá que el GPS esté activado e intentá de nuevo.",
  PRECISION_INVALIDA: "La precisión de tu ubicación es muy baja. Intentá nuevamente en un lugar con mejor señal GPS.",
  PUNTO_INVALIDO: "La seccional seleccionada no es válida.",
  PUNTO_SIN_UBICACION: "Esta seccional todavía no tiene una ubicación configurada. Avisá al organizador.",
  PUNTO_NO_PROGRAMADO: "Esta seccional todavía no tiene un horario programado.",
  PUNTO_AUN_NO_HABILITADO: "Esta seccional todavía no está habilitada. Probá más tarde.",
  PUNTO_FINALIZADO: "El registro para esta seccional ya finalizó.",
  PUNTO_CERRADO: "Esta seccional está cerrada en este momento.",
  PUNTO_NO_DISPONIBLE: "Esta seccional no está disponible en este momento.",
  FUERA_DE_PERIMETRO: "Estás fuera del área permitida para esta seccional. Acercate al punto e intentá de nuevo.",
  CI_INVALIDO: "El número de cédula ingresado no es válido.",
  SESION_NO_HABILITADA: "Tu sesión no está habilitada para este paso. Volvé a escanear el código QR.",
  CI_YA_REGISTRADO: "Esta cédula ya registró su asistencia.",
  CI_NO_ENCONTRADO: "No encontramos esa cédula en el padrón.",
  REGISTRO_DUPLICADO: "Esta asistencia ya fue registrada.",
  ERROR_TECNICO: "No se pudo conectar. Verificá tu conexión e intentá nuevamente.",
  CREDENCIALES_INVALIDAS: "CI o contraseña incorrectos.",
  ADMIN_TEMPORALMENTE_BLOQUEADO: "Demasiados intentos. El acceso quedó temporalmente bloqueado, intentá más tarde.",
  SESION_ADMIN_EXPIRADA: "Tu sesión administrativa expiró. Cerrá sesión e ingresá nuevamente.",
};

const MENSAJE_GENERICO = "Ocurrió un problema al procesar tu solicitud. Intentá nuevamente.";

// Nunca se devuelve un código ni un mensaje crudo de Postgres: ante un código no
// reconocido, se usa el mensaje genérico.
export const mensajeError = (codigo) => ERROR_MESSAGES[codigo] || MENSAJE_GENERICO;

// Códigos ante los cuales corresponde bloquear el dispositivo localmente porque el
// backend ya confirmó que este dispositivo tiene una asistencia registrada.
export const CODIGOS_DISPOSITIVO_BLOQUEADO = new Set([
  "DISPOSITIVO_YA_REGISTRADO",
  "REGISTRO_DUPLICADO",
]);

// ======================= ESTADOS DE PUNTO (seccional) =======================
export const ESTADO_PUNTO_LABEL = {
  abierto: "Abierto",
  no_programado: "No programado",
  aun_no_habilitado: "Aún no habilitado",
  finalizado: "Finalizado",
  cerrado_manual: "Cerrado",
  inactivo: "Inactivo",
};

export const puntoSeleccionable = (estado) => estado === "abierto";

// ======================= GEOLOCALIZACIÓN =======================
// Wrapper en Promise de la Geolocation API. La validación real de perímetro la hace
// siempre validar_ubicacion_asistencia en el servidor — acá solo se obtiene el dato
// crudo del dispositivo para enviarlo.
export const obtenerUbicacionActual = () =>
  new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("GEOLOCALIZACION_NO_SOPORTADA"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          latitud: pos.coords.latitude,
          longitud: pos.coords.longitude,
          precisionMetros: pos.coords.accuracy ?? null,
        });
      },
      (err) => {
        const codigoPorTipo = {
          1: "GEOLOCALIZACION_PERMISO_DENEGADO", // PERMISSION_DENIED
          2: "GEOLOCALIZACION_NO_DISPONIBLE", // POSITION_UNAVAILABLE
          3: "GEOLOCALIZACION_TIMEOUT", // TIMEOUT
        };
        reject(new Error(codigoPorTipo[err.code] || "GEOLOCALIZACION_ERROR"));
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });

export const MENSAJE_GEOLOCALIZACION = {
  GEOLOCALIZACION_NO_SOPORTADA: "Tu navegador no admite geolocalización. Probá con otro navegador.",
  GEOLOCALIZACION_PERMISO_DENEGADO: "Activá el permiso de ubicación en tu navegador para continuar.",
  GEOLOCALIZACION_NO_DISPONIBLE: "No se pudo determinar tu ubicación. Intentá nuevamente.",
  GEOLOCALIZACION_TIMEOUT: "Se agotó el tiempo para obtener tu ubicación. Intentá nuevamente.",
  GEOLOCALIZACION_ERROR: "No se pudo obtener tu ubicación. Intentá nuevamente.",
};

export const mensajeGeolocalizacion = (codigo) => MENSAJE_GEOLOCALIZACION[codigo] || MENSAJE_GEOLOCALIZACION.GEOLOCALIZACION_ERROR;

// ======================= SANEO DE ENTRADA =======================
export const soloDigitos = (value) => (value || "").replace(/\D/g, "");

// ======================= FECHA/HORA (panel admin) =======================
// `datetime-local` siempre edita/muestra en hora LOCAL del navegador, sin
// información de zona horaria en el string. `new Date(str)` interpreta ese formato
// (sin "Z" ni offset) como hora local — por eso alcanza con toISOString()/getters
// locales para ir y volver sin alterar la hora que ve la persona en Paraguay.
export const isoATimestampLocal = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const timestampLocalAIso = (valor) => {
  if (!valor) return null;
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
};

// ======================= ROL SNAPSHOT (reportes) =======================
export const ROL_SNAPSHOT_LABEL = {
  padron: "Sin estructura asignada",
  dirigente: "Dirigente",
  coordinador: "Coordinador",
  subcoordinador: "Subcoordinador",
};

export const labelRolSnapshot = (rol) => ROL_SNAPSHOT_LABEL[rol] || rol || "Sin estructura asignada";
