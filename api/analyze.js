// ════════════════════════════════════════════════════════════════
// api/analyze.js — Menarguez Fit AI
// ════════════════════════════════════════════════════════════════
// v5:
//   - El navegador ya no envía prompts: solo { userCode, tipo, datos }.
//     Tipos: comida, ejercicio, recomendacion, menu (prompts en api/_lib/prompts.js).
//   - La respuesta de la IA se valida en el servidor y se devuelve estructurada.
//   - El uso se descuenta solo si la IA responde bien (un error de Anthropic no gasta usos).
//   - La recomendación automática no gasta usos (límite diario por código).
//   - Sin ipapi.co: ubicación aproximada con las cabeceras de Vercel.
//   - Tiempos máximos en Upstash y Anthropic.
// v4 (se mantiene): código obligatorio, activo/caducidad/límite, barrera de edad,
//   modelo fijado en servidor, demo con límite diario por IP, stats diarias.
// ════════════════════════════════════════════════════════════════

import { esDemo, esFormatoValido, kvGetJson, normalizarCodigo } from './_lib/codigo.js';
import { TIPOS } from './_lib/prompts.js';

const FREE_LIMIT = 30;   // análisis totales plan Free
const PRO_LIMIT = 0;     // 0 = ilimitado
const RECOMENDACIONES_DIA = 40;   // por código (no gastan usos)
const MODEL = process.env.FIT_MODEL || 'claude-sonnet-4-6';
const DEMO_LIMIT_DIA_IP = 10;     // análisis demo por IP y día
const ALLOWED_ORIGIN = process.env.FIT_ALLOWED_ORIGIN || 'https://fit.menarguez-ia.com';

// ── EDAD MÍNIMA (misma lógica que validate-code.js) ──────────────
const EDAD_MINIMA = 18;
const MSG_MENOR = 'Menarguez Fit AI es solo para mayores de 18 años.';

function parseFecha(v) {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  let y, m, d, r = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (r) { y = +r[1]; m = +r[2]; d = +r[3]; }
  else {
    r = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
    if (!r) return null;
    d = +r[1]; m = +r[2]; y = +r[3];
  }
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt;
}

// true si el perfil guardado es de un menor (por fechaNac; si no la tiene, por la edad antigua)
export function esPerfilMenor(p, hoy = new Date()) {
  if (!p || typeof p !== 'object') return false;
  const f = parseFecha(p.fechaNac ?? p.fechaNacimiento ?? p.fecha_nacimiento);
  if (f) {
    let e = hoy.getUTCFullYear() - f.getUTCFullYear();
    const dm = hoy.getUTCMonth() - f.getUTCMonth();
    if (dm < 0 || (dm === 0 && hoy.getUTCDate() < f.getUTCDate())) e--;
    return e < EDAD_MINIMA;
  }
  return typeof p.edad === 'number' && p.edad < EDAD_MINIMA;
}

const hoyMadrid = () => new Date().toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).split('/').reverse().join('-');

export default async function handler(req, res) {

  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'configuracion_incompleta' });
  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;
  if (!kvUrl || !kvToken) return res.status(500).json({ error: 'configuracion_incompleta' });
  const kv = { url: kvUrl, headers: { Authorization: `Bearer ${kvToken}`, 'Content-Type': 'application/json' } };
  const kvCmd = (path, ms = 5000) => fetch(`${kvUrl}/${path}`, { method: 'POST', headers: kv.headers, signal: AbortSignal.timeout(ms) });

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';

  try {
    let body;
    try {
      body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    } catch (e) {
      return res.status(400).json({ error: 'JSON no válido' });
    }

    // ── TIPO DE PETICIÓN (sin mensajes libres) ───────────────
    const tipo = typeof body.tipo === 'string' && Object.hasOwn(TIPOS, body.tipo) ? TIPOS[body.tipo] : null;
    if (!tipo) return res.status(400).json({ error: 'peticion_invalida', message: 'Tipo de petición no válido.' });
    const preparado = tipo.preparar(body.datos || {});
    if (preparado.error) return res.status(400).json({ error: preparado.error });

    // ── CÓDIGO OBLIGATORIO ───────────────────────────────────
    const userCode = normalizarCodigo(body.userCode);
    if (!userCode) return res.status(401).json({ error: 'codigo_requerido', message: 'Necesitas un código de acceso.' });

    let codeData = null;

    if (esDemo(userCode)) {
      // ── DEMO: límite diario por IP ─────────────────────────
      try {
        const clave = `fitai:demo:${ip}:${new Date().toISOString().slice(0, 10)}`;
        const n = (await (await kvCmd(`incr/${encodeURIComponent(clave)}`)).json()).result;
        if (typeof n !== 'number') throw new Error('incr sin resultado');
        if (n === 1) await kvCmd(`expire/${encodeURIComponent(clave)}/86400`);
        if (n > DEMO_LIMIT_DIA_IP) {
          return res.status(429).json({ error: 'limite_alcanzado', message: 'Has alcanzado el límite diario de la demo. Solicita tu acceso gratuito de 2 días.', upgrade: false });
        }
      } catch (demoErr) {
        console.warn('Error límite demo:', demoErr.message);
        return res.status(503).json({ error: 'servicio_no_disponible', message: 'Inténtalo de nuevo en un momento.' });
      }
    } else {
      // ── CÓDIGO REAL ────────────────────────────────────────
      if (!esFormatoValido(userCode)) return res.status(401).json({ error: 'codigo_invalido', message: 'Código no válido.' });
      try {
        // Barrera de edad: un perfil de menor no puede usar la IA
        if (esPerfilMenor(await kvGetJson(kv, `profile:${userCode}`))) {
          return res.status(403).json({ error: 'edad_minima', message: MSG_MENOR });
        }
        codeData = await kvGetJson(kv, `code:${userCode}`);
      } catch (kvErr) {
        console.warn('Error KV:', kvErr.message);
        return res.status(503).json({ error: 'servicio_no_disponible', message: 'Inténtalo de nuevo en un momento.' });
      }
      if (!codeData) return res.status(401).json({ error: 'codigo_invalido', message: 'Código no encontrado.' });
      if (!codeData.activo) return res.status(401).json({ error: 'codigo_desactivado', message: 'Código desactivado. Contacta con info@menarguez-ia.com' });
      if (codeData.expira && new Date() > new Date(codeData.expira)) {
        return res.status(401).json({ error: 'codigo_expirado', message: 'Código expirado. Contacta con info@menarguez-ia.com' });
      }

      if (tipo.consume) {
        const limite = (codeData.plan || 'free') === 'pro' ? PRO_LIMIT : FREE_LIMIT;
        const usados = Number(codeData.usos_usados) || 0;
        if (limite > 0 && usados >= limite) {
          return res.status(429).json({
            error: 'limite_alcanzado',
            message: `Has agotado tus ${limite} análisis del plan Free. Actualiza a Pro por 4,99€/mes para continuar sin límites.`,
            usos_usados: usados, usos_max: limite, upgrade: true,
          });
        }
      } else {
        // Recomendación: no gasta usos, pero tiene límite diario por código
        try {
          const clave = `fitai:reco:${userCode}:${hoyMadrid()}`;
          const n = (await (await kvCmd(`incr/${encodeURIComponent(clave)}`)).json()).result;
          if (n === 1) await kvCmd(`expire/${encodeURIComponent(clave)}/90000`);
          if (typeof n === 'number' && n > RECOMENDACIONES_DIA) return res.status(429).json({ error: 'limite_recomendaciones' });
        } catch (e) { console.warn('Error límite recomendaciones:', e.message); }
      }
    }

    // ── LLAMADA A CLAUDE ─────────────────────────────────────
    let texto;
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: MODEL, max_tokens: tipo.max_tokens, messages: [{ role: 'user', content: preparado.prompt }] }),
        signal: AbortSignal.timeout(25000),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        console.warn('Anthropic', response.status, data?.error?.type);
        return res.status(response.status === 429 || response.status === 529 ? 503 : 502).json({ error: 'ia_no_disponible', message: 'La IA no está disponible ahora mismo. No se ha gastado ningún uso.' });
      }
      texto = Array.isArray(data.content) ? data.content.map((c) => c.text || '').join('').trim() : '';
    } catch (e) {
      console.warn('Anthropic error:', e.message);
      return res.status(503).json({ error: 'ia_no_disponible', message: 'La IA no está disponible ahora mismo. No se ha gastado ningún uso.' });
    }

    const resultado = tipo.leer(texto);
    if (!resultado) return res.status(422).json({ error: 'respuesta_no_valida', message: 'No he podido interpretarlo. Prueba a describirlo de otra forma. No se ha gastado ningún uso.' });

    // ── DESCONTAR USO (solo tras una respuesta válida) ───────
    let usos_usados;
    if (codeData && tipo.consume) {
      codeData.usos_usados = (Number(codeData.usos_usados) || 0) + 1;
      usos_usados = codeData.usos_usados;
      // Ubicación aproximada sin terceros: cabeceras de geolocalización de Vercel
      if (!codeData.ubicacion && req.headers['x-vercel-ip-country']) {
        const dec = (v) => { try { return decodeURIComponent(v || ''); } catch { return ''; } };
        codeData.ubicacion = { ciudad: dec(req.headers['x-vercel-ip-city']), region: dec(req.headers['x-vercel-ip-country-region']), pais: req.headers['x-vercel-ip-country'], codigo_pais: req.headers['x-vercel-ip-country'] };
      }
      try {
        await fetch(`${kvUrl}/set/${encodeURIComponent(`code:${userCode}`)}`, { method: 'POST', headers: kv.headers, body: JSON.stringify(codeData), signal: AbortSignal.timeout(5000) });
      } catch (setErr) { console.warn('Error guardando usos:', setErr.message); }
      try { await kvCmd(`hincrby/fitai:stats:daily/${hoyMadrid()}/1`); } catch (statsErr) { console.warn('Error stats diarias:', statsErr.message); }
    }

    return res.status(200).json({ resultado, ...(usos_usados !== undefined ? { usos_usados } : {}) });

  } catch (err) {
    console.error('analyze error:', err);
    return res.status(500).json({ error: 'error_interno' });
  }
}
