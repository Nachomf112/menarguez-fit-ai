import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET_FIT;

const UPSTASH_URL = process.env.KV_REST_API_URL;
const UPSTASH_TOKEN = process.env.KV_REST_API_TOKEN;

const MAKE_WEBHOOK_PRO = 'https://hook.eu2.make.com/mr2x9j8kpdrhf2921v8sr7ihmhz1epmt';

// ─── Upstash helpers ───────────────────────────────────────────────────────────

async function upstashGet(key) {
  const res = await fetch(`${UPSTASH_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
  });
  const data = await res.json();
  if (!data.result) return null;
  try { return JSON.parse(data.result); } catch { return data.result; }
}

async function upstashSet(key, value, expiresAt = null) {
  const body = JSON.stringify(value);
  let url = `${UPSTASH_URL}/set/${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${UPSTASH_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([body]),
  });
  return res.ok;
}

async function upstashScan(pattern) {
  // Busca claves que coincidan con el patrón usando SCAN
  const res = await fetch(`${UPSTASH_URL}/scan/0/match/${encodeURIComponent(pattern)}/count/200`, {
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
  });
  const data = await res.json();
  // data.result = [cursor, [keys...]]
  return data.result ? data.result[1] : [];
}

// ─── Buscar código FIT-* por stripe_subscription_id ───────────────────────────

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

// ─── Handler principal ─────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Leer body raw para verificar firma Stripe
  const buf = await buffer(req);
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(buf, sig, webhookSecret);
  } catch (err) {
    console.error('⚠️ Stripe signature error:', err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  // ── checkout.session.completed → Alta Pro ───────────────────────────────────
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    const nombre = session.customer_details?.name || 'Usuario';
    const email = session.customer_details?.email || '';
    const customerId = session.customer;
    const subscriptionId = session.subscription;

    // Generar código FIT Pro
    const code = `FIT-${randomSegment()}-${randomSegment()}`;

    // Calcular expiración (1 año)
    const expira = new Date();
    expira.setFullYear(expira.getFullYear() + 1);
    const expiraStr = expira.toISOString().split('T')[0];

    const codeData = {
      nombre,
      email,
      plan: 'pro',
      modulos: ['all'],
      usos_max: 0,
      usos_usados: 0,
      expira: expiraStr,
      activo: true,
      app: 'fit',
      fecha_registro: new Date().toLocaleDateString('es-ES'),
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      fingerprint: null,
      dispositivo: null,
      ubicacion: null,
    };

    await upstashSet(`code:${code}`, codeData);

    // Notificar a Make (Google Sheets + Gmail)
    await fetch(MAKE_WEBHOOK_PRO, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre, email, code, plan: 'pro', evento: 'alta' }),
    });

    console.log(`✅ Pro activado: ${code} → ${email}`);
    return res.status(200).json({ received: true, code });
  }

  // ── customer.subscription.deleted → Cancelación Pro ────────────────────────
  if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object;
    const subscriptionId = subscription.id;

    console.log(`🔴 Cancelación recibida: ${subscriptionId}`);

    const found = await findCodeBySubscription(subscriptionId);

    if (!found) {
      console.warn(`⚠️ No se encontró código para subscription: ${subscriptionId}`);
      return res.status(200).json({ received: true, warning: 'Código no encontrado' });
    }

    const { key, codeData } = found;

    // Desactivar código en Upstash
    const updated = {
      ...codeData,
      activo: false,
      plan: 'cancelled',
      fecha_cancelacion: new Date().toLocaleDateString('es-ES'),
    };

    await upstashSet(key, updated);

    console.log(`✅ Código desactivado: ${key} (${codeData.email})`);

    // Notificar a Make (opcional: email de cancelación)
    await fetch(MAKE_WEBHOOK_PRO, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre: codeData.nombre,
        email: codeData.email,
        code: key.replace('code:', ''),
        plan: 'cancelled',
        evento: 'cancelacion',
      }),
    });

    return res.status(200).json({ received: true, desactivado: key });
  }

  // Otros eventos → ignorar
  return res.status(200).json({ received: true });
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function randomSegment() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

async function buffer(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}
