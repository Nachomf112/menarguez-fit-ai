import { DAY_NAMES } from '../domain/planner';
import { weekStart } from '../domain/progression';
import type { PlannedSession, ProfileData } from '../domain/types';
import { Notice, Progress, Stat, useApp, PageTop } from '../ui/kit';

export const todayIndex = (d = new Date()) => (d.getDay() + 6) % 7;

export function doneThisWeek(pd: ProfileData, now = new Date()): Set<string> {
  const ini = weekStart(now);
  return new Set(pd.sesiones.filter((s) => s.estado !== 'cancelada' && new Date(s.fecha) >= ini).map((s) => s.planSessionId));
}

export function nextSession(pd: ProfileData, now = new Date()): { s: PlannedSession; atrasada: boolean } | null {
  if (!pd.plan) return null;
  const done = doneThisWeek(pd, now);
  const wd = todayIndex(now);
  const pend = pd.plan.sesiones.filter((s) => !done.has(s.id));
  const hoyOFuturo = pend.find((s) => s.dia >= wd);
  if (hoyOFuturo) return { s: hoyOFuturo, atrasada: false };
  return pend[0] ? { s: pend[0], atrasada: true } : null;
}

export function Home() {
  const { pd, go } = useApp();
  if (!pd?.plan) return null;
  const now = new Date();
  const wd = todayIndex(now);
  const next = nextSession(pd, now);
  const done = doneThisWeek(pd, now);
  const total = pd.plan.sesiones.length;
  const semana = pd.sesiones.filter((s) => new Date(s.fecha) >= weekStart(now));
  const parciales = semana.filter((s) => s.estado === 'parcial').length;

  return (
    <div className="screen">
      <div className="stack">
        <PageTop eyebrow={DAY_NAMES[wd]} title={<>Vamos a por ello, <span style={{ color: 'var(--blue)' }}>{pd.profile.nombre.split(' ')[0]}</span></>} tag="Fuerza · Constancia · Equilibrio" />
        {pd.profile.demo && <Notice kind="yellow" title="Perfil de demostración">Los registros y medidas de este perfil son datos de ejemplo inventados.</Notice>}
      </div>

      {pd.activa ? (
        <div className="card accent">
          <span className="eyebrow">Sesión en curso</span>
          <h2>{pd.activa.titulo}</h2>
          <p className="muted small">Tu progreso está guardado. Puedes continuar donde lo dejaste.</p>
          <button type="button" className="btn primary" onClick={() => go('entrenar')}>Continuar sesión</button>
        </div>
      ) : next ? (
        <div className="card accent">
          <span className="eyebrow">{next.atrasada ? 'Pendiente de esta semana' : next.s.dia === wd ? 'Hoy' : `Próxima · ${DAY_NAMES[next.s.dia]}`}</span>
          <h2>{next.s.titulo}</h2>
          <p className="muted">{next.s.objetivo} · ≈{next.s.minutosEstimados} min</p>
          {next.s.ejercicios.length > 0 && <p className="small faint">{next.s.tipo === 'carrera' ? `Carrera + ${next.s.ejercicios.length} ejercicios de fuerza` : `${next.s.ejercicios.length} ejercicios`}</p>}
          <div className="row">
            <button type="button" className="btn primary" onClick={() => go('entrenar', { sessionId: next.s.id })}>Empezar</button>
            <button type="button" className="btn" onClick={() => go('sesion', { sessionId: next.s.id })}>Ver detalle</button>
          </div>
        </div>
      ) : (
        <div className="card"><h2>Semana completada</h2><p className="muted">Has realizado todas las sesiones previstas. Descansa y revisa tu progreso.</p></div>
      )}

      <div className="card">
        <div className="row between"><h3>Esta semana</h3><button type="button" className="btn ghost sm" onClick={() => go('progreso')}>Ver progreso</button></div>
        <Progress value={total ? done.size / total : 0} label="Sesiones realizadas esta semana" />
        <div className="stats">
          <Stat v={<>{done.size}<span className="faint" style={{ fontSize: '1rem' }}> / {total}</span></>} l="realizadas / previstas" />
          <Stat v={parciales} l="parciales" />
          <Stat v={pd.sesiones.filter((s) => s.estado !== 'cancelada').length} l="sesiones en total" />
        </div>
      </div>

      <div className="card">
        <h3>Nutrición</h3>
        <p className="muted small">{pd.nutricion.activa ? 'Módulo activado. Consulta o actualiza tu menú semanal.' : 'Módulo opcional e independiente. Solo te preguntaremos por tu alimentación si lo activas.'}</p>
        <button type="button" className="btn" onClick={() => go('nutricion')}>{pd.nutricion.activa ? 'Abrir nutrición' : 'Conocer el módulo'}</button>
      </div>

      <Notice kind="warn" title="Si algo no va bien">Si durante el ejercicio notas dolor en el pecho, falta de aire intensa, mareo o pérdida de conocimiento, detente y busca atención sanitaria (112).</Notice>
      <p className="sig">Ignacio Menárguez Fernández | Menarguez-IA-Solutions</p>
    </div>
  );
}
