// Pruebas de api/validate-code.js v2 (C3) con Upstash simulado.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/validate-code.js';
import { huellaDispositivo } from '../api/_lib/codigo.js';

process.env.KV_REST_API_URL = 'https://kv.test';
process.env.KV_REST_API_TOKEN = 'token-ficticio';
const futuro = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const A = '11111111-2222-4333-8444-555555555555', B = '99999999-2222-4333-8444-555555555555';
let db, accesos;
beforeEach(() => {
  accesos = 0;
  db = new Map([['code:FIT-AAAA-BBBB', JSON.stringify({ nombre: 'Ana', activo: true, expira: futuro, plan: 'free', usos_max: 30, usos_usados: 0 })]]);
});
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(url);
  const [, op, ...rest] = u.pathname.split('/');
  const key = decodeURIComponent(rest.join('/'));
  if (op === 'get') return { ok: true, json: async () => ({ result: db.get(key) ?? null }) };
  if (op === 'set') { db.set(key, opts.body); return { ok: true, json: async () => ({}) }; }
  if (op === 'lpush') { accesos++; return { ok: true, json: async () => ({}) }; }
  return { ok: true, json: async () => ({}) };
};
const llamar = async (body) => {
  let json = null, status = 0;
  const res = { setHeader() {}, status(s) { status = s; return this; }, json(j) { json = j; return this; }, end() { return this; } };
  await handler({ method: 'POST', body, headers: { 'x-forwarded-for': '188.26.195.197', 'user-agent': 'Mozilla/5.0 (Windows NT 10.0) Chrome/156' } }, res);
  return { status, json };
};

test('primer acceso: vincula el dispositivo guardando solo su huella', async () => {
  const r = await llamar({ code: 'fit-aaaa-bbbb', dispositivo: A });
  assert.equal(r.json.valid, true);
  const c = JSON.parse(db.get('code:FIT-AAAA-BBBB'));
  assert.equal(c.fingerprint, huellaDispositivo(A));
  assert.ok(!JSON.stringify(c).includes(A));
  assert.equal(accesos, 1);
});

test('mismo dispositivo: entra; otro dispositivo: error genérico sin IP ni navegador', async () => {
  await llamar({ code: 'FIT-AAAA-BBBB', dispositivo: A });
  assert.equal((await llamar({ code: 'FIT-AAAA-BBBB', dispositivo: A })).json.valid, true);
  db.set('profile:FIT-AAAA-BBBB', JSON.stringify({ nombre: 'Ana', peso: 60 }));
  const r = await llamar({ code: 'FIT-AAAA-BBBB', dispositivo: B });
  assert.equal(r.json.valid, false);
  assert.match(r.json.error, /otro dispositivo/);
  assert.ok(!/188\.26|Windows|Chrome/.test(JSON.stringify(r.json)));
  assert.equal(r.json.perfil, undefined);
});

test('el dispositivo es obligatorio y el código debe tener formato válido', async () => {
  assert.equal((await llamar({ code: 'FIT-AAAA-BBBB' })).status, 400);
  assert.equal((await llamar({ code: 'FIT-AAAA-BBBB', fingerprint: 'abcd1234' })).status, 400);
  assert.equal(JSON.parse(db.get('code:FIT-AAAA-BBBB')).fingerprint, undefined);
  assert.equal((await llamar({ code: 'FIT-AAAA/../x', dispositivo: A })).json.valid, false);
});

test('los errores internos no se muestran al usuario', async () => {
  const f = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('ECONNRESET kv.test secreto'); };
  const r = await llamar({ code: 'FIT-AAAA-BBBB', dispositivo: A });
  globalThis.fetch = f;
  assert.equal(r.status, 500);
  assert.ok(!JSON.stringify(r.json).includes('ECONNRESET'));
});
