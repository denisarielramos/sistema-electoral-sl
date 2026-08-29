import { normalizeTexto, personaCoincideConsulta, soloDigitosCI } from "./busquedaHelpers.js";
import {
  getCoordsDeDigente,
  getMisSubcoordinadores,
  getSubsDeDigente,
  getTodosVotantesCoord,
  getTodosVotantesDirigente,
  getVotantesDeSubcoord,
  normalizeCI,
  normalizeRole,
} from "./estructuraHelpers.js";

const MAX_LOCAL_ROWS = 250;

const ROLE_LABELS = {
  dirigente: "Dirigente",
  coordinador: "Coordinador",
  subcoordinador: "Subcoordinador",
  votante: "Votante",
  padron: "Padrón · sin asignar",
};

const ROLE_LABELS_PLURAL = {
  dirigente: "Dirigentes",
  coordinador: "Coordinadores",
  subcoordinador: "Subcoordinadores",
  votante: "Votantes",
  padron: "Personas del padrón",
};

const ACTIVE = (persona) => persona?.activo !== false;
const present = (value) => value !== null && value !== undefined && String(value).trim() !== "";
const fullName = (persona) =>
  `${persona?.nombre || ""} ${persona?.apellido || ""}`.trim() || "Sin nombre registrado";

const normalizeQuestion = (question) => normalizeTexto(String(question || "").replace(/[¿?¡!]/g, " "));

const getResponseMode = (question) => {
  const asksForList =
    /\b(quien|quienes|cual|cuales|lista|listame|listar|mostrame|mostrar|nombres?)\b/.test(question);
  const asksForCount =
    /\b(cuanto|cuanta|cuantos|cuantas|cantidad)\b/.test(question) ||
    /\b(numero|total)\s+de\b/.test(question);

  if (asksForList) return "list";
  if (asksForCount) return "count";
  return "default";
};

const buildIndexes = (estructura = {}) => {
  const dirigentes = (estructura.dirigentes || []).filter(ACTIVE);
  const coordinadores = (estructura.coordinadores || []).filter(ACTIVE);
  const subcoordinadores = (estructura.subcoordinadores || []).filter(ACTIVE);
  const votantes = (estructura.votantes || []).filter(ACTIVE);

  return {
    dirigentes,
    coordinadores,
    subcoordinadores,
    votantes,
    dirigenteByCI: new Map(dirigentes.map((persona) => [normalizeCI(persona.ci), persona])),
    coordinadorByCI: new Map(coordinadores.map((persona) => [normalizeCI(persona.ci), persona])),
    subcoordinadorByCI: new Map(subcoordinadores.map((persona) => [normalizeCI(persona.ci), persona])),
  };
};

const resolveVoterHierarchy = (persona, indexes) => {
  const asignadoPor = normalizeCI(persona?.asignado_por);
  const rolAsignador = normalizeRole(persona?.asignado_por_rol);
  let dirigente = indexes.dirigenteByCI.get(normalizeCI(persona?.dirigente_ci)) || null;
  let coordinador = indexes.coordinadorByCI.get(normalizeCI(persona?.coordinador_ci)) || null;
  let subcoordinador = null;

  if (rolAsignador === "subcoordinador" || (!rolAsignador && indexes.subcoordinadorByCI.has(asignadoPor))) {
    subcoordinador = indexes.subcoordinadorByCI.get(asignadoPor) || null;
    coordinador =
      coordinador || indexes.coordinadorByCI.get(normalizeCI(subcoordinador?.coordinador_ci)) || null;
  } else if (rolAsignador === "coordinador" || (!rolAsignador && indexes.coordinadorByCI.has(asignadoPor))) {
    coordinador = coordinador || indexes.coordinadorByCI.get(asignadoPor) || null;
  } else if (rolAsignador === "dirigente" || (!rolAsignador && indexes.dirigenteByCI.has(asignadoPor))) {
    dirigente = dirigente || indexes.dirigenteByCI.get(asignadoPor) || null;
  }

  dirigente =
    dirigente || indexes.dirigenteByCI.get(normalizeCI(coordinador?.dirigente_ci)) || null;

  return { dirigente, coordinador, subcoordinador };
};

const getConfirmation = (persona, role) => {
  if (role === "dirigente" || role === "coordinador") return "Confirmado por rol";
  if (role === "subcoordinador") return persona?.confirmado === true ? "Confirmado" : "Pendiente";
  if (role === "votante") return persona?.voto_confirmado === true ? "Confirmado" : "Pendiente";
  return "Sin asignación";
};

const toResultRow = (persona, role, indexes) => {
  const ci = normalizeCI(persona?.ci);
  let dirigente = null;
  let coordinador = null;
  let subcoordinador = null;

  if (role === "coordinador") {
    dirigente = indexes.dirigenteByCI.get(normalizeCI(persona?.dirigente_ci)) || null;
  } else if (role === "subcoordinador") {
    coordinador = indexes.coordinadorByCI.get(normalizeCI(persona?.coordinador_ci)) || null;
    dirigente = indexes.dirigenteByCI.get(normalizeCI(coordinador?.dirigente_ci)) || null;
  } else if (role === "votante") {
    ({ dirigente, coordinador, subcoordinador } = resolveVoterHierarchy(persona, indexes));
  }

  return {
    id: `${role}:${ci || fullName(persona)}`,
    role,
    rol: ROLE_LABELS[role] || role,
    nombre: persona?.nombre || "",
    apellido: persona?.apellido || "",
    nombreCompleto: fullName(persona),
    ci,
    telefono: persona?.telefono || "",
    seccional: persona?.seccional || "",
    local: persona?.local_votacion || "",
    mesa: present(persona?.mesa) ? String(persona.mesa) : "",
    orden: present(persona?.orden) ? String(persona.orden) : "",
    direccion: persona?.direccion_override || persona?.direccion || "",
    terceraEdad:
      persona?.tercera_edad === true ? "Sí" : persona?.tercera_edad === false ? "No" : "Sin dato",
    confirmacion: getConfirmation(persona, role),
    dirigente: dirigente ? fullName(dirigente) : "",
    coordinador: coordinador ? fullName(coordinador) : "",
    subcoordinador: subcoordinador ? fullName(subcoordinador) : "",
    asignadoPor: persona?.asignado_por_nombre || "",
  };
};

const buildResult = ({ title, rows, description, scope = "estructura", total: providedTotal }) => {
  const total = providedTotal ?? rows.length;
  return {
    kind: "people",
    title,
    description,
    scope,
    total,
    rows: rows.slice(0, MAX_LOCAL_ROWS),
    truncated: total > MAX_LOCAL_ROWS,
    localOnly: true,
  };
};

const buildEmptyResult = (title, description) => ({
  kind: "people",
  title,
  description,
  scope: "estructura",
  total: 0,
  rows: [],
  truncated: false,
  localOnly: true,
});

const applyResponseMode = (result, responseMode) => {
  if (!result || responseMode !== "count") return result;

  return {
    ...result,
    kind: "count",
    rows: [],
    truncated: false,
  };
};

const roleFromQuestion = (question) => {
  if (/\bsubcoordinadores?\b/.test(question)) return "subcoordinador";
  if (/\bcoordinadores?\b/.test(question)) return "coordinador";
  if (/\bdirigentes?\b/.test(question)) return "dirigente";
  if (/\bvotantes?\b/.test(question)) return "votante";
  return null;
};

const extractNumberFilter = (rawQuestion, label) => {
  const expression = new RegExp(`${label}\\s*(?:n(?:ro|umero|úmero)?[.º°]?|#)?\\s*([0-9]{1,6}[a-z]?)`, "i");
  return rawQuestion.match(expression)?.[1] || "";
};

const findMentionedValue = (question, people, field) => {
  const values = [...new Set(people.map((persona) => String(persona?.[field] || "").trim()).filter(Boolean))]
    .sort((a, b) => b.length - a.length);
  return values.find((value) => normalizeQuestion(value).length >= 3 && question.includes(normalizeQuestion(value))) || "";
};

const extractPersonSearch = (rawQuestion, normalizedQuestion) => {
  const digitGroups = String(rawQuestion).match(/(?:\+?\d[\d().\s-]{5,}\d)/g) || [];
  const numericIdentifier = /\b(mesa|orden)\b/.test(normalizedQuestion)
    ? ""
    : digitGroups.map((value) => value.trim()).find((value) => soloDigitosCI(value).length >= 6);
  if (numericIdentifier) return numericIdentifier;

  const patterns = [
    /(?:informaci[oó]n|datos|ficha|detalle|todo)\s+(?:completa\s+)?(?:de|del)\s+(.+)$/i,
    /(?:qui[eé]n\s+es|d[oó]nde\s+vota)\s+(.+)$/i,
    /(?:buscar|busca|mostrame|mostrar)\s+(?:a\s+)?(.+)$/i,
    /(?:mesa|orden|local|tel[eé]fono|ci|c[eé]dula)\s+(?:y\s+\w+\s+)?de\s+(.+)$/i,
  ];

  for (const pattern of patterns) {
    const value = String(rawQuestion).replace(/[?!.]+$/g, "").match(pattern)?.[1]?.trim();
    if (value && normalizeQuestion(value).length >= 2) return value;
  }

  if (/\bpersona\b/.test(normalizedQuestion)) {
    const value = String(rawQuestion).replace(/[?!.]+$/g, "").split(/\bpersona\b/i)[1]?.trim();
    if (value && normalizeQuestion(value).length >= 2) return value;
  }

  return "";
};

const isSensitiveSystemQuestion = (question) =>
  /\b(nombre|apellido|persona|personas|quien|quienes|ci|cedula|telefono|direccion|dirigente|coordinador|subcoordinador|votante|padron|mesa|orden|local|seccional|tercera edad|adulto mayor|confirmado|confirmados|pendiente|pendientes|vota|votan)\b/.test(
    question
  );

const getStructurePeople = (indexes) => [
  ...indexes.dirigentes.map((persona) => ({ persona, role: "dirigente" })),
  ...indexes.coordinadores.map((persona) => ({ persona, role: "coordinador" })),
  ...indexes.subcoordinadores.map((persona) => ({ persona, role: "subcoordinador" })),
  ...indexes.votantes.map((persona) => ({ persona, role: "votante" })),
];

const resolveHierarchyGap = (question, estructura, indexes) => {
  if (/\bdirigentes?\b.*\b(sin|no tienen|no tiene)\b.*\bcoordinadores?\b/.test(question)) {
    const withCoordinators = new Set(indexes.coordinadores.map((persona) => normalizeCI(persona.dirigente_ci)));
    const people = indexes.dirigentes.filter((persona) => !withCoordinators.has(normalizeCI(persona.ci)));
    return buildResult({
      title: "Dirigentes sin coordinadores",
      description: `${people.length} dirigente${people.length === 1 ? "" : "s"} sin coordinadores asignados.`,
      rows: people.map((persona) => toResultRow(persona, "dirigente", indexes)),
    });
  }

  if (/\bcoordinadores?\b.*\b(sin|no tienen|no tiene)\b.*\bsubcoordinadores?\b/.test(question)) {
    const withSubcoordinators = new Set(indexes.subcoordinadores.map((persona) => normalizeCI(persona.coordinador_ci)));
    const people = indexes.coordinadores.filter((persona) => !withSubcoordinators.has(normalizeCI(persona.ci)));
    return buildResult({
      title: "Coordinadores sin subcoordinadores",
      description: `${people.length} coordinador${people.length === 1 ? "" : "es"} sin subcoordinadores asignados.`,
      rows: people.map((persona) => toResultRow(persona, "coordinador", indexes)),
    });
  }

  if (/\bsubcoordinadores?\b.*\b(sin|no tienen|no tiene)\b.*\bvotantes?\b/.test(question)) {
    const people = indexes.subcoordinadores.filter(
      (persona) => getVotantesDeSubcoord(estructura, normalizeCI(persona.ci)).length === 0
    );
    return buildResult({
      title: "Subcoordinadores sin votantes",
      description: `${people.length} subcoordinador${people.length === 1 ? "" : "es"} sin votantes asignados.`,
      rows: people.map((persona) => toResultRow(persona, "subcoordinador", indexes)),
    });
  }

  return null;
};

const resolveChildrenQuery = (rawQuestion, question, estructura, indexes) => {
  const match = String(rawQuestion)
    .replace(/[?!.]+$/g, "")
    .match(/(coordinadores?|subcoordinadores?|votantes?)\s+(?:de|del)\s+(.+)$/i);
  if (!match || /\b(sin|no tienen|no tiene)\b/.test(question)) return null;

  const requestedRole = roleFromQuestion(normalizeQuestion(match[1]));
  const ownerTerm = match[2].trim();
  const candidates = getStructurePeople(indexes).filter(({ persona }) => personaCoincideConsulta(persona, ownerTerm));

  if (candidates.length !== 1) {
    const rows = candidates.map(({ persona, role }) => toResultRow(persona, role, indexes));
    return buildResult({
      title: candidates.length ? "Coincidencias para elegir" : "No encontré a esa persona",
      description: candidates.length
        ? "La consulta coincide con varias personas. Usá el nombre completo o la CI."
        : `No hay coincidencias en la estructura para “${ownerTerm}”.`,
      rows,
    });
  }

  const owner = candidates[0];
  let people = [];
  let role = requestedRole;

  if (requestedRole === "coordinador" && owner.role === "dirigente") {
    people = getCoordsDeDigente(estructura, owner.persona.ci);
  } else if (requestedRole === "subcoordinador" && owner.role === "dirigente") {
    people = getSubsDeDigente(estructura, owner.persona.ci);
  } else if (requestedRole === "subcoordinador" && owner.role === "coordinador") {
    people = getMisSubcoordinadores(estructura, owner.persona.ci);
  } else if (requestedRole === "votante" && owner.role === "dirigente") {
    people = getTodosVotantesDirigente(estructura, owner.persona.ci);
  } else if (requestedRole === "votante" && owner.role === "coordinador") {
    people = getTodosVotantesCoord(estructura, owner.persona.ci);
  } else if (requestedRole === "votante" && owner.role === "subcoordinador") {
    people = getVotantesDeSubcoord(estructura, owner.persona.ci);
  } else {
    return buildEmptyResult(
      "Consulta sin resultados",
      `No existe una relación directa de ${ROLE_LABELS[requestedRole]?.toLowerCase() || "personas"} debajo de ${fullName(owner.persona)}.`
    );
  }

  return buildResult({
    title: `${ROLE_LABELS_PLURAL[requestedRole]} de ${fullName(owner.persona)}`,
    description: `${people.length} resultado${people.length === 1 ? "" : "s"} en su estructura.`,
    rows: people.map((persona) => toResultRow(persona, role, indexes)),
  });
};

const resolvePersonLookup = (rawQuestion, question, padron, indexes) => {
  const term = extractPersonSearch(rawQuestion, question);
  if (!term) return null;

  const structureMatches = getStructurePeople(indexes).filter(({ persona }) =>
    personaCoincideConsulta(persona, term)
  );
  const structureCIs = new Set(structureMatches.map(({ persona }) => normalizeCI(persona.ci)));
  const matches = structureMatches.slice(0, MAX_LOCAL_ROWS);
  let total = structureMatches.length;
  for (const persona of padron || []) {
    if (structureCIs.has(normalizeCI(persona.ci)) || !personaCoincideConsulta(persona, term)) continue;
    total += 1;
    if (matches.length < MAX_LOCAL_ROWS) matches.push({ persona, role: "padron" });
  }

  return buildResult({
    title: total ? `Resultados para “${term}”` : "Persona no encontrada",
    description: total
      ? `${total} coincidencia${total === 1 ? "" : "s"} entre la estructura y el padrón.`
      : `No encontré coincidencias para “${term}”.`,
    scope: "estructura-y-padron",
    rows: matches.map(({ persona, role }) => toResultRow(persona, role, indexes)),
    total,
  });
};

const resolveFilteredList = (rawQuestion, question, estructura, padron, indexes) => {
  const scopePadron = /\bpadron\b/.test(question);
  const role = roleFromQuestion(question);
  const thirdAge = /\b(tercera edad|adultos? mayores?)\b/.test(question);
  const pending = /\bpendientes?\b/.test(question);
  const confirmed = /\bconfirmados?\b/.test(question) && !pending;
  const mesa = extractNumberFilter(rawQuestion, "mesa");
  const orden = extractNumberFilter(rawQuestion, "orden");

  const structurePeople = getStructurePeople(indexes);
  const sourcePeople = scopePadron ? padron || [] : structurePeople;
  const rawPeople = scopePadron ? sourcePeople : sourcePeople.map(({ persona }) => persona);
  const local = findMentionedValue(question, rawPeople, "local_votacion");
  const seccional = findMentionedValue(question, rawPeople, "seccional");
  const broadList =
    /\b(todo|toda|todos|todas|sistema completo|estructura completa|red completa)\b/.test(question) &&
    !/\b(informacion|datos|ficha|detalle)\b.*\b(de|del)\b/.test(question);

  const hasFilter =
    Boolean(role || thirdAge || pending || confirmed || mesa || orden || local || seccional) ||
    broadList;
  if (!hasFilter) return null;

  const rows = [];
  let total = 0;
  for (const item of sourcePeople) {
    const persona = scopePadron ? item : item.persona;
    const personRole = scopePadron ? "padron" : item.role;
    if (!ACTIVE(persona)) continue;
    if (role && personRole !== role) continue;
    if (thirdAge && persona?.tercera_edad !== true) continue;
    if (pending && getConfirmation(persona, personRole) !== "Pendiente") continue;
    if (confirmed && !getConfirmation(persona, personRole).startsWith("Confirmado")) continue;
    if (mesa && normalizeTexto(persona?.mesa) !== normalizeTexto(mesa)) continue;
    if (orden && normalizeTexto(persona?.orden) !== normalizeTexto(orden)) continue;
    if (local && normalizeTexto(persona?.local_votacion) !== normalizeTexto(local)) continue;
    if (seccional && normalizeTexto(persona?.seccional) !== normalizeTexto(seccional)) continue;
    total += 1;
    if (rows.length < MAX_LOCAL_ROWS) rows.push({ persona, role: personRole });
  }

  const labels = [
    role ? ROLE_LABELS_PLURAL[role] : scopePadron ? "Personas del padrón" : "Personas de la estructura",
    thirdAge ? "de tercera edad" : "",
    pending ? "pendientes" : confirmed ? "confirmadas" : "",
    mesa ? `mesa ${mesa}` : "",
    orden ? `orden ${orden}` : "",
    local ? `local ${local}` : "",
    seccional ? `seccional ${seccional}` : "",
  ].filter(Boolean);

  return buildResult({
    title: labels.join(" · "),
    description: `${total} resultado${total === 1 ? "" : "s"}.`,
    scope: scopePadron ? "padron" : "estructura",
    rows: rows.map(({ persona, role: personRole }) => toResultRow(persona, personRole, indexes)),
    total,
  });
};

export const resolverConsultaLocal = ({ question, estructura = {}, padron = [] }) => {
  const rawQuestion = String(question || "").trim();
  const normalizedQuestion = normalizeQuestion(rawQuestion);
  if (!normalizedQuestion) return null;

  const indexes = buildIndexes(estructura);
  const responseMode = getResponseMode(normalizedQuestion);
  const finalize = (result) => applyResponseMode(result, responseMode);

  const hierarchyGap = resolveHierarchyGap(normalizedQuestion, estructura, indexes);
  if (hierarchyGap) return finalize(hierarchyGap);

  const children = resolveChildrenQuery(rawQuestion, normalizedQuestion, estructura, indexes);
  if (children) return finalize(children);

  const filtered = resolveFilteredList(rawQuestion, normalizedQuestion, estructura, padron, indexes);
  if (filtered) return finalize(filtered);

  const lookup = resolvePersonLookup(rawQuestion, normalizedQuestion, padron, indexes);
  if (lookup) return finalize(lookup);

  if (isSensitiveSystemQuestion(normalizedQuestion)) {
    return buildEmptyResult(
      "No pude interpretar la consulta",
      "Probá indicando el dato o filtro exacto: nombre o CI, rol, mesa, orden, local, tercera edad, confirmación o relación jerárquica."
    );
  }

  return null;
};

export const ASISTENTE_MAX_LOCAL_ROWS = MAX_LOCAL_ROWS;
