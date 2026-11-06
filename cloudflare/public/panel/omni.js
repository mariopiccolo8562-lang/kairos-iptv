/* KAIROS Control — ricerca unica in alto (tasto «/» o Ctrl+K): clienti (anche per utente della linea), agenti,
   pagine del menu e linee dei pannelli esterni WOLF, Armada, MaxPlayer e OrbixPlay in un solo elenco.
   Le linee esterne si scaricano solo alla prima ricerca (poi restano 3 minuti) e solo per i pannelli che puoi usare:
   un agente trova solo le sue, perché sono le stesse risposte filtrate del server. Va caricato dopo i pannelli. */
(() => {
  const old = $('#gq'); if (!old) return;
  const gq = old.cloneNode(true); old.replaceWith(gq); // toglie il vecchio «salta ai Clienti a ogni lettera»
  gq.placeholder = 'Cerca ovunque…  ( / )'; gq.title = 'Cliente, utente della linea, MAC, agente o pagina';
  gq.autocomplete = 'off'; gq.spellcheck = false;
  const css = document.createElement('style');
  css.textContent = `
.ox-dd{position:absolute;top:calc(100% + 6px);left:0;width:min(600px,92vw);max-height:70vh;overflow:auto;z-index:60;background:#0e1320;border:1px solid var(--line);border-radius:14px;box-shadow:0 18px 50px #000a;padding:6px;display:none}
.ox-dd.on{display:block}.ox-dd h6{margin:8px 10px 4px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--mut)}
.ox-it{display:flex;gap:10px;align-items:center;padding:8px 10px;border-radius:10px;cursor:pointer}.ox-it.on,.ox-it:hover{background:#ffffff12}
.ox-it i{font-style:normal;flex:none;min-width:34px;text-align:center;font-size:10.5px;font-weight:800;padding:3px 6px;border-radius:7px;background:#4f8cff26;color:#8fb3ff}
.ox-it b{font-weight:700}.ox-it small{display:block;color:var(--mut);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:470px}
.ox-mut{padding:10px;color:var(--mut);font-size:13px}`;
  document.head.appendChild(css);
  const wrap = gq.parentElement; wrap.style.position = 'relative';
  const dd = document.createElement('div'); dd.className = 'ox-dd'; wrap.appendChild(dd);

  const isAg = () => D.role === 'agent';
  const can = (k) => !isAg() || !!(((D.me || {}).perms || {})[k]);
  const EXT = { t: 0, items: [], busy: null };
  function loadExt() {
    if (EXT.busy) return EXT.busy;
    if (Date.now() - EXT.t < 180e3) return Promise.resolve(EXT.items);
    EXT.busy = (async () => {
      const out = [], T = [], add = (x) => out.push(x);
      if (can('wolf')) T.push(api('GET', '/admin/wolf/lines').then((r) => (r.lines || []).forEach((l) => add({ p: 'wolf', tag: 'WOLF', t: l.username, s: [l.note, l.owner, l.enabled ? '' : 'disattivata'].filter(Boolean).join(' · '), q: l.username, hay: [l.username, l.note, l.owner, l.id] }))).catch(() => {}));
      if (can('armada')) {
        T.push(api('GET', '/admin/armada/lines').then((r) => (r.lines || []).forEach((x) => add({ p: 'armada', tab: 'lines', tag: 'ARM', t: x.username, s: [x.notes, x.by || x.owner].filter(Boolean).join(' · '), q: x.username, hay: [x.username, x.notes, x.by, x.owner] }))).catch(() => {}));
        T.push(api('GET', '/admin/armada/mags').then((r) => (r.mags || []).forEach((x) => add({ p: 'armada', tab: 'mags', tag: 'MAG', t: x.mac, s: [x.notes, x.by || x.owner].filter(Boolean).join(' · '), q: x.mac, hay: [x.mac, x.notes, x.by, x.owner] }))).catch(() => {}));
      }
      if (can('mxp')) T.push(api('GET', '/admin/mxp/accounts').then(async (r) => {
        for (const a of (r.accounts || []).slice(0, 5)) {
          const u = await api('GET', `/admin/mxp/a/${encodeURIComponent(a.id)}/users`).catch(() => ({ users: [] }));
          (u.users || []).forEach((x) => add({ p: 'mxp', tag: 'MAX', t: x.username || 'ID ' + x.id, s: (x.lists || []).map((l) => l.user).join(', '), q: x.username || String(x.id), hay: [x.id, x.username, x.email, ...(x.lists || []).map((l) => l.user + ' ' + l.fqdn)] }));
        }
      }).catch(() => {}));
      if (can('oxp')) T.push(api('GET', '/admin/oxp/playlists').then((r) => (r.playlists || []).forEach((x) => add({ p: 'oxp', tag: 'ORB', t: x.user || x.name, s: 'dispositivo ' + x.device + (x.name ? ' · ' + x.name : ''), q: x.device, hay: [x.user, x.device, x.name, x.host] }))).catch(() => {}));
      await Promise.all(T);
      out.forEach((x) => (x.hay = x.hay.filter(Boolean).join(' ').toLowerCase()));
      EXT.items = out; EXT.t = Date.now(); EXT.busy = null;
      return out;
    })();
    return EXT.busy;
  }

  const fits = (hay, toks) => toks.every((t) => hay.includes(t));
  let items = [], sel = 0, seq = 0;
  function pages(toks) {
    return $$('.nav[data-v]').filter((b) => b.style.display !== 'none' && (b.offsetParent !== null || !!b.closest('#side.m4'))).map((b) => ({ v: b.dataset.v, name: (b.textContent || '').replace(/\d+\s*$/, '').trim() }))
      .filter((x) => x.name && fits(x.name.toLowerCase(), toks)).slice(0, 5).map((x) => ({ k: 'page', tag: 'VAI', t: x.name, s: 'Pagina del pannello', go: () => x.v }));
  }
  function clients(q, toks) {
    const out = [];
    for (const d of D.devices || []) {
      const hay = [d.code, d.name, d.notes, d.model, ...(d.playlists || []).map((p) => p && p.username)].filter(Boolean).join(' ').toLowerCase();
      if (fits(hay, toks)) out.push({ k: 'dev', tag: d.parent ? 'TV' : 'CLI', t: d.name || d.code, s: [d.code, d.parent ? 'connessione collegata' : '', d.expires ? 'scade ' + fmtD(d.expires) : '', d.status === 'disabled' ? 'disattivato' : ''].filter(Boolean).join(' · '), d });
      if (out.length >= 8) break;
    }
    if (out.length) out.unshift({ k: 'all', tag: '⌕', t: `Tutti i clienti con «${q}»`, s: 'Apre l\'elenco Clienti filtrato', q });
    return out;
  }
  function agents(toks) {
    return isAg() ? [] : (D.agents || []).filter((a) => fits([a.username, a.email, a.storeCode, a.notes].filter(Boolean).join(' ').toLowerCase(), toks)).slice(0, 5)
      .map((a) => ({ k: 'agent', tag: 'AG', t: a.username, s: ['codice Store ' + (a.storeCode || '—'), a.active === false ? 'sospeso' : ''].filter(Boolean).join(' · '), a }));
  }
  function draw(groups, loading) {
    items = []; let h = '';
    for (const [title, L] of groups) {
      if (!L.length) continue;
      h += `<h6>${esc(title)}</h6>` + L.map((x) => { items.push(x); return `<div class="ox-it" data-i="${items.length - 1}"><i>${esc(x.tag)}</i><div><b>${esc(x.t || '—')}</b>${x.s ? `<small>${esc(x.s)}</small>` : ''}</div></div>`; }).join('');
    }
    if (loading) h += '<div class="ox-mut">Cerco anche nei pannelli WOLF, Armada, MaxPlayer e OrbixPlay…</div>';
    if (!h) h = '<div class="ox-mut">Nessun risultato</div>';
    dd.innerHTML = h; dd.classList.add('on'); sel = Math.min(sel, Math.max(0, items.length - 1)); mark();
    dd.querySelectorAll('.ox-it').forEach((e) => { e.onmousedown = (ev) => { ev.preventDefault(); pick(items[+e.dataset.i]); }; });
  }
  const mark = () => dd.querySelectorAll('.ox-it').forEach((e) => e.classList.toggle('on', +e.dataset.i === sel));
  async function search() {
    const q = gq.value.trim(), toks = q.toLowerCase().split(/\s+/).filter(Boolean), my = ++seq;
    if (!q) { dd.classList.remove('on'); if (D.q) { D.q = ''; renderDevices(); } return; }
    const base = [['Clienti', clients(q, toks)], ['Agenti', agents(toks)], ['Pagine', pages(toks)]];
    const ext = q.length >= 3 && ['wolf', 'armada', 'mxp', 'oxp'].some(can);
    const extOf = (L) => { const r = L.filter((x) => fits(x.hay, toks)); return ['WOLF', 'Armada', 'MaxPlayer', 'OrbixPlay'].map((n, i) => [n, r.filter((x) => x.p === ['wolf', 'armada', 'mxp', 'oxp'][i]).slice(0, 6).map((x) => ({ ...x, k: 'ext' }))]); };
    if (!ext) return draw(base, false);
    const fresh = EXT.t && Date.now() - EXT.t < 180e3;
    draw(fresh ? [...base, ...extOf(EXT.items)] : base, !fresh);
    if (fresh) return;
    const L = await loadExt(); if (my !== seq) return;
    draw([...base, ...extOf(L)], false);
  }
  const IN = { wolf: '#wfQ', armada: '#arQ', mxp: '#mxQ', oxp: '#oxQ' };
  async function pick(x) {
    if (!x) return;
    dd.classList.remove('on'); gq.blur();
    if (x.k === 'page') return view(x.go());
    if (x.k === 'all') { D.q = x.q.toLowerCase(); view('devices'); return renderDevices(); }
    if (x.k === 'dev') return openQuick(x.d);
    if (x.k === 'agent') return view('agents');
    view(x.p);
    for (let i = 0; i < 60; i++) { // la pagina del pannello si disegna dopo aver scaricato i dati
      if (x.tab) { const t = document.querySelector(`[data-artab="${x.tab}"]`); if (t && !t.classList.contains('on') && !t.dataset.oxDone) { t.dataset.oxDone = '1'; t.click(); } }
      const e = document.querySelector(IN[x.p]);
      if (e && (!x.tab || document.querySelector(`[data-artab="${x.tab}"].on`) || i > 30)) { e.value = x.q; e.dispatchEvent(new Event('input', { bubbles: true })); break; }
      await new Promise((r) => setTimeout(r, 150));
    }
    document.querySelectorAll('[data-ox-done]').forEach((t) => delete t.dataset.oxDone);
  }
  let tmr = 0;
  gq.addEventListener('input', () => { clearTimeout(tmr); sel = 0; tmr = setTimeout(search, 120); });
  gq.addEventListener('focus', () => { if (gq.value.trim()) search(); });
  gq.addEventListener('blur', () => setTimeout(() => dd.classList.remove('on'), 150));
  gq.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (items.length) { sel = (sel + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length; mark(); const on = dd.querySelector('.ox-it.on'); if (on) on.scrollIntoView({ block: 'nearest' }); } }
    else if (e.key === 'Enter') { e.preventDefault(); if (items[sel]) pick(items[sel]); else if (gq.value.trim()) pick({ k: 'all', q: gq.value.trim() }); }
    else if (e.key === 'Escape') { dd.classList.remove('on'); gq.blur(); }
  });
  document.addEventListener('keydown', (e) => {
    const t = e.target, typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    if ((e.key === '/' && !typing) || ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K'))) { e.preventDefault(); gq.focus(); gq.select(); }
  });
})();
