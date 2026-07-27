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
- Es idempotente (`DROP ... IF EXISTS`, `CREATE OR REPLACE`), pensado para
  poder reproducirse en otra base que ya tenga el mismo esquema (un fork, un
  entorno de staging clonado desde producción), no para "levantar" el
  sistema desde cero.
- No crea tablas nuevas ni altera columnas — solo objetos como funciones,
  triggers o constraints sobre tablas existentes.

## Migraciones aplicadas

### `20260727000000_fix_votante_asignador_validation.sql`

**Ya fue aplicada manualmente en producción.** Se agrega al repositorio para
trazabilidad y para poder reproducir el mismo cambio en otra base que ya
tenga el esquema (no se debe volver a ejecutar contra la producción actual).

Corrige la validación de `votantes.asignado_por`: reemplaza una foreign key
que apuntaba incorrectamente a `padron(ci)` por un trigger que valida
`asignado_por` contra la tabla (`dirigentes` / `coordinadores` /
`subcoordinadores`) que corresponda según `asignado_por_rol`.
