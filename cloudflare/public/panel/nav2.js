/* KAIROS Control 2.11 — pannello riorganizzato: «Operatività» e «Impostazioni» separate, Panoramica con azioni e interruttori rapidi,
   campanella delle richieste, manutenzione al volo, «Elimina clienti inattivi». Va caricato per ultimo. */
(() => {
  const css = document.createElement('style');
  css.textContent = `
#v-settings.solo #stTabs{display:none}
#v-ai[data-mode="req"]>*:not(.ai-g){display:none!important}
#v-ai[data-mode="req"] .ai-g{grid-template-columns:1fr!important}
#v-ai[data-mode="req"] .ai-g>.card:not(:first-child){display:none!important}
#v-ai[data-mode="set"] .ai-g>.card:first-child{display:none!important}
#v-ai[data-mode="set"] .ai-g{grid-template-columns:1fr!important}
.qa-g{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.25fr);gap:16px;margin-bottom:18px}
.qa-acts{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
.qa-a{all:unset;cursor:pointer;display:flex;flex-direction:column;gap:8px;padding:14px;border-radius:14px;border:1px solid var(--line);background:rgba(255,255,255,.03);transition:background .15s,border-color .15s}
.qa-a:hover{background:rgba(255,255,255,.07);border-color:rgba(255,255,255,.18)}
.qa-a i{font-style:normal;font-size:20px}.qa-a b{font-size:13.5px}.qa-a small{color:var(--mut);font-size:11.5px;line-height:1.3}
.qa-sw{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:8px}
.qa-sw .tog{margin:0;padding:11px 13px}.qa-sw .tog b{font-size:13.5px}.qa-sw .tog small{font-size:11.5px}
.qa-sw .tog.busy{opacity:.55;pointer-events:none}
#bellB{position:relative}#bellB .n{position:absolute;top:-4px;right:-4px;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:var(--bad);color:#fff;font-size:11px;font-weight:800;display:none;place-items:center}
#bellB .n.on{display:grid}
#bellM{position:absolute;top:58px;right:120px;z-index:40;width:320px;padding:8px;border-radius:14px;border:1px solid var(--line);background:var(--pane,#16181d);box-shadow:0 18px 50px rgba(0,0,0,.5);display:none}
#bellM.on{display:block}#bellM button{all:unset;cursor:pointer;display:flex;align-items:center;gap:10px;width:calc(100% - 20px);padding:10px;border-radius:9px;font-size:13.5px}
#bellM button:hover{background:rgba(255,255,255,.06)}#bellM button b{margin-left:auto;background:var(--bad);color:#fff;border-radius:9px;padding:1px 8px;font-size:12px}
#bellM .mut{padding:12px;font-size:13px}
#mtBtn{border-radius:999px!important}
.dv-more{position:relative}.dv-more .mn{position:absolute;right:0;top:calc(100% + 6px);z-index:30;min-width:240px;padding:6px;border-radius:12px;border:1px solid var(--line);background:var(--pane,#16181d);box-shadow:0 18px 50px rgba(0,0,0,.5);display:none}
.dv-more .mn.on{display:block}.dv-more .mn button{all:unset;cursor:pointer;display:block;width:calc(100% - 20px);padding:10px;border-radius:8px;font-size:13.5px}.dv-more .mn button:hover{background:rgba(255,255,255,.06)}
.ina-m label.ck{display:flex;gap:10px;align-items:flex-start;margin-top:12px;font-size:13.5px;cursor:pointer}.ina-m label.ck input{width:16px;height:16px;margin-top:2px;accent-color:var(--a1)}
.ina-m .help{color:var(--mut);font-size:12px;margin:4px 0 0 26px}.ina-m .cnt{margin-top:14px;font-size:13.5px}
@media (max-width:1000px){.qa-g{grid-template-columns:1fr}}`;
  document.head.appendChild(css);

  const owner = () => D.role !== 'agent';
  const side = $('#side');
  const IC = {
    look: '<path d="M12 3a9 9 0 1 0 0 18c1 0 1.6-.8 1.2-1.7-.5-1 .2-2.3 1.3-2.3H17a4 4 0 0 0 4-4c0-5-4-10-9-10z"/><circle cx="7.5" cy="11" r="1"/><circle cx="11" cy="7" r="1"/><circle cx="15.5" cy="8.5" r="1"/>',
    app: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
    addon: '<path d="M14 4a2 2 0 1 1 4 0v2h2a1 1 0 0 1 1 1v4h-2a2 2 0 1 0 0 4h2v4a1 1 0 0 1-1 1h-4v-2a2 2 0 1 0-4 0v2H6a1 1 0 0 1-1-1v-4H3a2 2 0 1 1 0-4h2V7a1 1 0 0 1 1-1h8z"/>',
    ai: '<path d="M12 3l1.8 4.9L19 9.7l-4.6 2.8L13 18l-1-5.2L7 9.7l5.2-1.8z"/>',
    maint: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>',
    sec: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    appk: '<rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2"/>',
    req: '<path d="M4 5h16v11H8l-4 4z"/><path d="M8 9h8M8 12h5"/>',
    bell: '<path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4z"/><path d="M10 21a2 2 0 0 0 4 0"/>',
  };
  const svg = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">${IC[k]}</svg>`;
  const navOf = (v) => $(`.nav[data-v="${v}"]`);
  function mkNav(v, label, ic, go, badge) {
    if (navOf(v)) return navOf(v);
    const b = document.createElement('button'); b.className = 'nav'; b.dataset.v = v; b.innerHTML = svg(ic) + label + (badge ? `<span class="kc-nb" id="${badge}"></span>` : '');
    b.onclick = go; side.appendChild(b); return b;
  }
  const mark = (v, title) => { $$('.nav[data-v]').forEach((n) => n.classList.toggle('on', n.dataset.v === v)); if (title) $('#vTitle').textContent = title; cur = v; };
  let cur = '';

  /* ---------- Impostazioni: ogni scheda diventa una voce del menu ---------- */
  const SETV = { 'set-look': [['look', 'price'], 'Aspetto e marchio'], 'set-app': [['app'], 'Funzioni dell\'app'], 'set-addon': [['addon'], 'Store add-on'], 'set-sec': [['sec'], 'Sicurezza e account'], appk: [['upd'], 'App Kairos'] };
  function openSet(k) {
    const [panes, title] = SETV[k];
    view('settings'); $('#v-settings').classList.add('solo');
    if (window.stShow) stShow(panes[0]);
    panes.slice(1).forEach((p) => { const el = $(`#v-settings .st-pane[data-pane="${p}"]`); if (el) el.classList.add('on'); });
    mark(k, title);
  }
  // le altre pagine riportano le Impostazioni al loro aspetto normale
  const view0 = view;
  window.view = view = function (v) { if (v !== 'settings') $('#v-settings') && $('#v-settings').classList.remove('solo'); if (v !== 'ai') $('#v-ai') && delete $('#v-ai').dataset.mode; cur = v; return view0(v); };
  const aiMode = (mode) => { view('ai'); $('#v-ai').dataset.mode = mode; mark(mode === 'req' ? 'reqai' : 'set-ai', mode === 'req' ? 'Richieste IA' : 'Assistente IA'); };

  mkNav('reqai', 'Richieste IA', 'req', () => aiMode('req'), 'nb_reqai');
  mkNav('appk', 'App Kairos', 'appk', () => openSet('appk'));
  mkNav('set-look', 'Aspetto e marchio', 'look', () => openSet('set-look'));
  mkNav('set-app', 'Funzioni dell\'app', 'app', () => openSet('set-app'));
  mkNav('set-addon', 'Store add-on', 'addon', () => openSet('set-addon'));
  mkNav('set-ai', 'Assistente IA', 'ai', () => aiMode('set'));
  mkNav('set-maint', 'Manutenzione', 'maint', () => window.KXMaint && KXMaint.open());
  mkNav('set-sec', 'Sicurezza e account', 'sec', () => openSet('set-sec'));
  Object.assign(TITLES, { dash: 'Panoramica', apps3: 'App terzi' });
  { const d = navOf('dash'); if (d) for (const n of d.childNodes) if (n.nodeType === 3 && /Dashboard/.test(n.textContent)) n.textContent = 'Panoramica'; }
  { const a = navOf('apps3'); if (a) for (const n of a.childNodes) if (n.nodeType === 3 && /Gestione app terzi/.test(n.textContent)) n.textContent = 'App terzi'; }
  if ($('#v-dash').classList.contains('on')) $('#vTitle').textContent = 'Panoramica';
  // il contatore delle richieste IA segue quello della vecchia voce
  const nbAi = $('#nb_ai');
  if (nbAi) new MutationObserver(() => { const n = $('#nb_reqai'); if (n) { n.textContent = nbAi.textContent; n.classList.toggle('on', nbAi.classList.contains('on')); } bell(); }).observe(nbAi, { childList: true, attributes: true, characterData: true, subtree: true });

  /* ---------- Server DNS e VPN: anche la VPN generale sta qui ---------- */
  (function moveVpn() {
    const pane = $('#v-settings .st-pane[data-pane="vpn"]'), V = $('#v-dns'); if (!pane || !V || $('#vpnHere')) return;
    const card = pane.querySelector('.card'); if (!card) return;
    card.id = 'vpnHere'; card.style.marginTop = '18px'; V.appendChild(card);
    card.insertAdjacentHTML('beforeend', '<button class="btn pri" id="wgSave" style="margin-top:12px">Salva VPN generale</button>');
    $('#wgSave').onclick = async () => { const v = $('#sWg').value.trim(); if (!v) { toast('Incolla prima la configurazione WireGuard', 1); return; } try { await api('PUT', '/admin/settings', { wgConf: v }); $('#sWg').value = ''; window.stDirtyUpd && stDirtyUpd(); await load(); toast('VPN generale salvata'); } catch (e) { toast(e.message, 1); } };
    const tab = $('#v-settings .st-tab[data-st="vpn"]'); if (tab) tab.style.display = 'none';
    // la pagina dei DNS si ridisegna da sola: la scheda VPN torna sempre in fondo
    new MutationObserver(() => { if (!V.contains(card)) V.appendChild(card); }).observe(V, { childList: true });
  })();

  /* ---------- barra in alto: campanella delle richieste, manutenzione al volo ---------- */
  const top = $('.topbar');
  if (top && !$('#bellB')) {
    $('#newDev').insertAdjacentHTML('beforebegin', `<button class="icb" id="bellB" title="Richieste in attesa">${svg('bell')}<span class="n" id="bellN"></span></button>`);
    document.body.insertAdjacentHTML('beforeend', '<div id="bellM"></div>');
    $('#bellB').onclick = (e) => { e.stopPropagation(); bell(); const m = $('#bellM'), r = $('#bellB').getBoundingClientRect(); m.style.top = r.bottom + 8 + 'px'; m.style.right = Math.max(10, innerWidth - r.right - 10) + 'px'; m.classList.toggle('on'); };
    addEventListener('click', (e) => { if (!e.target.closest('#bellM')) $('#bellM').classList.remove('on'); if (!e.target.closest('.dv-more')) $$('.dv-more .mn').forEach((m) => m.classList.remove('on')); });
    $('#newDev').innerHTML = $('#newDev').innerHTML.replace(/Nuovo\s*$/, 'Nuovo cliente');
  }
  const BELL = [['reports', 'nb_reports', 'Segnalazioni'], ['creq', 'nb_creq', 'Richieste contenuti'], ['areq', 'nb_areq', 'Richieste temi'], ['reqai', 'nb_ai', 'Richieste IA'], ['store', 'storeB', 'Download store']];
  function bell() {
    const items = BELL.map(([v, id, l]) => { const e = document.getElementById(id), n = e && e.style.display !== 'none' && (e.classList.contains('on') || id === 'storeB') ? parseInt(e.textContent, 10) || 0 : 0; return [v, l, n]; }).filter(([v]) => { const b = navOf(v); return b && b.style.display !== 'none'; });
    const tot = items.reduce((a, x) => a + x[2], 0);
    const n = $('#bellN'); if (n) { n.textContent = tot > 99 ? '99+' : tot; n.classList.toggle('on', tot > 0); }
    const m = $('#bellM'); if (!m) return;
    m.innerHTML = items.filter((x) => x[2]).map(([v, l, k]) => `<button data-bv="${v}">${l}<b>${k}</b></button>`).join('') || '<div class="mut">Nessuna richiesta in attesa 👍</div>';
    $$('[data-bv]', m).forEach((b) => (b.onclick = () => { m.classList.remove('on'); const nb = navOf(b.dataset.bv); if (nb) nb.click(); }));
  }
  setInterval(bell, 4000);
  function pill() {
    const b = $('#mtBtn'); if (!b || !window.KXMaint) return;
    b.onclick = () => KXMaint.quick();
    b.title = 'Accendi o spegni la manutenzione (messaggio ed esclusi: Impostazioni → Manutenzione)';
    b.innerHTML = KXMaint.on() ? '🔧 Manutenzione: ON' : '🔧 Manutenzione: OFF';
  }

  /* ---------- Panoramica: azioni rapide e interruttori rapidi ---------- */
  let storeAppr = null, storeT = 0;
  async function loadStore() { if (!owner() || Date.now() - storeT < 60e3) return; storeT = Date.now(); try { const j = await api('GET', '/admin/store'); storeAppr = !!(j.settings && j.settings.approval); } catch { storeAppr = null; } drawSw(); }
  const S = () => D.settings || {}, PC = () => S().playersCfg || {};
  const putPC = (k, v) => api('PUT', '/admin/settings', { playersCfg: { ...PC(), [k]: v } });
  const SW = [
    ['maint', 'Manutenzione', 'App ferma per i clienti (tranne gli esclusi)', () => window.KXMaint && KXMaint.on(), async () => { await KXMaint.quick(); return 'done'; }],
    ['store', 'Approvazione download store', 'Ogni download dello store aspetta il tuo sì', () => storeAppr, async (on) => { await api('PUT', '/admin/store/settings', { approval: on }); storeAppr = on; }, () => storeAppr === null],
    ['local', 'Playlist personali dei clienti', 'Possono aggiungere playlist loro nell\'app', () => !!S().allowLocalPlaylists, (on) => api('PUT', '/admin/settings', { allowLocalPlaylists: on })],
    ['foot', 'Eventi sportivi nella home', 'Partite di calcio in evidenza nell\'app', () => !!S().showFootball, (on) => api('PUT', '/admin/settings', { showFootball: on })],
    ['ai', 'Assistente IA', 'Spento: il pulsante sparisce dall\'app per tutti', () => !S().aiOff, (on) => api('PUT', '/admin/settings', { aiOff: !on })],
    ['clean', 'Pulizia automatica app terzi', 'Ogni notte toglie le liste inattive da OrbixPlay e MaxPlayer', () => !!PC().autoClean, (on) => putPC('autoClean', on)],
    ['dnsag', 'Gli agenti vedono i DNS', 'Spento: vedono solo il nome dei DNS', () => !!PC().showDnsAgents, (on) => putPC('showDnsAgents', on)],
  ];
  function drawSw() {
    const box = $('#qaSw'); if (!box) return;
    box.innerHTML = SW.map(([k, l, sm, get, , na]) => `<div class="tog ${get() ? 'on' : ''}" data-sw="${k}" ${na && na() ? 'style="opacity:.5"' : ''}><div><b>${l}</b><small>${sm}</small></div><i></i></div>`).join('');
    $$('[data-sw]', box).forEach((t) => (t.onclick = async () => {
      const [, l, , get, set] = SW.find((x) => x[0] === t.dataset.sw), on = !get();
      t.classList.add('busy');
      try { const r = await set(on); if (r !== 'done') { await load(); toast(`${l}: ${on ? 'acceso' : 'spento'}`); } } catch (e) { toast(e.message, 1); }
      t.classList.remove('busy'); drawSw();
    }));
  }
  const copy = (txt, what) => navigator.clipboard.writeText(txt).then(() => toast(what + ' copiato'), () => toast('Copia non consentita dal browser', 1));
  function pickClient(title, then) {
    const list = D.devices.filter((d) => !d.parent && d.status !== 'pending').sort((a, b) => String(a.name || a.code).localeCompare(String(b.name || b.code)));
    const go = ask(title, `<input class="inp" id="pcQ" placeholder="Cerca nome o codice" style="margin:0 0 8px"><select class="inp" id="pcS" size="8" style="height:auto">${list.map((d) => `<option value="${esc(d.id)}">${esc(d.name || '— senza nome —')} · ${esc(d.code)}</option>`).join('')}</select>`, 'Apri');
    const s = $('#pcS'); if (s && s.options.length) s.selectedIndex = 0;
    $('#pcQ').oninput = (e) => { const q = e.target.value.toLowerCase(); [...s.options].forEach((o) => (o.hidden = !o.textContent.toLowerCase().includes(q))); const f = [...s.options].find((o) => !o.hidden); if (f) s.value = f.value; };
    go.then((ok) => { if (!ok || !s.value) return; then(D.devices.find((d) => d.id === s.value)); });
  }
  const ACTS = [
    ['➕', 'Nuovo cliente', 'Attiva un codice', () => $('#newDev').click()],
    ['🔁', 'Rinnova in scadenza', 'Clienti che scadono entro 14 giorni', () => { D.filter = 'soon'; view('devices'); renderDevices(); }],
    ['💬', 'Messaggio a tutti', 'Avviso nell\'app dei clienti', () => { view('msgs'); setTimeout(() => { const t = $('#mTo'); if (t) t.value = 'all'; const i = $('#mTitle') || $('#v-msgs input'); if (i) i.focus(); }, 50); }],
    ['📋', 'Copia codice downloader', 'App KAIROS', () => { const c = S().downloaderCode; c ? copy(c, 'Codice') : (openSet('appk'), toast('Imposta prima il codice Downloader', 1)); }],
    ['🧩', 'Attiva su OrbixPlay / MaxPlayer', 'Scegli il cliente', () => pickClient('Su quale cliente?', (d) => { openDrawer(d, false); setTimeout(() => { const b = $('#dBody .dnav [data-ds="oth"]'); if (b) b.click(); }, 120); })],
    ['🔧', 'Manutenzione', 'Accendi o spegni al volo', () => window.KXMaint && KXMaint.quick()],
  ];
  (function dashCards() {
    const V = $('#v-dash'); if (!V || $('#qaG')) return;
    V.insertAdjacentHTML('afterbegin', `<div class="qa-g" id="qaG"><div class="card glass"><div class="hd"><h3>Azioni rapide<small>Le cose che fai più spesso</small></h3></div><div class="qa-acts" id="qaA"></div></div>
      <div class="card glass"><div class="hd"><h3>Interruttori rapidi<small>Si accendono e spengono con un clic</small></h3></div><div class="qa-sw" id="qaSw"></div></div></div>`);
    $('#qaA').innerHTML = ACTS.map(([i, l, sm], k) => `<button class="qa-a" data-qa="${k}"><i>${i}</i><b>${l}</b><small>${sm}</small></button>`).join('');
    $$('[data-qa]', V).forEach((b) => (b.onclick = () => ACTS[+b.dataset.qa][3]()));
  })();

  /* ---------- Clienti: ⋯ Altre opzioni → Elimina clienti inattivi (come su MaxPlayer) ---------- */
  function inactiveModal() {
    const go = ask('Elimina clienti inattivi', `<div class="ina-m"><p class="mut" style="margin:0 0 10px">Elimina fino a 500 clienti per volta. Si conservano sempre i clienti con liste su OrbixPlay o MaxPlayer e quelli con una connessione collegata usata di recente.</p>
      <label class="lbl">Giorni senza aprire l'app</label><input class="inp" type="number" id="inaD" min="7" max="3650" value="30">
      <label class="ck"><input type="checkbox" id="inaN" checked><span>Includi clienti che non hanno mai effettuato l'accesso</span></label><div class="help">Clienti creati da più giorni della soglia che non si sono mai collegati.</div>
      <label class="ck"><input type="checkbox" id="inaE" checked><span>Solo scaduti o disattivati</span></label><div class="help">Non tocca mai chi ha un abbonamento attivo, anche se non apre l'app da un po'.</div>
      <div class="cnt" id="inaC">Calcolo…</div></div>`, 'Elimina');
    const yes = $('#mYes'); yes.classList.add('danger'); yes.style.background = 'var(--bad)'; yes.style.borderColor = 'var(--bad)'; yes.disabled = true;
    let last = null, tm = 0;
    const q = () => ({ days: Math.max(7, +$('#inaD').value || 30), never: $('#inaN').checked, onlyExp: $('#inaE').checked });
    const count = async () => {
      const o = q(); yes.disabled = true; $('#inaC').textContent = 'Calcolo…';
      try { const r = await api('GET', `/admin/devices/inactive?days=${o.days}&never=${o.never ? 1 : 0}&onlyExp=${o.onlyExp ? 1 : 0}`); last = r.count; $('#inaC').innerHTML = `Clienti idonei: <b>${r.count}</b>. Soglia di inattività: ${r.days} giorni.${r.count > 500 ? ' Ne elimino 500 per volta.' : ''}`; yes.disabled = !r.count; }
      catch (e) { $('#inaC').textContent = e.message; }
    };
    const later = () => { clearTimeout(tm); tm = setTimeout(count, 300); };
    $('#inaD').oninput = later; $('#inaN').onchange = count; $('#inaE').onchange = count; count();
    go.then(async (ok) => {
      yes.classList.remove('danger'); yes.style.background = yes.style.borderColor = ''; yes.disabled = false;
      if (!ok || !last) return;
      try { const r = await api('POST', '/admin/devices/purge', q()); await load(); toast(`Eliminati ${r.deleted} clienti${r.left ? ` · ne restano ${r.left}: ripeti per continuare` : ''}`); } catch (e) { toast(e.message, 1); }
    });
  }
  window.KXInactive = inactiveModal;
  function moreMenu() {
    const bar = $('#v-devices .dv-bar'); if (!bar || $('#dvOpt')) return;
    bar.insertAdjacentHTML('beforeend', '<div class="dv-more" id="dvOpt"><button class="btn" id="dvOptB">⋯ Altre opzioni</button><div class="mn"><button data-more="ina">🧹 Elimina clienti inattivi</button></div></div>');
    $('#dvOptB').onclick = (e) => { e.stopPropagation(); $('#dvOpt .mn').classList.toggle('on'); };
    $('#dvOpt [data-more="ina"]').onclick = () => { $('#dvOpt .mn').classList.remove('on'); inactiveModal(); };
  }

  const ra = renderAll;
  window.renderAll = renderAll = function () {
    ra();
    moreMenu(); const mo = $('#dvOpt'); if (mo) mo.style.display = owner() ? '' : 'none';
    const qa = $('#qaG'); if (qa) qa.style.display = owner() ? '' : 'none';
    if (owner()) { drawSw(); loadStore(); }
    pill(); bell();
    if (cur && (SETV[cur] || cur === 'reqai' || cur === 'set-ai')) mark(cur);
  };
  if (typeof DEMO !== 'undefined') {
    const dm = demoApi;
    window.demoApi = demoApi = async function (m, p, b) {
      if (p.startsWith('/admin/devices/inactive')) { const days = +(p.match(/days=(\d+)/) || [0, 30])[1], oe = /onlyExp=1/.test(p), t = Date.now(); const l = DEMO.devices.filter((d) => !d.parent && d.playlists && d.playlists.length && !d.orbix && !d.maxp && (d.lastSeen || 0) < t - days * 864e5 && (!oe || (d.expires && d.expires < new Date().toISOString().slice(0, 10)) || d.active === false)); return { days, count: l.length, sample: l.slice(0, 20).map((d) => ({ id: d.id })) }; }
      if (p === '/admin/devices/purge') { const r = await demoApi('GET', `/admin/devices/inactive?days=${b.days}&onlyExp=${b.onlyExp ? 1 : 0}`); const ids = new Set(r.sample.map((x) => x.id)); DEMO.devices = DEMO.devices.filter((d) => !ids.has(d.id)); return { deleted: ids.size, left: 0 }; }
      if (p === '/admin/store/settings' && m === 'PUT') { DEMO.storeAppr = !!b.approval; return { settings: { approval: DEMO.storeAppr } }; }
      const r = await dm(m, p, b);
      if (p === '/admin/store' && m === 'GET' && r && r.settings && DEMO.storeAppr !== undefined) r.settings.approval = DEMO.storeAppr;
      return r;
    };
  }
})();
