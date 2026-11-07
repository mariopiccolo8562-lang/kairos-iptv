/* KAIROS Control — «Pannello ORCP» (cp.ottrun.com): la tua app brandizzata OTTRUN (es. MirkoTeam).
   ORCP non ha API e il login ha la verifica «sono umano»: entri tu su ORCP (con «Remember me») e passi l'accesso a KAIROS,
   che da lì legge connessioni, manda messaggi agli utenti, accende annuncio e manutenzione, genera il PIN parentale e
   aggiorna i portali. Solo il titolare. Espone KXOrcpNew(pre) per i pulsanti sulle linee e «Nuova attivazione». Usa app.js. */
(() => {
  const IC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2.5"/><path d="M11 18h2M9 6h6"/></svg>';
  if (!$('.nav[data-v="orcp"]')) {
    const b = document.createElement('button'); b.className = 'nav'; b.dataset.v = 'orcp'; b.innerHTML = IC + 'Pannello App ORCP'; b.onclick = () => view('orcp');
    const anchor = $('.nav[data-v="slt"]') || $('.nav[data-v="ro"]') || $('.nav[data-v="atx"]') || $('.nav[data-v="wolf"]'); anchor ? anchor.after(b) : $('#side').appendChild(b);
    const sec = document.createElement('section'); sec.className = 'view'; sec.id = 'v-orcp'; $('#v-dash').after(sec);
  }
  TITLES.orcp = 'Pannello App ORCP';
  const isAg = () => D.role === 'agent';
  const PANEL_NAME = { wolf: 'WOLF', armada: 'Armada', atx: 'Atlantix', ro: 'Realott', slt: 'SLT' };
  const TABS = [['conns', 'Connessioni'], ['msgs', 'Messaggi'], ['ann', 'Annuncio'], ['maint', 'Manutenzione'], ['pin', 'PIN parentale'], ['portals', 'Portali e server'], ['link', 'Collega']];
  const R = { st: null, tab: 'conns', q: '', onlyOn: false, data: {}, err: '', busy: false, edit: null, pin: null };
  const name = () => (R.st && R.st.cfg && R.st.cfg.name) || (R.st && R.st.app && R.st.app.name) || 'App ORCP';
  const mut = '<span class="mut">—</span>';
  const badge = (t, c) => `<span style="display:inline-block;padding:2px 9px;border-radius:999px;font-size:12px;font-weight:600;background:${c}22;color:${c}">${esc(t)}</span>`;
  const when = (s) => { const d = new Date(String(s || '').replace(' ', 'T')); return isNaN(d) ? esc(s || '') : d.toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' }); };
  const dIn = (s) => String(s || '').slice(0, 10);
  const copy = (v, what) => navigator.clipboard.writeText(String(v)).then(() => toast(what + ' copiato'), () => toast('Copia non riuscita', 1));
  const TH = 'text-align:left;padding:9px 8px;border-bottom:1px solid var(--line,#333);white-space:nowrap;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--mut)';
  const TD = 'padding:9px 8px;border-bottom:1px solid var(--line,#222);vertical-align:middle';
  const grid = (heads, rows) => `<div style="overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:13.5px"><thead><tr>${heads.map((h) => `<th style="${TH}">${h}</th>`).join('')}</tr></thead><tbody>${rows.join('') || `<tr><td colspan="${heads.length}" class="mut" style="padding:18px;text-align:center">Niente da mostrare</td></tr>`}</tbody></table></div>`;
  const tr = (cells) => `<tr>${cells.map((c) => `<td style="${TD}">${c}</td>`).join('')}</tr>`;
  const mobile = () => window.innerWidth < 760;
  const card = (title, lines, acts) => `<div class="card" style="padding:12px 14px;margin:0 0 8px"><div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><b>${title}</b></div><div class="mut" style="font-size:13px;margin-top:4px;line-height:1.5">${lines.filter(Boolean).join('<br>')}</div>${acts ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">${acts}</div>` : ''}</div>`;
  const inp = (id, label, val, extra = '', type = 'text') => `<label class="l">${label}<input class="inp" id="${id}" type="${type}" value="${esc(val == null ? '' : val)}" ${extra}></label>`;
  const stSel = (id, v) => `<label class="l">Stato<select class="inp" id="${id}"><option value="ACTIVE"${/ACTIVE/i.test(v) && !/INACTIVE/i.test(v) ? ' selected' : ''}>Acceso</option><option value="INACTIVE"${/INACTIVE/i.test(v) || !v ? ' selected' : ''}>Spento</option></select></label>`;

  async function state(force) { if (R.st && !force) return R.st; try { R.st = await api('GET', '/admin/orcp/state'); } catch (e) { R.st = { connected: false, err: e.message }; } TITLES.orcp = 'Pannello ' + name(); const nb = $('.nav[data-v="orcp"]'); if (nb) nb.innerHTML = IC + 'Pannello ' + esc(name()); if ($('#v-orcp').classList.contains('on')) $('#vTitle').textContent = TITLES.orcp; return R.st; }
  const LD = new Set(); // sezioni in caricamento (ognuna per conto suo: cambiare scheda non blocca le altre)
  async function load(w) {
    LD.add(w); R.err = '';
    try { const r = await api('GET', '/admin/orcp/data?w=' + w); R.data[w] = r; } catch (e) { R.err = e.message; if (/scaduto|non è collegato/.test(e.message)) { R.st = null; await state(); } }
    LD.delete(w); render();
  }
  const need = (w) => { if (!R.data[w] && !LD.has(w) && !R.err && R.st && R.st.connected && !R.st.expired) load(w); };
  const loading = (w, t) => (LD.has(w) ? `<p class="mut">${t}</p>` : '');

  /* ---------- schede ---------- */
  function conns() {
    const d = R.data.conns; need('conns'); if (!d) return loading('conns', 'Carico le connessioni da ORCP… (il loro server è lento: anche 20-30 secondi)');
    const q = R.q.trim().toLowerCase(); let L = d.list || [];
    if (R.onlyOn) L = L.filter((x) => x.online); if (q) L = L.filter((x) => (x.user + ' ' + x.ip + ' ' + x.device + ' ' + x.version).toLowerCase().includes(q));
    const top = `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px"><input class="inp" id="orQ" placeholder="Cerca utente, IP, dispositivo…" value="${esc(R.q)}" style="max-width:280px"><label class="btn sm${R.onlyOn ? ' pri' : ''}" style="cursor:pointer"><input type="checkbox" id="orOn"${R.onlyOn ? ' checked' : ''} style="display:none">Solo online</label><button class="btn sm" data-or="reload">Aggiorna</button><span class="mut" style="margin-left:auto;font-size:13px"><b>${d.online}</b> online · ${(d.list || []).length} nelle ultime 24 ore${d.at ? ' · alle ' + new Date(d.at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : ''}</span></div>` +
      ((d.versions || []).length ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">${d.versions.map((v) => `<span class="mut" style="font-size:12px;border:1px solid var(--line,#333);border-radius:999px;padding:2px 9px">${esc(v.version)} · ${v.count}</span>`).join('')}</div>` : '');
    const st = (x) => x.online ? badge('Online', '#2dd4bf') : badge('Offline', '#9aa4b2');
    const acts = (x) => `<button class="btn sm" data-ormsg="${esc(x.user)}">Messaggio</button><button class="btn sm" data-orcp="${esc(x.user)}">Copia utente</button>`;
    if (mobile()) return top + L.slice(0, 300).map((x) => card(`${esc(x.user)} ${st(x)}`, [`Ultimo accesso: ${when(x.last)}`, esc(x.device), `${esc(x.version)} · ${esc(x.ip)}`], acts(x))).join('');
    return top + grid(['Utente', 'Stato', 'Ultimo accesso', 'Dispositivo', 'Versione', 'IP', ''], L.slice(0, 500).map((x) => tr([`<b>${esc(x.user)}</b>`, st(x), when(x.last), esc(x.device), esc(x.version), `<span class="mono" style="font-size:12px">${esc(x.ip)}</span>`, `<div style="display:flex;gap:5px">${acts(x)}</div>`])));
  }
  function msgs() {
    const d = R.data.msgs || (R.data.messages ? { list: R.data.messages.list } : null); if (!R.data.messages) need('messages'); if (!d) return loading('messages', 'Carico i messaggi…');
    const e = R.edit || {};
    const form = `<div class="card" style="padding:14px;margin-bottom:12px"><b>${e.id ? 'Modifica messaggio' : 'Nuovo messaggio a un utente'}</b><small class="mut" style="display:block;margin:2px 0 10px">Compare nell'app ${esc(name())} quando quell'utente la apre (es. avviso di scadenza).</small>
      <div class="g2">${inp('orMU', 'Utente della linea', e.user || '', 'placeholder="es. Mario123"')}${inp('orMD', 'Scade il', dIn(e.expire) || new Date(Date.now() + 30 * 86400e3).toISOString().slice(0, 10), '', 'date')}${stSel('orMS', e.id ? e.status : 'ACTIVE')}<label class="l" style="grid-column:1/-1">Messaggio<input class="inp" id="orMT" value="${esc(e.text || '')}" placeholder="es. La tua linea scade tra 3 giorni: contattami per il rinnovo"></label></div>
      <div style="display:flex;gap:6px;margin-top:10px"><button class="btn pri" data-or="msgsave">${e.id ? 'Salva' : 'Invia'}</button>${e.id ? '<button class="btn" data-or="msgcancel">Annulla</button>' : ''}</div></div>`;
    const acts = (x) => `<button class="btn sm" data-ormed="${x.id}">Modifica</button><button class="btn sm" data-ormdel="${x.id}" style="color:#ff8f8f">Elimina</button>`;
    const st = (x) => /^ACTIVE/i.test(x.status) ? badge('Acceso', '#2dd4bf') : badge('Spento', '#9aa4b2');
    if (mobile()) return form + d.list.map((x) => card(`${esc(x.user)} ${st(x)}`, [esc(x.text), `Scade ${when(x.expire)} · ${x.viewed ? 'letto' : 'non letto'}`], acts(x))).join('');
    return form + grid(['Utente', 'Messaggio', 'Stato', 'Letto', 'Scade', ''], d.list.map((x) => tr([`<b>${esc(x.user)}</b>`, esc(x.text), st(x), x.viewed ? 'sì' : 'no', when(x.expire), `<div style="display:flex;gap:5px">${acts(x)}</div>`])));
  }
  function ann() {
    const d = R.data.ann; need('ann'); if (!d) return loading('ann', 'Carico l\'annuncio…');
    const a = d.ann; if (!a) return '<p class="mut">ORCP non ha un annuncio per questa app.</p>';
    return `<div class="card" style="padding:14px"><b>Annuncio scorrevole sopra i canali</b><small class="mut" style="display:block;margin:2px 0 10px">Lo vedono tutti i clienti dell'app ${esc(name())}. Spegnilo quando non serve.</small>
      <div class="g2"><label class="l" style="grid-column:1/-1">Testo<input class="inp" id="orAT" value="${esc(a.text)}"></label>${stSel('orAS', a.status)}${inp('orAD', 'Scade il', dIn(a.expire), '', 'date')}
      <label class="l">Ogni quanti minuti<select class="inp" id="orAI">${(a.intervals.length ? a.intervals : ['5', '10', '15', '20', '30', '60']).filter((v, i, A) => A.indexOf(v) === i).map((v) => `<option${String(a.interval) === String(v) ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select></label>
      <label class="l">Resta per (minuti)<select class="inp" id="orAX">${(a.disappears.length ? a.disappears : ['1', '2', '5', '10']).filter((v, i, A) => A.indexOf(v) === i).map((v) => `<option${String(a.disappear) === String(v) ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select></label></div>
      <div style="margin-top:10px"><button class="btn pri" data-or="annsave">Salva annuncio</button></div></div>`;
  }
  function maint() {
    const d = R.data.maint; need('maint'); if (!d) return loading('maint', 'Carico l\'avviso di manutenzione…');
    const a = d.maint; if (!a) return '<p class="mut">ORCP non ha un avviso di manutenzione per questa app.</p>';
    return `<div class="card" style="padding:14px"><b>Avviso di manutenzione</b><small class="mut" style="display:block;margin:2px 0 10px">Quando è acceso, l'app ${esc(name())} mostra questo avviso a tutti i clienti.</small>
      <div class="g2"><label class="l" style="grid-column:1/-1">Testo<input class="inp" id="orMMT" value="${esc(a.text)}"></label>${stSel('orMMS', a.status)}${inp('orMMD', 'Scade il', dIn(a.expire), '', 'date')}</div>
      <div style="margin-top:10px"><button class="btn pri" data-or="maintsave">Salva avviso</button></div></div>`;
  }
  const pin = () => `<div class="card" style="padding:14px;max-width:520px"><b>PIN parentale dimenticato</b><small class="mut" style="display:block;margin:2px 0 10px">Il cliente, nell'app, preme «Password dimenticata» nel controllo genitori e ti legge il codice che compare. Scrivilo qui: ORCP genera il PIN master da dargli.</small>
    <div style="display:flex;gap:6px"><input class="inp" id="orPC" placeholder="Codice dall'app" style="max-width:220px"><button class="btn pri" data-or="pin">Genera PIN</button></div>
    ${R.pin ? `<div style="margin-top:12px;padding:12px;border-radius:10px;background:var(--bg2,#1b1f2a)">${R.pin.pin ? `PIN master: <b class="mono" style="font-size:20px">${esc(R.pin.pin)}</b> <button class="btn sm" data-orcp="${esc(R.pin.pin)}">Copia</button>` : ''}${R.pin.text ? `<div class="mut" style="font-size:13px;margin-top:6px">${esc(R.pin.text)}</div>` : ''}</div>` : ''}</div>`;
  function portals() {
    const d = R.data.portals; need('portals'); if (!d) return loading('portals', 'Carico i portali dall\'app…');
    const cfg = (R.st && R.st.cfg) || { map: {} }, names = d.list.filter((x) => x.name || x.url).map((x) => x.name || x.url);
    return `<div class="card" style="padding:14px;margin-bottom:12px"><b>Server dell'app ${esc(name())}</b><small class="mut" style="display:block;margin:2px 0 10px">Sono i «portali» che il cliente sceglie nell'app. Gli indirizzi li vedi solo tu: ai venditori e nei messaggi ai clienti va solo il nome.</small>
      ${d.list.map((p, i) => `<div class="g2" style="margin-bottom:6px"><label class="l">Nome server ${i + 1}<input class="inp" data-orpn="${p.k}" value="${esc(p.name)}" placeholder="es. SERVER-${i + 1}"></label><label class="l">Indirizzo (DNS)<input class="inp mono" data-orpu="${p.k}" value="${esc(p.url)}" placeholder="http://dns.esempio.com:8080"></label></div>`).join('')}
      <div style="display:flex;gap:6px;margin-top:8px;align-items:center"><button class="btn pri" data-or="portsave">Salva i portali su ORCP</button>${d.apk ? `<a class="btn sm" href="${esc(d.apk)}" target="_blank" rel="noopener">Link APK</a>` : ''}</div></div>
      <div class="card" style="padding:14px"><b>Quale server per ogni pannello</b><small class="mut" style="display:block;margin:2px 0 10px">Così «Nuova attivazione» e il pulsante «${esc(name())}» sulle linee dicono al cliente quale server scegliere nell'app.</small>
      <div class="g2">${inp('orCN', 'Nome dell\'app (come la chiami ai clienti)', cfg.name || (R.st && R.st.app && R.st.app.name) || '', 'placeholder="MirkoTeam"')}${Object.entries(PANEL_NAME).map(([k, n]) => `<label class="l">Linee ${n}<select class="inp" data-ormap="${k}"><option value="">— nessun server —</option>${names.map((s) => `<option${(cfg.map || {})[k] === s ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select></label>`).join('')}</div>
      <div style="margin-top:10px"><button class="btn pri" data-or="cfgsave">Salva abbinamento</button></div></div>`;
  }
  function link() {
    const s = R.st || {};
    const stTxt = !s.connected ? badge('Non collegato', '#9aa4b2') : s.expired ? badge('Accesso scaduto', '#ff6b6b') : badge('Collegato', '#2dd4bf');
    const info = s.connected ? `<div class="mut" style="font-size:13px;margin:6px 0 10px;line-height:1.6">${s.user ? 'Account ORCP: <b>' + esc(s.user) + '</b><br>' : ''}${s.app ? `App: <b>${esc(s.app.name || '')}</b>${s.app.version ? ' · versione ' + esc(s.app.version) : ''}${s.app.expires ? ' · licenza fino al ' + esc(s.app.expires) : ''}<br>` : ''}${s.remember ? 'Accesso con «Remember me»: resta valido per mesi, finché non cambi password o premi Log Out su ORCP.' : '<span style="color:#ffb020">Collegato senza «Remember me»: dura circa 2 ore. Rientra su ORCP spuntando «Remember me» e ripassa l\'accesso.</span>'}</div>` : '';
    return `<div class="card" style="padding:14px;max-width:720px"><div style="display:flex;gap:10px;align-items:center"><b>Accesso a cp.ottrun.com</b>${stTxt}</div>${info}
      <p class="mut" style="font-size:13px;line-height:1.6;margin:8px 0">ORCP ha la verifica «sono umano» al login, quindi KAIROS non può entrare da solo. Entri tu una volta e gli passi l'accesso:</p>
      <ol class="mut" style="font-size:13px;line-height:1.7;margin:0 0 10px 18px;padding:0"><li>Dal computer entra su <b>cp.ottrun.com</b> spuntando <b>«Remember me»</b>.</li><li>Apri gli strumenti del browser (F12 o ⌘⌥I) → <b>Application</b> → <b>Cookies</b> → cp.ottrun.com.</li><li>Copia la riga <b>remember_web_…</b> (nome e valore) e incollala qui sotto. Va bene anche la tabella intera copiata.</li></ol>
      <textarea class="inp" id="orCK" rows="3" placeholder="remember_web_…=valore; orcp_ottrun_control_panel_session=valore" style="font-family:monospace;font-size:12px"></textarea>
      <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap"><button class="btn pri" data-or="linksave">${s.connected ? 'Aggiorna accesso' : 'Collega'}</button>${s.connected ? '<button class="btn" data-or="unlink">Scollega</button>' : ''}<a class="btn" href="https://cp.ottrun.com/login" target="_blank" rel="noopener">Apri ORCP</a></div></div>`;
  }

  function render() {
    const V = $('#v-orcp'); if (!V) return;
    if (isAg()) { V.innerHTML = '<p class="mut">Questo pannello è solo del titolare.</p>'; return; }
    const s = R.st;
    if (!s) { V.innerHTML = '<p class="mut">Carico…</p>'; return; }
    const tabs = `<div class="tabs" style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:12px">${TABS.filter(([k]) => s.connected || k === 'link').map(([k, t]) => `<button class="btn sm${R.tab === k ? ' pri' : ''}" data-ortab="${k}">${t}</button>`).join('')}</div>`;
    const head = `<div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px"><div class="mut" style="font-size:13px">${s.connected ? `App <b>${esc(name())}</b> su cp.ottrun.com${s.app && s.app.version ? ' · v' + esc(s.app.version) : ''}` : 'Collega il tuo account ORCP per gestire l\'app da qui.'}</div><div style="display:flex;gap:6px">${s.connected && window.KXQuickAct ? `<button class="btn sm" data-or="qa">Nuova attivazione</button>` : ''}</div></div>`;
    const warn = s.expired ? '<div class="card" style="padding:10px 14px;margin-bottom:10px;border-left:3px solid #ff6b6b">L\'accesso a ORCP è scaduto: vai in «Collega» e ripassa l\'accesso.</div>' : '';
    const tab = !s.connected || s.expired ? 'link' : R.tab;
    const body = { conns, msgs, ann, maint, pin, portals, link }[tab]();
    V.innerHTML = head + warn + tabs + (R.err ? `<div class="card" style="padding:10px 14px;margin-bottom:10px;border-left:3px solid #ff6b6b">${esc(R.err)}</div>` : '') + body;
    wire(V);
  }
  const val = (id) => ($('#' + id) ? $('#' + id).value : '');
  async function act(fn, okMsg) { if (R.busy) return; R.busy = true; render(); try { await fn(); if (okMsg) toast(okMsg); R.err = ''; } catch (e) { R.err = e.message; toast(e.message, 1); } R.busy = false; render(); }
  function wire(V) {
    $$('[data-ortab]', V).forEach((b) => (b.onclick = () => { R.tab = b.dataset.ortab; R.err = ''; render(); }));
    const q = $('#orQ'); if (q) { q.oninput = () => { R.q = q.value; const st = q.selectionStart; render(); const n = $('#orQ'); if (n) { n.focus(); n.setSelectionRange(st, st); } }; }
    const on = $('#orOn'); if (on) on.onchange = () => { R.onlyOn = on.checked; render(); };
    $$('[data-orcp]', V).forEach((b) => (b.onclick = () => copy(b.dataset.orcp, 'Testo')));
    $$('[data-ormsg]', V).forEach((b) => (b.onclick = () => { R.edit = { user: b.dataset.ormsg }; R.tab = 'msgs'; render(); setTimeout(() => $('#orMT') && $('#orMT').focus(), 30); }));
    $$('[data-ormed]', V).forEach((b) => (b.onclick = () => { const x = (R.data.messages.list || []).find((m) => String(m.id) === b.dataset.ormed); if (x) { R.edit = { ...x }; render(); } }));
    $$('[data-ormdel]', V).forEach((b) => (b.onclick = async () => { if (!(await ask('Eliminare il messaggio?', 'Sparisce dall\'app del cliente.'))) return; act(async () => { R.data.messages = await api('DELETE', '/admin/orcp/messages/' + encodeURIComponent(b.dataset.ormdel)); }, 'Messaggio eliminato'); }));
    $$('[data-or]', V).forEach((b) => (b.onclick = () => {
      const a = b.dataset.or;
      if (a === 'reload') { R.data.conns = null; R.err = ''; LD.add('conns'); render(); api('GET', '/admin/orcp/data?w=conns&fresh=1').then((r) => { R.data.conns = r; }).catch((e) => { R.err = e.message; }).then(() => { LD.delete('conns'); render(); }); }
      if (a === 'qa') window.KXQuickAct && KXQuickAct({ app: 'orcp' });
      if (a === 'msgcancel') { R.edit = null; render(); }
      if (a === 'msgsave') act(async () => { const body = { user: val('orMU'), text: val('orMT'), expire: val('orMD'), status: val('orMS') }; R.data.messages = R.edit && R.edit.id ? await api('PUT', '/admin/orcp/messages/' + encodeURIComponent(R.edit.id), body) : await api('POST', '/admin/orcp/messages', body); R.edit = null; }, 'Messaggio salvato su ORCP');
      if (a === 'annsave') act(async () => { R.data.ann = await api('PUT', '/admin/orcp/ann', { text: val('orAT'), status: val('orAS'), expire: val('orAD'), interval: val('orAI'), disappear: val('orAX') }); }, 'Annuncio salvato');
      if (a === 'maintsave') act(async () => { R.data.maint = await api('PUT', '/admin/orcp/maint', { text: val('orMMT'), status: val('orMMS'), expire: val('orMMD') }); }, 'Avviso salvato');
      if (a === 'pin') act(async () => { R.pin = await api('POST', '/admin/orcp/parental', { code: val('orPC') }); if (!R.pin.pin && !R.pin.text) throw new Error('ORCP non ha restituito il PIN: controlla il codice'); });
      if (a === 'portsave') act(async () => { const list = $$('[data-orpn]', V).map((i) => ({ k: i.dataset.orpn, name: i.value, url: ($('[data-orpu="' + i.dataset.orpn + '"]', V) || {}).value || '' })); R.data.portals = await api('PUT', '/admin/orcp/portals', { list }); }, 'Portali aggiornati su ORCP');
      if (a === 'cfgsave') act(async () => { const map = {}; $$('[data-ormap]', V).forEach((s) => (map[s.dataset.ormap] = s.value)); const r = await api('PUT', '/admin/orcp/cfg', { name: val('orCN'), map }); R.st.cfg = r.cfg; await state(true); }, 'Abbinamento salvato');
      if (a === 'linksave') act(async () => { const ck = val('orCK').trim(); if (!ck) throw new Error('Incolla i cookie di cp.ottrun.com'); await api('PUT', '/admin/orcp/session', { cookies: ck }); R.data = {}; R.tab = 'conns'; await state(true); }, 'ORCP collegato');
      if (a === 'unlink') ask('Scollegare ORCP?', 'KAIROS dimentica l\'accesso. Su ORCP non cambia niente.').then((ok) => ok && act(async () => { await api('DELETE', '/admin/orcp/session'); R.data = {}; await state(true); }, 'ORCP scollegato'));
    }));
  }
  async function open() { if (isAg()) return render(); render(); await state(); render(); }

  /* ---------- per le linee e «Nuova attivazione»: nome dell'app, server dei pannelli, messaggio per il cliente ---------- */
  let cfgP = null;
  const cfg = () => (R.st && R.st.connected ? { name: name(), map: (R.st.cfg || {}).map || {}, servers: (R.data.portals ? R.data.portals.list.filter((x) => x.name || x.url).map((x) => x.name || x.url) : (R.st.servers || [])) } : null);
  window.KXOrcpName = () => name();
  window.KXOrcpCfg = async () => { if (isAg()) return null; if (!R.st) await state(); if (!R.st.connected) return null; if (!cfgP) cfgP = api('GET', '/admin/orcp/cfg').then((r) => { R.st.servers = r.servers || []; R.st.cfg = r.cfg || R.st.cfg; return r; }).catch(() => null); const r = await cfgP; return r ? { name: r.cfg.name || name(), map: r.cfg.map || {}, servers: r.servers || [] } : cfg(); };
  window.KXOrcpText = (o) => [`• ${o.app}: apri l'app, scegli il server «${o.server || 'indicato'}» ed entra con utente e password qui sopra.`].join('\n');
  /** pre: { user, pass, name, note, panel } — segna la linea negli Appunti App e prepara il messaggio per il cliente */
  window.KXOrcpNew = async (pre) => {
    if (isAg()) return toast('Solo il titolare può usare ' + name(), 1);
    const c = await KXOrcpCfg(); if (!c) return toast(name() + ' non è collegato: apri il Pannello e collega ORCP', 1);
    const def = c.map[pre.panel] || c.servers[0] || '';
    const ov = document.createElement('div'); ov.style.cssText = 'position:fixed;inset:0;background:#0008;z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
    ov.innerHTML = `<div class="card" style="padding:16px;max-width:460px;width:100%"><b>Metti la linea su ${esc(c.name)}</b><small class="mut" style="display:block;margin:2px 0 10px">${esc(pre.name || pre.user)} · utente <b>${esc(pre.user)}</b></small>
      <label class="l">Server che il cliente sceglie nell'app<select class="inp" id="orNS">${c.servers.map((s) => `<option${s === def ? ' selected' : ''}>${esc(s)}</option>`).join('') || '<option value="">(nessun server configurato)</option>'}</select></label>
      <div style="display:flex;gap:6px;margin-top:12px;flex-wrap:wrap"><button class="btn pri" id="orNOk">Segna e copia messaggio</button><button class="btn" id="orNX">Annulla</button></div></div>`;
    document.body.appendChild(ov);
    const close = () => ov.remove(); ov.onclick = (e) => { if (e.target === ov) close(); }; $('#orNX', ov).onclick = close;
    $('#orNOk', ov).onclick = async () => {
      const srv = $('#orNS', ov).value;
      try {
        await api('POST', '/admin/linked-lines', { app: c.name, username: pre.user, password: pre.pass, dns: '', note: [pre.name && pre.name !== pre.user ? pre.name : '', pre.note, srv ? 'Server ' + srv : ''].filter(Boolean).join(' · ') });
        const txt = [`Ciao${pre.name && pre.name !== pre.user ? ' ' + pre.name : ''}! Ecco i dati della tua linea:`, `Utente: ${pre.user}`, `Password: ${pre.pass}`, '', KXOrcpText({ app: c.name, server: srv }), '', 'Buona visione!'].join('\n');
        await navigator.clipboard.writeText(txt).catch(() => {});
        toast(`Segnata in Appunti App · messaggio per il cliente copiato`); close();
      } catch (e) { toast(e.message, 1); }
    };
  };

  const v0 = view;
  window.view = view = function (v) { const r = v0.apply(this, arguments); if (v === 'orcp') open(); return r; };
  const sec = $('#v-orcp');
  if (sec) new MutationObserver(() => { if (sec.classList.contains('on') && !sec.innerHTML.trim()) open(); }).observe(sec, { attributes: true, attributeFilter: ['class'] });
  setTimeout(() => { if (!isAg() && (D.role || D.settings)) state(); }, 1500);
})();
