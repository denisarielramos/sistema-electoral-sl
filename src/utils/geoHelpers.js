// ======================= HELPERS DE GEOLOCALIZACIÓN =======================
// Funciones puras usadas por el módulo de mapeo territorial / bitácora de visitas.
// IMPORTANTE: el resultado de una visita (confirmada/fuera_de_radio/error_gps) lo
// decide SIEMPRE la función RPC mapeo_confirmar_visita del lado del servidor — estas
// funciones se usan en el cliente solo para mostrar una distancia/estado PRELIMINAR
// mientras se confirma, nunca como fuente de verdad.

// Radio permitido y precisión GPS máxima NO se hardcodean acá: se leen de
// configuracion_mapeo vía mapeo_configuracion_actual() (ver services/mapeoService.js).

/**
 * Distancia en metros entre dos puntos (fórmula de Haversine).
 * Misma fórmula que mapeo_distancia_metros() en el SQL — se mantienen en paralelo
 * a propósito para que el valor mostrado en el cliente mientras se confirma una
 * visita coincida con el que calculará el servidor (el servidor es quien decide).
 *
 * @returns {number|null} metros, o null si falta algún dato.
 */
export const haversineDistanceMeters = (lat1, lng1, lat2, lng2) => {
  if ([lat1, lng1, lat2, lng2].some((v) => v === null || v === undefined || Number.isNaN(v))) {
    return null;
  }
  const R = 6371000; // radio terrestre medio, metros
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

/** ¿La visita cae dentro del radio permitido? (comparación preliminar, cliente). */
export const estaDentroDelRadio = (distanciaMetros, radioPermitidoMetros) => {
  if (distanciaMetros === null || distanciaMetros === undefined) return false;
  if (!radioPermitidoMetros || radioPermitidoMetros <= 0) return false;
  return distanciaMetros <= radioPermitidoMetros;
};

/** Latitud/longitud dentro de rangos válidos y no nulas/NaN. */
export const esCoordenadaValida = (lat, lng) => {
  if (lat === null || lat === undefined || lng === null || lng === undefined) return false;
  if (Number.isNaN(lat) || Number.isNaN(lng)) return false;
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
};

/** ¿La precisión GPS reportada por el dispositivo es aceptable? (metros, menor es mejor). */
export const esPrecisionGpsAceptable = (precisionMetros, precisionMaximaMetros) => {
  if (precisionMetros === null || precisionMetros === undefined) return true; // dispositivo no la reporta: no bloquear
  if (Number.isNaN(precisionMetros) || precisionMetros < 0) return false;
  if (!precisionMaximaMetros || precisionMaximaMetros <= 0) return true;
  return precisionMetros <= precisionMaximaMetros;
};

/** Formatea metros para mostrar: "35 m" o "1.2 km". */
export const formatearDistancia = (metros) => {
  if (metros === null || metros === undefined || Number.isNaN(metros)) return "Sin dato";
  if (metros >= 1000) return `${(metros / 1000).toFixed(1)} km`;
  return `${Math.round(metros)} m`;
};

/** Formatea precisión GPS para mostrar: "±12 m". */
export const formatearPrecisionGps = (metros) => {
  if (metros === null || metros === undefined || Number.isNaN(metros)) return "Sin dato";
  return `±${Math.round(metros)} m`;
};

// ======================= ESTADO VISUAL DEL HOGAR (mapa) =======================
// Deriva el estado visual a mostrar en el marcador/tarjeta del hogar a partir del
// estado de verificación de la ubicación y el resultado de su última visita.
// No es una regla de negocio nueva: solo interpreta para la UI los mismos campos
// que ya devuelve mapeo_listar_hogares (estado, ultima_visita.resultado).
export const ESTADOS_MAPA = {
  SIN_UBICACION: "sin_ubicacion",
  SIN_VISITAR: "sin_visitar",
  VISITADO: "visitado",
  FUERA_DE_RADIO: "fuera_de_radio",
  PENDIENTE_VERIFICACION: "pendiente_verificacion",
  RECHAZADO: "rechazado",
};

export const getEstadoMapaHogar = (hogar) => {
  if (!hogar) return ESTADOS_MAPA.SIN_UBICACION;
  if (hogar.latitud === null || hogar.latitud === undefined || hogar.longitud === null || hogar.longitud === undefined) {
    return ESTADOS_MAPA.SIN_UBICACION;
  }
  if (hogar.estado === "rechazado") return ESTADOS_MAPA.RECHAZADO;
  if (hogar.estado === "pendiente") return ESTADOS_MAPA.PENDIENTE_VERIFICACION;

  const resultado = hogar.ultima_visita?.resultado;
  if (resultado === "confirmada") return ESTADOS_MAPA.VISITADO;
  if (resultado === "fuera_de_radio") return ESTADOS_MAPA.FUERA_DE_RADIO;
  return ESTADOS_MAPA.SIN_VISITAR;
};

export const ESTADO_MAPA_LABEL = {
  [ESTADOS_MAPA.SIN_UBICACION]: "Sin ubicación",
  [ESTADOS_MAPA.SIN_VISITAR]: "Sin visitar",
  [ESTADOS_MAPA.VISITADO]: "Visitado",
  [ESTADOS_MAPA.FUERA_DE_RADIO]: "Fuera de radio",
  [ESTADOS_MAPA.PENDIENTE_VERIFICACION]: "Pendiente de verificación",
  [ESTADOS_MAPA.RECHAZADO]: "Ubicación rechazada",
};

// Colores de marcador (hex) — un solo lugar para todo el módulo, mapa y leyendas.
export const ESTADO_MAPA_COLOR = {
  [ESTADOS_MAPA.SIN_UBICACION]: "#94a3b8", // slate-400
  [ESTADOS_MAPA.SIN_VISITAR]: "#64748b", // slate-500
  [ESTADOS_MAPA.VISITADO]: "#10b981", // emerald-500
  [ESTADOS_MAPA.FUERA_DE_RADIO]: "#ef4444", // red-500
  [ESTADOS_MAPA.PENDIENTE_VERIFICACION]: "#f59e0b", // amber-500
  [ESTADOS_MAPA.RECHAZADO]: "#7c3aed", // violet-600
};

// ======================= LINKS DE NAVEGACIÓN EXTERNA =======================
// No requieren API key: son enlaces públicos de Google Maps / Waze.
export const buildGoogleMapsUrl = (lat, lng) => {
  if (!esCoordenadaValida(lat, lng)) return null;
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
};

export const buildWazeUrl = (lat, lng) => {
  if (!esCoordenadaValida(lat, lng)) return null;
  return `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
};
