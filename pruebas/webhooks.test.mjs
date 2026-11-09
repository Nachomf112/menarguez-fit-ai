// Pruebas de entrada de los webhooks (sin red). Uso: node --test pruebas/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { limpiarTexto } from '../api/_lib/texto.js';
import { extractTallyFields, verificarFirmaTally } from '../api/tally-webhook.js';
import { verificarFirmaStripe } from '../api/stripe-webhook-fit.js';

test('limpiarTexto quita HTML, controles y limita la longitud', () => {
  assert.equal(limpiarTexto('<img src=x onerror=alert(1)>Ana'), 'img src=x onerror=alert(1)Ana');
  assert.equal(limpiarTexto('  Ana\n\tMaría\u200B  '), 'Ana María');
  assert.equal(limpiarTexto('x'.repeat(500), 80).length, 80);
  assert.equal(limpiarTexto(null), '');
  assert.equal(limpiarTexto('José Ñúñez-O\'Brien'), "José Ñúñez-O'Brien");
});

test('Tally: el nombre llega limpio y acotado', () => {
  const f = extractTallyFields({ data: { fields: [
    { label: 'Nombre', value: '<script>robar()</script>Ana' },
    { label: 'Email', value: 'ana@example.com' },
    { label: 'Teléfono', value: '600 000 000' },
    { label: '¿Qué deseas conseguir?', value: ['op1'], options: [{ id: 'op1', text: 'Perder <b>peso</b>' }] },
  ] } });
  assert.equal(f.nombre, 'scriptrobar()/scriptAna');
  assert.ok(!/[<>]/.test(JSON.stringify(f)));
  assert.equal(f.email, 'ana@example.com');
  assert.equal(f.objetivo, 'Perder bpeso/b');
});

test('las firmas de Tally y Stripe siguen funcionando', () => {
  const body = Buffer.from('{"a":1}');
  const tallySig = crypto.createHmac('sha256', 'secreto').update(body).digest('base64');
  assert.deepEqual(verificarFirmaTally(body, tallySig, 'secreto'), { a: 1 });
  assert.throws(() => verificarFirmaTally(body, tallySig, 'otro'));
  const t = Math.floor(Date.now() / 1000);
  const v1 = crypto.createHmac('sha256', 'whsec').update(`${t}.`).update(body).digest('hex');
  assert.doesNotThrow(() => verificarFirmaStripe(body, `t=${t},v1=${v1}`, 'whsec'));
  assert.throws(() => verificarFirmaStripe(body, `t=${t},v1=${'0'.repeat(64)}`, 'whsec'));
});
