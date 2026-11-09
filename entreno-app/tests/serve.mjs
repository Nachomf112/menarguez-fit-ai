// Servidor estático para las pruebas e2e: sirve dist/entreno con las cabeceras de deploy/headers.json.
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const ROOT = 'dist/entreno';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.woff2': 'font/woff2' };
const conf = JSON.parse(readFileSync('deploy/headers.json', 'utf8'));
export const SECURITY_HEADERS = Object.fromEntries(conf.headers.map((h) => [h.key, h.value]));

export function serve(port) {
  return createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const rel = normalize(path === '/' ? '/index.html' : path).replace(/^(\.\.[/\\])+/, '');
    const file = join(ROOT, rel);
    if (!file.startsWith(ROOT) || !existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', ...SECURITY_HEADERS });
    res.end(readFileSync(file));
  }).listen(port);
}
