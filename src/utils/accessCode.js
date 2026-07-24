// ======================= GENERADOR DE CÓDIGO DE ACCESO =======================

export const generarAccessCode = (length = 8) => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

/**
 * Genera un código de acceso único verificando que no exista
 * en las tablas dirigentes, coordinadores ni subcoordinadores.
 *
 * @param {Object} supabase - cliente Supabase
 * @param {number} length   - longitud del código (por defecto 8)
 * @returns {Promise<string>} código único
 * @throws {Error} si no puede encontrar un código único en 10 intentos
 */
export const generarAccessCodeUnico = async (supabase, length = 8) => {
  const MAX_INTENTOS = 10;

  for (let i = 0; i < MAX_INTENTOS; i++) {
    const code = generarAccessCode(length);

    // Verificar en las tres tablas en paralelo
    const [{ data: d1 }, { data: d2 }, { data: d3 }] = await Promise.all([
      supabase.from("dirigentes").select("login_code").eq("login_code", code).maybeSingle(),
      supabase.from("coordinadores").select("login_code").eq("login_code", code).maybeSingle(),
      supabase.from("subcoordinadores").select("login_code").eq("login_code", code).maybeSingle(),
    ]);

    if (!d1 && !d2 && !d3) return code; // código libre
  }

  throw new Error(
    `No se pudo generar un código de acceso único después de ${MAX_INTENTOS} intentos.`
  );
};
