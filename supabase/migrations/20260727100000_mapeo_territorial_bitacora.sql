-- ============================================================================
-- Mapeo territorial de votantes y bitácora de visitas
-- ============================================================================
-- Parche posterior sobre una base ya provisionada (ver supabase/migrations/README.md).
-- Este archivo NO ha sido aplicado en producción todavía — el propietario debe
-- revisarlo y ejecutarlo manualmente (Supabase SQL editor o `supabase db push`).
-- Es idempotente: puede volver a ejecutarse sin duplicar objetos ni datos.
--
-- Resumen de lo que crea:
--   1) Tablas: hogares, hogar_votantes, visitas_hogar, configuracion_mapeo.
--   2) Funciones auxiliares: distancia (Haversine), resolución de identidad por
--      login_code, chequeo de alcance jerárquico.
--   3) Funciones RPC (SECURITY DEFINER) que son la ÚNICA vía de acceso soportada
--      desde el frontend — lectura y escritura de hogares/visitas.
--   4) RLS en las 4 tablas nuevas SIN policies para anon/authenticated (deny-by-
--      default): el acceso directo a la tabla vía PostgREST queda bloqueado; todo
--      pasa por las funciones RPC, que sí pueden operar porque corren como el
--      dueño de la función (SECURITY DEFINER) y aplican el alcance en SQL.
--   5) Trigger que impide UPDATE/DELETE sobre visitas_hogar (bitácora append-only).
--
-- ── NOTA DE SEGURIDAD IMPORTANTE (leer antes de aplicar) ──────────────────────
-- El sistema NO usa Supabase Auth: superadmin es una lista hardcodeada en el
-- frontend (src/App.jsx) y dirigente/coordinador/subcoordinador entran con un
-- `login_code` de texto plano verificado con una consulta directa desde el
-- navegador, usando la misma clave anon para todos. No existe sesión de
-- Supabase Auth ni `auth.uid()` utilizable.
--
-- Consecuencia: estas funciones RPC resuelven la identidad de dirigente,
-- coordinador y subcoordinador RE-VALIDANDO `login_code` del lado del servidor
-- (parámetro p_login_code) — igual de seguro que el login actual, y más seguro
-- que confiar en un `ci`/`rol` que el cliente afirme directamente. Para
-- superadmin NO hay forma de verificar la identidad criptográficamente bajo el
-- modelo actual (sus credenciales ni siquiera están en esta base de datos), así
-- que las funciones aceptan un parámetro p_superadmin_ci que se confía al mismo
-- nivel que el resto de las acciones superadmin-only que ya existen hoy en la
-- app (alta de dirigentes, generación de códigos de acceso, etc. — ninguna de
-- ellas está protegida por RLS tampoco). Esto no es una regresión: es el mismo
-- nivel de confianza que ya tiene todo el sistema. Ver docs/MAPEO_BITACORA.md
-- para la explicación completa y la mejora recomendada (Supabase Auth real).
-- ============================================================================

-- 0) Comprobación de esquema base — este parche no crea el esquema base.
DO $$
BEGIN
  IF to_regclass('public.votantes') IS NULL THEN
    RAISE EXCEPTION 'Falta la tabla "votantes". Este archivo depende del esquema base ya provisionado (ver supabase/migrations/README.md).';
  END IF;
  IF to_regclass('public.dirigentes') IS NULL THEN
    RAISE EXCEPTION 'Falta la tabla "dirigentes". Este archivo depende del esquema base ya provisionado (ver supabase/migrations/README.md).';
  END IF;
  IF to_regclass('public.coordinadores') IS NULL THEN
    RAISE EXCEPTION 'Falta la tabla "coordinadores". Este archivo depende del esquema base ya provisionado (ver supabase/migrations/README.md).';
  END IF;
  IF to_regclass('public.subcoordinadores') IS NULL THEN
    RAISE EXCEPTION 'Falta la tabla "subcoordinadores". Este archivo depende del esquema base ya provisionado (ver supabase/migrations/README.md).';
  END IF;
END $$;

-- coordinadores/subcoordinadores no tienen columna "activo" hoy (a diferencia de
-- dirigentes, que sí la tiene y ya se usa para bloquear el login — ver src/App.jsx).
-- La agregamos de forma aditiva (default true) para que mapeo_identidad pueda negar
-- el acceso a un coordinador/subcoordinador desactivado en el futuro sin depender de
-- que la columna ya exista en la base actual; no cambia el login real (src/App.jsx no
-- se toca) ni el comportamiento de ninguna fila existente.
ALTER TABLE coordinadores ADD COLUMN IF NOT EXISTS activo boolean NOT NULL DEFAULT true;
ALTER TABLE subcoordinadores ADD COLUMN IF NOT EXISTS activo boolean NOT NULL DEFAULT true;

-- ============================================================================
-- 1) TABLAS
-- ============================================================================

-- ======================= HOGARES =======================
CREATE TABLE IF NOT EXISTS hogares (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre_familia      text,
  direccion           text,
  referencia          text,
  latitud             double precision,
  longitud            double precision,
  precision_gps       double precision,
  estado              text NOT NULL DEFAULT 'pendiente'
                        CHECK (estado IN ('pendiente', 'verificado', 'rechazado')),
  creado_por_ci       text NOT NULL,
  creado_por_rol      text NOT NULL
                        CHECK (creado_por_rol IN ('superadmin', 'dirigente', 'coordinador', 'subcoordinador')),
  verificado_por_ci   text,
  verificado_por_rol  text
                        CHECK (verificado_por_rol IS NULL OR verificado_por_rol IN ('superadmin', 'dirigente')),
  fecha_verificacion  timestamptz,
  activo              boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  -- Se actualiza SOLO cuando cambian latitud/longitud (no en cualquier UPDATE, a
  -- diferencia de updated_at) — permite descartar como "última visita" cualquier
  -- fila de visitas_hogar anterior a la revisión de ubicación vigente, para que un
  -- hogar reubicado no siga mostrando el estado de una visita hecha al punto viejo.
  ubicacion_actualizada_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hogares_lat_valida CHECK (latitud IS NULL OR (latitud BETWEEN -90 AND 90)),
  CONSTRAINT hogares_lng_valida CHECK (longitud IS NULL OR (longitud BETWEEN -180 AND 180)),
  CONSTRAINT hogares_precision_valida CHECK (precision_gps IS NULL OR precision_gps >= 0)
);

COMMENT ON TABLE hogares IS 'Domicilio real de una familia (mapeo territorial). Agrupa uno o más votantes vía hogar_votantes — evita un marcador por votante.';
COMMENT ON COLUMN hogares.estado IS 'pendiente: recién cargado/corregido, esperando verificación. verificado: confirmado por dirigente/superadmin. rechazado: ubicación descartada.';

-- Defensivo (además de la columna en el CREATE TABLE de arriba): si esta migración
-- ya se aplicó una vez sin esta columna, la agrega ahora sin romper idempotencia.
-- Sin DEFAULT todavía: si se agrega con DEFAULT now() directamente, cada hogar
-- YA EXISTENTE (con visitas históricas reales, nunca reubicado) queda con
-- ubicacion_actualizada_at = ahora, más nuevo que cualquier visita pasada — todas
-- desaparecerían de ultima_visita pese a que el hogar nunca se movió. Se rellena
-- primero con created_at (línea base real de "sin reubicación todavía") y recién
-- después se fija el default now() para las filas nuevas que inserte el resto de
-- esta migración en adelante.
ALTER TABLE hogares ADD COLUMN IF NOT EXISTS ubicacion_actualizada_at timestamptz;
UPDATE hogares SET ubicacion_actualizada_at = created_at WHERE ubicacion_actualizada_at IS NULL;
ALTER TABLE hogares ALTER COLUMN ubicacion_actualizada_at SET DEFAULT now();
ALTER TABLE hogares ALTER COLUMN ubicacion_actualizada_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS ix_hogares_estado ON hogares(estado);
CREATE INDEX IF NOT EXISTS ix_hogares_creado_por ON hogares(creado_por_ci);
CREATE INDEX IF NOT EXISTS ix_hogares_activo ON hogares(activo);

-- ======================= HOGAR_VOTANTES (asociación N:M, un hogar activo por votante) =======================
CREATE TABLE IF NOT EXISTS hogar_votantes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hogar_id    uuid NOT NULL REFERENCES hogares(id),
  votante_ci  text NOT NULL REFERENCES votantes(ci),
  activo      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE hogar_votantes IS 'Asociación votante↔hogar. activo=false = desasociado (no se borra la fila: conserva historial, no afecta al hogar ni a sus visitas).';

-- Un votante no puede pertenecer a más de un hogar ACTIVO simultáneamente.
-- (también evita duplicar la misma asociación hogar+votante, porque votante_ci
-- ya queda único entre las filas activas).
CREATE UNIQUE INDEX IF NOT EXISTS ux_hogar_votantes_votante_activo
  ON hogar_votantes(votante_ci) WHERE activo;

CREATE INDEX IF NOT EXISTS ix_hogar_votantes_hogar ON hogar_votantes(hogar_id);
CREATE INDEX IF NOT EXISTS ix_hogar_votantes_votante ON hogar_votantes(votante_ci);

-- ======================= VISITAS_HOGAR (bitácora append-only) =======================
CREATE TABLE IF NOT EXISTS visitas_hogar (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hogar_id                uuid NOT NULL REFERENCES hogares(id),
  visitante_ci            text NOT NULL,
  visitante_rol           text NOT NULL
                            CHECK (visitante_rol IN ('superadmin', 'dirigente', 'coordinador', 'subcoordinador')),
  latitud                 double precision NOT NULL,
  longitud                double precision NOT NULL,
  precision_gps           double precision,
  distancia_metros        double precision,
  radio_permitido_usado   double precision NOT NULL,
  resultado               text NOT NULL
                            CHECK (resultado IN ('confirmada', 'fuera_de_radio', 'pendiente', 'cancelada', 'error_gps')),
  observacion             text,
  fecha_hora              timestamptz NOT NULL DEFAULT now(),
  creado_por_ci           text NOT NULL,
  creado_por_rol          text NOT NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT visitas_lat_valida CHECK (latitud BETWEEN -90 AND 90),
  CONSTRAINT visitas_lng_valida CHECK (longitud BETWEEN -180 AND 180)
);

COMMENT ON TABLE visitas_hogar IS 'Bitácora de intentos/visitas a un hogar. Append-only: cada intento (dentro o fuera de radio) genera una fila nueva; nunca se actualiza ni se borra (ver trigger trg_visitas_hogar_bloquear_edicion). fecha_hora es hora de servidor (now()), nunca la del navegador.';
COMMENT ON COLUMN visitas_hogar.creado_por_ci IS 'Quién disparó el registro (normalmente = visitante_ci; se separan por si en el futuro un superior registra en nombre de otro).';

CREATE INDEX IF NOT EXISTS ix_visitas_hogar_hogar ON visitas_hogar(hogar_id);
CREATE INDEX IF NOT EXISTS ix_visitas_hogar_visitante ON visitas_hogar(visitante_ci);
CREATE INDEX IF NOT EXISTS ix_visitas_hogar_fecha ON visitas_hogar(fecha_hora);
CREATE INDEX IF NOT EXISTS ix_visitas_hogar_resultado ON visitas_hogar(resultado);

-- Bitácora append-only: bloquea UPDATE/DELETE incluso para el dueño de la tabla.
CREATE OR REPLACE FUNCTION mapeo_bloquear_edicion_visitas()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'visitas_hogar es una bitácora append-only: no se permite UPDATE ni DELETE. Use un INSERT nuevo para corregir/registrar.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_visitas_hogar_bloquear_edicion ON visitas_hogar;
CREATE TRIGGER trg_visitas_hogar_bloquear_edicion
  BEFORE UPDATE OR DELETE ON visitas_hogar
  FOR EACH ROW
  EXECUTE FUNCTION mapeo_bloquear_edicion_visitas();

-- ======================= CONFIGURACION_MAPEO (fila única) =======================
CREATE TABLE IF NOT EXISTS configuracion_mapeo (
  id                            smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  radio_permitido_metros        double precision NOT NULL DEFAULT 100 CHECK (radio_permitido_metros > 0),
  precision_gps_maxima_metros   double precision NOT NULL DEFAULT 50 CHECK (precision_gps_maxima_metros > 0),
  updated_at                    timestamptz NOT NULL DEFAULT now(),
  updated_by_ci                 text,
  updated_by_rol                text
);

COMMENT ON TABLE configuracion_mapeo IS 'Configuración global del módulo de mapeo/bitácora — fila única (id=1). No hardcodear radio ni precisión GPS en el frontend: leer siempre de acá vía mapeo_configuracion_actual().';

INSERT INTO configuracion_mapeo (id, radio_permitido_metros, precision_gps_maxima_metros)
VALUES (1, 100, 50)
ON CONFLICT (id) DO NOTHING;

-- ======================= updated_at automático =======================
CREATE OR REPLACE FUNCTION mapeo_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_hogares_updated_at ON hogares;
CREATE TRIGGER trg_hogares_updated_at
  BEFORE UPDATE ON hogares
  FOR EACH ROW
  EXECUTE FUNCTION mapeo_set_updated_at();

DROP TRIGGER IF EXISTS trg_hogar_votantes_updated_at ON hogar_votantes;
CREATE TRIGGER trg_hogar_votantes_updated_at
  BEFORE UPDATE ON hogar_votantes
  FOR EACH ROW
  EXECUTE FUNCTION mapeo_set_updated_at();

-- ============================================================================
-- 2) RLS: deny-by-default en las 4 tablas nuevas (sin policies para anon/authenticated)
-- ============================================================================
-- Con RLS habilitado y CERO policies, PostgREST (anon/authenticated) no puede
-- leer ni escribir estas tablas directamente — toda operación debe pasar por las
-- funciones RPC de la sección 4, que son SECURITY DEFINER (corren como el dueño
-- de la función, que no está sujeto a RLS) y aplican el alcance jerárquico en SQL.
ALTER TABLE hogares ENABLE ROW LEVEL SECURITY;
ALTER TABLE hogar_votantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE visitas_hogar ENABLE ROW LEVEL SECURITY;
ALTER TABLE configuracion_mapeo ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON hogares FROM anon, authenticated;
REVOKE ALL ON hogar_votantes FROM anon, authenticated;
REVOKE ALL ON visitas_hogar FROM anon, authenticated;
REVOKE ALL ON configuracion_mapeo FROM anon, authenticated;

-- ============================================================================
-- 3) FUNCIONES AUXILIARES (uso interno de las funciones RPC)
-- ============================================================================

-- ¿p es un número finito (ni NULL, ni NaN, ni +/-Infinity)? PostgreSQL, a diferencia
-- de IEEE 754 en la mayoría de los lenguajes, define NaN = NaN como verdadero (para
-- poder ordenar/indexar valores NaN de forma consistente) y NaN > cualquier otro valor
-- incluido Infinity — por eso "p != p" o "p > límite" NUNCA detectan NaN acá, y hay que
-- comparar contra los literales 'NaN'/'Infinity' explícitamente.
CREATE OR REPLACE FUNCTION mapeo_es_finito(p double precision)
RETURNS boolean AS $$
  SELECT p IS NOT NULL
    AND p != 'NaN'::double precision
    AND p != 'Infinity'::double precision
    AND p != '-Infinity'::double precision;
$$ LANGUAGE sql IMMUTABLE;

-- Lanza excepción si p_precision_gps es negativa o no-finita (NaN/Infinity). NULL
-- (dispositivo no reporta precisión) es válido y no lanza nada. Compartida por las
-- 3 funciones RPC que reciben precision_gps (crear/actualizar hogar y confirmar
-- visita) para no duplicar el chequeo en cada una.
CREATE OR REPLACE FUNCTION mapeo_validar_precision_gps(p double precision)
RETURNS void AS $$
BEGIN
  IF p IS NOT NULL AND (p < 0 OR NOT mapeo_es_finito(p)) THEN
    RAISE EXCEPTION 'Precisión GPS inválida: %', p;
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Distancia Haversine en metros entre dos puntos (lat/lng en grados decimales).
CREATE OR REPLACE FUNCTION mapeo_distancia_metros(
  lat1 double precision, lng1 double precision,
  lat2 double precision, lng2 double precision
) RETURNS double precision AS $$
DECLARE
  r double precision := 6371000; -- radio terrestre medio, metros
  dlat double precision;
  dlng double precision;
  a double precision;
BEGIN
  IF lat1 IS NULL OR lng1 IS NULL OR lat2 IS NULL OR lng2 IS NULL THEN
    RETURN NULL;
  END IF;
  dlat := radians(lat2 - lat1);
  dlng := radians(lng2 - lng1);
  a := sin(dlat / 2) ^ 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlng / 2) ^ 2;
  RETURN r * 2 * atan2(sqrt(a), sqrt(1 - a));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Resuelve (ci, rol) a partir de un login_code, buscando en dirigentes/coordinadores/
-- subcoordinadores (mismas tablas y mismo campo que usa hoy src/App.jsx para el login).
-- Sin filas = código inválido.
CREATE OR REPLACE FUNCTION mapeo_identidad(p_login_code text)
RETURNS TABLE(actor_ci text, actor_rol text) AS $$
DECLARE
  v_ci text;
BEGIN
  IF p_login_code IS NULL OR btrim(p_login_code) = '' THEN
    RETURN;
  END IF;

  SELECT d.ci INTO v_ci FROM dirigentes d WHERE d.login_code = p_login_code AND d.activo = true;
  IF v_ci IS NOT NULL THEN
    RETURN QUERY SELECT v_ci, 'dirigente'::text;
    RETURN;
  END IF;

  SELECT c.ci INTO v_ci FROM coordinadores c WHERE c.login_code = p_login_code AND c.activo IS DISTINCT FROM false;
  IF v_ci IS NOT NULL THEN
    RETURN QUERY SELECT v_ci, 'coordinador'::text;
    RETURN;
  END IF;

  SELECT s.ci INTO v_ci FROM subcoordinadores s WHERE s.login_code = p_login_code AND s.activo IS DISTINCT FROM false;
  IF v_ci IS NOT NULL THEN
    RETURN QUERY SELECT v_ci, 'subcoordinador'::text;
    RETURN;
  END IF;

  RETURN; -- código no encontrado en ninguna tabla
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Resuelve la identidad del actor a partir de (p_login_code, p_superadmin_ci):
-- exactamente uno de los dos debe venir con datos. Lanza excepción si no puede
-- resolver identidad — ninguna función RPC de este archivo debe ejecutar lógica
-- de negocio sin haber resuelto (ci, rol) primero.
CREATE OR REPLACE FUNCTION mapeo_resolver_actor(p_login_code text, p_superadmin_ci text)
RETURNS TABLE(actor_ci text, actor_rol text) AS $$
DECLARE
  v_ci text;
  v_rol text;
BEGIN
  IF p_superadmin_ci IS NOT NULL AND btrim(p_superadmin_ci) <> '' THEN
    -- Ver nota de seguridad al inicio del archivo: no verificable criptográficamente
    -- bajo el modelo de auth actual; mismo nivel de confianza que el resto de la app.
    RETURN QUERY SELECT btrim(p_superadmin_ci), 'superadmin'::text;
    RETURN;
  END IF;

  -- Alias + columnas calificadas (m.actor_ci / m.actor_rol): sin esto, "actor_ci" y
  -- "actor_rol" son ambiguos entre las columnas de mapeo_identidad() y los parámetros
  -- de salida homónimos de RETURNS TABLE de ESTA función — PL/pgSQL lo rechaza con un
  -- error de columna ambigua en cada llamada no-superadmin.
  SELECT m.actor_ci, m.actor_rol INTO v_ci, v_rol FROM mapeo_identidad(p_login_code) AS m;
  IF v_ci IS NULL THEN
    RAISE EXCEPTION 'Identidad inválida: código de acceso no reconocido.';
  END IF;
  RETURN QUERY SELECT v_ci, v_rol;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ¿El votante p_votante_ci está dentro del alcance jerárquico de (p_actor_ci, p_actor_rol)?
-- Misma definición de "rama" que usa el frontend (src/utils/estructuraHelpers.js):
--   dirigente: directos (dirigente_ci) + los de sus coordinadores + los de los
--              subcoordinadores de esos coordinadores.
--   coordinador: directos (coordinador_ci) + los de sus subcoordinadores.
--   subcoordinador: solo los que él mismo asignó (asignado_por = su ci, rol
--              'subcoordinador' o vacío/legacy).
-- v.activo IS DISTINCT FROM false: misma convención que esActivo() en
-- estructuraHelpers.js — un votante sin la columna activo poblada (legacy) cuenta
-- como activo; solo activo=false lo excluye explícitamente.
CREATE OR REPLACE FUNCTION mapeo_votante_en_alcance(p_votante_ci text, p_actor_ci text, p_actor_rol text)
RETURNS boolean AS $$
BEGIN
  IF p_actor_rol = 'superadmin' THEN
    RETURN EXISTS (SELECT 1 FROM votantes v WHERE v.ci = p_votante_ci AND v.activo IS DISTINCT FROM false);
  ELSIF p_actor_rol = 'dirigente' THEN
    RETURN EXISTS (
      SELECT 1 FROM votantes v
      WHERE v.ci = p_votante_ci AND v.activo IS DISTINCT FROM false AND (
        v.dirigente_ci = p_actor_ci
        -- Compatibilidad legacy (fila sin dirigente_ci poblado, solo asignado_por +
        -- asignado_por_rol='dirigente'). No debe imponerse sobre un dirigente_ci
        -- ACTUAL distinto (p. ej. el votante fue reasignado después) — igual que
        -- getVotantesDirectosDirigente exige que dirigente_ci coincida.
        OR (
          v.dirigente_ci IS NULL AND v.asignado_por = p_actor_ci AND v.asignado_por_rol = 'dirigente'
        )
        OR v.coordinador_ci IN (SELECT c.ci FROM coordinadores c WHERE c.dirigente_ci = p_actor_ci)
        OR (
          v.asignado_por_rol = 'subcoordinador'
          AND v.asignado_por IN (
            SELECT s.ci FROM subcoordinadores s
            WHERE s.coordinador_ci IN (SELECT c.ci FROM coordinadores c WHERE c.dirigente_ci = p_actor_ci)
          )
        )
      )
    );
  ELSIF p_actor_rol = 'coordinador' THEN
    RETURN EXISTS (
      SELECT 1 FROM votantes v
      WHERE v.ci = p_votante_ci AND v.activo IS DISTINCT FROM false AND (
        v.coordinador_ci = p_actor_ci
        -- Compatibilidad legacy: filas anteriores a la convención actual (que siempre
        -- puebla coordinador_ci) solo tienen asignado_por + asignado_por_rol='coordinador'
        -- — mismo fallback "estricto" que getVotantesDirectosCoord en estructuraHelpers.js.
        -- No debe imponerse sobre un coordinador_ci ACTUAL distinto (votante reasignado).
        OR (
          v.coordinador_ci IS NULL AND v.asignado_por = p_actor_ci AND v.asignado_por_rol = 'coordinador'
        )
        OR (
          v.asignado_por_rol = 'subcoordinador'
          AND v.asignado_por IN (SELECT s.ci FROM subcoordinadores s WHERE s.coordinador_ci = p_actor_ci)
        )
      )
    );
  ELSIF p_actor_rol = 'subcoordinador' THEN
    RETURN EXISTS (
      SELECT 1 FROM votantes v
      WHERE v.ci = p_votante_ci
        AND v.activo IS DISTINCT FROM false
        AND v.asignado_por = p_actor_ci
        AND (v.asignado_por_rol = 'subcoordinador' OR v.asignado_por_rol IS NULL OR v.asignado_por_rol = '')
    );
  END IF;
  RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ¿El hogar p_hogar_id está dentro del alcance de (p_actor_ci, p_actor_rol)? Un
-- hogar está en el alcance de un actor no-superadmin si:
--   a) todavía NO tiene ningún votante asociado activo Y él mismo lo creó
--      (creado_por_ci) — así un hogar recién creado sigue siendo visible/
--      gestionable por quien lo acaba de cargar, en vez de desaparecer hasta que
--      se le asocie alguien. Este acceso es solo transitorio: en cuanto el hogar
--      tiene al menos un votante asociado, el alcance pasa a depender
--      exclusivamente de esos votantes (b) — un creador cuyos votantes se
--      reasignaron después fuera de su rama NO conserva acceso indefinido; o
--   b) al menos uno de sus votantes asociados activos está en su alcance.
CREATE OR REPLACE FUNCTION mapeo_hogar_en_alcance(p_hogar_id uuid, p_actor_ci text, p_actor_rol text)
RETURNS boolean AS $$
DECLARE
  v_creado_por_ci text;
  v_tiene_votantes boolean;
BEGIN
  IF p_actor_rol = 'superadmin' THEN
    RETURN EXISTS (SELECT 1 FROM hogares h WHERE h.id = p_hogar_id);
  END IF;

  SELECT EXISTS (SELECT 1 FROM hogar_votantes hv WHERE hv.hogar_id = p_hogar_id AND hv.activo = true)
    INTO v_tiene_votantes;

  IF NOT v_tiene_votantes THEN
    SELECT creado_por_ci INTO v_creado_por_ci FROM hogares WHERE id = p_hogar_id;
    RETURN v_creado_por_ci IS NOT NULL AND v_creado_por_ci = p_actor_ci;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM hogar_votantes hv
    WHERE hv.hogar_id = p_hogar_id AND hv.activo = true
      AND mapeo_votante_en_alcance(hv.votante_ci, p_actor_ci, p_actor_rol)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- PostgreSQL otorga EXECUTE a PUBLIC por defecto en todo CREATE FUNCTION nuevo — sin
-- este REVOKE explícito, estas funciones auxiliares quedarían accesibles vía
-- supabase.rpc(...) por anon/authenticated (PUBLIC las incluye a ambos) pese a ser
-- "internas". Varias (mapeo_votante_en_alcance, mapeo_hogar_en_alcance) reciben
-- actor_ci/actor_rol como parámetros SIN verificar identidad — son SECURITY DEFINER
-- y confían en que solo las llamen las funciones RPC de la sección 4, que sí
-- resuelven la identidad primero. Sin este REVOKE, cualquier anónimo podría llamarlas
-- directo con un actor_ci/actor_rol inventado para sondear membresía de votantes/ramas.
REVOKE ALL ON FUNCTION mapeo_es_finito(double precision) FROM PUBLIC;
REVOKE ALL ON FUNCTION mapeo_validar_precision_gps(double precision) FROM PUBLIC;
REVOKE ALL ON FUNCTION mapeo_distancia_metros(double precision, double precision, double precision, double precision) FROM PUBLIC;
REVOKE ALL ON FUNCTION mapeo_identidad(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION mapeo_resolver_actor(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION mapeo_votante_en_alcance(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION mapeo_hogar_en_alcance(uuid, text, text) FROM PUBLIC;

-- ============================================================================
-- 4) FUNCIONES RPC — únicas llamadas por el frontend (supabase.rpc(...))
-- ============================================================================

-- ======================= CONFIGURACIÓN =======================
CREATE OR REPLACE FUNCTION mapeo_configuracion_actual()
RETURNS configuracion_mapeo AS $$
  SELECT * FROM configuracion_mapeo WHERE id = 1;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE;

CREATE OR REPLACE FUNCTION mapeo_actualizar_configuracion(
  p_login_code text,
  p_superadmin_ci text,
  p_radio_permitido_metros double precision,
  p_precision_gps_maxima_metros double precision
) RETURNS configuracion_mapeo AS $$
DECLARE
  v_ci text;
  v_rol text;
BEGIN
  SELECT actor_ci, actor_rol INTO v_ci, v_rol FROM mapeo_resolver_actor(p_login_code, p_superadmin_ci);
  IF v_rol <> 'superadmin' THEN
    RAISE EXCEPTION 'Solo superadmin puede modificar la configuración de mapeo.';
  END IF;
  -- NOT mapeo_es_finito(...) en vez de solo "<= 0": un NaN o +Infinity pasarían la
  -- comparación "<= 0" (PostgreSQL trata NaN como mayor que cualquier valor, incluido
  -- Infinity) y también el CHECK (> 0) de la tabla, dejando una configuración global
  -- corrupta que invalida silenciosamente todas las clasificaciones de visita
  -- posteriores (radio "infinito" siempre confirma; precisión máxima no-finita nunca
  -- bloquea nada).
  IF p_radio_permitido_metros IS NULL OR p_radio_permitido_metros <= 0 OR NOT mapeo_es_finito(p_radio_permitido_metros) THEN
    RAISE EXCEPTION 'radio_permitido_metros debe ser mayor a 0.';
  END IF;
  IF p_precision_gps_maxima_metros IS NULL OR p_precision_gps_maxima_metros <= 0 OR NOT mapeo_es_finito(p_precision_gps_maxima_metros) THEN
    RAISE EXCEPTION 'precision_gps_maxima_metros debe ser mayor a 0.';
  END IF;

  UPDATE configuracion_mapeo
  SET radio_permitido_metros = p_radio_permitido_metros,
      precision_gps_maxima_metros = p_precision_gps_maxima_metros,
      updated_by_ci = v_ci,
      updated_by_rol = v_rol,
      updated_at = now()
  WHERE id = 1;

  RETURN (SELECT * FROM configuracion_mapeo WHERE id = 1);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ======================= LISTAR HOGARES (con votantes agregados) =======================
-- Devuelve un JSON por hogar con sus votantes activos embebidos (nombre, apellido,
-- teléfono, jerarquía) para que el mapa no tenga que hacer N consultas adicionales
-- ni descargar el padrón completo.
CREATE OR REPLACE FUNCTION mapeo_listar_hogares(p_login_code text DEFAULT NULL, p_superadmin_ci text DEFAULT NULL)
RETURNS TABLE(
  id uuid,
  nombre_familia text,
  direccion text,
  referencia text,
  latitud double precision,
  longitud double precision,
  precision_gps double precision,
  estado text,
  creado_por_ci text,
  creado_por_rol text,
  verificado_por_ci text,
  verificado_por_rol text,
  fecha_verificacion timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  -- Expuesta para que el frontend pueda enviarla de vuelta a mapeo_verificar_hogar
  -- como la "versión de ubicación" que efectivamente revisó (ver esa función) — sin
  -- este valor, el cliente no tiene forma de detectar que el punto cambió entre que
  -- lo cargó para revisión y que confirmó la verificación.
  ubicacion_actualizada_at timestamptz,
  votantes jsonb,
  ultima_visita jsonb
) AS $$
DECLARE
  v_ci text;
  v_rol text;
BEGIN
  SELECT actor_ci, actor_rol INTO v_ci, v_rol FROM mapeo_resolver_actor(p_login_code, p_superadmin_ci);

  RETURN QUERY
  SELECT
    h.id, h.nombre_familia, h.direccion, h.referencia, h.latitud, h.longitud,
    h.precision_gps, h.estado, h.creado_por_ci, h.creado_por_rol,
    h.verificado_por_ci, h.verificado_por_rol, h.fecha_verificacion,
    h.created_at, h.updated_at, h.ubicacion_actualizada_at,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'ci', v.ci, 'nombre', v.nombre, 'apellido', v.apellido,
        'telefono', v.telefono, 'dirigente_ci', v.dirigente_ci,
        'coordinador_ci', v.coordinador_ci, 'asignado_por', v.asignado_por,
        'asignado_por_rol', v.asignado_por_rol, 'voto_confirmado', v.voto_confirmado
      ))
      FROM hogar_votantes hv
      JOIN votantes v ON v.ci = hv.votante_ci
      WHERE hv.hogar_id = h.id AND hv.activo = true
        -- Un hogar puede tener miembros de ramas distintas (p. ej. familia repartida
        -- entre dos subcoordinadores). Estar en alcance del HOGAR no implica estar en
        -- alcance de CADA votante — solo se embeben los miembros que el actor puede
        -- ver individualmente (superadmin ve todos).
        AND (v_rol = 'superadmin' OR mapeo_votante_en_alcance(v.ci, v_ci, v_rol))
    ), '[]'::jsonb) AS votantes,
    (
      SELECT jsonb_build_object(
        'id', vh.id, 'resultado', vh.resultado, 'fecha_hora', vh.fecha_hora,
        'visitante_ci', vh.visitante_ci, 'visitante_rol', vh.visitante_rol,
        'distancia_metros', vh.distancia_metros
      )
      FROM visitas_hogar vh
      WHERE vh.hogar_id = h.id
        -- Si el hogar se reubicó después de esta visita, ya no describe la ubicación
        -- vigente — no debe contarse como "última visita" para el estado visual del
        -- mapa (evita mostrar "visitado"/"fuera de radio" para un punto nuevo que
        -- nadie visitó todavía). Las visitas viejas siguen intactas en la bitácora
        -- completa (mapeo_listar_visitas), solo se excluyen de este resumen.
        AND vh.fecha_hora >= h.ubicacion_actualizada_at
      ORDER BY vh.fecha_hora DESC
      LIMIT 1
    ) AS ultima_visita
  FROM hogares h
  WHERE h.activo = true
    AND (v_rol = 'superadmin' OR mapeo_hogar_en_alcance(h.id, v_ci, v_rol));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE;

-- ======================= CREAR HOGAR =======================
CREATE OR REPLACE FUNCTION mapeo_crear_hogar(
  p_login_code text,
  p_superadmin_ci text,
  p_nombre_familia text,
  p_direccion text,
  p_referencia text,
  p_latitud double precision,
  p_longitud double precision,
  p_precision_gps double precision
) RETURNS hogares AS $$
DECLARE
  v_ci text;
  v_rol text;
  v_hogar hogares;
BEGIN
  SELECT actor_ci, actor_rol INTO v_ci, v_rol FROM mapeo_resolver_actor(p_login_code, p_superadmin_ci);

  IF p_latitud IS NOT NULL AND (p_latitud < -90 OR p_latitud > 90) THEN
    RAISE EXCEPTION 'Latitud inválida: %', p_latitud;
  END IF;
  IF p_longitud IS NOT NULL AND (p_longitud < -180 OR p_longitud > 180) THEN
    RAISE EXCEPTION 'Longitud inválida: %', p_longitud;
  END IF;
  PERFORM mapeo_validar_precision_gps(p_precision_gps);

  INSERT INTO hogares (
    nombre_familia, direccion, referencia, latitud, longitud, precision_gps,
    estado, creado_por_ci, creado_por_rol
  ) VALUES (
    p_nombre_familia, p_direccion, p_referencia, p_latitud, p_longitud, p_precision_gps,
    'pendiente', v_ci, v_rol
  )
  RETURNING * INTO v_hogar;

  RETURN v_hogar;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ======================= ACTUALIZAR/CORREGIR HOGAR =======================
-- Cambiar lat/lng reinicia el estado a 'pendiente' (una ubicación verificada deja
-- de estarlo si el punto se mueve) — evita mostrar como "verificado" un punto que
-- nadie con autoridad llegó a revisar.
CREATE OR REPLACE FUNCTION mapeo_actualizar_hogar(
  p_login_code text,
  p_superadmin_ci text,
  p_hogar_id uuid,
  p_nombre_familia text,
  p_direccion text,
  p_referencia text,
  p_latitud double precision,
  p_longitud double precision,
  p_precision_gps double precision
) RETURNS hogares AS $$
DECLARE
  v_ci text;
  v_rol text;
  v_hogar hogares;
  v_cambia_ubicacion boolean;
BEGIN
  SELECT actor_ci, actor_rol INTO v_ci, v_rol FROM mapeo_resolver_actor(p_login_code, p_superadmin_ci);

  IF NOT mapeo_hogar_en_alcance(p_hogar_id, v_ci, v_rol) THEN
    RAISE EXCEPTION 'El hogar % no está dentro de su alcance.', p_hogar_id;
  END IF;

  IF p_latitud IS NOT NULL AND (p_latitud < -90 OR p_latitud > 90) THEN
    RAISE EXCEPTION 'Latitud inválida: %', p_latitud;
  END IF;
  IF p_longitud IS NOT NULL AND (p_longitud < -180 OR p_longitud > 180) THEN
    RAISE EXCEPTION 'Longitud inválida: %', p_longitud;
  END IF;
  PERFORM mapeo_validar_precision_gps(p_precision_gps);

  -- FOR UPDATE desde esta primera lectura (no solo en el UPDATE de abajo): sin el
  -- lock acá, una edición concurrente sobre el mismo hogar (otra llamada a este RPC,
  -- o mapeo_confirmar_visita) podría cambiar latitud/longitud entre esta comparación
  -- y el UPDATE, dejando v_cambia_ubicacion calculado contra un valor que ya no es
  -- el vigente al momento de escribir.
  SELECT (latitud IS DISTINCT FROM p_latitud OR longitud IS DISTINCT FROM p_longitud)
    INTO v_cambia_ubicacion
  FROM hogares WHERE id = p_hogar_id FOR UPDATE;

  UPDATE hogares SET
    nombre_familia = p_nombre_familia,
    direccion = p_direccion,
    referencia = p_referencia,
    latitud = p_latitud,
    longitud = p_longitud,
    precision_gps = p_precision_gps,
    estado = CASE WHEN v_cambia_ubicacion THEN 'pendiente' ELSE estado END,
    verificado_por_ci = CASE WHEN v_cambia_ubicacion THEN NULL ELSE verificado_por_ci END,
    verificado_por_rol = CASE WHEN v_cambia_ubicacion THEN NULL ELSE verificado_por_rol END,
    fecha_verificacion = CASE WHEN v_cambia_ubicacion THEN NULL ELSE fecha_verificacion END,
    -- clock_timestamp(), no now(): now() queda fijo al INICIO de esta transacción,
    -- no al momento en que este UPDATE realmente se ejecuta — que puede ser más
    -- tarde si esta transacción esperó el lock de fila de arriba. Si se usara
    -- now(), una reubicación que arrancó antes pero consiguió el lock después de
    -- que mapeo_confirmar_visita ya confirmó (y comprometió) una visita al punto
    -- viejo podría terminar con ubicacion_actualizada_at más vieja que esa visita,
    -- dejándola pasar el filtro de mapeo_listar_hogares como "vigente" pese a
    -- describir la ubicación anterior. clock_timestamp() refleja el momento real de
    -- ejecución, coherente con el orden real de serialización que da el lock.
    ubicacion_actualizada_at = CASE WHEN v_cambia_ubicacion THEN clock_timestamp() ELSE ubicacion_actualizada_at END
  WHERE id = p_hogar_id
  RETURNING * INTO v_hogar;

  RETURN v_hogar;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ======================= VERIFICAR / RECHAZAR HOGAR =======================
-- Solo superadmin y dirigente pueden verificar definitivamente (coordinador y
-- subcoordinador pueden cargar/corregir, pero no verificar — ver requerimientos).
CREATE OR REPLACE FUNCTION mapeo_verificar_hogar(
  p_login_code text,
  p_superadmin_ci text,
  p_hogar_id uuid,
  p_aprobar boolean,
  p_ubicacion_actualizada_at timestamptz,
  p_observacion text DEFAULT NULL
) RETURNS hogares AS $$
DECLARE
  v_ci text;
  v_rol text;
  v_hogar hogares;
BEGIN
  SELECT actor_ci, actor_rol INTO v_ci, v_rol FROM mapeo_resolver_actor(p_login_code, p_superadmin_ci);

  IF v_rol NOT IN ('superadmin', 'dirigente') THEN
    RAISE EXCEPTION 'Solo superadmin o dirigente pueden verificar/rechazar una ubicación.';
  END IF;
  IF NOT mapeo_hogar_en_alcance(p_hogar_id, v_ci, v_rol) THEN
    RAISE EXCEPTION 'El hogar % no está dentro de su alcance.', p_hogar_id;
  END IF;

  -- p_ubicacion_actualizada_at es la versión de ubicación que el cliente cargó y
  -- efectivamente revisó (viene de mapeo_listar_hogares). Si alguien más reubicó el
  -- hogar mientras tanto (o mientras esta llamada esperaba el lock detrás de una
  -- reubicación concurrente), ubicacion_actualizada_at en la fila actual ya no
  -- coincide — el WHERE no matchea ninguna fila y la verificación se rechaza en vez
  -- de aprobar/rechazar un punto que el revisor nunca llegó a ver.
  UPDATE hogares SET
    estado = CASE WHEN p_aprobar THEN 'verificado' ELSE 'rechazado' END,
    verificado_por_ci = v_ci,
    verificado_por_rol = v_rol,
    fecha_verificacion = now()
  WHERE id = p_hogar_id AND ubicacion_actualizada_at = p_ubicacion_actualizada_at
  RETURNING * INTO v_hogar;

  IF v_hogar IS NULL THEN
    RAISE EXCEPTION 'La ubicación de este hogar cambió después de cargarse para revisión. Vuelva a abrirlo y revise el punto actual antes de verificar.';
  END IF;

  IF p_observacion IS NOT NULL THEN
    UPDATE hogares SET referencia = COALESCE(referencia || E'\n', '') || '[Verificación] ' || p_observacion
    WHERE id = p_hogar_id
    RETURNING * INTO v_hogar;
  END IF;

  RETURN v_hogar;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ======================= ASOCIAR / DESASOCIAR VOTANTE =======================
CREATE OR REPLACE FUNCTION mapeo_asociar_votante(
  p_login_code text,
  p_superadmin_ci text,
  p_hogar_id uuid,
  p_votante_ci text
) RETURNS hogar_votantes AS $$
DECLARE
  v_ci text;
  v_rol text;
  v_fila hogar_votantes;
  v_hogar_existente uuid;
BEGIN
  SELECT actor_ci, actor_rol INTO v_ci, v_rol FROM mapeo_resolver_actor(p_login_code, p_superadmin_ci);

  IF NOT mapeo_hogar_en_alcance(p_hogar_id, v_ci, v_rol) THEN
    RAISE EXCEPTION 'El hogar % no está dentro de su alcance.', p_hogar_id;
  END IF;
  IF NOT mapeo_votante_en_alcance(p_votante_ci, v_ci, v_rol) THEN
    RAISE EXCEPTION 'El votante % no está dentro de su alcance.', p_votante_ci;
  END IF;

  SELECT hogar_id INTO v_hogar_existente
  FROM hogar_votantes WHERE votante_ci = p_votante_ci AND activo = true;

  IF v_hogar_existente IS NOT NULL AND v_hogar_existente <> p_hogar_id THEN
    RAISE EXCEPTION 'El votante % ya pertenece a otro hogar activo (%). Desasócielo primero.', p_votante_ci, v_hogar_existente;
  END IF;

  IF v_hogar_existente = p_hogar_id THEN
    SELECT * INTO v_fila FROM hogar_votantes WHERE votante_ci = p_votante_ci AND activo = true;
    RETURN v_fila;
  END IF;

  INSERT INTO hogar_votantes (hogar_id, votante_ci, activo)
  VALUES (p_hogar_id, p_votante_ci, true)
  RETURNING * INTO v_fila;

  RETURN v_fila;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION mapeo_desasociar_votante(
  p_login_code text,
  p_superadmin_ci text,
  p_hogar_id uuid,
  p_votante_ci text
) RETURNS void AS $$
DECLARE
  v_ci text;
  v_rol text;
BEGIN
  SELECT actor_ci, actor_rol INTO v_ci, v_rol FROM mapeo_resolver_actor(p_login_code, p_superadmin_ci);

  IF NOT mapeo_hogar_en_alcance(p_hogar_id, v_ci, v_rol) THEN
    RAISE EXCEPTION 'El hogar % no está dentro de su alcance.', p_hogar_id;
  END IF;
  -- Un hogar puede tener miembros de ramas distintas: estar en alcance del hogar (por
  -- OTRO miembro) no autoriza a desasociar a ESTE votante si él mismo está fuera de
  -- alcance — sin este chequeo, un actor podría quitar a un votante de otra rama de un
  -- hogar compartido.
  IF v_rol <> 'superadmin' AND NOT mapeo_votante_en_alcance(p_votante_ci, v_ci, v_rol) THEN
    RAISE EXCEPTION 'El votante % no está dentro de su alcance.', p_votante_ci;
  END IF;

  -- Desasociar (activo=false) — nunca borra la fila ni toca hogares/visitas_hogar.
  UPDATE hogar_votantes
  SET activo = false
  WHERE hogar_id = p_hogar_id AND votante_ci = p_votante_ci AND activo = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ======================= CONFIRMAR VISITA =======================
-- Corazón de la bitácora: valida identidad, alcance, coordenadas y precisión GPS,
-- calcula la distancia del lado del servidor y decide el resultado — el cliente
-- NUNCA puede escribir manualmente el resultado ni la distancia.
CREATE OR REPLACE FUNCTION mapeo_confirmar_visita(
  p_login_code text,
  p_superadmin_ci text,
  p_hogar_id uuid,
  p_latitud double precision,
  p_longitud double precision,
  p_precision_gps double precision,
  p_observacion text DEFAULT NULL
) RETURNS visitas_hogar AS $$
DECLARE
  v_ci text;
  v_rol text;
  v_hogar hogares;
  v_config configuracion_mapeo;
  v_distancia double precision;
  v_resultado text;
  v_visita visitas_hogar;
BEGIN
  SELECT actor_ci, actor_rol INTO v_ci, v_rol FROM mapeo_resolver_actor(p_login_code, p_superadmin_ci);

  IF NOT mapeo_hogar_en_alcance(p_hogar_id, v_ci, v_rol) THEN
    RAISE EXCEPTION 'El hogar % no está dentro de su alcance.', p_hogar_id;
  END IF;

  -- FOR UPDATE: si mapeo_actualizar_hogar está reubicando este hogar en una
  -- transacción concurrente, esta lectura bloquea hasta que esa transacción
  -- confirme (o aborte). Sin el lock, esta SELECT podría leer coordenadas viejas
  -- mientras la reubicación queda sin confirmar todavía, calculando la visita
  -- contra el punto anterior pero con fecha_hora posterior al nuevo
  -- ubicacion_actualizada_at — el filtro de mapeo_listar_hogares la retendría
  -- como "visita a la ubicación vigente" pese a describir la ubicación vieja.
  -- Con el lock, la visita queda estrictamente antes o después de la reubicación:
  -- cualquiera de las dos transacciones que gane el lock ve datos consistentes.
  SELECT * INTO v_hogar FROM hogares WHERE id = p_hogar_id FOR UPDATE;
  SELECT * INTO v_config FROM configuracion_mapeo WHERE id = 1;

  -- Una ubicación rechazada quedó marcada como descartada por quien la revisó — no
  -- debe poder "confirmarse" una visita contra un punto que ya se determinó inválido.
  -- Bloquea el intento completo (no se registra ni siquiera como error_gps) hasta que
  -- alguien corrija la ubicación y vuelva a quedar pendiente/verificada.
  IF v_hogar.estado = 'rechazado' THEN
    RAISE EXCEPTION 'La ubicación de este hogar fue rechazada. Corríjala y vuelva a verificarla antes de confirmar una visita.';
  END IF;

  -- Una precisión GPS negativa o no-finita (NaN o +/-Infinity) es un dato malformado,
  -- no una simple imprecisión — nunca debería llegar por la UI, pero un request
  -- directo al RPC podría enviarla; se rechaza de plano en vez de dejarla pasar como
  -- si fuera una visita "confirmada"/"error_gps" con auditoría corrupta. Este chequeo
  -- va ANTES de la rama sin coordenadas (abajo): esa rama también inserta
  -- precision_gps directo, así que validar después de ella dejaría pasar un valor
  -- malformado en el intento fallido.
  PERFORM mapeo_validar_precision_gps(p_precision_gps);

  IF p_latitud IS NULL OR p_longitud IS NULL THEN
    -- Registrar igual el intento fallido (nunca se descarta en silencio).
    -- fecha_hora = clock_timestamp() explícito, no el DEFAULT now() de la tabla:
    -- now() queda fijo al inicio de esta transacción, no al momento posterior a
    -- adquirir el lock de arriba. Si esta transacción esperó detrás de una
    -- reubicación concurrente (que ahora también usa clock_timestamp() para
    -- ubicacion_actualizada_at), un fecha_hora basado en now() podría terminar
    -- más viejo que la reubicación aunque la visita se registró después,
    -- excluyéndola incorrectamente del filtro >= ubicacion_actualizada_at.
    INSERT INTO visitas_hogar (
      hogar_id, visitante_ci, visitante_rol, latitud, longitud, precision_gps,
      distancia_metros, radio_permitido_usado, resultado, observacion,
      fecha_hora, creado_por_ci, creado_por_rol
    ) VALUES (
      p_hogar_id, v_ci, v_rol, COALESCE(p_latitud, 0), COALESCE(p_longitud, 0), p_precision_gps,
      NULL, v_config.radio_permitido_metros, 'error_gps',
      COALESCE(p_observacion, 'Sin coordenadas del dispositivo.'), clock_timestamp(), v_ci, v_rol
    ) RETURNING * INTO v_visita;
    RETURN v_visita;
  END IF;

  IF p_latitud < -90 OR p_latitud > 90 OR p_longitud < -180 OR p_longitud > 180 THEN
    RAISE EXCEPTION 'Coordenadas inválidas: (%, %)', p_latitud, p_longitud;
  END IF;

  -- Precisión GPS inaceptable o el hogar aún no tiene coordenadas de referencia:
  -- se registra el intento como error_gps sin poder decidir dentro/fuera de radio.
  IF p_precision_gps IS NOT NULL AND p_precision_gps > v_config.precision_gps_maxima_metros THEN
    v_resultado := 'error_gps';
    v_distancia := mapeo_distancia_metros(p_latitud, p_longitud, v_hogar.latitud, v_hogar.longitud);
  ELSIF v_hogar.latitud IS NULL OR v_hogar.longitud IS NULL THEN
    v_resultado := 'error_gps';
    v_distancia := NULL;
  ELSE
    v_distancia := mapeo_distancia_metros(p_latitud, p_longitud, v_hogar.latitud, v_hogar.longitud);
    v_resultado := CASE WHEN v_distancia <= v_config.radio_permitido_metros
                        THEN 'confirmada' ELSE 'fuera_de_radio' END;
  END IF;

  -- fecha_hora = clock_timestamp() explícito (ver comentario en el INSERT de la
  -- rama sin coordenadas de arriba): consistente con el orden real de
  -- serialización que da el lock FOR UPDATE de la línea 880, no con el inicio de
  -- esta transacción.
  INSERT INTO visitas_hogar (
    hogar_id, visitante_ci, visitante_rol, latitud, longitud, precision_gps,
    distancia_metros, radio_permitido_usado, resultado, observacion,
    fecha_hora, creado_por_ci, creado_por_rol
  ) VALUES (
    p_hogar_id, v_ci, v_rol, p_latitud, p_longitud, p_precision_gps,
    v_distancia, v_config.radio_permitido_metros, v_resultado, p_observacion,
    clock_timestamp(), v_ci, v_rol
  ) RETURNING * INTO v_visita;

  RETURN v_visita;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ======================= LISTAR VISITAS (bitácora) =======================
CREATE OR REPLACE FUNCTION mapeo_listar_visitas(
  p_login_code text DEFAULT NULL,
  p_superadmin_ci text DEFAULT NULL,
  p_hogar_id uuid DEFAULT NULL
) RETURNS TABLE(
  id uuid,
  hogar_id uuid,
  hogar_nombre_familia text,
  hogar_direccion text,
  visitante_ci text,
  visitante_rol text,
  latitud double precision,
  longitud double precision,
  precision_gps double precision,
  distancia_metros double precision,
  radio_permitido_usado double precision,
  resultado text,
  observacion text,
  fecha_hora timestamptz,
  votantes jsonb
) AS $$
DECLARE
  v_ci text;
  v_rol text;
BEGIN
  SELECT actor_ci, actor_rol INTO v_ci, v_rol FROM mapeo_resolver_actor(p_login_code, p_superadmin_ci);

  RETURN QUERY
  SELECT
    vh.id, vh.hogar_id, h.nombre_familia, h.direccion,
    vh.visitante_ci, vh.visitante_rol, vh.latitud, vh.longitud,
    vh.precision_gps, vh.distancia_metros, vh.radio_permitido_usado,
    vh.resultado, vh.observacion, vh.fecha_hora,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object('ci', v.ci, 'nombre', v.nombre, 'apellido', v.apellido))
      FROM hogar_votantes hv
      JOIN votantes v ON v.ci = hv.votante_ci
      WHERE hv.hogar_id = h.id AND hv.activo = true
        -- Mismo filtro por-votante que mapeo_listar_hogares: un hogar compartido entre
        -- ramas no debe exponer los miembros fuera del alcance del actor.
        AND (v_rol = 'superadmin' OR mapeo_votante_en_alcance(v.ci, v_ci, v_rol))
    ), '[]'::jsonb) AS votantes
  FROM visitas_hogar vh
  JOIN hogares h ON h.id = vh.hogar_id
  WHERE (p_hogar_id IS NULL OR vh.hogar_id = p_hogar_id)
    AND (v_rol = 'superadmin' OR mapeo_hogar_en_alcance(vh.hogar_id, v_ci, v_rol))
  ORDER BY vh.fecha_hora DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE;

-- ============================================================================
-- 5) GRANTS — el frontend usa siempre la clave anon (no hay sesión de Supabase
--    Auth), así que las funciones deben ser ejecutables por anon y authenticated.
--    Las tablas base NO reciben grants directos (ver sección 2).
-- ============================================================================
GRANT EXECUTE ON FUNCTION mapeo_configuracion_actual() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION mapeo_actualizar_configuracion(text, text, double precision, double precision) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION mapeo_listar_hogares(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION mapeo_crear_hogar(text, text, text, text, text, double precision, double precision, double precision) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION mapeo_actualizar_hogar(text, text, uuid, text, text, text, double precision, double precision, double precision) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION mapeo_verificar_hogar(text, text, uuid, boolean, timestamptz, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION mapeo_asociar_votante(text, text, uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION mapeo_desasociar_votante(text, text, uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION mapeo_confirmar_visita(text, text, uuid, double precision, double precision, double precision, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION mapeo_listar_visitas(text, text, uuid) TO anon, authenticated;

-- Las funciones auxiliares internas (mapeo_identidad, mapeo_resolver_actor,
-- mapeo_votante_en_alcance, mapeo_hogar_en_alcance, mapeo_distancia_metros,
-- mapeo_es_finito, mapeo_validar_precision_gps) NO se otorgan a anon/authenticated
-- (y además se les revocó EXECUTE de PUBLIC explícitamente en la sección 3, ya que
-- PostgreSQL lo otorga por defecto en todo CREATE FUNCTION) — solo las usan las
-- funciones RPC de arriba.
