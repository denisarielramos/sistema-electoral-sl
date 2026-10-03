-- ============================================================================
-- Monitoreo de recorridos GPS — FASE 3: backend administrativo
-- ============================================================================
-- Migración NUEVA y separada. NO modifica nada de
-- supabase/migrations/20261002120000_recorrido_monitoreo.sql ni de
-- supabase/migrations/20261002130000_recorrido_fix_internal_function_privileges.sql
-- (ambas ya aplicadas al proyecto real) — solo agrega funciones RPC nuevas y un
-- puñado de índices nuevos sobre las tablas que esa migración ya creó. NO crea
-- tablas nuevas: todo lo que esta fase necesita ya existe desde la Fase 1.
--
-- Esta fase es EXCLUSIVAMENTE backend para el panel administrativo. No hay
-- Google Maps, no hay dashboard visual, no hay cambios de frontend — eso queda
-- para fases posteriores con aprobación previa. Tampoco se aplica todavía al
-- proyecto real de Supabase ni se ejecuta ningún seed.
--
-- ── ACLARACIÓN DE ARQUITECTURA (acceso administrativo) ──────────────────────
-- Todo lo que estas RPC exponen (jornadas, choferes, códigos, asignaciones,
-- estado en vivo, alertas, historial, replay) está pensado para ser consumido
-- ÚNICAMENTE por los superadmin YA EXISTENTES del sistema (SUPERADMINS en
-- src/App.jsx), dentro del Dashboard ya existente, gateado por
-- currentUser.role === "superadmin" — igual que ya se hace con "Asistencias".
-- NO habrá un panel administrativo público independiente para este módulo, y
-- NO existe ni va a crearse ninguna ruta /admin/recorridos con un login
-- administrativo separado. Dirigente/coordinador/subcoordinador NUNCA tienen
-- acceso a nada de esto.
-- recorrido_admin_access y recorrido_admin_sesiones (tablas de la Fase 1) NO
-- son una segunda experiencia de login de cara al usuario: son el mecanismo
-- de AUTORIZACIÓN server-side de este módulo. En una fase posterior (frontend,
-- fuera del alcance de esta migración), el login de superadmin ya existente
-- deberá obtener de forma transparente un admin_token de este módulo al
-- iniciar sesión (un solo login visible para la persona, dos credenciales
-- coordinadas por detrás) — esta Fase 3 solo deja el backend listo para que
-- eso sea posible, sin resolver todavía ese puente ni tocar App.jsx/Dashboard.jsx.
-- Importante: esto es una decisión de DÓNDE vive la UI, no un relajamiento de
-- seguridad — ocultar el frontend nunca es una medida de seguridad suficiente,
-- así que cada RPC de abajo sigue exigiendo y validando p_admin_token
-- server-side exactamente igual que si el panel fuera público.
--
-- Resumen de lo que agrega:
--   1) Un helper interno nuevo: generación de códigos temporales de chofer
--      (distinto del token de sesión: un código más corto, pensado para que un
--      humano lo tipee, con suficiente entropía para no ser adivinable).
--   2) Dos índices nuevos (jornada única activa + orden de historial) — NO se
--      elimina ni modifica ningún índice existente.
--   3) RPC administrativas (SECURITY DEFINER) para jornadas, choferes
--      (incluida importación masiva), asignaciones/códigos, detalle de
--      chofer/sesión, historial, replay (puntos/paradas/alertas) y gestión de
--      administradores del módulo — siempre validando p_admin_token server-side
--      vía recorrido_admin_validar_token (ya existe desde la Fase 1).
--   4) Mismo contrato de siempre: {ok:true, ...} / {ok:false, codigo:"..."},
--      REVOKE ALL FROM PUBLIC antes de otorgar EXECUTE solo a anon/authenticated
--      en las RPC públicas, y los helpers internos sin EXECUTE para
--      anon/authenticated/service_role/PUBLIC (lección aprendida en el hotfix
--      de la Fase 1: un REVOKE FROM PUBLIC no alcanza si en algún momento se
--      otorgó EXECUTE explícito a otro rol con nombre — por eso los helpers de
--      esta fase se revocan explícitamente de los 4).
--
-- NOTA SOBRE ADMINISTRADORES REALES (ver sección 8 al final de este archivo):
-- esta migración NO inserta ningún administrador ni contraseña, ni ejecuta el
-- seed de desarrollo. El primer administrador real sigue siendo, por
-- necesidad (no hay todavía ninguno con quien autenticarse), una única
-- inserción manual en el SQL Editor de Supabase — nunca en un archivo de este
-- repositorio. A partir de ese primer administrador, el resto se puede crear
-- con la RPC recorrido_admin_crear_admin (abajo), sin volver a tocar SQL a
-- mano ni commitear ninguna contraseña.
-- ============================================================================

-- ============================================================================
-- 1) ÍNDICES NUEVOS (sobre tablas ya existentes — ninguno se elimina)
-- ============================================================================

-- Evita que, por error humano o un bug futuro, queden dos jornadas "activa"
-- al mismo tiempo. El diseño operativo actual asume una sola jornada vigente
-- (recorrido_iniciar_sesion_chofer ya resuelve "la" asignación activa sin
-- desambiguar entre jornadas) — la solución más simple y segura es un índice
-- único parcial sobre una expresión constante: como todas las filas con
-- activa=true tendrían el mismo valor de la expresión ((true)), Postgres no
-- permite que haya más de una. Es la forma idiomática de expresar "a lo sumo
-- una fila cumple esta condición" sin tener que coordinar un UPDATE manual
-- en cada lugar que active una jornada.
-- Nota: si al aplicar esta migración ya existieran 2+ jornadas activa=true en
-- la base real, este CREATE fallará con un error claro (constraint violation)
-- en vez de corromper nada — es el comportamiento deseado (fail-fast), y daría
-- la señal de que hay que desactivar manualmente las jornadas de más antes de
-- reintentar. Al día de esta migración, recorrido_jornadas está vacía en
-- producción (ningún seed se ejecutó ahí), así que se espera que aplique sin
-- fricción.
CREATE UNIQUE INDEX IF NOT EXISTS ux_recorrido_jornadas_unica_activa
  ON recorrido_jornadas ((true)) WHERE activa = true;

-- Orden descendente por fecha de creación para el listado de historial
-- (recorrido_admin_listar_historico, más abajo) — a la escala actual (algunas
-- jornadas por año, unos pocos miles de sesiones en total) un sequential scan
-- sería imperceptible igual, pero esto evita un sort costoso a medida que el
-- histórico crezca con el tiempo.
CREATE INDEX IF NOT EXISTS ix_recorrido_sesiones_created_at ON recorrido_sesiones(created_at DESC);

-- ============================================================================
-- 2) HELPER INTERNO NUEVO: generación de código temporal de chofer
-- ============================================================================
-- Distinto del token de sesión (recorrido_generar_token, 256 bits en hex: 64
-- caracteres, pensado para viajar en una URL/header, no para que un humano lo
-- tipee). Este código es el que el chofer escribe a mano en /recorrido, así
-- que debe ser corto pero con entropía real:
--   - 10 caracteres de un alfabeto de 33 símbolos sin ambigüedad visual (sin
--     0/O ni 1/I, que se confunden fácil al leer/tipear en un papel o
--     WhatsApp) → 33^10 ≈ 1.8×10^15 combinaciones (~50 bits de entropía),
--     muy por encima de lo que se podría probar a fuerza bruta durante la
--     corta vida de un código (horas, no años), y combinado además con la CI
--     del chofer como segundo dato que hay que conocer.
--   - Se guarda SIEMPRE con bcrypt (extensions.crypt + gen_salt('bf')), igual
--     que el resto de los secretos del módulo — nunca texto plano.
--   - El código crudo se devuelve UNA sola vez, en el momento en que se
--     genera/regenera (ver recorrido_admin_asignar_choferes y
--     recorrido_admin_regenerar_codigo) — después de eso, no existe ninguna
--     RPC ni consulta que permita recuperarlo: solo se puede volver a
--     regenerar (invalidando el anterior), nunca "ver" el que ya existe.
CREATE OR REPLACE FUNCTION recorrido_generar_codigo_temporal()
RETURNS TABLE(codigo text, codigo_hash text) AS $$
DECLARE
  v_alfabeto constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- sin 0/O ni 1/I
  v_crudo text := '';
  v_bytes bytea;
  i int;
BEGIN
  v_bytes := extensions.gen_random_bytes(10);
  FOR i IN 0..9 LOOP
    v_crudo := v_crudo || substr(v_alfabeto, (get_byte(v_bytes, i) % length(v_alfabeto)) + 1, 1);
  END LOOP;
  -- Separador puramente cosmético (más fácil de leer/dictar en voz alta), sin
  -- efecto en la entropía real.
  codigo := substr(v_crudo, 1, 5) || '-' || substr(v_crudo, 6, 5);
  codigo_hash := extensions.crypt(codigo, extensions.gen_salt('bf'));
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql VOLATILE SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION recorrido_generar_codigo_temporal() FROM anon, authenticated, service_role, PUBLIC;

-- ============================================================================
-- 3) RPC ADMIN — JORNADAS
-- ============================================================================

CREATE OR REPLACE FUNCTION recorrido_admin_listar_jornadas(p_admin_token text)
RETURNS jsonb AS $$
DECLARE
  v_admin_id uuid;
  v_jornadas jsonb;
BEGIN
  v_admin_id := recorrido_admin_validar_token(p_admin_token);
  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'SESION_ADMIN_INVALIDA');
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id, 'nombre', nombre, 'fecha', fecha, 'activa', activa, 'created_at', created_at
  ) ORDER BY fecha DESC, created_at DESC), '[]'::jsonb)
  INTO v_jornadas
  FROM recorrido_jornadas;

  RETURN jsonb_build_object('ok', true, 'jornadas', v_jornadas);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION recorrido_admin_crear_jornada(
  p_admin_token text,
  p_nombre text,
  p_fecha date
) RETURNS jsonb AS $$
DECLARE
  v_admin_id uuid;
  v_jornada recorrido_jornadas%ROWTYPE;
BEGIN
  v_admin_id := recorrido_admin_validar_token(p_admin_token);
  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'SESION_ADMIN_INVALIDA');
  END IF;

  IF p_nombre IS NULL OR btrim(p_nombre) = '' OR p_fecha IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'JORNADA_DATOS_INVALIDOS');
  END IF;

  -- activa queda en su DEFAULT false a propósito: una jornada nueva nunca se
  -- auto-activa (ver recorrido_admin_activar_jornada para activarla a mano).
  INSERT INTO recorrido_jornadas (nombre, fecha)
  VALUES (btrim(p_nombre), p_fecha)
  RETURNING * INTO v_jornada;

  RETURN jsonb_build_object('ok', true, 'jornada', jsonb_build_object(
    'id', v_jornada.id, 'nombre', v_jornada.nombre, 'fecha', v_jornada.fecha, 'activa', v_jornada.activa
  ));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION recorrido_admin_actualizar_jornada(
  p_admin_token text,
  p_jornada_id uuid,
  p_nombre text,
  p_fecha date
) RETURNS jsonb AS $$
DECLARE
  v_admin_id uuid;
  v_jornada recorrido_jornadas%ROWTYPE;
BEGIN
  v_admin_id := recorrido_admin_validar_token(p_admin_token);
  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'SESION_ADMIN_INVALIDA');
  END IF;

  IF p_jornada_id IS NULL OR p_nombre IS NULL OR btrim(p_nombre) = '' OR p_fecha IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'JORNADA_DATOS_INVALIDOS');
  END IF;

  -- Deliberadamente NO toca "activa" — esa es una decisión operativa separada,
  -- ver recorrido_admin_activar_jornada / recorrido_admin_desactivar_jornada.
  UPDATE recorrido_jornadas
    SET nombre = btrim(p_nombre), fecha = p_fecha, updated_at = now()
    WHERE id = p_jornada_id
    RETURNING * INTO v_jornada;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'JORNADA_NO_ENCONTRADA');
  END IF;

  RETURN jsonb_build_object('ok', true, 'jornada', jsonb_build_object(
    'id', v_jornada.id, 'nombre', v_jornada.nombre, 'fecha', v_jornada.fecha, 'activa', v_jornada.activa
  ));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION recorrido_admin_activar_jornada(
  p_admin_token text,
  p_jornada_id uuid
) RETURNS jsonb AS $$
DECLARE
  v_admin_id uuid;
  v_jornada recorrido_jornadas%ROWTYPE;
BEGIN
  v_admin_id := recorrido_admin_validar_token(p_admin_token);
  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'SESION_ADMIN_INVALIDA');
  END IF;

  -- Se verifica que la jornada exista ANTES de tocar ninguna otra fila: si
  -- esto fallara después de desactivar las demás, quedaríamos sin ninguna
  -- jornada activa por un simple error de ID. El índice único parcial (ver
  -- sección 1) es la red de seguridad final, pero este orden evita el
  -- problema de entrada.
  SELECT * INTO v_jornada FROM recorrido_jornadas WHERE id = p_jornada_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'JORNADA_NO_ENCONTRADA');
  END IF;

  UPDATE recorrido_jornadas SET activa = false, updated_at = now() WHERE activa = true AND id <> p_jornada_id;
  UPDATE recorrido_jornadas SET activa = true, updated_at = now() WHERE id = p_jornada_id RETURNING * INTO v_jornada;

  RETURN jsonb_build_object('ok', true, 'jornada', jsonb_build_object(
    'id', v_jornada.id, 'nombre', v_jornada.nombre, 'fecha', v_jornada.fecha, 'activa', v_jornada.activa
  ));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION recorrido_admin_desactivar_jornada(
  p_admin_token text,
  p_jornada_id uuid
) RETURNS jsonb AS $$
DECLARE
  v_admin_id uuid;
  v_jornada recorrido_jornadas%ROWTYPE;
BEGIN
  v_admin_id := recorrido_admin_validar_token(p_admin_token);
  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'SESION_ADMIN_INVALIDA');
  END IF;

  UPDATE recorrido_jornadas SET activa = false, updated_at = now()
    WHERE id = p_jornada_id
    RETURNING * INTO v_jornada;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'JORNADA_NO_ENCONTRADA');
  END IF;

  RETURN jsonb_build_object('ok', true, 'jornada', jsonb_build_object(
    'id', v_jornada.id, 'nombre', v_jornada.nombre, 'fecha', v_jornada.fecha, 'activa', v_jornada.activa
  ));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ============================================================================
-- 4) RPC ADMIN — CHOFERES
-- ============================================================================

CREATE OR REPLACE FUNCTION recorrido_admin_listar_choferes(
  p_admin_token text,
  p_busqueda text DEFAULT NULL,
  p_solo_activos boolean DEFAULT NULL,
  p_limite int DEFAULT 200,
  p_offset int DEFAULT 0
) RETURNS jsonb AS $$
DECLARE
  v_admin_id uuid;
  v_limite int;
  v_offset int;
  v_choferes jsonb;
  v_total int;
BEGIN
  v_admin_id := recorrido_admin_validar_token(p_admin_token);
  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'SESION_ADMIN_INVALIDA');
  END IF;

  v_limite := LEAST(GREATEST(COALESCE(p_limite, 200), 1), 500);
  v_offset := GREATEST(COALESCE(p_offset, 0), 0);

  WITH filtrados AS (
    SELECT *
    FROM recorrido_choferes c
    WHERE (p_solo_activos IS NULL OR c.activo = p_solo_activos)
      AND (
        p_busqueda IS NULL OR btrim(p_busqueda) = ''
        OR c.ci::text ILIKE '%' || btrim(p_busqueda) || '%'
        OR c.nombre ILIKE '%' || btrim(p_busqueda) || '%'
        OR c.apellido ILIKE '%' || btrim(p_busqueda) || '%'
      )
  )
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'id', id, 'ci', ci, 'nombre', nombre, 'apellido', apellido, 'telefono', telefono,
      'seccional', seccional, 'local_votacion', local_votacion, 'activo', activo
    ) ORDER BY nombre, apellido) FILTER (WHERE rn > v_offset AND rn <= v_offset + v_limite), '[]'::jsonb),
    MAX(rn)
  INTO v_choferes, v_total
  FROM (SELECT *, row_number() OVER (ORDER BY nombre, apellido) AS rn FROM filtrados) paginado;

  RETURN jsonb_build_object('ok', true, 'choferes', v_choferes, 'total', COALESCE(v_total, 0), 'limite', v_limite, 'offset', v_offset);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION recorrido_admin_crear_chofer(
  p_admin_token text,
  p_ci bigint,
  p_nombre text,
  p_apellido text,
  p_telefono text,
  p_seccional text,
  p_local_votacion text
) RETURNS jsonb AS $$
DECLARE
  v_admin_id uuid;
  v_chofer recorrido_choferes%ROWTYPE;
BEGIN
  v_admin_id := recorrido_admin_validar_token(p_admin_token);
  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'SESION_ADMIN_INVALIDA');
  END IF;

  IF p_ci IS NULL OR p_ci <= 0 OR p_nombre IS NULL OR btrim(p_nombre) = '' THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'CHOFER_DATOS_INVALIDOS');
  END IF;

  BEGIN
    INSERT INTO recorrido_choferes (ci, nombre, apellido, telefono, seccional, local_votacion)
    VALUES (p_ci, btrim(p_nombre), p_apellido, p_telefono, p_seccional, p_local_votacion)
    RETURNING * INTO v_chofer;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'CI_DUPLICADO');
  END;

  RETURN jsonb_build_object('ok', true, 'chofer', jsonb_build_object(
    'id', v_chofer.id, 'ci', v_chofer.ci, 'nombre', v_chofer.nombre, 'apellido', v_chofer.apellido,
    'telefono', v_chofer.telefono, 'seccional', v_chofer.seccional, 'local_votacion', v_chofer.local_votacion,
    'activo', v_chofer.activo
  ));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION recorrido_admin_actualizar_chofer(
  p_admin_token text,
  p_chofer_id uuid,
  p_nombre text,
  p_apellido text,
  p_telefono text,
  p_seccional text,
  p_local_votacion text,
  p_activo boolean
) RETURNS jsonb AS $$
DECLARE
  v_admin_id uuid;
  v_chofer recorrido_choferes%ROWTYPE;
BEGIN
  v_admin_id := recorrido_admin_validar_token(p_admin_token);
  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'SESION_ADMIN_INVALIDA');
  END IF;

  IF p_chofer_id IS NULL OR p_nombre IS NULL OR btrim(p_nombre) = '' OR p_activo IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'CHOFER_DATOS_INVALIDOS');
  END IF;

  -- La CI NO se puede cambiar desde esta RPC a propósito: es la clave natural
  -- del roster y cambiarla silenciosamente podría romper la correspondencia
  -- con asignaciones/códigos ya entregados. Si una CI se cargó mal, la
  -- corrección operativa es desactivar este registro y crear uno nuevo.
  UPDATE recorrido_choferes
    SET nombre = btrim(p_nombre), apellido = p_apellido, telefono = p_telefono,
        seccional = p_seccional, local_votacion = p_local_votacion, activo = p_activo,
        updated_at = now()
    WHERE id = p_chofer_id
    RETURNING * INTO v_chofer;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'CHOFER_NO_ENCONTRADO');
  END IF;

  RETURN jsonb_build_object('ok', true, 'chofer', jsonb_build_object(
    'id', v_chofer.id, 'ci', v_chofer.ci, 'nombre', v_chofer.nombre, 'apellido', v_chofer.apellido,
    'telefono', v_chofer.telefono, 'seccional', v_chofer.seccional, 'local_votacion', v_chofer.local_votacion,
    'activo', v_chofer.activo
  ));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Importación masiva (pensada para el futuro Excel — NO se implementa frontend
-- todavía). Upsert por CI: un CI ya existente se actualiza, uno nuevo se crea.
-- Nunca toca padron/votantes/coordinadores/subcoordinadores/dirigentes — ni
-- siquiera los menciona, por diseño (ver nota de aislamiento en la Fase 1).
-- Cada elemento se procesa en su propio sub-bloque con EXCEPTION: una fila
-- mal formada se cuenta como rechazada sin abortar el resto del batch (a
-- diferencia de recorrido_registrar_ubicaciones, que descarta el batch
-- COMPLETO ante cualquier error — acá se prefiere máxima tolerancia por fila,
-- porque es una carga administrativa puntual donde importa saber
-- exactamente cuáles filas fallaron, no solo "falló algo").
CREATE OR REPLACE FUNCTION recorrido_admin_importar_choferes(
  p_admin_token text,
  p_choferes jsonb
) RETURNS jsonb AS $$
DECLARE
  v_admin_id uuid;
  v_max_elementos constant int := 500;
  v_cantidad int;
  v_elem jsonb;
  v_ci bigint;
  v_nombre text;
  v_id uuid;
  v_creados int := 0;
  v_actualizados int := 0;
  v_rechazados int := 0;
  v_detalles_rechazados jsonb := '[]'::jsonb;
  v_indice int := 0;
BEGIN
  v_admin_id := recorrido_admin_validar_token(p_admin_token);
  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'SESION_ADMIN_INVALIDA');
  END IF;

  IF p_choferes IS NULL OR jsonb_typeof(p_choferes) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'CHOFERES_INVALIDOS');
  END IF;

  v_cantidad := jsonb_array_length(p_choferes);
  IF v_cantidad = 0 THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'CHOFERES_VACIO');
  END IF;
  IF v_cantidad > v_max_elementos THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'CHOFERES_EXCEDEN_LIMITE');
  END IF;

  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_choferes) LOOP
    v_indice := v_indice + 1;
    BEGIN
      v_ci := (v_elem ->> 'ci')::bigint;
      v_nombre := btrim(v_elem ->> 'nombre');

      IF v_ci IS NULL OR v_ci <= 0 OR v_nombre IS NULL OR v_nombre = '' THEN
        RAISE EXCEPTION 'ci o nombre inválido';
      END IF;

      UPDATE recorrido_choferes
        SET nombre = v_nombre,
            apellido = v_elem ->> 'apellido',
            telefono = v_elem ->> 'telefono',
            seccional = v_elem ->> 'seccional',
            local_votacion = v_elem ->> 'local_votacion',
            updated_at = now()
        WHERE ci = v_ci
        RETURNING id INTO v_id;

      IF FOUND THEN
        v_actualizados := v_actualizados + 1;
      ELSE
        INSERT INTO recorrido_choferes (ci, nombre, apellido, telefono, seccional, local_votacion)
        VALUES (v_ci, v_nombre, v_elem ->> 'apellido', v_elem ->> 'telefono', v_elem ->> 'seccional', v_elem ->> 'local_votacion');
        v_creados := v_creados + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_rechazados := v_rechazados + 1;
      v_detalles_rechazados := v_detalles_rechazados || jsonb_build_object('indice', v_indice, 'elemento', v_elem, 'motivo', SQLERRM);
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true, 'creados', v_creados, 'actualizados', v_actualizados,
    'rechazados', v_rechazados, 'detalles_rechazados', v_detalles_rechazados
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ============================================================================
-- 5) RPC ADMIN — ASIGNACIONES Y CÓDIGOS
-- ============================================================================

CREATE OR REPLACE FUNCTION recorrido_admin_asignar_choferes(
  p_admin_token text,
  p_jornada_id uuid,
  p_cis jsonb,
  p_horas_expiracion int DEFAULT 48
) RETURNS jsonb AS $$
DECLARE
  v_admin_id uuid;
  v_max_elementos constant int := 1000;
  v_cantidad int;
  v_ci_raw text;
  v_ci bigint;
  v_chofer recorrido_choferes%ROWTYPE;
  v_codigo text;
  v_codigo_hash text;
  v_expira timestamptz;
  v_resultados jsonb := '[]'::jsonb;
  v_rechazados jsonb := '[]'::jsonb;
BEGIN
  v_admin_id := recorrido_admin_validar_token(p_admin_token);
  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'SESION_ADMIN_INVALIDA');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM recorrido_jornadas WHERE id = p_jornada_id) THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'JORNADA_NO_ENCONTRADA');
  END IF;

  -- Techo de 30 días: un código temporal no debe poder quedar vigente
  -- indefinidamente. Piso de 1 hora: evita una expiración accidentalmente
  -- inmediata/negativa.
  IF p_horas_expiracion IS NULL OR p_horas_expiracion < 1 OR p_horas_expiracion > 720 THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'DURACION_INVALIDA');
  END IF;

  IF p_cis IS NULL OR jsonb_typeof(p_cis) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'ASIGNACION_INVALIDA');
  END IF;

  v_cantidad := jsonb_array_length(p_cis);
  IF v_cantidad = 0 THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'ASIGNACION_VACIA');
  END IF;
  IF v_cantidad > v_max_elementos THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'ASIGNACION_EXCEDE_LIMITE');
  END IF;

  FOR v_ci_raw IN SELECT jsonb_array_elements_text(p_cis) LOOP
    BEGIN
      v_ci := v_ci_raw::bigint;
    EXCEPTION WHEN OTHERS THEN
      v_rechazados := v_rechazados || jsonb_build_object('ci', v_ci_raw, 'codigo', 'CI_INVALIDO');
      CONTINUE;
    END;

    SELECT * INTO v_chofer FROM recorrido_choferes WHERE ci = v_ci AND activo = true;
    IF NOT FOUND THEN
      v_rechazados := v_rechazados || jsonb_build_object('ci', v_ci, 'codigo', 'CHOFER_NO_ENCONTRADO');
      CONTINUE;
    END IF;

    SELECT codigo, codigo_hash INTO v_codigo, v_codigo_hash FROM recorrido_generar_codigo_temporal();
    v_expira := now() + make_interval(hours => p_horas_expiracion);

    -- Upsert por (jornada_id, chofer_id): si ya existía una asignación para
    -- este chofer en esta jornada, esto la REGENERA (nuevo código, nueva
    -- expiración, se reactiva si estaba desactivada) en vez de duplicarla —
    -- cubre tanto "asignar por primera vez" como "re-entregar código" con la
    -- misma llamada.
    INSERT INTO recorrido_asignaciones (jornada_id, chofer_id, codigo_hash, codigo_expira_at)
    VALUES (p_jornada_id, v_chofer.id, v_codigo_hash, v_expira)
    ON CONFLICT (jornada_id, chofer_id) DO UPDATE
      SET codigo_hash = EXCLUDED.codigo_hash, codigo_expira_at = EXCLUDED.codigo_expira_at,
          activo = true, updated_at = now();

    v_resultados := v_resultados || jsonb_build_object(
      'ci', v_chofer.ci, 'nombre', v_chofer.nombre, 'apellido', v_chofer.apellido,
      'codigo', v_codigo, 'codigo_expira_at', v_expira
    );
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'resultados', v_resultados, 'rechazados', v_rechazados);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION recorrido_admin_regenerar_codigo(
  p_admin_token text,
  p_asignacion_id uuid,
  p_horas_expiracion int DEFAULT 48
) RETURNS jsonb AS $$
DECLARE
  v_admin_id uuid;
  v_codigo text;
  v_codigo_hash text;
  v_expira timestamptz;
  v_ci bigint;
  v_nombre text;
  v_apellido text;
BEGIN
  v_admin_id := recorrido_admin_validar_token(p_admin_token);
  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'SESION_ADMIN_INVALIDA');
  END IF;

  IF p_horas_expiracion IS NULL OR p_horas_expiracion < 1 OR p_horas_expiracion > 720 THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'DURACION_INVALIDA');
  END IF;

  SELECT codigo, codigo_hash INTO v_codigo, v_codigo_hash FROM recorrido_generar_codigo_temporal();
  v_expira := now() + make_interval(hours => p_horas_expiracion);

  UPDATE recorrido_asignaciones
    SET codigo_hash = v_codigo_hash, codigo_expira_at = v_expira, activo = true, updated_at = now()
    WHERE id = p_asignacion_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'ASIGNACION_NO_ENCONTRADA');
  END IF;

  SELECT c.ci, c.nombre, c.apellido INTO v_ci, v_nombre, v_apellido
    FROM recorrido_asignaciones a JOIN recorrido_choferes c ON c.id = a.chofer_id
    WHERE a.id = p_asignacion_id;

  RETURN jsonb_build_object(
    'ok', true, 'ci', v_ci, 'nombre', v_nombre, 'apellido', v_apellido,
    'codigo', v_codigo, 'codigo_expira_at', v_expira
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ============================================================================
-- 6) RPC ADMIN — DETALLE DE CHOFER/SESIÓN
-- ============================================================================
-- Clave por asignacion_id (no por sesion_id): una asignación siempre existe
-- una vez que el chofer fue asignado a la jornada, independientemente de si
-- ya inició su primera sesión GPS o no — así el detalle funciona también
-- para "todavía no arrancó". Internamente busca la sesión más reciente de
-- esa asignación, mismo patrón LATERAL que recorrido_admin_listar_estado
-- (Fase 1, sin tocar). El CASE de estado_calculado se duplica a propósito en
-- vez de factorizarlo: recorrido_admin_listar_estado ya está validado y esta
-- fase no lo toca, y es un cálculo de pocas líneas que no vale la pena
-- arriesgar por evitar una repetición chica.
CREATE OR REPLACE FUNCTION recorrido_admin_detalle_chofer(
  p_admin_token text,
  p_asignacion_id uuid
) RETURNS jsonb AS $$
DECLARE
  v_admin_id uuid;
  v_umbral_sin_senal_seg constant int := 90;
  v_fila record;
  v_alertas jsonb;
BEGIN
  v_admin_id := recorrido_admin_validar_token(p_admin_token);
  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'SESION_ADMIN_INVALIDA');
  END IF;

  SELECT
    c.ci, c.nombre, c.apellido, c.seccional, c.local_votacion,
    j.id AS jornada_id, j.nombre AS jornada_nombre, j.fecha AS jornada_fecha,
    s.id AS sesion_id, s.iniciado_at, s.finalizado_at, s.km_acumulados, s.paradas_count,
    e.lat, e.lng, e.capturado_at, e.recibido_at, e.estado_movimiento, e.parada_desde,
    CASE
      WHEN s.id IS NULL THEN 'no_iniciado'
      WHEN s.finalizado_at IS NOT NULL THEN 'finalizado'
      WHEN e.recibido_at IS NULL THEN 'no_iniciado'
      WHEN now() - e.recibido_at > make_interval(secs => v_umbral_sin_senal_seg) THEN 'sin_senal'
      ELSE e.estado_movimiento
    END AS estado_calculado
  INTO v_fila
  FROM recorrido_asignaciones a
  JOIN recorrido_choferes c ON c.id = a.chofer_id
  JOIN recorrido_jornadas j ON j.id = a.jornada_id
  LEFT JOIN LATERAL (
    SELECT * FROM recorrido_sesiones rs WHERE rs.asignacion_id = a.id ORDER BY rs.created_at DESC LIMIT 1
  ) s ON true
  LEFT JOIN recorrido_estado_actual e ON e.sesion_id = s.id
  WHERE a.id = p_asignacion_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'ASIGNACION_NO_ENCONTRADA');
  END IF;

  IF v_fila.sesion_id IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', id, 'tipo', tipo, 'generado_at', generado_at, 'detalle', detalle
    ) ORDER BY generado_at DESC), '[]'::jsonb)
    INTO v_alertas
    FROM recorrido_alertas
    WHERE sesion_id = v_fila.sesion_id AND resuelto_at IS NULL;
  ELSE
    v_alertas := '[]'::jsonb;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'chofer', jsonb_build_object(
      'ci', v_fila.ci, 'nombre', v_fila.nombre, 'apellido', v_fila.apellido,
      'seccional', v_fila.seccional, 'local_votacion', v_fila.local_votacion
    ),
    'jornada', jsonb_build_object('id', v_fila.jornada_id, 'nombre', v_fila.jornada_nombre, 'fecha', v_fila.jornada_fecha),
    'sesion_id', v_fila.sesion_id,
    'iniciado_at', v_fila.iniciado_at,
    'finalizado_at', v_fila.finalizado_at,
    'ultima_posicion', CASE WHEN v_fila.lat IS NULL THEN NULL ELSE jsonb_build_object('lat', v_fila.lat, 'lng', v_fila.lng) END,
    'capturado_at', v_fila.capturado_at,
    'recibido_at', v_fila.recibido_at,
    'km_acumulados', v_fila.km_acumulados,
    'paradas_count', v_fila.paradas_count,
    'estado', v_fila.estado_calculado,
    'parada_desde', v_fila.parada_desde,
    'alertas_abiertas', v_alertas
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public, pg_temp;

-- ============================================================================
-- 7) RPC ADMIN — HISTORIAL (resumen, nunca puntos crudos)
-- ============================================================================
CREATE OR REPLACE FUNCTION recorrido_admin_listar_historico(
  p_admin_token text,
  p_jornada_id uuid DEFAULT NULL,
  p_ci bigint DEFAULT NULL,
  p_fecha_desde date DEFAULT NULL,
  p_fecha_hasta date DEFAULT NULL,
  p_limite int DEFAULT 100,
  p_offset int DEFAULT 0
) RETURNS jsonb AS $$
DECLARE
  v_admin_id uuid;
  v_limite int;
  v_offset int;
  v_sesiones jsonb;
  v_total int;
BEGIN
  v_admin_id := recorrido_admin_validar_token(p_admin_token);
  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'SESION_ADMIN_INVALIDA');
  END IF;

  v_limite := LEAST(GREATEST(COALESCE(p_limite, 100), 1), 500);
  v_offset := GREATEST(COALESCE(p_offset, 0), 0);

  SELECT count(*) INTO v_total
  FROM recorrido_sesiones s
  JOIN recorrido_asignaciones a ON a.id = s.asignacion_id
  JOIN recorrido_choferes c ON c.id = a.chofer_id
  JOIN recorrido_jornadas j ON j.id = a.jornada_id
  WHERE (p_jornada_id IS NULL OR j.id = p_jornada_id)
    AND (p_ci IS NULL OR c.ci = p_ci)
    AND (p_fecha_desde IS NULL OR j.fecha >= p_fecha_desde)
    AND (p_fecha_hasta IS NULL OR j.fecha <= p_fecha_hasta);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'sesion_id', sesion_id, 'ci', ci, 'nombre', nombre, 'apellido', apellido,
    'jornada_id', jornada_id, 'jornada_nombre', jornada_nombre, 'jornada_fecha', jornada_fecha,
    'iniciado_at', iniciado_at, 'finalizado_at', finalizado_at,
    'km_acumulados', km_acumulados, 'paradas_count', paradas_count, 'alertas_count', alertas_count
  )), '[]'::jsonb)
  INTO v_sesiones
  FROM (
    SELECT
      s.id AS sesion_id, c.ci, c.nombre, c.apellido,
      j.id AS jornada_id, j.nombre AS jornada_nombre, j.fecha AS jornada_fecha,
      s.iniciado_at, s.finalizado_at, s.km_acumulados, s.paradas_count,
      (SELECT count(*) FROM recorrido_alertas al WHERE al.sesion_id = s.id) AS alertas_count
    FROM recorrido_sesiones s
    JOIN recorrido_asignaciones a ON a.id = s.asignacion_id
    JOIN recorrido_choferes c ON c.id = a.chofer_id
    JOIN recorrido_jornadas j ON j.id = a.jornada_id
    WHERE (p_jornada_id IS NULL OR j.id = p_jornada_id)
      AND (p_ci IS NULL OR c.ci = p_ci)
      AND (p_fecha_desde IS NULL OR j.fecha >= p_fecha_desde)
      AND (p_fecha_hasta IS NULL OR j.fecha <= p_fecha_hasta)
    ORDER BY s.created_at DESC
    LIMIT v_limite OFFSET v_offset
  ) pagina;

  RETURN jsonb_build_object('ok', true, 'sesiones', v_sesiones, 'total', v_total, 'limite', v_limite, 'offset', v_offset);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public, pg_temp;

-- ============================================================================
-- 8) RPC ADMIN — REPLAY (puntos de UNA sesión, paradas, alertas)
-- ============================================================================
-- Siempre acotada a UNA sesion_id (nunca "todos los choferes juntos") y con
-- límite/paginación obligatorios, igual que ya exige la arquitectura de
-- recorrido_ubicaciones desde la Fase 1 (histórico que puede crecer a
-- millones de filas por jornada).
CREATE OR REPLACE FUNCTION recorrido_admin_replay_puntos(
  p_admin_token text,
  p_sesion_id uuid,
  p_limite int DEFAULT 2000,
  p_offset int DEFAULT 0
) RETURNS jsonb AS $$
DECLARE
  v_admin_id uuid;
  v_limite int;
  v_offset int;
  v_puntos jsonb;
  v_total int;
BEGIN
  v_admin_id := recorrido_admin_validar_token(p_admin_token);
  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'SESION_ADMIN_INVALIDA');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM recorrido_sesiones WHERE id = p_sesion_id) THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'SESION_NO_ENCONTRADA');
  END IF;

  v_limite := LEAST(GREATEST(COALESCE(p_limite, 2000), 1), 5000);
  v_offset := GREATEST(COALESCE(p_offset, 0), 0);

  SELECT count(*) INTO v_total FROM recorrido_ubicaciones WHERE sesion_id = p_sesion_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'lat', lat, 'lng', lng, 'capturado_at', capturado_at, 'speed', speed, 'accuracy', accuracy, 'heading', heading
  )), '[]'::jsonb)
  INTO v_puntos
  FROM (
    SELECT lat, lng, capturado_at, speed, accuracy, heading
    FROM recorrido_ubicaciones
    WHERE sesion_id = p_sesion_id
    ORDER BY capturado_at ASC
    LIMIT v_limite OFFSET v_offset
  ) pagina;

  RETURN jsonb_build_object('ok', true, 'puntos', v_puntos, 'total', v_total, 'limite', v_limite, 'offset', v_offset);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION recorrido_admin_listar_paradas(
  p_admin_token text,
  p_sesion_id uuid
) RETURNS jsonb AS $$
DECLARE
  v_admin_id uuid;
  v_paradas jsonb;
BEGIN
  v_admin_id := recorrido_admin_validar_token(p_admin_token);
  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'SESION_ADMIN_INVALIDA');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM recorrido_sesiones WHERE id = p_sesion_id) THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'SESION_NO_ENCONTRADA');
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id, 'lat', lat, 'lng', lng, 'inicio_at', inicio_at, 'fin_at', fin_at,
    'duracion_seg', duracion_seg, 'es_alerta', es_alerta
  ) ORDER BY inicio_at ASC), '[]'::jsonb)
  INTO v_paradas
  FROM recorrido_paradas
  WHERE sesion_id = p_sesion_id;

  RETURN jsonb_build_object('ok', true, 'paradas', v_paradas);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION recorrido_admin_listar_alertas(
  p_admin_token text,
  p_sesion_id uuid
) RETURNS jsonb AS $$
DECLARE
  v_admin_id uuid;
  v_alertas jsonb;
BEGIN
  v_admin_id := recorrido_admin_validar_token(p_admin_token);
  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'SESION_ADMIN_INVALIDA');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM recorrido_sesiones WHERE id = p_sesion_id) THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'SESION_NO_ENCONTRADA');
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id, 'parada_id', parada_id, 'tipo', tipo, 'generado_at', generado_at,
    'resuelto_at', resuelto_at, 'detalle', detalle
  ) ORDER BY generado_at ASC), '[]'::jsonb)
  INTO v_alertas
  FROM recorrido_alertas
  WHERE sesion_id = p_sesion_id;

  RETURN jsonb_build_object('ok', true, 'alertas', v_alertas);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public, pg_temp;

-- ============================================================================
-- 9) RPC ADMIN — GESTIÓN DE ADMINISTRADORES DEL MÓDULO
-- ============================================================================
-- Ver nota larga al principio de este archivo: el primer administrador real
-- sigue necesitando una inserción manual única (no hay nadie todavía con
-- quien autenticarse para llamar a estas RPC) — ESO no se hace en este
-- archivo ni en ningún archivo de este repositorio. A partir de ahí, el
-- resto de los administradores se crean con recorrido_admin_crear_admin,
-- que recibe la contraseña por parámetro (viaja una sola vez, por HTTPS,
-- igual que ya hace recorrido_admin_autenticar) y la hashea server-side —
-- nunca queda en texto plano ni en Git ni en ningún log de este módulo.
-- recorrido_admin_access sigue siendo la tabla de AUTORIZACIÓN server-side de
-- este módulo, no una identidad de usuario nueva: la persona nunca ve este
-- "login" por separado. La CI de cada fila acá puede (y en la práctica va a)
-- coincidir con la CI de un superadmin ya existente del sistema — es lo que
-- permitirá, en la fase de frontend que haga el puente, que el login de
-- superadmin existente obtenga este admin_token de forma transparente sin
-- pedirle una segunda contraseña a la persona.

CREATE OR REPLACE FUNCTION recorrido_admin_crear_admin(
  p_admin_token text,
  p_ci bigint,
  p_nombre text,
  p_password text
) RETURNS jsonb AS $$
DECLARE
  v_admin_id uuid;
  v_nuevo recorrido_admin_access%ROWTYPE;
BEGIN
  v_admin_id := recorrido_admin_validar_token(p_admin_token);
  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'SESION_ADMIN_INVALIDA');
  END IF;

  IF p_ci IS NULL OR p_ci <= 0 OR p_nombre IS NULL OR btrim(p_nombre) = '' THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'ADMIN_DATOS_INVALIDOS');
  END IF;

  IF p_password IS NULL OR length(p_password) < 10 THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'PASSWORD_DEBIL');
  END IF;

  BEGIN
    INSERT INTO recorrido_admin_access (ci, nombre, password_hash)
    VALUES (p_ci, btrim(p_nombre), extensions.crypt(p_password, extensions.gen_salt('bf')))
    RETURNING * INTO v_nuevo;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'ADMIN_CI_DUPLICADO');
  END;

  RETURN jsonb_build_object('ok', true, 'admin', jsonb_build_object('id', v_nuevo.id, 'ci', v_nuevo.ci, 'nombre', v_nuevo.nombre));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION recorrido_admin_listar_admins(p_admin_token text)
RETURNS jsonb AS $$
DECLARE
  v_admin_id uuid;
  v_admins jsonb;
BEGIN
  v_admin_id := recorrido_admin_validar_token(p_admin_token);
  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'SESION_ADMIN_INVALIDA');
  END IF;

  -- Nunca se incluye password_hash en la respuesta.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id, 'ci', ci, 'nombre', nombre, 'activo', activo, 'created_at', created_at
  ) ORDER BY nombre), '[]'::jsonb)
  INTO v_admins
  FROM recorrido_admin_access;

  RETURN jsonb_build_object('ok', true, 'admins', v_admins);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION recorrido_admin_desactivar_admin(
  p_admin_token text,
  p_admin_objetivo_id uuid
) RETURNS jsonb AS $$
DECLARE
  v_admin_id uuid;
BEGIN
  v_admin_id := recorrido_admin_validar_token(p_admin_token);
  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'SESION_ADMIN_INVALIDA');
  END IF;

  -- Protección contra quedarse sin ningún admin activo por error: nadie puede
  -- desactivarse a sí mismo con su propia sesión.
  IF p_admin_objetivo_id = v_admin_id THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'NO_PUEDE_DESACTIVARSE_A_SI_MISMO');
  END IF;

  UPDATE recorrido_admin_access SET activo = false, updated_at = now() WHERE id = p_admin_objetivo_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'ADMIN_NO_ENCONTRADO');
  END IF;

  -- Invalida de inmediato cualquier sesión ya abierta de ese admin — desactivar
  -- el acceso no debe dejar tokens vigentes que sigan funcionando.
  DELETE FROM recorrido_admin_sesiones WHERE admin_id = p_admin_objetivo_id;

  RETURN jsonb_build_object('ok', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ============================================================================
-- 10) PERMISOS
-- ============================================================================
-- Mismo criterio que el resto del módulo: cada RPC administrativa se revoca
-- explícitamente de PUBLIC antes de otorgarse solo a anon/authenticated
-- (el frontend siempre usa la clave anon, no hay Supabase Auth). El helper
-- interno (sección 2) ya se revocó de los 4 roles (anon/authenticated/
-- service_role/PUBLIC) justo después de crearse, arriba.

REVOKE ALL ON FUNCTION recorrido_admin_listar_jornadas(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION recorrido_admin_listar_jornadas(text) TO anon, authenticated;

REVOKE ALL ON FUNCTION recorrido_admin_crear_jornada(text, text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION recorrido_admin_crear_jornada(text, text, date) TO anon, authenticated;

REVOKE ALL ON FUNCTION recorrido_admin_actualizar_jornada(text, uuid, text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION recorrido_admin_actualizar_jornada(text, uuid, text, date) TO anon, authenticated;

REVOKE ALL ON FUNCTION recorrido_admin_activar_jornada(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION recorrido_admin_activar_jornada(text, uuid) TO anon, authenticated;

REVOKE ALL ON FUNCTION recorrido_admin_desactivar_jornada(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION recorrido_admin_desactivar_jornada(text, uuid) TO anon, authenticated;

REVOKE ALL ON FUNCTION recorrido_admin_listar_choferes(text, text, boolean, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION recorrido_admin_listar_choferes(text, text, boolean, int, int) TO anon, authenticated;

REVOKE ALL ON FUNCTION recorrido_admin_crear_chofer(text, bigint, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION recorrido_admin_crear_chofer(text, bigint, text, text, text, text, text) TO anon, authenticated;

REVOKE ALL ON FUNCTION recorrido_admin_actualizar_chofer(text, uuid, text, text, text, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION recorrido_admin_actualizar_chofer(text, uuid, text, text, text, text, text, boolean) TO anon, authenticated;

REVOKE ALL ON FUNCTION recorrido_admin_importar_choferes(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION recorrido_admin_importar_choferes(text, jsonb) TO anon, authenticated;

REVOKE ALL ON FUNCTION recorrido_admin_asignar_choferes(text, uuid, jsonb, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION recorrido_admin_asignar_choferes(text, uuid, jsonb, int) TO anon, authenticated;

REVOKE ALL ON FUNCTION recorrido_admin_regenerar_codigo(text, uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION recorrido_admin_regenerar_codigo(text, uuid, int) TO anon, authenticated;

REVOKE ALL ON FUNCTION recorrido_admin_detalle_chofer(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION recorrido_admin_detalle_chofer(text, uuid) TO anon, authenticated;

REVOKE ALL ON FUNCTION recorrido_admin_listar_historico(text, uuid, bigint, date, date, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION recorrido_admin_listar_historico(text, uuid, bigint, date, date, int, int) TO anon, authenticated;

REVOKE ALL ON FUNCTION recorrido_admin_replay_puntos(text, uuid, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION recorrido_admin_replay_puntos(text, uuid, int, int) TO anon, authenticated;

REVOKE ALL ON FUNCTION recorrido_admin_listar_paradas(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION recorrido_admin_listar_paradas(text, uuid) TO anon, authenticated;

REVOKE ALL ON FUNCTION recorrido_admin_listar_alertas(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION recorrido_admin_listar_alertas(text, uuid) TO anon, authenticated;

REVOKE ALL ON FUNCTION recorrido_admin_crear_admin(text, bigint, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION recorrido_admin_crear_admin(text, bigint, text, text) TO anon, authenticated;

REVOKE ALL ON FUNCTION recorrido_admin_listar_admins(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION recorrido_admin_listar_admins(text) TO anon, authenticated;

REVOKE ALL ON FUNCTION recorrido_admin_desactivar_admin(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION recorrido_admin_desactivar_admin(text, uuid) TO anon, authenticated;
