/* KAIROS Control — Linee IPTV → «🌐 Tutti i pannelli» (solo titolare), 10 novembre 2026.
   Le linee di WOLF, Armada, Storm, Atlantix, Realott e SLT in un elenco solo:
   - riquadri «Online ora», «Quasi scadute» (4 giorni o meno, come i nomi gialli), «Scadute», «Tutte»;
   - la stessa barra di WOLF: cerca utente/ID/nota, stato, ordine, scadenze (2-7 giorni, Deve pagare), reseller; pannelli;
   - spunte e «Seleziona tutte» → «Consulta» (schede delle linee scelte), «Rinnova» (rinnovo di massa del pannello con
     quelle linee già spuntate, o della singola linea), «Modifica» (la finestra «Modifica» della linea nel suo pannello).
   Usa le stesse letture delle schede dei pannelli e di «Online ora terzi»: qui non si scrive niente sui pannelli, ogni
   rinnovo o modifica si conferma nella finestra di sempre del pannello. Un clic su una riga apre la linea nel suo pannello.
   Black IPTV non c'è. Usa app.js ($, esc, api, view, toast, TITLES, D) e, se ci sono, KXSort, KXOnline, KXLineNotes,
   KXPay, KXOmni, KXWolfRenew, KXArmRenew. */
(() => {
  if (!$('#side')) return;
  const css = document.createElement('style');
  css.textContent = `
#v-allp .ap-top{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
#v-allp .ap-top .inp{margin:0}
#v-allp .ap-top #apQ{flex:1;min-width:220px}
#v-allp .ap-top select.inp{width:auto;max-width:240px}
#v-allp .ap-info{font-size:12.5px;color:var(--mut);margin-top:8px}
#v-allp .ap-err{font-size:12.5px;color:#fbbf24;margin-top:6px}
#v-allp .dv-tiles{margin:12px 0 10px}
#v-allp .dv-tile.all b{color:#e8eef8}
#v-allp .filters{margin:0 0 8px}
#v-allp .kt-bar{margin:0 0 8px}
#v-allp .ap-list{border:1px solid var(--line);border-radius:14px;overflow:hidden}
#v-allp .ap-row{display:grid;grid-template-columns:26px 92px minmax(0,1.1fr) minmax(0,1.3fr) 140px 170px minmax(0,1fr);gap:10px;align-items:center;padding:10px 12px;border-top:1px solid var(--line);cursor:pointer;font-size:13px}
#v-allp .ap-row:first-child{border-top:0}
#v-allp .ap-row:hover,#v-allp .ap-row:focus-visible{background:rgba(255,255,255,.045);outline:none}
#v-allp .ap-row.sel{background:rgba(34,211,238,.07)}
#v-allp .ap-row input{width:17px;height:17px;margin:0;cursor:pointer;accent-color:#22d3ee}
#v-allp .ap-head{cursor:default;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--mut);background:rgba(255,255,255,.02)}
#v-allp .ap-head:hover{background:rgba(255,255,255,.02)}
.ap-pn{justify-self:start;font-size:11.5px;font-weight:800;padding:3px 8px;border-radius:8px;background:color-mix(in srgb,var(--c) 18%,transparent);color:color-mix(in srgb,var(--c) 72%,#fff);white-space:nowrap}
#v-allp .ap-u{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#v-allp .ap-u small{display:block;font-family:inherit;font-weight:400;color:var(--mut);font-size:11px}
#v-allp .ap-n{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#v-allp .ap-n.mut{color:var(--mut)}
#v-allp .ap-x small{display:block;color:var(--mut);font-size:11.5px}
#v-allp .ap-w{display:block;color:var(--mut);font-size:11.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#v-allp .ap-empty{padding:16px;color:var(--mut)}
#apOv{position:fixed;inset:0;z-index:45;display:grid;place-items:center;background:rgba(3,4,10,.62);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);padding:16px}
#apOv .ap-box{width:min(940px,100%);max-height:92vh;overflow:auto;padding:20px 22px;background:#0e1424;border:1px solid var(--line);border-radius:18px;box-shadow:0 30px 80px #000a}
#apOv .ap-bh{display:flex;align-items:flex-start;gap:12px;margin-bottom:12px}
#apOv .ap-bh h3{margin:0;flex:1;font-size:17px}
#apOv .ap-bh h3 small{display:block;font-size:12.5px;font-weight:400;color:var(--mut);margin-top:3px}
#apOv .ap-gh{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:16px 0 8px}
#apOv .ap-gh b{font-size:14px}
#apOv .ap-card{border:1px solid var(--line);border-radius:14px;padding:12px 14px;margin-bottom:10px;background:rgba(255,255,255,.025)}
#apOv .ap-ch{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
#apOv .ap-ch .ap-cu{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-weight:800;font-size:15px}
#apOv .ap-kv{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:8px 14px;margin-top:10px;font-size:13px}
#apOv .ap-kv>div>span:first-child{display:block;font-size:11px;color:var(--mut);text-transform:uppercase;letter-spacing:.05em}
#apOv .ap-kv div{min-width:0;overflow-wrap:anywhere}
#apOv .ap-acts{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
#apOv .ap-pw{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
#apOv .ap-kv button{font-size:11px;padding:1px 6px;margin-left:4px}
@media (max-width:700px){#v-allp .dv-tiles{grid-template-columns:repeat(2,minmax(0,1fr))!important;grid-auto-flow:row!important;grid-auto-columns:auto!important;overflow:visible!important;margin:12px 0 10px!important;padding:0!important}#v-allp .dv-tile{padding:12px}
  #v-allp .ap-top{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr)}#v-allp .ap-top #apQ{grid-column:1/-1;min-width:0}#v-allp .ap-top select.inp{width:100%!important;max-width:none!important;min-width:0}
  #apOv .ap-box{padding:16px}#apOv .ap-kv{grid-template-columns:minmax(0,1fr) minmax(0,1fr);grid-auto-flow:row dense}#apOv .ap-kv .ap-kv-w{grid-column:1/-1}}
@media (max-width:820px){
  #v-allp .ap-head{display:none}
  #v-allp .ap-row{grid-template-columns:26px minmax(0,1fr) minmax(0,1fr);gap:4px 10px}
  #v-allp .ap-row>input{grid-column:1;grid-row:1/span 4;align-self:start;margin-top:3px}
  #v-allp .ap-row>.ap-pn{grid-column:2/-1}
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
  const ORDER = Object.keys(PN), BULK = new Set(['wolf', 'armada', 'storm']); // pannelli con il rinnovo di massa
  const DAY = 864e5;
  const S = { rows: null, t: 0, busy: null, st: 'conn', sort: '', days: 0, own: '', p: '', q: '', limit: 200, errs: [], sel: new Set(), vis: [], list: [], pw: new Set() };
  const isOwner = () => typeof D === 'object' && D && D.role !== 'agent';
  const ms = (v) => (window.KXSort ? KXSort.ms(v) : +v || 0);
  const quiet = (m) => /collega prima|non (è )?collegat|non configurat/i.test(m || '');
  const keyOf = (r) => r.p + ':' + r.ref;

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
          for (const l of d.lines || []) rows.push({ p: 'wolf', id: String(l.id), ref: String(l.id), u: l.username, pw: l.password || '', n: l.note || '', exp: ms(l.exp), en: !!l.enabled, on: (+l.conns || 0) > 0, conns: +l.conns || 0, max: +l.max || 0, w: l.watching || '', owner: l.owner || '', created: ms(l.created), trial: !!l.trial, dns: l.dns || '' });
        })().catch(err('WOLF')),
        ...['armada', 'storm'].map((k) => (async () => {
          const st = await api('GET', `/admin/${k}/state`); if (!st || !st.connected) return;
          const d = await api('GET', `/admin/${k}/lines`), L = d.lines || [];
          const kn = window.KXLineNotes ? await KXLineNotes.getMany(k, L.map((x) => x.username || x.mac)).catch(() => ({})) : {};
          for (const x of L) {
            const exp = ms(x.exp), en = !!x.enabled, live = en && (!exp || exp > Date.now()), u = x.username || x.mac || '';
            // collegato sì/no: come «Online ora terzi» (connessioni attive chieste al server della linea), solo per le linee vive
            const key = live && x.username && x.password && window.KXOnline ? KXOnline.want(st.dns, x.username, x.password) : '';
            rows.push({ p: k, id: String(x.id), ref: u, u, pw: x.password || '', n: kn[String(u).toLowerCase()] || x.notes || '', exp, en, on: key ? undefined : live ? null : false, key, max: +x.maxConn || 0, owner: x.by || x.owner || '', created: ms(x.created), trial: !!x.trial, tab: x.username ? 'lines' : 'mags', dns: st.dns || '' });
          }
        })().catch(err(PN[k]))),
        (async () => {
          const d = await api('GET', '/admin/atx/lines?all=1&page=1&q=&status=&reseller=');
          for (const x of d.rows || d.lines || []) rows.push({ p: 'atx', id: String(x.id), ref: String(x.id), u: x.username, pw: x.password || '', n: x.notes || '', exp: ms(x.exp_date), en: Number(x.enabled) !== 0, on: Number(x.online) > 0, conns: Number(x.online) || 0, max: Number(x.max_connections) || 0, w: x.channel || '', owner: x.reseller || x.owner || x.reseller_username || '', created: ms(x.created_at), trial: Number(x.is_trial) === 1, dns: x.reseller_dns || '' });
        })().catch(err('Atlantix')),
        ...['ro', 'slt'].map((k) => (async () => {
          const st = await api('GET', `/admin/${k}/state`); if (!st || !st.connected) return;
          const d = await api('GET', `/admin/${k}/lines`);
          for (const x of d.rows || []) rows.push({ p: k, id: String(x.id || ''), ref: String(x.id || x.username || ''), u: x.username, pw: x.password || '', n: x.notes || '', exp: ms(x.exp), en: !!x.enabled, expired: !!x.expired, on: (+x.conns || 0) > 0, conns: +x.conns || 0, max: +x.max || 0, w: x.stream || '', owner: x.owner || '', created: ms(x.created), trial: !!x.trial, pack: x.type || '', dns: d.dns || '' });
        })().catch(err(PN[k]))),
      ]);
      S.rows = rows; S.errs = errs; S.t = Date.now();
      const have = new Set(rows.map(keyOf)); for (const k of [...S.sel]) if (!have.has(k)) S.sel.delete(k); // via le spunte di linee sparite
    })().finally(() => { S.busy = null; paint(); });
    return S.busy;
  }

  /* ---------- stato di ogni linea ---------- */
  const isExp = (r) => r.en && (r.expired || (r.exp && r.exp < Date.now()));
  const isSoon = (r) => r.en && !isExp(r) && !!r.exp && (window.KXSort ? KXSort.calDays(r.exp) <= KXSort.SOON : r.exp - Date.now() <= 4 * DAY);
  const onOf = (r) => (r.key ? (window.KXOnline ? KXOnline.get(r.key) : null) : r.on === null ? null : { on: !!r.on, conns: r.conns, max: r.max });
  const isOn = (r) => { const v = onOf(r); return !!(v && v.on); };
  /* stati del menu (come WOLF, più «Quasi scadute») e riquadri che li scelgono */
  const STS = [['', 'Tutte'], ['on', 'Attive'], ['soon4', 'Quasi scadute (4 giorni)'], ['soon', 'In scadenza (7 giorni)'], ['exp', 'Scadute'], ['off', 'Disattivate'], ['conn', 'Collegate ora'], ['disc', 'Scollegate']];
  const FIT = {
    '': () => true, on: (r) => r.en && !isExp(r), soon4: isSoon, soon: (r) => r.en && !isExp(r) && !!r.exp && r.exp - Date.now() < 7 * DAY,
    exp: isExp, off: (r) => !r.en, conn: isOn, disc: (r) => !isOn(r),
  };
  const TILES = [['conn', 'active', 'Online ora', 'Collegate adesso'], ['soon4', 'soon', 'Quasi scadute', '4 giorni o meno'], ['exp', 'expired', 'Scadute', 'Da rinnovare'], ['', 'all', 'Tutte le linee', 'Di tutti i pannelli']];
  const pending = () => (S.rows || []).some((r) => r.key && window.KXOnline && KXOnline.get(r.key) === undefined);
  const left = (t) => {
    if (!t) return 'senza scadenza';
    const d = window.KXSort ? KXSort.calDays(t) : Math.ceil((t - Date.now()) / DAY);
    return t < Date.now() ? (d === 0 ? 'scaduta oggi' : `scaduta da ${-d} g`) : d === 0 ? 'scade oggi' : d === 1 ? 'domani' : `tra ${d} g`;
  };
  const day = (t) => (t ? new Date(t).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—');
  const stateHtml = (r) => {
    if (!r.en) return '<span class="on-st n"><i class="on-dot"></i>Disattivata</span>';
    if (r.key) return `<span class="kx-on" data-on="${esc(r.key)}">${window.KXOnline ? KXOnline.dot(KXOnline.get(r.key)) : ''}</span>`;
    const v = onOf(r);
    return window.KXOnline ? KXOnline.dot(v) : v && v.on ? 'Collegato' : v ? 'Scollegato' : 'Non verificabile';
  };
  const ACC = { exp: (r) => r.exp, name: (r) => r.u, enabled: (r) => r.en, conns: (r) => (onOf(r) || {}).conns || 0, owner: (r) => r.owner, created: (r) => r.created, payKey: (r) => [r.p, r.ref] };

  /* ---------- elenco filtrato (anche per «Seleziona tutte») ---------- */
  function filtered() {
    const R = S.rows || [], q = S.q.toLowerCase().trim();
    let L = R.filter((r) => (!S.p || r.p === S.p) && (!S.own || r.owner === S.own) && FIT[S.st](r));
    if (q) L = L.filter((r) => [r.u, r.id, r.n, r.owner, PN[r.p], r.w].join(' ').toLowerCase().includes(q));
    if (window.KXSort) L = KXSort.apply(L, S, ACC); // filtro «scadono entro N giorni / Deve pagare» e ordine scelto
    if (!S.sort) { const big = 8.64e15; L = [...L].sort(S.st === 'exp' ? (a, b) => (b.exp || 0) - (a.exp || 0) : S.st === 'conn' ? (a, b) => ORDER.indexOf(a.p) - ORDER.indexOf(b.p) || String(a.u).localeCompare(String(b.u)) : (a, b) => (a.exp || big) - (b.exp || big)); }
    return L;
  }

  /* ---------- disegno ---------- */
  function shell() {
    if ($('#apQ', V)) return;
    V.innerHTML = `<div class="card glass"><div class="hd"><h3>🌐 Tutti i pannelli<small>Le linee di WOLF, Armada, Storm, Atlantix, Realott e SLT in un elenco solo. Tocca una riga per aprirla nel suo pannello, oppure spunta le linee per consultarle, rinnovarle o modificarle.</small></h3>
        <button class="btn sm" type="button" id="apRe">Aggiorna</button></div>
        <div class="ap-top"><input class="inp" id="apQ" placeholder="Cerca utente, ID o nota" autocomplete="off" spellcheck="false"><select class="inp" id="apSt" title="Stato"></select><span id="apSD" style="display:contents"></span><select class="inp" id="apOwn" title="Reseller"></select></div>
        <div class="ap-info" id="apInfo"></div><div id="apErr"></div>
        <div class="dv-tiles" id="apTiles"></div><div class="filters" id="apChips"></div><div id="apBar"></div><div class="ap-list" id="apList"></div><div id="apMore"></div></div>`;
  }
  function paint() {
    if (!V.classList.contains('on') || !isOwner()) return;
    shell();
    const R = S.rows || [];
    $('#apInfo', V).textContent = S.busy && !S.rows ? 'Leggo le linee da tutti i pannelli…' : S.t ? `${R.length} linee lette alle ${new Date(S.t).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}${S.busy ? ' · aggiorno…' : ''}${pending() ? ' · verifico chi è collegato su Armada e Storm…' : ''}` : '';
    $('#apErr', V).innerHTML = S.errs.map((e) => `<div class="ap-err">⚠ ${esc(e)}</div>`).join('');
    // barra come WOLF: stato, ordine + scadenze (KXSort), reseller
    const stH = STS.map(([k, l]) => `<option value="${k}"${S.st === k ? ' selected' : ''}>${l}</option>`).join('');
    const stE = $('#apSt', V); if (stE._h !== stH) { stE._h = stH; stE.innerHTML = stH; }
    if (window.KXSort) { const sd = $('#apSD', V), h = KXSort.ui(S, 'ap'); if (sd._h !== h) { sd._h = h; sd.innerHTML = h; KXSort.bind(V, S, 'ap', () => { S.limit = 200; paint(); }); } }
    const owners = [...new Set(R.map((r) => r.owner).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'it', { sensitivity: 'base' }));
    const ownH = `<option value="">Tutti i reseller</option>${owners.map((o) => `<option value="${esc(o)}"${S.own === o ? ' selected' : ''}>${esc(o)}</option>`).join('')}`;
    const ow = $('#apOwn', V); if (ow._h !== ownH) { ow._h = ownH; ow.innerHTML = ownH; } ow.style.display = owners.length ? '' : 'none';
    // riquadri e pannelli (contano con gli altri filtri)
    const base = R.filter((r) => (!S.p || r.p === S.p) && (!S.own || r.owner === S.own));
    $('#apTiles', V).innerHTML = TILES.map(([k, c, l, sub]) => `<button type="button" class="dv-tile ${c}${S.st === k ? ' on' : ''}" data-apf="${k}"><span><b>${S.rows ? base.filter(FIT[k]).length : '…'}</b><em>${l}</em><small>${sub}</small></span></button>`).join('');
    const have = ORDER.filter((p) => R.some((r) => r.p === p));
    $('#apChips', V).innerHTML = S.rows ? [['', 'Tutti i pannelli'], ...have.map((p) => [p, PN[p]])].map(([p, l]) => `<button type="button" class="fchip ${S.p === p ? 'on' : ''}" data-app="${p}">${esc(l)}<span>${R.filter((r) => (!p || r.p === p) && (!S.own || r.owner === S.own) && FIT[S.st](r)).length}</span></button>`).join('') : '';
    if (!S.rows) { $('#apList', V).innerHTML = '<div class="ap-empty">Carico…</div>'; $('#apMore', V).innerHTML = $('#apBar', V).innerHTML = ''; return; }
    const L = filtered(), shown = L.slice(0, S.limit);
    S.list = L; S.vis = shown;
    // spunte: «Seleziona tutte» prende tutte quelle filtrate (anche oltre le prime 200 mostrate)
    const n = S.sel.size, allOn = L.length > 0 && L.every((r) => S.sel.has(keyOf(r)));
    $('#apBar', V).innerHTML = `<div class="kt-bar"><label style="display:flex;align-items:center;cursor:pointer"><input type="checkbox" class="kt-ck" id="apAll"${allOn ? ' checked' : ''}>Seleziona tutte (${L.length})</label>
      <b>${n ? n + (n === 1 ? ' selezionata' : ' selezionate') : ''}</b>${n ? '<button class="btn sm" type="button" data-apa="look">Consulta</button><button class="btn sm pri" type="button" data-apa="renew">Rinnova</button><button class="btn sm" type="button" data-apa="edit">Modifica</button><button class="btn sm" type="button" data-apa="none">Togli le spunte</button>' : '<span class="mut">Spunta le linee per consultarle, rinnovarle o modificarle</span>'}</div>`;
    $('#apList', V).innerHTML = shown.length ? `<div class="ap-row ap-head"><span></span><span>Pannello</span><span>Utente</span><span>Cliente / nota</span><span>Scadenza</span><span>Stato</span><span>Pagamento</span></div>` + shown.map((r, i) => {
      const tc = window.KXSort ? KXSort.tone(r.exp, r.en, r.expired) : '', on = S.sel.has(keyOf(r));
      return `<div class="ap-row${on ? ' sel' : ''}" role="button" tabindex="0" data-api="${i}" title="Apri in ${esc(PN[r.p])}">
        <input type="checkbox" data-apk="${i}"${on ? ' checked' : ''} aria-label="Seleziona ${esc(r.u)}">
        <span class="ap-pn" style="--c:${PC[r.p]}">${esc(PN[r.p])}</span>
        <span class="ap-u ${tc}">${esc(r.u || '—')}${r.owner ? `<small>${esc(r.owner)}</small>` : ''}</span>
        <span class="ap-n ${r.n ? tc : 'mut'}">${esc(r.n || '—')}</span>
        <span class="ap-x">${esc(day(r.exp))}<small>${esc(left(r.exp))}</small></span>
        <span>${stateHtml(r)}${r.w && isOn(r) ? `<span class="ap-w" title="Sta guardando">▶ ${esc(r.w)}</span>` : ''}</span>
        <span>${window.KXPay ? KXPay.badge('line', r.p, r.ref) : ''}</span></div>`;
    }).join('') : `<div class="ap-empty">${R.length ? 'Nessuna linea con questi filtri.' : 'Nessun pannello IPTV collegato.'}</div>`;
    $('#apMore', V).innerHTML = L.length > shown.length ? `<button class="btn sm" type="button" id="apMoreB" style="margin-top:10px">Mostra altre ${Math.min(200, L.length - shown.length)} (${shown.length} su ${L.length})</button>` : '';
  }

  /* ---------- azioni ---------- */
  const chosen = () => (S.rows || []).filter((r) => S.sel.has(keyOf(r)));
  const closeOv = () => { const o = $('#apOv'); if (o) o.remove(); };
  /* apre la linea nel suo pannello (act: 'edit' | 'renew' preme lo stesso pulsante della riga) */
  function openLine(r, act) {
    if (!r || !window.KXOmni) return;
    closeOv(); S.t = 0; // tornando qui si rilegge: la linea potrebbe essere cambiata
    KXOmni.pick({ p: r.p, q: r.u, t: r.u, tab: r.tab, act });
  }
  function renewGroup(p, rows) {
    closeOv(); S.t = 0;
    const ids = rows.map((r) => r.id);
    if (p === 'wolf' && window.KXWolfRenew) return KXWolfRenew(ids);
    if ((p === 'armada' || p === 'storm') && window.KXArmRenew && KXArmRenew[p]) return KXArmRenew[p](ids);
    return openLine(rows[0], 'renew');
  }
  function renew() {
    const C = chosen(); if (!C.length) return;
    const by = new Map(); for (const r of C) { if (!by.has(r.p)) by.set(r.p, []); by.get(r.p).push(r); }
    if (by.size === 1) {
      const [p, rows] = [...by][0];
      if (BULK.has(p)) return renewGroup(p, rows); // il rinnovo di massa del pannello, con quelle linee già spuntate
      if (rows.length === 1) return openLine(rows[0], 'renew');
    }
    consult('renew');
  }
  function edit() {
    const C = chosen(); if (!C.length) return;
    if (C.length === 1) return openLine(C[0], 'edit');
    consult('edit');
  }
  /* «Consulta»: le schede delle linee scelte, divise per pannello, con Apri / Modifica / Rinnova */
  function consult(mode, again) {
    const C = chosen(); if (!C.length) return;
    const keep = again && $('#apOv .ap-box') ? $('#apOv .ap-box').scrollTop : 0;
    closeOv();
    const by = new Map(); for (const p of ORDER) { const rows = C.filter((r) => r.p === p); if (rows.length) by.set(p, rows); }
    const sub = mode === 'renew' ? 'Le linee sono su pannelli diversi: rinnovi un pannello alla volta. WOLF, Armada e Storm le rinnovano tutte insieme; Atlantix, Realott e SLT una linea alla volta.'
      : mode === 'edit' ? 'Ogni linea si modifica nel suo pannello, una alla volta: premi «Modifica» su quella che vuoi.'
        : 'Tutto quello che il pannello sa delle linee che hai spuntato: server, collegamento, IP e app che le usano.';
    const kv = (k, v, c) => `<div${c ? ` class="${c}"` : ''}><span>${k}</span>${v}</div>`; // ap-kv-w: a tutta larghezza sul telefono
    let i = 0; const idx = [];
    let h = `<div class="ap-bh"><h3>${mode === 'renew' ? 'Rinnova' : mode === 'edit' ? 'Modifica' : 'Consulta'} · ${C.length} ${C.length === 1 ? 'linea' : 'linee'}<small>${sub}</small></h3><button class="btn sm" type="button" data-apo="x">✕ Chiudi</button></div>`;
    for (const [p, rows] of by) {
      h += `<div class="ap-gh"><span class="ap-pn" style="--c:${PC[p]}">${esc(PN[p])}</span><b>${rows.length} ${rows.length === 1 ? 'linea' : 'linee'}</b>${BULK.has(p) && rows.length > 1 ? `<button class="btn sm pri" type="button" data-apo="bulk" data-p="${p}">Rinnova tutte le ${rows.length} su ${esc(PN[p])}</button>` : ''}</div>`;
      for (const r of rows) {
        const tc = window.KXSort ? KXSort.tone(r.exp, r.en, r.expired) : '', v = onOf(r), k = keyOf(r), pwOn = S.pw.has(k);
        idx[i] = r;
        h += `<div class="ap-card"><div class="ap-ch"><span class="ap-cu ${tc}">${esc(r.u || '—')}</span>${stateHtml(r)}${window.KXPay ? KXPay.badge('line', r.p, r.ref) : ''}</div>
          <div class="ap-kv">${kv('Scadenza', `<b class="${tc}">${esc(day(r.exp))}</b> · ${esc(left(r.exp))}`)}${kv('Cliente / nota', r.n ? `<b class="${tc}">${esc(r.n)}</b>` : '<i class="mut">—</i>', 'ap-kv-w')}${kv('Password', r.pw ? `<b class="ap-pw">${pwOn ? esc(r.pw) : '••••••'}</b><button class="btn sm" type="button" data-apo="pw" data-i="${i}">${pwOn ? 'Nascondi' : 'Mostra'}</button><button class="btn sm" type="button" data-apo="cp" data-i="${i}">Copia</button>` : '—', 'ap-kv-w')}
            ${kv('Connessioni', v && v.on ? `${v.conns || 1}/${r.max || '?'}${r.w ? ' · ▶ ' + esc(r.w) : ''}` : r.max ? `0/${r.max}` : '—')}${r.owner ? kv('Reseller', esc(r.owner)) : ''}${kv('ID', esc(r.id || '—'))}${r.created ? kv('Creata', esc(day(r.created))) : ''}${r.pack ? kv('Pacchetto', esc(r.pack)) : ''}${r.trial ? kv('Prova', 'sì') : ''}${window.KXLineCard ? KXLineCard.kvExtra(r, kv, 'ap-kv-w') : ''}</div>
          <div class="ap-acts"><button class="btn sm" type="button" data-apo="open" data-i="${i}">Apri in ${esc(PN[r.p])}</button><button class="btn sm" type="button" data-apo="edit" data-i="${i}">Modifica</button><button class="btn sm${mode === 'renew' ? ' pri' : ''}" type="button" data-apo="renew" data-i="${i}">Rinnova</button></div></div>`;
        i++;
      }
    }
    const o = document.createElement('div'); o.id = 'apOv'; o.innerHTML = `<div class="ap-box" role="dialog" aria-modal="true">${h}</div>`; document.body.appendChild(o);
    if (keep) o.querySelector('.ap-box').scrollTop = keep;
    // IP, app che usano la linea e DNS arrivano dopo: la scheda si ridisegna una volta, nello stesso punto
    if (!again && window.KXLineCard) { const my = o; KXLineCard.load(C).then(() => { if (my.isConnected) consult(mode, true); }); }
    o.addEventListener('mousedown', (e) => { if (e.target === o) closeOv(); });
    o.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-apo]'); if (!b) return;
      const a = b.dataset.apo, r = idx[+b.dataset.i];
      if (a === 'x') return closeOv();
      if (a === 'bulk') return renewGroup(b.dataset.p, by.get(b.dataset.p));
      if (a === 'open') return openLine(r);
      if (a === 'edit') return openLine(r, 'edit');
      if (a === 'renew') return BULK.has(r.p) ? renewGroup(r.p, [r]) : openLine(r, 'renew');
      if (a === 'pw') { const k = keyOf(r); S.pw.has(k) ? S.pw.delete(k) : S.pw.add(k); consult(mode, true); return; }
      if (a === 'cp') { try { await navigator.clipboard.writeText(r.pw); toast('Password copiata'); } catch { toast('Copia non consentita dal browser', 1); } }
    });
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('#apOv')) closeOv(); });

  V.addEventListener('click', (e) => {
    const ck = e.target.closest('input[data-apk]');
    if (ck) { const r = S.vis[+ck.dataset.apk]; if (r) { ck.checked ? S.sel.add(keyOf(r)) : S.sel.delete(keyOf(r)); } return paint(); }
    if (e.target.id === 'apAll') { if (e.target.checked) S.list.forEach((r) => S.sel.add(keyOf(r))); else S.sel.clear(); return paint(); }
    const t = e.target.closest('#apRe,[data-apf],[data-app],[data-api],[data-apa],#apMoreB'); if (!t) return;
    if (t.id === 'apRe') { if (window.KXOnline) KXOnline.refresh(); return load(true); }
    if (t.id === 'apMoreB') { S.limit += 200; return paint(); }
    if (t.dataset.apa) { const a = t.dataset.apa; if (a === 'none') { S.sel.clear(); return paint(); } return a === 'look' ? consult('look') : a === 'renew' ? renew() : edit(); }
    if (t.dataset.apf !== undefined) { S.st = t.dataset.apf; S.limit = 200; return paint(); }
    if (t.dataset.app !== undefined) { S.p = t.dataset.app; S.limit = 200; return paint(); }
    if (t.dataset.api !== undefined && !e.target.closest('button, a, input')) openLine(S.vis[+t.dataset.api]);
  });
  V.addEventListener('change', (e) => {
    if (e.target.id === 'apSt') { S.st = e.target.value; S.limit = 200; paint(); }
    if (e.target.id === 'apOwn') { S.own = e.target.value; S.limit = 200; paint(); }
  });
  V.addEventListener('keydown', (e) => { const t = e.target.closest && e.target.closest('[data-api]'); if (t && e.target === t && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openLine(S.vis[+t.dataset.api]); } });
  V.addEventListener('input', (e) => { if (e.target.id === 'apQ') { S.q = e.target.value; S.limit = 200; paint(); } });
  // aprendo la scheda si legge (se i dati hanno più di 2 minuti); quando arrivano i «collegato sì/no» di Armada e Storm si ridisegna
  new MutationObserver(() => { if (V.classList.contains('on')) { if (!isOwner()) { V.innerHTML = ''; return; } shell(); load(false); } else closeOv(); }).observe(V, { attributes: true, attributeFilter: ['class'] });
  let ot = 0;
  document.addEventListener('kx-online', () => { if (ot || !V.classList.contains('on') || !S.rows) return; ot = setTimeout(() => { ot = 0; paint(); }, 300); });
  const appEl = $('#app');
  if (appEl) new MutationObserver(() => { if (!appEl.classList.contains('on')) { closeOv(); Object.assign(S, { rows: null, t: 0, errs: [], q: '', p: '', own: '', st: 'conn', sort: '', days: 0 }); S.sel.clear(); S.pw.clear(); V.innerHTML = ''; } }).observe(appEl, { attributes: true, attributeFilter: ['class'] });
  window.KXAllPanels = { load, rows: () => S.rows || [] };
})();
