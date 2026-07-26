// ======================= BÚSQUEDA: NORMALIZACIÓN Y MATCHING COMPARTIDO =======================
// Usado tanto por la búsqueda interna del árbol (Dashboard.jsx) como por la tabla de
// Vista por seccional (VistaSeccional.jsx), para no duplicar la lógica de comparación
// de nombre/apellido/CI/teléfono en dos lugares.

// Minúsculas, sin diacríticos, espacios colapsados — para nombre/apellido.
// Deliberadamente NO toca dígitos ni separadores: la copia normalizada para CI se
// calcula aparte (soloDigitosCI), conservando la consulta original para nombre/teléfono.
export const normalizeTexto = (text) =>
  (text || "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

// Solo dígitos, sin importar puntos/espacios/guiones: "4.630.621", "4 630 621" y
// "4-630-621" deben comparar igual que "4630621".
export const soloDigitosCI = (v) => String(v ?? "").replace(/\D/g, "");

// Dígitos del teléfono sin '+', sin código de país (595) ni el '0' local, para que
// "0981123456", "981123456" y "+595981123456" matcheen indistintamente.
export const soloDigitosTelefono = (v) => {
  let d = String(v ?? "").replace(/\D/g, "");
  if (d.startsWith("595")) d = d.slice(3);
  else if (d.startsWith("0")) d = d.slice(1);
  return d;
};

export const tokenizarBusqueda = (query) => {
  const q = normalizeTexto(query);
  return q ? q.split(" ").filter(Boolean) : [];
};

// ¿La consulta completa es SOLO una CI formateada (dígitos + puntos/espacios/guiones),
// sin ninguna letra? Ej.: "4630621", "4.630.621", "4 630 621", "4-630-621" -> true;
// "Ana 4.630.621" -> false (mezcla nombre y CI, no debe tratarse como CI completa).
const esConsultaSoloCI = (query) => {
  const sinDigitosNiSeparadoresDeCI = String(query ?? "").replace(/[\d.\-\s]/g, "");
  return sinDigitosNiSeparadoresDeCI.length === 0;
};

// persona: objeto con (al menos) nombre, apellido, ci, telefono.
// rawQuery: la consulta TAL COMO la escribió el usuario (sin normalizar) — se usa una
// copia normalizada solo para comparar CI; nombre/apellido/teléfono siguen su propia
// normalización ya existente.
export const personaCoincideConsulta = (persona, rawQuery) => {
  const tokens = tokenizarBusqueda(rawQuery);
  if (!tokens.length) return true;

  const ciDigits = soloDigitosCI(persona?.ci);

  // CI: solo cuando la consulta ENTERA es una CI formateada (sin letras) se compara
  // contra el CI completo, para soportar "4630621", "4.630.621", "4 630 621" y
  // "4-630-621" indistintamente. Si la consulta mezcla texto y números (ej.
  // "Ana 4.630.621"), no se usa este atajo: cada palabra debe matchear algo por sí
  // misma más abajo (evita que el fragmento numérico matchee solo por los dígitos
  // sin que el nombre también coincida).
  if (esConsultaSoloCI(rawQuery)) {
    const queryDigitsCI = soloDigitosCI(rawQuery);
    if (queryDigitsCI.length > 0 && ciDigits.includes(queryDigitsCI)) return true;
  }

  // Nombre/apellido/teléfono: AND entre palabras (tokens), como ya funcionaba.
  const nombre = normalizeTexto(persona?.nombre);
  const apellido = normalizeTexto(persona?.apellido);
  const nombreCompleto = normalizeTexto(`${persona?.nombre || ""} ${persona?.apellido || ""}`);
  const apellidoNombre = normalizeTexto(`${persona?.apellido || ""} ${persona?.nombre || ""}`);
  const telDigits = soloDigitosTelefono(persona?.telefono);

  return tokens.every((t) => {
    const tDigitsTel = soloDigitosTelefono(t);
    const tDigitsCI = soloDigitosCI(t);
    return (
      nombre.includes(t) ||
      apellido.includes(t) ||
      nombreCompleto.includes(t) ||
      apellidoNombre.includes(t) ||
      (tDigitsTel.length > 0 && telDigits.includes(tDigitsTel)) ||
      (tDigitsCI.length > 0 && ciDigits.includes(tDigitsCI))
    );
  });
};
