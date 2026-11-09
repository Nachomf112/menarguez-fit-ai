// Cuenta de usuario y sincronización con Supabase.
// Principios: el navegador sigue funcionando sin cuenta; los datos solo suben con consentimiento
// explícito de datos de salud; nunca se mezclan datos de cuentas distintas en el mismo navegador.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { AppState, ProfileData } from '../domain/types';
import { emptyState, exportBackup } from '../storage/store';
import { CONSENT_VERSION, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, cloudEnabled } from './config';
import { emptyMeta, localRealProfiles, mergeRemote, pushPlan, type RemoteRow, type SyncMeta } from './merge';

export type Phase =
  | 'off'                 // cuenta no disponible en este dominio
  | 'cargando'
  | 'fuera'               // sin sesión
  | 'mfa'                 // falta el código de la app de autenticación
  | 'recuperar'           // ha entrado con el enlace de recuperación: debe poner contraseña nueva
  | 'terminos'            // falta aceptar los términos vigentes
  | 'sin_consentimiento'  // cuenta activa, sin permiso para guardar datos de salud
  | 'decidir'             // hay datos en el navegador que no son de esta cuenta
  | 'activa';             // sincronizando

export type SyncStatus = 'ok' | 'pendiente' | 'subiendo' | 'error';
export interface Result { ok: boolean; msg: string }
export interface Factor { id: string; nombre: string; creado: string }

export interface CloudApi {
  enabled: boolean;
  phase: Phase;
  email: string | null;
  status: SyncStatus;
  error: string | null;
  lastSync: string | null;
  aviso: string | null;
  decision: 'otra_cuenta' | 'locales' | null;
  factores: Factor[];
  signUp(email: string, password: string): Promise<Result>;
  signIn(email: string, password: string): Promise<Result>;
  sendReset(email: string): Promise<Result>;
  setNewPassword(password: string): Promise<Result>;
  changePassword(password: string): Promise<Result>;
  verifyMfa(code: string): Promise<Result>;
  acceptTerms(): Promise<Result>;
  giveConsent(): Promise<Result>;
  withdrawConsent(): Promise<Result>;
  deleteCloudData(): Promise<Result>;
  resolve(choice: 'subir' | 'reemplazar' | 'cancelar'): Promise<Result>;
  signOut(clearLocal: boolean): Promise<Result>;
  deleteAccount(clearLocal: boolean): Promise<Result>;
  syncNow(): Promise<Result>;
  exportCloud(): Promise<{ ok: boolean; msg: string; text?: string }>;
  mfaEnroll(): Promise<{ ok: boolean; msg: string; factorId?: string; qr?: string; secret?: string }>;
  mfaConfirm(factorId: string, code: string): Promise<Result>;
  mfaRemove(factorId: string): Promise<Result>;
  clearAviso(): void;
}

export const CloudCtx = createContext<CloudApi>(null as unknown as CloudApi);
export const useCloudApi = () => useContext(CloudCtx);

const K_META = 'menarguez-fit-ia:nube:';
const K_LAST = 'menarguez-fit-ia:nube:ultimo';
const K_TERMS = 'menarguez-fit-ia:terminos-aceptados';
const MAX_DATOS = 1_900_000;

const ls = {
  get(k: string): string | null { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } },
  del(k: string) { try { localStorage.removeItem(k); } catch { /* sin almacenamiento */ } },
};
function loadMeta(userId: string): SyncMeta {
  try {
    const m = JSON.parse(ls.get(K_META + userId) ?? 'null');
    if (m && m.userId === userId && m.rowIds && m.hashes) return m as SyncMeta;
  } catch { /* meta dañada: se empieza de cero */ }
  return emptyMeta(userId);
}
const saveMeta = (m: SyncMeta) => ls.set(K_META + m.userId, JSON.stringify(m));

let client: SupabaseClient | null = null;
function sb(): SupabaseClient {
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { flowType: 'pkce', storageKey: 'menarguez-fit-ia:auth', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  return client;
}

const appUrl = () => `${location.origin}${location.pathname}`;

/** Traduce los errores de Supabase a mensajes claros, sin revelar si un correo existe. */
export function authMessage(e: { code?: string; message?: string; status?: number } | null | undefined): string {
  const code = e?.code ?? '';
  const m = (e?.message ?? '').toLowerCase();
  if (code === 'invalid_credentials' || m.includes('invalid login')) return 'Correo o contraseña incorrectos.';
  if (code === 'email_not_confirmed' || m.includes('not confirmed')) return 'Todavía no has confirmado tu correo. Abre el enlace que te enviamos.';
  if (code.startsWith('over_') || e?.status === 429 || m.includes('rate limit')) return 'Demasiados intentos. Espera unos minutos y vuelve a probar.';
  if (code === 'weak_password' || m.includes('weak')) return 'La contraseña no cumple los requisitos o aparece en filtraciones conocidas.';
  if (code === 'same_password') return 'La contraseña nueva debe ser distinta de la actual.';
  if (code === 'mfa_verification_failed' || m.includes('invalid totp')) return 'Código incorrecto o caducado.';
  if (code === 'reauthentication_needed' || code === 'session_not_found') return 'Por seguridad, vuelve a iniciar sesión e inténtalo de nuevo.';
  if (code === 'signup_disabled') return 'El registro está cerrado en este momento.';
  if (m.includes('failed to fetch') || m.includes('network')) return 'No hay conexión con el servidor. Comprueba tu conexión.';
  if (m.includes('límite de 5 perfiles')) return 'Tu cuenta ya tiene 5 perfiles, que es el máximo.';
  if (m.includes('row-level security')) return 'El servidor ha rechazado el guardado: revisa el consentimiento de datos de salud.';
  return 'No se ha podido completar la operación. Inténtalo de nuevo.';
}

const ok = (msg = ''): Result => ({ ok: true, msg });
const ko = (e: unknown): Result => ({ ok: false, msg: authMessage(e as { code?: string; message?: string }) });

export function useCloud(state: AppState, setState: (fn: (s: AppState) => AppState) => void): CloudApi {
  const enabled = useMemo(() => cloudEnabled(), []);
  const [phase, setPhase] = useState<Phase>(enabled ? 'cargando' : 'off');
  const [email, setEmail] = useState<string | null>(null);
  const [status, setStatus] = useState<SyncStatus>('ok');
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [decision, setDecision] = useState<CloudApi['decision']>(null);
  const [factores, setFactores] = useState<Factor[]>([]);

  const stateRef = useRef(state); stateRef.current = state;
  const phaseRef = useRef(phase); phaseRef.current = phase;
  const userRef = useRef<string | null>(null);
  const metaRef = useRef<SyncMeta | null>(null);
  const recovery = useRef(false);
  const pushing = useRef<Promise<Result> | null>(null);
  const again = useRef(false);

  const refreshFactors = useCallback(async () => {
    const { data } = await sb().auth.mfa.listFactors();
    setFactores((data?.totp ?? []).map((f) => ({ id: f.id, nombre: !f.friendly_name || /^App \d{4}-/.test(f.friendly_name) ? 'App de autenticación' : f.friendly_name, creado: f.created_at })));
  }, []);

  // ── Subida de cambios ──
  const push = useCallback(async (): Promise<Result> => {
    if (pushing.current) { again.current = true; return pushing.current; }
    const run = async (): Promise<Result> => {
      const meta = metaRef.current;
      if (!meta || phaseRef.current !== 'activa' || meta.userId !== userRef.current) return ok();
      const plan = pushPlan(stateRef.current, meta);
      if (!plan.upserts.length && !plan.deletes.length) { setStatus('ok'); return ok(); }
      setStatus('subiendo');
      try {
        for (const u of plan.upserts) {
          if (JSON.stringify(u.datos).length > MAX_DATOS) throw new Error(`El perfil "${u.nombre}" es demasiado grande para sincronizar.`);
          let rowId = u.rowId;
          if (rowId) {
            const { data, error } = await sb().from('atletas').update({ nombre: u.nombre, datos: u.datos }).eq('id', rowId).select('id');
            if (error) throw error;
            if (!data?.length) rowId = undefined; // la fila ya no existe: se vuelve a crear
          }
          if (!rowId) {
            const { data, error } = await sb().from('atletas').insert({ nombre: u.nombre, datos: u.datos }).select('id').single();
            if (error) throw error;
            rowId = (data as { id: string }).id;
          }
          if (metaRef.current?.userId !== meta.userId) return ok(); // la sesión cambió durante la subida
          meta.rowIds[u.pid] = rowId; meta.hashes[u.pid] = u.hash; saveMeta(meta);
        }
        for (const d of plan.deletes) {
          const { error } = await sb().from('atletas').delete().eq('id', d.rowId);
          if (error) throw error;
          delete meta.rowIds[d.pid]; delete meta.hashes[d.pid]; saveMeta(meta);
        }
        setStatus('ok'); setError(null); setLastSync(new Date().toISOString());
        return ok('Sincronizado.');
      } catch (e) {
        const msg = e instanceof Error && e.message.startsWith('El perfil') ? e.message : authMessage(e as { message?: string });
        setStatus('error'); setError(msg);
        return { ok: false, msg };
      }
    };
    pushing.current = run().finally(() => { pushing.current = null; });
    const r = await pushing.current;
    if (again.current) { again.current = false; return push(); }
    return r;
  }, []);

  // ── Descarga e integración ──
  const startSync = useCallback(async (): Promise<Result> => {
    const uid = userRef.current;
    if (!uid) return { ok: false, msg: 'Sesión no válida.' };
    const { data, error } = await sb().from('atletas').select('id, datos, actualizado_en').order('creado_en');
    if (error) { setStatus('error'); setError(authMessage(error)); return ko(error); }
    const meta = loadMeta(uid);
    const r = mergeRemote(stateRef.current, (data ?? []) as RemoteRow[], meta);
    metaRef.current = r.meta; saveMeta(r.meta);
    stateRef.current = r.state;
    setState(() => r.state);
    ls.set(K_LAST, uid);
    setDecision(null);
    setPhase('activa'); phaseRef.current = 'activa';
    if (r.descartadas) setAviso(`${r.descartadas} perfil(es) de la cuenta tenían datos no válidos y no se han cargado.`);
    const p = await push();
    if (p.ok) setLastSync(new Date().toISOString());
    return p.ok ? ok('Datos sincronizados.') : p;
  }, [push, setState]);

  // ── Qué falta tras iniciar sesión ──
  const afterAuth = useCallback(async () => {
    const auth = sb().auth;
    const { data: { user } } = await auth.getUser();
    if (!user) { userRef.current = null; metaRef.current = null; setEmail(null); setPhase('fuera'); return; }
    if (userRef.current && userRef.current !== user.id) metaRef.current = null;
    userRef.current = user.id; setEmail(user.email ?? null);

    const { data: aal } = await auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal && aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') { setPhase('mfa'); return; }
    await refreshFactors().catch(() => undefined);
    if (recovery.current) { setPhase('recuperar'); return; }

    const { data: cons, error } = await sb().from('consentimientos').select('tipo, version, aceptado').order('creado_en', { ascending: false }).order('id', { ascending: false });
    if (error) { setError(authMessage(error)); setPhase('sin_consentimiento'); return; }
    const rows = (cons ?? []) as { tipo: string; version: string; aceptado: boolean }[];
    const terms = rows.find((c) => c.tipo === 'terminos');
    if (!terms || !terms.aceptado || terms.version !== CONSENT_VERSION) {
      const pre = ls.get(K_TERMS);
      if (pre && pre === `${(user.email ?? '').toLowerCase()}|${CONSENT_VERSION}`) {
        const { error: e2 } = await sb().from('consentimientos').insert({ tipo: 'terminos', version: CONSENT_VERSION, aceptado: true });
        if (!e2) ls.del(K_TERMS);
        else { setPhase('terminos'); return; }
      } else { setPhase('terminos'); return; }
    }
    const salud = rows.find((c) => c.tipo === 'datos_salud');
    if (!salud?.aceptado) { metaRef.current = null; setPhase('sin_consentimiento'); return; }

    const last = ls.get(K_LAST);
    const reales = localRealProfiles(stateRef.current).length;
    if (reales > 0 && last !== user.id) { setDecision(last ? 'otra_cuenta' : 'locales'); setPhase('decidir'); return; }
    await startSync();
  }, [refreshFactors, startSync]);

  // ── Arranque y eventos de sesión ──
  useEffect(() => {
    if (!enabled) return;
    const params = new URLSearchParams(location.search);
    const hashParams = new URLSearchParams(location.hash.replace(/^#/, ''));
    const errDesc = params.get('error_description') || hashParams.get('error_description');
    if (params.get('recuperar') === '1') recovery.current = true;
    if (errDesc) setAviso(/expired|invalid/i.test(errDesc) ? 'El enlace ha caducado o ya se usó. Solicita uno nuevo.' : 'No se ha podido validar el enlace.');

    const { data: sub } = sb().auth.onAuthStateChange((event, session) => {
      // No se llama a Supabase dentro del callback (recomendación de supabase-js): se difiere.
      if (event === 'PASSWORD_RECOVERY') recovery.current = true;
      if (event === 'SIGNED_OUT') {
        userRef.current = null; metaRef.current = null; setEmail(null); setFactores([]); setPhase('fuera'); return;
      }
      // SIGNED_IN también se emite al volver a la pestaña: si ya es la misma cuenta activa, no se repite nada.
      if (event === 'SIGNED_IN' && session?.user.id && session.user.id === userRef.current && phaseRef.current === 'activa') return;
      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY') {
        setTimeout(() => {
          afterAuth().catch((e) => { setError(authMessage(e)); setPhase((p) => (p === 'cargando' ? 'fuera' : p)); })
            .finally(() => {
              // Limpia ?code=, ?recuperar= y errores de la barra de direcciones
              if (params.has('code') || params.has('recuperar') || errDesc) {
                try { history.replaceState(null, '', `${location.pathname}${hashParams.has('error_description') ? '' : location.hash}`); } catch { /* sandbox */ }
              }
            });
        }, 0);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [enabled, afterAuth]);

  // ── Subida automática 1,2 s después de cada cambio ──
  useEffect(() => {
    if (phase !== 'activa' || !metaRef.current) return;
    const plan = pushPlan(state, metaRef.current);
    if (!plan.upserts.length && !plan.deletes.length) return;
    setStatus('pendiente');
    const t = setTimeout(() => { void push(); }, 1200);
    return () => clearTimeout(t);
  }, [state, phase, push]);

  // ── Acciones ──
  const signUp = useCallback(async (mail: string, password: string): Promise<Result> => {
    const e = mail.trim().toLowerCase();
    const { error } = await sb().auth.signUp({ email: e, password, options: { emailRedirectTo: appUrl() } });
    if (error) return ko(error);
    ls.set(K_TERMS, `${e}|${CONSENT_VERSION}`);
    return ok('Si el correo es válido, recibirás un enlace para confirmar la cuenta. Ábrelo en este mismo navegador.');
  }, []);

  const signIn = useCallback(async (mail: string, password: string): Promise<Result> => {
    const { error } = await sb().auth.signInWithPassword({ email: mail.trim().toLowerCase(), password });
    if (error) return ko(error);
    setAviso(null);
    return ok();
  }, []);

  const sendReset = useCallback(async (mail: string): Promise<Result> => {
    const { error } = await sb().auth.resetPasswordForEmail(mail.trim().toLowerCase(), { redirectTo: `${appUrl()}?recuperar=1` });
    if (error && (error.status === 429 || error.code?.startsWith('over_'))) return ko(error);
    return ok('Si existe una cuenta con ese correo, recibirás un enlace para crear una contraseña nueva. Ábrelo en este mismo navegador.');
  }, []);

  const setNewPassword = useCallback(async (password: string): Promise<Result> => {
    const { error } = await sb().auth.updateUser({ password });
    if (error) return ko(error);
    recovery.current = false;
    await afterAuth();
    return ok('Contraseña actualizada.');
  }, [afterAuth]);

  const changePassword = useCallback(async (password: string): Promise<Result> => {
    const { error } = await sb().auth.updateUser({ password });
    return error ? ko(error) : ok('Contraseña actualizada.');
  }, []);

  const verifyMfa = useCallback(async (code: string): Promise<Result> => {
    const { data } = await sb().auth.mfa.listFactors();
    const f = data?.totp?.[0];
    if (!f) return { ok: false, msg: 'No hay ninguna app de autenticación configurada.' };
    const { error } = await sb().auth.mfa.challengeAndVerify({ factorId: f.id, code: code.trim() });
    if (error) return ko(error);
    await afterAuth();
    return ok();
  }, [afterAuth]);

  const insertConsent = async (tipo: 'terminos' | 'datos_salud', aceptado: boolean) =>
    sb().from('consentimientos').insert({ tipo, version: CONSENT_VERSION, aceptado });

  const acceptTerms = useCallback(async (): Promise<Result> => {
    const { error } = await insertConsent('terminos', true);
    if (error) return ko(error);
    await afterAuth();
    return ok();
  }, [afterAuth]);

  const giveConsent = useCallback(async (): Promise<Result> => {
    const { error } = await insertConsent('datos_salud', true);
    if (error) return ko(error);
    await afterAuth();
    return ok('Consentimiento registrado.');
  }, [afterAuth]);

  const withdrawConsent = useCallback(async (): Promise<Result> => {
    if (pushing.current) await pushing.current;
    const { error } = await insertConsent('datos_salud', false);
    if (error) return ko(error);
    metaRef.current = null; setStatus('ok');
    setPhase('sin_consentimiento');
    return ok('Consentimiento retirado. Ya no se guardan cambios en tu cuenta. Los datos que ya estaban siguen ahí hasta que los borres.');
  }, []);

  const deleteCloudData = useCallback(async (): Promise<Result> => {
    const uid = userRef.current;
    if (!uid) return { ok: false, msg: 'Sesión no válida.' };
    if (pushing.current) await pushing.current.catch(() => undefined);
    // Primero se deja de sincronizar (y se retira el consentimiento) para que nada vuelva a subirse.
    const wasActive = phaseRef.current === 'activa';
    metaRef.current = null;
    if (wasActive) {
      const { error: ec } = await insertConsent('datos_salud', false);
      if (ec) return ko(ec);
      setPhase('sin_consentimiento'); phaseRef.current = 'sin_consentimiento';
    }
    const { error } = await sb().from('atletas').delete().not('id', 'is', null);
    if (error) return ko(error);
    ls.del(K_META + uid);
    setStatus('ok');
    return ok('Datos de entrenamiento borrados de tu cuenta y sincronización desactivada. Los de este navegador se mantienen.');
  }, []);

  const resolve = useCallback(async (choice: 'subir' | 'reemplazar' | 'cancelar'): Promise<Result> => {
    if (choice === 'cancelar') {
      await sb().auth.signOut({ scope: 'local' });
      setDecision(null);
      setAviso('Sesión cerrada. Los datos de este navegador no se han tocado.');
      return ok('');
    }
    if (choice === 'reemplazar') {
      const keep = Object.fromEntries(Object.entries(stateRef.current.perfiles).filter(([, pd]) => pd.profile.demo));
      const s = { ...stateRef.current, perfiles: keep, activeProfileId: Object.keys(keep)[0] ?? null };
      stateRef.current = s; setState(() => s);
      if (userRef.current) ls.del(K_META + userRef.current);
    }
    return startSync();
  }, [setState, startSync]);

  const signOut = useCallback(async (clearLocal: boolean): Promise<Result> => {
    if (pushing.current) await pushing.current.catch(() => undefined);
    metaRef.current = null;
    setPhase('fuera'); phaseRef.current = 'fuera';
    await sb().auth.signOut({ scope: 'local' });
    if (clearLocal) { stateRef.current = emptyState(); setState(() => emptyState()); }
    const m = clearLocal ? 'Sesión cerrada y datos de este navegador borrados.' : 'Sesión cerrada. Los datos siguen en este navegador.';
    setAviso(m);
    return ok(m);
  }, [setState]);

  const deleteAccount = useCallback(async (clearLocal: boolean): Promise<Result> => {
    const uid = userRef.current;
    if (pushing.current) await pushing.current.catch(() => undefined);
    metaRef.current = null; setPhase('cargando');
    const { error } = await sb().rpc('eliminar_mi_cuenta');
    if (error) { await afterAuth(); return ko(error); }
    await sb().auth.signOut({ scope: 'local' }).catch(() => undefined);
    if (uid) { ls.del(K_META + uid); if (ls.get(K_LAST) === uid) ls.del(K_LAST); }
    if (clearLocal) { stateRef.current = emptyState(); setState(() => emptyState()); }
    userRef.current = null; setEmail(null); setFactores([]); setPhase('fuera');
    const m = `Cuenta eliminada junto con sus datos y consentimientos.${clearLocal ? ' También se han borrado los datos de este navegador.' : ''}`;
    setAviso(m);
    return ok(m);
  }, [afterAuth, setState]);

  const syncNow = useCallback(async (): Promise<Result> => {
    if (phaseRef.current !== 'activa') return { ok: false, msg: 'La sincronización no está activa.' };
    const p = await push();
    if (!p.ok) return p;
    return startSync();
  }, [push, startSync]);

  const exportCloud = useCallback(async () => {
    const { data, error } = await sb().from('atletas').select('id, datos');
    if (error) return { ok: false, msg: authMessage(error) };
    const perfiles: Record<string, ProfileData> = {};
    for (const r of (data ?? []) as RemoteRow[]) {
      const pd = r.datos as ProfileData;
      if (pd?.profile?.id) perfiles[pd.profile.id] = pd;
    }
    const s: AppState = { ...emptyState(), perfiles, activeProfileId: Object.keys(perfiles)[0] ?? null };
    return { ok: true, msg: `${Object.keys(perfiles).length} perfil(es) en tu cuenta.`, text: exportBackup(s) };
  }, []);

  const mfaEnroll = useCallback(async () => {
    const auth = sb().auth;
    const { data: list } = await auth.mfa.listFactors();
    for (const f of list?.all ?? []) if (f.status === 'unverified') await auth.mfa.unenroll({ factorId: f.id });
    const { data, error } = await auth.mfa.enroll({ factorType: 'totp', friendlyName: `App de autenticación · ${new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}` });
    if (error || !data) return { ok: false, msg: authMessage(error) };
    return { ok: true, msg: '', factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
  }, []);

  const mfaConfirm = useCallback(async (factorId: string, code: string): Promise<Result> => {
    const { error } = await sb().auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
    if (error) return ko(error);
    await refreshFactors();
    return ok('Verificación en dos pasos activada.');
  }, [refreshFactors]);

  const mfaRemove = useCallback(async (factorId: string): Promise<Result> => {
    const { error } = await sb().auth.mfa.unenroll({ factorId });
    if (error) return ko(error);
    await refreshFactors();
    return ok('Verificación en dos pasos desactivada.');
  }, [refreshFactors]);

  return {
    enabled, phase, email, status, error, lastSync, aviso, decision, factores,
    signUp, signIn, sendReset, setNewPassword, changePassword, verifyMfa, acceptTerms, giveConsent, withdrawConsent,
    deleteCloudData, resolve, signOut, deleteAccount, syncNow, exportCloud, mfaEnroll, mfaConfirm, mfaRemove,
    clearAviso: () => setAviso(null),
  };
}
