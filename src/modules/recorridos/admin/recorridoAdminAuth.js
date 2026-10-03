// Sesión administrativa del módulo de Monitoreo de Recorridos.
// Guarda ÚNICAMENTE el admin_token devuelto por
// recorrido_admin_iniciar_desde_superadmin y su expiración — nunca una
// contraseña (no existe ninguna propia: el acceso se deriva por puente desde
// la sesión Superadmin ya vigente, ver recorridoAdminService.js).
// Clave de sessionStorage propia, separada de la de Asistencia
// (asistencia_admin_session_v1) y de currentUser (localStorage): cerrar la
// pestaña también cierra esta sesión.

const ADMIN_SESSION_KEY = "recorrido_admin_session_v1";

export const guardarAdminSession = ({ token, expiresAt }) => {
  try {
    sessionStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify({ token, expiresAt }));
  } catch {
    // no crítico: en el peor caso se vuelve a pedir el puente en la próxima llamada
  }
};

export const limpiarAdminSession = () => {
  try {
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
  } catch {
    // no crítico
  }
};

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
