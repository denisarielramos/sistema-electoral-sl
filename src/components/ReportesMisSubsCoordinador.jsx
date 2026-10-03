// ======================= REPORTES DE ESTRUCTURA — MIS SUBCOORDINADORES (coordinador) =======================
// Panel independiente y deliberadamente chico: equivalente, para el rol
// coordinador, a lo que "Verificar estructura" (Dashboard.jsx) le ofrece a
// superadmin — pero SIN selector de dirigente ni de coordinador. Un coordinador
// solo puede ver/generar reportes de SUS PROPIOS subcoordinadores, nunca de
// otro coordinador ni de dirigentes.
//
// No duplica lógica de generación de reportes: reutiliza exactamente
// getMisSubcoordinadores/getVotantesDeSubcoord (estructuraHelpers.js),
// generateSubcoordinadorPDF (pdfService.js) y, vía props, los mismos
// buildSubExcelPayload/buildSubDirectosExcelPayload/handleDescargarExcel ya
// definidos en Dashboard.jsx (misma función, no una copia). Lo único propio de
// este archivo es la UI del panel y su propio estado de "generando PDF".
//
// Aislamiento, con dos capas independientes (ninguna confía en la otra):
//   1) getMisSubcoordinadores(estructura, miCI) — ya filtra por
//      coordinador_ci === miCI (ver estructuraHelpers.js).
//   2) Este componente vuelve a filtrar explícitamente por
//      normalizeCI(sub.coordinador_ci) === miCI antes de mostrar o de permitir
//      cualquier acción sobre un sub — nunca confía en un selector ni en una
//      lista que llegue desde otro lado del árbol de componentes.
// `estructura` en sí mismo ya viene segmentado por `cargarEstructuraSegunRol`
// (role === "coordinador": solo su propio coordinador/dirigente, subs con
// coordinador_ci === miCI, votantes de su rama) — este componente no cambia
// ni depende de esa carga, solo añade una segunda verificación local.
import React, { useMemo, useState } from "react";
import { X, Printer, ClipboardList } from "lucide-react";
import { generateSubcoordinadorPDF } from "../services/pdfService";
import { normalizeCI, getMisSubcoordinadores, getVotantesDeSubcoord } from "../utils/estructuraHelpers";
import { ExcelDownloadButton, VotantesDirectosButton } from "./ExcelButtons";

const ReportesMisSubsCoordinador = ({
  estructura,
  currentUser,
  excelBusy,
  handleDescargarExcel,
  buildSubExcelPayload,
  buildSubDirectosExcelPayload,
  onClose,
}) => {
  const [printing, setPrinting] = useState(null); // normalizeCI(sub.ci) | null

  const miCI = normalizeCI(currentUser?.ci);

  // Doble filtro deliberado (ver nota arriba del archivo): getMisSubcoordinadores
  // ya restringe por coordinador_ci, y acá se vuelve a exigir la misma condición
  // explícitamente antes de construir la lista que se muestra.
  const misSubs = useMemo(() => {
    const base = getMisSubcoordinadores(estructura, miCI);
    return base.filter((s) => normalizeCI(s.coordinador_ci) === miCI);
  }, [estructura, miCI]);

  // Guarda de seguridad para cada acción puntual (Excel/PDF/votantes directos):
  // nunca opera sobre un sub que no pertenezca a este coordinador, incluso si
  // de algún modo llegara un objeto `sub` ajeno a esta función.
  const esMiSub = (sub) => !!sub && normalizeCI(sub.coordinador_ci) === miCI;

  const imprimirSub = async (sub) => {
    if (!esMiSub(sub)) return;
    const subCI = normalizeCI(sub.ci);
    setPrinting(subCI);
    try {
      const doc = await generateSubcoordinadorPDF({
        estructura,
        currentUser,
        targetPerson: sub,
      });
      const ts = new Date().toISOString().slice(0, 10);
      doc.save(`estructura-sub-${subCI}-${ts}.pdf`);
    } catch (e) {
      console.error("Error generando PDF del subcoordinador:", e);
      alert("Error generando PDF");
    } finally {
      setPrinting(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 sticky top-0 bg-white rounded-t-2xl">
          <div className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-brand-600" />
            <h2 className="text-base font-semibold text-slate-800">Reportes de estructura</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          <p className="text-sm text-slate-500">
            Reporte individual de cada uno de tus subcoordinadores. Solo se muestran los que tenés asignados —
            no podés ver ni generar reportes de otros coordinadores ni de sus subcoordinadores.
          </p>

          {misSubs.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">
              Todavía no tenés subcoordinadores asignados.
            </p>
          ) : (
            <div className="space-y-2">
              {misSubs.map((sub) => {
                const subCI = normalizeCI(sub.ci);
                const subVoterCount = getVotantesDeSubcoord(estructura, subCI).length;
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
                        CI: {subCI} · {subVoterCount} votante{subVoterCount !== 1 ? "s" : ""} directo{subVoterCount !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap shrink-0">
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
                        onClick={() => imprimirSub(sub)}
                        disabled={printing === subCI}
                        className="inline-flex items-center gap-1.5 border border-brand-300 bg-white hover:bg-brand-50 disabled:opacity-60 text-brand-700 px-3 h-8 rounded-lg text-xs font-medium transition-colors shadow-none"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        {printing === subCI ? "Generando..." : "Imprimir estructura de este sub"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReportesMisSubsCoordinador;
