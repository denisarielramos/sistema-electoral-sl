-- ============================================================================
-- Monitoreo de recorridos GPS (choferes de jornada)
-- ============================================================================
-- Módulo NUEVO, 100% aislado del resto del sistema. NO depende de ninguna tabla
-- existente (padron/dirigentes/coordinadores/subcoordinadores/votantes) y puede
-- eliminarse por completo (DROP de todo lo que crea este archivo) sin afectar nada
-- fuera de él. Este archivo NO ha sido aplicado en producción todavía — se debe
-- revisar y ejecutar manualmente (Supabase SQL editor o `supabase db push`).
-- Es idempotente: puede volver a ejecutarse sin duplicar objetos.
--
-- FASE 1 de la implementación (ver plan aprobado): SOLO backend. No hay frontend
-- todavía — src/main.jsx, App.jsx, Dashboard.jsx y vercel.json no se tocan en esta
-- fase. Tampoco hay datos de prueba en este archivo: van en
-- supabase/seed/recorrido_monitoreo_dev_seed.sql, que debe ejecutarse a mano.
--
-- Resumen de lo que crea:
--   1) Tablas: recorrido_jornadas, recorrido_choferes, recorrido_asignaciones,
--      recorrido_sesiones, recorrido_estado_actual, recorrido_ubicaciones,
--      recorrido_paradas, recorrido_alertas, recorrido_admin_access,
--      recorrido_admin_sesiones.
--   2) Funciones auxiliares internas: distancia (Haversine), generación de token
--      de sesión, validación de token admin, procesamiento de un punto GPS
--      (detección de parada/alerta + acumulación incremental de km).
--   3) Funciones RPC (SECURITY DEFINER) — ÚNICA vía de acceso soportada desde el
--      frontend: autenticación temporal de chofer, registro de ubicaciones por
--      batch, finalizar sesión, autenticación de admin del módulo, consulta del
--      estado actual para el dashboard.
--   4) RLS en las 10 tablas nuevas SIN policies para anon/authenticated
--      (deny-by-default): PostgREST no puede leer/escribir estas tablas directo;
--      todo pasa por las funciones RPC.
--
-- ── NOTA DE SEGURIDAD (mismo modelo ya usado en mapeo_territorial/asistencia) ──
-- Este sistema NO usa Supabase Auth: no hay auth.uid() utilizable. En vez de
-- login_code (dirigente/coordinador/subcoordinador) o superadmin hardcodeado, este
-- módulo tiene SU PROPIA identidad, completamente independiente del resto:
--   - Chofer: CI + código temporal de jornada (hasheado con pgcrypto/crypt, nunca
--     texto plano) → canjeado por un token de sesión de corta vida (hash SHA-256
--     guardado, nunca el token crudo) que se re-valida en cada llamada posterior.
--   - Admin del módulo ("superadmin de recorridos"): tabla propia
--     recorrido_admin_access, independiente de los 2 superadmin de src/App.jsx —
--     mismo patrón de token temporal que el chofer.
-- Ninguna de las dos identidades es verificable criptográficamente más allá de lo
-- que permite un hash de contraseña/código — es el mismo nivel de confianza que ya
-- tiene el resto del sistema, no una regresión.
-- ============================================================================

-- Necesaria para gen_random_bytes()/digest()/crypt()/gen_salt() usadas abajo para
-- hashear códigos, contraseñas y tokens de sesión. No se puede confirmar desde el
-- repo si ya está habilitada en el proyecto real de Supabase — ver riesgos en el
-- resumen entregado junto con esta migración.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- 1) TABLAS
-- ============================================================================

-- ======================= JORNADAS =======================
CREATE TABLE IF NOT EXISTS recorrido_jornadas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      text NOT NULL,
  fecha       date NOT NULL,
  activa      boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE recorrido_jornadas IS 'Jornada/evento de monitoreo (ej. "Elecciones 2026"). Desactivada por defecto a propósito: no debe auto-activarse.';

CREATE INDEX IF NOT EXISTS ix_recorrido_jornadas_activa ON recorrido_jornadas(activa);
CREATE INDEX IF NOT EXISTS ix_recorrido_jornadas_fecha ON recorrido_jornadas(fecha);

-- ======================= CHOFERES (padrón logístico PROPIO del módulo) =======================
-- NO tiene FK ni relación con padron/votantes/dirigentes/coordinadores/
-- subcoordinadores a propósito: un chofer puede o no estar en el padrón electoral,
-- es irrelevante para este módulo, y cruzarlo violaría la regla de no usar
-- historial electoral para identificar/evaluar al chofer. seccional/local_votacion
-- son texto libre, poblado al importar el Excel (fase futura) — no se normalizan
-- contra ningún mapa existente (ver src/utils/seccionalHelpers.js, que es de otro
-- módulo y no se usa acá).
CREATE TABLE IF NOT EXISTS recorrido_choferes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ci              bigint NOT NULL,
  nombre          text NOT NULL,
  apellido        text,
  telefono        text,
  seccional       text,
  local_votacion  text,
  activo          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE recorrido_choferes IS 'Roster logístico de choferes, independiente del padrón electoral. CI/seccional/local son solo para identificación y organización logística.';

CREATE UNIQUE INDEX IF NOT EXISTS ux_recorrido_choferes_ci ON recorrido_choferes(ci);
CREATE INDEX IF NOT EXISTS ix_recorrido_choferes_seccional ON recorrido_choferes(seccional);
CREATE INDEX IF NOT EXISTS ix_recorrido_choferes_activo ON recorrido_choferes(activo);

-- ======================= ASIGNACIONES (chofer + jornada + código temporal) =======================
CREATE TABLE IF NOT EXISTS recorrido_asignaciones (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jornada_id        uuid NOT NULL REFERENCES recorrido_jornadas(id),
  chofer_id         uuid NOT NULL REFERENCES recorrido_choferes(id),
  codigo_hash       text NOT NULL,
  codigo_expira_at  timestamptz NOT NULL,
  activo            boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE recorrido_asignaciones IS 'Qué chofer puede trabajar en qué jornada. codigo_hash es SIEMPRE un hash (pgcrypto crypt/bcrypt) — nunca se guarda el código en texto plano.';

CREATE UNIQUE INDEX IF NOT EXISTS ux_recorrido_asignaciones_jornada_chofer ON recorrido_asignaciones(jornada_id, chofer_id);
CREATE INDEX IF NOT EXISTS ix_recorrido_asignaciones_chofer ON recorrido_asignaciones(chofer_id);
CREATE INDEX IF NOT EXISTS ix_recorrido_asignaciones_jornada ON recorrido_asignaciones(jornada_id);

-- ======================= SESIONES (el recorrido real de un chofer en una jornada) =======================
CREATE TABLE IF NOT EXISTS recorrido_sesiones (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asignacion_id     uuid NOT NULL REFERENCES recorrido_asignaciones(id),
  device_hash       text NOT NULL,
  token_hash        text NOT NULL,
  token_expira_at   timestamptz NOT NULL,
  iniciado_at       timestamptz,
  finalizado_at     timestamptz,
  km_acumulados     double precision NOT NULL DEFAULT 0 CHECK (km_acumulados >= 0),
  paradas_count     int NOT NULL DEFAULT 0 CHECK (paradas_count >= 0),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE recorrido_sesiones IS 'Una sesión de tracking GPS de un chofer. token_hash es el hash SHA-256 del token de sesión — el token crudo nunca se guarda, solo se entrega una vez al iniciar.';

CREATE INDEX IF NOT EXISTS ix_recorrido_sesiones_asignacion ON recorrido_sesiones(asignacion_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_recorrido_sesiones_token_hash ON recorrido_sesiones(token_hash);
-- Una asignación no puede tener más de una sesión ABIERTA (no finalizada) a la vez.
CREATE UNIQUE INDEX IF NOT EXISTS ux_recorrido_sesiones_asignacion_abierta
  ON recorrido_sesiones(asignacion_id) WHERE finalizado_at IS NULL;

-- ======================= ESTADO ACTUAL (tabla CALIENTE, 1:1 con sesión) =======================
-- Única tabla que lee el dashboard en vivo. Nunca crece más allá de ~600 filas
-- (una por sesión activa) — nunca se consulta recorrido_ubicaciones para esto.
-- "sin_señal" NO se guarda como estado acá: se calcula al leer, comparando
-- recibido_at contra el momento de la consulta (ver recorrido_admin_listar_estado).
-- ancla_lat/ancla_lng: posición de referencia para detectar parada — SOLO se mueve
-- cuando se confirma desplazamiento real por encima del umbral de ruido GPS; es
-- distinta de lat/lng (que siempre reflejan la ÚLTIMA posición recibida, se haya
-- movido o no).
CREATE TABLE IF NOT EXISTS recorrido_estado_actual (
  sesion_id           uuid PRIMARY KEY REFERENCES recorrido_sesiones(id),
  lat                 double precision NOT NULL,
  lng                 double precision NOT NULL,
  accuracy            double precision,
  speed               double precision,
  heading             double precision,
  capturado_at        timestamptz NOT NULL,
  recibido_at         timestamptz NOT NULL DEFAULT now(),
  estado_movimiento   text NOT NULL DEFAULT 'en_movimiento'
                        CHECK (estado_movimiento IN ('en_movimiento', 'detenido', 'alerta_detencion', 'finalizado')),
  ancla_lat           double precision,
  ancla_lng           double precision,
  parada_desde        timestamptz,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recorrido_estado_actual_lat_valida CHECK (lat BETWEEN -90 AND 90),
  CONSTRAINT recorrido_estado_actual_lng_valida CHECK (lng BETWEEN -180 AND 180)
);
COMMENT ON TABLE recorrido_estado_actual IS 'Estado/posición CALIENTE: 1 fila por sesión activa. El dashboard en vivo SOLO lee esta tabla, nunca recorrido_ubicaciones.';

CREATE INDEX IF NOT EXISTS ix_recorrido_estado_actual_estado ON recorrido_estado_actual(estado_movimiento);

-- ======================= UBICACIONES (histórico crudo, append-only) =======================
-- Puede crecer a millones de filas por jornada — NUNCA se consulta para el estado
-- en vivo, solo para historial/replay de UNA sesión a la vez (índice compuesto
-- abajo). capturado_at = timestamp real del dispositivo al tomar el fix GPS;
-- recibido_at SIEMPRE lo pone el servidor (now() dentro de la RPC), nunca el
-- cliente — por eso no tiene DEFAULT basado en un valor que el cliente controle.
CREATE TABLE IF NOT EXISTS recorrido_ubicaciones (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sesion_id     uuid NOT NULL REFERENCES recorrido_sesiones(id),
  lat           double precision NOT NULL,
  lng           double precision NOT NULL,
  accuracy      double precision,
  speed         double precision,
  heading       double precision,
  capturado_at  timestamptz NOT NULL,
  recibido_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recorrido_ubicaciones_lat_valida CHECK (lat BETWEEN -90 AND 90),
  CONSTRAINT recorrido_ubicaciones_lng_valida CHECK (lng BETWEEN -180 AND 180)
);
COMMENT ON TABLE recorrido_ubicaciones IS 'Historial crudo de puntos GPS, append-only. Puede crecer a millones de filas por jornada — solo se consulta acotado por sesion_id para replay, nunca para el dashboard en vivo.';

CREATE INDEX IF NOT EXISTS ix_recorrido_ubicaciones_sesion_capturado ON recorrido_ubicaciones(sesion_id, capturado_at);

-- Append-only de verdad: ni siquiera una RPC con un bug puede editar/borrar el
-- histórico después de insertado (mismo patrón que visitas_hogar en
-- mapeo_territorial_bitacora.sql).
CREATE OR REPLACE FUNCTION recorrido_bloquear_edicion_ubicaciones()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'recorrido_ubicaciones es un historial de solo lectura: no se permite UPDATE ni DELETE.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_recorrido_ubicaciones_no_editable ON recorrido_ubicaciones;
CREATE TRIGGER trg_recorrido_ubicaciones_no_editable
  BEFORE UPDATE OR DELETE ON recorrido_ubicaciones
  FOR EACH ROW
  EXECUTE FUNCTION recorrido_bloquear_edicion_ubicaciones();

-- ======================= PARADAS =======================
CREATE TABLE IF NOT EXISTS recorrido_paradas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sesion_id     uuid NOT NULL REFERENCES recorrido_sesiones(id),
  lat           double precision NOT NULL,
  lng           double precision NOT NULL,
  inicio_at     timestamptz NOT NULL,
  fin_at        timestamptz,
  duracion_seg  int,
  es_alerta     boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE recorrido_paradas IS 'Paradas detectadas server-side por ausencia de desplazamiento real (no solo speed=0). es_alerta=true cuando supera 1 hora de duración.';

CREATE INDEX IF NOT EXISTS ix_recorrido_paradas_sesion ON recorrido_paradas(sesion_id);
-- Una sesión no puede tener más de una parada ABIERTA (sin fin_at) a la vez.
CREATE UNIQUE INDEX IF NOT EXISTS ux_recorrido_paradas_sesion_abierta
  ON recorrido_paradas(sesion_id) WHERE fin_at IS NULL;

-- ======================= ALERTAS =======================
-- 'sin_senal' se deja habilitado en el CHECK para no tener que migrar el
-- constraint si se persiste en una fase futura, pero esta Fase 1 SOLO genera
-- 'sin_movimiento_1h' — "sin señal" se calcula al leer (ver recorrido_admin_listar_estado),
-- nunca se mantiene como fila que haya que actualizar por separado.
CREATE TABLE IF NOT EXISTS recorrido_alertas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sesion_id     uuid NOT NULL REFERENCES recorrido_sesiones(id),
  parada_id     uuid REFERENCES recorrido_paradas(id),
  tipo          text NOT NULL CHECK (tipo IN ('sin_movimiento_1h', 'sin_senal')),
  generado_at   timestamptz NOT NULL DEFAULT now(),
  resuelto_at   timestamptz,
  detalle       text
);
COMMENT ON TABLE recorrido_alertas IS 'Alertas operacionales. Fase 1 solo genera sin_movimiento_1h (parada > 1h); sin_senal queda reservado para cuando se decida persistirlo en vez de calcularlo al leer.';

CREATE INDEX IF NOT EXISTS ix_recorrido_alertas_sesion ON recorrido_alertas(sesion_id);
CREATE INDEX IF NOT EXISTS ix_recorrido_alertas_tipo ON recorrido_alertas(tipo);
-- Evita duplicar la misma alerta de "1h sin movimiento" para la misma parada.
CREATE UNIQUE INDEX IF NOT EXISTS ux_recorrido_alertas_parada_tipo
  ON recorrido_alertas(parada_id, tipo) WHERE parada_id IS NOT NULL;

-- ======================= ADMIN DEL MÓDULO ("superadmin de recorridos") =======================
-- Lista propia e independiente de SUPERADMINS en src/App.jsx — a propósito, para
-- que administrar este módulo no dependa de tocar el login del resto del sistema
-- ni implique que sea necesariamente la misma gente.
CREATE TABLE IF NOT EXISTS recorrido_admin_access (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ci             bigint NOT NULL,
  nombre         text NOT NULL,
  password_hash  text NOT NULL,
  activo         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE recorrido_admin_access IS '"Superadmin del módulo" de recorridos — independiente de SUPERADMINS (src/App.jsx). password_hash es SIEMPRE un hash pgcrypto, nunca texto plano.';

CREATE UNIQUE INDEX IF NOT EXISTS ux_recorrido_admin_access_ci ON recorrido_admin_access(ci);

-- ======================= SESIONES DE ADMIN =======================
-- No estaba en la lista de tablas originalmente sugerida — se agrega porque hace
-- falta un lugar donde validar p_admin_token del mismo modo que se re-valida
-- p_sesion_token del chofer (ver "decisiones distintas al plan aprobado" en el
-- resumen entregado junto con esta migración).
CREATE TABLE IF NOT EXISTS recorrido_admin_sesiones (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id        uuid NOT NULL REFERENCES recorrido_admin_access(id),
  token_hash      text NOT NULL,
  token_expira_at timestamptz NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE recorrido_admin_sesiones IS 'Tokens de sesión administrativa vigentes (hash SHA-256, nunca el token crudo). Mismo patrón que recorrido_sesiones del lado chofer.';

CREATE UNIQUE INDEX IF NOT EXISTS ux_recorrido_admin_sesiones_token_hash ON recorrido_admin_sesiones(token_hash);
CREATE INDEX IF NOT EXISTS ix_recorrido_admin_sesiones_admin ON recorrido_admin_sesiones(admin_id);

-- ======================= updated_at automático =======================
CREATE OR REPLACE FUNCTION recorrido_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'recorrido_jornadas', 'recorrido_choferes', 'recorrido_asignaciones',
    'recorrido_sesiones', 'recorrido_estado_actual', 'recorrido_paradas',
    'recorrido_admin_access'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated_at ON %I;', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION recorrido_set_updated_at();',
      t, t
    );
  END LOOP;
END $$;

-- ============================================================================
-- 2) RLS: deny-by-default en las 10 tablas nuevas (sin policies para anon/authenticated)
-- ============================================================================
-- Con RLS habilitado y CERO policies, PostgREST (anon/authenticated) no puede leer
-- ni escribir estas tablas directamente — toda operación pasa por las funciones
-- RPC de la sección 4, que son SECURITY DEFINER (corren como el dueño de la
-- función, no sujeto a RLS) y validan todo en SQL.
ALTER TABLE recorrido_jornadas        ENABLE ROW LEVEL SECURITY;
ALTER TABLE recorrido_choferes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE recorrido_asignaciones    ENABLE ROW LEVEL SECURITY;
ALTER TABLE recorrido_sesiones        ENABLE ROW LEVEL SECURITY;
ALTER TABLE recorrido_estado_actual   ENABLE ROW LEVEL SECURITY;
ALTER TABLE recorrido_ubicaciones     ENABLE ROW LEVEL SECURITY;
ALTER TABLE recorrido_paradas         ENABLE ROW LEVEL SECURITY;
ALTER TABLE recorrido_alertas         ENABLE ROW LEVEL SECURITY;
ALTER TABLE recorrido_admin_access    ENABLE ROW LEVEL SECURITY;
ALTER TABLE recorrido_admin_sesiones  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON recorrido_jornadas        FROM anon, authenticated;
REVOKE ALL ON recorrido_choferes        FROM anon, authenticated;
REVOKE ALL ON recorrido_asignaciones    FROM anon, authenticated;
REVOKE ALL ON recorrido_sesiones        FROM anon, authenticated;
REVOKE ALL ON recorrido_estado_actual   FROM anon, authenticated;
REVOKE ALL ON recorrido_ubicaciones     FROM anon, authenticated;
REVOKE ALL ON recorrido_paradas         FROM anon, authenticated;
REVOKE ALL ON recorrido_alertas         FROM anon, authenticated;
REVOKE ALL ON recorrido_admin_access    FROM anon, authenticated;
REVOKE ALL ON recorrido_admin_sesiones  FROM anon, authenticated;

-- ============================================================================
-- 3) FUNCIONES AUXILIARES INTERNAS (no se llaman directo desde el frontend)
-- ============================================================================

-- Distancia Haversine en metros. Función PROPIA del módulo (no importa/depende de
-- mapeo_distancia_metros) — ver nota de aislamiento en el plan aprobado.
CREATE OR REPLACE FUNCTION recorrido_distancia_metros(
  lat1 double precision, lng1 double precision,
  lat2 double precision, lng2 double precision
) RETURNS double precision AS $$
DECLARE
  r double precision := 6371000; -- radio terrestre medio, metros
  dlat double precision;
  dlng double precision;
  a double precision;
BEGIN
  IF lat1 IS NULL OR lng1 IS NULL OR lat2 IS NULL OR lng2 IS NULL THEN
    RETURN NULL;
  END IF;
  dlat := radians(lat2 - lat1);
  dlng := radians(lng2 - lng1);
  a := sin(dlat / 2) ^ 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlng / 2) ^ 2;
  RETURN r * 2 * atan2(sqrt(a), sqrt(1 - a));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Genera un token de sesión aleatorio (64 hex chars, 256 bits de entropía vía
-- gen_random_bytes) y su hash SHA-256. El token crudo se devuelve UNA sola vez al
-- caller (iniciar_sesion_chofer / admin_autenticar); solo el hash se persiste.
CREATE OR REPLACE FUNCTION recorrido_generar_token()
RETURNS TABLE(token text, token_hash text) AS $$
  SELECT t, encode(digest(t, 'sha256'), 'hex')
  FROM (SELECT encode(gen_random_bytes(32), 'hex') AS t) s;
$$ LANGUAGE sql VOLATILE;

-- Valida un admin_token contra recorrido_admin_sesiones y devuelve el admin_id si
-- es vigente, o NULL si no existe/venció. Única función que debe usar cualquier
-- RPC admin futura para re-validar identidad — evita repetir la consulta en cada
-- una.
CREATE OR REPLACE FUNCTION recorrido_admin_validar_token(p_admin_token text)
RETURNS uuid AS $$
DECLARE
  v_admin_id uuid;
BEGIN
  IF p_admin_token IS NULL OR btrim(p_admin_token) = '' THEN
    RETURN NULL;
  END IF;
  SELECT s.admin_id INTO v_admin_id
    FROM recorrido_admin_sesiones s
    JOIN recorrido_admin_access a ON a.id = s.admin_id AND a.activo = true
    WHERE s.token_hash = encode(digest(p_admin_token, 'sha256'), 'hex')
      AND s.token_expira_at > now();
  RETURN v_admin_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE;

-- Procesa UN punto GPS ya validado contra una sesión existente: inserta en el
-- histórico, actualiza el estado caliente, detecta parada/alerta (sin depender
-- solo de "speed") y acumula km de forma incremental. No valida identidad —
-- es un helper interno, lo llama siempre recorrido_registrar_ubicaciones ya con
-- la sesión re-validada.
CREATE OR REPLACE FUNCTION recorrido_procesar_punto(
  p_sesion_id uuid,
  p_lat double precision,
  p_lng double precision,
  p_accuracy double precision,
  p_speed double precision,
  p_heading double precision,
  p_capturado_at timestamptz
) RETURNS void AS $$
DECLARE
  v_estado recorrido_estado_actual%ROWTYPE;
  v_dist_ultimo double precision;
  v_dist_ancla double precision;
  v_segs double precision;
  v_vel_kmh double precision;
  v_parada_id uuid;
  v_umbral_ruido_metros constant double precision := 50;
  v_velocidad_maxima_plausible constant double precision := 150; -- km/h, descarta saltos de GPS
  v_alerta_segundos constant int := 3600;
BEGIN
  IF p_lat IS NULL OR p_lng IS NULL OR p_capturado_at IS NULL
     OR p_lat < -90 OR p_lat > 90 OR p_lng < -180 OR p_lng > 180 THEN
    RETURN; -- punto inválido: se descarta en silencio, no aborta el resto del batch
  END IF;

  INSERT INTO recorrido_ubicaciones (sesion_id, lat, lng, accuracy, speed, heading, capturado_at)
  VALUES (p_sesion_id, p_lat, p_lng, p_accuracy, p_speed, p_heading, p_capturado_at);

  SELECT * INTO v_estado FROM recorrido_estado_actual WHERE sesion_id = p_sesion_id FOR UPDATE;

  IF NOT FOUND THEN
    -- Primer punto de la sesión: se usa como ancla inicial, sin acumular distancia
    -- (no hay "punto anterior" con el que compararlo).
    INSERT INTO recorrido_estado_actual (
      sesion_id, lat, lng, accuracy, speed, heading, capturado_at, recibido_at,
      estado_movimiento, ancla_lat, ancla_lng, parada_desde
    ) VALUES (
      p_sesion_id, p_lat, p_lng, p_accuracy, p_speed, p_heading, p_capturado_at, now(),
      'en_movimiento', p_lat, p_lng, NULL
    );
    RETURN;
  END IF;

  IF v_estado.estado_movimiento = 'finalizado' THEN
    RETURN; -- sesión ya finalizada: el punto queda en el histórico, no reabre el estado.
  END IF;

  IF p_capturado_at <= v_estado.capturado_at THEN
    RETURN; -- punto fuera de orden (reenvío de buffer offline): ya quedó en el histórico.
  END IF;

  v_dist_ultimo := recorrido_distancia_metros(v_estado.lat, v_estado.lng, p_lat, p_lng);
  v_dist_ancla := recorrido_distancia_metros(v_estado.ancla_lat, v_estado.ancla_lng, p_lat, p_lng);
  v_segs := EXTRACT(EPOCH FROM (p_capturado_at - v_estado.capturado_at));
  v_vel_kmh := CASE WHEN v_segs > 0 THEN (v_dist_ultimo / 1000.0) / (v_segs / 3600.0) ELSE 0 END;

  -- Kilómetros: solo suma si la velocidad implícita entre los dos puntos es
  -- plausible — un salto de GPS (teletransporte) no debe contarse como distancia
  -- recorrida.
  IF v_segs > 0 AND v_vel_kmh <= v_velocidad_maxima_plausible THEN
    UPDATE recorrido_sesiones
      SET km_acumulados = km_acumulados + (v_dist_ultimo / 1000.0), updated_at = now()
      WHERE id = p_sesion_id;
  END IF;

  IF v_dist_ancla > v_umbral_ruido_metros THEN
    -- Movimiento real confirmado desde el ancla: cierra cualquier parada abierta y
    -- mueve el ancla al punto nuevo.
    UPDATE recorrido_paradas
      SET fin_at = p_capturado_at,
          duracion_seg = EXTRACT(EPOCH FROM (p_capturado_at - inicio_at))::int,
          updated_at = now()
      WHERE sesion_id = p_sesion_id AND fin_at IS NULL;

    UPDATE recorrido_estado_actual
      SET lat = p_lat, lng = p_lng, accuracy = p_accuracy, speed = p_speed, heading = p_heading,
          capturado_at = p_capturado_at, recibido_at = now(), estado_movimiento = 'en_movimiento',
          ancla_lat = p_lat, ancla_lng = p_lng, parada_desde = NULL, updated_at = now()
      WHERE sesion_id = p_sesion_id;
    RETURN;
  END IF;

  -- Sin desplazamiento real desde el ancla (independientemente de lo que diga
  -- "speed", que es ruidoso): se abre una parada si no había una.
  IF v_estado.parada_desde IS NULL THEN
    INSERT INTO recorrido_paradas (sesion_id, lat, lng, inicio_at)
    VALUES (p_sesion_id, v_estado.ancla_lat, v_estado.ancla_lng, v_estado.capturado_at);

    UPDATE recorrido_sesiones SET paradas_count = paradas_count + 1, updated_at = now() WHERE id = p_sesion_id;

    UPDATE recorrido_estado_actual
      SET lat = p_lat, lng = p_lng, accuracy = p_accuracy, speed = p_speed, heading = p_heading,
          capturado_at = p_capturado_at, recibido_at = now(), estado_movimiento = 'detenido',
          parada_desde = v_estado.capturado_at, updated_at = now()
      WHERE sesion_id = p_sesion_id;
    RETURN;
  END IF;

  -- Seguía parado: actualiza la posición/último contacto y escala a alerta si ya
  -- superó 1 hora sin desplazamiento real.
  UPDATE recorrido_estado_actual
    SET lat = p_lat, lng = p_lng, accuracy = p_accuracy, speed = p_speed, heading = p_heading,
        capturado_at = p_capturado_at, recibido_at = now(), updated_at = now()
    WHERE sesion_id = p_sesion_id;

  IF EXTRACT(EPOCH FROM (p_capturado_at - v_estado.parada_desde)) > v_alerta_segundos THEN
    UPDATE recorrido_estado_actual SET estado_movimiento = 'alerta_detencion' WHERE sesion_id = p_sesion_id;

    SELECT id INTO v_parada_id FROM recorrido_paradas WHERE sesion_id = p_sesion_id AND fin_at IS NULL;
    IF v_parada_id IS NOT NULL THEN
      UPDATE recorrido_paradas SET es_alerta = true, updated_at = now() WHERE id = v_parada_id AND es_alerta = false;
      INSERT INTO recorrido_alertas (sesion_id, parada_id, tipo, detalle)
      SELECT p_sesion_id, v_parada_id, 'sin_movimiento_1h', 'Sin desplazamiento real por más de 1 hora.'
      WHERE NOT EXISTS (
        SELECT 1 FROM recorrido_alertas WHERE parada_id = v_parada_id AND tipo = 'sin_movimiento_1h'
      );
    END IF;
  END IF;
END;
$$ LANGUAGE plpgsql;

REVOKE ALL ON FUNCTION recorrido_distancia_metros(double precision, double precision, double precision, double precision) FROM PUBLIC;
REVOKE ALL ON FUNCTION recorrido_generar_token() FROM PUBLIC;
REVOKE ALL ON FUNCTION recorrido_admin_validar_token(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION recorrido_procesar_punto(uuid, double precision, double precision, double precision, double precision, double precision, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION recorrido_bloquear_edicion_ubicaciones() FROM PUBLIC;
REVOKE ALL ON FUNCTION recorrido_set_updated_at() FROM PUBLIC;

-- ============================================================================
-- 4) FUNCIONES RPC — únicas llamadas por el frontend (supabase.rpc(...))
-- ============================================================================
-- Todas devuelven jsonb con forma {ok: true, ...} o {ok: false, codigo: "..."} —
-- el frontend nunca debe ver un error crudo de Postgres. Mismo contrato ya usado
-- por el módulo de Asistencias (src/modules/asistencia/asistenciaService.js).

-- ======================= CHOFER: iniciar sesión =======================
CREATE OR REPLACE FUNCTION recorrido_iniciar_sesion_chofer(
  p_ci bigint,
  p_codigo text,
  p_device_hash text
) RETURNS jsonb AS $$
DECLARE
  v_chofer recorrido_choferes%ROWTYPE;
  v_asignacion recorrido_asignaciones%ROWTYPE;
  v_jornada recorrido_jornadas%ROWTYPE;
  v_sesion recorrido_sesiones%ROWTYPE;
  v_token text;
  v_token_hash text;
BEGIN
  IF p_ci IS NULL OR p_codigo IS NULL OR btrim(p_codigo) = ''
     OR p_device_hash IS NULL OR btrim(p_device_hash) = '' THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'CI_INVALIDO');
  END IF;

  SELECT * INTO v_chofer FROM recorrido_choferes WHERE ci = p_ci AND activo = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'CI_INVALIDO');
  END IF;

  SELECT a.* INTO v_asignacion
    FROM recorrido_asignaciones a
    JOIN recorrido_jornadas j ON j.id = a.jornada_id
    WHERE a.chofer_id = v_chofer.id AND a.activo = true AND j.activa = true
    ORDER BY a.created_at DESC
    LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'ASIGNACION_NO_ENCONTRADA');
  END IF;

  IF v_asignacion.codigo_expira_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'CODIGO_EXPIRADO');
  END IF;

  IF v_asignacion.codigo_hash <> crypt(p_codigo, v_asignacion.codigo_hash) THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'CODIGO_INVALIDO');
  END IF;

  SELECT * INTO v_jornada FROM recorrido_jornadas WHERE id = v_asignacion.jornada_id;
  SELECT token, token_hash INTO v_token, v_token_hash FROM recorrido_generar_token();

  SELECT * INTO v_sesion FROM recorrido_sesiones
    WHERE asignacion_id = v_asignacion.id AND finalizado_at IS NULL
    LIMIT 1;

  IF FOUND THEN
    UPDATE recorrido_sesiones
      SET device_hash = p_device_hash, token_hash = v_token_hash,
          token_expira_at = now() + interval '16 hours', updated_at = now()
      WHERE id = v_sesion.id
      RETURNING * INTO v_sesion;
  ELSE
    INSERT INTO recorrido_sesiones (asignacion_id, device_hash, token_hash, token_expira_at)
    VALUES (v_asignacion.id, p_device_hash, v_token_hash, now() + interval '16 hours')
    RETURNING * INTO v_sesion;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'token', v_token,
    'expires_at', v_sesion.token_expira_at,
    'sesion_id', v_sesion.id,
    'chofer', jsonb_build_object('nombre', v_chofer.nombre, 'apellido', v_chofer.apellido),
    'jornada', jsonb_build_object('nombre', v_jornada.nombre)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ======================= CHOFER: registrar ubicaciones (batch) =======================
CREATE OR REPLACE FUNCTION recorrido_registrar_ubicaciones(
  p_sesion_token text,
  p_device_hash text,
  p_puntos jsonb
) RETURNS jsonb AS $$
DECLARE
  v_sesion recorrido_sesiones%ROWTYPE;
  v_elem jsonb;
  v_procesados int := 0;
BEGIN
  IF p_sesion_token IS NULL OR btrim(p_sesion_token) = ''
     OR p_device_hash IS NULL OR btrim(p_device_hash) = ''
     OR p_puntos IS NULL OR jsonb_typeof(p_puntos) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'PUNTOS_INVALIDOS');
  END IF;

  SELECT * INTO v_sesion FROM recorrido_sesiones
    WHERE token_hash = encode(digest(p_sesion_token, 'sha256'), 'hex')
      AND device_hash = p_device_hash;

  IF NOT FOUND OR v_sesion.token_expira_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'SESION_INVALIDA_O_VENCIDA');
  END IF;
  IF v_sesion.finalizado_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'SESION_FINALIZADA');
  END IF;

  IF v_sesion.iniciado_at IS NULL THEN
    UPDATE recorrido_sesiones SET iniciado_at = now(), updated_at = now() WHERE id = v_sesion.id;
  END IF;

  FOR v_elem IN
    SELECT elem FROM jsonb_array_elements(p_puntos) AS elem
    ORDER BY (elem ->> 'capturado_at')::timestamptz
  LOOP
    PERFORM recorrido_procesar_punto(
      v_sesion.id,
      (v_elem ->> 'lat')::double precision,
      (v_elem ->> 'lng')::double precision,
      (v_elem ->> 'accuracy')::double precision,
      (v_elem ->> 'speed')::double precision,
      (v_elem ->> 'heading')::double precision,
      (v_elem ->> 'capturado_at')::timestamptz
    );
    v_procesados := v_procesados + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'puntos_procesados', v_procesados);
EXCEPTION WHEN OTHERS THEN
  -- Nunca propagar un error crudo de Postgres al frontend (ej. un punto con un
  -- campo faltante/mal tipado dentro del array) — se descarta el batch completo y
  -- se informa un código genérico; el cliente puede reintentar.
  RETURN jsonb_build_object('ok', false, 'codigo', 'PUNTOS_INVALIDOS');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ======================= CHOFER: finalizar sesión =======================
CREATE OR REPLACE FUNCTION recorrido_finalizar_sesion(
  p_sesion_token text,
  p_device_hash text
) RETURNS jsonb AS $$
DECLARE
  v_sesion recorrido_sesiones%ROWTYPE;
BEGIN
  IF p_sesion_token IS NULL OR p_device_hash IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'SESION_INVALIDA_O_VENCIDA');
  END IF;

  SELECT * INTO v_sesion FROM recorrido_sesiones
    WHERE token_hash = encode(digest(p_sesion_token, 'sha256'), 'hex')
      AND device_hash = p_device_hash;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'SESION_INVALIDA_O_VENCIDA');
  END IF;

  IF v_sesion.finalizado_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true); -- idempotente
  END IF;

  UPDATE recorrido_paradas
    SET fin_at = now(), duracion_seg = EXTRACT(EPOCH FROM (now() - inicio_at))::int, updated_at = now()
    WHERE sesion_id = v_sesion.id AND fin_at IS NULL;

  UPDATE recorrido_sesiones SET finalizado_at = now(), updated_at = now() WHERE id = v_sesion.id;
  UPDATE recorrido_estado_actual SET estado_movimiento = 'finalizado', updated_at = now() WHERE sesion_id = v_sesion.id;

  RETURN jsonb_build_object('ok', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ======================= ADMIN: autenticar =======================
CREATE OR REPLACE FUNCTION recorrido_admin_autenticar(
  p_ci bigint,
  p_password text
) RETURNS jsonb AS $$
DECLARE
  v_admin recorrido_admin_access%ROWTYPE;
  v_token text;
  v_token_hash text;
  v_expira timestamptz;
BEGIN
  IF p_ci IS NULL OR p_password IS NULL OR btrim(p_password) = '' THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'CREDENCIALES_INVALIDAS');
  END IF;

  SELECT * INTO v_admin FROM recorrido_admin_access WHERE ci = p_ci AND activo = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'CREDENCIALES_INVALIDAS');
  END IF;

  IF v_admin.password_hash <> crypt(p_password, v_admin.password_hash) THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'CREDENCIALES_INVALIDAS');
  END IF;

  SELECT token, token_hash INTO v_token, v_token_hash FROM recorrido_generar_token();
  v_expira := now() + interval '8 hours';

  INSERT INTO recorrido_admin_sesiones (admin_id, token_hash, token_expira_at)
  VALUES (v_admin.id, v_token_hash, v_expira);

  RETURN jsonb_build_object('ok', true, 'admin_token', v_token, 'expires_at', v_expira, 'nombre', v_admin.nombre);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ======================= ADMIN: estado actual (dashboard en vivo) =======================
-- SOLO lee recorrido_estado_actual + recorrido_asignaciones/choferes/jornadas
-- (todas acotadas a ~600 filas) — nunca recorrido_ubicaciones. "sin_senal" se
-- calcula acá mismo, comparando recibido_at contra el momento de la consulta.
CREATE OR REPLACE FUNCTION recorrido_admin_listar_estado(
  p_admin_token text,
  p_jornada_id uuid DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_admin_id uuid;
  v_umbral_sin_senal_seg constant int := 90;
  v_choferes jsonb;
  v_total int; v_iniciados int; v_no_iniciados int;
  v_en_movimiento int; v_detenidos int; v_alertas int; v_sin_senal int; v_finalizados int;
BEGIN
  v_admin_id := recorrido_admin_validar_token(p_admin_token);
  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'SESION_ADMIN_INVALIDA');
  END IF;

  WITH base AS (
    SELECT
      a.id AS asignacion_id, s.id AS sesion_id,
      c.ci, c.nombre, c.apellido, c.seccional, c.local_votacion,
      s.iniciado_at, s.finalizado_at, s.km_acumulados, s.paradas_count,
      e.lat, e.lng, e.capturado_at, e.recibido_at, e.estado_movimiento,
      CASE
        WHEN s.finalizado_at IS NOT NULL THEN 'finalizado'
        WHEN s.id IS NULL OR e.recibido_at IS NULL THEN 'no_iniciado'
        WHEN now() - e.recibido_at > make_interval(secs => v_umbral_sin_senal_seg) THEN 'sin_senal'
        ELSE e.estado_movimiento
      END AS estado_calculado
    FROM recorrido_asignaciones a
    JOIN recorrido_choferes c ON c.id = a.chofer_id
    JOIN recorrido_jornadas j ON j.id = a.jornada_id
    LEFT JOIN LATERAL (
      SELECT * FROM recorrido_sesiones rs
      WHERE rs.asignacion_id = a.id
      ORDER BY rs.created_at DESC
      LIMIT 1
    ) s ON true
    LEFT JOIN recorrido_estado_actual e ON e.sesion_id = s.id
    WHERE a.activo = true
      AND j.activa = true
      AND (p_jornada_id IS NULL OR j.id = p_jornada_id)
  )
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'sesion_id', sesion_id, 'ci', ci, 'nombre', nombre, 'apellido', apellido,
      'seccional', seccional, 'local_votacion', local_votacion,
      'lat', lat, 'lng', lng, 'capturado_at', capturado_at, 'recibido_at', recibido_at,
      'km_acumulados', km_acumulados, 'paradas_count', paradas_count,
      'estado', estado_calculado
    ) ORDER BY nombre), '[]'::jsonb),
    count(*),
    count(*) FILTER (WHERE iniciado_at IS NOT NULL),
    count(*) FILTER (WHERE iniciado_at IS NULL),
    count(*) FILTER (WHERE estado_calculado = 'en_movimiento'),
    count(*) FILTER (WHERE estado_calculado IN ('detenido', 'alerta_detencion')),
    count(*) FILTER (WHERE estado_calculado = 'alerta_detencion'),
    count(*) FILTER (WHERE estado_calculado = 'sin_senal'),
    count(*) FILTER (WHERE estado_calculado = 'finalizado')
  INTO v_choferes, v_total, v_iniciados, v_no_iniciados, v_en_movimiento, v_detenidos, v_alertas, v_sin_senal, v_finalizados
  FROM base;

  RETURN jsonb_build_object(
    'ok', true,
    'choferes', v_choferes,
    'total', v_total, 'iniciados', v_iniciados, 'no_iniciados', v_no_iniciados,
    'en_movimiento', v_en_movimiento, 'detenidos', v_detenidos, 'alertas', v_alertas,
    'sin_senal', v_sin_senal, 'finalizados', v_finalizados
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE;

-- ============================================================================
-- 5) PERMISOS — únicamente EXECUTE sobre las RPC pensadas para el frontend
-- ============================================================================
-- El frontend usa siempre la clave anon (no hay sesión de Supabase Auth), así que
-- estas funciones deben ser ejecutables por anon y authenticated. Las tablas base
-- NO reciben ningún grant directo (ver sección 2).
GRANT EXECUTE ON FUNCTION recorrido_iniciar_sesion_chofer(bigint, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION recorrido_registrar_ubicaciones(text, text, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION recorrido_finalizar_sesion(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION recorrido_admin_autenticar(bigint, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION recorrido_admin_listar_estado(text, uuid) TO anon, authenticated;

-- Las funciones auxiliares internas (recorrido_distancia_metros,
-- recorrido_generar_token, recorrido_admin_validar_token, recorrido_procesar_punto,
-- recorrido_bloquear_edicion_ubicaciones, recorrido_set_updated_at) NO se otorgan a
-- anon/authenticated y además se les revocó EXECUTE de PUBLIC explícitamente en la
-- sección 3 (PostgreSQL lo otorga por defecto en todo CREATE FUNCTION) — solo las
-- usan las funciones RPC de arriba.
