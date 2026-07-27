-- ============================================================================
-- Corrige "column v.nombre does not exist" en mapeo_listar_hogares/listar_visitas
-- ============================================================================
-- IMPORTANTE: la migración 20260727100000_mapeo_territorial_bitacora.sql YA FUE
-- APLICADA MANUALMENTE en producción y tenía un error real: mapeo_listar_hogares y
-- mapeo_listar_visitas leían v.nombre / v.apellido directamente de `votantes`, pero
-- esa tabla NO tiene esas columnas — viven en `padron` (mismo patrón que ya usa
-- src/App.jsx al autenticar coordinador/subcoordinador: `select ... padron(*)`).
-- Esto rompía en tiempo de ejecución el módulo de Mapeo territorial y la Bitácora de
-- visitas con "column v.nombre does not exist" apenas se llamaba a cualquiera de las
-- dos funciones.
--
-- Este archivo es un parche mínimo e idempotente: reemplaza ÚNICAMENTE esas dos
-- funciones (CREATE OR REPLACE, misma firma) para que lean nombre/apellido desde
-- `padron` vía LEFT JOIN. No crea ni borra tablas, no modifica datos, y es seguro
-- de reejecutar tantas veces como haga falta. Es exactamente el mismo cambio que ya
-- quedó incorporado en supabase/migrations/20260727100000_mapeo_territorial_bitacora.sql
-- para instalaciones nuevas — este archivo solo lo aplica a una base que ya tenía la
-- versión rota de esas dos funciones.
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
  IF to_regclass('public.votantes') IS NULL THEN
    RAISE EXCEPTION 'Falta la tabla "votantes" (esquema base).';
  END IF;
  IF to_regclass('public.padron') IS NULL THEN
    RAISE EXCEPTION 'Falta la tabla "padron" (esquema base).';
  END IF;
END $$;

-- ======================= LISTAR HOGARES (con votantes agregados) =======================
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
      -- votantes NO tiene nombre/apellido — esos campos viven en padron. LEFT JOIN
      -- (no JOIN) para no descartar en silencio a un votante cuya fila de padron
      -- falte o no calce: en ese caso se devuelve nombre/apellido vacíos en vez de
      -- perder al votante del listado.
      SELECT jsonb_agg(jsonb_build_object(
        'ci', v.ci::text, 'nombre', COALESCE(p.nombre, ''), 'apellido', COALESCE(p.apellido, ''),
        'telefono', v.telefono, 'dirigente_ci', v.dirigente_ci::text,
        'coordinador_ci', v.coordinador_ci::text, 'asignado_por', v.asignado_por::text,
        'asignado_por_rol', v.asignado_por_rol, 'voto_confirmado', v.voto_confirmado
      ))
      FROM hogar_votantes hv
      JOIN votantes v ON v.ci = hv.votante_ci
      LEFT JOIN padron p ON p.ci = v.ci
      WHERE hv.hogar_id = h.id AND hv.activo = true
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
        AND vh.fecha_hora >= h.ubicacion_actualizada_at
      ORDER BY vh.fecha_hora DESC
      LIMIT 1
    ) AS ultima_visita
  FROM hogares h
  WHERE h.activo = true
    AND (v_rol = 'superadmin' OR mapeo_hogar_en_alcance(h.id, v_ci, v_rol));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE;

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
      -- nombre/apellido vienen de padron (votantes no los tiene) vía LEFT JOIN —
      -- mismo criterio que mapeo_listar_hogares.
      SELECT jsonb_agg(jsonb_build_object('ci', v.ci::text, 'nombre', COALESCE(p.nombre, ''), 'apellido', COALESCE(p.apellido, '')))
      FROM hogar_votantes hv
      JOIN votantes v ON v.ci = hv.votante_ci
      LEFT JOIN padron p ON p.ci = v.ci
      WHERE hv.hogar_id = h.id AND hv.activo = true
        AND (v_rol = 'superadmin' OR mapeo_votante_en_alcance(v.ci, v_ci, v_rol))
    ), '[]'::jsonb) AS votantes
  FROM visitas_hogar vh
  JOIN hogares h ON h.id = vh.hogar_id
  WHERE (p_hogar_id IS NULL OR vh.hogar_id = p_hogar_id)
    AND (v_rol = 'superadmin' OR mapeo_hogar_en_alcance(vh.hogar_id, v_ci, v_rol))
  ORDER BY vh.fecha_hora DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE;

-- CREATE OR REPLACE FUNCTION conserva los GRANTs existentes mientras la firma no
-- cambie (no cambió), pero se re-otorgan de forma idempotente por si esta base
-- llegara a un estado donde faltaran.
GRANT EXECUTE ON FUNCTION mapeo_listar_hogares(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION mapeo_listar_visitas(text, text, uuid) TO anon, authenticated;
