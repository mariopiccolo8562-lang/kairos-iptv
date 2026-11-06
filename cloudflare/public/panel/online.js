/* KAIROS Control — «Collegati ora»: chi è collegato in questo momento sui pannelli esterni (WOLF, Armada, MaxPlayer, OrbixPlay).
   WOLF dice da solo le connessioni attive di ogni linea; per le altre KAIROS chiede al server IPTV le «connessioni attive»
   (player_api → user_info.active_cons, come fa un'app quando entra: non apre il video). Verde = collegato, rosso = scollegato,
   grigio = il server non ha risposto. Titolare e agenti (solo i pannelli e i clienti che possono vedere). */
(() => {
  const css = document.createElement('style');
  css.textContent = `
.on-dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px;vertical-align:middle;background:#6b7280}
.on-dot.g{background:#22c55e;box-shadow:0 0 8px #22c55eaa}.on-dot.r{background:#ef4444;box-shadow:0 0 6px #ef444466}
.on-st{font-size:12px;font-weight:700;white-space:nowrap}.on-st.g{color:#4ade80}.on-st.r{color:#f87171}.on-st.n{color:var(--mut)}
.cn-k{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:12px}.cn-k div{background:#ffffff08;border:1px solid var(--line);border-radius:12px;padding:12px 14px}
.cn-k b{display:block;font-size:26px;font-weight:800}.cn-k small{color:var(--mut);font-size:12px}
.cn-row{display:grid;grid-template-columns:150px 110px minmax(0,1fr) minmax(0,1.2fr) minmax(0,1.2fr);gap:10px;align-items:center;padding:9px 0;border-top:1px solid var(--line);font-size:13px}
.cn-row .k{font-size:11px;color:var(--mut);display:block}.cn-row .mono{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
@media (max-width:900px){.cn-row{grid-template-columns:1fr 1fr}.cn-k{grid-template-columns:1fr}}`;
  document.head.appendChild(css);

  /* ---------- stato delle linee (cache 90 s) ---------- */
  const C = new Map(), pend = new Map();
  const host = (h) => { h = String(h || '').trim().replace(/\/+$/, ''); if (!h) return ''; if (!/^https?:\/\//i.test(h)) h = 'http://' + h; try { return new URL(h).origin.toLowerCase(); } catch { return ''; } };
  const key = (h, u) => host(h) + '|' + String(u || '');
  const fresh = (k) => { const c = C.get(k); return c && Date.now() - c.t < 90e3; };
  const dot = (v) => v === undefined ? '<span class="on-st n"><i class="on-dot"></i>Verifico…</span>'
    : v === null ? '<span class="on-st n" title="Il server della linea non ha risposto"><i class="on-dot"></i>Non verificabile</span>'
    : v.on ? `<span class="on-st g"><i class="on-dot g"></i>Collegato${v.conns > 1 ? ' · ' + v.conns : ''}</span>` : '<span class="on-st r"><i class="on-dot r"></i>Scollegato</span>';
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
        paint(); if (window.KXOnline.onUpdate) window.KXOnline.onUpdate();
      }
    } finally { pend.clear(); running = false; }
  }
  function want(h, u, p) { const k = key(h, u); if (!host(h) || !u || !p) return ''; if (!fresh(k)) { pend.set(k, { h: host(h), u, p }); if (!timer) timer = setTimeout(flush, 250); } return k; }
  /** pallino da mettere in una riga: si colora da solo quando arriva la risposta */
  function slot(h, u, p) { const k = want(h, u, p); if (!k) return ''; const c = C.get(k); return `<span class="kx-on" data-on="${esc(k)}">${dot(c ? c.v : undefined)}</span>`; }
  window.KXOnline = { slot, dot, key, want, get: (k) => (C.get(k) || {}).v, refresh: () => { C.clear(); } };

  /* ---------- sezione «Collegati ora» ---------- */
  const IC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M6.3 6.3a8 8 0 0 0 0 11.4M17.7 6.3a8 8 0 0 1 0 11.4M3.5 3.5a12 12 0 0 0 0 17M20.5 3.5a12 12 0 0 1 0 17"/></svg>';
  if (!$('.nav[data-v="conn"]')) {
    const b = document.createElement('button'); b.className = 'nav'; b.dataset.v = 'conn'; b.innerHTML = IC + 'Collegati ora'; b.onclick = () => view('conn');
    const anchor = $('.nav[data-v="armada"]') || $('.nav[data-v="wolf"]') || $('.nav[data-v="devices"]'); anchor ? anchor.before(b) : $('#side').appendChild(b);
    const sec = document.createElement('section'); sec.className = 'view'; sec.id = 'v-conn'; $('#v-dash').after(sec);
  }
  TITLES.conn = 'Collegati ora';
  const isAg = () => D.role === 'agent';
  const perms = () => (D.me && D.me.perms) || {};
  const canP = (k) => !isAg() || !!perms()[k];
  setInterval(() => { const b = $('.nav[data-v="conn"]'); if (b) b.style.display = !isAg() || ['wolf', 'armada', 'mxp', 'oxp'].some((k) => perms()[k]) ? '' : 'none'; }, 2000);

  const S = { rows: null, busy: false, f: '', p: '', q: '', errs: [], t: 0, limit: 200 };
  async function loadAll() {
    S.busy = true; S.errs = []; draw();
    const rows = [], err = (n) => (e) => S.errs.push(n + ': ' + (e && e.message ? e.message : e));
    await Promise.all([
      canP('wolf') && (async () => { const c = await api('GET', '/admin/wolf/config'); if (!c.set) return; const d = await api('GET', '/admin/wolf/lines');
        for (const l of d.lines || []) rows.push({ p: 'WOLF', u: l.username, n: l.note, w: l.watching, v: { on: l.conns > 0, conns: l.conns }, en: l.enabled }); })().catch(err('WOLF')),
      canP('armada') && (async () => { const st = await api('GET', '/admin/armada/state'); if (!st.connected) return; const d = await api('GET', '/admin/armada/lines');
        for (const x of d.lines || []) rows.push({ p: 'Armada', u: x.username, n: x.notes, h: st.dns, pw: x.password, en: x.enabled }); })().catch(err('Armada')),
      canP('mxp') && (async () => { const a = (await api('GET', '/admin/mxp/accounts')).accounts || [];
        for (const ac of a) { const us = (await api('GET', `/admin/mxp/a/${ac.id}/users`)).users || [];
          for (const u of us) for (const l of u.lists || []) rows.push({ p: 'MaxPlayer', u: l.user, n: u.username || u.email, h: (l.ssl ? 'https://' : 'http://') + l.fqdn + (l.port ? ':' + l.port : ''), pw: l.pass, en: true }); } })().catch(err('MaxPlayer')),
      canP('oxp') && (async () => { const st = await api('GET', '/admin/oxp/state'); if (!st.connected) return; const d = await api('GET', '/admin/oxp/playlists');
        for (const p of d.playlists || []) rows.push({ p: 'OrbixPlay', u: p.user, n: p.notes || p.name || p.device, h: p.host, pw: p.pass, en: true }); })().catch(err('OrbixPlay')),
    ].filter(Boolean));
    for (const r of rows) if (!r.v) r.k = want(r.h, r.u, r.pw);
    S.rows = rows; S.busy = false; S.t = Date.now(); draw();
  }
  const stOf = (r) => { const v = r.v || (r.k ? window.KXOnline.get(r.k) : null); return v === undefined ? 'wait' : v === null ? 'na' : v.on ? 'on' : 'off'; };
  function draw() {
    const V = $('#v-conn'); if (!V) return;
    const rows = S.rows || [], q = S.q.trim().toLowerCase();
    const n = (k) => rows.filter((r) => stOf(r) === k).length;
    const list = rows.filter((r) => (!S.p || r.p === S.p) && (!S.f || stOf(r) === S.f || (S.f === 'na' && stOf(r) === 'wait')) && (!q || `${r.u} ${r.n} ${r.p} ${r.w || ''}`.toLowerCase().includes(q)))
      .sort((a, b) => ({ on: 0, wait: 1, off: 2, na: 3 }[stOf(a)] - { on: 0, wait: 1, off: 2, na: 3 }[stOf(b)]));
    const shown = list.slice(0, S.limit), panels = [...new Set(rows.map((r) => r.p))];
    const FL = [['', 'Tutti'], ['on', 'Collegati'], ['off', 'Scollegati'], ['na', 'Non verificabili']];
    const keep = document.activeElement && document.activeElement.id === 'cnQ' ? document.activeElement.selectionStart : -1;
    V.innerHTML = `<div class="card glass"><div class="wf-st"><div style="flex:1;min-width:220px"><b style="font-size:15px">Collegati ora</b><small>${isAg() ? 'I tuoi clienti' : 'I clienti'} di WOLF, Armada, MaxPlayer e OrbixPlay: verde se stanno guardando adesso, rosso se no. Si aggiorna ogni 2 minuti.</small>${S.t ? `<small>Ultimo controllo: ${new Date(S.t).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</small>` : ''}</div>
        <button class="btn sm" id="cnRe">${S.busy ? 'Carico…' : 'Aggiorna'}</button></div>
      <div class="cn-k"><div><small><i class="on-dot g"></i>Collegati</small><b style="color:#4ade80">${n('on')}</b></div><div><small><i class="on-dot r"></i>Scollegati</small><b style="color:#f87171">${n('off')}</b></div><div><small><i class="on-dot"></i>Non verificabili${n('wait') ? ' · ' + n('wait') + ' in verifica' : ''}</small><b style="color:var(--mut)">${n('na')}</b></div></div>
      ${S.errs.length ? `<p style="color:#ff8f8f;margin:10px 0 0;font-size:12.5px">${S.errs.map(esc).join('<br>')}</p>` : ''}</div>
      <div class="card glass" style="margin-top:14px"><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <input class="inp" id="cnQ" placeholder="Cerca utente, cliente o canale" value="${esc(S.q)}" style="max-width:280px;margin:0">
        <select class="inp" id="cnF" style="width:auto;margin:0">${FL.map(([k, t]) => `<option value="${k}"${S.f === k ? ' selected' : ''}>${t}</option>`).join('')}</select>
        <select class="inp" id="cnP" style="width:auto;margin:0"><option value="">Tutti i pannelli</option>${panels.map((p) => `<option${S.p === p ? ' selected' : ''}>${esc(p)}</option>`).join('')}</select>
        <span class="mut" style="font-size:12.5px">${list.length} linee</span></div>
      <div style="margin-top:8px">${!S.rows ? `<p class="mut">${S.busy ? 'Carico le linee dai pannelli…' : 'Nessun dato'}</p>` : !rows.length ? '<p class="mut">Nessun pannello collegato con linee da controllare.</p>' : shown.map((r) => `<div class="cn-row">
        <div>${r.v ? dot(r.v) : r.k ? `<span class="kx-on" data-on="${esc(r.k)}">${dot(window.KXOnline.get(r.k))}</span>` : dot(null)}</div>
        <div><span class="wf-tag g">${esc(r.p)}</span>${r.en === false ? '<span class="wf-tag b">Disattivata</span>' : ''}</div>
        <div><span class="k">Utente</span><b class="mono">${esc(r.u) || '—'}</b></div>
        <div><span class="k">Cliente / nota</span><div class="mono">${esc(r.n) || '<span class="mut">—</span>'}</div></div>
        <div><span class="k">Sta guardando</span><div class="mono">${r.w ? '▶ ' + esc(r.w) : '<span class="mut">—</span>'}</div></div></div>`).join('')}</div>
      ${list.length > shown.length ? `<div style="margin-top:10px"><button class="btn sm" id="cnMore">Mostra altre ${Math.min(200, list.length - shown.length)}</button></div>` : ''}</div>`;
    $('#cnRe').onclick = () => { window.KXOnline.refresh(); loadAll(); };
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
