// Módulo de nutrición opcional. No hay base de composición alimentaria verificada en esta versión,
// así que el menú NO muestra kcal ni macros por plato. Solo se ofrece una estimación energética
// orientativa diaria (Mifflin-St Jeor) cuando hay datos y no existen circunstancias de riesgo.

import type { ActivityLevel, NutritionProfile } from './types';

type Alergeno = 'gluten' | 'lactosa' | 'frutos_secos' | 'huevo' | 'pescado' | 'marisco' | 'soja' | 'cacahuete';
type Origen = 'carne' | 'pescado' | 'marisco' | 'huevo' | 'lacteo';
type Cat = 'Proteínas' | 'Cereales y pan' | 'Legumbres' | 'Verduras' | 'Frutas' | 'Lácteos y bebidas' | 'Grasas y frutos secos' | 'Otros';

interface Ing { nombre: string; cat: Cat; origen?: Origen; alergenos: Alergeno[]; estado: 'en crudo' | 'cocido' | 'tal cual'; unidad: 'g' | 'ml' | 'ud' }

const I: Record<string, Ing> = {
  avena: { nombre: 'Copos de avena', cat: 'Cereales y pan', alergenos: ['gluten'], estado: 'en crudo', unidad: 'g' },
  panSG: { nombre: 'Pan sin gluten', cat: 'Cereales y pan', alergenos: [], estado: 'tal cual', unidad: 'g' },
  espinacas: { nombre: 'Espinacas', cat: 'Verduras', alergenos: [], estado: 'en crudo', unidad: 'g' },
  pan: { nombre: 'Pan integral', cat: 'Cereales y pan', alergenos: ['gluten'], estado: 'tal cual', unidad: 'g' },
  arroz: { nombre: 'Arroz integral', cat: 'Cereales y pan', alergenos: [], estado: 'en crudo', unidad: 'g' },
  pasta: { nombre: 'Pasta integral', cat: 'Cereales y pan', alergenos: ['gluten'], estado: 'en crudo', unidad: 'g' },
  patata: { nombre: 'Patata', cat: 'Verduras', alergenos: [], estado: 'en crudo', unidad: 'g' },
  quinoa: { nombre: 'Quinoa', cat: 'Cereales y pan', alergenos: [], estado: 'en crudo', unidad: 'g' },
  yogur: { nombre: 'Yogur natural', cat: 'Lácteos y bebidas', origen: 'lacteo', alergenos: ['lactosa'], estado: 'tal cual', unidad: 'g' },
  yogurSoja: { nombre: 'Yogur de soja natural', cat: 'Lácteos y bebidas', alergenos: ['soja'], estado: 'tal cual', unidad: 'g' },
  leche: { nombre: 'Leche', cat: 'Lácteos y bebidas', origen: 'lacteo', alergenos: ['lactosa'], estado: 'tal cual', unidad: 'ml' },
  bebidaSoja: { nombre: 'Bebida de soja enriquecida en calcio', cat: 'Lácteos y bebidas', alergenos: ['soja'], estado: 'tal cual', unidad: 'ml' },
  queso: { nombre: 'Queso fresco', cat: 'Lácteos y bebidas', origen: 'lacteo', alergenos: ['lactosa'], estado: 'tal cual', unidad: 'g' },
  huevo: { nombre: 'Huevos', cat: 'Proteínas', origen: 'huevo', alergenos: ['huevo'], estado: 'en crudo', unidad: 'ud' },
  pollo: { nombre: 'Pechuga de pollo', cat: 'Proteínas', origen: 'carne', alergenos: [], estado: 'en crudo', unidad: 'g' },
  pavo: { nombre: 'Pavo (filetes)', cat: 'Proteínas', origen: 'carne', alergenos: [], estado: 'en crudo', unidad: 'g' },
  ternera: { nombre: 'Ternera magra', cat: 'Proteínas', origen: 'carne', alergenos: [], estado: 'en crudo', unidad: 'g' },
  merluza: { nombre: 'Merluza', cat: 'Proteínas', origen: 'pescado', alergenos: ['pescado'], estado: 'en crudo', unidad: 'g' },
  salmon: { nombre: 'Salmón', cat: 'Proteínas', origen: 'pescado', alergenos: ['pescado'], estado: 'en crudo', unidad: 'g' },
  atun: { nombre: 'Atún al natural (lata, escurrido)', cat: 'Proteínas', origen: 'pescado', alergenos: ['pescado'], estado: 'tal cual', unidad: 'g' },
  gambas: { nombre: 'Gambas peladas', cat: 'Proteínas', origen: 'marisco', alergenos: ['marisco'], estado: 'en crudo', unidad: 'g' },
  tofu: { nombre: 'Tofu firme', cat: 'Proteínas', alergenos: ['soja'], estado: 'tal cual', unidad: 'g' },
  lentejas: { nombre: 'Lentejas', cat: 'Legumbres', alergenos: [], estado: 'en crudo', unidad: 'g' },
  garbanzos: { nombre: 'Garbanzos cocidos (bote, escurridos)', cat: 'Legumbres', alergenos: [], estado: 'cocido', unidad: 'g' },
  alubias: { nombre: 'Alubias cocidas (bote, escurridas)', cat: 'Legumbres', alergenos: [], estado: 'cocido', unidad: 'g' },
  hummus: { nombre: 'Hummus', cat: 'Legumbres', alergenos: [], estado: 'tal cual', unidad: 'g' },
  verdura: { nombre: 'Verduras variadas de temporada', cat: 'Verduras', alergenos: [], estado: 'en crudo', unidad: 'g' },
  ensalada: { nombre: 'Hojas verdes y tomate', cat: 'Verduras', alergenos: [], estado: 'en crudo', unidad: 'g' },
  brocoli: { nombre: 'Brócoli', cat: 'Verduras', alergenos: [], estado: 'en crudo', unidad: 'g' },
  pimiento: { nombre: 'Pimiento y cebolla', cat: 'Verduras', alergenos: [], estado: 'en crudo', unidad: 'g' },
  fruta: { nombre: 'Fruta de temporada', cat: 'Frutas', alergenos: [], estado: 'tal cual', unidad: 'ud' },
  platano: { nombre: 'Plátano', cat: 'Frutas', alergenos: [], estado: 'tal cual', unidad: 'ud' },
  frutosRojos: { nombre: 'Frutos rojos', cat: 'Frutas', alergenos: [], estado: 'tal cual', unidad: 'g' },
  aove: { nombre: 'Aceite de oliva virgen extra', cat: 'Grasas y frutos secos', alergenos: [], estado: 'tal cual', unidad: 'ml' },
  nueces: { nombre: 'Nueces', cat: 'Grasas y frutos secos', alergenos: ['frutos_secos'], estado: 'tal cual', unidad: 'g' },
  semillas: { nombre: 'Semillas de calabaza', cat: 'Grasas y frutos secos', alergenos: [], estado: 'tal cual', unidad: 'g' },
  aguacate: { nombre: 'Aguacate', cat: 'Grasas y frutos secos', alergenos: [], estado: 'tal cual', unidad: 'g' },
  crema: { nombre: 'Crema de cacahuete 100 %', cat: 'Grasas y frutos secos', alergenos: ['cacahuete'], estado: 'tal cual', unidad: 'g' },
  zanahoria: { nombre: 'Zanahoria en palitos', cat: 'Verduras', alergenos: [], estado: 'en crudo', unidad: 'g' },
  tomateTostada: { nombre: 'Tomate rallado', cat: 'Verduras', alergenos: [], estado: 'tal cual', unidad: 'g' },
};

type MealType = 'desayuno' | 'media_manana' | 'comida' | 'merienda' | 'cena';
interface Meal { id: string; tipo: 'desayuno' | 'principal' | 'tentempie'; nombre: string; tiempo: 1 | 2 | 3; coste: 1 | 2 | 3; items: [string, number][]; sust: [string, string[]][] }

const M: Meal[] = [
  { id: 'd1', tipo: 'desayuno', nombre: 'Avena con yogur y fruta', tiempo: 1, coste: 1, items: [['avena', 50], ['yogur', 150], ['fruta', 1], ['nueces', 15]], sust: [['yogur', ['yogurSoja']], ['nueces', ['semillas']]] },
  { id: 'd2', tipo: 'desayuno', nombre: 'Tostadas con tomate, AOVE y huevo', tiempo: 2, coste: 1, items: [['pan', 70], ['tomateTostada', 50], ['aove', 10], ['huevo', 2], ['fruta', 1]], sust: [['huevo', ['queso', 'hummus']]] },
  { id: 'd3', tipo: 'desayuno', nombre: 'Porridge de avena con leche y plátano', tiempo: 2, coste: 1, items: [['avena', 50], ['leche', 250], ['platano', 1], ['semillas', 10]], sust: [['leche', ['bebidaSoja']]] },
  { id: 'd4', tipo: 'desayuno', nombre: 'Tostadas con hummus y fruta', tiempo: 1, coste: 1, items: [['pan', 70], ['hummus', 50], ['fruta', 1]], sust: [['hummus', ['aguacate', 'queso']]] },
  { id: 'd5', tipo: 'desayuno', nombre: 'Yogur de soja con avena y frutos rojos', tiempo: 1, coste: 2, items: [['yogurSoja', 200], ['avena', 40], ['frutosRojos', 100], ['semillas', 10]], sust: [['frutosRojos', ['fruta']]] },
  { id: 'd6', tipo: 'desayuno', nombre: 'Tostada con queso fresco y fruta', tiempo: 1, coste: 1, items: [['pan', 70], ['queso', 80], ['aove', 5], ['fruta', 1]], sust: [['queso', ['tofu', 'hummus']]] },
  { id: 'd7', tipo: 'desayuno', nombre: 'Pan sin gluten con aguacate y tomate', tiempo: 1, coste: 2, items: [['panSG', 70], ['aguacate', 50], ['tomateTostada', 50], ['fruta', 1]], sust: [['aguacate', ['hummus', 'queso']]] },
  { id: 'd8', tipo: 'desayuno', nombre: 'Yogur de soja con fruta y semillas', tiempo: 1, coste: 1, items: [['yogurSoja', 200], ['fruta', 1], ['semillas', 15]], sust: [['yogurSoja', ['yogur']]] },
  { id: 'p1', tipo: 'principal', nombre: 'Lentejas estofadas con verduras', tiempo: 2, coste: 1, items: [['lentejas', 70], ['verdura', 150], ['patata', 100], ['aove', 10], ['fruta', 1]], sust: [['lentejas', ['garbanzos', 'alubias']]] },
  { id: 'p2', tipo: 'principal', nombre: 'Pollo a la plancha con arroz y brócoli', tiempo: 2, coste: 2, items: [['pollo', 130], ['arroz', 70], ['brocoli', 150], ['aove', 10]], sust: [['pollo', ['pavo', 'tofu']], ['arroz', ['quinoa']]] },
  { id: 'p3', tipo: 'principal', nombre: 'Merluza al horno con patata y ensalada', tiempo: 2, coste: 2, items: [['merluza', 150], ['patata', 200], ['ensalada', 100], ['aove', 10]], sust: [['merluza', ['huevo', 'tofu']]] },
  { id: 'p4', tipo: 'principal', nombre: 'Pasta integral con atún y tomate', tiempo: 1, coste: 1, items: [['pasta', 80], ['atun', 80], ['tomateTostada', 100], ['ensalada', 80], ['aove', 10]], sust: [['atun', ['garbanzos', 'pollo']]] },
  { id: 'p5', tipo: 'principal', nombre: 'Salteado de tofu con verduras y arroz', tiempo: 2, coste: 2, items: [['tofu', 150], ['pimiento', 150], ['arroz', 70], ['aove', 10]], sust: [['tofu', ['pollo', 'gambas', 'garbanzos']]] },
  { id: 'p6', tipo: 'principal', nombre: 'Ensalada de garbanzos, huevo y verduras', tiempo: 1, coste: 1, items: [['garbanzos', 200], ['huevo', 1], ['ensalada', 120], ['aove', 10], ['pan', 40]], sust: [['huevo', ['atun', 'queso', 'tofu']]] },
  { id: 'p7', tipo: 'principal', nombre: 'Salmón con quinoa y verduras asadas', tiempo: 2, coste: 3, items: [['salmon', 130], ['quinoa', 60], ['verdura', 150], ['aove', 5]], sust: [['salmon', ['merluza', 'tofu']]] },
  { id: 'p8', tipo: 'principal', nombre: 'Ternera con patata asada y pimiento', tiempo: 2, coste: 3, items: [['ternera', 130], ['patata', 200], ['pimiento', 120], ['aove', 10]], sust: [['ternera', ['pavo', 'lentejas']]] },
  { id: 'p9', tipo: 'principal', nombre: 'Tortilla de patata y verdura con ensalada', tiempo: 2, coste: 1, items: [['huevo', 2], ['patata', 150], ['pimiento', 80], ['ensalada', 100], ['aove', 10]], sust: [['huevo', ['tofu']]] },
  { id: 'p10', tipo: 'principal', nombre: 'Alubias con arroz y verduras', tiempo: 1, coste: 1, items: [['alubias', 200], ['arroz', 50], ['verdura', 150], ['aove', 10]], sust: [['alubias', ['lentejas', 'garbanzos']]] },
  { id: 'p11', tipo: 'principal', nombre: 'Gambas salteadas con pasta integral', tiempo: 2, coste: 3, items: [['gambas', 130], ['pasta', 80], ['pimiento', 100], ['aove', 10]], sust: [['gambas', ['pollo', 'tofu']]] },
  { id: 'p12', tipo: 'principal', nombre: 'Pavo con verduras y pan integral', tiempo: 1, coste: 2, items: [['pavo', 130], ['verdura', 150], ['pan', 60], ['aove', 10]], sust: [['pavo', ['pollo', 'tofu']]] },
  { id: 'p13', tipo: 'principal', nombre: 'Bol de quinoa, garbanzos y aguacate', tiempo: 1, coste: 2, items: [['quinoa', 60], ['garbanzos', 150], ['aguacate', 50], ['ensalada', 100]], sust: [['quinoa', ['arroz']]] },
  { id: 'p14', tipo: 'principal', nombre: 'Garbanzos salteados con espinacas y arroz', tiempo: 1, coste: 1, items: [['garbanzos', 200], ['espinacas', 150], ['arroz', 50], ['aove', 10]], sust: [['garbanzos', ['alubias', 'huevo']]] },
  { id: 't1', tipo: 'tentempie', nombre: 'Yogur con fruta', tiempo: 1, coste: 1, items: [['yogur', 125], ['fruta', 1]], sust: [['yogur', ['yogurSoja']]] },
  { id: 't2', tipo: 'tentempie', nombre: 'Fruta y nueces', tiempo: 1, coste: 1, items: [['fruta', 1], ['nueces', 20]], sust: [['nueces', ['semillas']]] },
  { id: 't3', tipo: 'tentempie', nombre: 'Tostada con crema de cacahuete y plátano', tiempo: 1, coste: 1, items: [['pan', 40], ['crema', 15], ['platano', 1]], sust: [['crema', ['hummus']]] },
  { id: 't4', tipo: 'tentempie', nombre: 'Hummus con pan', tiempo: 1, coste: 1, items: [['hummus', 60], ['pan', 40]], sust: [['pan', ['zanahoria']]] },
  { id: 't6', tipo: 'tentempie', nombre: 'Fruta con semillas', tiempo: 1, coste: 1, items: [['fruta', 1], ['semillas', 15]], sust: [['semillas', ['nueces']]] },
  { id: 't5', tipo: 'tentempie', nombre: 'Bebida de soja y fruta', tiempo: 1, coste: 1, items: [['bebidaSoja', 250], ['fruta', 1]], sust: [['bebidaSoja', ['leche', 'yogur']]] },
];

export const ALERGENO_LABEL: Record<Alergeno, string> = {
  gluten: 'Gluten', lactosa: 'Lactosa', frutos_secos: 'Frutos secos', huevo: 'Huevo', pescado: 'Pescado', marisco: 'Marisco', soja: 'Soja', cacahuete: 'Cacahuete',
};

const DIET_EXCLUDES: Record<NutritionProfile['dieta'], Origen[]> = {
  omnivora: [], pescetariana: ['carne'], vegetariana: ['carne', 'pescado', 'marisco'], vegana: ['carne', 'pescado', 'marisco', 'huevo', 'lacteo'],
};

export interface MenuItem { nombre: string; cantidad: number; unidad: string; estado: string }
export interface MenuMeal { momento: MealType; nombre: string; items: MenuItem[]; sustitucion: string }
export interface Menu {
  modo: 'personalizado' | 'habitos';
  dias: { dia: number; comidas: MenuMeal[] }[];
  compra: { cat: string; nombre: string; cantidad: number; unidad: string }[];
  energia?: { min: number; max: number; base: string };
  proteina?: { min: number; max: number };
  avisos: string[];
  habitos: string[];
}

export const HABITOS = [
  'Come con regularidad, sin saltarte comidas por compensar.',
  'Incluye verduras o fruta en la mayoría de comidas y legumbres varias veces por semana.',
  'Prioriza cereales integrales, aceite de oliva y agua como bebida habitual.',
  'Incluye una fuente de proteína en las comidas principales.',
  'Escucha tu hambre y saciedad; evita etiquetar alimentos como prohibidos.',
];

export function needsProfessional(n: NutritionProfile): string | null {
  if (n.relacionDificilComida === 'si') return 'Has indicado una relación difícil con la comida. No vamos a proponer objetivos de calorías ni de peso; te recomendamos el acompañamiento de un dietista-nutricionista y, si lo necesitas, de un profesional de salud mental.';
  if (n.condicionClinica) return 'Con una condición clínica que afecta a la alimentación, el plan debe pautarlo un dietista-nutricionista o tu equipo sanitario. Aquí solo mostramos hábitos generales.';
  if (n.embarazoLactancia) return 'En embarazo o lactancia las necesidades cambian; consulta a tu matrona o a un dietista-nutricionista. Aquí solo mostramos hábitos generales.';
  return null;
}

const ACT: Record<ActivityLevel, number> = { sedentaria: 1.2, ligera: 1.375, moderada: 1.55, alta: 1.725 };

export function energyEstimate(n: NutritionProfile, edad: number, actividad: ActivityLevel): Menu['energia'] | undefined {
  if (!n.sexo || !n.pesoKg || !n.alturaCm || n.relacionDificilComida !== 'no') return undefined;
  const bmr = 10 * n.pesoKg + 6.25 * n.alturaCm - 5 * edad + (n.sexo === 'hombre' ? 5 : -161);
  const tdee = bmr * ACT[actividad];
  let min = tdee * 0.9, max = tdee * 1.1, base = 'mantenimiento';
  if (n.objetivo === 'perder_grasa') { min = Math.max(tdee * 0.8, bmr * 1.1); max = Math.max(tdee * 0.9, min + 100); base = 'déficit moderado (10–20 % bajo el mantenimiento estimado)'; }
  if (n.objetivo === 'ganar_musculo') { min = tdee * 1.0; max = tdee * 1.1; base = 'ligero superávit (0–10 %)'; }
  const r = (x: number) => Math.round(x / 50) * 50;
  return { min: r(min), max: r(max), base };
}

function sustText(meal: Meal, ok: (k: string) => boolean): string {
  const parts = meal.sust.map(([from, tos]) => [from, tos.filter((t) => I[t] && ok(t))] as const)
    .filter(([, tos]) => tos.length)
    .map(([from, tos]) => `${I[from].nombre} por ${tos.map((t) => I[t].nombre.toLowerCase()).join(' o ')}`);
  return parts.length ? `${parts.join('; ')}.` : 'Sin sustituciones compatibles con tus restricciones en esta versión.';
}

export function generateMenu(n: NutritionProfile, edad: number, actividad: ActivityLevel, entrenaFuerza: boolean): { ok: true; menu: Menu } | { ok: false; motivo: string } {
  const pro = needsProfessional(n);
  if (pro || edad < 18) {
    return { ok: true, menu: { modo: 'habitos', dias: [], compra: [], avisos: [pro ?? 'Para menores de edad no se proponen objetivos de calorías.'], habitos: HABITOS } };
  }
  const banned = new Set(DIET_EXCLUDES[n.dieta]);
  const alerg = new Set(n.alergias);
  const rechazados = n.rechazados.toLowerCase().split(/[,;\n]/).map((s) => s.trim()).filter((s) => s.length > 2);
  const ingOk = (k: string) => {
    const g = I[k];
    if (g.origen && banned.has(g.origen)) return false;
    if (g.alergenos.some((a) => alerg.has(a))) return false;
    if (rechazados.some((r) => g.nombre.toLowerCase().includes(r))) return false;
    return true;
  };
  const maxTiempo = n.tiempoCocina === 'poco' ? 1 : n.tiempoCocina === 'medio' ? 2 : 3;
  const maxCoste = n.presupuesto === 'ajustado' ? 1 : n.presupuesto === 'medio' ? 2 : 3;
  const usable = M.filter((m) => m.items.every(([k]) => ingOk(k)));
  const byType = (t: Meal['tipo']) => {
    const strict = usable.filter((m) => m.tipo === t && m.tiempo <= maxTiempo && m.coste <= maxCoste);
    return strict.length >= (t === 'principal' ? 4 : 2) ? strict : usable.filter((m) => m.tipo === t);
  };
  const des = byType('desayuno'), pri = byType('principal'), ten = byType('tentempie');
  if (des.length < 2 || pri.length < 3 || (n.comidas > 3 && ten.length < 1)) {
    return { ok: false, motivo: 'Con tus restricciones quedan muy pocas recetas en la biblioteca actual. Revisa los alimentos rechazados o consulta a un dietista-nutricionista para un plan a medida.' };
  }
  const momentos: MealType[] = n.comidas >= 5 ? ['desayuno', 'media_manana', 'comida', 'merienda', 'cena']
    : n.comidas === 4 ? ['desayuno', 'comida', 'merienda', 'cena'] : ['desayuno', 'comida', 'cena'];
  const dias: Menu['dias'] = [];
  const totals = new Map<string, number>();
  for (let d = 0; d < 7; d++) {
    const comidas: MenuMeal[] = momentos.map((mo, mi) => {
      const pool = mo === 'desayuno' ? des : (mo === 'comida' || mo === 'cena') ? pri : ten;
      const idx = mo === 'cena' ? (d * 2 + 1) : mo === 'comida' ? d * 2 : d + mi;
      const meal = pool[idx % pool.length];
      meal.items.forEach(([k, q]) => totals.set(k, (totals.get(k) ?? 0) + q));
      return {
        momento: mo, nombre: meal.nombre, sustitucion: sustText(meal, ingOk),
        items: meal.items.map(([k, q]) => ({ nombre: I[k].nombre, cantidad: q, unidad: I[k].unidad, estado: I[k].estado })),
      };
    });
    dias.push({ dia: d, comidas });
  }
  const compra = [...totals.entries()].map(([k, q]) => ({ cat: I[k].cat, nombre: I[k].nombre, cantidad: q, unidad: I[k].unidad }))
    .sort((a, b) => a.cat.localeCompare(b.cat) || a.nombre.localeCompare(b.nombre));
  const avisos = [
    'Cantidades orientativas para una persona adulta. Ajústalas a tu hambre, tu actividad y tu evolución.',
    'No se muestran calorías ni macronutrientes por plato porque esta versión no dispone de una base de composición de alimentos verificada.',
  ];
  if (n.relacionDificilComida === 'prefiero_no') avisos.push('No se proponen objetivos de calorías ni de peso.');
  const energia = energyEstimate(n, edad, actividad);
  const proteina = energia && n.pesoKg && entrenaFuerza && (n.objetivo === 'ganar_musculo' || n.objetivo === 'rendimiento' || n.objetivo === 'perder_grasa')
    ? { min: Math.round(n.pesoKg * 1.4), max: Math.round(n.pesoKg * 2.0) } : undefined;
  return { ok: true, menu: { modo: 'personalizado', dias, compra, energia, proteina, avisos, habitos: HABITOS } };
}

export const MOMENTO_LABEL: Record<MealType, string> = {
  desayuno: 'Desayuno', media_manana: 'Media mañana', comida: 'Comida', merienda: 'Merienda', cena: 'Cena',
};
