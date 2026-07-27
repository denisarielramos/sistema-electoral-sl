-- ============================================================================
-- Corrige la validación de asignado_por en votantes
-- ============================================================================
-- IMPORTANTE: esta corrección YA FUE APLICADA MANUALMENTE en producción.
-- Este archivo NO es un esquema base ni funciona "desde cero": es un parche
-- posterior para una base Supabase que ya tiene provisionadas las tablas
-- `votantes`, `dirigentes`, `coordinadores` y `subcoordinadores` (creadas por
-- fuera de este repositorio, que no contiene las migraciones que las
-- originaron). Se agrega al repositorio únicamente para dejar registro
-- versionado de qué se cambió y por qué, y para poder reproducir el mismo
-- parche en otra base que ya tenga ese esquema (p. ej. un fork o un entorno
-- de staging clonado desde producción) — nunca para crear el esquema.
-- Ver supabase/migrations/README.md para más contexto.
--
-- Problema corregido:
-- La tabla `votantes` tenía una foreign key `fk_vot_asignador` que hacía
-- referencia a `padron(ci)`. Eso es incorrecto: `asignado_por` es la CI de
-- quien asignó al votante (un dirigente, coordinador o subcoordinador, según
-- `asignado_por_rol`) — no necesariamente una persona que figure en el
-- padrón electoral. Se reemplaza esa FK por un trigger que valida
-- `asignado_por` contra la tabla que corresponda según `asignado_por_rol`.

-- 0) Comprobación de esquema base: este parche no crea tablas. Si alguna de
--    las cuatro no existe todavía, abortar con un mensaje claro en vez de
--    fallar más abajo con un error críptico de Postgres.
DO $$
BEGIN
  IF to_regclass('public.votantes') IS NULL THEN
    RAISE EXCEPTION 'Falta la tabla "votantes". Este archivo es un parche posterior, no un esquema base: primero debe provisionarse el esquema base (fuera de este repositorio) antes de aplicar esta migración.';
  END IF;
  IF to_regclass('public.dirigentes') IS NULL THEN
    RAISE EXCEPTION 'Falta la tabla "dirigentes". Este archivo es un parche posterior, no un esquema base: primero debe provisionarse el esquema base (fuera de este repositorio) antes de aplicar esta migración.';
  END IF;
  IF to_regclass('public.coordinadores') IS NULL THEN
    RAISE EXCEPTION 'Falta la tabla "coordinadores". Este archivo es un parche posterior, no un esquema base: primero debe provisionarse el esquema base (fuera de este repositorio) antes de aplicar esta migración.';
  END IF;
  IF to_regclass('public.subcoordinadores') IS NULL THEN
    RAISE EXCEPTION 'Falta la tabla "subcoordinadores". Este archivo es un parche posterior, no un esquema base: primero debe provisionarse el esquema base (fuera de este repositorio) antes de aplicar esta migración.';
  END IF;
END $$;

-- 1) Eliminar la FK incorrecta (idempotente: no falla si ya no existe).
ALTER TABLE votantes DROP CONSTRAINT IF EXISTS fk_vot_asignador;

-- 2) Función de validación (idempotente: CREATE OR REPLACE).
-- Sin asignado_por o sin asignado_por_rol no valida nada: cubre datos legacy
-- previos a este control y votantes sin asignador registrado.
CREATE OR REPLACE FUNCTION validar_votante_asignador()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.asignado_por IS NULL OR NEW.asignado_por_rol IS NULL OR NEW.asignado_por_rol = '' THEN
    RETURN NEW;
  END IF;

  IF NEW.asignado_por_rol = 'dirigente' THEN
    IF NOT EXISTS (SELECT 1 FROM dirigentes WHERE ci = NEW.asignado_por) THEN
      RAISE EXCEPTION 'asignado_por (%) no existe en dirigentes', NEW.asignado_por;
    END IF;
  ELSIF NEW.asignado_por_rol = 'coordinador' THEN
    IF NOT EXISTS (SELECT 1 FROM coordinadores WHERE ci = NEW.asignado_por) THEN
      RAISE EXCEPTION 'asignado_por (%) no existe en coordinadores', NEW.asignado_por;
    END IF;
  ELSIF NEW.asignado_por_rol = 'subcoordinador' THEN
    IF NOT EXISTS (SELECT 1 FROM subcoordinadores WHERE ci = NEW.asignado_por) THEN
      RAISE EXCEPTION 'asignado_por (%) no existe en subcoordinadores', NEW.asignado_por;
    END IF;
  ELSE
    RAISE EXCEPTION 'asignado_por_rol desconocido: %', NEW.asignado_por_rol;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3) Trigger (idempotente: se elimina si ya existía y se vuelve a crear).
DROP TRIGGER IF EXISTS trg_validar_votante_asignador ON votantes;
CREATE TRIGGER trg_validar_votante_asignador
  BEFORE INSERT OR UPDATE ON votantes
  FOR EACH ROW
  EXECUTE FUNCTION validar_votante_asignador();
