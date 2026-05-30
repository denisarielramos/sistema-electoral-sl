import React, { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "../supabaseClient";
import {
  ArrowLeft,
  Search,
  Users,
  UserCog,
  UserCheck,
  User,
  RefreshCw,
} from "lucide-react";

// ======================= HELPERS =======================
const normalizeCI = (ci) => String(ci || "").replace(/\D/g, "");

const formatCI = (ci) => {
  const num = Number(normalizeCI(ci));
  if (Number.isNaN(num) || num === 0) return ci || "Sin dato";
  return new Intl.NumberFormat("es-PY").format(num);
};

// ======================= BADGE =======================
const Badge = ({ variant, children }) => {
  const base = "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap";
  const variants = {
    coordinador: "bg-red-100 text-red-700",
    subcoordinador: "bg-blue-100 text-blue-700",
    votante: "bg-slate-100 text-slate-600",
  };
  return <span className={`${base} ${variants[variant] || variants.votante}`}>{children}</span>;
};

// ======================= STAT CARD =======================
const StatCard = ({ label, value, icon: Icon, color = "brand" }) => {
  const colors = {
    brand: "bg-brand-50 text-brand-600 border-brand-200",
    red: "bg-red-50 text-red-600 border-red-200",
    blue: "bg-blue-50 text-blue-600 border-blue-200",
    slate: "bg-slate-50 text-slate-600 border-slate-200",
  };
  return (
    <div className={`rounded-xl border p-4 ${colors[color]}`}>
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-white/80">
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-xs font-medium opacity-80">{label}</p>
        </div>
      </div>
    </div>
  );
};

// ======================= MAIN COMPONENT =======================
export default function VistaSeccional({ onBack }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  // Raw data from tables
  const [coordsData, setCoordsData] = useState([]);
  const [subsData, setSubsData] = useState([]);
  const [votantesData, setVotantesData] = useState([]);
  const [padronMap, setPadronMap] = useState(new Map());

  // Filters
  const [filtroSeccional, setFiltroSeccional] = useState("");
  const [filtroRol, setFiltroRol] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // ======================= LOAD DATA =======================
  const cargarDatos = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      console.log("[VistaSeccional] Iniciando carga de datos...");

      // 1. Load coordinadores
      let coords = [];
      try {
        const { data, error: err } = await supabase
          .from("coordinadores")
          .select("ci");
        if (err) {
          console.error("[VistaSeccional] Error cargando coordinadores:", err);
        } else {
          coords = data || [];
        }
      } catch (e) {
        console.error("[VistaSeccional] Error cargando coordinadores:", e);
      }
      console.log("[VistaSeccional] coordinadores:", coords.length);

      // 2. Load subcoordinadores
      let subs = [];
      try {
        const { data, error: err } = await supabase
          .from("subcoordinadores")
          .select("ci");
        if (err) {
          console.error("[VistaSeccional] Error cargando subcoordinadores:", err);
        } else {
          subs = data || [];
        }
      } catch (e) {
        console.error("[VistaSeccional] Error cargando subcoordinadores:", e);
      }
      console.log("[VistaSeccional] subcoordinadores:", subs.length);

      // 3. Load votantes
      let votantes = [];
      try {
        const { data, error: err } = await supabase
          .from("votantes")
          .select("ci, direccion_override");
        if (err) {
          console.error("[VistaSeccional] Error cargando votantes:", err);
        } else {
          votantes = data || [];
        }
      } catch (e) {
        console.error("[VistaSeccional] Error cargando votantes:", e);
      }
      console.log("[VistaSeccional] votantes:", votantes.length);

      // 4. Collect unique CIs
      const cisSet = new Set();
      coords.forEach((c) => cisSet.add(normalizeCI(c.ci)));
      subs.forEach((s) => cisSet.add(normalizeCI(s.ci)));
      votantes.forEach((v) => cisSet.add(normalizeCI(v.ci)));
      const cisUnicos = Array.from(cisSet).filter((ci) => ci.length > 0);
      console.log("[VistaSeccional] cis únicos:", cisUnicos.length);

      // 5. Load padron ONLY for those CIs (in chunks of 500)
      const padronData = [];
      const chunkSize = 500;
      for (let i = 0; i < cisUnicos.length; i += chunkSize) {
        const chunk = cisUnicos.slice(i, i + chunkSize);
        try {
          const { data, error: err } = await supabase
            .from("padron")
            .select("ci, nombre, apellido, seccional, local_votacion, mesa, orden, direccion")
            .in("ci", chunk);
          if (err) {
            console.error("[VistaSeccional] Error cargando padron chunk:", err);
          } else {
            padronData.push(...(data || []));
          }
        } catch (e) {
          console.error("[VistaSeccional] Error cargando padron chunk:", e);
        }
      }
      console.log("[VistaSeccional] padron encontrado:", padronData.length);

      // 6. Build padron map
      const pMap = new Map();
      padronData.forEach((p) => {
        pMap.set(normalizeCI(p.ci), p);
      });

      // 7. Set state
      setCoordsData(coords);
      setSubsData(subs);
      setVotantesData(votantes);
      setPadronMap(pMap);

      console.log("[VistaSeccional] Carga completada.");

    } catch (err) {
      console.error("[VistaSeccional] Error general cargando personas por seccional:", err);
      setError(err?.message || "Error al cargar datos");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  // ======================= BUILD PERSONAS LIST =======================
  const personas = useMemo(() => {
    const list = [];

    // Coordinadores
    coordsData.forEach((c) => {
      const ci = normalizeCI(c.ci);
      const padron = padronMap.get(ci);
      list.push({
        ci: c.ci,
        ciNorm: ci,
        rol: "Coordinador",
        nombre: padron?.nombre || "",
        apellido: padron?.apellido || "",
        nombreCompleto: padron ? `${padron.nombre || ""} ${padron.apellido || ""}`.trim() : "Sin dato",
        seccional: padron?.seccional || "Sin dato",
        local_votacion: padron?.local_votacion || "Sin dato",
        mesa: padron?.mesa || "Sin dato",
        orden: padron?.orden || "Sin dato",
        direccion: padron?.direccion || "Sin dato",
      });
    });

    // Subcoordinadores
    subsData.forEach((s) => {
      const ci = normalizeCI(s.ci);
      const padron = padronMap.get(ci);
      list.push({
        ci: s.ci,
        ciNorm: ci,
        rol: "Subcoordinador",
        nombre: padron?.nombre || "",
        apellido: padron?.apellido || "",
        nombreCompleto: padron ? `${padron.nombre || ""} ${padron.apellido || ""}`.trim() : "Sin dato",
        seccional: padron?.seccional || "Sin dato",
        local_votacion: padron?.local_votacion || "Sin dato",
        mesa: padron?.mesa || "Sin dato",
        orden: padron?.orden || "Sin dato",
        direccion: padron?.direccion || "Sin dato",
      });
    });

    // Votantes
    votantesData.forEach((v) => {
      const ci = normalizeCI(v.ci);
      const padron = padronMap.get(ci);
      list.push({
        ci: v.ci,
        ciNorm: ci,
        rol: "Votante",
        nombre: padron?.nombre || "",
        apellido: padron?.apellido || "",
        nombreCompleto: padron ? `${padron.nombre || ""} ${padron.apellido || ""}`.trim() : "Sin dato",
        seccional: padron?.seccional || "Sin dato",
        local_votacion: padron?.local_votacion || "Sin dato",
        mesa: padron?.mesa || "Sin dato",
        orden: padron?.orden || "Sin dato",
        direccion: v.direccion_override || padron?.direccion || "Sin dato",
      });
    });

    console.log("[VistaSeccional] personas finales:", list.length);

    // Sort by seccional, then by rol, then by nombre
    list.sort((a, b) => {
      const secA = String(a.seccional);
      const secB = String(b.seccional);
      if (secA !== secB) return secA.localeCompare(secB, "es", { numeric: true });
      const rolOrder = { Coordinador: 1, Subcoordinador: 2, Votante: 3 };
      if (rolOrder[a.rol] !== rolOrder[b.rol]) return rolOrder[a.rol] - rolOrder[b.rol];
      return a.nombreCompleto.localeCompare(b.nombreCompleto, "es");
    });

    return list;
  }, [coordsData, subsData, votantesData, padronMap]);

  // ======================= SECCIONALES DISPONIBLES =======================
  const seccionalesDisponibles = useMemo(() => {
    const set = new Set();
    personas.forEach((p) => {
      if (p.seccional && p.seccional !== "Sin dato") {
        set.add(p.seccional);
      }
    });
    return Array.from(set).sort((a, b) => String(a).localeCompare(String(b), "es", { numeric: true }));
  }, [personas]);

  // ======================= FILTERED PERSONAS =======================
  const personasFiltradas = useMemo(() => {
    let filtered = personas;

    // Filter by seccional
    if (filtroSeccional) {
      filtered = filtered.filter((p) => String(p.seccional) === filtroSeccional);
    }

    // Filter by rol
    if (filtroRol) {
      filtered = filtered.filter((p) => p.rol === filtroRol);
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      filtered = filtered.filter((p) => {
        const ciStr = normalizeCI(p.ci);
        const nombre = (p.nombre || "").toLowerCase();
        const apellido = (p.apellido || "").toLowerCase();
        const nombreCompleto = (p.nombreCompleto || "").toLowerCase();
        return (
          ciStr.includes(q) ||
          nombre.includes(q) ||
          apellido.includes(q) ||
          nombreCompleto.includes(q)
        );
      });
    }

    return filtered;
  }, [personas, filtroSeccional, filtroRol, searchQuery]);

  // ======================= STATS =======================
  // Computed from personasFiltradas so cards always match what's shown in the table
  const hayFiltros = filtroSeccional !== "" || filtroRol !== "" || searchQuery.trim() !== "";

  const stats = useMemo(() => ({
    total: personasFiltradas.length,
    coordinadores: personasFiltradas.filter((p) => p.rol === "Coordinador").length,
    subcoordinadores: personasFiltradas.filter((p) => p.rol === "Subcoordinador").length,
    votantes: personasFiltradas.filter((p) => p.rol === "Votante").length,
  }), [personasFiltradas]);

  // ======================= RENDER =======================
  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                onClick={onBack}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                title="Volver al panel"
              >
                <ArrowLeft className="w-5 h-5 text-slate-600" />
              </button>
              <div>
                <h1 className="text-xl font-bold text-slate-800">Personas por seccional</h1>
                <p className="text-sm text-slate-500">Consulta de personas asignadas</p>
              </div>
            </div>
            <button
              onClick={() => cargarDatos(true)}
              disabled={refreshing}
              className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
              Actualizar
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Stats Cards */}
        <div className="space-y-2">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="TOTAL PERSONAS" value={stats.total} icon={Users} color="brand" />
            <StatCard label="COORDINADORES" value={stats.coordinadores} icon={UserCog} color="red" />
            <StatCard label="SUBCOORDINADORES" value={stats.subcoordinadores} icon={UserCheck} color="blue" />
            <StatCard label="VOTANTES" value={stats.votantes} icon={User} color="slate" />
          </div>
          {hayFiltros && (
            <p className="text-xs text-brand-600 font-medium text-right">
              Mostrando resultados filtrados
            </p>
          )}
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Seccional filter */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Seccional</label>
              <select
                value={filtroSeccional}
                onChange={(e) => setFiltroSeccional(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              >
                <option value="">Todas</option>
                {seccionalesDisponibles.map((sec) => (
                  <option key={sec} value={sec}>{sec}</option>
                ))}
              </select>
            </div>

            {/* Rol filter */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Rol</label>
              <select
                value={filtroRol}
                onChange={(e) => setFiltroRol(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              >
                <option value="">Todos</option>
                <option value="Coordinador">Coordinador</option>
                <option value="Subcoordinador">Subcoordinador</option>
                <option value="Votante">Votante</option>
              </select>
            </div>

            {/* Search */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Buscar</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="CI, nombre o apellido..."
                  className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {/* Count header */}
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
            <p className="text-sm text-slate-600">
              Mostrando <span className="font-semibold text-slate-800">{personasFiltradas.length}</span> de{" "}
              <span className="font-semibold text-slate-800">{personas.length}</span> personas
            </p>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600 mb-3" />
              <p className="text-sm text-slate-500">Cargando personas por seccional...</p>
            </div>
          ) : error ? (
            <div className="text-center py-20">
              <p className="text-red-600 mb-2">Error: {error}</p>
              <button
                onClick={() => cargarDatos()}
                className="text-brand-600 hover:underline text-sm"
              >
                Reintentar
              </button>
            </div>
          ) : personasFiltradas.length === 0 ? (
            <div className="text-center py-20">
              <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">No se encontraron personas</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">SECCIONAL</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">ROL</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">NOMBRE Y APELLIDO</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">CI</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">LOCAL</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">MESA</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">ORDEN</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">DIRECCION</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {personasFiltradas.map((p, idx) => (
                    <tr key={`${p.ciNorm}-${p.rol}-${idx}`} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{p.seccional}</td>
                      <td className="px-4 py-3">
                        <Badge variant={p.rol.toLowerCase()}>{p.rol}</Badge>
                      </td>
                      <td className="px-4 py-3 text-slate-800 font-medium whitespace-nowrap">{p.nombreCompleto}</td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap font-mono">{formatCI(p.ci)}</td>
                      <td className="px-4 py-3 text-slate-600 max-w-[200px] truncate" title={p.local_votacion}>
                        {p.local_votacion}
                      </td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{p.mesa}</td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{p.orden}</td>
                      <td className="px-4 py-3 text-slate-600 max-w-[200px] truncate" title={p.direccion}>
                        {p.direccion}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
