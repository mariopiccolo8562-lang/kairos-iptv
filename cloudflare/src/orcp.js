/* ---------------- Pannello ORCP (cp.ottrun.com): l'app brandizzata OTTRUN del titolare (es. MirkoTeam) ----------------
   ORCP non ha una chiave API e il login ha la verifica «sono umano»: KAIROS non entra da solo e non la aggira.
   Il titolare entra su ORCP una volta (con «Remember me») e passa a KAIROS i cookie di accesso, che restano cifrati in
   settings 'orcp:ses'. Il cookie «remember» vale mesi e rinnova da solo la sessione (2 ore, scorrevole). KAIROS usa le
   stesse richieste del pannello web: connessioni, messaggi agli utenti, annuncio, manutenzione, PIN parentale, portali.
   Solo il titolare (Master). 'orcp:cfg' (non segreto): nome app e quale server dell'app corrisponde a ogni pannello KAIROS. */
const BASE = 'https://cp.ottrun.com';
const K = 'orcp:ses', KC = 'orcp:cfg';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const PANELS = ['wolf', 'armada', 'atx', 'ro', 'slt'];
const mem = {};
const setRow = (env, k, v) => env.DB.prepare('INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind(k, v).run();
const getRow = async (env, k) => ((await env.DB.prepare('SELECT v FROM settings WHERE k = ?').bind(k).first()) || {}).v || '';
const delRow = (env, k) => env.DB.prepare('DELETE FROM settings WHERE k = ?').bind(k).run();
const unent = (s) => String(s || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ');
const txtOf = (h) => unent(String(h || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const attr = (t, n) => { const m = String(t).match(new RegExp('\\s' + n + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\')', 'i')); return m ? unent(m[1] != null ? m[1] : m[2]) : ''; };
const inputVal = (h, name) => { const m = String(h).match(new RegExp('<input\\b[^>]*\\bname=["\']' + name + '["\'][^>]*>', 'i')); return m ? attr(m[0], 'value') : ''; };
const selectVal = (h, name) => { const m = String(h).match(new RegExp('<select\\b[^>]*\\bname=["\']' + name + '["\'][^>]*>([\\s\\S]*?)<\\/select>', 'i')); if (!m) return ''; const o = m[1].match(/<option\b[^>]*\bselected\b[^>]*>/i); return o ? attr(o[0], 'value') : ''; };
const selectOpts = (h, name) => { const m = String(h).match(new RegExp('<select\\b[^>]*\\bname=["\']' + name + '["\'][^>]*>([\\s\\S]*?)<\\/select>', 'i')); return m ? [...m[1].matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi)].map((o) => ({ v: attr(o[1], 'value'), t: txtOf(o[2]) })) : []; };
const csrf = (h) => inputVal(h, '_token') || attr((String(h).match(/<meta[^>]+name="csrf-token"[^>]*>/i) || [''])[0], 'content');
const rows = (h) => [...String(h).matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => ({ html: m[1], cells: [...m[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => c[1]) })).filter((r) => r.cells.length);
const isLogin = (r) => r.status === 302 && /\/login(?:$|\?)/.test(r.loc) || (r.status === 200 && /<form[^>]+action="[^"]*\/login"/i.test(r.txt) && /name="password"/i.test(r.txt));
const cookieHeader = (jar) => Object.entries(jar || {}).map(([k, v]) => `${k}=${v}`).join('; ');
function eatCookies(jar, res) {
  const list = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : (res.headers.get('set-cookie') || '').split(/,(?=\s*[A-Za-z0-9_-]+=)/);
  for (const c of list) { const m = c.match(/^\s*([^=;\s]+)=([^;]*)/); if (m) { if (/^\s*max-age=0|expires=Thu, 01 Jan 1970/i.test(c.slice(m[0].length))) delete jar[m[1]]; else jar[m[1]] = m[2]; } }
}
/** i cookie incollati/passati: accetta «a=b; c=d», una riga per cookie o una tabella copiata (nome<tab>valore) */
function parseCookies(s) {
  const jar = {};
  for (const m of String(s || '').matchAll(/(remember_web_[A-Za-z0-9]+|orcp_ottrun_control_panel_session|XSRF-TOKEN)[=\s:]+\s*([A-Za-z0-9%+/=._-]{20,})/g)) jar[m[1]] = m[2];
  return jar;
}
const remOf = (jar) => Object.keys(jar || {}).find((k) => k.startsWith('remember_web_')) || '';

async function loadSes(env, H) {
  if (mem.ses !== undefined) return mem.ses;
  let s = null; try { const v = await getRow(env, K); s = v ? await H.unseal(env, v) : null; } catch { s = null; }
  return (mem.ses = s && s.jar ? s : null);
}
async function saveSes(env, H, s) { mem.ses = s; await setRow(env, K, await H.seal(env, s)); }
async function cfgOf(env) { if (mem.cfg) return mem.cfg; let c = {}; try { c = JSON.parse((await getRow(env, KC)) || '{}') || {}; } catch { c = {}; } return (mem.cfg = cfgNorm(c)); }
function cfgNorm(c) { const map = {}; for (const p of PANELS) map[p] = typeof (c.map || {})[p] === 'string' ? c.map[p].slice(0, 60) : ''; return { name: typeof c.name === 'string' && c.name.trim() ? c.name.trim().slice(0, 40) : '', map }; }

/** richiesta a ORCP con i cookie salvati; se la sessione è scaduta il cookie «remember» ne apre una nuova (senza login) */
async function orcp(env, H, path, o = {}) {
  const s = await loadSes(env, H); if (!s) throw new H.HttpErr(400, 'ORCP non è collegato: entra su cp.ottrun.com e passa l\'accesso a KAIROS (scheda «Collega»)');
  const go = async () => {
    const headers = { 'User-Agent': UA, Accept: o.ajax ? 'application/json, text/plain, */*' : 'text/html,application/xhtml+xml,*/*;q=0.8', 'Accept-Language': 'it-IT,it;q=0.9,en;q=0.8', Cookie: cookieHeader(s.jar), Referer: BASE + (o.ref || '/home') };
    if (o.ajax) headers['X-Requested-With'] = 'XMLHttpRequest';
    let body; if (o.form) { headers['Content-Type'] = 'application/x-www-form-urlencoded'; const u = new URLSearchParams(); for (const [k, v] of Object.entries(o.form)) if (v != null) u.append(k, String(v)); body = u.toString(); }
    let r; try { r = await fetch(BASE + path, { method: o.form ? 'POST' : 'GET', headers, body, redirect: 'manual' }); } catch { throw new H.HttpErr(502, 'ORCP non risponde: riprova tra poco'); }
    eatCookies(s.jar, r);
    const txt = await r.text(); let j = null; if (o.ajax) { try { j = JSON.parse(txt); } catch {} }
    return { status: r.status, txt, j, loc: r.headers.get('location') || '' };
  };
  let r = await go();
  if (isLogin(r) || (o.ajax && r.status === 403)) {
    const rem = remOf(s.jar);
    if (rem) { s.jar = { [rem]: s.jar[rem] }; await go().catch(() => {}); r = await go(); } // il remember apre una sessione nuova
    if (isLogin(r) || (o.ajax && r.status === 403)) { s.bad = 1; await saveSes(env, H, s).catch(() => {}); throw new H.HttpErr(401, 'L\'accesso a ORCP è scaduto: entra su cp.ottrun.com (con «Remember me») e passa di nuovo l\'accesso a KAIROS'); }
  }
  if (s.bad) delete s.bad;
  await saveSes(env, H, s).catch(() => {});
  return r;
}
/** POST di un modulo Laravel: prende il _token dalla pagina del modulo; ORCP risponde con un redirect quando va bene */
async function post(env, H, pagePath, action, form) {
  const pg = await orcp(env, H, pagePath); const tok = csrf(pg.txt);
  if (!tok) throw new H.HttpErr(502, 'ORCP: pagina del modulo non riconosciuta');
  // appid/customerid: se la pagina del modulo li ha (anche cifrati), valgono quelli
  for (const k of ['appid', 'customerid']) { if (k in form) { const v = inputVal((pg.txt.match(new RegExp('<form[^>]+action="[^"]*' + action.replace(/\//g, '\\/') + '"[\\s\\S]*?<\\/form>', 'i')) || [pg.txt])[0], k); if (v) form[k] = v; } }
  const r = await orcp(env, H, action, { form: { _token: tok, ...form }, ref: pagePath });
  if (r.status === 419) throw new H.HttpErr(502, 'ORCP: sessione del modulo scaduta, riprova');
  if (r.status >= 400) throw new H.HttpErr(502, `ORCP ha risposto ${r.status}`);
  if (r.status === 200 && /alert-danger|invalid|error/i.test(txtOf((r.txt.match(/<main[\s\S]*<\/main>/i) || [''])[0]).slice(0, 2000))) throw new H.HttpErr(400, 'ORCP non ha accettato i dati: ' + txtOf((r.txt.match(/class="alert[^"]*"[^>]*>([\s\S]*?)<\/div>/i) || ['', ''])[1]).slice(0, 160));
  return r;
}

/* ---------- letture ---------- */
async function appInfo(env, H, force) {
  const s = await loadSes(env, H); if (!s) return null;
  if (s.app && !force && Date.now() - (s.app.at || 0) < 6 * 3600e3) return s.app;
  const home = await orcp(env, H, '/home');
  const myapps = (home.txt.match(/href="(?:https:\/\/cp\.ottrun\.com)?(\/myapps\/[A-Za-z0-9%=._-]+)"/) || [])[1] || '';
  const user = txtOf((home.txt.match(/Welcome\s*<[^>]*>([\s\S]*?)<\/(?:b|strong|span)>/i) || ['', ''])[1]) || txtOf((home.txt.match(/Welcome([\s\S]{0,120}?)<\/div>/i) || ['', ''])[1]);
  const app = { at: Date.now(), user: user.slice(0, 80), myapps, settings: '', appid: '', customerid: '', name: '', version: '', expires: '', apk: '' };
  if (myapps) {
    const ma = await orcp(env, H, myapps);
    app.settings = (ma.txt.match(/href="(?:https:\/\/cp\.ottrun\.com)?(\/appsettings\/[A-Za-z0-9%=._-]+)"/) || [])[1] || '';
    const t = txtOf((ma.txt.match(/<main[\s\S]*<\/main>/i) || [ma.txt])[0]);
    app.name = (t.match(/App Name:?\s*([^\s]+(?: [^\s]+)?)\s+(?:Version|App ID|Package)/i) || t.match(/\b([A-Za-z][\w-]{2,30})\s+Version:?\s*[\d.]/i) || ['', ''])[1].trim().slice(0, 40);
    app.version = (t.match(/Version:?\s*([\w.-]+)/i) || ['', ''])[1].slice(0, 40);
    app.expires = (t.match(/Expir\w*:?\s*(\d{4}-\d\d-\d\d|\d\d\/\d\d\/\d{4})/i) || ['', ''])[1];
  }
  if (app.settings) {
    const st = await orcp(env, H, app.settings);
    app.appid = inputVal(st.txt, 'appid'); app.customerid = inputVal(st.txt, 'customerid'); app.apk = inputVal(st.txt, 'apkurl_ext').slice(0, 300);
    if (!app.name) { const o = selectOpts(st.txt, 'select_app')[0]; if (o) app.name = o.t.slice(0, 40); }
  }
  if (!app.appid) { const am = await orcp(env, H, '/addmesview'); const o = selectOpts(am.txt, 'select_app').find((x) => /^\d+$/.test(x.v)); if (o) { app.appid = o.v; if (!app.name) app.name = o.t.slice(0, 40); } app.customerid = app.customerid || inputVal(am.txt, 'customerid'); }
  s.app = app; await saveSes(env, H, s).catch(() => {});
  return app;
}
const devOf = (agent) => { const m = String(agent || '').match(/Android\s*([\d.]+);\s*([^;)]+?)\s*(?:Build|\))/i); return m ? `${m[2].trim()} · Android ${m[1]}` : String(agent || '').slice(0, 60); };
async function connections(env, H) {
  const r = await orcp(env, H, '/getallconnectionsforajax', { ajax: true, ref: '/connectionsdetails' });
  const list = Array.isArray(r.j) ? r.j : r.j && typeof r.j === 'object' ? Object.values(r.j).filter((x) => x && typeof x === 'object' && 'userid' in x) : [];
  return list.map((x) => ({ id: String(x.id ?? ''), user: String(x.userid ?? '').slice(0, 120), app: String(x.appname ?? '').slice(0, 40), online: /^(yes|1|true)$/i.test(String(x.online ?? '')), last: String(x.time_last_online ?? '').slice(0, 19), ip: String(x.ip ?? '').slice(0, 64), device: devOf(x.agent), version: String(x.version ?? '').slice(0, 40), did: String(x.did ?? '').slice(0, 120) }));
}
/* ORCP è lento (connessioni ~20 s, versioni ~10 s): le versioni restano in cache 6 ore, le connessioni 60 secondi */
async function versions(env, H) {
  const s = await loadSes(env, H); if (s && s.vers && Date.now() - s.vers.at < 6 * 3600e3) return s.vers.list;
  const r = await orcp(env, H, '/getversions'); const list = rows(r.txt).map((x) => ({ count: +txtOf(x.cells[0]).replace(/\D/g, '') || 0, version: txtOf(x.cells[1]) })).filter((x) => x.version).slice(0, 40);
  if (s) { s.vers = { at: Date.now(), list }; await saveSes(env, H, s).catch(() => {}); }
  return list;
}
async function portals(env, H) {
  const app = await appInfo(env, H); if (!app || !app.settings) throw new H.HttpErr(502, 'ORCP: pagina delle impostazioni dell\'app non trovata');
  const st = await orcp(env, H, app.settings), h = st.txt, list = [];
  for (let i = 1; i <= 5; i++) { const k = i === 1 ? 'portal' : 'portal' + i; list.push({ k, name: inputVal(h, k + '_name').slice(0, 60), url: inputVal(h, k).slice(0, 200) }); }
  return { list, vod: inputVal(h, 'portal_vod'), series: inputVal(h, 'portal_series'), ovpn: inputVal(h, 'ovpn_url'), apk: inputVal(h, 'apkurl_ext').slice(0, 300), support: { email: inputVal(h, 'support_email').slice(0, 120), phone: inputVal(h, 'support_phone').slice(0, 40) } };
}
const idOf = (html) => inputVal(html, 'id') || inputVal(html, 'announcementid');
const tblRows = (h) => rows(h).filter((x) => x.cells.length >= 4);
async function messages(env, H) {
  const r = await orcp(env, H, '/messages');
  return tblRows(r.txt).map((x) => ({ id: idOf(x.html) || txtOf(x.cells[0]), user: txtOf(x.cells[2]), app: txtOf(x.cells[3]), text: txtOf(x.cells[4]), status: txtOf(x.cells[5]), viewed: /yes/i.test(txtOf(x.cells[6])), expire: txtOf(x.cells[7]).slice(0, 19) })).filter((x) => x.id && x.user && !/^(ID|OWNER)$/i.test(x.user));
}
/** ORCP: nella tabella l'id è cifrato; il modulo di modifica (POST /edit…) ha l'id in chiaro che serve all'aggiornamento */
async function editForm(env, H, page, action, idField, id) { const r = await orcp(env, H, page); const ed = await orcp(env, H, action, { form: { _token: csrf(r.txt), [idField]: id }, ref: page }); return ed.txt; }
async function oneOf(env, H, page, idField, action) {
  const r = await orcp(env, H, page); const row = tblRows(r.txt)[0]; if (!row) return null;
  const rowId = idOf(row.html) || txtOf(row.cells[0]); const ed = await orcp(env, H, action, { form: { _token: csrf(r.txt), [idField]: rowId }, ref: page });
  return { id: inputVal(ed.txt, 'id') || txtOf(row.cells[0]), row, form: ed.txt };
}
async function announcement(env, H) {
  const o = await oneOf(env, H, '/announcement', 'announcementid', '/editann'); if (!o) return null;
  return { id: o.id, text: inputVal(o.form, 'announcement'), status: selectVal(o.form, 'select_status') || txtOf(o.row.cells[3]), expire: inputVal(o.form, 'expire') || txtOf(o.row.cells[7]), interval: selectVal(o.form, 'interval') || txtOf(o.row.cells[5]), disappear: selectVal(o.form, 'disappear') || txtOf(o.row.cells[6]), intervals: selectOpts(o.form, 'interval').map((x) => x.v), disappears: selectOpts(o.form, 'disappear').map((x) => x.v) };
}
async function maintenance(env, H) {
  const o = await oneOf(env, H, '/maintenance', 'id', '/editman'); if (!o) return null;
  return { id: o.id, text: inputVal(o.form, 'message'), status: selectVal(o.form, 'select_status') || txtOf(o.row.cells[3]), expire: inputVal(o.form, 'expire') || txtOf(o.row.cells[4]) };
}
const dateIn = (v, H) => { const s = String(v || '').trim(); if (!s) return ''; const m = s.match(/^(\d{4})-(\d\d)-(\d\d)(?:[ T](\d\d):(\d\d))?/); if (!m) throw new H.HttpErr(400, 'Data non valida (usa AAAA-MM-GG)'); return `${m[1]}-${m[2]}-${m[3]}`; }; // ORCP vuole solo la data (Year-Month-Day)
const stIn = (v) => /^(active|on|1|true|sì|si)$/i.test(String(v || '')) ? 'ACTIVE' : 'INACTIVE';

export async function orcpRoutes(req, env, path, who, ip, H) {
  const m = req.method, { HttpErr, json, str } = H;
  const ids = async () => { const a = await appInfo(env, H); if (!a || !a.appid) throw new HttpErr(502, 'ORCP: app non riconosciuta'); return a; };
  if (path === '/orcp/state' && m === 'GET') {
    const s = await loadSes(env, H), cfg = await cfgOf(env);
    if (!s) return json({ connected: false, cfg });
    let app = s.app || null; if (!app && !s.bad) { try { app = await appInfo(env, H); } catch {} }
    const remember = !!remOf(s.jar);
    return json({ connected: true, expired: !!s.bad, remember, at: s.at || 0, user: app ? app.user : '', app: app ? { name: app.name || cfg.name, version: app.version, expires: app.expires, apk: app.apk, id: app.appid } : null, cfg: { ...cfg, name: cfg.name || (app && app.name) || '' } });
  }
  if (path === '/orcp/session' && m === 'PUT') {
    const b = await H.readJSON(req, 16384), jar = parseCookies(str(b.cookies, 12000));
    if (!remOf(jar) && !jar.orcp_ottrun_control_panel_session) throw new HttpErr(400, 'Non trovo i cookie di ORCP: servono «remember_web_…» (con «Remember me») o «orcp_ottrun_control_panel_session»');
    mem.ses = { jar, at: Date.now() }; mem.cfg = null;
    let app; try { app = await appInfo(env, H, true); } catch (e) { mem.ses = null; throw e instanceof HttpErr ? new HttpErr(400, 'ORCP non riconosce questo accesso: rientra su cp.ottrun.com con «Remember me» e ripassa i cookie') : e; }
    await saveSes(env, H, { ...mem.ses, app });
    if (!remOf(jar)) await H.log(env, 'edit', `${who}: ORCP collegato senza «Remember me» (l'accesso durerà circa 2 ore)`, ip).catch(() => {});
    else await H.log(env, 'edit', `${who}: pannello ORCP collegato (${app.name || 'app'})`, ip).catch(() => {});
    return json({ ok: true, remember: !!remOf(jar), app: { name: app.name, version: app.version, expires: app.expires } });
  }
  if (path === '/orcp/session' && m === 'DELETE') { mem.ses = null; mem.conns = null; await delRow(env, K); await H.log(env, 'edit', `${who}: pannello ORCP scollegato`, ip).catch(() => {}); return json({ ok: true }); }
  if (path === '/orcp/cfg' && m === 'GET') { const cfg = await cfgOf(env); const s = await loadSes(env, H); return json({ cfg: { ...cfg, name: cfg.name || (s && s.app && s.app.name) || '' }, servers: s && s.servers ? s.servers : [] }); }
  if (path === '/orcp/cfg' && m === 'PUT') {
    const b = await H.readJSON(req, 8192), cfg = cfgNorm({ name: b.name, map: b.map });
    mem.cfg = cfg; await setRow(env, KC, JSON.stringify(cfg));
    await H.log(env, 'settings', `${who}: ORCP, abbinamento server ↔ pannelli aggiornato`, ip).catch(() => {});
    return json({ cfg });
  }
  if (path === '/orcp/data' && m === 'GET') {
    const w = new URL(req.url).searchParams.get('w') || '';
    if (w === 'conns') {
      if (!mem.conns || Date.now() - mem.conns.at > 60e3 || new URL(req.url).searchParams.get('fresh')) { const [list, vers] = await Promise.all([connections(env, H), versions(env, H).catch(() => [])]); mem.conns = { at: Date.now(), list, vers }; }
      const c = mem.conns; return json({ list: c.list, online: c.list.filter((x) => x.online).length, versions: c.vers, at: c.at });
    }
    if (w === 'portals') { const p = await portals(env, H); const s = await loadSes(env, H); if (s) { s.servers = p.list.filter((x) => x.name || x.url).map((x) => x.name || x.url); await saveSes(env, H, s).catch(() => {}); } return json(p); }
    if (w === 'messages') return json({ list: await messages(env, H) });
    if (w === 'ann') return json({ ann: await announcement(env, H) });
    if (w === 'maint') return json({ maint: await maintenance(env, H) });
    if (w === 'app') return json({ app: await appInfo(env, H, true) });
    throw new HttpErr(400, 'Sezione ORCP sconosciuta');
  }
  if (path === '/orcp/portals' && m === 'PUT') {
    const b = await H.readJSON(req, 8192), app = await ids(), cur = await portals(env, H), form = { appid: app.appid, customerid: app.customerid, portal_vod: cur.vod, portal_series: cur.series, ovpn_url: cur.ovpn };
    const list = Array.isArray(b.list) ? b.list : [];
    for (const p of cur.list) { const n = list.find((x) => x && x.k === p.k) || {}; const url = str(n.url !== undefined ? n.url : p.url, 200).trim(); if (url && !/^(https?:\/\/)?[\w.-]+(:\d+)?(\/.*)?$/i.test(url)) throw new HttpErr(400, `Indirizzo non valido per ${n.name || p.name || p.k}`); form[p.k + '_name'] = str(n.name !== undefined ? n.name : p.name, 60).trim(); form[p.k] = url; }
    await post(env, H, app.settings, '/updateportals', form);
    await H.log(env, 'edit', `${who}: ORCP, portali dell'app aggiornati`, ip).catch(() => {});
    return json(await portals(env, H));
  }
  if (path === '/orcp/messages' && m === 'POST') {
    const b = await H.readJSON(req, 8192), app = await ids(), user = str(b.user, 120).trim(), text = str(b.text, 500).trim();
    if (!user || !text) throw new HttpErr(400, 'Scrivi l\'utente della linea e il messaggio');
    await post(env, H, '/addmesview', '/addmessage', { select_app: app.appid, message: text, userid: user, select_status: stIn(b.status === undefined ? 'ACTIVE' : b.status), expire: dateIn(b.expire, H) || new Date(Date.now() + 30 * 86400e3).toISOString().slice(0, 10), customerid: app.customerid });
    await H.log(env, 'edit', `${who}: ORCP, messaggio inviato all'utente ${user}`, ip).catch(() => {});
    return json({ list: await messages(env, H) });
  }
  const mm = path.match(/^\/orcp\/messages\/([A-Za-z0-9%=._-]{1,400})$/);
  if (mm && m === 'PUT') {
    const b = await H.readJSON(req, 8192), app = await ids(), user = str(b.user, 120).trim(), text = str(b.text, 500).trim();
    if (!user || !text) throw new HttpErr(400, 'Scrivi l\'utente della linea e il messaggio');
    const plainId = inputVal(await editForm(env, H, '/messages', '/editmes', 'id', decodeURIComponent(mm[1])), 'id'); if (!plainId) throw new HttpErr(404, 'Messaggio non trovato su ORCP');
    await post(env, H, '/messages', '/updatemessage', { id: plainId, appid: app.appid, customerid: app.customerid, select_app: app.appid, message: text, userid: user, select_status: stIn(b.status), expire: dateIn(b.expire, H) });
    await H.log(env, 'edit', `${who}: ORCP, messaggio modificato`, ip).catch(() => {});
    return json({ list: await messages(env, H) });
  }
  if (mm && m === 'DELETE') { await post(env, H, '/messages', '/delmes', { id: decodeURIComponent(mm[1]) }); await H.log(env, 'edit', `${who}: ORCP, messaggio eliminato`, ip).catch(() => {}); return json({ list: await messages(env, H) }); }
  if (path === '/orcp/ann' && m === 'PUT') {
    const b = await H.readJSON(req, 8192), app = await ids(), cur = await announcement(env, H); if (!cur) throw new HttpErr(502, 'ORCP: nessun annuncio da modificare');
    const text = str(b.text, 500).trim(); if (!text) throw new HttpErr(400, 'Scrivi il testo dell\'annuncio');
    await post(env, H, '/announcement', '/updateann', { id: cur.id, appid: app.appid, customerid: app.customerid, select_app: app.appid, announcement: text, select_status: stIn(b.status), expire: dateIn(b.expire, H) || cur.expire, interval: String(parseInt(b.interval, 10) || cur.interval || 15), disappear: String(parseInt(b.disappear, 10) || cur.disappear || 1) });
    await H.log(env, 'edit', `${who}: ORCP, annuncio ${stIn(b.status) === 'ACTIVE' ? 'acceso' : 'spento'}`, ip).catch(() => {});
    return json({ ann: await announcement(env, H) });
  }
  if (path === '/orcp/maint' && m === 'PUT') {
    const b = await H.readJSON(req, 8192), app = await ids(), cur = await maintenance(env, H); if (!cur) throw new HttpErr(502, 'ORCP: nessun avviso di manutenzione da modificare');
    const text = str(b.text, 500).trim(); if (!text) throw new HttpErr(400, 'Scrivi il testo dell\'avviso');
    await post(env, H, '/maintenance', '/updateman', { id: cur.id, appid: app.appid, customerid: app.customerid, select_app: app.appid, message: text, select_status: stIn(b.status), expire: dateIn(b.expire, H) || cur.expire });
    await H.log(env, 'edit', `${who}: ORCP, manutenzione ${stIn(b.status) === 'ACTIVE' ? 'accesa' : 'spenta'}`, ip).catch(() => {});
    return json({ maint: await maintenance(env, H) });
  }
  if (path === '/orcp/parental' && m === 'POST') {
    const b = await H.readJSON(req, 2048), code = str(b.code, 40).trim(); if (!code) throw new HttpErr(400, 'Scrivi il codice che compare nell\'app');
    const r = await post(env, H, '/parentalpasswordview', '/resetparentalpassword', { mastercode: code });
    let page = r; if (r.status === 302) page = await orcp(env, H, r.loc.startsWith('http') ? new URL(r.loc).pathname : (r.loc || '/parentalpasswordview'));
    const t = txtOf((page.txt.match(/<main[\s\S]*<\/main>/i) || [page.txt])[0]);
    const pin = (t.match(/(?:master\s*(?:code|pin)|pin)\s*(?:is|:)?\s*([A-Za-z0-9]{4,12})\b/i) || [])[1] || (t.match(/\b(\d{4,8})\b(?![^]*\b\d{4,8}\b)/) || [])[1] || '';
    await H.log(env, 'edit', `${who}: ORCP, PIN parentale generato`, ip).catch(() => {});
    return json({ pin, text: t.replace(/Parental Password Reset.*?Generate Master Code/i, '').trim().slice(0, 300) });
  }
  return null;
}
