/* KAIROS Control — «Per linea»: unisce tutto quello che usa lo stesso nome utente (la linea IPTV):
   i clienti Kairos (Pro, TV, Lite, XC), le attivazioni OrbixPlay e MaxPlayer (dalla scheda o da «Crea lista»)
   e le altre app registrate in «Linee collegate». Così si vede subito su quante app è attiva ogni linea.
   Pagina in Linee IPTV → «Per linea» e riquadro nella scheda del cliente. */
(() => {
  const css = document.createElement('style');
  css.textContent = `.lm-ch{display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:700;padding:3px 9px;border-radius:999px;margin:2px 4px 2px 0;background:color-mix(in srgb,var(--c) 18%,transparent);color:color-mix(in srgb,var(--c) 70%,#fff);border:1px solid color-mix(in srgb,var(--c) 40%,transparent)}
.lm-n{display:inline-grid;place-items:center;min-width:34px;height:34px;border-radius:11px;font-weight:800;font-size:16px;background:rgba(79,140,255,.18);color:#9cc0ff}.lm-n.many{background:rgba(34,197,94,.18);color:#86efac}
.lm-row{display:grid;grid-template-columns:44px minmax(0,1.1fr) minmax(0,2.4fr);gap:14px;align-items:center;padding:12px 14px;border:1px solid var(--line);border-radius:14px;margin-bottom:8px;background:rgba(255,255,255,.02);cursor:pointer}
.lm-row:hover{border-color:rgba(79,140,255,.45)}.lm-row b{display:block}.lm-row small{color:var(--mut);font-size:12px}
.lm-det{grid-column:1/-1;border-top:1px solid var(--line);padding-top:10px;margin-top:4px;font-size:13px}.lm-det div{padding:4px 0}
.lm-box{border:1px solid rgba(34,197,94,.4);border-left:4px solid #22c55e;border-radius:14px;padding:12px 14px;margin-bottom:14px;background:linear-gradient(150deg,rgba(34,197,94,.1),transparent)}
.lm-det a{color:#93c5fd;text-decoration:none;font-weight:600;margin-left:6px}.lm-det a:hover{text-decoration:underline}
.lm-box h4{margin:0 0 6px;font-size:14px}.lm-warn{color:#fbbf24;font-size:12px;font-weight:700}`;
  document.head.appendChild(css);
  const COL = { 'Kairos Pro': '#4f8cff', 'Kairos TV': '#22d3ee', 'Kairos Lite': '#34d399', 'Kairos XC': '#a78bfa', 'Kairos Plus': '#e879f9', OrbixPlay: '#38bdf8', MaxPlayer: '#fb7185' };
  const APPN = { tv: 'Kairos Pro', ktv: 'Kairos TV', prem: 'Kairos Premium', lite: 'Kairos Lite', xc: 'Kairos XC', plus: 'Kairos Plus', '': 'Kairos Pro' };
  const norm = (u) => String(u || '').trim().toLowerCase();
  const uOf = (p) => { if (p.username) return { u: p.username, p: p.password || '' }; try { const x = new URL(p.url || ''); const u = x.searchParams.get('username'); if (u) return { u, p: x.searchParams.get('password') || '' }; } catch {} return null; };
  let LL = null, XL = null, lt = 0;
  async function extra(force) {
    if (!force && Date.now() - lt < 60e3) return; lt = Date.now();
    const [a, b] = await Promise.all([api('GET', '/admin/linked-lines').then((r) => r.items || []).catch(() => []), api('GET', '/admin/ext-lists').then((r) => r.lists || []).catch(() => [])]);
    LL = a; XL = b;
  }
  /** mappa nome utente → { user, items: [{ app, who, ref, id, pass }] } */
  function build() {
    const M = new Map();
    const add = (u, it) => { const k = norm(u); if (!k) return; let g = M.get(k); if (!g) { g = { user: String(u).trim(), items: [], pw: new Set() }; M.set(k, g); } g.items.push(it); if (it.pass) g.pw.add(it.pass); };
    for (const d of D.devices || []) {
      const who = d.name || d.code, P = d.parent ? (D.devices || []).find((x) => x.id === d.parent) : null;
      const seen = new Set();
      for (const p of (d.parent && P && !d.own ? P.playlists : d.playlists) || []) { const c = uOf(p); if (!c || seen.has(norm(c.u))) continue; seen.add(norm(c.u)); add(c.u, { app: APPN[d.app || ''] || 'Kairos Pro', who, ref: d.code, id: d.id, pass: c.p, linked: !!d.parent }); }
      if (d.orbix && d.orbix.u) add(d.orbix.u, { app: 'OrbixPlay', who, ref: 'ID ' + d.orbix.id, id: d.id });
      if (d.maxp && d.maxp.u) add(d.maxp.u, { app: 'MaxPlayer', who, ref: 'utente ' + d.maxp.u, id: d.id });
    }
    for (const x of XL || []) add(x.username, { app: x.app === 'max' ? 'MaxPlayer' : 'OrbixPlay', who: x.name || '— senza cliente —', ref: (x.app === 'max' ? 'utente ' : 'ID ') + x.ref, ext: true });
    for (const x of LL || []) if (!x.source) add(x.username, { app: x.app, who: x.deviceName || '— senza cliente —', ref: x.mac ? 'MAC ' + x.mac : x.dnsName || '', id: x.deviceId || '', ll: true });
    return M;
  }
  const chip = (a) => `<span class="lm-ch" style="--c:${COL[a] || '#f5b041'}">${esc(a)}</span>`;
  const appsOf = (g) => [...new Set(g.items.map((i) => i.app))];

  /* ---------- pagina Linee IPTV → «Per linea» ---------- */
  TITLES.lmap = 'Per linea';
  const side = $('#side'), dash = $('#v-dash');
  if (side && !$('.nav[data-v="lmap"]')) { const b = document.createElement('button'); b.className = 'nav'; b.dataset.v = 'lmap'; b.textContent = 'Per linea'; b.onclick = () => view('lmap'); side.appendChild(b); }
  if (dash && !$('#v-lmap')) { const s = document.createElement('section'); s.className = 'view'; s.id = 'v-lmap'; dash.after(s); }
  const F = { q: '', many: false, open: new Set() };
  function page() {
    const V = $('#v-lmap'); if (!V || !V.classList.contains('on')) return;
    const groups = [...build().values()].sort((a, b) => b.items.length - a.items.length || a.user.localeCompare(b.user));
    const q = F.q.toLowerCase();
    const list = groups.filter((g) => (!F.many || appsOf(g).length > 1) && (!q || (g.user + ' ' + g.items.map((i) => i.who + ' ' + i.app + ' ' + i.ref).join(' ')).toLowerCase().includes(q)));
    const multi = groups.filter((g) => g.items.length > 1).length;
    V.innerHTML = `<div class="card glass"><div class="hd"><h3>Per linea<small>Tutto quello che usa lo stesso nome utente: clienti Kairos, OrbixPlay, MaxPlayer e le altre app di «Linee collegate». Il numero è quante app usano quella linea.</small></h3><b class="mut" style="font-size:13px">${groups.length} linee · ${multi} su più app</b></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px"><input class="inp" id="lmQ" placeholder="Cerca utente, cliente, app…" value="${esc(F.q)}" style="flex:1;min-width:200px;margin:0"><div class="filters" style="margin:0"><button class="fchip ${F.many ? '' : 'on'}" data-lmf="0">Tutte</button><button class="fchip ${F.many ? 'on' : ''}" data-lmf="1">Solo su più app</button></div></div>
      ${!LL && !XL ? '<p class="mut">Carico le linee collegate…</p>' : ''}
      ${list.length ? list.slice(0, 400).map((g) => { const k = norm(g.user), ap = appsOf(g), op = F.open.has(k); return `<div class="lm-row" data-lmk="${esc(k)}"><span class="lm-n ${g.items.length > 1 ? 'many' : ''}">${g.items.length}</span><div><b class="mono">${esc(g.user)}</b><small>${esc([...new Set(g.items.map((i) => i.who))].slice(0, 3).join(', '))}</small>${g.pw.size > 1 ? '<div class="lm-warn">⚠ password diverse tra le app</div>' : ''}</div><div>${ap.map(chip).join('')}</div>${op ? `<div class="lm-det">${g.items.map((i) => `<div>${chip(i.app)} <b>${esc(i.who)}</b> <span class="mut">${esc(i.ref || '')}${i.linked ? ' · TV collegata' : ''}${i.ext ? ' · da «Crea lista»' : ''}${i.ll ? ' · Linee collegate' : ''}</span>${i.id ? ` <a href="#" data-lmopen="${esc(i.id)}">scheda</a>` : ''}</div>`).join('')}</div>` : ''}</div>`; }).join('') : '<div class="emptyc">Nessuna linea</div>'}</div>`;
    const qi = $('#lmQ'); qi.oninput = () => { F.q = qi.value; const p = qi.selectionStart; page(); const q2 = $('#lmQ'); q2.focus(); q2.setSelectionRange(p, p); };
    $$('[data-lmf]', V).forEach((b) => (b.onclick = () => { F.many = b.dataset.lmf === '1'; page(); }));
    $$('[data-lmk]', V).forEach((r) => (r.onclick = (e) => { if (e.target.closest('a,input,button')) return; const k = r.dataset.lmk; F.open.has(k) ? F.open.delete(k) : F.open.add(k); page(); }));
    $$('[data-lmopen]', V).forEach((a) => (a.onclick = (e) => { e.preventDefault(); const d = D.devices.find((x) => x.id === a.dataset.lmopen); if (d) openDrawer(d); }));
  }

  /* ---------- scheda del cliente: «Questa linea è attiva su N app» ---------- */
  function boxFor(d) {
    if (!d || !d.id) return '';
    const P = d.parent ? (D.devices || []).find((x) => x.id === d.parent) : d;
    const us = [...new Set(((P && P.playlists) || []).map(uOf).filter(Boolean).map((c) => c.u))];
    if (!us.length) return '';
    const M = build();
    return us.map((u) => { const g = M.get(norm(u)); if (!g) return ''; const ap = appsOf(g); return `<div class="lm-box"><h4>🔗 Linea <span class="mono">${esc(u)}</span>: attiva su ${g.items.length} ${g.items.length === 1 ? 'app' : 'app'}</h4>${ap.map(chip).join('')}<div style="margin-top:6px;font-size:12.5px" class="mut">${g.items.map((i) => `${esc(i.app)}: ${esc(i.who)}${i.ref ? ' (' + esc(i.ref) + ')' : ''}`).join(' · ')}</div>${g.pw.size > 1 ? '<div class="lm-warn" style="margin-top:4px">⚠ password diverse tra le app</div>' : ''}</div>`; }).join('');
  }
  function inject() {
    // titolare: parte «App» della scheda; agente: sopra «Altre app» del suo modulo
    const host = $('#ds-oth') || $('#cOth');
    if (!host) return;
    const d = typeof edit !== 'undefined' && edit && $('#ds-oth') ? edit : (window.__agEdit || null);
    const cur = d || (D.devices || []).find((x) => x.id === (host.dataset.dev || ''));
    const html = boxFor(cur);
    let b = host.previousElementSibling && host.previousElementSibling.dataset.lmbox ? host.previousElementSibling : null;
    if (!html) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement('div'); b.dataset.lmbox = '1'; host.before(b); }
    if (b.innerHTML !== html) b.innerHTML = html;
  }
  const rd = renderDrawer;
  window.renderDrawer = renderDrawer = function () { const r = rd.apply(this, arguments); try { inject(); } catch {} return r; };
  const od = openDrawer;
  window.openDrawer = openDrawer = function (d) { window.__agEdit = d; const r = od.apply(this, arguments); extra().then(() => { try { inject(); } catch {} }); setTimeout(() => { try { inject(); } catch {} }, 300); return r; };
  const ra = renderAll;
  window.renderAll = renderAll = function () { ra(); if ($('#v-lmap.on')) page(); };
  const v0 = view;
  window.view = view = function (v) { const r = v0.apply(this, arguments); if (v === 'lmap') { page(); extra(true).then(page); } return r; };
})();
