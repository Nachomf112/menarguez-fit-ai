import { useEffect, useMemo, useState } from 'react';
import { EXERCISES, EXERCISE_BY_ID, EQUIPMENT_LABEL, LIMITATION_LABEL } from '../data/exercises';
import { emptyProfileData } from '../data/demo';
import { AEROBIC_LABEL, canPlan, generatePlan } from '../domain/planner';
import { fmtTime, parseTime, RACE_LABEL } from '../domain/running';
import type { Aerobic, Equipment, Limitation, Profile, RaceDistance, RunningProfile } from '../domain/types';
import { Chip, Notice, Option, Progress, Seg, useApp } from '../ui/kit';

type R = Profile;
interface Step { id: string; fase: 1 | 2; titulo: string; show?: (r: R) => boolean; valid?: (r: R) => string | null; body: (r: R, u: (p: Partial<R>) => void) => JSX.Element }

const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
const needsIndications = (r: R) => r.limitaciones.length > 0 || r.dolorQueAumenta || r.screening.sintomasEsfuerzo || r.screening.restriccionProfesional || r.screening.embarazoPosparto;

export const GOAL_OPTS: { v: Profile['objetivo']; t: string; d: string }[] = [
  { v: 'hipertrofia', t: 'Ganar músculo', d: 'Aumentar masa muscular de forma progresiva.' },
  { v: 'fuerza', t: 'Ganar fuerza', d: 'Mover más carga en los ejercicios básicos.' },
  { v: 'salud', t: 'Salud y forma general', d: 'Sentirte con más energía y capacidad en el día a día.' },
  { v: 'composicion', t: 'Mejorar composición corporal', d: 'Reducir grasa conservando o ganando músculo.' },
  { v: 'resistencia', t: 'Resistencia muscular', d: 'Aguantar más repeticiones y trabajo continuado.' },
  { v: 'carrera', t: 'Preparar una carrera', d: '400 m, 800 m, 1500 m, 5 km, 10 km o media maratón, con fuerza de apoyo.' },
];
export const EXP_OPTS: { v: Profile['experiencia']; t: string; d: string }[] = [
  { v: 'ninguna', t: 'Sin experiencia', d: 'Nunca he entrenado fuerza o hace más de un año.' },
  { v: 'principiante', t: 'Principiante', d: 'Menos de 6 meses entrenando con regularidad.' },
  { v: 'intermedio', t: 'Intermedio', d: 'Entre 6 meses y 2 años; domino los ejercicios básicos.' },
  { v: 'avanzado', t: 'Avanzado', d: 'Más de 2 años de entrenamiento constante y planificado.' },
];
export const ACT_OPTS: { v: Profile['actividad']; t: string; d: string }[] = [
  { v: 'sedentaria', t: 'Poco activa', d: 'Paso la mayor parte del día sentado y no hago ejercicio.' },
  { v: 'ligera', t: 'Algo activa', d: 'Camino a diario o hago ejercicio 1–2 veces por semana.' },
  { v: 'moderada', t: 'Activa', d: 'Hago ejercicio 3–4 veces por semana.' },
  { v: 'alta', t: 'Muy activa', d: 'Entreno 5 o más veces por semana o tengo un trabajo físico.' },
];
const SLEEP: { v: Profile['sueno']; l: string }[] = [{ v: 'menos6', l: '< 6 h' }, { v: '6a7', l: '6–7 h' }, { v: '7a9', l: '7–9 h' }, { v: 'mas9', l: '> 9 h' }];
const REC: { v: Profile['recuperacion']; l: string }[] = [{ v: 'buena', l: 'Buena' }, { v: 'normal', l: 'Normal' }, { v: 'mala', l: 'Me cuesta recuperar' }];

function YesNo({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <div className="field">
      <span>{label}</span>
      <Seg label={label} value={value ? 'si' : 'no'} options={[{ v: 'no', l: 'No' }, { v: 'si', l: 'Sí' }]} onChange={(v) => onChange(v === 'si')} />
    </div>
  );
}

function AvoidPicker({ r, u }: { r: R; u: (p: Partial<R>) => void }) {
  const [q, setQ] = useState('');
  const matches = q.trim().length >= 2 ? EXERCISES.filter((e) => e.nombre.toLowerCase().includes(q.toLowerCase()) && !r.evitarEjercicios.includes(e.id)).slice(0, 8) : [];
  return (
    <div className="stack">
      <label className="field"><span>Ejercicios que prefieres evitar (opcional)</span>
        <input id="eval-avoid" type="search" placeholder="Busca por nombre, p. ej. zancada" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      {matches.length > 0 && <div className="chips">{matches.map((e) => <Chip key={e.id} on={false} onClick={() => { u({ evitarEjercicios: [...r.evitarEjercicios, e.id] }); setQ(''); }}>+ {e.nombre}</Chip>)}</div>}
      {r.evitarEjercicios.length > 0 && <div className="chips">{r.evitarEjercicios.map((id) => <Chip key={id} on onClick={() => u({ evitarEjercicios: r.evitarEjercicios.filter((x) => x !== id) })}>{EXERCISE_BY_ID[id]?.nombre ?? id} ✕</Chip>)}</div>}
    </div>
  );
}

const showBody = (r: R) => r.objetivo === 'composicion' || r.objetivo === 'hipertrofia';
const validBody = (r: R) => (r.pesoKg != null && !(r.pesoKg >= 30 && r.pesoKg <= 300)) ? 'Peso entre 30 y 300 kg.' : (r.alturaCm != null && !(r.alturaCm >= 120 && r.alturaCm <= 230)) ? 'Altura entre 120 y 230 cm.' : null;


function MarcaInput({ value, onChange }: { value?: RunningProfile['marca']; onChange: (m: RunningProfile['marca']) => void }) {
  const [km, setKm] = useState<number>(value?.distanciaKm ?? 5);
  const [t, setT] = useState<string>(value ? fmtTime(value.tiempoSeg) : '');
  const [err, setErr] = useState<string | null>(null);
  const commit = (k: number, txt: string) => {
    if (!txt.trim()) { setErr(null); onChange(undefined); return; }
    const sec = parseTime(txt);
    if (!sec) { setErr('Escribe el tiempo como mm:ss o h:mm:ss.'); return; }
    setErr(null); onChange({ distanciaKm: k, tiempoSeg: sec });
  };
  return (
    <div className="field"><span>Marca reciente (opcional, últimos 3 meses)</span>
      <div className="row">
        <select id="eval-marca-km" aria-label="Distancia de la marca" value={km} onChange={(e) => { const k = Number(e.target.value); setKm(k); commit(k, t); }} style={{ flex: '1 1 120px' }}>
          {[[1, '1 km'], [1.5, '1500 m'], [3, '3 km'], [5, '5 km'], [10, '10 km'], [21.0975, 'Media maratón']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <input id="eval-marca-tiempo" type="text" inputMode="numeric" placeholder="mm:ss" aria-label="Tiempo de la marca" value={t} onChange={(e) => setT(e.target.value)} onBlur={() => commit(km, t)} style={{ flex: '1 1 120px' }} />
      </div>
      {err ? <span className="error">{err}</span> : <span className="small faint">Con una marca real verás ritmos orientativos. Sin ella, la intensidad se guía por sensaciones.</span>}
    </div>
  );
}

const STEPS: Step[] = [
  { id: 'identidad', fase: 1, titulo: 'Empecemos por ti',
    valid: (r) => !r.nombre.trim() ? 'Escribe un nombre o alias.' : !Number.isFinite(r.edad) ? 'Indica tu edad.' : r.edad < 18 ? 'Menarguez Fit IA es solo para mayores de 18 años.' : r.edad > 100 ? 'Revisa la edad.' : null,
    body: (r, u) => (
      <div className="stack">
        <div className="row">
          <label className="field" style={{ flex: '2 1 200px' }}><span>¿Cómo quieres que te llamemos?</span><input id="eval-nombre" type="text" maxLength={40} autoComplete="nickname" value={r.nombre} onChange={(e) => u({ nombre: e.target.value })} /></label>
          <label className="field" style={{ flex: '1 1 100px' }}><span>Edad</span><input id="eval-edad" type="number" inputMode="numeric" min={18} max={100} value={Number.isFinite(r.edad) ? r.edad : ''} onChange={(e) => u({ edad: e.target.value === '' ? NaN : Number(e.target.value) })} /></label>
        </div>
        <div className="field"><span>¿Qué quieres conseguir?</span>
          <div className="choice">{GOAL_OPTS.map((o) => <Option key={o.v} on={r.objetivo === o.v} onClick={() => u(o.v === 'carrera' ? { objetivo: o.v, carrera: r.carrera ?? { distancia: '5k', experiencia: 'ocasional', minutosSemana: 45 } } : { objetivo: o.v })} title={o.t} desc={o.d} />)}</div>
        </div>
      </div>) },
  { id: 'perfil', fase: 1, titulo: 'Tu experiencia y tu actividad',
    body: (r, u) => (
      <div className="stack">
        <div className="field"><span>Experiencia con el entrenamiento de fuerza</span>
          <div className="choice">{EXP_OPTS.map((o) => <Option key={o.v} on={r.experiencia === o.v} onClick={() => u({ experiencia: o.v })} title={o.t} desc={o.d} />)}</div>
        </div>
        <div className="field"><span>Actividad actual</span>
          <div className="choice">{ACT_OPTS.map((o) => <Option key={o.v} on={r.actividad === o.v} onClick={() => u({ actividad: o.v })} title={o.t} desc={o.d} />)}</div>
        </div>
      </div>) },
  { id: 'disponibilidad', fase: 1, titulo: '¿Cuánto tiempo tienes?',
    body: (r, u) => (
      <div className="stack">
        <div className="field"><span>Días por semana</span>
          <div className="chips">{[1, 2, 3, 4, 5, 6].map((d) => <Chip key={d} on={r.dias === d} onClick={() => u({ dias: d })}>{d}</Chip>)}</div>
        </div>
        <div className="field"><span>Minutos por sesión</span>
          <div className="chips">{[20, 30, 45, 60, 75, 90].map((m) => <Chip key={m} on={r.minutos === m} onClick={() => u({ minutos: m })}>{m} min</Chip>)}</div>
        </div>
        <p className="small faint">Siempre quedará al menos un día de descanso completo.</p>
      </div>) },
  { id: 'salud', fase: 1, titulo: 'Lesiones, dolor o limitaciones',
    valid: (r) => (r.screening.sintomasEsfuerzo || r.screening.restriccionProfesional) && !r.screening.valoradoPorProfesional
      ? null : null,
    body: (r, u) => (
      <div className="stack">
        <div className="field"><span>¿Alguna zona con molestias o limitaciones relevantes?</span>
          <div className="chips">
            <Chip on={r.limitaciones.length === 0} onClick={() => u({ limitaciones: [] })}>Ninguna</Chip>
            {(Object.keys(LIMITATION_LABEL) as Limitation[]).map((l) => <Chip key={l} on={r.limitaciones.includes(l)} onClick={() => u({ limitaciones: toggle(r.limitaciones, l) })}>{LIMITATION_LABEL[l]}</Chip>)}
          </div>
        </div>
        {r.limitaciones.length > 0 && (
          <>
            <label className="field"><span>Detalle (opcional)</span><input id="eval-lim-texto" type="text" maxLength={200} value={r.limitacionesTexto} onChange={(e) => u({ limitacionesTexto: e.target.value })} placeholder="P. ej. molestia en la rodilla derecha al bajar escaleras" /></label>
            <label className="check"><input id="eval-dolor" type="checkbox" checked={r.dolorQueAumenta} onChange={(e) => u({ dolorQueAumenta: e.target.checked })} /><span>El dolor es persistente o aumenta con el ejercicio</span></label>
          </>
        )}
        <hr className="divider" />
        <YesNo label="¿Has tenido dolor en el pecho, mareos o pérdida de conocimiento con el esfuerzo en los últimos meses?" value={r.screening.sintomasEsfuerzo} onChange={(v) => u({ screening: { ...r.screening, sintomasEsfuerzo: v } })} />
        <YesNo label="¿Algún profesional sanitario te ha indicado que no hagas ejercicio o que lo hagas solo con supervisión?" value={r.screening.restriccionProfesional} onChange={(v) => u({ screening: { ...r.screening, restriccionProfesional: v } })} />
        <YesNo label="¿Estás embarazada o en posparto reciente?" value={r.screening.embarazoPosparto} onChange={(v) => u({ screening: { ...r.screening, embarazoPosparto: v } })} />
        {(r.screening.sintomasEsfuerzo || r.screening.restriccionProfesional) && (
          <Notice kind="danger" title="Antes de empezar">
            {r.screening.sintomasEsfuerzo && <p>Si notas dolor en el pecho, falta de aire intensa o mareo ahora, detén cualquier esfuerzo y llama al 112. </p>}
            <p>Con estas respuestas conviene que un profesional sanitario te valore antes de empezar un programa.</p>
            <label className="check" style={{ marginTop: 8 }}><input id="eval-valorado" type="checkbox" checked={r.screening.valoradoPorProfesional} onChange={(e) => u({ screening: { ...r.screening, valoradoPorProfesional: e.target.checked } })} /><span>Un profesional sanitario me ha valorado y puedo entrenar siguiendo sus indicaciones.</span></label>
          </Notice>
        )}
      </div>) },
  { id: 'carrera', fase: 2, titulo: 'Tu carrera', show: (r) => r.objetivo === 'carrera',
    valid: (r) => !r.carrera ? 'Elige la distancia.' : r.carrera.fechaPrueba && r.carrera.fechaPrueba < new Date().toISOString().slice(0, 10) ? 'La fecha de la prueba ya ha pasado.' : null,
    body: (r, u) => {
      const c = r.carrera ?? { distancia: '5k' as RaceDistance, experiencia: 'ocasional' as const, minutosSemana: 45 };
      const uc = (p: Partial<RunningProfile>) => u({ carrera: { ...c, ...p } });
      return (
        <div className="stack">
          <div className="field"><span>Distancia que quieres preparar</span>
            <div className="chips">{(Object.keys(RACE_LABEL) as RaceDistance[]).map((d) => <Chip key={d} on={c.distancia === d} onClick={() => uc({ distancia: d })}>{RACE_LABEL[d]}</Chip>)}</div>
            <span className="small faint">La maratón no se incluye en esta versión: su preparación conviene supervisarla de forma individual.</span>
          </div>
          <div className="field"><span>¿Cómo es tu experiencia corriendo?</span>
            <div className="choice">
              <Option on={c.experiencia === 'empiezo'} onClick={() => uc({ experiencia: 'empiezo' })} title="Empiezo" desc="No corro o no aguanto 20–30 min seguidos." />
              <Option on={c.experiencia === 'ocasional'} onClick={() => uc({ experiencia: 'ocasional' })} title="Ocasional" desc="Corro 30 min seguidos, 1–2 veces por semana." />
              <Option on={c.experiencia === 'regular'} onClick={() => uc({ experiencia: 'regular' })} title="Regular" desc="Corro 3 o más días por semana desde hace meses." />
            </div>
          </div>
          <div className="field"><span>¿Cuántos minutos corres ahora a la semana?</span>
            <div className="chips">{[[0, 'Nada'], [20, 'Menos de 30'], [45, '30–60'], [90, '60–120'], [150, 'Más de 120']].map(([v, l]) => <Chip key={v} on={c.minutosSemana === v} onClick={() => uc({ minutosSemana: v as number })}>{l}</Chip>)}</div>
            <span className="small faint">Sirve para que la tirada larga y los rodajes crezcan de forma gradual.</span>
          </div>
          <label className="field"><span>Fecha de la prueba (opcional)</span>
            <input id="eval-fecha-prueba" type="date" min={new Date().toISOString().slice(0, 10)} value={c.fechaPrueba ?? ''} onChange={(e) => uc({ fechaPrueba: e.target.value || undefined })} />
          </label>
          <MarcaInput value={c.marca} onChange={(m) => uc({ marca: m })} />
        </div>
      );
    } },
  { id: 'material', fase: 2, titulo: 'Dónde y con qué entrenas',
    body: (r, u) => (
      <div className="stack">
        <div className="choice">
          <Option on={r.lugar === 'casa'} onClick={() => u({ lugar: 'casa', material: r.material.filter((m) => m !== 'maquinas') })} title="En casa o al aire libre" />
          <Option on={r.lugar === 'gimnasio'} onClick={() => u({ lugar: 'gimnasio', material: ['corporal', 'mancuernas', 'bandas', 'maquinas', 'banco', 'barra_dominadas'] })} title="En un gimnasio" />
        </div>
        <div className="field"><span>Material disponible</span>
          <div className="chips">
            {(Object.keys(EQUIPMENT_LABEL) as Equipment[]).filter((m) => m !== 'corporal').map((m) => (
              <Chip key={m} on={r.material.includes(m)} onClick={() => u({ material: toggle(r.material, m).concat(r.material.includes('corporal') ? [] : ['corporal']) })}>{EQUIPMENT_LABEL[m]}</Chip>
            ))}
          </div>
          <p className="small faint">El peso corporal siempre está incluido.</p>
        </div>
        <div className="field"><span>Actividades aeróbicas que te gustan (opcional)</span>
          <div className="chips">{(Object.keys(AEROBIC_LABEL) as Aerobic[]).map((a) => <Chip key={a} on={r.aerobicoPreferido.includes(a)} onClick={() => u({ aerobicoPreferido: toggle(r.aerobicoPreferido, a) })}>{AEROBIC_LABEL[a]}</Chip>)}</div>
        </div>
        <AvoidPicker r={r} u={u} />
      </div>) },
  { id: 'recuperacion', fase: 2, titulo: 'Recuperación y últimos detalles', valid: validBody,
    body: (r, u) => (
      <div className="stack">
        <div className="field"><span>Horas de sueño habituales</span><Seg label="Horas de sueño" value={r.sueno} options={SLEEP} onChange={(v) => u({ sueno: v })} /></div>
        <div className="field"><span>¿Cómo te recuperas tras un esfuerzo?</span><Seg label="Recuperación" value={r.recuperacion} options={REC} onChange={(v) => u({ recuperacion: v })} /></div>
        {needsIndications(r) && (
          <label className="field"><span>Indicaciones de un profesional para el ejercicio (opcional)</span>
            <textarea id="eval-indicaciones" maxLength={400} value={r.indicacionesProfesionales} onChange={(e) => u({ indicacionesProfesionales: e.target.value })} placeholder="P. ej. evitar cargar peso por encima de la cabeza" />
            <span className="small faint">Se mostrarán en tu plan como recordatorio. La aplicación no las interpreta clínicamente.</span>
          </label>
        )}
        {showBody(r) && (
          <div className="field"><span>Peso y altura (voluntarios, como punto de partida del seguimiento)</span>
            <div className="row">
              <label className="field" style={{ flex: 1 }}><span className="small muted">Peso (kg)</span><input id="eval-peso" type="number" inputMode="decimal" value={r.pesoKg ?? ''} onChange={(e) => u({ pesoKg: e.target.value === '' ? undefined : Number(e.target.value) })} /></label>
              <label className="field" style={{ flex: 1 }}><span className="small muted">Altura (cm)</span><input id="eval-altura" type="number" inputMode="numeric" value={r.alturaCm ?? ''} onChange={(e) => u({ alturaCm: e.target.value === '' ? undefined : Number(e.target.value) })} /></label>
            </div>
          </div>
        )}
      </div>) },
];

export function Evaluation() {
  const { state, set, go, sel } = useApp();
  const draft = state.borrador;
  const [error, setError] = useState<string | null>(null);
  const r = draft?.respuestas as R | undefined;
  const steps = useMemo(() => (r ? STEPS.filter((s) => !s.show || s.show(r)) : []), [r]);

  useEffect(() => {
    if (sel.editStep && draft) {
      const i = steps.findIndex((s) => s.id === sel.editStep);
      if (i >= 0 && i !== draft.paso) set((s) => ({ ...s, borrador: s.borrador && { ...s.borrador, paso: i } }));
    }
  }, [sel.editStep]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!draft || !r) {
    return <div className="screen"><Notice>No hay ninguna evaluación en curso.</Notice><button type="button" className="btn" onClick={() => go('bienvenida')}>Volver</button></div>;
  }
  const idx = Math.min(draft.paso, steps.length - 1);
  const step = steps[idx];
  const u = (p: Partial<R>) => { setError(null); set((s) => ({ ...s, borrador: s.borrador && { ...s.borrador, respuestas: { ...s.borrador.respuestas, ...p } } })); };
  const fase1 = steps.filter((s) => s.fase === 1).length;
  const next = () => {
    const err = step.valid?.(r) ?? null;
    if (err) { setError(err); return; }
    if (sel.editStep || idx === steps.length - 1) { go('resumen'); return; }
    set((s) => ({ ...s, borrador: s.borrador && { ...s.borrador, paso: idx + 1 } }));
  };
  const back = () => {
    if (idx === 0) { go('bienvenida'); return; }
    set((s) => ({ ...s, borrador: s.borrador && { ...s.borrador, paso: idx - 1 } }));
  };

  return (
    <div className="screen">
      <div className="stack">
        <div className="row between small">
          <span className="eyebrow">{step.fase === 1 ? 'Fase 1 · Lo esencial' : 'Fase 2 · Ajuste fino'}</span>
          <span className="faint num">{idx + 1} / {steps.length}</span>
        </div>
        <Progress value={(idx + 1) / steps.length} label="Progreso de la evaluación" />
      </div>
      {idx === fase1 && !sel.editStep && <Notice title="Fase 1 completada">Ahora solo unas preguntas para ajustar el plan a tu material y recuperación.</Notice>}
      <h2>{step.titulo}</h2>
      {step.body(r, u)}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="row between">
        <button type="button" className="btn" onClick={sel.editStep ? () => go('resumen') : back}>{sel.editStep ? 'Cancelar' : 'Atrás'}</button>
        <button type="button" className="btn primary" onClick={next}>{sel.editStep ? 'Guardar y volver' : idx === steps.length - 1 ? 'Ver resumen' : 'Siguiente'}</button>
      </div>
      <p className="small faint">Tus respuestas se guardan en este navegador mientras avanzas.</p>
    </div>
  );
}

const yes = (b: boolean) => (b ? 'Sí' : 'No');

export function Summary() {
  const { state, set, go } = useApp();
  const r = state.borrador?.respuestas as R | undefined;
  const [msg, setMsg] = useState<{ motivo: string; faltan?: string[] } | null>(null);
  const [acepto, setAcepto] = useState<boolean>(!!state.borrador?.respuestas.consentimientoLocal);
  if (!r) {
    return <div className="screen"><Notice>No hay datos de perfil pendientes de revisar.</Notice><button type="button" className="btn" onClick={() => go(state.activeProfileId ? 'inicio' : 'bienvenida')}>Volver</button></div>;
  }
  const exists = !!state.perfiles[r.id];
  const edit = (id: string) => go('evaluacion', { editStep: id });
  const check = canPlan(r);

  const generar = () => {
    const now = new Date();
    const profile: Profile = { ...r, nombre: r.nombre.trim(), actualizado: now.toISOString(), consentimientoLocal: r.consentimientoLocal ?? now.toISOString() };
    const res = generatePlan(profile, now);
    if (!res.ok) { setMsg(res); return; }
    set((s) => {
      const prev = s.perfiles[profile.id];
      const pd = prev ? { ...prev, profile, plan: res.plan } : { ...emptyProfileData(profile), plan: res.plan };
      return { ...s, borrador: null, activeProfileId: profile.id, perfiles: { ...s.perfiles, [profile.id]: pd } };
    });
    go('plan');
  };

  const Section = ({ id, title, children }: { id: string; title: string; children: React.ReactNode }) => (
    <div className="card">
      <div className="row between"><h3>{title}</h3><button type="button" className="btn ghost sm" onClick={() => edit(id)}>Editar</button></div>
      <div className="small muted stack" style={{ gap: 4 }}>{children}</div>
    </div>
  );

  return (
    <div className="screen">
      <div className="stack">
        <span className="eyebrow">Resumen del perfil</span>
        <h1>Revisa antes de generar</h1>
        <p className="muted">Puedes corregir cualquier apartado. {exists && 'Al regenerar, tus registros se conservan.'}</p>
      </div>
      <Section id="identidad" title="Datos básicos"><p>{r.nombre || '—'} · {Number.isFinite(r.edad) ? `${r.edad} años` : 'edad sin indicar'}</p></Section>
      <Section id="identidad" title="Objetivo"><p>{GOAL_OPTS.find((o) => o.v === r.objetivo)?.t}</p></Section>
      <Section id="perfil" title="Experiencia"><p>{EXP_OPTS.find((o) => o.v === r.experiencia)?.t}</p></Section>
      <Section id="perfil" title="Actividad actual"><p>{ACT_OPTS.find((o) => o.v === r.actividad)?.t}</p></Section>
      <Section id="disponibilidad" title="Disponibilidad"><p>{r.dias} días por semana · {r.minutos} min por sesión</p></Section>
      <Section id="salud" title="Limitaciones y salud">
        <p>Zonas: {r.limitaciones.length ? r.limitaciones.map((l) => LIMITATION_LABEL[l]).join(', ') : 'ninguna'}{r.limitacionesTexto && ` · ${r.limitacionesTexto}`}</p>
        {r.limitaciones.length > 0 && <p>Dolor persistente o que aumenta: {yes(r.dolorQueAumenta)}</p>}
        <p>Síntomas con el esfuerzo: {yes(r.screening.sintomasEsfuerzo)} · Restricción profesional: {yes(r.screening.restriccionProfesional)} · Embarazo o posparto: {yes(r.screening.embarazoPosparto)}</p>
      </Section>
      {r.objetivo === 'carrera' && r.carrera && <Section id="carrera" title="Carrera">
        <p>{RACE_LABEL[r.carrera.distancia]} · experiencia {r.carrera.experiencia} · {r.carrera.minutosSemana} min/semana ahora</p>
        <p>Prueba: {r.carrera.fechaPrueba ? new Date(r.carrera.fechaPrueba + 'T12:00:00').toLocaleDateString('es-ES') : 'sin fecha'} · Marca: {r.carrera.marca ? `${fmtTime(r.carrera.marca.tiempoSeg)} en ${r.carrera.marca.distanciaKm.toString().replace('.', ',')} km` : 'sin indicar'}</p>
      </Section>}
      <Section id="material" title="Lugar y material"><p>{r.lugar === 'casa' ? 'Casa o exterior' : 'Gimnasio'} · {r.material.map((m) => EQUIPMENT_LABEL[m]).join(', ')}</p></Section>
      <Section id="material" title="Preferencias">
        <p>Aeróbico: {r.aerobicoPreferido.length ? r.aerobicoPreferido.map((a) => AEROBIC_LABEL[a]).join(', ') : 'sin preferencia'}</p>
        <p>Evitar: {r.evitarEjercicios.length ? r.evitarEjercicios.map((id) => EXERCISE_BY_ID[id]?.nombre).join(', ') : 'nada'}</p>
      </Section>
      <Section id="recuperacion" title="Sueño y recuperación"><p>{SLEEP.find((s) => s.v === r.sueno)?.l} · recuperación {REC.find((s) => s.v === r.recuperacion)?.l.toLowerCase()}</p></Section>
      {needsIndications(r) && <Section id="recuperacion" title="Indicaciones profesionales"><p>{r.indicacionesProfesionales || 'Ninguna indicada'}</p></Section>}
      {showBody(r) && <Section id="recuperacion" title="Datos corporales"><p>{r.pesoKg ? `${r.pesoKg} kg` : 'Peso no indicado'} · {r.alturaCm ? `${r.alturaCm} cm` : 'altura no indicada'}</p></Section>}

      {!check.ok && <Notice kind={check.faltan ? 'warn' : 'danger'} title="No se puede generar todavía">{check.motivo}{check.faltan && <> Falta: {check.faltan.join(', ')}.</>}</Notice>}
      {msg && <Notice kind="danger">{msg.motivo}</Notice>}
      <label className="check consent"><input id="eval-consent" type="checkbox" checked={acepto} onChange={(e) => setAcepto(e.target.checked)} />
        <span>Acepto guardar mi perfil y mis registros en este navegador para personalizar y seguir mi entrenamiento. Puedo exportarlos o borrarlos en cualquier momento desde Ajustes. <span className="faint">No es un servicio sanitario.</span></span></label>
      <button type="button" className="btn primary block" disabled={!check.ok || !acepto} onClick={generar}>{exists ? 'Guardar y regenerar plan' : 'Generar mi plan'}</button>
      <button type="button" className="btn ghost" onClick={() => { set((s) => ({ ...s, borrador: null })); go(state.activeProfileId ? 'inicio' : 'bienvenida'); }}>Descartar cambios</button>
    </div>
  );
}
