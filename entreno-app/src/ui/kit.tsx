import { createContext, useContext, type ReactNode } from 'react';
import type { AppState, ProfileData } from '../domain/types';

export type Route = 'bienvenida' | 'evaluacion' | 'resumen' | 'inicio' | 'plan' | 'sesion' | 'entrenar' | 'ejercicios' | 'progreso' | 'nutricion' | 'ajustes' | 'cuenta';
export const ROUTES: Route[] = ['bienvenida', 'evaluacion', 'resumen', 'inicio', 'plan', 'sesion', 'entrenar', 'ejercicios', 'progreso', 'nutricion', 'ajustes', 'cuenta'];

export interface Selection { sessionId?: string; exerciseId?: string; summaryId?: string; editStep?: string }

export interface AppCtx {
  state: AppState;
  set: (fn: (s: AppState) => AppState) => void;
  pd: ProfileData | null;
  updatePd: (fn: (pd: ProfileData) => ProfileData) => void;
  go: (r: Route, sel?: Selection) => void;
  sel: Selection;
  persisted: boolean;
}
export const Ctx = createContext<AppCtx>(null as unknown as AppCtx);
export const useApp = () => useContext(Ctx);

export function Chip({ on, onClick, children, id }: { on: boolean; onClick: () => void; children: ReactNode; id?: string }) {
  return <button type="button" id={id} className="chip" aria-pressed={on} onClick={onClick}>{children}</button>;
}

export function Option({ on, onClick, title, desc }: { on: boolean; onClick: () => void; title: string; desc?: string }) {
  return (
    <button type="button" className="option" aria-pressed={on} onClick={onClick}>
      <strong>{title}</strong>{desc && <span>{desc}</span>}
    </button>
  );
}

export function Seg<T extends string | number>({ value, options, onChange, label }: { value: T | undefined; options: { v: T; l: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => <button type="button" key={String(o.v)} aria-pressed={value === o.v} onClick={() => onChange(o.v)}>{o.l}</button>)}
    </div>
  );
}

export function Notice({ kind = 'info', title, children }: { kind?: 'info' | 'warn' | 'danger' | 'yellow'; title?: string; children: ReactNode }) {
  return <div className={`notice ${kind === 'info' ? '' : kind}`} role={kind === 'danger' ? 'alert' : undefined}>{title && <strong>{title}</strong>}<div>{children}</div></div>;
}

export function Progress({ value, label }: { value: number; label: string }) {
  const v = Math.max(0, Math.min(1, value));
  return <div className="progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)}><i style={{ width: `${v * 100}%` }} /></div>;
}

export function Stat({ v, l }: { v: ReactNode; l: string }) {
  return <div className="stat"><span className="v">{v}</span><span className="l">{l}</span></div>;
}

const ICONS: Record<string, string> = {
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  plan: 'M4 5h16v15H4zM4 9h16M9 5V3M15 5V3',
  play: 'M7 4v16l13-8z',
  book: 'M5 4h10a4 4 0 0 1 4 4v12H9a4 4 0 0 1-4-4zM5 16a4 4 0 0 1 4-4h10',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  star: 'M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z',
  back: 'M15 18l-6-6 6-6',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
};
export function Icon({ name, size = 22, filled = false }: { name: keyof typeof ICONS | string; size?: number; filled?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

/** Gráfico de líneas simple a escala. Solo se usa con 2 o más puntos reales. */
export function LineChart({ points, unit, label }: { points: { x: string; y: number }[]; unit: string; label: string }) {
  const W = 320, H = 150, L = 36, R = 10, T = 12, B = 26;
  const ys = points.map((p) => p.y);
  let min = Math.min(...ys), max = Math.max(...ys);
  if (min === max) { min -= 1; max += 1; }
  const pad = (max - min) * 0.15; min -= pad; max += pad;
  const sx = (i: number) => L + (points.length === 1 ? 0 : (i * (W - L - R)) / (points.length - 1));
  const sy = (v: number) => T + (1 - (v - min) / (max - min)) * (H - T - B);
  const ints = ys.every((v) => Number.isInteger(v));
  let ticks = [min + (max - min) * 0.15, (min + max) / 2, max - (max - min) * 0.15];
  if (ints) ticks = [...new Set(ticks.map((t) => Math.round(t)))];
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${sx(i).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');
  const fmt = (v: number) => (Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 10) / 10).toString().replace('.', ',');
  const step = Math.ceil(points.length / 5);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={L} x2={W - R} y1={sy(t)} y2={sy(t)} stroke="var(--line)" strokeWidth={1} />
          <text x={L - 6} y={sy(t) + 4} textAnchor="end">{fmt(t)}</text>
        </g>
      ))}
      <path d={`${d} L${sx(points.length - 1)},${H - B} L${L},${H - B} Z`} fill="var(--blue-soft)" stroke="none" />
      <path d={d} fill="none" stroke="var(--blue)" strokeWidth={2.5} />
      {points.map((p, i) => <circle key={i} cx={sx(i)} cy={sy(p.y)} r={i === points.length - 1 ? 4.5 : 3} fill={i === points.length - 1 ? 'var(--yellow)' : 'var(--blue)'} />)}
      {points.map((p, i) => (i % step === 0 || i === points.length - 1) && <text key={`x${i}`} x={sx(i)} y={H - 8} textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}>{p.x}</text>)}
      <text x={W - R} y={T - 2} textAnchor="end">{unit}</text>
    </svg>
  );
}

export const fmtDate = (iso: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) =>
  new Date(iso).toLocaleDateString('es-ES', opts);

export function downloadText(name: string, text: string, mime: string): boolean {
  try {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return true;
  } catch { return false; }
}

/** Cabecera de página: etiqueta, titular en mayúsculas y lema a la derecha (escritorio). */
export function PageTop({ eyebrow, title, sub, tag = 'Tu ritmo. Tu progreso.' }: { eyebrow: string; title: ReactNode; sub?: ReactNode; tag?: string | null }) {
  return (
    <div className="pagetop">
      <div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1>{sub && <p className="muted">{sub}</p>}</div>
      {tag && <span className="tagline">{tag}</span>}
    </div>
  );
}

/** Gráfico de marca propio: disco de carga con progresión de barras. Decorativo. */
export function HeroArt() {
  return (
    <svg viewBox="0 0 320 260" width="100%" style={{ maxWidth: 340 }} aria-hidden="true">
      <defs>
        <linearGradient id="hg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#3a5f86" /><stop offset="1" stopColor="#0b1724" /></linearGradient>
      </defs>
      <circle cx="160" cy="120" r="100" fill="url(#hg)" stroke="#2d5f91" strokeWidth="2" />
      <circle cx="160" cy="120" r="72" fill="none" stroke="#0080f0" strokeWidth="3" strokeDasharray="300 160" transform="rotate(-110 160 120)" />
      <circle cx="160" cy="120" r="46" fill="#081321" stroke="#2d5f91" strokeWidth="2" />
      <circle cx="160" cy="120" r="14" fill="#000" stroke="#4d7aa6" strokeWidth="2" />
      {[0, 1, 2, 3, 4].map((i) => <rect key={i} x={46 + i * 50} y={232 - (i + 1) * 9} width="28" height={(i + 1) * 9} rx="3" fill={i === 4 ? '#ffc300' : '#0080f0'} opacity={0.35 + i * 0.15} />)}
    </svg>
  );
}
