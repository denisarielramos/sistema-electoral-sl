// ======================= PRUEBA: MIGRACIÓN CONTRA ESQUEMA CON votantes.ci bigint =======================
// Un intento real de aplicar supabase/migrations/20260727100000_mapeo_territorial_bitacora.sql
// en producción falló con:
//   ERROR 42804: foreign key constraint "hogar_votantes_votante_ci_fkey" cannot be
//   implemented. DETAIL: hogar_votantes.votante_ci y votantes.ci son de tipos
//   incompatibles: text y bigint.
// Es decir: votantes.ci es bigint en el esquema real, no text. Los smoke tests
// existentes (scripts/smoke-test-mapeo-bitacora.mjs) usan un mock en JS que no
// modela tipos de columna SQL, así que no habrían detectado este problema — esta
// prueba SÍ aplica la migración real contra un Postgres real con un esquema base
// que imita el de producción (votantes/dirigentes/coordinadores/subcoordinadores
// con ci bigint), y ejercita las funciones RPC de punta a punta.
//
// Requiere un servidor PostgreSQL local alcanzable (createdb/psql/dropdb) — NUNCA
// se conecta a Supabase ni ejecuta nada contra un proyecto real; usa una base de
// datos descartable local. Si no hay un Postgres local disponible, la prueba se
// omite con un mensaje claro (no falla el resto de la suite).
import { execFileSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import path from "node:path";
import os from "node:os";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRACION = path.join(__dirname, "..", "supabase", "migrations", "20260727100000_mapeo_territorial_bitacora.sql");
// Sufijo aleatorio: evita colisionar con una base de datos real que alguien más
// haya creado con este mismo nombre (aunque el servidor sea local).
const DB = `mapeo_bigint_ci_test_${process.pid}_${randomBytes(4).toString("hex")}`;

const PG_ENV = { ...process.env };

const psql = (args, input) => {
  const argv = ["-v", "ON_ERROR_STOP=1", "-X", "-q", ...args];
  return execFileSync("psql", argv, { env: PG_ENV, input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
};

const puedeConectar = () => {
  try {
    execFileSync("psql", ["-X", "-q", "-c", "SELECT 1;"], { env: PG_ENV, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

// No basta con confiar en que PGHOST/PGSERVICE "parecen" locales: cualquiera de
// los dos puede apuntar a un cluster remoto o compartido sin que se note a
// simple vista, y este script hace DROP/CREATE DATABASE. Se le pregunta
// directamente al servidor con el que efectivamente se conectó: si
// inet_server_addr() es NULL, la conexión es por socket Unix (siempre local);
// si no, solo se acepta loopback (127.0.0.1/::1).
const esServidorLocal = () => {
  try {
    const salida = execFileSync(
      "psql",
      ["-X", "-q", "-t", "-A", "-c", "SELECT COALESCE(host(inet_server_addr()), '');"],
      { env: PG_ENV, encoding: "utf8" },
    );
    const host = salida.trim();
    return host === "" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
};

const BASE_SCHEMA_SQL = `
CREATE TABLE dirigentes (
  ci bigint PRIMARY KEY, nombre text, apellido text, telefono text,
  login_code text UNIQUE, activo boolean NOT NULL DEFAULT true
);
CREATE TABLE coordinadores (
  ci bigint PRIMARY KEY, nombre text, apellido text, telefono text,
  login_code text UNIQUE, dirigente_ci bigint REFERENCES dirigentes(ci)
);
CREATE TABLE subcoordinadores (
  ci bigint PRIMARY KEY, nombre text, apellido text, telefono text,
  login_code text UNIQUE, coordinador_ci bigint REFERENCES coordinadores(ci)
);
-- votantes NO tiene nombre/apellido en el esquema real — esos campos viven en
-- padron (ver bug "column v.nombre does not exist" que motivó esta corrección).
-- Se omiten deliberadamente acá para que este test hubiera detectado ese bug.
CREATE TABLE votantes (
  ci bigint PRIMARY KEY, telefono text,
  dirigente_ci bigint REFERENCES dirigentes(ci), coordinador_ci bigint REFERENCES coordinadores(ci),
  asignado_por bigint, asignado_por_rol text,
  activo boolean NOT NULL DEFAULT true, voto_confirmado boolean NOT NULL DEFAULT false
);
CREATE TABLE padron (
  ci bigint PRIMARY KEY, nombre text, apellido text,
  seccional text, local_votacion text, mesa text, orden text, direccion text
);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
END $$;

INSERT INTO dirigentes (ci, nombre, apellido, login_code, activo) VALUES (1000001, 'Dir', 'Uno', 'DIR0001', true);
INSERT INTO coordinadores (ci, nombre, apellido, login_code, dirigente_ci) VALUES (2000001, 'Coord', 'Uno', 'COO0001', 1000001);
INSERT INTO subcoordinadores (ci, nombre, apellido, login_code, coordinador_ci) VALUES (3000001, 'Sub', 'Uno', 'SUB0001', 2000001);
-- Código deliberadamente duplicado entre dirigentes y coordinadores (login_code solo
-- es UNIQUE dentro de cada tabla, no entre las 3) — usado para probar que
-- mapeo_identidad rechaza la ambigüedad en vez de resolver un rol arbitrario.
INSERT INTO dirigentes (ci, nombre, apellido, login_code, activo) VALUES (1000009, 'Dir', 'Ambiguo', 'DUP0001', true);
INSERT INTO coordinadores (ci, nombre, apellido, login_code, dirigente_ci) VALUES (2000009, 'Coord', 'Ambiguo', 'DUP0001', 1000001);
INSERT INTO votantes (ci, dirigente_ci, coordinador_ci, asignado_por, asignado_por_rol, activo) VALUES
  (4000001, NULL, NULL, 3000001, 'subcoordinador', true),
  (4000002, 1000001, NULL, 1000001, 'dirigente', true),
  (4000003, NULL, NULL, 9999999, 'subcoordinador', true);
-- padron: 4000002 sí tiene fila (caso normal, usado por mapeo_listar_hogares/
-- listar_visitas más abajo). 4000001 deliberadamente NO tiene fila de padron, para
-- probar que la ausencia no descarta al votante del listado (LEFT JOIN), solo deja
-- nombre/apellido vacíos.
INSERT INTO padron (ci, nombre, apellido) VALUES (4000002, 'Directo', 'DelDirigente');
`;

const ASSERTIONS_SQL = `
DO $$
DECLARE v_tipo text;
BEGIN
  SELECT data_type INTO v_tipo FROM information_schema.columns
    WHERE table_schema='public' AND table_name='hogar_votantes' AND column_name='votante_ci';
  IF v_tipo IS DISTINCT FROM 'bigint' THEN
    RAISE EXCEPTION 'FALLO: hogar_votantes.votante_ci debería ser bigint, es %', v_tipo;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hogar_votantes_votante_ci_fkey') THEN
    RAISE EXCEPTION 'FALLO: falta la FK hogar_votantes_votante_ci_fkey';
  END IF;
END $$;

DO $$
DECLARE
  v_hogar_id uuid;
  v_fila hogar_votantes;
BEGIN
  SELECT id INTO v_hogar_id FROM mapeo_crear_hogar('DIR0001', NULL, 'Hogar Test', 'Dir X', '', -25.3, -57.6, 10);
  IF v_hogar_id IS NULL THEN RAISE EXCEPTION 'FALLO: mapeo_crear_hogar no devolvió un hogar'; END IF;

  SELECT * INTO v_fila FROM mapeo_asociar_votante('DIR0001', NULL, v_hogar_id, '4000002');
  IF v_fila.votante_ci IS DISTINCT FROM 4000002 THEN
    RAISE EXCEPTION 'FALLO: votante_ci esperado 4000002, obtuvo %', v_fila.votante_ci;
  END IF;
END $$;

DO $$
DECLARE v_votantes jsonb;
BEGIN
  SELECT votantes INTO v_votantes FROM mapeo_listar_hogares('DIR0001', NULL) WHERE nombre_familia = 'Hogar Test';
  IF jsonb_typeof(v_votantes -> 0 -> 'ci') <> 'string' THEN
    RAISE EXCEPTION 'FALLO: se esperaba votantes[0].ci como string JSON, es %', jsonb_typeof(v_votantes -> 0 -> 'ci');
  END IF;
  IF (v_votantes -> 0 ->> 'ci') <> '4000002' THEN
    RAISE EXCEPTION 'FALLO: ci esperado "4000002", obtuvo %', (v_votantes -> 0 ->> 'ci');
  END IF;
  -- Regresión del bug "column v.nombre does not exist": votantes no tiene
  -- nombre/apellido, deben venir de padron vía el LEFT JOIN de mapeo_listar_hogares.
  IF (v_votantes -> 0 ->> 'nombre') <> 'Directo' OR (v_votantes -> 0 ->> 'apellido') <> 'DelDirigente' THEN
    RAISE EXCEPTION 'FALLO: nombre/apellido esperados "Directo"/"DelDirigente" (desde padron), obtuvo %/%', (v_votantes -> 0 ->> 'nombre'), (v_votantes -> 0 ->> 'apellido');
  END IF;
END $$;

DO $$
DECLARE v_votantes jsonb;
BEGIN
  -- mapeo_confirmar_visita + mapeo_listar_visitas: misma regresión que arriba, pero
  -- para la bitácora de visitas (mapeo_listar_visitas tiene su propio LEFT JOIN a
  -- padron, independiente del de mapeo_listar_hogares).
  PERFORM mapeo_confirmar_visita('DIR0001', NULL, (SELECT id FROM mapeo_listar_hogares('DIR0001', NULL) WHERE nombre_familia = 'Hogar Test'), -25.3, -57.6, 10);
  SELECT votantes INTO v_votantes FROM mapeo_listar_visitas('DIR0001', NULL, NULL) LIMIT 1;
  IF (v_votantes -> 0 ->> 'nombre') <> 'Directo' OR (v_votantes -> 0 ->> 'apellido') <> 'DelDirigente' THEN
    RAISE EXCEPTION 'FALLO: mapeo_listar_visitas: nombre/apellido esperados "Directo"/"DelDirigente" (desde padron), obtuvo %/%', (v_votantes -> 0 ->> 'nombre'), (v_votantes -> 0 ->> 'apellido');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT mapeo_votante_en_alcance(4000001::bigint, '2000001', 'coordinador') THEN
    RAISE EXCEPTION 'FALLO: el coordinador de la rama debería ver al votante de su subcoordinador';
  END IF;
  IF mapeo_votante_en_alcance(4000003::bigint, '2000001', 'coordinador') THEN
    RAISE EXCEPTION 'FALLO: el coordinador NO debería ver un votante ajeno';
  END IF;
  IF NOT mapeo_votante_en_alcance(4000002::bigint, '1000001', 'dirigente') THEN
    RAISE EXCEPTION 'FALLO: el dirigente debería ver a su votante directo';
  END IF;
END $$;

DO $$
DECLARE
  v_hogar_id uuid;
  v_error text;
BEGIN
  SELECT id INTO v_hogar_id FROM mapeo_crear_hogar('DIR0001', NULL, 'Hogar Test 2', 'Dir Y', '', -25.3, -57.6, 10);
  BEGIN
    PERFORM mapeo_asociar_votante('DIR0001', NULL, v_hogar_id, 'no-es-un-ci');
    RAISE EXCEPTION 'FALLO: se esperaba que un votante_ci no numérico lanzara excepción';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
    IF v_error NOT ILIKE '%CI inválido%' THEN
      RAISE EXCEPTION 'FALLO: mensaje de error inesperado: %', v_error;
    END IF;
  END;
END $$;

DO $$
DECLARE
  v_hogar_id uuid;
  v_hogar_id_2 uuid;
BEGIN
  SELECT id INTO v_hogar_id FROM mapeo_crear_hogar('DIR0001', NULL, 'Hogar Test 3', 'Dir Z', '', -25.3, -57.6, 10);
  PERFORM mapeo_asociar_votante('DIR0001', NULL, v_hogar_id, '4000001');
  PERFORM mapeo_desasociar_votante('DIR0001', NULL, v_hogar_id, '4000001');
  IF EXISTS (SELECT 1 FROM hogar_votantes WHERE hogar_id = v_hogar_id AND votante_ci = 4000001 AND activo = true) THEN
    RAISE EXCEPTION 'FALLO: el votante debería haber quedado desasociado (activo=false)';
  END IF;
  SELECT id INTO v_hogar_id_2 FROM mapeo_crear_hogar('DIR0001', NULL, 'Hogar Test 4', 'Dir W', '', -25.3, -57.6, 10);
  PERFORM mapeo_asociar_votante('DIR0001', NULL, v_hogar_id_2, '4000001');
END $$;

DO $$
DECLARE v_votantes jsonb;
BEGIN
  -- 4000001 no tiene fila en padron (a propósito, ver BASE_SCHEMA_SQL): el LEFT JOIN
  -- de mapeo_listar_hogares no debe descartarlo del listado por eso, solo devolver
  -- nombre/apellido vacíos en vez de NULL.
  SELECT votantes INTO v_votantes FROM mapeo_listar_hogares('DIR0001', NULL) WHERE nombre_familia = 'Hogar Test 4';
  IF v_votantes IS NULL OR jsonb_array_length(v_votantes) <> 1 THEN
    RAISE EXCEPTION 'FALLO: el votante sin fila de padron no debería haber sido descartado del listado, votantes=%', v_votantes;
  END IF;
  IF (v_votantes -> 0 ->> 'ci') <> '4000001' THEN
    RAISE EXCEPTION 'FALLO: ci esperado "4000001", obtuvo %', (v_votantes -> 0 ->> 'ci');
  END IF;
  IF (v_votantes -> 0 ->> 'nombre') <> '' OR (v_votantes -> 0 ->> 'apellido') <> '' THEN
    RAISE EXCEPTION 'FALLO: se esperaba nombre/apellido vacíos (sin fila de padron), obtuvo %/%', (v_votantes -> 0 ->> 'nombre'), (v_votantes -> 0 ->> 'apellido');
  END IF;
END $$;

DO $$
DECLARE v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM mapeo_listar_hogares(NULL, '9999999');
  IF v_count < 3 THEN RAISE EXCEPTION 'FALLO: superadmin debería ver al menos 3 hogares, vio %', v_count; END IF;
END $$;

-- login_code solo es UNIQUE dentro de cada tabla (dirigentes/coordinadores/
-- subcoordinadores), no entre las 3 — DUP0001 existe tanto en dirigentes como en
-- coordinadores (ver BASE_SCHEMA_SQL). mapeo_identidad debe rechazar esta ambigüedad
-- en vez de resolver un rol arbitrario (que podría no coincidir con el rol con el que
-- src/App.jsx autenticó realmente a la sesión, ver comentario en la definición).
DO $$
DECLARE v_error text;
BEGIN
  BEGIN
    PERFORM * FROM mapeo_identidad('DUP0001');
    RAISE EXCEPTION 'FALLO: se esperaba que un login_code ambiguo (2 roles) lanzara excepción';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
    IF v_error NOT ILIKE '%ambigu%' THEN
      RAISE EXCEPTION 'FALLO: mensaje de error inesperado para login_code ambiguo: %', v_error;
    END IF;
  END;
END $$;

SELECT 'TODAS LAS PRUEBAS PASARON' AS resultado;
`;

const escribirTmp = (nombre, contenido) => {
  const ruta = path.join(os.tmpdir(), nombre);
  writeFileSync(ruta, contenido, { mode: 0o644 });
  return ruta;
};

async function main() {
  if (!puedeConectar()) {
    console.log("SKIP: no hay un servidor PostgreSQL local alcanzable (psql). Esta prueba requiere un Postgres local descartable — ver comentario al inicio del archivo.");
    return;
  }

  if (!esServidorLocal()) {
    console.log("SKIP: el servidor PostgreSQL alcanzable no es local (ni socket Unix ni loopback 127.0.0.1/::1). Por seguridad, esta prueba se niega a crear/eliminar bases de datos contra un host remoto o compartido — ajuste PGHOST/PGSERVICE a un Postgres local descartable.");
    return;
  }

  try {
    execFileSync("psql", ["-X", "-q", "-c", `DROP DATABASE IF EXISTS ${DB};`], { env: PG_ENV, stdio: "ignore" });
    execFileSync("psql", ["-X", "-q", "-c", `CREATE DATABASE ${DB};`], { env: PG_ENV, stdio: "ignore" });

    const basePath = escribirTmp(`${DB}-base.sql`, BASE_SCHEMA_SQL);
    const assertPath = escribirTmp(`${DB}-assert.sql`, ASSERTIONS_SQL);

    psql(["-d", DB, "-f", basePath]);
    // Aplica la migración real dos veces seguidas: valida que aplique limpio contra
    // el esquema bigint (regresión del bug original) Y que sea seguro re-ejecutarla
    // (requisito de idempotencia) sin perder los datos sembrados por la primera pasada.
    psql(["-d", DB, "-f", MIGRACION]);
    psql(["-d", DB, "-f", MIGRACION]);
    const salida = psql(["-d", DB, "-f", assertPath]);

    unlinkSync(basePath);
    unlinkSync(assertPath);

    if (!salida.includes("TODAS LAS PRUEBAS PASARON")) {
      throw new Error(`Salida inesperada del script de aserciones:\n${salida}`);
    }

    console.log("OK: test-schema-bigint-ci — la migración aplica y funciona correctamente contra un esquema con votantes.ci bigint (aplicada dos veces, sin pérdida de datos).");
  } finally {
    try {
      execFileSync("psql", ["-X", "-q", "-c", `DROP DATABASE IF EXISTS ${DB};`], { env: PG_ENV, stdio: "ignore" });
    } catch {
      // best-effort cleanup
    }
  }
}

main().catch((err) => {
  console.error("FALLO: test-schema-bigint-ci");
  console.error(err.stdout ? err.stdout.toString() : err.message);
  console.error(err.stderr ? err.stderr.toString() : "");
  process.exit(1);
});
