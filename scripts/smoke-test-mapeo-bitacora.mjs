// ======================= PRUEBA DE HUMO: MAPEO TERRITORIAL Y BITÁCORA DE VISITAS =======================
// No hay framework de test configurado en este proyecto (sin jest/vitest). Este
// script ejercita, con node:assert/strict, la lógica pura del módulo de mapeo
// territorial y bitácora de visitas:
//
//   1) Fórmula Haversine (distancia entre coordenadas).
//   2) Dentro/fuera del radio permitido.
//   3) Precisión GPS inválida.
//   4) Coordenadas inválidas.
//   5) Asociación de varios votantes al mismo hogar / prevención de duplicados
//      (espejo en JS de la restricción real: índice único parcial en la base,
//      ver supabase/migrations/20260727100000_mapeo_territorial_bitacora.sql).
//   6) Permisos y alcance jerárquico (mismos helpers de estructuraHelpers.js que
//      usa el resto del dashboard — el límite de seguridad real para hogares y
//      visitas lo aplican las funciones RPC del lado del servidor, no este código).
//   7) Estados de visita (derivación del estado visual del hogar).
//   8) Estadísticas del módulo.
//
// Ejecutar con: node scripts/smoke-test-mapeo-bitacora.mjs

import assert from "node:assert/strict";
import {
  haversineDistanceMeters,
  estaDentroDelRadio,
  esCoordenadaValida,
  esPrecisionGpsAceptable,
  getEstadoMapaHogar,
  ESTADOS_MAPA,
} from "../src/utils/geoHelpers.js";
import {
  filtrarHogares,
  calcularEstadisticasMapeo,
  votantesDelRolEnMapeo,
  construirVotantesEnHogarActivo,
  getJerarquiaHogar,
} from "../src/utils/mapeoHelpers.js";

// ======================= CASO 1: FÓRMULA HAVERSINE =======================
{
  // Mismo punto -> distancia 0.
  assert.equal(haversineDistanceMeters(-25.2637, -57.5759, -25.2637, -57.5759), 0);

  // Asunción -> Ciudad del Este (~ Paraguay), distancia real aproximada ~300 km.
  // Se usa un rango amplio (250km-330km) para no acoplar el test a decimales exactos.
  const d = haversineDistanceMeters(-25.2637, -57.5759, -25.5163, -54.6114);
  assert.ok(d > 250000 && d < 330000, `Distancia Asunción-CDE fuera de rango esperado: ${d}`);

  // Falta algún dato -> null (no se puede calcular, nunca se inventa un 0).
  assert.equal(haversineDistanceMeters(null, -57.5, -25.2, -57.5), null);
  assert.equal(haversineDistanceMeters(-25.2, undefined, -25.2, -57.5), null);
}

// ======================= CASO 2: DENTRO / FUERA DEL RADIO =======================
{
  assert.equal(estaDentroDelRadio(50, 100), true);
  assert.equal(estaDentroDelRadio(100, 100), true); // límite inclusive
  assert.equal(estaDentroDelRadio(101, 100), false);
  assert.equal(estaDentroDelRadio(null, 100), false); // sin distancia calculable -> no confirma
  assert.equal(estaDentroDelRadio(50, 0), false); // radio inválido -> nunca confirma
}

// ======================= CASO 3: PRECISIÓN GPS INVÁLIDA =======================
{
  assert.equal(esPrecisionGpsAceptable(20, 50), true);
  assert.equal(esPrecisionGpsAceptable(50, 50), true); // límite inclusive
  assert.equal(esPrecisionGpsAceptable(51, 50), false);
  assert.equal(esPrecisionGpsAceptable(-5, 50), false); // negativa: siempre inválida
  assert.equal(esPrecisionGpsAceptable(null, 50), true); // dispositivo no la reporta: no bloquea
}

// ======================= CASO 4: COORDENADAS INVÁLIDAS =======================
{
  assert.equal(esCoordenadaValida(-25.2637, -57.5759), true);
  assert.equal(esCoordenadaValida(90, 180), true); // límites inclusive
  assert.equal(esCoordenadaValida(-90, -180), true);
  assert.equal(esCoordenadaValida(91, 0), false);
  assert.equal(esCoordenadaValida(0, 181), false);
  assert.equal(esCoordenadaValida(null, -57.5), false);
  assert.equal(esCoordenadaValida(NaN, -57.5), false);
}

// ======================= CASO 5: MÚLTIPLES VOTANTES POR HOGAR / PREVENCIÓN DE DUPLICADOS =======================
{
  const hogares = [
    { id: "hogar-1", votantes: [{ ci: "4000001" }, { ci: "4000002" }] },
    { id: "hogar-2", votantes: [{ ci: "4000003" }] },
  ];

  // Un hogar puede agrupar varios votantes sin problema.
  assert.deepEqual(hogares[0].votantes.map((v) => v.ci), ["4000001", "4000002"]);

  // El set de "ya en un hogar activo" incluye a todos, de cualquier hogar.
  const enUso = construirVotantesEnHogarActivo(hogares);
  assert.equal(enUso.has("4000001"), true);
  assert.equal(enUso.has("4000002"), true);
  assert.equal(enUso.has("4000003"), true);
  assert.equal(enUso.has("9999999"), false);

  // Al editar hogar-1, sus propios votantes NO deben bloquear "re-agregarlos" (se
  // excluye ese hogar del cálculo), pero los de otros hogares (hogar-2) sí siguen
  // bloqueados — es la misma semántica que impone el índice único parcial en SQL:
  // un votante no puede estar en dos hogares ACTIVOS distintos a la vez.
  const enUsoExcluyendoHogar1 = construirVotantesEnHogarActivo(hogares, "hogar-1");
  assert.equal(enUsoExcluyendoHogar1.has("4000001"), false);
  assert.equal(enUsoExcluyendoHogar1.has("4000002"), false);
  assert.equal(enUsoExcluyendoHogar1.has("4000003"), true);
}

// ======================= CASO 6: PERMISOS Y ALCANCE JERÁRQUICO =======================
{
  const estructura = {
    dirigentes: [{ ci: "1000001" }],
    coordinadores: [
      { ci: "2000001", dirigente_ci: "1000001" },
      { ci: "2000002", dirigente_ci: "9999999" }, // rama de otro dirigente
    ],
    subcoordinadores: [{ ci: "3000001", coordinador_ci: "2000001" }],
    votantes: [
      { ci: "4000001", dirigente_ci: "1000001", coordinador_ci: "2000001", asignado_por: "2000001", asignado_por_rol: "coordinador" },
      { ci: "4000002", coordinador_ci: "2000001", asignado_por: "3000001", asignado_por_rol: "subcoordinador" },
      { ci: "4000003", coordinador_ci: "2000002", asignado_por: "2000002", asignado_por_rol: "coordinador" }, // otra rama
    ],
  };

  // Superadmin ve todos los votantes.
  const paraSuperadmin = votantesDelRolEnMapeo(estructura, { ci: "9", role: "superadmin" });
  assert.equal(paraSuperadmin.length, 3);

  // Dirigente ve solo su rama (directos + de sus coordinadores + de los subs de esos
  // coordinadores) — NO ve al votante de la rama del otro dirigente.
  const paraDirigente = votantesDelRolEnMapeo(estructura, { ci: "1000001", role: "dirigente" });
  const cisDirigente = paraDirigente.map((v) => v.ci).sort();
  assert.deepEqual(cisDirigente, ["4000001", "4000002"]);

  // Coordinador ve directos + de sus subcoordinadores, nunca de otro coordinador.
  const paraCoordinador = votantesDelRolEnMapeo(estructura, { ci: "2000001", role: "coordinador" });
  const cisCoordinador = paraCoordinador.map((v) => v.ci).sort();
  assert.deepEqual(cisCoordinador, ["4000001", "4000002"]);
  assert.ok(!cisCoordinador.includes("4000003"), "Coordinador no debe ver votantes de otra rama");

  // Subcoordinador ve solo los votantes que él mismo asignó.
  const paraSubcoordinador = votantesDelRolEnMapeo(estructura, { ci: "3000001", role: "subcoordinador" });
  assert.deepEqual(paraSubcoordinador.map((v) => v.ci), ["4000002"]);

  // Sin usuario -> lista vacía (nunca todos por defecto).
  assert.deepEqual(votantesDelRolEnMapeo(estructura, null), []);

  // getJerarquiaHogar resuelve nombres de dirigente/coordinador/subcoordinador a
  // partir de los votantes embebidos de un hogar.
  const estructuraConNombres = {
    dirigentes: [{ ci: "1000001", nombre: "Ana", apellido: "Dir" }],
    coordinadores: [{ ci: "2000001", nombre: "Bea", apellido: "Coord" }],
    subcoordinadores: [{ ci: "3000001", nombre: "Cara", apellido: "Sub" }],
  };
  const hogarConJerarquia = {
    votantes: [{ ci: "4000002", dirigente_ci: "1000001", coordinador_ci: "2000001", asignado_por: "3000001", asignado_por_rol: "subcoordinador" }],
  };
  const jerarquia = getJerarquiaHogar(hogarConJerarquia, estructuraConNombres);
  assert.equal(jerarquia.dirigente?.ci, "1000001");
  assert.equal(jerarquia.coordinador?.ci, "2000001");
  assert.equal(jerarquia.subcoordinador?.ci, "3000001");
}

// ======================= CASO 7: ESTADOS DE VISITA (ESTADO VISUAL DEL HOGAR) =======================
{
  assert.equal(getEstadoMapaHogar(null), ESTADOS_MAPA.SIN_UBICACION);
  assert.equal(getEstadoMapaHogar({ latitud: null, longitud: null, estado: "pendiente" }), ESTADOS_MAPA.SIN_UBICACION);
  assert.equal(getEstadoMapaHogar({ latitud: -25, longitud: -57, estado: "rechazado" }), ESTADOS_MAPA.RECHAZADO);
  assert.equal(getEstadoMapaHogar({ latitud: -25, longitud: -57, estado: "pendiente" }), ESTADOS_MAPA.PENDIENTE_VERIFICACION);
  assert.equal(
    getEstadoMapaHogar({ latitud: -25, longitud: -57, estado: "verificado", ultima_visita: null }),
    ESTADOS_MAPA.SIN_VISITAR
  );
  assert.equal(
    getEstadoMapaHogar({ latitud: -25, longitud: -57, estado: "verificado", ultima_visita: { resultado: "confirmada" } }),
    ESTADOS_MAPA.VISITADO
  );
  assert.equal(
    getEstadoMapaHogar({ latitud: -25, longitud: -57, estado: "verificado", ultima_visita: { resultado: "fuera_de_radio" } }),
    ESTADOS_MAPA.FUERA_DE_RADIO
  );
  // error_gps u otro resultado no reconocido -> se trata como "sin visitar" (no se
  // inventa un estado de éxito ni de fuera de radio para un intento que falló por GPS).
  assert.equal(
    getEstadoMapaHogar({ latitud: -25, longitud: -57, estado: "verificado", ultima_visita: { resultado: "error_gps" } }),
    ESTADOS_MAPA.SIN_VISITAR
  );
}

// ======================= CASO 8: ESTADÍSTICAS DEL MÓDULO =======================
{
  const hogares = [
    { latitud: -25, longitud: -57, estado: "verificado", ultima_visita: { resultado: "confirmada" } }, // visitado
    { latitud: -25, longitud: -57, estado: "verificado", ultima_visita: { resultado: "fuera_de_radio" } }, // fuera de radio
    { latitud: -25, longitud: -57, estado: "verificado", ultima_visita: null }, // sin visitar
    { latitud: -25, longitud: -57, estado: "pendiente", ultima_visita: null }, // pendiente de verificar
    { latitud: null, longitud: null, estado: "pendiente", ultima_visita: null }, // sin ubicación (no cuenta como mapeado)
  ];
  const stats = calcularEstadisticasMapeo(hogares);
  assert.equal(stats.total, 5);
  assert.equal(stats.mapeados, 4);
  assert.equal(stats.pendientesVerificar, 2);
  assert.equal(stats.visitados, 1);
  assert.equal(stats.noVisitados, 1);
  assert.equal(stats.fueraDeRadio, 1);

  // Lista vacía -> todo en cero, nunca undefined/NaN.
  const statsVacio = calcularEstadisticasMapeo([]);
  assert.deepEqual(statsVacio, { total: 0, mapeados: 0, pendientesVerificar: 0, visitados: 0, noVisitados: 0, fueraDeRadio: 0 });
}

// ======================= CASO 9: BÚSQUEDA/FILTRADO DE HOGARES =======================
{
  const estructura = {
    dirigentes: [], coordinadores: [{ ci: "2000001", nombre: "Bea", apellido: "Coord" }], subcoordinadores: [],
  };
  const hogares = [
    { id: "h1", nombre_familia: "Familia Pérez", direccion: "Calle 1", referencia: "", estado: "verificado", votantes: [{ ci: "4000001", nombre: "Ana", apellido: "Pérez", telefono: "981123456", coordinador_ci: "2000001" }] },
    { id: "h2", nombre_familia: "Familia Gómez", direccion: "Calle 2", referencia: "casa azul", estado: "pendiente", votantes: [{ ci: "4000002", nombre: "Luis", apellido: "Gómez", telefono: "982123456" }] },
  ];

  // Búsqueda por nombre de votante.
  assert.deepEqual(filtrarHogares(hogares, { query: "Ana" }, estructura).map((h) => h.id), ["h1"]);
  // Búsqueda por CI.
  assert.deepEqual(filtrarHogares(hogares, { query: "4000002" }, estructura).map((h) => h.id), ["h2"]);
  // Búsqueda por referencia/dirección.
  assert.deepEqual(filtrarHogares(hogares, { query: "casa azul" }, estructura).map((h) => h.id), ["h2"]);
  // Filtro por estado de mapeo.
  assert.deepEqual(filtrarHogares(hogares, { estadoMapeo: "pendiente" }, estructura).map((h) => h.id), ["h2"]);
  // Filtro por coordinador responsable.
  assert.deepEqual(filtrarHogares(hogares, { coordinadorCI: "2000001" }, estructura).map((h) => h.id), ["h1"]);
  // Sin filtros -> todos.
  assert.equal(filtrarHogares(hogares, {}, estructura).length, 2);

  // Hogar compartido entre ramas (dos votantes de coordinadores distintos): el
  // filtro por jerarquía debe evaluar CADA votante, no solo el primero embebido —
  // si el coordinador buscado corresponde al SEGUNDO votante, el hogar igual debe
  // aparecer (regresión: antes se resolvía una única tupla con el primer votante
  // que tuviera cada dato, y este hogar desaparecía de ambos filtros).
  const estructuraDosCoords = {
    dirigentes: [],
    coordinadores: [
      { ci: "2000001", nombre: "Bea", apellido: "Coord" },
      { ci: "2000002", nombre: "Cato", apellido: "Coord" },
    ],
    subcoordinadores: [],
  };
  const hogarCompartido = {
    id: "h3",
    nombre_familia: "Familia Compartida",
    direccion: "Calle 3",
    referencia: "",
    estado: "verificado",
    votantes: [
      { ci: "4000010", nombre: "A", apellido: "Uno", coordinador_ci: "2000001" },
      { ci: "4000011", nombre: "B", apellido: "Dos", coordinador_ci: "2000002" },
    ],
  };
  assert.deepEqual(
    filtrarHogares([hogarCompartido], { coordinadorCI: "2000001" }, estructuraDosCoords).map((h) => h.id),
    ["h3"],
    "Debe coincidir por el PRIMER votante embebido"
  );
  assert.deepEqual(
    filtrarHogares([hogarCompartido], { coordinadorCI: "2000002" }, estructuraDosCoords).map((h) => h.id),
    ["h3"],
    "Debe coincidir también por el SEGUNDO votante embebido, no solo el primero"
  );
  assert.deepEqual(
    filtrarHogares([hogarCompartido], { coordinadorCI: "9999999" }, estructuraDosCoords).map((h) => h.id),
    [],
    "Un coordinador ajeno a ambos votantes no debe coincidir"
  );
}

console.log("OK: smoke-test-mapeo-bitacora — todos los casos pasaron.");
