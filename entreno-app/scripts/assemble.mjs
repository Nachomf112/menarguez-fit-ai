// Genera, a partir de dist/app.js y dist/app.css:
//  - dist/entreno/index.html + app.<hash>.js + app.<hash>.css + fonts/*.woff2
//    → se copia tal cual a public/entreno/ (fit.menarguez-ia.com/entreno/).
//    Sin scripts ni estilos en línea ni recursos de terceros: compatible con la CSP de vercel.json.
//  - dist/artifact.html → un solo archivo con todo en línea (para publicarlo como Artifact).
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const js = readFileSync('dist/app.js', 'utf8');
const css = readFileSync('dist/app.css', 'utf8');
const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 10);

// Fuentes Barlow y Barlow Condensed (SIL OFL 1.1), alojadas en la propia app.
const FACES = [
  ['Barlow', 'barlow', 400], ['Barlow', 'barlow', 500], ['Barlow', 'barlow', 600], ['Barlow', 'barlow', 700],
  ['Barlow Condensed', 'barlow-condensed', 600], ['Barlow Condensed', 'barlow-condensed', 700],
];
const fontFile = (pkg, w) => `node_modules/@fontsource/${pkg}/files/${pkg}-latin-${w}-normal.woff2`;
const face = (fam, w, src) => `@font-face{font-family:'${fam}';font-style:normal;font-display:swap;font-weight:${w};src:url(${src}) format('woff2')}`;

mkdirSync('dist/entreno/fonts', { recursive: true });
const fontCss = FACES.map(([fam, pkg, w]) => {
  const name = `${pkg}-${w}.woff2`;
  copyFileSync(fontFile(pkg, w), `dist/entreno/fonts/${name}`);
  return face(fam, w, `fonts/${name}`);
}).join('\n');
const fontCssInline = FACES.map(([fam, pkg, w]) => face(fam, w, `data:font/woff2;base64,${readFileSync(fontFile(pkg, w)).toString('base64')}`)).join('\n');

const cssOut = `${fontCss}\n${css}`;
const jsName = `app.${hash(js)}.js`;
const cssName = `app.${hash(cssOut)}.css`;
writeFileSync(`dist/entreno/${jsName}`, js);
writeFileSync(`dist/entreno/${cssName}`, cssOut);

const meta = `<title>Menarguez Fit IA</title>
<meta name="description" content="Programas personalizados de entrenamiento y seguimiento. Menarguez-IA-Solutions.">`;
const full = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#000000">
<meta name="robots" content="noindex">
<meta name="referrer" content="strict-origin-when-cross-origin">
${meta}
<link rel="stylesheet" href="${cssName}">
<script src="${jsName}" defer></script>
</head>
<body>
<div id="root"></div>
<noscript>Menarguez Fit IA necesita JavaScript.</noscript>
</body>
</html>
`;
writeFileSync('dist/entreno/index.html', full);

const artifact = `${meta}
<meta name="claude:viewport-fit-sides" content="cover">
<style>${fontCssInline}\n${css}</style>
<div id="root"></div>
<script>${js.replace(/<\/script/gi, '<\\/script')}</script>
`;
writeFileSync('dist/artifact.html', artifact);
console.log('OK', jsName, (js.length / 1024).toFixed(0) + ' KB', cssName, (cssOut.length / 1024).toFixed(0) + ' KB');
