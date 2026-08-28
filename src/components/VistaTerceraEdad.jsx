// ======================= VISTA TERCERA EDAD (SUPERADMIN) =======================
// Misma estructura que VistaSeccional.jsx (no consulta Supabase — reutiliza
// `estructura`/`padronMap` ya cargados en memoria por Dashboard.jsx), pero
// filtrada exclusivamente a votantes marcados como tercera_edad === true.
// Solo los votantes tienen este campo (se pregunta al agregarlos); dirigentes,
// coordinadores y subcoordinadores nunca aparecen acá.

import React, { useState, useMemo } from "react";
import { ArrowLeft, Search, Users, AlertTriangle } from "lucide-react";
import { personaCoincideConsulta } from "../utils/busquedaHelpers";

// ======================= HELPERS =======================
const normalizeCI = (ci) => String(ci ?? "").replace(/\D/g, "");
const normalizeRole = (value) => String(value ?? "").trim().toLowerCase();

const SIN_DATO = "Sin dato";

const formatCI = (ci) => {
  const digits = normalizeCI(ci);
  if (!digits) return SIN_DATO;
  const num = Number(digits);
  if (Number.isNaN(num)) return digits;
  return new Intl.NumberFormat("es-PY").format(num);
};

const nombrePersona = (persona) => {
  if (!persona) return SIN_DATO;
  const completo = `${persona.nombre || ""} ${persona.apellido || ""}`.trim();
  return completo || SIN_DATO;
};

// Resuelve, para un votante, quién lo tiene en su estructura: el subcoordinador
// (si lo asignó uno), el coordinador de esa rama, y el dirigente de ese coordinador.
// Misma interpretación de asignado_por/asignado_por_rol/coordinador_ci (con
// compatibilidad legacy) que ya usan getVotantesDeSubcoord/getVotantesDirectosCoord
// en utils/estructuraHelpers.js.
const resolverJerarquiaVotante = (votante, { subsPorCI, coordsPorCI, dirsPorCI }) => {
  const rol = normalizeRole(votante.asignado_por_rol);
  const asignadoPorCI = normalizeCI(votante.asignado_por);

  let subcoordinador = null;
  let coordinador = null;

  if (rol === "subcoordinador" || (rol === "" && subsPorCI.has(asignadoPorCI))) {
    subcoordinador = subsPorCI.get(asignadoPorCI) || null;
    if (subcoordinador) {
      coordinador = coordsPorCI.get(normalizeCI(subcoordinador.coordinador_ci)) || null;
    }
  } else {
    const coordCI = rol === "coordinador" ? asignadoPorCI : normalizeCI(votante.coordinador_ci);
    coordinador = coordCI ? coordsPorCI.get(coordCI) || null : null;
  }

  const dirigente = coordinador ? dirsPorCI.get(normalizeCI(coordinador.dirigente_ci)) || null : null;

  return { subcoordinador, coordinador, dirigente };
};

// ======================= STAT CARD =======================
const StatCard = ({ label, value, icon: Icon, color = "brand" }) => {
  const colors = {
    brand: "bg-brand-50 text-brand-600 border-brand-200",
    amber: "bg-amber-50 text-amber-600 border-amber-200",
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
// padronMap:  Map<ciNormalizada, registroPadron> — respaldo adicional para no depender
//             exclusivamente de que `estructura` ya haya enriquecido el campo.
// padronLoading / padronError / onRetryPadron: mismo manejo que VistaSeccional.
export default function VistaTerceraEdad({
  estructura,
  padronMap,
  padronLoading = false,
  padronError = null,
  onRetryPadron,
  onBack,
}) {
  const [filtroLocal, setFiltroLocal] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const ITEMS_PER_PAGE = 50;
  const [currentPage, setCurrentPage] = useState(1);

  // ======================= LISTADO: SOLO VOTANTES CON tercera_edad === true =======================
  const personas = useMemo(() => {
    const seen = new Set();
    const list = [];

    const subsPorCI = new Map((estructura?.subcoordinadores || []).map((s) => [normalizeCI(s.ci), s]));
    const coordsPorCI = new Map((estructura?.coordinadores || []).map((c) => [normalizeCI(c.ci), c]));
    const dirsPorCI = new Map((estructura?.dirigentes || []).map((d) => [normalizeCI(d.ci), d]));

    const campo = (persona, padronPersona, key) => {
      const propio = persona?.[key];
      if (propio !== null && propio !== undefined && propio !== "") return propio;
      const delPadron = padronPersona?.[key];
      if (delPadron !== null && delPadron !== undefined && delPadron !== "") return delPadron;
      return SIN_DATO;
    };

    (estructura?.votantes || []).forEach((persona) => {
      if (persona?.tercera_edad !== true) return;

      const ci = normalizeCI(persona?.ci);
      if (!ci) return;
      if (seen.has(ci)) return;
      seen.add(ci);

      const padronPersona = padronMap instanceof Map ? padronMap.get(ci) : undefined;
      const nombre = campo(persona, padronPersona, "nombre");
      const apellido = campo(persona, padronPersona, "apellido");
      const nombreCompleto =
        nombre !== SIN_DATO || apellido !== SIN_DATO
          ? `${nombre === SIN_DATO ? "" : nombre} ${apellido === SIN_DATO ? "" : apellido}`.trim() || SIN_DATO
          : SIN_DATO;

      const { subcoordinador, coordinador, dirigente } = resolverJerarquiaVotante(persona, { subsPorCI, coordsPorCI, dirsPorCI });

      list.push({
        ci,
        nombreCompleto,
        telefono: persona?.telefono || SIN_DATO,
        local_votacion: campo(persona, padronPersona, "local_votacion"),
        mesa: campo(persona, padronPersona, "mesa"),
        orden: campo(persona, padronPersona, "orden"),
        dirigente: nombrePersona(dirigente),
        coordinador: nombrePersona(coordinador),
        subcoordinador: nombrePersona(subcoordinador),
      });
    });

    list.sort((a, b) => {
      const localA = String(a.local_votacion);
      const localB = String(b.local_votacion);
      if (localA !== localB) return localA.localeCompare(localB, "es", { numeric: true });
      return a.nombreCompleto.localeCompare(b.nombreCompleto, "es");
    });

    return list;
  }, [estructura, padronMap]);

  // ======================= LOCALES DISPONIBLES =======================
  const localesDisponibles = useMemo(() => {
    const set = new Set();
    personas.forEach((p) => {
      if (p.local_votacion && p.local_votacion !== SIN_DATO) set.add(String(p.local_votacion));
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
  }, [personas]);

  // ======================= FILTRADO =======================
  const personasFiltradas = useMemo(() => {
    let filtered = personas;

    if (filtroLocal) {
      filtered = filtered.filter((p) => String(p.local_votacion) === filtroLocal);
    }
    if (searchQuery.trim()) {
      filtered = filtered.filter((p) =>
        personaCoincideConsulta({ nombre: p.nombreCompleto, ci: p.ci }, searchQuery)
      );
    }

    return filtered;
  }, [personas, filtroLocal, searchQuery]);

  // ======================= PAGINACIÓN =======================
  const totalPages = Math.max(1, Math.ceil(personasFiltradas.length / ITEMS_PER_PAGE));

  const actualizarFiltroLocal = (value) => { setFiltroLocal(value); setCurrentPage(1); };
  const actualizarBusqueda = (value) => { setSearchQuery(value); setCurrentPage(1); };

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

  const hayFiltros = filtroLocal !== "" || searchQuery.trim() !== "";

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
                <h1 className="text-xl font-bold text-slate-800">Tercera edad</h1>
                <p className="text-sm text-slate-500">Votantes marcados como tercera edad</p>
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
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <StatCard label="TOTAL TERCERA EDAD" value={personasFiltradas.length} icon={Users} color="amber" />
            <StatCard label="LOCALES CON TERCERA EDAD" value={localesDisponibles.length} icon={Users} color="brand" />
          </div>
          {hayFiltros && (
            <p className="text-xs text-brand-600 font-medium text-right">
              Mostrando resultados filtrados
            </p>
          )}
        </div>

        {/* Filtros */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

        {/* Tabla */}
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
              <p className="text-slate-500">No hay votantes de tercera edad registrados.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">LOCAL</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">NOMBRE Y APELLIDO</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">CI</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">DIRIGENTE</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">COORDINADOR</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">SUBCOORDINADOR</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">TELEFONO</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">MESA</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600 whitespace-nowrap">ORDEN</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {personasPaginadas.map((p) => (
                    <tr key={p.ci} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 text-slate-700 max-w-[200px] truncate" title={String(p.local_votacion)}>
                        {p.local_votacion}
                      </td>
                      <td className="px-4 py-3 text-slate-800 font-medium whitespace-nowrap">{p.nombreCompleto}</td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap font-mono">{formatCI(p.ci)}</td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{p.dirigente}</td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{p.coordinador}</td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{p.subcoordinador}</td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{p.telefono}</td>
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
      </main>
    </div>
  );
}
