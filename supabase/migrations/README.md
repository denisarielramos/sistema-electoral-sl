# supabase/migrations

Esta carpeta **no contiene un esquema base**. El proyecto de Supabase de este
sistema (tablas `padron`, `dirigentes`, `coordinadores`, `subcoordinadores`,
`votantes`, y sus columnas, índices, RLS, etc.) fue provisionado por fuera de
este repositorio — no existen aquí las migraciones que crearon esas tablas
por primera vez, y este repositorio no las agrega ahora.

Lo que sí vive acá son **parches puntuales** sobre una base que ya tiene ese
esquema. Cada archivo:

- Asume que las tablas base ya existen (y lo verifica al inicio con
  `to_regclass`, abortando con un mensaje claro si falta alguna).
- Es idempotente (`DROP ... IF EXISTS`, `CREATE OR REPLACE`, `CREATE TABLE IF
  NOT EXISTS`), pensado para poder reproducirse en otra base que ya tenga el
  mismo esquema base (un fork, un entorno de staging clonado desde
  producción), no para "levantar" el sistema desde cero.
- Nunca modifica ni borra columnas de las tablas base (`padron`, `dirigentes`,
  `coordinadores`, `subcoordinadores`, `votantes`). Algunos archivos sí
  agregan **tablas nuevas propias del módulo que documentan** — se indica
  explícitamente en cada entrada de abajo.

## Migraciones

### `20260727000000_fix_votante_asignador_validation.sql`

**Ya fue aplicada manualmente en producción.** Se agrega al repositorio para
trazabilidad y para poder reproducir el mismo cambio en otra base que ya
tenga el esquema (no se debe volver a ejecutar contra la producción actual).

No crea tablas. Corrige la validación de `votantes.asignado_por`: reemplaza
una foreign key que apuntaba incorrectamente a `padron(ci)` por un trigger
que valida `asignado_por` contra la tabla (`dirigentes` / `coordinadores` /
`subcoordinadores`) que corresponda según `asignado_por_rol`.

### `20260727100000_mapeo_territorial_bitacora.sql`

**Pendiente de aplicar — el propietario debe revisarla y ejecutarla
manualmente.** No fue aplicada en producción ni en ningún entorno todavía.

Agrega el módulo de mapeo territorial y bitácora de visitas: crea 4 tablas
nuevas (`hogares`, `hogar_votantes`, `visitas_hogar`, `configuracion_mapeo`),
funciones auxiliares (distancia Haversine, resolución de identidad por
`login_code`, chequeo de alcance jerárquico) y las funciones RPC
`mapeo_*` que son la única vía de acceso soportada desde el frontend. Habilita
RLS en las 4 tablas nuevas sin policies para `anon`/`authenticated` (todo el
acceso pasa por las funciones RPC, que son `SECURITY DEFINER`). Ver
`docs/MAPEO_BITACORA.md` para la arquitectura completa, el detalle de
permisos por rol y la nota de seguridad sobre el modelo de autenticación
actual (sin Supabase Auth).
