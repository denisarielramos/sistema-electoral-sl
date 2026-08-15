# Importar el padrón general 2026

Este procedimiento reemplaza el padrón habilitado para nuevas asignaciones sin
eliminar personas históricas ni romper la estructura electoral existente.

## Archivos

- `PADRON_SL_LIMPIO.csv`: 170.644 personas, sin CI duplicadas.
- `supabase/migrations/20260805000000_adaptar_padron_general.sql`: prepara el esquema.
- `supabase/scripts/aplicar_padron_general_2026.sql`: valida y aplica la importación.

La CI duplicada `1828480` fue resuelta conservando a **AGUSTIN JOSE FERREIRA**
y descartando la fila incorrecta de Osvaldo Pineda Figueredo.

## Orden obligatorio

1. Mergear y desplegar el PR de adaptación.
2. Ejecutar en Supabase SQL Editor la migración
   `20260805000000_adaptar_padron_general.sql`.
3. Vaciar únicamente la tabla temporal:

   ```sql
   truncate table public.padron_import_sl_2026;
   ```

4. En Supabase Table Editor, abrir `padron_import_sl_2026` e importar
   `PADRON_SL_LIMPIO.csv`.
5. Confirmar que Supabase muestre 170.644 filas importadas.
6. Ejecutar completo `supabase/scripts/aplicar_padron_general_2026.sql`.
7. Confirmar que la consulta final devuelva `170644` y a
   `AGUSTIN JOSE FERREIRA` para la CI `1828480`.

## Seguridad del procedimiento

- No se hace `truncate` ni `delete` sobre `public.padron`.
- Las filas anteriores quedan con `vigente = false` para seguir enriqueciendo
  dirigentes, coordinadores, subcoordinadores y votantes ya asignados.
- Solo las filas con `vigente = true` aparecen al agregar nuevas personas.
- Dirección histórica se conserva cuando la CI ya existía.
- Seccional queda nula porque ya no forma parte del padrón definitivo.
- Mesa y orden quedan nulos y podrán cargarse posteriormente.
- La tabla temporal no es accesible por los roles `anon` ni `authenticated`.
