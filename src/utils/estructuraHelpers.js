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
  // Build O(1) lookup maps to avoid nested .find() inside .map()
  const coordMap = new Map(
    (estructura.coordinadores || []).map((c) => [normalizeCI(c.ci), c])
  );
  const subMap = new Map(
    (estructura.subcoordinadores || []).map((s) => [normalizeCI(s.ci), s])
  );
  const votMap = new Map(
    (estructura.votantes || []).map((v) => [normalizeCI(v.ci), v])
  );

  return padron.map((p) => {
    const ci = normalizeCI(p.ci);
    const coord = coordMap.get(ci);
    const sub = subMap.get(ci);
    const vot = votMap.get(ci);

    let rol = null;
    if (coord) rol = "coordinador";
    else if (sub) rol = "subcoordinador";
    else if (vot) rol = "votante";

    return {
      ...p,
      ci,
      asignado: rol !== null,
      asignadoRol: rol,
      asignadoPorNombre:
        sub?.asignado_por_nombre || vot?.asignado_por_nombre || "",
    };
  });
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
