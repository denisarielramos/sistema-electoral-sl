// ======================= ACCESO RÁPIDO: ASIGNAR UBICACIÓN DESDE LA TARJETA DE VOTANTE =======================
// Punto de entrada liviano usado desde PersonCard (botón "Asignar ubicación" en
// tarjetas de votante). No precarga hogares al montar el dashboard — solo consulta
// cuando el usuario efectivamente abre el flujo (evita llamar al RPC mapeo_* en cada
// carga del dashboard para todo el mundo mientras la migración no esté aplicada).
import React, { useEffect, useState } from "react";
import { normalizeCI } from "../../utils/estructuraHelpers";
import { crearHogar, actualizarHogar, asociarVotanteAHogar, desasociarVotanteDeHogar, listarHogares, confirmarVisita } from "../../services/mapeoService";
import { useMapeoConfiguracion } from "../../hooks/useMapeoConfiguracion";
import ModalHogar from "./ModalHogar";
import ModalConfirmarVisita from "./ModalConfirmarVisita";

// votante: null cuando está cerrado; objeto persona cuando se pidió abrir el flujo.
const AccesoRapidoHogar = ({ currentUser, votante, votantesDisponibles, onClose }) => {
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);
  const [hogarExistente, setHogarExistente] = useState(null);
  const [saving, setSaving] = useState(false);
  const [modalVisitaHogar, setModalVisitaHogar] = useState(null);
  const { config } = useMapeoConfiguracion();

  useEffect(() => {
    if (!votante) {
      setHogarExistente(null);
      setError(null);
      return;
    }
    let cancelado = false;
    setCargando(true);
    setError(null);
    listarHogares(currentUser)
      .then((hogares) => {
        if (cancelado) return;
        const ci = normalizeCI(votante.ci);
        const existente = hogares.find((h) => (h.votantes || []).some((v) => normalizeCI(v.ci) === ci));
        setHogarExistente(existente || null);
      })
      .catch((err) => {
        if (!cancelado) setError(err.message || "No se pudo verificar si el votante ya tiene un hogar asignado.");
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });
    return () => { cancelado = true; };
  }, [votante, currentUser]);

  if (!votante) return null;

  if (cargando) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl px-6 py-5 shadow-modal flex items-center gap-3">
          <span className="w-5 h-5 border-2 border-slate-200 border-t-brand-600 rounded-full animate-spin" />
          <p className="text-sm text-slate-600">Verificando hogar del votante...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div className="bg-white rounded-2xl px-6 py-5 shadow-modal max-w-sm space-y-3">
          <p className="text-sm text-red-600">{error}</p>
          <button
            onClick={onClose}
            className="w-full h-9 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 bg-white"
          >
            Cerrar
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <ModalHogar
        show
        onClose={onClose}
        saving={saving}
        hogarExistente={hogarExistente}
        votantePreseleccionado={hogarExistente ? null : votante}
        votantesDisponibles={votantesDisponibles}
        onGuardar={async (payload) => {
          setSaving(true);
          try {
            if (hogarExistente) {
              return await actualizarHogar(currentUser, hogarExistente.id, payload);
            }
            return await crearHogar(currentUser, payload);
          } finally {
            setSaving(false);
          }
        }}
        onAsociarVotante={async (hogarId, votanteCi) => {
          await asociarVotanteAHogar(currentUser, hogarId, votanteCi);
        }}
        onDesasociarVotante={async (hogarId, votanteCi) => {
          await desasociarVotanteDeHogar(currentUser, hogarId, votanteCi);
        }}
        onConfirmarVisita={(hogar) => setModalVisitaHogar(hogar)}
      />
      <ModalConfirmarVisita
        show={!!modalVisitaHogar}
        hogar={modalVisitaHogar}
        config={config}
        onClose={() => setModalVisitaHogar(null)}
        onConfirmar={(payload) => confirmarVisita(currentUser, modalVisitaHogar.id, payload)}
      />
    </>
  );
};

export default AccesoRapidoHogar;
