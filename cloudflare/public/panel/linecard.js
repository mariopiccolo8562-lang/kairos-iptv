/* KAIROS Control — scheda completa di una linea dei pannelli IPTV (10 novembre 2026).
   Server e DNS, stato e scadenza, collegata sì/no con connessioni e canale, IP con provider e segno VPN (dove il
   pannello lo dà: Realott, SLT, Atlantix, MirkoTeam e app KAIROS), app che usano la stessa linea (clienti Kairos,
   MaxPlayer, OrbixPlay, MirkoTeam), reseller, nota, password, creata, pacchetto.
   - barra «presente in N pannelli» (xsearch.js): caselle e «👁 Vedi le selezionate» → schermata in primo piano;
   - «Tutti i pannelli» → «Consulta» (allpanels.js): le stesse voci dentro la sua scheda (kvExtra).
   Titolare sempre; agenti solo con il permesso «Linee selezionate in primo piano» (lineView), spento per tutti.
   I DNS li vede solo il titolare. Legge solo dati che il pannello ha già (liste, connessioni, presenza delle app):
   nessuna operazione nuova sui pannelli. Va dopo online.js, line-map.js e omni.js. */
(() => {
  const css = document.createElement('style');
  css.textContent = `#lcOv{position:fixed;inset:0;z-index:38;display:grid;place-items:center;background:rgba(3,4,10,.62);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);padding:16px}
#lcOv .lc-box{width:min(980px,100%);max-height:92vh;overflow:auto;padding:20px 22px;background:#0e1424;border:1px solid var(--line);border-radius:18px;box-shadow:0 30px 80px #000a}
#lcOv .lc-bh{display:flex;align-items:flex-start;gap:12px;margin-bottom:12px}#lcOv .lc-bh h3{margin:0;flex:1;font-size:17px}
#lcOv .lc-bh h3 small{display:block;font-size:12.5px;font-weight:400;color:var(--mut);margin-top:3px}
#lcOv .lc-card{border:1px solid var(--line);border-left:4px solid var(--c,#4f8cff);border-radius:14px;padding:12px 14px;margin-bottom:10px;background:rgba(255,255,255,.025)}
.lc-ch{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.lc-pn{font-size:11.5px;font-weight:800;padding:2px 8px;border-radius:999px;background:color-mix(in srgb,var(--c,#4f8cff) 22%,transparent);color:color-mix(in srgb,var(--c,#4f8cff) 70%,#fff);border:1px solid color-mix(in srgb,var(--c,#4f8cff) 45%,transparent)}
.lc-u{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-weight:800;font-size:15px}
.lc-pill{font-size:11.5px;font-weight:700;padding:2px 8px;border-radius:999px;border:1px solid var(--line)}
.lc-pill.on{background:#14532d66;color:#86efac;border-color:#22c55e55}.lc-pill.exp{background:#7f1d1d55;color:#fca5a5;border-color:#ef444455}.lc-pill.off{background:#33415555;color:#cbd5e1}
.lc-pill.live{background:#14532d66;color:#4ade80;border-color:#22c55e66}.lc-pill.idle{color:var(--mut)}.lc-pill.wait{color:#fbbf24;border-color:#f59e0b55}
.lc-kv{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:8px 14px;margin-top:10px;font-size:13px}
.lc-kv>div>span:first-child{display:block;font-size:11px;color:var(--mut);text-transform:uppercase;letter-spacing:.05em}
.lc-kv div{min-width:0;overflow-wrap:anywhere}.lc-kv .lc-w{grid-column:1/-1}.lc-kv code{font-size:12px}
.lc-kv button{font-size:11px;padding:1px 6px;margin-left:4px}.lc-pw{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.lc-ip{display:flex;flex-wrap:wrap;gap:4px 10px;align-items:center;margin:2px 0}.lc-ip small{color:var(--mut)}
.lc-app{display:flex;flex-wrap:wrap;gap:4px 8px;align-items:center;margin:2px 0}.lc-app small{color:var(--mut)}
.lc-dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#64748b;margin-right:2px}.lc-dot.on{background:#22c55e;box-shadow:0 0 6px #22c55e}
.lc-acts{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
.lc-mut{color:var(--mut);font-style:italic}
@media (max-width:700px){#lcOv{padding:8px}#lcOv .lc-box{padding:14px}.lc-kv{grid-template-columns:minmax(0,1fr) minmax(0,1fr);grid-auto-flow:row dense}}`;
  document.head.appendChild(css);

  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const lower = (s) => String(s || '').trim().toLowerCase();
  const isAg = () => typeof D === 'object' && D && D.role === 'agent';
  const can = () => typeof D === 'object' && !!D && (!isAg() || !!(((D.me || {}).perms || {}).lineView));
  const PN = { wolf: 'WOLF', armada: 'Armada', storm: 'Storm', atx: 'Atlantix', ro: 'Realott', slt: 'SLT', mxp: 'MaxPlayer', oxp: 'OrbixPlay', orcp: 'MirkoTeam', blk: 'Black IPTV' };
  const PC = { wolf: '#38bdf8', armada: '#fb923c', storm: '#a78bfa', atx: '#22d3ee', ro: '#4ade80', slt: '#f472b6', mxp: '#fb7185', oxp: '#60a5fa', orcp: '#facc15', blk: '#e5e7eb' };
  const LINES = new Set(['wolf', 'armada', 'storm', 'atx', 'ro', 'slt']); // linee con scadenza, Modifica e Rinnova
  const DAY = 864e5;
  const ms = (v) => (window.KXSort ? KXSort.ms(v) : +v || 0);
  const day = (t) => (t ? new Date(t).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—');
  const left = (t) => { if (!t) return 'senza scadenza'; const n = window.KXSort ? KXSort.calDays(t) : Math.ceil((t - Date.now()) / DAY); return n < 0 ? `scaduta da ${-n} ${n === -1 ? 'giorno' : 'giorni'}` : n === 0 ? 'scade oggi' : `tra ${n} ${n === 1 ? 'giorno' : 'giorni'}`; };
  const ago = (t) => { const s = Math.max(0, Math.round((Date.now() - t) / 1000)); return s < 90 ? 'adesso' : s < 5400 ? Math.round(s / 60) + ' min fa' : s < 129600 ? Math.round(s / 3600) + ' h fa' : Math.round(s / 86400) + ' g fa'; };
  const toastE = (m) => (typeof toast === 'function' ? toast(m, 1) : null);

  /* ---------- dati in più, già letti dal pannello: DNS di Armada/Storm, presenza delle app KAIROS ---------- */
  const C = { st: {}, stT: {}, pres: new Map(), presT: 0, presBusy: null };
  async function stateDns(p) {
    if (C.st[p] !== undefined && Date.now() - C.stT[p] < 300e3) return C.st[p];
    try { const st = await api('GET', `/admin/${p}/state`); C.st[p] = (st && st.connected && st.dns) || ''; } catch { C.st[p] = ''; }
    C.stT[p] = Date.now(); return C.st[p];
  }
  function presence() {
    if (C.presBusy) return C.presBusy;
    if (Date.now() - C.presT < 30e3) return Promise.resolve(C.pres);
    C.presBusy = (async () => {
      try {
        const P = await (window.KC && KC.api ? KC.api('GET', '/admin/presence') : api('GET', '/admin/presence'));
        const m = new Map(); for (const o of [...((P && P.recent) || []), ...((P && P.online) || [])]) if (o && o.id) m.set(o.id, o);
        C.pres = m;
      } catch { /* senza la pagina «Online» resta vuota */ }
      C.presT = Date.now(); C.presBusy = null; return C.pres;
    })();
    return C.presBusy;
  }
  /** carica quello che serve alle schede (ogni fonte ha la sua cache): la promessa si risolve quando è tutto arrivato */
  function load(rows) {
    const jobs = [];
    if (window.KXWatch) jobs.push(KXWatch.load());
    if (window.KXLineMap) jobs.push(KXLineMap.load());
    if (window.KXOmni) jobs.push(KXOmni.preload());
    jobs.push(presence());
    for (const p of new Set((rows || []).filter((r) => (r.p === 'armada' || r.p === 'storm') && !r.dns).map((r) => r.p))) jobs.push(stateDns(p));
    return Promise.allSettled(jobs);
  }

  /* ---------- una riga della ricerca (omni.js) nella stessa forma delle righe di «Tutti i pannelli» ---------- */
  function norm(x) {
    const r = x.raw || {}, p = x.p;
    const o = { p, ref: String(x.q || x.t || ''), u: x.t || '', pw: '', n: '', exp: 0, en: true, expired: false, on: null, conns: 0, max: 0, w: '', owner: '', created: 0, trial: false, pack: '', id: '', dns: '', tab: x.tab || '', src: x };
    if (p === 'wolf') Object.assign(o, { u: r.username || o.u, pw: r.password || '', n: r.note || '', exp: ms(r.exp), en: !!r.enabled, on: (+r.conns || 0) > 0, conns: +r.conns || 0, max: +r.max || 0, w: r.watching || '', owner: r.owner || '', created: ms(r.created), trial: !!r.trial, id: String(r.id || ''), dns: r.dns || '' });
    else if (p === 'armada' || p === 'storm') Object.assign(o, { u: r.username || r.mac || o.u, mac: r.mac || '', pw: r.password || '', n: r.notes || '', exp: ms(r.exp), en: !!r.enabled, on: undefined, max: +r.maxConn || 0, owner: r.by || r.owner || '', created: ms(r.created), trial: !!r.trial, id: String(r.id || '') });
    else if (p === 'atx') Object.assign(o, { u: r.username || o.u, pw: r.password || '', n: r.notes || '', exp: ms(r.exp_date), en: Number(r.enabled) !== 0, on: Number(r.online) > 0, conns: Number(r.online) || 0, max: Number(r.max_connections) || 0, w: r.channel || '', owner: r.reseller || r.owner || r.reseller_username || '', created: ms(r.created_at), trial: Number(r.is_trial) === 1, id: String(r.id || ''), dns: r.reseller_dns || '' });
    else if (p === 'ro' || p === 'slt') Object.assign(o, { u: r.username || o.u, pw: r.password || '', n: r.notes || '', exp: ms(r.exp), en: !!r.enabled, expired: !!r.expired, on: (+r.conns || 0) > 0, conns: +r.conns || 0, max: +r.max || 0, w: r.stream || '', owner: r.owner || '', created: ms(r.created), trial: !!r.trial, pack: r.type || '', id: String(r.id || ''), dns: x.dns || '' });
    else if (p === 'mxp') {
      const L = (r.lists || []).map((l) => ({ user: l.user || '', pass: l.pass || '', host: l.fqdn ? (l.ssl ? 'https://' : 'http://') + l.fqdn + (l.port ? ':' + l.port : '') : '', name: l.name || '' }));
      Object.assign(o, { u: r.username || o.u, id: String(r.id || ''), owner: x.acc || '', lists: L, mail: r.email || '', dns: [...new Set(L.map((l) => l.host).filter(Boolean))].join(' · '), on: undefined });
    } else if (p === 'oxp') Object.assign(o, { u: r.user || r.name || o.u, pw: r.pass || '', n: r.notes || '', id: String(r.id || ''), dev: r.device || '', plName: r.name || '', dns: r.host || '', on: undefined });
    else if (p === 'orcp') Object.assign(o, { u: r.user || o.u, on: !!r.online, last: r.last || '', dev: r.device || '', ver: r.version || '', app: r.app || '', ip: r.ip || '', id: String(r.id || '') });
    else if (p === 'blk') Object.assign(o, { u: r.username || o.u, pw: r.password || '', owner: r.reseller || '', exp: ms(r.expires || r.exp), max: +(r.maxConn || r.max || 0) || 0, conns: +(r.active || r.conns || 0) || 0, on: undefined, st: r.status || '' });
    return o;
  }

  /* ---------- pezzi della scheda ---------- */
  const dnsOf = (r) => r.dns || ((r.p === 'armada' || r.p === 'storm') && C.st[r.p]) || '';
  function stateOf(r) {
    if (!LINES.has(r.p)) return null;
    if (!r.en) return ['Disattivata', 'off'];
    if (r.expired || (r.exp && r.exp < Date.now())) return ['Scaduta', 'exp'];
    return [r.trial ? 'Attiva · prova' : 'Attiva', 'on'];
  }
  /** collegata adesso: { on: true|false|null (non verificabile)|undefined (controllo in corso), conns, max } */
  function onlineOf(r) {
    if (typeof r.on === 'boolean') return { on: r.on, conns: r.conns, max: r.max };
    const K = window.KXOnline; if (!K) return { on: null };
    if (r.key) { const v = K.get(r.key); return v === undefined ? { on: undefined } : v ? { on: !!v.on, conns: v.conns, max: v.max || r.max } : { on: null }; }
    if (r.p === 'mxp') {
      const ks = (r.lists || []).map((l) => (l.host && l.user && l.pass ? K.want(l.host, l.user, l.pass) : '')).filter(Boolean);
      if (!ks.length) return { on: null };
      const vs = ks.map((k) => K.get(k)); if (vs.some((v) => v && v.on)) { const v = vs.find((x) => x && x.on); return { on: true, conns: v.conns, max: v.max }; }
      return vs.some((v) => v === undefined) ? { on: undefined } : vs.some((v) => v) ? { on: false } : { on: null };
    }
    const h = dnsOf(r); if (!h || !r.u || !r.pw) return { on: null };
    const k = K.want(h, r.u, r.pw), v = k ? K.get(k) : null;
    return v === undefined ? { on: undefined } : v ? { on: !!v.on, conns: v.conns, max: v.max || r.max } : { on: null };
  }
  const chanOf = (r) => r.w || (window.KXWatch ? KXWatch.get(r.p, r.u) : '') || '';
  const pres = (id) => C.pres.get(id);
  /** chi usa la stessa linea: clienti Kairos e attivazioni (line-map.js) più MaxPlayer, OrbixPlay e MirkoTeam trovati nelle liste */
  function appsOf(r, M) {
    const users = r.p === 'mxp' ? (r.lists || []).map((l) => l.user).filter(Boolean) : [r.u];
    const out = [], seen = new Set(), add = (it) => { const k = lower(it.app + '|' + (it.who || '') + '|' + (it.ref || '')); if (seen.has(k)) return; seen.add(k); out.push(it); };
    for (const u of users) { const g = M && M.get(lower(u)); if (g) g.items.forEach(add); }
    const L = window.KXOmni && KXOmni.items ? KXOmni.items() || [] : [];
    const want = new Set(users.map(lower));
    for (const x of L) {
      if (x.p === r.p && lower(x.t) === lower(r.u)) continue; // è lei
      const raw = x.raw || {};
      if (x.p === 'mxp' && (raw.lists || []).some((l) => want.has(lower(l.user)))) add({ app: 'MaxPlayer', who: raw.username || 'ID ' + raw.id, ref: 'utente ' + (raw.username || raw.id) });
      else if (x.p === 'oxp' && want.has(lower(raw.user))) add({ app: 'OrbixPlay', who: raw.name || raw.user, ref: 'dispositivo ' + (raw.device || '') });
      else if (x.p === 'orcp' && want.has(lower(raw.user))) add({ app: 'MirkoTeam', who: raw.device || raw.user, ref: raw.online ? 'online ora' : raw.last ? 'ultimo accesso ' + raw.last : '', on: !!raw.online });
    }
    return out;
  }
  function ipsOf(r, M) {
    const out = [], seen = new Set(), add = (ip, isp, vpn, from) => { ip = String(ip || '').trim(); if (!ip || seen.has(ip)) return; seen.add(ip); out.push({ ip, isp, vpn, from }); };
    if (window.KXWatch && KXWatch.ip) for (const x of KXWatch.ip(r.p, r.u)) add(x.ip, x.isp, x.vpn, PN[r.p] + ' · ora');
    if (r.p === 'orcp' && r.ip) add(r.ip, '', '', 'MirkoTeam' + (r.on ? ' · ora' : ''));
    const users = r.p === 'mxp' ? (r.lists || []).map((l) => l.user) : [r.u];
    for (const u of users) { const g = M && M.get(lower(u)); for (const it of (g ? g.items : [])) { const o = it.id && pres(it.id); if (o && o.ip) add(o.ip, [o.city, o.country].filter(Boolean).join(', '), o.vpn === 'on' ? 'kairos' : '', `${it.app} · ${it.who}${o.online ? ' · ora' : ' · ' + ago(Date.now() - (+o.ago || 0))}`); } }
    return out;
  }
  const ipHtml = (x) => `<div class="lc-ip">${window.KXVpn ? KXVpn.ip(x.ip, x.vpn) : `<code>${esc(x.ip)}</code>`}${x.isp ? `<small>${esc(x.isp)}</small>` : ''}<small>${esc(x.from)}</small></div>`;
  function appHtml(it) {
    const o = it.id && pres(it.id), on = o ? !!o.online : !!it.on;
    const chip = window.KXLineMap ? KXLineMap.chip(it.app) : `<b>${esc(it.app)}</b>`;
    const st = o ? (o.online ? (o.ch || o.title ? '▶ ' + esc(o.ch || o.title) : 'online ora') : 'ultimo accesso ' + esc(ago(Date.now() - (+o.ago || 0)))) : '';
    return `<div class="lc-app">${o || it.on ? `<i class="lc-dot${on ? ' on' : ''}"></i>` : ''}${chip}<span>${esc(it.who || '')}</span>${it.ref ? `<small>${esc(it.ref)}</small>` : ''}${st ? `<small>${st}</small>` : ''}</div>`;
  }
  function serverHtml(r) {
    const d = isAg() ? '' : dnsOf(r);
    return `<b>${esc(PN[r.p] || r.p)}</b>${d ? `<br><code>${esc(d)}</code>` : ''}`;
  }
  /** le voci in più per «Tutti i pannelli» → «Consulta»: Server, IP, App che la usano */
  function kvExtra(r, kv, wide) {
    const M = window.KXLineMap ? KXLineMap.map() : null, ips = ipsOf(r, M), apps = appsOf(r, M);
    return kv('Server', serverHtml(r)) + kv('IP', ips.length ? ips.map(ipHtml).join('') : '<i class="lc-mut">il pannello non lo dice</i>', wide) + kv('App che la usano', apps.length ? apps.map(appHtml).join('') : '<i class="lc-mut">nessuna trovata</i>', wide);
  }

  /* ---------- schermata in primo piano con le linee scelte ---------- */
  const O = { list: [], pw: new Set(), gen: 0 };
  const close = () => { const o = $('#lcOv'); if (o) o.remove(); O.list = []; };
  function card(r, i, M) {
    const kv = (k, v, w) => `<div${w ? ' class="lc-w"' : ''}><span>${k}</span>${v}</div>`;
    const st = stateOf(r), on = onlineOf(r), ch = chanOf(r), tc = LINES.has(r.p) && window.KXSort ? KXSort.tone(r.exp, r.en, r.expired) : '';
    const onPill = on.on === true ? `<span class="lc-pill live">● Collegata ora</span>` : on.on === false ? '<span class="lc-pill idle">Non collegata</span>' : on.on === undefined ? '<span class="lc-pill wait">Controllo…</span>' : '';
    const ips = ipsOf(r, M), apps = appsOf(r, M), pwOn = O.pw.has(i);
    let h = `<div class="lc-card" style="--c:${PC[r.p] || '#4f8cff'}"><div class="lc-ch"><span class="lc-pn">${esc(PN[r.p] || r.p)}</span><span class="lc-u ${tc}">${esc(r.u || '—')}</span>${st ? `<span class="lc-pill ${st[1]}">${st[0]}</span>` : ''}${onPill}${window.KXPay && LINES.has(r.p) ? KXPay.badge('line', r.p, r.ref) : ''}</div><div class="lc-kv">`;
    h += kv('Server', serverHtml(r));
    if (LINES.has(r.p)) h += kv('Scadenza', `<b class="${tc}">${esc(day(r.exp))}</b> · ${esc(left(r.exp))}`);
    h += kv('Collegata ora', on.on === true ? `Sì · ${on.conns || 1}${on.max ? ' di ' + on.max : ''} ${(on.conns || 1) === 1 ? 'connessione' : 'connessioni'}` : on.on === false ? `No${r.max ? ` · massimo ${r.max}` : ''}` : on.on === undefined ? 'Controllo in corso…' : '<i class="lc-mut">non verificabile</i>');
    h += kv('Canale in onda', ch ? '▶ ' + esc(ch) : '<i class="lc-mut">—</i>');
    h += kv('IP', ips.length ? ips.map(ipHtml).join('') : `<i class="lc-mut">${r.p === 'wolf' || r.p === 'armada' || r.p === 'storm' || r.p === 'mxp' || r.p === 'oxp' ? 'il pannello non lo dice' : 'nessuna connessione adesso'}</i>`, 1);
    h += kv('App che la usano', apps.length ? apps.map(appHtml).join('') : '<i class="lc-mut">nessuna trovata</i>', 1);
    if (r.p === 'orcp') h += kv('Dispositivo', esc(r.dev || '—')) + kv('Versione', esc(r.ver || '—')) + kv('App', esc(r.app || '—')) + kv('Ultimo accesso', esc(r.on ? 'adesso' : r.last || '—'));
    if (r.p === 'mxp') h += kv('Liste', (r.lists || []).length ? r.lists.map((l) => `<div><code>${esc(l.user)}</code>${l.name ? ' · ' + esc(l.name) : ''}</div>`).join('') : '—', 1) + (r.mail ? kv('Email', esc(r.mail)) : '');
    if (r.p === 'oxp') h += kv('ID dispositivo', `<code>${esc(r.dev || '—')}</code>`) + (r.plName ? kv('Playlist', esc(r.plName)) : '');
    if (LINES.has(r.p) || r.p === 'oxp') h += kv('Cliente / nota', r.n ? `<b class="${tc}">${esc(r.n)}</b>` : '<i class="lc-mut">—</i>', 1);
    if (r.pw) h += kv('Password', `<b class="lc-pw">${pwOn ? esc(r.pw) : '••••••'}</b><button class="btn sm" type="button" data-lc="pw" data-i="${i}">${pwOn ? 'Nascondi' : 'Mostra'}</button><button class="btn sm" type="button" data-lc="cp" data-i="${i}">Copia</button>`, 1);
    if (r.owner) h += kv(r.p === 'mxp' ? 'Account' : 'Reseller', esc(r.owner));
    if (r.created) h += kv('Creata', esc(day(r.created)));
    if (r.pack) h += kv('Pacchetto', esc(r.pack));
    if (r.trial) h += kv('Prova', 'sì');
    if (r.id) h += kv('ID', esc(r.id));
    h += `</div><div class="lc-acts"><button class="btn sm" type="button" data-lc="open" data-i="${i}">Apri in ${esc(PN[r.p] || r.p)}</button>${LINES.has(r.p) ? `<button class="btn sm" type="button" data-lc="edit" data-i="${i}">Modifica</button><button class="btn sm" type="button" data-lc="renew" data-i="${i}">Rinnova</button>` : ''}</div></div>`;
    return h;
  }
  function paint() {
    const o = $('#lcOv'); if (!o) return;
    const box = o.querySelector('.lc-box'), top = box ? box.scrollTop : 0, M = window.KXLineMap ? KXLineMap.map() : null, n = O.list.length;
    o.innerHTML = `<div class="lc-box" role="dialog" aria-modal="true" aria-label="Linee selezionate"><div class="lc-bh"><h3>${n} ${n === 1 ? 'linea selezionata' : 'linee selezionate'}<small>Server, stato, collegamento, IP e app che le usano: quello che i pannelli dicono adesso</small></h3><button class="btn sm" type="button" data-lc="re">↻ Aggiorna</button><button class="btn sm" type="button" data-lc="x">✕ Chiudi</button></div>${O.list.map((r, i) => card(r, i, M)).join('')}</div>`;
    const nb = o.querySelector('.lc-box'); if (nb) nb.scrollTop = top;
  }
  /** apre la schermata con le righe della ricerca (omni.js) */
  function open(items) {
    if (!can()) return;
    close();
    O.list = (items || []).slice(0, 60).map(norm); O.pw.clear(); const my = ++O.gen;
    const o = document.createElement('div'); o.id = 'lcOv'; document.body.appendChild(o);
    o.addEventListener('mousedown', (e) => { if (e.target === o) close(); });
    o.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-lc]'); if (!b) return;
      const a = b.dataset.lc, r = O.list[+b.dataset.i];
      if (a === 'x') return close();
      if (a === 're') { if (window.KXOnline) KXOnline.refresh(); if (window.KXWatch) KXWatch.refresh().catch(() => {}); C.presT = 0; if (window.KXLineMap) KXLineMap.load(true); paint(); load(O.list).then(() => { if (my === O.gen) paint(); }); return; }
      if (a === 'pw') { const i = +b.dataset.i; O.pw.has(i) ? O.pw.delete(i) : O.pw.add(i); return paint(); }
      if (a === 'cp') { try { await navigator.clipboard.writeText(r.pw); if (typeof toast === 'function') toast('Password copiata'); } catch { toastE('Copia non consentita dal browser'); } return; }
      if (!r || !window.KXOmni) return;
      close();
      KXOmni.pick(a === 'open' ? r.src : { ...r.src, act: a });
    });
    paint();
    load(O.list).then(() => { if (my === O.gen) paint(); });
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('#lcOv')) close(); });
  let t = 0; document.addEventListener('kx-online', () => { if (!$('#lcOv') || t) return; t = setTimeout(() => { t = 0; paint(); }, 500); });

  window.KXLineCard = { can, open, close, norm, load, kvExtra, PN, PC };
})();
