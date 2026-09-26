import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Search, X, AlertCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "../supabaseClient";

// ======================= PADRON SEARCH =======================
// Si el padrón completo ya está en memoria (superadmin / caché), conserva la búsqueda local.
// Si no está cargado, consulta Supabase bajo demanda mediante buscar_padron_app y evita
// descargar ~170k registros únicamente para abrir el buscador.
// La búsqueda remota mantiene coincidencias parciales de CI y palabras de nombre/apellido.

const normalize = (value = "") =>
  String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const relevance = (p, termNorm, isNumeric) => {
  if (isNumeric) {
    const ci = String(p.ci ?? "");
    if (ci === termNorm) return 0;
    if (ci.startsWith(termNorm)) return 1;
    return 2;
  }
  const full = normalize(`${p.nombre ?? ""} ${p.apellido ?? ""}`);
  if (full === termNorm) return 0;
  if (full.startsWith(termNorm)) return 1;
  if (full.includes(termNorm)) return 2;
  return 3;
};

const PAGE_SIZE = 50;
const REMOTE_DEBOUNCE_MS = 220;

const PadronSearch = ({
  padron = [],
  padronLoading = false,
  padronError = null,
  onRetry,
  disponibles = [],
  onSelect,
  titulo = "Buscar en el Padron",
  placeholder = "Buscar por CI, nombre o apellido...",
  maxResultados = 200,
  onBack,
  onClose,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [remoteResults, setRemoteResults] = useState([]);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteError, setRemoteError] = useState(null);
  const [retryToken, setRetryToken] = useState(0);
  const inputRef = useRef(null);
  const requestSeq = useRef(0);

  useEffect(() => { setPage(1); }, [searchTerm]);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, []);

  const asignadosMap = useMemo(() => {
    const m = new Map();
    for (const p of disponibles) {
      if (p.asignado) m.set(String(p.ci ?? "").replace(/\D/g, ""), p);
    }
    return m;
  }, [disponibles]);

  const term = searchTerm.trim();
  const termNorm = normalize(term);
  const isNumeric = /^\d+$/.test(term);
  const looksNumeric = /^[\d+().\-\s]+$/.test(term);
  const minChars = looksNumeric ? 2 : 3;
  const searchReady = term.length >= minChars;
  const words = isNumeric ? [] : termNorm.split(" ").filter(Boolean);

  const remoteMode = padron.length === 0 && !padronLoading;

  useEffect(() => {
    if (!remoteMode) {
      setRemoteResults([]);
      setRemoteLoading(false);
      setRemoteError(null);
      return;
    }

    if (!searchReady) {
      requestSeq.current += 1;
      setRemoteResults([]);
      setRemoteLoading(false);
      setRemoteError(null);
      return;
    }

    const seq = ++requestSeq.current;
    const timer = setTimeout(async () => {
      setRemoteLoading(true);
      setRemoteError(null);
      try {
        const { data, error } = await supabase.rpc("buscar_padron_app", {
          termino_input: term,
          limite_input: Math.min(maxResultados, 100),
        });
        if (error) throw error;
        if (seq !== requestSeq.current) return;
        setRemoteResults(
          (data || []).map((p) => ({
            ...p,
            ci: String(p.ci ?? "").replace(/\D/g, ""),
          }))
        );
      } catch (err) {
        if (seq !== requestSeq.current) return;
        console.error("[PadronSearch] Error búsqueda remota:", err);
        setRemoteResults([]);
        setRemoteError(err?.message || "No se pudo consultar el padrón.");
      } finally {
        if (seq === requestSeq.current) setRemoteLoading(false);
      }
    }, REMOTE_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [remoteMode, term, searchReady, maxResultados, retryToken]);

  const localFiltered = useMemo(() => {
    if (remoteMode || !searchReady) return [];

    const results = [];
    for (const p of padron) {
      const ci = String(p.ci ?? "");
      if (isNumeric) {
        if (ci.includes(term)) results.push(p);
      } else {
        const full = normalize(`${p.nombre ?? ""} ${p.apellido ?? ""}`);
        if (words.length > 0 && words.every((w) => full.includes(w))) results.push(p);
      }
    }

    results.sort((a, b) => {
      const diff = relevance(a, termNorm, isNumeric) - relevance(b, termNorm, isNumeric);
      if (diff !== 0) return diff;
      return normalize(`${a.nombre ?? ""} ${a.apellido ?? ""}`).localeCompare(
        normalize(`${b.nombre ?? ""} ${b.apellido ?? ""}`)
      );
    });

    return results.slice(0, maxResultados);
  }, [remoteMode, searchReady, padron, term, termNorm, isNumeric, words, maxResultados]);

  const results = remoteMode ? remoteResults : localFiltered;
  const totalPages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const pageData = results.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const loadingSearch = padronLoading || remoteLoading;
  const searchError = padronError || remoteError;

  const handleRetry = useCallback(() => {
    if (remoteMode) {
      setRetryToken((v) => v + 1);
    } else {
      onRetry?.();
    }
  }, [remoteMode, onRetry]);

  return (
    <div className="flex flex-col flex-1 overflow-hidden min-h-0">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50 shrink-0">
        <div className="flex items-center gap-2">
          {onBack && (
            <button onClick={onBack} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg border-0 bg-transparent shadow-none" aria-label="Volver">
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}
          <div className="p-1.5 bg-brand-100 rounded-lg"><Search className="w-4 h-4 text-brand-600" /></div>
          <h3 className="text-base font-bold text-slate-800">{titulo}</h3>
        </div>
        {onClose && (
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg border-0 bg-transparent shadow-none" aria-label="Cerrar">
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
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={padronLoading ? "Preparando padrón..." : placeholder}
            disabled={padronLoading}
            className="w-full pl-9 pr-9 py-2.5 text-base sm:text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
          />
          {searchTerm && !padronLoading && (
            <button onClick={() => setSearchTerm("")} className="absolute right-3 top-1/2 -translate-y-1/2 p-0 bg-transparent border-0 shadow-none text-slate-400 hover:text-slate-600" aria-label="Limpiar">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {!loadingSearch && !searchError && term.length > 0 && !searchReady && (
          <p className="text-xs text-amber-500 mt-1.5">
            {minChars === 2 ? "Escriba al menos 2 dígitos para buscar." : "Escriba al menos 3 caracteres para buscar por nombre."}
          </p>
        )}
        {!loadingSearch && !searchError && searchReady && (
          <p className="text-xs text-slate-500 mt-1.5">
            {results.length === 0
              ? "Sin resultados"
              : `${results.length} resultado${results.length !== 1 ? "s" : ""}${results.length === Math.min(maxResultados, 100) ? " (límite de búsqueda)" : ""}`}
          </p>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-3 space-y-1.5">
        {loadingSearch && searchReady ? (
          <div className="text-center py-12">
            <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-slate-500 font-medium">Buscando...</p>
          </div>
        ) : searchError ? (
          <div className="text-center py-12">
            <AlertCircle className="w-8 h-8 text-red-300 mx-auto mb-3" />
            <p className="text-sm text-red-600 font-medium">No se pudo consultar el padrón</p>
            <p className="text-xs text-slate-400 mt-1 mb-4 max-w-xs mx-auto">{searchError}</p>
            <button onClick={handleRetry} className="px-4 h-9 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-medium border-0 transition-colors">Reintentar</button>
          </div>
        ) : !searchReady ? (
          <div className="text-center py-12">
            <Search className="w-8 h-8 text-slate-200 mx-auto mb-2" />
            <p className="text-sm text-slate-400">Escriba al menos 3 letras para nombre/apellido o 2 dígitos para CI/teléfono.</p>
            <p className="text-xs text-slate-300 mt-1">{remoteMode ? "Búsqueda directa en el padrón" : `${padron.length.toLocaleString()} registros disponibles`}</p>
          </div>
        ) : pageData.length === 0 ? (
          <div className="text-center py-12">
            <Search className="w-8 h-8 text-slate-200 mx-auto mb-2" />
            <p className="text-sm text-slate-400">No se encontraron resultados para <strong className="text-slate-600">{term}</strong>.</p>
          </div>
        ) : (
          pageData.map((persona) => {
            const ciKey = String(persona.ci ?? "").replace(/\D/g, "");
            const asignadoInfo = asignadosMap.get(ciKey);
            const bloqueado = !!asignadoInfo;
            return (
              <div
                key={ciKey}
                onClick={() => !bloqueado && onSelect(persona)}
                className={`p-3 border rounded-xl transition-colors select-none ${bloqueado ? "bg-slate-50 opacity-60 cursor-not-allowed border-slate-200" : "bg-white hover:bg-brand-50 hover:border-brand-200 cursor-pointer border-slate-200 active:bg-brand-100"}`}
              >
                <p className="font-semibold text-sm text-slate-800 truncate">{(persona.nombre || "").toUpperCase()} {(persona.apellido || "").toUpperCase()}</p>
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
                    {asignadoInfo.asignadoPorNombre && ` — agregado por ${asignadoInfo.asignadoPorNombre}`}
                  </p>
                )}
              </div>
            );
          })
        )}
      </div>

      {results.length > PAGE_SIZE && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-slate-50 shrink-0">
          <button disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="inline-flex items-center gap-1 px-3 h-8 border border-slate-200 rounded-lg text-xs text-slate-600 disabled:opacity-40 bg-white hover:bg-slate-50 transition-colors">
            <ChevronLeft className="w-3.5 h-3.5" /> Anterior
          </button>
          <span className="text-xs text-slate-500">Pagina {page} de {totalPages}</span>
          <button disabled={page === totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="inline-flex items-center gap-1 px-3 h-8 border border-slate-200 rounded-lg text-xs text-slate-600 disabled:opacity-40 bg-white hover:bg-slate-50 transition-colors">
            Siguiente <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};

export default PadronSearch;