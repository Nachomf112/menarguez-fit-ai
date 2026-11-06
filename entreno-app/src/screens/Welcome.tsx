import { blankProfile, DEMO_ID, makeDemo } from '../data/demo';
import { uid } from '../domain/session';
import { HeroArt, useApp, Notice } from '../ui/kit';

export function Welcome() {
  const { state, set, go } = useApp();
  const perfiles = Object.values(state.perfiles);

  const nuevo = () => {
    const id = uid('perfil');
    set((s) => ({ ...s, borrador: { paso: 0, respuestas: { ...blankProfile(id), edad: undefined as unknown as number } } }));
    go('evaluacion');
  };
  const continuar = () => go('evaluacion');
  const demo = () => {
    set((s) => ({ ...s, activeProfileId: DEMO_ID, perfiles: { ...s.perfiles, [DEMO_ID]: s.perfiles[DEMO_ID] ?? makeDemo() } }));
    go('inicio');
  };
  const abrir = (id: string) => { set((s) => ({ ...s, activeProfileId: id })); go(state.perfiles[id]?.plan ? 'inicio' : 'resumen'); };

  return (
    <div className="screen">
      <span className="crumbs">Menarguez-IA-Solutions / Entrenamiento personal</span>
      <section className="herocard">
        <div className="stack">
          <span className="eyebrow">Menarguez Fit IA</span>
          <h1>No es solo<br />entrenar.<br /><em>Es avanzar.</em></h1>
          <p className="muted" style={{ maxWidth: '46ch' }}>
            Unas preguntas por fases y tendrás una semana de entrenamiento adaptada a tu objetivo, tu tiempo,
            tu material y tus limitaciones. Registra cada serie y mide tu progreso con datos comparables.
          </p>
          <div className="row">
            {state.borrador ? (
              <>
                <button type="button" className="btn primary" onClick={continuar}>Continuar evaluación</button>
                <button type="button" className="btn" onClick={nuevo}>Empezar de nuevo</button>
              </>
            ) : (
              <button type="button" className="btn primary" onClick={nuevo}>Crear mi perfil</button>
            )}
            <button type="button" className="btn" onClick={demo}>Ver perfil de demostración</button>
          </div>
        </div>
        <div className="art stack" style={{ justifyItems: 'center' }}><HeroArt /><span className="caption">Construye tu propia fuerza</span></div>
      </section>

      <div className="steps3">
        <div className="step3"><span className="n">01</span><span className="eyebrow">Conócete</span><h3>Tu punto de partida</h3><p className="small muted">Objetivo, experiencia, tiempo y limitaciones. Solo lo necesario.</p></div>
        <div className="step3"><span className="n">02</span><span className="eyebrow">Entrena</span><h3>Un plan que encaja</h3><p className="small muted">Ejercicios, series, descansos y alternativas. En casa o en el gimnasio.</p></div>
        <div className="step3"><span className="n">03</span><span className="eyebrow">Evoluciona</span><h3>Cada sesión cuenta</h3><p className="small muted">Registra tus series y recibe ajustes explicados con tus propios datos.</p></div>
      </div>

      {perfiles.length > 0 && (
        <section className="stack">
          <h2>Perfiles en este navegador</h2>
          <div className="list">
            {perfiles.map((p) => (
              <button type="button" key={p.profile.id} className="item" onClick={() => abrir(p.profile.id)}>
                <div>
                  <strong>{p.profile.nombre}</strong>
                  <div className="small muted">{p.plan ? `${p.plan.sesiones.length} sesiones por semana · ${p.sesiones.length} registradas` : 'Sin plan generado'}</div>
                </div>
                {p.profile.demo && <span className="badge demo">Demo</span>}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="stack">
        <Notice title="Tus datos se quedan en este navegador">
          No se envían a ningún servidor ni se sincronizan entre dispositivos. Puedes exportar una copia en Ajustes.
        </Notice>
        <Notice kind="yellow" title="Orientación general">
          Esta aplicación no diagnostica ni sustituye a profesionales sanitarios. Uso exclusivo para mayores de 18 años.
        </Notice>
      </section>
      <p className="sig">Ignacio Menárguez Fernández | Menarguez-IA-Solutions</p>
    </div>
  );
}
