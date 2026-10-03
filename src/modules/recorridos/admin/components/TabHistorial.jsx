// ======================= TAB: HISTORIAL =======================
// Listado paginado de sesiones pasadas (recorrido_admin_listar_historico),
// con filtros por jornada, CI/nombre, y rango de fechas. Para buscar por
// nombre (la RPC solo acepta CI), se escribe el nombre y se elige de una
// lista de choferes resuelta en vivo contra recorrido_admin_listar_choferes
// — nunca se inventa una búsqueda por nombre en el backend.
import React, { useCallback, useEffect, useState } from "react";
import { Loader2, AlertTriangle, Search, X, ChevronLeft, ChevronRight, Navigation as NavigationIcon } from "lucide-react";
import { listarHistorico, listarChoferes } from "../recorridoAdminService";
import { mensajeError, formatearFechaHora, formatearKm } from "../recorridoAdminUtils";

const PAGE_SIZE = 50;

const AvisoError = ({ mensaje }) => (
  <p className="flex items-center gap-1.5 text-xs text-red-600">
    <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {mensaje}
  </p>
);

const TabHistorial = ({ jornadas, onVerRecorrido }) => {
  const [jornadaId, setJornadaId] = useState("");
  const [busquedaChofer, setBusquedaChofer] = useState("");
  const [choferFiltro, setChoferFiltro] = useState(null); // { ci, nombre, apellido } | null
  const [sugerencias, setSugerencias] = useState([]);
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [pagina, setPagina] = useState(0);

  const [sesiones, setSesiones] = useState([]);
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    const data = await listarHistorico({
      jornadaId: jornadaId || null,
      ci: choferFiltro?.ci || null,
      fechaDesde: fechaDesde || null,
      fechaHasta: fechaHasta || null,
      limite: PAGE_SIZE,
      offset: pagina * PAGE_SIZE,
    });
    if (!data?.ok) {
      setError(mensajeError(data?.codigo));
      setSesiones([]);
      setTotal(0);
      setCargando(false);
      return;
    }
    setSesiones(data.sesiones || []);
    setTotal(data.total || 0);
    setCargando(false);
  }, [jornadaId, choferFiltro, fechaDesde, fechaHasta, pagina]);

  useEffect(() => {
    (async () => {
      await cargar();
    })();
  }, [cargar]);

  // Typeahead de choferes por nombre, con debounce de 300ms. Todo el cuerpo
  // (incluida la limpieza cuando el campo queda vacío o es solo dígitos) vive
  // dentro del IIFE para no reaccionar sobre respuestas obsoletas de una
  // tipeada anterior.
  useEffect(() => {
    let cancelado = false;
    (async () => {
      const texto = busquedaChofer.trim();
      if (choferFiltro || !texto || /^[0-9]+$/.test(texto)) {
        setSugerencias([]);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
      if (cancelado) return;
      const data = await listarChoferes({ busqueda: texto, limite: 8 });
      if (!cancelado) setSugerencias(data?.ok ? data.choferes || [] : []);
    })();
    return () => {
      cancelado = true;
    };
  }, [busquedaChofer, choferFiltro]);

  const totalPaginas = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const ciDirecto = /^[0-9]+$/.test(busquedaChofer.trim()) ? busquedaChofer.trim() : null;

  const aplicarFiltroCi = () => {
    if (ciDirecto) {
      setChoferFiltro({ ci: Number(ciDirecto) });
      setPagina(0);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 p-4 grid grid-cols-1 sm:grid-cols-4 gap-3">
        <label className="block">
          <span className="block text-xs font-medium text-slate-600 mb-1.5">Jornada</span>
          <select
            value={jornadaId}
            onChange={(e) => {
              setPagina(0);
              setJornadaId(e.target.value);
            }}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
          >
            <option value="">Todas</option>
            {jornadas.map((j) => (
              <option key={j.id} value={j.id}>{j.nombre}</option>
            ))}
          </select>
        </label>

        <div className="relative">
          <span className="block text-xs font-medium text-slate-600 mb-1.5">CI o nombre del chofer</span>
          {choferFiltro ? (
            <div className="flex items-center justify-between px-3 py-2 border border-brand-300 bg-brand-50 rounded-lg text-sm">
              <span className="text-brand-700 font-medium">
                {choferFiltro.nombre ? `${choferFiltro.nombre} ${choferFiltro.apellido || ""}` : `CI ${choferFiltro.ci}`}
              </span>
              <button
                type="button"
                onClick={() => {
                  setChoferFiltro(null);
                  setBusquedaChofer("");
                  setPagina(0);
                }}
                className="p-0.5 hover:bg-brand-100 rounded border-0 bg-transparent"
              >
                <X className="w-3.5 h-3.5 text-brand-700" />
              </button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={busquedaChofer}
                  onChange={(e) => setBusquedaChofer(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && aplicarFiltroCi()}
                  placeholder="Ej: 12345678 o Pérez"
                  className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                />
              </div>
              {(sugerencias.length > 0 || ciDirecto) && (
                <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {ciDirecto && (
                    <button
                      type="button"
                      onClick={aplicarFiltroCi}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 border-0 bg-transparent"
                    >
                      Buscar por CI exacta: <strong>{ciDirecto}</strong>
                    </button>
                  )}
                  {sugerencias.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setChoferFiltro({ ci: c.ci, nombre: c.nombre, apellido: c.apellido });
                        setBusquedaChofer("");
                        setPagina(0);
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 border-0 bg-transparent"
                    >
                      {c.nombre} {c.apellido} <span className="text-slate-400">(CI {c.ci})</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <label className="block">
          <span className="block text-xs font-medium text-slate-600 mb-1.5">Desde</span>
          <input
            type="date"
            value={fechaDesde}
            onChange={(e) => {
              setPagina(0);
              setFechaDesde(e.target.value);
            }}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
          />
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-slate-600 mb-1.5">Hasta</span>
          <input
            type="date"
            value={fechaHasta}
            onChange={(e) => {
              setPagina(0);
              setFechaHasta(e.target.value);
            }}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
          />
        </label>
      </div>

      {error && <AvisoError mensaje={error} />}

      <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Conductor</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Jornada</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Inicio</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Fin</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Km</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Paradas</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Alertas</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {cargando ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center">
                  <Loader2 className="w-5 h-5 text-brand-600 animate-spin mx-auto" />
                </td>
              </tr>
            ) : sesiones.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-sm text-slate-400">
                  Sin recorridos para los filtros aplicados.
                </td>
              </tr>
            ) : (
              sesiones.map((s) => (
                <tr key={s.sesion_id}>
                  <td className="px-3 py-2 whitespace-nowrap text-slate-700">{s.nombre} {s.apellido} <span className="text-slate-400">(CI {s.ci})</span></td>
                  <td className="px-3 py-2 whitespace-nowrap text-slate-500">{s.jornada_nombre}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-slate-500">{formatearFechaHora(s.iniciado_at)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-slate-500">{s.finalizado_at ? formatearFechaHora(s.finalizado_at) : "En curso"}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-slate-500">{formatearKm(s.km_acumulados)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-slate-500">{s.paradas_count ?? 0}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-slate-500">{s.alertas_count ?? 0}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() =>
                        onVerRecorrido({
                          sesionId: s.sesion_id,
                          nombre: s.nombre,
                          apellido: s.apellido,
                          ci: s.ci,
                          jornadaNombre: s.jornada_nombre,
                          kmAcumulados: s.km_acumulados,
                        })
                      }
                      className="inline-flex items-center gap-1 px-2.5 h-7 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded text-xs font-medium"
                    >
                      <NavigationIcon className="w-3.5 h-3.5" /> Ver recorrido
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-slate-500">
        <span>{total} sesión(es)</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPagina((p) => Math.max(0, p - 1))}
            disabled={pagina === 0}
            className="p-1.5 border border-slate-200 rounded-lg disabled:opacity-40 bg-white hover:bg-slate-50"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span>Página {pagina + 1} de {totalPaginas}</span>
          <button
            type="button"
            onClick={() => setPagina((p) => Math.min(totalPaginas - 1, p + 1))}
            disabled={pagina >= totalPaginas - 1}
            className="p-1.5 border border-slate-200 rounded-lg disabled:opacity-40 bg-white hover:bg-slate-50"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default TabHistorial;
