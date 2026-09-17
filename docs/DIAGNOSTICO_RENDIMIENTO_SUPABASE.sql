-- DIAGNOSTICO READ-ONLY — no modifica absolutamente nada.
-- Ejecutar en Supabase > SQL Editor y compartir los resultados antes de tocar producción.

-- 1) Cantidad real de filas por tabla base.
SELECT 'padron' AS tabla, count(*) AS filas FROM public.padron
UNION ALL SELECT 'dirigentes', count(*) FROM public.dirigentes
UNION ALL SELECT 'coordinadores', count(*) FROM public.coordinadores
UNION ALL SELECT 'subcoordinadores', count(*) FROM public.subcoordinadores
UNION ALL SELECT 'votantes', count(*) FROM public.votantes
ORDER BY tabla;

-- 2) Columnas relevantes y tipos reales en producción.
SELECT table_name, ordinal_position, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('padron','dirigentes','coordinadores','subcoordinadores','votantes')
  AND column_name IN (
    'ci','activo','login_code','dirigente_ci','coordinador_ci',
    'asignado_por','asignado_por_ci','asignado_por_rol'
  )
ORDER BY table_name, ordinal_position;

-- 3) Índices existentes. NO crear índices todavía: primero ver cuáles ya existen.
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('padron','dirigentes','coordinadores','subcoordinadores','votantes')
ORDER BY tablename, indexname;

-- 4) Uso histórico de índices (orientativo; las estadísticas pueden reiniciarse).
SELECT
  relname AS tabla,
  indexrelname AS indice,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND relname IN ('padron','dirigentes','coordinadores','subcoordinadores','votantes')
ORDER BY relname, idx_scan DESC, indexrelname;

-- 5) Tamaño de las tablas e índices.
SELECT
  relname AS tabla,
  pg_size_pretty(pg_relation_size(relid)) AS tabla_size,
  pg_size_pretty(pg_indexes_size(relid)) AS indices_size,
  pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
  n_live_tup AS filas_estimadas
FROM pg_stat_user_tables
WHERE schemaname = 'public'
  AND relname IN ('padron','dirigentes','coordinadores','subcoordinadores','votantes')
ORDER BY pg_total_relation_size(relid) DESC;

-- 6) Confirmar si están instaladas las RPC que actualmente intervienen en el borrado.
SELECT
  p.proname AS funcion,
  pg_get_function_identity_arguments(p.oid) AS argumentos
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'mapeo_listar_hogares',
    'mapeo_desasociar_votante'
  )
ORDER BY p.proname;

-- 7) Foreign keys/constraints de las tablas de estructura para entender el borrado en cascada.
SELECT
  conrelid::regclass::text AS tabla,
  conname AS constraint_name,
  contype AS tipo,
  pg_get_constraintdef(oid) AS definicion
FROM pg_constraint
WHERE connamespace = 'public'::regnamespace
  AND conrelid IN (
    'public.dirigentes'::regclass,
    'public.coordinadores'::regclass,
    'public.subcoordinadores'::regclass,
    'public.votantes'::regclass
  )
ORDER BY tabla, constraint_name;
