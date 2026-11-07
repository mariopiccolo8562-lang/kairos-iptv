/* KAIROS Control — ricerca incrociata nelle schede dei Pannelli IPTV: mentre cerchi un nome dentro WOLF, Armada, Atlantix,
   Realott, SLT, MaxPlayer, OrbixPlay o MirkoTeam, sotto la casella compare «Trovato anche su…» con le linee con lo stesso
   nome negli altri pannelli (stesse liste del «Cerca ovunque», omni.js) e un clic apre la scheda giusta. Va dopo omni.js. */
(() => {
  const css = document.createElement('style');
  css.textContent = `.xs-bar{display:flex;flex-direction:column;gap:6px;margin:8px 0 2px;padding:10px 12px;border-radius:12px;background:linear-gradient(150deg,#4f8cff1f,#ffffff06);border:1px solid #4f8cff55;font-size:12.5px;width:100%}
.xs-head{font-size:14px}.xs-head .xs-p{white-space:nowrap}.xs-head .xs-p em{font-style:normal;display:inline-block;min-width:18px;text-align:center;padding:0 5px;border-radius:9px;background:#4f8cff;color:#fff;font-weight:700;font-size:11.5px}.xs-head .xs-p.here em{background:#2dd4bf;color:#06201c}
.xs-grp{display:flex;flex-wrap:wrap;align-items:center;gap:6px}.xs-it.here{cursor:default;border-style:dashed}
.xs-bar>small{color:var(--mut);margin-right:2px}.xs-it{display:inline-flex;align-items:center;gap:6px;padding:3px 8px;border-radius:8px;background:#ffffff0d;border:1px solid var(--line);cursor:pointer;color:var(--fg)}
.xs-it:hover{border-color:#4f8cff;background:#4f8cff1a}.xs-it b{font-family:ui-monospace,Menlo,monospace;font-size:12px}.xs-it .wf-tag{margin:0}.xs-it small{color:var(--mut);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.xs-bar .xs-more{color:var(--mut);font-size:12px}`;
  document.head.appendChild(css);
  // casella di ricerca di ogni scheda → pannello (per exQ il pannello è quello della sezione aperta: Realott o SLT)
  const IN = [['#wfQ', 'wolf'], ['#arQ', 'armada'], ['#axQ', 'atx'], ['#exQ', null], ['#orQ', 'orcp'], ['#mxQ', 'mxp'], ['#oxQ', 'oxp']];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const S = { q: '', items: null, seq: 0, pre: 0 };
  function current() {
    for (const [sel, p] of IN) { const e = document.querySelector(sel); if (!e || !e.offsetParent) continue; const v = e.closest('section.view'); if (!v || !v.classList.contains('on')) continue; return { e, p: p || (v.id === 'v-slt' ? 'slt' : 'ro') }; }
    return null;
  }
  function bar(e) { let b = e.parentElement && e.parentElement.nextElementSibling; if (b && b.classList.contains('xs-bar')) return b; b = document.createElement('div'); b.className = 'xs-bar'; e.parentElement.after(b); return b; }
  function render(cur) {
    const q = cur.e.value.trim(), old = cur.e.parentElement && cur.e.parentElement.nextElementSibling;
    if (q.length < 3) { if (old && old.classList.contains('xs-bar')) old.remove(); return; }
    const b = bar(cur.e), N = (window.KXOmni && KXOmni.names) || {};
    if (S.q !== q) { b.innerHTML = `<small>⏳ Sto cercando «${esc(q)}» in tutti i pannelli…</small>`; return; }
    const L = S.items || [];
    if (!L.length) { b.innerHTML = `<small>«${esc(q)}» non risulta su nessun pannello collegato</small>`; return; }
    const by = new Map(); for (const x of L) { if (!by.has(x.p)) by.set(x.p, []); by.get(x.p).push(x); }
    const order = [...by.keys()].sort((a, c) => (a === cur.p ? -1 : c === cur.p ? 1 : 0));
    let html = `<div class="xs-head"><b>«${esc(q)}»</b> è presente in <b>${by.size}</b> ${by.size === 1 ? 'pannello' : 'pannelli'}: ${order.map((p) => `<span class="xs-p${p === cur.p ? ' here' : ''}">${esc(N[p] || p)} <em>${by.get(p).length}</em></span>`).join(' · ')}</div>`, n = 0;
    for (const p of order) { html += `<div class="xs-grp"><span class="wf-tag g">${esc(N[p] || p)}${p === cur.p ? ' · qui' : ''}</span>`; for (const x of by.get(p).slice(0, 5)) { html += `<span class="xs-it${p === cur.p ? ' here' : ''}" data-xs="${n}" title="${p === cur.p ? 'È in questa lista' : 'Apri in ' + esc(N[p] || p)}"><b>${esc(x.t)}</b>${x.s ? `<small title="${esc(x.s)}">${esc(x.s)}</small>` : ''}</span>`; b['_x' + n] = x; n++; } if (by.get(p).length > 5) html += `<span class="xs-more">+${by.get(p).length - 5}</span>`; html += '</div>'; }
    b.innerHTML = html;
    b.querySelectorAll('[data-xs]').forEach((el) => (el.onclick = () => { const x = b['_x' + el.dataset.xs]; if (x && x.p !== cur.p && window.KXOmni) KXOmni.pick(x); }));
  }
  let tmr = 0;
  async function tick() {
    const cur = current(); if (!cur || !window.KXOmni) return;
    if (!S.pre) { S.pre = 1; KXOmni.preload(); } // appena apri una scheda dei pannelli, le liste degli altri si scaricano in anticipo
    const q = cur.e.value.trim();
    if (q.length >= 3 && q !== S.q && !tmr) tmr = setTimeout(async () => { tmr = 0; const my = ++S.seq; let items = []; try { items = await KXOmni.find(q); } catch { items = []; } if (my !== S.seq) return; S.q = q; S.items = items; const c = current(); if (c) render(c); }, 350);
    render(cur);
  }
  setInterval(tick, 400); // le schede si ridisegnano da sole a ogni lettera: la barra viene rimessa se sparisce
})();
