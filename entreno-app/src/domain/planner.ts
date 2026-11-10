// Planificador por reglas: misma entrada → mismo plan. Sin aleatoriedad ni IA.
// Criterios base: ACSM (2009) modelos de progresión; OMS (2020) actividad física;
// base de conocimiento del proyecto (principiantes 1–3 series, 6–15 reps, sin llegar al fallo).

import { EXERCISES, EXERCISE_BY_ID, LIMITATION_LABEL } from '../data/exercises';
import { runDaysFor, runningNotes, runSessions } from './running';
import type {
  Aerobic, Exercise, Goal, Pattern, PlannedExercise, PlannedSession, Prescription, Profile, WeekPlan,
} from './types';

export const DAY_NAMES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

type Role = 'principal' | 'secundario' | 'accesorio';
interface Slot { patrones: Pattern[]; rol: Role }
interface Template { key: string; titulo: string; slots: Slot[] }

const P = (rol: Role, ...patrones: Pattern[]): Slot => ({ patrones, rol });

const T: Record<string, Template> = {
  FB_A: { key: 'FB_A', titulo: 'Cuerpo completo A', slots: [
    P('principal', 'sentadilla', 'unilateral'), P('principal', 'empuje_h'), P('principal', 'traccion_h', 'traccion_v'),
    P('secundario', 'bisagra', 'gluteo'), P('accesorio', 'tronco'), P('accesorio', 'hombro_aisl')] },
  FB_B: { key: 'FB_B', titulo: 'Cuerpo completo B', slots: [
    P('principal', 'gluteo', 'bisagra'), P('principal', 'traccion_v', 'traccion_h'), P('principal', 'empuje_v', 'empuje_h'),
    P('secundario', 'unilateral', 'sentadilla'), P('accesorio', 'tronco'), P('accesorio', 'biceps')] },
  FB_C: { key: 'FB_C', titulo: 'Cuerpo completo C', slots: [
    P('principal', 'sentadilla', 'unilateral'), P('principal', 'traccion_h', 'traccion_v'), P('principal', 'empuje_h'),
    P('secundario', 'bisagra', 'gluteo'), P('accesorio', 'tronco'), P('accesorio', 'triceps')] },
  U_A: { key: 'U_A', titulo: 'Torso A', slots: [
    P('principal', 'empuje_h'), P('principal', 'traccion_h', 'traccion_v'), P('secundario', 'empuje_v', 'hombro_aisl'),
    P('secundario', 'traccion_v', 'traccion_h'), P('accesorio', 'biceps'), P('accesorio', 'triceps')] },
  U_B: { key: 'U_B', titulo: 'Torso B', slots: [
    P('principal', 'traccion_v', 'traccion_h'), P('principal', 'empuje_h'), P('secundario', 'traccion_h'),
    P('accesorio', 'hombro_aisl'), P('accesorio', 'triceps'), P('accesorio', 'biceps')] },
  L_A: { key: 'L_A', titulo: 'Pierna A', slots: [
    P('principal', 'sentadilla', 'unilateral'), P('principal', 'bisagra', 'gluteo'), P('secundario', 'unilateral', 'gluteo'),
    P('accesorio', 'gemelo'), P('accesorio', 'tronco')] },
  L_B: { key: 'L_B', titulo: 'Pierna B', slots: [
    P('principal', 'gluteo', 'bisagra'), P('principal', 'sentadilla', 'unilateral'), P('secundario', 'pierna_aisl', 'gluteo'),
    P('accesorio', 'unilateral', 'pierna_aisl'), P('accesorio', 'tronco')] },
  PUSH: { key: 'PUSH', titulo: 'Empuje', slots: [
    P('principal', 'empuje_h'), P('principal', 'empuje_v', 'hombro_aisl'), P('secundario', 'empuje_h'),
    P('accesorio', 'hombro_aisl'), P('accesorio', 'triceps')] },
  PULL: { key: 'PULL', titulo: 'Tracción', slots: [
    P('principal', 'traccion_v', 'traccion_h'), P('principal', 'traccion_h'), P('secundario', 'traccion_h', 'traccion_v'),
    P('accesorio', 'hombro_aisl'), P('accesorio', 'biceps')] },
  LEGS: { key: 'LEGS', titulo: 'Pierna', slots: [
    P('principal', 'sentadilla', 'unilateral'), P('principal', 'bisagra', 'gluteo'), P('secundario', 'unilateral'),
    P('accesorio', 'pierna_aisl', 'gluteo'), P('accesorio', 'gemelo'), P('accesorio', 'tronco')] },
};

const STRENGTH_DAYS: Record<number, number[]> = {
  1: [0], 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 4, 5], 6: [0, 1, 2, 3, 4, 5],
};
const AEROBIC_ORDER = [5, 2, 6, 3, 1, 4];

const GOAL_TEXT: Record<Goal, string> = {
  hipertrofia: 'Desarrollo muscular con técnica estable',
  fuerza: 'Fuerza en los movimientos básicos',
  salud: 'Fuerza útil para la salud y la vida diaria',
  composicion: 'Mantener y ganar músculo mientras mejoras tu composición corporal',
  resistencia: 'Resistencia muscular y capacidad de trabajo',
  carrera: 'Fuerza de apoyo para correr: piernas, tronco y prevención de molestias',
};

export const AEROBIC_LABEL: Record<Aerobic, string> = {
  caminar: 'Caminar a paso vivo', correr: 'Correr suave', bici: 'Bicicleta', eliptica: 'Elíptica', nadar: 'Nadar', remo: 'Remo ergómetro',
};

export type PlanResult = { ok: true; plan: WeekPlan } | { ok: false; motivo: string; faltan?: string[] };

export function isBeginner(p: Pick<Profile, 'experiencia'>) {
  return p.experiencia === 'ninguna' || p.experiencia === 'principiante';
}

/** Comprueba seguridad y datos esenciales antes de planificar. */
export function canPlan(p: Profile): { ok: true } | { ok: false; motivo: string; faltan?: string[] } {
  const faltan: string[] = [];
  if (!p.nombre?.trim()) faltan.push('nombre o alias');
  if (!Number.isFinite(p.edad)) faltan.push('edad');
  if (!p.objetivo) faltan.push('objetivo');
  if (!p.experiencia) faltan.push('experiencia');
  if (!(p.dias >= 1 && p.dias <= 6)) faltan.push('días disponibles (1 a 6)');
  if (!(p.minutos >= 20 && p.minutos <= 120)) faltan.push('minutos por sesión (20 a 120)');
  if (!p.material?.length) faltan.push('material disponible');
  if (p.objetivo === 'carrera' && !p.carrera?.distancia) faltan.push('datos de tu carrera (distancia y experiencia)');
  if (faltan.length) return { ok: false, motivo: 'Faltan datos para planificar con seguridad.', faltan };
  if (p.edad < 18) return { ok: false, motivo: 'Menarguez Fit IA es solo para mayores de 18 años.' };
  const s = p.screening;
  if ((s.sintomasEsfuerzo || s.restriccionProfesional) && !s.valoradoPorProfesional) {
    return {
      ok: false,
      motivo: s.sintomasEsfuerzo
        ? 'Has indicado síntomas con el esfuerzo (dolor en el pecho, mareo o pérdida de conocimiento). Antes de empezar un programa conviene que te valore un profesional sanitario.'
        : 'Has indicado que un profesional te ha restringido el ejercicio o pedido supervisión. Sigue sus indicaciones antes de empezar este programa.',
    };
  }
  return { ok: true };
}

function preferredDifficulty(p: Profile): number {
  if (isBeginner(p) || p.edad >= 65 || p.screening.embarazoPosparto) return 1;
  return p.experiencia === 'intermedio' ? 2 : 3;
}
function maxDifficulty(p: Profile): number {
  if (p.experiencia === 'ninguna') return 1;
  if (p.experiencia === 'principiante' || p.screening.embarazoPosparto || p.edad >= 65) return 2;
  return 3;
}

/** En los ejercicios principales se prefiere lo que permite progresar con carga externa
 *  (salvo sin experiencia, donde se prioriza aprender el patrón con el peso corporal). */
function loadRank(p: Profile, e: Exercise): number {
  if (p.experiencia === 'ninguna') return 0;
  if (e.carga === 'mancuernas' || e.carga === 'maquina') return 0;
  if (e.carga === 'corporal' && e.dificultad === 3) return 0;
  return e.carga === 'banda' ? 1 : 2;
}

/** Ejercicios utilizables por esta persona y motivo de exclusión del resto. */
export function availableExercises(p: Profile) {
  const material = new Set(p.material.concat('corporal'));
  const usable: Exercise[] = [];
  const excluidos: { id: string; motivo: string }[] = [];
  const maxDif = maxDifficulty(p);
  for (const e of EXERCISES) {
    const lim = e.evitarSi.find((l) => p.limitaciones.includes(l));
    if (lim) { excluidos.push({ id: e.id, motivo: `Limitación declarada: ${LIMITATION_LABEL[lim].toLowerCase()}` }); continue; }
    if (p.evitarEjercicios.includes(e.id)) { excluidos.push({ id: e.id, motivo: 'Has pedido evitarlo' }); continue; }
    if (!e.material.every((m) => material.has(m))) continue;
    if (e.dificultad > maxDif) continue;
    usable.push(e);
  }
  return { usable, excluidos };
}

export function prescription(p: Profile, e: Exercise, rol: Role): Prescription {
  const beginner = isBeginner(p);
  const compound = e.tipo === 'compuesto';
  let repsMin: number, repsMax: number, descansoSeg: number;
  const goal = p.objetivo === 'carrera' ? (p.carrera && ['400', '800'].includes(p.carrera.distancia) ? 'fuerza' : 'salud') : p.objetivo;
  switch (goal) {
    case 'fuerza':
      [repsMin, repsMax] = compound ? (beginner ? [6, 8] : [4, 6]) : [8, 12];
      descansoSeg = compound ? (beginner ? 120 : 180) : 75; break;
    case 'hipertrofia':
      [repsMin, repsMax] = compound ? [6, 10] : [10, 15];
      descansoSeg = compound ? 120 : 75; break;
    case 'resistencia':
      [repsMin, repsMax] = compound ? [12, 15] : [15, 20];
      descansoSeg = compound ? 60 : 45; break;
    default:
      [repsMin, repsMax] = compound ? [8, 12] : [10, 15];
      descansoSeg = compound ? 90 : 60;
  }
  if (e.unidad === 'segundos') {
    [repsMin, repsMax] = beginner ? [20, 30] : p.experiencia === 'intermedio' ? [30, 45] : [40, 60];
    descansoSeg = 60;
  }
  let series = beginner ? 2 : p.experiencia === 'intermedio' ? 3 : (rol === 'principal' ? 4 : 3);
  if (rol === 'accesorio' && series > 2) series -= 1;
  let rir = beginner ? 3 : p.experiencia === 'intermedio' ? 2 : (compound ? 2 : 1);
  if (lowRecovery(p)) { series = Math.max(1, series - 1); rir += 1; }
  if (p.edad >= 65 || p.screening.embarazoPosparto || p.screening.valoradoPorProfesional || p.dolorQueAumenta) rir = Math.max(rir, 3);
  return { series, repsMin, repsMax, rir, descansoSeg };
}

export function lowRecovery(p: Profile) {
  return p.sueno === 'menos6' || p.recuperacion === 'mala';
}

/** Duración estimada de un ejercicio en minutos (incluye cambios de material). */
export function exerciseMinutes(e: Exercise, pr: Prescription): number {
  const avg = (pr.repsMin + pr.repsMax) / 2;
  const work = e.unidad === 'segundos' ? avg * (e.patron === 'tronco' && e.id === 'plancha_lateral' ? 2 : 1)
    : e.unidad === 'reps_lado' ? avg * 2 * 3.5 : avg * 3.5;
  const totalSec = pr.series * work + Math.max(0, pr.series - 1) * pr.descansoSeg + 60;
  return totalSec / 60;
}

function warmup(p: Profile, ex: Exercise[]): string[] {
  const pats = new Set(ex.map((e) => e.patron));
  const out = ['3–5 min de actividad suave: marcha en el sitio, bicicleta o elíptica a ritmo cómodo.'];
  if (pats.has('sentadilla') || pats.has('unilateral')) out.push('10 sentadillas a silla o sin carga, en rango cómodo.');
  if (pats.has('bisagra') || pats.has('gluteo')) out.push('10 bisagras de cadera con las manos en la cintura y 10 puentes de glúteos.');
  if (pats.has('empuje_h') || pats.has('empuje_v')) out.push('10 círculos de hombros hacia atrás y 8 flexiones contra la pared.');
  if (pats.has('traccion_h') || pats.has('traccion_v')) out.push('10 aperturas de brazos y 10 retracciones de omóplatos.');
  out.push(`1–2 series de aproximación del primer ejercicio con poca carga${p.limitaciones.length ? '; comprueba que no aparece dolor' : ''}.`);
  return out;
}

const COOLDOWN = [
  '3–5 min caminando suave para bajar pulsaciones.',
  '1 min de respiración tranquila.',
  'Estiramientos suaves opcionales de los grupos trabajados, 20–30 s, sin dolor.',
];

function strengthAerobicSplit(p: Profile): { S: number; A: number } {
  const dias = Math.min(6, Math.max(1, Math.round(p.dias)));
  const cap = isBeginner(p) ? 3 : p.experiencia === 'intermedio' ? 4 : 6;
  let S = Math.min(dias, cap);
  if (['salud', 'composicion', 'resistencia'].includes(p.objetivo) && dias >= 4) S = Math.min(S, dias - 1);
  return { S, A: dias - S };
}

function templatesFor(p: Profile, S: number): Template[] {
  if (S <= 0) return []; // corredores con 1–2 días: solo carrera
  if (S === 1) return [T.FB_A];
  if (S === 2) return [T.FB_A, T.FB_B];
  if (S === 3) return [T.FB_A, T.FB_B, T.FB_C];
  if (S === 4) return [T.U_A, T.L_A, T.U_B, T.L_B];
  if (S === 5) return [T.U_A, T.L_A, T.PUSH, T.PULL, T.LEGS];
  return [T.PUSH, T.PULL, T.LEGS, T.PUSH, T.PULL, T.LEGS];
}

function pickAerobic(p: Profile): Aerobic {
  const impact = p.limitaciones.some((l) => l === 'rodilla' || l === 'tobillo' || l === 'cadera');
  const prefs = p.aerobicoPreferido.length ? p.aerobicoPreferido : ['caminar' as Aerobic];
  const ok = prefs.find((a) => !(impact && a === 'correr'));
  return ok ?? (impact ? 'bici' : 'caminar');
}

export function generatePlan(p: Profile, now = new Date()): PlanResult {
  const check = canPlan(p);
  if (!check.ok) return check;
  const { usable, excluidos } = availableExercises(p);
  const pref = preferredDifficulty(p);
  const runner = p.objetivo === 'carrera' && !!p.carrera;
  const rd = runner ? runDaysFor(p) : null;
  const { S, A } = runner ? { S: rd!.strength.length, A: 0 } : strengthAerobicSplit(p);
  const strengthDays = runner ? rd!.strength : STRENGTH_DAYS[S] ?? [];
  const aerobicDays = AEROBIC_ORDER.filter((d) => !strengthDays.includes(d)).slice(0, A).sort((a, b) => a - b);
  const usedWeek: Record<string, number> = {};
  const notas: string[] = [];
  const sesiones: PlannedSession[] = [];

  templatesFor(p, S).forEach((tpl, i) => {
    const used = new Set<string>();
    const chosen: { e: Exercise; rol: Role }[] = [];
    const missing: Pattern[] = [];
    for (const slot of tpl.slots) {
      let pick: Exercise | undefined;
      for (const pat of slot.patrones) {
        const cands = usable.filter((e) => e.patron === pat && !used.has(e.id));
        if (!cands.length) continue;
        cands.sort((a, b) =>
          (slot.rol !== 'accesorio' ? loadRank(p, a) - loadRank(p, b) : 0)
          || (usedWeek[a.id] ?? 0) - (usedWeek[b.id] ?? 0)
          || Math.abs(a.dificultad - pref) - Math.abs(b.dificultad - pref)
          || (slot.rol === 'principal' ? (a.tipo === 'compuesto' ? 0 : 1) - (b.tipo === 'compuesto' ? 0 : 1) : 0)
          || EXERCISES.indexOf(a) - EXERCISES.indexOf(b));
        pick = cands[0];
        break;
      }
      if (pick) { used.add(pick.id); chosen.push({ e: pick, rol: slot.rol }); } else missing.push(slot.patrones[0]);
    }

    // Ajuste al tiempo disponible: calentamiento + vuelta a la calma + ejercicios por orden de prioridad.
    const fixed = (p.minutos >= 45 ? 8 : 5) + 4;
    const items: PlannedExercise[] = [];
    const roles: Role[] = [];
    let total = fixed;
    for (const { e, rol } of chosen) {
      const presc = prescription(p, e, rol);
      const m = exerciseMinutes(e, presc);
      if (items.length >= 3 && total + m > p.minutos) break;
      items.push({ exerciseId: e.id, presc });
      roles.push(rol);
      total += m;
    }
    // Si incluso 3 ejercicios no caben, se reducen series (mínimo 1).
    let guard = 0;
    while (total > p.minutos + 2 && guard++ < 10) {
      const target = [...items].sort((a, b) => b.presc.series - a.presc.series)[0];
      if (!target || target.presc.series <= 1) break;
      target.presc = { ...target.presc, series: target.presc.series - 1 };
      total = fixed + items.reduce((s, it) => s + exerciseMinutes(EXERCISE_BY_ID[it.exerciseId], it.presc), 0);
    }
    // Si sobra tiempo, una serie más en los ejercicios principales (sin superar el máximo por nivel).
    if (!lowRecovery(p) && !p.dolorQueAumenta) {
      const maxSeries = runner ? 3 : isBeginner(p) ? 3 : p.experiencia === 'intermedio' ? 4 : 5;
      let added = true;
      while (added) {
        added = false;
        for (let k = 0; k < items.length; k++) {
          if (roles[k] !== 'principal' || items[k].presc.series >= maxSeries) continue;
          const e = EXERCISE_BY_ID[items[k].exerciseId];
          const extra = exerciseMinutes(e, { ...items[k].presc, series: items[k].presc.series + 1 }) - exerciseMinutes(e, items[k].presc);
          if (total + extra <= p.minutos - 2) {
            items[k].presc = { ...items[k].presc, series: items[k].presc.series + 1 };
            total += extra; added = true;
          }
        }
      }
    }
    items.forEach((it) => { usedWeek[it.exerciseId] = (usedWeek[it.exerciseId] ?? 0) + 1; });

    const avisos: string[] = [];
    if (missing.includes('traccion_v') || missing.includes('traccion_h')) {
      avisos.push('Sin material para ejercicios de tracción. Una banda elástica permitiría añadirlos.');
    }
    if (lowRecovery(p)) avisos.push('Por tu sueño o recuperación, el volumen es algo menor y el esfuerzo más moderado.');
    if (p.limitaciones.length) avisos.push('Se han excluido ejercicios incompatibles con tus limitaciones. Si un movimiento duele, detente y usa la alternativa.');

    sesiones.push({
      id: `s${i + 1}-${tpl.key}`,
      dia: strengthDays[i],
      tipo: 'fuerza',
      titulo: tpl.titulo,
      objetivo: GOAL_TEXT[p.objetivo],
      minutosEstimados: Math.round(total),
      calentamiento: warmup(p, items.map((it) => EXERCISE_BY_ID[it.exerciseId])),
      ejercicios: items,
      vueltaCalma: COOLDOWN,
      avisos,
    });
  });

  aerobicDays.forEach((d, i) => {
    const act = pickAerobic(p);
    const min = Math.max(20, Math.min(p.minutos - 10, isBeginner(p) ? 30 : 45));
    sesiones.push({
      id: `a${i + 1}`,
      dia: d,
      tipo: 'aerobica',
      titulo: 'Aeróbico y movilidad',
      objetivo: 'Capacidad aeróbica y recuperación activa',
      minutosEstimados: min + 10,
      calentamiento: ['5 min al mismo ejercicio a ritmo muy suave.'],
      ejercicios: [],
      aerobico: { actividad: act, minutos: min, intensidad: 'Moderada: puedes hablar en frases cortas pero no cantar (esfuerzo 4–6 de 10).' },
      vueltaCalma: ['5 min de movilidad: círculos de cadera, gato-camello y rotaciones torácicas.', 'Respiración tranquila.'],
      avisos: act === 'correr' && isBeginner(p) ? ['Si no corres habitualmente, alterna 1–2 min de carrera suave con 1–2 min caminando.'] : [],
    });
  });

  if (runner) sesiones.push(...runSessions(p, rd!.run, now));
  sesiones.sort((a, b) => a.dia - b.dia);
  const ocupados = new Set(sesiones.map((s) => s.dia));
  const diasDescanso = [0, 1, 2, 3, 4, 5, 6].filter((d) => !ocupados.has(d));

  if (['salud', 'composicion', 'resistencia'].includes(p.objetivo)) {
    notas.push('La OMS recomienda a las personas adultas 150–300 min semanales de actividad aeróbica moderada y fuerza al menos 2 días. Si partes de menos, puedes empezar por debajo y progresar.');
  }
  if (p.edad >= 65) notas.push('A partir de los 65 años conviene añadir trabajo de equilibrio varios días por semana (por ejemplo, apoyo unipodal cerca de una pared).');
  if (p.screening.embarazoPosparto) notas.push('Embarazo o posparto: sigue las indicaciones de tu matrona o profesional sanitario y evita esfuerzos máximos.');
  if (p.dolorQueAumenta) notas.push('Has indicado dolor que aumenta con el ejercicio. No progreses cargas en los ejercicios que lo provoquen y consulta a un profesional sanitario.');
  if (p.indicacionesProfesionales.trim()) notas.push(`Indicaciones profesionales a respetar: ${p.indicacionesProfesionales.trim()}`);
  if (runner) notas.unshift(...runningNotes(p, now));
  notas.push('Carga inicial: elige un peso que te permita completar las repeticiones con técnica estable dejando las repeticiones en reserva indicadas. La app no propone kilos hasta tener tus registros.');

  const plan: WeekPlan = {
    creado: now.toISOString(),
    version: 1,
    sesiones,
    diasDescanso,
    sugerenciaDescanso: runner ? 'Descanso: caminar o nada. Los días sin carrera también forman parte de la preparación.'
      : ['salud', 'composicion', 'resistencia'].includes(p.objetivo)
      ? 'En los días de descanso, un paseo de 20–30 min suma actividad sin interferir con la recuperación.'
      : 'Descanso: actividad cotidiana normal. Dormir bien también forma parte del plan.',
    notas,
    excluidos,
  };
  const errores = validatePlan(plan, p);
  if (errores.length) return { ok: false, motivo: `El plan generado no supera la validación: ${errores.join(' ')}` };
  return { ok: true, plan };
}

/** Validación independiente del plan (también aplicable a planes importados o editados). */
export function validatePlan(plan: WeekPlan, p: Profile): string[] {
  const errs: string[] = [];
  const material = new Set(p.material.concat('corporal'));
  if (plan.diasDescanso.length < 1) errs.push('Debe haber al menos un día de descanso.');
  if (plan.sesiones.length > p.dias) errs.push('Hay más sesiones que días disponibles.');
  const dias = plan.sesiones.map((s) => s.dia);
  if (new Set(dias).size !== dias.length) errs.push('Dos sesiones caen el mismo día.');
  for (const s of plan.sesiones) {
    if (s.minutosEstimados > p.minutos + 5) errs.push(`"${s.titulo}" supera el tiempo disponible.`);
    if (s.tipo === 'fuerza' && s.ejercicios.length < 1) errs.push(`"${s.titulo}" no tiene ejercicios.`);
    for (const it of s.ejercicios) {
      const e = EXERCISE_BY_ID[it.exerciseId];
      if (!e) { errs.push(`Ejercicio desconocido: ${it.exerciseId}.`); continue; }
      if (!e.material.every((m) => material.has(m))) errs.push(`${e.nombre} requiere material no disponible.`);
      if (e.evitarSi.some((l) => p.limitaciones.includes(l))) errs.push(`${e.nombre} es incompatible con una limitación declarada.`);
      if (p.evitarEjercicios.includes(e.id)) errs.push(`${e.nombre} estaba en tu lista para evitar.`);
      const pr = it.presc;
      if (!(pr.series >= 1 && pr.series <= 5 && pr.repsMin <= pr.repsMax && pr.rir >= 0 && pr.rir <= 5)) errs.push(`Prescripción no válida en ${e.nombre}.`);
    }
  }
  return errs;
}

/** Alternativas compatibles para sustituir un ejercicio durante la sesión. */
export function substitutes(p: Profile, exerciseId: string, excluir: string[] = []): Exercise[] {
  const e = EXERCISE_BY_ID[exerciseId];
  if (!e) return [];
  const { usable } = availableExercises(p);
  const set = new Set(usable.map((u) => u.id));
  const listed = [e.alternativaSencilla, ...e.alternativasMaterial].filter((id): id is string => !!id && set.has(id));
  const samePattern = usable.filter((u) => u.patron === e.patron && u.id !== e.id).map((u) => u.id);
  const ids = [...new Set([...listed, ...samePattern])].filter((id) => !excluir.includes(id));
  return ids.map((id) => EXERCISE_BY_ID[id]);
}

export function rirText(rir: number, unidad: Exercise['unidad'] = 'reps'): string {
  if (unidad === 'segundos') {
    return rir >= 3 ? 'Moderado: termina cuando aún podrías aguantar unos segundos más con buena postura (esfuerzo 7 de 10).'
      : 'Exigente: termina justo antes de perder la postura (esfuerzo 8 de 10).';
  }
  if (rir >= 4) return `Muy cómodo: al terminar podrías hacer unas ${rir} repeticiones más.`;
  if (rir === 3) return 'Moderado: al terminar podrías hacer unas 3 repeticiones más (esfuerzo 7 de 10).';
  if (rir === 2) return 'Exigente: al terminar podrías hacer unas 2 repeticiones más (esfuerzo 8 de 10).';
  if (rir === 1) return 'Muy exigente: te quedaría 1 repetición más (esfuerzo 9 de 10).';
  return 'Máximo esfuerzo con buena técnica.';
}

export function progressionCriterion(pr: Prescription, unidad: Exercise['unidad']): string {
  const u = unidad === 'segundos' ? 's' : 'reps';
  return `Progresa cuando completes las ${pr.series} series llegando a ${pr.repsMax} ${u} con técnica estable, dejando al menos ${pr.rir} en reserva y sin molestias. Mantén si estás dentro de ${pr.repsMin}–${pr.repsMax}. Reduce si no llegas a ${pr.repsMin} o aparecen molestias.`;
}
