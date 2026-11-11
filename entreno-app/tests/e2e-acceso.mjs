// Pantalla de acceso con el código de Fit AI, en el dominio real (servido en local y con la API simulada).
// Uso: npm run build && node tests/e2e-acceso.mjs [carpeta_capturas]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { extname, join } from 'node:path';

const SHOTS = process.argv[2] || 'tests/shots';
mkdirSync(SHOTS, { recursive: true });
const CAB = JSON.parse(readFileSync('deploy/headers.json', 'utf8')).headers;
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' };

const results = [];
const check = (name, cond, extra = '') => { results.push({ name, ok: !!cond }); console.log(`${cond ? 'OK  ' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); };

let modo = 'ok';            // respuesta de la API simulada: ok | mal | otro | sinred
const peticiones = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
await ctx.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`)); });
await ctx.route('**/*', async (route) => {
  const u = new URL(route.request().url());
  if (u.hostname !== 'fit.menarguez-ia.com') return route.abort();
  if (u.pathname === '/api/entreno-acceso') {
    peticiones.push(JSON.parse(route.request().postData() || '{}'));
    if (modo === 'sinred') return route.abort('internetdisconnected');
    const body = modo === 'ok' ? { valid: true, nombre: 'Ficticio', plan: 'free' }
      : modo === 'otro' ? { valid: false, error: 'Este código ya está en uso en otro dispositivo. Si has cambiado de dispositivo, escribe a info@imenarguez-ia.com' }
      : { valid: false, error: 'Código no encontrado. Revisa que esté bien escrito.' };
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  }
  let ruta = u.pathname.replace(/^\/entreno\/?/, '') || 'index.html';
  const f = join('dist/entreno', ruta);
  if (!existsSync(f)) return route.fulfill({ status: 404, body: '' });
  const headers = { 'content-type': TIPOS[extname(f)] || 'application/octet-stream' };
  for (const h of CAB) headers[h.key.toLowerCase()] = h.value;
  return route.fulfill({ body: readFileSync(f), headers });
});
const page = await ctx.newPage();
const errores = [];
page.on('pageerror', (e) => errores.push(e.message));
const URL_APP = 'https://fit.menarguez-ia.com/entreno/';
const gate = () => page.getByRole('heading', { name: /Entra con tu/ });
const dentro = () => page.getByRole('heading', { name: /Es avanzar/i });

await page.goto(URL_APP);
await gate().waitFor();
check('sin código: pide el código y no muestra la app', await gate().isVisible() && !(await dentro().isVisible()));
check('enlace de registro a Tally', (await page.getByRole('link', { name: /registrarme gratis/ }).getAttribute('href')) === 'https://tally.so/r/xXlpkr');
check('sin scroll horizontal en la pantalla de acceso', await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth) <= 1);
await page.screenshot({ path: `${SHOTS}/acceso-01.png`, fullPage: true });

modo = 'mal';
await page.fill('#acceso-codigo', 'FIT-ZZZZ-9999');
await page.getByRole('button', { name: 'Entrar' }).click();
await page.getByText('Código no encontrado').waitFor();
check('código incorrecto: muestra el error del servidor', true);
await page.screenshot({ path: `${SHOTS}/acceso-02-error.png`, fullPage: true });

modo = 'ok';
await page.fill('#acceso-codigo', ' fit-aaaa-bbbb ');
await page.getByRole('button', { name: 'Entrar' }).click();
await dentro().waitFor();
const ult = peticiones.at(-1);
check('código correcto: entra en la app', true);
check('solo envía código, dispositivo y navegador', JSON.stringify(Object.keys(ult).sort()) === '["code","dispositivo","userAgent"]' && ult.code === 'FIT-AAAA-BBBB');
check('usa el mismo identificador de dispositivo que la app de nutrición', ult.dispositivo === await page.evaluate(() => localStorage.getItem('fitai_device')));

const n = peticiones.length;
await page.reload(); await dentro().waitFor();
check('al volver a abrir, revalida el código', peticiones.length === n + 1);

modo = 'sinred';
await page.reload(); await dentro().waitFor();
check('sin conexión y validado hace poco: deja entrar', true);

modo = 'otro';
await page.reload(); await gate().waitFor();
check('si el código pasa a otro dispositivo: vuelve al acceso con el aviso', await page.getByText(/en uso en otro dispositivo/).isVisible());

modo = 'ok';
await page.fill('#acceso-codigo', 'FIT-AAAA-BBBB');
await page.getByRole('button', { name: 'Entrar' }).click(); await dentro().waitFor();
await page.goto(URL_APP + '#ajustes');
await page.locator('#btn-salir-codigo').click();
await gate().waitFor();
check('Ajustes → Salir del código: vuelve al acceso', true);

// Quien ya usa la app de nutrición en este navegador entra sin escribir el código
await page.evaluate(() => { localStorage.setItem('fitai_user', JSON.stringify({ code: 'FIT-NUTR-0001' })); history.replaceState(null, '', '/entreno/'); });
await page.reload(); await dentro().waitFor();
check('reutiliza el código de la app de nutrición del mismo navegador', peticiones.at(-1).code === 'FIT-NUTR-0001');

check('sin violaciones de CSP', (await page.evaluate(() => window.__csp)).length === 0, JSON.stringify(await page.evaluate(() => window.__csp)));
check('sin errores de JavaScript', errores.length === 0, errores.join(' | '));

await browser.close();
const fail = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - fail}/${results.length} comprobaciones superadas`);
process.exit(fail ? 1 : 0);
