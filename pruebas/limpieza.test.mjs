// Limpieza automática de datos antiguos (api/limpieza.js). Upstash simulado y datos ficticios.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import limpieza, { aMs, decidir, primerAntiguo } from '../api/limpieza.js';

process.env.KV_REST_API_URL = 'https://kv.test';
process.env.KV_REST_API_TOKEN = 'token-ficticio';
process.env.CRON_SECRET = 'secreto-cron-ficticio';

const hace = (dias) => new Date(Date.now() - dias * 86400000);
const iso = (dias) => hace(dias).toISOString().slice(0, 10);
const es = (dias) => hace(dias).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Madrid' });

let db, hashes, lista;
beforeEach(() => {
  hashes = new Map();
  db = new Map([
    // caducado hace 2 años, último acceso hace 400 días → se borra
    ['code:FIT-VIEJ-0001', JSON.stringify({ nombre: 'Viejo', expira: iso(730), fecha_registro: iso(732) })],
    ['profile:FIT-VIEJ-0001', JSON.stringify({ peso: 70 })],
    ['ultimo:FIT-VIEJ-0001', JSON.stringify(hace(400).toISOString())],
    // caducado hace 2 años pero entró en /entreno hace 10 días → se conserva
    ['code:FIT-ENTR-0002', JSON.stringify({ nombre: 'Entreno', expira: iso(730) })],
    // Pro activo (caduca dentro de 10 años) → se conserva
    ['code:FIT-PRO0-0003', JSON.stringify({ nombre: 'Pro', plan: 'pro', expira: '2036-01-01' })],
    // sin fechas → no se toca
    ['code:FIT-SINF-0004', JSON.stringify({ nombre: 'Sin fechas' })],
    // perfil huérfano
    ['profile:FIT-HUER-0005', JSON.stringify({ peso: 80 })],
  ]);
  hashes.set('entreno:FIT-ENTR-0002', new Map([['ultimo_acceso', hace(10).toISOString()]]));
  lista = [es(1), es(100), es(300), es(370), es(500)].map((fecha) => JSON.stringify(JSON.stringify({ code: 'FIT-X', fecha })));
});
globalThis.fetch = async (url) => {
  const [c, ...a] = new URL(url).pathname.split('/').slice(1).map(decodeURIComponent);
  const ok = (result) => ({ ok: true, json: async () => ({ result }) });
  switch (c) {
    case 'keys': { const pref = a[0].replace('*', ''); return ok([...db.keys(), ...hashes.keys()].filter((k) => k.startsWith(pref))); }
    case 'get': return ok(db.get(a[0]) ?? null);
    case 'hget': return ok(hashes.get(a[0])?.get(a[1]) ?? null);
    case 'del': return ok(db.delete(a[0]) || hashes.delete(a[0]) ? 1 : 0);
    case 'lrange': return ok(lista);
    case 'ltrim': lista = lista.slice(Number(a[1]), Number(a[2]) + 1); return ok('OK');
    default: return ok(null);
  }
};
const llamar = async (auth = 'Bearer secreto-cron-ficticio', query = {}) => {
  let status = 0, json = null;
  const res = { setHeader() {}, status(s) { status = s; return this; }, json(j) { json = j; return this; } };
  await limpieza({ method: 'GET', headers: auth ? { authorization: auth } : {}, query }, res);
  return { status, json };
};

test('fechas en formato ISO, español y entre comillas', () => {
  assert.equal(aMs('2026-01-31'), Date.UTC(2026, 0, 31));
  assert.equal(aMs('31/01/2026'), Date.UTC(2026, 0, 31));
  assert.equal(aMs('"2026-01-31T00:00:00.000Z"'), Date.UTC(2026, 0, 31));
  assert.equal(aMs(''), null);
  assert.equal(aMs('basura'), null);
  assert.equal(decidir({}, []), 'sin_fechas');
  assert.equal(primerAntiguo([JSON.stringify({ fecha: es(5) }), JSON.stringify({ fecha: es(400) })]), 1);
});

test('sin el secreto del cron no hace nada', async () => {
  assert.equal((await llamar(null)).status, 401);
  assert.equal((await llamar('Bearer otro')).status, 401);
  const guardado = process.env.CRON_SECRET; delete process.env.CRON_SECRET;
  assert.equal((await llamar()).status, 500);
  process.env.CRON_SECRET = guardado;
  assert.equal(db.size, 7);
});

test('simulación: cuenta lo que borraría sin borrar', async () => {
  const r = await llamar(undefined, { simular: '1' });
  assert.equal(r.status, 200);
  assert.equal(r.json.codigos_borrados, 1);
  assert.equal(db.has('code:FIT-VIEJ-0001'), true);
  assert.equal(lista.length, 5);
});

test('borra lo caducado y sin uso hace más de 12 meses, los huérfanos y los accesos antiguos; conserva el resto', async () => {
  const r = await llamar();
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { simulacion: false, codigos_revisados: 4, codigos_borrados: 1, codigos_sin_fechas: 1, huerfanos_borrados: 1, accesos_borrados: 2 });
  for (const k of ['code:FIT-VIEJ-0001', 'profile:FIT-VIEJ-0001', 'ultimo:FIT-VIEJ-0001', 'profile:FIT-HUER-0005']) assert.equal(db.has(k), false, k);
  for (const k of ['code:FIT-ENTR-0002', 'code:FIT-PRO0-0003', 'code:FIT-SINF-0004']) assert.equal(db.has(k), true, k);
  assert.equal(lista.length, 3);
  assert.ok(!JSON.stringify(r.json).includes('Viejo'), 'la respuesta no lleva datos personales');
});
