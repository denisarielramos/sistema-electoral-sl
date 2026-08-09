// ======================= HELPERS DE ESTRUCTURA =======================

// Normaliza CI (solo números)
export const normalizeCI = (ci) =>
  String(ci || "").replace(/\D/g, "");

// Normaliza ROL (texto en minúsculas, sin espacios) — NUNCA usar normalizeCI para roles
export const normalizeRole = (value) =>
  String(value ?? "").trim().toLowerCase();

// Extrae un CI normalizado de un string CI o de un objeto { ci }
const resolveCI = (input) =>
  typeof input === "object" && input !== null ? normalizeCI(input.ci) : normalizeCI(input);

// ¿El registro está activo? (los registros sin campo activo se consideran activos)
const esActivo = (r) => r.activo !== false;

// ======================= SUBCOORDINADORES DEL COORD =======================
// coordCI puede ser un string CI normalizado o un objeto { ci, role }
export const getMisSubcoordinadores = (estructura, coordCI) => {
  if (!coordCI) return [];
  const ci = resolveCI(coordCI);
  return (estructura.subcoordinadores || []).filter(
    (s) => esActivo(s) && normalizeCI(s.coordinador_ci) === ci
  );
};

// ======================= VOTANTES DE UN SUBCOORD =======================
// Exige asignado_por === subCi y, cuando exista asignado_por_rol, que sea "subcoordinador".
export const getVotantesDeSubcoord = (estructura, subCi) => {
  const ci = normalizeCI(subCi);
  return (estructura.votantes || []).filter((v) => {
    if (!esActivo(v)) return false;
    if (normalizeCI(v.asignado_por) !== ci) return false;
    const rol = normalizeRole(v.asignado_por_rol);
    return rol === "subcoordinador" || rol === "";
  });
};

// ======================= VOTANTES DIRECTOS DEL COORD =======================
// Estricto: asignado_por === coordCI y asignado_por_rol === "coordinador".
// Compatibilidad legacy: coordinador_ci === coordCI y asignado_por_rol vacío.
// NUNCA incluye votantes asignados por subcoordinadores.
export const getVotantesDirectosCoord = (estructura, coordCI) => {
  if (!coordCI) return [];
  const ci = resolveCI(coordCI);
  return (estructura.votantes || []).filter((v) => {
    if (!esActivo(v)) return false;
    const rol = normalizeRole(v.asignado_por_rol);
    const estricto = normalizeCI(v.asignado_por) === ci && rol === "coordinador";
    const legacy = normalizeCI(v.coordinador_ci) === ci && rol === "";
    return estricto || legacy;
  });
};

// ======================= MIS VOTANTES (coordinador) =======================
// Alias semántico: votantes directos del coordinador.
export const getMisVotantes = (estructura, coordCI) => getVotantesDirectosCoord(estructura, coordCI);

// ======================= TODOS LOS VOTANTES DE UN COORDINADOR =======================
// Directos + los de todos sus subcoordinadores. Usa coordinador_ci (poblado en toda
// alta de votante, sea directa del coordinador o vía uno de sus subs) para que el
// total coincida exactamente con "Total Red" del PDF del coordinador (pdfService.js).
// Además une, por dato legacy sin coordinador_ci poblado:
// - los directos "estrictos" (getVotantesDirectosCoord: asignado_por + asignado_por_rol
//   === "coordinador"), y
// - los de cada subcoordinador (getVotantesDeSubcoord: asignado_por + asignado_por_rol
//   === "subcoordinador") — igual visibles en el árbol/PDF bajo ese sub, así que también
//   deben contarse acá.
// Dedup por CI elemento a elemento (Map), no por lote: dos filas con la misma CI dentro
// del mismo candidato (p. ej. una fila de padrón duplicada) también deben colapsar a una.
export const getTodosVotantesCoord = (estructura, coordCI) => {
  if (!coordCI) return [];
  const ci = resolveCI(coordCI);
  const resultado = new Map();
  const agregar = (candidatos) => {
    for (const v of candidatos) {
      const vci = normalizeCI(v.ci);
      if (!resultado.has(vci)) resultado.set(vci, v);
    }
  };
  agregar((estructura.votantes || []).filter((v) => esActivo(v) && normalizeCI(v.coordinador_ci) === ci));
  agregar(getVotantesDirectosCoord(estructura, ci));
  agregar(getMisSubcoordinadores(estructura, ci).flatMap((s) => getVotantesDeSubcoord(estructura, normalizeCI(s.ci))));
  return [...resultado.values()];
};

// ======================= PERSONAS DISPONIBLES =======================
export const getPersonasDisponibles = (padron, estructura) => {
  const indexar = (rows = []) => {
    const map = new Map();
    for (const row of rows) map.set(normalizeCI(row.ci), row);
    return map;
  };

  const dirigentesByCI = indexar(estructura.dirigentes);
  const coordinadoresByCI = indexar(estructura.coordinadores);
  const subcoordinadoresByCI = indexar(estructura.subcoordinadores);
  const votantesByCI = indexar(estructura.votantes);

  return padron.map((p) => {
    const ci = normalizeCI(p.ci);
    const dir = dirigentesByCI.get(ci);
    const coord = coordinadoresByCI.get(ci);
    const sub = subcoordinadoresByCI.get(ci);
    const vot = votantesByCI.get(ci);

    let rol = null;
    if (dir) rol = "dirigente";
    else if (coord) rol = "coordinador";
    else if (sub) rol = "subcoordinador";
    else if (vot) rol = "votante";

    return {
      ...p,
      ci,
      asignado: rol !== null,
      asignadoRol: rol,
      asignadoPorNombre:
        dir?.asignado_por_nombre ||
        sub?.asignado_por_nombre ||
        vot?.asignado_por_nombre ||
        "",
    };
  });
};

// ======================= HELPERS DIRIGENTE =======================

// Coordinadores bajo un dirigente
export const getCoordsDeDigente = (estructura, dirigenteCI) => {
  return (estructura.coordinadores || []).filter(
    (c) => normalizeCI(c.dirigente_ci) === normalizeCI(dirigenteCI)
  );
};

// Subcoordinadores dentro de la rama de un dirigente
export const getSubsDeDigente = (estructura, dirigenteCI) => {
  const coords = getCoordsDeDigente(estructura, dirigenteCI);
  const coordCIs = new Set(coords.map((c) => normalizeCI(c.ci)));
  return (estructura.subcoordinadores || []).filter(
    (s) => coordCIs.has(normalizeCI(s.coordinador_ci))
  );
};

// Votantes directos del dirigente
export const getVotantesDirectosDirigente = (estructura, dirigenteCI) => {
  return (estructura.votantes || []).filter(
    (v) =>
      esActivo(v) &&
      normalizeCI(v.dirigente_ci) === normalizeCI(dirigenteCI) &&
      normalizeRole(v.asignado_por_rol) === "dirigente"
  );
};

// Todos los votantes dentro de la rama de un dirigente (directos + de coords + de subs).
// Usa dirigente_ci, pero además une los conjuntos completos (getTodosVotantesCoord) de
// cada uno de sus coordinadores: un votante directo "estricto" de un coordinador
// (asignado_por + asignado_por_rol === "coordinador") puede, por dato legacy, no tener
// dirigente_ci poblado — igual aparece en el PDF/Excel del coordinador y en la sección
// de ese coordinador dentro del PDF del dirigente, así que también debe contarse acá.
// Dedup por CI elemento a elemento (Map), no por lote — ver getTodosVotantesCoord.
export const getTodosVotantesDirigente = (estructura, dirigenteCI) => {
  const dirCI = normalizeCI(dirigenteCI);
  const resultado = new Map();
  const agregar = (candidatos) => {
    for (const v of candidatos) {
      const vci = normalizeCI(v.ci);
      if (!resultado.has(vci)) resultado.set(vci, v);
    }
  };
  agregar((estructura.votantes || []).filter((v) => normalizeCI(v.dirigente_ci) === dirCI));
  agregar(getCoordsDeDigente(estructura, dirCI).flatMap((c) => getTodosVotantesCoord(estructura, normalizeCI(c.ci))));
  return [...resultado.values()];
};

// ======================= ESTRUCTURA PROPIA =======================
export const getEstructuraPropia = (estructura, currentUser) => {
  if (!currentUser) {
    return {
      isCoord: false,
      misSubcoords: [],
      misVotantes: [],
      votantesIndirectos: 0,
      totalVotos: 0,
    };
  }

  const isCoord = currentUser.role === "coordinador";
  const isSub = currentUser.role === "subcoordinador";

  let misSubcoords = [];
  let misVotantes = [];

  if (isCoord) {
    misSubcoords = getMisSubcoordinadores(estructura, currentUser);
    misVotantes = getMisVotantes(estructura, currentUser);
  } else if (isSub) {
    // Para subcoordinador sus votantes son los que él asignó
    misVotantes = getVotantesDeSubcoord(estructura, normalizeCI(currentUser.ci));
  }

  const votantesIndirectos = isCoord
    ? misSubcoords.reduce(
        (acc, s) =>
          acc + getVotantesDeSubcoord(estructura, s.ci).length,
        0
      )
    : 0;

  const totalVotos = misVotantes.length + votantesIndirectos;

  return { isCoord, misSubcoords, misVotantes, votantesIndirectos, totalVotos };
};
