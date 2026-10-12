// ════════════════════════════════════════════════════════════════
// api/save-profile-fit.js — Menarguez Fit AI
// Guarda y lee el perfil del usuario en Upstash vinculado al código
// Clave: profile:FIT-XXXX-XXXX
// v2: barrera de edad mínima (18) en el servidor al guardar el perfil
// ════════════════════════════════════════════════════════════════

const EDAD_MINIMA = 18;
const EDAD_MAXIMA = 120;

// Acepta "YYYY-MM-DD" (input type=date) y "DD/MM/YYYY". Devuelve Date UTC o null.
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

function edadEn(fecha, hoy = new Date()) {
  let e = hoy.getUTCFullYear() - fecha.getUTCFullYear();
  const dm = hoy.getUTCMonth() - fecha.getUTCMonth();
  if (dm < 0 || (dm === 0 && hoy.getUTCDate() < fecha.getUTCDate())) e--;
  return e;
}

// Devuelve null si el perfil es válido, o { status, error, mensaje } si hay que rechazarlo.
export function validarEdad(perfil, hoy = new Date()) {
  const bruto = perfil.fechaNac ?? perfil.fechaNacimiento ?? perfil.fecha_nacimiento;
  const fecha = parseFecha(bruto);
  if (!fecha) {
    return { status: 400, error: 'fecha_nacimiento_invalida', mensaje: 'Indica una fecha de nacimiento válida.' };
  }
  const edad = edadEn(fecha, hoy);
  if (edad < 0 || edad > EDAD_MAXIMA) {
    return { status: 400, error: 'fecha_nacimiento_invalida', mensaje: 'Indica una fecha de nacimiento válida.' };
  }
  if (edad < EDAD_MINIMA) {
    return { status: 403, error: 'edad_minima', mensaje: `Menarguez Fit AI es solo para mayores de ${EDAD_MINIMA} años.` };
  }
  return null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    return res.status(500).json({ error: 'Configuración incompleta' });
  }

  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;
  const kvHeaders = {
    Authorization: `Bearer ${kvToken}`,
    'Content-Type': 'application/json'
  };

  // ── POST: guardar perfil ─────────────────────────────────────
  if (req.method === 'POST') {
    let body;
    try {
      body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    } catch (e) {
      return res.status(400).json({ error: 'JSON no válido' });
    }
    const { code, perfil } = body;
    if (!code || typeof code !== 'string') return res.status(400).json({ error: 'Código requerido' });
    if (!perfil || typeof perfil !== 'object' || Array.isArray(perfil)) {
      return res.status(400).json({ error: 'Perfil requerido' });
    }
    const rechazo = validarEdad(perfil);
    if (rechazo) {
      return res.status(rechazo.status).json({ error: rechazo.error, mensaje: rechazo.mensaje });
    }
    const cleanCode = code.trim().toUpperCase();
    try {
      const r = await fetch(`${kvUrl}/set/profile:${cleanCode}`, {
        method: 'POST',
        headers: kvHeaders,
        body: JSON.stringify(perfil)
      });
      if (!r.ok) return res.status(502).json({ error: 'No se pudo guardar el perfil' });
      return res.status(200).json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── GET: leer perfil ─────────────────────────────────────────
  if (req.method === 'GET') {
    const urlObj = new URL(req.url, 'https://fit.menarguez-ia.com');
    const codeParam = urlObj.searchParams.get('code') || '';
    if (!codeParam) return res.status(400).json({ error: 'Código requerido' });
    const cleanParam = codeParam.trim().toUpperCase();
    try {
      const resp = await fetch(`${kvUrl}/get/profile:${cleanParam}`, { headers: kvHeaders });
      const data = await resp.json();
      if (!data.result) return res.status(200).json({ perfil: null });
      let raw = data.result;
      if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch(e) {} }
      return res.status(200).json({ perfil: raw });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Método no permitido' });
}
