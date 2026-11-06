/* KAIROS — pagina "Download store": autorizzazione dei download dello Store.
   Usa le funzioni di app.js ($, $$, esc, api, toast, ago, D, TITLES). In demo usa dati di esempio. */
(() => {
  if (typeof TITLES === 'object') TITLES.store = 'Download store';
  const V = $('#v-store'); if (!V) return;

  const ST = { pending: ['In attesa', 'pending'], approved: ['Autorizzata', 'active'], used: ['Scaricata', 'active'], denied: ['Rifiutata', 'disabled'], expired: ['Scaduta', 'expired'], revoked: ['Revocata', 'disabled'] };
  const VIA = { email: "dall'email", panel: 'dal pannello', code: 'con il codice', auto: 'approvazione spenta', tries: 'troppi codici errati', telegram: 'da Telegram', push: 'dalla notifica' };
  const IC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v11M7 9l5 5 5-5"/><rect x="4" y="17" width="16" height="4" rx="1.5"/></svg>';
  const S = { data: null, seen: null, busy: false };

  const css = document.createElement('style');
  css.textContent = `
.sd-req{display:flex;align-items:center;gap:12px;padding:12px;border-radius:14px;transition:.2s;flex-wrap:wrap}
.sd-req:hover{background:rgba(255,255,255,.04)}
.sd-req.on{background:color-mix(in srgb,var(--warn) 7%,transparent);border:1px solid color-mix(in srgb,var(--warn) 25%,transparent);margin-bottom:8px}
.sd-req .ic{width:40px;height:40px;border-radius:12px;display:grid;place-items:center;flex:none;background:rgba(255,255,255,.05);border:1px solid var(--line)}
.sd-req .ic svg{width:18px}
.sd-req .tx{flex:1;min-width:180px}
.sd-req .tx b{display:block;font-size:15px}
.sd-req .tx small{display:block;color:var(--mut);font-size:12px;word-break:break-word}
.sd-code{font-size:22px;font-weight:500;letter-spacing:.18em;padding:6px 12px;border-radius:10px;background:rgba(0,0,0,.35);border:1px solid var(--line)}
.sd-act{display:flex;gap:8px}
.sd-sub{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--mut);font-weight:600;margin:18px 0 6px}
.sd-warn{font-size:13.5px;margin:0 0 12px;padding:12px 14px;border-radius:12px;border:1px solid rgba(239,68,68,.55);background:rgba(239,68,68,.12);color:#fecaca;line-height:1.45}.sd-now{font-size:13.5px;margin:0 0 10px}
.sd-note{font-size:13px;margin-top:10px;padding:10px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.1);color:var(--mut);line-height:1.45}
.sd-note b{color:var(--txt)}
.sd-how{padding-left:20px;color:var(--mut);font-size:14px;line-height:1.55}.sd-how li{margin:4px 0}.sd-how b{color:var(--txt)}
.sd-dev{display:flex;align-items:center;gap:12px;padding:12px;border-radius:14px;flex-wrap:wrap;transition:.2s}
.sd-dev:hover{background:rgba(255,255,255,.04)}
.sd-dev.blk{background:color-mix(in srgb,var(--bad) 7%,transparent);border:1px solid color-mix(in srgb,var(--bad) 25%,transparent);margin-bottom:8px}
.sd-dev .ic{width:40px;height:40px;border-radius:12px;display:grid;place-items:center;flex:none;background:rgba(255,255,255,.05);border:1px solid var(--line)}
.sd-dev .ic svg{width:18px}
.sd-dev .tx{flex:1;min-width:160px}.sd-dev .tx b{display:block;font-size:15px}.sd-dev .tx small{display:block;color:var(--mut);font-size:12px;word-break:break-word}
.sd-dev .tog{margin:0;padding:8px 12px;gap:10px;flex:none}.sd-dev .tog b{font-size:13px}
.sd-dev .tog.on i{background:linear-gradient(90deg,var(--bad),#ff8a5b);box-shadow:0 0 16px -2px var(--bad)}
.sd-ag{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 0;border-top:1px solid var(--line)}
.sd-ag:first-child{border-top:0}
.sd-ag .nm{flex:1;min-width:120px}.sd-ag .nm b{display:block;font-size:14px}.sd-ag .nm small{display:block;color:var(--mut);font-size:12px}
.sd-ag .inp{flex:1.4;min-width:170px;padding:10px 12px}
.sd-ag .tog{margin:0;padding:8px 12px;flex:none}.sd-ag .tog b{font-size:13px}
.nf-row{padding:14px;border-radius:14px;border:1px solid var(--line);background:rgba(255,255,255,.02);margin-bottom:12px}
.nf-row h4{margin:0 0 4px;font-size:15px;display:flex;align-items:center;gap:8px}
.nf-row p{margin:0 0 10px;color:var(--mut);font-size:13px;line-height:1.45}.nf-row p b{color:var(--txt)}
.nf-btns{display:flex;gap:8px;flex-wrap:wrap}
.nf-ok{color:var(--ok,#3dffb0)}.nf-warn{color:var(--warn)}
.sd-ag.off .nm b{color:var(--mut)}
.sd-seller{display:flex;gap:16px;align-items:center;flex-wrap:wrap;padding:12px 14px;margin:0 0 12px;border:1px dashed var(--line);border-radius:12px;background:var(--card2,rgba(255,255,255,.03))}.sd-seller b.mono{display:block;font-size:26px;letter-spacing:4px;line-height:1.1}
@media (max-width:820px){.sd-act{width:100%}.sd-act .btn{flex:1}.sd-dev .tog{width:100%;justify-content:space-between}}`;
  document.head.appendChild(css);

  V.innerHTML = `<div class="g2">
  <div class="card glass">
    <div class="hd"><h3>Richieste di download<small>I clienti chiedono il tuo permesso prima di scaricare un'app dallo store</small></h3><button class="btn sm" id="sdReload">Aggiorna</button></div>
    <div id="sdSeller"></div>
    <div id="sdPend"></div>
    <div class="sd-sub">Storico · ultimi 30 giorni</div>
    <div id="sdHist"></div>
    <button class="btn sm" id="sdClear" style="margin-top:12px">Svuota storico</button>
  </div>
  <div>
    <div class="card glass" style="margin-bottom:18px">
      <div class="hd"><h3>Dispositivi<small>Chi ha chiesto di scaricare negli ultimi 30 giorni. Un dispositivo bloccato non può più inviare richieste</small></h3></div>
      <div id="sdDev"></div>
    </div>
    <div class="card glass">
      <div class="hd"><h3>Approvazione<small>Decidi tu chi può scaricare</small></h3></div>
      <div class="sd-warn" id="sdWarn" style="display:none"></div>
      <div class="tog" id="sdOn"><div><b>Chiedi la mia autorizzazione</b><small>Spento: i download partono subito, ma restano registrati qui</small></div><i></i></div>
      <label class="lbl">La tua email per gli avvisi</label>
      <input class="inp" id="sdMail" type="email" autocomplete="email" placeholder="la stessa del tuo account Resend">
      <div class="sd-note" id="sdMailSt"></div>
      <button class="btn pri" id="sdSave" style="margin-top:14px">Salva</button>
    </div>
    <div class="card glass" id="sdClCard">
      <div class="hd"><h3>🌙 Orari di chiusura<small>In questa fascia (ora italiana) nessuno può chiedere o scaricare app dallo store: vedono il tuo messaggio</small></h3></div>
      <div class="sd-now" id="sdClNow"></div>
      <div class="tog" id="sdCl"><div><b>Chiudi lo store dalle… alle…</b><small>Vale ogni giorno; la fascia può passare la mezzanotte (es. dalle 23:00 alle 07:00)</small></div><i></i></div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:10px"><label class="mut" style="font-size:13px">Dalle</label><input class="inp" id="sdClF" type="time" value="23:00" style="width:auto;margin:0"><label class="mut" style="font-size:13px">alle</label><input class="inp" id="sdClT" type="time" value="07:00" style="width:auto;margin:0"></div>
      <label class="lbl">Messaggio per i clienti (facoltativo)</label><input class="inp" id="sdClM" maxlength="200" placeholder="Lo store è chiuso dalle 23:00 alle 07:00: riprova più tardi.">
      <button class="btn pri" id="sdClSave" style="margin-top:14px">Salva orari</button>
    </div>
    <div class="card glass" style="margin-top:18px" id="nfCard">
      <div class="hd"><h3>Avvisi su Telegram e sul telefono<small>Gratis: ricevi ogni richiesta e decidi con un tocco</small></h3></div>
      <div id="nfBody"><div class="emptyc">Caricamento…</div></div>
    </div>
    <div class="card glass" style="margin-top:18px" id="sdSmsCard">
      <div class="hd"><h3>Codici via SMS<small>Il codice di ogni richiesta arriva anche per SMS a te e agli agenti che scegli tu</small></h3></div>
      <div class="tog" id="smsOn" role="switch" tabindex="0"><div><b>Invia il codice via SMS</b><small>Insieme all'email, appena un cliente chiede un download</small></div><i></i></div>
      <label class="lbl">Il tuo numero</label>
      <input class="inp" id="smsOwner" type="tel" inputmode="tel" autocomplete="tel" placeholder="+39 333 1234567">
      <div class="sd-sub">Agenti</div>
      <div id="smsAgents"></div>
      <div class="tog" id="smsLink" role="switch" tabindex="0" style="margin-top:12px"><div><b>Aggiungi il link «Autorizza»</b><small>Si autorizza con un tocco, ma l'SMS è più lungo e costa circa il doppio</small></div><i></i></div>
      <label class="lbl">Massimo SMS al giorno</label>
      <input class="inp" id="smsDay" type="number" min="1" max="500" step="1" style="max-width:160px">
      <div class="sd-note" id="smsSt"></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px"><button class="btn pri" id="smsSave">Salva</button><button class="btn" id="smsTest">Invia SMS di prova al mio numero</button></div>
    </div>
    <div class="card glass" style="margin-top:18px">
      <div class="hd"><h3>Come funziona</h3></div>
      <ol class="sd-how">
        <li>Il cliente preme <b>Installa</b> nello store e invia la richiesta.</li>
        <li>Ti arriva un'email con l'app, il dispositivo e un <b>codice di 6 cifre</b>; la richiesta compare anche qui.</li>
        <li>Premi <b>Autorizza</b> (qui o nell'email) e il download sul dispositivo parte da solo. In alternativa detta il codice al cliente.</li>
        <li>Se non rispondi, la richiesta scade dopo 24 ore. Dopo l'ok il cliente ha 30 minuti per scaricare: <b>ogni autorizzazione vale per una sola app e un solo download</b>, per reinstallare dovrà chiedertela di nuovo.</li>
        <li>Hai cambiato idea? Premi <b>Revoca</b> su un'autorizzazione non ancora usata. Con <b>Blocca dispositivo</b> quel dispositivo non può più chiederti nulla finché non lo sblocchi.</li>
      </ol>
    </div>
  </div>
</div>`;

  /* ---------------- dati di esempio (demo) ---------------- */
  const DM = (() => {
    const t = Date.now();
    return {
      settings: { approval: true, ownerEmail: 'tuo@email.it', blocked: ['demo-did-mt-firetv-000000'], sms: { on: true, owner: '+393331234567', link: false, perDay: 50, agents: [{ id: 2, phone: '+393409876543', on: true }] } },
      mail: { resend: true, envEmail: false, links: true, sentToday: 3, limit: 90 },
      sms: { ready: true, sentToday: 5, agents: [{ id: 2, username: 'luca', store: true, active: true }, { id: 3, username: 'sara', store: false, active: true }] },
      sellerCode: 'K7M4',
      requests: [
        { id: 'demo-req-0001', app: 'IboPro', did: 'demo-did-marco-firetv-0000', device: 'Amazon AFTKA (Fire TV)', note: 'Marco', country: 'IT · Milano', code: '482913', status: 'pending', tries: 0, uses: 0, created: t - 90e3 },
        { id: 'demo-req-0002', app: 'TiviMate', did: 'demo-did-xiaomi-tv-000000', device: 'Xiaomi MiTV-AXSO0 (Android TV)', note: '', country: 'IT', code: '105377', status: 'pending', sellerName: 'luca', tries: 1, uses: 0, created: t - 11 * 60e3 },
        { id: 'demo-req-0006', app: 'OraPlayer', did: 'demo-did-marco-firetv-0000', device: 'Amazon AFTKA (Fire TV)', note: 'Marco', country: 'IT · Milano', code: '', status: 'approved', via: 'panel', tries: 0, uses: 0, created: t - 6 * 60e3, decided: t - 4 * 60e3 },
        { id: 'demo-req-0003', app: 'OrbixPlay', did: 'demo-did-giulia-phone-0000', device: 'Samsung SM-A546B', note: 'Giulia', country: 'IT · Roma', code: '', status: 'used', via: 'email', tries: 0, uses: 1, created: t - 3 * 3600e3, decided: t - 3 * 3600e3 + 120e3 },
        { id: 'demo-req-0007', app: 'IboOne', did: 'demo-did-giulia-phone-0000', device: 'Samsung SM-A546B', note: 'Giulia', country: 'IT · Roma', code: '', status: 'revoked', via: 'code', tries: 0, uses: 0, created: t - 5 * 3600e3, decided: t - 5 * 3600e3 + 60e3 },
        { id: 'demo-req-0004', app: 'MT', did: 'demo-did-mt-firetv-000000', device: 'Amazon AFTMM (Fire TV)', note: '', country: 'DE', code: '', status: 'denied', via: 'panel', tries: 0, uses: 0, created: t - 26 * 3600e3, decided: t - 25 * 3600e3 },
        { id: 'demo-req-0005', app: 'Kairos App', did: 'demo-did-bar-centrale-0000', device: 'Amazon AFTSS (Fire TV)', note: 'Bar Centrale', country: 'IT', code: '', status: 'expired', via: '', tries: 0, uses: 0, created: t - 50 * 3600e3 },
      ],
    };
  })();
  function demoDevices() {
    const by = new Map();
    for (const r of [...DM.requests].sort((a, b) => b.created - a.created)) {
      let d = by.get(r.did);
      if (!d) { d = { did: r.did, device: r.device, note: r.note, country: r.country, last: r.created, requests: 0, downloads: 0, pending: 0, blocked: DM.settings.blocked.includes(r.did), trusted: (DM.settings.trusted || []).includes(r.did) }; by.set(r.did, d); }
      d.requests++; if (r.uses) d.downloads++; if (r.status === 'pending') d.pending++;
    }
    for (const did of DM.settings.blocked) if (!by.has(did)) by.set(did, { did, device: '', note: '', country: '', last: 0, requests: 0, downloads: 0, pending: 0, blocked: true });
    return [...by.values()].sort((a, b) => (+b.blocked - +a.blocked) || (b.last - a.last));
  }
  async function demo(method, path, body) {
    await new Promise((r) => setTimeout(r, 120));
    if (path === '' && method === 'GET') return { ...DM, pending: DM.requests.filter((r) => r.status === 'pending').length, devices: demoDevices() };
    if (path === '/settings') { Object.assign(DM.settings, body); return { settings: DM.settings }; }
    if (path === '/sms/test') return { ok: true, to: '+39•••567' };
    if (path === '' && method === 'DELETE') { DM.requests = DM.requests.filter((r) => r.status === 'pending'); return { ok: true }; }
    if (path === '/device/trust') {
      DM.settings.trusted = (DM.settings.trusted || []).filter((d) => d !== body.did);
      if (body.trusted !== false) { DM.settings.trusted.unshift(body.did); DM.settings.blocked = DM.settings.blocked.filter((d) => d !== body.did); }
      return { ok: true, did: body.did, trusted: body.trusted !== false, settings: DM.settings };
    }
    if (path === '/device/block') {
      DM.settings.blocked = DM.settings.blocked.filter((d) => d !== body.did);
      if (body.blocked !== false) { DM.settings.trusted = (DM.settings.trusted || []).filter((d) => d !== body.did); DM.settings.blocked.unshift(body.did); DM.requests.forEach((r) => { if (r.did === body.did && (r.status === 'pending' || r.status === 'approved')) Object.assign(r, { status: 'revoked', code: '', decided: Date.now() }); }); }
      return { ok: true, did: body.did, blocked: body.blocked !== false, settings: DM.settings };
    }
    const m = path.match(/^\/(.+)\/(approve|deny|revoke)$/);
    if (m) {
      const r = DM.requests.find((x) => x.id === m[1]);
      if (m[2] === 'revoke') { if (!r || (r.status !== 'pending' && r.status !== 'approved')) throw new Error('Questa richiesta non si può più revocare'); Object.assign(r, { status: 'revoked', decided: Date.now(), code: '' }); return { ok: true, status: 'revoked' }; }
      if (!r || r.status !== 'pending') throw new Error('La richiesta non è più in attesa'); Object.assign(r, { status: m[2] === 'approve' ? 'approved' : 'denied', via: 'panel', decided: Date.now(), code: '' }); return { ok: true };
    }
    throw new Error('demo');
  }
  const sApi = (method, path, body) => (D.demo && D.role !== 'agent' ? demo(method, path, body) : api(method, '/admin/store' + path, body));

  /* ---------------- disegno ---------------- */
  const when = (t) => new Date(t).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' });
  function item(r) {
    const meta = [r.device || 'Dispositivo sconosciuto', r.note, r.country, D.role === 'agent' ? (r.mine === false ? 'sotto-agente' : '') : (r.sellerName ? 'venditore ' + r.sellerName : 'senza codice venditore')].filter(Boolean).map(esc).join(' · ');
    if (r.status === 'pending') {
      const left = Math.max(1, Math.ceil((r.created + 24 * 3600e3 - Date.now()) / 3600e3));
      return `<div class="sd-req on" data-id="${esc(r.id)}"><div class="ic" style="color:var(--warn)">${IC}</div>
        <div class="tx"><b>${esc(r.app)}</b><small>${meta}</small><small>${esc(ago(r.created))} · scade tra ${left} h${r.tries ? ` · ${+r.tries} ${+r.tries === 1 ? 'codice errato' : 'codici errati'}` : ''}</small></div>
        <div class="sd-code mono" title="Codice da comunicare al cliente">${esc(r.code)}</div>
        <div class="sd-act"><button class="btn sm pri" data-sda="approve">Autorizza</button><button class="btn sm danger" data-sda="deny">Rifiuta</button></div></div>`;
    }
    const [lb, cls] = ST[r.status] || ST.expired;
    const how = (r.via && VIA[r.via] ? ' · ' + VIA[r.via] : '') + (r.byName ? ' · da ' + r.byName : r.byMe ? ' · da te' : '');
    const extra = r.status === 'approved' ? ' · in attesa del download (vale 30 min)' : r.uses && r.status !== 'used' ? ' · scaricata' : '';
    const act = r.status === 'approved' && (D.role !== 'agent' || r.byMe) ? `<div class="sd-act"><button class="btn sm danger" data-sda="revoke" title="Il cliente non potrà più scaricare con questa autorizzazione">Revoca</button></div>` : '';
    return `<div class="sd-req" data-id="${esc(r.id)}"><div class="ic" style="color:var(--mut)">${IC}</div>
      <div class="tx"><b>${esc(r.app)}</b><small>${meta}</small><small>${esc(when(r.created))}${esc(how)}${extra}</small></div>
      <span class="st ${cls}"><i></i>${lb}</span>${act}</div>`;
  }
  const DEVI = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>';
  function devItem(d) {
    const meta = [d.note, d.country].filter(Boolean).map(esc).join(' · ');
    const nums = [`${d.requests} ${d.requests === 1 ? 'richiesta' : 'richieste'}`, `${d.downloads} download`, d.pending ? `${d.pending} in attesa` : '', d.trusted ? 'senza limiti' : ''].filter(Boolean).join(' · ');
    return `<div class="sd-dev${d.blocked ? ' blk' : ''}" data-did="${esc(d.did)}"><div class="ic" style="color:${d.blocked ? 'var(--bad)' : 'var(--mut)'}">${DEVI}</div>
      <div class="tx"><b>${esc(d.device || 'Dispositivo sconosciuto')}</b>${meta ? `<small>${meta}</small>` : ''}<small>${nums}${d.last ? ' · ultima ' + esc(ago(d.last)) : ''}${d.blocked ? ' · <b style="color:var(--bad);display:inline;font-size:12px">bloccato</b>' : ''}</small></div>
      ${D.role !== 'agent' ? `<div class="tog${d.trusted ? ' on' : ''}" data-sdt="1" role="switch" aria-checked="${d.trusted ? 'true' : 'false'}" tabindex="0" title="Eccezione: niente tetto orario né tempo di attesa (per installatori e negozi che fanno tante richieste legittime)"><div><b>Senza limiti</b></div><i></i></div>` : ''}
      <div class="tog${d.blocked ? ' on' : ''}" data-sdb="1" role="switch" aria-checked="${d.blocked ? 'true' : 'false'}" tabindex="0"><div><b>Blocca dispositivo</b></div><i></i></div></div>`;
  }
  function badge() {
    const n = S.data ? S.data.pending || 0 : 0, b = $('#storeB');
    if (b) { b.style.display = n ? '' : 'none'; b.textContent = n; }
  }
  /** codice venditore: il cliente lo scrive nella richiesta dello Store e la richiesta arriva solo a chi ha quel codice */
  function renderSeller() {
    const el = $('#sdSeller'); if (!el) return;
    const c = S.data && S.data.sellerCode;
    if (!c) { el.innerHTML = ''; return; }
    const ag = D.role === 'agent';
    el.innerHTML = `<div class="sd-seller"><div><small class="mut">Il tuo codice venditore</small><b class="mono" id="sdSellerCode">${esc(c)}</b></div>
      <div class="mut" style="font-size:12.5px;line-height:1.45;flex:1;min-width:200px">Fallo scrivere ai tuoi clienti nella richiesta dello Store (campo «Codice del venditore», lo ricorda da sola): ${ag ? 'le loro richieste arrivano <b>solo a te</b> (e al titolare), non agli altri agenti.' : 'le richieste con il codice di un agente arrivano a lui e a te; quelle senza codice o con il tuo <b>solo a te</b>.'}</div>
      <button class="btn sm" id="sdSellerCopy">Copia</button>${ag ? '' : '<button class="btn sm" id="sdSellerEdit">Cambia</button>'}</div>`;
    $('#sdSellerCopy').onclick = () => { navigator.clipboard && navigator.clipboard.writeText(c).then(() => toast('Codice venditore copiato')).catch(() => toast(c)); };
    // il titolare sceglie il proprio codice (3-8 lettere o cifre)
    if ($('#sdSellerEdit')) $('#sdSellerEdit').onclick = () => {
      const box = $('#sdSellerCode'); box.innerHTML = `<input class="inp mono" id="sdSellerInp" maxlength="8" value="${esc(c)}" style="width:150px;margin:0;text-transform:uppercase;letter-spacing:.12em"> <button class="btn sm pri" id="sdSellerOk">Salva</button>`;
      const inp = $('#sdSellerInp'); inp.focus(); inp.select();
      inp.oninput = () => { const v = inp.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8); if (inp.value !== v) inp.value = v; };
      const save = async () => { const v = inp.value.trim().toUpperCase(); if (v.length < 3) { toast('Da 3 a 8 lettere o cifre', 1); return; } try { await api('PUT', '/admin/settings', { storeOwnerCode: v }); S.data.sellerCode = v; if (D.settings) D.settings.storeOwnerCode = v; toast('Codice venditore aggiornato: ' + v); renderSeller(); renderAll(); } catch (e) { toast(e.message, 1); } };
      $('#sdSellerOk').onclick = save; inp.onkeydown = (e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') renderSeller(); };
    };
  }
  function renderList() {
    renderSeller();
    const list = (S.data && S.data.requests) || [];
    const pend = list.filter((r) => r.status === 'pending'), hist = list.filter((r) => r.status !== 'pending');
    $('#sdPend').innerHTML = pend.length ? pend.map(item).join('') : '<div class="emptyc">Nessuna richiesta in attesa ✓</div>';
    $('#sdHist').innerHTML = hist.length ? hist.map(item).join('') : '<div class="emptyc">Nessun download registrato</div>';
    $('#sdClear').style.display = hist.length ? '' : 'none';
    const devs = (S.data && S.data.devices) || [];
    $('#sdDev').innerHTML = devs.length ? devs.map(devItem).join('') : '<div class="emptyc">Nessun dispositivo ha ancora chiesto un download</div>';
  }
  const closedNow = (c) => { if (!c || !c.on || c.from === c.to) return false; const hm = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date()); const m = (x) => +x.slice(0, 2) * 60 + +x.slice(3, 5), n = m(hm), a = m(c.from), b = m(c.to); return a < b ? n >= a && n < b : n >= a || n < b; };
  function renderSettings() {
    if (!S.data) return;
    const s = S.data.settings || {}, m = S.data.mail || {};
    if (!S.apDirty) $('#sdOn').classList.toggle('on', s.approval !== false);
    const w = $('#sdWarn'); if (w) { w.style.display = s.approval === false ? '' : 'none'; w.innerHTML = '⚠️ <b>Approvazione SPENTA</b>: adesso i clienti scaricano dallo store <b>senza mandarti la richiesta</b> (i download restano registrati qui sotto come «automatico»). Accendi «Chiedi la mia autorizzazione» e premi Salva.'; }
    const c = s.closed || {}, cl = $('#sdCl');
    if (cl && !S.clDirty) { cl.classList.toggle('on', !!c.on); $('#sdClF').value = c.from || '23:00'; $('#sdClT').value = c.to || '07:00'; if (document.activeElement !== $('#sdClM')) $('#sdClM').value = c.msg || ''; }
    const nw = $('#sdClNow'); if (nw) nw.innerHTML = c.on ? (closedNow(c) ? `🔴 <b>Adesso lo store è chiuso</b> (fino alle ${esc(c.to)})` : `🟢 Adesso lo store è aperto · chiude alle ${esc(c.from)}`) : '🟢 Store sempre aperto';
    if (document.activeElement !== $('#sdMail')) $('#sdMail').value = s.ownerEmail || '';
    const lines = [];
    if (!m.resend) lines.push('⚠️ <b>Email non attiva</b>: manca il segreto <b>RESEND_KEY</b> su GitHub (vedi la guida nel README). Le richieste compaiono comunque qui.');
    else if (!s.ownerEmail && !m.envEmail) lines.push('⚠️ Scrivi qui sopra la tua email per ricevere gli avvisi.');
    else lines.push(`✅ <b>Email attiva</b> · inviate nelle ultime 24 ore: ${+m.sentToday || 0}/${+m.limit || 90}`);
    if (m.resend) lines.push("Con il mittente di prova di Resend (onboarding@resend.dev) l'email arriva solo all'indirizzo con cui ti sei registrato su Resend.");
    if (m.resend && !m.links) lines.push('Pulsanti Autorizza/Rifiuta nell\'email non disponibili: manca ENC_KEY sul Worker.');
    $('#sdMailSt').innerHTML = lines.join('<br>');
    renderSms();
  }
  /* ---------------- SMS ---------------- */
  function renderSms() {
    if (!S.data || !$('#smsOn')) return;
    const sm = (S.data.settings && S.data.settings.sms) || {}, info = S.data.sms || {};
    $('#smsOn').classList.toggle('on', !!sm.on); $('#smsOn').setAttribute('aria-checked', sm.on ? 'true' : 'false');
    $('#smsLink').classList.toggle('on', !!sm.link); $('#smsLink').setAttribute('aria-checked', sm.link ? 'true' : 'false');
    if (document.activeElement !== $('#smsOwner')) $('#smsOwner').value = sm.owner || '';
    if (document.activeElement !== $('#smsDay')) $('#smsDay').value = sm.perDay || 50;
    const saved = new Map((sm.agents || []).map((a) => [a.id, a]));
    const list = info.agents || [];
    $('#smsAgents').innerHTML = list.length ? list.map((a) => {
      const v = saved.get(a.id) || {}, can = a.store && a.active;
      const why = !a.active ? 'account disattivato: non riceve SMS' : !a.store ? 'senza il permesso «Download store»: non riceve SMS' : 'riceve solo le richieste delle app che gestisce';
      return `<div class="sd-ag${can ? '' : ' off'}" data-ag="${+a.id}"><div class="nm"><b>${esc(a.username)}</b><small>${why}</small></div>
        <input class="inp" type="tel" inputmode="tel" placeholder="Numero di ${esc(a.username)}" value="${esc(v.phone || '')}" data-agp="1">
        <div class="tog${v.phone && v.on !== false ? ' on' : ''}" data-agt="1" role="switch" tabindex="0"><div><b>Consenti</b></div><i></i></div></div>`;
    }).join('') : '<div class="emptyc">Nessun agente: crea gli agenti dalla pagina Agenti</div>';
    const lines = [];
    if (!info.ready) lines.push('⚠️ <b>SMS non attivi</b>: mancano i segreti <b>TWILIO_SID</b>, <b>TWILIO_TOKEN</b> e la variabile <b>TWILIO_FROM</b> su GitHub (vedi la guida nel README). Puoi già salvare i numeri.');
    else lines.push(`${sm.on ? '✅ <b>SMS attivi</b>' : 'SMS spenti'} · inviati nelle ultime 24 ore: ${+info.sentToday || 0}/${+sm.perDay || 50}`);
    lines.push('Ogni SMS costa (circa 8-10 centesimi in Italia, li paghi a Twilio). Il tetto giornaliero ti protegge da spese impreviste: raggiunto il tetto, le richieste arrivano solo via email e qui.');
    $('#smsSt').innerHTML = lines.join('<br>');
  }
  function smsBody() {
    const agents = $$('#smsAgents [data-ag]').map((row) => ({ id: +row.dataset.ag, phone: row.querySelector('[data-agp]').value.trim(), on: row.querySelector('[data-agt]').classList.contains('on') })).filter((a) => a.phone);
    return { on: $('#smsOn').classList.contains('on'), owner: $('#smsOwner').value.trim(), link: $('#smsLink').classList.contains('on'), perDay: parseInt($('#smsDay').value, 10) || 50, agents };
  }

  async function refresh(full) {
    if (S.busy) return;
    S.busy = true;
    try {
      const d = await sApi('GET', '');
      const newPend = (d.requests || []).filter((r) => r.status === 'pending');
      if (S.seen) { const fresh = newPend.filter((r) => !S.seen.has(r.id)); if (fresh.length) toast(`Nuova richiesta di download: ${fresh[0].app}${fresh.length > 1 ? ` (+${fresh.length - 1})` : ''}`); }
      S.seen = new Set(newPend.map((r) => r.id));
      const first = !S.data;
      S.data = d; badge(); renderList();
      if (full || first) renderSettings();
    } catch (e) {
      if (V.classList.contains('on') && full) toast(e.message, 1);
    } finally { S.busy = false; }
  }

  /* ---------------- azioni ---------------- */
  V.addEventListener('click', async (e) => {
    const tg = e.target.closest('[data-sdb]');
    if (tg) { await blockDevice(tg); return; }
    const tt = e.target.closest('[data-sdt]');
    if (tt) { await trustDevice(tt); return; }
    const b = e.target.closest('[data-sda]');
    if (!b) return;
    const row = b.closest('[data-id]'), id = row.dataset.id, act = b.dataset.sda;
    if (act === 'revoke') {
      const app = row.querySelector('.tx b') ? row.querySelector('.tx b').textContent : '';
      if (!(await ask('Revocare l\'autorizzazione?', `Il cliente non potrà più scaricare <b>${esc(app)}</b> con questa autorizzazione. Per installarla dovrà chiedertela di nuovo.`, 'Revoca'))) return;
    }
    b.disabled = true;
    try {
      await sApi('POST', `/${encodeURIComponent(id)}/${act}`);
      toast(act === 'approve' ? 'Download autorizzato: sul dispositivo parte da solo (vale per un solo download)' : act === 'revoke' ? 'Autorizzazione revocata' : 'Download rifiutato');
    } catch (err) { toast(err.message, 1); }
    await refresh();
  });
  V.addEventListener('keydown', (e) => { const tg = e.target.closest && e.target.closest('[data-sdb]'); if (tg && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); blockDevice(tg); } });
  V.addEventListener('keydown', (e) => { const tt = e.target.closest && e.target.closest('[data-sdt]'); if (tt && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); trustDevice(tt); } });
  /** eccezione ai limiti dello Store per un dispositivo (solo titolare) */
  async function trustDevice(tg) {
    const row = tg.closest('[data-did]'), did = row.dataset.did, trusted = !tg.classList.contains('on');
    const name = row.querySelector('.tx b') ? row.querySelector('.tx b').textContent : 'questo dispositivo';
    if (trusted && !(await ask('Togliere i limiti a questo dispositivo?', `<b>${esc(name)}</b> potrà inviare quante richieste vuole, senza tetto orario né tempo di attesa tra una e l'altra. Ogni download resta comunque da autorizzare. Potrai rimettere i limiti quando vuoi.`, 'Senza limiti'))) return;
    tg.classList.toggle('on', trusted); tg.setAttribute('aria-checked', trusted ? 'true' : 'false');
    try {
      await sApi('POST', '/device/trust', { did, trusted });
      toast(trusted ? 'Dispositivo senza limiti' : 'Limiti normali ripristinati');
    } catch (err) { toast(err.message, 1); }
    await refresh();
  }
  async function blockDevice(tg) {
    const row = tg.closest('[data-did]'), did = row.dataset.did, blocked = !tg.classList.contains('on');
    const name = row.querySelector('.tx b') ? row.querySelector('.tx b').textContent : 'questo dispositivo';
    if (blocked && !(await ask('Bloccare il dispositivo?', `<b>${esc(name)}</b> non potrà più chiederti di scaricare app dallo store e le sue richieste in corso decadono. Potrai sbloccarlo quando vuoi.`, 'Blocca'))) return;
    tg.classList.toggle('on', blocked); tg.setAttribute('aria-checked', blocked ? 'true' : 'false');
    try {
      await sApi('POST', '/device/block', { did, blocked });
      toast(blocked ? 'Dispositivo bloccato: non può più inviare richieste' : 'Dispositivo sbloccato');
    } catch (err) { toast(err.message, 1); }
    await refresh();
  }
  $('#sdReload').onclick = () => refresh(true);
  const flip = (el) => { el.classList.toggle('on'); el.setAttribute('aria-checked', el.classList.contains('on') ? 'true' : 'false'); };
  ['#smsOn', '#smsLink'].forEach((id) => { $(id).onclick = () => flip($(id)); $(id).onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip($(id)); } }; });
  $('#smsAgents').addEventListener('click', (e) => { const t = e.target.closest('[data-agt]'); if (t) { t.dataset.touched = '1'; flip(t); } });
  $('#smsAgents').addEventListener('input', (e) => { const i = e.target.closest('[data-agp]'); if (i && i.value.trim()) { const t = i.closest('[data-ag]').querySelector('[data-agt]'); if (!t.dataset.touched) { t.classList.add('on'); } } });
  $('#smsAgents').addEventListener('keydown', (e) => { const t = e.target.closest && e.target.closest('[data-agt]'); if (t && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); flip(t); } });
  $('#smsSave').onclick = async () => {
    const b = $('#smsSave'); b.disabled = true;
    try {
      const r = await sApi('PUT', '/settings', { sms: smsBody() });
      if (S.data) S.data.settings = r.settings;
      renderSms();
      const sm = r.settings.sms || {};
      toast(sm.on ? `SMS attivi: ${(sm.owner ? 1 : 0) + (sm.agents || []).filter((a) => a.on).length} numeri` : 'Salvato: SMS spenti');
    } catch (err) { toast(err.message, 1); } finally { b.disabled = false; }
  };
  $('#smsTest').onclick = async () => {
    const phone = $('#smsOwner').value.trim();
    if (!phone) { toast('Scrivi prima il tuo numero', 1); return; }
    const b = $('#smsTest'); b.disabled = true;
    try { const r = await sApi('POST', '/sms/test', { phone }); toast('SMS di prova inviato a ' + r.to); } catch (err) { toast(err.message, 1); } finally { b.disabled = false; }
  };
  $('#sdOn').onclick = () => { $('#sdOn').classList.toggle('on'); S.apDirty = true; };
  $('#sdSave').onclick = async () => {
    // finché le impostazioni non sono caricate non si manda l'approvazione: prima un Salva troppo veloce la spegneva
    if (!S.data) { toast('Attendi il caricamento delle impostazioni', 1); return; }
    try {
      const r = await sApi('PUT', '/settings', { approval: $('#sdOn').classList.contains('on'), ownerEmail: $('#sdMail').value.trim() });
      S.apDirty = false;
      if (S.data) S.data.settings = r.settings;
      renderSettings();
      toast(r.settings.approval ? 'Salvato: ogni download chiede la tua autorizzazione' : 'Salvato: download liberi (restano registrati)');
    } catch (err) { toast(err.message, 1); }
  };
  $('#sdCl').onclick = () => { $('#sdCl').classList.toggle('on'); S.clDirty = true; };
  for (const id of ['#sdClF', '#sdClT', '#sdClM']) $(id).addEventListener('input', () => (S.clDirty = true));
  $('#sdClSave').onclick = async () => {
    if (!S.data) { toast('Attendi il caricamento delle impostazioni', 1); return; }
    const closed = { on: $('#sdCl').classList.contains('on'), from: $('#sdClF').value, to: $('#sdClT').value, msg: $('#sdClM').value.trim() };
    try { const r = await sApi('PUT', '/settings', { closed }); S.clDirty = false; S.data.settings = r.settings; renderSettings(); toast(closed.on ? `Store chiuso ogni giorno dalle ${closed.from} alle ${closed.to}` : 'Store sempre aperto'); } catch (err) { toast(err.message, 1); }
  };
  $('#sdClear').onclick = async () => {
    if (!(await ask('Svuotare lo storico?', 'Le richieste già decise o scadute verranno cancellate. Quelle in attesa restano.', 'Svuota'))) return;
    try { await sApi('DELETE', ''); toast('Storico svuotato'); } catch (err) { toast(err.message, 1); }
    refresh();
  };

  /* ---------------- avvisi: Telegram e notifiche del pannello ---------------- */
  const NF = { d: null, poll: 0 };
  const nApi = (method, path, body) => (D.demo ? nDemo(method, path, body) : api(method, '/admin/notify' + path, body));
  const ND = { tg: { ready: true, bot: 'KairosStoreBot', hooked: true, allowed: true, linked: false, name: '' }, push: { allowed: true, key: 'BDemo', devices: 0 },
    agents: [{ id: 2, username: 'luca', store: true, active: true, tg: true, push: false, tgLinked: true, pushDevices: 0 }, { id: 3, username: 'sara', store: false, active: true, tg: false, push: false, tgLinked: false, pushDevices: 0 }] };
  async function nDemo(method, path, body) {
    await new Promise((r) => setTimeout(r, 150));
    if (path === '' ) return JSON.parse(JSON.stringify(ND));
    if (path === '/tg/link') { ND.tg.linked = true; ND.tg.name = 'Mario @mario'; return { url: 'https://t.me/KairosStoreBot?start=demo', bot: 'KairosStoreBot' }; }
    if (path === '/tg/unlink') { ND.tg.linked = false; return { ok: true }; }
    if (path === '/consent') { ND.agents.forEach((a) => { a.tg = (body.tg || []).includes(a.id); a.push = (body.push || []).includes(a.id); }); return { ok: true }; }
    return { ok: true };
  }
  const pushOk = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  const keyBytes = (k) => { const s = atob(k.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((k.length + 3) % 4)); return Uint8Array.from(s, (c) => c.charCodeAt(0)); };
  async function mySub() {
    if (!pushOk()) return null;
    const reg = await navigator.serviceWorker.getRegistration('/panel/');
    return reg ? reg.pushManager.getSubscription() : null;
  }
  async function renderNf() {
    const box = $('#nfBody'); if (!box) return;
    let d; try { d = await nApi('GET', ''); } catch (e) { box.innerHTML = `<div class="sd-note">${esc(e.message)}</div>`; return; }
    NF.d = d;
    const owner = D.role !== 'agent';
    let sub = null; try { sub = await mySub(); } catch {}
    const here = !!sub && Notification.permission === 'granted';
    const tg = d.tg || {}, pu = d.push || {};
    let tgHtml;
    if (!tg.allowed) tgHtml = '<p>Il titolare non ti ha ancora consentito gli avvisi su Telegram.</p>';
    else if (!tg.ready) tgHtml = owner ? '<p class="nf-warn">⚠️ Manca il segreto <b>TELEGRAM_BOT_TOKEN</b> su GitHub: crea il bot con @BotFather e segui la guida nel README (sezione 7).</p>' : '<p>Telegram non è ancora attivo: chiedi al titolare.</p>';
    else if (tg.linked) tgHtml = `<p class="nf-ok">✅ Collegato${tg.name ? ': <b>' + esc(tg.name) + '</b>' : ''}. Ogni richiesta arriva con i pulsanti <b>Autorizza</b> e <b>Rifiuta</b>.</p><div class="nf-btns"><button class="btn sm" data-nf="tgtest">Messaggio di prova</button><button class="btn sm danger" data-nf="tgunlink">Scollega</button></div>`;
    else tgHtml = `<p>Premi <b>Collega Telegram</b>: si apre il bot${tg.bot ? ' <b>@' + esc(tg.bot) + '</b>' : ''}, premi <b>Avvia</b> e il collegamento è fatto.</p><div class="nf-btns"><button class="btn sm pri" data-nf="tglink">Collega Telegram</button>${owner && tg.ready && !tg.hooked ? '<button class="btn sm" data-nf="tgsetup">Ricollega il bot</button>' : ''}</div>`;
    let puHtml;
    if (!pu.allowed) puHtml = '<p>Il titolare non ti ha ancora consentito le notifiche.</p>';
    else if (!pushOk()) puHtml = isIOS && !standalone() ? '<p>Su iPhone e iPad: apri il pannello con <b>Safari</b>, premi <b>Condividi → Aggiungi a schermata Home</b>, poi apri <b>Kairos</b> dalla Home e torna qui (serve iOS 16.4 o successivo).</p>' : '<p>Questo browser non supporta le notifiche. Usa Chrome, Edge, Firefox o Safari aggiornati.</p>';
    else if (Notification.permission === 'denied') puHtml = '<p class="nf-warn">⚠️ Hai bloccato le notifiche per questo sito: riattivale dalle impostazioni del browser (icona del lucchetto → Notifiche → Consenti), poi ricarica.</p>';
    else if (here) puHtml = `<p class="nf-ok">✅ Attive su questo dispositivo${pu.devices > 1 ? ` (e su altri ${pu.devices - 1})` : ''}. ${isIOS ? 'Tocca la notifica per aprire la richiesta.' : 'Puoi autorizzare direttamente dalla notifica.'}</p><div class="nf-btns"><button class="btn sm" data-nf="pushtest">Notifica di prova</button><button class="btn sm danger" data-nf="pushoff">Disattiva su questo dispositivo</button></div>`;
    else puHtml = `<p>Ricevi le richieste come notifiche, anche a pannello chiuso.${pu.devices ? ` Già attive su ${pu.devices} ${pu.devices === 1 ? 'altro dispositivo' : 'altri dispositivi'}.` : ''}${isIOS ? '' : ' Sul telefono conviene prima installare il pannello: menu del browser → <b>Installa app</b> o <b>Aggiungi a schermata Home</b>.'}</p><div class="nf-btns"><button class="btn sm pri" data-nf="pushon">Attiva notifiche su questo dispositivo</button></div>`;
    let agHtml = '';
    if (owner) {
      const list = d.agents || [];
      agHtml = `<div class="sd-sub">Agenti che possono ricevere gli avvisi</div>${list.length ? list.map((a) => {
        const why = !a.active ? 'account disattivato' : !a.store ? 'senza il permesso «Download store»: non riceve' : [a.tg ? (a.tgLinked ? 'Telegram collegato' : 'Telegram da collegare') : '', a.push ? (a.pushDevices ? a.pushDevices + ' dispositivi con notifiche' : 'notifiche da attivare') : ''].filter(Boolean).join(' · ') || 'nessun avviso';
        return `<div class="sd-ag${a.store && a.active ? '' : ' off'}" data-nfa="${+a.id}"><div class="nm"><b>${esc(a.username)}</b><small>${esc(why)}</small></div>
          <div class="tog${a.tg ? ' on' : ''}" data-nfk="tg" role="switch" tabindex="0"><div><b>Telegram</b></div><i></i></div>
          <div class="tog${a.push ? ' on' : ''}" data-nfk="push" role="switch" tabindex="0"><div><b>Notifiche</b></div><i></i></div></div>`;
      }).join('') : '<div class="emptyc">Nessun agente</div>'}${list.length ? '<button class="btn sm pri" data-nf="consent" style="margin-top:10px">Salva consensi</button><div class="sd-note">L\'agente collega poi il suo Telegram o attiva le notifiche dal suo pannello. Riceve solo le richieste delle app che gestisce. Togliendo il consenso viene scollegato subito.</div>' : ''}`;
    }
    box.innerHTML = `<div class="nf-row"><h4>✈️ Telegram</h4>${tgHtml}</div><div class="nf-row"><h4>🔔 Notifiche del pannello</h4>${puHtml}</div>${agHtml}`;
  }
  async function pushOn() {
    const d = NF.d; if (!d || !d.push.key) throw new Error('Notifiche non disponibili');
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') throw new Error('Permesso negato: consenti le notifiche per questo sito');
    if (D.demo) return;
    const reg = await navigator.serviceWorker.register('/panel/sw.js', { scope: '/panel/' });
    await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    const key = keyBytes(d.push.key);
    if (sub) { const k = sub.options && sub.options.applicationServerKey ? new Uint8Array(sub.options.applicationServerKey) : null; if (!k || k.length !== key.length || k.some((x, i) => x !== key[i])) { await sub.unsubscribe(); sub = null; } }
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    await nApi('POST', '/push', { sub: sub.toJSON(), ua: navigator.userAgent.slice(0, 120) });
  }
  async function pushOff() {
    const sub = await mySub();
    if (sub) { const endpoint = sub.endpoint; await sub.unsubscribe().catch(() => {}); await nApi('DELETE', '/push', { endpoint }); }
  }
  $('#nfBody').addEventListener('click', async (e) => {
    const t = e.target.closest('[data-nfk]'); if (t) { t.classList.toggle('on'); return; }
    const b = e.target.closest('[data-nf]'); if (!b) return;
    const act = b.dataset.nf; b.disabled = true;
    try {
      if (act === 'tglink') {
        const w = D.demo ? null : window.open('', '_blank');
        const r = await nApi('POST', '/tg/link');
        if (w) w.location = r.url; else if (!D.demo) location.href = r.url;
        toast('Si apre Telegram: premi Avvia nel bot');
        clearInterval(NF.poll); let k = 0;
        NF.poll = setInterval(async () => { k++; try { const d = await nApi('GET', ''); if (d.tg && d.tg.linked) { clearInterval(NF.poll); toast('Telegram collegato ✓'); renderNf(); } } catch {} if (k > 60) clearInterval(NF.poll); }, 3000);
      } else if (act === 'tgunlink') { await nApi('POST', '/tg/unlink'); toast('Telegram scollegato'); }
      else if (act === 'tgtest') { await nApi('POST', '/tg/test'); toast('Messaggio di prova inviato su Telegram'); }
      else if (act === 'tgsetup') { const r = await nApi('POST', '/tg/setup'); toast('Bot @' + r.bot + ' collegato al pannello'); }
      else if (act === 'pushon') { await pushOn(); toast('Notifiche attive su questo dispositivo'); }
      else if (act === 'pushoff') { await pushOff(); toast('Notifiche disattivate su questo dispositivo'); }
      else if (act === 'pushtest') { await nApi('POST', '/push/test'); toast('Notifica di prova inviata: arriva tra pochi secondi'); }
      else if (act === 'consent') {
        const rows = $$('#nfBody [data-nfa]');
        const pick = (k) => rows.filter((r) => r.querySelector(`[data-nfk="${k}"]`).classList.contains('on')).map((r) => +r.dataset.nfa);
        await nApi('PUT', '/consent', { tg: pick('tg'), push: pick('push') }); toast('Consensi salvati');
      }
    } catch (err) { toast(err.message, 1); } finally { b.disabled = false; }
    if (act !== 'pushtest' && act !== 'tgtest') renderNf();
  });
  $('#nfBody').addEventListener('keydown', (e) => { const t = e.target.closest && e.target.closest('[data-nfk]'); if (t && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); t.classList.toggle('on'); } });
  // dalla notifica: apre il pannello sulla pagina Download store
  const goStore = () => { const n = document.querySelector('.nav[data-v="store"]'); if (n) n.click(); };
  if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', (e) => { if (e.data && e.data.kairos === 'store') goStore(); });

  /* aggiornamento: all'apertura della pagina e ogni 20 secondi mentre il pannello è aperto */
  const navB = document.querySelector('.nav[data-v="store"]');
  if (navB) navB.addEventListener('click', () => { refresh(true); renderNf(); });
  const appEl = $('#app');
  if (appEl) new MutationObserver(() => {
    if (appEl.classList.contains('on')) { refresh(true); if (location.hash === '#store') { history.replaceState(null, '', location.pathname); setTimeout(goStore, 300); } }
    else { S.data = null; S.seen = null; badge(); }
  }).observe(appEl, { attributes: true, attributeFilter: ['class'] });
  setInterval(() => { if (appEl && appEl.classList.contains('on') && !document.hidden) refresh(); }, 20000);
})();
