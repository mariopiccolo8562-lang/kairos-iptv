/* KAIROS Control — lingua dei trailer (12 novembre 2026).
   Impostazioni → Funzioni dell'app: «🎬 Trailer» con la scelta Italiano / Inglese. Solo il titolare; si salva da sola.
   Vale per i trailer che cerca il pannello (/api/player/trailer): oggi Kairos Pro. In inglese il pannello prova prima
   l'anteprima di Apple (un file che parte nel lettore dell'app), poi TMDB (se c'è la chiave) e YouTube in inglese.
   Usa app.js (api, toast, D, renderAll). */
(() => {
  const owner = () => typeof D === 'object' && D && D.role !== 'agent' && !window.__assist;
  const cur = () => ((D.settings || {}).trailerLang === 'en' ? 'en' : 'it');
  const pane = document.querySelector('[data-pane="app"]');
  if (!pane || document.getElementById('trlCard')) return;
  pane.insertAdjacentHTML('afterbegin', `<div class="card glass" id="trlCard" style="margin-bottom:18px"><div class="hd"><h3>🎬 Trailer<small>In che lingua il pannello cerca i trailer per le app (oggi Kairos Pro). Si salva da solo.</small></h3></div>
    <div class="st-row"><div class="st-l"><b>Lingua dei trailer</b><small id="trlSub"></small></div><div class="st-c"><select class="inp" id="trlSel" aria-label="Lingua dei trailer"><option value="it">Italiano</option><option value="en">Inglese</option></select></div></div></div>`);
  const card = document.getElementById('trlCard'), sel = document.getElementById('trlSel');
  for (const ev of ['input', 'change']) card.addEventListener(ev, (e) => e.stopPropagation()); // si salva da solo: non conta tra le «modifiche non salvate»
  const SUB = {
    it: 'Trailer in italiano quando c\'è, altrimenti quello originale. Si apre con YouTube.',
    en: 'Trailer in inglese, da YouTube. Per i pochi film di cui Apple ha l\'anteprima, parte nel lettore dell\'app senza YouTube.',
  };
  function sync() {
    card.style.display = owner() ? '' : 'none';
    const v = cur();
    if (document.activeElement !== sel && sel.value !== v) sel.value = v;
    const sub = document.getElementById('trlSub'); if (sub.textContent !== SUB[v]) sub.textContent = SUB[v];
  }
  sel.onchange = async () => {
    const v = sel.value === 'en' ? 'en' : 'it';
    try {
      if (D.demo) D.settings.trailerLang = v;
      else { const r = await api('PUT', '/admin/settings', { trailerLang: v }); if (r && r.settings) D.settings = r.settings; else D.settings.trailerLang = v; }
      toast(v === 'en' ? 'Trailer: da ora si cercano in inglese' : 'Trailer: da ora si cercano in italiano');
    } catch (e) { toast(e.message || 'Errore', 1); }
    sel.blur(); sync();
  };
  const ra = renderAll;
  window.renderAll = renderAll = function () { ra(); sync(); };
  sync();
})();
