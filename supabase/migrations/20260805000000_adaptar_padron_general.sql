-- Adaptación segura del padrón para elecciones generales 2026.
-- No elimina registros existentes ni rompe claves foráneas de la estructura.
-- El padrón anterior queda como histórico (vigente = false) después de ejecutar
-- el script de aplicación incluido en supabase/scripts.

alter table public.padron
  add column if not exists local_codigo integer;

alter table public.padron
  add column if not exists vigente boolean not null default true;

alter table public.padron
  alter column seccional drop not null;

alter table public.padron
  alter column mesa drop not null;

alter table public.padron
  alter column orden drop not null;

create index if not exists idx_padron_vigente
  on public.padron (vigente);

comment on column public.padron.local_codigo is
  'Código estable del local de votación en el padrón general 2026.';

comment on column public.padron.vigente is
  'Indica si la persona pertenece al padrón vigente usado para nuevas asignaciones.';

create table if not exists public.padron_import_sl_2026 (
  local_codigo integer not null check (local_codigo > 0),
  local_votacion text not null check (btrim(local_votacion) <> ''),
  ci bigint primary key check (ci > 0),
  nombre text not null check (btrim(nombre) <> ''),
  apellido text not null check (btrim(apellido) <> ''),
  mesa integer,
  orden integer
);

alter table public.padron_import_sl_2026 enable row level security;
revoke all on table public.padron_import_sl_2026 from anon, authenticated;

comment on table public.padron_import_sl_2026 is
  'Tabla temporal protegida para cargar y validar PADRON_SL_LIMPIO.csv antes del upsert.';
