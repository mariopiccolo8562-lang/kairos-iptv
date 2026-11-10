/* KAIROS Control — «Online ora terzi»: chi è collegato in questo momento sui pannelli esterni (WOLF, Armada, MaxPlayer, OrbixPlay, MirkoTeam/ORCP).
   WOLF dice da solo le connessioni attive di ogni linea; per le altre KAIROS chiede al server IPTV le «connessioni attive»
   (player_api → user_info.active_cons, come fa un'app quando entra: non apre il video). Verde = collegato, rosso = scollegato,
   grigio = il server non ha risposto. Titolare e agenti (solo i pannelli e i clienti che possono vedere). */
(() => {
  const css = document.createElement('style');
  css.textContent = `
.on-dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px;vertical-align:middle;background:#6b7280}
.on-dot.g{background:#22c55e;box-shadow:0 0 8px #22c55eaa}.on-dot.r{background:#ef4444;box-shadow:0 0 6px #ef444466}
.on-dot.o{background:#f59e0b;box-shadow:0 0 8px #f59e0baa}.on-st.o{color:#fbbf24}
.on-st{font-size:12px;font-weight:700;white-space:nowrap}.on-st.g{color:#4ade80}.on-st.r{color:#f87171}.on-st.n{color:var(--mut)}
.cn-k{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:12px}.cn-k div{background:#ffffff08;border:1px solid var(--line);border-radius:12px;padding:12px 14px}
.cn-k b{display:block;font-size:26px;font-weight:800}.cn-k small{color:var(--mut);font-size:12px}
.cn-row{display:grid;grid-template-columns:230px minmax(160px,180px) minmax(0,1fr) minmax(0,1.2fr) minmax(0,1.2fr);gap:10px;align-items:center;padding:9px 0;border-top:1px solid var(--line);font-size:13px}
.cn-row .k{font-size:11px;color:var(--mut);display:block}.cn-row .mono{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cn-row>div{min-width:0;max-width:100%}
.cn-panel-cell{display:flex;flex-direction:column;gap:4px;align-items:flex-start;min-width:0;max-width:100%;overflow:hidden}
@media (max-width:900px){.cn-row{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.cn-k{grid-template-columns:1fr}}`;
  document.head.appendChild(css);

  /* ---------- stato delle linee (cache 90 s) ---------- */
  const C = new Map(), pend = new Map();
  const host = (h) => { h = String(h || '').trim().replace(/\/+$/, ''); if (!h) return ''; if (!/^https?:\/\//i.test(h)) h = 'http://' + h; try { return new URL(h).origin.toLowerCase(); } catch { return ''; } };
  const key = (h, u) => host(h) + '|' + String(u || '');
  const fresh = (k) => { const c = C.get(k); return c && Date.now() - c.t < 90e3; };
  const dot = (v) => v === undefined ? '<span class="on-st n"><i class="on-dot"></i>Verifico…</span>'
    : v === null ? '<span class="on-st n" title="Il server della linea non ha risposto"><i class="on-dot"></i>Non verificabile</span>'
    : v.on && v.conns > 1 ? `<span class="on-st o" title="La stessa linea è aperta su ${v.conns} dispositivi insieme"><i class="on-dot o"></i>${v.conns} connessioni${v.max && v.conns > v.max ? ' (max ' + v.max + ')' : ''}</span>`
    : v.on ? '<span class="on-st g"><i class="on-dot g"></i>Collegato</span>' : '<span class="on-st r"><i class="on-dot r"></i>Scollegato</span>';
  function paint() { document.querySelectorAll('.kx-on[data-on]').forEach((e) => { const c = C.get(e.dataset.on), h = dot(c ? c.v : undefined); if (e.innerHTML !== h) e.innerHTML = h; }); }
  let timer = 0, running = false;
  async function flush() {
    timer = 0; if (running) return; running = true;
    try {
      for (;;) {
        const part = [...pend.entries()].filter(([k]) => !fresh(k)).slice(0, 12); for (const [k] of part) pend.delete(k);
        if (!part.length) break;
        try {
          const r = await api('POST', '/admin/online', { lines: part.map(([k, x]) => ({ k, h: x.h, u: x.u, p: x.p })) });
          for (const [k] of part) C.set(k, { t: Date.now(), v: r && r.res && r.res[k] !== undefined ? r.res[k] : null });
        } catch { for (const [k] of part) C.set(k, { t: Date.now(), v: null }); }
        paint(); if (window.KXOnline.onUpdate) window.KXOnline.onUpdate(); document.dispatchEvent(new Event('kx-online'));
      }
    } finally { pend.clear(); running = false; }
  }
  function want(h, u, p) { const k = key(h, u); if (!host(h) || !u || !p) return ''; if (!fresh(k)) { pend.set(k, { h: host(h), u, p }); if (!timer) timer = setTimeout(flush, 250); } return k; }
  /** pallino da mettere in una riga: si colora da solo quando arriva la risposta */
  function slot(h, u, p) { const k = want(h, u, p); if (!k) return ''; const c = C.get(k); return `<span class="kx-on" data-on="${esc(k)}">${dot(c ? c.v : undefined)}</span>`; }
  /** stato di una linea per i filtri: on | multi | off | na | wait (chiede il controllo se manca) */
  function state(h, u, p) { const k = want(h, u, p); if (!k) return 'na'; const c = C.get(k), v = c ? c.v : undefined; return v === undefined ? 'wait' : v === null ? 'na' : v.on && v.conns > 1 ? 'multi' : v.on ? 'on' : 'off'; }
  /** f = filtro scelto, ss = stati delle linee di una riga (un cliente MaxPlayer può averne più di una) */
  function match(f, ss) { if (!f) return true; if (f === 'on') return ss.some((s) => s === 'on' || s === 'multi'); if (f === 'multi') return ss.includes('multi'); if (f === 'off') return ss.includes('off') && !ss.some((s) => s === 'on' || s === 'multi'); return !ss.length || ss.every((s) => s === 'na' || s === 'wait'); }
  const FIL = [['', 'Connessione: tutti'], ['on', 'Collegati'], ['multi', 'Con più connessioni'], ['off', 'Scollegati'], ['na', 'Non verificabili']];
  const sel = (id, cur) => `<select class="inp" id="${id}" style="width:auto;margin:0">${FIL.map(([k, t]) => `<option value="${k}"${cur === k ? ' selected' : ''}>${t}</option>`).join('')}</select>`;
  /** ridisegna la sezione quando arrivano nuovi stati, solo se il filtro è attivo e la sezione è aperta */
  function watch(secId, active, redraw) { let t = 0; document.addEventListener('kx-online', () => { const s = document.getElementById(secId); if (!active() || !s || !s.classList.contains('on') || t) return; t = setTimeout(() => { t = 0; const a = document.activeElement; if (a && a.tagName === 'INPUT' && s.contains(a)) return; redraw(); }, 600); }); }
  window.KXOnline = { slot, dot, key, want, state, match, sel, watch, get: (k) => (C.get(k) || {}).v, refresh: () => { C.clear(); } };

  /* ---------- «Sta guardando» nelle liste dei pannelli ----------
     Il canale in onda lo dicono WOLF (lista linee), Realott e SLT (connessioni) e Atlantix (connessioni, solo titolare).
     Armada, Storm, MaxPlayer, OrbixPlay e MirkoTeam non lo dicono: per le loro linee vale il canale di WOLF se la stessa
     username è anche una linea WOLF. Cache 60 s; il riquadro si riempie da solo quando arrivano i dati. */
  const WS = { t: 0, busy: null, m: new Map(), ip: new Map() };
  const wAny = (d) => (Array.isArray(d) ? d : d && typeof d === 'object' ? (['rows', 'items', 'connections', 'list', 'data'].map((k) => d[k]).find(Array.isArray) || []) : []);
  const wOf = (p, u) => { u = String(u || '').toLowerCase(); return WS.m.get(p + '|' + u) || (p !== 'wolf' ? WS.m.get('wolf|' + u) : '') || ''; };
  function paintW() { document.querySelectorAll('.kx-w[data-wp]').forEach((e) => { const w = wOf(e.dataset.wp, e.dataset.wu), h = w ? '▶ ' + esc(w) : ''; if (e.innerHTML !== h) e.innerHTML = h; }); }
  function loadWatch() {
    if (WS.busy) return WS.busy; if (Date.now() - WS.t < 60e3) return Promise.resolve(WS.m);
    const isAgent = () => D.role === 'agent', ok = (k) => !isAgent() || !!((D.me && D.me.perms) || {})[k];
    WS.busy = (async () => {
      const m = new Map(), set = (p, u, w) => { u = String(u || '').toLowerCase(); w = String(w || '').trim(); if (u && w) m.set(p + '|' + u, w); };
      // IP, provider e segno VPN delle connessioni (Realott, SLT, Atlantix): li usa la scheda completa della linea (linecard.js)
      const ipm = new Map(), seti = (p, u, r) => { u = String(u || '').toLowerCase(); const ip = String((r && (r.ip || r.user_ip)) || '').trim(); if (!u || !ip) return; const k = p + '|' + u, L = ipm.get(k) || []; if (!L.some((x) => x.ip === ip)) L.push({ ip, isp: String(r.isp || ''), vpn: String(r.vpn || '') }); ipm.set(k, L); };
      await Promise.all([
        ok('wolf') && api('GET', '/admin/wolf/config').then((c) => (c.set ? api('GET', '/admin/wolf/lines') : { lines: [] })).then((d) => (d.lines || []).forEach((l) => l.conns > 0 && set('wolf', l.username, l.watching))).catch(() => {}),
        ...['ro', 'slt'].map((k) => ok(k) && api('GET', `/admin/${k}/conns`).then((d) => (d.rows || []).forEach((r) => { set(k, r.username, r.stream); seti(k, r.username, r); })).catch(() => {})),
        ok('atx') && api('GET', '/admin/atx/conns').then((d) => wAny(d).forEach((c) => { set('atx', c.username, c.channel || c.stream_display_name); seti('atx', c.username, c); })).catch(() => {}),
      ].filter(Boolean));
      WS.m = m; WS.ip = ipm; WS.t = Date.now(); WS.busy = null; paintW(); return m;
    })();
    return WS.busy;
  }
  /** riquadro «▶ canale» da mettere accanto al pallino di una linea (vuoto finché non c'è un canale) */
  function wslot(p, u) { if (!u) return ''; loadWatch(); const w = wOf(p, u); return `<span class="kx-w" data-wp="${esc(p)}" data-wu="${esc(String(u).toLowerCase())}" title="Canale in onda adesso">${w ? '▶ ' + esc(w) : ''}</span>`; }
  css.textContent += '.kx-w{display:inline-block;font-size:12px;font-weight:600;color:#fbbf24;max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;vertical-align:middle;margin-left:6px}.kx-w:empty{display:none}';
  window.KXWatch = { slot: wslot, get: wOf, load: loadWatch, refresh: () => { WS.t = 0; return loadWatch(); }, ip: (p, u) => WS.ip.get(p + '|' + String(u || '').toLowerCase()) || [] };

  /* ---------- sezione «Online ora terzi» (ex «Collegati ora») ---------- */
  const IC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M6.3 6.3a8 8 0 0 0 0 11.4M17.7 6.3a8 8 0 0 1 0 11.4M3.5 3.5a12 12 0 0 0 0 17M20.5 3.5a12 12 0 0 1 0 17"/></svg>';
  if (!$('.nav[data-v="conn"]')) {
    const b = document.createElement('button'); b.className = 'nav'; b.dataset.v = 'conn'; b.innerHTML = IC + 'Online ora terzi'; b.onclick = () => view('conn');
    const anchor = $('.nav[data-v="armada"]') || $('.nav[data-v="wolf"]') || $('.nav[data-v="devices"]'); anchor ? anchor.before(b) : $('#side').appendChild(b);
    const sec = document.createElement('section'); sec.className = 'view'; sec.id = 'v-conn'; $('#v-dash').after(sec);
  }
  TITLES.conn = 'Online ora terzi';
  const isAg = () => D.role === 'agent';
  const perms = () => (D.me && D.me.perms) || {};
  const canP = (k) => !isAg() || !!perms()[k];
  setInterval(() => { const b = $('.nav[data-v="conn"]'); if (b) b.style.display = !isAg() || ['wolf', 'armada', 'storm', 'mxp', 'oxp', 'atx', 'ro', 'slt'].some((k) => perms()[k]) ? '' : 'none'; }, 2000);

  const S = { rows: null, busy: false, f: '', p: '', q: '', errs: [], t: 0, limit: 200 };
  async function loadAll() {
    S.busy = true; S.errs = []; draw();
    const rows = [], err = (n) => (e) => S.errs.push(n + ': ' + (e && e.message ? e.message : e));
    await Promise.all([
      canP('wolf') && (async () => { const c = await api('GET', '/admin/wolf/config'); if (!c.set) return;
        // WOLF ogni tanto non risponde al primo colpo: un secondo tentativo dopo 4 s prima di segnalare l'errore
        const d = await api('GET', '/admin/wolf/lines').catch(() => new Promise((ok, no) => setTimeout(() => api('GET', '/admin/wolf/lines').then(ok, no), 4000)));
        for (const l of d.lines || []) rows.push({ p: 'WOLF', id: l.id, u: l.username, n: l.note, w: l.watching, v: { on: l.conns > 0, conns: l.conns, max: l.max }, mx: l.max, en: l.enabled }); })().catch(err('WOLF')),
      !isAg() && (async () => { const st = await api('GET', '/admin/orcp/state'); if (!st.connected) return;
        // accesso a ORCP scaduto: prima MirkoTeam spariva in silenzio (o restava l'ultima lista salvata, che sembrava di adesso)
        if (st.expired) { S.errs.push('MirkoTeam: l\'accesso a ORCP è scaduto, per questo i collegati non si vedono. Vai in Attivazione app → MirkoTeam → Collega e ripassa l\'accesso (con «Remember me»)'); return; }
        const d = await api('GET', '/admin/orcp/data?w=conns');
        if (d.warn) S.errs.push(`MirkoTeam: ultimo aggiornamento non riuscito (${d.warn})${d.at ? ` · dati delle ${new Date(d.at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}` : ''}`);
        // MirkoTeam (ORCP): un rigo per utente; «connessioni» = dispositivi online adesso con quell'utente.
        // ORCP tiene una scheda per ogni installazione dell'app (reinstallata, aggiornata, dati cancellati) e lascia «online» anche
        // quelle vecchie: lo stesso dispositivo (stesso ID, oppure stesso modello sulla stessa rete) si conta una volta sola.
        const by = new Map(), seen = new Map();
        for (const x of d.list || []) { const k = String(x.user || '').toLowerCase(); if (!k) continue; const r = by.get(k) || { p: 'MirkoTeam', u: x.user, n: '', v: { on: false, conns: 0 }, en: true, last: '', vpn: '' };
          if (x.online) { r.v.on = true; const rank = { prob: 1, app: 2, kairos: 2 }; if ((rank[x.vpn] || 0) > (rank[r.vpn] || 0)) r.vpn = x.vpn; const sn = seen.get(k) || new Set(), ids = orcpIds(x); if (!ids.length || !ids.some((i) => sn.has(i))) r.v.conns++; ids.forEach((i) => sn.add(i)); seen.set(k, sn); }
          const tag = [x.device, x.version && 'v' + x.version].filter(Boolean).join(' · '); if (x.online || !r.n) r.n = tag; if (x.last > r.last) r.last = x.last; by.set(k, r); }
        for (const r of by.values()) rows.push(r); })().catch(err('MirkoTeam')),
      canP('armada') && (async () => { const st = await api('GET', '/admin/armada/state'); if (!st.connected) return; const d = await api('GET', '/admin/armada/lines');
        for (const x of d.lines || []) rows.push({ p: 'Armada', u: x.username, n: x.notes, h: st.dns, pw: x.password, mx: x.maxConn, en: x.enabled }); })().catch(err('Armada')),
      canP('storm') && (async () => { const st = await api('GET', '/admin/storm/state'); if (!st.connected) return; const d = await api('GET', '/admin/storm/lines');
        for (const x of d.lines || []) rows.push({ p: 'Storm', u: x.username, n: x.notes, h: st.dns, pw: x.password, mx: x.maxConn, en: x.enabled }); })().catch(err('Storm')),
      canP('atx') && (async () => { const d = await api('GET', '/admin/atx/lines?all=1');
        for (const x of d.rows || d.lines || []) rows.push({ p: 'Atlantix', u: x.username, n: x.notes, w: x.channel || '', v: { on: Number(x.online) > 0, conns: Number(x.online) || 0, max: Number(x.max_connections) || 0 }, mx: Number(x.max_connections) || 0, en: Number(x.enabled) !== 0 }); })().catch(err('Atlantix')),
      canP('mxp') && (async () => { const a = (await api('GET', '/admin/mxp/accounts')).accounts || [];
        for (const ac of a) { const us = (await api('GET', `/admin/mxp/a/${ac.id}/users`)).users || [];
          for (const u of us) for (const l of u.lists || []) rows.push({ p: 'MaxPlayer', u: l.user, n: u.username || u.email, h: (l.ssl ? 'https://' : 'http://') + l.fqdn + (l.port ? ':' + l.port : ''), pw: l.pass, en: true }); } })().catch(err('MaxPlayer')),
      canP('oxp') && (async () => { const st = await api('GET', '/admin/oxp/state'); if (!st.connected) return; const d = await api('GET', '/admin/oxp/playlists');
        for (const p of d.playlists || []) rows.push({ p: 'OrbixPlay', u: p.user, n: p.notes || p.name || p.device, h: p.host, pw: p.pass, en: true }); })().catch(err('OrbixPlay')),
    ].filter(Boolean));
    // solo WOLF dice il canale in onda: se la stessa linea è anche su OrbixPlay/MaxPlayer/Armada, «Sta guardando» lo prende da lì
    const ww = new Map(rows.filter((r) => r.p === 'WOLF' && r.w && r.u).map((r) => [String(r.u).toLowerCase(), r.w]));
    // «Disconnetti» si può fare solo su WOLF (chiamata kick): per le linee OrbixPlay/MaxPlayer/Armada/MirkoTeam vale se la stessa username è una linea WOLF
    const wid = new Map(rows.filter((r) => r.p === 'WOLF' && r.id && r.u).map((r) => [String(r.u).toLowerCase(), r.id]));
    for (const r of rows) { const k = String(r.u || '').toLowerCase(); if (!r.w && k && ww.has(k)) r.w = ww.get(k); if (!r.v) r.k = want(r.h, r.u, r.pw); r.kick = r.p === 'WOLF' ? r.id : wid.get(k) || 0; }
    S.rows = rows; S.busy = false; S.t = Date.now(); draw();
  }
  const vOf = (r) => r.v || (r.k ? window.KXOnline.get(r.k) : null);
  /** come riconosco lo stesso dispositivo tra le schede ORCP: il suo ID, e il modello con la rete da cui si collega */
  function orcpIds(x) { const hw = String(x.device || '').toLowerCase().trim(), ip = String(x.ip || '').trim(); return [x.did ? 'id:' + x.did : '', hw && ip ? 'hw:' + hw + '|' + ip : ''].filter(Boolean); }
  const stOf = (r) => { const v = vOf(r); return v === undefined ? 'wait' : v === null ? 'na' : v.on ? 'on' : 'off'; };
  const multi = (r) => { const v = vOf(r); return !!(v && v.conns > 1); };
  const KICKED = new Map(); // id WOLF → quando è stata disconnessa (il pannello la mostra «Disconnessa» finché non si ricarica)
  async function kick(list) {
    const todo = list.filter((r) => r.kick && !KICKED.has(r.kick)); if (!todo.length) return;
    const ids = [...new Set(todo.map((r) => r.kick))];
    const body = ids.length === 1 ? `<p>Chiude adesso tutte le connessioni aperte della linea <b>${esc(todo[0].u)}</b> su WOLF. Il cliente potrà ricollegarsi subito (una sola connessione alla volta se il pacchetto lo prevede).</p>`
      : `<p>Chiude adesso le connessioni aperte di <b>${ids.length} linee</b> su WOLF: ${todo.slice(0, 15).map((r) => esc(r.u)).join(', ')}${todo.length > 15 ? ` e altre ${todo.length - 15}` : ''}.</p><p class="mut" style="font-size:12.5px">I clienti potranno ricollegarsi subito.</p>`;
    if (!(await ask(ids.length === 1 ? 'Disconnettere ' + todo[0].u + '?' : `Disconnettere ${ids.length} linee?`, body, 'Disconnetti'))) return;
    let ok = 0, ko = [];
    for (const id of ids) { try { await api('POST', `/admin/wolf/lines/${id}/kick`); KICKED.set(id, Date.now()); ok++; } catch (e) { ko.push((todo.find((r) => r.kick === id) || {}).u + ': ' + (e.message || 'errore')); } }
    toast(ok ? `${ok === 1 ? 'Linea disconnessa' : ok + ' linee disconnesse'} su WOLF` + (ko.length ? ` · ${ko.length} no` : '') : 'Nessuna linea disconnessa', ko.length ? 1 : 0);
    if (ko.length) S.errs = [...S.errs, ...ko.map((x) => 'Disconnetti ' + x)];
    draw(); setTimeout(() => { if (!S.busy) loadAll(); }, 4000); // WOLF aggiorna il conteggio connessioni dopo qualche secondo
  }
  function draw() {
    const V = $('#v-conn'); if (!V) return;
    const rows = S.rows || [], q = S.q.trim().toLowerCase();
    const n = (k) => rows.filter((r) => stOf(r) === k).length;
    const list = rows.filter((r) => (!S.p || r.p === S.p) && (!S.f || (S.f === 'multi' ? multi(r) : stOf(r) === S.f) || (S.f === 'na' && stOf(r) === 'wait')) && (!q || `${r.u} ${r.n} ${r.p} ${r.w || ''}`.toLowerCase().includes(q)))
      .sort((a, b) => (multi(b) - multi(a)) || ((vOf(b) || {}).conns || 0) - ((vOf(a) || {}).conns || 0) || ({ on: 0, wait: 1, off: 2, na: 3 }[stOf(a)] - { on: 0, wait: 1, off: 2, na: 3 }[stOf(b)]));
    const nMulti = rows.filter(multi).length;
    const shown = list.slice(0, S.limit), panels = [...new Set(rows.map((r) => r.p))];
    const FL = [['', 'Tutti'], ['on', 'Collegati'], ['multi', 'Con più connessioni'], ['off', 'Scollegati'], ['na', 'Non verificabili']];
    const keep = document.activeElement && document.activeElement.id === 'cnQ' ? document.activeElement.selectionStart : -1;
    V.innerHTML = `<div class="card glass"><div class="wf-st"><div style="flex:1;min-width:220px"><b style="font-size:15px">Online ora terzi</b><small>${isAg() ? 'I tuoi clienti di WOLF, Armada, Atlantix, MaxPlayer e OrbixPlay' : 'I clienti di WOLF, Armada, Atlantix, MaxPlayer, OrbixPlay e MirkoTeam'}: verde se stanno guardando adesso, arancione se la stessa linea è aperta su più dispositivi insieme, rosso se no. Si aggiorna ogni 2 minuti.</small>${S.t ? `<small>Ultimo controllo: ${new Date(S.t).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</small>` : ''}</div>
        <button class="btn sm" id="cnRe">${S.busy ? 'Carico…' : 'Aggiorna'}</button></div>
      <div class="cn-k"><div><small><i class="on-dot g"></i>Collegati</small><b style="color:#4ade80">${n('on')}</b></div><div><small><i class="on-dot r"></i>Scollegati</small><b style="color:#f87171">${n('off')}</b></div><div data-multi style="cursor:pointer" title="Linee aperte su più dispositivi nello stesso momento"><small><i class="on-dot o"></i>Con più connessioni</small><b style="color:#fbbf24">${nMulti}</b>${rows.some((r) => multi(r) && r.kick && !KICKED.has(r.kick)) ? `<button class="btn sm" id="cnKickAll" style="margin-top:6px;color:#ff8f8f" title="Chiude le connessioni aperte di tutte le linee con più connessioni (solo quelle su WOLF)">Disconnetti tutte</button>` : ''}</div><div><small><i class="on-dot"></i>Non verificabili${n('wait') ? ' · ' + n('wait') + ' in verifica' : ''}</small><b style="color:var(--mut)">${n('na')}</b></div></div>
      ${S.errs.length ? `<p style="color:#ff8f8f;margin:10px 0 0;font-size:12.5px">${S.errs.map(esc).join('<br>')}</p>` : ''}</div>
      <div class="card glass" style="margin-top:14px"><div class="cn-filter-row" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <input class="inp" id="cnQ" placeholder="Cerca utente, cliente o canale" value="${esc(S.q)}" style="max-width:280px;margin:0">
        <select class="inp" id="cnF" style="width:auto;margin:0">${FL.map(([k, t]) => `<option value="${k}"${S.f === k ? ' selected' : ''}>${t}</option>`).join('')}</select>
        <select class="inp" id="cnP" style="width:auto;margin:0"><option value="">Tutti i pannelli</option>${panels.map((p) => `<option${S.p === p ? ' selected' : ''}>${esc(p)}</option>`).join('')}</select>
        <span class="mut" style="font-size:12.5px">${list.length} linee</span>${window.KXVpn ? KXVpn.counter(list) : ''}</div>
      <div style="margin-top:8px">${!S.rows ? `<p class="mut">${S.busy ? 'Carico le linee dai pannelli…' : 'Nessun dato'}</p>` : !rows.length ? '<p class="mut">Nessun pannello collegato con linee da controllare.</p>' : shown.map((r) => `<div class="cn-row">
        <div>${r.kick && KICKED.has(r.kick) ? '<span class="mut">Disconnessa</span>' : r.v ? dot(r.v) : r.k ? `<span class="kx-on" data-on="${esc(r.k)}">${dot(window.KXOnline.get(r.k))}</span>` : dot(null)}${r.kick && !KICKED.has(r.kick) && stOf(r) === 'on' ? `<button class="btn sm" data-kick="${esc(r.u)}" style="margin-top:4px;color:#ff8f8f" title="${r.p === 'WOLF' ? 'Chiude le connessioni aperte di questa linea su WOLF' : 'La linea ' + esc(r.u) + ' è anche su WOLF: chiude lì le connessioni aperte'}">Disconnetti</button>` : ''}</div>
        <div class="cn-panel-cell"><span class="wf-tag g">${esc(r.p)}</span>${r.p === 'MirkoTeam' && window.KXVpn ? KXVpn.tag(r.vpn) : ''}${r.mx ? `<small class="mut" style="font-size:11px">max ${+r.mx} conn.</small>` : ''}${r.en === false ? '<span class="wf-tag b">Disattivata</span>' : ''}</div>
        <div><span class="k">Utente</span><b class="mono">${esc(r.u) || '—'}</b></div>
        <div><span class="k">Cliente / nota</span><div class="mono">${esc(r.n) || '<span class="mut">—</span>'}</div></div>
        <div><span class="k">Sta guardando</span><div class="mono">${r.w ? '▶ ' + esc(r.w) : `<span class="mut" title="${r.p === 'WOLF' ? 'Nessun canale aperto in questo momento' : 'Il pannello ' + esc(r.p) + ' non dice quale canale è aperto: lo mostro solo se la stessa linea è anche su WOLF'}">—</span>`}${r.p === 'MirkoTeam' && r.last && !(r.v && r.v.on) ? `<small class="mut" style="display:block;font-size:11px">ultimo accesso ${esc(r.last)}</small>` : ''}</div></div></div>`).join('')}</div>
      ${list.length > shown.length ? `<div style="margin-top:10px"><button class="btn sm" id="cnMore">Mostra altre ${Math.min(200, list.length - shown.length)}</button></div>` : ''}</div>`;
    $('#cnRe').onclick = () => { window.KXOnline.refresh(); loadAll(); };
    const mk = $('[data-multi]', V); if (mk) mk.onclick = (e) => { if (e.target.closest('#cnKickAll')) return; S.f = S.f === 'multi' ? '' : 'multi'; S.limit = 200; draw(); };
    const ka = $('#cnKickAll', V); if (ka) ka.onclick = () => kick(rows.filter(multi));
    $$('[data-kick]', V).forEach((b) => (b.onclick = () => { const u = b.dataset.kick.toLowerCase(); kick(rows.filter((r) => String(r.u || '').toLowerCase() === u && r.kick)); }));
    $('#cnF').onchange = (e) => { S.f = e.target.value; S.limit = 200; draw(); };
    $('#cnP').onchange = (e) => { S.p = e.target.value; S.limit = 200; draw(); };
    const qi = $('#cnQ'); qi.oninput = () => { S.q = qi.value; S.limit = 200; draw(); };
    if (keep >= 0) { const e = $('#cnQ'); e.focus(); e.setSelectionRange(keep, keep); }
    if ($('#cnMore')) $('#cnMore').onclick = () => { S.limit += 200; draw(); };
  }
  let redraw = 0;
  window.KXOnline.onUpdate = () => { const sec = $('#v-conn'); if (sec && sec.classList.contains('on') && !redraw) redraw = setTimeout(() => { redraw = 0; draw(); }, 400); };
  const sec = $('#v-conn');
  const visible = () => sec && sec.classList.contains('on') && !document.hidden;
  function open() { draw(); if (!S.rows || Date.now() - S.t > 120e3) loadAll(); }
  const v0 = view;
  window.view = view = function (v) { const r = v0.apply(this, arguments); if (v === 'conn') open(); return r; };
  if (sec) new MutationObserver(() => { if (sec.classList.contains('on') && !sec.innerHTML.trim()) open(); }).observe(sec, { attributes: true, attributeFilter: ['class'] });
  setInterval(() => { if (visible() && !S.busy && Date.now() - S.t > 120e3) { window.KXOnline.refresh(); loadAll(); } }, 15e3);
})();
