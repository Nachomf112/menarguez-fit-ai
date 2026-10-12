// ════════════════════════════════════════════════════════════════
// api/tally-webhook.js — Menarguez Fit AI
// ════════════════════════════════════════════════════════════════
// FUNCIÓN: Recibe formulario Tally → genera código FIT (Free) →
//          guarda en Upstash → avisa a Make para enviar el email
// v2 (12/10/2026):
//   - Firma de Tally verificada (cabecera Tally-Signature, HMAC-SHA256
//     en base64 sobre el cuerpo RAW). Sin firma válida no se hace nada:
//     antes cualquiera podía crear códigos y disparar emails.
//   - URL de Make en variable de entorno (el repo es público).
//   - Código Free DETERMINISTA por envío (HMAC del submissionId): si Tally
//     reintenta, se obtiene el mismo código y no se pisan los usos.
//   - Código generado con HMAC (impredecible), no con Math.random().
//   - Ya no se devuelve el código en la respuesta ni hay CORS abierto.
//   - Se comprueba que Upstash guarda y que Make acepta (si no, 5xx y
//     Tally reintenta).
// Variables: TALLY_SIGNING_SECRET, MAKE_WEBHOOK_FREE,
//            KV_REST_API_URL, KV_REST_API_TOKEN
// ════════════════════════════════════════════════════════════════

import crypto from 'node:crypto';

// La firma se calcula sobre el cuerpo exacto: Vercel no debe parsearlo antes.
export const config = { api: { bodyParser: false } };

const DIAS_FREE = 2;
const USOS_FREE = 30;
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // sin 0/O/1/I

// ─── Firma de Tally ────────────────────────────────────────────────────────────

export function verificarFirmaTally(rawBody, header, secret) {
  if (!secret) throw new Error('Signing secret no configurado');
  if (!header || typeof header !== 'string') throw new Error('Falta la cabecera Tally-Signature');

  const esperada = crypto.createHmac('sha256', secret).update(rawBody).digest();
  let recibida;
  try { recibida = Buffer.from(header.trim(), 'base64'); } catch { recibida = Buffer.alloc(0); }
  if (recibida.length !== esperada.length || !crypto.timingSafeEqual(recibida, esperada)) {
    throw new Error('La firma no coincide con el cuerpo recibido');
  }
  return JSON.parse(rawBody.toString('utf8'));
}

// ─── Código Free: determinista e impredecible ──────────────────────────────────

export function codigoFree(idEnvio, secret) {
  const h = crypto.createHmac('sha256', secret).update(`fit-free:${idEnvio}`).digest();
  let s = '';
  for (let i = 0; i < 8; i++) s += ALFABETO[h[i] % ALFABETO.length];
  return `FIT-${s.slice(0, 4)}-${s.slice(4)}`;
}

function fechaExpiracion(dias) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().split('T')[0];   // YYYY-MM-DD
}

// ─── Campos del formulario ─────────────────────────────────────────────────────

export function extractTallyFields(data) {
  const result = { nombre: '', email: '', telefono: '', conociste: '', objetivo: '' };
  if (!Array.isArray(data?.data?.fields)) return result;

  for (const field of data.data.fields) {
    const label = (field.label || '').toLowerCase();
    // Campos de opciones: value = ids; el texto está en options (si existe)
    let value = field.value;
    if (Array.isArray(value)) {
      const opciones = Array.isArray(field.options) ? field.options : [];
      value = value.map(v => {
        if (v && typeof v === 'object') return v.text || '';
        const op = opciones.find(o => o.id === v);
        return op ? op.text : v;
      }).join(', ');
    }
    value = (value === null || value === undefined) ? '' : String(value).slice(0, 300);

    if (label.includes('nombre')) result.nombre = value;
    else if (label.includes('email')) result.email = value;
    else if (label.includes('tel')) result.telefono = value;
    else if (label.includes('conociste') || label.includes('conocis')) result.conociste = value;
    else if (label.includes('deseas') || label.includes('conseguir') || label.includes('objetivo')) result.objetivo = value;
  }
  return result;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ─── Upstash ───────────────────────────────────────────────────────────────────

function kvConfig() {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error('Upstash no configurado');
  return { url, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } };
}

async function upstashExists(key) {
  const { url, headers } = kvConfig();
  const res = await fetch(`${url}/exists/${encodeURIComponent(key)}`, { headers });
  if (!res.ok) throw new Error('Upstash lectura fallida');
  const data = await res.json();
  return Number(data.result) === 1;
}

async function upstashSet(key, value) {
  const { url, headers } = kvConfig();
  const res = await fetch(`${url}/set/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(value),
  });
  return res.ok;
}

// ─── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const secret = process.env.TALLY_SIGNING_SECRET;
  const hook = process.env.MAKE_WEBHOOK_FREE;
  if (!secret || !hook) {
    console.error('tally-webhook: faltan TALLY_SIGNING_SECRET o MAKE_WEBHOOK_FREE');
    return res.status(500).json({ error: 'Configuración incompleta' });
  }

  const raw = await leerCuerpo(req);

  let body;
  try {
    body = verificarFirmaTally(raw, req.headers['tally-signature'], secret);
  } catch (err) {
    console.error('Tally signature error:', err.message);
    return res.status(401).json({ error: 'firma_no_valida' });
  }

  try {
    const fields = extractTallyFields(body);
    if (!EMAIL_RE.test(fields.email)) {
      return res.status(400).json({ error: 'Email requerido' });
    }

    // Mismo envío de Tally → mismo código (idempotente ante reintentos)
    const idEnvio = body?.data?.submissionId || body?.data?.responseId || body?.eventId;
    if (!idEnvio) return res.status(400).json({ error: 'Envío sin identificador' });

    const code = codigoFree(idEnvio, secret);
    const expira = fechaExpiracion(DIAS_FREE);

    // Si ya existe (reintento) no se sobrescribe: se conservan usos y dispositivo
    let existe;
    try { existe = await upstashExists(`code:${code}`); }
    catch (e) { console.error(e.message); return res.status(500).json({ error: 'error_interno' }); }

    if (!existe) {
      const ok = await upstashSet(`code:${code}`, {
        nombre: fields.nombre || 'Usuario',
        email: fields.email,
        telefono: fields.telefono,
        conociste: fields.conociste,
        objetivo: fields.objetivo,
        plan: 'free',
        modulos: ['all'],
        usos_max: USOS_FREE,
        usos_usados: 0,
        expira,
        activo: true,
        app: 'fit',
        fecha_registro: new Date().toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid' }),
      });
      if (!ok) {
        console.error('No se pudo guardar el código Free en Upstash');
        return res.status(500).json({ error: 'No se pudo guardar el código' });
      }
    }

    // Si Make falla se responde 502: Tally reintenta y el código no cambia
    const aviso = await fetch(hook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre: fields.nombre || 'Usuario',
        email: fields.email,
        telefono: fields.telefono,
        conociste: fields.conociste,
        objetivo: fields.objetivo,
        codigo: code,
        expira,
        app: 'Menarguez Fit AI',
        url_app: 'https://fit.menarguez-ia.com',
        plan: `Free (${DIAS_FREE} días)`,
      }),
    });
    if (!aviso.ok) {
      console.error('Make no aceptó el aviso Free');
      return res.status(502).json({ error: 'Aviso a Make fallido' });
    }

    console.log(`Free creado: ${code}`);
    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('tally-webhook error:', err.message);
    return res.status(500).json({ error: 'error_interno' });
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

async function leerCuerpo(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}
