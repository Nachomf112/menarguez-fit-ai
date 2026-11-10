// Autenticación del panel de administración de Fit AI (M8).
//
// - La contraseña (ADMIN_PASSWORD) solo viaja una vez, al entrar. Después el panel usa un
//   token de sesión firmado con HMAC-SHA256 que caduca a las 8 horas.
// - La clave de firma se deriva de ADMIN_PASSWORD: al cambiar la contraseña en Vercel,
//   todas las sesiones abiertas dejan de valer.
// - Comparaciones en tiempo constante (contraseña y firma).
// - Límite de intentos fallidos por IP (5 cada 15 minutos). En Upstash solo se guarda la
//   huella SHA-256 de la IP, nunca la IP.
// - Cerrar sesión revoca el token en Upstash hasta que caduca.
// - Sin CORS: el panel se sirve desde el mismo dominio que la API.
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

export const DURACION_SESION_S = 8 * 60 * 60;
export const MAX_FALLOS = 5;
export const VENTANA_FALLOS_S = 15 * 60;

const sha256 = (s) => createHash('sha256').update(String(s)).digest();
const b64url = (buf) => Buffer.from(buf).toString('base64url');

/** Compara dos textos en tiempo constante (también si tienen distinta longitud). */
export function igualesSeguro(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  return timingSafeEqual(sha256(a), sha256(b));
}

const claveFirma = (password) => createHmac('sha256', password).update('fitai-admin-sesion-v1').digest();
const firmar = (cuerpo, password) => b64url(createHmac('sha256', claveFirma(password)).update(cuerpo).digest());

/** Crea un token de sesión: base64url(JSON).firma */
export function crearToken(password, ahoraMs = Date.now()) {
  const iat = Math.floor(ahoraMs / 1000);
  const cuerpo = b64url(JSON.stringify({ v: 1, iat, exp: iat + DURACION_SESION_S, jti: randomUUID() }));
  return `${cuerpo}.${firmar(cuerpo, password)}`;
}

/** Devuelve el contenido del token si la firma y la fecha son válidas; si no, null. */
export function leerToken(token, password, ahoraMs = Date.now()) {
  if (typeof token !== 'string' || token.length > 512 || !password) return null;
  const partes = token.split('.');
  if (partes.length !== 2) return null;
  const [cuerpo, firma] = partes;
  if (!igualesSeguro(firma, firmar(cuerpo, password))) return null;
  let datos;
  try { datos = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8')); } catch { return null; }
  if (!datos || datos.v !== 1 || typeof datos.exp !== 'number' || typeof datos.jti !== 'string') return null;
  const ahora = Math.floor(ahoraMs / 1000);
  if (datos.exp <= ahora || datos.iat > ahora + 60) return null;
  return datos;
}

/** Token de la cabecera Authorization: Bearer <token>, o ''. */
export function tokenDe(req) {
  const h = req.headers?.authorization;
  if (typeof h !== 'string') return '';
  const m = /^Bearer\s+(\S+)$/.exec(h.trim());
  return m ? m[1] : '';
}

/** IP del cliente según Vercel (x-real-ip / primer x-forwarded-for). */
export function ipDe(req) {
  const real = req.headers?.['x-real-ip'];
  if (typeof real === 'string' && real.trim()) return real.trim();
  const xff = req.headers?.['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) return xff.split(',')[0].trim();
  return 'desconocida';
}
const huellaIp = (ip) => sha256('fitai-admin-ip|' + ip).toString('hex').slice(0, 32);

// ── Upstash ──────────────────────────────────────────────────────
export function kvAdmin() {
  const url = process.env.KV_REST_API_URL, token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return { url, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } };
}
async function kvCmd(kv, ...partes) {
  const ruta = partes.map((p) => encodeURIComponent(String(p))).join('/');
  const r = await fetch(`${kv.url}/${ruta}`, { method: 'POST', headers: kv.headers, signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error(`Upstash ${partes[0]} ${r.status}`);
  return (await r.json()).result;
}

const claveFallos = (req) => `fitai:admin:fallos:${huellaIp(ipDe(req))}`;
const claveRevocado = (jti) => `fitai:admin:revocado:${jti}`;

/** Segundos que quedan de bloqueo para esta IP (0 = puede intentarlo). */
export async function bloqueoRestante(kv, req) {
  const clave = claveFallos(req);
  const n = Number(await kvCmd(kv, 'get', clave)) || 0;
  if (n < MAX_FALLOS) return 0;
  const ttl = Number(await kvCmd(kv, 'ttl', clave));
  return ttl > 0 ? ttl : VENTANA_FALLOS_S;
}
export async function anotarFallo(kv, req) {
  const clave = claveFallos(req);
  const n = Number(await kvCmd(kv, 'incr', clave));
  if (n === 1) await kvCmd(kv, 'expire', clave, VENTANA_FALLOS_S);
  return n;
}
export const borrarFallos = (kv, req) => kvCmd(kv, 'del', claveFallos(req));

export async function revocarToken(kv, datos, ahoraMs = Date.now()) {
  const restante = Math.max(1, datos.exp - Math.floor(ahoraMs / 1000));
  await kvCmd(kv, 'set', claveRevocado(datos.jti), '1', 'EX', restante);
}

// ── Respuestas ───────────────────────────────────────────────────
/** Cabeceras comunes de las rutas de administración: sin CORS y sin caché. */
export function cabecerasAdmin(res, metodos) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Allow', metodos);
}

/**
 * Comprueba la sesión de administración. Devuelve los datos del token o null (y ya ha
 * respondido 401/500). Uso: const sesion = await exigirAdmin(req, res, kv); if (!sesion) return;
 */
export async function exigirAdmin(req, res, kv) {
  const password = process.env.ADMIN_PASSWORD;
  if (!password || !kv) { res.status(500).json({ error: 'Configuración incompleta del servidor' }); return null; }
  const datos = leerToken(tokenDe(req), password);
  if (!datos) { res.status(401).json({ error: 'Sesión no válida o caducada' }); return null; }
  try {
    if (await kvCmd(kv, 'get', claveRevocado(datos.jti))) { res.status(401).json({ error: 'Sesión cerrada' }); return null; }
  } catch {
    res.status(503).json({ error: 'Servicio no disponible, inténtalo de nuevo' });
    return null;
  }
  return datos;
}

/** Lee el cuerpo JSON de forma segura ({} si no es válido). */
export function cuerpoJson(req) {
  const b = req.body;
  if (b && typeof b === 'object') return b;
  if (typeof b === 'string') { try { const o = JSON.parse(b); return o && typeof o === 'object' ? o : {}; } catch { return {}; } }
  return {};
}

// Códigos que el admin puede tocar: los que lista (code:FIT-*), normalizados.
const CODIGO_ADMIN = /^FIT-[A-Z0-9-]{2,40}$/;
export function codigoAdmin(c) {
  const n = typeof c === 'string' ? c.trim().toUpperCase() : '';
  return CODIGO_ADMIN.test(n) ? n : '';
}
export const fechaValida = (f) => typeof f === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f) && !Number.isNaN(Date.parse(f + 'T00:00:00Z'));
