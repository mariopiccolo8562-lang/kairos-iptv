/* ---------------- Pannello MaxPlayer: account MaxPlayer gestiti da KAIROS con l'API pubblica ufficiale ----------------
   'main' = la chiave MAXPLAYER_KEY già usata per attivare i clienti; gli altri account si collegano dal pannello con la
   loro chiave API (salvata cifrata in settings 'mxp:acc'). Clienti, liste, agenti e domini non vengono copiati: si
   leggono e si scrivono direttamente su MaxPlayer, così KAIROS e my.maxplayer.tv mostrano sempre gli stessi dati.
   Solo il titolare. */
const API = 'https://api.maxplayer.tv/v3/api/public';
const ROW = 'mxp:acc';
const mem = new Map(); // account -> { users, t }

async function accList(env, H) {
  const r = await env.DB.prepare('SELECT v FROM settings WHERE k = ?').bind(ROW).first();
  if (!r) return [];
  try { const a = await H.unseal(env, r.v); return Array.isArray(a) ? a.filter((x) => x && x.id && x.key) : []; } catch { return []; }
}
async function accSave(env, H, list) {
  await env.DB.prepare('INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind(ROW, await H.seal(env, list)).run();
}
async function keyOf(env, H, id) {
  if (id === 'main') { if (!env.MAXPLAYER_KEY) throw new H.HttpErr(400, 'Account principale non collegato (segreto MAXPLAYER_KEY)'); return env.MAXPLAYER_KEY; }
  const a = (await accList(env, H)).find((x) => x.id === id);
  if (!a) throw new H.HttpErr(404, 'Account MaxPlayer non trovato');
  return a.key;
}

async function call(H, key, method, path, body, raw) {
  let r;
  try { r = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'Api-Token': key }, body: body === undefined ? undefined : JSON.stringify(body) }); }
  catch { throw new H.HttpErr(502, 'MaxPlayer non risponde, riprova tra poco'); }
  const j = await r.json().catch(() => null);
  if (r.ok && !(j && j.success === 0)) return raw ? { j, r } : j;
  const why = H.str(String((j && (j.error || j.message)) || ''), 200);
  const MSG = { 401: 'Chiave MaxPlayer non valida', 403: 'MaxPlayer: operazione non consentita', 404: 'MaxPlayer: non trovato', 409: 'MaxPlayer: già esistente o in uso', 422: 'MaxPlayer: dati non validi', 429: 'MaxPlayer: troppe richieste, riprova tra un minuto' };
  throw new H.HttpErr(r.status >= 500 ? 502 : 400, (MSG[r.status] || `Errore di MaxPlayer (${r.status})`) + (why ? ' — ' + why : ''));
}
/** elenchi a pagine di MaxPlayer (100 alla volta, cursore after_id) */
async function allPages(H, key, path, max = 40) {
  const out = []; let after = '';
  for (let i = 0; i < max; i++) {
    const { j, r } = await call(H, key, 'GET', `${path}${path.includes('?') ? '&' : '?'}limit=100${after ? '&after_id=' + encodeURIComponent(after) : ''}`, undefined, true);
    const arr = Array.isArray(j) ? j : Array.isArray(j && j.data) ? j.data : [];
    out.push(...arr);
    after = r.headers.get('x-next-cursor') || '';
    if (r.headers.get('x-has-more') !== 'true' || !after || !arr.length) break;
  }
  return out;
}
const s = (v, n = 200) => String(v ?? '').slice(0, n);
function userOut(u) {
  return {
    id: s(u.id, 30), username: s(u.username, 120), email: s(u.email, 120),
    lists: (Array.isArray(u.lists) ? u.lists : []).map((l) => { const i = l.iptv_info || {}; return { id: s(l.id, 60), name: s(l.name, 80), dom: s(l.domain_id, 30), fqdn: s(i.fqdn, 200), port: s(i.port, 8), ssl: String(i.ssl) === 'true', type: s(i.type, 20), user: s(i.username, 120), pass: s(i.password, 200) }; }),
  };
}
function agentOut(a) {
  return { id: s(a.id, 30), parent: s(a.parent_id, 30), name: s(a.fullname, 80), username: s(a.username, 80), email: s(a.email, 120), max: +a.max_users || 0, users: +a.user_count || 0, alloc: +a.allocated_users || 0, agents: +a.agent_count || 0, disabled: !!a.disabled, last: s(a.last_login, 30) };
}
function domOut(x) { return { id: s(x.id, 30), label: s(x.label, 60), domain: s(x.domain, 200), port: s(x.port, 8), https: x.https === true || String(x.https) === '1' || String(x.https) === 'true', status: s(x.status, 20) }; }
const okIptv = (v, H, what) => { const x = H.str(v, 120); if (!x || /\s/.test(x)) throw new H.HttpErr(400, `${what}: obbligatorio, senza spazi`); return x; };

export async function mxpRoutes(req, env, path, who, ip, H) {
  const m = req.method, { HttpErr, json, str } = H;
  if (path === '/mxp/accounts' && m === 'GET') {
    const L = await accList(env, H);
    return json({ accounts: [...(env.MAXPLAYER_KEY ? [{ id: 'main', name: 'Principale', main: true }] : []), ...L.map((a) => ({ id: a.id, name: a.name }))] });
  }
  if (path === '/mxp/accounts' && m === 'POST') {
    const b = await H.readJSON(req, 2048), name = str(b.name, 40) || 'MaxPlayer', key = String(b.key || '').trim();
    if (!/^[A-Za-z0-9._-]{10,200}$/.test(key)) throw new HttpErr(400, 'Chiave API non valida: copiala da MaxPlayer → API pubblica → Accesso');
    const L = await accList(env, H);
    if (L.length >= 10) throw new HttpErr(400, 'Al massimo 10 account MaxPlayer');
    if (L.some((a) => a.key === key) || key === env.MAXPLAYER_KEY) throw new HttpErr(400, 'Questo account è già collegato');
    const info = await call(H, key, 'GET', '/info');
    const id = 'a' + Date.now().toString(36);
    L.push({ id, name, key }); await accSave(env, H, L);
    await H.log(env, 'edit', `${who}: Pannello MaxPlayer — account «${name}» collegato`, ip);
    return json({ ok: true, id, info });
  }
  const dm = path.match(/^\/mxp\/accounts\/([a-z0-9]{2,20})$/);
  if (dm && (m === 'PUT' || m === 'DELETE')) {
    const L = await accList(env, H), a = L.find((x) => x.id === dm[1]);
    if (!a) throw new HttpErr(404, dm[1] === 'main' ? 'L\'account principale si cambia dal segreto MAXPLAYER_KEY' : 'Account MaxPlayer non trovato');
    if (m === 'PUT') { const b = await H.readJSON(req, 1024); a.name = str(b.name, 40) || a.name; await accSave(env, H, L); return json({ ok: true }); }
    await accSave(env, H, L.filter((x) => x !== a)); mem.delete(a.id);
    await H.log(env, 'del', `${who}: Pannello MaxPlayer — account «${a.name}» scollegato`, ip);
    return json({ ok: true });
  }
  const am = path.match(/^\/mxp\/a\/([a-z0-9]{2,20})(\/[^?]*)$/);
  if (!am) return null;
  const acc = am[1], sub = am[2], key = await keyOf(env, H, acc), drop = () => mem.delete(acc);
  const uname = (id) => { const c = mem.get(acc); const u = c && c.users.find((x) => x.id === id); return u ? u.username : 'ID ' + id; };

  if (sub === '/overview' && m === 'GET') {
    const [info, cap] = await Promise.all([call(H, key, 'GET', '/info'), call(H, key, 'GET', '/capacity').catch(() => null)]);
    return json({ info: { name: s(info.name, 80), users: +info.users || 0, max: +info.max_users || 0, resellers: +info.resellers || 0 }, cap: cap && cap.data ? { free: +cap.data.available_slots || 0, used: +cap.data.used_slots || 0, max: +cap.data.max_users || 0 } : null });
  }
  if (sub === '/users' && m === 'GET') {
    const fresh = new URL(req.url).searchParams.get('fresh') === '1', c = mem.get(acc);
    if (!fresh && c && Date.now() - c.t < 30e3) return json({ users: c.users });
    const users = (await allPages(H, key, '/users')).map(userOut);
    mem.set(acc, { users, t: Date.now() });
    return json({ users });
  }
  if (sub === '/domains' && m === 'GET') { const j = await call(H, key, 'GET', '/domains'); return json({ domains: (Array.isArray(j.data) ? j.data : []).map(domOut).filter((x) => x.id) }); }
  if (sub === '/users' && m === 'POST') {
    const b = await H.readJSON(req, 2048);
    const body = { domain_id: str(String(b.domain || ''), 30), iptv_user: okIptv(b.user, H, 'Utente della linea'), iptv_pass: okIptv(b.pass, H, 'Password della linea') };
    if (!/^\d{1,30}$/.test(body.domain_id)) throw new HttpErr(400, 'Scegli il DNS (dominio)');
    if (b.name) body.fullname = str(b.name, 60);
    if (+b.devices > 0) body.max_devices = Math.min(50, Math.trunc(+b.devices));
    const j = await call(H, key, 'POST', '/users', body);
    drop();
    await H.log(env, 'new', `${who}: Pannello MaxPlayer — cliente ${body.iptv_user} creato`, ip);
    return json({ ok: true, id: s(j.user_id ?? (j.data && j.data.id) ?? '', 30) });
  }
  const um = sub.match(/^\/users\/(\d{1,15})(?:\/(password)|\/lists\/([A-Za-z0-9-]{1,60}))?$/);
  if (um) {
    const id = um[1];
    if (um[3] && m === 'PUT') {
      const b = await H.readJSON(req, 2048);
      const body = { domain_id: str(String(b.domain || ''), 30), iptv_username: okIptv(b.user, H, 'Utente della linea'), iptv_password: okIptv(b.pass, H, 'Password della linea') };
      if (!/^\d{1,30}$/.test(body.domain_id)) throw new HttpErr(400, 'Scegli il DNS (dominio)');
      if (b.name) body.name = str(b.name, 60);
      await call(H, key, 'PUT', `/customers/${id}/lists/${encodeURIComponent(um[3])}`, body);
      const who2 = uname(id); drop();
      await H.log(env, 'edit', `${who}: Pannello MaxPlayer — lista di ${who2} modificata`, ip);
      return json({ ok: true });
    }
    if (um[2] && m === 'PUT') {
      const b = await H.readJSON(req, 1024), pw = H.str(b.password, 120);
      if (pw.length < 4 || /\s/.test(pw)) throw new HttpErr(400, 'Password dell\'app: almeno 4 caratteri, senza spazi');
      await call(H, key, 'PUT', '/users/password', { user_id: id, password: pw });
      await H.log(env, 'edit', `${who}: Pannello MaxPlayer — password dell'app di ${uname(id)} cambiata`, ip);
      return json({ ok: true });
    }
    if (!um[2] && !um[3] && m === 'DELETE') {
      const who2 = uname(id);
      await call(H, key, 'DELETE', `/users/${id}`); drop();
      await H.log(env, 'del', `${who}: Pannello MaxPlayer — cliente ${who2} eliminato`, ip);
      return json({ ok: true });
    }
  }
  if (sub === '/agents' && m === 'GET') return json({ agents: (await allPages(H, key, '/agents', 20)).map(agentOut) });
  const gm = sub.match(/^\/agents\/(\d{1,15})\/(enable|disable)$/);
  if (gm && m === 'POST') {
    await call(H, key, 'POST', `/agents/${gm[1]}/${gm[2]}`);
    await H.log(env, 'edit', `${who}: Pannello MaxPlayer — agente ${gm[1]} ${gm[2] === 'enable' ? 'attivato' : 'disattivato'}`, ip);
    return json({ ok: true });
  }
  return null;
}
