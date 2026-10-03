// ======================= REPLAY DE UNA SESIÓN =======================
// Carga TODOS los puntos de una sola sesión (nunca de otro chofer), paginando
// automáticamente si hay más de 5000 (el máximo por página que acepta
// recorrido_admin_replay_puntos), siempre en orden capturado_at ASC —
// garantizado por el propio backend, acá solo se concatenan las páginas en
// el orden en que llegan. Los km nunca se recalculan en el frontend: se
// muestran los que ya vienen del backend (replay.kmAcumulados).
import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, AlertTriangle, Play, Pause, RotateCcw } from "lucide-react";
import { replayPuntos, listarParadas, listarAlertas } from "../recorridoAdminService";
import { mensajeError, formatearHora, formatearKm, formatearDuracionSeg } from "../recorridoAdminUtils";
import MapaReplay from "./MapaReplay";

const LIMITE_PAGINA = 5000;
const VELOCIDADES = [1, 2, 5, 10, 20];
const TICK_MS = 250;

const cargarTodosLosPuntos = async (sesionId) => {
  let puntos = [];
  let offset = 0;
  // Techo de seguridad: en la práctica el loop termina mucho antes gracias al
  // chequeo de `total` del backend, esto solo evita un loop infinito si algo
  // devolviera datos inconsistentes.
  for (let i = 0; i < 1000; i++) {
    const data = await replayPuntos(sesionId, LIMITE_PAGINA, offset);
    if (!data?.ok) return { error: data?.codigo };
    const pagina = data.puntos || [];
    puntos = puntos.concat(pagina);
    offset += LIMITE_PAGINA;
    if (pagina.length === 0 || puntos.length >= (data.total || 0)) break;
  }
  return { puntos };
};

const BotonVolver = ({ onCerrar }) => (
  <button
    type="button"
    onClick={onCerrar}
    className="inline-flex items-center gap-1.5 px-3 h-9 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-medium"
  >
    <ArrowLeft className="w-4 h-4" /> Volver
  </button>
);

const TarjetaResumen = ({ label, valor }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-3 text-center">
    <p className="text-lg font-bold text-slate-800">{valor}</p>
    <p className="text-[11px] font-medium text-slate-500">{label}</p>
  </div>
);

const ReplaySesion = ({ replay, onCerrar }) => {
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [puntos, setPuntos] = useState([]);
  const [paradas, setParadas] = useState([]);
  const [alertas, setAlertas] = useState([]);

  const [tiempoMs, setTiempoMs] = useState(0);
  const [reproduciendo, setReproduciendo] = useState(false);
  const [velocidad, setVelocidad] = useState(1);
  // Instantánea del reloj tomada en el efecto de carga (nunca Date.now()
  // directo durante el render, que React considera impuro) — un resumen no
  // necesita recalcularse en vivo si la sesión se reabre, solo al cargarla.
  const [ahoraMs, setAhoraMs] = useState(null);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      setCargando(true);
      setError("");
      const [puntosRes, paradasRes, alertasRes] = await Promise.all([
        cargarTodosLosPuntos(replay.sesionId),
        listarParadas(replay.sesionId),
        listarAlertas(replay.sesionId),
      ]);
      if (cancelado) return;
      if (puntosRes.error) {
        setError(mensajeError(puntosRes.error));
        setCargando(false);
        return;
      }
      setPuntos(puntosRes.puntos);
      setParadas(paradasRes?.ok ? paradasRes.paradas || [] : []);
      setAlertas(alertasRes?.ok ? alertasRes.alertas || [] : []);
      setAhoraMs(Date.now());
      setTiempoMs(0);
      setReproduciendo(false);
      setCargando(false);
    })();
    return () => {
      cancelado = true;
    };
  }, [replay.sesionId]);

  const inicioMs = puntos.length > 0 ? new Date(puntos[0].capturado_at).getTime() : 0;
  const duracionMs =
    puntos.length > 0 ? new Date(puntos[puntos.length - 1].capturado_at).getTime() - inicioMs : 0;

  const offsets = useMemo(
    () => puntos.map((p) => new Date(p.capturado_at).getTime() - inicioMs),
    [puntos, inicioMs]
  );

  const indiceActual = useMemo(() => {
    if (offsets.length === 0) return 0;
    let lo = 0;
    let hi = offsets.length - 1;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (offsets[mid] <= tiempoMs) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }, [offsets, tiempoMs]);

  // Reproducción: avanza el tiempo virtual cada TICK_MS, escalado por la
  // velocidad elegida. Es un timer externo que llama setState en su
  // callback, no un setState síncrono en el cuerpo del efecto.
  useEffect(() => {
    if (!reproduciendo || duracionMs <= 0) return;
    const id = setInterval(() => {
      setTiempoMs((t) => {
        const siguiente = t + TICK_MS * velocidad;
        if (siguiente >= duracionMs) {
          setReproduciendo(false);
          return duracionMs;
        }
        return siguiente;
      });
    }, TICK_MS);
    return () => clearInterval(id);
  }, [reproduciendo, velocidad, duracionMs]);

  const alertasConPosicion = useMemo(() => {
    const paradasPorId = Object.fromEntries(paradas.map((p) => [p.id, p]));
    return alertas
      .filter((a) => a.parada_id && paradasPorId[a.parada_id])
      .map((a) => ({ ...a, lat: paradasPorId[a.parada_id].lat, lng: paradasPorId[a.parada_id].lng }));
  }, [alertas, paradas]);

  const tiempoDetenidoSeg = useMemo(() => {
    if (ahoraMs == null) return 0;
    return paradas.reduce((acc, p) => {
      if (p.fin_at) return acc + (p.duracion_seg || 0);
      return acc + Math.max(0, Math.floor((ahoraMs - new Date(p.inicio_at).getTime()) / 1000));
    }, 0);
  }, [paradas, ahoraMs]);

  const puntoActual = puntos[indiceActual];

  if (cargando) {
    return (
      <div className="space-y-4">
        <BotonVolver onCerrar={onCerrar} />
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-brand-600 animate-spin" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <BotonVolver onCerrar={onCerrar} />
        <p className="flex items-center gap-1.5 text-sm text-red-600">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
        </p>
      </div>
    );
  }

  if (puntos.length === 0) {
    return (
      <div className="space-y-4">
        <BotonVolver onCerrar={onCerrar} />
        <p className="text-sm text-slate-400 text-center py-20">Esta sesión todavía no tiene puntos GPS registrados.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <BotonVolver onCerrar={onCerrar} />
        <div className="text-right">
          <p className="text-sm font-semibold text-slate-800">
            {replay.nombre} {replay.apellido} <span className="text-slate-400 font-normal">(CI {replay.ci})</span>
          </p>
          {replay.jornadaNombre && <p className="text-xs text-slate-500">{replay.jornadaNombre}</p>}
        </div>
      </div>

      <MapaReplay puntos={puntos} paradas={paradas} alertasConPosicion={alertasConPosicion} indiceActual={indiceActual} />

      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => setReproduciendo((r) => !r)}
            className="inline-flex items-center gap-2 px-4 h-9 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-medium border-0"
          >
            {reproduciendo ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            {reproduciendo ? "Pausar" : "Reproducir"}
          </button>
          <button
            type="button"
            onClick={() => {
              setReproduciendo(false);
              setTiempoMs(0);
            }}
            className="inline-flex items-center gap-1.5 px-3 h-9 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-medium"
          >
            <RotateCcw className="w-4 h-4" /> Volver al inicio
          </button>
          <div className="flex items-center gap-1 ml-auto">
            {VELOCIDADES.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setVelocidad(v)}
                className={`px-2.5 h-8 rounded-lg text-xs font-medium ${
                  velocidad === v ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600"
                }`}
              >
                {v}x
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={duracionMs}
            value={tiempoMs}
            onChange={(e) => {
              setReproduciendo(false);
              setTiempoMs(Number(e.target.value));
            }}
            className="flex-1"
          />
          <span className="text-sm font-mono text-slate-600 whitespace-nowrap">
            {puntoActual ? formatearHora(puntoActual.capturado_at) : "—"}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <TarjetaResumen label="Km recorridos" valor={formatearKm(replay.kmAcumulados)} />
        <TarjetaResumen label="Hora inicio" valor={formatearHora(puntos[0].capturado_at)} />
        <TarjetaResumen label="Hora fin" valor={formatearHora(puntos[puntos.length - 1].capturado_at)} />
        <TarjetaResumen label="Tiempo total" valor={formatearDuracionSeg(duracionMs / 1000)} />
        <TarjetaResumen label="Paradas" valor={paradas.length} />
        <TarjetaResumen label="Tiempo detenido" valor={formatearDuracionSeg(tiempoDetenidoSeg)} />
        <TarjetaResumen label="Alertas" valor={alertas.length} />
        <TarjetaResumen label="Puntos GPS" valor={puntos.length} />
      </div>
    </div>
  );
};

export default ReplaySesion;
