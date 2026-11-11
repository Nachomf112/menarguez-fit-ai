// Entrenador con IA (Pro+) · Fase 1: límites de seguridad y validador del servidor. Sin IA.
//
// 1. normalizarResumen(): datos MINIMIZADOS que se permitirían enviar a la IA. Lista blanca
//    estricta: todo lo demás se descarta (nombre, correo, código, edad exacta, peso, altura,
//    textos libres, cribado de salud…).
// 2. calcularLimites(): límites de seguridad a partir del resumen.
// 3. validarPlan(): rechaza cualquier semana que se salga de los límites. En la fase 2, lo que
//    proponga la IA solo se mostrará si pasa este validador; si no, se usará el plan por reglas.
//
// Los valores coinciden con las reglas de la app de entrenamiento (src/domain/running.ts v0.6).
// Si se cambian aquí, cambiarlos allí. La prueba pruebas/entreno-limites.test.mjs comprueba
// que los planes de las reglas pasan el validador.

export const MIN_SESION_CARRERA = 20;
export const MIN_CALIDAD = 36;
export const BASE_CALIDAD = 60;
export const MAX_CALIDAD_SEMANA = 2;
const TOLERANCIA_MIN = 5;

export const TIPOS_CARRERA = ['correr_caminar', 'rodaje', 'series', 'series_cortas', 'tempo', 'tirada', 'cuestas', 'ritmo_carrera'];
export const TIPOS_CALIDAD = ['series', 'tempo', 'series_cortas', 'cuestas', 'ritmo_carrera'];
const CALIDAD_LARGA = ['series', 'tempo'];

const ENUM = {
  rangoEdad: ['18-29', '30-39', '40-49', '50-59', '60-69', '70+'],
  objetivo: ['hipertrofia', 'fuerza', 'salud', 'composicion', 'resistencia', 'carrera'],
  experienciaFuerza: ['ninguna', 'principiante', 'intermedio', 'avanzado'],
  limitacion: ['hombro', 'codo_muneca', 'lumbar', 'cadera', 'rodilla', 'tobillo', 'cervical'],
  sueno: ['menos6', '6a7', '7a9', 'mas9'],
  recuperacion: ['buena', 'normal', 'mala'],
  distancia: ['400', '800', '1500', '5k', '10k', '21k'],
  experienciaCarrera: ['empiezo', 'ocasional', 'regular'],
};
const CORTAS = ['400', '800', '1500'];

/** Rango de edad a partir de la edad exacta (la edad exacta nunca sale del dispositivo). */
export function rangoEdad(edad) {
  if (!Number.isFinite(edad) || edad < 18) return null;
  if (edad < 30) return '18-29';
  if (edad < 40) return '30-39';
  if (edad < 50) return '40-49';
  if (edad < 60) return '50-59';
  if (edad < 70) return '60-69';
  return '70+';
}

/** Minutos semanales de carrera permitidos: +10 % o +15 min (lo mayor), mínimo 40. */
export function presupuestoSemanal(minutosSemana) {
  const b = Math.max(0, Number(minutosSemana) || 0);
  return Math.max(40, Math.round(Math.max(b * 1.1, b + 15)));
}

export function faseDe(diasHastaPrueba) {
  if (diasHastaPrueba == null || diasHastaPrueba < 0) return 'base';
  if (diasHastaPrueba <= 7) return 'semana_prueba';
  if (diasHastaPrueba <= 14) return 'afinamiento';
  if (diasHastaPrueba <= 56) return 'especifica';
  return 'base';
}

const entero = (v, min, max) => (Number.isInteger(v) && v >= min && v <= max ? v : undefined);
const enumDe = (lista, v) => (lista.includes(v) ? v : undefined);

/**
 * Lista blanca del resumen minimizado. Devuelve { resumen, errores, descartados }.
 * `descartados` solo contiene NOMBRES de campos (nunca valores), para detectar fugas en pruebas.
 */
export function normalizarResumen(entrada) {
  const errores = [], descartados = [];
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)) return { resumen: null, errores: ['Resumen no válido'], descartados };
  const PERMITIDOS = ['rangoEdad', 'objetivo', 'experienciaFuerza', 'dias', 'minutosSesion', 'limitaciones', 'sueno', 'recuperacion', 'carrera', 'historial'];
  for (const k of Object.keys(entrada)) if (!PERMITIDOS.includes(k)) descartados.push(k);

  const r = {
    rangoEdad: enumDe(ENUM.rangoEdad, entrada.rangoEdad),
    objetivo: enumDe(ENUM.objetivo, entrada.objetivo),
    experienciaFuerza: enumDe(ENUM.experienciaFuerza, entrada.experienciaFuerza),
    dias: entero(entrada.dias, 1, 6),
    minutosSesion: entero(entrada.minutosSesion, 20, 120),
    limitaciones: Array.isArray(entrada.limitaciones) ? [...new Set(entrada.limitaciones.filter((l) => ENUM.limitacion.includes(l)))] : [],
    sueno: enumDe(ENUM.sueno, entrada.sueno),
    recuperacion: enumDe(ENUM.recuperacion, entrada.recuperacion),
  };
  for (const k of ['rangoEdad', 'objetivo', 'experienciaFuerza', 'dias', 'minutosSesion']) if (r[k] === undefined) errores.push(`Falta o no es válido: ${k}`);

  const c = entrada.carrera;
  if (c != null) {
    if (typeof c !== 'object') errores.push('carrera no válida');
    else {
      for (const k of Object.keys(c)) if (!['distancia', 'experiencia', 'minutosSemana', 'diasHastaPrueba'].includes(k)) descartados.push('carrera.' + k);
      r.carrera = {
        distancia: enumDe(ENUM.distancia, c.distancia),
        experiencia: enumDe(ENUM.experienciaCarrera, c.experiencia),
        minutosSemana: entero(c.minutosSemana, 0, 1200),
        diasHastaPrueba: c.diasHastaPrueba == null ? null : entero(c.diasHastaPrueba, -3650, 3650),
      };
      for (const k of ['distancia', 'experiencia', 'minutosSemana']) if (r.carrera[k] === undefined) errores.push(`Falta o no es válido: carrera.${k}`);
      if (r.carrera.diasHastaPrueba === undefined) errores.push('No es válido: carrera.diasHastaPrueba');
    }
  }
  if (r.objetivo === 'carrera' && !r.carrera) errores.push('Falta: carrera');

  const h = entrada.historial;
  if (h != null) {
    const semanas = Array.isArray(h?.semanas) ? h.semanas.slice(0, 4) : [];
    if (h && typeof h === 'object') for (const k of Object.keys(h)) if (k !== 'semanas') descartados.push('historial.' + k);
    r.historial = {
      semanas: semanas.map((s) => {
        if (s && typeof s === 'object') for (const k of Object.keys(s)) if (!['minutosCarrera', 'sesionesHechas', 'molestiaMax'].includes(k)) descartados.push('historial.semanas.' + k);
        return {
          minutosCarrera: entero(s?.minutosCarrera, 0, 1500) ?? 0,
          sesionesHechas: entero(s?.sesionesHechas, 0, 14) ?? 0,
          molestiaMax: entero(s?.molestiaMax, 0, 3) ?? 0,
        };
      }),
    };
  }
  return { resumen: errores.length ? null : r, errores, descartados: [...new Set(descartados)] };
}

/** Límites de seguridad para la semana. */
export function calcularLimites(resumen) {
  const c = resumen.carrera;
  const ultima = resumen.historial?.semanas?.[0];
  const molestia = (ultima?.molestiaMax ?? 0) >= 2;
  const L = {
    maxSesiones: resumen.dias,
    maxMinSesion: resumen.minutosSesion + TOLERANCIA_MIN,
    descansoMinimo: 1,
    molestiaReciente: molestia,
    carrera: null,
  };
  if (!c) return L;
  const empiezo = c.experiencia === 'empiezo';
  const fase = faseDe(c.diasHastaPrueba);
  const tope = empiezo ? 3 : c.experiencia === 'ocasional' ? 4 : 5;
  // Con molestias recientes (≥ 2 de 3): sin aumento de volumen y sin calidad.
  const presupuesto = empiezo ? null : (molestia ? Math.max(40, c.minutosSemana) : presupuestoSemanal(c.minutosSemana));
  L.carrera = {
    fase,
    soloCorrerCaminar: empiezo,
    maxSalidas: empiezo ? tope : Math.max(1, Math.min(tope, Math.floor(presupuesto / MIN_SESION_CARRERA))),
    volumenMax: presupuesto,
    maxMinCorrerCaminar: 45,
    calidadPermitida: !empiezo && !molestia && c.minutosSemana >= BASE_CALIDAD,
    calidadLargaEnBaseMinSalidas: 3,
    maxCalidad: MAX_CALIDAD_SEMANA,
    distanciaCorta: CORTAS.includes(c.distancia),
  };
  return L;
}

const consecutivos = (a, b) => Math.abs(a - b) === 1 || Math.abs(a - b) === 6;

/**
 * Valida una semana. Formato: { sesiones: [{ dia: 0–6, tipo: 'fuerza'|'aerobica'|'carrera',
 * minutosEstimados, carrera?: { tipo, minutos }, ejercicios? }] }. minutosEstimados es la sesión
 * completa (con la fuerza de apoyo); carrera.minutos, solo la carrera. Devuelve { ok, errores, avisos }.
 */
export function validarPlan(plan, limites) {
  const errores = [], avisos = [];
  const sesiones = Array.isArray(plan?.sesiones) ? plan.sesiones : null;
  if (!sesiones) return { ok: false, errores: ['El plan no tiene sesiones'], avisos };

  for (const s of sesiones) {
    if (!Number.isInteger(s?.dia) || s.dia < 0 || s.dia > 6) errores.push('Día no válido');
    if (!['fuerza', 'aerobica', 'carrera'].includes(s?.tipo)) errores.push('Tipo de sesión no válido');
    const m = s?.minutosEstimados;
    if (!Number.isFinite(m) || m <= 0) errores.push('Duración no válida');
    else if (m > limites.maxMinSesion) errores.push(`Una sesión dura ${m} min y el máximo es ${limites.maxMinSesion - TOLERANCIA_MIN}`);
  }
  if (errores.length) return { ok: false, errores: [...new Set(errores)], avisos };

  const dias = sesiones.map((s) => s.dia);
  if (sesiones.length > limites.maxSesiones) errores.push('Hay más sesiones que días disponibles');
  if (new Set(dias).size !== dias.length) errores.push('Dos sesiones caen el mismo día');
  if (7 - new Set(dias).size < limites.descansoMinimo) errores.push('Debe haber al menos un día de descanso');

  const runs = sesiones.filter((s) => s.tipo === 'carrera');
  const L = limites.carrera;
  if (runs.length && !L) errores.push('Sesiones de carrera sin perfil de carrera');
  if (L && runs.length) {
    for (const s of runs) if (!TIPOS_CARRERA.includes(s.carrera?.tipo)) errores.push('Tipo de carrera no válido');
    if (errores.length) return { ok: false, errores, avisos };
    const tipo = (s) => s.carrera.tipo;
    // Minutos de carrera (sin la fuerza de apoyo que pueda ir después). Si no vienen, los de la sesión.
    const minCarrera = (s) => (Number.isFinite(s.carrera.minutos) && s.carrera.minutos > 0 ? s.carrera.minutos : s.minutosEstimados);
    if (runs.some((s) => minCarrera(s) > s.minutosEstimados + 1)) errores.push('Los minutos de carrera no pueden superar la duración de la sesión');
    if (runs.length > L.maxSalidas) errores.push(`Demasiadas salidas de carrera: ${runs.length} (máximo ${L.maxSalidas})`);

    if (L.soloCorrerCaminar) {
      if (runs.some((s) => tipo(s) !== 'correr_caminar')) errores.push('Quien empieza solo debe hacer correr-caminar');
      if (runs.some((s) => minCarrera(s) > L.maxMinCorrerCaminar)) errores.push(`Correr-caminar de más de ${L.maxMinCorrerCaminar} min`);
    } else {
      const volumen = Math.round(runs.filter((s) => tipo(s) !== 'correr_caminar').reduce((t, s) => t + minCarrera(s), 0));
      if (volumen > L.volumenMax) errores.push(`Volumen de carrera ${volumen} min: supera el máximo de ${L.volumenMax} min`);
    }

    const calidad = runs.filter((s) => TIPOS_CALIDAD.includes(tipo(s)));
    if (calidad.length && !L.calidadPermitida) errores.push(limites.molestiaReciente ? 'Con molestias recientes no hay sesiones de calidad' : 'Sin base suficiente no hay sesiones de calidad');
    if (calidad.length > L.maxCalidad) errores.push(`Demasiadas sesiones de calidad: ${calidad.length} (máximo ${L.maxCalidad})`);
    if (!L.distanciaCorta && L.fase === 'base' && runs.length < L.calidadLargaEnBaseMinSalidas && runs.some((s) => CALIDAD_LARGA.includes(tipo(s)))) {
      errores.push('En fase de base, series o tempo solo con 3 salidas o más');
    }
    if (calidad.some((s) => minCarrera(s) < MIN_CALIDAD - 10)) errores.push('Sesión de calidad demasiado corta para hacerla con calentamiento');

    const tirada = runs.find((s) => tipo(s) === 'tirada');
    if (runs.filter((s) => tipo(s) === 'tirada').length > 1) errores.push('Más de una tirada larga');
    if (tirada && runs.some((s) => s !== tirada && minCarrera(s) > minCarrera(tirada))) errores.push('La tirada larga debe ser la sesión de carrera más larga');

    const duras = runs.filter((s) => TIPOS_CALIDAD.includes(tipo(s)) || tipo(s) === 'tirada');
    for (let i = 0; i < duras.length; i++) for (let j = i + 1; j < duras.length; j++) {
      if (consecutivos(duras[i].dia, duras[j].dia)) errores.push('Dos sesiones duras (calidad o tirada larga) en días seguidos');
    }

    // La fuerza de apoyo solo puede ir tras un rodaje suave o correr-caminar
    if (runs.some((s) => Array.isArray(s.ejercicios) && s.ejercicios.length && !['rodaje', 'correr_caminar'].includes(tipo(s)))) {
      errores.push('Fuerza de apoyo después de una sesión dura o de la tirada larga');
    }

    // Avisos (no bloquean)
    const fuerza = sesiones.filter((s) => s.tipo === 'fuerza');
    if (fuerza.some((f) => calidad.some((q) => (f.dia + 1) % 7 === q.dia))) avisos.push('Fuerza el día antes de una sesión de calidad');
    if (L.fase === 'semana_prueba' && calidad.length > 1) avisos.push('Semana de la prueba con más de una sesión de calidad');
  }
  return { ok: errores.length === 0, errores: [...new Set(errores)], avisos };
}
