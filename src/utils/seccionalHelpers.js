// ======================= MAPEO DE SECCIONAL (SOLO FRONTEND) =======================
// No existe columna "seccional" confiable en `padron` / Supabase para esto — la
// clasificación se hace acá, en el cliente, a partir del valor EXACTO que hoy tiene
// `local_votacion`. No usar `local_codigo`. Si un local no está en el mapeo, se
// considera "sin seccional" (obtenerSeccional devuelve null) y NUNCA se descarta al
// que lo tenga — solo se muestra agrupado aparte, como "Sin seccional".

// Clave: local_votacion EXACTO tal como viene de `padron`. Valor: 1 | 2 | 3 | 4.
const SECCIONAL_POR_LOCAL = {
  // ---- Seccional 1 ----
  "ESC.NRO.260 TOMASA DE MEZA": 1,
  "COL.NAC.DE EMD.SATURIO RIOS": 1,
  "ESC. NRO. 118 LUIS CAMINO": 1,
  "ESC. NRO. 23 ESPAÑA/COLEGIO NACIONAL ESPAÑA": 1,
  "COL.NAC.JOSE DOLORES GONZALEZ": 1,
  "COL.NAC.CONCEPCION L. DE CHAVEZ": 1,
  "COL.AGUSTIN FERNANDO DE PINEDO": 1,
  "ESC. NRO. 601 RITA S. BENITEZ": 1,

  // ---- Seccional 2 ----
  "LIC. NAC. CHOFERES DEL CHACO": 2,
  "COL.NAC.SGTO.CANDIDO SILVA": 2,
  "ESC.NRO. 819 JUAN PABLO ZARACHO": 2,
  "LIC. SAN MIGUEL": 2,

  // ---- Seccional 3 ----
  "ESC.NRO.598 PARROQUIAL DOMINGO SAVIO": 3,
  // Compatibilidad: variante vieja "SABIO" que existió en padron_import_sl_2026 y
  // ya fue corregida en Supabase. Un navegador con el padrón completo cacheado en
  // IndexedDB desde antes de esa corrección puede seguir enviando este valor —
  // ver cargarPadron()/padronMap en Dashboard.jsx (el refresco del caché solo se
  // dispara si cambia la cantidad total de filas, no si cambia un valor existente).
  "ESC.NRO.598 PARROQUIAL DOMINGO SABIO": 3,
  "COL.NAC.SAN RAFAEL": 3,
  "ESC.BASICA NRO 4181 SAN ANTONIO DE PADUA/COL. NAC. SAN ANTONIO DE PADUA": 3,
  "ESC.FAMILIA DE NAZARETH PRIV.PARROQ. SUBV. 4197": 3,
  "ESC. NRO. 264 CLOTILDE PAREDES": 3,
  "ESC.VIRGEN DE FATIMA NRO 4181": 3,

  // ---- Seccional 4 ----
  "ESC.BASICA NRO.4174 ANAHI": 4,
  "COL.NAC.MCAL.ESTIGARRIBIA/ESC.BASICA NRO.276 MCALJ.FELIX ESTIGARRIBIA": 4,
  "LIC.NAC.ACOSTA ÑU": 4,
  "ESC.NRO. 2393 JORGE A.GADEA": 4,
  "ESC.2121 INMACULADA CONCEPCION": 4,
};

// Nombre corto para mostrar en pantalla. Si un local no está acá, se muestra tal
// cual viene de `local_votacion` (nunca se inventa ni se oculta el dato real).
const NOMBRE_VISUAL_LOCAL = {
  "ESC.NRO.260 TOMASA DE MEZA": "Tomasa F. de Mesa",
  "COL.NAC.DE EMD.SATURIO RIOS": "Saturio Ríos",
  "ESC. NRO. 118 LUIS CAMINO": "Luis Camino",
  "ESC. NRO. 23 ESPAÑA/COLEGIO NACIONAL ESPAÑA": "Nac. España",
  "COL.NAC.JOSE DOLORES GONZALEZ": "José Dolores",
  "COL.NAC.CONCEPCION L. DE CHAVEZ": "Concepción Leyes de Chaves",
  "COL.AGUSTIN FERNANDO DE PINEDO": "Agustín Fernando Pinedo",
  "ESC. NRO. 601 RITA S. BENITEZ": "Rita Surroca de Benítez",

  "LIC. NAC. CHOFERES DEL CHACO": "Choferes del Chaco",
  "COL.NAC.SGTO.CANDIDO SILVA": "Sgto. Cándido Silva",
  "ESC.NRO. 819 JUAN PABLO ZARACHO": "Juan Pablo Zaracho",
  "LIC. SAN MIGUEL": "San Miguel",

  "ESC.NRO.598 PARROQUIAL DOMINGO SAVIO": "Domingo Savio",
  // Misma variante vieja de arriba: visualmente siempre debe leerse "Domingo Savio".
  "ESC.NRO.598 PARROQUIAL DOMINGO SABIO": "Domingo Savio",
  "COL.NAC.SAN RAFAEL": "San Rafael",
  "ESC.BASICA NRO 4181 SAN ANTONIO DE PADUA/COL. NAC. SAN ANTONIO DE PADUA": "San Antonio de Padua",
  "ESC.FAMILIA DE NAZARETH PRIV.PARROQ. SUBV. 4197": "Familia de Nazaret",
  "ESC. NRO. 264 CLOTILDE PAREDES": "Clotilde Paredes",
  "ESC.VIRGEN DE FATIMA NRO 4181": "Virgen de Fátima",

  "ESC.BASICA NRO.4174 ANAHI": "Anahí",
  "COL.NAC.MCAL.ESTIGARRIBIA/ESC.BASICA NRO.276 MCALJ.FELIX ESTIGARRIBIA": "Mcal. Estigarribia",
  "LIC.NAC.ACOSTA ÑU": "Acosta Ñu",
  "ESC.NRO. 2393 JORGE A.GADEA": "Gadea",
  "ESC.2121 INMACULADA CONCEPCION": "Inmaculada Concepción",
};

export const SIN_SECCIONAL = "sin";

export const SECCIONAL_LABELS = {
  1: "Seccional 1",
  2: "Seccional 2",
  3: "Seccional 3",
  4: "Seccional 4",
  [SIN_SECCIONAL]: "Sin seccional",
};

// Lista de seccionales válidas, para poblar el <select> del filtro sin hardcodear
// nada más que esto (que es justamente la fuente de verdad del mapeo).
export const SECCIONALES_DISPONIBLES = [1, 2, 3, 4];

// obtenerSeccional(localVotacion) -> 1 | 2 | 3 | 4 | null
// Devuelve null si el local no está mapeado (no se descarta al llamador: debe
// mostrarse igual, agrupado como "Sin seccional").
export const obtenerSeccional = (localVotacion) => {
  if (localVotacion === null || localVotacion === undefined) return null;
  const key = String(localVotacion).trim();
  if (!key) return null;
  return SECCIONAL_POR_LOCAL[key] ?? null;
};

// nombreVisualLocal(localVotacion) -> nombre corto para UI, o el valor original si
// no hay un nombre corto mapeado para ese local.
export const nombreVisualLocal = (localVotacion) => {
  if (localVotacion === null || localVotacion === undefined) return localVotacion;
  const key = String(localVotacion).trim();
  return NOMBRE_VISUAL_LOCAL[key] || localVotacion;
};
