// Reglas de sincronización y validación de cuenta (sin red).
import { describe, expect, it } from 'vitest';
import { blankProfile, emptyProfileData, makeDemo } from '../src/data/demo';
import { cloudEnabled, isEmail, passwordProblems } from '../src/cloud/config';
import { authMessage } from '../src/cloud/useCloud';
import { emptyMeta, hashProfile, hashText, mergeRemote, pushPlan } from '../src/cloud/merge';
import type { AppState, ProfileData } from '../src/domain/types';
import { emptyState } from '../src/storage/store';

const NOW = new Date('2026-11-06T10:00:00Z');
const perfil = (id: string, nombre = 'Ana'): ProfileData => emptyProfileData({ ...blankProfile(id, NOW), nombre, edad: 40 });
const estado = (...pds: ProfileData[]): AppState => ({ ...emptyState(), perfiles: Object.fromEntries(pds.map((p) => [p.profile.id, p])), activeProfileId: pds[0]?.profile.id ?? null });

describe('configuración de la cuenta', () => {
  it('solo se activa en el entorno de pruebas y en local', () => {
    expect(cloudEnabled('menarguez-fit-ai-git-desarrollo-nachos-projects-9fab1a83.vercel.app')).toBe(true);
    expect(cloudEnabled('localhost')).toBe(true);
    expect(cloudEnabled('fit.menarguez-ia.com')).toBe(false);
    expect(cloudEnabled('menarguez-fit-ai.vercel.app')).toBe(false);
    expect(cloudEnabled('evil.com')).toBe(false);
    expect(cloudEnabled('menarguez-fit-ai-git-desarrollo-nachos-projects-9fab1a83.vercel.app.evil.com')).toBe(false);
  });
  it('exige contraseñas fuertes', () => {
    expect(passwordProblems('corta')).toContain('al menos 12 caracteres');
    expect(passwordProblems('todominusculas1!')).toContain('una mayúscula');
    expect(passwordProblems('SinNumerosNi!!')).toContain('un número');
    expect(passwordProblems('SinSimbolo1234')).toContain('un símbolo');
    expect(passwordProblems('Ficticia-Prueba-2026')).toEqual([]);
  });
  it('valida correos', () => {
    expect(isEmail('prueba@example.com')).toBe(true);
    expect(isEmail('prueba@example')).toBe(false);
    expect(isEmail('a b@example.com')).toBe(false);
  });
  it('los mensajes de error no revelan si un correo existe', () => {
    expect(authMessage({ code: 'invalid_credentials' })).toBe('Correo o contraseña incorrectos.');
    expect(authMessage({ code: 'over_request_rate_limit' })).toMatch(/Demasiados intentos/);
    expect(authMessage({ message: 'Límite de 5 perfiles por cuenta alcanzado' })).toMatch(/5 perfiles/);
    expect(authMessage({ message: 'algo raro' })).toMatch(/No se ha podido/);
  });
});

describe('sincronización', () => {
  it('la huella cambia con el contenido', () => {
    expect(hashText('a')).not.toBe(hashText('b'));
    expect(hashText('abc')).toHaveLength(16);
    const a = perfil('p1'); const b = { ...a, favoritos: ['x'] };
    expect(hashProfile(a)).not.toBe(hashProfile(b));
  });

  it('primera sincronización: sube los perfiles reales y nunca la demostración', () => {
    const s = estado(perfil('p1'), makeDemo(NOW));
    const plan = pushPlan(s, emptyMeta('u1'));
    expect(plan.upserts.map((u) => u.pid)).toEqual(['p1']);
    expect(plan.upserts[0].rowId).toBeUndefined();
    expect(plan.deletes).toEqual([]);
  });

  it('sin cambios no sube nada; con cambios actualiza la fila conocida', () => {
    const p = perfil('p1');
    const meta = { userId: 'u1', rowIds: { p1: 'r1' }, hashes: { p1: hashProfile(p) } };
    expect(pushPlan(estado(p), meta).upserts).toEqual([]);
    const p2 = { ...p, favoritos: ['sentadilla-goblet'] };
    const plan = pushPlan(estado(p2), meta);
    expect(plan.upserts).toHaveLength(1);
    expect(plan.upserts[0].rowId).toBe('r1');
  });

  it('un perfil borrado en local se borra en la cuenta', () => {
    const meta = { userId: 'u1', rowIds: { p1: 'r1', p2: 'r2' }, hashes: {} };
    const plan = pushPlan(estado(perfil('p1')), meta);
    expect(plan.deletes).toEqual([{ pid: 'p2', rowId: 'r2' }]);
  });

  it('al entrar en otro dispositivo se cargan los perfiles de la cuenta', () => {
    const remoto = perfil('p1', 'Ana nube');
    const r = mergeRemote(emptyState(), [{ id: 'r1', datos: remoto }], emptyMeta('u1'));
    expect(r.state.perfiles.p1.profile.nombre).toBe('Ana nube');
    expect(r.state.activeProfileId).toBe('p1');
    expect(r.meta.rowIds).toEqual({ p1: 'r1' });
    expect(pushPlan(r.state, r.meta).upserts).toEqual([]);
  });

  it('gana la cuenta salvo que haya cambios locales sin subir', () => {
    const base = perfil('p1');
    const meta = { userId: 'u1', rowIds: { p1: 'r1' }, hashes: { p1: hashProfile(base) } };
    const remoto = { ...base, favoritos: ['remoto'] };
    const sinCambios = mergeRemote(estado(base), [{ id: 'r1', datos: remoto }], meta);
    expect(sinCambios.state.perfiles.p1.favoritos).toEqual(['remoto']);
    const local = { ...base, favoritos: ['local'] };
    const conCambios = mergeRemote(estado(local), [{ id: 'r1', datos: remoto }], meta);
    expect(conCambios.state.perfiles.p1.favoritos).toEqual(['local']);
    expect(pushPlan(conCambios.state, conCambios.meta).upserts.map((u) => u.pid)).toEqual(['p1']);
  });

  it('un perfil borrado en otro dispositivo desaparece aquí; uno nuevo local se conserva', () => {
    const viejo = perfil('p1'); const nuevo = perfil('p2', 'Nuevo');
    const meta = { userId: 'u1', rowIds: { p1: 'r1' }, hashes: { p1: hashProfile(viejo) } };
    const r = mergeRemote(estado(viejo, nuevo), [], meta);
    expect(Object.keys(r.state.perfiles)).toEqual(['p2']);
    expect(r.state.activeProfileId).toBe('p2');
    expect(pushPlan(r.state, r.meta).upserts.map((u) => u.pid)).toEqual(['p2']);
  });

  it('ignora filas remotas no válidas, duplicadas o de demostración', () => {
    const r = mergeRemote(emptyState(), [
      { id: 'r1', datos: { hola: 1 } },
      { id: 'r2', datos: makeDemo(NOW) },
      { id: 'r3', datos: perfil('p1') },
      { id: 'r4', datos: perfil('p1') },
    ], emptyMeta('u1'));
    expect(r.descartadas).toBe(3);
    expect(Object.keys(r.state.perfiles)).toEqual(['p1']);
    expect(r.meta.rowIds).toEqual({ p1: 'r3' });
  });

  it('conserva el perfil de demostración local sin subirlo', () => {
    const demo = makeDemo(NOW);
    const r = mergeRemote(estado(demo), [{ id: 'r1', datos: perfil('p1') }], emptyMeta('u1'));
    expect(Object.keys(r.state.perfiles).sort()).toEqual(['demo-laura', 'p1']);
    expect(pushPlan(r.state, r.meta).upserts).toEqual([]);
  });
});
