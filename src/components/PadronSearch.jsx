import React, { useState, useEffect, useRef } from "react";
import { Search, X, AlertCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "../supabaseClient";

// ======================= PADRON SEARCH =======================
// Componente reutilizable de búsqueda en el padrón electoral.
// Usa el padrón cargado en IndexedDB (prop `disponibles`).
// Si disponibles está vacío, hace fallback a Supabase con debounce.
//
// Props:
//   disponibles    - array de personas del padrón ya enriquecido (de getPersonasDisponibles)
//   onSelect       - función llamada con la persona seleccionada
//   titulo         - string, título del buscador (ej: "Buscar Coordinador")
//   placeholder    - string, placeholder del input
//   maxResultados  - número, máx resultados a mostrar (default 50)
//   onBack         - función opcional para botón "volver"
//   onClose        - función para cerrar el modal contenedor

const normText = (text) =>
  (text ?? "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const matchesTerm = (p, term) => {
  if (!term || term.length < 2) return false;
  const termNorm = normText(term);
  const termDigits = term.replace(/\D/g, "");

  // Búsqueda por CI (solo dígitos, partial match)
  const ciDigits = String(p.ci ?? "").replace(/\D/g, "");
  if (termDigits && ciDigits.includes(termDigits)) return true;

  // Búsqueda por nombre/apellido (cada palabra debe aparecer)
  const fullName = normText(`${p.nombre ?? ""} ${p.apellido ?? ""}`);
  const words = termNorm.split(/\s+/).filter(Boolean);
  return words.length > 0 && words.every((w) => fullName.includes(w));
};

const PAGE_SIZE = 20;

const PadronSearch = ({
  disponibles = [],
  onSelect,
  titulo = "Buscar en el Padron",
  placeholder = "Buscar por CI, nombre o apellido...",
  maxResultados = 50,
  onBack,
  onClose,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);

  // Fallback Supabase
  const [fallbackResults, setFallbackResults] = useState(null); // null = usar disponibles
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const debounceRef = useRef(null);
  const inputRef = useRef(null);

  // Reset page al cambiar término
  useEffect(() => {
    setPage(1);
  }, [searchTerm]);

  // Auto-foco al montar
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, []);

  // Fallback a Supabase cuando disponibles está vacío
  useEffect(() => {
    const term = searchTerm.trim();

    if (!term || term.length < 2) {
      setFallbackResults(null);
      setSearchError(null);
      setSearching(false);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      return;
    }

    // Si hay datos en disponibles, no hacer fallback
    if (disponibles && disponibles.length > 0) {
      setFallbackResults(null);
      setSearchError(null);
      return;
    }

    // Fallback: Supabase con debounce
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSearching(true);

    debounceRef.current = setTimeout(async () => {
      setSearchError(null);
      try {
        const termDigits = term.replace(/\D/g, "");
        const termNorm = normText(term);
        const isNumeric = /^\d+$/.test(term.trim());

        let query = supabase
          .from("padron")
          .select("ci,nombre,apellido,seccional,local_votacion,mesa,orden");

        if (isNumeric && termDigits) {
          query = query.ilike("ci", `%${termDigits}%`);
        } else {
          const words = termNorm.split(/\s+/).filter(Boolean);
          if (words.length > 0) {
            query = query.or(
              words.map((w) => `nombre.ilike.%${w}%,apellido.ilike.%${w}%`).join(",")
            );
          }
        }

        const { data, error } = await query.limit(maxResultados);

        if (error) {
          console.error("[PadronSearch] Error Supabase:", error);
          setSearchError("Error al buscar en el padron: " + error.message);
          setFallbackResults([]);
        } else {
          setFallbackResults(
            (data || []).map((p) => ({
              ...p,
              ci: String(p.ci ?? "").replace(/\D/g, ""),
              asignado: false,
              asignadoRol: null,
              asignadoPorNombre: "",
            }))
          );
        }
      } catch (err) {
        console.error("[PadronSearch] Error inesperado:", err);
        setSearchError("Error inesperado al buscar en el padron.");
        setFallbackResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchTerm, disponibles, maxResultados]);

  const term = searchTerm.trim();
  const usandoFallback = fallbackResults !== null;

  const filtered =
    term && term.length >= 2
      ? usandoFallback
        ? fallbackResults.slice(0, maxResultados)
        : disponibles
            .filter((p) => matchesTerm(p, term))
            .sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""))
            .slice(0, maxResultados)
      : [];

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageData = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="flex flex-col flex-1 overflow-hidden min-h-0">
      {/* Header del buscador */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50 shrink-0">
        <div className="flex items-center gap-2">
          {onBack && (
            <button
              onClick={onBack}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg border-0 bg-transparent shadow-none"
              aria-label="Volver"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}
          <div className="p-1.5 bg-brand-100 rounded-lg">
            <Search className="w-4 h-4 text-brand-600" />
          </div>
          <h3 className="text-base font-bold text-slate-800">{titulo}</h3>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg border-0 bg-transparent shadow-none"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Campo de búsqueda */}
      <div className="px-5 py-3 border-b border-slate-100 shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={placeholder}
            className="w-full pl-9 pr-9 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent bg-slate-50"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-0 bg-transparent border-0 shadow-none text-slate-400 hover:text-slate-600"
              aria-label="Limpiar"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Contadores / avisos */}
        {term.length === 1 && (
          <p className="text-xs text-amber-500 mt-1.5">
            Escriba al menos 2 caracteres para buscar.
          </p>
        )}
        {term.length >= 2 && (
          <p className="text-xs text-slate-500 mt-1.5">
            {searching
              ? "Buscando..."
              : searchError
              ? ""
              : `${filtered.length} resultado${filtered.length !== 1 ? "s" : ""}${
                  usandoFallback ? " (servidor)" : ""
                }${filtered.length === maxResultados ? ` — mostrando maximo ${maxResultados}` : ""}`}
          </p>
        )}
      </div>

      {/* Lista de resultados */}
      <div className="flex-1 overflow-y-auto px-5 py-3 space-y-1.5">
        {!term || term.length < 2 ? (
          <div className="text-center py-12">
            <Search className="w-8 h-8 text-slate-200 mx-auto mb-2" />
            <p className="text-sm text-slate-400">
              Escriba al menos 2 caracteres para buscar por CI, nombre o apellido.
            </p>
          </div>
        ) : searching ? (
          <div className="text-center py-12">
            <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="text-sm text-slate-400">Buscando en el padron...</p>
          </div>
        ) : searchError ? (
          <div className="text-center py-12">
            <AlertCircle className="w-8 h-8 text-red-300 mx-auto mb-2" />
            <p className="text-sm text-red-500">{searchError}</p>
          </div>
        ) : pageData.length === 0 ? (
          <div className="text-center py-12">
            <Search className="w-8 h-8 text-slate-200 mx-auto mb-2" />
            <p className="text-sm text-slate-400">
              No se encontraron resultados para{" "}
              <strong className="text-slate-600">{term}</strong>.
            </p>
          </div>
        ) : (
          pageData.map((persona) => {
            const bloqueado = persona.asignado === true;
            return (
              <div
                key={String(persona.ci)}
                onClick={() => !bloqueado && onSelect(persona)}
                className={`p-3 border rounded-xl transition-colors select-none ${
                  bloqueado
                    ? "bg-slate-50 opacity-60 cursor-not-allowed border-slate-200"
                    : "bg-white hover:bg-brand-50 hover:border-brand-200 cursor-pointer border-slate-200 active:bg-brand-100"
                }`}
              >
                <p className="font-semibold text-sm text-slate-800 truncate">
                  {(persona.nombre || "").toUpperCase()}{" "}
                  {(persona.apellido || "").toUpperCase()}
                </p>
                <div className="text-xs text-slate-500 mt-0.5 space-y-0.5">
                  <p>CI: {persona.ci}</p>
                  <div className="flex flex-wrap gap-x-3">
                    {persona.seccional && (
                      <span>Seccional: {persona.seccional}</span>
                    )}
                    {persona.local_votacion && (
                      <span className="truncate">
                        Local: {persona.local_votacion}
                      </span>
                    )}
                    {persona.mesa && <span>Mesa: {persona.mesa}</span>}
                    {persona.orden && <span>Orden: {persona.orden}</span>}
                  </div>
                </div>
                {bloqueado && (
                  <p className="text-xs text-brand-600 mt-1 font-medium truncate">
                    Ya asignado ({persona.asignadoRol})
                  </p>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Paginación */}
      {filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-slate-50 shrink-0">
          <button
            disabled={page === 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="inline-flex items-center gap-1 px-3 h-8 border border-slate-200 rounded-lg text-xs text-slate-600 disabled:opacity-40 bg-white hover:bg-slate-50 transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Anterior
          </button>
          <span className="text-xs text-slate-500">
            Pagina {page} de {totalPages}
          </span>
          <button
            disabled={page === totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="inline-flex items-center gap-1 px-3 h-8 border border-slate-200 rounded-lg text-xs text-slate-600 disabled:opacity-40 bg-white hover:bg-slate-50 transition-colors"
          >
            Siguiente
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};

export default PadronSearch;
