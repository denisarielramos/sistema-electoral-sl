// ======================= MÓDULO: BITÁCORA DE VISITAS =======================
// Visible para superadmin, dirigente y coordinador según su alcance (subcoordinador
// no accede a este panel — ver AccesoRapidoHogar para su flujo de confirmar visita
// directo desde la tarjeta del votante). Alcance ya resuelto por mapeo_listar_visitas.
import React, { useMemo, useState } from "react";
import { ArrowLeft, ClipboardList, Search, FileSpreadsheet, Eye, X } from "lucide-react";
import { useVisitas } from "../../hooks/useVisitas";
import { normalizeCI } from "../../utils/estructuraHelpers";
import { normalizeTexto, personaCoincideConsulta } from "../../utils/busquedaHelpers";
import { formatearDistancia, formatearPrecisionGps } from "../../utils/geoHelpers";
import { resolverNombreActor, getJerarquiaVisita, visitaTieneJerarquia } from "../../utils/mapeoHelpers";

const RESULTADO_LABEL = {
  confirmada: "Confirmada",
  fuera_de_radio: "Fuera de radio",
  pendiente: "Pendiente",
  cancelada: "Cancelada",
  error_gps: "Error de GPS",
};

const RESULTADO_COLOR = {
  confirmada: "text-emerald-700 bg-emerald-50 border-emerald-200",
  fuera_de_radio: "text-red-700 bg-red-50 border-red-200",
  pendiente: "text-amber-700 bg-amber-50 border-amber-200",
  cancelada: "text-slate-500 bg-slate-100 border-slate-200",
  error_gps: "text-amber-700 bg-amber-50 border-amber-200",
};

const visitaCoincideConsulta = (visita, query) => {
  if (!query.trim()) return true;
  if ((visita.votantes || []).some((v) => personaCoincideConsulta(v, query))) return true;
  const q = normalizeTexto(query);
  return normalizeTexto(visita.hogar_nombre_familia).includes(q) || normalizeTexto(visita.hogar_direccion).includes(q);
};

const BitacoraVisitas = ({ currentUser, estructura, onVolver }) => {
  const { visitas, loading, error, recargar } = useVisitas(currentUser);
  const [query, setQuery] = useState("");
  const [filtroRol, setFiltroRol] = useState("");
  const [filtroResultado, setFiltroResultado] = useState("");
  const [filtroDirigente, setFiltroDirigente] = useState("");
  const [filtroCoordinador, setFiltroCoordinador] = useState("");
  const [detalle, setDetalle] = useState(null);
  const [exportando, setExportando] = useState(false);
  const [exportError, setExportError] = useState(null);

  const visitasFiltradas = useMemo(() => {
    return (visitas || []).filter((v) => {
      if (!visitaCoincideConsulta(v, query)) return false;
      if (filtroRol && v.visitante_rol !== filtroRol) return false;
      if (filtroResultado && v.resultado !== filtroResultado) return false;
      if (filtroDirigente || filtroCoordinador) {
        if (!visitaTieneJerarquia(v, { dirigenteCI: filtroDirigente, coordinadorCI: filtroCoordinador }, estructura)) return false;
      }
      return true;
    });
  }, [visitas, query, filtroRol, filtroResultado, filtroDirigente, filtroCoordinador, estructura]);

  const handleExportar = async () => {
    setExportando(true);
    setExportError(null);
    try {
      const { generarExcelVisitas } = await import("../../services/excelService");
      await generarExcelVisitas(visitasFiltradas, {
        resolverNombreVisitante: (v) => resolverNombreActor(v.visitante_ci, v.visitante_rol, estructura),
        resolverJerarquia: (v) => {
          const j = getJerarquiaVisita(v, estructura);
          return [
            j.dirigente && `Dirigente: ${j.dirigente.nombre} ${j.dirigente.apellido || ""}`.trim(),
            j.coordinador && `Coordinador: ${j.coordinador.nombre} ${j.coordinador.apellido || ""}`.trim(),
            j.subcoordinador && `Subcoordinador: ${j.subcoordinador.nombre} ${j.subcoordinador.apellido || ""}`.trim(),
          ].filter(Boolean).join(" · ");
        },
      });
    } catch (err) {
      setExportError(err.message || "Error al generar el Excel.");
    } finally {
      setExportando(false);
    }
  };

  return (
    <div className="space-y-6">
      {onVolver && (
        <button
          onClick={onVolver}
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 bg-transparent border-0 shadow-none px-0"
        >
          <ArrowLeft className="w-4 h-4" /> Volver
        </button>
      )}

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-brand-100 rounded-lg"><ClipboardList className="w-4 h-4 text-brand-600" /></div>
          <div>
            <h2 className="text-lg font-bold text-slate-800">Bitácora de visitas</h2>
            <p className="text-xs text-slate-500">{visitasFiltradas.length} de {visitas.length} registros</p>
          </div>
        </div>
        <button
          onClick={handleExportar}
          disabled={exportando || visitasFiltradas.length === 0}
          className="inline-flex items-center gap-1.5 px-4 h-9 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
        >
          <FileSpreadsheet className="w-4 h-4" />
          {exportando ? "Generando..." : "Exportar a Excel"}
        </button>
      </div>

      {exportError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{exportError}</p>}

      {/* Búsqueda y filtros */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-card space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nombre, apellido, CI, teléfono, dirección o referencia..."
            className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 bg-slate-50"
          />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <select value={filtroRol} onChange={(e) => setFiltroRol(e.target.value)} className="text-sm border border-slate-200 rounded-lg px-2.5 py-2 bg-white">
            <option value="">Todos los roles</option>
            <option value="superadmin">Superadmin</option>
            <option value="dirigente">Dirigente</option>
            <option value="coordinador">Coordinador</option>
            <option value="subcoordinador">Subcoordinador</option>
          </select>
          <select value={filtroResultado} onChange={(e) => setFiltroResultado(e.target.value)} className="text-sm border border-slate-200 rounded-lg px-2.5 py-2 bg-white">
            <option value="">Todos los estados</option>
            {Object.entries(RESULTADO_LABEL).map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
          {currentUser.role === "superadmin" && (
            <select value={filtroDirigente} onChange={(e) => setFiltroDirigente(e.target.value)} className="text-sm border border-slate-200 rounded-lg px-2.5 py-2 bg-white">
              <option value="">Todos los dirigentes</option>
              {(estructura.dirigentes || []).map((d) => (
                <option key={normalizeCI(d.ci)} value={normalizeCI(d.ci)}>{d.nombre} {d.apellido}</option>
              ))}
            </select>
          )}
          {(currentUser.role === "superadmin" || currentUser.role === "dirigente") && (
            <select value={filtroCoordinador} onChange={(e) => setFiltroCoordinador(e.target.value)} className="text-sm border border-slate-200 rounded-lg px-2.5 py-2 bg-white">
              <option value="">Todos los coordinadores</option>
              {(estructura.coordinadores || []).map((c) => (
                <option key={normalizeCI(c.ci)} value={normalizeCI(c.ci)}>{c.nombre} {c.apellido}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <span className="w-6 h-6 border-2 border-slate-200 border-t-brand-600 rounded-full animate-spin" />
        </div>
      )}
      {!loading && error && (
        <div className="text-center py-12 bg-red-50 border border-red-200 rounded-xl space-y-2">
          <p className="text-sm text-red-700">{error}</p>
          <button onClick={recargar} className="text-sm text-red-700 underline bg-transparent border-0 shadow-none">Reintentar</button>
        </div>
      )}
      {!loading && !error && visitasFiltradas.length === 0 && (
        <p className="text-sm text-slate-400 text-center py-12 bg-slate-50 border border-slate-200 rounded-xl">
          {visitas.length === 0 ? "Todavía no hay visitas registradas." : "Sin resultados para los filtros aplicados."}
        </p>
      )}

      {!loading && !error && visitasFiltradas.length > 0 && (
        <div className="space-y-2">
          {visitasFiltradas.map((visita) => (
            <button
              key={visita.id}
              onClick={() => setDetalle(visita)}
              className="w-full text-left bg-white border border-slate-200 rounded-xl p-3.5 hover:border-brand-300 transition-colors shadow-none flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">{visita.hogar_nombre_familia || "Hogar sin nombre"}</p>
                <p className="text-xs text-slate-500 truncate">
                  {resolverNombreActor(visita.visitante_ci, visita.visitante_rol, estructura)} · {new Date(visita.fecha_hora).toLocaleString("es-PY")}
                </p>
              </div>
              <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-md border ${RESULTADO_COLOR[visita.resultado] || ""}`}>
                {RESULTADO_LABEL[visita.resultado] || visita.resultado}
              </span>
              <Eye className="w-4 h-4 text-slate-300 shrink-0" />
            </button>
          ))}
        </div>
      )}

      {/* Detalle */}
      {detalle && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setDetalle(null); }}
        >
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-modal overflow-hidden animate-fade-in">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50">
              <h3 className="text-base font-bold text-slate-800">Detalle de visita</h3>
              <button onClick={() => setDetalle(null)} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg border-0 bg-transparent shadow-none" aria-label="Cerrar">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-2 text-sm">
              <p><span className="text-slate-400">Familia/hogar:</span> {detalle.hogar_nombre_familia || "Sin nombre"}</p>
              <p><span className="text-slate-400">Dirección:</span> {detalle.hogar_direccion || "Sin dato"}</p>
              <p><span className="text-slate-400">Integrantes:</span> {(detalle.votantes || []).map((v) => `${v.nombre} ${v.apellido}`).join(", ") || "Sin datos"}</p>
              <p><span className="text-slate-400">Visitante:</span> {resolverNombreActor(detalle.visitante_ci, detalle.visitante_rol, estructura)} ({detalle.visitante_rol})</p>
              <p><span className="text-slate-400">Fecha y hora:</span> {new Date(detalle.fecha_hora).toLocaleString("es-PY")}</p>
              <p><span className="text-slate-400">Precisión GPS:</span> {formatearPrecisionGps(detalle.precision_gps)}</p>
              <p><span className="text-slate-400">Distancia:</span> {formatearDistancia(detalle.distancia_metros)}</p>
              <p><span className="text-slate-400">Radio utilizado:</span> {detalle.radio_permitido_usado} m</p>
              <p><span className="text-slate-400">Estado:</span> {RESULTADO_LABEL[detalle.resultado] || detalle.resultado}</p>
              {detalle.observacion && <p><span className="text-slate-400">Observación:</span> {detalle.observacion}</p>}
            </div>
            <div className="px-5 pb-5">
              <button
                onClick={() => setDetalle(null)}
                className="w-full h-10 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 bg-white"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BitacoraVisitas;
