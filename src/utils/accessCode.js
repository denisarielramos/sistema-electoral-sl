// ======================= GENERADOR DE CÓDIGO DE ACCESO =======================

export const generarAccessCode = (length = 8) => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.getRandomValues) {
    throw new Error("No hay un generador criptográfico seguro disponible en este navegador.");
  }

  const values = new Uint32Array(length);
  cryptoApi.getRandomValues(values);

  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(values[i] % chars.length);
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
 * @throws {Error} si falla la verificación o no encuentra un código único en 10 intentos
 */
export const generarAccessCodeUnico = async (supabase, length = 8) => {
  const MAX_INTENTOS = 10;

  for (let i = 0; i < MAX_INTENTOS; i++) {
    const code = generarAccessCode(length);

    // Verificar en las tres tablas en paralelo. Ante cualquier error de lectura
    // se aborta: nunca se asume que un código está libre si Supabase no pudo comprobarlo.
    const resultados = await Promise.all([
      supabase.from("dirigentes").select("login_code").eq("login_code", code).maybeSingle(),
      supabase.from("coordinadores").select("login_code").eq("login_code", code).maybeSingle(),
      supabase.from("subcoordinadores").select("login_code").eq("login_code", code).maybeSingle(),
    ]);

    const error = resultados.find((resultado) => resultado.error)?.error;
    if (error) {
      throw new Error(`No se pudo verificar la unicidad del código de acceso: ${error.message}`);
    }

    if (resultados.every((resultado) => !resultado.data)) return code;
  }

  throw new Error(
    `No se pudo generar un código de acceso único después de ${MAX_INTENTOS} intentos.`
  );
};
