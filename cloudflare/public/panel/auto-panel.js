/* KAIROS Control — «📵 Canali non funzionanti» (Kairos Pro intelligente, solo titolare).
   Il pannello mette insieme gli errori di riproduzione già mandati dalle app: lo stesso canale (stesso server della
   lista e stesso numero del flusso) che non parte per almeno 2 clienti da almeno 10 minuti, senza nessuna visione
   riuscita dopo, è «non funzionante». Nelle app finisce in fondo alla lista con «non disponibile» e torna da solo
   appena qualcuno lo vede di nuovo (o dopo 12 ore senza errori nuovi). La scheda sta in cima a «Errori delle app». */
(() => {
  const css = document.createElement('style');
  css.textContent = `.dc-card{border:1px solid rgba(239,68,68,.4)!important;background:linear-gradient(135deg,rgba(239,68,68,.10),transparent 65%)!important;margin-bottom:16px}
.dc-card.ok{border-color:rgba(34,197,94,.4)!important;background:linear-gradient(135deg,rgba(34,197,94,.10),transparent 65%)!important}
.dc-it{display:flex;gap:12px;align-items:center;padding:10px 12px;border-radius:12px;border:1px solid var(--line);background:rgba(0,0,0,.18);margin-bottom:8px}
.dc-it .tx{flex:1;min-width:0}.dc-it b{display:block}.dc-it small{display:block;color:var(--mut);font-size:12.5px}
.dc-note{font-size:12.5px;color:var(--mut);line-height:1.5;margin:4px 0 12px}`;
  document.head.appendChild(css);
  const owner = () => typeof D !== 'undefined' && D.role !== 'agent' && !window.__assist && !D.demo;
  const when = (t) => (t ? new Date(t).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' }) : '—');
  const ago = (t) => { const m = Math.max(1, Math.round((Date.now() - t) / 60e3)); return m < 60 ? m + ' min fa' : m < 1440 ? Math.round(m / 60) + ' h fa' : Math.round(m / 1440) + ' g fa'; };
  let R = null, rT = 0, busy = false;
  function html() {
    if (!R) return '';
    const L = R.list || [];
    const rows = L.map((x) => `<div class="dc-it"><span>📵</span><div class="tx"><b>${esc(x.name || 'Canale ' + x.sid)}</b><small>Server ${esc(x.dns || x.host)}${x.dns ? ' <span class="mono">(' + esc(x.host) + ')</span>' : ''} · flusso ${esc(x.sid)}</small><small>${x.devs} clienti · ${x.fails} errori · primo ${esc(when(x.first))} · ultimo ${esc(ago(x.last))}</small></div><button class="btn sm" data-dcok="${esc(x.ck)}" title="Torna subito al suo posto nelle app">✓ Funziona</button></div>`).join('');
    return `<div class="card glass dc-card ${L.length ? '' : 'ok'}" data-dccard><div class="hd"><h3>📵 Canali non funzionanti<small>Canali che non partono per nessuno, trovati dagli errori delle app</small></h3><div style="display:flex;gap:8px;align-items:center">${L.length ? `<b style="color:#ef4444">${L.length}</b>` : '<b style="color:#22c55e">Nessuno ✓</b>'}<button class="btn sm" data-dcref>Ricalcola</button></div></div>
      <div class="dc-note">Un canale finisce qui quando non parte per almeno ${R.rules ? R.rules.devices : 2} clienti diversi da almeno ${R.rules ? R.rules.minutes : 10} minuti e nessuno è riuscito a vederlo dopo. Non contano gli errori del decoder (sono del dispositivo) né i clienti con la linea scaduta o piena. Nelle app il canale va in fondo alla lista con «non disponibile» e <b>torna da solo</b> appena qualcuno lo vede di nuovo, oppure dopo ${R.rules ? R.rules.hours : 12} ore senza errori nuovi.${R.candidates ? ` In osservazione: ${R.candidates} ${R.candidates === 1 ? 'canale' : 'canali'} con errori recenti.` : ''}</div>
      ${rows || '<p class="mut" style="margin:0;font-size:13px">Tutti i canali visti di recente funzionano.</p>'}</div>`;
  }
  async function load(force) {
    if (!owner() || busy) return;
    if (!force && R && Date.now() - rT < 60e3) return draw();
    busy = true;
    try { R = await api('GET', '/admin/dead-channels' + (force ? '?fresh=1' : '')); rT = Date.now(); } catch { R = null; } finally { busy = false; }
    draw();
  }
  function draw() {
    const V = $('#v-apperr'); if (!V || !owner()) return;
    let c = V.querySelector(':scope > [data-dcwrap]');
    const h = html();
    if (!h) { if (c) c.remove(); return; }
    if (!c) { c = document.createElement('div'); c.dataset.dcwrap = '1'; V.prepend(c); }
    if (c.dataset.h === h) return;
    c.dataset.h = h; c.innerHTML = h;
    const rf = c.querySelector('[data-dcref]'); if (rf) rf.onclick = () => load(true);
    c.querySelectorAll('[data-dcok]').forEach((b) => (b.onclick = async () => {
      if (!(await ask('Il canale funziona?', '<p class="mut" style="margin:0;font-size:13.5px">Torna subito al suo posto nelle app dei clienti. Se continua a non partire, con i prossimi errori tornerà qui da solo.</p>', 'Funziona'))) return;
      b.disabled = true;
      try { await api('DELETE', '/admin/dead-channels/' + encodeURIComponent(b.dataset.dcok)); toast('Canale di nuovo al suo posto nelle app'); await load(true); } catch (e) { toast(e.message, 1); b.disabled = false; }
    }));
  }
  // la pagina «Errori delle app» si ridisegna da sola: la scheda torna in cima
  const V = $('#v-apperr');
  if (V) new MutationObserver(() => { if (R && !V.querySelector(':scope > [data-dcwrap]')) draw(); }).observe(V, { childList: true });
  const ov = window.view;
  if (typeof ov === 'function') window.view = view = function (v) { ov(v); if (v === 'apperr') load(false); };
})();
