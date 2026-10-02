// ======================= PRIMITIVAS DE UI COMPARTIDAS (módulo Recorridos) =======================
// Mobile-first: pantalla completa, botones grandes, una sola acción visible por
// paso. Estilo visual consistente con AsistenciaPublica.jsx, pero definido acá
// mismo (sin importar nada de otro módulo) para que Recorridos siga siendo
// borrable sin dejar dependencias cruzadas.
import React from "react";
import { ShieldCheck, Loader2 } from "lucide-react";

export const Tarjeta = ({ children }) => (
  <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
    <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
      {children}
    </div>
  </div>
);

export const Encabezado = ({ titulo, subtitulo, icono: Icono = ShieldCheck }) => (
  <div className="flex flex-col items-center text-center mb-5">
    <div className="p-2.5 bg-brand-50 rounded-full mb-3">
      {Icono && <Icono className="w-6 h-6 text-brand-600" />}
    </div>
    <h1 className="text-lg font-bold text-slate-800">{titulo}</h1>
    {subtitulo && <p className="text-sm text-slate-500 mt-1">{subtitulo}</p>}
  </div>
);

export const Cargando = ({ texto }) => (
  <Tarjeta>
    <div className="flex flex-col items-center text-center py-6">
      <Loader2 className="w-8 h-8 text-brand-600 animate-spin mb-4" />
      <p className="text-sm text-slate-600">{texto}</p>
    </div>
  </Tarjeta>
);

export const MensajeFinal = ({ icono: Icono, color, titulo, mensaje, children }) => (
  <Tarjeta>
    <div className="flex flex-col items-center text-center py-4">
      <div className={`p-3 rounded-full mb-4 ${color}`}>
        {Icono && <Icono className="w-7 h-7" />}
      </div>
      <h1 className="text-lg font-bold text-slate-800 mb-1">{titulo}</h1>
      {mensaje && <p className="text-sm text-slate-500">{mensaje}</p>}
      {children}
    </div>
  </Tarjeta>
);

export const BotonPrimario = ({ children, ...props }) => (
  <button
    {...props}
    className="w-full inline-flex items-center justify-center gap-2 px-4 h-12 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-semibold border-0 transition-colors"
  >
    {children}
  </button>
);

export const BotonSecundario = ({ children, ...props }) => (
  <button
    {...props}
    className="w-full inline-flex items-center justify-center gap-2 px-4 h-11 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
  >
    {children}
  </button>
);
