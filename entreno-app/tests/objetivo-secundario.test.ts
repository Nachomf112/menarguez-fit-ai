// Objetivo principal + segundo objetivo opcional. Perfiles FICTICIOS.
import { describe, expect, it } from 'vitest';
import { blankProfile } from '../src/data/demo';
import { generatePlan, secondaryGoal, wantsRace } from '../src/domain/planner';
import { QUALITY, weeklyBudget } from '../src/domain/running';
import type { Goal, Profile, RaceDistance, RunningProfile } from '../src/domain/types';

const NOW = new Date('2026-11-12T10:00:00');
const GOALS: Goal[] = ['hipertrofia', 'fuerza', 'salud', 'composicion', 'resistencia', 'carrera'];
const base = (o: Partial<Profile> = {}): Profile => ({
  ...blankProfile('ficticio', NOW), nombre: 'Ficticia', edad: 38, experiencia: 'principiante',
  dias: 4, minutos: 60, material: ['corporal', 'mancuernas', 'bandas'], ...o,
});
const carrera: RunningProfile = { distancia: '10k', experiencia: 'ocasional', minutosSemana: 60 };
const plan = (p: Profile) => { const r = generatePlan(p, NOW); if (!r.ok) throw new Error(r.motivo); return r.plan; };

describe('objetivo secundario', () => {
  it('sin segundo objetivo, el plan es idéntico al de antes', () => {
    for (const objetivo of GOALS) {
      const p = base({ objetivo, carrera: objetivo === 'carrera' ? carrera : undefined });
      const a = plan(p); const b = plan({ ...p, objetivoSecundario: null });
      expect(JSON.stringify(b.sesiones)).toBe(JSON.stringify(a.sesiones));
    }
  });

  it('un segundo objetivo igual al principal se ignora', () => {
    expect(secondaryGoal({ objetivo: 'salud', objetivoSecundario: 'salud' })).toBeNull();
    expect(secondaryGoal({ objetivo: 'salud', objetivoSecundario: 'carrera' })).toBe('carrera');
  });

  it('carrera como segundo objetivo exige los datos de la carrera', () => {
    const r = generatePlan(base({ objetivo: 'salud', objetivoSecundario: 'carrera' }), NOW);
    expect(r.ok).toBe(false);
    expect(wantsRace(base({ objetivo: 'salud', objetivoSecundario: 'carrera' }))).toBe(true);
  });

  it('salud + carrera (caso real): fuerza, rodajes suaves sin series y nota explicativa', () => {
    const pl = plan(base({ objetivo: 'salud', objetivoSecundario: 'carrera', carrera, dias: 4 }));
    const runs = pl.sesiones.filter((s) => s.tipo === 'carrera');
    expect(runs.length).toBeGreaterThanOrEqual(1);
    expect(runs.every((s) => s.carrera!.tipo === 'rodaje')).toBe(true);
    expect(pl.sesiones.filter((s) => s.tipo === 'fuerza').length).toBeGreaterThanOrEqual(2);
    expect(pl.notas[0]).toContain('segundo objetivo');
  });

  it('carrera + salud: se mantiene el plan de carrera y el descanso sugiere paseo', () => {
    const solo = plan(base({ objetivo: 'carrera', carrera, dias: 4 }));
    const doble = plan(base({ objetivo: 'carrera', objetivoSecundario: 'salud', carrera, dias: 4 }));
    expect(doble.sesiones.map((s) => s.carrera?.tipo ?? s.tipo)).toEqual(solo.sesiones.map((s) => s.carrera?.tipo ?? s.tipo));
    expect(doble.sugerenciaDescanso).toContain('paseo');
    expect(doble.notas[0]).toContain('salud y forma general');
  });

  it('fuerza + carrera con 3 días: 2 de fuerza y 1 rodaje (antes, 3 de fuerza y nada de correr)', () => {
    const pl = plan(base({ objetivo: 'fuerza', objetivoSecundario: 'carrera', carrera, dias: 3 }));
    expect(pl.sesiones.filter((s) => s.tipo === 'fuerza').length).toBe(2);
    expect(pl.sesiones.filter((s) => s.tipo === 'carrera').length).toBe(1);
  });

  it('con 1 día y carrera secundaria: solo fuerza y aviso de que no cabe correr', () => {
    const pl = plan(base({ objetivo: 'salud', objetivoSecundario: 'carrera', carrera, dias: 1 }));
    expect(pl.sesiones.every((s) => s.tipo === 'fuerza')).toBe(true);
    expect(pl.notas[0]).toContain('no cabe');
  });

  it('rejilla: todas las combinaciones generan planes válidos y sin pasarse del volumen de carrera', () => {
    let n = 0;
    const dists: RaceDistance[] = ['400', '1500', '5k', '21k'];
    for (const objetivo of GOALS) for (const sec of GOALS) for (const dias of [1, 2, 3, 4, 5, 6]) for (const minutos of [30, 60, 90])
      for (const exp of ['ninguna', 'intermedio'] as const) for (const distancia of dists)
        for (const cexp of ['empiezo', 'ocasional', 'regular'] as const) for (const minutosSemana of [0, 45, 150]) {
          if (sec === objetivo) continue;
          const usaCarrera = objetivo === 'carrera' || sec === 'carrera';
          if (!usaCarrera && (distancia !== '5k' || cexp !== 'ocasional' || minutosSemana !== 0)) continue;
          const p = base({ objetivo, objetivoSecundario: sec, dias, minutos, experiencia: exp, limitaciones: dias === 3 ? ['rodilla'] : [],
            carrera: usaCarrera ? { distancia, experiencia: cexp, minutosSemana } : undefined });
          const r = generatePlan(p, NOW);
          expect(r.ok, `${objetivo}+${sec} ${dias}d ${minutos}min: ${!r.ok && r.motivo}`).toBe(true);
          if (!r.ok) continue;
          n++;
          const ses = r.plan.sesiones;
          expect(ses.length).toBeLessThanOrEqual(dias);
          expect(r.plan.diasDescanso.length).toBeGreaterThanOrEqual(1);
          const vol = ses.filter((s) => s.carrera && s.carrera.tipo !== 'correr_caminar').reduce((t, s) => t + s.carrera!.minutos, 0);
          if (usaCarrera && cexp !== 'empiezo') expect(vol).toBeLessThanOrEqual(weeklyBudget(minutosSemana) + 1);
          if (objetivo !== 'carrera') expect(ses.some((s) => s.carrera && QUALITY.includes(s.carrera.tipo))).toBe(false);
        }
    expect(n).toBeGreaterThan(5000);
  });
});
