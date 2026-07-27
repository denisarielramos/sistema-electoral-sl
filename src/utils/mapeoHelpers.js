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
} from "./estructuraHelpers.js";
import { personaCoincideConsulta, normalizeTexto } from "./busquedaHelpers.js";
import { getEstadoMapaHogar, ESTADOS_MAPA } from "./geoHelpers.js";

// Votantes visibles para currentUser en el módulo de mapeo — SOLO para conveniencia
// de UI (autocompletar a quién asociar a un hogar). Reutiliza los mismos helpers de
// alcance que ya usa el resto del dashboard; el límite de seguridad real para
// hogares/visitas lo aplican las funciones RPC mapeo_* del lado del servidor.
export const votantesDelRolEnMapeo = (estructura, currentUser) => {
  if (!currentUser) return [];
  const ci = normalizeCI(currentUser.ci);
  if (currentUser.role === "superadmin") return estructura?.votantes || [];
  if (currentUser.role === "dirigente") return getTodosVotantesDirigente(estructura, ci);
  if (currentUser.role === "coordinador") return getTodosVotantesCoord(estructura, ci);
  if (currentUser.role === "subcoordinador") return getVotantesDeSubcoord(estructura, ci);
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

// Resuelve dirigente/coordinador/subcoordinador responsables de un hogar a partir de
// sus votantes asociados (toma el primero con cada dato — en la práctica todos los
// integrantes de un mismo hogar comparten rama). `estructura` es la misma prop que ya
// usa Dashboard.jsx (dirigentes/coordinadores/subcoordinadores), para no reconsultar.
export const getJerarquiaHogar = (hogar, estructura) => {
  const votantes = hogar?.votantes || [];
  const dirigenteCI = normalizeCI(votantes.find((v) => v.dirigente_ci)?.dirigente_ci);
  const coordinadorCI = normalizeCI(votantes.find((v) => v.coordinador_ci)?.coordinador_ci);
  const subVotante = votantes.find((v) => v.asignado_por_rol === "subcoordinador");
  const subcoordinadorCI = normalizeCI(subVotante?.asignado_por);

  const dirigente = dirigenteCI
    ? (estructura?.dirigentes || []).find((d) => normalizeCI(d.ci) === dirigenteCI)
    : null;
  const coordinador = coordinadorCI
    ? (estructura?.coordinadores || []).find((c) => normalizeCI(c.ci) === coordinadorCI)
    : null;
  const subcoordinador = subcoordinadorCI
    ? (estructura?.subcoordinadores || []).find((s) => normalizeCI(s.ci) === subcoordinadorCI)
    : null;

  return { dirigente, coordinador, subcoordinador };
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
      const jerarquia = getJerarquiaHogar(hogar, estructura);
      if (dirigenteCI && normalizeCI(jerarquia.dirigente?.ci) !== normalizeCI(dirigenteCI)) return false;
      if (coordinadorCI && normalizeCI(jerarquia.coordinador?.ci) !== normalizeCI(coordinadorCI)) return false;
      if (subcoordinadorCI && normalizeCI(jerarquia.subcoordinador?.ci) !== normalizeCI(subcoordinadorCI)) return false;
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
