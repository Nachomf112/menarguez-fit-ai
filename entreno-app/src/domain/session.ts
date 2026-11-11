// Lógica pura de la sesión en curso: crear, registrar, sustituir, temporizador y cierre.

import type { ActiveSession, LoggedExercise, PlannedSession, Recovery, SessionLog, SessionStatus } from './types';

export const uid = (p = 'id') => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export function startSession(ps: PlannedSession, recuperacion: Recovery, ajustes: Record<string, { cargaObjetivo?: number }> = {}, now = new Date()): ActiveSession {
  const ejercicios: LoggedExercise[] = ps.ejercicios.map((pe) => {
    const presc = { ...pe.presc };
    if (recuperacion === 'mala') { presc.series = Math.max(1, presc.series - 1); presc.rir += 1; }
    const kg = ajustes[pe.exerciseId]?.cargaObjetivo;
    return {
      exerciseId: pe.exerciseId,
      originalId: pe.exerciseId,
      presc,
      sets: Array.from({ length: presc.series }, () => ({ hecho: false, kg })),
      molestia: 0,
      tecnicaEstable: true,
    };
  });
  return { id: uid('ses'), planSessionId: ps.id, titulo: ps.titulo, inicio: now.toISOString(), recuperacion, actual: 0, ejercicios,
    aerobicoMin: ps.tipo === 'aerobica' ? 0 : undefined,
    carrera: ps.tipo === 'carrera' && ps.carrera ? { tipo: ps.carrera.tipo, minutos: 0, molestia: 0 } : undefined, timer: null };
}

/** Sustituye el ejercicio `idx`. Si ya tiene series hechas, se conservan con el ejercicio original
 *  y las series pendientes pasan a la alternativa, que se inserta a continuación. */
export function substitute(a: ActiveSession, idx: number, newId: string): ActiveSession {
  const cur = a.ejercicios[idx];
  if (!cur) return a;
  const done = cur.sets.filter((x) => x.hecho);
  if (done.length === 0) {
    const ejercicios = a.ejercicios.map((e, i) => i !== idx ? e : {
      ...e, exerciseId: newId, sets: e.sets.map(() => ({ hecho: false })), rpe: undefined, molestia: 0 as const, tecnicaEstable: true,
    });
    return { ...a, ejercicios };
  }
  const pendientes = cur.sets.length - done.length;
  if (pendientes === 0) return a;
  const kept: LoggedExercise = { ...cur, sets: done };
  const nuevo: LoggedExercise = {
    exerciseId: newId, originalId: cur.originalId, presc: { ...cur.presc, series: pendientes },
    sets: Array.from({ length: pendientes }, () => ({ hecho: false })), molestia: 0, tecnicaEstable: true,
  };
  const ejercicios = [...a.ejercicios.slice(0, idx), kept, nuevo, ...a.ejercicios.slice(idx + 1)];
  return { ...a, ejercicios, actual: idx + 1, timer: null };
}

export function statusOf(a: ActiveSession): SessionStatus | 'vacia' {
  const total = a.ejercicios.reduce((s, e) => s + e.sets.length, 0);
  const hechas = a.ejercicios.reduce((s, e) => s + e.sets.filter((x) => x.hecho).length, 0);
  if (a.carrera && a.ejercicios.length === 0) return a.carrera.minutos > 0 ? 'completada' : 'vacia';
  // Carrera + fuerza de apoyo: completada solo si se corre y se hacen todas las series
  if (a.carrera) {
    const corrio = a.carrera.minutos > 0;
    if (!corrio && hechas === 0) return 'vacia';
    return corrio && hechas >= total ? 'completada' : 'parcial';
  }
  if (a.aerobicoMin != null && a.ejercicios.length === 0) return a.aerobicoMin > 0 ? 'completada' : 'vacia';
  if (hechas === 0) return 'vacia';
  return hechas >= total ? 'completada' : 'parcial';
}

export function finishSession(a: ActiveSession, opts: { cancelar?: boolean; rpeSesion?: number; nota?: string; aerobicoObjetivo?: number }, now = new Date()): SessionLog {
  let estado: SessionStatus;
  const st = statusOf(a);
  if (opts.cancelar || st === 'vacia') estado = 'cancelada';
  else if ((a.ejercicios.length === 0 || a.carrera) && opts.aerobicoObjetivo && ((a.carrera?.minutos ?? a.aerobicoMin ?? 0) < opts.aerobicoObjetivo * 0.8)) estado = 'parcial';
  else estado = st;
  return {
    id: a.id, planSessionId: a.planSessionId, titulo: a.titulo, fecha: a.inicio, inicio: a.inicio, fin: now.toISOString(),
    estado, recuperacion: a.recuperacion, ejercicios: a.ejercicios, aerobicoMin: a.aerobicoMin, carrera: a.carrera, rpeSesion: opts.rpeSesion, nota: opts.nota ?? '',
  };
}

// ── Temporizador de descanso basado en marcas de tiempo (sobrevive a recargas) ──
export function timerStart(seg: number, now = Date.now()): ActiveSession['timer'] {
  return { finEn: now + seg * 1000, total: seg };
}
export function timerRemaining(t: ActiveSession['timer'], now = Date.now()): number {
  if (!t) return 0;
  if (t.pausadoRestante != null) return t.pausadoRestante;
  return Math.max(0, Math.ceil(((t.finEn ?? now) - now) / 1000));
}
export function timerPause(t: ActiveSession['timer'], now = Date.now()): ActiveSession['timer'] {
  if (!t || t.pausadoRestante != null) return t;
  return { total: t.total, pausadoRestante: timerRemaining(t, now) };
}
export function timerResume(t: ActiveSession['timer'], now = Date.now()): ActiveSession['timer'] {
  if (!t || t.pausadoRestante == null) return t;
  return { total: t.total, finEn: now + t.pausadoRestante * 1000 };
}
export function timerReset(t: ActiveSession['timer'], now = Date.now()): ActiveSession['timer'] {
  if (!t) return t;
  return { total: t.total, finEn: now + t.total * 1000 };
}
