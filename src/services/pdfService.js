import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { normalizeCI } from "../utils/estructuraHelpers";

// ======================= CONSTANTS =======================
const PAGE_FORMAT = "a4";
const PAGE_ORIENTATION = "landscape";
const M = { top: 15, bottom: 15, left: 10, right: 10 };

// Brand colors matching app UI (tailwind.config.js)
const COLOR_BRAND      = [220, 38, 38];    // brand-600 #dc2626
const COLOR_BRAND_DARK = [185, 28, 28];    // brand-700 #b91c1c
const COLOR_TEXT       = [15, 23, 42];     // slate-900
const COLOR_MUTED      = [100, 116, 139];  // slate-500
const COLOR_LINE       = [220, 38, 38];    // brand-600 for separator
const COLOR_HEADER_BG  = [185, 28, 28];    // brand-700 for table headers
const COLOR_HEADER_TXT = [255, 255, 255];
const COLOR_ALT_ROW    = [254, 242, 242];  // brand-50 #fef2f2
const COLOR_GREEN_TXT  = [22, 163, 74];    // green-600 (app success)
const COLOR_RED_TXT    = [220, 38, 38];    // brand-600 (app danger)
const COLOR_SECTION_BG = [254, 226, 226];  // brand-100 #fee2e2

// ======================= HELPERS =======================
function fecha() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function str(v) { return v != null ? String(v) : ""; }
function name(p) { return `${str(p.nombre)} ${str(p.apellido)}`.trim() || "—"; }

// Load logo image as base64 for embedding in PDF
async function loadLogo() {
  try {
    const response = await fetch("/anr.png");
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

// ======================= HEADER =======================
// logoImg is optional - if provided, renders logo at top left
function addHeader(doc, reportType, userName, logoImg = null) {
  const pw = doc.internal.pageSize.getWidth();
  const logoW = 22;
  const logoH = 15; // approx aspect ratio

  // Logo at top left (if available)
  if (logoImg) {
    try {
      doc.addImage(logoImg, "PNG", M.left, M.top, logoW, logoH);
    } catch (e) {
      console.warn("Could not add logo to PDF:", e);
    }
  }

  // Centered main title (offset slightly right to account for logo)
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLOR_BRAND_DARK);
  doc.text("Jose Chechito Lopez - Concejal 2026", pw / 2, M.top + 8, { align: "center" });

  // Report type
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COLOR_MUTED);
  doc.text(reportType, pw / 2, M.top + 15, { align: "center" });

  // User name
  doc.setFontSize(9);
  doc.text(`Usuario: ${userName}`, pw / 2, M.top + 21, { align: "center" });

  // Date
  doc.text(`Fecha: ${fecha()}`, pw / 2, M.top + 27, { align: "center" });

  // Separator line using brand color
  doc.setDrawColor(...COLOR_BRAND);
  doc.setLineWidth(0.6);
  doc.line(M.left, M.top + 31, pw - M.right, M.top + 31);

  return M.top + 36;
}

// ======================= FOOTER =======================
function addFooterToAllPages(doc) {
  const pageCount = doc.internal.getNumberOfPages();
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...COLOR_MUTED);
    doc.text(
      `Pagina ${i} / ${pageCount}`,
      pw - M.right,
      ph - M.bottom + 8,
      { align: "right" }
    );
  }
}

// ======================= SECTION TITLE =======================
function sectionTitle(doc, text, y) {
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLOR_TEXT);
  doc.text(text, M.left, y);
  return y + 5;
}

// ======================= SUB SECTION TITLE =======================
function subSectionTitle(doc, text, y) {
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text(text, M.left, y);
  return y + 7;
}

// ======================= SUMMARY BOX =======================
function addSummaryBox(doc, startY, rows) {
  autoTable(doc, {
    startY,
    head: [["Metrica", "Valor"]],
    body: rows,
    margin: { left: M.left, right: M.right },
    tableWidth: 120,
    columnStyles: {
      0: { cellWidth: 85, fontStyle: "normal", textColor: COLOR_TEXT },
      1: { cellWidth: 35, fontStyle: "bold", halign: "right", textColor: COLOR_TEXT },
    },
    headStyles: {
      fillColor: COLOR_HEADER_BG,
      textColor: COLOR_HEADER_TXT,
      fontStyle: "bold",
      fontSize: 8,
      cellPadding: 3,
    },
    bodyStyles: { fontSize: 8, cellPadding: 3 },
    alternateRowStyles: { fillColor: COLOR_ALT_ROW },
  });
  return doc.lastAutoTable.finalY;
}

// ======================= VOTER TABLE =======================
const VOTER_COLUMNS = [
  { header: "Nombre y Apellido", dataKey: "nombre" },
  { header: "CI", dataKey: "ci" },
  { header: "Telefono", dataKey: "telefono" },
  { header: "Mesa", dataKey: "mesa" },
  { header: "Orden", dataKey: "orden" },
  { header: "Local de votacion", dataKey: "local" },
  { header: "Confirmado", dataKey: "confirmado" },
];

function addVoterTable(doc, startY, voters) {
  const body = voters.map((v) => ({
    nombre: name(v),
    ci: str(v.ci) || "—",
    telefono: str(v.telefono) || "—",
    mesa: str(v.mesa) || "—",
    orden: str(v.orden) || "—",
    local: str(v.local_votacion) || "—",
    confirmado: v.voto_confirmado ? "Si" : "No",
  }));

  autoTable(doc, {
    startY,
    columns: VOTER_COLUMNS,
    body,
    margin: { left: M.left, right: M.right },
    tableWidth: "auto",
    headStyles: {
      fillColor: COLOR_HEADER_BG,
      textColor: COLOR_HEADER_TXT,
      fontStyle: "bold",
      fontSize: 9,
      cellPadding: 3,
    },
    bodyStyles: {
      fontSize: 9,
      textColor: [0, 0, 0],
      cellPadding: 3,
      overflow: "linebreak",
    },
    columnStyles: {
      nombre: { cellWidth: 50 },
      local: { cellWidth: 50 },
    },
    alternateRowStyles: { fillColor: COLOR_ALT_ROW },
    rowPageBreak: "avoid",
    didParseCell: (data) => {
      if (data.column.dataKey === "confirmado" && data.section === "body") {
        const val = data.cell.raw;
        if (val === "Si") {
          data.cell.styles.textColor = COLOR_GREEN_TXT;
          data.cell.styles.fontStyle = "bold";
        } else {
          data.cell.styles.textColor = COLOR_RED_TXT;
          data.cell.styles.fontStyle = "bold";
        }
      }
    },
  });

  return doc.lastAutoTable.finalY;
}

// ======================= SUB TABLE =======================
function addSubTable(doc, startY, subs, estructura) {
  const body = subs.map((s) => {
    const subCI = normalizeCI(s.ci);
    const voters = (estructura.votantes || []).filter(
      (v) => normalizeCI(v.asignado_por) === subCI
    );
    const confirmed = voters.filter((v) => v.voto_confirmado === true).length;
    return {
      nombre: name(s),
      ci: str(s.ci) || "—",
      telefono: str(s.telefono) || "—",
      mesa: str(s.mesa) || "—",
      orden: str(s.orden) || "—",
      local: str(s.local_votacion) || "—",
      confirmado: s.confirmado ? "Si" : "No",
      totalVotantes: String(voters.length),
      confirmados: String(confirmed),
    };
  });

  autoTable(doc, {
    startY,
    columns: [
      { header: "Nombre", dataKey: "nombre" },
      { header: "CI", dataKey: "ci" },
      { header: "Telefono", dataKey: "telefono" },
      { header: "Mesa", dataKey: "mesa" },
      { header: "Orden", dataKey: "orden" },
      { header: "Local", dataKey: "local" },
      { header: "Confirmado", dataKey: "confirmado" },
      { header: "Total Votantes", dataKey: "totalVotantes" },
      { header: "Confirmados", dataKey: "confirmados" },
    ],
    body,
    margin: { left: M.left, right: M.right },
    tableWidth: "auto",
    styles: {
      fontSize: 9,
      cellPadding: 3,
      overflow: "linebreak",
      halign: "left",
      textColor: [0, 0, 0],
    },
    headStyles: {
      fillColor: COLOR_SECTION_BG,
      textColor: COLOR_TEXT,
      fontStyle: "bold",
      fontSize: 9,
      cellPadding: 3,
      halign: "center",
      overflow: "visible",
    },
    alternateRowStyles: { fillColor: COLOR_ALT_ROW },
    columnStyles: {
      nombre: { cellWidth: 50 },
      local: { cellWidth: 50 },
    },
    rowPageBreak: "avoid",
    didParseCell: (data) => {
      if (data.column.dataKey === "confirmado" && data.section === "body") {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.textColor =
          data.cell.raw === "Si" ? COLOR_GREEN_TXT : COLOR_RED_TXT;
      }
    },
  });

  return doc.lastAutoTable.finalY;
}

// ======================= PERSON INFO BOX =======================
// Renders a full-detail info block for a coordinador or subcoordinador.
// Shows the same fields as voters: Nombre, CI, Seccional, Local, Mesa, Orden, Direccion, Telefono.
function addPersonInfoBox(doc, startY, person) {
  const direccion = person.direccion_override || person.direccion || "—";
  const rows = [
    ["Nombre completo", name(person)],
    ["CI", str(person.ci) || "—"],
    ["Seccional", str(person.seccional) || "—"],
    ["Local de votacion", str(person.local_votacion) || "—"],
    ["Mesa", str(person.mesa) || "—"],
    ["Orden", str(person.orden) || "—"],
    ["Direccion", direccion],
    ["Telefono", str(person.telefono) || "—"],
  ];

  autoTable(doc, {
    startY,
    head: [["Campo", "Dato"]],
    body: rows,
    margin: { left: M.left, right: M.right },
    tableWidth: 150,
    columnStyles: {
      0: { cellWidth: 50, fontStyle: "bold", textColor: COLOR_MUTED },
      1: { cellWidth: 100, textColor: COLOR_TEXT },
    },
    headStyles: {
      fillColor: COLOR_HEADER_BG,
      textColor: COLOR_HEADER_TXT,
      fontStyle: "bold",
      fontSize: 8,
      cellPadding: 2.5,
    },
    bodyStyles: { fontSize: 8, cellPadding: 2.5 },
    alternateRowStyles: { fillColor: COLOR_ALT_ROW },
  });

  return doc.lastAutoTable.finalY;
}

// ======================= CHECK PAGE SPACE =======================
function ensureSpace(doc, needed, afterY) {
  const ph = doc.internal.pageSize.getHeight();
  if (afterY + needed > ph - M.bottom - 10) {
    doc.addPage();
    return M.top + 5;
  }
  return afterY;
}

// ====================================================================
// SUPERADMIN PDF
// ====================================================================
export const generateSuperadminPDF = async ({ estructura, currentUser }) => {
  const doc = new jsPDF(PAGE_ORIENTATION, "mm", PAGE_FORMAT);
  const userName = name(currentUser);
  const logoImg = await loadLogo();

  const { coordinadores = [], subcoordinadores = [], votantes = [] } = estructura;

  // Global counts
  const subsConfirmados = subcoordinadores.filter((s) => s.confirmado === true).length;
  const votosConfirmados = votantes.filter((v) => v.voto_confirmado === true).length;
  const totalConfirmable = coordinadores.length + subcoordinadores.length + votantes.length;
  const totalConfirmados = coordinadores.length + subsConfirmados + votosConfirmados;
  const pct = totalConfirmable > 0 ? Math.round((totalConfirmados / totalConfirmable) * 100) : 0;

  // ---- Page 1: Global Summary ----
  let y = addHeader(doc, "Reporte Superadmin", userName, logoImg);

  y = sectionTitle(doc, "Resumen Global", y);
  y = addSummaryBox(doc, y, [
    ["Total Red", String(totalConfirmable)],
    ["Coordinadores", String(coordinadores.length)],
    ["Subcoordinadores", String(subcoordinadores.length)],
    ["Votantes", String(votantes.length)],
    ["Total Confirmados", String(totalConfirmados)],
    ["Pendientes", String(totalConfirmable - totalConfirmados)],
    ["Porcentaje Confirmado", `${pct}%`],
  ]);

  // ---- Per Coordinator Sections ----
  coordinadores.forEach((coord) => {
    const coordCI = normalizeCI(coord.ci);
    const subs = subcoordinadores.filter((s) => normalizeCI(s.coordinador_ci) === coordCI);
    const allVoters = votantes.filter((v) => normalizeCI(v.coordinador_ci) === coordCI);
    const directVoters = allVoters.filter((v) => normalizeCI(v.asignado_por) === coordCI);

    const subsConf = subs.filter((s) => s.confirmado === true).length;
    const votersConf = allVoters.filter((v) => v.voto_confirmado === true).length;
    const coordTotal = 1 + subs.length + allVoters.length;
    const coordConfirmed = 1 + subsConf + votersConf;
    const coordPct = coordTotal > 0 ? Math.round((coordConfirmed / coordTotal) * 100) : 0;

    // Always start a new page per coordinator
    doc.addPage();
    y = addHeader(doc, "Reporte Superadmin", userName, logoImg);

    // Coordinator section header
    y = sectionTitle(doc, `Coordinador: ${name(coord)}`, y);
    y = addSummaryBox(doc, y, [
      ["Total Red", String(coordTotal)],
      ["Confirmados", String(coordConfirmed)],
      ["Porcentaje", `${coordPct}%`],
    ]);
    y += 6;

    // Subcoordinadores table
    if (subs.length > 0) {
      y = ensureSpace(doc, 30, y);
      y = subSectionTitle(doc, "Subcoordinadores", y);
      y = addSubTable(doc, y, subs, estructura);
      y += 5;

      // Voters under each sub
      subs.forEach((sub) => {
        const subCI = normalizeCI(sub.ci);
        const subVoters = votantes.filter((v) => normalizeCI(v.asignado_por) === subCI);
        if (subVoters.length === 0) return;

        y = ensureSpace(doc, 25, y);
        y = subSectionTitle(doc, `Votantes de ${name(sub)}`, y);
        y = addVoterTable(doc, y, subVoters);
        y += 5;
      });
    }

    // Direct voters of this coordinator
    if (directVoters.length > 0) {
      y = ensureSpace(doc, 25, y);
      y = subSectionTitle(doc, `Votantes directos de ${name(coord)}`, y);
      y = addVoterTable(doc, y, directVoters);
      y += 5;
    }
  });

  // Grand totals on last page
  doc.addPage();
  y = addHeader(doc, "Reporte Superadmin", userName);
  y = sectionTitle(doc, "Totales Generales", y);
  addSummaryBox(doc, y, [
    ["Total Red", String(totalConfirmable)],
    ["Total Confirmados", String(totalConfirmados)],
    ["Total Pendientes", String(totalConfirmable - totalConfirmados)],
    ["Porcentaje General", `${pct}%`],
  ]);

  addFooterToAllPages(doc);
  return doc;
};

// ====================================================================
// COORDINADOR PDF
// Accepts optional `targetPerson` to print any coordinator's structure
// (used by superadmin "Verificar estructura" view). Falls back to currentUser.
// ====================================================================
export const generateCoordinadorPDF = async ({ estructura, currentUser, targetPerson = null }) => {
  const doc = new jsPDF(PAGE_ORIENTATION, "mm", PAGE_FORMAT);
  const logoImg = await loadLogo();

  // If targetPerson is provided, use it as the coordinator; otherwise use currentUser
  const coord = targetPerson || currentUser;
  const userName = name(currentUser);
  const miCI = normalizeCI(coord.ci);

  const { subcoordinadores = [], votantes = [] } = estructura;

  const subs = subcoordinadores.filter((s) => normalizeCI(s.coordinador_ci) === miCI);
  const directVoters = votantes.filter((v) => normalizeCI(v.asignado_por) === miCI);
  const allVoters = votantes.filter((v) => normalizeCI(v.coordinador_ci) === miCI);

  const subsConf = subs.filter((s) => s.confirmado === true).length;
  const votersConf = allVoters.filter((v) => v.voto_confirmado === true).length;
  const totalConfirmable = 1 + subs.length + allVoters.length;
  const totalConfirmados = 1 + subsConf + votersConf;
  const pct = totalConfirmable > 0 ? Math.round((totalConfirmados / totalConfirmable) * 100) : 0;

  // ---- Header & coordinator full info ----
  const reportLabel = targetPerson ? `Estructura del Coordinador: ${name(coord)}` : "Reporte Coordinador";
  let y = addHeader(doc, reportLabel, userName, logoImg);

  y = sectionTitle(doc, `Datos del Coordinador: ${name(coord)}`, y);
  y = addPersonInfoBox(doc, y, coord);
  y += 6;

  y = sectionTitle(doc, "Resumen de la Red", y);
  y = addSummaryBox(doc, y, [
    ["Total Red", String(totalConfirmable)],
    ["Subcoordinadores", String(subs.length)],
    ["Votantes directos", String(directVoters.length)],
    ["Votantes indirectos", String(allVoters.length - directVoters.length)],
    ["Confirmados", String(totalConfirmados)],
    ["Pendientes", String(totalConfirmable - totalConfirmados)],
    ["Porcentaje", `${pct}%`],
  ]);
  y += 6;

  // Subcoordinadores
  if (subs.length > 0) {
    y = ensureSpace(doc, 30, y);
    y = subSectionTitle(doc, "Subcoordinadores", y);
    y = addSubTable(doc, y, subs, estructura);
    y += 5;

    // Voters under each sub
    subs.forEach((sub) => {
      const subCI = normalizeCI(sub.ci);
      const subVoters = votantes.filter((v) => normalizeCI(v.asignado_por) === subCI);
      if (subVoters.length === 0) return;

      y = ensureSpace(doc, 25, y);
      y = subSectionTitle(doc, `Votantes de ${name(sub)}`, y);
      y = addVoterTable(doc, y, subVoters);
      y += 5;
    });
  }

  // Direct voters
  if (directVoters.length > 0) {
    y = ensureSpace(doc, 25, y);
    y = subSectionTitle(doc, "Votantes directos", y);
    y = addVoterTable(doc, y, directVoters);
  }

  addFooterToAllPages(doc);
  return doc;
};

// ====================================================================
// SUBCOORDINADOR PDF
// Accepts optional `targetPerson` to print any sub's structure
// (used by superadmin "Verificar estructura" view). Falls back to currentUser.
// ====================================================================
export const generateSubcoordinadorPDF = async ({ estructura, currentUser, targetPerson = null }) => {
  const doc = new jsPDF(PAGE_ORIENTATION, "mm", PAGE_FORMAT);
  const logoImg = await loadLogo();

  // If targetPerson is provided, use it as the sub; otherwise use currentUser
  const sub = targetPerson || currentUser;
  const userName = name(currentUser);
  const miCI = normalizeCI(sub.ci);

  const { votantes = [] } = estructura;
  const misVotantes = votantes.filter((v) => normalizeCI(v.asignado_por) === miCI);
  const confirmados = misVotantes.filter((v) => v.voto_confirmado === true).length;
  const totalConfirmable = 1 + misVotantes.length;
  const totalConfirmados = 1 + confirmados;
  const pct = totalConfirmable > 0 ? Math.round((totalConfirmados / totalConfirmable) * 100) : 0;

  // ---- Header & sub full info ----
  const reportLabel = targetPerson ? `Estructura del Subcoordinador: ${name(sub)}` : "Reporte Subcoordinador";
  let y = addHeader(doc, reportLabel, userName, logoImg);

  y = sectionTitle(doc, `Datos del Subcoordinador: ${name(sub)}`, y);
  y = addPersonInfoBox(doc, y, sub);
  y += 6;

  y = sectionTitle(doc, "Resumen", y);
  y = addSummaryBox(doc, y, [
    ["Total Red", String(totalConfirmable)],
    ["Votantes asignados", String(misVotantes.length)],
    ["Confirmados", String(totalConfirmados)],
    ["Pendientes", String(totalConfirmable - totalConfirmados)],
    ["Porcentaje", `${pct}%`],
  ]);
  y += 6;

  // ---- Voter table ----
  y = sectionTitle(doc, "Listado de Votantes", y);

  if (misVotantes.length === 0) {
    doc.setFontSize(8);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(...COLOR_MUTED);
    doc.text("No tiene votantes asignados.", M.left, y + 5);
  } else {
    addVoterTable(doc, y, misVotantes);
  }

  addFooterToAllPages(doc);
  return doc;
};
