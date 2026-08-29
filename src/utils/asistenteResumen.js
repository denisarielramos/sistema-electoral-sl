import { normalizeCI, normalizeRole } from "./estructuraHelpers.js";

const promedio = (total, cantidad) =>
  cantidad > 0 ? Math.round((total / cantidad) * 10) / 10 : 0;

export const buildAsistenteResumen = (estructura = {}, estadisticas = {}) => {
  const dirigentes = estructura.dirigentes || [];
  const coordinadores = estructura.coordinadores || [];
  const subcoordinadores = estructura.subcoordinadores || [];
  const votantes = estructura.votantes || [];

  const dirigentesCI = new Set(dirigentes.map((p) => normalizeCI(p.ci)));
  const coordinadoresCI = new Set(coordinadores.map((p) => normalizeCI(p.ci)));
  const subcoordinadoresCI = new Set(subcoordinadores.map((p) => normalizeCI(p.ci)));

  const dirigentesConCoordinadores = new Set(
    coordinadores.map((p) => normalizeCI(p.dirigente_ci)).filter(Boolean)
  );
  const coordinadoresConSubs = new Set(
    subcoordinadores.map((p) => normalizeCI(p.coordinador_ci)).filter(Boolean)
  );

  let votantesDirectosDirigente = 0;
  let votantesDirectosCoordinador = 0;
  let votantesDeSubcoordinador = 0;
  let votantesSinJerarquiaReconocida = 0;
  const subsConVotantes = new Set();

  votantes.forEach((votante) => {
    const asignadoPor = normalizeCI(votante.asignado_por);
    const rol = normalizeRole(votante.asignado_por_rol);

    if (rol === "subcoordinador" || subcoordinadoresCI.has(asignadoPor)) {
      votantesDeSubcoordinador += 1;
      if (asignadoPor) subsConVotantes.add(asignadoPor);
      return;
    }
    if (rol === "coordinador" || coordinadoresCI.has(asignadoPor)) {
      votantesDirectosCoordinador += 1;
      return;
    }
    if (rol === "dirigente" || dirigentesCI.has(asignadoPor)) {
      votantesDirectosDirigente += 1;
      return;
    }
    votantesSinJerarquiaReconocida += 1;
  });

  const subsConfirmados = subcoordinadores.filter((p) => p.confirmado === true).length;
  const votosConfirmados = votantes.filter((p) => p.voto_confirmado === true).length;

  return {
    actualizadoEn: new Date().toISOString(),
    totales: {
      dirigentes: dirigentes.length,
      coordinadores: coordinadores.length,
      subcoordinadores: subcoordinadores.length,
      votantes: votantes.length,
      totalRed: estadisticas.totalRed ??
        dirigentes.length + coordinadores.length + subcoordinadores.length + votantes.length,
    },
    jerarquia: {
      dirigentesSinCoordinadores: dirigentes.filter(
        (p) => !dirigentesConCoordinadores.has(normalizeCI(p.ci))
      ).length,
      coordinadoresSinSubcoordinadores: coordinadores.filter(
        (p) => !coordinadoresConSubs.has(normalizeCI(p.ci))
      ).length,
      subcoordinadoresSinVotantes: subcoordinadores.filter(
        (p) => !subsConVotantes.has(normalizeCI(p.ci))
      ).length,
      votantesDirectosDirigente,
      votantesDirectosCoordinador,
      votantesDeSubcoordinador,
      votantesSinJerarquiaReconocida,
    },
    confirmacion: {
      totalConfirmable: estadisticas.totalConfirmable ?? 0,
      totalConfirmados: estadisticas.totalConfirmados ?? 0,
      pendientes: estadisticas.votosPendientes ?? 0,
      porcentajeConfirmados: estadisticas.porcentajeConfirmados ?? 0,
      subcoordinadoresConfirmados: subsConfirmados,
      subcoordinadoresPendientes: Math.max(0, subcoordinadores.length - subsConfirmados),
      votantesConfirmados: votosConfirmados,
      votantesPendientes: Math.max(0, votantes.length - votosConfirmados),
    },
    promedios: {
      coordinadoresPorDirigente: promedio(coordinadores.length, dirigentes.length),
      subcoordinadoresPorCoordinador: promedio(subcoordinadores.length, coordinadores.length),
      votantesPorSubcoordinador: promedio(votantesDeSubcoordinador, subcoordinadores.length),
    },
  };
};
