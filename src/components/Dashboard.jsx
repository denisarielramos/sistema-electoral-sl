import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import { generarAccessCode } from "../utils/accessCode";
import { cargarEstructuraCompleta } from "../services/estructuraService";

import {
  UserPlus,
  LogOut,
  FileText,
  ChevronDown,
  ChevronRight,
  Copy,
  Phone,
  Trash2,
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
  ClipboardList,
  Printer,
  ArrowLeft,
} from "lucide-react";

import AddPersonModal from "../AddPersonModal";
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
} from "../utils/estructuraHelpers";

// ======================= SMALL REUSABLE COMPONENTS =======================

const Badge = ({ children, variant = "default" }) => {
  const variants = {
    default: "bg-slate-100 text-slate-700",
    green: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    red: "bg-red-50 text-red-700 border border-red-200",
    blue: "bg-blue-50 text-blue-700 border border-blue-200",
    amber: "bg-amber-50 text-amber-700 border border-amber-200",
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
        <span className="text-lg text-slate-400 font-normal">
          /{total ?? 0}
        </span>
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
// Shows (confirmed/total) next to a coord or subcoord name.
// confirmed number is green; total is muted gray.
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
// counter: optional ReactNode rendered inline next to the name (e.g. VoteCounter)
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
        {rol && (
          <span className="ml-2 text-slate-400">• {rol}</span>
        )}
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

// ======================= PERSONA ROW (votante in tree) =======================
const VotanteRow = ({
  v,
  onTelefono,
  onDireccion,
  onConfirmar,
  onAnular,
  onQuitar,
  canConfirmar,
  canAnular,
}) => (
  <div className="bg-white border border-slate-200 rounded-lg p-3 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 hover:border-slate-300 transition-colors">
    <div className="flex-1 min-w-0">
      <DatosPersona persona={v} rol={null} />
      {v.voto_confirmado && (
        <div className="mt-1.5">
          <Badge variant="green">
            <Check className="w-3 h-3 mr-1" />
            Confirmado
          </Badge>
        </div>
      )}
    </div>
    <div className="flex gap-1.5 shrink-0 flex-wrap">
      <ActionBtn onClick={() => onTelefono("votante", v)} title="Editar teléfono" variant="green">
        <Phone className="w-3.5 h-3.5" />
      </ActionBtn>
      <ActionBtn onClick={() => onDireccion("votante", v)} title="Editar dirección" variant="blue">
        <MapPin className="w-3.5 h-3.5" />
      </ActionBtn>
      {!v.voto_confirmado && canConfirmar(v) && (
        <ActionBtn onClick={() => onConfirmar(v)} title="Confirmar voto" variant="success-solid">
          <Check className="w-3.5 h-3.5" />
        </ActionBtn>
      )}
      {v.voto_confirmado && canAnular(v) && (
        <ActionBtn onClick={() => onAnular(v)} title="Anular confirmación" variant="danger">
          <X className="w-3.5 h-3.5" />
        </ActionBtn>
      )}
      <ActionBtn onClick={() => onQuitar(v.ci, "votante")} title="Eliminar" variant="danger">
        <Trash2 className="w-3.5 h-3.5" />
      </ActionBtn>
    </div>
  </div>
);

// ======================= MAIN COMPONENT =======================
const Dashboard = ({ currentUser, onLogout }) => {
  // ======================= STATE =======================
  const [padron, setPadron] = useState([]);
  const [estructura, setEstructura] = useState({
    coordinadores: [],
    subcoordinadores: [],
    votantes: [],
  });

  const [showAddModal, setShowAddModal] = useState(false);
  const [modalType, setModalType] = useState("");
  const [expandedCoords, setExpandedCoords] = useState({});
  const [searchCI, setSearchCI] = useState("");

  const [phoneModalOpen, setPhoneModalOpen] = useState(false);
  const [phoneTarget, setPhoneTarget] = useState(null);
  const [phoneValue, setPhoneValue] = useState("+595");

  const [direccionModalOpen, setDireccionModalOpen] = useState(false);
  const [direccionTarget, setDireccionTarget] = useState(null);
  const [direccionValue, setDireccionValue] = useState("");

  const [confirmVotoModalOpen, setConfirmVotoModalOpen] = useState(false);
  const [confirmVotoTarget, setConfirmVotoTarget] = useState(null);
  const [isVotoUndoing, setIsVotoUndoing] = useState(false);
  const [isConfirmVotoLoading, setIsConfirmVotoLoading] = useState(false);

  // Sub confirmation state (uses subcoordinadores.confirmado column)
  const [confirmSubModalOpen, setConfirmSubModalOpen] = useState(false);
  const [confirmSubTarget, setConfirmSubTarget] = useState(null);
  const [isSubUndoing, setIsSubUndoing] = useState(false);
  const [isConfirmSubLoading, setIsConfirmSubLoading] = useState(false);

  const [loadingEstructura, setLoadingEstructura] = useState(true);

  // Verificar estructura view (superadmin only)
  const [verificarOpen, setVerificarOpen] = useState(false);
  const [verificarCoordCI, setVerificarCoordCI] = useState("");
  const [verificarPrinting, setVerificarPrinting] = useState(null); // "coord" | "sub-<ci>"

  // Non-blocking toast notification (replaces alert() to prevent scroll jump)
  const [toastMsg, setToastMsg] = useState(null);
  const toastTimer = React.useRef(null);
  const showToast = useCallback((msg, duration = 2500) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastMsg(msg);
    toastTimer.current = setTimeout(() => setToastMsg(null), duration);
  }, []);

  // ======================= HELPERS =======================
  const copyToClipboard = useCallback(async (text) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      showToast("Codigo copiado");
    } catch {
      showToast("No se pudo copiar");
    }
  }, []);

  const toggleExpand = useCallback((ci) => {
    const key = normalizeCI(ci);
    setExpandedCoords((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // ======================= CARGAR PADRÓN =======================
  const cargarPadronCompleto = async () => {
    try {
      const { count, error: countError } = await supabase
        .from("padron")
        .select("ci", { count: "exact", head: true });

      if (countError) { console.error("Error count padrón:", countError); return []; }
      if (!count || count <= 0) { setPadron([]); return []; }

      const { data, error } = await supabase
        .from("padron")
        .select("*")
        .range(0, count - 1);

      if (error) { console.error("Error cargando padrón:", error); return []; }
      const result = data || [];
      setPadron(result);
      return result;
    } catch (e) {
      console.error("Error cargando padrón:", e);
      return [];
    }
  };

  // ======================= RECARGAR ESTRUCTURA =======================
  // Accepts an optional padronData arg to avoid stale closure over padron state.
  const recargarEstructura = useCallback(async (padronDataOverride) => {
    try {
      setLoadingEstructura(true);

      let padronData = padronDataOverride || padron;
      if (!padronData || padronData.length === 0) {
        const { data: p } = await supabase.from("padron").select("*");
        padronData = p || [];
        setPadron(padronData);
      }

      const padronMap = new Map(
        (padronData || []).map((p) => [normalizeCI(p.ci), p])
      );

      const { data: coordsRaw, error: coordsErr } = await supabase
        .from("coordinadores").select("*");
      if (coordsErr) console.error("Error coords:", coordsErr);

      const { data: subsRaw, error: subsErr } = await supabase
        .from("subcoordinadores").select("*");
      if (subsErr) console.error("Error subs:", subsErr);

      const { data: votosRaw, error: votosErr } = await supabase
        .from("votantes").select("*");
      if (votosErr) console.error("Error votos:", votosErr);

      const mergePadron = (arr) =>
        (arr || []).map((x) => {
          const ci = normalizeCI(x.ci);
          const p = padronMap.get(ci);
          return { ...(p || {}), ...x, ci };
        });

      setEstructura({
        coordinadores: mergePadron(coordsRaw),
        subcoordinadores: mergePadron(subsRaw),
        votantes: mergePadron(votosRaw),
      });
    } catch (e) {
      console.error("Error recargando estructura:", e);
    } finally {
      setLoadingEstructura(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sequential init: load padron first, then pass it to recargarEstructura.
  useEffect(() => {
  if (!currentUser) return;

  const init = async () => {
    try {
      setLoadingEstructura(true);

     const data = await cargarEstructuraCompleta();
setEstructura(data);
setPadron(data.padron || []);
    } catch (err) {
      console.error("Error cargando estructura:", err);
    } finally {
      setLoadingEstructura(false);
    }
  };

  init();
}, [currentUser]);

  // ======================= RBAC =======================
  const canEditarTelefono = (tipo, persona) => {
    const role = currentUser?.role;
    if (!role || !persona) return false;
    if (role === "superadmin") return true;
    if (role === "coordinador") {
      const miCoordCI = normalizeCI(currentUser.ci);
      if (tipo === "subcoordinador") return normalizeCI(persona.coordinador_ci) === miCoordCI;
      if (tipo === "votante") return normalizeCI(persona.coordinador_ci) === miCoordCI;
      return false;
    }
    if (role === "subcoordinador") {
      if (tipo !== "votante") return false;
      return normalizeCI(persona.asignado_por) === normalizeCI(currentUser.ci);
    }
    return false;
  };

  const canEliminar = (tipo, persona) => {
    const role = currentUser?.role;
    if (!role || !persona) return false;
    if (role === "superadmin") return true;
    if (role === "coordinador") {
      const miCoordCI = normalizeCI(currentUser.ci);
      if (tipo === "subcoordinador") return normalizeCI(persona.coordinador_ci) === miCoordCI;
      if (tipo === "votante") return normalizeCI(persona.coordinador_ci) === miCoordCI;
      return false;
    }
    if (role === "subcoordinador") {
      if (tipo !== "votante") return false;
      return normalizeCI(persona.asignado_por) === normalizeCI(currentUser.ci);
    }
    return false;
  };

  const canConfirmarVoto = useCallback((votante) => {
    const role = currentUser?.role;
    if (!role || !votante) return false;
    if (role === "superadmin") return false;
    // Coordinador can confirm any voter whose coordinador_ci matches theirs
    // (covers direct voters AND voters assigned by their subcoordinadores)
    if (role === "coordinador") return normalizeCI(votante.coordinador_ci) === normalizeCI(currentUser.ci);
    if (role === "subcoordinador") return normalizeCI(votante.asignado_por) === normalizeCI(currentUser.ci);
    return false;
  }, [currentUser]);

  const canAnularConfirmacion = useCallback((votante) => {
    const role = currentUser?.role;
    if (!role || !votante) return false;
    // Coordinador can anular any voter in their network (direct + subcoord voters)
    if (role === "coordinador") return normalizeCI(votante.coordinador_ci) === normalizeCI(currentUser.ci);
    // Subcoordinador can also anular their own voters
    if (role === "subcoordinador") return normalizeCI(votante.asignado_por) === normalizeCI(currentUser.ci);
    return false;
  }, [currentUser]);

  // ======================= CONFIRM VOTO =======================
  const abrirConfirmVoto = (votante) => {
    if (!canConfirmarVoto(votante)) return;
    setConfirmVotoTarget(votante);
    setIsVotoUndoing(false);
    setConfirmVotoModalOpen(true);
  };

  const abrirAnularConfirmacion = (votante) => {
    if (!canAnularConfirmacion(votante)) return;
    setConfirmVotoTarget(votante);
    setIsVotoUndoing(true);
    setConfirmVotoModalOpen(true);
  };

  const handleConfirmVoto = async () => {
    if (!confirmVotoTarget) return;
    setIsConfirmVotoLoading(true);
    try {
      const newStatus = !isVotoUndoing;
      const targetCI = normalizeCI(confirmVotoTarget.ci);

      const { error } = await supabase
        .from("votantes")
        .update({ voto_confirmado: newStatus })
        .eq("ci", targetCI);

      if (error) {
        console.error("Error confirmando voto:", error);
        alert(error.message || "Error procesando confirmación");
        setIsConfirmVotoLoading(false);
        return;
      }

      // Update local state instead of reloading the full structure.
      // This gives instant UI feedback without a network round-trip.
      setEstructura((prev) => ({
        ...prev,
        votantes: prev.votantes.map((v) =>
          normalizeCI(v.ci) === targetCI
            ? { ...v, voto_confirmado: newStatus }
            : v
        ),
      }));

      setConfirmVotoModalOpen(false);
      setConfirmVotoTarget(null);
    } catch (e) {
      console.error("Error confirmando voto:", e);
      alert("Error procesando confirmación");
    } finally {
      setIsConfirmVotoLoading(false);
    }
  };

  // ======================= CONFIRM SUB =======================
  const abrirConfirmSub = (sub) => {
    setConfirmSubTarget(sub);
    setIsSubUndoing(false);
    setConfirmSubModalOpen(true);
  };

  const abrirAnularConfirmSub = (sub) => {
    setConfirmSubTarget(sub);
    setIsSubUndoing(true);
    setConfirmSubModalOpen(true);
  };

  const handleConfirmSub = async () => {
    if (!confirmSubTarget) return;
    setIsConfirmSubLoading(true);
    try {
      const newStatus = !isSubUndoing;
      const targetCI = normalizeCI(confirmSubTarget.ci);

      const { error } = await supabase
        .from("subcoordinadores")
        .update({ confirmado: newStatus })
        .eq("ci", targetCI);

      if (error) {
        console.error("Error confirmando sub:", error);
        alert(error.message || "Error procesando confirmación de subcoordinador");
        setIsConfirmSubLoading(false);
        return;
      }

      // Update local state instantly
      setEstructura((prev) => ({
        ...prev,
        subcoordinadores: prev.subcoordinadores.map((s) =>
          normalizeCI(s.ci) === targetCI
            ? { ...s, confirmado: newStatus }
            : s
        ),
      }));

      setConfirmSubModalOpen(false);
      setConfirmSubTarget(null);
    } catch (e) {
      console.error("Error confirmando sub:", e);
      alert("Error procesando confirmación de subcoordinador");
    } finally {
      setIsConfirmSubLoading(false);
    }
  };

  // ======================= LOGOUT =======================
  const handleLogout = () => {
    setExpandedCoords({});
    setSearchCI("");
    onLogout?.();
  };

  // ======================= TELEFONO =======================
  const abrirTelefono = (tipo, p) => {
    setPhoneTarget({ tipo, ...p });
    setPhoneValue(p.telefono || "+595");
    setPhoneModalOpen(true);
  };

  const guardarTelefono = async () => {
    if (!phoneTarget) return;
    if (currentUser.role !== "superadmin") {
      if (currentUser.role === "coordinador") {
        const miCI = normalizeCI(currentUser.ci);
        if (normalizeCI(phoneTarget.coordinador_ci) !== miCI) {
          alert("No tiene permiso para editar el teléfono de esta persona.");
          return;
        }
        if (phoneTarget.tipo === "coordinador") {
          alert("No tiene permiso para editar el teléfono de otro coordinador.");
          return;
        }
      }
      if (currentUser.role === "subcoordinador") {
        if (phoneTarget.tipo !== "votante") { alert("No tiene permiso para editar esta persona."); return; }
        if (normalizeCI(phoneTarget.asignado_por) !== normalizeCI(currentUser.ci)) {
          alert("No tiene permiso para editar el teléfono de este votante."); return;
        }
      }
    }
    const telefono = String(phoneValue || "").trim();
    if (!telefono) { alert("Ingrese número de teléfono."); return; }

    let tabla = "votantes";
    if (phoneTarget.tipo === "coordinador") tabla = "coordinadores";
    if (phoneTarget.tipo === "subcoordinador") tabla = "subcoordinadores";

    const targetCI = normalizeCI(phoneTarget.ci);
    const { error } = await supabase.from(tabla).update({ telefono }).eq("ci", targetCI);
    if (error) { console.error("Error guardando teléfono:", error); alert(error.message || "Error guardando teléfono"); return; }

    // Update only the affected array, preserve all other references
    const tipo = phoneTarget.tipo;
    const key = tipo === "coordinador" ? "coordinadores" : tipo === "subcoordinador" ? "subcoordinadores" : "votantes";
    setEstructura((prev) => ({
      ...prev,
      [key]: prev[key].map((x) =>
        normalizeCI(x.ci) === targetCI ? { ...x, telefono } : x
      ),
    }));

    setPhoneModalOpen(false);
    setPhoneTarget(null);
    setPhoneValue("+595");
    showToast("Teléfono actualizado correctamente");
  };

  // ======================= DIRECCIÓN =======================
  const abrirDireccion = (tipo, p) => {
    setDireccionTarget({ tipo, ...p });
    setDireccionValue(p.direccion_override || p.direccion || "");
    setDireccionModalOpen(true);
  };

  const guardarDireccion = async () => {
    if (!direccionTarget) return;
    if (currentUser.role !== "superadmin") {
      if (currentUser.role === "coordinador") {
        const miCI = normalizeCI(currentUser.ci);
        if (normalizeCI(direccionTarget.coordinador_ci) !== miCI) {
          alert("No tiene permiso para editar la dirección de esta persona."); return;
        }
        if (direccionTarget.tipo === "coordinador") {
          alert("No tiene permiso para editar la dirección de otro coordinador."); return;
        }
      }
      if (currentUser.role === "subcoordinador") {
        if (direccionTarget.tipo !== "votante") { alert("No tiene permiso para editar esta persona."); return; }
        if (normalizeCI(direccionTarget.asignado_por) !== normalizeCI(currentUser.ci)) {
          alert("No tiene permiso para editar la dirección de este votante."); return;
        }
      }
    }
    let tabla = "votantes";
    if (direccionTarget.tipo === "coordinador") tabla = "coordinadores";
    if (direccionTarget.tipo === "subcoordinador") tabla = "subcoordinadores";

    const direccion_override = String(direccionValue || "").trim();
    const targetCI = normalizeCI(direccionTarget.ci);
    const { error } = await supabase.from(tabla).update({ direccion_override }).eq("ci", targetCI);
    if (error) { console.error("Error guardando dirección:", error); alert(error.message || "Error guardando dirección"); return; }

    // Update only the affected array, preserve all other references
    const tipo = direccionTarget.tipo;
    const key = tipo === "coordinador" ? "coordinadores" : tipo === "subcoordinador" ? "subcoordinadores" : "votantes";
    setEstructura((prev) => ({
      ...prev,
      [key]: prev[key].map((x) =>
        normalizeCI(x.ci) === targetCI ? { ...x, direccion_override } : x
      ),
    }));

    setDireccionModalOpen(false);
    setDireccionTarget(null);
    setDireccionValue("");
    showToast("Dirección actualizada correctamente");
  };

  // ======================= AGREGAR PERSONA =======================
  const handleAgregarPersona = async (persona) => {
    if (!modalType) return alert("Seleccione tipo.");
    const ci = normalizeCI(persona.ci);

    if (modalType === "coordinador") {
      if (currentUser.role !== "superadmin") { alert("Solo el superadmin puede agregar coordinadores."); return; }
      const accessCode = generarAccessCode(8);
      const { data: inserted, error } = await supabase.from("coordinadores").insert([{
        ci, login_code: accessCode, asignado_por_nombre: "Superadmin",
      }]).select();
      if (error) { console.error("Error creando coordinador:", error); alert(error.message || "Error creando coordinador"); return; }

      // Merge with padron data and add to local state
      const padronEntry = padron.find((p) => normalizeCI(p.ci) === ci) || {};
      const newCoord = { ...padronEntry, ...(inserted?.[0] || { ci, login_code: accessCode, asignado_por_nombre: "Superadmin" }), ci };
      setEstructura((prev) => ({
        ...prev,
        coordinadores: [...prev.coordinadores, newCoord],
      }));

      showToast(`Coordinador creado. Codigo: ${accessCode}`);
      try { await navigator.clipboard.writeText(accessCode); } catch { /* noop */ }
      setShowAddModal(false);
      return;
    }

    if (modalType === "subcoordinador") {
      if (currentUser.role !== "coordinador") { alert("Solo un coordinador puede agregar subcoordinadores."); return; }
      const accessCode = generarAccessCode(8);
      const insertPayload = {
        ci,
        coordinador_ci: normalizeCI(currentUser.ci),
        login_code: accessCode,
        asignado_por_nombre: `${currentUser.nombre} ${currentUser.apellido}`,
      };
      const { data: inserted, error } = await supabase.from("subcoordinadores").insert([insertPayload]).select();
      if (error) { console.error("Error creando subcoordinador:", error); alert(error.message || "Error creando subcoordinador"); return; }

      // Merge with padron data and add to local state
      const padronEntry = padron.find((p) => normalizeCI(p.ci) === ci) || {};
      const newSub = { ...padronEntry, ...(inserted?.[0] || insertPayload), ci };
      setEstructura((prev) => ({
        ...prev,
        subcoordinadores: [...prev.subcoordinadores, newSub],
      }));

      showToast(`Subcoordinador creado. Codigo: ${accessCode}`);
      try { await navigator.clipboard.writeText(accessCode); } catch { /* noop */ }
      setShowAddModal(false);
      return;
    }

    if (modalType === "votante") {
      if (currentUser.role !== "coordinador" && currentUser.role !== "subcoordinador") { alert("No permitido."); return; }
      let coordinador_ci = null;
      if (currentUser.role === "coordinador") {
        coordinador_ci = normalizeCI(currentUser.ci);
      } else {
        const sub = (estructura.subcoordinadores || []).find(
          (s) => normalizeCI(s.ci) === normalizeCI(currentUser.ci)
        );
        coordinador_ci = normalizeCI(sub?.coordinador_ci);
      }
      if (!coordinador_ci) { alert("Error interno: no se pudo resolver coordinador_ci"); return; }
      const insertPayload = {
        ci,
        asignado_por: normalizeCI(currentUser.ci),
        asignado_por_nombre: `${currentUser.nombre} ${currentUser.apellido}`,
        coordinador_ci,
      };
      const { data: inserted, error } = await supabase.from("votantes").insert([insertPayload]).select();
      if (error) { console.error("Error creando votante:", error); alert(error.message || "Error creando votante"); return; }

      // Merge with padron data and add to local state
      const padronEntry = padron.find((p) => normalizeCI(p.ci) === ci) || {};
      const newVotante = { ...padronEntry, ...(inserted?.[0] || insertPayload), ci };
      setEstructura((prev) => ({
        ...prev,
        votantes: [...prev.votantes, newVotante],
      }));

      setShowAddModal(false);
    }
  };

  // ======================= QUITAR PERSONA =======================
  const quitarPersona = async (ciRaw, tipo) => {
    if (!window.confirm("¿Quitar persona?")) return;
    const isSuper = currentUser.role === "superadmin";
    const ci = normalizeCI(ciRaw);
    try {
      if (tipo === "coordinador") {
        if (!isSuper) return alert("Solo superadmin.");
        // DB: cascade delete subs and voters under this coord
        await supabase.from("subcoordinadores").delete().eq("coordinador_ci", ci);
        await supabase.from("votantes").delete().eq("coordinador_ci", ci);
        await supabase.from("votantes").delete().eq("asignado_por", ci);
        await supabase.from("coordinadores").delete().eq("ci", ci);
        // Local: remove coord + their subs + all voters under that coord
        setEstructura((prev) => {
          const subsToRemove = new Set(
            prev.subcoordinadores.filter((s) => normalizeCI(s.coordinador_ci) === ci).map((s) => normalizeCI(s.ci))
          );
          return {
            coordinadores: prev.coordinadores.filter((c) => normalizeCI(c.ci) !== ci),
            subcoordinadores: prev.subcoordinadores.filter((s) => normalizeCI(s.coordinador_ci) !== ci),
            votantes: prev.votantes.filter((v) =>
              normalizeCI(v.coordinador_ci) !== ci && normalizeCI(v.asignado_por) !== ci && !subsToRemove.has(normalizeCI(v.asignado_por))
            ),
          };
        });
      }
      if (tipo === "subcoordinador") {
        await supabase.from("votantes").delete().eq("asignado_por", ci);
        await supabase.from("subcoordinadores").delete().eq("ci", ci);
        // Local: remove sub + their voters
        setEstructura((prev) => ({
          ...prev,
          subcoordinadores: prev.subcoordinadores.filter((s) => normalizeCI(s.ci) !== ci),
          votantes: prev.votantes.filter((v) => normalizeCI(v.asignado_por) !== ci),
        }));
      }
      if (tipo === "votante") {
        await supabase.from("votantes").delete().eq("ci", ci);
        // Local: remove voter
        setEstructura((prev) => ({
          ...prev,
          votantes: prev.votantes.filter((v) => normalizeCI(v.ci) !== ci),
        }));
      }
    } catch (e) {
      console.error("Error quitando persona:", e);
      alert("Error quitando persona");
    }
  };

  // ======================= STATS =======================
  const stats = useMemo(
    () => getEstadisticas(estructura, currentUser),
    [estructura, currentUser]
  );

  // ======================= O(1) LOOKUP MAPS =======================
  // Build once per estructura change; used everywhere in render.

  // subsByCoordCI: coordCI -> sub[]
  const subsByCoordCI = useMemo(() => {
    const map = new Map();
    (estructura.subcoordinadores || []).forEach((s) => {
      const key = normalizeCI(s.coordinador_ci);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(s);
    });
    return map;
  }, [estructura.subcoordinadores]);

  // votantesByAsignadoPor: asignadoPorCI -> votante[]
  const votantesByAsignadoPor = useMemo(() => {
    const map = new Map();
    (estructura.votantes || []).forEach((v) => {
      const key = normalizeCI(v.asignado_por);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(v);
    });
    return map;
  }, [estructura.votantes]);

  // votantesByCoordCI: coordCI -> votante[]  (all voters under a coord, incl. via subs)
  const votantesByCoordCI = useMemo(() => {
    const map = new Map();
    (estructura.votantes || []).forEach((v) => {
      const key = normalizeCI(v.coordinador_ci);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(v);
    });
    return map;
  }, [estructura.votantes]);

  // Helper shortcuts (O(1))
  const getSubsDeCoord = useCallback(
    (coordCI) => subsByCoordCI.get(normalizeCI(coordCI)) || [],
    [subsByCoordCI]
  );
  const getVotantesDeSubcoordFast = useCallback(
    (subCI) => votantesByAsignadoPor.get(normalizeCI(subCI)) || [],
    [votantesByAsignadoPor]
  );
  const getVotantesDirectosCoordFast = useCallback(
    (coordCI) => votantesByAsignadoPor.get(normalizeCI(coordCI)) || [],
    [votantesByAsignadoPor]
  );
  const getMisVotantesFast = useCallback(
    () => votantesByAsignadoPor.get(normalizeCI(currentUser?.ci)) || [],
    [votantesByAsignadoPor, currentUser]
  );
  const getMisSubcoordinadoresFast = useCallback(
    () => subsByCoordCI.get(normalizeCI(currentUser?.ci)) || [],
    [subsByCoordCI, currentUser]
  );

  // ======================= PER-PERSON VOTE COUNTS =======================
  // Coordinador inline counter: 1 (self auto) + subs + voters
  // Subcoordinador inline counter: 1 (self auto) + voters
  const voteCountsByCoord = useMemo(() => {
    const map = {};
    (estructura.coordinadores || []).forEach((coord) => {
      const ci = normalizeCI(coord.ci);
      const subs = subsByCoordCI.get(ci) || [];
      const voters = votantesByCoordCI.get(ci) || [];
      const subsConfirmed = subs.filter((s) => s.confirmado === true).length;
      const votersConfirmed = voters.filter((v) => v.voto_confirmado === true).length;
      map[ci] = {
        total: 1 + subs.length + voters.length,
        confirmed: 1 + subsConfirmed + votersConfirmed,
      };
    });
    return map;
  }, [estructura.coordinadores, subsByCoordCI, votantesByCoordCI]);

  const voteCountsBySub = useMemo(() => {
    const map = {};
    (estructura.subcoordinadores || []).forEach((sub) => {
      const ci = normalizeCI(sub.ci);
      const voters = votantesByAsignadoPor.get(ci) || [];
      const votersConfirmed = voters.filter((v) => v.voto_confirmado === true).length;
      map[ci] = {
        total: 1 + voters.length,
        confirmed: 1 + votersConfirmed,
      };
    });
    return map;
  }, [estructura.subcoordinadores, votantesByAsignadoPor]);

  // ======================= DISPONIBLES =======================
  const disponibles = useMemo(
    () => getPersonasDisponibles(padron, estructura),
    [padron, estructura]
  );

  // ======================= BUSCADOR =======================
  const normalizeText = (v) =>
    (v ?? "").toString().toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ").trim();

  // Returns true if persona matches all tokens in the query
  const personaMatchesQuery = useCallback(
    (persona, tokens) => {
      if (!tokens.length) return true;
      const fields = [
        normalizeText(persona?.ci),
        normalizeText(persona?.nombre),
        normalizeText(persona?.apellido),
        normalizeText(`${persona?.nombre} ${persona?.apellido}`),
        normalizeText(`${persona?.apellido} ${persona?.nombre}`),
        normalizeText(persona?.seccional),
        normalizeText(persona?.local_votacion),
        normalizeText(persona?.mesa),
        normalizeText(persona?.orden),
      ];
      return tokens.every((t) => fields.some((f) => f.includes(t)));
    },
    []
  );

  const busquedaTokens = useMemo(() => {
    const q = normalizeText(searchCI);
    return q ? q.split(" ").filter(Boolean) : [];
  }, [searchCI]);

  // matchCI: set of normalized CIs that match the search (for quick lookup in tree)
  const matchCI = useMemo(() => {
    if (!busquedaTokens.length) return null; // null = no filter active
    const set = new Set();
    const check = (persona) => {
      if (personaMatchesQuery(persona, busquedaTokens)) {
        set.add(normalizeCI(persona.ci));
      }
    };
    (estructura.coordinadores || []).forEach(check);
    (estructura.subcoordinadores || []).forEach(check);
    (estructura.votantes || []).forEach(check);
    return set;
  }, [busquedaTokens, estructura, personaMatchesQuery]);

  // ======================= PDF =======================
  const descargarPDF = async () => {
    if (!currentUser) { alert("Usuario no válido"); return; }
    try {
      let doc;
      let filename = "reporte";
      if (currentUser.role === "superadmin") {
        doc = await generateSuperadminPDF({ estructura, currentUser });
        filename = "reporte-superadmin";
      } else if (currentUser.role === "coordinador") {
        doc = await generateCoordinadorPDF({ estructura, currentUser });
        filename = "reporte-coordinador";
      } else if (currentUser.role === "subcoordinador") {
        doc = await generateSubcoordinadorPDF({ estructura, currentUser });
        filename = "reporte-subcoordinador";
      } else {
        alert("Rol no soportado para reportes");
        return;
      }
      const timestamp = new Date().toISOString().slice(0, 10);
      doc.save(`${filename}-${timestamp}.pdf`);
    } catch (error) {
      console.error("Error generando PDF:", error);
      alert("Error al generar el reporte PDF");
    }
  };

  // ======================= ROLE LABEL =======================
  const roleLabel = {
    superadmin: "Superadmin",
    coordinador: "Coordinador",
    subcoordinador: "Sub-coordinador",
  }[currentUser.role] ?? currentUser.role;

  // ======================= UI =======================
  return (
    <div className="min-h-screen bg-slate-100">
      {/* LOADING SPLASH */}
      {loadingEstructura && (
        <div className="fixed inset-0 z-50 bg-white/95 backdrop-blur-sm flex flex-col items-center justify-center">
          <div className="w-10 h-10 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
          <p className="mt-4 text-brand-700 font-semibold text-sm">
            Cargando estructura...
          </p>
        </div>
      )}

      {/* =========== HEADER =========== */}
      <header className="bg-brand-700 shadow-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-4">
          {/* Brand */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-1.5 bg-white/10 rounded-lg shrink-0">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-bold text-white leading-tight truncate">
                Sistema Electoral
              </h1>
              <p className="text-brand-200 text-xs truncate">
                {currentUser.nombre} {currentUser.apellido}
                <span className="ml-1.5 px-1.5 py-0.5 bg-white/10 rounded text-brand-100 text-xs">
                  {roleLabel}
                </span>
              </p>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-3 h-9 rounded-lg text-sm font-medium transition-colors shrink-0 border-0 shadow-none"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Salir</span>
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">

        {/* =========== STATS CARDS =========== */}
        <section aria-label="Resumen estadístico">
          {currentUser.role === "superadmin" && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
              <StatCard label="Total red" value={stats?.totalRed} icon={TrendingUp} accent />
              <StatCard label="Coordinadores" value={stats?.coordinadores} icon={Users} />
              <StatCard label="Subcoordinadores" value={stats?.subcoordinadores} icon={Users} />
              <StatCard label="Votantes" value={stats?.votantes} icon={Users} />
              <StatCard label="Confirmados" value={stats?.totalConfirmados} icon={CheckCircle2} />
              <StatCard label="Pendientes" value={stats?.votosPendientes} icon={AlertCircle} />
            </div>
          )}
          {currentUser.role === "superadmin" && (
            <div className="mt-3">
              <VoteProgressCard
                confirmed={stats?.totalConfirmados}
                total={stats?.totalConfirmable}
                percentage={stats?.porcentajeConfirmados}
              />
            </div>
          )}

          {currentUser.role === "coordinador" && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
              <StatCard label="Total red" value={stats?.totalRed} icon={TrendingUp} accent />
              <StatCard label="Subcoordinadores" value={stats?.subcoordinadores} icon={Users} />
              <StatCard label="Votantes directos" value={stats?.votantesDirectos} icon={Users} />
              <StatCard label="Total votantes" value={stats?.totalVotantes} icon={Users} />
              <StatCard label="Confirmados" value={stats?.totalConfirmados} icon={CheckCircle2} />
              <StatCard label="Pendientes" value={stats?.votosPendientes} icon={AlertCircle} />
            </div>
          )}
          {currentUser.role === "coordinador" && (
            <div className="mt-3">
              <VoteProgressCard
                confirmed={stats?.totalConfirmados}
                total={stats?.totalConfirmable}
                percentage={stats?.porcentajeConfirmados}
              />
            </div>
          )}

          {currentUser.role === "subcoordinador" && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
              <StatCard label="Total red" value={stats?.totalRed} icon={TrendingUp} accent />
              <StatCard label="Mis votantes" value={stats?.votantes} icon={Users} />
              <StatCard label="Confirmados" value={stats?.totalConfirmados} icon={CheckCircle2} />
              <StatCard label="Pendientes" value={stats?.votosPendientes} icon={AlertCircle} />
            </div>
          )}
          {currentUser.role === "subcoordinador" && (
            <div className="mt-3">
              <VoteProgressCard
                confirmed={stats?.totalConfirmados}
                total={stats?.totalConfirmable}
                percentage={stats?.porcentajeConfirmados}
              />
            </div>
          )}
        </section>

        {/* =========== ACTION BUTTONS =========== */}
        <section className="flex flex-wrap gap-2" aria-label="Acciones">
          {currentUser.role === "superadmin" && (
            <button
              onClick={() => { setModalType("coordinador"); setShowAddModal(true); }}
              className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-4 h-10 rounded-xl text-sm font-medium transition-colors shadow-sm w-full sm:w-auto border-0"
            >
              <UserPlus className="w-4 h-4" />
              Agregar Coordinador
            </button>
          )}

          {currentUser.role === "superadmin" && (
            <button
              onClick={() => { setVerificarOpen(true); setVerificarCoordCI(""); }}
              className="inline-flex items-center gap-2 border border-brand-300 bg-white hover:bg-brand-50 text-brand-700 px-4 h-10 rounded-xl text-sm font-medium transition-colors w-full sm:w-auto shadow-sm"
            >
              <ClipboardList className="w-4 h-4" />
              Verificar estructura
            </button>
          )}

          {currentUser.role === "coordinador" && (
            <button
              onClick={() => { setModalType("subcoordinador"); setShowAddModal(true); }}
              className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-4 h-10 rounded-xl text-sm font-medium transition-colors shadow-sm w-full sm:w-auto border-0"
            >
              <UserPlus className="w-4 h-4" />
              Agregar Subcoordinador
            </button>
          )}

          {(currentUser.role === "coordinador" || currentUser.role === "subcoordinador") && (
            <button
              onClick={() => { setModalType("votante"); setShowAddModal(true); }}
              className="inline-flex items-center gap-2 border border-brand-300 bg-white hover:bg-brand-50 text-brand-700 px-4 h-10 rounded-xl text-sm font-medium transition-colors w-full sm:w-auto shadow-sm"
            >
              <UserPlus className="w-4 h-4" />
              Agregar Votante
            </button>
          )}

          <button
            onClick={descargarPDF}
            className="inline-flex items-center gap-2 border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 px-4 h-10 rounded-xl text-sm font-medium transition-colors w-full sm:w-auto shadow-sm"
          >
            <FileText className="w-4 h-4" />
            Descargar PDF
          </button>
        </section>

        {/* =========== BUSCADOR =========== */}
        <section aria-label="Búsqueda interna">
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-card">
            <label
              htmlFor="searchCI"
              className="block text-sm font-semibold text-slate-700 mb-2"
            >
              Buscar en mi estructura
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                id="searchCI"
                value={searchCI}
                onChange={(e) => setSearchCI(e.target.value)}
                placeholder="CI, nombre, apellido o combinación..."
                className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent bg-slate-50"
              />
              {searchCI && (
                <button
                  onClick={() => setSearchCI("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0 bg-transparent border-0 shadow-none"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            {busquedaTokens.length > 0 && (
              <p className="text-xs text-slate-500 mt-2">
                {matchCI ? matchCI.size : 0} persona{matchCI && matchCI.size !== 1 ? "s" : ""} encontrada{matchCI && matchCI.size !== 1 ? "s" : ""} — mostrando en la estructura
              </p>
            )}
          </div>
        </section>

        {/* =========== MI ESTRUCTURA =========== */}
        <section aria-label="Mi estructura">
          <div className="bg-white border border-slate-200 rounded-xl shadow-card overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
              <Users className="w-4 h-4 text-slate-500" />
              <h2 className="text-base font-bold text-slate-800">Mi Estructura</h2>
            </div>

            <div className="p-4 sm:p-5">

              {/* Loading guard: prevent rendering rows while structure is still building */}
              {loadingEstructura && (
                <div className="flex items-center justify-center py-12">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-2 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
                    <p className="text-sm text-slate-400">Cargando estructura...</p>
                  </div>
                </div>
              )}

              {/* ====== SUPERADMIN ====== */}
              {!loadingEstructura && currentUser.role === "superadmin" && (() => {
                const coords = estructura.coordinadores || [];
                // When searching: a coord is visible if the coord itself matches,
                // or any of its subs or voters match.
                const visibleCoords = matchCI
                  ? coords.filter((coord) => {
                      const ci = normalizeCI(coord.ci);
                      if (matchCI.has(ci)) return true;
                      const subs = getSubsDeCoord(ci);
                      if (subs.some((s) => matchCI.has(normalizeCI(s.ci)))) return true;
                      const voters = votantesByCoordCI.get(ci) || [];
                      return voters.some((v) => matchCI.has(normalizeCI(v.ci)));
                    })
                  : coords;

                return (
                <div className="space-y-2">
                  {coords.length === 0 && (
                    <div className="text-center py-10">
                      <Users className="w-10 h-10 text-slate-200 mx-auto mb-2" />
                      <p className="text-sm text-slate-400">No hay coordinadores aún.</p>
                    </div>
                  )}
                  {coords.length > 0 && visibleCoords.length === 0 && matchCI && (
                    <div className="text-center py-10">
                      <Search className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                      <p className="text-sm text-slate-400">No se encontraron coincidencias.</p>
                    </div>
                  )}

                  {visibleCoords.map((coord) => {
                    const coordCI = normalizeCI(coord.ci);
                    const coordCounts = voteCountsByCoord[coordCI] ?? { confirmed: 0, total: 0 };
                    // When searching, auto-expand coords that have matches inside
                    const isExpanded = matchCI
                      ? expandedCoords[coordCI] || (
                          getSubsDeCoord(coordCI).some((s) => matchCI.has(normalizeCI(s.ci))) ||
                          (votantesByCoordCI.get(coordCI) || []).some((v) => matchCI.has(normalizeCI(v.ci)))
                        )
                      : expandedCoords[coordCI];
                    return (
                    <div key={coord.ci} className="border border-slate-200 rounded-xl overflow-hidden">
                      {/* Coord header */}
                      <div
                        className={`flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-3 sm:p-4 cursor-pointer hover:bg-slate-50 transition-colors ${matchCI && matchCI.has(coordCI) ? "bg-brand-50" : "bg-white"}`}
                        onClick={() => toggleExpand(coord.ci)}
                      >
                        <div className="flex items-start gap-2 flex-1 min-w-0">
                          <span className="text-brand-600 shrink-0 mt-0.5">
                            {isExpanded
                              ? <ChevronDown className="w-4 h-4" />
                              : <ChevronRight className="w-4 h-4" />}
                          </span>
                          <div className="flex-1 min-w-0">
                            <DatosPersona
                              persona={coord}
                              rol="Coordinador"
                              loginCode={coord.login_code}
                              onCopy={copyToClipboard}
                              counter={<VoteCounter confirmed={coordCounts.confirmed} total={coordCounts.total} />}
                            />
                          </div>
                        </div>
                        <div className="flex gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                          <ActionBtn onClick={() => abrirTelefono("coordinador", coord)} title="Editar teléfono" variant="green">
                            <Phone className="w-3.5 h-3.5" />
                          </ActionBtn>
                          <ActionBtn onClick={() => abrirDireccion("coordinador", coord)} title="Editar dirección" variant="blue">
                            <MapPin className="w-3.5 h-3.5" />
                          </ActionBtn>
                          <ActionBtn onClick={() => quitarPersona(coord.ci, "coordinador")} title="Eliminar coordinador" variant="danger-solid">
                            <Trash2 className="w-3.5 h-3.5" />
                          </ActionBtn>
                        </div>
                      </div>

                      {/* Coord expanded */}
                      {isExpanded && (
                        <div className="border-t border-slate-100 bg-slate-50/50 px-4 pb-4 pt-3 overflow-x-auto animate-fade-in">
                          <div className="space-y-2 min-w-0">
                            {(() => {
                              const allSubs = getSubsDeCoord(coordCI);
                              const visibleSubs = matchCI
                                ? allSubs.filter((s) => {
                                    const sCI = normalizeCI(s.ci);
                                    if (matchCI.has(sCI)) return true;
                                    return getVotantesDeSubcoordFast(sCI).some((v) => matchCI.has(normalizeCI(v.ci)));
                                  })
                                : allSubs;
                              return visibleSubs.map((sub) => {
                                const subCI = normalizeCI(sub.ci);
                                const subCounts = voteCountsBySub[subCI] ?? { confirmed: 0, total: 0 };
                                const subExpanded = matchCI
                                  ? expandedCoords[subCI] || getVotantesDeSubcoordFast(subCI).some((v) => matchCI.has(normalizeCI(v.ci)))
                                  : expandedCoords[subCI];
                                return (
                                <div key={sub.ci} className="border border-slate-200 rounded-lg bg-white overflow-hidden">
                                  {/* Sub header */}
                                  <div
                                    className={`flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between p-3 cursor-pointer hover:bg-slate-50 transition-colors ${matchCI && matchCI.has(subCI) ? "bg-brand-50" : ""}`}
                                    onClick={() => toggleExpand(sub.ci)}
                                  >
                                    <div className="flex items-start gap-2 flex-1 min-w-0">
                                      <span className="text-brand-500 shrink-0 mt-0.5">
                                        {subExpanded
                                          ? <ChevronDown className="w-3.5 h-3.5" />
                                          : <ChevronRight className="w-3.5 h-3.5" />}
                                      </span>
                                      <div className="flex-1 min-w-0">
                                        <DatosPersona
                                          persona={sub}
                                          rol="Sub-coordinador"
                                          loginCode={sub.login_code}
                                          onCopy={copyToClipboard}
                                          counter={<VoteCounter confirmed={subCounts.confirmed} total={subCounts.total} />}
                                        />
                                        {sub.confirmado && (
                                          <div className="mt-1">
                                            <Badge variant="green">
                                              <Check className="w-3 h-3 mr-1" />
                                              Sub confirmado
                                            </Badge>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                    <div className="flex gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                                      <ActionBtn onClick={() => abrirTelefono("subcoordinador", sub)} title="Editar teléfono" variant="green">
                                        <Phone className="w-3.5 h-3.5" />
                                      </ActionBtn>
                                      <ActionBtn onClick={() => abrirDireccion("subcoordinador", sub)} title="Editar dirección" variant="blue">
                                        <MapPin className="w-3.5 h-3.5" />
                                      </ActionBtn>
                                      <ActionBtn onClick={() => quitarPersona(sub.ci, "subcoordinador")} title="Eliminar" variant="danger-solid">
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </ActionBtn>
                                    </div>
                                  </div>

                                  {/* Sub votantes */}
                                  {subExpanded && (
                                    <div className="border-t border-slate-100 bg-slate-50 px-3 pb-3 pt-2 overflow-x-auto animate-fade-in">
                                      <div className="space-y-1.5 min-w-0">
                                        {(() => {
                                          const allV = getVotantesDeSubcoordFast(subCI);
                                          const visV = matchCI ? allV.filter((v) => matchCI.has(normalizeCI(v.ci))) : allV;
                                          if (visV.length === 0) return (
                                            <p className="text-xs text-slate-400 py-2 text-center">
                                              {matchCI ? "Sin coincidencias en votantes." : "Sin votantes asignados."}
                                            </p>
                                          );
                                          return visV.map((v) => (
                                            <VotanteRow
                                              key={v.ci}
                                              v={v}
                                              onTelefono={abrirTelefono}
                                              onDireccion={abrirDireccion}
                                              onConfirmar={abrirConfirmVoto}
                                              onAnular={abrirAnularConfirmacion}
                                              onQuitar={quitarPersona}
                                              canConfirmar={canConfirmarVoto}
                                              canAnular={canAnularConfirmacion}
                                            />
                                          ));
                                        })()}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                              });
                            })()}

                            {getSubsDeCoord(coordCI).length === 0 && (
                              <p className="text-xs text-slate-400 text-center py-2">
                                Sin subcoordinadores asignados.
                              </p>
                            )}

                            {/* Direct voters of this coordinator */}
                            {(() => {
                              const allDirectVoters = getVotantesDirectosCoordFast(coordCI);
                              const directVoters = matchCI
                                ? allDirectVoters.filter((v) => matchCI.has(normalizeCI(v.ci)))
                                : allDirectVoters;
                              if (directVoters.length === 0) return null;
                              return (
                                <div className="border border-slate-200 rounded-lg bg-white overflow-hidden">
                                  <div className="px-3 py-2 bg-slate-50 border-b border-slate-100">
                                    <p className="font-semibold text-xs text-slate-600 flex items-center gap-1.5">
                                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                                      Votantes directos del coordinador
                                      <span className="text-slate-400 font-normal">({directVoters.length})</span>
                                    </p>
                                  </div>
                                  <div className="p-2.5 space-y-1.5">
                                    {directVoters.map((v) => (
                                      <VotanteRow
                                        key={v.ci}
                                        v={v}
                                        onTelefono={abrirTelefono}
                                        onDireccion={abrirDireccion}
                                        onConfirmar={abrirConfirmVoto}
                                        onAnular={abrirAnularConfirmacion}
                                        onQuitar={quitarPersona}
                                        canConfirmar={canConfirmarVoto}
                                        canAnular={canAnularConfirmacion}
                                      />
                                    ))}
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                  })}
                </div>
                );
              })()}

              {/* ====== COORDINADOR ====== */}
              {!loadingEstructura && currentUser.role === "coordinador" && (() => {
                const allMisSubs = getMisSubcoordinadoresFast();
                const allMisVotantes = getMisVotantesFast();
                const visibleSubs = matchCI
                  ? allMisSubs.filter((s) => {
                      const sCI = normalizeCI(s.ci);
                      if (matchCI.has(sCI)) return true;
                      return getVotantesDeSubcoordFast(sCI).some((v) => matchCI.has(normalizeCI(v.ci)));
                    })
                  : allMisSubs;
                const visibleDirectVotantes = matchCI
                  ? allMisVotantes.filter((v) => matchCI.has(normalizeCI(v.ci)))
                  : allMisVotantes;
                const noResults = matchCI && visibleSubs.length === 0 && visibleDirectVotantes.length === 0;
                return (
                <div className="space-y-2">
                  {allMisSubs.length === 0 && allMisVotantes.length === 0 && (
                    <div className="text-center py-10">
                      <Users className="w-10 h-10 text-slate-200 mx-auto mb-2" />
                      <p className="text-sm text-slate-400">Aún no tiene subcoordinadores ni votantes asignados.</p>
                    </div>
                  )}
                  {noResults && (
                    <div className="text-center py-10">
                      <Search className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                      <p className="text-sm text-slate-400">No se encontraron coincidencias.</p>
                    </div>
                  )}

                  {visibleSubs.map((sub) => {
                    const subCI = normalizeCI(sub.ci);
                    const subCounts = voteCountsBySub[subCI] ?? { confirmed: 0, total: 0 };
                    const subExpanded = matchCI
                      ? expandedCoords[subCI] || getVotantesDeSubcoordFast(subCI).some((v) => matchCI.has(normalizeCI(v.ci)))
                      : expandedCoords[subCI];
                    return (
                    <div key={sub.ci} className="border border-slate-200 rounded-xl overflow-hidden">
                      {/* Sub header */}
                      <div
                        className={`flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between p-3 sm:p-4 cursor-pointer hover:bg-slate-50 transition-colors ${matchCI && matchCI.has(subCI) ? "bg-brand-50" : "bg-white"}`}
                        onClick={() => toggleExpand(sub.ci)}
                      >
                        <div className="flex items-start gap-2 flex-1 min-w-0">
                          <span className="text-brand-600 shrink-0 mt-0.5">
                            {subExpanded
                              ? <ChevronDown className="w-4 h-4" />
                              : <ChevronRight className="w-4 h-4" />}
                          </span>
                          <div className="flex-1 min-w-0">
                            <DatosPersona
                              persona={sub}
                              rol="Sub-coordinador"
                              loginCode={sub.login_code}
                              onCopy={copyToClipboard}
                              counter={<VoteCounter confirmed={subCounts.confirmed} total={subCounts.total} />}
                            />
                            {sub.confirmado && (
                              <div className="mt-1">
                                <Badge variant="green">
                                  <Check className="w-3 h-3 mr-1" />
                                  Sub confirmado
                                </Badge>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                          {!sub.confirmado && (
                            <ActionBtn onClick={() => abrirConfirmSub(sub)} title="Confirmar subcoordinador" variant="success-solid">
                              <Check className="w-3.5 h-3.5" />
                            </ActionBtn>
                          )}
                          {sub.confirmado && (
                            <ActionBtn onClick={() => abrirAnularConfirmSub(sub)} title="Anular confirmación sub" variant="danger">
                              <X className="w-3.5 h-3.5" />
                            </ActionBtn>
                          )}
                          <ActionBtn onClick={() => abrirTelefono("subcoordinador", sub)} title="Editar teléfono" variant="green">
                            <Phone className="w-3.5 h-3.5" />
                          </ActionBtn>
                          <ActionBtn onClick={() => abrirDireccion("subcoordinador", sub)} title="Editar dirección" variant="blue">
                            <MapPin className="w-3.5 h-3.5" />
                          </ActionBtn>
                          <ActionBtn onClick={() => quitarPersona(sub.ci, "subcoordinador")} title="Eliminar" variant="danger-solid">
                            <Trash2 className="w-3.5 h-3.5" />
                          </ActionBtn>
                        </div>
                      </div>

                      {/* Sub votantes expanded */}
                      {subExpanded && (
                        <div className="border-t border-slate-100 bg-slate-50 px-3 pb-3 pt-2 overflow-x-auto animate-fade-in">
                          <p className="text-xs font-semibold text-slate-600 mb-2">
                            Votantes asignados
                          </p>
                          <div className="space-y-1.5 min-w-0">
                            {(() => {
                              const allV = getVotantesDeSubcoordFast(subCI);
                              const visV = matchCI ? allV.filter((v) => matchCI.has(normalizeCI(v.ci))) : allV;
                              if (visV.length === 0) return (
                                <p className="text-xs text-slate-400 text-center py-2">
                                  {matchCI ? "Sin coincidencias en votantes." : "Sin votantes asignados."}
                                </p>
                              );
                              return visV.map((v) => (
                                <VotanteRow
                                  key={v.ci}
                                  v={v}
                                  onTelefono={abrirTelefono}
                                  onDireccion={abrirDireccion}
                                  onConfirmar={abrirConfirmVoto}
                                  onAnular={abrirAnularConfirmacion}
                                  onQuitar={quitarPersona}
                                  canConfirmar={canConfirmarVoto}
                                  canAnular={canAnularConfirmacion}
                                />
                              ));
                            })()}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                  })}

                  {/* Votantes directos del coordinador */}
                  {visibleDirectVotantes.length > 0 && (
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
                        <p className="font-semibold text-sm text-slate-700 flex items-center gap-2">
                          <Clock className="w-4 h-4 text-slate-400" />
                          Mis votantes directos
                        </p>
                      </div>
                      <div className="p-3 space-y-1.5">
                        {visibleDirectVotantes.map((v) => (
                          <VotanteRow
                            key={v.ci}
                            v={v}
                            onTelefono={abrirTelefono}
                            onDireccion={abrirDireccion}
                            onConfirmar={abrirConfirmVoto}
                            onAnular={abrirAnularConfirmacion}
                            onQuitar={quitarPersona}
                            canConfirmar={canConfirmarVoto}
                            canAnular={canAnularConfirmacion}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                );
              })()}

              {/* ====== SUBCOORDINADOR ====== */}
              {!loadingEstructura && currentUser.role === "subcoordinador" && (() => {
                const allMisVotantes = getMisVotantesFast();
                const visibleVotantes = matchCI
                  ? allMisVotantes.filter((v) => matchCI.has(normalizeCI(v.ci)))
                  : allMisVotantes;
                return (
                <div className="space-y-1.5">
                  {visibleVotantes.map((v) => (
                    <VotanteRow
                      key={v.ci}
                      v={v}
                      onTelefono={abrirTelefono}
                      onDireccion={abrirDireccion}
                      onConfirmar={abrirConfirmVoto}
                      onAnular={abrirAnularConfirmacion}
                      onQuitar={quitarPersona}
                      canConfirmar={canConfirmarVoto}
                      canAnular={canAnularConfirmacion}
                    />
                  ))}
                  {allMisVotantes.length === 0 && (
                    <div className="text-center py-10">
                      <Users className="w-10 h-10 text-slate-200 mx-auto mb-2" />
                      <p className="text-sm text-slate-400">No tiene votantes asignados.</p>
                    </div>
                  )}
                  {allMisVotantes.length > 0 && visibleVotantes.length === 0 && matchCI && (
                    <div className="text-center py-10">
                      <Search className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                      <p className="text-sm text-slate-400">No se encontraron coincidencias.</p>
                    </div>
                  )}
                </div>
                );
              })()}

            </div>
          </div>
        </section>
      </main>

      {/* =========== MODALS =========== */}
      <ModalTelefono
        open={phoneModalOpen}
        persona={phoneTarget}
        value={phoneValue}
        onChange={setPhoneValue}
        onCancel={() => { setPhoneModalOpen(false); setPhoneTarget(null); setPhoneValue("+595"); }}
        onSave={guardarTelefono}
      />

      <ModalDireccion
        open={direccionModalOpen}
        persona={direccionTarget}
        value={direccionValue}
        onChange={setDireccionValue}
        onCancel={() => { setDireccionModalOpen(false); setDireccionTarget(null); setDireccionValue(""); }}
        onSave={guardarDireccion}
      />

      <AddPersonModal
        show={showAddModal}
        onClose={() => setShowAddModal(false)}
        tipo={modalType}
        onAdd={handleAgregarPersona}
        disponibles={disponibles}
      />

      <ConfirmVotoModal
        open={confirmVotoModalOpen}
        votante={confirmVotoTarget}
        isUndoing={isVotoUndoing}
        onCancel={() => { setConfirmVotoModalOpen(false); setConfirmVotoTarget(null); setIsVotoUndoing(false); }}
        onConfirm={handleConfirmVoto}
        isLoading={isConfirmVotoLoading}
      />

      {/* Sub confirmation modal — reuses same visual pattern with custom labels */}
      <ConfirmVotoModal
        open={confirmSubModalOpen}
        votante={confirmSubTarget}
        isUndoing={isSubUndoing}
        onCancel={() => { setConfirmSubModalOpen(false); setConfirmSubTarget(null); setIsSubUndoing(false); }}
        onConfirm={handleConfirmSub}
        isLoading={isConfirmSubLoading}
        titleConfirm="Confirmar Subcoordinador"
        titleUndo="Anular Confirmación de Sub"
        descConfirm="¿Está seguro que desea confirmar a este subcoordinador? Esto indica que el subcoordinador ha sido verificado y está activo."
        descUndo="¿Está seguro que desea anular la confirmación de este subcoordinador? El registro volverá al estado pendiente."
      />

      {/* =========== VERIFICAR ESTRUCTURA (superadmin only) =========== */}
      {verificarOpen && currentUser.role === "superadmin" && (() => {
        const selectedCoord = estructura.coordinadores.find(
          (c) => normalizeCI(c.ci) === verificarCoordCI
        ) || null;

        const coordSubs = selectedCoord
          ? estructura.subcoordinadores.filter(
              (s) => normalizeCI(s.coordinador_ci) === normalizeCI(selectedCoord.ci)
            )
          : [];

        const printCoord = async () => {
          if (!selectedCoord) return;
          setVerificarPrinting("coord");
          try {
            const doc = await generateCoordinadorPDF({
              estructura,
              currentUser,
              targetPerson: selectedCoord,
            });
            const ts = new Date().toISOString().slice(0, 10);
            doc.save(`estructura-coord-${normalizeCI(selectedCoord.ci)}-${ts}.pdf`);
          } catch (e) {
            console.error("Error generando PDF coordinador:", e);
            alert("Error generando PDF");
          } finally {
            setVerificarPrinting(null);
          }
        };

        const printSub = async (sub) => {
          const key = `sub-${normalizeCI(sub.ci)}`;
          setVerificarPrinting(key);
          try {
            const doc = await generateSubcoordinadorPDF({
              estructura,
              currentUser,
              targetPerson: sub,
            });
            const ts = new Date().toISOString().slice(0, 10);
            doc.save(`estructura-sub-${normalizeCI(sub.ci)}-${ts}.pdf`);
          } catch (e) {
            console.error("Error generando PDF sub:", e);
            alert("Error generando PDF");
          } finally {
            setVerificarPrinting(null);
          }
        };

        return (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl my-6 overflow-hidden animate-fade-in">

              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 bg-brand-100 rounded-lg">
                    <ClipboardList className="w-4 h-4 text-brand-600" />
                  </div>
                  <h2 className="text-base font-bold text-slate-800">Verificar estructura</h2>
                </div>
                <button
                  onClick={() => { setVerificarOpen(false); setVerificarCoordCI(""); setVerificarPrinting(null); }}
                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors border-0 bg-transparent shadow-none"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-5">

                {/* Coordinator selector */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Seleccionar coordinador
                  </label>
                  <select
                    value={verificarCoordCI}
                    onChange={(e) => setVerificarCoordCI(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  >
                    <option value="">-- Seleccione un coordinador --</option>
                    {estructura.coordinadores.map((c) => (
                      <option key={normalizeCI(c.ci)} value={normalizeCI(c.ci)}>
                        {`${c.nombre || ""} ${c.apellido || ""}`.trim() || normalizeCI(c.ci)} — CI: {normalizeCI(c.ci)}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Content when coordinator is selected */}
                {selectedCoord && (
                  <div className="space-y-4">

                    {/* Print full coordinator structure button */}
                    <div className="flex items-center justify-between p-3.5 bg-brand-50 border border-brand-200 rounded-xl">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">
                          {`${selectedCoord.nombre || ""} ${selectedCoord.apellido || ""}`.trim() || normalizeCI(selectedCoord.ci)}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {coordSubs.length} sub{coordSubs.length !== 1 ? "s" : ""} · {
                            estructura.votantes.filter(v => normalizeCI(v.coordinador_ci) === normalizeCI(selectedCoord.ci)).length
                          } votantes
                        </p>
                      </div>
                      <button
                        onClick={printCoord}
                        disabled={verificarPrinting === "coord"}
                        className="inline-flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white px-3 h-8 rounded-lg text-xs font-medium transition-colors shrink-0 ml-3 border-0 shadow-none"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        {verificarPrinting === "coord" ? "Generando..." : "Imprimir estructura completa"}
                      </button>
                    </div>

                    {/* Subcoordinadores list */}
                    {coordSubs.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                          Subcoordinadores ({coordSubs.length})
                        </p>
                        <div className="space-y-2">
                          {coordSubs.map((sub) => {
                            const subCI = normalizeCI(sub.ci);
                            const subVoterCount = estructura.votantes.filter(
                              (v) => normalizeCI(v.asignado_por) === subCI
                            ).length;
                            const printKey = `sub-${subCI}`;
                            return (
                              <div
                                key={subCI}
                                className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl"
                              >
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-slate-800 truncate">
                                    {`${sub.nombre || ""} ${sub.apellido || ""}`.trim() || subCI}
                                  </p>
                                  <p className="text-xs text-slate-500 mt-0.5">
                                    CI: {subCI} · {subVoterCount} votante{subVoterCount !== 1 ? "s" : ""}
                                  </p>
                                </div>
                                <button
                                  onClick={() => printSub(sub)}
                                  disabled={verificarPrinting === printKey}
                                  className="inline-flex items-center gap-1.5 border border-brand-300 bg-white hover:bg-brand-50 disabled:opacity-60 text-brand-700 px-3 h-8 rounded-lg text-xs font-medium transition-colors shrink-0 ml-3 shadow-none"
                                >
                                  <Printer className="w-3.5 h-3.5" />
                                  {verificarPrinting === printKey ? "Generando..." : "Imprimir estructura de este sub"}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {coordSubs.length === 0 && (
                      <p className="text-sm text-slate-400 italic text-center py-3">
                        Este coordinador no tiene subcoordinadores asignados.
                      </p>
                    )}
                  </div>
                )}

              </div>
            </div>
          </div>
        );
      })()}

      {/* Non-blocking toast */}
      {toastMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-fade-in">
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 text-white text-sm font-medium shadow-lg">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            {toastMsg}
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
