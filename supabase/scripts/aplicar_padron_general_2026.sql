-- EJECUTAR MANUALMENTE DESPUÉS de importar PADRON_SL_LIMPIO.csv
-- en public.padron_import_sl_2026.
--
-- Conserva las filas históricas de public.padron para no romper dirigentes,
-- coordinadores, subcoordinadores ni votantes existentes.

begin;

do $$
declare
  total_importados bigint;
  total_ci bigint;
begin
  select count(*), count(distinct ci)
    into total_importados, total_ci
  from public.padron_import_sl_2026;

  if total_importados <> 170644 then
    raise exception
      'Importación detenida: se esperaban 170644 filas y se encontraron %.',
      total_importados;
  end if;

  if total_importados <> total_ci then
    raise exception
      'Importación detenida: existen CI duplicadas en padron_import_sl_2026.';
  end if;

  if exists (
    select 1
    from public.padron_import_sl_2026
    where local_codigo is null
       or btrim(local_votacion) = ''
       or ci is null
       or btrim(nombre) = ''
       or btrim(apellido) = ''
  ) then
    raise exception
      'Importación detenida: hay campos obligatorios vacíos.';
  end if;
end
$$;

-- El padrón anterior queda disponible para enriquecer roles existentes,
-- pero ya no aparece al agregar nuevas personas.
update public.padron
set vigente = false
where vigente is distinct from false;

insert into public.padron (
  ci,
  nombre,
  apellido,
  seccional,
  local_codigo,
  local_votacion,
  mesa,
  orden,
  vigente
)
select
  ci,
  btrim(nombre),
  btrim(apellido),
  null,
  local_codigo,
  btrim(local_votacion),
  mesa,
  orden,
  true
from public.padron_import_sl_2026
on conflict (ci) do update
set nombre = excluded.nombre,
    apellido = excluded.apellido,
    seccional = null,
    local_codigo = excluded.local_codigo,
    local_votacion = excluded.local_votacion,
    mesa = excluded.mesa,
    orden = excluded.orden,
    vigente = true;

do $$
declare
  total_vigentes bigint;
begin
  select count(*)
    into total_vigentes
  from public.padron
  where vigente = true;

  if total_vigentes <> 170644 then
    raise exception
      'Validación final fallida: se esperaban 170644 personas vigentes y hay %.',
      total_vigentes;
  end if;
end
$$;

commit;

-- Resultado esperado: 170644.
select count(*) as personas_padron_vigente
from public.padron
where vigente = true;

-- Debe devolver una sola fila: AGUSTIN JOSE FERREIRA.
select ci, nombre, apellido, local_codigo, local_votacion
from public.padron
where ci = 1828480 and vigente = true;
