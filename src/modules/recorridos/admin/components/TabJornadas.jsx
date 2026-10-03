// ======================= TAB: JORNADAS =======================
// Alta/edición/activación de jornadas. Una jornada nueva siempre arranca
// inactiva (lo garantiza el backend: recorrido_admin_crear_jornada nunca
// auto-activa). Activar una jornada desactiva automáticamente cualquier otra
// que estuviera activa (también lo garantiza el backend) — por eso, antes de
// activar, se le explica al usuario qué jornada quedará desactivada.
import React, { useState } from "react";
import { Loader2, AlertTriangle, Plus, Pencil, Power, PowerOff, Calendar } from "lucide-react";
import { crearJornada, actualizarJornada, activarJornada, desactivarJornada } from "../recorridoAdminService";
import { mensajeError } from "../recorridoAdminUtils";

const AvisoError = ({ mensaje }) => (
  <p className="flex items-center gap-1.5 text-xs text-red-600 mt-1.5">
    <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {mensaje}
  </p>
);

const ModalJornada = ({ jornada, onCerrar, onGuardado }) => {
  const [nombre, setNombre] = useState(jornada?.nombre || "");
  const [fecha, setFecha] = useState(jornada?.fecha || "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const guardar = async () => {
    if (!nombre.trim() || !fecha) {
      setError("Completá el nombre y la fecha.");
      return;
    }
    setGuardando(true);
    setError("");
    const data = jornada
      ? await actualizarJornada(jornada.id, nombre.trim(), fecha)
      : await crearJornada(nombre.trim(), fecha);
    setGuardando(false);
    if (!data?.ok) {
      setError(mensajeError(data?.codigo));
      return;
    }
    onGuardado();
  };

  return (
    <div className="fixed inset-0 z-30 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-md w-full p-5 space-y-4">
        <h3 className="text-base font-semibold text-slate-800">
          {jornada ? "Editar jornada" : "Nueva jornada"}
        </h3>
        <label className="block">
          <span className="block text-xs font-medium text-slate-500 mb-1">Nombre</span>
          <input
            type="text"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            autoFocus
          />
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-slate-500 mb-1">Fecha</span>
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
          />
        </label>
        {!jornada && (
          <p className="text-xs text-slate-500">La jornada se creará inactiva. Podés activarla después desde el listado.</p>
        )}
        {error && <AvisoError mensaje={error} />}
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onCerrar}
            disabled={guardando}
            className="px-4 h-9 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-medium"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={guardar}
            disabled={guardando}
            className="inline-flex items-center gap-2 px-4 h-9 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium border-0"
          >
            {guardando && <Loader2 className="w-4 h-4 animate-spin" />}
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
};

const ModalConfirmarActivacion = ({ jornada, jornadaActivaActual, onCerrar, onConfirmar, procesando }) => (
  <div className="fixed inset-0 z-30 bg-black/40 flex items-center justify-center p-4">
    <div className="bg-white rounded-xl max-w-md w-full p-5 space-y-3">
      <h3 className="text-base font-semibold text-slate-800">Activar jornada</h3>
      <p className="text-sm text-slate-600">
        <strong>{jornada.nombre}</strong> pasará a ser la jornada operativa actual (la que ven los choferes al ingresar su
        código y la que se muestra en "En vivo").
      </p>
      {jornadaActivaActual && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Esto desactivará automáticamente la jornada actualmente activa: <strong>{jornadaActivaActual.nombre}</strong>.
        </p>
      )}
      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCerrar}
          disabled={procesando}
          className="px-4 h-9 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-medium"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={onConfirmar}
          disabled={procesando}
          className="inline-flex items-center gap-2 px-4 h-9 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium border-0"
        >
          {procesando && <Loader2 className="w-4 h-4 animate-spin" />}
          Activar
        </button>
      </div>
    </div>
  </div>
);

const TabJornadas = ({ jornadas, cargando, onRecargar }) => {
  const [modal, setModal] = useState(null); // null | "crear" | jornada (editar)
  const [confirmarActivar, setConfirmarActivar] = useState(null); // jornada
  const [procesandoId, setProcesandoId] = useState(null);
  const [errorAccion, setErrorAccion] = useState("");

  const jornadaActiva = jornadas.find((j) => j.activa) || null;

  const activar = async (jornada) => {
    setProcesandoId(jornada.id);
    setErrorAccion("");
    const data = await activarJornada(jornada.id);
    setProcesandoId(null);
    setConfirmarActivar(null);
    if (!data?.ok) {
      setErrorAccion(mensajeError(data?.codigo));
      return;
    }
    onRecargar();
  };

  const desactivar = async (jornada) => {
    setProcesandoId(jornada.id);
    setErrorAccion("");
    const data = await desactivarJornada(jornada.id);
    setProcesandoId(null);
    if (!data?.ok) {
      setErrorAccion(mensajeError(data?.codigo));
      return;
    }
    onRecargar();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">Una jornada nueva arranca inactiva. Solo puede haber una jornada activa a la vez.</p>
        <button
          type="button"
          onClick={() => setModal("crear")}
          className="inline-flex items-center gap-1.5 px-3 h-9 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-medium border-0"
        >
          <Plus className="w-4 h-4" /> Nueva jornada
        </button>
      </div>

      {errorAccion && <AvisoError mensaje={errorAccion} />}

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Nombre</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Fecha</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Estado</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {cargando ? (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center">
                  <Loader2 className="w-5 h-5 text-brand-600 animate-spin mx-auto" />
                </td>
              </tr>
            ) : jornadas.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-sm text-slate-400">
                  <Calendar className="w-6 h-6 mx-auto mb-2 text-slate-300" />
                  No hay jornadas creadas todavía.
                </td>
              </tr>
            ) : (
              jornadas.map((j) => (
                <tr key={j.id}>
                  <td className="px-3 py-2 text-slate-700 font-medium">{j.nombre}</td>
                  <td className="px-3 py-2 text-slate-500">{j.fecha}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        j.activa ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {j.activa ? "Activa" : "Inactiva"}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => setModal(j)}
                        title="Editar"
                        className="p-1.5 hover:bg-slate-100 rounded-lg border-0 bg-transparent"
                      >
                        <Pencil className="w-4 h-4 text-slate-500" />
                      </button>
                      {j.activa ? (
                        <button
                          type="button"
                          onClick={() => desactivar(j)}
                          disabled={procesandoId === j.id}
                          title="Desactivar"
                          className="p-1.5 hover:bg-slate-100 rounded-lg border-0 bg-transparent disabled:opacity-50"
                        >
                          {procesandoId === j.id ? (
                            <Loader2 className="w-4 h-4 text-slate-500 animate-spin" />
                          ) : (
                            <PowerOff className="w-4 h-4 text-slate-500" />
                          )}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmarActivar(j)}
                          disabled={procesandoId === j.id}
                          title="Activar"
                          className="p-1.5 hover:bg-brand-50 rounded-lg border-0 bg-transparent disabled:opacity-50"
                        >
                          {procesandoId === j.id ? (
                            <Loader2 className="w-4 h-4 text-brand-600 animate-spin" />
                          ) : (
                            <Power className="w-4 h-4 text-brand-600" />
                          )}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modal && (
        <ModalJornada
          jornada={modal === "crear" ? null : modal}
          onCerrar={() => setModal(null)}
          onGuardado={() => {
            setModal(null);
            onRecargar();
          }}
        />
      )}

      {confirmarActivar && (
        <ModalConfirmarActivacion
          jornada={confirmarActivar}
          jornadaActivaActual={jornadaActiva && jornadaActiva.id !== confirmarActivar.id ? jornadaActiva : null}
          onCerrar={() => setConfirmarActivar(null)}
          onConfirmar={() => activar(confirmarActivar)}
          procesando={procesandoId === confirmarActivar.id}
        />
      )}
    </div>
  );
};

export default TabJornadas;
