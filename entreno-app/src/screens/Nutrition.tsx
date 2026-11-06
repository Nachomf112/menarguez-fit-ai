import { useState } from 'react';
import { DAY_NAMES } from '../domain/planner';
import { ALERGENO_LABEL, generateMenu, MOMENTO_LABEL, needsProfessional, type Menu } from '../domain/nutrition';
import type { NutritionProfile } from '../domain/types';
import { Chip, Notice, Option, Seg, useApp } from '../ui/kit';

const DEFAULT: NutritionProfile = {
  objetivo: 'energia_salud', comidas: 4, horarios: '', dieta: 'omnivora', rechazados: '', alergias: [], presupuesto: 'medio',
  tiempoCocina: 'medio', relacionDificilComida: 'no', condicionClinica: false, embarazoLactancia: false,
};

export function Nutrition() {
  const { pd, updatePd } = useApp();
  const [editing, setEditing] = useState(false);
  if (!pd) return null;
  const n = pd.nutricion;
  if (!n.activa) {
    return (
      <div className="screen">
        <div className="stack"><span className="eyebrow">Nutrición · opcional</span><h1>Alimentación</h1></div>
        <p className="muted">Un módulo independiente del entrenamiento. Si lo activas, te haremos unas preguntas sobre tus comidas, preferencias y restricciones para proponerte un menú semanal orientativo con lista de compra.</p>
        <Notice title="Qué no hace">No sustituye a un dietista-nutricionista, no muestra calorías por plato (no disponemos de una base de composición de alimentos verificada) y no propone déficits agresivos ni objetivos restrictivos.</Notice>
        <button type="button" className="btn primary" onClick={() => { updatePd((d) => ({ ...d, nutricion: { ...d.nutricion, activa: true } })); setEditing(true); }}>Activar nutrición</button>
      </div>
    );
  }
  if (editing || !n.perfil) return <NutritionForm initial={n.perfil ?? { ...DEFAULT, pesoKg: pd.profile.pesoKg, alturaCm: pd.profile.alturaCm }} onDone={() => setEditing(false)} />;
  return <MenuView onEdit={() => setEditing(true)} />;
}

function NutritionForm({ initial, onDone }: { initial: NutritionProfile; onDone: () => void }) {
  const { pd, updatePd } = useApp();
  const [f, setF] = useState<NutritionProfile>(initial);
  const [err, setErr] = useState<string | null>(null);
  const u = (p: Partial<NutritionProfile>) => setF({ ...f, ...p });
  const submit = () => {
    if (f.pesoKg != null && !(f.pesoKg >= 30 && f.pesoKg <= 300)) { setErr('Peso entre 30 y 300 kg, o déjalo vacío.'); return; }
    if (f.alturaCm != null && !(f.alturaCm >= 120 && f.alturaCm <= 230)) { setErr('Altura entre 120 y 230 cm, o déjala vacía.'); return; }
    const res = generateMenu(f, pd!.profile.edad, pd!.profile.actividad, !!pd!.plan);
    if (!res.ok) { setErr(res.motivo); return; }
    updatePd((d) => ({ ...d, nutricion: { activa: true, perfil: f, menu: res.menu } }));
    onDone();
  };
  return (
    <div className="screen">
      <div className="stack"><span className="eyebrow">Nutrición</span><h1>Tus hábitos</h1><p className="muted small">Todo es voluntario salvo lo necesario para el menú.</p></div>
      <div className="field"><span>Objetivo</span>
        <div className="choice">
          {([['energia_salud', 'Comer mejor y tener energía'], ['ganar_musculo', 'Apoyar la ganancia muscular'], ['perder_grasa', 'Reducir grasa de forma gradual'], ['rendimiento', 'Rendir mejor en los entrenamientos']] as const)
            .map(([v, l]) => <Option key={v} on={f.objetivo === v} onClick={() => u({ objetivo: v })} title={l} />)}
        </div>
      </div>
      <div className="field"><span>Comidas al día</span><Seg label="Comidas al día" value={f.comidas} onChange={(v) => u({ comidas: v })} options={[3, 4, 5].map((v) => ({ v, l: String(v) }))} /></div>
      <label className="field"><span>Horarios habituales (opcional)</span><input id="nut-horarios" type="text" maxLength={120} value={f.horarios} onChange={(e) => u({ horarios: e.target.value })} placeholder="P. ej. desayuno 7:30, comida 14:30, cena 21:00" /></label>
      <div className="field"><span>Tipo de alimentación</span><Seg label="Tipo de alimentación" value={f.dieta} onChange={(v) => u({ dieta: v })} options={[{ v: 'omnivora', l: 'Omnívora' }, { v: 'pescetariana', l: 'Pescetariana' }, { v: 'vegetariana', l: 'Vegetariana' }, { v: 'vegana', l: 'Vegana' }]} /></div>
      <div className="field"><span>Alergias o intolerancias</span>
        <div className="chips">{Object.entries(ALERGENO_LABEL).map(([k, l]) => <Chip key={k} on={f.alergias.includes(k)} onClick={() => u({ alergias: f.alergias.includes(k) ? f.alergias.filter((x) => x !== k) : [...f.alergias, k] })}>{l}</Chip>)}</div>
      </div>
      <label className="field"><span>Alimentos que no quieres (separados por comas)</span><input id="nut-rechazados" type="text" maxLength={200} value={f.rechazados} onChange={(e) => u({ rechazados: e.target.value })} placeholder="P. ej. brócoli, salmón" /></label>
      <div className="field"><span>Presupuesto</span><Seg label="Presupuesto" value={f.presupuesto} onChange={(v) => u({ presupuesto: v })} options={[{ v: 'ajustado', l: 'Ajustado' }, { v: 'medio', l: 'Medio' }, { v: 'amplio', l: 'Amplio' }]} /></div>
      <div className="field"><span>Tiempo para cocinar</span><Seg label="Tiempo para cocinar" value={f.tiempoCocina} onChange={(v) => u({ tiempoCocina: v })} options={[{ v: 'poco', l: 'Poco' }, { v: 'medio', l: 'Medio' }, { v: 'mucho', l: 'Mucho' }]} /></div>
      <div className="card">
        <h3>Datos para una estimación orientativa (voluntarios)</h3>
        <p className="small muted">Sin estos datos el menú funciona igual, pero no mostraremos estimación de energía.</p>
        <div className="field"><span>Sexo para la fórmula</span><Seg label="Sexo" value={f.sexo} onChange={(v) => u({ sexo: v })} options={[{ v: 'mujer', l: 'Mujer' }, { v: 'hombre', l: 'Hombre' }]} /></div>
        <div className="row">
          <label className="field" style={{ flex: 1 }}><span>Peso (kg)</span><input id="nut-peso" type="number" inputMode="decimal" value={f.pesoKg ?? ''} onChange={(e) => u({ pesoKg: e.target.value === '' ? undefined : Number(e.target.value) })} /></label>
          <label className="field" style={{ flex: 1 }}><span>Altura (cm)</span><input id="nut-altura" type="number" inputMode="numeric" value={f.alturaCm ?? ''} onChange={(e) => u({ alturaCm: e.target.value === '' ? undefined : Number(e.target.value) })} /></label>
        </div>
      </div>
      <div className="card">
        <h3>Circunstancias que requieren atención profesional</h3>
        <div className="field"><span>¿Tienes o has tenido una relación difícil con la comida o un trastorno de la conducta alimentaria?</span>
          <Seg label="Relación con la comida" value={f.relacionDificilComida} onChange={(v) => u({ relacionDificilComida: v })} options={[{ v: 'no', l: 'No' }, { v: 'si', l: 'Sí' }, { v: 'prefiero_no', l: 'Prefiero no responder' }]} />
        </div>
        <label className="check"><input id="nut-clinica" type="checkbox" checked={f.condicionClinica} onChange={(e) => u({ condicionClinica: e.target.checked })} /><span>Tengo una condición de salud que requiere una dieta pautada (p. ej. diabetes, enfermedad renal)</span></label>
        <label className="check"><input id="nut-embarazo" type="checkbox" checked={f.embarazoLactancia} onChange={(e) => u({ embarazoLactancia: e.target.checked })} /><span>Embarazo o lactancia</span></label>
        {needsProfessional(f) && <Notice kind="warn">{needsProfessional(f)}</Notice>}
      </div>
      {err && <p className="error" role="alert">{err}</p>}
      <button type="button" className="btn primary block" onClick={submit}>Generar menú semanal</button>
    </div>
  );
}

function MenuView({ onEdit }: { onEdit: () => void }) {
  const { pd, updatePd } = useApp();
  const menu = pd!.nutricion.menu as Menu | null;
  const [dia, setDia] = useState(0);
  const [tab, setTab] = useState<'menu' | 'compra'>('menu');
  if (!menu) return <Notice>Aún no hay menú. <button type="button" className="btn sm" onClick={onEdit}>Completar datos</button></Notice>;
  return (
    <div className="screen">
      <div className="stack">
        <span className="eyebrow">Nutrición</span>
        <h1>{menu.modo === 'habitos' ? 'Hábitos generales' : 'Menú semanal'}</h1>
        {pd!.profile.demo && <Notice kind="yellow">Perfil de demostración.</Notice>}
      </div>
      {menu.avisos.map((a, i) => <Notice key={i} kind={menu.modo === 'habitos' ? 'warn' : 'info'}>{a}</Notice>)}
      {menu.modo === 'habitos' ? (
        <div className="card"><ul className="plain">{menu.habitos.map((h, i) => <li key={i}>{h}</li>)}</ul></div>
      ) : (
        <>
          {menu.energia && (
            <div className="card">
              <h3>Estimación orientativa de energía</h3>
              <p className="num" style={{ fontSize: '1.5rem' }}>{menu.energia.min.toLocaleString('es-ES')}–{menu.energia.max.toLocaleString('es-ES')} kcal/día</p>
              <p className="small muted">Calculada con la ecuación de Mifflin-St Jeor y tu nivel de actividad; objetivo: {menu.energia.base}. Es una aproximación: revísala según tu evolución real.</p>
              {menu.proteina && <p className="small muted">Referencia de proteína para personas adultas sanas que entrenan fuerza: {menu.proteina.min}–{menu.proteina.max} g/día (ISSN, 1,4–2,0 g/kg). No es un requisito universal.</p>}
            </div>
          )}
          <Seg label="Vista" value={tab} onChange={setTab} options={[{ v: 'menu', l: 'Menú' }, { v: 'compra', l: 'Lista de compra' }]} />
          {tab === 'menu' ? (
            <>
              <div className="chips">{DAY_NAMES.map((d, i) => <Chip key={d} on={dia === i} onClick={() => setDia(i)}>{d.slice(0, 3)}</Chip>)}</div>
              {menu.dias[dia].comidas.map((c, i) => (
                <div key={i} className="card">
                  <span className="eyebrow">{MOMENTO_LABEL[c.momento]}</span>
                  <h3>{c.nombre}</h3>
                  <ul className="plain small">{c.items.map((it, k) => <li key={k}>{it.nombre}: <span className="num">{it.cantidad}{it.unidad === 'ud' ? ' ud' : ` ${it.unidad}`}</span> <span className="faint">({it.estado})</span></li>)}</ul>
                  <p className="small muted"><strong>Sustitución:</strong> {c.sustitucion}</p>
                </div>
              ))}
            </>
          ) : (
            <div className="card table-wrap">
              <table>
                <thead><tr><th>Producto</th><th>Cantidad semanal</th></tr></thead>
                <tbody>{menu.compra.map((c, i) => (
                  <tr key={i}><td>{c.nombre}<div className="small faint">{c.cat}</div></td><td className="num">{c.unidad === 'ud' ? `${c.cantidad} ud` : c.cantidad >= 1000 ? `${(c.cantidad / 1000).toLocaleString('es-ES')} ${c.unidad === 'g' ? 'kg' : 'l'}` : `${c.cantidad} ${c.unidad}`}</td></tr>
                ))}</tbody>
              </table>
              <p className="small faint">Cantidades para una persona. Los pesos en crudo se refieren al alimento antes de cocinar.</p>
            </div>
          )}
          <details className="card"><summary>Hábitos que acompañan al menú</summary><ul className="plain small">{menu.habitos.map((h, i) => <li key={i}>{h}</li>)}</ul></details>
        </>
      )}
      <div className="row">
        <button type="button" className="btn" onClick={onEdit}>Editar datos</button>
        <button type="button" className="btn ghost" onClick={() => updatePd((d) => ({ ...d, nutricion: { activa: false, perfil: null, menu: null } }))}>Desactivar y borrar datos de nutrición</button>
      </div>
    </div>
  );
}
