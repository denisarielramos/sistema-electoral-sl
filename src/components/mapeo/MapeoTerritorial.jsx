// ======================= MÓDULO: MAPEO TERRITORIAL =======================
// Visible para superadmin, dirigente y coordinador (subcoordinador no accede al
// panel general — solo puede cargar ubicación/registrar visitas desde la tarjeta de
// sus propios votantes, ver AccesoRapidoHogar). Nunca descarga el padrón completo:
// consulta hogares vía mapeo_listar_hogares, que ya devuelve solo lo permitido por
// el alcance jerárquico del actor (resuelto del lado del servidor).
import React, { useEffect, useMemo, useState } from "react";
import { Home, Search, Plus, RefreshCw, ArrowLeft } from "lucide-react";
import { useHogares } from "../../hooks/useHogares";
import { useMapeoConfiguracion } from "../../hooks/useMapeoConfiguracion";
import { normalizeCI } from "../../utils/estructuraHelpers";
import { filtrarHogares, calcularEstadisticasMapeo, getJerarquiaHogar, votantesDelRolEnMapeo, construirVotantesEnHogarActivo } from "../../utils/mapeoHelpers";
import { ESTADOS_MAPA, ESTADO_MAPA_LABEL, getEstadoMapaHogar } from "../../utils/geoHelpers";
import { confirmarVisita as confirmarVisitaService } from "../../services/mapeoService";
import MapeoStatsCards from "./MapeoStatsCards";
import LeafletMapaHogares from "./LeafletMapaHogares";
import HogarDetallePanel from "./HogarDetallePanel";
import ModalHogar from "./ModalHogar";
import ModalConfirmarVisita from "./ModalConfirmarVisita";
import EstadoMapaBadge from "./EstadoMapaBadge";

const MapeoTerritorial = ({ currentUser, estructura, onVolver }) => {
  const { hogares, loading, error, recargar, crear, actualizar, verificar, asociarVotante, desasociarVotante } = useHogares(currentUser);
  const { config, error: configError, recargar: recargarConfig } = useMapeoConfiguracion();

  const [query, setQuery] = useState("");
  const [filtroDirigente, setFiltroDirigente] = useState("");
  const [filtroCoordinador, setFiltroCoordinador] = useState("");
  const [filtroSubcoordinador, setFiltroSubcoordinador] = useState("");
  const [filtroEstadoMapeo, setFiltroEstadoMapeo] = useState("");
  const [filtroEstadoVisita, setFiltroEstadoVisita] = useState("");

  const [hogarSeleccionado, setHogarSeleccionado] = useState(null);
  const [modalHogar, setModalHogar] = useState(null); // { hogarExistente } | null
  const [modalVisitaHogar, setModalVisitaHogar] = useState(null);
  const [saving, setSaving] = useState(false);
  const [accionError, setAccionError] = useState(null);

  const hogaresFiltrados = useMemo(
    () =>
      filtrarHogares(
        hogares,
        {
          query,
          dirigenteCI: filtroDirigente,
          coordinadorCI: filtroCoordinador,
          subcoordinadorCI: filtroSubcoordinador,
          estadoMapeo: filtroEstadoMapeo,
          estadoVisita: filtroEstadoVisita,
        },
        estructura
      ),
    [hogares, query, filtroDirigente, filtroCoordinador, filtroSubcoordinador, filtroEstadoMapeo, filtroEstadoVisita, estructura]
  );

  const estadisticas = useMemo(() => calcularEstadisticasMapeo(hogaresFiltrados), [hogaresFiltrados]);

  const votantesEnHogarCI = useMemo(
    () => construirVotantesEnHogarActivo(hogares, modalHogar?.hogarExistente?.id),
    [hogares, modalHogar]
  );

  // Miembros actuales del hogar en edición, recalculados desde el estado vivo de
  // `hogares` (no del snapshot congelado en modalHogar.hogarExistente) — así el modal
  // refleja de inmediato cada asociar/desasociar sin necesidad de cerrarlo y reabrirlo.
  // Si el hogar ya no aparece en `hogares` tras una recarga completa, salió del
  // alcance del actor (p. ej. se quitó su último votante activo): se trata como
  // vacío en vez de volver al snapshot congelado de cuando se abrió el modal, que
  // seguiría mostrando votantes ya desasociados — el efecto de abajo cierra el
  // modal en ese caso.
  const votantesAsociadosEnVivo = useMemo(() => {
    const id = modalHogar?.hogarExistente?.id;
    if (!id) return undefined;
    return hogares.find((h) => h.id === id)?.votantes ?? [];
  }, [hogares, modalHogar]);

  // El hogar en edición dejó de estar en el alcance del actor: mantener el modal
  // abierto ofrecería acciones (asociar/desasociar/confirmar visita) contra un
  // hogar que el RPC ya rechazaría, fallando detrás de un modal que aparenta
  // seguir siendo válido. Se cierra apenas se detecta, tras una recarga completa.
  useEffect(() => {
    const id = modalHogar?.hogarExistente?.id;
    if (!id || loading) return;
    if (!hogares.some((h) => h.id === id)) {
      setModalHogar(null);
    }
  }, [hogares, loading, modalHogar]);

  const votantesDisponibles = useMemo(() => {
    const propios = votantesDelRolEnMapeo(estructura, currentUser);
    return propios.filter((v) => !votantesEnHogarCI.has(normalizeCI(v.ci)));
  }, [estructura, currentUser, votantesEnHogarCI]);

  const limpiarFiltros = () => {
    setQuery("");
    setFiltroDirigente("");
    setFiltroCoordinador("");
    setFiltroSubcoordinador("");
    setFiltroEstadoMapeo("");
    setFiltroEstadoVisita("");
  };

  const handleGuardarHogar = async (payload) => {
    setSaving(true);
    setAccionError(null);
    try {
      if (modalHogar?.hogarExistente) {
        return await actualizar(modalHogar.hogarExistente.id, payload);
      }
      return await crear(payload);
    } catch (err) {
      setAccionError(err.message);
      throw err;
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        {onVolver && (
          <button
            onClick={onVolver}
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 bg-transparent border-0 shadow-none px-0"
          >
            <ArrowLeft className="w-4 h-4" /> Volver
          </button>
        )}
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-brand-100 rounded-lg"><Home className="w-4 h-4 text-brand-600" /></div>
          <div>
            <h2 className="text-lg font-bold text-slate-800">Mapeo territorial</h2>
            <p className="text-xs text-slate-500">
              {config
                ? `Radio permitido: ${config.radio_permitido_metros} m — Precisión GPS máx.: ${config.precision_gps_maxima_metros} m`
                : "Cargando configuración de mapeo..."}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={recargar}
            className="inline-flex items-center gap-1.5 px-3 h-9 border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 rounded-lg text-sm font-medium transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Actualizar
          </button>
          <button
            onClick={() => setModalHogar({ hogarExistente: null })}
            className="inline-flex items-center gap-1.5 px-4 h-9 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-medium border-0 transition-colors"
          >
            <Plus className="w-4 h-4" /> Nuevo hogar
          </button>
        </div>
      </div>

      <MapeoStatsCards estadisticas={estadisticas} />

      {/* Búsqueda y filtros */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-card space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nombre, apellido, CI, teléfono, dirección o referencia..."
            className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 bg-slate-50"
          />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {currentUser.role === "superadmin" && (
            <select value={filtroDirigente} onChange={(e) => setFiltroDirigente(e.target.value)} className="text-sm border border-slate-200 rounded-lg px-2.5 py-2 bg-white">
              <option value="">Todos los dirigentes</option>
              {(estructura.dirigentes || []).map((d) => (
                <option key={normalizeCI(d.ci)} value={normalizeCI(d.ci)}>{d.nombre} {d.apellido}</option>
              ))}
            </select>
          )}
          {(currentUser.role === "superadmin" || currentUser.role === "dirigente") && (
            <select value={filtroCoordinador} onChange={(e) => setFiltroCoordinador(e.target.value)} className="text-sm border border-slate-200 rounded-lg px-2.5 py-2 bg-white">
              <option value="">Todos los coordinadores</option>
              {(estructura.coordinadores || []).map((c) => (
                <option key={normalizeCI(c.ci)} value={normalizeCI(c.ci)}>{c.nombre} {c.apellido}</option>
              ))}
            </select>
          )}
          <select value={filtroSubcoordinador} onChange={(e) => setFiltroSubcoordinador(e.target.value)} className="text-sm border border-slate-200 rounded-lg px-2.5 py-2 bg-white">
            <option value="">Todos los subcoordinadores</option>
            {(estructura.subcoordinadores || []).map((s) => (
              <option key={normalizeCI(s.ci)} value={normalizeCI(s.ci)}>{s.nombre} {s.apellido}</option>
            ))}
          </select>
          <select value={filtroEstadoMapeo} onChange={(e) => setFiltroEstadoMapeo(e.target.value)} className="text-sm border border-slate-200 rounded-lg px-2.5 py-2 bg-white">
            <option value="">Todos los estados de mapeo</option>
            <option value="pendiente">Pendiente de verificar</option>
            <option value="verificado">Verificado</option>
            <option value="rechazado">Rechazado</option>
          </select>
          <select value={filtroEstadoVisita} onChange={(e) => setFiltroEstadoVisita(e.target.value)} className="text-sm border border-slate-200 rounded-lg px-2.5 py-2 bg-white">
            <option value="">Todos los estados de visita</option>
            {Object.values(ESTADOS_MAPA).map((v) => (
              <option key={v} value={v}>{ESTADO_MAPA_LABEL[v]}</option>
            ))}
          </select>
        </div>
        {(query || filtroDirigente || filtroCoordinador || filtroSubcoordinador || filtroEstadoMapeo || filtroEstadoVisita) && (
          <button onClick={limpiarFiltros} className="text-xs text-brand-600 hover:underline bg-transparent border-0 shadow-none px-0">
            Limpiar filtros
          </button>
        )}
      </div>

      {accionError && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{accionError}</p>
      )}

      {/* Estados de carga/error/vacío */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <span className="w-6 h-6 border-2 border-slate-200 border-t-brand-600 rounded-full animate-spin" />
        </div>
      )}
      {!loading && error && (
        <div className="text-center py-12 bg-red-50 border border-red-200 rounded-xl space-y-2">
          <p className="text-sm text-red-700">{error}</p>
          <button onClick={recargar} className="text-sm text-red-700 underline bg-transparent border-0 shadow-none">Reintentar</button>
        </div>
      )}
      {!loading && !error && hogaresFiltrados.length === 0 && (
        <p className="text-sm text-slate-400 text-center py-12 bg-slate-50 border border-slate-200 rounded-xl">
          {hogares.length === 0 ? "Todavía no hay hogares mapeados." : "Sin resultados para los filtros aplicados."}
        </p>
      )}

      {!loading && !error && hogaresFiltrados.length > 0 && (
        <>
          <LeafletMapaHogares
            hogares={hogaresFiltrados}
            hogarSeleccionadoId={hogarSeleccionado?.id}
            onSelectHogar={setHogarSeleccionado}
          />

          {/* Listado (además del mapa — útil en pantallas chicas y para hogares sin ubicación aún) */}
          <div className="space-y-2">
            {hogaresFiltrados.map((hogar) => {
              const jerarquia = getJerarquiaHogar(hogar, estructura);
              return (
                <button
                  key={hogar.id}
                  onClick={() => setHogarSeleccionado(hogar)}
                  className="w-full text-left bg-white border border-slate-200 rounded-xl p-3.5 hover:border-brand-300 hover:bg-brand-50/30 transition-colors shadow-none"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-slate-800">{hogar.nombre_familia || "Hogar sin nombre"}</p>
                    <EstadoMapaBadge estado={getEstadoMapaHogar(hogar)} />
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{hogar.direccion || "Sin dirección"}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {(hogar.votantes || []).length} votante{(hogar.votantes || []).length !== 1 ? "s" : ""}
                    {jerarquia.coordinador && ` · Coord: ${jerarquia.coordinador.nombre} ${jerarquia.coordinador.apellido || ""}`.trimEnd()}
                  </p>
                </button>
              );
            })}
          </div>
        </>
      )}

      <HogarDetallePanel
        hogar={hogarSeleccionado}
        estructura={estructura}
        currentUser={currentUser}
        onClose={() => setHogarSeleccionado(null)}
        onEditar={(hogar) => { setModalHogar({ hogarExistente: hogar }); setHogarSeleccionado(null); }}
        onVerificar={async (hogar, aprobar) => {
          setAccionError(null);
          try {
            await verificar(hogar.id, aprobar, hogar.ubicacion_actualizada_at);
            setHogarSeleccionado(null);
          } catch (err) {
            setAccionError(err.message);
          }
        }}
        onConfirmarVisita={(hogar) => { setModalVisitaHogar(hogar); setHogarSeleccionado(null); }}
      />

      {modalHogar && (
        <ModalHogar
          show
          onClose={() => setModalHogar(null)}
          saving={saving}
          hogarExistente={modalHogar.hogarExistente}
          votantesAsociadosOverride={votantesAsociadosEnVivo}
          votantesDisponibles={votantesDisponibles}
          onGuardar={handleGuardarHogar}
          onAsociarVotante={async (hogarId, votanteCi) => {
            setAccionError(null);
            try {
              await asociarVotante(hogarId, votanteCi);
            } catch (err) {
              setAccionError(err.message);
              throw err; // re-lanzar: ModalHogar debe mostrar el error dentro del modal, no detrás
            }
          }}
          onDesasociarVotante={async (hogarId, votanteCi) => {
            setAccionError(null);
            try {
              await desasociarVotante(hogarId, votanteCi);
            } catch (err) {
              setAccionError(err.message);
              throw err;
            }
          }}
          onConfirmarVisita={(hogar) => { setModalVisitaHogar(hogar); setModalHogar(null); }}
        />
      )}

      <ModalConfirmarVisita
        show={!!modalVisitaHogar}
        hogar={modalVisitaHogar}
        config={config}
        configError={configError}
        onReintentarConfig={recargarConfig}
        onClose={() => setModalVisitaHogar(null)}
        onConfirmar={async (payload) => {
          const visita = await confirmarVisitaService(currentUser, modalVisitaHogar.id, payload);
          await recargar();
          return visita;
        }}
      />
    </div>
  );
};

export default MapeoTerritorial;
