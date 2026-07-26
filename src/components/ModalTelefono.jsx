import React, { useState, useEffect } from "react";
import { Phone, X } from "lucide-react";
import {
  sanitizeParaguayPhoneInput,
  validateParaguayPhone,
  normalizeParaguayMobile,
} from "../utils/phoneValidation";

const ModalTelefono = ({ tipo, persona, onSave, onClose }) => {
  const [telefono, setTelefono] = useState("");
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  // Inicializar con el teléfono actual de la persona cada vez que se abre
  useEffect(() => {
    if (persona) {
      // Mostrar en formato visual si es válido, si no mostrar tal cual
      const raw = persona.telefono || "";
      const normalized = normalizeParaguayMobile(raw);
      if (normalized) {
        // Formatear: +595 9XX XXX XXX
        const local = normalized.slice(4);
        setTelefono(`+595 ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`);
      } else {
        setTelefono(raw || "+595");
      }
      setError(null);
    }
  }, [persona]);

  if (!persona) return null;

  const handleChange = (e) => {
    const sanitized = sanitizeParaguayPhoneInput(e.target.value);
    setTelefono(sanitized);
    setError(null);
  };

  const handleSave = async () => {
    const result = validateParaguayPhone(telefono);
    if (!result.valid) {
      setError(result.error);
      return;
    }
    setSaving(true);
    try {
      await onSave(result.normalized); // siempre guarda normalizado: +595981123456
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
            <div className="p-1.5 bg-emerald-100 rounded-lg">
              <Phone className="w-4 h-4 text-emerald-600" />
            </div>
            <h3 className="text-base font-bold text-slate-800">Editar teléfono</h3>
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
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Número de celular
            </label>
            <input
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              maxLength={16}
              value={telefono}
              onChange={handleChange}
              className={`w-full px-4 py-2.5 text-sm border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent bg-slate-50 ${
                error ? "border-red-400" : "border-slate-300"
              }`}
              placeholder="+595 9XX XXX XXX"
              autoFocus
              disabled={saving}
            />
            {error ? (
              <p className="text-xs text-red-500 mt-1">{error}</p>
            ) : (
              <p className="text-xs text-slate-400 mt-1">Ej: 0981 123 456 o +595 981 123 456</p>
            )}
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

export default ModalTelefono;
