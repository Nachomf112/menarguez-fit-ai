// Genera dos salidas a partir de dist/app.js y dist/app.css:
//  - dist/entreno/index.html  → documento completo para servir en fit.menarguez-ia.com/entreno/
//  - dist/artifact.html       → mismo contenido sin envoltorio (para publicarlo como Artifact)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const js = readFileSync('dist/app.js', 'utf8').replace(/<\/script/gi, '<\\/script');
const css = readFileSync('dist/app.css', 'utf8');
const REACT = 'https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js';
const REACT_DOM = 'https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js';
const FONTS = 'https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=Barlow+Condensed:wght@600;700&display=swap';

const head = `<title>Menarguez Fit IA</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="description" content="Programas personalizados de musculación y seguimiento. Menarguez-IA-Solutions.">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<style>${css}</style>
`;
const body = `<div id="root"></div>
<noscript>Menarguez Fit IA necesita JavaScript.</noscript>
<script src="${REACT}" crossorigin="anonymous"></script>
<script src="${REACT_DOM}" crossorigin="anonymous"></script>
<script>${js}</script>
`;
const full = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#000000">
<meta name="robots" content="noindex">
${head}</head>
<body>
${body}</body>
</html>
`;
mkdirSync('dist/entreno', { recursive: true });
writeFileSync('dist/entreno/index.html', full);
writeFileSync('dist/artifact.html', head + body);
console.log('OK', (full.length / 1024).toFixed(1) + ' KB');
