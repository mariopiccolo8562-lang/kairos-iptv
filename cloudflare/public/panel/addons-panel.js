/* KAIROS Control 2.3.1 — codici Downloader in evidenza, "Richieste temi" (voce a parte) e anteprima degli add-on nel pannello.
   Usa le funzioni di app.js / kc.js ($, $$, esc, api, toast, ago, D, TITLES, view, load, addonCatNow…) e i dati di addon-data.js. */
(() => {
  const css = document.createElement('style');
  css.textContent = `
.dlbar{display:flex;gap:10px;flex-wrap:wrap;margin:-6px 0 18px}
.dlbar .dl{display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:10px;border:1px solid var(--line);background:var(--glass)}
.dlbar .dl i{font-style:normal;width:34px;height:34px;border-radius:8px;display:grid;place-items:center;background:rgba(61,124,245,.15);color:#8fb3ff;font-weight:800;font-size:13px}
.dlbar .dl small{display:block;color:var(--mut);font-size:11.5px}
.dlbar .dl b{font-family:'JetBrains Mono',monospace;font-size:20px;letter-spacing:.06em}
.dlbar .dl.no b{font-family:inherit;font-size:13px;font-weight:500;color:var(--mut);letter-spacing:0}
.adpvb{all:unset;cursor:pointer;display:inline-grid;place-items:center;width:26px;height:22px;border-radius:6px;font-size:12px;margin-left:8px;background:#2a2f39;color:#c9cdd6;vertical-align:middle}
.adpvb:hover{background:#343a46;color:#fff}
#adPv{position:fixed;inset:0;z-index:45;display:none;place-items:center;background:rgba(5,6,10,.7);padding:20px}
#adPv.on{display:grid}
#adPv .bx{width:min(560px,100%);max-height:92vh;overflow:auto;background:#1e2127;border:1px solid var(--line);border-radius:12px}
#adPv .sc{height:220px;position:relative;background:#0c0d10 center/cover no-repeat;border-radius:12px 12px 0 0;overflow:hidden}
#adPv .sc .mk{position:absolute;left:18px;right:18px;bottom:16px}
#adPv .sc .mk b{display:block;font-size:18px;color:#fff;text-shadow:0 2px 8px #000a}
#adPv .sc .mk .tl{display:grid;grid-template-columns:1.6fr 1fr 1fr 1fr;gap:6px;margin-top:10px;height:46px}
#adPv .sc .mk .tl i{border-radius:6px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.18)}
#adPv .sc .tag{position:absolute;top:12px;left:12px;font-size:11px;font-weight:700;letter-spacing:.08em;padding:4px 8px;border-radius:5px;background:rgba(0,0,0,.55);color:#fff}
#adPv .ct{padding:18px 20px}
#adPv h3{font-size:18px}#adPv p{color:var(--mut);font-size:13.5px;margin:4px 0 12px;line-height:1.45}
#adPv .avs{display:flex;gap:10px;flex-wrap:wrap;margin:6px 0 4px}
#adPv .avs span{width:58px;height:58px;border-radius:50%;overflow:hidden;display:block;background:#2a2e36}
#adPv .avs span img,#adPv .avs span svg{width:100%;height:100%;display:block;object-fit:cover}
#adPv .pal{display:flex;gap:8px;margin:4px 0 8px}#adPv .pal i{width:34px;height:34px;border-radius:8px;border:1px solid rgba(255,255,255,.15)}
#adPv .ft{display:flex;justify-content:flex-end;gap:8px;padding:0 20px 18px}
.areq-it{display:flex;gap:14px;align-items:center;padding:12px 4px;border-bottom:1px solid var(--line)}
.areq-it:last-child{border-bottom:0}
.areq-it .sw{width:54px;height:54px;border-radius:10px;flex:none;background:#2a2e36 center/cover no-repeat;border:1px solid var(--line)}
.areq-it .tx{flex:1;min-width:0}.areq-it .tx b{font-size:14.5px}.areq-it .tx small{display:block;color:var(--mut);font-size:12.5px;margin-top:3px}
.areq-it .ac{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
.areq-it.new{background:rgba(61,124,245,.05)}`;
  document.head.appendChild(css);

  const UI = window.KX_ADDONS || {}, AVS = window.KX_AVS || [];
  const avSvg = (n) => { const e = AVS[n - 1]; if (!e) return ''; const [c1, c2, d, eo, ln] = e, g = 'pa' + n + Math.random().toString(36).slice(2, 6);
    return `<svg viewBox="0 0 100 100"><defs><radialGradient id="${g}" cx=".35" cy=".3" r=".9"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></radialGradient></defs><circle cx="50" cy="50" r="50" fill="url(#${g})"/><path d="${d}"${eo ? ' fill-rule="evenodd"' : ''} fill="rgba(255,255,255,.92)" stroke="rgba(255,255,255,.95)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>${ln ? `<path d="${ln}" fill="none" stroke="rgba(255,255,255,.95)" stroke-width="3" stroke-linecap="round"/>` : ''}</svg>`; };
  const imgOk = (u) => (typeof u === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(u) ? u : '');
  const pvCache = new Map();
  async function pvData(id) {
    if (D.demo || !UI[id] || UI[id].cat !== 'tema') return null;
    if (pvCache.has(id)) return pvCache.get(id);
    try { const j = await api('GET', '/admin/addon-preview/' + id); pvCache.set(id, j); return j; } catch { return null; }
  }

  /* ---------- anteprima di un add-on (solo da vedere) ---------- */
  const box = document.createElement('div'); box.id = 'adPv'; document.body.appendChild(box);
  box.onclick = (e) => { if (e.target === box || e.target.closest('[data-pvx]')) box.classList.remove('on'); };
  addEventListener('keydown', (e) => { if (e.key === 'Escape') box.classList.remove('on'); });
  async function showPreview(id) {
    const a = UI[id]; if (!a) return toast('Anteprima non disponibile', 1);
    const pal = a.pal || ['#3d7cf5', '#5b8ff7', '#1b2a4a'];
    const what = a.cat === 'tema' ? 'Tema speciale: colori, scena di sfondo e 4 avatar per i profili' : a.cat === 'skin' ? 'Skin colorata per tutta l\'app' : `Pacchetto di ${a.n} avatar per i profili`;
    const avs = a.cat === 'avatar' ? Array.from({ length: a.n }, (_, i) => `<span>${avSvg(a.av + i)}</span>`).join('') : '';
    box.innerHTML = `<div class="bx"><div class="sc" id="adPvSc" style="background:linear-gradient(120deg,${pal[2]},${pal[0]} 55%,${pal[1]})"><span class="tag">ANTEPRIMA</span>
      <div class="mk"><b>${esc(a.name)}</b><div class="tl"><i style="background:${pal[0]}55"></i><i></i><i></i><i></i></div></div></div>
      <div class="ct"><h3>${esc(a.name)}</h3><p>${esc(what)} · ${esc(a.desc || '')}</p>
      ${a.pal ? `<div class="pal">${a.pal.map((c) => `<i style="background:${c}"></i>`).join('')}</div>` : ''}
      <div class="avs" id="adPvAv">${avs}</div>
      <p style="font-size:12px;margin-top:10px">${a.cat === 'tema' ? 'Scena e avatar a bassa risoluzione: il tema completo arriva sul dispositivo solo ai clienti a cui lo assegni.' : 'Solo anteprima: il cliente lo può usare solo se glielo assegni.'}</p></div>
      <div class="ft"><button class="btn" data-pvx>Chiudi</button></div></div>`;
    box.classList.add('on');
    const j = await pvData(id);
    if (!j || !box.classList.contains('on')) return;
    const bg = imgOk(j.bg); if (bg) { const sc = $('#adPvSc'); sc.style.background = `#0c0d10 url("${bg}") center 70% / cover no-repeat`; }
    const list = (j.avs || []).map(imgOk).filter(Boolean);
    if (list.length) $('#adPvAv').innerHTML = list.map((u) => `<span><img src="${u}" alt=""></span>`).join('');
  }
  window.addonPreviewPanel = showPreview;
  const eye = (id) => `<button type="button" class="adpvb" data-adpv="${esc(id)}" title="Anteprima">👁</button>`;
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-adpv]'); if (!b) return; e.preventDefault(); e.stopPropagation(); showPreview(b.dataset.adpv); }, true);
  window.KX_EYE = eye;
  // Impostazioni → Store add-on
  const rac = renderAddonCfg;
  window.renderAddonCfg = renderAddonCfg = function () { rac(); $$('#adCfg [data-adm]').forEach((s) => { const row = s.closest('.adrow'), b = row && $('b', row); if (b && !$('.adpvb', row)) b.insertAdjacentHTML('beforeend', eye(s.dataset.adm)); }); };
  // scheda cliente → Add-on
  const rdw = renderDrawer;
  window.renderDrawer = renderDrawer = function () { rdw(); $$('#dBody [data-addon]').forEach((t) => { const b = $('b', t); if (b && !$('.adpvb', t)) b.insertAdjacentHTML('beforeend', eye(t.dataset.addon)); }); $$('#dBody .tog.fixed').forEach((t) => { const id = Object.keys(UI).find((k) => UI[k].name === ($('b', t) || {}).textContent); if (id && !$('.adpvb', t)) $('b', t).insertAdjacentHTML('beforeend', eye(id)); }); };

  /* ---------- codici Downloader in evidenza ---------- */
  const bar = document.createElement('div'); bar.className = 'dlbar'; bar.id = 'dlBar';
  $('.topbar').after(bar);
  function renderBar() {
    const s = D.settings || {};
    const it = (k, label, code, hint) => `<div class="dl ${code ? '' : 'no'}" data-dlk="${k}"><i>${k}</i><div><small>${label}</small><b>${code ? esc(code) : hint}</b></div>${code ? `<button class="btn sm" data-dlc="${esc(code)}">Copia</button>` : ''}</div>`;
    // senza codice Downloader: l'indirizzo pulito del pannello da scrivere in Downloader (niente nome del titolare)
    const linkIt = (k, label, url) => `<div class="dl" data-dlk="${k}"><i>${k}</i><div><small>${label}</small><b style="font-size:13px;letter-spacing:0">${esc(url.replace(/^https?:\/\//, ''))}</b></div><button class="btn sm" data-dlc="${esc(url)}">Copia</button></div>`;
    const owner = D.role !== 'agent';
    const linkOf = (key, slug) => { if (owner) return location.protocol === 'file:' ? '' : location.origin + '/get/' + slug + '.apk'; const x = (D.kairosApps || []).find((a) => a.key === key); return x && x.apk ? x.apk : ''; };
    const dl = (k, label, code, key, slug) => { const u = code ? '' : linkOf(key, slug); return u ? linkIt(k, label.replace('Downloader', 'Indirizzo'), u) : it(k, label, code, owner ? 'non impostato (Impostazioni → App e aggiornamenti)' : 'non impostato'); };
    bar.innerHTML = dl('DL', 'Downloader · Kairos Pro', s.downloaderCode, 'pro', 'pro')
      + dl('ST', 'Downloader · Kairos Store', s.storeDownloaderCode, 'store', 'store'); // store aperto: niente più codice venditore da dare ai clienti
    $$('[data-dlc]', bar).forEach((b) => (b.onclick = () => navigator.clipboard.writeText(b.dataset.dlc).then(() => toast(/^https?:/.test(b.dataset.dlc) ? 'Indirizzo copiato' : 'Codice copiato'), () => toast('Copia non consentita', 1))));
    const v = $('#sDlStore'); if (v && !v.dataset.dirty && document.activeElement !== v) v.value = s.storeDownloaderCode || '';
  }
  const rall = renderAll;
  window.renderAll = renderAll = function () { rall(); renderBar(); };

  /* ---------- Richieste temi (voce a parte) ---------- */
  const IC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.6-.8 1.6-1.6 0-1-.9-1.4-.9-2.4 0-.9.7-1.6 1.6-1.6H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3Z"/><circle cx="7.5" cy="11" r="1.2"/><circle cx="10" cy="7.3" r="1.2"/><circle cx="14.5" cy="7.3" r="1.2"/></svg>';
  if (!$('.nav[data-v="areq"]')) {
    const b = document.createElement('button'); b.className = 'nav'; b.dataset.v = 'areq'; b.innerHTML = IC + 'Richieste temi<span class="kc-nb" id="nb_areq"></span>';
    b.onclick = () => view('areq');
    ($('.nav[data-v="creq"]') || $('.nav[data-v="dash"]')).after(b);
    const sec = document.createElement('section'); sec.className = 'view'; sec.id = 'v-areq'; $('#v-dash').after(sec);
  }
  TITLES.areq = 'Richieste temi';
  const R = { items: null, f: 'open', last: null };
  const DEMO_R = () => {
    const ds = D.devices.filter((d) => !d.parent && d.status === 'active');
    const t = Date.now();
    return [['tema-ghiaccio', 0, 25, 'new'], ['tema-halloween', 1, 90, 'new'], ['skin-zaffiro', 2, 300, 'seen'], ['av-spazio', 3, 2000, 'done']].filter((x) => ds[x[1]])
      .map(([id, i, min, st], k) => ({ id: 900 + k, deviceId: ds[i].id, kind: 'addon', ctype: 'addon', title: UI[id].name, body: k === 0 ? 'Prezzo indicato: 13,99 €' : '', info: 'addon:' + id, status: st, created: t - min * 60e3, note: st === 'done' ? 'Assegnato' : '', name: ds[i].name, code: ds[i].code, model: ds[i].model }));
  };
  async function rq(m, p, b) {
    if (!D.demo) return api(m, p, b);
    if (!R.demo) R.demo = DEMO_R();
    if (m === 'GET') return { items: R.demo };
    const sm = p.match(/requests\/(\d+)\/status$/); if (sm) { const x = R.demo.find((r) => r.id === +sm[1]); if (x) { x.status = b.status; if (b.note) x.note = b.note; } return { ok: true }; }
    const dm = p.match(/requests\/(\d+)$/); if (dm) { R.demo = R.demo.filter((r) => r.id !== +dm[1]); return { ok: true }; }
    if (/status=done/.test(p)) { R.demo = R.demo.filter((r) => r.status !== 'done'); return { ok: true }; }
    return { ok: true };
  }
  async function areqLoad(quiet) {
    if (D.role === 'agent') return;
    const V = $('#v-areq');
    if (!quiet && !R.items) V.innerHTML = '<div class="card glass"><p class="mut">Caricamento…</p></div>';
    try { R.items = (await rq('GET', '/admin/requests?kind=addon')).items || []; } catch (e) { if (!quiet) V.innerHTML = `<div class="card glass"><p class="mut">${esc(e.message)}</p></div>`; return; }
    const nNew = R.items.filter((r) => r.status === 'new').length, nb = $('#nb_areq');
    if (nb) { nb.textContent = nNew; nb.classList.toggle('on', nNew > 0); }
    if (R.last !== null && nNew > R.last) toast(`Nuova richiesta di tema/add-on (${nNew})`);
    R.last = nNew;
    if (quiet && !V.classList.contains('on')) return;
    const list = R.items, f = R.f;
    const fit = (r, k) => (k === 'open' ? r.status !== 'done' : k === 'done' ? r.status === 'done' : true);
    const shown = list.filter((r) => fit(r, f));
    const RS = { new: ['Nuova', 'pending'], seen: ['Vista', 'active'], done: ['Fatta', 'active'] };
    V.innerHTML = `<div class="card glass"><div class="hd"><h3>Richieste di temi e add-on<small>I clienti le inviano dallo Store add-on dell'app. «Assegna» attiva subito l'add-on sul cliente.</small></h3>
      <div class="filters" style="margin:0">${[['open', 'Da gestire'], ['done', 'Fatte'], ['all', 'Tutte']].map(([k, l]) => `<button class="fchip ${f === k ? 'on' : ''}" data-arf="${k}">${l}<span>${list.filter((r) => fit(r, k)).length}</span></button>`).join('')}</div></div>
      ${shown.length ? shown.map((r) => {
        const id = String(r.info || '').replace(/^addon:/, ''), a = UI[id], d = D.devices.find((x) => x.id === r.deviceId);
        const has = d && (d.addons || []).includes(id), pal = a && a.pal ? a.pal : ['#3d7cf5', '#5b8ff7', '#1b2a4a'];
        return `<div class="areq-it ${r.status === 'new' ? 'new' : ''}"><div class="sw" style="background:linear-gradient(135deg,${pal[0]},${pal[2]})"></div>
          <div class="tx"><b>${esc(a ? a.name : r.title)}</b> <span class="st ${RS[r.status] ? RS[r.status][1] : ''}"><i></i>${RS[r.status] ? RS[r.status][0] : esc(r.status)}</span>
          <small>${a ? (a.cat === 'tema' ? 'Tema speciale' : a.cat === 'skin' ? 'Skin' : 'Pacchetto avatar') + ' · ' : ''}${esc(r.name || 'Cliente')} · <span class="mono">${esc(r.code || '')}</span> · ${esc(ago(r.created))}${r.body ? ' · ' + esc(r.body) : ''}${r.note ? ' · <b>' + esc(r.note) + '</b>' : ''}</small></div>
          <div class="ac">${a ? `<button class="btn sm" data-adpv="${esc(id)}">Anteprima</button>` : ''}
          ${r.status !== 'done' ? `${a && d && !has ? `<button class="btn sm pri" data-ara="${r.id}">Assegna</button>` : has ? '<span class="chip g">Già assegnato</span>' : ''}${r.status === 'new' ? `<button class="btn sm" data-ars="${r.id}:seen">Vista</button>` : ''}<button class="btn sm" data-ars="${r.id}:no">Rifiuta</button>` : ''}
          ${d ? `<button class="btn sm" data-aro="${esc(d.id)}">Cliente</button>` : ''}<button class="icb" data-ard="${r.id}" title="Elimina">✕</button></div></div>`; }).join('')
      : `<div class="emptyc">${list.length ? 'Nessuna richiesta in questo elenco' : 'Nessuna richiesta di temi per ora. Quando un cliente chiede un tema, una skin o un pacchetto di avatar dall\'app, compare qui.'}</div>`}
      ${list.some((r) => r.status === 'done') ? '<button class="btn sm" id="arClr" style="margin-top:10px">Svuota le fatte</button>' : ''}</div>`;
    $$('[data-arf]', V).forEach((b) => (b.onclick = () => { R.f = b.dataset.arf; areqLoad(); }));
    $$('[data-ars]', V).forEach((b) => (b.onclick = async () => {
      const [id, st] = b.dataset.ars.split(':');
      try { await rq('POST', `/admin/requests/${id}/status`, st === 'no' ? { status: 'done', note: 'Rifiutata' } : { status: st }); areqLoad(); } catch (e) { toast(e.message, 1); }
    }));
    $$('[data-ara]', V).forEach((b) => (b.onclick = async () => {
      const r = list.find((x) => x.id === +b.dataset.ara), id = String(r.info).replace(/^addon:/, ''), d = D.devices.find((x) => x.id === r.deviceId);
      if (!d) return toast('Cliente non trovato', 1);
      b.disabled = true;
      try {
        await api('PUT', '/admin/devices/' + d.id, { addons: [...new Set([...(d.addons || []), id])] });
        await rq('POST', `/admin/requests/${r.id}/status`, { status: 'done', note: 'Assegnato' });
        await load(); areqLoad(); toast(`${UI[id] ? UI[id].name : 'Add-on'} assegnato a ${d.name || d.code}`);
      } catch (e) { b.disabled = false; toast(e.message, 1); }
    }));
    $$('[data-aro]', V).forEach((b) => (b.onclick = () => { const d = D.devices.find((x) => x.id === b.dataset.aro); if (d) openDrawer(d, false); }));
    $$('[data-ard]', V).forEach((b) => (b.onclick = async () => { try { await rq('DELETE', '/admin/requests/' + b.dataset.ard); areqLoad(); } catch (e) { toast(e.message, 1); } }));
    const c = $('#arClr', V); if (c) c.onclick = async () => { try { await rq('DELETE', '/admin/requests?kind=addon&status=done'); areqLoad(); } catch (e) { toast(e.message, 1); } };
  }
  const v0 = view;
  window.view = view = function (v) { v0(v); if (v === 'areq') areqLoad(); };
  setInterval(() => { if (!document.hidden && $('#app').classList.contains('on') && D.role !== 'agent') areqLoad(true).catch(() => {}); }, 30000);
  const t0 = setInterval(() => { if ($('#app').classList.contains('on') && D.devices) { clearInterval(t0); areqLoad(true).catch(() => {}); } }, 600);

  // demo: codice dello store di esempio
  if (typeof DEMO !== 'undefined' && DEMO.settings && DEMO.settings.storeDownloaderCode === undefined) DEMO.settings.storeDownloaderCode = '7654321';
})();
