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
const relevance = (p, termNorm, isNumeric) => {
  if (isNumeric) {
    const ci = String(p.ci ?? "");
    if (ci === termNorm) return 0;              // CI exacta
    if (ci.startsWith(termNorm)) return 1;     // CI empieza con los dígitos
    return 2;                                  // CI contiene los dígitos
  }
  const full = normalize(`${p.nombre ?? ""} ${p.apellido ?? ""}`);
  if (full === termNorm) return 0;             // Nombre completo exacto
  if (full.startsWith(termNorm)) return 1;    // Empieza con la frase
  if (full.includes(termNorm)) return 2;      // Frase completa contenida
  return 3;                                   // Todas las palabras en diferente orden
};

const PAGE_SIZE = 50;

const PadronSearch = ({
  padron = [],
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
  const inputRef = useRef(null);

  // Reset página al cambiar término
  useEffect(() => { setPage(1); }, [searchTerm]);

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

  const term = searchTerm.trim();
  const termNorm = normalize(term);
  const isNumeric = /^\d+$/.test(term);
  const words = isNumeric ? [] : termNorm.split(" ").filter(Boolean);

  const filtered = useMemo(() => {
    if (!term || term.length < 2) return [];

    const results = [];
    for (const p of padron) {
      const ci = String(p.ci ?? "");

      if (isNumeric) {
        // Búsqueda por CI: el CI debe contener exactamente los dígitos escritos
        if (ci.includes(term)) results.push(p);
      } else {
        // Búsqueda por nombre/apellido: TODAS las palabras deben estar (AND)
        const full = normalize(`${p.nombre ?? ""} ${p.apellido ?? ""}`);
        if (words.length > 0 && words.every((w) => full.includes(w))) {
          results.push(p);
        }
      }
    }

    // Ordenar por relevancia, luego alfabéticamente dentro del mismo score
    results.sort((a, b) => {
      const diff = relevance(a, termNorm, isNumeric) - relevance(b, termNorm, isNumeric);
      if (diff !== 0) return diff;
      return normalize(`${a.nombre ?? ""} ${a.apellido ?? ""}`).localeCompare(
        normalize(`${b.nombre ?? ""} ${b.apellido ?? ""}`)
      );
    });

    return results.slice(0, maxResultados);
  }, [padron, term, termNorm, isNumeric, words, maxResultados]);

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

        {term.length === 1 && (
          <p className="text-xs text-amber-500 mt-1.5">
            Escriba al menos 2 caracteres para buscar.
          </p>
        )}
        {term.length >= 2 && (
          <p className="text-xs text-slate-500 mt-1.5">
            {filtered.length === 0
              ? "Sin resultados"
              : `${filtered.length} resultado${filtered.length !== 1 ? "s" : ""}${
                  filtered.length === maxResultados ? ` (mostrando los primeros ${maxResultados})` : ""
                }`}
          </p>
        )}
        {padron.length === 0 && term.length >= 2 && (
          <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            El padron aun no fue cargado. Espere un momento y vuelva a intentar.
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
            const ciKey = String(persona.ci ?? "");
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
