/* ---------------- Pannello OrbixPlay: le playlist dell'account OrbixPlay (Integration API, chiave ORBIX_KEY) ----------------
   La dashboard ha il reCAPTCHA: KAIROS usa solo l'API ufficiale. Le playlist non vengono copiate: si leggono e si scrivono
   su OrbixPlay. Titolare: tutte. Agente con il permesso «oxp»: solo quelle dei dispositivi dei suoi clienti e delle liste
   create da lui (e dai suoi sotto-agenti) da KAIROS. */
const API = 'https://apis.orbixplay.com';
const s = (v, n = 200) => String(v ?? '').slice(0, n);
async function call(env, H, path, query) {
  if (!env.ORBIX_KEY) throw new H.HttpErr(400, 'OrbixPlay non è collegato (segreto ORBIX_KEY)');
  let r;
  try { r = await fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-customer-key': env.ORBIX_KEY }, body: JSON.stringify({ query }) }); }
  catch { throw new H.HttpErr(502, 'OrbixPlay non risponde, riprova tra poco'); }
  const j = await r.json().catch(() => ({}));
  if (r.ok) return j;
  const why = H.str(String(j.error || j.message || ''), 160);
  const MSG = { 400: 'Dati non accettati da OrbixPlay', 401: 'Chiave OrbixPlay non valida', 403: 'Abbonamento OrbixPlay scaduto o posti finiti', 404: 'Non trovato su OrbixPlay' };
  throw new H.HttpErr(r.status >= 500 ? 502 : 400, (MSG[r.status] || `Errore di OrbixPlay (${r.status})`) + (why ? ' — ' + why : ''));
}
const plOut = (p) => ({ id: s(p.playlist_id ?? p.id, 64), device: s(p.deviceid, 64), name: s(p.playlistName, 80), user: s(p.username, 120), pass: s(p.password, 200), host: s(p.host, 300), notes: s(p.notes, 120) });
/** dispositivi OrbixPlay dei clienti dell'agente (e dei suoi sotto-agenti) + liste create da loro con «Crea lista» */
async function agDevices(env, tree) {
  const out = new Set();
  for (let i = 0; i < tree.length; i += 45) {
    const part = tree.slice(i, i + 45), q = part.map(() => '?').join(',');
    const [a, b] = await Promise.all([
      env.DB.prepare(`SELECT orbix FROM devices WHERE orbix != '' AND (owner_id IN (${q}) OR parent IN (SELECT id FROM devices WHERE parent = '' AND owner_id IN (${q})))`).bind(...part, ...part).all(),
      env.DB.prepare(`SELECT ref FROM ext_lists WHERE app = 'orbix' AND owner_id IN (${q})`).bind(...part).all(),
    ]);
    for (const r of a.results || []) { try { const id = JSON.parse(r.orbix).id; if (id) out.add(String(id)); } catch {} }
    for (const r of b.results || []) if (r.ref) out.add(String(r.ref));
  }
  return out;
}

export async function oxpRoutes(req, env, path, who, ip, H, ag = null) {
  const m = req.method, { HttpErr, json, str } = H;
  const row = async () => ((await env.DB.prepare("SELECT v FROM settings WHERE k = 'oxp:email'").first()) || {}).v || '';
  if (path === '/oxp/state' && m === 'GET') return json({ connected: !!env.ORBIX_KEY, email: ag ? '' : await row(), agent: !!ag });
  if (ag && (path === '/oxp/email' || path === '/oxp/slots' || path === '/oxp/dns' || (path === '/oxp/playlists' && m === 'POST' && !ag.canNew))) throw new HttpErr(403, 'Funzione riservata al titolare');
  if (path === '/oxp/email' && m === 'PUT') {
    const b = await H.readJSON(req, 512), e = str(b.email, 120);
    if (e && !/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(e)) throw new HttpErr(400, 'Email non valida');
    await env.DB.prepare("INSERT INTO settings (k, v) VALUES ('oxp:email', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(e).run();
    return json({ ok: true });
  }
  if (path === '/oxp/slots' && m === 'GET') {
    const e = await row(); if (!e) return json({ slots: null });
    const j = await call(env, H, '/detect-slots', { email: e });
    return json({ slots: { total: +j.total_slots || 0, used: +j.used_slots || 0, free: +j.remaining_slots || 0 } });
  }
  if (path === '/oxp/playlists' && m === 'GET') {
    const j = await call(env, H, '/list-playlists', {});
    let list = (Array.isArray(j.playlists) ? j.playlists : []).map(plOut).filter((p) => p.id);
    if (ag) { const mine = await agDevices(env, ag.tree); list = list.filter((p) => mine.has(p.device)); }
    return json({ playlists: list });
  }
  if (path === '/oxp/playlists' && m === 'POST') {
    const b = await H.readJSON(req, 2048);
    const q = { deviceid: str(b.device, 64), playlistName: str(b.name, 40) || 'Kairos', username: str(b.user, 120), password: typeof b.pass === 'string' ? b.pass.slice(0, 200) : '', host: str(b.host, 300), notes: str(b.notes, 60) };
    if (!/^[A-Za-z0-9:._-]{4,64}$/.test(q.deviceid)) throw new HttpErr(400, 'Scrivi l\'ID del dispositivo che compare nell\'app OrbixPlay');
    if (!q.username || !q.password || !q.host) throw new HttpErr(400, 'Scrivi DNS, utente e password della linea');
    const j = await call(env, H, '/add-playlist', q);
    if (ag) await env.DB.prepare('INSERT INTO ext_lists (id, owner_id, app, name, ref, ext, username, pass_seal, dns, note, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(H.pid(), ag.id, 'orbix', q.playlistName, q.deviceid, s(j.playlist_id, 64), q.username, await H.seal(env, q.password), q.host.slice(0, 80), q.notes, Date.now(), Date.now()).run().catch(() => {});
    await H.log(env, 'new', `${who}: Pannello OrbixPlay — playlist ${q.playlistName} aggiunta al dispositivo ${q.deviceid}`, ip);
    return json({ ok: true, id: s(j.playlist_id, 64) });
  }
  /* «Cambia DNS»: tutte le playlist con il DNS vecchio passano al nuovo */
  if (path === '/oxp/dns' && m === 'POST') {
    const b = await H.readJSON(req, 1024), from = str(b.from, 300), to = str(b.to, 300);
    if (!from || !to || from === to) throw new HttpErr(400, 'Scegli il DNS vecchio e scrivi quello nuovo');
    const all = ((await call(env, H, '/list-playlists', {})).playlists || []).map(plOut).filter((p) => p.host === from);
    let n = 0; const errors = [];
    for (const p of all) { try { await call(env, H, '/update-playlist', { playlist_id: /^\d+$/.test(p.id) ? +p.id : p.id, host: to }); n++; } catch (e) { errors.push(`${p.device}: ${e.message}`); } }
    await H.log(env, 'edit', `${who}: Pannello OrbixPlay — DNS cambiato su ${n} playlist`, ip);
    return json({ ok: true, changed: n, errors: errors.slice(0, 10) });
  }
  const pm = path.match(/^\/oxp\/playlists\/([A-Za-z0-9_-]{1,64})$/);
  if (pm && (m === 'PUT' || m === 'DELETE')) {
    const pid = /^\d+$/.test(pm[1]) ? +pm[1] : pm[1];
    const cur = plOut((await call(env, H, '/get-playlist', { playlist_id: pid })).playlist || {});
    if (!cur.id) throw new HttpErr(404, 'Playlist non trovata su OrbixPlay');
    if (ag && !(await agDevices(env, ag.tree)).has(cur.device)) throw new HttpErr(404, 'Playlist non trovata');
    if (m === 'DELETE') {
      await call(env, H, '/delete-playlist', { playlist_id: pid });
      await H.log(env, 'del', `${who}: Pannello OrbixPlay — playlist ${cur.name || cur.id} eliminata (dispositivo ${cur.device})`, ip);
      return json({ ok: true });
    }
    const b = await H.readJSON(req, 2048), q = { playlist_id: pid };
    if (b.name !== undefined) q.playlistName = str(b.name, 40) || cur.name;
    if (b.user !== undefined) { q.username = str(b.user, 120); if (!q.username) throw new HttpErr(400, 'Scrivi l\'utente della linea'); }
    if (typeof b.pass === 'string' && b.pass) q.password = b.pass.slice(0, 200);
    if (!ag && b.host !== undefined && str(b.host, 300)) q.host = str(b.host, 300);
    if (b.notes !== undefined) q.notes = str(b.notes, 60);
    await call(env, H, '/update-playlist', q);
    await H.log(env, 'edit', `${who}: Pannello OrbixPlay — playlist ${cur.name || cur.id} modificata (dispositivo ${cur.device})`, ip);
    return json({ ok: true });
  }
  return null;
}
