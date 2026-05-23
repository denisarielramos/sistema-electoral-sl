import { normalizeCI } from "../utils/estructuraHelpers";

export const getEstadisticas = (estructura, currentUser) => {
  if (!currentUser) return {};

  // ======================= SUPERADMIN =======================
  if (currentUser.role === "superadmin") {
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
    // Total confirmable = coordinadores + subs + voters
    // Total confirmed  = coordinadores (auto) + confirmedSubs + confirmedVoters
    const totalConfirmable = coordinadores + subcoordinadores + votantes;
    const totalConfirmados = coordinadores + subsConfirmados + votosConfirmados;
    const porcentajeConfirmados =
      totalConfirmable > 0 ? Math.round((totalConfirmados / totalConfirmable) * 100) : 0;

    return {
      coordinadores,
      subcoordinadores,
      subsConfirmados,
      votantes,
      totalRed: coordinadores + subcoordinadores + votantes,
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

    // Build O(1) map: asignadoPorCI -> votante[]
    const votantesByAsignadoPor = new Map();
    for (const v of estructura.votantes) {
      const key = normalizeCI(v.asignado_por);
      if (!votantesByAsignadoPor.has(key)) votantesByAsignadoPor.set(key, []);
      votantesByAsignadoPor.get(key).push(v);
    }

    // Subcoordinadores under this coord
    const subs = estructura.subcoordinadores.filter(
      (s) => normalizeCI(s.coordinador_ci) === miCI
    );

    // Voters assigned directly by this coord
    const votantesDirectos = votantesByAsignadoPor.get(miCI) || [];

    // Voters assigned by each sub (indirect) — O(subs) with map
    let votantesIndirectos = 0;
    let votosIndirectosConfirmados = 0;
    for (const sub of subs) {
      const subVoters = votantesByAsignadoPor.get(normalizeCI(sub.ci)) || [];
      votantesIndirectos += subVoters.length;
      votosIndirectosConfirmados += subVoters.filter((v) => v.voto_confirmado === true).length;
    }

    // Total voters = direct + indirect
    const totalVotantes = votantesDirectos.length + votantesIndirectos;

    // Confirmed subs
    const subsConfirmados = subs.filter((s) => s.confirmado === true).length;

    // Confirmed votes: direct confirmed + indirect confirmed
    const votosDirectosConfirmados = votantesDirectos.filter(
      (v) => v.voto_confirmado === true
    ).length;

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
