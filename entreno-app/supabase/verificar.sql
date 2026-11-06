-- Verificación (solo lectura) tras ejecutar 0001_fitia_esquema.sql y 0002_fitia_mfa.sql
-- Supabase → SQL Editor → New query → pegar → Run. Devuelve una única tabla de comprobaciones.

select 'RLS activado y forzado' as comprobacion,
       string_agg(c.relname || '=' || (c.relrowsecurity and c.relforcerowsecurity)::text, ', ' order by c.relname) as resultado,
       'atletas=true, consentimientos=true' as esperado
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('atletas', 'consentimientos')
union all
select 'Permisos de anon',
       coalesce(string_agg(table_name || ':' || privilege_type, ', '), 'ninguno'),
       'ninguno'
from information_schema.role_table_grants
where table_schema = 'public' and table_name in ('atletas', 'consentimientos') and grantee = 'anon'
union all
select 'Permisos de authenticated',
       string_agg(table_name || ':' || privilege_type, ', ' order by table_name, privilege_type),
       'atletas:DELETE, atletas:INSERT, atletas:SELECT, atletas:UPDATE, consentimientos:INSERT, consentimientos:SELECT'
from information_schema.role_table_grants
where table_schema = 'public' and table_name in ('atletas', 'consentimientos') and grantee = 'authenticated'
union all
select 'Políticas', count(*)::text || ' (' || string_agg(tablename || ':' || cmd || case when permissive = 'RESTRICTIVE' then '/restrictiva' else '' end, ', ' order by tablename, cmd) || ')',
       '8 (atletas: ALL/restrictiva, DELETE, INSERT, SELECT, UPDATE; consentimientos: ALL/restrictiva, INSERT, SELECT)'
from pg_policies where schemaname = 'public' and tablename in ('atletas', 'consentimientos')
union all
select 'Funciones', string_agg(p.proname, ', ' order by p.proname),
       'atletas_antes_de_actualizar, atletas_limite_por_usuario, eliminar_mi_cuenta, nivel_mfa_suficiente, tiene_consentimiento_salud'
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('atletas_antes_de_actualizar', 'atletas_limite_por_usuario', 'eliminar_mi_cuenta', 'nivel_mfa_suficiente', 'tiene_consentimiento_salud');
