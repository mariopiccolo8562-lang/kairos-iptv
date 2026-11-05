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
  let ready = false, tries = 0, last = '', fromPop = false, ovPushed = false, ignorePop = false;
  const overlay = () => document.querySelector('#drawer.on, #agPage.on');
  // apre una voce o la scheda di un gruppo (controlla anche il permesso)
  const open = (v) => { const nav = document.querySelector(`.nav[data-v="${v}"]`); try { if (window.KXGoTab && window.KXGoTab(v)) return true; if (nav && nav.style.display !== 'none' && !nav.dataset.hub) { nav.click(); return true; } } catch {} return false; };
  /* freccia «indietro» del browser: ogni pagina aperta nel pannello è un passo della cronologia
     (stesso indirizzo, cambia solo lo stato), così si torna alla pagina di prima invece di uscire */
  setInterval(() => {
    if (!ready || !app.classList.contains('on')) return;
    const v = here(); if (!v) return;
    if (v !== get()) put(v);
    // scheda di un cliente aperta: un passo in più, così «indietro» la chiude e basta
    const ov = !!overlay();
    if (ov && !ovPushed && last) { try { history.pushState({ kp: last, ov: 1 }, ''); } catch {} ovPushed = true; }
    if (!ov && ovPushed) { ovPushed = false; if (history.state && history.state.ov) { ignorePop = true; try { history.back(); } catch { ignorePop = false; } } }
    if (v === last) return;
    try { if (fromPop || !last) history.replaceState({ kp: v }, ''); else history.pushState({ kp: v }, ''); } catch {}
    last = v; fromPop = false;
  }, 250);
  addEventListener('popstate', (e) => {
    if (ignorePop) { ignorePop = false; return; }
    const v = e.state && e.state.kp;
    if (!v || !app.classList.contains('on')) return;
    const md = document.querySelector('#modal.on'); if (md) { const n = document.getElementById('mNo'); if (n) n.click(); }
    // con la scheda di un cliente aperta, «indietro» la chiude soltanto
    if (ovPushed || overlay()) {
      const dr = document.querySelector('#drawer.on'), ag = document.querySelector('#agPage.on');
      if (dr) { const c = document.getElementById('dClose'); if (c) c.click(); }
      if (ag) { const c = document.getElementById('agX'); if (c) c.click(); }
      ovPushed = false;
      if (v === here()) return;
    }
    fromPop = true; last = v;
    if (v !== here()) open(v);
  });
  function restore() {
    const v = get();
    if (!v || v === 'dash') { ready = true; return; }
    const done = open(v);
    // il menu può non essere ancora pronto (permessi dell'agente, gruppi): si riprova per qualche secondo
    if (!done && ++tries < 15) return setTimeout(restore, 200);
    setTimeout(() => (ready = true), 400);
  }
  let started = false;
  const go = () => { if (app.classList.contains('on') && !started) { started = true; setTimeout(restore, 120); } if (!app.classList.contains('on')) { started = false; ready = false; tries = 0; last = ''; } };
  new MutationObserver(go).observe(app, { attributes: true, attributeFilter: ['class'] });
  go();
})();
