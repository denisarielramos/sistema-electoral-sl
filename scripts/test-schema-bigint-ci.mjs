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
-- Dirigente "externo" (sin fila en padron, ver más abajo) — usado para probar que
-- mapeo_persona_info cae a dirigentes.nombre/apellido cuando no hay fila de padron.
INSERT INTO dirigentes (ci, nombre, apellido, login_code, activo) VALUES (1000002, 'Externo', 'SinPadron', 'DIR0002', true);
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
  (4000003, NULL, NULL, 9999999, 'subcoordinador', true),
  -- Reservado para el hogar mixto (coordinador+subcoordinador+votante): 4000001 y
  -- 4000002 ya quedan asociados a otros hogares en pruebas anteriores.
  (4000004, NULL, NULL, 3000001, 'subcoordinador', true);
-- padron: 4000002 sí tiene fila (caso normal, usado por mapeo_listar_hogares/
-- listar_visitas más abajo). 4000001 deliberadamente NO tiene fila de padron, para
-- probar que la ausencia no descarta al votante del listado (LEFT JOIN), solo deja
-- nombre/apellido vacíos. 2000001 (coordinador) también tiene fila de padron, para
-- probar que mapeo_persona_info usa padron (no coordinadores.nombre) para un
-- integrante coordinador. 1000002 (dirigente "externo") NO tiene fila de padron a
-- propósito.
INSERT INTO padron (ci, nombre, apellido) VALUES
  (4000002, 'Directo', 'DelDirigente'),
  (2000001, 'CoordDesdePadron', 'Apellido');
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
  -- Ya NO debe existir una FK contra votantes(ci): una FK normal no puede aceptar
  -- también dirigentes/coordinadores/subcoordinadores. Se reemplazó por un trigger de
  -- validación (ver el siguiente bloque).
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hogar_votantes_votante_ci_fkey') THEN
    RAISE EXCEPTION 'FALLO: hogar_votantes_votante_ci_fkey no debería existir (un hogar ahora admite cualquier jerarquía)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_hogar_votantes_validar_integrante') THEN
    RAISE EXCEPTION 'FALLO: falta el trigger trg_hogar_votantes_validar_integrante (reemplazo de la FK eliminada)';
  END IF;
END $$;

-- El trigger debe rechazar una CI que no exista en NINGUNA de las 4 tablas, aun
-- insertando directo en hogar_votantes (sin pasar por el RPC) — es la defensa que
-- reemplaza a la FK eliminada.
DO $$
DECLARE v_hogar_id uuid; v_error text;
BEGIN
  SELECT id INTO v_hogar_id FROM mapeo_crear_hogar('DIR0001', NULL, 'Hogar Trigger', 'Dir T', '', -25.3, -57.6, 10);
  BEGIN
    INSERT INTO hogar_votantes (hogar_id, votante_ci) VALUES (v_hogar_id, 8888888);
    RAISE EXCEPTION 'FALLO: se esperaba que el trigger rechazara una CI inexistente en las 4 tablas';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
    IF v_error NOT ILIKE '%no corresponde a ninguna persona activa%' THEN
      RAISE EXCEPTION 'FALLO: mensaje de error inesperado del trigger: %', v_error;
    END IF;
  END;
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

-- ======================= INTEGRANTES DE CUALQUIER JERARQUÍA (no solo votantes) =======================
-- Un hogar solo admitía personas de la tabla votantes — por eso una CI como la del
-- ejemplo real reportado (un coordinador) no aparecía en el buscador ni podía
-- asociarse, aunque también fuera electora. Estas pruebas cubren exactamente ese caso.

-- Asociar un COORDINADOR a un hogar (como lo haría su dirigente): mapeo_persona_info
-- debe resolver rol='coordinador' y nombre/apellido desde padron (no desde
-- coordinadores.nombre, que también existe pero no es la fuente prioritaria).
DO $$
DECLARE v_hogar_id uuid; v_votantes jsonb;
BEGIN
  SELECT id INTO v_hogar_id FROM mapeo_crear_hogar('DIR0001', NULL, 'Hogar Coordinador', 'Dir C', '', -25.3, -57.6, 10);
  PERFORM mapeo_asociar_votante('DIR0001', NULL, v_hogar_id, '2000001');
  SELECT votantes INTO v_votantes FROM mapeo_listar_hogares('DIR0001', NULL) WHERE nombre_familia = 'Hogar Coordinador';
  IF jsonb_array_length(v_votantes) <> 1 THEN
    RAISE EXCEPTION 'FALLO: se esperaba 1 integrante (el coordinador), obtuvo %', v_votantes;
  END IF;
  IF (v_votantes -> 0 ->> 'rol') <> 'coordinador' THEN
    RAISE EXCEPTION 'FALLO: rol esperado "coordinador", obtuvo %', (v_votantes -> 0 ->> 'rol');
  END IF;
  IF (v_votantes -> 0 ->> 'nombre') <> 'CoordDesdePadron' OR (v_votantes -> 0 ->> 'apellido') <> 'Apellido' THEN
    RAISE EXCEPTION 'FALLO: nombre/apellido del coordinador esperados desde padron ("CoordDesdePadron"/"Apellido"), obtuvo %/%', (v_votantes -> 0 ->> 'nombre'), (v_votantes -> 0 ->> 'apellido');
  END IF;
  -- Ya asociado a un hogar activo: intentar asociarlo a OTRO hogar debe rechazarse,
  -- sin importar que ahora sea un coordinador y no un votante (requisito: una misma
  -- CI solo puede pertenecer a un hogar activo, independientemente de su rol).
  DECLARE
    v_hogar_id_2 uuid;
    v_error text;
  BEGIN
    SELECT id INTO v_hogar_id_2 FROM mapeo_crear_hogar('DIR0001', NULL, 'Hogar Coordinador 2', 'Dir C2', '', -25.3, -57.6, 10);
    BEGIN
      PERFORM mapeo_asociar_votante('DIR0001', NULL, v_hogar_id_2, '2000001');
      RAISE EXCEPTION 'FALLO: se esperaba rechazo por CI ya asociada a otro hogar activo';
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
      IF v_error NOT ILIKE '%ya pertenece a otro hogar activo%' THEN
        RAISE EXCEPTION 'FALLO: mensaje de error inesperado: %', v_error;
      END IF;
    END;
  END;
END $$;

-- Un DIRIGENTE debe poder agregarse a SÍ MISMO al hogar donde vive.
DO $$
DECLARE v_hogar_id uuid; v_votantes jsonb;
BEGIN
  SELECT id INTO v_hogar_id FROM mapeo_crear_hogar('DIR0001', NULL, 'Hogar Del Dirigente', 'Dir Propio', '', -25.3, -57.6, 10);
  PERFORM mapeo_asociar_votante('DIR0001', NULL, v_hogar_id, '1000001');
  SELECT votantes INTO v_votantes FROM mapeo_listar_hogares('DIR0001', NULL) WHERE nombre_familia = 'Hogar Del Dirigente';
  IF (v_votantes -> 0 ->> 'ci') <> '1000001' OR (v_votantes -> 0 ->> 'rol') <> 'dirigente' THEN
    RAISE EXCEPTION 'FALLO: el dirigente debería poder agregarse a sí mismo, obtuvo %', v_votantes;
  END IF;
END $$;

-- Un dirigente "externo" (sin fila en padron) también debe poder pertenecer a un
-- hogar, usando dirigentes.nombre/apellido como fallback.
DO $$
DECLARE v_hogar_id uuid; v_votantes jsonb;
BEGIN
  SELECT id INTO v_hogar_id FROM mapeo_crear_hogar('DIR0002', NULL, 'Hogar Dirigente Externo', 'Dir Externo', '', -25.3, -57.6, 10);
  PERFORM mapeo_asociar_votante('DIR0002', NULL, v_hogar_id, '1000002');
  SELECT votantes INTO v_votantes FROM mapeo_listar_hogares('DIR0002', NULL) WHERE nombre_familia = 'Hogar Dirigente Externo';
  IF (v_votantes -> 0 ->> 'nombre') <> 'Externo' OR (v_votantes -> 0 ->> 'apellido') <> 'SinPadron' THEN
    RAISE EXCEPTION 'FALLO: dirigente externo debería resolver nombre/apellido desde dirigentes ("Externo"/"SinPadron"), obtuvo %/%', (v_votantes -> 0 ->> 'nombre'), (v_votantes -> 0 ->> 'apellido');
  END IF;
END $$;

-- Un hogar puede agrupar coordinador + subcoordinador + votante a la vez (las 3
-- jerarquías no-dirigente en una misma familia).
DO $$
DECLARE v_hogar_id uuid; v_votantes jsonb; v_roles text[];
BEGIN
  SELECT id INTO v_hogar_id FROM mapeo_crear_hogar('DIR0001', NULL, 'Hogar Mixto', 'Dir Mixto', '', -25.3, -57.6, 10);
  PERFORM mapeo_asociar_votante('DIR0001', NULL, v_hogar_id, '3000001'); -- subcoordinador
  PERFORM mapeo_asociar_votante('DIR0001', NULL, v_hogar_id, '4000004'); -- votante del subcoordinador
  SELECT votantes INTO v_votantes FROM mapeo_listar_hogares('DIR0001', NULL) WHERE nombre_familia = 'Hogar Mixto';
  IF jsonb_array_length(v_votantes) <> 2 THEN
    RAISE EXCEPTION 'FALLO: se esperaban 2 integrantes (subcoordinador + votante), obtuvo %', v_votantes;
  END IF;
  SELECT array_agg(x ->> 'rol' ORDER BY x ->> 'rol') INTO v_roles FROM jsonb_array_elements(v_votantes) x;
  IF v_roles <> ARRAY['subcoordinador', 'votante'] THEN
    RAISE EXCEPTION 'FALLO: roles esperados [subcoordinador, votante], obtuvo %', v_roles;
  END IF;
  -- El coordinador del subcoordinador (2000001) debe poder ver este hogar mixto
  -- (alcance transitivo), pese a que no contiene ningún votante directo suyo.
  IF NOT mapeo_hogar_en_alcance(v_hogar_id, '2000001', 'coordinador') THEN
    RAISE EXCEPTION 'FALLO: el coordinador debería tener alcance sobre un hogar que solo contiene a su subcoordinador y el votante de este';
  END IF;
END $$;

-- mapeo_persona_en_alcance: alcance jerárquico para los 4 roles (no solo votantes).
DO $$
BEGIN
  IF NOT mapeo_persona_en_alcance(2000001::bigint, '9999999', 'superadmin') THEN
    RAISE EXCEPTION 'FALLO: superadmin debería tener alcance sobre cualquier persona';
  END IF;
  IF NOT mapeo_persona_en_alcance(2000001::bigint, '1000001', 'dirigente') THEN
    RAISE EXCEPTION 'FALLO: el dirigente debería tener alcance sobre su propio coordinador';
  END IF;
  IF mapeo_persona_en_alcance(1000002::bigint, '1000001', 'dirigente') THEN
    RAISE EXCEPTION 'FALLO: un dirigente NO debería tener alcance sobre otro dirigente';
  END IF;
  IF NOT mapeo_persona_en_alcance(3000001::bigint, '2000001', 'coordinador') THEN
    RAISE EXCEPTION 'FALLO: el coordinador debería tener alcance sobre su propio subcoordinador';
  END IF;
  IF mapeo_persona_en_alcance(1000001::bigint, '2000001', 'coordinador') THEN
    RAISE EXCEPTION 'FALLO: un coordinador NO debería tener alcance sobre su propio dirigente';
  END IF;
  IF NOT mapeo_persona_en_alcance(4000001::bigint, '3000001', 'subcoordinador') THEN
    RAISE EXCEPTION 'FALLO: el subcoordinador debería tener alcance sobre su propio votante';
  END IF;
  IF mapeo_persona_en_alcance(2000001::bigint, '3000001', 'subcoordinador') THEN
    RAISE EXCEPTION 'FALLO: un subcoordinador NO debería tener alcance sobre su propio coordinador';
  END IF;
  -- Todo actor puede agregarse a sí mismo, sin importar su rol.
  IF NOT mapeo_persona_en_alcance(3000001::bigint, '3000001', 'subcoordinador') THEN
    RAISE EXCEPTION 'FALLO: un subcoordinador debería tener alcance sobre sí mismo';
  END IF;
END $$;

-- mapeo_asociar_votante debe rechazar (con mensaje claro) una CI que no exista en
-- ninguna de las 4 tablas — validación explícita en el RPC, además del trigger.
DO $$
DECLARE v_hogar_id uuid; v_error text;
BEGIN
  SELECT id INTO v_hogar_id FROM mapeo_crear_hogar('DIR0001', NULL, 'Hogar CI Inexistente', 'Dir I', '', -25.3, -57.6, 10);
  BEGIN
    PERFORM mapeo_asociar_votante('DIR0001', NULL, v_hogar_id, '7777777');
    RAISE EXCEPTION 'FALLO: se esperaba rechazo de una CI que no existe en ninguna tabla';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
    IF v_error NOT ILIKE '%no corresponde a ninguna persona activa%' THEN
      RAISE EXCEPTION 'FALLO: mensaje de error inesperado: %', v_error;
    END IF;
  END;
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
