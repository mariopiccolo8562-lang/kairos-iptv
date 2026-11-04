/* KAIROS Control — aggiornando la pagina (F5) si resta dove si era: stessa pagina e stessa scheda.
   Vale per la scheda del browser (sessionStorage). Va caricato per ultimo. */
(() => {
  const K = 'kc_page';
  const get = () => { try { return sessionStorage.getItem(K); } catch { return null; } };
  const put = (v) => { try { sessionStorage.setItem(K, v); } catch {} };
  let ready = false;
  const v0 = view;
  window.view = view = function () {
    const r = v0.apply(this, arguments);
    if (ready) { const on = document.querySelector('section.view.on'); if (on && on.id.startsWith('v-')) put(on.id.slice(2)); }
    return r;
  };
  const restore = () => {
    if (ready) return;
    const v = get();
    const nav = v && document.querySelector(`.nav[data-v="${v}"]`);
    // solo pagine che esistono e che questo utente può aprire
    if (v && v !== 'dash' && document.getElementById('v-' + v) && nav && nav.style.display !== 'none') { try { view(v); } catch {} }
    ready = true;
  };
  const app = document.getElementById('app');
  if (!app) return;
  const go = () => { if (app.classList.contains('on')) setTimeout(restore, 80); };
  new MutationObserver(go).observe(app, { attributes: true, attributeFilter: ['class'] });
  go();
})();
