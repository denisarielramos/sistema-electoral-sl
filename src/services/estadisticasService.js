import {
  normalizeCI,
  getMisSubcoordinadores,
  getMisVotantes,
  getVotantesDeSubcoord,
  getCoordsDeDigente,
  getSubsDeDigente,
  getTodosVotantesDirigente,
  getVotantesDirectosDirigente,
} from "../utils/estructuraHelpers";

export const getEstadisticas = (estructura, currentUser) => {
  if (!currentUser) return {};

  // ======================= SUPERADMIN =======================
  if (currentUser.role === "superadmin") {
    const dirigentes = (estructura.dirigentes || []).length;
    const coordinadores = estructura.coordinadores.length;
    const subcoordinadores = estructura.subcoordinadores.length;
    const votantes = estructura.votantes.length;

    // Confirmed subs
    const subsConfirmados = estructura.subcoordinadores.filter(
      (s) => s.confirmado === true
    ).length;

    // Confirmed voters
    const votosConfirmados = estructura.votantes.filter(
      (v) => v.voto_confirmado === true
    ).length;

    // Coordinadores are always counted as 1 confirmed vote each (automatic).
    // Total confirmable = dirigentes + coordinadores + subs + voters
    // Total confirmed  = dirigentes (auto) + coordinadores (auto) + confirmedSubs + confirmedVoters
    const totalConfirmable = dirigentes + coordinadores + subcoordinadores + votantes;
    const totalConfirmados = dirigentes + coordinadores + subsConfirmados + votosConfirmados;
    const porcentajeConfirmados =
      totalConfirmable > 0 ? Math.round((totalConfirmados / totalConfirmable) * 100) : 0;

    return {
      dirigentes,
      coordinadores,
      subcoordinadores,
      subsConfirmados,
      votantes,
      totalRed: dirigentes + coordinadores + subcoordinadores + votantes,
      totalVotantes: votantes,
      totalConfirmable,
      totalConfirmados,
      votosConfirmados,
      votosPendientes: totalConfirmable - totalConfirmados,
      porcentajeConfirmados,
    };
  }

  // ======================= COORDINADOR =======================
  if (currentUser.role === "coordinador") {
    const miCI = normalizeCI(currentUser.ci);

    // Subcoordinadores bajo este coordinador
    const subs = getMisSubcoordinadores(estructura, miCI);

    // Votantes directos (incluye compatibilidad legacy con coordinador_ci)
    const votantesDirectos = getMisVotantes(estructura, miCI);

    // Votantes indirectos (de subcoordinadores), sin duplicados con directos
    const ciDirectos = new Set(votantesDirectos.map((v) => normalizeCI(v.ci)));
    const votantesDeSubsArr = subs.flatMap((sub) =>
      getVotantesDeSubcoord(estructura, normalizeCI(sub.ci)).filter(
        (v) => !ciDirectos.has(normalizeCI(v.ci))
      )
    );
    const votantesIndirectos = votantesDeSubsArr.length;

    // Total sin duplicados
    const totalVotantes = votantesDirectos.length + votantesIndirectos;

    // Confirmados
    const subsConfirmados = subs.filter((s) => s.confirmado === true).length;
    const votosDirectosConfirmados = votantesDirectos.filter((v) => v.voto_confirmado === true).length;
    const votosIndirectosConfirmados = votantesDeSubsArr.filter((v) => v.voto_confirmado === true).length;
    const votosConfirmados = votosDirectosConfirmados + votosIndirectosConfirmados;

    const totalConfirmable = 1 + subs.length + totalVotantes;
    const totalConfirmados = 1 + subsConfirmados + votosConfirmados;
    const porcentajeConfirmados =
      totalConfirmable > 0 ? Math.round((totalConfirmados / totalConfirmable) * 100) : 0;

    return {
      subcoordinadores: subs.length,
      subsConfirmados,
      votantesDirectos: votantesDirectos.length,
      votantesIndirectos,
      totalRed: 1 + subs.length + totalVotantes,
      totalVotantes,
      totalConfirmable,
      totalConfirmados,
      votosConfirmados,
      votosPendientes: totalConfirmable - totalConfirmados,
      porcentajeConfirmados,
    };
  }

  // ======================= DIRIGENTE =======================
  if (currentUser.role === "dirigente") {
    const miCI = normalizeCI(currentUser.ci);

    const misCoords = getCoordsDeDigente(estructura, miCI);
    const misSubs = getSubsDeDigente(estructura, miCI);
    const votantesDirectos = getVotantesDirectosDirigente(estructura, miCI);
    const todosVotantes = getTodosVotantesDirigente(estructura, miCI);

    // Voters assigned by coordinators (direct of coord)
    const votantesDeCoords = todosVotantes.filter(
      (v) => normalizeCI(v.asignado_por_rol) === "coordinador"
    ).length;

    // Voters assigned by subcoordinators
    const votantesDeSubs = todosVotantes.filter(
      (v) => normalizeCI(v.asignado_por_rol) === "subcoordinador"
    ).length;

    return {
      coordinadores: misCoords.length,
      subcoordinadores: misSubs.length,
      votantesDirectos: votantesDirectos.length,
      votantesDeCoords,
      votantesDeSubs,
      totalRed: misCoords.length + misSubs.length + todosVotantes.length,
    };
  }

  // ======================= SUBCOORDINADOR =======================
  if (currentUser.role === "subcoordinador") {
    const miCI = normalizeCI(currentUser.ci);

    const misVotantes = estructura.votantes.filter(
      (v) => normalizeCI(v.asignado_por) === miCI
    );

    // Votos confirmados
    const votosConfirmados = misVotantes.filter(
      (v) => v.voto_confirmado === true
    ).length;
    const porcentajeConfirmados =
      misVotantes.length > 0
        ? Math.round((votosConfirmados / misVotantes.length) * 100)
        : 0;

    // Sub self is always counted as 1 confirmed vote (automatic).
    const totalConfirmable = 1 + misVotantes.length;
    const totalConfirmados = 1 + votosConfirmados;
    const porcentajeTotal =
      totalConfirmable > 0 ? Math.round((totalConfirmados / totalConfirmable) * 100) : 0;

    return {
      votantes: misVotantes.length,
      totalRed: 1 + misVotantes.length,
      totalVotantes: misVotantes.length,
      totalConfirmable,
      totalConfirmados,
      votosConfirmados,
      votosPendientes: totalConfirmable - totalConfirmados,
      porcentajeConfirmados: porcentajeTotal,
    };
  }

  return {};
};
