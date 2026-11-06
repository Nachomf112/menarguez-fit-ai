import { useMemo, useState } from 'react';
import { EXERCISE_BY_ID } from '../data/exercises';
import { exerciseHistory, weekStart, weeklyReview, type Suggestion } from '../domain/progression';
import type { Measure } from '../domain/types';
import { LineChart, Notice, Seg, Stat, useApp, PageTop } from '../ui/kit';

const STATUS_BADGE = { completada: 'ok', parcial: 'warn', cancelada: 'danger' } as const;
const STATUS_LABEL = { completada: 'Completada', parcial: 'Parcial', cancelada: 'Cancelada' } as const;
type Tab = 'semana' | 'calendario' | 'ejercicio' | 'medidas' | 'historial';

export function ProgressScreen() {
  const { pd } = useApp();
  const [tab, setTab] = useState<Tab>('semana');
  if (!pd) return null;
  return (
    <div className="screen">
      <div className="stack">
        <PageTop eyebrow="Tu evolución" title="Seguimiento" sub="Registros reales, sin comparaciones inventadas." />
        {pd.profile.demo && <Notice kind="yellow">Perfil de demostración: los datos mostrados son de ejemplo.</Notice>}
      </div>
      <Seg label="Sección" value={tab} onChange={setTab} options={[
        { v: 'semana', l: 'Semana' }, { v: 'calendario', l: 'Calendario' }, { v: 'ejercicio', l: 'Ejercicios' }, { v: 'medidas', l: 'Medidas' }, { v: 'historial', l: 'Historial' },
      ]} />
      {tab === 'semana' && <WeekTab />}
      {tab === 'calendario' && <CalendarTab />}
      {tab === 'ejercicio' && <ExerciseTab />}
      {tab === 'medidas' && <MeasuresTab />}
      {tab === 'historial' && <HistoryTab />}
    </div>
  );
}

function WeekTab() {
  const { pd, updatePd } = useApp();
  const r = weeklyReview(pd!);
  const ini = r.inicio;
  const decided = (s: Suggestion) => pd!.decisiones.find((d) => d.exerciseId === s.exerciseId && new Date(d.fecha) >= ini);
  const decide = (s: Suggestion, tipo: 'aceptada' | 'conservada') => updatePd((d) => {
    const fecha = new Date().toISOString();
    const ajustes = { ...d.ajustes };
    if (tipo === 'aceptada' && s.cargaSugerida) ajustes[s.exerciseId] = { cargaObjetivo: s.cargaSugerida, nota: s.titulo, fecha };
    return { ...d, ajustes, decisiones: [...d.decisiones, { fecha, exerciseId: s.exerciseId, tipo, texto: s.titulo, cargaObjetivo: s.cargaSugerida }] };
  });

  // Cumplimiento de las últimas 4 semanas
  const weeks = Array.from({ length: 4 }, (_, k) => {
    const a = new Date(ini); a.setDate(a.getDate() - 7 * (3 - k));
    const b = new Date(a); b.setDate(b.getDate() + 7);
    const ss = pd!.sesiones.filter((s) => { const f = new Date(s.fecha); return f >= a && f < b; });
    return { a, done: ss.filter((s) => s.estado === 'completada').length, partial: ss.filter((s) => s.estado === 'parcial').length };
  });
  const prev = pd!.plan?.sesiones.length ?? 0;

  return (
    <div className="stack">
      <div className="card">
        <h3>Semana del {ini.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}</h3>
        <div className="stats">
          <Stat v={`${r.completadas + r.parciales}/${r.previstas}`} l="realizadas / previstas" />
          <Stat v={r.parciales} l="parciales" />
          <Stat v={r.canceladas} l="canceladas" />
          <Stat v={r.rpeMedio ?? '—'} l="esfuerzo medio" />
          <Stat v={r.molestias} l="ejercicios con molestias" />
        </div>
        <Notice kind={r.suficientes ? 'info' : 'warn'}>{r.mensaje}</Notice>
      </div>
      {r.sugerencias.length > 0 && <h3>Ajustes propuestos</h3>}
      {r.sugerencias.map((s) => {
        const d = decided(s);
        const e = EXERCISE_BY_ID[s.exerciseId];
        return (
          <div key={s.exerciseId} className="card">
            <div className="row between"><strong>{e.nombre}</strong><span className={`badge ${s.tipo === 'progresar' ? 'ok' : s.tipo === 'reducir' ? 'danger' : 'blue'}`}>{s.titulo}</span></div>
            <p className="small muted">{s.motivo}</p>
            {s.avisoProfesional && <Notice kind="danger">Si la molestia persiste o aumenta, consulta a un profesional sanitario.</Notice>}
            {d ? <p className="small"><span className="badge">{d.tipo === 'aceptada' ? 'Aceptada' : 'Conservas tu planificación'}</span></p>
              : (s.tipo === 'progresar' || s.tipo === 'reducir') && (
                <div className="row">
                  <button type="button" className="btn primary sm" onClick={() => decide(s, 'aceptada')}>Aceptar</button>
                  <button type="button" className="btn sm" onClick={() => decide(s, 'conservada')}>Mantener mi plan</button>
                </div>
              )}
          </div>
        );
      })}
      <div className="card">
        <h3>Últimas 4 semanas</h3>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Semana</th><th>Completadas</th><th>Parciales</th><th>Previstas</th></tr></thead>
            <tbody>{weeks.map((w) => (
              <tr key={w.a.toISOString()}><td>{w.a.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</td><td className="num">{w.done}</td><td className="num">{w.partial}</td><td className="num">{prev}</td></tr>
            ))}</tbody>
          </table>
        </div>
        <p className="small faint">Las sesiones previstas se refieren al plan actual.</p>
      </div>
    </div>
  );
}

function CalendarTab() {
  const { pd } = useApp();
  const [offset, setOffset] = useState(0);
  const now = new Date();
  const month = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const lead = (month.getDay() + 6) % 7;
  const planned = new Set(pd!.plan?.sesiones.map((s) => s.dia));
  const byDay = new Map<number, string>();
  const rank = { completada: 3, parcial: 2, cancelada: 1 } as const;
  pd!.sesiones.forEach((s) => {
    const f = new Date(s.fecha);
    if (f.getFullYear() === month.getFullYear() && f.getMonth() === month.getMonth()) {
      const cur = byDay.get(f.getDate()) as keyof typeof rank | undefined;
      if (!cur || rank[s.estado] > rank[cur]) byDay.set(f.getDate(), s.estado);
    }
  });
  return (
    <div className="card">
      <div className="row between">
        <button type="button" className="btn sm" onClick={() => setOffset(offset - 1)} aria-label="Mes anterior">←</button>
        <h3 style={{ textTransform: 'capitalize' }}>{month.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}</h3>
        <button type="button" className="btn sm" onClick={() => setOffset(offset + 1)} aria-label="Mes siguiente" disabled={offset >= 0}>→</button>
      </div>
      <div className="cal">
        {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d) => <span key={d} className="h">{d}</span>)}
        {Array.from({ length: lead }, (_, i) => <span key={`e${i}`} className="c empty" />)}
        {Array.from({ length: days }, (_, i) => {
          const d = i + 1;
          const date = new Date(month.getFullYear(), month.getMonth(), d);
          const st = byDay.get(d);
          const isToday = date.toDateString() === now.toDateString();
          const pl = !st && planned.has((date.getDay() + 6) % 7) && date >= weekStart(now);
          return <span key={d} className={`c ${st ?? ''} ${pl ? 'planned' : ''} ${isToday ? 'today' : ''}`} title={st ? STATUS_LABEL[st as keyof typeof STATUS_LABEL] : pl ? 'Prevista' : ''}>{d}</span>;
        })}
      </div>
      <div className="legend">
        <span><i style={{ background: 'var(--blue)' }} />Completada</span>
        <span><i style={{ border: '1px solid var(--yellow)' }} />Parcial</span>
        <span><i style={{ border: '1px solid var(--danger)' }} />Cancelada</span>
        <span><i style={{ border: '1px dashed var(--line-strong)' }} />Prevista</span>
      </div>
    </div>
  );
}

function ExerciseTab() {
  const { pd } = useApp();
  const withData = useMemo(() => {
    const ids = new Set(pd!.sesiones.filter((s) => s.estado !== 'cancelada').flatMap((s) => s.ejercicios.filter((e) => e.sets.some((x) => x.hecho)).map((e) => e.exerciseId)));
    return [...ids].map((id) => EXERCISE_BY_ID[id]).filter(Boolean).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [pd]);
  const masRegistros = useMemo(() => [...withData].sort((a, b) => exerciseHistory(pd!.sesiones, b.id).length - exerciseHistory(pd!.sesiones, a.id).length)[0]?.id ?? '', [withData, pd]);
  const [id, setId] = useState<string>(masRegistros);
  if (!withData.length) return <Notice kind="warn">Aún no hay registros. Cuando completes series, aquí verás su evolución.</Notice>;
  const e = EXERCISE_BY_ID[id] ?? withData[0];
  const hist = exerciseHistory(pd!.sesiones, e.id);
  const fmt = (iso: string) => new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
  const loadPts = hist.map((h) => { const k = h.log.sets.filter((s) => s.hecho && s.kg).map((s) => s.kg as number); return k.length ? { x: fmt(h.fecha), y: Math.max(...k) } : null; }).filter(Boolean) as { x: string; y: number }[];
  const isSec = e.unidad === 'segundos';
  const repPts = hist.map((h) => ({ x: fmt(h.fecha), y: h.log.sets.filter((s) => s.hecho).reduce((a, s) => a + ((isSec ? s.segundos : s.reps) ?? 0), 0) }));
  return (
    <div className="stack">
      <label className="field"><span>Ejercicio</span>
        <select id="prog-ex" value={e.id} onChange={(ev) => setId(ev.target.value)}>{withData.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select>
      </label>
      <p className="small faint">Solo se comparan registros del mismo ejercicio y unidades. {hist.length} registros.</p>
      {hist.length < 2 ? <Notice kind="warn">Datos insuficientes: hace falta al menos 2 sesiones de este ejercicio para ver una evolución.</Notice> : (
        <>
          {loadPts.length >= 2 && <div className="card"><h3>Carga máxima por sesión</h3><LineChart points={loadPts} unit="kg" label={`Carga máxima de ${e.nombre}`} /></div>}
          <div className="card"><h3>{isSec ? 'Segundos totales' : 'Repeticiones totales'} por sesión</h3><LineChart points={repPts} unit={isSec ? 's' : 'reps'} label={`Volumen de ${e.nombre}`} /></div>
          <p className="small muted">Una subida en estas gráficas solo indica mejora si el esfuerzo y la técnica fueron similares. Revisa el detalle en la tabla.</p>
        </>
      )}
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Fecha</th><th>Series</th><th>Esf.</th><th>Molestia</th><th>Técnica</th></tr></thead>
          <tbody>{[...hist].reverse().map((h) => (
            <tr key={h.sessionId}><td>{fmt(h.fecha)}</td><td className="num">{h.log.sets.filter((s) => s.hecho).map((s) => (s.kg ? `${isSec ? s.segundos : s.reps}×${s.kg}` : `${isSec ? s.segundos : s.reps}`)).join(', ')}</td><td>{h.log.rpe ?? '—'}</td><td>{['no', 'leve', 'moderada', 'fuerte'][h.log.molestia]}</td><td>{h.log.tecnicaEstable ? 'estable' : 'irregular'}</td></tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

function MeasuresTab() {
  const { pd, updatePd } = useApp();
  const [m, setM] = useState<{ peso: string; cintura: string; cadera: string; brazo: string }>({ peso: '', cintura: '', cadera: '', brazo: '' });
  const [err, setErr] = useState<string | null>(null);
  const meds = [...pd!.medidas].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const num = (s: string) => (s.trim() === '' ? undefined : Number(s.replace(',', '.')));
  const add = () => {
    const nm: Measure = { fecha: new Date().toISOString(), pesoKg: num(m.peso), cinturaCm: num(m.cintura), caderaCm: num(m.cadera), brazoCm: num(m.brazo) };
    const vals = [nm.pesoKg, nm.cinturaCm, nm.caderaCm, nm.brazoCm].filter((v) => v !== undefined);
    if (!vals.length) { setErr('Introduce al menos una medida.'); return; }
    if (vals.some((v) => !Number.isFinite(v) || (v as number) <= 0 || (v as number) > 400)) { setErr('Revisa los valores.'); return; }
    updatePd((d) => ({ ...d, medidas: [...d.medidas, nm] }));
    setM({ peso: '', cintura: '', cadera: '', brazo: '' }); setErr(null);
  };
  const series = (k: keyof Measure) => meds.filter((x) => typeof x[k] === 'number').map((x) => ({ x: new Date(x.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }), y: x[k] as number }));
  const peso = series('pesoKg'), cintura = series('cinturaCm');
  return (
    <div className="stack">
      <Notice>Las medidas son opcionales. Tómalas en condiciones parecidas (misma hora y ropa) para que sean comparables.</Notice>
      <div className="card">
        <h3>Añadir medidas de hoy</h3>
        <div className="row">
          {([['peso', 'Peso (kg)'], ['cintura', 'Cintura (cm)'], ['cadera', 'Cadera (cm)'], ['brazo', 'Brazo (cm)']] as const).map(([k, l]) => (
            <label key={k} className="field" style={{ flex: '1 1 120px' }}><span>{l}</span><input id={`med-${k}`} inputMode="decimal" type="text" value={m[k]} onChange={(e) => setM({ ...m, [k]: e.target.value })} /></label>
          ))}
        </div>
        {err && <p className="error" role="alert">{err}</p>}
        <button type="button" className="btn primary" onClick={add}>Guardar medidas</button>
      </div>
      {peso.length >= 2 ? <div className="card"><h3>Peso</h3><LineChart points={peso} unit="kg" label="Evolución del peso" /></div> : meds.length > 0 && <p className="small faint">Con dos registros de peso aparecerá la gráfica.</p>}
      {cintura.length >= 2 && <div className="card"><h3>Cintura</h3><LineChart points={cintura} unit="cm" label="Evolución de la cintura" /></div>}
      {meds.length > 0 && (
        <div className="card table-wrap">
          <table>
            <thead><tr><th>Fecha</th><th>Peso</th><th>Cintura</th><th>Cadera</th><th>Brazo</th><th /></tr></thead>
            <tbody>{[...meds].reverse().map((x) => (
              <tr key={x.fecha}><td>{new Date(x.fecha).toLocaleDateString('es-ES')}</td><td className="num">{x.pesoKg ?? '—'}</td><td className="num">{x.cinturaCm ?? '—'}</td><td className="num">{x.caderaCm ?? '—'}</td><td className="num">{x.brazoCm ?? '—'}</td>
                <td><button type="button" className="btn ghost sm" aria-label="Borrar medida" onClick={() => updatePd((d) => ({ ...d, medidas: d.medidas.filter((y) => y.fecha !== x.fecha) }))}>✕</button></td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function HistoryTab() {
  const { pd, go } = useApp();
  const list = [...pd!.sesiones].sort((a, b) => b.fecha.localeCompare(a.fecha));
  if (!list.length) return <Notice kind="warn">Todavía no has registrado sesiones.</Notice>;
  return (
    <div className="list">
      {list.map((s) => {
        const molestias = s.ejercicios.filter((e) => e.molestia >= 1).length;
        return (
          <button type="button" key={s.id} className="item" onClick={() => !pd!.activa && go('entrenar', { summaryId: s.id })} disabled={!!pd!.activa}>
            <div>
              <strong>{s.titulo}</strong>
              <div className="small muted">{new Date(s.fecha).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}
                {s.rpeSesion != null && ` · esfuerzo ${s.rpeSesion}`}{molestias ? ` · ${molestias} con molestias` : ''}{s.recuperacion === 'mala' ? ' · mal descansado' : ''}</div>
            </div>
            <span className={`badge ${STATUS_BADGE[s.estado]}`}>{STATUS_LABEL[s.estado]}</span>
          </button>
        );
      })}
    </div>
  );
}
