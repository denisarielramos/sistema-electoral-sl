// ======================= VISTA POR SECCIONAL (SUPERADMIN) =======================
// Adaptada de la rama improve-search-and-performance: a diferencia del original,
// esta versión NO consulta Supabase — reutiliza `estructura` (ya enriquecida con el
// padrón) y `padronMap`, ambos ya cargados en memoria/IndexedDB por Dashboard.jsx.
// Incluye Dirigente (el original solo tenía Coordinador/Subcoordinador/Votante).
//
// Filtro por Seccional/Dirigente y agrupación (agregado sin tocar Supabase ni la
// forma en que se determina a qué dirigente pertenece cada registro — se reutilizan
// tal cual getCoordsDeDigente/getSubsDeDigente/getTodosVotantesDirigente, las mismas
// funciones que ya usan el Dashboard y los reportes PDF/Excel):
// - La clasificación por seccional es 100% frontend, a partir de local_votacion
//   (ver utils/seccionalHelpers.js). Un local no mapeado no se descarta: se agrupa
//   como "Sin seccional".
// - Cuando se elige un Dirigente puntual, la tabla plana se reemplaza por un
//   desglose Seccional -> Local con subtotales y el total del dirigente. Con
//   "Todos los dirigentes" (valor por defecto) el comportamiento es idéntico al de
//   antes de este cambio.

import React, { useState, useMemo } from "react";
import { ArrowLeft, Search, Users, Shield, UserCog, UserCheck, User, AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { personaCoincideConsulta } from "../utils/busquedaHelpers";
import { getCoordsDeDigente, getSubsDeDigente, getTodosVotantesDirigente } from "../utils/estructuraHelpers";
import { obtenerSeccional, nombreVisualLocal, SECCIONAL_LABELS, SECCIONALES_DISPONIBLES, SIN_SECCIONAL } from "../utils/seccionalHelpers";

// ======================= HELPERS =======================
const normalizeCI = (ci) => String(ci ?? "").replace(/\D/g, "");

const SIN_DATO = "Sin dato";

const formatCI = (ci) => {
  const digits = normalizeCI(ci);
  if (!digits) return SIN_DATO;
  const num = Number(digits);
  if (Number.isNaN(num)) return digits;
  return new Intl.NumberFormat("es-PY").format(num);
};

const ROLE_LABELS = {
  dirigente: "Dirigente",
  coordinador: "Coordinador",
  subcoordinador: "Subcoordinador",
  votante: "Votante",
};

const ROL_ORDER = { Dirigente: 1, Coordinador: 2, Subcoordinador: 3, Votante: 4 };

// campo()/buildPersona(): misma lógica de enriquecimiento (persona propia primero,
// padrón como respaldo) usada tanto para el listado global como para el listado ya
// acotado a un solo dirigente — un único lugar para no duplicar/desalinear esta
// regla entre los dos modos de la vista.
const campo = (persona, padronPersona, key) => {
  const propio = persona?.[key];
  if (propio !== null && propio !== undefined && propio !== "") return propio;
  const delPadron = padronPersona?.[key];
  if (delPadron !== null && delPadron !== undefined && delPadron !== "") return delPadron;
  return SIN_DATO;
};

const buildPersona = (role, persona, padronMap) => {
  const ci = normalizeCI(persona?.ci);
  const padronPersona = padronMap instanceof Map ? padronMap.get(ci) : undefined;
  const nombre = campo(persona, padronPersona, "nombre");
  const apellido = campo(persona, padronPersona, "apellido");
  const nombreCompleto =
    nombre !== SIN_DATO || apellido !== SIN_DATO
      ? `${nombre === SIN_DATO ? "" : nombre} ${apellido === SIN_DATO ? "" : apellido}`.trim() || SIN_DATO
      : SIN_DATO;

  const localVotacion = campo(persona, padronPersona, "local_votacion");
  const seccional = localVotacion !== SIN_DATO ? obtenerSeccional(localVotacion) : null;

  return {
    ci,
    rol: ROLE_LABELS[role],
    nombreCompleto,
    local_votacion: localVotacion,
    localVisual: localVotacion !== SIN_DATO ? nombreVisualLocal(localVotacion) : localVotacion,
    mesa: campo(persona, padronPersona, "mesa"),
    orden: campo(persona, padronPersona, "orden"),
    seccional: seccional ?? SIN_SECCIONAL,
  };
};

// ======================= BADGE =======================
const Badge = ({ variant, children }) => {
  const base = "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap";
  const variants = {
    dirigente: "bg-purple-100 text-purple-700",
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
    purple: "bg-purple-50 text-purple-600 border-purple-200",
    red: "bg-red-50 text-red-600 border-red-200",
    blue: "bg-blue-50 text-blue-600 border-blue-200",
    slate: "bg-slate-50 text-slate-600 border-slate-200",
  };
  return (
    <div className={`rounded-xl border p-4 ${colors[color]}`}>
      <div className="flex items-center gap-3">
        {Icon && (
          <div className="p-2 rounded-lg bg-white/80">
            <Icon className="w-5 h-5" />
          </div>
        )}
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-xs font-medium opacity-80">{label}</p>
        </div>
      </div>
    </div>
  );
};

// ======================= MAIN COMPONENT =======================
// estructura: { dirigentes, coordinadores, subcoordinadores, votantes } — ya enriquecida
//             con el padrón por Dashboard.jsx (useMemo `estructura`).
// padronMap:  Map<ciNormalizada, registroPadron> — usado como respaldo adicional para
//             no depender exclusivamente de que `estructura` ya haya enriquecido el campo.
// padronLoading: opcional — si el padrón sigue cargando, se informa (los campos
//             quedan en "Sin dato" hasta que termine, sin provocar errores).
// padronError: opcional — si la carga del padrón (IndexedDB/Supabase) falló, se muestra
//             un aviso explícito en vez de dejar que todo se vea silenciosamente como
//             "Sin dato". onRetryPadron permite reintentar sin salir de esta vista.
export default function VistaSeccional({
  estructura,
  padronMap,
  padronLoading = false,
  padronError = null,
  onRetryPadron,
  onBack,
}) {
  const [filtroLocal, setFiltroLocal] = useState("");
  const [filtroRol, setFiltroRol] = useState("");
  const [filtroSeccional, setFiltroSeccional] = useState("");
  const [filtroDirigente, setFiltroDirigente] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  // Locales expandidos en el desglose por dirigente (identificados por
  // `${seccional}::${local_votacion crudo}` para no colisionar entre seccionales).
  // Empiezan todos contraídos.
  const [localesExpandidos, setLocalesExpandidos] = useState(() => new Set());

  const ITEMS_PER_PAGE = 50;
  const [currentPage, setCurrentPage] = useState(1);

  // ======================= LISTADO DE PERSONAS (deduplicado por rol + CI) =======================
  // Sin cambios respecto de la versión anterior: mismo dataset (estructura completa,
  // los 4 roles), misma dedup, mismo orden. Se agrega únicamente el campo `seccional`
  // (vía buildPersona), que no altera ni el conteo ni el orden de esta lista.
  const personas = useMemo(() => {
    const seen = new Set();
    const list = [];

    const pushRole = (role, arr) => {
      (arr || []).forEach((persona) => {
        const ci = normalizeCI(persona?.ci);
        if (!ci) return;
        const key = `${role}:${ci}`;
        if (seen.has(key)) return; // no duplicar dentro del mismo rol
        seen.add(key);
        list.push(buildPersona(role, persona, padronMap));
      });
    };

    pushRole("dirigente", estructura?.dirigentes);
    pushRole("coordinador", estructura?.coordinadores);
    pushRole("subcoordinador", estructura?.subcoordinadores);
    pushRole("votante", estructura?.votantes);

    const rolOrder = { Dirigente: 1, Coordinador: 2, Subcoordinador: 3, Votante: 4 };
    list.sort((a, b) => {
      const localA = String(a.local_votacion);
      const localB = String(b.local_votacion);
      if (localA !== localB) return localA.localeCompare(localB, "es", { numeric: true });
      if (rolOrder[a.rol] !== rolOrder[b.rol]) return rolOrder[a.rol] - rolOrder[b.rol];
      return a.nombreCompleto.localeCompare(b.nombreCompleto, "es");
    });

    return list;
  }, [estructura, padronMap]);

  // ======================= DIRIGENTES DISPONIBLES (para el filtro, sin hardcodear) =======================
  const dirigentesDisponibles = useMemo(() => {
    return (estructura?.dirigentes || [])
      .map((d) => ({ ci: normalizeCI(d.ci), nombreCompleto: `${d.nombre || ""} ${d.apellido || ""}`.trim() || SIN_DATO }))
      .filter((d) => d.ci)
      .sort((a, b) => a.nombreCompleto.localeCompare(b.nombreCompleto, "es"));
  }, [estructura]);

  // ======================= LISTADO ACOTADO A UN DIRIGENTE =======================
  // Reutiliza EXACTAMENTE los mismos helpers de jerarquía que ya usa el resto de la
  // app (Dashboard, PDFs, Excel) para determinar qué pertenece a un dirigente — no
  // se reimplementa ese criterio acá.
  const personasDelDirigente = useMemo(() => {
    if (!filtroDirigente) return null;
    const dirObj = (estructura?.dirigentes || []).find((d) => normalizeCI(d.ci) === filtroDirigente);
    if (!dirObj) return [];

    const seen = new Set();
    const list = [];
    const pushRole = (role, arr) => {
      (arr || []).forEach((persona) => {
        const ci = normalizeCI(persona?.ci);
        if (!ci) return;
        const key = `${role}:${ci}`;
        if (seen.has(key)) return;
        seen.add(key);
        list.push(buildPersona(role, persona, padronMap));
      });
    };

    pushRole("dirigente", [dirObj]);
    pushRole("coordinador", getCoordsDeDigente(estructura, filtroDirigente));
    pushRole("subcoordinador", getSubsDeDigente(estructura, filtroDirigente));
    pushRole("votante", getTodosVotantesDirigente(estructura, filtroDirigente));

    return list;
  }, [estructura, padronMap, filtroDirigente]);

  // personasBase: mismo listado global de siempre cuando no hay dirigente elegido —
  // con "Todos los dirigentes" (valor por defecto) el resultado es idéntico al de
  // antes de este cambio.
  const personasBase = filtroDirigente ? personasDelDirigente : personas;

  // ======================= LOCALES DISPONIBLES (dependientes de la Seccional elegida) =======================
  // Con una seccional elegida, solo se listan los locales de esa seccional (mismo
  // mapeo frontend de utils/seccionalHelpers.js, sin duplicarlo). Con "Todas" se
  // listan todos los locales, como antes.
  const localesDisponibles = useMemo(() => {
    const set = new Set();
    personasBase.forEach((p) => {
      if (!p.local_votacion || p.local_votacion === SIN_DATO) return;
      if (filtroSeccional && String(p.seccional) !== String(filtroSeccional)) return;
      set.add(String(p.local_votacion));
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
  }, [personasBase, filtroSeccional]);

  // ======================= FILTRADO =======================
  const personasFiltradas = useMemo(() => {
    let filtered = personasBase;

    if (filtroLocal) {
      filtered = filtered.filter((p) => String(p.local_votacion) === filtroLocal);
    }
    if (filtroRol) {
      filtered = filtered.filter((p) => p.rol === filtroRol);
    }
    if (filtroSeccional) {
      filtered = filtered.filter((p) => String(p.seccional) === String(filtroSeccional));
    }
    if (searchQuery.trim()) {
      // p.ci ya son solo dígitos y p.nombreCompleto concentra nombre+apellido; se
      // reutiliza el matcher compartido (misma lógica que Dashboard.jsx) para que una
      // CI escrita como "4630621", "4.630.621", "4 630 621" o "4-630-621" matchee igual.
      filtered = filtered.filter((p) =>
        personaCoincideConsulta({ nombre: p.nombreCompleto, ci: p.ci }, searchQuery)
      );
    }

    return filtered;
  }, [personasBase, filtroLocal, filtroRol, filtroSeccional, searchQuery]);

  // ======================= AGRUPACIÓN: SECCIONAL -> LOCAL (solo con dirigente elegido) =======================
  // `localRaw` (el local_votacion crudo) queda disponible como identificador estable
  // para expandir/contraer, y las personas de cada local se ordenan igual que en el
  // listado global (rol, luego nombre) — mismos datos, sin volver a consultar nada.
  const gruposPorSeccional = useMemo(() => {
    if (!filtroDirigente) return [];

    const porSeccional = new Map();
    personasFiltradas.forEach((p) => {
      const key = p.seccional; // 1 | 2 | 3 | 4 | SIN_SECCIONAL
      if (!porSeccional.has(key)) porSeccional.set(key, new Map());
      const porLocal = porSeccional.get(key);
      const localKey = p.local_votacion;
      if (!porLocal.has(localKey)) porLocal.set(localKey, { localVisual: p.localVisual, localRaw: localKey, personas: [] });
      porLocal.get(localKey).personas.push(p);
    });

    const orden = [...SECCIONALES_DISPONIBLES, SIN_SECCIONAL];
    return orden
      .filter((key) => porSeccional.has(key))
      .map((key) => {
        const porLocal = porSeccional.get(key);
        const locales = Array.from(porLocal.values())
          .map((local) => ({
            ...local,
            personas: [...local.personas].sort((a, b) => {
              if (ROL_ORDER[a.rol] !== ROL_ORDER[b.rol]) return ROL_ORDER[a.rol] - ROL_ORDER[b.rol];
              return a.nombreCompleto.localeCompare(b.nombreCompleto, "es");
            }),
          }))
          .sort((a, b) => a.localVisual.localeCompare(b.localVisual, "es", { numeric: true }));
        const total = locales.reduce((acc, l) => acc + l.personas.length, 0);
        return { key, label: SECCIONAL_LABELS[key], locales, total };
      });
  }, [filtroDirigente, personasFiltradas]);

  // ======================= PAGINACIÓN (solo aplica a la tabla plana) =======================
  const totalPages = Math.max(1, Math.ceil(personasFiltradas.length / ITEMS_PER_PAGE));

  // Los propios setters de filtro (más abajo) vuelven a la página 1 al cambiar,
  // en vez de sincronizarlo con un efecto separado.
  const actualizarFiltroLocal = (value) => { setFiltroLocal(value); setCurrentPage(1); };
  const actualizarFiltroRol = (value) => { setFiltroRol(value); setCurrentPage(1); };
  // Si el local ya elegido no pertenece a la seccional recién seleccionada, se
  // resetea a "Todos" (con "Todas las seccionales" no se toca: ahí siempre es válido).
  const actualizarFiltroSeccional = (value) => {
    setFiltroSeccional(value);
    setCurrentPage(1);
    if (value && filtroLocal) {
      const seccionalDelLocal = obtenerSeccional(filtroLocal) ?? SIN_SECCIONAL;
      if (String(seccionalDelLocal) !== String(value)) setFiltroLocal("");
    }
  };
  const actualizarFiltroDirigente = (value) => {
    setFiltroDirigente(value);
    setCurrentPage(1);
    setLocalesExpandidos(new Set());
  };
  const actualizarBusqueda = (value) => { setSearchQuery(value); setCurrentPage(1); };

  const toggleLocalExpandido = (key) => {
    setLocalesExpandidos((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const personasPaginadas = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return personasFiltradas.slice(start, start + ITEMS_PER_PAGE);
  }, [personasFiltradas, currentPage]);

  const rangoInicio = personasFiltradas.length === 0 ? 0 : (currentPage - 1) * ITEMS_PER_PAGE + 1;
  const rangoFin = Math.min(currentPage * ITEMS_PER_PAGE, personasFiltradas.length);

  const pageNumbers = useMemo(() => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages = [];
    const delta = 2;
    const left = Math.max(2, currentPage - delta);
    const right = Math.min(totalPages - 1, currentPage + delta);
    pages.push(1);
    if (left > 2) pages.push("...");
    for (let i = left; i <= right; i++) pages.push(i);
    if (right < totalPages - 1) pages.push("...");
    pages.push(totalPages);
    return pages;
  }, [totalPages, currentPage]);

  // ======================= ESTADÍSTICAS (se recalculan con los filtros aplicados) =======================
  const hayFiltros = filtroLocal !== "" || filtroRol !== "" || filtroSeccional !== "" || filtroDirigente !== "" || searchQuery.trim() !== "";

  const stats = useMemo(() => ({
    total: personasFiltradas.length,
    dirigentes: personasFiltradas.filter((p) => p.rol === "Dirigente").length,
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
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors border-0 bg-transparent shadow-none"
                title="Volver al panel"
                aria-label="Volver al panel"
              >
                <ArrowLeft className="w-5 h-5 text-slate-600" />
              </button>
              <div>
                <h1 className="text-xl font-bold text-slate-800">Vista por local</h1>
                <p className="text-sm text-slate-500">Consulta de personas asignadas</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {padronError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">
                No se pudo cargar el padrón. Los datos mostrados pueden estar incompletos o aparecer como "Sin dato".
                {padronLoading ? " Reintentando..." : ""}
              </p>
            </div>
            {onRetryPadron && (
              <button
                onClick={onRetryPadron}
                disabled={padronLoading}
                className="px-3 py-1.5 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0"
              >
                {padronLoading ? "Reintentando..." : "Reintentar"}
              </button>
            )}
          </div>
        ) : (
          padronLoading && (
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Cargando datos del padrón — algunos campos pueden mostrarse como "Sin dato" hasta que termine.
            </p>
          )
        )}

        {/* Stats */}
        <div className="space-y-2">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <StatCard label="TOTAL PERSONAS" value={stats.total} icon={Users} color="brand" />
            <StatCard label="DIRIGENTES" value={stats.dirigentes} icon={Shield} color="purple" />
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

        {/* Filtros */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Dirigente</label>
              <select
                value={filtroDirigente}
                onChange={(e) => actualizarFiltroDirigente(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              >
                <option value="">Todos los dirigentes</option>
                {dirigentesDisponibles.map((d) => (
                  <option key={d.ci} value={d.ci}>{d.nombreCompleto}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Seccional</label>
              <select
                value={filtroSeccional}
                onChange={(e) => actualizarFiltroSeccional(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              >
                <option value="">Todas</option>
                {SECCIONALES_DISPONIBLES.map((n) => (
                  <option key={n} value={n}>{SECCIONAL_LABELS[n]}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Local</label>
              <select
                value={filtroLocal}
                onChange={(e) => actualizarFiltroLocal(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              >
                <option value="">Todos</option>
                {localesDisponibles.map((loc) => (
                  <option key={loc} value={loc}>{loc}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Rol</label>
              <select
                value={filtroRol}
                onChange={(e) => actualizarFiltroRol(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              >
                <option value="">Todos</option>
                <option value="Dirigente">Dirigente</option>
                <option value="Coordinador">Coordinador</option>
                <option value="Subcoordinador">Subcoordinador</option>
                <option value="Votante">Votante</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Buscar</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => actualizarBusqueda(e.target.value)}
                  placeholder="CI, nombre o apellido..."
                  className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                />
              </div>
            </div>
          </div>
        </div>

        {filtroDirigente ? (
          /* ======================= DESGLOSE: SECCIONAL -> LOCAL (dirigente elegido) ======================= */
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
              <p className="text-sm text-slate-600">
                {new Intl.NumberFormat("es-PY").format(personasFiltradas.length)} registro
                {personasFiltradas.length !== 1 ? "s" : ""} para{" "}
                <span className="font-semibold text-slate-800">
                  {dirigentesDisponibles.find((d) => d.ci === filtroDirigente)?.nombreCompleto || SIN_DATO}
                </span>
              </p>
            </div>

            {gruposPorSeccional.length === 0 ? (
              <div className="text-center py-20">
                <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500">No se encontraron personas</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {gruposPorSeccional.map((grupo) => (
                  <div key={grupo.key} className="px-4 py-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold text-slate-800">{grupo.label}</p>
                      <span className="text-sm font-semibold text-brand-600">{grupo.total}</span>
                    </div>
                    <div className="mt-2 space-y-1 pl-3">
                      {grupo.locales.map((local) => {
                        const localKey = `${grupo.key}::${local.localRaw}`;
                        const expandido = localesExpandidos.has(localKey);
                        return (
                          <div key={localKey}>
                            <button
                              type="button"
                              onClick={() => toggleLocalExpandido(localKey)}
                              aria-expanded={expandido}
                              className="w-full flex items-center justify-between gap-2 text-sm py-1 px-1 -mx-1 rounded-lg hover:bg-slate-50 transition-colors text-left bg-transparent border-0 shadow-none"
                            >
                              <span className="flex items-center gap-1.5 min-w-0 text-slate-600">
                                {expandido ? (
                                  <ChevronDown className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                                ) : (
                                  <ChevronRight className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                                )}
                                <span className="truncate">{local.localVisual}</span>
                              </span>
                              <span className="text-slate-500 font-medium shrink-0">{local.personas.length}</span>
                            </button>

                            {expandido && (
                              <div className="mt-1 mb-2 ml-5 border border-slate-100 rounded-lg overflow-x-auto">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="bg-slate-50 border-b border-slate-100">
                                      <th className="text-left px-2.5 py-1.5 font-semibold text-slate-500 whitespace-nowrap">NOMBRE Y APELLIDO</th>
                                      <th className="text-left px-2.5 py-1.5 font-semibold text-slate-500 whitespace-nowrap">ROL</th>
                                      <th className="text-left px-2.5 py-1.5 font-semibold text-slate-500 whitespace-nowrap">CI</th>
                                      <th className="text-left px-2.5 py-1.5 font-semibold text-slate-500 whitespace-nowrap">MESA</th>
                                      <th className="text-left px-2.5 py-1.5 font-semibold text-slate-500 whitespace-nowrap">ORDEN</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {local.personas.map((p) => (
                                      <tr key={`${p.rol}-${p.ci}`} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-2.5 py-1.5 text-slate-800 font-medium whitespace-nowrap">{p.nombreCompleto}</td>
                                        <td className="px-2.5 py-1.5">
                                          <Badge variant={p.rol.toLowerCase()}>{p.rol}</Badge>
                                        </td>
                                        <td className="px-2.5 py-1.5 text-slate-600 whitespace-nowrap font-mono">{formatCI(p.ci)}</td>
                                        <td className="px-2.5 py-1.5 text-slate-600 whitespace-nowrap">{p.mesa}</td>
                                        <td className="px-2.5 py-1.5 text-slate-600 whitespace-nowrap">{p.orden}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              <p className="text-sm font-bold text-slate-800">TOTAL DEL DIRIGENTE</p>
              <p className="text-sm font-bold text-brand-600">{personasFiltradas.length}</p>
            </div>
          </div>
        ) : (
          /* ======================= TABLA PLANA (todos los dirigentes — comportamiento sin cambios) ======================= */
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-slate-600">
                Mostrando{" "}
                <span className="font-semibold text-slate-800">{rangoInicio}-{rangoFin}</span>{" "}
                de{" "}
                <span className="font-semibold text-slate-800">
                  {new Intl.NumberFormat("es-PY").format(personasFiltradas.length)}
                </span>{" "}
                registros
              </p>
              <p className="text-sm text-slate-500">
                Pagina <span className="font-semibold text-slate-700">{currentPage}</span> de{" "}
                <span className="font-semibold text-slate-700">{totalPages}</span>
              </p>
            </div>

            {personasFiltradas.length === 0 ? (
              <div className="text-center py-20">
                <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500">No se encontraron personas</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="text-left px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">LOCAL</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">ROL</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">NOMBRE Y APELLIDO</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">CI</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">MESA</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">ORDEN</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {personasPaginadas.map((p) => (
                      <tr key={`${p.rol}-${p.ci}`} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 text-slate-700 max-w-[200px] truncate" title={String(p.local_votacion)}>
                          {p.local_votacion}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={p.rol.toLowerCase()}>{p.rol}</Badge>
                        </td>
                        <td className="px-4 py-3 text-slate-800 font-medium whitespace-nowrap">{p.nombreCompleto}</td>
                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap font-mono">{formatCI(p.ci)}</td>
                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{p.mesa}</td>
                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{p.orden}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Paginación */}
            {personasFiltradas.length > 0 && totalPages > 1 && (
              <div className="px-4 py-4 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-slate-500">
                  {new Intl.NumberFormat("es-PY").format(personasFiltradas.length)} registros en total
                </p>
                <div className="flex items-center gap-1 flex-wrap">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Anterior
                  </button>

                  {pageNumbers.map((page, i) =>
                    page === "..." ? (
                      <span key={`ellipsis-${i}`} className="px-2 py-1.5 text-sm text-slate-400">...</span>
                    ) : (
                      <button
                        key={page}
                        onClick={() => setCurrentPage(page)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                          currentPage === page
                            ? "bg-brand-600 text-white border-brand-600"
                            : "border-slate-300 bg-white hover:bg-slate-100 text-slate-700"
                        }`}
                      >
                        {page}
                      </button>
                    )
                  )}

                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
