// ======================= LOGIN DEL CHOFER (sin login de usuario, código temporal) =======================
// Pantalla pública, montada desde RecorridoPublico.jsx. Llama exclusivamente a
// recorrido_iniciar_sesion_chofer — nunca consulta una tabla directamente.
// El código ingresado NUNCA se guarda (ni en estado persistente ni en storage):
// solo vive en el estado local de este formulario mientras se completa el envío,
// y se descarta apenas la RPC responde (éxito o error).
import React, { useState } from "react";
import { LogIn, AlertTriangle, Loader2, Truck } from "lucide-react";
import { getDeviceHash } from "./recorridoDevice";
import { iniciarSesionChofer } from "./recorridoService";
import { mensajeError, soloDigitos } from "./recorridoUtils";
import { Tarjeta, Encabezado, BotonPrimario } from "./components/RecorridoUI";

const RecorridoChoferLogin = ({ onIngresoExitoso }) => {
  const [ci, setCi] = useState("");
  const [codigo, setCodigo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  const enviar = async (e) => {
    e.preventDefault();
    const ciDigitos = soloDigitos(ci);
    const codigoLimpio = (codigo || "").trim();
    if (!ciDigitos || !codigoLimpio) {
      setError(mensajeError("CI_INVALIDO"));
      return;
    }

    setError("");
    setEnviando(true);
    try {
      const deviceHash = await getDeviceHash();
      const data = await iniciarSesionChofer(Number(ciDigitos), codigoLimpio, deviceHash);

      // El código ingresado se descarta acá, haya salido bien o mal el intento —
      // nunca persiste más allá de esta función.
      setCodigo("");

      if (!data?.ok) {
        setError(mensajeError(data?.codigo));
        return;
      }

      onIngresoExitoso({
        token: data.token,
        expiresAt: data.expires_at,
        sesionId: data.sesion_id,
        chofer: data.chofer || null,
        jornada: data.jornada || null,
      });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Tarjeta>
      <Encabezado
        icono={Truck}
        titulo="Monitoreo de Recorridos"
        subtitulo="Ingresá con tu cédula y el código de recorrido que te dieron para hoy"
      />
      <form onSubmit={enviar} className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Cédula</label>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            value={ci}
            onChange={(e) => setCi(soloDigitos(e.target.value))}
            placeholder="Número de cédula"
            className="w-full px-3 py-3 border border-slate-300 rounded-lg text-base focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            style={{ fontSize: 16 }}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Código de recorrido</label>
          <input
            type="text"
            autoComplete="off"
            autoCapitalize="characters"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            placeholder="Código del día"
            className="w-full px-3 py-3 border border-slate-300 rounded-lg text-base focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            style={{ fontSize: 16 }}
          />
        </div>
        {error && (
          <p className="flex items-center gap-1.5 text-sm text-red-600">
            <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
          </p>
        )}
        <BotonPrimario type="submit" disabled={enviando || !ci || !codigo}>
          {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
          Ingresar
        </BotonPrimario>
      </form>
    </Tarjeta>
  );
};

export default RecorridoChoferLogin;
