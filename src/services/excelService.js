// ======================= SERVICIO DE EXPORTACIÓN A EXCEL =======================
// Genera archivos .xlsx reales (ExcelJS) a partir de la estructura ya enriquecida
// en memoria (padronMap + estructura). No realiza consultas a Supabase.
//
// Este módulo se importa dinámicamente desde Dashboard.jsx (import() dentro del
// handler de click) para que ExcelJS no forme parte del bundle inicial.

import ExcelJS from "exceljs";

const ROLE_LABELS = {
  dirigente: "Dirigente",
  coordinador: "Coordinador",
  subcoordinador: "Subcoordinador",
  votante: "Votante",
};

const HEADER_FILL = "FFB91C1C"; // brand-700 (#b91c1c), mismo tono que los encabezados del PDF
const HEADER_FONT = "FFFFFFFF";
const TEXT_FORMAT = "@"; // fuerza formato de texto (sin notación científica, sin perder '+' ni ceros iniciales)

// "Tercera edad" (key terceraEdad) se agrega condicionalmente en buildColumns —
// solo cuando quien descarga es superadmin (ver incluirTerceraEdad en
// generarExcelEstructura). Nunca aparece en el Excel de dirigente/coordinador/
// subcoordinador, aunque buildRows siempre calcule ese valor: una columna sin
// definir en worksheet.columns simplemente no se escribe en la hoja.
const COLUMNS = [
  { header: "Nivel o rol", key: "nivel", width: 16 },
  { header: "Nombre", key: "nombre", width: 18 },
  { header: "Apellido", key: "apellido", width: 18 },
  { header: "CI", key: "ci", width: 12, style: { numFmt: TEXT_FORMAT } },
  { header: "Teléfono", key: "telefono", width: 16, style: { numFmt: TEXT_FORMAT } },
  { header: "Seccional", key: "seccional", width: 12 },
  { header: "Local de votación", key: "local", width: 28 },
  { header: "Mesa", key: "mesa", width: 10 },
  { header: "Orden", key: "orden", width: 10 },
  { header: "Tercera edad", key: "terceraEdad", width: 13 },
  { header: "Voto confirmado", key: "votoConfirmado", width: 15 },
  { header: "Asignado por", key: "asignadoPor", width: 22 },
  { header: "Rol de quien lo asignó", key: "asignadoPorRol", width: 20 },
  { header: "Dirección o ubicación", key: "direccion", width: 32 },
];

const buildColumns = (incluirTerceraEdad) =>
  incluirTerceraEdad ? COLUMNS : COLUMNS.filter((c) => c.key !== "terceraEdad");

// ======================= HELPERS =======================
// str(): convierte a texto sin inventar valores — null/undefined -> "" (celda vacía).
// Nunca usar '||' para esto: perdería 0 o false como valores válidos en otros campos.
const str = (v) => (v === null || v === undefined ? "" : String(v));

// boolLabel(): true -> "Sí", false -> "No", cualquier otra cosa (null/undefined) -> "" (no inventa "No").
const boolLabel = (v) => {
  if (v === true) return "Sí";
  if (v === false) return "No";
  return "";
};

const normalizeCILocal = (ci) => String(ci ?? "").replace(/\D/g, "");

const slugify = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const columnLetter = (num) => {
  let letters = "";
  let n = num;
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - rem) / 26);
  }
  return letters;
};

// Nombre de archivo seguro: prefijo-nombre-apellido-ci.xlsx (o prefijo.xlsx si no hay persona)
export const buildExcelFileName = (prefix, persona = null) => {
  if (!persona) return `${prefix}.xlsx`;
  const nombreSlug = slugify(`${persona.nombre || ""} ${persona.apellido || ""}`.trim()) || "sn";
  const ci = normalizeCILocal(persona.ci) || "sn";
  return `${prefix}-${nombreSlug}-${ci}.xlsx`;
};

// ======================= DEDUP POR ROL + CI NORMALIZADA =======================
// Una misma persona no debe contarse ni listarse dos veces aunque aparezca repetida
// dentro de un mismo array (estructuras derivadas/conteos auxiliares). La dedup es
// por rol: una misma CI puede existir legítimamente con roles distintos.
const dedupeByCI = (list = []) => {
  const seen = new Set();
  const out = [];
  for (const persona of list) {
    if (!persona) continue;
    const ci = normalizeCILocal(persona.ci);
    if (seen.has(ci)) continue;
    seen.add(ci);
    out.push(persona);
  }
  return out;
};

// ======================= ENRIQUECIMIENTO ÚNICO (persona + padrón) =======================
// Único lugar donde se combinan los datos de la tabla de rol con los del padrón.
// - nombre/apellido: prevalece el propio de la tabla de rol si existe (p. ej. dirigente
//   externo, que no está en el padrón); si no existe, se completa con el padrón.
// - seccional/local_votacion/mesa/orden: siempre provienen del padrón (ninguna tabla de
//   rol los almacena); si la persona no está en el padrón, quedan vacíos.
// - teléfono/dirección/tercera_edad/voto_confirmado/confirmado/asignado_por*: siempre
//   provienen de la tabla de rol (el padrón no tiene estas columnas).
// Se usa '??' en todos los casos para no descartar valores válidos como 0 o false.
const enrichPersona = (persona, padronMap) => {
  const ci = normalizeCILocal(persona?.ci);
  const padronPersona = padronMap instanceof Map ? padronMap.get(ci) : undefined;

  return {
    ci,
    nombre: persona?.nombre ?? padronPersona?.nombre ?? "",
    apellido: persona?.apellido ?? padronPersona?.apellido ?? "",
    seccional: persona?.seccional ?? padronPersona?.seccional ?? "",
    local_votacion: persona?.local_votacion ?? padronPersona?.local_votacion ?? "",
    mesa: persona?.mesa ?? padronPersona?.mesa ?? "",
    orden: persona?.orden ?? padronPersona?.orden ?? "",
    telefono: persona?.telefono ?? "",
    direccion: persona?.direccion_override ?? padronPersona?.direccion ?? "",
    tercera_edad: persona?.tercera_edad ?? null,
    voto_confirmado: persona?.voto_confirmado ?? null,
    confirmado: persona?.confirmado ?? null,
    asignado_por_nombre: persona?.asignado_por_nombre ?? "",
    asignado_por_rol: persona?.asignado_por_rol ?? "",
  };
};

// ======================= FILAS (enriquece cada persona antes de mapear columnas) =======================
const buildRows = ({ dirigentes = [], coordinadores = [], subcoordinadores = [], votantes = [] }, padronMap) => {
  const rows = [];

  const push = (role, rawPersona) => {
    const persona = enrichPersona(rawPersona, padronMap);
    const votoConfirmado =
      role === "votante"
        ? boolLabel(persona.voto_confirmado)
        : role === "subcoordinador"
        ? boolLabel(persona.confirmado)
        : "";

    rows.push({
      nivel: ROLE_LABELS[role],
      nombre: str(persona.nombre),
      apellido: str(persona.apellido),
      ci: str(persona.ci),
      telefono: str(persona.telefono),
      seccional: str(persona.seccional),
      local: str(persona.local_votacion),
      mesa: str(persona.mesa),
      orden: str(persona.orden),
      terceraEdad: boolLabel(persona.tercera_edad),
      votoConfirmado,
      asignadoPor: str(persona.asignado_por_nombre),
      asignadoPorRol: str(persona.asignado_por_rol),
      direccion: str(persona.direccion),
    });
  };

  dirigentes.forEach((d) => push("dirigente", d));
  coordinadores.forEach((c) => push("coordinador", c));
  subcoordinadores.forEach((s) => push("subcoordinador", s));
  votantes.forEach((v) => push("votante", v));

  return rows;
};

// ======================= TOTALES =======================
// "Voto confirmado" se refiere exclusivamente a votantes (voto_confirmado === true).
// Dirigentes, coordinadores y subcoordinadores NO se cuentan como votos confirmados.
const buildTotales = ({ dirigentes = [], coordinadores = [], subcoordinadores = [], votantes = [] }) => {
  const totalDirigentes = dirigentes.length;
  const totalCoordinadores = coordinadores.length;
  const totalSubcoordinadores = subcoordinadores.length;
  const totalVotantes = votantes.length;

  const votosConfirmados = votantes.filter((v) => v?.voto_confirmado === true).length;
  const porcentaje = totalVotantes > 0 ? Math.round((votosConfirmados / totalVotantes) * 100) : 0;

  return { totalDirigentes, totalCoordinadores, totalSubcoordinadores, totalVotantes, votosConfirmados, porcentaje };
};

// ======================= ESTILOS =======================
const styleHeaderRow = (row) => {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: HEADER_FONT } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.alignment = { vertical: "middle", horizontal: "left" };
  });
};

// ======================= DESCARGA EN NAVEGADOR =======================
const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// ======================= GENERAR Y DESCARGAR =======================
// prefix: "estructura-electoral-completa" | "estructura-dirigente" | "estructura-coordinador" | "estructura-subcoordinador"
// persona: entidad dueña del export (para el nombre de archivo); null en el export global del superadmin
// roles: subconjunto de ["dirigente","coordinador","subcoordinador","votante"] — qué totales mostrar en "Resumen"
// dirigentes/coordinadores/subcoordinadores/votantes: arrays ya filtrados por el alcance jerárquico del usuario
// padronMap: Map<ciNormalizada, registroPadron> ya cargado en memoria (IndexedDB/estado) — no se consulta Supabase
// incluirTerceraEdad: true únicamente cuando quien descarga es superadmin (decidido
// por el llamador según currentUser.role — ver Dashboard.jsx). Por defecto false: si
// algún llamador olvida pasarlo, el dato queda afuera en vez de filtrarse por error.
export const generarExcelEstructura = async ({
  prefix,
  persona = null,
  roles = ["dirigente", "coordinador", "subcoordinador", "votante"],
  dirigentes = [],
  coordinadores = [],
  subcoordinadores = [],
  votantes = [],
  padronMap = null,
  incluirTerceraEdad = false,
}) => {
  // Dedup por rol + CI normalizada antes de contar o listar.
  const scoped = {
    dirigentes: dedupeByCI(dirigentes),
    coordinadores: dedupeByCI(coordinadores),
    subcoordinadores: dedupeByCI(subcoordinadores),
    votantes: dedupeByCI(votantes),
  };

  const rows = buildRows(scoped, padronMap);
  const totales = buildTotales(scoped);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Sistema Electoral";
  workbook.created = new Date();

  // ---- Hoja Resumen ----
  const resumen = workbook.addWorksheet("Resumen");
  resumen.columns = [
    { header: "Métrica", key: "metrica", width: 30 },
    { header: "Valor", key: "valor", width: 16 },
  ];

  if (roles.includes("dirigente")) resumen.addRow({ metrica: "Total de dirigentes", valor: totales.totalDirigentes });
  if (roles.includes("coordinador")) resumen.addRow({ metrica: "Total de coordinadores", valor: totales.totalCoordinadores });
  if (roles.includes("subcoordinador")) resumen.addRow({ metrica: "Total de subcoordinadores", valor: totales.totalSubcoordinadores });
  if (roles.includes("votante")) resumen.addRow({ metrica: "Total de votantes", valor: totales.totalVotantes });
  resumen.addRow({ metrica: "Total de votos confirmados", valor: totales.votosConfirmados });
  resumen.addRow({ metrica: "Porcentaje de confirmación", valor: `${totales.porcentaje}%` });
  resumen.addRow({ metrica: "Generado", valor: new Date().toLocaleString("es-PY") });

  styleHeaderRow(resumen.getRow(1));
  resumen.views = [{ state: "frozen", ySplit: 1 }];
  resumen.autoFilter = { from: "A1", to: "B1" };

  // ---- Hoja Estructura ----
  const columns = buildColumns(incluirTerceraEdad);
  const estructuraSheet = workbook.addWorksheet("Estructura");
  estructuraSheet.columns = columns;
  rows.forEach((row) => estructuraSheet.addRow(row));

  styleHeaderRow(estructuraSheet.getRow(1));
  estructuraSheet.views = [{ state: "frozen", ySplit: 1 }];
  estructuraSheet.autoFilter = { from: "A1", to: `${columnLetter(columns.length)}1` };

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  downloadBlob(blob, buildExcelFileName(prefix, persona));
};

// ======================= EXPORTACIÓN: BITÁCORA DE VISITAS =======================
// Reutiliza el mismo servicio/mecanismo (ExcelJS, mismos helpers de estilo y
// descarga) para exportar el resultado YA FILTRADO de la bitácora de visitas del
// módulo de mapeo territorial (src/components/mapeo). No hace red — recibe las filas
// ya cargadas/filtradas en memoria (mismo patrón que generarExcelEstructura).

const RESULTADO_LABELS = {
  confirmada: "Confirmada",
  fuera_de_radio: "Fuera de radio",
  pendiente: "Pendiente",
  cancelada: "Cancelada",
  error_gps: "Error de GPS",
};

const ROL_LABELS_VISITA = {
  superadmin: "Superadmin",
  dirigente: "Dirigente",
  coordinador: "Coordinador",
  subcoordinador: "Subcoordinador",
};

const VISITAS_COLUMNS = [
  { header: "Familia / hogar", key: "familia", width: 22 },
  { header: "Dirección", key: "direccion", width: 30 },
  { header: "Votantes del hogar", key: "votantes", width: 34 },
  { header: "Visitante", key: "visitante", width: 22 },
  { header: "CI visitante", key: "visitanteCi", width: 12, style: { numFmt: TEXT_FORMAT } },
  { header: "Rol", key: "rol", width: 16 },
  { header: "Fecha y hora", key: "fechaHora", width: 20 },
  { header: "Precisión GPS", key: "precision", width: 14 },
  { header: "Distancia", key: "distancia", width: 12 },
  { header: "Radio utilizado", key: "radio", width: 14 },
  { header: "Estado", key: "estado", width: 16 },
  { header: "Observación", key: "observacion", width: 30 },
  { header: "Jerarquía responsable", key: "jerarquia", width: 32 },
];

// visitas: filas ya devueltas por mapeo_listar_visitas (con `votantes` embebido) y ya
// filtradas en la UI (búsqueda/filtros de la bitácora).
// resolverJerarquia: (visita) => string — arma el texto de jerarquía responsable
// (dirigente/coordinador/subcoordinador) a partir de estructura ya en memoria, para
// no acoplar este servicio al shape de estructuraHelpers.
// resolverNombreVisitante: (visita) => string — nombre completo de quien visitó,
// resuelto por ci+rol contra estructura en memoria (la bitácora solo trae CI/rol).
export const generarExcelVisitas = async (visitas = [], { resolverJerarquia, resolverNombreVisitante } = {}) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Sistema Electoral";
  workbook.created = new Date();

  const hoja = workbook.addWorksheet("Bitácora de visitas");
  hoja.columns = VISITAS_COLUMNS;

  visitas.forEach((visita) => {
    const votantesTexto = (visita.votantes || [])
      .map((v) => `${str(v.nombre)} ${str(v.apellido)}`.trim())
      .filter(Boolean)
      .join(", ");

    hoja.addRow({
      familia: str(visita.hogar_nombre_familia) || "Sin nombre de familia",
      direccion: str(visita.hogar_direccion),
      votantes: votantesTexto,
      visitante:
        typeof resolverNombreVisitante === "function"
          ? resolverNombreVisitante(visita)
          : str(visita.visitante_ci),
      visitanteCi: str(visita.visitante_ci),
      rol: ROL_LABELS_VISITA[visita.visitante_rol] || str(visita.visitante_rol),
      fechaHora: visita.fecha_hora ? new Date(visita.fecha_hora).toLocaleString("es-PY") : "",
      precision: visita.precision_gps !== null && visita.precision_gps !== undefined ? `±${Math.round(visita.precision_gps)} m` : "Sin dato",
      distancia: visita.distancia_metros !== null && visita.distancia_metros !== undefined ? `${Math.round(visita.distancia_metros)} m` : "Sin dato",
      radio: `${str(visita.radio_permitido_usado)} m`,
      estado: RESULTADO_LABELS[visita.resultado] || str(visita.resultado),
      observacion: str(visita.observacion),
      jerarquia: typeof resolverJerarquia === "function" ? resolverJerarquia(visita) : "",
    });
  });

  styleHeaderRow(hoja.getRow(1));
  hoja.views = [{ state: "frozen", ySplit: 1 }];
  hoja.autoFilter = { from: "A1", to: `${columnLetter(VISITAS_COLUMNS.length)}1` };

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  downloadBlob(blob, `bitacora-visitas-${new Date().toISOString().slice(0, 10)}.xlsx`);
};
