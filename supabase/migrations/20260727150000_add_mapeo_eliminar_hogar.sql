-- ============================================================================
-- Agrega "Eliminar mapeo de hogar" (soft-delete, solo superadmin) + corrige casts
-- pendientes en mapeo_persona_info
-- ============================================================================
-- IMPORTANTE: las migraciones 20260727100000_mapeo_territorial_bitacora.sql y
-- 20260727140000_fix_hogar_integrantes_multirol.sql YA FUERON APLICADAS
-- MANUALMENTE en producción. Este archivo es un parche mínimo e idempotente sobre
-- esa base ya migrada:
--
--   1) Agrega mapeo_eliminar_hogar: RPC SECURITY DEFINER que permite a superadmin
--      eliminar el MAPEO de un hogar (nunca a sus integrantes). Pone
--      hogares.activo=false y libera (activo=false) todas las asociaciones activas
--      de hogar_votantes para ese hogar, dejando a cada integrante disponible para
--      asociarse a otro hogar. No hace DELETE físico ni toca visitas_hogar en
--      absoluto — la bitácora conserva su historial completo, incluido el nombre
--      del hogar (mapeo_listar_visitas no filtra por h.activo). Rechaza la
--      operación del lado del servidor si el actor resuelto no es superadmin,
--      sin importar lo que diga el frontend. mapeo_listar_hogares ya filtra
--      "WHERE h.activo = true" incondicionalmente, así que un hogar eliminado
--      desaparece del mapa/listado/estadísticas sin ningún cambio adicional ahí.
--
--   2) Reemplaza mapeo_persona_info (CREATE OR REPLACE, misma firma) para agregar
--      los casts ::text pendientes en "telefono" (las 4 jerarquías) y
--      "asignado_por_rol" (rama votante) — la versión ya desplegada por el parche
--      anterior (20260727140000) devolvía esas dos columnas sin castear
--      explícitamente desde bigint/smallint/varchar según la tabla de origen, lo
--      que podía causar un error de tipo de retorno si alguna de esas columnas no
--      es exactamente "text" en el esquema real. No cambia ningún otro
--      comportamiento de la función.
--
-- NO crea ni borra tablas, NO modifica ni borra hogares/integrantes/visitas
-- existentes salvo cuando un superadmin invoque explícitamente mapeo_eliminar_hogar
-- después de aplicado este parche. Ver supabase/migrations/README.md.

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
  IF to_regprocedure('public.mapeo_resolver_actor(text, text)') IS NULL THEN
    RAISE EXCEPTION 'Falta mapeo_resolver_actor. Este parche depende de que 20260727100000_mapeo_territorial_bitacora.sql ya haya sido aplicada.';
  END IF;
  IF to_regprocedure('public.mapeo_persona_rol_prioritario(bigint)') IS NULL THEN
    RAISE EXCEPTION 'Falta mapeo_persona_rol_prioritario. Este parche depende de que 20260727140000_fix_hogar_integrantes_multirol.sql ya haya sido aplicada.';
  END IF;
END $$;

-- 1) mapeo_persona_info: agrega los casts ::text pendientes en telefono y
--    asignado_por_rol. Misma firma, mismo comportamiento salvo el tipo exacto
--    devuelto en esas dos columnas.
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
           d.telefono::text, 'dirigente'::text,
           d.ci, NULL::bigint, d.ci, 'dirigente'::text, NULL::boolean
    FROM dirigentes d
    LEFT JOIN padron p ON p.ci = d.ci
    WHERE d.ci = p_ci;
  ELSIF v_rol = 'coordinador' THEN
    RETURN QUERY
    SELECT COALESCE(p.nombre, '')::text, COALESCE(p.apellido, '')::text,
           c.telefono::text, 'coordinador'::text,
           c.dirigente_ci, c.ci, c.ci, 'coordinador'::text, NULL::boolean
    FROM coordinadores c
    LEFT JOIN padron p ON p.ci = c.ci
    WHERE c.ci = p_ci;
  ELSIF v_rol = 'subcoordinador' THEN
    RETURN QUERY
    SELECT COALESCE(p.nombre, '')::text, COALESCE(p.apellido, '')::text,
           s.telefono::text, 'subcoordinador'::text,
           c.dirigente_ci, s.coordinador_ci, s.ci, 'subcoordinador'::text, NULL::boolean
    FROM subcoordinadores s
    LEFT JOIN coordinadores c ON c.ci = s.coordinador_ci
    LEFT JOIN padron p ON p.ci = s.ci
    WHERE s.ci = p_ci;
  ELSIF v_rol = 'votante' THEN
    RETURN QUERY
    SELECT COALESCE(p.nombre, '')::text, COALESCE(p.apellido, '')::text,
           v.telefono::text, 'votante'::text,
           v.dirigente_ci, v.coordinador_ci, v.asignado_por, v.asignado_por_rol::text, v.voto_confirmado
    FROM votantes v
    LEFT JOIN padron p ON p.ci = v.ci
    WHERE v.ci = p_ci;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE;

REVOKE ALL ON FUNCTION mapeo_persona_info(bigint) FROM PUBLIC;

-- 2) mapeo_eliminar_hogar: nueva función, ver comentario superior. Las dos UPDATE
--    quedan dentro de la misma llamada a esta función, que Postgres ejecuta como
--    una única transacción implícita: si cualquier sentencia fallara, se revierte
--    todo junto.
CREATE OR REPLACE FUNCTION mapeo_eliminar_hogar(
  p_login_code text,
  p_superadmin_ci text,
  p_hogar_id uuid
) RETURNS hogares AS $$
DECLARE
  v_ci text;
  v_rol text;
  v_hogar hogares;
BEGIN
  SELECT actor_ci, actor_rol INTO v_ci, v_rol FROM mapeo_resolver_actor(p_login_code, p_superadmin_ci);

  IF v_rol <> 'superadmin' THEN
    RAISE EXCEPTION 'Solo superadmin puede eliminar el mapeo de un hogar.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM hogares h WHERE h.id = p_hogar_id) THEN
    RAISE EXCEPTION 'El hogar % no existe.', p_hogar_id;
  END IF;

  UPDATE hogar_votantes
  SET activo = false
  WHERE hogar_id = p_hogar_id AND activo = true;

  UPDATE hogares
  SET activo = false
  WHERE id = p_hogar_id
  RETURNING * INTO v_hogar;

  RETURN v_hogar;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION mapeo_eliminar_hogar(text, text, uuid) TO anon, authenticated;
