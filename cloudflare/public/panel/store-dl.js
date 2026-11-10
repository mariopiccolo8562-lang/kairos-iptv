/* KAIROS — pagina «Riepilogo store» (solo titolare). Lo store è APERTO, come IBO Player: il cliente scarica lo store,
   installa subito le app che vuole, apre l'app Kairos e ti manda la foto del codice che vede sulla TV; tu (o l'agente)
   lo attivi dal pannello come sempre. Niente codice del venditore, niente «Richiedi autorizzazione», niente blocchi.
   Qui restano solo i numeri: quanti store ci sono, quanti li usano, quanti download e quali app, più l'«App consigliata».
   Usa le funzioni di app.js ($, $$, esc, api, toast, ago, D, TITLES). In demo usa dati di esempio. */
(() => {
  if (typeof TITLES === 'object') TITLES.store = 'Riepilogo store';
  const V = $('#v-store'); if (!V) return;

  const css = document.createElement('style');
  css.textContent = `
.so-open{display:flex;gap:12px;align-items:flex-start;padding:12px 14px;margin:0 0 16px;border-radius:12px;border:1px solid rgba(52,199,123,.45);background:rgba(52,199,123,.1);font-size:13.5px;line-height:1.5}
.so-open b{color:#6ee3a6}.so-open .dot{flex:none;width:10px;height:10px;margin-top:5px;border-radius:50%;background:#34c77b;box-shadow:0 0 12px #34c77b}
.ss-k{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:16px}
.ss-k .k{background:var(--glass);border:1px solid var(--line);border-radius:12px;padding:14px 16px}.ss-k .k b{display:block;font-size:26px;font-weight:800;letter-spacing:-.02em}.ss-k .k small{display:block;color:var(--mut);font-size:12.5px;margin-top:2px}
.ss-k .k i{display:block;font-style:normal;color:var(--mut);font-size:12px;margin-top:6px}
.so-days{display:flex;align-items:flex-end;gap:5px;height:90px;padding:6px 2px 0;border-bottom:1px solid var(--line)}
.so-days .d{flex:1;min-width:6px;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;height:100%}
.so-days .d i{display:block;width:100%;min-height:2px;border-radius:4px 4px 0 0;background:linear-gradient(180deg,#a78bfa,#4f8cff)}
.so-days .d small{font-size:10px;color:var(--mut);margin-top:3px;white-space:nowrap}
.so-dl{display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-top:1px solid var(--line);font-size:13px}.so-dl:first-child{border-top:0}
.so-dl b{font-weight:700}.so-dl small{display:block;color:var(--mut);font-size:11.5px}
.ss-bar{height:6px;border-radius:3px;background:rgba(255,255,255,.08);overflow:hidden;min-width:70px}.ss-bar i{display:block;height:100%;background:linear-gradient(90deg,#4f8cff,#a78bfa)}
.so-how{padding-left:20px;color:var(--mut);font-size:14px;line-height:1.55;margin:0}.so-how li{margin:4px 0}.so-how b{color:var(--txt)}`;
  document.head.appendChild(css);

  V.innerHTML = `
  <div class="card glass" style="margin-bottom:18px">
    <div class="hd"><h3>Riepilogo store<small>Quanti hanno Kairos Store, quanti lo usano e quante app scaricano (download degli ultimi 30 giorni)</small></h3><button class="btn sm" id="soReload">Aggiorna</button></div>
    <div class="so-open"><span class="dot"></span><div><b>Store aperto</b>, come IBO Player: chi installa Kairos Store vede subito tutte le app e le scarica con <b>Installa</b>, senza codice del venditore, senza autorizzazione e senza blocchi. Per le app Kairos il cliente ti manda la <b>foto del codice</b> che vede sulla TV e tu (o l'agente) lo attivi dal pannello, come sempre.</div></div>
    <div class="ss-k" id="soK"><div class="k"><b>…</b><small>Caricamento</small></div></div>
    <div class="sd-sub" style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--mut);font-weight:600;margin:4px 0 6px">Download per giorno · ultimi 14 giorni</div>
    <div class="so-days" id="soDays"></div>
  </div>
  <div class="g2">
    <div class="card glass"><div class="hd"><h3>Per app<small>Le app più scaricate dallo store negli ultimi 30 giorni</small></h3></div>
      <div class="tbl-wrap"><table class="tbl" style="width:100%"><thead><tr><th>App</th><th>Download</th><th>Dispositivi</th><th>Ultimi 7 gg</th><th>Ultimo</th></tr></thead><tbody id="soApps"></tbody></table></div></div>
    <div class="card glass"><div class="hd"><h3>Ultimi download<small>Gli ultimi download partiti dallo store</small></h3></div><div id="soRecent"></div></div>
  </div>
  <div class="g2">
    <div class="card glass"><div class="hd"><h3>Store installati<small>Ogni Kairos Store che si è aperto almeno una volta (dal più recente)</small></h3></div>
      <div class="tbl-wrap"><table class="tbl" style="width:100%"><thead><tr><th>Dispositivo</th><th>Versione</th><th>Primo avvio</th><th>Ultimo uso</th><th>Download</th></tr></thead><tbody id="soStores"></tbody></table></div></div>
    <div>
      <div class="card glass" style="margin-bottom:18px">
        <div class="hd"><h3>App consigliata<small>Lo Store sceglie l'app adatta al dispositivo del cliente</small></h3></div>
        <div class="mut" style="font-size:12.5px;line-height:1.45;margin-bottom:10px">Nello Store il cliente ha il pulsante «App consigliata per questo dispositivo»: lo Store legge memoria, modello e versione Android e propone l'app giusta con Installa già pronto, con una frase cortese. Scrivi i nomi delle app esattamente come compaiono nello Store.</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px 16px">
          <div><label class="lbl">Fire TV Stick, o chiavetta/box con poca memoria</label><input class="inp" id="rcWeak" placeholder="Kairos-XC" style="margin:0">
            <div style="display:flex;gap:8px;align-items:center;margin-top:6px"><small class="mut">poca memoria = meno di</small><input class="inp" id="rcMb" type="number" min="256" max="8192" style="margin:0;width:100px"><small class="mut">MB</small></div></div>
          <div><label class="lbl">Android vecchio</label><input class="inp" id="rcOld" placeholder="Kairos-Lite" style="margin:0">
            <div style="display:flex;gap:8px;align-items:center;margin-top:6px"><small class="mut">vecchio = prima di Android</small><input class="inp" id="rcSdk" type="number" min="5" max="14" style="margin:0;width:80px"></div></div>
          <div><label class="lbl">Telefono, tablet o box potente</label><input class="inp" id="rcStrong" placeholder="Kairos Pro" style="margin:0"></div>
          <div style="grid-column:1/-1"><label class="lbl">Frase mostrata al cliente ({app} = nome dell'app)</label><input class="inp" id="rcText" maxlength="300" style="margin:0"></div>
          <div style="grid-column:1/-1"><label class="lbl">Memoria richiesta da ogni app</label>
            <div class="mut" style="font-size:12.5px;margin:-2px 0 8px">Sotto l'app consigliata lo Store mostra le app Kairos dalla più leggera, con ✓ se il dispositivo ha abbastanza memoria e ✗ se ne serve di più. Insieme ci sono i dati del dispositivo: processore, RAM, memoria interna, Android, schermo, scheda video, H.265 e 4K.</div>
            <div id="rcMem" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px 14px"></div></div>
        </div>
        <div style="margin-top:10px"><button class="btn" id="rcSave">Salva</button></div>
      </div>
      <div class="card glass">
        <div class="hd"><h3>Come funziona</h3></div>
        <ol class="so-how">
          <li>Il cliente installa <b>Kairos Store</b> (codice Downloader o <b>panel-kairos.com/get/store.apk</b>).</li>
          <li>Apre lo store: vede subito tutte le app. Preme <b>Installa</b> e il download parte, senza codici né attese.</li>
          <li>Apre l'app Kairos installata e ti manda la <b>foto del codice</b> che compare sulla TV.</li>
          <li>Tu (o l'agente) attivi quel codice dal pannello con <b>+ Nuovo cliente</b>, come sempre.</li>
          <li>Gli store già installati con la versione vecchia funzionano subito: non chiedono più il codice e si aggiornano da soli alla versione nuova.</li>
        </ol>
      </div>
    </div>
  </div>`;

  /* ---------------- dati di esempio (demo) ---------------- */
  const DM = (() => {
    const t = Date.now(), dd = 864e5;
    return {
      open: true,
      settings: { recommend: { rv: 2, weakApp: 'Kairos-XC', weakMb: 1536, oldApp: 'Kairos-Lite', oldSdk: 7, strongApp: 'Kairos Pro', text: 'Per questo dispositivo è consigliata {app}: stesso abbonamento e stesse liste, con la migliore fluidità su questo apparecchio.', mem: { 'Kairos-XC': 512, 'Kairos Tv': 1024, 'Kairos-Lite': 1024, 'Kairos Premium': 1536, 'Kairos Plus': 1536, 'Kairos Pro': 2048 } } },
      totals: { installs: 37, open30: 29, open7: 18, open1: 6, new30: 11, new7: 4, opens: 412, dl30: 64, dl7: 21, dl1: 3, users30: 26 },
      apps: [{ app: 'Kairos Pro', n: 31, devs: 18, n7: 10, last: t - 2 * 3600e3 }, { app: 'Kairos Tv', n: 14, devs: 11, n7: 6, last: t - 5 * 3600e3 }, { app: 'IboPro', n: 11, devs: 9, n7: 3, last: t - dd }, { app: 'TiviMate', n: 8, devs: 6, n7: 2, last: t - 3 * dd }],
      recent: [{ app: 'Kairos Pro', device: 'Amazon AFTKA (Fire TV)', country: 'IT · Milano', created: t - 2 * 3600e3 }, { app: 'Kairos Tv', device: 'Amazon AFTSS (Fire TV)', country: 'IT · Napoli', created: t - 5 * 3600e3 }, { app: 'IboPro', device: 'Xiaomi MiTV-AXSO0 (Android TV)', country: 'IT', created: t - dd }],
      stores: [{ device: 'Amazon AFTKA (Fire TV)', country: 'IT · Milano', version: '1.0.130', first: t - 20 * dd, last: t - 2 * 3600e3, opens: 41, downloads: 6 }, { device: 'Amazon AFTSS (Fire TV)', country: 'IT · Napoli', version: '1.0.129', first: t - 6 * dd, last: t - 5 * 3600e3, opens: 9, downloads: 2 }, { device: 'Xiaomi MiTV-AXSO0 (Android TV)', country: 'IT', version: '1.0.130', first: t - 2 * dd, last: t - dd, opens: 3, downloads: 1 }],
      days: Array.from({ length: 14 }, (_, i) => ({ day: Math.floor((t - (13 - i) * dd) / dd) * dd, n: [2, 5, 3, 0, 4, 6, 3, 7, 2, 5, 4, 8, 6, 3][i] })),
    };
  })();
  async function demo(method, path, body) {
    await new Promise((r) => setTimeout(r, 120));
    if (path === '/summary') return JSON.parse(JSON.stringify(DM));
    if (path === '/settings') { Object.assign(DM.settings, body); return { settings: DM.settings }; }
    throw new Error('demo');
  }
  const sApi = (method, path, body) => (D.demo ? demo(method, path, body) : api(method, '/admin/store' + path, body));

  /* ---------------- disegno ---------------- */
  const S = { data: null, busy: false, t: 0 };
  const when = (t) => new Date(t).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' });
  const day = (t) => new Date(t).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
  const n = (v) => esc(String(+v || 0));
  function render() {
    const d = S.data; if (!d) return;
    const T = d.totals || {};
    $('#soK').innerHTML = [
      [T.installs, 'store installati', `${+T.new30 || 0} nuovi in 30 giorni · ${+T.new7 || 0} in 7 giorni`],
      [T.open30, 'store usati in 30 giorni', `ultimi 7 giorni: ${+T.open7 || 0} · oggi: ${+T.open1 || 0}`],
      [T.dl30, 'download in 30 giorni', `ultimi 7 giorni: ${+T.dl7 || 0} · oggi: ${+T.dl1 || 0}`],
      [T.users30, 'dispositivi che hanno scaricato', `in 30 giorni · ${+T.opens || 0} aperture dello store in tutto`],
    ].map(([v, l, i]) => `<div class="k"><b>${n(v)}</b><small>${l}</small><i>${esc(i)}</i></div>`).join('');
    // ultimi 14 giorni (anche quelli senza download)
    const by = new Map((d.days || []).map((x) => [Math.floor(x.day / 864e5), +x.n || 0])), today = Math.floor((Date.now() + 3600e3) / 864e5);
    const ds = Array.from({ length: 14 }, (_, i) => { const k = today - 13 + i; return { k, n: by.get(k) || 0 }; }), max = Math.max(1, ...ds.map((x) => x.n));
    $('#soDays').innerHTML = ds.map((x, i) => `<div class="d" title="${esc(day(x.k * 864e5))}: ${x.n} download"><i style="height:${Math.round((x.n / max) * 70)}px"></i><small>${i % 2 ? '' : esc(day(x.k * 864e5))}</small></div>`).join('');
    const apps = d.apps || [], top = Math.max(1, ...apps.map((a) => +a.n || 0));
    $('#soApps').innerHTML = apps.length ? apps.map((a) => `<tr><td><b>${esc(a.app)}</b><div class="ss-bar" style="margin-top:4px"><i style="width:${Math.round(((+a.n || 0) / top) * 100)}%"></i></div></td><td>${n(a.n)}</td><td>${n(a.devs)}</td><td>${n(a.n7)}</td><td>${a.last ? esc(ago(a.last)) : '—'}</td></tr>`).join('')
      : '<tr><td colspan="5" class="mut">Nessun download negli ultimi 30 giorni</td></tr>';
    const rec = d.recent || [];
    $('#soRecent').innerHTML = rec.length ? rec.map((r) => `<div class="so-dl"><span><b>${esc(r.app)}</b><small>${esc([r.device || 'Dispositivo', r.country].filter(Boolean).join(' · '))}</small></span><span style="text-align:right;white-space:nowrap"><small>${esc(when(r.created))}</small><small>${esc(ago(r.created))}</small></span></div>`).join('')
      : '<div class="emptyc">Nessun download ancora</div>';
    const st = d.stores || [];
    $('#soStores').innerHTML = st.length ? st.map((x) => `<tr><td><b>${esc(x.device || 'Dispositivo')}</b><br><small class="mut">${esc(x.country || '')}</small></td><td>${esc(x.version || '—')}</td><td>${x.first ? esc(day(x.first)) : '—'}</td><td>${x.last ? esc(ago(x.last)) : '—'}</td><td>${n(x.downloads)}</td></tr>`).join('')
      + (st.length >= 200 ? '<tr><td colspan="5" class="mut">Sono mostrati i 200 usati più di recente</td></tr>' : '')
      : '<tr><td colspan="5" class="mut">Nessuno store si è ancora aperto con la versione aperta</td></tr>';
    const rc = (d.settings && d.settings.recommend) || {};
    [['rcMb', 'weakMb'], ['rcWeak', 'weakApp'], ['rcSdk', 'oldSdk'], ['rcOld', 'oldApp'], ['rcStrong', 'strongApp'], ['rcText', 'text']].forEach(([id, k]) => { const el = $('#' + id); if (el && document.activeElement !== el && !el.dataset.dirty) el.value = rc[k] ?? ''; });
    const mb = $('#rcMem'), mem = rc.mem || {};
    if (mb && !mb.querySelector('input[data-dirty]') && !mb.contains(document.activeElement)) mb.innerHTML = Object.entries(mem).map(([name, n]) => `<div style="display:flex;gap:8px;align-items:center"><span style="flex:1;min-width:0;font-weight:700;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(name)}</span><input class="inp" type="number" min="128" max="16384" step="128" data-mem="${esc(name)}" value="${esc(n)}" style="margin:0;width:96px"><small class="mut">MB</small></div>`).join('');
  }
  async function refresh(force) {
    if (D.role === 'agent' || S.busy) return;
    if (!force && S.data && Date.now() - S.t < 20000) return;
    S.busy = true;
    try { S.data = await sApi('GET', '/summary'); S.t = Date.now(); render(); }
    catch (e) { if (V.classList.contains('on') && force) toast(e.message, 1); }
    finally { S.busy = false; }
  }

  /* ---------------- azioni ---------------- */
  $('#soReload').onclick = () => refresh(true);
  for (const id of ['rcMb', 'rcWeak', 'rcSdk', 'rcOld', 'rcStrong', 'rcText']) $('#' + id).addEventListener('input', (e) => { e.target.dataset.dirty = '1'; });
  $('#rcMem').addEventListener('input', (e) => { if (e.target.dataset.mem) e.target.dataset.dirty = '1'; });
  $('#rcSave').onclick = async () => {
    const v = (id) => ($('#' + id).value || '').trim();
    if (!v('rcWeak') || !v('rcOld') || !v('rcStrong')) { toast('Scrivi il nome delle tre app', 1); return; }
    try {
      const mem = {}; for (const el of $$('#rcMem [data-mem]')) { const n = parseInt(el.value, 10); if (n >= 128 && n <= 16384) mem[el.dataset.mem] = n; }
      const r = await sApi('PUT', '/settings', { recommend: { weakMb: parseInt(v('rcMb'), 10), weakApp: v('rcWeak'), oldSdk: parseInt(v('rcSdk'), 10), oldApp: v('rcOld'), strongApp: v('rcStrong'), text: v('rcText'), ...(Object.keys(mem).length ? { mem } : {}) } });
      for (const id of ['rcMb', 'rcWeak', 'rcSdk', 'rcOld', 'rcStrong', 'rcText']) delete $('#' + id).dataset.dirty;
      for (const el of $$('#rcMem [data-mem]')) delete el.dataset.dirty;
      if (S.data) S.data.settings = r.settings;
      render(); toast('Salvato: lo Store consiglia ' + r.settings.recommend.weakApp + ' sulle chiavette deboli');
    } catch (e) { toast(e.message || 'Errore', 1); }
  };

  /* aggiornamento: quando la pagina diventa visibile e ogni 30 secondi mentre resta aperta */
  new MutationObserver(() => { if (V.classList.contains('on')) refresh(true); }).observe(V, { attributes: true, attributeFilter: ['class'] });
  const navB = document.querySelector('.nav[data-v="store"]');
  if (navB) navB.addEventListener('click', () => refresh(true));
  const appEl = $('#app');
  if (appEl) new MutationObserver(() => { if (!appEl.classList.contains('on')) { S.data = null; S.t = 0; } }).observe(appEl, { attributes: true, attributeFilter: ['class'] });
  setInterval(() => { if (V.classList.contains('on') && !document.hidden) refresh(); }, 30000);
})();
