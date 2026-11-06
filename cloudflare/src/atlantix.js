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
  const req = { method: body ? 'POST' : 'GET', headers, body };
  let r;
  try { r = await sockFetch(URL0 + path, req); }
  catch (e) {
    if (!e || !e.early) throw new H.HttpErr(502, 'Atlantix non risponde: riprova');
    try { r = await fetch(URL0 + path, { ...req, redirect: 'manual' }); } catch { throw new H.HttpErr(502, 'Atlantix non risponde: riprova'); }
  }
  eatCookies(jar, r);
  const txt = await r.text(); let j = null; try { j = JSON.parse(txt); } catch {}
  return { status: r.status, txt, j };
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
    const r = await raw(H, jar, path, { ajax: true, ...o });
    if (r.status === 401 || (r.j && r.j.data && r.j.data.redirect === 'login')) { mem.jar = {}; await saveJar(env, H, {}); if (i === 0) continue; throw new H.HttpErr(502, 'Atlantix ha chiuso la sessione: riprova'); }
    await saveJar(env, H, jar);
    if (!r.j) throw new H.HttpErr(502, r.status === 404 ? 'Questa funzione non esiste su Atlantix' : `Risposta di Atlantix non valida (${r.status})`);
    if (!r.j.success) throw new H.HttpErr(400, 'Atlantix: ' + String(r.j.message || 'operazione non riuscita').slice(0, 200));
    return r.j;
  }
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
  if (path === '/atx/lines' && m === 'GET') return json((await ax(env, H, '/api/lines/list.php?' + qs({ page, per_page: 50, q }))).data || {});
  if (path === '/atx/subs' && m === 'GET') return json((await ax(env, H, '/api/subresellers/list.php?' + qs({ page, per_page: 50, q, owner: '', status: '' }))).data || {});
  if (path === '/atx/conns' && m === 'GET') return json((await ax(env, H, '/api/connections/list.php?' + qs({ reseller_id: '' }))).data || {});
  if (path === '/atx/lines/action' && m === 'POST') {
    const b = await H.readJSON(req, 4096), id = parseInt(b.user_id, 10);
    if (!(id > 0)) throw new HttpErr(400, 'Linea non valida');
    let body;
    if (b.action === 'renew') { const months = parseInt(b.months, 10); if (![1, 2, 3, 6, 12].includes(months)) throw new HttpErr(400, 'Mesi non validi'); body = { action: 'renew', user_id: id, months }; }
    else if (b.action === 'toggle') body = { action: 'toggle', user_id: id, enabled: !!b.enabled };
    else if (b.action === 'save_notes') body = { action: 'save_notes', user_id: id, notes: str(b.notes, 300) };
    else throw new HttpErr(400, 'Operazione sconosciuta');
    const j = await ax(env, H, '/api/lines/action.php', { json: body });
    await H.log(env, 'edit', `${who}: Atlantix — linea #${id} ${body.action === 'renew' ? 'rinnovata di ' + body.months + ' mesi' : body.action === 'toggle' ? (body.enabled ? 'attivata' : 'disattivata') : 'note aggiornate'}`, ip).catch(() => {});
    return json({ ok: true, message: str(j.message || '', 200) });
  }
  return null;
}
