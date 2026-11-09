// Recorrido de cuenta y sincronización con un Supabase SIMULADO en memoria (sin red, sin datos reales).
// Uso: npm run build && node tests/e2e-cloud.mjs [carpeta_capturas]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { mkdirSync } from 'node:fs';
import { serve } from './serve.mjs';

const SHOTS = process.argv[2] || 'tests/shots';
mkdirSync(SHOTS, { recursive: true });
const server = serve(4318);
const SB = 'https://yosanpfxozkgspeftlgb.supabase.co';
const PUBLISHABLE = 'sb_publishable_PlnuoNIDMOsIKvazXL3szw_ndETA4Ft';

const results = [];
const check = (name, cond, extra = '') => { results.push({ name, ok: !!cond }); console.log(`${cond ? 'OK  ' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); };

// ── Supabase simulado ──
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (sub, aal = 'aal1') => `${b64u({ alg: 'HS256', typ: 'JWT' })}.${b64u({ sub, aal, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600, amr: [{ method: 'password', timestamp: 1 }] })}.c2lnbmF0dXJh`;
const subOf = (h) => { try { return JSON.parse(Buffer.from((h || '').replace('Bearer ', '').split('.')[1], 'base64url').toString()).sub; } catch { return null; } };
const db = {
  users: {
    u1: { id: 'u1', email: 'ana.ficticia@example.com', pw: 'Ficticia-Prueba-2026', factors: [] },
    u2: { id: 'u2', email: 'otra.ficticia@example.com', pw: 'Ficticia-Otra-2026', factors: [] },
    u3: { id: 'u3', email: 'mfa.ficticia@example.com', pw: 'Ficticia-Mfa-2026', factors: [{ id: 'f1', factor_type: 'totp', status: 'verified', friendly_name: 'App', created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-01T00:00:00Z' }] },
  },
  consentimientos: [
    { id: 1, user_id: 'u2', tipo: 'terminos', version: '2026-11', aceptado: true, creado_en: '2026-11-01T00:00:00Z' },
    { id: 2, user_id: 'u2', tipo: 'datos_salud', version: '2026-11', aceptado: true, creado_en: '2026-11-01T00:00:01Z' },
  ],
  atletas: [],
  log: [],
  signups: [],
  rpc: [],
};
let seq = 10;
const userJson = (u) => ({ id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, email_confirmed_at: '2026-11-01T00:00:00Z', app_metadata: { provider: 'email' }, user_metadata: {}, identities: [{}], factors: u.factors, created_at: '2026-11-01T00:00:00Z' });

async function fakeSupabase(route) {
  const req = route.request();
  const url = new URL(req.url());
  const method = req.method();
  const json = (status, body, extra = {}) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', ...extra }, body: body === undefined ? '' : JSON.stringify(body) });
  if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
  const h = req.headers();
  const sub = subOf(h.authorization);
  db.log.push({ method, path: url.pathname, apikey: h.apikey, sub });
  const body = req.postData() ? JSON.parse(req.postData()) : null;
  const p = url.pathname;

  if (p === '/auth/v1/signup') { db.signups.push(body); return json(200, { id: 'nuevo', email: body.email, identities: [] }); }
  if (p === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password') {
    const u = Object.values(db.users).find((x) => x.email === body.email && x.pw === body.password);
    if (!u) return json(400, { code: 'invalid_credentials', error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
    return json(200, { access_token: jwt(u.id), token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r-' + u.id, user: userJson(u) });
  }
  if (p === '/auth/v1/user') { const u = db.users[sub]; return u ? json(200, userJson(u)) : json(401, { code: 'session_not_found', msg: 'no session' }); }
  if (p === '/auth/v1/logout') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
  if (p === '/auth/v1/recover') return json(200, {});

  if (!sub || !db.users[sub]) return json(401, { message: 'JWT inválido' });
  if (p === '/rest/v1/rpc/eliminar_mi_cuenta') {
    db.rpc.push(sub);
    delete db.users[sub];
    db.atletas = db.atletas.filter((a) => a.owner_id !== sub);
    db.consentimientos = db.consentimientos.filter((c) => c.user_id !== sub);
    return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
  }
  const table = p.replace('/rest/v1/', '');
  if (!['consentimientos', 'atletas'].includes(table)) return json(404, {});
  const ownerKey = table === 'atletas' ? 'owner_id' : 'user_id';
  const single = (h.accept || '').includes('vnd.pgrst.object');
  const mine = () => db[table].filter((r) => r[ownerKey] === sub);
  const idEq = url.searchParams.get('id')?.replace(/^eq\./, '');
  const consent = () => { const c = db.consentimientos.filter((x) => x.user_id === sub && x.tipo === 'datos_salud').at(-1); return !!c?.aceptado; };
  if (method === 'GET') {
    let rows = mine();
    if (table === 'consentimientos') rows = [...rows].reverse();
    return json(200, rows);
  }
  if (method === 'POST') {
    if (table === 'atletas' && !consent()) return json(403, { code: '42501', message: 'new row violates row-level security policy' });
    if (table === 'atletas' && mine().length >= 5) return json(400, { code: 'P0001', message: 'Límite de 5 perfiles por cuenta alcanzado' });
    const row = { ...body, id: table === 'atletas' ? `row-${++seq}` : ++seq, [ownerKey]: sub, creado_en: new Date().toISOString() };
    db[table].push(row);
    return json(201, single ? row : [row]);
  }
  if (method === 'PATCH' && table === 'atletas') {
    if (!consent()) return json(403, { code: '42501', message: 'new row violates row-level security policy' });
    const rows = mine().filter((r) => r.id === idEq);
    rows.forEach((r) => Object.assign(r, body));
    return json(200, rows);
  }
  if (method === 'DELETE' && table === 'atletas') {
    const before = db.atletas.length;
    db.atletas = db.atletas.filter((r) => !(r.owner_id === sub && (idEq ? r.id === idEq : true)));
    return json(200, [], { 'x-deleted': String(before - db.atletas.length) });
  }
  return json(405, { message: 'no permitido' });
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
const terceros = [];
await ctx.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`)); });
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/ERR_|net::|status of 4\d\d/.test(m.text())) errors.push(m.text()); });
await ctx.route('**/*', (route) => {
  const url = route.request().url();
  if (!url.startsWith('http://localhost') && !url.startsWith('https://yosanpfxozkgspeftlgb.supabase.co')) terceros.push(url);
  if (url.startsWith(SB)) return fakeSupabase(route);
  if (url.startsWith('http://localhost:4318')) return route.continue();
  return route.abort();
});
const shot = (n) => page.screenshot({ path: `${SHOTS}/${n}.png`, fullPage: true });
const wait = (ms) => page.waitForTimeout(ms);
const login = async (email, pw) => {
  await page.getByRole('button', { name: 'Entrar', exact: true }).first().click();
  await page.fill('#acc-email', email);
  await page.fill('#acc-pw', pw);
  await page.locator('form').getByRole('button', { name: 'Entrar', exact: true }).click();
};

// 1. Perfil real y demo en el navegador, sin cuenta
await page.goto('http://localhost:4318/');
await page.getByRole('heading', { name: /Es avanzar/i }).waitFor();
check('sin sesión no se llama a la API de datos', !db.log.some((l) => l.path.startsWith('/rest/')));
await page.getByRole('button', { name: 'Ver perfil de demostración' }).click();
await page.evaluate(() => {
  const k = 'menarguez-fit-ia:v1';
  const s = JSON.parse(localStorage.getItem(k));
  const demo = s.perfiles['demo-laura'];
  const real = structuredClone(demo);
  real.profile.id = 'perfil-real'; real.profile.demo = false; real.profile.nombre = 'Ana ficticia';
  s.perfiles['perfil-real'] = real; s.activeProfileId = 'perfil-real';
  localStorage.setItem(k, JSON.stringify(s));
});
await page.reload();
await page.locator('#btn-cuenta').waitFor();
check('botón de cuenta visible en el entorno permitido', await page.locator('#btn-cuenta').getAttribute('aria-label') === 'Entrar o crear cuenta');

// 2. Crear cuenta
await page.locator('#btn-cuenta').click();
await page.getByRole('heading', { name: 'Tu cuenta' }).waitFor();
check('aviso de entorno de pruebas', await page.getByText('Usa solo datos ficticios').isVisible());
await shot('c01-cuenta-entrar');
await page.getByRole('button', { name: 'Crear cuenta', exact: true }).first().click();
await page.fill('#acc-email', 'ana.ficticia@example.com');
await page.fill('#acc-pw', 'corta');
check('muestra requisitos de contraseña', /al menos 12 caracteres/.test(await page.locator('#acc-pw-req').innerText()));
await page.fill('#acc-pw', 'Ficticia-Prueba-2026');
await page.fill('#acc-pw2', 'Ficticia-Prueba-2026');
await page.locator('form').getByRole('button', { name: 'Crear cuenta' }).click();
check('exige aceptar condiciones y mayoría de edad', await page.getByText('mayor de 18 años y aceptar').isVisible());
await page.check('#acc-terminos');
await shot('c02-crear-cuenta');
await page.locator('form').getByRole('button', { name: 'Crear cuenta' }).click();
await page.getByText('Si el correo es válido').waitFor();
check('registro enviado con redirección a la app', db.signups.length === 1 && db.signups[0].email === 'ana.ficticia@example.com');
check('la contraseña no se guarda en el navegador', !(await page.evaluate(() => JSON.stringify(localStorage))).includes('Ficticia-Prueba-2026'));

// 3. Entrar: términos aceptados al registrarse → pide consentimiento de salud
await page.getByRole('button', { name: 'Entrar', exact: true }).first().click();
await page.fill('#acc-email', 'ana.ficticia@example.com');
await page.fill('#acc-pw', 'Mala-Contrasena-1');
await page.locator('form').getByRole('button', { name: 'Entrar', exact: true }).click();
await page.getByText('Correo o contraseña incorrectos.').waitFor();
check('contraseña incorrecta: mensaje genérico', true);
await page.fill('#acc-pw', 'Ficticia-Prueba-2026');
await page.locator('form').getByRole('button', { name: 'Entrar', exact: true }).click();
await page.getByRole('heading', { name: 'Guardar tus datos en la cuenta' }).waitFor();
check('términos registrados automáticamente', db.consentimientos.some((c) => c.user_id === 'u1' && c.tipo === 'terminos' && c.aceptado));
check('sin consentimiento no se sube nada', db.atletas.length === 0);
await shot('c03-consentimiento');

// 4. Consentimiento → decidir sobre los perfiles locales → subir
await page.check('#acc-salud');
await page.getByRole('button', { name: 'Activar sincronización' }).click();
await page.getByRole('heading', { name: /solo en este navegador/ }).waitFor();
await shot('c04-decidir');
await page.getByRole('button', { name: 'Subir y combinar' }).click();
await page.locator('#acc-sync').filter({ hasText: 'Sincronizado' }).waitFor();
check('consentimiento de salud registrado', db.consentimientos.some((c) => c.user_id === 'u1' && c.tipo === 'datos_salud' && c.aceptado));
check('sube el perfil real', db.atletas.length === 1 && db.atletas[0].datos.profile.id === 'perfil-real' && db.atletas[0].owner_id === 'u1');
check('no sube el perfil de demostración', !db.atletas.some((a) => a.datos.profile.demo));
await shot('c05-sincronizado');
check('el icono de cuenta indica sincronizado', await page.locator('#btn-cuenta').getAttribute('aria-label') === 'Cuenta: sincronizada');
const solape = await page.evaluate(() => { const a = document.querySelector('.topbar .brand').getBoundingClientRect(); const b = document.querySelector('.topbar .badge'); if (!b) return false; return b.getBoundingClientRect().left < a.right - 1; });
check('el nombre del perfil no se solapa con la marca', !solape);

// 5. Un cambio local se sube solo
const patches = () => db.log.filter((l) => l.method === 'PATCH').length;
const before = patches();
await page.evaluate(() => { location.hash = '#ejercicios'; });
await page.locator('.iconbtn[aria-pressed]').first().click();
await wait(2500);
check('un cambio se sincroniza automáticamente', patches() === before + 1 && db.atletas[0].datos.favoritos.length > 0);
check('todas las llamadas usan la clave publicable', db.log.every((l) => !l.apikey || l.apikey === PUBLISHABLE));

// 6. Cerrar sesión conservando datos y entrar con OTRA cuenta → no se mezclan
await page.evaluate(() => { location.hash = '#cuenta'; });
await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
await page.getByRole('button', { name: 'He olvidado la contraseña' }).waitFor();
const filasAntes = db.atletas.length;
await login('otra.ficticia@example.com', 'Ficticia-Otra-2026');
await page.getByRole('heading', { name: 'Este navegador tiene datos de otra cuenta' }).waitFor();
check('detecta datos de otra cuenta y no los sube', db.atletas.length === filasAntes && !db.atletas.some((a) => a.owner_id === 'u2'));
await shot('c06-otra-cuenta');
await page.getByRole('button', { name: 'Cancelar y salir' }).click();
await page.getByRole('button', { name: 'He olvidado la contraseña' }).waitFor();
check('cancelar conserva los datos locales', await page.evaluate(() => 'perfil-real' in JSON.parse(localStorage.getItem('menarguez-fit-ia:v1')).perfiles));

// 7. MFA: cuenta con app de autenticación → pide código
await login('mfa.ficticia@example.com', 'Ficticia-Mfa-2026');
await page.getByRole('heading', { name: 'Verificación en dos pasos' }).waitFor();
check('con MFA activada pide el código antes de leer datos', !db.log.some((l) => l.path.startsWith('/rest/') && l.sub === 'u3') && await page.locator('#acc-mfa').isVisible());
await shot('c07-mfa');
await page.getByRole('button', { name: 'Cancelar y salir' }).click();
await page.getByRole('button', { name: 'He olvidado la contraseña' }).waitFor();

// 8. Volver a la cuenta 1 en otro "dispositivo": se cargan los datos de la cuenta
await page.evaluate(() => { localStorage.removeItem('menarguez-fit-ia:v1'); localStorage.removeItem('menarguez-fit-ia:nube:ultimo'); Object.keys(localStorage).filter((k) => k.startsWith('menarguez-fit-ia:nube:')).forEach((k) => localStorage.removeItem(k)); });
await page.reload();
await page.locator('#btn-cuenta').click();
await login('ana.ficticia@example.com', 'Ficticia-Prueba-2026');
await page.locator('#acc-sync').filter({ hasText: 'Sincronizado' }).waitFor();
check('en un navegador vacío descarga los perfiles de la cuenta', await page.evaluate(() => 'perfil-real' in JSON.parse(localStorage.getItem('menarguez-fit-ia:v1')).perfiles));

// 9. Eliminar la cuenta
await page.getByRole('button', { name: 'Eliminar mi cuenta' }).click();
await page.fill('#acc-confirm', 'BORRAR');
await shot('c08-eliminar');
await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
await page.getByText('Cuenta eliminada').waitFor();
check('eliminar cuenta llama a la función y borra sus datos', db.rpc.includes('u1') && !db.atletas.some((a) => a.owner_id === 'u1'));
check('borra también los datos del navegador si se marca', await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('menarguez-fit-ia:v1')).perfiles).length === 0));
check('la sesión desaparece del navegador', await page.evaluate(() => !localStorage.getItem('menarguez-fit-ia:auth')));

// 10. Escritorio
await page.setViewportSize({ width: 1280, height: 860 });
await page.evaluate(() => { location.hash = '#cuenta'; });
await shot('c09-escritorio');
const o = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
check('sin scroll horizontal en escritorio', o <= 1);

const csp = await page.evaluate(() => window.__csp);
check('la política de seguridad (CSP) no bloquea nada de la app', csp.length === 0, csp.join(' | '));
check('no se cargan recursos de terceros', terceros.length === 0, terceros.slice(0, 3).join(' | '));
const cab = await page.evaluate(async () => { const r = await fetch('/'); return { csp: r.headers.get('content-security-policy') || '', xfo: r.headers.get('x-frame-options') }; });
check('cabeceras de seguridad presentes', cab.csp.includes("default-src 'none'") && cab.xfo === 'DENY');
check('sin errores de JavaScript', errors.length === 0, errors.join(' | '));
await browser.close();
server.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} comprobaciones superadas`);
process.exit(failed.length ? 1 : 0);
