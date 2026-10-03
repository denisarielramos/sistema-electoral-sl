// ======================= TAB: ACCESOS GPS (allowlist) =======================
// Gestiona qué Superadmins existentes pueden entrar al módulo de Monitoreo de
// Recorridos (recorrido_admin_access). NUNCA pide ni muestra una contraseña
// — no existe ninguna real desde el puente de Fase 4 (ver
// recorrido_admin_autorizar_ci). Autorizar acá NO autoriza nada
// automáticamente por fuera de esta acción explícita: no hay ningún seed ni
// alta automática en esta fase.
import React, { useCallback, useEffect, useState } from "react";
import { Loader2, AlertTriangle, Plus, ShieldOff, ShieldCheck, X } from "lucide-react";
import { listarAutorizados, autorizarCI, desautorizarCI } from "../recorridoAdminService";
import { mensajeError } from "../recorridoAdminUtils";

const AvisoError = ({ mensaje }) => (
  <p className="flex items-center gap-1.5 text-xs text-red-600 mt-1.5">
    <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {mensaje}
  </p>
);

const ModalAutorizar = ({ onCerrar, onGuardado }) => {
  const [ci, setCi] = useState("");
  const [nombre, setNombre] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const guardar = async () => {
    const ciNum = Number(ci);
    if (!ci || !Number.isInteger(ciNum) || ciNum <= 0) {
      setError("La cédula debe ser un número válido.");
      return;
    }
    if (!nombre.trim()) {
      setError("El nombre descriptivo es obligatorio.");
      return;
    }
    setGuardando(true);
    setError("");
    const data = await autorizarCI(ciNum, nombre.trim());
    setGuardando(false);
    if (!data?.ok) {
      setError(mensajeError(data?.codigo));
      return;
    }
    onGuardado();
  };

  return (
    <div className="fixed inset-0 z-30 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-sm w-full p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-800">Autorizar CI</h3>
          <button onClick={onCerrar} className="p-1 hover:bg-slate-100 rounded-lg border-0 bg-transparent">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>
        <p className="text-xs text-slate-500">
          Solo CIs que ya son Superadmin del sistema deberían autorizarse acá — este alta no crea ni valida esa
          condición, solo habilita el acceso al módulo GPS para quien inicie sesión con esa CI.
        </p>
        <label className="block">
          <span className="block text-xs font-medium text-slate-500 mb-1">Cédula</span>
          <input
            type="text"
            inputMode="numeric"
            value={ci}
            onChange={(e) => setCi(e.target.value.replace(/\D/g, ""))}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            autoFocus
          />
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-slate-500 mb-1">Nombre descriptivo</span>
          <input
            type="text"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
          />
        </label>
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
            Autorizar
          </button>
        </div>
      </div>
    </div>
  );
};

const ModalConfirmarDesautorizar = ({ admin, onCancelar, onConfirmar, procesando }) => (
  <div className="fixed inset-0 z-30 bg-black/40 flex items-center justify-center p-4">
    <div className="bg-white rounded-xl max-w-sm w-full p-5 space-y-3">
      <h3 className="text-base font-semibold text-slate-800">Desautorizar acceso</h3>
      <p className="text-sm text-slate-600">
        <strong>{admin.nombre}</strong> (CI {admin.ci}) perderá el acceso al módulo de Monitoreo de recorridos y
        cualquier sesión abierta se cerrará de inmediato.
      </p>
      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancelar}
          disabled={procesando}
          className="px-4 h-9 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-medium"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={onConfirmar}
          disabled={procesando}
          className="inline-flex items-center gap-2 px-4 h-9 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium border-0"
        >
          {procesando && <Loader2 className="w-4 h-4 animate-spin" />}
          Desautorizar
        </button>
      </div>
    </div>
  </div>
);

const TabAccesos = ({ currentUser }) => {
  const [autorizados, setAutorizados] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [modalAlta, setModalAlta] = useState(false);
  const [confirmarId, setConfirmarId] = useState(null);
  const [procesandoId, setProcesandoId] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    const data = await listarAutorizados();
    if (!data?.ok) {
      setError(mensajeError(data?.codigo));
      setAutorizados([]);
      setCargando(false);
      return;
    }
    setAutorizados(data.autorizados || []);
    setCargando(false);
  }, []);

  useEffect(() => {
    (async () => {
      await cargar();
    })();
  }, [cargar]);

  const confirmarDesautorizar = async (admin) => {
    setProcesandoId(admin.id);
    const data = await desautorizarCI(admin.id);
    setProcesandoId(null);
    setConfirmarId(null);
    if (!data?.ok) {
      setError(mensajeError(data?.codigo));
      return;
    }
    cargar();
  };

  const adminConfirmar = autorizados.find((a) => a.id === confirmarId);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">
          Solo las CIs listadas acá pueden entrar al Monitoreo de recorridos desde su sesión de Superadmin.
        </p>
        <button
          type="button"
          onClick={() => setModalAlta(true)}
          className="inline-flex items-center gap-1.5 px-3 h-9 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-medium border-0"
        >
          <Plus className="w-4 h-4" /> Autorizar CI
        </button>
      </div>

      {error && <AvisoError mensaje={error} />}

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">CI</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Nombre</th>
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
            ) : autorizados.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-sm text-slate-400">
                  Sin CIs autorizadas todavía.
                </td>
              </tr>
            ) : (
              autorizados.map((a) => (
                <tr key={a.id}>
                  <td className="px-3 py-2 whitespace-nowrap text-slate-700">{a.ci}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-slate-700">{a.nombre}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        a.activo ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {a.activo ? "Activo" : "Desautorizado"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {a.activo && (
                      <button
                        type="button"
                        onClick={() => setConfirmarId(a.id)}
                        disabled={procesandoId === a.id}
                        title="Desautorizar"
                        className="inline-flex items-center gap-1 px-2.5 h-7 border border-slate-200 bg-white hover:bg-red-50 text-slate-700 rounded text-xs font-medium disabled:opacity-50"
                      >
                        {procesandoId === a.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <ShieldOff className="w-3.5 h-3.5 text-red-500" />
                        )}
                        Desautorizar
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="flex items-center gap-1.5 text-xs text-slate-400">
        <ShieldCheck className="w-3.5 h-3.5" /> Conectado como {currentUser?.nombre || "Superadmin"}.
      </p>

      {modalAlta && (
        <ModalAutorizar
          onCerrar={() => setModalAlta(false)}
          onGuardado={() => {
            setModalAlta(false);
            cargar();
          }}
        />
      )}

      {adminConfirmar && (
        <ModalConfirmarDesautorizar
          admin={adminConfirmar}
          onCancelar={() => setConfirmarId(null)}
          onConfirmar={() => confirmarDesautorizar(adminConfirmar)}
          procesando={procesandoId === adminConfirmar.id}
        />
      )}
    </div>
  );
};

export default TabAccesos;
