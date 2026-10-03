// ======================= PANEL ADMIN: MONITOREO DE RECORRIDOS (solo superadmin) =======================
// Puente de un solo login: NUNCA pide ni guarda una contraseña propia. Usa el
// admin_token de Asistencia que App.jsx ya guardó al hacer login como
// Superadmin (ver recorridoAdminService.iniciarDesdeSuperadmin) para canjearlo
// por un admin_token propio del módulo. Si el Superadmin no está habilitado en
// la allowlist de recorridos (recorrido_admin_access), se muestra un aviso —
// nunca se autoriza nada automáticamente desde el frontend.
import React, { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Navigation, Calendar, Users, KeyRound, History, ShieldCheck, Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import { listarJornadas } from "./recorridoAdminService";
import { mensajeError, esNoAutorizado } from "./recorridoAdminUtils";
import TabJornadas from "./components/TabJornadas";
import TabChoferes from "./components/TabChoferes";
import TabAsignaciones from "./components/TabAsignaciones";
import TabEnVivo from "./components/TabEnVivo";
import TabHistorial from "./components/TabHistorial";
import TabAccesos from "./components/TabAccesos";
import ReplaySesion from "./components/ReplaySesion";

const TABS = [
  { id: "en_vivo", label: "En vivo", icon: Navigation },
  { id: "jornadas", label: "Jornadas", icon: Calendar },
  { id: "choferes", label: "Choferes", icon: Users },
  { id: "asignaciones", label: "Asignaciones", icon: KeyRound },
  { id: "historial", label: "Historial", icon: History },
  { id: "accesos", label: "Accesos", icon: ShieldCheck },
];

const AvisoBridge = ({ codigo, onReintentar }) => (
  <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800 max-w-xl mx-auto mt-12">
    <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
    <div className="space-y-2">
      <p>{mensajeError(codigo)}</p>
      {!esNoAutorizado(codigo) && (
        <button
          type="button"
          onClick={onReintentar}
          className="inline-flex items-center gap-1.5 px-3 h-8 border border-amber-300 bg-white hover:bg-amber-50 text-amber-800 rounded-lg text-xs font-medium"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Reintentar
        </button>
      )}
    </div>
  </div>
);

const RecorridosAdmin = ({ currentUser, onVolver }) => {
  const [tab, setTab] = useState("en_vivo");
  // bridgeListo solo se vuelve true una vez — las recargas posteriores de
  // jornadas (crear/editar/activar) no deben volver a tapar las pestañas con
  // la pantalla de carga inicial, solo refrescar la lista en segundo plano.
  const [bridgeListo, setBridgeListo] = useState(false);
  const [errorBridge, setErrorBridge] = useState("");
  const [jornadas, setJornadas] = useState([]);
  // Replay de una sesión puntual: se puede abrir desde En vivo o Historial,
  // por eso vive a este nivel en vez de dentro de cada tab — al abrirse
  // reemplaza el contenido de la pestaña actual (las pestañas siguen visibles
  // para poder salir del replay sin perder la navegación). Se guarda el
  // contexto del chofer junto con el sesion_id porque ninguna RPC de replay
  // devuelve nombre/CI — ya se tenían disponibles en la fila de origen
  // (En vivo o Historial), así que se pasan en vez de volver a consultarlos.
  const [replay, setReplay] = useState(null);

  const cargarJornadas = useCallback(async () => {
    const data = await listarJornadas();
    if (!data?.ok) {
      setErrorBridge(data?.codigo || "ERROR_TECNICO");
      setJornadas([]);
      return;
    }
    setErrorBridge("");
    setJornadas(data.jornadas || []);
    setBridgeListo(true);
  }, []);

  useEffect(() => {
    (async () => {
      await cargarJornadas();
    })();
  }, [cargarJornadas]);

  const jornadaActiva = jornadas.find((j) => j.activa) || null;

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={onVolver}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors border-0 bg-transparent shadow-none"
              title="Volver al panel"
              aria-label="Volver al panel"
            >
              <ArrowLeft className="w-5 h-5 text-slate-600" />
            </button>
            <div className="flex items-center gap-2">
              <Navigation className="w-5 h-5 text-brand-600" />
              <div>
                <h1 className="text-xl font-bold text-slate-800">Monitoreo de recorridos</h1>
                <p className="text-xs text-slate-500">Conectado como {currentUser?.nombre || "Superadmin"}</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-4">
        {!bridgeListo && !errorBridge ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 text-brand-600 animate-spin" />
          </div>
        ) : errorBridge ? (
          <AvisoBridge codigo={errorBridge} onReintentar={cargarJornadas} />
        ) : (
          <>
            <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
              {TABS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={`inline-flex items-center gap-1.5 px-3 h-9 rounded-lg text-sm font-medium transition-colors ${
                    tab === id ? "bg-brand-50 text-brand-600" : "text-slate-500 hover:bg-slate-100"
                  }`}
                >
                  {Icon && <Icon className="w-4 h-4" />}
                  {label}
                </button>
              ))}
            </div>

            {replay ? (
              <ReplaySesion replay={replay} onCerrar={() => setReplay(null)} />
            ) : (
              <>
                {tab === "en_vivo" && (
                  <TabEnVivo jornadaActivaId={jornadaActiva?.id || null} onVerRecorrido={setReplay} />
                )}
                {tab === "jornadas" && <TabJornadas jornadas={jornadas} onRecargar={cargarJornadas} />}
                {tab === "choferes" && <TabChoferes />}
                {tab === "asignaciones" && (
                  <TabAsignaciones jornadas={jornadas} jornadaActivaId={jornadaActiva?.id || null} />
                )}
                {tab === "historial" && <TabHistorial jornadas={jornadas} onVerRecorrido={setReplay} />}
                {tab === "accesos" && <TabAccesos currentUser={currentUser} />}
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default RecorridosAdmin;
