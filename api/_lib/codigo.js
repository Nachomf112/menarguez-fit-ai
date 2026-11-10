// Validación de códigos de acceso de Fit AI y lectura de su estado en Upstash.
import { createHash } from 'node:crypto';

// Formato real: FIT-XXXX-XXXX (Free y Pro). Se admiten tramos de 2 a 12 caracteres
// por compatibilidad con códigos creados a mano en pruebas.
const FORMATO = /^FIT-[A-Z0-9]{2,12}(?:-[A-Z0-9]{2,12}){1,2}$/;
const DEMO = new Set(['DEMO-2026', 'FIT-DEMO']);

/** Normaliza (mayúsculas, sin espacios) o devuelve '' si no es texto. */
export function normalizarCodigo(c) {
  return typeof c === 'string' ? c.trim().toUpperCase() : '';
}
export const esFormatoValido = (c) => FORMATO.test(c);
export const esDemo = (c) => DEMO.has(c);

/** Lee una clave JSON de Upstash (con codificación de la clave y tiempo máximo). */
export async function kvGetJson(kv, key, ms = 5000) {
  const r = await fetch(`${kv.url}/get/${encodeURIComponent(key)}`, { headers: kv.headers, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`Upstash GET ${r.status}`);
  const d = await r.json();
  let raw = d.result;
  if (Array.isArray(raw)) raw = raw[0];
  for (let i = 0; i < 2 && typeof raw === 'string'; i++) { try { raw = JSON.parse(raw); } catch { break; } }
  return raw && typeof raw === 'object' ? raw : null;
}

// ── Vínculo código ↔ dispositivo ─────────────────────────────────
// Cada navegador genera un identificador aleatorio (122 bits) y lo guarda en localStorage.
// En Upstash solo se guarda su huella SHA-256, nunca el identificador.
// La API exige el identificador en cada petición (cabecera X-Fit-Device), así que conocer
// el código no basta para usarlo desde otro dispositivo.
const ID_DISPOSITIVO = /^[A-Za-z0-9-]{32,64}$/;
export const idDispositivoValido = (id) => typeof id === 'string' && ID_DISPOSITIVO.test(id);
export const huellaDispositivo = (id) => 'd1:' + createHash('sha256').update(id).digest('hex');

/** Identificador de dispositivo de la petición (cabecera X-Fit-Device) o ''. */
export function dispositivoDe(req) {
  const v = req.headers?.['x-fit-device'];
  return typeof v === 'string' ? v.trim() : '';
}

/** 'ok' | 'sin_vincular' (aún no se ha entrado con él) | 'otro_dispositivo'. */
export function comprobarDispositivo(codeData, idDispositivo) {
  if (!codeData.fingerprint) return 'sin_vincular';
  if (!idDispositivoValido(idDispositivo)) return 'otro_dispositivo';
  return codeData.fingerprint === huellaDispositivo(idDispositivo) ? 'ok' : 'otro_dispositivo';
}

/**
 * Estado de un código: 'valido' | 'no_existe' | 'inactivo' | 'expirado' | 'sin_vincular' | 'otro_dispositivo'.
 * Mismas reglas que validate-code.js. Si se pasa idDispositivo, también comprueba el vínculo.
 */
export async function estadoCodigo(kv, code, ahora = new Date(), idDispositivo) {
  const data = await kvGetJson(kv, `code:${code}`);
  if (!data) return 'no_existe';
  if (!data.activo) return 'inactivo';
  if (data.expira && ahora > new Date(data.expira)) return 'expirado';
  if (idDispositivo !== undefined) {
    const d = comprobarDispositivo(data, idDispositivo);
    if (d !== 'ok') return d;
  }
  return 'valido';
}
