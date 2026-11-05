/* KAIROS Control — tempo di attesa tra una richiesta e l'altra, uno per tipo (Segnalazioni, Contenuti, Temi, Assistente IA).
   Dopo una richiesta il cliente aspetta la fine del tempo oppure la tua risposta; se riprova vede «In attesa del fornitore…».
   Lo decide solo il titolare: la barra compare in cima a ogni pagina delle richieste. */
(() => {
  const PAGES = [['v-reports', 'report', 'segnalazione'], ['v-creq', 'content', 'richiesta di contenuto'], ['v-areq', 'addon', 'richiesta di tema/add-on'], ['v-ai', 'ai', 'richiesta di altre domande IA']];
  const OPTS = [[0, 'Nessuna attesa'], [5, '5 minuti'], [15, '15 minuti'], [30, '30 minuti'], [60, '1 ora'], [120, '2 ore'], [360, '6 ore'], [720, '12 ore'], [1440, '1 giorno'], [2880, '2 giorni'], [10080, '7 giorni']];
  const css = document.createElement('style');
  css.textContent = `.rw-bar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:12px 16px;margin-bottom:14px;border-radius:14px;border:1px solid color-mix(in srgb,#f5b041 45%,transparent);border-left:4px solid #f5b041;background:linear-gradient(150deg,color-mix(in srgb,#f5b041 13%,transparent),transparent)}
.rw-bar b{font-size:14px}.rw-bar small{display:block;color:var(--mut);font-size:12px;line-height:1.45;margin-top:2px}.rw-bar .rw-t{flex:1;min-width:240px}
.rw-bar select{width:auto;min-width:170px;margin:0}.rw-bar .rw-on{color:#f5b041;font-weight:700}`;
  document.head.appendChild(css);
  const owner = () => D.role !== 'agent' && !window.__assist;
  const cur = (k) => { const w = (D.settings && D.settings.reqWait) || {}; return +w[k] || 0; };
  const lbl = (n) => (OPTS.find((o) => o[0] === n) || [n, n + ' minuti'])[1];
  function bar(sec, kind, what) {
    const show = owner() && (sec.id !== 'v-ai' || sec.dataset.mode === 'req');
    let b = sec.querySelector(':scope > .rw-bar');
    if (!show) { if (b) b.remove(); return; }
    const n = cur(kind);
    const html = `<span style="font-size:20px">⏱</span><div class="rw-t"><b>Tempo di attesa tra una ${what} e l'altra: <span class="rw-on">${esc(lbl(n))}</span></b><small>${n ? `Dopo una ${what} il cliente aspetta ${esc(lbl(n))} oppure che tu la segni come fatta, rifiutata o la elimini. Se riprova prima vede «In attesa del fornitore…».` : 'Il cliente può inviarne quante vuole (restano i limiti contro gli abusi).'}</small></div>
      <select class="inp" data-rw="${kind}">${(OPTS.some((o) => o[0] === n) ? OPTS : [...OPTS, [n, n + ' minuti']]).map(([v, l]) => `<option value="${v}" ${v === n ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
    if (!b) { b = document.createElement('div'); b.className = 'rw-bar'; sec.prepend(b); }
    if (b.dataset.v === String(n)) return;
    b.dataset.v = String(n); b.innerHTML = html;
    b.querySelector('select').onchange = async (e) => {
      const v = +e.target.value;
      try { const r = await api('PUT', '/admin/settings', { reqWait: { ...((D.settings && D.settings.reqWait) || {}), [kind]: v } }); if (r && r.settings) D.settings = r.settings; else D.settings.reqWait = { ...(D.settings.reqWait || {}), [kind]: v }; toast(v ? 'Attesa: ' + lbl(v) : 'Nessuna attesa'); } catch (err) { toast(err.message, 1); }
      delete b.dataset.v; sync();
    };
  }
  function sync() { for (const [id, kind, what] of PAGES) { const s = document.getElementById(id); if (s) bar(s, kind, what); } }
  for (const [id] of PAGES) { const s = document.getElementById(id); if (s) new MutationObserver(() => sync()).observe(s, { childList: true, attributes: true, attributeFilter: ['data-mode'] }); }
  const ra = renderAll;
  window.renderAll = renderAll = function () { ra(); sync(); };
  if (typeof DEMO !== 'undefined') { DEMO.settings.reqWait = DEMO.settings.reqWait || { report: 0, content: 30, addon: 0, ai: 1440 }; }
  sync();
})();
