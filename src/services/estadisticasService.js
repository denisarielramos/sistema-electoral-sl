import {
  normalizeCI,
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

    // Subcoordinadores under this coord
    const subs = estructura.subcoordinadores.filter(
      (s) => normalizeCI(s.coordinador_ci) === miCI
    );

    // Voters assigned directly by this coord
    const votantesDirectos = estructura.votantes.filter(
      (v) => normalizeCI(v.asignado_por) === miCI
    );

    // Voters assigned by each sub (indirect)
    const votantesIndirectos = subs.reduce(
      (acc, sub) =>
        acc +
        estructura.votantes.filter(
          (v) => normalizeCI(v.asignado_por) === normalizeCI(sub.ci)
        ).length,
      0
    );

    // Total voters = direct + indirect
    const totalVotantes = votantesDirectos.length + votantesIndirectos;

    // Confirmed subs
    const subsConfirmados = subs.filter((s) => s.confirmado === true).length;

    // Confirmed votes: direct confirmed + indirect confirmed
    const votosDirectosConfirmados = votantesDirectos.filter(
      (v) => v.voto_confirmado === true
    ).length;

    const votosIndirectosConfirmados = subs.reduce(
      (acc, sub) =>
        acc +
        estructura.votantes.filter(
          (v) =>
            normalizeCI(v.asignado_por) === normalizeCI(sub.ci) &&
            v.voto_confirmado === true
        ).length,
      0
    );

    const votosConfirmados = votosDirectosConfirmados + votosIndirectosConfirmados;

    // Coordinador self is always counted as 1 confirmed vote (automatic).
    // Total confirmable = 1 (self) + subs + all voters
    // Total confirmed  = 1 (self auto) + confirmedSubs + confirmedVoters
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
