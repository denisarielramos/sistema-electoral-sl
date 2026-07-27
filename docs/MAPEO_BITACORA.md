# Mapeo territorial de votantes y bitácora de visitas

Este documento describe el módulo agregado en la rama `feature/mapeo-bitacora-visitas`:
mapeo de hogares en el territorio (agrupando varios votantes por domicilio real) y una
bitácora verificable de visitas territoriales, con validación de distancia del lado
del servidor.

**Estado: el SQL descrito acá NO fue ejecutado en producción ni en ningún entorno.**
Es responsabilidad del propietario revisarlo y aplicarlo manualmente (ver
[Pasos manuales en Supabase](#pasos-manuales-en-supabase)).

## Índice

- [Arquitectura](#arquitectura)
- [Modelo de datos](#modelo-de-datos)
- [Seguridad y permisos](#seguridad-y-permisos)
- [Nota de seguridad crítica: el sistema no usa Supabase Auth](#nota-de-seguridad-crítica-el-sistema-no-usa-supabase-auth)
- [RLS (Row Level Security)](#rls-row-level-security)
- [RPC (funciones `mapeo_*`)](#rpc-funciones-mapeo_)
- [Configuración del módulo](#configuración-del-módulo)
- [Flujo completo](#flujo-completo)
- [Migraciones](#migraciones)
- [Pasos manuales en Supabase](#pasos-manuales-en-supabase)
- [Riesgos de seguridad conocidos](#riesgos-de-seguridad-conocidos)
- [Cómo probar cada rol](#cómo-probar-cada-rol)
- [Fuera de alcance de este PR](#fuera-de-alcance-de-este-pr)

## Arquitectura

```
src/
  components/mapeo/
    MapeoTerritorial.jsx      — módulo "Mapeo territorial" (mapa + stats + filtros)
    BitacoraVisitas.jsx       — módulo "Bitácora de visitas" (listado + export Excel)
    AccesoRapidoHogar.jsx     — punto de entrada desde la tarjeta de un votante
    ModalHogar.jsx            — crear/editar hogar, asociar/desasociar votantes
    ModalConfirmarVisita.jsx  — flujo de confirmación de visita (GPS)
    HogarDetallePanel.jsx     — panel de detalle de un hogar seleccionado
    LeafletMapaHogares.jsx    — mapa (Leaflet + OpenStreetMap), un marcador por hogar
    LeafletSeleccionarUbicacion.jsx — mapa de un solo punto para corregir ubicación
    MapeoStatsCards.jsx       — tarjetas estadísticas
    EstadoMapaBadge.jsx       — badge de estado visual reutilizado en mapa/bitácora
  hooks/
    useGeolocation.js         — navigator.geolocation con estados de carga/error
    useHogares.js             — datos + mutaciones de hogares (vía RPC)
    useVisitas.js             — datos + registro de visitas (vía RPC)
    useMapeoConfiguracion.js  — radio permitido / precisión GPS máxima (nunca hardcodeados)
  services/
    mapeoService.js           — única capa que llama a las funciones RPC `mapeo_*`
    excelService.js           — se le agregó `generarExcelVisitas` (reutiliza el
                                 mismo servicio/mecanismo que ya usaba el dashboard)
  utils/
    geoHelpers.js             — Haversine, validaciones, estado visual del hogar
    mapeoHelpers.js           — búsqueda/filtrado/estadísticas, alcance por rol (UI)
supabase/migrations/
  20260727100000_mapeo_territorial_bitacora.sql — tablas + RLS + funciones RPC
docs/MAPEO_BITACORA.md        — este documento
```

Integración con el dashboard existente (mínima, ver
[Fuera de alcance](#fuera-de-alcance-de-este-pr) para lo que NO se tocó):

- `Dashboard.jsx` agrega dos botones ("Mapeo territorial", "Bitácora de visitas") en
  las vistas de superadmin, dirigente y coordinador — subcoordinador no los ve.
- `PersonCard` (la tarjeta unificada de persona del PR #17) agrega un botón
  **"Asignar ubicación / agregar a hogar"** solo en tarjetas de tipo `votante`, para
  los 4 roles. Abre `AccesoRapidoHogar`, que resuelve si el votante ya tiene un hogar
  y abre el flujo de creación o edición correspondiente.
- `App.jsx` agrega el campo `loginCode` al objeto `currentUser` que ya se guardaba en
  sesión para dirigente/coordinador/subcoordinador (no cambia el flujo de login en
  absoluto, solo conserva el código ya tipeado) — es lo que permite que las funciones
  RPC verifiquen identidad del lado del servidor en vez de confiar en el `ci`/`rol`
  que manda React. Ver la nota de seguridad más abajo.

Ninguno de estos cambios modifica la lógica de autenticación, jerarquías, búsqueda,
confirmación de votos, PDF, Excel de estructura, WhatsApp o IndexedDB existentes.

## Modelo de datos

Se auditó el esquema existente antes de diseñar el modelo nuevo:

- Las tablas `padron`, `dirigentes`, `coordinadores`, `subcoordinadores`, `votantes` ya
  existen en la base de Supabase, provisionadas fuera de este repositorio (no hay
  migraciones previas que las creen — ver `supabase/migrations/README.md`).
- `dirigentes.es_externo` indica dirigentes que no están en el padrón.
- `votantes.dirigente_ci` / `coordinador_ci` / `asignado_por` / `asignado_por_rol` ya
  codifican la jerarquía (mismos campos que usa `src/utils/estructuraHelpers.js`).
- No existía ninguna tabla, columna ni convención previa para domicilios/hogares o
  visitas territoriales — se creó desde cero, sin duplicar nada existente.

Tablas nuevas (`supabase/migrations/20260727100000_mapeo_territorial_bitacora.sql`):

### `hogares`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `uuid` PK | `gen_random_uuid()` |
| `nombre_familia` | `text` | referencia familiar |
| `direccion` | `text` | |
| `referencia` | `text` | referencia adicional (portón verde, etc.) |
| `latitud`, `longitud` | `double precision` | validadas por rango (-90..90 / -180..180) |
| `precision_gps` | `double precision` | metros, del último punto cargado |
| `estado` | `text` | `pendiente` \| `verificado` \| `rechazado` |
| `creado_por_ci`, `creado_por_rol` | `text` | sin FK — ver nota abajo |
| `verificado_por_ci`, `verificado_por_rol` | `text` | solo `superadmin`/`dirigente` |
| `fecha_verificacion` | `timestamptz` | |
| `activo` | `boolean` | soft-delete, igual convención que el resto del esquema |
| `created_at`, `updated_at` | `timestamptz` | `updated_at` con trigger automático |

### `hogar_votantes` (asociación N:M)

| Columna | Tipo | Notas |
|---|---|---|
| `hogar_id` | `uuid` FK → `hogares(id)` | |
| `votante_ci` | `text` FK → `votantes(ci)` | sí tiene FK: un hogar agrupa votantes reales |
| `activo` | `boolean` | desasociar = `activo=false`, nunca se borra la fila |

Restricción clave: **un votante no puede pertenecer a más de un hogar activo a la
vez** — se impone con un índice único parcial:
`CREATE UNIQUE INDEX ... ON hogar_votantes(votante_ci) WHERE activo`.

### `visitas_hogar` (bitácora, **append-only**)

| Columna | Tipo | Notas |
|---|---|---|
| `hogar_id` | `uuid` FK → `hogares(id)` | |
| `visitante_ci`, `visitante_rol` | `text` | resuelto del lado del servidor, no enviado por el cliente |
| `latitud`, `longitud` | `double precision` NOT NULL | del visitante, capturadas por GPS |
| `precision_gps` | `double precision` | |
| `distancia_metros` | `double precision` | calculada por el servidor (Haversine) |
| `radio_permitido_usado` | `double precision` | copia del radio vigente al momento del intento |
| `resultado` | `text` | `confirmada` \| `fuera_de_radio` \| `pendiente` \| `cancelada` \| `error_gps` |
| `observacion` | `text` | |
| `fecha_hora` | `timestamptz` | `now()` del servidor — nunca la hora del navegador |
| `creado_por_ci`, `creado_por_rol` | `text` | auditoría |

Un trigger (`trg_visitas_hogar_bloquear_edicion`) bloquea `UPDATE`/`DELETE` sobre esta
tabla incluso para el dueño de la tabla: **cada intento genera una fila nueva, nunca
se sobrescribe una visita anterior**, ni siquiera si quedó fuera de radio.

### `configuracion_mapeo` (fila única)

`radio_permitido_metros` (default 100) y `precision_gps_maxima_metros` (default 50).
El frontend nunca hardcodea estos valores — siempre los lee vía
`mapeo_configuracion_actual()` (`src/hooks/useMapeoConfiguracion.js`).

### Por qué `creado_por_ci`/`visitante_ci`/etc. no tienen FK

Estas columnas identifican a un **actor** (quien creó/verificó/visitó), que puede ser
`superadmin` (que no existe en ninguna tabla — está hardcodeado en `src/App.jsx`),
`dirigente`, `coordinador` o `subcoordinador`. No hay una única tabla a la que
apuntar, y forzar una FK a `padron` sería incorrecto (un dirigente externo no está en
`padron`) — el mismo problema que ya existía y se corrigió para `votantes.asignado_por`
en `supabase/migrations/20260727000000_fix_votante_asignador_validation.sql`. En vez
de eso, `creado_por_rol`/`visitante_rol`/etc. tienen un `CHECK` de los 4 roles válidos,
y la validación de que la CI efectivamente corresponda a alguien de ese rol la hacen
las funciones RPC (`mapeo_resolver_actor`), no una constraint de tabla.

## Seguridad y permisos

| Rol | Ver hogares/visitas | Crear/corregir ubicación | Verificar/rechazar | Confirmar visita |
|---|---|---|---|---|
| Superadmin | Todos | Sí | Sí | Sí |
| Dirigente | Solo su rama | Sí (su rama) | Sí (su rama) | Sí |
| Coordinador | Solo su rama | Sí (su rama) | **No** | Sí |
| Subcoordinador | Solo sus propios votantes (sin panel general) | Sí (sus votantes) | No | Sí (sus votantes) |
| Votante | — | — | — | — (no es usuario activo) |

"Su rama" usa exactamente la misma definición que ya usa el resto del dashboard
(`getTodosVotantesDirigente`, `getTodosVotantesCoord`, `getVotantesDeSubcoord` en
`src/utils/estructuraHelpers.js`), replicada en SQL dentro de
`mapeo_votante_en_alcance()` para que el servidor pueda verificarla sin depender del
cliente.

El panel general de **Mapeo territorial** y **Bitácora de visitas** no se muestra a
subcoordinador (`Dashboard.jsx` condiciona los botones por rol) — solo tiene acceso al
flujo de "Asignar ubicación" desde la tarjeta de sus propios votantes
(`AccesoRapidoHogar`), que sigue pasando por las mismas funciones RPC con el mismo
chequeo de alcance.

## Nota de seguridad crítica: el sistema no usa Supabase Auth

Esto **no es nuevo de este PR** — es el modelo de autenticación actual de todo el
sistema, auditado antes de diseñar este módulo:

- **Superadmin**: lista hardcodeada en `src/App.jsx` (`SUPERADMINS`, con
  usuario/contraseña en el código fuente del frontend). No existe en la base de datos.
- **Dirigente/coordinador/subcoordinador**: entran con un `login_code` de texto plano
  que se compara con una consulta directa desde el navegador (`supabase.from(...).eq
  ("login_code", code)`), usando la misma clave `anon` para todos. No se crea ninguna
  sesión de Supabase Auth — no hay JWT, no hay `auth.uid()` utilizable en RLS.

**Consecuencia práctica**: no existe manera de que Postgres/PostgREST sepa
criptográficamente "quién" está haciendo una request — cualquier `ci`/`rol` que el
cliente mande se puede falsificar tan fácilmente como editar el `localStorage`.

**Lo que este módulo hace al respecto** (sin inventar una protección falsa, sin tocar
el flujo de login existente):

1. Para dirigente/coordinador/subcoordinador, cada función RPC recibe el
   `login_code` de la sesión (persistido en `currentUser.loginCode`, agregado en
   `App.jsx` — antes se descartaba después del login) y **resuelve la identidad del
   lado del servidor** re-consultando `dirigentes`/`coordinadores`/`subcoordinadores`
   por ese código (`mapeo_identidad()`). Esto es una mejora real: significa que un
   subcoordinador no puede pedirle al RPC que actúe como coordinador sin conocer el
   `login_code` real de un coordinador — el mismo nivel de "secreto" que ya protege el
   login de toda la app hoy.
2. Para **superadmin no hay forma de hacer esto**: sus credenciales no están en la
   base de datos. Las funciones RPC aceptan un parámetro `p_superadmin_ci` que se
   confía sin verificación criptográfica — exactamente al mismo nivel que el resto de
   las acciones superadmin-only que ya existen en la app hoy (alta de dirigentes,
   generación de códigos de acceso, etc., ninguna de las cuales está protegida por RLS
   tampoco). **No es una regresión de este PR**, es el mismo modelo de confianza que
   ya tiene todo el sistema, documentado explícitamente en vez de dejarlo implícito.
3. Todas las tablas nuevas tienen RLS habilitado **sin políticas** para
   `anon`/`authenticated` — el acceso directo por PostgREST queda bloqueado sin
   excepción; todo pasa por las funciones RPC (`SECURITY DEFINER`), que aplican el
   alcance en SQL. Ver [RLS](#rls-row-level-security).

**Mejora recomendada a futuro (fuera de alcance de este PR, requiere decisión del
propietario):** migrar el login a Supabase Auth real (o un puente de JWT emitido por
una Edge Function tras validar el `login_code`), de forma que `auth.uid()` esté
disponible y las políticas RLS puedan depender de una identidad verificada
criptográficamente en cada request, incluida la de superadmin. Mientras tanto, el
esquema de este módulo (RPC `SECURITY DEFINER` + resolución de identidad por
`login_code` + tablas bloqueadas por RLS) es la opción más segura compatible con el
sistema de login actual, sin modificarlo.

## RLS (Row Level Security)

```sql
ALTER TABLE hogares ENABLE ROW LEVEL SECURITY;
ALTER TABLE hogar_votantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE visitas_hogar ENABLE ROW LEVEL SECURITY;
ALTER TABLE configuracion_mapeo ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON hogares FROM anon, authenticated;
REVOKE ALL ON hogar_votantes FROM anon, authenticated;
REVOKE ALL ON visitas_hogar FROM anon, authenticated;
REVOKE ALL ON configuracion_mapeo FROM anon, authenticated;
```

Deliberadamente **no se agregan políticas** para `anon`/`authenticated`: con RLS
habilitado y sin policies, esos roles no pueden leer ni escribir las tablas
directamente por PostgREST. Las funciones `mapeo_*` son `SECURITY DEFINER` (corren
como el dueño de la función, que no está sujeto a RLS) y aplican el alcance
jerárquico ellas mismas en SQL (`mapeo_hogar_en_alcance`, `mapeo_votante_en_alcance`).

Esto es intencional: como no hay `auth.uid()` disponible (ver nota de seguridad
arriba), una política RLS tradicional (`USING (auth.uid() = ...)`) no se puede
escribir de forma significativa. La alternativa — RPC-mediado con identidad resuelta
por `login_code` — es la que sí se puede implementar de forma honesta hoy.

## RPC (funciones `mapeo_*`)

Todas en `supabase/migrations/20260727100000_mapeo_territorial_bitacora.sql`,
`SECURITY DEFINER`, otorgadas a `anon` y `authenticated` (la app usa siempre la clave
`anon`, sin sesión de Supabase Auth):

| Función | Uso |
|---|---|
| `mapeo_configuracion_actual()` | Lee radio permitido / precisión GPS máxima |
| `mapeo_actualizar_configuracion(...)` | Solo superadmin |
| `mapeo_listar_hogares(...)` | Hogares + votantes embebidos + última visita, ya filtrados por alcance |
| `mapeo_crear_hogar(...)` | Crea un hogar (`estado='pendiente'`) |
| `mapeo_actualizar_hogar(...)` | Corrige datos/ubicación; si cambia lat/lng, vuelve a `pendiente` |
| `mapeo_verificar_hogar(...)` | Solo superadmin/dirigente; aprueba o rechaza |
| `mapeo_asociar_votante(...)` | Valida alcance de hogar y de votante; rechaza si el votante ya está en otro hogar activo |
| `mapeo_desasociar_votante(...)` | `activo=false`, nunca borra la fila ni el hogar |
| `mapeo_confirmar_visita(...)` | Calcula distancia y decide el resultado; siempre inserta (nunca actualiza) |
| `mapeo_listar_visitas(...)` | Bitácora filtrada por alcance, con hogar/votantes embebidos |

Funciones auxiliares internas (no otorgadas a `anon`/`authenticated`, solo las usan
las de arriba): `mapeo_identidad`, `mapeo_resolver_actor`, `mapeo_distancia_metros`,
`mapeo_votante_en_alcance`, `mapeo_hogar_en_alcance`.

No se usó una Edge Function porque las funciones SQL `SECURITY DEFINER` ya cubren el
mismo objetivo (lógica confiable del lado del servidor) sin agregar una pieza de
infraestructura adicional para desplegar/mantener. Si en el futuro se migra a
Supabase Auth real, estas funciones pueden simplificarse para usar `auth.uid()` en vez
de `p_login_code`/`p_superadmin_ci`, o migrarse a una Edge Function si se necesita
lógica que no es practicable en SQL (por ejemplo, llamar a un servicio externo).

## Configuración del módulo

`configuracion_mapeo` tiene una única fila (`id=1`, forzado con `CHECK (id = 1)`).
Valor inicial: `radio_permitido_metros = 100`, `precision_gps_maxima_metros = 50`. Se
puede cambiar en cualquier momento vía `mapeo_actualizar_configuracion` (solo
superadmin) — el frontend siempre relee este valor (`useMapeoConfiguracion`), nunca
hay un número de metros hardcodeado en un componente React.

## Flujo completo

### Cargar ubicación de un hogar

1. Desde la tarjeta de un votante (`PersonCard` → botón "Asignar ubicación") o desde
   el módulo de Mapeo territorial ("Nuevo hogar" / "Editar").
2. `ModalHogar` permite: nombre/referencia familiar, dirección, referencia adicional,
   capturar ubicación por GPS (`useGeolocation`) o marcarla/corregirla a mano en el
   mapa (`LeafletSeleccionarUbicacion`, click o arrastrar el marcador).
3. Si ya había una ubicación cargada, se pide confirmación explícita antes de
   reemplazarla (nunca se pisa en silencio) — el historial de visitas nunca se toca.
4. Se pueden asociar varios votantes al mismo hogar (buscador dentro del modal, dentro
   del alcance del actor) y desasociar sin borrar el hogar ni sus visitas.
5. El hogar queda en `pendiente` hasta que un dirigente o superadmin lo verifique.

### Confirmar una visita

1. "Confirmar visita" (desde el panel de detalle del hogar, desde `ModalHogar` o desde
   `AccesoRapidoHogar`) abre `ModalConfirmarVisita`.
2. Se solicita la ubicación actual con alta precisión (`enableHighAccuracy: true`) —
   muestra un estado de carga mientras se obtiene.
3. Si la precisión GPS reportada supera `precision_gps_maxima_metros`, se pide
   reintentar (no se puede confirmar todavía).
4. Con una posición aceptable, se calcula y muestra una distancia **preliminar**
   (`utils/geoHelpers.haversineDistanceMeters`) solo como referencia visual.
5. Al presionar "Confirmar visita", se llama a `mapeo_confirmar_visita`, que
   recalcula la distancia del lado del servidor contra la ubicación guardada del
   hogar y decide el resultado — el cliente **nunca** escribe manualmente
   coordenadas, distancia ni resultado.
6. Si está dentro del radio → `confirmada`; si no → `fuera_de_radio`; el intento se
   guarda en ambos casos (nunca se descarta uno fuera de radio). Si falta la
   ubicación del hogar o la precisión es mala → `error_gps`, también registrado.
7. La fecha/hora la pone `now()` del servidor, nunca `Date.now()` del navegador.
8. Cada confirmación es un `INSERT` nuevo — nunca se sobrescribe una visita anterior
   (bloqueado también a nivel de trigger, ver arriba).

## Migraciones

Ver `supabase/migrations/README.md` para la convención general de esta carpeta
(parches sobre un esquema base ya provisionado, no un esquema base en sí). Este
módulo agrega:

- `supabase/migrations/20260727100000_mapeo_territorial_bitacora.sql` — **pendiente
  de aplicar**. Idempotente (`CREATE TABLE IF NOT EXISTS`, `CREATE OR REPLACE
  FUNCTION`, `DROP TRIGGER IF EXISTS` + recrear), verifica con `to_regclass` que
  existan `votantes`/`dirigentes`/`coordinadores`/`subcoordinadores` antes de crear
  nada. No modifica ni borra columnas de esas tablas — solo agrega las 4 tablas
  nuevas propias del módulo, sus funciones y su RLS.

## Pasos manuales en Supabase

**Nadie ejecutó SQL contra producción en este PR.** Pasos para el propietario:

1. Revisar `supabase/migrations/20260727100000_mapeo_territorial_bitacora.sql` de
   punta a punta (recomendado: en un entorno de staging primero).
2. Ejecutarlo manualmente (SQL editor de Supabase o `supabase db push` si el proyecto
   ya usa la CLI de Supabase localmente — no está configurada en este repo).
3. Verificar que la fila única de `configuracion_mapeo` haya quedado creada
   (`SELECT * FROM configuracion_mapeo;` debe devolver una fila con `radio_permitido_
   metros = 100`).
4. No hace falta ninguna acción adicional en el panel de Supabase (no se requieren
   Storage buckets, Edge Functions ni cambios de Auth) — todo el módulo son tablas +
   funciones SQL.
5. Ajustar `radio_permitido_metros`/`precision_gps_maxima_metros` si 100 m / 50 m no
   son los valores deseados para el territorio real (puede hacerse después, vía
   `mapeo_actualizar_configuracion` como superadmin, sin volver a tocar SQL).

## Riesgos de seguridad conocidos

1. **Identidad de superadmin no verificable criptográficamente** (ver nota arriba) —
   preexistente en toda la app, documentado, no resuelto por este PR.
2. **`login_code` de dirigente/coordinador/subcoordinador ahora se persiste en
   `localStorage`** (antes se descartaba tras el login). Es necesario para que las
   funciones RPC puedan re-verificar identidad del lado del servidor. Sigue siendo el
   mismo tipo de dato que ya viajaba en texto plano en cada login; el `currentUser`
   completo ya se guardaba en `localStorage` sin cifrar. Si el dispositivo/navegador
   se ve comprometido (XSS, dispositivo compartido), el `login_code` queda expuesto
   igual que ya lo estaba `ci`/`nombre`/`rol` — no es una categoría de riesgo nueva,
   pero sí una superficie ligeramente mayor (antes el código no persistía tras el
   login). Mitigación recomendada a futuro: mover a Supabase Auth real (ver arriba),
   que elimina la necesidad de persistir el código en absoluto.
3. **Coordenadas son datos sensibles** (domicilio real de una familia). El acceso está
   limitado por alcance jerárquico vía RPC, pero cualquiera con el `login_code` de un
   rol puede ver todo lo que ese rol vería en la app real — mismo nivel de exposición
   que el resto de los datos de la app hoy.
4. **Sin límite de intentos (rate limiting)** en las funciones RPC — quedó fuera de
   alcance de este PR (la app tampoco lo tiene hoy en el login por código).

## Cómo probar cada rol

Con datos **sintéticos** (nunca reales) — ver los scripts en `scripts/`:

- `node scripts/smoke-test-mapeo-bitacora.mjs` — lógica pura (Haversine, radio,
  precisión GPS, coordenadas inválidas, duplicados, alcance jerárquico, estados de
  visita, estadísticas). No requiere servidor ni navegador.
- `scripts/playwright-mapeo-bitacora.mjs` — flujo end-to-end con Supabase simulado
  (Playwright intercepta las llamadas REST/RPC y responde con un backend en memoria
  que replica las mismas reglas del SQL real). Cubre superadmin/dirigente/coordinador/
  subcoordinador, alcance cruzado denegado, hogar multi-votante, crear/editar hogar,
  verificar/rechazar, visita dentro/fuera de radio, GPS impreciso, error de
  geolocalización y vista móvil. Requiere:
  1. `npx playwright install chromium` (una vez).
  2. Un `.env.local` con `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` (pueden ser
     valores ficticios — todo el tráfico se intercepta).
  3. `npm run dev -- --port 5183` en una terminal.
  4. `node scripts/playwright-mapeo-bitacora.mjs` en otra.

Para probar manualmente contra una base real (después de aplicar la migración):
iniciar sesión con el código de acceso de un dirigente/coordinador/subcoordinador de
prueba (o el usuario superadmin) y usar los botones "Mapeo territorial"/"Bitácora de
visitas" (superadmin/dirigente/coordinador) o "Asignar ubicación" en una tarjeta de
votante (los 4 roles).

## Fuera de alcance de este PR

Explícitamente no incluidos (a pedido): eliminación de personas, filtro de tercera
edad, administración de superadmins, módulo general de WhatsApp / WhatsApp Cloud API.
Tampoco se modificó autenticación, jerarquías, búsqueda interna, tarjetas de persona,
generación de PDF, exportación de Excel de estructura, confirmación de votos, edición
de teléfono ni IndexedDB — todo el código existente de esas áreas permanece intacto;
las únicas integraciones son los dos botones de navegación en `Dashboard.jsx`, el
nuevo botón "Asignar ubicación" en `PersonCard` (aditivo, no reemplaza ningún botón
existente ni cambia el orden de los actuales) y el campo `loginCode` agregado a
`currentUser` en `App.jsx`.
