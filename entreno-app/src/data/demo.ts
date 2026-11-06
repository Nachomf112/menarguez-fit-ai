// Perfil de demostración: datos inventados y marcados como tales (profile.demo = true).

import { generatePlan } from '../domain/planner';
import type { Profile, ProfileData, SessionLog } from '../domain/types';

export const DEMO_ID = 'demo-laura';

export function blankProfile(id: string, now = new Date()): Profile {
  return {
    id, demo: false, nombre: '', edad: NaN, objetivo: 'salud', experiencia: 'principiante', actividad: 'ligera',
    dias: 3, minutos: 45, limitaciones: [], limitacionesTexto: '', dolorQueAumenta: false,
    screening: { sintomasEsfuerzo: false, restriccionProfesional: false, embarazoPosparto: false, valoradoPorProfesional: false },
    lugar: 'casa', material: ['corporal'], aerobicoPreferido: [], evitarEjercicios: [], sueno: '7a9', recuperacion: 'normal',
    indicacionesProfesionales: '', creado: now.toISOString(), actualizado: now.toISOString(),
  };
}

export function emptyProfileData(profile: Profile): ProfileData {
  return { profile, plan: null, sesiones: [], activa: null, favoritos: [], medidas: [], decisiones: [], ajustes: {},
    nutricion: { activa: false, perfil: null, menu: null } };
}

export function makeDemo(now = new Date()): ProfileData {
  const profile: Profile = {
    ...blankProfile(DEMO_ID, now), demo: true, nombre: 'Laura (demostración)', edad: 34, objetivo: 'hipertrofia',
    experiencia: 'principiante', actividad: 'ligera', dias: 3, minutos: 45, lugar: 'casa',
    material: ['corporal', 'mancuernas', 'bandas', 'banco'], aerobicoPreferido: ['caminar'], pesoKg: 62, alturaCm: 166,
  };
  const res = generatePlan(profile, now);
  const pd = emptyProfileData(profile);
  if (!res.ok) return pd;
  pd.plan = res.plan;
  const sesiones: SessionLog[] = [];
  const fuerza = res.plan.sesiones.filter((s) => s.tipo === 'fuerza');
  // Dos semanas de ejemplo: la carga del primer ejercicio sube cuando se completa el rango.
  const daysAgo = [13, 11, 9, 6, 4, 2];
  daysAgo.forEach((ago, i) => {
    const ps = fuerza[i % fuerza.length];
    const d = new Date(now); d.setDate(d.getDate() - ago); d.setHours(18, 30, 0, 0);
    const semana2 = i >= 3;
    sesiones.push({
      id: `demo-s${i}`, planSessionId: ps.id, titulo: ps.titulo, fecha: d.toISOString(), inicio: d.toISOString(),
      fin: new Date(d.getTime() + 44 * 60000).toISOString(), estado: i === 4 ? 'parcial' : 'completada',
      recuperacion: i === 4 ? 'mala' : 'normal', rpeSesion: i === 4 ? 8 : 7, nota: '',
      ejercicios: ps.ejercicios.map((pe, j) => {
        const loaded = j < 3;
        const kg = loaded ? (semana2 ? 10 : 8) + j * 2 : undefined;
        const reps = pe.presc.repsMin + (semana2 ? 2 : 1);
        return {
          exerciseId: pe.exerciseId, originalId: pe.exerciseId, presc: pe.presc,
          sets: Array.from({ length: pe.presc.series }, (_, k) => ({
            hecho: !(i === 4 && j >= 3), kg: kg, reps: Math.min(pe.presc.repsMax, reps + (k === 0 ? 1 : 0)), segundos: undefined,
          })),
          rpe: 7, molestia: 0, tecnicaEstable: true,
        };
      }),
    });
  });
  pd.sesiones = sesiones;
  pd.medidas = [
    { fecha: new Date(now.getTime() - 14 * 864e5).toISOString(), pesoKg: 62.4, cinturaCm: 72 },
    { fecha: new Date(now.getTime() - 7 * 864e5).toISOString(), pesoKg: 62.1, cinturaCm: 71.5 },
    { fecha: new Date(now.getTime() - 1 * 864e5).toISOString(), pesoKg: 62.2, cinturaCm: 71.5 },
  ];
  pd.favoritos = ['sentadilla_goblet', 'remo_mancuerna_apoyado'];
  return pd;
}
