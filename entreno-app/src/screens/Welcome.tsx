import { blankProfile, DEMO_ID, makeDemo } from '../data/demo';
import { uid } from '../domain/session';
import { useApp, Notice } from '../ui/kit';

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
      <section className="hero">
        <span className="eyebrow">Musculación y seguimiento</span>
        <h1>Tu programa,<br /><span>a tu medida</span></h1>
        <div className="rule" />
        <p className="muted" style={{ maxWidth: '60ch' }}>
          Responde unas preguntas por fases y obtendrás una semana de entrenamiento adaptada a tu objetivo, tu tiempo,
          tu material y tus limitaciones. Registra cada serie y revisa tu progreso con datos comparables.
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
      </section>

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
        <div className="card flat">
          <h3>Cómo funciona</h3>
          <ul className="plain muted">
            <li>Evaluación en dos fases: primero lo esencial; después solo lo que haga falta.</li>
            <li>Plan semanal por reglas explícitas y verificables. Sin kilos inventados: la carga se elige por técnica y esfuerzo.</li>
            <li>Modo entrenamiento con registro de series, temporizador y alternativas.</li>
            <li>Progreso basado solo en registros equivalentes del mismo ejercicio.</li>
          </ul>
        </div>
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
