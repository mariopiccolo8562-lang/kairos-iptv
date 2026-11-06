/* ---------------- WOLF: pannello reseller collegato a KAIROS ----------------
   WOLF non ha API: il Worker entra con utente e password del titolare (come dal browser) e usa le stesse richieste
   della pagina «Lines». Le linee non vengono copiate: la sezione «WOLF» del pannello legge e scrive su WOLF, così
   i due pannelli mostrano sempre gli stessi dati. Una linea si può collegare a un cliente KAIROS: se su WOLF (o da
   KAIROS) cambiano utente o password, la playlist del cliente si aggiorna da sola.
   Credenziali e cookie di WOLF sono salvati cifrati (settings 'wolf' e 'wolf:ses'). Solo il titolare. */
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
let mem = { jar: null, lines: null, t: 0 };

const setRow = (env, k, v) => env.DB.prepare('INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind(k, v).run();
const getRow = async (env, k) => ((await env.DB.prepare('SELECT v FROM settings WHERE k = ?').bind(k).first()) || {}).v || '';
const unent = (s) => String(s || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'");
const tokenOf = (h) => ((h.match(/name="_token"\s+value="([^"]+)"/) || [])[1]) || '';
const inputVal = (h, name) => unent(((h.match(new RegExp(`name="${name}"[^>]*value="([^"]*)"`)) || [])[1]) || '');

export async function wolfCfg(env, H) {
  const v = await getRow(env, 'wolf');
  if (!v) return null;
  try { const c = await H.unseal(env, v); return c && c.url && c.user ? c : null; } catch { return null; }
}

function cookieHeader(jar) { return Object.entries(jar || {}).map(([k, v]) => `${k}=${v}`).join('; '); }
function eatCookies(jar, res) {
  const list = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : (res.headers.get('set-cookie') || '').split(/,(?=\s*[A-Za-z0-9_-]+=)/);
  let ch = false;
  for (const c of list) { const m = c.match(/^\s*([^=;\s]+)=([^;]*)/); if (m && jar[m[1]] !== m[2]) { jar[m[1]] = m[2]; ch = true; } }
  return ch;
}
async function loadJar(env, H) {
  if (mem.jar) return mem.jar;
  try { const v = await getRow(env, 'wolf:ses'); mem.jar = v ? await H.unseal(env, v) : {}; } catch { mem.jar = {}; }
  if (!mem.jar || Array.isArray(mem.jar)) mem.jar = {};
  return mem.jar;
}
async function saveJar(env, H, jar) { mem.jar = jar; await setRow(env, 'wolf:ses', await H.seal(env, jar)).catch(() => {}); }

async function rawFetch(cfg, jar, path, o = {}) {
  const headers = { 'User-Agent': UA, Accept: o.ajax ? 'application/json, text/javascript, */*; q=0.01' : 'text/html,application/xhtml+xml', Cookie: cookieHeader(jar), Referer: cfg.url + '/lines' };
  if (o.ajax) { headers['X-Requested-With'] = 'XMLHttpRequest'; if (jar['XSRF-TOKEN']) headers['X-XSRF-TOKEN'] = decodeURIComponent(jar['XSRF-TOKEN']); }
  let body;
  if (o.form) { headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8'; body = new URLSearchParams(o.form).toString(); }
  let r;
  try { r = await fetch(cfg.url + path, { method: o.method || (o.form ? 'POST' : 'GET'), headers, body, redirect: 'manual' }); }
  catch { throw new Error('WOLF non risponde: controlla l\'indirizzo del pannello'); }
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
  await saveJar(env, H, jar);
  return jar;
}

/** richiesta a WOLF con la sessione salvata; se è scaduta rientra una volta da solo */
async function wf(env, H, cfg, path, o = {}) {
  for (let i = 0; i < 2; i++) {
    let jar = await loadJar(env, H);
    if (!jar.laravel_session) jar = await login(env, H, cfg);
    const before = JSON.stringify(jar);
    const r = await rawFetch(cfg, jar, path, o);
    const loc = r.headers.get('location') || '';
    let lp = ''; try { lp = new URL(loc, cfg.url).pathname.replace(/\/+$/, ''); } catch {}
    const out = r.status === 401 || r.status === 419 || (r.status >= 300 && r.status < 400 && (lp === '' || lp === '/login'));
    if (out) { mem.jar = {}; if (i === 0) continue; throw new H.HttpErr(502, 'WOLF ha chiuso la sessione: riprova'); }
    if (JSON.stringify(jar) !== before) await saveJar(env, H, jar);
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
    note: note === '-' ? '' : note, owner: unent(x.owner || ''), created: String(x.created_at || ''), watching: unent(x.stream_display_name || ''),
    tgl: tg[1] !== undefined ? +tg[1] : null, tglLabel: (tg[2] || '').trim(), dns: unent(m3u),
  };
}
async function fetchLines(env, H, cfg, fresh) {
  if (!fresh && mem.lines && Date.now() - mem.t < 15e3) return mem.lines;
  const f = { draw: '1', start: '0', length: '-1', id: 'users', filter: '', reseller: '', 'search[value]': '', 'search[regex]': 'false', 'order[0][column]': '0', 'order[0][dir]': 'desc' };
  COLS.forEach((c, i) => { f[`columns[${i}][data]`] = c; f[`columns[${i}][name]`] = c === 'expired' ? 'username' : c; f[`columns[${i}][searchable]`] = 'true'; f[`columns[${i}][orderable]`] = 'true'; });
  const j = await wfJson(env, H, cfg, '/lines/data', f);
  mem.lines = (j.data || []).map(rowOut); mem.t = Date.now();
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

export async function wolfRoutes(req, env, path, who, ip, H) {
  const m = req.method;
  const { HttpErr, json, str } = H;
  if (path === '/wolf/config' && m === 'GET') { const c = await wolfCfg(env, H); return json({ set: !!c, url: c ? c.url : '', user: c ? c.user : '', dns: c ? c.dns || '' : '' }); }
  if (path === '/wolf/config' && m === 'PUT') {
    const b = await H.readJSON(req, 4096), old = (await wolfCfg(env, H)) || {};
    let url = str(b.url, 200).replace(/\/+$/, '');
    if (!/^https?:\/\/[^/\s]+$/.test(url)) throw new HttpErr(400, 'Indirizzo di WOLF non valido, es. https://pannello.esempio.com');
    const user = str(b.user, 120), pass = typeof b.pass === 'string' && b.pass ? b.pass.slice(0, 200) : old.url === url && old.user === user ? old.pass : '';
    if (!user || !pass) throw new HttpErr(400, 'Scrivi utente e password di WOLF');
    let dns = str(b.dns, 200).replace(/\/+$/, ''); if (dns && !/^https?:\/\/[^/\s]+$/.test(dns)) throw new HttpErr(400, 'DNS non valido, es. http://server.tv:8080');
    const cfg = { url, user, pass, dns };
    mem = { jar: null, lines: null, t: 0 };
    await login(env, H, cfg);
    if (!dns) { const l = await fetchLines(env, H, cfg, true).catch(() => []); cfg.dns = (l.find((x) => x.dns) || {}).dns || ''; }
    await setRow(env, 'wolf', await H.seal(env, cfg));
    await H.log(env, 'edit', `${who}: pannello WOLF collegato (${url})`, ip);
    return json({ ok: true, dns: cfg.dns });
  }
  if (path === '/wolf/config' && m === 'DELETE') {
    await env.DB.prepare("DELETE FROM settings WHERE k IN ('wolf', 'wolf:ses')").run(); mem = { jar: null, lines: null, t: 0 };
    await H.log(env, 'del', `${who}: pannello WOLF scollegato`, ip);
    return json({ ok: true });
  }
  if (!path.startsWith('/wolf/')) return null;
  const cfg = await wolfCfg(env, H);
  if (!cfg) throw new HttpErr(400, 'Collega prima il pannello WOLF (indirizzo, utente e password)');

  if (path === '/wolf/lines' && m === 'GET') {
    const fresh = new URL(req.url).searchParams.get('fresh') === '1';
    const [lines, cr] = await Promise.all([fetchLines(env, H, cfg, fresh), credits(env, H, cfg).catch(() => null)]);
    const synced = await syncLinks(env, H, lines, who, ip).catch(() => 0);
    const L = await links(env);
    const names = new Map((((await env.DB.prepare(`SELECT id, name, code FROM devices WHERE id IN (${L.map(() => '?').join(',') || "''"})`).bind(...L.map((k) => k.device_id)).all()).results) || []).map((d) => [d.id, d.name || d.code]));
    return json({ lines, credits: cr, dns: cfg.dns || '', synced, links: L.map((k) => ({ line: +k.line_id, device: k.device_id, name: names.get(k.device_id) || 'cliente eliminato' })) });
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
    const l = (await fetchLines(env, H, cfg, true)).find((x) => x.username === username);
    if (l && b.deviceId) await linkLine(env, H, cfg, l, str(b.deviceId, 20), who, ip).catch(() => {});
    await H.log(env, 'new', `${who}: WOLF — linea ${username} creata`, ip);
    return json({ ok: true, id: l ? l.id : null, message: unent(j.message || '') });
  }
  const lm = path.match(/^\/wolf\/lines\/(\d+)(\/extend|\/toggle|\/kick)?$/);
  if (lm) {
    const id = +lm[1], act = lm[2] || '';
    if (!act && m === 'PUT') {
      const b = await H.readJSON(req, 4096);
      const page = await wfPage(env, H, cfg, `/lines/edit/${id}`);
      const ou = inputVal(page, 'username'); if (!ou) throw new HttpErr(404, 'Linea non trovata su WOLF');
      const username = b.username !== undefined ? okUser(b.username, H, 'Utente') : ou;
      const password = b.password !== undefined ? okUser(b.password, H, 'Password') : inputVal(page, 'password');
      const description = b.note !== undefined ? str(b.note, 300) || '-' : descOf(page);
      await wfJson(env, H, cfg, `/lines/edit/${id}`, { _token: tokenOf(page), current_bouquets: bqOf(page, H), username, password, owner: '', description });
      const lines = await fetchLines(env, H, cfg, true);
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
      mem.lines = null;
      await H.log(env, 'edit', `${who}: WOLF — linea ${username} rinnovata`, ip);
      return json({ ok: true });
    }
    if (act === '/toggle' && m === 'POST') {
      const l = (await fetchLines(env, H, cfg, true)).find((x) => x.id === id);
      if (!l || l.tgl === null) throw new HttpErr(404, 'Linea non trovata su WOLF');
      await wfJson(env, H, cfg, `/lines/disable/${id}/${l.tgl}`);
      mem.lines = null;
      await H.log(env, 'edit', `${who}: WOLF — linea ${l.username} ${l.enabled ? 'disattivata' : 'attivata'}`, ip);
      return json({ ok: true });
    }
    if (act === '/kick' && m === 'POST') { await wfJson(env, H, cfg, `/lines/kick/${id}`); mem.lines = null; return json({ ok: true }); }
    if (!act && m === 'DELETE') {
      const l = (await fetchLines(env, H, cfg)).find((x) => x.id === id);
      await wfJson(env, H, cfg, `/lines/delete/${id}`);
      await env.DB.prepare('DELETE FROM wolf_links WHERE line_id = ?').bind(id).run();
      mem.lines = null;
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
      mem.lines = null;
      await H.log(env, 'edit', `${who}: WOLF — reseller ${r.username} ${r.enabled ? 'disattivato' : 'attivato'}${withLines ? ' con tutte le sue linee' : ''}`, ip);
      return json({ ok: true });
    }
    if (act === '/delete' && m === 'POST') {
      const b = await H.readJSON(req, 512);
      if (String(b.confirm || '') !== r.username) throw new HttpErr(400, 'Per eliminare scrivi esattamente il nome del reseller');
      await wfJson(env, H, cfg, `/resellers/delete/${id}`);
      mem.lines = null;
      await H.log(env, 'del', `${who}: WOLF — reseller ${r.username} eliminato con tutte le sue linee`, ip);
      return json({ ok: true });
    }
  }
  if (path === '/wolf/links' && m === 'POST') {
    const b = await H.readJSON(req, 1024);
    const l = (await fetchLines(env, H, cfg)).find((x) => x.id === +b.line);
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
