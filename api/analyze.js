// ════════════════════════════════════════════════════════════════
// api/analyze.js — Menarguez Fit AI
// ════════════════════════════════════════════════════════════════
// v4:
//   - Código de acceso OBLIGATORIO (sin código válido no se llama a Claude)
//   - Valida activo / expiración / límite de usos
//   - Barrera de edad (menores bloqueados, 403 edad_minima)
//   - Modelo y max_tokens fijados en el servidor (el navegador no decide)
//   - Códigos DEMO permitidos con límite diario por IP
//   - Geolocalización por IP y stats diarias (como v3)
// ════════════════════════════════════════════════════════════════

const FREE_LIMIT = 30;   // análisis totales plan Free
const PRO_LIMIT = 0;     // 0 = ilimitado

const MODEL = process.env.FIT_MODEL || 'claude-sonnet-4-6';
const MAX_TOKENS_CAP = 500;       // tope por petición (la app pide 150-400)
const MAX_MESSAGES = 2;
const MAX_CONTENT_CHARS = 4000;

const DEMO_CODES = ['DEMO-2026', 'FIT-DEMO'];
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
function esPerfilMenor(p, hoy = new Date()) {
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

function leerJson(raw) {
  if (Array.isArray(raw)) raw = raw[0];
  if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch (e) {} }
  if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch (e) {} }
  return (raw && typeof raw === 'object') ? raw : null;
}

// Reduce el cuerpo del cliente a lo estrictamente permitido
function construirPeticion(body) {
  const msgs = body.messages;
  if (!Array.isArray(msgs) || msgs.length === 0 || msgs.length > MAX_MESSAGES) return null;
  const messages = [];
  for (const m of msgs) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) return null;
    if (typeof m.content !== 'string' || !m.content || m.content.length > MAX_CONTENT_CHARS) return null;
    messages.push({ role: m.role, content: m.content });
  }
  const pedido = Number(body.max_tokens);
  const max_tokens = Math.min(Number.isFinite(pedido) && pedido > 0 ? Math.floor(pedido) : 300, MAX_TOKENS_CAP);
  return { model: MODEL, max_tokens, messages };
}

export default async function handler(req, res) {

  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'API key no configurada' });
  }
  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;
  if (!kvUrl || !kvToken) {
    return res.status(500).json({ error: 'Configuración incompleta' });
  }
  const kvHeaders = { Authorization: `Bearer ${kvToken}`, 'Content-Type': 'application/json' };

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';

  try {
    let body;
    try {
      body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    } catch (e) {
      return res.status(400).json({ error: 'JSON no válido' });
    }

    // ── CÓDIGO OBLIGATORIO ───────────────────────────────────
    const userCode = typeof body.userCode === 'string' ? body.userCode.trim().toUpperCase() : '';
    if (!userCode) {
      return res.status(401).json({ error: 'codigo_requerido', message: 'Necesitas un código de acceso.' });
    }
    if (!/^[A-Z0-9-]{4,30}$/.test(userCode)) {
      return res.status(401).json({ error: 'codigo_invalido', message: 'Código no válido.' });
    }

    const claudeBody = construirPeticion(body);
    if (!claudeBody) {
      return res.status(400).json({ error: 'peticion_invalida' });
    }

    let usos_usados_updated = undefined;

    if (DEMO_CODES.includes(userCode)) {
      // ── DEMO: límite diario por IP ─────────────────────────
      try {
        const clave = `fitai:demo:${ip}:${new Date().toISOString().slice(0, 10)}`;
        const incr = await fetch(`${kvUrl}/incr/${encodeURIComponent(clave)}`, { method: 'POST', headers: kvHeaders });
        const n = (await incr.json()).result;
        if (typeof n !== 'number') throw new Error('incr sin resultado');
        if (n === 1) await fetch(`${kvUrl}/expire/${encodeURIComponent(clave)}/86400`, { method: 'POST', headers: kvHeaders });
        if (n > DEMO_LIMIT_DIA_IP) {
          return res.status(429).json({
            error: 'limite_alcanzado',
            message: 'Has alcanzado el límite diario de la demo. Solicita tu acceso gratuito de 2 días.',
            upgrade: false
          });
        }
      } catch (demoErr) {
        console.warn('Error límite demo:', demoErr.message);
        return res.status(503).json({ error: 'servicio_no_disponible', message: 'Inténtalo de nuevo en un momento.' });
      }
    } else {
      // ── CÓDIGO REAL ────────────────────────────────────────
      let codeData;
      try {
        // Barrera de edad: un perfil de menor no puede usar la IA
        const profResp = await fetch(`${kvUrl}/get/profile:${userCode}`, { headers: kvHeaders });
        const profData = await profResp.json();
        if (profData.result) {
          let p = profData.result;
          if (typeof p === 'string') { try { p = JSON.parse(p); } catch (e) {} }
          if (esPerfilMenor(p)) {
            return res.status(403).json({ error: 'edad_minima', message: MSG_MENOR });
          }
        }

        const getResp = await fetch(`${kvUrl}/get/code:${userCode}`, { headers: kvHeaders });
        const getData = await getResp.json();
        if (!getData.result) {
          return res.status(401).json({ error: 'codigo_invalido', message: 'Código no encontrado.' });
        }
        codeData = leerJson(getData.result);
      } catch (kvErr) {
        console.warn('Error KV:', kvErr.message);
        return res.status(503).json({ error: 'servicio_no_disponible', message: 'Inténtalo de nuevo en un momento.' });
      }

      if (!codeData) {
        return res.status(401).json({ error: 'codigo_invalido', message: 'Código no válido.' });
      }
      if (!codeData.activo) {
        return res.status(401).json({ error: 'codigo_desactivado', message: 'Código desactivado. Contacta con info@menarguez-ia.com' });
      }
      if (codeData.expira && new Date() > new Date(codeData.expira)) {
        return res.status(401).json({ error: 'codigo_expirado', message: 'Código expirado. Contacta con info@menarguez-ia.com' });
      }

      const plan = codeData.plan || 'free';
      const usosUsados = codeData.usos_usados || 0;
      const limite = plan === 'pro' ? PRO_LIMIT : FREE_LIMIT;

      // ── VERIFICAR LÍMITE ──────────────────────────────────
      if (limite > 0 && usosUsados >= limite) {
        return res.status(429).json({
          error: 'limite_alcanzado',
          message: `Has agotado tus ${limite} análisis del plan Free. Actualiza a Pro por 4,99€/mes para continuar sin límites.`,
          usos_usados: usosUsados,
          usos_max: limite,
          upgrade: true
        });
      }

      // ── INCREMENTAR USOS ──────────────────────────────────
      codeData.usos_usados = usosUsados + 1;
      usos_usados_updated = codeData.usos_usados;

      // ── GEOLOCALIZACIÓN POR IP ────────────────────────────
      if (!codeData.ubicacion && ip !== 'unknown') {
        try {
          const geoResp = await fetch(`https://ipapi.co/${ip}/json/`);
          const geoData = await geoResp.json();
          if (geoData && geoData.city) {
            codeData.ubicacion = {
              ciudad: geoData.city || '',
              region: geoData.region || '',
              pais: geoData.country_name || '',
              codigo_pais: geoData.country_code || ''
            };
          }
        } catch (geoErr) {
          console.warn('Error geolocalización:', geoErr.message);
        }
      }

      // ── GUARDAR EN UPSTASH ────────────────────────────────
      try {
        await fetch(`${kvUrl}/set/code:${userCode}`, {
          method: 'POST',
          headers: kvHeaders,
          body: JSON.stringify(codeData)
        });
      } catch (setErr) {
        console.warn('Error guardando usos:', setErr.message);
      }

      // ── STATS DIARIAS ─────────────────────────────────────
      try {
        const fechaHoy = new Date().toLocaleDateString('es-ES', {
          timeZone: 'Europe/Madrid',
          year: 'numeric', month: '2-digit', day: '2-digit'
        }).split('/').reverse().join('-');
        await fetch(`${kvUrl}/hincrby/fitai:stats:daily/${fechaHoy}/1`, {
          method: 'POST',
          headers: kvHeaders
        });
      } catch (statsErr) {
        console.warn('Error stats diarias:', statsErr.message);
      }
    }

    // ── LLAMADA A CLAUDE ─────────────────────────────────────
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(claudeBody)
    });

    const data = await response.json();
    if (usos_usados_updated !== undefined) data.usos_usados = usos_usados_updated;
    return res.status(200).json(data);

  } catch (err) {
    console.error('analyze error:', err);
    return res.status(500).json({ error: 'error_interno' });
  }
}
