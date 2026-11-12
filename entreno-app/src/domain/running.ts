// Planificación de carrera por reglas (400 m a media maratón).
// Intensidad por esfuerzo percibido y prueba del habla; sin zonas de pulso por edad ni umbrales inventados.
// Ritmos solo como estimación a partir de una marca real (fórmula de Riegel, 1981) y para 1500 m o más.

import type { PlannedSession, Profile, RaceDistance, RunPlan, RunType } from './types';

export const RACE_LABEL: Record<RaceDistance, string> = {
  '400': '400 m', '800': '800 m', '1500': '1500 m', '5k': '5 km', '10k': '10 km', '21k': 'Media maratón (21,1 km)',
};
export const RACE_KM: Record<RaceDistance, number> = { '400': 0.4, '800': 0.8, '1500': 1.5, '5k': 5, '10k': 10, '21k': 21.0975 };
export const RUN_TYPE_LABEL: Record<RunType, string> = {
  correr_caminar: 'Correr y caminar', rodaje: 'Rodaje suave', series: 'Series', series_cortas: 'Series cortas',
  tempo: 'Ritmo continuo', tirada: 'Tirada larga', cuestas: 'Cuestas', ritmo_carrera: 'Ritmo de carrera',
};
const SHORT: RaceDistance[] = ['400', '800', '1500'];
export const isShort = (d: RaceDistance) => SHORT.includes(d);

const RPE = {
  suave: 'Suave: puedes mantener una conversación (esfuerzo 3–4 de 10).',
  tempo: 'Exigente y sostenido: solo puedes decir frases cortas (esfuerzo 6–7 de 10).',
  series: 'Rápido pero controlado: el mismo ritmo en todas las repeticiones (esfuerzo 7–8 de 10).',
  cortas: 'Muy rápido con buena técnica; recupera del todo entre repeticiones (esfuerzo 8–9 de 10).',
};

/** Fase según los días que faltan para la prueba. */
export function phaseOf(fechaPrueba: string | undefined, now: Date): { fase: 'base' | 'especifica' | 'afinamiento' | 'semana_prueba'; dias?: number } {
  if (!fechaPrueba) return { fase: 'base' };
  const d = Math.round((new Date(fechaPrueba + 'T12:00:00').getTime() - now.getTime()) / 864e5);
  if (d < 0) return { fase: 'base', dias: d };
  if (d <= 7) return { fase: 'semana_prueba', dias: d };
  if (d <= 14) return { fase: 'afinamiento', dias: d };
  if (d <= 56) return { fase: 'especifica', dias: d };
  return { fase: 'base', dias: d };
}

/** Riegel: T2 = T1 · (D2/D1)^1,06. Devuelve segundos. */
export function riegel(t1Seg: number, d1Km: number, d2Km: number): number {
  return t1Seg * Math.pow(d2Km / d1Km, 1.06);
}
export const fmtPace = (segPorKm: number) => `${Math.floor(segPorKm / 60)}:${String(Math.round(segPorKm % 60)).padStart(2, '0')} min/km`;
export const fmtTime = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = Math.round(s % 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`;
};
/** "mm:ss" o "h:mm:ss" → segundos, o null. */
export function parseTime(t: string): number | null {
  const m = t.trim().match(/^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const s = (Number(m[1] ?? 0) * 3600) + Number(m[2]) * 60 + Number(m[3]);
  return s > 0 && Number(m[3]) < 60 ? s : null;
}

/** Ritmo estimado para la distancia objetivo a partir de una marca reciente (solo 1500 m o más). */
export function targetPace(p: Profile): { ritmo: number; tiempo: number } | null {
  const c = p.carrera;
  if (!c?.marca || c.distancia === '400' || c.distancia === '800') return null;
  if (c.marca.distanciaKm < 1) return null;
  const km = RACE_KM[c.distancia];
  const t = riegel(c.marca.tiempoSeg, c.marca.distanciaKm, km);
  return { ritmo: t / km, tiempo: t };
}

// ── Límites de volumen (v0.6) ─────────────────────────────────────
// Son los mismos que aplica el validador del servidor del entrenador con IA
// (menarguez-fit-ai: api/_lib/entreno/limites.js). Si se cambian aquí, cambiarlos allí.
// Volumen = minutos totales de las sesiones de carrera (con calentamiento), sin contar correr-caminar.
export const MIN_SESION_CARRERA = 20;   // para decidir cuántas salidas caben en el presupuesto
export const MIN_RODAJE = 15;
export const MIN_CALIDAD = 36;          // una sesión de calidad (con calentamiento) necesita al menos 36 min
export const BASE_CALIDAD = 60;         // series, tempo, cuestas… solo con 60 min/semana o más
/** Minutos semanales de carrera permitidos: +10 % o +15 min sobre lo que ya corres (lo que sea mayor), mínimo 40. */
export function weeklyBudget(minutosSemana: number): number {
  const b = Math.max(0, minutosSemana || 0);
  return Math.max(40, Math.round(Math.max(b * 1.1, b + 15)));
}

export function runDaysFor(p: Profile): { run: number[]; strength: number[] } {
  const c = p.carrera!;
  const dias = Math.min(6, Math.max(1, Math.round(p.dias)));
  const cap = c.experiencia === 'empiezo' ? 3 : c.experiencia === 'ocasional' ? 4 : 5;
  let R = dias >= 5 ? dias - 2 : dias >= 3 ? dias - 1 : dias;
  R = Math.min(R, cap);
  if (c.experiencia !== 'empiezo') R = Math.max(1, Math.min(R, Math.floor(weeklyBudget(c.minutosSemana) / MIN_SESION_CARRERA)));
  const S = Math.min(2, dias - R);
  const RUN: Record<number, number[]> = { 1: [5], 2: [1, 5], 3: [1, 3, 6], 4: [1, 3, 4, 6], 5: [0, 1, 3, 4, 6] };
  const run = RUN[R] ?? [];
  // Fuerza en los días más alejados de la carrera (evita fuerza el día antes o después de correr)
  const dist = (d: number) => Math.min(...run.map((r) => Math.min(Math.abs(d - r), 7 - Math.abs(d - r))), 7);
  const pref = [0, 3, 2, 4, 5, 6];
  const strength: number[] = [];
  for (const d of pref.filter((x) => !run.includes(x)).sort((a, b) => dist(b) - dist(a) || pref.indexOf(a) - pref.indexOf(b))) {
    if (strength.length >= S) break;
    if (strength.some((x) => Math.abs(x - d) <= 1)) continue;   // dos días de fuerza, no seguidos
    strength.push(d);
  }
  strength.sort((a, b) => a - b);
  return { run, strength };
}

// Sesiones de calidad solo si ya hay base: al menos 60 min/semana de carrera. En distancias de
// 1500 m o más, además, en fase de base hacen falta al menos 3 salidas. Si no, rodaje suave.
export const QUALITY: RunType[] = ['series', 'tempo', 'series_cortas', 'cuestas', 'ritmo_carrera'];
const QUALITY_LONG: RunType[] = ['series', 'tempo'];
function slotsFor(p: Profile, n: number, now: Date, soloSuave = false): RunType[] {
  const c = p.carrera!;
  if (soloSuave) return Array.from({ length: n }, () => (c.experiencia === 'empiezo' ? 'correr_caminar' : 'rodaje'));
  const { fase } = phaseOf(c.fechaPrueba, now);
  return slotsBase(p, n, fase === 'base').map((t) => {
    if (QUALITY.includes(t) && c.minutosSemana < BASE_CALIDAD) return 'rodaje';
    if (QUALITY_LONG.includes(t) && fase === 'base' && n <= 2) return 'rodaje';
    return t;
  });
}
function slotsBase(p: Profile, n: number, faseBase: boolean): RunType[] {
  const c = p.carrera!;
  if (c.experiencia === 'empiezo') return Array.from({ length: n }, () => 'correr_caminar');
  if (isShort(c.distancia)) {
    // Como máximo 2 sesiones duras por semana: cuestas en la fase de base, ritmo de carrera después.
    const especifico: RunType = faseBase ? 'cuestas' : 'ritmo_carrera';
    const t: Record<number, RunType[]> = { 1: ['series_cortas'], 2: ['series_cortas', 'rodaje'], 3: ['series_cortas', 'rodaje', especifico],
      4: ['series_cortas', 'rodaje', especifico, 'rodaje'], 5: ['rodaje', 'series_cortas', 'rodaje', especifico, 'rodaje'] };
    return t[n];
  }
  const t: Record<number, RunType[]> = { 1: ['tirada'], 2: ['series', 'tirada'], 3: ['series', 'rodaje', 'tirada'],
    4: ['series', 'rodaje', 'tempo', 'tirada'], 5: ['rodaje', 'series', 'rodaje', 'tempo', 'tirada'] };
  return t[n];
}

function minutesBase(p: Profile, tipo: RunType): number {
  const c = p.carrera!;
  const reg = c.experiencia === 'regular';
  const table: Record<RaceDistance, { rodaje: number; tirada: number }> = {
    '400': { rodaje: reg ? 35 : 25, tirada: 0 }, '800': { rodaje: reg ? 35 : 25, tirada: 0 }, '1500': { rodaje: reg ? 40 : 30, tirada: 0 },
    '5k': { rodaje: reg ? 40 : 30, tirada: reg ? 55 : 40 }, '10k': { rodaje: reg ? 45 : 35, tirada: reg ? 70 : 55 },
    '21k': { rodaje: reg ? 50 : 40, tirada: reg ? 100 : 75 },
  };
  const semana = Math.max(0, c.minutosSemana);
  // Aumento gradual: la referencia se limita según lo que ya corres cada semana.
  if (tipo === 'tirada') return Math.round(Math.min(table[c.distancia].tirada, Math.max(30, semana * 0.45 + 10)));
  return Math.round(Math.min(table[c.distancia].rodaje, Math.max(20, semana * 0.3 + 10)));
}

function session(p: Profile, tipo: RunType, idx: number, now: Date, maxMin = Infinity): RunPlan {
  const c = p.carrera!;
  const reg = c.experiencia === 'regular';
  const { fase } = phaseOf(c.fechaPrueba, now);
  const taper = fase === 'afinamiento' ? 0.65 : fase === 'semana_prueba' ? 0.5 : 1;
  const tp = targetPace(p);
  const calent = ['10–15 min de trote suave.', 'Movilidad dinámica: balanceos de pierna, skipping y talones al glúteo, 2 × 20 m de cada.'];
  const calma = ['5–10 min de trote o caminata suave.'];
  // escala < 1 cuando la sesión de calidad debe quedar más corta que la tirada larga
  const escala = (base: number) => (base > maxMin ? Math.max(0.5, (maxMin - 25) / (base - 25)) : 1);
  let esc = 1;
  const reps = (n: number) => Math.max(2, Math.round(n * (taper < 1 ? 0.6 : 1) * esc));
  switch (tipo) {
    case 'correr_caminar': {
      const sem = c.minutosSemana;
      const [run, walk, rounds] = sem < 30 ? [1, 2, 8] : sem < 60 ? [2, 1, 8] : [4, 1, 5];
      return { tipo, minutos: rounds * (run + walk) + 10, intensidad: RPE.suave,
        bloques: ['5 min caminando a paso vivo.', `${rounds} × (${run} min corriendo suave + ${walk} min caminando).`, '5 min caminando suave.'],
        nota: 'Cuando puedas correr 30 min seguidos de forma cómoda, cambia tu experiencia a "ocasional" en el perfil para pasar a sesiones específicas.' };
    }
    case 'rodaje': {
      const m = Math.round(Math.min(minutesBase(p, 'rodaje') * taper, Math.max(MIN_RODAJE, maxMin)));
      return { tipo, minutos: m, intensidad: RPE.suave,
        bloques: [`${m} min de carrera continua suave.`, ...(isShort(c.distancia) || c.distancia === '5k' ? ['Al final, 4–6 progresivos de 80–100 m acelerando poco a poco, con vuelta caminando.'] : [])] };
    }
    case 'tirada': {
      const m = Math.round(Math.min(minutesBase(p, 'tirada') * taper, maxMin));
      return { tipo, minutos: m, intensidad: RPE.suave, bloques: [`${m} min continuos a ritmo suave. Si lo necesitas, intercala 1 min caminando cada 10–15 min.`],
        nota: 'La tirada larga es la sesión más larga de la semana; no la hagas el día siguiente a las series.' };
    }
    case 'tempo': {
      esc = escala(15 + (reg ? 22 : 19) * taper + 10);
      const main = reg ? `${Math.round(22 * taper * esc)} min continuos` : `2 × ${Math.round(8 * taper * esc)} min con 3 min de trote suave entre bloques`;
      return { tipo, minutos: Math.round(15 + (reg ? 22 : 19) * taper * esc + 10), intensidad: RPE.tempo,
        bloques: [...calent, `${main}.`, ...calma], ritmo: tp ? `Orientativo: algo más lento que tu ritmo estimado de ${c.distancia === '21k' ? 'media maratón' : '10 km'}.` : undefined };
    }
    case 'series': {
      esc = escala(45);
      const d = c.distancia;
      const base = fase === 'base' && !reg ? `${reps(8)} × 1 min alegre + 1 min suave (fartlek)`
        : d === '5k' ? (reg ? `${reps(6)} × 800 m con 2 min de trote` : `${reps(6)} × 400 m con 2 min de trote`)
        : d === '10k' ? (reg ? `${reps(5)} × 1000 m con 2 min de trote` : `${reps(5)} × 800 m con 2 min de trote`)
        : (reg ? `${reps(3)} × 2000 m con 3 min de trote` : `${reps(4)} × 1000 m con 2 min de trote`);
      return { tipo, minutos: Math.round(Math.min(45, Math.max(30, 25 + 20 * esc))), intensidad: RPE.series, bloques: [...calent, '3–4 progresivos de 80 m.', `${base}.`, ...calma],
        ritmo: tp ? `Ritmo de referencia estimado para tu ${RACE_LABEL[d]}: ${fmtPace(tp.ritmo)}. Las repeticiones, cerca de ese ritmo o algo más rápido.` : undefined };
    }
    case 'series_cortas': {
      esc = escala(50);
      const d = c.distancia;
      const main = d === '400' ? (reg ? `${reps(8)} × 200 m, recuperación 3 min caminando` : `${reps(6)} × 150 m, recuperación 3 min caminando`)
        : d === '800' ? (reg ? `${reps(6)} × 400 m, recuperación 2–3 min` : `${reps(5)} × 300 m, recuperación 3 min`)
        : (reg ? `${reps(5)} × 600 m, recuperación 2 min 30 s` : `${reps(6)} × 400 m, recuperación 2 min`);
      return { tipo, minutos: Math.round(Math.min(50, Math.max(30, maxMin))), intensidad: RPE.cortas, bloques: [...calent, '3 progresivos de 60–80 m.', `${main}.`, ...calma],
        ritmo: tp ? `Ritmo estimado de tu ${RACE_LABEL[d]}: ${fmtPace(tp.ritmo)}.` : undefined };
    }
    case 'cuestas':
      esc = escala(40);
      return { tipo, minutos: Math.round(Math.min(40, Math.max(30, maxMin))), intensidad: RPE.cortas,
        bloques: [...calent, `${reps(8)} × 10–15 s subiendo una cuesta moderada, con vuelta caminando.`, ...calma] };
    case 'ritmo_carrera': {
      esc = escala(45);
      const d = c.distancia;
      const main = d === '400' ? `${reps(3)} × 200 m al ritmo que quieres llevar en el 400, con 5 min de recuperación`
        : d === '800' ? `${reps(3)} × 400 m al ritmo de tu objetivo de 800, con 4 min de recuperación`
        : `${reps(3)} × 500 m al ritmo de tu objetivo de 1500, con 3 min de recuperación`;
      return { tipo, minutos: Math.round(Math.min(45, Math.max(30, maxMin))), intensidad: RPE.cortas, bloques: [...calent, '3 progresivos de 80 m.', `${main}.`, ...calma] };
    }
  }
}

/**
 * Reparte el presupuesto semanal: primero la tirada larga (su parte según el número de salidas),
 * después las sesiones de calidad (si no caben con al menos MIN_CALIDAD min, pasan a rodaje)
 * y el resto, a partes iguales entre los rodajes. La tirada siempre es la sesión más larga.
 */
function budgetPlans(p: Profile, slotsIn: RunType[], now: Date): RunPlan[] {
  const c = p.carrera!;
  const slots = [...slotsIn];
  const n = slots.length;
  if (c.experiencia === 'empiezo') return slots.map((t, i) => session(p, t, i, now));
  const V = weeklyBudget(c.minutosSemana);
  const iT = slots.indexOf('tirada');
  const share = n === 1 ? 1 : n === 2 ? 0.55 : n === 3 ? 0.4 : 0.33;
  const tirada = iT >= 0 ? session(p, 'tirada', iT, now, Math.max(MIN_SESION_CARRERA, Math.round(V * share))) : null;
  const T = tirada ? tirada.minutos : 0;
  const techo = tirada ? T - 5 : Infinity;
  let resto = V - T;
  const otros = slots.map((_, i) => i).filter((i) => i !== iT);
  let q = otros.filter((i) => QUALITY.includes(slots[i]));
  let r = otros.length - q.length;
  // Si las sesiones de calidad no caben, la última pasa a rodaje
  while (q.length && Math.min(techo, Math.floor((resto - r * MIN_RODAJE) / q.length)) < MIN_CALIDAD) {
    slots[q[q.length - 1]] = 'rodaje';
    q = q.slice(0, -1); r++;
  }
  const out: RunPlan[] = new Array(n);
  if (tirada) out[iT] = tirada;
  if (q.length) {
    const capQ = Math.min(techo, Math.floor((resto - r * MIN_RODAJE) / q.length));
    for (const i of q) { out[i] = session(p, slots[i], i, now, capQ); resto -= out[i].minutos; }
  }
  const capR = r ? Math.min(techo, Math.floor(resto / r)) : 0;
  otros.filter((i) => !out[i]).forEach((i) => { out[i] = session(p, slots[i], i, now, capR); });
  return out;
}

/** soloSuave: carrera como segundo objetivo → solo rodajes suaves (o correr y caminar), sin fases. */
export function runSessions(p: Profile, days: number[], now: Date, { soloSuave = false } = {}): PlannedSession[] {
  const c = p.carrera!;
  const { fase, dias } = phaseOf(c.fechaPrueba, now);
  const plans = budgetPlans(p, slotsFor(p, days.length, now, soloSuave), now);
  const impact = p.limitaciones.some((l) => l === 'rodilla' || l === 'tobillo' || l === 'cadera');
  return days.map((d, i) => {
    const plan = plans[i];
    const avisos: string[] = [];
    let min = Math.round(plan.minutos);
    if (min > p.minutos) {
      avisos.push(`La sesión se ha recortado a tus ${p.minutos} min disponibles.${plan.tipo === 'tirada' && c.distancia === '21k' ? ' Para una media maratón conviene un día con más tiempo para la tirada larga.' : ''}`);
      min = p.minutos;
      plan.minutos = min;
      if (plan.tipo === 'rodaje' || plan.tipo === 'tirada') plan.bloques = [`${min} min de carrera continua suave.`];
    }
    if (impact) avisos.push('Has indicado una limitación en rodilla, cadera o tobillo: si aparece dolor al correr, detente y sustitúyelo por bicicleta o elíptica. No aumentes el volumen mientras dure la molestia.');
    if (!soloSuave && fase === 'semana_prueba' && i === days.length - 1) avisos.push('Semana de la prueba: el día anterior, descanso o 15 min muy suaves.');
    return {
      id: `r${i + 1}-${plan.tipo}`, dia: d, tipo: 'carrera', titulo: RUN_TYPE_LABEL[plan.tipo],
      objetivo: soloSuave ? `Base de carrera para tu ${RACE_LABEL[c.distancia]} (segundo objetivo)`
        : `Preparación de ${RACE_LABEL[c.distancia]}${dias != null && dias >= 0 ? ` · faltan ${dias} días` : ''}`,
      minutosEstimados: min, calentamiento: [], ejercicios: [], carrera: plan, vueltaCalma: [], avisos,
    };
  });
}

export function runningNotes(p: Profile, now: Date): string[] {
  const c = p.carrera!;
  const { fase, dias } = phaseOf(c.fechaPrueba, now);
  const out: string[] = [];
  const FASE: Record<string, string> = {
    base: 'Fase de base: volumen suave y técnica. Sin fecha de prueba o con más de 8 semanas por delante.',
    especifica: 'Fase específica: entrenamientos al ritmo de tu prueba.',
    afinamiento: 'Afinamiento: se reduce el volumen alrededor de un tercio y se mantiene algo de intensidad para llegar descansado.',
    semana_prueba: 'Semana de la prueba: poco volumen, sesiones cortas y descanso.',
  };
  out.push(FASE[fase] + (dias != null && dias < 0 ? ' (la fecha de la prueba ya ha pasado; actualízala en tu perfil).' : ''));
  const tp = targetPace(p);
  if (tp) out.push(`Estimación a partir de tu marca (fórmula de Riegel): ${RACE_LABEL[c.distancia]} en ≈${fmtTime(tp.tiempo)} (${fmtPace(tp.ritmo)}). Es orientativa; el calor, el desnivel y el día influyen.`);
  else if (!isShort(c.distancia)) out.push('Sin marca reciente, la intensidad se guía por sensaciones. Si añades una marca en tu perfil, verás ritmos orientativos.');
  out.push('Regenera el plan cada semana para que avance de fase conforme se acerca la prueba.');
  out.push('Compara solo sesiones del mismo tipo: un rodaje con otro rodaje, unas series con otras iguales. Ritmo y pulso medio de sesiones distintas no indican progreso.');
  return out;
}
