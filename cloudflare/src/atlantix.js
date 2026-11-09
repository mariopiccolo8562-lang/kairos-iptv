import { sockFetch } from './wolf.js';
/* ---------------- Pannello Atlantix (cms.axdash.biz): linee, sub-reseller e connessioni del tuo account ----------------
   Atlantix non ha API pubbliche: il Worker entra con utente, password e «codice di accesso» e usa le
   stesse richieste JSON del loro pannello (api/...). Niente copie: si legge e si scrive su Atlantix.
   Credenziali e cookie sono salvati cifrati, separati per titolare e agente. */
const URL0 = 'https://cms.axdash.biz';
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const K = 'atx';
const mem = {};
const keyOf = (ag) => ag ? `${K}:ag:${ag.id}` : K;
const PRIVATE_KEY = /^(?:dns|host|portal|m3u|url|server|domain)(?:_|[A-Z]|$)|(?:^|_)(?:dns|host|portal|m3u|url|server|domain)(?:_|[A-Z]|$)|^(?:resellers?|owners?|parents?|accounts?)(?:_id|_name|_username|_user|_url|_dns|_host|_portal)?$/i;
const PRIVATE_FORM = /^(?:dns|host|portal|m3u|url|server|domain)(?:_|$)|(?:^|_)(?:dns|host|portal|m3u|url|server|domain)(?:_|$)|^(?:resellers?|owners?|parents?|accounts?)(?:_|$)/i;
const safeAgentText = (value) => String(value || '').replace(/(?:https?:\/\/|www\.)[^\s<>"']+/gi, '[link rimosso]');
function safeAgentData(value) {
  if (Array.isArray(value)) return value.map(safeAgentData);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([k]) => !PRIVATE_KEY.test(k)).map(([k, v]) => [k, safeAgentData(v)]));
}
function safeAgentOverview(value) {
  const data = safeAgentData(value);
  const stripAccount = (v) => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return v;
    const out = { ...v };
    for (const key of Object.keys(out)) if (/^(?:user|username|account|account_name|account_user)$/i.test(key)) delete out[key];
    return out;
  };
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
  const out = stripAccount(data);
  if (out.member) out.member = stripAccount(out.member);
  delete out.account;
  return out;
}
async function markConnData(env, data, H) {
  if (!H.vpnMark) return data;
  const mark = async (rows) => {
    try {
      const marked = await H.vpnMark(env, rows, { ip: (r) => r.user_ip || r.ip, isp: (r) => r.isp });
      return Array.isArray(marked) ? marked : rows;
    } catch { return rows; }
  };
  if (Array.isArray(data)) return mark(data);
  if (!data || typeof data !== 'object') return data;
  const key = ['rows', 'items', 'connections', 'users', 'list', 'data'].find((k) => Array.isArray(data[k]));
  return key ? { ...data, [key]: await mark(data[key]) } : data;
}
const setRow = (env, k, v) => env.DB.prepare('INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind(k, v).run();
const getRow = async (env, k) => ((await env.DB.prepare('SELECT v FROM settings WHERE k = ?').bind(k).first()) || {}).v || '';
const cookieHeader = (jar) => Object.entries(jar || {}).map(([k, v]) => `${k}=${v}`).join('; ');
function eatCookies(jar, res) {
  const list = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : (res.headers.get('set-cookie') || '').split(/,(?=\s*[A-Za-z0-9_-]+=)/);
  for (const c of list) { const m = c.match(/^\s*([^=;\s]+)=([^;]*)/); if (m) jar[m[1]] = m[2]; }
}
async function cfgOf(env, H, k = K) {
  const v = await getRow(env, k); if (!v) return null;
  try { const c = await H.unseal(env, v); return c && c.user ? c : null; } catch { return null; }
}
async function loadJar(env, H, k = K) {
  if (mem[k + ':jar']) return mem[k + ':jar'];
  let jar;
  try { const v = await getRow(env, k + ':ses'); jar = v ? await H.unseal(env, v) : {}; } catch { jar = {}; }
  if (!jar || Array.isArray(jar)) jar = {};
  return (mem[k + ':jar'] = jar);
}
async function saveJar(env, H, jar, k = K) { mem[k + ':jar'] = jar; await setRow(env, k + ':ses', await H.seal(env, jar)).catch(() => {}); }

async function raw(H, jar, path, o = {}) {
  const headers = { 'User-Agent': UA, Accept: o.json !== undefined || o.ajax ? 'application/json, */*' : 'text/html', Cookie: cookieHeader(jar), Referer: URL0 + '/dashboard', Origin: URL0 };
  if (o.json !== undefined || o.ajax) headers['X-Requested-With'] = 'XMLHttpRequest';
  let body; if (o.json !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(o.json); }
  else if (o.form) { headers['Content-Type'] = 'application/x-www-form-urlencoded'; headers['X-Requested-With'] = 'XMLHttpRequest'; headers.Accept = 'application/json, */*'; body = new URLSearchParams(o.form).toString(); }
  const req = { method: body ? 'POST' : 'GET', headers, body };
  let r;
  try { r = await sockFetch(URL0 + path, req); }
  catch (e) {
    if (!e || !e.early) throw new H.HttpErr(502, 'Atlantix non risponde: riprova');
    try { r = await fetch(URL0 + path, { ...req, redirect: 'manual' }); } catch { throw new H.HttpErr(502, 'Atlantix non risponde: riprova'); }
  }
  eatCookies(jar, r);
  const txt = await r.text(); let j = null; try { j = JSON.parse(txt); } catch {}
  return { status: r.status, txt, j, loc: r.headers.get('location') || '' };
}
async function login(env, H, c, otp, k = K) {
  const jar = {};
  const p = await raw(H, jar, '/login');
  const csrf = (p.txt.match(/id="csrf"\s+value="([^"]+)"/) || p.txt.match(/value="([^"]+)"\s+id="csrf"/) || [])[1] || '';
  if (!csrf) throw new H.HttpErr(502, `Non trovo la pagina di accesso di Atlantix (risposta ${p.status})`);
  let r = await raw(H, jar, '/api/auth/login.php', { json: { csrf, step: 'login', username: c.user, password: c.pass, access_code: c.code || '' } });
  if (r.j && r.j.success && r.j.data && r.j.data.need_otp) {
    if (!otp) throw new H.HttpErr(400, 'Atlantix chiede il codice a 6 cifre dell\'Authenticator: scrivilo nel campo «Codice 2FA» e premi di nuovo Collega');
    r = await raw(H, jar, '/api/auth/login.php', { json: { csrf, step: 'otp', otp } });
  }
  if (!r.j || !r.j.success) throw new H.HttpErr(400, 'Atlantix: ' + String((r.j && r.j.message) || `accesso non riuscito (${r.status})`).slice(0, 200));
  await saveJar(env, H, jar, k);
  return jar;
}
/** richiesta con la sessione salvata; se è scaduta rientra una volta da solo */
async function ax(env, H, path, o = {}, k = K) {
  const c = await cfgOf(env, H, k); if (!c) throw new H.HttpErr(400, 'Atlantix non è collegato: inserisci utente, password e codice di accesso');
  for (let i = 0; i < 2; i++) {
    let jar = await loadJar(env, H, k);
    if (!Object.keys(jar).length) jar = await login(env, H, c, '', k);
    const r = await raw(H, jar, path, o.html ? {} : { ajax: true, ...o });
    const gone = r.status === 401 || (r.j && r.j.data && r.j.data.redirect === 'login') || (r.status >= 300 && r.status < 400 && /login/.test(r.loc));
    if (gone) { mem[k + ':jar'] = {}; await saveJar(env, H, {}, k); if (i === 0) continue; throw new H.HttpErr(502, 'Atlantix ha chiuso la sessione: riprova'); }
    await saveJar(env, H, jar, k);
    if (o.html) return r.txt;
    if (!r.j) throw new H.HttpErr(502, r.status === 404 ? 'Questa funzione non esiste su Atlantix' : `Risposta di Atlantix non valida (${r.status})`);
    if (!(r.j.success || r.j.ok) || r.j.error) throw new H.HttpErr(400, 'Atlantix: ' + String(r.j.message || r.j.error || 'operazione non riuscita').slice(0, 200));
    return r.j;
  }
}
const at = (t, n) => { const m = t.match(new RegExp('(?:^|\\s)' + n + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\')', 'i')); return m ? unent(m[1] != null ? m[1] : m[2]) : null; };
const has = (t, n) => new RegExp('\\s' + n + '(\\s|=|>|/|$)', 'i').test(t);
const unent = (s) => String(s || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'");
const txtOf = (h) => unent(String(h || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
function parseForm(f) {
  const out = [], seen = new Set();
  const walk = (src, lab) => {
    const re = /<label\b[^>]*>([\s\S]*?)<\/label>|<input\b[^>]*>|<select\b[^>]*>[\s\S]*?<\/select>|<textarea\b[^>]*>[\s\S]*?<\/textarea>/gi;
    let m, last = lab || '';
    while ((m = re.exec(src))) {
      const t = m[0];
      if (m[1] != null) { const inner = m[1]; const l = txtOf(inner.replace(/<(select|textarea)\b[\s\S]*?<\/\1>/gi, '')); if (/<(input|select|textarea)\b/i.test(inner)) walk(inner, l); else last = l; continue; }
      const name = at(t, 'name'); if (!name || seen.has(name)) continue;
      const tag = t.slice(1, 7).toLowerCase(), type = tag.startsWith('select') ? 'select' : tag.startsWith('textar') ? 'textarea' : (at(t, 'type') || 'text').toLowerCase();
      if (['submit', 'button', 'reset', 'file', 'image'].includes(type)) continue;
      seen.add(name);
      const x = { name, type, label: last || at(t, 'placeholder') || name, required: has(t, 'required') };
      if (type === 'select') x.options = [...t.matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi)].map((o) => ({ v: at(o[1], 'value') ?? txtOf(o[2]), t: txtOf(o[2]), sel: has(o[1], 'selected') }));
      else if (type === 'textarea') x.value = txtOf(t.replace(/^<textarea\b[^>]*>/i, '').replace(/<\/textarea>$/i, ''));
      else { x.value = at(t, 'value') || ''; if (type === 'checkbox' || type === 'radio') x.checked = has(t, 'checked'); if (at(t, 'placeholder')) x.ph = at(t, 'placeholder'); if (at(t, 'min')) x.min = at(t, 'min'); if (at(t, 'max')) x.max = at(t, 'max'); }
      out.push(x); last = '';
    }
  };
  walk(f, '');
  return out;
}
/** campi del modulo «Crea linea» di Atlantix (lines_users.php → #createLineForm), così KAIROS mostra le stesse opzioni */
async function createForm(env, H, k = K) {
  const h = await ax(env, H, '/lines_users.php', { html: true }, k);
  const f = (h.match(/<form\b[^>]*id="createLineForm"[^>]*>([\s\S]*?)<\/form>/i) || [])[1];
  if (!f) throw new H.HttpErr(502, 'Non trovo il modulo «Crea linea» su Atlantix');
  return parseForm(f);
}
const qs = (o) => new URLSearchParams({ ...o, _: Date.now() }).toString();

export async function atxRoutes(req, env, path, who, ip, H, ag) {
  const m = req.method, { HttpErr, json, str } = H, u = new URL(req.url);
  const KK = keyOf(ag);
  const page = Math.max(1, Math.min(10000, parseInt(u.searchParams.get('page'), 10) || 1)), q = str(u.searchParams.get('q') || '', 80);
  const axFor = (p, o = {}) => ax(env, H, p, o, KK);
  const allowedAgentRoutes = new Set([
    'GET /atx/state', 'PUT /atx/config', 'DELETE /atx/config', 'GET /atx/overview',
    'GET /atx/lines', 'GET /atx/line/conns', 'GET /atx/conns', 'GET /atx/createform',
    'POST /atx/lines/create', 'POST /atx/lines/action', 'POST /atx/correction',
  ]);
  if (ag && !allowedAgentRoutes.has(`${m} ${path}`)) throw new HttpErr(403, 'Non puoi usare questa funzione del pannello Atlantix');
  if (!ag && path === '/atx/agents' && m === 'GET') {
    const rows = ((await env.DB.prepare('SELECT k, v FROM settings WHERE k LIKE ? AND k NOT LIKE ?').bind(K + ':ag:%', '%:ses').all()).results) || [];
    const agents = [];
    for (const r of rows) {
      try {
        const c = await H.unseal(env, r.v), id = +String(r.k).split(':')[2];
        if (id > 0 && c && c.user) agents.push({ id, user: c.user });
      } catch {}
    }
    return json({ agents });
  }
  const am = !ag && path.match(/^\/atx\/agents\/(\d+)$/);
  if (am && (m === 'PUT' || m === 'DELETE')) {
    const id = +am[1], AK = keyOf({ id });
    const agent = await env.DB.prepare("SELECT username FROM admins WHERE id = ? AND role = 'agent'").bind(id).first();
    if (!agent) throw new HttpErr(404, 'Agente non trovato');
    const label = str(agent.username || `#${id}`, 80);
    if (m === 'DELETE') {
      const c = await cfgOf(env, H, AK).catch(() => null);
      mem[AK + ':jar'] = null;
      await env.DB.prepare('DELETE FROM settings WHERE k IN (?, ?)').bind(AK, AK + ':ses').run();
      if (c) await H.log(env, 'del', `${who}: account Atlantix del venditore ${label} scollegato`, ip).catch(() => {});
      return json({ ok: true });
    }
    const b = await H.readJSON(req, 4096), old = (await cfgOf(env, H, AK)) || {};
    const user = str(b.user, 120).trim();
    const sameUser = user === old.user;
    const c = { user, pass: str(b.pass, 200) || (sameUser ? old.pass || '' : ''), code: str(b.code, 80).trim() || (sameUser ? old.code || '' : '') };
    if (!c.user || !c.pass) throw new HttpErr(400, 'Scrivi utente e password Atlantix del venditore');
    mem[AK + ':jar'] = null;
    await login(env, H, c, str(b.otp, 10).trim(), AK);
    await setRow(env, AK, await H.seal(env, c));
    await H.log(env, 'edit', `${who}: account Atlantix del venditore ${label} collegato (${c.user})`, ip).catch(() => {});
    return json({ ok: true });
  }
  if (path === '/atx/state' && m === 'GET') { const c = await cfgOf(env, H, KK); return json(c ? { connected: true, user: c.user, agent: !!ag } : { connected: false, agent: !!ag }); }
  if (path === '/atx/config' && m === 'PUT') {
    const b = await H.readJSON(req, 4096), old = (await cfgOf(env, H, KK)) || {};
    const user = str(b.user, 120).trim(), sameUser = user === old.user;
    const c = { user, pass: str(b.pass, 200) || (sameUser ? old.pass || '' : ''), code: str(b.code, 80).trim() || (sameUser ? old.code || '' : '') };
    if (!c.user || !c.pass) throw new HttpErr(400, 'Scrivi utente e password di Atlantix');
    mem[KK + ':jar'] = null; await login(env, H, c, str(b.otp, 10).trim(), KK);
    await setRow(env, KK, await H.seal(env, c));
    await H.log(env, 'edit', `${who}: pannello Atlantix collegato (account ${c.user})`, ip).catch(() => {});
    return json({ ok: true });
  }
  if (path === '/atx/config' && m === 'DELETE') { const c = await cfgOf(env, H, KK); mem[KK + ':jar'] = null; await env.DB.prepare('DELETE FROM settings WHERE k IN (?, ?)').bind(KK, KK + ':ses').run(); if (c) await H.log(env, 'del', `${who}: pannello Atlantix scollegato (account ${c.user})`, ip).catch(() => {}); return json({ ok: true }); }
  if (path === '/atx/overview' && m === 'GET') { const data = (await axFor('/api/dashboard/overview.php?' + qs({}))).data || {}; return json(ag ? safeAgentOverview(data) : data); }
  const n = (k) => parseInt(u.searchParams.get(k), 10) || 0;
  if (path === '/atx/lines' && m === 'GET') {
    const P = (pg) => axFor('/api/lines/list.php?' + qs({ page: pg, per_page: 50, q, status: str(u.searchParams.get('status') || '', 20), reseller_id: ag ? '' : n('reseller') || '', sort: '' })).then((r) => r.data || {});
    if (!u.searchParams.get('all')) { const data = await P(page); return json(ag ? safeAgentData(data) : data); }
    // all=1: fino a 12 pagine insieme (600 linee), così KAIROS può ordinare e filtrare per scadenza su tutte
    const first = await P(1), rows = [...(first.rows || first.items || first.lines || first.users || first.list || first.data || [])];
    const pages = Math.min(12, +first.pages || 1);
    for (let pg = 2; pg <= pages; pg++) { const d = await P(pg); rows.push(...(d.rows || d.items || d.lines || d.users || d.list || d.data || [])); }
    return json(ag ? safeAgentData({ ...first, rows, items: undefined, lines: undefined, users: undefined, list: undefined, data: undefined, pages: 1, page: 1, partial: +first.pages > 12 })
      : { ...first, rows, items: undefined, lines: undefined, users: undefined, list: undefined, data: undefined, pages: 1, page: 1, partial: +first.pages > 12 });
  }
  if (path === '/atx/line/conns' && m === 'GET') { const data = await markConnData(env, (await axFor('/api/lines/connections.php?' + qs({ user_id: n('id') }))).data || {}, H); return json(ag ? safeAgentData(data) : data); }
  if (path === '/atx/subs' && m === 'GET') return json((await axFor('/api/subresellers/list.php?' + qs({ page, per_page: 50, q, owner: '', status: '' }))).data || {});
  if (path === '/atx/conns' && m === 'GET') { const data = await markConnData(env, (await axFor('/api/connections/list.php?' + qs({ reseller_id: '' }))).data || {}, H); return json(ag ? safeAgentData(data) : data); }
  if (path === '/atx/createform' && m === 'GET') {
    const fields = (await createForm(env, H, KK)).filter((f) => f.type !== 'hidden');
    return json({ fields: ag ? fields.filter((f) => !PRIVATE_FORM.test(f.name)).map(safeAgentData) : fields });
  }
  if (path === '/atx/lines/create' && m === 'POST') {
    const b = await H.readJSON(req, 16384), v = (b && b.fields) || {}, form = {};
    for (const f of await createForm(env, H, KK)) {
      if (ag && PRIVATE_FORM.test(f.name)) continue;
      if (f.type === 'hidden') { form[f.name] = f.value || ''; continue; }
      const val = v[f.name];
      if (f.type === 'checkbox' || f.type === 'radio') { if (val === true || val === f.value) form[f.name] = f.value || '1'; continue; }
      if (val != null && val !== '') form[f.name] = str(String(val), 500);
    }
    const j = await axFor('/api/users/create.php', { form });
    const d = j.data || {};
    await H.note(env, { src: 'atx', app: 'Atlantix', owner: ag ? ag.id : 0, username: d.username || form.username || '', password: d.password || form.password || '' });
    await H.log(env, 'edit', `${who}: Atlantix — linea ${str(d.username || form.username || '', 60)} creata`, ip).catch(() => {});
    return json({ ok: true, username: d.username || '', password: d.password || '' });
  }
  if (path === '/atx/lines/action' && m === 'POST') {
    const b = await H.readJSON(req, 4096), id = parseInt(b.user_id, 10);
    if (!(id > 0)) throw new HttpErr(400, 'Linea non valida');
    const username = str(b.user, 120).trim(), d = {};
    let body, what;
    if (b.action === 'renew') { const months = parseInt(b.months, 10); if (![1, 2, 3, 6, 12].includes(months)) throw new HttpErr(400, 'Mesi non validi'); body = { action: 'renew', user_id: id, months }; what = `rinnovata · ${months} ${months === 1 ? 'mese' : 'mesi'}`; }
    else if (b.action === 'toggle') { body = { action: 'toggle', user_id: id, enabled: !!b.enabled }; what = b.enabled ? 'attivata' : 'disattivata'; }
    else if (b.action === 'save_notes') { body = { action: 'save_notes', user_id: id, notes: str(b.notes, 300) }; what = 'note aggiornate'; }
    else if (b.action === 'delete') { body = { action: 'delete', user_id: id }; what = 'eliminata'; }
    else throw new HttpErr(400, 'Operazione sconosciuta');
    const j = await axFor('/api/lines/action.php', { json: body });
    Object.assign(d, j.data && typeof j.data === 'object' ? j.data : {});
    if (b.action === 'renew') {
      const credits = d.credits_spent ?? d.credits_used ?? d.debited ?? d.cost ?? j.credits_spent ?? j.credits_used ?? j.debited ?? j.cost;
      const expiry = d.new_exp ?? d.exp_date ?? d.expires_at ?? j.new_exp ?? j.exp_date ?? j.expires_at;
      if (credits !== undefined && credits !== null) what += ` · ${str(String(credits), 30)} crediti`;
      if (expiry !== undefined && expiry !== null) what += ` · scadenza ${str(String(expiry), 40)}`;
    }
    await H.log(env, 'edit', `${who}: Atlantix — linea ${username || `#${id}`} (#${id}) ${what}`, ip).catch(() => {});
    return json({ ok: true, message: ag ? safeAgentText(str(j.message || '', 200)) : str(j.message || '', 200) });
  }
  if (path === '/atx/correction' && m === 'POST') {
    const b = await H.readJSON(req, 2048), action = str(b.action, 40);
    if (!['status', 'change_expiry', 'change_package', 'delete'].includes(action)) throw new HttpErr(400, 'Operazione sconosciuta');
    const body = { action };
    let date = '', packageId = 0;
    if (action !== 'status') {
      const token = str(b.token, 200).trim();
      if (!token) throw new HttpErr(400, 'Correzione scaduta');
      body.token = token;
      if (action === 'change_expiry') {
        date = str(b.date, 20).trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpErr(400, 'Data non valida');
        body.date = date;
      }
      if (action === 'change_package') {
        packageId = Number(b.package_id);
        if (!Number.isInteger(packageId) || packageId <= 0) throw new HttpErr(400, 'Pacchetto non valido');
        body.package_id = packageId;
      }
    }
    const j = await axFor('/api/lines/correction.php', { json: body });
    const d = j.data && typeof j.data === 'object' ? j.data : {};
    const num = (v) => Number.isFinite(+v) ? +v : 0;
    if (action === 'status') {
      const result = { active: !!d.active };
      if (result.active) Object.assign(result, {
        token: str(d.token, 200),
        username: str(d.username, 120),
        expires_at: num(d.expires_at),
        new_exp: num(d.new_exp),
        package_id: num(d.package_id),
        debited: num(d.debited),
        packages: (Array.isArray(d.packages) ? d.packages : []).slice(0, 50).map((p) => ({
          id: num(p && p.id),
          name: str(p && p.name, 80),
          credits: num(p && p.credits),
        })),
      });
      return json(result);
    }
    const refund = num(d.refund), extraDebit = num(d.extra_debit), username = str(b.user, 120).trim();
    const operation = action === 'change_expiry' ? `scadenza ${date}` : action === 'change_package' ? `pacchetto ${packageId}` : 'eliminata';
    await H.log(env, 'edit', `${who}: Atlantix — correzione linea${username ? ` ${username}` : ''}: ${operation} · rimborsati ${refund} / scalati ${extraDebit} crediti`, ip).catch(() => {});
    return json({ ok: true, refund, extra_debit: extraDebit, message: ag ? safeAgentText(str(j.message || '', 200)) : str(j.message || '', 200) });
  }
  if (path === '/atx/subs/action' && m === 'POST') {
    const b = await H.readJSON(req, 4096), id = String(parseInt(b.id, 10) || ''), username = str(b.user, 120).trim();
    if (!id) throw new HttpErr(400, 'Sub-reseller non valido');
    const OPS = { enable: ['/subresellers_enable.php', 'riattivato'], disable: ['/subresellers_disable.php', 'disattivato'], users_on: ['/subresellers_enable_users.php', 'linee riattivate'], users_off: ['/subresellers_disable_users.php', 'linee disattivate'], sub_on: ['/subresellers_enable_subperm.php', 'può creare sub-reseller'], sub_off: ['/subresellers_disable_subperm.php', 'non può più creare sub-reseller'], delete: ['/subresellers_delete.php', 'eliminato'] };
    let form, url, what;
    if (b.op === 'credits') { const amount = parseInt(b.amount, 10); if (!amount || Math.abs(amount) > 100000) throw new HttpErr(400, 'Importo non valido'); url = '/subresellers_add_credits_action.php'; form = { sub_id: id, amount: String(amount), reason: str(b.reason, 200) }; what = amount > 0 ? `+${amount} crediti` : `${amount} crediti`; }
    else if (OPS[b.op]) { [url, what] = OPS[b.op]; form = { id }; }
    else throw new HttpErr(400, 'Operazione sconosciuta');
    await axFor(url, { form });
    const reason = b.op === 'credits' ? str(b.reason, 80).trim() : '';
    await H.log(env, 'edit', `${who}: Atlantix — sub-reseller ${str(username, 80) || `#${id}`} (#${id}) ${what}${reason ? ` · motivo ${reason}` : ''}`, ip).catch(() => {});
    return json({ ok: true });
  }
  if (path === '/atx/conns/kill' && m === 'POST') {
    const b = await H.readJSON(req, 1024), id = parseInt(b.activity_id, 10);
    if (!(id > 0)) throw new HttpErr(400, 'Connessione non valida');
    await axFor('/api/connections/kill.php', { json: { activity_id: id } });
    const username = str(b.user, 120).trim();
    await H.log(env, 'edit', `${who}: Atlantix — linea ${username || 'sconosciuta'} · connessione ${id} disconnessa`, ip).catch(() => {});
    return json({ ok: true });
  }
  return null;
}
