// ======================= HELPERS: MAPEO TERRITORIAL =======================
// Filtrado, búsqueda y estadísticas sobre los hogares que ya devolvió
// mapeo_listar_hogares (el alcance jerárquico ya viene resuelto del servidor — estas
// funciones NO son un límite de seguridad, son conveniencia de UI sobre datos que el
// usuario ya tiene permitido ver).
import {
  normalizeCI,
  getTodosVotantesDirigente,
  getTodosVotantesCoord,
  getVotantesDeSubcoord,
  getCoordsDeDigente,
  getSubsDeDigente,
  getMisSubcoordinadores,
} from "./estructuraHelpers.js";
import { personaCoincideConsulta, normalizeTexto } from "./busquedaHelpers.js";
import { getEstadoMapaHogar, ESTADOS_MAPA } from "./geoHelpers.js";

// Etiquetas para el "rol actual" que devuelve el servidor (mapeo_persona_info) junto
// a cada integrante de un hogar — dirigente/coordinador/subcoordinador/votante.
export const ROL_INTEGRANTE_LABEL = {
  dirigente: "Dirigente",
  coordinador: "Coordinador",
  subcoordinador: "Subcoordinador",
  votante: "Votante",
};

// Combina varios grupos { rol, personas } (en orden de prioridad) en una sola lista
// sin CIs repetidas, etiquetando cada persona con su rol. Si la misma CI aparece en
// más de un grupo (p. ej. un votante ascendido a coordinador cuya fila vieja en
// votantes nunca se limpió), se queda con la del grupo de MAYOR jerarquía (el primero
// de la lista que la contenga) — mismo criterio de prioridad que usa el servidor
// (mapeo_persona_rol_prioritario): dirigente > coordinador > subcoordinador > votante.
const combinarConRolYDedup = (gruposPorRol) => {
  const porCI = new Map();
  for (const { rol, personas } of gruposPorRol) {
    for (const p of personas) {
      const ci = normalizeCI(p.ci);
      if (!ci || porCI.has(ci)) continue;
      porCI.set(ci, { ...p, ci, rol });
    }
  }
  return [...porCI.values()];
};

// Personas de CUALQUIERA de las 4 jerarquías (dirigente/coordinador/subcoordinador/
// votante) disponibles para asociar a un hogar, según el alcance de currentUser —
// SOLO para conveniencia de UI (autocompletar el buscador de integrantes). Reutiliza
// los mismos helpers de alcance que ya usa el resto del dashboard; el límite de
// seguridad real lo aplican mapeo_persona_en_alcance/mapeo_asociar_votante del lado
// del servidor. Cada actor no-superadmin puede además agregarse a SÍ MISMO (un
// dirigente/coordinador/subcoordinador también es elector y puede vivir en un hogar
// mapeado), por eso se incluye su propio registro en cada rama.
export const personasDelRolEnMapeo = (estructura, currentUser) => {
  if (!currentUser) return [];
  const ci = normalizeCI(currentUser.ci);

  if (currentUser.role === "superadmin") {
    return combinarConRolYDedup([
      { rol: "dirigente", personas: estructura?.dirigentes || [] },
      { rol: "coordinador", personas: estructura?.coordinadores || [] },
      { rol: "subcoordinador", personas: estructura?.subcoordinadores || [] },
      { rol: "votante", personas: estructura?.votantes || [] },
    ]);
  }

  if (currentUser.role === "dirigente") {
    const propio = (estructura?.dirigentes || []).find((d) => normalizeCI(d.ci) === ci);
    return combinarConRolYDedup([
      { rol: "dirigente", personas: propio ? [propio] : [] },
      { rol: "coordinador", personas: getCoordsDeDigente(estructura, ci) },
      { rol: "subcoordinador", personas: getSubsDeDigente(estructura, ci) },
      { rol: "votante", personas: getTodosVotantesDirigente(estructura, ci) },
    ]);
  }

  if (currentUser.role === "coordinador") {
    const propio = (estructura?.coordinadores || []).find((c) => normalizeCI(c.ci) === ci);
    return combinarConRolYDedup([
      { rol: "coordinador", personas: propio ? [propio] : [] },
      { rol: "subcoordinador", personas: getMisSubcoordinadores(estructura, ci) },
      { rol: "votante", personas: getTodosVotantesCoord(estructura, ci) },
    ]);
  }

  if (currentUser.role === "subcoordinador") {
    const propio = (estructura?.subcoordinadores || []).find((s) => normalizeCI(s.ci) === ci);
    return combinarConRolYDedup([
      { rol: "subcoordinador", personas: propio ? [propio] : [] },
      { rol: "votante", personas: getVotantesDeSubcoord(estructura, ci) },
    ]);
  }

  return [];
};

// CIs de votantes que ya pertenecen a algún hogar activo (excluyendo, opcionalmente,
// un hogar puntual — para permitir "re-agregar" dentro del mismo hogar que se está
// editando). Espejo en JS de la restricción real (índice único parcial
// ux_hogar_votantes_votante_activo en la base): un votante no puede estar en más de
// un hogar activo a la vez.
export const construirVotantesEnHogarActivo = (hogares, excluirHogarId = null) => {
  const set = new Set();
  for (const hogar of hogares || []) {
    if (hogar.id === excluirHogarId) continue;
    for (const votante of hogar.votantes || []) {
      set.add(normalizeCI(votante.ci));
    }
  }
  return set;
};

// Resuelve dirigente/coordinador/subcoordinador de UN votante a partir de sus propios
// campos (dirigente_ci, coordinador_ci, asignado_por + asignado_por_rol).
const getJerarquiaVotante = (v, estructura) => {
  const dirigenteCI = normalizeCI(v?.dirigente_ci);
  const coordinadorCI = normalizeCI(v?.coordinador_ci);
  const subcoordinadorCI = v?.asignado_por_rol === "subcoordinador" ? normalizeCI(v?.asignado_por) : "";

  return {
    dirigente: dirigenteCI ? (estructura?.dirigentes || []).find((d) => normalizeCI(d.ci) === dirigenteCI) : null,
    coordinador: coordinadorCI ? (estructura?.coordinadores || []).find((c) => normalizeCI(c.ci) === coordinadorCI) : null,
    subcoordinador: subcoordinadorCI ? (estructura?.subcoordinadores || []).find((s) => normalizeCI(s.ci) === subcoordinadorCI) : null,
  };
};

// Resuelve dirigente/coordinador/subcoordinador "representativos" de un hogar, para
// MOSTRAR en la tarjeta/detalle (toma el primer votante con cada dato — en la
// práctica todos los integrantes de un mismo hogar suelen compartir rama). Para
// FILTRAR por jerarquía use hogarTieneJerarquia(), que evalúa cada votante por
// separado en vez de reducir el hogar a una sola tupla — un hogar compartido entre
// ramas no debe desaparecer de los filtros solo porque el primer votante embebido no
// es el que coincide.
export const getJerarquiaHogar = (hogar, estructura) => {
  const votantes = hogar?.votantes || [];
  const conDirigente = votantes.find((v) => v.dirigente_ci);
  const conCoordinador = votantes.find((v) => v.coordinador_ci);
  const conSubcoordinador = votantes.find((v) => v.asignado_por_rol === "subcoordinador");

  return {
    dirigente: conDirigente ? getJerarquiaVotante(conDirigente, estructura).dirigente : null,
    coordinador: conCoordinador ? getJerarquiaVotante(conCoordinador, estructura).coordinador : null,
    subcoordinador: conSubcoordinador ? getJerarquiaVotante(conSubcoordinador, estructura).subcoordinador : null,
  };
};

// ¿Algún votante del hogar coincide con los filtros de jerarquía dados? A diferencia
// de getJerarquiaHogar (que resume el hogar a una tupla para mostrar), esto evalúa
// cada votante por separado — necesario para que filtrarHogares no excluya un hogar
// compartido entre ramas cuando el votante que coincide no es el primero embebido.
export const hogarTieneJerarquia = (hogar, { dirigenteCI = "", coordinadorCI = "", subcoordinadorCI = "" }, estructura) => {
  const votantes = hogar?.votantes || [];
  if (votantes.length === 0) return false;
  return votantes.some((v) => {
    const j = getJerarquiaVotante(v, estructura);
    if (dirigenteCI && normalizeCI(j.dirigente?.ci) !== normalizeCI(dirigenteCI)) return false;
    if (coordinadorCI && normalizeCI(j.coordinador?.ci) !== normalizeCI(coordinadorCI)) return false;
    if (subcoordinadorCI && normalizeCI(j.subcoordinador?.ci) !== normalizeCI(subcoordinadorCI)) return false;
    return true;
  });
};

const nombreCompleto = (p) => `${p?.nombre || ""} ${p?.apellido || ""}`.trim();

// query: nombre/apellido/CI/teléfono de algún votante del hogar, O dirección/referencia.
export const hogarCoincideConsulta = (hogar, query) => {
  if (!query || !query.trim()) return true;
  const votantes = hogar?.votantes || [];
  if (votantes.some((v) => personaCoincideConsulta(v, query))) return true;

  const q = normalizeTexto(query);
  const direccion = normalizeTexto(hogar?.direccion);
  const referencia = normalizeTexto(hogar?.referencia);
  const nombreFamilia = normalizeTexto(hogar?.nombre_familia);
  return direccion.includes(q) || referencia.includes(q) || nombreFamilia.includes(q);
};

// filtros: { query, dirigenteCI, coordinadorCI, subcoordinadorCI, estadoMapeo, estadoVisita }
export const filtrarHogares = (hogares, filtros, estructura) => {
  const {
    query = "",
    dirigenteCI = "",
    coordinadorCI = "",
    subcoordinadorCI = "",
    estadoMapeo = "",
    estadoVisita = "",
  } = filtros || {};

  return (hogares || []).filter((hogar) => {
    if (!hogarCoincideConsulta(hogar, query)) return false;

    if (dirigenteCI || coordinadorCI || subcoordinadorCI) {
      if (!hogarTieneJerarquia(hogar, { dirigenteCI, coordinadorCI, subcoordinadorCI }, estructura)) return false;
    }

    if (estadoMapeo && hogar.estado !== estadoMapeo) return false;

    if (estadoVisita) {
      const estadoVisual = getEstadoMapaHogar(hogar);
      if (estadoVisita !== estadoVisual) return false;
    }

    return true;
  });
};

// Resuelve nombre completo de un actor (visitante de una visita, o creado_por/
// verificado_por de un hogar) por ci+rol contra estructura ya en memoria. Superadmin
// no está en ninguna tabla — se muestra "Superadmin" sin nombre propio.
export const resolverNombreActor = (ci, rol, estructura) => {
  const ciNorm = normalizeCI(ci);
  if (rol === "superadmin") return "Superadmin";
  const tabla = { dirigente: "dirigentes", coordinador: "coordinadores", subcoordinador: "subcoordinadores" }[rol];
  if (!tabla) return ciNorm;
  const persona = (estructura?.[tabla] || []).find((p) => normalizeCI(p.ci) === ciNorm);
  return persona ? nombreCompleto(persona) || ciNorm : ciNorm;
};

// Igual que getJerarquiaHogar, pero a partir de los votantes embebidos en una VISITA
// (mapeo_listar_visitas también los incluye) — para la bitácora, que no siempre tiene
// el hogar completo a mano.
export const getJerarquiaVisita = (visita, estructura) => getJerarquiaHogar({ votantes: visita?.votantes }, estructura);

// Igual que hogarTieneJerarquia, pero para filtrar la bitácora de visitas.
export const visitaTieneJerarquia = (visita, filtros, estructura) =>
  hogarTieneJerarquia({ votantes: visita?.votantes }, filtros, estructura);

// Tarjetas estadísticas del módulo — a partir de la misma lista ya scopeada.
export const calcularEstadisticasMapeo = (hogares) => {
  const lista = hogares || [];
  const total = lista.length;
  const mapeados = lista.filter((h) => h.latitud !== null && h.latitud !== undefined).length;
  const pendientesVerificar = lista.filter((h) => h.estado === "pendiente").length;

  let visitados = 0;
  let noVisitados = 0;
  let fueraDeRadio = 0;
  for (const hogar of lista) {
    const estado = getEstadoMapaHogar(hogar);
    if (estado === ESTADOS_MAPA.VISITADO) visitados += 1;
    else if (estado === ESTADOS_MAPA.FUERA_DE_RADIO) fueraDeRadio += 1;
    else if (estado === ESTADOS_MAPA.SIN_VISITAR) noVisitados += 1;
  }

  return { total, mapeados, pendientesVerificar, visitados, noVisitados, fueraDeRadio };
};
