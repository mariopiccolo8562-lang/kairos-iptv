/* KAIROS Control 2.6 — Kairos Pro, Kairos TV e Kairos Lite separate (chiavi: 'tv' = Pro, 'ktv' = Kairos TV, 'lite'): filtro nei Clienti, scheda cliente senza le funzioni
   che Lite non ha, impostazioni di Kairos Lite in «App e aggiornamenti», codice Downloader di Lite in alto. */
(() => {
  const css = document.createElement('style');
  css.textContent = `
.app-chip{display:inline-block;font-size:11px;font-weight:700;letter-spacing:.04em;padding:2px 7px;border-radius:5px;margin-left:8px;vertical-align:2px;background:rgba(224,164,49,.16);color:#ecc06f}
.app-chip.tv{background:rgba(61,124,245,.15);color:#8fb3ff}
.app-chip.ktv{background:rgba(34,211,238,.15);color:#7fe3f5}
.app-chip.prem{background:rgba(212,175,55,.18);color:#f5d77a}
.app-chip.xc{background:rgba(167,139,250,.18);color:#c4b5fd}
.app-chip.plus{background:rgba(192,38,211,.18);color:#f0abfc}
.lite-note{padding:12px 14px;border-radius:10px;border:1px solid rgba(224,164,49,.45);background:rgba(224,164,49,.08);font-size:13.5px;margin-bottom:14px}
#dvApp{flex:0 0 auto}`;
  document.head.appendChild(css);

  const LITE_PERMS = new Set(['link', 'plSwitch', 'profiles', 'vpn']); // le sole funzioni che Kairos Lite usa
  const PLUS_PERMS = new Set(['link', 'plSwitch']); // Kairos Plus: collegamento di altre TV e cambio playlist (niente profili né VPN)
  const appOf = (d) => { if (!d) return ''; if (d.parent && !d.app) { const p = D.devices.find((x) => x.id === d.parent); return p ? p.app || '' : ''; } return d.app || ''; };
  const isLite = (d) => appOf(d) === 'lite';
  const isPrem = (d) => appOf(d) === 'prem';
  const isKtv = (d) => appOf(d) === 'ktv' || isPrem(d); // Kairos Premium nasce da Kairos TV: stesse funzioni
  const isXc = (d) => appOf(d) === 'xc';
  const isPlus = (d) => appOf(d) === 'plus';
  const isNova = (d) => appOf(d) === 'nova';
  const kindOf = (d) => (isLite(d) ? 'lite' : isPrem(d) ? 'prem' : isKtv(d) ? 'ktv' : isXc(d) ? 'xc' : isPlus(d) ? 'plus' : isNova(d) ? 'nova' : 'tv');
  let flt = 'all';
  try { flt = localStorage.getItem('kc_app') || 'all'; } catch {}

  /* ---------- Clienti: filtro per app ---------- */
  function filterBar() {
    const bar = $('#v-devices .dv-bar'); if (!bar) return;
    let seg = $('#dvApp');
    if (!seg) { seg = document.createElement('div'); seg.className = 'seg'; seg.id = 'dvApp'; bar.insertBefore(seg, $('#dvView')); }
    const prim = D.devices.filter((d) => !d.parent), n = (k) => prim.filter((d) => k === 'all' || kindOf(d) === k).length;
    seg.innerHTML = [['all', 'Tutte le app'], ['tv', 'Kairos Pro'], ['ktv', 'Kairos TV'], ['prem', 'Kairos Premium'], ['lite', 'Kairos Lite'], ['xc', 'Kairos XC'], ['plus', 'Kairos Plus'], ['nova', 'Kairos Nova']].map(([k, l]) => `<button data-app="${k}" class="${flt === k ? 'on' : ''}" title="${k === 'tv' ? 'Comprende i dispositivi non ancora collegati' : ''}">${l} <span style="opacity:.6">${n(k)}</span></button>`).join('');
    $$('[data-app]', seg).forEach((b) => (b.onclick = () => { flt = b.dataset.app; try { localStorage.setItem('kc_app', flt); } catch {} renderDevices(); }));
  }
  const rd = renderDevices;
  window.renderDevices = renderDevices = function () {
    const all = D.devices;
    if (flt !== 'all') {
      const keep = new Set(all.filter((d) => !d.parent && kindOf(d) === flt).map((d) => d.id));
      D.devices = all.filter((d) => keep.has(d.id) || (d.parent && keep.has(d.parent)));
    }
    try { rd(); } finally { D.devices = all; }
    filterBar();
    // etichetta «LITE» / «TV» su schede e tabella
    const chip = (d) => (isLite(d) ? '<span class="app-chip">LITE</span>' : isPrem(d) ? '<span class="app-chip prem">PREMIUM</span>' : isKtv(d) ? '<span class="app-chip ktv">TV</span>' : isXc(d) ? '<span class="app-chip xc">XC</span>' : isPlus(d) ? '<span class="app-chip plus">PLUS</span>' : isNova(d) ? '<span class="app-chip plus">NOVA</span>' : '');
    $$('#dvCards .dv-card[data-id]').forEach((c) => { const d = all.find((x) => x.id === c.dataset.id); const b = $('.dv-n b', c); if (b && chip(d) && !$('.app-chip', b)) b.insertAdjacentHTML('beforeend', chip(d)); });
    $$('#dvTbl tbody tr[data-id]').forEach((r) => { const d = all.find((x) => x.id === r.dataset.id); const b = $('.dvt-u b', r); if (b && chip(d) && !$('.app-chip', b)) b.insertAdjacentHTML('beforeend', chip(d)); });
  };

  /* ---------- scheda cliente: scelta dell'app e solo le funzioni che Kairos Lite ha ---------- */
  function applyLite() {
    const on = isLite(edit), xc = isXc(edit), plus = isPlus(edit) || isNova(edit), ktv = isKtv(edit) || xc; // Kairos XC usa le stesse funzioni di Kairos TV/Lite; Kairos Nova quelle di Plus
    for (const id of ['ply', 'add', 'vpn']) { const off = id === 'vpn' ? plus : on || ktv || plus; const sec = $('#ds-' + id); if (sec) sec.style.display = off ? 'none' : ''; const nb = $(`#dBody [data-ds="${id}"]`); if (nb) nb.style.display = off ? 'none' : ''; }
    let k = 0; $$('#dBody .dnav [data-ds]').forEach((b) => { const i = $('i', b); if (i && b.style.display !== 'none') i.textContent = ++k; });
    k = 0; $$('#dBody .dsec').forEach((sec) => { const i = $('.dsh i', sec); if (i && sec.style.display !== 'none') i.textContent = ++k; });
    $$('#ds-perm [data-perm]').forEach((t) => { t.style.display = (plus && !PLUS_PERMS.has(t.dataset.perm)) || ((on || ktv) && !LITE_PERMS.has(t.dataset.perm)) ? 'none' : ''; });
    for (const sel of ['#eAiProv', '#eAiLim']) { const el = $(sel); if (!el) continue; const box = sel === '#eAiLim' ? el.parentElement : el; box.style.display = on || ktv || plus ? 'none' : ''; const lb = box.previousElementSibling; if (lb && lb.classList.contains('lbl')) lb.style.display = on || ktv || plus ? 'none' : ''; }
    { const hn = $('#eAiHint'); if (hn) hn.style.display = on || ktv || plus ? 'none' : ''; } // spiegazione sotto «Assistente IA»: solo Kairos Pro ha l'assistente
    const note = $('#dBody .lite-note'); if (note) note.style.display = on ? '' : 'none';
    const kn = $('#dBody .ktv-note'); if (kn) kn.style.display = ktv && !xc && !isPrem(edit) ? '' : 'none';
    const xn = $('#dBody .xc-note'); if (xn) xn.style.display = xc ? '' : 'none';
    const pn = $('#dBody .plus-note'); if (pn) pn.style.display = plus ? '' : 'none';
    $$('#eApp [data-eapp]').forEach((b) => b.classList.toggle('on', b.dataset.eapp === kindOf(edit)));
  }
  const rdw = renderDrawer;
  window.renderDrawer = renderDrawer = function () {
    rdw();
    if (!edit) return;
    const main = $('#dBody .dmain'); if (!main) return;
    if (!$('#eAppBox', main)) {
      main.insertAdjacentHTML('afterbegin', `<div id="eAppBox" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:14px"><b style="font-size:13.5px">App del cliente</b><div class="seg" id="eApp"><button data-eapp="tv">Kairos Pro</button><button data-eapp="ktv">Kairos TV</button><button data-eapp="prem">Kairos Premium</button><button data-eapp="lite">Kairos Lite</button><button data-eapp="xc">Kairos XC</button><button data-eapp="plus">Kairos Plus</button></div><small class="mut">Si aggiorna da sola quando l'app si collega</small></div>`);
      $$('#eApp [data-eapp]').forEach((b) => (b.onclick = () => { edit.app = b.dataset.eapp; edit._appSet = true; applyLite(); }));
    }
    if (!$('.lite-note', main)) $('#eAppBox', main) ? $('#eAppBox', main).insertAdjacentHTML('afterend', '<div class="lite-note"><b>Questo cliente usa Kairos Lite.</b> Qui vedi solo quello che Lite usa: niente lettore a scelta, add-on, assistente IA, registrazioni, speed test e multi-schermo.</div>') : main.insertAdjacentHTML('afterbegin', '<div class="lite-note"><b>Questo cliente usa Kairos Lite.</b> Qui vedi solo quello che Lite usa.</div>');
    if (!$('.ktv-note', main)) $('.lite-note', main).insertAdjacentHTML('afterend', '<div class="lite-note ktv-note"><b>Questo cliente usa Kairos TV.</b> App nativa stile Netflix (veloce come la Lite): qui vedi solo quello che usa (collegamento TV, cambio playlist, profili, VPN).</div>');
    if (!$('.xc-note', main)) $('.ktv-note', main).insertAdjacentHTML('afterend', '<div class="lite-note xc-note"><b>Questo cliente usa Kairos XC.</b> App stile MirkoTeam, leggera e veloce: qui vedi solo quello che usa (collegamento TV, cambio playlist, profili, VPN).</div>');
    if (!$('.plus-note', main)) $('.xc-note', main).insertAdjacentHTML('afterend', '<div class="lite-note plus-note"><b>Questo cliente usa Kairos Plus.</b> La nuova app stile Netflix per Fire TV e Android TV, con lettore nativo: qui vedi solo quello che usa (playlist, scadenza, collegamento TV, cambio playlist, visioni contemporanee, messaggi, manutenzione e Disconnetti). Niente VPN, profili, add-on e assistente IA.</div>');
    applyLite();
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
  /* ---------- Impostazioni → App e aggiornamenti: Kairos TV ---------- */
  if (pane && !$('#ktvCard')) {
    pane.insertAdjacentHTML('beforeend', `<div class="card glass" id="ktvCard" style="margin-top:18px"><div class="hd"><h3>Kairos TV<small>L'app stile Netflix leggera per chiavette datate (logo blu): stesso pannello e stessi clienti, aggiornamenti dal suo repository kairos-tv</small></h3></div>
      <div id="ktvAuto" class="st-note"></div>
      <div class="st-row"><div class="st-l"><b>Link per scaricare l'APK di Kairos TV</b><small>Vuoto = l'ultima release del repository kairos-tv</small></div><div class="st-c"><input class="inp mono" id="sKtvApk" placeholder="https://github.com/…/kairos-tv.apk"></div></div>
      <div class="st-row"><div class="st-l"><b>Codice Downloader di Kairos TV</b><small>Compare in alto nel pannello accanto agli altri (anche agli agenti)</small></div><div class="st-c"><input class="inp mono" id="sKtvDl" maxlength="20" placeholder="es. 7654321"></div></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px"><button class="btn pri" id="ktvSave">Salva Kairos TV</button><button class="btn" id="ktvCopy">Copia link APK</button></div></div>`);
    $('#ktvSave').onclick = async () => { try { await api('PUT', '/admin/settings', { ktvApkUrl: $('#sKtvApk').value.trim(), ktvDownloaderCode: $('#sKtvDl').value.trim() }); delete $('#sKtvApk').dataset.ldirty; delete $('#sKtvDl').dataset.ldirty; await load(); toast('Kairos TV salvata'); } catch (e) { toast(e.message, 1); } };
    $('#ktvCopy').onclick = () => { const l = (D.ktv && ((D.ktv.feed && D.ktv.feed.url) || D.ktv.apk)) || ''; if (!l) return toast('Nessun link ancora: pubblica una release', 1); navigator.clipboard.writeText(l).then(() => toast('Link copiato'), () => toast('Copia non consentita', 1)); };
    for (const id of ['#sKtvApk', '#sKtvDl']) $(id).addEventListener('input', (e) => (e.target.dataset.ldirty = '1'));
    for (const ev of ['input', 'change']) $('#ktvCard').addEventListener(ev, (e) => e.stopPropagation());
  }
  /* ---------- Impostazioni → App e aggiornamenti: Kairos XC ---------- */
  if (pane && !$('#xcCard')) {
    pane.insertAdjacentHTML('beforeend', `<div class="card glass" id="xcCard" style="margin-top:18px"><div class="hd"><h3>Kairos XC<small>L'app stile MirkoTeam, leggera e veloce: stesso pannello e stessi clienti, aggiornamenti dal suo repository kairos-xc</small></h3></div>
      <div id="xcAuto" class="st-note"></div>
      <div class="st-row"><div class="st-l"><b>Link per scaricare l'APK di Kairos XC</b><small>Vuoto = l'ultima release del repository kairos-xc</small></div><div class="st-c"><input class="inp mono" id="sXcApk" placeholder="https://github.com/…/kairos-xc.apk"></div></div>
      <div class="st-row"><div class="st-l"><b>Codice Downloader di Kairos XC</b><small>Compare in alto nel pannello accanto agli altri (anche agli agenti)</small></div><div class="st-c"><input class="inp mono" id="sXcDl" maxlength="20" placeholder="es. 7654321"></div></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px"><button class="btn pri" id="xcSave">Salva Kairos XC</button><button class="btn" id="xcCopy">Copia link APK</button></div></div>`);
    $('#xcSave').onclick = async () => { try { await api('PUT', '/admin/settings', { xcApkUrl: $('#sXcApk').value.trim(), xcDownloaderCode: $('#sXcDl').value.trim() }); delete $('#sXcApk').dataset.ldirty; delete $('#sXcDl').dataset.ldirty; const old = $('#dlXc'); if (old) old.remove(); await load(); toast('Kairos XC salvata'); } catch (e) { toast(e.message, 1); } };
    $('#xcCopy').onclick = () => { const l = (D.xc && ((D.xc.feed && D.xc.feed.url) || D.xc.apk)) || ''; if (!l) return toast('Nessun link ancora: pubblica una release', 1); navigator.clipboard.writeText(l).then(() => toast('Link copiato'), () => toast('Copia non consentita', 1)); };
    for (const id of ['#sXcApk', '#sXcDl']) $(id).addEventListener('input', (e) => (e.target.dataset.ldirty = '1'));
    for (const ev of ['input', 'change']) $('#xcCard').addEventListener(ev, (e) => e.stopPropagation());
  }
  /* ---------- Impostazioni → App e aggiornamenti: Kairos Plus ---------- */
  if (pane && !$('#plusCard')) {
    pane.insertAdjacentHTML('beforeend', `<div class="card glass" id="plusCard" style="margin-top:18px"><div class="hd"><h3>Kairos Plus<small>La nuova app stile Netflix per Fire TV e Android TV (logo viola): stesso pannello e stessi clienti, aggiornamenti dal suo repository kairos-flutter</small></h3></div>
      <div id="plusAuto" class="st-note"></div>
      <div class="st-row"><div class="st-l"><b>Link per scaricare l'APK di Kairos Plus</b><small>Vuoto = l'ultima release del repository kairos-flutter</small></div><div class="st-c"><input class="inp mono" id="sPlusApk" placeholder="https://github.com/…/kairos-plus.apk"></div></div>
      <div class="st-row"><div class="st-l"><b>Codice Downloader di Kairos Plus</b><small>Compare in alto nel pannello accanto agli altri (anche agli agenti)</small></div><div class="st-c"><input class="inp mono" id="sPlusDl" maxlength="20" placeholder="es. 7654321"></div></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px"><button class="btn pri" id="plusSave">Salva Kairos Plus</button><button class="btn" id="plusCopy">Copia link APK</button></div></div>`);
    $('#plusSave').onclick = async () => { try { await api('PUT', '/admin/settings', { plusApkUrl: $('#sPlusApk').value.trim(), plusDownloaderCode: $('#sPlusDl').value.trim() }); delete $('#sPlusApk').dataset.ldirty; delete $('#sPlusDl').dataset.ldirty; const old = $('#dlPlus'); if (old) old.remove(); await load(); toast('Kairos Plus salvata'); } catch (e) { toast(e.message, 1); } };
    $('#plusCopy').onclick = () => { const l = (D.plus && ((D.plus.feed && D.plus.feed.url) || D.plus.apk)) || ''; if (!l) return toast('Nessun link ancora: pubblica una release', 1); navigator.clipboard.writeText(l).then(() => toast('Link copiato'), () => toast('Copia non consentita', 1)); };
    for (const id of ['#sPlusApk', '#sPlusDl']) $(id).addEventListener('input', (e) => (e.target.dataset.ldirty = '1'));
    for (const ev of ['input', 'change']) $('#plusCard').addEventListener(ev, (e) => e.stopPropagation());
  }
  /* ---------- Impostazioni → App e aggiornamenti: Kairos Premium e Kairos Nova (APK fisso, solo codice Downloader) ---------- */
  const FIXED = [['prem', 'Kairos Premium', 'L\'app cinema in oro (stile IptvX): stesso pannello e stessi clienti, aggiornamenti dal repository kairos-premium', 'premDownloaderCode', 'PR', isPrem],
    ['nova', 'Kairos Nova', 'L\'app Flutter per telefoni e TV: stesso pannello e stessi clienti, aggiornamenti dal repository Lairos-nova', 'novaDownloaderCode', 'NV', isNova]];
  for (const [k, name, desc, ck] of FIXED) {
    if (!pane || $('#' + k + 'Card')) continue;
    pane.insertAdjacentHTML('beforeend', `<div class="card glass" id="${k}Card" style="margin-top:18px"><div class="hd"><h3>${name}<small>${desc}</small></h3></div>
      <div id="${k}Auto" class="st-note"></div>
      <div class="st-row"><div class="st-l"><b>Codice Downloader di ${name}</b><small>Compare in alto nel pannello accanto agli altri (anche agli agenti a cui la concedi)</small></div><div class="st-c"><input class="inp mono" id="${k}Dl" maxlength="20" placeholder="es. 7654321"></div></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px"><button class="btn pri" id="${k}Save">Salva ${name}</button><button class="btn" id="${k}Copy">Copia link APK</button></div></div>`);
    $('#' + k + 'Save').onclick = async () => { try { await api('PUT', '/admin/settings', { [ck]: $('#' + k + 'Dl').value.trim() }); delete $('#' + k + 'Dl').dataset.ldirty; const old = $('#dl_' + k); if (old) old.remove(); await load(); toast(name + ' salvata'); } catch (e) { toast(e.message, 1); } };
    $('#' + k + 'Copy').onclick = () => { const X = D[k] || {}, l = (X.feed && X.feed.url) || X.apk || ''; if (!l) return toast('Nessun link ancora', 1); navigator.clipboard.writeText(l).then(() => toast('Link copiato'), () => toast('Copia non consentita', 1)); };
    $('#' + k + 'Dl').addEventListener('input', (e) => (e.target.dataset.ldirty = '1'));
    for (const ev of ['input', 'change']) $('#' + k + 'Card').addEventListener(ev, (e) => e.stopPropagation());
  }
  function renderFixed() {
    const s = D.settings || {};
    for (const [k, name, , ck, ic, is] of FIXED) {
      const f = (D[k] || {}).feed, n = D.devices.filter((d) => !d.parent && is(d)).length;
      if ($('#' + k + 'Auto')) $('#' + k + 'Auto').innerHTML = (f && f.version ? `✅ <b>Versione pubblicata: ${esc(f.version)}</b>${f.date ? ' · ' + esc(String(f.date).slice(0, 10)) : ''} — le app installate la propongono da sole` : `⚠️ Nessuna release di ${name} trovata (o GitHub non risponde adesso)`) + ` · Clienti che usano ${name}: <b>${n}</b>`;
      const inp = $('#' + k + 'Dl'); if (inp && !inp.dataset.ldirty && document.activeElement !== inp) inp.value = s[ck] || '';
      const bar = $('#dlBar');
      if (bar && !$('#dl_' + k) && s[ck]) {
        bar.insertAdjacentHTML('beforeend', `<div class="dl" id="dl_${k}"><i>${ic}</i><div><small>Downloader · ${name}</small><b>${esc(s[ck])}</b></div><button class="btn sm" data-dlc="${esc(s[ck])}">Copia</button></div>`);
        $('#dl_' + k + ' [data-dlc]').onclick = (e) => navigator.clipboard.writeText(e.target.dataset.dlc).then(() => toast('Codice copiato'), () => toast('Copia non consentita', 1));
      }
    }
  }
  function renderPlus() {
    const s = D.settings || {}, X = D.plus || {}, f = X.feed;
    const n = D.devices.filter((d) => !d.parent && isPlus(d)).length;
    if ($('#plusAuto')) $('#plusAuto').innerHTML = (f && f.version ? `✅ <b>Versione pubblicata: ${esc(f.version)}</b>${f.date ? ' · ' + esc(String(f.date).slice(0, 10)) : ''} — i clienti la aggiornano dal Kairos Store` : '⚠️ Nessuna release di Kairos Plus trovata (o GitHub non risponde adesso)') + ` · Clienti che usano Kairos Plus: <b>${n}</b>`;
    if ($('#sPlusApk') && !$('#sPlusApk').dataset.ldirty && document.activeElement !== $('#sPlusApk')) $('#sPlusApk').value = s.plusApkUrl || '';
    if ($('#sPlusDl') && !$('#sPlusDl').dataset.ldirty && document.activeElement !== $('#sPlusDl')) $('#sPlusDl').value = s.plusDownloaderCode || '';
    const bar = $('#dlBar');
    if (bar && !$('#dlPlus') && s.plusDownloaderCode) {
      bar.insertAdjacentHTML('beforeend', `<div class="dl" id="dlPlus"><i>PL</i><div><small>Downloader · Kairos Plus</small><b>${esc(s.plusDownloaderCode)}</b></div><button class="btn sm" data-dlc="${esc(s.plusDownloaderCode)}">Copia</button></div>`);
      $('#dlPlus [data-dlc]').onclick = (e) => navigator.clipboard.writeText(e.target.dataset.dlc).then(() => toast('Codice copiato'), () => toast('Copia non consentita', 1));
    }
  }
  function renderXc() {
    const s = D.settings || {}, X = D.xc || {}, f = X.feed;
    const n = D.devices.filter((d) => !d.parent && isXc(d)).length;
    if ($('#xcAuto')) $('#xcAuto').innerHTML = (f && f.version ? `✅ <b>Versione pubblicata: ${esc(f.version)}</b>${f.date ? ' · ' + esc(String(f.date).slice(0, 10)) : ''} — le app Kairos XC installate la propongono da sole` : '⚠️ Nessuna release di Kairos XC trovata (o GitHub non risponde adesso)') + ` · Clienti che usano Kairos XC: <b>${n}</b>`;
    if ($('#sXcApk') && !$('#sXcApk').dataset.ldirty && document.activeElement !== $('#sXcApk')) $('#sXcApk').value = s.xcApkUrl || '';
    if ($('#sXcDl') && !$('#sXcDl').dataset.ldirty && document.activeElement !== $('#sXcDl')) $('#sXcDl').value = s.xcDownloaderCode || '';
    const bar = $('#dlBar');
    if (bar && !$('#dlXc') && s.xcDownloaderCode) {
      bar.insertAdjacentHTML('beforeend', `<div class="dl" id="dlXc"><i>XC</i><div><small>Downloader · Kairos XC</small><b>${esc(s.xcDownloaderCode)}</b></div><button class="btn sm" data-dlc="${esc(s.xcDownloaderCode)}">Copia</button></div>`);
      $('#dlXc [data-dlc]').onclick = (e) => navigator.clipboard.writeText(e.target.dataset.dlc).then(() => toast('Codice copiato'), () => toast('Copia non consentita', 1));
    }
  }
  function renderKtv() {
    const s = D.settings || {}, K = D.ktv || {}, f = K.feed;
    const n = D.devices.filter((d) => !d.parent && isKtv(d)).length;
    if ($('#ktvAuto')) $('#ktvAuto').innerHTML = (f && f.version ? `✅ <b>Versione pubblicata: ${esc(f.version)}</b>${f.date ? ' · ' + esc(String(f.date).slice(0, 10)) : ''} — le app Kairos TV installate la propongono da sole` : '⚠️ Nessuna release di Kairos TV trovata (o GitHub non risponde adesso)') + ` · Clienti che usano Kairos TV: <b>${n}</b>`;
    if ($('#sKtvApk') && !$('#sKtvApk').dataset.ldirty && document.activeElement !== $('#sKtvApk')) $('#sKtvApk').value = s.ktvApkUrl || '';
    if ($('#sKtvDl') && !$('#sKtvDl').dataset.ldirty && document.activeElement !== $('#sKtvDl')) $('#sKtvDl').value = s.ktvDownloaderCode || '';
    const bar = $('#dlBar');
    if (bar && !$('#dlKtv') && s.ktvDownloaderCode) {
      bar.insertAdjacentHTML('beforeend', `<div class="dl" id="dlKtv"><i>TV</i><div><small>Downloader · Kairos TV</small><b>${esc(s.ktvDownloaderCode)}</b></div><button class="btn sm" data-dlc="${esc(s.ktvDownloaderCode)}">Copia</button></div>`);
      $('#dlKtv [data-dlc]').onclick = (e) => navigator.clipboard.writeText(e.target.dataset.dlc).then(() => toast('Codice copiato'), () => toast('Copia non consentita', 1));
    }
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
  window.renderAll = renderAll = function () { ra(); renderLite(); renderKtv(); renderXc(); renderPlus(); renderFixed(); };
  // lo stato porta anche le informazioni di Lite
  const api0 = api;
  window.api = api = async function (m, p, b) {
    // l'app scelta nella scheda del cliente (titolare) viaggia con il salvataggio
    if (edit && edit.app && b && typeof b === 'object' && ((m === 'POST' && p === '/admin/devices' && isNew) || (m === 'PUT' && p === '/admin/devices/' + edit.id && edit._appSet))) b = { ...b, app: edit.app };
    const r = await api0(m, p, b); if (p === '/admin/state' && m === 'GET' && r) { D.lite = r.lite || null; D.ktv = r.ktv || null; D.xc = r.xc || null; D.plus = r.plus || null; D.prem = r.prem || null; D.nova = r.nova || null; } return r; };
  if (typeof DEMO !== 'undefined') {
    DEMO.settings.liteDownloaderCode = DEMO.settings.liteDownloaderCode || '5551234';
    DEMO.devices.forEach((d, i) => { if (!d.parent && d.playlists && d.playlists.length) d.app = i % 5 === 2 ? 'lite' : i % 5 === 3 ? 'ktv' : i % 5 === 4 ? 'xc' : i % 10 === 5 ? 'plus' : i % 10 === 0 ? 'nova' : 'tv'; });
    const dm = demoApi;
    window.demoApi = demoApi = async function (m, p, b) { const r = await dm(m, p, b); if (p === '/admin/state' && r && !r.lite) r.lite = { apk: DEMO.settings.liteApkUrl || 'https://github.com/mariopiccolo8562-lang/kairos-lite/releases/latest/download/kairos-lite.apk', feed: { version: '1.0.0', date: '2026-11-03' } }; if (p === '/admin/state' && r && !r.ktv) r.ktv = { apk: 'https://github.com/mariopiccolo8562-lang/kairos-tv/releases/latest/download/kairos-tv.apk', feed: { version: '1.0.0', date: '2026-11-04' } }; if (p === '/admin/state' && r && !r.xc) r.xc = { apk: 'https://github.com/mariopiccolo8562-lang/kairos-xc/releases/latest/download/kairos-xc.apk', feed: { version: '1.0.0', date: '2026-11-05' } }; if (p === '/admin/state' && r && !r.plus) r.plus = { apk: 'https://github.com/mariopiccolo8562-lang/kairos-flutter/releases/latest/download/kairos-plus.apk', feed: { version: '0.1.12', date: '2026-11-05' } }; return r; };
  }
})();
