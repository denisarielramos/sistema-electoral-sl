// ======================= IDENTIDAD DE DISPOSITIVO (módulo Recorridos) =======================
// Mismo patrón que src/modules/asistencia/asistenciaDevice.js, pero con su propia
// clave de localStorage — deliberadamente NO se reutiliza el device id de Asistencia,
// son identidades de dispositivo independientes para módulos independientes.
// El UUID crudo vive SOLO en localStorage. A Supabase se envía únicamente su hash
// SHA-256 en hexadecimal (p_device_hash); el UUID crudo nunca viaja a la red.

const DEVICE_ID_KEY = "recorrido_device_id_v1";

export const getOrCreateDeviceId = () => {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
};

export const hashDeviceId = async (rawId) => {
  const bytes = new TextEncoder().encode(rawId);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

export const getDeviceHash = async () => hashDeviceId(getOrCreateDeviceId());
