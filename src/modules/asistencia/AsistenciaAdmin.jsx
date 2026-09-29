// ======================= PANEL ADMIN: MÓDULO DE ASISTENCIA (solo superadmin) =======================
// Conectado a las RPC administrativas reales (asistencia_admin_*). El login sigue
// siendo el mismo de siempre (App.jsx, CI + contraseña de los 2 superadmin); acá solo
// se usa el admin_token que ese login ya guardó (ver asistenciaAdminAuth.js) — este
// componente NUNCA pide una contraseña ni la guarda.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  QrCode,
  Settings,
  Radio,
  Users,
  ListChecks,
  AlertTriangle,
  Loader2,
  RefreshCw,
  ExternalLink,
  Power,
} from "lucide-react";
import {
  listarConfiguracionAdmin,
  actualizarPuntoAdmin,
  actualizarEventoAdmin,
  listarAsistenciasAdmin,
} from "./asistenciaService";
import {
  mensajeError,
  isoATimestampLocal,
  timestampLocalAIso,
  labelRolSnapshot,
  ESTADO_PUNTO_LABEL,
} from "./asistenciaUtils";
import { formatearDistancia, formatearPrecisionGps } from "../../utils/geoHelpers";
import {
  normalizeCI,
  getCoordsDeDigente,
  getSubsDeDigente,
  getTodosVotantesDirigente,
} from "../../utils/estructuraHelpers";
import QRCodeAsistencia from "./components/QRCodeAsistencia";
import MapaPuntoAsistencia from "./components/MapaPuntoAsistencia";

const TABS = [
  { id: "configuracion", label: "Configuración", icon: Settings },
  { id: "en_vivo", label: "Asistencia en vivo", icon: Radio },
  { id: "por_estructura", label: "Por estructura", icon: Users },
  { id: "detalle", label: "Detalle", icon: ListChecks },
];

const SECCIONALES = [2, 3, 4];

const borradorDesdePunto = (p) => ({
  inicioLocal: isoATimestampLocal(p.inicio),
  finLocal: isoATimestampLocal(p.fin),
  radioMetros: p.radio_metros ?? "",
  latitud: p.latitud ?? null,
  longitud: p.longitud ?? null,
  modoHabilitacion: p.modo_habilitacion || "automatico",
});

// "Personas de su estructura" de un dirigente: él mismo + sus coordinadores +
// subcoordinadores + todos los votantes de su rama. Reutiliza estructuraHelpers.js
// tal cual — no se reimplementa ninguna jerarquía nueva acá.
const cisDeEstructuraDirigente = (estructura, dirigenteCI) => {
  const ci = normalizeCI(dirigenteCI);
  const set = new Set([ci]);
  getCoordsDeDigente(estructura, ci).forEach((c) => set.add(normalizeCI(c.ci)));
  getSubsDeDigente(estructura, ci).forEach((s) => set.add(normalizeCI(s.ci)));
  getTodosVotantesDirigente(estructura, ci).forEach((v) => set.add(normalizeCI(v.ci)));
  return set;
};

const evaluarListaParaActivar = (puntos) => {
  const faltantes = [];
  for (const p of puntos) {
    const problemas = [];
    if (p.latitud == null || p.longitud == null) problemas.push("ubicación");
    if (!p.radio_metros || Number(p.radio_metros) <= 0) problemas.push("radio");
    if (p.modo_habilitacion === "automatico") {
      if (!p.inicio || !p.fin) problemas.push("horario");
      else if (new Date(p.fin) <= new Date(p.inicio)) problemas.push("horario (fin debe ser posterior al inicio)");
    }
    if (problemas.length) faltantes.push({ seccional: p.seccional, nombre: p.nombre, problemas });
  }
  return faltantes;
};

// ======================= AVISOS / ESTADOS =======================
const AvisoSesionExpirada = () => (
  <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
    <span>Tu sesión administrativa expiró. Cerrá sesión e ingresá nuevamente.</span>
  </div>
);

const AvisoError = ({ mensaje, onReintentar }) => (
  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center justify-between gap-3">
    <span className="flex items-center gap-2">
      <AlertTriangle className="w-4 h-4 shrink-0" /> {mensaje}
    </span>
    {onReintentar && (
      <button
        type="button"
        onClick={onReintentar}
        className="inline-flex items-center gap-1.5 px-3 h-8 border border-red-200 bg-white hover:bg-red-50 text-red-700 rounded-lg text-xs font-medium shrink-0"
      >
        <RefreshCw className="w-3.5 h-3.5" /> Reintentar
      </button>
    )}
  </div>
);

// ======================= TAB: CONFIGURACIÓN =======================
const TarjetaSeccional = ({ punto, borrador, onCambiar, onGuardar, guardando, error }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
    <div className="flex items-center justify-between gap-2">
      <p className="text-sm font-semibold text-slate-700">{punto.nombre}</p>
      <div className="flex items-center gap-1.5">
        {punto.maps_url && (
          <a
            href={punto.maps_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700"
          >
            <ExternalLink className="w-3.5 h-3.5" /> Google Maps
          </a>
        )}
        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
          {ESTADO_PUNTO_LABEL[punto.estado] || punto.estado}
        </span>
      </div>
    </div>

    <div className="grid grid-cols-2 gap-3">
      <label className="block">
        <span className="block text-xs font-medium text-slate-500 mb-1">Inicio</span>
        <input
          type="datetime-local"
          value={borrador.inicioLocal}
          onChange={(e) => onCambiar("inicioLocal", e.target.value)}
          className="w-full px-2.5 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
        />
      </label>
      <label className="block">
        <span className="block text-xs font-medium text-slate-500 mb-1">Fin</span>
        <input
          type="datetime-local"
          value={borrador.finLocal}
          onChange={(e) => onCambiar("finLocal", e.target.value)}
          className="w-full px-2.5 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
        />
      </label>
      <label className="block">
        <span className="block text-xs font-medium text-slate-500 mb-1">Radio (metros)</span>
        <input
          type="number"
          min="1"
          value={borrador.radioMetros}
          onChange={(e) => onCambiar("radioMetros", e.target.value)}
          className="w-full px-2.5 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
        />
      </label>
      <label className="block">
        <span className="block text-xs font-medium text-slate-500 mb-1">Modo</span>
        <select
          value={borrador.modoHabilitacion}
          onChange={(e) => onCambiar("modoHabilitacion", e.target.value)}
          className="w-full px-2.5 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
        >
          <option value="automatico">Automático</option>
          <option value="abierto">Habilitar ahora</option>
          <option value="cerrado">Cerrar ahora</option>
        </select>
      </label>
    </div>

    <div className="grid grid-cols-2 gap-3">
      <label className="block">
        <span className="block text-xs font-medium text-slate-500 mb-1">Latitud</span>
        <input
          type="number"
          step="any"
          value={borrador.latitud ?? ""}
          onChange={(e) => onCambiar("latitud", e.target.value === "" ? null : Number(e.target.value))}
          className="w-full px-2.5 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
        />
      </label>
      <label className="block">
        <span className="block text-xs font-medium text-slate-500 mb-1">Longitud</span>
        <input
          type="number"
          step="any"
          value={borrador.longitud ?? ""}
          onChange={(e) => onCambiar("longitud", e.target.value === "" ? null : Number(e.target.value))}
          className="w-full px-2.5 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
        />
      </label>
    </div>

    <MapaPuntoAsistencia
      latitud={borrador.latitud}
      longitud={borrador.longitud}
      radioMetros={Number(borrador.radioMetros) || 0}
      editable
      onChange={(lat, lng) => {
        onCambiar("latitud", Number(lat.toFixed(6)));
        onCambiar("longitud", Number(lng.toFixed(6)));
      }}
    />

    {error && (
      <p className="flex items-center gap-1.5 text-xs text-red-600">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {error}
      </p>
    )}

    <button
      type="button"
      onClick={onGuardar}
      disabled={guardando}
      className="w-full inline-flex items-center justify-center gap-2 px-4 h-9 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium border-0 transition-colors"
    >
      {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
      Guardar
    </button>
  </div>
);

const TabConfiguracion = ({ config, borradores, onCambiarBorrador, onGuardarPunto, guardandoPuntoId, erroresPunto, onAlternarEvento, guardandoEvento, errorEvento }) => (
  <div className="space-y-4">
    <div className="rounded-xl border border-slate-200 bg-white p-4 flex items-center justify-between gap-3 flex-wrap">
      <div>
        <p className="text-sm font-semibold text-slate-700">{config.evento.nombre}</p>
        <p className="text-xs text-slate-500 mt-0.5">
          Estado: <span className={config.evento.activo ? "text-emerald-600 font-medium" : "text-slate-500"}>
            {config.evento.activo ? "Activo" : "Desactivado"}
          </span>
        </p>
        {errorEvento && (
          <p className="flex items-center gap-1.5 text-xs text-red-600 mt-1.5 max-w-md">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {errorEvento}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onAlternarEvento}
        disabled={guardandoEvento}
        className={`inline-flex items-center gap-2 px-4 h-9 rounded-lg text-sm font-medium border-0 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${
          config.evento.activo ? "bg-slate-200 hover:bg-slate-300 text-slate-700" : "bg-brand-600 hover:bg-brand-700 text-white"
        }`}
      >
        {guardandoEvento ? <Loader2 className="w-4 h-4 animate-spin" /> : <Power className="w-4 h-4" />}
        {config.evento.activo ? "Desactivar evento" : "Activar evento"}
      </button>
    </div>

    <QRCodeAsistencia slug={config.evento.slug} />

    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {config.puntos.map((p) => (
        <TarjetaSeccional
          key={p.id}
          punto={p}
          borrador={borradores[p.id] || borradorDesdePunto(p)}
          onCambiar={(campo, valor) => onCambiarBorrador(p.id, campo, valor)}
          onGuardar={() => onGuardarPunto(p)}
          guardando={guardandoPuntoId === p.id}
          error={erroresPunto[p.id]}
        />
      ))}
    </div>
  </div>
);

// ======================= TAB: ASISTENCIA EN VIVO =======================
const TabEnVivo = ({ asistencias, cargando, error, onRefrescar }) => {
  const total = asistencias?.length || 0;
  const porSeccional = useMemo(() => {
    const base = { 2: 0, 3: 0, 4: 0 };
    (asistencias || []).forEach((a) => {
      if (base[a.seccional_asistencia] !== undefined) base[a.seccional_asistencia] += 1;
    });
    return base;
  }, [asistencias]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">Se actualiza sola cada 30 segundos mientras esta pestaña está abierta.</p>
        <button
          type="button"
          onClick={onRefrescar}
          disabled={cargando}
          className="inline-flex items-center gap-1.5 px-3 h-9 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-medium disabled:opacity-50"
        >
          {cargando ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Refrescar
        </button>
      </div>
      {error && <AvisoError mensaje={error} onReintentar={onRefrescar} />}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-brand-200 bg-brand-50 p-4">
          <p className="text-2xl font-bold text-brand-700">{total}</p>
          <p className="text-xs font-medium text-brand-600">Total general</p>
        </div>
        {SECCIONALES.map((s) => (
          <div key={s} className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-2xl font-bold text-slate-800">{porSeccional[s]}</p>
            <p className="text-xs font-medium text-slate-500">Seccional {s}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

// ======================= TAB: POR ESTRUCTURA =======================
const TabPorEstructura = ({ estructura, asistencias, cargando, error, onRefrescar }) => {
  const filas = useMemo(() => {
    if (!estructura?.dirigentes || !asistencias) return [];
    const ciAsistentes = new Set(asistencias.map((a) => normalizeCI(a.ci)));
    return estructura.dirigentes
      .filter((d) => d.activo !== false)
      .map((d) => {
        const propios = cisDeEstructuraDirigente(estructura, d.ci);
        let presentes = 0;
        propios.forEach((ci) => { if (ciAsistentes.has(ci)) presentes += 1; });
        return {
          ci: d.ci,
          nombre: `${d.nombre || ""} ${d.apellido || ""}`.trim() || d.ci,
          total: propios.size,
          presentes,
        };
      })
      .sort((a, b) => b.presentes - a.presentes);
  }, [estructura, asistencias]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">Personas de su estructura presentes (no indica quién llevó a quién).</p>
        <button
          type="button"
          onClick={onRefrescar}
          disabled={cargando}
          className="inline-flex items-center gap-1.5 px-3 h-9 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-medium disabled:opacity-50"
        >
          {cargando ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Refrescar
        </button>
      </div>
      {error && <AvisoError mensaje={error} onReintentar={onRefrescar} />}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Dirigente</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">Presentes</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">Total en su estructura</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filas.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-3 py-8 text-center text-sm text-slate-400">
                  Sin datos todavía.
                </td>
              </tr>
            ) : (
              filas.map((f) => (
                <tr key={f.ci}>
                  <td className="px-3 py-2 text-slate-700">{f.nombre}</td>
                  <td className="px-3 py-2 text-right font-medium text-slate-800">{f.presentes}</td>
                  <td className="px-3 py-2 text-right text-slate-500">{f.total}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ======================= TAB: DETALLE =======================
const COLUMNAS_DETALLE = [
  "CI", "Nombre y apellido", "Rol", "Seccional registrada", "Seccional padrón", "Fecha y hora", "Distancia", "Precisión GPS",
];

const TabDetalle = ({ asistencias, cargando, error, onRefrescar }) => {
  const [filtroTexto, setFiltroTexto] = useState("");
  const [filtroSeccional, setFiltroSeccional] = useState("todas");

  const filas = useMemo(() => {
    if (!asistencias) return [];
    const texto = filtroTexto.trim().toLowerCase();
    return asistencias.filter((a) => {
      if (filtroSeccional !== "todas" && String(a.seccional_asistencia) !== filtroSeccional) return false;
      if (!texto) return true;
      const nombreCompleto = `${a.nombre_snapshot || ""} ${a.apellido_snapshot || ""}`.toLowerCase();
      return String(a.ci).includes(texto) || nombreCompleto.includes(texto);
    });
  }, [asistencias, filtroTexto, filtroSeccional]);

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="block sm:col-span-2">
          <span className="block text-xs font-medium text-slate-600 mb-1.5">Buscar por CI o nombre</span>
          <input
            type="text"
            value={filtroTexto}
            onChange={(e) => setFiltroTexto(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
          />
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-slate-600 mb-1.5">Seccional</span>
          <select
            value={filtroSeccional}
            onChange={(e) => setFiltroSeccional(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
          >
            <option value="todas">Todas</option>
            {SECCIONALES.map((s) => (
              <option key={s} value={String(s)}>Seccional {s}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={onRefrescar}
          disabled={cargando}
          className="inline-flex items-center gap-1.5 px-3 h-9 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-medium disabled:opacity-50"
        >
          {cargando ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Refrescar
        </button>
      </div>

      {error && <AvisoError mensaje={error} onReintentar={onRefrescar} />}

      <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              {COLUMNAS_DETALLE.map((col) => (
                <th key={col} className="px-3 py-2 text-left text-xs font-medium text-slate-500 whitespace-nowrap">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filas.length === 0 ? (
              <tr>
                <td colSpan={COLUMNAS_DETALLE.length} className="px-3 py-8 text-center text-sm text-slate-400">
                  Sin asistencias registradas todavía.
                </td>
              </tr>
            ) : (
              filas.map((a) => (
                <tr key={a.id}>
                  <td className="px-3 py-2 whitespace-nowrap text-slate-700">{a.ci}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-slate-700">{a.nombre_snapshot} {a.apellido_snapshot}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-slate-500">{labelRolSnapshot(a.rol_snapshot)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-slate-500">{a.punto_nombre || `Seccional ${a.seccional_asistencia}`}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-slate-500">
                    {a.seccional_padron_snapshot != null ? `Seccional ${a.seccional_padron_snapshot}` : "—"}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-slate-500">
                    {a.created_at ? new Date(a.created_at).toLocaleString() : "—"}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-slate-500">{formatearDistancia(a.distancia_metros)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-slate-500">{formatearPrecisionGps(a.precision_metros)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ======================= COMPONENTE PRINCIPAL =======================
const AsistenciaAdmin = ({ currentUser, estructura, onVolver }) => {
  const [tab, setTab] = useState("configuracion");

  const [cargandoConfig, setCargandoConfig] = useState(true);
  const [errorConfig, setErrorConfig] = useState("");
  const [config, setConfig] = useState(null);
  const [borradores, setBorradores] = useState({});
  const [guardandoPuntoId, setGuardandoPuntoId] = useState(null);
  const [erroresPunto, setErroresPunto] = useState({});
  const [guardandoEvento, setGuardandoEvento] = useState(false);
  const [errorEvento, setErrorEvento] = useState("");

  const [asistencias, setAsistencias] = useState(null);
  const [cargandoAsistencias, setCargandoAsistencias] = useState(false);
  const [errorAsistencias, setErrorAsistencias] = useState("");

  const cargarConfiguracion = useCallback(async () => {
    setCargandoConfig(true);
    setErrorConfig("");
    const data = await listarConfiguracionAdmin();
    if (!data?.ok) {
      setErrorConfig(data?.codigo || "ERROR_TECNICO");
      setConfig(null);
      setCargandoConfig(false);
      return;
    }
    setConfig({ evento: data.evento, puntos: data.puntos || [] });
    setBorradores(Object.fromEntries((data.puntos || []).map((p) => [p.id, borradorDesdePunto(p)])));
    setCargandoConfig(false);
  }, []);

  useEffect(() => {
    cargarConfiguracion();
  }, [cargarConfiguracion]);

  const cambiarBorrador = (puntoId, campo, valor) => {
    setBorradores((prev) => ({ ...prev, [puntoId]: { ...prev[puntoId], [campo]: valor } }));
  };

  const guardarPunto = async (punto) => {
    const b = borradores[punto.id];
    setGuardandoPuntoId(punto.id);
    setErroresPunto((prev) => ({ ...prev, [punto.id]: "" }));
    try {
      const data = await actualizarPuntoAdmin({
        puntoId: punto.id,
        inicio: timestampLocalAIso(b.inicioLocal),
        fin: timestampLocalAIso(b.finLocal),
        radioMetros: b.radioMetros === "" ? null : Number(b.radioMetros),
        latitud: b.latitud,
        longitud: b.longitud,
        modoHabilitacion: b.modoHabilitacion,
      });
      if (!data?.ok) {
        setErroresPunto((prev) => ({ ...prev, [punto.id]: mensajeError(data?.codigo) }));
        return;
      }
      await cargarConfiguracion();
    } finally {
      setGuardandoPuntoId(null);
    }
  };

  const alternarEvento = async () => {
    if (!config) return;
    const activar = !config.evento.activo;
    if (activar) {
      const faltantes = evaluarListaParaActivar(config.puntos);
      if (faltantes.length > 0) {
        setErrorEvento(
          "Antes de activar, completá: " +
            faltantes.map((f) => `${f.nombre} (${f.problemas.join(", ")})`).join("; ")
        );
        return;
      }
    }
    setErrorEvento("");
    setGuardandoEvento(true);
    try {
      const data = await actualizarEventoAdmin({ eventoId: config.evento.id, activo: activar });
      if (!data?.ok) {
        setErrorEvento(mensajeError(data?.codigo));
        return;
      }
      await cargarConfiguracion();
    } finally {
      setGuardandoEvento(false);
    }
  };

  const cargarAsistencias = useCallback(async () => {
    if (!config?.evento?.id) return;
    setCargandoAsistencias(true);
    const data = await listarAsistenciasAdmin(config.evento.id);
    if (!data?.ok) {
      setErrorAsistencias(mensajeError(data?.codigo));
      setAsistencias([]);
    } else {
      setErrorAsistencias("");
      setAsistencias(data.asistencias || []);
    }
    setCargandoAsistencias(false);
  }, [config?.evento?.id]);

  useEffect(() => {
    const necesitaAsistencias = tab === "en_vivo" || tab === "por_estructura" || tab === "detalle";
    if (necesitaAsistencias && asistencias === null && config?.evento?.id) {
      cargarAsistencias();
    }
  }, [tab, asistencias, config?.evento?.id, cargarAsistencias]);

  useEffect(() => {
    if (tab !== "en_vivo") return;
    const id = setInterval(() => cargarAsistencias(), 30000);
    return () => clearInterval(id);
  }, [tab, cargarAsistencias]);

  const sesionExpirada = errorConfig === "SESION_ADMIN_EXPIRADA";

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={onVolver}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors border-0 bg-transparent shadow-none"
              title="Volver al panel"
              aria-label="Volver al panel"
            >
              <ArrowLeft className="w-5 h-5 text-slate-600" />
            </button>
            <div className="flex items-center gap-2">
              <QrCode className="w-5 h-5 text-brand-600" />
              <div>
                <h1 className="text-xl font-bold text-slate-800">Asistencias</h1>
                <p className="text-xs text-slate-500">Conectado como {currentUser?.nombre || "Superadmin"}</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-4">
        {sesionExpirada ? (
          <AvisoSesionExpirada />
        ) : cargandoConfig ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 text-brand-600 animate-spin" />
          </div>
        ) : errorConfig ? (
          <AvisoError mensaje={mensajeError(errorConfig)} onReintentar={cargarConfiguracion} />
        ) : config ? (
          <>
            <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
              {TABS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={`inline-flex items-center gap-1.5 px-3 h-9 rounded-lg text-sm font-medium transition-colors ${
                    tab === id ? "bg-brand-50 text-brand-600" : "text-slate-500 hover:bg-slate-100"
                  }`}
                >
                  {Icon && <Icon className="w-4 h-4" />}
                  {label}
                </button>
              ))}
            </div>

            {tab === "configuracion" && (
              <TabConfiguracion
                config={config}
                borradores={borradores}
                onCambiarBorrador={cambiarBorrador}
                onGuardarPunto={guardarPunto}
                guardandoPuntoId={guardandoPuntoId}
                erroresPunto={erroresPunto}
                onAlternarEvento={alternarEvento}
                guardandoEvento={guardandoEvento}
                errorEvento={errorEvento}
              />
            )}
            {tab === "en_vivo" && (
              <TabEnVivo asistencias={asistencias} cargando={cargandoAsistencias} error={errorAsistencias} onRefrescar={cargarAsistencias} />
            )}
            {tab === "por_estructura" && (
              <TabPorEstructura estructura={estructura} asistencias={asistencias} cargando={cargandoAsistencias} error={errorAsistencias} onRefrescar={cargarAsistencias} />
            )}
            {tab === "detalle" && (
              <TabDetalle asistencias={asistencias} cargando={cargandoAsistencias} error={errorAsistencias} onRefrescar={cargarAsistencias} />
            )}
          </>
        ) : null}
      </main>
    </div>
  );
};

export default AsistenciaAdmin;
