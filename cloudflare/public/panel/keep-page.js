/* KAIROS Control — aggiornando la pagina (F5) si resta dove si era: stessa voce del menu e stessa scheda
   (anche le schede dei gruppi: Impostazioni → Funzioni app, Richieste → Assistente IA, App → OrbixPlay/MaxPlayer…).
   Vale per la scheda del browser (sessionStorage). Va caricato per ultimo. */
(() => {
  const K = 'kc_page';
  const get = () => { try { return sessionStorage.getItem(K); } catch { return null; } };
  const put = (v) => { try { sessionStorage.setItem(K, v); } catch {} };
  const app = document.getElementById('app');
  if (!app) return;
  // dove sono adesso: la scheda accesa della barra del gruppo, altrimenti la voce accesa del menu
  const here = () => {
    const t = document.querySelector('#hubBar [data-hubt].on');
    if (t) return t.dataset.hubt;
    const n = document.querySelector('.nav.on[data-v]:not([data-hub])');
    if (n) return n.dataset.v;
    const s = document.querySelector('section.view.on');
    return s && s.id.startsWith('v-') ? s.id.slice(2) : '';
  };
  let ready = false, tries = 0;
  setInterval(() => { if (ready && app.classList.contains('on')) { const v = here(); if (v && v !== get()) put(v); } }, 300);
  function restore() {
    const v = get();
    if (!v || v === 'dash') { ready = true; return; }
    const nav = document.querySelector(`.nav[data-v="${v}"]`);
    let done = false;
    try {
      if (window.KXGoTab && window.KXGoTab(v)) done = true; // scheda di un gruppo (controlla anche il permesso)
      else if (nav && nav.style.display !== 'none' && !nav.dataset.hub) { nav.click(); done = true; }
    } catch {}
    // il menu può non essere ancora pronto (permessi dell'agente, gruppi): si riprova per qualche secondo
    if (!done && ++tries < 15) return setTimeout(restore, 200);
    setTimeout(() => (ready = true), 400);
  }
  let started = false;
  const go = () => { if (app.classList.contains('on') && !started) { started = true; setTimeout(restore, 120); } if (!app.classList.contains('on')) { started = false; ready = false; tries = 0; } };
  new MutationObserver(go).observe(app, { attributes: true, attributeFilter: ['class'] });
  go();
})();
