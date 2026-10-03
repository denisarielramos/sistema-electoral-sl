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
--
-- UN SOLO LOGIN (revisión de esta misma fase, antes de producción): ya NO hay
-- un segundo login administrativo independiente para Recorridos.
-- recorrido_admin_autenticar(bigint,text) — de la Fase 1 — se deja sin
-- EXECUTE para ningún rol de cliente (ver sección de permisos): existir en la
-- base pero ser inalcanzable desde el frontend. En su lugar, el puente es
-- recorrido_admin_iniciar_desde_superadmin(text), que recibe el token
-- administrativo que YA devuelve el login de Asistencias/Superadmin existente,
-- lo valida server-side contra public.asistencia_admin_validar_token_interno
-- (función real ya desplegada en el proyecto), y si la CI que esa función
-- devuelve está autorizada y activa en recorrido_admin_access, emite un
-- admin_token propio de Recorridos. El navegador nunca vuelve a mandar una
-- contraseña para entrar a este módulo — un solo login visible para la
-- persona, verificado criptográficamente contra una sesión Superadmin real.
-- recorrido_admin_access pasa a ser, en los hechos, una ALLOWLIST
-- server-side: la CI de un superadmin existe en el sistema no le da acceso
-- automático a Recorridos — debe estar explícitamente autorizada acá
-- (ver recorrido_admin_autorizar_ci más abajo). password_hash sigue siendo
-- NOT NULL por el esquema ya aplicado de la Fase 1 (no se altera
-- destructivamente), pero deja de ser una contraseña real de nadie: se llena
-- con el hash de un secreto aleatorio, generado server-side, nunca devuelto,
-- nunca reutilizado ni derivado de la contraseña del superadmin.
-- Importante: esto sigue sin ser un relajamiento de seguridad — ocultar el
-- frontend nunca es una medida de seguridad suficiente, así que cada RPC de
-- abajo sigue exigiendo y validando su propio p_admin_token server-side
-- exactamente igual que si el panel fuera público.
--
-- Resumen de lo que agrega:
--   1) Un helper interno nuevo: generación de códigos temporales de chofer
--      (distinto del token de sesión: un código más corto, pensado para que un
--      humano lo tipee, con suficiente entropía para no ser adivinable).
--   2) Dos índices nuevos (jornada única activa + orden de historial) — NO se
--      elimina ni modifica ningún índice existente.
--   3) El puente recorrido_admin_iniciar_desde_superadmin(text) (ver arriba).
--   4) RPC administrativas (SECURITY DEFINER) para jornadas, choferes
--      (incluida importación masiva), asignaciones/códigos, detalle de
--      chofer/sesión, historial, replay (puntos/paradas/alertas) y gestión de
--      la allowlist de Recorridos — siempre validando p_admin_token
--      server-side vía recorrido_admin_validar_token (ya existe desde la
--      Fase 1).
--   5) ACL determinística para TODA RPC nueva: REVOKE ALL ... FROM
--      anon, authenticated, service_role, PUBLIC explícito antes de otorgar
--      EXECUTE puntualmente (solo a anon/authenticated en las públicas; a
--      nadie en los helpers internos) — lección aprendida en el hotfix de la
--      Fase 1: un REVOKE FROM PUBLIC no alcanza si en algún momento se otorgó
--      EXECUTE explícito a otro rol con nombre, así que esta fase ya no deja
--      ningún rol de cliente sin revocar explícitamente en ninguna función
--      nueva.
--
-- NOTA SOBRE LA ALLOWLIST (ver sección "GESTIÓN DE LA ALLOWLIST" más abajo):
-- esta migración NO autoriza ninguna CI ni inserta ningún secreto, ni ejecuta
-- el seed de desarrollo. La primera CI autorizada sigue siendo, por necesidad
-- (no hay todavía ninguna sesión Recorridos con la que llamar a estas RPC),
-- una única inserción manual en el SQL Editor de Supabase — nunca en un
-- archivo de este repositorio, y nunca con una contraseña real (ver ejemplo
-- en esa sección). A partir de esa primera autorización, el resto se agrega
-- con recorrido_admin_autorizar_ci (abajo), sin volver a tocar SQL a mano.
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
--   - 10 caracteres de un alfabeto de 32 símbolos sin ambigüedad visual (sin
--     0/O ni 1/I, que se confunden fácil al leer/tipear en un papel o
--     WhatsApp) → 32^10 = 2^50 ≈ 1.13×10^15 combinaciones (exactamente 50
--     bits de entropía — y como 256 (los valores posibles de un byte) es
--     múltiplo exacto de 32, el "% length(v_alfabeto)" de abajo no introduce
--     ningún sesgo), muy por encima de lo que se podría probar a fuerza bruta
--     durante la corta vida de un código (horas, no años), y combinado además
--     con la CI del chofer como segundo dato que hay que conocer.
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
-- 3) PUENTE DESDE LA SESIÓN SUPERADMIN EXISTENTE (reemplaza el login propio)
-- ============================================================================
-- Única puerta de entrada al módulo administrativo de Recorridos. Recibe el
-- token administrativo que YA devuelve el login de Superadmin/Asistencias
-- existente (public.asistencia_admin_validar_token_interno, ya desplegado en
-- el proyecto real), lo valida server-side, y solo si la CI resultante está
-- autorizada y activa en recorrido_admin_access emite un admin_token propio
-- de este módulo. El navegador NUNCA manda una contraseña para esto.
--
-- Por qué esto es seguro y no un salto de confianza "a ciegas": la llamada a
-- public.asistencia_admin_validar_token_interno corre DENTRO de esta misma
-- función SECURITY DEFINER, con los privilegios del owner (igual que ya pasa
-- hoy cuando esta función llama a recorrido_generar_token) — no depende de
-- que anon/authenticated tengan EXECUTE otorgado sobre esa función de
-- Asistencias; lo que importa es que el OWNER de ambos módulos (quien corre
-- las migraciones) sí lo tiene. Si esa función devuelve NULL (token
-- inexistente/vencido), no se autoriza nada. Si devuelve una CI que no está
-- en la allowlist de recorrido_admin_access, tampoco — "ser Superadmin" no
-- alcanza por sí solo, hay que estar explícitamente autorizado para GPS.
CREATE OR REPLACE FUNCTION recorrido_admin_iniciar_desde_superadmin(
  p_asistencia_admin_token text
) RETURNS jsonb AS $$
DECLARE
  v_ci_text text;
  v_ci bigint;
  v_admin recorrido_admin_access%ROWTYPE;
  v_token text;
  v_token_hash text;
  v_expira timestamptz;
BEGIN
  IF p_asistencia_admin_token IS NULL OR btrim(p_asistencia_admin_token) = '' THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'SESION_SUPERADMIN_INVALIDA');
  END IF;

  v_ci_text := public.asistencia_admin_validar_token_interno(p_asistencia_admin_token);
  IF v_ci_text IS NULL OR btrim(v_ci_text) = '' THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'SESION_SUPERADMIN_INVALIDA');
  END IF;

  -- Normalización defensiva: la CI debe resolver a un entero positivo. Si por
  -- cualquier motivo no castea, se trata como sesión inválida (nunca como un
  -- error técnico que delate detalles internos).
  BEGIN
    v_ci := btrim(v_ci_text)::bigint;
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'SESION_SUPERADMIN_INVALIDA');
  END;
  IF v_ci <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'SESION_SUPERADMIN_INVALIDA');
  END IF;

  SELECT * INTO v_admin FROM recorrido_admin_access WHERE ci = v_ci AND activo = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'RECORRIDO_NO_AUTORIZADO');
  END IF;

  SELECT token, token_hash INTO v_token, v_token_hash FROM recorrido_generar_token();
  v_expira := now() + interval '8 hours';

  INSERT INTO recorrido_admin_sesiones (admin_id, token_hash, token_expira_at)
  VALUES (v_admin.id, v_token_hash, v_expira);

  RETURN jsonb_build_object('ok', true, 'admin_token', v_token, 'expires_at', v_expira, 'nombre', v_admin.nombre);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ============================================================================
-- 4) RPC ADMIN — JORNADAS
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
-- 5) RPC ADMIN — CHOFERES
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
-- Cada elemento se valida con códigos de rechazo CONTROLADOS (nunca SQLERRM
-- ni ningún mensaje crudo de Postgres: podría filtrar nombres de columnas,
-- constraints o detalles del schema al frontend). Una fila mal formada se
-- cuenta como rechazada sin abortar el resto del batch — a diferencia de
-- recorrido_registrar_ubicaciones, que descarta el batch COMPLETO ante
-- cualquier error, acá se prefiere máxima tolerancia por fila, porque es una
-- carga administrativa puntual donde importa saber exactamente cuáles filas
-- fallaron, no solo "falló algo".
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

    IF jsonb_typeof(v_elem) <> 'object' THEN
      v_rechazados := v_rechazados + 1;
      v_detalles_rechazados := v_detalles_rechazados || jsonb_build_object('indice', v_indice, 'codigo', 'FORMATO_INVALIDO');
      CONTINUE;
    END IF;

    -- Validación de CI por regex ANTES de castear: así se distingue
    -- "CI_INVALIDO" de un error inesperado, sin depender de capturar la
    -- excepción de un cast fallido (ni de su mensaje).
    IF (v_elem ->> 'ci') IS NULL OR (v_elem ->> 'ci') !~ '^[0-9]+$' THEN
      v_rechazados := v_rechazados + 1;
      v_detalles_rechazados := v_detalles_rechazados || jsonb_build_object('indice', v_indice, 'ci', v_elem ->> 'ci', 'codigo', 'CI_INVALIDO');
      CONTINUE;
    END IF;
    v_ci := (v_elem ->> 'ci')::bigint;
    IF v_ci <= 0 THEN
      v_rechazados := v_rechazados + 1;
      v_detalles_rechazados := v_detalles_rechazados || jsonb_build_object('indice', v_indice, 'ci', v_ci, 'codigo', 'CI_INVALIDO');
      CONTINUE;
    END IF;

    v_nombre := btrim(v_elem ->> 'nombre');
    IF v_nombre IS NULL OR v_nombre = '' THEN
      v_rechazados := v_rechazados + 1;
      v_detalles_rechazados := v_detalles_rechazados || jsonb_build_object('indice', v_indice, 'ci', v_ci, 'codigo', 'NOMBRE_INVALIDO');
      CONTINUE;
    END IF;

    BEGIN
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
    EXCEPTION
      WHEN unique_violation THEN
        v_rechazados := v_rechazados + 1;
        v_detalles_rechazados := v_detalles_rechazados || jsonb_build_object('indice', v_indice, 'ci', v_ci, 'codigo', 'CI_DUPLICADO');
      WHEN OTHERS THEN
        -- Catch-all genérico y controlado para cualquier otra falla
        -- inesperada de esta fila puntual — nunca se expone SQLERRM.
        v_rechazados := v_rechazados + 1;
        v_detalles_rechazados := v_detalles_rechazados || jsonb_build_object('indice', v_indice, 'ci', v_ci, 'codigo', 'ERROR_FILA');
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true, 'creados', v_creados, 'actualizados', v_actualizados,
    'rechazados', v_rechazados, 'detalles_rechazados', v_detalles_rechazados
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ============================================================================
-- 6) RPC ADMIN — ASIGNACIONES Y CÓDIGOS
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

    -- Se chequea PRIMERO si ya existe una asignación para este chofer en esta
    -- jornada, antes de gastar una generación de código — si ya existe, se
    -- rechaza como YA_ASIGNADO sin tocarla y sin haber generado nada de más.
    IF EXISTS (SELECT 1 FROM recorrido_asignaciones WHERE jornada_id = p_jornada_id AND chofer_id = v_chofer.id) THEN
      v_rechazados := v_rechazados || jsonb_build_object('ci', v_chofer.ci, 'codigo', 'YA_ASIGNADO');
      CONTINUE;
    END IF;

    SELECT codigo, codigo_hash INTO v_codigo, v_codigo_hash FROM recorrido_generar_codigo_temporal();
    v_expira := now() + make_interval(hours => p_horas_expiracion);

    -- IMPORTANTE (corregido en esta misma fase, antes de producción): si el
    -- chofer YA tenía una asignación para esta jornada, NO se toca su
    -- codigo_hash ni su codigo_expira_at — se rechaza como YA_ASIGNADO (el
    -- chequeo de arriba ya cubre el caso normal; este ON CONFLICT DO NOTHING
    -- es solo la red de seguridad final contra una carrera entre el chequeo y
    -- el INSERT, nunca el mecanismo principal). Antes, esto hacía un upsert
    -- que regeneraba el código en cada llamada, lo cual es peligroso: volver
    -- a correr una asignación masiva (ej. por error, o para agregar un par de
    -- choferes nuevos a una lista ya entregada) invalidaría de golpe cientos
    -- de códigos ya impresos/enviados por WhatsApp. Regenerar un código sigue
    -- siendo posible, pero EXCLUSIVAMENTE a través de
    -- recorrido_admin_regenerar_codigo (abajo), una acción explícita sobre
    -- una asignación puntual, nunca un efecto secundario silencioso de una
    -- asignación masiva.
    INSERT INTO recorrido_asignaciones (jornada_id, chofer_id, codigo_hash, codigo_expira_at)
    VALUES (p_jornada_id, v_chofer.id, v_codigo_hash, v_expira)
    ON CONFLICT (jornada_id, chofer_id) DO NOTHING;

    IF NOT FOUND THEN
      v_rechazados := v_rechazados || jsonb_build_object('ci', v_chofer.ci, 'codigo', 'YA_ASIGNADO');
      CONTINUE;
    END IF;

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
-- 7) RPC ADMIN — DETALLE DE CHOFER/SESIÓN
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
-- 8) RPC ADMIN — HISTORIAL (resumen, nunca puntos crudos)
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
-- 9) RPC ADMIN — REPLAY (puntos de UNA sesión, paradas, alertas)
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
-- 10) RPC ADMIN — GESTIÓN DE LA ALLOWLIST DE RECORRIDOS
-- ============================================================================
-- Revisión de esta misma fase, antes de producción: recorrido_admin_access ya
-- NO es "crear un administrador con su propia contraseña" — es autorizar o
-- desautorizar una CI para ver GPS, dentro de la allowlist server-side de
-- este módulo. El acceso real sigue entrando únicamente por
-- recorrido_admin_iniciar_desde_superadmin (sección 3): estar en esta
-- allowlist no es un login, es un permiso.
--
-- Ver nota larga al principio de este archivo: la primera CI autorizada
-- sigue necesitando una inserción manual única (no hay todavía ninguna
-- sesión Recorridos con la que llamar a estas RPC) — ESO no se hace en este
-- archivo ni en ningún archivo de este repositorio, por ejemplo:
--   INSERT INTO recorrido_admin_access (ci, nombre, password_hash)
--   VALUES (<ci_real>, '<nombre_real>',
--     extensions.crypt(encode(extensions.gen_random_bytes(32), 'hex'), extensions.gen_salt('bf')));
-- (un secreto aleatorio, nunca una contraseña real — exactamente lo mismo que
-- hace recorrido_admin_autorizar_ci de abajo). A partir de esa primera CI, el
-- resto se autoriza con recorrido_admin_autorizar_ci, sin volver a tocar SQL
-- a mano.
--
-- password_hash sigue siendo NOT NULL por el esquema ya aplicado de la
-- Fase 1 (no se altera destructivamente acá) pero deja de tener cualquier
-- uso real como contraseña: recorrido_admin_autenticar (el único camino que
-- la usaba) queda sin EXECUTE para ningún rol de cliente (ver permisos). Por
-- eso recorrido_admin_autorizar_ci NO recibe ninguna contraseña como
-- parámetro — genera un secreto aleatorio de 32 bytes server-side, lo hashea
-- con bcrypt para satisfacer la columna, y lo descarta de inmediato: nunca se
-- devuelve, nunca se loguea, no es la contraseña real de nadie y no existe
-- ninguna forma de recuperarlo.
CREATE OR REPLACE FUNCTION recorrido_admin_autorizar_ci(
  p_admin_token text,
  p_ci bigint,
  p_nombre text
) RETURNS jsonb AS $$
DECLARE
  v_admin_id uuid;
  v_secreto_aleatorio text;
  v_nuevo recorrido_admin_access%ROWTYPE;
BEGIN
  v_admin_id := recorrido_admin_validar_token(p_admin_token);
  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'SESION_ADMIN_INVALIDA');
  END IF;

  IF p_ci IS NULL OR p_ci <= 0 OR p_nombre IS NULL OR btrim(p_nombre) = '' THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'ADMIN_DATOS_INVALIDOS');
  END IF;

  v_secreto_aleatorio := encode(extensions.gen_random_bytes(32), 'hex');

  BEGIN
    INSERT INTO recorrido_admin_access (ci, nombre, password_hash)
    VALUES (p_ci, btrim(p_nombre), extensions.crypt(v_secreto_aleatorio, extensions.gen_salt('bf')))
    RETURNING * INTO v_nuevo;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'CI_YA_AUTORIZADA');
  END;

  RETURN jsonb_build_object('ok', true, 'autorizado', jsonb_build_object('id', v_nuevo.id, 'ci', v_nuevo.ci, 'nombre', v_nuevo.nombre));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION recorrido_admin_listar_autorizados(p_admin_token text)
RETURNS jsonb AS $$
DECLARE
  v_admin_id uuid;
  v_autorizados jsonb;
BEGIN
  v_admin_id := recorrido_admin_validar_token(p_admin_token);
  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'SESION_ADMIN_INVALIDA');
  END IF;

  -- Nunca se incluye password_hash en la respuesta (ni tendría sentido: no es
  -- una contraseña real de nadie).
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id, 'ci', ci, 'nombre', nombre, 'activo', activo, 'created_at', created_at
  ) ORDER BY nombre), '[]'::jsonb)
  INTO v_autorizados
  FROM recorrido_admin_access;

  RETURN jsonb_build_object('ok', true, 'autorizados', v_autorizados);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION recorrido_admin_desautorizar_ci(
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

  -- Protección contra quedarse sin ninguna CI autorizada activa por error:
  -- nadie puede desautorizarse a sí mismo con su propia sesión.
  IF p_admin_objetivo_id = v_admin_id THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'NO_PUEDE_DESAUTORIZARSE_A_SI_MISMO');
  END IF;

  UPDATE recorrido_admin_access SET activo = false, updated_at = now() WHERE id = p_admin_objetivo_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'ADMIN_NO_ENCONTRADO');
  END IF;

  -- Invalida de inmediato cualquier sesión ya abierta de esa CI — desautorizar
  -- no debe dejar tokens vigentes que sigan funcionando.
  DELETE FROM recorrido_admin_sesiones WHERE admin_id = p_admin_objetivo_id;

  RETURN jsonb_build_object('ok', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ============================================================================
-- 11) PERMISOS
-- ============================================================================
-- ACL determinística (revisión de esta misma fase, antes de producción): ya
-- se comprobó en el proyecto real de Supabase que un REVOKE FROM PUBLIC no
-- alcanza por sí solo — en algún momento quedaron grants explícitos a
-- anon/authenticated/service_role sobre funciones internas que nunca
-- debieron tenerlos (ver el hotfix de la Fase 1). Por eso TODA RPC nueva de
-- esta migración, pública o interna, revoca explícitamente los 4 roles
-- (anon, authenticated, service_role, PUBLIC) antes de otorgar — nunca se
-- confía en que "no se otorgó" sea lo mismo que "está revocado".
--
-- recorrido_admin_autenticar (Fase 1) queda revocada de los 4 roles de
-- cliente SIN ningún GRANT posterior: existe en la base (no se borra, no es
-- destructivo) pero ya no es alcanzable desde ningún frontend. El único
-- camino de entrada al módulo administrativo pasa a ser
-- recorrido_admin_iniciar_desde_superadmin.
REVOKE ALL ON FUNCTION recorrido_admin_autenticar(bigint, text) FROM anon, authenticated, service_role, PUBLIC;

REVOKE ALL ON FUNCTION recorrido_admin_iniciar_desde_superadmin(text) FROM anon, authenticated, service_role, PUBLIC;
GRANT EXECUTE ON FUNCTION recorrido_admin_iniciar_desde_superadmin(text) TO anon, authenticated;

REVOKE ALL ON FUNCTION recorrido_admin_listar_jornadas(text) FROM anon, authenticated, service_role, PUBLIC;
GRANT EXECUTE ON FUNCTION recorrido_admin_listar_jornadas(text) TO anon, authenticated;

REVOKE ALL ON FUNCTION recorrido_admin_crear_jornada(text, text, date) FROM anon, authenticated, service_role, PUBLIC;
GRANT EXECUTE ON FUNCTION recorrido_admin_crear_jornada(text, text, date) TO anon, authenticated;

REVOKE ALL ON FUNCTION recorrido_admin_actualizar_jornada(text, uuid, text, date) FROM anon, authenticated, service_role, PUBLIC;
GRANT EXECUTE ON FUNCTION recorrido_admin_actualizar_jornada(text, uuid, text, date) TO anon, authenticated;

REVOKE ALL ON FUNCTION recorrido_admin_activar_jornada(text, uuid) FROM anon, authenticated, service_role, PUBLIC;
GRANT EXECUTE ON FUNCTION recorrido_admin_activar_jornada(text, uuid) TO anon, authenticated;

REVOKE ALL ON FUNCTION recorrido_admin_desactivar_jornada(text, uuid) FROM anon, authenticated, service_role, PUBLIC;
GRANT EXECUTE ON FUNCTION recorrido_admin_desactivar_jornada(text, uuid) TO anon, authenticated;

REVOKE ALL ON FUNCTION recorrido_admin_listar_choferes(text, text, boolean, int, int) FROM anon, authenticated, service_role, PUBLIC;
GRANT EXECUTE ON FUNCTION recorrido_admin_listar_choferes(text, text, boolean, int, int) TO anon, authenticated;

REVOKE ALL ON FUNCTION recorrido_admin_crear_chofer(text, bigint, text, text, text, text, text) FROM anon, authenticated, service_role, PUBLIC;
GRANT EXECUTE ON FUNCTION recorrido_admin_crear_chofer(text, bigint, text, text, text, text, text) TO anon, authenticated;

REVOKE ALL ON FUNCTION recorrido_admin_actualizar_chofer(text, uuid, text, text, text, text, text, boolean) FROM anon, authenticated, service_role, PUBLIC;
GRANT EXECUTE ON FUNCTION recorrido_admin_actualizar_chofer(text, uuid, text, text, text, text, text, boolean) TO anon, authenticated;

REVOKE ALL ON FUNCTION recorrido_admin_importar_choferes(text, jsonb) FROM anon, authenticated, service_role, PUBLIC;
GRANT EXECUTE ON FUNCTION recorrido_admin_importar_choferes(text, jsonb) TO anon, authenticated;

REVOKE ALL ON FUNCTION recorrido_admin_asignar_choferes(text, uuid, jsonb, int) FROM anon, authenticated, service_role, PUBLIC;
GRANT EXECUTE ON FUNCTION recorrido_admin_asignar_choferes(text, uuid, jsonb, int) TO anon, authenticated;

REVOKE ALL ON FUNCTION recorrido_admin_regenerar_codigo(text, uuid, int) FROM anon, authenticated, service_role, PUBLIC;
GRANT EXECUTE ON FUNCTION recorrido_admin_regenerar_codigo(text, uuid, int) TO anon, authenticated;

REVOKE ALL ON FUNCTION recorrido_admin_detalle_chofer(text, uuid) FROM anon, authenticated, service_role, PUBLIC;
GRANT EXECUTE ON FUNCTION recorrido_admin_detalle_chofer(text, uuid) TO anon, authenticated;

REVOKE ALL ON FUNCTION recorrido_admin_listar_historico(text, uuid, bigint, date, date, int, int) FROM anon, authenticated, service_role, PUBLIC;
GRANT EXECUTE ON FUNCTION recorrido_admin_listar_historico(text, uuid, bigint, date, date, int, int) TO anon, authenticated;

REVOKE ALL ON FUNCTION recorrido_admin_replay_puntos(text, uuid, int, int) FROM anon, authenticated, service_role, PUBLIC;
GRANT EXECUTE ON FUNCTION recorrido_admin_replay_puntos(text, uuid, int, int) TO anon, authenticated;

REVOKE ALL ON FUNCTION recorrido_admin_listar_paradas(text, uuid) FROM anon, authenticated, service_role, PUBLIC;
GRANT EXECUTE ON FUNCTION recorrido_admin_listar_paradas(text, uuid) TO anon, authenticated;

REVOKE ALL ON FUNCTION recorrido_admin_listar_alertas(text, uuid) FROM anon, authenticated, service_role, PUBLIC;
GRANT EXECUTE ON FUNCTION recorrido_admin_listar_alertas(text, uuid) TO anon, authenticated;

REVOKE ALL ON FUNCTION recorrido_admin_autorizar_ci(text, bigint, text) FROM anon, authenticated, service_role, PUBLIC;
GRANT EXECUTE ON FUNCTION recorrido_admin_autorizar_ci(text, bigint, text) TO anon, authenticated;

REVOKE ALL ON FUNCTION recorrido_admin_listar_autorizados(text) FROM anon, authenticated, service_role, PUBLIC;
GRANT EXECUTE ON FUNCTION recorrido_admin_listar_autorizados(text) TO anon, authenticated;

REVOKE ALL ON FUNCTION recorrido_admin_desautorizar_ci(text, uuid) FROM anon, authenticated, service_role, PUBLIC;
GRANT EXECUTE ON FUNCTION recorrido_admin_desautorizar_ci(text, uuid) TO anon, authenticated;
