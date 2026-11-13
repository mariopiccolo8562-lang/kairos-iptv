/*  KAIROS — Avvisi delle richieste di download dello Store: Telegram e notifiche del pannello (web push)
 *
 *  TELEGRAM (gratis)
 *    Segreto: TELEGRAM_BOT_TOKEN (il token del bot creato con @BotFather).
 *    Il titolare e gli agenti a cui lo consente collegano il proprio Telegram dal pannello:
 *    il pannello crea un link t.me/<bot>?start=<codice> valido 15 minuti; aperto il bot, la chat resta collegata.
 *    Ogni richiesta arriva con i pulsanti Autorizza / Rifiuta; dopo la decisione (da qualsiasi parte) il messaggio
 *    si aggiorna per tutti con l'esito e chi ha deciso. /stop nel bot scollega la chat.
 *    Webhook: POST /api/tg/hook, protetto dall'intestazione X-Telegram-Bot-Api-Secret-Token (derivata da ENC_KEY).
 *
 *  NOTIFICHE DEL PANNELLO (web push, gratis)
 *    Le chiavi VAPID si creano da sole e restano nelle impostazioni. La notifica parte senza contenuto:
 *    è il service worker del pannello (panel/sw.js) a leggere la richiesta con la sessione di chi la riceve,
 *    quindi su telefoni persi o disconnessi non compare nessun dato.
 *
 *  API del pannello (titolare e agenti, dopo sessione + CSRF):
 *    GET    /api/admin/notify                     → stato per chi chiede (+ agenti e consensi per il titolare)
 *    POST   /api/admin/notify/tg/link             → { url }  link per collegare Telegram
 *    POST   /api/admin/notify/tg/unlink
 *    POST   /api/admin/notify/tg/setup            (titolare) collega il bot al pannello (webhook)
 *    POST   /api/admin/notify/tg/test             messaggio di prova al proprio Telegram
 *    POST   /api/admin/notify/push                { sub } iscrive questo dispositivo
 *    DELETE /api/admin/notify/push                { endpoint } toglie questo dispositivo
 *    POST   /api/admin/notify/push/test           notifica di prova ai propri dispositivi
 *    PUT    /api/admin/notify/consent             (titolare) { tg:[idAgenti], push:[idAgenti] }
 */

const enc = new TextEncoder();
const now = () => Date.now();
const str = (v, max = 200) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '');
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const rand = (n) => crypto.getRandomValues(new Uint8Array(n));
function b64url(buf) { let s = ''; const b = new Uint8Array(buf); for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function unb64url(s) { const bin = atob(String(s).replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((String(s).length + 3) % 4)); const o = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) o[i] = bin.charCodeAt(i); return o; }
const htmlEsc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// testo scritto dal dispositivo del cliente: niente link o testi ingannevoli negli avvisi
const safe = (v, max) => String(v || '').replace(/[^\p{L}\p{N} _()+-]/gu, ' ').replace(/\b(?:https?|www)\b/gi, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
function safeEq(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const x = enc.encode(a), y = enc.encode(b); let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] || 0) ^ (y[i] || 0);
  return d === 0;
}
class NErr extends Error { constructor(status, msg) { super(msg); this.status = status; } }
async function readBody(req, max = 8192) {
  const t = await req.text(); if (t.length > max) throw new NErr(413, 'Richiesta troppo grande');
  try { const j = JSON.parse(t || '{}'); return j && typeof j === 'object' ? j : {}; } catch { throw new NErr(400, 'Dati non validi'); }
}
async function log(env, type, text, ip = '') {
  try { await env.DB.prepare('INSERT INTO activity (t, type, text, ip) VALUES (?, ?, ?, ?)').bind(now(), type, String(text).slice(0, 300), ip).run(); } catch {}
}
const fmtTime = (t) => { try { return new Date(t).toLocaleString('it-IT', { timeZone: 'Europe/Rome', dateStyle: 'short', timeStyle: 'short' }); } catch { return new Date(t).toISOString(); } };

/* ---------------- impostazioni ---------------- */
async function getJ(env, k) { const r = await env.DB.prepare('SELECT v FROM settings WHERE k = ?').bind(k).first(); try { return r ? JSON.parse(r.v) || {} : {}; } catch { return {}; } }
async function putJ(env, k, v) { await env.DB.prepare('INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind(k, JSON.stringify(v)).run(); }
const ids = (v) => [...new Set((Array.isArray(v) ? v : []).map((x) => parseInt(x, 10)).filter((x) => x > 0))].slice(0, 500);
async function getCfg(env) { const c = await getJ(env, 'notify'); return { tgAgents: ids(c.tgAgents), pushAgents: ids(c.pushAgents), bot: typeof c.bot === 'string' ? c.bot : '', hook: typeof c.hook === 'string' ? c.hook : '' }; }

/* ---------------- chi riceve ---------------- */
// h = { owners(): [{id,username}], eligible(app, ids): [ids], agents(): [{id, username, store, active}] }
// r = richiesta: agli agenti arriva solo se porta il loro codice venditore (o di un sotto-agente); senza codice è del titolare
async function recipients(env, app, kind, h, r) {
  const cfg = await getCfg(env);
  // con il codice di un agente il titolare non viene avvisato (la vede nel pannello), a meno che non lo chieda nelle impostazioni dello Store
  const chain = r && r.seller && typeof h.sellerChain === 'function' ? await h.sellerChain(r) : [];
  // …ma se nessuno nella catena dell'agente può decidere quell'app (sospeso, app non concessa) la richiesta torna a te
  const orphan = !!(r && r.seller) && !(chain.length && (await h.eligible(app, chain)).length);
  const ownerToo = !(r && r.seller) || orphan || (typeof h.agentAlerts === 'function' && (await h.agentAlerts()));
  const owners = ownerToo ? (await h.owners()).map((o) => ({ id: o.id, name: o.username, owner: true })) : [];
  let allow = kind === 'tg' ? cfg.tgAgents : cfg.pushAgents;
  if (r !== undefined) allow = allow.filter((id) => chain.includes(id));
  let agents = [];
  if (allow.length) {
    const ok = new Set(await h.eligible(app, allow));
    const names = new Map((await h.agents()).map((a) => [a.id, a.username]));
    agents = allow.filter((id) => ok.has(id)).map((id) => ({ id, name: names.get(id) || '', owner: false }));
  }
  return [...owners, ...agents];
}

/* ====================================================================== */
/* TELEGRAM                                                               */
/* ====================================================================== */
const tgReady = (env) => /^\d{5,15}:[A-Za-z0-9_-]{30,60}$/.test(str(env.TELEGRAM_BOT_TOKEN, 100));
async function tg(env, method, body) {
  const r = await fetch(`https://api.telegram.org/bot${str(env.TELEGRAM_BOT_TOKEN, 100)}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}),
  });
  let j = {}; try { j = await r.json(); } catch {}
  if (!r.ok || !j.ok) { const e = new Error(str(j.description, 160) || 'Telegram ' + r.status); e.code = r.status; throw e; }
  return j.result;
}
async function hookSecret(env) {
  if (!env.ENC_KEY) return '';
  const raw = Uint8Array.from(atob(env.ENC_KEY), (c) => c.charCodeAt(0));
  const k = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', k, enc.encode('kairos-telegram-hook-v1')));
}
/** collega il bot al pannello (webhook); restituisce il nome del bot */
async function tgSetup(env, origin) {
  if (!tgReady(env)) throw new NErr(400, 'Manca il segreto TELEGRAM_BOT_TOKEN (vedi la guida nel README)');
  const secret = await hookSecret(env);
  if (!secret) throw new NErr(500, 'Manca ENC_KEY sul Worker');
  let me;
  try { me = await tg(env, 'getMe'); } catch (e) { throw new NErr(400, 'Token del bot non valido: ' + e.message); }
  const hook = origin + '/api/tg/hook';
  try {
    await tg(env, 'setWebhook', { url: hook, secret_token: secret, allowed_updates: ['message', 'callback_query'], drop_pending_updates: true, max_connections: 10 });
    await tg(env, 'setMyCommands', { commands: [{ command: 'stop', description: 'Scollega questa chat dal pannello' }] }).catch(() => {});
  } catch (e) { throw new NErr(502, 'Telegram non ha accettato il collegamento: ' + e.message); }
  const cfg = await getJ(env, 'notify');
  cfg.bot = str(me.username, 64); cfg.hook = hook;
  await putJ(env, 'notify', cfg);
  return cfg.bot;
}

const STATE = {
  approved: (w) => `✅ <b>Autorizzato</b>${w}`, used: (w) => `✅ <b>Autorizzato e scaricato</b>${w}`,
  denied: (w) => `❌ <b>Rifiutato</b>${w}`, revoked: (w) => `⛔ <b>Autorizzazione revocata</b>${w}`, expired: () => '⌛ <b>Richiesta scaduta</b>',
};
const VIA_TXT = { email: "dall'email", panel: 'dal pannello', code: 'con il codice', telegram: 'da Telegram', push: 'dalla notifica', tries: 'troppi codici errati', auto: 'automatica' };
function tgText(r, outcome) {
  const lines = ['📥 <b>Richiesta di download</b>', `App: <b>${htmlEsc(safe(r.app, 40))}</b>`];
  const dev = safe(r.device, 40), note = safe(r.note, 30), ctry = safe(r.country, 40);
  if (dev) lines.push('Dispositivo: ' + htmlEsc(dev));
  if (note) lines.push('Nome: ' + htmlEsc(note));
  if (ctry) lines.push('Paese: ' + htmlEsc(ctry));
  lines.push('Ora: ' + htmlEsc(fmtTime(r.created)));
  if (!outcome) lines.push(`Codice per il cliente: <code>${htmlEsc(r.code)}</code>`);
  else lines.push('', outcome);
  return lines.join('\n');
}
const tgKeys = (id) => ({ inline_keyboard: [[{ text: '✅ Autorizza', callback_data: 'a:' + id }, { text: '❌ Rifiuta', callback_data: 'd:' + id }]] });

/** nuova richiesta: messaggio con i pulsanti a tutti i collegati che possono riceverla */
async function tgNew(env, r, h, ip) {
  if (!tgReady(env)) return 0;
  const who = await recipients(env, r.app, 'tg', h, r);
  if (!who.length) return 0;
  const rows = ((await env.DB.prepare(`SELECT admin_id, tg_chat FROM notify_links WHERE tg_chat <> '' AND admin_id IN (${who.map(() => '?').join(',')})`).bind(...who.map((w) => w.id)).all()).results) || [];
  const chats = [...new Set(rows.map((x) => x.tg_chat))];
  let n = 0;
  for (const chat of chats) {
    try {
      const m = await tg(env, 'sendMessage', { chat_id: chat, text: tgText(r), parse_mode: 'HTML', reply_markup: tgKeys(r.id), disable_web_page_preview: true });
      await env.DB.prepare('INSERT OR REPLACE INTO tg_msgs (req_id, chat_id, msg_id, created) VALUES (?, ?, ?, ?)').bind(r.id, chat, m.message_id, now()).run();
      n++;
    } catch (e) {
      if (e.code === 403) { // l'utente ha bloccato il bot: chat scollegata
        await env.DB.prepare("UPDATE notify_links SET tg_chat = '', tg_name = '' WHERE tg_chat = ?").bind(chat).run();
        await log(env, 'off', 'Telegram: una chat ha bloccato il bot ed è stata scollegata', ip);
      } else await log(env, 'off', 'Telegram: avviso non inviato (' + str(e.message, 120) + ')', ip);
    }
  }
  return n;
}
export async function notifyOwnersText(env, h, text) {
  try {
    if (!tgReady(env)) return 0;
    const who = await recipients(env, null, 'tg', h, {});
    const owners = [...new Set(who.filter((x) => x.owner).map((x) => x.id))];
    if (!owners.length) return 0;
    const rows = ((await env.DB.prepare(`SELECT admin_id, tg_chat FROM notify_links WHERE tg_chat <> '' AND admin_id IN (${owners.map(() => '?').join(',')})`).bind(...owners).all()).results) || [];
    const chats = [...new Set(rows.map((x) => x.tg_chat).filter(Boolean))];
    let n = 0;
    for (const chat of chats) {
      try {
        await tg(env, 'sendMessage', { chat_id: chat, text, parse_mode: 'HTML', disable_web_page_preview: true });
        n++;
      } catch {}
    }
    return n;
  } catch {
    return 0;
  }
}
/** dopo una decisione (da qualsiasi parte): i messaggi già inviati mostrano l'esito, senza pulsanti */
async function tgDecided(env, r, st, whoTxt) {
  if (!tgReady(env)) return;
  const msgs = ((await env.DB.prepare('SELECT chat_id, msg_id FROM tg_msgs WHERE req_id = ?').bind(r.id).all()).results) || [];
  if (!msgs.length) return;
  const w = whoTxt ? ' · ' + htmlEsc(whoTxt) : '';
  const text = tgText(r, (STATE[st] || STATE.expired)(w));
  await Promise.all(msgs.map((m) => tg(env, 'editMessageText', { chat_id: m.chat_id, message_id: m.msg_id, text, parse_mode: 'HTML', disable_web_page_preview: true }).catch(() => {})));
}

/** webhook di Telegram */
export async function tgHook(req, env, ctx, ip, h) {
  const secret = await hookSecret(env);
  if (!secret || !safeEq(req.headers.get('X-Telegram-Bot-Api-Secret-Token') || '', secret)) return json({ error: 'Non autorizzato' }, 403);
  if (!tgReady(env)) return json({ ok: true });
  let u = {}; try { u = JSON.parse(await req.text()); } catch {}
  try {
    if (u.message) await tgMessage(env, u.message, ip);
    else if (u.callback_query) await tgCallback(env, u.callback_query, ip, h);
  } catch (e) { console.error('tg', e && e.stack || e); }
  return json({ ok: true }); // a Telegram si risponde sempre 200, altrimenti ripete
}
async function tgMessage(env, msg, ip) {
  const chat = msg.chat || {}, text = str(msg.text, 200);
  if (chat.type !== 'private') return; // solo chat private
  const cid = String(chat.id);
  const reply = (t) => tg(env, 'sendMessage', { chat_id: cid, text: t, parse_mode: 'HTML' }).catch(() => {});
  const m = text.match(/^\/start(?:@\w+)?\s+([A-Za-z0-9_-]{16,40})$/);
  if (m) {
    const c = await env.DB.prepare('SELECT admin_id, created FROM tg_codes WHERE code = ?').bind(m[1]).first();
    await env.DB.prepare('DELETE FROM tg_codes WHERE code = ? OR created < ?').bind(m[1], now() - 15 * 60e3).run();
    if (!c || now() - c.created > 15 * 60e3) { await reply('⚠️ Link scaduto o già usato. Dal pannello premi di nuovo <b>Collega Telegram</b>.'); return; }
    const a = await env.DB.prepare('SELECT id, username, role FROM admins WHERE id = ?').bind(c.admin_id).first();
    if (!a) { await reply('⚠️ Account non trovato.'); return; }
    const name = str([msg.from && msg.from.first_name, msg.from && msg.from.username ? '@' + msg.from.username : ''].filter(Boolean).join(' '), 80);
    await env.DB.prepare("INSERT INTO notify_links (admin_id, tg_chat, tg_name, tg_linked) VALUES (?, ?, ?, ?) ON CONFLICT(admin_id) DO UPDATE SET tg_chat = excluded.tg_chat, tg_name = excluded.tg_name, tg_linked = excluded.tg_linked").bind(a.id, cid, name, now()).run();
    await log(env, 'settings', `${a.role === 'agent' ? 'Agente ' : ''}${a.username}: Telegram collegato (${name || 'chat'})`, ip);
    await reply(`✅ <b>Collegato al pannello</b> come <b>${htmlEsc(a.username)}</b>.\nIl Kairos Store ora è aperto: i clienti scaricano senza autorizzazione, quindi qui non arrivano più richieste da approvare.\n\nPer scollegare scrivi /stop`);
    return;
  }
  if (/^\/stop\b/.test(text)) {
    const rows = ((await env.DB.prepare('SELECT a.username, a.role FROM notify_links n JOIN admins a ON a.id = n.admin_id WHERE n.tg_chat = ?').bind(cid).all()).results) || [];
    await env.DB.prepare("UPDATE notify_links SET tg_chat = '', tg_name = '' WHERE tg_chat = ?").bind(cid).run();
    for (const a of rows) await log(env, 'settings', `${a.role === 'agent' ? 'Agente ' : ''}${a.username}: Telegram scollegato dal bot`, ip);
    await reply(rows.length ? '👋 Chat scollegata: non riceverai più avvisi.' : 'Questa chat non era collegata.');
    return;
  }
  await reply('Il Kairos Store ora è aperto: i clienti scaricano senza autorizzazione, quindi questo bot non invia più richieste da approvare. Quanti scaricano lo vedi nel pannello → <b>Riepilogo store</b>.');
}
async function tgCallback(env, q, ip, h) {
  const answer = (t, alert = false) => tg(env, 'answerCallbackQuery', { callback_query_id: q.id, text: t, show_alert: alert }).catch(() => {});
  const m = String(q.data || '').match(/^([ad]):([A-Za-z0-9_-]{12,40})$/);
  const chat = q.message && q.message.chat ? String(q.message.chat.id) : '';
  if (!m || !chat || (q.from && String(q.from.id) !== chat)) { await answer('Azione non valida'); return; }
  const links = ((await env.DB.prepare('SELECT n.admin_id, a.username, a.role, a.active FROM notify_links n JOIN admins a ON a.id = n.admin_id WHERE n.tg_chat = ?').bind(chat).all()).results) || [];
  if (!links.length) { await answer('Questa chat non è più collegata al pannello', true); return; }
  const r = await env.DB.prepare('SELECT * FROM store_requests WHERE id = ?').bind(m[2]).first();
  if (!r) { await answer('Richiesta non trovata', true); return; }
  // chi decide: prima il titolare, poi un agente consentito e con il permesso per questa app
  const owner = links.find((l) => l.role !== 'agent' && l.active);
  let actor = owner ? { by: 0, who: owner.username, name: owner.username } : null;
  if (!actor) {
    const cfg = await getCfg(env);
    let cand = links.filter((l) => l.role === 'agent' && cfg.tgAgents.includes(l.admin_id)).map((l) => l.admin_id);
    if (typeof h.sellerChain === 'function') { const ch = await h.sellerChain(r); cand = cand.filter((id) => ch.includes(id)); } // un agente decide solo le richieste col suo codice
    const ok = cand.length ? await h.eligible(r.app, cand) : [];
    const l = links.find((x) => ok.includes(x.admin_id));
    if (l) actor = { by: l.admin_id, who: 'Agente ' + l.username, name: l.username };
  }
  if (!actor) { await answer('Non hai il permesso di decidere questa richiesta', true); return; }
  const action = m[1] === 'a' ? 'approve' : 'deny';
  const done = await h.decide(env, r.id, action, 'telegram', ip, actor.by, actor.who);
  if (done.ok) { await answer(action === 'approve' ? '✅ Autorizzato: sul dispositivo il download parte da solo' : '❌ Rifiutato'); return; }
  await answer(done.error || 'La richiesta non è più in attesa', true);
  await tgDecided(env, r, done.status || 'expired', '');
}

/* ====================================================================== */
/* WEB PUSH (VAPID, notifica senza contenuto)                             */
/* ====================================================================== */
const PUSH_HOSTS = /^(?:fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9.-]+\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)$/i;
function pushEndpointOk(e) {
  try { const u = new URL(e); return u.protocol === 'https:' && !u.port && PUSH_HOSTS.test(u.hostname) && e.length <= 800; } catch { return false; }
}
async function vapid(env) {
  const v = await getJ(env, 'vapid');
  if (v.pub && v.jwk) return v;
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const out = { pub: b64url(await crypto.subtle.exportKey('raw', kp.publicKey)), jwk: await crypto.subtle.exportKey('jwk', kp.privateKey), created: now() };
  // se due richieste creano le chiavi insieme, vince la prima salvata
  await env.DB.prepare('INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO NOTHING').bind('vapid', JSON.stringify(out)).run();
  const saved = await getJ(env, 'vapid');
  return saved.pub && saved.jwk ? saved : out;
}
const jwtCache = new Map();
async function vapidAuth(env, endpoint, sub) {
  const v = await vapid(env), aud = new URL(endpoint).origin;
  const c = jwtCache.get(aud);
  if (c && c.pub === v.pub && c.exp - now() > 3600e3) return c.h;
  const exp = now() + 12 * 3600e3;
  const head = b64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = b64url(enc.encode(JSON.stringify({ aud, exp: Math.floor(exp / 1000), sub })));
  const key = await crypto.subtle.importKey('jwk', v.jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = b64url(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(head + '.' + body)));
  const h = `vapid t=${head}.${body}.${sig}, k=${v.pub}`;
  jwtCache.set(aud, { h, exp, pub: v.pub });
  return h;
}
async function pushOne(env, row, origin) {
  try {
    const res = await fetch(row.endpoint, { method: 'POST', headers: { Authorization: await vapidAuth(env, row.endpoint, origin), TTL: '86400', Urgency: 'high', 'Content-Length': '0' } });
    if (res.status === 404 || res.status === 410) { await env.DB.prepare('DELETE FROM push_subs WHERE id = ?').bind(row.id).run(); return false; }
    if (res.ok) { await env.DB.prepare('UPDATE push_subs SET last_ok = ? WHERE id = ?').bind(now(), row.id).run(); return true; }
    return false;
  } catch { return false; }
}
async function pushNew(env, r, h, origin) {
  const who = await recipients(env, r.app, 'push', h, r);
  if (!who.length) return 0;
  const rows = ((await env.DB.prepare(`SELECT id, endpoint FROM push_subs WHERE admin_id IN (${who.map(() => '?').join(',')})`).bind(...who.map((w) => w.id)).all()).results) || [];
  const ok = await Promise.all(rows.map((row) => pushOne(env, row, origin)));
  return ok.filter(Boolean).length;
}

/* ====================================================================== */
/* richiami dallo store                                                   */
/* ====================================================================== */
export async function notifyNew(env, r, origin, ip, h) {
  await Promise.all([tgNew(env, r, h, ip).catch(() => 0), pushNew(env, r, h, origin).catch(() => 0)]);
}
/** store attivato con il codice di un venditore: un messaggio Telegram a lui (e a chi sta sopra); al titolare solo se è suo o se vuole tutto */
export async function notifyActivated(env, d, ip, h) {
  if (!tgReady(env)) return 0;
  const who = await recipients(env, null, 'tg', h, { seller: d.seller });
  if (!who.length) return 0;
  const rows = ((await env.DB.prepare(`SELECT admin_id, tg_chat FROM notify_links WHERE tg_chat <> '' AND admin_id IN (${who.map(() => '?').join(',')})`).bind(...who.map((w) => w.id)).all()).results) || [];
  const chats = [...new Set(rows.map((x) => x.tg_chat))];
  const text = `🏪 <b>Store ${d.again ? 'intestato di nuovo' : 'attivato'}</b>\n${htmlEsc(d.device || 'Dispositivo')}${d.note ? ' · ' + htmlEsc(d.note) : ''}${d.country ? ' · ' + htmlEsc(d.country) : ''}\nVenditore: <b>${htmlEsc(d.sellerName)}</b>`;
  let n = 0;
  for (const chat of chats) { try { await tg(env, 'sendMessage', { chat_id: chat, text, parse_mode: 'HTML', disable_web_page_preview: true }); n++; } catch (e) { await log(env, 'off', 'Telegram: avviso di attivazione non inviato (' + str(e.message, 120) + ')', ip); } }
  return n;
}
/** download partito dallo Store (lo store è aperto: niente da autorizzare, solo l'avviso). Stesse regole di chi riceve:
 *  con il codice di un agente lo avvisa lui (se ha il consenso) e il titolare solo se lo chiede; senza codice il titolare. */
export async function notifyDownload(env, d, origin, ip, h) {
  const t = now(), key = 'dl_note:' + str(d.did, 64) + ':' + str(d.app, 80).slice(0, 40);
  // doppio avviso (store che manda due chiamate per lo stesso download): uno solo ogni 2 minuti
  const g = await env.DB.prepare('INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v WHERE CAST(settings.v AS INTEGER) < ?').bind(key, String(t), t - 120e3).run().catch(() => null);
  if (g && g.meta && g.meta.changes === 0) return 0;
  const r = { app: d.app, seller: +d.seller || 0 };
  const info = { t, app: str(d.app, 80), device: str(d.device, 80), country: str(d.country, 40), code: str(d.code, 80) };
  let n = 0;
  // notifiche del pannello: la notifica arriva vuota, il testo lo legge il service worker da /notify/peek
  try {
    const who = await recipients(env, d.app, 'push', h, r);
    if (who.length) {
      for (const w of who) await env.DB.prepare('INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind('push_dl:' + w.id, JSON.stringify(info)).run();
      const rows = ((await env.DB.prepare(`SELECT id, endpoint FROM push_subs WHERE admin_id IN (${who.map(() => '?').join(',')})`).bind(...who.map((w) => w.id)).all()).results) || [];
      n += (await Promise.all(rows.map((row) => pushOne(env, row, origin)))).filter(Boolean).length;
    }
  } catch {}
  // Telegram
  try {
    if (tgReady(env)) {
      const who = await recipients(env, d.app, 'tg', h, r);
      if (who.length) {
        const rows = ((await env.DB.prepare(`SELECT tg_chat FROM notify_links WHERE tg_chat <> '' AND admin_id IN (${who.map(() => '?').join(',')})`).bind(...who.map((w) => w.id)).all()).results) || [];
        const text = `📥 <b>Download dallo Store</b>\n<b>${htmlEsc(info.app)}</b> su ${htmlEsc(info.device || 'dispositivo')}${info.country ? ' · ' + htmlEsc(info.country) : ''}${info.code ? '\n' + htmlEsc(info.code) : ''}`;
        for (const chat of new Set(rows.map((x) => x.tg_chat))) {
          try { await tg(env, 'sendMessage', { chat_id: chat, text, parse_mode: 'HTML', disable_web_page_preview: true }); n++; }
          catch (e) { if (e.code === 403) await env.DB.prepare("UPDATE notify_links SET tg_chat = '', tg_name = '' WHERE tg_chat = ?").bind(chat).run(); }
        }
      }
    }
  } catch {}
  return n;
}
export async function notifyDecided(env, r, st, via, who) {
  const w = [who, VIA_TXT[via] || ''].filter(Boolean).join(' ');
  await tgDecided(env, r, st, w ? w + ' · ' + fmtTime(now()).split(', ').pop() : '').catch(() => {});
}

/* ====================================================================== */
/* API del pannello                                                       */
/* ====================================================================== */
// me = { id, username, agent: bool }
export async function notifyAdmin(req, env, path, me, ip, origin, h) {
  const m = req.method;
  try {
    const cfg = await getCfg(env);
    const canTg = !me.agent || cfg.tgAgents.includes(me.id), canPush = !me.agent || cfg.pushAgents.includes(me.id);
    const who = (me.agent ? 'Agente ' : '') + me.username;
    if (path === '/notify' && m === 'GET') {
      // tutte le letture insieme: il database è lontano e prima erano sei attese una dopo l'altra
      const [link, subs, key, agents, linksR, pushR] = await Promise.all([
        env.DB.prepare('SELECT tg_chat, tg_name, tg_linked FROM notify_links WHERE admin_id = ?').bind(me.id).first(),
        env.DB.prepare('SELECT COUNT(*) AS n FROM push_subs WHERE admin_id = ?').bind(me.id).first(),
        canPush ? vapid(env).then((v) => v.pub) : '',
        me.agent ? null : h.agents(),
        me.agent ? null : env.DB.prepare("SELECT admin_id, tg_chat FROM notify_links WHERE tg_chat <> ''").all(),
        me.agent ? null : env.DB.prepare('SELECT admin_id, COUNT(*) AS n FROM push_subs GROUP BY admin_id').all(),
      ]);
      const out = {
        tg: { ready: tgReady(env), bot: cfg.bot, hooked: !!cfg.bot && cfg.hook === origin + '/api/tg/hook', allowed: canTg, linked: !!(link && link.tg_chat), name: (link && link.tg_name) || '', since: (link && link.tg_linked) || 0 },
        push: { allowed: canPush, key, devices: (subs && +subs.n) || 0 },
      };
      if (!me.agent) {
        const links = new Map((((linksR && linksR.results) || [])).map((x) => [x.admin_id, true]));
        const pushN = new Map((((pushR && pushR.results) || [])).map((x) => [x.admin_id, +x.n]));
        out.agents = agents.map((a) => ({ id: a.id, username: a.username, store: a.store, active: a.active, tg: cfg.tgAgents.includes(a.id), push: cfg.pushAgents.includes(a.id), tgLinked: !!links.get(a.id), pushDevices: pushN.get(a.id) || 0 }));
      }
      return json(out);
    }
    if (path === '/notify/consent' && m === 'PUT') {
      if (me.agent) throw new NErr(403, 'Solo il titolare può scegliere chi riceve gli avvisi');
      const b = await readBody(req);
      const known = new Set((await h.agents()).map((a) => a.id));
      const raw = await getJ(env, 'notify');
      if (b.tg !== undefined) raw.tgAgents = ids(b.tg).filter((x) => known.has(x));
      if (b.push !== undefined) raw.pushAgents = ids(b.push).filter((x) => known.has(x));
      await putJ(env, 'notify', raw);
      // chi perde il consenso viene scollegato subito
      const tgOff = [...known].filter((x) => !(raw.tgAgents || []).includes(x)), pushOff = [...known].filter((x) => !(raw.pushAgents || []).includes(x));
      for (const x of tgOff) await env.DB.prepare("UPDATE notify_links SET tg_chat = '', tg_name = '' WHERE admin_id = ?").bind(x).run();
      for (const x of pushOff) await env.DB.prepare('DELETE FROM push_subs WHERE admin_id = ?').bind(x).run();
      await log(env, 'settings', `${who}: avvisi dello store — Telegram a ${(raw.tgAgents || []).length} agenti, notifiche a ${(raw.pushAgents || []).length} agenti`, ip);
      return json({ ok: true });
    }
    if (path === '/notify/tg/setup' && m === 'POST') {
      if (me.agent) throw new NErr(403, 'Solo il titolare può collegare il bot');
      const bot = await tgSetup(env, origin);
      await log(env, 'settings', `${who}: bot Telegram @${bot} collegato al pannello`, ip);
      return json({ ok: true, bot });
    }
    if (path === '/notify/tg/link' && m === 'POST') {
      if (!canTg) throw new NErr(403, 'Il titolare non ti ha ancora consentito gli avvisi su Telegram');
      if (!tgReady(env)) throw new NErr(400, me.agent ? 'Telegram non è ancora attivo: chiedi al titolare' : 'Manca il segreto TELEGRAM_BOT_TOKEN (vedi la guida nel README)');
      let bot = cfg.bot;
      if (!bot || cfg.hook !== origin + '/api/tg/hook') {
        if (me.agent && !bot) throw new NErr(400, 'Il titolare deve prima collegare il bot dal pannello');
        if (!me.agent) bot = await tgSetup(env, origin);
      }
      const code = b64url(rand(18));
      await env.DB.prepare('DELETE FROM tg_codes WHERE admin_id = ? OR created < ?').bind(me.id, now() - 15 * 60e3).run();
      await env.DB.prepare('INSERT INTO tg_codes (code, admin_id, created) VALUES (?, ?, ?)').bind(code, me.id, now()).run();
      return json({ url: `https://t.me/${bot}?start=${code}`, bot });
    }
    if (path === '/notify/tg/unlink' && m === 'POST') {
      await env.DB.prepare("UPDATE notify_links SET tg_chat = '', tg_name = '' WHERE admin_id = ?").bind(me.id).run();
      await log(env, 'settings', `${who}: Telegram scollegato dal pannello`, ip);
      return json({ ok: true });
    }
    if (path === '/notify/tg/test' && m === 'POST') {
      const link = await env.DB.prepare('SELECT tg_chat FROM notify_links WHERE admin_id = ?').bind(me.id).first();
      if (!link || !link.tg_chat) throw new NErr(400, 'Prima collega Telegram');
      try { await tg(env, 'sendMessage', { chat_id: link.tg_chat, text: '🔔 <b>Prova riuscita</b>\nQui arriveranno gli avvisi dei download dallo Store.', parse_mode: 'HTML' }); }
      catch (e) { throw new NErr(502, 'Messaggio non inviato: ' + e.message); }
      return json({ ok: true });
    }
    if (path === '/notify/push' && m === 'POST') {
      if (!canPush) throw new NErr(403, 'Il titolare non ti ha ancora consentito le notifiche');
      const b = await readBody(req, 4096), s = b.sub || {};
      const endpoint = str(s.endpoint, 800);
      if (!pushEndpointOk(endpoint)) throw new NErr(400, 'Questo browser non è supportato per le notifiche');
      const id = b64url(await crypto.subtle.digest('SHA-256', enc.encode(endpoint)));
      const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM push_subs WHERE admin_id = ?').bind(me.id).first();
      if (n && n.n >= 10) await env.DB.prepare('DELETE FROM push_subs WHERE id IN (SELECT id FROM push_subs WHERE admin_id = ? ORDER BY created ASC LIMIT 1)').bind(me.id).run();
      await env.DB.prepare('INSERT INTO push_subs (id, admin_id, endpoint, ua, created, last_ok) VALUES (?, ?, ?, ?, ?, 0) ON CONFLICT(id) DO UPDATE SET admin_id = excluded.admin_id, ua = excluded.ua')
        .bind(id, me.id, endpoint, str(b.ua || req.headers.get('User-Agent') || '', 120), now()).run();
      await log(env, 'settings', `${who}: notifiche attivate su un dispositivo`, ip);
      return json({ ok: true });
    }
    if (path === '/notify/push' && m === 'DELETE') {
      const b = await readBody(req, 4096), endpoint = str(b.endpoint, 800);
      if (endpoint) {
        const id = b64url(await crypto.subtle.digest('SHA-256', enc.encode(endpoint)));
        await env.DB.prepare('DELETE FROM push_subs WHERE id = ? AND admin_id = ?').bind(id, me.id).run();
      } else await env.DB.prepare('DELETE FROM push_subs WHERE admin_id = ?').bind(me.id).run();
      return json({ ok: true });
    }
    if (path === '/notify/push/test' && m === 'POST') {
      const rows = ((await env.DB.prepare('SELECT id, endpoint FROM push_subs WHERE admin_id = ?').bind(me.id).all()).results) || [];
      if (!rows.length) throw new NErr(400, 'Prima attiva le notifiche su questo dispositivo');
      await env.DB.prepare('INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind('push_test:' + me.id, String(now())).run();
      const ok = (await Promise.all(rows.map((row) => pushOne(env, row, origin)))).filter(Boolean).length;
      if (!ok) throw new NErr(502, 'Notifica non consegnata: riattiva le notifiche su questo dispositivo');
      return json({ ok: true, sent: ok });
    }
    // il service worker chiede cosa mostrare (la notifica arriva senza contenuto)
    if (path === '/notify/peek' && m === 'GET') {
      const t = await env.DB.prepare('SELECT v FROM settings WHERE k = ?').bind('push_test:' + me.id).first();
      if (t && now() - +t.v < 120e3) { await env.DB.prepare('DELETE FROM settings WHERE k = ?').bind('push_test:' + me.id).run(); return json({ test: true }); }
      // ultimo download da avvisare (vale 10 minuti)
      const dl = await env.DB.prepare('SELECT v FROM settings WHERE k = ?').bind('push_dl:' + me.id).first();
      let d = null; try { d = dl && JSON.parse(dl.v); } catch {}
      if (d && now() - +d.t < 600e3) return json({ test: false, dl: { app: d.app, device: d.device, country: d.country, code: d.code, t: d.t } });
      return json({ test: false });
    }
    return json({ error: 'Endpoint sconosciuto' }, 404);
  } catch (e) {
    if (e instanceof NErr) return json({ error: e.message }, e.status);
    throw e;
  }
}

export const _notifyInternal = { pushEndpointOk, vapid, vapidAuth, hookSecret, tgText, safe, recipients, unb64url };
