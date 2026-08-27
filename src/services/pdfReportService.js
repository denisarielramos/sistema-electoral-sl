import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export const generateReport = ({ titulo, datos, currentUser }) => {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();

  // Header
  doc.setFontSize(16);
  doc.setTextColor(200, 0, 0);
  doc.text(titulo, 14, 15);

  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text(`Usuario: ${currentUser?.nombre || ""}`, pageWidth - 60, 10);
  doc.text(
    `Generado: ${new Date().toLocaleString()}`,
    pageWidth - 60,
    15
  );

  // Table
  autoTable(doc, {
    startY: 25,
    head: [["Nombre", "CI", "Rol", "Teléfono"]],
    body: datos.map((item) => [
      item.nombre,
      item.ci,
      item.rol,
      item.telefono || "-",
    ]),
    theme: "grid",
    headStyles: {
      fillColor: [200, 0, 0],
      textColor: 255,
    },
    styles: {
      fontSize: 9,
    },
    margin: { left: 10, right: 10 },
  });

  doc.save("reporte.pdf");
};
