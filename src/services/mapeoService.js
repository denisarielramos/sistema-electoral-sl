// ======================= SERVICIO: MAPEO TERRITORIAL Y BITÁCORA DE VISITAS =======================
// Única capa que habla con las funciones RPC `mapeo_*` (ver
// supabase/migrations/20260727100000_mapeo_territorial_bitacora.sql). No hace
// SELECT/INSERT/UPDATE directo sobre hogares/hogar_votantes/visitas_hogar/
// configuracion_mapeo — esas tablas están bloqueadas por RLS para anon/authenticated
// a propósito; todo pasa por RPC, que valida identidad y alcance del lado servidor.
//
// currentUser es el mismo objeto que usa el resto del dashboard: { ci, role, ... }.
// Desde este PR también incluye `loginCode` para dirigente/coordinador/subcoordinador
// (agregado en src/App.jsx al iniciar sesión) — es lo que le permite a las funciones
// RPC re-verificar la identidad del lado del servidor en vez de confiar en el CI/rol
// que manda React. Superadmin no tiene login_code (sus credenciales no están en la
// base de datos); ver la nota de seguridad al inicio del archivo SQL y
// docs/MAPEO_BITACORA.md.

import { supabase } from "../supabaseClient";

const getActorParams = (currentUser) => {
  if (!currentUser) throw new Error("Debe iniciar sesión para usar el módulo de mapeo.");
  if (currentUser.role === "superadmin") {
    return { p_login_code: null, p_superadmin_ci: currentUser.ci };
  }
  if (!currentUser.loginCode) {
    throw new Error(
      "Su sesión no tiene el código de acceso disponible para validar esta acción de forma segura. Vuelva a iniciar sesión."
    );
  }
  return { p_login_code: currentUser.loginCode, p_superadmin_ci: null };
};

const unwrap = ({ data, error }, mensaje) => {
  if (error) throw new Error(`${mensaje}: ${error.message}`);
  return data;
};

// ======================= CONFIGURACIÓN =======================
export const fetchConfiguracionMapeo = async () => {
  const res = await supabase.rpc("mapeo_configuracion_actual");
  const data = unwrap(res, "Error al obtener la configuración de mapeo");
  return Array.isArray(data) ? data[0] : data;
};

export const actualizarConfiguracionMapeo = async (
  currentUser,
  { radioPermitidoMetros, precisionGpsMaximaMetros }
) => {
  const actor = getActorParams(currentUser);
  const res = await supabase.rpc("mapeo_actualizar_configuracion", {
    ...actor,
    p_radio_permitido_metros: radioPermitidoMetros,
    p_precision_gps_maxima_metros: precisionGpsMaximaMetros,
  });
  return unwrap(res, "Error al actualizar la configuración de mapeo");
};

// ======================= HOGARES =======================
export const listarHogares = async (currentUser) => {
  const actor = getActorParams(currentUser);
  const res = await supabase.rpc("mapeo_listar_hogares", actor);
  return unwrap(res, "Error al listar hogares") || [];
};

export const crearHogar = async (
  currentUser,
  { nombreFamilia, direccion, referencia, latitud, longitud, precisionGps }
) => {
  const actor = getActorParams(currentUser);
  const res = await supabase.rpc("mapeo_crear_hogar", {
    ...actor,
    p_nombre_familia: nombreFamilia || null,
    p_direccion: direccion || null,
    p_referencia: referencia || null,
    p_latitud: latitud ?? null,
    p_longitud: longitud ?? null,
    p_precision_gps: precisionGps ?? null,
  });
  return unwrap(res, "Error al crear el hogar");
};

export const actualizarHogar = async (
  currentUser,
  hogarId,
  { nombreFamilia, direccion, referencia, latitud, longitud, precisionGps }
) => {
  const actor = getActorParams(currentUser);
  const res = await supabase.rpc("mapeo_actualizar_hogar", {
    ...actor,
    p_hogar_id: hogarId,
    p_nombre_familia: nombreFamilia || null,
    p_direccion: direccion || null,
    p_referencia: referencia || null,
    p_latitud: latitud ?? null,
    p_longitud: longitud ?? null,
    p_precision_gps: precisionGps ?? null,
  });
  return unwrap(res, "Error al actualizar el hogar");
};

export const verificarHogar = async (currentUser, hogarId, aprobar, ubicacionActualizadaAt, observacion = null) => {
  const actor = getActorParams(currentUser);
  const res = await supabase.rpc("mapeo_verificar_hogar", {
    ...actor,
    p_hogar_id: hogarId,
    p_aprobar: aprobar,
    p_ubicacion_actualizada_at: ubicacionActualizadaAt,
    p_observacion: observacion,
  });
  return unwrap(res, "Error al verificar el hogar");
};

export const asociarVotanteAHogar = async (currentUser, hogarId, votanteCi) => {
  const actor = getActorParams(currentUser);
  const res = await supabase.rpc("mapeo_asociar_votante", {
    ...actor,
    p_hogar_id: hogarId,
    p_votante_ci: votanteCi,
  });
  return unwrap(res, "Error al asociar el votante al hogar");
};

export const desasociarVotanteDeHogar = async (currentUser, hogarId, votanteCi) => {
  const actor = getActorParams(currentUser);
  const res = await supabase.rpc("mapeo_desasociar_votante", {
    ...actor,
    p_hogar_id: hogarId,
    p_votante_ci: votanteCi,
  });
  return unwrap(res, "Error al desasociar el votante");
};

// Elimina el MAPEO de un hogar (soft-delete: hogares.activo=false y se liberan todos
// sus integrantes activos en hogar_votantes) — nunca borra filas ni toca visitas_hogar.
// Solo superadmin puede hacerlo; el RPC rechaza cualquier otro rol del lado del
// servidor, esto no es más que conveniencia de UI (ver mapeo_eliminar_hogar).
export const eliminarHogar = async (currentUser, hogarId) => {
  const actor = getActorParams(currentUser);
  const res = await supabase.rpc("mapeo_eliminar_hogar", {
    ...actor,
    p_hogar_id: hogarId,
  });
  return unwrap(res, "Error al eliminar el mapeo del hogar");
};

// ======================= VISITAS =======================
export const confirmarVisita = async (
  currentUser,
  hogarId,
  { latitud, longitud, precisionGps, observacion }
) => {
  const actor = getActorParams(currentUser);
  const res = await supabase.rpc("mapeo_confirmar_visita", {
    ...actor,
    p_hogar_id: hogarId,
    p_latitud: latitud ?? null,
    p_longitud: longitud ?? null,
    p_precision_gps: precisionGps ?? null,
    p_observacion: observacion || null,
  });
  return unwrap(res, "Error al registrar la visita");
};

export const listarVisitas = async (currentUser, hogarId = null) => {
  const actor = getActorParams(currentUser);
  const res = await supabase.rpc("mapeo_listar_visitas", { ...actor, p_hogar_id: hogarId });
  return unwrap(res, "Error al listar visitas") || [];
};
