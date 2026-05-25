// ════════════════════════════════════════════════════════════════
// api/save-profile-fit.js — Menarguez Fit AI
// Guarda y lee el perfil del usuario en Upstash vinculado al código
// Clave: profile:FIT-XXXX-XXXX
// ════════════════════════════════════════════════════════════════

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
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const { code, perfil } = body;
    if (!code) return res.status(400).json({ error: 'Código requerido' });
    if (!perfil || typeof perfil !== 'object') {
      return res.status(400).json({ error: 'Perfil requerido' });
    }
    const cleanCode = code.trim().toUpperCase();
    try {
      await fetch(`${kvUrl}/set/profile:${cleanCode}`, {
        method: 'POST',
        headers: kvHeaders,
        body: JSON.stringify(perfil)
      });
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
