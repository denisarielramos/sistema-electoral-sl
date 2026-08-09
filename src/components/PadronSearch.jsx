import React, { useState, useEffect, useRef, useMemo } from "react";
import { Search, X, AlertCircle, ChevronLeft, ChevronRight } from "lucide-react";

// ======================= PADRON SEARCH =======================
// Busca sobre el arreglo `padron` completo cargado desde IndexedDB.
// No realiza ninguna consulta a Supabase.
//
// Props:
//   padron        - array completo del padrón (de IndexedDB / estado App)
//   disponibles   - array enriquecido de getPersonasDisponibles (para marcar asignados)
//   onSelect      - fn(persona) llamada al hacer click en un resultado
//   titulo        - string
//   placeholder   - string
//   maxResultados - max resultados TOTALES tras filtrar y ordenar (default 200)
//   onBack        - fn opcional para botón "volver"
//   onClose       - fn para cerrar el modal contenedor

// Normaliza texto: minúsculas, sin tildes, sin espacios duplicados
const normalize = (value = "") =>
  String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

// Puntaje de relevancia — menor = más relevante
const relevance = (entry, termNorm, isNumeric) => {
  if (isNumeric) {
    const ci = entry.ci;
    if (ci === termNorm) return 0;              // CI exacta
    if (ci.startsWith(termNorm)) return 1;     // CI empieza con los dígitos
    return 2;                                  // CI contiene los dígitos
  }
  const full = entry.full;
  if (full === termNorm) return 0;             // Nombre completo exacto
  if (full.startsWith(termNorm)) return 1;    // Empieza con la frase
  if (full.includes(termNorm)) return 2;      // Frase completa contenida
  return 3;                                   // Todas las palabras en diferente orden
};

const PAGE_SIZE = 50;

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
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const inputRef = useRef(null);

  // Evita recorrer todo el padrón en cada tecla mientras el usuario todavía escribe.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchTerm(searchTerm), 180);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Auto-foco al montar
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, []);

  // Mapa de CIs asignados para marcar rápidamente
  const asignadosMap = useMemo(() => {
    const m = new Map();
    for (const p of disponibles) {
      if (p.asignado) m.set(String(p.ci ?? "").replace(/\D/g, ""), p);
    }
    return m;
  }, [disponibles]);

  // Nombre normalizado una sola vez al abrir el buscador, no una vez por tecla.
  const indexedPadron = useMemo(
    () => padron.map((persona) => ({
      persona,
      ci: String(persona.ci ?? "").replace(/\D/g, ""),
      full: normalize(`${persona.nombre ?? ""} ${persona.apellido ?? ""}`),
    })),
    [padron]
  );

  const typedTerm = searchTerm.trim();
  const term = debouncedSearchTerm.trim();
  const termNorm = normalize(term);
  const isNumeric = /^\d+$/.test(term);
  const words = useMemo(
    () => (isNumeric ? [] : termNorm.split(" ").filter(Boolean)),
    [isNumeric, termNorm]
  );

  const filtered = useMemo(() => {
    if (!term || term.length < 2) return [];

    const results = [];
    for (const entry of indexedPadron) {
      const { ci, full } = entry;

      if (isNumeric) {
        // Búsqueda por CI: el CI debe contener exactamente los dígitos escritos
        if (ci.includes(term)) results.push(entry);
      } else {
        // Búsqueda por nombre/apellido: TODAS las palabras deben estar (AND)
        if (words.length > 0 && words.every((w) => full.includes(w))) {
          results.push(entry);
        }
      }
    }

    // Ordenar por relevancia, luego alfabéticamente dentro del mismo score
    results.sort((a, b) => {
      const diff = relevance(a, termNorm, isNumeric) - relevance(b, termNorm, isNumeric);
      if (diff !== 0) return diff;
      return a.full.localeCompare(b.full);
    });

    return results.slice(0, maxResultados).map((entry) => entry.persona);
  }, [indexedPadron, term, termNorm, isNumeric, words, maxResultados]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageData = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="flex flex-col flex-1 overflow-hidden min-h-0">
      {/* Header */}
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
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setPage(1);
            }}
            placeholder={padronLoading ? "Cargando padron..." : placeholder}
            disabled={padronLoading || !!padronError}
            className="w-full pl-9 pr-9 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
          />
          {searchTerm && !padronLoading && (
            <button
              onClick={() => {
                setSearchTerm("");
                setPage(1);
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-0 bg-transparent border-0 shadow-none text-slate-400 hover:text-slate-600"
              aria-label="Limpiar"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {!padronLoading && !padronError && typedTerm.length === 1 && (
          <p className="text-xs text-amber-500 mt-1.5">
            Escriba al menos 2 caracteres para buscar.
          </p>
        )}
        {!padronLoading && !padronError && typedTerm.length >= 2 && (
          <p className="text-xs text-slate-500 mt-1.5">
            {filtered.length === 0
              ? "Sin resultados"
              : `${filtered.length} resultado${filtered.length !== 1 ? "s" : ""}${
                  filtered.length === maxResultados ? ` (mostrando los primeros ${maxResultados})` : ""
                }`}
          </p>
        )}
      </div>

      {/* Lista de resultados — estados mutuamente excluyentes */}
      <div className="flex-1 overflow-y-auto px-5 py-3 space-y-1.5">
        {/* ESTADO 1: Cargando padrón */}
        {padronLoading ? (
          <div className="text-center py-12">
            <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-slate-500 font-medium">Cargando padron...</p>
            <p className="text-xs text-slate-400 mt-1">Esto puede tardar unos segundos la primera vez.</p>
          </div>
        ) : padronError ? (
          /* ESTADO 2: Error */
          <div className="text-center py-12">
            <AlertCircle className="w-8 h-8 text-red-300 mx-auto mb-3" />
            <p className="text-sm text-red-600 font-medium">Error al cargar el padron</p>
            <p className="text-xs text-slate-400 mt-1 mb-4 max-w-xs mx-auto">{padronError}</p>
            {onRetry && (
              <button
                onClick={onRetry}
                className="px-4 h-9 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-medium border-0 transition-colors"
              >
                Reintentar
              </button>
            )}
          </div>
        ) : !typedTerm || typedTerm.length < 2 ? (
          /* ESTADO 3: Sin término de búsqueda */
          <div className="text-center py-12">
            <Search className="w-8 h-8 text-slate-200 mx-auto mb-2" />
            <p className="text-sm text-slate-400">
              Escriba al menos 2 caracteres para buscar por CI, nombre o apellido.
            </p>
            <p className="text-xs text-slate-300 mt-1">
              {padron.length > 0 ? `${padron.length.toLocaleString()} registros disponibles` : ""}
            </p>
          </div>
        ) : pageData.length === 0 ? (
          /* ESTADO 4: Sin resultados */
          <div className="text-center py-12">
            <Search className="w-8 h-8 text-slate-200 mx-auto mb-2" />
            <p className="text-sm text-slate-400">
              No se encontraron resultados para{" "}
              <strong className="text-slate-600">{term}</strong>.
            </p>
          </div>
        ) : (
          /* ESTADO 5: Resultados */
          pageData.map((persona) => {
            const ciKey = String(persona.ci ?? "").replace(/\D/g, "");
            const asignadoInfo = asignadosMap.get(ciKey);
            const bloqueado = !!asignadoInfo;
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
                  {(persona.nombre || "").toUpperCase()}{" "}
                  {(persona.apellido || "").toUpperCase()}
                </p>
                <div className="text-xs text-slate-500 mt-0.5 space-y-0.5">
                  <p>CI: {persona.ci}</p>
                  <div className="flex flex-wrap gap-x-3">
                    {persona.seccional && <span>Seccional: {persona.seccional}</span>}
                    {persona.local_votacion && (
                      <span className="truncate">Local: {persona.local_votacion}</span>
                    )}
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
