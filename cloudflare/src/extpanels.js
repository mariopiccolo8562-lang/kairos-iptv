import { sockFetch } from './wolf.js';
/* ---------------- Pannelli IPTV esterni senza API: Realott (my.realott.com) e SLT (p.slt.st) ----------------
   KAIROS entra con utente e password del titolare (salvati cifrati in settings '<k>' e cookie in '<k>:ses') e usa le stesse
   richieste del loro pannello web. Niente copie: legge e scrive direttamente sul pannello. Solo il titolare (Master). */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const mem = {};
const setRow = (env, k, v) => env.DB.prepare('INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind(k, v).run();
const getRow = async (env, k) => ((await env.DB.prepare('SELECT v FROM settings WHERE k = ?').bind(k).first()) || {}).v || '';
const cookieHeader = (jar) => Object.entries(jar || {}).map(([k, v]) => `${k}=${v}`).join('; ');
function eatCookies(jar, res) {
  const list = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : (res.headers.get('set-cookie') || '').split(/,(?=\s*[A-Za-z0-9_-]+=)/);
  for (const c of list) { const m = c.match(/^\s*([^=;\s]+)=([^;]*)/); if (m) jar[m[1]] = m[2]; }
}
const unent = (s) => String(s || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ');
const txtOf = (h) => unent(String(h || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const attr = (t, n) => { const m = String(t).match(new RegExp('\\s' + n + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\')', 'i')); return m ? unent(m[1] != null ? m[1] : m[2]) : ''; };
const meta = (h, n) => attr((h.match(new RegExp('<meta[^>]+name="' + n + '"[^>]*>', 'i')) || [''])[0], 'content');
const rowsOfTable = (h) => [...String(h).matchAll(/<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi)].map((m) => ({ attrs: m[1], html: m[2], cells: [...m[2].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => c[1]) }));
const ts = (s) => { if (!s) return 0; const m = String(s).match(/(\d{4})-(\d\d)-(\d\d)(?:[ T](\d\d):(\d\d))?/) || String(s).match(/(\d\d)\/(\d\d)\/(\d{4})/); if (!m) return 0; const d = m[0].includes('/') ? Date.UTC(+m[3], +m[2] - 1, +m[1], 12) : Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 12), +(m[5] || 0)); return Math.floor(d / 1000); };
const randPass = (n = 10) => { const A = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'; const b = crypto.getRandomValues(new Uint8Array(n)); let s = ''; for (const x of b) s += A[x % A.length]; return s; };
const durIt = (desc, hours) => { const m = String(desc || '').match(/Duration:\s*(\d+)\s*(month|day|hour|week|year)/i); if (m) { const n = +m[1], u = m[2].toLowerCase(); const w = { month: ['mese', 'mesi'], day: ['giorno', 'giorni'], hour: ['ora', 'ore'], week: ['settimana', 'settimane'], year: ['anno', 'anni'] }[u]; return n + ' ' + w[n === 1 ? 0 : 1]; } hours = +hours || 0; return !hours ? '' : hours % 720 === 0 ? hours / 720 + (hours === 720 ? ' mese' : ' mesi') : hours % 24 === 0 ? hours / 24 + ' giorni' : hours + ' ore'; };
const num = (s) => parseFloat(String(s || '').replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')) || 0;

const keyOf = (k, ag) => (ag ? `${k}:ag:${ag.id}` : k);
async function cfgOf(env, H, k) { const v = await getRow(env, k); if (!v) return null; try { const c = await H.unseal(env, v); return c && c.user ? c : null; } catch { return null; } }
async function loadJar(env, H, k) {
  if (mem[k + ':jar']) return mem[k + ':jar'];
  let jar; try { const v = await getRow(env, k + ':ses'); jar = v ? await H.unseal(env, v) : {}; } catch { jar = {}; }
  if (!jar || Array.isArray(jar)) jar = {};
  return (mem[k + ':jar'] = jar);
}
async function saveJar(env, H, k, jar) { mem[k + ':jar'] = jar; await setRow(env, k + ':ses', await H.seal(env, jar)).catch(() => {}); }

/** richiesta HTTP con cookie; o.form → urlencoded, o.multi → multipart, o.json → JSON, o.method per DELETE ecc. */
async function raw(P, H, jar, path, o = {}) {
  const headers = { 'User-Agent': UA, Accept: o.ajax ? 'application/json, text/plain, */*' : 'text/html,application/xhtml+xml,*/*;q=0.8', 'Accept-Language': 'it-IT,it;q=0.9,en;q=0.8', Cookie: cookieHeader(jar), Referer: P.url + (o.ref || '/'), Origin: P.url, ...(o.headers || {}) };
  if (o.ajax) headers['X-Requested-With'] = 'XMLHttpRequest';
  let body;
  if (o.json !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(o.json); }
  else if (o.form) { headers['Content-Type'] = 'application/x-www-form-urlencoded'; const u = new URLSearchParams(); for (const [k, v] of Object.entries(o.form)) { if (Array.isArray(v)) v.forEach((x) => u.append(k, String(x))); else if (v != null) u.append(k, String(v)); } body = u.toString(); }
  else if (o.multi) { const fd = new FormData(); for (const [k, v] of Object.entries(o.multi)) { if (Array.isArray(v)) v.forEach((x) => fd.append(k, String(x))); else if (v != null) fd.append(k, String(v)); } body = fd; }
  const req = { method: o.method || (o.form || o.multi || o.json !== undefined ? 'POST' : 'GET'), headers, body, redirect: 'manual' };
  let r;
  try { r = await sockFetch(P.url + path, req); }
  catch (e) {
    if (!e || !e.early) throw new H.HttpErr(502, `${P.name} non risponde: riprova`);
    try { r = await fetch(P.url + path, req); } catch { throw new H.HttpErr(502, `${P.name} non risponde: riprova`); }
  }
  eatCookies(jar, r);
  const txt = await r.text(); let j = null; try { j = JSON.parse(txt); } catch {}
  return { status: r.status, txt, j, loc: r.headers.get('location') || '', ct: r.headers.get('content-type') || '' };
}

const sleep = (ms) => new Promise((s) => setTimeout(s, ms));
/** come raw(), ma supera la pagina di controllo «VPZ» di SLT (il cookie vale dopo circa un secondo) */
async function rawV(P, H, jar, path, o = {}) {
  let r = await raw(P, H, jar, path, o);
  for (let i = 0; i < 6 && P.vpz && P.vpz(jar, r); i++) { if (i === 2) delete jar.VPZ; if (i >= 2) P.vpz(jar, r); await sleep(1000 + i * 300); r = await raw(P, H, jar, path, o); }
  if (P.vpz && P.vpz(jar, r)) throw new H.HttpErr(502, `${P.name}: pagina di controllo anti-bot, riprova tra qualche secondo`);
  return r;
}
/* ======================= Realott — my.realott.com («Billing Panel») ======================= */
const RO = {
  k: 'ro', name: 'Realott', url: 'https://my.realott.com', login: '/login',
  async login(H, jar, c) {
    await raw(this, H, jar, '/login');
    const r = await raw(this, H, jar, '/login', { form: { username: c.user, password: c.pass }, ref: '/login' });
    if (!(r.status >= 300 && r.status < 400 && !/login/.test(r.loc))) {
      const msg = txtOf((r.txt.match(/<(?:div|p|span)[^>]*(?:alert|error|invalid)[^>]*>([\s\S]*?)<\//i) || [])[1] || '');
      throw new H.HttpErr(400, 'Realott: ' + (msg || `accesso non riuscito (${r.status}). Controlla utente e password`).slice(0, 200));
    }
  },
  gone: (r) => r.status === 401 || (r.status >= 300 && r.status < 400 && /\/login/.test(r.loc)),
  async csrf(env, H, k) { if (mem[(this.key || 'ro') + ':csrf']) return mem[(this.key || 'ro') + ':csrf']; const h = await call(this, env, H, '/lines', { html: true }); mem[(this.key || 'ro') + ':csrf'] = meta(h, 'csrf-token'); return mem[(this.key || 'ro') + ':csrf']; },
  async post(env, H, path, body) { const tok = await this.csrf(env, H); const r = await call(this, env, H, path, { form: body || {}, ajax: true, headers: { 'X-CSRF-Token': tok }, rawRes: true }); const j = r.j || {}; if (r.status >= 400 || j.ok === false) throw new H.HttpErr(400, 'Realott: ' + String(j.error || j.message || (Array.isArray(j.detail) ? 'campi non validi: ' + j.detail.map((d) => (d.loc || []).slice(-1)[0] + ' (' + d.msg + ')').join(', ') : '') || (j.errors && Object.values(j.errors).flat().join(' ')) || txtOf(r.txt).slice(0, 120) || `risposta ${r.status}`).slice(0, 200)); return j; },
  async overview(env, H) {
    const h = await call(this, env, H, '/', { html: true }), t = txtOf(h);
    const cr = (t.match(/Crediti disponibili\s*([\d.,]+)/i) || [])[1], la = t.match(/Linee attive\s*(\d+)\s*\/\s*(\d+)/i);
    return { credits: cr != null ? num(cr) : null, active: la ? +la[1] : null, total: la ? +la[2] : null, user: (t.match(/Workspace\s+\S\s+(\S+)/) || [])[1] || '' };
  },
  async lines(env, H) {
    const h = await call(this, env, H, '/lines', { html: true });
    mem[(this.key || 'ro') + ':csrf'] = meta(h, 'csrf-token') || mem[(this.key || 'ro') + ':csrf'];
    const dns = attr((h.match(/<[a-z]+[^>]+id="dl-modal"[^>]*>/i) || [''])[0], 'data-reseller-dns');
    const rows = [];
    for (const tr of rowsOfTable((h.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i) || ['', h])[1])) {
      const id = attr((tr.html.match(/<button[^>]+data-action="details"[^>]*>/i) || [''])[0], 'data-id'); if (!id || tr.cells.length < 7) continue;
      const dl = (tr.html.match(/<button[^>]+data-action="download"[^>]*>/i) || [''])[0];
      const c = tr.cells.map(txtOf), st = c[3] || '';
      rows.push({ id: +id, username: c[0], password: attr(dl, 'data-pw') || '', owner: c[2], status: st, enabled: !/sospes|disattiv|disabled/i.test(st), expired: /scadut|expired/i.test(st), trial: /trial|prova/i.test(c[4] || ''), type: c[4] || '', conns: num(c[5]), exp: ts(c[6]), expTxt: c[6] || '', notes: c[7] === '—' ? '' : c[7] || '' });
    }
    return { rows, dns, total: rows.length };
  },
  async packages(env, H) {
    const h = await call(this, env, H, '/lines/new', { html: true });
    let d = {}; try { d = JSON.parse((h.match(/<script[^>]+id="page-data"[^>]*>([\s\S]*?)<\/script>/i) || [])[1] || '{}'); } catch {}
    const members = [...((h.match(/<select[^>]+(?:name|id)="member_id"[^>]*>([\s\S]*?)<\/select>/i) || [])[1] || '').matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi)].map((m) => ({ v: attr(m[1], 'value'), t: txtOf(m[2]), sel: /\sselected/i.test(m[1]) }));
    const pk = (Array.isArray(d.packages) ? d.packages : []).map((p) => ({ id: String(p.id), name: String(p.name || '').trim(), cost: p.is_trial && !p.is_official ? +p.trial_credits || 0 : +p.official_credits || 0, dur: p.is_trial && !p.is_official ? p.trial_duration : p.duration, max: p.max_connections, trial: !!p.is_trial && !p.is_official, mag: !!p.can_gen_mag, bq: Array.isArray(p.bouquets) ? p.bouquets : [] }));
    return { packages: pk, members, credits: d.credits != null ? num(d.credits) : null };
  },
  async createForm(env, H) {
    const { packages, members, credits } = await this.packages(env, H);
    return [
      { name: 'username', type: 'text', label: 'Utente (vuoto = lo genera KAIROS)', required: false, value: '' },
      { name: 'password', type: 'text', label: 'Password (vuota = la genera KAIROS)', required: false, value: '' },
      { name: 'package_id', type: 'select', label: `Pacchetto${credits != null ? ' · crediti disponibili: ' + credits : ''}`, required: true, options: packages.map((p) => ({ v: p.id, t: `${p.name} — ${p.cost} crediti · ${p.dur || ''}${p.max ? ' · ' + p.max + ' conn.' : ''}${p.trial ? ' · prova' : ''}`, sel: false })) },
      ...(members.length > 1 ? [{ name: 'member_id', type: 'select', label: 'Assegna a', required: false, options: members }] : []),
      { name: 'reseller_notes', type: 'textarea', label: 'Note', required: false, value: '' },
      { name: 'is_mag', type: 'checkbox', label: 'Dispositivo MAG', required: false, value: 'true', checked: false },
      { name: 'mac_address', type: 'text', label: 'MAC address (solo MAG)', required: false, value: '' },
    ];
  },
  async create(env, H, v) {
    const { packages, members } = await this.packages(env, H);
    const p = packages.find((x) => x.id === String(v.package_id)); if (!p) throw new H.HttpErr(400, 'Scegli il pacchetto Realott');
    const username = String(v.username || '').trim() || 'kx' + randPass(8).toLowerCase(), password = String(v.password || '') || randPass(10);
    const real = members.filter((m) => m.v !== ''); const member = (v.member_id && real.find((m) => m.v === String(v.member_id))) || real.find((m) => m.sel) || real[0] || { v: '' };
    const body = { member_id: member.v, package_id: p.id, is_trial: p.trial ? 'true' : 'false', username, password, reseller_notes: String(v.reseller_notes || '').slice(0, 300), no_expire: 'false', is_mag: v.is_mag === true || v.is_mag === 'true' ? 'true' : 'false', mac_address: String(v.mac_address || ''), device_id: '', bouquets: p.bq };
    const j = await this.post(env, H, '/lines', body);
    if (!j.ok) throw new H.HttpErr(400, 'Realott: ' + String(j.error || 'creazione non riuscita').slice(0, 200));
    return { id: j.line_id, username: j.username || username, password: j.password || password, balance: j.new_balance };
  },
  async action(env, H, b) {
    const id = parseInt(b.id, 10); if (!(id > 0)) throw new H.HttpErr(400, 'Linea non valida');
    if (b.action === 'renew') { if (!b.package_id) throw new H.HttpErr(400, 'Scegli il pacchetto'); const j = await this.post(env, H, `/lines/${id}/renew`, { package_id: String(b.package_id) }); return { what: 'rinnovata', balance: j.new_balance }; }
    if (b.action === 'extend') { const days = parseInt(b.days, 10); if (!(days > 0 && days <= 60)) throw new H.HttpErr(400, 'Giorni non validi'); await this.post(env, H, `/lines/${id}/extend`, { days: String(days) }); return { what: `estesa di ${days} giorni` }; }
    if (b.action === 'toggle') { const j = await this.post(env, H, `/lines/${id}/toggle`); return { what: j.enabled ? 'attivata' : 'sospesa' }; }
    if (b.action === 'kill') { const j = await this.post(env, H, `/lines/${id}/kill`); return { what: `${j.killed || 0} connessioni chiuse` }; }
    if (b.action === 'delete') { await this.post(env, H, `/lines/${id}/delete`); return { what: 'eliminata' }; }
    throw new H.HttpErr(400, 'Operazione sconosciuta');
  },
  async subs(env, H) {
    const h = await call(this, env, H, '/subresellers', { html: true }), rows = [];
    for (const tr of rowsOfTable((h.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i) || ['', h])[1])) {
      const id = attr((tr.html.match(/<button[^>]+data-id="\d+"[^>]*>/i) || [''])[0], 'data-id'); if (!id || tr.cells.length < 5) continue;
      const c = tr.cells.map(txtOf); rows.push({ id: +id, username: c[0], owner: c[1], type: c[2], credits: c[3], lines: c[4], status: c[5] || '', enabled: !/disattiv|sospes|disabled/i.test(c[5] || '') });
    }
    return { rows };
  },
  async subAction(env, H, b) { const id = parseInt(b.id, 10); if (!(id > 0)) throw new H.HttpErr(400, 'Sub-reseller non valido'); if (b.op !== 'toggle') throw new H.HttpErr(400, 'Operazione sconosciuta'); await this.post(env, H, `/subresellers/${id}/toggle`); return { what: 'stato cambiato' }; },
  async conns(env, H) {
    const h = await call(this, env, H, '/connections/table?q=&page=1', { html: true, headers: { 'X-Requested-With': 'fetch' } });
    const heads = rowsOfTable(h).find((r) => /<th/i.test('<' + r.html)); const rows = [];
    for (const tr of rowsOfTable((h.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i) || ['', h])[1])) { const c = tr.cells.map(txtOf); if (c.length < 2 || !c.join('')) continue; rows.push({ username: c[0], stream: c[1] || '', ip: c[2] || '', info: c.slice(3).filter((x) => x && x !== '—').join(' · ') }); }
    return { rows, heads: heads ? heads.cells.map(txtOf) : [] };
  },
};

/* ======================= SLT — p.slt.st (Laravel + API JSON interna) ======================= */
const SLT = {
  k: 'slt', name: 'SLT', url: 'https://p.slt.st', login: '/login',
  vpz(jar, r) { const m = r.status === 200 && r.txt.length < 1200 && r.txt.match(/VPZ=([a-f0-9]+)/); if (m) { if (!jar.VPZ) jar.VPZ = m[1]; return true; } return false; },
  async login(H, jar, c) {
    const p = await rawV(this, H, jar, '/login');
    const tok = attr((p.txt.match(/<input[^>]+name="_token"[^>]*>/i) || [''])[0], 'value') || meta(p.txt, 'csrf-token');
    const r = await rawV(this, H, jar, '/login', { form: { _token: tok, username: c.user, password: c.pass }, ref: '/login' });
    if (!(r.status >= 300 && r.status < 400 && !/\/login/.test(r.loc))) {
      const msg = txtOf((r.txt.match(/<(?:div|span|p)[^>]*(?:invalid-feedback|alert|error)[^>]*>([\s\S]*?)<\//i) || [])[1] || '');
      throw new H.HttpErr(400, 'SLT: ' + (msg || `accesso non riuscito (${r.status}${r.txt.length < 1200 ? ', pagina di controllo' : ''}). Controlla utente e password`).slice(0, 200));
    }
    mem[(this.key || 'slt') + ':csrf'] = '';
  },
  gone: (r) => r.status === 401 || r.status === 419 || (r.status >= 300 && r.status < 400 && /\/login/.test(r.loc)),
  async csrf(env, H) { if (mem[(this.key || 'slt') + ':csrf']) return mem[(this.key || 'slt') + ':csrf']; const h = await call(this, env, H, '/lines', { html: true }); mem[(this.key || 'slt') + ':csrf'] = meta(h, 'csrf-token'); return mem[(this.key || 'slt') + ':csrf']; },
  async post(env, H, path, body, method) { const tok = await this.csrf(env, H); const r = await call(this, env, H, path, { form: { _token: tok, ...(body || {}) }, method: method || 'POST', ajax: true, headers: { 'X-CSRF-TOKEN': tok }, rawRes: true }); if (r.status >= 400) throw new H.HttpErr(400, 'SLT: ' + String((r.j && (r.j.error || r.j.message)) || txtOf(r.txt).slice(0, 120) || `errore ${r.status}`).slice(0, 200)); return r.j || {}; },
  async dns(env, H) { if (mem[(this.key || 'slt') + ':dns'] !== undefined) return mem[(this.key || 'slt') + ':dns']; const h = await call(this, env, H, '/lines/index-legacy', { html: true }); mem[(this.key || 'slt') + ':dns'] = (h.match(/ROOT_LINK\s*=\s*['"]([^'"]+)['"]/) || [])[1] || ''; return mem[(this.key || 'slt') + ':dns']; },
  async overview(env, H) { const j = await call(this, env, H, '/api/dashboard-stats', { ajax: true }); const u = j.users || {}, cn = j.connections || {}, cr = j.credits || {}; return { credits: cr.available != null ? +cr.available : null, used_today: cr.used_today, total: u.total, active: u.enabled, expired: u.expired, online: u.online, conns: cn.total }; },
  async lines(env, H) {
    const j = await call(this, env, H, '/api/line/list?show_internal=hide_internal&index=0&size=500&start=0&filters=%5B%5D&sorting=%5B%5D', { ajax: true });
    const rows = (Array.isArray(j.data) ? j.data : []).map((r) => ({ id: r.id, username: r.username || '', password: r.password || '', owner: r.owner_name || '', status: r.is_banned ? 'Bannata' : r.enabled === false ? 'Disattivata' : r.is_expired ? 'Scaduta' : 'Attiva', enabled: r.enabled !== false && !r.is_banned, expired: !!r.is_expired, trial: !!r.is_trial, type: r.package_name || '', conns: +r.active_connections || 0, max: +r.max_connections || 0, exp: ts(r.exp_date), expTxt: r.exp_date || '', notes: r.reseller_notes || '', ip: r.last_watched_from_ip || '', stream: r.last_watched_stream_name || '', last: r.last_watched_stream_time || '', pkg: r.package_id }));
    return { rows, dns: await this.dns(env, H).catch(() => ''), total: j.rowTotal != null ? +j.rowTotal : rows.length };
  },
  async packages(env, H) { const j = await call(this, env, H, '/api/packages/available?package_type=0&trial_or_official=official', { ajax: true }); return { packages: (Array.isArray(j) ? j : []).map((p) => ({ id: String(p.id), name: String(p.name || '').trim(), cost: +p.price_credits || 0, dur: durIt(p.description, p.duration_hours), max: p.max_connections, desc: p.description || '' })) }; },
  async createForm(env, H) {
    const { packages } = await this.packages(env, H); let ov = {}; try { ov = await this.overview(env, H); } catch {}
    return [
      { name: 'username', type: 'text', label: 'Utente (vuoto = lo genera KAIROS)', required: false, value: '' },
      { name: 'password', type: 'text', label: 'Password (vuota = la genera KAIROS)', required: false, value: '' },
      { name: 'package', type: 'select', label: `Pacchetto${ov.credits != null ? ' · crediti disponibili: ' + ov.credits : ''}`, required: true, options: packages.map((p) => ({ v: p.id, t: `${p.name} — ${p.cost} crediti${p.dur ? ' · ' + p.dur : ''}${p.max ? ' · ' + p.max + ' conn.' : ''}`, sel: false })) },
      { name: 'reseller_notes', type: 'textarea', label: 'Note', required: false, value: '' },
    ];
  },
  async create(env, H, v) {
    const { packages } = await this.packages(env, H);
    const p = packages.find((x) => x.id === String(v.package)); if (!p) throw new H.HttpErr(400, 'Scegli il pacchetto SLT');
    const username = String(v.username || '').trim() || 'kx' + randPass(8).toLowerCase(), password = String(v.password || '') || randPass(10);
    const tok = await this.csrf(env, H);
    const r = await call(this, env, H, '/lines/store-with-package', { form: { _token: tok, _method: 'POST', username, password, package: p.id, reseller_notes: String(v.reseller_notes || '').slice(0, 300) }, ref: '/lines/create-with-package', rawRes: true });
    if (r.status >= 400 || (r.j && (r.j.errors || r.j.error))) throw new H.HttpErr(400, 'SLT: ' + String((r.j && (r.j.error || r.j.message || JSON.stringify(r.j.errors))) || txtOf(r.txt).slice(0, 120) || `errore ${r.status}`).slice(0, 200));
    if (/\/lines\/create-with-package/.test(r.loc)) { const e = txtOf(r.txt).match(/(The [^.]{0,120}\.)/); throw new H.HttpErr(400, 'SLT: ' + (e ? e[1] : 'creazione rifiutata (controlla utente e pacchetto)')); }
    const L = await this.lines(env, H).catch(() => ({ rows: [] })); const made = L.rows.find((x) => x.username === username);
    return { id: made ? made.id : '', username, password: made ? made.password || password : password };
  },
  async action(env, H, b) {
    const id = String(b.id || '').replace(/[^\w-]/g, ''); if (!id) throw new H.HttpErr(400, 'Linea non valida');
    if (b.action === 'renew') { if (!b.package_id) throw new H.HttpErr(400, 'Scegli il pacchetto'); await this.post(env, H, `/lines/${id}/renew?package_id=${encodeURIComponent(String(b.package_id))}`, {}); return { what: 'rinnovata' }; }
    if (b.action === 'toggle') { const en = !!b.enabled; await this.post(env, H, `/lines/${en ? 'enable' : 'disable'}/${id}`, {}); return { what: en ? 'attivata' : 'disattivata' }; }
    if (b.action === 'kill') { await this.post(env, H, `/api/live-connections/kill/${id}`, { type: 'line' }); return { what: 'connessioni chiuse' }; }
    if (b.action === 'delete') { await this.post(env, H, `/lines/${id}`, {}, 'DELETE'); return { what: 'eliminata' }; }
    throw new H.HttpErr(400, 'Operazione sconosciuta');
  },
  async subs(env, H) { const j = await call(this, env, H, '/api/subresellers/list?index=0&size=200&start=0&filters=%5B%5D&sorting=%5B%5D', { ajax: true }); return { rows: (Array.isArray(j.data) ? j.data : []).map((r) => ({ id: r.id, username: r.username || r.name || '', owner: r.owner_name || r.parent_name || '', type: r.role_name || r.type || '', credits: r.credits != null ? r.credits : '', lines: r.lines_count != null ? r.lines_count : r.users_count != null ? r.users_count : '', status: r.enabled === false || r.is_banned ? 'Disattivato' : 'Attivo', enabled: r.enabled !== false && !r.is_banned })) }; },
  async subAction(env, H) { throw new H.HttpErr(400, 'Su SLT i sub-reseller si gestiscono dal loro pannello'); },
  async conns(env, H) { const j = await call(this, env, H, '/api/live-connections/index?limit=200&page=1&line_type=&mac_address=&line_search=&ip_search=&is_internal=null&all_search=&show_restreamer=1&owner_id=&show_my_lines=0&show_owner=0&stream_type=&stream_id=&server_id=&country_code=&type=online', { ajax: true }); const a = Array.isArray(j) ? j : Array.isArray(j.data) ? j.data : []; return { rows: a.map((r) => ({ id: r.id, username: r.username || (r.line && r.line.username) || '', stream: r.stream_display_name || r.stream_name || (r.stream && r.stream.name) || '', ip: r.user_ip || r.ip || '', info: [r.isp, r.country_code || r.geoip_country_code, r.user_agent].filter(Boolean).join(' · ') })) }; },
};

/** richiesta con la sessione salvata; se è scaduta rientra una volta da sola */
async function call(P, env, H, path, o = {}) {
  const KK = P.key || P.k;
  const c = await cfgOf(env, H, KK); if (!c) throw new H.HttpErr(400, P.key ? `Collega prima il tuo account ${P.name} (utente e password)` : `${P.name} non è collegato: scrivi utente e password nella sua sezione`);
  for (let i = 0; i < 2; i++) {
    let jar = await loadJar(env, H, KK);
    if (!Object.keys(jar).filter((k) => k !== 'VPZ').length) { await P.login(H, jar, c); await saveJar(env, H, KK, jar); }
    const r = await rawV(P, H, jar, path, o);
    if (P.gone(r)) { mem[KK + ':jar'] = null; await saveJar(env, H, KK, {}); if (i === 0) continue; throw new H.HttpErr(502, `${P.name} ha chiuso la sessione: riprova`); }
    await saveJar(env, H, KK, jar);
    if (o.rawRes) return r;
    if (o.html) return r.txt;
    if (r.status >= 400) throw new H.HttpErr(502, `${P.name}: risposta ${r.status}`);
    if (r.j == null) throw new H.HttpErr(502, `Risposta di ${P.name} non valida`);
    return r.j;
  }
}

const PANELS = { ro: RO, slt: SLT };
export async function extRoutes(req, env, path, who, ip, H, ag) {
  const m = req.method, { HttpErr, json, str } = H;
  const mm = path.match(/^\/(ro|slt)\/(.+)$/); if (!mm) return null;
  const k = mm[1], sub = mm[2], KK = keyOf(k, ag), P = Object.assign(Object.create(PANELS[k]), { key: KK });
  /* ---- solo titolare: account dei venditori (ognuno con il suo sub-reseller) ---- */
  if (!ag && sub === 'agents' && m === 'GET') { const rows = ((await env.DB.prepare('SELECT k, v FROM settings WHERE k LIKE ? AND k NOT LIKE ?').bind(k + ':ag:%', '%:ses').all()).results) || []; const out = []; for (const r of rows) { try { const c = await H.unseal(env, r.v); out.push({ id: +r.k.split(':')[2], user: c.user }); } catch {} } return json({ agents: out }); }
  const am = !ag && sub.match(/^agents\/(\d+)$/);
  if (am && (m === 'PUT' || m === 'DELETE')) {
    const id = +am[1], AK = keyOf(k, { id });
    if (m === 'DELETE') { mem[AK + ':jar'] = null; await env.DB.prepare('DELETE FROM settings WHERE k IN (?, ?)').bind(AK, AK + ':ses').run(); return json({ ok: true }); }
    const b = await H.readJSON(req, 4096), old = (await cfgOf(env, H, AK)) || {};
    const c = { user: str(b.user, 120).trim(), pass: str(b.pass, 200) || (b.user === old.user ? old.pass || '' : '') };
    if (!c.user || !c.pass) throw new HttpErr(400, `Scrivi utente e password ${P.name} del venditore`);
    const jar = {}; await P.login(H, jar, c); mem[AK + ':jar'] = null; await saveJar(env, H, AK, jar); await setRow(env, AK, await H.seal(env, c));
    await H.log(env, 'edit', `${who}: account ${P.name} del venditore #${id} collegato (${c.user})`, ip).catch(() => {});
    return json({ ok: true });
  }
  if (sub === 'state' && m === 'GET') { const c = await cfgOf(env, H, KK); return json(c ? { connected: true, user: c.user, agent: !!ag } : { connected: false, agent: !!ag }); }
  if (sub === 'config' && m === 'PUT') {
    const b = await H.readJSON(req, 4096), old = (await cfgOf(env, H, KK)) || {};
    const c = { user: str(b.user, 120).trim(), pass: str(b.pass, 200) || old.pass || '' };
    if (!c.user || !c.pass) throw new HttpErr(400, `Scrivi utente e password di ${P.name}`);
    const jar = {}; await P.login(H, jar, c); await saveJar(env, H, KK, jar);
    await setRow(env, KK, await H.seal(env, c)); mem[KK + ':csrf'] = ''; mem[KK + ':dns'] = undefined;
    await H.log(env, 'edit', `${who}: pannello ${P.name} collegato (account ${c.user})`, ip).catch(() => {});
    return json({ ok: true });
  }
  if (sub === 'config' && m === 'DELETE') { mem[KK + ':jar'] = null; await env.DB.prepare('DELETE FROM settings WHERE k IN (?, ?)').bind(KK, KK + ':ses').run(); return json({ ok: true }); }
  if (sub === 'overview' && m === 'GET') return json(await P.overview(env, H));
  if (sub === 'lines' && m === 'GET') { const L = await P.lines(env, H); if (ag) L.dns = ''; return json(L); }
  if (sub === 'packages' && m === 'GET') return json(await P.packages(env, H));
  if (sub === 'subs' && m === 'GET') return json(await P.subs(env, H));
  if (sub === 'conns' && m === 'GET') return json(await P.conns(env, H));
  if (sub === 'createform' && m === 'GET') return json({ fields: await P.createForm(env, H) });
  if (sub === 'lines/create' && m === 'POST') {
    const b = await H.readJSON(req, 16384), v = (b && b.fields) || {}, out = await P.create(env, H, v);
    await H.note(env, { src: k, app: P.name, owner: ag ? ag.id : 0, username: out.username, password: out.password, note: str(v.reseller_notes || '', 200) });
    await H.log(env, 'edit', `${who}: ${P.name} — linea ${str(out.username, 60)} creata`, ip).catch(() => {});
    return json({ ok: true, username: out.username, password: out.password, id: out.id || '' });
  }
  if (sub === 'lines/action' && m === 'POST') { const b = await H.readJSON(req, 4096), r = await P.action(env, H, b); await H.log(env, 'edit', `${who}: ${P.name} — linea ${str(b.username || b.id, 60)} ${r.what}`, ip).catch(() => {}); return json({ ok: true, ...r }); }
  if (sub === 'subs/action' && m === 'POST') { const b = await H.readJSON(req, 4096), r = await P.subAction(env, H, b); await H.log(env, 'edit', `${who}: ${P.name} — sub-reseller #${str(b.id, 40)} ${r.what}`, ip).catch(() => {}); return json({ ok: true }); }
  return null;
}
