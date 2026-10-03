// ======================= TAB: ASIGNACIONES Y CÓDIGOS =======================
// Asignación masiva de choferes a una jornada + generación de códigos
// temporales + gestión de asignaciones existentes (regeneración puntual).
// El código en texto plano de una asignación NUEVA solo existe en la
// respuesta de recorrido_admin_asignar_choferes / recorrido_admin_regenerar_codigo
// — nunca se puede volver a leer después. Por eso esta pantalla fuerza la
// exportación inmediata a Excel y advierte explícitamente que, si se cierra
// sin copiar/exportar, el código se pierde (la única salida es regenerarlo,
// invalidando el anterior).
import React, { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  AlertTriangle,
  Search,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  RefreshCw,
  Check,
  X,
  KeyRound,
} from "lucide-react";
import { listarChoferes, asignarChoferes, listarAsignaciones, regenerarCodigo } from "../recorridoAdminService";
import { mensajeError, formatearFechaHora } from "../recorridoAdminUtils";

const PAGE_SIZE = 50;

const AvisoError = ({ mensaje }) => (
  <p className="flex items-center gap-1.5 text-xs text-red-600 mt-1.5">
    <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {mensaje}
  </p>
);

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

const COLUMNAS_EXPORT = [
  { header: "CI", key: "ci" },
  { header: "Nombre", key: "nombre" },
  { header: "Apellido", key: "apellido" },
  { header: "Teléfono", key: "telefono" },
  { header: "Seccional", key: "seccional" },
  { header: "Local / colegio", key: "local_votacion" },
  { header: "Código", key: "codigo" },
  { header: "Expira", key: "expira" },
  { header: "URL", key: "url" },
];

const exportarCodigosExcel = async (filas, nombreJornada) => {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  const hoja = workbook.addWorksheet("Códigos");
  hoja.columns = COLUMNAS_EXPORT;
  filas.forEach((f) => hoja.addRow(f));
  hoja.getRow(1).font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const slug = (nombreJornada || "jornada").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  downloadBlob(blob, `codigos-recorrido-${slug}-${new Date().toISOString().slice(0, 10)}.xlsx`);
};

const filaExport = (item, choferesPorCi) => {
  const chofer = choferesPorCi[item.ci] || {};
  return {
    ci: item.ci,
    nombre: item.nombre,
    apellido: item.apellido || "",
    telefono: chofer.telefono || "",
    seccional: chofer.seccional || "",
    local_votacion: chofer.local_votacion || "",
    codigo: item.codigo,
    expira: formatearFechaHora(item.codigo_expira_at),
    url: `${window.location.origin}/recorrido`,
  };
};

// ----------------------------------------------------- Modal de resultados
const ModalResultados = ({ resultados, rechazados, choferesPorCi, nombreJornada, onCerrar }) => {
  const [copiadoCi, setCopiadoCi] = useState(null);
  const [exportando, setExportando] = useState(false);

  const copiar = async (codigo, ci) => {
    try {
      await navigator.clipboard.writeText(codigo);
      setCopiadoCi(ci);
      setTimeout(() => setCopiadoCi(null), 1500);
    } catch {
      // Sin permiso de portapapeles: el usuario puede seleccionar el texto a mano.
    }
  };

  const exportar = async () => {
    setExportando(true);
    try {
      await exportarCodigosExcel(resultados.map((r) => filaExport(r, choferesPorCi)), nombreJornada);
    } finally {
      setExportando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-30 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-3xl w-full p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-800">Códigos generados</h3>
          <button onClick={onCerrar} className="p-1 hover:bg-slate-100 rounded-lg border-0 bg-transparent">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        <div className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            Los códigos no pueden recuperarse después de cerrar esta pantalla. Si se pierde uno, deberá regenerarse.
          </span>
        </div>

        <button
          type="button"
          onClick={exportar}
          disabled={exportando || resultados.length === 0}
          className="inline-flex items-center gap-2 px-4 h-9 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium border-0"
        >
          {exportando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          Exportar todos a Excel
        </button>

        {resultados.length > 0 && (
          <div className="rounded-lg border border-slate-200 overflow-x-auto max-h-80">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 sticky top-0">
                <tr>
                  <th className="px-2 py-1.5 text-left text-xs font-medium text-slate-500">CI</th>
                  <th className="px-2 py-1.5 text-left text-xs font-medium text-slate-500">Nombre</th>
                  <th className="px-2 py-1.5 text-left text-xs font-medium text-slate-500">Teléfono</th>
                  <th className="px-2 py-1.5 text-left text-xs font-medium text-slate-500">Código</th>
                  <th className="px-2 py-1.5 text-left text-xs font-medium text-slate-500">Expira</th>
                  <th className="px-2 py-1.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {resultados.map((r) => (
                  <tr key={r.ci}>
                    <td className="px-2 py-1.5">{r.ci}</td>
                    <td className="px-2 py-1.5">{r.nombre} {r.apellido}</td>
                    <td className="px-2 py-1.5">{choferesPorCi[r.ci]?.telefono || "—"}</td>
                    <td className="px-2 py-1.5 font-mono font-semibold text-brand-700">{r.codigo}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap text-slate-500">{formatearFechaHora(r.codigo_expira_at)}</td>
                    <td className="px-2 py-1.5 text-right">
                      <button
                        type="button"
                        onClick={() => copiar(r.codigo, r.ci)}
                        title="Copiar código"
                        className="p-1 hover:bg-slate-100 rounded border-0 bg-transparent"
                      >
                        {copiadoCi === r.ci ? (
                          <Check className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <Copy className="w-4 h-4 text-slate-400" />
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {rechazados.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-slate-500">{rechazados.length} no se procesaron:</p>
            <div className="rounded-lg border border-slate-200 max-h-40 overflow-y-auto">
              <table className="w-full text-xs">
                <tbody className="divide-y divide-slate-100">
                  {rechazados.map((r, i) => (
                    <tr key={i}>
                      <td className="px-2 py-1">{r.ci}</td>
                      <td className="px-2 py-1 text-slate-500">{mensajeError(r.codigo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onCerrar}
            className="px-4 h-9 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-medium"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};

// ----------------------------------------------------- Panel: asignar
const PanelAsignar = ({ jornadaId, nombreJornada, onAsignado }) => {
  const [choferes, setChoferes] = useState([]);
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [pagina, setPagina] = useState(0);
  const [seleccionados, setSeleccionados] = useState(() => new Set());
  const [choferesPorCi, setChoferesPorCi] = useState({});
  const [horas, setHoras] = useState(48);
  const [generando, setGenerando] = useState(false);
  const [resultado, setResultado] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    const data = await listarChoferes({
      busqueda: busqueda.trim() || null,
      soloActivos: true,
      limite: PAGE_SIZE,
      offset: pagina * PAGE_SIZE,
    });
    if (!data?.ok) {
      setError(mensajeError(data?.codigo));
      setChoferes([]);
      setTotal(0);
      setCargando(false);
      return;
    }
    setChoferes(data.choferes || []);
    setTotal(data.total || 0);
    setChoferesPorCi((prev) => {
      const next = { ...prev };
      (data.choferes || []).forEach((c) => { next[c.ci] = c; });
      return next;
    });
    setCargando(false);
  }, [busqueda, pagina]);

  useEffect(() => {
    (async () => {
      await cargar();
    })();
  }, [cargar]);

  const totalPaginas = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const visiblesSeleccionados = choferes.length > 0 && choferes.every((c) => seleccionados.has(c.ci));

  const alternarUno = (ci) => {
    setSeleccionados((prev) => {
      const next = new Set(prev);
      if (next.has(ci)) next.delete(ci);
      else next.add(ci);
      return next;
    });
  };

  const alternarVisibles = () => {
    setSeleccionados((prev) => {
      const next = new Set(prev);
      if (visiblesSeleccionados) {
        choferes.forEach((c) => next.delete(c.ci));
      } else {
        choferes.forEach((c) => next.add(c.ci));
      }
      return next;
    });
  };

  const generar = async () => {
    if (seleccionados.size === 0) return;
    setGenerando(true);
    setError("");
    const data = await asignarChoferes(jornadaId, Array.from(seleccionados), Number(horas) || 48);
    setGenerando(false);
    if (!data?.ok) {
      setError(mensajeError(data?.codigo));
      return;
    }
    setResultado({ resultados: data.resultados || [], rechazados: data.rechazados || [] });
    setSeleccionados(new Set());
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="block sm:col-span-2">
          <span className="block text-xs font-medium text-slate-600 mb-1.5">Buscar chofer</span>
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={busqueda}
              onChange={(e) => {
                setPagina(0);
                setBusqueda(e.target.value);
              }}
              className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            />
          </div>
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-slate-600 mb-1.5">Expiración (horas)</span>
          <input
            type="number"
            min={1}
            max={720}
            value={horas}
            onChange={(e) => setHoras(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
          />
        </label>
      </div>

      {error && <AvisoError mensaje={error} />}

      <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-3 py-2 w-8">
                <input type="checkbox" checked={visiblesSeleccionados} onChange={alternarVisibles} className="rounded border-slate-300" />
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">CI</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Nombre</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Seccional</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Local/Colegio</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {cargando ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center">
                  <Loader2 className="w-5 h-5 text-brand-600 animate-spin mx-auto" />
                </td>
              </tr>
            ) : choferes.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-sm text-slate-400">
                  Sin choferes activos para mostrar.
                </td>
              </tr>
            ) : (
              choferes.map((c) => (
                <tr key={c.id} className={seleccionados.has(c.ci) ? "bg-brand-50/40" : undefined}>
                  <td className="px-3 py-2">
                    <input type="checkbox" checked={seleccionados.has(c.ci)} onChange={() => alternarUno(c.ci)} className="rounded border-slate-300" />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-slate-700">{c.ci}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-slate-700">{c.nombre} {c.apellido}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-slate-500">{c.seccional || "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-slate-500">{c.local_votacion || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-slate-500">
        <span>{total} chofer(es) activo(s) en total</span>
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

      <div className="sticky bottom-0 bg-white border-t border-slate-200 -mx-4 px-4 py-3 flex items-center justify-between">
        <span className="text-sm text-slate-600">{seleccionados.size} chofer(es) seleccionado(s)</span>
        <button
          type="button"
          onClick={generar}
          disabled={generando || seleccionados.size === 0}
          className="inline-flex items-center gap-2 px-4 h-9 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium border-0"
        >
          {generando ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
          Generar códigos
        </button>
      </div>

      {resultado && (
        <ModalResultados
          resultados={resultado.resultados}
          rechazados={resultado.rechazados}
          choferesPorCi={choferesPorCi}
          nombreJornada={nombreJornada}
          onCerrar={() => {
            setResultado(null);
            onAsignado();
          }}
        />
      )}
    </div>
  );
};

// ----------------------------------------------------- Modal confirmar regeneración
const ModalConfirmarRegenerar = ({ asignacion, onCancelar, onConfirmar, procesando }) => (
  <div className="fixed inset-0 z-30 bg-black/40 flex items-center justify-center p-4">
    <div className="bg-white rounded-xl max-w-md w-full p-5 space-y-3">
      <h3 className="text-base font-semibold text-slate-800">Regenerar código</h3>
      <p className="text-sm text-slate-600">
        Chofer: <strong>{asignacion.nombre} {asignacion.apellido}</strong> (CI {asignacion.ci})
      </p>
      <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
        El código anterior dejará de funcionar.
      </p>
      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancelar}
          disabled={procesando}
          className="px-4 h-9 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-medium"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={onConfirmar}
          disabled={procesando}
          className="inline-flex items-center gap-2 px-4 h-9 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium border-0"
        >
          {procesando && <Loader2 className="w-4 h-4 animate-spin" />}
          Regenerar
        </button>
      </div>
    </div>
  </div>
);

const ModalCodigoRegenerado = ({ resultado, onCerrar }) => {
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(resultado.codigo);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      // Sin permiso de portapapeles: se puede seleccionar el texto a mano.
    }
  };
  return (
    <div className="fixed inset-0 z-30 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-sm w-full p-5 space-y-3">
        <h3 className="text-base font-semibold text-slate-800">Nuevo código</h3>
        <p className="text-sm text-slate-600">{resultado.nombre} {resultado.apellido} (CI {resultado.ci})</p>
        <div className="flex items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
          <span className="font-mono font-semibold text-brand-700 text-lg">{resultado.codigo}</span>
          <button onClick={copiar} className="p-1.5 hover:bg-slate-100 rounded border-0 bg-transparent" title="Copiar">
            {copiado ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-slate-400" />}
          </button>
        </div>
        <p className="text-xs text-slate-500">Expira: {formatearFechaHora(resultado.codigo_expira_at)}</p>
        <p className="text-xs text-red-600">Este código no podrá volver a verse después de cerrar esta ventana.</p>
        <div className="flex justify-end">
          <button onClick={onCerrar} className="px-4 h-9 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-medium border-0">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};

// ----------------------------------------------------- Panel: existentes
const PanelExistentes = ({ jornadaId }) => {
  const [asignaciones, setAsignaciones] = useState([]);
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [pagina, setPagina] = useState(0);
  const [confirmarId, setConfirmarId] = useState(null);
  const [procesandoId, setProcesandoId] = useState(null);
  const [codigoRegenerado, setCodigoRegenerado] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    const data = await listarAsignaciones({
      jornadaId,
      busqueda: busqueda.trim() || null,
      limite: PAGE_SIZE,
      offset: pagina * PAGE_SIZE,
    });
    if (!data?.ok) {
      setError(mensajeError(data?.codigo));
      setAsignaciones([]);
      setTotal(0);
      setCargando(false);
      return;
    }
    setAsignaciones(data.asignaciones || []);
    setTotal(data.total || 0);
    setCargando(false);
  }, [jornadaId, busqueda, pagina]);

  useEffect(() => {
    (async () => {
      await cargar();
    })();
  }, [cargar]);

  const confirmarRegenerar = async (asignacion) => {
    setProcesandoId(asignacion.asignacion_id);
    const data = await regenerarCodigo(asignacion.asignacion_id, 48);
    setProcesandoId(null);
    setConfirmarId(null);
    if (!data?.ok) {
      setError(mensajeError(data?.codigo));
      return;
    }
    setCodigoRegenerado(data);
    cargar();
  };

  const totalPaginas = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const asignacionConfirmar = asignaciones.find((a) => a.asignacion_id === confirmarId);

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por CI, nombre o apellido"
            value={busqueda}
            onChange={(e) => {
              setPagina(0);
              setBusqueda(e.target.value);
            }}
            className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
          />
        </div>
        <button
          type="button"
          onClick={cargar}
          disabled={cargando}
          className="inline-flex items-center gap-1.5 px-3 h-9 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-medium disabled:opacity-50"
        >
          {cargando ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Actualizar
        </button>
      </div>

      {error && <AvisoError mensaje={error} />}

      <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">CI</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Nombre</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Teléfono</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Código expira</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Sesión</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {cargando ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center">
                  <Loader2 className="w-5 h-5 text-brand-600 animate-spin mx-auto" />
                </td>
              </tr>
            ) : asignaciones.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-sm text-slate-400">
                  Todavía no hay choferes asignados a esta jornada.
                </td>
              </tr>
            ) : (
              asignaciones.map((a) => (
                <tr key={a.asignacion_id}>
                  <td className="px-3 py-2 whitespace-nowrap text-slate-700">{a.ci}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-slate-700">{a.nombre} {a.apellido}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-slate-500">{a.telefono || "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-slate-500">{formatearFechaHora(a.codigo_expira_at)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-slate-500">
                    {a.sesion_id ? (a.finalizado_at ? "Finalizada" : a.iniciado_at ? "En curso" : "—") : "Sin iniciar"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => setConfirmarId(a.asignacion_id)}
                      disabled={procesandoId === a.asignacion_id}
                      className="inline-flex items-center gap-1 px-2.5 h-7 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded text-xs font-medium disabled:opacity-50"
                    >
                      {procesandoId === a.asignacion_id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}
                      Regenerar código
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-slate-500">
        <span>{total} asignación(es)</span>
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

      {asignacionConfirmar && (
        <ModalConfirmarRegenerar
          asignacion={asignacionConfirmar}
          onCancelar={() => setConfirmarId(null)}
          onConfirmar={() => confirmarRegenerar(asignacionConfirmar)}
          procesando={procesandoId === asignacionConfirmar.asignacion_id}
        />
      )}

      {codigoRegenerado && <ModalCodigoRegenerado resultado={codigoRegenerado} onCerrar={() => setCodigoRegenerado(null)} />}
    </div>
  );
};

// ----------------------------------------------------- Componente principal
const TabAsignaciones = ({ jornadas, jornadaActivaId }) => {
  // null = sin selección manual todavía: se usa la jornada activa (o la
  // primera) como default derivado, sin necesidad de sincronizarlo en un
  // efecto — así responde solo si `jornadas` llega después de montar el tab.
  const [jornadaIdManual, setJornadaIdManual] = useState(null);
  const [subtab, setSubtab] = useState("asignar");
  const jornadaId = jornadaIdManual || jornadaActivaId || jornadas[0]?.id || "";

  if (jornadas.length === 0) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400 text-sm">
        Creá una jornada primero en la pestaña Jornadas.
      </div>
    );
  }

  const jornadaSeleccionada = jornadas.find((j) => j.id === jornadaId);

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-slate-600 font-medium">Jornada:</span>
          <select
            value={jornadaId}
            onChange={(e) => setJornadaIdManual(e.target.value)}
            className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
          >
            {jornadas.map((j) => (
              <option key={j.id} value={j.id}>
                {j.nombre} {j.activa ? "(activa)" : ""}
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-1.5 ml-auto">
          <button
            type="button"
            onClick={() => setSubtab("asignar")}
            className={`px-3 h-8 rounded-lg text-sm font-medium ${subtab === "asignar" ? "bg-brand-50 text-brand-600" : "text-slate-500 hover:bg-slate-100"}`}
          >
            Asignar
          </button>
          <button
            type="button"
            onClick={() => setSubtab("existentes")}
            className={`px-3 h-8 rounded-lg text-sm font-medium ${subtab === "existentes" ? "bg-brand-50 text-brand-600" : "text-slate-500 hover:bg-slate-100"}`}
          >
            Asignaciones existentes
          </button>
        </div>
      </div>

      {jornadaId && subtab === "asignar" && (
        <PanelAsignar jornadaId={jornadaId} nombreJornada={jornadaSeleccionada?.nombre} onAsignado={() => setSubtab("existentes")} />
      )}
      {jornadaId && subtab === "existentes" && <PanelExistentes jornadaId={jornadaId} />}
    </div>
  );
};

export default TabAsignaciones;
