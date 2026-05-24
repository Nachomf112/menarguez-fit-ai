// ════════════════════════════════════════════════════════════════
// api/analyze.js — Menarguez Fit AI
// ════════════════════════════════════════════════════════════════
// NOVEDAD v3:
//   - Control de usos por código (Free: 30 análisis total)
//   - Bloqueo cuando se supera el límite con mensaje de upgrade
//   - Geolocalización por IP guardada en el código
// ════════════════════════════════════════════════════════════════

const FREE_LIMIT = 30;   // análisis totales plan Free
const PRO_LIMIT = 0;     // 0 = ilimitado

export default async function handler(req, res) {

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'API key no configurada' });
  }

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const { userCode, ...claudeBody } = body;

    // ── CONTROL DE USOS POR CÓDIGO ───────────────────────────
    if (userCode && process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
      const kvUrl = process.env.KV_REST_API_URL;
      const kvToken = process.env.KV_REST_API_TOKEN;
      const kvHeaders = {
        Authorization: `Bearer ${kvToken}`,
        'Content-Type': 'application/json'
      };

      try {
        const getResp = await fetch(`${kvUrl}/get/code:${userCode}`, { headers: kvHeaders });
        const getData = await getResp.json();

        if (getData.result) {
          let raw = getData.result;
          if (Array.isArray(raw)) raw = raw[0];
          if (typeof raw === 'string') raw = JSON.parse(raw);
          if (typeof raw === 'string') raw = JSON.parse(raw);
          const codeData = raw;

          const plan = codeData.plan || 'free';
          const usosUsados = codeData.usos_usados || 0;
          const limite = plan === 'pro' ? PRO_LIMIT : FREE_LIMIT;

          // ── VERIFICAR LÍMITE ────────────────────────────────
          if (limite > 0 && usosUsados >= limite) {
            return res.status(429).json({
              error: 'limite_alcanzado',
              message: `Has agotado tus ${limite} análisis del plan Free. Actualiza a Pro por 4,99€/mes para continuar sin límites.`,
              usos_usados: usosUsados,
              usos_max: limite,
              upgrade: true
            });
          }

          // ── INCREMENTAR USOS ────────────────────────────────
          codeData.usos_usados = usosUsados + 1;

          // ── GEOLOCALIZACIÓN POR IP ──────────────────────────
          // FIX v3.1: se intenta siempre que no haya ubicación (no solo en el primer uso)
          if (!codeData.ubicacion && ip !== 'unknown') {
            try {
              const geoResp = await fetch(`https://ipapi.co/${ip}/json/`);
              const geoData = await geoResp.json();
              if (geoData && geoData.city) {
                codeData.ubicacion = {
                  ciudad: geoData.city || '',
                  region: geoData.region || '',
                  pais: geoData.country_name || '',
                  codigo_pais: geoData.country_code || ''
                };
              }
            } catch (geoErr) {
              console.warn('Error geolocalización:', geoErr.message);
            }
          }

          // ── GUARDAR EN UPSTASH ──────────────────────────────
          await fetch(`${kvUrl}/set/code:${userCode}`, {
            method: 'POST',
            headers: kvHeaders,
            body: JSON.stringify(codeData)
          });

          // ── STATS DIARIAS ───────────────────────────────────
          try {
            const fechaHoy = new Date().toLocaleDateString('es-ES', {
              timeZone: 'Europe/Madrid',
              year: 'numeric', month: '2-digit', day: '2-digit'
            }).split('/').reverse().join('-');
            await fetch(`${kvUrl}/hincrby/fitai:stats:daily/${fechaHoy}/1`, {
              method: 'POST',
              headers: kvHeaders
            });
          } catch (statsErr) {
            console.warn('Error stats diarias:', statsErr.message);
          }
        }
      } catch (kvErr) {
        console.warn('Error KV:', kvErr.message);
      }
    }

    // ── LLAMADA A CLAUDE ─────────────────────────────────────
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(claudeBody)
    });

    const data = await response.json();
    data.usos_usados = codeData ? codeData.usos_usados : undefined;
    return res.status(200).json(data);

  } catch (err) {
    console.error('analyze error:', err);
    return res.status(500).json({ error: err.message });
  }
}
