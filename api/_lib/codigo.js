// Validación de códigos de acceso de Fit AI y lectura de su estado en Upstash.

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

/**
 * Estado de un código: 'valido' | 'no_existe' | 'inactivo' | 'expirado'.
 * Mismas reglas que validate-code.js.
 */
export async function estadoCodigo(kv, code, ahora = new Date()) {
  const data = await kvGetJson(kv, `code:${code}`);
  if (!data) return 'no_existe';
  if (!data.activo) return 'inactivo';
  if (data.expira && ahora > new Date(data.expira)) return 'expirado';
  return 'valido';
}
