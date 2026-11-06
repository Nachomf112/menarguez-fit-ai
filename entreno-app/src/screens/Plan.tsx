import { useState } from 'react';
import { EXERCISE_BY_ID } from '../data/exercises';
import { RUN_TYPE_LABEL } from '../domain/running';
import { AEROBIC_LABEL, DAY_NAMES, generatePlan, progressionCriterion, rirText, substitutes } from '../domain/planner';
import { suggestFor } from '../domain/progression';
import { Notice, useApp, PageTop } from '../ui/kit';
import { doneThisWeek, todayIndex } from './Home';

export function PlanScreen() {
  const { pd, go, updatePd } = useApp();
  const [confirm, setConfirm] = useState(false);
  if (!pd?.plan) return null;
  const plan = pd.plan;
  const wd = todayIndex();
  const done = doneThisWeek(pd);

  const regenerar = () => {
    const res = generatePlan(pd.profile);
    if (res.ok) updatePd((d) => ({ ...d, plan: res.plan }));
    setConfirm(false);
  };

  return (
    <div className="screen">
      <PageTop eyebrow="Mi plan" title="Semana de entrenamiento" sub={`${plan.sesiones.length} sesiones · ${plan.diasDescanso.length} días de descanso · generado el ${new Date(plan.creado).toLocaleDateString('es-ES')}`} />
      <div className="week">
        {DAY_NAMES.map((name, d) => {
          const s = plan.sesiones.find((x) => x.dia === d);
          return (
            <div key={d} className={`day ${d === wd ? 'today' : ''}`}>
              <div className="dname">{name.slice(0, 3)}{d === wd && <div className="small" style={{ fontWeight: 600 }}>hoy</div>}</div>
              {s ? (
                <button type="button" className="item" onClick={() => go('sesion', { sessionId: s.id })}>
                  <div>
                    <strong>{s.titulo}</strong>
                    <div className="small muted">
                      {s.tipo === 'fuerza' ? `${s.ejercicios.length} ejercicios` : s.tipo === 'carrera' ? 'Carrera' : AEROBIC_LABEL[s.aerobico!.actividad]} · ≈{s.minutosEstimados} min
                    </div>
                  </div>
                  {done.has(s.id) ? <span className="badge ok">Hecha</span> : <span className={`badge ${s.tipo === 'carrera' ? 'demo' : 'blue'}`}>{s.tipo === 'fuerza' ? 'Fuerza' : s.tipo === 'carrera' ? 'Carrera' : 'Aeróbico'}</span>}
                </button>
              ) : <div className="rest">Descanso</div>}
            </div>
          );
        })}
      </div>
      <p className="small muted">{plan.sugerenciaDescanso}</p>
      <div className="two">
        <div className="card">
          <span className="eyebrow">Antes de empezar</span>
          <h2>Control antes que kilos</h2>
          <p className="small muted">Calienta como indica cada sesión y haz una serie ligera de práctica. Elige una carga con la que completes el rango con buena técnica y te queden las repeticiones en reserva indicadas. La duración incluye descansos y es aproximada.</p>
        </div>
        <div className="card">
          <span className="eyebrow">Progresión</span>
          <h2>Gana repeticiones primero</h2>
          <p className="small muted">Cuando completes todas las series en el tope del rango con técnica estable, esfuerzo adecuado y sin molestias, sube la carga mínima disponible. No hay aumentos automáticos: tú decides.</p>
        </div>
      </div>
      {plan.notas.length > 0 && (
        <div className="card">
          <h3>Notas del plan</h3>
          <ul className="plain small muted">{plan.notas.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </div>
      )}
      {plan.excluidos.length > 0 && (
        <details className="card">
          <summary>Ejercicios excluidos ({plan.excluidos.length})</summary>
          <ul className="plain small muted">{plan.excluidos.map((x) => <li key={x.id}>{EXERCISE_BY_ID[x.id]?.nombre}: {x.motivo.toLowerCase()}</li>)}</ul>
        </details>
      )}
      <div className="card flat">
        <h3>¿Ha cambiado algo?</h3>
        <p className="small muted">Edita tu perfil (días, material, limitaciones…) desde Ajustes. Regenerar con los mismos datos produce el mismo plan.</p>
        {confirm ? (
          <div className="row">
            <span className="small">¿Regenerar ahora? Tus registros se conservan.</span>
            <button type="button" className="btn primary sm" onClick={regenerar}>Sí, regenerar</button>
            <button type="button" className="btn sm" onClick={() => setConfirm(false)}>Cancelar</button>
          </div>
        ) : <div className="row"><button type="button" className="btn sm" onClick={() => setConfirm(true)}>Regenerar plan</button>
          <button type="button" className="btn ghost sm" onClick={() => go('ajustes')}>Editar perfil</button></div>}
      </div>
    </div>
  );
}

export function SessionDetail() {
  const { pd, sel, go } = useApp();
  if (!pd?.plan) return null;
  const s = pd.plan.sesiones.find((x) => x.id === sel.sessionId) ?? pd.plan.sesiones[0];
  if (!s) return null;

  return (
    <div className="screen">
      <button type="button" className="btn ghost sm" style={{ justifySelf: 'start' }} onClick={() => go('plan')}>← Mi plan</button>
      <div className="stack">
        <span className="eyebrow">{DAY_NAMES[s.dia]} · ≈{s.minutosEstimados} min</span>
        <h1>{s.titulo}</h1>
        <p className="muted">{s.objetivo}</p>
      </div>
      {s.avisos.map((a, i) => <Notice key={i} kind="warn">{a}</Notice>)}
      {s.calentamiento.length > 0 && <div className="card">
        <h3>Calentamiento</h3>
        <ul className="plain small">{s.calentamiento.map((c, i) => <li key={i}>{c}</li>)}</ul>
      </div>}
      {s.carrera && (
        <div className="card accent">
          <span className="eyebrow">{RUN_TYPE_LABEL[s.carrera.tipo]} · ≈{Math.round(s.carrera.minutos)} min</span>
          <ol className="steps">{s.carrera.bloques.map((b, i) => <li key={i}>{b}</li>)}</ol>
          <p className="small"><strong>Intensidad:</strong> {s.carrera.intensidad}</p>
          {s.carrera.ritmo && <p className="small"><strong>Ritmo:</strong> {s.carrera.ritmo}</p>}
          {s.carrera.nota && <p className="small muted">{s.carrera.nota}</p>}
          <p className="small faint">Si aparece dolor que te hace cambiar la zancada, para y camina. Ante dolor en el pecho, mareo o falta de aire intensa, detente y busca atención sanitaria.</p>
        </div>
      )}

      {s.aerobico && (
        <div className="card">
          <h3>{AEROBIC_LABEL[s.aerobico.actividad]} · {s.aerobico.minutos} min</h3>
          <p className="small">{s.aerobico.intensidad}</p>
          <p className="small faint">Puedes cambiarlo por cualquier otra actividad aeróbica que prefieras con la misma sensación de esfuerzo.</p>
        </div>
      )}

      {s.ejercicios.map((it, i) => {
        const e = EXERCISE_BY_ID[it.exerciseId];
        const sug = suggestFor(it.exerciseId, it.presc, pd.sesiones);
        const subs = substitutes(pd.profile, it.exerciseId).slice(0, 3);
        const ajuste = pd.ajustes[it.exerciseId];
        const unit = e.unidad === 'segundos' ? 's' : e.unidad === 'reps_lado' ? 'reps por lado' : 'reps';
        return (
          <div key={it.exerciseId} className="card">
            <div className="row between">
              <span className="eyebrow">{i + 1}. {e.musculos.slice(0, 2).join(' · ')}</span>
              <button type="button" className="btn ghost sm" onClick={() => go('ejercicios', { exerciseId: e.id })}>Ficha técnica</button>
            </div>
            <h3>{e.nombre}</h3>
            <p className="num" style={{ fontSize: '1.3rem' }}>{it.presc.series} × {it.presc.repsMin}–{it.presc.repsMax} {unit} · descanso {it.presc.descansoSeg} s</p>
            <p className="small"><strong>Intensidad:</strong> {rirText(it.presc.rir, e.unidad)}</p>
            <p className="small muted"><strong>Técnica:</strong> {e.ejecucion[0]}</p>
            {ajuste?.cargaObjetivo && <p className="small"><span className="badge ok">Carga aceptada</span> {ajuste.cargaObjetivo} kg ({ajuste.nota})</p>}
            <p className="small muted"><strong>Carga:</strong> {sug.tipo === 'sin_datos'
              ? (e.carga === 'corporal' ? 'Peso corporal; ajusta la dificultad con el recorrido o la variante.' : 'Elige una carga que te permita completar el rango con buena técnica dejando las repeticiones en reserva indicadas.')
              : `${sug.titulo}. ${sug.motivo}`}</p>
            {subs.length > 0 && <p className="small muted"><strong>Alternativas:</strong> {subs.map((x) => x.nombre).join(' · ')}</p>}
            <details><summary className="small">Criterio de progresión</summary><p className="small muted">{progressionCriterion(it.presc, e.unidad)}</p></details>
          </div>
        );
      })}

      {s.vueltaCalma.length > 0 && <div className="card">
        <h3>Vuelta a la calma</h3>
        <ul className="plain small">{s.vueltaCalma.map((c, i) => <li key={i}>{c}</li>)}</ul>
      </div>}
      <button type="button" className="btn primary block" onClick={() => go('entrenar', { sessionId: s.id })}>{pd.activa ? 'Ir a la sesión en curso' : 'Empezar esta sesión'}</button>
    </div>
  );
}
