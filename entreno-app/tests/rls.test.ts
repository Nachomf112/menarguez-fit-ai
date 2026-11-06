// Pruebas de aislamiento del esquema Supabase con un Postgres 16 local (PGlite).
// Se simulan auth.users y auth.uid() como en Supabase; el resto es el SQL real de la migración.
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
let db: PGlite;

async function as(user: string | null, sql: string, params: unknown[] = [], aal = 'aal1') {
  await db.exec('reset role');
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [user ? JSON.stringify({ sub: user, aal }) : '']);
  if (user) {
    await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user]);
    await db.exec('set role authenticated');
  } else {
    await db.query(`select set_config('request.jwt.claim.sub', '', false)`);
    await db.exec('set role anon');
  }
  try { return await db.query<Record<string, unknown>>(sql, params); } finally { await db.exec('reset role'); }
}
const fails = async (p: Promise<unknown>, re: RegExp) => {
  let msg = '';
  try { await p; } catch (e) { msg = (e as Error).message; }
  expect(msg, `se esperaba error ${re}`).toMatch(re);
};
const consent = (u: string, aceptado: boolean) =>
  as(u, `insert into public.consentimientos (tipo, version, aceptado) values ('datos_salud', '2026-11', $1)`, [aceptado]);
const newAtleta = (u: string, nombre = 'Test', datos = '{}') =>
  as(u, `insert into public.atletas (nombre, datos) values ($1, $2::jsonb) returning id`, [nombre, datos]);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public, auth to anon, authenticated;
    create function auth.jwt() returns jsonb language sql stable as
      $$ select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $$;
    create table auth.mfa_factors (id uuid primary key default gen_random_uuid(), user_id uuid not null, status text not null);
    grant execute on function auth.uid() to anon, authenticated;
    grant execute on function auth.jwt() to anon, authenticated;
    insert into auth.users values ('${A}'), ('${B}'), ('${C}');
  `);
  for (const f of ['0001_fitia_esquema.sql', '0002_fitia_mfa.sql']) {
    // Idempotencia: ejecutar dos veces no debe fallar.
    await db.exec(readFileSync(`supabase/migrations/${f}`, 'utf8'));
    await db.exec(readFileSync(`supabase/migrations/${f}`, 'utf8'));
  }
});

describe('RLS y permisos del esquema', () => {
  it('el rol anónimo no puede leer ni escribir nada', async () => {
    await fails(as(null, 'select * from public.atletas'), /permission denied/);
    await fails(as(null, 'select * from public.consentimientos'), /permission denied/);
    await fails(as(null, `insert into public.atletas (nombre) values ('x')`), /permission denied/);
    await fails(as(null, 'select public.eliminar_mi_cuenta()'), /permission denied/);
  });

  it('sin consentimiento de datos de salud no se puede guardar un perfil', async () => {
    await fails(newAtleta(A), /row-level security/);
    await consent(A, true);
    const r = await newAtleta(A, 'Ana', '{"profile":{"nombre":"Ana"}}');
    expect(r.rows).toHaveLength(1);
  });

  it('un usuario no ve, modifica ni borra los datos de otro', async () => {
    await consent(B, true);
    await newAtleta(B, 'Berta');
    const vistosPorB = await as(B, 'select nombre from public.atletas');
    expect(vistosPorB.rows.map((x) => x.nombre)).toEqual(['Berta']);
    const upd = await as(B, `update public.atletas set nombre = 'hackeado' where nombre = 'Ana'`);
    expect(upd.affectedRows).toBe(0);
    const del = await as(B, `delete from public.atletas where nombre = 'Ana'`);
    expect(del.affectedRows).toBe(0);
    await fails(as(B, `insert into public.atletas (owner_id, nombre) values ($1, 'suplantado')`, [A]), /row-level security/);
    const deA = await as(A, 'select nombre from public.atletas');
    expect(deA.rows.map((x) => x.nombre)).toEqual(['Ana']);
    const consB = await as(B, 'select user_id from public.consentimientos');
    expect(consB.rows.every((x) => x.user_id === B)).toBe(true);
  });

  it('no se puede cambiar el propietario de un perfil', async () => {
    await fails(as(A, `update public.atletas set owner_id = $1`, [B]), /propietario|row-level security/);
  });

  it('los consentimientos son inmutables', async () => {
    await fails(as(A, `update public.consentimientos set aceptado = true`), /permission denied/);
    await fails(as(A, `delete from public.consentimientos`), /permission denied/);
    await fails(as(A, `insert into public.consentimientos (user_id, tipo, version, aceptado) values ($1, 'datos_salud', 'x', true)`, [B]), /row-level security/);
  });

  it('al retirar el consentimiento no se pueden guardar cambios, pero sí exportar y borrar', async () => {
    await consent(A, false);
    const upd = as(A, `update public.atletas set nombre = 'Ana 2'`);
    await fails(upd, /row-level security/);
    expect((await as(A, 'select nombre from public.atletas')).rows).toHaveLength(1);
    await consent(A, true);
    await as(A, `update public.atletas set nombre = 'Ana 2'`);
    expect((await as(A, 'select nombre from public.atletas')).rows[0].nombre).toBe('Ana 2');
  });

  it('valida el contenido: datos como objeto, nombre acotado y máximo 5 perfiles', async () => {
    await fails(newAtleta(A, 'X', '[1,2]'), /atletas_datos_objeto/);
    await fails(newAtleta(A, 'x'.repeat(41)), /check constraint/);
    for (let i = 0; i < 4; i++) await newAtleta(A, `Extra ${i}`);
    expect((await as(A, 'select count(*)::int as n from public.atletas')).rows[0].n).toBe(5);
    await fails(newAtleta(A, 'Sexto'), /Límite de 5 perfiles/);
  });

  it('con verificación en dos pasos activada, la sesión solo con contraseña no accede a los datos', async () => {
    await as(C, `insert into public.consentimientos (tipo, version, aceptado) values ('datos_salud', '2026-11', true)`);
    await as(C, `insert into public.atletas (nombre) values ('Carla')`);
    await db.exec(`insert into auth.mfa_factors (user_id, status) values ('${C}', 'unverified')`);
    expect((await as(C, 'select nombre from public.atletas')).rows).toHaveLength(1); // factor sin verificar: no cuenta
    await db.exec(`update auth.mfa_factors set status = 'verified' where user_id = '${C}'`);
    expect((await as(C, 'select nombre from public.atletas')).rows).toHaveLength(0);
    expect((await as(C, 'select * from public.consentimientos')).rows).toHaveLength(0);
    await fails(as(C, `insert into public.atletas (nombre) values ('x')`), /row-level security/);
    const upd = await as(C, `update public.atletas set nombre = 'x'`);
    expect(upd.affectedRows).toBe(0);
    expect((await as(C, 'select nombre from public.atletas', [], 'aal2')).rows.map((x) => x.nombre)).toEqual(['Carla']);
    await as(C, `update public.atletas set nombre = 'Carla 2'`, [], 'aal2');
    expect((await as(C, 'select nombre from public.atletas', [], 'aal2')).rows[0].nombre).toBe('Carla 2');
    // A y B no tienen factores: siguen funcionando con aal1
    expect((await as(B, 'select nombre from public.atletas')).rows).toHaveLength(1);
  });

  it('eliminar mi cuenta borra solo mis datos', async () => {
    await as(A, 'select public.eliminar_mi_cuenta()');
    await db.exec('reset role');
    const users = await db.query<{ id: string }>('select id from auth.users');
    expect(users.rows.map((x) => x.id).sort()).toEqual([B, C]);
    const quedan = await db.query<{ owner_id: string }>('select owner_id from public.atletas');
    expect(quedan.rows.some((x) => x.owner_id === A)).toBe(false);
    expect(quedan.rows).toHaveLength(2);
  });
});
