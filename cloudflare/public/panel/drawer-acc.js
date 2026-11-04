/* KAIROS Control 2.10 — scheda cliente «a tendina»: ogni sezione (1 Cliente, 2 Abbonamento…) si apre e si chiude toccando il titolo.
   Il menu a sinistra apre la sezione scelta. Va caricato dopo gli altri moduli che modificano la scheda. */
(() => {
  const css = document.createElement('style');
  css.textContent = `
#dBody .dsh{cursor:pointer;user-select:none;border-radius:10px;margin:-6px -6px 6px;padding:6px}
#dBody .dsh:hover{background:rgba(255,255,255,.035)}
#dBody .dsh::after{content:'';flex:none;margin-left:auto;margin-right:6px;width:9px;height:9px;border-right:2px solid var(--mut);border-bottom:2px solid var(--mut);transform:rotate(45deg) translateY(-2px);transition:transform .2s}
#dBody .dsec.closed{padding-top:12px;padding-bottom:12px}
#dBody .dsec.closed .dsh{margin-bottom:-6px}
#dBody .dsec.closed .dsh::after{transform:rotate(-45deg)}
#dBody .dsec.closed>:not(.dsh){display:none!important}
#drawer.full .dsecs{columns:auto!important;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 18px;align-items:start}
#drawer.full .dsec{display:block}
.dacc{display:flex;gap:6px;margin-top:6px}.dacc button{flex:1;font-size:12px!important;padding:7px 8px!important;justify-content:center}
@media (max-width:1100px){#drawer.full .dsecs{grid-template-columns:1fr}}`;
  document.head.appendChild(css);

  let open = new Set(['cli']), lastKey = null;
  const setOpen = (id, on) => { on ? open.add(id) : open.delete(id); const sec = $('#ds-' + id); if (sec) sec.classList.toggle('closed', !on); };
  function apply() {
    if (!edit || !$('#dBody .dsecs')) return;
    const key = isNew ? 'new' : edit.id;
    if (key !== lastKey) { lastKey = key; open = new Set(['cli']); }
    $$('#dBody .dsec').forEach((sec) => {
      const id = sec.id.slice(3);
      sec.classList.toggle('closed', !open.has(id));
      const h = $('.dsh', sec);
      if (h && !h.dataset.acc) { h.dataset.acc = '1'; h.addEventListener('click', (e) => { if (e.target.closest('button,input,select,textarea,a,label')) return; setOpen(id, !open.has(id)); }); }
    });
    // il menu a sinistra apre la sezione prima di portarci lì
    $$('#dBody .dnav [data-ds]').forEach((b) => { if (b.dataset.acc) return; b.dataset.acc = '1'; b.addEventListener('click', () => setOpen(b.dataset.ds, true), true); });
    const nav = $('#dBody .dnav');
    if (nav && !$('.dacc', nav)) {
      nav.insertAdjacentHTML('beforeend', '<div class="dacc"><button class="btn sm" data-acc="1">Apri tutte</button><button class="btn sm" data-acc="0">Chiudi tutte</button></div>');
      $$('[data-acc]', nav).forEach((b) => (b.onclick = () => $$('#dBody .dsec').forEach((sec) => setOpen(sec.id.slice(3), b.dataset.acc === '1'))));
    }
  }
  const rdw = renderDrawer;
  window.renderDrawer = renderDrawer = function () { rdw(); apply(); };
})();
