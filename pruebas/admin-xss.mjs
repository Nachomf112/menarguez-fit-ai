// Prueba C1: datos maliciosos de usuarios NO se ejecutan en el panel de administración.
// Uso (desde la raíz del repo): NODE_PATH=<ruta a node_modules con playwright> node pruebas/admin-xss.mjs
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
const { chromium } = createRequire(import.meta.url)('playwright');

const html = readFileSync('public/admin.html');
const server = createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(html); }).listen(4320);

const P1 = '<img src=x onerror="window.__pwned=1">';
const P2 = '"><svg onload="window.__pwned=2">';
const P3 = "x');window.__pwned=3;('";
const P4 = '`${window.__pwned=4}`';
const users = [
  { nombre: P1, email: P2, code: P3, plan: 'free', expira: P4, activo: true, usos_usados: 25,
    dispositivo: { tipo: P1, os: P2, browser: P1, ip: P2 }, fecha_registro: P1, ubicacion: { ciudad: P1, pais: P2 } },
  { nombre: 'Ana Ficticia', email: 'ana@example.com', code: 'FIT-TEST-0001', plan: 'pro', expira: '2030-01-01', activo: true, usos_usados: 3, dispositivo: { tipo: 'móvil' } },
];
const accesos = [{ fecha: P1, hora: P2, nombre: P1, code: P3, tipo: P1, os: P2, browser: P1, ip: P2 }];

const results = [];
const check = (n, c, e = '') => { results.push(!!c); console.log(`${c ? 'OK  ' : 'FAIL'} ${n}${e ? ' — ' + e : ''}`); };

const browser = await chromium.launch();
const page = await browser.newPage();
const dialogs = [];
page.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss(); });
let codesPost = null, caducada = false;
const cabecerasVistas = [];
await page.route('**/*', async (route) => {
  const u = new URL(route.request().url());
  if (u.hostname === 'cdnjs.cloudflare.com') return route.fulfill({ contentType: 'application/javascript', body: 'window.Chart = class { constructor(){} destroy(){} update(){} };' });
  if (u.pathname === '/api/admin-auth-fit') return route.fulfill({ contentType: 'application/json', body: '{"ok":true,"token":"token.ficticio"}' });
  if (u.pathname.startsWith('/api/')) cabecerasVistas.push(route.request().headers());
  if (caducada) return route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"Sesión no válida o caducada"}' });
  if (u.pathname === '/api/get-codes-fit') {
    if (route.request().method() === 'POST') { codesPost = JSON.parse(route.request().postData()); return route.fulfill({ contentType: 'application/json', body: '{"ok":true}' }); }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(u.searchParams.get('stats') ? { statsDaily: {} } : { codes: users }) });
  }
  if (u.pathname === '/api/get-access-fit') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ accesos }) });
  if (u.hostname === 'localhost') return route.continue();
  return route.abort();
});
await page.goto('http://localhost:4320/');
await page.fill('#adminPass', 'contrasena-ficticia');
await page.click('text=Acceder');
await page.waitForFunction(() => document.querySelectorAll('#tablaUsuarios tr').length === 2);
await page.waitForTimeout(500);
await page.evaluate(() => { document.getElementById('tabUsuarios').style.display = 'block'; document.getElementById('tabAccesos').style.display = 'block'; });
await page.evaluate(() => openInforme());
await page.waitForTimeout(300);

check('ningún script inyectado se ejecuta', !(await page.evaluate(() => window.__pwned)), String(await page.evaluate(() => window.__pwned)));
check('no se crean etiquetas <img>/<svg> desde los datos', (await page.locator('#tablaUsuarios img, #tablaUsuarios svg, #tablaAccesos img, #tablaAccesos svg, #informeLimite img').count()) === 0);
check('el nombre malicioso se muestra como texto literal', (await page.locator('#tablaUsuarios').innerText()).includes('<img src=x onerror='));
check('el informe también lo muestra como texto', (await page.locator('#informeLimite').innerText()).includes('<img src=x'));

// Los botones siguen funcionando y envían el código exacto, aunque tenga comillas
await page.evaluate(() => document.getElementById('modalInforme').classList.remove('open'));
await page.evaluate(() => [...document.querySelectorAll('#tablaUsuarios tr')[0].querySelectorAll('button')].find((b) => /activar/i.test(b.textContent)).click());
await page.waitForTimeout(300);
check('el botón Activar/Desactivar envía el código exacto', codesPost && codesPost.code === P3 && codesPost.activo === false, JSON.stringify(codesPost));
check('sin diálogos inesperados (alert)', dialogs.length === 0, dialogs.join(' | '));

// Exportación CSV: sin fórmulas ejecutables
const csv = await page.evaluate(() => { let out = ''; const a = document.createElement; document.createElement = function (t) { const el = a.call(document, t); if (t === 'a') el.click = () => { out = decodeURIComponent(el.href.split(',').slice(1).join(',')); }; return el; }; exportCSV(); document.createElement = a; return out; });
check('el CSV escapa comillas', csv.includes('""'));

// M8: el panel usa el token, nunca envía ni guarda la contraseña
check('las peticiones llevan el token de sesión', cabecerasVistas.length > 0 && cabecerasVistas.every((h) => h.authorization === 'Bearer token.ficticio'));
check('ninguna petición envía la contraseña en cabecera', cabecerasVistas.every((h) => !('x-admin-pass' in h)));
check('la contraseña no queda guardada en el navegador', !(await page.evaluate(() => JSON.stringify({ ...sessionStorage }) + JSON.stringify({ ...localStorage }))).includes('contrasena-ficticia'));
caducada = true;
await page.evaluate(() => loadAll());
await page.waitForTimeout(300);
check('si la sesión caduca, vuelve a la pantalla de acceso', await page.locator('#loginScreen').isVisible() && (await page.locator('#loginError').innerText()).includes('caducado'));

await browser.close(); server.close();
const fail = results.filter((r) => !r).length;
console.log(`\n${results.length - fail}/${results.length} comprobaciones superadas`);
process.exit(fail ? 1 : 0);
