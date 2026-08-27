import React, { useState, useEffect } from "react";
import { AlertCircle, X } from "lucide-react";

// Exclusivo superadmin (ver PersonCard/Dashboard.jsx: el botón que abre este modal
// solo se renderiza cuando esSuperadmin && tipo === "votante"). Guarda un único
// campo (tercera_edad), igual que ModalTelefono/ModalDireccion — nunca toca
// teléfono, dirección ni ningún otro dato del votante.
const ModalTerceraEdad = ({ persona, onSave, onClose }) => {
  const [valor, setValor] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (persona) {
      setValor(persona.tercera_edad === true);
    }
  }, [persona]);

  if (!persona) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(valor);
    } catch {
      // onSave lanza si hay error — el modal permanece abierto
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}
    >
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-modal overflow-hidden animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-amber-100 rounded-lg">
              <AlertCircle className="w-4 h-4 text-amber-600" />
            </div>
            <h3 className="text-base font-bold text-slate-800">Tercera edad</h3>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors border-0 bg-transparent shadow-none disabled:opacity-40"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5 space-y-4">
          <p className="text-sm text-slate-600 font-medium truncate">
            {persona.nombre} {persona.apellido}
            <span className="ml-1.5 text-slate-400 font-normal">— CI: {persona.ci}</span>
          </p>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              ¿Es persona de tercera edad?
            </label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setValor(true)}
                disabled={saving}
                className={`flex-1 h-10 rounded-xl text-sm font-medium border transition-colors disabled:opacity-50 ${
                  valor === true
                    ? "bg-amber-500 border-amber-500 text-white"
                    : "bg-white border-slate-200 text-slate-700 hover:border-amber-300 hover:bg-amber-50"
                }`}
              >
                Si
              </button>
              <button
                type="button"
                onClick={() => setValor(false)}
                disabled={saving}
                className={`flex-1 h-10 rounded-xl text-sm font-medium border transition-colors disabled:opacity-50 ${
                  valor === false
                    ? "bg-slate-600 border-slate-600 text-white"
                    : "bg-white border-slate-200 text-slate-700 hover:border-slate-400 hover:bg-slate-50"
                }`}
              >
                No
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 flex gap-2">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 h-10 px-4 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors bg-white disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 h-10 px-4 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium transition-colors border-0 shadow-sm disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Guardando...
              </>
            ) : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ModalTerceraEdad;
