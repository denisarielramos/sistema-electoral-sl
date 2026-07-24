// ======================= HELPERS DE ESTRUCTURA =======================

// Normaliza CI (solo números)
export const normalizeCI = (ci) =>
  String(ci || "").replace(/\D/g, "");

// ======================= SUBCOORDINADORES DEL COORD =======================
export const getMisSubcoordinadores = (estructura, currentUser) => {
  if (!currentUser || currentUser.role !== "coordinador") return [];

  return estructura.subcoordinadores.filter(
    (s) => normalizeCI(s.coordinador_ci) === normalizeCI(currentUser.ci)
  );
};

// ======================= VOTANTES DE UN SUBCOORD =======================
export const getVotantesDeSubcoord = (estructura, subCi) => {
  return estructura.votantes.filter(
    (v) => normalizeCI(v.asignado_por) === normalizeCI(subCi)
  );
};

// ======================= MIS VOTANTES =======================
export const getMisVotantes = (estructura, currentUser) => {
  if (!currentUser) return [];

  return estructura.votantes.filter(
    (v) => normalizeCI(v.asignado_por) === normalizeCI(currentUser.ci)
  );
};

// ======================= VOTANTES DIRECTOS DEL COORD =======================
export const getVotantesDirectosCoord = (estructura, coordCi) => {
  return estructura.votantes.filter(
    (v) => normalizeCI(v.asignado_por) === normalizeCI(coordCi)
  );
};

// ======================= PERSONAS DISPONIBLES =======================
export const getPersonasDisponibles = (padron, estructura) => {
  return padron.map((p) => {
    const ci = normalizeCI(p.ci);

    const dir = (estructura.dirigentes || []).find(
      (d) => normalizeCI(d.ci) === ci
    );
    const coord = estructura.coordinadores.find(
      (c) => normalizeCI(c.ci) === ci
    );
    const sub = estructura.subcoordinadores.find(
      (s) => normalizeCI(s.ci) === ci
    );
    const vot = estructura.votantes.find(
      (v) => normalizeCI(v.ci) === ci
    );

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
      normalizeCI(v.dirigente_ci) === normalizeCI(dirigenteCI) &&
      normalizeCI(v.asignado_por_rol) === "dirigente"
  );
};

// Todos los votantes dentro de la rama de un dirigente (directos + de coords + de subs)
export const getTodosVotantesDirigente = (estructura, dirigenteCI) => {
  return (estructura.votantes || []).filter(
    (v) => normalizeCI(v.dirigente_ci) === normalizeCI(dirigenteCI)
  );
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
    misVotantes = getMisVotantes(estructura, currentUser);
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
