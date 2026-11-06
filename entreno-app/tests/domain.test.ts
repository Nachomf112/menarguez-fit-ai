import { describe, expect, it } from 'vitest';
import { EXERCISES, EXERCISE_BY_ID } from '../src/data/exercises';
import { blankProfile, emptyProfileData, makeDemo } from '../src/data/demo';
import { canPlan, generatePlan, substitutes, validatePlan } from '../src/domain/planner';
import { suggestFor, weeklyReview } from '../src/domain/progression';
import { finishSession, startSession, timerPause, timerRemaining, timerResume, timerStart } from '../src/domain/session';
import { generateMenu } from '../src/domain/nutrition';
import type { NutritionProfile, Profile, SessionLog } from '../src/domain/types';
import { LocalRepository, emptyState, exportBackup, exportCsv, parseBackup } from '../src/storage/store';

const NOW = new Date('2026-11-04T10:00:00');
const base = (o: Partial<Profile>): Profile => ({ ...blankProfile('p1', NOW), nombre: 'Ana', edad: 40, ...o });

describe('catálogo', () => {
  it('tiene al menos 40 ejercicios completos y referencias válidas', () => {
    expect(EXERCISES.length).toBeGreaterThanOrEqual(40);
    const groups = new Set(EXERCISES.map((e) => e.grupo));
    expect([...groups].sort()).toEqual(['brazos', 'espalda', 'hombros', 'pecho', 'piernas', 'tronco']);
    for (const m of ['corporal', 'mancuernas', 'bandas', 'maquinas']) expect(EXERCISES.some((e) => e.material.includes(m as never))).toBe(true);
    for (const e of EXERCISES) {
      expect(e.preparacion.length + e.ejecucion.length).toBeGreaterThanOrEqual(2);
      expect(e.errores.length).toBeGreaterThan(0);
      expect(e.respiracion && e.precauciones).toBeTruthy();
      if (e.alternativaSencilla) expect(EXERCISE_BY_ID[e.alternativaSencilla]).toBeDefined();
      e.alternativasMaterial.forEach((a) => expect(EXERCISE_BY_ID[a], `${e.id} → ${a}`).toBeDefined());
    }
    expect(new Set(EXERCISES.map((e) => e.id)).size).toBe(EXERCISES.length);
  });
});

describe('planificador', () => {
  it('principiante, 2 días y mancuernas: sesiones compatibles y no consecutivas', () => {
    const p = base({ experiencia: 'principiante', dias: 2, minutos: 45, material: ['corporal', 'mancuernas'] });
    const r = generatePlan(p, NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.sesiones).toHaveLength(2);
    expect(Math.abs(r.plan.sesiones[0].dia - r.plan.sesiones[1].dia)).toBeGreaterThan(1);
    for (const s of r.plan.sesiones) {
      expect(s.ejercicios.length).toBeGreaterThanOrEqual(3);
      for (const it of s.ejercicios) {
        expect(EXERCISE_BY_ID[it.exerciseId].material.every((m) => m === 'corporal' || m === 'mancuernas')).toBe(true);
        expect(it.presc.rir).toBeGreaterThanOrEqual(3);
        expect(it.presc.series).toBeLessThanOrEqual(3);
      }
    }
    expect(validatePlan(r.plan, p)).toEqual([]);
  });

  it('gimnasio y 4 días (intermedio): distribución torso/pierna distinta', () => {
    const p = base({ experiencia: 'intermedio', dias: 4, minutos: 60, objetivo: 'hipertrofia', lugar: 'gimnasio',
      material: ['corporal', 'mancuernas', 'bandas', 'maquinas', 'banco', 'barra_dominadas'] });
    const r = generatePlan(p, NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.sesiones.map((s) => s.titulo)).toEqual(['Torso A', 'Pierna A', 'Torso B', 'Pierna B']);
    expect(r.plan.diasDescanso.length).toBe(3);
  });

  it('respeta aproximadamente el tiempo disponible', () => {
    for (const minutos of [25, 30, 45, 60, 90]) for (const experiencia of ['ninguna', 'intermedio', 'avanzado'] as const) {
      const p = base({ minutos, experiencia, dias: 3, objetivo: 'fuerza', material: ['corporal', 'mancuernas', 'banco', 'bandas'] });
      const r = generatePlan(p, NOW);
      expect(r.ok, `${minutos} ${experiencia}`).toBe(true);
      if (r.ok) r.plan.sesiones.forEach((s) => expect(s.minutosEstimados, `${minutos}/${experiencia}`).toBeLessThanOrEqual(minutos + 5));
    }
  });

  it('las limitaciones y los ejercicios a evitar afectan a la selección', () => {
    const material: Profile['material'] = ['corporal', 'mancuernas', 'bandas', 'maquinas', 'banco', 'barra_dominadas'];
    const p = base({ experiencia: 'avanzado', dias: 4, minutos: 75, material, limitaciones: ['rodilla', 'hombro'], evitarEjercicios: ['prensa_piernas'] });
    const r = generatePlan(p, NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const ids = r.plan.sesiones.flatMap((s) => s.ejercicios.map((e) => e.exerciseId));
    expect(ids).not.toContain('prensa_piernas');
    for (const id of ids) expect(EXERCISE_BY_ID[id].evitarSi.some((l) => l === 'rodilla' || l === 'hombro'), id).toBe(false);
    expect(r.plan.excluidos.some((x) => x.id === 'sentadilla_bulgara')).toBe(true);
    const sinLim = generatePlan(base({ experiencia: 'avanzado', dias: 4, minutos: 75, material }), NOW);
    expect(sinLim.ok && sinLim.plan.sesiones.flatMap((s) => s.ejercicios.map((e) => e.exerciseId))).not.toEqual(ids);
  });

  it('es reproducible', () => {
    const p = base({ dias: 3, material: ['corporal', 'bandas'] });
    const a = generatePlan(p, NOW), b = generatePlan(p, NOW);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('pide datos o valoración cuando faltan o hay señales de alarma', () => {
    expect(canPlan({ ...base({}), nombre: '' }).ok).toBe(false);
    expect(canPlan(base({ edad: 16 })).ok).toBe(false);
    const sint = base({ screening: { sintomasEsfuerzo: true, restriccionProfesional: false, embarazoPosparto: false, valoradoPorProfesional: false } });
    expect(generatePlan(sint, NOW).ok).toBe(false);
    expect(generatePlan({ ...sint, screening: { ...sint.screening, valoradoPorProfesional: true } }, NOW).ok).toBe(true);
  });

  it('las sustituciones son compatibles con material y limitaciones', () => {
    const p = base({ material: ['corporal', 'bandas'], limitaciones: ['codo_muneca'] });
    const subs = substitutes(p, 'flexiones_inclinadas');
    expect(subs.length).toBeGreaterThan(0);
    for (const s of subs) {
      expect(s.patron).toBe('empuje_h');
      expect(s.material.every((m) => m === 'corporal' || m === 'bandas')).toBe(true);
      expect(s.evitarSi).not.toContain('codo_muneca');
    }
  });
});

describe('progresión', () => {
  const presc = { series: 2, repsMin: 8, repsMax: 12, rir: 3, descansoSeg: 90 };
  const log = (o: Partial<SessionLog['ejercicios'][0]>, fecha = '2026-11-02T18:00:00Z', estado: SessionLog['estado'] = 'completada'): SessionLog => ({
    id: fecha, planSessionId: 's1', titulo: 'A', fecha, inicio: fecha, fin: fecha, estado, recuperacion: 'normal', nota: '',
    ejercicios: [{ exerciseId: 'sentadilla_goblet', originalId: 'sentadilla_goblet', presc, molestia: 0, tecnicaEstable: true,
      sets: [{ hecho: true, kg: 12, reps: 12 }, { hecho: true, kg: 12, reps: 12 }], rpe: 7, ...o }],
  });
  it('sin registros no inventa conclusiones', () => {
    expect(suggestFor('sentadilla_goblet', presc, []).tipo).toBe('sin_datos');
    expect(suggestFor('sentadilla_goblet', presc, [log({}, undefined, 'cancelada')]).tipo).toBe('sin_datos');
  });
  it('progresa solo con rango completo, esfuerzo adecuado y sin molestias', () => {
    const s = suggestFor('sentadilla_goblet', presc, [log({})]);
    expect(s.tipo).toBe('progresar');
    expect(s.cargaSugerida).toBe(14);
    expect(s.motivo).toContain('12×12 kg');
    expect(suggestFor('sentadilla_goblet', presc, [log({ rpe: undefined })]).tipo).toBe('mantener');
    expect(suggestFor('sentadilla_goblet', presc, [log({ tecnicaEstable: false })]).tipo).toBe('mantener');
  });
  it('con molestias no progresa y recomienda valoración', () => {
    const s = suggestFor('sentadilla_goblet', presc, [log({ molestia: 2 })]);
    expect(s.tipo).toBe('reducir');
    expect(s.avisoProfesional).toBe(true);
  });
  it('revisión semanal sin sesiones no propone cambios', () => {
    const pd = emptyProfileData(base({}));
    const r = weeklyReview(pd, NOW);
    expect(r.suficientes).toBe(false);
    expect(r.sugerencias).toEqual([]);
  });
});

describe('sesión en curso', () => {
  const p = base({ dias: 2, material: ['corporal', 'mancuernas'] });
  const plan = (generatePlan(p, NOW) as { ok: true; plan: import('../src/domain/types').WeekPlan }).plan;
  it('abrir y cerrar sin series cuenta como cancelada, no como realizada', () => {
    const a = startSession(plan.sesiones[0], 'normal', {}, NOW);
    expect(finishSession(a, {}, NOW).estado).toBe('cancelada');
  });
  it('distingue completada y parcial', () => {
    const a = startSession(plan.sesiones[0], 'normal', {}, NOW);
    a.ejercicios[0].sets[0].hecho = true;
    expect(finishSession(a, {}, NOW).estado).toBe('parcial');
    a.ejercicios.forEach((e) => e.sets.forEach((s) => { s.hecho = true; }));
    expect(finishSession(a, {}, NOW).estado).toBe('completada');
    expect(finishSession(a, { cancelar: true }, NOW).estado).toBe('cancelada');
  });
  it('con mala recuperación reduce una serie y sube la reserva', () => {
    const a = startSession(plan.sesiones[0], 'mala', {}, NOW);
    const pe = plan.sesiones[0].ejercicios[0];
    expect(a.ejercicios[0].presc.series).toBe(Math.max(1, pe.presc.series - 1));
    expect(a.ejercicios[0].presc.rir).toBe(pe.presc.rir + 1);
  });
  it('temporizador: pausa y reanuda', () => {
    const t0 = 1_000_000;
    let t = timerStart(90, t0);
    expect(timerRemaining(t, t0 + 30_000)).toBe(60);
    t = timerPause(t, t0 + 30_000);
    expect(timerRemaining(t, t0 + 100_000)).toBe(60);
    t = timerResume(t, t0 + 100_000);
    expect(timerRemaining(t, t0 + 110_000)).toBe(50);
  });
});

describe('persistencia', () => {
  class MemStorage { m = new Map<string, string>(); getItem(k: string) { return this.m.get(k) ?? null; } setItem(k: string, v: string) { this.m.set(k, v); } removeItem(k: string) { this.m.delete(k); } }
  it('guarda y recupera; exporta e importa con validación', () => {
    const st = emptyState();
    const demo = makeDemo(NOW);
    const otro = emptyProfileData(base({ id: 'p2' } as Partial<Profile>));
    otro.profile.id = 'p2';
    st.perfiles = { [demo.profile.id]: demo, p2: otro };
    st.activeProfileId = 'p2';
    const repo = new LocalRepository(new MemStorage() as unknown as Storage);
    expect(repo.save(st)).toBe(true);
    expect(repo.load()).toEqual(st);
    const back = parseBackup(exportBackup(st, NOW));
    expect(back.ok).toBe(true);
    if (back.ok) expect(back.estado.perfiles).toEqual(st.perfiles);
    expect(parseBackup('{no json').ok).toBe(false);
    expect(parseBackup(JSON.stringify({ app: 'otra' })).ok).toBe(false);
    const broken = JSON.parse(exportBackup(st, NOW));
    broken.estado.perfiles.p2.sesiones = [{ id: 'x' }];
    expect(parseBackup(JSON.stringify(broken)).ok).toBe(false);
  });
  it('los perfiles no mezclan registros', () => {
    const demo = makeDemo(NOW);
    const otro = emptyProfileData(base({}));
    expect(demo.sesiones.length).toBeGreaterThan(0);
    const csvOtro = exportCsv(otro);
    expect(csvOtro.split('\n')).toHaveLength(1);
    expect(exportCsv(demo)).toContain('Laura (demostración)');
    expect(exportCsv(demo)).not.toContain('Ana');
  });
  it('el CSV neutraliza fórmulas', () => {
    const pd = emptyProfileData(base({ nombre: '=HYPERLINK("x")' }));
    pd.sesiones = [{ id: 's', planSessionId: 'a1', titulo: 'Aeróbico', fecha: '2026-11-01T10:00:00Z', inicio: '', fin: '', estado: 'completada', recuperacion: 'normal', nota: '', ejercicios: [], aerobicoMin: 30 }];
    expect(exportCsv(pd)).toContain("'=HYPERLINK");
  });
});

describe('nutrición', () => {
  const n: NutritionProfile = { objetivo: 'ganar_musculo', comidas: 4, horarios: '', dieta: 'vegana', rechazados: 'tofu', alergias: ['gluten'],
    presupuesto: 'medio', tiempoCocina: 'medio', sexo: 'mujer', pesoKg: 60, alturaCm: 165, relacionDificilComida: 'no', condicionClinica: false, embarazoLactancia: false };
  it('respeta dieta, alergias y alimentos rechazados', () => {
    const r = generateMenu(n, 30, 'moderada', true);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const nombres = r.menu.dias.flatMap((d) => d.comidas.flatMap((c) => c.items.map((i) => i.nombre.toLowerCase())));
    for (const bad of ['pollo', 'huevo', 'yogur natural', 'leche', 'avena', 'pan integral', 'pasta', 'tofu', 'merluza']) {
      expect(nombres.some((x) => x.includes(bad)), bad).toBe(false);
    }
    const sust = r.menu.dias.flatMap((d) => d.comidas.map((c) => c.sustitucion.toLowerCase())).join(' ');
    for (const bad of ['pollo', 'pavo', 'gambas', 'atún', 'queso', 'huevo', 'tofu']) expect(sust.includes(bad), `sustitución con ${bad}`).toBe(false);
    expect(r.menu.compra.length).toBeGreaterThan(0);
    expect(r.menu.dias.every((d) => d.comidas.every((c) => c.items.every((i) => ['en crudo', 'cocido', 'tal cual'].includes(i.estado))))).toBe(true);
  });
  it('ante riesgo de TCA ofrece solo hábitos, sin cifras', () => {
    const r = generateMenu({ ...n, dieta: 'omnivora', rechazados: '', alergias: [], relacionDificilComida: 'si' }, 30, 'moderada', true);
    expect(r.ok && r.menu.modo).toBe('habitos');
    expect(r.ok && r.menu.energia).toBeUndefined();
  });
  it('estimación energética solo con datos y sin objetivos agresivos', () => {
    const r = generateMenu({ ...n, dieta: 'omnivora', rechazados: '', alergias: [], objetivo: 'perder_grasa' }, 30, 'ligera', true);
    expect(r.ok && r.menu.energia).toBeTruthy();
    if (r.ok && r.menu.energia) {
      const bmr = 10 * 60 + 6.25 * 165 - 5 * 30 - 161;
      expect(r.menu.energia.min).toBeGreaterThanOrEqual(Math.round(bmr * 1.1 / 50) * 50 - 50);
    }
    const sinDatos = generateMenu({ ...n, dieta: 'omnivora', rechazados: '', alergias: [], pesoKg: undefined }, 30, 'ligera', true);
    expect(sinDatos.ok && sinDatos.menu.energia).toBeUndefined();
  });
});
