// ════════════════════════════════════════════════════════════════
// api/validate-code.js — Menarguez Fit AI
// ════════════════════════════════════════════════════════════════

function parseUserAgent(ua) {
  if (!ua) return { os: 'Desconocido', browser: 'Desconocido', tipo: 'escritorio' };

  let os = 'Desconocido';
  if (/Windows NT 10/.test(ua))     os = 'Windows 10/11';
  else if (/Windows NT 6/.test(ua)) os = 'Windows 7/8';
  else if (/Mac OS X/.test(ua))     os = 'macOS';
  else if (/Android/.test(ua))      os = 'Android';
  else if (/iPhone|iPad/.test(ua))  os = 'iOS';
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

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  } catch (e) {
    return res.status(400).json({ valid: false, error: 'JSON no válido' });
  }
  const { code, fingerprint, userAgent } = body;

  if (!code || typeof code !== 'string') {
    return res.status(400).json({ valid: false, error: 'Código requerido' });
  }

  const cleanCode = code.trim().toUpperCase();
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'N/A';

  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    return res.status(500).json({ valid: false, error: 'Configuración incompleta' });
  }

  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  try {
    const upstashResp = await fetch(`${url}/get/code:${cleanCode}`, { headers });
    const upstashData = await upstashResp.json();

    if (!upstashData.result) {
      return res.status(200).json({ valid: false, error: 'Código no encontrado' });
    }

    let raw = upstashData.result;
    if (Array.isArray(raw)) raw = raw[0];
    if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch(e) {} }
    if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch(e) {} }
    const codeData = (raw && typeof raw === 'object') ? raw : null;

    if (!codeData) {
      return res.status(200).json({ valid: false, error: 'Error al leer el código' });
    }

    if (!codeData.activo) {
      return res.status(200).json({ valid: false, error: 'Código desactivado. Contacta con info@menarguez-ia.com' });
    }

    if (codeData.expira && new Date() > new Date(codeData.expira)) {
      return res.status(200).json({ valid: false, error: 'Código expirado. Contacta con info@menarguez-ia.com' });
    }

    const usosUsados = codeData.usos_usados || 0;
    const usosMax = codeData.usos_max || 0;
    if (usosMax > 0 && usosUsados >= usosMax) {
      return res.status(200).json({
        valid: false,
        error: `Has agotado tus ${usosMax} análisis. Actualiza a Pro por 4,99€/mes.`,
        upgrade: true
      });
    }

    // ── LEER PERFIL DESDE UPSTASH ────────────────────────────
    let perfilUpstash = null;
    try {
      const perfilResp = await fetch(`${url}/get/profile:${cleanCode}`, { headers });
      const perfilData = await perfilResp.json();
      if (perfilData.result) {
        let p = perfilData.result;
        if (typeof p === 'string') { try { p = JSON.parse(p); } catch(e) {} }
        if (p && typeof p === 'object') perfilUpstash = p;
      }
    } catch(e) {
      console.warn('Error leyendo perfil:', e.message);
    }

    // Barrera de edad: un perfil de menor no puede entrar (y no se registra el acceso).
    if (esPerfilMenor(perfilUpstash)) {
      return res.status(200).json({ valid: false, error: MSG_MENOR, menor: true });
    }

    if (fingerprint) {
      const { os, browser, tipo } = parseUserAgent(userAgent || req.headers['user-agent'] || '');
      const now = new Date();
      const fechaAcceso = now.toLocaleDateString('es-ES', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        timeZone: 'Europe/Madrid'
      });
      const horaAcceso = now.toLocaleTimeString('es-ES', {
        hour: '2-digit', minute: '2-digit',
        timeZone: 'Europe/Madrid'
      });

      const registroAcceso = JSON.stringify({
        nombre: codeData.nombre || 'Usuario',
        code: cleanCode,
        fecha: fechaAcceso,
        hora: horaAcceso,
        tipo,
        os,
        browser,
        ip
      });

      if (!codeData.fingerprint) {
        codeData.fingerprint = fingerprint;
        codeData.dispositivo = { os, browser, tipo, ip, fecha: fechaAcceso, hora: horaAcceso };

        await fetch(`${url}/set/code:${cleanCode}`, {
          method: 'POST',
          headers,
          body: JSON.stringify(codeData)
        });

        await fetch(`${url}/lpush/fitai:accesos`, {
          method: 'POST',
          headers,
          body: JSON.stringify(registroAcceso)
        });

      } else if (codeData.fingerprint !== fingerprint) {
        const disp = codeData.dispositivo
          ? `${codeData.dispositivo.os} · ${codeData.dispositivo.browser} (${codeData.dispositivo.ip})`
          : 'otro dispositivo';
        return res.status(200).json({
          valid: false,
          error: `Este código está vinculado a ${disp}. Contacta con info@menarguez-ia.com`
        });

      } else {
        await fetch(`${url}/lpush/fitai:accesos`, {
          method: 'POST',
          headers,
          body: JSON.stringify(registroAcceso)
        });
      }
    }

    return res.status(200).json({
      valid: true,
      code: cleanCode,
      nombre: codeData.nombre || 'Usuario',
      plan: codeData.plan || 'free',
      usos_usados: usosUsados,
      usos_max: usosMax,
      expira: codeData.expira || null,
      perfil: perfilUpstash  // null si no tiene perfil aún
    });

  } catch (err) {
    console.error('validate-code error:', err);
    return res.status(500).json({ valid: false, error: 'Error del servidor: ' + err.message });
  }
}
