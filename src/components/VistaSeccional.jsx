import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Search,
  Users,
  UserCog,
  UserCheck,
  User,
  Phone,
  MapPin,
  Check,
  X,
  Building2,
  Map,
  Filter,
} from "lucide-react";

// ======================= HELPERS =======================
const normalizeCI = (ci) => String(ci || "").replace(/\D/g, "");

const formatCI = (ci) => {
  const num = Number(ci);
  if (Number.isNaN(num)) return ci || "Sin dato";
  return new Intl.NumberFormat("es-PY").format(num);
};

const getFieldSafe = (obj, ...keys) => {
  for (const k of keys) {
    if (obj?.[k] !== undefined && obj?.[k] !== null && obj?.[k] !== "") {
      return obj[k];
    }
  }
  return null;
};

const normalizeText = (v) =>
  (v ?? "").toString().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ").trim();

// ======================= BADGE =======================
const Badge = ({ variant = "default", children, className = "" }) => {
  const variants = {
    default: "bg-slate-100 text-slate-700",
    coordinador: "bg-red-100 text-red-700",
    subcoordinador: "bg-blue-100 text-blue-700",
    votante: "bg-slate-100 text-slate-600",
    confirmado: "bg-emerald-100 text-emerald-700",
    pendiente: "bg-amber-100 text-amber-700",
    telefono: "bg-green-100 text-green-700",
    sintelefono: "bg-slate-200 text-slate-500",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${variants[variant] || variants.default} ${className}`}>
      {children}
    </span>
  );
};

// ======================= MAIN COMPONENT =======================
export default function VistaSeccional({ onBack }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Raw data
  const [padron, setPadron] = useState([]);
  const [coordinadores, setCoordinadores] = useState([]);
  const [subcoordinadores, setSubcoordinadores] = useState([]);
  const [votantes, setVotantes] = useState([]);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [filterSeccional, setFilterSeccional] = useState("__all__");
  const [filterLocal, setFilterLocal] = useState("__all__");
  const [filterEstado, setFilterEstado] = useState("__all__");
  const [filterTelefono, setFilterTelefono] = useState("__all__");

  // Expanded nodes
  const [expandedNodes, setExpandedNodes] = useState({});

  const toggleExpanded = (key) => {
    setExpandedNodes((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // ======================= LOAD DATA =======================
  const cargarDatos = useCallback(async () => {
    setLoading(true);
    setError(null);

    let padronData = [];
    let coordsData = [];
    let subsData = [];
    let votantesData = [];

    // Load padron
    try {
      const { data, error: err } = await supabase
        .from("padron")
        .select("ci, nombre, apellido, seccional, local_votacion, mesa, orden, direccion");
      if (err) {
        console.error("[VistaSeccional] Error cargando padron:", err);
      } else {
        padronData = data || [];
      }
    } catch (err) {
      console.error("[VistaSeccional] Error cargando padron:", err);
    }

    // Load coordinadores
    try {
      const { data, error: err } = await supabase
        .from("coordinadores")
        .select("ci, telefono, login_code");
      if (err) {
        console.error("[VistaSeccional] Error cargando coordinadores:", err);
      } else {
        coordsData = data || [];
      }
    } catch (err) {
      console.error("[VistaSeccional] Error cargando coordinadores:", err);
    }

    // Load subcoordinadores
    try {
      const { data, error: err } = await supabase
        .from("subcoordinadores")
        .select("ci, coordinador_ci, telefono, login_code");
      if (err) {
        console.error("[VistaSeccional] Error cargando subcoordinadores:", err);
      } else {
        subsData = data || [];
      }
    } catch (err) {
      console.error("[VistaSeccional] Error cargando subcoordinadores:", err);
    }

    // Load votantes
    try {
      const { data, error: err } = await supabase
        .from("votantes")
        .select("ci, asignado_por, asignado_por_nombre, telefono, coordinador_ci, voto_confirmado, direccion_override");
      if (err) {
        console.error("[VistaSeccional] Error cargando votantes:", err);
      } else {
        votantesData = data || [];
      }
    } catch (err) {
      console.error("[VistaSeccional] Error cargando votantes:", err);
    }

    console.log("[VistaSeccional] padron:", padronData.length);
    console.log("[VistaSeccional] coordinadores:", coordsData.length);
    console.log("[VistaSeccional] subcoordinadores:", subsData.length);
    console.log("[VistaSeccional] votantes:", votantesData.length);

    setPadron(padronData);
    setCoordinadores(coordsData);
    setSubcoordinadores(subsData);
    setVotantes(votantesData);
    setLoading(false);
  }, []);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  // ======================= MAPS =======================
  const padronMap = useMemo(() => {
    const map = new Map();
    padron.forEach((p) => {
      map.set(normalizeCI(p.ci), p);
    });
    return map;
  }, [padron]);

  const coordinadoresMap = useMemo(() => {
    const map = new Map();
    coordinadores.forEach((c) => {
      map.set(normalizeCI(c.ci), c);
    });
    return map;
  }, [coordinadores]);

  const subcoordinadoresMap = useMemo(() => {
    const map = new Map();
    subcoordinadores.forEach((s) => {
      map.set(normalizeCI(s.ci), s);
    });
    return map;
  }, [subcoordinadores]);

  // ======================= ENRICHED DATA =======================
  const enrichedCoords = useMemo(() => {
    return coordinadores.map((c) => {
      const ci = normalizeCI(c.ci);
      const datosPadron = padronMap.get(ci) || {};
      return {
        ...c,
        ...datosPadron,
        ci: c.ci,
        tipo: "coordinador",
      };
    });
  }, [coordinadores, padronMap]);

  const enrichedSubs = useMemo(() => {
    return subcoordinadores.map((s) => {
      const ci = normalizeCI(s.ci);
      const datosPadron = padronMap.get(ci) || {};
      return {
        ...s,
        ...datosPadron,
        ci: s.ci,
        tipo: "subcoordinador",
      };
    });
  }, [subcoordinadores, padronMap]);

  const enrichedVotantes = useMemo(() => {
    return votantes.map((v) => {
      const ci = normalizeCI(v.ci);
      const datosPadron = padronMap.get(ci) || {};
      return {
        ...v,
        ...datosPadron,
        ci: v.ci,
        tipo: "votante",
        direccion: v.direccion_override || datosPadron?.direccion || "",
      };
    });
  }, [votantes, padronMap]);

  // ======================= FILTERS =======================
  const filteredVotantes = useMemo(() => {
    let result = enrichedVotantes;

    // Search filter
    if (searchQuery) {
      const tokens = normalizeText(searchQuery).split(" ").filter(Boolean);
      result = result.filter((v) => {
        const fields = [
          normalizeText(v.nombre),
          normalizeText(v.apellido),
          normalizeText(`${v.nombre} ${v.apellido}`),
          normalizeText(v.ci),
          normalizeText(v.telefono),
        ];
        return tokens.every((t) => fields.some((f) => f.includes(t)));
      });
    }

    // Seccional filter
    if (filterSeccional !== "__all__") {
      result = result.filter((v) => (v.seccional || "Sin seccional") === filterSeccional);
    }

    // Local filter
    if (filterLocal !== "__all__") {
      result = result.filter((v) => (v.local_votacion || "Sin local de votación") === filterLocal);
    }

    // Estado filter
    if (filterEstado === "confirmado") {
      result = result.filter((v) => v.voto_confirmado === true);
    } else if (filterEstado === "pendiente") {
      result = result.filter((v) => v.voto_confirmado !== true);
    }

    // Telefono filter
    if (filterTelefono === "con") {
      result = result.filter((v) => v.telefono && String(v.telefono).trim().length > 0);
    } else if (filterTelefono === "sin") {
      result = result.filter((v) => !v.telefono || String(v.telefono).trim().length === 0);
    }

    return result;
  }, [enrichedVotantes, searchQuery, filterSeccional, filterLocal, filterEstado, filterTelefono]);

  // ======================= UNIQUE VALUES FOR FILTERS =======================
  const uniqueSeccionales = useMemo(() => {
    const set = new Set();
    enrichedVotantes.forEach((v) => set.add(v.seccional || "Sin seccional"));
    return Array.from(set).sort();
  }, [enrichedVotantes]);

  const uniqueLocales = useMemo(() => {
    const set = new Set();
    enrichedVotantes.forEach((v) => set.add(v.local_votacion || "Sin local de votación"));
    return Array.from(set).sort();
  }, [enrichedVotantes]);

  // ======================= GROUPED STRUCTURE =======================
  const estructuraAgrupada = useMemo(() => {
    // Group by seccional > local > coordinador > subcoordinador > votantes
    const structure = new Map();

    filteredVotantes.forEach((v) => {
      const seccional = v.seccional || "Sin seccional";
      const local = v.local_votacion || "Sin local de votación";
      const coordCI = normalizeCI(v.coordinador_ci);
      const asignadoPor = normalizeCI(v.asignado_por);

      // Initialize seccional
      if (!structure.has(seccional)) {
        structure.set(seccional, { locales: new Map(), stats: { total: 0, conTelefono: 0, confirmados: 0, pendientes: 0, coordsSet: new Set(), subsSet: new Set() } });
      }
      const seccionalData = structure.get(seccional);

      // Initialize local
      if (!seccionalData.locales.has(local)) {
        seccionalData.locales.set(local, { coordinadores: new Map(), stats: { total: 0, conTelefono: 0, confirmados: 0, pendientes: 0 } });
      }
      const localData = seccionalData.locales.get(local);

      // Determine coordinator
      let coordKey = coordCI || "__sin_coord__";
      if (!localData.coordinadores.has(coordKey)) {
        const coordInfo = enrichedCoords.find((c) => normalizeCI(c.ci) === coordCI);
        localData.coordinadores.set(coordKey, {
          info: coordInfo || { ci: coordCI, nombre: "Sin coordinador", apellido: "asignado", tipo: "coordinador" },
          subcoordinadores: new Map(),
          votantesDirectos: [],
          stats: { total: 0, directos: 0, subsCount: 0, confirmados: 0, pendientes: 0 },
        });
      }
      const coordData = localData.coordinadores.get(coordKey);

      // Determine if votante is under a subcoordinador or direct
      const isSubcoord = subcoordinadoresMap.has(asignadoPor);
      const isCoordDirecto = coordinadoresMap.has(asignadoPor);

      if (isSubcoord) {
        // Under a subcoordinador
        if (!coordData.subcoordinadores.has(asignadoPor)) {
          const subInfo = enrichedSubs.find((s) => normalizeCI(s.ci) === asignadoPor);
          coordData.subcoordinadores.set(asignadoPor, {
            info: subInfo || { ci: asignadoPor, nombre: "Sin subcoordinador", apellido: "asignado", tipo: "subcoordinador" },
            votantes: [],
            stats: { total: 0, conTelefono: 0, confirmados: 0, pendientes: 0 },
          });
        }
        const subData = coordData.subcoordinadores.get(asignadoPor);
        subData.votantes.push(v);

        // Update sub stats
        subData.stats.total++;
        if (v.telefono && String(v.telefono).trim().length > 0) subData.stats.conTelefono++;
        if (v.voto_confirmado === true) subData.stats.confirmados++;
        else subData.stats.pendientes++;

        // Track sub in seccional
        seccionalData.stats.subsSet.add(asignadoPor);
      } else {
        // Votante directo del coordinador (or sin asignador válido)
        coordData.votantesDirectos.push(v);
        coordData.stats.directos++;
      }

      // Update coord stats
      coordData.stats.total++;
      if (v.voto_confirmado === true) coordData.stats.confirmados++;
      else coordData.stats.pendientes++;

      // Update local stats
      localData.stats.total++;
      if (v.telefono && String(v.telefono).trim().length > 0) localData.stats.conTelefono++;
      if (v.voto_confirmado === true) localData.stats.confirmados++;
      else localData.stats.pendientes++;

      // Update seccional stats
      seccionalData.stats.total++;
      if (v.telefono && String(v.telefono).trim().length > 0) seccionalData.stats.conTelefono++;
      if (v.voto_confirmado === true) seccionalData.stats.confirmados++;
      else seccionalData.stats.pendientes++;
      if (coordCI) seccionalData.stats.coordsSet.add(coordCI);
    });

    // Finalize subcoordinador counts
    structure.forEach((seccionalData) => {
      seccionalData.locales.forEach((localData) => {
        localData.coordinadores.forEach((coordData) => {
          coordData.stats.subsCount = coordData.subcoordinadores.size;
        });
      });
    });

    console.log("[VistaSeccional] estructura agrupada:", structure.size, "seccionales");

    return structure;
  }, [filteredVotantes, enrichedCoords, enrichedSubs, coordinadoresMap, subcoordinadoresMap]);

  // ======================= RENDER =======================
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-slate-600">Cargando vista por seccional...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-6 max-w-md text-center">
          <X className="w-12 h-12 text-red-500 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-slate-800 mb-2">Error al cargar datos</h2>
          <p className="text-sm text-slate-600 mb-4">{error}</p>
          <button
            onClick={cargarDatos}
            className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              aria-label="Volver"
            >
              <ArrowLeft className="w-5 h-5 text-slate-600" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-slate-800">Vista por seccional</h1>
              <p className="text-sm text-slate-500">
                {filteredVotantes.length} votantes · {estructuraAgrupada.size} seccionales
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Filters */}
      <div className="bg-white border-b border-slate-200 sticky top-[73px] z-20">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex flex-wrap gap-3">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por nombre, CI, teléfono..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              />
            </div>

            {/* Seccional filter */}
            <select
              value={filterSeccional}
              onChange={(e) => setFilterSeccional(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="__all__">Todas las seccionales</option>
              {uniqueSeccionales.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>

            {/* Local filter */}
            <select
              value={filterLocal}
              onChange={(e) => setFilterLocal(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="__all__">Todos los locales</option>
              {uniqueLocales.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>

            {/* Estado filter */}
            <select
              value={filterEstado}
              onChange={(e) => setFilterEstado(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="__all__">Todos los estados</option>
              <option value="confirmado">Confirmados</option>
              <option value="pendiente">Pendientes</option>
            </select>

            {/* Telefono filter */}
            <select
              value={filterTelefono}
              onChange={(e) => setFilterTelefono(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="__all__">Todos</option>
              <option value="con">Con teléfono</option>
              <option value="sin">Sin teléfono</option>
            </select>
          </div>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {estructuraAgrupada.size === 0 ? (
          <div className="bg-white rounded-xl shadow-sm p-8 text-center">
            <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-slate-700 mb-1">No hay datos</h3>
            <p className="text-sm text-slate-500">No se encontraron votantes con los filtros aplicados.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {Array.from(estructuraAgrupada.entries()).map(([seccional, seccionalData]) => {
              const seccionalKey = `secc-${seccional}`;
              const isExpanded = expandedNodes[seccionalKey];
              const stats = seccionalData.stats;

              return (
                <div key={seccional} className="bg-white rounded-xl shadow-sm overflow-hidden">
                  {/* Seccional header */}
                  <div
                    className="flex items-center gap-3 p-4 cursor-pointer hover:bg-slate-50 transition-colors"
                    onClick={() => toggleExpanded(seccionalKey)}
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-5 h-5 text-brand-600 shrink-0" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-brand-600 shrink-0" />
                    )}
                    <Map className="w-5 h-5 text-purple-600 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <h2 className="font-semibold text-slate-800">{seccional}</h2>
                      <div className="flex flex-wrap gap-3 text-xs text-slate-500 mt-1">
                        <span>{stats.total} votantes</span>
                        <span className="text-green-600">{stats.conTelefono} con tel.</span>
                        <span className="text-emerald-600">{stats.confirmados} conf.</span>
                        <span className="text-amber-600">{stats.pendientes} pend.</span>
                        <span>{stats.coordsSet.size} coords</span>
                        <span>{stats.subsSet.size} subs</span>
                      </div>
                    </div>
                  </div>

                  {/* Seccional content */}
                  {isExpanded && (
                    <div className="border-t border-slate-100">
                      {Array.from(seccionalData.locales.entries()).map(([local, localData]) => {
                        const localKey = `${seccionalKey}-loc-${local}`;
                        const localExpanded = expandedNodes[localKey];
                        const localStats = localData.stats;

                        return (
                          <div key={local} className="border-t border-slate-100 first:border-t-0">
                            {/* Local header */}
                            <div
                              className="flex items-center gap-3 p-3 pl-8 cursor-pointer hover:bg-slate-50 transition-colors"
                              onClick={() => toggleExpanded(localKey)}
                            >
                              {localExpanded ? (
                                <ChevronDown className="w-4 h-4 text-blue-600 shrink-0" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-blue-600 shrink-0" />
                              )}
                              <Building2 className="w-4 h-4 text-blue-600 shrink-0" />
                              <div className="flex-1 min-w-0">
                                <h3 className="font-medium text-slate-700">{local}</h3>
                                <div className="flex flex-wrap gap-2 text-xs text-slate-500 mt-0.5">
                                  <span>{localStats.total} vot.</span>
                                  <span className="text-green-600">{localStats.conTelefono} tel.</span>
                                  <span className="text-emerald-600">{localStats.confirmados} conf.</span>
                                  <span className="text-amber-600">{localStats.pendientes} pend.</span>
                                </div>
                              </div>
                            </div>

                            {/* Local content - coordinadores */}
                            {localExpanded && (
                              <div className="bg-slate-50/50">
                                {Array.from(localData.coordinadores.entries()).map(([coordCI, coordData]) => {
                                  const coordKey = `${localKey}-coord-${coordCI}`;
                                  const coordExpanded = expandedNodes[coordKey];
                                  const coordInfo = coordData.info;
                                  const coordStats = coordData.stats;

                                  return (
                                    <div key={coordCI} className="border-t border-slate-100">
                                      {/* Coordinador header */}
                                      <div
                                        className="flex items-center gap-3 p-3 pl-12 cursor-pointer hover:bg-slate-100 transition-colors"
                                        onClick={() => toggleExpanded(coordKey)}
                                      >
                                        {coordExpanded ? (
                                          <ChevronDown className="w-4 h-4 text-red-600 shrink-0" />
                                        ) : (
                                          <ChevronRight className="w-4 h-4 text-red-600 shrink-0" />
                                        )}
                                        <div className="flex-1 min-w-0">
                                          <div className="flex flex-wrap items-center gap-2">
                                            <Badge variant="coordinador">
                                              <UserCog className="w-3 h-3 mr-1" />
                                              Coord
                                            </Badge>
                                            <span className="font-medium text-slate-700">
                                              {getFieldSafe(coordInfo, "nombre") || "Sin"} {getFieldSafe(coordInfo, "apellido") || "nombre"}
                                            </span>
                                            {coordCI !== "__sin_coord__" && (
                                              <span className="text-xs text-slate-400">CI: {formatCI(coordInfo.ci)}</span>
                                            )}
                                          </div>
                                          <div className="flex flex-wrap gap-2 text-xs text-slate-500 mt-0.5">
                                            <span>{coordStats.total} vot.</span>
                                            <span>{coordStats.directos} directos</span>
                                            <span>{coordStats.subsCount} subs</span>
                                            <span className="text-emerald-600">{coordStats.confirmados} conf.</span>
                                            <span className="text-amber-600">{coordStats.pendientes} pend.</span>
                                          </div>
                                        </div>
                                      </div>

                                      {/* Coordinador content */}
                                      {coordExpanded && (
                                        <div className="bg-red-50/30">
                                          {/* Subcoordinadores */}
                                          {Array.from(coordData.subcoordinadores.entries()).map(([subCI, subData]) => {
                                            const subKey = `${coordKey}-sub-${subCI}`;
                                            const subExpanded = expandedNodes[subKey];
                                            const subInfo = subData.info;
                                            const subStats = subData.stats;

                                            return (
                                              <div key={subCI} className="border-t border-slate-100">
                                                {/* Sub header */}
                                                <div
                                                  className="flex items-center gap-3 p-2.5 pl-16 cursor-pointer hover:bg-blue-50 transition-colors"
                                                  onClick={() => toggleExpanded(subKey)}
                                                >
                                                  {subExpanded ? (
                                                    <ChevronDown className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                                                  ) : (
                                                    <ChevronRight className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                                                  )}
                                                  <div className="flex-1 min-w-0">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                      <Badge variant="subcoordinador">
                                                        <UserCheck className="w-3 h-3 mr-1" />
                                                        Sub
                                                      </Badge>
                                                      <span className="text-sm font-medium text-slate-700">
                                                        {getFieldSafe(subInfo, "nombre") || "Sin"} {getFieldSafe(subInfo, "apellido") || "nombre"}
                                                      </span>
                                                      <span className="text-xs text-slate-400">({subStats.total} vot.)</span>
                                                    </div>
                                                    <div className="flex flex-wrap gap-2 text-xs text-slate-500 mt-0.5">
                                                      <span className="text-green-600">{subStats.conTelefono} tel.</span>
                                                      <span className="text-emerald-600">{subStats.confirmados} conf.</span>
                                                      <span className="text-amber-600">{subStats.pendientes} pend.</span>
                                                    </div>
                                                  </div>
                                                </div>

                                                {/* Sub votantes */}
                                                {subExpanded && (
                                                  <div className="bg-blue-50/30 border-t border-slate-100">
                                                    {subData.votantes.map((v) => (
                                                      <VotanteRow key={v.ci} votante={v} indent="pl-20" />
                                                    ))}
                                                  </div>
                                                )}
                                              </div>
                                            );
                                          })}

                                          {/* Votantes directos */}
                                          {coordData.votantesDirectos.length > 0 && (
                                            <div className="border-t border-slate-200">
                                              <div className="px-4 py-2 pl-16 bg-slate-100">
                                                <span className="text-xs font-semibold text-slate-600">
                                                  Votantes directos del coordinador ({coordData.votantesDirectos.length})
                                                </span>
                                              </div>
                                              {coordData.votantesDirectos.map((v) => (
                                                <VotanteRow key={v.ci} votante={v} indent="pl-16" />
                                              ))}
                                            </div>
                                          )}

                                          {coordData.subcoordinadores.size === 0 && coordData.votantesDirectos.length === 0 && (
                                            <p className="text-xs text-slate-400 py-3 pl-16">Sin votantes asignados</p>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

// ======================= VOTANTE ROW =======================
function VotanteRow({ votante, indent = "pl-20" }) {
  const v = votante;
  const hasTel = v.telefono && String(v.telefono).trim().length > 0;

  return (
    <div className={`flex flex-wrap items-center gap-3 p-2.5 ${indent} border-t border-slate-100 hover:bg-slate-50 transition-colors`}>
      <User className="w-4 h-4 text-slate-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-slate-700">
            {getFieldSafe(v, "nombre") || "Sin"} {getFieldSafe(v, "apellido") || "nombre"}
          </span>
          <span className="text-xs text-slate-400">CI: {formatCI(v.ci)}</span>
          {v.voto_confirmado === true ? (
            <Badge variant="confirmado">
              <Check className="w-3 h-3 mr-0.5" />
              Confirmado
            </Badge>
          ) : (
            <Badge variant="pendiente">Pendiente</Badge>
          )}
          {hasTel ? (
            <Badge variant="telefono">
              <Phone className="w-3 h-3 mr-0.5" />
              {v.telefono}
            </Badge>
          ) : (
            <Badge variant="sintelefono">Sin tel.</Badge>
          )}
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-slate-500 mt-0.5">
          <span>Local: {v.local_votacion || "Sin dato"}</span>
          <span>Mesa: {v.mesa || "Sin dato"}</span>
          <span>Orden: {v.orden || "Sin dato"}</span>
        </div>
      </div>
    </div>
  );
}
