/*  KAIROS — Autorizzazione dei download dello Store
 *
 *  Prima di scaricare un'app dallo Store il cliente chiede l'autorizzazione:
 *  il venditore riceve un'email (Resend) con un codice di 6 cifre e i pulsanti
 *  Autorizza / Rifiuta, e vede la richiesta anche nel pannello ("Download store").
 *
 *  API pubbliche (pagina dello store su GitHub Pages o dentro l'app → CORS aperto):
 *    GET  /api/store/config                                  → { on }
 *    POST /api/store/request  {app, appUrl, device, did, note} → { id, status:'pending' }
 *                                                              | { id, status:'approved', token, auto:true }  (approvazione spenta)
 *    GET  /api/store/status?id=&did=                         → { status, app, token? }
 *    POST /api/store/verify   {id, did, code}                → { ok, status, token? , left?, error? }
 *    POST /api/store/consume  {id, did, token, url}          → { ok, app, appUrl }   (subito prima del download)
 *    GET  /api/store/approve?id=&k=   /api/store/deny?id=&k=  → pagina di conferma (link dell'email)
 *    POST /api/store/decide   form {id, k, action}           → pagina "Download autorizzato" / "rifiutato"
 *
 *  API del pannello (chiamate da admin() in worker.js dopo sessione + CSRF):
 *    GET    /api/admin/store                    → { settings, mail, requests, pending }
 *    PUT    /api/admin/store/settings           { approval, ownerEmail }
 *    POST   /api/admin/store/:id/approve|deny|revoke   (revoke: toglie un'autorizzazione già data; da pending = rifiuta)
 *    POST   /api/admin/store/device/block       { did, blocked }   (dispositivo bloccato: niente nuove richieste)
 *    DELETE /api/admin/store                    (svuota lo storico, le richieste in attesa restano)
 *
 *  Stati: pending (24 h) → approved (token valido 30 min, UN solo download) → used
 *         pending → denied (Rifiuta o 5 codici errati) · pending/approved non usata → expired
 *         pending/approved → revoked (il venditore toglie il permesso dal pannello o blocca il dispositivo)
 *  Ogni richiesta vale per una sola app e un solo download: per installare di nuovo si chiede un'altra autorizzazione.
 *
 *  Segreti/variabili:  RESEND_KEY (segreto, facoltativo), OWNER_EMAIL e MAIL_FROM (variabili, facoltative).
 *  SMS (facoltativi, Twilio): TWILIO_SID e TWILIO_TOKEN (segreti), TWILIO_FROM (variabile: numero Twilio o Messaging Service SID).
 *  Il titolare sceglie dal pannello i numeri: il suo e quelli degli agenti a cui lo consente (solo agenti attivi con il
 *  permesso «Download store» per quell'app). Un tetto giornaliero limita la spesa.
 *  Le firme dei link dell'email derivano da ENC_KEY.
 */

const REQ_TTL = 24 * 3600e3;     // una richiesta resta in attesa 24 ore
const TOKEN_TTL = 30 * 60e3;     // dopo l'ok il download deve partire entro 30 minuti
const MAX_TRIES = 5;             // codici errati prima di annullare la richiesta
const MAX_USES = 1;              // un'autorizzazione = un solo download (per reinstallare se ne chiede un'altra)
const PER_HOUR = 6;              // nuove richieste per IP / per dispositivo ogni ora
const MAX_PENDING = 300;         // richieste in attesa in tutto
const MAIL_PER_DAY = 90;         // il piano gratuito di Resend ne consente 100 al giorno
const KEEP = 30 * 86400e3;       // storico conservato 30 giorni
const ID_RE = /^[A-Za-z0-9_-]{12,40}$/;
const DID_RE = /^[A-Za-z0-9_-]{16,64}$/;
const MAX_BLOCKED = 500;         // dispositivi bloccati ricordati nelle impostazioni
const PHONE_RE = /^\+[1-9]\d{7,14}$/;
const SMS_DEF_DAY = 50;          // SMS al giorno se il titolare non sceglie un altro tetto
const SMS_MAX_DAY = 500;
const MAIL_RE = /^[^\s@<>"',;:()[\]\\]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,}$/;

const enc = new TextEncoder();
const now = () => Date.now();
const str = (v, max = 200) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '');
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rand = (n) => crypto.getRandomValues(new Uint8Array(n));
function b64url(buf) { let s = ''; const b = new Uint8Array(buf); for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function safeEq(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const x = enc.encode(a), y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}
function sixDigits() {
  const a = new Uint32Array(1);
  do crypto.getRandomValues(a); while (a[0] >= 4294000000); // niente sbilanciamenti
  return String(a[0] % 1e6).padStart(6, '0');
}
const changed = (r) => !!(r && r.meta && r.meta.changes > 0);
class StoreErr extends Error { constructor(status, msg) { super(msg); this.status = status; } }

async function limited(binding, key) {
  if (!binding || typeof binding.limit !== 'function') return false;
  try { const { success } = await binding.limit({ key }); return !success; } catch { return false; }
}
async function readBody(req, max = 4096) {
  const len = +(req.headers.get('Content-Length') || 0);
  if (len > max) throw new StoreErr(413, 'Richiesta troppo grande');
  const t = await req.text();
  if (t.length > max) throw new StoreErr(413, 'Richiesta troppo grande');
  if ((req.headers.get('Content-Type') || '').includes('application/x-www-form-urlencoded')) return Object.fromEntries(new URLSearchParams(t));
  try { const j = JSON.parse(t || '{}'); return j && typeof j === 'object' ? j : {}; } catch { throw new StoreErr(400, 'Dati non validi'); }
}
async function log(env, type, text, ip = '') {
  try { await env.DB.prepare('INSERT INTO activity (t, type, text, ip) VALUES (?, ?, ?, ?)').bind(now(), type, String(text).slice(0, 300), ip).run(); } catch {}
}

/* ---------------- impostazioni (tabella settings, chiave "store") ---------------- */
async function getStoreSettings(env) {
  const row = await env.DB.prepare('SELECT v FROM settings WHERE k = ?').bind('store').first();
  let s = {}; try { s = row ? JSON.parse(row.v) : {}; } catch {}
  const blocked = Array.isArray(s.blocked) ? s.blocked.filter((d) => typeof d === 'string' && DID_RE.test(d)).slice(0, MAX_BLOCKED) : [];
  return { approval: s.approval !== false, ownerEmail: typeof s.ownerEmail === 'string' ? s.ownerEmail : '', blocked, sms: smsNorm(s.sms) };
}
/** numero in formato internazionale (+39…); i numeri italiani scritti senza prefisso vengono completati */
function phoneNorm(v) {
  let p = String(v ?? '').replace(/[\s().\/-]/g, '');
  if (p.startsWith('00')) p = '+' + p.slice(2);
  if (/^3\d{8,9}$/.test(p)) p = '+39' + p;
  return PHONE_RE.test(p) ? p : '';
}
function smsNorm(v) {
  const o = v && typeof v === 'object' ? v : {};
  const seen = new Set();
  const agents = (Array.isArray(o.agents) ? o.agents : []).map((a) => ({ id: parseInt(a && a.id, 10) || 0, phone: phoneNorm(a && a.phone), on: !(a && a.on === false) }))
    .filter((a) => a.id > 0 && a.phone && !seen.has(a.id) && seen.add(a.id)).slice(0, 200);
  return { on: o.on === true, owner: phoneNorm(o.owner), link: o.link === true, perDay: Math.max(1, Math.min(SMS_MAX_DAY, parseInt(o.perDay, 10) || SMS_DEF_DAY)), agents };
}
const smsReady = (env) => !!(str(env.TWILIO_SID, 64) && str(env.TWILIO_TOKEN, 128) && str(env.TWILIO_FROM, 40));
const maskPhone = (p) => (p.length > 6 ? p.slice(0, 3) + '•••' + p.slice(-3) : '•••');
async function putStoreSettings(env, s) {
  await env.DB.prepare('INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind('store', JSON.stringify(s)).run();
}

/* ---------------- stato effettivo di una richiesta ---------------- */
function effStatus(r, t = now()) {
  if (r.status === 'pending') return t - r.created > REQ_TTL ? 'expired' : 'pending';
  if (r.status === 'approved') {
    if (t - r.decided <= TOKEN_TTL && r.uses < MAX_USES) return 'approved';
    return r.uses > 0 ? 'used' : 'expired';
  }
  if (r.status === 'revoked') return r.uses > 0 ? 'used' : 'revoked';
  return r.status === 'denied' ? 'denied' : 'expired';
}

async function findOwn(env, id, did) {
  if (!ID_RE.test(id) || !DID_RE.test(did)) return null;
  const r = await env.DB.prepare('SELECT * FROM store_requests WHERE id = ?').bind(id).first();
  return r && safeEq(r.did, did) ? r : null;
}

const ENDED = { denied: 'Richiesta rifiutata', expired: 'Richiesta scaduta', used: 'Autorizzazione già usata', revoked: 'Autorizzazione revocata dal venditore' };
const VIA = { email: "dall'email", panel: 'dal pannello', code: 'con il codice', auto: 'automatica', tries: 'troppi codici errati', telegram: 'da Telegram', push: 'dalla notifica' };

/* avvisi esterni (Telegram, notifiche): worker.js li collega con storeHooks() */
let HOOKS = {};
export function storeHooks(h) { HOOKS = h || {}; }
async function hookDecided(env, r, st, via, who) {
  if (typeof HOOKS.decided !== 'function') return;
  try { await HOOKS.decided(env, r, st, via, who); } catch {}
}

/** approva o rifiuta una richiesta in attesa; false se non era più in attesa */
async function decide(env, r, action, via, ip = '', by = 0, who = '') {
  const pre = by && who ? who + ': ' : '';
  const t = now();
  if (effStatus(r, t) !== 'pending') return false;
  if (action === 'approve') {
    const token = b64url(rand(24));
    const u = await env.DB.prepare("UPDATE store_requests SET status = 'approved', token = ?, decided = ?, via = ?, by_admin = ? WHERE id = ? AND status = 'pending'").bind(token, t, via, by, r.id).run();
    if (!changed(u)) return false;
    Object.assign(r, { status: 'approved', token, decided: t, via });
    await log(env, 'on', `${pre}Store: download autorizzato ${VIA[via] || ''} · ${r.app} su ${r.device || 'dispositivo'}${r.note ? ' (' + r.note + ')' : ''}`, ip);
    await hookDecided(env, r, 'approved', via, by ? who.replace(/^Agente /, '') : (who || (via === 'code' ? 'cliente' : '')));
  } else {
    const u = await env.DB.prepare("UPDATE store_requests SET status = 'denied', token = '', decided = ?, via = ?, by_admin = ? WHERE id = ? AND status = 'pending'").bind(t, via, by, r.id).run();
    if (!changed(u)) return false;
    Object.assign(r, { status: 'denied', decided: t, via });
    await log(env, 'off', `${pre}Store: download rifiutato ${VIA[via] || ''} · ${r.app} su ${r.device || 'dispositivo'}${r.note ? ' (' + r.note + ')' : ''}`, ip);
    await hookDecided(env, r, 'denied', via, by ? who.replace(/^Agente /, '') : who);
  }
  return true;
}

/** toglie il permesso a una richiesta in attesa o già autorizzata (non ancora scaricata); false se non si può */
async function revoke(env, r, who, ip = '') {
  const st = effStatus(r);
  if (st !== 'pending' && st !== 'approved') return false;
  const u = await env.DB.prepare("UPDATE store_requests SET status = 'revoked', token = '', decided = ? WHERE id = ? AND status IN ('pending', 'approved') AND uses = 0").bind(now(), r.id).run();
  if (!changed(u)) return false;
  Object.assign(r, { status: 'revoked', token: '', decided: now() });
  await hookDecided(env, r, 'revoked', 'panel', String(who || '').replace(/^Agente /, ''));
  await log(env, 'off', `${who}: Store — ${st === 'approved' ? 'autorizzazione revocata' : 'richiesta rifiutata'} · ${r.app} su ${r.device || 'dispositivo'}${r.note ? ' (' + r.note + ')' : ''}`, ip);
  return true;
}

/* ---------------- firma dei link dell'email (chiave derivata da ENC_KEY) ---------------- */
let linkKeyMem = null;
async function linkKey(env) {
  if (!env.ENC_KEY) return null;
  if (linkKeyMem && linkKeyMem.src === env.ENC_KEY) return linkKeyMem.key;
  try {
    const raw = Uint8Array.from(atob(env.ENC_KEY), (c) => c.charCodeAt(0));
    const base = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sub = await crypto.subtle.sign('HMAC', base, enc.encode('kairos-store-link-v1'));
    const key = await crypto.subtle.importKey('raw', sub, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    linkKeyMem = { src: env.ENC_KEY, key };
    return key;
  } catch { return null; }
}
async function linkSig(env, id) {
  const k = await linkKey(env);
  return k ? b64url(await crypto.subtle.sign('HMAC', k, enc.encode('link:' + id))) : '';
}

/* ---------------- email al venditore (Resend) ---------------- */
const fmtTime = (t) => { try { return new Date(t).toLocaleString('it-IT', { timeZone: 'Europe/Rome', dateStyle: 'short', timeStyle: 'short' }); } catch { return new Date(t).toISOString(); } };
async function notify(env, origin, r, s, ip) {
  const to = s.ownerEmail || str(env.OWNER_EMAIL, 200);
  if (!env.RESEND_KEY || !MAIL_RE.test(to)) return; // email non configurata: la richiesta resta visibile nel pannello
  const sent = await env.DB.prepare('SELECT COUNT(*) AS n FROM store_requests WHERE mailed = 1 AND created > ?').bind(now() - 86400e3).first();
  if (sent && sent.n >= MAIL_PER_DAY) { await log(env, 'off', 'Store: limite giornaliero di email raggiunto, guarda le richieste nel pannello', ip); return; }
  const k = await linkSig(env, r.id);
  const links = k ? {
    approve: `${origin}/api/store/approve?id=${encodeURIComponent(r.id)}&k=${encodeURIComponent(k)}`,
    deny: `${origin}/api/store/deny?id=${encodeURIComponent(r.id)}&k=${encodeURIComponent(k)}`,
  } : null;
  const when = fmtTime(r.created);
  const row = (l, v) => (v ? `<tr><td style="padding:5px 14px 5px 0;color:#6b7280;font-size:14px">${l}</td><td style="padding:5px 0;font-size:15px;color:#111827"><b>${esc(v)}</b></td></tr>` : '');
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#ffffff;color:#111827">
<h2 style="margin:0 0 4px;font-size:20px">Richiesta di download</h2>
<p style="margin:0 0 16px;color:#4b5563">Un cliente vuole scaricare un'app dal tuo Kairos Store.</p>
<table style="border-collapse:collapse;margin-bottom:18px">${row('App', r.app)}${row('Dispositivo', r.device)}${row('Nome', r.note)}${row('Ora', when)}${row('Paese', r.country)}</table>
<p style="margin:0 0 6px;color:#4b5563">Codice da comunicare al cliente:</p>
<div style="display:inline-block;padding:12px 18px;border-radius:10px;background:#f3f4f6;font:bold 34px 'Courier New',monospace;letter-spacing:8px">${esc(r.code)}</div>
${links ? `<p style="margin:22px 0 10px;color:#4b5563">Oppure decidi tu (il download parte da solo sul dispositivo):</p>
<a href="${esc(links.approve)}" style="display:inline-block;padding:13px 22px;margin:0 8px 8px 0;border-radius:10px;background:#16a34a;color:#ffffff;text-decoration:none;font-weight:bold">Autorizza</a>
<a href="${esc(links.deny)}" style="display:inline-block;padding:13px 22px;margin:0 0 8px;border-radius:10px;background:#dc2626;color:#ffffff;text-decoration:none;font-weight:bold">Rifiuta</a>` : ''}
<p style="margin:20px 0 0;font-size:12px;color:#9ca3af">La richiesta scade dopo 24 ore. Se non la riconosci, ignora questa email oppure premi Rifiuta.</p></div>`;
  const text = `Richiesta di download dal tuo Kairos Store\n\nApp: ${r.app}\nDispositivo: ${r.device || '-'}\n${r.note ? 'Nome: ' + r.note + '\n' : ''}Ora: ${when}\n${r.country ? 'Paese: ' + r.country + '\n' : ''}\nCodice da comunicare al cliente: ${r.code}\n${links ? `\nAutorizza: ${links.approve}\nRifiuta: ${links.deny}\n` : ''}\nLa richiesta scade dopo 24 ore.`;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + env.RESEND_KEY, 'Content-Type': 'application/json', 'Idempotency-Key': 'kairos-store-' + r.id },
      body: JSON.stringify({ from: str(env.MAIL_FROM, 200) || 'Kairos Store <onboarding@resend.dev>', to: [to], subject: `Download ${r.app} · codice ${r.code}`.slice(0, 150), html, text }),
    });
    if (res.ok) await env.DB.prepare('UPDATE store_requests SET mailed = 1 WHERE id = ?').bind(r.id).run();
    else await log(env, 'off', `Store: email non inviata (Resend ${res.status}) ${str(await res.text().catch(() => ''), 160)}`, ip);
  } catch (e) {
    await log(env, 'off', 'Store: email non inviata (rete)', ip);
  }
}

/* ---------------- SMS (Twilio) al titolare e agli agenti autorizzati ---------------- */
async function sendSms(env, to, body, ip) {
  const sid = str(env.TWILIO_SID, 64), tok = str(env.TWILIO_TOKEN, 128), from = str(env.TWILIO_FROM, 40);
  const f = new URLSearchParams({ To: to, Body: body });
  if (/^MG[0-9a-f]{32}$/i.test(from)) f.set('MessagingServiceSid', from); else f.set('From', from);
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
      method: 'POST', headers: { Authorization: 'Basic ' + btoa(sid + ':' + tok), 'Content-Type': 'application/x-www-form-urlencoded' }, body: f,
    });
    if (res.ok) return { ok: true };
    let msg = ''; try { const j = await res.json(); msg = str(j && j.message, 140); } catch {}
    await log(env, 'off', `Store: SMS a ${maskPhone(to)} non inviato (Twilio ${res.status}) ${msg}`, ip);
    return { ok: false, error: msg || 'Twilio ' + res.status };
  } catch {
    await log(env, 'off', `Store: SMS a ${maskPhone(to)} non inviato (rete)`, ip);
    return { ok: false, error: 'Twilio non raggiungibile' };
  }
}
// testo scritto dal dispositivo del cliente: solo caratteri semplici (niente link o testi ingannevoli negli SMS)
const smsSafe = (v, max) => String(v || '').replace(/[^A-Za-z0-9 _()+-]/g, ' ').replace(/\b(?:https?|www)\b/gi, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
async function notifySms(env, origin, r, s, ip, opts) {
  const sms = s.sms;
  if (!sms || !sms.on || !smsReady(env)) return;
  let to = sms.owner ? [sms.owner] : [];
  const cand = sms.agents.filter((a) => a.on);
  if (cand.length && opts && typeof opts.smsAgents === 'function') {
    try {
      const ok = new Set(await opts.smsAgents(r.app, cand.map((a) => a.id)));
      for (const a of cand) if (ok.has(a.id)) to.push(a.phone);
    } catch {}
  }
  to = [...new Set(to)];
  if (!to.length) return;
  const sent = await env.DB.prepare('SELECT COALESCE(SUM(sms), 0) AS n FROM store_requests WHERE created > ?').bind(now() - 86400e3).first();
  const left = sms.perDay - ((sent && +sent.n) || 0);
  if (left <= 0) { await log(env, 'off', `Store: limite giornaliero di SMS raggiunto (${sms.perDay}), guarda le richieste nel pannello`, ip); return; }
  if (to.length > left) to = to.slice(0, left); // il titolare è sempre il primo
  const k = sms.link ? await linkSig(env, r.id) : '';
  const dev = smsSafe(r.device, 30), note = smsSafe(r.note, 20);
  const text = `Kairos Store: richiesta ${smsSafe(r.app, 30)}${dev ? ' su ' + dev : ''}${note ? ' (' + note + ')' : ''}. Codice: ${r.code}` +
    (k ? ` Autorizza: ${origin}/api/store/approve?id=${encodeURIComponent(r.id)}&k=${encodeURIComponent(k)}` : '');
  let n = 0;
  for (const p of to) if ((await sendSms(env, p, text, ip)).ok) n++;
  if (n) await env.DB.prepare('UPDATE store_requests SET sms = sms + ? WHERE id = ?').bind(n, r.id).run();
}

/* ====================================================================== */
/* API pubbliche                                                          */
/* ====================================================================== */
export async function storeApi(req, env, ctx, url, ip, opts = {}) {
  const p = url.pathname.slice('/api/store'.length), m = req.method;
  try {
    if (m === 'OPTIONS') return new Response(null, { status: 204 });
    if (p === '/config' && m === 'GET') {
      if (await limited(env.RL_DEVICE, 'scfg:' + ip)) return json({ error: 'Troppe richieste' }, 429);
      return json({ on: (await getStoreSettings(env)).approval });
    }
    if (p === '/request' && m === 'POST') return await create(req, env, ctx, url, ip, opts);
    if (p === '/status' && m === 'GET') return await status(url, env, ip);
    if (p === '/verify' && m === 'POST') return await verify(req, env, ip);
    if (p === '/consume' && m === 'POST') return await consume(req, env, ctx, ip);
    if ((p === '/approve' || p === '/deny') && m === 'GET') return await linkPage(url, env, ip, p.slice(1));
    if (p === '/decide' && m === 'POST') return await linkDecide(req, env, url, ip);
    return json({ error: 'Non trovato' }, 404);
  } catch (e) {
    if (e instanceof StoreErr) return json({ error: e.message }, e.status);
    throw e;
  }
}

/** intestazioni per /api/store/* (richiamata da harden() in worker.js) */
export function storeHeaders(h, path) {
  if (/^\/api\/store\/(approve|deny|decide)$/.test(path)) {
    // pagine aperte dal link dell'email: solo stile in linea, form verso lo stesso Worker
    h.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
    h.set('Cache-Control', 'no-store');
    return;
  }
  h.set('Access-Control-Allow-Origin', '*');
  h.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  h.set('Access-Control-Allow-Headers', 'Content-Type');
  h.set('Access-Control-Max-Age', '86400');
  h.set('Cross-Origin-Resource-Policy', 'cross-origin');
}

async function create(req, env, ctx, url, ip, opts) {
  if (await limited(env.RL_DEVICE, 'sreq:' + ip)) return json({ error: 'Troppe richieste, riprova tra poco' }, 429);
  const b = await readBody(req);
  const app = str(b.app, 80), did = str(b.did, 64), device = str(b.device, 80), note = str(b.note, 40);
  let appUrl = str(b.appUrl, 1000);
  if (!app) return json({ error: 'App mancante' }, 400);
  if (!DID_RE.test(did)) return json({ error: 'Dispositivo non valido' }, 400);
  if (appUrl && !/^https?:\/\/[^\s]+$/i.test(appUrl)) return json({ error: 'Link non valido' }, 400);
  const s = await getStoreSettings(env), t = now();
  if (s.blocked.includes(did)) return json({ error: 'Dispositivo bloccato dal venditore' }, 403);

  // stessa app dallo stesso dispositivo già in attesa: nessuna nuova email (una richiesta = una app = un download)
  const same = await env.DB.prepare("SELECT id, app_url FROM store_requests WHERE did = ? AND app = ? AND status = 'pending' AND created > ? ORDER BY created DESC LIMIT 1").bind(did, app, t - REQ_TTL).first();
  if (s.approval && same && same.app_url === appUrl) return json({ id: same.id, status: 'pending' });

  const c = await env.DB.prepare("SELECT (SELECT COUNT(*) FROM store_requests WHERE ip = ? AND created > ?) AS byIp, (SELECT COUNT(*) FROM store_requests WHERE did = ? AND created > ?) AS byDid, (SELECT COUNT(*) FROM store_requests WHERE status = 'pending' AND created > ?) AS pend")
    .bind(ip, t - 3600e3, did, t - 3600e3, t - REQ_TTL).first();
  const lim = s.approval ? PER_HOUR : PER_HOUR * 10;
  if (c.byIp >= lim || c.byDid >= lim) return json({ error: 'Hai già inviato molte richieste: attendi la risposta del venditore' }, 429);
  if (s.approval && c.pend >= MAX_PENDING) return json({ error: 'Troppe richieste in attesa, riprova più tardi' }, 503);

  const cf = req.cf || {};
  const country = [str(cf.country, 4), str(cf.city, 40)].filter(Boolean).join(' · ');
  const r = { id: b64url(rand(12)), app, app_url: appUrl, did, device, note, ip, country, code: sixDigits(), status: 'pending', created: t };
  const auto = !s.approval;
  const token = auto ? b64url(rand(24)) : '';
  await env.DB.prepare('INSERT INTO store_requests (id, app, app_url, did, device, note, ip, country, code, status, token, via, created, decided) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(r.id, app, appUrl, did, device, note, ip, country, r.code, auto ? 'approved' : 'pending', token, auto ? 'auto' : '', t, auto ? t : 0).run();
  const bg = [env.DB.prepare('DELETE FROM store_requests WHERE created < ?').bind(t - KEEP).run().catch(() => {})];
  if (auto) {
    bg.push(log(env, 'on', `Store: download ${app} su ${device || 'dispositivo'}${note ? ' (' + note + ')' : ''} · approvazione spenta`, ip));
    ctx.waitUntil(Promise.all(bg));
    return json({ id: r.id, status: 'approved', token, auto: true });
  }
  bg.push(log(env, 'new', `Store: richiesta download ${app} da ${device || 'dispositivo'}${note ? ' (' + note + ')' : ''}${country ? ' · ' + country : ''}`, ip));
  bg.push(notify(env, url.origin, r, s, ip));
  bg.push(notifySms(env, url.origin, r, s, ip, opts).catch(() => {}));
  if (typeof HOOKS.created === 'function') bg.push(Promise.resolve().then(() => HOOKS.created(env, r, url.origin, ip)).catch(() => {}));
  ctx.waitUntil(Promise.all(bg));
  return json({ id: r.id, status: 'pending' });
}

async function status(url, env, ip) {
  if (await limited(env.RL_DEVICE, 'sst:' + ip)) return json({ error: 'Troppe richieste' }, 429);
  const r = await findOwn(env, str(url.searchParams.get('id'), 40), str(url.searchParams.get('did'), 64));
  if (!r) return json({ status: 'unknown', error: 'Richiesta non trovata' }, 404);
  const st = effStatus(r);
  const out = { status: st, app: r.app };
  if (st === 'approved') out.token = r.token;
  if (st === 'pending') out.left = Math.max(0, MAX_TRIES - r.tries);
  return json(out);
}

async function verify(req, env, ip) {
  if (await limited(env.RL_DEVICE, 'sver:' + ip)) return json({ ok: false, error: 'Troppi tentativi, attendi un minuto' }, 429);
  const b = await readBody(req);
  const r = await findOwn(env, str(b.id, 40), str(b.did, 64));
  if (!r) return json({ ok: false, status: 'unknown', error: 'Richiesta non trovata' }, 404);
  const st = effStatus(r);
  if (st === 'approved') return json({ ok: true, status: st, token: r.token });
  if (st !== 'pending') return json({ ok: false, status: st, error: ENDED[st] || ENDED.expired });
  const code = String(b.code ?? '').replace(/\D/g, '');
  if (code.length !== 6) return json({ ok: false, status: st, error: 'Inserisci il codice di 6 cifre' }, 400);
  // il tentativo si conta prima del confronto (anche con richieste in parallelo)
  const u = await env.DB.prepare("UPDATE store_requests SET tries = tries + 1 WHERE id = ? AND status = 'pending' AND tries < ?").bind(r.id, MAX_TRIES).run();
  if (!changed(u)) {
    await decide(env, r, 'deny', 'tries', ip);
    return json({ ok: false, status: 'denied', error: 'Troppi tentativi: richiesta annullata' });
  }
  if (safeEq(code, r.code)) {
    await decide(env, r, 'approve', 'code', ip);
    const now2 = await env.DB.prepare('SELECT * FROM store_requests WHERE id = ?').bind(r.id).first();
    if (now2 && effStatus(now2) === 'approved') return json({ ok: true, status: 'approved', token: now2.token });
    return json({ ok: false, status: now2 ? effStatus(now2) : 'unknown', error: 'Richiesta non più valida' });
  }
  const left = MAX_TRIES - (r.tries + 1);
  if (left <= 0) {
    await decide(env, r, 'deny', 'tries', ip);
    return json({ ok: false, status: 'denied', error: 'Codice errato. Troppi tentativi: richiesta annullata' });
  }
  return json({ ok: false, status: 'pending', left, error: `Codice errato. Tentativi rimasti: ${left}` });
}

async function consume(req, env, ctx, ip) {
  if (await limited(env.RL_DEVICE, 'scon:' + ip)) return json({ ok: false, error: 'Troppe richieste, riprova tra poco' }, 429);
  const b = await readBody(req);
  const r = await findOwn(env, str(b.id, 40), str(b.did, 64));
  const bad = (e, status) => json(status ? { ok: false, status, error: e } : { ok: false, error: e }, 403);
  if (!r) return bad('Autorizzazione non valida. Richiedila di nuovo.');
  const st = effStatus(r);
  if (st === 'revoked') return bad('Autorizzazione revocata dal venditore.', 'revoked');
  if (st === 'used') return bad('Autorizzazione già usata. Richiedila di nuovo.', 'used');
  if (r.status !== 'approved' || !r.token || !safeEq(str(b.token, 100), r.token)) return bad('Autorizzazione non valida. Richiedila di nuovo.');
  if (st !== 'approved') return bad('Autorizzazione scaduta. Richiedila di nuovo.', 'expired');
  const link = str(b.url, 1000);
  if (!r.app_url || link !== r.app_url) return bad('Questa autorizzazione vale per un\'altra app.');
  // un solo download per autorizzazione: la riga passa a "used" e non vale più
  const u = await env.DB.prepare("UPDATE store_requests SET uses = uses + 1, used = ? WHERE id = ? AND status = 'approved' AND uses < ?").bind(now(), r.id, MAX_USES).run();
  if (!changed(u)) return bad('Autorizzazione già usata. Richiedila di nuovo.', 'used');
  if (!r.uses) ctx.waitUntil(log(env, 'edit', `Store: download avviato · ${r.app} su ${r.device || 'dispositivo'}${r.note ? ' (' + r.note + ')' : ''}`, ip));
  return json({ ok: true, app: r.app, appUrl: r.app_url });
}

/* ---------------- pagine dei link dell'email ---------------- */
function page(title, inner, tone = 'info', code = 200) {
  const col = tone === 'ok' ? '#3dffb0' : tone === 'bad' ? '#ff4d7a' : '#22e1ff';
  const sym = tone === 'ok' ? '&#10003;' : tone === 'bad' ? '&#10005;' : '?';
  return new Response(`<!DOCTYPE html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><meta name="referrer" content="no-referrer"><title>${esc(title)} · Kairos Store</title><style>
body{margin:0;min-height:100vh;display:grid;place-items:center;padding:20px;box-sizing:border-box;background:radial-gradient(circle at 15% 0,#0e3a4a,transparent 55%),radial-gradient(circle at 95% 30%,#2b1a5c,transparent 55%),#05060f;color:#eef2ff;font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{width:min(460px,100%);padding:30px 26px;border-radius:22px;background:rgba(14,15,34,.94);border:1px solid rgba(255,255,255,.1);box-shadow:0 30px 80px -20px #000;text-align:center}
.i{width:64px;height:64px;margin:0 auto 14px;border-radius:50%;display:grid;place-items:center;font-size:30px;font-weight:800;color:#05060f;background:${col};box-shadow:0 0 30px ${col}}
h1{margin:0 0 6px;font-size:22px}p{margin:6px 0;color:#b9c0e4}b{color:#fff}
dl{margin:18px 0 6px;text-align:left;display:grid;grid-template-columns:auto 1fr;gap:6px 14px;font-size:15px}dt{color:#8b93b8}dd{margin:0;word-break:break-word}
form{display:flex;gap:10px;margin-top:20px}button{flex:1;padding:15px 10px;border-radius:14px;border:1px solid rgba(255,255,255,.18);font:700 16px system-ui,sans-serif;cursor:pointer;background:rgba(255,255,255,.06);color:#fff}
button.ok{background:linear-gradient(100deg,#22e1ff,#7b5cff);color:#05060f;border:0}button.no{color:#ff7a9a;border-color:rgba(255,77,122,.5)}
small{display:block;margin-top:16px;color:#8b93b8;font-size:13px}
</style></head><body><main><div class="i">${sym}</div>${inner}</main></body></html>`, { status: code, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
const details = (r) => `<dl><dt>App</dt><dd><b>${esc(r.app)}</b></dd><dt>Dispositivo</dt><dd>${esc(r.device || '—')}</dd>${r.note ? `<dt>Nome</dt><dd>${esc(r.note)}</dd>` : ''}<dt>Richiesta</dt><dd>${esc(fmtTime(r.created))}</dd>${r.country ? `<dt>Paese</dt><dd>${esc(r.country)}</dd>` : ''}</dl>`;
const DONE = {
  approved: ['Download già autorizzato', 'ok'], used: ['Download già effettuato', 'ok'],
  denied: ['Download rifiutato', 'bad'], expired: ['Richiesta scaduta', 'bad'], revoked: ['Autorizzazione revocata', 'bad'],
};
async function checkLink(env, id, k) {
  if (!ID_RE.test(id) || !k) return null;
  const sig = await linkSig(env, id);
  if (!sig || !safeEq(k, sig)) return null;
  return env.DB.prepare('SELECT * FROM store_requests WHERE id = ?').bind(id).first();
}
async function linkPage(url, env, ip, action) {
  if (await limited(env.RL_DEVICE, 'slnk:' + ip)) return page('Troppe richieste', '<h1>Troppe richieste</h1><p>Riprova tra un minuto.</p>', 'bad', 429);
  const id = str(url.searchParams.get('id'), 40), k = str(url.searchParams.get('k'), 100);
  const r = await checkLink(env, id, k);
  if (!r) return page('Link non valido', '<h1>Link non valido</h1><p>Il link è incompleto o la richiesta è stata eliminata.</p>', 'bad', 404);
  const st = effStatus(r);
  if (st !== 'pending') { const [t, tone] = DONE[st]; return page(t, `<h1>${t}</h1>${details(r)}`, tone); }
  const yes = `<button class="${action === 'deny' ? '' : 'ok'}" name="action" value="approve">Autorizza</button>`;
  const no = `<button class="no" name="action" value="deny"${action === 'deny' ? ' autofocus' : ''}>Rifiuta</button>`;
  return page('Richiesta di download', `<h1>${action === 'deny' ? 'Rifiutare il download?' : 'Autorizzare il download?'}</h1><p>Un cliente vuole scaricare un'app dal tuo Kairos Store.</p>${details(r)}
<form method="post" action="/api/store/decide"><input type="hidden" name="id" value="${esc(r.id)}"><input type="hidden" name="k" value="${esc(k)}">${action === 'deny' ? no + yes : yes + no}</form>
<small>Codice della richiesta: <b>${esc(r.code)}</b> · scade dopo 24 ore</small>`);
}
async function linkDecide(req, env, url, ip) {
  if (await limited(env.RL_DEVICE, 'slnk:' + ip)) return page('Troppe richieste', '<h1>Troppe richieste</h1><p>Riprova tra un minuto.</p>', 'bad', 429);
  const origin = req.headers.get('Origin');
  if (origin && origin !== 'null' && origin !== url.origin) return page('Richiesta non valida', '<h1>Richiesta non valida</h1>', 'bad', 403);
  const b = await readBody(req);
  const r = await checkLink(env, str(b.id, 40), str(b.k, 100));
  if (!r) return page('Link non valido', '<h1>Link non valido</h1><p>Il link è incompleto o la richiesta è stata eliminata.</p>', 'bad', 404);
  const action = b.action === 'deny' ? 'deny' : 'approve';
  if (!(await decide(env, r, action, 'email', ip))) { const st = effStatus(r); const [t, tone] = DONE[st] || DONE.expired; return page(t, `<h1>${t}</h1>${details(r)}`, tone); }
  if (action === 'approve') return page('Download autorizzato', `<h1>Download autorizzato</h1>${details(r)}<p>Se il cliente ha lo store aperto il download parte da solo entro pochi secondi. L'autorizzazione vale per un solo download, entro ${TOKEN_TTL / 60e3} minuti.</p>`, 'ok');
  return page('Download rifiutato', `<h1>Download rifiutato</h1>${details(r)}<p>Il cliente vedrà che la richiesta non è stata autorizzata.</p>`, 'bad');
}

/* ====================================================================== */
/* API del pannello (sessione e CSRF già verificati da admin())           */
/* ====================================================================== */
export async function storeAdmin(req, env, path, who, ip, by = 0, opts = {}) {
  const m = req.method;
  try {
    if (path === '/store' && m === 'GET') {
      const t = now();
      const settings = await getStoreSettings(env);
      const rows = ((await env.DB.prepare('SELECT id, app, app_url, did, device, note, country, code, status, via, tries, uses, created, decided, by_admin FROM store_requests WHERE created > ? ORDER BY created DESC LIMIT 300').bind(t - KEEP).all()).results) || [];
      const requests = rows.map((r) => {
        const st = effStatus(r, t);
        return { id: r.id, app: r.app, appUrl: r.app_url, did: r.did, device: r.device, note: r.note, country: r.country, code: st === 'pending' ? r.code : '', status: st, via: r.via, tries: r.tries, uses: r.uses, created: r.created, decided: r.decided, by: +r.by_admin || 0 };
      });
      requests.sort((a, b) => (+(b.status === 'pending') - +(a.status === 'pending')) || (b.created - a.created));
      // vista per dispositivo: le richieste raggruppate per installazione dello store (did)
      const byDid = new Map();
      for (const r of [...requests].sort((a, b) => b.created - a.created)) {
        let d = byDid.get(r.did);
        if (!d) { d = { did: r.did, device: r.device, note: r.note, country: r.country, last: r.created, requests: 0, downloads: 0, pending: 0, blocked: settings.blocked.includes(r.did) }; byDid.set(r.did, d); }
        if (!d.device && r.device) d.device = r.device;
        if (!d.note && r.note) d.note = r.note;
        d.requests++; if (r.uses > 0) d.downloads++; if (r.status === 'pending') d.pending++;
      }
      for (const did of settings.blocked) if (!byDid.has(did)) byDid.set(did, { did, device: '', note: '', country: '', last: 0, requests: 0, downloads: 0, pending: 0, blocked: true });
      const devices = [...byDid.values()].sort((a, b) => (+b.blocked - +a.blocked) || (b.last - a.last));
      const sent = await env.DB.prepare('SELECT COUNT(*) AS n FROM store_requests WHERE mailed = 1 AND created > ?').bind(t - 86400e3).first();
      const smsSent = await env.DB.prepare('SELECT COALESCE(SUM(sms), 0) AS n FROM store_requests WHERE created > ?').bind(t - 86400e3).first();
      let agents = [];
      if (typeof opts.smsAgentList === 'function') { try { agents = await opts.smsAgentList(); } catch {} }
      return json({
        settings,
        mail: { resend: !!env.RESEND_KEY, envEmail: !!str(env.OWNER_EMAIL, 200), links: !!env.ENC_KEY, sentToday: (sent && sent.n) || 0, limit: MAIL_PER_DAY },
        sms: { ready: smsReady(env), sentToday: (smsSent && +smsSent.n) || 0, agents },
        requests, pending: requests.filter((r) => r.status === 'pending').length, devices,
      });
    }
    if (path === '/store/settings' && m === 'PUT') {
      const b = await readBody(req, 8192);
      const s = await getStoreSettings(env);
      if (typeof b.approval === 'boolean') s.approval = b.approval;
      if (typeof b.ownerEmail === 'string') {
        const e = str(b.ownerEmail, 200);
        if (e && !MAIL_RE.test(e)) throw new StoreErr(400, 'Email non valida');
        s.ownerEmail = e;
      }
      let smsTxt = '';
      if (b.sms && typeof b.sms === 'object') {
        const raw = b.sms, list = Array.isArray(raw.agents) ? raw.agents.slice(0, 200) : [];
        if (raw.owner && !phoneNorm(raw.owner)) throw new StoreErr(400, 'Il tuo numero non è valido: scrivilo con il prefisso, es. +39 333 1234567');
        for (const a of list) if (a && a.phone && !phoneNorm(a.phone)) throw new StoreErr(400, `Numero non valido: ${str(a.phone, 30)}`);
        const known = typeof opts.smsAgentList === 'function' ? new Set((await opts.smsAgentList()).map((a) => a.id)) : null;
        const next = smsNorm({ ...raw, agents: list.filter((a) => !known || known.has(parseInt(a && a.id, 10))) });
        if (next.on && !next.owner && !next.agents.some((a) => a.on)) throw new StoreErr(400, 'Per attivare gli SMS scrivi almeno un numero');
        s.sms = next;
        smsTxt = ` · SMS ${next.on ? `attivi (${(next.owner ? 1 : 0) + next.agents.filter((a) => a.on).length} numeri, max ${next.perDay}/giorno)` : 'spenti'}`;
      }
      await putStoreSettings(env, s);
      await log(env, 'settings', `${who}: download store — approvazione ${s.approval ? 'attiva' : 'spenta'}${smsTxt}`, ip);
      return json({ settings: s });
    }
    if (path === '/store/sms/test' && m === 'POST') {
      const b = await readBody(req);
      const to = phoneNorm(b.phone);
      if (!to) throw new StoreErr(400, 'Numero non valido: scrivilo con il prefisso, es. +39 333 1234567');
      if (!smsReady(env)) throw new StoreErr(400, 'SMS non attivi: mancano TWILIO_SID, TWILIO_TOKEN o TWILIO_FROM');
      const r = await sendSms(env, to, 'Kairos Store: SMS di prova. Da ora riceverai qui i codici delle richieste di download.', ip);
      if (!r.ok) throw new StoreErr(502, 'SMS non inviato: ' + r.error);
      await log(env, 'settings', `${who}: Store — SMS di prova a ${maskPhone(to)}`, ip);
      return json({ ok: true, to: maskPhone(to) });
    }
    if (path === '/store/device/block' && m === 'POST') {
      const b = await readBody(req);
      const did = str(b.did, 64);
      if (!DID_RE.test(did)) throw new StoreErr(400, 'Dispositivo non valido');
      const s = await getStoreSettings(env);
      const blocked = b.blocked !== false;
      s.blocked = s.blocked.filter((d) => d !== did);
      if (blocked) {
        if (s.blocked.length >= MAX_BLOCKED) throw new StoreErr(400, 'Troppi dispositivi bloccati');
        s.blocked.unshift(did);
      }
      await putStoreSettings(env, s);
      let revoked = 0;
      if (blocked) {
        // le richieste in corso di quel dispositivo decadono subito (quelle già scaricate restano nello storico)
        const u = await env.DB.prepare("UPDATE store_requests SET status = 'revoked', token = '', decided = ? WHERE did = ? AND status IN ('pending', 'approved') AND uses = 0").bind(now(), did).run();
        revoked = (u && u.meta && u.meta.changes) || 0;
      }
      const name = await env.DB.prepare('SELECT device, note FROM store_requests WHERE did = ? ORDER BY created DESC LIMIT 1').bind(did).first();
      await log(env, blocked ? 'off' : 'on', `${who}: Store — dispositivo ${blocked ? 'bloccato' : 'sbloccato'} · ${(name && name.device) || 'dispositivo'}${name && name.note ? ' (' + name.note + ')' : ''}`, ip);
      return json({ ok: true, did, blocked, revoked, settings: s });
    }
    const dm = path.match(/^\/store\/([A-Za-z0-9_-]{12,40})\/(approve|deny|revoke)$/);
    if (dm && m === 'POST') {
      const r = await env.DB.prepare('SELECT * FROM store_requests WHERE id = ?').bind(dm[1]).first();
      if (!r) throw new StoreErr(404, 'Richiesta non trovata');
      if (dm[2] === 'revoke') {
        if (!(await revoke(env, r, who, ip))) throw new StoreErr(409, 'Questa richiesta non si può più revocare');
        return json({ ok: true, status: 'revoked' });
      }
      if (!(await decide(env, r, dm[2], 'panel', ip, by, who))) throw new StoreErr(409, 'La richiesta non è più in attesa');
      return json({ ok: true, status: effStatus(r) });
    }
    if (path === '/store' && m === 'DELETE') {
      await env.DB.prepare("DELETE FROM store_requests WHERE status <> 'pending' OR created < ?").bind(now() - REQ_TTL).run();
      await log(env, 'del', `${who}: svuotato lo storico dei download dello store`, ip);
      return json({ ok: true });
    }
    return json({ error: 'Endpoint sconosciuto' }, 404);
  } catch (e) {
    if (e instanceof StoreErr) return json({ error: e.message }, e.status);
    throw e;
  }
}

/** decisione da Telegram o dalle notifiche: { ok, status, error } */
export async function storeDecide(env, id, action, via, ip, by, who) {
  const r = await env.DB.prepare('SELECT * FROM store_requests WHERE id = ?').bind(String(id)).first();
  if (!r) return { ok: false, status: 'unknown', error: 'Richiesta non trovata' };
  const st0 = effStatus(r);
  if (st0 !== 'pending') return { ok: false, status: st0, error: (ENDED[st0] || 'Richiesta non più in attesa') };
  const ok = await decide(env, r, action === 'approve' ? 'approve' : 'deny', via, ip, by, who);
  return ok ? { ok: true, status: effStatus(r) } : { ok: false, status: effStatus(r), error: 'La richiesta non è più in attesa' };
}

export const _storeInternal = { effStatus, linkSig, sixDigits, phoneNorm, smsNorm, smsSafe, TOKEN_TTL, REQ_TTL, MAX_TRIES, MAX_USES };
