// Acceso a /entreno con el código de Menarguez Fit AI.
// - Mismo código y mismo identificador de dispositivo que la app de nutrición (/app):
//   las dos apps están en el mismo dominio y comparten 'fitai_device' en localStorage.
// - Al servidor solo se envían el código, el identificador del dispositivo y el navegador.
//   Ningún dato del entrenamiento sale del dispositivo.

/** Hosts donde se exige el código: producción y versiones de pruebas de Vercel. */
const HOSTS = [
  /^fit\.menarguez-ia\.com$/,
  /^menarguez-fit-ai-git-desarrollo-nachos-projects-9fab1a83\.vercel\.app$/,
  /^menarguez-fit-[a-z0-9]+-nachos-projects-9fab1a83\.vercel\.app$/,
];
export const REGISTRO_URL = 'https://tally.so/r/xXlpkr';
const K_CODIGO = 'fitai_entreno_codigo';
const K_OK = 'fitai_entreno_ok';
/** Si no hay conexión, se deja entrar a quien validó su código en los últimos 7 días. */
export const GRACIA_SIN_RED_MS = 7 * 24 * 3600 * 1000;

export function accesoRequerido(host = typeof location !== 'undefined' ? location.hostname : ''): boolean {
  return HOSTS.some((re) => re.test(host));
}

const leer = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const escribir = (k: string, v: string | null) => {
  try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* sin almacenamiento */ }
};

/** Mismo algoritmo que getDeviceId() de public/app.html. */
export function deviceId(): string {
  let id = leer('fitai_device');
  if (!id || !/^[A-Za-z0-9-]{32,64}$/.test(id)) {
    if (typeof crypto.randomUUID === 'function') id = crypto.randomUUID();
    else { const b = new Uint8Array(16); crypto.getRandomValues(b); id = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join(''); }
    escribir('fitai_device', id);
  }
  return id;
}

export const normalizarCodigo = (c: string) => c.trim().toUpperCase();

/** Código guardado de /entreno o, si no hay, el de la app de nutrición en este navegador. */
export function codigoGuardado(): string {
  const propio = leer(K_CODIGO);
  if (propio) return propio;
  try { const u = JSON.parse(leer('fitai_user') || 'null'); return typeof u?.code === 'string' ? u.code : ''; } catch { return ''; }
}

export const ultimoOk = (): number => Number(leer(K_OK)) || 0;

export function olvidarAcceso() { escribir(K_CODIGO, null); escribir(K_OK, null); }

export type Resultado = { ok: true; nombre: string } | { ok: false; error: string; sinRed?: boolean };

export async function validarAcceso(codigo: string, f: typeof fetch = fetch): Promise<Resultado> {
  const code = normalizarCodigo(codigo);
  if (!code) return { ok: false, error: 'Escribe tu código.' };
  let resp: Response;
  try {
    resp = await f('/api/entreno-acceso', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, dispositivo: deviceId(), userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '' }),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    return { ok: false, error: 'No hay conexión. Inténtalo de nuevo.', sinRed: true };
  }
  const data = await resp.json().catch(() => ({}));
  if (resp.ok && data.valid) {
    escribir(K_CODIGO, code);
    escribir(K_OK, String(Date.now()));
    return { ok: true, nombre: typeof data.nombre === 'string' ? data.nombre : '' };
  }
  if (resp.status >= 500) return { ok: false, error: 'El servidor no responde. Inténtalo de nuevo en un momento.', sinRed: true };
  return { ok: false, error: typeof data.error === 'string' ? data.error : 'No se ha podido comprobar el código.' };
}
