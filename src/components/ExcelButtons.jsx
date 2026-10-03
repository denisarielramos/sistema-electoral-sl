import React from "react";
import { FileSpreadsheet, Users } from "lucide-react";

// ======================= BOTÓN DESCARGAR EXCEL (tarjetas individuales) =======================
// excelKey identifica esta descarga puntual; busyKey es la descarga en curso (global),
// usado tanto para deshabilitar el botón como para mostrar "Generando..." solo en el que se clickeó.
// Extraído de Dashboard.jsx para que también lo use el panel de reportes del
// coordinador (ReportesMisSubsCoordinador.jsx) sin duplicar el componente.
export const ExcelDownloadButton = ({ excelKey, busyKey, onDownload, iconOnly = false }) => {
  const isBusy = busyKey === excelKey;
  const baseIcon =
    "inline-flex items-center justify-center w-9 h-9 rounded-lg transition-colors shrink-0 border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed";
  const baseInline =
    "inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-slate-200 text-slate-600 text-xs hover:bg-slate-50 transition-colors bg-transparent shadow-none disabled:opacity-50 disabled:cursor-not-allowed";

  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onDownload(); }}
      disabled={!!busyKey}
      title={isBusy ? "Generando Excel..." : "Descargar Excel"}
      aria-label={isBusy ? "Generando Excel..." : "Descargar Excel"}
      className={iconOnly ? baseIcon : baseInline}
    >
      {isBusy ? (
        <span className="w-3.5 h-3.5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin shrink-0" />
      ) : (
        <FileSpreadsheet className="w-3.5 h-3.5" />
      )}
      {!iconOnly && <span>{isBusy ? "Generando..." : "Excel"}</span>}
    </button>
  );
};

// Exporta EXCLUSIVAMENTE los votantes directos del nivel (dirigente/coordinador/
// subcoordinador seleccionado) — nunca la red completa. Botón aparte de
// ExcelDownloadButton para que su etiqueta sea inequívoca en el modal "Verificar
// estructura".
export const VotantesDirectosButton = ({ excelKey, busyKey, onDownload }) => {
  const isBusy = busyKey === excelKey;
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onDownload(); }}
      disabled={!!busyKey}
      title="Descargar solo los votantes directos (Excel)"
      className="inline-flex items-center gap-1.5 px-3 h-8 border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed text-slate-700 rounded-lg text-xs font-medium transition-colors shadow-none"
    >
      {isBusy ? (
        <span className="w-3.5 h-3.5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin shrink-0" />
      ) : (
        <Users className="w-3.5 h-3.5" />
      )}
      {isBusy ? "Generando..." : "Votantes directos"}
    </button>
  );
};
