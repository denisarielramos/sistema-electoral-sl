import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import { generarAccessCodeUnico } from "../utils/accessCode";
import {
  sanitizeParaguayPhoneInput,
  validateParaguayPhone,
} from "../utils/phoneValidation";

import {
  UserPlus,
  LogOut,
  FileText,
  ChevronDown,
  ChevronRight,
  Copy,
  Phone,
  Check,
  X,
  MapPin,
  Users,
  Search,
  CheckCircle2,
  Clock,
  TrendingUp,
  Shield,
  AlertCircle,
  ExternalLink,
} from "lucide-react";

import AddPersonModal from "../AddPersonModal";
import ModalAgregarCoordinador from "./ModalAgregarCoordinador";
import PadronSearch from "./PadronSearch";
import ModalTelefono from "./ModalTelefono";
import ModalDireccion from "./ModalDireccion";
import ConfirmVotoModal from "./ConfirmVotoModal";
import {
  generateSuperadminPDF,
  generateCoordinadorPDF,
  generateSubcoordinadorPDF,
} from "../services/pdfService";

import { getEstadisticas } from "../services/estadisticasService";

import {
  normalizeCI,
  getMisSubcoordinadores,
  getVotantesDeSubcoord,
  getMisVotantes,
  getVotantesDirectosCoord,
  getPersonasDisponibles,
  getCoordsDeDigente,
  getSubsDeDigente,
  getVotantesDirectosDirigente,
  getTodosVotantesDirigente,
} from "../utils/estructuraHelpers";

// ======================= SMALL REUSABLE COMPONENTS =======================

const Badge = ({ children, variant = "default" }) => {
  const variants = {
    default: "bg-slate-100 text-slate-700",
    green: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    red: "bg-red-50 text-red-700 border border-red-200",
    blue: "bg-blue-50 text-blue-700 border border-blue-200",
    amber: "bg-amber-50 text-amber-700 border border-amber-200",
    purple: "bg-purple-50 text-purple-700 border border-purple-200",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${variants[variant]}`}>
      {children}
    </span>
  );
};

const ActionBtn = ({ onClick, title, variant = "default", children }) => {
  const base =
    "inline-flex items-center justify-center w-9 h-9 rounded-lg transition-colors shrink-0";
  const variants = {
    default: "border border-slate-200 text-slate-600 hover:bg-slate-50",
    green: "border border-emerald-200 text-emerald-700 hover:bg-emerald-50",
    blue: "border border-blue-200 text-blue-700 hover:bg-blue-50",
    danger: "border border-red-200 text-red-600 hover:bg-red-50",
    "danger-solid": "bg-red-600 text-white hover:bg-red-700",
    "success-solid": "bg-emerald-600 text-white hover:bg-emerald-700",
  };
  return (
    <button
      onClick={onClick}
      title={title}
      className={`${base} ${variants[variant]}`}
    >
      {children}
    </button>
  );
};

// ======================= TERCERA EDAD BADGE =======================
const TerceraEdadBadge = () => (
  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-amber-100 text-amber-700 border border-amber-300">
    <AlertCircle className="w-3 h-3" />
    TERCERA EDAD
  </span>
);

// ======================= STAT CARD =======================
const StatCard = ({ label, value, icon: Icon, accent = false }) => (
  <div
    className={`rounded-xl p-4 flex flex-col gap-2 ${
      accent
        ? "bg-brand-700 text-white shadow-card-md"
        : "bg-white border border-slate-200 shadow-card"
    }`}
  >
    <div className="flex items-center justify-between">
      <p
        className={`text-xs font-semibold uppercase tracking-wide ${
          accent ? "text-brand-200" : "text-slate-500"
        }`}
      >
        {label}
      </p>
      {Icon && (
        <div
          className={`p-1.5 rounded-lg ${
            accent ? "bg-white/10" : "bg-brand-50"
          }`}
        >
          <Icon
            className={`w-4 h-4 ${accent ? "text-white" : "text-brand-600"}`}
          />
        </div>
      )}
    </div>
    <p
      className={`text-3xl font-bold leading-none ${
        accent ? "text-white" : "text-slate-800"
      }`}
    >
      {value ?? 0}
    </p>
  </div>
);

// ======================= VOTE PROGRESS CARD =======================
const VoteProgressCard = ({ confirmed, total, percentage }) => (
  <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-3 shadow-card">
    <div className="flex items-center justify-between">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Votos Confirmados
      </p>
      <div className="p-1.5 rounded-lg bg-emerald-50">
        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
      </div>
    </div>
    <div>
      <p className="text-3xl font-bold text-slate-800 leading-none">
        {confirmed ?? 0}
        <span className="text-lg text-slate-400 font-normal">/{total ?? 0}</span>
      </p>
    </div>
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-slate-500">Progreso</span>
        <span
          className={`text-xs font-bold ${
            percentage >= 75
              ? "text-emerald-600"
              : percentage >= 50
              ? "text-amber-600"
              : "text-slate-600"
          }`}
        >
          {percentage ?? 0}%
        </span>
      </div>
      <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
        <div
          className={`h-2 rounded-full transition-all duration-500 ${
            percentage >= 75
              ? "bg-emerald-500"
              : percentage >= 50
              ? "bg-amber-500"
              : "bg-brand-500"
          }`}
          style={{ width: `${percentage ?? 0}%` }}
        />
      </div>
    </div>
  </div>
);

// ======================= VOTE COUNTER BADGE =======================
const VoteCounter = ({ confirmed, total }) => {
  if (total === undefined || total === null) return null;
  return (
    <span className="inline-flex items-center gap-0.5 text-xs font-medium shrink-0">
      <span className="text-emerald-600 font-bold">{confirmed ?? 0}</span>
      <span className="text-slate-400">/</span>
      <span className="text-slate-500">{total}</span>
    </span>
  );
};

// ======================= PERSONA DATA =======================
const DatosPersona = ({
  persona, rol, loginCode, onCopy, counter,
  tablaAcceso, onGenerarAcceso, generandoAcceso, esSuperadmin,
}) => {
  const direccionMostrar = persona.direccion_override || persona.direccion;
  const hasName = Boolean(persona.nombre);
  const displayName = hasName
    ? `${persona.nombre} ${persona.apellido || ""}`.trim()
    : "Cargando...";
  const tieneCode = loginCode && String(loginCode).trim() !== "";
  return (
    <div className="space-y-0.5 text-xs sm:text-sm">
      <p className={`font-semibold flex items-center gap-1 flex-wrap ${hasName ? "text-slate-800" : "text-slate-400 italic"}`}>
        <span>{displayName}</span>
        {counter}
      </p>
      <p className="text-slate-500 truncate">
        CI: <span className="text-slate-700 font-medium">{persona.ci}</span>
        {rol && <span className="ml-2 text-slate-400">• {rol}</span>}
      </p>
      {/* Fila de código de acceso */}
      {tieneCode ? (
        <div className="mt-1 flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-slate-500">
            Código: <span className="font-mono font-semibold text-slate-700 select-all">{loginCode}</span>
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); onCopy?.(loginCode); }}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-brand-200 text-brand-600 text-xs hover:bg-brand-50 transition-colors bg-transparent shadow-none"
          >
            <Copy className="w-3 h-3" />
            Copiar
          </button>
        </div>
      ) : tablaAcceso ? (
        <div className="mt-1 flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-slate-400 italic">Sin código de acceso</span>
          {esSuperadmin && onGenerarAcceso && (
            <button
              disabled={generandoAcceso === persona.ci}
              onClick={(e) => { e.stopPropagation(); onGenerarAcceso(tablaAcceso, persona.ci); }}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-amber-300 text-amber-700 text-xs hover:bg-amber-50 transition-colors bg-transparent shadow-none disabled:opacity-50"
            >
              {generandoAcceso === persona.ci ? "Generando..." : "Generar acceso"}
            </button>
          )}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-slate-500 mt-0.5">
        {persona.seccional && <span>Seccional: {persona.seccional}</span>}
        {persona.local_votacion && <span className="truncate">Local: {persona.local_votacion}</span>}
        {persona.mesa && <span>Mesa: {persona.mesa}</span>}
        {persona.orden && <span>Orden: {persona.orden}</span>}
        {direccionMostrar && <span className="truncate">Dir: {direccionMostrar}</span>}
        {persona.telefono && <span className="truncate">Tel: {persona.telefono}</span>}
      </div>
    </div>
  );
};

// ======================= VOTANTE ROW =======================
const VotanteRow = ({
  v,
  onTelefono,
  onDireccion,
  onConfirmar,
  onAnular,
  canConfirmar,
  canAnular,
}) => (
  <div className="bg-white border border-slate-200 rounded-lg p-3 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 hover:border-slate-300 transition-colors">
    <div className="flex-1 min-w-0">
      <DatosPersona persona={v} rol={null} />
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {v.voto_confirmado && (
          <Badge variant="green">
            <Check className="w-3 h-3 mr-1" />
            Confirmado
          </Badge>
        )}
        {v.tercera_edad === true && <TerceraEdadBadge />}
      </div>
    </div>
    <div className="flex gap-1.5 shrink-0 flex-wrap">
      <ActionBtn onClick={(e) => { e.stopPropagation(); onTelefono("votante", v); }} title="Editar telefono" variant="green">
        <Phone className="w-3.5 h-3.5" />
      </ActionBtn>
      <ActionBtn onClick={(e) => { e.stopPropagation(); onDireccion("votante", v); }} title="Editar direccion" variant="blue">
        <MapPin className="w-3.5 h-3.5" />
      </ActionBtn>
      {!v.voto_confirmado && canConfirmar(v) && (
        <ActionBtn onClick={(e) => { e.stopPropagation(); onConfirmar(v); }} title="Confirmar voto" variant="success-solid">
          <Check className="w-3.5 h-3.5" />
        </ActionBtn>
      )}
      {v.voto_confirmado && canAnular(v) && (
        <ActionBtn onClick={(e) => { e.stopPropagation(); onAnular(v); }} title="Anular confirmacion" variant="danger">
          <X className="w-3.5 h-3.5" />
        </ActionBtn>
      )}
    </div>
  </div>
);

// ======================= MODAL AGREGAR DIRIGENTE =======================
const ModalAgregarDirigente = ({
  show,
  onClose,
  padron,
  padronLoading,
  padronError,
  onRetryPadron,
  disponibles,
  onAgregarDesdePadron,
  onAgregarExterno,
}) => {
  // modo: null | "padron" | "padron-contacto" | "externo"
  const [modo, setModo] = useState(null);

  // Paso 2 padrón: persona seleccionada + datos de contacto
  const [personaPadron, setPersonaPadron] = useState(null);
  const [padTelefono, setPadTelefono] = useState("+595");
  const [padTelefonoError, setPadTelefonoError] = useState(null);
  const [padUbicacion, setPadUbicacion] = useState("");

  // Externo
  const [extCI, setExtCI] = useState("");
  const [extNombre, setExtNombre] = useState("");
  const [extApellido, setExtApellido] = useState("");
  const [extTelefono, setExtTelefono] = useState("+595");
  const [extTelefonoError, setExtTelefonoError] = useState(null);
  const [extUbicacion, setExtUbicacion] = useState("");

  const [codigoGenerado, setCodigoGenerado] = useState(null);
  const [saving, setSaving] = useState(false);

  const resetAll = () => {
    setModo(null);
    setPersonaPadron(null);
    setPadTelefono("+595");
    setPadTelefonoError(null);
    setPadUbicacion("");
    setExtCI(""); setExtNombre(""); setExtApellido("");
    setExtTelefono("+595"); setExtTelefonoError(null); setExtUbicacion("");
    setCodigoGenerado(null); setSaving(false);
  };

  useEffect(() => { if (!show) resetAll(); }, [show]);

  if (!show) return null;

  // --- Padrón paso 1: selección ---
  const handleSelectPadron = (persona) => {
    setPersonaPadron(persona);
    setModo("padron-contacto");
  };

  // --- Padrón paso 2: confirmar con teléfono/ubicación ---
  const handleConfirmarPadron = async () => {
    const telResult = validateParaguayPhone(padTelefono);
    if (!telResult.valid) { setPadTelefonoError(telResult.error); return; }
    setSaving(true);
    const code = await onAgregarDesdePadron({
      ...personaPadron,
      telefono: telResult.normalized,
      direccion_override: padUbicacion.trim() || null,
    });
    setSaving(false);
    if (code) setCodigoGenerado(code);
  };

  // --- Externo ---
  const handleSubmitExterno = async () => {
    const ci = String(extCI).replace(/\D/g, "");
    if (!ci) { alert("El CI es obligatorio y debe ser numerico."); return; }
    if (!extNombre.trim()) { alert("El nombre es obligatorio."); return; }
    const telResult = validateParaguayPhone(extTelefono);
    if (!telResult.valid) { setExtTelefonoError(telResult.error); return; }
    setSaving(true);
    const code = await onAgregarExterno({
      ci,
      nombre: extNombre.trim(),
      apellido: extApellido.trim(),
      telefono: telResult.normalized,
      direccion_override: extUbicacion.trim() || null,
    });
    setSaving(false);
    if (code) setCodigoGenerado(code);
  };

  const inputCls = (hasError) =>
    `w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-slate-50 ${hasError ? "border-red-400" : "border-slate-200"}`;
  const labelCls = "block text-xs font-semibold text-slate-700 mb-1";

  // --- Vista: código generado ---
  if (codigoGenerado) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl w-full max-w-sm shadow-modal p-6 flex flex-col gap-4 animate-fade-in">
          <div className="text-center">
            <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <Check className="w-6 h-6 text-emerald-600" />
            </div>
            <h3 className="text-base font-bold text-slate-800">Dirigente creado</h3>
            <p className="text-sm text-slate-500 mt-1">Codigo de acceso generado. Comparta con el dirigente.</p>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center justify-between gap-3">
            <span className="font-mono font-bold text-xl tracking-widest text-brand-700">{codigoGenerado}</span>
            <button
              onClick={() => navigator.clipboard.writeText(codigoGenerado).catch(() => {})}
              className="flex items-center gap-1.5 px-3 h-8 border border-brand-200 rounded-lg text-xs text-brand-600 hover:bg-brand-50 transition-colors bg-transparent shadow-none"
            >
              <Copy className="w-3.5 h-3.5" /> Copiar
            </button>
          </div>
          <button onClick={onClose} className="w-full h-10 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm font-semibold border-0 transition-colors">
            Cerrar
          </button>
        </div>
      </div>
    );
  }

  // --- Vista: selector de modo ---
  if (!modo) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl w-full max-w-sm shadow-modal overflow-hidden animate-fade-in">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50">
            <h3 className="text-base font-bold text-slate-800">Agregar Dirigente</h3>
            <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg border-0 bg-transparent shadow-none"><X className="w-4 h-4" /></button>
          </div>
          <div className="p-5 space-y-3">
            <p className="text-sm text-slate-600">Seleccione como desea agregar al dirigente:</p>
            <button onClick={() => setModo("padron")} className="w-full flex items-center gap-3 p-4 border border-slate-200 rounded-xl hover:border-brand-300 hover:bg-brand-50 transition-colors text-left bg-white">
              <div className="p-2 bg-brand-100 rounded-lg shrink-0"><Users className="w-4 h-4 text-brand-600" /></div>
              <div>
                <p className="font-semibold text-sm text-slate-800">Persona del padron</p>
                <p className="text-xs text-slate-500">Buscar por CI o nombre en el padron electoral.</p>
              </div>
            </button>
            <button onClick={() => setModo("externo")} className="w-full flex items-center gap-3 p-4 border border-slate-200 rounded-xl hover:border-brand-300 hover:bg-brand-50 transition-colors text-left bg-white">
              <div className="p-2 bg-slate-100 rounded-lg shrink-0"><UserPlus className="w-4 h-4 text-slate-600" /></div>
              <div>
                <p className="font-semibold text-sm text-slate-800">Dirigente externo</p>
                <p className="text-xs text-slate-500">Cargar manualmente datos de un dirigente fuera del padron.</p>
              </div>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- Vista: búsqueda en padrón ---
  if (modo === "padron") {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-4">
        <div className="bg-white rounded-2xl w-full max-w-xl shadow-modal overflow-hidden flex flex-col max-h-[90vh] animate-fade-in">
          <PadronSearch
            padron={padron}
            padronLoading={padronLoading}
            padronError={padronError}
            onRetry={onRetryPadron}
            disponibles={disponibles}
            onSelect={handleSelectPadron}
            titulo="Agregar Dirigente — Padron"
            placeholder="Buscar dirigente por CI, nombre o apellido..."
            onBack={() => setModo(null)}
            onClose={onClose}
          />
        </div>
      </div>
    );
  }

  // --- Vista: paso 2 padrón — datos de contacto ---
  if (modo === "padron-contacto" && personaPadron) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl w-full max-w-sm shadow-modal overflow-hidden animate-fade-in">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50">
            <div className="flex items-center gap-2">
              <button onClick={() => setModo("padron")} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg border-0 bg-transparent shadow-none">
                <ChevronRight className="w-4 h-4 rotate-180" />
              </button>
              <h3 className="text-base font-bold text-slate-800">Datos de contacto</h3>
            </div>
            <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg border-0 bg-transparent shadow-none"><X className="w-4 h-4" /></button>
          </div>
          <div className="p-5 space-y-4">
            {/* Resumen de la persona seleccionada */}
            <div className="bg-brand-50 border border-brand-100 rounded-xl px-4 py-3">
              <p className="font-semibold text-sm text-slate-800">{personaPadron.nombre} {personaPadron.apellido || ""}</p>
              <p className="text-xs text-slate-500 mt-0.5">CI: {personaPadron.ci}</p>
              {personaPadron.seccional && <p className="text-xs text-slate-500">Seccional: {personaPadron.seccional}</p>}
            </div>
            <div>
              <label className={labelCls}>Telefono celular <span className="text-red-500">*</span></label>
              <input
                type="tel" inputMode="numeric" autoComplete="tel" maxLength={16}
                value={padTelefono}
                onChange={(e) => { setPadTelefono(sanitizeParaguayPhoneInput(e.target.value)); setPadTelefonoError(null); }}
                placeholder="+595 9XX XXX XXX"
                className={inputCls(!!padTelefonoError)}
              />
              {padTelefonoError
                ? <p className="text-xs text-red-500 mt-1">{padTelefonoError}</p>
                : <p className="text-xs text-slate-400 mt-1">Ej: 0981 123 456 o +595 981 123 456</p>
              }
            </div>
            <div>
              <label className={labelCls}>Ubicacion o direccion <span className="text-xs font-normal text-slate-400">(opcional)</span></label>
              <input
                type="text"
                value={padUbicacion}
                onChange={(e) => setPadUbicacion(e.target.value)}
                placeholder="Direccion o enlace de Google Maps"
                className={inputCls(false)}
              />
              <p className="text-xs text-slate-400 mt-1">Puede ingresar una direccion o pegar un enlace de Google Maps.</p>
            </div>
            <button
              onClick={handleConfirmarPadron}
              disabled={saving}
              className="w-full h-10 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-400 text-white rounded-xl text-sm font-semibold border-0 transition-colors"
            >
              {saving ? "Guardando..." : "Crear Dirigente"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- Vista: externo ---
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-modal overflow-hidden animate-fade-in">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center gap-2">
            <button onClick={() => setModo(null)} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg border-0 bg-transparent shadow-none">
              <ChevronRight className="w-4 h-4 rotate-180" />
            </button>
            <h3 className="text-base font-bold text-slate-800">Dirigente externo</h3>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg border-0 bg-transparent shadow-none"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className={labelCls}>CI <span className="text-red-500">*</span></label>
            <input type="text" value={extCI} onChange={(e) => setExtCI(e.target.value.replace(/\D/g, ""))} placeholder="Solo numeros" className={inputCls(false)} />
          </div>
          <div>
            <label className={labelCls}>Nombre <span className="text-red-500">*</span></label>
            <input type="text" value={extNombre} onChange={(e) => setExtNombre(e.target.value)} placeholder="Nombre del dirigente" className={inputCls(false)} />
          </div>
          <div>
            <label className={labelCls}>Apellido</label>
            <input type="text" value={extApellido} onChange={(e) => setExtApellido(e.target.value)} placeholder="Apellido (opcional)" className={inputCls(false)} />
          </div>
          <div>
            <label className={labelCls}>Telefono celular <span className="text-red-500">*</span></label>
            <input
              type="tel" inputMode="numeric" autoComplete="tel" maxLength={16}
              value={extTelefono}
              onChange={(e) => { setExtTelefono(sanitizeParaguayPhoneInput(e.target.value)); setExtTelefonoError(null); }}
              placeholder="+595 9XX XXX XXX"
              className={inputCls(!!extTelefonoError)}
            />
            {extTelefonoError
              ? <p className="text-xs text-red-500 mt-1">{extTelefonoError}</p>
              : <p className="text-xs text-slate-400 mt-1">Ej: 0981 123 456 o +595 981 123 456</p>
            }
          </div>
          <div>
            <label className={labelCls}>Ubicacion o direccion <span className="text-xs font-normal text-slate-400">(opcional)</span></label>
            <input
              type="text"
              value={extUbicacion}
              onChange={(e) => setExtUbicacion(e.target.value)}
              placeholder="Direccion o enlace de Google Maps"
              className={inputCls(false)}
            />
          </div>
          <button onClick={handleSubmitExterno} disabled={saving} className="w-full h-10 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-400 text-white rounded-xl text-sm font-semibold border-0 transition-colors">
            {saving ? "Guardando..." : "Crear Dirigente"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ======================= MAIN DASHBOARD =======================
const Dashboard = ({ currentUser, onLogout }) => {
  // ======================= ESTADO PRINCIPAL =======================
  // Estructura RAW: solo los datos crudos de las tablas de estructura (sin enriquecer con padrón)
  const [estructuraRaw, setEstructuraRaw] = useState({
    dirigentes: [],
    coordinadores: [],
    subcoordinadores: [],
    votantes: [],
  });
  const [estructuraError, setEstructuraError] = useState(null);
  const [padron, setPadron] = useState([]);
  const [padronLoaded, setPadronLoaded] = useState(false);
  const [padronLoading, setPadronLoading] = useState(false);
  const [padronError, setPadronError] = useState(null);
  const [generandoAcceso, setGenerandoAcceso] = useState(null); // ci de quien está generando
  const [loading, setLoading] = useState(true);

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [addModalTipo, setAddModalTipo] = useState("votante");
  const [showAgregarDirigente, setShowAgregarDirigente] = useState(false);
  const [showAgregarCoord, setShowAgregarCoord] = useState(false);
  const [modalTelefonoState, setModalTelefonoState] = useState({ show: false, tipo: null, persona: null });
  const [modalDireccionState, setModalDireccionState] = useState({ show: false, tipo: null, persona: null });
  const [confirmVotoState, setConfirmVotoState] = useState({ show: false, votante: null, accion: null });

  // Expand states
  const [expandedCoords, setExpandedCoords] = useState({});
  const [expandedSubs, setExpandedSubs] = useState({});
  const [expandedDirs, setExpandedDirs] = useState({});

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchActive, setSearchActive] = useState(false);

  // Copy feedback
  const [copiedCode, setCopiedCode] = useState(null);

  // ======================= FETCH PAGINADO DE TABLA ACTIVA =======================
  // Trae TODAS las filas activas de una tabla, de 1000 en 1000, sin embeds.
  // Lanza el error indicando la tabla — nunca devuelve [] silenciosamente ante un error.
  const fetchAllActive = useCallback(async (tableName) => {
    const PAGE = 1000;
    let desde = 0;
    const acum = [];
    for (;;) {
      const { data, error } = await supabase
        .from(tableName)
        .select("*")
        .eq("activo", true)
        .range(desde, desde + PAGE - 1);
      if (error) {
        throw new Error(`Error cargando ${tableName}: ${error.message}`);
      }
      if (!data || data.length === 0) break;
      acum.push(...data);
      if (data.length < PAGE) break;
      desde += PAGE;
    }
    return acum;
  }, []);

  // ======================= CARGAR ESTRUCTURA (RAW) =======================
  const cargarEstructura = useCallback(async () => {
    setLoading(true);
    setEstructuraError(null);
    try {
      const [dirigentes, coordinadores, subcoordinadores, votantes] = await Promise.all([
        fetchAllActive("dirigentes"),
        fetchAllActive("coordinadores"),
        fetchAllActive("subcoordinadores"),
        fetchAllActive("votantes"),
      ]);

      // Guardar solo datos crudos, normalizando CI para comparaciones consistentes
      const norm = (rows) => rows.map((r) => ({ ...r, ci: normalizeCI(r.ci) }));

      setEstructuraRaw({
        dirigentes: norm(dirigentes),
        coordinadores: norm(coordinadores),
        subcoordinadores: norm(subcoordinadores),
        votantes: norm(votantes),
      });
    } catch (err) {
      console.error("[Dashboard]", err.message);
      setEstructuraError(err.message || "Error al cargar la estructura.");
    } finally {
      setLoading(false);
    }
  }, [fetchAllActive]);

  // ======================= PADRON: HELPERS INDEXEDDB =======================
  const openPadronDB = () =>
    new Promise((resolve, reject) => {
      const req = indexedDB.open("PadronDB", 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains("padron")) {
          db.createObjectStore("padron", { keyPath: "ci" });
        }
      };
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = () => reject(req.error);
    });

  const readAllFromDB = (db) =>
    new Promise((resolve, reject) => {
      if (!db.objectStoreNames.contains("padron")) { resolve([]); return; }
      const tx = db.transaction("padron", "readonly");
      const req = tx.objectStore("padron").getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });

  const saveAllToDB = (db, registros) =>
    new Promise((resolve, reject) => {
      if (!db.objectStoreNames.contains("padron")) { resolve(); return; }
      const tx = db.transaction("padron", "readwrite");
      const store = tx.objectStore("padron");
      store.clear();
      for (const r of registros) store.put(r);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

  // Descarga el padrón completo desde Supabase usando paginación de 1000 filas
  const descargarPadronSupabase = async () => {
    const PAGE = 1000;
    let desde = 0;
    const acum = [];
    for (;;) {
      const { data, error } = await supabase
        .from("padron")
        .select("ci,nombre,apellido,seccional,local_votacion,mesa,orden")
        .range(desde, desde + PAGE - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      acum.push(...data);
      if (data.length < PAGE) break;
      desde += PAGE;
    }
    return acum;
  };

  // ======================= CARGAR PADRÓN (ensurePadronLoaded) =======================
  const cargarPadron = useCallback(async () => {
    // A: ya hay datos en el estado → no volver a cargar
    if (padron.length > 0) { setPadronLoaded(true); return; }

    setPadronLoading(true);
    setPadronError(null);
    try {
      // B: leer IndexedDB
      const db = await openPadronDB();
      const cached = await readAllFromDB(db);

      if (cached.length > 0) {
        // IndexedDB tiene datos → usarlos inmediatamente
        setPadron(cached);
        setPadronLoaded(true);
        setPadronLoading(false);

        // D: actualización en background (sin bloquear el buscador)
        descargarPadronSupabase()
          .then(async (fresh) => {
            if (fresh.length > 0 && fresh.length !== cached.length) {
              await saveAllToDB(db, fresh);
              setPadron(fresh);
            }
          })
          .catch(() => {/* ignorar errores del refresh en background */});
        return;
      }

      // C: IndexedDB vacío → descargar desde Supabase
      const registros = await descargarPadronSupabase();
      if (registros.length > 0) {
        await saveAllToDB(db, registros);
        setPadron(registros);
      }
      setPadronLoaded(true);
    } catch (err) {
      console.error("[Dashboard] Error cargando padrón:", err);
      setPadronError("Error al cargar el padrón: " + (err?.message || "error desconocido"));
      setPadronLoaded(true);
    } finally {
      setPadronLoading(false);
    }
  }, [padron.length]);  // solo re-crea si cambia la longitud (de 0 a >0)

  useEffect(() => {
    cargarEstructura();
    cargarPadron();
  }, [cargarEstructura, cargarPadron]);

  // ======================= COPY =======================
  const handleCopy = useCallback(async (code) => {
    if (!code) {
      alert("Este registro no tiene código de acceso.");
      return;
    }
    const text = String(code);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback con textarea temporal para navegadores sin Clipboard API
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        if (!ok) throw new Error("execCommand failed");
      } catch {
        alert(`No se pudo copiar automáticamente. Código: ${text}`);
        return;
      }
    }
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2500);
  }, []);

  // ======================= GENERAR ACCESO (para registros sin login_code) =======================
  const handleGenerarAcceso = useCallback(async (tabla, ci) => {
    setGenerandoAcceso(ci);
    try {
      const loginCode = await generarAccessCodeUnico(supabase);
      const { error } = await supabase
        .from(tabla)
        .update({ login_code: loginCode })
        .eq("ci", ci);
      if (error) { alert("Error al generar acceso: " + error.message); return; }
      alert(`Código generado: ${loginCode}`);
      cargarEstructura();
    } catch (err) {
      alert(err.message);
    } finally {
      setGenerandoAcceso(null);
    }
  }, [cargarEstructura]);

  // ======================= VERIFICAR CI DISPONIBLE =======================
  // Consulta Supabase (fuente de verdad) en las 4 tablas antes de insertar.
  // No depende de personasDisponibles porque el estado local puede estar desactualizado.
  const verificarCIDisponible = useCallback(async (ci) => {
    const ciNorm = normalizeCI(ci);
    const tablas = [
      { tabla: "dirigentes", rol: "dirigente" },
      { tabla: "coordinadores", rol: "coordinador" },
      { tabla: "subcoordinadores", rol: "subcoordinador" },
      { tabla: "votantes", rol: "votante" },
    ];
    for (const { tabla, rol } of tablas) {
      const { data, error } = await supabase
        .from(tabla)
        .select("ci, activo")
        .eq("ci", ciNorm)
        .maybeSingle();
      if (error) {
        console.error(`[verificarCIDisponible] ${tabla}: ${error.message}`);
        continue; // no bloquear por un error de lectura puntual
      }
      if (data) {
        if (data.activo === false) {
          return {
            disponible: false,
            mensaje: `Esta persona está archivada como ${rol}. Debe ser restaurada por el superadmin.`,
          };
        }
        return { disponible: false, mensaje: `Esta persona ya está registrada como ${rol}.` };
      }
    }
    return { disponible: true };
  }, []);

  // ======================= PADRON MAP =======================
  // Índice CI → registro de padrón, usando el padrón completo ya en memoria/IndexedDB.
  const padronMap = useMemo(() => {
    const map = new Map();
    for (const p of padron) map.set(normalizeCI(p.ci), p);
    return map;
  }, [padron]);

  // ======================= ESTRUCTURA ENRIQUECIDA =======================
  // Combina estructuraRaw con datos del padrón. Los datos de la tabla de estructura
  // prevalecen (telefono, activo, asignado_por, roles, dirigente_ci, coordinador_ci,
  // tercera_edad, voto_confirmado, direccion_override). Se recalcula automáticamente
  // cuando el padrón termina de cargar, sin volver a consultar Supabase.
  const estructura = useMemo(() => {
    const enrich = (rows) =>
      rows.map((row) => {
        const p = padronMap.get(normalizeCI(row.ci)) || {};
        return {
          ...p,      // datos del padrón (nombre, apellido, seccional, local_votacion, mesa, orden, direccion)
          ...row,    // datos de estructura prevalecen
          ci: normalizeCI(row.ci),
          // Para dirigentes externos se conserva su nombre/apellido de la tabla dirigentes;
          // para el resto, cae al padrón si la estructura no lo trae.
          nombre: row.nombre || p.nombre || "",
          apellido: row.apellido || p.apellido || "",
          seccional: row.seccional || p.seccional || "",
          local_votacion: row.local_votacion || p.local_votacion || "",
          mesa: row.mesa || p.mesa || "",
          orden: row.orden || p.orden || "",
          direccion: p.direccion || row.direccion || "",
        };
      });

    return {
      dirigentes: enrich(estructuraRaw.dirigentes),
      coordinadores: enrich(estructuraRaw.coordinadores),
      subcoordinadores: enrich(estructuraRaw.subcoordinadores),
      votantes: enrich(estructuraRaw.votantes),
    };
  }, [estructuraRaw, padronMap]);

  // ======================= PERSONAS DISPONIBLES =======================
  const personasDisponibles = useMemo(
    () => getPersonasDisponibles(padron, estructura),
    [padron, estructura]
  );

  // ======================= ESTADÍSTICAS =======================
  const estadisticas = useMemo(
    () => getEstadisticas(estructura, currentUser),
    [currentUser, estructura]
  );

  // ======================= CONFIRMACIÓN DE VOTO =======================
  const canConfirmar = useCallback(
    (votante) => {
      const role = currentUser.role;
      if (role === "superadmin") return true;
      if (role === "dirigente") {
        return normalizeCI(votante.dirigente_ci) === normalizeCI(currentUser.ci);
      }
      if (role === "coordinador") {
        return normalizeCI(votante.coordinador_ci) === normalizeCI(currentUser.ci);
      }
      if (role === "subcoordinador") {
        return normalizeCI(votante.asignado_por) === normalizeCI(currentUser.ci);
      }
      return false;
    },
    [currentUser]
  );

  const canAnular = useCallback(
    (votante) => canConfirmar(votante),
    [canConfirmar]
  );

  const handleConfirmar = useCallback((votante) => {
    setConfirmVotoState({ show: true, votante, accion: "confirmar" });
  }, []);

  const handleAnular = useCallback((votante) => {
    setConfirmVotoState({ show: true, votante, accion: "anular" });
  }, []);

  const handleConfirmVoto = useCallback(async () => {
    const { votante, accion } = confirmVotoState;
    if (!votante) return;
    const { error } = await supabase
      .from("votantes")
      .update({ voto_confirmado: accion === "confirmar" })
      .eq("ci", votante.ci);
    if (error) { alert("Error al actualizar voto: " + error.message); return; }
    setConfirmVotoState({ show: false, votante: null, accion: null });
    await cargarEstructura();
  }, [confirmVotoState, cargarEstructura]);

  // ======================= MODALES TELEFONO / DIRECCION =======================
  const handleOpenTelefono = useCallback((tipo, persona) => {
    setModalTelefonoState({ show: true, tipo, persona });
  }, []);

  const handleOpenDireccion = useCallback((tipo, persona) => {
    setModalDireccionState({ show: true, tipo, persona });
  }, []);

  // Mapa único de tipo → tabla. Nunca usar ternarios encadenados para esto.
  const TABLE_BY_TYPE = {
    dirigente: "dirigentes",
    coordinador: "coordinadores",
    subcoordinador: "subcoordinadores",
    votante: "votantes",
  };

  const handleSaveTelefono = useCallback(async (tipo, persona, nuevoTelefono) => {
    const tabla = TABLE_BY_TYPE[tipo];
    if (!tabla) { alert("Tipo de persona desconocido: " + tipo); return; }
    const { error } = await supabase.from(tabla).update({ telefono: nuevoTelefono }).eq("ci", persona.ci);
    if (error) { alert("Error al guardar teléfono: " + error.message); throw error; }
    setModalTelefonoState({ show: false, tipo: null, persona: null });
    await cargarEstructura();
  }, [cargarEstructura]);

  const handleSaveDireccion = useCallback(async (tipo, persona, nuevaDireccion) => {
    const tabla = TABLE_BY_TYPE[tipo];
    if (!tabla) { alert("Tipo de persona desconocido: " + tipo); return; }
    const { error } = await supabase.from(tabla).update({ direccion_override: nuevaDireccion }).eq("ci", persona.ci);
    if (error) { alert("Error al guardar dirección: " + error.message); throw error; }
    setModalDireccionState({ show: false, tipo: null, persona: null });
    await cargarEstructura();
  }, [cargarEstructura]);

  // ======================= AGREGAR VOTANTE (TODOS LOS ROLES) =======================
  const handleAddVotante = useCallback(async (persona) => {
    const role = currentUser.role;
    const ciVotante = normalizeCI(persona.ci);
    const telResult = validateParaguayPhone(persona.telefono);
    if (!telResult.valid) { alert(telResult.error); return; }
    const tel = telResult.normalized;
    const terceraEdad = persona.tercera_edad;

    if (terceraEdad === null || terceraEdad === undefined) { alert("Debe indicar si es tercera edad."); return; }

    // Verificar que la CI no exista en otra jerarquía
    const chequeo = await verificarCIDisponible(ciVotante);
    if (!chequeo.disponible) { alert(chequeo.mensaje); return; }

    let payload = {
      ci: ciVotante,
      telefono: tel,
      tercera_edad: terceraEdad,
      activo: true,
    };

    if (role === "dirigente") {
      payload = {
        ...payload,
        asignado_por: normalizeCI(currentUser.ci),
        asignado_por_rol: "dirigente",
        asignado_por_nombre: `${currentUser.nombre} ${currentUser.apellido || ""}`.trim(),
        dirigente_ci: normalizeCI(currentUser.ci),
        coordinador_ci: null,
      };
    } else if (role === "coordinador") {
      const miCoord = estructura.coordinadores.find(
        (c) => normalizeCI(c.ci) === normalizeCI(currentUser.ci)
      );
      payload = {
        ...payload,
        asignado_por: normalizeCI(currentUser.ci),
        asignado_por_rol: "coordinador",
        asignado_por_nombre: `${currentUser.nombre} ${currentUser.apellido || ""}`.trim(),
        dirigente_ci: miCoord?.dirigente_ci ? normalizeCI(miCoord.dirigente_ci) : null,
        coordinador_ci: normalizeCI(currentUser.ci),
      };
    } else if (role === "subcoordinador") {
      const miSub = estructura.subcoordinadores.find(
        (s) => normalizeCI(s.ci) === normalizeCI(currentUser.ci)
      );
      const miCoord = miSub
        ? estructura.coordinadores.find(
            (c) => normalizeCI(c.ci) === normalizeCI(miSub.coordinador_ci)
          )
        : null;
      payload = {
        ...payload,
        asignado_por: normalizeCI(currentUser.ci),
        asignado_por_rol: "subcoordinador",
        asignado_por_nombre: `${currentUser.nombre} ${currentUser.apellido || ""}`.trim(),
        dirigente_ci: miCoord?.dirigente_ci ? normalizeCI(miCoord.dirigente_ci) : null,
        coordinador_ci: miSub ? normalizeCI(miSub.coordinador_ci) : null,
      };
    }

    const { error } = await supabase.from("votantes").insert(payload);
    if (error) { alert("Error al agregar votante: " + error.message); return; }
    setShowAddModal(false);
    await cargarEstructura();
  }, [currentUser, estructura, cargarEstructura, verificarCIDisponible]);



  // ======================= AGREGAR COORDINADOR (SUPERADMIN) =======================
  // Recibe { persona, dirigenteCI } desde ModalAgregarCoordinador
  const handleAddCoordinadorSuperadmin = useCallback(async ({ persona, dirigenteCI }) => {
    if (!dirigenteCI) { alert("Debe seleccionar un dirigente."); return; }
    const ciCoord = normalizeCI(persona.ci);
    const chequeo = await verificarCIDisponible(ciCoord);
    if (!chequeo.disponible) { alert(chequeo.mensaje); return; }
    let loginCode;
    try { loginCode = await generarAccessCodeUnico(supabase); }
    catch (err) { alert(err.message); return; }
    const payload = {
      ci: ciCoord,
      dirigente_ci: normalizeCI(dirigenteCI),
      asignado_por_ci: null,
      asignado_por_rol: "superadmin",
      asignado_por_nombre: `${currentUser.nombre} ${currentUser.apellido || ""}`.trim(),
      login_code: loginCode,
      activo: true,
    };
    const { data, error } = await supabase.from("coordinadores").insert(payload).select().single();
    if (error) { alert("Error al agregar coordinador: " + error.message); return; }
    const savedCode = data?.login_code || loginCode;
    alert(`Coordinador agregado. Código de acceso: ${savedCode}`);
    setShowAgregarCoord(false);
    await cargarEstructura();
  }, [currentUser, cargarEstructura, verificarCIDisponible]);

  // ======================= AGREGAR COORDINADOR (DIRIGENTE vía ModalAgregarCoordinador) =======================
  const handleAddCoordinadorDesdeModal = useCallback(async ({ persona, dirigenteCI }) => {
    const ciCoord = normalizeCI(persona.ci);
    const chequeo = await verificarCIDisponible(ciCoord);
    if (!chequeo.disponible) { alert(chequeo.mensaje); return; }
    let loginCode;
    try { loginCode = await generarAccessCodeUnico(supabase); }
    catch (err) { alert(err.message); return; }
    const payload = {
      ci: ciCoord,
      dirigente_ci: normalizeCI(dirigenteCI || currentUser.ci),
      asignado_por_ci: normalizeCI(currentUser.ci),
      asignado_por_rol: "dirigente",
      asignado_por_nombre: `${currentUser.nombre} ${currentUser.apellido || ""}`.trim(),
      login_code: loginCode,
      activo: true,
    };
    const { data, error } = await supabase.from("coordinadores").insert(payload).select().single();
    if (error) { alert("Error al agregar coordinador: " + error.message); return; }
    const savedCode = data?.login_code || loginCode;
    alert(`Coordinador agregado. Código de acceso: ${savedCode}`);
    setShowAgregarCoord(false);
    await cargarEstructura();
  }, [currentUser, cargarEstructura, verificarCIDisponible]);

  // ======================= AGREGAR SUBCOORDINADOR (SUPERADMIN/COORDINADOR) =======================
  const handleAddSubcoordinador = useCallback(async (persona) => {
    const ciSub = normalizeCI(persona.ci);
    const chequeo = await verificarCIDisponible(ciSub);
    if (!chequeo.disponible) { alert(chequeo.mensaje); return; }
    let loginCode;
    try { loginCode = await generarAccessCodeUnico(supabase); }
    catch (err) { alert(err.message); return; }
    const payload = {
      ci: ciSub,
      coordinador_ci: normalizeCI(currentUser.ci),
      asignado_por_ci: normalizeCI(currentUser.ci),
      asignado_por_rol: "coordinador",
      asignado_por_nombre: `${currentUser.nombre} ${currentUser.apellido || ""}`.trim(),
      login_code: loginCode,
      activo: true,
    };
    const { data, error } = await supabase.from("subcoordinadores").insert(payload).select().single();
    if (error) { alert("Error al agregar subcoordinador: " + error.message); return; }
    const savedCode = data?.login_code || loginCode;
    alert(`Subcoordinador agregado. Código de acceso: ${savedCode}`);
    setShowAddModal(false);
    await cargarEstructura();
  }, [currentUser, cargarEstructura, verificarCIDisponible]);

  // ======================= AGREGAR DIRIGENTE (SUPERADMIN) =======================
  const handleAgregarDirigenteDesdePadron = useCallback(async (persona) => {
    const ciDir = normalizeCI(persona.ci);
    const chequeo = await verificarCIDisponible(ciDir);
    if (!chequeo.disponible) { alert(chequeo.mensaje); return null; }
    let loginCode;
    try { loginCode = await generarAccessCodeUnico(supabase); }
    catch (err) { alert(err.message); return null; }
    const payload = {
      ci: ciDir,
      nombre: persona.nombre || "",
      apellido: persona.apellido || "",
      telefono: persona.telefono || null,
      direccion_override: persona.direccion_override || null,
      login_code: loginCode,
      es_externo: false,
      activo: true,
      asignado_por_nombre: `${currentUser.nombre} ${currentUser.apellido || ""}`.trim(),
    };
    const { data, error } = await supabase.from("dirigentes").insert(payload).select().single();
    if (error) { alert("Error al agregar dirigente: " + error.message); return null; }
    setShowAgregarDirigente(false);
    await cargarEstructura();
    return data?.login_code || loginCode;
  }, [currentUser, cargarEstructura, verificarCIDisponible]);

  const handleAgregarDirigenteExterno = useCallback(async (datos) => {
    const ciDir = normalizeCI(datos.ci);
    const chequeo = await verificarCIDisponible(ciDir);
    if (!chequeo.disponible) { alert(chequeo.mensaje); return null; }
    let loginCode;
    try { loginCode = await generarAccessCodeUnico(supabase); }
    catch (err) { alert(err.message); return null; }
    const payload = {
      ci: ciDir,
      nombre: datos.nombre,
      apellido: datos.apellido || "",
      telefono: datos.telefono || null,
      direccion_override: datos.direccion_override || null,
      login_code: loginCode,
      es_externo: true,
      activo: true,
      asignado_por_nombre: `${currentUser.nombre} ${currentUser.apellido || ""}`.trim(),
    };
    const { data, error } = await supabase.from("dirigentes").insert(payload).select().single();
    if (error) { alert("Error al agregar dirigente externo: " + error.message); return null; }
    await cargarEstructura();
    return data?.login_code || loginCode;
  }, [currentUser, cargarEstructura, verificarCIDisponible]);

  // ======================= HANDLER GENERAL ADD =======================
  // Coordinadores van por ModalAgregarCoordinador; aquí solo votante y subcoordinador
  const handleAddPersona = useCallback(
    (persona) => {
      if (addModalTipo === "votante") return handleAddVotante(persona);
      if (addModalTipo === "subcoordinador") return handleAddSubcoordinador(persona);
    },
    [addModalTipo, handleAddVotante, handleAddSubcoordinador]
  );

  // ======================= BÚSQUEDA =======================
  const normalize = (text) =>
    (text || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = normalize(searchQuery);
    const match = (p) => {
      const full = normalize(`${p.nombre || ""} ${p.apellido || ""}`);
      const ci = String(p.ci || "");
      return ci.includes(q) || full.includes(q.split(" ").filter(Boolean).join(" ")) ||
        q.split(" ").filter(Boolean).every((w) => full.includes(w) || ci.includes(w));
    };

    const results = [];

    if (currentUser.role === "superadmin") {
      estructura.dirigentes.filter(match).forEach((d) => results.push({ ...d, _tipo: "dirigente" }));
      estructura.coordinadores.filter(match).forEach((c) => results.push({ ...c, _tipo: "coordinador" }));
      estructura.subcoordinadores.filter(match).forEach((s) => results.push({ ...s, _tipo: "subcoordinador" }));
      estructura.votantes.filter(match).forEach((v) => results.push({ ...v, _tipo: "votante" }));
    } else if (currentUser.role === "dirigente") {
      const miCI = normalizeCI(currentUser.ci);
      const misCoords = getCoordsDeDigente(estructura, miCI);
      const misSubs = getSubsDeDigente(estructura, miCI);
      const todosVots = getTodosVotantesDirigente(estructura, miCI);
      misCoords.filter(match).forEach((c) => results.push({ ...c, _tipo: "coordinador" }));
      misSubs.filter(match).forEach((s) => results.push({ ...s, _tipo: "subcoordinador" }));
      todosVots.filter(match).forEach((v) => results.push({ ...v, _tipo: "votante" }));
    } else if (currentUser.role === "coordinador") {
      const miCI = normalizeCI(currentUser.ci);
      getMisSubcoordinadores(estructura, miCI).filter(match).forEach((s) => results.push({ ...s, _tipo: "subcoordinador" }));
      getMisVotantes(estructura, miCI).filter(match).forEach((v) => results.push({ ...v, _tipo: "votante" }));
    } else if (currentUser.role === "subcoordinador") {
      const miCI = normalizeCI(currentUser.ci);
      getVotantesDeSubcoord(estructura, miCI).filter(match).forEach((v) => results.push({ ...v, _tipo: "votante" }));
    }

    return results;
  }, [searchQuery, currentUser, estructura]);

  // ======================= PDF =======================
  const handlePDF = useCallback(async () => {
    try {
      if (currentUser.role === "superadmin") {
        await generateSuperadminPDF(estructura);
      } else if (currentUser.role === "coordinador") {
        const miCI = normalizeCI(currentUser.ci);
        const misSubs = getMisSubcoordinadores(estructura, miCI);
        const misVotantes = getMisVotantes(estructura, miCI);
        await generateCoordinadorPDF(currentUser, misSubs, misVotantes);
      } else if (currentUser.role === "subcoordinador") {
        const miCI = normalizeCI(currentUser.ci);
        const misVotantes = getVotantesDeSubcoord(estructura, miCI);
        await generateSubcoordinadorPDF(currentUser, misVotantes);
      }
    } catch (err) {
      alert("Error generando PDF: " + err.message);
    }
  }, [currentUser, estructura]);

  // ======================= EXPAND TOGGLE =======================
  const toggleDir = (ci) => setExpandedDirs((prev) => ({ ...prev, [ci]: !prev[ci] }));
  const toggleCoord = (ci) => setExpandedCoords((prev) => ({ ...prev, [ci]: !prev[ci] }));
  const toggleSub = (ci) => setExpandedSubs((prev) => ({ ...prev, [ci]: !prev[ci] }));

  // ======================= RENDER HELPERS =======================
  const rolLabel = {
    superadmin: "Superadmin",
    dirigente: "Dirigente",
    coordinador: "Coordinador",
    subcoordinador: "Subcoordinador",
  }[currentUser.role] || currentUser.role;

  // ======================= VISTA SUPERADMIN =======================
  const renderSuperadmin = () => {
    const stats = estadisticas || {};
    return (
      <div className="space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <StatCard label="Dirigentes" value={stats.dirigentes} icon={Shield} accent />
          <StatCard label="Coordinadores" value={stats.coordinadores} icon={Users} />
          <StatCard label="Subcoords" value={stats.subcoordinadores} icon={Users} />
          <StatCard label="Votantes" value={stats.votantes} icon={CheckCircle2} />
          <VoteProgressCard
            confirmed={stats.totalConfirmados}
            total={stats.totalConfirmable}
            percentage={stats.porcentajeConfirmados}
          />
        </div>

        {/* Botones de accion */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowAgregarDirigente(true)}
            className="inline-flex items-center gap-2 px-4 h-9 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-medium border-0 transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            Agregar Dirigente
          </button>
          <button
            onClick={() => setShowAgregarCoord(true)}
            className="inline-flex items-center gap-2 px-4 h-9 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-medium transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            Agregar Coordinador
          </button>
          <button
            onClick={handlePDF}
            className="inline-flex items-center gap-2 px-4 h-9 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-medium transition-colors"
          >
            <FileText className="w-4 h-4" />
            Descargar PDF
          </button>
        </div>

        {/* Árbol de dirigentes */}
        <div className="space-y-3">
          {estructura.dirigentes.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-8">No hay dirigentes registrados.</p>
          )}
          {estructura.dirigentes.map((dir) => {
            const dirCI = normalizeCI(dir.ci);
            const isExpandedDir = expandedDirs[dirCI];
            const coordsDir = getCoordsDeDigente(estructura, dirCI);
            const votsDirectosDir = getVotantesDirectosDirigente(estructura, dirCI);
            const totalDir = coordsDir.length + getSubsDeDigente(estructura, dirCI).length + getTodosVotantesDirigente(estructura, dirCI).length;

            return (
              <div key={dirCI} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-card">
                {/* Cabecera dirigente */}
                <div
                  className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors"
                  onClick={() => toggleDir(dirCI)}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="p-2 bg-brand-100 rounded-lg shrink-0">
                      <Shield className="w-4 h-4 text-brand-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-slate-800 text-sm">
                          {dir.nombre} {dir.apellido || ""}
                        </p>
                        <Badge variant="purple">Dirigente</Badge>
                        {dir.es_externo && <span className="text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">Externo</span>}
                        <VoteCounter confirmed={coordsDir.length} total={totalDir} />
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">CI: {dir.ci}</p>
                      {/* Datos electorales — solo si no es externo */}
                      {!dir.es_externo && (dir.seccional || dir.local_votacion || dir.mesa || dir.orden) && (
                        <p className="text-xs text-slate-400 mt-0.5">
                          {[
                            dir.seccional && `Secc: ${dir.seccional}`,
                            dir.local_votacion && `Local: ${dir.local_votacion}`,
                            dir.mesa && `Mesa: ${dir.mesa}`,
                            dir.orden && `Orden: ${dir.orden}`,
                          ].filter(Boolean).join(" · ")}
                        </p>
                      )}
                      {/* Teléfono y ubicación */}
                      {(dir.telefono || dir.direccion_override) && (
                        <p className="text-xs text-slate-400 mt-0.5">
                          {[
                            dir.telefono && `Tel: ${dir.telefono}`,
                            dir.direccion_override && `Ubic: ${dir.direccion_override.length > 30 ? dir.direccion_override.slice(0, 30) + "…" : dir.direccion_override}`,
                          ].filter(Boolean).join(" · ")}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* Botones de edición de contacto */}
                    <ActionBtn
                      onClick={(e) => { e.stopPropagation(); handleOpenTelefono("dirigente", dir); }}
                      title="Editar telefono"
                      variant="green"
                    >
                      <Phone className="w-3.5 h-3.5" />
                    </ActionBtn>
                    <ActionBtn
                      onClick={(e) => { e.stopPropagation(); handleOpenDireccion("dirigente", dir); }}
                      title="Editar ubicacion"
                      variant="blue"
                    >
                      <MapPin className="w-3.5 h-3.5" />
                    </ActionBtn>
                    {/* Botón abrir ubicación si existe */}
                    {dir.direccion_override && (
                      <ActionBtn
                        onClick={(e) => {
                          e.stopPropagation();
                          const url = /^https?:\/\//i.test(dir.direccion_override)
                            ? dir.direccion_override
                            : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(dir.direccion_override)}`;
                          window.open(url, "_blank", "noopener,noreferrer");
                        }}
                        title="Abrir ubicacion"
                        variant="default"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </ActionBtn>
                    )}
                    {/* Código de acceso */}
                    {dir.login_code ? (
                      <>
                        <span className="text-xs font-mono text-slate-500 hidden md:inline select-all">{dir.login_code}</span>
                        <ActionBtn
                          onClick={(e) => { e.stopPropagation(); handleCopy(dir.login_code); }}
                          title="Copiar codigo de acceso"
                        >
                          {copiedCode === dir.login_code ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        </ActionBtn>
                      </>
                    ) : (
                      <button
                        disabled={generandoAcceso === dir.ci}
                        onClick={(e) => { e.stopPropagation(); handleGenerarAcceso("dirigentes", dir.ci); }}
                        className="text-xs px-2 py-1 rounded-md border border-amber-300 text-amber-700 hover:bg-amber-50 transition-colors bg-transparent shadow-none disabled:opacity-50"
                      >
                        {generandoAcceso === dir.ci ? "Generando..." : "Generar acceso"}
                      </button>
                    )}
                    {isExpandedDir ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                  </div>
                </div>

                {/* Contenido expandido del dirigente */}
                {isExpandedDir && (
                  <div className="border-t border-slate-100 bg-slate-50 px-4 py-3 space-y-3">
                    {/* Coordinadores del dirigente */}
                    {coordsDir.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Coordinadores</p>
                        {coordsDir.map((coord) => {
                          const coordCI = normalizeCI(coord.ci);
                          const isExpandedCoord = expandedCoords[coordCI];
                          const misSubs = getMisSubcoordinadores(estructura, coordCI);
                          const misVots = getMisVotantes(estructura, coordCI);

                          return (
                            <div key={coordCI} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                              <div
                                className="flex items-center justify-between px-3 py-2.5 cursor-pointer hover:bg-slate-50"
                                onClick={() => toggleCoord(coordCI)}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <DatosPersona
                                    persona={coord}
                                    rol="Coordinador"
                                    loginCode={coord.login_code}
                                    onCopy={handleCopy}
                                    tablaAcceso="coordinadores"
                                    onGenerarAcceso={handleGenerarAcceso}
                                    generandoAcceso={generandoAcceso}
                                    esSuperadmin={currentUser.role === "superadmin"}
                                    counter={<VoteCounter confirmed={misVots.filter((v) => v.voto_confirmado).length} total={misVots.length} />}
                                  />
                                </div>
                                <div className="shrink-0 ml-2">
                                  {isExpandedCoord ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                                </div>
                              </div>
                              {isExpandedCoord && (
                                <div className="border-t border-slate-100 bg-slate-50 px-3 py-2 space-y-2">
                                  {/* Subcoordinadores */}
                                  {misSubs.map((sub) => {
                                    const subCI = normalizeCI(sub.ci);
                                    const isExpandedSub = expandedSubs[subCI];
                                    const votsDeEste = getVotantesDeSubcoord(estructura, subCI);
                                    return (
                                      <div key={subCI} className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                                        <div
                                          className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-slate-50"
                                          onClick={() => toggleSub(subCI)}
                                        >
                                          <DatosPersona
                                            persona={sub}
                                            rol="Subcoord"
                                            loginCode={sub.login_code}
                                            onCopy={handleCopy}
                                            tablaAcceso="subcoordinadores"
                                            onGenerarAcceso={handleGenerarAcceso}
                                            generandoAcceso={generandoAcceso}
                                            esSuperadmin={currentUser.role === "superadmin"}
                                            counter={<VoteCounter confirmed={votsDeEste.filter((v) => v.voto_confirmado).length} total={votsDeEste.length} />}
                                          />
                                          <div className="shrink-0 ml-2">
                                            {isExpandedSub ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                                          </div>
                                        </div>
                                        {isExpandedSub && votsDeEste.length > 0 && (
                                          <div className="border-t border-slate-100 bg-slate-50 px-3 py-2 space-y-1.5">
                                            {votsDeEste.map((v) => (
                                              <VotanteRow
                                                key={v.ci}
                                                v={v}
                                                onTelefono={handleOpenTelefono}
                                                onDireccion={handleOpenDireccion}
                                                onConfirmar={handleConfirmar}
                                                onAnular={handleAnular}
                                                canConfirmar={canConfirmar}
                                                canAnular={canAnular}
                                              />
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                  {/* Votantes directos del coord */}
                                  {getVotantesDirectosCoord(estructura, coordCI).map((v) => (
                                    <VotanteRow
                                      key={v.ci}
                                      v={v}
                                      onTelefono={handleOpenTelefono}
                                      onDireccion={handleOpenDireccion}
                                      onConfirmar={handleConfirmar}
                                      onAnular={handleAnular}
                                      canConfirmar={canConfirmar}
                                      canAnular={canAnular}
                                    />
                                  ))}
                                  {misSubs.length === 0 && misVots.length === 0 && (
                                    <p className="text-xs text-slate-400 py-2">Sin subcoordinadores ni votantes.</p>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Votantes directos del dirigente */}
                    {votsDirectosDir.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Votantes directos</p>
                        {votsDirectosDir.map((v) => (
                          <VotanteRow
                            key={v.ci}
                            v={v}
                            onTelefono={handleOpenTelefono}
                            onDireccion={handleOpenDireccion}
                            onConfirmar={handleConfirmar}
                            onAnular={handleAnular}
                            canConfirmar={canConfirmar}
                            canAnular={canAnular}
                          />
                        ))}
                      </div>
                    )}

                    {coordsDir.length === 0 && votsDirectosDir.length === 0 && (
                      <p className="text-xs text-slate-400 py-2">Sin estructura asignada.</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Coordinadores sin dirigente */}
          {estructura.coordinadores.filter((c) => !c.dirigente_ci).length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Coordinadores sin dirigente</p>
              <div className="space-y-2">
                {estructura.coordinadores.filter((c) => !c.dirigente_ci).map((coord) => {
                  const coordCI = normalizeCI(coord.ci);
                  const isExpandedCoord = expandedCoords[coordCI];
                  const misSubs = getMisSubcoordinadores(estructura, coordCI);
                  const misVots = getMisVotantes(estructura, coordCI);

                  return (
                    <div key={coordCI} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-card">
                      <div
                        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-slate-50"
                        onClick={() => toggleCoord(coordCI)}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <DatosPersona
                            persona={coord}
                            rol="Coordinador"
                            loginCode={coord.login_code}
                            onCopy={handleCopy}
                            tablaAcceso="coordinadores"
                            onGenerarAcceso={handleGenerarAcceso}
                            generandoAcceso={generandoAcceso}
                            esSuperadmin={currentUser.role === "superadmin"}
                            counter={<VoteCounter confirmed={misVots.filter((v) => v.voto_confirmado).length} total={misVots.length} />}
                          />
                        </div>
                        <div className="shrink-0 ml-2">
                          {isExpandedCoord ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                        </div>
                      </div>
                      {isExpandedCoord && (
                        <div className="border-t border-slate-100 bg-slate-50 px-4 py-3 space-y-2">
                          {misSubs.map((sub) => {
                            const subCI = normalizeCI(sub.ci);
                            const isExpandedSub = expandedSubs[subCI];
                            const votsDeEste = getVotantesDeSubcoord(estructura, subCI);
                            return (
                              <div key={subCI} className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                                <div
                                  className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-slate-50"
                                  onClick={() => toggleSub(subCI)}
                                >
                                  <DatosPersona
                                    persona={sub}
                                    rol="Subcoord"
                                    loginCode={sub.login_code}
                                    onCopy={handleCopy}
                                    tablaAcceso="subcoordinadores"
                                    onGenerarAcceso={handleGenerarAcceso}
                                    generandoAcceso={generandoAcceso}
                                    esSuperadmin={currentUser.role === "superadmin"}
                                    counter={<VoteCounter confirmed={votsDeEste.filter((v) => v.voto_confirmado).length} total={votsDeEste.length} />}
                                  />
                                  <div className="shrink-0 ml-2">
                                    {isExpandedSub ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                                  </div>
                                </div>
                                {isExpandedSub && votsDeEste.length > 0 && (
                                  <div className="border-t border-slate-100 bg-slate-50 px-3 py-2 space-y-1.5">
                                    {votsDeEste.map((v) => (
                                      <VotanteRow
                                        key={v.ci}
                                        v={v}
                                        onTelefono={handleOpenTelefono}
                                        onDireccion={handleOpenDireccion}
                                        onConfirmar={handleConfirmar}
                                        onAnular={handleAnular}
                                        canConfirmar={canConfirmar}
                                        canAnular={canAnular}
                                      />
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                          {misVots.map((v) => (
                            <VotanteRow
                              key={v.ci}
                              v={v}
                              onTelefono={handleOpenTelefono}
                              onDireccion={handleOpenDireccion}
                              onConfirmar={handleConfirmar}
                              onAnular={handleAnular}
                              canConfirmar={canConfirmar}
                              canAnular={canAnular}
                            />
                          ))}
                          {misSubs.length === 0 && misVots.length === 0 && (
                            <p className="text-xs text-slate-400 py-2">Sin estructura asignada.</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // ======================= VISTA DIRIGENTE =======================
  const renderDirigente = () => {
    const miCI = normalizeCI(currentUser.ci);
    const stats = estadisticas || {};
    const misCoords = getCoordsDeDigente(estructura, miCI);
    const votsDirectosMios = getVotantesDirectosDirigente(estructura, miCI);

    return (
      <div className="space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <StatCard label="Coordinadores" value={stats.coordinadores} icon={Users} accent />
          <StatCard label="Subcoords" value={stats.subcoordinadores} icon={Users} />
          <StatCard label="Mis Votantes" value={stats.votantesDirectos} icon={CheckCircle2} />
          <StatCard label="Total Red" value={stats.totalRed} icon={TrendingUp} />
        </div>

        {/* Botones */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowAgregarCoord(true)}
            className="inline-flex items-center gap-2 px-4 h-9 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-medium border-0 transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            Agregar Coordinador
          </button>
          <button
            onClick={() => { setAddModalTipo("votante"); setShowAddModal(true); }}
            className="inline-flex items-center gap-2 px-4 h-9 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-medium transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            Agregar Votante
          </button>
        </div>

        {/* Coordinadores */}
        <div className="space-y-3">
          <p className="text-sm font-semibold text-slate-700">Mis Coordinadores ({misCoords.length})</p>
          {misCoords.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-8">No tiene coordinadores asignados.</p>
          )}
          {misCoords.map((coord) => {
            const coordCI = normalizeCI(coord.ci);
            const isExpandedCoord = expandedCoords[coordCI];
            const misSubs = getMisSubcoordinadores(estructura, coordCI);
            const misVots = getMisVotantes(estructura, coordCI);

            return (
              <div key={coordCI} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-card">
                <div
                  className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-slate-50"
                  onClick={() => toggleCoord(coordCI)}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <DatosPersona
                      persona={coord}
                      rol="Coordinador"
                      loginCode={coord.login_code}
                      onCopy={handleCopy}
                      tablaAcceso="coordinadores"
                      onGenerarAcceso={handleGenerarAcceso}
                      generandoAcceso={generandoAcceso}
                      esSuperadmin={currentUser.role === "superadmin"}
                      counter={<VoteCounter confirmed={misVots.filter((v) => v.voto_confirmado).length} total={misVots.length} />}
                    />
                  </div>
                  <div className="shrink-0 ml-2">
                    {isExpandedCoord ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                  </div>
                </div>
                {isExpandedCoord && (
                  <div className="border-t border-slate-100 bg-slate-50 px-4 py-3 space-y-2">
                    {misSubs.map((sub) => {
                      const subCI = normalizeCI(sub.ci);
                      const isExpandedSub = expandedSubs[subCI];
                      const votsDeEste = getVotantesDeSubcoord(estructura, subCI);
                      return (
                        <div key={subCI} className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                          <div
                            className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-slate-50"
                            onClick={() => toggleSub(subCI)}
                          >
                            <DatosPersona
                              persona={sub}
                              rol="Subcoord"
                              loginCode={sub.login_code}
                              onCopy={handleCopy}
                              tablaAcceso="subcoordinadores"
                              onGenerarAcceso={handleGenerarAcceso}
                              generandoAcceso={generandoAcceso}
                              esSuperadmin={currentUser.role === "superadmin"}
                              counter={<VoteCounter confirmed={votsDeEste.filter((v) => v.voto_confirmado).length} total={votsDeEste.length} />}
                            />
                            <div className="shrink-0 ml-2">
                              {isExpandedSub ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                            </div>
                          </div>
                          {isExpandedSub && votsDeEste.length > 0 && (
                            <div className="border-t border-slate-100 bg-slate-50 px-3 py-2 space-y-1.5">
                              {votsDeEste.map((v) => (
                                <VotanteRow
                                  key={v.ci}
                                  v={v}
                                  onTelefono={handleOpenTelefono}
                                  onDireccion={handleOpenDireccion}
                                  onConfirmar={handleConfirmar}
                                  onAnular={handleAnular}
                                  canConfirmar={canConfirmar}
                                  canAnular={canAnular}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {misVots.map((v) => (
                      <VotanteRow
                        key={v.ci}
                        v={v}
                        onTelefono={handleOpenTelefono}
                        onDireccion={handleOpenDireccion}
                        onConfirmar={handleConfirmar}
                        onAnular={handleAnular}
                        canConfirmar={canConfirmar}
                        canAnular={canAnular}
                      />
                    ))}
                    {misSubs.length === 0 && misVots.length === 0 && (
                      <p className="text-xs text-slate-400 py-2">Sin estructura asignada.</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Votantes directos del dirigente */}
        {votsDirectosMios.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-700">Mis Votantes Directos ({votsDirectosMios.length})</p>
            {votsDirectosMios.map((v) => (
              <VotanteRow
                key={v.ci}
                v={v}
                onTelefono={handleOpenTelefono}
                onDireccion={handleOpenDireccion}
                onConfirmar={handleConfirmar}
                onAnular={handleAnular}
                canConfirmar={canConfirmar}
                canAnular={canAnular}
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  // ======================= VISTA COORDINADOR =======================
  const renderCoordinador = () => {
    const miCI = normalizeCI(currentUser.ci);
    const stats = estadisticas || {};
    // Pasar miCI (string) directamente — los helpers ahora aceptan CI string o objeto
    const misSubs = getMisSubcoordinadores(estructura, miCI);
    const misVotantesDirectos = getMisVotantes(estructura, miCI);

    return (
      <div className="space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <StatCard label="Subcoords" value={stats.subcoordinadores ?? misSubs.length} icon={Users} accent />
          <StatCard label="Votantes" value={stats.totalVotantes ?? misVotantesDirectos.length} icon={CheckCircle2} />
          <VoteProgressCard
            confirmed={stats.votosConfirmados ?? 0}
            total={stats.totalVotantes ?? misVotantesDirectos.length}
            percentage={stats.porcentajeConfirmados ?? 0}
          />
          <StatCard label="Total Red" value={stats.totalRed ?? (misSubs.length + misVotantesDirectos.length)} icon={TrendingUp} />
        </div>

        {/* Botones */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => { setAddModalTipo("subcoordinador"); setShowAddModal(true); }}
            className="inline-flex items-center gap-2 px-4 h-9 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-medium border-0 transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            Agregar Subcoordinador
          </button>
          <button
            onClick={() => { setAddModalTipo("votante"); setShowAddModal(true); }}
            className="inline-flex items-center gap-2 px-4 h-9 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-medium transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            Agregar Votante
          </button>
          <button
            onClick={handlePDF}
            className="inline-flex items-center gap-2 px-4 h-9 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-medium transition-colors"
          >
            <FileText className="w-4 h-4" />
            Descargar PDF
          </button>
        </div>

        {/* Subcoordinadores */}
        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-700">Mis Subcoordinadores ({misSubs.length})</p>
          {misSubs.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-6">No tiene subcoordinadores asignados.</p>
          )}
          {misSubs.map((sub) => {
            const subCI = normalizeCI(sub.ci);
            const isExpandedSub = expandedSubs[subCI];
            const votsDeEste = getVotantesDeSubcoord(estructura, subCI);

            return (
              <div key={subCI} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-card">
                <div
                  className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-slate-50"
                  onClick={() => toggleSub(subCI)}
                >
                  <div className="flex-1 min-w-0">
                    <DatosPersona
                      persona={sub}
                      rol="Subcoordinador"
                      loginCode={sub.login_code}
                      onCopy={handleCopy}
                      tablaAcceso="subcoordinadores"
                      onGenerarAcceso={handleGenerarAcceso}
                      generandoAcceso={generandoAcceso}
                      esSuperadmin={currentUser.role === "superadmin"}
                      counter={<VoteCounter confirmed={votsDeEste.filter((v) => v.voto_confirmado).length} total={votsDeEste.length} />}
                    />
                  </div>
                  <div className="shrink-0 ml-2">
                    {isExpandedSub ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                  </div>
                </div>
                {isExpandedSub && (
                  <div className="border-t border-slate-100 bg-slate-50 px-4 py-3 space-y-1.5">
                    {votsDeEste.length === 0 ? (
                      <p className="text-xs text-slate-400 py-2">Sin votantes asignados.</p>
                    ) : (
                      votsDeEste.map((v) => (
                        <VotanteRow
                          key={v.ci}
                          v={v}
                          onTelefono={handleOpenTelefono}
                          onDireccion={handleOpenDireccion}
                          onConfirmar={handleConfirmar}
                          onAnular={handleAnular}
                          canConfirmar={canConfirmar}
                          canAnular={canAnular}
                        />
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Votantes directos del coordinador — siempre visible */}
        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-700">
            Mis Votantes Directos ({misVotantesDirectos.length})
          </p>
          {misVotantesDirectos.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">No tiene votantes directos asignados.</p>
          ) : (
            misVotantesDirectos.map((v) => (
              <VotanteRow
                key={v.ci}
                v={v}
                onTelefono={handleOpenTelefono}
                onDireccion={handleOpenDireccion}
                onConfirmar={handleConfirmar}
                onAnular={handleAnular}
                canConfirmar={canConfirmar}
                canAnular={canAnular}
              />
            ))
          )}
        </div>
      </div>
    );
  };

  // ======================= VISTA SUBCOORDINADOR =======================
  const renderSubcoordinador = () => {
    const miCI = normalizeCI(currentUser.ci);
    const stats = estadisticas || {};
    const misVotantes = getVotantesDeSubcoord(estructura, miCI);

    return (
      <div className="space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatCard label="Mis Votantes" value={stats.votantes} icon={CheckCircle2} accent />
          <VoteProgressCard
            confirmed={stats.votosConfirmados}
            total={stats.votantes}
            percentage={stats.porcentajeConfirmados}
          />
          <StatCard label="Pendientes" value={stats.votosPendientes} icon={Clock} />
        </div>

        {/* Botones */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => { setAddModalTipo("votante"); setShowAddModal(true); }}
            className="inline-flex items-center gap-2 px-4 h-9 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-medium border-0 transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            Agregar Votante
          </button>
          <button
            onClick={handlePDF}
            className="inline-flex items-center gap-2 px-4 h-9 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-medium transition-colors"
          >
            <FileText className="w-4 h-4" />
            Descargar PDF
          </button>
        </div>

        {/* Votantes */}
        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-700">Mis Votantes ({misVotantes.length})</p>
          {misVotantes.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">No tiene votantes asignados.</p>
          ) : (
            misVotantes.map((v) => (
              <VotanteRow
                key={v.ci}
                v={v}
                onTelefono={handleOpenTelefono}
                onDireccion={handleOpenDireccion}
                onConfirmar={handleConfirmar}
                onAnular={handleAnular}
                canConfirmar={canConfirmar}
                canAnular={canAnular}
              />
            ))
          )}
        </div>
      </div>
    );
  };

  // ======================= RENDER SEARCH RESULTS =======================
  const renderSearchResults = () => {
    if (searchResults.length === 0) {
      return (
        <div className="text-center py-16">
          <Search className="w-10 h-10 text-slate-200 mx-auto mb-3" />
          <p className="text-sm text-slate-400">No se encontraron resultados.</p>
        </div>
      );
    }
    return (
      <div className="space-y-2">
        <p className="text-xs text-slate-500 mb-3">{searchResults.length} resultado{searchResults.length !== 1 ? "s" : ""}</p>
        {searchResults.map((r) => (
          <div key={`${r._tipo}-${r.ci}`} className="bg-white border border-slate-200 rounded-xl p-3 shadow-card">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <DatosPersona persona={r} rol={null} />
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <Badge variant={r._tipo === "votante" ? "blue" : r._tipo === "coordinador" ? "purple" : r._tipo === "dirigente" ? "amber" : "default"}>
                    {r._tipo.charAt(0).toUpperCase() + r._tipo.slice(1)}
                  </Badge>
                  {r.voto_confirmado && <Badge variant="green"><Check className="w-3 h-3 mr-1" />Confirmado</Badge>}
                  {r.tercera_edad === true && <TerceraEdadBadge />}
                </div>
              </div>
              {r._tipo === "votante" && (
                <div className="flex gap-1.5 shrink-0">
                  {!r.voto_confirmado && canConfirmar(r) && (
                    <ActionBtn onClick={() => handleConfirmar(r)} title="Confirmar voto" variant="success-solid">
                      <Check className="w-3.5 h-3.5" />
                    </ActionBtn>
                  )}
                  {r.voto_confirmado && canAnular(r) && (
                    <ActionBtn onClick={() => handleAnular(r)} title="Anular confirmacion" variant="danger">
                      <X className="w-3.5 h-3.5" />
                    </ActionBtn>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };

  // ======================= MAIN RENDER =======================
  return (
    <div className="min-h-screen bg-slate-50">
      {/* HEADER */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-1.5 bg-brand-600 rounded-lg shrink-0">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-slate-800 text-sm truncate">
                {currentUser.nombre} {currentUser.apellido || ""}
              </p>
              <p className="text-xs text-slate-500">{rolLabel}</p>
            </div>
          </div>

          {/* Search */}
          <div className={`flex-1 max-w-xs transition-all ${searchActive ? "max-w-sm" : ""}`}>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                placeholder="Buscar..."
                onFocus={() => setSearchActive(true)}
                onBlur={() => { if (!searchQuery) setSearchActive(false); }}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-8 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-slate-50"
              />
              {searchQuery && (
                <button
                  onClick={() => { setSearchQuery(""); setSearchActive(false); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0 bg-transparent border-0 shadow-none text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Reload */}
          <button
            onClick={cargarEstructura}
            title="Actualizar datos"
            className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg border-0 bg-transparent shadow-none transition-colors shrink-0"
          >
            <TrendingUp className="w-4 h-4" />
          </button>

          {/* Logout */}
          <button
            onClick={onLogout}
            title="Cerrar sesion"
            className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg border-0 bg-transparent shadow-none transition-colors shrink-0"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* CONTENT */}
      <main className="max-w-5xl mx-auto px-4 py-5">
        {loading ? (
          <div className="text-center py-20">
            <div className="w-8 h-8 border-2 border-brand-200 border-t-brand-600 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-slate-400">Cargando datos...</p>
          </div>
        ) : estructuraError ? (
          <div className="text-center py-20">
            <p className="text-sm font-semibold text-red-600 mb-1">No se pudo cargar la estructura</p>
            <p className="text-xs text-slate-400 mb-4 max-w-md mx-auto">{estructuraError}</p>
            <button
              onClick={() => cargarEstructura()}
              className="px-4 h-9 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-medium border-0 transition-colors"
            >
              Reintentar
            </button>
          </div>
        ) : searchQuery.trim() ? (
          renderSearchResults()
        ) : currentUser.role === "superadmin" ? (
          renderSuperadmin()
        ) : currentUser.role === "dirigente" ? (
          renderDirigente()
        ) : currentUser.role === "coordinador" ? (
          renderCoordinador()
        ) : currentUser.role === "subcoordinador" ? (
          renderSubcoordinador()
        ) : null}
      </main>

      {/* MODALES */}
      <AddPersonModal
        show={showAddModal}
        onClose={() => setShowAddModal(false)}
        tipo={addModalTipo}
        onAdd={handleAddPersona}
        padron={padron}
        padronLoading={padronLoading}
        padronError={padronError}
        onRetryPadron={cargarPadron}
        disponibles={personasDisponibles}
      />

      <ModalAgregarDirigente
        show={showAgregarDirigente}
        onClose={() => setShowAgregarDirigente(false)}
        padron={padron}
        padronLoading={padronLoading}
        padronError={padronError}
        onRetryPadron={cargarPadron}
        disponibles={personasDisponibles}
        onAgregarDesdePadron={handleAgregarDirigenteDesdePadron}
        onAgregarExterno={handleAgregarDirigenteExterno}
      />

      <ModalAgregarCoordinador
        show={showAgregarCoord}
        onClose={() => setShowAgregarCoord(false)}
        onAdd={
          currentUser.role === "superadmin"
            ? handleAddCoordinadorSuperadmin
            : handleAddCoordinadorDesdeModal
        }
        padron={padron}
        padronLoading={padronLoading}
        padronError={padronError}
        onRetryPadron={cargarPadron}
        disponibles={personasDisponibles}
        dirigentes={estructura.dirigentes}
        rolActual={currentUser.role}
        dirigenteCI={currentUser.role === "dirigente" ? currentUser.ci : undefined}
      />

      {modalTelefonoState.show && (
        <ModalTelefono
          tipo={modalTelefonoState.tipo}
          persona={modalTelefonoState.persona}
          onSave={(nuevoTelefono) =>
            handleSaveTelefono(
              modalTelefonoState.tipo,
              modalTelefonoState.persona,
              nuevoTelefono
            )
          }
          onClose={() => setModalTelefonoState({ show: false, tipo: null, persona: null })}
        />
      )}

      {modalDireccionState.show && (
        <ModalDireccion
          tipo={modalDireccionState.tipo}
          persona={modalDireccionState.persona}
          onSave={(nuevaDireccion) =>
            handleSaveDireccion(
              modalDireccionState.tipo,
              modalDireccionState.persona,
              nuevaDireccion
            )
          }
          onClose={() => setModalDireccionState({ show: false, tipo: null, persona: null })}
        />
      )}

      {confirmVotoState.show && (
        <ConfirmVotoModal
          votante={confirmVotoState.votante}
          accion={confirmVotoState.accion}
          onConfirm={handleConfirmVoto}
          onClose={() => setConfirmVotoState({ show: false, votante: null, accion: null })}
        />
      )}
    </div>
  );
};

export default Dashboard;
