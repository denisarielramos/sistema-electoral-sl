import test from "node:test";
import assert from "node:assert/strict";
import { ASISTENTE_MAX_LOCAL_ROWS, resolverConsultaLocal } from "../src/utils/asistenteConsultas.js";

const estructura = {
  dirigentes: [
    { ci: "100", nombre: "Ana", apellido: "López", telefono: "0981000001" },
    { ci: "200", nombre: "Bruno", apellido: "Ríos", telefono: "0981000002" },
  ],
  coordinadores: [
    { ci: "300", nombre: "Carla", apellido: "Benítez", dirigente_ci: "100" },
  ],
  subcoordinadores: [
    { ci: "400", nombre: "Diego", apellido: "Pérez", coordinador_ci: "300", confirmado: false },
  ],
  votantes: [
    {
      ci: "500",
      nombre: "Elena",
      apellido: "Gómez",
      telefono: "0981555555",
      local_votacion: "Escuela Central",
      mesa: "12",
      orden: "44",
      seccional: "1",
      tercera_edad: true,
      voto_confirmado: false,
      asignado_por: "400",
      asignado_por_rol: "subcoordinador",
      coordinador_ci: "300",
      dirigente_ci: "100",
    },
  ],
};

const padron = [
  ...estructura.votantes,
  {
    ci: "900",
    nombre: "Fabio",
    apellido: "Sosa",
    local_votacion: "Colegio Nacional",
    mesa: "8",
    orden: "20",
    seccional: "2",
  },
];

test("identifica dirigentes sin coordinadores y devuelve su ficha local", () => {
  const result = resolverConsultaLocal({
    question: "¿Quiénes son los dirigentes que no tienen coordinadores?",
    estructura,
    padron,
  });

  assert.equal(result.localOnly, true);
  assert.equal(result.title, "Dirigentes sin coordinadores");
  assert.equal(result.total, 1);
  assert.equal(result.rows[0].nombreCompleto, "Bruno Ríos");
  assert.equal(result.rows[0].telefono, "0981000002");
});

test("busca por nombre también en el padrón sin asignar", () => {
  const result = resolverConsultaLocal({
    question: "Dame toda la información de Fabio Sosa",
    estructura,
    padron,
  });

  assert.equal(result.total, 1);
  assert.equal(result.rows[0].rol, "Padrón · sin asignar");
  assert.equal(result.rows[0].mesa, "8");
  assert.equal(result.rows[0].orden, "20");
});

test("combina filtros de tercera edad y mesa sin consultar a OpenAI", () => {
  const result = resolverConsultaLocal({
    question: "Mostrame las personas de tercera edad de la mesa 12",
    estructura,
    padron,
  });

  assert.equal(result.total, 1);
  assert.equal(result.rows[0].nombreCompleto, "Elena Gómez");
  assert.equal(result.rows[0].terceraEdad, "Sí");
});

test("una pregunta de cantidad devuelve solo el total y no las personas", () => {
  const result = resolverConsultaLocal({
    question: "¿Cuántas personas son de tercera edad?",
    estructura,
    padron,
  });

  assert.equal(result.kind, "count");
  assert.equal(result.total, 1);
  assert.deepEqual(result.rows, []);
  assert.equal(result.truncated, false);
});

test("una pregunta de quiénes devuelve el total y conserva el listado", () => {
  const result = resolverConsultaLocal({
    question: "¿Quiénes son las personas de tercera edad?",
    estructura,
    padron,
  });

  assert.equal(result.kind, "people");
  assert.equal(result.total, 1);
  assert.equal(result.rows[0].nombreCompleto, "Elena Gómez");
});

test("la regla de cantidad también se aplica a consultas jerárquicas", () => {
  const result = resolverConsultaLocal({
    question: "¿Cuántos dirigentes no tienen coordinadores?",
    estructura,
    padron,
  });

  assert.equal(result.kind, "count");
  assert.equal(result.total, 1);
  assert.deepEqual(result.rows, []);
});

test("lista los votantes de un coordinador y resuelve toda su jerarquía", () => {
  const result = resolverConsultaLocal({
    question: "Mostrame los votantes de Carla Benítez",
    estructura,
    padron,
  });

  assert.equal(result.total, 1);
  assert.equal(result.rows[0].dirigente, "Ana López");
  assert.equal(result.rows[0].coordinador, "Carla Benítez");
  assert.equal(result.rows[0].subcoordinador, "Diego Pérez");
});

test("una consulta sensible desconocida se queda local y no cae al endpoint de IA", () => {
  const result = resolverConsultaLocal({
    question: "Decime el teléfono de una persona que no existe",
    estructura,
    padron,
  });

  assert.ok(result);
  assert.equal(result.localOnly, true);
});

test("las preguntas generales siguen disponibles para el resumen de IA", () => {
  const result = resolverConsultaLocal({
    question: "Dame un resumen general y explicame las cifras",
    estructura,
    padron,
  });

  assert.equal(result, null);
});

test("limita resultados locales muy amplios y conserva el total real", () => {
  const manyVoters = Array.from({ length: ASISTENTE_MAX_LOCAL_ROWS + 5 }, (_, index) => ({
    ci: String(1000 + index),
    nombre: `Persona ${index}`,
    apellido: "Prueba",
  }));
  const result = resolverConsultaLocal({
    question: "Mostrame todos los votantes",
    estructura: { ...estructura, votantes: manyVoters },
    padron: [],
  });

  assert.equal(result.total, ASISTENTE_MAX_LOCAL_ROWS + 5);
  assert.equal(result.rows.length, ASISTENTE_MAX_LOCAL_ROWS);
  assert.equal(result.truncated, true);
});
