// ======================= PANEL ADMIN: MÓDULO DE ASISTENCIA (solo superadmin) =======================
// Ninguna de las 4 operaciones administrativas (leer configuración completa, editar
// horario/coordenadas/radio/modo, activar/desactivar evento, listar asistencias para
// reportes) tiene todavía una RPC seguraconfirmada en Supabase — ver
// asistenciaService.ADMIN_RPC_DISPONIBLE y la sección "RPC ADMINISTRATIVAS FALTANTES"
// del plan. Mientras sea `false`, este componente NUNCA llama a esas RPC: cada sección
// que depende de ellas se muestra con controles deshabilitados y un aviso explícito,
// en vez de disparar un request roto (error técnico 42883, "function does not exist").
import React, { useState } from "react";
import {
  ArrowLeft,
  QrCode,
  Settings,
  Radio,
  Users,
  ListChecks,
  Lock,
} from "lucide-react";
import { ADMIN_RPC_DISPONIBLE } from "./asistenciaService";
import QRCodeAsistencia from "./components/QRCodeAsistencia";
import MapaPuntoAsistencia from "./components/MapaPuntoAsistencia";

// Slug del único evento de asistencia creado hasta ahora. Se usa como valor por
// defecto del QR mientras no exista asistencia_admin_listar_configuracion — en cuanto
// esa RPC exista, se debe reemplazar por evento.slug devuelto por ella.
const SLUG_EVENTO_DEFECTO = "qr-434e025baf70516aec4f7d51";

const SECCIONALES_CONOCIDAS = [2, 3, 4];

const TABS = [
  { id: "configuracion", label: "Configuración", icon: Settings },
  { id: "en_vivo", label: "Asistencia en vivo", icon: Radio },
  { id: "por_estructura", label: "Por estructura", icon: Users },
  { id: "detalle", label: "Detalle", icon: ListChecks },
];

const AvisoBackendPendiente = ({ rpc }) => (
  <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
    <Lock className="w-4 h-4 shrink-0 mt-0.5" />
    <span>
      Backend administrativo pendiente: esta función necesita la RPC{" "}
      <code className="font-mono bg-amber-100 px-1 rounded">{rpc}</code>, que todavía no
      existe en Supabase. Los controles quedan deshabilitados hasta que se cree.
    </span>
  </div>
);

const CampoDeshabilitado = ({ label, placeholder }) => (
  <label className="block">
    <span className="block text-xs font-medium text-slate-500 mb-1">{label}</span>
    <input
      type="text"
      disabled
      value=""
      placeholder={placeholder}
      className="w-full px-3 py-2 border border-slate-200 bg-slate-50 rounded-lg text-sm text-slate-400 cursor-not-allowed"
    />
  </label>
);

const TarjetaSeccional = ({ seccional }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
    <div className="flex items-center justify-between">
      <p className="text-sm font-semibold text-slate-700">Seccional {seccional}</p>
      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">Sin datos</span>
    </div>
    <div className="grid grid-cols-2 gap-3">
      <CampoDeshabilitado label="Inicio" placeholder="Fecha y hora" />
      <CampoDeshabilitado label="Fin" placeholder="Fecha y hora" />
      <CampoDeshabilitado label="Radio (metros)" placeholder="Ej: 120" />
      <label className="block">
        <span className="block text-xs font-medium text-slate-500 mb-1">Modo</span>
        <select disabled className="w-full px-3 py-2 border border-slate-200 bg-slate-50 rounded-lg text-sm text-slate-400 cursor-not-allowed">
          <option>Automático</option>
        </select>
      </label>
    </div>
    <MapaPuntoAsistencia latitud={null} longitud={null} radioMetros={null} editable={false} onChange={() => {}} />
    <button
      type="button"
      disabled
      className="w-full inline-flex items-center justify-center gap-2 px-4 h-9 bg-slate-200 text-slate-400 rounded-lg text-sm font-medium border-0 cursor-not-allowed"
    >
      Guardar
    </button>
  </div>
);

const TabConfiguracion = () => (
  <div className="space-y-4">
    <AvisoBackendPendiente rpc="asistencia_admin_listar_configuracion / asistencia_admin_actualizar_punto" />

    <div className="rounded-xl border border-slate-200 bg-white p-4 flex items-center justify-between gap-3">
      <div>
        <p className="text-sm font-semibold text-slate-700">Evento: Reuniones de Asistencia 2026</p>
        <p className="text-xs text-slate-500 mt-0.5">Estado actual: desactivado a propósito.</p>
      </div>
      <button
        type="button"
        disabled
        title="Necesita asistencia_admin_actualizar_evento"
        className="inline-flex items-center gap-2 px-4 h-9 bg-slate-200 text-slate-400 rounded-lg text-sm font-medium border-0 cursor-not-allowed shrink-0"
      >
        Habilitar ahora
      </button>
    </div>

    <QRCodeAsistencia slug={SLUG_EVENTO_DEFECTO} />

    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {SECCIONALES_CONOCIDAS.map((s) => (
        <TarjetaSeccional key={s} seccional={s} />
      ))}
    </div>
  </div>
);

const TabEnVivo = () => (
  <div className="space-y-4">
    <AvisoBackendPendiente rpc="asistencia_admin_listar_asistencias" />
    <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
      Cuando esta RPC exista, acá se mostrará la cantidad de personas presentes por
      seccional, actualizada en vivo.
    </div>
  </div>
);

const TabPorEstructura = ({ estructura }) => {
  const totalDirigentes = estructura?.dirigentes?.length || 0;
  const totalCoordinadores = estructura?.coordinadores?.length || 0;
  return (
    <div className="space-y-4">
      <AvisoBackendPendiente rpc="asistencia_admin_listar_asistencias" />
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
        La estructura ya está cargada ({totalDirigentes} dirigentes, {totalCoordinadores}{" "}
        coordinadores) y lista para cruzarse contra las asistencias registradas en
        cuanto el backend las provea, mostrando "Personas de su estructura presentes"
        por dirigente/coordinador (reutilizando los helpers de estructuraHelpers.js).
      </div>
    </div>
  );
};

const COLUMNAS_DETALLE = [
  "CI",
  "Nombre y apellido",
  "Rol",
  "Seccional registrada",
  "Seccional padrón",
  "Fecha y hora",
  "Distancia",
  "Precisión GPS",
];

const TabDetalle = () => (
  <div className="space-y-4">
    <AvisoBackendPendiente rpc="asistencia_admin_listar_asistencias" />
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            {COLUMNAS_DETALLE.map((col) => (
              <th key={col} className="px-3 py-2 text-left text-xs font-medium text-slate-500 whitespace-nowrap">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colSpan={COLUMNAS_DETALLE.length} className="px-3 py-8 text-center text-sm text-slate-400">
              Sin datos — backend administrativo pendiente.
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
);

const AsistenciaAdmin = ({ currentUser, estructura, onVolver }) => {
  const [tab, setTab] = useState("configuracion");

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 py-4">
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
              <QrCode className="w-5 h-5 text-brand-600" />
              <div>
                <h1 className="text-xl font-bold text-slate-800">Asistencias</h1>
                <p className="text-xs text-slate-500">Conectado como {currentUser?.nombre || "Superadmin"}</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-4">
        {!ADMIN_RPC_DISPONIBLE && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            El backend administrativo de este módulo todavía no está conectado. La
            pantalla ya está lista: en cuanto se creen las RPC administrativas
            (documentadas en el plan), esta vista pasa a mostrar datos reales sin más
            cambios de interfaz.
          </div>
        )}

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

        {tab === "configuracion" && <TabConfiguracion />}
        {tab === "en_vivo" && <TabEnVivo />}
        {tab === "por_estructura" && <TabPorEstructura estructura={estructura} />}
        {tab === "detalle" && <TabDetalle />}
      </main>
    </div>
  );
};

export default AsistenciaAdmin;
