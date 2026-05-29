// ======================= MÓDULO ENVIAR INVITACIÓN =======================
// Módulo aislado para gestionar invitaciones WhatsApp - Solo superadmin
// Campaña: chechito_2026

import React, { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { supabase } from "../supabaseClient";
import html2canvas from "html2canvas";
import {
  ArrowLeft,
  Search,
  Phone,
  Download,
  Share2,
  Check,
  AlertCircle,
  Clock,
  Send,
  Eye,
  Image as ImageIcon,
  X,
  Users,
  MessageCircle,
  Loader2,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
  List,
  Network,
  RotateCcw,
  User,
  UserCheck,
  UserCog,
} from "lucide-react";

// ======================= CONSTANTES =======================
const CAMPANIA = "chechito_2026";

// ======================= HELPERS =======================
const normalizeCI = (ci) =>
  (ci ?? "").toString().replace(/\D/g, "").trim() || (ci ?? "").toString().trim();

const normalizarTelefonoWhatsapp = (telefono) => {
  if (telefono === null || telefono === undefined) return null;
  let num = String(telefono)
    .replace(/\s/g, "")
    .replace(/-/g, "")
    .replace(/\(/g, "")
    .replace(/\)/g, "")
    .replace(/\+/g, "")
    .replace(/\./g, "");
  if (!num || num.length === 0) return null;
  if (num.startsWith("0")) num = num.slice(1);
  if (!num.startsWith("595")) num = "595" + num;
  if (num.length < 10 || num.length > 15) return null;
  return num;
};

const getFieldSafe = (obj, ...fields) => {
  for (const f of fields) {
    if (obj && obj[f] !== undefined && obj[f] !== null && obj[f] !== "") {
      return obj[f];
    }
  }
  return "";
};

// ======================= BADGE =======================
const Badge = ({ children, variant = "default" }) => {
  const variants = {
    default: "bg-slate-100 text-slate-700",
    pendiente: "bg-amber-50 text-amber-700 border border-amber-200",
    preparado: "bg-blue-50 text-blue-700 border border-blue-200",
    enviado: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    error: "bg-red-50 text-red-700 border border-red-200",
    coordinador: "bg-red-100 text-red-800 border border-red-300",
    subcoordinador: "bg-blue-100 text-blue-800 border border-blue-300",
    votante: "bg-slate-100 text-slate-700 border border-slate-300",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${variants[variant] || variants.default}`}>
      {children}
    </span>
  );
};

// ======================= STAT CARD =======================
const StatCard = ({ label, value, icon: Icon, variant = "default" }) => {
  const variants = {
    default: "bg-white border-slate-200",
    pendiente: "bg-amber-50 border-amber-200",
    preparado: "bg-blue-50 border-blue-200",
    enviado: "bg-emerald-50 border-emerald-200",
    error: "bg-red-50 border-red-200",
    total: "bg-brand-700 text-white border-brand-700",
  };
  const isTotal = variant === "total";
  return (
    <div className={`rounded-xl p-4 border ${variants[variant]} shadow-sm`}>
      <div className="flex items-center justify-between mb-2">
        <p className={`text-xs font-semibold uppercase tracking-wide ${isTotal ? "text-brand-200" : "text-slate-500"}`}>
          {label}
        </p>
        {Icon && (
          <Icon className={`w-4 h-4 ${isTotal ? "text-white" : "text-slate-400"}`} />
        )}
      </div>
      <p className={`text-2xl font-bold ${isTotal ? "text-white" : "text-slate-800"}`}>
        {value ?? 0}
      </p>
    </div>
  );
};

// ======================= FLYER COMPONENT =======================
const formatCI = (ci) => {
  const num = Number(ci);
  if (Number.isNaN(num)) return ci || "Sin dato";
  return new Intl.NumberFormat("es-PY").format(num);
};

const FlyerCard = React.forwardRef(({ persona }, ref) => {
  const nombre = getFieldSafe(persona, "nombre", "nombres") || "Elector";
  const apellido = getFieldSafe(persona, "apellido", "apellidos") || "";
  const ci = persona.ci || "Sin CI";
  const local = getFieldSafe(persona, "local_votacion", "local_de_votacion", "local") || "Sin dato";
  const mesa = getFieldSafe(persona, "mesa", "nro_mesa") || "Sin dato";
  const orden = getFieldSafe(persona, "orden", "orden_votacion") || "Sin dato";

  return (
    <div
      ref={ref}
      className="w-[360px] bg-white rounded-lg overflow-hidden shadow-lg"
      style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}
    >
      {/* Imagen real del flyer de Chechito */}
      <img
        src="/chechito-flyer.jpeg"
        alt="José Chechito López - Concejal 2026"
        className="w-full h-auto"
        crossOrigin="anonymous"
        onError={(e) => {
          // Fallback if image doesn't exist
          e.target.style.display = "none";
          e.target.nextSibling.style.display = "block";
        }}
      />
      {/* Fallback header if image not found */}
      <div className="bg-red-600 text-white px-6 py-5 text-center hidden">
        <p className="text-2xl font-bold tracking-tight">Jose Chechito Lopez</p>
        <p className="text-red-100 text-sm mt-1 font-medium">Concejal 2026</p>
      </div>
      
      {/* Datos del votante */}
      <div className="px-6 py-5 bg-white">
        <p className="text-lg font-semibold text-slate-800 mb-3">
          Hola <span className="text-red-600">{nombre} {apellido}</span>
        </p>
        <p className="text-sm text-slate-600 mb-4">
          Te recordamos tus datos de votacion:
        </p>
        <div className="bg-red-600 rounded-lg p-4 space-y-2.5">
          <div className="flex justify-between text-base">
            <span className="font-bold text-white">CI:</span>
            <span className="font-bold text-white">{formatCI(ci)}</span>
          </div>
          <div className="flex justify-between text-base gap-4">
            <span className="font-bold text-white shrink-0">Local de votacion:</span>
            <span className="font-bold text-white text-right">{local}</span>
          </div>
          <div className="flex justify-between text-base">
            <span className="font-bold text-white">Mesa:</span>
            <span className="font-bold text-white">{mesa}</span>
          </div>
          <div className="flex justify-between text-base">
            <span className="font-bold text-white">Orden:</span>
            <span className="font-bold text-white">{orden}</span>
          </div>
        </div>
        <div className="mt-5 bg-red-50 rounded-lg p-4 text-center border border-red-200">
          <p className="text-sm text-slate-600 mb-2">Vota asi:</p>
          <p className="text-xl font-bold text-red-600">Lista 2E</p>
          <p className="text-lg font-semibold text-slate-800">Opcion 2</p>
        </div>
      </div>
    </div>
  );
});

FlyerCard.displayName = "FlyerCard";

// ======================= MODAL =======================
const Modal = ({ open, onClose, children, title }) => {
  if (!open) return null;
  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      aria-describedby="modal-description"
    >
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div className="relative bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[90vh] overflow-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-5 py-4 flex items-center justify-between rounded-t-2xl">
          <h3 id="modal-title" className="font-semibold text-slate-800">{title}</h3>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
            aria-label="Cerrar modal"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>
        <div id="modal-description" className="p-5">{children}</div>
      </div>
    </div>
  );
};

// ======================= PERSONA ROW (Lista) =======================
const PersonaRow = ({
  persona,
  actionLoading,
  coordsMap,
  subsMap,
  onPrepararFlyer,
  onVerPreview,
  onAbrirWhatsapp,
  onMarcarEnviado,
  onMarcarError,
  onVolverPendiente,
}) => {
  const coordNombre = persona.tipo === "subcoordinador" || persona.tipo === "votante"
    ? coordsMap.get(normalizeCI(persona.coordinador_ci))
    : null;
  const subNombre = persona.tipo === "votante"
    ? subsMap.get(normalizeCI(persona.asignado_por))
    : null;

  const tipoIcon = persona.tipo === "coordinador" ? UserCog
    : persona.tipo === "subcoordinador" ? UserCheck
    : User;

  return (
    <div className="p-4 hover:bg-slate-50 transition-colors">
      <div className="flex flex-col lg:flex-row lg:items-center gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="font-semibold text-slate-800 truncate">
              {getFieldSafe(persona, "nombre", "nombres") || "Sin nombre"}{" "}
              {getFieldSafe(persona, "apellido", "apellidos") || ""}
            </span>
            <Badge variant={persona.tipo}>
              {React.createElement(tipoIcon, { className: "w-3 h-3 mr-1 inline" })}
              {persona.tipo === "coordinador" ? "Coord" : persona.tipo === "subcoordinador" ? "Sub" : "Votante"}
            </Badge>
            <Badge variant={persona.estado}>{persona.estado}</Badge>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
            <span>CI: {persona.ci}</span>
            <span className="flex items-center gap-1">
              <Phone className="w-3 h-3" />
              {persona.telefono}
            </span>
            {getFieldSafe(persona, "mesa", "nro_mesa") && (
              <span>Mesa: {getFieldSafe(persona, "mesa", "nro_mesa")}</span>
            )}
            {getFieldSafe(persona, "orden", "orden_votacion") && (
              <span>Orden: {getFieldSafe(persona, "orden", "orden_votacion")}</span>
            )}
          </div>
          {/* Estructura info */}
          {(coordNombre || subNombre) && (
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-400 mt-1">
              {coordNombre && <span>Coord: {coordNombre}</span>}
              {subNombre && <span>Sub: {subNombre}</span>}
            </div>
          )}
          {persona.fecha_envio && (
            <p className="text-xs text-emerald-600 mt-1">
              Enviado: {new Date(persona.fecha_envio).toLocaleDateString()}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => onPrepararFlyer(persona)}
            disabled={actionLoading === persona.ci}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-50"
          >
            <ImageIcon className="w-3.5 h-3.5" />
            Preparar
          </button>

          <button
            onClick={() => onVerPreview(persona)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-50 text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <Eye className="w-3.5 h-3.5" />
            Ver
          </button>

          <button
            onClick={() => onAbrirWhatsapp(persona)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors"
          >
            <Send className="w-3.5 h-3.5" />
            WhatsApp
          </button>

          <button
            onClick={() => onMarcarEnviado(persona)}
            disabled={actionLoading === persona.ci || persona.estado === "enviado"}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
          >
            {actionLoading === persona.ci ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Check className="w-3.5 h-3.5" />
            )}
            Enviado
          </button>

          {persona.estado === "error" ? (
            <button
              onClick={() => onVolverPendiente(persona)}
              disabled={actionLoading === persona.ci}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-amber-100 text-amber-800 border border-amber-300 rounded-lg hover:bg-amber-200 transition-colors disabled:opacity-50"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Pendiente
            </button>
          ) : (
            <button
              onClick={() => onMarcarError(persona)}
              disabled={actionLoading === persona.ci}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50"
            >
              <AlertCircle className="w-3.5 h-3.5" />
              Error
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ======================= MAIN COMPONENT =======================
export default function EnviarInvitacion({ onBack }) {
  // ======================= STATE =======================
  const [loading, setLoading] = useState(true);
  const [personas, setPersonas] = useState([]);
  const [invitaciones, setInvitaciones] = useState([]);
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [busqueda, setBusqueda] = useState("");
  const [actionLoading, setActionLoading] = useState(null);
  const [toast, setToast] = useState(null);
  const [vistaMode, setVistaMode] = useState("lista"); // "lista" | "estructura"
  const [expandedNodes, setExpandedNodes] = useState({});

  // Raw data for building relationships
  const [rawCoords, setRawCoords] = useState([]);
  const [rawSubs, setRawSubs] = useState([]);
  const [rawVotantes, setRawVotantes] = useState([]);

  // Modal states
  const [modalOpen, setModalOpen] = useState(false);
  const [modalPersona, setModalPersona] = useState(null);
  const [generandoFlyer, setGenerandoFlyer] = useState(false);
  const [flyerBlob, setFlyerBlob] = useState(null);

  const flyerRef = useRef(null);

  // ======================= LOAD DATA =======================
  const cargarDatos = useCallback(async () => {
    setLoading(true);
    
    let coordsData = [];
    let subsData = [];
    let votantesData = [];
    let invData = [];

    // Coordinadores
    try {
      const { data, error } = await supabase.from("coordinadores").select("*, padron(*)");
      if (error) {
        console.error("Error cargando coordinadores:", {
          message: error?.message,
          details: error?.details,
          hint: error?.hint,
          code: error?.code,
        });
      } else {
        coordsData = data || [];
      }
    } catch (err) {
      console.error("Error cargando coordinadores:", err);
    }

    // Subcoordinadores
    try {
      const { data, error } = await supabase.from("subcoordinadores").select("*, padron(*)");
      if (error) {
        console.error("Error cargando subcoordinadores:", {
          message: error?.message,
          details: error?.details,
          hint: error?.hint,
          code: error?.code,
        });
      } else {
        subsData = data || [];
      }
    } catch (err) {
      console.error("Error cargando subcoordinadores:", err);
    }

    // Votantes - select only real columns, filter by telefono IS NOT NULL
    try {
      const { data, error } = await supabase
        .from("votantes")
        .select("ci, asignado_por, asignado_por_nombre, telefono, coordinador_ci, voto_confirmado, direccion_override, created_at")
        .not("telefono", "is", null);
      
      if (error) {
        console.error("Error cargando votantes:", {
          message: error?.message,
          details: error?.details,
          hint: error?.hint,
          code: error?.code,
          fullError: error,
        });
      } else {
        // Filter in JS to ensure telefono is not empty string
        const votantesConTelefono = (data || []).filter((v) => {
          const tel = String(v.telefono || "").trim();
          return tel.length > 0;
        });
        console.log("[v0] votantes con telefono cargados:", votantesConTelefono.length);

        // Get CIs to fetch from padron
        const votantesCIs = votantesConTelefono.map((v) => v.ci);
        
        // Fetch padron data in chunks of 500 to avoid Supabase limits
        let padronData = [];
        const chunkSize = 500;
        for (let i = 0; i < votantesCIs.length; i += chunkSize) {
          const chunk = votantesCIs.slice(i, i + chunkSize);
          const { data: padronChunk, error: padronError } = await supabase
            .from("padron")
            .select("ci, nombre, apellido, seccional, local_votacion, mesa, orden, direccion")
            .in("ci", chunk);
          
          if (padronError) {
            console.error("Error cargando padron chunk:", padronError);
          } else {
            padronData = padronData.concat(padronChunk || []);
          }
        }
        console.log("[v0] padron encontrado para votantes:", padronData.length);

        // Build padron map for quick lookup (bigint comparison via String)
        const padronMap = new Map();
        padronData.forEach((p) => {
          padronMap.set(String(p.ci), p);
        });

        // Enrich votantes with padron data
        votantesData = votantesConTelefono.map((v) => {
          const padron = padronMap.get(String(v.ci));
          return {
            ci: v.ci,
            telefono: v.telefono,
            asignado_por: v.asignado_por,
            asignado_por_nombre: v.asignado_por_nombre,
            coordinador_ci: v.coordinador_ci,
            voto_confirmado: v.voto_confirmado,
            direccion_override: v.direccion_override,
            // Padron fields
            nombre: padron?.nombre || "",
            apellido: padron?.apellido || "",
            seccional: padron?.seccional || "",
            local_votacion: padron?.local_votacion || "",
            mesa: padron?.mesa || "",
            orden: padron?.orden || "",
            direccion: v.direccion_override || padron?.direccion || "",
            // For compatibility with existing code
            padron: padron || null,
          };
        });
      }
    } catch (err) {
      console.error("Error cargando votantes:", err);
    }

    // Invitaciones WhatsApp
    try {
      const { data, error } = await supabase.from("invitaciones_whatsapp").select("*").eq("campania", CAMPANIA);
      if (error) {
        console.error("Error cargando invitaciones_whatsapp:", {
          message: error?.message,
          details: error?.details,
          hint: error?.hint,
          code: error?.code,
        });
      } else {
        invData = data || [];
      }
    } catch (err) {
      console.error("Error cargando invitaciones_whatsapp:", err);
    }

    // Save raw data for hierarchy building
    setRawCoords(coordsData);
    setRawSubs(subsData);
    setRawVotantes(votantesData);

    // Build persons with phone
    const allPersonas = [];
    const seen = new Set();

    const getTelefonoStr = (p) => {
      const tel = p.telefono ?? p.padron?.telefono ?? "";
      return String(tel).replace(/\s/g, "").trim();
    };

    const addPersona = (p, tipo) => {
      const telefonoStr = getTelefonoStr(p);
      if (!telefonoStr || telefonoStr.length === 0) return;
      
      const ci = normalizeCI(p.ci);
      if (!ci) return;
      if (seen.has(ci)) return;
      seen.add(ci);
      
      allPersonas.push({
        ...p.padron,
        ...p,
        ci,
        telefono: telefonoStr,
        tipo,
        coordinador_ci: p.coordinador_ci || null,
        asignado_por: p.asignado_por || null,
      });
    };

    // Process in hierarchy priority order (coord > sub > votante)
    coordsData.forEach((c) => addPersona(c, "coordinador"));
    subsData.forEach((s) => addPersona(s, "subcoordinador"));
    votantesData.forEach((v) => addPersona(v, "votante"));

    // Debug logging
    console.log("[v0] EnviarInvitacion - Datos cargados:", {
      coordinadores: coordsData.length,
      subcoordinadores: subsData.length,
      votantes: votantesData.length,
      invitaciones: invData.length,
      personasConTelefono: allPersonas.length,
      desglosePorTipo: {
        coordsConTel: allPersonas.filter((p) => p.tipo === "coordinador").length,
        subsConTel: allPersonas.filter((p) => p.tipo === "subcoordinador").length,
        votantesConTel: allPersonas.filter((p) => p.tipo === "votante").length,
      },
    });

    setPersonas(allPersonas);
    setInvitaciones(invData);
    setLoading(false);
  }, []);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  // ======================= TOAST =======================
  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // ======================= COMPUTED =======================
  const invitacionesMap = useMemo(() => {
    const map = new Map();
    invitaciones.forEach((inv) => {
      map.set(normalizeCI(inv.ci), inv);
    });
    return map;
  }, [invitaciones]);

  // Maps for names lookup - Use ALL coords/subs, not just those with phone
  // This ensures we can show the coordinator name even if they don't have phone
  const coordsMap = useMemo(() => {
    const map = new Map();
    rawCoords.forEach((c) => {
      const nombre = `${getFieldSafe(c.padron || c, "nombre", "nombres") || ""} ${getFieldSafe(c.padron || c, "apellido", "apellidos") || ""}`.trim() || "Sin nombre";
      map.set(normalizeCI(c.ci), nombre);
    });
    console.log("[v0] coordsMap built with", map.size, "coordinadores");
    return map;
  }, [rawCoords]);

  const subsMap = useMemo(() => {
    const map = new Map();
    rawSubs.forEach((s) => {
      const nombre = `${getFieldSafe(s.padron || s, "nombre", "nombres") || ""} ${getFieldSafe(s.padron || s, "apellido", "apellidos") || ""}`.trim() || "Sin nombre";
      map.set(normalizeCI(s.ci), nombre);
    });
    console.log("[v0] subsMap built with", map.size, "subcoordinadores");
    return map;
  }, [rawSubs]);

  const personasConEstado = useMemo(() => {
    return personas.map((p) => {
      const inv = invitacionesMap.get(normalizeCI(p.ci));
      return {
        ...p,
        estado: inv?.estado || "pendiente",
        fecha_envio: inv?.fecha_envio || null,
        fecha_preparado: inv?.fecha_preparado || null,
        invitacion_id: inv?.id || null,
      };
    });
  }, [personas, invitacionesMap]);

  const contadores = useMemo(() => {
    const counts = { total: 0, pendiente: 0, preparado: 0, enviado: 0, error: 0, coordinador: 0, subcoordinador: 0, votante: 0 };
    personasConEstado.forEach((p) => {
      counts.total++;
      counts[p.estado] = (counts[p.estado] || 0) + 1;
      counts[p.tipo] = (counts[p.tipo] || 0) + 1;
    });
    return counts;
  }, [personasConEstado]);

  const personasFiltradas = useMemo(() => {
    let result = personasConEstado;

    // Filter by estado
    if (filtroEstado !== "todos") {
      result = result.filter((p) => p.estado === filtroEstado);
    }

    // Filter by tipo
    if (filtroTipo !== "todos") {
      result = result.filter((p) => p.tipo === filtroTipo);
    }

    // Search
    if (busqueda.trim()) {
      const tokens = busqueda.toLowerCase().split(" ").filter(Boolean);
      result = result.filter((p) => {
        const searchable = [
          p.nombre,
          p.apellido,
          p.ci,
          p.telefono,
        ].join(" ").toLowerCase();
        return tokens.every((t) => searchable.includes(t));
      });
    }

    return result;
  }, [personasConEstado, filtroEstado, filtroTipo, busqueda]);

  // ======================= HIERARCHY DATA =======================
  const hierarchyData = useMemo(() => {
    // Use rawCoords/rawSubs to build the REAL hierarchy structure
    // Coordinators/subs appear as headers even if they don't have phone
    // Only people with phone (personasConEstado) are actionable

    // Build maps of all coords/subs for quick lookup by CI
    const allCoordsMap = new Map();
    rawCoords.forEach((c) => {
      const ci = String(c.ci);
      allCoordsMap.set(ci, {
        ci: c.ci,
        nombre: getFieldSafe(c.padron || c, "nombre", "nombres") || "",
        apellido: getFieldSafe(c.padron || c, "apellido", "apellidos") || "",
        telefono: c.telefono || c.padron?.telefono || null,
      });
    });

    const allSubsMap = new Map();
    rawSubs.forEach((s) => {
      const ci = String(s.ci);
      allSubsMap.set(ci, {
        ci: s.ci,
        coordinador_ci: s.coordinador_ci,
        nombre: getFieldSafe(s.padron || s, "nombre", "nombres") || "",
        apellido: getFieldSafe(s.padron || s, "apellido", "apellidos") || "",
        telefono: s.telefono || s.padron?.telefono || null,
      });
    });

    // Build maps for personas with phone (actionable)
    const personasByCi = new Map();
    personasConEstado.forEach((p) => {
      personasByCi.set(String(p.ci), p);
    });

    // Group subcoordinadores (with phone) by coordinador_ci
    const subsConTelByCoord = new Map();
    personasConEstado.filter((p) => p.tipo === "subcoordinador").forEach((s) => {
      const coordCI = String(s.coordinador_ci);
      if (!subsConTelByCoord.has(coordCI)) subsConTelByCoord.set(coordCI, []);
      subsConTelByCoord.get(coordCI).push(s);
    });

    // Group votantes (with phone) by asignado_por
    const votantesByAsignador = new Map();
    personasConEstado.filter((p) => p.tipo === "votante").forEach((v) => {
      const asignadoPor = String(v.asignado_por);
      if (!votantesByAsignador.has(asignadoPor)) votantesByAsignador.set(asignadoPor, []);
      votantesByAsignador.get(asignadoPor).push(v);
    });

    // Also group ALL subs by coordinador_ci (even without phone) to show structure
    const allSubsByCoord = new Map();
    rawSubs.forEach((s) => {
      const coordCI = String(s.coordinador_ci);
      if (!allSubsByCoord.has(coordCI)) allSubsByCoord.set(coordCI, []);
      allSubsByCoord.get(coordCI).push(s);
    });

    // Helper to count stats for a list of actionable personas
    const getStats = (items) => {
      const stats = { total: 0, pendiente: 0, enviado: 0, error: 0, preparado: 0 };
      items.forEach((p) => {
        stats.total++;
        stats[p.estado] = (stats[p.estado] || 0) + 1;
      });
      return stats;
    };

    // Build hierarchy starting with ALL coordinators from rawCoords
    const estructuraCoords = [];
    
    for (const [coordCI, coordInfo] of allCoordsMap) {
      const coordPersona = personasByCi.get(coordCI); // May be null if no phone
      
      // Get all subs under this coord (with or without phone)
      const allSubsUnderCoord = allSubsByCoord.get(coordCI) || [];
      
      // Build sub structures
      const subStructures = [];
      for (const rawSub of allSubsUnderCoord) {
        const subCI = String(rawSub.ci);
        const subPersona = personasByCi.get(subCI); // May be null if no phone
        const subVotantes = votantesByAsignador.get(subCI) || [];
        
        subStructures.push({
          ci: rawSub.ci,
          nombre: getFieldSafe(rawSub.padron || rawSub, "nombre", "nombres") || "",
          apellido: getFieldSafe(rawSub.padron || rawSub, "apellido", "apellidos") || "",
          hasPhone: !!subPersona,
          persona: subPersona, // null if no phone
          votantes: subVotantes,
        });
      }

      // Get votantes directly under this coord
      const votantesDirectos = votantesByAsignador.get(coordCI) || [];

      // Collect all actionable people under this coord for stats
      const allActionable = [];
      if (coordPersona) allActionable.push(coordPersona);
      subStructures.forEach((sub) => {
        if (sub.persona) allActionable.push(sub.persona);
        allActionable.push(...sub.votantes);
      });
      allActionable.push(...votantesDirectos);

      // Only show coord if it has structure below or has phone itself
      if (coordPersona || subStructures.length > 0 || votantesDirectos.length > 0) {
        estructuraCoords.push({
          ci: coordInfo.ci,
          nombre: coordInfo.nombre,
          apellido: coordInfo.apellido,
          hasPhone: !!coordPersona,
          persona: coordPersona, // null if no phone
          subcoordinadores: subStructures,
          votantesDirectos,
          stats: getStats(allActionable),
        });
      }
    }

    // Find subs without a valid coord in rawCoords
    const allCoordCIs = new Set([...allCoordsMap.keys()]);
    const subsWithoutCoord = [];
    for (const [subCI, subInfo] of allSubsMap) {
      const subCoordCI = String(subInfo.coordinador_ci);
      if (!allCoordCIs.has(subCoordCI)) {
        const subPersona = personasByCi.get(subCI);
        const subVotantes = votantesByAsignador.get(subCI) || [];
        if (subPersona || subVotantes.length > 0) {
          subsWithoutCoord.push({
            ci: subInfo.ci,
            nombre: subInfo.nombre,
            apellido: subInfo.apellido,
            hasPhone: !!subPersona,
            persona: subPersona,
            votantes: subVotantes,
          });
        }
      }
    }

    // Find votantes without valid asignador (neither coord nor sub in rawCoords/rawSubs)
    const allAsignadores = new Set([...allCoordsMap.keys(), ...allSubsMap.keys()]);
    const votantesSinEstructura = personasConEstado.filter(
      (p) => p.tipo === "votante" && !allAsignadores.has(String(p.asignado_por))
    );

    return {
      coordinadores: estructuraCoords,
      subsWithoutCoord,
      votantesSinEstructura,
    };
  }, [personasConEstado, rawCoords, rawSubs]);

  // ======================= ACTIONS =======================
  const upsertInvitacion = async (ci, telefono, updates) => {
    const existing = invitacionesMap.get(normalizeCI(ci));

    if (existing) {
      const { error } = await supabase
        .from("invitaciones_whatsapp")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("invitaciones_whatsapp").insert([
        {
          ci: normalizeCI(ci),
          telefono,
          campania: CAMPANIA,
          ...updates,
        },
      ]);
      if (error) throw error;
    }
  };

  const handlePrepararFlyer = async (persona) => {
    setModalPersona(persona);
    setModalOpen(true);
    setGenerandoFlyer(true);
    setFlyerBlob(null);

    setTimeout(async () => {
      try {
        if (!flyerRef.current) throw new Error("Flyer no disponible");

        const canvas = await html2canvas(flyerRef.current, {
          scale: 2,
          useCORS: true,
          backgroundColor: "#ffffff",
        });

        canvas.toBlob(async (blob) => {
          if (!blob) {
            showToast("Error al generar imagen", "error");
            setGenerandoFlyer(false);
            return;
          }

          setFlyerBlob(blob);
          setGenerandoFlyer(false);

          try {
            await upsertInvitacion(persona.ci, persona.telefono, {
              estado: "preparado",
              fecha_preparado: new Date().toISOString(),
            });
            await cargarDatos();
            showToast("Flyer preparado correctamente");
          } catch (err) {
            console.error("Error guardando estado:", err);
            showToast("Error al guardar estado", "error");
          }
        }, "image/png");
      } catch (err) {
        console.error("Error generando flyer:", err);
        showToast("Error al generar flyer", "error");
        setGenerandoFlyer(false);
      }
    }, 100);
  };

  const handleVerPreview = (persona) => {
    setModalPersona(persona);
    setModalOpen(true);
    setFlyerBlob(null);
    setGenerandoFlyer(false);
  };

  const handleDescargarFlyer = async () => {
    if (!flyerBlob && flyerRef.current) {
      const canvas = await html2canvas(flyerRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
      });
      canvas.toBlob((blob) => {
        if (blob) downloadBlob(blob);
      }, "image/png");
    } else if (flyerBlob) {
      downloadBlob(flyerBlob);
    }
  };

  const downloadBlob = (blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `invitacion-${modalPersona?.ci || "flyer"}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("Flyer descargado");
  };

  const handleCompartir = async () => {
    if (!flyerBlob) {
      showToast("Primero genera el flyer", "error");
      return;
    }

    if (navigator.share && navigator.canShare) {
      const file = new File([flyerBlob], `invitacion-${modalPersona?.ci || "flyer"}.png`, {
        type: "image/png",
      });

      if (navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: "Invitación José Chechito López",
          });
          showToast("Imagen compartida");
        } catch (err) {
          if (err.name !== "AbortError") {
            showToast("Error al compartir", "error");
          }
        }
      } else {
        showToast("Tu dispositivo no permite compartir archivos", "error");
      }
    } else {
      showToast("Compartir no disponible en este navegador", "error");
    }
  };

  const handleAbrirWhatsapp = (persona) => {
    const numNorm = normalizarTelefonoWhatsapp(persona.telefono);
    if (!numNorm) {
      showToast("Teléfono inválido", "error");
      return;
    }

    const nombre = getFieldSafe(persona, "nombre", "nombres") || "Elector";
    const distrito = getFieldSafe(persona, "distrito", "departamento") || "Sin dato";
    const local = getFieldSafe(persona, "local_votacion", "local_de_votacion", "local") || "Sin dato";
    const mesa = getFieldSafe(persona, "mesa", "nro_mesa") || "Sin dato";
    const orden = getFieldSafe(persona, "orden", "orden_votacion") || "Sin dato";

    const mensaje = `Hola ${nombre}, te saluda el equipo de José Chechito López.

Te recordamos tus datos de votación:

Distrito: ${distrito}
Local de votación: ${local}
Mesa: ${mesa}
Orden: ${orden}

Este 2026 votá así:

Lista 2E
Opción 2

José Chechito López - Concejal

¡Contamos con tu apoyo!`;

    const url = `https://wa.me/${numNorm}?text=${encodeURIComponent(mensaje)}`;
    window.open(url, "_blank");
  };

  const handleMarcarEnviado = async (persona) => {
    setActionLoading(persona.ci);
    try {
      await upsertInvitacion(persona.ci, persona.telefono, {
        estado: "enviado",
        fecha_envio: new Date().toISOString(),
      });
      await cargarDatos();
      showToast("Marcado como enviado");
    } catch (err) {
      console.error("Error marcando enviado:", err);
      showToast("Error al marcar enviado", "error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleMarcarError = async (persona) => {
    setActionLoading(persona.ci);
    try {
      await upsertInvitacion(persona.ci, persona.telefono, {
        estado: "error",
      });
      await cargarDatos();
      showToast("Marcado como error");
    } catch (err) {
      console.error("Error marcando error:", err);
      showToast("Error al guardar", "error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleVolverPendiente = async (persona) => {
    setActionLoading(persona.ci);
    try {
      await upsertInvitacion(persona.ci, persona.telefono, {
        estado: "pendiente",
        observacion: null,
      });
      await cargarDatos();
      showToast("Vuelto a pendiente");
    } catch (err) {
      console.error("Error volviendo a pendiente:", err);
      showToast("Error al guardar", "error");
    } finally {
      setActionLoading(null);
    }
  };

  const toggleExpanded = (key) => {
    setExpandedNodes((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // ======================= RENDER =======================
  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <button
                onClick={onBack}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-slate-600" />
              </button>
              <div>
                <h1 className="font-bold text-slate-800">Enviar invitación</h1>
                <p className="text-xs text-slate-500">Gestión de invitaciones por WhatsApp</p>
              </div>
            </div>
            <Badge variant="enviado">
              <MessageCircle className="w-3 h-3 mr-1" />
              Campaña 2026
            </Badge>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
          <StatCard label="Total con teléfono" value={contadores.total} icon={Users} variant="total" />
          <StatCard label="Pendientes" value={contadores.pendiente} icon={Clock} variant="pendiente" />
          <StatCard label="Preparados" value={contadores.preparado} icon={ImageIcon} variant="preparado" />
          <StatCard label="Enviados" value={contadores.enviado} icon={CheckCircle2} variant="enviado" />
          <StatCard label="Error" value={contadores.error} icon={XCircle} variant="error" />
        </div>

        {/* Filtros y búsqueda */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-6">
          <div className="flex flex-col gap-4">
            {/* Vista selector */}
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-xs font-medium text-slate-500 mr-2">Vista:</span>
              <button
                onClick={() => setVistaMode("lista")}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                  vistaMode === "lista"
                    ? "bg-brand-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                <List className="w-4 h-4" />
                Lista
              </button>
              <button
                onClick={() => setVistaMode("estructura")}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                  vistaMode === "estructura"
                    ? "bg-brand-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                <Network className="w-4 h-4" />
                Estructura
              </button>
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              {/* Filtros Estado */}
              <div className="flex flex-wrap gap-2">
                <span className="text-xs font-medium text-slate-500 self-center mr-1">Estado:</span>
                {[
                  { key: "todos", label: "Todos" },
                  { key: "pendiente", label: "Pendientes" },
                  { key: "preparado", label: "Preparados" },
                  { key: "enviado", label: "Enviados" },
                  { key: "error", label: "Error" },
                ].map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setFiltroEstado(f.key)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                      filtroEstado === f.key
                        ? "bg-brand-600 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Filtros Tipo */}
              <div className="flex flex-wrap gap-2">
                <span className="text-xs font-medium text-slate-500 self-center mr-1">Tipo:</span>
                {[
                  { key: "todos", label: "Todos" },
                  { key: "coordinador", label: "Coords" },
                  { key: "subcoordinador", label: "Subs" },
                  { key: "votante", label: "Votantes" },
                ].map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setFiltroTipo(f.key)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                      filtroTipo === f.key
                        ? "bg-brand-600 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Buscador */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por nombre, CI o teléfono..."
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 text-brand-600 animate-spin" />
            </div>
          ) : vistaMode === "lista" ? (
            // ======================= VISTA LISTA =======================
            personasFiltradas.length === 0 ? (
              <div className="text-center py-20">
                <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500">No se encontraron personas.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {personasFiltradas.map((persona) => (
                  <PersonaRow
                    key={persona.ci}
                    persona={persona}
                    actionLoading={actionLoading}
                    coordsMap={coordsMap}
                    subsMap={subsMap}
                    onPrepararFlyer={handlePrepararFlyer}
                    onVerPreview={handleVerPreview}
                    onAbrirWhatsapp={handleAbrirWhatsapp}
                    onMarcarEnviado={handleMarcarEnviado}
                    onMarcarError={handleMarcarError}
                    onVolverPendiente={handleVolverPendiente}
                  />
                ))}
              </div>
            )
          ) : (
            // ======================= VISTA ESTRUCTURA =======================
            <div className="divide-y divide-slate-200">
              {/* Coordinadores */}
              {hierarchyData.coordinadores.map((coord) => {
                const coordKey = `coord-${coord.ci}`;
                const isExpanded = expandedNodes[coordKey];
                const stats = coord.stats;

                return (
                  <div key={coord.ci} className="bg-white">
                    {/* Coord header */}
                    <div
                      className="flex items-center gap-3 p-4 cursor-pointer hover:bg-slate-50"
                      onClick={() => toggleExpanded(coordKey)}
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-5 h-5 text-brand-600 shrink-0" />
                      ) : (
                        <ChevronRight className="w-5 h-5 text-brand-600 shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="coordinador">
                            <UserCog className="w-3 h-3 mr-1" />
                            Coordinador
                          </Badge>
                          <span className="font-semibold text-slate-800">
                            {coord.nombre} {coord.apellido}
                          </span>
                          {coord.hasPhone ? (
                            <Badge variant={coord.persona?.estado || "pendiente"}>{coord.persona?.estado || "pendiente"}</Badge>
                          ) : (
                            <Badge variant="default" className="bg-slate-200 text-slate-600">Sin teléfono</Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-3 text-xs text-slate-500 mt-1">
                          <span>Total: {stats.total}</span>
                          <span className="text-amber-600">Pend: {stats.pendiente}</span>
                          <span className="text-emerald-600">Env: {stats.enviado}</span>
                          <span className="text-red-600">Err: {stats.error}</span>
                        </div>
                      </div>
                    </div>

                    {/* Coord content expanded */}
                    {isExpanded && (
                      <div className="border-t border-slate-100 bg-slate-50/50">
                        {/* Coord person actions (only if has phone) */}
                        {coord.hasPhone && coord.persona && (
                          <div className="px-4 py-2 bg-red-50/50 border-b border-slate-100">
                            <PersonaRow
                              persona={coord.persona}
                              actionLoading={actionLoading}
                              coordsMap={coordsMap}
                              subsMap={subsMap}
                              onPrepararFlyer={handlePrepararFlyer}
                              onVerPreview={handleVerPreview}
                              onAbrirWhatsapp={handleAbrirWhatsapp}
                              onMarcarEnviado={handleMarcarEnviado}
                              onMarcarError={handleMarcarError}
                              onVolverPendiente={handleVolverPendiente}
                            />
                          </div>
                        )}

                        {/* Subs */}
                        {coord.subcoordinadores.map((sub) => {
                          const subKey = `sub-${sub.ci}`;
                          const subExpanded = expandedNodes[subKey];
                          const subVotantes = sub.votantes || [];

                          return (
                            <div key={sub.ci} className="border-t border-slate-100">
                              {/* Sub header */}
                              <div
                                className="flex items-center gap-3 p-3 pl-8 cursor-pointer hover:bg-slate-100"
                                onClick={() => toggleExpanded(subKey)}
                              >
                                {subExpanded ? (
                                  <ChevronDown className="w-4 h-4 text-blue-600 shrink-0" />
                                ) : (
                                  <ChevronRight className="w-4 h-4 text-blue-600 shrink-0" />
                                )}
                                <div className="flex-1 min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Badge variant="subcoordinador">
                                      <UserCheck className="w-3 h-3 mr-1" />
                                      Sub
                                    </Badge>
                                    <span className="font-medium text-slate-700">
                                      {sub.nombre} {sub.apellido}
                                    </span>
                                    {sub.hasPhone ? (
                                      <Badge variant={sub.persona?.estado || "pendiente"}>{sub.persona?.estado || "pendiente"}</Badge>
                                    ) : (
                                      <Badge variant="default" className="bg-slate-200 text-slate-600">Sin teléfono</Badge>
                                    )}
                                    <span className="text-xs text-slate-400">({subVotantes.length} votantes)</span>
                                  </div>
                                </div>
                              </div>

                              {/* Sub expanded */}
                              {subExpanded && (
                                <div className="bg-blue-50/30 border-t border-slate-100">
                                  {/* Sub person actions (only if has phone) */}
                                  {sub.hasPhone && sub.persona && (
                                    <div className="px-4 py-2 pl-12 bg-blue-50/50 border-b border-slate-100">
                                      <PersonaRow
                                        persona={sub.persona}
                                        actionLoading={actionLoading}
                                        coordsMap={coordsMap}
                                        subsMap={subsMap}
                                        onPrepararFlyer={handlePrepararFlyer}
                                        onVerPreview={handleVerPreview}
                                        onAbrirWhatsapp={handleAbrirWhatsapp}
                                        onMarcarEnviado={handleMarcarEnviado}
                                        onMarcarError={handleMarcarError}
                                        onVolverPendiente={handleVolverPendiente}
                                      />
                                    </div>
                                  )}
                                  {/* Votantes of this sub */}
                                  {subVotantes.map((v) => (
                                    <div key={v.ci} className="pl-12 border-t border-slate-100">
                                      <PersonaRow
                                        persona={v}
                                        actionLoading={actionLoading}
                                        coordsMap={coordsMap}
                                        subsMap={subsMap}
                                        onPrepararFlyer={handlePrepararFlyer}
                                        onVerPreview={handleVerPreview}
                                        onAbrirWhatsapp={handleAbrirWhatsapp}
                                        onMarcarEnviado={handleMarcarEnviado}
                                        onMarcarError={handleMarcarError}
                                        onVolverPendiente={handleVolverPendiente}
                                      />
                                    </div>
                                  ))}
                                  {subVotantes.length === 0 && !sub.hasPhone && (
                                    <p className="text-xs text-slate-400 py-3 pl-12">Sin votantes con teléfono</p>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}

                        {/* Direct voters of coord */}
                        {coord.votantesDirectos.length > 0 && (
                          <div className="border-t border-slate-200">
                            <p className="text-xs font-semibold text-slate-500 px-4 py-2 pl-8 bg-slate-100">
                              Votantes directos del coordinador ({coord.votantesDirectos.length})
                            </p>
                            {coord.votantesDirectos.map((v) => (
                              <div key={v.ci} className="pl-8 border-t border-slate-100">
                                <PersonaRow
                                  persona={v}
                                  actionLoading={actionLoading}
                                  coordsMap={coordsMap}
                                  subsMap={subsMap}
                                  onPrepararFlyer={handlePrepararFlyer}
                                  onVerPreview={handleVerPreview}
                                  onAbrirWhatsapp={handleAbrirWhatsapp}
                                  onMarcarEnviado={handleMarcarEnviado}
                                  onMarcarError={handleMarcarError}
                                  onVolverPendiente={handleVolverPendiente}
                                />
                              </div>
                            ))}
                          </div>
                        )}

                        {coord.subcoordinadores.length === 0 && coord.votantesDirectos.length === 0 && !coord.hasPhone && (
                          <p className="text-xs text-slate-400 py-3 pl-8">Sin estructura asignada</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Subs without coord */}
              {hierarchyData.subsWithoutCoord.length > 0 && (
                <div className="bg-amber-50/50">
                  <div
                    className="flex items-center gap-3 p-4 cursor-pointer hover:bg-amber-100/50"
                    onClick={() => toggleExpanded("subs-sin-coord")}
                  >
                    {expandedNodes["subs-sin-coord"] ? (
                      <ChevronDown className="w-5 h-5 text-amber-600 shrink-0" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-amber-600 shrink-0" />
                    )}
                    <div className="flex-1">
                      <p className="font-semibold text-amber-800">Subcoordinadores sin coordinador</p>
                      <p className="text-xs text-amber-600">{hierarchyData.subsWithoutCoord.length} subcoordinadores</p>
                    </div>
                  </div>
                  {expandedNodes["subs-sin-coord"] && (
                    <div className="border-t border-amber-200">
                      {hierarchyData.subsWithoutCoord.map((sub) => (
                        <div key={sub.ci} className="border-t border-amber-100 first:border-t-0">
                          <div className="p-3 bg-amber-50/50">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge variant="subcoordinador">
                                <UserCheck className="w-3 h-3 mr-1" />
                                Sub
                              </Badge>
                              <span className="font-medium text-slate-700">{sub.nombre} {sub.apellido}</span>
                              {sub.hasPhone ? (
                                <Badge variant={sub.persona?.estado || "pendiente"}>{sub.persona?.estado || "pendiente"}</Badge>
                              ) : (
                                <Badge variant="default" className="bg-slate-200 text-slate-600">Sin teléfono</Badge>
                              )}
                            </div>
                            {sub.hasPhone && sub.persona && (
                              <PersonaRow
                                persona={sub.persona}
                                actionLoading={actionLoading}
                                coordsMap={coordsMap}
                                subsMap={subsMap}
                                onPrepararFlyer={handlePrepararFlyer}
                                onVerPreview={handleVerPreview}
                                onAbrirWhatsapp={handleAbrirWhatsapp}
                                onMarcarEnviado={handleMarcarEnviado}
                                onMarcarError={handleMarcarError}
                                onVolverPendiente={handleVolverPendiente}
                              />
                            )}
                          </div>
                          {/* Votantes under this orphan sub */}
                          {sub.votantes.map((v) => (
                            <div key={v.ci} className="pl-8 border-t border-amber-100">
                              <PersonaRow
                                persona={v}
                                actionLoading={actionLoading}
                                coordsMap={coordsMap}
                                subsMap={subsMap}
                                onPrepararFlyer={handlePrepararFlyer}
                                onVerPreview={handleVerPreview}
                                onAbrirWhatsapp={handleAbrirWhatsapp}
                                onMarcarEnviado={handleMarcarEnviado}
                                onMarcarError={handleMarcarError}
                                onVolverPendiente={handleVolverPendiente}
                              />
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Votantes without structure */}
              {hierarchyData.votantesSinEstructura.length > 0 && (
                <div className="bg-slate-100/50">
                  <div
                    className="flex items-center gap-3 p-4 cursor-pointer hover:bg-slate-200/50"
                    onClick={() => toggleExpanded("votantes-sin-estructura")}
                  >
                    {expandedNodes["votantes-sin-estructura"] ? (
                      <ChevronDown className="w-5 h-5 text-slate-600 shrink-0" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-slate-600 shrink-0" />
                    )}
                    <div className="flex-1">
                      <p className="font-semibold text-slate-700">Votantes sin estructura asignada</p>
                      <p className="text-xs text-slate-500">{hierarchyData.votantesSinEstructura.length} personas</p>
                    </div>
                  </div>
                  {expandedNodes["votantes-sin-estructura"] && (
                    <div className="border-t border-slate-200">
                      {hierarchyData.votantesSinEstructura.map((v) => (
                        <div key={v.ci} className="border-t border-slate-100 first:border-t-0">
                          <PersonaRow
                            persona={v}
                            actionLoading={actionLoading}
                            coordsMap={coordsMap}
                            subsMap={subsMap}
                            onPrepararFlyer={handlePrepararFlyer}
                            onVerPreview={handleVerPreview}
                            onAbrirWhatsapp={handleAbrirWhatsapp}
                            onMarcarEnviado={handleMarcarEnviado}
                            onMarcarError={handleMarcarError}
                            onVolverPendiente={handleVolverPendiente}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {hierarchyData.coordinadores.length === 0 &&
                hierarchyData.subsWithoutCoord.length === 0 &&
                hierarchyData.votantesSinEstructura.length === 0 && (
                  <div className="text-center py-20">
                    <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-500">No hay datos de estructura.</p>
                  </div>
                )}
            </div>
          )}
        </div>

        {/* Contador resultados */}
        {!loading && vistaMode === "lista" && personasFiltradas.length > 0 && (
          <p className="text-xs text-slate-500 mt-3 text-center">
            Mostrando {personasFiltradas.length} de {contadores.total} personas
          </p>
        )}
      </main>

      {/* Modal Flyer */}
      <Modal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setModalPersona(null);
          setFlyerBlob(null);
        }}
        title="Vista previa del flyer"
      >
        {modalPersona && (
          <div className="flex flex-col items-center">
            <div className="mb-4">
              <FlyerCard ref={flyerRef} persona={modalPersona} />
            </div>

            {generandoFlyer && (
              <div className="flex items-center gap-2 text-sm text-slate-600 mb-4">
                <Loader2 className="w-4 h-4 animate-spin" />
                Generando imagen...
              </div>
            )}

            <div className="flex flex-wrap gap-2 justify-center">
              <button
                onClick={handleDescargarFlyer}
                disabled={generandoFlyer}
                className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                Descargar flyer
              </button>

              {typeof navigator !== "undefined" && navigator.share && (
                <button
                  onClick={handleCompartir}
                  disabled={generandoFlyer || !flyerBlob}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors disabled:opacity-50"
                >
                  <Share2 className="w-4 h-4" />
                  Compartir imagen
                </button>
              )}

              <button
                onClick={() => handleAbrirWhatsapp(modalPersona)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
              >
                <Send className="w-4 h-4" />
                Abrir WhatsApp
              </button>
            </div>

            <p className="text-xs text-slate-500 mt-4 text-center">
              Descarga el flyer, luego abre WhatsApp y adjunta la imagen manualmente.
            </p>
          </div>
        )}
      </Modal>

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 animate-fade-in ${
            toast.type === "error"
              ? "bg-red-600 text-white"
              : "bg-emerald-600 text-white"
          }`}
        >
          {toast.type === "error" ? (
            <AlertCircle className="w-4 h-4" />
          ) : (
            <Check className="w-4 h-4" />
          )}
          <span className="text-sm font-medium">{toast.message}</span>
        </div>
      )}
    </div>
  );
}
