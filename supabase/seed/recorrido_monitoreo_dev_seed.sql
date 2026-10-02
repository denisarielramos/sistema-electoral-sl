-- ============================================================================
-- Datos de prueba — módulo de Monitoreo de Recorridos GPS
-- ============================================================================
-- *** SOLO PARA DESARROLLO/PRUEBAS. NO ES PARTE DE LA MIGRACIÓN PRODUCTIVA. ***
--
-- Este archivo vive deliberadamente FUERA de supabase/migrations/ y no se llama
-- "supabase/seed.sql" (el nombre especial que `supabase db reset` ejecuta solo)
-- para que ninguna herramienta lo corra automáticamente. Hay que ejecutarlo a
-- mano (Supabase SQL editor) DESPUÉS de aplicar
-- supabase/migrations/20261002120000_recorrido_monitoreo.sql, y solo en un
-- proyecto/entorno de prueba — NUNCA en la base de producción real.
--
-- Credenciales de prueba (texto plano SOLO en este comentario, para quien ejecute
-- las pruebas manuales — en la base siempre quedan hasheadas):
--   Chofer 1 — CI 10000001, código: PRUEBA-D1-2026
--   Chofer 2 — CI 10000002, código: PRUEBA-D2-2026
--   Chofer 3 — CI 10000003, código: PRUEBA-D3-2026
--   Admin del módulo — CI 90000001, contraseña: recorridos-dev-2026
--
-- Idempotente: usa UUIDs fijos y ON CONFLICT DO NOTHING — se puede re-ejecutar
-- sin duplicar filas.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.recorrido_jornadas') IS NULL THEN
    RAISE EXCEPTION 'Falta aplicar primero supabase/migrations/20261002120000_recorrido_monitoreo.sql';
  END IF;
END $$;

-- ======================= JORNADA =======================
-- activa = true A PROPÓSITO (solo en este seed de prueba): en producción toda
-- jornada nueva debe nacer desactivada, igual que eventos_asistencia — ver nota de
-- seguridad en la migración.
INSERT INTO recorrido_jornadas (id, nombre, fecha, activa)
VALUES ('00000000-0000-0000-0000-00000000a001', 'Jornada de prueba (dev)', CURRENT_DATE, true)
ON CONFLICT (id) DO NOTHING;

-- ======================= CHOFERES =======================
INSERT INTO recorrido_choferes (id, ci, nombre, apellido, telefono, seccional, local_votacion, activo) VALUES
  ('00000000-0000-0000-0000-00000000c001', 10000001, 'Juan', 'Pruebadriver', '0981000001', '2', 'Local de prueba 2', true),
  ('00000000-0000-0000-0000-00000000c002', 10000002, 'María', 'Pruebadriver', '0981000002', '3', 'Local de prueba 3', true),
  ('00000000-0000-0000-0000-00000000c003', 10000003, 'Pedro', 'Pruebadriver', '0981000003', '4', 'Local de prueba 4', true)
ON CONFLICT (id) DO NOTHING;

-- ======================= ASIGNACIONES (código de prueba hasheado con bcrypt) =======================
INSERT INTO recorrido_asignaciones (id, jornada_id, chofer_id, codigo_hash, codigo_expira_at) VALUES
  ('00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-00000000c001',
    extensions.crypt('PRUEBA-D1-2026', extensions.gen_salt('bf')), now() + interval '30 days'),
  ('00000000-0000-0000-0000-00000000b002', '00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-00000000c002',
    extensions.crypt('PRUEBA-D2-2026', extensions.gen_salt('bf')), now() + interval '30 days'),
  ('00000000-0000-0000-0000-00000000b003', '00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-00000000c003',
    extensions.crypt('PRUEBA-D3-2026', extensions.gen_salt('bf')), now() + interval '30 days')
ON CONFLICT (id) DO NOTHING;

-- ======================= ADMIN DE PRUEBA DEL MÓDULO =======================
INSERT INTO recorrido_admin_access (id, ci, nombre, password_hash) VALUES
  ('00000000-0000-0000-0000-00000000d001', 90000001, 'Admin Recorridos (dev)',
    extensions.crypt('recorridos-dev-2026', extensions.gen_salt('bf')))
ON CONFLICT (id) DO NOTHING;
