/* KAIROS Control — ricerca incrociata nelle schede dei Pannelli IPTV: mentre cerchi un nome dentro WOLF, Armada, Atlantix,
   Realott, SLT, MaxPlayer, OrbixPlay o MirkoTeam, sotto la casella compare «Trovato anche su…» con le linee con lo stesso
   nome negli altri pannelli (stesse liste del «Cerca ovunque», omni.js) e un clic apre la scheda giusta. Va dopo omni.js.
   Dal 10 novembre 2026 il riquadro resta fisso dopo il primo clic: tiene i risultati della ricerca (es. «pers») anche
   cambiando pannello, segna con ✓ le linee già aperte, «Torna a «…»» rimette la ricerca intera e ✕ lo chiude.
   Una nuova ricerca scritta a mano lo fa ripartire. */
(() => {
  const css = document.createElement('style');
  css.textContent = `.xs-bar{display:flex;flex-direction:column;gap:6px;margin:8px 0 2px;padding:10px 12px;border-radius:12px;background:linear-gradient(150deg,#ff4d4d26,#ffffff06);border:1px solid #ff4d4d88;font-size:12.5px;width:100%}
.xs-head{font-size:14px;display:flex;align-items:flex-start;gap:10px}.xs-head>span{flex:1;min-width:0}.xs-head .xs-p{white-space:nowrap}.xs-head{color:#ff8f8f}.xs-head b{color:#ffb3b3}.xs-head .xs-p em{font-style:normal;display:inline-block;min-width:18px;text-align:center;padding:0 5px;border-radius:9px;background:#e53935;color:#fff;font-weight:700;font-size:11.5px}.xs-head .xs-p.here em{background:#2dd4bf;color:#06201c}
.xs-tools{display:flex;gap:6px;flex:none}.xs-tools button{font:inherit;font-size:12px;font-weight:700;padding:3px 9px;border-radius:8px;border:1px solid #ff4d4d88;background:#ff4d4d1a;color:#ffd0d0;cursor:pointer;white-space:nowrap}.xs-tools button:hover{background:#ff4d4d33}
.xs-grp{display:flex;flex-wrap:wrap;align-items:center;gap:6px}.xs-it.here{border-style:dashed}
.xs-bar>small{color:var(--mut);margin-right:2px}.xs-it{display:inline-flex;align-items:center;gap:6px;padding:3px 8px;border-radius:8px;background:#ffffff0d;border:1px solid var(--line);cursor:pointer;color:var(--fg)}
.xs-it:hover{border-color:#ff4d4d;background:#ff4d4d1a}.xs-it b{font-family:ui-monospace,Menlo,monospace;font-size:12px}.xs-it .wf-tag{margin:0}.xs-it small{color:var(--mut);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.xs-it.seen{border-color:#22c55e88;background:#22c55e14}.xs-it.seen i{font-style:normal;color:#4ade80;font-weight:800}
.xs-bar .xs-more{color:var(--mut);font-size:12px;cursor:pointer;text-decoration:underline dotted}
.xs-pin{color:var(--mut);font-size:11.5px;font-weight:400}
@media (max-width:700px){.xs-head{flex-direction:column;gap:6px}.xs-tools{flex-wrap:wrap}}`;
  document.head.appendChild(css);
  // casella di ricerca di ogni scheda → pannello (per exQ il pannello è quello della sezione aperta: Realott o SLT)
  const IN = [['#wfQ', 'wolf'], ['#v-armada #arQ', 'armada'], ['#v-storm #arQ', 'storm'], ['#axQ', 'atx'], ['#exQ', null], ['#orQ', 'orcp'], ['#mxQ', 'mxp'], ['#oxQ', 'oxp']];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  /* pin: riquadro fisso { q: ricerca di partenza, items, seen: linee già aperte, vals: nomi messi da noi nelle caselle } */
  const S = { q: '', items: null, seq: 0, pre: 0, pin: null, hide: '', more: new Set() };
  const keyOf = (x) => x.p + ':' + String(x.q || x.t || '').toLowerCase();
  function current() {
    for (const [sel, p] of IN) { const e = document.querySelector(sel); if (!e || !e.offsetParent) continue; const v = e.closest('section.view'); if (!v || !v.classList.contains('on')) continue; return { e, p: p || (v.id === 'v-slt' ? 'slt' : 'ro') }; }
    return null;
  }
  function bar(e) { let b = e.parentElement && e.parentElement.nextElementSibling; if (b && b.classList.contains('xs-bar')) return b; b = document.createElement('div'); b.className = 'xs-bar'; e.parentElement.after(b); return b; }
  const drop = (cur) => { const old = cur.e.parentElement && cur.e.parentElement.nextElementSibling; if (old && old.classList.contains('xs-bar')) old.remove(); };
  const setBox = (cur, v) => { cur.e.value = v; cur.e.dispatchEvent(new Event('input', { bubbles: true })); if (cur.p === 'atx') cur.e.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); }; // Atlantix cerca sul server: parte con Invio
  const set = (b, html) => { if (b._h !== html) { b._h = html; b.innerHTML = html; return true; } return false; };
  function render(cur) {
    const q = cur.e.value.trim(), ql = q.toLowerCase();
    // un'altra ricerca scritta a mano: il riquadro fisso si scioglie e riparte da quella
    if (S.pin && q && q !== S.pin.q && !S.pin.vals.has(ql)) S.pin = null;
    if (S.hide && S.hide !== q) S.hide = '';
    if (S.hide) return drop(cur);
    if (S.pin) return draw(cur, S.pin.q, S.pin.items || [], true);
    if (q.length < 3) return drop(cur);
    const b = bar(cur.e);
    if (S.q !== q) { set(b, `<small>⏳ Sto cercando «${esc(q)}» in tutti i pannelli…</small>`); return; }
    draw(cur, q, S.items || [], false);
  }
  function draw(cur, q, L, pinned) {
    const b = bar(cur.e), N = (window.KXOmni && KXOmni.names) || {};
    if (!L.length) { set(b, `<small>«${esc(q)}» non risulta su nessun pannello collegato</small>`); return; }
    const by = new Map(); for (const x of L) { if (!by.has(x.p)) by.set(x.p, []); by.get(x.p).push(x); }
    const order = [...by.keys()].sort((a, c) => (a === cur.p ? -1 : c === cur.p ? 1 : 0));
    const back = pinned && cur.e.value.trim() !== q;
    const tools = pinned ? `<span class="xs-tools">${back ? `<button type="button" data-xsb="back">↺ Torna a «${esc(q)}»</button>` : ''}<button type="button" data-xsb="x" title="Chiudi la ricerca">✕</button></span>` : '';
    let html = `<div class="xs-head"><span><b>«${esc(q)}»</b> è presente in <b>${by.size}</b> ${by.size === 1 ? 'pannello' : 'pannelli'}: ${order.map((p) => `<span class="xs-p${p === cur.p ? ' here' : ''}">${esc(N[p] || p)} <em>${by.get(p).length}</em></span>`).join(' · ')}${pinned ? ' <span class="xs-pin">· resta qui mentre apri le linee</span>' : ''}</span>${tools}</div>`, n = 0;
    const items = [];
    for (const p of order) {
      const G = by.get(p), all = S.more.has(p), cut = all ? G.length : 5;
      html += `<div class="xs-grp"><span class="wf-tag g">${esc(N[p] || p)}${p === cur.p ? ' · qui' : ''}</span>`;
      for (const x of G.slice(0, cut)) {
        const seen = !!(S.pin && S.pin.seen.has(keyOf(x)));
        html += `<span class="xs-it${p === cur.p ? ' here' : ''}${seen ? ' seen' : ''}" data-xs="${n}" title="${p === cur.p ? 'Vai alla sua scheda' : 'Apri in ' + esc(N[p] || p)}">${seen ? '<i>✓</i>' : ''}<b>${esc(x.t)}</b>${x.s ? `<small title="${esc(x.s)}">${esc(x.s)}</small>` : ''}</span>`;
        items[n++] = x;
      }
      if (G.length > cut) html += `<span class="xs-more" data-xsm="${esc(p)}" title="Mostra tutte">+${G.length - cut}</span>`;
      html += '</div>';
    }
    b._items = items;
    if (!set(b, html)) return;
    b.querySelectorAll('[data-xs]').forEach((el) => (el.onclick = () => pick(cur, b._items[+el.dataset.xs], q, L)));
    b.querySelectorAll('[data-xsm]').forEach((el) => (el.onclick = () => { S.more.add(el.dataset.xsm); render(current() || cur); }));
    b.querySelectorAll('[data-xsb]').forEach((el) => (el.onclick = () => {
      const c = current() || cur;
      if (el.dataset.xsb === 'x') { S.pin = null; S.hide = c.e.value.trim(); drop(c); return; }
      if (S.pin) S.pin.vals.add(S.pin.q.toLowerCase());
      setBox(c, q); render(c);
    }));
  }
  /* clic su un nome: il riquadro diventa fisso con la ricerca di partenza, poi si apre la scheda della linea */
  function pick(cur, x, q, L) {
    if (!x) return;
    if (!S.pin) S.pin = { q, items: L, seen: new Set(), vals: new Set() };
    S.pin.seen.add(keyOf(x));
    const name = String(x.q || x.t || '');
    S.pin.vals.add(name.toLowerCase());
    if (x.p !== cur.p) { if (window.KXOmni) KXOmni.pick(x); return; }
    if (cur.e.value.trim().toLowerCase() !== name.toLowerCase()) setBox(cur, name);
    if (window.KXOmni && KXOmni.focus) KXOmni.focus(cur.p, x.t || name);
    render(cur);
  }
  let tmr = 0;
  const PV = new Set(['v-wolf', 'v-armada', 'v-storm', 'v-atx', 'v-ro', 'v-slt', 'v-orcp', 'v-mxp', 'v-oxp']);
  async function tick() {
    const on = document.querySelector('section.view.on');
    if (!on || !PV.has(on.id)) { S.pin = null; S.hide = ''; return; } // uscendo dalle schede dei pannelli il riquadro fisso si scioglie
    const cur = current(); if (!cur || !window.KXOmni) return;
    if (!S.pre) { S.pre = 1; KXOmni.preload(); } // appena apri una scheda dei pannelli, le liste degli altri si scaricano in anticipo
    const q = cur.e.value.trim(), ql = q.toLowerCase();
    // riquadro fisso: i nomi messi da noi nelle caselle non fanno partire un'altra ricerca
    const pinnedVal = S.pin && (!q || q === S.pin.q || S.pin.vals.has(ql));
    if (!pinnedVal && q.length >= 3 && q !== S.q && !tmr) tmr = setTimeout(async () => { tmr = 0; const my = ++S.seq; let items = []; try { items = await KXOmni.find(q); } catch { items = []; } if (my !== S.seq) return; S.q = q; S.items = items; S.more.clear(); const c = current(); if (c) render(c); }, 350);
    render(cur);
  }
  setInterval(tick, 400); // le schede si ridisegnano da sole a ogni lettera: la barra viene rimessa se sparisce
})();
