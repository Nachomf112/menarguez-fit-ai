// ════════════════════════════════════════════════════════════════
// api/get-access-fit.js — Menarguez Fit AI Admin (v2, M8)
// Requiere sesión de administración (Authorization: Bearer <token>).
// ════════════════════════════════════════════════════════════════
import { cabecerasAdmin, cuerpoJson, exigirAdmin, kvAdmin } from './_lib/admin.js';

export default async function handler(req, res) {
  cabecerasAdmin(res, 'GET, POST');
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const kv = kvAdmin();
  if (!(await exigirAdmin(req, res, kv))) return;
  const kvFetch = (ruta, opts = {}) => fetch(`${kv.url}/${ruta}`, { headers: kv.headers, signal: AbortSignal.timeout(5000), ...opts });

  // ── POST: eliminar acceso ────────────────────────────────────
  if (req.method === 'POST') {
    const body = cuerpoJson(req);
    if (body.action !== 'delete' || !Number.isInteger(body.idx) || body.idx < 0 || body.idx > 199) {
      return res.status(400).json({ error: 'Acción no válida' });
    }
    try {
      const placeholder = '__DELETED__';
      await kvFetch(`lset/fitai:accesos/${body.idx}`, { method: 'POST', body: JSON.stringify(placeholder) });
      await kvFetch('lrem/fitai:accesos/1', { method: 'POST', body: JSON.stringify(placeholder) });
      return res.status(200).json({ ok: true });
    } catch {
      return res.status(500).json({ error: 'No se pudo eliminar el acceso' });
    }
  }

  // ── GET: listar accesos ──────────────────────────────────────
  try {
    const resp = await kvFetch('lrange/fitai:accesos/0/199');
    if (!resp.ok) throw new Error('Upstash');
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
  } catch {
    return res.status(500).json({ error: 'No se pudieron cargar los accesos' });
  }
}
