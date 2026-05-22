// ════════════════════════════════════════════════════════════════
// api/tally-webhook.js — Menarguez Fit AI
// ════════════════════════════════════════════════════════════════
// FUNCIÓN: Recibe formulario Tally → genera código FIT → 
//          guarda en Upstash → llama a Make para enviar email
// ════════════════════════════════════════════════════════════════

const MAKE_WEBHOOK_URL = 'https://hook.eu2.make.com/9equz6x2exk8phqz1vjyzwy75zy7z6y6';

function generateFitCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'FIT-';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  code += '-';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function getExpiryDate(days = 2) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0]; // YYYY-MM-DD
}

function extractTallyFields(data) {
  const result = { nombre: '', email: '', telefono: '', conociste: '', objetivo: '' };

  if (!data?.data?.fields) return result;

  for (const field of data.data.fields) {
    const label = (field.label || '').toLowerCase();
    const value = Array.isArray(field.value)
      ? field.value.map(v => v?.text || v).join(', ')
      : (field.value || '');

    if (label.includes('nombre')) result.nombre = value;
    else if (label.includes('email')) result.email = value;
    else if (label.includes('tel')) result.telefono = value;
    else if (label.includes('conociste') || label.includes('conocis')) result.conociste = value;
    else if (label.includes('deseas') || label.includes('conseguir') || label.includes('objetivo')) result.objetivo = value;
  }

  return result;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const fields = extractTallyFields(body);

    if (!fields.email) {
      return res.status(400).json({ error: 'Email requerido' });
    }

    // ── GENERAR CÓDIGO ÚNICO ─────────────────────────────────
    const code = generateFitCode();
    const expira = getExpiryDate(2);

    const codeData = {
      nombre: fields.nombre || 'Usuario',
      email: fields.email,
      telefono: fields.telefono || '',
      conociste: fields.conociste || '',
      objetivo: fields.objetivo || '',
      plan: 'free',
      modulos: ['all'],
      usos_max: 100,
      usos_usados: 0,
      expira,
      activo: true,
      app: 'fit',
      fecha_registro: new Date().toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid' })
    };

    // ── GUARDAR EN UPSTASH ───────────────────────────────────
    if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
      return res.status(500).json({ error: 'Upstash no configurado' });
    }

    const kvUrl = process.env.KV_REST_API_URL;
    const kvToken = process.env.KV_REST_API_TOKEN;
    const kvHeaders = {
      Authorization: `Bearer ${kvToken}`,
      'Content-Type': 'application/json'
    };

    await fetch(`${kvUrl}/set/code:${code}`, {
      method: 'POST',
      headers: kvHeaders,
      body: JSON.stringify(codeData)
    });

    // ── LLAMAR A MAKE ────────────────────────────────────────
    await fetch(MAKE_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre: fields.nombre || 'Usuario',
        email: fields.email,
        telefono: fields.telefono || '',
        conociste: fields.conociste || '',
        objetivo: fields.objetivo || '',
        codigo: code,
        expira,
        app: 'Menarguez Fit AI',
        url_app: 'https://fit.menarguez-ia.com',
        plan: 'Free (2 días)'
      })
    });

    return res.status(200).json({ success: true, code });

  } catch (err) {
    console.error('tally-webhook error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
