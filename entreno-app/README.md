# Menarguez Fit IA — módulo de entrenamiento (v0.2)

Aplicación web para crear programas personalizados de musculación y registrar la evolución.
Menarguez-IA-Solutions | Ignacio Menárguez Fernández

## Qué incluye

- Evaluación inicial en dos fases con progreso, vuelta atrás y respuestas guardadas.
- Resumen editable del perfil antes de generar el plan.
- Planificador por reglas (sin IA ni claves): reparto por días, material, limitaciones, tiempo, experiencia y recuperación. Mismo perfil, mismo plan. El plan se valida antes de mostrarse.
- Catálogo de 59 ejercicios con ficha completa, filtros, buscador y favoritos.
- Modo entrenamiento: registro de kg y repeticiones por serie, temporizador de descanso (pausa y reinicio), último registro, sustitución por alternativas compatibles, esfuerzo, molestias y técnica. Sobrevive a recargas.
- Sesiones completadas, parciales y canceladas. Abrir una sesión no cuenta como realizada.
- Progreso: revisión semanal con sugerencias justificadas (aceptar o mantener), calendario, cumplimiento, evolución por ejercicio, medidas opcionales e historial.
- Nutrición opcional: menú semanal con cantidades orientativas (en crudo, cocido o tal cual), sustituciones y lista de compra. Sin kcal por plato. Ante riesgo de TCA, condición clínica o embarazo, solo hábitos generales.
- Datos solo en el navegador: varios perfiles separados, perfil de demostración identificado, copia JSON validada, CSV de registros y borrado con confirmación.
- Uso exclusivo para mayores de 18 años.

## Estructura

```
src/domain/    reglas puras: planner, progression, session, nutrition, types
src/data/      catálogo de ejercicios y perfil de demostración
src/storage/   persistencia local (interfaz Repository), validación, exportación
src/screens/   11 pantallas
src/ui/        componentes y estilos
tests/         domain.test.ts (Vitest) y e2e.mjs (Playwright, móvil)
scripts/       assemble.mjs: genera un único HTML autocontenido
```

La interfaz `Repository` permite sustituir el almacenamiento local por un backend con autenticación sin tocar las pantallas.

## Comandos

```bash
npm install
npm test            # reglas de planificación, progresión, sesión, persistencia y nutrición
npm run typecheck
npm run build       # → dist/entreno/index.html (despliegue) y dist/artifact.html
node tests/e2e.mjs  # recorrido completo en Chromium (requiere Playwright)
```

React 18.3.1 se carga desde cdnjs; el resto va en el propio HTML.

## Despliegue en Menarguez Fit AI

El resultado es un único fichero estático: `dist/entreno/index.html` → `public/entreno/index.html` del repositorio.
Se sirve en `/entreno/` y no modifica ningún fichero existente de la app ni de la API.

## Pendiente

- Demostraciones visuales con licencia verificada (hoy se indica que faltan).
- Cuenta de usuario y sincronización (requiere revisión legal antes de guardar datos de salud en servidor).
- Importación de relojes (GPX/TCX/FIT, Strava, Garmin) e informes HTML corporativos.
- Generación con IA (Claude) desde servidor, con validación de la salida.
- Base de composición de alimentos verificada para mostrar kcal y macros por plato.
