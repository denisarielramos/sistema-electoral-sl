-- ============================================================================
-- Monitoreo de recorridos GPS — FASE 4: soporte puntual para el frontend admin
-- ============================================================================
-- Migración NUEVA y separada. NO modifica ninguna de las 3 migraciones ya
-- aplicadas al proyecto real (20261002120000, 20261002130000, 20261002140000).
-- NO crea tablas nuevas. Agrega UNA sola RPC.
--
-- Motivo: para que el panel administrativo (Fase 4, frontend) pueda ofrecer
-- "Regenerar código" sobre una asignación existente, necesita conocer el
-- asignacion_id de cada chofer ya asignado a una jornada — y ninguna RPC
-- actual lo devuelve en un listado (recorrido_admin_listar_estado expone
-- sesion_id, no asignacion_id; recorrido_admin_detalle_chofer ya lo requiere
-- como parámetro de entrada, no es útil para listar). La alternativa de
-- consultar recorrido_asignaciones directamente desde el frontend no es
-- posible (RLS sin policies, por diseño desde la Fase 1) y tampoco sería
-- deseable: expondría codigo_hash si alguien escribiera un SELECT * a mano.
--
-- recorrido_admin_listar_asignaciones(p_admin_token, p_jornada_id, p_busqueda,
-- p_limite, p_offset) llena exactamente ese hueco, con el mismo contrato de
-- siempre: valida p_admin_token, SECURITY DEFINER, SET search_path = public,
-- pg_temp, paginada con techo de 500, búsqueda por nombre/apellido/CI, y
-- jamás devuelve codigo_hash, token_hash ni ningún otro secreto — solo los
-- campos que el panel necesita para listar y decidir si regenerar un código.
-- REVOKE ALL explícito de anon/authenticated/service_role/PUBLIC antes de
-- otorgar EXECUTE solo a anon/authenticated (mismo criterio ya aplicado en el
-- hardening de la Fase 3: un REVOKE FROM PUBLIC no alcanza por sí solo).
--
-- No se aplica esta migración al proyecto real de Supabase desde esta
-- sesión — queda para revisión manual antes de aplicar.
-- ============================================================================

CREATE OR REPLACE FUNCTION recorrido_admin_listar_asignaciones(
  p_admin_token text,
  p_jornada_id uuid,
  p_busqueda text DEFAULT NULL,
  p_limite int DEFAULT 200,
  p_offset int DEFAULT 0
) RETURNS jsonb AS $$
DECLARE
  v_admin_id uuid;
  v_limite int;
  v_offset int;
  v_asignaciones jsonb;
  v_total int;
BEGIN
  v_admin_id := recorrido_admin_validar_token(p_admin_token);
  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'SESION_ADMIN_INVALIDA');
  END IF;

  IF p_jornada_id IS NULL OR NOT EXISTS (SELECT 1 FROM recorrido_jornadas WHERE id = p_jornada_id) THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'JORNADA_NO_ENCONTRADA');
  END IF;

  v_limite := LEAST(GREATEST(COALESCE(p_limite, 200), 1), 500);
  v_offset := GREATEST(COALESCE(p_offset, 0), 0);

  -- La sesión más reciente de cada asignación (si existe) vía LATERAL, mismo
  -- patrón ya usado en recorrido_admin_listar_estado/detalle_chofer — nunca se
  -- expone codigo_hash ni ningún campo de recorrido_sesiones más allá de los
  -- 3 listados abajo (sesion_id/iniciado_at/finalizado_at).
  WITH filtradas AS (
    SELECT
      a.id AS asignacion_id, a.jornada_id, a.chofer_id, a.activo, a.codigo_expira_at,
      c.ci, c.nombre, c.apellido, c.telefono, c.seccional, c.local_votacion,
      s.id AS sesion_id, s.iniciado_at, s.finalizado_at
    FROM recorrido_asignaciones a
    JOIN recorrido_choferes c ON c.id = a.chofer_id
    LEFT JOIN LATERAL (
      SELECT * FROM recorrido_sesiones rs WHERE rs.asignacion_id = a.id ORDER BY rs.created_at DESC LIMIT 1
    ) s ON true
    WHERE a.jornada_id = p_jornada_id
      AND (
        p_busqueda IS NULL OR btrim(p_busqueda) = ''
        OR c.ci::text ILIKE '%' || btrim(p_busqueda) || '%'
        OR c.nombre ILIKE '%' || btrim(p_busqueda) || '%'
        OR c.apellido ILIKE '%' || btrim(p_busqueda) || '%'
      )
  )
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'asignacion_id', asignacion_id, 'jornada_id', jornada_id, 'chofer_id', chofer_id,
      'ci', ci, 'nombre', nombre, 'apellido', apellido, 'telefono', telefono,
      'seccional', seccional, 'local_votacion', local_votacion, 'activo', activo,
      'codigo_expira_at', codigo_expira_at,
      'sesion_id', sesion_id, 'iniciado_at', iniciado_at, 'finalizado_at', finalizado_at
    ) ORDER BY nombre, apellido) FILTER (WHERE rn > v_offset AND rn <= v_offset + v_limite), '[]'::jsonb),
    MAX(rn)
  INTO v_asignaciones, v_total
  FROM (SELECT *, row_number() OVER (ORDER BY nombre, apellido) AS rn FROM filtradas) paginado;

  RETURN jsonb_build_object(
    'ok', true, 'asignaciones', v_asignaciones, 'total', COALESCE(v_total, 0),
    'limite', v_limite, 'offset', v_offset
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION recorrido_admin_listar_asignaciones(text, uuid, text, int, int) FROM anon, authenticated, service_role, PUBLIC;
GRANT EXECUTE ON FUNCTION recorrido_admin_listar_asignaciones(text, uuid, text, int, int) TO anon, authenticated;
