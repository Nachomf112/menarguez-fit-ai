// Alta desde Tally: un correo, un código. Upstash y Make simulados, datos ficticios.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import handler, { claveEmail } from '../api/tally-webhook.js';

const SECRETO = 'secreto-tally-ficticio';
process.env.TALLY_SIGNING_SECRET = SECRETO;
process.env.MAKE_WEBHOOK_FREE = 'https://make.test/hook';
process.env.KV_REST_API_URL = 'https://kv.test';
process.env.KV_REST_API_TOKEN = 'token-ficticio';

let db, avisos;
beforeEach(() => { db = new Map(); avisos = []; });
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(url);
  if (u.hostname === 'make.test') { avisos.push(JSON.parse(opts.body)); return { ok: true, json: async () => ({}) }; }
  const [cmd, ...a] = u.pathname.split('/').slice(1).map(decodeURIComponent);
  const ok = (result) => ({ ok: true, json: async () => ({ result }) });
  if (cmd === 'exists') return ok(db.has(a[0]) ? 1 : 0);
  if (cmd === 'get') return ok(db.get(a[0]) ?? null);
  if (cmd === 'set') { db.set(a[0], opts.body); return ok('OK'); }
  if (cmd === 'keys') { const pref = a[0].replace('*', ''); return ok([...db.keys()].filter((k) => k.startsWith(pref))); }
  return ok(null);
};

const enviar = async (email, nombre = 'Ficticio', id = crypto.randomUUID()) => {
  const raw = Buffer.from(JSON.stringify({ eventId: id, data: { submissionId: id, fields: [
    { label: 'Nombre', value: nombre }, { label: 'Email', value: email }, { label: '¿Como nos conociste?', value: 'Amigo' },
  ] } }));
  const firma = crypto.createHmac('sha256', SECRETO).update(raw).digest('base64');
  const req = { method: 'POST', headers: { 'tally-signature': firma }, async *[Symbol.asyncIterator]() { yield raw; } };
  let status = 0, json = null;
  const res = { status(s) { status = s; return this; }, json(j) { json = j; return this; }, setHeader() {} };
  await handler(req, res);
  return { status, json };
};
const codigos = () => [...db.keys()].filter((k) => k.startsWith('code:'));

test('primera alta: crea el código, el índice por correo (sin el correo en claro) y avisa a Make', async () => {
  const r = await enviar('ana@example.com', 'Ana');
  assert.equal(r.status, 200);
  assert.equal(codigos().length, 1);
  assert.equal(avisos.length, 1);
  assert.match(avisos[0].codigo, /^FIT-/);
  const indice = claveEmail('ana@example.com', SECRETO);
  assert.ok(db.has(indice));
  assert.ok(!indice.includes('ana') && !indice.includes('example'));
});

test('segunda alta con el mismo correo (mayúsculas y espacios incluidos): mismo código, sin crear otro', async () => {
  await enviar('ana@example.com', 'Ana');
  const primero = avisos[0].codigo;
  const r = await enviar('  ANA@Example.com ', 'Ana otra vez');
  assert.equal(r.status, 200);
  assert.equal(r.json.repetido, true);
  assert.equal(codigos().length, 1);
  assert.equal(avisos[1].codigo, primero);
  assert.equal(avisos[1].repetido, true);
});

test('alta anterior al índice (código antiguo sin índice): también la reconoce por el correo', async () => {
  db.set('code:FIT-ANTI-GUO1', JSON.stringify({ nombre: 'Beto', email: 'beto@example.com', plan: 'free', expira: '2026-11-01', activo: true }));
  const r = await enviar('beto@example.com', 'Beto');
  assert.equal(r.json.repetido, true);
  assert.equal(avisos[0].codigo, 'FIT-ANTI-GUO1');
  assert.equal(avisos[0].expira, '2026-11-01', 'no se renueva el periodo gratuito');
  assert.equal(codigos().length, 1);
  assert.ok(db.has(claveEmail('beto@example.com', SECRETO)), 'deja creado el índice');
});

test('si el código del índice se borró (admin o limpieza), se crea uno nuevo', async () => {
  await enviar('carla@example.com', 'Carla');
  const viejo = avisos[0].codigo;
  db.delete(`code:${viejo}`);
  const r = await enviar('carla@example.com', 'Carla');
  assert.equal(r.json.repetido, undefined);
  assert.notEqual(avisos[1].codigo, viejo);
  assert.equal(codigos().length, 1);
});

test('correos distintos: códigos distintos', async () => {
  await enviar('uno@example.com'); await enviar('dos@example.com');
  assert.equal(codigos().length, 2);
  assert.notEqual(avisos[0].codigo, avisos[1].codigo);
});

test('firma no válida: no crea nada', async () => {
  const raw = Buffer.from('{}');
  const req = { method: 'POST', headers: { 'tally-signature': 'mala' }, async *[Symbol.asyncIterator]() { yield raw; } };
  let status = 0;
  await handler(req, { status(s) { status = s; return this; }, json() { return this; }, setHeader() {} });
  assert.equal(status, 401);
  assert.equal(db.size, 0);
});
