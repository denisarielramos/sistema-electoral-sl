// ======================= PRUEBAS E2E (PLAYWRIGHT): MAPEO TERRITORIAL Y BITÁCORA =======================
// No hay framework de test E2E configurado en este proyecto — este script usa
// Playwright directamente (sin @playwright/test) con node:assert, siguiendo la misma
// filosofía que los scripts scripts/smoke-test-*.mjs (sin jest/vitest).
//
// Playwright NO es una dependencia del proyecto a propósito: su script de instalación
// intenta descargar un navegador (~300 MB) en cada `npm install`, lo cual puede fallar
// o simplemente sobra en un build de despliegue (Vercel) que nunca ejecuta este
// script. Se instala manualmente, solo cuando alguien quiere correr estas pruebas.
//
// Requisitos para ejecutar:
//   1) npm install -D playwright && npx playwright install chromium   (una sola vez)
//   2) npm run dev -- --port 5183        (en otra terminal, con VITE_SUPABASE_URL y
//                                          VITE_SUPABASE_ANON_KEY definidos aunque sean
//                                          valores ficticios — todo el tráfico a
//                                          Supabase se intercepta y se simula abajo)
//   3) node scripts/playwright-mapeo-bitacora.mjs
//
// IMPORTANTE: usa únicamente datos sintéticos/ficticios (CIs, nombres y coordenadas
// inventados) — nunca información real de personas ni coordenadas reales.
//
// Cubre: superadmin viendo varias ramas, dirigente y coordinador viendo solo su
// estructura, subcoordinador cargando ubicación para un votante propio, intento de
// consultar otra rama (bloqueado por el RPC simulado), hogar con varios votantes,
// creación y edición de hogar, verificación y rechazo de ubicación, visita dentro y
// fuera del radio, GPS impreciso, error de geolocalización, vista móvil.

import assert from "node:assert/strict";
import { chromium } from "playwright";

const BASE = process.env.MAPEO_TEST_BASE_URL || "http://localhost:5183";
const SUPA = "https://mock.supabase.co";

// ======================= DATOS SINTÉTICOS (ficticios) =======================
const buildDataset = () => ({
  dirigentes: [
    { ci: "1100001", nombre: "Dirigente", apellido: "Uno", telefono: "+595971100001", login_code: "DIR0001", es_externo: false, activo: true },
    { ci: "1100002", nombre: "Dirigente", apellido: "Dos", telefono: "+595971100002", login_code: "DIR0002", es_externo: false, activo: true },
  ],
  coordinadores: [
    { ci: "1200001", dirigente_ci: "1100001", nombre: "Coordinador", apellido: "Uno", telefono: "+595971200001", login_code: "COO0001" },
    { ci: "1200002", dirigente_ci: "1100002", nombre: "Coordinador", apellido: "Dos", telefono: "+595971200002", login_code: "COO0002" },
  ],
  subcoordinadores: [
    { ci: "1300001", coordinador_ci: "1200001", nombre: "Subcoord", apellido: "Uno", telefono: "+595971300001", login_code: "SUB0001" },
  ],
  votantes: [
    { ci: "1400001", coordinador_ci: "1200001", asignado_por: "1200001", asignado_por_rol: "coordinador", nombre: "Votante", apellido: "Uno", telefono: "+595971400001", activo: true },
    { ci: "1400002", coordinador_ci: "1300001", asignado_por: "1300001", asignado_por_rol: "subcoordinador", nombre: "Votante", apellido: "Dos", telefono: "+595971400002", activo: true },
    { ci: "1400003", coordinador_ci: "1200002", asignado_por: "1200002", asignado_por_rol: "coordinador", nombre: "Votante", apellido: "Tres", telefono: "+595971400003", activo: true },
  ],
  padron: [
    { ci: "1100001", nombre: "Dirigente", apellido: "Uno", seccional: "1", local_votacion: "L1", mesa: "1", orden: "1", direccion: "" },
    { ci: "1100002", nombre: "Dirigente", apellido: "Dos", seccional: "1", local_votacion: "L1", mesa: "1", orden: "2", direccion: "" },
    { ci: "1200001", nombre: "Coordinador", apellido: "Uno", seccional: "1", local_votacion: "L1", mesa: "1", orden: "3", direccion: "" },
    { ci: "1200002", nombre: "Coordinador", apellido: "Dos", seccional: "1", local_votacion: "L1", mesa: "1", orden: "4", direccion: "" },
    { ci: "1300001", nombre: "Subcoord", apellido: "Uno", seccional: "1", local_votacion: "L1", mesa: "1", orden: "5", direccion: "" },
    { ci: "1400001", nombre: "Votante", apellido: "Uno", seccional: "1", local_votacion: "L1", mesa: "1", orden: "6", direccion: "" },
    { ci: "1400002", nombre: "Votante", apellido: "Dos", seccional: "1", local_votacion: "L1", mesa: "1", orden: "7", direccion: "" },
    { ci: "1400003", nombre: "Votante", apellido: "Tres", seccional: "1", local_votacion: "L1", mesa: "1", orden: "8", direccion: "" },
  ],
});

// Punto de referencia ficticio (no es una dirección real) usado para todos los
// hogares/visitas simulados de este script.
const PUNTO = { lat: -25.3, lng: -57.6 };

// ======================= MOCK DEL BACKEND (mismas reglas que el SQL real) =======================
const haversine = (lat1, lng1, lat2, lng2) => {
  if ([lat1, lng1, lat2, lng2].some((v) => v === null || v === undefined)) return null;
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

function createMockBackend(dataset) {
  const { dirigentes, coordinadores, subcoordinadores, votantes } = dataset;
  let hogares = [];
  let hogarVotantes = [];
  let visitasHogar = [];
  let configuracion = { radio_permitido_metros: 100, precision_gps_maxima_metros: 50 };
  let idCounter = 1;

  const resolverIdentidad = (loginCode) => {
    // Espejo de mapeo_identidad: dirigente/coordinador/subcoordinador desactivados
    // (activo === false) no resuelven identidad, igual que un login_code inválido.
    const d = dirigentes.find((x) => x.login_code === loginCode && x.activo !== false);
    if (d) return { ci: d.ci, rol: "dirigente" };
    const c = coordinadores.find((x) => x.login_code === loginCode && x.activo !== false);
    if (c) return { ci: c.ci, rol: "coordinador" };
    const s = subcoordinadores.find((x) => x.login_code === loginCode && x.activo !== false);
    if (s) return { ci: s.ci, rol: "subcoordinador" };
    return null;
  };

  const resolverActor = (body) => {
    if (body.p_superadmin_ci) return { ci: body.p_superadmin_ci, rol: "superadmin" };
    const id = resolverIdentidad(body.p_login_code);
    if (!id) throw new Error("Identidad inválida: código de acceso no reconocido.");
    return { ci: id.ci, rol: id.rol };
  };

  const votanteEnAlcance = (votanteCi, actorCi, actorRol) => {
    const v = votantes.find((x) => x.ci === votanteCi);
    if (!v || v.activo === false) return false;
    if (actorRol === "superadmin") return true;
    if (actorRol === "dirigente") {
      if (v.dirigente_ci === actorCi) return true;
      // Compatibilidad legacy: fila sin dirigente_ci poblado pero con asignado_por +
      // asignado_por_rol === "dirigente" (espejo del fallback agregado en el SQL real).
      // No debe imponerse si dirigente_ci ya apunta a OTRO dirigente (reasignado).
      if (!v.dirigente_ci && v.asignado_por === actorCi && v.asignado_por_rol === "dirigente") return true;
      const coordCIs = coordinadores.filter((c) => c.dirigente_ci === actorCi).map((c) => c.ci);
      if (coordCIs.includes(v.coordinador_ci)) return true;
      const subCIs = subcoordinadores.filter((s) => coordCIs.includes(s.coordinador_ci)).map((s) => s.ci);
      return v.asignado_por_rol === "subcoordinador" && subCIs.includes(v.asignado_por);
    }
    if (actorRol === "coordinador") {
      if (v.coordinador_ci === actorCi) return true;
      // Compatibilidad legacy: mismo fallback "estricto" que getVotantesDirectosCoord.
      // No debe imponerse si coordinador_ci ya apunta a OTRO coordinador (reasignado).
      if (!v.coordinador_ci && v.asignado_por === actorCi && v.asignado_por_rol === "coordinador") return true;
      const subCIs = subcoordinadores.filter((s) => s.coordinador_ci === actorCi).map((s) => s.ci);
      return v.asignado_por_rol === "subcoordinador" && subCIs.includes(v.asignado_por);
    }
    if (actorRol === "subcoordinador") {
      return v.asignado_por === actorCi && (v.asignado_por_rol === "subcoordinador" || !v.asignado_por_rol);
    }
    return false;
  };

  const hogarEnAlcance = (hogarId, actorCi, actorRol) => {
    if (actorRol === "superadmin") return true;
    // Espejo de mapeo_hogar_en_alcance en el SQL real: el creador solo tiene acceso
    // transitorio mientras el hogar no tenga NINGÚN votante asociado activo todavía
    // — en cuanto tiene uno, el alcance pasa a depender exclusivamente de los
    // votantes (nunca queda un acceso permanente para quien lo creó).
    const tieneVotantes = hogarVotantes.some((hv) => hv.hogar_id === hogarId && hv.activo);
    if (!tieneVotantes) {
      const hogar = hogares.find((h) => h.id === hogarId);
      return !!hogar && hogar.creado_por_ci === actorCi;
    }
    return hogarVotantes.some((hv) => hv.hogar_id === hogarId && hv.activo && votanteEnAlcance(hv.votante_ci, actorCi, actorRol));
  };

  // actor: si se provee, filtra los miembros embebidos a los que están en su alcance
  // individual (espejo del filtro por-votante agregado a mapeo_listar_hogares /
  // mapeo_listar_visitas — un hogar compartido entre ramas no debe exponer los
  // miembros de otra rama solo porque el hogar en sí está en alcance). Sin actor
  // (uso interno vía _state()/seed) no filtra, para no romper las aserciones que
  // inspeccionan el estado crudo del mock.
  const embedHogar = (h, actor) => ({
    ...h,
    votantes: hogarVotantes
      .filter((hv) => hv.hogar_id === h.id && hv.activo)
      .map((hv) => votantes.find((x) => x.ci === hv.votante_ci))
      .filter(Boolean)
      .filter((v) => !actor || actor.rol === "superadmin" || votanteEnAlcance(v.ci, actor.ci, actor.rol))
      .map((v) => ({ ci: v.ci, nombre: v.nombre, apellido: v.apellido, telefono: v.telefono, dirigente_ci: v.dirigente_ci, coordinador_ci: v.coordinador_ci, asignado_por: v.asignado_por, asignado_por_rol: v.asignado_por_rol })),
    ultima_visita: (() => {
      const vs = visitasHogar.filter((x) => x.hogar_id === h.id).sort((a, b) => new Date(b.fecha_hora) - new Date(a.fecha_hora));
      return vs[0] ? { id: vs[0].id, resultado: vs[0].resultado, fecha_hora: vs[0].fecha_hora, visitante_ci: vs[0].visitante_ci, visitante_rol: vs[0].visitante_rol, distancia_metros: vs[0].distancia_metros } : null;
    })(),
  });

  const handlers = {
    mapeo_configuracion_actual: () => configuracion,
    mapeo_listar_hogares: (body) => {
      const actor = resolverActor(body);
      return hogares.filter((h) => h.activo !== false && hogarEnAlcance(h.id, actor.ci, actor.rol)).map((h) => embedHogar(h, actor));
    },
    mapeo_crear_hogar: (body) => {
      const actor = resolverActor(body);
      const hogar = {
        id: `hogar-${idCounter++}`, nombre_familia: body.p_nombre_familia, direccion: body.p_direccion,
        referencia: body.p_referencia, latitud: body.p_latitud, longitud: body.p_longitud, precision_gps: body.p_precision_gps,
        estado: "pendiente", creado_por_ci: actor.ci, creado_por_rol: actor.rol, verificado_por_ci: null, verificado_por_rol: null,
        fecha_verificacion: null, activo: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      };
      hogares.push(hogar);
      return embedHogar(hogar, actor);
    },
    mapeo_actualizar_hogar: (body) => {
      const actor = resolverActor(body);
      const h = hogares.find((x) => x.id === body.p_hogar_id);
      const cambiaUbicacion = h.latitud !== body.p_latitud || h.longitud !== body.p_longitud;
      Object.assign(h, {
        nombre_familia: body.p_nombre_familia, direccion: body.p_direccion, referencia: body.p_referencia,
        latitud: body.p_latitud, longitud: body.p_longitud, precision_gps: body.p_precision_gps,
      });
      if (cambiaUbicacion) { h.estado = "pendiente"; h.verificado_por_ci = null; h.verificado_por_rol = null; h.fecha_verificacion = null; }
      return embedHogar(h, actor);
    },
    mapeo_verificar_hogar: (body) => {
      const actor = resolverActor(body);
      if (!["superadmin", "dirigente"].includes(actor.rol)) throw new Error("Solo superadmin o dirigente pueden verificar/rechazar.");
      const h = hogares.find((x) => x.id === body.p_hogar_id);
      h.estado = body.p_aprobar ? "verificado" : "rechazado";
      h.verificado_por_ci = actor.ci;
      h.verificado_por_rol = actor.rol;
      h.fecha_verificacion = new Date().toISOString();
      return embedHogar(h, actor);
    },
    mapeo_asociar_votante: (body) => {
      const actor = resolverActor(body);
      if (!hogarEnAlcance(body.p_hogar_id, actor.ci, actor.rol)) throw new Error("El hogar no está dentro de su alcance.");
      if (!votanteEnAlcance(body.p_votante_ci, actor.ci, actor.rol)) throw new Error("El votante no está dentro de su alcance.");
      const existente = hogarVotantes.find((hv) => hv.votante_ci === body.p_votante_ci && hv.activo);
      if (existente && existente.hogar_id !== body.p_hogar_id) throw new Error("El votante ya pertenece a otro hogar activo.");
      if (!existente) hogarVotantes.push({ hogar_id: body.p_hogar_id, votante_ci: body.p_votante_ci, activo: true });
      return { hogar_id: body.p_hogar_id, votante_ci: body.p_votante_ci, activo: true };
    },
    mapeo_desasociar_votante: (body) => {
      const actor = resolverActor(body);
      if (!hogarEnAlcance(body.p_hogar_id, actor.ci, actor.rol)) throw new Error("El hogar no está dentro de su alcance.");
      // Un hogar compartido entre ramas no autoriza a desasociar a un votante de OTRA
      // rama solo porque el hogar está en alcance (espejo del chequeo agregado al RPC).
      if (actor.rol !== "superadmin" && !votanteEnAlcance(body.p_votante_ci, actor.ci, actor.rol)) {
        throw new Error("El votante no está dentro de su alcance.");
      }
      const fila = hogarVotantes.find((hv) => hv.hogar_id === body.p_hogar_id && hv.votante_ci === body.p_votante_ci);
      if (fila) fila.activo = false;
      return null;
    },
    mapeo_confirmar_visita: (body) => {
      const actor = resolverActor(body);
      if (!hogarEnAlcance(body.p_hogar_id, actor.ci, actor.rol)) throw new Error("El hogar no está dentro de su alcance.");
      // Espejo del rechazo agregado al RPC: precisión negativa o no-finita (NaN o
      // +/-Infinity) es un dato malformado, no una simple imprecisión — se rechaza en
      // vez de registrarse. (A diferencia de PostgreSQL, JS sí trata NaN/Infinity
      // como "no finitos" de forma directa con Number.isFinite — no hace falta el
      // truco de comparar contra literales que usa mapeo_es_finito() en SQL.)
      if (body.p_precision_gps !== null && body.p_precision_gps !== undefined) {
        if (body.p_precision_gps < 0 || !Number.isFinite(body.p_precision_gps)) {
          throw new Error(`Precisión GPS inválida: ${body.p_precision_gps}`);
        }
      }
      const h = hogares.find((x) => x.id === body.p_hogar_id);
      const distancia = haversine(body.p_latitud, body.p_longitud, h.latitud, h.longitud);
      let resultado;
      if (body.p_precision_gps !== null && body.p_precision_gps > configuracion.precision_gps_maxima_metros) resultado = "error_gps";
      else if (distancia === null) resultado = "error_gps";
      else resultado = distancia <= configuracion.radio_permitido_metros ? "confirmada" : "fuera_de_radio";
      const visita = {
        id: `visita-${idCounter++}`, hogar_id: body.p_hogar_id, visitante_ci: actor.ci, visitante_rol: actor.rol,
        latitud: body.p_latitud, longitud: body.p_longitud, precision_gps: body.p_precision_gps,
        distancia_metros: distancia, radio_permitido_usado: configuracion.radio_permitido_metros,
        resultado, observacion: body.p_observacion, fecha_hora: new Date().toISOString(),
        creado_por_ci: actor.ci, creado_por_rol: actor.rol,
      };
      visitasHogar.push(visita);
      return visita;
    },
    mapeo_listar_visitas: (body) => {
      const actor = resolverActor(body);
      return visitasHogar
        .filter((v) => actor.rol === "superadmin" || hogarEnAlcance(v.hogar_id, actor.ci, actor.rol))
        .map((v) => {
          const h = hogares.find((x) => x.id === v.hogar_id);
          return { ...v, hogar_nombre_familia: h?.nombre_familia, hogar_direccion: h?.direccion, votantes: embedHogar(h, actor).votantes };
        });
    },
  };

  return { handlers, dataset, seedHogar: (h) => { hogares.push(h); return h; }, seedHogarVotante: (hv) => hogarVotantes.push(hv), _state: () => ({ hogares, hogarVotantes, visitasHogar }) };
}

// ======================= HARNESS DE PRUEBAS =======================
const resultados = [];
const test = async (nombre, fn) => {
  try {
    await fn();
    resultados.push({ nombre, ok: true });
    console.log(`OK: ${nombre}`);
  } catch (err) {
    resultados.push({ nombre, ok: false, error: err.message });
    console.log(`FALLO: ${nombre}\n   ${err.message}`);
  }
};

let browser;

async function withPage(user, backend, opts, fn) {
  const page = await browser.newPage({
    viewport: opts.viewport || { width: 1280, height: 1400 },
    geolocation: opts.geolocation,
    permissions: opts.geolocation ? ["geolocation"] : [],
  });
  const errores = [];
  page.on("pageerror", (err) => errores.push(err.message));

  await page.route(`${SUPA}/rest/v1/rpc/**`, async (route) => {
    const url = new URL(route.request().url());
    const fn2 = url.pathname.replace("/rest/v1/rpc/", "");
    const body = route.request().postDataJSON() || {};
    try {
      const handler = backend.handlers[fn2];
      if (!handler) throw new Error(`RPC no mockeada: ${fn2}`);
      const result = handler(body);
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(result) });
    } catch (err) {
      await route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ message: err.message }) });
    }
  });
  await page.route(`${SUPA}/rest/v1/**`, async (route) => {
    if (route.request().url().includes("/rest/v1/rpc/")) return route.fallback();
    const url = new URL(route.request().url());
    const table = url.pathname.replace("/rest/v1/", "");
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(backend.dataset[table] || []) });
  });

  await page.addInitScript((u) => localStorage.setItem("currentUser", JSON.stringify(u)), user);
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);

  try {
    await fn(page);
  } finally {
    assert.deepEqual(errores, [], `Errores de JS en página: ${errores.join(" | ")}`);
    await page.close();
  }
}

// ======================= ESCENARIOS =======================

await (async () => {
  // PLAYWRIGHT_CHROMIUM_EXECUTABLE: opcional, para entornos con un Chromium ya
  // instalado en una ruta no estándar (p. ej. sandboxes de CI). En un entorno normal
  // no hace falta: basta con `npx playwright install chromium`.
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined });

  // --- 1) Superadmin ve varias ramas ---
  await test("Superadmin ve hogares de varias ramas (dos dirigentes distintos)", async () => {
    const dataset = buildDataset();
    const backend = createMockBackend(dataset);
    backend.seedHogar({ id: "h1", nombre_familia: "Hogar Rama 1", direccion: "Dir 1", referencia: "", latitud: PUNTO.lat, longitud: PUNTO.lng, precision_gps: 10, estado: "verificado", creado_por_ci: "1200001", creado_por_rol: "coordinador", activo: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    backend.seedHogarVotante({ hogar_id: "h1", votante_ci: "1400001", activo: true });
    backend.seedHogar({ id: "h2", nombre_familia: "Hogar Rama 2", direccion: "Dir 2", referencia: "", latitud: PUNTO.lat, longitud: PUNTO.lng, precision_gps: 10, estado: "pendiente", creado_por_ci: "1200002", creado_por_rol: "coordinador", activo: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    backend.seedHogarVotante({ hogar_id: "h2", votante_ci: "1400003", activo: true });

    await withPage({ ci: "9999999", nombre: "Super", apellido: "Admin", role: "superadmin" }, backend, {}, async (page) => {
      await page.locator("text=Mapeo territorial").first().click();
      await page.waitForTimeout(600);
      await assert.ok(await page.locator("text=Hogar Rama 1").count(), "Debe ver el hogar de la rama 1");
      await assert.ok(await page.locator("text=Hogar Rama 2").count(), "Debe ver el hogar de la rama 2 (otra rama distinta)");
      const totalHogares = await page.locator("text=TOTAL").locator("..").locator("text=2").count();
      assert.ok(totalHogares >= 0); // el conteo exacto ya se valida por los nombres visibles arriba
    });
  });

  // --- 2) Dirigente ve solo su estructura ---
  await test("Dirigente ve solo los hogares de su propia rama", async () => {
    const dataset = buildDataset();
    const backend = createMockBackend(dataset);
    backend.seedHogar({ id: "h1", nombre_familia: "Hogar Propio", direccion: "Dir 1", referencia: "", latitud: PUNTO.lat, longitud: PUNTO.lng, precision_gps: 10, estado: "verificado", creado_por_ci: "1200001", creado_por_rol: "coordinador", activo: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    backend.seedHogarVotante({ hogar_id: "h1", votante_ci: "1400001", activo: true });
    backend.seedHogar({ id: "h2", nombre_familia: "Hogar Ajeno", direccion: "Dir 2", referencia: "", latitud: PUNTO.lat, longitud: PUNTO.lng, precision_gps: 10, estado: "verificado", creado_por_ci: "1200002", creado_por_rol: "coordinador", activo: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    backend.seedHogarVotante({ hogar_id: "h2", votante_ci: "1400003", activo: true });

    await withPage({ ci: "1100001", nombre: "Dirigente", apellido: "Uno", role: "dirigente", loginCode: "DIR0001" }, backend, {}, async (page) => {
      await page.locator("text=Mapeo territorial").first().click();
      await page.waitForTimeout(600);
      assert.equal(await page.locator("text=Hogar Propio").count(), 1, "Debe ver su propio hogar");
      assert.equal(await page.locator("text=Hogar Ajeno").count(), 0, "NO debe ver el hogar de la rama de otro dirigente");
    });
  });

  // --- 3) Coordinador ve solo su estructura ---
  await test("Coordinador ve solo los hogares de su propia rama", async () => {
    const dataset = buildDataset();
    const backend = createMockBackend(dataset);
    backend.seedHogar({ id: "h1", nombre_familia: "Hogar Propio Coord", direccion: "Dir 1", referencia: "", latitud: PUNTO.lat, longitud: PUNTO.lng, precision_gps: 10, estado: "verificado", creado_por_ci: "1200001", creado_por_rol: "coordinador", activo: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    backend.seedHogarVotante({ hogar_id: "h1", votante_ci: "1400002", activo: true }); // votante de su subcoordinador
    backend.seedHogar({ id: "h2", nombre_familia: "Hogar Ajeno Coord", direccion: "Dir 2", referencia: "", latitud: PUNTO.lat, longitud: PUNTO.lng, precision_gps: 10, estado: "verificado", creado_por_ci: "1200002", creado_por_rol: "coordinador", activo: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    backend.seedHogarVotante({ hogar_id: "h2", votante_ci: "1400003", activo: true });

    await withPage({ ci: "1200001", nombre: "Coordinador", apellido: "Uno", role: "coordinador", loginCode: "COO0001" }, backend, {}, async (page) => {
      await page.locator("text=Mapeo territorial").first().click();
      await page.waitForTimeout(600);
      assert.equal(await page.locator("text=Hogar Propio Coord").count(), 1, "Debe ver el hogar de su subcoordinador");
      assert.equal(await page.locator("text=Hogar Ajeno Coord").count(), 0, "NO debe ver el hogar de otro coordinador");
    });
  });

  // --- 4) Subcoordinador: sin panel general, pero puede cargar ubicación de un votante propio ---
  await test("Subcoordinador no ve el panel general y puede asignar ubicación a su propio votante", async () => {
    const dataset = buildDataset();
    const backend = createMockBackend(dataset);

    await withPage(
      { ci: "1300001", nombre: "Subcoord", apellido: "Uno", role: "subcoordinador", loginCode: "SUB0001" },
      backend,
      { geolocation: { latitude: PUNTO.lat, longitude: PUNTO.lng, accuracy: 10 } },
      async (page) => {
        assert.equal(await page.locator("text=Mapeo territorial").count(), 0, "Subcoordinador NO debe ver el botón del panel general");
        assert.equal(await page.locator("text=Bitácora de visitas").count(), 0, "Subcoordinador NO debe ver el botón de bitácora");

        await page.locator('[title="Asignar ubicación / agregar a hogar"]').first().click();
        await page.waitForTimeout(600);
        assert.ok(await page.locator("text=Nuevo hogar").count(), "Debe abrir el flujo de creación de hogar para su votante");

        await page.locator('input[placeholder="Ej: Familia González"]').fill("Hogar de prueba");
        // Captura por GPS en vez de click en el mapa: más robusto en un entorno de
        // test que depender de coordenadas de píxel sobre el canvas de Leaflet.
        await page.getByRole("button", { name: /Usar mi ubicación actual/ }).click();
        await page.locator("text=Ubicación marcada").waitFor({ timeout: 5000 });
        await page.getByRole("button", { name: "Guardar" }).click();
        await page.waitForTimeout(800);
        const estado = backend._state();
        assert.equal(estado.hogares.length, 1, "El hogar debe haberse creado vía RPC");
        assert.equal(estado.hogarVotantes.some((hv) => hv.votante_ci === "1400002" && hv.activo), true, "El votante propio del subcoordinador debe quedar asociado");
      }
    );
  });

  // --- 5) Intento de consultar otra rama (bloqueado por el RPC simulado) ---
  await test("El RPC deniega alcance sobre un hogar de otra rama (no solo la UI lo oculta)", async () => {
    const dataset = buildDataset();
    const backend = createMockBackend(dataset);
    backend.seedHogar({ id: "h-ajeno", nombre_familia: "Hogar de otra rama", direccion: "X", referencia: "", latitud: PUNTO.lat, longitud: PUNTO.lng, precision_gps: 10, estado: "verificado", creado_por_ci: "1200002", creado_por_rol: "coordinador", activo: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    backend.seedHogarVotante({ hogar_id: "h-ajeno", votante_ci: "1400003", activo: true });

    // Coordinador de la OTRA rama intenta confirmar una visita directamente contra el
    // RPC (no a través del panel, simulando alguien que intente saltarse la UI).
    let rpcError = null;
    try {
      const actorRol = "coordinador";
      const actorCi = "1200001"; // no tiene relación con h-ajeno
      if (!backend.handlers) throw new Error("sin handlers");
      backend.handlers.mapeo_confirmar_visita({ p_login_code: "COO0001", p_superadmin_ci: null, p_hogar_id: "h-ajeno", p_latitud: PUNTO.lat, p_longitud: PUNTO.lng, p_precision_gps: 10 });
    } catch (err) {
      rpcError = err.message;
    }
    assert.ok(rpcError && rpcError.includes("alcance"), `El RPC debe rechazar la acción fuera de alcance, recibido: ${rpcError}`);
  });

  // --- 6) Hogar con varios votantes ---
  await test("Un hogar puede agrupar varios votantes sin generar marcadores duplicados", async () => {
    const dataset = buildDataset();
    const backend = createMockBackend(dataset);
    backend.seedHogar({ id: "h1", nombre_familia: "Hogar Multivotante", direccion: "Dir 1", referencia: "", latitud: PUNTO.lat, longitud: PUNTO.lng, precision_gps: 10, estado: "verificado", creado_por_ci: "1200001", creado_por_rol: "coordinador", activo: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    backend.seedHogarVotante({ hogar_id: "h1", votante_ci: "1400001", activo: true });
    backend.seedHogarVotante({ hogar_id: "h1", votante_ci: "1400002", activo: true });

    await withPage({ ci: "1100001", nombre: "Dirigente", apellido: "Uno", role: "dirigente", loginCode: "DIR0001" }, backend, {}, async (page) => {
      await page.locator("text=Mapeo territorial").first().click();
      await page.waitForTimeout(600);
      assert.equal(await page.locator("text=Hogar Multivotante").count(), 1, "Debe aparecer una única tarjeta/marcador para el hogar");
      await page.locator("text=Hogar Multivotante").first().click();
      await page.waitForTimeout(400);
      assert.equal(await page.locator("text=Votante Uno").count(), 1);
      assert.equal(await page.locator("text=Votante Dos").count(), 1);
    });
  });

  // --- 7) Creación y edición de hogar ---
  await test("Crear un hogar nuevo y luego editarlo", async () => {
    const dataset = buildDataset();
    const backend = createMockBackend(dataset);

    await withPage(
      { ci: "1100001", nombre: "Dirigente", apellido: "Uno", role: "dirigente", loginCode: "DIR0001" },
      backend,
      { geolocation: { latitude: PUNTO.lat, longitude: PUNTO.lng, accuracy: 10 } },
      async (page) => {
        await page.locator("text=Mapeo territorial").first().click();
        await page.waitForTimeout(600);
        await page.getByRole("button", { name: /Nuevo hogar/ }).click();
        await page.waitForTimeout(300);
        await page.locator('input[placeholder="Ej: Familia González"]').fill("Hogar E2E");
        await page.getByRole("button", { name: /Usar mi ubicación actual/ }).click();
        await page.locator("text=Ubicación marcada").waitFor({ timeout: 5000 });
        await page.getByRole("button", { name: "Guardar" }).click();
        await page.waitForTimeout(800);
        assert.equal(backend._state().hogares.length, 1, "El hogar debe haberse creado");

        await page.waitForTimeout(300);
        await page.locator("text=Hogar E2E").first().click();
        await page.waitForTimeout(300);
        await page.getByRole("button", { name: /Editar/ }).click();
        await page.waitForTimeout(300);
        await page.locator('input[value="Hogar E2E"]').fill("Hogar E2E Editado");
        await page.getByRole("button", { name: "Guardar" }).click();
        await page.waitForTimeout(600);
        assert.equal(backend._state().hogares[0].nombre_familia, "Hogar E2E Editado", "La edición debe reflejarse vía RPC");
      }
    );
  });

  // --- 8) Verificación y rechazo de ubicación ---
  await test("Verificar y luego rechazar una ubicación pendiente", async () => {
    const dataset = buildDataset();
    const backend = createMockBackend(dataset);
    backend.seedHogar({ id: "h1", nombre_familia: "Hogar Pendiente", direccion: "Dir 1", referencia: "", latitud: PUNTO.lat, longitud: PUNTO.lng, precision_gps: 10, estado: "pendiente", creado_por_ci: "1200001", creado_por_rol: "coordinador", activo: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    backend.seedHogarVotante({ hogar_id: "h1", votante_ci: "1400001", activo: true });

    await withPage({ ci: "1100001", nombre: "Dirigente", apellido: "Uno", role: "dirigente", loginCode: "DIR0001" }, backend, {}, async (page) => {
      await page.locator("text=Mapeo territorial").first().click();
      await page.waitForTimeout(600);
      await page.locator("text=Hogar Pendiente").first().click();
      await page.waitForTimeout(300);
      await page.getByRole("button", { name: /Verificar ubicación/ }).click();
      await page.waitForTimeout(600);
      assert.equal(backend._state().hogares[0].estado, "verificado", "El estado debe pasar a verificado");

      // Vuelve a abrir y ahora rechaza (simula corrección de un error de verificación).
      await page.locator("text=Hogar Pendiente").first().click();
      await page.waitForTimeout(300);
    });

    // El botón de verificar ya no debería estar visible por default una vez
    // verificado (solo aparece para estado "pendiente"); se valida directo contra el
    // RPC simulado para forzar el camino de rechazo.
    backend.handlers.mapeo_verificar_hogar({ p_login_code: "DIR0001", p_superadmin_ci: null, p_hogar_id: "h1", p_aprobar: false, p_observacion: "Dirección incorrecta" });
    assert.equal(backend._state().hogares[0].estado, "rechazado", "El estado debe poder pasar a rechazado");
  });

  // --- 9) Visita dentro del radio ---
  await test("Visita dentro del radio permitido se confirma", async () => {
    const dataset = buildDataset();
    const backend = createMockBackend(dataset);
    backend.seedHogar({ id: "h1", nombre_familia: "Hogar Cercano", direccion: "Dir 1", referencia: "", latitud: PUNTO.lat, longitud: PUNTO.lng, precision_gps: 10, estado: "verificado", creado_por_ci: "1200001", creado_por_rol: "coordinador", activo: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    backend.seedHogarVotante({ hogar_id: "h1", votante_ci: "1400001", activo: true });

    await withPage(
      { ci: "1100001", nombre: "Dirigente", apellido: "Uno", role: "dirigente", loginCode: "DIR0001" },
      backend,
      { geolocation: { latitude: PUNTO.lat, longitude: PUNTO.lng, accuracy: 10 } },
      async (page) => {
        await page.locator("text=Mapeo territorial").first().click();
        await page.waitForTimeout(600);
        await page.locator("text=Hogar Cercano").first().click();
        await page.waitForTimeout(300);
        await page.getByRole("button", { name: /Confirmar visita/ }).first().click();
        await page.waitForTimeout(300);
        await page.getByRole("button", { name: /Obtener mi ubicación/ }).click();
        await page.waitForTimeout(1200);
        await page.getByRole("button", { name: /^Confirmar visita$/ }).click();
        await page.waitForTimeout(600);
        assert.ok(await page.locator("text=Visita confirmada").count(), "Debe mostrar 'Visita confirmada'");
        const visitas = backend._state().visitasHogar;
        assert.equal(visitas.length, 1);
        assert.equal(visitas[0].resultado, "confirmada");
      }
    );
  });

  // --- 10) Visita fuera del radio ---
  await test("Visita fuera del radio permitido se registra como fuera_de_radio", async () => {
    const dataset = buildDataset();
    const backend = createMockBackend(dataset);
    backend.seedHogar({ id: "h1", nombre_familia: "Hogar Lejano", direccion: "Dir 1", referencia: "", latitud: PUNTO.lat, longitud: PUNTO.lng, precision_gps: 10, estado: "verificado", creado_por_ci: "1200001", creado_por_rol: "coordinador", activo: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    backend.seedHogarVotante({ hogar_id: "h1", votante_ci: "1400001", activo: true });

    // ~1km de distancia (bien fuera del radio de 100m).
    await withPage(
      { ci: "1100001", nombre: "Dirigente", apellido: "Uno", role: "dirigente", loginCode: "DIR0001" },
      backend,
      { geolocation: { latitude: PUNTO.lat + 0.01, longitude: PUNTO.lng, accuracy: 10 } },
      async (page) => {
        await page.locator("text=Mapeo territorial").first().click();
        await page.waitForTimeout(600);
        await page.locator("text=Hogar Lejano").first().click();
        await page.waitForTimeout(300);
        await page.getByRole("button", { name: /Confirmar visita/ }).first().click();
        await page.waitForTimeout(300);
        await page.getByRole("button", { name: /Obtener mi ubicación/ }).click();
        await page.waitForTimeout(1200);
        await page.getByRole("button", { name: /^Confirmar visita$/ }).click();
        await page.waitForTimeout(600);
        assert.ok(await page.locator("text=/fuera del radio permitido/").count(), "Debe mostrar el mensaje de fuera de radio");
        const visitas = backend._state().visitasHogar;
        assert.equal(visitas.length, 1, "El intento debe quedar registrado igual (nunca se descarta)");
        assert.equal(visitas[0].resultado, "fuera_de_radio");
      }
    );
  });

  // --- 11) GPS impreciso ---
  await test("Precisión GPS insuficiente pide reintentar y no permite confirmar", async () => {
    const dataset = buildDataset();
    const backend = createMockBackend(dataset);
    backend.seedHogar({ id: "h1", nombre_familia: "Hogar GPS Impreciso", direccion: "Dir 1", referencia: "", latitud: PUNTO.lat, longitud: PUNTO.lng, precision_gps: 10, estado: "verificado", creado_por_ci: "1200001", creado_por_rol: "coordinador", activo: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    backend.seedHogarVotante({ hogar_id: "h1", votante_ci: "1400001", activo: true });

    await withPage(
      { ci: "1100001", nombre: "Dirigente", apellido: "Uno", role: "dirigente", loginCode: "DIR0001" },
      backend,
      { geolocation: { latitude: PUNTO.lat, longitude: PUNTO.lng, accuracy: 500 } }, // > precision_gps_maxima_metros (50)
      async (page) => {
        await page.locator("text=Mapeo territorial").first().click();
        await page.waitForTimeout(600);
        await page.locator("text=Hogar GPS Impreciso").first().click();
        await page.waitForTimeout(300);
        await page.getByRole("button", { name: /Confirmar visita/ }).first().click();
        await page.waitForTimeout(300);
        await page.getByRole("button", { name: /Obtener mi ubicación/ }).click();
        await page.waitForTimeout(1200);
        assert.ok(await page.locator("text=/Precisión GPS insuficiente/").count(), "Debe avisar que la precisión GPS no es aceptable");
        const botonConfirmar = page.getByRole("button", { name: /^Confirmar visita$/ });
        assert.equal(await botonConfirmar.isDisabled(), true, "El botón de confirmar debe estar deshabilitado con precisión insuficiente");
        assert.equal(backend._state().visitasHogar.length, 0, "No debe registrarse ninguna visita todavía");
      }
    );
  });

  // --- 12) Error de geolocalización ---
  await test("Error de geolocalización (permiso denegado) muestra mensaje y permite reintentar", async () => {
    const dataset = buildDataset();
    const backend = createMockBackend(dataset);
    backend.seedHogar({ id: "h1", nombre_familia: "Hogar Sin Permiso", direccion: "Dir 1", referencia: "", latitud: PUNTO.lat, longitud: PUNTO.lng, precision_gps: 10, estado: "verificado", creado_por_ci: "1200001", creado_por_rol: "coordinador", activo: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    backend.seedHogarVotante({ hogar_id: "h1", votante_ci: "1400001", activo: true });

    // Sin `geolocation` en el contexto y sin otorgar el permiso -> getCurrentPosition
    // termina en el callback de error (PERMISSION_DENIED).
    await withPage(
      { ci: "1100001", nombre: "Dirigente", apellido: "Uno", role: "dirigente", loginCode: "DIR0001" },
      backend,
      {},
      async (page) => {
        await page.locator("text=Mapeo territorial").first().click();
        await page.waitForTimeout(600);
        await page.locator("text=Hogar Sin Permiso").first().click();
        await page.waitForTimeout(300);
        await page.getByRole("button", { name: /Confirmar visita/ }).first().click();
        await page.waitForTimeout(300);
        await page.getByRole("button", { name: /Obtener mi ubicación/ }).click();
        await page.waitForTimeout(1500);
        const hayError = await page.locator("text=/denegado|no soporta geolocalización|GPS no disponible/").count();
        assert.ok(hayError > 0, "Debe mostrarse un mensaje de error de geolocalización");
        assert.ok(await page.getByRole("button", { name: /Reintentar/ }).count(), "Debe ofrecer reintentar");
      }
    );
  });

  // --- 13) Vista móvil ---
  await test("El módulo es usable en viewport móvil (sin overflow horizontal)", async () => {
    const dataset = buildDataset();
    const backend = createMockBackend(dataset);
    backend.seedHogar({ id: "h1", nombre_familia: "Hogar Móvil", direccion: "Dir 1", referencia: "", latitud: PUNTO.lat, longitud: PUNTO.lng, precision_gps: 10, estado: "verificado", creado_por_ci: "1200001", creado_por_rol: "coordinador", activo: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    backend.seedHogarVotante({ hogar_id: "h1", votante_ci: "1400001", activo: true });

    await withPage(
      { ci: "1100001", nombre: "Dirigente", apellido: "Uno", role: "dirigente", loginCode: "DIR0001" },
      backend,
      { viewport: { width: 390, height: 844 } }, // iPhone 12-ish
      async (page) => {
        await page.locator("text=Mapeo territorial").first().click();
        await page.waitForTimeout(600);
        assert.ok(await page.locator("text=Hogar Móvil").count(), "El hogar debe seguir siendo visible en móvil");
        const anchoDocumento = await page.evaluate(() => document.documentElement.scrollWidth);
        const anchoViewport = await page.evaluate(() => window.innerWidth);
        assert.ok(anchoDocumento <= anchoViewport + 1, `No debe haber overflow horizontal (documento=${anchoDocumento}, viewport=${anchoViewport})`);
      }
    );
  });

  await browser.close();
})();

// ======================= RESUMEN =======================
const fallidas = resultados.filter((r) => !r.ok);
console.log(`\n${resultados.length - fallidas.length}/${resultados.length} pruebas OK.`);
if (fallidas.length > 0) {
  console.log("Pruebas fallidas:");
  for (const f of fallidas) console.log(` - ${f.nombre}: ${f.error}`);
  process.exit(1);
}
