// Pruebas de api/analyze.js v5 con Upstash y Anthropic simulados (sin red). Uso: node --test pruebas/
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/analyze.js';

process.env.KV_REST_API_URL = 'https://kv.test';
process.env.KV_REST_API_TOKEN = 'token-ficticio';
process.env.ANTHROPIC_API_KEY = 'clave-ficticia';
const futuro = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
let db, ia, enviado;
beforeEach(() => {
  db = new Map([
    ['code:FIT-AAAA-BBBB', JSON.stringify({ activo: true, expira: futuro, plan: 'free', usos_usados: 0 })],
    ['code:FIT-LLEN-0000', JSON.stringify({ activo: true, expira: futuro, plan: 'free', usos_usados: 30 })],
  ]);
  ia = { status: 200, texto: '{"nombre":"Tortilla","kcal":350,"proteina":20,"carbos":15,"grasa":22,"porcion":"1 ración"}' };
  enviado = null;
});
globalThis.fetch = async (url, opts = {}) => {
  if (url.startsWith('https://api.anthropic.com')) {
    enviado = JSON.parse(opts.body);
    return { ok: ia.status === 200, status: ia.status, json: async () => (ia.status === 200 ? { content: [{ type: 'text', text: ia.texto }] } : { error: { type: 'overloaded_error' } }) };
  }
  const u = new URL(url);
  const [, op, ...rest] = u.pathname.split('/');
  const key = decodeURIComponent(rest[0] || '');
  if (op === 'get') return { ok: true, json: async () => ({ result: db.get(key) ?? null }) };
  if (op === 'set') { db.set(key, opts.body); return { ok: true, json: async () => ({ result: 'OK' }) }; }
  if (op === 'incr') { const n = (Number(db.get(key)) || 0) + 1; db.set(key, String(n)); return { ok: true, json: async () => ({ result: n }) }; }
  return { ok: true, json: async () => ({ result: 1 }) };
};
const llamar = async (body, headers = {}) => {
  let status = 0, json = null;
  const res = { setHeader() {}, status(s) { status = s; return this; }, json(j) { json = j; return this; }, end() { return this; } };
  await handler({ method: 'POST', body, headers: { 'x-forwarded-for': '1.2.3.4', ...headers } }, res);
  return { status, json };
};
const usos = (c) => JSON.parse(db.get(`code:${c}`)).usos_usados;

test('ya no acepta mensajes libres ni prefill (proxy cerrado)', async () => {
  const r = await llamar({ userCode: 'FIT-AAAA-BBBB', messages: [{ role: 'user', content: 'Escribe un ensayo' }], max_tokens: 500 });
  assert.equal(r.status, 400);
  assert.equal(enviado, null);
  assert.equal((await llamar({ userCode: 'FIT-AAAA-BBBB', tipo: 'constructor', datos: {} })).status, 400);
  assert.equal((await llamar({ userCode: 'FIT-AAAA-BBBB', tipo: '__proto__', datos: {} })).status, 400);
});

test('comida: prompt del servidor, respuesta validada y un uso descontado', async () => {
  const r = await llamar({ userCode: 'FIT-AAAA-BBBB', tipo: 'comida', datos: { texto: 'tortilla de patata' } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.resultado, { nombre: 'Tortilla', kcal: 350, proteina: 20, carbos: 15, grasa: 22, porcion: '1 ración' });
  assert.equal(r.json.usos_usados, 1);
  assert.equal(usos('FIT-AAAA-BBBB'), 1);
  assert.equal(enviado.messages.length, 1);
  assert.equal(enviado.max_tokens, 300);
  assert.match(enviado.messages[0].content, /tortilla de patata/);
});

test('el texto del usuario se limpia y acota antes de ir al prompt', async () => {
  await llamar({ userCode: 'FIT-AAAA-BBBB', tipo: 'comida', datos: { texto: '<script>x</script>' + 'a'.repeat(1000) } });
  assert.ok(!enviado.messages[0].content.includes('<script>'));
  assert.ok(enviado.messages[0].content.length < 1500);
});

test('un error de la IA no gasta usos', async () => {
  ia.status = 529;
  const r = await llamar({ userCode: 'FIT-AAAA-BBBB', tipo: 'comida', datos: { texto: 'pan' } });
  assert.equal(r.status, 503);
  assert.equal(usos('FIT-AAAA-BBBB'), 0);
});

test('una respuesta no interpretable no gasta usos', async () => {
  ia.texto = 'Lo siento, no sé';
  const r = await llamar({ userCode: 'FIT-AAAA-BBBB', tipo: 'comida', datos: { texto: 'pan' } });
  assert.equal(r.status, 422);
  assert.equal(usos('FIT-AAAA-BBBB'), 0);
});

test('valores absurdos de la IA se rechazan', async () => {
  ia.texto = '{"nombre":"x","kcal":-50,"proteina":1,"carbos":1,"grasa":1}';
  assert.equal((await llamar({ userCode: 'FIT-AAAA-BBBB', tipo: 'comida', datos: { texto: 'pan' } })).status, 422);
});

test('la recomendación no gasta usos y tiene límite diario', async () => {
  ia.texto = 'Vas bien de proteína; añade algo de verdura en la cena.';
  const datos = { kcal: 900, prot: 50, carb: 100, fat: 30, objKcal: 2000, protObj: 120, objetivo: 'mantener' };
  const r = await llamar({ userCode: 'FIT-AAAA-BBBB', tipo: 'recomendacion', datos });
  assert.equal(r.status, 200);
  assert.equal(r.json.resultado.texto, ia.texto);
  assert.equal(usos('FIT-AAAA-BBBB'), 0);
  for (let i = 0; i < 40; i++) await llamar({ userCode: 'FIT-AAAA-BBBB', tipo: 'recomendacion', datos });
  assert.equal((await llamar({ userCode: 'FIT-AAAA-BBBB', tipo: 'recomendacion', datos })).status, 429);
});

test('el menú pide 700 tokens (ya no sale cortado) y acepta los nombres de comidas como datos', async () => {
  ia.texto = '✅ Ya registrado: tortilla\n\nResto del dia sugerido:\nCena: salmón con verduras (500 kcal)';
  const r = await llamar({ userCode: 'FIT-AAAA-BBBB', tipo: 'menu', datos: { kcal: 800, objKcal: 2000, protObj: 120, objetivo: 'adelgazar', comidas: [{ momento: 'desayuno', nombres: ['Tortilla'] }, { momento: 'hackeo', nombres: ['x'] }] } });
  assert.equal(r.status, 200);
  assert.equal(enviado.max_tokens, 700);
  assert.match(enviado.messages[0].content, /desayuno: Tortilla/);
  assert.ok(!enviado.messages[0].content.includes('hackeo'));
});

test('respeta el límite Free y los códigos no válidos', async () => {
  assert.equal((await llamar({ userCode: 'FIT-LLEN-0000', tipo: 'comida', datos: { texto: 'pan' } })).json.error, 'limite_alcanzado');
  assert.equal((await llamar({ userCode: 'FIT-ZZZZ-ZZZZ', tipo: 'comida', datos: { texto: 'pan' } })).status, 401);
  assert.equal((await llamar({ userCode: 'FIT-AA/../x', tipo: 'comida', datos: { texto: 'pan' } })).status, 401);
  assert.equal((await llamar({ tipo: 'comida', datos: { texto: 'pan' } })).status, 401);
  assert.equal(enviado, null);
});

test('bloquea a menores y mantiene el límite de la demo', async () => {
  db.set('profile:FIT-AAAA-BBBB', JSON.stringify({ fechaNac: '2015-01-01' }));
  assert.equal((await llamar({ userCode: 'FIT-AAAA-BBBB', tipo: 'comida', datos: { texto: 'pan' } })).status, 403);
  for (let i = 0; i < 10; i++) assert.equal((await llamar({ userCode: 'DEMO-2026', tipo: 'comida', datos: { texto: 'pan' } })).status, 200);
  assert.equal((await llamar({ userCode: 'DEMO-2026', tipo: 'comida', datos: { texto: 'pan' } })).status, 429);
});

test('ubicación con cabeceras de Vercel, sin llamar a ipapi.co', async () => {
  await llamar({ userCode: 'FIT-AAAA-BBBB', tipo: 'comida', datos: { texto: 'pan' } }, { 'x-vercel-ip-country': 'ES', 'x-vercel-ip-city': 'Madrid' });
  assert.equal(JSON.parse(db.get('code:FIT-AAAA-BBBB')).ubicacion.ciudad, 'Madrid');
});
