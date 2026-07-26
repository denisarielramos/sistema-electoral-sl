// ======================= PRUEBA DE HUMO: CORRECCIONES DE REVISIÓN (Codex) =======================
// No hay framework de test configurado en este proyecto (sin jest/vitest). Este script
// ejercita, con node:assert/strict, las tres correcciones pedidas en la revisión de
// Codex sobre el PR #16:
//
//   1) El total de votantes de un coordinador en "Verificar estructura" debe incluir
//      directos + los de todos sus subcoordinadores, sin duplicados.
//   2) VistaSeccional debe mostrar un aviso claro + botón "Reintentar" cuando falla la
//      carga del padrón (padronError), en vez de mostrar todo como "Sin dato" en silencio.
//   3) La búsqueda (interna y en Vista por seccional) debe encontrar una CI sin importar
//      el formato: "4630621", "4.630.621", "4 630 621", "4-630-621".
//
// Ejecutar con: node scripts/smoke-test-codex-fixes.mjs

import assert from "node:assert/strict";
import { readFile, writeFile, unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ======================= CASO 1: TOTAL DEL COORDINADOR (directos + de subs, sin duplicados) =======================
{
  const {
    getMisVotantes,
    getVotantesDirectosCoord,
    getTodosVotantesCoord,
  } = await import("../src/utils/estructuraHelpers.js");

  const estructura = {
    dirigentes: [],
    coordinadores: [{ ci: "1000001", dirigente_ci: "9999999" }],
    subcoordinadores: [
      { ci: "2000001", coordinador_ci: "1000001" },
      { ci: "2000002", coordinador_ci: "1000001" },
    ],
    votantes: [
      // Directos del coordinador (asignado_por_rol="coordinador")
      { ci: "3000001", coordinador_ci: "1000001", asignado_por: "1000001", asignado_por_rol: "coordinador" },
      { ci: "3000002", coordinador_ci: "1000001", asignado_por: "1000001", asignado_por_rol: "coordinador" },
      // De subcoordinador 2000001
      { ci: "3000003", coordinador_ci: "1000001", asignado_por: "2000001", asignado_por_rol: "subcoordinador" },
      { ci: "3000004", coordinador_ci: "1000001", asignado_por: "2000001", asignado_por_rol: "subcoordinador" },
      // De subcoordinador 2000002
      { ci: "3000005", coordinador_ci: "1000001", asignado_por: "2000002", asignado_por_rol: "subcoordinador" },
      // Votante inactivo: no debe contarse en ningún lado
      { ci: "3000006", coordinador_ci: "1000001", asignado_por: "2000002", asignado_por_rol: "subcoordinador", activo: false },
      // Votante de OTRO coordinador: no debe filtrarse acá
      { ci: "3000007", coordinador_ci: "9999998", asignado_por: "9999998", asignado_por_rol: "coordinador" },
    ],
  };

  const directos = getVotantesDirectosCoord(estructura, "1000001");
  const misVotantes = getMisVotantes(estructura, "1000001");
  const total = getTodosVotantesCoord(estructura, "1000001");

  assert.equal(directos.length, 2, "getVotantesDirectosCoord debe devolver solo los 2 directos");
  assert.equal(misVotantes.length, 2, "getMisVotantes (alias) debe seguir devolviendo solo directos");
  assert.equal(total.length, 5, "getTodosVotantesCoord debe sumar directos + los de ambos subs (2+2+1=5)");

  const cis = total.map((v) => v.ci);
  assert.equal(new Set(cis).size, cis.length, "getTodosVotantesCoord no debe tener CIs duplicados");
  assert.ok(!cis.includes("3000006"), "un votante inactivo no debe contarse en el total");
  assert.ok(!cis.includes("3000007"), "un votante de otro coordinador no debe contarse");

  console.log("OK: caso 1 (total del coordinador = directos + de todos sus subs, sin duplicados)");
}

// ======================= CASO 2: CI CON CUALQUIER FORMATO =======================
{
  const { personaCoincideConsulta } = await import("../src/utils/busquedaHelpers.js");

  const persona = { nombre: "Denis", apellido: "Ramos", ci: "4630621", telefono: "+595981123456" };

  for (const consulta of ["4630621", "4.630.621", "4 630 621", "4-630-621"]) {
    assert.ok(
      personaCoincideConsulta(persona, consulta),
      `debe encontrar la CI 4630621 al buscar "${consulta}"`
    );
  }

  assert.ok(
    !personaCoincideConsulta(persona, "4630622"),
    "una CI distinta (aunque parecida) no debe matchear"
  );

  // La búsqueda por nombre/apellido/teléfono debe seguir funcionando sin verse afectada.
  assert.ok(personaCoincideConsulta(persona, "denis ramos"), "debe seguir matcheando por nombre y apellido");
  assert.ok(personaCoincideConsulta(persona, "0981123456"), "debe seguir matcheando por teléfono en formato local");

  // Consulta mixta (nombre + CI formateada): el fragmento numérico NO debe matchear por
  // sí solo si el resto de la consulta (el nombre) no corresponde a esta persona.
  assert.ok(
    !personaCoincideConsulta(persona, "Ana 4.630.621"),
    'una consulta mixta con un nombre que no corresponde ("Ana") no debe matchear aunque la CI sea correcta'
  );
  // Pero si el nombre SÍ corresponde, la consulta mixta debe seguir matcheando.
  assert.ok(
    personaCoincideConsulta(persona, "Denis 4.630.621"),
    "una consulta mixta con el nombre correcto y la CI correcta debe matchear"
  );

  // Teléfono con formato completo (con espacios entre código de país y el resto): el
  // token aislado "+595" no debe romper el AND por palabra.
  for (const consulta of ["+595 981 123456", "+595 981 123 456", "0981 123 456"]) {
    assert.ok(
      personaCoincideConsulta(persona, consulta),
      `debe encontrar el teléfono al buscar "${consulta}"`
    );
  }

  console.log("OK: caso 3 (búsqueda por CI/teléfono encuentra distintos formatos, sin falsos positivos en consultas mixtas)");
}

// ======================= CASO 3: AVISO DE ERROR + REINTENTAR EN VistaSeccional =======================
{
  const vite = await import("vite");
  const React = (await import("react")).default;
  const { renderToStaticMarkup } = await import("react-dom/server");

  const srcPath = join(__dirname, "../src/components/VistaSeccional.jsx");
  const tmpPath = join(__dirname, "../src/components/__tmp_smoke_test_VistaSeccional.mjs");

  const source = await readFile(srcPath, "utf8");
  const { code } = await vite.transformWithEsbuild(source, srcPath, {
    loader: "jsx",
    jsx: "automatic",
    jsxImportSource: "react",
  });

  // Node ESM (a diferencia de Vite) exige extensión explícita en imports relativos.
  const codeConExtension = code.replace(
    /from\s+"(\.\.?\/[^"]+)"/g,
    (match, spec) => (/\.[a-zA-Z]+$/.test(spec) ? match : `from "${spec}.js"`)
  );

  await writeFile(tmpPath, codeConExtension);
  let VistaSeccional;
  try {
    ({ default: VistaSeccional } = await import(`${tmpPath}?t=${Date.now()}`));
  } finally {
    await unlink(tmpPath);
  }

  const estructura = { dirigentes: [], coordinadores: [], subcoordinadores: [], votantes: [] };
  const baseProps = { estructura, padronMap: new Map(), onBack: () => {} };

  // Sin error: no debe aparecer ningún aviso de error ni botón "Reintentar".
  const htmlOk = renderToStaticMarkup(
    React.createElement(VistaSeccional, { ...baseProps, padronLoading: false, padronError: null })
  );
  assert.ok(!htmlOk.includes("Reintentar"), 'sin error no debe mostrar "Reintentar"');
  assert.ok(!htmlOk.includes("No se pudo cargar el padrón"), "sin error no debe mostrar el aviso de fallo");

  // Con error (sin reintento en curso): aviso claro + botón "Reintentar" habilitado.
  const htmlError = renderToStaticMarkup(
    React.createElement(VistaSeccional, {
      ...baseProps,
      padronLoading: false,
      padronError: "Error al cargar el padrón: fallo simulado",
      onRetryPadron: () => {},
    })
  );
  assert.ok(htmlError.includes("No se pudo cargar el padrón"), "con error debe mostrar un aviso claro");
  assert.ok(htmlError.includes("Reintentar"), 'con error debe mostrar el botón "Reintentar"');
  assert.ok(!htmlError.includes('disabled=""'), "el botón Reintentar no debe estar deshabilitado si no se está reintentando");

  // Con error Y reintento en curso: debe mantenerse el estado de carga (botón deshabilitado).
  const htmlRetrying = renderToStaticMarkup(
    React.createElement(VistaSeccional, {
      ...baseProps,
      padronLoading: true,
      padronError: "Error al cargar el padrón: fallo simulado",
      onRetryPadron: () => {},
    })
  );
  assert.ok(htmlRetrying.includes("Reintentando"), "mientras reintenta debe indicarlo");
  assert.ok(htmlRetrying.includes('disabled=""'), "el botón debe deshabilitarse mientras se reintenta la carga");

  console.log("OK: caso 2 (VistaSeccional muestra aviso + Reintentar en error, y mantiene el estado de carga al reintentar)");
}

console.log("\nTodas las pruebas de humo de la revisión de Codex pasaron correctamente.");
