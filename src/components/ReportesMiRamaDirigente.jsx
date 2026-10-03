// ======================= REPORTES DE ESTRUCTURA — MI RAMA (dirigente) =======================
// El dirigente solo puede generar reportes de coordinadores pertenecientes a SU rama
// y de los subcoordinadores que cuelgan de esos coordinadores. No hay selectores
// globales ni acceso a estructuras ajenas.
import React, { useMemo, useState } from "react";
import { X, Printer, ClipboardList, ChevronDown, ChevronRight } from "lucide-react";
import {
  generateCoordinadorPDF,
  generateSubcoordinadorPDF,
} from "../services/pdfService";
import {
  normalizeCI,
  getCoordsDeDigente,
  getMisSubcoordinadores,
  getVotantesDeSubcoord,
  getTodosVotantesCoord,
  getVotantesDirectosCoord,
} from "../utils/estructuraHelpers";
import { ExcelDownloadButton, VotantesDirectosButton } from "./ExcelButtons";

const ReportesMiRamaDirigente = ({
  estructura,
  currentUser,
  excelBusy,
  handleDescargarExcel,
  buildCoordExcelPayload,
  buildCoordDirectosExcelPayload,
  buildSubExcelPayload,
  buildSubDirectosExcelPayload,
  onClose,
}) => {
  const [printing, setPrinting] = useState(null);
  const [expanded, setExpanded] = useState({});

  const miCI = normalizeCI(currentUser?.ci);

  // Doble aislamiento: helper de jerarquía + verificación explícita del dirigente_ci.
  const misCoords = useMemo(() => {
    return getCoordsDeDigente(estructura, miCI).filter(
      (coord) => normalizeCI(coord.dirigente_ci) === miCI
    );
  }, [estructura, miCI]);

  const misCoordCIs = useMemo(
    () => new Set(misCoords.map((coord) => normalizeCI(coord.ci))),
    [misCoords]
  );

  const esMiCoord = (coord) =>
    !!coord &&
    normalizeCI(coord.dirigente_ci) === miCI &&
    misCoordCIs.has(normalizeCI(coord.ci));

  const esMiSub = (sub) =>
    !!sub && misCoordCIs.has(normalizeCI(sub.coordinador_ci));

  const subsDeCoord = (coord) => {
    if (!esMiCoord(coord)) return [];
    const coordCI = normalizeCI(coord.ci);
    return getMisSubcoordinadores(estructura, coordCI).filter(
      (sub) => normalizeCI(sub.coordinador_ci) === coordCI
    );
  };

  const imprimirCoord = async (coord) => {
    if (!esMiCoord(coord)) return;
    const coordCI = normalizeCI(coord.ci);
    const key = `coord-${coordCI}`;
    setPrinting(key);
    try {
      const doc = await generateCoordinadorPDF({
        estructura,
        currentUser,
        targetPerson: coord,
      });
      const ts = new Date().toISOString().slice(0, 10);
      doc.save(`estructura-coord-${coordCI}-${ts}.pdf`);
    } catch (error) {
      console.error("Error generando PDF del coordinador:", error);
      alert("Error generando PDF");
    } finally {
      setPrinting(null);
    }
  };

  const imprimirSub = async (sub) => {
    if (!esMiSub(sub)) return;
    const subCI = normalizeCI(sub.ci);
    const key = `sub-${subCI}`;
    setPrinting(key);
    try {
      const doc = await generateSubcoordinadorPDF({
        estructura,
        currentUser,
        targetPerson: sub,
      });
      const ts = new Date().toISOString().slice(0, 10);
      doc.save(`estructura-sub-${subCI}-${ts}.pdf`);
    } catch (error) {
      console.error("Error generando PDF del subcoordinador:", error);
      alert("Error generando PDF");
    } finally {
      setPrinting(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl max-w-3xl w-full my-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 sticky top-0 bg-white rounded-t-2xl z-10">
          <div className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-brand-600" />
            <div>
              <h2 className="text-base font-semibold text-slate-800">Reportes de estructura</h2>
              <p className="text-xs text-slate-500">Tus coordinadores y sus subcoordinadores</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          {misCoords.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">
              Todavía no tenés coordinadores asignados.
            </p>
          ) : (
            misCoords.map((coord) => {
              const coordCI = normalizeCI(coord.ci);
              const subs = subsDeCoord(coord);
              const totalVotantes = getTodosVotantesCoord(estructura, coordCI).length;
              const directos = getVotantesDirectosCoord(estructura, coordCI).length;
              const abierto = !!expanded[coordCI];
              const coordPrintKey = `coord-${coordCI}`;

              return (
                <div key={coordCI} className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="p-3.5 bg-brand-50">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <button
                        type="button"
                        onClick={() => setExpanded((prev) => ({ ...prev, [coordCI]: !prev[coordCI] }))}
                        className="flex items-center gap-2 min-w-0 text-left bg-transparent border-0 shadow-none p-0"
                      >
                        {abierto ? (
                          <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-800 truncate">
                            {`${coord.nombre || ""} ${coord.apellido || ""}`.trim() || coordCI}
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            CI: {coordCI} · {subs.length} sub{subs.length !== 1 ? "s" : ""} · {directos} directo{directos !== 1 ? "s" : ""} · {totalVotantes} en estructura
                          </p>
                        </div>
                      </button>

                      <div className="flex items-center gap-2 flex-wrap">
                        <ExcelDownloadButton
                          excelKey={`coordinador:${coordCI}`}
                          busyKey={excelBusy}
                          onDownload={() => {
                            if (!esMiCoord(coord)) return;
                            handleDescargarExcel(`coordinador:${coordCI}`, buildCoordExcelPayload(coord));
                          }}
                        />
                        <VotantesDirectosButton
                          excelKey={`coordinador-directos:${coordCI}`}
                          busyKey={excelBusy}
                          onDownload={() => {
                            if (!esMiCoord(coord)) return;
                            handleDescargarExcel(`coordinador-directos:${coordCI}`, buildCoordDirectosExcelPayload(coord));
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => imprimirCoord(coord)}
                          disabled={printing === coordPrintKey}
                          className="inline-flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white px-3 h-8 rounded-lg text-xs font-medium transition-colors border-0 shadow-none"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          {printing === coordPrintKey ? "Generando..." : "Imprimir estructura"}
                        </button>
                      </div>
                    </div>
                  </div>

                  {abierto && (
                    <div className="p-3 space-y-2 bg-white border-t border-slate-200">
                      {subs.length === 0 ? (
                        <p className="text-xs text-slate-400 text-center py-3">
                          Este coordinador no tiene subcoordinadores asignados.
                        </p>
                      ) : (
                        subs.map((sub) => {
                          const subCI = normalizeCI(sub.ci);
                          const voterCount = getVotantesDeSubcoord(estructura, subCI).length;
                          const subPrintKey = `sub-${subCI}`;

                          return (
                            <div
                              key={subCI}
                              className="flex items-center justify-between gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl flex-wrap"
                            >
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-slate-800 truncate">
                                  {`${sub.nombre || ""} ${sub.apellido || ""}`.trim() || subCI}
                                </p>
                                <p className="text-xs text-slate-500 mt-0.5">
                                  CI: {subCI} · {voterCount} votante{voterCount !== 1 ? "s" : ""}
                                </p>
                              </div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <ExcelDownloadButton
                                  excelKey={`subcoordinador:${subCI}`}
                                  busyKey={excelBusy}
                                  onDownload={() => {
                                    if (!esMiSub(sub)) return;
                                    handleDescargarExcel(`subcoordinador:${subCI}`, buildSubExcelPayload(sub));
                                  }}
                                />
                                <VotantesDirectosButton
                                  excelKey={`subcoordinador-directos:${subCI}`}
                                  busyKey={excelBusy}
                                  onDownload={() => {
                                    if (!esMiSub(sub)) return;
                                    handleDescargarExcel(`subcoordinador-directos:${subCI}`, buildSubDirectosExcelPayload(sub));
                                  }}
                                />
                                <button
                                  type="button"
                                  onClick={() => imprimirSub(sub)}
                                  disabled={printing === subPrintKey}
                                  className="inline-flex items-center gap-1.5 border border-brand-300 bg-white hover:bg-brand-50 disabled:opacity-60 text-brand-700 px-3 h-8 rounded-lg text-xs font-medium transition-colors shadow-none"
                                >
                                  <Printer className="w-3.5 h-3.5" />
                                  {printing === subPrintKey ? "Generando..." : "Imprimir sub"}
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default ReportesMiRamaDirigente;
