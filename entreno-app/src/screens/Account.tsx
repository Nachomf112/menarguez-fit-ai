import { useState, type FormEvent } from 'react';
import { CONSENT_VERSION, isEmail, passwordProblems } from '../cloud/config';
import { useCloudApi, type Result } from '../cloud/useCloud';
import { downloadText, Notice, PageTop, Seg, useApp } from '../ui/kit';

const fmt = (iso: string) => new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function Msg({ r }: { r: Result | null }) {
  if (!r || !r.msg) return null;
  return <p className={r.ok ? 'small' : 'error'} role={r.ok ? 'status' : 'alert'}>{r.msg}</p>;
}

/** Ejecuta una acción bloqueando el botón mientras dura. */
function useAction() {
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | null>(null);
  const run = async (fn: () => Promise<Result>) => {
    if (busy) return;
    setBusy(true); setRes(null);
    try { setRes(await fn()); } catch { setRes({ ok: false, msg: 'No se ha podido completar la operación.' }); } finally { setBusy(false); }
  };
  return { busy, res, setRes, run };
}

function PasswordFields({ pw, setPw, pw2, setPw2, label = 'Contraseña' }: { pw: string; setPw: (s: string) => void; pw2: string; setPw2: (s: string) => void; label?: string }) {
  const probs = passwordProblems(pw);
  return (
    <>
      <label className="field"><span>{label}</span>
        <input id="acc-pw" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} maxLength={72} />
      </label>
      <p className={`small ${pw && probs.length ? 'error' : 'muted'}`} id="acc-pw-req">
        {pw && !probs.length ? 'La contraseña cumple los requisitos.' : `Necesita ${(pw ? probs : passwordProblems('')).join(', ')}.`}
      </p>
      <label className="field"><span>Repite la contraseña</span>
        <input id="acc-pw2" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} maxLength={72} />
      </label>
      {pw2 && pw !== pw2 && <p className="error">Las contraseñas no coinciden.</p>}
    </>
  );
}
const pwValid = (pw: string, pw2: string) => !passwordProblems(pw).length && pw === pw2;

const TERMS = (
  <ul className="plain small muted">
    <li>Menarguez Fit IA ofrece orientación general sobre ejercicio. No diagnostica ni sustituye a médicos, fisioterapeutas ni dietistas-nutricionistas.</li>
    <li>Solo pueden usarla personas mayores de 18 años.</li>
    <li>Tu cuenta es personal. Puedes exportar tus datos y eliminar la cuenta cuando quieras desde esta pantalla.</li>
    <li>Responsable: Ignacio Menárguez Fernández | Menarguez-IA-Solutions. Versión {CONSENT_VERSION}.</li>
  </ul>
);

// ── Sin sesión: entrar, crear cuenta o recuperar ──
function Fuera() {
  const cloud = useCloudApi();
  const [tab, setTab] = useState<'entrar' | 'crear' | 'recuperar'>('entrar');
  const [mail, setMail] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [acepto, setAcepto] = useState(false);
  const { busy, res, setRes, run } = useAction();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!isEmail(mail)) { setRes({ ok: false, msg: 'Escribe un correo válido.' }); return; }
    if (tab === 'entrar') { if (!pw) { setRes({ ok: false, msg: 'Escribe tu contraseña.' }); return; } void run(() => cloud.signIn(mail, pw)); }
    if (tab === 'crear') {
      if (!pwValid(pw, pw2)) { setRes({ ok: false, msg: 'Revisa la contraseña.' }); return; }
      if (!acepto) { setRes({ ok: false, msg: 'Debes confirmar que eres mayor de 18 años y aceptar las condiciones.' }); return; }
      void run(async () => { const r = await cloud.signUp(mail, pw); if (r.ok) { setPw(''); setPw2(''); } return r; });
    }
    if (tab === 'recuperar') void run(() => cloud.sendReset(mail));
  };

  return (
    <section className="card">
      <Seg label="Acceso" value={tab} onChange={(v) => { setTab(v); setRes(null); }}
        options={[{ v: 'entrar', l: 'Entrar' }, { v: 'crear', l: 'Crear cuenta' }, { v: 'recuperar', l: 'He olvidado la contraseña' }]} />
      <form className="stack" onSubmit={submit} noValidate>
        <label className="field"><span>Correo electrónico</span>
          <input id="acc-email" type="email" autoComplete="email" inputMode="email" value={mail} onChange={(e) => setMail(e.target.value)} maxLength={254} />
        </label>
        {tab === 'entrar' && (
          <label className="field"><span>Contraseña</span>
            <input id="acc-pw" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} maxLength={72} />
          </label>
        )}
        {tab === 'crear' && (
          <>
            <PasswordFields pw={pw} setPw={setPw} pw2={pw2} setPw2={setPw2} />
            <div className="consent stack">
              {TERMS}
              <label className="check"><input id="acc-terminos" type="checkbox" checked={acepto} onChange={(e) => setAcepto(e.target.checked)} />
                <span>Tengo 18 años o más y acepto estas condiciones.</span></label>
            </div>
          </>
        )}
        {tab === 'recuperar' && <p className="small muted">Te enviaremos un enlace para crear una contraseña nueva.</p>}
        <div className="row">
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? 'Un momento…' : tab === 'entrar' ? 'Entrar' : tab === 'crear' ? 'Crear cuenta' : 'Enviar enlace'}
          </button>
        </div>
        <Msg r={res} />
      </form>
    </section>
  );
}

function Mfa() {
  const cloud = useCloudApi();
  const [code, setCode] = useState('');
  const { busy, res, run } = useAction();
  return (
    <section className="card">
      <h3>Verificación en dos pasos</h3>
      <p className="small muted">Escribe el código de 6 cifras que muestra tu app de autenticación.</p>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); void run(() => cloud.verifyMfa(code)); }}>
        <label className="field"><span>Código</span>
          <input id="acc-mfa" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
        </label>
        <div className="row">
          <button type="submit" className="btn primary" disabled={busy || code.length !== 6}>Verificar</button>
          <button type="button" className="btn" onClick={() => void run(() => cloud.signOut(false))}>Cancelar y salir</button>
        </div>
        <Msg r={res} />
      </form>
    </section>
  );
}

function Recuperar() {
  const cloud = useCloudApi();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const { busy, res, run } = useAction();
  return (
    <section className="card">
      <h3>Crea una contraseña nueva</h3>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); if (pwValid(pw, pw2)) void run(() => cloud.setNewPassword(pw)); }}>
        <PasswordFields pw={pw} setPw={setPw} pw2={pw2} setPw2={setPw2} label="Contraseña nueva" />
        <div className="row"><button type="submit" className="btn primary" disabled={busy || !pwValid(pw, pw2)}>Guardar contraseña</button></div>
        <Msg r={res} />
      </form>
    </section>
  );
}

function Terminos() {
  const cloud = useCloudApi();
  const [acepto, setAcepto] = useState(false);
  const { busy, res, run } = useAction();
  return (
    <section className="card">
      <h3>Condiciones de uso</h3>
      {TERMS}
      <label className="check"><input id="acc-terminos" type="checkbox" checked={acepto} onChange={(e) => setAcepto(e.target.checked)} />
        <span>Tengo 18 años o más y acepto estas condiciones.</span></label>
      <div className="row">
        <button type="button" className="btn primary" disabled={busy || !acepto} onClick={() => void run(cloud.acceptTerms)}>Aceptar y continuar</button>
        <button type="button" className="btn" onClick={() => void run(() => cloud.signOut(false))}>Salir</button>
      </div>
      <Msg r={res} />
    </section>
  );
}

function Consentimiento() {
  const cloud = useCloudApi();
  const [acepto, setAcepto] = useState(false);
  const { busy, res, run } = useAction();
  return (
    <section className="card">
      <h3>Guardar tus datos en la cuenta</h3>
      <p className="small">Para sincronizar entre dispositivos, tu perfil y tus registros se guardan en tu cuenta. Incluyen datos de salud: lesiones, molestias, medidas y respuestas del cuestionario.</p>
      <ul className="plain small muted">
        <li>Se guardan en un servidor de Supabase en la Unión Europea (Fráncfort).</li>
        <li>Solo tú puedes verlos: cada fila está protegida para que ninguna otra cuenta pueda leerla.</li>
        <li>Puedes retirar el consentimiento, exportar tus datos o borrarlos en cualquier momento.</li>
        <li>Sin este permiso puedes seguir usando la app: los datos se quedan solo en este navegador.</li>
      </ul>
      <label className="check consent"><input id="acc-salud" type="checkbox" checked={acepto} onChange={(e) => setAcepto(e.target.checked)} />
        <span>Doy mi consentimiento explícito para que se guarden en mi cuenta mis datos de entrenamiento y de salud con la finalidad de sincronizarlos y mostrar mi progreso.</span></label>
      <div className="row"><button type="button" className="btn primary" disabled={busy || !acepto} onClick={() => void run(cloud.giveConsent)}>Activar sincronización</button></div>
      <Msg r={res} />
    </section>
  );
}

function Decidir() {
  const cloud = useCloudApi();
  const { busy, res, run } = useAction();
  const otra = cloud.decision === 'otra_cuenta';
  return (
    <section className="card">
      <h3>{otra ? 'Este navegador tiene datos de otra cuenta' : 'Tienes perfiles guardados solo en este navegador'}</h3>
      <p className="small">{otra
        ? 'Para no mezclar datos de personas distintas, elige qué hacer antes de continuar. Si son tuyos, exporta una copia desde Ajustes antes de reemplazarlos.'
        : '¿Quieres subirlos a tu cuenta? Se combinarán con los que ya tengas en ella.'}</p>
      <div className="row">
        {!otra && <button type="button" className="btn primary" disabled={busy} onClick={() => void run(() => cloud.resolve('subir'))}>Subir y combinar</button>}
        <button type="button" className={`btn ${otra ? 'primary' : ''}`} disabled={busy} onClick={() => void run(() => cloud.resolve('reemplazar'))}>
          {otra ? 'Quitar esos datos y cargar los de mi cuenta' : 'No subirlos: usar solo los de mi cuenta'}</button>
        <button type="button" className="btn ghost" disabled={busy} onClick={() => void run(() => cloud.resolve('cancelar'))}>Cancelar y salir</button>
      </div>
      {!otra && <p className="small muted">Si eliges no subirlos, se quitarán de este navegador. Exporta antes una copia si quieres conservarlos.</p>}
      <Msg r={res} />
    </section>
  );
}

function Seguridad() {
  const cloud = useCloudApi();
  const [enroll, setEnroll] = useState<{ factorId: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [showPw, setShowPw] = useState(false);
  const { busy, res, setRes, run } = useAction();
  const start = async () => {
    setRes(null);
    const r = await cloud.mfaEnroll();
    if (r.ok && r.factorId && r.qr && r.secret) setEnroll({ factorId: r.factorId, qr: r.qr, secret: r.secret });
    else setRes({ ok: false, msg: r.msg });
  };
  const qrSrc = enroll ? (enroll.qr.startsWith('data:') ? enroll.qr : `data:image/svg+xml;utf-8,${encodeURIComponent(enroll.qr)}`) : '';
  return (
    <section className="card">
      <h3>Seguridad</h3>
      <p className="small">Verificación en dos pasos: {cloud.factores.length ? <b>activada</b> : 'desactivada'}.</p>
      {cloud.factores.map((f) => (
        <div key={f.id} className="row" style={{ justifyContent: 'space-between' }}>
          <span className="small muted">{f.nombre} · desde {fmt(f.creado)}</span>
          <button type="button" className="btn sm danger" disabled={busy} onClick={() => void run(() => cloud.mfaRemove(f.id))}>Desactivar</button>
        </div>
      ))}
      {!cloud.factores.length && !enroll && <div className="row"><button type="button" className="btn" disabled={busy} onClick={() => void start()}>Activar con app de autenticación</button></div>}
      {enroll && (
        <div className="stack">
          <p className="small">Escanea el código con Google Authenticator, Microsoft Authenticator u otra app compatible y escribe el código que aparece.</p>
          <img src={qrSrc} alt="Código QR para la app de autenticación" width={180} height={180} style={{ background: '#fff', padding: 8, borderRadius: 8 }} />
          <p className="small muted">Si no puedes escanearlo, introduce esta clave en la app: <code style={{ wordBreak: 'break-all' }}>{enroll.secret}</code></p>
          <label className="field"><span>Código de 6 cifras</span>
            <input id="acc-mfa-new" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} /></label>
          <div className="row">
            <button type="button" className="btn primary" disabled={busy || code.length !== 6}
              onClick={() => void run(async () => { const r = await cloud.mfaConfirm(enroll.factorId, code); if (r.ok) { setEnroll(null); setCode(''); } return r; })}>Confirmar</button>
            <button type="button" className="btn ghost" onClick={() => { setEnroll(null); setCode(''); }}>Cancelar</button>
          </div>
        </div>
      )}
      <hr className="divider" />
      {showPw ? (
        <form className="stack" onSubmit={(e) => { e.preventDefault(); if (pwValid(pw, pw2)) void run(async () => { const r = await cloud.changePassword(pw); if (r.ok) { setPw(''); setPw2(''); setShowPw(false); } return r; }); }}>
          <PasswordFields pw={pw} setPw={setPw} pw2={pw2} setPw2={setPw2} label="Contraseña nueva" />
          <div className="row">
            <button type="submit" className="btn primary" disabled={busy || !pwValid(pw, pw2)}>Cambiar contraseña</button>
            <button type="button" className="btn ghost" onClick={() => setShowPw(false)}>Cancelar</button>
          </div>
        </form>
      ) : <div className="row"><button type="button" className="btn" onClick={() => setShowPw(true)}>Cambiar contraseña</button></div>}
      <Msg r={res} />
    </section>
  );
}

function TusDatos() {
  const cloud = useCloudApi();
  const [confirm, setConfirm] = useState<'' | 'datos' | 'cuenta'>('');
  const [typed, setTyped] = useState('');
  const [limpiar, setLimpiar] = useState(true);
  const { busy, res, run } = useAction();
  const activa = cloud.phase === 'activa';
  const doExport = () => run(async () => {
    const r = await cloud.exportCloud();
    if (r.ok && r.text) downloadText(`menarguez-fit-ia-cuenta-${new Date().toISOString().slice(0, 10)}.json`, r.text, 'application/json');
    return { ok: r.ok, msg: r.ok ? `Exportación descargada. ${r.msg}` : r.msg };
  });
  return (
    <section className="card">
      <h3>Tus datos en la cuenta</h3>
      <div className="row">
        <button type="button" className="btn" disabled={busy} onClick={() => void doExport()}>Exportar datos de la cuenta (JSON)</button>
        {activa && <button type="button" className="btn" disabled={busy} onClick={() => void run(cloud.withdrawConsent)}>Retirar consentimiento</button>}
      </div>
      <hr className="divider" />
      {confirm ? (
        <div className="stack">
          <Notice kind="danger">{confirm === 'datos'
            ? 'Se borrarán de tu cuenta todos los perfiles y registros, y se dejará de sincronizar. Los datos de este navegador se mantienen.'
            : 'Se eliminará tu cuenta con todos sus datos y consentimientos. No se puede deshacer.'} Escribe BORRAR para confirmar.</Notice>
          {confirm === 'cuenta' && <label className="check"><input id="acc-limpiar" type="checkbox" checked={limpiar} onChange={(e) => setLimpiar(e.target.checked)} /><span>Borrar también los datos de este navegador</span></label>}
          <input id="acc-confirm" type="text" value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="Escribe BORRAR para confirmar" />
          <div className="row">
            <button type="button" className="btn danger" disabled={busy || typed.trim().toUpperCase() !== 'BORRAR'}
              onClick={() => void run(async () => { const r = confirm === 'datos' ? await cloud.deleteCloudData() : await cloud.deleteAccount(limpiar); setConfirm(''); setTyped(''); return r; })}>Confirmar</button>
            <button type="button" className="btn" onClick={() => { setConfirm(''); setTyped(''); }}>Cancelar</button>
          </div>
        </div>
      ) : (
        <div className="row">
          <button type="button" className="btn danger sm" onClick={() => setConfirm('datos')}>Borrar datos de la cuenta</button>
          <button type="button" className="btn danger sm" onClick={() => setConfirm('cuenta')}>Eliminar mi cuenta</button>
        </div>
      )}
      <Msg r={res} />
    </section>
  );
}

function Sesion() {
  const cloud = useCloudApi();
  const { busy, res, run } = useAction();
  const estado = { ok: 'Sincronizado', pendiente: 'Cambios pendientes', subiendo: 'Subiendo…', error: 'Error' }[cloud.status];
  return (
    <section className="card">
      <h3>Tu cuenta</h3>
      <p className="small">Sesión iniciada como <b id="acc-email-actual">{cloud.email}</b>.</p>
      {cloud.phase === 'activa' ? (
        <>
          <p className="small">Sincronización: <b id="acc-sync">{estado}</b>{cloud.lastSync && cloud.status === 'ok' ? ` · ${fmt(cloud.lastSync)}` : ''}</p>
          {cloud.status === 'error' && cloud.error && <p className="error">{cloud.error}</p>}
          <p className="small muted">Los perfiles de demostración no se suben a la cuenta.</p>
        </>
      ) : <p className="small muted">Sincronización desactivada: tus datos se quedan en este navegador.</p>}
      <div className="row">
        {cloud.phase === 'activa' && <button type="button" className="btn" disabled={busy} onClick={() => void run(cloud.syncNow)}>Sincronizar ahora</button>}
        <button type="button" className="btn" disabled={busy} onClick={() => void run(() => cloud.signOut(false))}>Cerrar sesión</button>
        <button type="button" className="btn ghost" disabled={busy} onClick={() => void run(() => cloud.signOut(true))}>Cerrar sesión y borrar datos del navegador</button>
      </div>
      <Msg r={res} />
    </section>
  );
}

export function Account() {
  const cloud = useCloudApi();
  const { go, pd } = useApp();
  if (!cloud.enabled) {
    return (
      <div className="screen">
        <PageTop eyebrow="Cuenta" title="Cuenta de usuario" tag={null} />
        <Notice>La cuenta todavía no está disponible en esta dirección. Tus datos se guardan en este navegador.</Notice>
        <div className="row"><button type="button" className="btn" onClick={() => go(pd?.plan ? 'inicio' : 'bienvenida')}>Volver</button></div>
      </div>
    );
  }
  const p = cloud.phase;
  return (
    <div className="screen">
      <PageTop eyebrow="Cuenta" title="Tu cuenta" sub="Guarda tu progreso y úsalo en varios dispositivos." tag="Tus datos, bajo tu control" />
      <Notice kind="yellow" title="Entorno de pruebas">Esta cuenta es de pruebas. Usa solo datos ficticios: no introduzcas datos reales de salud.</Notice>
      {cloud.aviso && <Notice>{cloud.aviso} <button type="button" className="btn ghost sm" onClick={cloud.clearAviso}>Cerrar</button></Notice>}
      {p === 'cargando' && <p className="muted" role="status">Comprobando la sesión…</p>}
      {p === 'fuera' && <Fuera />}
      {p === 'mfa' && <Mfa />}
      {p === 'recuperar' && <Recuperar />}
      {p === 'terminos' && <Terminos />}
      {p === 'decidir' && <Decidir />}
      {(p === 'sin_consentimiento' || p === 'activa') && (
        <>
          <Sesion />
          {p === 'sin_consentimiento' && <Consentimiento />}
          <Seguridad />
          <TusDatos />
        </>
      )}
      <div className="row"><button type="button" className="btn ghost" onClick={() => go(pd?.plan ? 'inicio' : 'bienvenida')}>Volver a la app</button></div>
      <p className="sig">Ignacio Menárguez Fernández | Menarguez-IA-Solutions</p>
    </div>
  );
}
