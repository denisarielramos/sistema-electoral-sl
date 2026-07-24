import React, { useState, useEffect } from "react";
import { X, UserPlus, ChevronLeft, Check, Shield } from "lucide-react";
import PadronSearch from "./PadronSearch";

// ======================= MODAL AGREGAR COORDINADOR =======================
// Flujo superadmin (2 pasos):
//   Paso 1: Seleccionar dirigente al que pertenecerá el coordinador.
//   Paso 2: PadronSearch para seleccionar la persona coordinadora.
//
// Flujo dirigente (1 paso):
//   Paso 1 omitido — el dirigente ya está determinado (currentUser).
//   Paso 2: PadronSearch directamente.
//
// Props:
//   show          - boolean
//   onClose       - fn
//   onAdd         - fn({ persona, dirigenteCI }) — llamado al confirmar
//   disponibles   - array personas padrón enriquecido
//   dirigentes    - array de dirigentes (solo para superadmin)
//   rolActual     - "superadmin" | "dirigente"
//   dirigenteCI   - string, solo para rol "dirigente" (auto-asignado)

const ModalAgregarCoordinador = ({
  show,
  onClose,
  onAdd,
  disponibles = [],
  dirigentes = [],
  rolActual,
  dirigenteCI,
}) => {
  // Paso actual: "seleccionar-dirigente" | "buscar-persona"
  const [paso, setPaso] = useState(
    rolActual === "dirigente" ? "buscar-persona" : "seleccionar-dirigente"
  );
  const [dirigenteSeleccionado, setDirigenteSeleccionado] = useState(
    rolActual === "dirigente" ? dirigenteCI : null
  );
  const [saving, setSaving] = useState(false);
  const [confirmada, setConfirmada] = useState(null); // persona confirmada al final

  useEffect(() => {
    if (!show) {
      // Reset al cerrar
      const pasoInicial =
        rolActual === "dirigente" ? "buscar-persona" : "seleccionar-dirigente";
      setPaso(pasoInicial);
      setDirigenteSeleccionado(
        rolActual === "dirigente" ? dirigenteCI : null
      );
      setSaving(false);
      setConfirmada(null);
    }
  }, [show, rolActual, dirigenteCI]);

  if (!show) return null;

  const dirigenteObj = dirigentes.find(
    (d) => String(d.ci).replace(/\D/g, "") === String(dirigenteSeleccionado || "").replace(/\D/g, "")
  );

  const handleSelectDirigente = (dir) => {
    setDirigenteSeleccionado(String(dir.ci).replace(/\D/g, ""));
    setPaso("buscar-persona");
  };

  const handleSelectPersona = async (persona) => {
    if (saving) return;
    setSaving(true);
    await onAdd({ persona, dirigenteCI: dirigenteSeleccionado });
    setSaving(false);
    setConfirmada(persona);
  };

  // --- Vista: éxito ---
  if (confirmada) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl w-full max-w-sm shadow-modal p-6 flex flex-col gap-4 animate-fade-in">
          <div className="text-center">
            <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <Check className="w-6 h-6 text-emerald-600" />
            </div>
            <h3 className="text-base font-bold text-slate-800">Coordinador agregado</h3>
            <p className="text-sm text-slate-600 mt-1">
              {(confirmada.nombre || "").toUpperCase()}{" "}
              {(confirmada.apellido || "").toUpperCase()}
            </p>
            {rolActual === "superadmin" && dirigenteObj && (
              <p className="text-xs text-slate-400 mt-1">
                Asignado al dirigente: {dirigenteObj.nombre} {dirigenteObj.apellido || ""}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-full h-10 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm font-semibold border-0 transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    );
  }

  // --- Paso 1: Seleccionar dirigente (solo superadmin) ---
  if (paso === "seleccionar-dirigente") {
    return (
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-4"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div className="bg-white rounded-2xl w-full max-w-sm shadow-modal overflow-hidden animate-fade-in">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 bg-brand-100 rounded-lg">
                <UserPlus className="w-4 h-4 text-brand-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800">Agregar Coordinador</h3>
                <p className="text-xs text-slate-500">Paso 1 de 2 — Seleccionar dirigente</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg border-0 bg-transparent shadow-none"
              aria-label="Cerrar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Lista de dirigentes */}
          <div className="p-5 space-y-2 max-h-96 overflow-y-auto">
            {dirigentes.length === 0 ? (
              <div className="text-center py-8">
                <Shield className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                <p className="text-sm text-slate-400">
                  No hay dirigentes registrados. Primero agregue un dirigente.
                </p>
              </div>
            ) : (
              <>
                <p className="text-xs text-slate-500 mb-3">
                  Seleccione el dirigente al que pertenecera este coordinador:
                </p>
                {dirigentes.map((dir) => (
                  <button
                    key={String(dir.ci)}
                    onClick={() => handleSelectDirigente(dir)}
                    className="w-full flex items-center gap-3 p-3 border border-slate-200 rounded-xl hover:border-brand-300 hover:bg-brand-50 transition-colors text-left bg-white"
                  >
                    <div className="p-1.5 bg-brand-100 rounded-lg shrink-0">
                      <Shield className="w-3.5 h-3.5 text-brand-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-slate-800 truncate">
                        {dir.nombre} {dir.apellido || ""}
                      </p>
                      <p className="text-xs text-slate-500">CI: {dir.ci}</p>
                    </div>
                  </button>
                ))}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t border-slate-100">
            <button
              onClick={onClose}
              className="w-full h-10 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-medium border-0 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- Paso 2: Buscar persona (PadronSearch) ---
  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl w-full max-w-xl shadow-modal overflow-hidden flex flex-col max-h-[90vh] animate-fade-in">

        {/* Indicador de dirigente seleccionado (solo superadmin) */}
        {rolActual === "superadmin" && dirigenteObj && (
          <div className="px-5 py-2.5 bg-brand-50 border-b border-brand-100 flex items-center gap-2 shrink-0">
            <button
              onClick={() => setPaso("seleccionar-dirigente")}
              className="p-1 text-brand-400 hover:text-brand-600 border-0 bg-transparent shadow-none"
              aria-label="Cambiar dirigente"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <Shield className="w-3.5 h-3.5 text-brand-500 shrink-0" />
            <p className="text-xs text-brand-700 font-medium truncate">
              Dirigente: {dirigenteObj.nombre} {dirigenteObj.apellido || ""}
            </p>
            <span className="text-xs text-brand-400 ml-auto shrink-0">Paso 2 de 2</span>
          </div>
        )}

        <PadronSearch
          disponibles={disponibles}
          onSelect={handleSelectPersona}
          titulo="Agregar Coordinador"
          placeholder="Buscar coordinador por CI, nombre o apellido..."
          onBack={rolActual === "superadmin" ? () => setPaso("seleccionar-dirigente") : undefined}
          onClose={onClose}
        />

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-100 shrink-0">
          <button
            onClick={onClose}
            className="w-full h-10 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-medium border-0 transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};

export default ModalAgregarCoordinador;
