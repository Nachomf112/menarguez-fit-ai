// ════════════════════════════════════════════════════════════════
// api/validate-code.js — Menarguez Fit AI
// ════════════════════════════════════════════════════════════════
// v2 (C3):
//   - El navegador envía un identificador de dispositivo aleatorio (obligatorio).
//     Se guarda solo su huella SHA-256; la API lo exige en cada petición.
//   - Si el código está en otro dispositivo, el error es genérico (ya no muestra
//     sistema, navegador ni IP del dueño).
//   - Clave de Upstash codificada, formato de código validado, errores sin detalles internos.
// ════════════════════════════════════════════════════════════════

import { comprobarDispositivo, esFormatoValido, huellaDispositivo, idDispositivoValido, kvGetJson, normalizarCodigo } from './_lib/codigo.js';

function parseUserAgent(ua) {
  if (!ua) return { os: 'Desconocido', browser: 'Desconocido', tipo: 'escritorio' };

  let os = 'Desconocido';
  if (/Windows NT 10/.test(ua))     os = 'Windows 10/11';
  else if (/Windows NT 6/.test(ua)) os = 'Windows 7/8';
  else if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS'; // antes que macOS: el iPhone también dice "Mac OS X"
  else if (/Android/.test(ua))      os = 'Android';
  else if (/Mac OS X/.test(ua))     os = 'macOS';
  else if (/Linux/.test(ua))        os = 'Linux';

  let browser = 'Desconocido';
  if (/Edg\//.test(ua))             browser = 'Edge';
  else if (/OPR\/|Opera/.test(ua))  browser = 'Opera';
  else if (/Firefox\//.test(ua))    browser = 'Firefox';
  else if (/Chrome\//.test(ua))     browser = 'Chrome';
  else if (/Safari\//.test(ua))     browser = 'Safari';

  const vMatch = ua.match(/(Chrome|Firefox|Safari|Edge|OPR)\/(\d+)/);
  if (vMatch) browser += ' ' + vMatch[2];

  let tipo = 'escritorio';
  if (/Mobile|Android|iPhone/.test(ua)) tipo = 'móvil';
  else if (/iPad|Tablet/.test(ua)) tipo = 'tablet';

  return { os, browser, tipo };
}

// ── EDAD MÍNIMA ───────────────────────────────────────────────────
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

// true si el perfil guardado es de un menor (por fechaNac; si no la tiene, por la edad antigua).
export function esPerfilMenor(p, hoy = new Date()) {
  if (!p || typeof p !== 'object') return false;
  const bruto = p.fechaNac ?? p.fechaNacimiento ?? p.fecha_nacimiento;
  const f = parseFecha(bruto);
  if (f) {
    let e = hoy.getUTCFullYear() - f.getUTCFullYear();
    const dm = hoy.getUTCMonth() - f.getUTCMonth();
    if (dm < 0 || (dm === 0 && hoy.getUTCDate() < f.getUTCDate())) e--;
    return e < EDAD_MINIMA;
  }
  return typeof p.edad === 'number' && p.edad < EDAD_MINIMA;
}

export default async function handler(req, res) {

  res.setHeader('Access-Control-Allow-Origin', process.env.FIT_ALLOWED_ORIGIN || 'https://fit.menarguez-ia.com');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  } catch (e) {
    return res.status(400).json({ valid: false, error: 'JSON no válido' });
  }

  const cleanCode = normalizarCodigo(body.code);
  if (!cleanCode) return res.status(400).json({ valid: false, error: 'Código requerido' });
  if (!esFormatoValido(cleanCode)) return res.status(200).json({ valid: false, error: 'Código no encontrado' });
  const dispositivo = typeof body.dispositivo === 'string' ? body.dispositivo.trim() : '';
  if (!idDispositivoValido(dispositivo)) {
    return res.status(400).json({ valid: false, error: 'Actualiza la página e inténtalo de nuevo.' });
  }

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'N/A';
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    return res.status(500).json({ valid: false, error: 'Configuración incompleta' });
  }
  const kv = {
    url: process.env.KV_REST_API_URL,
    headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`, 'Content-Type': 'application/json' },
  };
  const kvPost = (path, cuerpo) => fetch(`${kv.url}/${path}`, { method: 'POST', headers: kv.headers, body: cuerpo, signal: AbortSignal.timeout(5000) });

  try {
    const codeData = await kvGetJson(kv, `code:${cleanCode}`);
    if (!codeData) return res.status(200).json({ valid: false, error: 'Código no encontrado' });
    if (!codeData.activo) return res.status(200).json({ valid: false, error: 'Código desactivado. Contacta con info@menarguez-ia.com' });
    if (codeData.expira && new Date() > new Date(codeData.expira)) {
      return res.status(200).json({ valid: false, error: 'Código expirado. Contacta con info@menarguez-ia.com' });
    }

    const usosUsados = codeData.usos_usados || 0;
    const usosMax = codeData.usos_max || 0;
    if (usosMax > 0 && usosUsados >= usosMax) {
      return res.status(200).json({ valid: false, error: `Has agotado tus ${usosMax} análisis. Actualiza a Pro por 4,99€/mes.`, upgrade: true });
    }

    // ── DISPOSITIVO: antes de leer ningún dato personal ──────
    const estadoDisp = comprobarDispositivo(codeData, dispositivo);
    if (estadoDisp === 'otro_dispositivo') {
      return res.status(200).json({
        valid: false,
        error: 'Este código ya está en uso en otro dispositivo. Si has cambiado de dispositivo, escribe a info@menarguez-ia.com',
      });
    }

    // ── PERFIL ───────────────────────────────────────────────
    let perfilUpstash = null;
    try { perfilUpstash = await kvGetJson(kv, `profile:${cleanCode}`); }
    catch (e) { console.warn('Error leyendo perfil:', e.message); }

    // Barrera de edad: un perfil de menor no puede entrar (y no se registra el acceso).
    if (esPerfilMenor(perfilUpstash)) {
      return res.status(200).json({ valid: false, error: MSG_MENOR, menor: true });
    }

    // ── VINCULAR (primer acceso) Y REGISTRAR EL ACCESO ───────
    const { os, browser, tipo } = parseUserAgent(typeof body.userAgent === 'string' ? body.userAgent : (req.headers['user-agent'] || ''));
    const now = new Date();
    const fechaAcceso = now.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Madrid' });
    const horaAcceso = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });

    if (estadoDisp === 'sin_vincular') {
      codeData.fingerprint = huellaDispositivo(dispositivo);
      codeData.dispositivo = { os, browser, tipo, ip, fecha: fechaAcceso, hora: horaAcceso };
      await kvPost(`set/${encodeURIComponent(`code:${cleanCode}`)}`, JSON.stringify(codeData));
    }
    try {
      await kvPost('lpush/fitai:accesos', JSON.stringify(JSON.stringify({
        nombre: codeData.nombre || 'Usuario', code: cleanCode, fecha: fechaAcceso, hora: horaAcceso, tipo, os, browser, ip,
      })));
    } catch (e) { console.warn('Error registrando acceso:', e.message); }

    return res.status(200).json({
      valid: true,
      code: cleanCode,
      nombre: codeData.nombre || 'Usuario',
      plan: codeData.plan || 'free',
      usos_usados: usosUsados,
      usos_max: usosMax,
      expira: codeData.expira || null,
      perfil: perfilUpstash,
    });

  } catch (err) {
    console.error('validate-code error:', err);
    return res.status(500).json({ valid: false, error: 'Error del servidor. Inténtalo de nuevo en un momento.' });
  }
}
