// ======================= PRUEBA DE HUMO: EXPORTACIÓN A EXCEL =======================
// No hay framework de test configurado en este proyecto (sin jest/vitest). Este script
// ejercita excelService.js con ExcelJS real, sobre un dataset sintético que reproduce
// los escenarios reportados como bug: registros de rol sin datos del padrón, valores
// false, valores null/undefined, teléfonos paraguayos y un duplicado intencional.
//
// Ejecutar con: node scripts/smoke-test-excel.mjs

import assert from "node:assert/strict";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ---- Stubs mínimos de entorno navegador (document/URL/Blob) ----
let capturedBuffer = null;
globalThis.window = { location: { origin: "https://sistema-electoral.example" } };
globalThis.Blob = class {
  constructor(parts) { this._parts = parts; }
};
globalThis.document = {
  createElement: () => ({ click() {}, remove() {}, style: {}, href: "", download: "" }),
  body: { appendChild() {}, removeChild() {} },
};
globalThis.URL = {
  createObjectURL: (blob) => { capturedBuffer = Buffer.from(blob._parts[0]); return "blob:fake"; },
  revokeObjectURL: () => {},
};

const { generarExcelEstructura, buildExcelFileName } = await import("../src/services/excelService.js");
const ExcelJS = (await import("exceljs")).default;

// ======================= DATASET SINTÉTICO =======================
// padronMap: única fuente de nombre/apellido/seccional/local_votacion/mesa/orden.
// Incluye una persona NO relacionada (CI 999999) cuyo "orden" es 29, para verificar
// que ese valor no se filtra a otras filas (requisito: ningún campo debe mostrar "29"
// como fallback inventado).
const padronMap = new Map([
  ["292951", { ci: "292951", nombre: "Carla", apellido: "Nunez", seccional: "3", local_votacion: "Escuela Norte", mesa: "12", orden: 4 }],
  ["1544603", { ci: "1544603", nombre: "Ruben", apellido: "Ayala", seccional: "1", local_votacion: "Escuela Sur", mesa: "5", orden: 0 }], // orden=0 es un valor válido, no debe perderse
  ["999999", { ci: "999999", nombre: "Persona", apellido: "Ajena", seccional: "9", local_votacion: "Otra Escuela", mesa: "9", orden: 29 }],
  // 660548 y 4169902 deliberadamente NO están en el padrón (deben quedar en blanco).
]);

// Dirigente: sin nombre propio -> debe tomarlo del padrón.
const dirigentes = [
  { ci: "292951", telefono: "+595981123456", direccion_override: null, asignado_por_nombre: "Superadmin" },
];

// Coordinador: con valores false explícitos (no deben transformarse en vacío ni en "29").
const coordinadores = [
  {
    ci: "1544603",
    telefono: "+595982000000",
    direccion_override: "Av. Test 123",
    asignado_por_nombre: "Carla Nunez",
    asignado_por_rol: "dirigente",
  },
];

// Subcoordinador: confirmado=false explícito, sin datos de padrón (660548 no está en el padrón).
const subcoordinadores = [
  {
    ci: "660548",
    telefono: null, // sin teléfono -> debe quedar vacío, no "29" ni "No"
    confirmado: false,
    asignado_por_nombre: "Ruben Ayala",
    asignado_por_rol: "coordinador",
  },
];

// Votantes: incluye null/undefined explícitos, tercera_edad=false, un duplicado intencional
// (mismo CI+rol repetido) y un CI (4169902) ausente del padrón.
const votantes = [
  {
    ci: "4169902",
    telefono: "+595983111222",
    tercera_edad: false,
    voto_confirmado: true,
    asignado_por: "660548",
    asignado_por_rol: "subcoordinador",
    asignado_por_nombre: "Rosa Diaz",
  },
  {
    ci: "4169902", // duplicado intencional — no debe listarse ni contarse dos veces
    telefono: "+595983111222",
    tercera_edad: false,
    voto_confirmado: true,
    asignado_por: "660548",
    asignado_por_rol: "subcoordinador",
    asignado_por_nombre: "Rosa Diaz",
  },
  {
    ci: "9111222",
    nombre: undefined,
    telefono: undefined,
    tercera_edad: null,
    voto_confirmado: null, // sin confirmar todavía -> celda vacía, no "No"
    asignado_por: null,
    asignado_por_rol: null,
    asignado_por_nombre: null,
  },
  {
    ci: "9111223",
    telefono: "+595984333444",
    tercera_edad: true,
    voto_confirmado: false, // false explícito -> "No", no vacío
    asignado_por: "660548",
    asignado_por_rol: "subcoordinador",
  },
];

await generarExcelEstructura({
  prefix: "estructura-electoral-completa",
  persona: null,
  roles: ["dirigente", "coordinador", "subcoordinador", "votante"],
  dirigentes,
  coordinadores,
  subcoordinadores,
  votantes,
  padronMap,
  incluirTerceraEdad: true, // este export simula la descarga de superadmin (ver TEST 11 para el caso contrario)
});

assert.ok(capturedBuffer, "generarExcelEstructura debe producir un buffer descargable");

const tmpDir = mkdtempSync(join(tmpdir(), "excel-smoke-"));
const filePath = join(tmpDir, "smoke.xlsx");
writeFileSync(filePath, capturedBuffer);

const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile(filePath);

const resumen = workbook.getWorksheet("Resumen");
const estructura = workbook.getWorksheet("Estructura");
assert.ok(resumen && estructura, "el workbook debe tener las hojas Resumen y Estructura");

// ---- Índice de filas de Estructura por CI (columna 4) para poder buscar por persona ----
const filas = {};
for (let r = 2; r <= estructura.rowCount; r++) {
  const row = estructura.getRow(r);
  const ci = row.getCell(4).value;
  filas[ci] = row;
}

const col = { nivel: 1, nombre: 2, apellido: 3, ci: 4, telefono: 5, seccional: 6, local: 7, mesa: 8, orden: 9, terceraEdad: 10, votoConfirmado: 11, asignadoPor: 12, asignadoPorRol: 13, direccion: 14 };

// ======================= TEST 1: nombre/apellido/seccional/local/mesa/orden vienen del padrón =======================
{
  const fila = filas["292951"];
  assert.equal(fila.getCell(col.nombre).value, "Carla", "el dirigente sin nombre propio debe tomar el nombre del padrón");
  assert.equal(fila.getCell(col.apellido).value, "Nunez");
  assert.equal(fila.getCell(col.seccional).value, "3");
  assert.equal(fila.getCell(col.local).value, "Escuela Norte");
  assert.equal(fila.getCell(col.mesa).value, "12");
  assert.equal(fila.getCell(col.orden).value, "4");
  console.log("OK 1: nombre/apellido/seccional/local/mesa/orden provienen del padrón");
}

// ---- orden=0 (valor válido) no debe perderse ni tratarse como ausente ----
{
  const fila = filas["1544603"];
  assert.equal(fila.getCell(col.orden).value, "0", "orden=0 es un valor real del padrón y no debe descartarse ni quedar vacío");
  console.log("OK 2: orden=0 se preserva (no se pierde por falsy)");
}

// ======================= TEST 3: ningún campo contiene "29" como fallback inventado =======================
{
  for (const ci of Object.keys(filas)) {
    if (ci === "999999") continue; // esa persona (ajena) sí tiene orden=29 legítimamente, pero no está en este dataset
    const fila = filas[ci];
    for (const [campo, idx] of Object.entries(col)) {
      if (campo === "orden") continue; // orden puede legítimamente valer "29" para su propio dueño; acá no aplica
      const val = fila.getCell(idx).value;
      assert.notEqual(val, "29", `CI ${ci}: la columna "${campo}" no debe contener "29" como fallback inventado (valor: ${JSON.stringify(val)})`);
    }
  }
  console.log('OK 3: ningún campo muestra "29" como fallback inventado');
}

// ======================= TEST 4: vacíos genuinos permanecen vacíos =======================
{
  const fila = filas["660548"]; // subcoordinador sin padrón y sin teléfono
  assert.equal(fila.getCell(col.nombre).value, "", "sin match en el padrón, nombre debe quedar vacío (no inventado)");
  assert.equal(fila.getCell(col.seccional).value, "");
  assert.equal(fila.getCell(col.telefono).value, "", "sin teléfono, la celda debe quedar vacía");

  const filaVotanteNull = filas["9111222"];
  assert.equal(filaVotanteNull.getCell(col.votoConfirmado).value, "", "voto_confirmado=null debe ser celda vacía, NUNCA 'No'");
  assert.equal(filaVotanteNull.getCell(col.terceraEdad).value, "", "tercera_edad=null debe ser celda vacía");
  assert.equal(filaVotanteNull.getCell(col.asignadoPor).value, "");
  console.log("OK 4: los vacíos genuinos permanecen vacíos (nunca 'No' ni un valor inventado)");
}

// ---- valores false explícitos SÍ deben mostrarse como "No" (no confundir con ausente) ----
{
  const filaSub = filas["660548"];
  assert.equal(filaSub.getCell(col.votoConfirmado).value, "No", "confirmado=false debe mostrarse como 'No'");

  const filaVotanteFalse = filas["9111223"];
  assert.equal(filaVotanteFalse.getCell(col.votoConfirmado).value, "No", "voto_confirmado=false debe mostrarse como 'No'");
  console.log("OK 5: valores false explícitos se muestran como 'No' (no como vacío)");
}

// ======================= TEST 6: CI y teléfono se exportan y formatean como texto =======================
{
  const fila = filas["4169902"];
  const ciCell = fila.getCell(col.ci);
  const telCell = fila.getCell(col.telefono);
  assert.equal(typeof ciCell.value, "string", "CI debe ser texto");
  assert.equal(ciCell.numFmt, "@", "la columna CI debe tener formato de texto explícito");
  assert.equal(typeof telCell.value, "string", "teléfono debe ser texto");
  assert.equal(telCell.value, "+595983111222", "el teléfono no debe perder el signo '+'");
  assert.equal(telCell.numFmt, "@", "la columna Teléfono debe tener formato de texto explícito");
  console.log("OK 6: CI y teléfono son texto, sin perder el '+' ni notación científica");
}

// ======================= TEST 7: deduplicación por rol + CI =======================
{
  const votantesUnicos = Object.keys(filas).filter((ci) => filas[ci].getCell(col.nivel).value === "Votante");
  assert.equal(votantesUnicos.length, 3, "el votante duplicado (CI 4169902) debe listarse una sola vez");
  console.log("OK 7: deduplicación por rol + CI funciona (duplicado intencional colapsado)");
}

// ======================= TEST 8: totales del Resumen coinciden con los votantes deduplicados =======================
{
  const resumenValores = {};
  resumen.eachRow((row, n) => { if (n > 1) resumenValores[row.getCell(1).value] = row.getCell(2).value; });

  assert.equal(resumenValores["Total de votantes"], 3, "Total de votantes debe reflejar el conteo ya deduplicado");
  // Confirmados: solo votantes con voto_confirmado === true (CI 4169902 x1 tras dedup). 9111222=null, 9111223=false.
  assert.equal(resumenValores["Total de votos confirmados"], 1, "Solo debe contar votantes con voto_confirmado === true");
  assert.ok(
    resumenValores["Total de votos confirmados"] <= resumenValores["Total de votantes"],
    "los votos confirmados nunca deben superar el total de votantes"
  );
  assert.equal(resumenValores["Porcentaje de confirmación"], "33%", "1 de 3 votantes confirmados = 33%");
  console.log("OK 8: totales del Resumen correctos y consistentes con los votantes deduplicados");
}

// ---- Caso borde: 0 votantes -> porcentaje debe ser 0%, nunca NaN/Infinity ----
{
  await generarExcelEstructura({
    prefix: "estructura-subcoordinador",
    persona: { ci: "1", nombre: "Test" },
    roles: ["votante"],
    subcoordinadores: [{ ci: "1", nombre: "Test" }],
    votantes: [],
    padronMap,
  });
  const filePathVacio = join(tmpDir, "smoke-sin-votantes.xlsx");
  writeFileSync(filePathVacio, capturedBuffer);

  const wbSinVotantes = new ExcelJS.Workbook();
  await wbSinVotantes.xlsx.readFile(filePathVacio);
  const resumenVacio = wbSinVotantes.getWorksheet("Resumen");
  const valores = {};
  resumenVacio.eachRow((row, n) => { if (n > 1) valores[row.getCell(1).value] = row.getCell(2).value; });
  assert.equal(valores["Porcentaje de confirmación"], "0%", "sin votantes, el porcentaje debe ser 0% (nunca NaN)");
  console.log("OK 9: 0 votantes -> porcentaje 0% (sin división por cero)");
}

// ======================= TEST 10: nombre de archivo seguro por alcance =======================
{
  assert.equal(buildExcelFileName("estructura-electoral-completa", null), "estructura-electoral-completa.xlsx");
  assert.equal(
    buildExcelFileName("estructura-dirigente", { nombre: "Carla", apellido: "Nuñez", ci: "292951" }),
    "estructura-dirigente-carla-nunez-292951.xlsx"
  );
  console.log("OK 10: nombres de archivo seguros y consistentes con el alcance exportado");
}

// ======================= TEST 11: columna "Tercera edad" exclusiva de superadmin =======================
// incluirTerceraEdad=false (dirigente/coordinador/subcoordinador descargando su
// propio Excel) no debe incluir la columna en absoluto, ni siquiera vacía.
{
  await generarExcelEstructura({
    prefix: "estructura-dirigente",
    persona: { ci: "292951", nombre: "Carla", apellido: "Nunez" },
    roles: ["votante"],
    dirigentes: [{ ci: "292951", nombre: "Carla", apellido: "Nunez" }],
    votantes,
    padronMap,
    incluirTerceraEdad: false,
  });
  const filePathSinTercera = join(tmpDir, "smoke-sin-tercera-edad.xlsx");
  writeFileSync(filePathSinTercera, capturedBuffer);

  const wbSinTercera = new ExcelJS.Workbook();
  await wbSinTercera.xlsx.readFile(filePathSinTercera);
  const estructuraSinTercera = wbSinTercera.getWorksheet("Estructura");
  const encabezados = estructuraSinTercera.getRow(1).values.filter(Boolean);
  assert.ok(
    !encabezados.includes("Tercera edad"),
    `la columna "Tercera edad" no debe existir cuando incluirTerceraEdad=false (encabezados: ${JSON.stringify(encabezados)})`
  );
  console.log('OK 11a: incluirTerceraEdad=false omite la columna "Tercera edad" por completo');

  // La misma llamada omitiendo el parámetro (default false) debe comportarse igual,
  // por si algún llamador futuro olvida pasarlo explícitamente.
  await generarExcelEstructura({
    prefix: "estructura-coordinador",
    persona: { ci: "1544603", nombre: "Ruben", apellido: "Ayala" },
    roles: ["votante"],
    coordinadores: [{ ci: "1544603", nombre: "Ruben", apellido: "Ayala" }],
    votantes,
    padronMap,
  });
  const filePathDefault = join(tmpDir, "smoke-default-sin-tercera-edad.xlsx");
  writeFileSync(filePathDefault, capturedBuffer);
  const wbDefault = new ExcelJS.Workbook();
  await wbDefault.xlsx.readFile(filePathDefault);
  const encabezadosDefault = wbDefault.getWorksheet("Estructura").getRow(1).values.filter(Boolean);
  assert.ok(
    !encabezadosDefault.includes("Tercera edad"),
    "sin pasar incluirTerceraEdad, el valor por defecto (false) debe omitir la columna"
  );
  console.log('OK 11b: el valor por defecto de incluirTerceraEdad (false) también omite la columna');
}

console.log("\nTodas las pruebas de humo de excelService.js pasaron correctamente.");
