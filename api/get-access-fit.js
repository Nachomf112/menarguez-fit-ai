// ════════════════════════════════════════════════════════════════
// api/get-access-fit.js — Menarguez Fit AI Admin
// ════════════════════════════════════════════════════════════════

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-pass');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const adminPass = req.headers['x-admin-pass'];
  if (!adminPass || adminPass !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;
  const kvHeaders = { Authorization: `Bearer ${kvToken}` };

  try {
    const resp = await fetch(`${kvUrl}/lrange/fitai:accesos/0/99`, { headers: kvHeaders });
    const data = await resp.json();
    const raw = data.result || [];

    const accesos = raw.map(item => {
      try {
        let parsed = item;
        if (typeof parsed === 'string') parsed = JSON.parse(parsed);
        return parsed;
      } catch { return null; }
    }).filter(Boolean);

    return res.status(200).json({ accesos });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
