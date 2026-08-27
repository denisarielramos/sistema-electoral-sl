import React, { useState, useEffect } from "react";
import { X, UserPlus, Phone, AlertCircle } from "lucide-react";
import PadronSearch from "./components/PadronSearch";
import {
  sanitizeParaguayPhoneInput,
  validateParaguayPhone,
} from "./utils/phoneValidation";

// ======================= ADD PERSON MODAL =======================
// Para votantes: flujo de 2 pasos.
//   Paso 1: PadronSearch — buscar y seleccionar persona.
//   Paso 2: ingresar teléfono y responder si es tercera edad.
// Para coordinador/subcoordinador: selección directa (sin paso 2).
//
// Props:
//   show         - boolean
//   onClose      - fn
//   tipo         - "votante" | "subcoordinador"  (coordinador va por ModalAgregarCoordinador)
//   onAdd        - fn(persona) — para coord/sub; fn({...persona, telefono, tercera_edad}) para votante
//   disponibles  - array de personas del padrón enriquecido

const AddPersonModal = ({
  show, onClose, tipo, onAdd,
  padron = [], padronLoading = false, padronError = null, onRetryPadron,
  disponibles = [],
}) => {
  // Paso 2 — solo para votantes
  const [personaSeleccionada, setPersonaSeleccionada] = useState(null);
  const [telefono, setTelefono] = useState("+595");
  const [telefonoError, setTelefonoError] = useState(null);
  const [terceraEdad, setTerceraEdad] = useState(null); // null | true | false

  const esVotante = tipo === "votante";

  useEffect(() => {
    if (!show) {
      setPersonaSeleccionada(null);
      setTelefono("+595");
      setTelefonoError(null);
      setTerceraEdad(null);
    }
  }, [show]);

  if (!show) return null;

  const titulo =
    tipo === "subcoordinador"
      ? "Agregar Subcoordinador"
      : "Agregar Votante";

  // ---- Selección de persona desde PadronSearch ----
  const handleSelectPersona = (persona) => {
    if (esVotante) {
      setPersonaSeleccionada(persona);
      setTelefono("+595");
      setTerceraEdad(null);
    } else {
      // Inserción directa para subcoord
      onAdd(persona);
    }
  };

  // ---- Confirmar votante (paso 2) ----
  const handleConfirmarVotante = () => {
    const result = validateParaguayPhone(telefono);
    if (!result.valid) {
      setTelefonoError(result.error);
      return;
    }
    if (terceraEdad === null) {
      alert("Debe indicar si la persona es de tercera edad (Si o No).");
      return;
    }
    onAdd({ ...personaSeleccionada, telefono: result.normalized, tercera_edad: terceraEdad });
  };

  const handleVolver = () => {
    setPersonaSeleccionada(null);
    setTelefono("+595");
    setTelefonoError(null);
    setTerceraEdad(null);
  };

  // ============================
  // PASO 2: formulario de datos (solo votante)
  // ============================
  if (esVotante && personaSeleccionada) {
    return (
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-4"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
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
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg border-0 bg-transparent shadow-none"
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
                  Telefono
                  <span className="text-red-500">*</span>
                </span>
              </label>
              <input
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                maxLength={16}
                value={telefono}
                onChange={(e) => {
                  setTelefono(sanitizeParaguayPhoneInput(e.target.value));
                  setTelefonoError(null);
                }}
                placeholder="+595 9XX XXX XXX"
                className={`w-full px-4 py-2.5 text-sm border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent bg-slate-50 ${
                  telefonoError ? "border-red-400" : "border-slate-200"
                }`}
              />
              {telefonoError ? (
                <p className="text-xs text-red-500 mt-1">{telefonoError}</p>
              ) : (
                <p className="text-xs text-slate-400 mt-1">Ej: 0981 123 456 o +595 981 123 456</p>
              )}
            </div>

            {/* Tercera edad */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                <span className="flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                  ¿Es persona de tercera edad?
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
                <p className="text-xs text-amber-600 mt-1.5">Debe seleccionar una opcion.</p>
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
  // PASO 1: PadronSearch
  // ============================
  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl w-full max-w-xl shadow-modal overflow-hidden flex flex-col max-h-[90vh] animate-fade-in">
        <PadronSearch
          padron={padron}
          padronLoading={padronLoading}
          padronError={padronError}
          onRetry={onRetryPadron}
          disponibles={disponibles}
          onSelect={handleSelectPersona}
          titulo={titulo}
          onClose={onClose}
        />
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
