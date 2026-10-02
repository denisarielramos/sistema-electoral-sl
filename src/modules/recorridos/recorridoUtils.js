// ======================= HELPERS PUROS DEL MÓDULO DE RECORRIDOS =======================
// Traducción de códigos de error a texto en español, saneo de entrada y una
// distancia Haversine propia del módulo. Ninguna función de este archivo decide
// nada sobre paradas/alertas/km — eso es siempre del backend (recorrido_procesar_punto);
// acá solo se usa la distancia para la decisión LOCAL de "¿vale la pena encolar
// este punto nuevo?" (ver recorridoBuffer.js), que es una decisión de ahorro de
// batería/datos, no de seguridad ni de negocio.
//
// Nota de aislamiento: se duplica una Haversine propia en vez de importar
// src/utils/geoHelpers.js (del módulo de mapeo) para que este módulo pueda
// borrarse sin dejar ninguna dependencia cruzada — mismo criterio ya aplicado en
// la migración SQL (recorrido_distancia_metros no reutiliza nada de mapeo).

// `codigo` viaja siempre en `data.codigo` de la respuesta jsonb de las RPC (nunca
// en `error.message` de Supabase JS). "ERROR_TECNICO" es sintético: lo agrega
// recorridoService cuando la RPC falla por un motivo técnico (red/PostgREST) en
// vez de una validación funcional.
export const ERROR_MESSAGES = {
  CI_INVALIDO: "La cédula ingresada no es válida.",
  ASIGNACION_NO_ENCONTRADA: "No encontramos una asignación activa para esta cédula en la jornada actual.",
  CODIGO_EXPIRADO: "El código de recorrido expiró. Solicitá uno nuevo al organizador.",
  CODIGO_INVALIDO: "El código ingresado no es correcto.",
  SESION_INVALIDA_O_VENCIDA: "Tu sesión expiró o no es válida. Iniciá sesión nuevamente.",
  SESION_FINALIZADA: "Este recorrido ya fue finalizado.",
  PUNTOS_INVALIDOS: "No se pudieron procesar los puntos de ubicación. Se reintentará automáticamente.",
  PUNTOS_VACIO: "No hay puntos de ubicación para enviar todavía.",
  PUNTOS_EXCEDEN_LIMITE: "Se intentó enviar demasiados puntos de una vez. Se reintentará en lotes más pequeños.",
  ERROR_TECNICO: "No se pudo conectar. Verificá tu conexión e intentá nuevamente.",
};

const MENSAJE_GENERICO = "Ocurrió un problema al procesar la solicitud. Intentá nuevamente.";

// Nunca se devuelve un código ni un mensaje crudo de Postgres/PostgREST: ante un
// código no reconocido, se usa el mensaje genérico.
export const mensajeError = (codigo) => ERROR_MESSAGES[codigo] || MENSAJE_GENERICO;

// ======================= GEOLOCALIZACIÓN: traducción de errores =======================
export const GEO_ERROR_CODE = {
  1: "PERMISO_DENEGADO", // PERMISSION_DENIED
  2: "POSICION_NO_DISPONIBLE", // POSITION_UNAVAILABLE
  3: "TIEMPO_AGOTADO", // TIMEOUT
};

export const MENSAJE_GEO_ERROR = {
  PERMISO_DENEGADO: "No pudimos acceder a tu ubicación. Activá el permiso de ubicación para este sitio en la configuración de tu navegador y volvé a intentar.",
  POSICION_NO_DISPONIBLE: "No se pudo determinar tu ubicación todavía. Buscando señal GPS…",
  TIEMPO_AGOTADO: "Se agotó el tiempo para obtener tu ubicación. Buscando señal GPS…",
  NO_SOPORTADO: "Tu navegador no admite geolocalización. Probá con otro navegador.",
};

export const mensajeGeoError = (codigo) => MENSAJE_GEO_ERROR[codigo] || MENSAJE_GEO_ERROR.POSICION_NO_DISPONIBLE;

// ======================= SANEO DE ENTRADA =======================
export const soloDigitos = (value) => (value || "").replace(/\D/g, "");

// ======================= DISTANCIA (Haversine) =======================
export const distanciaMetros = (lat1, lng1, lat2, lng2) => {
  const R = 6371000; // radio de la Tierra en metros
  const rad = (deg) => (deg * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// ======================= FORMATO DE HORA (local, nunca coordenadas crudas) =======================
export const formatearHoraLocal = (fechaOIso) => {
  if (!fechaOIso) return "—";
  const d = fechaOIso instanceof Date ? fechaOIso : new Date(fechaOIso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString();
};
