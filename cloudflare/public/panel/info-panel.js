/* KAIROS Control — «ℹ️ Info» (14 novembre 2026): comunicazioni del titolare e guida «quale app su quale dispositivo».
   - Titolare: scrive le comunicazioni e può cambiare la guida; per ognuna decide se mostrarla anche nello Store
     (riquadro «Info» dello Store, lo legge chiunque lo apra) o solo qui nel pannello agli agenti.
   - Agente: legge soltanto. Un pallino sulla voce del menu finché non apre una comunicazione nuova.
   API: GET/PUT /admin/info (worker.js). Stesso formato semplice della guida della Panoramica: «# Titolo», «1.» per i
   passi, «-» per gli elenchi, **grassetto**. Usa app.js ($, esc, api, view, toast, TITLES, D). */
(() => {
  if (!$('#side')) return;
  const css = document.createElement('style');
  css.textContent = `
#v-info .in-b{font-size:14.5px;line-height:1.6}
#v-info .in-b h4{margin:16px 0 6px;font-size:15.5px;color:#fff}
#v-info .in-b h4:first-child{margin-top:0}
#v-info .in-b ol,#v-info .in-b ul{margin:4px 0 8px 22px;padding:0}
#v-info .in-b li{margin:4px 0}
#v-info .in-b p{margin:6px 0}
#v-info .in-news{border:1px solid rgba(34,211,238,.35);background:rgba(34,211,238,.06);border-radius:14px;padding:14px 16px}
#v-info .in-empty{color:var(--mut);font-size:14px}
#v-info textarea.inp{min-height:150px;font-family:inherit;line-height:1.5;resize:vertical}
#v-info textarea.inp.big{min-height:360px}
#v-info .in-sw{display:flex;gap:10px;align-items:flex-start;margin-top:12px;font-size:13.5px;line-height:1.45;cursor:pointer}
#v-info .in-sw input{width:18px;height:18px;margin-top:2px;flex:none;accent-color:#22d3ee}
#v-info .in-sw small{display:block;color:var(--mut);font-size:12.5px}
#v-info .in-act{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:14px}
#v-info .in-hint{font-size:12.5px;color:var(--mut);margin-top:6px}
#v-info .in-when{font-size:12.5px;color:var(--mut);margin-top:8px}
.nav[data-v="info"] .in-dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#22d3ee;box-shadow:0 0 10px #22d3ee;margin-left:8px;vertical-align:middle}`;
  document.head.appendChild(css);

  const IC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>';
  if (!$('.nav[data-v="info"]')) {
    const b = document.createElement('button'); b.className = 'nav'; b.dataset.v = 'info'; b.innerHTML = IC + 'Info'; b.onclick = () => view('info');
    const ref = $('.nav[data-v="conn"]'); ref ? ref.after(b) : $('#side').appendChild(b);
    const sec = document.createElement('section'); sec.className = 'view'; sec.id = 'v-info'; ($('#v-dash') || $('#side')).after(sec);
  }
  if (typeof TITLES === 'object') TITLES.info = 'Info';
  const V = $('#v-info');
  const I = { data: null, busy: false, editApps: false, t: 0 };
  const isAg = () => typeof D === 'object' && D && D.role === 'agent';

  /* testo semplice → HTML (come la guida della Panoramica) */
  function md(t) {
    const inl = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<span class="mono">$1</span>');
    const out = []; let list = null;
    const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
    for (const raw of String(t || '').split(/\r?\n/)) {
      const l = raw.trim();
      if (!l) { close(); continue; }
      let m;
      if ((m = l.match(/^#+\s*(.+)$/))) { close(); out.push(`<h4>${inl(m[1])}</h4>`); continue; }
      if ((m = l.match(/^(\d+)[.)]\s+(.+)$/))) { if (list !== 'ol') { close(); out.push('<ol>'); list = 'ol'; } out.push(`<li>${inl(m[2])}</li>`); continue; }
      if ((m = l.match(/^[-•*]\s+(.+)$/))) { if (list !== 'ul') { close(); out.push('<ul>'); list = 'ul'; } out.push(`<li>${inl(m[1])}</li>`); continue; }
      close(); out.push(`<p>${inl(l)}</p>`);
    }
    close(); return out.join('');
  }
  const when = (t) => (t ? new Date(t).toLocaleString('it-IT', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

  /* pallino «comunicazione nuova» per l'agente: resta finché non apre la pagina */
  const seenKey = () => 'kxInfoSeen:' + ((typeof D === 'object' && D && D.user) || '');
  const seen = () => { try { return +localStorage.getItem(seenKey()) || 0; } catch { return 0; } };
  function dot() {
    const n = $('.nav[data-v="info"]'); if (!n) return;
    const on = isAg() && !!I.data && !!I.data.news && I.data.newsAt > seen();
    const d = n.querySelector('.in-dot');
    if (on && !d) { const s = document.createElement('i'); s.className = 'in-dot'; s.title = 'Comunicazione nuova'; n.appendChild(s); }
    if (!on && d) d.remove();
  }
  function markSeen() { if (isAg() && I.data && I.data.newsAt) { try { localStorage.setItem(seenKey(), String(I.data.newsAt)); } catch {} } dot(); }

  async function load(force) {
    if (I.busy) return;
    if (!force && I.data && Date.now() - I.t < 60e3) { draw(); return; }
    I.busy = true;
    try { const r = await api('GET', '/admin/info'); I.data = r.info || null; I.t = Date.now(); } catch (e) { if (!I.data) I.err = (e && e.message) || String(e); }
    I.busy = false; draw(); dot();
  }

  function draw() {
    if (!V.classList.contains('on')) return;
    const d = I.data;
    if (!d) { V.innerHTML = `<div class="card glass"><div class="in-empty">${I.err ? '⚠ ' + esc(I.err) : 'Carico…'}</div></div>`; return; }
    if (isAg()) {
      V.innerHTML = `<div class="card glass"><div class="hd"><h3>📣 Comunicazioni<small>Gli avvisi del titolare per i venditori.</small></h3></div>
          ${d.news ? `<div class="in-news in-b">${md(d.news)}</div><div class="in-when">Scritta il ${esc(when(d.newsAt))}</div>` : '<div class="in-empty">Nessuna comunicazione in questo momento.</div>'}</div>
        <div class="card glass" style="margin-top:16px"><div class="hd"><h3>📱 Quale app installare<small>Scegli l'app in base alla memoria (RAM) del dispositivo del cliente: con l'app giusta il cliente vede senza scatti e non ti richiama.</small></h3></div>
          <div class="in-b">${md(d.apps)}</div></div>`;
      markSeen();
      return;
    }
    const keepNews = $('#inNews', V) ? $('#inNews', V).value : d.news, keepApps = $('#inApps', V) ? $('#inApps', V).value : d.apps;
    V.innerHTML = `<div class="card glass"><div class="hd"><h3>📣 Comunicazioni<small>Scrivi qui gli avvisi per i tuoi agenti: novità, cambi di server, prezzi, cose da fare. Gli agenti li leggono in questa pagina e vedono un pallino sul menu quando ce n'è uno nuovo.</small></h3></div>
        <textarea class="inp" id="inNews" maxlength="6000" placeholder="Esempio:&#10;# Novità di questa settimana&#10;- È uscita KAIROS Ultimate 1.2: aggiornate i clienti dallo Store&#10;- Da lunedì il server cambia indirizzo">${esc(keepNews)}</textarea>
        <div class="in-hint">«# Titolo» per i titoli, «-» per gli elenchi, «1.» per i passi, **grassetto**. Lascia vuoto per non mostrare niente.${d.news ? ' · In linea dal ' + esc(when(d.newsAt)) : ''}</div>
        <label class="in-sw"><input type="checkbox" id="inSN"${d.storeNews ? ' checked' : ''}><span><b>Mostra anche nello Store</b><small>Acceso: la comunicazione compare nel riquadro «Info» dello Store e la legge chiunque lo apra, clienti compresi. Spento: la vedono solo gli agenti, qui nel pannello. Spegnilo quando scrivi prezzi o cose riservate ai venditori.</small></span></label>
      </div>
      <div class="card glass" style="margin-top:16px"><div class="hd"><h3>📱 Quale app installare<small>La guida per scegliere l'app in base alla memoria (RAM) del dispositivo: fino a 1 GB, da 1 a 1,5 GB, da 1,5 a 2 GB, 2 GB o più. Serve agli agenti per installare l'app giusta al primo colpo.</small></h3>
          <span style="display:flex;gap:8px;flex-wrap:wrap">${I.editApps ? '<button class="btn sm" type="button" id="inDef">Testo iniziale</button><button class="btn sm" type="button" id="inView">Anteprima</button>' : '<button class="btn sm" type="button" id="inEdit">✏️ Modifica</button>'}</span></div>
        ${I.editApps ? `<textarea class="inp big" id="inApps" maxlength="12000">${esc(keepApps)}</textarea><div class="in-hint">Stesso formato delle comunicazioni. Se la svuoti torna il testo iniziale.</div>` : `<div class="in-b">${md(keepApps)}</div><textarea id="inApps" hidden>${esc(keepApps)}</textarea>`}
        <label class="in-sw"><input type="checkbox" id="inSA"${d.storeApps ? ' checked' : ''}><span><b>Mostra anche nello Store</b><small>Acceso: la guida compare nel riquadro «Info» dello Store, così l'agente la legge davanti alla TV del cliente. Spento: resta solo qui nel pannello.</small></span></label>
      </div>
      <div class="in-act"><button class="btn pri" type="button" id="inSave">Salva</button><span class="mut" style="font-size:12.5px">Salvando, le modifiche arrivano subito agli agenti e, entro un minuto, allo Store.</span></div>`;
  }

  async function save() {
    if (I.busy || isAg()) return;
    const body = { news: $('#inNews', V).value, apps: $('#inApps', V).value, storeNews: $('#inSN', V).checked, storeApps: $('#inSA', V).checked };
    I.busy = true;
    try {
      const r = await api('PUT', '/admin/info', body); I.data = r.info; I.t = Date.now(); I.editApps = false;
      V.innerHTML = ''; // ridisegna con i testi salvati (non con quelli rimasti nelle caselle)
      toast(I.data.news ? (I.data.storeNews ? 'Salvato: comunicazione nel pannello e nello Store' : 'Salvato: comunicazione solo nel pannello') : 'Salvato');
    } catch (e) { toast((e && e.message) || 'Non salvato', 1); }
    I.busy = false; draw();
  }

  V.addEventListener('click', (e) => {
    const t = e.target.closest('#inSave,#inEdit,#inView,#inDef'); if (!t) return;
    if (t.id === 'inSave') return save();
    if (t.id === 'inEdit') { I.editApps = true; return draw(); }
    if (t.id === 'inView') { I.editApps = false; return draw(); }
    if (t.id === 'inDef') { if (!I.data || !I.data.defApps || !confirm('Rimettere il testo iniziale della guida? Le tue modifiche alla guida vanno perse quando salvi.')) return; $('#inApps', V).value = I.data.defApps; }
  });
  new MutationObserver(() => { if (V.classList.contains('on')) { draw(); load(false); } }).observe(V, { attributes: true, attributeFilter: ['class'] });
  // l'agente all'apertura del pannello: una lettura sola, per il pallino «comunicazione nuova»
  let tick = 0;
  function boot() { clearInterval(tick); let n = 0; tick = setInterval(() => { if (++n > 40) return clearInterval(tick); if (typeof D !== 'object' || !D || !D.role) return; clearInterval(tick); if (isAg() && ((D.me || {}).perms || {}).info !== false) load(true); }, 900); }
  boot();
  const appEl = $('#app');
  if (appEl) new MutationObserver(() => { if (appEl.classList.contains('on')) return boot(); Object.assign(I, { data: null, busy: false, editApps: false, t: 0, err: '' }); V.innerHTML = ''; dot(); }).observe(appEl, { attributes: true, attributeFilter: ['class'] });
  window.KXInfo = { reload: () => load(true), md };
})();
