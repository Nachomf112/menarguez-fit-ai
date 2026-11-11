// ════════════════════════════════════════════════════════════════
// api/entreno-acceso.js — Acceso a /entreno con el código de Fit AI (v1)
// POST { code, dispositivo, userAgent? } → { valid, nombre, plan } | { valid:false, error }
//
// - Mismo código y mismo vínculo de dispositivo que /app (validate-code).
// - El entrenamiento es gratuito: aquí NO se aplican la caducidad del plan Free ni el
//   límite de análisis de IA (son de nutrición). Sí se aplican: código existente,
//   activo (Desactivar en el admin) y dispositivo vinculado.
// - No devuelve el perfil ni ningún dato físico. Al servidor no llega nada del entrenamiento.
// - Registra el acceso para el admin: lista fitai:accesos (app: 'entreno') y el hash
//   entreno:<código> con primer acceso, último acceso y número de aperturas.
// - Mismo dominio: sin CORS.
// ════════════════════════════════════════════════════════════════
import { comprobarDispositivo, esFormatoValido, huellaDispositivo, idDispositivoValido, kvGetJson, normalizarCodigo } from './_lib/codigo.js';
import { esPerfilMenor } from './validate-code.js';

const GENERICO = 'Código no encontrado. Revisa que esté bien escrito.';

export function parseUserAgent(ua) {
  if (!ua) return { os: 'Desconocido', browser: 'Desconocido', tipo: 'escritorio' };
  let os = 'Desconocido';
  if (/Windows NT 10/.test(ua)) os = 'Windows 10/11';
  else if (/Windows NT 6/.test(ua)) os = 'Windows 7/8';
  else if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS'; // antes que macOS: el iPhone también dice "Mac OS X"
  else if (/Android/.test(ua)) os = 'Android';
  else if (/Mac OS X/.test(ua)) os = 'macOS';
  else if (/Linux/.test(ua)) os = 'Linux';
  let browser = 'Desconocido';
  if (/Edg\//.test(ua)) browser = 'Edge';
  else if (/OPR\/|Opera/.test(ua)) browser = 'Opera';
  else if (/Firefox\/|FxiOS\//.test(ua)) browser = 'Firefox';
  else if (/Chrome\/|CriOS\//.test(ua)) browser = 'Chrome';
  else if (/Safari\//.test(ua)) browser = 'Safari';
  const v = ua.match(/(Chrome|CriOS|Firefox|FxiOS|Version|Edg|OPR)\/(\d+)/);
  if (v && browser !== 'Desconocido') browser += ' ' + v[2];
  let tipo = 'escritorio';
  if (/iPad|Tablet/.test(ua)) tipo = 'tablet';
  else if (/Mobile|Android|iPhone/.test(ua)) tipo = 'móvil';
  return { os, browser, tipo };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'POST') return res.status(405).json({ valid: false, error: 'Método no permitido' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  if (!body || typeof body !== 'object') return res.status(400).json({ valid: false, error: 'Petición no válida' });

  const code = normalizarCodigo(body.code);
  if (!code) return res.status(400).json({ valid: false, error: 'Escribe tu código' });
  if (!esFormatoValido(code)) return res.status(200).json({ valid: false, error: GENERICO });
  const dispositivo = typeof body.dispositivo === 'string' ? body.dispositivo.trim() : '';
  if (!idDispositivoValido(dispositivo)) return res.status(400).json({ valid: false, error: 'Actualiza la página e inténtalo de nuevo.' });

  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    return res.status(500).json({ valid: false, error: 'Configuración incompleta' });
  }
  const kv = { url: process.env.KV_REST_API_URL, headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`, 'Content-Type': 'application/json' } };
  const kvPost = (ruta, cuerpo) => fetch(`${kv.url}/${ruta}`, { method: 'POST', headers: kv.headers, body: cuerpo, signal: AbortSignal.timeout(5000) });
  const enc = encodeURIComponent;

  try {
    const codeData = await kvGetJson(kv, `code:${code}`);
    if (!codeData) return res.status(200).json({ valid: false, error: GENERICO });
    if (!codeData.activo) return res.status(200).json({ valid: false, error: 'Código desactivado. Escribe a info@imenarguez-ia.com' });

    const estado = comprobarDispositivo(codeData, dispositivo);
    if (estado === 'otro_dispositivo') {
      return res.status(200).json({ valid: false, error: 'Este código ya está en uso en otro dispositivo. Si has cambiado de dispositivo, escribe a info@imenarguez-ia.com' });
    }

    // Barrera de edad (misma regla que /app): si el perfil de nutrición es de un menor, no entra.
    let perfil = null;
    try { perfil = await kvGetJson(kv, `profile:${code}`); } catch { /* sin perfil */ }
    if (esPerfilMenor(perfil)) return res.status(200).json({ valid: false, error: 'Menarguez Fit AI es solo para mayores de 18 años.' });

    const ip = (typeof req.headers['x-real-ip'] === 'string' && req.headers['x-real-ip'].trim())
      || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'N/A';
    const ua = typeof body.userAgent === 'string' ? body.userAgent.slice(0, 400) : (req.headers['user-agent'] || '');
    const { os, browser, tipo } = parseUserAgent(ua);
    const ahora = new Date();
    const fecha = ahora.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Madrid' });
    const hora = ahora.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });

    if (estado === 'sin_vincular') {
      codeData.fingerprint = huellaDispositivo(dispositivo);
      codeData.dispositivo = { os, browser, tipo, ip, fecha, hora };
      const r = await kvPost(`set/${enc(`code:${code}`)}`, JSON.stringify(codeData));
      if (!r.ok) throw new Error('Upstash SET');
    }

    // Registro para el admin (si falla, no impide entrar)
    try {
      const clave = enc(`entreno:${code}`);
      const iso = ahora.toISOString();
      await Promise.all([
        kvPost(`hsetnx/${clave}/primer_acceso/${enc(iso)}`),
        kvPost(`hset/${clave}/ultimo_acceso/${enc(iso)}`),
        kvPost(`hincrby/${clave}/aperturas/1`),
        kvPost(`set/${enc(`ultimo:${code}`)}`, JSON.stringify(iso)),
        kvPost('lpush/fitai:accesos', JSON.stringify(JSON.stringify({
          nombre: codeData.nombre || 'Usuario', code, fecha, hora, tipo, os, browser, ip, app: 'entreno',
        }))),
      ]);
      await kvPost('ltrim/fitai:accesos/0/999');
    } catch (e) { console.warn('entreno-acceso: no se pudo registrar el acceso'); }

    return res.status(200).json({ valid: true, nombre: codeData.nombre || 'Usuario', plan: codeData.plan || 'free' });
  } catch {
    return res.status(500).json({ valid: false, error: 'Error del servidor. Inténtalo de nuevo en un momento.' });
  }
}
