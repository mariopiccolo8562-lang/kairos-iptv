/* KAIROS Control — «📊 Dati» del cliente e 🩺 Salute delle app (priorità assoluta: app fluide e senza errori).
   Dati: ultima connessione, cosa guarda e per quanto, errori, versione dell'app e se serve aggiornarla, problemi
   trovati con la soluzione e «Invia aggiornamento». Salute: i clienti con problemi in evidenza, e le opzioni
   (decide il titolare) per il controllo automatico e l'aggiornamento automatico delle app vecchie. */
(() => {
  const css = document.createElement('style');
  css.textContent = `@media (min-width:901px){.topbar{flex-wrap:nowrap!important}.topbar .search{flex:1 1 140px!important;min-width:90px!important;max-width:340px}}
#insM{position:fixed;inset:0;z-index:70;background:rgba(5,7,12,.72);backdrop-filter:blur(6px);display:none;align-items:flex-start;justify-content:center;overflow:auto;padding:28px 16px}
#insM.on{display:flex}#insM .ib{width:min(1060px,100%);background:var(--pane,#16181d);border:1px solid var(--line);border-radius:20px;box-shadow:0 30px 80px rgba(0,0,0,.6);padding:20px 22px}
.in-h{display:flex;align-items:center;gap:12px;margin-bottom:14px}.in-h h3{margin:0;font-size:19px}.in-h .sp{flex:1}
.in-dot{width:11px;height:11px;border-radius:50%;display:inline-block}.in-dot.on{background:#22c55e;box-shadow:0 0 10px #22c55e}.in-dot.off{background:#ef4444}
.in-k{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin-bottom:14px}
.in-k>div{border:1px solid color-mix(in srgb,var(--c,#4f8cff) 40%,transparent);border-top:3px solid var(--c,#4f8cff);background:linear-gradient(160deg,color-mix(in srgb,var(--c,#4f8cff) 14%,transparent),transparent 70%);border-radius:14px;padding:12px 14px}
.in-k small{display:block;color:var(--mut);font-size:11.5px;letter-spacing:.06em;text-transform:uppercase;font-weight:700}.in-k b{display:block;font-size:20px;margin-top:4px}.in-k em{display:block;font-style:normal;font-size:12.5px;color:var(--mut);margin-top:2px}
.in-g{display:grid;grid-template-columns:1.2fr 1fr;gap:14px}@media(max-width:900px){.in-g{grid-template-columns:1fr}}
.in-s{border:1px solid var(--line);border-radius:14px;padding:12px 14px;background:rgba(255,255,255,.02);margin-bottom:14px}.in-s h4{margin:0 0 10px;font-size:14px}
.in-row{display:flex;justify-content:space-between;gap:10px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.05);font-size:13.5px}.in-row:last-child{border:0}.in-row span{color:var(--mut)}
.in-bars{display:flex;align-items:flex-end;gap:6px;height:90px;margin:4px 0 2px}.in-bars div{flex:1;background:linear-gradient(180deg,#4f8cff,#2563eb);border-radius:6px 6px 2px 2px;min-height:3px;position:relative}.in-bars div i{position:absolute;bottom:-18px;left:0;right:0;text-align:center;font-style:normal;font-size:10.5px;color:var(--mut)}
.in-iss{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border-radius:12px;margin-bottom:8px;border:1px solid color-mix(in srgb,var(--c) 50%,transparent);background:color-mix(in srgb,var(--c) 10%,transparent)}.in-iss b{display:block}.in-iss small{display:block;color:var(--mut);margin-top:2px}.in-iss .sp{flex:1}
.hl-card{border:1px solid rgba(239,68,68,.45)!important;background:linear-gradient(135deg,rgba(239,68,68,.12),rgba(245,176,65,.07) 60%,transparent)!important;margin-bottom:16px}
.hl-card.ok{border-color:rgba(34,197,94,.45)!important;background:linear-gradient(135deg,rgba(34,197,94,.12),transparent 70%)!important}
.hl-card .hd h3{font-size:16px}.hl-pri{display:inline-block;font-size:10.5px;font-weight:800;letter-spacing:.08em;padding:3px 8px;border-radius:999px;background:#ef4444;color:#fff;margin-left:8px;vertical-align:2px}
.hl-tg{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px;margin-bottom:12px}.hl-tg .tog{margin:0}
.hl-it{display:flex;gap:12px;align-items:center;padding:10px 12px;border-radius:12px;border:1px solid var(--line);background:rgba(0,0,0,.18);margin-bottom:8px}.hl-it .tx{flex:1;min-width:0}.hl-it b{display:block}.hl-it small{display:block;color:var(--mut);font-size:12.5px}
#hlPill{display:none;align-items:center;gap:6px;height:38px;padding:0 12px;border-radius:12px;border:1px solid rgba(239,68,68,.6);background:rgba(239,68,68,.16);color:#fecaca;font:inherit;font-size:13px;font-weight:800;cursor:pointer}
#hlPill.on{display:flex;animation:hlP 2s infinite}@keyframes hlP{50%{box-shadow:0 0 0 6px rgba(239,68,68,.12)}}`;
  document.head.appendChild(css);
  const isAg = () => D.role === 'agent';
  const hm = (secs) => { secs = Math.round(+secs || 0); if (secs < 60) return secs ? secs + ' s' : '0 min'; const m = Math.round(secs / 60); return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + String(m % 60).padStart(2, '0') + ' min'; };
  const when = (t) => (t ? new Date(t).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' }) : '—');
  const KIND = { live: '📺', movie: '🎬', series: '🎞' };
  const PROB = { freeze: 'Immagine ferma', stall: 'Caricamento continuo', error: 'Errore del lettore' };
  const SEV = { bad: '#ef4444', warn: '#f5b041' };
  document.body.insertAdjacentHTML('beforeend', '<div id="insM"><div class="ib" id="insB"></div></div>');
  const M = $('#insM');
  M.addEventListener('click', (e) => { if (e.target === M) close(); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && M.classList.contains('on')) close(); });
  const close = () => M.classList.remove('on');
  async function sendUpd(id, btn) {
    if (btn) { btn.disabled = true; btn.textContent = 'Invio…'; }
    try { await api('POST', '/admin/devices/' + id + '/upd'); toast('Aggiornamento inviato: l\'app lo controlla al prossimo collegamento (entro 1 minuto se è aperta)'); if (btn) btn.textContent = '✓ Inviato'; }
    catch (e) { toast(e.message, 1); if (btn) { btn.disabled = false; btn.textContent = '⬆ Invia aggiornamento'; } }
  }
  async function open(id) {
    M.classList.add('on'); $('#insB').innerHTML = '<p class="mut">Carico i dati del cliente…</p>';
    let x; try { x = await api('GET', '/admin/insight/' + id); } catch (e) { $('#insB').innerHTML = `<p class="mut">${esc(e.message)}</p><button class="btn" id="insX">Chiudi</button>`; $('#insX').onclick = close; return; }
    const maxDay = Math.max(1, ...x.watch.days.map((d) => d.secs));
    const days = []; for (let i = 6; i >= 0; i--) { const dt = new Date(Date.now() - i * 864e5), key = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' }).format(dt); days.push({ key, lbl: dt.toLocaleDateString('it-IT', { weekday: 'short' }), secs: (x.watch.days.find((d) => d.day === key) || {}).secs || 0 }); }
    const updTile = !x.ver ? `<b>—</b><em>versione non nota</em>` : x.needsUpdate ? `<b style="color:#f5b041">${esc(x.ver)}</b><em>⬆ disponibile ${esc(x.latest)}</em>` : `<b style="color:#22c55e">${esc(x.ver)}</b><em>✓ aggiornata${x.latest ? ' (ultima ' + esc(x.latest) + ')' : ''}</em>`;
    $('#insB').innerHTML = `<div class="in-h"><span class="in-dot ${x.online ? 'on' : 'off'}"></span><h3>${esc(x.name || x.code)}</h3><span class="mono mut">${esc(x.code)}</span><span class="ms-tag" style="margin-left:4px">${esc(x.appName)}</span><span class="sp"></span>${x.needsUpdate ? '<button class="btn sm pri" id="insUpd">⬆ Invia aggiornamento</button>' : ''}<button class="btn sm" id="insOpen">Scheda</button><button class="icb" id="insX" title="Chiudi">✕</button></div>
      <div class="in-k">
        <div style="--c:${x.online ? '#22c55e' : '#ef4444'}"><small>${x.online ? 'Collegato ora' : 'Ultima connessione'}</small><b>${x.online ? 'Adesso' : esc(when(x.lastSeen))}</b><em>${esc(x.lastIp || '')}${x.city ? ' · ' + esc(x.city) : ''}</em></div>
        <div style="--c:${x.needsUpdate ? '#f5b041' : '#22c55e'}"><small>Versione dell'app</small>${updTile}</div>
        <div style="--c:#4f8cff"><small>Visto oggi</small><b>${hm(x.watch.today)}</b><em>ultimi 7 giorni: ${hm(x.watch.week)}</em></div>
        <div style="--c:${x.errors.unresolved24 ? '#ef4444' : x.errors.n24 ? '#f5b041' : '#22c55e'}"><small>Errori 24 ore</small><b>${x.errors.n24}</b><em>${x.errors.unresolved24} non risolti · 7 giorni: ${x.errors.n7}</em></div>
        <div style="--c:#a78bfa"><small>Dispositivo</small><b style="font-size:15px">${esc(x.model || '—')}</b><em>${x.net && x.net.type ? esc(x.net.type === 'wifi' ? 'Wi-Fi' + (x.net.rssi ? ' ' + x.net.rssi + ' dBm' : '') : x.net.type === 'eth' ? 'Ethernet' : x.net.type) : 'rete non nota'}${x.net && x.net.dl ? ' · ↓ ' + x.net.dl.toFixed(1) + ' Mbps' : ''}</em></div>
      </div>
      ${x.issues.length ? `<div class="in-s" style="border-color:rgba(239,68,68,.45)"><h4>🩺 Problemi trovati e soluzione</h4>${x.issues.map((i) => `<div class="in-iss" style="--c:${SEV[i.sev]}"><span>${i.sev === 'bad' ? '🔴' : '🟠'}</span><div><b>${esc(i.what)}</b><small>${esc(i.fix)}</small></div><span class="sp"></span>${i.act === 'upd' && x.needsUpdate ? '<button class="btn sm pri" data-insupd>⬆ Invia aggiornamento</button>' : ''}</div>`).join('')}</div>` : '<div class="in-s" style="border-color:rgba(34,197,94,.45)"><h4>🩺 Nessun problema trovato ✓</h4><span class="mut" style="font-size:13px">App aggiornata e visione senza errori nelle ultime 24 ore.</span></div>'}
      <div class="in-g"><div>
        <div class="in-s"><h4>Visione</h4>
          <div class="in-row"><span>${x.now ? 'Sta guardando' : 'Ultima visione'}</span><b>${x.now ? `${KIND[x.now.kind] || ''} ${esc(x.now.title || x.now.ch || '—')}` : x.last ? `${KIND[x.last.kind] || ''} ${esc(x.last.title)} · ${esc(when(x.last.t))}` : '—'}</b></div>
          ${x.now && (x.now.res || x.now.codec) ? `<div class="in-row"><span>Qualità</span><b>${esc([x.now.res, x.now.codec, x.now.engine].filter(Boolean).join(' · '))}</b></div>` : ''}
          <div class="in-bars">${days.map((d) => `<div style="height:${Math.max(3, Math.round((d.secs / maxDay) * 100))}%" title="${esc(d.lbl)}: ${hm(d.secs)}"><i>${esc(d.lbl)}</i></div>`).join('')}</div><div style="height:16px"></div>
        </div>
        <div class="in-s"><h4>Cosa ha guardato (7 giorni)</h4>${x.watch.top.length ? x.watch.top.map((w) => `<div class="in-row"><span>${KIND[w.kind] || ''} ${esc(w.title)}</span><b>${hm(w.secs)}</b></div>`).join('') : '<span class="mut" style="font-size:13px">Nessuna visione registrata (il tempo si conta dalle app aggiornate da oggi).</span>'}</div>
      </div><div>
        <div class="in-s"><h4>Errori dell'app (7 giorni)</h4>${x.errors.list.length ? x.errors.list.map((e) => `<div class="in-row"><span>${esc(when(e.t))} · ${esc(PROB[e.problem] || e.problem)}<br><small class="mut">${esc(e.title || '')}${e.codec ? ' · ' + esc(e.codec) : ''}${e.dec ? ' (' + (e.dec === 'sw' ? 'software' : 'hardware') + ')' : ''}</small></span><b style="color:${e.outcome === 'risolto' ? '#22c55e' : e.outcome === 'non risolto' ? '#ef4444' : 'var(--mut)'}">${esc(e.outcome || '—')}</b></div>`).join('') : '<span class="mut" style="font-size:13px">Nessun errore ✓</span>'}</div>
        <div class="in-s"><h4>Connessione</h4>
          <div class="in-row"><span>Rete</span><b>${x.net && x.net.type ? esc(x.net.type) : '—'}${x.net && x.net.rssi ? ' · ' + x.net.rssi + ' dBm' : ''}</b></div>
          <div class="in-row"><span>Speed test</span><b>${x.net && x.net.dl ? `↓ ${x.net.dl.toFixed(1)} · ↑ ${(x.net.ul || 0).toFixed(1)} Mbps · ${Math.round(x.net.ping)} ms` : '—'}</b></div>
          <div class="in-row"><span>Aggiornamento inviato</span><b>${x.updSent ? esc(when(x.updSent)) : 'mai'}</b></div>
        </div>
      </div></div>`;
    $('#insX').onclick = close;
    $('#insOpen').onclick = () => { close(); const d = D.devices.find((y) => y.id === x.id); if (d) openDrawer(d); };
    $$('#insUpd, [data-insupd]').forEach((b) => (b.onclick = () => sendUpd(x.id, b)));
  }
  window.KXInsight = { open, sendUpd };

  /* ---------- 🩺 Salute delle app ---------- */
  let H = null, hT = 0, lastBad = -1;
  async function loadH(force) { if (!force && Date.now() - hT < 45e3) return; hT = Date.now(); try { H = await api('GET', '/admin/health'); } catch { H = null; } drawH(); }
  function cardHtml(full) {
    if (!H) return '';
    const on = H.settings && H.settings.on, L = on ? H.list || [] : [], bad = L.filter((x) => x.bad).length;
    const tg = isAg() ? '' : `<div class="hl-tg"><div class="tog ${on ? 'on' : ''}" data-hlt="on"><div><b>Controllo salute delle app</b><small>Il pannello controlla di continuo versioni, errori e blocchi e te li segnala qui (consigliato)</small></div><i></i></div><div class="tog ${H.settings && H.settings.autoUpd ? 'on' : ''}" data-hlt="autoUpd"><div><b>Aggiorna da solo le app vecchie</b><small>Chi ha una versione vecchia riceve subito l'aggiornamento, senza che tu lo mandi (Kairos Pro)</small></div><i></i></div></div>`;
    const lat = H.latest ? Object.entries(H.latest).filter(([, v]) => v).map(([k, v]) => `${{ tv: 'Pro', ktv: 'TV', lite: 'Lite', xc: 'XC' }[k]} ${esc(v)}`).join(' · ') : '';
    const items = L.slice(0, full ? 30 : 5).map((x) => `<div class="hl-it"><span>${x.bad ? '🔴' : '🟠'}</span><div class="tx"><b>${esc(x.name || x.code)} <span class="mono mut" style="font-weight:400;font-size:12px">${esc(x.code)}</span></b><small>${x.issues.map((i) => esc(i.what)).join(' · ')}</small><small>💡 ${esc(x.issues[0].fix)}</small></div>${x.issues.some((i) => i.act === 'upd') ? `<button class="btn sm pri" data-hlupd="${esc(x.id)}">${x.updSent ? '⬆ Reinvia' : '⬆ Invia aggiornamento'}</button>` : ''}<button class="btn sm" data-hldati="${esc(x.id)}">📊 Dati</button></div>`).join('');
    return `<div class="card glass hl-card ${on && !L.length ? 'ok' : ''}" data-hlcard><div class="hd"><h3>🩺 Salute delle app<span class="hl-pri">PRIORITÀ ASSOLUTA</span><small>Le app dei clienti devono essere sempre fluide e senza errori${lat ? ' · ultime versioni: ' + lat : ''}</small></h3>${!on ? '<b style="color:#f5b041;font-size:14px">Controllo spento</b>' : L.length ? `<b style="color:${bad ? '#ef4444' : '#f5b041'};font-size:14px">${L.length} ${L.length === 1 ? 'cliente' : 'clienti'} da controllare</b>` : '<b style="color:#22c55e">Tutto a posto ✓</b>'}</div>
      ${tg}${!on ? `<p style="margin:0;font-size:13.5px;color:#fde68a">${isAg() ? 'Il controllo della salute delle app lo attiva il titolare.' : '⚠️ Accendi «Controllo salute delle app»: il pannello ti segnala qui e in alto ogni cliente con app vecchia, errori o blocchi, con la soluzione.'}</p>` : L.length ? items + (L.length > (full ? 30 : 5) ? `<small class="mut">…e altri ${L.length - (full ? 30 : 5)}</small>` : '') : '<p class="mut" style="margin:0;font-size:13px">Nessun cliente con app vecchia, errori o blocchi negli ultimi giorni.</p>'}</div>`;
  }
  function drawH() {
    const L = (H && H.settings && H.settings.on && H.list) || [], bad = L.filter((x) => x.bad).length;
    // pulsante rosso in alto quando ci sono problemi
    let pill = $('#hlPill');
    if (!pill) { const a = $('#arB') || $('#bellB'); if (a) { a.insertAdjacentHTML('beforebegin', '<button id="hlPill" type="button" title="Salute delle app: clienti da controllare"></button>'); pill = $('#hlPill'); pill.onclick = () => { if (window.KXGoTab && KXGoTab('live')) setTimeout(() => { const c = $('#v-live [data-hlcard]'); if (c) c.scrollIntoView({ behavior: 'smooth' }); }, 400); else view('dash'); }; } }
    if (pill) { pill.classList.toggle('on', L.length > 0); pill.innerHTML = `🩺 ${L.length}`; pill.style.borderColor = bad ? '' : 'rgba(245,176,65,.6)'; }
    // avviso nel pannello quando compaiono problemi gravi nuovi
    if (lastBad >= 0 && bad > lastBad) toast(`🩺 ${bad - lastBad} ${bad - lastBad === 1 ? 'cliente ha' : 'clienti hanno'} problemi con l'app: guarda «Salute delle app»`, 1);
    lastBad = bad;
    for (const [sel, full] of [['#v-dash', false], ['#v-live', true]]) {
      const V = $(sel); if (!V) continue;
      let c = V.querySelector(':scope > [data-hlwrap]');
      if (!c) { c = document.createElement('div'); c.dataset.hlwrap = '1'; V.prepend(c); }
      const html = cardHtml(full); if (c.dataset.h !== html) { c.dataset.h = html; c.innerHTML = html; }
      $$('[data-hlupd]', c).forEach((b) => (b.onclick = async () => { await sendUpd(b.dataset.hlupd, b); loadH(true); }));
      $$('[data-hldati]', c).forEach((b) => (b.onclick = () => open(b.dataset.hldati)));
      $$('[data-hlt]', c).forEach((t) => (t.onclick = async () => { const k = t.dataset.hlt, v = !t.classList.contains('on'); try { const r = await api('PUT', '/admin/health/settings', { [k]: v }); H.settings = r.health; toast(k === 'on' ? (v ? 'Controllo salute attivo' : 'Controllo salute spento') : v ? 'Le app vecchie si aggiornano da sole' : 'Aggiornamento automatico spento'); delete c.dataset.h; drawH(); } catch (e) { toast(e.message, 1); } }));
    }
  }
  // l'elenco di «Online ora» si ridisegna da solo: la scheda della salute resta in cima
  const lv = $('#v-live'); if (lv) new MutationObserver(() => { if (!lv.querySelector(':scope > [data-hlwrap]') && H) { delete (lv.dataset || {}).x; drawH(); } }).observe(lv, { childList: true });
  const ra = renderAll;
  window.renderAll = renderAll = function () { ra(); loadH(); drawH(); };
  if (typeof DEMO !== 'undefined') {
    const HS = { on: false, autoUpd: false }, UPD = {};
    const oldIds = () => DEMO.devices.filter((d) => !d.parent && d.playlists && d.playlists.length).slice(0, 2).map((d) => d.id);
    const dm = demoApi;
    window.demoApi = demoApi = async function (m, p, b) {
      const ii = p.match(/^\/admin\/insight\/(.+)$/);
      if (ii) { const d = DEMO.devices.find((x) => x.id === ii[1]) || DEMO.devices[0], k = DEMO.devices.indexOf(d), t = Date.now(), old = oldIds().includes(d.id); return { id: d.id, name: d.name, code: d.code, app: 'tv', appName: 'Kairos Pro', model: d.model || 'AFTMM Fire TV Stick 4K', online: k % 2 === 0, lastSeen: t - (k % 2 ? 3600e3 : 0), lastIp: '93.45.10.20', city: 'Milano, IT', ver: old ? '2.4.2' : '2.5.2', latest: '2.5.2', needsUpdate: old, updSent: UPD[d.id] || 0, now: k % 2 === 0 ? { kind: 'live', title: 'Sky Sport 1', res: '1920×1080', codec: 'H.264', engine: 'exo' } : null, last: { kind: 'movie', title: 'Dune - Parte Due', t: t - 7200e3 }, net: { type: 'wifi', rssi: -72, dl: 24.5, ul: 6.1, ping: 22, t: t - 3600e3 },
        watch: { today: 5400, week: 41000, days: [6, 5, 4, 3, 2, 1, 0].map((i) => ({ day: new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' }).format(new Date(t - i * 864e5)), secs: [3600, 7200, 1800, 9000, 4500, 9500, 5400][i] })), top: [['live', 'Sky Sport 1', 14200], ['movie', 'Dune - Parte Due', 9600], ['live', 'Rai 1 HD', 7300], ['series', 'Mare Fuori S4 E2', 3100]].map(([kind, title, secs]) => ({ kind, title, secs, last: t })) },
        errors: { n24: old ? 4 : 0, n7: old ? 9 : 1, unresolved24: old ? 3 : 0, list: old ? [{ t: t - 600e3, problem: 'freeze', outcome: 'non risolto', title: 'Sky Sport Uno 4K', codec: 'HEVC', dec: 'sw' }, { t: t - 4000e3, problem: 'stall', outcome: 'risolto', title: 'DAZN 1', codec: 'H.264', dec: 'hw' }] : [] },
        issues: old ? [{ sev: 'warn', key: 'upd', what: 'App vecchia: 2.4.2 (ultima 2.5.2)', fix: 'Invia l\'aggiornamento: l\'app lo propone subito al cliente', act: 'upd' }, { sev: 'bad', key: 'err', what: '3 errori non risolti nelle ultime 24 ore', fix: 'Canali HEVC/H.265 su un dispositivo che fatica: usa la versione H.264 del canale o un dispositivo più recente', act: 'upd' }] : [] }; }
      if (p === '/admin/health' && m === 'GET') { const L = oldIds().map((id) => DEMO.devices.find((d) => d.id === id)).map((d, k) => ({ id: d.id, name: d.name, code: d.code, app: 'tv', ver: '2.4.2', online: true, lastSeen: Date.now(), updSent: UPD[d.id] || 0, bad: k === 0 ? 1 : 0, issues: [{ sev: 'warn', key: 'upd', what: 'App vecchia: 2.4.2 (ultima 2.5.2)', fix: 'Invia l\'aggiornamento: l\'app lo propone subito al cliente', act: 'upd' }, ...(k === 0 ? [{ sev: 'bad', key: 'err', what: '3 errori non risolti nelle ultime 24 ore', fix: 'Canali HEVC: usa la versione H.264 del canale' }] : [])] })); return { list: L, latest: { tv: '2.5.2', ktv: '1.0.0', lite: '1.2.0', xc: '1.0.0' }, settings: { ...HS } }; }
      if (p === '/admin/health/settings') { Object.assign(HS, b); return { ok: true, health: { ...HS } }; }
      const up = p.match(/^\/admin\/devices\/(.+)\/upd$/); if (up) { UPD[up[1]] = Date.now(); return { ok: true, t: UPD[up[1]] }; }
      return dm(m, p, b);
    };
  }
})();
