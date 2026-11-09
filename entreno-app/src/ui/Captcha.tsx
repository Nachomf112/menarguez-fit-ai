// Widget de Cloudflare Turnstile (CAPTCHA). Solo se carga si hay clave pública configurada.
import { useEffect, useRef, useState } from 'react';
import { TURNSTILE_SITE_KEY } from '../cloud/config';

interface TurnstileApi {
  render(el: HTMLElement, opts: Record<string, unknown>): string;
  reset(id?: string): void;
  remove(id?: string): void;
}
declare global { interface Window { turnstile?: TurnstileApi } }

const SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let loading: Promise<void> | null = null;
function loadTurnstile(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = SRC; s.async = true;
      s.onload = () => resolve();
      s.onerror = () => { loading = null; reject(new Error('turnstile')); };
      document.head.appendChild(s);
    });
  }
  return loading;
}

export const captchaRequired = () => !!TURNSTILE_SITE_KEY;

/** Devuelve el token actual (o null), una función para pedir uno nuevo y el elemento a pintar. */
export function useCaptcha() {
  const box = useRef<HTMLDivElement>(null);
  const id = useRef<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;
    let alive = true;
    loadTurnstile().then(() => {
      if (!alive || !box.current || !window.turnstile) return;
      id.current = window.turnstile.render(box.current, {
        sitekey: TURNSTILE_SITE_KEY, theme: 'dark', language: 'es', appearance: 'always',
        callback: (t: string) => { setToken(t); setFailed(false); },
        'expired-callback': () => setToken(null),
        'error-callback': () => { setToken(null); setFailed(true); },
      });
    }).catch(() => alive && setFailed(true));
    return () => { alive = false; if (id.current) window.turnstile?.remove(id.current); id.current = null; };
  }, []);

  const reset = () => { setToken(null); if (id.current) window.turnstile?.reset(id.current); };
  const node = TURNSTILE_SITE_KEY ? (
    <div className="stack">
      <div ref={box} id="acc-captcha" />
      {failed && <p className="error">No se ha podido cargar la verificación anti-robots. Recarga la página.</p>}
    </div>
  ) : null;
  return { token: TURNSTILE_SITE_KEY ? token : undefined, ready: !TURNSTILE_SITE_KEY || !!token, reset, node };
}
