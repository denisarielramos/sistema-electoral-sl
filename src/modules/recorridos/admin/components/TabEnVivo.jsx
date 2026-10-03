// ======================= TAB: EN VIVO =======================
// Pantalla operativa principal. Polling cada 5s de recorrido_admin_listar_estado
// para la jornada activa — NUNCA Supabase Realtime. Disciplina de polling:
// una sola solicitud en vuelo a la vez, intervalo limpiado al desmontar,
// pausado cuando la pestaña no está visible, refresco inmediato al volver a
// estar visible, y botón manual de "Actualizar".
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, AlertTriangle, RefreshCw, Search, X, MapPinOff, Navigation as NavigationIcon } from "lucide-react";
import { listarEstado } from "../recorridoAdminService";
import { mensajeError, labelEstado, colorEstado, formatearFechaHora, formatearKm } from "../recorridoAdminUtils";
import MapaEnVivo from "./MapaEnVivo";

const POLL_MS = 5000;
const ESTADOS = ["no_iniciado", "en_movimiento", "detenido", "alerta_detencion", "sin_senal", "finalizado"];

// Prioridad de orden para listar alertas/sin señal primero (sección 13: no
// inventa reglas nuevas, solo reordena lo que el backend ya calculó).
const PRIORIDAD_ESTADO = {
  alerta_detencion: 0,
  sin_senal: 1,
  detenido: 2,
  en_movimiento: 3,
  no_iniciado: 4,
  finalizado: 5,
};

const AvisoError = ({ mensaje }) => (
  <p className="flex items-center gap-1.5 text-xs text-red-600">
    <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {mensaje}
  </p>
);

const Badge = ({ estado }) => (
  <span
    className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full font-medium"
    style={{ backgroundColor: `${colorEstado(estado)}1a`, color: colorEstado(estado) }}
  >
    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: colorEstado(estado) }} />
    {labelEstado(estado)}
  </span>
);

const TarjetaStat = ({ label, valor, destacado }) => (
  <div className={`rounded-xl border p-3 text-center ${destacado ? "border-red-200 bg-red-50" : "border-slate-200 bg-white"}`}>
    <p className={`text-xl font-bold ${destacado ? "text-red-600" : "text-slate-800"}`}>{valor ?? 0}</p>
    <p className="text-[11px] font-medium text-slate-500">{label}</p>
  </div>
);

const PanelChofer = ({ chofer, onCerrar, onVerRecorrido }) => (
  <div className="fixed inset-0 z-30 bg-black/40 flex items-center justify-center p-4">
    <div className="bg-white rounded-xl max-w-sm w-full p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-slate-800">{chofer.nombre} {chofer.apellido}</h3>
        <button onClick={onCerrar} className="p-1 hover:bg-slate-100 rounded-lg border-0 bg-transparent">
          <X className="w-4 h-4 text-slate-500" />
        </button>
      </div>
      <Badge estado={chofer.estado} />
      <dl className="text-sm space-y-1.5">
        <div className="flex justify-between"><dt className="text-slate-500">CI</dt><dd className="text-slate-700">{chofer.ci}</dd></div>
        <div className="flex justify-between"><dt className="text-slate-500">Seccional</dt><dd className="text-slate-700">{chofer.seccional || "—"}</dd></div>
        <div className="flex justify-between"><dt className="text-slate-500">Local/Colegio</dt><dd className="text-slate-700">{chofer.local_votacion || "—"}</dd></div>
        <div className="flex justify-between"><dt className="text-slate-500">Km recorridos</dt><dd className="text-slate-700">{formatearKm(chofer.km_acumulados)}</dd></div>
        <div className="flex justify-between"><dt className="text-slate-500">Paradas</dt><dd className="text-slate-700">{chofer.paradas_count ?? 0}</dd></div>
        <div className="flex justify-between"><dt className="text-slate-500">Última posición</dt><dd className="text-slate-700">{chofer.lat != null ? `${chofer.lat.toFixed(5)}, ${chofer.lng.toFixed(5)}` : "—"}</dd></div>
        <div className="flex justify-between"><dt className="text-slate-500">Hora capturada</dt><dd className="text-slate-700">{formatearFechaHora(chofer.capturado_at)}</dd></div>
        <div className="flex justify-between"><dt className="text-slate-500">Hora recibida</dt><dd className="text-slate-700">{formatearFechaHora(chofer.recibido_at)}</dd></div>
      </dl>
      {chofer.sesion_id && (
        <button
          type="button"
          onClick={() =>
            onVerRecorrido({
              sesionId: chofer.sesion_id,
              nombre: chofer.nombre,
              apellido: chofer.apellido,
              ci: chofer.ci,
              kmAcumulados: chofer.km_acumulados,
            })
          }
          className="w-full inline-flex items-center justify-center gap-2 px-4 h-9 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-medium border-0"
        >
          <NavigationIcon className="w-4 h-4" /> Ver recorrido
        </button>
      )}
    </div>
  </div>
);

const TabEnVivo = ({ jornadaActivaId, onVerRecorrido }) => {
  const [choferes, setChoferes] = useState([]);
  const [stats, setStats] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [seleccionado, setSeleccionado] = useState(null);

  const [busqueda, setBusqueda] = useState("");
  const [filtroSeccional, setFiltroSeccional] = useState("todas");
  const [filtroLocal, setFiltroLocal] = useState("todos");
  const [filtroEstado, setFiltroEstado] = useState("todos");

  const enVueloRef = useRef(false);

  const consultar = useCallback(async () => {
    if (!jornadaActivaId || enVueloRef.current) return;
    enVueloRef.current = true;
    const data = await listarEstado(jornadaActivaId);
    enVueloRef.current = false;
    if (!data?.ok) {
      setError(mensajeError(data?.codigo));
      setCargando(false);
      return;
    }
    setError("");
    setChoferes(data.choferes || []);
    setStats({
      total: data.total,
      iniciados: data.iniciados,
      no_iniciados: data.no_iniciados,
      en_movimiento: data.en_movimiento,
      detenidos: data.detenidos,
      alertas: data.alertas,
      sin_senal: data.sin_senal,
      finalizados: data.finalizados,
    });
    setCargando(false);
  }, [jornadaActivaId]);

  useEffect(() => {
    if (!jornadaActivaId) return;
    (async () => {
      setCargando(true);
      await consultar();
    })();
    const id = setInterval(() => {
      if (document.hidden) return;
      consultar();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [jornadaActivaId, consultar]);

  useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) consultar();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [consultar]);

  const seccionales = useMemo(
    () => Array.from(new Set(choferes.map((c) => c.seccional).filter(Boolean))).sort(),
    [choferes]
  );
  const locales = useMemo(
    () => Array.from(new Set(choferes.map((c) => c.local_votacion).filter(Boolean))).sort(),
    [choferes]
  );

  const filtrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return choferes
      .filter((c) => {
        if (filtroEstado !== "todos" && c.estado !== filtroEstado) return false;
        if (filtroSeccional !== "todas" && (c.seccional || "") !== filtroSeccional) return false;
        if (filtroLocal !== "todos" && (c.local_votacion || "") !== filtroLocal) return false;
        if (!texto) return true;
        const nombreCompleto = `${c.nombre} ${c.apellido}`.toLowerCase();
        return String(c.ci).includes(texto) || nombreCompleto.includes(texto);
      })
      .sort((a, b) => (PRIORIDAD_ESTADO[a.estado] ?? 9) - (PRIORIDAD_ESTADO[b.estado] ?? 9));
  }, [choferes, busqueda, filtroEstado, filtroSeccional, filtroLocal]);

  if (!jornadaActivaId) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400 text-sm gap-2">
        <MapPinOff className="w-6 h-6 text-slate-300" />
        No hay ninguna jornada activa. Activá una desde la pestaña Jornadas.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">Se actualiza sola cada 5 segundos mientras esta pestaña está visible.</p>
        <button
          type="button"
          onClick={consultar}
          disabled={cargando}
          className="inline-flex items-center gap-1.5 px-3 h-9 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-medium disabled:opacity-50"
        >
          {cargando ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Actualizar
        </button>
      </div>

      {error && <AvisoError mensaje={error} />}

      {cargando && !stats ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-brand-600 animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
            <TarjetaStat label="Total" valor={stats?.total} />
            <TarjetaStat label="Iniciados" valor={stats?.iniciados} />
            <TarjetaStat label="No iniciados" valor={stats?.no_iniciados} />
            <TarjetaStat label="En movimiento" valor={stats?.en_movimiento} />
            <TarjetaStat label="Detenidos" valor={stats?.detenidos} />
            <TarjetaStat label="Alertas" valor={stats?.alertas} destacado={stats?.alertas > 0} />
            <TarjetaStat label="Sin señal" valor={stats?.sin_senal} destacado={stats?.sin_senal > 0} />
            <TarjetaStat label="Finalizados" valor={stats?.finalizados} />
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4 grid grid-cols-1 sm:grid-cols-4 gap-3">
            <label className="block sm:col-span-2">
              <span className="block text-xs font-medium text-slate-600 mb-1.5">Buscar por CI o nombre</span>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                />
              </div>
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-slate-600 mb-1.5">Seccional</span>
              <select value={filtroSeccional} onChange={(e) => setFiltroSeccional(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm">
                <option value="todas">Todas</option>
                {seccionales.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-slate-600 mb-1.5">Local/Colegio</span>
              <select value={filtroLocal} onChange={(e) => setFiltroLocal(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm">
                <option value="todos">Todos</option>
                {locales.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </label>
            <label className="block sm:col-span-4">
              <span className="block text-xs font-medium text-slate-600 mb-1.5">Estado</span>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setFiltroEstado("todos")}
                  className={`px-2.5 h-7 rounded-full text-xs font-medium ${filtroEstado === "todos" ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600"}`}
                >
                  Todos
                </button>
                {ESTADOS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => setFiltroEstado(e)}
                    className={`px-2.5 h-7 rounded-full text-xs font-medium ${filtroEstado === e ? "text-white" : "text-slate-600"}`}
                    style={{ backgroundColor: filtroEstado === e ? colorEstado(e) : `${colorEstado(e)}1a` }}
                  >
                    {labelEstado(e)}
                  </button>
                ))}
              </div>
            </label>
          </div>

          <MapaEnVivo choferes={filtrados} onSeleccionar={setSeleccionado} />

          <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Estado</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">CI</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Nombre</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Seccional</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Km</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Última recepción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtrados.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-sm text-slate-400">
                      Sin resultados para los filtros aplicados.
                    </td>
                  </tr>
                ) : (
                  filtrados.map((c) => (
                    <tr
                      key={c.sesion_id || c.ci}
                      onClick={() => setSeleccionado(c)}
                      className="cursor-pointer hover:bg-slate-50"
                    >
                      <td className="px-3 py-2"><Badge estado={c.estado} /></td>
                      <td className="px-3 py-2 whitespace-nowrap text-slate-700">{c.ci}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-slate-700">{c.nombre} {c.apellido}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-slate-500">{c.seccional || "—"}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-slate-500">{formatearKm(c.km_acumulados)}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-slate-500">{formatearFechaHora(c.recibido_at)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {seleccionado && (
        <PanelChofer chofer={seleccionado} onCerrar={() => setSeleccionado(null)} onVerRecorrido={onVerRecorrido} />
      )}
    </div>
  );
};

export default TabEnVivo;
