import { describe, expect, it } from 'vitest';
import { blankProfile } from '../src/data/demo';
import { generatePlan } from '../src/domain/planner';
import { parseTime, phaseOf, riegel, targetPace } from '../src/domain/running';
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
    const log = finishSession(a, { aerobicoObjetivo: ps.carrera!.minutos }, NOW);
    expect(log.estado).toBe('completada');
    expect(log.carrera?.tipo).toBe('rodaje');
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
