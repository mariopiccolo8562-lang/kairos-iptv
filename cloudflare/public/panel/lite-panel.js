/* KAIROS Control 2.6 — KAIROS TV e Kairos Lite separate: filtro nei Clienti, scheda cliente senza le funzioni
   che Lite non ha, impostazioni di Kairos Lite in «App e aggiornamenti», codice Downloader di Lite in alto. */
(() => {
  const css = document.createElement('style');
  css.textContent = `
.app-chip{display:inline-block;font-size:11px;font-weight:700;letter-spacing:.04em;padding:2px 7px;border-radius:5px;margin-left:8px;vertical-align:2px;background:rgba(224,164,49,.16);color:#ecc06f}
.app-chip.tv{background:rgba(61,124,245,.15);color:#8fb3ff}
.lite-note{padding:12px 14px;border-radius:10px;border:1px solid rgba(224,164,49,.45);background:rgba(224,164,49,.08);font-size:13.5px;margin-bottom:14px}
#dvApp{flex:0 0 auto}`;
  document.head.appendChild(css);

  const LITE_PERMS = new Set(['link', 'plSwitch', 'profiles', 'vpn']); // le sole funzioni che Kairos Lite usa
  const appOf = (d) => { if (!d) return ''; if (d.parent && !d.app) { const p = D.devices.find((x) => x.id === d.parent); return p ? p.app || '' : ''; } return d.app || ''; };
  const isLite = (d) => appOf(d) === 'lite';
  let flt = 'all';
  try { flt = localStorage.getItem('kc_app') || 'all'; } catch {}

  /* ---------- Clienti: filtro per app ---------- */
  function filterBar() {
    const bar = $('#v-devices .dv-bar'); if (!bar) return;
    let seg = $('#dvApp');
    if (!seg) { seg = document.createElement('div'); seg.className = 'seg'; seg.id = 'dvApp'; bar.insertBefore(seg, $('#dvView')); }
    const prim = D.devices.filter((d) => !d.parent), n = (k) => prim.filter((d) => (k === 'all' ? true : k === 'lite' ? isLite(d) : !isLite(d))).length;
    seg.innerHTML = [['all', 'Tutte le app'], ['tv', 'KAIROS TV'], ['lite', 'Kairos Lite']].map(([k, l]) => `<button data-app="${k}" class="${flt === k ? 'on' : ''}" title="${k === 'tv' ? 'Comprende i dispositivi non ancora collegati' : ''}">${l} <span style="opacity:.6">${n(k)}</span></button>`).join('');
    $$('[data-app]', seg).forEach((b) => (b.onclick = () => { flt = b.dataset.app; try { localStorage.setItem('kc_app', flt); } catch {} renderDevices(); }));
  }
  const rd = renderDevices;
  window.renderDevices = renderDevices = function () {
    const all = D.devices;
    if (flt !== 'all') {
      const keep = new Set(all.filter((d) => !d.parent && (flt === 'lite' ? isLite(d) : !isLite(d))).map((d) => d.id));
      D.devices = all.filter((d) => keep.has(d.id) || (d.parent && keep.has(d.parent)));
    }
    try { rd(); } finally { D.devices = all; }
    filterBar();
    // etichetta «Lite» su schede e tabella
    $$('#dvCards .dv-card[data-id]').forEach((c) => { const d = all.find((x) => x.id === c.dataset.id); const b = $('.dv-n b', c); if (b && isLite(d) && !$('.app-chip', b)) b.insertAdjacentHTML('beforeend', '<span class="app-chip">LITE</span>'); });
    $$('#dvTbl tbody tr[data-id]').forEach((r) => { const d = all.find((x) => x.id === r.dataset.id); const b = $('.dvt-u b', r); if (b && isLite(d) && !$('.app-chip', b)) b.insertAdjacentHTML('beforeend', '<span class="app-chip">LITE</span>'); });
  };

  /* ---------- scheda cliente: solo le funzioni che Kairos Lite ha ---------- */
  const rdw = renderDrawer;
  window.renderDrawer = renderDrawer = function () {
    rdw();
    if (!edit || !isLite(edit)) return;
    for (const id of ['ply', 'add']) { const sec = $('#ds-' + id); if (sec) sec.remove(); const nb = $(`#dBody [data-ds="${id}"]`); if (nb) nb.remove(); }
    $$('#dBody .dnav [data-ds] i').forEach((i, k) => (i.textContent = k + 1));
    $$('#dBody .dsec .dsh i').forEach((i, k) => (i.textContent = k + 1));
    $$('#ds-perm [data-perm]').forEach((t) => { if (!LITE_PERMS.has(t.dataset.perm)) t.style.display = 'none'; });
    for (const sel of ['#eAiProv', '#eAiLim']) { const el = $(sel); if (!el) continue; const box = sel === '#eAiLim' ? el.parentElement : el; box.style.display = 'none'; const lb = box.previousElementSibling; if (lb && lb.classList.contains('lbl')) lb.style.display = 'none'; }
    const main = $('#dBody .dmain');
    if (main && !$('.lite-note', main)) main.insertAdjacentHTML('afterbegin', '<div class="lite-note"><b>Questo cliente usa Kairos Lite.</b> Qui vedi solo quello che Lite usa: niente lettore a scelta, add-on, assistente IA, registrazioni, speed test e multi-schermo.</div>');
  };

  /* ---------- Impostazioni → App e aggiornamenti: Kairos Lite ---------- */
  const pane = $('[data-pane="upd"]');
  if (pane && !$('#liteCard')) {
    pane.insertAdjacentHTML('beforeend', `<div class="card glass" id="liteCard" style="margin-top:18px"><div class="hd"><h3>Kairos Lite<small>L'app leggera stile Smarters per dispositivi vecchi: stesso pannello e stessi clienti, aggiornamenti dal suo repository</small></h3></div>
      <div id="liteAuto" class="st-note"></div>
      <div class="st-row"><div class="st-l"><b>Link per scaricare l'APK di Lite</b><small>Vuoto = l'ultima release del repository kairos-lite</small></div><div class="st-c"><input class="inp mono" id="sLiteApk" placeholder="https://github.com/…/kairos-lite.apk"></div></div>
      <div class="st-row"><div class="st-l"><b>Codice Downloader di Kairos Lite</b><small>Compare in alto nel pannello accanto agli altri (anche agli agenti)</small></div><div class="st-c"><input class="inp mono" id="sLiteDl" maxlength="20" placeholder="es. 7654321"></div></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px"><button class="btn pri" id="liteSave">Salva Kairos Lite</button><button class="btn" id="liteCopy">Copia link APK</button></div></div>`);
    $('#liteSave').onclick = async () => { try { await api('PUT', '/admin/settings', { liteApkUrl: $('#sLiteApk').value.trim(), liteDownloaderCode: $('#sLiteDl').value.trim() }); delete $('#sLiteApk').dataset.ldirty; delete $('#sLiteDl').dataset.ldirty; await load(); toast('Kairos Lite salvata'); } catch (e) { toast(e.message, 1); } };
    $('#liteCopy').onclick = () => { const l = (D.lite && D.lite.apk) || ''; navigator.clipboard.writeText(l).then(() => toast('Link copiato'), () => toast('Copia non consentita', 1)); };
    for (const id of ['#sLiteApk', '#sLiteDl']) $(id).addEventListener('input', (e) => (e.target.dataset.ldirty = '1'));
    // ha il suo pulsante: non conta tra le «modifiche non salvate» delle altre impostazioni
    for (const ev of ['input', 'change']) $('#liteCard').addEventListener(ev, (e) => e.stopPropagation());
  }
  function renderLite() {
    const s = D.settings || {}, L = D.lite || {}, f = L.feed;
    const nLite = D.devices.filter((d) => !d.parent && isLite(d)).length;
    if ($('#liteAuto')) $('#liteAuto').innerHTML = (f && f.version ? `✅ <b>Versione pubblicata: ${esc(f.version)}</b>${f.date ? ' · ' + esc(String(f.date).slice(0, 10)) : ''} — le app Lite installate la propongono da sole` : '⚠️ Nessuna release di Kairos Lite trovata (o GitHub non risponde adesso)') + ` · Clienti che usano Lite: <b>${nLite}</b>`;
    if ($('#sLiteApk') && !$('#sLiteApk').dataset.ldirty && document.activeElement !== $('#sLiteApk')) $('#sLiteApk').value = s.liteApkUrl || '';
    if ($('#sLiteDl') && !$('#sLiteDl').dataset.ldirty && document.activeElement !== $('#sLiteDl')) $('#sLiteDl').value = s.liteDownloaderCode || '';
    // codice Downloader di Lite in alto
    const bar = $('#dlBar');
    if (bar && !$('#dlLite') && s.liteDownloaderCode) {
      bar.insertAdjacentHTML('beforeend', `<div class="dl" id="dlLite"><i>LT</i><div><small>Downloader · Kairos Lite</small><b>${esc(s.liteDownloaderCode)}</b></div><button class="btn sm" data-dlc="${esc(s.liteDownloaderCode)}">Copia</button></div>`);
      $('#dlLite [data-dlc]').onclick = (e) => navigator.clipboard.writeText(e.target.dataset.dlc).then(() => toast('Codice copiato'), () => toast('Copia non consentita', 1));
    }
  }
  const ra = renderAll;
  window.renderAll = renderAll = function () { ra(); renderLite(); };
  // lo stato porta anche le informazioni di Lite
  const api0 = api;
  window.api = api = async function (m, p, b) { const r = await api0(m, p, b); if (p === '/admin/state' && m === 'GET' && r) D.lite = r.lite || null; return r; };
  if (typeof DEMO !== 'undefined') {
    DEMO.settings.liteDownloaderCode = DEMO.settings.liteDownloaderCode || '5551234';
    DEMO.devices.forEach((d, i) => { if (!d.parent && d.playlists && d.playlists.length) d.app = i % 4 === 2 ? 'lite' : 'tv'; });
    const dm = demoApi;
    window.demoApi = demoApi = async function (m, p, b) { const r = await dm(m, p, b); if (p === '/admin/state' && r && !r.lite) r.lite = { apk: DEMO.settings.liteApkUrl || 'https://github.com/mariopiccolo8562-lang/kairos-lite/releases/latest/download/kairos-lite.apk', feed: { version: '1.0.0', date: '2026-11-03' } }; return r; };
  }
})();
