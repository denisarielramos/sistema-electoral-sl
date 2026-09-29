// ======================= QR ÚNICO DEL EVENTO (panel admin) =======================
// Un solo QR para todo el evento, apuntando siempre a /q/:slug. No hardcodea el slug:
// lo recibe por prop para poder alimentarse en el futuro de evento.slug devuelto por
// la RPC de configuración (mientras esa RPC no exista, AsistenciaAdmin le pasa el
// slug conocido como valor por defecto).
// Generado 100% en el cliente con qrcode.react (sin llamadas de red, sin API key).
import React, { useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { Copy, Check, Printer, Download } from "lucide-react";

const QRCodeAsistencia = ({ slug }) => {
  const canvasWrapRef = useRef(null);
  const [copiado, setCopiado] = useState(false);

  const url = `${window.location.origin}/q/${slug}`;

  const copiarEnlace = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      window.prompt("Copiá el enlace:", url);
    }
  };

  const obtenerCanvas = () => canvasWrapRef.current?.querySelector("canvas");

  const descargarPng = () => {
    const canvas = obtenerCanvas();
    if (!canvas) return;
    const enlace = document.createElement("a");
    enlace.download = `qr-asistencia-${slug}.png`;
    enlace.href = canvas.toDataURL("image/png");
    enlace.click();
  };

  const imprimir = () => {
    const canvas = obtenerCanvas();
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    const ventana = window.open("", "_blank");
    if (!ventana) return;
    ventana.document.write(`
      <html>
        <head><title>Código QR de asistencia</title></head>
        <body style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;font-family:sans-serif;">
          <img src="${dataUrl}" style="width:320px;height:320px;" />
          <p style="margin-top:16px;font-size:14px;color:#334155;">${url}</p>
        </body>
      </html>
    `);
    ventana.document.close();
    ventana.focus();
    ventana.print();
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-sm font-semibold text-slate-700 mb-3">Código QR de asistencia</p>
      <div className="flex flex-col items-center gap-3">
        <div ref={canvasWrapRef} className="p-3 bg-white border border-slate-100 rounded-lg">
          <QRCodeCanvas value={url} size={200} level="M" />
        </div>
        <p className="text-xs text-slate-500 break-all text-center">{url}</p>
        <div className="grid grid-cols-3 gap-2 w-full">
          <button
            type="button"
            onClick={copiarEnlace}
            className="inline-flex items-center justify-center gap-1.5 px-3 h-9 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-medium transition-colors"
          >
            {copiado ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            {copiado ? "Copiado" : "Copiar"}
          </button>
          <button
            type="button"
            onClick={imprimir}
            className="inline-flex items-center justify-center gap-1.5 px-3 h-9 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-medium transition-colors"
          >
            <Printer className="w-3.5 h-3.5" /> Imprimir
          </button>
          <button
            type="button"
            onClick={descargarPng}
            className="inline-flex items-center justify-center gap-1.5 px-3 h-9 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-medium transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> PNG
          </button>
        </div>
      </div>
    </div>
  );
};

export default QRCodeAsistencia;
