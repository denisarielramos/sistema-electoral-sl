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
} from "lucide-react";

// ======================= CONSTANTES =======================
const CAMPANIA = "chechito_2026";

// ======================= HELPERS =======================
const normalizeCI = (ci) =>
  (ci ?? "").toString().replace(/\D/g, "").trim() || (ci ?? "").toString().trim();

const normalizarTelefonoWhatsapp = (telefono) => {
  if (!telefono) return null;
  let num = telefono.toString().replace(/[\s\-\(\)\+\.]/g, "");
  if (num.startsWith("0")) num = num.slice(1);
  if (!num.startsWith("595")) num = "595" + num;
  // Validar longitud razonable (Paraguay: 595 + 9 dígitos = 12)
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
const FlyerCard = React.forwardRef(({ persona }, ref) => {
  const nombre = getFieldSafe(persona, "nombre", "nombres") || "Elector";
  const apellido = getFieldSafe(persona, "apellido", "apellidos") || "";
  const distrito = getFieldSafe(persona, "distrito", "departamento") || "Sin dato";
  const local = getFieldSafe(persona, "local_votacion", "local_de_votacion", "local") || "Sin dato";
  const mesa = getFieldSafe(persona, "mesa", "nro_mesa") || "Sin dato";
  const orden = getFieldSafe(persona, "orden", "orden_votacion") || "Sin dato";

  return (
    <div
      ref={ref}
      className="w-[360px] bg-white rounded-lg overflow-hidden shadow-lg"
      style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}
    >
      {/* Header rojo */}
      <div className="bg-red-600 text-white px-6 py-5 text-center">
        <p className="text-2xl font-bold tracking-tight">José Chechito López</p>
        <p className="text-red-100 text-sm mt-1 font-medium">Concejal 2026</p>
      </div>

      {/* Contenido */}
      <div className="px-6 py-5">
        <p className="text-lg font-semibold text-slate-800 mb-4">
          Hola <span className="text-red-600">{nombre} {apellido}</span>
        </p>

        <p className="text-sm text-slate-600 mb-4">
          Te recordamos tus datos de votación:
        </p>

        <div className="bg-slate-50 rounded-lg p-4 space-y-2 border border-slate-200">
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Distrito:</span>
            <span className="font-semibold text-slate-700">{distrito}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Local:</span>
            <span className="font-semibold text-slate-700">{local}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Mesa:</span>
            <span className="font-semibold text-slate-700">{mesa}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Orden:</span>
            <span className="font-semibold text-slate-700">{orden}</span>
          </div>
        </div>

        {/* CTA */}
        <div className="mt-5 bg-red-50 rounded-lg p-4 text-center border border-red-200">
          <p className="text-sm text-slate-600 mb-2">Votá así:</p>
          <p className="text-xl font-bold text-red-600">Lista 2E</p>
          <p className="text-lg font-semibold text-slate-800">Opción 2</p>
        </div>
      </div>

      {/* Footer */}
      <div className="bg-slate-800 text-white px-6 py-3 text-center">
        <p className="text-xs text-slate-300">José Chechito López - Concejal 2026</p>
      </div>
    </div>
  );
});

FlyerCard.displayName = "FlyerCard";

// ======================= MODAL =======================
const Modal = ({ open, onClose, children, title }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[90vh] overflow-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-5 py-4 flex items-center justify-between rounded-t-2xl">
          <h3 className="font-semibold text-slate-800">{title}</h3>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>
        <div className="p-5">{children}</div>
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
  const [filtro, setFiltro] = useState("todos");
  const [busqueda, setBusqueda] = useState("");
  const [actionLoading, setActionLoading] = useState(null);
  const [toast, setToast] = useState(null);

  // Modal states
  const [modalOpen, setModalOpen] = useState(false);
  const [modalPersona, setModalPersona] = useState(null);
  const [generandoFlyer, setGenerandoFlyer] = useState(false);
  const [flyerBlob, setFlyerBlob] = useState(null);

  const flyerRef = useRef(null);

  // ======================= LOAD DATA =======================
  const cargarDatos = useCallback(async () => {
    setLoading(true);
    try {
      // Cargar todas las personas con teléfono (coords, subs, votantes)
      const [coordsRes, subsRes, votantesRes, invRes] = await Promise.all([
        supabase.from("coordinadores").select("*, padron(*)"),
        supabase.from("subcoordinadores").select("*, padron(*)"),
        supabase.from("votantes").select("*, padron(*)"),
        supabase.from("invitaciones_whatsapp").select("*").eq("campania", CAMPANIA),
      ]);

      if (coordsRes.error) throw coordsRes.error;
      if (subsRes.error) throw subsRes.error;
      if (votantesRes.error) throw votantesRes.error;
      if (invRes.error) throw invRes.error;

      // Combinar todas las personas con teléfono
      const allPersonas = [];
      const seen = new Set();

      const addPersona = (p, tipo) => {
        const telefono = p.telefono || p.padron?.telefono;
        if (!telefono) return;
        const ci = normalizeCI(p.ci);
        if (seen.has(ci)) return;
        seen.add(ci);
        allPersonas.push({
          ...p.padron,
          ...p,
          ci,
          telefono,
          tipo,
        });
      };

      (coordsRes.data || []).forEach((c) => addPersona(c, "coordinador"));
      (subsRes.data || []).forEach((s) => addPersona(s, "subcoordinador"));
      (votantesRes.data || []).forEach((v) => addPersona(v, "votante"));

      setPersonas(allPersonas);
      setInvitaciones(invRes.data || []);
    } catch (err) {
      console.error("Error cargando datos:", err);
      showToast("Error al cargar datos", "error");
    } finally {
      setLoading(false);
    }
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
    const counts = { total: 0, pendiente: 0, preparado: 0, enviado: 0, error: 0 };
    personasConEstado.forEach((p) => {
      counts.total++;
      counts[p.estado] = (counts[p.estado] || 0) + 1;
    });
    return counts;
  }, [personasConEstado]);

  const personasFiltradas = useMemo(() => {
    let result = personasConEstado;

    // Filtro por estado
    if (filtro !== "todos") {
      result = result.filter((p) => p.estado === filtro);
    }

    // Búsqueda
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
  }, [personasConEstado, filtro, busqueda]);

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

    // Esperar a que el DOM renderice el flyer
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

          // Guardar en DB como preparado
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
      // Generar si no existe
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
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Filtros */}
            <div className="flex flex-wrap gap-2">
              {[
                { key: "todos", label: "Todos" },
                { key: "pendiente", label: "Pendientes" },
                { key: "preparado", label: "Preparados" },
                { key: "enviado", label: "Enviados" },
                { key: "error", label: "Error" },
              ].map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFiltro(f.key)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                    filtro === f.key
                      ? "bg-brand-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {f.label}
                </button>
              ))}
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

        {/* Lista */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 text-brand-600 animate-spin" />
            </div>
          ) : personasFiltradas.length === 0 ? (
            <div className="text-center py-20">
              <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">No se encontraron personas con teléfono.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {personasFiltradas.map((persona) => (
                <div
                  key={persona.ci}
                  className="p-4 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="font-semibold text-slate-800 truncate">
                          {getFieldSafe(persona, "nombre", "nombres") || "Sin nombre"}{" "}
                          {getFieldSafe(persona, "apellido", "apellidos") || ""}
                        </span>
                        <Badge variant={persona.estado}>{persona.estado}</Badge>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                        <span>CI: {persona.ci}</span>
                        <span className="flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          {persona.telefono}
                        </span>
                        {getFieldSafe(persona, "distrito", "departamento") && (
                          <span>Distrito: {getFieldSafe(persona, "distrito", "departamento")}</span>
                        )}
                        {getFieldSafe(persona, "local_votacion", "local_de_votacion", "local") && (
                          <span>Local: {getFieldSafe(persona, "local_votacion", "local_de_votacion", "local")}</span>
                        )}
                        {getFieldSafe(persona, "mesa", "nro_mesa") && (
                          <span>Mesa: {getFieldSafe(persona, "mesa", "nro_mesa")}</span>
                        )}
                        {getFieldSafe(persona, "orden", "orden_votacion") && (
                          <span>Orden: {getFieldSafe(persona, "orden", "orden_votacion")}</span>
                        )}
                      </div>
                      {persona.fecha_envio && (
                        <p className="text-xs text-emerald-600 mt-1">
                          Enviado: {new Date(persona.fecha_envio).toLocaleDateString()}
                        </p>
                      )}
                    </div>

                    {/* Acciones */}
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => handlePrepararFlyer(persona)}
                        disabled={actionLoading === persona.ci}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-50"
                      >
                        <ImageIcon className="w-3.5 h-3.5" />
                        Preparar flyer
                      </button>

                      <button
                        onClick={() => handleVerPreview(persona)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-50 text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Ver preview
                      </button>

                      <button
                        onClick={() => handleAbrirWhatsapp(persona)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors"
                      >
                        <Send className="w-3.5 h-3.5" />
                        Abrir WhatsApp
                      </button>

                      <button
                        onClick={() => handleMarcarEnviado(persona)}
                        disabled={actionLoading === persona.ci || persona.estado === "enviado"}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
                      >
                        {actionLoading === persona.ci ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Check className="w-3.5 h-3.5" />
                        )}
                        Marcar enviado
                      </button>

                      <button
                        onClick={() => handleMarcarError(persona)}
                        disabled={actionLoading === persona.ci}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50"
                      >
                        <AlertCircle className="w-3.5 h-3.5" />
                        Error
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Contador resultados */}
        {!loading && personasFiltradas.length > 0 && (
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
            {/* Flyer */}
            <div className="mb-4">
              <FlyerCard ref={flyerRef} persona={modalPersona} />
            </div>

            {/* Loading */}
            {generandoFlyer && (
              <div className="flex items-center gap-2 text-sm text-slate-600 mb-4">
                <Loader2 className="w-4 h-4 animate-spin" />
                Generando imagen...
              </div>
            )}

            {/* Botones */}
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
