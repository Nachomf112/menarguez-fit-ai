// Prueba de la app (public/app.html) con /api/analyze simulado: formato por tipos, sin prompts en el navegador, sin HTML ejecutable.
// Uso (desde la raíz del repo): NODE_PATH=<ruta a node_modules con playwright> node pruebas/app-ia.mjs
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
const { chromium } = createRequire(import.meta.url)('playwright');
const html = readFileSync('public/app.html');
const server = createServer((q, s) => { s.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); s.end(html); }).listen(4321);
const out = []; const check = (n, c, e = '') => { out.push(!!c); console.log(`${c ? 'OK  ' : 'FAIL'} ${n}${e ? ' — ' + e : ''}`); };
const browser = await chromium.launch(); const page = await browser.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
const pedidos = [];
await page.route('**/*', async (route) => {
  const u = new URL(route.request().url());
  if (u.pathname === '/api/analyze') {
    const b = JSON.parse(route.request().postData()); b.__disp = route.request().headers()['x-fit-device']; pedidos.push(b);
    const res = { comida: { nombre: '<img src=x onerror=window.__x=1>Tortilla', kcal: 350, proteina: 20, carbos: 15, grasa: 22, porcion: '1 ración' },
      ejercicio: { actividad: 'Carrera', kcal: 300, duracion: '30 min' }, recomendacion: { texto: 'Vas bien hoy, sigue así.' },
      menu: { texto: '✅ Ya registrado: tortilla\n\nResto del dia sugerido:\nCena: <img src=x onerror=window.__x=2>salmón (500 kcal)' } }[b.tipo];
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ resultado: res }) });
  }
  if (u.pathname.startsWith('/api/')) return route.fulfill({ contentType: 'application/json', body: '{"perfil":null,"ok":true}' });
  if (u.hostname === 'localhost') return route.continue();
  return route.abort();
});
await page.goto('http://localhost:4321/');
await page.fill('#fitCode', 'DEMO-2026'); await page.click('#loginBtn');
await page.waitForSelector('#pNombre', { state: 'visible' });
await page.fill('#pNombre', 'Prueba'); await page.fill('#pFechaNac', '1990-05-01'); await page.fill('#pPeso', '70'); await page.fill('#pAltura', '175');
await page.check('#pMayor18'); await page.click('#profileBtn');
await page.waitForTimeout(300);
check('sin la casilla de consentimiento no se guarda el perfil', (await page.locator('#profileError').innerText()).includes('consentimiento') && await page.locator('#pNombre').isVisible());
await page.check('#pConsentSalud'); await page.click('#profileBtn');
await page.waitForTimeout(800);
await page.evaluate(async () => { document.getElementById('inputDesayuno').value = 'tortilla'; await addFood('desayuno'); });
await page.waitForTimeout(800);
await page.evaluate(async () => { document.getElementById('inputEjercicio').value = 'correr 30 min'; await addEjercicio(); });
await page.waitForTimeout(500);
await page.evaluate(() => { openSugeridor(); return generarSugerencia(); });
await page.waitForTimeout(500);
const tipos = pedidos.map((p) => p.tipo);
check('comida, ejercicio, recomendación y menú usan el formato nuevo', ['comida', 'ejercicio', 'recomendacion', 'menu'].every((t) => tipos.includes(t)), tipos.join(','));
check('ninguna petición lleva prompts ni messages', pedidos.every((p) => !p.messages && !p.model && !JSON.stringify(p).includes('nutricionista')));
check('la comida se registra', (await page.locator('body').innerText()).includes('Tortilla'));
check('la recomendación se muestra', (await page.locator('#iaRecomendacion').innerText()).includes('Vas bien'));
check('el menú se muestra con formato', (await page.locator('#sugeridorOutput').innerHTML()).includes('<br>') && (await page.locator('#sugeridorOutput').innerText()).includes('salmón'));
check('el texto del menú no ejecuta HTML', !(await page.evaluate(() => window.__x === 2)));
check('el menú incluye la comida registrada en los datos', JSON.stringify(pedidos.find((p) => p.tipo === 'menu')?.datos.comidas || []).includes('desayuno'));
check('cada petición a la IA lleva el identificador de dispositivo (C3)', pedidos.length > 0 && pedidos.every((p) => /^[A-Za-z0-9-]{32,64}$/.test(p.__disp || '')));
check('el identificador no se genera con datos del equipo (no hay getFingerprint)', !(await page.evaluate(() => typeof window.getFingerprint === 'function')));
check('sin errores de JavaScript', errors.length === 0, errors.join(' | '));
check('el nombre de una comida no ejecuta HTML (M7)', !(await page.evaluate(() => window.__x === 1)));

// Perfil antiguo sin consentimiento: se pide antes de seguir; después se puede retirar (borra el perfil)
const ctx2 = await browser.newContext(); const p2 = await ctx2.newPage();
const api2 = [];
p2.on('dialog', (d) => d.accept());
await p2.route('**/*', async (route) => {
  const u = new URL(route.request().url());
  if (u.pathname.startsWith('/api/')) api2.push({ path: u.pathname, method: route.request().method(), body: route.request().postData() });
  if (u.pathname === '/api/validate-code') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ valid: true, nombre: 'Ficticia', plan: 'free', usos: 0, usosMax: 30,
    perfil: { nombre: 'Ficticia', peso: 62, altura: 168, fechaNac: '1988-03-02', sexo: 'mujer', actividad: 'ligero', objetivo: 'mantener', objKcal: 1900, protObj: 100, fatObj: 60, carbObj: 220, tdee: 1900 } }) });
  if (u.pathname === '/api/save-profile-fit' && route.request().method() === 'POST') {
    const b = JSON.parse(route.request().postData());
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, guardado: true, perfil: { ...b.perfil, consentimiento: { version: b.consentimiento, fecha: new Date().toISOString() } } }) });
  }
  if (u.pathname.startsWith('/api/')) return route.fulfill({ contentType: 'application/json', body: '{"ok":true}' });
  if (u.hostname === 'localhost') return route.continue();
  return route.abort();
});
await p2.goto('http://localhost:4321/');
await p2.fill('#fitCode', 'FIT-AAAA-BBBB'); await p2.click('#loginBtn');
await p2.waitForSelector('#consentAviso.show', { timeout: 5000 }).catch(() => {});
check('perfil antiguo sin consentimiento: se pide antes de seguir', await p2.locator('#consentAviso').isVisible() && await p2.locator('#pNombre').inputValue() === 'Ficticia');
await p2.check('#pMayor18'); await p2.check('#pConsentSalud'); await p2.click('#profileBtn');
await p2.waitForTimeout(800);
const guardar = api2.find((a) => a.path === '/api/save-profile-fit' && a.method === 'POST');
check('al guardar se envía el consentimiento con su versión', guardar && JSON.parse(guardar.body).consentimiento === '2026-11');
await p2.evaluate(() => retirarConsentimiento());
await p2.waitForTimeout(500);
check('retirar el consentimiento pide borrar el perfil en el servidor', api2.some((a) => a.path === '/api/save-profile-fit' && a.method === 'DELETE'));
check('tras retirarlo, vuelve al formulario y no queda perfil en el dispositivo', await p2.locator('#pNombre').isVisible() && !(await p2.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith('fitai_perfil')))));
check('la política de privacidad está enlazada en el acceso y en el perfil', (await p2.locator('a[href="/privacidad.html"]').count()) >= 3);
await ctx2.close();

await browser.close(); server.close();
console.log(`${out.filter(Boolean).length}/${out.length}`);
