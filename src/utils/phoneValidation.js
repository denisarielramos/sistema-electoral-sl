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

// ======================= SANITIZE INPUT (durante la escritura) =======================

/**
 * Limpia y limita la entrada de un campo de teléfono paraguayo mientras el usuario escribe.
 *
 * Reglas:
 *  - Solo permite: dígitos, espacios, guiones y un '+' únicamente al inicio.
 *  - Si comienza con '+595' o '595': máximo 12 dígitos (antes del + y espacios).
 *  - Si comienza con '0': máximo 10 dígitos.
 *  - Caso sin prefijo (empieza con 9): trata como local, máximo 9 dígitos.
 *  - Ignora todo carácter adicional una vez alcanzado el límite.
 *  - No permite letras ni más de un '+'.
 *
 * @param {string} value - Valor crudo del input
 * @returns {string}     - Valor sanitizado
 */
export const sanitizeParaguayPhoneInput = (value) => {
  const raw = String(value ?? "");

  // 1. Conservar el '+' solo al inicio; eliminar cualquier '+' en otra posición
  const hasLeadingPlus = raw.startsWith("+");
  // Eliminar todos los caracteres no permitidos (mantener dígitos, espacios, guiones)
  let clean = raw.replace(/[^\d\s-]/g, "");

  // 2. Determinar límite de dígitos según prefijo
  const digits = clean.replace(/\D/g, "");
  let maxDigits;
  if (hasLeadingPlus && digits.startsWith("595")) {
    maxDigits = 12; // +595 + 9 dígitos locales
  } else if (digits.startsWith("595")) {
    maxDigits = 12;
  } else if (digits.startsWith("0")) {
    maxDigits = 10; // 0 + 9 dígitos locales
  } else if (digits.startsWith("9")) {
    maxDigits = 9; // solo los 9 dígitos locales
  } else {
    // Prefijo desconocido, límite conservador
    maxDigits = 12;
  }

  // 3. Truncar si hay demasiados dígitos
  if (digits.length > maxDigits) {
    // Reconstruir el string conservando el '+' y limitando los dígitos
    let kept = 0;
    let truncated = "";
    for (const ch of clean) {
      if (/\d/.test(ch)) {
        if (kept >= maxDigits) break;
        kept++;
      }
      truncated += ch;
    }
    clean = truncated;
  }

  // 4. Formateo visual automático
  const finalDigits = clean.replace(/\D/g, "");
  if (hasLeadingPlus && finalDigits.startsWith("595") && finalDigits.length >= 4) {
    const local = finalDigits.slice(3); // dígitos tras "595"
    const parts = [];
    if (local.length > 0) parts.push(local.slice(0, 3));
    if (local.length > 3) parts.push(local.slice(3, 6));
    if (local.length > 6) parts.push(local.slice(6, 9));
    return "+595" + (parts.length ? " " + parts.join(" ") : "");
  }
  if (finalDigits.startsWith("0") && finalDigits.length >= 2) {
    const local = finalDigits.slice(1); // dígitos tras "0"
    const parts = [];
    if (local.length > 0) parts.push(finalDigits.slice(0, 4)); // "0981"
    if (local.length > 3) parts.push(local.slice(3, 6));
    if (local.length > 6) parts.push(local.slice(6, 9));
    return parts.join(" ");
  }

  // Sin prefijo conocido: devolver limpio sin formato
  return (hasLeadingPlus ? "+" : "") + clean;
};

// ======================= VALIDATE (al guardar) =======================

/**
 * Valida un número de teléfono móvil paraguayo en el momento de guardar.
 *
 * @param {string} value
 * @returns {{ valid: boolean, normalized: string|null, error: string|null }}
 *   - normalized: '+595XXXXXXXXX' si válido, null si no
 *   - error: mensaje de error para mostrar en UI, null si válido
 */
export const validateParaguayPhone = (value) => {
  const EMPTY_ERROR = "El teléfono es obligatorio.";
  const FORMAT_ERROR = "El celular debe comenzar con 09 o +595 9.";
  const INCOMPLETE_ERROR = "Ingrese un celular paraguayo completo: 0981 123 456";

  const raw = String(value ?? "").trim();
  if (!raw || raw === "+595" || raw === "0") {
    return { valid: false, normalized: null, error: EMPTY_ERROR };
  }

  const digits = raw.replace(/\D/g, "");

  // Determinar formato y validar longitud + prefijo
  let local;
  if (digits.startsWith("595")) {
    local = digits.slice(3); // tras "595"
  } else if (digits.startsWith("0")) {
    local = digits.slice(1); // tras "0"
  } else if (digits.startsWith("9")) {
    local = digits;
  } else {
    return { valid: false, normalized: null, error: FORMAT_ERROR };
  }

  // El primer dígito del local debe ser 9 (móviles paraguayos)
  if (!local.startsWith("9")) {
    return { valid: false, normalized: null, error: FORMAT_ERROR };
  }

  // Verificar longitud correcta (exactamente 9 dígitos locales)
  if (local.length < 9) {
    return { valid: false, normalized: null, error: INCOMPLETE_ERROR };
  }
  if (local.length > 9) {
    return { valid: false, normalized: null, error: FORMAT_ERROR };
  }

  return { valid: true, normalized: `+595${local}`, error: null };
};

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
