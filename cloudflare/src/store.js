/*  KAIROS — Store APERTO (come IBO Player)
 *
 *  Il cliente installa lo store e scarica subito le app che vuole: niente codice del venditore all'avvio,
 *  niente attivazione dello store, niente «Richiedi autorizzazione», nessun blocco dopo codici sbagliati.
 *  L'attivazione delle app Kairos resta quella di sempre: l'app mostra il codice sulla TV e il titolare
 *  (o l'agente) lo attiva dal pannello. Il server serve solo a CONTARE: store installati/aperti e download.
 *
 *  API pubbliche (pagina dello store su GitHub Pages o dentro l'app → CORS aperto):
 *    GET  /api/store/config?did=                       → { open:true, on:false, activation:false, gate:'none', activated:false,
 *                                                          suspended:false, blocked:false, closed:false, recommend }
 *    POST /api/store/hello    {did, device, v}         → { ok }   (store aperto: lo conta tra gli store installati)
 *    POST /api/store/download {did, app, url, device}  → { ok }   (download partito: lo conta)
 *
 *  Compatibilità con gli store GIÀ INSTALLATI (pagine e APK vecchi che chiedevano codice o autorizzazione):
 *    POST /api/store/request  {app, appUrl, device, did}  → { id, status:'approved', token, auto:true }   sempre e subito
 *    GET  /api/store/status?id=&did=                    → una richiesta rimasta «in attesa» viene approvata all'istante
 *    POST /api/store/verify   {id, did, code}           → qualunque codice va bene
 *    POST /api/store/consume  {id, did, token, url}     → { ok, app, appUrl }   (l'APK vecchio lo chiede prima di scaricare; conta il download)
 *    POST /api/store/activate {did, seller}             → { ok:true } con qualunque codice, senza blocchi
 *    GET  /api/store/seller?c=                          → { ok:true }
 *    GET  /api/store/approve|deny, POST /api/store/decide → pagine dei link delle vecchie email (restano valide)
 *
 *  API del pannello (chiamate da admin() in worker.js dopo sessione + CSRF):
 *    GET    /api/admin/store/summary            → riepilogo per il titolare: store installati, aperture, download, per app
 *    GET    /api/admin/store                    → storico dei download (forma di prima, per compatibilità)
 *    PUT    /api/admin/store/settings           { recommend }   (regole dell'«App consigliata»)
 *    DELETE /api/admin/store                    (svuota lo storico)
 *  Le altre funzioni di prima (approva/rifiuta/revoca, blocca/scollega dispositivo, SMS di prova) restano come
 *  endpoint ma non servono più: il pannello non le mostra.
 */

const REQ_TTL = 24 * 3600e3;     // una richiesta resta in attesa 24 ore
const TOKEN_TTL = 30 * 60e3;     // dopo l'ok il download deve partire entro 30 minuti
const MAX_TRIES = 5;             // codici errati prima di annullare la richiesta
const MAX_USES = 1;              // un'autorizzazione = un solo download (per reinstallare se ne chiede un'altra)
const MAIL_PER_DAY = 90;         // il piano gratuito di Resend ne consente 100 al giorno
const KEEP = 30 * 86400e3;       // storico conservato 30 giorni
const ID_RE = /^[A-Za-z0-9_-]{12,40}$/;
const DID_RE = /^[A-Za-z0-9_-]{16,64}$/;
const MAX_BLOCKED = 500;         // dispositivi bloccati ricordati nelle impostazioni
const PHONE_RE = /^\+[1-9]\d{7,14}$/;
const SMS_DEF_DAY = 50;          // SMS al giorno se il titolare non sceglie un altro tetto
const SMS_MAX_DAY = 500;
const MAIL_RE = /^[^\s@<>"',;:()[\]\\]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,}$/;
const STORE_MAX_DEF = 50;        // (vecchio) store attivabili per agente: non si usa più, resta nelle impostazioni salvate
const STORE_MAX_CAP = 100000;
const OPEN_GAP = 10 * 60e3;      // due aperture dello stesso store a meno di 10 minuti = una sola apertura
const DL_DUP = 60e3;             // stessa app dallo stesso store entro un minuto = un solo download (doppio tocco)

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

/* ---------------- (vecchio) store chiuso in una fascia oraria: con lo store aperto non blocca più nulla ---------------- */
const HM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
function closedNorm(c) {
  c = c && typeof c === 'object' ? c : {};
  return { on: c.on === true, from: HM_RE.test(c.from || '') ? c.from : '23:00', to: HM_RE.test(c.to || '') ? c.to : '07:00', msg: str(c.msg || '', 200) };
}
const romeHM = (t = Date.now()) => new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(t));
/** true se adesso lo store è chiuso (la fascia può passare la mezzanotte) */
export function storeClosedNow(c, t = Date.now()) {
  if (!c || !c.on || c.from === c.to) return false;
  const m = (x) => +x.slice(0, 2) * 60 + +x.slice(3, 5), n = m(romeHM(t)), a = m(c.from), b = m(c.to);
  return a < b ? n >= a && n < b : n >= a || n < b;
}

/* ---------------- impostazioni (tabella settings, chiave "store") ---------------- */
// «App consigliata»: regole con cui lo Store sceglie l'app adatta al dispositivo del cliente (memoria, modello, versione Android)
const REC_DEF = { weakApp: 'Kairos-XC', weakMb: 1536, oldApp: 'Kairos-Lite', oldSdk: 7, strongApp: 'Kairos Pro', text: 'Per questo dispositivo è consigliata {app}: stesso abbonamento e stesse liste, con la migliore fluidità su questo apparecchio.' };
/* memoria richiesta da ogni app (MB, 11 novembre 2026): nello Store le app Kairos si mostrano dalla più leggera, con ✓ se il
   dispositivo ha abbastanza memoria. A parità di memoria vale quest'ordine (Kairos Tv subito dopo XC, come deciso dal titolare) */
const MEM_DEF = { 'Kairos-XC': 512, 'Kairos Tv': 1024, 'Kairos-Lite': 1024, 'Kairos Premium': 1536, 'Kairos Plus': 1536, 'Kairos Pro': 2048 };
function memNorm(m) {
  const src = m && typeof m === 'object' && !Array.isArray(m) ? m : MEM_DEF, out = {};
  for (const [k, v] of Object.entries(src).slice(0, 16)) {
    const name = String(k).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 40), n = parseInt(v, 10);
    if (name && n >= 128 && n <= 16384) out[name] = n;
  }
  return Object.keys(out).length ? out : { ...MEM_DEF };
}
function recNorm(r) {
  r = r && typeof r === 'object' ? r : {};
  const s = (k, max = 60) => (typeof r[k] === 'string' && r[k].trim() ? r[k].trim().slice(0, max) : REC_DEF[k]);
  const n = (k, lo, hi) => { const v = parseInt(r[k], 10); return v >= lo && v <= hi ? v : REC_DEF[k]; };
  // rv 2 (11 novembre 2026): sulle chiavette deboli Kairos-XC al posto di Kairos Tv, la scelta di prima salvata si aggiorna;
  // da qui in poi vale quella che il titolare salva (anche Kairos Tv, se la rimette)
  const weak = +r.rv >= 2 ? s('weakApp') : s('weakApp') === 'Kairos Tv' ? 'Kairos-XC' : s('weakApp');
  return { rv: 2, weakApp: weak, weakMb: n('weakMb', 256, 8192), oldApp: s('oldApp'), oldSdk: n('oldSdk', 5, 14), strongApp: s('strongApp'), text: s('text', 300), mem: memNorm(r.mem) };
}
/* ---------------- codici usa e getta (11 novembre 2026) ----------------
   «Download solo con codice» (Riepilogo store): il cliente scrive nello Store un codice di 6 cifre generato dal titolare o da
   un agente con il permesso «Codici per lo Store». Va scritto entro la durata scelta (30 minuti, 2 ore o 24 ore); al primo
   uso si lega a quel Kairos Store, che per la stessa durata scarica tutte le app che vuole. Spento = store aperto come prima.
   Il codice protegge lo Store, non i file: gli APK restano raggiungibili dai link diretti (servono agli aggiornamenti). */
const CODE_TTLS = [10, 15, 20, 30, 120, 1440]; // minuti che il titolare può scegliere (10, 15 e 20 dal 12 novembre 2026)
const CODE_FAIL_DEV = 5, CODE_FAIL_IP = 20;    // codici sbagliati prima della pausa (dispositivo / indirizzo)
const CODE_PAUSE = 3600e3;                    // pausa dopo troppi codici sbagliati
const CODE_PER_HOUR = 60;                     // codici che una persona può generare in un'ora
function codesNorm(c) {
  c = c && typeof c === 'object' ? c : {};
  const ttl = CODE_TTLS.includes(+c.ttl) ? +c.ttl : 30;
  return { on: c.on === true, ttl };
}
async function getStoreSettings(env) {
  const row = await env.DB.prepare('SELECT v FROM settings WHERE k = ?').bind('store').first();
  let s = {}; try { s = row ? JSON.parse(row.v) : {}; } catch {}
  const blocked = Array.isArray(s.blocked) ? s.blocked.filter((d) => typeof d === 'string' && DID_RE.test(d)).slice(0, MAX_BLOCKED) : [];
  // dispositivi «senza limiti»: eccezione del titolare (installatori, negozi): niente tetto orario né tempo di attesa
  const trusted = Array.isArray(s.trusted) ? s.trusted.filter((d) => typeof d === 'string' && DID_RE.test(d)).slice(0, MAX_BLOCKED) : [];
  // agentAlerts: se vero il titolare riceve gli avvisi anche per le richieste con il codice di un agente (di serie le gestisce solo l'agente)
  // activation: «solo store attivati»: si scarica solo da store intestati a un venditore (codice scritto una volta), senza conferma
  const storeMax = Number.isInteger(s.storeMax) && s.storeMax >= 0 && s.storeMax <= STORE_MAX_CAP ? s.storeMax : STORE_MAX_DEF;
  // storeGate: codice del venditore all'avvio dello store — 'every' (a ogni avvio, di serie) oppure 'once' (solo finché lo store non è intestato)
  return { codes: codesNorm(s.codes), recommend: recNorm(s.recommend), approval: s.approval !== false, ownerEmail: typeof s.ownerEmail === 'string' ? s.ownerEmail : '', blocked, trusted, sms: smsNorm(s.sms), closed: closedNorm(s.closed), agentAlerts: s.agentAlerts === true, activation: s.activation === true, storeMax, storeGate: s.storeGate === 'once' ? 'once' : 'every' };
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
const VIA = { email: "dall'email", panel: 'dal pannello', code: 'con il codice', auto: 'automatica', store: 'store attivato', tries: 'troppi codici errati', telegram: 'da Telegram', push: 'dalla notifica' };

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

/* ---------------- store aperto: conteggio degli store installati e dei download ---------------- */
/** paese e città della richiesta (Cloudflare), come nello storico di prima */
const whereOf = (req) => { const cf = (req && req.cf) || {}; return [str(cf.country, 4), str(cf.city, 40)].filter(Boolean).join(' · '); };
/** store aperto: entra tra gli store installati; due aperture a meno di 10 minuti contano una volta sola (poche scritture) */
async function seenOpen(env, did, device, country, version, t = now()) {
  if (!DID_RE.test(did)) return;
  await env.DB.prepare(`INSERT INTO store_seen (did, device, country, version, first_seen, last_seen, opens, downloads) VALUES (?, ?, ?, ?, ?, ?, 1, 0)
    ON CONFLICT(did) DO UPDATE SET device = CASE WHEN excluded.device <> '' THEN excluded.device ELSE store_seen.device END,
      country = CASE WHEN excluded.country <> '' THEN excluded.country ELSE store_seen.country END,
      version = CASE WHEN excluded.version <> '' THEN excluded.version ELSE store_seen.version END,
      opens = store_seen.opens + 1, last_seen = excluded.last_seen
    WHERE excluded.last_seen - store_seen.last_seen > ?`).bind(did, device, country, version, t, t, OPEN_GAP).run().catch(() => {});
}
/** download partito da quello store */
async function seenDownload(env, did, device, country, t = now()) {
  if (!DID_RE.test(did)) return;
  await env.DB.prepare(`INSERT INTO store_seen (did, device, country, version, first_seen, last_seen, opens, downloads) VALUES (?, ?, ?, '', ?, ?, 0, 1)
    ON CONFLICT(did) DO UPDATE SET device = CASE WHEN excluded.device <> '' THEN excluded.device ELSE store_seen.device END,
      country = CASE WHEN excluded.country <> '' THEN excluded.country ELSE store_seen.country END,
      downloads = store_seen.downloads + 1, last_seen = excluded.last_seen`).bind(did, device, country, t, t).run().catch(() => {});
}
/** risposta di /config: lo store è sempre aperto (anche per le pagine vecchie, che così non mostrano più codice né blocchi) */
const openCfg = (S) => ({ open: true, recommend: S.recommend, on: false, activation: false, gate: 'none', activated: false, suspended: false, blocked: false, closed: false, codes: S.codes.on });
/** una richiesta di download già approvata (per le pagine vecchie dello store): il token vale come prima 30 minuti, un download */
async function approveNow(env, r, ip) {
  const token = b64url(rand(24)), t = now();
  const u = await env.DB.prepare("UPDATE store_requests SET status = 'approved', token = ?, decided = ?, via = 'open' WHERE id = ? AND status = 'pending'").bind(token, t, r.id).run();
  if (!changed(u)) return null;
  Object.assign(r, { status: 'approved', token, decided: t, via: 'open' });
  return token;
}

/** (vecchio) venditore a cui era intestato uno store attivato con un codice; null se non attivato. Resta per worker.js */
export async function storeDeviceSeller(env, did) {
  if (!DID_RE.test(str(did, 64))) return null;
  const d = await env.DB.prepare('SELECT seller, active FROM store_devices WHERE did = ?').bind(str(did, 64)).first();
  return d && d.active ? +d.seller || 0 : null;
}

/** il titolare vuole gli avvisi anche per le richieste con il codice di un agente? (per Telegram/notifiche in notify.js) */
export async function storeAgentAlerts(env) { try { return (await getStoreSettings(env)).agentAlerts; } catch { return false; } }

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

/* ====================================================================== */
/* API pubbliche                                                          */
/* ====================================================================== */
export async function storeApi(req, env, ctx, url, ip, opts = {}) {
  const p = url.pathname.slice('/api/store'.length), m = req.method;
  try {
    if (m === 'OPTIONS') return new Response(null, { status: 204 });
    if (p === '/config' && m === 'GET') {
      if (await limited(env.RL_DEVICE, 'scfg:' + ip)) return json({ error: 'Troppe richieste' }, 429);
      const S = await getStoreSettings(env);
      // con ?did= (pagine vecchie dello store) lo store si conta tra quelli installati
      const did = str(url.searchParams.get('did'), 64);
      if (DID_RE.test(did)) ctx.waitUntil(seenOpen(env, did, '', whereOf(req), ''));
      const out = openCfg(S);
      if (S.codes.on && DID_RE.test(did)) out.codeUntil = await codeWindow(env, did);
      return json(out);
    }
    if (p === '/hello' && m === 'POST') {
      // la pagina nuova dello store, a ogni apertura: solo per contare gli store installati
      if (await limited(env.RL_DEVICE, 'shel:' + ip)) return json({ ok: false, error: 'Troppe richieste' }, 429);
      const b = await readBody(req);
      const did = str(b.did, 64);
      if (!DID_RE.test(did)) return json({ ok: false, error: 'Dispositivo non valido' }, 400);
      ctx.waitUntil(seenOpen(env, did, str(b.device, 80), whereOf(req), str(b.v, 20)));
      // «Download solo con codice»: lo Store mostra «🔑 Serve il codice» e sa se il codice di prima vale ancora
      const S = await getStoreSettings(env);
      return json(S.codes.on ? { ok: true, codes: true, codeUntil: await codeWindow(env, did) } : { ok: true, codes: false });
    }
    if (p === '/download' && m === 'POST') return await download(req, env, ctx, ip);
    if (p === '/code' && m === 'POST') return await useCode(req, env, ctx, ip);
    if (p === '/activate' && m === 'POST') {
      // store vecchio che mostra ancora «Attiva lo store»: passa con qualunque codice (anche vuoto), senza blocchi
      if (await limited(env.RL_DEVICE, 'sact:' + ip)) return json({ error: 'Troppe richieste, riprova tra poco' }, 429);
      const b = await readBody(req);
      const did = str(b.did, 64);
      if (DID_RE.test(did)) ctx.waitUntil(seenOpen(env, did, str(b.device, 80), whereOf(req), ''));
      const name = typeof opts.sellerName === 'function' ? await opts.sellerName(0) : '';
      return json({ ok: true, open: true, seller: name || 'Kairos', since: now() });
    }
    if (p === '/seller' && m === 'GET') {
      // store vecchio: qualunque codice va bene (non serve più); non si rivela nessun nome di venditore
      if (await limited(env.RL_DEVICE, 'ssel:' + ip)) return json({ error: 'Troppe richieste' }, 429);
      const name = typeof opts.sellerName === 'function' ? await opts.sellerName(0) : '';
      return json({ ok: true, open: true, name: name || 'Kairos' });
    }
    if (p === '/request' && m === 'POST') return await create(req, env, ctx, url, ip);
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

/** POST /api/store/download: la pagina nuova dello store lo manda quando parte un download (solo per contarlo) */
async function download(req, env, ctx, ip) {
  if (await limited(env.RL_DEVICE, 'sdl:' + ip)) return json({ ok: false, error: 'Troppe richieste, riprova tra poco' }, 429);
  const b = await readBody(req);
  const app = str(b.app, 80), did = str(b.did, 64), device = str(b.device, 80);
  let appUrl = str(b.url, 1000); if (appUrl && !/^(https?|amzn|market):\/\/[^\s]+$/i.test(appUrl)) appUrl = '';
  if (!app) return json({ ok: false, error: 'App mancante' }, 400);
  if (!DID_RE.test(did)) return json({ ok: false, error: 'Dispositivo non valido' }, 400);
  const t = now(), country = whereOf(req);
  // «Download solo con codice»: serve un codice già scritto su questo store e ancora valido
  const S = await getStoreSettings(env);
  let cr = null;
  if (S.codes.on) {
    cr = await env.DB.prepare('SELECT id, by_id, by_name, apps FROM store_codes WHERE did = ? AND until > ? ORDER BY until DESC LIMIT 1').bind(did, t).first();
    if (!cr) return json({ ok: false, need: 'code', error: 'Per scaricare serve il codice del tuo rivenditore' }, 403);
  }
  // doppio tocco sullo stesso pulsante: un solo download
  const dup = await env.DB.prepare('SELECT id FROM store_requests WHERE did = ? AND app = ? AND uses > 0 AND created > ? LIMIT 1').bind(did, app, t - DL_DUP).first();
  if (dup) return json({ ok: true, dup: true, codes: S.codes.on });
  await env.DB.prepare("INSERT INTO store_requests (id, app, app_url, did, device, note, ip, country, code, status, token, via, created, decided, seller, uses, used) VALUES (?, ?, ?, ?, ?, '', ?, ?, '', 'approved', '', ?, ?, ?, ?, 1, ?)")
    .bind(b64url(rand(12)), app, appUrl, did, device, ip, country, cr ? 'code' : 'open', t, t, cr ? +cr.by_id || 0 : 0, t).run();
  let apps = []; try { apps = JSON.parse((cr && cr.apps) || '[]'); } catch {}
  if (cr && !apps.includes(app)) apps.push(app);
  ctx.waitUntil(Promise.all([
    b.src === 'web' ? null : seenDownload(env, did, device, country, t), // dal browser: download sì, store installato no
    cr ? env.DB.prepare('UPDATE store_codes SET apps = ?, dls = dls + 1 WHERE id = ?').bind(JSON.stringify(apps.slice(0, 30)), cr.id).run().catch(() => {}) : null,
    log(env, 'edit', `Store: download · ${app} su ${device || 'dispositivo'}${country ? ' · ' + country : ''}${cr ? ' · ' + codeOf(cr) : ''}`, ip),
    env.DB.prepare('DELETE FROM store_requests WHERE created < ?').bind(t - KEEP).run().catch(() => {}),
  ]));
  return json({ ok: true, codes: S.codes.on });
}

const ttlTxt = (min) => (min >= 1440 ? '24 ore' : min >= 120 ? '2 ore' : min + ' minuti');
const codeOf = (r) => (+r.by_id ? 'codice di ' + (r.by_name || 'un agente') : 'codice del titolare');
/** fine della finestra di download aperta con un codice su questo store (0 = nessuna) */
async function codeWindow(env, did) {
  const r = await env.DB.prepare('SELECT MAX(until) AS u FROM store_codes WHERE did = ? AND until > ?').bind(did, now()).first().catch(() => null);
  return (r && +r.u) || 0;
}
/** troppi codici sbagliati da questo store o da questo indirizzo nell'ultima ora */
async function codePaused(env, did, ip, t) {
  const R = (await env.DB.prepare('SELECT k, n, t FROM store_code_fail WHERE k IN (?, ?)').bind('d:' + did, 'i:' + ip).all().catch(() => null));
  for (const r of (R && R.results) || []) if (t - r.t < CODE_PAUSE && r.n >= (r.k.startsWith('d:') ? CODE_FAIL_DEV : CODE_FAIL_IP)) return true;
  return false;
}
async function codeFail(env, did, ip, t) {
  const up = 'INSERT INTO store_code_fail (k, n, t) VALUES (?, 1, ?) ON CONFLICT(k) DO UPDATE SET n = CASE WHEN ? - store_code_fail.t > ? THEN 1 ELSE store_code_fail.n + 1 END, t = excluded.t';
  await env.DB.batch([env.DB.prepare(up).bind('d:' + did, t, t, CODE_PAUSE), env.DB.prepare(up).bind('i:' + ip, t, t, CODE_PAUSE)]).catch(() => {});
}

/**
 * POST /api/store/code {did, code, device}: il cliente scrive il codice nello Store. Valido = generato da meno della durata
 * e mai usato, oppure già legato a questo stesso store con la finestra ancora aperta. Al primo uso si lega allo store.
 * Risposta { ok, until } (fine della finestra in cui questo store scarica tutte le app che vuole).
 */
async function useCode(req, env, ctx, ip) {
  if (await limited(env.RL_DEVICE, 'scod:' + ip)) return json({ ok: false, error: 'Troppe richieste, riprova tra poco' }, 429);
  const b = await readBody(req);
  const did = str(b.did, 64), device = str(b.device, 80), code = String(b.code ?? '').replace(/\D/g, '');
  if (!DID_RE.test(did)) return json({ ok: false, error: 'Dispositivo non valido' }, 400);
  const t = now();
  if (await codePaused(env, did, ip, t)) return json({ ok: false, error: 'Troppi codici sbagliati: riprova tra un\'ora' }, 429);
  const bad = async () => { await codeFail(env, did, ip, t); return json({ ok: false, error: 'Codice non valido o scaduto: chiedine uno nuovo al tuo rivenditore' }, 403); };
  if (!/^\d{6}$/.test(code)) return bad();
  let r = await env.DB.prepare('SELECT * FROM store_codes WHERE code = ? AND ((used = 0 AND expires > ?) OR (did = ? AND until > ?)) ORDER BY id DESC LIMIT 1').bind(code, t, did, t).first();
  if (!r) return bad();
  if (!r.used) {
    const until = t + (+r.ttl || 30 * 60e3), country = whereOf(req);
    const u = await env.DB.prepare('UPDATE store_codes SET used = ?, did = ?, device = ?, country = ?, ip = ?, until = ? WHERE id = ? AND used = 0').bind(t, did, device, country, ip, until, r.id).run();
    if (!changed(u)) { // usato un attimo prima da un altro store
      r = await env.DB.prepare('SELECT * FROM store_codes WHERE id = ?').bind(r.id).first();
      if (!r || r.did !== did || !(r.until > t)) return bad();
    } else {
      r.until = until;
      ctx.waitUntil(log(env, 'on', `Store: ${codeOf(r)} usato su ${device || 'dispositivo'}${country ? ' · ' + country : ''} (vale ${ttlTxt(Math.round((+r.ttl || 0) / 60e3))})`, ip));
    }
  }
  ctx.waitUntil(env.DB.prepare('DELETE FROM store_code_fail WHERE k = ?').bind('d:' + did).run().catch(() => {}));
  return json({ ok: true, until: +r.until });
}

/** «Download solo con codice» acceso? (per lo stato del pannello: pulsante «🔑 Codice Store») */
export async function storeCodesOn(env) {
  try { return (await getStoreSettings(env)).codes.on; } catch { return false; }
}

/**
 * Codici del pannello: GET = elenco (il titolare tutti, l'agente i suoi) con interruttore e durata; POST = codice nuovo.
 * [by] = { id: 0 per il titolare o l'id dell'agente, name } (l'agente arriva qui solo con il permesso «Codici per lo Store»).
 */
export async function storeCodes(req, env, m, by, ip) {
  try {
    const S = await getStoreSettings(env), t = now();
    if (m === 'POST') {
      const last = await env.DB.prepare('SELECT COUNT(*) AS n FROM store_codes WHERE by_id = ? AND created > ?').bind(by.id, t - 3600e3).first();
      if (last && last.n >= CODE_PER_HOUR) throw new StoreErr(429, `Hai già generato ${CODE_PER_HOUR} codici nell'ultima ora: riprova più tardi`);
      const ttl = S.codes.ttl * 60e3;
      let code = '';
      for (let i = 0; i < 12 && !code; i++) {
        const c = sixDigits();
        const busy = await env.DB.prepare('SELECT 1 AS x FROM store_codes WHERE code = ? AND ((used = 0 AND expires > ?) OR until > ?) LIMIT 1').bind(c, t, t).first();
        if (!busy) code = c;
      }
      if (!code) throw new StoreErr(503, 'Codice non generato, riprova');
      await env.DB.prepare('INSERT INTO store_codes (code, created, expires, ttl, by_id, by_name) VALUES (?, ?, ?, ?, ?, ?)').bind(code, t, t + ttl, ttl, by.id, str(by.name, 60)).run();
      await env.DB.prepare('DELETE FROM store_codes WHERE created < ? AND until < ?').bind(t - KEEP, t).run().catch(() => {});
      await log(env, 'edit', `${by.log || by.name || 'Titolare'}: Store — codice per scaricare generato (vale ${ttlTxt(S.codes.ttl)})`, ip);
      return json({ code, created: t, expires: t + ttl, ttl: S.codes.ttl, on: S.codes.on });
    }
    if (m !== 'GET') throw new StoreErr(405, 'Metodo non consentito');
    const q = by.id
      ? env.DB.prepare('SELECT * FROM store_codes WHERE by_id = ? AND created > ? ORDER BY id DESC LIMIT 100').bind(by.id, t - KEEP)
      : env.DB.prepare('SELECT * FROM store_codes WHERE created > ? ORDER BY id DESC LIMIT 300').bind(t - KEEP);
    const rows = ((await q.all()).results) || [];
    const codes = rows.map((r) => {
      let apps = []; try { apps = JSON.parse(r.apps || '[]'); } catch {}
      const st = r.used ? (r.until > t ? 'open' : 'used') : r.expires > t ? 'valid' : 'expired';
      return { id: r.id, code: st === 'valid' || st === 'open' ? r.code : '', st, created: r.created, expires: r.expires, used: r.used, until: r.until, by: by.id ? '' : r.by_id ? r.by_name || 'agente' : '', mine: !by.id && !r.by_id, device: r.device, country: r.country, apps, dls: r.dls };
    });
    return json({ on: S.codes.on, ttl: S.codes.ttl, ttls: CODE_TTLS, codes });
  } catch (e) {
    if (e instanceof StoreErr) return json({ error: e.message }, e.status);
    throw e;
  }
}

/** POST /api/store/request (store vecchi): approvata subito, senza codice né venditore. Il download si conta poi in /consume */
async function create(req, env, ctx, url, ip) {
  if (await limited(env.RL_DEVICE, 'sreq:' + ip)) return json({ error: 'Troppe richieste, riprova tra poco' }, 429);
  const b = await readBody(req);
  const app = str(b.app, 80), did = str(b.did, 64), device = str(b.device, 80);
  const appUrl = str(b.appUrl, 1000);
  if (!app) return json({ error: 'App mancante' }, 400);
  if (!DID_RE.test(did)) return json({ error: 'Dispositivo non valido' }, 400);
  if (appUrl && !/^https?:\/\/[^\s]+$/i.test(appUrl)) return json({ error: 'Link non valido' }, 400);
  // «Download solo con codice»: anche gli store vecchi passano solo con un codice già scritto (le loro pagine non lo chiedono,
  // ma si aggiornano da sole alla versione che lo chiede)
  if ((await getStoreSettings(env)).codes.on && !(await codeWindow(env, did))) return json({ status: 'denied', need: 'code', error: 'Per scaricare serve il codice del tuo rivenditore: premi AGGIORNA in alto e riprova' }, 403);
  const t = now(), country = whereOf(req), id = b64url(rand(12)), token = b64url(rand(24));
  await env.DB.prepare("INSERT INTO store_requests (id, app, app_url, did, device, note, ip, country, code, status, token, via, created, decided, seller) VALUES (?, ?, ?, ?, ?, '', ?, ?, '', 'approved', ?, 'open', ?, ?, 0)")
    .bind(id, app, appUrl, did, device, ip, country, token, t, t).run();
  ctx.waitUntil(Promise.all([
    seenOpen(env, did, device, country, ''),
    env.DB.prepare('DELETE FROM store_requests WHERE created < ?').bind(t - KEEP).run().catch(() => {}),
  ]));
  return json({ id, status: 'approved', token, auto: true, open: true });
}

async function status(url, env, ip) {
  if (await limited(env.RL_DEVICE, 'sst:' + ip)) return json({ error: 'Troppe richieste' }, 429);
  const r = await findOwn(env, str(url.searchParams.get('id'), 40), str(url.searchParams.get('did'), 64));
  if (!r) return json({ status: 'unknown', error: 'Richiesta non trovata' }, 404);
  // richiesta rimasta «in attesa» da prima che lo store diventasse aperto: approvata adesso, il download parte da solo
  if (effStatus(r) === 'pending') await approveNow(env, r, ip);
  const st = effStatus(r);
  const out = { status: st, app: r.app };
  if (st === 'approved') out.token = r.token;
  return json(out);
}

async function verify(req, env, ip) {
  if (await limited(env.RL_DEVICE, 'sver:' + ip)) return json({ ok: false, error: 'Troppi tentativi, attendi un minuto' }, 429);
  const b = await readBody(req);
  const r = await findOwn(env, str(b.id, 40), str(b.did, 64));
  if (!r) return json({ ok: false, status: 'unknown', error: 'Richiesta non trovata' }, 404);
  // store aperto: qualunque codice va bene
  if (effStatus(r) === 'pending') await approveNow(env, r, ip);
  const st = effStatus(r);
  if (st === 'approved') return json({ ok: true, status: st, token: r.token });
  return json({ ok: false, status: st, error: (ENDED[st] || ENDED.expired) + ': premi di nuovo Installa' });
}

async function consume(req, env, ctx, ip) {
  if (await limited(env.RL_DEVICE, 'scon:' + ip)) return json({ ok: false, error: 'Troppe richieste, riprova tra poco' }, 429);
  const b = await readBody(req);
  const r = await findOwn(env, str(b.id, 40), str(b.did, 64));
  const bad = (e, status) => json(status ? { ok: false, status, error: e } : { ok: false, error: e }, 403);
  if (!r) return bad('Download non riuscito: premi di nuovo Installa.');
  if (effStatus(r) === 'pending') await approveNow(env, r, ip);
  const st = effStatus(r);
  if (st === 'used') return bad('Download già partito: premi di nuovo Installa.', 'used');
  if (r.status !== 'approved' || !r.token || !safeEq(str(b.token, 100), r.token)) return bad('Download non riuscito: premi di nuovo Installa.');
  if (st !== 'approved') return bad('Tempo scaduto: premi di nuovo Installa.', 'expired');
  const link = str(b.url, 1000);
  if (!r.app_url || link !== r.app_url) return bad('Link dell\'app cambiato: premi di nuovo Installa.');
  // un download per richiesta: la riga passa a "used" (per installare di nuovo lo store vecchio ne chiede un'altra, approvata subito)
  const u = await env.DB.prepare("UPDATE store_requests SET uses = uses + 1, used = ? WHERE id = ? AND status = 'approved' AND uses < ?").bind(now(), r.id, MAX_USES).run();
  if (!changed(u)) return bad('Download già partito: premi di nuovo Installa.', 'used');
  ctx.waitUntil(Promise.all([log(env, 'edit', `Store: download · ${r.app} su ${r.device || 'dispositivo'}${r.country ? ' · ' + r.country : ''}`, ip),
    seenDownload(env, r.did, r.device || '', r.country || ''),
    env.DB.prepare('UPDATE store_devices SET downloads = downloads + 1, last = ? WHERE did = ? AND active = 1').bind(now(), r.did).run().catch(() => {})]));
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
// data della richiesta nelle pagine dei link (era sparita con le email: le pagine davano «Errore interno»)
const fmtTime = (t) => { try { return new Date(t).toLocaleString('it-IT', { timeZone: 'Europe/Rome', dateStyle: 'short', timeStyle: 'short' }); } catch { return new Date(t).toISOString(); } };
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
      // tutte le letture insieme (il database è lontano: prima erano quattro attese una dopo l'altra, più gli agenti)
      const [settings, rowsR, sent, smsSent, agents, devR] = await Promise.all([
        getStoreSettings(env),
        env.DB.prepare('SELECT id, app, app_url, did, device, note, country, code, status, via, tries, uses, created, decided, by_admin, seller FROM store_requests WHERE created > ? ORDER BY created DESC LIMIT 300').bind(t - KEEP).all(),
        env.DB.prepare('SELECT COUNT(*) AS n FROM store_requests WHERE mailed = 1 AND created > ?').bind(t - 86400e3).first(),
        env.DB.prepare('SELECT COALESCE(SUM(sms), 0) AS n FROM store_requests WHERE created > ?').bind(t - 86400e3).first(),
        typeof opts.smsAgentList === 'function' ? Promise.resolve().then(() => opts.smsAgentList()).catch(() => []) : [],
        env.DB.prepare('SELECT did, seller, device, note, country, activated, last, downloads, active FROM store_devices ORDER BY active DESC, activated DESC LIMIT 2000').all(),
      ]);
      const rows = (rowsR && rowsR.results) || [], devAll = (devR && devR.results) || [], stores = devAll.filter((d) => d.active);
      const requests = rows.map((r) => {
        const st = effStatus(r, t);
        return { id: r.id, app: r.app, appUrl: r.app_url, did: r.did, device: r.device, note: r.note, country: r.country, code: st === 'pending' ? r.code : '', status: st, via: r.via, tries: r.tries, uses: r.uses, created: r.created, decided: r.decided, by: +r.by_admin || 0, seller: +r.seller || 0 };
      });
      requests.sort((a, b) => (+(b.status === 'pending') - +(a.status === 'pending')) || (b.created - a.created));
      // vista per dispositivo: le richieste raggruppate per installazione dello store (did)
      const byDid = new Map();
      for (const r of [...requests].sort((a, b) => b.created - a.created)) {
        let d = byDid.get(r.did);
        if (!d) { d = { did: r.did, device: r.device, note: r.note, country: r.country, last: r.created, requests: 0, downloads: 0, pending: 0, blocked: settings.blocked.includes(r.did), trusted: settings.trusted.includes(r.did) }; byDid.set(r.did, d); }
        if (!d.device && r.device) d.device = r.device;
        if (!d.note && r.note) d.note = r.note;
        d.requests++; if (r.uses > 0) d.downloads++; if (r.status === 'pending') d.pending++;
      }
      for (const did of settings.blocked) if (!byDid.has(did)) byDid.set(did, { did, device: '', note: '', country: '', last: 0, requests: 0, downloads: 0, pending: 0, blocked: true });
      for (const did of settings.trusted) if (!byDid.has(did)) byDid.set(did, { did, device: '', note: '', country: '', last: 0, requests: 0, downloads: 0, pending: 0, blocked: false, trusted: true });
      // dispositivi bloccati senza richieste (es. dopo tre codici sbagliati): almeno il nome
      for (const d of devAll) { if (d.active) continue; const x = byDid.get(d.did); if (x) { if (!x.device && d.device) x.device = d.device; if (!x.note && d.note) x.note = d.note; if (!x.country && d.country) x.country = d.country; } }
      // store intestati: compaiono anche se non hanno ancora scaricato nulla; seller 0 = titolare
      for (const d of stores) {
        let x = byDid.get(d.did);
        if (!x) { x = { did: d.did, device: d.device, note: d.note, country: d.country, last: d.last, requests: 0, downloads: 0, pending: 0, blocked: settings.blocked.includes(d.did), trusted: settings.trusted.includes(d.did) }; byDid.set(d.did, x); }
        if (!x.device && d.device) x.device = d.device;
        if (!x.note && d.note) x.note = d.note;
        x.seller = d.seller; x.activated = d.activated; x.storeDownloads = d.downloads; if (d.last > x.last) x.last = d.last;
      }
      const devices = [...byDid.values()].sort((a, b) => (+b.blocked - +a.blocked) || (b.last - a.last));
      return json({
        settings,
        mail: { resend: !!env.RESEND_KEY, envEmail: !!str(env.OWNER_EMAIL, 200), links: !!env.ENC_KEY, sentToday: (sent && sent.n) || 0, limit: MAIL_PER_DAY },
        sms: { ready: smsReady(env), sentToday: (smsSent && +smsSent.n) || 0, agents },
        // pending = quelle che aspettano il titolare; pendingAgents = con il codice di un agente (le gestisce lui, salvo agentAlerts)
        requests, pending: requests.filter((r) => r.status === 'pending' && (!r.seller || settings.agentAlerts)).length,
        pendingAgents: requests.filter((r) => r.status === 'pending' && r.seller).length, devices, stores: stores.length,
      });
    }
    if (path === '/store/summary' && m === 'GET') {
      // riepilogo per il titolare (store aperto): store installati e usati, download, app più scaricate, ultimi download
      if (by) throw new StoreErr(403, 'Il riepilogo dello store lo vede solo il titolare');
      const t = now(), d7 = t - 7 * 86400e3, d1 = t - 86400e3, d30 = t - KEEP;
      const [tot, apps, recent, stores, days] = await Promise.all([
        env.DB.prepare(`SELECT (SELECT COUNT(*) FROM store_seen) AS installs,
          (SELECT COUNT(*) FROM store_seen WHERE last_seen > ?) AS open30, (SELECT COUNT(*) FROM store_seen WHERE last_seen > ?) AS open7,
          (SELECT COUNT(*) FROM store_seen WHERE last_seen > ?) AS open1, (SELECT COUNT(*) FROM store_seen WHERE first_seen > ?) AS new30,
          (SELECT COUNT(*) FROM store_seen WHERE first_seen > ?) AS new7, (SELECT COALESCE(SUM(opens), 0) FROM store_seen) AS opens,
          (SELECT COUNT(*) FROM store_requests WHERE uses > 0 AND created > ?) AS dl30, (SELECT COUNT(*) FROM store_requests WHERE uses > 0 AND created > ?) AS dl7,
          (SELECT COUNT(*) FROM store_requests WHERE uses > 0 AND created > ?) AS dl1, (SELECT COUNT(DISTINCT did) FROM store_requests WHERE uses > 0 AND created > ?) AS users30`)
          .bind(d30, d7, d1, d30, d7, d30, d7, d1, d30).first(),
        env.DB.prepare('SELECT app, COUNT(*) AS n, COUNT(DISTINCT did) AS devs, SUM(CASE WHEN created > ? THEN 1 ELSE 0 END) AS n7, MAX(created) AS last FROM store_requests WHERE uses > 0 AND created > ? GROUP BY app ORDER BY n DESC LIMIT 60').bind(d7, d30).all(),
        // via 'code' = scaricata con un codice usa e getta: seller = chi l'ha generato (0 = il titolare)
        env.DB.prepare("SELECT r.app, r.device, r.country, r.created, r.via, r.seller, a.username AS sname FROM store_requests r LEFT JOIN admins a ON r.seller > 0 AND a.id = r.seller WHERE r.uses > 0 AND r.created > ? ORDER BY r.created DESC LIMIT 60").bind(d30).all(),
        env.DB.prepare('SELECT device, country, version, first_seen, last_seen, opens, downloads FROM store_seen ORDER BY last_seen DESC LIMIT 200').all(),
        // download per giorno (ultimi 14, ora italiana circa: si raggruppa per giorno UTC+1)
        env.DB.prepare("SELECT CAST((created + 3600000) / 86400000 AS INTEGER) AS d, COUNT(*) AS n FROM store_requests WHERE uses > 0 AND created > ? GROUP BY d ORDER BY d").bind(t - 14 * 86400e3).all(),
      ]);
      return json({
        open: true, settings: await getStoreSettings(env), totals: tot || {},
        apps: (apps && apps.results) || [],
        recent: ((recent && recent.results) || []).map((x) => ({ app: x.app, device: x.device, country: x.country, created: x.created, code: x.via === 'code' ? (+x.seller ? x.sname || 'agente' : 'Tu') : '' })),
        stores: ((stores && stores.results) || []).map((x) => ({ device: x.device, country: x.country, version: x.version, first: x.first_seen, last: x.last_seen, opens: x.opens, downloads: x.downloads })),
        days: ((days && days.results) || []).map((x) => ({ day: x.d * 86400e3, n: x.n })),
      });
    }
    if (path === '/store/settings' && m === 'PUT') {
      const b = await readBody(req, 8192);
      const s = await getStoreSettings(env);
      if (typeof b.approval === 'boolean') { s.approval = b.approval; if (!b.approval && b.activation === undefined) s.activation = false; } // «download liberi» spegne anche «solo store attivati»
      if (typeof b.agentAlerts === 'boolean') s.agentAlerts = b.agentAlerts;
      if (typeof b.activation === 'boolean') { s.activation = b.activation; if (b.activation) s.approval = true; }
      if (b.storeGate === 'once' || b.storeGate === 'every') s.storeGate = b.storeGate;
      if (b.recommend && typeof b.recommend === 'object') s.recommend = recNorm({ ...(s.recommend || {}), ...b.recommend });
      let codesTxt = '';
      if (b.codes && typeof b.codes === 'object') {
        if (b.codes.ttl !== undefined && !CODE_TTLS.includes(+b.codes.ttl)) throw new StoreErr(400, 'Durata del codice non valida: 10, 15, 20 o 30 minuti, 2 ore o 24 ore');
        s.codes = codesNorm({ ...s.codes, ...b.codes });
        codesTxt = s.codes.on ? `download solo con codice (vale ${ttlTxt(s.codes.ttl)})` : 'download liberi, senza codice';
      }
      if (b.storeMax !== undefined) { const n = parseInt(b.storeMax, 10); if (!(n >= 0 && n <= STORE_MAX_CAP)) throw new StoreErr(400, `Tetto di store non valido (da 0 a ${STORE_MAX_CAP})`); s.storeMax = n; }
      if (b.closed && typeof b.closed === 'object') {
        const c = b.closed;
        if ((c.from !== undefined && !HM_RE.test(c.from)) || (c.to !== undefined && !HM_RE.test(c.to))) throw new StoreErr(400, 'Orario non valido: scrivilo come 23:00');
        const was = s.closed; s.closed = closedNorm({ ...was, ...c });
        if (s.closed.on && s.closed.from === s.closed.to) throw new StoreErr(400, 'L\'ora di apertura e quella di chiusura devono essere diverse');
        await log(env, 'settings', `${who}: store ${s.closed.on ? `chiuso dalle ${s.closed.from} alle ${s.closed.to}` : 'sempre aperto (orari di chiusura spenti)'}`, ip);
      }
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
      await log(env, 'settings', `${who}: Store — ${codesTxt || (b.recommend ? `app consigliata: ${s.recommend.weakApp} / ${s.recommend.oldApp} / ${s.recommend.strongApp}` : 'impostazioni salvate')}${smsTxt}`, ip);
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
        s.trusted = s.trusted.filter((d) => d !== did); // bloccato e senza limiti insieme non ha senso
      }
      await putStoreSettings(env, s);
      if (!blocked) await env.DB.prepare('DELETE FROM store_act_fail WHERE k = ?').bind('did:' + did).run().catch(() => {}); // sbloccato: i codici sbagliati ripartono da zero
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
    if (path === '/store/device/unlink' && m === 'POST') {
      // scollega lo store dal venditore: torna «da attivare» (con «solo store attivati» non scarica più finché non viene riattivato)
      const b = await readBody(req);
      const did = str(b.did, 64);
      if (!DID_RE.test(did)) throw new StoreErr(400, 'Dispositivo non valido');
      const d = await env.DB.prepare('SELECT device, note, seller FROM store_devices WHERE did = ? AND active = 1').bind(did).first();
      if (!d) throw new StoreErr(404, 'Questo store non è attivato');
      await env.DB.prepare('UPDATE store_devices SET active = 0 WHERE did = ?').bind(did).run();
      await log(env, 'off', `${who}: Store — store scollegato · ${d.device || 'dispositivo'}${d.note ? ' (' + d.note + ')' : ''}`, ip);
      return json({ ok: true, did, seller: +d.seller || 0 });
    }
    if (path === '/store/device/trust' && m === 'POST') {
      // «Senza limiti»: eccezione del titolare per un dispositivo che fa tante richieste legittime (installatore, negozio)
      if (by) throw new StoreErr(403, 'Le eccezioni ai limiti le decide il titolare');
      const b = await readBody(req);
      const did = str(b.did, 64);
      if (!DID_RE.test(did)) throw new StoreErr(400, 'Dispositivo non valido');
      const s = await getStoreSettings(env);
      const trusted = b.trusted !== false;
      s.trusted = s.trusted.filter((d) => d !== did);
      if (trusted) {
        if (s.trusted.length >= MAX_BLOCKED) throw new StoreErr(400, 'Troppi dispositivi senza limiti');
        s.trusted.unshift(did);
        s.blocked = s.blocked.filter((d) => d !== did);
      }
      await putStoreSettings(env, s);
      const name = await env.DB.prepare('SELECT device, note FROM store_requests WHERE did = ? ORDER BY created DESC LIMIT 1').bind(did).first();
      await log(env, 'settings', `${who}: Store — dispositivo ${trusted ? 'senza limiti' : 'di nuovo con i limiti normali'} · ${(name && name.device) || 'dispositivo'}${name && name.note ? ' (' + name.note + ')' : ''}`, ip);
      return json({ ok: true, did, trusted, settings: s });
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
