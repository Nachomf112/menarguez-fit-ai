// Cálculo nutricional (C5): suelo calórico, déficit proporcional, proteína por peso de referencia.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calcularObjetivos } from '../api/_lib/nutricion.js';

const persona = (o) => ({ peso: 70, altura: 175, edad: 35, sexo: 'hombre', actividad: 'moderado', objetivo: 'mantener', ...o });

test('casos de la auditoría C5: ningún objetivo por debajo del mínimo', () => {
  const casos = [
    persona({ sexo: 'mujer', peso: 50, altura: 155, edad: 60, actividad: 'sedentario', objetivo: 'adelgazar' }), // antes 956
    persona({ sexo: 'mujer', peso: 45, altura: 150, edad: 70, actividad: 'sedentario', objetivo: 'adelgazar' }), // antes 830
    persona({ sexo: 'mujer', peso: 30, altura: 140, edad: 80, actividad: 'sedentario', objetivo: 'adelgazar' }), // antes 575
  ];
  for (const c of casos) {
    const r = calcularObjetivos(c);
    assert.ok(r.objKcal >= Math.min(1200, r.tdee), JSON.stringify(r));
    assert.ok(r.objKcal <= r.tdee);
  }
  // Si el mantenimiento ya es menor que el mínimo, no se propone déficit
  const r = calcularObjetivos(casos[1]);
  assert.equal(r.objKcal, r.tdee);
  assert.equal(r.ajustadoAlMinimo, true);
});

test('con bajo peso (IMC < 18,5) nunca se propone déficit', () => {
  const r = calcularObjetivos(persona({ sexo: 'mujer', peso: 30, altura: 140, edad: 80, actividad: 'sedentario', objetivo: 'adelgazar' }));
  assert.equal(r.objKcal, r.tdee);
  assert.equal(r.ajustadoAlMinimo, true);
  const d = calcularObjetivos(persona({ peso: 50, altura: 175, objetivo: 'definir' }));
  assert.equal(d.objKcal, d.tdee);
});

test('el mínimo de los hombres es 1.500 kcal', () => {
  const r = calcularObjetivos(persona({ peso: 55, altura: 160, edad: 75, actividad: 'sedentario', objetivo: 'adelgazar' }));
  assert.ok(r.objKcal >= Math.min(1500, r.tdee));
});

test('déficit proporcional y con tope', () => {
  const base = calcularObjetivos(persona());
  const ad = calcularObjetivos(persona({ objetivo: 'adelgazar' }));
  assert.equal(ad.tdee, base.tdee);
  assert.equal(base.tdee - ad.objKcal, Math.min(500, Math.round(base.tdee * 0.2)));
  const grande = calcularObjetivos(persona({ peso: 120, actividad: 'muy_activo', objetivo: 'adelgazar' }));
  assert.equal(grande.tdee - grande.objKcal, 500);
  const mus = calcularObjetivos(persona({ objetivo: 'musculo' }));
  assert.ok(mus.objKcal - mus.tdee <= 300 && mus.objKcal > mus.tdee);
});

test('proteína razonable: el caso de 150 kg ya no da 300 g', () => {
  const r = calcularObjetivos(persona({ peso: 150, altura: 180, edad: 40, actividad: 'sedentario', objetivo: 'mantener' }));
  assert.ok(r.protObj < 120, String(r.protObj));
  const atleta = calcularObjetivos(persona({ actividad: 'muy_activo', objetivo: 'musculo' }));
  assert.ok(atleta.protObj / 70 <= 2.0 && atleta.protObj / 70 >= 1.6);
});

test('Mifflin-St Jeor: valor de referencia', () => {
  // Hombre 70 kg, 175 cm, 35 años: BMR = 700 + 1093,75 - 175 + 5 = 1623,75; ×1,55 = 2517
  assert.equal(calcularObjetivos(persona()).tdee, 2517);
});

test('la copia del navegador (app.html) es idéntica a la del servidor', () => {
  const html = readFileSync('public/app.html', 'utf8').replace(/\r\n/g, '\n');
  const i = html.indexOf('function calcularObjetivos(');
  const fin = html.indexOf('\n}\n', i) + 2;
  const cliente = new Function(`${html.slice(i, fin)}; return calcularObjetivos;`)();
  const servidor = readFileSync('api/_lib/nutricion.js', 'utf8').replace(/\r\n/g, '\n');
  const j = servidor.indexOf('export function calcularObjetivos(');
  assert.equal(html.slice(i, fin), servidor.slice(j + 'export '.length, servidor.indexOf('\n}\n', j) + 2));
  for (const sexo of ['hombre', 'mujer']) for (const actividad of ['sedentario', 'moderado', 'muy_activo']) for (const objetivo of ['adelgazar', 'definir', 'musculo', 'mantener']) {
    const p = persona({ sexo, actividad, objetivo, peso: 48 + Math.random() * 100 });
    assert.deepEqual(cliente(p), calcularObjetivos(p));
  }
});
