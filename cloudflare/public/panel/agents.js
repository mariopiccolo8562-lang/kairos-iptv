/* KAIROS Control 2.3 — Agenti (reseller), pannello ridotto per gli agenti, menu a gruppi e stile più sobrio.
   Usa le funzioni di app.js e kc.js ($, $$, esc, api, toast, ask, ago, fmtD, D, TITLES, view, load, renderDevices…). */
(() => {
  /* ---------- stile: piatto, grigio scuro, accento blu, niente bagliori ---------- */
  const css = document.createElement('style');
  css.textContent = `
:root{--bg:#16181d;--glass:#1e2127;--line:#2c3038;--txt:#e7e9ee;--mut:#8d93a0;--ok:#3fbf7f;--warn:#e0a431;--bad:#e5534b;--a1:#3d7cf5!important;--a2:#5b8ff7!important;--a3:#2f63c9!important;--pane:#1b1d22;--hov:#252931}
#dlCode{font-size:15px!important;font-weight:600}#donut svg{filter:none!important}#donut svg *{filter:none!important}
html,body{background:var(--bg);font-family:Inter,'Segoe UI',system-ui,-apple-system,sans-serif;font-size:14px}
.bgfx,.gridfx,#spot{display:none!important}
.glass{background:var(--glass)!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;border:1px solid var(--line);border-radius:10px;box-shadow:none!important}
.orb,.kpi .v,.legend b,.brand b,.lcard h1,.tv .c b.n{font-family:inherit!important;letter-spacing:0!important}
.grad{background:none!important;color:var(--txt)!important;-webkit-text-fill-color:currentColor}
.lcard{border-radius:12px}.lcard::before{display:none}.lcard h1{font-size:24px;font-weight:700;letter-spacing:.12em!important}
.hex svg,.brand svg{filter:none!important}
.inp{border-radius:8px;background:#14161a;border:1px solid var(--line);padding:11px 13px;font-size:14px}
.inp:focus{border-color:var(--a1);box-shadow:0 0 0 3px rgba(61,124,245,.18)}
.btn{border-radius:8px;padding:10px 16px;font-weight:600;background:#262a32;border-color:#323743}
.btn:hover{background:#2d323b;transform:none}
.btn.pri{background:var(--a1)!important;color:#fff!important;box-shadow:none!important;border:0}
.btn.pri:hover{background:#346ee0!important}
.btn.sm{border-radius:7px;padding:7px 11px}
#app.on{grid-template-columns:240px 1fr}
aside{background:var(--pane)!important;backdrop-filter:none!important;padding:18px 12px;gap:2px;overflow-y:auto}
.brand{padding:0 8px 18px}.brand svg{width:30px}.brand b{font-size:15px;letter-spacing:.14em!important}.brand small{font-size:10px;letter-spacing:.2em}
.nav{padding:9px 12px;border-radius:7px;font-weight:500;color:#b4b9c4;gap:12px;font-size:14px}
.nav svg{width:18px;height:18px;opacity:.85}
.nav:hover{background:var(--hov);color:#fff}
.nav.on{background:rgba(61,124,245,.14)!important;color:#fff}
.nav.on::before{left:-12px;top:7px;bottom:7px;width:3px;box-shadow:none;background:var(--a1)}
.nav .bdg,.kc-nb{background:var(--a1)!important;color:#fff!important}
.nav-h{font-size:11px;font-weight:700;letter-spacing:.09em;color:#6c7280;padding:16px 12px 6px;text-transform:uppercase}
.nav-h.big{font-size:12px;color:#c9ced8;letter-spacing:.14em;padding:22px 12px 2px;margin-top:6px;border-top:1px solid var(--line)}.nav-h.big:first-of-type{border-top:0;margin-top:0;padding-top:10px}
aside .foot{border-radius:8px;background:#1f2228!important}
main{padding:22px clamp(16px,2.6vw,34px) 60px;background:var(--bg)}
.topbar{margin-bottom:20px}.topbar h2{font-size:22px;font-weight:600}
.search{border-radius:8px}
.avatar{border-radius:50%;background:#2c3140!important;color:#fff;width:36px;height:36px;font-size:14px}
.view{animation:none}
.kpi{padding:18px}.kpi .halo{display:none}.kpi:hover{transform:none}.kpi .v{font-size:30px;font-weight:700}
.card{padding:18px}.card h3{font-size:15px;font-weight:600}
.fchip{border-radius:7px}.fchip.on,.seg button.on{background:var(--a1)!important;color:#fff!important}
.seg{border-radius:8px;background:#14161a}.seg button{border-radius:6px}
.tbl{border-spacing:0}.tbl td{background:transparent;border-top:0;border-bottom:1px solid var(--line);border-radius:0!important;border-left:0!important;border-right:0!important}
.tbl tbody tr:hover td{background:var(--hov)}.tbl tr{animation:none}
.code{border-radius:5px;background:#14161a}
.st{border-radius:5px;padding:4px 9px}.st i{box-shadow:none}
.icb{border-radius:7px}.icb:hover{border-color:var(--line);background:var(--hov)}
.tog{border-radius:8px;background:#1a1d22}.tog.on i{background:var(--a1)!important;box-shadow:none!important}
.pl,.dsec{border-radius:10px!important;background:#1a1d22!important}
#drawer{background:#1b1d22!important;border-radius:0!important}#drawer.full{background:var(--bg)!important;left:240px}
#modal .glass{background:#1e2127!important}
.toast{background:#22262d;border-radius:8px}.toast i{box-shadow:none}
.dv-card{border-radius:10px;background:var(--glass)}.dv-card:hover{transform:none;background:#22252c}
.dv-tile{border-radius:10px;background:var(--glass)}.dv-tile.on{background:rgba(61,124,245,.12)!important;border-color:rgba(61,124,245,.6)!important;box-shadow:none!important}
.dv-tile i{border-radius:8px}
.dv-pc{border-radius:10px;background:rgba(224,164,49,.07)}
.dv-exp s,.dv-exp.warn s,.dv-exp.bad s{background:currentColor!important}.dv-exp.ok s{color:var(--ok)}.dv-exp.warn s{color:var(--warn)}.dv-exp.bad s{color:var(--bad)}
.dvt th{background:#1b1d22}.dvt tbody tr.sel{background:rgba(61,124,245,.12)}
.dvt-bulk{background:#20314f!important;border-color:rgba(61,124,245,.5)!important;border-radius:8px}
.dvt-ib{border-radius:7px}.dvt-ib:hover{transform:none}
.dnav button.on{border-color:rgba(61,124,245,.6)!important;background:rgba(61,124,245,.14)!important}.dnav button.on i{background:var(--a1)!important}
.kc-step>i{background:var(--a1)!important;box-shadow:none!important}
.kc-dns.saved{background:rgba(61,124,245,.06)!important;border-color:rgba(61,124,245,.35)!important}
.demo-tag{background:var(--a1);color:#fff}
.st-tab.on{border-color:rgba(61,124,245,.6)!important;background:rgba(61,124,245,.1)!important}
/* agenti */
.ag-bar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:14px}.ag-bar .inp{flex:1;min-width:220px;margin:0}
.ag-tbl{width:100%;border-collapse:collapse;font-size:13.5px}
.ag-tbl th{text-align:left;font-size:12px;font-weight:600;color:var(--mut);padding:11px 12px;border-bottom:1px solid var(--line);white-space:nowrap}
.ag-tbl td{padding:12px;border-bottom:1px solid var(--line);vertical-align:middle}
.ag-tbl tbody tr{cursor:pointer}.ag-tbl tbody tr:hover{background:var(--hov)}
.ag-tbl small{display:block;color:var(--mut);font-size:12px;margin-top:2px}
.ag-tbl .num{color:var(--mut);width:1%}
.chip{display:inline-block;font-size:11.5px;font-weight:600;padding:3px 8px;border-radius:5px;background:#2a2f39;color:#c9cdd6;margin:2px 4px 2px 0}
.chip.b{background:rgba(61,124,245,.16);color:#8fb3ff}
.chip.g{background:rgba(63,191,127,.15);color:#6fd6a1}.chip.r{background:rgba(229,83,75,.15);color:#f08a84}.chip.y{background:rgba(224,164,49,.15);color:#ecc06f}
.ag-st{display:inline-flex;align-items:center;gap:6px;font-weight:600;font-size:12.5px}.ag-st i{width:7px;height:7px;border-radius:50%;background:currentColor}
.ag-st.on{color:var(--ok)}.ag-st.off{color:var(--bad)}
.ag-bar2{height:5px;border-radius:5px;background:#2a2e36;margin-top:6px;overflow:hidden;max-width:120px}.ag-bar2 s{display:block;height:100%;background:var(--a1)}
#agPage{position:fixed;top:0;bottom:0;right:0;left:240px;z-index:21;background:var(--bg);display:none;flex-direction:column}
#agPage.on{display:flex}
#agPage .ah{display:flex;align-items:center;gap:12px;padding:16px 28px;border-bottom:1px solid var(--line);background:var(--pane)}
#agPage .ah h3{flex:1;font-size:18px;font-weight:600}
#agPage .ab{flex:1;overflow:auto;padding:22px 28px}
#agPage .af{display:flex;gap:10px;padding:14px 28px;border-top:1px solid var(--line);background:var(--pane)}
.ag-g{display:grid;grid-template-columns:repeat(auto-fit,minmax(380px,1fr));gap:16px;align-items:start}
.ag-c{background:var(--glass);border:1px solid var(--line);border-radius:10px;padding:18px}
.ag-c h4{font-size:14px;font-weight:600;margin-bottom:2px}.ag-c>small{display:block;color:var(--mut);font-size:12.5px;margin-bottom:12px}
.ag-chk{display:grid;gap:6px}.ag-chk label{display:flex;align-items:center;gap:10px;padding:9px 11px;border-radius:7px;background:#1a1d22;border:1px solid var(--line);cursor:pointer;font-size:13.5px}
.ag-chk label.dis{opacity:.45;cursor:not-allowed}
.ag-chk input{width:16px;height:16px;accent-color:var(--a1)}
.ag-chk small{margin-left:auto;color:var(--mut);font-size:12px}
.ag-radio{display:grid;grid-template-columns:1fr 1fr;gap:8px}.ag-radio label{display:block;padding:12px;border-radius:8px;border:1px solid var(--line);background:#1a1d22;cursor:pointer}
.ag-radio label.on{border-color:var(--a1);background:rgba(61,124,245,.1)}.ag-radio b{display:block;font-size:13.5px}.ag-radio small{color:var(--mut);font-size:12px}
.ag-radio input{display:none}
.ag-lim{display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:8px;background:var(--glass);border:1px solid var(--line);font-size:13px}
.ag-lim b{font-size:15px}
.dv-resp{display:inline-block;margin-top:4px;font-size:12px;color:#8fb3ff}
body.agent #newDev{display:inline-flex}
body.agent .dvt input[type=checkbox],body.agent .dvt th.c:first-child,body.agent .dvt td.c:first-child,body.agent #dvBulk{display:none!important}
body.agent .foot{display:none}
@media (max-width:900px){#agPage{left:0}.ag-g{grid-template-columns:1fr}.ag-tbl .hm{display:none}}
@media (max-width:820px){#drawer.full{left:0}}`;
  document.head.appendChild(css);

  const IC = {
    agents: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><circle cx="17.5" cy="9" r="2.6"/><path d="M16.8 14.6c2.6.2 4.2 1.9 4.8 4.6"/></svg>',
    sec: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>',
  };
  const FL = [['create', 'Attivare clienti nuovi', 'Con il codice che il cliente vede sulla TV'], ['renew', 'Rinnovare e cambiare la scadenza', ''], ['disable', 'Attivare e disattivare il servizio', ''],
    ['playlists', 'Cambiare server, utente e password', 'Solo tra i server che gli assegni'], ['kick', 'Disconnettere il cliente', 'Interrompe la visione in corso'], ['delete', 'Eliminare clienti', ''],
    ['clientPerms', 'Cambiare i permessi dell\'app', 'Cosa può fare il cliente nell\'app'], ['vpn', 'Cambiare la VPN del cliente', ''],
    ['link', 'Collegare altri dispositivi', 'Codice a 6 cifre, sblocca, scollega'], ['subClients', 'Vedere i clienti dei suoi sotto-agenti', 'Se spento vede e gestisce solo i clienti attivati da lui'], ['players', 'Inviare le linee a OrbixPlay e MaxPlayer', 'Solo per i suoi clienti, con le tue chiavi (che non vede)'], ['account', 'Profili, lettore e visioni contemporanee', 'Entro le connessioni che gli concedi'], ['ai', 'Assistente IA dei clienti', 'Quale IA, domande al giorno, domande extra']];
  // pagine del pannello: sempre e solo con i dati dei suoi clienti
  const FP = [['dash', 'Dashboard', 'Riepilogo dei suoi clienti', 'dash'], ['online', 'Online ora', 'Chi sta guardando, tra i suoi clienti', 'live'], ['errors', 'Errori applicazione', 'Dei suoi clienti', 'apperr'],
    ['reports', 'Segnalazioni', 'Dei suoi clienti', 'reports'], ['contentReq', 'Richieste contenuti', 'Dei suoi clienti', 'creq'], ['addonReq', 'Richieste temi', 'Assegna solo gli add-on che gli concedi', 'areq'],
    ['messages', 'Messaggi', 'Solo ai suoi clienti, mai a tutti', 'msgs'], ['store', 'Download store: accettare le richieste', 'Solo per le app che scegli qui sotto (le impostazioni restano tue)', 'store'],
    ['storeAll', 'Download store: vedere anche i download degli altri', 'Se spento nello storico vede solo quelli approvati da lui', ''],
    ['vod', 'Videoteca', 'Solo le linee dei suoi clienti', 'vod'], ['activity', 'Attività', 'Solo le sue azioni', 'activity'], ['dlcodes', 'Codici downloader', 'Le app da far installare ai clienti (solo da copiare)', 'dlc'], ['maint', 'Manutenzione dei suoi clienti', 'Schermata di manutenzione solo per i suoi clienti (mai per i tuoi)', '']];
  const PERM_VIEW = Object.fromEntries(FP.map(([k, , , v]) => [v, k]));
  const isAgent = () => D.role === 'agent';
  const me = () => D.me || {};
  const can = (k) => !isAgent() || !!(me().perms || {})[k];

  /* ---------- menu a gruppi ---------- */
  const side = $('#side');
  const nav = (v) => $(`.nav[data-v="${v}"]`);
  const mk = (v, label, ic) => { const b = document.createElement('button'); b.className = 'nav'; b.dataset.v = v; b.innerHTML = ic + label; b.onclick = () => view(v); return b; };
  if (!nav('agents')) {
    const a = mk('agents', 'Agenti', IC.agents), s = mk('sec', 'Sicurezza', IC.sec);
    side.appendChild(a); side.appendChild(s);
    for (const [id, html] of [['agents', ''], ['sec', '']]) { const sec = document.createElement('section'); sec.className = 'view'; sec.id = 'v-' + id; sec.innerHTML = html; $('#v-dash').after(sec); }
  }
  // "Dispositivi" diventa "Clienti"
  { const b = nav('devices'); if (b) for (const n of b.childNodes) if (n.nodeType === 3 && /Dispositivi/.test(n.textContent)) n.textContent = 'Clienti'; }
  Object.assign(TITLES, { devices: 'Clienti', agents: 'Agenti', sec: 'Sicurezza' });
  // menu (2.11): «Operatività» per il lavoro di tutti i giorni, «Impostazioni» per le cose che si toccano una volta
  const GROUPS = [['§Operatività'], ['', ['dash']], ['Clienti', ['devices', 'agents', 'live']], ['Da gestire', ['reports', 'creq', 'areq', 'reqai', 'store']], ['Contenuti e comunicazione', ['msgs', 'vod']],
    ['App e distribuzione', ['appk', 'dlc', 'apps3']], ['Controllo', ['apperr', 'activity']],
    ['§Impostazioni'], ['', ['set-look', 'set-app', 'set-addon', 'set-ai', 'dns', 'set-maint', 'set-sec', 'sec', 'api']]];
  const HIDDEN = ['settings', 'ai']; // sostituite dalle voci qui sopra (le pagine restano)
  function layoutMenu() {
    const foot = $('aside .foot'), brand = $('aside .brand');
    $$('.nav-h', side).forEach((h) => h.remove());
    let at = brand;
    const put = (el) => { at.after(el); at = el; };
    for (const v of HIDDEN) { const b = nav(v); if (b) b.style.display = 'none'; }
    let big = null;
    for (const [h, vs] of GROUPS) {
      if (h && h[0] === '§') { big = h.slice(1); continue; }
      const items = (vs || []).map(nav).filter((b) => b && b.style.display !== 'none');
      if (!items.length) continue;
      if (big) { const e = document.createElement('div'); e.className = 'nav-h big'; e.textContent = big; put(e); big = null; }
      if (h) { const e = document.createElement('div'); e.className = 'nav-h'; e.textContent = h; put(e); }
      items.forEach(put);
    }
    for (const b of $$('.nav[data-v]', side)) if (!HIDDEN.includes(b.dataset.v) && !GROUPS.some(([, vs]) => (vs || []).includes(b.dataset.v))) put(b); // eventuali voci nuove
    if (foot && $('#logout')) foot.after($('#logout'));
  }

  /* ---------- API: per l'agente solo le funzioni consentite (niente chiamate inutili) ---------- */
  const AG_OK = /^\/admin\/(presence|app-errors(\/seen)?(\?.*)?|requests(\/\d+(\/status)?)?(\?.*)?|messages(\/\d+)?|store(\/[A-Za-z0-9_-]+\/(approve|deny|revoke))?|catalog(\/sources)?(\?.*)?|ai\/grant|match-server|agent-maint|orbix\/[A-Za-z0-9_-]+|maxplayer\/[A-Za-z0-9_-]+(\?fresh=1)?|login|logout|logout-all|state|password|totp\/(setup|enable|disable)|devices(\/[^/?]+(\/(kick|linkcode|reset|unlink|link))?)?(\?.*)?|agents(\/\d+)?|addon-preview\/[a-z0-9-]+)$/;
  const origApi = api;
  window.api = api = async function (m, p, b) {
    if (isAgent() && !AG_OK.test(p)) throw new Error('Funzione non disponibile per gli agenti');
    const r = await origApi(m, p, b);
    if (p === '/admin/state' && m === 'GET' && r) {
      D.role = r.role === 'agent' ? 'agent' : 'owner'; D.agents = r.agents || []; D.me = r.me || null; D.servers = r.servers || [];
      D.storeAppNames = r.storeAppNames || []; D.maintMe = r.maint || null; D.maintAg = r.maintAg || [];
      if (r.addonCat) D.addonCat = r.addonCat;
    }
    if (p === '/admin/login' && r && r.role) D.role = r.role;
    return r;
  };

  /* ---------- modalità agente ---------- */
  const agentCan = (v) => !!PERM_VIEW[v] && can(PERM_VIEW[v]);
  // 'apps3' (APP Store) NON è qui: la sua visibilità per l'agente la decide appstore-panel.js in base alle app consentite (sola lettura)
  const OWNER_ONLY = ['dash', 'live', 'apperr', 'reports', 'creq', 'areq', 'ai', 'reqai', 'vod', 'msgs', 'store', 'dns', 'appk', 'dlc', 'settings', 'set-look', 'set-app', 'set-addon', 'set-ai', 'set-maint', 'set-sec', 'api', 'activity'];
  let modeSet = '';
  function applyMode() {
    const ag = isAgent();
    document.body.classList.toggle('agent', ag);
    for (const v of OWNER_ONLY) { const b = nav(v); if (b) b.style.display = ag && !agentCan(v) ? 'none' : ''; }
    { const c = $('#sdOn') && $('#sdOn').closest('.card'); if (c) c.style.display = ag ? 'none' : ''; const d = $('#sdDev') && $('#sdDev').closest('.card'); if (d) d.style.display = ag ? 'none' : ''; const k = $('#sdClear'); if (k) k.style.visibility = ag ? 'hidden' : ''; const sm = $('#sdSmsCard'); if (sm) sm.style.display = ag ? 'none' : ''; }
    const sb = nav('sec'); if (sb) sb.style.display = ag ? '' : 'none';
    const ab = nav('agents'); if (ab) ab.style.display = !ag || me().canAgents ? '' : 'none';
    layoutMenu();
    // la sicurezza dell'account: per l'agente in una pagina sua, per il proprietario resta nelle Impostazioni
    const g = $('[data-pane="sec"] .st-g') || $('#v-sec .st-g');
    if (g) (ag ? $('#v-sec') : $('[data-pane="sec"]')).appendChild(g);
    const h = $('#aUser') && $('#aUser').closest('.card') && $('#aUser').closest('.card').querySelector('h3');
    if (h) h.innerHTML = ag ? 'Il tuo account<small>Nome utente e password per entrare nel pannello</small>' : 'Account amministratore<small>Nome utente e password per entrare nel pannello</small>';
    if (ag && $('#aUser') && !$('#aUser').value) $('#aUser').value = D.user || '';
    $('#newDev').style.display = !ag || can('create') ? '' : 'none';
    if (modeSet !== (ag ? 'a' : 'o')) { modeSet = ag ? 'a' : 'o'; if (ag) view('devices'); }
    if (ag && OWNER_ONLY.some((v) => !agentCan(v) && $('#v-' + v) && $('#v-' + v).classList.contains('on'))) view('devices');
    let lim = $('#agLim');
    if (ag) {
      if (!lim) { lim = document.createElement('div'); lim.id = 'agLim'; lim.className = 'ag-lim'; $('#newDev').before(lim); }
      const m = me(); lim.innerHTML = `Clienti <b>${m.clientsUsed ?? 0}</b> / ${m.maxClients ?? 0}`;
    } else if (lim) lim.remove();
  }
  const origRenderAll = renderAll;
  window.renderAll = renderAll = function () { applyMode(); origRenderAll(); renderAgents(); };
  const origMsgs = renderMsgs;
  window.renderMsgs = renderMsgs = function () { origMsgs(); if (isAgent()) { const o = $('#mTo option[value="all"]'); if (o) o.remove(); $$('#mTo option').forEach((x) => { const d = D.devices.find((y) => y.id === x.value); if (d && d.parent) x.remove(); }); } };
  const origSec = renderSecurity;
  window.renderSecurity = renderSecurity = function () {
    origSec();
    if (!isAgent()) return;
    const x = D.security || {};
    $('#secList').innerHTML = `<div class="sec"><i class="${x.totp ? 'y' : 'n'}">${x.totp ? '✓' : '!'}</i><div><b>Verifica in due passaggi</b><small>${x.totp ? 'Attiva: all\'accesso serve anche il codice dell\'app di autenticazione' : 'Facoltativa ma consigliata: protegge il tuo account anche se qualcuno scopre la password'}</small></div></div>
      <div class="sec"><i class="y">✓</i><div><b>Accesso limitato</b><small>Vedi e gestisci solo i tuoi clienti${me().canAgents ? ' e quelli dei tuoi sotto-agenti' : ''}</small></div></div>`;
  };
  const view0 = view;
  window.view = view = function (v) {
    if (isAgent() && OWNER_ONLY.includes(v) && !agentCan(v)) v = 'devices';
    if (v === 'agents' && isAgent() && !me().canAgents) v = 'devices';
    view0(v);
  };
  $$('.nav[data-v]').forEach((n) => (n.onclick = () => view(n.dataset.v)));

  /* ---------- Responsabile nelle schede e nella tabella dei clienti ---------- */
  const agName = (id) => { if (!id) return isAgent() ? '' : ''; if (isAgent() && id === me().id) return 'Tu'; const a = (D.agents || []).find((x) => x.id === id); return a ? a.username : 'agente #' + id; };
  const origRD = renderDevices;
  window.renderDevices = renderDevices = function () {
    origRD();
    const show = (D.agents || []).length > 0;
    if (!show) return;
    $$('#dvCards .dv-card[data-id]').forEach((c) => {
      const d = D.devices.find((x) => x.id === c.dataset.id); if (!d) return;
      const meta = $('.dv-meta', c); const n = agName(d.ownerId);
      if (meta && !$('.dv-resp', c)) meta.insertAdjacentHTML('beforeend', `<br><span class="dv-resp">👤 ${n ? 'Responsabile: ' + esc(n) : 'Responsabile: ' + (isAgent() ? 'Tu' : 'tu')}</span>`);
    });
    const t = $('#dvTbl .dvt'); if (!t || $('th.ag-col', t)) return;
    const ths = $$('thead th', t); if (ths[1]) ths[1].insertAdjacentHTML('afterend', '<th class="ag-col">Responsabile</th>');
    $$('tbody tr[data-id]', t).forEach((r) => {
      const d = D.devices.find((x) => x.id === r.dataset.id); const tds = $$(':scope>td', r);
      const n = d && !d.parent ? agName(d.ownerId) : '';
      if (tds[1]) tds[1].insertAdjacentHTML('afterend', `<td>${d && d.parent ? '' : n ? `<span class="chip b">${esc(n)}</span>` : '<span class="mut">—</span>'}</td>`);
    });
  };

  /* ---------- pagina Agenti ---------- */
  const st = { q: '', f: 'all' };
  function renderAgents() {
    const V = $('#v-agents'); if (!V) return;
    const L = D.agents || [];
    const sub = isAgent();
    const list = L.filter((a) => (st.f === 'all' || (st.f === 'on' ? a.active : !a.active)) && (!st.q || [a.username, a.email, a.notes].join(' ').toLowerCase().includes(st.q)));
    const byId = new Map(L.map((a) => [a.id, a]));
    V.innerHTML = `<div class="ag-bar"><input class="inp" id="agQ" placeholder="Cerca agente per nome, email o note" value="${esc(st.q)}">
      <div class="seg" id="agF">${[['all', 'Tutti'], ['on', 'Attivi'], ['off', 'Disattivati']].map(([k, l]) => `<button data-f="${k}" class="${st.f === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <button class="btn pri" id="agNew">+ Nuovo ${sub ? 'sotto-agente' : 'agente'}</button></div>
      <div class="card glass" style="padding:0;overflow:auto">${list.length ? `<table class="ag-tbl"><thead><tr><th class="num">ID</th><th>Agente</th><th>Clienti</th><th class="hm">Sottoagenti</th><th>Accesso</th><th class="hm">Ultima attività</th><th class="hm">2FA</th><th>Stato</th></tr></thead><tbody>
      ${list.map((a) => { const pct = a.maxClients ? Math.min(100, Math.round((a.clients / a.maxClients) * 100)) : 100; const up = a.parentId && byId.get(a.parentId);
        return `<tr data-ag="${a.id}"><td class="num">${a.id}</td>
        <td><b>${esc(a.username)}</b><small>${esc(a.email || '—')}${up ? ' · sotto ' + esc(up.username) : ''}</small></td>
        <td><b>${a.clients}</b><small>Limite: ${a.maxClients}</small><div class="ag-bar2"><s style="width:${pct}%"></s></div></td>
        <td class="hm">${a.subAgents}</td>
        <td><span class="chip ${a.canAgents ? 'b' : ''}">${a.canAgents ? 'Gestisce agenti' : 'Solo clienti'}</span><br>${(a.serverNames || []).map((n) => `<span class="chip">${esc(n)}</span>`).join('') || '<span class="chip r">nessun server</span>'}</td>
        <td class="hm">${a.lastSeen ? esc(ago(a.lastSeen)) : '<span class="mut">mai</span>'}</td>
        <td class="hm">${a.totp ? '<span class="chip g">Attiva</span>' : '<span class="chip">No</span>'}</td>
        <td><span class="ag-st ${a.active ? 'on' : 'off'}"><i></i>${a.active ? 'Attivato' : 'Disattivato'}</span></td></tr>`; }).join('')}</tbody></table>`
      : `<div class="emptyc">${L.length ? 'Nessun agente trovato' : `Nessun agente ancora.<br><span style="font-size:13px">Gli agenti sono i tuoi rivenditori: entrano nel pannello con le loro credenziali e gestiscono solo i propri clienti, con i permessi che decidi tu.</span>`}</div>`}</div>`;
    $('#agQ').oninput = (e) => { st.q = e.target.value.toLowerCase(); const p = e.target.selectionStart; renderAgents(); const q = $('#agQ'); q.focus(); q.setSelectionRange(p, p); };
    $$('#agF [data-f]').forEach((b) => (b.onclick = () => { st.f = b.dataset.f; renderAgents(); }));
    $('#agNew').onclick = () => openAgent(null);
    $$('[data-ag]', V).forEach((r) => (r.onclick = () => openAgent(L.find((a) => a.id === +r.dataset.ag))));
  }

  /* ---------- pagina intera: crea / modifica agente ---------- */
  const page = document.createElement('div'); page.id = 'agPage';
  page.innerHTML = '<div class="ah"><h3 id="agT"></h3><button class="icb" id="agX" title="Chiudi"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg></button></div><div class="ab" id="agB"></div><div class="af" id="agFt"></div>';
  document.body.appendChild(page);
  const closePage = () => page.classList.remove('on');
  $('#agX').onclick = closePage;
  addEventListener('keydown', (e) => { if (e.key === 'Escape') closePage(); });
  const chk = (name, val, label, on, dis, sm) => `<label class="${dis ? 'dis' : ''}"><input type="checkbox" data-${name}="${esc(val)}" ${on ? 'checked' : ''} ${dis ? 'disabled' : ''}>${label}${(name === 'ad' || name === 'cad') && window.KX_EYE ? window.KX_EYE(val) : ''}${sm ? `<small>${sm}</small>` : ''}</label>`;
  // app dello store: «tutte» oppure quelle scelte (un sotto-agente mai più di chi lo crea)
  const storeAppsBox = (P, topP) => {
    const cur = Array.isArray(P.storeApps) ? P.storeApps : ['*'], all = cur.includes('*');
    const topAll = !topP || !Array.isArray(topP.storeApps) || topP.storeApps.includes('*');
    const names = [...new Set([...(D.storeAppNames || []), ...(topAll ? [] : topP.storeApps), ...cur.filter((x) => x !== '*')])].filter((x) => topAll || topP.storeApps.some((y) => y.toLowerCase() === x.toLowerCase())).sort((x, y) => x.localeCompare(y));
    return (topAll ? chk('sapp', '*', '<b>Tutte le app</b>', all, false, 'Anche quelle che aggiungerai in futuro') : '') + (names.length ? names.map((n) => chk('sapp', n, esc(n), all ? !topAll : cur.some((x) => x.toLowerCase() === n.toLowerCase()), false, '')).join('') : '<p class="mut" style="font-size:12.5px">Le app compaiono qui dopo la prima richiesta dallo store; puoi anche aggiungerle a mano.</p>');
  };
  // app di «Attiva app» (manage-device) che l'agente può vedere/usare: ['*'] = tutte
  const appsAllowBox = (P) => {
    const cur = Array.isArray(P.appsAllow) ? P.appsAllow : ['*'], all = cur.includes('*');
    const names = [...new Set([...(((D.settings && D.settings.appLinks) || []).map((x) => x.name)), ...cur.filter((x) => x !== '*')])].sort((a, b) => a.localeCompare(b));
    return chk('aapp', '*', '<b>Tutte le app</b>', all, false, 'Anche quelle che aggiungerai in futuro') + (names.length ? names.map((n) => chk('aapp', n, esc(n), all || cur.some((x) => x.toLowerCase() === n.toLowerCase()), false, '')).join('') : '<p class="mut" style="font-size:12.5px">Nessuna app: le aggiungi in APP Store → Attiva app.</p>');
  };
  async function openAgent(a) {
    const isNew = !a, sub = isAgent(), top = sub ? me() : null;
    let servers = [];
    try { servers = sub ? D.servers : ((await api('GET', '/admin/dns')).saved || []); } catch (e) { servers = []; }
    const adCat = (sub ? D.addonCat || [] : addonCatNow()).filter((x) => x.mode === 'some');
    const P = a ? a.perms : { create: true, renew: true, disable: true, kick: true, playlists: true, delete: false, clientPerms: false, vpn: false, addons: [], maxConn: 1 };
    const topP = top ? top.perms || {} : null;
    $('#agT').innerHTML = isNew ? (sub ? 'Nuovo sotto-agente' : 'Nuovo agente') : `${esc(a.username)} <span class="chip ${a.active ? 'g' : 'r'}" style="vertical-align:3px">${a.active ? 'Attivato' : 'Disattivato'}</span>`;
    $('#agB').innerHTML = `<div class="ag-g">
      <div class="ag-c"><h4>Account</h4><small>Le credenziali con cui l'agente entra in questo pannello</small>
        <label class="lbl">Nome utente</label><input class="inp" id="agU" maxlength="40" value="${esc(a ? a.username : '')}" ${a ? 'readonly' : ''} placeholder="es. mario.rossi" autocomplete="off">
        <label class="lbl">Email (facoltativa)</label><input class="inp" id="agE" maxlength="120" value="${esc(a ? a.email : '')}" placeholder="mario@esempio.it" autocomplete="off">
        ${a && a.password ? `<label class="lbl">Password attuale</label><div class="row" style="grid-template-columns:1fr auto auto"><input class="inp mono" id="agPwNow" type="password" value="${esc(a.password)}" readonly><button class="btn" id="agPwEye" title="Mostra / nascondi">👁</button><button class="btn" id="agPwCp" title="Copia">Copia</button></div>` : ''}
        <label class="lbl">${isNew ? 'Password' : 'Nuova password'}</label><input class="inp" id="agP" type="password" autocomplete="new-password" placeholder="${isNew ? 'almeno 10 caratteri' : 'lascia vuoto per non cambiarla'}">
        <label class="lbl">Note (le vedi solo tu)</label><textarea class="inp" id="agN" maxlength="300" placeholder="Contatto, accordi, pagamenti…">${esc(a ? a.notes : '')}</textarea>
        <div class="tog ${!a || a.active ? 'on' : ''}" id="agA" style="margin-top:14px"><div><b>Account attivo</b><small>Se lo disattivi esce subito dal pannello, insieme ai suoi sotto-agenti. I clienti continuano a funzionare.</small></div><i></i></div>
      </div>
      <div class="ag-c"><h4>Limiti e accesso</h4><small>Quanti clienti può avere e cosa vede</small>
        <div class="row"><div><label class="lbl">Clienti massimi</label><input class="inp" id="agM" type="number" min="0" max="${top ? top.maxClients : 100000}" value="${a ? a.maxClients : Math.min(10, top ? top.maxClients : 10)}"></div>
        <div><label class="lbl">Connessioni per cliente</label><input class="inp" id="agC" type="number" min="1" max="${topP ? topP.maxConn : 10}" value="${P.maxConn || 1}"></div></div>
        ${a ? `<p class="mut" style="font-size:12.5px;margin-top:8px">Clienti ora: <b>${a.clients}</b>${a.subAgents ? ` (di cui ${a.clients - a.ownClients} dei suoi ${a.subAgents} sotto-agenti)` : ''}</p>` : ''}
        <label class="lbl">Accesso</label><div class="ag-radio" id="agR">
          <label class="${a && a.canAgents ? '' : 'on'}"><input type="radio" name="agr" value="0" ${a && a.canAgents ? '' : 'checked'}><b>Solo clienti</b><small>Gestisce solo i suoi clienti</small></label>
          <label class="${a && a.canAgents ? 'on' : ''}"><input type="radio" name="agr" value="1" ${a && a.canAgents ? 'checked' : ''}><b>Gestisce agenti</b><small>Può creare sotto-agenti, mai con più permessi dei suoi</small></label></div>
      </div>
      <div class="ag-c"><h4>Server assegnati</h4><small>L'agente sceglie uno di questi server e scrive utente e password del cliente. Non vede gli indirizzi.</small>
        <div class="ag-chk" id="agS">${servers.length ? servers.map((s) => chk('srv', s.id, `<b>${esc(s.name)}</b>`, a ? (a.servers || []).includes(s.id) : false, false, sub ? '' : esc(s.host.replace(/^https?:\/\//, '')))).join('') : `<p class="mut">${sub ? 'Non hai server assegnati.' : 'Nessun server salvato: aggiungili in Server DNS e VPN.'}</p>`}</div>
      </div>
      <div class="ag-c"><h4>Permessi</h4><small>Cosa può fare con i suoi clienti${sub ? ' (solo tra quelli che hai anche tu)' : ''}</small>
        <div class="ag-chk" id="agPm">${FL.map(([k, l, sm]) => chk('perm', k, l, !!P[k], topP && !topP[k], sm)).join('')}</div>
      </div>
      <div class="ag-c"><h4>Pagine del pannello</h4><small>Cosa vede nel suo pannello: sempre e solo i dati dei suoi clienti. Impostazioni, Server DNS, API, la manutenzione generale e le impostazioni dell'assistente restano solo tue (valgono per tutti i clienti). I tuoi clienti e quelli degli altri agenti non li vede mai.</small>
        <div class="ag-chk" id="agPg">${FP.map(([k, l, sm]) => chk('perm', k, l, !!P[k], topP && !topP[k], sm)).join('')}</div>
      </div>
      <div class="ag-c"><h4>App dello store che può approvare</h4><small>Vale se ha «Download store: accettare le richieste». Vede solo le richieste di queste app.</small>
        <div class="ag-chk" id="agSa" style="max-height:300px;overflow:auto">${storeAppsBox(P, topP)}</div>
        <div style="display:flex;gap:8px;margin-top:10px"><input class="inp" id="agSaN" maxlength="80" placeholder="Aggiungi un'app (nome come nello store)" style="margin:0;flex:1"><button class="btn sm" id="agSaAdd">Aggiungi</button></div>
      </div>
      <div class="ag-c"><h4>App di «Attiva app» che può usare</h4><small>Quali app (manage-device) l'agente vede nel suo pannello per caricare le liste. Non può aggiungerle né modificarne i link: decidi solo tu.</small>
        <div class="ag-chk" id="agAa" style="max-height:260px;overflow:auto">${appsAllowBox(P)}</div>
      </div>
      <div class="ag-c"><h4>Add-on che può assegnare</h4><small>Tra quelli che in Impostazioni → Store add-on sono «solo a chi assegno»</small>
        <div class="ag-chk" id="agAd" style="max-height:300px;overflow:auto">${adCat.length ? adCat.map((x) => chk('ad', x.id, esc(x.name), (P.addons || []).includes(x.id), topP && !(topP.addons || []).includes(x.id), x.price ? esc(x.price) : '')).join('') : '<p class="mut">Nessun add-on da assegnare.</p>'}</div>
      </div>
      ${a ? `<div class="ag-c"><h4>Sicurezza</h4><small>Verifica in due passaggi: facoltativa, la attiva l'agente dal suo pannello (Sicurezza)</small>
        <div class="sec"><i class="${a.totp ? 'y' : 'n'}">${a.totp ? '✓' : '!'}</i><div><b>${a.totp ? 'Attiva' : 'Non attiva'}</b><small>${a.totp ? 'Se l\'agente perde il telefono puoi azzerarla: entrerà solo con la password.' : 'L\'agente entra con nome utente e password.'}</small></div></div>
        ${a.totp ? '<button class="btn sm" id="agTz" style="margin-top:10px">Azzera verifica in due passaggi</button>' : ''}
        <p class="mut" style="font-size:12px;margin-top:12px">Creato ${esc(fmtD(a.createdAt))} · ultima attività ${esc(a.lastSeen ? ago(a.lastSeen) : 'mai')}</p></div>` : ''}
    </div>`;
    $('#agFt').innerHTML = `${a ? '<button class="btn danger" id="agDel">Elimina agente</button>' : ''}${a && a.active ? '<button class="btn" id="agAssist" title="Entra nel pannello di questo agente per fargli assistenza">🛟 Entra per assistenza</button>' : ''}<div style="flex:1"></div><button class="btn" id="agNo">Annulla</button><button class="btn pri" id="agOk">${isNew ? 'Crea agente' : 'Salva modifiche'}</button>`;
    $('#agAssist') && ($('#agAssist').onclick = () => { if (D.demo) { toast('In demo l\'assistenza non è disponibile', 1); return; } KXAssist.enter(a.id, a.username); });
    $('#agA').onclick = () => $('#agA').classList.toggle('on');
    const saSync = () => { const all = $('#agSa [data-sapp="*"]'); $$('#agSa [data-sapp]').forEach((i) => { if (i.dataset.sapp !== '*') i.closest('label').style.opacity = all && all.checked ? '.45' : ''; }); };
    $('#agSa').onchange = saSync; saSync();
    const aaSync = () => { const all = $('#agAa [data-aapp="*"]'); $$('#agAa [data-aapp]').forEach((i) => { if (i.dataset.aapp !== '*') i.closest('label').style.opacity = all && all.checked ? '.45' : ''; }); };
    $('#agAa') && ($('#agAa').onchange = aaSync); aaSync();
    $('#agSaAdd').onclick = () => { const n = $('#agSaN').value.trim(); if (!n) return; if (!$$('#agSa [data-sapp]').some((i) => i.dataset.sapp.toLowerCase() === n.toLowerCase())) $('#agSa').insertAdjacentHTML('beforeend', chk('sapp', n, esc(n), true, false, '')); else $$('#agSa [data-sapp]').forEach((i) => { if (i.dataset.sapp.toLowerCase() === n.toLowerCase()) i.checked = true; }); const all = $('#agSa [data-sapp="*"]'); if (all) all.checked = false; $('#agSaN').value = ''; saSync(); };
    $('#agPwEye') && ($('#agPwEye').onclick = () => { const i = $('#agPwNow'); i.type = i.type === 'password' ? 'text' : 'password'; });
    $('#agPwCp') && ($('#agPwCp').onclick = () => navigator.clipboard.writeText(a.password).then(() => toast('Password copiata'), () => toast('Copia non consentita', 1)));
    $$('#agR label').forEach((l) => (l.onclick = () => { $$('#agR label').forEach((x) => x.classList.toggle('on', x === l)); $('input', l).checked = true; }));
    if (sub && !top.canAgents) $$('#agR input').forEach((i) => (i.disabled = true));
    $('#agNo').onclick = closePage;
    const read = () => ({
      email: $('#agE').value.trim(), notes: $('#agN').value, active: $('#agA').classList.contains('on'), maxClients: +$('#agM').value || 0,
      canAgents: $('#agR input:checked') ? $('#agR input:checked').value === '1' : false,
      servers: $$('#agS [data-srv]').filter((i) => i.checked).map((i) => i.dataset.srv),
      perms: { ...Object.fromEntries([...FL, ...FP].map(([k]) => [k, !!($(`#agPm [data-perm="${k}"], #agPg [data-perm="${k}"]`) || {}).checked])), maxConn: +$('#agC').value || 1, addons: $$('#agAd [data-ad]').filter((i) => i.checked).map((i) => i.dataset.ad),
        storeApps: $('#agSa [data-sapp="*"]') && $('#agSa [data-sapp="*"]').checked ? ['*'] : $$('#agSa [data-sapp]').filter((i) => i.checked && i.dataset.sapp !== '*').map((i) => i.dataset.sapp),
        appsAllow: $('#agAa [data-aapp="*"]') && $('#agAa [data-aapp="*"]').checked ? ['*'] : $$('#agAa [data-aapp]').filter((i) => i.checked && i.dataset.aapp !== '*').map((i) => i.dataset.aapp) },
    });
    $('#agOk').onclick = async () => {
      const b = read(), pw = $('#agP').value;
      try {
        if (isNew) await api('POST', '/admin/agents', { ...b, username: $('#agU').value.trim(), password: pw });
        else await api('PUT', '/admin/agents/' + a.id, { ...b, ...(pw ? { password: pw } : {}) });
        closePage(); await load(); toast(isNew ? 'Agente creato' : 'Agente aggiornato');
      } catch (e) { toast(e.message, 1); }
    };
    $('#agTz') && ($('#agTz').onclick = async () => {
      if (!(await ask('Azzerare la verifica in due passaggi?', `<b>${esc(a.username)}</b> entrerà solo con la password e potrà riattivarla dal suo pannello.`, 'Azzera'))) return;
      try { await api('PUT', '/admin/agents/' + a.id, { resetTotp: true }); closePage(); await load(); toast('2FA azzerata'); } catch (e) { toast(e.message, 1); }
    });
    $('#agDel') && ($('#agDel').onclick = async () => {
      if (!(await ask('Eliminare l\'agente?', `<b>${esc(a.username)}</b> non potrà più entrare. I suoi ${a.clients} clienti e i suoi sotto-agenti passano a ${a.parentId ? 'chi stava sopra di lui' : 'te'}: nessun cliente smette di funzionare.`, 'Elimina'))) return;
      try { await api('DELETE', '/admin/agents/' + a.id); closePage(); await load(); toast('Agente eliminato'); } catch (e) { toast(e.message, 1); }
    });
    page.classList.add('on'); $('#agB').scrollTop = 0;
  }

  /* ---------- l'agente: scheda cliente semplice (server assegnato + utente e password) ---------- */
  function openClient(d) {
    const isNew = !d, m = me(), P = m.perms || {};
    const e = d ? JSON.parse(JSON.stringify(d)) : { code: '', name: '', notes: '', active: true, expires: addMonths('', 1), playlists: [], maxConn: 1, addons: [] };
    if (!e.playlists.length) e.playlists.push({ serverId: (D.servers[0] || {}).id || '', username: '', password: '' });
    const linked = !!e.parent;
    let appSet = false;
    const adCat = (D.addonCat || []).filter((x) => x.mode === 'some');
    const roPl = !isNew && !P.playlists, roExp = !isNew && !P.renew;
    const plRow = (p, i) => `<div class="pl" data-i="${i}"><div class="row3" style="grid-template-columns:1fr 1fr 1fr auto"><select class="inp" data-k="serverId" ${roPl ? 'disabled' : ''}>${D.servers.map((s) => `<option value="${esc(s.id)}" ${p.serverId === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}${p.serverId || isNew ? '' : '<option value="" selected>' + esc(p.serverName || 'Altro server') + '</option>'}</select>
      <input class="inp" data-k="username" placeholder="Utente" value="${esc(p.username)}" ${roPl ? 'readonly' : ''} autocomplete="off"><input class="inp" data-k="password" type="password" placeholder="${isNew ? 'Password' : 'Password (vuota = invariata)'}" value="" ${roPl ? 'readonly' : ''} autocomplete="new-password">
      ${roPl ? '' : `<button class="icb" data-rm="${i}" title="Togli">✕</button>`}</div></div>`;
    $('#agT').innerHTML = isNew ? 'Nuovo cliente' : `${esc(e.name || e.code)} <span class="code" style="margin-left:6px">${esc(e.code)}</span>`;
    const body = () => `<div class="ag-g">
      <div class="ag-c"><h4>Cliente</h4><small>${isNew ? 'Scrivi il codice che il cliente vede sulla TV quando apre l\'app' : 'Nome e note'}</small>
        ${isNew ? '<label class="lbl">Codice della TV</label><input class="inp mono" id="cCode" placeholder="KXAB-12CD" maxlength="9" style="text-transform:uppercase">' : ''}
        <label class="lbl">${linked ? 'Nome del dispositivo' : 'Nome cliente'}</label><input class="inp" id="cName" maxlength="60" value="${esc(e.name)}" placeholder="es. Mario Rossi">
        <label class="lbl">Note</label><textarea class="inp" id="cNotes" maxlength="500" placeholder="Pagamento, contatto…">${esc(e.notes || '')}</textarea>
        ${linked ? '' : `<label class="lbl">App del cliente</label><select class="inp" id="cApp"><option value="tv">KAIROS TV</option><option value="lite" ${e.app === 'lite' ? 'selected' : ''}>Kairos Lite</option></select>`}</div>
      ${linked ? '' : `<div class="ag-c"><h4>Abbonamento</h4><small>${roExp ? 'Non puoi cambiare la scadenza' : 'Scadenza obbligatoria, massimo 3 anni'}</small>
        <div class="tog ${e.active ? 'on' : ''}" id="cAct" ${!isNew && !P.disable ? 'style="opacity:.5;pointer-events:none"' : ''}><div><b>Servizio attivo</b><small>Se spento il player mostra “dispositivo disattivato”</small></div><i></i></div>
        <label class="lbl">Scadenza</label><input class="inp" type="date" id="cExp" value="${esc(e.expires)}" ${roExp ? 'readonly' : ''}>
        ${roExp ? '' : `<div class="quick">${[1, 3, 6, 12].map((n) => `<button class="btn sm" data-cm="${n}">+${n} ${n === 1 ? 'mese' : 'mesi'}</button>`).join('')}</div>`}
        <label class="lbl">Connessioni (massimo ${P.maxConn || 1})</label><input class="inp" type="number" id="cConn" min="1" max="${P.maxConn || 1}" value="${Math.min(e.maxConn || 1, P.maxConn || 1)}"></div>
      <div class="ag-c" style="grid-column:1/-1"><h4>Linea</h4><small>Scegli il server e scrivi utente e password della linea del cliente</small>
        ${!roPl && window.KXPaste ? `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px"><textarea class="inp mono" id="cPaste" rows="2" style="flex:1;min-width:220px;font-size:12.5px" placeholder="📋 Incolla linea: link M3U o utente e password — riempie utente e password qui sotto"></textarea><button class="btn sm" id="cPasteGo" type="button">Riconosci</button><span id="cPasteMsg" class="mut" style="font-size:12px;width:100%"></span></div>` : ''}
        <div id="cPls">${e.playlists.map(plRow).join('')}</div>${roPl || e.playlists.length >= 10 ? '' : '<button class="btn sm" id="cAddPl">+ Aggiungi linea</button>'}</div>
      ${P.account ? `<div class="ag-c"><h4>Profili e visioni</h4><small>Quanti profili e quante visioni insieme</small>
        <div class="row"><div><label class="lbl">Profili massimi</label><input class="inp" type="number" id="cMaxP" min="0" max="10" value="${e.maxProfiles ?? 3}"></div><div><label class="lbl">Visioni insieme (0 = libere)</label><input class="inp" type="number" id="cMaxS" min="0" max="${P.maxConn || 1}" value="${e.maxStreams || 0}"></div></div></div>` : ''}
      ${P.ai && e.app !== 'lite' ? `<div class="ag-c"><h4>Assistente IA</h4><small>Quale intelligenza artificiale e quante domande al giorno</small>
        <label class="lbl">Intelligenza artificiale</label><select class="inp" id="cAiP"><option value="">Quella predefinita</option><option value="claude" ${e.aiProvider === 'claude' ? 'selected' : ''}>Claude</option><option value="gm" ${e.aiProvider === 'gm' ? 'selected' : ''}>Gemini</option></select>
        <label class="lbl">Domande al giorno</label><input class="inp" type="number" id="cAiL" min="0" max="1000" placeholder="Predefinito" value="${(e.aiLimit ?? -1) >= 0 ? e.aiLimit : ''}">
        ${isNew ? '' : `<button class="btn sm" id="cAiX" style="margin-top:10px">+10 domande extra oggi</button>${e.aiExtra ? `<span class="mut" style="font-size:12px;margin-left:8px">${e.aiExtra} extra disponibili</span>` : ''}`}</div>` : ''}
      ${P.link && !isNew && !linked ? `<div class="ag-c"><h4>Collegare un altro dispositivo</h4><small>Sulla nuova TV il cliente sceglie «Ho già un abbonamento» e scrive il codice (vale 10 minuti)</small><button class="btn" id="cLink">🔗 Genera codice di collegamento</button><div id="cLinkOut" class="mono" style="font-size:22px;margin-top:10px"></div></div>` : ''}
      ${P.players && !isNew && !linked && window.KXPlayers ? `<div class="ag-c" style="grid-column:1/-1" id="cOth"><h4>Altre app</h4><small>Manda le linee di questo cliente anche alle altre app</small>${KXPlayers.box(e)}</div>` : ''}
      ${adCat.length && e.app !== 'lite' ? `<div class="ag-c"><h4>Add-on</h4><small>Temi e skin che puoi assegnare</small><div class="ag-chk">${adCat.map((x) => chk('cad', x.id, esc(x.name), (e.addons || []).includes(x.id), false, x.price ? esc(x.price) : '')).join('')}</div></div>` : ''}`}
    </div>`;
    const sync = () => {
      e.name = $('#cName').value; e.notes = $('#cNotes').value; if ($('#cExp')) e.expires = $('#cExp').value; if ($('#cConn')) e.maxConn = +$('#cConn').value || 1;
      $$('#cPls .pl').forEach((el) => { const p = e.playlists[+el.dataset.i]; $$('[data-k]', el).forEach((i) => (p[i.dataset.k] = i.value)); });
      if ($('.ag-chk [data-cad]')) e.addons = $$('[data-cad]').filter((i) => i.checked).map((i) => i.dataset.cad);
    };
    const draw = () => {
      const code = $('#cCode') ? $('#cCode').value : '';
      $('#agB').innerHTML = body(); if ($('#cCode')) $('#cCode').value = code;
      $('#cApp') && ($('#cApp').onchange = () => { sync(); e.app = $('#cApp').value; appSet = true; draw(); });
      $('#cOth') && KXPlayers.bind($('#cOth'), e, () => { const x = D.devices.find((y) => y.id === e.id); if (x) e.orbix = x.orbix; sync(); draw(); });
      $('#cAct') && ($('#cAct').onclick = () => { e.active = !e.active; $('#cAct').classList.toggle('on', e.active); });
      $$('[data-cm]').forEach((b) => (b.onclick = () => { $('#cExp').value = addMonths($('#cExp').value, +b.dataset.cm); }));
      $('#cAddPl') && ($('#cAddPl').onclick = () => { sync(); e.playlists.push({ serverId: (D.servers[0] || {}).id || '', username: '', password: '' }); draw(); });
      const cPasteGo = async (quiet) => {
        const r = window.KXPaste.parse($('#cPaste').value);
        if (!r || !r.username) { if (!quiet) toast('Incolla il link M3U, o utente e password della linea', 1); return; }
        sync();
        let sv = null;
        // prima prova: abbina il server sull'indirizzo vero (lato server, l'agente non vede gli host)
        if (r.host) { try { const mm = await api('POST', '/admin/match-server', { host: r.host }); if (mm && mm.server) sv = D.servers.find((s) => s.id === mm.server.id) || mm.server; } catch {} }
        // ripiego: abbina per nome del server dentro l'indirizzo
        if (!sv) { const host = (r.host || '').replace(/^https?:\/\//, '').toLowerCase(); sv = D.servers.find((s) => host && String(s.name).length >= 2 && host.includes(String(s.name).toLowerCase())) || null; }
        const p0 = e.playlists[0] || (e.playlists[0] = { serverId: '', username: '', password: '' });
        p0.username = r.username; p0.password = r.password || ''; if (sv) p0.serverId = sv.id;
        draw();
        // la password nel modulo parte sempre vuota: la riempio io, così resta al salvataggio
        const pf = $('#cPls .pl[data-i="0"] [data-k="password"]'); if (pf && r.password) pf.value = r.password;
        const m = $('#cPasteMsg'); if (m) m.innerHTML = sv ? `✓ Riconosciuta · server <b>${esc(sv.name)}</b> · utente <b>${esc(r.username)}</b>` : `✓ Utente <b>${esc(r.username)}</b> inserito · ora scegli il server assegnato qui sotto`;
      };
      $('#cPasteGo') && ($('#cPasteGo').onclick = () => cPasteGo(false));
      $('#cPaste') && $('#cPaste').addEventListener('paste', () => setTimeout(() => cPasteGo(true), 0)); // riconosce da sola appena incolli
      $$('[data-rm]').forEach((b) => (b.onclick = () => { sync(); e.playlists.splice(+b.dataset.rm, 1); draw(); }));
      $('#cAiX') && ($('#cAiX').onclick = async () => { try { await api('POST', '/admin/ai/grant', { deviceId: d.id, n: 10 }); toast('+10 domande extra'); } catch (err) { toast(err.message, 1); } });
      $('#cLink') && ($('#cLink').onclick = async () => { try { const r = await api('POST', '/admin/devices/' + d.id + '/linkcode'); $('#cLinkOut').textContent = r.pin ? r.pin.replace(/(\d{3})(\d{3})/, '$1 $2') : 'Codice non disponibile'; } catch (err) { toast(err.message, 1); } });
    };
    draw();
    $('#agFt').innerHTML = `${!isNew && P.delete ? '<button class="btn danger" id="cDel">Elimina</button>' : ''}${!isNew && P.kick && d.status !== 'pending' ? '<button class="btn" id="cKick">Disconnetti</button>' : ''}<div style="flex:1"></div><button class="btn" id="cNo">Annulla</button><button class="btn pri" id="cOk">${isNew ? 'Attiva cliente' : 'Salva'}</button>`;
    $('#cNo').onclick = closePage;
    $('#cKick') && ($('#cKick').onclick = () => kickDev(d));
    $('#cDel') && ($('#cDel').onclick = async () => {
      if (!(await ask('Eliminare il cliente?', `<b class="mono">${esc(d.code)}</b> verrà rimosso e l'app tornerà alla schermata di attivazione.`, 'Elimina'))) return;
      try { await api('DELETE', '/admin/devices/' + d.id); closePage(); await load(); toast('Eliminato'); } catch (err) { toast(err.message, 1); }
    });
    $('#cOk').onclick = async () => {
      sync();
      const pls = e.playlists.map((p) => ({ id: p.id, serverId: p.serverId, username: p.username, password: p.password }));
      try {
        if (isNew) await api('POST', '/admin/devices', { code: $('#cCode').value.trim().toUpperCase(), name: e.name, notes: e.notes, expires: e.expires, playlists: pls, maxConn: e.maxConn, addons: e.app === 'lite' ? [] : e.addons, app: e.app === 'lite' ? 'lite' : 'tv' });
        else {
          const b = { name: e.name, notes: e.notes, ...(appSet ? { app: e.app } : {}) };
          if (!linked) {
            if (P.renew && e.expires !== d.expires) b.expires = e.expires;
            if (P.disable && e.active !== d.active) b.active = e.active;
            if (P.playlists) b.playlists = pls;
            if (P.account && $('#cMaxP')) { b.maxProfiles = +$('#cMaxP').value || 0; b.maxStreams = +$('#cMaxS').value || 0; }
            if (P.ai && $('#cAiP')) { b.aiProvider = $('#cAiP').value; const v = $('#cAiL').value.trim(); b.aiLimit = v === '' ? -1 : +v; }
            b.maxConn = e.maxConn;
            if ($('.ag-chk [data-cad]')) b.addons = e.addons;
          }
          await api('PUT', '/admin/devices/' + d.id, b);
        }
        closePage(); await load(); toast(isNew ? 'Cliente attivato' : 'Modifiche salvate');
      } catch (err) { toast(err.message, 1); }
    };
    page.classList.add('on'); $('#agB').scrollTop = 0;
  }
  const origOpen = openDrawer, origQuick = openQuick;
  window.openDrawer = openDrawer = function (d, act) { if (isAgent()) return openClient(d); return origOpen(d, act); };
  window.openQuick = openQuick = function (d) { if (isAgent()) return openClient(d); return origQuick(d); };
  $('#newDev').onclick = () => openDrawer(null);

  /* ---------- demo: agenti di esempio e accesso come agente (utente "agente") ---------- */
  if (typeof DEMO !== 'undefined') {
    const t = Date.now();
    const P0 = { create: true, renew: true, disable: true, kick: true, playlists: true, delete: false, clientPerms: false, vpn: false, link: true, account: true, ai: true, dash: true, online: true, errors: false, reports: true, contentReq: false, addonReq: true, messages: true, store: false, storeApps: ['OrbixPlay', 'IBO Player'], storeAll: false, subClients: true, maint: false, dlcodes: true, vod: false, activity: true, addons: ['tema-ghiaccio', 'tema-natale'], maxConn: 2 };
    DEMO.maintAg = { on: false, msg: '', allow: [] };
    DEMO.agents = [
      { id: 2, username: 'mario.rossi', password: 'Mario-2026!', email: 'mario@esempio.it', parentId: 0, maxClients: 50, canAgents: true, perms: P0, servers: ['s1', 's2'], active: true, notes: 'Zona Napoli', lastSeen: t - 40 * 60e3, createdAt: t - 40 * 864e5, totp: true },
      { id: 3, username: 'luca.tv', email: 'luca@esempio.it', parentId: 0, maxClients: 20, canAgents: false, perms: { ...P0, addons: [] }, servers: ['s1'], active: true, notes: '', lastSeen: t - 3 * 3600e3, createdAt: t - 22 * 864e5, totp: false },
      { id: 4, username: 'giulia.stream', email: '', parentId: 2, maxClients: 10, canAgents: false, perms: { ...P0, addons: [] }, servers: ['s2'], active: true, notes: '', lastSeen: t - 2 * 864e5, createdAt: t - 9 * 864e5, totp: false },
      { id: 5, username: 'bar.sport', email: 'info@barsport.it', parentId: 0, maxClients: 5, canAgents: false, perms: P0, servers: [], active: false, notes: 'Sospeso: pagamento', lastSeen: t - 20 * 864e5, createdAt: t - 60 * 864e5, totp: false },
    ];
    DEMO.srv = [{ id: 's1', name: 'NKI', host: 'http://nki.esempio.tv:8080' }, { id: 's2', name: 'ATLX', host: 'http://atlx.esempio.tv' }, { id: 's3', name: 'Riserva', host: 'http://backup.esempio.tv' }];
    DEMO.devices.forEach((d, i) => { if (!d.parent && d.playlists.length) d.ownerId = i % 5 === 1 ? 2 : i % 5 === 3 ? 3 : i % 7 === 2 ? 4 : 0; });
    let demoAgent = false;
    const out = (a) => { const tree = [a.id, ...DEMO.agents.filter((x) => x.parentId === a.id).map((x) => x.id)]; const own = DEMO.devices.filter((d) => !d.parent && d.ownerId === a.id).length;
      return { ...a, serverNames: a.servers.map((s) => (DEMO.srv.find((x) => x.id === s) || {}).name).filter(Boolean), clients: DEMO.devices.filter((d) => !d.parent && tree.includes(d.ownerId)).length, ownClients: own, subAgents: tree.length - 1 }; };
    const origDemo = demoApi;
    window.demoApi = demoApi = async function (m, p, b) {
      if (p === '/admin/login') { demoAgent = /^agente/i.test((b && b.user) || ''); return { ok: true, user: demoAgent ? 'mario.rossi' : b.user || 'admin', role: demoAgent ? 'agent' : 'owner' }; }
      if (p === '/admin/dns' && m === 'GET') return { saved: DEMO.srv, hosts: [], byDev: {} };
      if (p === '/admin/match-server') { const h = (b.host || '').replace(/^https?:\/\//, '').toLowerCase(); const sv = DEMO.srv.find((s) => s.host && h === s.host.replace(/^https?:\/\//, '').replace(/[:/].*$/, '').toLowerCase()); return { server: sv ? { id: sv.id, name: sv.name } : null }; }
      if (p === '/admin/state') {
        const r = await origDemo(m, p, b);
        if (!demoAgent) return { ...r, role: 'owner', agents: DEMO.agents.map(out), storeAppNames: ['IBO Player', 'IboOne', 'OrbixPlay', 'Smarters Pro', 'TiviMate'], maintAg: DEMO.maintAg.on ? [2] : [] };
        const A = DEMO.agents[0], tree = [2, 4];
        const devs = r.devices.filter((d) => tree.includes(d.ownerId) || (d.parent && r.devices.some((x) => x.id === d.parent && tree.includes(x.ownerId))))
          .map((d) => ({ ...d, playlists: d.playlists.map((pl, i) => ({ id: pl.id, name: pl.name, type: 'xtream', serverId: i % 2 ? 's2' : 's1', serverName: i % 2 ? 'ATLX' : 'NKI', username: 'cliente' + d.id, password: 'xxxx' })) }));
        return { role: 'agent', user: A.username, me: { ...out(A), clientsUsed: out(A).clients }, devices: devs, agents: DEMO.agents.filter((x) => x.parentId === 2).map(out), servers: DEMO.srv.slice(0, 2).map(({ id, name }) => ({ id, name })),
          addonCat: addonCatNow().filter((x) => A.perms.addons.includes(x.id) && x.mode === 'some'), settings: { brand: r.settings.brand, accent: r.settings.accent, downloaderCode: r.settings.downloaderCode || '', storeDownloaderCode: r.settings.storeDownloaderCode || '', apkUrl: r.settings.apkUrl || '' }, security: { totp: true }, activity: [], messages: [], counts: {}, dlCodes: A.perms.dlcodes ? r.dlCodes : [], storeAppNames: ['IBO Player', 'OrbixPlay'], maint: A.perms.maint ? { ...DEMO.maintAg } : null, players: A.perms.players ? (() => { const c = DEMO.settings.playersCfg || { orbix: [{ name: 'Principale', host: 'http://dns.kairos-esempio.tv:8080' }], max: [] }, v = (l) => (l || []).map((x) => (c.showDnsAgents ? { name: x.name, host: x.host } : { name: x.name })); return { orbix: true, max: true, dns: { orbix: v(c.orbix), max: v(c.max) }, codes: c.codes || { orbix: '265847', max: '265847' }, slots: (c.slots || [{ id: 'nki-max', name: 'NKI', app: 'max', link: '', code: '265847' }, { id: 'armada-max', name: 'Armada', app: 'max', link: '', code: '265847' }, { id: 'nki-orbix', name: 'NKI', app: 'orbix', link: '', code: '265847' }]).map((x) => ({ ...x, link: '' })) }; })() : null };
      }
      if (p === '/admin/agent-maint' && m === 'PUT') { DEMO.maintAg = { on: !!b.on, msg: b.msg || '', allow: b.allow || [] }; return { ...DEMO.maintAg }; }
      if (/^\/admin\/agent-maint\/\d+$/.test(p) && m === 'DELETE') { DEMO.maintAg = { on: false, msg: '', allow: [] }; return { ok: true }; }
      if (p === '/admin/agents' && m === 'POST') {
        if (!b.username || !b.password || b.password.length < 10) throw new Error('Nome utente e password (almeno 10 caratteri)');
        const id = Math.max(...DEMO.agents.map((x) => x.id)) + 1; DEMO.agents.push({ id, username: b.username, email: b.email || '', parentId: demoAgent ? 2 : 0, maxClients: b.maxClients || 10, canAgents: !!b.canAgents, perms: b.perms, servers: b.servers || [], active: b.active !== false, notes: b.notes || '', lastSeen: 0, createdAt: Date.now(), totp: false });
        return { ok: true, id };
      }
      const am = p.match(/^\/admin\/agents\/(\d+)$/);
      if (am) {
        const a = DEMO.agents.find((x) => x.id === +am[1]);
        if (m === 'DELETE') { DEMO.agents = DEMO.agents.filter((x) => x !== a); DEMO.devices.forEach((d) => { if (d.ownerId === a.id) d.ownerId = a.parentId; }); DEMO.agents.forEach((x) => { if (x.parentId === a.id) x.parentId = a.parentId; }); return { ok: true }; }
        const { password, resetTotp, ...rest } = b; Object.assign(a, rest); if (resetTotp) a.totp = false; return { ok: true };
      }
      if (demoAgent && p === '/admin/devices' && m === 'POST') { const r = await origDemo(m, p, { ...b, active: true, playlists: (b.playlists || []).map((x) => ({ name: 'Linea', type: 'xtream', host: 'http://nki.esempio.tv:8080', username: x.username, password: x.password })) }); const d = DEMO.devices.find((x) => x.code === b.code) || DEMO.devices[0]; d.ownerId = 2; return r; }
      if (b && b.ownerId !== undefined) { const dm = p.match(/^\/admin\/devices\/(.+)$/); const d = dm && DEMO.devices.find((x) => x.id === dm[1]); if (d) d.ownerId = b.ownerId; const { ownerId, ...rest } = b; b = rest; }
      if (demoAgent && b && b.playlists) { const { playlists, ...r } = b; b = r; }
      return origDemo(m, p, b);
    };
  }
  /* «Entra per assistenza»: il titolare opera nel pannello di un suo agente. Un banner fisso lo ricorda e permette di uscire.
     Tutte le richieste portano l'header X-Assist (vedi api() in app.js); le azioni restano registrate come assistenza. */
  function assistBanner(name) {
    let b = document.getElementById('assistBar');
    if (!b) { b = document.createElement('div'); b.id = 'assistBar'; b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:linear-gradient(90deg,#b45309,#d97706);color:#fff;display:flex;align-items:center;gap:12px;padding:9px 16px;font-size:13.5px;font-weight:600;box-shadow:0 2px 12px #0007'; document.body.appendChild(b); }
    b.innerHTML = `🛟 Stai assistendo l'agente <b>${esc(name)}</b> — ogni modifica agisce sul <b>suo</b> pannello<span style="flex:1"></span><button class="btn sm" id="assistOut" style="background:#fff;color:#92400e;font-weight:700">Esci dall'assistenza</button>`;
    document.body.style.paddingTop = '42px';
    document.getElementById('assistOut').onclick = () => KXAssist.exit();
  }
  const KXAssist = (window.KXAssist = {
    on: () => !!window.__assist,
    enter(id, name) { window.__assist = id; closePage(); assistBanner(name); toast('Entrato nel pannello di ' + name); load().catch(() => { toast('Assistenza non riuscita', 1); KXAssist.exit(); }); },
    exit() { if (!window.__assist) return; window.__assist = null; const b = document.getElementById('assistBar'); if (b) b.remove(); document.body.style.paddingTop = ''; load(); toast('Uscito dall\'assistenza'); },
  });

  layoutMenu();
  if ($('#app').classList.contains('on')) renderAll();
})();
