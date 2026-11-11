import { useEffect, useState, type ReactNode } from 'react';
import { accesoRequerido, codigoGuardado, GRACIA_SIN_RED_MS, olvidarAcceso, REGISTRO_URL, ultimoOk, validarAcceso } from './acceso';
import { HeroArt, Notice } from '../ui/kit';

type Estado = 'comprobando' | 'pedir' | 'dentro';

/** Pide el código de Fit AI antes de mostrar la app (solo en producción y en pruebas). */
export function AccesoGate({ children }: { children: ReactNode }) {
  const requerido = accesoRequerido();
  const [estado, setEstado] = useState<Estado>(() => (!requerido ? 'dentro' : codigoGuardado() ? 'comprobando' : 'pedir'));
  const [codigo, setCodigo] = useState(() => (requerido ? codigoGuardado() : ''));
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  // Revalida el código guardado cada vez que se abre la app
  useEffect(() => {
    if (estado !== 'comprobando') return;
    let vivo = true;
    validarAcceso(codigoGuardado()).then((r) => {
      if (!vivo) return;
      if (r.ok) return setEstado('dentro');
      if (r.sinRed && Date.now() - ultimoOk() < GRACIA_SIN_RED_MS) return setEstado('dentro');
      if (!r.sinRed) olvidarAcceso();
      setError(r.error);
      setEstado('pedir');
    });
    return () => { vivo = false; };
  }, [estado]);

  if (estado === 'dentro') return <>{children}</>;

  const entrar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (enviando) return;
    setEnviando(true); setError('');
    const r = await validarAcceso(codigo);
    setEnviando(false);
    if (r.ok) setEstado('dentro'); else setError(r.error);
  };

  return (
    <div className="shell">
      <div className="app">
        <header className="topbar"><span className="brand"><span>Menarguez</span><b>Fit</b><small>IA</small></span></header>
        <div className="screen">
          <section className="herocard">
            <div className="stack">
              <span className="eyebrow">Menarguez Fit IA · Entrenamiento</span>
              <h1>Entra con tu<br /><em>código.</em></h1>
              {estado === 'comprobando' ? (
                <p className="muted" role="status">Comprobando tu código…</p>
              ) : (
                <form className="stack" onSubmit={entrar} noValidate>
                  <label className="field"><span>Código de acceso</span>
                    <input id="acceso-codigo" type="text" inputMode="text" autoCapitalize="characters" autoComplete="off" spellCheck={false}
                      placeholder="FIT-XXXX-XXXX" maxLength={40} value={codigo} onChange={(e) => setCodigo(e.target.value)} />
                  </label>
                  {error && <Notice kind="danger">{error}</Notice>}
                  <div className="row">
                    <button type="submit" className="btn primary" disabled={enviando}>{enviando ? 'Comprobando…' : 'Entrar'}</button>
                    <a className="btn" href={REGISTRO_URL} target="_blank" rel="noopener noreferrer">No tengo código: registrarme gratis</a>
                  </div>
                  <p className="small muted" style={{ maxWidth: '52ch' }}>
                    Es el mismo código de la app de nutrición de Menarguez Fit AI. El entrenamiento es gratuito.
                    Tu plan y tus registros se guardan solo en este dispositivo: al servidor solo llega tu código para controlar el acceso.
                    {' '}<a href="/privacidad.html" target="_blank" rel="noopener noreferrer">Política de privacidad</a>.
                  </p>
                </form>
              )}
            </div>
            <div className="art stack" style={{ justifyItems: 'center' }}><HeroArt /></div>
          </section>
        </div>
      </div>
    </div>
  );
}
