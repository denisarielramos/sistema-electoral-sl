import React, { useEffect, useMemo, useRef, useState } from "react";
import { Search, X, AlertCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "../supabaseClient";

// Busca en Supabase después de una pausa breve de escritura. De esta forma el
// navegador nunca recorre los 170 mil registros del padrón por cada tecla.

const normalize = (value = "") =>
  String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const relevance = (persona, termNorm, isNumeric) => {
  if (isNumeric) {
    const ci = String(persona.ci ?? "");
    if (ci === termNorm) return 0;
    if (ci.startsWith(termNorm)) return 1;
    return 2;
  }

  const full = normalize(`${persona.nombre ?? ""} ${persona.apellido ?? ""}`);
  if (full === termNorm) return 0;
  if (full.startsWith(termNorm)) return 1;
  if (full.includes(termNorm)) return 2;
  return 3;
};

const PAGE_SIZE = 50;
const DEBOUNCE_MS = 300;
const MAX_CI_DIGITS = 9;

const buildCIPrefixFilter = (digits) => {
  if (digits.length > MAX_CI_DIGITS) return `ci.eq.${Number(digits)}`;

  const prefix = Number(digits);
  const clauses = [];
  for (let totalDigits = digits.length; totalDigits <= MAX_CI_DIGITS; totalDigits += 1) {
    const factor = 10 ** (totalDigits - digits.length);
    const lower = prefix * factor;
    const upper = (prefix + 1) * factor - 1;
    clauses.push(factor === 1 ? `ci.eq.${lower}` : `and(ci.gte.${lower},ci.lte.${upper})`);
  }
  return clauses.join(",");
};

const PadronSearch = ({
  disponibles = [],
  onSelect,
  titulo = "Buscar en el Padron",
  placeholder = "Buscar por CI, nombre o apellido...",
  maxResultados = 100,
  onBack,
  onClose,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedTerm, setDebouncedTerm] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [page, setPage] = useState(1);
  const [retryKey, setRetryKey] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedTerm(searchTerm.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => { setPage(1); }, [searchTerm]);

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, []);

  const asignadosMap = useMemo(() => {
    const map = new Map();
    for (const persona of disponibles) {
      if (persona.asignado) {
        map.set(String(persona.ci ?? "").replace(/\D/g, ""), persona);
      }
    }
    return map;
  }, [disponibles]);

  useEffect(() => {
    const term = debouncedTerm.trim();
    if (term.length < 2) {
      setResults([]);
      setSearching(false);
      setSearchError(null);
      return undefined;
    }

    const controller = new AbortController();
    let active = true;

    const runSearch = async () => {
      setSearching(true);
      setSearchError(null);

      try {
        const isNumeric = /^\d+$/.test(term);
        let query = supabase
          .from("padron")
          .select("ci,nombre,apellido,local_codigo,local_votacion,mesa,orden,direccion,vigente")
          .eq("vigente", true)
          .limit(maxResultados)
          .abortSignal(controller.signal);

        if (isNumeric) {
          query = query.or(buildCIPrefixFilter(term)).order("ci", { ascending: true });
        } else {
          const words = term
            .replace(/[^\p{L}\p{N}\s]/gu, " ")
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 5);

          if (words.length === 0) {
            if (active) setResults([]);
            return;
          }

          for (const word of words) {
            query = query.or(`nombre.ilike.%${word}%,apellido.ilike.%${word}%`);
          }
          query = query.order("apellido", { ascending: true }).order("nombre", { ascending: true });
        }

        const { data, error } = await query;
        if (error) throw error;
        if (!active) return;

        const termNorm = normalize(term);
        const ordered = [...(data || [])].sort((a, b) => {
          const score = relevance(a, termNorm, isNumeric) - relevance(b, termNorm, isNumeric);
          if (score !== 0) return score;
          return normalize(`${a.nombre ?? ""} ${a.apellido ?? ""}`).localeCompare(
            normalize(`${b.nombre ?? ""} ${b.apellido ?? ""}`)
          );
        });
        setResults(ordered);
      } catch (error) {
        if (!active || error?.name === "AbortError") return;
        console.error("[PadronSearch] Error buscando en padrón:", error);
        setResults([]);
        setSearchError(error?.message || "No se pudo realizar la búsqueda.");
      } finally {
        if (active) setSearching(false);
      }
    };

    runSearch();
    return () => {
      active = false;
      controller.abort();
    };
  }, [debouncedTerm, maxResultados, retryKey]);

  const term = searchTerm.trim();
  const waitingForDebounce = term.length >= 2 && term !== debouncedTerm;
  const totalPages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const pageData = results.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const isBusy = searching || waitingForDebounce;

  return (
    <div className="flex flex-col flex-1 overflow-hidden min-h-0">
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

      <div className="px-5 py-3 border-b border-slate-100 shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder={placeholder}
            className="w-full pl-9 pr-9 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent bg-slate-50"
          />
          {searchTerm && (
            <button
              onClick={() => { setSearchTerm(""); setDebouncedTerm(""); setResults([]); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-0 bg-transparent border-0 shadow-none text-slate-400 hover:text-slate-600"
              aria-label="Limpiar"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {term.length === 1 && (
          <p className="text-xs text-amber-500 mt-1.5">Escriba al menos 2 caracteres para buscar.</p>
        )}
        {term.length >= 2 && !isBusy && !searchError && (
          <p className="text-xs text-slate-500 mt-1.5">
            {results.length === 0
              ? "Sin resultados"
              : `${results.length} resultado${results.length !== 1 ? "s" : ""}${
                  results.length === maxResultados ? ` (mostrando los primeros ${maxResultados})` : ""
                }`}
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-3 space-y-1.5">
        {isBusy ? (
          <div className="text-center py-12">
            <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-slate-500 font-medium">Buscando...</p>
          </div>
        ) : searchError ? (
          <div className="text-center py-12">
            <AlertCircle className="w-8 h-8 text-red-300 mx-auto mb-3" />
            <p className="text-sm text-red-600 font-medium">Error al buscar en el padrón</p>
            <p className="text-xs text-slate-400 mt-1 mb-4 max-w-xs mx-auto">{searchError}</p>
            <button
              onClick={() => setRetryKey((value) => value + 1)}
              className="px-4 h-9 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-medium border-0 transition-colors"
            >
              Reintentar
            </button>
          </div>
        ) : term.length < 2 ? (
          <div className="text-center py-12">
            <Search className="w-8 h-8 text-slate-200 mx-auto mb-2" />
            <p className="text-sm text-slate-400">
              Escriba al menos 2 caracteres para buscar por CI, nombre o apellido.
            </p>
          </div>
        ) : pageData.length === 0 ? (
          <div className="text-center py-12">
            <Search className="w-8 h-8 text-slate-200 mx-auto mb-2" />
            <p className="text-sm text-slate-400">
              No se encontraron resultados para <strong className="text-slate-600">{term}</strong>.
            </p>
          </div>
        ) : (
          pageData.map((persona) => {
            const ciKey = String(persona.ci ?? "").replace(/\D/g, "");
            const asignadoInfo = asignadosMap.get(ciKey);
            const bloqueado = Boolean(asignadoInfo);
            return (
              <div
                key={ciKey}
                onClick={() => !bloqueado && onSelect(persona)}
                className={`p-3 border rounded-xl transition-colors select-none ${
                  bloqueado
                    ? "bg-slate-50 opacity-60 cursor-not-allowed border-slate-200"
                    : "bg-white hover:bg-brand-50 hover:border-brand-200 cursor-pointer border-slate-200 active:bg-brand-100"
                }`}
              >
                <p className="font-semibold text-sm text-slate-800 truncate">
                  {(persona.nombre || "").toUpperCase()} {(persona.apellido || "").toUpperCase()}
                </p>
                <div className="text-xs text-slate-500 mt-0.5 space-y-0.5">
                  <p>CI: {persona.ci}</p>
                  <div className="flex flex-wrap gap-x-3">
                    {persona.local_votacion && <span className="truncate">Local: {persona.local_votacion}</span>}
                    {persona.mesa && <span>Mesa: {persona.mesa}</span>}
                    {persona.orden && <span>Orden: {persona.orden}</span>}
                  </div>
                </div>
                {bloqueado && (
                  <p className="text-xs text-brand-600 mt-1 font-medium truncate">
                    Ya asignado ({asignadoInfo.asignadoRol})
                  </p>
                )}
              </div>
            );
          })
        )}
      </div>

      {results.length > PAGE_SIZE && !isBusy && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-slate-50 shrink-0">
          <button
            disabled={page === 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
            className="inline-flex items-center gap-1 px-3 h-8 border border-slate-200 rounded-lg text-xs text-slate-600 disabled:opacity-40 bg-white hover:bg-slate-50 transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Anterior
          </button>
          <span className="text-xs text-slate-500">Pagina {page} de {totalPages}</span>
          <button
            disabled={page === totalPages}
            onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
            className="inline-flex items-center gap-1 px-3 h-8 border border-slate-200 rounded-lg text-xs text-slate-600 disabled:opacity-40 bg-white hover:bg-slate-50 transition-colors"
          >
            Siguiente <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};

export default PadronSearch;
