// ======================= PANEL DE DETALLE: HOGAR SELECCIONADO =======================
import React, { useEffect, useState } from "react";
import { X, Phone, MapPin, ExternalLink, Navigation, Edit3, CheckCircle2, XCircle, MapPinned, Trash2 } from "lucide-react";
import EstadoMapaBadge from "./EstadoMapaBadge";
import { getEstadoMapaHogar, buildGoogleMapsUrl, buildWazeUrl, formatearDistancia, ESTADOS_MAPA } from "../../utils/geoHelpers";
import { getJerarquiaHogar, ROL_INTEGRANTE_LABEL } from "../../utils/mapeoHelpers";

const PUEDE_VERIFICAR = ["superadmin", "dirigente"];

const HogarDetallePanel = ({
  hogar,
  estructura,
  currentUser,
  onClose,
  onEditar,
  onVerificar, // (hogar, aprobar) => void
  onConfirmarVisita, // (hogar) => void
  onEliminarHogar, // (hogar) => Promise — solo superadmin (ver botón "Eliminar mapeo")
}) => {
  const [confirmandoEliminar, setConfirmandoEliminar] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [errorEliminar, setErrorEliminar] = useState(null);

  // El panel es un único componente controlado por `hogar` (no se desmonta al pasar
  // de un hogar a otro) — sin esto, la confirmación de eliminar quedaría abierta al
  // seleccionar un hogar distinto.
  useEffect(() => {
    setConfirmandoEliminar(false);
    setEliminando(false);
    setErrorEliminar(null);
  }, [hogar?.id]);

  if (!hogar) return null;

  const estado = getEstadoMapaHogar(hogar);
  const jerarquia = getJerarquiaHogar(hogar, estructura);
  const gmapsUrl = buildGoogleMapsUrl(hogar.latitud, hogar.longitud);
  const wazeUrl = buildWazeUrl(hogar.latitud, hogar.longitud);
  const puedeVerificar = PUEDE_VERIFICAR.includes(currentUser?.role);
  const esSuperadmin = currentUser?.role === "superadmin";

  const handleEliminar = async () => {
    setEliminando(true);
    setErrorEliminar(null);
    try {
      await onEliminarHogar(hogar);
    } catch (err) {
      setErrorEliminar(err.message || "Error al eliminar el mapeo del hogar.");
      setEliminando(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-[2000] p-0 sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-modal overflow-hidden animate-fade-in max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50 shrink-0">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-slate-800 truncate">{hogar.nombre_familia || "Hogar sin nombre"}</h3>
            <div className="mt-1"><EstadoMapaBadge estado={estado} /></div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors border-0 bg-transparent shadow-none shrink-0"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4 overflow-y-auto">
          <div className="space-y-1">
            <p className="text-sm text-slate-700 flex items-start gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
              {hogar.direccion || "Sin dirección"}
            </p>
            {hogar.referencia && <p className="text-xs text-slate-500 pl-5">{hogar.referencia}</p>}
          </div>

          {(gmapsUrl || wazeUrl) && (
            <div className="flex gap-2">
              {gmapsUrl && (
                <a
                  href={gmapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 bg-white shadow-none"
                >
                  <Navigation className="w-3.5 h-3.5" /> Google Maps
                </a>
              )}
              {wazeUrl && (
                <a
                  href={wazeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 bg-white shadow-none"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Waze
                </a>
              )}
            </div>
          )}

          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
              Integrantes ({(hogar.votantes || []).length})
            </p>
            <div className="space-y-1.5">
              {(hogar.votantes || []).map((v) => (
                <div key={v.ci} className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-sm">
                  <p className="text-slate-700 font-medium flex items-center gap-1.5 flex-wrap">
                    {v.nombre} {v.apellido}
                    {v.rol && <span className="text-[10px] font-medium uppercase tracking-wide text-brand-600 bg-brand-50 border border-brand-200 rounded px-1 py-0.5">{ROL_INTEGRANTE_LABEL[v.rol] || v.rol}</span>}
                  </p>
                  <p className="text-xs text-slate-500 flex items-center gap-1">
                    CI: {v.ci}
                    {v.telefono && (
                      <span className="inline-flex items-center gap-0.5 ml-2">
                        <Phone className="w-3 h-3" /> {v.telefono}
                      </span>
                    )}
                  </p>
                </div>
              ))}
              {(hogar.votantes || []).length === 0 && (
                <p className="text-xs text-slate-400 italic">Sin integrantes asociados.</p>
              )}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Jerarquía responsable</p>
            <p className="text-sm text-slate-600">
              {[
                jerarquia.dirigente && `Dirigente: ${jerarquia.dirigente.nombre} ${jerarquia.dirigente.apellido || ""}`.trim(),
                jerarquia.coordinador && `Coordinador: ${jerarquia.coordinador.nombre} ${jerarquia.coordinador.apellido || ""}`.trim(),
                jerarquia.subcoordinador && `Subcoordinador: ${jerarquia.subcoordinador.nombre} ${jerarquia.subcoordinador.apellido || ""}`.trim(),
              ].filter(Boolean).join(" · ") || "Sin datos"}
            </p>
          </div>

          {hogar.ultima_visita && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Última visita</p>
              <p className="text-sm text-slate-600">
                {new Date(hogar.ultima_visita.fecha_hora).toLocaleString("es-PY")} — {formatearDistancia(hogar.ultima_visita.distancia_metros)}
              </p>
            </div>
          )}
        </div>

        {/* Footer: acciones */}
        <div className="px-5 pb-5 pt-3 border-t border-slate-100 space-y-2 shrink-0">
          <div className="flex gap-2">
            <button
              onClick={() => onEditar(hogar)}
              className="flex-1 h-10 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 bg-white flex items-center justify-center gap-1.5"
            >
              <Edit3 className="w-3.5 h-3.5" /> Editar
            </button>
            <button
              onClick={() => onConfirmarVisita(hogar)}
              disabled={estado === ESTADOS_MAPA.SIN_UBICACION || estado === ESTADOS_MAPA.RECHAZADO}
              title={estado === ESTADOS_MAPA.RECHAZADO ? "Ubicación rechazada: corríjala y vuelva a verificarla antes de confirmar una visita." : undefined}
              className="flex-1 h-10 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium border-0 shadow-sm flex items-center justify-center gap-1.5"
            >
              <MapPinned className="w-3.5 h-3.5" /> Confirmar visita
            </button>
          </div>
          {puedeVerificar && hogar.estado === "pendiente" && (
            <div className="flex gap-2">
              <button
                onClick={() => onVerificar(hogar, true)}
                className="flex-1 h-9 rounded-xl border border-emerald-200 text-emerald-700 text-xs font-medium hover:bg-emerald-50 bg-white flex items-center justify-center gap-1.5"
              >
                <CheckCircle2 className="w-3.5 h-3.5" /> Verificar ubicación
              </button>
              <button
                onClick={() => onVerificar(hogar, false)}
                className="flex-1 h-9 rounded-xl border border-red-200 text-red-700 text-xs font-medium hover:bg-red-50 bg-white flex items-center justify-center gap-1.5"
              >
                <XCircle className="w-3.5 h-3.5" /> Rechazar
              </button>
            </div>
          )}

          {esSuperadmin && !confirmandoEliminar && (
            <button
              onClick={() => setConfirmandoEliminar(true)}
              className="w-full h-9 rounded-xl border border-red-200 text-red-600 text-xs font-medium hover:bg-red-50 bg-white flex items-center justify-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" /> Eliminar mapeo
            </button>
          )}

          {esSuperadmin && confirmandoEliminar && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-2">
              <p className="text-xs text-red-800">
                ¿Estás seguro de que querés eliminar el mapeo del hogar{" "}
                <strong>{hogar.nombre_familia || "sin nombre"}</strong>? El hogar
                desaparecerá del mapa y sus integrantes quedarán disponibles para otro
                hogar. La bitácora de visitas se conservará.
              </p>
              {errorEliminar && (
                <p className="text-xs text-red-700 bg-red-100 border border-red-200 rounded-lg px-2 py-1.5">
                  {errorEliminar}
                </p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmandoEliminar(false)}
                  disabled={eliminando}
                  className="flex-1 h-9 rounded-xl border border-slate-200 text-slate-700 text-xs font-medium hover:bg-slate-50 bg-white disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleEliminar}
                  disabled={eliminando}
                  className="flex-1 h-9 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-medium border-0 shadow-sm flex items-center justify-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" /> {eliminando ? "Eliminando…" : "Eliminar mapeo"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default HogarDetallePanel;
