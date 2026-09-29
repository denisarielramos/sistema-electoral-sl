// ======================= SERVICIO: MÓDULO DE ASISTENCIA (flujo público) =======================
// Única capa que habla con las RPC `*_asistencia`. Los nombres de parámetro son
// EXACTOS según lo confirmado por el equipo backend — no se inventan alias:
//   p_evento_slug, p_device_hash, p_sesion_token, p_seccional, p_latitud,
//   p_longitud, p_precision_metros, p_ci, p_punto_id, p_momento
//
// Las RPC devuelven jsonb con forma { ok: true, ... } o { ok: false, codigo: "..." }
// incluso ante validaciones funcionales (CI ya registrado, fuera de perímetro, etc.).
// `error` de Supabase JS se reserva para fallos técnicos inesperados (red/PostgREST)
// y NUNCA se muestra crudo al usuario: acá se convierte en el código sintético
// "ERROR_TECNICO" para que toda la UI tenga un único punto de traducción
// (ver ERROR_MESSAGES en asistenciaUtils.js).
//
// estado_punto_asistencia es auxiliar exclusivo del backend: no se expone acá ni se
// llama desde ningún componente del cliente (ni público ni admin). El estado de cada
// punto llega ya calculado dentro de `puntos` en iniciarSesionAsistencia, y en el
// panel admin llegará calculado dentro de la futura asistencia_admin_listar_configuracion.

import { supabase } from "../../supabaseClient";

const callRpc = async (nombre, params) => {
  const { data, error } = await supabase.rpc(nombre, params);
  if (error) {
    console.error(`[asistencia] ${nombre}:`, error);
    return { ok: false, codigo: "ERROR_TECNICO" };
  }
  return data;
};

export const iniciarSesionAsistencia = (eventoSlug, deviceHash) =>
  callRpc("iniciar_sesion_asistencia", {
    p_evento_slug: eventoSlug,
    p_device_hash: deviceHash,
  });

export const validarUbicacionAsistencia = ({
  sesionToken,
  deviceHash,
  seccional,
  latitud,
  longitud,
  precisionMetros,
}) =>
  callRpc("validar_ubicacion_asistencia", {
    p_sesion_token: sesionToken,
    p_device_hash: deviceHash,
    p_seccional: seccional,
    p_latitud: latitud,
    p_longitud: longitud,
    p_precision_metros: precisionMetros ?? null,
  });

export const buscarPersonaAsistencia = ({ sesionToken, deviceHash, ci }) =>
  callRpc("buscar_persona_asistencia", {
    p_sesion_token: sesionToken,
    p_device_hash: deviceHash,
    p_ci: ci,
  });

export const registrarAsistencia = ({ sesionToken, deviceHash, ci }) =>
  callRpc("registrar_asistencia", {
    p_sesion_token: sesionToken,
    p_device_hash: deviceHash,
    p_ci: ci,
  });

// ======================= RPC ADMINISTRATIVAS (pendientes) =======================
// Estas 4 operaciones NO tienen todavía una RPC en Supabase (ver plan / sección
// "RPC ADMINISTRATIVAS FALTANTES"). A propósito NO se exporta ninguna función que
// las invoque: llamar a una función inexistente en Postgres devuelve un error técnico
// 42883, y no queremos que el panel admin dispare requests rotos. En su lugar se
// exporta esta bandera para que la UI muestre "Backend administrativo pendiente" sin
// intentar ningún supabase.rpc(...). Cuando el equipo backend cree
// asistencia_admin_listar_configuracion / asistencia_admin_actualizar_punto /
// asistencia_admin_actualizar_evento / asistencia_admin_listar_asistencias (con su
// mecanismo de autorización ya definido), se agregan acá sus wrappers reales y se
// quita esta bandera.
export const ADMIN_RPC_DISPONIBLE = false;
