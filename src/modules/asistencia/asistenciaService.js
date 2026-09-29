// ======================= SERVICIO: MÓDULO DE ASISTENCIA =======================
// Única capa que habla con las RPC `*_asistencia`. Los nombres de parámetro son
// EXACTOS según lo confirmado por el equipo backend — no se inventan alias.
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
// panel admin dentro de `puntos[].estado` de asistencia_admin_listar_configuracion.

import { supabase } from "../../supabaseClient";
import { obtenerAdminToken, limpiarAdminSession } from "./asistenciaAdminAuth";

const callRpc = async (nombre, params) => {
  const { data, error } = await supabase.rpc(nombre, params);
  if (error) {
    console.error(`[asistencia] ${nombre}:`, error);
    return { ok: false, codigo: "ERROR_TECNICO" };
  }
  return data;
};

// ======================= FLUJO PÚBLICO =======================
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

// ======================= LOGIN ADMINISTRATIVO =======================
// Autentica a uno de los superadmin ya existentes contra el backend (nunca contra un
// password hardcodeado en el frontend). No requiere admin_token: es lo que lo genera.
export const autenticarAdmin = (ci, password) =>
  callRpc("asistencia_admin_autenticar", { p_ci: ci, p_password: password });

// ======================= RPC ADMINISTRATIVAS =======================
// Todas requieren la sesión administrativa iniciada en App.jsx (ver
// asistenciaAdminAuth.js). Si no hay token vigente, ni siquiera se llama a Supabase:
// se devuelve el mismo código sintético que usa la UI para mostrar "sesión
// administrativa expiró". Si el backend responde NO_AUTORIZADO (token rechazado del
// lado del servidor), se normaliza al mismo código y se limpia la sesión local, para
// que toda la UI tenga un único punto de traducción sin importar si la sesión nunca
// se guardó, expiró localmente, o el servidor la invalidó.
const callAdminRpc = async (nombre, params) => {
  const token = obtenerAdminToken();
  if (!token) return { ok: false, codigo: "SESION_ADMIN_EXPIRADA" };

  const data = await callRpc(nombre, { p_admin_token: token, ...params });
  if (!data?.ok && data?.codigo === "NO_AUTORIZADO") {
    limpiarAdminSession();
    return { ok: false, codigo: "SESION_ADMIN_EXPIRADA" };
  }
  return data;
};

export const listarConfiguracionAdmin = (eventoId = null) =>
  callAdminRpc("asistencia_admin_listar_configuracion", { p_evento_id: eventoId });

export const actualizarPuntoAdmin = ({
  puntoId,
  inicio,
  fin,
  radioMetros,
  latitud,
  longitud,
  modoHabilitacion,
}) =>
  callAdminRpc("asistencia_admin_actualizar_punto", {
    p_punto_id: puntoId,
    p_inicio: inicio,
    p_fin: fin,
    p_radio_metros: radioMetros,
    p_latitud: latitud,
    p_longitud: longitud,
    p_modo_habilitacion: modoHabilitacion,
  });

export const actualizarEventoAdmin = ({ eventoId, activo }) =>
  callAdminRpc("asistencia_admin_actualizar_evento", { p_evento_id: eventoId, p_activo: activo });

export const listarAsistenciasAdmin = (eventoId = null) =>
  callAdminRpc("asistencia_admin_listar_asistencias", { p_evento_id: eventoId });
