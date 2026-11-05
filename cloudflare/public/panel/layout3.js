/* KAIROS Control 3.0 — pannello riordinato.
   1) Menu da 29 a 10 voci: le pagine simili diventano schede di una sola voce («Linee IPTV», «App», «Richieste»,
      «Controllo», «Impostazioni»). Le pagine non cambiano: le schede richiamano le voci originali (nascoste),
      quindi permessi degli agenti, contatori e collegamenti restano quelli di prima.
   2) Scheda cliente in 4 schede: Cliente e abbonamento · Linee e lettore · App · Avanzate.
   Va caricato per ultimo. Usa le funzioni di app.js e agents.js. */
(() => {
  const css = document.createElement('style');
  css.textContent = `
.nav.hubsub{display:none!important}
.hubbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:0 0 20px;width:fit-content;max-width:100%}
.hubbar:empty{display:none}
/* ogni scheda ha il suo colore (--c): pallino, fondo e bordo tinti; quella aperta è piena */
.hubbar button,#dBody .dtabs button{--c:#4f8cff}
.hubbar button{all:unset;cursor:pointer;display:flex;align-items:center;gap:8px;padding:9px 15px;border-radius:11px;font-size:13.5px;font-weight:700;white-space:nowrap;color:#eef1f8;
  background:color-mix(in srgb,var(--c) 13%,transparent);border:1px solid color-mix(in srgb,var(--c) 38%,transparent);transition:background .15s,box-shadow .15s}
.hubbar button::before{content:'';flex:none;width:8px;height:8px;border-radius:50%;background:var(--c);box-shadow:0 0 0 3px color-mix(in srgb,var(--c) 25%,transparent)}
.hubbar button:hover{background:color-mix(in srgb,var(--c) 24%,transparent)}
.hubbar button.on{background:var(--c);border-color:transparent;color:#fff;box-shadow:0 8px 22px -10px var(--c)}
.hubbar button.on::before{background:#fff;box-shadow:none}
.hubbar .n{font-size:11px;font-weight:800;min-width:18px;height:18px;padding:0 5px;border-radius:9px;display:grid;place-items:center;background:#ff4d4f;color:#fff}
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
  // [voce, etichetta, icona, schede [vista, etichetta]]
  const HUBS = [
    ['hub-lines', 'Linee IPTV', svg('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'), [['armada', 'Pannello Armada'], ['lines', 'Linee collegate']]],
    ['hub-apps', 'App', svg('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><path d="M17.5 14v7M14 17.5h7"/>'), [['apps3', 'Attiva app'], ['apps3op', 'OrbixPlay e MaxPlayer'], ['dlc', 'Codici downloader'], ['appk', 'App Kairos']]],
    ['hub-req', 'Richieste', svg('<path d="M4 5h16v11H8l-4 4z"/><path d="M8 9h8M8 12h5"/>'), [['reports', 'Segnalazioni'], ['creq', 'Contenuti'], ['areq', 'Temi'], ['reqai', 'Assistente IA'], ['store', 'Download store']]],
    ['hub-ctrl', 'Controllo', svg('<path d="M3 12h4l3-8 4 16 3-8h4"/>'), [['live', 'Online ora'], ['apperr', 'Errori app'], ['activity', 'Attività']]],
    ['hub-set', 'Impostazioni', svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
      [['set-look', 'Aspetto'], ['set-app', 'Funzioni app'], ['set-addon', 'Store add-on'], ['set-ai', 'Assistente IA'], ['dns', 'Server DNS e VPN'], ['set-maint', 'Manutenzione'], ['set-sec', 'Sicurezza'], ['api', 'API']]],
  ];
  const PAL = ['#4f8cff', '#a78bfa', '#2dd4bf', '#f5b041', '#fb7185', '#34d399', '#fb923c', '#38bdf8'];
  const colOf = (h, v) => PAL[Math.max(0, h[3].findIndex(([x]) => x === v)) % PAL.length];
  const navOf = (v) => document.querySelector(`.nav[data-v="${v}"]`);
  const isOwner = () => D.role !== 'agent';
  const hubOf = (v) => HUBS.find(([, , , t]) => t.some(([x]) => x === v));
  const allowed = (v) => { if (v === 'apps3op') return isOwner() && allowed('apps3'); const n = navOf(v); return !!n && n.style.display !== 'none'; };
  const lastTab = {};
  let apps3Mode = 'links';
  const setApps3 = (m) => { apps3Mode = m; const V = $('#v-apps3'); if (V && window.KX_NO_TABS) { V.classList.remove('m-links', 'm-op'); return; } if (V) { V.classList.toggle('m-links', m === 'links'); V.classList.toggle('m-op', m === 'op'); } };

  // voci dei gruppi nel menu
  for (const [id, label, ic] of HUBS) {
    if (navOf(id)) continue;
    const b = document.createElement('button'); b.className = 'nav hub'; b.dataset.v = id; b.dataset.hub = '1';
    b.innerHTML = ic + label + `<span class="kc-nb" id="nb_${id}"></span>`;
    b.onclick = () => openHub(id);
    $('#side').appendChild(b);
  }
  const bar = document.createElement('div'); bar.className = 'hubbar'; bar.id = 'hubBar';
  ($('#dlBar') || $('.topbar')).after(bar);

  function goTab(v) {
    const h = hubOf(v); if (h) lastTab[h[0]] = v;
    if (v === 'apps3op' || v === 'apps3') { setApps3(v === 'apps3op' ? 'op' : 'links'); const n = navOf('apps3'); if (n) n.click(); }
    else { const n = navOf(v); if (n) n.click(); }
    update();
  }
  window.KXGoTab = (v) => { if (!hubOf(v) || !allowed(v)) return false; goTab(v); return true; };
  function openHub(id) {
    const h = HUBS.find((x) => x[0] === id); if (!h) return;
    const tabs = h[3].map(([v]) => v).filter(allowed);
    if (!tabs.length) return;
    goTab(tabs.includes(lastTab[id]) ? lastTab[id] : tabs[0]);
  }
  const badgeOf = (v) => { const n = navOf(v); if (!n) return 0; let s = 0; for (const e of n.querySelectorAll('span')) { const t = (e.textContent || '').trim(); if (/^\d+$/.test(t) && getComputedStyle(e).display !== 'none' && (e.classList.contains('on') || !e.classList.contains('kc-nb'))) s += +t; } return s; };

  let busy = false;
  function update() {
    if (busy) return; busy = true;
    try {
      const on = document.querySelector('.nav.on[data-v]:not([data-hub])');
      let v = on ? on.dataset.v : ((document.querySelector('.view.on') || {}).id || '').slice(2);
      if (v === 'apps3' && apps3Mode === 'op' && isOwner()) v = 'apps3op';
      if (v === 'apps3') setApps3(isOwner() ? apps3Mode : 'links');
      const h = hubOf(v);
      for (const [id] of HUBS) { const n = navOf(id); if (n) n.classList.toggle('on', !!h && h[0] === id); }
      // contatori sui gruppi
      for (const [id, , , tabs] of HUBS) { const n = $('#nb_' + id); if (!n) continue; const s = tabs.filter(([x]) => allowed(x)).reduce((a, [x]) => a + (x === 'apps3op' ? 0 : badgeOf(x)), 0); const txt = s ? String(s) : ''; if (n.textContent !== txt) n.textContent = txt; if (n.classList.contains('on') !== s > 0) n.classList.toggle('on', s > 0); }
      if (!h) { bar.innerHTML = ''; return; }
      lastTab[h[0]] = v;
      const tabs = h[3].filter(([x]) => allowed(x));
      bar.innerHTML = tabs.length > 1 ? tabs.map(([x, l]) => { const c = x === 'apps3op' ? 0 : badgeOf(x); return `<button type="button" data-hubt="${x}" class="${x === v ? 'on' : ''}" style="--c:${colOf(h, x)}">${esc(l)}${c ? `<span class="n">${c}</span>` : ''}</button>`; }).join('') : '';
      bar.querySelectorAll('[data-hubt]').forEach((b) => (b.onclick = () => goTab(b.dataset.hubt)));
      const t = $('#vTitle'); if (t) t.textContent = h[1];
    } finally { busy = false; }
  }
  let raf = 0; const later = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; update(); }); };
  new MutationObserver(later).observe($('#side'), { subtree: true, attributes: true, attributeFilter: ['class', 'style'], childList: true, characterData: true });
  const v0 = view;
  window.view = view = function (v) { const r = v0.apply(this, arguments); later(); return r; };

  function syncHubs() {
    for (const [id] of HUBS) { const n = navOf(id); if (!n) continue; const any = HUBS.find((x) => x[0] === id)[3].some(([v]) => allowed(v)); const d = any ? '' : 'none'; if (n.style.display !== d) n.style.display = d; }
    for (const [, , , tabs] of HUBS) for (const [v] of tabs) { const n = navOf(v); if (n && !n.classList.contains('hubsub')) n.classList.add('hubsub'); }
  }
  const SIDEC = { dash: '#4f8cff', devices: '#2dd4bf', agents: '#a78bfa', 'hub-lines': '#38bdf8', 'hub-apps': '#f5b041', 'hub-req': '#fb7185', msgs: '#34d399', vod: '#fb923c', 'hub-ctrl': '#4f8cff', 'hub-set': '#a78bfa', sec: '#2dd4bf' };
  function sideColors() { for (const [v, c] of Object.entries(SIDEC)) { const n = navOf(v); if (n && n.style.getPropertyValue('--c') !== c) n.style.setProperty('--c', c); } }
  const amb = document.createElement('div'); amb.className = 'agmbar'; amb.id = 'agmBar'; amb.style.display = 'none'; bar.before(amb);
  function agmBar() {
    const am = (D.settings || {}).agMaint, on = isOwner() && !window.__assist && am && am.on;
    amb.style.display = on ? '' : 'none'; if (!on) return;
    amb.innerHTML = `🛠️ <span><b>Pannello agenti in manutenzione</b> · gli agenti vedono: «${esc(am.msg || '')}»</span><span class="sp"></span><button class="btn sm" id="agmEnd">Termina</button>`;
    $('#agmEnd').onclick = async () => { try { await api('PUT', '/admin/settings', { agMaint: { on: false } }); await load(); toast('Manutenzione agenti terminata'); } catch (e) { toast(e.message, 1); } };
  }
  const ra = renderAll;
  window.renderAll = renderAll = function () { ra(); syncHubs(); if (window.KXLayoutMenu) KXLayoutMenu(); sideColors(); agmBar(); update(); };
  syncHubs(); if (window.KXLayoutMenu) KXLayoutMenu();

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
  const agTabOf = (sec) => { if (sec.id === 'cOth') return 'apps'; const h = ((sec.querySelector('h4') || {}).textContent || '').trim(); if (/^(Cliente|Abbonamento)/.test(h)) return 'main'; if (/^Line/.test(h)) return 'lines'; return 'adv'; };
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
