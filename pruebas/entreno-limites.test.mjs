// Entrenador con IA · Fase 1: minimización de datos, límites y validador. Solo datos ficticios.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calcularLimites, normalizarResumen, presupuestoSemanal, rangoEdad, validarPlan } from '../api/_lib/entreno/limites.js';

const base = (carrera = {}, extra = {}) => ({
  rangoEdad: '30-39', objetivo: 'carrera', experienciaFuerza: 'intermedio', dias: 5, minutosSesion: 60,
  limitaciones: [], sueno: '7a9', recuperacion: 'normal',
  carrera: { distancia: '10k', experiencia: 'regular', minutosSemana: 150, diasHastaPrueba: null, ...carrera }, ...extra,
});
const limites = (c, e) => calcularLimites(normalizarResumen(base(c, e)).resumen);
const run = (dia, tipo, min) => ({ dia, tipo: 'carrera', minutosEstimados: min, carrera: { tipo } });
const fuerza = (dia, min = 50) => ({ dia, tipo: 'fuerza', minutosEstimados: min });

test('minimización: se descartan identificadores, datos de salud y textos libres', () => {
  const entrada = {
    ...base(),
    nombre: 'Ana Ficticia', email: 'ana@example.com', codigo: 'FIT-AAAA-BBBB', edad: 37, pesoKg: 60, alturaCm: 165,
    limitacionesTexto: 'operada de rodilla en 2025', indicacionesProfesionales: 'texto libre', screening: { sintomasEsfuerzo: false },
    limitaciones: ['rodilla', '<script>', 'inventada'],
    carrera: { ...base().carrera, fechaPrueba: '2026-12-01', marca: { distanciaKm: 5, tiempoSeg: 1500 } },
    historial: { semanas: [{ minutosCarrera: 100, sesionesHechas: 3, molestiaMax: 1, nota: 'me dolía' }], fechas: ['2026-11-01'] },
  };
  const { resumen, descartados } = normalizarResumen(entrada);
  const texto = JSON.stringify(resumen);
  for (const prohibido of ['Ana', 'example.com', 'FIT-', '37', '165', 'operada', 'texto libre', 'sintomas', '2026-12-01', '1500', 'me dolía', '<script>']) {
    assert.ok(!texto.includes(prohibido), `no debe salir: ${prohibido}`);
  }
  assert.deepEqual(resumen.limitaciones, ['rodilla']);
  for (const k of ['nombre', 'email', 'codigo', 'edad', 'pesoKg', 'limitacionesTexto', 'screening', 'carrera.fechaPrueba', 'carrera.marca', 'historial.fechas', 'historial.semanas.nota']) {
    assert.ok(descartados.includes(k), `debería avisar de ${k}`);
  }
  assert.ok(!JSON.stringify(descartados).includes('Ana'), 'descartados solo lleva nombres de campo');
});

test('minimización: edad en rangos, nunca exacta; datos obligatorios y rangos válidos', () => {
  assert.equal(rangoEdad(37), '30-39');
  assert.equal(rangoEdad(70), '70+');
  assert.equal(rangoEdad(17), null);
  assert.equal(normalizarResumen({ ...base(), dias: 9 }).resumen, null);
  assert.equal(normalizarResumen({ ...base(), carrera: { distancia: '10k', experiencia: 'regular' } }).resumen, null);
  assert.equal(normalizarResumen(null).resumen, null);
  assert.equal(normalizarResumen([1]).resumen, null);
});

test('presupuesto semanal: +10 % o +15 min, mínimo 40', () => {
  assert.equal(presupuestoSemanal(0), 40);
  assert.equal(presupuestoSemanal(60), 75);
  assert.equal(presupuestoSemanal(150), 165);
  assert.equal(presupuestoSemanal(300), 330);
});

test('semana correcta de 10 km: pasa', () => {
  const v = validarPlan({ sesiones: [run(0, 'rodaje', 40), run(1, 'series', 45), fuerza(2), run(3, 'rodaje', 25), run(6, 'tirada', 55)] }, limites());
  assert.deepEqual(v.errores, []);
  assert.equal(v.ok, true);
});

test('rechaza: volumen excesivo, demasiadas salidas y sesión más larga que el tiempo disponible', () => {
  const L = limites({ minutosSemana: 60 }); // máximo 75 min, 3 salidas
  const v = validarPlan({ sesiones: [run(0, 'rodaje', 25), run(2, 'rodaje', 25), run(4, 'rodaje', 25), run(6, 'tirada', 30)] }, L);
  assert.ok(v.errores.some((e) => /Volumen/.test(e)));
  assert.ok(v.errores.some((e) => /Demasiadas salidas/.test(e)));
  assert.ok(validarPlan({ sesiones: [run(6, 'tirada', 90)] }, limites()).errores.some((e) => /máximo es 60/.test(e)));
});

test('rechaza: calidad sin base, con quien empieza o con molestias recientes', () => {
  assert.ok(!validarPlan({ sesiones: [run(1, 'series', 40)] }, limites({ minutosSemana: 45 })).ok);
  const emp = validarPlan({ sesiones: [run(1, 'rodaje', 20)] }, limites({ experiencia: 'empiezo', minutosSemana: 0 }));
  assert.ok(emp.errores.some((e) => /correr-caminar/.test(e)));
  const L = limites({}, { historial: { semanas: [{ minutosCarrera: 150, sesionesHechas: 4, molestiaMax: 2 }] } });
  const v = validarPlan({ sesiones: [run(1, 'series', 45), run(6, 'tirada', 55)] }, L);
  assert.ok(v.errores.some((e) => /molestias/.test(e)));
  assert.equal(L.carrera.volumenMax, 150, 'con molestias no se aumenta el volumen');
});

test('rechaza: más de 2 sesiones de calidad, duras en días seguidos (también domingo-lunes) y tirada que no es la más larga', () => {
  const L = limites({ minutosSemana: 300 }, { dias: 6 });
  assert.ok(validarPlan({ sesiones: [run(0, 'series', 45), run(2, 'tempo', 45), run(4, 'series', 45), run(6, 'tirada', 60)] }, L).errores.some((e) => /calidad: 3/.test(e)));
  assert.ok(validarPlan({ sesiones: [run(1, 'series', 45), run(2, 'tirada', 60)] }, L).errores.some((e) => /días seguidos/.test(e)));
  assert.ok(validarPlan({ sesiones: [run(6, 'tirada', 60), run(0, 'tempo', 45)] }, L).errores.some((e) => /días seguidos/.test(e)));
  assert.ok(validarPlan({ sesiones: [run(1, 'rodaje', 50), run(4, 'tirada', 45)] }, L).errores.some((e) => /más larga/.test(e)));
});

test('rechaza: estructura no válida (días repetidos, sin descanso, tipos inventados)', () => {
  const L = limites({}, { dias: 6 });
  assert.ok(validarPlan({ sesiones: [run(1, 'rodaje', 30), fuerza(1)] }, L).errores.some((e) => /mismo día/.test(e)));
  assert.ok(!validarPlan({ sesiones: [run(9, 'rodaje', 30)] }, L).ok);
  assert.ok(!validarPlan({ sesiones: [run(1, 'maraton_extrema', 30)] }, L).ok);
  assert.ok(!validarPlan({ sesiones: [{ dia: 1, tipo: 'carrera', minutosEstimados: -5, carrera: { tipo: 'rodaje' } }] }, L).ok);
  assert.ok(!validarPlan({}, L).ok);
  const siete = { sesiones: [0, 1, 2, 3, 4, 5, 6].map((d) => fuerza(d, 30)) };
  assert.ok(validarPlan(siete, calcularLimites({ ...normalizarResumen(base()).resumen, dias: 7 })).errores.some((e) => /descanso/.test(e)));
});

test('fuerza de apoyo: cuenta solo la carrera para el volumen y no se permite tras sesiones duras', () => {
  const L = limites({ minutosSemana: 0 }, { dias: 2, minutosSesion: 45 }); // máximo 40 min de carrera
  const rodajeConFuerza = { dia: 1, tipo: 'carrera', minutosEstimados: 35, ejercicios: [1, 2, 3, 4], carrera: { tipo: 'rodaje', minutos: 17 } };
  assert.deepEqual(validarPlan({ sesiones: [rodajeConFuerza, { ...run(5, 'tirada', 22), carrera: { tipo: 'tirada', minutos: 22 } }] }, L).errores, []);
  const tiradaConFuerza = { dia: 5, tipo: 'carrera', minutosEstimados: 40, ejercicios: [1, 2, 3], carrera: { tipo: 'tirada', minutos: 22 } };
  assert.ok(validarPlan({ sesiones: [{ ...run(1, 'rodaje', 17), carrera: { tipo: 'rodaje', minutos: 17 } }, tiradaConFuerza] }, L).errores.some((e) => /Fuerza de apoyo/.test(e)));
  assert.ok(validarPlan({ sesiones: [{ dia: 1, tipo: 'carrera', minutosEstimados: 20, carrera: { tipo: 'rodaje', minutos: 30 } }] }, L).errores.some((e) => /no pueden superar/.test(e)));
});

test('los 6480 planes de las reglas v0.6 (perfiles ficticios) pasan el validador', () => {
  const planes = JSON.parse(readFileSync(new URL('./fixtures/planes-reglas.json', import.meta.url)));
  assert.equal(planes.length, 6480);
  const fallos = [];
  for (const [distancia, experiencia, minutosSemana, dias, minutos, diasHastaPrueba, txt] of planes) {
    const { resumen } = normalizarResumen({ ...base({ distancia, experiencia, minutosSemana, diasHastaPrueba }), dias, minutosSesion: minutos });
    const sesiones = txt.split(';').map((s) => {
      const [dia, tipo, tipoCarrera, min, minCarrera, nEj] = s.split(':');
      return { dia: Number(dia), tipo, minutosEstimados: Number(min), ejercicios: Array.from({ length: Number(nEj) }, (_, k) => k),
        ...(tipoCarrera ? { carrera: { tipo: tipoCarrera, minutos: Number(minCarrera) } } : {}) };
    });
    const v = validarPlan({ sesiones }, calcularLimites(resumen));
    if (!v.ok) fallos.push({ distancia, experiencia, minutosSemana, dias, minutos, diasHastaPrueba, errores: v.errores });
  }
  assert.deepEqual(fallos.slice(0, 3), []);
});
