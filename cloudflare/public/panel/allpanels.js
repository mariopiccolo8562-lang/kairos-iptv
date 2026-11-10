/* KAIROS Control — Linee IPTV → «🌐 Tutti i pannelli» (solo titolare), 10 novembre 2026.
   Le linee di WOLF, Armada, Storm, Atlantix, Realott e SLT in un elenco solo, con i riquadri «Online ora»,
   «Quasi scadute» (4 giorni o meno, come i nomi gialli), «Scadute» e «Tutte». Usa le stesse letture delle schede
   dei pannelli e di «Online ora terzi» (nessuna scrittura sui pannelli); un clic su una riga apre la linea nel suo
   pannello. Black IPTV non c'è. Usa app.js ($, $$, esc, api, view, TITLES, D) e, se ci sono, KXSort, KXOnline,
   KXLineNotes, KXPay, KXOmni. */
(() => {
  if (!$('#side')) return;
  const css = document.createElement('style');
  css.textContent = `
#v-allp .ap-top{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
#v-allp .ap-top .inp{margin:0;flex:1;min-width:220px}
#v-allp .ap-info{font-size:12.5px;color:var(--mut);margin-top:8px}
#v-allp .ap-err{font-size:12.5px;color:#fbbf24;margin-top:6px}
#v-allp .dv-tiles{margin:12px 0 10px}
#v-allp .dv-tile.all b{color:#e8eef8}
#v-allp .filters{margin:0 0 8px}
#v-allp .ap-list{border:1px solid var(--line);border-radius:14px;overflow:hidden}
#v-allp .ap-row{display:grid;grid-template-columns:96px minmax(0,1.1fr) minmax(0,1.3fr) 150px 170px minmax(0,1fr);gap:10px;align-items:center;padding:10px 12px;border-top:1px solid var(--line);cursor:pointer;font-size:13px}
#v-allp .ap-row:first-child{border-top:0}
#v-allp .ap-row:hover,#v-allp .ap-row:focus-visible{background:rgba(255,255,255,.045);outline:none}
#v-allp .ap-head{cursor:default;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--mut);background:rgba(255,255,255,.02)}
#v-allp .ap-head:hover{background:rgba(255,255,255,.02)}
#v-allp .ap-pn{justify-self:start;font-size:11.5px;font-weight:800;padding:3px 8px;border-radius:8px;background:color-mix(in srgb,var(--c) 18%,transparent);color:color-mix(in srgb,var(--c) 72%,#fff);white-space:nowrap}
#v-allp .ap-u{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#v-allp .ap-n{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#v-allp .ap-n.mut{color:var(--mut)}
#v-allp .ap-x small{display:block;color:var(--mut);font-size:11.5px}
#v-allp .ap-w{display:block;color:var(--mut);font-size:11.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#v-allp .ap-empty{padding:16px;color:var(--mut)}
@media (max-width:700px){#v-allp .dv-tiles{grid-template-columns:repeat(2,minmax(0,1fr))!important;grid-auto-flow:row!important;grid-auto-columns:auto!important;overflow:visible!important;margin:12px 0 10px!important;padding:0!important}#v-allp .dv-tile{padding:12px}}
@media (max-width:820px){
  #v-allp .ap-head{display:none}
  #v-allp .ap-row{grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:4px 10px}
  #v-allp .ap-pn{grid-column:1/-1}
}`;
  document.head.appendChild(css);

  const IC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>';
  if (!$('.nav[data-v="allp"]')) {
    const b = document.createElement('button'); b.className = 'nav'; b.dataset.v = 'allp'; b.innerHTML = IC + 'Tutti i pannelli'; b.onclick = () => view('allp');
    const ref = $('.nav[data-v="wolf"]'); ref ? ref.before(b) : $('#side').appendChild(b);
    const sec = document.createElement('section'); sec.className = 'view'; sec.id = 'v-allp'; ($('#v-wolf') || $('#v-dash')).before(sec);
  }
  if (typeof TITLES === 'object') TITLES.allp = 'Tutti i pannelli';
  const V = $('#v-allp');

  const PN = { wolf: 'WOLF', armada: 'Armada', storm: 'Storm', atx: 'Atlantix', ro: 'Realott', slt: 'SLT' };
  const PC = { wolf: '#38bdf8', armada: '#fb923c', storm: '#a78bfa', atx: '#22d3ee', ro: '#4ade80', slt: '#f472b6' };
  const ORDER = Object.keys(PN);
  const S = { rows: null, t: 0, busy: null, f: 'online', p: '', q: '', limit: 200, errs: [] };
  const isOwner = () => typeof D === 'object' && D && D.role !== 'agent';
  const ms = (v) => (window.KXSort ? KXSort.ms(v) : +v || 0);
  const quiet = (m) => /collega prima|non (è )?collegat|non configurat/i.test(m || '');

  /* ---------- dati: le stesse letture delle schede dei pannelli ---------- */
  async function load(force) {
    if (!isOwner()) return;
    if (S.busy) return S.busy;
    if (!force && S.rows && Date.now() - S.t < 120e3) return paint();
    S.busy = (async () => {
      const rows = [], errs = [], err = (n) => (e) => { const m = (e && e.message) || String(e); if (!quiet(m)) errs.push(n + ': ' + m); };
      paint();
      await Promise.all([
        (async () => {
          const c = await api('GET', '/admin/wolf/config'); if (!c || !c.set) return;
          const d = await api('GET', '/admin/wolf/lines');
          for (const l of d.lines || []) rows.push({ p: 'wolf', ref: String(l.id), u: l.username, n: l.note || '', exp: ms(l.exp), en: !!l.enabled, on: (+l.conns || 0) > 0, conns: +l.conns || 0, max: +l.max || 0, w: l.watching || '' });
        })().catch(err('WOLF')),
        ...['armada', 'storm'].map((k) => (async () => {
          const st = await api('GET', `/admin/${k}/state`); if (!st || !st.connected) return;
          const d = await api('GET', `/admin/${k}/lines`), L = d.lines || [];
          const kn = window.KXLineNotes ? await KXLineNotes.getMany(k, L.map((x) => x.username || x.mac)).catch(() => ({})) : {};
          for (const x of L) {
            const exp = ms(x.exp), en = !!x.enabled, live = en && (!exp || exp > Date.now()), u = x.username || x.mac || '';
            // collegato sì/no: come «Online ora terzi» (connessioni attive chieste al server della linea), solo per le linee vive
            const key = live && x.username && x.password && window.KXOnline ? KXOnline.want(st.dns, x.username, x.password) : '';
            rows.push({ p: k, ref: u, u, n: kn[String(u).toLowerCase()] || x.notes || '', exp, en, on: key ? undefined : live ? null : false, key, max: +x.maxConn || 0, tab: x.username ? 'lines' : 'mags' });
          }
        })().catch(err(PN[k]))),
        (async () => {
          const d = await api('GET', '/admin/atx/lines?all=1&page=1&q=&status=&reseller=');
          for (const x of d.rows || d.lines || []) rows.push({ p: 'atx', ref: String(x.id), u: x.username, n: x.notes || '', exp: ms(x.exp_date), en: Number(x.enabled) !== 0, on: Number(x.online) > 0, conns: Number(x.online) || 0, max: Number(x.max_connections) || 0, w: x.channel || '' });
        })().catch(err('Atlantix')),
        ...['ro', 'slt'].map((k) => (async () => {
          const st = await api('GET', `/admin/${k}/state`); if (!st || !st.connected) return;
          const d = await api('GET', `/admin/${k}/lines`);
          for (const x of d.rows || []) rows.push({ p: k, ref: String(x.id || x.username || ''), u: x.username, n: x.notes || '', exp: ms(x.exp), en: !!x.enabled, expired: !!x.expired, on: (+x.conns || 0) > 0, conns: +x.conns || 0, max: +x.max || 0, w: x.stream || '' });
        })().catch(err(PN[k]))),
      ]);
      S.rows = rows; S.errs = errs; S.t = Date.now();
    })().finally(() => { S.busy = null; paint(); });
    return S.busy;
  }

  /* ---------- stato di ogni linea ---------- */
  const isExp = (r) => r.en && (r.expired || (r.exp && r.exp < Date.now()));
  const isSoon = (r) => r.en && !isExp(r) && !!r.exp && (window.KXSort ? KXSort.calDays(r.exp) <= KXSort.SOON : r.exp - Date.now() <= 4 * 864e5);
  const onOf = (r) => (r.key ? (window.KXOnline ? KXOnline.get(r.key) : null) : r.on === null ? null : { on: !!r.on, conns: r.conns, max: r.max });
  const isOn = (r) => { const v = onOf(r); return !!(v && v.on); };
  const FIT = { online: isOn, soon: isSoon, exp: isExp, all: () => true };
  const pending = () => (S.rows || []).some((r) => r.key && window.KXOnline && KXOnline.get(r.key) === undefined);
  const left = (t) => {
    if (!t) return 'senza scadenza';
    const d = window.KXSort ? KXSort.calDays(t) : Math.ceil((t - Date.now()) / 864e5);
    return t < Date.now() ? (d === 0 ? 'scaduta oggi' : `scaduta da ${-d} g`) : d === 0 ? 'scade oggi' : d === 1 ? 'domani' : `tra ${d} g`;
  };
  const day = (t) => (t ? new Date(t).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—');
  const stateHtml = (r) => {
    if (!r.en) return '<span class="on-st n"><i class="on-dot"></i>Disattivata</span>';
    if (r.key) return `<span class="kx-on" data-on="${esc(r.key)}">${window.KXOnline ? KXOnline.dot(KXOnline.get(r.key)) : ''}</span>`;
    const v = onOf(r);
    return window.KXOnline ? KXOnline.dot(v) : v && v.on ? 'Collegato' : v ? 'Scollegato' : 'Non verificabile';
  };

  /* ---------- disegno ---------- */
  function shell() {
    if ($('#apQ', V)) return;
    V.innerHTML = `<div class="card glass"><div class="hd"><h3>🌐 Tutti i pannelli<small>Le linee di WOLF, Armada, Storm, Atlantix, Realott e SLT in un elenco solo. Tocca una riga per aprirla nel suo pannello.</small></h3>
        <button class="btn sm" type="button" id="apRe">Aggiorna</button></div>
        <div class="ap-top"><input class="inp" id="apQ" placeholder="Cerca utente, nome del cliente o nota" autocomplete="off" spellcheck="false"></div>
        <div class="ap-info" id="apInfo"></div><div id="apErr"></div>
        <div class="dv-tiles" id="apTiles"></div><div class="filters" id="apChips"></div><div class="ap-list" id="apList"></div><div id="apMore"></div></div>`;
  }
  function paint() {
    if (!V.classList.contains('on') || !isOwner()) return;
    shell();
    const R = S.rows || [], q = S.q.toLowerCase().trim();
    $('#apInfo', V).textContent = S.busy && !S.rows ? 'Leggo le linee da tutti i pannelli…' : S.t ? `${R.length} linee lette alle ${new Date(S.t).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}${S.busy ? ' · aggiorno…' : ''}${pending() ? ' · verifico chi è collegato su Armada e Storm…' : ''}` : '';
    $('#apErr', V).innerHTML = S.errs.map((e) => `<div class="ap-err">⚠ ${esc(e)}</div>`).join('');
    const inP = R.filter((r) => !S.p || r.p === S.p), cnt = (f) => inP.filter(FIT[f]).length;
    const T = [['online', 'active', 'Online ora', 'Collegate adesso'], ['soon', 'soon', 'Quasi scadute', '4 giorni o meno'], ['exp', 'expired', 'Scadute', 'Da rinnovare'], ['all', 'all', 'Tutte le linee', 'Di tutti i pannelli']];
    $('#apTiles', V).innerHTML = T.map(([k, c, l, sub]) => `<button type="button" class="dv-tile ${c}${S.f === k ? ' on' : ''}" data-apf="${k}"><span><b>${S.rows ? cnt(k) : '…'}</b><em>${l}</em><small>${sub}</small></span></button>`).join('');
    const have = ORDER.filter((p) => R.some((r) => r.p === p));
    $('#apChips', V).innerHTML = S.rows ? [['', 'Tutti i pannelli'], ...have.map((p) => [p, PN[p]])].map(([p, l]) => `<button type="button" class="fchip ${S.p === p ? 'on' : ''}" data-app="${p}">${esc(l)}<span>${R.filter((r) => (!p || r.p === p) && FIT[S.f](r)).length}</span></button>`).join('') : '';
    if (!S.rows) { $('#apList', V).innerHTML = '<div class="ap-empty">Carico…</div>'; $('#apMore', V).innerHTML = ''; return; }
    let L = inP.filter(FIT[S.f]);
    if (q) L = L.filter((r) => [r.u, r.n, PN[r.p], r.w].join(' ').toLowerCase().includes(q));
    const big = 8.64e15;
    L.sort(S.f === 'exp' ? (a, b) => (b.exp || 0) - (a.exp || 0) : S.f === 'online' ? (a, b) => ORDER.indexOf(a.p) - ORDER.indexOf(b.p) || String(a.u).localeCompare(String(b.u)) : (a, b) => (a.exp || big) - (b.exp || big));
    const shown = L.slice(0, S.limit);
    S.vis = shown;
    $('#apList', V).innerHTML = shown.length ? `<div class="ap-row ap-head"><span>Pannello</span><span>Utente</span><span>Cliente / nota</span><span>Scadenza</span><span>Stato</span><span>Pagamento</span></div>` + shown.map((r, i) => {
      const tc = window.KXSort ? KXSort.tone(r.exp, r.en, r.expired) : '';
      return `<div class="ap-row" role="button" tabindex="0" data-api="${i}" title="Apri in ${esc(PN[r.p])}">
        <span class="ap-pn" style="--c:${PC[r.p]}">${esc(PN[r.p])}</span>
        <span class="ap-u ${tc}">${esc(r.u || '—')}</span>
        <span class="ap-n ${r.n ? tc : 'mut'}">${esc(r.n || '—')}</span>
        <span class="ap-x">${esc(day(r.exp))}<small>${esc(left(r.exp))}</small></span>
        <span>${stateHtml(r)}${r.w && isOn(r) ? `<span class="ap-w" title="Sta guardando">▶ ${esc(r.w)}</span>` : ''}</span>
        <span>${window.KXPay ? KXPay.badge('line', r.p, r.ref) : ''}</span></div>`;
    }).join('') : `<div class="ap-empty">${R.length ? 'Nessuna linea con questi filtri.' : 'Nessun pannello IPTV collegato.'}</div>`;
    $('#apMore', V).innerHTML = L.length > shown.length ? `<button class="btn sm" type="button" id="apMoreB" style="margin-top:10px">Mostra altre ${Math.min(200, L.length - shown.length)} (${shown.length} su ${L.length})</button>` : '';
  }
  const open = (r) => { if (r && window.KXOmni) KXOmni.pick({ p: r.p, q: r.u, tab: r.tab }); };

  V.addEventListener('click', (e) => {
    const t = e.target.closest('#apRe,[data-apf],[data-app],[data-api],#apMoreB'); if (!t) return;
    if (t.id === 'apRe') { if (window.KXOnline) KXOnline.refresh(); return load(true); }
    if (t.id === 'apMoreB') { S.limit += 200; return paint(); }
    if (t.dataset.apf) { S.f = t.dataset.apf; S.limit = 200; return paint(); }
    if (t.dataset.app !== undefined) { S.p = t.dataset.app; S.limit = 200; return paint(); }
    if (t.dataset.api !== undefined && !e.target.closest('button, a')) open((S.vis || [])[+t.dataset.api]);
  });
  V.addEventListener('keydown', (e) => { const t = e.target.closest && e.target.closest('[data-api]'); if (t && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); open((S.vis || [])[+t.dataset.api]); } });
  V.addEventListener('input', (e) => { if (e.target.id === 'apQ') { S.q = e.target.value; S.limit = 200; paint(); } });
  // aprendo la scheda si legge (se i dati hanno più di 2 minuti); mentre arrivano i «collegato sì/no» di Armada e Storm i numeri si aggiornano
  new MutationObserver(() => { if (V.classList.contains('on')) { if (!isOwner()) { V.innerHTML = ''; return; } shell(); load(false); } }).observe(V, { attributes: true, attributeFilter: ['class'] });
  let ot = 0; // risposte del controllo «collegato» (online.js): riquadri ed elenco si aggiornano
  document.addEventListener('kx-online', () => { if (ot || !V.classList.contains('on') || !S.rows) return; ot = setTimeout(() => { ot = 0; paint(); }, 300); });
  const appEl = $('#app');
  if (appEl) new MutationObserver(() => { if (!appEl.classList.contains('on')) { S.rows = null; S.t = 0; S.errs = []; S.q = ''; S.p = ''; S.f = 'online'; V.innerHTML = ''; } }).observe(appEl, { attributes: true, attributeFilter: ['class'] });
  window.KXAllPanels = { load, rows: () => S.rows || [] };
})();
