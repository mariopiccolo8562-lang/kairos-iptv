/* ---------------- Pannello ORA (panel.oraplayers.com): dispositivi, sub-reseller e crediti del tuo account ORA ----------------
   ORA non ha una chiave API e il login ha la verifica Cloudflare (Turnstile): KAIROS non può entrare da solo.
   Il titolare entra su ORA nel suo browser e con il pulsante nei Preferiti passa a KAIROS l'accesso (il token di ORA),
   che resta cifrato nelle impostazioni. Quando ORA lo fa scadere, si ripete. Solo il titolare. */
const ORA = 'https://panel.oraplayers.com';
const K = 'ora:tok';
const jwtClaims = (t) => { try { const p = t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'); return JSON.parse(atob(p + '==='.slice((p.length + 3) % 4))); } catch { return null; } };
const isJwt = (t) => /^[\w-]+\.[\w-]+\.[\w-]+$/.test(t) && !!jwtClaims(t);
const getRow = async (env) => ((await env.DB.prepare('SELECT v FROM settings WHERE k = ?').bind(K).first()) || {}).v || '';
const setRow = (env, v) => env.DB.prepare('INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind(K, v).run();
/* letture: per ognuna più percorsi possibili, il primo che risponde con dati vale */
const READS = {
  info: () => ['/api/resellers/info', '/api/account'],
  devices: (p, q) => [`/api/devices?page=${p}&size=50&sort=id,desc${q ? '&query=' + encodeURIComponent(q) : ''}`, `/api/reseller/devices?page=${p}&size=50`],
  subs: (p, q) => [q ? `/api/_search/subscriptions/resellers?query=${encodeURIComponent(q)}&page=${p}&size=50` : `/api/subscriptions/resellers?page=${p}&size=50`, `/api/reseller-sub?page=${p}&size=50`],
  credits: (p) => ['/api/wallets/credits', `/api/resellers/wallet/past-credit?size=50&page=${p}`],
  history: (p) => [`/api/recharge-transactions?page=${p}&size=50&sort=id,desc`],
};

async function tok(env, H) {
  const v = await getRow(env); if (!v) return null;
  try { const c = await H.unseal(env, v); return c && c.t ? c : null; } catch { return null; }
}
async function oraGet(t, path) {
  let r; try { r = await fetch(ORA + path, { headers: { Authorization: 'Bearer ' + t, Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 KAIROS' } }); } catch { return { err: 502 }; }
  if (!/json/i.test(r.headers.get('content-type') || '')) return { err: 404 };
  const j = await r.json().catch(() => null);
  if (r.status === 401 || (r.status === 403 && /invalid token/i.test(String((j && j.message) || '')))) return { err: 401 }; // ORA: token scaduto/non valido
  if (!r.ok) return { err: r.status, msg: String((j && (j.message || j.title || j.detail)) || '').slice(0, 160) };
  return { data: j, total: +(r.headers.get('x-total-count') || 0) || null };
}

export async function oraRoutes(req, env, path, who, ip, H) {
  const m = req.method, { HttpErr, json, str } = H;
  if (path === '/ora/state' && m === 'GET') {
    const c = await tok(env, H); if (!c) return json({ connected: false });
    const cl = jwtClaims(c.t) || {};
    return json({ connected: true, user: str(cl.sub || cl.username || '', 80), exp: +cl.exp || 0, at: c.at || 0, expired: !!c.bad || (+cl.exp > 0 && +cl.exp * 1000 < Date.now()) });
  }
  if (path === '/ora/token' && m === 'PUT') {
    const b = await H.readJSON(req, 8192), t = str(b.token, 6000).trim();
    if (!isJwt(t)) throw new HttpErr(400, 'Accesso ORA non valido: entra su panel.oraplayers.com e premi di nuovo il pulsante nei Preferiti');
    const r = await oraGet(t, '/api/resellers/info');
    if (r.err === 401) throw new HttpErr(400, 'ORA dice che questo accesso è scaduto: esci, rientra su ORA e premi di nuovo il pulsante');
    await setRow(env, await H.seal(env, { t, at: Date.now() }));
    await H.log(env, 'edit', `${who}: pannello ORA collegato`, ip).catch(() => {});
    return json({ ok: true });
  }
  if (path === '/ora/token' && m === 'DELETE') { await env.DB.prepare('DELETE FROM settings WHERE k = ?').bind(K).run(); return json({ ok: true }); }
  if (path === '/ora/data' && m === 'GET') {
    const u = new URL(req.url), w = u.searchParams.get('w') || '', p = Math.max(0, Math.min(10000, parseInt(u.searchParams.get('page'), 10) || 0)), q = str(u.searchParams.get('q') || '', 80);
    if (!READS[w]) throw new HttpErr(400, 'Sezione ORA sconosciuta');
    const c = await tok(env, H); if (!c) throw new HttpErr(400, 'ORA non è collegato: entra su ORA e premi il pulsante «KAIROS ← ORA» nei Preferiti');
    let last = null;
    for (const pa of READS[w](p, q)) {
      const r = await oraGet(c.t, pa);
      if (r.err === 401) { await setRow(env, await H.seal(env, { ...c, bad: 1 })); throw new HttpErr(401, 'L\'accesso a ORA è scaduto: entra su ORA e premi di nuovo il pulsante «KAIROS ← ORA» nei Preferiti'); }
      if (!r.err) return json({ path: pa.split('?')[0], total: r.total, data: r.data });
      last = r;
    }
    throw new HttpErr(502, last && last.err === 502 ? 'ORA non risponde, riprova tra poco' : `ORA non ha dato questi dati (${last ? last.err : '?'})${last && last.msg ? ' — ' + last.msg : ''}`);
  }
  return null;
}
