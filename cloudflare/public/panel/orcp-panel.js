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
  const PANEL_NAME = { wolf: 'WOLF', armada: 'Armada', storm: 'Storm', atx: 'Atlantix', ro: 'Realott', slt: 'SLT' };
  const PORTAL_KEYS = ['portal', 'portal2', 'portal3', 'portal4', 'portal5'];
  const AG_IC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2.5"/><path d="M11 18h2M9 6h6"/></svg>';
  if (!$('.nav[data-v="orcp-agent"]')) {
    const b = document.createElement('button'); b.className = 'nav'; b.dataset.v = 'orcp-agent'; b.innerHTML = AG_IC + 'MirkoTeam'; b.onclick = () => view('orcp-agent');
    const anchor = $('.nav[data-v="orcp"]') || $('.nav[data-v="slt"]'); anchor ? anchor.after(b) : $('#side').appendChild(b);
    const sec = document.createElement('section'); sec.className = 'view'; sec.id = 'v-orcp-agent'; $('#v-dash').after(sec);
  }
  const TABS = [['conns', 'Connessioni'], ['msgs', 'Messaggi'], ['ann', 'Annuncio'], ['maint', 'Manutenzione'], ['pin', 'PIN parentale'], ['vpn', 'VPN'], ['portals', 'Portali e server'], ['link', 'Collega']];
  const R = { st: null, tab: 'conns', q: '', onlyOn: false, data: {}, err: '', busy: false, edit: null, pin: null, ck: '' };
  const name = () => isAg() ? 'MirkoTeam' : (R.st && R.st.cfg && R.st.cfg.name) || (R.st && R.st.app && R.st.app.name) || 'App ORCP';
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
    return top + grid(['Utente', 'Stato', 'Ultimo accesso', 'Dispositivo', 'Versione', 'IP', ''], L.slice(0, 500).map((x) => tr([`<b>${esc(x.user)}</b>${window.KXWatch ? KXWatch.slot('orcp', x.user) : ''}`, st(x), when(x.last), esc(x.device), esc(x.version), `<span class="mono" style="font-size:12px">${esc(x.ip)}</span>`, `<div style="display:flex;gap:5px">${acts(x)}</div>`])));
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
  function vpn() {
    const d = R.data.vpn; need('vpn'); if (!d) return loading('vpn', 'Carico le configurazioni VPN da ORCP…');
    const e = { ...(R.vedit || {}), ...(R.vf || {}) }; const AUTH = { noup: 'Nessuna', up: 'Utente e password', kp: 'Password del file chiave' };
    const cc = (d.countries || []).length ? d.countries : [{ v: 'IT', t: 'Italy' }, { v: 'US', t: 'United States' }, { v: 'GB', t: 'United Kingdom' }, { v: 'DE', t: 'Germany' }, { v: 'FR', t: 'France' }, { v: 'ES', t: 'Spain' }, { v: 'NL', t: 'Netherlands' }, { v: 'CH', t: 'Switzerland' }];
    const sel = (id, label, opts, v) => `<label class="l">${label}<select class="inp" id="${id}">${opts.map(([k, t]) => `<option value="${esc(k)}"${k === v ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
    const help = `<div class="card" style="padding:12px 14px;margin-bottom:12px;border-left:3px solid #4f8cff;font-size:13px;line-height:1.55"><b>Come funziona</b><br>L'app ${esc(name())} scarica il file OpenVPN da un link e lo usa per <b>tutti</b> i clienti dell'app (non per il singolo cliente). Qui carichi il file: KAIROS lo ospita con un link segreto e lo registra su ORCP.<br>
      <b>Surfshark</b>: Il mio account → VPN → Configurazione manuale → <b>OpenVPN</b> → scarica il file <b>.ovpn (UDP)</b> della località che vuoi e copia le <b>credenziali di servizio</b> (utente e password OpenVPN, diverse da quelle dell'account). Poi qui: incolla il file, Autenticazione «Utente e password», scrivi le credenziali.</div>`;
    const form = `<div class="card" style="padding:14px;margin-bottom:12px"><b>${e.id ? 'Modifica configurazione VPN' : 'Nuova configurazione VPN'}</b>
      <div class="g2" style="margin-top:10px">${sel('orVC', 'Paese', cc.map((c) => [c.v, c.t]), e.country || 'IT')}${inp('orVS', 'Località / nome', e.state || '', 'placeholder="es. Milano"')}${sel('orVA', 'Autenticazione', Object.entries(AUTH), e.auth || 'noup')}${stSel('orVST', e.id ? e.status : 'ACTIVE')}
      ${inp('orVU', 'Utente (se richiesto)', e.user || '', 'autocomplete="off" placeholder="credenziali di servizio Surfshark"')}${inp('orVP', e.id && e.hasPass ? 'Password (vuota = lascia quella attuale)' : 'Password (se richiesta)', e.pass || '', 'autocomplete="new-password"', 'password')}
      <label class="l" style="grid-column:1/-1">File .ovpn <input type="file" id="orVF" accept=".ovpn,.conf,text/plain" style="margin-left:8px;font-size:12px"><textarea class="inp mono" id="orVT" rows="5" spellcheck="false" placeholder="Incolla qui il contenuto del file .ovpn (oppure scegli il file qui sopra)${e.id ? ' — vuoto = tieni il file attuale' : ''}">${esc(e.ovpn || '')}</textarea></label>
      <label class="l" style="grid-column:1/-1">Oppure link diretto al file<input class="inp" id="orVL" value="${esc(e.lnk !== undefined ? e.lnk : (e.id && !e.hosted ? e.url || '' : ''))}" placeholder="https://… (se il file è già online da qualche parte)"></label></div>
      ${e.id && e.hosted ? '<small class="mut" style="display:block;margin-top:6px">Il file attuale è ospitato da KAIROS.</small>' : ''}
      <div style="display:flex;gap:6px;margin-top:10px"><button class="btn pri" data-or="vpnsave">${e.id ? 'Salva su ORCP' : 'Aggiungi su ORCP'}</button>${e.id ? '<button class="btn" data-or="vpncancel">Annulla</button>' : ''}</div></div>`;
    const st = (x) => /^ACTIVE/i.test(x.status) ? badge('Accesa', '#2dd4bf') : badge('Spenta', '#9aa4b2');
    const acts = (x) => `<button class="btn sm" data-orved="${esc(x.id)}">Modifica</button><button class="btn sm" data-orvdel="${esc(x.id)}" style="color:#ff8f8f">Elimina</button>`;
    const L = d.list || [];
    if (mobile()) return help + form + L.map((x) => card(`${esc(x.country)} · ${esc(x.state)} ${st(x)}`, [`Aggiunta ${when(x.date)}`], acts(x))).join('');
    return help + form + grid(['Paese', 'Località', 'Stato', 'Aggiunta', ''], L.map((x) => tr([`<b>${esc(x.country)}</b>`, esc(x.state), st(x), when(x.date), `<div style="display:flex;gap:5px">${acts(x)}</div>`])));
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
    const d = R.data.portals, cfg = (R.st && R.st.cfg) || { map: {}, portalNames: [] };
    const live = d && Array.isArray(d.list), cached = Array.isArray(cfg.portalNames) ? cfg.portalNames : [];
    const list = live ? d.list : cached.map((x) => ({ ...x, url: '' }));
    const labels = list.map((x, i) => ({ ...x, name: x.name || `Server ${i + 1}` }));
    const names = labels.map((x) => x.name);
    const apk = live ? d.apk : cfg.apk;
    const agentRows = (D.agents || []).map((a) => {
      const p = a.perms || {}, assigned = new Set(Array.isArray(p.orcpSrv) ? p.orcpSrv : []);
      const choices = PORTAL_KEYS.map((k, i) => `<label style="display:inline-flex;gap:5px;align-items:center;margin:3px 10px 3px 0;white-space:nowrap"><input type="checkbox" data-orcp-srv="${k}"${assigned.has(k) ? ' checked' : ''}> Server ${i + 1} · ${esc(labels[i] ? labels[i].name : `Server ${i + 1}`)}</label>`).join('');
      return `<tr data-orcp-agent-row="${a.id}"><td><b>${esc(a.username)}</b><small class="mut" style="display:block">ID ${a.id}</small></td><td><div class="tog ${p.orcpApp ? 'on' : ''}" data-orcp-app role="switch" aria-checked="${!!p.orcpApp}" tabindex="0"><div><b>${p.orcpApp ? 'Attiva' : 'Spenta'}</b></div><i></i></div></td><td>${choices}<label style="display:inline-flex;gap:5px;align-items:center;margin:3px 0;white-space:nowrap"><input type="checkbox" data-orcp-all> Tutti</label></td></tr>`;
    }).join('');
    const access = `<div class="card" style="padding:14px;margin-bottom:12px"><b>📲 App per gli agenti</b><small class="mut" style="display:block;margin:2px 0 10px">L'agente scarica l'app e vede solo i server che gli assegni, senza indirizzi DNS.</small>
      <div style="display:flex;gap:10px;align-items:end;flex-wrap:wrap"><label class="l" style="max-width:220px">Codice Downloader<input class="inp mono" id="orDL" inputmode="numeric" maxlength="12" value="${esc(cfg.dl || '8128314')}"></label>${apk ? `<a class="btn sm" href="${esc(apk)}" target="_blank" rel="noopener">Link APK</a>` : ''}</div>
      ${!live ? '<small class="mut" style="display:block;margin:4px 0 10px">I portali non sono aggiornabili ora: uso gli ultimi nomi salvati.</small>' : ''}
      <div style="overflow:auto;margin-top:8px"><table class="tbl"><thead><tr><th>Agente</th><th>App</th><th>Server assegnabili</th></tr></thead><tbody>${agentRows || '<tr><td colspan="3" class="mut">Nessun agente.</td></tr>'}</tbody></table></div>
      <div style="margin-top:10px"><button class="btn pri" data-or="agentsave">Salva</button></div></div>`;
    const livePortals = live ? `<div class="card" style="padding:14px;margin-bottom:12px"><b>Server dell'app ${esc(name())}</b><small class="mut" style="display:block;margin:2px 0 10px">Sono i «portali» che il cliente sceglie nell'app. Gli indirizzi li vedi solo tu: ai venditori e nei messaggi ai clienti va solo il nome.</small>
      ${d.list.map((p, i) => `<div class="g2" style="margin-bottom:6px"><label class="l">Nome server ${i + 1}<input class="inp" data-orpn="${p.k}" value="${esc(p.name)}" placeholder="es. SERVER-${i + 1}"></label><label class="l">Indirizzo (DNS)<input class="inp mono" data-orpu="${p.k}" value="${esc(p.url)}" placeholder="http://dns.esempio.com:8080"></label></div>`).join('')}
      <div style="display:flex;gap:6px;margin-top:8px;align-items:center"><button class="btn pri" data-or="portsave">Salva i portali su ORCP</button>${apk ? `<a class="btn sm" href="${esc(apk)}" target="_blank" rel="noopener">Link APK</a>` : ''}</div></div>` : '';
    if (!live && R.st && R.st.connected) need('portals');
    const mapping = `<div class="card" style="padding:14px"><b>Quale server per ogni pannello</b><small class="mut" style="display:block;margin:2px 0 10px">Così «Nuova attivazione» e il pulsante «${esc(name())}» sulle linee dicono al cliente quale server scegliere nell'app.</small>
      <div class="g2">${inp('orCN', 'Nome dell\'app (come la chiami ai clienti)', cfg.name || (R.st && R.st.app && R.st.app.name) || '', 'placeholder="MirkoTeam"')}${Object.entries(PANEL_NAME).map(([k, n]) => `<label class="l">Linee ${n}<select class="inp" data-ormap="${k}"><option value="">— nessun server —</option>${names.map((s) => `<option${(cfg.map || {})[k] === s ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select></label>`).join('')}</div>
      <div style="margin-top:10px"><button class="btn pri" data-or="cfgsave">Salva abbinamento</button></div></div>`;
    return access + (live ? livePortals : R.st && R.st.connected ? loading('portals', 'Carico i portali dall\'app…') : '') + mapping;
  }
  function link() {
    const s = R.st || {};
    const stTxt = !s.connected ? badge('Non collegato', '#9aa4b2') : s.expired ? badge('Accesso scaduto', '#ff6b6b') : badge('Collegato', '#2dd4bf');
    const info = s.connected ? `<div class="mut" style="font-size:13px;margin:6px 0 10px;line-height:1.6">${s.user ? 'Account ORCP: <b>' + esc(s.user) + '</b><br>' : ''}${s.app ? `App: <b>${esc(s.app.name || '')}</b>${s.app.version ? ' · versione ' + esc(s.app.version) : ''}${s.app.expires ? ' · licenza fino al ' + esc(s.app.expires) : ''}<br>` : ''}${s.remember ? 'Accesso con «Remember me»: resta valido per mesi, finché non cambi password o premi Log Out su ORCP.' : '<span style="color:#ffb020">Collegato senza «Remember me»: dura circa 2 ore. Rientra su ORCP spuntando «Remember me» e ripassa l\'accesso.</span>'}</div>` : '';
    return `<div class="card" style="padding:14px;max-width:720px"><div style="display:flex;gap:10px;align-items:center"><b>Accesso a cp.ottrun.com</b>${stTxt}</div>${info}
      <p class="mut" style="font-size:13px;line-height:1.6;margin:8px 0">ORCP ha la verifica «sono umano» al login, quindi KAIROS non può entrare da solo. Entri tu una volta e gli passi l'accesso:</p>
      <ol class="mut" style="font-size:13px;line-height:1.7;margin:0 0 10px 18px;padding:0"><li>Dal computer entra su <b>cp.ottrun.com</b> spuntando <b>«Remember me»</b>.</li><li>Apri gli strumenti del browser (F12 o ⌘⌥I) → <b>Application</b> → <b>Cookies</b> → cp.ottrun.com.</li><li>Copia la riga <b>remember_web_…</b> (nome e valore) e incollala qui sotto. Va bene anche la tabella intera copiata.</li></ol>
      <textarea class="inp" id="orCK" rows="3" placeholder="remember_web_…=valore; orcp_ottrun_control_panel_session=valore" style="font-family:monospace;font-size:12px">${esc(R.ck || '')}</textarea>
      <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap"><button class="btn pri" data-or="linksave">${s.connected ? 'Aggiorna accesso' : 'Collega'}</button>${s.connected ? '<button class="btn" data-or="unlink">Scollega</button>' : ''}<a class="btn" href="https://cp.ottrun.com/login" target="_blank" rel="noopener">Apri ORCP</a></div></div>`;
  }

  function statsHtml(d) { const all = d.list || [], onN = all.filter((x) => x.online).length, dayN = all.filter((x) => !x.online && KXStats.ts(x.last) >= Date.now() - 864e5).length; return KXStats.strip([{ k: 'online', label: 'Online ora', v: onN, c: 'blue' }, { k: 'day', label: 'Offline, viste nelle 24 ore', v: dayN, c: 'teal' }, { k: 'all', label: 'Utenti totali', v: all.length, c: 'dark' }, { label: 'Versioni app', v: (d.versions || []).length, c: 'dark' }], { margin: '0 0 12px' }); }
  function render() {
    const V = $('#v-orcp'); if (!V) return;
    if (isAg()) { V.innerHTML = '<p class="mut">Questo pannello è solo del titolare.</p>'; return; }
    const s = R.st;
    if (!s) { V.innerHTML = '<p class="mut">Carico…</p>'; return; }
    const tabs = `<div class="tabs" style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:12px">${TABS.filter(([k]) => s.connected || k === 'link' || k === 'portals').map(([k, t]) => `<button class="btn sm${R.tab === k ? ' pri' : ''}" data-ortab="${k}">${t}</button>`).join('')}</div>`;
    const head = `<div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px"><div class="mut" style="font-size:13px">${s.connected ? `App <b>${esc(name())}</b> su cp.ottrun.com${s.app && s.app.version ? ' · v' + esc(s.app.version) : ''}` : 'Collega il tuo account ORCP per gestire l\'app da qui.'}</div><div style="display:flex;gap:6px">${s.connected && window.KXQuickAct ? `<button class="btn sm" data-or="qa">Nuova attivazione</button>` : ''}</div></div>`;
    const warn = s.expired ? '<div class="card" style="padding:10px 14px;margin-bottom:10px;border-left:3px solid #ff6b6b">L\'accesso a ORCP è scaduto: vai in «Collega» e ripassa l\'accesso.</div>' : '';
    const tab = (!s.connected || s.expired) && R.tab !== 'portals' ? 'link' : R.tab;
    const body = { conns, msgs, ann, maint, pin, vpn, portals, link }[tab]();
    const live = s.connected && !s.expired; if (live) need('conns');
    const stats = live && R.data.conns && window.KXStats ? statsHtml(R.data.conns) : '';
    V.innerHTML = head + warn + stats + tabs + (R.err ? `<div class="card" style="padding:10px 14px;margin-bottom:10px;border-left:3px solid #ff6b6b">${esc(R.err)}</div>` : '') + body;
    wire(V);
  }
  const val = (id) => ($('#' + id) ? $('#' + id).value : '');
  async function act(fn, okMsg) { if (R.busy) return; R.busy = true; try { await fn(); if (okMsg) toast(okMsg); R.err = ''; } catch (e) { R.err = e.message; toast(e.message, 1); } R.busy = false; render(); }
  function wire(V) {
    if (window.KXStats) KXStats.bind(V, (k) => { R.tab = 'conns'; R.onlyOn = k === 'online'; R.q = ''; render(); });
    $$('[data-ortab]', V).forEach((b) => (b.onclick = () => { R.tab = b.dataset.ortab; R.err = ''; render(); }));
    const q = $('#orQ'); if (q) { q.oninput = () => { R.q = q.value; const st = q.selectionStart; render(); const n = $('#orQ'); if (n) { n.focus(); n.setSelectionRange(st, st); } }; }
    const on = $('#orOn'); if (on) on.onchange = () => { R.onlyOn = on.checked; render(); };
    $$('[data-orcp-app]', V).forEach((x) => {
      const toggle = () => { x.classList.toggle('on'); x.setAttribute('aria-checked', String(x.classList.contains('on'))); const b = x.querySelector('b'); if (b) b.textContent = x.classList.contains('on') ? 'Attiva' : 'Spenta'; };
      x.onclick = toggle; x.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } };
    });
    $$('[data-orcp-all]', V).forEach((x) => (x.onchange = () => {
      const row = x.closest('[data-orcp-agent-row]'); if (row) row.querySelectorAll('[data-orcp-srv]').forEach((s) => (s.checked = x.checked));
    }));
    const ck = $('#orCK', V); if (ck) ck.oninput = () => { R.ck = ck.value; }; // resta anche se il pannello si ridisegna (aggiornamento automatico)
    $$('[data-orcp]', V).forEach((b) => (b.onclick = () => copy(b.dataset.orcp, 'Testo')));
    $$('[data-ormsg]', V).forEach((b) => (b.onclick = () => { R.edit = { user: b.dataset.ormsg }; R.tab = 'msgs'; render(); setTimeout(() => $('#orMT') && $('#orMT').focus(), 30); }));
    $$('[data-ormed]', V).forEach((b) => (b.onclick = () => { const x = (R.data.messages.list || []).find((m) => String(m.id) === b.dataset.ormed); if (x) { R.edit = { ...x }; render(); } }));
    $$('[data-ormdel]', V).forEach((b) => (b.onclick = async () => { if (!(await ask('Eliminare il messaggio?', 'Sparisce dall\'app del cliente.'))) return; act(async () => { R.data.messages = await api('DELETE', '/admin/orcp/messages/' + encodeURIComponent(b.dataset.ormdel)); }, 'Messaggio eliminato'); }));
    const vf = $('#orVF', V); if (vf) vf.onchange = () => { const f = vf.files && vf.files[0]; if (!f) return; f.text().then((t) => { const ta = $('#orVT'); if (ta) ta.value = t; (R.vf = R.vf || {}).ovpn = t; }); };
    for (const [id, k] of [['orVC', 'country'], ['orVS', 'state'], ['orVA', 'auth'], ['orVST', 'status'], ['orVU', 'user'], ['orVP', 'pass'], ['orVT', 'ovpn'], ['orVL', 'lnk']]) { const el = $('#' + id, V); if (el) el.oninput = el.onchange = () => { (R.vf = R.vf || {})[k] = el.value; }; }
    $$('[data-orved]', V).forEach((b) => (b.onclick = () => act(async () => { const x = await api('GET', '/admin/orcp/vpn/' + encodeURIComponent(b.dataset.orved)); R.vedit = { ...x, id: b.dataset.orved }; R.vf = null; })));
    $$('[data-orvdel]', V).forEach((b) => (b.onclick = async () => { if (!(await ask('Eliminare questa configurazione VPN?', 'L\'app non la userà più.'))) return; act(async () => { R.data.vpn = await api('DELETE', '/admin/orcp/vpn/' + encodeURIComponent(b.dataset.orvdel)); if (R.vedit && R.vedit.id === b.dataset.orvdel) R.vedit = null; }, 'Configurazione eliminata'); }));
    $$('[data-or]', V).forEach((b) => (b.onclick = () => {
      const a = b.dataset.or;
      if (a === 'reload') { R.data.conns = null; R.err = ''; LD.add('conns'); render(); api('GET', '/admin/orcp/data?w=conns&fresh=1').then((r) => { R.data.conns = r; }).catch((e) => { R.err = e.message; }).then(() => { LD.delete('conns'); render(); }); }
      if (a === 'qa') window.KXQuickAct && KXQuickAct({ app: 'orcp' });
      if (a === 'msgcancel') { R.edit = null; render(); }
      if (a === 'msgsave') act(async () => { const body = { user: val('orMU'), text: val('orMT'), expire: val('orMD'), status: val('orMS') }; R.data.messages = R.edit && R.edit.id ? await api('PUT', '/admin/orcp/messages/' + encodeURIComponent(R.edit.id), body) : await api('POST', '/admin/orcp/messages', body); R.edit = null; }, 'Messaggio salvato su ORCP');
      if (a === 'vpncancel') { R.vedit = null; R.vf = null; render(); }
      if (a === 'vpnsave') { const body = { country: val('orVC'), state: val('orVS'), auth: val('orVA'), status: val('orVST'), user: val('orVU'), pass: val('orVP'), ovpn: val('orVT'), url: val('orVL') }; act(async () => { R.data.vpn = R.vedit && R.vedit.id ? await api('PUT', '/admin/orcp/vpn/' + encodeURIComponent(R.vedit.id), body) : await api('POST', '/admin/orcp/vpn', body); R.vedit = null; R.vf = null; }, 'Salvato su ORCP'); }
      if (a === 'annsave') act(async () => { R.data.ann = await api('PUT', '/admin/orcp/ann', { text: val('orAT'), status: val('orAS'), expire: val('orAD'), interval: val('orAI'), disappear: val('orAX') }); }, 'Annuncio salvato');
      if (a === 'maintsave') act(async () => { R.data.maint = await api('PUT', '/admin/orcp/maint', { text: val('orMMT'), status: val('orMMS'), expire: val('orMMD') }); }, 'Avviso salvato');
      if (a === 'pin') act(async () => { R.pin = await api('POST', '/admin/orcp/parental', { code: val('orPC') }); if (!R.pin.pin && !R.pin.text) throw new Error('ORCP non ha restituito il PIN: controlla il codice'); });
      if (a === 'portsave') act(async () => { const list = $$('[data-orpn]', V).map((i) => ({ k: i.dataset.orpn, name: i.value, url: ($('[data-orpu="' + i.dataset.orpn + '"]', V) || {}).value || '' })); R.data.portals = await api('PUT', '/admin/orcp/portals', { list }); }, 'Portali aggiornati su ORCP');
      if (a === 'agentsave') act(async () => {
        const agents = $$('[data-orcp-agent-row]', V).map((row) => ({ id: +row.dataset.orcpAgentRow, on: row.querySelector('[data-orcp-app]').classList.contains('on'), srv: [...row.querySelectorAll('[data-orcp-srv]:checked')].map((x) => x.dataset.orcpSrv) }));
        const r = await api('PUT', '/admin/orcp/agents', { dl: val('orDL').trim(), agents });
        R.st.cfg = r.cfg;
        for (const item of r.agents || []) { const target = (D.agents || []).find((x) => x.id === item.id); if (target) target.perms = { ...(target.perms || {}), ...item.perms }; }
      }, 'Permessi MirkoTeam salvati');
      if (a === 'cfgsave') act(async () => { const map = {}; $$('[data-ormap]', V).forEach((s) => (map[s.dataset.ormap] = s.value)); const r = await api('PUT', '/admin/orcp/cfg', { name: val('orCN'), map }); R.st.cfg = r.cfg; await state(true); }, 'Abbinamento salvato');
      if (a === 'linksave') act(async () => { const ck = (val('orCK') || R.ck || '').trim(); if (!ck) throw new Error('Incolla i cookie di cp.ottrun.com'); await api('PUT', '/admin/orcp/session', { cookies: ck }); R.ck = ''; R.data = {}; R.tab = 'conns'; await state(true); }, 'ORCP collegato');
      if (a === 'unlink') ask('Scollegare ORCP?', 'KAIROS dimentica l\'accesso. Su ORCP non cambia niente.').then((ok) => ok && act(async () => { await api('DELETE', '/admin/orcp/session'); R.data = {}; await state(true); }, 'ORCP scollegato'));
    }));
  }
  async function open() { if (isAg()) return render(); render(); await state(); render(); }

  /* ---------- per le linee e «Nuova attivazione»: nome dell'app, server dei pannelli, messaggio per il cliente ---------- */
  let cfgP = null;
  const cfg = () => {
    const c = R.st && R.st.cfg || {};
    const servers = R.data.portals ? R.data.portals.list.filter((x) => x.name || x.url).map((x) => x.name || x.url) : (c.portalNames || []).map((x) => x.name).filter(Boolean);
    return { name: c.name || name(), map: c.map || {}, servers, dl: c.dl || '8128314', apk: c.apk || '' };
  };
  window.KXOrcpAgentCan = () => isAg() && !!((D.me || {}).perms || {}).orcpApp && Array.isArray(((D.me || {}).perms || {}).orcpSrv) && ((D.me || {}).perms || {}).orcpSrv.length > 0;
  window.KXOrcpName = () => name();
  window.KXOrcpCfg = async () => {
    if (isAg()) return null;
    if (!R.st) await state();
    if (!cfgP) cfgP = api('GET', '/admin/orcp/cfg').then((r) => { R.st.servers = r.servers || []; R.st.cfg = r.cfg || R.st.cfg; return r; }).catch(() => null);
    const r = await cfgP;
    return r ? { name: r.cfg.name || name(), map: r.cfg.map || {}, servers: (r.cfg.portalNames || []).map((x) => x.name).filter(Boolean), dl: r.cfg.dl, apk: r.cfg.apk } : cfg();
  };
  window.KXOrcpText = (o) => [`• ${o.app}: apri l'app, scegli il server «${o.server || 'indicato'}» ed entra con utente e password qui sopra.`].join('\n');
  async function openAgentApp() {
    const V = $('#v-orcp-agent'); if (!V) return;
    V.innerHTML = '<p class="mut">Carico MirkoTeam…</p>';
    try {
      const c = await api('GET', '/admin/agent/orcp');
      V.innerHTML = `<div class="card" style="padding:16px;max-width:760px"><h3 style="margin:0 0 8px">📲 ${esc(c.name || 'MirkoTeam')}</h3>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:10px 0"><b>Codice Downloader ${esc(c.dl)}</b><button class="btn sm" data-agent-copy="${esc(c.dl)}">Copia</button></div>
        ${c.apk ? `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:10px 0"><a href="${esc(c.apk)}" target="_blank" rel="noopener">Scarica APK</a><button class="btn sm" data-agent-copy="${esc(c.apk)}">Copia link</button></div>` : ''}
        <h4>I tuoi server</h4>${c.servers.length ? `<ul>${c.servers.map((s) => `<li>Server ${s.n}${s.name && s.name !== 'Server ' + s.n ? ' · ' + esc(s.name) : ''}</li>`).join('')}</ul>` : '<p class="mut">Non hai ancora server assegnati: chiedili al tuo fornitore</p>'}</div>`;
      $$('[data-agent-copy]', V).forEach((b) => (b.onclick = () => copy(b.dataset.agentCopy, 'Testo')));
    } catch (e) { V.innerHTML = `<p class="mut">${esc(e.message)}</p>`; }
  }
  async function newAgentOrcp(pre) {
    let c;
    try { c = await api('GET', '/admin/agent/orcp'); } catch (e) { return toast(e.message, 1); }
    if (!c.servers.length) return toast('Non hai server MirkoTeam assegnati', 1);
    const defName = c.map && c.map[pre.panel], def = c.servers.find((s) => s.name === defName) || c.servers[0];
    const ov = document.createElement('div'); ov.className = 'kxpay-veil';
    ov.innerHTML = `<div class="kxpay-box" role="dialog" aria-modal="true" aria-labelledby="orAgentTitle"><h3 id="orAgentTitle">📲 MirkoTeam · ${esc(pre.name || pre.user)}</h3>
      <label class="l" style="display:grid;gap:6px;margin-top:14px">Server<select class="inp" id="orAgentServer">${c.servers.map((s) => `<option value="${s.n}"${s.n === def.n ? ' selected' : ''}>Server ${s.n}${s.name && s.name !== 'Server ' + s.n ? ' · ' + esc(s.name) : ''}</option>`).join('')}</select></label>
      <textarea class="inp" id="orAgentMessage" rows="6" readonly aria-label="Messaggio pronto da copiare" style="width:100%;min-height:130px;margin-top:12px;line-height:1.5;resize:vertical"></textarea>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px;flex-wrap:wrap"><button type="button" class="btn pri" id="orAgentCopy">Copia tutto</button><button type="button" class="btn" id="orAgentClose">Chiudi</button></div></div>`;
    document.body.appendChild(ov);
    const close = () => { document.removeEventListener('keydown', onKeydown); ov.remove(); };
    const onKeydown = (e) => { if (e.key === 'Escape') close(); };
    const server = () => c.servers.find((s) => s.n === +$('#orAgentServer', ov).value) || c.servers[0];
    const message = () => `Scarica l'app ${c.name}: Downloader ${c.dl}${c.apk ? ` (oppure ${c.apk})` : ''}. Apri l'app, scegli il server «${server().name}» ed entra con utente ${pre.user} e password ${pre.pass}.`;
    const update = () => { $('#orAgentMessage', ov).value = message(); };
    $('#orAgentServer', ov).onchange = update; update();
    document.addEventListener('keydown', onKeydown); $('#orAgentServer', ov).focus();
    $('#orAgentClose', ov).onclick = close; ov.onclick = (e) => { if (e.target === ov) close(); };
    $('#orAgentCopy', ov).onclick = async () => { try { await navigator.clipboard.writeText(message()); toast('Messaggio copiato'); close(); } catch { toast('Copia non riuscita', 1); } };
  }
  /** pre: { user, pass, name, note, panel } — segna la linea negli Appunti App e prepara il messaggio per il cliente */
  window.KXOrcpNew = async (pre) => {
    if (isAg()) return window.KXOrcpAgentCan() ? newAgentOrcp(pre) : toast('App MirkoTeam non abilitata o senza server assegnati', 1);
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
  window.view = view = function (v) { const r = v0.apply(this, arguments); if (v === 'orcp') open(); if (v === 'orcp-agent') openAgentApp(); return r; };
  TITLES['orcp-agent'] = 'MirkoTeam';
  const sec = $('#v-orcp');
  if (sec) new MutationObserver(() => { if (sec.classList.contains('on') && !sec.innerHTML.trim()) open(); }).observe(sec, { attributes: true, attributeFilter: ['class'] });
  setTimeout(() => { if (!isAg() && (D.role || D.settings)) state(); }, 1500);
})();
