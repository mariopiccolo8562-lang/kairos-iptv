/* KAIROS Control — «Pannello WOLF»: il pannello reseller WOLF collegato a KAIROS.
   Le linee non vengono copiate: questa sezione legge e scrive direttamente su WOLF, quindi una linea creata o
   modificata su WOLF si vede qui e una creata o modificata qui si vede su WOLF. Una linea si può collegare a un
   cliente KAIROS: se cambiano utente o password (da qui o da WOLF) la sua playlist si aggiorna da sola.
   Titolare, e agenti con il permesso «Pannello WOLF» (con il loro account reseller WOLF). Utente e password di WOLF restano cifrati sul server. Usa le funzioni di app.js. */
(() => {
  const css = document.createElement('style');
  css.textContent = `
.wf-st{display:flex;align-items:center;gap:14px;flex-wrap:wrap}.wf-st .cr{font-size:26px;font-weight:800}.wf-st small{display:block;color:var(--mut);font-size:12px}
.wf-f{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.wf-f .inp{margin:0}
.wf-f label{display:flex;flex-direction:column;gap:5px;font-size:11.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--mut)}
.wf-row{display:grid;grid-template-columns:60px minmax(0,1.2fr) minmax(0,1fr) minmax(0,.9fr) minmax(0,1fr) auto;gap:10px;align-items:center;padding:9px 0;border-top:1px solid var(--line);font-size:13px}
.wf-row .k{font-size:11px;color:var(--mut);display:block}.wf-row .mono{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wf-v{display:flex;align-items:center;gap:4px;min-width:0}.wf-v .mono{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wf-v button{flex:none;background:none;border:0;color:var(--mut);cursor:pointer;padding:2px 5px;border-radius:5px;font:inherit;font-size:12px}.wf-v button:hover{color:var(--txt,#fff);background:#ffffff14}
.wf-tag{display:inline-block;font-size:10.5px;font-weight:700;padding:1px 7px;border-radius:5px;background:rgba(52,199,123,.15);color:#6ee3a6;margin-right:4px}
.wf-tag.w{background:rgba(224,164,49,.16);color:#ecc06f}.wf-tag.b{background:rgba(255,107,107,.14);color:#ff8f8f}.wf-tag.g{background:#ffffff12;color:var(--mut)}
.wf-act{display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap}
.wf-tabs{display:flex;gap:6px;margin:14px 0 0}.wf-tabs button{background:#ffffff0d;border:1px solid var(--line);color:var(--mut);padding:7px 14px;border-radius:9px;font:inherit;font-weight:700;font-size:13px;cursor:pointer}.wf-tabs button.on{color:var(--txt,#fff);background:#ffffff1c}
.wf-rs{display:grid;grid-template-columns:minmax(0,1.3fr) 80px 80px minmax(0,1fr) minmax(0,1.1fr) auto;gap:10px;align-items:center;padding:10px 0;border-top:1px solid var(--line);font-size:13px}.wf-rs .k{font-size:11px;color:var(--mut);display:block}.wf-rs .n{font-size:17px;font-weight:800}
.wf-bq{margin-top:14px;padding-top:12px;border-top:1px solid var(--line)}.wf-bq-head{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}.wf-bq-head b{font-size:13px}.wf-bq-note{font-size:11.5px;color:var(--mut);margin:5px 0 8px}
.wf-bq-tools,.wf-bq-presets,.wf-bq-savebox{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.wf-bq-presets{margin:8px 0}.wf-bq-option{display:inline-flex;gap:3px;align-items:center}.wf-bq-option button{font-size:11.5px;padding:5px 8px}.wf-bq-option .wf-bq-del{padding:4px 6px;color:#ff9b9b}
.wf-bq-list{max-height:260px;overflow:auto;border:1px solid var(--line);border-radius:9px;padding:5px 8px}.wf-bq-row{display:grid;grid-template-columns:18px minmax(0,1fr);gap:7px;align-items:center;padding:5px 2px;font-size:12.5px;overflow-wrap:anywhere}.wf-bq-row input{margin:0;accent-color:#22c55e}
.wf-bq-savebox{margin-top:8px}.wf-bq-savebox .inp{flex:1;min-width:150px}.wf-bq-unavailable{padding:10px;border:1px solid #f5b04155;border-radius:8px;color:#f5c46d;background:#f5b04112;font-size:12.5px}
@media (max-width:1000px){.wf-rs{grid-template-columns:1fr 1fr 1fr}.wf-rs .wf-act{grid-column:1/-1;justify-content:flex-start}}
@media (max-width:1000px){.wf-f{grid-template-columns:1fr 1fr}.wf-row{grid-template-columns:1fr 1fr}.wf-act{grid-column:1/-1;justify-content:flex-start}}
@media (max-width:560px){.wf-f{grid-template-columns:1fr}.wf-bq-list{max-height:34vh}.wf-bq-savebox{align-items:stretch}.wf-bq-savebox .inp{min-width:0;width:100%}}`;
  document.head.appendChild(css);

  const IC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4l4 5 4-3 4 3 4-5v9a8 8 0 0 1-16 0z"/><path d="M9 13h.01M15 13h.01M10 17l2 1 2-1"/></svg>';
  if (!$('.nav[data-v="wolf"]')) {
    const b = document.createElement('button'); b.className = 'nav'; b.dataset.v = 'wolf'; b.innerHTML = IC + 'Pannello WOLF'; b.onclick = () => view('wolf');
    const anchor = $('.nav[data-v="armada"]') || $('.nav[data-v="devices"]'); anchor ? anchor.after(b) : $('#side').appendChild(b);
    const sec = document.createElement('section'); sec.className = 'view'; sec.id = 'v-wolf'; $('#v-dash').after(sec);
  }
  TITLES.wolf = 'Pannello WOLF';

  const W = { cfg: null, data: null, pk: null, err: '', q: '', f: '', sort: '', days: 0, own: '', limit: 100, show: new Set(), busy: false, tab: 'lines', rs: null, rsBusy: false, rsErr: '', sel: new Set(), st: false };
  const isAg = () => D.role === 'agent';
  const DAY = 864e5, fmtD = (t) => (t ? new Date(t).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Illimitata');
  // giorni di calendario (scade il 15, oggi è il 10 → «tra 5 g»), come nella pagina venditore
  const left = (t) => { if (!t) return ''; const e = new Date(t), n = new Date(), d = Math.round((Date.UTC(e.getFullYear(), e.getMonth(), e.getDate()) - Date.UTC(n.getFullYear(), n.getMonth(), n.getDate())) / DAY); return d < 0 ? `scaduta da ${-d} g` : d === 0 ? (t < Date.now() ? 'scaduta oggi' : 'scade oggi') : `tra ${d} g`; };
  const copy = (t, w) => navigator.clipboard.writeText(t).then(() => toast(w + ' copiato'), () => toast('Copia non consentita dal browser', 1));
  const gen = (n) => { const a = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'; const r = crypto.getRandomValues(new Uint8Array(n)); return [...r].map((x) => a[x % a.length]).join(''); };
  const devs = () => (Array.isArray(D.devices) ? D.devices : []).filter((d) => d && d.id);
  const devOpts = (sel) => '<option value="">— nessuno —</option>' + devs().map((d) => `<option value="${esc(d.id)}"${d.id === sel ? ' selected' : ''}>${esc(d.name || d.code)}${d.name && d.code ? ' · ' + esc(d.code) : ''}</option>`).join('');
  const pkOpts = () => (W.pk || []).map((p) => `<option value="${esc(p.id)}">${esc(p.name)} · ${p.credits} credit${p.credits === 1 ? 'o' : 'i'}</option>`).join('');
  const BQ_PRESET_DEFAULTS = [
    { id: 'default-full', name: 'FULL (tutto)', mode: 'drop', ids: [], words: [] },
    { id: 'default-no-foreign-adult', name: 'Togli stranieri e XXX', mode: 'drop', ids: [], words: ['@foreign', '@adult'] },
    { id: 'default-no-foreign', name: 'Togli stranieri', mode: 'drop', ids: [], words: ['@foreign'] },
    { id: 'default-single-flow', name: 'Flusso unico', mode: 'keep', ids: [], words: [] },
  ];
  const BQ_ADULT = /xxx|adult|adulti|18\+|porn|hot\b|for adults/i;
  const BQ_ITALIAN = /\b(?:IT|ITA|ITALIA|ITALY|RAI|MEDIASET)\b|\b(?:SKY|DAZN)\s*IT\b/i;
  const BQ_FOREIGN = /\bSTRANIER[IOE]\b|^(?:[A-Z]{2}[ |:-])|\b(?:UK|U\.?K\.?|USA|U\.?S\.?A\.?|US|DE|DEUTSCH|GERMAN|FR|FRENCH|ES|ESPANA|SPANISH|AL|ALBANIA|RO|ROMANIA|AR|ARAB|TURK|TURKEY|POLSKA|POLAND|RU|RUSSIA|UA|UKRAINE|PT|PORTUGAL|BRASIL|LATINO|GREEK|NL|NETHERLANDS|CZ|CZECH|BG|BULGARIA|SRB|SERBIA|HR|CROATIA|BA|BOSNIA|HU|HUNGARY)\b/i;
  const bqIsAdult = (name) => BQ_ADULT.test(String(name || ''));
  const bqIsForeign = (name) => { const n = String(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase(); return !BQ_ITALIAN.test(n) && BQ_FOREIGN.test(n); };
  const m3u = (l) => { const h = (W.data && W.data.dns) || l.dns; return h ? `${h}/get.php?username=${encodeURIComponent(l.username)}&password=${encodeURIComponent(l.password)}&type=m3u_plus&output=ts` : ''; };

  async function loadCfg() { try { W.cfg = await api('GET', '/admin/wolf/config'); W.err = ''; } catch (e) { W.cfg = { set: false }; W.err = e.message; } }
  async function loadLines(fresh, afterRenew = false) {
    if (!W.cfg || !W.cfg.set) return null;
    W.busy = true; render();
    let loaded = null;
    try { W.data = loaded = await api('GET', '/admin/wolf/lines' + (fresh ? '?fresh=1' : '')); W.err = ''; if (W.data.synced) toast(`${W.data.synced} playlist aggiornate da WOLF`); if (window.KXLineSync) KXLineSync.apply('wolf', W.data.lines || W.data.rows, afterRenew, api); }
    catch (e) { W.err = e.message; }
    W.busy = false; show();
    return loaded;
  }
  async function loadRs() {
    W.rsBusy = true; render();
    try { W.rs = await api('GET', '/admin/wolf/resellers'); W.rsErr = ''; } catch (e) { W.rsErr = e.message; }
    W.rsBusy = false; render();
  }
  async function loadPk() { if (W.pk) return; try { W.pk = (await api('GET', '/admin/wolf/packages')).packages || []; } catch (e) { W.pk = []; toast(e.message, 1); } }

  function cfgForm(c) {
    if (isAg()) return `<div class="wf-f" style="margin-top:12px">
      <label>Pannello WOLF<input class="inp" value="${esc(c.url || 'Quello di chi ti gestisce')}" readonly></label>
      <label>Il tuo utente WOLF<input class="inp" id="wfUser" value="${esc(c.user || '')}" autocomplete="off"></label>
      <label>La tua password WOLF<input class="inp" id="wfPass" type="password" autocomplete="new-password" placeholder="${c.set ? 'lascia vuoto per non cambiarla' : ''}"></label></div>
      <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><button class="btn" id="wfSave">${c.set ? 'Salva' : 'Collega il mio account'}</button>${c.set ? '<button class="btn sm ghost" id="wfOff">Scollega</button>' : ''}</div>`;
    return `<div class="wf-f" style="margin-top:12px">
      <label>Indirizzo di WOLF<input class="inp mono" id="wfUrl" value="${esc(c.url || '')}" placeholder="https://pannello.esempio.com"></label>
      <label>Utente<input class="inp" id="wfUser" value="${esc(c.user || '')}" autocomplete="off"></label>
      <label>Password<input class="inp" id="wfPass" type="password" autocomplete="new-password" placeholder="${c.set ? 'lascia vuoto per non cambiarla' : ''}"></label>
      <label>DNS delle linee (facoltativo)<input class="inp mono" id="wfDns" value="${esc(c.dns || '')}" placeholder="si trova da solo, es. http://server.tv"></label></div>
      <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><button class="btn" id="wfSave">${c.set ? 'Salva' : 'Collega WOLF'}</button>${c.set ? '<button class="btn sm ghost" id="wfOff">Scollega WOLF</button>' : ''}</div>`;
  }
  const status = (l) => !l.enabled ? '<span class="wf-tag b">Disattivata</span>' : l.exp && l.exp < Date.now() ? '<span class="wf-tag b">Scaduta</span>' : l.exp && l.exp - Date.now() < 7 * DAY ? '<span class="wf-tag w">In scadenza</span>' : '<span class="wf-tag">Attiva</span>';
  function filtered() {
    const q = W.q.trim().toLowerCase(), now = Date.now();
    return ((W.data && W.data.lines) || []).filter((l) => {
      if (q && !`${l.id} ${l.username} ${l.note} ${l.owner}`.toLowerCase().includes(q)) return false;
      if (W.own && l.owner !== W.own) return false;
      if (W.f === 'on') return l.enabled && (!l.exp || l.exp > now);
      if (W.f === 'soon') return l.enabled && l.exp && l.exp > now && l.exp < now + 7 * DAY;
      if (W.f === 'exp') return l.exp && l.exp < now;
      if (W.f === 'off') return !l.enabled;
      if (W.f === 'link') return linkOf(l.id);
      if (W.f === 'conn') return l.conns > 0;
      if (W.f === 'disc') return !(l.conns > 0);
      return true;
    });
  }
  const filtered0 = filtered;
  filtered = () => (window.KXSort ? KXSort.apply(filtered0(), W, { exp: (l) => +l.exp || 0, name: (l) => l.username, enabled: (l) => !!l.enabled, conns: (l) => l.conns, owner: (l) => l.owner, created: (l) => +l.created || 0, payKey: (l) => ['wolf', l.id] }) : filtered0());
  const linkOf = (id) => ((W.data && W.data.links) || []).find((k) => k.line === id);

  /* «pagina venditore» per gli agenti (seller.js): saluto, crediti WOLF, azioni rapide, collegati ora, abbonamenti,
     vendite (oggi / mese), da gestire e prossime scadenze con «Rinnova». Calcolata dalle linee già lette da WOLF:
     nessuna richiesta in più al pannello. Un clic apre le linee con il filtro giusto. */
  const ms = (t) => { const n = Number(t) || 0; return n && n < 1e11 ? n * 1000 : n; };
  function sellerHtml(d) {
    const L = Array.isArray(d.lines) ? d.lines : null, now = Date.now(), wait = !L;
    const cnt = (f) => (wait ? '…' : L.filter(f).length);
    const t0 = new Date(); t0.setHours(0, 0, 0, 0); const day0 = t0.getTime(), mon0 = new Date(t0.getFullYear(), t0.getMonth(), 1).getTime();
    const active = (l) => l.enabled && (!l.exp || ms(l.exp) > now);
    const hasCreated = !wait && L.some((l) => ms(l.created));
    const sold = (from) => (wait ? '…' : hasCreated ? L.filter((l) => ms(l.created) >= from).length : '—');
    const trials = wait ? 0 : L.filter((l) => l.trial && active(l)).length;
    W.sx = wait ? [] : L.filter((l) => l.enabled && ms(l.exp) > now && ms(l.exp) < now + 30 * DAY).sort((a, b) => ms(a.exp) - ms(b.exp)).slice(0, 6); // entro 30 giorni
    return KXSeller.html({
      user: W.cfg.user, sub: '✅ WOLF collegato · il tuo account',
      credits: d.credits ?? (wait ? '…' : '—'),
      actions: [['new', '⚡', 'Nuova linea', 'Attiva un nuovo abbonamento'], ['soon', '↻', 'Rinnova linea', 'Le linee in scadenza'], ['conn', '🔗', 'Collegate ora', 'Chi sta guardando adesso'], ...($('.nav[data-v="agk"]') ? [['agk', '📲', 'App Kairos', 'Link e codici per i clienti']] : [])],
      tiles: [
        { go: 'conn', label: 'Collegati ora', value: cnt((l) => l.conns > 0), color: '#3dffb0', note: 'linee collegate in questo momento' },
        { go: 'on', label: 'Abbonamenti', value: cnt(active), note: wait ? 'linee attive' : `linee attive su ${L.length}${trials ? ' · ' + trials + ' prove' : ''}` },
        { label: 'Vendite', two: [{ go: 'sold', value: sold(day0), note: 'linee oggi' }, { go: 'sold', value: sold(mon0), note: 'questo mese' }] },
        { label: 'Da gestire', two: [{ go: 'soon', value: cnt((l) => l.enabled && ms(l.exp) > now && ms(l.exp) < now + 7 * DAY), color: '#ffb020', note: 'in scadenza (7 giorni)' }, { go: 'exp', value: cnt((l) => l.exp && ms(l.exp) < now), color: '#ff6b6b', note: 'scadute da rinnovare' }] },
      ],
      exp: wait ? null : W.sx.map((l) => ({ name: l.username, exp: ms(l.exp), note: l.note })), expMore: 'soon',
    });
  }
  function sellerGo(k) {
    if (k === 'new') return newLine();
    if (k === 'agk') return typeof view === 'function' ? view('agk') : null;
    W.tab = 'lines'; W.q = ''; W.own = ''; W.limit = 100;
    if (k === 'sold') { W.f = ''; W.sort = 'new'; } else W.f = k;
    render();
    const q = $('#wfQ'); if (q && q.scrollIntoView) q.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function render() {
    const V = $('#v-wolf'); if (!V) return;
    if (!W.cfg) { V.innerHTML = '<div class="card glass"><p class="mut">Carico…</p></div>'; return; }
    if (!W.cfg.set) {
      if (isAg() && !W.cfg.ownerSet) { V.innerHTML = `<div class="card glass"><b style="font-size:15px">Pannello WOLF</b><p class="mut" style="margin:6px 0 0">Chi ti gestisce non ha ancora collegato WOLF a KAIROS.</p>${W.err ? `<p style="color:#ff8f8f">${esc(W.err)}</p>` : ''}</div>`; return; }
      V.innerHTML = `<div class="card glass"><b style="font-size:15px">${isAg() ? 'Collega il tuo account WOLF' : 'Collega il pannello WOLF'}</b>
        <p class="mut" style="margin:6px 0 0">${isAg() ? 'Scrivi utente e password con cui entri su WOLF. Vedrai le tue linee e i tuoi crediti; restano cifrati sul server.' : 'Scrivi indirizzo, utente e password del tuo account WOLF. Restano cifrati sul server e servono a KAIROS per leggere e modificare le linee come fai tu dal browser.'}</p>
        ${W.err ? `<p style="color:#ff8f8f">${esc(W.err)}</p>` : ''}${cfgForm(W.cfg)}</div>`;
      bindCfg(); return;
    }
    const d = W.data || {}, list = filtered(), shown = list.slice(0, W.limit);
    const FL = [['', 'Tutte'], ['on', 'Attive'], ['soon', 'In scadenza'], ['exp', 'Scadute'], ['off', 'Disattivate'], ['conn', 'Collegate ora'], ['disc', 'Scollegate'], ...(isAg() ? [] : [['link', 'Collegate a clienti']])];
    const seller = isAg() && !!window.KXSeller;
    V.innerHTML = `${seller ? sellerHtml(d) : ''}<div class="card glass"><div class="wf-st"><div style="flex:1;min-width:220px"><b style="font-size:15px">✅ Pannello WOLF collegato</b><small>${isAg() ? esc(W.cfg.user) : esc(W.cfg.url) + ' · ' + esc(W.cfg.user)}</small><small>Quello che fai qui succede subito anche su WOLF, e viceversa.</small></div>
        ${seller ? '' : `<div><small>Crediti WOLF</small><span class="cr">${d.credits ?? '—'}</span></div><div><small>Linee</small><span class="cr">${d.lines ? d.lines.length : '—'}</span></div>`}
        <button class="btn sm" id="wfPw">Cambia password</button><button class="btn sm" id="wfRe">${W.busy || W.rsBusy ? 'Carico…' : 'Aggiorna'}</button>${W.tab === 'log' ? '' : `<button class="btn sm" id="wfNew">${W.tab === 'rs' ? '+ Nuovo reseller' : '+ Nuova linea'}</button>`}${W.tab === 'lines' && window.KXQuick ? KXQuick.button('wolf') : ''}</div>
        ${W.err ? `<p style="color:#ff8f8f;margin:10px 0 0">${esc(W.err)}</p>` : ''}
        <details style="margin-top:12px"><summary style="cursor:pointer;font-weight:600;font-size:13px">Impostazioni WOLF</summary>${cfgForm(W.cfg)}</details>
        <div class="wf-tabs"><button data-t="lines" class="${W.tab === 'lines' ? 'on' : ''}">Linee${d.lines ? ' · ' + d.lines.length : ''}</button><button data-t="rs" class="${W.tab === 'rs' ? 'on' : ''}">Reseller${W.rs ? ' · ' + W.rs.resellers.length : ''}</button>${isAg() ? '' : `<button data-t="log" class="${W.tab === 'log' ? 'on' : ''}">📜 Registro</button>`}</div></div>
      ${W.tab === 'lines' && d.lines && window.KXStats && !seller ? KXStats.strip(KXStats.tiles(KXStats.calc(d.lines))) : ''}${W.tab === 'lines' && window.KXPay ? KXPay.panelTile('wolf') : ''}
      ${W.tab === 'rs' ? rsHtml() : W.tab === 'log' ? '<div class="card glass" style="margin-top:14px"><div id="wfPanelLog"></div></div>' : `<div class="card glass" style="margin-top:14px">
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><input class="inp" id="wfQ" placeholder="Cerca utente, ID o nota" value="${esc(W.q)}" style="max-width:280px;margin:0">
          <select class="inp" id="wfF" style="width:auto;margin:0">${FL.map(([k, t]) => `<option value="${k}"${W.f === k ? ' selected' : ''}>${t}</option>`).join('')}</select>${window.KXSort ? KXSort.ui(W, 'wf') : ''}
          <select class="inp" id="wfO" style="width:auto;margin:0"><option value="">Tutti i reseller</option>${owners().map(([o, n]) => `<option value="${esc(o)}"${W.own === o ? ' selected' : ''}>${esc(o)} · ${n}</option>`).join('')}</select>
          <span class="mut" style="font-size:12.5px">${list.length} linee</span></div>
        ${d.lines && window.KXTools ? KXTools.bar('wf', selOf(list).length, list.length, [['ext', 'Rinnova', 'pri'], ['on', 'Attiva'], ['off', 'Disattiva'], ['msg', 'Messaggio ai clienti']]) + (W.st ? statsHtml() : '') : ''}
        <div style="margin-top:8px">${!d.lines ? `<p class="mut">${W.busy ? 'Carico le linee da WOLF…' : 'Nessun dato'}</p>` : shown.map((l) => {
          const k = linkOf(l.id), sh = W.show.has(l.id), conn = l.conns == null && l.max == null ? '' : `${l.conns ?? '?'}/${l.max || '?'}`;
          return `<div class="wf-row" data-id="${l.id}"><div><span class="k">${window.KXTools ? KXTools.ck('wf', l.id, W.sel.has(String(l.id))) : ''}ID</span>${l.id}</div>
            <div><span class="k">Utente / password</span><div class="wf-v"><b class="mono">${esc(l.username)}</b><button data-a="cu" title="Copia utente">⧉</button></div><div class="wf-v"><span class="mono">${sh ? esc(l.password) : '••••••'}</span><button data-a="eye" title="${sh ? 'Nascondi' : 'Mostra'} password">${sh ? 'Nascondi' : 'Mostra'}</button><button data-a="cp" title="Copia password">⧉</button></div></div>
            <div><span class="k">Scadenza</span>${fmtD(l.exp)}<br><small class="mut">${left(l.exp)}</small>${window.KXPay ? KXPay.badge('line', 'wolf', l.id) : ''}</div>
            <div><span class="k">Stato</span>${window.KXOnline ? KXOnline.dot({ on: l.conns > 0, conns: l.conns, max: l.max }) + (l.conns > 0 && l.watching ? `<small class="mut" title="Sta guardando"> ▶ ${esc(l.watching)}</small>` : '') + '<br>' : ''}${status(l)}${l.trial ? '<span class="wf-tag g">Prova</span>' : ''}${conn ? `<br><small class="mut">${esc(conn)} conn.</small>` : ''}</div>
            <div><span class="k">Nota / cliente KAIROS</span><div class="mono">${esc(l.note) || '<span class="mut">—</span>'}</div>${k ? `<span class="wf-tag">↔ ${esc(k.name)}</span>` : ''}${l.owner && l.owner !== W.cfg.user ? `<span class="wf-tag g" title="Reseller">${esc(l.owner)}</span>` : ''}</div>
            <div class="wf-act"><button class="btn sm act-edit" data-a="edit">Modifica</button><button class="btn sm act-renew" data-a="ext">Rinnova</button>${window.KXPay && KXPay.canEdit() ? `<button class="btn sm act-pay" data-kxpay-open data-kind="line" data-panel="wolf" data-ref="${esc(l.id)}" data-label="${esc(l.username)}" data-owner="${+l.ownerId || 0}" data-auto-line="${esc(l.id)}" data-panel-note="${esc(l.note || '')}">💰 Pagamento</button>` : ''}${isAg() ? '' : `<button class="btn sm" data-a="link">${k ? 'Cliente' : 'Collega cliente'}</button>`}<button class="btn sm act-m3u" data-a="m3u">M3U</button>${window.KXMxpNew && (!window.KXMxpCan || KXMxpCan() || isAg() && !!(((D.me || {}).perms || {}).players)) ? '<button class="btn sm act-mxp" data-a="mxp" title="Crea il cliente su MaxPlayer con questa linea">MaxPlayer</button>' : ''}${window.KXOxpNew && (!window.KXOxpCan || KXOxpCan() || isAg() && !!(((D.me || {}).perms || {}).players)) ? '<button class="btn sm act-oxp" data-a="oxp" title="Aggiungi questa linea a un dispositivo OrbixPlay">OrbixPlay</button>' : ''}${window.KXOrcpNew && (!isAg() || KXOrcpAgentCan()) ? '<button class="btn sm act-orcp" data-a="orcp" title="Segna la linea per l\'app e prepara il messaggio al cliente">' + esc(KXOrcpName()) + '</button>' : ''}<button class="btn sm ghost act-toggle ${l.enabled ? '' : 'act-toggle-on'}" data-a="tgl">${l.enabled ? 'Disattiva' : 'Attiva'}</button><button class="btn sm act-delete" data-a="del">Elimina</button></div></div>`;
        }).join('')}</div>
        ${list.length > shown.length ? `<div style="margin-top:10px"><button class="btn sm" id="wfMore">Mostra altre ${Math.min(100, list.length - shown.length)}</button></div>` : ''}</div>`}`;
    bindCfg();
    if (seller) KXSeller.bind(V, sellerGo, (i) => { const l = (W.sx || [])[i]; if (l) act('ext', l.id); });
    if (W.tab === 'log' && window.KXTools) KXTools.panelLog($('#wfPanelLog'), 'wolf', '#e0524f');
    V.querySelectorAll('.wf-tabs [data-t]').forEach((b) => { b.onclick = () => { W.tab = b.dataset.t; render(); if (W.tab === 'rs' && !W.rs && !W.rsBusy) loadRs(); }; });
    $('#wfPw').onclick = changePw;
    $('#wfRe').onclick = () => (W.tab === 'rs' ? loadRs() : W.tab === 'log' ? $('#wfPanelLog')._kxPanelLogRefresh() : loadLines(true));
    if ($('#wfNew')) $('#wfNew').onclick = W.tab === 'rs' ? newRs : newLine;
    if (W.tab === 'rs') { V.querySelectorAll('.wf-rs [data-a]').forEach((b) => { b.onclick = () => rsAct(b.dataset.a, +b.closest('.wf-rs').dataset.id); }); return; }
    if (W.tab === 'log') return;
    $('#wfO').onchange = (e) => { W.own = e.target.value; W.limit = 100; render(); };
    const q = $('#wfQ'); q.oninput = () => { W.q = q.value; W.limit = 100; const p = q.selectionStart; render(); const n = $('#wfQ'); n.focus(); n.setSelectionRange(p, p); };
    $('#wfF').onchange = (e) => { W.f = e.target.value; W.limit = 100; render(); };
    if (window.KXSort) KXSort.bind(V, W, 'wf', () => { W.limit = 100; render(); });
    if ($('#wfMore')) $('#wfMore').onclick = () => { W.limit += 100; render(); };
    V.querySelectorAll('.wf-row [data-a]').forEach((b) => { b.onclick = () => act(b.dataset.a, +b.closest('.wf-row').dataset.id); });
    if (window.KXStats) KXStats.bind(V, (k) => { const F = { online: 'conn', active: 'on', expired: 'exp', soon: 'soon', off: 'off', total: '' }; if (k in F) { W.f = F[k]; W.q = ''; render(); } });
    if (window.KXTools && d.lines) KXTools.bind(V, 'wf', W.sel, () => filtered().map((l) => l.id), { ext: bulkExt, on: () => bulkTgl(true), off: () => bulkTgl(false), msg: bulkMsg, csv: exportCsv, stats: () => { W.st = !W.st; render(); } }, render);
  }
  /* azioni su più linee: solo quelle selezionate e visibili con i filtri attuali */
  const selOf = (list) => (list || filtered()).filter((l) => W.sel.has(String(l.id)));
  function statsHtml() {
    const L = (W.data && W.data.lines) || [], now = Date.now(), ok = L.filter((l) => l.enabled && (!l.exp || l.exp > now));
    return KXTools.stats([
      ['Linee', L.length], ['Attive', ok.length, 'g'], ['Scadono in 7 giorni', ok.filter((l) => l.exp && l.exp - now < 7 * DAY).length, 'w'],
      ['Scadono in 30 giorni', ok.filter((l) => l.exp && l.exp - now < 30 * DAY).length, 'w'], ['Scadute', L.filter((l) => l.exp && l.exp < now).length, 'b'],
      ['Disattivate', L.filter((l) => !l.enabled).length, 'b'], ['Prove', L.filter((l) => l.trial).length], ['Collegate ora', L.filter((l) => l.conns > 0).length, 'g'],
      ...(isAg() ? [] : [['Collegate a clienti', L.filter((l) => linkOf(l.id)).length]]), ['Crediti WOLF', (W.data && W.data.credits) ?? '—']
    ], [['Linee per reseller', KXTools.count(L, (l) => l.owner)], ['Stanno guardando', KXTools.count(L.filter((l) => l.conns > 0 && l.watching), (l) => l.watching)]]);
  }
  function exportCsv() {
    const S = selOf(), L = S.length ? S : filtered();
    KXTools.csv('wolf-linee', [['ID', (l) => l.id], ['Utente', (l) => l.username], ['Password', (l) => l.password], ['Scadenza', (l) => KXTools.day(l.exp) || 'Illimitata'],
      ['Stato', (l) => (!l.enabled ? 'Disattivata' : l.exp && l.exp < Date.now() ? 'Scaduta' : 'Attiva')], ['Prova', (l) => (l.trial ? 'sì' : '')], ['Collegata ora', (l) => (l.conns > 0 ? 'sì' : 'no')],
      ['Nota', (l) => l.note], ['Reseller', (l) => l.owner], ['Cliente KAIROS', (l) => (linkOf(l.id) || {}).name || ''], ['Link M3U', (l) => m3u(l)]], L);
  }
  async function bulkExt() {
    const selected = selOf(); if (!selected.length) return;
    const selectedIds = selected.map((l) => l.id);
    const [, fresh] = await Promise.all([loadPk(), loadLines(true)]);
    if (!W.pk.length) return toast('Non trovo i pacchetti su WOLF', 1);
    const S = fresh && Array.isArray(fresh.lines) ? selectedIds.map((id) => fresh.lines.find((l) => String(l.id) === String(id))).filter(Boolean) : selected;
    if (S.length !== selectedIds.length) return toast('Una o più linee selezionate non risultano più disponibili su WOLF', 1);
    const rawCredits = fresh && fresh.credits !== undefined ? fresh.credits : W.data && W.data.credits;
    const cr = rawCredits !== null && rawCredits !== undefined && Number.isFinite(+rawCredits) ? +rawCredits : null;
    const fmtC = (n) => (Math.round((+n || 0) * 100) / 100).toLocaleString('it-IT');
    const noteEdits = new Map(S.map((l) => [String(l.id), KXTools.noteValue(l.note)]));
    const pr = ask('Conferma rinnovo', `${KXTools.panelHeader('WOLF IPTV', '#e0524f')}
      <label class="lbl">Pacchetto per tutte (usa crediti WOLF)</label><select class="inp" id="wbK">${pkOpts()}</select>
      <div class="kt-renew-list" style="margin-top:10px"><table class="kt-renew-table"><thead><tr><th>Utente</th><th>Scadenza attuale</th><th>Crediti</th></tr></thead><tbody id="wbRows"></tbody></table></div>
      <p class="kt-renew-foot" id="wbC"></p>`, 'Rinnova tutte');
    const packageNow = () => W.pk.find((x) => String(x.id) === $('#wbK').value) || {};
    const cost = () => { const p = packageNow(); return Number.isFinite(+p.credits) ? +p.credits * S.length : null; };
    const rows = () => {
      const p = packageNow(), unit = Number.isFinite(+p.credits) ? +p.credits : null;
      $('#wbRows').innerHTML = S.map((l) => {
        const k = linkOf(l.id);
        return `<tr><td style="border-bottom:0">${esc(l.username)}</td><td style="border-bottom:0">${esc(fmtD(l.exp))}</td><td style="border-bottom:0">${unit === null ? '—' : `${fmtC(unit)} crediti`}</td></tr><tr><td colspan="3" style="padding-top:0"><textarea class="inp" data-wb-note="${esc(l.id)}" maxlength="300" rows="2" placeholder="Nota (nome del cliente, telefono…)" style="width:100%;min-width:0;box-sizing:border-box;margin:0;padding:6px;font-size:12px;resize:vertical">${esc(noteEdits.get(String(l.id)) || '')}</textarea>${k && k.name ? `<small class="mut" style="display:block;margin-top:4px">KAIROS: ${esc(k.name)}</small>` : ''}</td></tr>`;
      }).join('');
      $('#wbRows').querySelectorAll('[data-wb-note]').forEach((input) => {
        input.oninput = () => noteEdits.set(String(input.dataset.wbNote), input.value);
      });
    };
    const upd = () => {
      const c = cost(), after = cr !== null && c !== null ? cr - c : null;
      $('#wbC').innerHTML = `Totale: <b>${c === null ? '—' : fmtC(c)} crediti WOLF</b> · disponibili <b>${cr === null ? '—' : fmtC(cr)}</b> → dopo il rinnovo <b>${after === null ? '—' : fmtC(after)}</b>${cr !== null && c !== null && c > cr ? ' · <span style="color:#ff8f8f">crediti non sufficienti</span>' : ''}`;
      rows();
    };
    $('#wbK').onchange = upd; upd();
    if (!(await pr)) return;
    const pkg = $('#wbK').value, selectedPackage = packageNow(), unitCost = Number.isFinite(+selectedPackage.credits) ? +selectedPackage.credits : null, c = cost();
    if (cr !== null && c > cr) return toast(`Servono ${c} crediti, ne hai ${cr}`, 1);
    const result = await KXTools.runReport(S, async (l) => {
      const r = await api('POST', `/admin/wolf/lines/${l.id}/extend`, { package: pkg });
      const credits = r && r.credits !== null && r.credits !== undefined && Number.isFinite(+r.credits) ? +r.credits : unitCost;
      const note = noteEdits.get(String(l.id)) ?? KXTools.noteValue(l.note);
      let noteUpdated = false, noteError = '';
      if (KXTools.noteChanged(note, l.note)) {
        const savedNote = KXTools.noteWithTag(note, l.note);
        try { await api('PUT', `/admin/wolf/lines/${l.id}`, { note: savedNote }); l.note = savedNote; noteUpdated = true; } catch (e) { noteError = e.message; }
      }
      return { package: r && r.package || selectedPackage.name || pkg, credits, noteUpdated, noteError };
    }, 'Rinnovo');
    W.sel.clear();
    const latest = await loadLines(true, true), afterRaw = latest && latest.credits;
    const after = afterRaw !== null && afterRaw !== undefined && Number.isFinite(+afterRaw) ? +afterRaw : null;
    const used = cr !== null && after !== null ? cr - after : null;
    const estimate = unitCost !== null ? unitCost * result.ok : null;
    const spent = used !== null ? `${fmtC(used)} crediti` : estimate !== null ? `circa ${fmtC(estimate)} crediti` : 'non verificabili';
    const successes = result.items.filter((x) => x.ok).map((x) => `<li class="ok">${esc(x.item.username)} · ${x.value.credits === null ? 'costo non disponibile' : `${fmtC(x.value.credits)} crediti`}${x.value.noteUpdated ? ' · nota aggiornata' : ''}</li>`).join('');
    const failures = result.items.filter((x) => !x.ok).map((x) => `<li class="err">${esc(x.item.username)}: ${esc(x.error)}</li>`).join('');
    const noteErrors = result.items.filter((x) => x.ok && x.value.noteError).map((x) => `<li class="err">${esc(x.item.username)}: nota non salvata: ${esc(x.value.noteError)}</li>`).join('');
    await ask('Riepilogo rinnovo WOLF', `${KXTools.panelHeader('WOLF IPTV', '#e0524f')}<div class="kt-renew-report">
      <div><h4>Rinnovate (${result.ok})</h4><ul>${successes || '<li>—</li>'}</ul></div>
      <div><h4>Errori (${result.err.length})</h4><ul>${failures || '<li>—</li>'}</ul></div>
      ${noteErrors ? `<div><h4>Note non salvate</h4><ul>${noteErrors}</ul></div>` : ''}
      <p class="kt-renew-foot" style="margin:0">Crediti spesi: <b>${esc(spent)}</b>${used !== null ? ` · saldo ${fmtC(cr)} → ${fmtC(after)}` : ''}</p></div>`, 'Chiudi');
  }
  async function bulkTgl(on) {
    const S = selOf().filter((l) => !!l.enabled !== on);
    if (!S.length) return toast(on ? 'Sono già tutte attive' : 'Sono già tutte disattivate');
    if (!(await ask(`${on ? 'Attivare' : 'Disattivare'} ${S.length === 1 ? '1 linea' : S.length + ' linee'}?`, on ? 'Le linee tornano a funzionare, anche su WOLF.' : 'I clienti di queste linee smettono di vedere finché non le riattivi. Succede anche su WOLF.', on ? 'Attiva' : 'Disattiva'))) return;
    await KXTools.run(S, (l) => api('POST', `/admin/wolf/lines/${l.id}/toggle`), on ? 'Attivazione' : 'Disattivazione');
    W.sel.clear(); loadLines(true);
  }
  function bulkMsg() { const S = selOf(); KXTools.msg(KXTools.devsFor(S.map((l) => l.username), S.map((l) => (linkOf(l.id) || {}).device).filter(Boolean)), S.length); }
  const owners = () => { const c = new Map(); ((W.data && W.data.lines) || []).forEach((l) => c.set(l.owner, (c.get(l.owner) || 0) + 1)); return [...c.entries()].sort((a, b) => b[1] - a[1]); };
  function rsHtml() {
    const R = W.rs;
    const head = `<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><b style="font-size:15px">Reseller su WOLF</b><span class="mut" style="font-size:12.5px">I tuoi sub-reseller: crediti, linee, ultimo accesso. Quello che cambi qui cambia anche su WOLF.</span></div>`;
    if (!R) return `<div class="card glass" style="margin-top:14px">${head}${W.rsErr ? `<p style="color:#ff8f8f">${esc(W.rsErr)}</p>` : `<p class="mut">${W.rsBusy ? 'Carico i reseller da WOLF…' : ''}</p>`}</div>`;
    const tot = R.resellers.reduce((a, r) => a + r.credits, 0);
    return `<div class="card glass" style="margin-top:14px">${head}
      <p class="mut" style="font-size:12.5px;margin:8px 0 0">${R.resellers.length} reseller · ${tot} crediti in totale presso di loro · ${R.resellers.reduce((a, r) => a + r.lines, 0)} linee</p>
      ${W.rsErr ? `<p style="color:#ff8f8f;margin:8px 0 0">${esc(W.rsErr)}</p>` : ''}
      <div style="margin-top:8px">${R.resellers.length ? R.resellers.map((r) => `<div class="wf-rs" data-id="${r.id}">
        <div><span class="k">ID ${r.id} · ${esc(r.type || 'Reseller')}</span><b class="mono">${esc(r.username)}</b><br>${r.enabled ? '<span class="wf-tag">Attivo</span>' : '<span class="wf-tag b">Disattivato</span>'}${r.canSub ? '<span class="wf-tag g">Crea sub-reseller</span>' : ''}</div>
        <div><span class="k">Crediti</span><span class="n">${r.credits}</span></div>
        <div><span class="k">Linee</span><span class="n">${r.lines}</span>${r.mags || r.enigma ? `<br><small class="mut">${r.mags} MAG · ${r.enigma} Enigma</small>` : ''}</div>
        <div><span class="k">DNS</span><span class="mono">${esc(r.dns) || '—'}</span></div>
        <div><span class="k">Ultimo accesso</span>${esc(r.login) || '—'}<br><small class="mut mono">${esc(r.ip)}</small></div>
        <div class="wf-act"><button class="btn sm" data-a="lines">Linee</button><button class="btn sm" data-a="cr">Crediti</button><button class="btn sm" data-a="edit">Modifica</button><button class="btn sm ghost" data-a="tgl">${r.enabled ? 'Disattiva' : 'Attiva'}</button><button class="btn sm ghost" data-a="del" style="color:#ff8f8f">Elimina</button></div></div>`).join('') : '<p class="mut">Nessun reseller su questo account WOLF.</p>'}</div></div>`;
  }
  async function newRs() {
    const ok = await ask('Nuovo reseller su WOLF', `<div class="wf-f" style="grid-template-columns:1fr 1fr">
      <label>Utente<input class="inp mono" id="wrU"></label><label>Password<input class="inp mono" id="wrP" value="${gen(12)}"></label>
      <label>Email (facoltativa)<input class="inp" id="wrE" type="email"></label><label>DNS (facoltativo)<input class="inp mono" id="wrD" placeholder="quello di WOLF"></label>
      <label style="grid-column:1/-1">Descrizione<input class="inp" id="wrN" maxlength="500"></label></div>
      <p class="mut" style="font-size:12.5px;margin:10px 0 0">Il reseller parte con 0 crediti: dopo puoi dargliene con «Crediti».</p>`, 'Crea reseller');
    if (!ok) return;
    try { await api('POST', '/admin/wolf/resellers', { username: $('#wrU').value, password: $('#wrP').value, email: $('#wrE').value, dns: $('#wrD').value, note: $('#wrN').value }); toast('Reseller creato su WOLF'); await loadRs(); } catch (e) { toast(e.message, 1); }
  }
  async function rsAct(a, id) {
    const r = ((W.rs && W.rs.resellers) || []).find((x) => x.id === id); if (!r) return;
    try {
      if (a === 'lines') { W.tab = 'lines'; W.own = r.username; W.f = ''; W.q = ''; W.limit = 100; render(); if (!W.data) loadLines(); return; }
      if (a === 'cr') {
        const ok = await ask('Crediti a ' + r.username, `<label class="lbl">Quanti crediti</label><input class="inp" id="wcN" type="number" step="1" placeholder="es. 10 per dare, -5 per togliere">
          <label class="lbl" style="margin-top:10px">Motivo (facoltativo)</label><input class="inp" id="wcM" maxlength="300">
          <p class="mut" style="font-size:12.5px;margin:10px 0 0">Crediti attuali di ${esc(r.username)}: <b>${r.credits}</b>. I tuoi crediti: <b>${W.rs.credits ?? '—'}</b>.</p>`, 'Conferma');
        if (!ok) return;
        const res = await api('POST', `/admin/wolf/resellers/${id}/credits`, { credits: $('#wcN').value, message: $('#wcM').value });
        toast(res.message || 'Crediti aggiornati su WOLF'); return loadRs();
      }
      if (a === 'edit') {
        const ok = await ask('Modifica reseller ' + r.username, `<div class="wf-f" style="grid-template-columns:1fr 1fr">
          <label>Email<input class="inp" id="wmE" type="email" placeholder="lascia vuoto per non cambiarla"></label><label>DNS<input class="inp mono" id="wmD" value="${esc(r.dns)}"></label>
          <label style="grid-column:1/-1">Nuova password<input class="inp mono" id="wmP" placeholder="lascia vuoto per non cambiarla" autocomplete="new-password"></label></div>
          <p class="mut" style="font-size:12.5px;margin:10px 0 0">L'utente non si può cambiare (WOLF non lo permette). Descrizione ed email attuali restano se lasci vuoto.</p>`, 'Salva');
        if (!ok) return;
        const body = { dns: $('#wmD').value }; if ($('#wmE').value.trim()) body.email = $('#wmE').value; if ($('#wmP').value) body.password = $('#wmP').value;
        await api('PUT', '/admin/wolf/resellers/' + id, body); toast('Reseller modificato su WOLF'); return loadRs();
      }
      if (a === 'tgl') {
        const ok = await ask((r.enabled ? 'Disattivare ' : 'Attivare ') + r.username + '?', r.enabled
          ? `Il reseller non potrà più entrare su WOLF.<label style="display:flex;gap:8px;align-items:center;margin-top:12px;font-size:13px"><input type="checkbox" id="wtL"> Disattiva anche tutte le sue ${r.lines} linee (i clienti smettono di vedere)</label>`
          : 'Il reseller potrà di nuovo entrare su WOLF.', r.enabled ? 'Disattiva' : 'Attiva');
        if (!ok) return;
        await api('POST', `/admin/wolf/resellers/${id}/toggle`, { lines: !!($('#wtL') && $('#wtL').checked) }); toast(r.enabled ? 'Reseller disattivato' : 'Reseller attivato'); W.data = null; return loadRs();
      }
      if (a === 'del') {
        const ok = await ask('Eliminare ' + r.username + ' da WOLF?', `<p style="margin:0">WOLF cancella il reseller <b>e tutte le sue ${r.lines} linee</b>, per sempre. I clienti di quelle linee smettono di vedere.</p>
          <label class="lbl" style="margin-top:12px">Per confermare scrivi <b class="mono">${esc(r.username)}</b></label><input class="inp mono" id="wdC" autocomplete="off">`, 'Elimina per sempre');
        if (!ok) return;
        await api('POST', `/admin/wolf/resellers/${id}/delete`, { confirm: $('#wdC').value }); toast('Reseller eliminato da WOLF'); W.data = null; return loadRs();
      }
    } catch (e) { toast(e.message, 1); }
  }
  function bindCfg() {
    const s = $('#wfSave'); if (!s) return;
    s.onclick = async () => {
      s.disabled = true;
      try {
        const r = await api('PUT', '/admin/wolf/config', { url: $('#wfUrl') ? $('#wfUrl').value : '', user: $('#wfUser').value, pass: $('#wfPass').value, dns: $('#wfDns') ? $('#wfDns').value : '' });
        toast('WOLF collegato' + (r.dns ? ' · DNS ' + r.dns : '')); W.pk = null; await loadCfg(); await loadLines(true);
      } catch (e) { toast(e.message, 1); s.disabled = false; }
    };
    const o = $('#wfOff');
    if (o) o.onclick = async () => {
      if (!(await ask('Scollegare WOLF?', isAg() ? 'KAIROS dimentica il tuo utente e la password di WOLF. Le tue linee su WOLF restano come sono.' : 'KAIROS dimentica utente e password di WOLF. Le linee su WOLF e le playlist dei clienti restano come sono.', 'Scollega'))) return;
      try { await api('DELETE', '/admin/wolf/config'); W.data = null; await loadCfg(); render(); toast('WOLF scollegato'); } catch (e) { toast(e.message, 1); }
    };
  }

  async function changePw() {
    const ok = await ask('Cambia password WOLF', `<label class="lbl">Nuova password per ${esc(W.cfg.user)}</label><input class="inp mono" id="wpN" value="${gen(12)}" autocomplete="new-password">
      <p class="mut" style="font-size:12.5px;margin:10px 0 0">La password cambia <b>su WOLF</b> e KAIROS la aggiorna da solo, così il collegamento continua. D'ora in poi entri su WOLF con questa: copiala prima di confermare.</p>`, 'Cambia password');
    if (!ok) return;
    try { await api('POST', '/admin/wolf/password', { pass: $('#wpN').value }); toast('Password cambiata su WOLF e in KAIROS'); await loadCfg(); render(); } catch (e) { toast(e.message, 1); }
  }

  async function newLine() {
    await loadPk();
    if (!W.pk.length) return toast('Non trovo i pacchetti su WOLF', 1);
    const ok = await ask('Nuova linea su WOLF', `<div class="wf-f" style="grid-template-columns:1fr 1fr">
      <label>Utente<input class="inp mono" id="wnU" value="${gen(10)}"></label><label>Password<input class="inp mono" id="wnP" value="${gen(10)}"></label>
      <label style="grid-column:1/-1">Pacchetto (usa crediti WOLF)<select class="inp" id="wnK">${pkOpts()}</select></label>
      <label style="grid-column:1/-1">Nota<input class="inp" id="wnN" maxlength="300"></label>
      ${isAg() ? '' : `<label style="grid-column:1/-1">Collega a un cliente KAIROS (facoltativo)<select class="inp" id="wnD">${devOpts('')}</select></label>`}</div>${window.KXPay ? KXPay.duePrompt('wnPay') : ''}
      <p class="mut" style="font-size:12.5px;margin:10px 0 0">Crediti WOLF disponibili: <b>${(W.data && W.data.credits) ?? '—'}</b>. La linea compare subito anche su WOLF.</p>`, 'Crea linea');
    if (!ok) return;
    const due = window.KXPay ? KXPay.readDuePrompt('wnPay') : null; if (due === false) return;
    const body = { username: $('#wnU').value, password: $('#wnP').value, package: $('#wnK').value, note: $('#wnN').value, deviceId: $('#wnD') ? $('#wnD').value : '' };
    try {
      const r = await api('POST', '/admin/wolf/lines', body);
      if (due && r.id) await KXPay.saveDue('line', 'wolf', r.id, body.username, +D.me?.id || 0, due.months, due.amount).catch((e) => toast('Linea creata, ma pagamento non registrato: ' + e.message, 1));
      const refresh = loadLines(true);
      if (window.KXCreds) KXCreds.show('✅ Linea creata su WOLF', [['Utente', body.username], ['Password', body.password]]);
      else toast('Linea creata su WOLF');
      await refresh;
    } catch (e) { toast(e.message, 1); }
  }

  async function act(a, id) {
    const l = ((W.data && W.data.lines) || []).find((x) => x.id === id); if (!l) return;
    try {
      if (a === 'eye') { W.show.has(id) ? W.show.delete(id) : W.show.add(id); return render(); }
      if (a === 'cu') return copy(l.username, 'Utente');
      if (a === 'cp') return copy(l.password, 'Password');
      if (a === 'm3u') { const u = m3u(l); return u ? copy(u, 'Link M3U') : toast('Imposta il DNS in «Impostazioni WOLF»', 1); }
      if (a === 'orcp') { const k = linkOf(l.id); return KXOrcpNew({ user: l.username, pass: l.password, name: (k && k.name) || l.username, note: 'WOLF #' + l.id, panel: 'wolf' }); }
      if (a === 'mxp' || a === 'oxp') {
        const k = linkOf(l.id), target = a === 'mxp' ? 'max' : 'orbix', pre = { user: l.username, pass: l.password, name: (k && k.name) || l.username, note: 'WOLF #' + l.id };
        const line = { p: 'wolf', tag: 'WOLF', username: l.username, password: l.password, exp: l.exp, note: l.note };
        return window.KXOpenLineTarget ? window.KXOpenLineTarget(target, line, pre) : target === 'max' ? KXMxpNew(pre) : KXOxpNew(pre);
      }
      if (a === 'edit') {
        let bouquetData = null, presets = BQ_PRESET_DEFAULTS.map((p) => ({ ...p, ids: [...p.ids], words: [...p.words] }));
        if (!isAg()) {
          const [bqResult, presetResult] = await Promise.allSettled([
            api('GET', `/admin/wolf/lines/${id}/bouquets`), api('GET', '/admin/wolf/bqpresets'),
          ]);
          if (bqResult.status === 'fulfilled' && bqResult.value && Array.isArray(bqResult.value.all) && bqResult.value.all.length) {
            const ids = new Set();
            bouquetData = {
              all: bqResult.value.all.filter((x) => x && /^\d+$/.test(String(x.id)) && !ids.has(+x.id) && ids.add(+x.id)).map((x) => ({ id: +x.id, name: String(x.name || `Bouquet ${x.id}`) })),
              current: Array.isArray(bqResult.value.current) ? bqResult.value.current.map(Number) : [],
            };
            if (!bouquetData.all.length) bouquetData = null;
          }
          if (presetResult.status === 'fulfilled' && presetResult.value && Array.isArray(presetResult.value.presets)) presets = presetResult.value.presets;
        }
        const hasBouquets = !!(bouquetData && bouquetData.all.length);
        const bqSection = isAg() ? '' : hasBouquets ? `<section class="wf-bq">
          <div class="wf-bq-head"><b id="weBqTitle">Bouquet (0 su ${bouquetData.all.length})</b><span class="wf-bq-tools"><button type="button" class="btn sm" id="weBqAll">Tutti</button><button type="button" class="btn sm ghost" id="weBqNone">Nessuno</button></span></div>
          <p class="wf-bq-note">Le spunte si mettono in base al nome: controllale prima di salvare.</p>
          <div class="wf-bq-presets" id="weBqPresets"></div>
          <div class="wf-bq-tools" style="margin:6px 0"><input class="inp" id="weBqSearch" placeholder="Cerca bouquet…" style="flex:1;min-width:130px"><span class="mut" style="font-size:11.5px">Selezione manuale</span></div>
          <div class="wf-bq-list" id="weBqList">${bouquetData.all.map((x) => `<label class="wf-bq-row" data-bq-search="${esc(x.name.toLocaleLowerCase())}"><input type="checkbox" data-bq-id="${x.id}"${bouquetData.current.includes(x.id) ? ' checked' : ''}><span>${esc(x.name)}</span></label>`).join('')}</div>
          <button type="button" class="btn sm" id="weBqSaveStart" style="margin-top:8px">💾 Salva come opzione…</button>
          <div class="wf-bq-savebox" id="weBqSaveBox" style="display:none"><input class="inp" id="weBqName" maxlength="60" placeholder="Nome dell’opzione"><button type="button" class="btn sm" id="weBqSaveConfirm">Salva</button><button type="button" class="btn sm ghost" id="weBqSaveCancel">Annulla</button></div>
        </section>` : `<section class="wf-bq"><div class="wf-bq-unavailable">Bouquet non disponibili</div><p class="wf-bq-note">Puoi comunque salvare utente, password e nota.</p></section>`;
        const prompt = ask('Modifica linea ' + l.username, `<div class="wf-f" style="grid-template-columns:1fr 1fr">
          <label>Utente<input class="inp mono" id="weU" value="${esc(l.username)}"></label><label>Password<input class="inp mono" id="weP" value="${esc(l.password)}"></label>
          <label style="grid-column:1/-1">Nota<input class="inp" id="weN" maxlength="300" value="${esc(l.note)}"></label></div>
          ${bqSection}
          <p class="mut" style="font-size:12.5px;margin:10px 0 0">La modifica vale subito anche su WOLF${linkOf(id) ? ' e nella playlist del cliente collegato' : ''}.</p>`, 'Salva');
        $('#mYes').disabled = false;
        if (hasBouquets) {
          const checks = () => [...$('#weBqList').querySelectorAll('[data-bq-id]')];
          const selected = () => checks().filter((c) => c.checked).map((c) => +c.dataset.bqId);
          const updateCount = () => {
            const n = selected().length;
            $('#weBqTitle').textContent = `Bouquet (${n} su ${bouquetData.all.length})`;
            $('#mYes').disabled = n === 0;
          };
          const renderPresets = () => {
            $('#weBqPresets').innerHTML = presets.map((p) => `<span class="wf-bq-option"><button type="button" class="btn sm" data-bq-apply="${esc(p.id)}">${esc(p.name)}</button>${String(p.id).startsWith('custom-') ? `<button type="button" class="btn sm ghost wf-bq-del" data-bq-delete="${esc(p.id)}" title="Elimina opzione">🗑</button>` : ''}</span>`).join('');
            $('#weBqPresets').querySelectorAll('[data-bq-apply]').forEach((button) => {
              button.onclick = () => {
                const p = presets.find((x) => String(x.id) === button.dataset.bqApply); if (!p) return;
                const ids = new Set((p.ids || []).map(Number)), words = Array.isArray(p.words) ? p.words : [];
                for (const c of checks()) {
                  const item = bouquetData.all.find((x) => x.id === +c.dataset.bqId), name = item ? item.name : '';
                  const match = ids.has(+c.dataset.bqId) || words.some((w) => {
                    if (w === '@foreign') return bqIsForeign(name);
                    if (w === '@adult') return bqIsAdult(name);
                    return String(name).toLocaleLowerCase().includes(String(w).toLocaleLowerCase());
                  });
                  if (p.mode === 'drop') { if (match) c.checked = false; } else c.checked = match;
                }
                updateCount();
              };
            });
            $('#weBqPresets').querySelectorAll('[data-bq-delete]').forEach((button) => {
              button.onclick = async () => {
                const next = presets.filter((p) => String(p.id) !== button.dataset.bqDelete);
                try {
                  const r = await api('PUT', '/admin/wolf/bqpresets', { presets: next });
                  presets = Array.isArray(r.presets) ? r.presets : next; renderPresets(); toast('Opzione eliminata');
                } catch (e) { toast(e.message, 1); }
              };
            });
          };
          checks().forEach((c) => { c.onchange = updateCount; });
          $('#weBqSearch').oninput = () => {
            const q = $('#weBqSearch').value.trim().toLocaleLowerCase();
            $('#weBqList').querySelectorAll('.wf-bq-row').forEach((row) => { row.style.display = !q || row.dataset.bqSearch.includes(q) ? 'grid' : 'none'; });
          };
          $('#weBqAll').onclick = () => { checks().forEach((c) => { c.checked = true; }); updateCount(); };
          $('#weBqNone').onclick = () => { checks().forEach((c) => { c.checked = false; }); updateCount(); };
          $('#weBqSaveStart').onclick = () => { $('#weBqSaveBox').style.display = 'flex'; $('#weBqName').focus(); };
          $('#weBqSaveCancel').onclick = () => { $('#weBqSaveBox').style.display = 'none'; $('#weBqName').value = ''; };
          $('#weBqSaveConfirm').onclick = async () => {
            const name = $('#weBqName').value.trim(), ids = selected();
            if (!name) return toast('Scrivi il nome dell’opzione', 1);
            if (!ids.length) return toast('Seleziona almeno un bouquet per salvare l’opzione', 1);
            const old = presets.find((p) => String(p.name).toLocaleLowerCase() === name.toLocaleLowerCase());
            const nextPreset = { id: old ? old.id : `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, name, mode: 'keep', ids, words: [] };
            const next = old ? presets.map((p) => String(p.id) === String(old.id) ? nextPreset : p) : [...presets, nextPreset];
            try {
              const r = await api('PUT', '/admin/wolf/bqpresets', { presets: next });
              presets = Array.isArray(r.presets) ? r.presets : next; renderPresets(); $('#weBqSaveBox').style.display = 'none'; $('#weBqName').value = ''; toast('Opzione salvata');
            } catch (e) { toast(e.message, 1); }
          };
          renderPresets(); updateCount();
        }
        if (!(await prompt)) return;
        const payload = { username: $('#weU').value, password: $('#weP').value, note: $('#weN').value };
        if (hasBouquets) {
          const selectedBouquets = [...$('#weBqList').querySelectorAll('[data-bq-id]:checked')].map((c) => +c.dataset.bqId);
          if (!selectedBouquets.length) return toast('Seleziona almeno un bouquet', 1);
          const current = new Set(bouquetData.current.map(Number)), selected = new Set(selectedBouquets);
          if (current.size !== selected.size || [...current].some((id) => !selected.has(id))) payload.bouquets = selectedBouquets;
        }
        const r = await api('PUT', '/admin/wolf/lines/' + id, payload);
        toast('Linea modificata su WOLF' + (r.synced ? ' · playlist del cliente aggiornata' : '')); return loadLines(true);
      }
      if (a === 'ext') {
        await loadPk();
        const ok = await ask('Rinnova ' + l.username, `<label class="lbl">Pacchetto (usa crediti WOLF)</label><select class="inp" id="wxK">${pkOpts()}</select>
          <label class="lbl" style="margin-top:10px">Nota (nome del cliente, telefono…)</label><input class="inp" id="wxN" maxlength="300" value="${esc(KXTools.noteValue(l.note))}" placeholder="es. Mario Rossi · 333 1234567">
          ${window.KXPay ? KXPay.duePrompt('wxPay') : ''}<p class="mut" style="font-size:12.5px;margin:10px 0 0">Scadenza attuale: <b>${fmtD(l.exp)}</b>. Crediti disponibili: <b>${(W.data && W.data.credits) ?? '—'}</b>.</p>`, 'Rinnova');
        if (!ok) return;
        const due = window.KXPay ? KXPay.readDuePrompt('wxPay') : null; if (due === false) return;
        const pkg = $('#wxK').value, note = $('#wxN').value.trim(), originalNote = String(l.note || '');
        const r = await api('POST', `/admin/wolf/lines/${id}/extend`, { package: pkg });
        let noteError = '';
        if (KXTools.noteChanged(note, originalNote)) {
          const savedNote = KXTools.noteWithTag(note, originalNote);
          try { await api('PUT', '/admin/wolf/lines/' + id, { note: savedNote }); l.note = savedNote; } catch (e) { noteError = e.message; }
        }
        toast(noteError ? 'Rinnovo riuscito, ma la nota non è stata salvata: ' + noteError : 'Linea rinnovata su WOLF');
        if (due) await KXPay.saveDue('line', 'wolf', id, l.username, +l.ownerId || +D.me?.id || 0, due.months, due.amount).catch((e) => toast('Rinnovo riuscito, ma pagamento non registrato: ' + e.message, 1));
        return loadLines(true, true);
      }
      if (a === 'link') {
        const k = linkOf(id);
        const ok = await ask('Cliente KAIROS della linea ' + l.username, `<label class="lbl">Cliente</label><select class="inp" id="wlD">${devOpts(k ? k.device : '')}</select>
          <p class="mut" style="font-size:12.5px;margin:10px 0 0">Se il cliente non ha ancora questa linea, gli viene aggiunta come playlist. Quando cambi utente o password (qui o su WOLF) la sua playlist si aggiorna da sola.</p>`, 'Salva');
        if (!ok) return;
        const dv = $('#wlD').value;
        if (!dv) { if (k) { await api('DELETE', '/admin/wolf/links/' + id); toast('Collegamento tolto'); } return loadLines(); }
        const r = await api('POST', '/admin/wolf/links', { line: id, device: dv }); toast(`Collegata a ${r.name}` + (r.added ? ' · playlist aggiunta' : '')); return loadLines();
      }
      if (a === 'tgl') {
        if (!(await ask((l.enabled ? 'Disattivare ' : 'Attivare ') + l.username + '?', `La linea viene ${l.enabled ? 'disattivata' : 'attivata'} anche su WOLF.`, l.enabled ? 'Disattiva' : 'Attiva'))) return;
        await api('POST', `/admin/wolf/lines/${id}/toggle`); toast(l.enabled ? 'Linea disattivata' : 'Linea attivata'); return loadLines(true);
      }
      if (a === 'del') {
        if (!(await ask('Eliminare ' + l.username + ' da WOLF?', 'La linea viene cancellata da WOLF per sempre e i crediti non tornano indietro. Le playlist dei clienti non vengono toccate.', 'Elimina'))) return;
        await api('DELETE', '/admin/wolf/lines/' + id); toast('Linea eliminata da WOLF'); return loadLines(true);
      }
    } catch (e) { toast(e.message, 1); }
  }

  function show() {
    try { render(); } catch (e) { const V = $('#v-wolf'); if (V) V.innerHTML = `<div class="card glass"><p style="color:#ff8f8f">Errore nella sezione WOLF: ${esc(e.message || String(e))}</p></div>`; }
  }
  function open() {
    show();
    (W.cfg ? Promise.resolve() : loadCfg()).then(() => { show(); if (W.cfg.set && !W.data) loadLines(); });
  }
  const v0 = view;
  window.view = view = function (v) { const r = v0.apply(this, arguments); if (v === 'wolf') open(); return r; };
  /* qualunque menu apra la sezione (anche quelli caricati dopo), la si riempie quando diventa visibile */
  const sec = $('#v-wolf');
  if (sec) new MutationObserver(() => { if (sec.classList.contains('on') && !sec.innerHTML.trim()) open(); }).observe(sec, { attributes: true, attributeFilter: ['class'] });
  window.addEventListener('kxpay:filter', (e) => { if (e.detail.panel === 'wolf') { W.days = 'due'; W.limit = 100; show(); } });
  window.addEventListener('kxpay:update', () => { if ($('#v-wolf')?.classList.contains('on')) show(); });
})();
