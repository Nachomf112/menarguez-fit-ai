// Cálculo de objetivos nutricionales de Fit AI. Orientativo, no sustituye a un profesional.
// Esta función tiene una copia idéntica en public/app.html (calcularObjetivos);
// la prueba pruebas/nutricion.test.mjs falla si las dos dejan de coincidir.
//
// Fuentes:
//  - Metabolismo basal: Mifflin-St Jeor. Frankenfield D, et al. J Am Diet Assoc. 2005;105(5):775-789
//    (la ecuación con más probabilidad de acertar dentro de ±10 %).
//  - Ingesta mínima y déficit: Jensen MD, et al. 2013 AHA/ACC/TOS Guideline for the Management of
//    Overweight and Obesity in Adults (NHLBI): 1.200-1.500 kcal/día mujeres, 1.500-1.800 hombres,
//    o déficit de 500-750 kcal/día.
//  - Proteína: Jäger R, et al. ISSN Position Stand: protein and exercise. JISSN 2017;14:20
//    (1,4-2,0 g/kg/día para personas que hacen ejercicio). Peso de referencia para IMC > 25.
//  - Bajo peso: IMC < 18,5 (OMS). Con bajo peso no se propone ningún déficit.

export function calcularObjetivos({ peso, altura, edad, sexo, actividad, objetivo }) {
  const FACTORES = { sedentario: 1.2, ligero: 1.375, moderado: 1.55, activo: 1.725, muy_activo: 1.9 };
  const PROT_BASE = { sedentario: 1.0, ligero: 1.2, moderado: 1.4, activo: 1.6, muy_activo: 1.8 };
  const hombre = sexo === 'hombre';
  const bmr = 10 * peso + 6.25 * altura - 5 * edad + (hombre ? 5 : -161);
  const tdee = Math.round(bmr * (FACTORES[actividad] || 1.2));

  const imc = peso / Math.pow(altura / 100, 2);
  const bajoPeso = imc < 18.5;
  let ajuste = 0;
  if (bajoPeso && (objetivo === 'adelgazar' || objetivo === 'definir')) ajuste = 0;   // nunca déficit con bajo peso
  else if (objetivo === 'adelgazar') ajuste = -Math.min(500, Math.round(tdee * 0.20));
  else if (objetivo === 'definir') ajuste = -Math.min(300, Math.round(tdee * 0.10));
  else if (objetivo === 'musculo') ajuste = Math.min(300, Math.round(tdee * 0.10));

  const suelo = hombre ? 1500 : 1200;
  let objKcal = tdee + ajuste;
  let ajustadoAlMinimo = false;
  if (ajuste < 0 && objKcal < suelo) {
    objKcal = Math.min(tdee, suelo);   // nunca por debajo del mínimo ni por encima del mantenimiento
    ajustadoAlMinimo = true;
  }

  const pesoRef = Math.min(peso, 25 * Math.pow(altura / 100, 2));
  let gkg = PROT_BASE[actividad] || 1.0;
  if (objetivo === 'adelgazar' || objetivo === 'definir') gkg += 0.2;
  if (objetivo === 'musculo') gkg = Math.max(gkg, 1.6);
  gkg = Math.min(gkg, 2.0);
  const protObj = Math.round(pesoRef * gkg);
  const fatObj = Math.round(objKcal * 0.25 / 9);
  const carbObj = Math.max(0, Math.round((objKcal - protObj * 4 - fatObj * 9) / 4));

  if (bajoPeso && (objetivo === 'adelgazar' || objetivo === 'definir')) ajustadoAlMinimo = true;

  return { tdee, objKcal, protObj, fatObj, carbObj, ajustadoAlMinimo };
}
