import {
  normalizeCI,
  normalizeRole,
  getMisSubcoordinadores,
  getVotantesDirectosCoord,
  getVotantesDeSubcoord,
  getCoordsDeDigente,
  getSubsDeDigente,
  getTodosVotantesDirigente,
  getVotantesDirectosDirigente,
} from "../utils/estructuraHelpers.js";

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

    // Tercera edad (solo superadmin ve este dato, ver Dashboard.jsx/PersonCard).
    // Deduplicado por CI: si el mismo votante llegara a aparecer más de una vez en
    // datos derivados, no debe contarse dos veces. null/undefined/false no cuentan.
    const ciTerceraEdad = new Set(
      estructura.votantes
        .filter((v) => v.tercera_edad === true)
        .map((v) => normalizeCI(v.ci))
    );
    const terceraEdad = ciTerceraEdad.size;

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
      terceraEdad,
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

    // Votantes directos (estricto por rol + compatibilidad legacy con coordinador_ci)
    const votantesDirectos = getVotantesDirectosCoord(estructura, miCI);

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
      // Total red: subcoordinadores + todos los votantes de la rama (NO incluye al propio coordinador)
      totalRed: subs.length + totalVotantes,
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
      (v) => normalizeRole(v.asignado_por_rol) === "coordinador"
    ).length;

    // Voters assigned by subcoordinators
    const votantesDeSubs = todosVotantes.filter(
      (v) => normalizeRole(v.asignado_por_rol) === "subcoordinador"
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

    const misVotantes = getVotantesDeSubcoord(estructura, miCI);

    // Votos confirmados
    const votosConfirmados = misVotantes.filter(
      (v) => v.voto_confirmado === true
    ).length;

    // El propio subcoordinador se cuenta como 1 voto confirmado automático (solo para el porcentaje de confirmación)
    const totalConfirmable = 1 + misVotantes.length;
    const totalConfirmados = 1 + votosConfirmados;
    const porcentajeTotal =
      totalConfirmable > 0 ? Math.round((totalConfirmados / totalConfirmable) * 100) : 0;

    return {
      votantes: misVotantes.length,
      // Total red: solo sus votantes (NO incluye al propio subcoordinador)
      totalRed: misVotantes.length,
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
