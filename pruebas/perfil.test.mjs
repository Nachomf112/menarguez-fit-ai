// Pruebas de api/save-profile-fit.js con un Upstash simulado (sin red). Uso: node --test pruebas/
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/save-profile-fit.js';
import { huellaDispositivo } from '../api/_lib/codigo.js';

const DISP = '11111111-2222-4333-8444-555555555555';
const FP = huellaDispositivo(DISP);

process.env.KV_REST_API_URL = 'https://kv.test';
process.env.KV_REST_API_TOKEN = 'token-ficticio';
let db, caido;
const futuro = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
beforeEach(() => {
  caido = false;
  db = new Map([
    ['code:FIT-AAAA-BBBB', JSON.stringify({ activo: true, expira: futuro, plan: 'free', fingerprint: FP })],
    ['code:FIT-OFF0-0000', JSON.stringify({ activo: false, expira: futuro, fingerprint: FP })],
    ['code:FIT-OLD0-0000', JSON.stringify({ activo: true, expira: '2020-01-01', fingerprint: FP })],
  ]);
});
globalThis.fetch = async (url, opts = {}) => {
  if (caido) throw new Error('timeout');
  const u = new URL(url);
  const [, op, ...rest] = u.pathname.split('/');
  const key = decodeURIComponent(rest.join('/'));
  if (op === 'get') return { ok: true, json: async () => ({ result: db.get(key) ?? null }) };
  if (op === 'set') { db.set(key, opts.body); return { ok: true, json: async () => ({ result: 'OK' }) }; }
  if (op === 'del') { db.delete(key); return { ok: true, json: async () => ({ result: 1 }) }; }
  return { ok: false, status: 404, json: async () => ({}) };
};
// Por defecto los POST llevan el consentimiento; las pruebas de consentimiento lo quitan con consentimiento: null.
const llamar = async (method, { body, query = '', disp = DISP } = {}) => {
  if (method === 'POST' && body && typeof body === 'object' && !('consentimiento' in body)) body = { ...body, consentimiento: '2026-11' };
  let status = 0, json = null;
  const res = { setHeader() {}, status(s) { status = s; return this; }, json(j) { json = j; return this; }, end() { return this; } };
  await handler({ method, body, url: `/api/save-profile-fit${query}`, headers: disp ? { 'x-fit-device': disp } : {} }, res);
  return { status, json };
};
const perfil = (o = {}) => ({ nombre: 'Ana', peso: 60, altura: 165, fechaNac: '1990-05-01', edad: 99, sexo: 'mujer', actividad: 'ligero', objetivo: 'mantener', tdee: 1900, objKcal: 1900, protObj: 120, fatObj: 53, carbObj: 220, ...o });

test('guarda solo campos conocidos, con el nombre limpio y la edad recalculada', async () => {
  const r = await llamar('POST', { body: { code: ' fit-aaaa-bbbb ', perfil: perfil({ nombre: '<b>Ana</b>', admin: true, extra: 'x'.repeat(100) }) } });
  assert.equal(r.status, 200);
  const g = JSON.parse(db.get('profile:FIT-AAAA-BBBB'));
  assert.equal(g.nombre, 'bAna/b');
  assert.equal(g.admin, undefined);
  assert.equal(g.extra, undefined);
  assert.notEqual(g.edad, 99);
  assert.deepEqual(Object.keys(g).sort(), ['actividad', 'ajustadoAlMinimo', 'altura', 'carbObj', 'consentimiento', 'edad', 'fatObj', 'fechaNac', 'nombre', 'objKcal', 'objetivo', 'peso', 'protObj', 'sexo', 'tdee']);
  assert.deepEqual(r.json.perfil, g);
});

test('los objetivos los calcula el servidor: se ignoran los del navegador', async () => {
  const r = await llamar('POST', { body: { code: 'FIT-AAAA-BBBB', perfil: perfil({ objKcal: 600, protObj: 400, tdee: 9999 }) } });
  assert.equal(r.status, 200);
  assert.ok(r.json.perfil.objKcal >= 1200);
  assert.notEqual(r.json.perfil.protObj, 400);
});

test('no guarda con códigos inexistentes, desactivados o caducados', async () => {
  for (const code of ['FIT-ZZZZ-ZZZZ', 'FIT-OFF0-0000', 'FIT-OLD0-0000']) {
    const r = await llamar('POST', { body: { code, perfil: perfil() } });
    assert.equal(r.status, 401, code);
    assert.equal(db.has(`profile:${code}`), false, code);
  }
});

test('rechaza códigos con formato raro (inyección en la ruta de Upstash)', async () => {
  for (const code of ['FIT-AAAA-BBBB/../code:FIT-X', 'code:FIT-AAAA-BBBB', 'FIT AAAA', '*', 'FIT-AAAA-BBBB?x=1']) {
    const r = await llamar('POST', { body: { code, perfil: perfil() } });
    assert.equal(r.status, 400, code);
  }
  assert.equal([...db.keys()].filter((k) => k.startsWith('profile:')).length, 0);
});

test('el perfil demo no se guarda en el servidor ni se comparte', async () => {
  const r = await llamar('POST', { body: { code: 'DEMO-2026', perfil: perfil() } });
  assert.equal(r.status, 200);
  assert.equal(r.json.guardado, false);
  assert.equal(db.has('profile:DEMO-2026'), false);
  db.set('profile:DEMO-2026', JSON.stringify({ nombre: 'Visitante anterior' }));
  const g = await llamar('GET', { query: '?code=DEMO-2026' });
  assert.equal(g.json.perfil, null);
});

test('mantiene la barrera de edad y valida los campos', async () => {
  assert.equal((await llamar('POST', { body: { code: 'FIT-AAAA-BBBB', perfil: perfil({ fechaNac: '2015-01-01' }) } })).status, 403);
  assert.equal((await llamar('POST', { body: { code: 'FIT-AAAA-BBBB', perfil: perfil({ sexo: '<script>' }) } })).status, 400);
  assert.equal((await llamar('POST', { body: { code: 'FIT-AAAA-BBBB', perfil: perfil({ peso: 5 }) } })).status, 400);
});

test('leer exige un código válido', async () => {
  db.set('profile:FIT-AAAA-BBBB', JSON.stringify({ nombre: 'Ana' }));
  db.set('profile:FIT-OLD0-0000', JSON.stringify({ nombre: 'Caducado' }));
  assert.equal((await llamar('GET', { query: '?code=FIT-AAAA-BBBB' })).json.perfil.nombre, 'Ana');
  assert.equal((await llamar('GET', { query: '?code=FIT-OLD0-0000' })).status, 401);
  assert.equal((await llamar('GET', { query: '?code=FIT-ZZZZ-ZZZZ' })).status, 401);
});

test('si Upstash no responde, devuelve 503 sin detalles internos', async () => {
  caido = true;
  const r = await llamar('POST', { body: { code: 'FIT-AAAA-BBBB', perfil: perfil() } });
  assert.equal(r.status, 503);
  assert.equal(JSON.stringify(r.json).includes('timeout'), false);
});

test('rechaza cuerpos enormes', async () => {
  const r = await llamar('POST', { body: { code: 'FIT-AAAA-BBBB', perfil: perfil({ nombre: 'x'.repeat(10000) }) } });
  assert.equal(r.status, 413);
});

test('C3: sin el dispositivo vinculado no se puede leer ni guardar el perfil', async () => {
  db.set('profile:FIT-AAAA-BBBB', JSON.stringify({ nombre: 'Ana' }));
  for (const disp of [null, '99999999-2222-4333-8444-555555555555', 'corto']) {
    assert.equal((await llamar('GET', { query: '?code=FIT-AAAA-BBBB', disp })).status, 401, String(disp));
    assert.equal((await llamar('POST', { body: { code: 'FIT-AAAA-BBBB', perfil: perfil({ nombre: 'Intruso' }) }, disp })).status, 401, String(disp));
  }
  assert.equal(JSON.parse(db.get('profile:FIT-AAAA-BBBB')).nombre, 'Ana');
  db.set('code:FIT-NUEV-0000', JSON.stringify({ activo: true, expira: futuro }));   // nunca se ha entrado con él
  assert.equal((await llamar('POST', { body: { code: 'FIT-NUEV-0000', perfil: perfil() } })).json.error, 'codigo_sin_vincular');
});

test('consentimiento: sin él no se guarda nada; con él queda registrado con versión y fecha', async () => {
  for (const consentimiento of [null, true, 'si', '2020-01']) {
    const r = await llamar('POST', { body: { code: 'FIT-AAAA-BBBB', perfil: perfil(), consentimiento } });
    assert.equal(r.status, 428, String(consentimiento));
    assert.equal(r.json.error, 'consentimiento_requerido');
  }
  assert.equal(db.has('profile:FIT-AAAA-BBBB'), false);
  const ok = await llamar('POST', { body: { code: 'FIT-AAAA-BBBB', perfil: perfil() } });
  assert.equal(ok.status, 200);
  const guardado = JSON.parse(db.get('profile:FIT-AAAA-BBBB'));
  assert.equal(guardado.consentimiento.version, '2026-11');
  assert.ok(!Number.isNaN(Date.parse(guardado.consentimiento.fecha)));
});

test('retirar el consentimiento borra el perfil, incluso con el código caducado; solo desde el dispositivo vinculado', async () => {
  db.set('profile:FIT-AAAA-BBBB', JSON.stringify({ nombre: 'Ana' }));
  assert.equal((await llamar('DELETE', { query: '?code=FIT-AAAA-BBBB', disp: '99999999-2222-4333-8444-555555555555' })).status, 401);
  assert.equal(db.has('profile:FIT-AAAA-BBBB'), true);
  const r = await llamar('DELETE', { query: '?code=fit-aaaa-bbbb' });
  assert.equal(r.status, 200);
  assert.equal(db.has('profile:FIT-AAAA-BBBB'), false);
  db.set('profile:FIT-OLD0-0000', JSON.stringify({ nombre: 'Caducado' }));
  assert.equal((await llamar('DELETE', { query: '?code=FIT-OLD0-0000' })).status, 200);
  assert.equal(db.has('profile:FIT-OLD0-0000'), false);
  assert.equal((await llamar('DELETE', { query: '?code=FIT-ZZZZ-9999' })).status, 404);
  assert.equal((await llamar('DELETE', { query: '?code=<x>' })).status, 400);
});
