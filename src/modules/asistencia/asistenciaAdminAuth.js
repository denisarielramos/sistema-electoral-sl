// ======================= SESIÓN ADMINISTRATIVA DEL MÓDULO DE ASISTENCIA =======================
// Guarda ÚNICAMENTE el token temporal que devuelve asistencia_admin_autenticar y su
// expiración — NUNCA la contraseña. Es un sessionStorage aparte del de la sesión
// pública (asistencia_sesion_v1) y del currentUser del sistema (localStorage): cerrar
// la pestaña o hacer logout del sistema borra esta sesión administrativa también.
//
// El login sigue siendo el único que ya existe (CI + contraseña en App.jsx, para los
// mismos 2 superadmin). Este helper solo administra el token que ese login obtiene de
// asistencia_admin_autenticar, para que asistenciaService.js lo adjunte en cada RPC
// administrativa sin que cada componente tenga que manejarlo a mano.

const ADMIN_SESSION_KEY = "asistencia_admin_session_v1";

export const guardarAdminSession = ({ token, expiresAt }) => {
  try {
    sessionStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify({ token, expiresAt }));
  } catch {
    // sessionStorage no disponible: las RPC administrativas fallarán con sesión
    // expirada hasta que se pueda volver a guardar — no es crítico, el backend sigue
    // siendo la autoridad real.
  }
};

export const limpiarAdminSession = () => {
  try {
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
  } catch {
    // no-op
  }
};

// Devuelve el token vigente, o null si no hay sesión administrativa o ya venció.
export const obtenerAdminToken = () => {
  try {
    const raw = sessionStorage.getItem(ADMIN_SESSION_KEY);
    if (!raw) return null;
    const { token, expiresAt } = JSON.parse(raw);
    if (!token) return null;
    if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
      limpiarAdminSession();
      return null;
    }
    return token;
  } catch {
    return null;
  }
};

export const haySesionAdminVigente = () => obtenerAdminToken() !== null;
