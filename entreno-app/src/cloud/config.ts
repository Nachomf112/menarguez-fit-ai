// Conexión con Supabase (proyecto de PRUEBAS fitia-dev).
// La URL y la clave publicable están pensadas para ir en el navegador: la seguridad la dan
// las políticas RLS de la base de datos, no el secreto de esta clave.
// NUNCA poner aquí la clave secreta (sb_secret_...) ni la service_role.

export const SUPABASE_URL = 'https://yosanpfxozkgspeftlgb.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_PlnuoNIDMOsIKvazXL3szw_ndETA4Ft';

/**
 * Clave PÚBLICA del widget de Cloudflare Turnstile (CAPTCHA). Vacía = sin CAPTCHA.
 * La clave secreta va solo en Supabase → Authentication → Attack Protection, nunca aquí.
 * Activar primero aquí (y desplegar) y después en Supabase; si se hace al revés, nadie podrá entrar.
 */
export const TURNSTILE_SITE_KEY = '0x4AAAAAAF6R6Rv18RVRBkRY';

/** Versión de los textos de términos y consentimiento. Cambiarla obliga a aceptar de nuevo. */
export const CONSENT_VERSION = '2026-11';

/** La cuenta solo se activa en el entorno de pruebas (rama desarrollo) y en local. */
const ALLOWED_HOSTS = [
  /^menarguez-fit-ai-git-desarrollo-nachos-projects-9fab1a83\.vercel\.app$/,
  /^menarguez-fit-[a-z0-9]+-nachos-projects-9fab1a83\.vercel\.app$/,
  /^localhost$/,
  /^127\.0\.0\.1$/,
];

export function cloudEnabled(host = typeof location !== 'undefined' ? location.hostname : ''): boolean {
  return ALLOWED_HOSTS.some((re) => re.test(host));
}

/** Requisitos de contraseña: los mismos que en Supabase → Authentication → Email. */
export function passwordProblems(pw: string): string[] {
  const p: string[] = [];
  if (pw.length < 12) p.push('al menos 12 caracteres');
  if (!/[a-z]/.test(pw)) p.push('una minúscula');
  if (!/[A-Z]/.test(pw)) p.push('una mayúscula');
  if (!/[0-9]/.test(pw)) p.push('un número');
  if (!/[^A-Za-z0-9]/.test(pw)) p.push('un símbolo');
  if (pw.length > 72) p.push('como máximo 72 caracteres');
  return p;
}

export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim()) && s.length <= 254;
