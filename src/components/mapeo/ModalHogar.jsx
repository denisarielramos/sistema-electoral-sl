// ======================= MODAL: CREAR / EDITAR HOGAR (asignar ubicación) =======================
import React, { useEffect, useMemo, useState } from "react";
import { Home, X, MapPin, Crosshair, Check, UserMinus, Search, MapPinned } from "lucide-react";
import { useGeolocation } from "../../hooks/useGeolocation";
import { esCoordenadaValida, formatearPrecisionGps } from "../../utils/geoHelpers";
import { normalizeCI } from "../../utils/estructuraHelpers";
import { personaCoincideConsulta } from "../../utils/busquedaHelpers";
import LeafletSeleccionarUbicacion from "./LeafletSeleccionarUbicacion";

// votantesDisponibles: ya filtrados por alcance jerárquico (mismos helpers que el
// resto del dashboard) y excluyendo a quienes ya están en un hogar activo distinto.
const ModalHogar = ({
  show,
  onClose,
  onGuardar, // (payload) => Promise
  onAsociarVotante, // (votanteCi) => Promise
  onDesasociarVotante, // (votanteCi) => Promise
  hogarExistente,
  votantePreseleccionado,
  votantesDisponibles = [],
  saving = false,
  onConfirmarVisita, // (hogar) => void — opcional, muestra el botón "Confirmar visita"
  // Lista de votantes asociados recalculada en vivo por el padre a partir de su propio
  // estado (p. ej. tras un asociar/desasociar). Si se omite, se usa hogarExistente.votantes
  // como antes (snapshot tomado al abrir el modal).
  votantesAsociadosOverride,
}) => {
  const [nombreFamilia, setNombreFamilia] = useState("");
  const [direccion, setDireccion] = useState("");
  const [referencia, setReferencia] = useState("");
  const [latitud, setLatitud] = useState(null);
  const [longitud, setLongitud] = useState(null);
  const [precisionGps, setPrecisionGps] = useState(null);
  const [pendienteConfirmarReemplazo, setPendienteConfirmarReemplazo] = useState(null);
  const [busquedaVotante, setBusquedaVotante] = useState("");
  const [error, setError] = useState(null);
  // Hogar recién creado en un intento previo dentro de esta misma apertura del modal
  // (solo aplica cuando hogarExistente venía null, es decir, flujo de creación). Si la
  // asociación del votante preseleccionado falla después de crear el hogar, un reintento
  // de "Guardar" no debe volver a crear otro hogar vacío: reutiliza este y solo repite
  // la asociación fallida.
  const [hogarCreadoLocal, setHogarCreadoLocal] = useState(null);

  const { loading: cargandoUbicacion, error: errorUbicacion, solicitarUbicacion } = useGeolocation();

  useEffect(() => {
    if (!show) return;
    setNombreFamilia(hogarExistente?.nombre_familia || "");
    setDireccion(hogarExistente?.direccion || "");
    setReferencia(hogarExistente?.referencia || "");
    setLatitud(hogarExistente?.latitud ?? null);
    setLongitud(hogarExistente?.longitud ?? null);
    setPrecisionGps(hogarExistente?.precision_gps ?? null);
    setPendienteConfirmarReemplazo(null);
    setBusquedaVotante("");
    setError(null);
    setHogarCreadoLocal(null);
  }, [show, hogarExistente]);

  const votantesAsociados = useMemo(
    () => votantesAsociadosOverride ?? hogarExistente?.votantes ?? [],
    [votantesAsociadosOverride, hogarExistente]
  );

  const resultadosBusqueda = useMemo(() => {
    if (!busquedaVotante.trim()) return [];
    const yaAsociadosCI = new Set(votantesAsociados.map((v) => normalizeCI(v.ci)));
    return votantesDisponibles
      .filter((v) => !yaAsociadosCI.has(normalizeCI(v.ci)))
      .filter((v) => personaCoincideConsulta(v, busquedaVotante))
      .slice(0, 8);
  }, [busquedaVotante, votantesDisponibles, votantesAsociados]);

  if (!show) return null;

  const hayUbicacionPrevia = esCoordenadaValida(hogarExistente?.latitud, hogarExistente?.longitud);

  const aplicarNuevaUbicacion = (lat, lng, precision) => {
    // Si ya había una ubicación válida cargada, pedir confirmación explícita antes
    // de reemplazarla (nunca se pisa en silencio).
    if (hayUbicacionPrevia && esCoordenadaValida(latitud, longitud)) {
      setPendienteConfirmarReemplazo({ lat, lng, precision });
      return;
    }
    setLatitud(lat);
    setLongitud(lng);
    if (precision !== undefined) setPrecisionGps(precision);
  };

  const confirmarReemplazo = () => {
    if (!pendienteConfirmarReemplazo) return;
    setLatitud(pendienteConfirmarReemplazo.lat);
    setLongitud(pendienteConfirmarReemplazo.lng);
    if (pendienteConfirmarReemplazo.precision !== undefined) {
      setPrecisionGps(pendienteConfirmarReemplazo.precision);
    }
    setPendienteConfirmarReemplazo(null);
  };

  const handleUsarGPS = async () => {
    const pos = await solicitarUbicacion({ altaPrecision: true });
    if (pos) aplicarNuevaUbicacion(pos.latitud, pos.longitud, pos.precisionGps);
  };

  const handleGuardar = async () => {
    setError(null);
    if (!esCoordenadaValida(latitud, longitud)) {
      setError("Debe capturar o marcar una ubicación válida en el mapa antes de guardar.");
      return;
    }
    try {
      // Si ya creamos el hogar en un intento anterior de este mismo guardado (falló
      // solo la asociación), no lo volvemos a crear — evita hogares vacíos duplicados
      // en cada reintento.
      let hogar = hogarExistente || hogarCreadoLocal;
      if (!hogar || hogarExistente) {
        hogar = await onGuardar({
          nombreFamilia: nombreFamilia.trim(),
          direccion: direccion.trim(),
          referencia: referencia.trim(),
          latitud,
          longitud,
          precisionGps,
        });
        if (!hogarExistente && hogar?.id) setHogarCreadoLocal(hogar);
      }
      if (votantePreseleccionado && hogar?.id) {
        await onAsociarVotante(hogar.id, normalizeCI(votantePreseleccionado.ci));
      }
      onClose();
    } catch (err) {
      setError(err.message || "Error al guardar el hogar.");
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-start sm:items-center justify-center z-50 p-4 overflow-y-auto"
      onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}
    >
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-modal overflow-hidden animate-fade-in my-6">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-brand-100 rounded-lg">
              <Home className="w-4 h-4 text-brand-600" />
            </div>
            <h3 className="text-base font-bold text-slate-800">
              {hogarExistente ? "Editar hogar" : "Nuevo hogar"}
            </h3>
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
        <div className="px-5 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {hogarExistente && esCoordenadaValida(hogarExistente.latitud, hogarExistente.longitud) && onConfirmarVisita && (
            <button
              type="button"
              onClick={() => onConfirmarVisita(hogarExistente)}
              className="w-full h-10 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium border-0 shadow-sm flex items-center justify-center gap-2"
            >
              <MapPinned className="w-4 h-4" />
              Confirmar visita a este hogar
            </button>
          )}
          {votantePreseleccionado && (
            <div className="bg-brand-50 border border-brand-200 rounded-xl px-3 py-2 text-sm text-brand-800">
              Se asociará a este hogar: <strong>{votantePreseleccionado.nombre} {votantePreseleccionado.apellido}</strong> (CI: {votantePreseleccionado.ci})
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Referencia familiar</label>
            <input
              type="text"
              value={nombreFamilia}
              onChange={(e) => setNombreFamilia(e.target.value)}
              placeholder="Ej: Familia González"
              className="w-full px-4 py-2.5 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent bg-slate-50"
              disabled={saving}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Dirección</label>
            <input
              type="text"
              value={direccion}
              onChange={(e) => setDireccion(e.target.value)}
              placeholder="Calle, número, barrio..."
              className="w-full px-4 py-2.5 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent bg-slate-50"
              disabled={saving}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Referencia adicional</label>
            <textarea
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
              placeholder="Portón verde, casa de dos pisos, al lado del almacén..."
              rows={2}
              className="w-full px-4 py-2.5 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent bg-slate-50 resize-none"
              disabled={saving}
            />
          </div>

          {/* Ubicación */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-medium text-slate-700">Ubicación</label>
              <button
                type="button"
                onClick={handleUsarGPS}
                disabled={cargandoUbicacion || saving}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700 bg-transparent border-0 shadow-none disabled:opacity-50"
              >
                <Crosshair className="w-3.5 h-3.5" />
                {cargandoUbicacion ? "Obteniendo ubicación..." : "Usar mi ubicación actual"}
              </button>
            </div>

            {errorUbicacion && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-2">{errorUbicacion}</p>
            )}

            {pendienteConfirmarReemplazo && (
              <div className="mb-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 space-y-2">
                <p className="text-xs text-amber-800">
                  Ya hay una ubicación cargada para este hogar. ¿Reemplazarla por la nueva? El historial de visitas no se modifica.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={confirmarReemplazo}
                    className="h-7 px-3 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium border-0 shadow-none"
                  >
                    Reemplazar ubicación
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendienteConfirmarReemplazo(null)}
                    className="h-7 px-3 rounded-lg border border-amber-300 text-amber-700 text-xs font-medium bg-transparent shadow-none"
                  >
                    Mantener la actual
                  </button>
                </div>
              </div>
            )}

            <LeafletSeleccionarUbicacion
              latitud={latitud}
              longitud={longitud}
              onChange={(lat, lng) => aplicarNuevaUbicacion(lat, lng, undefined)}
            />

            <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {esCoordenadaValida(latitud, longitud) ? "Ubicación marcada" : "Sin ubicación"}
              </span>
              {precisionGps !== null && precisionGps !== undefined && (
                <span>Precisión GPS: {formatearPrecisionGps(precisionGps)}</span>
              )}
            </div>
          </div>

          {/* Votantes asociados (solo al editar un hogar existente) */}
          {hogarExistente && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Votantes del hogar ({votantesAsociados.length})
              </label>
              <div className="space-y-1.5">
                {votantesAsociados.map((v) => (
                  <div key={v.ci} className="flex items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
                    <span className="text-sm text-slate-700 truncate">{v.nombre} {v.apellido} <span className="text-slate-400">— CI: {v.ci}</span></span>
                    <button
                      type="button"
                      onClick={async () => {
                        setError(null);
                        try {
                          await onDesasociarVotante(hogarExistente.id, normalizeCI(v.ci));
                        } catch (err) {
                          setError(err.message || "Error al quitar el votante del hogar.");
                        }
                      }}
                      disabled={saving}
                      title="Quitar del hogar (no borra al votante)"
                      className="p-1 text-slate-400 hover:text-red-600 bg-transparent border-0 shadow-none disabled:opacity-50"
                    >
                      <UserMinus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                {votantesAsociados.length === 0 && (
                  <p className="text-xs text-slate-400 italic">Sin votantes asociados todavía.</p>
                )}
              </div>

              <div className="mt-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={busquedaVotante}
                    onChange={(e) => setBusquedaVotante(e.target.value)}
                    placeholder="Buscar votante por nombre o CI para agregar..."
                    className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
                    disabled={saving}
                  />
                </div>
                {/* Lista en flujo normal (no absoluta): evita quedar recortada por el
                    scroll interno del modal, a diferencia de un dropdown superpuesto. */}
                {resultadosBusqueda.length > 0 && (
                  <div className="mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-sm max-h-48 overflow-y-auto divide-y divide-slate-100">
                    {resultadosBusqueda.map((v) => (
                      <button
                        key={v.ci}
                        type="button"
                        onClick={async () => {
                          setError(null);
                          try {
                            await onAsociarVotante(hogarExistente.id, normalizeCI(v.ci));
                            setBusquedaVotante("");
                          } catch (err) {
                            setError(err.message || "Error al asociar el votante al hogar.");
                          }
                        }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 border-0 bg-transparent shadow-none flex items-center justify-between"
                      >
                        <span>{v.nombre} {v.apellido} <span className="text-slate-400">— CI: {v.ci}</span></span>
                        <Check className="w-3.5 h-3.5 text-slate-300" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}
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
            onClick={handleGuardar}
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

export default ModalHogar;
