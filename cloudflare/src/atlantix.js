import { sockFetch } from './wolf.js';
/* ---------------- Pannello Atlantix (cms.axdash.biz): linee, sub-reseller e connessioni del tuo account ----------------
   Atlantix non ha API pubbliche: il Worker entra con utente, password e «codice di accesso» del titolare e usa le
   stesse richieste JSON del loro pannello (api/...). Niente copie: si legge e si scrive su Atlantix.
   Credenziali e cookie salvati cifrati (settings 'atx' e 'atx:ses'). Solo il titolare. */
const URL0 = 'https://cms.axdash.biz';
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const K = 'atx';
const mem = { jar: null };
const setRow = (env, k, v) => env.DB.prepare('INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind(k, v).run();
const getRow = async (env, k) => ((await env.DB.prepare('SELECT v FROM settings WHERE k = ?').bind(k).first()) || {}).v || '';
const cookieHeader = (jar) => Object.entries(jar || {}).map(([k, v]) => `${k}=${v}`).join('; ');
function eatCookies(jar, res) {
  const list = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : (res.headers.get('set-cookie') || '').split(/,(?=\s*[A-Za-z0-9_-]+=)/);
  for (const c of list) { const m = c.match(/^\s*([^=;\s]+)=([^;]*)/); if (m) jar[m[1]] = m[2]; }
}
async function cfgOf(env, H) {
  const v = await getRow(env, K); if (!v) return null;
  try { const c = await H.unseal(env, v); return c && c.user ? c : null; } catch { return null; }
}
async function loadJar(env, H) {
  if (mem.jar) return mem.jar;
  try { const v = await getRow(env, K + ':ses'); mem.jar = v ? await H.unseal(env, v) : {}; } catch { mem.jar = {}; }
  if (!mem.jar || Array.isArray(mem.jar)) mem.jar = {};
  return mem.jar;
}
async function saveJar(env, H, jar) { mem.jar = jar; await setRow(env, K + ':ses', await H.seal(env, jar)).catch(() => {}); }

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
async function login(env, H, c, otp) {
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
  await saveJar(env, H, jar);
  return jar;
}
/** richiesta con la sessione salvata; se è scaduta rientra una volta da solo */
async function ax(env, H, path, o = {}) {
  const c = await cfgOf(env, H); if (!c) throw new H.HttpErr(400, 'Atlantix non è collegato: inserisci utente, password e codice di accesso');
  for (let i = 0; i < 2; i++) {
    let jar = await loadJar(env, H);
    if (!Object.keys(jar).length) jar = await login(env, H, c);
    const r = await raw(H, jar, path, o.html ? {} : { ajax: true, ...o });
    const gone = r.status === 401 || (r.j && r.j.data && r.j.data.redirect === 'login') || (r.status >= 300 && r.status < 400 && /login/.test(r.loc));
    if (gone) { mem.jar = {}; await saveJar(env, H, {}); if (i === 0) continue; throw new H.HttpErr(502, 'Atlantix ha chiuso la sessione: riprova'); }
    await saveJar(env, H, jar);
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
async function createForm(env, H) {
  const h = await ax(env, H, '/lines_users.php', { html: true });
  const f = (h.match(/<form\b[^>]*id="createLineForm"[^>]*>([\s\S]*?)<\/form>/i) || [])[1];
  if (!f) throw new H.HttpErr(502, 'Non trovo il modulo «Crea linea» su Atlantix');
  return parseForm(f);
}
const qs = (o) => new URLSearchParams({ ...o, _: Date.now() }).toString();

export async function atxRoutes(req, env, path, who, ip, H) {
  const m = req.method, { HttpErr, json, str } = H, u = new URL(req.url);
  const page = Math.max(1, Math.min(10000, parseInt(u.searchParams.get('page'), 10) || 1)), q = str(u.searchParams.get('q') || '', 80);
  if (path === '/atx/state' && m === 'GET') { const c = await cfgOf(env, H); return json(c ? { connected: true, user: c.user } : { connected: false }); }
  if (path === '/atx/config' && m === 'PUT') {
    const b = await H.readJSON(req, 4096), old = (await cfgOf(env, H)) || {};
    const c = { user: str(b.user, 80).trim(), pass: str(b.pass, 200) || old.pass || '', code: str(b.code, 80).trim() || (b.user === old.user ? old.code || '' : '') };
    if (!c.user || !c.pass) throw new HttpErr(400, 'Scrivi utente e password di Atlantix');
    mem.jar = null; await login(env, H, c, str(b.otp, 10).trim());
    await setRow(env, K, await H.seal(env, c));
    await H.log(env, 'edit', `${who}: pannello Atlantix collegato (account ${c.user})`, ip).catch(() => {});
    return json({ ok: true });
  }
  if (path === '/atx/config' && m === 'DELETE') { mem.jar = null; await env.DB.prepare("DELETE FROM settings WHERE k IN ('atx', 'atx:ses')").run(); return json({ ok: true }); }
  if (path === '/atx/overview' && m === 'GET') return json((await ax(env, H, '/api/dashboard/overview.php?' + qs({}))).data || {});
  const n = (k) => parseInt(u.searchParams.get(k), 10) || 0;
  if (path === '/atx/lines' && m === 'GET') {
    const P = (pg) => ax(env, H, '/api/lines/list.php?' + qs({ page: pg, per_page: 50, q, status: str(u.searchParams.get('status') || '', 20), reseller_id: n('reseller') || '', sort: '' })).then((r) => r.data || {});
    if (!u.searchParams.get('all')) return json(await P(page));
    // all=1: fino a 12 pagine insieme (600 linee), così KAIROS può ordinare e filtrare per scadenza su tutte
    const first = await P(1), rows = [...(first.rows || first.items || first.lines || first.users || first.list || first.data || [])];
    const pages = Math.min(12, +first.pages || 1);
    for (let pg = 2; pg <= pages; pg++) { const d = await P(pg); rows.push(...(d.rows || d.items || d.lines || d.users || d.list || d.data || [])); }
    return json({ ...first, rows, items: undefined, lines: undefined, users: undefined, list: undefined, data: undefined, pages: 1, page: 1, partial: +first.pages > 12 });
  }
  if (path === '/atx/line/conns' && m === 'GET') return json((await ax(env, H, '/api/lines/connections.php?' + qs({ user_id: n('id') }))).data || {});
  if (path === '/atx/subs' && m === 'GET') return json((await ax(env, H, '/api/subresellers/list.php?' + qs({ page, per_page: 50, q, owner: '', status: '' }))).data || {});
  if (path === '/atx/conns' && m === 'GET') return json((await ax(env, H, '/api/connections/list.php?' + qs({ reseller_id: '' }))).data || {});
  if (path === '/atx/createform' && m === 'GET') return json({ fields: (await createForm(env, H)).filter((f) => f.type !== 'hidden') });
  if (path === '/atx/lines/create' && m === 'POST') {
    const b = await H.readJSON(req, 16384), v = (b && b.fields) || {}, form = {};
    for (const f of await createForm(env, H)) {
      if (f.type === 'hidden') { form[f.name] = f.value || ''; continue; }
      const val = v[f.name];
      if (f.type === 'checkbox' || f.type === 'radio') { if (val === true || val === f.value) form[f.name] = f.value || '1'; continue; }
      if (val != null && val !== '') form[f.name] = str(String(val), 500);
    }
    const j = await ax(env, H, '/api/users/create.php', { form });
    const d = j.data || {};
    await H.note(env, { src: 'atx', app: 'Atlantix', owner: 0, username: d.username || form.username || '', password: d.password || form.password || '' });
    await H.log(env, 'edit', `${who}: Atlantix — linea ${str(d.username || form.username || '', 60)} creata`, ip).catch(() => {});
    return json({ ok: true, username: d.username || '', password: d.password || '' });
  }
  if (path === '/atx/lines/action' && m === 'POST') {
    const b = await H.readJSON(req, 4096), id = parseInt(b.user_id, 10);
    if (!(id > 0)) throw new HttpErr(400, 'Linea non valida');
    let body, what;
    if (b.action === 'renew') { const months = parseInt(b.months, 10); if (![1, 2, 3, 6, 12].includes(months)) throw new HttpErr(400, 'Mesi non validi'); body = { action: 'renew', user_id: id, months }; what = `rinnovata di ${months} mesi`; }
    else if (b.action === 'toggle') { body = { action: 'toggle', user_id: id, enabled: !!b.enabled }; what = b.enabled ? 'attivata' : 'disattivata'; }
    else if (b.action === 'save_notes') { body = { action: 'save_notes', user_id: id, notes: str(b.notes, 300) }; what = 'note aggiornate'; }
    else if (b.action === 'delete') { body = { action: 'delete', user_id: id }; what = 'eliminata'; }
    else throw new HttpErr(400, 'Operazione sconosciuta');
    const j = await ax(env, H, '/api/lines/action.php', { json: body });
    await H.log(env, 'edit', `${who}: Atlantix — linea #${id} ${what}`, ip).catch(() => {});
    return json({ ok: true, message: str(j.message || '', 200) });
  }
  if (path === '/atx/subs/action' && m === 'POST') {
    const b = await H.readJSON(req, 4096), id = String(parseInt(b.id, 10) || '');
    if (!id) throw new HttpErr(400, 'Sub-reseller non valido');
    const OPS = { enable: ['/subresellers_enable.php', 'riattivato'], disable: ['/subresellers_disable.php', 'disattivato'], users_on: ['/subresellers_enable_users.php', 'linee riattivate'], users_off: ['/subresellers_disable_users.php', 'linee disattivate'], sub_on: ['/subresellers_enable_subperm.php', 'può creare sub-reseller'], sub_off: ['/subresellers_disable_subperm.php', 'non può più creare sub-reseller'], delete: ['/subresellers_delete.php', 'eliminato'] };
    let form, url, what;
    if (b.op === 'credits') { const amount = parseInt(b.amount, 10); if (!amount || Math.abs(amount) > 100000) throw new HttpErr(400, 'Importo non valido'); url = '/subresellers_add_credits_action.php'; form = { sub_id: id, amount: String(amount), reason: str(b.reason, 200) }; what = amount > 0 ? `+${amount} crediti` : `${amount} crediti`; }
    else if (OPS[b.op]) { [url, what] = OPS[b.op]; form = { id }; }
    else throw new HttpErr(400, 'Operazione sconosciuta');
    await ax(env, H, url, { form });
    await H.log(env, 'edit', `${who}: Atlantix — sub-reseller #${id} ${what}`, ip).catch(() => {});
    return json({ ok: true });
  }
  if (path === '/atx/conns/kill' && m === 'POST') {
    const b = await H.readJSON(req, 1024), id = parseInt(b.activity_id, 10);
    if (!(id > 0)) throw new HttpErr(400, 'Connessione non valida');
    await ax(env, H, '/api/connections/kill.php', { json: { activity_id: id } });
    return json({ ok: true });
  }
  return null;
}
