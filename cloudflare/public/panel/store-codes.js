/* KAIROS Control — codici usa e getta per lo Store (11 novembre 2026).
   - Riepilogo store (solo titolare): «🔑 Codici per lo Store» con l'interruttore «Download solo con codice», la durata
     (10, 15, 20 o 30 minuti, 2 ore o 24 ore), «Genera codice» e l'elenco dei codici (chi l'ha generato, stato, dispositivo, app).
   - «🔑 Codice usa e getta · Genera» nella riga dei codici Downloader, accanto a Kairos Store: titolare e agenti con il
     permesso «Codici per lo Store», solo con l'interruttore acceso. Apre la finestra con il codice grande, il tempo che resta,
     «Copia» e gli ultimi codici. Chiusa la finestra il codice resta nella riga, al posto di «Genera», con il tempo che
     manca, «Copia» e «Nuovo»: finché non scade o non viene usato (12 novembre 2026). Vale anche dopo aver ricaricato la pagina.
   Il codice va scritto nello Store entro la durata; al primo uso si lega a quel dispositivo, che per la stessa durata scarica
   tutte le app. Server: /api/admin/store/codes (GET elenco, POST codice nuovo) e /api/admin/store/settings { codes }.
   Usa app.js ($, $$, esc, api, toast, D). */
(() => {
  const css = document.createElement('style');
  css.textContent = `#scOv,#scPk{position:fixed;inset:0;z-index:39;background:rgba(5,8,16,.62);backdrop-filter:blur(3px);display:flex;align-items:flex-start;justify-content:center;padding:8vh 16px;overflow:auto}
#scOv .sc-box,#scPk .sc-box{width:min(460px,100%);background:var(--pane,#0e1424);border:1px solid var(--line);border-radius:18px;padding:18px;box-shadow:0 30px 80px rgba(0,0,0,.5)}
#scOv .sc-hd,#scPk .sc-hd{display:flex;align-items:center;gap:10px}#scOv .sc-hd h3,#scPk .sc-hd h3{flex:1;margin:0;font-size:18px}
#scOv .sc-code{font-size:44px;font-weight:800;letter-spacing:.18em;text-align:center;margin:16px 0 6px;color:#e0f7fb}
#scOv .sc-left{text-align:center;font-size:13px;color:var(--mut);margin-bottom:12px}#scOv .sc-left b{color:#67e8f9}
#scOv p,#scPk p{font-size:13.5px;line-height:1.5;margin:0 0 10px;color:var(--mut)}#scOv p b,#scPk p b{color:var(--txt)}
#scOv .sc-btns,#scPk .sc-btns{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;margin-top:12px}
#scOv .sc-mine{margin-top:14px;border-top:1px solid var(--line);padding-top:10px;font-size:12.5px}
#scOv .sc-mine div{display:flex;justify-content:space-between;gap:10px;padding:3px 0;color:var(--mut)}#scOv .sc-mine b{color:var(--txt)}
.sc-warn{padding:9px 12px;border-radius:12px;border:1px solid rgba(245,158,11,.45);background:rgba(245,158,11,.1);color:#fcd34d;font-size:13px;margin:6px 0 4px}
#scCard .sc-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:10px 0 4px}#scCard .sc-row .inp{width:auto;margin:0}
#scCard .sc-who{margin:8px 0 12px}#scCard .sc-who b{font-weight:600;font-size:13.5px;flex:1;min-width:180px}#scCard .sc-who .lbl{white-space:nowrap}
#scPk .sc-pk-all{display:flex;align-items:center;gap:10px;padding:10px;border-bottom:1px solid var(--line);cursor:pointer}#scPk .sc-pk-all small{margin-left:auto;color:var(--mut);font-size:12.5px}
#scPk .sc-pk-list{max-height:min(46vh,420px);overflow:auto;margin:4px 0 2px}
#scPk .sc-pk-it{display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:10px;cursor:pointer}#scPk .sc-pk-it:hover{background:rgba(255,255,255,.04)}
#scPk .sc-pk-it span{min-width:0}#scPk .sc-pk-it b{display:block;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#scPk .sc-pk-it small{display:block;color:var(--mut);font-size:12px}#scPk .sc-pk-it small.w{color:#fcd34d}
#scPk input[type=checkbox]{width:18px;height:18px;flex:none;accent-color:#22d3ee}#scPk #scPkQ{margin:0 0 6px}
#scCard .tog{margin-top:6px}#scCard td small{display:block;color:var(--mut)}
.sc-st{display:inline-block;font-size:11.5px;font-weight:700;border-radius:999px;padding:1px 8px}
.sc-st.valid{background:rgba(34,211,238,.14);color:#67e8f9}.sc-st.open{background:rgba(34,197,94,.15);color:#86efac}.sc-st.used{background:rgba(148,163,184,.15);color:#cbd5e1}.sc-st.expired{background:rgba(239,68,68,.12);color:#fca5a5}
.dlbar .dl.sc-pill b{font-family:inherit;font-size:13px;font-weight:600;letter-spacing:0}.dlbar .dl.sc-pill i{font-size:16px}#scBtn,#scCopy{white-space:nowrap}
.dlbar .dl.sc-pill b.sc-rem{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:17px;font-weight:800;letter-spacing:.14em;color:#67e8f9;white-space:nowrap}
/* menu4.js: in Clienti la riga mostra solo il codice dello Store; la voce dei codici usa e getta resta con lui */
#dlBar.dl-st-only>#scPill{display:flex!important}#dlBar.dl-st-only:has(>#scPill){display:flex!important}
/* telefono: la riga dei codici scorre di lato e questa voce sarebbe la terza, fuori dallo schermo: qui viene per prima */
@media (max-width:700px){#dlBar>#scPill{order:-1}}
.so-open.sc-lock{border-color:rgba(34,211,238,.45);background:rgba(34,211,238,.08)}.so-open.sc-lock b{color:#67e8f9}.so-open.sc-lock .dot{background:#22d3ee;box-shadow:0 0 12px #22d3ee}`;
  document.head.appendChild(css);

  const isAg = () => typeof D === 'object' && D && D.role === 'agent';
  // in assistenza il titolare vede quello che vede l'agente: il pulsante c'è se l'agente ha il permesso (il codice risulta suo)
  const can = () => typeof D === 'object' && D && (!isAg() || !!(((D.me || {}).perms || {}).stcodes));
  const isOn = () => !!(typeof D === 'object' && D && D.storeCodesOn);
  const ttlTxt = (m) => (m >= 1440 ? '24 ore' : m >= 120 ? '2 ore' : `${m} minuti`);
  const hm = (t) => new Date(t).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  const when = (t) => new Date(t).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' });
  const left = (t) => { const s = Math.max(0, Math.round((t - Date.now()) / 1000)); return s >= 3600 ? `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min` : s >= 60 ? `${Math.ceil(s / 60)} min` : `${s} s`; };
  const fmt = (c) => (c && c.length === 6 ? c.slice(0, 3) + ' ' + c.slice(3) : c || '');
  const stTxt = (r) => (r.st === 'valid' ? `valido ancora ${left(r.expires)}` : r.st === 'open' ? `in uso fino alle ${hm(r.until)}` : r.st === 'used' ? `usato alle ${hm(r.used)}` : 'scaduto senza uso');
  const stName = { valid: 'da usare', open: 'in uso', used: 'usato', expired: 'scaduto' };
  const stSub = (r) => (r.st === 'valid' ? `entro ${left(r.expires)}` : r.st === 'open' ? `fino alle ${hm(r.until)}` : r.st === 'used' ? `dalle ${hm(r.used)} alle ${hm(r.until)}` : 'mai scritto nello Store');

  /* ---------------- dati di esempio (demo) ---------------- */
  const DM = (() => {
    const t = Date.now();
    return { on: true, ttl: 30, ttls: [10, 15, 20, 30, 120, 1440], codes: [
      { id: 3, code: '482913', st: 'valid', created: t - 4 * 60e3, expires: t + 26 * 60e3, used: 0, until: 0, by: 'Brusca', mine: false, device: '', country: '', apps: [], dls: 0 },
      { id: 2, code: '', st: 'used', created: t - 3 * 3600e3, expires: t - 150 * 60e3, used: t - 170 * 60e3, until: t - 140 * 60e3, by: '', mine: true, device: 'Amazon AFTSS (Fire TV)', country: 'IT · Napoli', apps: ['Kairos Tv', 'Kairos Store'], dls: 2 },
      { id: 1, code: '', st: 'expired', created: t - 26 * 3600e3, expires: t - 25.5 * 3600e3, used: 0, until: 0, by: 'Brusca', mine: false, device: '', country: '', apps: [], dls: 0 },
    ] };
  })();
  async function demo(method, body) {
    await new Promise((r) => setTimeout(r, 120));
    if (method === 'POST') {
      const t = Date.now(), code = String(Math.floor(Math.random() * 1e6)).padStart(6, '0');
      DM.codes.unshift({ id: DM.codes.length + 1, code, st: 'valid', created: t, expires: t + DM.ttl * 60e3, used: 0, until: 0, by: '', mine: !isAg(), device: '', country: '', apps: [], dls: 0 });
      return { code, created: t, expires: t + DM.ttl * 60e3, ttl: DM.ttl, on: DM.on };
    }
    if (method === 'PUT') { Object.assign(DM, body.codes || {}); return { settings: { codes: { on: DM.on, ttl: DM.ttl } } }; }
    return JSON.parse(JSON.stringify(DM));
  }
  const cApi = (method, body) => (D.demo ? demo(method, body) : api(method, '/admin/store/codes', body));
  const setApi = (codes) => (D.demo ? demo('PUT', { codes }) : api('PUT', '/admin/store/settings', { codes }));

  /* ---------------- finestra del codice ---------------- */
  let O = null; // { r, timer, mine }
  function close() { if (!O) return; clearInterval(O.timer); O = null; const ov = document.getElementById('scOv'); if (ov) ov.remove(); document.removeEventListener('keydown', onKey, true); }
  const onKey = (e) => { if (e.key === 'Escape' && O) { e.preventDefault(); e.stopPropagation(); close(); } };
  function paint() {
    const ov = document.getElementById('scOv'); if (!ov || !O) return;
    const r = O.r, gone = r.expires <= Date.now();
    ov.innerHTML = `<div class="sc-box" role="dialog" aria-modal="true" aria-labelledby="scT"><div class="sc-hd"><h3 id="scT">🔑 Codice per lo Store</h3><button type="button" class="btn sm" data-scx title="Chiudi">✕</button></div>
      <div class="sc-code mono" id="scCode">${gone ? '—' : esc(fmt(r.code))}</div>
      <div class="sc-left" id="scLeft">${gone ? 'Scaduto: generane uno nuovo' : `da usare entro <b>${esc(left(r.expires))}</b>`}</div>
      <p>Il cliente lo scrive nello Store quando preme <b>Installa</b>. Vale <b>una volta sola</b>: dopo, su quel dispositivo scarica tutte le app che vuole per <b>${esc(ttlTxt(r.ttl))}</b>.</p>
      ${gone ? '' : '<p>Se chiudi questa finestra il codice <b>resta accanto a «Genera»</b> finché non scade o non viene usato.</p>'}
      ${r.on === false ? '<div class="sc-warn">⚠️ Adesso lo Store è aperto: il codice serve solo quando è acceso «Download solo con codice» (Store → Riepilogo store).</div>' : ''}
      <div class="sc-btns"><button type="button" class="btn" data-sccopy>Copia</button><button type="button" class="btn" data-scnew>Nuovo codice</button><button type="button" class="btn pri" data-scx>Fatto</button></div>
      ${O.mine && O.mine.length ? `<div class="sc-mine"><b style="display:block;margin-bottom:4px">I tuoi ultimi codici</b>${O.mine.slice(0, 5).map((x) => `<div><span>${x.code ? `<b class="mono">${esc(fmt(x.code))}</b>` : `<span class="mono">••• •••</span>`} · ${esc(when(x.created))}</span><span>${esc(stTxt(x))}${x.apps && x.apps.length ? ' · ' + esc(x.apps.join(', ')) : ''}</span></div>`).join('')}</div>` : ''}</div>`;
  }
  function tick() {
    if (!O) return;
    const l = document.getElementById('scLeft'); if (!l) return;
    if (O.r.expires <= Date.now()) { paint(); clearInterval(O.timer); return; }
    l.innerHTML = `da usare entro <b>${esc(left(O.r.expires))}</b>`;
  }
  async function gen() {
    if (!can()) return;
    try {
      const r = await cApi('POST');
      R = { code: r.code, expires: r.expires }; rT = Date.now(); pillPaint();
      if (!O) {
        O = { r, timer: 0, mine: null };
        const ov = document.createElement('div'); ov.id = 'scOv'; document.body.appendChild(ov);
        ov.addEventListener('click', onClick);
        document.addEventListener('keydown', onKey, true);
      } else { O.r = r; clearInterval(O.timer); }
      paint();
      O.timer = setInterval(tick, 1000);
      cApi('GET').then((d) => { if (!O) return; O.mine = (d.codes || []).filter((x) => x.mine || isAg()).filter((x) => x.code !== r.code); paint(); }).catch(() => {});
      if (document.getElementById('v-store') && document.getElementById('v-store').classList.contains('on')) refresh(true);
    } catch (e) { toast(e.message || 'Codice non generato', 1); }
  }
  function onClick(e) {
    if (e.target.id === 'scOv' || e.target.closest('[data-scx]')) return close();
    if (e.target.closest('[data-scnew]')) return gen();
    if (e.target.closest('[data-sccopy]') && O) copy(O.r.code);
  }
  const copy = (t) => (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => toast('Codice copiato: ' + fmt(t)), () => toast('Codice: ' + fmt(t)));

  /* ---------------- il codice ricordato: l'ultimo mio ancora da usare, finché non scade ----------------
     Arriva da «Genera» e dall'elenco del server (così c'è anche dopo aver ricaricato la pagina o su un altro computer).
     Riletto ogni 30 secondi solo mentre c'è un codice in vista: quando il cliente lo usa, sparisce. */
  let R = null, rT = 0, rBusy = false, rFirst = false;
  const rLive = () => (R && R.expires > Date.now() ? R : (R = null));
  async function recall(force) {
    if (!(can() && isOn()) || rBusy) return;
    if (!force && (rFirst && !R || Date.now() - rT < 30000 || document.hidden)) return;
    rBusy = true; rFirst = true; rT = Date.now();
    try {
      const d = await cApi('GET');
      const v = (d.codes || []).find((x) => x.st === 'valid' && x.code && (x.mine || isAg()));
      R = v ? { code: v.code, expires: v.expires } : null; pillPaint();
    } catch {} finally { rBusy = false; }
  }
  const PILL0 = `<i>🔑</i><div><small>Codice usa e getta · Kairos Store</small><b>Per scaricare dallo Store</b></div><button class="btn sm pri" type="button" id="scBtn" title="Codice di 6 cifre da dare al cliente: lo scrive nello Store quando preme Installa">Genera</button>`;
  function pillPaint() {
    const b = document.getElementById('scPill'); if (!b) return;
    const r = rLive(), key = r ? r.code : '-';
    if (b.dataset.k !== key) {
      b.dataset.k = key;
      b.innerHTML = r ? `<i>🔑</i><div><small id="scRemS"></small><b class="sc-rem" id="scRemC" title="Codice ancora da usare: resta qui finché non scade o non viene usato">${esc(fmt(r.code))}</b></div><button class="btn sm" type="button" id="scCopy" title="Copia il codice">Copia</button><button class="btn sm pri" type="button" id="scBtn" title="Genera un codice nuovo (questo resta valido finché non scade)">Nuovo</button>` : PILL0;
      b.querySelector('#scBtn').onclick = gen;
      const c = b.querySelector('#scCopy'); if (c) c.onclick = () => copy(r.code);
    }
    if (r) { const s = b.querySelector('#scRemS'), t = `Codice Store · scade tra ${left(r.expires)}`; if (s && s.textContent !== t) s.textContent = t; }
  }

  /* ---------------- «🔑 Codice Store» accanto ai codici Downloader (riga #dlBar) ----------------
     addons-panel.js ridisegna la riga a ogni aggiornamento del pannello: un osservatore rimette subito la voce (niente sfarfallii) */
  function pill() {
    const bar = document.getElementById('dlBar');
    let b = document.getElementById('scPill');
    if (!(can() && isOn())) { if (b) b.remove(); return; }
    if (!bar || b) return;
    b = document.createElement('div'); b.className = 'dl sc-pill'; b.id = 'scPill';
    const st = bar.querySelector('[data-dlk="ST"]');
    if (st) st.after(b); else bar.appendChild(b);
    pillPaint();
  }
  let obs = null;
  function watch() {
    const bar = document.getElementById('dlBar');
    if (bar && !obs) { obs = new MutationObserver(() => { if (!document.getElementById('scPill') && can() && isOn()) pill(); }); obs.observe(bar, { childList: true }); }
    pill(); pillPaint();
    if (document.getElementById('scPill')) recall();
  }
  setInterval(watch, 1500);

  /* ---------------- Riepilogo store (solo titolare) ---------------- */
  const V = document.getElementById('v-store');
  /* ---------------- «Chi può generarli»: gli agenti con il permesso «Codici per lo Store», scelti da qui ---------------- */
  const ags = () => (typeof D === 'object' && D && Array.isArray(D.agents) ? D.agents : []);
  const agName = (a) => a.username || 'Agente ' + a.id;
  const hasSc = (a) => !!((a.perms || {}).stcodes);
  // un sotto-agente lo usa solo se ce l'ha anche chi lo gestisce (come nel server); «need» = il primo sopra di lui che non ce l'ha
  const needOf = (a, by, has) => { for (let x = by.get(a.parentId), n = 0; x && n < 20; x = by.get(x.parentId), n++) if (!has(x)) return x; return null; };
  function whoTxt() {
    const L = ags(), by = new Map(L.map((a) => [a.id, a]));
    if (!L.length) return 'Solo tu (non hai agenti)';
    const yes = L.filter((a) => hasSc(a) && !needOf(a, by, hasSc)), names = yes.map(agName);
    if (!yes.length) return `Solo tu: nessun agente su ${L.length}`;
    return `Tu e ${yes.length === 1 ? '1 agente' : yes.length + ' agenti'} su ${L.length}: ${names.slice(0, 5).join(', ')}${names.length > 5 ? ` +${names.length - 5}` : ''}`;
  }
  let PK = null; // { sel: Set di id, by }
  function pkClose() { const ov = document.getElementById('scPk'); if (ov) ov.remove(); PK = null; document.removeEventListener('keydown', pkKey, true); }
  const pkKey = (e) => { if (e.key === 'Escape' && PK) { e.preventDefault(); e.stopPropagation(); pkClose(); } };
  function pkPaint() {
    const ov = document.getElementById('scPk'); if (!ov || !PK) return;
    const q = ((ov.querySelector('#scPkQ') || {}).value || '').trim().toLowerCase(), has = (a) => PK.sel.has(a.id);
    let shown = 0, on = 0;
    ov.querySelectorAll('.sc-pk-it').forEach((row) => {
      const a = PK.by.get(+row.dataset.id), hide = !!q && !row.dataset.n.includes(q);
      row.hidden = hide; row.style.display = hide ? 'none' : '';
      const c = row.querySelector('input'); c.checked = has(a);
      if (!hide) { shown++; if (c.checked) on++; }
      const up = PK.by.get(a.parentId), need = c.checked ? needOf(a, PK.by, has) : null, sm = row.querySelector('small');
      sm.textContent = need ? `Vale quando lo dai anche a ${agName(need)}` : up ? `Sotto ${agName(up)}` : '';
      sm.className = need ? 'w' : ''; sm.style.display = sm.textContent ? '' : 'none';
    });
    const all = ov.querySelector('#scPkAll'); all.checked = shown > 0 && on === shown; all.indeterminate = on > 0 && on < shown;
    ov.querySelector('#scPkN').textContent = `${PK.sel.size} su ${PK.by.size}`;
  }
  function pick() {
    const L = ags(); if (!L.length || PK) return;
    const by = new Map(L.map((a) => [a.id, a])), cmp = (a, b) => agName(a).localeCompare(agName(b), 'it');
    // ogni agente seguito dai suoi sotto-agenti
    const flat = [], walk = (pid, lvl) => L.filter((a) => (a.parentId || 0) === pid).sort(cmp).forEach((a) => { flat.push([a, lvl]); if (lvl < 20) walk(a.id, lvl + 1); });
    walk(0, 0); L.forEach((a) => { if (!flat.some((x) => x[0] === a)) flat.push([a, 0]); });
    PK = { sel: new Set(L.filter(hasSc).map((a) => a.id)), by };
    const ov = document.createElement('div'); ov.id = 'scPk';
    ov.innerHTML = `<div class="sc-box" role="dialog" aria-modal="true" aria-labelledby="scPkT"><div class="sc-hd"><h3 id="scPkT">🔑 Chi può generare i codici</h3><button type="button" class="btn sm" data-pkx title="Chiudi">✕</button></div>
      <p style="margin-top:10px">Gli agenti spuntati trovano <b>«🔑 Codice usa e getta · Genera»</b> nel loro pannello. Tu li generi sempre.</p>
      ${flat.length > 8 ? '<input class="inp" id="scPkQ" placeholder="Cerca agente" autocomplete="off" aria-label="Cerca agente">' : ''}
      <label class="sc-pk-all"><input type="checkbox" id="scPkAll"><b>Tutti gli agenti</b><small id="scPkN"></small></label>
      <div class="sc-pk-list">${flat.map(([a, lvl]) => `<label class="sc-pk-it" data-id="${a.id}" data-n="${esc(agName(a).toLowerCase())}" style="padding-left:${10 + Math.min(lvl, 3) * 20}px"><input type="checkbox"><span><b>${esc(agName(a))}</b><small></small></span></label>`).join('')}</div>
      <div class="sc-btns"><button type="button" class="btn" data-pkx>Annulla</button><button type="button" class="btn pri" id="scPkSave">Salva</button></div></div>`;
    document.body.appendChild(ov);
    ov.addEventListener('click', (e) => { if (e.target === ov || e.target.closest('[data-pkx]')) pkClose(); });
    ov.querySelectorAll('.sc-pk-it input').forEach((c) => (c.onchange = () => { const id = +c.closest('.sc-pk-it').dataset.id; if (c.checked) PK.sel.add(id); else PK.sel.delete(id); pkPaint(); }));
    ov.querySelector('#scPkAll').onchange = (e) => { ov.querySelectorAll('.sc-pk-it').forEach((row) => { if (row.hidden) return; const id = +row.dataset.id; if (e.target.checked) PK.sel.add(id); else PK.sel.delete(id); }); pkPaint(); };
    const q = ov.querySelector('#scPkQ'); if (q) q.oninput = pkPaint;
    ov.querySelector('#scPkSave').onclick = pkSave;
    document.addEventListener('keydown', pkKey, true);
    pkPaint();
  }
  async function pkSave() {
    if (!PK) return;
    const L = ags(), sel = PK.sel, add = L.filter((a) => sel.has(a.id) && !hasSc(a)).map((a) => a.id), del = L.filter((a) => !sel.has(a.id) && hasSc(a)).map((a) => a.id);
    if (!add.length && !del.length) return pkClose();
    const btn = document.getElementById('scPkSave'); btn.disabled = true;
    try {
      let skipped = 0;
      if (D.demo) L.forEach((a) => { a.perms = { ...(a.perms || {}), stcodes: sel.has(a.id) }; });
      else {
        for (const [ids, v] of [[add, true], [del, false]]) for (let i = 0; i < ids.length; i += 200) { const r = await api('POST', '/admin/agents/bulk', { ids: ids.slice(i, i + 200), flags: { stcodes: v } }); skipped += ((r && r.skipped) || []).length; }
        try { const r = await api('GET', '/admin/agents'); D.agents = r.agents || []; } catch {}
      }
      pkClose(); render();
      const n = ags().filter(hasSc).length;
      toast(skipped ? `Salvato, ma ${skipped} ${skipped === 1 ? 'agente non è stato cambiato' : 'agenti non sono stati cambiati'}` : n ? `Codici per lo Store: oltre a te ${n === 1 ? 'li genera 1 agente' : 'li generano ' + n + ' agenti'}` : 'Codici per lo Store: ora li generi solo tu', skipped ? 1 : 0);
    } catch (e) { btn.disabled = false; toast(e.message || 'Errore', 1); }
  }

  const S = { d: null, busy: false, t: 0 };
  function card() {
    if (!V || document.getElementById('scCard')) return;
    const first = V.querySelector('.card'); if (!first) return;
    const el = document.createElement('div'); el.className = 'card glass'; el.id = 'scCard'; el.style.marginBottom = '18px';
    el.innerHTML = `<div class="hd"><h3>🔑 Codici per lo Store<small>Per scaricare dallo Store serve un codice di 6 cifre che dai tu o un agente</small></h3><button class="btn sm pri" id="scGen" type="button">Genera codice</button></div>
      <div class="tog" id="scOn"><div><b>Download solo con codice</b><small>Spento: lo Store resta aperto come adesso. Acceso: chi preme Installa scrive il codice; vale su quel dispositivo per tutte le app, per la durata scelta qui sotto.</small></div><i></i></div>
      <div class="sc-row"><label class="lbl" for="scTtl" style="margin:0">Il codice vale</label><select class="inp" id="scTtl"><option value="10">10 minuti</option><option value="15">15 minuti</option><option value="20">20 minuti</option><option value="30">30 minuti</option><option value="120">2 ore</option><option value="1440">24 ore</option></select><small class="mut">per scriverlo nello Store e, dopo, per scaricare su quel dispositivo</small></div>
      <div class="sc-row sc-who"><span class="lbl" style="margin:0">Chi può generarli</span><b id="scWho">Tu</b><button class="btn sm" type="button" id="scPick">Scegli agenti</button></div>
      <div class="tbl-wrap"><table class="tbl" style="width:100%"><thead><tr><th>Codice</th><th>Generato da</th><th>Creato</th><th>Stato</th><th>Dispositivo</th><th>App scaricate</th></tr></thead><tbody id="scList"><tr><td colspan="6" class="mut">Caricamento…</td></tr></tbody></table></div>
      <small class="mut" style="display:block;margin-top:8px">Gli agenti generano i codici solo con il permesso «Codici per lo Store»: lo dai qui sopra con «Scegli agenti», oppure da Agenti → scheda dell'agente. Il codice protegge lo Store, non i file: gli APK restano raggiungibili dai link diretti, che servono agli aggiornamenti delle app.</small>`;
    first.after(el);
    el.querySelector('#scGen').onclick = gen;
    el.querySelector('#scPick').onclick = pick;
    el.querySelector('#scOn').onclick = async () => {
      const on = !(S.d && S.d.on);
      try { const r = await setApi({ on }); const c = (r.settings && r.settings.codes) || { on, ttl: S.d ? S.d.ttl : 30 }; if (S.d) { S.d.on = c.on; S.d.ttl = c.ttl; } D.storeCodesOn = c.on; render(); pill(); toast(c.on ? `Download solo con codice: acceso (vale ${ttlTxt(c.ttl)})` : 'Download liberi: lo Store è aperto come prima'); }
      catch (e) { toast(e.message || 'Errore', 1); }
    };
    el.querySelector('#scTtl').onchange = async (e) => {
      const ttl = +e.target.value;
      try { const r = await setApi({ ttl }); const c = (r.settings && r.settings.codes) || { ttl }; if (S.d) S.d.ttl = c.ttl; render(); toast('I codici nuovi valgono ' + ttlTxt(c.ttl)); }
      catch (err) { toast(err.message || 'Errore', 1); render(); }
    };
  }
  /** il riquadro verde «Store aperto» di store-dl.js: con i codici accesi dice che serve il codice */
  function banner(on) {
    const b = V && V.querySelector('.so-open'); if (!b) return;
    const box = b.querySelector('div'); if (!box) return;
    if (!b.dataset.open) b.dataset.open = box.innerHTML;
    b.classList.toggle('sc-lock', !!on);
    box.innerHTML = on ? `<b>Download solo con codice</b>: chi preme <b>Installa</b> nello Store scrive il codice di 6 cifre che gli dai tu o un agente. Il codice vale una volta, su quel dispositivo, per tutte le app e per ${esc(ttlTxt((S.d && S.d.ttl) || 30))}. Per tornare allo Store aperto spegni l'interruttore qui sotto.` : b.dataset.open;
  }
  function render() {
    const d = S.d; if (!d) return;
    banner(d.on);
    const el = document.getElementById('scCard'); if (!el) return;
    el.querySelector('#scOn').classList.toggle('on', !!d.on);
    const sel = el.querySelector('#scTtl'); if (document.activeElement !== sel) sel.value = String(d.ttl || 30);
    const who = whoTxt(); if (el.querySelector('#scWho').textContent !== who) el.querySelector('#scWho').textContent = who;
    el.querySelector('#scPick').hidden = !ags().length;
    const L = d.codes || [];
    el.querySelector('#scList').innerHTML = L.length ? L.map((r) => `<tr><td>${r.code ? `<b class="mono">${esc(fmt(r.code))}</b>` : '<span class="mono mut">••• •••</span>'}</td><td>${esc(r.mine ? 'Tu' : r.by || '—')}</td><td>${esc(when(r.created))}</td><td><span class="sc-st ${esc(r.st)}">${esc(stName[r.st] || r.st)}</span><small>${esc(stSub(r))}</small></td><td>${r.device || r.country ? `${esc(r.device || 'Dispositivo')}<small>${esc(r.country || '')}</small>` : '<span class="mut">—</span>'}</td><td>${r.apps && r.apps.length ? esc(r.apps.join(', ')) : '<span class="mut">—</span>'}</td></tr>`).join('')
      : '<tr><td colspan="6" class="mut">Nessun codice negli ultimi 30 giorni</td></tr>';
  }
  async function refresh(force) {
    if (isAg() || !V || S.busy) return;
    card();
    if (!force && S.d && Date.now() - S.t < 20000) return;
    S.busy = true;
    try { S.d = await cApi('GET'); S.t = Date.now(); if (typeof D === 'object' && D) D.storeCodesOn = !!S.d.on; render(); }
    catch (e) { if (force && V.classList.contains('on')) toast(e.message, 1); }
    finally { S.busy = false; }
  }
  if (V) {
    new MutationObserver(() => { if (V.classList.contains('on')) refresh(true); }).observe(V, { attributes: true, attributeFilter: ['class'] });
    setInterval(() => { if (V.classList.contains('on') && !document.hidden) refresh(); }, 30000);
  }

  window.KXStoreCodes = { gen, close, refresh, pick, recall };
})();
