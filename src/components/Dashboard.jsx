import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import { generarAccessCode } from "../utils/accessCode";

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
const DatosPersona = ({ persona, rol, loginCode, onCopy, counter }) => {
  const direccionMostrar = persona.direccion_override || persona.direccion;
  const hasName = Boolean(persona.nombre);
  const displayName = hasName
    ? `${persona.nombre} ${persona.apellido || ""}`.trim()
    : "Cargando...";
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
      {loginCode && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onCopy?.(loginCode);
          }}
          className="mt-1 inline-flex items-center gap-1 px-2 py-1 rounded-md border border-brand-200 text-brand-600 text-xs hover:bg-brand-50 transition-colors bg-transparent shadow-none"
        >
          <Copy className="w-3 h-3" />
          Copiar acceso
        </button>
      )}
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
      <ActionBtn onClick={() => onTelefono("votante", v)} title="Editar telefono" variant="green">
        <Phone className="w-3.5 h-3.5" />
      </ActionBtn>
      <ActionBtn onClick={() => onDireccion("votante", v)} title="Editar direccion" variant="blue">
        <MapPin className="w-3.5 h-3.5" />
      </ActionBtn>
      {!v.voto_confirmado && canConfirmar(v) && (
        <ActionBtn onClick={() => onConfirmar(v)} title="Confirmar voto" variant="success-solid">
          <Check className="w-3.5 h-3.5" />
        </ActionBtn>
      )}
      {v.voto_confirmado && canAnular(v) && (
        <ActionBtn onClick={() => onAnular(v)} title="Anular confirmacion" variant="danger">
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
  disponibles,
  onAgregarDesdePadron,
  onAgregarExterno,
}) => {
  const [modo, setModo] = useState(null); // null | "padron" | "externo"
  const [extCI, setExtCI] = useState("");
  const [extNombre, setExtNombre] = useState("");
  const [extApellido, setExtApellido] = useState("");
  const [extTelefono, setExtTelefono] = useState("");
  const [codigoGenerado, setCodigoGenerado] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!show) {
      setModo(null);
      setExtCI("");
      setExtNombre("");
      setExtApellido("");
      setExtTelefono("");
      setCodigoGenerado(null);
      setSaving(false);
    }
  }, [show]);

  if (!show) return null;

  const handleSelectPadron = async (persona) => {
    await onAgregarDesdePadron(persona);
  };

  const handleSubmitExterno = async () => {
    const ci = String(extCI).replace(/\D/g, "");
    if (!ci) { alert("El CI es obligatorio y debe ser numerico."); return; }
    if (!extNombre.trim()) { alert("El nombre es obligatorio."); return; }
    setSaving(true);
    const code = await onAgregarExterno({
      ci,
      nombre: extNombre.trim(),
      apellido: extApellido.trim(),
      telefono: extTelefono.trim(),
    });
    setSaving(false);
    if (code) setCodigoGenerado(code);
  };

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
            <p className="text-sm text-slate-500 mt-1">
              Codigo de acceso generado. Comparta con el dirigente.
            </p>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center justify-between gap-3">
            <span className="font-mono font-bold text-xl tracking-widest text-brand-700">
              {codigoGenerado}
            </span>
            <button
              onClick={() => navigator.clipboard.writeText(codigoGenerado).catch(() => {})}
              className="flex items-center gap-1.5 px-3 h-8 border border-brand-200 rounded-lg text-xs text-brand-600 hover:bg-brand-50 transition-colors bg-transparent shadow-none"
            >
              <Copy className="w-3.5 h-3.5" />
              Copiar
            </button>
          </div>
          <button
            onClick={onClose}
            className="w-full h-10 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm font-semibold border-0 transition-colors"
          >
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
            <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg border-0 bg-transparent shadow-none">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-5 space-y-3">
            <p className="text-sm text-slate-600">Seleccione como desea agregar al dirigente:</p>
            <button
              onClick={() => setModo("padron")}
              className="w-full flex items-center gap-3 p-4 border border-slate-200 rounded-xl hover:border-brand-300 hover:bg-brand-50 transition-colors text-left bg-white"
            >
              <div className="p-2 bg-brand-100 rounded-lg shrink-0">
                <Users className="w-4 h-4 text-brand-600" />
              </div>
              <div>
                <p className="font-semibold text-sm text-slate-800">Persona del padron</p>
                <p className="text-xs text-slate-500">Buscar por CI o nombre en el padron electoral.</p>
              </div>
            </button>
            <button
              onClick={() => setModo("externo")}
              className="w-full flex items-center gap-3 p-4 border border-slate-200 rounded-xl hover:border-brand-300 hover:bg-brand-50 transition-colors text-left bg-white"
            >
              <div className="p-2 bg-slate-100 rounded-lg shrink-0">
                <UserPlus className="w-4 h-4 text-slate-600" />
              </div>
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

  // --- Vista: padron ---
  if (modo === "padron") {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-4">
        <div className="bg-white rounded-2xl w-full max-w-xl shadow-modal overflow-hidden flex flex-col max-h-[90vh] animate-fade-in">
          <PadronSearch
            disponibles={disponibles}
            onSelect={handleSelectPadron}
            titulo="Agregar Dirigente — Padron"
            placeholder="Buscar dirigente por CI, nombre o apellido..."
            onBack={() => setModo(null)}
            onClose={onClose}
          />
          <div className="px-5 py-4 border-t border-slate-100 shrink-0">
            <button onClick={onClose} className="w-full h-10 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-medium border-0">
              Cerrar
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
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg border-0 bg-transparent shadow-none">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">CI <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={extCI}
              onChange={(e) => setExtCI(e.target.value.replace(/\D/g, ""))}
              placeholder="Solo numeros"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-slate-50"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Nombre <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={extNombre}
              onChange={(e) => setExtNombre(e.target.value)}
              placeholder="Nombre del dirigente"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-slate-50"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Apellido</label>
            <input
              type="text"
              value={extApellido}
              onChange={(e) => setExtApellido(e.target.value)}
              placeholder="Apellido (opcional)"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-slate-50"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Telefono</label>
            <input
              type="tel"
              value={extTelefono}
              onChange={(e) => setExtTelefono(e.target.value)}
              placeholder="+595 9XX XXX XXX"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 bg-slate-50"
            />
          </div>
          <button
            onClick={handleSubmitExterno}
            disabled={saving}
            className="w-full h-10 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-400 text-white rounded-xl text-sm font-semibold border-0 transition-colors"
          >
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
  const [estructura, setEstructura] = useState({
    dirigentes: [],
    coordinadores: [],
    subcoordinadores: [],
    votantes: [],
  });
  const [padron, setPadron] = useState([]);
  const [padronLoaded, setPadronLoaded] = useState(false);
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

  // ======================= CARGAR ESTRUCTURA =======================
  const cargarEstructura = useCallback(async () => {
    setLoading(true);
    try {
      const [dirsRes, coordsRes, subsRes, votantesRes] = await Promise.all([
        supabase.from("dirigentes").select("*").eq("activo", true),
        supabase.from("coordinadores").select("*, padron(*)").eq("activo", true),
        supabase.from("subcoordinadores").select("*, padron(*)").eq("activo", true),
        supabase.from("votantes").select("*, padron(*)").eq("activo", true),
      ]);

      const enrich = (rows) =>
        (rows || []).map((r) => ({
          ...r,
          ci: normalizeCI(r.ci),
          nombre: r.padron?.nombre || r.nombre || "",
          apellido: r.padron?.apellido || r.apellido || "",
          seccional: r.padron?.seccional || "",
          local_votacion: r.padron?.local_votacion || "",
          mesa: r.padron?.mesa || "",
          orden: r.padron?.orden || "",
          direccion: r.padron?.direccion || "",
        }));

      const dirigentes = (dirsRes.data || []).map((d) => ({
        ...d,
        ci: normalizeCI(d.ci),
      }));

      setEstructura({
        dirigentes,
        coordinadores: enrich(coordsRes.data),
        subcoordinadores: enrich(subsRes.data),
        votantes: enrich(votantesRes.data),
      });
    } catch (err) {
      console.error("Error cargando estructura:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // ======================= CARGAR PADRÓN (INDEXEDDB) =======================
  const cargarPadron = useCallback(async () => {
    try {
      const dbReq = indexedDB.open("PadronDB", 1);
      dbReq.onsuccess = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains("padron")) {
          setPadronLoaded(true);
          return;
        }
        const tx = db.transaction("padron", "readonly");
        const store = tx.objectStore("padron");
        const req = store.getAll();
        req.onsuccess = () => {
          setPadron(req.result || []);
          setPadronLoaded(true);
        };
        req.onerror = () => setPadronLoaded(true);
      };
      dbReq.onerror = () => setPadronLoaded(true);
    } catch {
      setPadronLoaded(true);
    }
  }, []);

  useEffect(() => {
    cargarEstructura();
    cargarPadron();
  }, [cargarEstructura, cargarPadron]);

  // ======================= COPY =======================
  const handleCopy = useCallback((code) => {
    navigator.clipboard.writeText(code).catch(() => {});
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  }, []);

  // ======================= PERSONAS DISPONIBLES =======================
  const personasDisponibles = useMemo(
    () => (padronLoaded ? getPersonasDisponibles(padron, estructura) : []),
    [padron, padronLoaded, estructura]
  );

  // ======================= ESTADÍSTICAS =======================
  const estadisticas = useMemo(
    () => getEstadisticas(currentUser, estructura),
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
    if (error) { alert("Error al actualizar voto."); return; }
    setConfirmVotoState({ show: false, votante: null, accion: null });
    cargarEstructura();
  }, [confirmVotoState, cargarEstructura]);

  // ======================= MODALES TELEFONO / DIRECCION =======================
  const handleOpenTelefono = useCallback((tipo, persona) => {
    setModalTelefonoState({ show: true, tipo, persona });
  }, []);

  const handleOpenDireccion = useCallback((tipo, persona) => {
    setModalDireccionState({ show: true, tipo, persona });
  }, []);

  const handleSaveTelefono = useCallback(async (tipo, persona, nuevoTelefono) => {
    const tabla = tipo === "coordinador" ? "coordinadores" : tipo === "subcoordinador" ? "subcoordinadores" : "votantes";
    const { error } = await supabase.from(tabla).update({ telefono: nuevoTelefono }).eq("ci", persona.ci);
    if (error) { alert("Error al guardar telefono."); return; }
    setModalTelefonoState({ show: false, tipo: null, persona: null });
    cargarEstructura();
  }, [cargarEstructura]);

  const handleSaveDireccion = useCallback(async (tipo, persona, nuevaDireccion) => {
    const tabla = tipo === "coordinador" ? "coordinadores" : tipo === "subcoordinador" ? "subcoordinadores" : "votantes";
    const { error } = await supabase.from(tabla).update({ direccion_override: nuevaDireccion }).eq("ci", persona.ci);
    if (error) { alert("Error al guardar direccion."); return; }
    setModalDireccionState({ show: false, tipo: null, persona: null });
    cargarEstructura();
  }, [cargarEstructura]);

  // ======================= AGREGAR VOTANTE (TODOS LOS ROLES) =======================
  const handleAddVotante = useCallback(async (persona) => {
    const role = currentUser.role;
    const ciVotante = normalizeCI(persona.ci);
    const tel = String(persona.telefono || "").trim();
    const terceraEdad = persona.tercera_edad;

    if (!tel) { alert("El telefono es obligatorio."); return; }
    if (terceraEdad === null || terceraEdad === undefined) { alert("Debe indicar si es tercera edad."); return; }

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
    cargarEstructura();
  }, [currentUser, estructura, cargarEstructura]);



  // ======================= AGREGAR COORDINADOR (SUPERADMIN) =======================
  // Recibe { persona, dirigenteCI } desde ModalAgregarCoordinador
  const handleAddCoordinadorSuperadmin = useCallback(async ({ persona, dirigenteCI }) => {
    if (!dirigenteCI) { alert("Debe seleccionar un dirigente."); return; }
    const ciCoord = normalizeCI(persona.ci);
    const loginCode = await generarAccessCode();
    const payload = {
      ci: ciCoord,
      dirigente_ci: normalizeCI(dirigenteCI),
      asignado_por_ci: null,
      asignado_por_rol: "superadmin",
      asignado_por_nombre: `${currentUser.nombre} ${currentUser.apellido || ""}`.trim(),
      login_code: loginCode,
      activo: true,
    };
    const { error } = await supabase.from("coordinadores").insert(payload);
    if (error) { alert("Error al agregar coordinador: " + error.message); return; }
    setShowAgregarCoord(false);
    cargarEstructura();
  }, [currentUser, cargarEstructura]);

  // ======================= AGREGAR COORDINADOR (DIRIGENTE vía ModalAgregarCoordinador) =======================
  const handleAddCoordinadorDesdeModal = useCallback(async ({ persona, dirigenteCI }) => {
    const ciCoord = normalizeCI(persona.ci);
    const loginCode = await generarAccessCode();
    const payload = {
      ci: ciCoord,
      dirigente_ci: normalizeCI(dirigenteCI || currentUser.ci),
      asignado_por_ci: normalizeCI(currentUser.ci),
      asignado_por_rol: "dirigente",
      asignado_por_nombre: `${currentUser.nombre} ${currentUser.apellido || ""}`.trim(),
      login_code: loginCode,
      activo: true,
    };
    const { error } = await supabase.from("coordinadores").insert(payload);
    if (error) { alert("Error al agregar coordinador: " + error.message); return; }
    setShowAgregarCoord(false);
    cargarEstructura();
  }, [currentUser, cargarEstructura]);

  // ======================= AGREGAR SUBCOORDINADOR (SUPERADMIN/COORDINADOR) =======================
  const handleAddSubcoordinador = useCallback(async (persona) => {
    const ciSub = normalizeCI(persona.ci);
    const loginCode = await generarAccessCode();
    const miCoord = estructura.coordinadores.find(
      (c) => normalizeCI(c.ci) === normalizeCI(currentUser.ci)
    );
    const payload = {
      ci: ciSub,
      coordinador_ci: normalizeCI(currentUser.ci),
      asignado_por_ci: normalizeCI(currentUser.ci),
      asignado_por_rol: "coordinador",
      asignado_por_nombre: `${currentUser.nombre} ${currentUser.apellido || ""}`.trim(),
      login_code: loginCode,
      activo: true,
    };
    const { error } = await supabase.from("subcoordinadores").insert(payload);
    if (error) { alert("Error al agregar subcoordinador: " + error.message); return; }
    setShowAddModal(false);
    cargarEstructura();
  }, [currentUser, estructura, cargarEstructura]);

  // ======================= AGREGAR DIRIGENTE (SUPERADMIN) =======================
  const handleAgregarDirigenteDesdePadron = useCallback(async (persona) => {
    const loginCode = await generarAccessCode();
    const payload = {
      ci: normalizeCI(persona.ci),
      nombre: persona.nombre || "",
      apellido: persona.apellido || "",
      telefono: persona.telefono || null,
      login_code: loginCode,
      es_externo: false,
      activo: true,
      asignado_por_nombre: `${currentUser.nombre} ${currentUser.apellido || ""}`.trim(),
    };
    const { error } = await supabase.from("dirigentes").insert(payload);
    if (error) { alert("Error al agregar dirigente: " + error.message); return; }
    setShowAgregarDirigente(false);
    cargarEstructura();
  }, [currentUser, cargarEstructura]);

  const handleAgregarDirigenteExterno = useCallback(async (datos) => {
    const loginCode = await generarAccessCode();
    const payload = {
      ci: normalizeCI(datos.ci),
      nombre: datos.nombre,
      apellido: datos.apellido || "",
      telefono: datos.telefono || null,
      login_code: loginCode,
      es_externo: true,
      activo: true,
      asignado_por_nombre: `${currentUser.nombre} ${currentUser.apellido || ""}`.trim(),
    };
    const { error } = await supabase.from("dirigentes").insert(payload);
    if (error) { alert("Error al agregar dirigente externo: " + error.message); return null; }
    cargarEstructura();
    return loginCode;
  }, [currentUser, cargarEstructura]);

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
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 bg-brand-100 rounded-lg shrink-0">
                      <Shield className="w-4 h-4 text-brand-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-800 text-sm truncate">
                        {dir.nombre} {dir.apellido || ""}
                      </p>
                      <p className="text-xs text-slate-500">CI: {dir.ci} {dir.es_externo && <span className="text-brand-500">• Externo</span>}</p>
                    </div>
                    <Badge variant="purple">Dirigente</Badge>
                    <VoteCounter confirmed={coordsDir.length} total={totalDir} />
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <ActionBtn
                      onClick={(e) => { e.stopPropagation(); handleCopy(dir.login_code); }}
                      title="Copiar codigo de acceso"
                    >
                      {copiedCode === dir.login_code ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    </ActionBtn>
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
                                  {misVots.filter((v) => normalizeCI(v.asignado_por) === coordCI || v.asignado_por_rol === "coordinador").map((v) => (
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
                          {misVots.filter((v) => v.asignado_por_rol === "coordinador").map((v) => (
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
                    {misVots.filter((v) => v.asignado_por_rol === "coordinador").map((v) => (
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
    const misSubs = getMisSubcoordinadores(estructura, miCI);
    const misVotantes = getMisVotantes(estructura, miCI);
    const votantesConfirmados = misVotantes.filter((v) => v.voto_confirmado).length;

    return (
      <div className="space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <StatCard label="Subcoords" value={stats.subcoordinadores} icon={Users} accent />
          <StatCard label="Votantes" value={stats.votantes} icon={CheckCircle2} />
          <VoteProgressCard
            confirmed={stats.votosConfirmados}
            total={stats.votantes}
            percentage={stats.porcentajeConfirmados}
          />
          <StatCard label="Total Red" value={stats.totalRed} icon={TrendingUp} />
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

        {/* Votantes directos del coordinador */}
        {misVotantes.filter((v) => v.asignado_por_rol === "coordinador").length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-700">
              Mis Votantes Directos ({misVotantes.filter((v) => v.asignado_por_rol === "coordinador").length})
            </p>
            {misVotantes.filter((v) => v.asignado_por_rol === "coordinador").map((v) => (
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
        disponibles={personasDisponibles.filter((p) => !p.asignado)}
      />

      <ModalAgregarDirigente
        show={showAgregarDirigente}
        onClose={() => setShowAgregarDirigente(false)}
        disponibles={personasDisponibles.filter((p) => !p.asignado)}
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
        disponibles={personasDisponibles.filter((p) => !p.asignado)}
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
