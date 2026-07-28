-- ============================================================================
-- Permite que un hogar incluya dirigentes/coordinadores/subcoordinadores, no solo
-- votantes
-- ============================================================================
-- IMPORTANTE: la migración 20260727100000_mapeo_territorial_bitacora.sql YA FUE
-- APLICADA MANUALMENTE en producción. Ese archivo declaraba hogar_votantes.votante_ci
-- con "REFERENCES votantes(ci)", por lo que un hogar solo podía admitir personas de
-- la tabla votantes: si una persona era dirigente, coordinador o subcoordinador (p.
-- ej. la CI 4321080, un coordinador), no aparecía en el buscador de integrantes del
-- hogar ni podía asociarse, aunque también fuera electora — ni un dirigente podía
-- agregarse a sí mismo al hogar donde vive.
--
-- Este archivo es un parche mínimo e idempotente sobre esa base ya migrada:
--   1) Elimina la FK hacia votantes(ci) (una FK normal no puede apuntar a la vez a
--      dirigentes/coordinadores/subcoordinadores/votantes).
--   2) La reemplaza por un trigger (mapeo_validar_integrante_hogar) que valida que la
--      CI exista y esté activa en AL MENOS UNA de esas 4 tablas — mismo patrón que ya
--      usa supabase/migrations/20260727000000_fix_votante_asignador_validation.sql
--      para asignado_por.
--   3) Agrega mapeo_persona_rol_prioritario/mapeo_persona_existe_activa/
--      mapeo_persona_en_alcance/mapeo_persona_info: helpers que resuelven identidad,
--      alcance jerárquico y nombre/apellido/teléfono/rol de una persona de
--      cualquiera de las 4 jerarquías (con prioridad dirigente > coordinador >
--      subcoordinador > votante si la misma CI quedó en más de una tabla).
--   4) Reemplaza mapeo_hogar_en_alcance, mapeo_listar_hogares, mapeo_listar_visitas,
--      mapeo_asociar_votante y mapeo_desasociar_votante (CREATE OR REPLACE, misma
--      firma en todos los casos) para usar esos helpers en vez de asumir que todo
--      integrante es un votante.
--
-- NO crea ni borra tablas, NO modifica ni borra hogares/integrantes/visitas
-- existentes: solo elimina una restricción, agrega un trigger de validación y
-- reemplaza funciones. Es exactamente el mismo cambio que ya quedó incorporado en
-- supabase/migrations/20260727100000_mapeo_territorial_bitacora.sql para
-- instalaciones nuevas — este archivo solo lo aplica a una base que ya tenía la
-- versión "solo votantes" de esas funciones.
--
-- Ver supabase/migrations/README.md para más contexto sobre este tipo de parche.

-- 0) Comprobación de esquema: este parche no crea tablas.
DO $$
BEGIN
  IF to_regclass('public.hogares') IS NULL THEN
    RAISE EXCEPTION 'Falta la tabla "hogares". Este parche depende de que 20260727100000_mapeo_territorial_bitacora.sql ya haya sido aplicada.';
  END IF;
  IF to_regclass('public.hogar_votantes') IS NULL THEN
    RAISE EXCEPTION 'Falta la tabla "hogar_votantes". Este parche depende de que 20260727100000_mapeo_territorial_bitacora.sql ya haya sido aplicada.';
  END IF;
  IF to_regclass('public.visitas_hogar') IS NULL THEN
    RAISE EXCEPTION 'Falta la tabla "visitas_hogar". Este parche depende de que 20260727100000_mapeo_territorial_bitacora.sql ya haya sido aplicada.';
  END IF;
  IF to_regclass('public.dirigentes') IS NULL OR to_regclass('public.coordinadores') IS NULL
     OR to_regclass('public.subcoordinadores') IS NULL OR to_regclass('public.votantes') IS NULL
     OR to_regclass('public.padron') IS NULL THEN
    RAISE EXCEPTION 'Falta alguna tabla del esquema base (dirigentes/coordinadores/subcoordinadores/votantes/padron).';
  END IF;
END $$;

-- 1) Eliminar la FK que restringía hogar_votantes.votante_ci a la tabla votantes.
-- Idempotente y no destructivo: no toca ninguna fila ya insertada.
ALTER TABLE hogar_votantes DROP CONSTRAINT IF EXISTS hogar_votantes_votante_ci_fkey;

-- 2) Reemplazo de esa FK: valida la CI contra las 4 tablas de persona.
CREATE OR REPLACE FUNCTION mapeo_persona_existe_activa(p_ci bigint)
RETURNS boolean AS $$
  SELECT
    EXISTS (SELECT 1 FROM dirigentes WHERE ci = p_ci AND activo = true)
    OR EXISTS (SELECT 1 FROM coordinadores WHERE ci = p_ci AND activo IS DISTINCT FROM false)
    OR EXISTS (SELECT 1 FROM subcoordinadores WHERE ci = p_ci AND activo IS DISTINCT FROM false)
    OR EXISTS (SELECT 1 FROM votantes WHERE ci = p_ci AND activo IS DISTINCT FROM false);
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION mapeo_validar_integrante_hogar()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT mapeo_persona_existe_activa(NEW.votante_ci) THEN
    RAISE EXCEPTION 'La CI % no corresponde a ninguna persona activa (dirigente, coordinador, subcoordinador o votante).', NEW.votante_ci;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_hogar_votantes_validar_integrante ON hogar_votantes;
CREATE TRIGGER trg_hogar_votantes_validar_integrante
  BEFORE INSERT OR UPDATE ON hogar_votantes
  FOR EACH ROW
  EXECUTE FUNCTION mapeo_validar_integrante_hogar();

-- 3) Resolución de rol/alcance/identidad de una persona de cualquiera de las 4 tablas.
CREATE OR REPLACE FUNCTION mapeo_persona_rol_prioritario(p_ci bigint)
RETURNS text AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM dirigentes WHERE ci = p_ci) THEN 'dirigente'
    WHEN EXISTS (SELECT 1 FROM coordinadores WHERE ci = p_ci) THEN 'coordinador'
    WHEN EXISTS (SELECT 1 FROM subcoordinadores WHERE ci = p_ci) THEN 'subcoordinador'
    WHEN EXISTS (SELECT 1 FROM votantes WHERE ci = p_ci) THEN 'votante'
    ELSE NULL
  END;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION mapeo_persona_en_alcance(p_persona_ci bigint, p_actor_ci text, p_actor_rol text)
RETURNS boolean AS $$
DECLARE
  v_actor_ci bigint;
  v_rol_persona text;
BEGIN
  IF p_actor_rol = 'superadmin' THEN
    RETURN true;
  END IF;

  v_actor_ci := mapeo_ci_a_bigint(p_actor_ci);
  IF p_persona_ci = v_actor_ci THEN
    RETURN true;
  END IF;

  v_rol_persona := mapeo_persona_rol_prioritario(p_persona_ci);

  IF v_rol_persona = 'votante' THEN
    RETURN mapeo_votante_en_alcance(p_persona_ci, p_actor_ci, p_actor_rol);
  ELSIF v_rol_persona = 'coordinador' THEN
    IF p_actor_rol <> 'dirigente' THEN RETURN false; END IF;
    RETURN EXISTS (
      SELECT 1 FROM coordinadores c
      WHERE c.ci = p_persona_ci AND c.activo IS DISTINCT FROM false AND c.dirigente_ci = v_actor_ci
    );
  ELSIF v_rol_persona = 'subcoordinador' THEN
    IF p_actor_rol = 'dirigente' THEN
      RETURN EXISTS (
        SELECT 1 FROM subcoordinadores s
        JOIN coordinadores c ON c.ci = s.coordinador_ci
        WHERE s.ci = p_persona_ci AND s.activo IS DISTINCT FROM false AND c.dirigente_ci = v_actor_ci
      );
    ELSIF p_actor_rol = 'coordinador' THEN
      RETURN EXISTS (
        SELECT 1 FROM subcoordinadores s
        WHERE s.ci = p_persona_ci AND s.activo IS DISTINCT FROM false AND s.coordinador_ci = v_actor_ci
      );
    END IF;
    RETURN false;
  END IF;

  RETURN false; -- 'dirigente' (que no sea el propio actor) o CI que no existe en ninguna tabla
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION mapeo_persona_info(p_ci bigint)
RETURNS TABLE(
  nombre text, apellido text, telefono text, rol text,
  dirigente_ci bigint, coordinador_ci bigint,
  asignado_por bigint, asignado_por_rol text,
  voto_confirmado boolean
) AS $$
DECLARE
  v_rol text;
BEGIN
  v_rol := mapeo_persona_rol_prioritario(p_ci);

  IF v_rol = 'dirigente' THEN
    RETURN QUERY
    SELECT COALESCE(p.nombre, d.nombre, '')::text, COALESCE(p.apellido, d.apellido, '')::text,
           d.telefono, 'dirigente'::text,
           d.ci, NULL::bigint, d.ci, 'dirigente'::text, NULL::boolean
    FROM dirigentes d
    LEFT JOIN padron p ON p.ci = d.ci
    WHERE d.ci = p_ci;
  ELSIF v_rol = 'coordinador' THEN
    RETURN QUERY
    SELECT COALESCE(p.nombre, '')::text, COALESCE(p.apellido, '')::text,
           c.telefono, 'coordinador'::text,
           c.dirigente_ci, c.ci, c.ci, 'coordinador'::text, NULL::boolean
    FROM coordinadores c
    LEFT JOIN padron p ON p.ci = c.ci
    WHERE c.ci = p_ci;
  ELSIF v_rol = 'subcoordinador' THEN
    RETURN QUERY
    SELECT COALESCE(p.nombre, '')::text, COALESCE(p.apellido, '')::text,
           s.telefono, 'subcoordinador'::text,
           c.dirigente_ci, s.coordinador_ci, s.ci, 'subcoordinador'::text, NULL::boolean
    FROM subcoordinadores s
    LEFT JOIN coordinadores c ON c.ci = s.coordinador_ci
    LEFT JOIN padron p ON p.ci = s.ci
    WHERE s.ci = p_ci;
  ELSIF v_rol = 'votante' THEN
    RETURN QUERY
    SELECT COALESCE(p.nombre, '')::text, COALESCE(p.apellido, '')::text,
           v.telefono, 'votante'::text,
           v.dirigente_ci, v.coordinador_ci, v.asignado_por, v.asignado_por_rol, v.voto_confirmado
    FROM votantes v
    LEFT JOIN padron p ON p.ci = v.ci
    WHERE v.ci = p_ci;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE;

REVOKE ALL ON FUNCTION mapeo_persona_existe_activa(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION mapeo_persona_rol_prioritario(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION mapeo_persona_en_alcance(bigint, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION mapeo_persona_info(bigint) FROM PUBLIC;

-- 4) mapeo_hogar_en_alcance: un hogar con un único integrante dirigente/coordinador/
--    subcoordinador también debe ser visible para quien tenga alcance sobre esa
--    persona (antes solo lo evaluaba como votante).
CREATE OR REPLACE FUNCTION mapeo_hogar_en_alcance(p_hogar_id uuid, p_actor_ci text, p_actor_rol text)
RETURNS boolean AS $$
DECLARE
  v_creado_por_ci text;
  v_tuvo_votantes_alguna_vez boolean;
BEGIN
  IF p_actor_rol = 'superadmin' THEN
    RETURN EXISTS (SELECT 1 FROM hogares h WHERE h.id = p_hogar_id);
  END IF;

  SELECT EXISTS (SELECT 1 FROM hogar_votantes hv WHERE hv.hogar_id = p_hogar_id)
    INTO v_tuvo_votantes_alguna_vez;

  IF NOT v_tuvo_votantes_alguna_vez THEN
    SELECT creado_por_ci INTO v_creado_por_ci FROM hogares WHERE id = p_hogar_id;
    RETURN v_creado_por_ci IS NOT NULL AND v_creado_por_ci = p_actor_ci;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM hogar_votantes hv
    WHERE hv.hogar_id = p_hogar_id AND hv.activo = true
      AND mapeo_persona_en_alcance(hv.votante_ci, p_actor_ci, p_actor_rol)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 5) mapeo_listar_hogares / mapeo_listar_visitas: resuelven nombre/apellido/teléfono/
--    rol de cada integrante con mapeo_persona_info (LEFT JOIN LATERAL, no descarta al
--    integrante si la persona no se resuelve) y filtran alcance con
--    mapeo_persona_en_alcance en vez de mapeo_votante_en_alcance.
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
        'ci', hv.votante_ci::text, 'nombre', COALESCE(pi.nombre, ''), 'apellido', COALESCE(pi.apellido, ''),
        'telefono', pi.telefono, 'rol', pi.rol, 'dirigente_ci', pi.dirigente_ci::text,
        'coordinador_ci', pi.coordinador_ci::text, 'asignado_por', pi.asignado_por::text,
        'asignado_por_rol', pi.asignado_por_rol, 'voto_confirmado', pi.voto_confirmado
      ))
      FROM hogar_votantes hv
      LEFT JOIN LATERAL mapeo_persona_info(hv.votante_ci) pi ON true
      WHERE hv.hogar_id = h.id AND hv.activo = true
        AND (v_rol = 'superadmin' OR mapeo_persona_en_alcance(hv.votante_ci, v_ci, v_rol))
    ), '[]'::jsonb) AS votantes,
    (
      SELECT jsonb_build_object(
        'id', vh.id, 'resultado', vh.resultado, 'fecha_hora', vh.fecha_hora,
        'visitante_ci', vh.visitante_ci, 'visitante_rol', vh.visitante_rol,
        'distancia_metros', vh.distancia_metros
      )
      FROM visitas_hogar vh
      WHERE vh.hogar_id = h.id
        AND vh.fecha_hora >= h.ubicacion_actualizada_at
      ORDER BY vh.fecha_hora DESC
      LIMIT 1
    ) AS ultima_visita
  FROM hogares h
  WHERE h.activo = true
    AND (v_rol = 'superadmin' OR mapeo_hogar_en_alcance(h.id, v_ci, v_rol));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE;

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
      SELECT jsonb_agg(jsonb_build_object(
        'ci', hv.votante_ci::text, 'nombre', COALESCE(pi.nombre, ''), 'apellido', COALESCE(pi.apellido, ''),
        'telefono', pi.telefono, 'rol', pi.rol, 'dirigente_ci', pi.dirigente_ci::text,
        'coordinador_ci', pi.coordinador_ci::text, 'asignado_por', pi.asignado_por::text,
        'asignado_por_rol', pi.asignado_por_rol, 'voto_confirmado', pi.voto_confirmado
      ))
      FROM hogar_votantes hv
      LEFT JOIN LATERAL mapeo_persona_info(hv.votante_ci) pi ON true
      WHERE hv.hogar_id = h.id AND hv.activo = true
        AND (v_rol = 'superadmin' OR mapeo_persona_en_alcance(hv.votante_ci, v_ci, v_rol))
    ), '[]'::jsonb) AS votantes
  FROM visitas_hogar vh
  JOIN hogares h ON h.id = vh.hogar_id
  WHERE (p_hogar_id IS NULL OR vh.hogar_id = p_hogar_id)
    AND (v_rol = 'superadmin' OR mapeo_hogar_en_alcance(vh.hogar_id, v_ci, v_rol))
  ORDER BY vh.fecha_hora DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE;

-- 6) mapeo_asociar_votante / mapeo_desasociar_votante: validan existencia+alcance de
--    cualquier persona de las 4 jerarquías, no solo votantes. Firmas sin cambios.
CREATE OR REPLACE FUNCTION mapeo_asociar_votante(
  p_login_code text,
  p_superadmin_ci text,
  p_hogar_id uuid,
  p_votante_ci text
) RETURNS hogar_votantes AS $$
DECLARE
  v_ci text;
  v_rol text;
  v_votante_ci bigint;
  v_fila hogar_votantes;
  v_hogar_existente uuid;
BEGIN
  SELECT actor_ci, actor_rol INTO v_ci, v_rol FROM mapeo_resolver_actor(p_login_code, p_superadmin_ci);
  v_votante_ci := mapeo_ci_a_bigint(p_votante_ci);

  IF NOT mapeo_hogar_en_alcance(p_hogar_id, v_ci, v_rol) THEN
    RAISE EXCEPTION 'El hogar % no está dentro de su alcance.', p_hogar_id;
  END IF;
  IF NOT mapeo_persona_existe_activa(v_votante_ci) THEN
    RAISE EXCEPTION 'La CI % no corresponde a ninguna persona activa (dirigente, coordinador, subcoordinador o votante).', p_votante_ci;
  END IF;
  IF NOT mapeo_persona_en_alcance(v_votante_ci, v_ci, v_rol) THEN
    RAISE EXCEPTION 'La persona con CI % no está dentro de su alcance.', p_votante_ci;
  END IF;

  SELECT hogar_id INTO v_hogar_existente
  FROM hogar_votantes WHERE votante_ci = v_votante_ci AND activo = true;

  IF v_hogar_existente IS NOT NULL AND v_hogar_existente <> p_hogar_id THEN
    RAISE EXCEPTION 'La persona con CI % ya pertenece a otro hogar activo (%). Desasócielo primero.', p_votante_ci, v_hogar_existente;
  END IF;

  IF v_hogar_existente = p_hogar_id THEN
    SELECT * INTO v_fila FROM hogar_votantes WHERE votante_ci = v_votante_ci AND activo = true;
    RETURN v_fila;
  END IF;

  INSERT INTO hogar_votantes (hogar_id, votante_ci, activo)
  VALUES (p_hogar_id, v_votante_ci, true)
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
  v_votante_ci bigint;
BEGIN
  SELECT actor_ci, actor_rol INTO v_ci, v_rol FROM mapeo_resolver_actor(p_login_code, p_superadmin_ci);
  v_votante_ci := mapeo_ci_a_bigint(p_votante_ci);

  IF NOT mapeo_hogar_en_alcance(p_hogar_id, v_ci, v_rol) THEN
    RAISE EXCEPTION 'El hogar % no está dentro de su alcance.', p_hogar_id;
  END IF;
  IF v_rol <> 'superadmin' AND NOT mapeo_persona_en_alcance(v_votante_ci, v_ci, v_rol) THEN
    RAISE EXCEPTION 'La persona con CI % no está dentro de su alcance.', p_votante_ci;
  END IF;

  UPDATE hogar_votantes
  SET activo = false
  WHERE hogar_id = p_hogar_id AND votante_ci = v_votante_ci AND activo = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- CREATE OR REPLACE FUNCTION conserva los GRANTs existentes mientras la firma no
-- cambie (no cambió en ninguna de las 4 funciones RPC de arriba), pero se re-otorgan
-- de forma idempotente por si esta base llegara a un estado donde faltaran.
GRANT EXECUTE ON FUNCTION mapeo_listar_hogares(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION mapeo_listar_visitas(text, text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION mapeo_asociar_votante(text, text, uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION mapeo_desasociar_votante(text, text, uuid, text) TO anon, authenticated;
