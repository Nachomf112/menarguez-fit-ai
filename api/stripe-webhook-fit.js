// ════════════════════════════════════════════════════════════════
// api/stripe-webhook-fit.js — Menarguez Fit AI
// Recibe pagos de Stripe → genera código Pro → Upstash → Make
// ════════════════════════════════════════════════════════════════

export const config = { api: { bodyParser: false } };

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const seg = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `FIT-${seg()}-${seg()}`;
}

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const rawBody = await getRawBody(req);
  const signature = req.headers['stripe-signature'];
  const secret = process.env.STRIPE_WEBHOOK_SECRET_FIT;

  // ── Verificar firma Stripe ──────────────────────────────────
  try {
    const parts = signature.split(',');
    const timestamp = parts.find(p => p.startsWith('t=')).split('=')[1];
    const sigHash = parts.find(p => p.startsWith('v1=')).split('=')[1];

    const payload = `${timestamp}.${rawBody.toString()}`;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
    const computed = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');

    if (computed !== sigHash) {
      console.error('Firma inválida');
      return res.status(400).json({ error: 'Firma inválida' });
    }

    const diff = Math.abs(Date.now() / 1000 - parseInt(timestamp));
    if (diff > 300) {
      return res.status(400).json({ error: 'Timestamp expirado' });
    }
  } catch (err) {
    console.error('Error verificando firma:', err);
    return res.status(400).json({ error: 'Error de firma' });
  }

  const event = JSON.parse(rawBody.toString());
  if (event.type !== 'checkout.session.completed') {
    return res.status(200).json({ received: true });
  }

  const session = event.data.object;
  const email = session.customer_details?.email || '';
  const nombre = session.customer_details?.name || 'Usuario';
  const customerId = session.customer || '';
  const subscriptionId = session.subscription || '';

  // ── Generar código Pro ──────────────────────────────────────
  const code = generateCode();
  const hoy = new Date();
  const expira = new Date(hoy);
  expira.setFullYear(expira.getFullYear() + 1); // Pro = 1 año
  const expiraStr = expira.toISOString().split('T')[0];
  const fechaRegistro = hoy.toLocaleDateString('es-ES', { day: '2-digit', month: 'numeric', year: 'numeric' });

  const codeData = {
    nombre,
    email,
    plan: 'pro',
    modulos: ['all'],
    usos_max: 0,       // 0 = ilimitado
    usos_usados: 0,
    expira: expiraStr,
    activo: true,
    app: 'fit',
    fecha_registro: fechaRegistro,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscriptionId,
    fingerprint: null,
    dispositivo: null
  };

  // ── Guardar en Upstash ──────────────────────────────────────
  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;
  const kvHeaders = {
    Authorization: `Bearer ${kvToken}`,
    'Content-Type': 'application/json'
  };

  try {
    await fetch(`${kvUrl}/set/code:${code}`, {
      method: 'POST',
      headers: kvHeaders,
      body: JSON.stringify(codeData)
    });
    console.log(`Código Pro generado: ${code} para ${email}`);
  } catch (err) {
    console.error('Error guardando en Upstash:', err);
    return res.status(500).json({ error: 'Error guardando código' });
  }

  // ── Notificar a Make → Google Sheets + Gmail ────────────────
  try {
    await fetch('https://hook.eu2.make.com/mr2x9j8kpdrhf2921v8sr7ihmhz1epmt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre,
        email,
        codigo: code,
        plan: 'PRO',
        expira: expiraStr,
        fecha_registro: fechaRegistro,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId
      })
    });
  } catch (err) {
    console.warn('Error notificando Make:', err.message);
  }

  return res.status(200).json({ received: true, code });
}
