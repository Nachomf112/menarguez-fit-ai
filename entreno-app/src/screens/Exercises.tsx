import { useMemo, useState } from 'react';
import { DIFFICULTY_LABEL, EQUIPMENT_LABEL, EXERCISES, EXERCISE_BY_ID, GROUP_LABEL, LIMITATION_LABEL } from '../data/exercises';
import { describeSets, exerciseHistory } from '../domain/progression';
import type { Equipment, MuscleGroup } from '../domain/types';
import { Chip, Icon, Notice, useApp } from '../ui/kit';
import type { Pattern } from '../domain/types';

const PATTERN_LABEL: Record<Pattern, string> = {
  sentadilla: 'Sentadilla', bisagra: 'Bisagra de cadera', gluteo: 'Extensión de cadera (glúteo)', unilateral: 'Pierna unilateral',
  pierna_aisl: 'Aislamiento de pierna', gemelo: 'Flexión plantar (gemelo)', empuje_h: 'Empuje horizontal', empuje_v: 'Empuje vertical',
  traccion_h: 'Tracción horizontal', traccion_v: 'Tracción vertical', hombro_aisl: 'Aislamiento de hombro', biceps: 'Flexión de codo',
  triceps: 'Extensión de codo', tronco: 'Estabilidad del tronco',
};

export function Exercises() {
  const { sel, go } = useApp();
  if (sel.exerciseId && EXERCISE_BY_ID[sel.exerciseId]) return <ExerciseSheet id={sel.exerciseId} />;
  return <Catalog onOpen={(id) => go('ejercicios', { exerciseId: id })} />;
}

function Catalog({ onOpen }: { onOpen: (id: string) => void }) {
  const { pd } = useApp();
  const [q, setQ] = useState('');
  const [grupo, setGrupo] = useState<MuscleGroup | null>(null);
  const [mat, setMat] = useState<Equipment | null>(null);
  const [dif, setDif] = useState<1 | 2 | 3 | null>(null);
  const [fav, setFav] = useState(false);
  const favs = pd?.favoritos ?? [];
  const list = useMemo(() => EXERCISES.filter((e) =>
    (!q.trim() || `${e.nombre} ${e.musculos.join(' ')}`.toLowerCase().includes(q.trim().toLowerCase()))
    && (!grupo || e.grupo === grupo) && (!mat || e.material.includes(mat)) && (!dif || e.dificultad === dif) && (!fav || favs.includes(e.id))),
  [q, grupo, mat, dif, fav, favs]);

  return (
    <div className="screen">
      <div className="stack">
        <span className="eyebrow">Catálogo</span>
        <h1>Ejercicios</h1>
      </div>
      <input id="cat-search" type="search" placeholder="Buscar por nombre o músculo" aria-label="Buscar ejercicios" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="stack" style={{ gap: 8 }}>
        <div className="chips" aria-label="Grupo muscular">
          {(Object.keys(GROUP_LABEL) as MuscleGroup[]).map((g) => <Chip key={g} on={grupo === g} onClick={() => setGrupo(grupo === g ? null : g)}>{GROUP_LABEL[g]}</Chip>)}
        </div>
        <div className="chips" aria-label="Material">
          {(Object.keys(EQUIPMENT_LABEL) as Equipment[]).map((m) => <Chip key={m} on={mat === m} onClick={() => setMat(mat === m ? null : m)}>{EQUIPMENT_LABEL[m]}</Chip>)}
        </div>
        <div className="chips" aria-label="Dificultad">
          {([1, 2, 3] as const).map((d) => <Chip key={d} on={dif === d} onClick={() => setDif(dif === d ? null : d)}>{DIFFICULTY_LABEL[d]}</Chip>)}
          {pd && <Chip on={fav} onClick={() => setFav(!fav)}>★ Favoritos</Chip>}
        </div>
      </div>
      <p className="small faint" aria-live="polite">{list.length} ejercicios</p>
      <div className="list">
        {list.map((e) => (
          <button type="button" key={e.id} className="item" onClick={() => onOpen(e.id)}>
            <div>
              <strong>{e.nombre}</strong>
              <div className="small muted">{GROUP_LABEL[e.grupo]} · {e.material.map((m) => EQUIPMENT_LABEL[m]).join(', ')}</div>
            </div>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              {favs.includes(e.id) && <span style={{ color: 'var(--yellow)' }} aria-label="Favorito">★</span>}
              <span className="badge">{DIFFICULTY_LABEL[e.dificultad]}</span>
            </div>
          </button>
        ))}
        {list.length === 0 && <Notice>No hay ejercicios con esos filtros.</Notice>}
      </div>
    </div>
  );
}

function ExerciseSheet({ id }: { id: string }) {
  const { pd, updatePd, go } = useApp();
  const e = EXERCISE_BY_ID[id];
  const isFav = !!pd?.favoritos.includes(id);
  const hist = pd ? exerciseHistory(pd.sesiones, id).slice(-3).reverse() : [];
  const link = (x?: string) => x && EXERCISE_BY_ID[x] && (
    <button type="button" className="btn ghost sm" style={{ padding: 0, minHeight: 0 }} onClick={() => go('ejercicios', { exerciseId: x })}>{EXERCISE_BY_ID[x].nombre}</button>
  );
  const blocked = pd ? e.evitarSi.filter((l) => pd.profile.limitaciones.includes(l)) : [];

  return (
    <div className="screen">
      <button type="button" className="btn ghost sm" style={{ justifySelf: 'start' }} onClick={() => go('ejercicios')}>← Catálogo</button>
      <div className="stack">
        <span className="eyebrow">{GROUP_LABEL[e.grupo]} · {DIFFICULTY_LABEL[e.dificultad]}</span>
        <div className="row between" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
          <h1>{e.nombre}</h1>
          {pd && (
            <button type="button" className="iconbtn" aria-pressed={isFav} aria-label={isFav ? 'Quitar de favoritos' : 'Añadir a favoritos'}
              style={{ color: isFav ? 'var(--yellow)' : 'var(--muted)', flex: 'none' }}
              onClick={() => updatePd((d) => ({ ...d, favoritos: isFav ? d.favoritos.filter((x) => x !== id) : [...d.favoritos, id] }))}>
              <Icon name="star" filled={isFav} size={20} />
            </button>
          )}
        </div>
      </div>
      {blocked.length > 0 && <Notice kind="warn">No se incluye en tu plan por tu limitación declarada ({blocked.map((l) => LIMITATION_LABEL[l].toLowerCase()).join(', ')}).</Notice>}
      <div className="demo-frame">Demostración visual pendiente. Sigue los pasos escritos y, si tienes dudas, pide supervisión presencial.</div>
      <div className="card">
        <table>
          <tbody>
            <tr><th>Patrón</th><td>{PATTERN_LABEL[e.patron]}</td></tr>
            <tr><th>Músculos</th><td>{e.musculos.join(', ')}</td></tr>
            <tr><th>Material</th><td>{e.material.map((m) => EQUIPMENT_LABEL[m]).join(', ')}</td></tr>
            <tr><th>Medida</th><td>{e.unidad === 'segundos' ? 'Tiempo (segundos)' : e.unidad === 'reps_lado' ? 'Repeticiones por lado' : 'Repeticiones'}</td></tr>
          </tbody>
        </table>
      </div>
      <div className="card"><h3>Preparación</h3><ol className="steps">{e.preparacion.map((s, i) => <li key={i}>{s}</li>)}</ol></div>
      <div className="card"><h3>Ejecución</h3><ol className="steps">{e.ejecucion.map((s, i) => <li key={i}>{s}</li>)}</ol></div>
      <div className="card"><h3>Respiración orientativa</h3><p>{e.respiracion}</p></div>
      <div className="card"><h3>Errores habituales</h3><ul className="plain">{e.errores.map((s, i) => <li key={i}>{s}</li>)}</ul></div>
      <div className="card">
        <h3>Alternativas</h3>
        <p className="small"><strong>Más sencilla:</strong> {link(e.alternativaSencilla) || <span className="muted">es una de las opciones más sencillas de su grupo.</span>}</p>
        <div className="small"><strong>Según material:</strong> {e.alternativasMaterial.length ? <span className="row" style={{ display: 'inline-flex', gap: 12 }}>{e.alternativasMaterial.map((x) => <span key={x}>{link(x)}</span>)}</span> : <span className="muted">sin alternativas registradas.</span>}</div>
      </div>
      <Notice kind="warn" title="Precauciones">{e.precauciones} Si aparece dolor, detente.</Notice>
      {hist.length > 0 && (
        <div className="card">
          <h3>Tus últimos registros</h3>
          <ul className="plain small">{hist.map((h) => <li key={h.sessionId}>{new Date(h.fecha).toLocaleDateString('es-ES')}: {describeSets(h.log, e.unidad)}</li>)}</ul>
        </div>
      )}
    </div>
  );
}
