/* KAIROS Control — ricerca unica in alto (tasto «/» o Ctrl+K): clienti (anche per utente della linea), agenti,
   pagine del menu e linee dei pannelli esterni WOLF, Armada, MaxPlayer, OrbixPlay, Atlantix, Realott, SLT e MirkoTeam in un solo elenco.
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
.ox-mut{padding:10px;color:var(--mut);font-size:13px}
.kx-hl{animation:kxHl 4s ease-out;border-radius:12px}tr.kx-hl>td{animation:kxHlBg 4s ease-out}
@keyframes kxHl{0%,40%{box-shadow:0 0 0 2px #fbbf24,0 0 26px rgba(251,191,36,.45);background:rgba(251,191,36,.08)}100%{box-shadow:0 0 0 0 transparent;background:transparent}}
@keyframes kxHlBg{0%,40%{background:rgba(251,191,36,.16)}100%{background:transparent}}
@media (prefers-reduced-motion:reduce){.kx-hl,tr.kx-hl>td{animation-duration:.01s}}`;
  document.head.appendChild(css);
  const wrap = gq.parentElement; wrap.style.position = 'relative';
  const dd = document.createElement('div'); dd.className = 'ox-dd'; wrap.appendChild(dd);

  const isAg = () => D.role === 'agent';
  const can = (k) => !isAg() || !!(((D.me || {}).perms || {})[k]);
  const EXT = { t: 0, items: [], busy: null };
  // pannelli che hanno risposto «non collegato»: nelle ricerche in anticipo si saltano per 10 minuti (prima ogni volta 6 richieste a vuoto)
  const OFF = {}, live = (k) => !(OFF[k] && Date.now() - OFF[k] < 600e3), miss = (k) => (e) => { if (/collega prima|non è collegat/i.test((e && e.message) || '')) OFF[k] = Date.now(); };
  function loadExt() {
    if (EXT.busy) return EXT.busy;
    if (Date.now() - EXT.t < 180e3) return Promise.resolve(EXT.items);
    EXT.busy = (async () => {
      const out = [], T = [], add = (x) => out.push(x);
      if (can('wolf') && live('wolf')) T.push(api('GET', '/admin/wolf/lines').then((r) => (r.lines || []).forEach((l) => add({ p: 'wolf', tag: 'WOLF', t: l.username, s: [l.note, l.owner, l.enabled ? '' : 'disattivata'].filter(Boolean).join(' · '), q: l.username, hay: [l.username, l.note, l.owner, l.id] }))).catch(miss('wolf')));
      if (can('armada') && live('armada')) {
        T.push(api('GET', '/admin/armada/lines').then((r) => (r.lines || []).forEach((x) => add({ p: 'armada', tab: 'lines', tag: 'ARM', t: x.username, s: [x.notes, x.by || x.owner].filter(Boolean).join(' · '), q: x.username, hay: [x.username, x.notes, x.by, x.owner] }))).catch(miss('armada')));
        T.push(api('GET', '/admin/armada/mags').then((r) => (r.mags || []).forEach((x) => add({ p: 'armada', tab: 'mags', tag: 'MAG', t: x.mac, s: [x.notes, x.by || x.owner].filter(Boolean).join(' · '), q: x.mac, hay: [x.mac, x.notes, x.by, x.owner] }))).catch(miss('armada')));
      }
      if (can('storm') && live('storm')) {
        T.push(api('GET', '/admin/storm/lines').then((r) => (r.lines || []).forEach((x) => add({ p: 'storm', tab: 'lines', tag: 'STORM', t: x.username, s: [x.notes, x.by || x.owner].filter(Boolean).join(' · '), q: x.username, hay: [x.username, x.notes, x.by, x.owner] }))).catch(miss('storm')));
        T.push(api('GET', '/admin/storm/mags').then((r) => (r.mags || []).forEach((x) => add({ p: 'storm', tab: 'mags', tag: 'ST-MAG', t: x.mac, s: [x.notes, x.by || x.owner].filter(Boolean).join(' · '), q: x.mac, hay: [x.mac, x.notes, x.by, x.owner] }))).catch(miss('storm')));
      }
      if (can('mxp') && live('mxp')) T.push(api('GET', '/admin/mxp/accounts').then(async (r) => {
        for (const a of (r.accounts || []).slice(0, 5)) {
          const u = await api('GET', `/admin/mxp/a/${encodeURIComponent(a.id)}/users`).catch(() => ({ users: [] }));
          (u.users || []).forEach((x) => add({ p: 'mxp', tag: 'MAX', t: x.username || 'ID ' + x.id, s: (x.lists || []).map((l) => l.user).join(', '), q: x.username || String(x.id), hay: [x.id, x.username, x.email, ...(x.lists || []).map((l) => l.user + ' ' + l.fqdn)] }));
        }
      }).catch(miss('mxp')));
      // Atlantix, Realott, SLT e MirkoTeam (ORCP): stesse risposte delle loro schede
      const arr = (d) => (Array.isArray(d) ? d : d && typeof d === 'object' ? (['rows', 'items', 'lines', 'users', 'list', 'data'].map((k) => d[k]).find(Array.isArray) || []) : []);
      if (can('atx') && live('atx')) T.push(api('GET', '/admin/atx/lines?all=1&page=1&q=&status=&reseller=').then((r) => arr(r).forEach((x) => add({ p: 'atx', tag: 'ATX', t: x.username, s: [x.notes, x.reseller || x.owner || x.reseller_username, Number(x.enabled) === 0 ? 'disattivata' : ''].filter(Boolean).join(' · '), q: x.username, hay: [x.username, x.notes, x.id, x.reseller, x.owner, x.reseller_username] }))).catch(miss('atx')));
      for (const [k, tag] of [['ro', 'REALOTT'], ['slt', 'SLT']]) if (can(k) && live(k)) T.push(api('GET', `/admin/${k}/lines`).then((r) => (r.rows || []).forEach((x) => add({ p: k, tag, t: x.username, s: [x.notes, x.owner, x.status].filter(Boolean).join(' · '), q: x.username, hay: [x.username, x.notes, x.owner, x.id] }))).catch(miss(k)));
      if (!isAg()) T.push(api('GET', '/admin/orcp/state').then((st) => st.connected ? api('GET', '/admin/orcp/data?w=conns') : { list: [] }).then((r) => { const seen = new Set(); (r.list || []).forEach((x) => { const k = String(x.user || '').toLowerCase(); if (!k || seen.has(k)) return; seen.add(k); add({ p: 'orcp', tag: 'MIRKO', t: x.user, s: [x.online ? 'online ora' : 'ultimo accesso ' + (x.last || ''), x.device].filter(Boolean).join(' · '), q: x.user, hay: [x.user, x.device, x.ip] }); }); }).catch(() => {}));
      if (can('oxp') && live('oxp')) T.push(api('GET', '/admin/oxp/playlists').then((r) => (r.playlists || []).forEach((x) => add({ p: 'oxp', tag: 'ORB', t: x.user || x.name, s: 'dispositivo ' + x.device + (x.name ? ' · ' + x.name : ''), q: x.device, hay: [x.user, x.device, x.name, x.host] }))).catch(miss('oxp')));
      await Promise.all(T);
      out.forEach((x) => (x.hay = x.hay.filter(Boolean).join(' ').toLowerCase()));
      EXT.items = out; EXT.t = Date.now(); EXT.busy = null;
      return out;
    })();
    return EXT.busy;
  }

  const fits = (hay, toks) => toks.every((t) => hay.includes(t));
  const PK0 = ['wolf', 'armada', 'storm', 'mxp', 'oxp', 'atx', 'ro', 'slt', 'orcp'], PN0 = ['WOLF', 'Armada', 'Storm', 'MaxPlayer', 'OrbixPlay', 'Atlantix', 'Realott', 'SLT', 'MirkoTeam'];
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
      .map((a) => ({ k: 'agent', tag: 'AG', t: a.username, s: [a.email || '', a.active === false ? 'sospeso' : ''].filter(Boolean).join(' · ') || 'agente', a }));
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
    const PK = PK0, PN = PN0;
    const ext = q.length >= 3 && (!isAg() || ['wolf', 'armada', 'storm', 'mxp', 'oxp', 'atx', 'ro', 'slt'].some(can));
    const extOf = (L) => { const r = L.filter((x) => fits(x.hay, toks)); return PN.map((n, i) => [n, r.filter((x) => x.p === PK[i]).slice(0, 6).map((x) => ({ ...x, k: 'ext' }))]); };
    if (!ext) return draw(base, false);
    const fresh = EXT.t && Date.now() - EXT.t < 180e3;
    draw(fresh ? [...base, ...extOf(EXT.items)] : base, !fresh);
    if (fresh) return;
    const L = await loadExt(); if (my !== seq) return;
    draw([...base, ...extOf(L)], false);
  }
  /* la «scheda» della linea: porta in vista la sua riga nel pannello e la evidenzia per un attimo */
  /* riga della linea nel pannello aperto (la cerca per nome esatto) */
  function rowOf(p, want) {
    const v = document.getElementById('v-' + p);
    // i nomi nel riquadro rosso della ricerca (xsearch.js, .xs-bar) non sono righe: si salta quello e si cerca nella lista
    const el = v && [...v.querySelectorAll('b, .mono, code')].find((e) => e.offsetParent && !e.closest('.xs-bar') && e.textContent.trim().toLowerCase() === want);
    if (!el) return null;
    const row = el.closest('.wf-row, .ar-row, .mx-row, tr, .card') || el;
    return row.getBoundingClientRect().height > 420 ? el.parentElement || el : row;
  }
  async function focusLine(p, name, again) {
    const want = String(name || '').trim().toLowerCase(); if (!want) return false;
    await new Promise((r) => setTimeout(r, 300)); // il pannello ridisegna la lista dopo la ricerca: prima si aspetta quella
    for (let i = 0; i < 25; i++) {
      const row = rowOf(p, want);
      if (row) {
        row.scrollIntoView({ block: 'center', behavior: 'smooth' });
        row.classList.remove('kx-hl'); void row.offsetWidth; row.classList.add('kx-hl');
        setTimeout(() => row.classList.remove('kx-hl'), 4200);
        if (!again) setTimeout(() => { if (!row.isConnected) focusLine(p, name, true); }, 900); // lista ridisegnata di nuovo: si rievidenzia
        return true;
      }
      await new Promise((r) => setTimeout(r, 160));
    }
    return false;
  }
  const IN = { wolf: '#wfQ', armada: '#v-armada #arQ', storm: '#v-storm #arQ', mxp: '#mxQ', oxp: '#oxQ', atx: '#axQ', ro: '#exQ', slt: '#exQ', orcp: '#orQ' };
  async function pick(x) {
    if (!x) return;
    dd.classList.remove('on'); gq.blur();
    if (x.k === 'page') return view(x.go());
    if (x.k === 'all') { D.q = x.q.toLowerCase(); view('devices'); return renderDevices(); }
    if (x.k === 'dev') return openQuick(x.d);
    if (x.k === 'agent') return view('agents');
    view(x.p);
    for (let i = 0; i < 60; i++) { // la pagina del pannello si disegna dopo aver scaricato i dati
      if (x.tab) { const t = document.querySelector(`#v-${x.p} [data-artab="${x.tab}"]`); if (t && !t.classList.contains('on') && !t.dataset.oxDone) { t.dataset.oxDone = '1'; t.click(); } }
      const e = document.querySelector(IN[x.p]);
      if (e && (!x.tab || document.querySelector(`#v-${x.p} [data-artab="${x.tab}"].on`) || i > 30)) { e.value = x.q; e.dispatchEvent(new Event('input', { bubbles: true })); if (x.p === 'atx') e.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); break; } // Atlantix cerca sul server: parte con Invio
      await new Promise((r) => setTimeout(r, 150));
    }
    document.querySelectorAll('[data-ox-done]').forEach((t) => delete t.dataset.oxDone);
    const ok = await focusLine(x.p, x.t || x.q);
    // «Modifica» o «Rinnova» chiesti da «Tutti i pannelli»: si preme lo stesso pulsante della riga (stessa finestra di sempre)
    if (ok && x.act) {
      // Armada e Storm: la nota («+ nota» / «Modifica nota») arriva nella riga poco dopo (line-notes.js), quindi si riprova per 2 secondi
      const want = x.act === 'edit' ? ['Modifica', 'Modifica nota', '+ nota'] : ['Rinnova'];
      let b = null;
      for (let i = 0; i < 10 && !b; i++) {
        await new Promise((r) => setTimeout(r, i ? 200 : 450));
        const row = rowOf(x.p, String(x.t || x.q).trim().toLowerCase()), bs = row ? [...row.querySelectorAll('button')] : [];
        for (const w of want) { b = bs.find((e) => e.textContent.trim() === w); if (b) break; } // prima «Modifica» (tutta la linea), poi la sola nota
      }
      if (b) b.click(); else toast(x.act === 'edit' ? 'Questa linea non ha «Modifica» nel suo pannello' : 'Rinnova la linea dal suo pannello', 1);
    }
    return ok;
  }
  /* per la ricerca incrociata nelle schede dei pannelli (xsearch.js): stesse liste, stessa apertura del risultato */
  window.KXOmni = { preload: () => loadExt().catch(() => []), find: async (q) => { const toks = String(q || '').toLowerCase().split(/\s+/).filter(Boolean); if (!toks.length) return []; const L = await loadExt(); return L.filter((x) => fits(x.hay, toks)); }, pick: (x) => pick({ ...x, k: 'ext' }), focus: focusLine, names: Object.fromEntries(PK0.map((k, i) => [k, PN0[i]])) };
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
