import React, { useState, useEffect } from "react";
import { Search, X, UserPlus, ChevronLeft, ChevronRight, Phone, AlertCircle } from "lucide-react";

// ======================= ADD PERSON MODAL =======================
// Para votantes: flujo de 2 pasos.
//   Paso 1: buscar y seleccionar persona del padrón.
//   Paso 2: ingresar teléfono y responder si es tercera edad.
// Para coordinador/subcoordinador: selección directa (sin paso 2).

const AddPersonModal = ({ show, onClose, tipo, onAdd, disponibles }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);

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
    }
  }, [show]);

  useEffect(() => {
    setPage(1);
  }, [searchTerm]);

  if (!show) return null;

  const term = searchTerm.trim();

  const normalize = (text) =>
    (text || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

  const filtered = term
    ? disponibles
        .filter((p) => {
          const fullName = `${p.nombre ?? ""} ${p.apellido ?? ""}`;
          const fullNameNorm = normalize(fullName);
          const ciTxt = (p.ci ?? "").toString().toLowerCase();
          const words = normalize(term).split(" ").filter(Boolean);
          return words.every((w) => ciTxt.includes(w) || fullNameNorm.includes(w));
        })
        .sort((a, b) => {
          const exactA = a.ci?.toString() === searchTerm;
          const exactB = b.ci?.toString() === searchTerm;
          if (exactA && !exactB) return -1;
          if (!exactA && exactB) return 1;
          return (a.nombre || "").localeCompare(b.nombre || "");
        })
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
              <p className="text-sm text-slate-400">
                Escriba para buscar personas del padron.
              </p>
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
