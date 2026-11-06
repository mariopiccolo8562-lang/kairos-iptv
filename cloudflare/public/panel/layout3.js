/* KAIROS Control 3.2 — menu ordinato per sezioni, una voce per ogni pagina.
   1) Prima molte pagine erano «schede» dentro poche voci (Linee IPTV, App, Richieste, Controllo, Impostazioni):
      si faticava a trovarle. Ora ogni pagina ha la sua voce, raggruppata in sezioni chiare (l'ordine lo decide
      agents.js, KXLayoutMenu): Clienti · Linee e DNS · App e link · Richieste · Comunicazione · Controllo · Impostazioni.
      Le pagine non cambiano: permessi degli agenti, contatori e collegamenti restano quelli di prima.
   2) Scheda cliente in 4 schede: Cliente e abbonamento · Linee e lettore · App · Avanzate.
   Va caricato per ultimo. Usa le funzioni di app.js e agents.js. */
(() => {
  const css = document.createElement('style');
  css.textContent = `
.hubbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:0 0 20px;width:fit-content;max-width:100%}
.hubbar:empty{display:none}
.hubbar button,#dBody .dtabs button{--c:#4f8cff}
.hubbar button{all:unset;cursor:pointer;display:flex;align-items:center;gap:8px;padding:9px 15px;border-radius:11px;font-size:13.5px;font-weight:700;white-space:nowrap;color:#eef1f8;
  background:color-mix(in srgb,var(--c) 13%,transparent);border:1px solid color-mix(in srgb,var(--c) 38%,transparent);transition:background .15s,box-shadow .15s}
.hubbar button::before{content:'';flex:none;width:8px;height:8px;border-radius:50%;background:var(--c);box-shadow:0 0 0 3px color-mix(in srgb,var(--c) 25%,transparent)}
.hubbar button:hover{background:color-mix(in srgb,var(--c) 24%,transparent)}
.hubbar button.on{background:var(--c);border-color:transparent;color:#fff;box-shadow:0 8px 22px -10px var(--c)}
.hubbar button.on::before{background:#fff;box-shadow:none}
#dBody .dtabs button{border-color:color-mix(in srgb,var(--c) 40%,transparent)!important;background:color-mix(in srgb,var(--c) 12%,transparent)!important;color:#eef1f8!important}
#dBody .dtabs button i{background:var(--c)!important;color:#fff}
#dBody .dtabs button.on{background:var(--c)!important;border-color:transparent!important;color:#fff!important;box-shadow:0 8px 22px -10px var(--c)}
#dBody .dtabs button.on i{background:rgba(255,255,255,.25)!important}
#side .nav[data-v] svg{color:var(--c,currentColor)}
.agmbar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:0 0 16px;padding:11px 14px;border-radius:12px;border:1px solid rgba(245,176,65,.45);background:rgba(245,176,65,.12);font-size:13.5px}
.agmbar b{color:#f5c26b}.agmbar .sp{flex:1}
#v-apps3.m-links #opCard,#v-apps3.m-links #tlCard{display:none!important}
#v-apps3.m-op #appLinksCard{display:none!important}
#v-apps3.m-op #opCard{margin-top:0}
@media (max-width:760px){.hubbar{width:auto;flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;border-radius:12px}.hubbar::-webkit-scrollbar{display:none}.hubbar button{padding:8px 11px;font-size:13px}}
/* scheda cliente a schede */
#dBody.tabbed .dnav>[data-ds],#dBody.tabbed .dnav .dacc{display:none!important}
#dBody.tabbed .dtabs{display:contents}
#dBody.tabbed .dsec.dt-off{display:none!important}
#dBody.tabbed .dsh{cursor:default}#dBody.tabbed .dsh:hover{background:none}
#dBody.tabbed .dsh::after{display:none!important}
#dBody.tabbed .dsh>i{display:none}`;
  document.head.appendChild(css);

  const svg = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  // icone per le voci create dai moduli senza icona (e per «OrbixPlay e MaxPlayer» del titolare)
  const ICON = {
    lmap: svg('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
    xlist: svg('<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8M8 12h8"/>'),
    apps3op: svg('<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M10 9l5 2.5-5 2.5z"/><path d="M8 20h8"/>'),
    agop: svg('<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M10 9l5 2.5-5 2.5z"/><path d="M8 20h8"/>'),
    agk: svg('<path d="M12 3v11M7 9l5 5 5-5"/><rect x="4" y="17" width="16" height="4" rx="1.5"/>'),
  };
  // nomi delle voci: chiari e distinguibili (il titolo della pagina segue)
  const LABEL = {
    lmap: 'Linee IPTV', lines: 'Linee collegate', dns: 'DNS e server', armada: 'Pannello Armada', wolf: 'Pannello WOLF',
    apps3: 'Link di attivazione', apps3op: 'OrbixPlay e MaxPlayer', xlist: 'Crea lista', dlc: 'Codici downloader', appk: 'App Kairos', agop: 'OrbixPlay e MaxPlayer', agk: 'App Kairos',
    store: 'App da approvare', reports: 'Segnalazioni', creq: 'Contenuti richiesti', areq: 'Temi richiesti', reqai: 'Domande all\'IA',
    live: 'Online ora', rctl: 'Controllo remoto', apperr: 'Errori delle app', activity: 'Registro attività', trash: 'Cestino',
    'set-look': 'Aspetto e marchio', 'set-app': 'Funzioni dell\'app', 'set-addon': 'Store add-on', 'set-ai': 'Assistente IA', 'set-maint': 'Manutenzione', 'set-sec': 'Sicurezza e account', api: 'API e integrazioni',
  };
  const PAL = ['#4f8cff', '#a78bfa', '#2dd4bf', '#f5b041', '#fb7185', '#34d399', '#fb923c', '#38bdf8'];
  const navOf = (v) => document.querySelector(`.nav[data-v="${v}"]`);
  const isOwner = () => D.role !== 'agent';
  const allowed = (v) => { if (v === 'apps3op') return isOwner() && allowed('apps3'); const n = navOf(v); return !!n && n.style.display !== 'none'; };
  let apps3Mode = 'links';
  const setApps3 = (m) => { apps3Mode = m; const V = $('#v-apps3'); if (V && window.KX_NO_TABS) { V.classList.remove('m-links', 'm-op'); return; } if (V) { V.classList.toggle('m-links', m === 'links'); V.classList.toggle('m-op', m === 'op'); } };

  // la pagina «APP Store» del titolare ha due parti: i link di attivazione e OrbixPlay/MaxPlayer → due voci
  if (!navOf('apps3op') && navOf('apps3')) {
    const b = document.createElement('button'); b.className = 'nav'; b.dataset.v = 'apps3op'; b.innerHTML = ICON.apps3op + LABEL.apps3op;
    b.onclick = () => goTab('apps3op'); navOf('apps3').after(b);
  }
  /** nome della voce: cambia solo il testo, l'icona e i contatori restano */
  function label(n, txt) {
    const t = [...n.childNodes].find((x) => x.nodeType === 3 && x.textContent.trim());
    if (t) { if (t.textContent !== txt) t.textContent = txt; return; }
    const ic = n.querySelector('svg'); const tn = document.createTextNode(txt); ic ? ic.after(tn) : n.prepend(tn);
  }
  function dress() {
    for (const [v, ic] of Object.entries(ICON)) { const n = navOf(v); if (n && !n.querySelector('svg')) n.insertAdjacentHTML('afterbegin', ic); }
    for (const [v, l] of Object.entries(LABEL)) { const n = navOf(v); if (n) label(n, l); if (v !== 'apps3') TITLES[v] = l; }
    TITLES.apps3 = LABEL.apps3;
  }
  dress();
  // la vecchia barra delle schede resta come segnaposto (altri moduli la usano per posizionarsi), sempre vuota
  const bar = document.createElement('div'); bar.className = 'hubbar'; bar.id = 'hubBar';
  ($('#dlBar') || $('.topbar')).after(bar);

  let going = false;
  function goTab(v) {
    going = true;
    try {
      if (v === 'apps3op' || v === 'apps3') { setApps3(v === 'apps3op' ? 'op' : 'links'); const n = navOf('apps3'); if (n) n.click(); }
      else { const n = navOf(v); if (n) n.click(); }
    } finally { going = false; }
    update();
  }
  /** apre una pagina se la voce c'è ed è permessa (lo usano F5, campanella, scorciatoie) */
  window.KXGoTab = (v) => { if (!allowed(v)) return false; goTab(v); return true; };

  let busy = false;
  function update() {
    if (busy) return; busy = true;
    try {
      const vw = ((document.querySelector('.view.on') || {}).id || '').slice(2);
      if (vw === 'apps3') {
        const op = apps3Mode === 'op' && isOwner(); setApps3(op ? 'op' : 'links');
        const a = navOf('apps3'), o = navOf('apps3op');
        if (a && a.classList.contains('on') === op) a.classList.toggle('on', !op);
        if (o && o.classList.contains('on') !== op) o.classList.toggle('on', op);
        const t = $('#vTitle'), tt = op ? LABEL.apps3op : LABEL.apps3; if (t && t.textContent !== tt) t.textContent = tt;
      } else { const o = navOf('apps3op'); if (o && o.classList.contains('on')) o.classList.remove('on'); }
    } finally { busy = false; }
  }
  let raf = 0; const later = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; update(); }); };
  const v0 = view;
  // «Link di attivazione» dal menu riapre sempre i link; «OrbixPlay e MaxPlayer» passa da goTab (going)
  window.view = view = function (v) { if (v === 'apps3' && !going) apps3Mode = 'links'; const r = v0.apply(this, arguments); update(); later(); return r; };

  // colore dell'icona per sezione (uguale per le voci della stessa sezione: si riconoscono a colpo d'occhio)
  const SECC = { '': '#4f8cff', 'Linee e DNS': '#38bdf8', 'App e link': '#f5b041', Richieste: '#fb7185', Comunicazione: '#34d399', Controllo: '#a78bfa', Impostazioni: '#94a3b8', Account: '#2dd4bf' };
  function sideColors() {
    let sec = '';
    for (const el of $('#side').children) {
      if (el.classList.contains('nav-h')) { sec = el.dataset.sec || ''; continue; }
      if (!el.classList.contains('nav') || !el.dataset.v) continue;
      const c = SECC[sec] || SECC['']; if (el.style.getPropertyValue('--c') !== c) el.style.setProperty('--c', c);
    }
  }
  const amb = document.createElement('div'); amb.className = 'agmbar'; amb.id = 'agmBar'; amb.style.display = 'none'; bar.before(amb);
  function agmBar() {
    const am = (D.settings || {}).agMaint, on = isOwner() && !window.__assist && am && am.on;
    amb.style.display = on ? '' : 'none'; if (!on) return;
    amb.innerHTML = `🛠️ <span><b>Pannello agenti in manutenzione</b> · gli agenti vedono: «${esc(am.msg || '')}»</span><span class="sp"></span><button class="btn sm" id="agmEnd">Termina</button>`;
    $('#agmEnd').onclick = async () => { try { await api('PUT', '/admin/settings', { agMaint: { on: false } }); await load(); toast('Manutenzione agenti terminata'); } catch (e) { toast(e.message, 1); } };
  }
  function syncOp() { const o = navOf('apps3op'); if (!o) return; const d = allowed('apps3') && isOwner() ? '' : 'none'; if (o.style.display !== d) o.style.display = d; }
  const ra = renderAll;
  window.renderAll = renderAll = function () { ra(); dress(); syncOp(); if (window.KXLayoutMenu) KXLayoutMenu(); sideColors(); agmBar(); update(); };
  syncOp(); if (window.KXLayoutMenu) KXLayoutMenu(); sideColors();

  /* ---------- scheda cliente a schede ---------- */
  const DT = [['main', 'Cliente e abbonamento', ['cli', 'abb']], ['lines', 'Linee e lettore', ['pl', 'ply']], ['apps', 'App', ['oth']], ['adv', 'Avanzate', null]];
  const tabOf = (id) => { for (const [k, , ids] of DT) if (ids && ids.includes(id)) return k; return 'adv'; };
  let dtab = 'main', dkey = null;
  function drawerTabs() {
    const body = $('#dBody'), nav = $('#dBody .dnav'), secs = $$('#dBody .dsec');
    if (window.KX_NO_TABS) { if (body) body.classList.remove('tabbed'); secs.forEach((x) => x.classList.remove('dt-off')); return; } // vista «tutte le sezioni» (test automatici)
    if (!body || !nav || !secs.length) { if (body) body.classList.remove('tabbed'); return; }
    const key = isNew ? 'new' : edit && edit.id;
    if (key !== dkey) { dkey = key; dtab = 'main'; }
    body.classList.add('tabbed');
    const has = (k) => secs.some((s) => tabOf(s.id.slice(3)) === k && s.style.display !== 'none');
    if (!has(dtab)) dtab = DT.map((x) => x[0]).find(has) || 'main';
    let tb = $('.dtabs', nav); if (!tb) { tb = document.createElement('div'); tb.className = 'dtabs'; nav.prepend(tb); }
    tb.innerHTML = DT.filter(([k]) => has(k)).map(([k, l], i) => `<button type="button" data-dt="${k}" class="${k === dtab ? 'on' : ''}" style="--c:${PAL[DT.findIndex((x) => x[0] === k) % PAL.length]}"><i>${i + 1}</i>${l}</button>`).join('');
    tb.querySelectorAll('[data-dt]').forEach((b) => (b.onclick = () => { dtab = b.dataset.dt; drawerTabs(); body.scrollTop = 0; }));
    for (const s of secs) { const on = tabOf(s.id.slice(3)) === dtab; s.classList.toggle('dt-off', !on); if (on) s.classList.remove('closed'); }
    // i collegamenti che puntano a una sezione (es. «Attiva su OrbixPlay») aprono la scheda giusta
    nav.querySelectorAll('[data-ds]').forEach((b) => { if (b.dataset.dtb) return; b.dataset.dtb = '1'; b.addEventListener('click', () => { dtab = tabOf(b.dataset.ds); drawerTabs(); }, true); });
    if (!body.dataset.dtb) { body.dataset.dtb = '1'; body.addEventListener('click', (e) => { if (body.classList.contains('tabbed') && e.target.closest('.dsh') && !e.target.closest('button,input,select,textarea,a,label')) e.stopPropagation(); }, true); }
  }
  const rdw = renderDrawer;
  window.renderDrawer = renderDrawer = function () { const r = rdw.apply(this, arguments); drawerTabs(); return r; };
  window.KXDrawerTab = (k) => { dtab = k; drawerTabs(); };

  /* ---------- la stessa scheda cliente a schede anche per gli agenti (modulo «Cliente» del loro pannello) ---------- */
  const agTabOf = (sec) => { if (sec.id === 'cOth') return 'apps'; const h = ((sec.querySelector('h4') || {}).textContent || '').trim(); if (/^(Cliente|Abbonamento)/.test(h)) return 'main'; if (/^(Line|Gestione indipendente)/.test(h)) return 'lines'; return 'adv'; };
  let atab = 'main', akey = null, aBusy = false;
  function agTabs() {
    const B = $('#agB'); if (!B || aBusy || window.KX_NO_TABS) return;
    const g = B.querySelector('.ag-g'), secs = g ? [...g.children].filter((x) => x.classList.contains('ag-c')) : [];
    if (!$('#cName') || !secs.length) return; // solo il modulo del cliente (non quello dell'agente)
    aBusy = true;
    try {
      const key = ($('#agT') || {}).textContent || ''; if (key !== akey) { akey = key; atab = 'main'; }
      const has = (k) => secs.some((s) => agTabOf(s) === k);
      if (!has(atab)) atab = DT.map((x) => x[0]).find(has) || 'main';
      let tb = B.querySelector('.agtabs'); if (!tb) { tb = document.createElement('div'); tb.className = 'hubbar agtabs'; g.before(tb); }
      const html = DT.filter(([k]) => has(k)).map(([k, l]) => `<button type="button" data-at="${k}" class="${k === atab ? 'on' : ''}" style="--c:${PAL[DT.findIndex((x) => x[0] === k) % PAL.length]}">${l}</button>`).join('');
      if (tb.innerHTML !== html) tb.innerHTML = html;
      tb.querySelectorAll('[data-at]').forEach((b) => (b.onclick = () => { atab = b.dataset.at; agTabs(); B.scrollTop = 0; }));
      for (const s of secs) { const on = agTabOf(s) === atab; if (s.style.display !== (on ? '' : 'none')) s.style.display = on ? '' : 'none'; }
    } finally { aBusy = false; }
  }
  const agB = $('#agB'); if (agB) new MutationObserver(() => requestAnimationFrame(agTabs)).observe(agB, { childList: true });
})();
