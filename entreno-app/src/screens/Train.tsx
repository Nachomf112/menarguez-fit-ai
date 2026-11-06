import { useEffect, useState } from 'react';
import { EXERCISE_BY_ID } from '../data/exercises';
import { AEROBIC_LABEL, rirText, substitutes } from '../domain/planner';
import { describeSets, exerciseHistory, suggestFor } from '../domain/progression';
import { finishSession, startSession, statusOf, substitute, timerPause, timerRemaining, timerReset, timerResume, timerStart } from '../domain/session';
import type { ActiveSession, LoggedExercise, Recovery, SessionLog } from '../domain/types';
import { Notice, Progress, Seg, useApp } from '../ui/kit';
import { nextSession } from './Home';

const STATUS_LABEL = { completada: 'Completada', parcial: 'Parcial', cancelada: 'Cancelada' } as const;
const STATUS_BADGE = { completada: 'ok', parcial: 'warn', cancelada: 'danger' } as const;
const MOLESTIA = [{ v: 0, l: 'Ninguna' }, { v: 1, l: 'Leve' }, { v: 2, l: 'Moderada' }, { v: 3, l: 'Fuerte' }] as const;
const RPE = [5, 6, 7, 8, 9, 10].map((v) => ({ v, l: String(v) }));

export function Train() {
  const { pd, sel } = useApp();
  if (!pd?.plan) return null;
  if (pd.activa) return <ActiveView />;
  if (sel.summaryId) {
    const log = pd.sesiones.find((s) => s.id === sel.summaryId);
    if (log) return <SessionSummary log={log} />;
  }
  return <StartView />;
}

function StartView() {
  const { pd, sel, updatePd, go } = useApp();
  const [rec, setRec] = useState<Recovery>('normal');
  const plan = pd!.plan!;
  const sugerida = nextSession(pd!)?.s;
  const [sid, setSid] = useState<string>(sel.sessionId ?? sugerida?.id ?? plan.sesiones[0].id);
  const ps = plan.sesiones.find((s) => s.id === sid)!;

  const empezar = () => updatePd((d) => ({ ...d, activa: startSession(ps, rec, d.ajustes) }));

  return (
    <div className="screen">
      <div className="stack">
        <span className="eyebrow">Entrenar</span>
        <h1>Preparar sesión</h1>
      </div>
      <div className="field"><span>Sesión</span>
        <select id="train-session" value={sid} onChange={(e) => setSid(e.target.value)}>
          {plan.sesiones.map((s) => <option key={s.id} value={s.id}>{s.titulo}{s.id === sugerida?.id ? ' (siguiente)' : ''}</option>)}
        </select>
      </div>
      <div className="card">
        <h3>{ps.titulo}</h3>
        <p className="small muted">{ps.tipo === 'fuerza' ? ps.ejercicios.map((e) => EXERCISE_BY_ID[e.exerciseId].nombre).join(' · ') : `${AEROBIC_LABEL[ps.aerobico!.actividad]} ${ps.aerobico!.minutos} min`}</p>
        <p className="small faint">≈{ps.minutosEstimados} min</p>
      </div>
      <div className="field"><span>¿Cómo te encuentras hoy?</span>
        <Seg label="Estado de recuperación" value={rec} onChange={setRec} options={[{ v: 'buena', l: 'Bien' }, { v: 'normal', l: 'Normal' }, { v: 'mala', l: 'Cansado o mal descansado' }]} />
      </div>
      {rec === 'mala' && <Notice kind="warn">Hoy haremos una serie menos por ejercicio y con más repeticiones en reserva. Si te encuentras enfermo, descansa.</Notice>}
      <button type="button" className="btn primary block" onClick={empezar}>Empezar sesión</button>
      <p className="small faint">La sesión solo cuenta como realizada si registras series. Puedes cerrar la página: el progreso se guarda.</p>
      <button type="button" className="btn ghost" onClick={() => go('sesion', { sessionId: ps.id })}>Ver calentamiento y detalle</button>
    </div>
  );
}

function useTick(active: boolean) {
  const [, setN] = useState(0);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setN((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [active]);
}

function ActiveView() {
  const { pd, updatePd, go } = useApp();
  const a = pd!.activa!;
  const plan = pd!.plan!;
  const ps = plan.sesiones.find((s) => s.id === a.planSessionId);
  const [err, setErr] = useState<string | null>(null);
  const [showSubs, setShowSubs] = useState(false);
  const [finish, setFinish] = useState<null | 'guardar' | 'cancelar'>(null);
  const [rpeSesion, setRpeSesion] = useState<number | undefined>(undefined);
  const [nota, setNota] = useState('');
  const [sos, setSos] = useState(false);
  const running = !!a.timer && a.timer.pausadoRestante == null && timerRemaining(a.timer) > 0;
  useTick(running);

  const upd = (fn: (x: ActiveSession) => ActiveSession) => updatePd((d) => (d.activa ? { ...d, activa: fn(d.activa) } : d));
  const updEx = (i: number, fn: (e: LoggedExercise) => LoggedExercise) => upd((x) => ({ ...x, ejercicios: x.ejercicios.map((e, j) => (j === i ? fn(e) : e)) }));

  const total = a.ejercicios.reduce((s, e) => s + e.sets.length, 0);
  const hechas = a.ejercicios.reduce((s, e) => s + e.sets.filter((x) => x.hecho).length, 0);
  const isAerobic = a.ejercicios.length === 0;

  const save = (cancelar: boolean) => {
    const log: SessionLog = finishSession(a, { cancelar, rpeSesion, nota, aerobicoObjetivo: ps?.aerobico?.minutos });
    updatePd((d) => ({ ...d, activa: null, sesiones: [...d.sesiones, log] }));
    go('entrenar', { summaryId: log.id });
  };

  const header = (
    <div className="stack">
      <div className="row between">
        <span className="eyebrow">Sesión en curso</span>
        <button type="button" className="btn danger sm" onClick={() => setSos((v) => !v)}>Tengo síntomas</button>
      </div>
      <h2>{a.titulo}</h2>
      {sos && (
        <Notice kind="danger" title="Detén el ejercicio">
          Si tienes dolor en el pecho, falta de aire intensa, mareo, palpitaciones fuertes o pérdida de conocimiento, para ahora y llama al 112.
          Si es dolor en una articulación o músculo, no continúes con ese ejercicio; prueba una alternativa sin dolor o termina la sesión.
        </Notice>
      )}
      {!isAerobic && <><Progress value={total ? hechas / total : 0} label="Series completadas" /><span className="small faint num">{hechas} de {total} series</span></>}
    </div>
  );

  const finishPanel = finish && (
    <div className="card accent">
      {finish === 'guardar' ? (
        <>
          <h3>Terminar sesión</h3>
          <p className="small muted">Estado: <strong>{(() => { const st = statusOf(a); return st === 'vacia' ? 'sin series registradas (se guardará como cancelada)' : STATUS_LABEL[st].toLowerCase(); })()}</strong></p>
          <div className="field"><span>Esfuerzo global de la sesión (1–10)</span><Seg label="Esfuerzo de la sesión" value={rpeSesion} onChange={setRpeSesion} options={RPE} /></div>
          <label className="field"><span>Nota (opcional)</span><input id="train-nota" type="text" maxLength={200} value={nota} onChange={(e) => setNota(e.target.value)} /></label>
          <div className="row"><button type="button" className="btn primary" onClick={() => save(false)}>Guardar sesión</button><button type="button" className="btn" onClick={() => setFinish(null)}>Seguir entrenando</button></div>
        </>
      ) : (
        <>
          <h3>¿Cancelar la sesión?</h3>
          <p className="small muted">Se guardará como cancelada, con las series que hayas registrado, y no contará como realizada.</p>
          <div className="row"><button type="button" className="btn danger" onClick={() => save(true)}>Sí, cancelar</button><button type="button" className="btn" onClick={() => setFinish(null)}>No, seguir</button></div>
        </>
      )}
    </div>
  );

  if (isAerobic) {
    const obj = ps?.aerobico;
    return (
      <div className="screen">
        {header}
        {obj && <div className="card"><h3>{AEROBIC_LABEL[obj.actividad]} · objetivo {obj.minutos} min</h3><p className="small">{obj.intensidad}</p></div>}
        <label className="field"><span>Minutos realizados</span>
          <input id="train-aero-min" type="number" inputMode="numeric" min={0} max={300} value={a.aerobicoMin || ''} onChange={(e) => upd((x) => ({ ...x, aerobicoMin: Math.max(0, Math.min(300, Number(e.target.value) || 0)) }))} />
        </label>
        {finishPanel ?? <div className="row"><button type="button" className="btn primary" onClick={() => setFinish('guardar')}>Terminar</button><button type="button" className="btn danger" onClick={() => setFinish('cancelar')}>Cancelar sesión</button></div>}
      </div>
    );
  }

  const i = Math.min(a.actual, a.ejercicios.length - 1);
  const ex = a.ejercicios[i];
  const e = EXERCISE_BY_ID[ex.exerciseId];
  const hist = exerciseHistory(pd!.sesiones, ex.exerciseId);
  const last = hist[hist.length - 1];
  const sug = suggestFor(ex.exerciseId, ex.presc, pd!.sesiones);
  const subs = substitutes(pd!.profile, ex.originalId, a.ejercicios.map((x) => x.exerciseId));
  const nextEx = a.ejercicios[i + 1] && EXERCISE_BY_ID[a.ejercicios[i + 1].exerciseId];
  const isSec = e.unidad === 'segundos';
  const hasLoad = e.carga !== 'corporal';
  const remaining = timerRemaining(a.timer);

  const toggleSet = (k: number) => {
    const s = ex.sets[k];
    if (!s.hecho) {
      const v = isSec ? s.segundos : s.reps;
      if (v == null || !(v > 0)) { setErr(`Anota ${isSec ? 'los segundos' : 'las repeticiones'} de la serie ${k + 1} antes de marcarla.`); return; }
    }
    setErr(null);
    const marking = !s.hecho;
    upd((x) => {
      const ejercicios = x.ejercicios.map((le, j) => {
        if (j !== i) return le;
        const sets = le.sets.map((st, n) => (n === k ? { ...st, hecho: !st.hecho } : st));
        if (marking && k + 1 < sets.length && sets[k + 1].kg == null && sets[k].kg != null) sets[k + 1] = { ...sets[k + 1], kg: sets[k].kg };
        return { ...le, sets };
      });
      const lastOfAll = i === x.ejercicios.length - 1 && k === ex.sets.length - 1;
      return { ...x, ejercicios, timer: marking && !lastOfAll ? timerStart(ex.presc.descansoSeg) : x.timer };
    });
  };
  const setVal = (k: number, field: 'kg' | 'reps' | 'segundos', raw: string) => {
    const v = raw === '' ? undefined : Math.max(0, Number(raw.replace(',', '.')));
    updEx(i, (le) => ({ ...le, sets: le.sets.map((st, n) => (n === k ? { ...st, [field]: Number.isFinite(v) ? v : undefined } : st)) }));
  };

  return (
    <div className="screen">
      {header}
      <div className="chips" role="tablist" aria-label="Ejercicios de la sesión">
        {a.ejercicios.map((le, j) => {
          const ok = le.sets.every((s) => s.hecho);
          return <button type="button" role="tab" key={j} aria-selected={j === i} className="chip" aria-pressed={j === i} onClick={() => upd((x) => ({ ...x, actual: j }))}>{j + 1}{ok ? ' ✓' : ''}</button>;
        })}
      </div>

      <div className="card accent">
        <span className="eyebrow">Ejercicio {i + 1} de {a.ejercicios.length}</span>
        <h2>{e.nombre}</h2>
        {ex.exerciseId !== ex.originalId && <span className="small faint">Sustituye a {EXERCISE_BY_ID[ex.originalId].nombre}</span>}
        <p className="num" style={{ fontSize: '1.25rem' }}>{ex.presc.series} × {ex.presc.repsMin}–{ex.presc.repsMax} {isSec ? 's' : e.unidad === 'reps_lado' ? 'reps/lado' : 'reps'} · descanso {ex.presc.descansoSeg} s</p>
        <p className="small">{rirText(ex.presc.rir, e.unidad)}</p>
        <p className="small muted"><strong>Último registro:</strong> {last ? `${new Date(last.fecha).toLocaleDateString('es-ES')} · ${describeSets(last.log, e.unidad)}${last.log.rpe ? ` · esfuerzo ${last.log.rpe}` : ''}` : 'ninguno todavía'}</p>
        {sug.tipo !== 'sin_datos' && <p className="small"><span className={`badge ${sug.tipo === 'progresar' ? 'ok' : sug.tipo === 'reducir' ? 'danger' : 'blue'}`}>{sug.titulo}</span></p>}
        {sug.tipo === 'sin_datos' && hasLoad && <p className="small muted">Primera vez: empieza con una carga que puedas controlar y ajusta en la siguiente serie según te sobren o falten repeticiones.</p>}

        <div className="sets" role="table" aria-label="Series">
          <div className="setrow head" role="row"><span>#</span><span>{hasLoad ? 'kg' : '—'}</span><span>{isSec ? 'segundos' : 'reps'}</span><span>Hecha</span></div>
          {ex.sets.map((s, k) => (
            <div className="setrow" role="row" key={k}>
              <span className="idx">{k + 1}</span>
              {hasLoad
                ? <input id={`set-kg-${i}-${k}`} aria-label={`Kilos serie ${k + 1}`} inputMode="decimal" type="text" value={s.kg ?? ''} placeholder="kg" onChange={(ev) => setVal(k, 'kg', ev.target.value)} />
                : <span className="faint small" style={{ textAlign: 'center' }}>corporal</span>}
              <input id={`set-reps-${i}-${k}`} aria-label={`${isSec ? 'Segundos' : 'Repeticiones'} serie ${k + 1}`} inputMode="numeric" type="text" value={(isSec ? s.segundos : s.reps) ?? ''} placeholder={`${ex.presc.repsMin}–${ex.presc.repsMax}`} onChange={(ev) => setVal(k, isSec ? 'segundos' : 'reps', ev.target.value)} />
              <button type="button" className="done-btn" aria-pressed={s.hecho} aria-label={`Marcar serie ${k + 1} como hecha`} onClick={() => toggleSet(k)}>{s.hecho ? '✓' : '○'}</button>
            </div>
          ))}
        </div>
        {err && <p className="error" role="alert">{err}</p>}

        <div className="field"><span>Esfuerzo del ejercicio (1–10)</span><Seg label="Esfuerzo" value={ex.rpe} onChange={(v) => updEx(i, (le) => ({ ...le, rpe: v }))} options={RPE} /></div>
        <div className="field"><span>Molestias</span><Seg label="Molestias" value={ex.molestia} onChange={(v) => updEx(i, (le) => ({ ...le, molestia: v as 0 | 1 | 2 | 3 }))} options={MOLESTIA.map((m) => ({ v: m.v, l: m.l }))} /></div>
        {ex.molestia >= 2 && <Notice kind="danger">Detén este ejercicio. Prueba una alternativa que no duela o pasa al siguiente. Si el dolor persiste o aumenta, consulta a un profesional sanitario.</Notice>}
        <label className="check"><input id={`tec-${i}`} type="checkbox" checked={ex.tecnicaEstable} onChange={(ev) => updEx(i, (le) => ({ ...le, tecnicaEstable: ev.target.checked }))} /><span>Técnica estable en todas las series</span></label>

        <div className="row">
          <button type="button" className="btn sm" onClick={() => setShowSubs((v) => !v)}>Sustituir ejercicio</button>
          <button type="button" className="btn ghost sm" onClick={() => go('ejercicios', { exerciseId: e.id })}>Ver técnica</button>
        </div>
        {showSubs && (
          <div className="list">
            {subs.length === 0 && <p className="small muted">No hay alternativas compatibles con tu material y tus limitaciones.</p>}
            {subs.slice(0, 5).map((s) => (
              <button type="button" key={s.id} className="item" onClick={() => { upd((x) => substitute(x, i, s.id)); setShowSubs(false); }}>
                <div><strong>{s.nombre}</strong><div className="small muted">{s.material.join(', ')} · dificultad {s.dificultad}</div></div>
                <span className="badge blue">Usar</span>
              </button>
            ))}
            {ex.exerciseId !== ex.originalId && <button type="button" className="btn ghost sm" onClick={() => { upd((x) => substitute(x, i, ex.originalId)); setShowSubs(false); }}>Volver al original</button>}
          </div>
        )}
      </div>

      <div className="row between">
        <button type="button" className="btn" disabled={i === 0} onClick={() => upd((x) => ({ ...x, actual: i - 1 }))}>← Anterior</button>
        {i < a.ejercicios.length - 1
          ? <button type="button" className="btn primary" onClick={() => upd((x) => ({ ...x, actual: i + 1 }))}>Siguiente →</button>
          : <button type="button" className="btn primary" onClick={() => setFinish('guardar')}>Terminar</button>}
      </div>
      {nextEx && <p className="small faint">A continuación: {nextEx.nombre}</p>}

      {a.timer && (
        <div className={`timer ${remaining === 0 ? 'done' : ''}`} aria-live="polite">
          <span className="t">{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}</span>
          <span className="small muted" style={{ flex: 1, minWidth: 90 }}>{remaining === 0 ? 'Descanso terminado' : a.timer.pausadoRestante != null ? 'En pausa' : 'Descanso'}</span>
          {a.timer.pausadoRestante != null
            ? <button type="button" className="btn sm" onClick={() => upd((x) => ({ ...x, timer: timerResume(x.timer) }))}>Reanudar</button>
            : <button type="button" className="btn sm" disabled={remaining === 0} onClick={() => upd((x) => ({ ...x, timer: timerPause(x.timer) }))}>Pausa</button>}
          <button type="button" className="btn sm" onClick={() => upd((x) => ({ ...x, timer: timerReset(x.timer) }))}>Reiniciar</button>
          <button type="button" className="btn ghost sm" onClick={() => upd((x) => ({ ...x, timer: null }))}>Ocultar</button>
        </div>
      )}

      {finishPanel ?? (
        <div className="row">
          <button type="button" className="btn" onClick={() => setFinish('guardar')}>Terminar sesión</button>
          <button type="button" className="btn danger" onClick={() => setFinish('cancelar')}>Cancelar sesión</button>
        </div>
      )}
    </div>
  );
}

function SessionSummary({ log }: { log: SessionLog }) {
  const { pd, go } = useApp();
  const mins = Math.max(1, Math.round((new Date(log.fin).getTime() - new Date(log.inicio).getTime()) / 60000));
  const sets = log.ejercicios.flatMap((e) => e.sets.filter((s) => s.hecho));
  const volumen = log.ejercicios.reduce((t, e) => t + e.sets.filter((s) => s.hecho).reduce((a, s) => a + (s.kg ?? 0) * (s.reps ?? 0), 0), 0);
  return (
    <div className="screen">
      <div className="stack">
        <span className="eyebrow">Resumen</span>
        <h1>{log.titulo}</h1>
        <div className="row"><span className={`badge ${STATUS_BADGE[log.estado]}`}>{STATUS_LABEL[log.estado]}</span><span className="small muted">{new Date(log.fecha).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })}</span></div>
      </div>
      <div className="stats card">
        <div className="stat"><span className="v">{mins}</span><span className="l">minutos</span></div>
        {log.ejercicios.length > 0 && <div className="stat"><span className="v">{sets.length}</span><span className="l">series hechas</span></div>}
        {volumen > 0 && <div className="stat"><span className="v">{Math.round(volumen)}</span><span className="l">kg × reps</span></div>}
        {log.aerobicoMin != null && <div className="stat"><span className="v">{log.aerobicoMin}</span><span className="l">min aeróbicos</span></div>}
        {log.rpeSesion != null && <div className="stat"><span className="v">{log.rpeSesion}</span><span className="l">esfuerzo</span></div>}
      </div>
      {log.estado === 'cancelada' && <Notice kind="warn">Esta sesión no cuenta como realizada.</Notice>}
      {log.ejercicios.filter((e) => e.sets.some((s) => s.hecho)).map((e) => {
        const ex = EXERCISE_BY_ID[e.exerciseId];
        const s = suggestFor(e.exerciseId, e.presc, pd!.sesiones);
        return (
          <div key={e.exerciseId} className="card">
            <h3>{ex.nombre}</h3>
            <p className="small num">{describeSets(e, ex.unidad)}</p>
            {log.estado !== 'cancelada' && <p className="small"><span className={`badge ${s.tipo === 'progresar' ? 'ok' : s.tipo === 'reducir' ? 'danger' : 'blue'}`}>{s.titulo}</span> <span className="muted">Próxima vez</span></p>}
          </div>
        );
      })}
      <div className="row">
        <button type="button" className="btn primary" onClick={() => go('progreso')}>Ver progreso</button>
        <button type="button" className="btn" onClick={() => go('inicio')}>Inicio</button>
      </div>
    </div>
  );
}
