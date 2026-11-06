import { connect } from 'cloudflare:sockets';
/* ---------------- WOLF: pannello reseller collegato a KAIROS ----------------
   WOLF non ha API: il Worker entra con utente e password del titolare (come dal browser) e usa le stesse richieste
   della pagina «Lines». Le linee non vengono copiate: la sezione «WOLF» del pannello legge e scrive su WOLF, così
   i due pannelli mostrano sempre gli stessi dati. Una linea si può collegare a un cliente KAIROS: se su WOLF (o da
   KAIROS) cambiano utente o password, la playlist del cliente si aggiorna da sola.
   Credenziali e cookie di WOLF sono salvati cifrati (settings 'wolf' e 'wolf:ses'). Solo il titolare. */
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
/* un account WOLF per chiave: 'wolf' = titolare, 'wolf:ag:<id>' = agente con il suo account reseller */
const MEMS = new Map();
const memOf = (k, reset) => { if (reset || !MEMS.has(k)) MEMS.set(k, { jar: null, lines: null, t: 0 }); return MEMS.get(k); };
const agKey = (id) => 'wolf:ag:' + id;

const setRow = (env, k, v) => env.DB.prepare('INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind(k, v).run();
const getRow = async (env, k) => ((await env.DB.prepare('SELECT v FROM settings WHERE k = ?').bind(k).first()) || {}).v || '';
const unent = (s) => String(s || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'");
const tokenOf = (h) => ((h.match(/name="_token"\s+value="([^"]+)"/) || [])[1]) || '';
const inputVal = (h, name) => unent(((h.match(new RegExp(`name="${name}"[^>]*value="([^"]*)"`)) || [])[1]) || '');

export async function wolfCfg(env, H, k = 'wolf') {
  const v = await getRow(env, k);
  if (!v) return null;
  try { const c = await H.unseal(env, v); return c && c.url && c.user ? { ...c, k, m: memOf(k) } : null; } catch { return null; }
}
const sealCfg = (H, env, c) => H.seal(env, { url: c.url, user: c.user, pass: c.pass, dns: c.dns || '' });
/** entra su WOLF con i dati nuovi e li salva cifrati sotto la chiave k */
async function connectAcc(env, H, k, url, user, pass, dns, findDns) {
  const cfg = { url, user, pass, dns, k, m: memOf(k, true) };
  await login(env, H, cfg);
  if (findDns && !dns) { const l = await fetchLines(env, H, cfg, true, 20).catch(() => []); cfg.dns = (l.find((x) => x.dns) || {}).dns || ''; }
  await setRow(env, k, await sealCfg(H, env, cfg));
  return cfg;
}

function cookieHeader(jar) { return Object.entries(jar || {}).map(([k, v]) => `${k}=${v}`).join('; '); }
function eatCookies(jar, res) {
  const list = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : (res.headers.get('set-cookie') || '').split(/,(?=\s*[A-Za-z0-9_-]+=)/);
  let ch = false;
  for (const c of list) { const m = c.match(/^\s*([^=;\s]+)=([^;]*)/); if (m && jar[m[1]] !== m[2]) { jar[m[1]] = m[2]; ch = true; } }
  return ch;
}
async function loadJar(env, H, cfg) {
  const mem = cfg.m;
  if (mem.jar) return mem.jar;
  try { const v = await getRow(env, cfg.k + ':ses'); mem.jar = v ? await H.unseal(env, v) : {}; } catch { mem.jar = {}; }
  if (!mem.jar || Array.isArray(mem.jar)) mem.jar = {};
  return mem.jar;
}
async function saveJar(env, H, cfg, jar) { cfg.m.jar = jar; await setRow(env, cfg.k + ':ses', await H.seal(env, jar)).catch(() => {}); }

/* HTTP/1.1 su socket TCP: fetch() dei Worker aggiunge CF-Connecting-IP (2a06:98c0:3600::103), che il firewall di WOLF blocca */
class WolfNet extends Error {}

export async function sockFetch(url, { method, headers, body }) {
  const u = new URL(url), tls = u.protocol === 'https:';
  const enc = new TextEncoder(), data = body ? enc.encode(body) : null;
  let sock;
  try {
    sock = connect({ hostname: u.hostname, port: +u.port || (tls ? 443 : 80) }, { secureTransport: tls ? 'on' : 'off' });
    await sock.opened;
  } catch (e) { try { sock && sock.close(); } catch {} throw Object.assign(new Error('socket'), { early: true }); }
  const timer = new Promise((_, no) => setTimeout(() => no(new Error('timeout')), 25000));
  try {
    let head = `${method} ${u.pathname}${u.search} HTTP/1.1\r\nHost: ${u.host}\r\nConnection: close\r\nAccept-Encoding: identity\r\n`;
    for (const [k, v] of Object.entries(headers)) if (v) head += `${k}: ${String(v).replace(/[\r\n]/g, '')}\r\n`;
    if (data) head += `Content-Length: ${data.length}\r\n`;
    const w = sock.writable.getWriter();
    await Promise.race([w.write(enc.encode(head + '\r\n')), timer]);
    if (data) await Promise.race([w.write(data), timer]);
    w.releaseLock();
    const rd = sock.readable.getReader();
    const parts = []; let tot = 0, hEnd = -1, meta = null, head8 = new Uint8Array(0), tail = new Uint8Array(0);
    for (;;) {
      const { value, done } = await Promise.race([rd.read(), timer]);
      if (value && value.length) {
        parts.push(value); tot += value.length;
        if (tot > 40e6) throw new Error('risposta troppo grande');
        if (hEnd < 0) {
          const scan = new Uint8Array(head8.length + value.length); scan.set(head8); scan.set(value, head8.length);
          for (let i = 0; i + 3 < scan.length; i++) if (scan[i] === 13 && scan[i + 1] === 10 && scan[i + 2] === 13 && scan[i + 3] === 10) { hEnd = tot - scan.length + i; break; }
          head8 = hEnd < 0 ? (scan.length > 65536 ? (() => { throw new Error('intestazioni troppo lunghe'); })() : scan) : head8;
          if (hEnd >= 0) { const all = cat(parts, tot); meta = parseHead(new TextDecoder('latin1').decode(all.subarray(0, hEnd))); parts.length = 0; parts.push(all); }
        }
        const t = new Uint8Array(Math.min(7, tail.length + value.length)); const src = cat([tail, value], tail.length + value.length); t.set(src.subarray(src.length - t.length)); tail = t;
      }
      if (meta) {
        const bodyLen = tot - hEnd - 4;
        if (meta.status === 204 || meta.status === 304) break;
        if (meta.chunked ? bodyLen >= 5 && endsZero(tail) : meta.len >= 0 && bodyLen >= meta.len) break;
      }
      if (done) break;
    }
    if (!meta) throw new Error('risposta non valida');
    let b = cat(parts, tot).subarray(hEnd + 4);
    if (meta.chunked) b = unchunk(b); else if (meta.len >= 0) b = b.subarray(0, meta.len);
    meta.headers.delete('transfer-encoding'); meta.headers.delete('content-length');
    const nobody = meta.status === 204 || meta.status === 304 || method === 'HEAD';
    return new Response(nobody ? null : b, { status: meta.status, headers: meta.headers });
  } finally { try { sock.close(); } catch {} }
}
function parseHead(t) {
  const lines = t.split('\r\n'), st = +((lines[0] || '').match(/^HTTP\/\d(?:\.\d)?\s+(\d{3})/) || [])[1];
  if (!(st >= 200 && st <= 599)) throw new Error('risposta non valida');
  const headers = new Headers();
  for (const l of lines.slice(1)) { const i = l.indexOf(':'); if (i > 0) headers.append(l.slice(0, i).trim(), l.slice(i + 1).trim()); }
  const chunked = /chunked/i.test(headers.get('transfer-encoding') || ''), cl = headers.get('content-length'), len = !chunked && cl !== null ? +cl : -1;
  return { status: st, headers, chunked, len };
}
function cat(parts, tot) { if (parts.length === 1 && parts[0].length === tot) return parts[0]; const r = new Uint8Array(tot); let o = 0; for (const p of parts) { r.set(p, o); o += p.length; } return r; }
function endsZero(t) { const z = [48, 13, 10, 13, 10]; if (t.length < 5) return false; for (let i = 0; i < 5; i++) if (t[t.length - 5 + i] !== z[i]) return false; return t.length < 6 || t[t.length - 6] === 10; }
function unchunk(b, strict) {
  const out = [], dec = new TextDecoder(); let p = 0, tot = 0;
  for (;;) {
    let e = p; while (e + 1 < b.length && !(b[e] === 13 && b[e + 1] === 10)) e++;
    if (e + 1 >= b.length) { if (strict) throw new Error('incompleto'); break; }
    const n = parseInt(dec.decode(b.subarray(p, e)).split(';')[0].trim(), 16);
    if (!Number.isFinite(n)) throw new Error('chunk non valido');
    if (n === 0) break;
    if (e + 2 + n > b.length) { if (strict) throw new Error('incompleto'); out.push(b.subarray(e + 2)); tot += b.length - e - 2; break; }
    out.push(b.subarray(e + 2, e + 2 + n)); tot += n; p = e + 2 + n + 2;
  }
  const r = new Uint8Array(tot); let o = 0; for (const c of out) { r.set(c, o); o += c.length; } return r;
}

async function rawFetch(cfg, jar, path, o = {}) {
  const headers = { 'User-Agent': UA, Accept: o.ajax ? 'application/json, text/javascript, */*; q=0.01' : 'text/html,application/xhtml+xml', Cookie: cookieHeader(jar), Referer: cfg.url + '/lines' };
  if (o.ajax) { headers['X-Requested-With'] = 'XMLHttpRequest'; if (jar['XSRF-TOKEN']) headers['X-XSRF-TOKEN'] = decodeURIComponent(jar['XSRF-TOKEN']); }
  let body;
  if (o.form) { headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8'; body = new URLSearchParams(o.form).toString(); }
  const req = { method: o.method || (o.form ? 'POST' : 'GET'), headers, body };
  let r;
  try { r = await sockFetch(cfg.url + path, req); }
  catch (e) {
    if (!e || !e.early) throw new WolfNet('WOLF non risponde: riprova');
    try { r = await fetch(cfg.url + path, { ...req, redirect: 'manual' }); }
    catch { throw new WolfNet('WOLF non risponde: controlla l\'indirizzo del pannello'); }
  }
  eatCookies(jar, r);
  return r;
}

async function login(env, H, cfg) {
  const jar = {};
  const r0 = await rawFetch(cfg, jar, '/');
  const h0 = await r0.text();
  const t = tokenOf(h0);
  if (!t) {
    const why = (h0.match(/<title[^>]*>([^<]{1,80})/i) || [])[1] || h0.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
    throw new H.HttpErr(502, `Non trovo la pagina di accesso di WOLF (risposta ${r0.status}${why ? ': ' + why.trim() : ''})`);
  }
  const r = await rawFetch(cfg, jar, '/', { form: { _token: t, username: cfg.user, password: cfg.pass } });
  const loc = r.headers.get('location') || '';
  if (!(r.status >= 300 && r.status < 400 && /dashboard/.test(loc))) throw new H.HttpErr(400, 'WOLF non accetta utente e password: controllali in «Impostazioni WOLF»');
  await saveJar(env, H, cfg, jar);
  return jar;
}

/** richiesta a WOLF con la sessione salvata; se è scaduta rientra una volta da solo */
async function wf(env, H, cfg, path, o = {}) {
  for (let i = 0; i < 2; i++) {
    let jar = await loadJar(env, H, cfg);
    if (!jar.laravel_session) jar = await login(env, H, cfg);
    const before = JSON.stringify(jar);
    const r = await rawFetch(cfg, jar, path, o);
    const loc = r.headers.get('location') || '';
    let lp = ''; try { lp = new URL(loc, cfg.url).pathname.replace(/\/+$/, ''); } catch {}
    const out = r.status === 401 || r.status === 419 || (r.status >= 300 && r.status < 400 && (lp === '' || lp === '/login'));
    if (out) { cfg.m.jar = {}; if (i === 0) continue; throw new H.HttpErr(502, 'WOLF ha chiuso la sessione: riprova'); }
    if (JSON.stringify(jar) !== before) await saveJar(env, H, cfg, jar);
    return r;
  }
}
async function wfJson(env, H, cfg, path, form) {
  const r = await wf(env, H, cfg, path, { form: form || {}, ajax: true });
  const txt = await r.text();
  let j = null; try { j = JSON.parse(txt); } catch {}
  if (r.status === 422 && j) { const e = j.errors || j; throw new H.HttpErr(400, 'WOLF: ' + Object.values(e).flat().map(String).join(' · ').slice(0, 300)); }
  if (!r.ok) throw new H.HttpErr(502, `WOLF ha risposto con un errore (${r.status})` + (j && j.message ? ': ' + String(j.message).slice(0, 200) : ''));
  if (!j) throw new H.HttpErr(502, 'Risposta di WOLF non valida');
  if (j.type === 'error' || j.success === 0 || j.result === false) throw new H.HttpErr(400, 'WOLF: ' + String(unent(j.message || 'operazione non riuscita')).replace(/<[^>]+>/g, ' ').slice(0, 300));
  return j;
}
async function wfPage(env, H, cfg, path, nf = 'Linea non trovata su WOLF') {
  const r = await wf(env, H, cfg, path);
  if (r.status >= 300 && r.status < 400) throw new H.HttpErr(404, nf);
  if (!r.ok) throw new H.HttpErr(502, `WOLF: pagina non disponibile (${r.status})`);
  return r.text();
}

/* reseller: stessa tabella DataTables della pagina «Resellers» di WOLF */
const strip = (s) => unent(String(s || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
function resOut(x) {
  const act = String(x.action || '');
  const tg = act.match(/data-url="[^"]*?(resellers\/(?:disable|enable)\/\d+(?:\/\d)?)"/) || [];
  return {
    id: +x.id, username: unent(x.username), credits: +x.credits || 0, enabled: +x.status === 1,
    dns: unent(x.reseller_dns || ''), type: strip(String(x.type || '').replace(/<span[\s\S]*$/, '')), canSub: /Create/.test(String(x.type || '')),
    owner: unent(x.ownerusername || ''), lines: +x.total_lines || 0, mags: +x.total_mag || 0, enigma: +x.total_enigma || 0,
    login: String(x.last_login_date || ''), ip: String(x.ip || ''), tgl: tg[1] || '', tglLines: /resellers\/disable-client\/\d+/.test(act),
  };
}
async function fetchResellers(env, H, cfg) {
  const f = { draw: '1', start: '0', length: '-1', id: 'members', filter: '', reseller: '', 'search[value]': '', 'search[regex]': 'false', 'order[0][column]': '0', 'order[0][dir]': 'desc', 'columns[0][data]': 'id', 'columns[0][name]': 'id' };
  const j = await wfJson(env, H, cfg, '/resellers/data', f);
  if (!Array.isArray(j.data)) throw new H.HttpErr(502, 'Elenco reseller di WOLF non valido');
  return j.data.map(resOut);
}
const okMail = (s, H) => { const v = H.str(s, 120); if (v && !/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(v)) throw new H.HttpErr(400, 'Email non valida'); return v; };
const okHost = (s, H) => { const v = H.str(s, 120).replace(/^https?:\/\//, '').replace(/\/+$/, ''); if (v && !/^[a-z0-9.-]+\.[a-z]{2,}(?::\d+)?$/i.test(v)) throw new H.HttpErr(400, 'DNS non valido, es. server.tv'); return v; };
/** i form dei reseller su WOLF non sono AJAX: si invia la pagina e si controlla l'elenco dopo */
async function resForm(env, H, cfg, path, form) {
  const r = await wf(env, H, cfg, path, { form });
  const loc = r.headers.get('location') || '';
  if (r.status === 422 || r.status >= 500) throw new H.HttpErr(502, `WOLF ha risposto con un errore (${r.status})`);
  return { status: r.status, loc };
}

const COLS = ['id', 'expired', 'password', 'exp_date_show', 'admin_notes_show'];
function rowOut(x) {
  const act = String(x.action || '');
  const tg = act.match(/\/lines\/disable\/\d+\/(\d)"[^>]*>([^<]*)</) || [];
  const m3u = (act.match(/data-clipboard-text="(https?:\/\/[^"/]+(?::\d+)?)\/get\.php/) || [])[1] || '';
  const note = unent(x.reseller_notes || '').trim();
  return {
    id: +x.id, username: unent(x.username), password: unent(x.password),
    exp: +x.expire_date ? +x.expire_date * 1000 : 0, trial: +x.is_trial === 1,
    enabled: +x.enabled === 1 && +x.admin_enabled !== 0, conns: +x.active_connections || 0, max: +x.user_connection || 0,
    note: note === '-' ? '' : note, owner: unent(String(x.owner || '').replace(/<[^>]+>/g, '')).trim(), created: String(x.created_at || ''), watching: unent(x.stream_display_name || ''),
    tgl: tg[1] !== undefined ? +tg[1] : null, tglLabel: (tg[2] || '').trim(), dns: unent(m3u),
  };
}
async function fetchLines(env, H, cfg, fresh, lim) {
  const mem = cfg.m;
  if (!fresh && !lim && mem.lines && Date.now() - mem.t < 15e3) return mem.lines;
  const f = { draw: '1', start: '0', length: lim ? String(lim) : '-1', id: 'users', filter: '', reseller: '', 'search[value]': '', 'search[regex]': 'false', 'order[0][column]': '0', 'order[0][dir]': 'desc' };
  COLS.forEach((c, i) => { f[`columns[${i}][data]`] = c; f[`columns[${i}][name]`] = c === 'expired' ? 'username' : c; f[`columns[${i}][searchable]`] = 'true'; f[`columns[${i}][orderable]`] = 'true'; });
  const j = await wfJson(env, H, cfg, '/lines/data', f);
  const out = (j.data || []).map(rowOut);
  if (lim) return out;
  mem.lines = out; mem.t = Date.now();
  return mem.lines;
}
async function credits(env, H, cfg) {
  const h = await wfPage(env, H, cfg, '/dashboard');
  const m = h.replace(/<[^>]+>/g, ' ').match(/Credits:\s*([\d.,]+)/i);
  return m ? +m[1].replace(',', '.') : null;
}
async function packages(env, H, cfg) {
  const h = await wfPage(env, H, cfg, '/lines/create/0/line');
  const sel = (h.match(/<select[^>]*name="package"[^>]*>([\s\S]*?)<\/select>/) || [])[1] || '';
  const out = [];
  for (const m of sel.matchAll(/<option([^>]*)>([\s\S]*?)<\/option>/g)) {
    const v = (m[1].match(/value="(\d+)"/) || [])[1]; if (!v) continue;
    out.push({ id: v, name: unent(m[2].replace(/\s+/g, ' ').trim()).replace(/\s*-\s*cost.*$/i, ''), credits: +((m[1].match(/data-credits="([\d.]*)"/) || [])[1] || 0), months: +((m[1].match(/data-duration="(\d*)"/) || [])[1] || 0), unit: (m[1].match(/data-duration-in="([^"]*)"/) || [])[1] || '' });
  }
  return out;
}
const selIds = (h, id) => { const s = (h.match(new RegExp(`<select[^>]*id="${id}"[^>]*>([\\s\\S]*?)<\\/select>`)) || [])[1] || ''; return [...s.matchAll(/<option[^>]*value="(\d+)"/g)].map((m) => m[1]); };
const bqOf = (h, H) => { const ids = selIds(h, 'searchmain_to'); if (!ids.length) throw new H.HttpErr(502, 'Non trovo i bouquet della linea su WOLF: modifica annullata per sicurezza'); return ids.join(','); };
const descOf = (h) => unent(((h.match(/<textarea[^>]*name="description"[^>]*>([\s\S]*?)<\/textarea>/) || [])[1]) || '');

const okUser = (s, H, what) => { const v = H.str(s, 60); if (!/^[^\s"'<>&\\/?#%]{3,60}$/.test(v)) throw new H.HttpErr(400, `${what}: da 3 a 60 caratteri, senza spazi né " ' < > & \\ / ? # %`); return v; };

/* ---------- linee collegate ai clienti KAIROS ---------- */
async function links(env) { return ((await env.DB.prepare('SELECT * FROM wolf_links').all()).results) || []; }
const swapCreds = (p, ou, op, nu, np) => {
  if (p.type === 'xtream') return p.username === ou && (!op || p.password === op) ? { ...p, username: nu, password: np } : p;
  try { const u = new URL(p.url || ''); if (u.searchParams.get('username') === ou && (!op || u.searchParams.get('password') === op)) { u.searchParams.set('username', nu); u.searchParams.set('password', np); return { ...p, url: u.toString() }; } } catch {}
  return p;
};
/** allinea le playlist dei clienti collegati alle linee di WOLF (utente/password cambiati su WOLF o da KAIROS) */
async function syncLinks(env, H, lines, who, ip) {
  const L = await links(env); if (!L.length) return 0;
  const by = new Map(lines.map((l) => [l.id, l]));
  let n = 0;
  for (const k of L) {
    const l = by.get(+k.line_id); if (!l) continue;
    let op = ''; try { op = k.pass_seal ? await H.unseal(env, k.pass_seal) : ''; } catch {}
    if (typeof op !== 'string') op = '';
    if (l.username === k.username && l.password === op) continue;
    const d = await env.DB.prepare('SELECT id, name, code, playlists FROM devices WHERE id = ?').bind(k.device_id).first();
    if (d) {
      const pls = await H.unseal(env, d.playlists).catch(() => []);
      const next = (pls || []).map((p) => swapCreds(p, k.username, op, l.username, l.password));
      if (JSON.stringify(next) !== JSON.stringify(pls)) {
        await env.DB.prepare('UPDATE devices SET playlists = ? WHERE id = ?').bind(await H.seal(env, next), d.id).run();
        H.plsChanged();
        await H.log(env, 'edit', `${who}: WOLF — playlist di ${d.name || d.code} aggiornata (linea ${l.username})`, ip);
        n++;
      }
    }
    await env.DB.prepare('UPDATE wolf_links SET username = ?, pass_seal = ?, updated = ? WHERE line_id = ?').bind(l.username, await H.seal(env, l.password), Date.now(), k.line_id).run();
  }
  return n;
}
/** controllo automatico (cron): le modifiche fatte su WOLF arrivano ai clienti anche senza aprire il pannello */
export async function wolfCron(env, H) {
  const cfg = await wolfCfg(env, H); if (!cfg) return;
  if (!(await links(env)).length) return;
  await syncLinks(env, H, await fetchLines(env, H, cfg, true), 'Controllo automatico', '');
}

/** ag = { id } per un agente con il permesso «wolf»: usa il suo account reseller WOLF (sue linee, suoi crediti) */
export async function wolfRoutes(req, env, path, who, ip, H, ag = null) {
  try { return await routes(req, env, path, who, ip, H, ag); }
  catch (e) { if (e instanceof WolfNet) throw new H.HttpErr(502, e.message); throw e; }
}
async function routes(req, env, path, who, ip, H, ag) {
  const m = req.method;
  const { HttpErr, json, str } = H;
  const K = ag ? agKey(ag.id) : 'wolf';
  if (ag && (path.startsWith('/wolf/links') || path.startsWith('/wolf/agents'))) throw new HttpErr(403, 'Funzione riservata al titolare');
  if (path === '/wolf/config' && m === 'GET') {
    const c = await wolfCfg(env, H, K), own = ag ? await wolfCfg(env, H) : c;
    return json({ set: !!c, url: own ? own.url : '', user: c ? c.user : '', dns: ag ? '' : own ? own.dns || '' : '', agent: !!ag, ownerSet: !!own });
  }
  if (path === '/wolf/config' && m === 'PUT') {
    const b = await H.readJSON(req, 4096), old = (await wolfCfg(env, H, K)) || {};
    let url, dns;
    if (ag) {
      const own = await wolfCfg(env, H); if (!own) throw new HttpErr(400, 'Il titolare non ha ancora collegato WOLF');
      url = own.url; dns = own.dns || '';
    } else {
      url = str(b.url, 200).trim();
      if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
      try { url = new URL(url).origin; } catch {}
      if (!/^https?:\/\/[^/\s]+$/.test(url)) throw new HttpErr(400, 'Indirizzo di WOLF non valido, es. https://pannello.esempio.com');
      dns = str(b.dns, 200).replace(/\/+$/, ''); if (dns && !/^https?:\/\/[^/\s]+$/.test(dns)) throw new HttpErr(400, 'DNS non valido, es. http://server.tv:8080');
    }
    const user = str(b.user, 120), pass = typeof b.pass === 'string' && b.pass ? b.pass.slice(0, 200) : old.url === url && old.user === user ? old.pass : '';
    if (!user || !pass) throw new HttpErr(400, 'Scrivi utente e password di WOLF');
    const cfg = await connectAcc(env, H, K, url, user, pass, dns, !ag);
    await H.log(env, 'edit', `${who}: pannello WOLF collegato (${ag ? 'account ' + user : url})`, ip);
    return json({ ok: true, dns: cfg.dns });
  }
  if (path === '/wolf/config' && m === 'DELETE') {
    await env.DB.prepare('DELETE FROM settings WHERE k IN (?, ?)').bind(K, K + ':ses').run(); memOf(K, true);
    await H.log(env, 'del', `${who}: pannello WOLF scollegato`, ip);
    return json({ ok: true });
  }
  /* il titolare imposta l'account WOLF di un agente (dalla scheda dell'agente) */
  if (path === '/wolf/agents' && m === 'GET') {
    const rows = ((await env.DB.prepare("SELECT k, v FROM settings WHERE k LIKE 'wolf:ag:%' AND k NOT LIKE '%:ses'").all()).results) || [];
    const out = [];
    for (const r of rows) { try { const c = await H.unseal(env, r.v); if (c && c.user) out.push({ id: +r.k.slice(8), user: c.user }); } catch {} }
    return json({ agents: out });
  }
  const gm = path.match(/^\/wolf\/agents\/(\d{1,9})$/);
  if (gm) {
    const id = +gm[1], k = agKey(id);
    const A = await env.DB.prepare("SELECT username FROM admins WHERE id = ? AND role = 'agent'").bind(id).first();
    if (!A) throw new HttpErr(404, 'Agente non trovato');
    if (m === 'PUT') {
      const own = await wolfCfg(env, H); if (!own) throw new HttpErr(400, 'Collega prima il tuo pannello WOLF');
      const b = await H.readJSON(req, 2048), old = (await wolfCfg(env, H, k)) || {};
      const user = str(b.user, 120), pass = typeof b.pass === 'string' && b.pass ? b.pass.slice(0, 200) : old.user === user ? old.pass : '';
      if (!user || !pass) throw new HttpErr(400, 'Scrivi utente e password WOLF dell\'agente');
      await connectAcc(env, H, k, own.url, user, pass, own.dns || '', false);
      await H.log(env, 'edit', `${who}: account WOLF ${user} assegnato all'agente ${A.username}`, ip);
      return json({ ok: true });
    }
    if (m === 'DELETE') {
      await env.DB.prepare('DELETE FROM settings WHERE k IN (?, ?)').bind(k, k + ':ses').run(); memOf(k, true);
      await H.log(env, 'del', `${who}: account WOLF tolto all'agente ${A.username}`, ip);
      return json({ ok: true });
    }
  }
  if (!path.startsWith('/wolf/')) return null;
  const cfg = await wolfCfg(env, H, K);
  /* Master: tutte le linee. Agente: solo quelle di cui il suo account WOLF è proprietario, mai quelle del Master o degli altri */
  const fetchMine = async (fresh) => { const L = await fetchLines(env, H, cfg, !!fresh); const me = String(cfg.user || '').trim().toLowerCase(); return ag ? L.filter((l) => String(l.owner || '').trim().toLowerCase() === me).map((l) => ({ ...l, dns: '' })) : L; };
  if (ag && cfg) { const own = await wolfCfg(env, H); if (own && String(own.user).toLowerCase() === String(cfg.user).toLowerCase()) throw new HttpErr(403, 'Questo agente usa l\'account WOLF del Master: assegnagli il suo account reseller'); }
  if (!cfg) throw new HttpErr(400, ag ? 'Collega prima il tuo account WOLF (utente e password)' : 'Collega prima il pannello WOLF (indirizzo, utente e password)');

  /* «Cambia password»: la cambia su WOLF (pagina Profilo, lasciando DNS e blocco IP come sono) e poi in KAIROS */
  if (path === '/wolf/password' && m === 'POST') {
    const b = await H.readJSON(req, 1024), pass = okUser(b.pass, H, 'Nuova password');
    if (pass === cfg.pass) throw new HttpErr(400, 'La nuova password è uguale a quella attuale');
    const page = await wfPage(env, H, cfg, '/profile', 'Non trovo la pagina del profilo su WOLF');
    const t = tokenOf(page);
    if (!t || !/<input[^>]*name="password"/.test(page) || !/<input[^>]*name="ip"/.test(page)) throw new HttpErr(502, 'Non trovo il modulo della password su WOLF: nessuna modifica fatta');
    await wfJson(env, H, cfg, '/profile', { _token: t, password: pass, dns: inputVal(page, 'dns'), ip: inputVal(page, 'ip') });
    try { await connectAcc(env, H, K, cfg.url, cfg.user, pass, cfg.dns || '', false); }
    catch {
      let old = false; try { await connectAcc(env, H, K, cfg.url, cfg.user, cfg.pass, cfg.dns || '', false); old = true; } catch {}
      throw new HttpErr(502, old ? 'WOLF non ha cambiato la password: resta quella di prima' : 'Non riesco a entrare su WOLF dopo il cambio: controlla su WOLF e scrivi la password in «Impostazioni WOLF»');
    }
    await H.log(env, 'edit', `${who}: WOLF — password dell'account ${cfg.user} cambiata (su WOLF e in KAIROS)`, ip);
    return json({ ok: true });
  }
  if (path === '/wolf/lines' && m === 'GET') {
    const fresh = new URL(req.url).searchParams.get('fresh') === '1';
    const [lines, cr] = await Promise.all([fetchMine(fresh), credits(env, H, cfg).catch(() => null)]);
    const synced = await syncLinks(env, H, lines, who, ip).catch(() => 0);
    const L = ag ? [] : await links(env);
    const names = new Map((((await env.DB.prepare(`SELECT id, name, code FROM devices WHERE id IN (${L.map(() => '?').join(',') || "''"})`).bind(...L.map((k) => k.device_id)).all()).results) || []).map((d) => [d.id, d.name || d.code]));
    return json({ lines, credits: cr, dns: ag ? '' : cfg.dns || '', synced, links: L.map((k) => ({ line: +k.line_id, device: k.device_id, name: names.get(k.device_id) || 'cliente eliminato' })) });
  }
  if (path === '/wolf/packages' && m === 'GET') return json({ packages: await packages(env, H, cfg), credits: await credits(env, H, cfg).catch(() => null) });

  if (path === '/wolf/lines' && m === 'POST') {
    const b = await H.readJSON(req, 4096);
    const username = okUser(b.username, H, 'Utente'), password = okUser(b.password, H, 'Password'), pkg = str(String(b.package || ''), 10);
    if (!/^\d+$/.test(pkg)) throw new HttpErr(400, 'Scegli il pacchetto');
    const page = await wfPage(env, H, cfg, '/lines/create/0/line');
    const pk = await wfJson(env, H, cfg, '/lines/packages', { package_id: pkg, trial: '0' });
    const bq = (pk.bouquets || []).map((x) => x.id).join(',');
    const j = await wfJson(env, H, cfg, '/lines/create/0', { _token: tokenOf(page), current_bouquets: bq, line_type: 'line', username, password, mac: '', package: pkg, description: str(b.note, 300) });
    const l = (await fetchMine(true)).find((x) => x.username === username);
    if (l && b.deviceId && !ag) await linkLine(env, H, cfg, l, str(b.deviceId, 20), who, ip).catch(() => {});
    await H.note(env, { src: 'wolf', app: 'WOLF', owner: ag ? ag.id : 0, username, password, dns: cfg.dns || '', note: str(b.note, 200) });
    await H.log(env, 'new', `${who}: WOLF — linea ${username} creata`, ip);
    return json({ ok: true, id: l ? l.id : null, message: unent(j.message || '') });
  }
  const lm = path.match(/^\/wolf\/lines\/(\d+)(\/extend|\/toggle|\/kick)?$/);
  if (lm) {
    const id = +lm[1], act = lm[2] || '';
    if (ag && !(await fetchMine(false)).some((x) => x.id === id)) throw new HttpErr(404, 'Linea non trovata');
    if (!act && m === 'PUT') {
      const b = await H.readJSON(req, 4096);
      const page = await wfPage(env, H, cfg, `/lines/edit/${id}`);
      const ou = inputVal(page, 'username'); if (!ou) throw new HttpErr(404, 'Linea non trovata su WOLF');
      const username = b.username !== undefined ? okUser(b.username, H, 'Utente') : ou;
      const password = b.password !== undefined ? okUser(b.password, H, 'Password') : inputVal(page, 'password');
      const description = b.note !== undefined ? str(b.note, 300) || '-' : descOf(page);
      await wfJson(env, H, cfg, `/lines/edit/${id}`, { _token: tokenOf(page), current_bouquets: bqOf(page, H), username, password, owner: '', description });
      const lines = await fetchMine(true);
      const synced = await syncLinks(env, H, lines, who, ip).catch(() => 0);
      await H.log(env, 'edit', `${who}: WOLF — linea ${ou}${ou !== username ? ' → ' + username : ''} modificata`, ip);
      return json({ ok: true, synced });
    }
    if (act === '/extend' && m === 'POST') {
      const b = await H.readJSON(req, 2048), pkg = str(String(b.package || ''), 10);
      if (!/^\d+$/.test(pkg)) throw new HttpErr(400, 'Scegli il pacchetto');
      const page = await wfPage(env, H, cfg, `/lines/extend/${id}`);
      const username = inputVal(page, 'username'); if (!username) throw new HttpErr(404, 'Linea non trovata su WOLF');
      const ed = await wfPage(env, H, cfg, `/lines/edit/${id}`);
      await wfJson(env, H, cfg, `/lines/extend/${id}`, { _token: tokenOf(page), current_bouquets: bqOf(ed, H), username, keep_current_bouquet: 'on', package: pkg, description: descOf(ed) });
      cfg.m.lines = null;
      await H.log(env, 'edit', `${who}: WOLF — linea ${username} rinnovata`, ip);
      return json({ ok: true });
    }
    if (act === '/toggle' && m === 'POST') {
      const l = (await fetchMine(true)).find((x) => x.id === id);
      if (!l || l.tgl === null) throw new HttpErr(404, 'Linea non trovata su WOLF');
      await wfJson(env, H, cfg, `/lines/disable/${id}/${l.tgl}`);
      cfg.m.lines = null;
      await H.log(env, 'edit', `${who}: WOLF — linea ${l.username} ${l.enabled ? 'disattivata' : 'attivata'}`, ip);
      return json({ ok: true });
    }
    if (act === '/kick' && m === 'POST') { await wfJson(env, H, cfg, `/lines/kick/${id}`); cfg.m.lines = null; return json({ ok: true }); }
    if (!act && m === 'DELETE') {
      const l = (await fetchMine(false)).find((x) => x.id === id);
      await wfJson(env, H, cfg, `/lines/delete/${id}`);
      await env.DB.prepare('DELETE FROM wolf_links WHERE line_id = ?').bind(id).run();
      cfg.m.lines = null;
      await H.log(env, 'del', `${who}: WOLF — linea ${l ? l.username : id} eliminata`, ip);
      return json({ ok: true });
    }
  }
  if (path === '/wolf/resellers' && m === 'GET') {
    const [resellers, cr] = await Promise.all([fetchResellers(env, H, cfg), credits(env, H, cfg).catch(() => null)]);
    return json({ resellers, credits: cr, me: cfg.user });
  }
  if (path === '/wolf/resellers' && m === 'POST') {
    const b = await H.readJSON(req, 4096);
    const username = okUser(b.username, H, 'Utente'), password = okUser(b.password, H, 'Password');
    const page = await wfPage(env, H, cfg, '/resellers/create', 'Non posso creare reseller su questo account WOLF');
    const dns = b.dns !== undefined && String(b.dns).trim() ? okHost(b.dns, H) : inputVal(page, 'reseller_dns');
    if ((await fetchResellers(env, H, cfg)).some((x) => x.username.toLowerCase() === username.toLowerCase())) throw new HttpErr(400, 'Esiste già un reseller con questo utente');
    await resForm(env, H, cfg, '/resellers/create/0', { _token: tokenOf(page), username, email: okMail(b.email, H), password, reseller_dns: dns, description: str(b.note, 500) });
    const r = (await fetchResellers(env, H, cfg)).find((x) => x.username === username);
    if (!r) throw new HttpErr(400, 'WOLF non ha creato il reseller: controlla utente (forse già usato), email e DNS');
    await H.log(env, 'new', `${who}: WOLF — reseller ${username} creato`, ip);
    return json({ ok: true, id: r.id });
  }
  const rm = path.match(/^\/wolf\/resellers\/(\d+)(\/credits|\/toggle|\/delete)?$/);
  if (rm) {
    const id = +rm[1], act = rm[2] || '';
    const r = (await fetchResellers(env, H, cfg)).find((x) => x.id === id);
    if (!r) throw new HttpErr(404, 'Reseller non trovato su WOLF');
    if (!act && m === 'PUT') {
      const b = await H.readJSON(req, 4096);
      const page = await wfPage(env, H, cfg, `/resellers/edit/${id}`, 'Reseller non trovato su WOLF');
      if (inputVal(page, 'username') !== r.username) throw new HttpErr(502, 'La pagina del reseller su WOLF non corrisponde: modifica annullata');
      const email = b.email !== undefined ? okMail(b.email, H) : inputVal(page, 'email');
      const dns = b.dns !== undefined ? okHost(b.dns, H) : inputVal(page, 'reseller_dns');
      const password = b.password ? okUser(b.password, H, 'Password') : '';
      const description = b.note !== undefined ? str(b.note, 500) : descOf(page);
      if (!dns) throw new HttpErr(400, 'Scrivi il DNS del reseller');
      await resForm(env, H, cfg, `/resellers/edit/${id}`, { _token: tokenOf(page), email, password, reseller_dns: dns, description });
      const after = await wfPage(env, H, cfg, `/resellers/edit/${id}`, 'Reseller non trovato su WOLF');
      if (inputVal(after, 'reseller_dns') !== dns || inputVal(after, 'email') !== email) throw new HttpErr(400, 'WOLF non ha accettato la modifica: controlla email e DNS');
      await H.log(env, 'edit', `${who}: WOLF — reseller ${r.username} modificato${password ? ' (nuova password)' : ''}`, ip);
      return json({ ok: true });
    }
    if (act === '/credits' && m === 'POST') {
      const b = await H.readJSON(req, 2048), n = Math.trunc(+b.credits);
      if (!Number.isFinite(n) || !n || Math.abs(n) > 100000) throw new HttpErr(400, 'Scrivi quanti crediti (es. 10, oppure -5 per toglierli)');
      const j = await wfJson(env, H, cfg, '/resellers/credits', { id: String(id), credits: String(n), message: str(b.message, 300) });
      if (j.success !== true) throw new HttpErr(400, 'WOLF non ha cambiato i crediti');
      await H.log(env, 'edit', `${who}: WOLF — ${n > 0 ? '+' : ''}${n} crediti al reseller ${r.username}`, ip);
      return json({ ok: true, message: strip(j.data || '') });
    }
    if (act === '/toggle' && m === 'POST') {
      const b = await H.readJSON(req, 512);
      const withLines = !!b.lines && r.enabled;
      const url = withLines ? `/resellers/disable-client/${id}` : r.tgl ? '/' + r.tgl : '';
      if (!url || (withLines && !r.tglLines)) throw new HttpErr(400, 'WOLF non permette questa azione su questo reseller');
      await wfJson(env, H, cfg, url);
      cfg.m.lines = null;
      await H.log(env, 'edit', `${who}: WOLF — reseller ${r.username} ${r.enabled ? 'disattivato' : 'attivato'}${withLines ? ' con tutte le sue linee' : ''}`, ip);
      return json({ ok: true });
    }
    if (act === '/delete' && m === 'POST') {
      const b = await H.readJSON(req, 512);
      if (String(b.confirm || '') !== r.username) throw new HttpErr(400, 'Per eliminare scrivi esattamente il nome del reseller');
      await wfJson(env, H, cfg, `/resellers/delete/${id}`);
      cfg.m.lines = null;
      await H.log(env, 'del', `${who}: WOLF — reseller ${r.username} eliminato con tutte le sue linee`, ip);
      return json({ ok: true });
    }
  }
  if (path === '/wolf/links' && m === 'POST') {
    const b = await H.readJSON(req, 1024);
    const l = (await fetchMine(false)).find((x) => x.id === +b.line);
    if (!l) throw new HttpErr(404, 'Linea non trovata su WOLF');
    return json(await linkLine(env, H, cfg, l, str(b.device, 20), who, ip));
  }
  const km = path.match(/^\/wolf\/links\/(\d+)$/);
  if (km && m === 'DELETE') { await env.DB.prepare('DELETE FROM wolf_links WHERE line_id = ?').bind(+km[1]).run(); return json({ ok: true }); }
  return null;
}

/** collega una linea a un cliente: se il cliente non ha ancora questa linea, gli si aggiunge come playlist Xtream */
async function linkLine(env, H, cfg, l, deviceId, who, ip) {
  const d = await env.DB.prepare('SELECT id, name, code, playlists FROM devices WHERE id = ?').bind(deviceId).first();
  if (!d) throw new H.HttpErr(404, 'Cliente non trovato');
  const pls = (await H.unseal(env, d.playlists).catch(() => [])) || [];
  const has = pls.some((p) => (p.type === 'xtream' ? p.username : (() => { try { return new URL(p.url).searchParams.get('username'); } catch { return ''; } })()) === l.username);
  let added = false;
  if (!has) {
    const host = cfg.dns || l.dns;
    if (!host) throw new H.HttpErr(400, 'Imposta il DNS di WOLF in «Impostazioni WOLF»');
    if (pls.length >= 10) throw new H.HttpErr(400, 'Il cliente ha già 10 playlist');
    pls.push({ id: H.pid(), name: 'WOLF', type: 'xtream', host, username: l.username, password: l.password });
    await env.DB.prepare('UPDATE devices SET playlists = ? WHERE id = ?').bind(await H.seal(env, pls), d.id).run();
    H.plsChanged(); added = true;
  }
  await env.DB.prepare('INSERT INTO wolf_links (line_id, device_id, username, pass_seal, updated) VALUES (?, ?, ?, ?, ?) ON CONFLICT(line_id) DO UPDATE SET device_id = excluded.device_id, username = excluded.username, pass_seal = excluded.pass_seal, updated = excluded.updated')
    .bind(l.id, d.id, l.username, await H.seal(env, l.password), Date.now()).run();
  await H.log(env, 'edit', `${who}: WOLF — linea ${l.username} collegata a ${d.name || d.code}${added ? ' (playlist aggiunta)' : ''}`, ip);
  return { ok: true, added, name: d.name || d.code };
}
