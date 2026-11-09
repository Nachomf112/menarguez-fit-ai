// Recorrido principal en navegador (Chromium, viewport móvil).
// Uso: npm run build && node tests/e2e.mjs [carpeta_capturas]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { mkdirSync } from 'node:fs';
import { serve } from './serve.mjs';

const SHOTS = process.argv[2] || 'tests/shots';
mkdirSync(SHOTS, { recursive: true });
const server = serve(4317);

const results = [];
const check = (name, cond, extra = '') => { results.push({ name, ok: !!cond }); console.log(`${cond ? 'OK  ' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
const terceros = [];
await ctx.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`)); });
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/ERR_|net::/.test(m.text())) errors.push(m.text()); });
await ctx.route('**/*', (route) => {
  const url = route.request().url();
  if (!url.startsWith('http://localhost') && !url.startsWith('https://yosanpfxozkgspeftlgb.supabase.co')) terceros.push(url);
  if (url.startsWith('http://localhost:4317')) return route.continue();
  return route.abort();
});
const noOverflow = async (label) => {
  const o = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(`sin scroll horizontal: ${label}`, o <= 1, `exceso ${o}px`);
};
const shot = (n) => page.screenshot({ path: `${SHOTS}/${n}.png`, fullPage: true });
const next = () => page.getByRole('button', { name: 'Siguiente' }).click();

await page.goto('http://localhost:4317/');
await page.getByRole('heading', { name: /Es avanzar/i }).waitFor();
await shot('01-bienvenida'); await noOverflow('bienvenida');

// Teclado: llegar a "Crear mi perfil" con Tab y activar con Enter
let reached = false;
for (let i = 0; i < 8 && !reached; i++) { await page.keyboard.press('Tab'); reached = (await page.evaluate(() => document.activeElement?.textContent)) === 'Crear mi perfil'; }
check('teclado alcanza el botón principal', reached);
await page.keyboard.press('Enter');
await page.getByRole('heading', { name: 'Empecemos por ti' }).waitFor();

// Validación: edad < 18
await page.fill('#eval-nombre', 'Prueba');
await page.fill('#eval-edad', '16');
await next();
check('rechaza menores de 18', await page.getByText('solo para mayores de 18').isVisible());
await page.fill('#eval-edad', '45');
await page.getByRole('button', { name: /Salud y forma general/ }).click(); await next();
await page.getByRole('button', { name: /^Principiante/ }).click();
await page.getByRole('button', { name: /^Algo activa/ }).click(); await next();
await page.getByRole('button', { name: '2', exact: true }).click();
await page.getByRole('button', { name: '45 min' }).click();
await shot('02-evaluacion-disponibilidad');
// Recargar conserva respuestas y paso
await page.reload();
await page.getByRole('heading', { name: '¿Cuánto tiempo tienes?' }).waitFor({ timeout: 5000 }).catch(() => {});
check('recargar conserva la evaluación', await page.getByRole('heading', { name: '¿Cuánto tiempo tienes?' }).isVisible()
  && (await page.getByRole('button', { name: '45 min' }).getAttribute('aria-pressed')) === 'true');
await next();
await page.getByRole('heading', { name: /Lesiones/ }).waitFor();
await shot('03-evaluacion-salud'); await noOverflow('evaluación salud');
await next();
check('aviso de fase 2', await page.getByText('Fase 1 completada').isVisible());
await page.getByRole('button', { name: 'Mancuernas', exact: true }).click(); await next();
const pasos = await page.locator('.num').first().innerText();
check('evaluación en 6 pantallas', pasos.trim() === '6 / 6', pasos);
await page.getByRole('button', { name: 'Ver resumen' }).click();
await page.getByRole('heading', { name: 'Revisa antes de generar' }).waitFor();
await shot('04-resumen'); await noOverflow('resumen');
// Editar desde el resumen
await page.getByRole('button', { name: 'Editar' }).nth(4).click();
await page.getByRole('heading', { name: '¿Cuánto tiempo tienes?' }).waitFor();
await page.getByRole('button', { name: 'Guardar y volver' }).click();
check('generar exige consentimiento', await page.getByRole('button', { name: 'Generar mi plan' }).isDisabled());
await page.check('#eval-consent');
await page.getByRole('button', { name: 'Generar mi plan' }).click();
await page.getByRole('heading', { name: 'Semana de entrenamiento' }).waitFor();
const fuerza = await page.locator('.week .item').count();
check('principiante 2 días → 2 sesiones', fuerza === 2, `${fuerza}`);
await shot('05-plan'); await noOverflow('plan');

// Detalle de sesión
await page.locator('.week .item').first().click();
await page.getByText('Calentamiento').waitFor();
const detalleTxt = await page.locator('main').innerText();
check('detalle con intensidad explicada', /podrías hacer unas 3 repeticiones más/.test(detalleTxt));
check('detalle no asigna kilos iniciales', !/\d+\s?kg/.test(detalleTxt.split('Vuelta a la calma')[0]));
await shot('06-detalle'); await noOverflow('detalle');

// Entrenar
await page.getByRole('button', { name: 'Empezar esta sesión' }).click();
await page.getByRole('button', { name: 'Empezar sesión' }).click();
await page.locator('.sets').waitFor();
// Marcar sin datos → aviso
await page.getByRole('button', { name: 'Marcar serie 1 como hecha' }).click();
check('exige anotar repeticiones', await page.getByText(/Anota las repeticiones|Anota los segundos/).isVisible());
const hasKg = await page.locator('#set-kg-0-0').count();
if (hasKg) await page.fill('#set-kg-0-0', '8');
const unitIsSec = await page.locator('.setrow.head').innerText().then((t) => /segundos/.test(t));
await page.fill('#set-reps-0-0', unitIsSec ? '25' : '10');
await page.getByRole('button', { name: 'Marcar serie 1 como hecha' }).click();
check('temporizador de descanso aparece', await page.locator('.timer').isVisible());
await page.getByRole('button', { name: 'Pausa' }).click();
check('temporizador en pausa', await page.getByText('En pausa').isVisible());
await shot('07-entrenando'); await noOverflow('entrenando');
await page.reload();
await page.locator('.sets').waitFor();
check('recargar conserva la serie registrada', (await page.getByRole('button', { name: 'Marcar serie 1 como hecha' }).getAttribute('aria-pressed')) === 'true'
  && (await page.inputValue('#set-reps-0-0')) === (unitIsSec ? '25' : '10'));
check('recargar conserva el temporizador en pausa', await page.getByText('En pausa').isVisible());
// Sustituir con una serie ya hecha: se conserva y se añade la alternativa
const tabsAntes = await page.getByRole('tab').count();
await page.getByRole('button', { name: 'Sustituir ejercicio' }).click();
check('aviso de series conservadas', await page.getByText(/series ya hechas se conservan/).isVisible());
await page.locator('.list .item').first().click();
check('sustituir con series hechas no las pierde', (await page.getByRole('tab').count()) === tabsAntes + 1
  && (await page.getByRole('tab', { name: '1 ✓' }).count()) === 1);
// Sustituir el segundo ejercicio
await page.getByRole('tab', { name: '3', exact: true }).click();
const before = await page.locator('.card.accent h2').innerText();
await page.getByRole('button', { name: 'Sustituir ejercicio' }).click();
await page.locator('.list .item').first().click();
const after = await page.locator('.card.accent h2').innerText();
check('sustituir cambia el ejercicio', before !== after, `${before} → ${after}`);
check('muestra a quién sustituye', await page.getByText(`Sustituye a ${before}`).isVisible());
await page.getByRole('button', { name: 'Terminar sesión' }).click();
await page.getByRole('button', { name: '7', exact: true }).first().click();
await page.getByRole('button', { name: 'Guardar sesión' }).click();
await page.getByText('Parcial').first().waitFor();
check('sesión parcial distinguida', await page.locator('.badge.warn', { hasText: 'Parcial' }).isVisible());
await shot('08-resumen-sesion'); await noOverflow('resumen sesión');

// Progreso
await page.getByRole('button', { name: 'Ver progreso' }).click();
await page.getByRole('heading', { name: 'Seguimiento' }).waitFor();
await shot('09-progreso-semana'); await noOverflow('progreso');
await page.getByRole('button', { name: 'Ejercicios', exact: true }).first().click();
check('datos insuficientes no generan conclusiones', await page.getByText(/Datos insuficientes/).isVisible());
await page.getByRole('button', { name: 'Calendario' }).click();
await shot('10-calendario');
await page.getByRole('button', { name: 'Historial' }).click();
check('historial con la sesión', (await page.locator('.list .item').count()) === 1);

// Catálogo
await page.locator('.bottomnav').getByRole('button', { name: /Ejercicios/ }).click();
const total = await page.locator('.excard').count();
check('catálogo ≥ 40 ejercicios', total >= 40, String(total));
await page.getByRole('button', { name: 'Bandas elásticas', exact: true }).click();
const bandas = await page.locator('.excard').count();
check('filtro por material', bandas > 0 && bandas < total, String(bandas));
await page.fill('#cat-search', 'remo');
await page.locator('.excard').first().getByRole('button', { name: /Ver técnica/ }).click();
await page.getByText('Errores habituales').waitFor();
await page.getByRole('button', { name: 'Añadir a favoritos' }).click();
check('favorito marcado', await page.getByRole('button', { name: 'Quitar de favoritos' }).isVisible());
check('demostración visual señalada como pendiente', await page.getByText('Demostración visual pendiente').isVisible());
await shot('11-ficha'); await noOverflow('ficha');

// Nutrición
await page.locator('.bottomnav').getByRole('button', { name: /Inicio/ }).click();
await page.getByRole('button', { name: 'Conocer el módulo' }).click();
await page.getByRole('button', { name: 'Activar nutrición' }).click();
await page.getByRole('button', { name: 'Vegetariana', exact: true }).click();
await page.getByRole('button', { name: 'Gluten', exact: true }).click();
await page.getByRole('button', { name: 'Generar menú semanal' }).click();
await page.getByRole('heading', { name: 'Menú semanal' }).waitFor();
const menuTxt = await page.locator('main').innerText();
check('menú vegetariano sin carne ni pescado', !/pollo|merluza|salmón|atún|ternera|pavo|gambas/i.test(menuTxt));
check('menú indica crudo/cocido', /en crudo|cocido|tal cual/.test(menuTxt));
check('sin estimación energética sin datos corporales', !/kcal\/día/.test(menuTxt));
await shot('12-nutricion'); await noOverflow('nutrición');
await page.getByRole('button', { name: 'Lista de compra' }).click();
check('lista de compra', (await page.locator('tbody tr').count()) > 5);

// Exportar, borrar e importar
await page.getByRole('button', { name: 'Ajustes y datos' }).click();
await page.getByRole('button', { name: 'Exportar copia (JSON)' }).click();
const backup = await page.inputValue('#export-text');
check('exportación JSON', backup.includes('"app": "menarguez-fit-ia"'));
await page.getByRole('button', { name: 'Exportar registros (CSV)' }).click();
const csv = await page.inputValue('#export-text');
check('exportación CSV', csv.includes('perfil;fecha;sesion;estado') && csv.includes('Prueba'));
await shot('13-ajustes'); await noOverflow('ajustes');
await page.getByRole('button', { name: 'Borrar todos los datos' }).click();
await page.fill('#confirm-borrar', 'BORRAR');
await page.getByRole('button', { name: 'Confirmar borrado' }).click();
await page.getByRole('heading', { name: /Es avanzar/i }).waitFor();
check('borrado completo', (await page.locator('.list .item').count()) === 0);
await page.getByRole('button', { name: 'Ajustes y datos' }).click();
await page.fill('#import-text', '{"app":"otra"}');
await page.getByRole('button', { name: 'Validar' }).click();
check('importación rechaza archivos no válidos', await page.getByText('No se puede importar').isVisible());
await page.fill('#import-text', backup);
await page.getByRole('button', { name: 'Validar' }).click();
await page.getByRole('button', { name: 'Importar y reemplazar' }).click();
check('importación restaura el perfil', await page.getByText('Datos importados').isVisible() && await page.locator('.badge', { hasText: 'Prueba' }).isVisible());

// Perfil demo: separado y sin mezclar registros
await page.getByRole('button', { name: 'Ir al inicio' }).click();
await page.evaluate(() => { location.hash = 'bienvenida'; });
await page.getByRole('button', { name: 'Ver perfil de demostración' }).click();
await page.getByText('Perfil de demostración').first().waitFor();
await page.locator('.bottomnav').getByRole('button', { name: /Progreso/ }).click();
await page.getByRole('button', { name: 'Historial' }).click();
const demoCount = await page.locator('.list .item').count();
await page.getByRole('button', { name: 'Ejercicios', exact: true }).first().click();
check('demo muestra evolución con datos de ejemplo', await page.locator('svg.chart').first().isVisible());
await shot('14-demo-progreso');
await page.getByRole('button', { name: 'Ajustes y datos' }).click();
await page.locator('.item', { hasText: 'Prueba' }).click();
await page.locator('.bottomnav').getByRole('button', { name: /Progreso/ }).click();
await page.getByRole('button', { name: 'Historial' }).click();
check('los perfiles no mezclan registros', demoCount > 1 && (await page.locator('.list .item').count()) === 1, `demo ${demoCount}`);

// Perfil de carrera (10 km) con marca: plan, registro de rodaje y progreso de carrera
await page.getByRole('button', { name: 'Ajustes y datos' }).click();
await page.getByRole('button', { name: 'Nuevo perfil' }).click();
await page.fill('#eval-nombre', 'Corredora');
await page.fill('#eval-edad', '30');
await page.getByRole('button', { name: /Preparar una carrera/ }).click(); await next();
await page.getByRole('button', { name: /^Intermedio/ }).click();
await page.getByRole('button', { name: /^Activa/ }).click(); await next();
await page.getByRole('button', { name: '4', exact: true }).click();
await page.getByRole('button', { name: '60 min' }).click(); await next();
await next();
await page.getByRole('heading', { name: 'Tu carrera' }).waitFor();
await page.getByRole('button', { name: '10 km', exact: true }).click();
await page.getByRole('button', { name: /^Regular/ }).click();
await page.getByRole('button', { name: '60–120' }).click();
await page.selectOption('#eval-marca-km', '5');
await page.fill('#eval-marca-tiempo', '25:00');
await page.locator('#eval-marca-tiempo').blur();
await shot('18-evaluacion-carrera'); await noOverflow('evaluación carrera');
await next(); await next(); await page.getByRole('button', { name: 'Ver resumen' }).click();
check('resumen muestra la marca', await page.getByText('25:00 en 5 km').isVisible());
await page.check('#eval-consent');
await page.getByRole('button', { name: 'Generar mi plan' }).click();
await page.getByRole('heading', { name: 'Semana de entrenamiento' }).waitFor();
const planTxt = await page.locator('main').innerText();
check('plan de carrera con series, rodaje y tirada', /Series/.test(planTxt) && /Rodaje suave/.test(planTxt) && /Tirada larga/.test(planTxt));
check('estimación de ritmo con Riegel', /Riegel/.test(planTxt) && /min\/km/.test(planTxt));
await shot('19-plan-carrera'); await noOverflow('plan carrera');
await page.locator('.week .item', { hasText: 'Series' }).click();
check('detalle de series con ritmo estimado', await page.getByText(/Ritmo de referencia estimado/).isVisible());
await shot('20-detalle-series');
await page.locator('.bottomnav').getByRole('button', { name: /Entrenar/ }).click();
const opt = await page.locator('#train-session option', { hasText: 'Rodaje suave' }).getAttribute('value');
await page.selectOption('#train-session', opt);
await page.getByRole('button', { name: 'Empezar sesión' }).click();
await page.fill('#train-run-min', '45');
await page.fill('#train-run-km', '8');
check('ritmo medio del rodaje', await page.getByText(/Ritmo medio: 5:38 min\/km/).isVisible());
await shot('21-registro-carrera');
await page.getByRole('button', { name: 'Terminar', exact: true }).click();
await page.getByRole('button', { name: 'Guardar sesión' }).click();
check('rodaje completado', await page.locator('.badge.ok', { hasText: 'Completada' }).isVisible());
await page.getByRole('button', { name: 'Ver progreso' }).click();
await page.getByRole('button', { name: 'Carrera', exact: true }).click();
check('progreso de carrera exige 2 sesiones comparables', await page.getByText(/hacen falta al menos 2 sesiones de este tipo/).isVisible());
await shot('22-progreso-carrera'); await noOverflow('progreso carrera');
await page.getByRole('button', { name: 'Ajustes y datos' }).click();
await page.locator('.item', { hasText: 'Prueba' }).click();

// Escritorio
await page.setViewportSize({ width: 1280, height: 900 });
await page.locator('.bottomnav').getByRole('button', { name: /Mi plan/ }).click();
await shot('15-escritorio-plan'); await noOverflow('escritorio');
const navBox = await page.locator('.bottomnav').boundingBox();
check('menú lateral en escritorio', navBox && navBox.x === 0 && navBox.width < 300 && navBox.height > 800, JSON.stringify(navBox));
await page.locator('.bottomnav').getByRole('button', { name: /Ejercicios/ }).click();
await page.fill('#cat-search', '');
await shot('16-escritorio-catalogo');
await page.evaluate(() => { location.hash = 'bienvenida'; });
await page.waitForTimeout(300);
await shot('17-escritorio-bienvenida'); await noOverflow('escritorio bienvenida');

const csp = await page.evaluate(() => window.__csp);
check('la política de seguridad (CSP) no bloquea nada de la app', csp.length === 0, csp.join(' | '));
check('no se cargan recursos de terceros', terceros.length === 0, terceros.slice(0, 3).join(' | '));
const cab = await page.evaluate(async () => { const r = await fetch('/'); return { csp: r.headers.get('content-security-policy') || '', xfo: r.headers.get('x-frame-options') }; });
check('cabeceras de seguridad presentes', cab.csp.includes("default-src 'none'") && cab.xfo === 'DENY');
check('sin errores de JavaScript', errors.length === 0, errors.join(' | '));
await browser.close(); server.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} comprobaciones superadas`);
process.exit(failed.length ? 1 : 0);
