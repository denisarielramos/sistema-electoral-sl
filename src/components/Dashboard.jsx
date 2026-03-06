import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import { generarAccessCode } from "../utils/accessCode";

import {
  UserPlus,
  LogOut,
  BarChart3,
  ChevronDown,
  ChevronRight,
  Copy,
  Phone,
  Trash2,
  Check,
  X,
  Download,
  Pencil,
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
  getVotantesDirectosCoord,
  getPersonasDisponibles,
} from "../utils/estructuraHelpers";

const Dashboard = ({ currentUser, onLogout }) => {
  // ======================= ESTADO CRÍTICO =======================
  const [padron, setPadron] = useState([]);
  const [estructura, setEstructura] = useState({
    coordinadores: [],
    subcoordinadores: [],
    votantes: [],
  });

  // UI
  const [showAddModal, setShowAddModal] = useState(false);
  const [modalType, setModalType] = useState("");
  const [expandedCoords, setExpandedCoords] = useState({});
  const [expandedSubs, setExpandedSubs] = useState({});
  const [searchCI, setSearchCI] = useState("");

  // Teléfono
  const [phoneModalOpen, setPhoneModalOpen] = useState(false);
  const [phoneTarget, setPhoneTarget] = useState(null);
  const [phoneValue, setPhoneValue] = useState("+595");

  // Dirección
  const [direccionModalOpen, setDireccionModalOpen] = useState(false);
  const [direccionTarget, setDireccionTarget] = useState(null);
  const [direccionValue, setDireccionValue] = useState("");

  // Confirmación de voto
  const [confirmVotoModalOpen, setConfirmVotoModalOpen] = useState(false);
  const [confirmVotoTarget, setConfirmVotoTarget] = useState(null);
  const [isVotoUndoing, setIsVotoUndoing] = useState(false);
  const [isConfirmVotoLoading, setIsConfirmVotoLoading] = useState(false);

  // PDF MENU
  const [pdfMenuOpen, setPdfMenuOpen] = useState(false);

  // Loading
  const [isLoading, setIsLoading] = useState(true);

  // ======================= HELPERS UI =======================
  const copyToClipboard = async (text) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      alert("Código copiado!");
    } catch {
      alert("No se pudo copiar.");
    }
  };

  const toggleExpand = (ci) => {
    const key = normalizeCI(ci);
    setExpandedCoords((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const toggleCoord = (ci) => {
    const key = normalizeCI(ci);
    setExpandedCoords((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const toggleSub = (ci) => {
    const key = normalizeCI(ci);
    setExpandedSubs((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  // ======================= CARGAR PADRÓN COMPLETO =======================
  const cargarPadronCompleto = async () => {
    try {
      const { count, error: countError } = await supabase
        .from("padron")
        .select("ci", { count: "exact", head: true });

      if (countError) {
        console.error("Error count padrón:", countError);
        return;
      }

      if (!count || count <= 0) {
        setPadron([]);
        return;
      }

      const { data, error } = await supabase
        .from("padron")
        .select("*")
        .range(0, count - 1);

      if (error) {
        console.error("Error cargando padrón:", error);
        return;
      }

      setPadron(data || []);
    } catch (e) {
      console.error("Error cargando padrón:", e);
    }
  };

  // ======================= RECARGAR ESTRUCTURA =======================
  const recargarEstructura = async () => {
    setIsLoading(true);
    try {
      let padronData = padron;
      if (!padronData || padronData.length === 0) {
        const { data: p } = await supabase.from("padron").select("*");
        padronData = p || [];
        setPadron(padronData);
      }

      const padronMap = new Map(
        (padronData || []).map((p) => [normalizeCI(p.ci), p])
      );

      const { data: coordsRaw, error: coordsErr } = await supabase
        .from("coordinadores")
        .select("*");
      if (coordsErr) console.error("Error coords:", coordsErr);

      const { data: subsRaw, error: subsErr } = await supabase
        .from("subcoordinadores")
        .select("*");
      if (subsErr) console.error("Error subs:", subsErr);

      const { data: votosRaw, error: votosErr } = await supabase
        .from("votantes")
        .select("*");
      if (votosErr) console.error("Error votos:", votosErr);

      const mergePadron = (arr) =>
        (arr || []).map((x) => {
          const ci = normalizeCI(x.ci);
          const p = padronMap.get(ci);
          return {
            ...(p || {}),
            ...x,
            ci,
            coordinador_ci: x.coordinador_ci ? normalizeCI(x.coordinador_ci) : null,
            asignado_por: x.asignado_por ? normalizeCI(x.asignado_por) : null,
            direccion: x.direccion_override || p?.direccion || null,
          };
        });

      setEstructura({
        coordinadores: mergePadron(coordsRaw),
        subcoordinadores: mergePadron(subsRaw),
        votantes: mergePadron(votosRaw),
      });
    } catch (e) {
      console.error("Error recargando estructura:", e);
    } finally {
      setIsLoading(false);
    }
  };

  // ======================= INIT =======================
  useEffect(() => {
    cargarPadronCompleto();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    recargarEstructura();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  // ======================= PERMISOS (RBAC) =======================
  const getMiCoordinadorCI = () => {
    if (currentUser?.role === "coordinador") return normalizeCI(currentUser.ci);
    if (currentUser?.role === "subcoordinador") {
      const sub = (estructura.subcoordinadores || []).find(
        (s) => normalizeCI(s.ci) === normalizeCI(currentUser.ci)
      );
      return normalizeCI(sub?.coordinador_ci);
    }
    return null;
  };

  const canEditarTelefono = (tipo, persona) => {
    const role = currentUser?.role;
    if (!role || !persona) return false;
    if (role === "superadmin") return true;
    if (role === "coordinador") {
      const miCI = normalizeCI(currentUser.ci);
      if (tipo === "subcoordinador") return normalizeCI(persona.coordinador_ci) === miCI;
      if (tipo === "votante") return normalizeCI(persona.coordinador_ci) === miCI;
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
      const miCI = normalizeCI(currentUser.ci);
      if (tipo === "subcoordinador") return normalizeCI(persona.coordinador_ci) === miCI;
      if (tipo === "votante") return normalizeCI(persona.coordinador_ci) === miCI;
      return false;
    }
    if (role === "subcoordinador") {
      if (tipo !== "votante") return false;
      return normalizeCI(persona.asignado_por) === normalizeCI(currentUser.ci);
    }
    return false;
  };

  // ======================= CONFIRMACIÓN DE VOTO =======================
  const canConfirmarVoto = (persona, tipo = "votante") => {
    const role = currentUser?.role;
    if (!role || !persona) return false;
    if (role === "superadmin") return false;

    if (tipo === "coordinador") {
      return false;
    }

    if (tipo === "subcoordinador") {
      if (role === "coordinador") {
        const miCoordCI = normalizeCI(currentUser.ci);
        return normalizeCI(persona.coordinador_ci) === miCoordCI;
      }
      return false;
    }

    if (tipo === "votante") {
      if (role === "coordinador") {
        const miCoordCI = normalizeCI(currentUser.ci);
        return normalizeCI(persona.coordinador_ci) === miCoordCI;
      }
      if (role === "subcoordinador") {
        return normalizeCI(persona.asignado_por) === normalizeCI(currentUser.ci);
      }
    }

    return false;
  };

  const canAnularConfirmacion = (persona, tipo = "votante") => {
    const role = currentUser?.role;
    if (!role || !persona) return false;

    if (tipo === "coordinador") {
      return false;
    }

    if (tipo === "subcoordinador") {
      if (role === "coordinador") {
        const miCoordCI = normalizeCI(currentUser.ci);
        return normalizeCI(persona.coordinador_ci) === miCoordCI;
      }
      return false;
    }

    if (tipo === "votante") {
      if (role === "coordinador") {
        const miCoordCI = normalizeCI(currentUser.ci);
        return normalizeCI(persona.coordinador_ci) === miCoordCI;
      }
    }

    return false;
  };

  const abrirConfirmVoto = (persona, tipo = "votante") => {
    if (!canConfirmarVoto(persona, tipo)) return;
    setConfirmVotoTarget({ ...persona, tipo });
    setIsVotoUndoing(false);
    setConfirmVotoModalOpen(true);
  };

  const abrirAnularConfirmacion = (persona, tipo = "votante") => {
    if (!canAnularConfirmacion(persona, tipo)) return;
    setConfirmVotoTarget({ ...persona, tipo });
    setIsVotoUndoing(true);
    setConfirmVotoModalOpen(true);
  };

  const handleConfirmVoto = async () => {
    if (!confirmVotoTarget) return;
    setIsConfirmVotoLoading(true);
    try {
      const newStatus = !isVotoUndoing;
      const tipo = confirmVotoTarget.tipo || "votante";
      
      let tabla = "votantes";
      if (tipo === "subcoordinador") tabla = "subcoordinadores";
      if (tipo === "coordinador") tabla = "coordinadores";

      const { error } = await supabase
        .from(tabla)
        .update({ voto_confirmado: newStatus })
        .eq("ci", confirmVotoTarget.ci);
      
      if (error) {
        console.error("Error confirmando voto:", error);
        alert(error.message || "Error procesando confirmación");
        setIsConfirmVotoLoading(false);
        return;
      }
      setConfirmVotoModalOpen(false);
      setConfirmVotoTarget(null);
      await recargarEstructura();
    } catch (e) {
      console.error("Error confirmando voto:", e);
      alert("Error procesando confirmación");
    } finally {
      setIsConfirmVotoLoading(false);
    }
  };

  // ======================= LOGOUT =======================
  const handleLogout = () => {
    setExpandedCoords({});
    setSearchCI("");
    onLogout?.();
  };

  // ======================= TELÉFONO =======================
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
        const perteneceAMiRed = normalizeCI(phoneTarget.coordinador_ci) === miCI;
        if (!perteneceAMiRed) {
          alert("No tiene permiso para editar el teléfono de esta persona.");
          return;
        }
        if (phoneTarget.tipo === "coordinador") {
          alert("No tiene permiso para editar el teléfono de otro coordinador.");
          return;
        }
      }
      if (currentUser.role === "subcoordinador") {
        if (phoneTarget.tipo !== "votante") {
          alert("No tiene permiso para editar esta persona.");
          return;
        }
        const esMiVotante = normalizeCI(phoneTarget.asignado_por) === normalizeCI(currentUser.ci);
        if (!esMiVotante) {
          alert("No tiene permiso para editar el teléfono de este votante.");
          return;
        }
      }
    }

    const telefono = String(phoneValue || "").trim();
    if (!telefono) {
      alert("Ingrese número de teléfono.");
      return;
    }

    let tabla = "votantes";
    if (phoneTarget.tipo === "coordinador") tabla = "coordinadores";
    if (phoneTarget.tipo === "subcoordinador") tabla = "subcoordinadores";

    const { error } = await supabase
      .from(tabla)
      .update({ telefono })
      .eq("ci", phoneTarget.ci);

    if (error) {
      console.error("Error guardando teléfono:", error);
      alert(error.message || "Error guardando teléfono");
      return;
    }

    setPhoneModalOpen(false);
    setPhoneTarget(null);
    setPhoneValue("+595");
    recargarEstructura();
  };

  // ======================= DIRECCIÓN =======================
  const abrirDireccion = (tipo, p) => {
    setDireccionTarget({ tipo, ...p });
    setDireccionValue(p.direccion_override || "");
    setDireccionModalOpen(true);
  };

  const guardarDireccion = async () => {
    if (!direccionTarget) return;

    if (currentUser.role !== "superadmin") {
      if (currentUser.role === "coordinador") {
        const miCI = normalizeCI(currentUser.ci);
        const perteneceAMiRed = normalizeCI(direccionTarget.coordinador_ci) === miCI;
        if (!perteneceAMiRed) {
          alert("No tiene permiso para editar la dirección de esta persona.");
          return;
        }
        if (direccionTarget.tipo === "coordinador") {
          alert("No tiene permiso para editar la dirección de otro coordinador.");
          return;
        }
      }
      if (currentUser.role === "subcoordinador") {
        if (direccionTarget.tipo !== "votante") {
          alert("No tiene permiso para editar esta persona.");
          return;
        }
        const esMiVotante = normalizeCI(direccionTarget.asignado_por) === normalizeCI(currentUser.ci);
        if (!esMiVotante) {
          alert("No tiene permiso para editar la dirección de este votante.");
          return;
        }
      }
    }

    const direccion_override = String(direccionValue || "").trim();

    let tabla = "votantes";
    if (direccionTarget.tipo === "coordinador") tabla = "coordinadores";
    if (direccionTarget.tipo === "subcoordinador") tabla = "subcoordinadores";

    const { error } = await supabase
      .from(tabla)
      .update({ direccion_override })
      .eq("ci", direccionTarget.ci);

    if (error) {
      console.error("Error guardando dirección:", error);
      alert(error.message || "Error guardando dirección");
      return;
    }

    setDireccionModalOpen(false);
    setDireccionTarget(null);
    setDireccionValue("");
    recargarEstructura();
  };

  // ======================= AGREGAR PERSONA =======================
  const handleAgregarPersona = async (persona) => {
    if (!modalType) return alert("Seleccione tipo.");

    const ci = normalizeCI(persona.ci);
    let tabla = "";
    let data = {};

    if (modalType === "coordinador") {
      if (currentUser.role !== "superadmin") {
        alert("Solo el superadmin puede agregar coordinadores.");
        return;
      }
      const accessCode = generarAccessCode(8);
      tabla = "coordinadores";
      data = {
        ci,
        login_code: accessCode,
        asignado_por_nombre: "Superadmin",
      };
      const { error } = await supabase.from(tabla).insert([data]);
      if (error) {
        console.error("Error creando coordinador:", error);
        alert(error.message || "Error creando coordinador");
        return;
      }
      alert(`Código de acceso del coordinador:\n\n${accessCode}`);
      setShowAddModal(false);
      recargarEstructura();
      return;
    }

    if (modalType === "subcoordinador") {
      if (currentUser.role !== "coordinador") {
        alert("Solo un coordinador puede agregar subcoordinadores.");
        return;
      }
      const accessCode = generarAccessCode(8);
      tabla = "subcoordinadores";
      data = {
        ci,
        coordinador_ci: normalizeCI(currentUser.ci),
        login_code: accessCode,
        asignado_por_nombre: `${currentUser.nombre} ${currentUser.apellido}`,
      };
      const { error } = await supabase.from(tabla).insert([data]);
      if (error) {
        console.error("Error creando subcoordinador:", error);
        alert(error.message || "Error creando subcoordinador");
        return;
      }
      alert(`Código de acceso del subcoordinador:\n\n${accessCode}`);
      setShowAddModal(false);
      recargarEstructura();
      return;
    }

    if (modalType === "votante") {
      if (currentUser.role !== "coordinador" && currentUser.role !== "subcoordinador") {
        alert("No permitido.");
        return;
      }
      tabla = "votantes";
      let coordinador_ci = null;
      if (currentUser.role === "coordinador") {
        coordinador_ci = normalizeCI(currentUser.ci);
      } else {
        const sub = (estructura.subcoordinadores || []).find(
          (s) => normalizeCI(s.ci) === normalizeCI(currentUser.ci)
        );
        coordinador_ci = normalizeCI(sub?.coordinador_ci);
      }
      if (!coordinador_ci) {
        alert("Error interno: no se pudo resolver coordinador_ci");
        return;
      }
      data = {
        ci,
        asignado_por: normalizeCI(currentUser.ci),
        asignado_por_nombre: `${currentUser.nombre} ${currentUser.apellido}`,
        coordinador_ci,
      };
      const { error } = await supabase.from(tabla).insert([data]);
      if (error) {
        console.error("Error creando votante:", error);
        alert(error.message || "Error creando votante");
        return;
      }
      setShowAddModal(false);
      recargarEstructura();
      return;
    }
  };

  // ======================= QUITAR PERSONA =======================
  const quitarPersona = async (ci, tipo) => {
    if (!window.confirm("¿Quitar persona?")) return;
    const isSuper = currentUser.role === "superadmin";
    ci = normalizeCI(ci);
    try {
      if (tipo === "coordinador") {
        if (!isSuper) return alert("Solo superadmin.");
        await supabase.from("subcoordinadores").delete().eq("coordinador_ci", ci);
        await supabase.from("votantes").delete().eq("coordinador_ci", ci);
        await supabase.from("votantes").delete().eq("asignado_por", ci);
        await supabase.from("coordinadores").delete().eq("ci", ci);
      }
      if (tipo === "subcoordinador") {
        await supabase.from("votantes").delete().eq("asignado_por", ci);
        await supabase.from("subcoordinadores").delete().eq("ci", ci);
      }
      if (tipo === "votante") {
        await supabase.from("votantes").delete().eq("ci", ci);
      }
      recargarEstructura();
    } catch (e) {
      console.error("Error quitando persona:", e);
      alert("Error quitando persona");
    }
  };

  // ======================= COMPONENTE DATOS PERSONA =======================
  const DatosPersona = ({ persona, rol, loginCode, onEditDireccion, hideName }) => {
    return (
      <div className="space-y-1 text-xs md:text-sm">
        {!hideName && (
          <p className="font-semibold">
            {persona.nombre || "-"} {persona.apellido || ""}
          </p>
        )}
        <p>
          <b>CI:</b> {persona.ci}
        </p>
        {rol && (
          <p>
            <b>Rol:</b> {rol}
          </p>
        )}
        {loginCode && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              copyToClipboard(loginCode);
            }}
            className="px-2 py-1 border rounded text-red-600 inline-flex items-center gap-1 text-xs hover:bg-red-50"
          >
            <Copy className="w-3 h-3 sm:w-4 sm:h-4" /> Copiar acceso
          </button>
        )}
        {persona.seccional && <p className="truncate">Seccional: {persona.seccional}</p>}
        {persona.local_votacion && <p className="truncate">Local: {persona.local_votacion}</p>}
        {persona.mesa && <p>Mesa: {persona.mesa}</p>}
        {persona.orden && <p>Orden: {persona.orden}</p>}
        {persona.direccion && (
          <div>
            <p>Dirección: {persona.direccion}</p>
            {onEditDireccion && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEditDireccion();
                }}
                className="text-blue-600 hover:text-blue-800 text-xs inline-flex items-center gap-1 mt-1"
              >
                <Pencil className="w-3 h-3" /> Editar dirección
              </button>
            )}
          </div>
        )}
        {persona.telefono && <p>Tel: {persona.telefono}</p>}
      </div>
    );
  };

  // ======================= COMPONENTE VOTANTE CARD =======================
  const VotanteCard = ({ v, showAnular = true }) => {
    return (
      <div key={v.ci} className="bg-white border-2 border-gray-100 hover:border-red-200 p-4 mb-3 rounded-xl shadow-sm hover:shadow-md transition-all flex justify-between items-start gap-4">
        <div className="flex-1">
          <DatosPersona 
            persona={v} 
            rol="Votante"
            onEditDireccion={() => abrirDireccion("votante", v)}
          />
          {v.voto_confirmado && (
            <div className="mt-3 inline-flex items-center px-3 py-1.5 bg-gradient-to-r from-green-500 to-green-600 text-white text-xs rounded-full font-semibold shadow-sm">
              ✓ Voto Confirmado
            </div>
          )}
          {!v.voto_confirmado && (
            <div className="mt-3 inline-flex items-center px-3 py-1.5 bg-gray-200 text-gray-600 text-xs rounded-full font-semibold">
              Pendiente
            </div>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => abrirTelefono("votante", v)}
            className="inline-flex items-center justify-center w-11 h-11 border-2 border-green-500 text-green-600 rounded-xl hover:bg-green-50 hover:border-green-600 transition-all shadow-sm hover:shadow-md"
          >
            <Phone className="w-5 h-5" />
          </button>
          {!v.voto_confirmado && canConfirmarVoto(v, "votante") && (
            <button
              onClick={() => abrirConfirmVoto(v, "votante")}
              className="inline-flex items-center justify-center w-11 h-11 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-xl hover:from-green-600 hover:to-green-700 transition-all shadow-md hover:shadow-lg"
              title="Confirmar voto"
            >
              <Check className="w-5 h-5" />
            </button>
          )}
          {showAnular !== false && v.voto_confirmado && canAnularConfirmacion(v, "votante") && (
            <button
              onClick={() => abrirAnularConfirmacion(v, "votante")}
              className="inline-flex items-center justify-center w-11 h-11 border-2 border-red-500 text-red-600 rounded-xl hover:bg-red-50 hover:border-red-600 transition-all shadow-sm hover:shadow-md"
              title="Anular confirmación"
            >
              <X className="w-5 h-5" />
            </button>
          )}
          <button
            onClick={() => quitarPersona(v.ci, "votante")}
            className="inline-flex items-center justify-center w-11 h-11 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-xl hover:from-red-600 hover:to-red-700 transition-all shadow-md hover:shadow-lg"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      </div>
    );
  };

  // ======================= NORMALIZAR TEXTO =======================
  const normalizeText = (v) =>
    (v ?? "")
      .toString()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();

  // ======================= ESTADÍSTICAS =======================
  const stats = useMemo(
    () => getEstadisticas(estructura, currentUser),
    [estructura, currentUser]
  );

  // ======================= DISPONIBLES =======================
  const disponibles = useMemo(
    () => getPersonasDisponibles(padron, estructura),
    [padron, estructura]
  );

  // ======================= RESULTADOS BÚSQUEDA =======================
  const resultadosBusqueda = useMemo(() => {
    const term = normalizeText(searchCI);
    if (!term) return [];

    const all = [
      ...(estructura.coordinadores || []).map((c) => ({ tipo: "coordinador", persona: c })),
      ...(estructura.subcoordinadores || []).map((s) => ({ tipo: "subcoordinador", persona: s })),
      ...(estructura.votantes || []).map((v) => ({ tipo: "votante", persona: v })),
    ];

    const allowed = all.filter(({ tipo, persona }) => {
      if (currentUser.role === "superadmin") return true;
      if (currentUser.role === "coordinador") {
        const miCI = normalizeCI(currentUser.ci);
        if (tipo === "coordinador") return normalizeCI(persona.ci) === miCI;
        return normalizeCI(persona.coordinador_ci) === miCI;
      }
      if (currentUser.role === "subcoordinador") {
        if (tipo !== "votante") return false;
        return normalizeCI(persona.asignado_por) === normalizeCI(currentUser.ci);
      }
      return false;
    });

    return allowed.filter(({ persona }) => {
      const ciNorm = normalizeText(persona.ci);
      const nombreNorm = normalizeText(persona.nombre);
      const apellidoNorm = normalizeText(persona.apellido);
      const nombreCompleto = `${nombreNorm} ${apellidoNorm}`;
      return (
        ciNorm.includes(term) ||
        nombreNorm.includes(term) ||
        apellidoNorm.includes(term) ||
        nombreCompleto.includes(term)
      );
    });
  }, [searchCI, estructura, currentUser]);

  // ======================= DESCARGAR PDF =======================
  const descargarPDF = async () => {
    if (!currentUser) {
      alert("Usuario no válido");
      return;
    }

    try {
      let doc;
      let filename = "reporte";

      if (currentUser.role === "superadmin") {
        doc = generateSuperadminPDF({ estructura, currentUser });
        filename = "reporte-superadmin";
      } else if (currentUser.role === "coordinador") {
        doc = generateCoordinadorPDF({ estructura, currentUser });
        filename = "reporte-coordinador";
      } else if (currentUser.role === "subcoordinador") {
        doc = generateSubcoordinadorPDF({ estructura, currentUser });
        filename = "reporte-subcoordinador";
      } else {
        alert("Rol no soportado para reportes");
        return;
      }

      const fecha = new Date();
      const timestamp = fecha.toISOString().slice(0, 10);
      const nombreArchivo = `${filename}-${timestamp}.pdf`;

      doc.save(nombreArchivo);
    } catch (error) {
      console.error("Error generando PDF:", error);
      alert("Error al generar el reporte PDF");
    }
  };

  // ======================= UI =======================
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="text-center">
          <div className="animate-spin h-12 w-12 border-4 border-red-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Cargando estructura...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100">
      {/* HERO SUPERIOR */}
      <div className="bg-gradient-to-r from-red-900 via-red-800 to-red-900 text-white shadow-2xl relative overflow-hidden">
        <div className="absolute inset-0 bg-black opacity-10"></div>
        <div className="max-w-7xl mx-auto px-6 py-12 relative z-10">
          <div className="flex justify-between items-start mb-8">
            <div className="flex-1">
              <h1 className="text-5xl font-extrabold mb-3 tracking-tight text-center">
                Sistema Electoral - José "Chechito" Lopez 2026
              </h1>
              <p className="text-red-100 text-lg text-center font-medium">
                {currentUser.nombre} {currentUser.apellido} •{" "}
                {currentUser.role === "superadmin"
                  ? "Superadmin"
                  : currentUser.role === "coordinador"
                  ? "Coordinador"
                  : "Sub-coordinador"}
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 bg-white/10 hover:bg-white/20 backdrop-blur-sm px-5 py-2.5 rounded-lg transition-all border border-white/20"
            >
              <LogOut className="w-4 h-4" />
              Salir
            </button>
          </div>
          
          {/* Porcentaje y Barra de Progreso */}
          <div className="max-w-2xl mx-auto mt-8">
            <div className="text-center mb-4">
              <div className="text-7xl font-black mb-2">
                {stats?.porcentajeConfirmados ?? 0}%
              </div>
              <p className="text-red-100 text-sm uppercase tracking-wider font-semibold">
                Votos Confirmados
              </p>
            </div>
            <div className="bg-white/20 rounded-full h-4 overflow-hidden backdrop-blur-sm">
              <div 
                className="bg-gradient-to-r from-green-400 to-green-500 h-full rounded-full transition-all duration-1000 ease-out shadow-lg"
                style={{ width: `${stats?.porcentajeConfirmados ?? 0}%` }}
              ></div>
            </div>
          </div>
        </div>
      </div>

      {/* KPI GRANDES */}
      <div className="max-w-7xl mx-auto px-6 -mt-8 relative z-20">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {currentUser.role === "superadmin" && (
            <>
              <div className="bg-white rounded-2xl shadow-lg p-4 sm:p-6 hover:shadow-xl transition-shadow border border-gray-100">
                <p className="text-gray-500 text-xs sm:text-sm font-semibold uppercase tracking-wide mb-2">Total en Red</p>
                <p className="text-3xl sm:text-4xl lg:text-5xl font-black text-gray-900">{stats?.votantesTotales ?? 0}</p>
              </div>
              <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-2xl shadow-lg p-4 sm:p-6 hover:shadow-xl transition-shadow text-white">
                <p className="text-green-100 text-xs sm:text-sm font-semibold uppercase tracking-wide mb-2">Confirmados</p>
                <p className="text-3xl sm:text-4xl lg:text-5xl font-black">{stats?.votosConfirmadosTotales ?? 0}</p>
              </div>
              <div className="bg-white rounded-2xl shadow-lg p-4 sm:p-6 hover:shadow-xl transition-shadow border border-gray-100">
                <p className="text-gray-500 text-xs sm:text-sm font-semibold uppercase tracking-wide mb-2">Pendientes</p>
                <p className="text-3xl sm:text-4xl lg:text-5xl font-black text-gray-900">
                  {(stats?.votantesTotales ?? 0) - (stats?.votosConfirmadosTotales ?? 0)}
                </p>
              </div>
              <div className="bg-gradient-to-br from-red-600 to-red-700 rounded-2xl shadow-lg p-4 sm:p-6 hover:shadow-xl transition-shadow text-white">
                <p className="text-red-100 text-xs sm:text-sm font-semibold uppercase tracking-wide mb-2">Porcentaje</p>
                <p className="text-3xl sm:text-4xl lg:text-5xl font-black">{stats?.porcentajeConfirmados ?? 0}%</p>
              </div>
            </>
          )}

          {currentUser.role === "coordinador" && (
            <>
              <div className="bg-white rounded-2xl shadow-lg p-4 sm:p-6 hover:shadow-xl transition-shadow border border-gray-100">
                <p className="text-gray-500 text-xs sm:text-sm font-semibold uppercase tracking-wide mb-2">Total en Red</p>
                <p className="text-3xl sm:text-4xl lg:text-5xl font-black text-gray-900">{stats?.total ?? 0}</p>
              </div>
              <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-2xl shadow-lg p-4 sm:p-6 hover:shadow-xl transition-shadow text-white">
                <p className="text-green-100 text-xs sm:text-sm font-semibold uppercase tracking-wide mb-2">Confirmados</p>
                <p className="text-3xl sm:text-4xl lg:text-5xl font-black">{stats?.votosConfirmadosTotales ?? 0}</p>
              </div>
              <div className="bg-white rounded-2xl shadow-lg p-4 sm:p-6 hover:shadow-xl transition-shadow border border-gray-100">
                <p className="text-gray-500 text-xs sm:text-sm font-semibold uppercase tracking-wide mb-2">Pendientes</p>
                <p className="text-3xl sm:text-4xl lg:text-5xl font-black text-gray-900">
                  {(stats?.total ?? 0) - (stats?.votosConfirmadosTotales ?? 0)}
                </p>
              </div>
              <div className="bg-gradient-to-br from-red-600 to-red-700 rounded-2xl shadow-lg p-4 sm:p-6 hover:shadow-xl transition-shadow text-white">
                <p className="text-red-100 text-xs sm:text-sm font-semibold uppercase tracking-wide mb-2">Porcentaje</p>
                <p className="text-3xl sm:text-4xl lg:text-5xl font-black">{stats?.porcentajeConfirmados ?? 0}%</p>
              </div>
            </>
          )}

          {currentUser.role === "subcoordinador" && (
            <>
              <div className="bg-white rounded-2xl shadow-lg p-4 sm:p-6 hover:shadow-xl transition-shadow border border-gray-100">
                <p className="text-gray-500 text-xs sm:text-sm font-semibold uppercase tracking-wide mb-2">Total en Red</p>
                <p className="text-3xl sm:text-4xl lg:text-5xl font-black text-gray-900">{stats?.votantesTotales ?? 0}</p>
              </div>
              <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-2xl shadow-lg p-4 sm:p-6 hover:shadow-xl transition-shadow text-white">
                <p className="text-green-100 text-xs sm:text-sm font-semibold uppercase tracking-wide mb-2">Confirmados</p>
                <p className="text-3xl sm:text-4xl lg:text-5xl font-black">{stats?.votosConfirmadosTotales ?? 0}</p>
              </div>
              <div className="bg-white rounded-2xl shadow-lg p-4 sm:p-6 hover:shadow-xl transition-shadow border border-gray-100">
                <p className="text-gray-500 text-xs sm:text-sm font-semibold uppercase tracking-wide mb-2">Pendientes</p>
                <p className="text-3xl sm:text-4xl lg:text-5xl font-black text-gray-900">
                  {(stats?.votantesTotales ?? 0) - (stats?.votosConfirmadosTotales ?? 0)}
                </p>
              </div>
              <div className="bg-gradient-to-br from-red-600 to-red-700 rounded-2xl shadow-lg p-4 sm:p-6 hover:shadow-xl transition-shadow text-white">
                <p className="text-red-100 text-xs sm:text-sm font-semibold uppercase tracking-wide mb-2">Porcentaje</p>
                <p className="text-3xl sm:text-4xl lg:text-5xl font-black">{stats?.porcentajeConfirmados ?? 0}%</p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ACCIONES */}
      <div className="max-w-7xl mx-auto px-6 my-6 flex flex-wrap gap-3 items-center">
        {currentUser.role === "superadmin" && (
          <button
            onClick={() => { setModalType("coordinador"); setShowAddModal(true); }}
            className="flex items-center gap-2 bg-gradient-to-r from-red-600 to-red-700 text-white px-4 h-10 rounded-xl hover:from-red-700 hover:to-red-800 shadow-lg hover:shadow-xl transition-all font-semibold"
          >
            <UserPlus className="w-4 h-4" />
            Agregar Coordinador
          </button>
        )}

        {currentUser.role === "coordinador" && (
          <button
            onClick={() => { setModalType("subcoordinador"); setShowAddModal(true); }}
            className="flex items-center gap-2 bg-gradient-to-r from-red-600 to-red-700 text-white px-4 h-10 rounded-xl hover:from-red-700 hover:to-red-800 shadow-lg hover:shadow-xl transition-all font-semibold"
          >
            <UserPlus className="w-4 h-4" />
            Agregar Subcoordinador
          </button>
        )}

        {(currentUser.role === "coordinador" || currentUser.role === "subcoordinador") && (
          <button
            onClick={() => { setModalType("votante"); setShowAddModal(true); }}
            className="flex items-center gap-2 bg-white border-2 border-red-600 text-red-600 px-4 h-10 rounded-xl hover:bg-red-50 shadow-md hover:shadow-lg transition-all font-semibold"
          >
            <UserPlus className="w-4 h-4" />
            Agregar Votante
          </button>
        )}

        <button
          onClick={descargarPDF}
          className="flex items-center gap-2 bg-white border-2 border-gray-300 text-gray-700 px-4 h-10 rounded-xl hover:bg-gray-50 shadow-md hover:shadow-lg transition-all font-semibold"
        >
          <BarChart3 className="w-4 h-4" />
          Descargar PDF
        </button>
      </div>

      {/* BUSCADOR */}
      <div className="max-w-7xl mx-auto px-6 mb-4">
        <div className="bg-white rounded-2xl shadow-lg p-4 sm:p-5 border border-gray-100">
          <label className="block text-xs sm:text-sm font-bold text-gray-700 mb-2 uppercase tracking-wide">
            Buscar dentro de mi estructura
          </label>
          <input
            value={searchCI}
            onChange={(e) => setSearchCI(e.target.value)}
            placeholder="Buscar por CI, nombre, apellido o combinación"
            className="w-full border-2 border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
          />
          {normalizeText(searchCI) && (
            <p className="text-xs sm:text-sm text-gray-600 mt-2 font-medium">
              Resultados: <span className="text-red-600 font-bold">{resultadosBusqueda.length}</span>
            </p>
          )}
        </div>
      </div>

      {/* RESULTADOS */}
      {normalizeText(searchCI) && (
        <div className="max-w-7xl mx-auto px-6 mb-6">
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100">
            <div className="p-6 border-b border-gray-100">
              <h3 className="font-bold text-xl text-gray-800">Resultados de búsqueda</h3>
              <p className="text-sm text-gray-500 mt-1">Solo dentro de la estructura permitida para tu rol.</p>
            </div>
            <div className="p-6 space-y-3">
              {resultadosBusqueda.length === 0 ? (
                <div className="text-center py-8 text-gray-500">No se encontraron coincidencias en tu estructura.</div>
              ) : (
                <div>
                  {resultadosBusqueda.slice(0, 50).map(({ tipo, persona }) => (
                    <div key={`${tipo}-${persona.ci}`} className="border-2 border-gray-100 rounded-xl p-4 hover:border-red-200 hover:bg-red-50/30 transition-all mb-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-bold text-base flex items-center gap-3 mb-2">
                            {persona.nombre || "-"} {persona.apellido || ""}
                            {tipo === "votante" && persona.voto_confirmado && (
                              <span className="inline-flex items-center px-3 py-1 bg-gradient-to-r from-green-500 to-green-600 text-white text-xs rounded-full font-semibold shadow-sm">
                                ✓ Confirmado
                              </span>
                            )}
                            {tipo === "votante" && !persona.voto_confirmado && (
                              <span className="inline-flex items-center px-3 py-1 bg-gray-200 text-gray-600 text-xs rounded-full font-semibold">
                                Pendiente
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-gray-600">
                            <span className="font-semibold">CI:</span> {persona.ci}
                            <span className="ml-4">
                              <span className="font-semibold">Tipo:</span>{" "}
                              {tipo === "coordinador"
                                ? "Coordinador"
                                : tipo === "subcoordinador"
                                ? "Subcoordinador"
                                : "Votante"}
                            </span>
                          </div>
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          <button
                            onClick={() => abrirTelefono(tipo, persona)}
                            className="inline-flex items-center justify-center w-11 h-11 border-2 border-green-500 text-green-600 rounded-xl hover:bg-green-50 hover:border-green-600 transition-all shadow-sm hover:shadow-md"
                            title="Editar teléfono"
                          >
                            <Phone className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => abrirDireccion(tipo, persona)}
                            className="inline-flex items-center justify-center w-11 h-11 border-2 border-blue-500 text-blue-600 rounded-xl hover:bg-blue-50 hover:border-blue-600 transition-all shadow-sm hover:shadow-md"
                            title="Editar dirección"
                          >
                            <Pencil className="w-5 h-5" />
                          </button>
                          {tipo === "votante" && !persona.voto_confirmado && canConfirmarVoto(persona, tipo) && (
                            <button
                              onClick={() => abrirConfirmVoto(persona, tipo)}
                              className="inline-flex items-center justify-center w-11 h-11 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-xl hover:from-green-600 hover:to-green-700 transition-all shadow-md hover:shadow-lg"
                              title="Confirmar voto"
                            >
                              <Check className="w-5 h-5" />
                            </button>
                          )}
                          {tipo === "votante" && persona.voto_confirmado && canAnularConfirmacion(persona, tipo) && (
                            <button
                              onClick={() => abrirAnularConfirmacion(persona, tipo)}
                              className="inline-flex items-center justify-center w-11 h-11 border-2 border-red-500 text-red-600 rounded-xl hover:bg-red-50 hover:border-red-600 transition-all shadow-sm hover:shadow-md"
                              title="Anular confirmación"
                            >
                              <X className="w-5 h-5" />
                            </button>
                          )}
                          <button
                            onClick={() => quitarPersona(tipo, persona)}
                            className="inline-flex items-center justify-center w-11 h-11 border-2 border-red-400 text-red-600 rounded-xl hover:bg-red-50 hover:border-red-600 transition-all shadow-sm hover:shadow-md"
                            title="Eliminar"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {resultadosBusqueda.length > 50 && (
                <div className="text-xs text-gray-500">
                  Mostrando 50 resultados. Refiná la búsqueda para acotar.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MI ESTRUCTURA */}
      <div className="max-w-7xl mx-auto px-6 mb-10">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100">
          <div className="p-6 border-b border-gray-100 bg-gradient-to-r from-red-50 to-white">
            <h2 className="text-2xl font-bold text-gray-900">Mi Estructura Electoral</h2>
            <p className="text-sm text-gray-600 mt-1">Organización y seguimiento de la red de votantes</p>
          </div>
          <div className="p-6">

            {/* SUPERADMIN */}
            {currentUser.role === "superadmin" && (
              <div>
                {(estructura.coordinadores || []).length === 0 ? (
                  <p className="text-center text-gray-500 py-8">No hay coordinadores aún.</p>
                ) : (
                  <div>
                    {(estructura.coordinadores || []).map((coord) => {
                      const subs = (estructura.subcoordinadores || []).filter(
                        s => normalizeCI(s.coordinador_ci) === normalizeCI(coord.ci)
                      );
                      const subsSet = new Set(subs.map(s => normalizeCI(s.ci)));
                      const votantesDirectos = (estructura.votantes || []).filter(
                        v => normalizeCI(v.asignado_por) === normalizeCI(coord.ci)
                      );
                      const votantesIndirectos = (estructura.votantes || []).filter(
                        v => subsSet.has(normalizeCI(v.asignado_por))
                      );
                      const totalEnRed = 1 + subs.length + votantesDirectos.length + votantesIndirectos.length;
                      const confirmadosCoord = 1 + 
                        subs.filter(s => s.voto_confirmado).length +
                        votantesDirectos.filter(v => v.voto_confirmado).length +
                        votantesIndirectos.filter(v => v.voto_confirmado).length;
                      const porcentajeCoord = totalEnRed > 0 ? Math.round((confirmadosCoord / totalEnRed) * 100) : 0;
                      
                      return (
                      <div key={coord.ci} className="border-2 border-red-100 rounded-xl mb-4 bg-gradient-to-r from-red-50/50 to-white overflow-hidden hover:border-red-200 transition-all">
                        <div
                          className="flex items-start justify-between p-5 cursor-pointer gap-4"
                          onClick={() => toggleCoord(coord.ci)}
                        >
                          <div className="flex items-start gap-3 flex-1">
                            {expandedCoords[normalizeCI(coord.ci)] ? (
                              <ChevronDown className="w-6 h-6 text-red-600" />
                            ) : (
                              <ChevronRight className="w-6 h-6 text-red-600" />
                            )}
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                <p className="font-bold text-lg text-gray-900">
                                  {coord.nombre || "-"} {coord.apellido || ""}
                                </p>
                                <span className="inline-flex items-center px-3 py-1 bg-red-600 text-white text-xs rounded-full font-semibold">
                                  {totalEnRed} personas
                                </span>
                              </div>
                              <div className="mb-3">
                                <div className="flex items-center justify-between text-sm mb-1">
                                  <span className="text-gray-600 font-medium">Progreso de confirmación</span>
                                  <span className="text-red-600 font-bold">{porcentajeCoord}%</span>
                                </div>
                                <div className="bg-gray-200 rounded-full h-2.5 overflow-hidden">
                                  <div 
                                    className="bg-gradient-to-r from-green-500 to-green-600 h-full rounded-full transition-all duration-500"
                                    style={{ width: `${porcentajeCoord}%` }}
                                  ></div>
                                </div>
                              </div>
                              <DatosPersona 
                                persona={coord} 
                                rol="Coordinador" 
                                loginCode={coord.login_code}
                                onEditDireccion={() => abrirDireccion("coordinador", coord)}
                                hideName={true}
                              />
                            </div>
                          </div>
                          <div className="flex flex-col md:flex-row gap-2">
                            <button
                              onClick={(e) => { e.stopPropagation(); abrirTelefono("coordinador", coord); }}
                              className="inline-flex items-center justify-center w-11 h-11 border-2 border-green-500 text-green-600 rounded-xl hover:bg-green-50 hover:border-green-600 transition-all shadow-sm hover:shadow-md"
                            >
                              <Phone className="w-5 h-5" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); quitarPersona(coord.ci, "coordinador"); }}
                              className="inline-flex items-center justify-center w-11 h-11 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-xl hover:from-red-600 hover:to-red-700 transition-all shadow-md hover:shadow-lg"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          </div>
                        </div>

                        {expandedCoords[normalizeCI(coord.ci)] && (
                          <div className="bg-gradient-to-b from-gray-50 to-white px-6 pb-4 border-t border-gray-100">
                            {(estructura.subcoordinadores || [])
                              .filter((s) => normalizeCI(s.coordinador_ci) === normalizeCI(coord.ci))
                              .map((sub) => {
                                const votantesDirectos = (estructura.votantes || []).filter(
                                  v => normalizeCI(v.asignado_por) === normalizeCI(sub.ci)
                                );
                                const totalSub = 1 + votantesDirectos.length;
                                const confirmadosSub = (sub.voto_confirmado ? 1 : 0) + votantesDirectos.filter(v => v.voto_confirmado).length;
                                const porcentajeSub = totalSub > 0 ? Math.round((confirmadosSub / totalSub) * 100) : 0;
                                
                                return (
                                <div key={sub.ci} className="border-l-4 border-red-400 bg-white rounded-r-xl shadow-sm p-4 mb-3 ml-8 hover:shadow-md transition-all">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-start gap-3 flex-1">
                                      <button
                                        onClick={(e) => { e.stopPropagation(); toggleSub(sub.ci); }}
                                        className="mt-1"
                                      >
                                        {expandedSubs[normalizeCI(sub.ci)] ? (
                                          <ChevronDown className="w-5 h-5 text-red-600 transition-transform" />
                                        ) : (
                                          <ChevronRight className="w-5 h-5 text-red-600 transition-transform" />
                                        )}
                                      </button>
                                      <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-2">
                                          <p className="font-bold text-base text-gray-900">
                                            {sub.nombre || "-"} {sub.apellido || ""}
                                          </p>
                                          <span className="inline-flex items-center px-2.5 py-0.5 bg-red-100 text-red-700 text-xs rounded-full font-semibold">
                                            {totalSub} personas
                                          </span>
                                          {sub.voto_confirmado && (
                                            <span className="inline-flex items-center px-2.5 py-1 bg-gradient-to-r from-green-500 to-green-600 text-white text-xs rounded-full font-semibold">
                                              ✓ Confirmado
                                            </span>
                                          )}
                                        </div>
                                        <div className="mb-2">
                                          <div className="flex items-center justify-between text-xs mb-1">
                                            <span className="text-gray-600">Progreso</span>
                                            <span className="text-red-600 font-bold">{porcentajeSub}%</span>
                                          </div>
                                          <div className="bg-gray-200 rounded-full h-2 overflow-hidden">
                                            <div 
                                              className="bg-gradient-to-r from-green-500 to-green-600 h-full rounded-full transition-all duration-500"
                                              style={{ width: `${porcentajeSub}%` }}
                                            ></div>
                                          </div>
                                        </div>
                                        <DatosPersona 
                                          persona={sub} 
                                          rol="Sub-coordinador" 
                                          loginCode={sub.login_code}
                                          onEditDireccion={() => abrirDireccion("subcoordinador", sub)}
                                          hideName={true}
                                        />
                                      </div>
                                    </div>
                                    <div className="flex gap-2">
                                      <button
                                        onClick={(e) => { e.stopPropagation(); abrirTelefono("subcoordinador", sub); }}
                                        className="inline-flex items-center justify-center w-10 h-10 border-2 border-green-500 text-green-600 rounded-xl hover:bg-green-50 transition-all shadow-sm"
                                      >
                                        <Phone className="w-5 h-5" />
                                      </button>
                                      <button
                                        onClick={(e) => { e.stopPropagation(); quitarPersona(sub.ci, "subcoordinador"); }}
                                        className="inline-flex items-center justify-center w-10 h-10 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-xl hover:from-red-600 hover:to-red-700 transition-all shadow-md"
                                      >
                                        <Trash2 className="w-5 h-5" />
                                      </button>
                                    </div>
                                  </div>

                                  {expandedSubs[normalizeCI(sub.ci)] && (
                                    <div className="ml-6 mt-4 border-l-2 border-green-200 pl-4 space-y-2">
                                      {getVotantesDeSubcoord(estructura, sub.ci).map((v) => (
                                        <VotanteCard key={v.ci} v={v} showAnular={true} />
                                      ))}
                                      {getVotantesDeSubcoord(estructura, sub.ci).length === 0 && (
                                        <p className="text-gray-500 text-sm py-4 text-center">Sin votantes asignados.</p>
                                      )}
                                    </div>
                                  )}
                                </div>
                                );
                              })}
                          </div>
                        )}
                      </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* COORDINADOR */}
            {currentUser.role === "coordinador" && (
              <div>
                {getMisSubcoordinadores(estructura, currentUser).map((sub) => {
                  const votantesDirectos = (estructura.votantes || []).filter(
                    v => normalizeCI(v.asignado_por) === normalizeCI(sub.ci)
                  );
                  const totalSub = 1 + votantesDirectos.length;
                  const confirmadosSub = (sub.voto_confirmado ? 1 : 0) + votantesDirectos.filter(v => v.voto_confirmado).length;
                  const porcentajeSub = totalSub > 0 ? Math.round((confirmadosSub / totalSub) * 100) : 0;
                  
                  return (
                  <div key={sub.ci} className="border-2 border-red-100 rounded-xl mb-4 bg-gradient-to-r from-red-50/50 to-white overflow-hidden hover:border-red-200 transition-all">
                    <div
                      className="flex items-start justify-between p-5 cursor-pointer gap-4"
                      onClick={() => toggleExpand(sub.ci)}
                    >
                      <div className="flex items-start gap-2 sm:gap-3 flex-1 min-w-0">
                        {expandedCoords[normalizeCI(sub.ci)] ? (
                          <ChevronDown className="w-6 h-6 text-red-600" />
                        ) : (
                          <ChevronRight className="w-6 h-6 text-red-600" />
                        )}
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <p className="font-bold text-lg text-gray-900">
                              {sub.nombre || "-"} {sub.apellido || ""}
                            </p>
                            <span className="inline-flex items-center px-3 py-1 bg-red-600 text-white text-xs rounded-full font-semibold">
                              {totalSub} personas
                            </span>
                            {sub.voto_confirmado && (
                              <span className="inline-flex items-center px-3 py-1 bg-gradient-to-r from-green-500 to-green-600 text-white text-xs rounded-full font-semibold">
                                ✓ Confirmado
                              </span>
                            )}
                          </div>
                          <div className="mb-3">
                            <div className="flex items-center justify-between text-sm mb-1">
                              <span className="text-gray-600 font-medium">Progreso de confirmación</span>
                              <span className="text-red-600 font-bold">{porcentajeSub}%</span>
                            </div>
                            <div className="bg-gray-200 rounded-full h-2.5 overflow-hidden">
                              <div 
                                className="bg-gradient-to-r from-green-500 to-green-600 h-full rounded-full transition-all duration-500"
                                style={{ width: `${porcentajeSub}%` }}
                              ></div>
                            </div>
                          </div>
                          <DatosPersona 
                            persona={sub} 
                            rol="Sub-coordinador" 
                            loginCode={sub.login_code}
                            onEditDireccion={() => abrirDireccion("subcoordinador", sub)}
                            hideName={true}
                          />
                        </div>
                      </div>
                      <div className="flex flex-col md:flex-row gap-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); abrirTelefono("subcoordinador", sub); }}
                          className="inline-flex items-center justify-center w-11 h-11 border-2 border-green-500 text-green-600 rounded-xl hover:bg-green-50 hover:border-green-600 transition-all shadow-sm hover:shadow-md"
                        >
                          <Phone className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            abrirDireccion("subcoordinador", sub);
                          }}
                          className="inline-flex items-center justify-center w-10 h-10 border-2 border-blue-600 text-blue-700 rounded-lg hover:bg-blue-50"
                          title="Editar dirección"
                        >
                          <MapPin className="w-4 h-4" />
                        </button>
                        {!sub.voto_confirmado && canConfirmarVoto(sub, "subcoordinador") && (
                          <button
                            onClick={(e) => { e.stopPropagation(); abrirConfirmVoto(sub, "subcoordinador"); }}
                            className="inline-flex items-center justify-center w-11 h-11 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-xl hover:from-green-600 hover:to-green-700 transition-all shadow-md hover:shadow-lg"
                            title="Confirmar voto"
                          >
                            <Check className="w-5 h-5" />
                          </button>
                        )}
                        {sub.voto_confirmado && canAnularConfirmacion(sub, "subcoordinador") && (
                          <button
                            onClick={(e) => { e.stopPropagation(); abrirAnularConfirmacion(sub, "subcoordinador"); }}
                            className="inline-flex items-center justify-center w-11 h-11 border-2 border-red-500 text-red-600 rounded-xl hover:bg-red-50 hover:border-red-600 transition-all shadow-sm hover:shadow-md"
                            title="Anular confirmación"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); quitarPersona(sub.ci, "subcoordinador"); }}
                          className="inline-flex items-center justify-center w-11 h-11 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-xl hover:from-red-600 hover:to-red-700 transition-all shadow-md hover:shadow-lg"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {expandedCoords[normalizeCI(sub.ci)] && (
                      <div className="bg-gradient-to-b from-gray-50 to-white px-6 pb-4 border-t border-gray-100">
                        <p className="text-sm font-bold text-gray-700 mt-4 mb-3 uppercase tracking-wide">Votantes Asignados</p>
                        <div className="ml-4 border-l-2 border-green-200 pl-4 space-y-2">
                          {getVotantesDeSubcoord(estructura, sub.ci).map((v) => (
                            <VotanteCard key={v.ci} v={v} showAnular={true} />
                          ))}
                          {getVotantesDeSubcoord(estructura, sub.ci).length === 0 && (
                            <p className="text-gray-500 text-sm py-4 text-center">Sin votantes asignados.</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  );
                })}

                {getMisVotantes(estructura, currentUser).length > 0 && (
                  <div className="border-2 border-green-100 rounded-xl mb-4 p-6 bg-gradient-to-r from-green-50/30 to-white">
                    <p className="font-bold text-xl text-gray-900 mb-4 flex items-center gap-2">
                      <span className="inline-block w-1 h-6 bg-green-500 rounded"></span>
                      Mis Votantes Directos
                    </p>
                    <div className="space-y-2">
                      {getMisVotantes(estructura, currentUser).map((v) => (
                        <VotanteCard key={v.ci} v={v} showAnular={true} />
                      ))}
                    </div>
                  </div>
                )}

                {getMisSubcoordinadores(estructura, currentUser).length === 0 &&
                  getMisVotantes(estructura, currentUser).length === 0 && (
                    <div className="text-center py-16">
                      <div className="inline-block p-6 bg-gray-50 rounded-2xl">
                        <p className="text-gray-600 text-lg">
                          Aún no tiene subcoordinadores ni votantes asignados.
                        </p>
                        <p className="text-gray-500 text-sm mt-2">
                          Comience agregando personas a su red electoral.
                        </p>
                      </div>
                    </div>
                  )}
              </div>
            )}

            {/* SUBCOORDINADOR */}
            {currentUser.role === "subcoordinador" && (
              <div>
                {getMisVotantes(estructura, currentUser).length > 0 && (
                  <div className="border-2 border-green-100 rounded-xl p-6 bg-gradient-to-r from-green-50/30 to-white">
                    <p className="font-bold text-xl text-gray-900 mb-4 flex items-center gap-2">
                      <span className="inline-block w-1 h-6 bg-green-500 rounded"></span>
                      Mis Votantes Asignados
                    </p>
                    <div className="space-y-2">
                      {getMisVotantes(estructura, currentUser).map((v) => (
                        <VotanteCard key={v.ci} v={v} showAnular={false} />
                      ))}
                    </div>
                  </div>
                )}
                {getMisVotantes(estructura, currentUser).length === 0 && (
                  <div className="text-center py-16">
                    <div className="inline-block p-6 bg-gray-50 rounded-2xl">
                      <p className="text-gray-600 text-lg">No tiene votantes asignados.</p>
                      <p className="text-gray-500 text-sm mt-2">
                        Su coordinador le asignará votantes pronto.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      </div>

      {/* MODALES */}
      <ModalTelefono
        open={phoneModalOpen}
        persona={phoneTarget}
        value={phoneValue}
        onChange={setPhoneValue}
        onCancel={() => {
          setPhoneModalOpen(false);
          setPhoneTarget(null);
          setPhoneValue("+595");
        }}
        onSave={guardarTelefono}
      />

      <ModalDireccion
        open={direccionModalOpen}
        persona={direccionTarget}
        value={direccionValue}
        onChange={setDireccionValue}
        onCancel={() => {
          setDireccionModalOpen(false);
          setDireccionTarget(null);
          setDireccionValue("");
        }}
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
        onCancel={() => {
          setConfirmVotoModalOpen(false);
          setConfirmVotoTarget(null);
          setIsVotoUndoing(false);
        }}
        onConfirm={handleConfirmVoto}
        isLoading={isConfirmVotoLoading}
      />
    </div>
  );
};

export default Dashboard;
