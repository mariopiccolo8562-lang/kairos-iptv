/* KAIROS Control — Attivazione app → «🟢 Online nelle app» (solo titolare), 10 novembre 2026.
   Chi usa le app collegate al pannello, in un elenco solo, con riquadri, ricerca, app, stato, ordine e reseller:
   - app KAIROS (Pro, TV, XC, Lite, Premium, Plus, Nova, Vega): i dati che mandano le app (presenza): cosa guardano,
     IP con città e paese, avvisi «2 IP» e «paese diverso», versione, dispositivo, rete, VPN, qualità del video;
     ci sono anche gli offline visti nelle ultime 24 ore;
   - MirkoTeam (ORCP): le installazioni dell'app, raccolte per utente: online sì/no, ultimo accesso, IP (+VPN),
     dispositivo, versione (ORCP non dice il canale);
   - MaxPlayer e OrbixPlay: le loro API non dicono chi è online né l'IP: «collegato» è il controllo delle connessioni
     attive della linea (come «Online ora terzi»); il canale solo se la stessa linea è anche su WOLF, Atlantix, Realott o SLT.
   ORA resta fuori (niente API ufficiale, non dice chi è online). Solo letture già esistenti; un clic su una riga apre la
   scheda con tutti i dati. Le azioni ci sono solo per le app KAIROS (Disconnetti, Spegni VPN), con la conferma di sempre.
   Si aggiorna con il pulsante «Auto». Usa app.js ($, esc, api, view, toast, ask, TITLES, D, openQuick, kickDev, load)
   e, se ci sono, KC, KXOnline, KXWatch, KXVpn, KXOmni, KXInsight, KXOrcpName. */
(() => {
  if (!$('#side')) return;
  const css = document.createElement('style');
  css.textContent = `
#v-appon .ao-top{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
#v-appon .ao-top .inp{margin:0}
#v-appon .ao-top #aoQ{flex:1;min-width:240px}
#v-appon .ao-top select.inp{width:auto;max-width:240px}
#v-appon .ao-info{font-size:12.5px;color:var(--mut);margin-top:8px}
:is(#v-appon,.kc-ext) .ao-err{font-size:12.5px;color:#fbbf24;margin-top:6px}
#v-appon .dv-tiles{margin:12px 0 10px}
#v-appon .dv-tile.all b{color:#e8eef8}
#v-appon .dv-tile.aw{--c:#22d3ee}#v-appon .dv-tile.aw b{color:#67e8f9}#v-appon .dv-tile.aoff{--c:#94a3b8}#v-appon .dv-tile.aoff b{color:#cbd5e1}
#v-appon .filters{margin:0 0 8px}
:is(#v-appon,.kc-ext) .ao-list{border:1px solid var(--line);border-radius:14px;overflow:hidden}
:is(#v-appon,.kc-ext) .ao-row{display:grid;grid-template-columns:118px minmax(0,1.15fr) 168px minmax(0,1.35fr) minmax(0,1fr) minmax(0,1.1fr);gap:10px;align-items:center;padding:10px 12px;border-top:1px solid var(--line);cursor:pointer;font-size:13px}
:is(#v-appon,.kc-ext) .ao-row:first-child{border-top:0}
:is(#v-appon,.kc-ext) .ao-row:hover,:is(#v-appon,.kc-ext) .ao-row:focus-visible{background:rgba(255,255,255,.045);outline:none}
:is(#v-appon,.kc-ext) .ao-head{cursor:default;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--mut);background:rgba(255,255,255,.02)}
:is(#v-appon,.kc-ext) .ao-head:hover{background:rgba(255,255,255,.02)}
:is(#v-appon,.kc-ext) .ao-row>div{min-width:0}
:is(#v-appon,.kc-ext) .ao-row b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
:is(#v-appon,.kc-ext) .ao-row small{display:block;color:var(--mut);font-size:11.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
:is(#v-appon,.kc-ext) .ao-row .ao-w b{color:#fbbf24}
:is(#v-appon,.kc-ext) .ao-row .mono,#aoOv .mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
:is(#v-appon,.kc-ext) .ao-empty{padding:16px;color:var(--mut)}
.ao-app{justify-self:start;display:inline-block;max-width:100%;font-size:11.5px;font-weight:800;padding:3px 8px;border-radius:8px;background:color-mix(in srgb,var(--c) 18%,transparent);color:color-mix(in srgb,var(--c) 72%,#fff);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ao-tag{display:inline-block;font-size:10.5px;font-weight:700;padding:1px 6px;border-radius:999px;margin:3px 4px 0 0;border:1px solid #f59e0b66;background:#78350f55;color:#fcd34d;white-space:nowrap}
.ao-tag.ok{border-color:#22c55e55;background:#14532d55;color:#86efac}
.ao-u small.ao-by{font-weight:700;margin-top:1px}.ao-u small.ao-by.me{color:#9cc0ff}.ao-u small.ao-by.ag{color:#fde68a}.ao-u small.ao-by.na{font-weight:500}
/* sotto le finestre di conferma (#modal, 40): «Disconnetti» e «Spegni VPN» le aprono sopra la scheda */
#aoOv{position:fixed;inset:0;z-index:38;display:grid;place-items:center;background:rgba(3,4,10,.62);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);padding:16px}
#aoOv .ao-box{width:min(900px,100%);max-height:92vh;overflow:auto;padding:20px 22px;background:#0e1424;border:1px solid var(--line);border-radius:18px;box-shadow:0 30px 80px #000a}
#aoOv .ao-bh{display:flex;align-items:flex-start;gap:12px;margin-bottom:6px}
#aoOv .ao-bh h3{margin:0;flex:1;font-size:17px;min-width:0;overflow-wrap:anywhere}
#aoOv .ao-bh h3 small{display:block;font-size:12.5px;font-weight:400;color:var(--mut);margin-top:3px}
#aoOv .ao-kv{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:10px 16px;margin-top:12px;font-size:13px}
#aoOv .ao-kv>div{min-width:0;overflow-wrap:anywhere}
#aoOv .ao-kv>div>span:first-child{display:block;font-size:11px;color:var(--mut);text-transform:uppercase;letter-spacing:.05em}
#aoOv .ao-kv small{display:block;color:var(--mut);font-size:12px}
#aoOv .ao-sub{margin:16px 0 6px;font-size:13px;font-weight:800}
#aoOv .ao-t{width:100%;border-collapse:collapse;font-size:12.5px}
#aoOv .ao-t th{text-align:left;font-size:11px;color:var(--mut);text-transform:uppercase;letter-spacing:.05em;font-weight:600;padding:6px 8px;border-bottom:1px solid var(--line)}
#aoOv .ao-t td{padding:7px 8px;border-bottom:1px solid var(--line);vertical-align:top;overflow-wrap:anywhere}
#aoOv .ao-tw{overflow:auto}
#aoOv .ao-note{font-size:12.5px;color:var(--mut);margin-top:12px;line-height:1.45}
#aoOv .ao-acts{display:flex;gap:6px;flex-wrap:wrap;margin-top:16px}
@media (max-width:700px){#v-appon .dv-tiles{grid-template-columns:repeat(2,minmax(0,1fr))!important;grid-auto-flow:row!important;grid-auto-columns:auto!important;overflow:visible!important;margin:12px 0 10px!important;padding:0!important}#v-appon .dv-tile{padding:12px}#v-appon .dv-tile.all{grid-column:1/-1}
  #v-appon .ao-top{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr)}#v-appon .ao-top #aoQ{grid-column:1/-1;min-width:0}#v-appon .ao-top select.inp{width:100%!important;max-width:none!important;min-width:0}
  #aoOv .ao-box{padding:16px}#aoOv .ao-kv{grid-template-columns:minmax(0,1fr) minmax(0,1fr);grid-auto-flow:row dense}#aoOv .ao-kv .ao-kv-w{grid-column:1/-1}}
@media (max-width:820px){
  :is(#v-appon,.kc-ext) .ao-head{display:none}
  :is(#v-appon,.kc-ext) .ao-row{grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:6px 12px}
  :is(#v-appon,.kc-ext) .ao-row>.ao-app{grid-column:1/-1}
}`;
  document.head.appendChild(css);

  const IC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="2.5"/><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M4.9 4.9a10 10 0 0 0 0 14.2M19.1 4.9a10 10 0 0 1 0 14.2"/></svg>';
  if (!$('.nav[data-v="appon"]')) {
    const b = document.createElement('button'); b.className = 'nav'; b.dataset.v = 'appon'; b.innerHTML = IC + 'Online nelle app'; b.onclick = () => view('appon');
    const ref = $('.nav[data-v="appsum"]') || $('.nav[data-v="mxp"]'); ref ? ref.before(b) : $('#side').appendChild(b);
    const sec = document.createElement('section'); sec.className = 'view'; sec.id = 'v-appon'; ($('#v-appsum') || $('#v-dash')).before(sec);
  }
  if (typeof TITLES === 'object') TITLES.appon = 'Online nelle app';
  const V = $('#v-appon');

  /* ---------- app e nomi ---------- */
  const KAPP = { tv: 'Kairos Pro', ktv: 'Kairos TV', xc: 'Kairos XC', ult: 'KAIROS Ultimate', lite: 'Kairos Lite', prem: 'Kairos Premium', plus: 'Kairos Plus', nova: 'Kairos Nova', vega: 'Kairos Vega' };
  const KCOL = { tv: '#4f8cff', ktv: '#22d3ee', xc: '#a78bfa', ult: '#22d3ee', lite: '#4ade80', prem: '#f5b041', plus: '#f472b6', nova: '#2dd4bf', vega: '#fb923c' };
  const XCOL = { orcp: '#e879f9', mxp: '#ef4444', oxp: '#38bdf8' };
  const KORD = Object.keys(KAPP);
  /* quale app KAIROS: prima la versione che manda l'app (come fa il server), poi quella salvata nel cliente */
  const appKey = (ver, saved) => {
    const v = String(ver || '').trim();
    if (/vega/i.test(v)) return 'vega'; if (/^lite\b/i.test(v)) return 'lite'; if (/^ult\b/i.test(v)) return 'ult'; if (/^xc\b/i.test(v)) return 'xc'; if (/^plus\b/i.test(v)) return 'plus';
    if (/^nova\b/i.test(v)) return 'nova'; if (/premium/i.test(v)) return 'prem'; if (/^tv\b/i.test(v)) return 'ktv'; if (/^\d+\.\d+/.test(v)) return 'tv';
    const s = String(saved || '').toLowerCase(); return s === 'pro' ? 'tv' : KAPP[s] ? s : 'tv';
  };
  let oName = ''; // nome dell'app ORCP scelto nelle impostazioni (arriva con lo stato di ORCP)
  const orcpName = () => oName || (window.KXOrcpName ? KXOrcpName() : '') || 'MirkoTeam';
  const STATE_L = { live: 'In diretta', movie: 'Film', series: 'Serie TV', rec: 'Registrazione', idle: 'Nei menu' };
  const NET_L = { wifi: 'Wi-Fi', eth: 'Cavo (Ethernet)', mobile: 'Rete mobile', none: 'Senza rete' };
  const LINE_L = { weak: 'debole', normal: 'normale', good: 'ottima' };
  const DAY = 864e5;
  const isOwner = () => typeof D === 'object' && D && D.role !== 'agent';
  const quiet = (m) => /collega prima|non (è )?collegat|non configurat/i.test(m || '');
  const offFor = (ms) => { const m = Math.max(1, Math.round(ms / 60e3)); return m < 60 ? m + ' min' : m < 1440 ? Math.floor(m / 60) + ' h' : Math.floor(m / 1440) + ' g'; };
  const hhmm = (t) => (t ? new Date(t).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
  const mbps = (v) => (v >= 100 ? Math.round(v) : (+v).toFixed(1)) + ' Mbps';
  const agentName = (id) => { const a = (D.agents || []).find((x) => +x.id === +id); return a ? a.username || a.name || '' : 'agente #' + id; };
  /* clienti KAIROS per id e per collegamento a MaxPlayer / OrbixPlay: le mappe si rifanno a ogni lettura (migliaia di clienti) */
  let DM = null;
  const maps = () => { const by = new Map(), mx = new Map(), ox = new Map(); for (const d of D.devices || []) { by.set(d.id, d); if (d.maxp && d.maxp.uid) mx.set(String(d.maxp.uid), d); if (d.orbix && d.orbix.id) ox.set(String(d.orbix.id).toLowerCase(), d); } return (DM = { by, mx, ox }); };
  const devById = (id) => (DM || maps()).by.get(id) || null;
  /* «Sta guardando» per le linee delle app di terzi: lo dicono WOLF, Atlantix, Realott e SLT (online.js, KXWatch) */
  const WP = [['wolf', 'WOLF'], ['atx', 'Atlantix'], ['ro', 'Realott'], ['slt', 'SLT']];
  const watchOf = (u) => { if (!u || !window.KXWatch) return null; for (const [p, n] of WP) { const w = KXWatch.get(p, u); if (w) return { w, from: n }; } return null; };
  /* ORCP tiene una scheda per ogni installazione: lo stesso dispositivo (stesso ID, o stesso modello e stesso IP) conta una volta */
  const orcpIds = (x) => { const hw = String(x.device || '').toLowerCase().trim(), ip = String(x.ip || '').trim(); return [x.did ? 'id:' + x.did : '', hw && ip ? 'hw:' + hw + '|' + ip : ''].filter(Boolean); };
  const orcpT = (s) => { const t = Date.parse(String(s || '').trim().replace(' ', 'T')); return Number.isFinite(t) ? t : 0; };

  /* ---------- dati: le stesse letture di «Online ora Kairos», «Online ora terzi» e delle schede delle app ---------- */
  const S = { src: { kairos: null, orcp: null, mxp: null, oxp: null }, rows: null, t: 0, tx: 0, busy: null, errs: [], st: 'on', app: '', own: '', sort: '', q: '', limit: 200, vis: [], list: [] };
  function kRows(P) {
    const out = [];
    for (const o of [...(P.online || []), ...(P.recent || [])]) {
      const d = devById(o.id), main = d && d.parent ? devById(d.parent) : d, ak = appKey(o.ver, d && d.app);
      const owner = main && +main.ownerId ? agentName(main.ownerId) : '';
      out.push({
        k: 'k:' + o.id, src: 'kairos', app: 'k:' + ak, appL: KAPP[ak], col: KCOL[ak], name: o.name || o.code || '—', sub: o.code || '', owner,
        on: !!o.online, state: o.online ? (STATE_L[o.state] ? o.state : 'idle') : '', last: o.online ? Date.now() : Date.now() - (+o.ago || 0),
        ip: o.ip || '', city: o.city || '', country: o.country || '', dev: o.model || '', ver: o.ver || '', net: o.net || '', vpn: o.vpn === 'on' ? 'on' : '', flags: o.flags || [], o, d,
      });
    }
    return out;
  }
  async function kLoad() { const P = await (window.KC && KC.api ? KC.api('GET', '/admin/presence') : api('GET', '/admin/presence')); return kRows(P || {}); }
  async function oLoad(errs) {
    const st = await api('GET', '/admin/orcp/state'); if (!st || !st.connected) return [];
    oName = String((st.cfg && st.cfg.name) || (st.app && st.app.name) || '').trim();
    if (st.expired) { errs.push(`${orcpName()}: l'accesso a ORCP è scaduto, per questo i suoi utenti non si vedono. Vai in Attivazione app → ${orcpName()} → Collega e ripassa l'accesso`); return []; }
    const d = await api('GET', '/admin/orcp/data?w=conns');
    if (d.warn) errs.push(`${orcpName()}: ultimo aggiornamento non riuscito (${d.warn})${d.at ? ` · dati delle ${new Date(d.at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}` : ''}`);
    const by = new Map(), names = new Set();
    for (const x of d.list || []) { const u = String(x.user || '').trim(); if (!u) continue; const k = u.toLowerCase(); if (!by.has(k)) by.set(k, { u, ins: [] }); by.get(k).ins.push(x); if (String(x.app || '').trim()) names.add(String(x.app).trim()); }
    const split = names.size > 1, N = orcpName(), from = Date.now() - DAY, out = [];
    for (const [k, g] of by) {
      const onI = g.ins.filter((x) => x.online), last = Math.max(0, ...g.ins.map((x) => orcpT(x.last)));
      if (!onI.length && last < from) continue; // offline da più di 24 ore (o senza data): fuori, come per le app KAIROS
      const seen = new Set(); let conns = 0;
      for (const x of onI) { const ids = orcpIds(x); if (!ids.length || !ids.some((i) => seen.has(i))) conns++; ids.forEach((i) => seen.add(i)); }
      const top = [...(onI.length ? onI : g.ins)].sort((a, b) => orcpT(b.last) - orcpT(a.last))[0] || {};
      const rank = { prob: 1, app: 2, kairos: 2 }; let vpn = ''; for (const x of onI.length ? onI : [top]) if ((rank[x.vpn] || 0) > (rank[vpn] || 0)) vpn = x.vpn;
      const an = String(top.app || '').trim(), ips = [...new Set(onI.map((x) => String(x.ip || '').trim()).filter(Boolean))];
      out.push({ k: 'o:' + k, src: 'orcp', app: split && an ? 'o:' + an : 'orcp', appL: split && an ? N + ' · ' + an : N, col: XCOL.orcp, name: g.u, sub: !split && an ? an : '', owner: '', on: onI.length > 0, conns: onI.length ? Math.max(1, conns) : 0, last: onI.length ? Date.now() : last, ip: top.ip || '', ips, dev: top.device || '', ver: top.version || '', vpn: vpn || '', user: g.u, ins: g.ins, lastTxt: String(top.last || '') });
    }
    return out;
  }
  const ownerOfDev = (d) => { const m = d && d.parent ? devById(d.parent) : d; return m && +m.ownerId ? agentName(m.ownerId) : ''; };
  async function mLoad() {
    const acc = (await api('GET', '/admin/mxp/accounts')).accounts || [], out = [];
    for (const ac of acc) {
      const us = (await api('GET', `/admin/mxp/a/${encodeURIComponent(ac.id)}/users`)).users || [];
      for (const u of us) {
        const lines = (u.lists || []).map((l) => ({ name: l.name || '', user: l.user || '', pass: l.pass || '', host: l.fqdn ? (l.ssl ? 'https://' : 'http://') + l.fqdn + (l.port ? ':' + l.port : '') : '' }));
        const kd = (DM || maps()).mx.get(String(u.id)) || null;
        out.push({ k: 'm:' + ac.id + ':' + u.id, src: 'mxp', app: 'mxp', appL: 'MaxPlayer', col: XCOL.mxp, name: u.username || u.email || 'ID ' + u.id, sub: u.username && u.email ? u.email : '', owner: ownerOfDev(kd), lines, kd, acc: ac.name || '', mid: String(u.id), mu: u.username || '' });
      }
    }
    return out;
  }
  async function xLoad() {
    const st = await api('GET', '/admin/oxp/state'); if (!st || !st.connected) return [];
    const d = await api('GET', '/admin/oxp/playlists'), by = new Map();
    for (const p of d.playlists || []) { const k = String(p.device || p.id || '').toLowerCase(); if (!k) continue; if (!by.has(k)) by.set(k, { dev: p.device || '', pls: [] }); by.get(k).pls.push(p); }
    const out = [];
    for (const [k, g] of by) {
      const first = g.pls[0] || {}, kd = (DM || maps()).ox.get(k) || null;
      out.push({ k: 'x:' + k, src: 'oxp', app: 'oxp', appL: 'OrbixPlay', col: XCOL.oxp, name: first.notes || (kd && (kd.name || kd.code)) || first.name || g.dev, sub: g.dev, owner: ownerOfDev(kd), lines: g.pls.map((p) => ({ name: p.name || '', user: p.user || '', pass: p.pass || '', host: p.host || '' })), kd, dev: g.dev });
    }
    return out;
  }
  /* chi ha attivato (11 novembre 2026): app KAIROS → l'agente del cliente (o te); app di terzi → il cliente KAIROS collegato,
     poi chi ha creato la lista («Crea lista», /admin/ext-lists), poi il cliente KAIROS con la stessa linea; altrimenti «non so».
     r.by = 'Tu' | nome dell'agente | '' (non si sa); se è un agente va anche in r.owner (filtro «reseller») */
  const XL = { t: 0, m: null };
  async function extLists(force) {
    if (!force && XL.m && Date.now() - XL.t < 120e3) return XL.m;
    try {
      const r = await api('GET', '/admin/ext-lists'), m = new Map();
      for (const l of (r && r.lists) || []) { const k = (l.app === 'orbix' ? 'x:' : l.app === 'max' ? 'm:' : '') + String(l.ref || l.username || '').toLowerCase(); if (k.length > 2 && !m.has(k)) m.set(k, l.by || ''); }
      XL.m = m; XL.t = Date.now();
    } catch { XL.m = XL.m || new Map(); }
    return XL.m;
  }
  function attribute(rows, XM) {
    const LM = new Map(); // utente della linea → cliente KAIROS principale
    for (const d of D.devices || []) { if (d.parent) continue; for (const pl of d.playlists || []) { const u = String(pl.username || '').toLowerCase(); if (u && !LM.has(u)) LM.set(u, d); } }
    for (const r of rows) {
      if (r.src === 'kairos') { r.by = r.owner || 'Tu'; continue; }
      let by = null;
      if (r.kd) by = ownerOfDev(r.kd) || 'Tu';
      if (by === null && XM) { const k = r.src === 'oxp' ? 'x:' + String(r.dev || '').toLowerCase() : r.src === 'mxp' ? 'm:' + String(r.mu || '').toLowerCase() : ''; if (k.length > 2 && XM.has(k)) by = XM.get(k) || 'Tu'; }
      if (by === null) for (const u of r.src === 'orcp' ? [r.name] : (r.lines || []).map((l) => l.user)) { const d = LM.get(String(u || '').toLowerCase()); if (d) { by = ownerOfDev(d) || 'Tu'; break; } }
      r.by = by || '';
      if (by && by !== 'Tu' && !r.owner) r.owner = by;
    }
  }
  const byTxt = (r) => (r.by === 'Tu' ? 'attivato da te' : r.by ? 'attivato da ' + r.by : r.src === 'kairos' ? '' : 'attivato da: ?');
  async function load(force) {
    if (!isOwner()) return;
    if (S.busy) return S.busy;
    S.busy = (async () => {
      const errs = [], err = (n) => (e) => { const m = (e && e.message) || String(e); if (!quiet(m)) errs.push(n + ': ' + m); return null; };
      const due = force || !S.tx || Date.now() - S.tx > 120e3; // MaxPlayer e OrbixPlay: le liste si rileggono al massimo ogni 2 minuti
      maps(); paint();
      if (window.KXWatch) KXWatch.load().then(() => paint()).catch(() => {});
      const [k, o, m, x, XM] = await Promise.all([kLoad().catch(err('App KAIROS')), oLoad(errs).catch(err(orcpName())), due ? mLoad().catch(err('MaxPlayer')) : null, due ? xLoad().catch(err('OrbixPlay')) : null, extLists(due)]);
      // se una lettura non riesce restano i dati di prima (con l'avviso), non spariscono le righe
      if (k) S.src.kairos = k; if (o) S.src.orcp = o; if (m) S.src.mxp = m; if (x) S.src.oxp = x; if (due) S.tx = Date.now();
      S.rows = [].concat(...Object.values(S.src).map((L) => L || [])); S.errs = errs; S.t = Date.now();
      attribute(S.rows, XM);
    })().finally(() => { S.busy = null; paint(); });
    return S.busy;
  }

  /* ---------- stato di ogni riga ---------- */
  /* MaxPlayer e OrbixPlay: collegato se almeno una linea ha connessioni attive (undefined = sto verificando, null = non verificabile) */
  let gen = 0; // giro di disegno: lo stato delle linee si calcola una volta per giro (ordinamento, conteggi, filtri)
  function lineState(r) {
    if (r._g === gen) return r._ls;
    r._g = gen; r._ls = lineState0(r); return r._ls;
  }
  function lineState0(r) {
    if (!r.lines || !r.lines.length || !window.KXOnline) return null;
    let pend = false, any = false, conns = 0, max = 0;
    for (const l of r.lines) {
      const k = KXOnline.want(l.host, l.user, l.pass); l.key = k; if (!k) continue;
      const v = KXOnline.get(k);
      if (v === undefined) { pend = true; continue; }
      if (v === null) continue;
      any = true; max = Math.max(max, +v.max || 0); if (v.on) conns += +v.conns || 1;
    }
    if (conns) return { on: true, conns, max };
    if (pend) return undefined;
    return any ? { on: false, conns: 0, max } : null;
  }
  const ext = (r) => r.src === 'mxp' || r.src === 'oxp';
  const stOf = (r) => { if (!ext(r)) return r.on ? 'on' : 'off'; const v = lineState(r); return v === undefined ? 'wait' : v === null ? 'na' : v.on ? 'on' : 'off'; };
  const isOn = (r) => stOf(r) === 'on';
  const connsOf = (r) => (r.src === 'kairos' ? (r.on ? 1 : 0) : r.src === 'orcp' ? r.conns : (lineState(r) || {}).conns || 0);
  const wOf = (r) => { // cosa guarda adesso: { main, sub, from }
    if (r.src === 'kairos') {
      if (!r.on || !r.state || r.state === 'idle') return null;
      const o = r.o, main = r.state === 'live' ? o.ch || o.title : o.title || o.ch, other = r.state === 'live' ? (o.ch && o.title && o.title !== o.ch ? o.title : '') : (o.title && o.ch ? o.ch : '');
      return { main: main || STATE_L[r.state], sub: [STATE_L[r.state], other, o.grp].filter(Boolean).join(' · ') };
    }
    if (!isOn(r)) return null;
    const users = r.src === 'orcp' ? [r.user] : (r.lines || []).map((l) => l.user);
    for (const u of users) { const w = watchOf(u); if (w) return { main: w.w, sub: 'canale visto da ' + w.from, from: w.from }; }
    return null;
  };
  /* «Da controllare»: i motivi */
  function chkOf(r) {
    const m = [];
    if (r.src === 'kairos') {
      if (r.flags.includes('ip')) m.push('2 IP in pochi minuti'); if (r.flags.includes('country')) m.push('paese diverso dal solito');
      if (r.on && +r.o.stalls_h >= 3) m.push(`${r.o.stalls_h} blocchi nell'ultima ora`); if (r.on && r.o.reduced) m.push('qualità ridotta');
    } else if (r.src === 'orcp') {
      if (r.conns > 1) m.push(`online su ${r.conns} dispositivi`); if ((r.ips || []).length > 1) m.push(`${r.ips.length} IP diversi`); if (r.vpn === 'prob') m.push('probabile VPN');
    } else { const v = lineState(r); if (v && v.on && v.conns > 1) m.push(`${v.conns} connessioni${v.max && v.conns > v.max ? ' (max ' + v.max + ')' : ''}`); }
    return m;
  }
  const STS = [['', 'Tutti'], ['on', 'Online ora'], ['watch', 'Stanno guardando'], ['menu', 'Nei menu (app aperta)'], ['off', 'Offline'], ['multi', 'Più connessioni'], ['chk', 'Da controllare'], ['na', 'Non verificabili']];
  const FIT = {
    '': () => true, on: isOn, watch: (r) => !!wOf(r), menu: (r) => r.src === 'kairos' && r.on && r.state === 'idle', off: (r) => stOf(r) === 'off',
    multi: (r) => connsOf(r) > 1, chk: (r) => chkOf(r).length > 0, na: (r) => stOf(r) === 'na',
  };
  const TILES = [['on', 'active', 'Online ora', 'Collegati adesso'], ['watch', 'aw', 'Stanno guardando', 'Canali, film e serie'], ['off', 'aoff', 'Offline', 'Ultime 24 ore'], ['chk', 'pending', 'Da controllare', '2 IP, paese, blocchi, più conn.'], ['', 'all', 'Tutti', 'Tutte le app']];
  const SORTS = [['', 'Prima chi è online'], ['last', 'Ultimo collegamento'], ['name', 'Nome: A → Z'], ['app', 'App'], ['what', 'Cosa guarda'], ['ip', 'IP']];
  const pending = () => (S.rows || []).some((r) => ext(r) && lineState(r) === undefined);
  const lastOf = (r) => (isOn(r) ? Date.now() : r.last || 0);
  const RANK = { on: 1, wait: 2, na: 3, off: 4 };
  const cmpS = (a, b) => String(a || '').localeCompare(String(b || ''), 'it', { sensitivity: 'base', numeric: true });
  const hay = (r) => [r.name, r.sub, r.owner, r.appL, r.ip, ...(r.ips || []), r.city, r.country, r.dev, r.ver, r.o && r.o.ip2, r.o && r.o.title, r.o && r.o.ch, r.o && r.o.grp, r.o && r.o.pl, r.acc, ...(r.lines || []).map((l) => l.user + ' ' + l.name), ...(r.ins || []).map((x) => x.ip + ' ' + x.device), (wOf(r) || {}).main].join(' ').toLowerCase();
  function filtered() {
    const q = S.q.toLowerCase().trim();
    let L = (S.rows || []).filter((r) => (!S.app || r.app === S.app) && (!S.own || (S.own === '-' ? !r.owner : r.owner === S.own)) && FIT[S.st](r));
    if (q) L = L.filter((r) => hay(r).includes(q));
    const by = {
      '': (a, b) => (RANK[stOf(a)] - RANK[stOf(b)]) || ((wOf(b) ? 1 : 0) - (wOf(a) ? 1 : 0)) || (lastOf(b) - lastOf(a)) || cmpS(a.name, b.name),
      last: (a, b) => lastOf(b) - lastOf(a) || cmpS(a.name, b.name), name: (a, b) => cmpS(a.name, b.name), app: (a, b) => cmpS(a.appL, b.appL) || cmpS(a.name, b.name),
      what: (a, b) => { const x = (wOf(a) || {}).main, y = (wOf(b) || {}).main; return (x ? 0 : 1) - (y ? 0 : 1) || cmpS(x, y) || cmpS(a.name, b.name); },
      ip: (a, b) => (a.ip ? 0 : 1) - (b.ip ? 0 : 1) || cmpS(a.ip, b.ip),
    }[S.sort] || null;
    return by ? [...L].sort(by) : L;
  }

  /* ---------- pezzi di riga ---------- */
  const badge = (r) => `<span class="ao-app" style="--c:${r.col}" title="${esc(r.appL)}">${esc(r.appL)}</span>`;
  function stHtml(r) {
    if (r.src === 'kairos') {
      if (r.on) return r.state !== 'idle' ? `<span class="on-st g"><i class="on-dot g"></i>Online · ${esc(STATE_L[r.state].toLowerCase())}</span>` : '<span class="on-st g"><i class="on-dot g"></i>Online · nei menu</span>';
      return `<span class="on-st n"><i class="on-dot"></i>Offline da ${offFor(Date.now() - r.last)}</span>`;
    }
    if (r.src === 'orcp') {
      if (r.on) return r.conns > 1 ? `<span class="on-st o"><i class="on-dot o"></i>Online su ${r.conns} dispositivi</span>` : '<span class="on-st g"><i class="on-dot g"></i>Online</span>';
      return `<span class="on-st n"><i class="on-dot"></i>${r.last ? 'Offline da ' + offFor(Date.now() - r.last) : 'Offline'}</span>`;
    }
    if (!r.lines.length) return '<span class="on-st n"><i class="on-dot"></i>Nessuna linea</span>';
    return window.KXOnline ? KXOnline.dot(lineState(r)) : '';
  }
  const lastSmall = (r) => (r.src === 'kairos' || r.src === 'orcp' ? (isOn(r) ? 'adesso' : r.last ? 'ultimo collegamento ' + hhmm(r.last) : '') : `${r.lines.length} ${r.lines.length === 1 ? 'linea' : 'linee'} · controllo della linea`);
  function whatHtml(r) {
    const w = wOf(r);
    if (w) return `<b title="${esc(w.main)}">▶ ${esc(w.main)}</b><small>${esc(w.sub)}</small>`;
    if (r.src === 'kairos') {
      if (r.on) return `<span class="mut">${esc(r.o.screen || 'naviga nei menu')}</span>`;
      const t = r.o.title || r.o.ch; return t ? `<span class="mut">ultima visione: ${esc(t)}</span>` : '<span class="mut">—</span>';
    }
    return `<span class="mut">${r.src === 'orcp' ? 'ORCP non dice il canale' : isOn(r) ? 'canale non disponibile' : '—'}</span>`;
  }
  function ipTags(r) {
    let h = '';
    if (r.src === 'kairos') { if (r.flags.includes('ip')) h += '<span class="ao-tag" title="Due indirizzi IP diversi in pochi minuti: possibile codice condiviso">⚠ 2 IP</span>'; if (r.flags.includes('country')) h += '<span class="ao-tag">⚠ paese diverso</span>'; if (r.vpn === 'on') h += '<span class="ao-tag ok">🛡 VPN attiva</span>'; }
    if (r.src === 'orcp') { if ((r.ips || []).length > 1) h += `<span class="ao-tag" title="${esc(r.ips.join(', '))}">⚠ ${r.ips.length} IP</span>`; if (window.KXVpn) h += KXVpn.tag(r.vpn); }
    return h;
  }
  function ipHtml(r) {
    if (ext(r)) return `<span class="mut" title="${esc(r.appL)} non dice l'IP">—</span>`;
    if (!r.ip) return `<span class="mut">—</span>${ipTags(r)}`;
    return `<b class="mono" title="${esc(r.ip)}">${esc(r.ip)}</b>${r.city || r.country ? `<small>${esc([r.city, r.country].filter(Boolean).join(', '))}</small>` : ''}${ipTags(r)}`;
  }
  function devHtml(r) {
    if (r.src === 'mxp') return `<b>Cliente MaxPlayer</b><small>${esc([r.lines.map((l) => l.user).filter(Boolean).join(', '), r.kd ? 'KAIROS: ' + (r.kd.name || r.kd.code) : ''].filter(Boolean).join(' · ') || '—')}</small>`;
    if (r.src === 'oxp') return `<b class="mono">${esc(r.dev || '—')}</b><small>${esc([r.lines.map((l) => l.user).filter(Boolean).join(', '), r.kd ? 'KAIROS: ' + (r.kd.name || r.kd.code) : ''].filter(Boolean).join(' · ') || '—')}</small>`;
    return `<b title="${esc(r.dev)}">${esc(r.dev || '—')}</b><small>${esc([r.ver ? 'App ' + r.ver : '', r.src === 'kairos' ? NET_L[r.net] || '' : ''].filter(Boolean).join(' · '))}</small>`;
  }

  /* ---------- disegno ---------- */
  const HEAD = '<div class="ao-row ao-head"><span>App</span><span>Utente</span><span>Stato</span><span>Cosa guarda</span><span>IP e luogo</span><span>Dispositivo</span></div>';
  /** una riga (anche per la scheda «App terze» di «Online ora Kairos»): [i] = posizione nell'elenco di questa pagina, -1 altrove */
  const rowHtml = (r, i) => `<div class="ao-row" role="button" tabindex="0"${i >= 0 ? ` data-aoi="${i}"` : ''} data-aok="${esc(r.k)}" title="Vedi tutto">
        ${badge(r)}
        <div class="ao-u"><b>${esc(r.name)}</b><small>${esc([r.sub, r.owner && r.by !== r.owner ? 'di ' + r.owner : ''].filter(Boolean).join(' · ') || ' ')}</small>${byTxt(r) ? `<small class="ao-by ${r.by === 'Tu' ? 'me' : r.by ? 'ag' : 'na'}"${r.by ? '' : ' title="Non è collegato a un cliente KAIROS e non è stato creato da «Crea lista»"'}>${esc(byTxt(r))}</small>` : ''}</div>
        <div>${stHtml(r)}<small>${esc(lastSmall(r))}</small></div>
        <div class="ao-w">${whatHtml(r)}</div>
        <div class="ao-ip">${ipHtml(r)}</div>
        <div>${devHtml(r)}</div></div>`;
  function shell() {
    if ($('#aoQ', V)) return;
    V.innerHTML = `<div class="card glass"><div class="hd"><h3>🟢 Online nelle app<small>Chi usa adesso le app KAIROS, <span id="aoOn">${esc(orcpName())}</span>, MaxPlayer e OrbixPlay, e chi le ha usate nelle ultime 24 ore. Tocca una riga per vedere tutto.</small></h3>
        <button class="btn sm" type="button" id="aoRe">Aggiorna</button></div>
        <div class="ao-top"><input class="inp" id="aoQ" placeholder="Cerca nome, codice, utente, IP, canale, città, dispositivo" autocomplete="off" spellcheck="false"><select class="inp" id="aoSt" title="Stato"></select><select class="inp" id="aoSort" title="Ordine"></select><select class="inp" id="aoOwn" title="Reseller"></select></div>
        <div class="ao-info" id="aoInfo"></div><div id="aoErr"></div>
        <div class="dv-tiles" id="aoTiles"></div><div class="filters" id="aoChips"></div><div class="ao-list" id="aoList"></div><div id="aoMore"></div></div>`;
  }
  const setH = (el, h) => { if (el && el._h !== h) { el._h = h; el.innerHTML = h; } };
  function paint() {
    if (!V.classList.contains('on') || !isOwner()) return;
    shell(); gen++;
    const R = S.rows || [];
    const auto = window.KXAuto ? (KXAuto.on() ? ` · si aggiorna da sola ogni ${KXAuto.sec()} s (pulsante «Auto»)` : ' · aggiornamento automatico spento (pulsante «Auto»)') : '';
    $('#aoInfo', V).textContent = S.busy && !S.rows ? 'Leggo chi è collegato nelle app…' : S.t ? `${R.length} utenti · letti alle ${new Date(S.t).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}${S.busy ? ' · aggiorno…' : ''}${pending() ? ' · verifico le linee di MaxPlayer e OrbixPlay…' : ''}${auto}` : '';
    setH($('#aoOn', V), esc(orcpName()));
    setH($('#aoErr', V), S.errs.map((e) => `<div class="ao-err">⚠ ${esc(e)}</div>`).join(''));
    setH($('#aoSt', V), STS.map(([k, l]) => `<option value="${k}"${S.st === k ? ' selected' : ''}>${l}</option>`).join(''));
    setH($('#aoSort', V), SORTS.map(([k, l]) => `<option value="${k}"${S.sort === k ? ' selected' : ''}>${l}</option>`).join(''));
    const owners = [...new Set(R.map((r) => r.owner).filter(Boolean))].sort(cmpS), ow = $('#aoOwn', V);
    setH(ow, `<option value="">Tutti i reseller</option><option value="-"${S.own === '-' ? ' selected' : ''}>Tu (senza agente)</option>${owners.map((o) => `<option value="${esc(o)}"${S.own === o ? ' selected' : ''}>${esc(o)}</option>`).join('')}`);
    ow.style.display = owners.length || S.own ? '' : 'none';
    // riquadri e app: contano con l'app e il reseller scelti
    const own = (r) => !S.own || (S.own === '-' ? !r.owner : r.owner === S.own);
    const base = R.filter((r) => (!S.app || r.app === S.app) && own(r));
    setH($('#aoTiles', V), TILES.map(([k, c, l, sub]) => `<button type="button" class="dv-tile ${c}${S.st === k ? ' on' : ''}" data-aof="${k}"><span><b>${S.rows ? base.filter(FIT[k]).length : '…'}</b><em>${l}</em><small>${sub}</small></span></button>`).join(''));
    const apps = new Map(); for (const r of R) if (!apps.has(r.app)) apps.set(r.app, r);
    const ord = (r) => (r.src === 'kairos' ? KORD.indexOf(r.app.slice(2)) : r.src === 'orcp' ? 20 : r.src === 'mxp' ? 30 : 40);
    const chips = [...apps.values()].sort((a, b) => ord(a) - ord(b) || cmpS(a.appL, b.appL));
    setH($('#aoChips', V), S.rows ? [['', 'Tutte le app'], ...chips.map((r) => [r.app, r.appL])].map(([a, l]) => `<button type="button" class="fchip ${S.app === a ? 'on' : ''}" data-aoa="${esc(a)}">${esc(l)}<span>${R.filter((r) => (!a || r.app === a) && own(r) && FIT[S.st](r)).length}</span></button>`).join('') : '');
    if (!S.rows) { setH($('#aoList', V), '<div class="ao-empty">Carico…</div>'); setH($('#aoMore', V), ''); return; }
    const L = filtered(), shown = L.slice(0, S.limit);
    S.list = L; S.vis = shown;
    setH($('#aoList', V), shown.length ? HEAD + shown.map((r, i) => rowHtml(r, i)).join('') : `<div class="ao-empty">${R.length ? 'Nessun utente con questi filtri.' : 'Nessuna app con utenti nelle ultime 24 ore.'}</div>`);
    setH($('#aoMore', V), L.length > shown.length ? `<button class="btn sm" type="button" id="aoMoreB" style="margin-top:10px">Mostra altri ${Math.min(200, L.length - shown.length)} (${shown.length} su ${L.length})</button>` : '');
  }

  /* ---------- scheda con tutti i dati ---------- */
  const closeOv = () => { const o = $('#aoOv'); if (o) o.remove(); };
  const kv = (k, v, w) => (v === '' || v == null ? '' : `<div${w ? ' class="ao-kv-w"' : ''}><span>${k}</span>${v}</div>`);
  function cardHtml(r) {
    const w = wOf(r), chk = chkOf(r);
    let h = `<div class="ao-bh"><h3>${badge(r)} ${esc(r.name)}<small>${esc([r.sub, r.owner ? 'reseller ' + r.owner : ''].filter(Boolean).join(' · '))}</small></h3><button class="btn sm" type="button" data-aoo="x">✕ Chiudi</button></div>`;
    h += `<div class="ao-kv">${kv('Stato', stHtml(r) + `<small>${esc(lastSmall(r))}</small>`)}${kv('Cosa guarda', w ? `<b>▶ ${esc(w.main)}</b><small>${esc(w.sub)}</small>` : whatHtml(r), true)}`;
    h += kv('Attivato da', r.by === 'Tu' ? '<b>Tu</b>' : r.by ? `<b>🤝 ${esc(r.by)}</b><small>agente</small>` : '<span class="mut">non si sa: non è collegato a un cliente KAIROS e non è stato creato da «Crea lista»</span>');
    if (chk.length) h += kv('Da controllare', chk.map((m) => `<span class="ao-tag">⚠ ${esc(m)}</span>`).join(''), true);
    if (r.src === 'kairos') {
      const o = r.o, d = r.d, main = d && d.parent ? devById(d.parent) : d;
      h += kv('IP', o.ip ? `<b class="mono">${esc(o.ip)}</b><small>${esc([o.city, o.country].filter(Boolean).join(', '))}${o.home_country && o.country && o.home_country !== o.country ? ' · di solito ' + esc(o.home_country) : ''}</small>${ipTags(r)}` : '—');
      if (r.flags.includes('ip') && o.ip2) h += kv('Altro IP', `<b class="mono">${esc(o.ip2)}</b><small>visto pochi minuti prima</small>`);
      h += kv('App', `<b>${esc(r.appL)}</b><small>${esc(o.ver ? 'versione ' + o.ver : 'versione non nota')}${o.ui ? ' · ' + esc(o.ui) : ''}</small>`);
      h += kv('Dispositivo', `<b>${esc(o.model || '—')}</b>${o.dev_class === 'D' ? '<small>dispositivo debole</small>' : ''}`);
      if (o.prof) h += kv('Profilo', esc(o.prof)); if (o.pl) h += kv('Lista', esc(o.pl));
      h += kv('Rete', `<b>${esc(NET_L[o.net] || 'non nota')}</b>${o.net === 'wifi' && o.rssi ? `<small>segnale ${esc(o.rssi)} dBm</small>` : ''}`);
      if (o.speed_dl) h += kv('Velocità', `↓ ${mbps(o.speed_dl)} · ↑ ${o.speed_ul ? mbps(o.speed_ul) : '—'}${o.speed_ping ? ` · ${Math.round(o.speed_ping)} ms` : ''}${o.speed_jit ? ` (±${Math.round(o.speed_jit)})` : ''}`);
      if (LINE_L[o.line]) h += kv('Linea del cliente', `${LINE_L[o.line]}${o.bw ? ' · ' + mbps(o.bw) : ''}`);
      if (r.on && (o.res || o.codec || o.bitrate)) h += kv('Video', esc([o.res, o.fps ? Math.round(o.fps) + ' fps' : '', o.bitrate ? mbps(o.bitrate / 1e6) : '', o.codec, o.dec ? (o.dec === 'sw' ? 'decodifica software' : 'decodifica hardware') : '', o.engine === 'exo' ? 'ExoPlayer' : o.engine === 'vlc' ? 'VLC' : o.engine, o.fmt].filter(Boolean).join(' · ')), true);
      if (r.on && (o.stalls_h != null && o.codec || o.dropped)) h += kv('Blocchi', `${o.stalls_h != null ? esc(o.stalls_h) + " nell'ultima ora" : ''}${o.dropped ? ' · ' + esc(o.dropped) + ' fotogrammi persi' : ''}`);
      if (r.on && o.reduced) h += kv('Qualità ridotta', esc(o.reduced)); if (r.on && o.rec) h += kv('Ultimo recupero automatico', esc(o.rec));
      h += kv('VPN', o.vpn === 'on' ? '<span class="ao-tag ok">🛡 attiva</span>' : main && +main.vpn ? 'prevista ma spenta adesso' : 'no');
      h += kv('Cliente', d ? `<b>${esc(d.name || d.code)}</b><small class="mono">${esc(d.code || '')}</small>` : `<b>${esc(o.name || o.code)}</b>`);
      if (main) h += kv('Scadenza', esc(main.expires ? new Date(main.expires).toLocaleDateString('it-IT') : 'illimitata'));
      if (d && d.parent && main) h += kv('Collegato a', esc(main.name || main.code));
      h += kv('Reseller', esc(r.owner || 'Tu'));
      h += '</div>';
      const acts = [d ? `<button class="btn sm" type="button" data-aoo="open">Apri cliente</button>` : '', d && window.KXInsight ? '<button class="btn sm" type="button" data-aoo="dati">📊 Dati</button>' : '',
        d && r.on && r.state !== 'idle' ? '<button class="btn sm danger" type="button" data-aoo="kick" title="Interrompe la visione (l\'abbonamento resta attivo)">Disconnetti</button>' : '',
        d && !d.parent && +d.vpn ? '<button class="btn sm" type="button" data-aoo="vpn" title="Spegne la VPN su questo abbonamento">Spegni VPN</button>' : ''].join('');
      if (acts) h += `<div class="ao-acts">${acts}</div>`;
      return h;
    }
    if (r.src === 'orcp') {
      h += kv('IP', r.ip ? `<b class="mono">${esc(r.ip)}</b>${ipTags(r)}` : '—') + kv('App', `<b>${esc(r.appL)}</b><small>${esc([...new Set(r.ins.map((x) => x.app).filter(Boolean))].join(', '))}</small>`) + kv('Dispositivo', esc(r.dev || '—')) + kv('Versione', esc(r.ver || '—')) + kv('Ultimo accesso', esc(r.lastTxt || '—')) + '</div>';
      const ins = [...r.ins].sort((a, b) => (b.online ? 1 : 0) - (a.online ? 1 : 0) || orcpT(b.last) - orcpT(a.last)), top = ins.slice(0, 30);
      h += `<div class="ao-sub">Installazioni dell'app (${ins.length})</div><div class="ao-tw"><table class="ao-t"><thead><tr><th>Stato</th><th>Dispositivo</th><th>Versione</th><th>IP</th><th>Ultimo accesso</th><th>ID</th></tr></thead><tbody>${top.map((x) => `<tr><td>${x.online ? '<span class="on-st g"><i class="on-dot g"></i>Online</span>' : '<span class="on-st n"><i class="on-dot"></i>Offline</span>'}</td><td>${esc(x.device || '—')}${x.app ? `<small style="display:block;color:var(--mut)">${esc(x.app)}</small>` : ''}</td><td>${esc(x.version || '—')}</td><td class="mono">${window.KXVpn ? KXVpn.ip(x.ip, x.vpn) : esc(x.ip || '—')}</td><td>${esc(x.last || '—')}</td><td class="mono">${esc(x.did || x.id || '—')}</td></tr>`).join('')}</tbody></table></div>${ins.length > top.length ? `<p class="ao-note">… e altre ${ins.length - top.length} installazioni più vecchie.</p>` : ''}`;
      h += `<p class="ao-note">${esc(orcpName())} (ORCP) tiene una scheda per ogni installazione dell'app: lo stesso dispositivo con lo stesso ID, o lo stesso modello sulla stessa rete, conta una volta sola. ORCP non dice il canale: se l'utente è anche una linea WOLF, Atlantix, Realott o SLT il canale arriva da lì.</p>`;
      h += `<div class="ao-acts"><button class="btn sm" type="button" data-aoo="go">Apri in ${esc(orcpName())}</button></div>`;
      return h;
    }
    // MaxPlayer e OrbixPlay: le linee con il loro stato (le pallini si colorano da soli: online.js)
    h += kv(r.src === 'mxp' ? 'Cliente MaxPlayer' : 'Dispositivo OrbixPlay', `<b class="${r.src === 'oxp' ? 'mono' : ''}">${esc(r.src === 'mxp' ? r.mu || r.name : r.dev)}</b>${r.sub && r.src === 'mxp' ? `<small>${esc(r.sub)}</small>` : ''}`) + (r.acc ? kv('Account', esc(r.acc)) : '') + kv('Cliente KAIROS', r.kd ? `<b>${esc(r.kd.name || r.kd.code)}</b><small class="mono">${esc(r.kd.code || '')}</small>` : '<span class="mut">non collegato</span>') + kv('Reseller', esc(r.owner || 'Tu')) + '</div>';
    h += `<div class="ao-sub">${r.lines.length === 1 ? 'Linea' : 'Linee'} (${r.lines.length})</div><div class="ao-tw"><table class="ao-t"><thead><tr><th>Nome</th><th>Utente della linea</th><th>Server</th><th>Collegata adesso</th><th>Sta guardando</th></tr></thead><tbody>${r.lines.map((l) => { const k = window.KXOnline ? KXOnline.want(l.host, l.user, l.pass) : '', ww = watchOf(l.user); return `<tr><td>${esc(l.name || '—')}</td><td class="mono">${esc(l.user || '—')}</td><td class="mono">${esc(l.host || '—')}</td><td>${k ? `<span class="kx-on" data-on="${esc(k)}">${KXOnline.dot(KXOnline.get(k))}</span>` : '<span class="mut">non verificabile</span>'}</td><td>${ww ? `▶ ${esc(ww.w)} <small style="color:var(--mut)">(${esc(ww.from)})</small>` : '—'}</td></tr>`; }).join('')}</tbody></table></div>`;
    h += `<p class="ao-note">${esc(r.appL)} non dice chi è online né l'IP: «collegata» è il controllo delle connessioni attive della linea, fatto al suo server come in «Online ora terzi». Il canale c'è solo se la stessa linea è anche su WOLF, Atlantix, Realott o SLT.</p>`;
    h += `<div class="ao-acts"><button class="btn sm" type="button" data-aoo="go">Apri in ${esc(r.appL)}</button>${r.kd ? '<button class="btn sm" type="button" data-aoo="open">Apri cliente KAIROS</button>' : ''}</div>`;
    return h;
  }
  let curK = '';
  function openCard(r) {
    if (!r) return;
    closeOv(); curK = r.k;
    const o = document.createElement('div'); o.id = 'aoOv'; o.innerHTML = `<div class="ao-box" role="dialog" aria-modal="true">${cardHtml(r)}</div>`; document.body.appendChild(o);
    o.addEventListener('mousedown', (e) => { if (e.target === o) closeOv(); });
    o.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-aoo]'); if (!b) return;
      const a = b.dataset.aoo, row = (S.rows || []).find((x) => x.k === curK) || r;
      if (a === 'x') return closeOv();
      if (a === 'open') { const d = row.src === 'kairos' ? row.d : row.kd; closeOv(); return d ? openQuick(d) : toast('Cliente non trovato', 1); }
      if (a === 'dati') { closeOv(); return window.KXInsight && KXInsight.open(row.d.id); }
      if (a === 'go') {
        closeOv(); if (!window.KXOmni) return;
        if (row.src === 'orcp') return KXOmni.pick({ p: 'orcp', q: row.user, t: row.user });
        if (row.src === 'mxp') return KXOmni.pick({ p: 'mxp', q: row.mu || row.mid, t: row.mu || 'ID ' + row.mid });
        if (row.src === 'oxp') return KXOmni.pick({ p: 'oxp', q: row.dev, t: (row.lines[0] && row.lines[0].user) || row.dev });
        return;
      }
      if (a === 'kick') {
        if (typeof kickDev !== 'function' || !row.d) return;
        if (await kickDev(row.d)) { b.disabled = true; b.textContent = 'Disconnessione…'; setTimeout(() => load(), 25e3); }
        return;
      }
      if (a === 'vpn') {
        if (!(await ask('Spegnere la VPN?', 'La VPN verrà disattivata su questo abbonamento: l\'app la chiude al prossimo controllo (entro qualche minuto).', 'Spegni'))) return;
        try { await api('PUT', '/admin/devices/' + row.d.id, { vpn: 0 }); await window.load(); toast('VPN disattivata'); closeOv(); load(); } catch (err) { toast(err.message, 1); }
      }
    });
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('#aoOv') && !$('#modal.on')) closeOv(); });

  /* ---------- eventi ---------- */
  V.addEventListener('click', (e) => {
    const t = e.target.closest('#aoRe,[data-aof],[data-aoa],[data-aoi],#aoMoreB'); if (!t) return;
    if (t.id === 'aoRe') { if (window.KXOnline) KXOnline.refresh(); if (window.KXWatch) KXWatch.refresh().catch(() => {}); return load(true); }
    if (t.id === 'aoMoreB') { S.limit += 200; return paint(); }
    if (t.dataset.aof !== undefined) { S.st = t.dataset.aof; S.limit = 200; return paint(); }
    if (t.dataset.aoa !== undefined) { S.app = t.dataset.aoa; S.limit = 200; return paint(); }
    if (t.dataset.aoi !== undefined) openCard(S.vis[+t.dataset.aoi]);
  });
  V.addEventListener('change', (e) => {
    if (e.target.id === 'aoSt') { S.st = e.target.value; S.limit = 200; paint(); }
    if (e.target.id === 'aoSort') { S.sort = e.target.value; paint(); }
    if (e.target.id === 'aoOwn') { S.own = e.target.value; S.limit = 200; paint(); }
  });
  V.addEventListener('keydown', (e) => { const t = e.target.closest && e.target.closest('[data-aoi]'); if (t && e.target === t && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openCard(S.vis[+t.dataset.aoi]); } });
  V.addEventListener('input', (e) => { if (e.target.id === 'aoQ') { S.q = e.target.value; S.limit = 200; paint(); } });
  // aprendo la scheda (e a ogni giro del pulsante «Auto», che richiama view) si rileggono i dati
  const v0 = window.view;
  window.view = view = function (v) { v0(v); if (v === 'appon') { if (!isOwner()) { V.innerHTML = ''; return; } shell(); paint(); load(false); } };
  new MutationObserver(() => { if (!V.classList.contains('on')) closeOv(); }).observe(V, { attributes: true, attributeFilter: ['class'] });
  let ot = 0;
  const later = () => { if (ot || !V.classList.contains('on') || !S.rows) return; ot = setTimeout(() => { ot = 0; paint(); }, 300); };
  document.addEventListener('kx-online', later);
  const appEl = $('#app');
  if (appEl) new MutationObserver(() => { if (!appEl.classList.contains('on')) { closeOv(); Object.assign(S, { src: { kairos: null, orcp: null, mxp: null, oxp: null }, rows: null, t: 0, tx: 0, errs: [], q: '', app: '', own: '', st: 'on', sort: '' }); V.innerHTML = ''; } }).observe(appEl, { attributes: true, attributeFilter: ['class'] });
  // per «Online ora Kairos» (kc.js): scheda «App terze» con le stesse righe, la stessa scheda e «attivato da»
  window.KXAppsOnline = {
    load, rows: () => S.rows || [], busy: () => !!S.busy, errs: () => S.errs || [], at: () => S.t,
    ext: (r) => r.src !== 'kairos', isOn, stOf,
    listHtml: (L) => { gen++; return L.length ? HEAD + L.map((r) => rowHtml(r, -1)).join('') : ''; },
    open: (k) => openCard((S.rows || []).find((x) => x.k === k)),
  };
})();
