// Acceso a /entreno con el código de Fit AI. Upstash simulado y datos ficticios.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import acceso, { parseUserAgent } from '../api/entreno-acceso.js';
import codes from '../api/get-codes-fit.js';
import auth from '../api/admin-auth-fit.js';
import { huellaDispositivo } from '../api/_lib/codigo.js';

process.env.KV_REST_API_URL = 'https://kv.test';
process.env.KV_REST_API_TOKEN = 'token-ficticio';
process.env.ADMIN_PASSWORD = 'contrasena-ficticia-de-pruebas-123';

const DISP = '0f8e2c1a-3b4d-4e5f-8a9b-0c1d2e3f4a5b';
const OTRO = '11111111-2222-4333-8444-555555555555';
let db, hashes, listas;
beforeEach(() => {
  hashes = new Map(); listas = new Map();
  db = new Map([
    ['code:FIT-AAAA-BBBB', JSON.stringify({ nombre: 'Ana Ficticia', email: 'ana@example.com', activo: true, expira: '2020-01-01', plan: 'free', usos_usados: 30, usos_max: 30, fingerprint: null })],
    ['code:FIT-CCCC-DDDD', JSON.stringify({ nombre: 'Beto Ficticio', activo: false, expira: '2030-01-01', plan: 'free' })],
    ['code:FIT-EEEE-FFFF', JSON.stringify({ nombre: 'Carla Ficticia', activo: true, expira: '2030-01-01', plan: 'pro', fingerprint: huellaDispositivo(OTRO) })],
    ['code:FIT-MMMM-NNNN', JSON.stringify({ nombre: 'Menor Ficticio', activo: true, expira: '2030-01-01', plan: 'free' })],
    ['profile:FIT-MMMM-NNNN', JSON.stringify({ fechaNac: '2015-01-01' })],
  ]);
});
globalThis.fetch = async (url, opts = {}) => {
  const [cmd, ...a] = new URL(url).pathname.split('/').slice(1).map(decodeURIComponent);
  const ok = (result) => ({ ok: true, json: async () => ({ result }) });
  const h = (k) => { if (!hashes.has(k)) hashes.set(k, new Map()); return hashes.get(k); };
  switch (cmd) {
    case 'get': return ok(db.get(a[0]) ?? null);
    case 'set': db.set(a[0], a[1] ?? opts.body); return ok('OK');
    case 'del': db.delete(a[0]); hashes.delete(a[0]); return ok(1);
    case 'incr': { const n = (Number(db.get(a[0])) || 0) + 1; db.set(a[0], String(n)); return ok(n); }
    case 'expire': case 'ttl': return ok(1);
    case 'hsetnx': if (!h(a[0]).has(a[1])) h(a[0]).set(a[1], a[2]); return ok(1);
    case 'hset': h(a[0]).set(a[1], a[2]); return ok(1);
    case 'hincrby': { const n = (Number(h(a[0]).get(a[1])) || 0) + Number(a[2]); h(a[0]).set(a[1], String(n)); return ok(n); }
    case 'hgetall': return ok(hashes.has(a[0]) ? [...hashes.get(a[0])].flat() : []);
    case 'lpush': { const l = listas.get(a[0]) || []; l.unshift(JSON.parse(opts.body)); listas.set(a[0], l); return ok(l.length); }
    case 'ltrim': return ok('OK');
    case 'keys': return ok([...db.keys()].filter((k) => k.startsWith('code:FIT-')));
    default: return ok(null);
  }
};

const llamar = async (handler, { method = 'POST', body, headers = {}, query = {} } = {}) => {
  let status = 0, json = null; const cab = {};
  const res = { setHeader(k, v) { cab[k.toLowerCase()] = v; }, status(s) { status = s; return this; }, json(j) { json = j; return this; }, end() { return this; } };
  await handler({ method, body, headers: { 'x-real-ip': '203.0.113.7', ...headers }, query }, res);
  return { status, json, cab };
};
const entrar = (code, dispositivo = DISP, userAgent) => llamar(acceso, { body: { code, dispositivo, userAgent } });

test('entra con el código aunque el Free de nutrición haya caducado o agotado los análisis; no devuelve datos personales', async () => {
  const r = await entrar(' fit-aaaa-bbbb ');
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { valid: true, nombre: 'Ana Ficticia', plan: 'free' });
  assert.ok(!JSON.stringify(r.json).includes('example.com'));
  assert.equal(r.cab['access-control-allow-origin'], undefined);
  assert.equal(r.cab['cache-control'], 'no-store');
});

test('primer acceso: vincula el dispositivo (solo su huella) y registra el uso de entreno', async () => {
  await entrar('FIT-AAAA-BBBB', DISP, 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1');
  const c = JSON.parse(db.get('code:FIT-AAAA-BBBB'));
  assert.equal(c.fingerprint, huellaDispositivo(DISP));
  assert.ok(!JSON.stringify(c).includes(DISP));
  assert.deepEqual([c.dispositivo.os, c.dispositivo.tipo], ['iOS', 'móvil']);
  await entrar('FIT-AAAA-BBBB');
  const h = hashes.get('entreno:FIT-AAAA-BBBB');
  assert.equal(h.get('aperturas'), '2');
  assert.ok(h.get('primer_acceso') && h.get('ultimo_acceso'));
  const acc = JSON.parse(listas.get('fitai:accesos')[0]);
  assert.equal(acc.app, 'entreno');
  assert.equal(acc.code, 'FIT-AAAA-BBBB');
});

test('rechaza: código inexistente o mal formado, desactivado, otro dispositivo y perfil de menor', async () => {
  assert.equal((await entrar('FIT-ZZZZ-9999')).json.valid, false);
  assert.equal((await entrar('<script>')).json.valid, false);
  assert.match((await entrar('FIT-CCCC-DDDD')).json.error, /desactivado/);
  const otro = await entrar('FIT-EEEE-FFFF');
  assert.match(otro.json.error, /otro dispositivo/);
  assert.ok(!JSON.stringify(otro.json).includes('Carla'));
  assert.match((await entrar('FIT-MMMM-NNNN')).json.error, /mayores de 18/);
  assert.equal((await entrar('FIT-AAAA-BBBB', 'corto')).status, 400);
  assert.equal((await llamar(acceso, { method: 'GET' })).status, 405);
  assert.equal(hashes.size, 0, 'los rechazos no registran uso');
});

test('el iPhone se identifica como iOS (antes salía macOS)', () => {
  assert.equal(parseUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1').os, 'iOS');
  assert.equal(parseUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15').os, 'macOS');
  assert.equal(parseUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/156.0 Safari/537.36').browser, 'Chrome 156');
});

test('el admin ve el uso de entreno de cada código y al borrar el código se borra también', async () => {
  await entrar('FIT-AAAA-BBBB'); await entrar('FIT-AAAA-BBBB'); await entrar('FIT-AAAA-BBBB');
  const token = (await llamar(auth, { body: { password: process.env.ADMIN_PASSWORD } })).json.token;
  const r = await llamar(codes, { method: 'GET', headers: { authorization: 'Bearer ' + token } });
  const ana = r.json.codes.find((c) => c.code === 'FIT-AAAA-BBBB');
  assert.equal(ana.entreno.aperturas, 3);
  assert.ok(ana.entreno.ultimo_acceso);
  assert.equal(r.json.codes.find((c) => c.code === 'FIT-CCCC-DDDD').entreno, null);
  await llamar(codes, { body: { action: 'delete', code: 'FIT-AAAA-BBBB' }, headers: { authorization: 'Bearer ' + token } });
  assert.equal(hashes.has('entreno:FIT-AAAA-BBBB'), false);
});
