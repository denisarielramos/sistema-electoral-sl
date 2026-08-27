import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  normalizeCI,
  getCoordsDeDigente,
  getSubsDeDigente,
  getVotantesDirectosDirigente,
  getTodosVotantesDirigente,
  getVotantesDirectosCoord,
  getTodosVotantesCoord,
  getVotantesDeSubcoord,
} from "../utils/estructuraHelpers";

// ======================= CONSTANTS =======================
const PAGE_FORMAT = "a4";
const PAGE_ORIENTATION = "portrait";
const M = { top: 15, bottom: 15, left: 15, right: 15 };

// Brand colors matching app UI (tailwind.config.js)
const COLOR_BRAND      = [220, 38, 38];    // brand-600 #dc2626
const COLOR_BRAND_DARK = [185, 28, 28];    // brand-700 #b91c1c
const COLOR_TEXT       = [15, 23, 42];     // slate-900
const COLOR_MUTED      = [100, 116, 139];  // slate-500
const COLOR_LINE       = [220, 38, 38];    // brand-600 for separator
const COLOR_HEADER_BG  = [185, 28, 28];    // brand-700 for table headers
const COLOR_HEADER_TXT = [255, 255, 255];
const COLOR_ALT_ROW    = [254, 242, 242];  // brand-50 #fef2f2
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
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLOR_MUTED);
  doc.text(text, M.left + 2, y);
  return y + 4;
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
];

function addVoterTable(doc, startY, voters) {
  const body = voters.map((v) => ({
    nombre: name(v),
    ci: str(v.ci) || "—",
    telefono: str(v.telefono) || "—",
    mesa: str(v.mesa) || "—",
    orden: str(v.orden) || "—",
    local: str(v.local_votacion) || "—",
  }));

  autoTable(doc, {
    startY,
    columns: VOTER_COLUMNS,
    body,
    margin: { left: M.left, right: M.right },
    headStyles: {
      fillColor: COLOR_HEADER_BG,
      textColor: COLOR_HEADER_TXT,
      fontStyle: "bold",
      fontSize: 7.5,
      cellPadding: 2.5,
    },
    bodyStyles: {
      fontSize: 7,
      textColor: COLOR_TEXT,
      cellPadding: 2,
      overflow: "linebreak",
    },
    columnStyles: {
      nombre: { cellWidth: "auto" },
      ci: { cellWidth: 20 },
      telefono: { cellWidth: 24 },
      mesa: { cellWidth: 12, halign: "center" },
      orden: { cellWidth: 14, halign: "center" },
      local: { cellWidth: 34 },
    },
    alternateRowStyles: { fillColor: COLOR_ALT_ROW },
    rowPageBreak: "avoid",
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
    return {
      nombre: name(s),
      totalVotantes: String(voters.length),
    };
  });

  autoTable(doc, {
    startY,
    columns: [
      { header: "Subcoordinador", dataKey: "nombre" },
      { header: "Total Votantes", dataKey: "totalVotantes" },
    ],
    body,
    margin: { left: M.left, right: M.right },
    tableWidth: 140,
    headStyles: {
      fillColor: COLOR_SECTION_BG,
      textColor: COLOR_TEXT,
      fontStyle: "bold",
      fontSize: 7.5,
      cellPadding: 2.5,
    },
    bodyStyles: {
      fontSize: 7.5,
      textColor: COLOR_TEXT,
      cellPadding: 2.5,
    },
    columnStyles: {
      nombre: { cellWidth: "auto" },
      totalVotantes: { cellWidth: 25, halign: "center" },
    },
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
  const totalRed = coordinadores.length + subcoordinadores.length + votantes.length;

  // ---- Page 1: Global Summary ----
  let y = addHeader(doc, "Reporte Superadmin", userName, logoImg);

  y = sectionTitle(doc, "Resumen Global", y);
  y = addSummaryBox(doc, y, [
    ["Total Red", String(totalRed)],
    ["Coordinadores", String(coordinadores.length)],
    ["Subcoordinadores", String(subcoordinadores.length)],
    ["Votantes", String(votantes.length)],
  ]);

  // ---- Per Coordinator Sections ----
  coordinadores.forEach((coord) => {
    const coordCI = normalizeCI(coord.ci);
    const subs = subcoordinadores.filter((s) => normalizeCI(s.coordinador_ci) === coordCI);
    const allVoters = votantes.filter((v) => normalizeCI(v.coordinador_ci) === coordCI);
    const directVoters = allVoters.filter((v) => normalizeCI(v.asignado_por) === coordCI);

    const coordTotal = 1 + subs.length + allVoters.length;

    // Always start a new page per coordinator
    doc.addPage();
    y = addHeader(doc, "Reporte Superadmin", userName, logoImg);

    // Coordinator section header
    y = sectionTitle(doc, `Coordinador: ${name(coord)}`, y);
    y = addSummaryBox(doc, y, [
      ["Total Red", String(coordTotal)],
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

  // Grand total on last page
  doc.addPage();
  y = addHeader(doc, "Reporte Superadmin", userName);
  y = sectionTitle(doc, "Totales Generales", y);
  addSummaryBox(doc, y, [
    ["Total Red", String(totalRed)],
  ]);

  addFooterToAllPages(doc);
  return doc;
};

// ====================================================================
// COORDINADOR PDF
// ====================================================================
// targetPerson: opcional — cuando el superadmin verifica la estructura de OTRO
// coordinador (no la propia), se genera el reporte de esa persona en lugar de currentUser.
export const generateCoordinadorPDF = async ({ estructura, currentUser, targetPerson = null }) => {
  const doc = new jsPDF(PAGE_ORIENTATION, "mm", PAGE_FORMAT);
  const persona = targetPerson || currentUser;
  const userName = name(persona);
  const logoImg = await loadLogo();
  const miCI = normalizeCI(persona.ci);

  const { subcoordinadores = [], votantes = [] } = estructura;

  const subs = subcoordinadores.filter((s) => normalizeCI(s.coordinador_ci) === miCI);
  // Mismos helpers que "Verificar estructura" y el Excel del coordinador, para que
  // Total Red/directos/indirectos siempre coincidan con lo mostrado ahí — incluye a
  // los directos "estrictos" sin coordinador_ci poblado.
  const directVoters = getVotantesDirectosCoord(estructura, miCI);
  const allVoters = getTodosVotantesCoord(estructura, miCI);

  const totalRed = 1 + subs.length + allVoters.length;

  // ---- Summary ----
  let y = addHeader(doc, "Reporte Coordinador", userName, logoImg);
  y = sectionTitle(doc, "Resumen de Mi Red", y);
  y = addSummaryBox(doc, y, [
    ["Total Red", String(totalRed)],
    ["Subcoordinadores", String(subs.length)],
    ["Votantes directos", String(directVoters.length)],
    ["Votantes indirectos", String(Math.max(0, allVoters.length - directVoters.length))],
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
// ====================================================================
// targetPerson: opcional — reporte de OTRO subcoordinador (verificación por superadmin)
// en lugar del propio currentUser.
export const generateSubcoordinadorPDF = async ({ estructura, currentUser, targetPerson = null }) => {
  const doc = new jsPDF(PAGE_ORIENTATION, "mm", PAGE_FORMAT);
  const persona = targetPerson || currentUser;
  const userName = name(persona);
  const logoImg = await loadLogo();
  const miCI = normalizeCI(persona.ci);

  const { votantes = [] } = estructura;
  const misVotantes = votantes.filter((v) => normalizeCI(v.asignado_por) === miCI);
  const totalRed = 1 + misVotantes.length;

  // ---- Summary ----
  let y = addHeader(doc, "Reporte Subcoordinador", userName, logoImg);
  y = sectionTitle(doc, "Resumen", y);
  y = addSummaryBox(doc, y, [
    ["Total Red", String(totalRed)],
    ["Votantes asignados", String(misVotantes.length)],
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

// ====================================================================
// DIRIGENTE PDF (rama completa de un dirigente)
// ====================================================================
// targetPerson: opcional — reporte de OTRO dirigente (verificación por superadmin)
// en lugar del propio currentUser. Reutiliza los mismos helpers de jerarquía que
// ya usa el resto de la app (utils/estructuraHelpers.js).
export const generateDirigentePDF = async ({ estructura, currentUser, targetPerson = null }) => {
  const doc = new jsPDF(PAGE_ORIENTATION, "mm", PAGE_FORMAT);
  const persona = targetPerson || currentUser;
  const userName = name(persona);
  const logoImg = await loadLogo();
  const dirCI = normalizeCI(persona.ci);

  const misCoords = getCoordsDeDigente(estructura, dirCI);
  const misSubs = getSubsDeDigente(estructura, dirCI);
  const votantesDirectosDirigente = getVotantesDirectosDirigente(estructura, dirCI);
  const todosVotantes = getTodosVotantesDirigente(estructura, dirCI);

  const totalRed = misCoords.length + misSubs.length + todosVotantes.length;

  // ---- Summary ----
  let y = addHeader(doc, "Reporte Dirigente", userName, logoImg);
  y = sectionTitle(doc, "Resumen de Rama", y);
  y = addSummaryBox(doc, y, [
    ["Total Red", String(totalRed)],
    ["Coordinadores", String(misCoords.length)],
    ["Subcoordinadores", String(misSubs.length)],
    ["Votantes", String(todosVotantes.length)],
  ]);
  y += 6;

  // ---- Per coordinator sections ----
  misCoords.forEach((coord) => {
    const coordCI = normalizeCI(coord.ci);
    const subsDeEste = misSubs.filter((s) => normalizeCI(s.coordinador_ci) === coordCI);
    const directVotersDeEste = getVotantesDirectosCoord(estructura, coordCI);

    y = ensureSpace(doc, 30, y);
    y = subSectionTitle(doc, `Coordinador: ${name(coord)}`, y);

    if (subsDeEste.length > 0) {
      y = addSubTable(doc, y, subsDeEste, estructura);
      y += 5;

      subsDeEste.forEach((sub) => {
        const subVoters = getVotantesDeSubcoord(estructura, normalizeCI(sub.ci));
        if (subVoters.length === 0) return;
        y = ensureSpace(doc, 25, y);
        y = subSectionTitle(doc, `Votantes de ${name(sub)}`, y);
        y = addVoterTable(doc, y, subVoters);
        y += 5;
      });
    }

    if (directVotersDeEste.length > 0) {
      y = ensureSpace(doc, 25, y);
      y = subSectionTitle(doc, `Votantes directos de ${name(coord)}`, y);
      y = addVoterTable(doc, y, directVotersDeEste);
      y += 5;
    }
  });

  // ---- Direct voters of the dirigente itself ----
  if (votantesDirectosDirigente.length > 0) {
    y = ensureSpace(doc, 25, y);
    y = subSectionTitle(doc, "Votantes directos del dirigente", y);
    y = addVoterTable(doc, y, votantesDirectosDirigente);
  }

  addFooterToAllPages(doc);
  return doc;
};
