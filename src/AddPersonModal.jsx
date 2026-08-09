import React, { useState, useEffect, useMemo } from "react";
import { Search, X, UserPlus, ChevronLeft, ChevronRight } from "lucide-react";

const normalize = (text) =>
  (text || "").toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const AddPersonModal = ({ show, onClose, tipo, onAdd, disponibles }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedTerm, setDebouncedTerm] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (show) return undefined;
    const timer = window.setTimeout(() => {
      setSearchTerm("");
      setDebouncedTerm("");
      setPage(1);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [show]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedTerm(searchTerm), 180);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  const term = show ? debouncedTerm.trim() : "";

  const filtered = useMemo(() => {
    if (!term) return [];

    const matches = [];
    const words = normalize(term).split(" ").filter(Boolean);

    for (const persona of disponibles) {
      const searchText = persona._searchText || normalize(
        `${persona.ci ?? ""} ${persona.nombre ?? ""} ${persona.apellido ?? ""}`
      );

      if (words.every((word) => searchText.includes(word))) {
        matches.push(persona);
        if (matches.length >= 200) break;
      }
    }

    return matches.sort((a, b) => {
      const exactA = a.ci?.toString() === searchTerm;
      const exactB = b.ci?.toString() === searchTerm;
      if (exactA && !exactB) return -1;
      if (!exactA && exactB) return 1;
      return (a.nombre || "").localeCompare(b.nombre || "");
    });
  }, [disponibles, searchTerm, term]);

  const pageSize = 20;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const startIdx = (page - 1) * pageSize;
  const pageData = filtered.slice(startIdx, startIdx + pageSize);

  const titulo =
    tipo === "coordinador" ? "Agregar Coordinador"
    : tipo === "subcoordinador" ? "Agregar Subcoordinador"
    : "Agregar Votante";

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-2xl w-full max-w-xl shadow-modal overflow-hidden flex flex-col max-h-[90vh] animate-fade-in">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-brand-100 rounded-lg">
              <UserPlus className="w-4 h-4 text-brand-600" />
            </div>
            <h3 className="text-base font-bold text-slate-800">{titulo}</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors border-0 bg-transparent shadow-none"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-5 py-3 border-b border-slate-100 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              placeholder="Buscar por CI, nombre o apellido..."
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
              className="w-full pl-9 pr-9 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent bg-slate-50"
              autoFocus
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0 bg-transparent border-0 shadow-none"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          {searchTerm && (
            <p className="text-xs text-slate-500 mt-1.5">
              {filtered.length} resultado{filtered.length !== 1 ? "s" : ""}
            </p>
          )}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-1.5">
          {!searchTerm ? (
            <div className="text-center py-10">
              <Search className="w-8 h-8 text-slate-200 mx-auto mb-2" />
              <p className="text-sm text-slate-400">Escriba para buscar personas del padrón.</p>
            </div>
          ) : pageData.length === 0 ? (
            <div className="text-center py-10">
              <Search className="w-8 h-8 text-slate-200 mx-auto mb-2" />
              <p className="text-sm text-slate-400">No se encontraron resultados.</p>
            </div>
          ) : (
            pageData.map((persona) => {
              const bloqueado = persona.asignado === true;
              const asignador =
                persona.asignadoPorNombreResolved ||
                persona.asignadoPorNombre ||
                (persona.asignadoRol === "Coordinador" ? "Superadmin" : "Asignado");
              const asignadorRol = persona.asignadoPorRolResolved || persona.asignadoRol || "";

              return (
                <div
                  key={persona.ci}
                  onClick={() => !bloqueado && onAdd(persona)}
                  className={`p-3 border rounded-xl transition-colors ${
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
                      {persona.local_votacion && <span className="truncate">Local: {persona.local_votacion}</span>}
                      {persona.mesa && <span>Mesa: {persona.mesa}</span>}
                      {persona.orden && <span>Orden: {persona.orden}</span>}
                    </div>
                  </div>
                  {bloqueado && (
                    <p className="text-xs text-brand-600 mt-1 font-medium truncate">
                      Ya asignado por {asignador}
                      {asignadorRol ? ` (${asignadorRol})` : ""}
                    </p>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Pagination */}
        {filtered.length > pageSize && (
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
              Página {page} de {totalPages}
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

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-100 shrink-0">
          <button
            onClick={onClose}
            className="w-full h-10 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-medium transition-colors border-0"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddPersonModal;
