import test from "node:test";
import assert from "node:assert/strict";
import { buildAsistenteResumen } from "../src/utils/asistenteResumen.js";
import {
  getResponseInstruction,
  isSameOrigin,
  sanitizeHistory,
  sanitizeSummary,
} from "../api/asistente.js";

test("el resumen contiene solo métricas agregadas y clasifica la jerarquía", () => {
  const estructura = {
    dirigentes: [{ ci: "1" }, { ci: "2" }],
    coordinadores: [{ ci: "10", dirigente_ci: "1" }],
    subcoordinadores: [
      { ci: "20", coordinador_ci: "10", confirmado: true },
      { ci: "21", coordinador_ci: "10", confirmado: false },
    ],
    votantes: [
      { ci: "30", asignado_por: "1", asignado_por_rol: "dirigente", voto_confirmado: true },
      { ci: "31", asignado_por: "10", asignado_por_rol: "coordinador" },
      { ci: "32", asignado_por: "20", asignado_por_rol: "subcoordinador" },
      { ci: "33", asignado_por: "999", asignado_por_rol: "" },
    ],
  };

  const summary = buildAsistenteResumen(estructura, {
    totalConfirmable: 9,
    totalConfirmados: 4,
    votosPendientes: 5,
    porcentajeConfirmados: 44,
  });

  assert.deepEqual(summary.totales, {
    dirigentes: 2,
    coordinadores: 1,
    subcoordinadores: 2,
    votantes: 4,
    totalRed: 9,
  });
  assert.equal(summary.jerarquia.dirigentesSinCoordinadores, 1);
  assert.equal(summary.jerarquia.coordinadoresSinSubcoordinadores, 0);
  assert.equal(summary.jerarquia.subcoordinadoresSinVotantes, 1);
  assert.equal(summary.jerarquia.votantesSinJerarquiaReconocida, 1);
  assert.equal(summary.confirmacion.votantesConfirmados, 1);
  assert.equal(JSON.stringify(summary).includes("nombre"), false);
  assert.equal(JSON.stringify(summary).includes("telefono"), false);
});

test("el servidor descarta campos no autorizados del resumen", () => {
  const sanitized = sanitizeSummary({
    actualizadoEn: "2026-08-29T10:00:00.000Z",
    totales: { dirigentes: 2, votantes: 50, nombres: ["Persona privada"] },
    personas: [{ ci: "123", telefono: "0981" }],
  });

  assert.equal(sanitized.totales.dirigentes, 2);
  assert.equal(sanitized.totales.votantes, 50);
  assert.equal("nombres" in sanitized.totales, false);
  assert.equal("personas" in sanitized, false);
  assert.equal(JSON.stringify(sanitized).includes("Persona privada"), false);
});

test("el historial acepta solo seis mensajes de usuario o asistente", () => {
  const history = Array.from({ length: 8 }, (_, index) => ({
    role: index === 0 ? "system" : index % 2 ? "user" : "assistant",
    content: `mensaje-${index}`,
  }));
  const sanitized = sanitizeHistory(history);

  assert.equal(sanitized.length, 6);
  assert.equal(sanitized.every((message) => message.role !== "system"), true);
  assert.equal(sanitized.at(-1).content, "mensaje-7");
});

test("las preguntas de cantidad piden una respuesta numérica sin listado", () => {
  const instruction = getResponseInstruction("¿Cuántos votantes están pendientes?");

  assert.match(instruction, /únicamente con la cifra/);
  assert.match(instruction, /sin lista/);
});

test("si se piden nombres, el total acompaña al detalle", () => {
  const instruction = getResponseInstruction("¿Quiénes son los coordinadores pendientes?");

  assert.match(instruction, /primero el total/);
  assert.match(instruction, /después el detalle/);
});

test("el endpoint exige que el origen coincida con el host", () => {
  assert.equal(
    isSameOrigin({ headers: { origin: "https://ejemplo.com", host: "ejemplo.com" } }),
    true
  );
  assert.equal(
    isSameOrigin({ headers: { origin: "https://externo.com", host: "ejemplo.com" } }),
    false
  );
  assert.equal(isSameOrigin({ headers: { host: "ejemplo.com" } }), false);
});
