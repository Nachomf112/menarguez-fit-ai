// ════════════════════════════════════════════════════════════════
// api/get-codes-fit.js — Menarguez Fit AI Admin (v2, M8)
// Requiere sesión de administración (Authorization: Bearer <token>).
// ════════════════════════════════════════════════════════════════
import { cabecerasAdmin, codigoAdmin, cuerpoJson, exigirAdmin, fechaValida, kvAdmin } from './_lib/admin.js';
import { kvGetJson } from './_lib/codigo.js';

export default async function handler(req, res) {
  cabecerasAdmin(res, 'GET, POST');
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const kv = kvAdmin();
  if (!(await exigirAdmin(req, res, kv))) return;
  const kvFetch = (ruta, opts = {}) => fetch(`${kv.url}/${ruta}`, { headers: kv.headers, signal: AbortSignal.timeout(5000), ...opts });
  const claveCodigo = (c) => encodeURIComponent('code:' + c);
  // Uso de /entreno (hash entreno:<código>): { primer_acceso, ultimo_acceso, aperturas } o null
  const usoEntreno = async (c) => {
    try {
      const r = await kvFetch(`hgetall/${encodeURIComponent('entreno:' + c)}`);
      if (!r.ok) return null;
      const res = (await r.json()).result;
      const o = {};
      if (Array.isArray(res)) for (let i = 0; i + 1 < res.length; i += 2) o[res[i]] = res[i + 1];
      else if (res && typeof res === 'object') Object.assign(o, res);
      if (!o.aperturas) return null;
      return { primer_acceso: o.primer_acceso || null, ultimo_acceso: o.ultimo_acceso || null, aperturas: Number(o.aperturas) || 0 };
    } catch { return null; }
  };

  // ── POST: acciones sobre códigos ────────────────────────────
  if (req.method === 'POST') {
    const body = cuerpoJson(req);
    const { action } = body;
    const code = codigoAdmin(body.code);
    if (!code) return res.status(400).json({ error: 'Código no válido' });

    // Lee el código, aplica el cambio y lo guarda. 404 si no existe.
    const modificar = async (cambio) => {
      const raw = await kvGetJson(kv, 'code:' + code);
      if (!raw) return res.status(404).json({ error: 'El código no existe' });
      cambio(raw);
      const r = await kvFetch(`set/${claveCodigo(code)}`, { method: 'POST', body: JSON.stringify(raw) });
      if (!r.ok) throw new Error('Upstash SET');
      return res.status(200).json({ ok: true });
    };

    try {
      if (action === 'reset_fingerprint') {
        return await modificar((raw) => { raw.fingerprint = null; raw.dispositivo = null; });
      }

      // Vuelve a dejar todos los análisis de IA disponibles (plan Free)
      if (action === 'reset_usos') {
        return await modificar((raw) => { raw.usos_usados = 0; });
      }

      if (action === 'toggle_activo') {
        if (typeof body.activo !== 'boolean') return res.status(400).json({ error: 'Valor no válido' });
        return await modificar((raw) => { raw.activo = body.activo; });
      }

      // ── EXTEND: actualizar fecha de expiración ──────────────
      if (action === 'extend') {
        if (!fechaValida(body.expira)) return res.status(400).json({ error: 'Fecha no válida' });
        return await modificar((raw) => {
          raw.expira = body.expira;
          raw.activo = true; // reactivar si estaba expirado
        });
      }

      if (action === 'delete') {
        await kvFetch(`del/${claveCodigo(code)}`, { method: 'POST' });
        // Al borrar el código se borra también su perfil (datos personales), para no dejar perfiles huérfanos.
        await kvFetch(`del/${encodeURIComponent('profile:' + code)}`, { method: 'POST' });
        await kvFetch(`del/${encodeURIComponent('entreno:' + code)}`, { method: 'POST' });
        await kvFetch(`del/${encodeURIComponent('ultimo:' + code)}`, { method: 'POST' });
        return res.status(200).json({ ok: true });
      }

      return res.status(400).json({ error: 'Acción no válida' });
    } catch {
      return res.status(500).json({ error: 'No se pudo completar la acción' });
    }
  }

  // ── GET: stats diarias ──────────────────────────────────────
  if (req.query?.stats === 'daily') {
    try {
      const resp = await kvFetch('hgetall/fitai:stats:daily');
      if (!resp.ok) throw new Error('Upstash');
      const data = await resp.json();
      const statsDaily = data.result || {};
      return res.status(200).json({ statsDaily });
    } catch {
      return res.status(500).json({ error: 'No se pudieron cargar las estadísticas' });
    }
  }

  // ── GET: listar todos los códigos FIT ───────────────────────
  try {
    const keysResp = await kvFetch('keys/code:FIT-*');
    if (!keysResp.ok) throw new Error('Upstash');
    const keysData = await keysResp.json();
    const keys = keysData.result || [];

    const codes = await Promise.all(keys.map(async key => {
      try {
        const raw = await kvGetJson(kv, key);
        if (!raw) return null;
        raw.code = key.replace('code:', '');
        raw.entreno = await usoEntreno(raw.code);
        return raw;
      } catch { return null; }
    }));

    const validCodes = codes.filter(Boolean).sort((a, b) => {
      const da = a.fecha_registro || '';
      const db = b.fecha_registro || '';
      return db.localeCompare(da);
    });

    return res.status(200).json({ codes: validCodes, total: validCodes.length });
  } catch {
    return res.status(500).json({ error: 'No se pudieron cargar los códigos' });
  }
}
