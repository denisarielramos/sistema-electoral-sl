// Única capa que llama a las RPC recorrido_admin_* de Supabase. Ningún
// componente del panel administrativo debe usar supabase.from("recorrido_*")
// ni supabase.rpc(...) directamente — todo pasa por acá.
//
// Puente de sesión: el módulo de Recorridos no tiene login propio. Usa el
// token de sesión administrativa que el login de Superadmin ya guarda
// (asistenciaAdminAuth.obtenerAdminToken) para canjearlo, vía
// recorrido_admin_iniciar_desde_superadmin, por un admin_token propio del
// módulo (recorridoAdminAuth, sessionStorage separado). callAdminRpc hace ese
// canje de forma perezosa en la primera llamada y, si la sesión de Recorridos
// expira a mitad de uso, la limpia y reintenta el puente una sola vez usando
// el token de Asistencia (si todavía está vigente) antes de darse por
// vencido — así nunca se le pide una contraseña de nuevo al Superadmin.

import { supabase } from "../../../supabaseClient";
import { obtenerAdminToken as obtenerAsistenciaAdminToken } from "../../asistencia/asistenciaAdminAuth";
import {
  guardarAdminSession,
  limpiarAdminSession,
  obtenerAdminToken,
} from "./recorridoAdminAuth";

const callRpc = async (nombre, params) => {
  const { data, error } = await supabase.rpc(nombre, params);
  if (error) {
    console.error(`[recorridos-admin] ${nombre}:`, error);
    return { ok: false, codigo: "ERROR_TECNICO" };
  }
  return data;
};

// Canjea el token de sesión de Asistencia (ya guardado por App.jsx al hacer
// login como Superadmin) por un admin_token propio del módulo de Recorridos.
// Nunca pide ni recibe una contraseña.
export const iniciarDesdeSuperadmin = async (asistenciaAdminToken) => {
  const data = await callRpc("recorrido_admin_iniciar_desde_superadmin", {
    p_asistencia_admin_token: asistenciaAdminToken,
  });
  if (data?.ok) {
    guardarAdminSession({ token: data.admin_token, expiresAt: data.expires_at });
  }
  return data;
};

const asegurarSesion = async () => {
  if (obtenerAdminToken()) return { ok: true };

  const asistenciaToken = obtenerAsistenciaAdminToken();
  if (!asistenciaToken) {
    return { ok: false, codigo: "SESION_SUPERADMIN_EXPIRADA" };
  }

  const data = await iniciarDesdeSuperadmin(asistenciaToken);
  if (!data?.ok) return data;
  return { ok: true };
};

const callAdminRpc = async (nombre, params = {}, _reintentado = false) => {
  const sesion = await asegurarSesion();
  if (!sesion.ok) return sesion;

  const token = obtenerAdminToken();
  const data = await callRpc(nombre, { p_admin_token: token, ...params });

  if (!data?.ok && data?.codigo === "SESION_ADMIN_INVALIDA") {
    limpiarAdminSession();
    if (!_reintentado) {
      return callAdminRpc(nombre, params, true);
    }
    return { ok: false, codigo: "SESION_SUPERADMIN_EXPIRADA" };
  }

  return data;
};

export const cerrarSesionAdmin = () => limpiarAdminSession();

// ---------------------------------------------------------------- Jornadas
export const listarJornadas = () => callAdminRpc("recorrido_admin_listar_jornadas");

export const crearJornada = (nombre, fecha) =>
  callAdminRpc("recorrido_admin_crear_jornada", { p_nombre: nombre, p_fecha: fecha });

export const actualizarJornada = (jornadaId, nombre, fecha) =>
  callAdminRpc("recorrido_admin_actualizar_jornada", {
    p_jornada_id: jornadaId,
    p_nombre: nombre,
    p_fecha: fecha,
  });

export const activarJornada = (jornadaId) =>
  callAdminRpc("recorrido_admin_activar_jornada", { p_jornada_id: jornadaId });

export const desactivarJornada = (jornadaId) =>
  callAdminRpc("recorrido_admin_desactivar_jornada", { p_jornada_id: jornadaId });

// ---------------------------------------------------------------- Choferes
export const listarChoferes = ({
  busqueda = null,
  soloActivos = null,
  limite = 200,
  offset = 0,
} = {}) =>
  callAdminRpc("recorrido_admin_listar_choferes", {
    p_busqueda: busqueda,
    p_solo_activos: soloActivos,
    p_limite: limite,
    p_offset: offset,
  });

export const crearChofer = ({ ci, nombre, apellido, telefono, seccional, localVotacion }) =>
  callAdminRpc("recorrido_admin_crear_chofer", {
    p_ci: ci,
    p_nombre: nombre,
    p_apellido: apellido,
    p_telefono: telefono,
    p_seccional: seccional,
    p_local_votacion: localVotacion,
  });

export const actualizarChofer = ({
  choferId,
  nombre,
  apellido,
  telefono,
  seccional,
  localVotacion,
  activo,
}) =>
  callAdminRpc("recorrido_admin_actualizar_chofer", {
    p_chofer_id: choferId,
    p_nombre: nombre,
    p_apellido: apellido,
    p_telefono: telefono,
    p_seccional: seccional,
    p_local_votacion: localVotacion,
    p_activo: activo,
  });

// p_choferes: array de objetos {ci, nombre, apellido, telefono, seccional,
// local_votacion}. El backend acepta máximo 500 por llamada — el batching de
// archivos más grandes es responsabilidad del llamador (ver importación Excel).
export const importarChoferes = (choferes) =>
  callAdminRpc("recorrido_admin_importar_choferes", { p_choferes: choferes });

// ----------------------------------------------------- Asignaciones / códigos
export const asignarChoferes = (jornadaId, cis, horasExpiracion = 48) =>
  callAdminRpc("recorrido_admin_asignar_choferes", {
    p_jornada_id: jornadaId,
    p_cis: cis,
    p_horas_expiracion: horasExpiracion,
  });

export const regenerarCodigo = (asignacionId, horasExpiracion = 48) =>
  callAdminRpc("recorrido_admin_regenerar_codigo", {
    p_asignacion_id: asignacionId,
    p_horas_expiracion: horasExpiracion,
  });

export const listarAsignaciones = ({
  jornadaId,
  busqueda = null,
  limite = 200,
  offset = 0,
}) =>
  callAdminRpc("recorrido_admin_listar_asignaciones", {
    p_jornada_id: jornadaId,
    p_busqueda: busqueda,
    p_limite: limite,
    p_offset: offset,
  });

// --------------------------------------------------------- Estado / detalle
export const listarEstado = (jornadaId = null) =>
  callAdminRpc("recorrido_admin_listar_estado", { p_jornada_id: jornadaId });

export const detalleChofer = (asignacionId) =>
  callAdminRpc("recorrido_admin_detalle_chofer", { p_asignacion_id: asignacionId });

// ---------------------------------------------------------- Historial / replay
export const listarHistorico = ({
  jornadaId = null,
  ci = null,
  fechaDesde = null,
  fechaHasta = null,
  limite = 100,
  offset = 0,
} = {}) =>
  callAdminRpc("recorrido_admin_listar_historico", {
    p_jornada_id: jornadaId,
    p_ci: ci,
    p_fecha_desde: fechaDesde,
    p_fecha_hasta: fechaHasta,
    p_limite: limite,
    p_offset: offset,
  });

// Máximo 5000 por página en el backend — el llamador debe paginar si hay más
// (ver RecorridoReplay), siempre conservando el orden capturado_at ASC que ya
// garantiza la RPC.
export const replayPuntos = (sesionId, limite = 2000, offset = 0) =>
  callAdminRpc("recorrido_admin_replay_puntos", {
    p_sesion_id: sesionId,
    p_limite: limite,
    p_offset: offset,
  });

export const listarParadas = (sesionId) =>
  callAdminRpc("recorrido_admin_listar_paradas", { p_sesion_id: sesionId });

export const listarAlertas = (sesionId) =>
  callAdminRpc("recorrido_admin_listar_alertas", { p_sesion_id: sesionId });

// --------------------------------------------------------- Accesos (allowlist)
export const listarAutorizados = () => callAdminRpc("recorrido_admin_listar_autorizados");

export const autorizarCI = (ci, nombre) =>
  callAdminRpc("recorrido_admin_autorizar_ci", { p_ci: ci, p_nombre: nombre });

export const desautorizarCI = (adminObjetivoId) =>
  callAdminRpc("recorrido_admin_desautorizar_ci", { p_admin_objetivo_id: adminObjetivoId });
