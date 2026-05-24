// ════════════════════════════════════════════════════════════════
// api/get-codes-fit.js — Menarguez Fit AI Admin
// ════════════════════════════════════════════════════════════════

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-pass');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const adminPass = req.headers['x-admin-pass'];
  if (!adminPass || adminPass !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;
  const kvHeaders = {
    Authorization: `Bearer ${kvToken}`,
    'Content-Type': 'application/json'
  };

  // ── POST: acciones sobre códigos ────────────────────────────
  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const { action, code } = body;

    try {
      if (action === 'reset_fingerprint') {
        const getResp = await fetch(`${kvUrl}/get/code:${code}`, { headers: kvHeaders });
        const getData = await getResp.json();
        let raw = getData.result;
        if (Array.isArray(raw)) raw = raw[0];
        if (typeof raw === 'string') raw = JSON.parse(raw);
        if (typeof raw === 'string') raw = JSON.parse(raw);
        raw.fingerprint = null;
        raw.dispositivo = null;
        await fetch(`${kvUrl}/set/code:${code}`, {
          method: 'POST', headers: kvHeaders,
          body: JSON.stringify(raw)
        });
        return res.status(200).json({ ok: true });
      }

      if (action === 'toggle_activo') {
        const getResp = await fetch(`${kvUrl}/get/code:${code}`, { headers: kvHeaders });
        const getData = await getResp.json();
        let raw = getData.result;
        if (Array.isArray(raw)) raw = raw[0];
        if (typeof raw === 'string') raw = JSON.parse(raw);
        if (typeof raw === 'string') raw = JSON.parse(raw);
        raw.activo = body.activo;
        await fetch(`${kvUrl}/set/code:${code}`, {
          method: 'POST', headers: kvHeaders,
          body: JSON.stringify(raw)
        });
        return res.status(200).json({ ok: true });
      }

      // ── EXTEND: actualizar fecha de expiración ──────────────
      if (action === 'extend') {
        const getResp = await fetch(`${kvUrl}/get/code:${code}`, { headers: kvHeaders });
        const getData = await getResp.json();
        let raw = getData.result;
        if (Array.isArray(raw)) raw = raw[0];
        if (typeof raw === 'string') raw = JSON.parse(raw);
        if (typeof raw === 'string') raw = JSON.parse(raw);
        raw.expira = body.expira;
        raw.activo = true; // reactivar si estaba expirado
        await fetch(`${kvUrl}/set/code:${code}`, {
          method: 'POST', headers: kvHeaders,
          body: JSON.stringify(raw)
        });
        return res.status(200).json({ ok: true });
      }

      if (action === 'delete') {
        await fetch(`${kvUrl}/del/code:${code}`, { method: 'POST', headers: kvHeaders });
        return res.status(200).json({ ok: true });
      }

    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
  // ── GET: stats diarias ──────────────────────────────────────
  if (req.method === 'GET' && req.query?.stats === 'daily') {
    try {
      const resp = await fetch(`${kvUrl}/hgetall/fitai:stats:daily`, { headers: kvHeaders });
      const data = await resp.json();
      const statsDaily = data.result || {};
      return res.status(200).json({ statsDaily });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
  // ── GET: listar todos los códigos FIT ───────────────────────
  try {
    const keysResp = await fetch(`${kvUrl}/keys/code:FIT-*`, { headers: kvHeaders });
    const keysData = await keysResp.json();
    const keys = keysData.result || [];

    const codes = await Promise.all(keys.map(async key => {
      try {
        const r = await fetch(`${kvUrl}/get/${key}`, { headers: kvHeaders });
        const d = await r.json();
        let raw = d.result;
        if (Array.isArray(raw)) raw = raw[0];
        if (typeof raw === 'string') raw = JSON.parse(raw);
        if (typeof raw === 'string') raw = JSON.parse(raw);
        if (!raw || typeof raw !== 'object') return null;
        raw.code = key.replace('code:', '');
        return raw;
      } catch { return null; }
    }));

    const validCodes = codes.filter(Boolean).sort((a, b) => {
      const da = a.fecha_registro || '';
      const db = b.fecha_registro || '';
      return db.localeCompare(da);
    });

    return res.status(200).json({ codes: validCodes, total: validCodes.length });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
