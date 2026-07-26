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

const COLUMNS = [
  { header: "Nivel o rol", key: "nivel", width: 16 },
  { header: "Nombre", key: "nombre", width: 18 },
  { header: "Apellido", key: "apellido", width: 18 },
  { header: "CI", key: "ci", width: 12 },
  { header: "Teléfono", key: "telefono", width: 16 },
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

// ======================= HELPERS =======================
const str = (v) => (v === null || v === undefined ? "" : String(v));

const boolLabel = (v) => (typeof v === "boolean" ? (v ? "Sí" : "No") : "");

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
// Requisito: una misma persona no debe contarse ni listarse dos veces aunque
// aparezca repetida dentro de un mismo array (estructuras derivadas/conteos auxiliares).
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

// ======================= FILAS (a partir de arrays ya deduplicados) =======================
const buildRows = ({ dirigentes = [], coordinadores = [], subcoordinadores = [], votantes = [] }) => {
  const rows = [];

  const push = (role, persona) => {
    const direccion = persona.direccion_override || persona.direccion || "";
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
      ci: str(normalizeCILocal(persona.ci)),
      telefono: str(persona.telefono),
      seccional: str(persona.seccional),
      local: str(persona.local_votacion),
      mesa: str(persona.mesa),
      orden: str(persona.orden),
      terceraEdad: boolLabel(persona.tercera_edad),
      votoConfirmado,
      asignadoPor: str(persona.asignado_por_nombre),
      asignadoPorRol: str(persona.asignado_por_rol),
      direccion: str(direccion),
    });
  };

  dirigentes.forEach((d) => push("dirigente", d));
  coordinadores.forEach((c) => push("coordinador", c));
  subcoordinadores.forEach((s) => push("subcoordinador", s));
  votantes.forEach((v) => push("votante", v));

  return rows;
};

// ======================= TOTALES (misma convención que estadisticasService: =======================
// dirigentes y coordinadores se cuentan como confirmados automáticamente porque no
// tienen columna propia de confirmación; subcoordinadores usan `confirmado`; votantes
// usan `voto_confirmado`.
const buildTotales = ({ dirigentes = [], coordinadores = [], subcoordinadores = [], votantes = [] }) => {
  const totalDirigentes = dirigentes.length;
  const totalCoordinadores = coordinadores.length;
  const totalSubcoordinadores = subcoordinadores.length;
  const totalVotantes = votantes.length;

  const subsConfirmados = subcoordinadores.filter((s) => s.confirmado === true).length;
  const votosConfirmados = votantes.filter((v) => v.voto_confirmado === true).length;

  const totalConfirmable = totalDirigentes + totalCoordinadores + totalSubcoordinadores + totalVotantes;
  const totalConfirmados = totalDirigentes + totalCoordinadores + subsConfirmados + votosConfirmados;
  const porcentaje = totalConfirmable > 0 ? Math.round((totalConfirmados / totalConfirmable) * 100) : 0;

  return { totalDirigentes, totalCoordinadores, totalSubcoordinadores, totalVotantes, totalConfirmados, porcentaje };
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
export const generarExcelEstructura = async ({
  prefix,
  persona = null,
  roles = ["dirigente", "coordinador", "subcoordinador", "votante"],
  dirigentes = [],
  coordinadores = [],
  subcoordinadores = [],
  votantes = [],
}) => {
  // Dedup por rol + CI normalizada antes de contar o listar — una misma persona
  // no debe duplicarse aunque el array recibido la traiga repetida.
  const scoped = {
    dirigentes: dedupeByCI(dirigentes),
    coordinadores: dedupeByCI(coordinadores),
    subcoordinadores: dedupeByCI(subcoordinadores),
    votantes: dedupeByCI(votantes),
  };

  const rows = buildRows(scoped);
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
  resumen.addRow({ metrica: "Total de votos confirmados", valor: totales.totalConfirmados });
  resumen.addRow({ metrica: "Porcentaje de confirmación", valor: `${totales.porcentaje}%` });
  resumen.addRow({ metrica: "Generado", valor: new Date().toLocaleString("es-PY") });

  styleHeaderRow(resumen.getRow(1));
  resumen.views = [{ state: "frozen", ySplit: 1 }];
  resumen.autoFilter = { from: "A1", to: "B1" };

  // ---- Hoja Estructura ----
  const estructuraSheet = workbook.addWorksheet("Estructura");
  estructuraSheet.columns = COLUMNS;
  rows.forEach((row) => estructuraSheet.addRow(row));

  styleHeaderRow(estructuraSheet.getRow(1));
  estructuraSheet.views = [{ state: "frozen", ySplit: 1 }];
  estructuraSheet.autoFilter = { from: "A1", to: `${columnLetter(COLUMNS.length)}1` };

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  downloadBlob(blob, buildExcelFileName(prefix, persona));
};
