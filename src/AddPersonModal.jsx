import React, { useState, useEffect, useRef } from "react";
import { Search, X, UserPlus, ChevronLeft, ChevronRight, Phone, AlertCircle } from "lucide-react";
import { supabase } from "./supabaseClient";

// ======================= ADD PERSON MODAL =======================
// Para votantes: flujo de 2 pasos.
//   Paso 1: buscar y seleccionar persona del padrón.
//   Paso 2: ingresar teléfono y responder si es tercera edad.
// Para coordinador/subcoordinador: selección directa (sin paso 2).

const normalize = (text) =>
  (text ?? "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const matchesSearch = (p, term) => {
  if (!term || term.length < 2) return false;
  const termNorm = normalize(term);
  const termDigits = term.replace(/\D/g, "");

  // Búsqueda por CI (solo dígitos, partial match)
  const ciDigits = String(p.ci ?? "").replace(/\D/g, "");
  if (termDigits && ciDigits.includes(termDigits)) return true;

  // Búsqueda por nombre/apellido/nombre completo (cada palabra del término debe aparecer)
  const fullName = normalize(`${p.nombre ?? ""} ${p.apellido ?? ""}`);
  const words = termNorm.split(/\s+/).filter(Boolean);
  if (words.length > 0 && words.every((w) => fullName.includes(w))) return true;

  return false;
};

const AddPersonModal = ({ show, onClose, tipo, onAdd, disponibles }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);

  // Búsqueda en Supabase como fallback si disponibles está vacío
  const [searchResults, setSearchResults] = useState(null); // null = usar disponibles, array = fallback
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const debounceRef = useRef(null);

  // Paso 2 — solo para votantes
  const [personaSeleccionada, setPersonaSeleccionada] = useState(null);
  const [telefono, setTelefono] = useState("+595");
  const [terceraEdad, setTerceraEdad] = useState(null); // null | true | false

  const esVotante = tipo === "votante";

  useEffect(() => {
    if (!show) {
      setSearchTerm("");
      setPage(1);
      setPersonaSeleccionada(null);
      setTelefono("+595");
      setTerceraEdad(null);
      setSearchResults(null);
      setSearchError(null);
    }
  }, [show]);

  useEffect(() => {
    setPage(1);
  }, [searchTerm]);

  // Fallback a Supabase cuando disponibles está vacío y hay término de búsqueda
  useEffect(() => {
    const term = searchTerm.trim();

    if (!term || term.length < 2) {
      setSearchResults(null);
      setSearchError(null);
      return;
    }

    // Si disponibles tiene datos, usarlos directamente sin fallback
    if (disponibles && disponibles.length > 0) {
      setSearchResults(null);
      setSearchError(null);
      return;
    }

    // Fallback: buscar en Supabase
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      setSearchError(null);
      try {
        const termDigits = term.replace(/\D/g, "");
        const termNorm = normalize(term);

        let query = supabase.from("padron").select("ci,nombre,apellido,seccional,local_votacion,mesa,orden");

        if (termDigits && /^\d+$/.test(term)) {
          // Búsqueda numérica: buscar CI con ilike
          query = query.ilike("ci", `%${termDigits}%`);
        } else {
          // Búsqueda por nombre/apellido usando ilike con los primeros tokens
          const words = termNorm.split(/\s+/).filter(Boolean);
          query = query.or(
            words.map((w) => `nombre.ilike.%${w}%,apellido.ilike.%${w}%`).join(",")
          );
        }

        const { data, error } = await query.limit(100);
        if (error) {
          console.error("[v0] Error buscando en padrón (fallback Supabase):", error);
          setSearchError("Error al buscar en el padrón: " + error.message);
          setSearchResults([]);
        } else {
          // Enriquecer con asignado=false ya que no tenemos estructura aquí
          setSearchResults((data || []).map((p) => ({
            ...p,
            ci: String(p.ci ?? "").replace(/\D/g, ""),
            asignado: false,
            asignadoRol: null,
            asignadoPorNombre: "",
          })));
        }
      } catch (err) {
        console.error("[v0] Error fallback búsqueda:", err);
        setSearchError("Error inesperado al buscar en el padrón.");
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchTerm, disponibles]);

  if (!show) return null;

  const term = searchTerm.trim();

  // Determinar qué array usar: disponibles locales (IndexedDB) o resultados de Supabase
  const usandoFallback = searchResults !== null;

  const filtered = term && term.length >= 2
    ? usandoFallback
      ? searchResults
      : disponibles.filter((p) => matchesSearch(p, term)).sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""))
    : [];

  const pageSize = 20;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const startIdx = (page - 1) * pageSize;
  const pageData = filtered.slice(startIdx, startIdx + pageSize);

  const titulo =
    tipo === "coordinador"
      ? "Agregar Coordinador"
      : tipo === "subcoordinador"
      ? "Agregar Subcoordinador"
      : "Agregar Votante";

  // ---- Selección de persona ----
  const handleSelectPersona = (persona) => {
    if (esVotante) {
      // Ir al paso 2
      setPersonaSeleccionada(persona);
      setTelefono("+595");
      setTerceraEdad(null);
    } else {
      // Inserción directa para coord/subcoord
      onAdd(persona);
    }
  };

  // ---- Confirmar votante (paso 2) ----
  const handleConfirmarVotante = () => {
    const tel = String(telefono || "").trim();
    if (!tel || tel === "+595") {
      alert("El teléfono es obligatorio.");
      return;
    }
    if (terceraEdad === null) {
      alert('Debe indicar si la persona es de tercera edad (Sí o No).');
      return;
    }
    // Pasar datos extras a onAdd
    onAdd({ ...personaSeleccionada, telefono: tel, tercera_edad: terceraEdad });
  };

  // ---- Volver al paso 1 ----
  const handleVolver = () => {
    setPersonaSeleccionada(null);
    setTelefono("+595");
    setTerceraEdad(null);
  };

  // ============================
  // PASO 2: formulario de datos
  // ============================
  if (esVotante && personaSeleccionada) {
    return (
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-4"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="bg-white rounded-2xl w-full max-w-md shadow-modal overflow-hidden flex flex-col animate-fade-in">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 bg-brand-100 rounded-lg">
                <UserPlus className="w-4 h-4 text-brand-600" />
              </div>
              <h3 className="text-base font-bold text-slate-800">Datos del Votante</h3>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors border-0 bg-transparent shadow-none"
              aria-label="Cerrar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Persona seleccionada */}
          <div className="px-5 py-3 border-b border-slate-100 bg-brand-50">
            <p className="text-xs text-slate-500 mb-0.5">Persona seleccionada</p>
            <p className="font-semibold text-sm text-slate-800">
              {(personaSeleccionada.nombre || "").toUpperCase()}{" "}
              {(personaSeleccionada.apellido || "").toUpperCase()}
            </p>
            <p className="text-xs text-slate-500">CI: {personaSeleccionada.ci}</p>
          </div>

          {/* Formulario */}
          <div className="px-5 py-5 space-y-5">
            {/* Teléfono */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                <span className="flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5" />
                  Teléfono
                  <span className="text-red-500">*</span>
                </span>
              </label>
              <input
                type="tel"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                placeholder="+595 9XX XXX XXX"
                className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent bg-slate-50"
              />
              <p className="text-xs text-slate-400 mt-1">
                Aceptar formato paraguayo, incluyendo +595.
              </p>
            </div>

            {/* Tercera edad */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                <span className="flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                  ¿Es una persona de tercera edad?
                  <span className="text-red-500">*</span>
                </span>
              </label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setTerceraEdad(true)}
                  className={`flex-1 h-10 rounded-xl text-sm font-medium border transition-colors ${
                    terceraEdad === true
                      ? "bg-amber-500 border-amber-500 text-white"
                      : "bg-white border-slate-200 text-slate-700 hover:border-amber-300 hover:bg-amber-50"
                  }`}
                >
                  Si
                </button>
                <button
                  type="button"
                  onClick={() => setTerceraEdad(false)}
                  className={`flex-1 h-10 rounded-xl text-sm font-medium border transition-colors ${
                    terceraEdad === false
                      ? "bg-slate-600 border-slate-600 text-white"
                      : "bg-white border-slate-200 text-slate-700 hover:border-slate-400 hover:bg-slate-50"
                  }`}
                >
                  No
                </button>
              </div>
              {terceraEdad === null && (
                <p className="text-xs text-amber-600 mt-1.5">
                  Debe seleccionar una opcion.
                </p>
              )}
            </div>
          </div>

          {/* Acciones */}
          <div className="px-5 pb-5 flex flex-col gap-2">
            <button
              onClick={handleConfirmarVotante}
              className="w-full h-10 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm font-semibold transition-colors border-0"
            >
              Confirmar y Agregar Votante
            </button>
            <button
              onClick={handleVolver}
              className="w-full h-10 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-medium transition-colors border-0"
            >
              Volver a la busqueda
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============================
  // PASO 1: busqueda de persona
  // ============================
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
              onChange={(e) => setSearchTerm(e.target.value)}
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
          {term && term.length >= 2 && (
            <p className="text-xs text-slate-500 mt-1.5">
              {searching
                ? "Buscando..."
                : searchError
                ? ""
                : `${filtered.length} resultado${filtered.length !== 1 ? "s" : ""}${usandoFallback ? " (búsqueda en servidor)" : ""}`}
            </p>
          )}
          {term && term.length === 1 && (
            <p className="text-xs text-amber-500 mt-1.5">Escriba al menos 2 caracteres para buscar.</p>
          )}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-1.5">
          {!term || term.length < 2 ? (
            <div className="text-center py-10">
              <Search className="w-8 h-8 text-slate-200 mx-auto mb-2" />
              <p className="text-sm text-slate-400">
                Escriba al menos 2 caracteres para buscar por CI, nombre o apellido.
              </p>
            </div>
          ) : searching ? (
            <div className="text-center py-10">
              <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-sm text-slate-400">Buscando en el padrón...</p>
            </div>
          ) : searchError ? (
            <div className="text-center py-10">
              <AlertCircle className="w-8 h-8 text-red-300 mx-auto mb-2" />
              <p className="text-sm text-red-500">{searchError}</p>
            </div>
          ) : pageData.length === 0 ? (
            <div className="text-center py-10">
              <Search className="w-8 h-8 text-slate-200 mx-auto mb-2" />
              <p className="text-sm text-slate-400">No se encontraron resultados para <strong>{term}</strong>.</p>
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
                  onClick={() => !bloqueado && handleSelectPersona(persona)}
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
                      {persona.local_votacion && (
                        <span className="truncate">Local: {persona.local_votacion}</span>
                      )}
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
