// ======================= VALIDACIÓN Y NORMALIZACIÓN DE TELÉFONOS =======================
//
// Formato canónico almacenado en Supabase:  +595981123456
// Formato para mostrar en UI:               +595 981 123 456
// Formato para WhatsApp (wa.me):            595981123456  (sin + ni espacios)
//
// Paraguay mobile: prefijo 9XX (Tigo, Personal, Claro, etc.)
// Longitud estándar: 9 dígitos locales (sin 0), e.g. 981123456

/**
 * Extrae solo los dígitos de un string.
 */
const onlyDigits = (value) => String(value ?? "").replace(/\D/g, "");

/**
 * Normaliza un número de teléfono móvil paraguayo al formato canónico +595XXXXXXXXX.
 *
 * Acepta:
 *   - +595981123456
 *   - 595981123456
 *   - 0981123456
 *   - 981123456
 *
 * Retorna:
 *   - "+595981123456"  si el número es válido
 *   - null             si el número no es un móvil paraguayo válido
 */
export const normalizeParaguayMobile = (value) => {
  const digits = onlyDigits(value);

  let local; // 9 dígitos sin el 0 inicial, e.g. "981123456"

  if (digits.startsWith("595")) {
    // Formato internacional con o sin +: 595981123456
    local = digits.slice(3);
  } else if (digits.startsWith("0")) {
    // Formato local con 0: 0981123456
    local = digits.slice(1);
  } else {
    // Sin prefijo: 981123456
    local = digits;
  }

  // Validar: 9 dígitos, debe empezar con 9 (móviles paraguayos)
  if (local.length !== 9 || !local.startsWith("9")) {
    return null;
  }

  return `+595${local}`;
};

/**
 * Retorna solo los dígitos internacionales, sin el signo +, para usar en wa.me.
 *
 * Ejemplo:
 *   "+595981123456" → "595981123456"
 *   "0981123456"    → "595981123456"
 *   "9981123456"    → null  (10 dígitos → inválido)
 *
 * @param {string} value
 * @returns {string|null}
 */
export const toWhatsAppNumber = (value) => {
  const canonical = normalizeParaguayMobile(value);
  if (!canonical) return null;
  // Eliminar el "+" inicial
  return canonical.slice(1); // "595981123456"
};

/**
 * Construye la URL de wa.me para el número dado.
 *
 * Ejemplos:
 *   buildWhatsAppUrl("+595981123456")
 *     → "https://wa.me/595981123456"
 *
 *   buildWhatsAppUrl("0981123456", "Hola, te invitamos!")
 *     → "https://wa.me/595981123456?text=Hola%2C%20te%20invitamos!"
 *
 * @param {string} value   - Número en cualquier formato soportado por normalizeParaguayMobile
 * @param {string} message - Mensaje pre-relleno (opcional)
 * @returns {string|null}  - URL lista para abrir, o null si el número es inválido
 */
export const buildWhatsAppUrl = (value, message = "") => {
  const waNumber = toWhatsAppNumber(value);
  if (!waNumber) return null;

  const base = `https://wa.me/${waNumber}`;
  const trimmedMessage = String(message).trim();
  if (!trimmedMessage) return base;

  return `${base}?text=${encodeURIComponent(trimmedMessage)}`;
};

/**
 * Formatea un número al formato de display: +595 981 123 456
 *
 * Retorna el valor original si no es un número válido (para no romper UI).
 *
 * @param {string} value
 * @returns {string}
 */
export const formatParaguayMobile = (value) => {
  const canonical = normalizeParaguayMobile(value);
  if (!canonical) return String(value ?? "");
  // "+595" + 3 dígitos + " " + 3 dígitos + " " + 3 dígitos
  const local = canonical.slice(4); // "981123456"
  return `+595 ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
};
