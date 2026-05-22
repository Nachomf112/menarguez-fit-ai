// ════════════════════════════════════════════════════════════════
// api/get-access-fit.js — Menarguez Fit AI Admin
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

  // ── POST: eliminar acceso ────────────────────────────────────
  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});

    if (body.action === 'delete' && typeof body.idx === 'number') {
      try {
        // Marcar como DELETED y luego limpiar
        await fetch(`${kvUrl}/lset/fitai:accesos/${body.idx}/DELETED`, {
          method: 'POST',
          headers: kvHeaders,
          body: JSON.stringify('DELETED')
        });
        await fetch(`${kvUrl}/lrem/fitai:accesos/1/DELETED`, {
          method: 'POST',
          headers: kvHeaders,
          body: JSON.stringify('DELETED')
        });
        return res.status(200).json({ ok: true });
      } catch (err) {
        return res.status(500).json({ error: err.message });
      }
    }

    return res.status(400).json({ error: 'Acción no válida' });
  }

  // ── GET: listar accesos ──────────────────────────────────────
  try {
    const resp = await fetch(`${kvUrl}/lrange/fitai:accesos/0/199`, { headers: kvHeaders });
    const data = await resp.json();
    const raw = data.result || [];

    const accesos = raw.map(item => {
      try {
        let parsed = item;
        if (typeof parsed === 'string') parsed = JSON.parse(parsed);
        if (typeof parsed === 'string') parsed = JSON.parse(parsed);
        return parsed;
      } catch { return null; }
    }).filter(Boolean);

    return res.status(200).json({ accesos });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
