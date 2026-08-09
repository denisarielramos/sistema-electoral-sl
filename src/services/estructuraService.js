// ======================= SERVICIO DE ESTRUCTURA =======================

import { supabase } from "../supabaseClient";
import { normalizeCI } from "../utils/estructuraHelpers";
import { savePadron, getAllPadron } from "../utils/padronDB";

const PADRON_CACHE_RELEASE = "sl-general-2026-v1";
const PADRON_FIELDS = "ci,nombre,apellido,seccional,local_votacion,mesa,orden";
const REQUESTED_PAGE_SIZE = 10000;
const PARALLEL_REQUESTS = 4;

const mergeEstructura = ({ coords, subs, votos }, padron) => {
  const padronMap = new Map(
    (padron || []).map((p) => [normalizeCI(p.ci), p])
  );

  const mergePadron = (items) =>
    (items || []).map((item) => ({
      ...(padronMap.get(normalizeCI(item.ci)) || {}),
      ...item,
      ci: normalizeCI(item.ci),
    }));

  return {
    coordinadores: mergePadron(coords),
    subcoordinadores: mergePadron(subs),
    votantes: mergePadron(votos),
  };
};

const cargarFilasDeEstructura = async () => {
  const [coordsResult, subsResult, votosResult] = await Promise.all([
    supabase.from("coordinadores").select("*"),
    supabase.from("subcoordinadores").select("*"),
    supabase.from("votantes").select("*"),
  ]);

  if (coordsResult.error) throw coordsResult.error;
  if (subsResult.error) throw subsResult.error;
  if (votosResult.error) throw votosResult.error;

  return {
    coords: coordsResult.data || [],
    subs: subsResult.data || [],
    votos: votosResult.data || [],
  };
};

const cargarPersonasAsignadas = async ({ coords, subs, votos }) => {
  const cis = [...new Set(
    [...coords, ...subs, ...votos]
      .map((item) => normalizeCI(item.ci))
      .filter(Boolean)
  )];

  if (cis.length === 0) return [];

  const result = [];
  const chunkSize = 400;

  for (let i = 0; i < cis.length; i += chunkSize) {
    const { data, error } = await supabase
      .from("padron")
      .select(PADRON_FIELDS)
      .in("ci", cis.slice(i, i + chunkSize));

    if (error) throw error;
    result.push(...(data || []));
  }

  return result;
};

const descargarPadronCompleto = async (total, onProgress) => {
  if (!total) return [];

  // La primera página detecta el límite real configurado en Supabase.
  const firstEnd = Math.min(total, REQUESTED_PAGE_SIZE) - 1;
  const firstResult = await supabase
    .from("padron")
    .select(PADRON_FIELDS)
    .order("ci", { ascending: true })
    .range(0, firstEnd);

  if (firstResult.error) throw firstResult.error;

  const firstPage = firstResult.data || [];
  if (firstPage.length === 0) {
    throw new Error("Supabase no devolvió registros del padrón.");
  }

  const effectivePageSize = firstPage.length;
  const pages = [firstPage];
  let loaded = firstPage.length;
  onProgress?.({ status: "downloading", loaded, total });

  const ranges = [];
  for (let start = effectivePageSize; start < total; start += effectivePageSize) {
    ranges.push({
      start,
      end: Math.min(start + effectivePageSize - 1, total - 1),
    });
  }

  for (let i = 0; i < ranges.length; i += PARALLEL_REQUESTS) {
    const group = ranges.slice(i, i + PARALLEL_REQUESTS);
    const responses = await Promise.all(
      group.map(async ({ start, end }) => {
        const { data, error } = await supabase
          .from("padron")
          .select(PADRON_FIELDS)
          .order("ci", { ascending: true })
          .range(start, end);

        if (error) throw error;
        loaded += (data || []).length;
        onProgress?.({
          status: "downloading",
          loaded: Math.min(loaded, total),
          total,
        });
        return data || [];
      })
    );

    pages.push(...responses);
  }

  const padron = pages.flat();
  if (padron.length !== total) {
    throw new Error(`Descarga incompleta del padrón: ${padron.length} de ${total}.`);
  }

  return padron;
};

// ======================= CARGAR ESTRUCTURA COMPLETA =======================
export const cargarEstructuraCompleta = async ({ onBaseReady, onProgress } = {}) => {
  onProgress?.({ status: "checking", loaded: 0, total: 0 });

  const [estructuraRaw, countResult] = await Promise.all([
    cargarFilasDeEstructura(),
    supabase.from("padron").select("ci", { count: "exact", head: true }),
  ]);

  if (countResult.error) throw countResult.error;
  const total = countResult.count || 0;
  const cacheVersion = `${PADRON_CACHE_RELEASE}:${total}`;
  const cachedPadron = await getAllPadron(cacheVersion, total);

  if (cachedPadron.length === total && total > 0) {
    onProgress?.({ status: "ready", loaded: total, total, source: "cache" });
    return {
      padron: cachedPadron,
      ...mergeEstructura(estructuraRaw, cachedPadron),
    };
  }

  // La estructura aparece enseguida; la descarga completa sigue detrás.
  const personasAsignadas = await cargarPersonasAsignadas(estructuraRaw);
  onBaseReady?.({
    padron: [],
    ...mergeEstructura(estructuraRaw, personasAsignadas),
  });

  const padron = await descargarPadronCompleto(total, onProgress);
  onProgress?.({ status: "saving", loaded: total, total });
  await savePadron(padron, cacheVersion);
  onProgress?.({ status: "ready", loaded: total, total, source: "download" });

  return {
    padron,
    ...mergeEstructura(estructuraRaw, padron),
  };
};
// ======================= AGREGAR PERSONA =======================
export const agregarPersonaService = async ({
  persona,
  modalType,
  currentUser,
  estructura,
}) => {
  const ci = normalizeCI(persona.ci);
  let tabla = "";
  let data = {};

  if (modalType === "coordinador") {
    tabla = "coordinadores";
    data = { ci, login_code: persona.login_code };
  }

  if (modalType === "subcoordinador") {
    tabla = "subcoordinadores";
    data = {
      ci,
      coordinador_ci: currentUser.ci,
      login_code: persona.login_code,
    };
  }

  if (modalType === "votante") {
    tabla = "votantes";
    data = {
      ci,
      asignado_por: currentUser.ci,
      coordinador_ci:
        currentUser.role === "coordinador"
          ? currentUser.ci
          : estructura.subcoordinadores.find(
              (s) => normalizeCI(s.ci) === currentUser.ci
            )?.coordinador_ci,
    };
  }

  const { error } = await supabase.from(tabla).insert([data]);
  if (error) throw error;
};

// ======================= ELIMINAR PERSONA =======================
export const eliminarPersonaService = async (ci, tipo, currentUser) => {
  ci = normalizeCI(ci);

  if (tipo === "coordinador" && currentUser.role === "superadmin") {
    await supabase.from("subcoordinadores").delete().eq("coordinador_ci", ci);
    await supabase.from("votantes").delete().eq("coordinador_ci", ci);
    await supabase.from("coordinadores").delete().eq("ci", ci);
  }

  if (tipo === "subcoordinador") {
    await supabase.from("votantes").delete().eq("asignado_por", ci);
    await supabase.from("subcoordinadores").delete().eq("ci", ci);
  }

  if (tipo === "votante") {
    await supabase.from("votantes").delete().eq("ci", ci);
  }
};

// ======================= ACTUALIZAR TELÉFONO =======================
export const actualizarTelefonoService = async (persona, telefono) => {
  let tabla = "votantes";
  if (persona.tipo === "coordinador") tabla = "coordinadores";
  if (persona.tipo === "subcoordinador") tabla = "subcoordinadores";

  const { error } = await supabase
    .from(tabla)
    .update({ telefono })
    .eq("ci", persona.ci);

  if (error) throw error;
};
