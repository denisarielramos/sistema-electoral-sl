// Traducción de códigos funcionales devueltos por las RPC recorrido_admin_* a
// mensajes en español para la UI. Ningún componente debe mostrar nunca un
// error crudo de Supabase/Postgres — siempre pasa por acá.

const MENSAJES = {
  // Puente de sesión / autenticación
  SESION_SUPERADMIN_EXPIRADA:
    "Tu sesión administrativa expiró. Cerrá sesión e ingresá nuevamente.",
  SESION_SUPERADMIN_INVALIDA:
    "Tu sesión administrativa expiró. Cerrá sesión e ingresá nuevamente.",
  RECORRIDO_NO_AUTORIZADO:
    "Tu usuario Superadmin no está habilitado para acceder al Monitoreo de Recorridos.",
  SESION_ADMIN_INVALIDA:
    "Tu sesión administrativa expiró. Cerrá sesión e ingresá nuevamente.",

  // Jornadas
  JORNADA_DATOS_INVALIDOS: "El nombre y la fecha de la jornada no son válidos.",
  JORNADA_NO_ENCONTRADA: "La jornada indicada no existe o fue eliminada.",

  // Choferes
  CHOFER_DATOS_INVALIDOS: "Los datos del chofer no son válidos.",
  CI_DUPLICADO: "Ya existe un chofer registrado con esa cédula.",
  CHOFER_NO_ENCONTRADO: "El chofer indicado no existe.",
  CHOFERES_INVALIDOS: "El archivo contiene filas con datos inválidos.",
  CHOFERES_VACIO: "No hay choferes para importar.",
  CHOFERES_EXCEDEN_LIMITE: "No se pueden importar más de 500 choferes por lote.",
  NOMBRE_INVALIDO: "El nombre indicado no es válido.",
  FORMATO_INVALIDO: "El formato de la fila no es válido.",
  ERROR_FILA: "No se pudo procesar esa fila.",

  // Asignaciones / códigos
  CI_INVALIDO: "La cédula indicada no es válida.",
  YA_ASIGNADO: "Ese chofer ya tiene un código vigente para esta jornada.",
  DURACION_INVALIDA: "La duración de expiración debe estar entre 1 y 720 horas.",
  ASIGNACION_INVALIDA: "La lista de choferes a asignar no es válida.",
  ASIGNACION_VACIA: "No se indicó ningún chofer para asignar.",
  ASIGNACION_EXCEDE_LIMITE: "No se pueden asignar más de 1000 choferes a la vez.",
  ASIGNACION_NO_ENCONTRADA: "La asignación indicada no existe.",

  // Sesiones / historial
  SESION_NO_ENCONTRADA: "La sesión de recorrido indicada no existe.",

  // Accesos (allowlist)
  ADMIN_DATOS_INVALIDOS: "Los datos del acceso administrativo no son válidos.",
  CI_YA_AUTORIZADA: "Esa cédula ya está autorizada.",
  NO_PUEDE_DESAUTORIZARSE_A_SI_MISMO: "No podés quitarte tu propio acceso.",
  ADMIN_NO_ENCONTRADO: "El acceso administrativo indicado no existe.",

  // Genérico
  ERROR_TECNICO: "Ocurrió un error técnico. Intentá nuevamente en unos instantes.",
};

export const mensajeError = (codigo) =>
  MENSAJES[codigo] || "Ocurrió un error inesperado. Intentá nuevamente.";

export const esErrorDeSesion = (codigo) =>
  codigo === "SESION_SUPERADMIN_EXPIRADA" ||
  codigo === "SESION_SUPERADMIN_INVALIDA" ||
  codigo === "SESION_ADMIN_INVALIDA";

export const esNoAutorizado = (codigo) => codigo === "RECORRIDO_NO_AUTORIZADO";

const ESTADOS_LABEL = {
  no_iniciado: "No iniciado",
  en_movimiento: "En movimiento",
  detenido: "Detenido",
  alerta_detencion: "Alerta de detención",
  sin_senal: "Sin señal",
  finalizado: "Finalizado",
};

export const labelEstado = (estado) => ESTADOS_LABEL[estado] || estado;

const ESTADOS_COLOR = {
  no_iniciado: "#9CA3AF",
  en_movimiento: "#22C55E",
  detenido: "#F59E0B",
  alerta_detencion: "#EF4444",
  sin_senal: "#6B7280",
  finalizado: "#3B82F6",
};

export const colorEstado = (estado) => ESTADOS_COLOR[estado] || "#9CA3AF";

export const formatearFechaHora = (iso) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-UY", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "—";
  }
};

export const formatearHora = (iso) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString("es-UY", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "—";
  }
};

export const formatearKm = (km) => {
  const n = Number(km) || 0;
  return `${n.toFixed(1)} km`;
};

export const formatearDuracionSeg = (totalSeg) => {
  const seg = Math.max(0, Math.floor(Number(totalSeg) || 0));
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  const s = seg % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};

// Normaliza un texto de encabezado de Excel: trim, minúsculas, sin acentos.
export const normalizarEncabezado = (texto) =>
  String(texto ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
