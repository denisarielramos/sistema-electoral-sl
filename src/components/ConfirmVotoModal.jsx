import React, { useState } from "react";
import { CheckCircle2, AlertTriangle, X } from "lucide-react";

const ConfirmVotoModal = ({ votante, accion, onConfirm, onClose }) => {
  const [isLoading, setIsLoading] = useState(false);

  if (!votante) return null;

  const isUndoing = accion === "anular";

  const handleConfirm = async () => {
    setIsLoading(true);
    try {
      await onConfirm();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !isLoading) onClose(); }}
    >
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-modal overflow-hidden animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className={`p-1.5 rounded-lg ${isUndoing ? "bg-red-100" : "bg-emerald-100"}`}>
              {isUndoing ? (
                <AlertTriangle className="w-4 h-4 text-red-600" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              )}
            </div>
            <h3 className="text-base font-bold text-slate-800">
              {isUndoing ? "Anular Confirmación" : "Confirmar Voto"}
            </h3>
          </div>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors border-0 bg-transparent shadow-none disabled:opacity-40"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5 space-y-3">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
            <p className="text-sm font-semibold text-slate-800 truncate">
              {votante.nombre} {votante.apellido}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">CI: {votante.ci}</p>
          </div>

          <p className="text-sm text-slate-600 leading-relaxed">
            {isUndoing
              ? "¿Está seguro que desea anular la confirmación de voto de esta persona? El registro volverá al estado pendiente."
              : "¿Está seguro que desea confirmar el voto de esta persona? Esta acción quedará registrada en el sistema."}
          </p>
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 flex gap-2">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 h-10 px-4 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors bg-white disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={isLoading}
            className={`flex-1 h-10 px-4 rounded-xl text-white text-sm font-medium transition-colors border-0 shadow-sm disabled:opacity-60 flex items-center justify-center gap-2 ${
              isUndoing ? "bg-red-600 hover:bg-red-700" : "bg-emerald-600 hover:bg-emerald-700"
            }`}
          >
            {isLoading ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Procesando...
              </>
            ) : isUndoing ? "Anular" : "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmVotoModal;
