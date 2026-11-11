// ════════════════════════════════════════════════════════════════
// api/limpieza.js — Borrado automático de datos antiguos (v1)
// Lo ejecuta Vercel Cron cada semana (vercel.json → crons). Cumple los plazos de la
// política de privacidad (public/privacidad.html, apartado 5):
//   - código, datos de alta, perfil y uso de entreno: 12 meses después de la caducidad
//     del código y del último acceso (lo más reciente de las dos fechas);
//   - registro de accesos: entradas de más de 12 meses (y nunca más de 1.000);
//   - perfiles, registros de entreno, últimos accesos e índice por correo huérfanos (sin código).
// Seguridad: solo con la cabecera Authorization: Bearer <CRON_SECRET>, que Vercel añade
// sola a las llamadas del cron si existe la variable CRON_SECRET. Sin ella, no hace nada.
// ?simular=1 devuelve lo que borraría, sin borrar. La respuesta solo tiene recuentos.
// ════════════════════════════════════════════════════════════════
import { igualesSeguro, kvAdmin } from './_lib/admin.js';

export const CONSERVAR_DIAS = 365;
const DIA_MS = 86400000;

/** Fecha en ISO (AAAA-MM-DD…) o española (DD/MM/AAAA) → milisegundos, o null. */
export function aMs(valor) {
  if (typeof valor === 'string' && valor.startsWith('"')) { try { valor = JSON.parse(valor); } catch { return null; } }
  if (typeof valor !== 'string' || !valor.trim()) return null;
  const es = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(valor.trim());
  if (es) return Date.UTC(Number(es[3]), Number(es[2]) - 1, Number(es[1]));
  const ms = Date.parse(valor);
  return Number.isNaN(ms) ? null : ms;
}

/** Fecha de referencia del código: la más reciente entre caducidad, alta y últimos accesos. */
export function fechaReferencia(codeData, ...otras) {
  const fechas = [codeData?.expira, codeData?.fecha_registro, codeData?.dispositivo?.fecha, ...otras].map(aMs).filter((x) => x != null);
  return fechas.length ? Math.max(...fechas) : null;
}

/** 'borrar' | 'conservar' | 'sin_fechas' (sin fechas no se borra: lo revisa una persona). */
export function decidir(codeData, otras = [], ahora = Date.now()) {
  const ref = fechaReferencia(codeData, ...otras);
  if (ref == null) return 'sin_fechas';
  return ahora - ref > CONSERVAR_DIAS * DIA_MS ? 'borrar' : 'conservar';
}

/** Índice de la primera entrada demasiado antigua en una lista ordenada de más nueva a más antigua (-1 si ninguna). */
export function primerAntiguo(entradas, ahora = Date.now()) {
  const limite = ahora - CONSERVAR_DIAS * DIA_MS;
  for (let i = 0; i < entradas.length; i++) {
    let e = entradas[i];
    try { if (typeof e === 'string') e = JSON.parse(e); if (typeof e === 'string') e = JSON.parse(e); } catch { continue; }
    const ms = aMs(e?.fecha);
    if (ms != null && ms < limite) return i;
  }
  return -1;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const secreto = process.env.CRON_SECRET;
  const kv = kvAdmin();
  if (!secreto || !kv) return res.status(500).json({ error: 'Configuración incompleta' });
  const auth = typeof req.headers?.authorization === 'string' ? req.headers.authorization : '';
  if (!igualesSeguro(auth, `Bearer ${secreto}`)) return res.status(401).json({ error: 'No autorizado' });

  const simular = String(req.query?.simular ?? '') === '1';
  const enc = encodeURIComponent;
  const cmd = async (...partes) => {
    const r = await fetch(`${kv.url}/${partes.map((p) => enc(String(p))).join('/')}`, { method: 'POST', headers: kv.headers, signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`Upstash ${partes[0]} ${r.status}`);
    return (await r.json()).result;
  };
  const leerJson = async (clave) => {
    let v = await cmd('get', clave);
    try { if (typeof v === 'string') v = JSON.parse(v); if (typeof v === 'string') v = JSON.parse(v); } catch { return null; }
    if (Array.isArray(v)) v = v[0];
    return v && typeof v === 'object' ? v : null;
  };
  const ahora = Date.now();
  const resumen = { simulacion: simular, codigos_revisados: 0, codigos_borrados: 0, codigos_sin_fechas: 0, huerfanos_borrados: 0, accesos_borrados: 0 };

  try {
    // 1. Códigos caducados hace más de 12 meses y sin accesos en ese tiempo
    const claves = (await cmd('keys', 'code:FIT-*')) || [];
    const vivos = new Set();
    const borrados = new Set();
    for (const clave of claves) {
      const code = clave.slice('code:'.length);
      resumen.codigos_revisados++;
      const data = await leerJson(clave);
      const [ultimo, entreno] = await Promise.all([cmd('get', `ultimo:${code}`), cmd('hget', `entreno:${code}`, 'ultimo_acceso')]);
      const d = data ? decidir(data, [ultimo, entreno], ahora) : 'sin_fechas';
      if (d === 'sin_fechas') resumen.codigos_sin_fechas++;
      if (d !== 'borrar') { vivos.add(code); continue; }
      resumen.codigos_borrados++;
      borrados.add(code);
      if (!simular) for (const k of [clave, `profile:${code}`, `entreno:${code}`, `ultimo:${code}`]) await cmd('del', k);
    }

    // 2. Datos huérfanos (su código ya no existe)
    for (const patron of ['profile:FIT-*', 'entreno:FIT-*', 'ultimo:FIT-*']) {
      const ks = (await cmd('keys', patron)) || [];
      for (const k of ks) {
        const code = k.slice(k.indexOf(':') + 1);
        if (vivos.has(code) || claves.includes(`code:${code}`)) continue;
        resumen.huerfanos_borrados++;
        if (!simular) await cmd('del', k);
      }
    }

    // 2b. Índice por correo (email:<huella> → código) que apunta a un código que ya no existe
    for (const k of (await cmd('keys', 'email:*')) || []) {
      let code = await cmd('get', k);
      try { if (typeof code === 'string' && code.startsWith('"')) code = JSON.parse(code); } catch { /* valor simple */ }
      if (typeof code === 'string' && claves.includes(`code:${code}`) && !borrados.has(code)) continue;
      resumen.huerfanos_borrados++;
      if (!simular) await cmd('del', k);
    }

    // 3. Registro de accesos: fuera lo de más de 12 meses y, en todo caso, más allá de 1.000 entradas
    const accesos = (await cmd('lrange', 'fitai:accesos', 0, -1)) || [];
    const i = primerAntiguo(accesos, ahora);
    const corte = Math.min(i === -1 ? accesos.length : i, 1000);
    resumen.accesos_borrados = accesos.length - corte;
    if (!simular && resumen.accesos_borrados > 0) {
      if (corte === 0) await cmd('del', 'fitai:accesos');
      else await cmd('ltrim', 'fitai:accesos', 0, corte - 1);
    }

    console.log('limpieza:', JSON.stringify(resumen));
    return res.status(200).json(resumen);
  } catch {
    console.error('limpieza: error durante la limpieza');
    return res.status(503).json({ error: 'No se pudo completar la limpieza', ...resumen });
  }
}
