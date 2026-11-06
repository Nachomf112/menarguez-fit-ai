// Sugerencias de progresión basadas en registros equivalentes del mismo ejercicio.
// Nunca impone aumentos: cada sugerencia explica los datos que la justifican.

import { EXERCISE_BY_ID } from '../data/exercises';
import type { LoggedExercise, Prescription, ProfileData, SessionLog } from './types';

export type SuggestionKind = 'sin_datos' | 'progresar' | 'mantener' | 'reducir';

export interface Suggestion {
  exerciseId: string;
  tipo: SuggestionKind;
  titulo: string;
  motivo: string;
  cargaSugerida?: number;
  avisoProfesional?: boolean;
}

export interface ExerciseRecord {
  fecha: string;
  sessionId: string;
  log: LoggedExercise;
}

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });

/** Registros válidos (sesiones completadas o parciales con al menos una serie hecha), del más antiguo al más reciente. */
export function exerciseHistory(sesiones: SessionLog[], exerciseId: string): ExerciseRecord[] {
  return sesiones
    .filter((s) => s.estado !== 'cancelada')
    .flatMap((s) => s.ejercicios
      .filter((e) => e.exerciseId === exerciseId && e.sets.some((x) => x.hecho))
      .map((log) => ({ fecha: s.fecha, sessionId: s.id, log })))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}

export function describeSets(log: LoggedExercise, unidad: string): string {
  const done = log.sets.filter((s) => s.hecho);
  return done.map((s) => {
    const v = unidad === 'segundos' ? `${s.segundos ?? '?'} s` : `${s.reps ?? '?'}`;
    return s.kg != null && s.kg > 0 ? `${v}×${s.kg} kg` : v;
  }).join(', ');
}

function nextLoad(kg: number, carga: string): number {
  if (carga === 'maquina') return kg + (kg < 50 ? 2.5 : 5);
  return kg + (kg < 10 ? 1 : 2);
}

export function suggestFor(exerciseId: string, presc: Prescription, sesiones: SessionLog[]): Suggestion {
  const e = EXERCISE_BY_ID[exerciseId];
  const hist = exerciseHistory(sesiones, exerciseId);
  const unidad = e?.unidad ?? 'reps';
  if (!e || hist.length === 0) {
    return { exerciseId, tipo: 'sin_datos', titulo: 'Sin registros todavía',
      motivo: 'Aún no hay series registradas de este ejercicio. Elige la carga según técnica y esfuerzo.' };
  }
  const last = hist[hist.length - 1];
  const prev = hist.length > 1 ? hist[hist.length - 2] : undefined;
  const log = last.log;
  const done = log.sets.filter((s) => s.hecho);
  const values = done.map((s) => (unidad === 'segundos' ? s.segundos ?? 0 : s.reps ?? 0));
  const kgs = done.map((s) => s.kg).filter((k): k is number => typeof k === 'number' && k > 0);
  const topKg = kgs.length ? Math.max(...kgs) : undefined;
  const lp = log.presc;
  const dataText = `Último registro (${fmtDate(last.fecha)}): ${describeSets(log, unidad)}` +
    `${log.rpe != null ? `, esfuerzo ${log.rpe}/10` : ', esfuerzo sin registrar'}` +
    `, ${['sin molestias', 'molestia leve', 'molestia moderada', 'molestia fuerte'][log.molestia]}` +
    `, técnica ${log.tecnicaEstable ? 'estable' : 'irregular'}. Objetivo: ${lp.series}×${lp.repsMin}–${lp.repsMax}` +
    ` dejando ${lp.rir} en reserva.`;

  if (log.molestia >= 2 || (log.molestia >= 1 && prev && prev.log.molestia >= 1)) {
    return { exerciseId, tipo: 'reducir', titulo: 'No progresar: molestias',
      motivo: `${dataText} ${log.molestia >= 2 ? 'Registraste molestia moderada o fuerte.' : 'La molestia se repite en dos sesiones.'} Reduce carga o recorrido, prueba una alternativa y, si persiste o aumenta, consulta a un profesional sanitario.`,
      avisoProfesional: true };
  }
  if (log.molestia === 1) {
    return { exerciseId, tipo: 'mantener', titulo: 'Mantener: molestia leve', motivo: `${dataText} Con molestias no se recomienda subir la carga.` };
  }
  if (!log.tecnicaEstable) {
    return { exerciseId, tipo: 'mantener', titulo: 'Mantener: consolidar técnica', motivo: `${dataText} Mantén la carga hasta que la técnica sea estable.` };
  }
  if (done.length < lp.series) {
    return { exerciseId, tipo: 'mantener', titulo: 'Mantener: sesión incompleta', motivo: `${dataText} Completaste ${done.length} de ${lp.series} series; faltan datos para valorar una progresión.` };
  }
  const allTop = values.every((v) => v >= lp.repsMax);
  const belowMin = values.filter((v) => v < lp.repsMin).length;
  const rpeLimit = 10 - lp.rir;
  if (belowMin >= Math.ceil(values.length / 2) || (log.rpe != null && log.rpe > rpeLimit + 1)) {
    return { exerciseId, tipo: 'reducir', titulo: 'Reducir un poco',
      motivo: `${dataText} ${belowMin ? 'No llegaste al mínimo del rango en la mayoría de series.' : 'El esfuerzo fue mayor que el previsto.'} Baja un 5–10 % la carga o la dificultad.`,
      cargaSugerida: topKg ? Math.round(topKg * 0.9 * 2) / 2 : undefined };
  }
  if (allTop && log.rpe != null && log.rpe <= rpeLimit) {
    if (unidad === 'segundos') {
      return { exerciseId, tipo: 'progresar', titulo: 'Progresar: +5–10 s', motivo: `${dataText} Alcanzaste el tope de tiempo con margen.` };
    }
    if (topKg && (e.carga === 'mancuernas' || e.carga === 'maquina')) {
      const nk = nextLoad(topKg, e.carga);
      return { exerciseId, tipo: 'progresar', titulo: `Progresar a ≈${nk} kg`,
        motivo: `${dataText} Completaste todas las series en el tope del rango con el esfuerzo previsto. Sube al siguiente peso disponible y vuelve al mínimo del rango.`,
        cargaSugerida: nk };
    }
    return { exerciseId, tipo: 'progresar', titulo: 'Progresar: más resistencia o repeticiones',
      motivo: `${dataText} Completaste el rango con margen. ${e.carga === 'banda' ? 'Usa una banda algo más resistente.' : 'Añade 1–2 repeticiones por serie o una variante algo más exigente.'}` };
  }
  if (allTop && log.rpe == null) {
    return { exerciseId, tipo: 'mantener', titulo: 'Mantener: falta el esfuerzo', motivo: `${dataText} Llegaste al tope, pero sin registrar el esfuerzo no se puede confirmar que haya margen.` };
  }
  return { exerciseId, tipo: 'mantener', titulo: 'Mantener y sumar repeticiones',
    motivo: `${dataText} Sigue con la misma carga e intenta añadir repeticiones dentro del rango.` };
}

/** Lunes 00:00 local de la semana de `d`. */
export function weekStart(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const wd = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - wd);
  return x;
}

export interface WeekReview {
  inicio: Date;
  previstas: number;
  completadas: number;
  parciales: number;
  canceladas: number;
  rpeMedio?: number;
  molestias: number;
  recuperacionMala: number;
  suficientes: boolean;
  mensaje: string;
  sugerencias: Suggestion[];
}

export function weeklyReview(data: ProfileData, ref = new Date()): WeekReview {
  const inicio = weekStart(ref);
  const fin = new Date(inicio); fin.setDate(fin.getDate() + 7);
  const semana = data.sesiones.filter((s) => { const f = new Date(s.fecha); return f >= inicio && f < fin; });
  const previstas = data.plan?.sesiones.length ?? 0;
  const completadas = semana.filter((s) => s.estado === 'completada').length;
  const parciales = semana.filter((s) => s.estado === 'parcial').length;
  const canceladas = semana.filter((s) => s.estado === 'cancelada').length;
  const rpes = semana.filter((s) => s.estado !== 'cancelada' && s.rpeSesion != null).map((s) => s.rpeSesion as number);
  const molestias = semana.flatMap((s) => s.ejercicios).filter((e) => e.molestia >= 1).length;
  const recuperacionMala = semana.filter((s) => s.recuperacion === 'mala').length;
  const realizadas = completadas + parciales;
  const suficientes = realizadas >= 1;
  const rpeMedio = rpes.length ? Math.round((rpes.reduce((a, b) => a + b, 0) / rpes.length) * 10) / 10 : undefined;

  let mensaje: string;
  if (!suficientes) mensaje = 'Datos insuficientes: no hay sesiones realizadas esta semana. No se proponen cambios.';
  else if ((rpeMedio != null && rpeMedio >= 9) || recuperacionMala >= 2) mensaje = 'Fatiga elevada esta semana: mantén las cargas y prioriza el descanso antes de progresar.';
  else if (previstas && realizadas < previstas / 2) mensaje = 'Has realizado menos de la mitad de lo previsto. Si te falta tiempo, valora reducir días antes que acumular sesiones.';
  else mensaje = 'Semana registrada. Revisa las sugerencias por ejercicio y acepta solo las que encajen contigo.';

  const fatiga = (rpeMedio != null && rpeMedio >= 9) || recuperacionMala >= 2;
  const ids = [...new Set(semana.filter((s) => s.estado !== 'cancelada').flatMap((s) => s.ejercicios.map((e) => e.exerciseId)))];
  const sugerencias = suficientes ? ids.map((id) => {
    const presc = data.plan?.sesiones.flatMap((s) => s.ejercicios).find((x) => x.exerciseId === id)?.presc
      ?? semana.flatMap((s) => s.ejercicios).find((e) => e.exerciseId === id)!.presc;
    const s = suggestFor(id, presc, data.sesiones);
    if (fatiga && s.tipo === 'progresar') {
      return { ...s, tipo: 'mantener' as const, titulo: 'Mantener: fatiga de la semana', cargaSugerida: undefined,
        motivo: `${s.motivo} Sin embargo, la fatiga de la semana aconseja esperar.` };
    }
    return s;
  }) : [];
  return { inicio, previstas, completadas, parciales, canceladas, rpeMedio, molestias, recuperacionMala, suficientes, mensaje, sugerencias };
}
