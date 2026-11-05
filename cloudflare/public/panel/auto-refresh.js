/* KAIROS Control — aggiornamento automatico del pannello: si accende/spegne e si sceglie ogni quanti secondi.
   Vale per titolare e agenti (ognuno sul suo browser). Aggiorna i dati senza ricaricare la pagina e
   si mette in pausa mentre scrivi o hai aperto una scheda/finestra, così non perdi niente. */
(() => {
  const LS = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };
  const OPTS = [10, 15, 30, 60, 120, 300];
  const A = (window.KXAuto = {
    on: () => LS.get('kc_auto', '1') !== '0',
    sec: () => { const n = parseInt(LS.get('kc_auto_s', '20'), 10); return n >= 5 && n <= 3600 ? n : 20; },
  });
  // pagine che si ridisegnano da sole (solo elenchi da guardare: niente moduli da compilare)
  const PAGES = ['live', 'apperr', 'reports', 'creq', 'areq', 'reqai', 'activity'];
  const fmt = (s) => (s < 60 ? s + ' s' : s % 60 ? Math.floor(s / 60) + ' min ' + (s % 60) + ' s' : s / 60 + ' min');
  const css = document.createElement('style');
  css.textContent = `
.ar-b{display:flex;align-items:center;gap:6px;height:38px;padding:0 12px;border-radius:12px;border:1px solid color-mix(in srgb,#22c55e 45%,transparent);background:color-mix(in srgb,#22c55e 14%,transparent);color:#eef1f8;font:inherit;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap}
.ar-b svg{width:16px;height:16px}.ar-b.spin svg{animation:arSpin .9s linear}
.ar-b.off{border-color:var(--line);background:rgba(255,255,255,.03);color:var(--mut)}
.ar-b .ar-c{font-variant-numeric:tabular-nums;opacity:.75;font-weight:600}
@keyframes arSpin{to{transform:rotate(360deg)}}
#arM{position:fixed;z-index:60;width:300px;padding:14px;border-radius:16px;border:1px solid var(--line);background:var(--pane,#16181d);box-shadow:0 18px 50px rgba(0,0,0,.5);display:none}
#arM.on{display:block}#arM h4{margin:0 0 4px;font-size:14px}#arM p{margin:0 0 12px;color:var(--mut);font-size:12px;line-height:1.45}
#arM .tog{margin:0 0 12px}
#arM .ar-o{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}
#arM .ar-o button{border:1px solid color-mix(in srgb,#22c55e 40%,transparent);background:color-mix(in srgb,#22c55e 10%,transparent);color:#eef1f8;border-radius:999px;padding:6px 12px;font:inherit;font-size:12.5px;font-weight:600;cursor:pointer}
#arM .ar-o button.on{background:#22c55e;color:#0b0d12;border-color:transparent}
#arM .ar-x{display:flex;gap:8px;align-items:center;font-size:12.5px;color:var(--mut)}#arM .ar-x .inp{width:90px;margin:0;padding:6px 10px}
#arM.dis .ar-o,#arM.dis .ar-x{opacity:.45;pointer-events:none}
@media (max-width:900px){.ar-b .ar-t{display:none}}`;
  document.head.appendChild(css);

  const icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>';
  const anchor = document.getElementById('bellB') || document.getElementById('newDev');
  if (!anchor) return;
  anchor.insertAdjacentHTML('beforebegin', '<button class="ar-b" id="arB" type="button"></button>');
  document.body.insertAdjacentHTML('beforeend', '<div id="arM"></div>');
  const B = document.getElementById('arB'), M = document.getElementById('arM');
  let left = A.sec();
  function btn() {
    const on = A.on();
    B.classList.toggle('off', !on);
    B.title = on ? `Aggiornamento automatico ogni ${fmt(A.sec())} (clicca per cambiare o spegnere)` : 'Aggiornamento automatico spento (clicca per accenderlo)';
    B.innerHTML = `${icon}<span class="ar-t">${on ? 'Auto' : 'Auto: OFF'}</span>${on ? `<span class="ar-c">${left}s</span>` : ''}`;
  }
  function menu() {
    const on = A.on(), s = A.sec();
    M.classList.toggle('dis', !on);
    M.innerHTML = `<h4>Aggiornamento automatico</h4><p>Aggiorna da solo i dati del pannello, senza ricaricare la pagina. Si mette in pausa mentre scrivi o hai una scheda aperta.</p>
      <div class="tog ${on ? 'on' : ''}" id="arOn" role="switch" tabindex="0"><div><b>${on ? 'Acceso' : 'Spento'}</b><small>${on ? 'Ogni ' + fmt(s) : 'Aggiorni tu con il pulsante'}</small></div><i></i></div>
      <div class="ar-o">${OPTS.map((x) => `<button type="button" data-ars="${x}" class="${x === s ? 'on' : ''}">${fmt(x)}</button>`).join('')}</div>
      <div class="ar-x">Altro: <input class="inp" id="arS" type="number" min="5" max="3600" value="${s}"> secondi</div>`;
    M.querySelector('#arOn').onclick = () => { LS.set('kc_auto', on ? '0' : '1'); left = A.sec(); menu(); btn(); };
    M.querySelectorAll('[data-ars]').forEach((b) => (b.onclick = () => setSec(+b.dataset.ars)));
    const i = M.querySelector('#arS');
    i.onchange = () => { const n = parseInt(i.value, 10); if (!(n >= 5 && n <= 3600)) { toast('Scegli da 5 a 3600 secondi', 1); i.value = A.sec(); return; } setSec(n); };
  }
  function setSec(n) { LS.set('kc_auto_s', String(n)); left = n; menu(); btn(); toast('Aggiornamento ogni ' + fmt(n)); }
  B.onclick = (e) => {
    e.stopPropagation();
    if (M.classList.contains('on')) return M.classList.remove('on');
    menu(); const r = B.getBoundingClientRect();
    M.style.top = r.bottom + 8 + 'px'; M.style.left = Math.max(10, Math.min(innerWidth - 310, r.right - 300)) + 'px';
    M.classList.add('on');
  };
  addEventListener('click', (e) => { if (!e.target.closest('#arM') && !e.target.closest('#arB')) M.classList.remove('on'); });

  // in pausa: mentre si scrive, con una finestra o la scheda di un cliente aperta, o con la pagina nascosta
  const busy = () => {
    const a = document.activeElement;
    if (a && a !== document.body && a.matches('input,textarea,select,[contenteditable="true"]')) return true;
    if (document.querySelector('#modal.on,#drawer.on,#agPage.on,.ag-page.on,#arM.on')) return true;
    return false;
  };
  let running = false, lastFull = 0;
  async function refresh() {
    if (running) return; running = true;
    B.classList.remove('spin'); void B.offsetWidth; B.classList.add('spin');
    try {
      const cur = document.querySelector('section.view.on');
      const v = cur && cur.id.slice(2);
      // più leggero: sulle pagine-elenco (Online ora, Errori, Richieste…) si ricaricano solo i dati della pagina;
      // lo stato completo del pannello (clienti, contatori) al massimo ogni 15 s lì, ogni volta sulle altre pagine.
      // Se i dati non sono cambiati il pannello non si ridisegna (load(true)).
      const list = PAGES.includes(v);
      if (!list || Date.now() - lastFull >= 15e3) { lastFull = Date.now(); await load(true); }
      if (list) view(v);
    } catch {} finally { running = false; }
  }
  setInterval(() => {
    const app = document.getElementById('app');
    if (!A.on() || !app || !app.classList.contains('on') || document.hidden) { btn(); return; }
    if (busy()) { btn(); return; }
    left -= 1;
    if (left <= 0) { left = A.sec(); refresh(); }
    btn();
  }, 1000);
  btn();
})();
