// ======================= PRUEBA DE HUMO: MÓDULO "TERCERA EDAD" (getEstadisticas) =======================
// No hay framework de test configurado en este proyecto (sin jest/vitest). Ejercita
// getEstadisticas (src/services/estadisticasService.js) con un dataset sintético que
// cubre exactamente los casos requeridos: votante tercera_edad=true, false, null,
// inactivo, y CI duplicada en datos derivados (defensivo, aunque estructura.votantes
// no debería traer duplicados reales).
//
// El resto del módulo (tarjeta/filtro/badge/checkbox/Excel, todos con lógica embebida
// en Dashboard.jsx o gateados por currentUser.role dentro del árbol JSX) se verifica
// manualmente en el navegador (ver notas en la descripción del PR) — no hay un arnés
// de pruebas E2E con Supabase simulado en esta rama (a diferencia de la rama de mapeo,
// que mockea RPCs; este módulo usa REST directo + IndexedDB para el padrón, una
// superficie de integración distinta y mucho mayor).
//
// Ejecutar con: node scripts/smoke-test-tercera-edad.mjs

import assert from "node:assert/strict";
import { getEstadisticas } from "../src/services/estadisticasService.js";

const estructura = {
  dirigentes: [{ ci: "1000001", activo: true }],
  coordinadores: [{ ci: "2000001", activo: true }],
  subcoordinadores: [{ ci: "3000001", confirmado: true }],
  votantes: [
    { ci: "4000001", tercera_edad: true, voto_confirmado: true },
    { ci: "4000002", tercera_edad: false, voto_confirmado: false },
    { ci: "4000003", tercera_edad: null, voto_confirmado: false },
    { ci: "4000004", tercera_edad: undefined, voto_confirmado: false },
    // CI duplicada en datos derivados (defensivo): no debe contarse dos veces.
    { ci: "4000001", tercera_edad: true, voto_confirmado: true },
  ],
};

const currentUserSuperadmin = { role: "superadmin", ci: "9999999" };

// ======================= TEST 1: conteo correcto, deduplicado por CI =======================
{
  const stats = getEstadisticas(estructura, currentUserSuperadmin);
  assert.equal(
    stats.terceraEdad,
    1,
    `se esperaba 1 votante de tercera edad único (4000001 x2 deduplicado), obtuvo ${stats.terceraEdad}`
  );
  console.log("OK 1: el conteo de tercera edad deduplica por CI (4000001 aparece 2 veces, cuenta 1)");
}

// ======================= TEST 2: false/null/undefined nunca cuentan =======================
{
  const soloNoTercera = {
    ...estructura,
    votantes: [
      { ci: "5000001", tercera_edad: false },
      { ci: "5000002", tercera_edad: null },
      { ci: "5000003", tercera_edad: undefined },
      { ci: "5000004" }, // sin la propiedad en absoluto
    ],
  };
  const stats = getEstadisticas(soloNoTercera, currentUserSuperadmin);
  assert.equal(stats.terceraEdad, 0, "false/null/undefined/ausente nunca deben contar como tercera edad");
  console.log("OK 2: false, null, undefined y ausencia del campo nunca cuentan");
}

// ======================= TEST 3: solo estructura.votantes (ya filtrado a activos por fetchAllActive) se cuenta =======================
// getEstadisticas no vuelve a filtrar por activo — confía en que estructura.votantes ya
// viene solo con activos (fetchAllActive hace .eq("activo", true) en Dashboard.jsx). Este
// test documenta ese contrato: si por error llegara un votante inactivo con
// tercera_edad=true, hoy SÍ se contaría, porque el filtro de "activo" es responsabilidad
// exclusiva de la carga de datos, no de getEstadisticas.
{
  const conInactivo = {
    ...estructura,
    votantes: [
      { ci: "6000001", tercera_edad: true, activo: true },
      { ci: "6000002", tercera_edad: true, activo: false }, // no debería llegar hasta acá en producción
    ],
  };
  const stats = getEstadisticas(conInactivo, currentUserSuperadmin);
  assert.equal(
    stats.terceraEdad,
    2,
    "getEstadisticas cuenta lo que estructura.votantes le pasa (el filtro de activos vive en fetchAllActive, no acá)"
  );
  console.log('OK 3: confirma el contrato — getEstadisticas confía en que estructura.votantes ya viene solo con activos');
}

// ======================= TEST 4: getEstadisticas para otros roles no expone terceraEdad =======================
{
  const statsDirigente = getEstadisticas(estructura, { role: "dirigente", ci: "1000001" });
  assert.equal(
    statsDirigente.terceraEdad,
    undefined,
    "getEstadisticas para dirigente no debe calcular ni exponer terceraEdad"
  );
  const statsCoordinador = getEstadisticas(estructura, { role: "coordinador", ci: "2000001" });
  assert.equal(statsCoordinador.terceraEdad, undefined, "getEstadisticas para coordinador no debe exponer terceraEdad");
  const statsSubcoordinador = getEstadisticas(estructura, { role: "subcoordinador", ci: "3000001" });
  assert.equal(statsSubcoordinador.terceraEdad, undefined, "getEstadisticas para subcoordinador no debe exponer terceraEdad");
  console.log("OK 4: dirigente/coordinador/subcoordinador nunca reciben el dato terceraEdad");
}

console.log("\nTodas las pruebas de humo del módulo tercera edad pasaron correctamente.");
