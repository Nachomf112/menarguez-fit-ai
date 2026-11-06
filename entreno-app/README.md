# Menarguez Fit IA — módulo de entrenamiento (v0.4)

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
- Carrera: preparación de 400 m, 800 m, 1500 m, 5 km, 10 km y media maratón. Sesiones por esfuerzo percibido (rodaje, series, ritmo continuo, tirada larga, cuestas, ritmo de carrera y correr-caminar), fase según la fecha de la prueba, ritmos orientativos solo con marca real (Riegel) y comparación solo entre sesiones del mismo tipo.
- Nutrición opcional: menú semanal con cantidades orientativas (en crudo, cocido o tal cual), sustituciones y lista de compra. Sin kcal por plato. Ante riesgo de TCA, condición clínica o embarazo, solo hábitos generales.
- Cuenta de usuario opcional (Supabase, solo entorno de pruebas): registro con confirmación de correo, contraseña fuerte, recuperación, verificación en dos pasos (TOTP), términos y consentimiento explícito de datos de salud registrados de forma inmutable, sincronización de perfiles, exportación, borrado de datos y eliminación de la cuenta. Sin cuenta, todo sigue funcionando en el navegador.
- Datos en el navegador: varios perfiles separados, perfil de demostración identificado, copia JSON validada, CSV de registros y borrado con confirmación.
- Uso exclusivo para mayores de 18 años.

## Estructura

```
src/domain/    reglas puras: planner, progression, session, nutrition, types
src/data/      catálogo de ejercicios y perfil de demostración
src/storage/   persistencia local (interfaz Repository), validación, exportación
src/cloud/     cuenta y sincronización con Supabase (config, merge puro, useCloud)
supabase/      migraciones SQL (RLS) y consulta de verificación
src/screens/   11 pantallas
src/ui/        componentes y estilos
tests/         Vitest: domain, running, cloud, rls (Postgres 16 en WASM)
               Playwright: e2e.mjs (app) y e2e-cloud.mjs (cuenta con Supabase simulado)
scripts/       assemble.mjs: genera un único HTML autocontenido
```

La interfaz `Repository` permite sustituir el almacenamiento local por un backend con autenticación sin tocar las pantallas.

## Comandos

```bash
npm install
npm test            # reglas de planificación, progresión, sesión, persistencia y nutrición
npm run typecheck
npm run build       # → dist/entreno/index.html (despliegue) y dist/artifact.html
node tests/e2e.mjs        # recorrido completo en Chromium (requiere Playwright)
node tests/e2e-cloud.mjs  # cuenta y sincronización contra un Supabase simulado
```

React 18.3.1 se carga desde cdnjs; el resto va en el propio HTML.

## Despliegue en Menarguez Fit AI

El resultado es un único fichero estático: `dist/entreno/index.html` → `public/entreno/index.html` del repositorio.
Se sirve en `/entreno/` y no modifica ningún fichero existente de la app ni de la API.

## Cuenta y seguridad

- La cuenta solo se activa en la URL de la rama `desarrollo` y en `localhost` (`src/cloud/config.ts`). En `fit.menarguez-ia.com` no aparece.
- En el navegador solo va la clave publicable. Toda la protección está en RLS: cada usuario solo ve sus filas, `anon` no tiene permisos, sin consentimiento de salud no se puede escribir y, si el usuario activa TOTP, sus datos exigen sesión aal2.
- Migraciones: `supabase/migrations/0001_fitia_esquema.sql` y `0002_fitia_mfa.sql`. Comprobación: `supabase/verificar.sql`.
- Nunca se mezclan cuentas: si el navegador tiene perfiles de otra cuenta, se pregunta antes de sincronizar.

## Pendiente

- Demostraciones visuales con licencia verificada (hoy se indica que faltan).
- Antes de producción: revisión legal (RGPD, datos de salud), DPA de Supabase, proyecto Supabase de producción separado, SMTP propio, CAPTCHA (Turnstile), protección de contraseñas filtradas (plan Pro), cabeceras CSP para /entreno.
- Importación de relojes (GPX/TCX/FIT, Strava, Garmin) e informes HTML corporativos.
- Generación con IA (Claude) desde servidor, con validación de la salida.
- Base de composición de alimentos verificada para mostrar kcal y macros por plato.
