// Reglas puras de sincronización entre el navegador y la cuenta (sin red).
// Cada perfil (no de demostración) es una fila de public.atletas con su ProfileData en 'datos'.

import type { AppState, ProfileData } from '../domain/types';
import { validateProfileData } from '../storage/store';

export interface RemoteRow { id: string; datos: unknown; actualizado_en?: string }

/** Estado de sincronización guardado por cuenta (nunca se comparte entre cuentas). */
export interface SyncMeta {
  userId: string;
  /** perfil local → fila remota */
  rowIds: Record<string, string>;
  /** huella del último contenido sincronizado de cada perfil */
  hashes: Record<string, string>;
}

export const emptyMeta = (userId: string): SyncMeta => ({ userId, rowIds: {}, hashes: {} });

/** Huella de 64 bits (dos FNV-1a de 32 bits). Solo para detectar cambios, no es criptográfica. */
export function hashText(s: string): string {
  let a = 0x811c9dc5, b = 0x01000193 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c ^ (i & 0xff), 0x05f5e0ff) >>> 0;
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}
export const hashProfile = (pd: ProfileData) => hashText(JSON.stringify(pd));

const syncable = (pd: ProfileData | undefined): pd is ProfileData => !!pd && !pd.profile.demo;
export const remoteName = (pd: ProfileData) => (pd.profile.nombre || '').trim().slice(0, 40) || 'Perfil';

export interface MergeResult { state: AppState; meta: SyncMeta; descartadas: number; cambios: number }

/**
 * Integra las filas de la cuenta en el estado local.
 * - Perfil en ambos lados: gana la cuenta, salvo que el local tenga cambios sin subir.
 * - Perfil solo en la cuenta: se añade.
 * - Perfil solo en local que ya estuvo sincronizado: se borró en otro dispositivo → se quita (si no hay cambios locales).
 * - Perfil solo en local nunca sincronizado: se mantiene (se subirá).
 * - Filas con datos no válidos o de demostración: se ignoran.
 */
export function mergeRemote(local: AppState, rows: RemoteRow[], meta: SyncMeta): MergeResult {
  const perfiles = { ...local.perfiles };
  const next: SyncMeta = { userId: meta.userId, rowIds: {}, hashes: { ...meta.hashes } };
  let descartadas = 0, cambios = 0;
  const vistos = new Set<string>();

  for (const row of rows) {
    if (validateProfileData(row.datos, 'remoto').length) { descartadas++; continue; }
    const pd = row.datos as ProfileData;
    if (pd.profile.demo) { descartadas++; continue; }
    const pid = pd.profile.id;
    if (vistos.has(pid)) { descartadas++; continue; }
    vistos.add(pid);
    next.rowIds[pid] = row.id;
    const loc = perfiles[pid];
    const h = hashProfile(pd);
    const localDirty = !!loc && hashProfile(loc) !== meta.hashes[pid];
    if (loc && localDirty) continue; // se conserva el local y se subirá
    if (!loc || hashProfile(loc) !== h) cambios++;
    perfiles[pid] = pd;
    next.hashes[pid] = h;
  }

  for (const [pid, pd] of Object.entries(local.perfiles)) {
    if (!syncable(pd) || vistos.has(pid)) continue;
    const wasSynced = pid in meta.rowIds;
    const dirty = hashProfile(pd) !== meta.hashes[pid];
    if (wasSynced && !dirty) { delete perfiles[pid]; delete next.hashes[pid]; cambios++; }
    else delete next.hashes[pid]; // pendiente de subir como perfil nuevo
  }
  for (const pid of Object.keys(next.hashes)) if (!(pid in perfiles)) delete next.hashes[pid];

  let activeProfileId = local.activeProfileId;
  if (!activeProfileId || !perfiles[activeProfileId]) {
    activeProfileId = Object.values(perfiles).find(syncable)?.profile.id ?? Object.keys(perfiles)[0] ?? null;
  }
  return { state: { ...local, perfiles, activeProfileId }, meta: next, descartadas, cambios };
}

export interface PushPlan {
  upserts: { pid: string; rowId?: string; nombre: string; datos: ProfileData; hash: string }[];
  deletes: { pid: string; rowId: string }[];
}

/** Qué hay que subir o borrar en la cuenta para que coincida con el estado local. */
export function pushPlan(state: AppState, meta: SyncMeta): PushPlan {
  const plan: PushPlan = { upserts: [], deletes: [] };
  for (const [pid, pd] of Object.entries(state.perfiles)) {
    if (!syncable(pd)) continue;
    const h = hashProfile(pd);
    if (h !== meta.hashes[pid] || !meta.rowIds[pid]) plan.upserts.push({ pid, rowId: meta.rowIds[pid], nombre: remoteName(pd), datos: pd, hash: h });
  }
  for (const [pid, rowId] of Object.entries(meta.rowIds)) {
    if (!syncable(state.perfiles[pid])) plan.deletes.push({ pid, rowId });
  }
  return plan;
}

/** Perfiles reales (no demo) guardados en el navegador. */
export const localRealProfiles = (s: AppState) => Object.values(s.perfiles).filter(syncable);
