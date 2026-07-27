// ======================= MODAL: CONFIRMAR VISITA =======================
// Flujo: 1) pide ubicación de alta precisión → 2) muestra carga → 3) captura precisión
// GPS → 4) calcula distancia preliminar SOLO para mostrarla → 5) el servidor
// (mapeo_confirmar_visita) valida la distancia definitiva → 6-7) confirmada o
// fuera_de_radio según el servidor → 8) muestra la distancia detectada → 9) si la
// precisión no es aceptable, se pide reintentar → 10) nunca se pueden escribir las
// coordenadas a mano → 11) el botón dispara la captura, no confirma por sí solo →
// 13) el intento se registra igual si queda fuera de radio → 14) fecha/hora las pone
// el servidor (now()), nunca el navegador.
import React, { useState } from "react";
import { MapPinned, X, Crosshair, CheckCircle2, AlertTriangle, RefreshCw } from "lucide-react";
import { useGeolocation } from "../../hooks/useGeolocation";
import {
  haversineDistanceMeters,
  estaDentroDelRadio,
  esPrecisionGpsAceptable,
  formatearDistancia,
  formatearPrecisionGps,
} from "../../utils/geoHelpers";

const ModalConfirmarVisita = ({ show, onClose, hogar, config, configError, onReintentarConfig, onConfirmar }) => {
  const { loading, error: errorGps, posicion, solicitarUbicacion, reset } = useGeolocation();
  const [observacion, setObservacion] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [resultadoServidor, setResultadoServidor] = useState(null);
  const [errorEnvio, setErrorEnvio] = useState(null);

  if (!show || !hogar) return null;

  // Sin config real (radio permitido / precisión GPS máxima) no hay forma de
  // mostrarle al usuario una vista previa confiable de si su ubicación va a
  // quedar dentro de radio o si su precisión GPS alcanza — un default hardcodeado
  // acá podría no coincidir con el valor real del servidor (que sí valida con la
  // configuración real en mapeo_confirmar_visita), mostrando una vista previa
  // engañosa. Se bloquea la confirmación y se ofrece reintentar la carga en vez
  // de asumir silenciosamente 100 m / 50 m.
  if (!config) {
    return (
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div className="bg-white rounded-2xl w-full max-w-sm shadow-modal overflow-hidden animate-fade-in p-5 space-y-3">
          <p className="text-sm font-semibold text-slate-800">No se pudo cargar la configuración del mapeo</p>
          <p className="text-xs text-slate-500">
            No se puede confirmar una visita sin conocer el radio permitido y la precisión GPS máxima configurados.
          </p>
          {configError && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{configError}</p>}
          <div className="flex gap-2 pt-1">
            <button
              onClick={onClose}
              className="flex-1 h-10 px-4 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors bg-white"
            >
              Cerrar
            </button>
            <button
              onClick={onReintentarConfig}
              className="flex-1 h-10 px-4 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium transition-colors border-0 shadow-sm flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Reintentar
            </button>
          </div>
        </div>
      </div>
    );
  }

  const precisionAceptable = posicion
    ? esPrecisionGpsAceptable(posicion.precisionGps, config?.precision_gps_maxima_metros)
    : true;

  const distanciaPreliminar = posicion
    ? haversineDistanceMeters(posicion.latitud, posicion.longitud, hogar.latitud, hogar.longitud)
    : null;

  const dentroDeRadioPreliminar = estaDentroDelRadio(distanciaPreliminar, config?.radio_permitido_metros);

  const handleCapturar = async () => {
    setResultadoServidor(null);
    setErrorEnvio(null);
    await solicitarUbicacion({ altaPrecision: true });
  };

  const handleReintentar = () => {
    reset();
    setResultadoServidor(null);
    setErrorEnvio(null);
  };

  const handleConfirmar = async () => {
    if (!posicion) return;
    setEnviando(true);
    setErrorEnvio(null);
    try {
      const visita = await onConfirmar({
        latitud: posicion.latitud,
        longitud: posicion.longitud,
        precisionGps: posicion.precisionGps,
        observacion: observacion.trim() || null,
      });
      setResultadoServidor(visita);
    } catch (err) {
      setErrorEnvio(err.message || "Error al registrar la visita.");
    } finally {
      setEnviando(false);
    }
  };

  const handleCerrar = () => {
    reset();
    setObservacion("");
    setResultadoServidor(null);
    setErrorEnvio(null);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !enviando) handleCerrar(); }}
    >
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-modal overflow-hidden animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-emerald-100 rounded-lg">
              <MapPinned className="w-4 h-4 text-emerald-600" />
            </div>
            <h3 className="text-base font-bold text-slate-800">Confirmar visita</h3>
          </div>
          <button
            onClick={handleCerrar}
            disabled={enviando}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors border-0 bg-transparent shadow-none disabled:opacity-40"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5 space-y-4">
          <p className="text-sm text-slate-600 font-medium truncate">
            {hogar.nombre_familia || "Hogar"}
            <span className="ml-1.5 text-slate-400 font-normal block truncate">{hogar.direccion}</span>
          </p>

          {resultadoServidor ? (
            <div
              className={`rounded-xl border px-4 py-3.5 space-y-1.5 ${
                resultadoServidor.resultado === "confirmada"
                  ? "bg-emerald-50 border-emerald-200"
                  : resultadoServidor.resultado === "fuera_de_radio"
                  ? "bg-red-50 border-red-200"
                  : "bg-amber-50 border-amber-200"
              }`}
            >
              <p className="flex items-center gap-2 font-semibold text-sm">
                {resultadoServidor.resultado === "confirmada" ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                )}
                {resultadoServidor.resultado === "confirmada" && "Visita confirmada"}
                {resultadoServidor.resultado === "fuera_de_radio" && "Registrada: fuera del radio permitido"}
                {resultadoServidor.resultado === "error_gps" && "Registrada: no se pudo validar el GPS"}
              </p>
              <p className="text-xs text-slate-600">
                Distancia detectada: {formatearDistancia(resultadoServidor.distancia_metros)} — Radio permitido: {resultadoServidor.radio_permitido_usado} m
              </p>
              <p className="text-xs text-slate-500">El intento quedó registrado en la bitácora aunque no haya sido confirmado.</p>
            </div>
          ) : (
            <>
              {!posicion && !loading && (
                <button
                  type="button"
                  onClick={handleCapturar}
                  className="w-full h-11 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold border-0 shadow-sm flex items-center justify-center gap-2"
                >
                  <Crosshair className="w-4 h-4" />
                  Obtener mi ubicación
                </button>
              )}

              {loading && (
                <div className="flex flex-col items-center gap-2 py-4">
                  <span className="w-6 h-6 border-2 border-slate-200 border-t-brand-600 rounded-full animate-spin" />
                  <p className="text-sm text-slate-500">Obteniendo ubicación de alta precisión...</p>
                </div>
              )}

              {errorGps && !loading && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 space-y-2">
                  <p className="text-xs text-red-700">{errorGps}</p>
                  <button
                    type="button"
                    onClick={handleCapturar}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 bg-transparent border-0 shadow-none"
                  >
                    <RefreshCw className="w-3 h-3" /> Reintentar
                  </button>
                </div>
              )}

              {posicion && !precisionAceptable && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 space-y-2">
                  <p className="text-xs text-amber-800">
                    Precisión GPS insuficiente ({formatearPrecisionGps(posicion.precisionGps)}). Muévase a un lugar más despejado e intente de nuevo.
                  </p>
                  <button
                    type="button"
                    onClick={handleReintentar}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-transparent border-0 shadow-none"
                  >
                    <RefreshCw className="w-3 h-3" /> Reintentar
                  </button>
                </div>
              )}

              {posicion && precisionAceptable && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-3 space-y-1.5">
                  <p className="text-xs text-slate-500">
                    Precisión GPS: <span className="text-slate-700 font-medium">{formatearPrecisionGps(posicion.precisionGps)}</span>
                  </p>
                  <p className="text-xs text-slate-500">
                    Distancia estimada al hogar: <span className="text-slate-700 font-medium">{formatearDistancia(distanciaPreliminar)}</span>
                  </p>
                  <p className={`text-xs font-medium ${dentroDeRadioPreliminar ? "text-emerald-600" : "text-amber-600"}`}>
                    {dentroDeRadioPreliminar ? "Dentro del radio permitido (estimado)" : "Fuera del radio permitido (estimado)"}
                  </p>
                  <p className="text-[11px] text-slate-400">El resultado definitivo lo valida el servidor al confirmar.</p>
                </div>
              )}

              {posicion && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Observación (opcional)</label>
                  <textarea
                    value={observacion}
                    onChange={(e) => setObservacion(e.target.value)}
                    rows={2}
                    placeholder="No atendieron, portón cerrado, casa en construcción..."
                    className="w-full px-4 py-2.5 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent bg-slate-50 resize-none"
                    disabled={enviando}
                  />
                </div>
              )}

              {errorEnvio && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{errorEnvio}</p>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 flex gap-2">
          <button
            onClick={handleCerrar}
            disabled={enviando}
            className="flex-1 h-10 px-4 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors bg-white disabled:opacity-50"
          >
            {resultadoServidor ? "Cerrar" : "Cancelar"}
          </button>
          {!resultadoServidor && (
            <button
              onClick={handleConfirmar}
              disabled={!posicion || !precisionAceptable || enviando}
              className="flex-1 h-10 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition-colors border-0 shadow-sm disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {enviando ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Registrando...
                </>
              ) : "Confirmar visita"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ModalConfirmarVisita;
