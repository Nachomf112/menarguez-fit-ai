-- ═══════════════════════════════════════════════════════════════════════════
-- Menarguez Fit IA · Esquema inicial (proyecto Supabase fitia-dev)
-- Menarguez-IA-Solutions | Ignacio Menárguez Fernández
--
-- Principios:
--  · Cada fila pertenece a un usuario de Supabase Auth (auth.users).
--  · RLS activado y forzado en todas las tablas: un usuario solo ve y modifica lo suyo.
--  · El rol anónimo (anon) no tiene ningún permiso sobre estas tablas.
--  · Los datos de entrenamiento incluyen información de salud (lesiones, molestias,
--    medidas): solo se pueden guardar si existe un consentimiento explícito vigente.
--  · Los consentimientos son un registro inmutable (no se editan ni se borran).
--  · El usuario puede exportar sus datos (SELECT) y borrar su cuenta (función).
--
-- Ejecutar UNA vez en: Supabase → SQL Editor → New query → pegar → Run.
-- Es idempotente en lo posible (IF NOT EXISTS / OR REPLACE / DROP POLICY IF EXISTS).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Consentimientos (registro inmutable) ────────────────────────────────
create table if not exists public.consentimientos (
  id           bigint generated always as identity primary key,
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tipo         text not null check (tipo in ('terminos', 'datos_salud')),
  version      text not null check (char_length(version) between 1 and 20),
  aceptado     boolean not null,
  creado_en    timestamptz not null default now()
);
create index if not exists consentimientos_user_tipo_idx on public.consentimientos (user_id, tipo, creado_en desc);

-- ¿Tiene el usuario actual el consentimiento de datos de salud vigente?
-- (el último registro de ese tipo debe ser una aceptación)
create or replace function public.tiene_consentimiento_salud()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce((
    select c.aceptado
    from public.consentimientos c
    where c.user_id = (select auth.uid()) and c.tipo = 'datos_salud'
    order by c.creado_en desc, c.id desc
    limit 1
  ), false);
$$;

-- ── 2. Atletas (un perfil de entrenamiento con sus datos) ──────────────────
-- 'datos' guarda en JSON el perfil, el plan, las sesiones, medidas, favoritos y nutrición
-- tal como los usa la aplicación (mismo formato que la copia de seguridad).
create table if not exists public.atletas (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nombre         text not null check (char_length(nombre) between 1 and 40),
  datos          jsonb not null default '{}'::jsonb,
  version_datos  integer not null default 1 check (version_datos >= 1),
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint atletas_datos_objeto check (jsonb_typeof(datos) = 'object'),
  constraint atletas_datos_tamano check (pg_column_size(datos) <= 2000000)
);
create index if not exists atletas_owner_idx on public.atletas (owner_id);

-- Mantiene actualizado_en y bloquea cambios de propietario o de fecha de creación.
create or replace function public.atletas_antes_de_actualizar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception 'No se puede cambiar el propietario de un perfil';
  end if;
  new.creado_en := old.creado_en;
  new.actualizado_en := now();
  return new;
end;
$$;
drop trigger if exists atletas_antes_de_actualizar on public.atletas;
create trigger atletas_antes_de_actualizar
  before update on public.atletas
  for each row execute function public.atletas_antes_de_actualizar();

-- Límite de 5 perfiles por usuario (preparado para un futuro modo multiatleta).
-- Se comprueba en un trigger: dentro de una política provocaría recursión.
create or replace function public.atletas_limite_por_usuario()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.atletas a where a.owner_id = new.owner_id) >= 5 then
    raise exception 'Límite de 5 perfiles por cuenta alcanzado';
  end if;
  return new;
end;
$$;
drop trigger if exists atletas_limite_por_usuario on public.atletas;
create trigger atletas_limite_por_usuario
  before insert on public.atletas
  for each row execute function public.atletas_limite_por_usuario();

-- ── 3. Permisos: nada para anon; lo justo para authenticated ───────────────
revoke all on public.consentimientos from anon, authenticated;
revoke all on public.atletas from anon, authenticated;
grant select, insert on public.consentimientos to authenticated;
grant select, insert, update, delete on public.atletas to authenticated;
revoke all on function public.tiene_consentimiento_salud() from public, anon;
grant execute on function public.tiene_consentimiento_salud() to authenticated;

-- ── 4. Row Level Security ──────────────────────────────────────────────────
alter table public.consentimientos enable row level security;
alter table public.consentimientos force row level security;
alter table public.atletas enable row level security;
alter table public.atletas force row level security;

drop policy if exists "consentimientos: ver los propios" on public.consentimientos;
create policy "consentimientos: ver los propios" on public.consentimientos
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "consentimientos: registrar los propios" on public.consentimientos;
create policy "consentimientos: registrar los propios" on public.consentimientos
  for insert to authenticated
  with check (user_id = (select auth.uid()));
-- Sin políticas de UPDATE ni DELETE: el registro de consentimientos es inmutable.

drop policy if exists "atletas: ver los propios" on public.atletas;
create policy "atletas: ver los propios" on public.atletas
  for select to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists "atletas: crear con consentimiento" on public.atletas;
create policy "atletas: crear con consentimiento" on public.atletas
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and (select public.tiene_consentimiento_salud())
  );

drop policy if exists "atletas: modificar los propios con consentimiento" on public.atletas;
create policy "atletas: modificar los propios con consentimiento" on public.atletas
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and (select public.tiene_consentimiento_salud()));

drop policy if exists "atletas: borrar los propios" on public.atletas;
create policy "atletas: borrar los propios" on public.atletas
  for delete to authenticated
  using (owner_id = (select auth.uid()));

-- ── 5. Borrar mi cuenta (derecho de supresión) ─────────────────────────────
-- Elimina el usuario de Auth; por ON DELETE CASCADE se borran sus atletas y consentimientos.
create or replace function public.eliminar_mi_cuenta()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Sesión no válida';
  end if;
  delete from public.atletas where owner_id = uid;
  delete from public.consentimientos where user_id = uid;
  delete from auth.users where id = uid;
end;
$$;
revoke all on function public.eliminar_mi_cuenta() from public, anon;
grant execute on function public.eliminar_mi_cuenta() to authenticated;
