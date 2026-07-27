// ======================= PRUEBA DE HUMO: ESTADO DE CONFIRMACIÓN EN TARJETAS =======================
// No hay framework de test configurado en este proyecto (sin jest/vitest). Este script
// ejercita, con node:assert/strict, la corrección pedida en la segunda revisión de
// Codex sobre el PR #17: la tarjeta unificada (PersonCard, en Dashboard.jsx) no debe
// mostrar "Confirmado por rol" para todos los tipos que no sean votante — debe usar
// la misma interpretación que services/estadisticasService.js (getEstadisticas):
//
//   - votante: usa voto_confirmado (acción real de confirmar/anular, sin cambios).
//   - dirigente / coordinador: siempre cuentan como confirmados automáticos →
//     "Confirmado por rol" (getEstadisticas los suma a totalConfirmados sin condición).
//   - subcoordinador: NO es automático — depende del campo explícito
//     persona.confirmado (true → "Confirmado", false/ausente → "Pendiente").
//
// getEstadoConfirmacionTarjeta (src/utils/confirmacionHelpers.js) es la función pura
// que PersonCard usa para decidir qué mostrar; se prueba acá directamente.
//
// Ejecutar con: node scripts/smoke-test-confirmacion-tarjetas.mjs

import assert from "node:assert/strict";
import { getEstadoConfirmacionTarjeta } from "../src/utils/confirmacionHelpers.js";

// ======================= CASO 1: SUBCOORDINADOR CONFIRMADO =======================
{
  const sub = { ci: "3000001", confirmado: true };
  assert.equal(
    getEstadoConfirmacionTarjeta(sub, "subcoordinador"),
    "sub_confirmado",
    "Subcoordinador con confirmado=true debe mostrar 'Confirmado'"
  );
}

// ======================= CASO 2: SUBCOORDINADOR PENDIENTE (confirmado=false) =======================
{
  const sub = { ci: "3000002", confirmado: false };
  assert.equal(
    getEstadoConfirmacionTarjeta(sub, "subcoordinador"),
    "sub_pendiente",
    "Subcoordinador con confirmado=false debe mostrar 'Pendiente'"
  );
}

// ======================= CASO 3: SUBCOORDINADOR PENDIENTE (campo ausente) =======================
{
  const sub = { ci: "3000003" }; // sin campo `confirmado` (dato legacy)
  assert.equal(
    getEstadoConfirmacionTarjeta(sub, "subcoordinador"),
    "sub_pendiente",
    "Subcoordinador sin campo confirmado debe tratarse como 'Pendiente', nunca como confirmado automático"
  );
}

// ======================= CASO 4: DIRIGENTE Y COORDINADOR SIEMPRE 'CONFIRMADO POR ROL' =======================
{
  assert.equal(
    getEstadoConfirmacionTarjeta({ ci: "1000001" }, "dirigente"),
    "confirmado_por_rol",
    "Dirigente debe ser siempre 'Confirmado por rol', igual que getEstadisticas"
  );
  assert.equal(
    getEstadoConfirmacionTarjeta({ ci: "2000001" }, "coordinador"),
    "confirmado_por_rol",
    "Coordinador debe ser siempre 'Confirmado por rol', igual que getEstadisticas"
  );
}

// ======================= CASO 5: VOTANTE USA voto_confirmado, SIN 'CONFIRMADO POR ROL' =======================
{
  assert.equal(
    getEstadoConfirmacionTarjeta({ ci: "4000001", voto_confirmado: true }, "votante"),
    "votante_confirmado",
    "Votante con voto_confirmado=true debe mostrar el estado real de confirmación"
  );
  assert.equal(
    getEstadoConfirmacionTarjeta({ ci: "4000002", voto_confirmado: false }, "votante"),
    "votante_pendiente",
    "Votante con voto_confirmado=false debe mostrar pendiente, nunca 'Confirmado por rol'"
  );
  assert.notEqual(
    getEstadoConfirmacionTarjeta({ ci: "4000003" }, "votante"),
    "confirmado_por_rol",
    "Votante nunca debe recibir el estado automático de rol"
  );
}

console.log("OK: smoke-test-confirmacion-tarjetas — todos los casos pasaron.");
