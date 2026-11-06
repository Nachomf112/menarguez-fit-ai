// Persistencia local. La interfaz Repository permite sustituirla más adelante por un backend
// con autenticación (p. ej. funciones de Vercel + base de datos) sin tocar las pantallas.

import { EXERCISE_BY_ID } from '../data/exercises';
import type { AppState, ProfileData, SessionLog } from '../domain/types';

export const STORAGE_KEY = 'menarguez-fit-ia:v1';

export interface Repository {
  load(): AppState;
  save(state: AppState): boolean;
  clear(): void;
}

export const emptyState = (): AppState => ({ version: 1, activeProfileId: null, perfiles: {}, borrador: null });

export class LocalRepository implements Repository {
  constructor(private storage: Storage | null = safeStorage()) {}
  load(): AppState {
    try {
      const raw = this.storage?.getItem(STORAGE_KEY);
      if (!raw) return emptyState();
      const parsed = JSON.parse(raw);
      const errs = validateState(parsed);
      return errs.length ? emptyState() : (parsed as AppState);
    } catch { return emptyState(); }
  }
  save(state: AppState): boolean {
    try { this.storage?.setItem(STORAGE_KEY, JSON.stringify(state)); return !!this.storage; } catch { return false; }
  }
  clear() { try { this.storage?.removeItem(STORAGE_KEY); } catch { /* sin almacenamiento */ } }
}

function safeStorage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const k = '__fitia_test__'; localStorage.setItem(k, '1'); localStorage.removeItem(k);
    return localStorage;
  } catch { return null; }
}

// ── Validación estructural (copias importadas y datos guardados) ──
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isStr = (v: unknown) => typeof v === 'string';
const isNum = (v: unknown) => typeof v === 'number' && Number.isFinite(v);

export function validateProfileData(d: unknown, path: string): string[] {
  const e: string[] = [];
  if (!isObj(d)) return [`${path}: no es un objeto.`];
  const p = d.profile;
  if (!isObj(p)) e.push(`${path}.profile falta.`);
  else {
    if (!isStr(p.id) || !p.id) e.push(`${path}.profile.id no válido.`);
    if (!isStr(p.nombre)) e.push(`${path}.profile.nombre no válido.`);
    if (!isNum(p.edad)) e.push(`${path}.profile.edad no válida.`);
    if (typeof p.demo !== 'boolean') e.push(`${path}.profile.demo no válido.`);
    if (!Array.isArray(p.material)) e.push(`${path}.profile.material no válido.`);
    if (!Array.isArray(p.limitaciones)) e.push(`${path}.profile.limitaciones no válido.`);
  }
  if (d.plan !== null && !isObj(d.plan)) e.push(`${path}.plan no válido.`);
  if (isObj(d.plan) && !Array.isArray(d.plan.sesiones)) e.push(`${path}.plan.sesiones no válido.`);
  if (!Array.isArray(d.sesiones)) e.push(`${path}.sesiones no válido.`);
  else d.sesiones.forEach((s, i) => {
    if (!isObj(s) || !isStr(s.id) || !isStr(s.fecha) || !['completada', 'parcial', 'cancelada'].includes(s.estado as string) || !Array.isArray(s.ejercicios)) {
      e.push(`${path}.sesiones[${i}] no válida.`);
    } else (s.ejercicios as unknown[]).forEach((x, j) => {
      if (!isObj(x) || !isStr(x.exerciseId) || !EXERCISE_BY_ID[x.exerciseId as string] || !Array.isArray(x.sets)) e.push(`${path}.sesiones[${i}].ejercicios[${j}] no válido.`);
    });
  });
  if (d.activa !== null && !isObj(d.activa)) e.push(`${path}.activa no válida.`);
  if (!Array.isArray(d.favoritos)) e.push(`${path}.favoritos no válido.`);
  if (!Array.isArray(d.medidas)) e.push(`${path}.medidas no válido.`);
  if (!Array.isArray(d.decisiones)) e.push(`${path}.decisiones no válido.`);
  if (!isObj(d.ajustes)) e.push(`${path}.ajustes no válido.`);
  if (!isObj(d.nutricion)) e.push(`${path}.nutricion no válido.`);
  return e;
}

export function validateState(s: unknown): string[] {
  if (!isObj(s)) return ['El archivo no contiene un objeto JSON.'];
  const e: string[] = [];
  if (s.version !== 1) e.push('Versión de copia no compatible (se esperaba 1).');
  if (!isObj(s.perfiles)) return [...e, 'Falta la lista de perfiles.'];
  for (const [id, pd] of Object.entries(s.perfiles)) {
    e.push(...validateProfileData(pd, `perfiles.${id}`));
    if (isObj(pd) && isObj(pd.profile) && pd.profile.id !== id) e.push(`perfiles.${id}: el id no coincide.`);
  }
  if (s.activeProfileId !== null && !(isStr(s.activeProfileId) && (s.activeProfileId as string) in (s.perfiles as object))) {
    e.push('El perfil activo no existe en la copia.');
  }
  return e;
}

// ── Copia de seguridad ──
export interface BackupFile { app: 'menarguez-fit-ia'; exportado: string; estado: AppState }

export function exportBackup(state: AppState, now = new Date()): string {
  const b: BackupFile = { app: 'menarguez-fit-ia', exportado: now.toISOString(), estado: { ...state, borrador: null } };
  return JSON.stringify(b, null, 2);
}

export function parseBackup(text: string): { ok: true; estado: AppState } | { ok: false; errores: string[] } {
  let j: unknown;
  try { j = JSON.parse(text); } catch { return { ok: false, errores: ['El archivo no es un JSON válido.'] }; }
  if (!isObj(j) || j.app !== 'menarguez-fit-ia' || !isObj(j.estado)) return { ok: false, errores: ['No es una copia de Menarguez Fit IA.'] };
  const errs = validateState(j.estado);
  if (errs.length) return { ok: false, errores: errs.slice(0, 8) };
  return { ok: true, estado: j.estado as unknown as AppState };
}

// ── CSV de registros ──
const csvCell = (v: unknown) => {
  const s = v == null ? '' : String(v);
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s; // evita inyección de fórmulas en hojas de cálculo
  return /[;"\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function exportCsv(pd: ProfileData): string {
  const head = ['perfil', 'fecha', 'sesion', 'estado', 'ejercicio', 'serie', 'kg', 'reps', 'segundos', 'hecha', 'esfuerzo_ejercicio', 'molestia', 'tecnica_estable'];
  const rows: string[][] = [head];
  const sorted: SessionLog[] = [...pd.sesiones].sort((a, b) => a.fecha.localeCompare(b.fecha));
  for (const s of sorted) {
    if (!s.ejercicios.length) {
      rows.push([pd.profile.nombre, s.fecha.slice(0, 10), s.titulo, s.estado, `Aeróbico ${s.aerobicoMin ?? ''} min`, '', '', '', '', '', String(s.rpeSesion ?? ''), '', '']);
    }
    for (const e of s.ejercicios) {
      e.sets.forEach((x, i) => rows.push([
        pd.profile.nombre, s.fecha.slice(0, 10), s.titulo, s.estado, EXERCISE_BY_ID[e.exerciseId]?.nombre ?? e.exerciseId,
        String(i + 1), x.kg != null ? String(x.kg).replace('.', ',') : '', x.reps != null ? String(x.reps) : '',
        x.segundos != null ? String(x.segundos) : '', x.hecho ? 'sí' : 'no', e.rpe != null ? String(e.rpe) : '',
        String(e.molestia), e.tecnicaEstable ? 'sí' : 'no',
      ]));
    }
  }
  return '﻿' + rows.map((r) => r.map(csvCell).join(';')).join('\n');
}
