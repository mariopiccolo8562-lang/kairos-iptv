/* KAIROS Control 2.12 — versione per telefono e tablet (Android e iOS) e app installabile.
   Barra in alto compatta, menu a scomparsa con sfondo, barra in basso sul telefono, griglie a una colonna,
   tabelle scorrevoli, finestre a tutto schermo; manifest + service worker (quello delle notifiche) per «Aggiungi a schermata Home». */
(() => {
  const css = document.createElement('style');
  css.textContent = `
html{-webkit-text-size-adjust:100%}
body{overscroll-behavior-y:none}
#kcScrim{position:fixed;inset:0;z-index:44;background:rgba(3,4,10,.55);backdrop-filter:blur(3px);display:none}
#kcScrim.on{display:block}
#kcTab{display:none}
@media (max-width:900px){
  #app.on{grid-template-columns:1fr!important}
  aside{position:fixed!important;inset:0 auto 0 0;width:min(300px,86vw)!important;z-index:45!important;transform:translateX(-102%);transition:transform .28s ease;overflow-y:auto;-webkit-overflow-scrolling:touch;padding-top:calc(18px + env(safe-area-inset-top))!important;padding-bottom:calc(24px + env(safe-area-inset-bottom))!important;background:#0e1015!important}
  aside.open{transform:none;box-shadow:20px 0 60px rgba(0,0,0,.6)}
  .menu-b{display:inline-grid!important}
  main{min-width:0;padding:0 14px calc(28px + env(safe-area-inset-bottom))!important}
  .topbar{position:sticky;top:0;z-index:20;flex-wrap:wrap;gap:8px;margin:0 -14px 14px;padding:calc(10px + env(safe-area-inset-top)) 14px 10px;background:rgba(11,12,16,.9);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-bottom:1px solid var(--line)}
  .topbar .sp{display:none}
  #vTitle{order:1;flex:1;min-width:0;font-size:19px!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .menu-b{order:0}
  #mtBtn{order:2;padding:8px 10px!important;font-size:13px!important}
  #bellB{order:3}
  #newDev{order:4;padding:9px 12px!important}
  #av{order:5}
  .topbar .search{order:10;flex:1 1 100%!important;min-width:0!important;margin:0}
  #agLedgerBox{margin:0 8px 18px!important}
  #dlBar{flex-wrap:nowrap!important;overflow-x:auto;-webkit-overflow-scrolling:touch;scroll-snap-type:x mandatory;margin:0 -14px 14px!important;padding:0 14px 4px;scrollbar-width:none}
  #dlBar::-webkit-scrollbar{display:none}
  #dlBar .dl{flex:0 0 auto;scroll-snap-align:start}
  .mtbar{margin:0 0 14px!important}
  .qa-g{grid-template-columns:1fr!important}
  .g2,.g2b,.st-g,.ai-g,.mt-g,.ag-g{grid-template-columns:1fr!important}
  .st-save{left:0!important;right:0!important;bottom:0!important;border-radius:0!important;padding-bottom:calc(12px + env(safe-area-inset-bottom))!important}
  .card{border-radius:14px}
  .tbl-wrap,.dvt-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch}
  table.tbl{min-width:560px}
  table.tbl.ledger-history{min-width:0!important;table-layout:fixed}
  table.tbl.ledger-history th,table.tbl.ledger-history td{padding-left:6px;padding-right:6px;overflow-wrap:anywhere}
  table.tbl.ledger-history td:last-child{padding-left:2px;padding-right:2px;white-space:normal}
  table.tbl.ledger-history td:last-child .btn{min-width:0;width:18px;height:22px;padding:0;justify-content:center}
  table.tbl.ledger-history,table.tbl.ledger-history tbody{display:block;width:100%}
  table.tbl.ledger-history tbody tr{display:grid;grid-template-columns:1fr 1fr;gap:4px 10px;margin-bottom:8px;padding:8px;border:1px solid var(--line);border-radius:10px}
  table.tbl.ledger-history tbody td,table.tbl.ledger-history tbody td:first-child,table.tbl.ledger-history tbody td:last-child{display:flex;flex-direction:column;min-width:0;padding:4px!important;border:0!important;border-radius:0!important;text-align:left;white-space:normal}
  table.tbl.ledger-history tbody td:before{content:attr(data-label);margin-bottom:2px;color:var(--mut);font-size:10px;letter-spacing:.08em;text-transform:uppercase}
  table.tbl.ledger-history tbody td:last-child{grid-column:1/-1;flex-direction:row;gap:6px}
  #modal{padding:12px;align-items:end}
  #modal .glass{width:100%!important;max-height:88vh;overflow-y:auto;padding:22px 18px calc(18px + env(safe-area-inset-bottom))!important;border-radius:18px 18px 12px 12px}
  #modal .glass>div:last-child{position:sticky;bottom:-18px;background:inherit;padding-top:10px}
  #modal .glass .btn{flex:1;justify-content:center}
  #toasts{left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));align-items:stretch}
  #drawer.full,#agPage,#mtPage{left:0!important}
  #drawer .df{flex-wrap:wrap;gap:8px;padding-bottom:calc(12px + env(safe-area-inset-bottom))!important}
  #drawer .df .btn{flex:1 1 auto;justify-content:center}
  #drawer .dh,#agPage .ah,#mtPage .ah{padding-top:calc(14px + env(safe-area-inset-top))!important}
  #agPage .af,#mtPage .af{flex-wrap:wrap;padding-bottom:calc(12px + env(safe-area-inset-bottom))!important}
  .op-f,.op-f.mx{grid-template-columns:1fr 1fr!important}
  .op-f .btn{justify-content:center}
  .op-dr{grid-template-columns:1fr auto auto!important}
  .op-dr .inp{grid-column:1/-1}
  .dlc-e{grid-template-columns:1fr!important}.dlc-e textarea{grid-column:auto!important}
  .dlc-grid{grid-template-columns:1fr!important}
  #bellM{left:12px!important;right:12px!important;width:auto!important}
  .dv-bar{gap:8px}
  .dv-bar .dv-q{flex:1 1 100%}
  .kc-add,.kc-tools{flex-wrap:wrap}
  .kc-add .inp,.kc-tools .inp{flex:1 1 100%}
  .ai-k{grid-template-columns:1fr 1fr!important}
  input,select,textarea{font-size:16px!important} /* iOS: niente zoom automatico quando si scrive */
}
@media (max-width:700px){
  #kcTab{display:grid;position:fixed;left:0;right:0;bottom:0;z-index:30;grid-template-columns:repeat(5,1fr);padding:6px 6px calc(6px + env(safe-area-inset-bottom));background:rgba(11,12,16,.94);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-top:1px solid var(--line)}
  #kcTab button{all:unset;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:3px;padding:6px 2px;border-radius:10px;font-size:10.5px;color:var(--mut);position:relative;-webkit-tap-highlight-color:transparent}
  #kcTab button svg{width:22px;height:22px}
  #kcTab button.on{color:#fff}
  #kcTab button.plus span.p{width:44px;height:44px;margin-top:-18px;border-radius:50%;display:grid;place-items:center;background:linear-gradient(135deg,var(--a1),var(--a2));color:#fff;box-shadow:0 8px 22px rgba(61,124,245,.45)}
  #kcTab .n{position:absolute;top:2px;left:calc(50% + 6px);min-width:16px;height:16px;padding:0 4px;border-radius:8px;background:var(--bad);color:#fff;font-size:10px;font-weight:800;display:none;place-items:center}
  #kcTab .n.on{display:grid}
  main{padding-bottom:calc(92px + env(safe-area-inset-bottom))!important}
  aside{padding-bottom:calc(96px + env(safe-area-inset-bottom))!important}
  body:has(#drawer.on) #kcTab,body:has(#agPage.on) #kcTab,body:has(#mtPage.on) #kcTab,body:has(#modal.on) #kcTab{display:none}
  #v-agents table,.ag-tbl{display:block;overflow-x:auto;-webkit-overflow-scrolling:touch}
  #toasts{bottom:calc(84px + env(safe-area-inset-bottom))}
  .st-save{bottom:calc(76px + env(safe-area-inset-bottom))!important}
  body:not(:has(#app.on)) #kcTab{display:none}
  #newDev,#bellB{display:none!important}
  #mtBtn{padding:8px 10px!important}#mtBtn .mtx{display:none}
  #kpis{grid-template-columns:1fr 1fr!important}
  .st-row{display:flex!important;flex-direction:column;align-items:stretch!important;gap:8px;grid-template-columns:1fr!important}
  .st-row>.st-l,.st-row>.st-c{width:100%!important;max-width:none!important}
  .qa-acts{grid-template-columns:1fr 1fr!important}
  .qa-sw{grid-template-columns:1fr!important}
  .dv-tiles{grid-template-columns:none!important;grid-auto-flow:column;grid-auto-columns:minmax(132px,1fr);overflow-x:auto;scrollbar-width:none;margin:0 -14px 14px!important;padding:0 14px}
  .dv-tiles::-webkit-scrollbar{display:none}
  .dv-grid{grid-template-columns:1fr!important}
  #dlBar .dl{max-width:82vw}
  .op-f,.op-f.mx{grid-template-columns:1fr!important}
  .ai-k{grid-template-columns:1fr!important}
  .card .hd:has(> h3 > small){flex-wrap:wrap}
  .card .hd:has(> h3 > small)>h3{flex:1 1 100%;min-width:0}
  h2#vTitle{font-size:18px!important}
}
@media (min-width:701px) and (max-width:1100px){
  .qa-acts{grid-template-columns:repeat(3,1fr)}
  .dv-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
}
@media (pointer:coarse){
  .wf-v button,.ar-v button,.ll-v button,.mx-l button,.mx-row button[data-a="cua"]{box-sizing:border-box;min-width:32px!important;min-height:32px!important;padding:6px!important}
  .kt-ck{width:22px!important;height:22px!important}
  .kt-panel-log .fchip{min-height:32px!important}
}
@media (display-mode:standalone){.demo-tag{top:calc(8px + env(safe-area-inset-top))}}`;
  document.head.appendChild(css);

  /* ---------- menu a scomparsa con sfondo scuro ---------- */
  const side = $('#side');
  const scrim = document.createElement('div'); scrim.id = 'kcScrim'; side.parentElement.insertBefore(scrim, side); // stesso livello del menu: resta sotto il menu, sopra la pagina
  const syncScrim = () => scrim.classList.toggle('on', side.classList.contains('open') && innerWidth <= 900);
  new MutationObserver(syncScrim).observe(side, { attributes: true, attributeFilter: ['class'] });
  scrim.onclick = () => side.classList.remove('open');
  // tocco su una voce del menu: si chiude (anche per le voci che non passano da view())
  side.addEventListener('click', (e) => { if (e.target.closest('.nav') && innerWidth <= 900) setTimeout(() => side.classList.remove('open'), 0); });
  // scorrendo da sinistra verso destra dal bordo si apre il menu
  let sx = null;
  addEventListener('touchstart', (e) => { const t = e.touches[0]; sx = t.clientX < 22 && innerWidth <= 900 ? t.clientX : null; }, { passive: true });
  addEventListener('touchend', (e) => { if (sx === null) return; const t = e.changedTouches[0]; if (t.clientX - sx > 60) side.classList.add('open'); sx = null; }, { passive: true });

  /* ---------- barra in basso (telefono) ---------- */
  const IC = {
    dash: '<path d="M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z"/>',
    devices: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
    bell: '<path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4z"/><path d="M10 21a2 2 0 0 0 4 0"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    pan: '<rect x="3" y="3" width="18" height="6" rx="2"/><rect x="3" y="15" width="18" height="6" rx="2"/><path d="M7 6h.01M7 18h.01M12 9v6"/>',
    att: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><path d="M7 14v7M3.5 17.5h7M17.5 14v7M14 17.5h7"/>',
  };
  const ico = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9">${IC[k]}</svg>`;
  const tab = document.createElement('nav'); tab.id = 'kcTab';
  tab.innerHTML = `<button data-t="dash">${ico('dash')}Panoramica</button><button data-t="devices">${ico('devices')}Clienti</button>
    <button data-t="new" class="plus"><span class="p"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" width="22" height="22"><path d="M12 5v14M5 12h14"/></svg></span>Nuovo</button>
    <button data-t="hub:pan">${ico('pan')}Pannelli</button><button data-t="hub:att">${ico('att')}Attiva</button><button data-t="menu">${ico('menu')}<span class="n" id="tabN"></span>Menu</button>`;
  document.body.appendChild(tab);
  $$('[data-t]', tab).forEach((b) => (b.onclick = (e) => {
    const t = b.dataset.t;
    if (t === 'menu') return side.classList.toggle('open');
    side.classList.remove('open');
    if (t === 'new') return $('#newDev').click();
    if (t.startsWith('hub:')) return window.KXHub && KXHub(t.slice(4));
    // «Richieste»: l'elenco delle richieste in attesa per tipo (il clic non deve arrivare al «clic fuori» che lo chiude)
    if (t === 'bell') e.stopPropagation();
    if (t === 'bell') { const bb = $('#bellB'); if (bb) { bb.style.display = 'inline-grid'; bb.click(); bb.style.display = ''; const m = $('#bellM'); if (m) { m.style.top = 'auto'; m.style.bottom = `calc(78px + env(safe-area-inset-bottom))`; } } return; }
    const n = $(`.nav[data-v="${t}"]`); if (n) n.click();
  }));
  function syncTab() {
    const ag = D.role === 'agent', on = (document.querySelector('.view.on') || {}).id || '';
    $('[data-t="dash"]', tab).style.display = ag && $('.nav[data-v="dash"]') && $('.nav[data-v="dash"]').style.display === 'none' ? 'none' : '';
    $('[data-t="new"]', tab).style.display = $('#newDev').style.display === 'none' ? 'none' : '';
    { const t = $('[data-t="new"]', tab).lastChild; if (t && t.nodeType === 3) t.textContent = ag ? 'Attiva' : 'Nuovo'; }
    tab.style.gridTemplateColumns = `repeat(${$$('[data-t]', tab).filter((b) => b.style.display !== 'none').length},1fr)`;
    { const p = $('[data-t="hub:pan"]', tab); if (p) p.style.display = window.KXHub && KXHub.has('pan') ? '' : 'none'; }
    { const a = $('[data-t="hub:att"]', tab); if (a) a.style.display = window.KXHub && KXHub.has('att') ? '' : 'none'; }
    tab.style.gridTemplateColumns = `repeat(${$$('[data-t]', tab).filter((b) => b.style.display !== 'none').length},1fr)`;
    $$('[data-t]', tab).forEach((b) => b.classList.toggle('on', b.dataset.t.startsWith('hub:') ? !!window.KXHub && KXHub.cur() === b.dataset.t.slice(4) : on === 'v-' + b.dataset.t));
    const bn = $('#bellN'), tn = $('#tabN'); if (bn && tn) { tn.textContent = bn.textContent; tn.classList.toggle('on', bn.classList.contains('on')); }
    if (!$('#bellM') || !$('#bellM').classList.contains('on')) { const m = $('#bellM'); if (m) m.style.bottom = ''; }
  }
  setInterval(syncTab, 1500);
  const ra = renderAll;
  window.renderAll = renderAll = function () { ra(); syncTab(); syncScrim(); };
  const v0 = view;
  window.view = view = function (v) { const r = v0(v); setTimeout(syncTab, 0); if (innerWidth <= 900) scrollTo({ top: 0 }); return r; };

  /* ---------- app installabile (Android, iOS, computer) ---------- */
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('/panel/sw.js', { scope: '/panel/' }).catch(() => {});
  let deferred = null;
  const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; addInstall(); });
  function addInstall() {
    if (standalone() || $('#qaInstall') || !$('#qaA')) return;
    if (!deferred && !isIOS()) return;
    $('#qaA').insertAdjacentHTML('beforeend', '<button class="qa-a" id="qaInstall"><i>📲</i><b>Installa l\'app</b><small>Il pannello sulla schermata Home, a tutto schermo</small></button>');
    $('#qaInstall').onclick = async () => {
      if (deferred) { deferred.prompt(); const r = await deferred.userChoice.catch(() => null); if (r && r.outcome === 'accepted') { $('#qaInstall').remove(); toast('App installata'); } deferred = null; return; }
      ask('Installa su iPhone o iPad', 'In <b>Safari</b> tocca <b>Condividi</b> (il quadrato con la freccia in su), poi <b>Aggiungi alla schermata Home</b> e <b>Aggiungi</b>.<br><br>Il pannello si aprirà a tutto schermo come un\'app.', 'Ho capito');
    };
  }
  setTimeout(addInstall, 3000);
  addEventListener('appinstalled', () => { const b = $('#qaInstall'); if (b) b.remove(); });
})();
