// ======================= IDENTIDAD DE DISPOSITIVO (módulo Asistencia) =======================
// El UUID crudo se guarda SOLO en localStorage, nunca se envía a Supabase.
// Lo único que viaja a las RPC es su hash SHA-256 en hexadecimal (p_device_hash).
// Esto evita exponer un identificador estable y reversible del dispositivo.

const DEVICE_ID_KEY = "asistencia_device_id_v1";

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

// ======================= BLOQUEO LOCAL POST-ÉXITO (solo UX) =======================
// La fuente de verdad real es siempre el backend (codigo DISPOSITIVO_YA_REGISTRADO).
// Esta marca local solo evita hacerle repetir el flujo completo a alguien que ya
// registró su asistencia con este mismo dispositivo y navegador.
const registradoKey = (slug) => `asistencia_registrado_v1::${slug}`;

export const marcarRegistradoLocalmente = (slug) => {
  try {
    localStorage.setItem(registradoKey(slug), "1");
  } catch {
    // localStorage no disponible (modo privado, cuota, etc.): no es crítico, la RPC sigue validando.
  }
};

export const yaRegistradoLocalmente = (slug) => {
  try {
    return localStorage.getItem(registradoKey(slug)) === "1";
  } catch {
    return false;
  }
};
