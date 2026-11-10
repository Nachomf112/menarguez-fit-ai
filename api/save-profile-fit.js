// ════════════════════════════════════════════════════════════════
// api/save-profile-fit.js — Menarguez Fit AI
// Guarda y lee el perfil del usuario en Upstash vinculado al código
// Clave: profile:FIT-XXXX-XXXX
// v2: barrera de edad mínima (18) en el servidor al guardar el perfil
// v3: el código debe tener formato válido y existir, estar activo y no caducado
//     (para leer y para guardar); el perfil demo no se guarda en el servidor;
//     solo se guardan los campos esperados, con tipo y límites.
// v4: los objetivos (kcal, proteína, grasa, carbohidratos) los calcula el servidor
//     (Mifflin-St Jeor, suelo calórico y proteína según objetivo: api/_lib/nutricion.js).
// v5: exige el dispositivo vinculado al código (cabecera X-Fit-Device).
// ════════════════════════════════════════════════════════════════

import { dispositivoDe, esDemo, esFormatoValido, estadoCodigo, kvGetJson, normalizarCodigo } from './_lib/codigo.js';
import { limpiarTexto } from './_lib/texto.js';
import { calcularObjetivos } from './_lib/nutricion.js';

const EDAD_MINIMA = 18;
const EDAD_MAXIMA = 120;
const MAX_BODY = 4000;   // caracteres: un perfil real ocupa unos 300

// Acepta "YYYY-MM-DD" (input type=date) y "DD/MM/YYYY". Devuelve Date UTC o null.
function parseFecha(v) {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  let y, m, d, r = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (r) { y = +r[1]; m = +r[2]; d = +r[3]; }
  else {
    r = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
    if (!r) return null;
    d = +r[1]; m = +r[2]; y = +r[3];
  }
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt;
}

function edadEn(fecha, hoy = new Date()) {
  let e = hoy.getUTCFullYear() - fecha.getUTCFullYear();
  const dm = hoy.getUTCMonth() - fecha.getUTCMonth();
  if (dm < 0 || (dm === 0 && hoy.getUTCDate() < fecha.getUTCDate())) e--;
  return e;
}

// Devuelve null si el perfil es válido, o { status, error, mensaje } si hay que rechazarlo.
export function validarEdad(perfil, hoy = new Date()) {
  const bruto = perfil.fechaNac ?? perfil.fechaNacimiento ?? perfil.fecha_nacimiento;
  const fecha = parseFecha(bruto);
  if (!fecha) {
    return { status: 400, error: 'fecha_nacimiento_invalida', mensaje: 'Indica una fecha de nacimiento válida.' };
  }
  const edad = edadEn(fecha, hoy);
  if (edad < 0 || edad > EDAD_MAXIMA) {
    return { status: 400, error: 'fecha_nacimiento_invalida', mensaje: 'Indica una fecha de nacimiento válida.' };
  }
  if (edad < EDAD_MINIMA) {
    return { status: 403, error: 'edad_minima', mensaje: `Menarguez Fit AI es solo para mayores de ${EDAD_MINIMA} años.` };
  }
  return null;
}

// Rangos razonables de peso (kg) y altura (cm): evita planes absurdos (p. ej. altura 1.5 en vez de 150).
export function validarRangos(perfil) {
  const peso = Number(perfil.peso), altura = Number(perfil.altura);
  if (!(peso >= 30 && peso <= 300)) {
    return { status: 400, error: 'peso_invalido', mensaje: 'El peso debe estar entre 30 y 300 kg.' };
  }
  if (!(altura >= 100 && altura <= 250)) {
    return { status: 400, error: 'altura_invalida', mensaje: 'La altura debe estar entre 100 y 250 cm.' };
  }
  return null;
}

const SEXOS = new Set(['hombre', 'mujer']);
const ACTIVIDADES = new Set(['sedentario', 'ligero', 'moderado', 'activo', 'muy_activo']);
const OBJETIVOS = new Set(['adelgazar', 'musculo', 'definir', 'mantener']);

/**
 * Construye el perfil que se guarda: solo campos conocidos, con tipo y límites.
 * Los campos extra se descartan. La edad se recalcula a partir de la fecha de nacimiento.
 * Devuelve { perfil } o { rechazo }.
 */
export function perfilSeguro(p, hoy = new Date()) {
  const rechazo = validarEdad(p, hoy) || validarRangos(p);
  if (rechazo) return { rechazo };
  const fechaNac = parseFecha(p.fechaNac ?? p.fechaNacimiento ?? p.fecha_nacimiento);
  const mal = (campo) => ({ rechazo: { status: 400, error: `${campo}_invalido`, mensaje: 'Revisa los datos del perfil.' } });
  if (!SEXOS.has(p.sexo)) return mal('sexo');
  if (!ACTIVIDADES.has(p.actividad)) return mal('actividad');
  if (!OBJETIVOS.has(p.objetivo)) return mal('objetivo');
  const perfil = {
    nombre: limpiarTexto(p.nombre, 60),
    peso: Math.round(Number(p.peso) * 10) / 10,
    altura: Math.round(Number(p.altura)),
    fechaNac: fechaNac.toISOString().slice(0, 10),
    edad: edadEn(fechaNac, hoy),
    sexo: p.sexo,
    actividad: p.actividad,
    objetivo: p.objetivo,
  };
  // Objetivos calculados en el servidor: se ignoran los que envíe el navegador.
  Object.assign(perfil, calcularObjetivos(perfil));
  return { perfil };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.FIT_ALLOWED_ORIGIN || 'https://fit.menarguez-ia.com');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Fit-Device');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    return res.status(500).json({ error: 'Configuración incompleta' });
  }

  const kv = {
    url: process.env.KV_REST_API_URL,
    headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`, 'Content-Type': 'application/json' },
  };

  // Comprueba el código. Devuelve null si se puede usar, o la respuesta de error ya enviada.
  async function rechazarCodigo(code) {
    if (!esFormatoValido(code)) return res.status(400).json({ error: 'codigo_invalido' });
    let estado;
    try { estado = await estadoCodigo(kv, code, new Date(), dispositivoDe(req)); }
    catch (e) { console.error('save-profile-fit estado:', e.message); return res.status(503).json({ error: 'servicio_no_disponible' }); }
    if (estado !== 'valido') return res.status(401).json({ error: `codigo_${estado}` });
    return null;
  }

  // ── POST: guardar perfil ─────────────────────────────────────
  if (req.method === 'POST') {
    let body;
    try {
      if (typeof req.body === 'string' && req.body.length > MAX_BODY) return res.status(413).json({ error: 'Perfil demasiado grande' });
      body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    } catch (e) {
      return res.status(400).json({ error: 'JSON no válido' });
    }
    const { perfil } = body;
    const code = normalizarCodigo(body.code);
    if (!code) return res.status(400).json({ error: 'Código requerido' });
    if (!perfil || typeof perfil !== 'object' || Array.isArray(perfil)) {
      return res.status(400).json({ error: 'Perfil requerido' });
    }
    if (JSON.stringify(perfil).length > MAX_BODY) return res.status(413).json({ error: 'Perfil demasiado grande' });

    const { perfil: limpio, rechazo } = perfilSeguro(perfil);
    if (rechazo) return res.status(rechazo.status).json({ error: rechazo.error, mensaje: rechazo.mensaje });

    // Demo: el perfil se queda solo en el navegador de cada visitante (no se comparte).
    if (esDemo(code)) return res.status(200).json({ ok: true, guardado: false, perfil: limpio });

    if (await rechazarCodigo(code)) return;
    try {
      const r = await fetch(`${kv.url}/set/${encodeURIComponent(`profile:${code}`)}`, {
        method: 'POST', headers: kv.headers, body: JSON.stringify(limpio), signal: AbortSignal.timeout(5000),
      });
      if (!r.ok) return res.status(502).json({ error: 'No se pudo guardar el perfil' });
      return res.status(200).json({ ok: true, guardado: true, perfil: limpio });
    } catch (err) {
      console.error('save-profile-fit set:', err.message);
      return res.status(500).json({ error: 'error_interno' });
    }
  }

  // ── GET: leer perfil ─────────────────────────────────────────
  if (req.method === 'GET') {
    const urlObj = new URL(req.url, 'https://fit.menarguez-ia.com');
    const code = normalizarCodigo(urlObj.searchParams.get('code'));
    if (!code) return res.status(400).json({ error: 'Código requerido' });
    if (esDemo(code)) return res.status(200).json({ perfil: null });
    if (await rechazarCodigo(code)) return;
    try {
      const perfil = await kvGetJson(kv, `profile:${code}`);
      return res.status(200).json({ perfil: perfil || null });
    } catch (err) {
      console.error('save-profile-fit get:', err.message);
      return res.status(500).json({ error: 'error_interno' });
    }
  }

  return res.status(405).json({ error: 'Método no permitido' });
}
