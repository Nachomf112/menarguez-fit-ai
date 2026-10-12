// ════════════════════════════════════════════════════════════════
// api/stripe-webhook-fit.js — Menarguez Fit AI
// ════════════════════════════════════════════════════════════════
// v2 (12/10/2026):
//   - SIN dependencia 'stripe' (no hay package.json): la firma se verifica
//     con el módulo crypto de Node.
//   - bodyParser desactivado: la firma se calcula sobre el cuerpo RAW.
//   - Código Pro DETERMINISTA (HMAC de la sesión de checkout): si Stripe
//     reintenta el evento se obtiene el mismo código, no uno nuevo.
//   - Código generado con HMAC (impredecible), no con Math.random().
//   - Lectura de Upstash tolerante a doble serialización (["{...}"]).
//   - SCAN completo con cursor.
//   - URL de Make en variable de entorno MAKE_WEBHOOK_PRO (el repo es público).
// Variables: STRIPE_WEBHOOK_SECRET_FIT, KV_REST_API_URL, KV_REST_API_TOKEN,
//            MAKE_WEBHOOK_PRO
// ════════════════════════════════════════════════════════════════

import crypto from 'node:crypto';

// Stripe firma el cuerpo exacto: Vercel no debe parsearlo antes.
export const config = { api: { bodyParser: false } };

const TOLERANCIA_SEG = 300;   // 5 min, igual que la librería oficial

// ─── Verificación de firma Stripe (esquema v1) ─────────────────────────────────

export function verificarFirmaStripe(rawBody, header, secret, ahora = Date.now()) {
  if (!secret) throw new Error('Webhook secret no configurado');
  if (!header || typeof header !== 'string') throw new Error('Falta la cabecera stripe-signature');

  let t = null;
  const firmas = [];
  for (const parte of header.split(',')) {
    const i = parte.indexOf('=');
    if (i < 0) continue;
    const k = parte.slice(0, i).trim();
    const v = parte.slice(i + 1).trim();
    if (k === 't') t = v;
    else if (k === 'v1') firmas.push(v);
  }
  if (!t || !/^\d+$/.test(t) || firmas.length === 0) throw new Error('Cabecera stripe-signature no válida');

  const esperada = crypto.createHmac('sha256', secret).update(`${t}.`).update(rawBody).digest('hex');
  const esperadaBuf = Buffer.from(esperada, 'hex');
  const coincide = firmas.some(f => {
    if (!/^[0-9a-f]{64}$/i.test(f)) return false;
    return crypto.timingSafeEqual(Buffer.from(f, 'hex'), esperadaBuf);
  });
  if (!coincide) throw new Error('La firma no coincide con el cuerpo recibido');

  if (Math.abs(ahora / 1000 - Number(t)) > TOLERANCIA_SEG) {
    throw new Error('Marca de tiempo fuera de la tolerancia');
  }
  return JSON.parse(rawBody.toString('utf8'));
}

// ─── Upstash helpers ───────────────────────────────────────────────────────────

function kvConfig() {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error('Upstash no configurado');
  return { url, headers: { Authorization: `Bearer ${token}` } };
}

// Desenvuelve ["{...}"] y strings JSON hasta obtener el objeto
function desempaquetar(raw) {
  for (let i = 0; i < 3; i++) {
    if (Array.isArray(raw)) raw = raw[0];
    if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch { return null; } }
  }
  return (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : null;
}

async function upstashGet(key) {
  const { url, headers } = kvConfig();
  const res = await fetch(`${url}/get/${encodeURIComponent(key)}`, { headers });
  const data = await res.json();
  if (!data.result) return null;
  return desempaquetar(data.result);
}

// Guarda el objeto como UN solo JSON (los lectores aceptan ambos formatos)
async function upstashSet(key, value) {
  const { url, headers } = kvConfig();
  const res = await fetch(`${url}/set/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
  });
  return res.ok;
}

async function upstashScan(pattern) {
  const { url, headers } = kvConfig();
  const todas = [];
  let cursor = '0';
  for (let vuelta = 0; vuelta < 50; vuelta++) {
    const res = await fetch(
      `${url}/scan/${cursor}/match/${encodeURIComponent(pattern)}/count/200`,
      { headers }
    );
    const data = await res.json();
    if (!Array.isArray(data.result)) break;
    cursor = String(data.result[0]);
    todas.push(...(data.result[1] || []));
    if (cursor === '0') break;
  }
  return todas;
}

// ─── Buscar código FIT-* por stripe_subscription_id ────────────────────────────

async function findCodeBySubscription(subscriptionId) {
  const keys = await upstashScan('code:FIT-*');
  for (const key of keys) {
    const codeData = await upstashGet(key);
    if (codeData && codeData.stripe_subscription_id === subscriptionId) {
      return { key, codeData };
    }
  }
  return null;
}

// ─── Código Pro: determinista e impredecible ───────────────────────────────────

const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export function codigoPro(sessionId, secret) {
  const h = crypto.createHmac('sha256', secret).update(`fit-pro:${sessionId}`).digest();
  let s = '';
  for (let i = 0; i < 8; i++) s += ALFABETO[h[i] % ALFABETO.length];
  return `FIT-${s.slice(0, 4)}-${s.slice(4)}`;
}

// ─── Notificar a Make (Google Sheets + Gmail) ──────────────────────────────────

async function notificarMake(payload) {
  const hook = process.env.MAKE_WEBHOOK_PRO;
  if (!hook) {
    console.warn('MAKE_WEBHOOK_PRO no configurada: no se envía el aviso a Make');
    return true;
  }
  const res = await fetch(hook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.ok;
}

// ─── Handler principal ─────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET_FIT;
  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET_FIT no configurada');
    return res.status(500).json({ error: 'Configuración incompleta' });
  }

  // Cuerpo RAW para verificar la firma
  const buf = await buffer(req);
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = verificarFirmaStripe(buf, sig, webhookSecret);
  } catch (err) {
    console.error('Stripe signature error:', err.message);
    return res.status(400).json({ error: 'Webhook Error: firma no válida' });
  }

  try {
    // ── checkout.session.completed → Alta Pro ─────────────────────────────────
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;

      const nombre = session.customer_details?.name || 'Usuario';
      const email = session.customer_details?.email || '';
      const customerId = session.customer;
      const subscriptionId = session.subscription;

      // Mismo session.id → mismo código (idempotente ante reintentos de Stripe)
      const code = codigoPro(session.id, webhookSecret);

      // Si ya existe (reintento), no se sobrescribe: se conservan usos y dispositivo
      let codeData = await upstashGet(`code:${code}`);
      if (!codeData) {
        const expira = new Date();
        expira.setFullYear(expira.getFullYear() + 1);

        codeData = {
          nombre,
          email,
          plan: 'pro',
          modulos: ['all'],
          usos_max: 0,
          usos_usados: 0,
          expira: expira.toISOString().split('T')[0],
          activo: true,
          app: 'fit',
          fecha_registro: new Date().toLocaleDateString('es-ES'),
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          fingerprint: null,
          dispositivo: null,
          ubicacion: null,
        };

        const ok = await upstashSet(`code:${code}`, codeData);
        if (!ok) {
          console.error('No se pudo guardar el código Pro en Upstash');
          return res.status(500).json({ error: 'No se pudo guardar el código' });
        }
      }

      // Si Make falla se responde 502: Stripe reintenta y el código no cambia
      const avisado = await notificarMake({ nombre, email, code, plan: 'pro', evento: 'alta' });
      if (!avisado) {
        console.error('Make no aceptó el aviso de alta');
        return res.status(502).json({ error: 'Aviso a Make fallido' });
      }

      console.log(`Pro activado: ${code}`);
      return res.status(200).json({ received: true, code });
    }

    // ── customer.subscription.deleted → Cancelación Pro ───────────────────────
    if (event.type === 'customer.subscription.deleted') {
      const subscriptionId = event.data.object.id;

      console.log(`Cancelación recibida: ${subscriptionId}`);

      const found = await findCodeBySubscription(subscriptionId);

      if (!found) {
        console.warn(`No se encontró código para la suscripción: ${subscriptionId}`);
        return res.status(200).json({ received: true, warning: 'Código no encontrado' });
      }

      const { key, codeData } = found;

      const ok = await upstashSet(key, {
        ...codeData,
        activo: false,
        plan: 'cancelled',
        fecha_cancelacion: new Date().toLocaleDateString('es-ES'),
      });
      if (!ok) {
        console.error('No se pudo desactivar el código en Upstash');
        return res.status(500).json({ error: 'No se pudo desactivar el código' });
      }

      console.log(`Código desactivado: ${key}`);

      // Aviso opcional: un fallo aquí no debe reintentar la cancelación
      try {
        await notificarMake({
          nombre: codeData.nombre,
          email: codeData.email,
          code: key.replace('code:', ''),
          plan: 'cancelled',
          evento: 'cancelacion',
        });
      } catch (e) {
        console.warn('Aviso de cancelación a Make fallido:', e.message);
      }

      return res.status(200).json({ received: true, desactivado: key });
    }

    // Otros eventos → ignorar
    return res.status(200).json({ received: true });

  } catch (err) {
    console.error('stripe-webhook-fit error:', err.message);
    return res.status(500).json({ error: 'error_interno' });
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

async function buffer(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}
