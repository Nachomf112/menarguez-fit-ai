// Genera planes de carrera por reglas para una rejilla de perfiles FICTICIOS.
// Uso: npx vite-node scripts/planes-reglas.ts <salida.json> [--compacto]
// --compacto: rejilla reducida y formato breve, para la prueba del servidor (pruebas/fixtures/planes-reglas.json).
// Sirve para comprobar que el validador del servidor (entrenador con IA, fase 1) acepta los planes de las reglas.
import { writeFileSync } from 'node:fs';
import { blankProfile } from '../src/data/demo';
import { generatePlan } from '../src/domain/planner';
import type { Profile, RaceDistance, RunningProfile } from '../src/domain/types';

const NOW = new Date('2026-11-06T10:00:00');
const fecha = (dias: number) => new Date(NOW.getTime() + dias * 864e5).toISOString().slice(0, 10);
const compacto = process.argv.includes('--compacto');
const out: unknown[] = [];
const distancias: RaceDistance[] = ['400', '800', '1500', '5k', '10k', '21k'];
const exps: RunningProfile['experiencia'][] = ['empiezo', 'ocasional', 'regular'];
for (const distancia of distancias) for (const experiencia of exps)
  for (const minutosSemana of compacto ? [0, 45, 60, 120, 300] : [0, 20, 45, 60, 90, 150, 240, 360])
    for (const dias of [1, 2, 3, 4, 5, 6]) for (const minutos of compacto ? [30, 60, 120] : [30, 45, 60, 90, 120])
      for (const prueba of [undefined, 40, 12, 5]) for (const limit of compacto ? [false] : [false, true]) {
        const p: Profile = {
          ...blankProfile('ficticio', NOW), nombre: 'Ficticio', edad: 40, objetivo: 'carrera', experiencia: 'intermedio',
          dias, minutos, material: ['corporal', 'mancuernas'], limitaciones: limit ? ['rodilla'] : [],
          carrera: { distancia, experiencia, minutosSemana, fechaPrueba: prueba == null ? undefined : fecha(prueba) },
        };
        const r = generatePlan(p, NOW);
        if (!r.ok && compacto) throw new Error(r.motivo);
        if (!r.ok) { out.push({ entrada: { distancia, experiencia, minutosSemana, dias, minutos, prueba, limit }, error: r.motivo }); continue; }
        if (compacto) {
          // [distancia, experiencia, minutosSemana, dias, minutos, diasHastaPrueba, "dia:tipo:tipoCarrera:min;…"]
          out.push([distancia, experiencia, minutosSemana, dias, minutos, prueba ?? null,
            r.plan.sesiones.map((s) => `${s.dia}:${s.tipo}:${s.carrera?.tipo ?? ''}:${s.minutosEstimados}`).join(';')]);
          continue;
        }
        out.push({
          entrada: { distancia, experiencia, minutosSemana, dias, minutos, diasHastaPrueba: prueba ?? null, limitaciones: p.limitaciones },
          plan: { diasDescanso: r.plan.diasDescanso, sesiones: r.plan.sesiones.map((s) => ({ dia: s.dia, tipo: s.tipo, minutosEstimados: s.minutosEstimados, carrera: s.carrera ? { tipo: s.carrera.tipo, minutos: s.carrera.minutos } : undefined })) },
        });
      }
writeFileSync(process.argv[2], JSON.stringify(out));
console.log(out.length, 'planes');
