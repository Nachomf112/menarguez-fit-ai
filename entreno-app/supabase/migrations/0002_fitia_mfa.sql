-- ═══════════════════════════════════════════════════════════════════════════
-- Menarguez Fit IA · 0002 · Verificación en dos pasos obligatoria para quien la active
-- Menarguez-IA-Solutions | Ignacio Menárguez Fernández
--
-- Si un usuario tiene una app de autenticación verificada (TOTP), solo puede leer o
-- modificar sus datos con una sesión de nivel aal2 (contraseña + código).
-- Así, quien robe solo la contraseña no accede a los datos aunque llame a la API directamente.
-- Usuarios sin verificación en dos pasos: sin cambios.
--
-- Ejecutar en: Supabase → SQL Editor → New query → pegar → Run. Es idempotente.
-- Requiere haber ejecutado antes 0001_fitia_esquema.sql.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.nivel_mfa_suficiente()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (
      select 1 from auth.mfa_factors f
      where f.user_id = (select auth.uid()) and f.status = 'verified'
    ) then coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2'
    else true
  end;
$$;
revoke all on function public.nivel_mfa_suficiente() from public, anon;
grant execute on function public.nivel_mfa_suficiente() to authenticated;

-- Políticas RESTRICTIVAS: se suman (AND) a las existentes, no las sustituyen.
drop policy if exists "atletas: exigir MFA si está activada" on public.atletas;
create policy "atletas: exigir MFA si está activada" on public.atletas
  as restrictive for all to authenticated
  using ((select public.nivel_mfa_suficiente()))
  with check ((select public.nivel_mfa_suficiente()));

drop policy if exists "consentimientos: exigir MFA si está activada" on public.consentimientos;
create policy "consentimientos: exigir MFA si está activada" on public.consentimientos
  as restrictive for all to authenticated
  using ((select public.nivel_mfa_suficiente()))
  with check ((select public.nivel_mfa_suficiente()));
