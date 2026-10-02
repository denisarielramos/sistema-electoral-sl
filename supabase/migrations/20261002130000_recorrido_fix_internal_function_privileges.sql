-- ============================================================================
-- Hotfix de permisos — funciones internas del módulo de Monitoreo de Recorridos
-- ============================================================================
-- Migración separada, NO modifica la migración ya aplicada
-- (20261002120000_recorrido_monitoreo.sql). No toca tablas ni lógica: solo
-- permisos EXECUTE sobre funciones ya existentes.
--
-- Motivo: se detectó en el proyecto real de Supabase que las 6 funciones
-- internas del módulo (helpers no pensados para el frontend) tenían grants
-- EXPLÍCITOS de EXECUTE a anon, authenticated y service_role, a pesar de que la
-- migración original solo hacía REVOKE ALL ... FROM PUBLIC sobre ellas. Un
-- REVOKE FROM PUBLIC no retira un grant que fue otorgado explícitamente a un
-- rol puntual — PUBLIC y "un rol con nombre" son entradas independientes en la
-- ACL de la función, así que si en algún momento (manual o por alguna plantilla
-- del proyecto) se otorgó EXECUTE directo a anon/authenticated/service_role,
-- esa entrada sigue vigente hasta que se revoque explícitamente de cada rol.
--
-- Esta migración revoca EXECUTE de anon, authenticated, service_role y PUBLIC
-- (los 4, explícitamente, sin asumir cuál de ellos tenía el grant de más) sobre
-- las 6 funciones internas. Las 5 RPC públicas (SECURITY DEFINER) NO se tocan:
-- siguen con EXECUTE para anon/authenticated exactamente como antes.
--
-- Por qué esto no rompe nada: una función SECURITY DEFINER se ejecuta con los
-- privilegios de su OWNER (quien la creó, normalmente postgres/el rol de
-- servicio de migraciones), no con los del rol que la invocó. Revocar EXECUTE a
-- anon/authenticated/service_role/PUBLIC sobre un helper interno no afecta en
-- absoluto a una RPC pública que lo llama internamente (PERFORM/SELECT dentro
-- del cuerpo de la función) — ese llamado interno corre con los privilegios del
-- owner de la RPC, que sigue siendo plenamente dueño de sus propias funciones y
-- nunca pierde su propio EXECUTE (el owner siempre puede ejecutar sus propias
-- funciones, independientemente de cualquier REVOKE a otros roles). Lo mismo
-- aplica a recorrido_bloquear_edicion_ubicaciones y recorrido_set_updated_at:
-- son funciones de trigger, invocadas por el motor de triggers con los
-- privilegios del owner de la tabla/función, nunca por anon/authenticated
-- directamente — revocarles EXECUTE a esos roles no afecta a los triggers.
--
-- Funciones internas corregidas (firma exacta, igual a la de la migración
-- original):
--   - recorrido_distancia_metros(double precision, double precision, double precision, double precision)
--   - recorrido_generar_token()
--   - recorrido_admin_validar_token(text)
--   - recorrido_procesar_punto(uuid, uuid, double precision, double precision, double precision, double precision, double precision, timestamptz)
--   - recorrido_bloquear_edicion_ubicaciones()
--   - recorrido_set_updated_at()
--
-- Las 5 RPC públicas (sin cambios, se listan solo para que quede explícito que
-- esta migración no las toca):
--   recorrido_iniciar_sesion_chofer, recorrido_registrar_ubicaciones,
--   recorrido_finalizar_sesion, recorrido_admin_autenticar,
--   recorrido_admin_listar_estado
-- ============================================================================

REVOKE EXECUTE ON FUNCTION recorrido_distancia_metros(double precision, double precision, double precision, double precision)
  FROM anon, authenticated, service_role, PUBLIC;

REVOKE EXECUTE ON FUNCTION recorrido_generar_token()
  FROM anon, authenticated, service_role, PUBLIC;

REVOKE EXECUTE ON FUNCTION recorrido_admin_validar_token(text)
  FROM anon, authenticated, service_role, PUBLIC;

REVOKE EXECUTE ON FUNCTION recorrido_procesar_punto(uuid, uuid, double precision, double precision, double precision, double precision, double precision, timestamptz)
  FROM anon, authenticated, service_role, PUBLIC;

REVOKE EXECUTE ON FUNCTION recorrido_bloquear_edicion_ubicaciones()
  FROM anon, authenticated, service_role, PUBLIC;

REVOKE EXECUTE ON FUNCTION recorrido_set_updated_at()
  FROM anon, authenticated, service_role, PUBLIC;
