import { beforeEach, describe, expect, it } from 'vitest';
import { accesoRequerido, codigoGuardado, deviceId, olvidarAcceso, ultimoOk, validarAcceso } from '../src/acceso/acceso';

const mem = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, String(v)), removeItem: (k: string) => void mem.delete(k),
};
beforeEach(() => mem.clear());
const resp = (status: number, json: unknown) => (async () => new Response(JSON.stringify(json), { status })) as unknown as typeof fetch;

describe('acceso a /entreno con el código de Fit AI', () => {
  it('solo se exige en producción y en las versiones de pruebas', () => {
    expect(accesoRequerido('fit.menarguez-ia.com')).toBe(true);
    expect(accesoRequerido('menarguez-fit-ai-git-desarrollo-nachos-projects-9fab1a83.vercel.app')).toBe(true);
    expect(accesoRequerido('localhost')).toBe(false);
    expect(accesoRequerido('claude.ai')).toBe(false);
    expect(accesoRequerido('fit.menarguez-ia.com.evil.example')).toBe(false);
  });
  it('comparte el identificador de dispositivo con la app de nutrición y reutiliza su código', () => {
    mem.set('fitai_device', '0f8e2c1a-3b4d-4e5f-8a9b-0c1d2e3f4a5b');
    expect(deviceId()).toBe('0f8e2c1a-3b4d-4e5f-8a9b-0c1d2e3f4a5b');
    mem.clear();
    expect(deviceId()).toMatch(/^[A-Za-z0-9-]{32,64}$/);
    mem.set('fitai_user', JSON.stringify({ code: 'FIT-AAAA-BBBB', nombre: 'Ficticio' }));
    expect(codigoGuardado()).toBe('FIT-AAAA-BBBB');
  });
  it('envía solo código, dispositivo y navegador; guarda el código si es válido', async () => {
    let enviado: any = null;
    const f = (async (_url: string, init: RequestInit) => { enviado = JSON.parse(String(init.body)); return new Response(JSON.stringify({ valid: true, nombre: 'Ficticio' })); }) as unknown as typeof fetch;
    const r = await validarAcceso(' fit-aaaa-bbbb ', f);
    expect(r.ok).toBe(true);
    expect(Object.keys(enviado).sort()).toEqual(['code', 'dispositivo', 'userAgent']);
    expect(enviado.code).toBe('FIT-AAAA-BBBB');
    expect(codigoGuardado()).toBe('FIT-AAAA-BBBB');
    expect(ultimoOk()).toBeGreaterThan(0);
    olvidarAcceso();
    expect(codigoGuardado()).toBe('');
  });
  it('muestra el error del servidor y distingue la falta de conexión', async () => {
    const r1 = await validarAcceso('FIT-ZZZZ-9999', resp(200, { valid: false, error: 'Código no encontrado. Revisa que esté bien escrito.' }));
    expect(r1).toEqual({ ok: false, error: 'Código no encontrado. Revisa que esté bien escrito.' });
    const r2 = await validarAcceso('FIT-ZZZZ-9999', (async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch);
    expect(r2.ok).toBe(false);
    expect((r2 as any).sinRed).toBe(true);
    expect((await validarAcceso('FIT-ZZZZ-9999', resp(503, {}))) as any).toMatchObject({ ok: false, sinRed: true });
    expect((await validarAcceso('   ')).ok).toBe(false);
  });
});
