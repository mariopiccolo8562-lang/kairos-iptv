/* KAIROS — pagina "Download store": autorizzazione dei download dello Store.
   Usa le funzioni di app.js ($, $$, esc, api, toast, ago, D, TITLES). In demo usa dati di esempio. */
(() => {
  if (typeof TITLES === 'object') TITLES.store = 'Download store';
  const V = $('#v-store'); if (!V) return;

  const ST = { pending: ['In attesa', 'pending'], approved: ['Autorizzata', 'active'], used: ['Scaricata', 'active'], denied: ['Rifiutata', 'disabled'], expired: ['Scaduta', 'expired'], revoked: ['Revocata', 'disabled'] };
  const VIA = { email: "dall'email", panel: 'dal pannello', code: 'con il codice', auto: 'approvazione spenta', tries: 'troppi codici errati' };
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
@media (max-width:820px){.sd-act{width:100%}.sd-act .btn{flex:1}.sd-dev .tog{width:100%;justify-content:space-between}}`;
  document.head.appendChild(css);

  V.innerHTML = `<div class="g2">
  <div class="card glass">
    <div class="hd"><h3>Richieste di download<small>I clienti chiedono il tuo permesso prima di scaricare un'app dallo store</small></h3><button class="btn sm" id="sdReload">Aggiorna</button></div>
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
      <div class="tog" id="sdOn"><div><b>Chiedi la mia autorizzazione</b><small>Spento: i download partono subito, ma restano registrati qui</small></div><i></i></div>
      <label class="lbl">La tua email per gli avvisi</label>
      <input class="inp" id="sdMail" type="email" autocomplete="email" placeholder="la stessa del tuo account Resend">
      <div class="sd-note" id="sdMailSt"></div>
      <button class="btn pri" id="sdSave" style="margin-top:14px">Salva</button>
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
      settings: { approval: true, ownerEmail: 'tuo@email.it', blocked: ['demo-did-mt-firetv-000000'] },
      mail: { resend: true, envEmail: false, links: true, sentToday: 3, limit: 90 },
      requests: [
        { id: 'demo-req-0001', app: 'IboPro', did: 'demo-did-marco-firetv-0000', device: 'Amazon AFTKA (Fire TV)', note: 'Marco', country: 'IT · Milano', code: '482913', status: 'pending', tries: 0, uses: 0, created: t - 90e3 },
        { id: 'demo-req-0002', app: 'TiviMate', did: 'demo-did-xiaomi-tv-000000', device: 'Xiaomi MiTV-AXSO0 (Android TV)', note: '', country: 'IT', code: '105377', status: 'pending', tries: 1, uses: 0, created: t - 11 * 60e3 },
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
      if (!d) { d = { did: r.did, device: r.device, note: r.note, country: r.country, last: r.created, requests: 0, downloads: 0, pending: 0, blocked: DM.settings.blocked.includes(r.did) }; by.set(r.did, d); }
      d.requests++; if (r.uses) d.downloads++; if (r.status === 'pending') d.pending++;
    }
    for (const did of DM.settings.blocked) if (!by.has(did)) by.set(did, { did, device: '', note: '', country: '', last: 0, requests: 0, downloads: 0, pending: 0, blocked: true });
    return [...by.values()].sort((a, b) => (+b.blocked - +a.blocked) || (b.last - a.last));
  }
  async function demo(method, path, body) {
    await new Promise((r) => setTimeout(r, 120));
    if (path === '' && method === 'GET') return { ...DM, pending: DM.requests.filter((r) => r.status === 'pending').length, devices: demoDevices() };
    if (path === '/settings') { Object.assign(DM.settings, body); return { settings: DM.settings }; }
    if (path === '' && method === 'DELETE') { DM.requests = DM.requests.filter((r) => r.status === 'pending'); return { ok: true }; }
    if (path === '/device/block') {
      DM.settings.blocked = DM.settings.blocked.filter((d) => d !== body.did);
      if (body.blocked !== false) { DM.settings.blocked.unshift(body.did); DM.requests.forEach((r) => { if (r.did === body.did && (r.status === 'pending' || r.status === 'approved')) Object.assign(r, { status: 'revoked', code: '', decided: Date.now() }); }); }
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
    const meta = [r.device || 'Dispositivo sconosciuto', r.note, r.country].filter(Boolean).map(esc).join(' · ');
    if (r.status === 'pending') {
      const left = Math.max(1, Math.ceil((r.created + 24 * 3600e3 - Date.now()) / 3600e3));
      return `<div class="sd-req on" data-id="${esc(r.id)}"><div class="ic" style="color:var(--warn)">${IC}</div>
        <div class="tx"><b>${esc(r.app)}</b><small>${meta}</small><small>${esc(ago(r.created))} · scade tra ${left} h${r.tries ? ` · ${+r.tries} ${+r.tries === 1 ? 'codice errato' : 'codici errati'}` : ''}</small></div>
        <div class="sd-code mono" title="Codice da comunicare al cliente">${esc(r.code)}</div>
        <div class="sd-act"><button class="btn sm pri" data-sda="approve">Autorizza</button><button class="btn sm danger" data-sda="deny">Rifiuta</button></div></div>`;
    }
    const [lb, cls] = ST[r.status] || ST.expired;
    const how = r.via && VIA[r.via] ? ' · ' + VIA[r.via] : '';
    const extra = r.status === 'approved' ? ' · in attesa del download (vale 30 min)' : r.uses && r.status !== 'used' ? ' · scaricata' : '';
    const act = r.status === 'approved' ? `<div class="sd-act"><button class="btn sm danger" data-sda="revoke" title="Il cliente non potrà più scaricare con questa autorizzazione">Revoca</button></div>` : '';
    return `<div class="sd-req" data-id="${esc(r.id)}"><div class="ic" style="color:var(--mut)">${IC}</div>
      <div class="tx"><b>${esc(r.app)}</b><small>${meta}</small><small>${esc(when(r.created))}${esc(how)}${extra}</small></div>
      <span class="st ${cls}"><i></i>${lb}</span>${act}</div>`;
  }
  const DEVI = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>';
  function devItem(d) {
    const meta = [d.note, d.country].filter(Boolean).map(esc).join(' · ');
    const nums = [`${d.requests} ${d.requests === 1 ? 'richiesta' : 'richieste'}`, `${d.downloads} download`, d.pending ? `${d.pending} in attesa` : ''].filter(Boolean).join(' · ');
    return `<div class="sd-dev${d.blocked ? ' blk' : ''}" data-did="${esc(d.did)}"><div class="ic" style="color:${d.blocked ? 'var(--bad)' : 'var(--mut)'}">${DEVI}</div>
      <div class="tx"><b>${esc(d.device || 'Dispositivo sconosciuto')}</b>${meta ? `<small>${meta}</small>` : ''}<small>${nums}${d.last ? ' · ultima ' + esc(ago(d.last)) : ''}${d.blocked ? ' · <b style="color:var(--bad);display:inline;font-size:12px">bloccato</b>' : ''}</small></div>
      <div class="tog${d.blocked ? ' on' : ''}" data-sdb="1" role="switch" aria-checked="${d.blocked ? 'true' : 'false'}" tabindex="0"><div><b>Blocca dispositivo</b></div><i></i></div></div>`;
  }
  function badge() {
    const n = S.data ? S.data.pending || 0 : 0, b = $('#storeB');
    if (b) { b.style.display = n ? '' : 'none'; b.textContent = n; }
  }
  function renderList() {
    const list = (S.data && S.data.requests) || [];
    const pend = list.filter((r) => r.status === 'pending'), hist = list.filter((r) => r.status !== 'pending');
    $('#sdPend').innerHTML = pend.length ? pend.map(item).join('') : '<div class="emptyc">Nessuna richiesta in attesa ✓</div>';
    $('#sdHist').innerHTML = hist.length ? hist.map(item).join('') : '<div class="emptyc">Nessun download registrato</div>';
    $('#sdClear').style.display = hist.length ? '' : 'none';
    const devs = (S.data && S.data.devices) || [];
    $('#sdDev').innerHTML = devs.length ? devs.map(devItem).join('') : '<div class="emptyc">Nessun dispositivo ha ancora chiesto un download</div>';
  }
  function renderSettings() {
    if (!S.data) return;
    const s = S.data.settings || {}, m = S.data.mail || {};
    $('#sdOn').classList.toggle('on', s.approval !== false);
    if (document.activeElement !== $('#sdMail')) $('#sdMail').value = s.ownerEmail || '';
    const lines = [];
    if (!m.resend) lines.push('⚠️ <b>Email non attiva</b>: manca il segreto <b>RESEND_KEY</b> su GitHub (vedi la guida nel README). Le richieste compaiono comunque qui.');
    else if (!s.ownerEmail && !m.envEmail) lines.push('⚠️ Scrivi qui sopra la tua email per ricevere gli avvisi.');
    else lines.push(`✅ <b>Email attiva</b> · inviate nelle ultime 24 ore: ${+m.sentToday || 0}/${+m.limit || 90}`);
    if (m.resend) lines.push("Con il mittente di prova di Resend (onboarding@resend.dev) l'email arriva solo all'indirizzo con cui ti sei registrato su Resend.");
    if (m.resend && !m.links) lines.push('Pulsanti Autorizza/Rifiuta nell\'email non disponibili: manca ENC_KEY sul Worker.');
    $('#sdMailSt').innerHTML = lines.join('<br>');
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
  $('#sdOn').onclick = () => $('#sdOn').classList.toggle('on');
  $('#sdSave').onclick = async () => {
    try {
      const r = await sApi('PUT', '/settings', { approval: $('#sdOn').classList.contains('on'), ownerEmail: $('#sdMail').value.trim() });
      if (S.data) S.data.settings = r.settings;
      renderSettings();
      toast(r.settings.approval ? 'Salvato: ogni download chiede la tua autorizzazione' : 'Salvato: download liberi (restano registrati)');
    } catch (err) { toast(err.message, 1); }
  };
  $('#sdClear').onclick = async () => {
    if (!(await ask('Svuotare lo storico?', 'Le richieste già decise o scadute verranno cancellate. Quelle in attesa restano.', 'Svuota'))) return;
    try { await sApi('DELETE', ''); toast('Storico svuotato'); } catch (err) { toast(err.message, 1); }
    refresh();
  };

  /* aggiornamento: all'apertura della pagina e ogni 20 secondi mentre il pannello è aperto */
  const navB = document.querySelector('.nav[data-v="store"]');
  if (navB) navB.addEventListener('click', () => refresh(true));
  const appEl = $('#app');
  if (appEl) new MutationObserver(() => { if (appEl.classList.contains('on')) refresh(true); else { S.data = null; S.seen = null; badge(); } }).observe(appEl, { attributes: true, attributeFilter: ['class'] });
  setInterval(() => { if (appEl && appEl.classList.contains('on') && !document.hidden) refresh(); }, 20000);
})();
