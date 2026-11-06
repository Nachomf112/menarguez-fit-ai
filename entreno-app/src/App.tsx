import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LocalRepository } from './storage/store';
import type { AppState, ProfileData } from './domain/types';
import { Ctx, Icon, ROUTES, type Route, type Selection } from './ui/kit';
import { Welcome } from './screens/Welcome';
import { Evaluation, Summary } from './screens/Evaluation';
import { Home } from './screens/Home';
import { PlanScreen, SessionDetail } from './screens/Plan';
import { Train } from './screens/Train';
import { Exercises } from './screens/Exercises';
import { ProgressScreen } from './screens/Progress';
import { Nutrition } from './screens/Nutrition';
import { Settings } from './screens/Settings';

const repo = new LocalRepository();
const NEEDS_PROFILE: Route[] = ['inicio', 'plan', 'sesion', 'entrenar', 'progreso', 'nutricion'];

const readHash = (): Route | null => {
  const h = (typeof location !== 'undefined' ? location.hash : '').replace('#', '') as Route;
  return ROUTES.includes(h) ? h : null;
};

export function App() {
  const [state, setState] = useState<AppState>(() => repo.load());
  const [persisted, setPersisted] = useState(true);
  const [route, setRoute] = useState<Route>(() => readHash() ?? (repo.load().activeProfileId ? 'inicio' : 'bienvenida'));
  const [sel, setSel] = useState<Selection>({});
  const first = useRef(true);

  useEffect(() => { setPersisted(repo.save(state)); }, [state]);
  useEffect(() => {
    const onHash = () => { const r = readHash(); if (r) setRoute(r); };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = useCallback((r: Route, s: Selection = {}) => {
    setSel(s);
    setRoute(r);
    try { if (location.hash !== `#${r}`) history.pushState(null, '', `#${r}`); } catch { /* sandbox */ }
    window.scrollTo?.(0, 0);
  }, []);

  const pd = state.activeProfileId ? state.perfiles[state.activeProfileId] ?? null : null;
  const updatePd = useCallback((fn: (pd: ProfileData) => ProfileData) => {
    setState((s) => {
      const id = s.activeProfileId;
      if (!id || !s.perfiles[id]) return s;
      return { ...s, perfiles: { ...s.perfiles, [id]: fn(s.perfiles[id]) } };
    });
  }, []);

  let effective: Route = route;
  if (NEEDS_PROFILE.includes(route) && !pd) effective = 'bienvenida';
  if (pd && !pd.plan && ['plan', 'sesion', 'entrenar'].includes(route)) effective = 'resumen';
  useEffect(() => {
    if (first.current) { first.current = false; try { history.replaceState(null, '', `#${effective}`); } catch { /* sandbox */ } }
  }, [effective]);

  const ctx = useMemo(() => ({ state, set: setState, pd, updatePd, go, sel, persisted }), [state, pd, updatePd, go, sel, persisted]);
  const showNav = !!pd?.plan && !['bienvenida', 'evaluacion', 'resumen'].includes(effective);

  const screen = (() => {
    switch (effective) {
      case 'bienvenida': return <Welcome />;
      case 'evaluacion': return <Evaluation />;
      case 'resumen': return <Summary />;
      case 'inicio': return <Home />;
      case 'plan': return <PlanScreen />;
      case 'sesion': return <SessionDetail />;
      case 'entrenar': return <Train />;
      case 'ejercicios': return <Exercises />;
      case 'progreso': return <ProgressScreen />;
      case 'nutricion': return <Nutrition />;
      case 'ajustes': return <Settings />;
    }
  })();

  const nav: { r: Route; l: string; i: string }[] = [
    { r: 'inicio', l: 'Inicio', i: 'home' }, { r: 'plan', l: 'Mi plan', i: 'plan' }, { r: 'entrenar', l: 'Entrenar', i: 'play' },
    { r: 'ejercicios', l: 'Ejercicios', i: 'book' }, { r: 'progreso', l: 'Progreso', i: 'chart' },
  ];
  const activeTab = effective === 'sesion' ? 'plan' : effective;

  return (
    <Ctx.Provider value={ctx}>
      <div className={`shell ${showNav ? 'has-nav' : ''}`}>
      <div className="app">
        <header className="topbar">
          <button type="button" className="brand" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', color: 'inherit' }}
            onClick={() => go(pd?.plan ? 'inicio' : 'bienvenida')} aria-label="Ir al inicio">
            <span>Menarguez</span><b>Fit</b><small>IA</small>
          </button>
          <span className="spacer" />
          {pd && <span className={`badge ${pd.profile.demo ? 'demo' : ''}`} title="Perfil activo">{pd.profile.demo ? 'DEMO · ' : ''}{pd.profile.nombre.replace(' (demostración)', '')}</span>}
          <button type="button" className="iconbtn" aria-label="Ajustes y datos" onClick={() => go('ajustes')}><Icon name="gear" size={20} /></button>
        </header>
        {!persisted && (
          <div className="notice warn" style={{ marginTop: 12 }}>Este navegador no permite guardar datos (modo privado o almacenamiento bloqueado). Lo que hagas se perderá al cerrar.</div>
        )}
        <main>{screen}</main>
      </div>
      {showNav && (
        <nav className="bottomnav" aria-label="Navegación principal">
          <div className="brandside">
            <button type="button" className="brand" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', color: 'inherit' }} onClick={() => go('inicio')} aria-label="Ir al inicio">
              <span>Menarguez</span><b>Fit</b><small>IA</small>
            </button>
            <span className="tag">Entrena con intención</span>
          </div>
          <ul>
            {nav.map((n) => (
              <li key={n.r}>
                <button type="button" aria-current={activeTab === n.r ? 'page' : undefined} onClick={() => go(n.r)}>
                  <Icon name={n.i} /> {n.l}{n.r === 'entrenar' && pd?.activa ? ' •' : ''}
                </button>
              </li>
            ))}
          </ul>
          <div className="navfoot"><b>Tu progreso empieza aquí</b><span>Entrenamiento a tu medida. Una sesión cada vez.</span></div>
        </nav>
      )}
      </div>
    </Ctx.Provider>
  );
}
