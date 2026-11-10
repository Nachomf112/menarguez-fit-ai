// Pruebas de M8 (autenticación del panel de administración) con Upstash simulado y datos ficticios.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import auth from '../api/admin-auth-fit.js';
import codes from '../api/get-codes-fit.js';
import access from '../api/get-access-fit.js';
import { crearToken, leerToken, igualesSeguro, DURACION_SESION_S } from '../api/_lib/admin.js';

const PASS = 'contrasena-ficticia-de-pruebas-123';
process.env.ADMIN_PASSWORD = PASS;
process.env.KV_REST_API_URL = 'https://kv.test';
process.env.KV_REST_API_TOKEN = 'token-ficticio';

let db, ttl, fallarKv;
beforeEach(() => {
  fallarKv = false;
  ttl = new Map();
  db = new Map([
    ['code:FIT-AAAA-BBBB', JSON.stringify({ nombre: 'Ana Ficticia', activo: true, expira: '2030-01-01', plan: 'free', fingerprint: 'd1:abc' })],
    ['profile:FIT-AAAA-BBBB', JSON.stringify({ peso: 60 })],
  ]);
});
globalThis.fetch = async (url, opts = {}) => {
  if (fallarKv) throw new Error('ECONNREFUSED kv.test:443 secreto-interno');
  const u = new URL(url);
  const [cmd, ...args] = u.pathname.split('/').slice(1).map(decodeURIComponent);
  const ok = (result) => ({ ok: true, json: async () => ({ result }) });
  switch (cmd) {
    case 'get': return ok(db.get(args[0]) ?? null);
    case 'set': db.set(args[0], args[1] ?? opts.body); if (args[2] === 'EX') ttl.set(args[0], Number(args[3])); return ok('OK');
    case 'incr': { const n = (Number(db.get(args[0])) || 0) + 1; db.set(args[0], String(n)); return ok(n); }
    case 'expire': ttl.set(args[0], Number(args[1])); return ok(1);
    case 'ttl': return ok(ttl.get(args[0]) ?? -1);
    case 'del': return ok(db.delete(args[0]) ? 1 : 0);
    case 'keys': return ok([...db.keys()].filter((k) => k.startsWith('code:FIT-')));
    case 'hgetall': return ok({});
    case 'lrange': return ok([]);
    default: return ok(null);
  }
};

const llamar = async (handler, { method = 'POST', body, token, ip = '203.0.113.7', query } = {}) => {
  let json = null, status = 0; const headers = {};
  const res = { setHeader(k, v) { headers[k.toLowerCase()] = v; }, status(s) { status = s; return this; }, json(j) { json = j; return this; }, end() { return this; } };
  const h = { 'x-real-ip': ip };
  if (token) h.authorization = 'Bearer ' + token;
  await handler({ method, body, headers: h, query: query || {} }, res);
  return { status, json, headers };
};
const entrar = async (ip) => (await llamar(auth, { body: { password: PASS }, ip })).json.token;

test('comparación en tiempo constante: correcta con longitudes distintas', () => {
  assert.equal(igualesSeguro('abc', 'abc'), true);
  assert.equal(igualesSeguro('abc', 'abcd'), false);
  assert.equal(igualesSeguro('', 'x'), false);
  assert.equal(igualesSeguro(undefined, 'x'), false);
});

test('el token caduca, no se puede alterar y deja de valer al cambiar la contraseña', () => {
  const t0 = Date.now();
  const t = crearToken(PASS, t0);
  assert.ok(leerToken(t, PASS, t0));
  assert.equal(leerToken(t, PASS, t0 + DURACION_SESION_S * 1000 + 1000), null);
  assert.equal(leerToken(t, 'otra-contrasena', t0), null);
  const [cuerpo, firma] = t.split('.');
  const datos = JSON.parse(Buffer.from(cuerpo, 'base64url').toString());
  const falso = Buffer.from(JSON.stringify({ ...datos, exp: datos.exp + 999999 })).toString('base64url');
  assert.equal(leerToken(`${falso}.${firma}`, PASS, t0), null);
  assert.equal(leerToken('basura', PASS, t0), null);
  assert.ok(!t.includes(PASS));
});

test('login correcto: devuelve token, sin CORS y sin caché', async () => {
  const r = await llamar(auth, { body: { password: PASS } });
  assert.equal(r.status, 200);
  assert.ok(r.json.token && r.json.expira);
  assert.ok(!JSON.stringify(r.json).includes(PASS));
  assert.equal(r.headers['access-control-allow-origin'], undefined);
  assert.equal(r.headers['cache-control'], 'no-store');
});

test('5 fallos por IP bloquean 15 min (también con la contraseña buena); otra IP no se ve afectada', async () => {
  for (let i = 0; i < 5; i++) assert.equal((await llamar(auth, { body: { password: 'mala' + i } })).status, 401);
  const r = await llamar(auth, { body: { password: PASS } });
  assert.equal(r.status, 429);
  assert.ok(Number(r.headers['retry-after']) > 0);
  assert.equal((await llamar(auth, { body: { password: PASS }, ip: '198.51.100.9' })).status, 200);
  // En Upstash no se guarda la IP en claro
  assert.ok(![...db.keys()].some((k) => k.includes('203.0.113.7')));
});

test('un acierto borra el contador de fallos', async () => {
  for (let i = 0; i < 4; i++) await llamar(auth, { body: { password: 'mala' } });
  assert.equal((await llamar(auth, { body: { password: PASS } })).status, 200);
  for (let i = 0; i < 4; i++) await llamar(auth, { body: { password: 'mala' } });
  assert.equal((await llamar(auth, { body: { password: PASS } })).status, 200);
});

test('las rutas de datos exigen token; la contraseña en cabecera ya no sirve', async () => {
  assert.equal((await llamar(codes, { method: 'GET' })).status, 401);
  assert.equal((await llamar(access, { method: 'GET' })).status, 401);
  let status = 0;
  const res = { setHeader() {}, status(s) { status = s; return this; }, json() { return this; }, end() { return this; } };
  await codes({ method: 'GET', headers: { 'x-admin-pass': PASS }, query: {} }, res);
  assert.equal(status, 401);
  const token = await entrar();
  const r = await llamar(codes, { method: 'GET', token });
  assert.equal(r.status, 200);
  assert.equal(r.json.codes[0].code, 'FIT-AAAA-BBBB');
  assert.equal((await llamar(access, { method: 'GET', token })).status, 200);
});

test('cerrar sesión revoca el token', async () => {
  const token = await entrar();
  assert.equal((await llamar(auth, { body: { action: 'logout' }, token })).status, 200);
  assert.equal((await llamar(codes, { method: 'GET', token })).status, 401);
});

test('acciones: validan código, valores y fecha; borrar elimina también el perfil', async () => {
  const token = await entrar();
  assert.equal((await llamar(codes, { token, body: { action: 'extend', code: 'FIT-AAAA/../x', expira: '2031-01-01' } })).status, 400);
  assert.equal((await llamar(codes, { token, body: { action: 'extend', code: 'FIT-AAAA-BBBB', expira: 'mañana' } })).status, 400);
  assert.equal((await llamar(codes, { token, body: { action: 'toggle_activo', code: 'FIT-AAAA-BBBB', activo: 'no' } })).status, 400);
  assert.equal((await llamar(codes, { token, body: { action: 'reset_fingerprint', code: 'FIT-ZZZZ-9999' } })).status, 404);
  assert.equal((await llamar(codes, { token, body: { action: 'inventada', code: 'FIT-AAAA-BBBB' } })).status, 400);

  assert.equal((await llamar(codes, { token, body: { action: 'reset_fingerprint', code: ' fit-aaaa-bbbb ' } })).status, 200);
  assert.equal(JSON.parse(db.get('code:FIT-AAAA-BBBB')).fingerprint, null);
  assert.equal((await llamar(codes, { token, body: { action: 'extend', code: 'FIT-AAAA-BBBB', expira: '2031-02-03' } })).status, 200);
  assert.equal(JSON.parse(db.get('code:FIT-AAAA-BBBB')).expira, '2031-02-03');
  assert.equal((await llamar(codes, { token, body: { action: 'delete', code: 'FIT-AAAA-BBBB' } })).status, 200);
  assert.equal(db.has('code:FIT-AAAA-BBBB'), false);
  assert.equal(db.has('profile:FIT-AAAA-BBBB'), false);
  assert.equal((await llamar(access, { token, body: { action: 'delete', idx: '0' } })).status, 400);
});

test('errores internos: mensaje genérico, sin detalles del servidor', async () => {
  const token = await entrar();
  fallarKv = true;
  for (const r of [await llamar(codes, { method: 'GET', token }), await llamar(auth, { body: { password: PASS } })]) {
    assert.ok(r.status >= 500);
    assert.ok(!/ECONNREFUSED|secreto|kv\.test/.test(JSON.stringify(r.json)));
  }
});
