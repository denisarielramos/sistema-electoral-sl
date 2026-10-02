// ======================= SERVICIO: MÓDULO DE MONITOREO DE RECORRIDOS =======================
// Única capa que llama a supabase.rpc(...) de este módulo — ningún componente
// consulta una tabla `recorrido_*` directamente (no podrían: RLS sin políticas).
// Nombres de parámetro EXACTOS según la migración
// supabase/migrations/20261002120000_recorrido_monitoreo.sql.
//
// Las RPC devuelven siempre jsonb { ok: true, ... } o { ok: false, codigo: "..." },
// incluso ante validaciones funcionales (CI inválido, código expirado, etc.).
// `error` de Supabase JS se reserva para fallos técnicos inesperados (red/PostgREST)
// y NUNCA se muestra crudo al usuario: se convierte en el código sintético
// "ERROR_TECNICO", mismo criterio que asistenciaService.js, para que toda la UI
// tenga un único punto de traducción (ver ERROR_MESSAGES en recorridoUtils.js).

import { supabase } from "../../supabaseClient";

const callRpc = async (nombre, params) => {
  const { data, error } = await supabase.rpc(nombre, params);
  if (error) {
    console.error(`[recorridos] ${nombre}:`, error);
    return { ok: false, codigo: "ERROR_TECNICO" };
  }
  return data;
};

export const iniciarSesionChofer = (ci, codigo, deviceHash) =>
  callRpc("recorrido_iniciar_sesion_chofer", {
    p_ci: ci,
    p_codigo: codigo,
    p_device_hash: deviceHash,
  });

export const registrarUbicaciones = (sesionToken, deviceHash, puntos) =>
  callRpc("recorrido_registrar_ubicaciones", {
    p_sesion_token: sesionToken,
    p_device_hash: deviceHash,
    p_puntos: puntos,
  });

export const finalizarSesion = (sesionToken, deviceHash) =>
  callRpc("recorrido_finalizar_sesion", {
    p_sesion_token: sesionToken,
    p_device_hash: deviceHash,
  });
