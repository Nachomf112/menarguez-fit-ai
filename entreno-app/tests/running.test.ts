import { describe, expect, it } from 'vitest';
import { blankProfile } from '../src/data/demo';
import { generatePlan } from '../src/domain/planner';
import { parseTime, phaseOf, QUALITY, riegel, targetPace, weeklyBudget } from '../src/domain/running';
import { finishSession, startSession } from '../src/domain/session';
import type { Profile, RunningProfile } from '../src/domain/types';

const NOW = new Date('2026-11-06T10:00:00');
const runner = (c: Partial<RunningProfile>, o: Partial<Profile> = {}): Profile => ({
  ...blankProfile('r1', NOW), nombre: 'Corre', edad: 35, objetivo: 'carrera', experiencia: 'principiante',
  dias: 4, minutos: 60, material: ['corporal', 'mancuernas'],
  carrera: { distancia: '10k', experiencia: 'regular', minutosSemana: 150, ...c }, ...o,
});
const plan = (p: Profile) => { const r = generatePlan(p, NOW); if (!r.ok) throw new Error(r.motivo); return r.plan; };

describe('carrera', () => {
  it('10 km regular, 4 días: 3 de carrera + 1 de fuerza, con series y tirada larga no consecutivas', () => {
    const pl = plan(runner({}));
    const runs = pl.sesiones.filter((s) => s.tipo === 'carrera');
    const str = pl.sesiones.filter((s) => s.tipo === 'fuerza');
    expect(runs).toHaveLength(3);
    expect(str).toHaveLength(1);
    const series = runs.find((s) => s.carrera!.tipo === 'series')!;
    const tirada = runs.find((s) => s.carrera!.tipo === 'tirada')!;
    expect(series && tirada).toBeTruthy();
    expect(Math.abs(tirada.dia - series.dia)).toBeGreaterThan(1);
    expect(new Set(pl.sesiones.map((s) => s.dia)).size).toBe(pl.sesiones.length);
    pl.sesiones.forEach((s) => expect(s.minutosEstimados).toBeLessThanOrEqual(65));
  });
  it('quien empieza solo recibe correr-caminar', () => {
    const pl = plan(runner({ experiencia: 'empiezo', minutosSemana: 0, distancia: '5k' }));
    const runs = pl.sesiones.filter((s) => s.tipo === 'carrera');
    expect(runs.length).toBeGreaterThan(0);
    runs.forEach((s) => expect(s.carrera!.tipo).toBe('correr_caminar'));
  });
  it('distancias cortas usan series cortas y ritmo de carrera, sin tirada larga', () => {
    const pl = plan(runner({ distancia: '800', experiencia: 'ocasional', minutosSemana: 60 }, { dias: 5 }));
    const tipos = pl.sesiones.filter((s) => s.carrera).map((s) => s.carrera!.tipo);
    expect(tipos).toContain('series_cortas');
    expect(tipos).not.toContain('tirada');
  });
  it('la tirada crece de forma gradual según el volumen actual', () => {
    const poco = plan(runner({ distancia: '21k', minutosSemana: 45 }, { minutos: 120 }));
    const t = poco.sesiones.find((s) => s.carrera?.tipo === 'tirada')!;
    expect(t.carrera!.minutos).toBeLessThanOrEqual(45 * 0.45 + 10 + 1);
  });
  it('respeta los minutos disponibles y avisa', () => {
    const pl = plan(runner({ distancia: '21k', minutosSemana: 240 }, { minutos: 45 }));
    const t = pl.sesiones.find((s) => s.carrera?.tipo === 'tirada')!;
    expect(t.minutosEstimados).toBeLessThanOrEqual(45);
    expect(t.avisos.join(' ')).toMatch(/media maratón conviene un día con más tiempo/);
  });
  it('afinamiento reduce volumen cuando la prueba está cerca', () => {
    const lejos = plan(runner({}));
    const cerca = plan(runner({ fechaPrueba: '2026-11-17' }));
    const m = (pl: ReturnType<typeof plan>) => pl.sesiones.filter((s) => s.carrera).reduce((a, s) => a + s.carrera!.minutos, 0);
    expect(phaseOf('2026-11-17', NOW).fase).toBe('afinamiento');
    expect(m(cerca)).toBeLessThan(m(lejos));
  });
  it('ritmo estimado solo con marca y para 1500 m o más (Riegel)', () => {
    expect(Math.round(riegel(1500, 5, 10))).toBe(Math.round(1500 * Math.pow(2, 1.06)));
    expect(targetPace(runner({}))).toBeNull();
    const tp = targetPace(runner({ marca: { distanciaKm: 5, tiempoSeg: 25 * 60 } }))!;
    expect(tp.tiempo).toBeGreaterThan(50 * 60);
    expect(targetPace(runner({ distancia: '400', marca: { distanciaKm: 5, tiempoSeg: 1500 } }))).toBeNull();
    expect(parseTime('25:30')).toBe(1530);
    expect(parseTime('1:45:00')).toBe(6300);
    expect(parseTime('25:75')).toBeNull();
  });
  it('limitación de rodilla avisa en carrera; sin datos de carrera no planifica', () => {
    const pl = plan(runner({}, { limitaciones: ['rodilla'] }));
    expect(pl.sesiones.filter((s) => s.carrera).every((s) => s.avisos.some((a) => /rodilla, cadera o tobillo/.test(a)))).toBe(true);
    expect(generatePlan({ ...runner({}), carrera: undefined }, NOW).ok).toBe(false);
  });
  it('registro de carrera: completada, parcial o cancelada según minutos', () => {
    const ps = plan(runner({})).sesiones.find((s) => s.carrera?.tipo === 'rodaje')!;
    const a = startSession(ps, 'normal', {}, NOW);
    expect(finishSession(a, { aerobicoObjetivo: ps.carrera!.minutos }, NOW).estado).toBe('cancelada');
    a.carrera!.minutos = Math.round(ps.carrera!.minutos * 0.5);
    expect(finishSession(a, { aerobicoObjetivo: ps.carrera!.minutos }, NOW).estado).toBe('parcial');
    a.carrera!.minutos = ps.carrera!.minutos;
    if (a.ejercicios.length) {
      // Con fuerza de apoyo: correr sin hacer las series es parcial; con todo hecho, completada
      expect(finishSession(a, { aerobicoObjetivo: ps.carrera!.minutos }, NOW).estado).toBe('parcial');
      a.ejercicios.forEach((e) => e.sets.forEach((x) => { x.hecho = true; }));
    }
    const log = finishSession(a, { aerobicoObjetivo: ps.carrera!.minutos }, NOW);
    expect(log.estado).toBe('completada');
    expect(log.carrera?.tipo).toBe('rodaje');
  });
});

describe('reglas de carrera v0.5', () => {
  const dur = (pl: ReturnType<typeof plan>, tipo: string) => pl.sesiones.find((s) => s.carrera?.tipo === tipo)?.carrera!.minutos ?? 0;
  it('caso real: 3 días, 2 de carrera en fase de base → rodaje + tirada, sin series', () => {
    const pl = plan(runner({ distancia: '10k', experiencia: 'ocasional', minutosSemana: 60 }, { dias: 3 }));
    const tipos = pl.sesiones.filter((s) => s.carrera).map((s) => s.carrera!.tipo);
    expect(tipos.sort()).toEqual(['rodaje', 'tirada']);
  });
  it('fuerza repartida: no el día antes ni después de correr cuando hay hueco', () => {
    const pl = plan(runner({ distancia: '10k', experiencia: 'ocasional', minutosSemana: 60 }, { dias: 3 }));
    const runs = pl.sesiones.filter((s) => s.tipo === 'carrera').map((s) => s.dia);
    const fuerza = pl.sesiones.filter((s) => s.tipo === 'fuerza').map((s) => s.dia);
    expect(fuerza).toHaveLength(1);
    runs.forEach((r) => expect(Math.abs(r - fuerza[0])).toBeGreaterThan(1));
  });
  it('la tirada larga es siempre la sesión de carrera más larga', () => {
    for (const minutosSemana of [60, 90, 150, 240]) for (const dias of [3, 4, 5, 6]) for (const experiencia of ['ocasional', 'regular'] as const) {
      const pl = plan(runner({ distancia: '10k', experiencia, minutosSemana, fechaPrueba: '2027-01-10' }, { dias, minutos: 120 }));
      const t = dur(pl, 'tirada');
      pl.sesiones.filter((s) => s.carrera && s.carrera.tipo !== 'tirada').forEach((s) => expect(s.carrera!.minutos, `${minutosSemana}/${dias}/${experiencia}/${s.carrera!.tipo}`).toBeLessThan(t));
    }
  });
  it('sin base (menos de 60 min/semana) no hay series ni tempo', () => {
    const pl = plan(runner({ distancia: '10k', experiencia: 'ocasional', minutosSemana: 40, fechaPrueba: '2026-12-20' }, { dias: 5 }));
    const tipos = pl.sesiones.filter((s) => s.carrera).map((s) => s.carrera!.tipo);
    expect(tipos).not.toContain('series');
    expect(tipos).not.toContain('tempo');
  });
  it('con base y fase específica sí hay series', () => {
    const pl = plan(runner({ distancia: '10k', experiencia: 'regular', minutosSemana: 150, fechaPrueba: '2026-12-20' }, { dias: 4 }));
    expect(pl.sesiones.some((s) => s.carrera?.tipo === 'series')).toBe(true);
  });
});

describe('mejoras v0.3', () => {
  it('si sobra tiempo añade series a los principales sin pasar de 3 en principiantes', () => {
    const p: Profile = { ...blankProfile('x', NOW), nombre: 'A', edad: 45, objetivo: 'hipertrofia', experiencia: 'principiante', dias: 3, minutos: 45, material: ['corporal', 'mancuernas', 'banco'] };
    const pl = plan(p);
    const s = pl.sesiones[0];
    expect(s.ejercicios.some((e) => e.presc.series === 3)).toBe(true);
    pl.sesiones.forEach((x) => { expect(x.minutosEstimados).toBeLessThanOrEqual(45); x.ejercicios.forEach((e) => expect(e.presc.series).toBeLessThanOrEqual(3)); });
  });
});

describe('reglas de carrera v0.6 (límites compartidos con el validador del servidor)', () => {
  const runs = (p: Profile) => plan(p).sesiones.filter((s) => s.tipo === 'carrera');
  const volumen = (p: Profile) => runs(p).filter((s) => s.carrera!.tipo !== 'correr_caminar').reduce((t, s) => t + s.carrera!.minutos, 0);

  it('quien corre con 1 o 2 días a la semana recibe plan (antes daba error)', () => {
    for (const dias of [1, 2]) {
      const pl = plan(runner({}, { dias }));
      expect(pl.sesiones.length).toBe(dias);
      expect(pl.sesiones.every((s) => s.tipo === 'carrera')).toBe(true);
    }
  });
  it('el volumen semanal no supera +10 % o +15 min sobre lo que ya corres (mínimo 40)', () => {
    for (const minutosSemana of [0, 30, 60, 90, 150, 300]) for (const dias of [2, 3, 4, 5, 6]) for (const distancia of ['400', '1500', '5k', '10k', '21k'] as const) {
      expect(volumen(runner({ minutosSemana, distancia, experiencia: 'ocasional' }, { dias, minutos: 120 }))).toBeLessThanOrEqual(weeklyBudget(minutosSemana));
    }
    expect(weeklyBudget(0)).toBe(40);
    expect(weeklyBudget(150)).toBe(165);
  });
  it('vuelta a correr con 0 min/semana: pocas salidas, cortas y suaves', () => {
    const r = runs(runner({ minutosSemana: 0, experiencia: 'regular', distancia: '10k' }, { dias: 5 }));
    expect(r.length).toBeLessThanOrEqual(2);
    expect(r.every((s) => !QUALITY.includes(s.carrera!.tipo))).toBe(true);
  });
  it('distancias cortas sin base (< 60 min/semana): sin series ni cuestas', () => {
    const r = runs(runner({ distancia: '800', experiencia: 'ocasional', minutosSemana: 30 }, { dias: 6 }));
    expect(r.every((s) => !QUALITY.includes(s.carrera!.tipo))).toBe(true);
  });
  it('como máximo 2 sesiones de calidad por semana y la tirada es la más larga', () => {
    for (const distancia of ['400', '800', '5k', '10k', '21k'] as const) {
      const r = runs(runner({ distancia, minutosSemana: 300, fechaPrueba: '2026-12-10' }, { dias: 6, minutos: 120 }));
      expect(r.filter((s) => QUALITY.includes(s.carrera!.tipo)).length).toBeLessThanOrEqual(2);
      const t = r.find((s) => s.carrera!.tipo === 'tirada');
      if (t) r.forEach((s) => expect(s.carrera!.minutos).toBeLessThanOrEqual(t.carrera!.minutos));
    }
  });
});

describe('fuerza de apoyo para corredores', () => {
  const fuerza = (pl: ReturnType<typeof plan>) => pl.sesiones.filter((s) => s.tipo === 'fuerza').length + pl.sesiones.filter((s) => s.tipo === 'carrera' && s.ejercicios.length).length;
  it('con 2 días: bloque de fuerza tras el rodaje, nunca tras la tirada', () => {
    const pl = plan(runner({ distancia: '10k', experiencia: 'regular', minutosSemana: 0 }, { dias: 2, minutos: 45 }));
    const rodaje = pl.sesiones.find((s) => s.carrera?.tipo === 'rodaje')!;
    const tirada = pl.sesiones.find((s) => s.carrera?.tipo === 'tirada')!;
    expect(rodaje.ejercicios.length).toBeGreaterThanOrEqual(3);
    expect(rodaje.ejercicios.every((e) => e.presc.series <= 2)).toBe(true);
    expect(rodaje.titulo).toContain('fuerza de apoyo');
    expect(rodaje.minutosEstimados).toBeLessThanOrEqual(45 + 2);
    expect(tirada.ejercicios.length).toBe(0);
  });
  it('se buscan 2 estímulos de fuerza por semana cuando hay tiempo (con 2 días, 1: la tirada no lleva fuerza)', () => {
    for (const dias of [2, 3, 4, 5, 6]) {
      const pl = plan(runner({ distancia: '10k', experiencia: 'ocasional', minutosSemana: 90 }, { dias, minutos: 60 }));
      expect(fuerza(pl), `${dias} días`).toBeGreaterThanOrEqual(dias === 2 ? 1 : 2);
    }
  });
  it('nunca tras series, tempo o tirada; y no se añade si no cabe en el tiempo', () => {
    for (const dias of [2, 3, 4, 5, 6]) for (const minutosSemana of [0, 60, 150, 300]) {
      const pl = plan(runner({ distancia: '10k', experiencia: 'regular', minutosSemana, fechaPrueba: '2026-12-20' }, { dias, minutos: 60 }));
      pl.sesiones.filter((s) => s.carrera && !['rodaje', 'correr_caminar'].includes(s.carrera.tipo)).forEach((s) => expect(s.ejercicios.length).toBe(0));
    }
    const corto = plan(runner({ distancia: '10k', experiencia: 'regular', minutosSemana: 150 }, { dias: 2, minutos: 30 }));
    corto.sesiones.forEach((s) => expect(s.minutosEstimados).toBeLessThanOrEqual(32));
  });
});
