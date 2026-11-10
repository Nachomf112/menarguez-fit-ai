import { useState } from 'react';
import { blankProfile } from '../data/demo';
import { uid } from '../domain/session';
import { emptyState, exportBackup, exportCsv, parseBackup } from '../storage/store';
import { useCloudApi } from '../cloud/useCloud';
import { downloadText, Notice, useApp, PageTop } from '../ui/kit';
import { accesoRequerido, codigoGuardado, olvidarAcceso } from '../acceso/acceso';

export const SOURCES: { t: string; d: string; url: string }[] = [
  { t: 'OMS (2020). Directrices sobre actividad física y hábitos sedentarios', d: '150–300 min semanales de actividad aeróbica moderada y fuerza al menos 2 días en adultos.', url: 'https://www.who.int/publications-detail-redirect/9789240015128' },
  { t: 'Bull FC et al. (2020). World Health Organization 2020 guidelines on physical activity and sedentary behaviour. Br J Sports Med', d: 'Artículo revisado por pares que resume las directrices de la OMS.', url: 'https://pmc.ncbi.nlm.nih.gov/articles/7719906/' },
  { t: 'OMS. Actividad física (nota descriptiva)', d: 'Resumen divulgativo de las recomendaciones.', url: 'https://www.who.int/europe/news-room/fact-sheets/item/physical-activity' },
  { t: 'CDC. Physical Activity Guidelines for Adults', d: 'Recomendaciones de actividad aeróbica y fortalecimiento muscular para adultos.', url: 'https://www.cdc.gov/physical-activity-basics/guidelines/adults.html' },
  { t: 'ACSM (2009). Progression models in resistance training for healthy adults. Med Sci Sports Exerc', d: 'Base de los rangos de repeticiones, series, descansos y progresión por nivel.', url: 'https://pubmed.ncbi.nlm.nih.gov/19204579/' },
  { t: 'Helms ER et al. (2016). Application of the repetitions in reserve-based RPE scale for resistance training. Strength Cond J', d: 'Escala de repeticiones en reserva usada para expresar la intensidad.', url: 'https://openrepository.aut.ac.nz/handle/10292/10669' },
  { t: 'Jäger R et al. (2017). ISSN Position Stand: protein and exercise. J Int Soc Sports Nutr', d: 'Referencia de 1,4–2,0 g/kg/día de proteína para personas que entrenan.', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC5477153/' },
  { t: 'Riegel PS (1981). Athletic records and human endurance. American Scientist 69(3)', d: 'Fórmula usada para estimar el tiempo de una distancia a partir de una marca reciente (solo como orientación).', url: 'https://en.wikipedia.org/wiki/Peter_Riegel' },
  { t: 'Mifflin MD, St Jeor ST et al. (1990). A new predictive equation for resting energy expenditure in healthy individuals. Am J Clin Nutr', d: 'Ecuación usada para la estimación energética orientativa.', url: 'https://pubmed.ncbi.nlm.nih.gov/2305711/' },
];

export function Settings() {
  const { state, set, pd, go, persisted } = useApp();
  const cloud = useCloudApi();
  const synced = cloud.phase === 'activa';
  const [out, setOut] = useState<{ title: string; text: string } | null>(null);
  const [imp, setImp] = useState('');
  const [impMsg, setImpMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pendingImport, setPendingImport] = useState<ReturnType<typeof parseBackup> | null>(null);
  const [confirmDel, setConfirmDel] = useState<'' | 'perfil' | 'todo'>('');
  const [typed, setTyped] = useState('');
  const perfiles = Object.values(state.perfiles);
  const stamp = new Date().toISOString().slice(0, 10);

  const doExport = () => {
    const text = exportBackup(state);
    const ok = downloadText(`menarguez-fit-ia-copia-${stamp}.json`, text, 'application/json');
    setOut({ title: ok ? 'Copia generada. Si la descarga no empieza, copia este contenido y guárdalo como .json:' : 'Copia este contenido y guárdalo como archivo .json:', text });
  };
  const doCsv = () => {
    if (!pd) return;
    const text = exportCsv(pd);
    const ok = downloadText(`menarguez-fit-ia-registros-${stamp}.csv`, text, 'text/csv;charset=utf-8');
    setOut({ title: ok ? 'CSV generado (separador punto y coma). Si la descarga no empieza, copia el contenido:' : 'Copia este contenido como .csv:', text });
  };
  const copy = async () => { try { await navigator.clipboard.writeText(out!.text); } catch { (document.getElementById('export-text') as HTMLTextAreaElement | null)?.select(); } };
  const checkImport = (text: string) => {
    const r = parseBackup(text);
    setPendingImport(r);
    setImpMsg(r.ok ? { ok: true, text: `Copia válida: ${Object.keys(r.estado.perfiles).length} perfil(es). Al importar se reemplazarán los datos actuales de este navegador.` }
      : { ok: false, text: `No se puede importar: ${r.errores.join(' ')}` });
  };
  const onFile = async (f: File | undefined) => { if (!f) return; if (f.size > 5_000_000) { setImpMsg({ ok: false, text: 'El archivo es demasiado grande.' }); return; } const t = await f.text(); setImp(t); checkImport(t); };
  const applyImport = () => {
    if (!pendingImport?.ok) return;
    const est = pendingImport.estado;
    set(() => ({ ...est, borrador: null }));
    setImpMsg({ ok: true, text: 'Datos importados.' }); setPendingImport(null); setImp('');
  };
  const editProfile = () => { if (!pd) return; set((s) => ({ ...s, borrador: { paso: 0, respuestas: { ...pd.profile } } })); go('resumen'); };
  const newProfile = () => { set((s) => ({ ...s, borrador: { paso: 0, respuestas: { ...blankProfile(uid('perfil')), edad: undefined as unknown as number } } })); go('evaluacion'); };
  const deleteProfile = () => {
    if (!pd) return;
    set((s) => { const { [pd.profile.id]: _, ...rest } = s.perfiles; return { ...s, perfiles: rest, activeProfileId: null }; });
    setConfirmDel(''); setTyped(''); go('bienvenida');
  };
  const deleteAll = () => { set(() => emptyState()); setConfirmDel(''); setTyped(''); go('bienvenida'); };

  return (
    <div className="screen">
      <PageTop eyebrow="Tu espacio" title="Perfil, datos y fuentes" tag="Control sobre tus datos" />

      <section className="card">
        <h3>Perfiles</h3>
        <p className="small muted">Cada persona tiene sus propios datos. Cambiar de perfil no mezcla registros.</p>
        <div className="list">
          {perfiles.map((p) => (
            <button type="button" key={p.profile.id} className="item" aria-current={p.profile.id === state.activeProfileId ? 'true' : undefined}
              onClick={() => { set((s) => ({ ...s, activeProfileId: p.profile.id })); go(p.plan ? 'inicio' : 'resumen'); }}>
              <div><strong>{p.profile.nombre}</strong><div className="small muted">{p.sesiones.length} sesiones registradas</div></div>
              <div className="row" style={{ flexWrap: 'nowrap' }}>{p.profile.demo && <span className="badge demo">Demo</span>}{synced && !p.profile.demo && <span className="badge ok">En tu cuenta</span>}{cloud.email && !synced && !p.profile.demo && <span className="badge">Solo aquí</span>}{p.profile.id === state.activeProfileId && <span className="badge blue">Activo</span>}</div>
            </button>
          ))}
        </div>
        <div className="row">
          {pd && <button type="button" className="btn" onClick={editProfile}>Editar perfil activo</button>}
          <button type="button" className="btn" onClick={newProfile}>Nuevo perfil</button>
        </div>
      </section>

      {cloud.enabled && (
        <section className="card">
          <h3>Cuenta</h3>
          <p className="small muted">{cloud.email ? `Sesión iniciada como ${cloud.email}. ${synced ? 'Sincronización activada.' : 'Sincronización desactivada.'}` : 'Crea una cuenta para guardar tu progreso y usarlo en varios dispositivos.'}</p>
          <div className="row"><button type="button" className="btn" onClick={() => go('cuenta')}>{cloud.email ? 'Gestionar cuenta' : 'Entrar o crear cuenta'}</button></div>
        </section>
      )}

      <section className="card">
        <h3>Tus datos</h3>
        {synced
          ? <Notice>Los perfiles se guardan en este navegador y en tu cuenta. Los cambios y borrados de aquí se aplican también en la cuenta (salvo el perfil de demostración).</Notice>
          : <Notice>Los datos se guardan solo en este navegador{persisted ? '' : ' (ahora mismo no se pueden guardar)'}. No se sincronizan entre dispositivos ni se envían a ningún servidor. Si borras los datos del navegador, se pierden: exporta una copia de vez en cuando.</Notice>}
        <div className="row">
          <button type="button" className="btn" onClick={doExport}>Exportar copia (JSON)</button>
          {pd && <button type="button" className="btn" onClick={doCsv}>Exportar registros (CSV)</button>}
        </div>
        {out && (
          <div className="stack">
            <p className="small">{out.title}</p>
            <textarea id="export-text" readOnly value={out.text} rows={6} style={{ fontFamily: 'monospace', fontSize: 12 }} />
            <div className="row"><button type="button" className="btn sm" onClick={copy}>Copiar</button><button type="button" className="btn ghost sm" onClick={() => setOut(null)}>Cerrar</button></div>
          </div>
        )}
        <hr className="divider" />
        <h3>Importar copia</h3>
        <label className="field"><span>Archivo .json</span><input id="import-file" type="file" accept="application/json,.json" onChange={(e) => onFile(e.target.files?.[0])} /></label>
        <label className="field"><span>O pega el contenido</span><textarea id="import-text" value={imp} onChange={(e) => { setImp(e.target.value); setImpMsg(null); setPendingImport(null); }} rows={4} style={{ fontFamily: 'monospace', fontSize: 12 }} /></label>
        <div className="row">
          <button type="button" className="btn sm" disabled={!imp.trim()} onClick={() => checkImport(imp)}>Validar</button>
          {pendingImport?.ok && <button type="button" className="btn primary sm" onClick={applyImport}>Importar y reemplazar</button>}
        </div>
        {impMsg && <p className={impMsg.ok ? 'small' : 'error'} role="status">{impMsg.text}</p>}
        <hr className="divider" />
        <h3>Borrar datos</h3>
        {confirmDel ? (
          <div className="stack">
            <Notice kind="danger">{confirmDel === 'perfil' ? `Se borrará el perfil "${pd?.profile.nombre}" con todos sus registros${synced && !pd?.profile.demo ? ', también de tu cuenta' : ''}.` : (synced ? 'Se borrarán todos los perfiles y registros de este navegador y de tu cuenta.' : 'Se borrarán todos los perfiles y registros de este navegador.')} No se puede deshacer. Escribe BORRAR para confirmar.</Notice>
            <input id="confirm-borrar" type="text" value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="Escribe BORRAR para confirmar" />
            <div className="row">
              <button type="button" className="btn danger" disabled={typed.trim().toUpperCase() !== 'BORRAR'} onClick={confirmDel === 'perfil' ? deleteProfile : deleteAll}>Confirmar borrado</button>
              <button type="button" className="btn" onClick={() => { setConfirmDel(''); setTyped(''); }}>Cancelar</button>
            </div>
          </div>
        ) : (
          <div className="row">
            {pd && <button type="button" className="btn danger sm" onClick={() => setConfirmDel('perfil')}>Borrar este perfil</button>}
            <button type="button" className="btn danger sm" onClick={() => setConfirmDel('todo')}>Borrar todos los datos</button>
          </div>
        )}
      </section>

      <section className="card">
        <h3>Fuentes</h3>
        <ul className="plain small">{SOURCES.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noopener noreferrer">{s.t}</a>. <span className="muted">{s.d}</span></li>)}</ul>
        <p className="small faint">Las reglas del planificador aplican estos criterios de forma general. No constituyen una prescripción individual.</p>
      </section>

      {accesoRequerido() && (
        <section className="card">
          <h3>Código de acceso</h3>
          <p className="small muted">Entras con el código <span style={{ fontFamily: 'monospace' }}>{codigoGuardado() || '—'}</span>. Tus perfiles y registros siguen en este dispositivo aunque salgas.</p>
          <div className="row"><button type="button" className="btn sm" id="btn-salir-codigo" onClick={() => { olvidarAcceso(); location.reload(); }}>Salir del código</button></div>
        </section>
      )}

      <section className="card">
        <h3>Sobre esta versión</h3>
        <ul className="plain small muted">
          <li>Orientación general sobre ejercicio. No diagnostica ni sustituye a médicos, fisioterapeutas o dietistas-nutricionistas.</li>
          <li>Planificación por reglas, sin IA generativa. Solo necesita conexión para comprobar tu código de acceso.</li>
          <li>Carrera: de 400 m a media maratón. La maratón no se incluye en esta versión.</li>
          <li>Pendiente: demostraciones visuales de los ejercicios, importación de relojes deportivos, informes HTML corporativos.</li>
          <li>Solo para mayores de 18 años.</li>
        </ul>
      </section>
      <p className="sig">Ignacio Menárguez Fernández | Menarguez-IA-Solutions</p>
    </div>
  );
}
