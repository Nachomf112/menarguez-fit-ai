// ════════════════════════════════════════════════════════════════
// api/admin-auth-fit.js — Menarguez Fit AI Admin Auth (v2, M8)
// POST { password }            → { ok: true, token, expira }  (crea sesión)
// POST { action: 'logout' }    → { ok: true }                 (revoca el token actual)
// Límite: 5 intentos fallidos por IP cada 15 minutos.
// ════════════════════════════════════════════════════════════════
import {
  anotarFallo, bloqueoRestante, borrarFallos, cabecerasAdmin, crearToken, cuerpoJson,
  DURACION_SESION_S, exigirAdmin, igualesSeguro, kvAdmin, MAX_FALLOS, revocarToken,
} from './_lib/admin.js';

export default async function handler(req, res) {
  cabecerasAdmin(res, 'POST');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const password = process.env.ADMIN_PASSWORD;
  const kv = kvAdmin();
  if (!password || !kv) return res.status(500).json({ error: 'Configuración incompleta del servidor' });

  const body = cuerpoJson(req);

  if (body.action === 'logout') {
    const sesion = await exigirAdmin(req, res, kv);
    if (!sesion) return;
    try { await revocarToken(kv, sesion); } catch { return res.status(503).json({ error: 'No se pudo cerrar la sesión' }); }
    return res.status(200).json({ ok: true });
  }

  try {
    const espera = await bloqueoRestante(kv, req);
    if (espera > 0) {
      res.setHeader('Retry-After', String(espera));
      return res.status(429).json({ ok: false, error: `Demasiados intentos. Espera ${Math.ceil(espera / 60)} min.` });
    }

    const intento = typeof body.password === 'string' ? body.password : '';
    if (intento && intento.length <= 256 && igualesSeguro(intento, password)) {
      await borrarFallos(kv, req);
      const ahora = Date.now();
      return res.status(200).json({
        ok: true,
        token: crearToken(password, ahora),
        expira: new Date(ahora + DURACION_SESION_S * 1000).toISOString(),
      });
    }

    const fallos = await anotarFallo(kv, req);
    const quedan = Math.max(0, MAX_FALLOS - fallos);
    return res.status(401).json({ ok: false, error: quedan ? 'Contraseña incorrecta.' : 'Demasiados intentos. Espera 15 min.' });
  } catch {
    return res.status(503).json({ ok: false, error: 'Servicio no disponible, inténtalo de nuevo' });
  }
}
