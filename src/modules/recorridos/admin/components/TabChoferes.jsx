// ======================= TAB: CHOFERES =======================
// Roster administrativo propio del módulo (NUNCA cruza con `padron`/votantes).
// Búsqueda + paginación + alta/edición manual (CI no editable, lo impone el
// backend) + importación Excel con vista previa y envío en lotes de ≤500.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, AlertTriangle, Plus, Pencil, Search, Upload, ChevronLeft, ChevronRight, X, CheckCircle2 } from "lucide-react";
import { listarChoferes, crearChofer, actualizarChofer, importarChoferes } from "../recorridoAdminService";
import { mensajeError, normalizarEncabezado } from "../recorridoAdminUtils";

const PAGE_SIZE = 50;
const LOTE_MAXIMO = 500;
const ALIAS_LOCAL = ["local_votacion", "local", "colegio", "local de votacion"];

const AvisoError = ({ mensaje }) => (
  <p className="flex items-center gap-1.5 text-xs text-red-600 mt-1.5">
    <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {mensaje}
  </p>
);

// ----------------------------------------------------- Modal alta/edición
const ModalChofer = ({ chofer, onCerrar, onGuardado }) => {
  const [ci, setCi] = useState(chofer?.ci ?? "");
  const [nombre, setNombre] = useState(chofer?.nombre || "");
  const [apellido, setApellido] = useState(chofer?.apellido || "");
  const [telefono, setTelefono] = useState(chofer?.telefono || "");
  const [seccional, setSeccional] = useState(chofer?.seccional || "");
  const [localVotacion, setLocalVotacion] = useState(chofer?.local_votacion || "");
  const [activo, setActivo] = useState(chofer?.activo ?? true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const guardar = async () => {
    const ciNum = Number(ci);
    if (!chofer && (!ci || !Number.isInteger(ciNum) || ciNum <= 0)) {
      setError("La cédula debe ser un número válido.");
      return;
    }
    if (!nombre.trim()) {
      setError("El nombre es obligatorio.");
      return;
    }
    setGuardando(true);
    setError("");
    const data = chofer
      ? await actualizarChofer({
          choferId: chofer.id,
          nombre: nombre.trim(),
          apellido: apellido.trim() || null,
          telefono: telefono.trim() || null,
          seccional: seccional.trim() || null,
          localVotacion: localVotacion.trim() || null,
          activo,
        })
      : await crearChofer({
          ci: ciNum,
          nombre: nombre.trim(),
          apellido: apellido.trim() || null,
          telefono: telefono.trim() || null,
          seccional: seccional.trim() || null,
          localVotacion: localVotacion.trim() || null,
        });
    setGuardando(false);
    if (!data?.ok) {
      setError(mensajeError(data?.codigo));
      return;
    }
    onGuardado();
  };

  return (
    <div className="fixed inset-0 z-30 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-lg w-full p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        <h3 className="text-base font-semibold text-slate-800">{chofer ? "Editar chofer" : "Nuevo chofer"}</h3>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-xs font-medium text-slate-500 mb-1">Cédula</span>
            <input
              type="text"
              inputMode="numeric"
              value={ci}
              disabled={!!chofer}
              onChange={(e) => setCi(e.target.value.replace(/\D/g, ""))}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm disabled:bg-slate-100 disabled:text-slate-400 focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            />
            {chofer && <span className="block text-[11px] text-slate-400 mt-1">La cédula no se puede modificar.</span>}
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-slate-500 mb-1">Teléfono</span>
            <input
              type="text"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-slate-500 mb-1">Nombre</span>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              autoFocus
            />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-slate-500 mb-1">Apellido</span>
            <input
              type="text"
              value={apellido}
              onChange={(e) => setApellido(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-slate-500 mb-1">Seccional</span>
            <input
              type="text"
              value={seccional}
              onChange={(e) => setSeccional(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-slate-500 mb-1">Local / colegio</span>
            <input
              type="text"
              value={localVotacion}
              onChange={(e) => setLocalVotacion(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            />
          </label>
        </div>
        {chofer && (
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} className="rounded border-slate-300" />
            Activo
          </label>
        )}
        {error && <AvisoError mensaje={error} />}
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onCerrar}
            disabled={guardando}
            className="px-4 h-9 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-medium"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={guardar}
            disabled={guardando}
            className="inline-flex items-center gap-2 px-4 h-9 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium border-0"
          >
            {guardando && <Loader2 className="w-4 h-4 animate-spin" />}
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
};

// ----------------------------------------------------- Importación Excel
const leerArchivoExcel = async (file) => {
  const ExcelJS = await import("exceljs");
  const buffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const hoja = workbook.worksheets[0];
  if (!hoja) return { headers: [], filas: [] };

  const headers = [];
  hoja.getRow(1).eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber - 1] = String(cell.value ?? "").trim();
  });

  const filas = [];
  hoja.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const valores = [];
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      valores[colNumber - 1] = cell.value;
    });
    const vacia = valores.every((v) => v === undefined || v === null || String(v).trim() === "");
    if (!vacia) filas.push(valores);
  });

  return { headers, filas };
};

const mapaColumnas = (headers) => {
  const idx = {};
  headers.forEach((h, i) => {
    const norm = normalizarEncabezado(h);
    if (norm === "ci") idx.ci = i;
    else if (norm === "nombre") idx.nombre = i;
    else if (norm === "apellido") idx.apellido = i;
    else if (norm === "telefono") idx.telefono = i;
    else if (norm === "seccional") idx.seccional = i;
    else if (ALIAS_LOCAL.includes(norm)) idx.local_votacion = i;
  });
  return idx;
};

const celdaATexto = (valor) => {
  if (valor === undefined || valor === null) return "";
  if (typeof valor === "number") return String(Math.trunc(valor));
  if (typeof valor === "object" && valor.result !== undefined) return String(valor.result).trim();
  return String(valor).trim();
};

const filaAChofer = (fila, idx) => ({
  ci: celdaATexto(fila[idx.ci]),
  nombre: celdaATexto(fila[idx.nombre]),
  apellido: celdaATexto(fila[idx.apellido]) || null,
  telefono: celdaATexto(fila[idx.telefono]) || null,
  seccional: celdaATexto(fila[idx.seccional]) || null,
  local_votacion: celdaATexto(fila[idx.local_votacion]) || null,
});

const ModalImportar = ({ onCerrar, onFinalizado }) => {
  const inputRef = useRef(null);
  const [cargandoArchivo, setCargandoArchivo] = useState(false);
  const [error, setError] = useState("");
  const [choferes, setChoferes] = useState(null); // array completo parseado
  const [columnasFaltantes, setColumnasFaltantes] = useState([]);
  const [importando, setImportando] = useState(false);
  const [progreso, setProgreso] = useState(null); // { hecho, total }
  const [resultado, setResultado] = useState(null);

  const procesarArchivo = async (file) => {
    setCargandoArchivo(true);
    setError("");
    setChoferes(null);
    try {
      const { headers, filas } = await leerArchivoExcel(file);
      const idx = mapaColumnas(headers);
      const faltantes = ["ci", "nombre"].filter((campo) => idx[campo] === undefined);
      setColumnasFaltantes(faltantes);
      if (faltantes.length > 0) {
        setCargandoArchivo(false);
        return;
      }
      setChoferes(filas.map((fila) => filaAChofer(fila, idx)));
    } catch {
      setError("No se pudo leer el archivo. Verificá que sea un Excel (.xlsx) válido.");
    }
    setCargandoArchivo(false);
  };

  const advertencias = React.useMemo(() => {
    if (!choferes) return [];
    const sinCi = choferes.filter((c) => !c.ci || !/^[0-9]+$/.test(c.ci)).length;
    const sinNombre = choferes.filter((c) => !c.nombre).length;
    const avisos = [];
    if (sinCi > 0) avisos.push(`${sinCi} fila(s) sin cédula válida — se rechazarán.`);
    if (sinNombre > 0) avisos.push(`${sinNombre} fila(s) sin nombre — se rechazarán.`);
    return avisos;
  }, [choferes]);

  const confirmarImportacion = async () => {
    if (!choferes || choferes.length === 0) return;
    setImportando(true);
    setError("");
    const lotes = [];
    for (let i = 0; i < choferes.length; i += LOTE_MAXIMO) {
      lotes.push(choferes.slice(i, i + LOTE_MAXIMO));
    }

    const acumulado = { creados: 0, actualizados: 0, rechazados: 0, detalles_rechazados: [] };
    for (let i = 0; i < lotes.length; i++) {
      setProgreso({ hecho: i, total: lotes.length });
      const data = await importarChoferes(lotes[i]);
      if (!data?.ok) {
        setError(mensajeError(data?.codigo));
        setImportando(false);
        return;
      }
      acumulado.creados += data.creados || 0;
      acumulado.actualizados += data.actualizados || 0;
      acumulado.rechazados += data.rechazados || 0;
      const offset = i * LOTE_MAXIMO;
      (data.detalles_rechazados || []).forEach((d) => {
        acumulado.detalles_rechazados.push({ ...d, indice: (d.indice || 0) + offset });
      });
    }
    setProgreso({ hecho: lotes.length, total: lotes.length });
    setImportando(false);
    setResultado(acumulado);
  };

  return (
    <div className="fixed inset-0 z-30 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-2xl w-full p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-800">Importar choferes desde Excel</h3>
          <button onClick={onCerrar} className="p-1 hover:bg-slate-100 rounded-lg border-0 bg-transparent">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        {resultado ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              <span className="text-sm font-medium">Importación finalizada.</span>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="text-xl font-bold text-emerald-600">{resultado.creados}</p>
                <p className="text-xs text-slate-500">Creados</p>
              </div>
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="text-xl font-bold text-brand-600">{resultado.actualizados}</p>
                <p className="text-xs text-slate-500">Actualizados</p>
              </div>
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="text-xl font-bold text-red-600">{resultado.rechazados}</p>
                <p className="text-xs text-slate-500">Rechazados</p>
              </div>
            </div>
            {resultado.detalles_rechazados.length > 0 && (
              <div className="rounded-lg border border-slate-200 max-h-48 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      <th className="px-2 py-1 text-left">Fila</th>
                      <th className="px-2 py-1 text-left">CI</th>
                      <th className="px-2 py-1 text-left">Motivo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {resultado.detalles_rechazados.map((d, i) => (
                      <tr key={i}>
                        <td className="px-2 py-1">{d.indice}</td>
                        <td className="px-2 py-1">{d.ci ?? "—"}</td>
                        <td className="px-2 py-1">{mensajeError(d.codigo)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onFinalizado}
                className="px-4 h-9 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-medium border-0"
              >
                Cerrar
              </button>
            </div>
          </div>
        ) : choferes ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              {choferes.length} fila(s) detectada(s). Se enviarán en lotes de hasta {LOTE_MAXIMO}.
            </p>
            {advertencias.map((a, i) => (
              <p key={i} className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                {a}
              </p>
            ))}
            <div className="rounded-lg border border-slate-200 overflow-x-auto max-h-64">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="px-2 py-1 text-left">CI</th>
                    <th className="px-2 py-1 text-left">Nombre</th>
                    <th className="px-2 py-1 text-left">Apellido</th>
                    <th className="px-2 py-1 text-left">Teléfono</th>
                    <th className="px-2 py-1 text-left">Seccional</th>
                    <th className="px-2 py-1 text-left">Local/Colegio</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {choferes.slice(0, 10).map((c, i) => (
                    <tr key={i}>
                      <td className="px-2 py-1">{c.ci}</td>
                      <td className="px-2 py-1">{c.nombre}</td>
                      <td className="px-2 py-1">{c.apellido || "—"}</td>
                      <td className="px-2 py-1">{c.telefono || "—"}</td>
                      <td className="px-2 py-1">{c.seccional || "—"}</td>
                      <td className="px-2 py-1">{c.local_votacion || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {choferes.length > 10 && <p className="text-xs text-slate-400">… y {choferes.length - 10} fila(s) más.</p>}
            {error && <AvisoError mensaje={error} />}
            {importando && progreso && (
              <p className="text-xs text-slate-500 flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Importando lote {progreso.hecho + 1} de {progreso.total}…
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setChoferes(null)}
                disabled={importando}
                className="px-4 h-9 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-medium disabled:opacity-50"
              >
                Elegir otro archivo
              </button>
              <button
                type="button"
                onClick={confirmarImportacion}
                disabled={importando}
                className="inline-flex items-center gap-2 px-4 h-9 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium border-0"
              >
                {importando && <Loader2 className="w-4 h-4 animate-spin" />}
                Confirmar importación
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              Columnas esperadas: <code>ci</code>, <code>nombre</code>, <code>apellido</code>, <code>telefono</code>,{" "}
              <code>seccional</code>, <code>local_votacion</code> (también se acepta <code>local</code>, <code>colegio</code> o
              "local de votación").
            </p>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={cargandoArchivo}
              className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-slate-300 rounded-xl py-10 text-slate-500 hover:border-brand-400 hover:text-brand-600 transition-colors disabled:opacity-50"
            >
              {cargandoArchivo ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
              {cargandoArchivo ? "Leyendo archivo…" : "Hacé clic para elegir el Excel"}
            </button>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) procesarArchivo(file);
                e.target.value = "";
              }}
            />
            {columnasFaltantes.length > 0 && (
              <AvisoError mensaje={`Faltan columnas obligatorias: ${columnasFaltantes.join(", ")}.`} />
            )}
            {error && <AvisoError mensaje={error} />}
          </div>
        )}
      </div>
    </div>
  );
};

// ----------------------------------------------------- Componente principal
const TabChoferes = () => {
  const [choferes, setChoferes] = useState([]);
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [filtroActivo, setFiltroActivo] = useState("todos"); // todos | activos | inactivos
  const [pagina, setPagina] = useState(0);
  const [modalChofer, setModalChofer] = useState(null); // null | "crear" | chofer
  const [modalImportar, setModalImportar] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    const data = await listarChoferes({
      busqueda: busqueda.trim() || null,
      soloActivos: filtroActivo === "todos" ? null : filtroActivo === "activos",
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
    setCargando(false);
  }, [busqueda, filtroActivo, pagina]);

  useEffect(() => {
    (async () => {
      await cargar();
    })();
  }, [cargar]);

  const totalPaginas = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 p-4 grid grid-cols-1 sm:grid-cols-4 gap-3">
        <label className="block sm:col-span-2">
          <span className="block text-xs font-medium text-slate-600 mb-1.5">Buscar por CI, nombre o apellido</span>
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
          <span className="block text-xs font-medium text-slate-600 mb-1.5">Estado</span>
          <select
            value={filtroActivo}
            onChange={(e) => {
              setPagina(0);
              setFiltroActivo(e.target.value);
            }}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
          >
            <option value="todos">Todos</option>
            <option value="activos">Activos</option>
            <option value="inactivos">Inactivos</option>
          </select>
        </label>
        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={() => setModalImportar(true)}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 h-9 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-medium"
          >
            <Upload className="w-4 h-4" /> Excel
          </button>
          <button
            type="button"
            onClick={() => setModalChofer("crear")}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 h-9 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-medium border-0"
          >
            <Plus className="w-4 h-4" /> Nuevo
          </button>
        </div>
      </div>

      {error && <AvisoError mensaje={error} />}

      <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">CI</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Nombre</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Teléfono</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Seccional</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Local/Colegio</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Estado</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {cargando ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center">
                  <Loader2 className="w-5 h-5 text-brand-600 animate-spin mx-auto" />
                </td>
              </tr>
            ) : choferes.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-sm text-slate-400">
                  Sin choferes para mostrar.
                </td>
              </tr>
            ) : (
              choferes.map((c) => (
                <tr key={c.id}>
                  <td className="px-3 py-2 whitespace-nowrap text-slate-700">{c.ci}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-slate-700">{c.nombre} {c.apellido}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-slate-500">{c.telefono || "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-slate-500">{c.seccional || "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-slate-500">{c.local_votacion || "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.activo ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                      {c.activo ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => setModalChofer(c)}
                      title="Editar"
                      className="p-1.5 hover:bg-slate-100 rounded-lg border-0 bg-transparent"
                    >
                      <Pencil className="w-4 h-4 text-slate-500" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-slate-500">
        <span>{total} chofer(es) en total</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPagina((p) => Math.max(0, p - 1))}
            disabled={pagina === 0}
            className="p-1.5 border border-slate-200 rounded-lg disabled:opacity-40 bg-white hover:bg-slate-50"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span>
            Página {pagina + 1} de {totalPaginas}
          </span>
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

      {modalChofer && (
        <ModalChofer
          chofer={modalChofer === "crear" ? null : modalChofer}
          onCerrar={() => setModalChofer(null)}
          onGuardado={() => {
            setModalChofer(null);
            cargar();
          }}
        />
      )}

      {modalImportar && (
        <ModalImportar
          onCerrar={() => setModalImportar(false)}
          onFinalizado={() => {
            setModalImportar(false);
            cargar();
          }}
        />
      )}
    </div>
  );
};

export default TabChoferes;
