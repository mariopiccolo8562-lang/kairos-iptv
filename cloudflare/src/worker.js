/*  KAIROS — Cloudflare Worker
 *  - /panel/*            pannello (asset statici) — protetto da Cloudflare Access se configurato
 *  - /api/admin/*        API del pannello — sessione + 2FA + CSRF + Access JWT
 *  - /api/player/*       API pubblica per l'app (rate limit + segreto dispositivo)
 *  - /api/public/config  configurazione pubblica minima del pannello (chiave Turnstile)
 *
 *  Binding:  DB (D1), ASSETS, RL_LOGIN / RL_DEVICE (rate limiting)
 *  Segreti:  ENC_KEY (base64, 32 byte), ADMIN_BOOTSTRAP_PASS, TURNSTILE_SECRET (opzionale)
 *  Variabili: ACCESS_TEAM_DOMAIN, ACCESS_AUD, TURNSTILE_SITEKEY (opzionali)
 */
import { storeApi, storeAdmin, storeHeaders } from './store.js'; // autorizzazione download dello Store (/api/store/*)

const SESSION_TTL = 12 * 3600; // secondi
const COOKIE = '__Host-kx';
const PBKDF2_ITER = 100000; // massimo supportato da Workers
const MAX_PENDING = 2000;
const enc = new TextEncoder();
const dec = new TextDecoder();

/* ====================================================================== */
export default {
  async fetch(req, env, ctx) {
    let res;
    try {
      res = await route(req, env, ctx);
    } catch (e) {
      console.error('ERR', e && e.stack || e);
      res = json({ error: 'Errore interno' }, 500);
    }
    return harden(res, req);
  },
  async scheduled(_ev, env) {
    await cleanup(env);
  },
};

/* ====================================================================== */
/* Utility                                                                */
/* ====================================================================== */
const now = () => Date.now();
const json = (obj, status = 200, headers = {}) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers } });
const ipOf = (req) => req.headers.get('CF-Connecting-IP') || req.headers.get('X-Forwarded-For') || '0.0.0.0';
const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function b64(buf) { let s = ''; const b = new Uint8Array(buf); for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s); }
function unb64(s) { const bin = atob(s); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
const b64url = (buf) => b64(buf).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s) => unb64(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
const rand = (n) => crypto.getRandomValues(new Uint8Array(n));
async function sha256(s) { return b64url(await crypto.subtle.digest('SHA-256', typeof s === 'string' ? enc.encode(s) : s)); }
function safeEq(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const x = enc.encode(a), y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}
async function readJSON(req, max = 64 * 1024) {
  const len = +(req.headers.get('Content-Length') || 0);
  if (len > max) throw new HttpErr(413, 'Richiesta troppo grande');
  const t = await req.text();
  if (t.length > max) throw new HttpErr(413, 'Richiesta troppo grande');
  try { return JSON.parse(t || '{}'); } catch { throw new HttpErr(400, 'JSON non valido'); }
}
class HttpErr extends Error { constructor(status, msg) { super(msg); this.status = status; } }

/* ---------------- password (PBKDF2-SHA256) ---------------- */
async function hashPass(pass, salt = rand(16), iter = PBKDF2_ITER) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256);
  return `pbkdf2$${iter}$${b64(salt)}$${b64(bits)}`;
}
async function checkPass(pass, stored) {
  const [alg, iter, salt] = String(stored).split('$');
  if (alg !== 'pbkdf2') return false;
  return safeEq(await hashPass(pass, unb64(salt), +iter), stored);
}

/* ---------------- cifratura playlist (AES-256-GCM) ---------------- */
let aesKey;
async function getKey(env) {
  if (!env.ENC_KEY) throw new HttpErr(500, 'ENC_KEY non configurata sul Worker');
  if (!aesKey) {
    const raw = unb64(env.ENC_KEY);
    if (raw.length !== 32) throw new HttpErr(500, 'ENC_KEY deve essere di 32 byte in base64');
    aesKey = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  }
  return aesKey;
}
async function seal(env, obj) {
  const iv = rand(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await getKey(env), enc.encode(JSON.stringify(obj)));
  const out = new Uint8Array(12 + ct.byteLength); out.set(iv); out.set(new Uint8Array(ct), 12);
  return 'v1:' + b64(out);
}
async function unseal(env, s) {
  if (!s) return [];
  if (!s.startsWith('v1:')) return [];
  const raw = unb64(s.slice(3));
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(0, 12) }, await getKey(env), raw.slice(12));
  return JSON.parse(dec.decode(pt));
}

/* ---------------- TOTP (RFC 6238) ---------------- */
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function b32enc(bytes) { let bits = 0, val = 0, out = ''; for (const b of bytes) { val = (val << 8) | b; bits += 8; while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; } } if (bits) out += B32[(val << (5 - bits)) & 31]; return out; }
function b32dec(s) { const clean = s.replace(/[^A-Z2-7]/gi, '').toUpperCase(); let bits = 0, val = 0; const out = []; for (const c of clean) { val = (val << 5) | B32.indexOf(c); bits += 5; if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; } } return new Uint8Array(out); }
async function hotp(secret, counter) {
  const key = await crypto.subtle.importKey('raw', b32dec(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const msg = new Uint8Array(8); let c = counter;
  for (let i = 7; i >= 0; i--) { msg[i] = c & 255; c = Math.floor(c / 256); }
  const h = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg));
  const o = h[19] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1e6).padStart(6, '0');
}
/** ritorna il contatore valido (per anti-replay) oppure -1 */
async function checkTotp(secret, code, last = 0) {
  code = String(code || '').replace(/\D/g, '');
  if (code.length !== 6 || !secret) return -1;
  const t = Math.floor(now() / 30000);
  for (const w of [0, -1, 1]) {
    const ctr = t + w;
    if (ctr <= last) continue;
    if (safeEq(await hotp(secret, ctr), code)) return ctr;
  }
  return -1;
}

/* ---------------- Cloudflare Access (verifica JWT) ---------------- */
let jwks = null, jwksAt = 0;
async function verifyAccess(req, env) {
  if (!env.ACCESS_AUD || !env.ACCESS_TEAM_DOMAIN) return true; // Access non configurato
  const token = req.headers.get('Cf-Access-Jwt-Assertion') || (req.headers.get('Cookie') || '').match(/CF_Authorization=([^;]+)/)?.[1];
  if (!token) return false;
  const [h, p, s] = token.split('.');
  if (!h || !p || !s) return false;
  let header, payload;
  try { header = JSON.parse(dec.decode(unb64url(h))); payload = JSON.parse(dec.decode(unb64url(p))); } catch { return false; }
  const team = env.ACCESS_TEAM_DOMAIN.replace(/^https?:\/\//, '').replace(/\/$/, '');
  if (!jwks || now() - jwksAt > 3600e3) {
    const r = await fetch(`https://${team}/cdn-cgi/access/certs`);
    if (!r.ok) return false;
    jwks = (await r.json()).keys || []; jwksAt = now();
  }
  const jwk = jwks.find((k) => k.kid === header.kid);
  if (!jwk || header.alg !== 'RS256') return false;
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, unb64url(s), enc.encode(`${h}.${p}`));
  if (!ok) return false;
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes(env.ACCESS_AUD)) return false;
  if (payload.iss !== `https://${team}`) return false;
  if (!payload.exp || payload.exp * 1000 < now()) return false;
  if (payload.nbf && payload.nbf * 1000 > now() + 60e3) return false;
  return true;
}

/* ---------------- Turnstile ---------------- */
async function verifyTurnstile(env, token, ip) {
  if (!env.TURNSTILE_SECRET) return true;
  if (!token) return false;
  const body = new FormData();
  body.append('secret', env.TURNSTILE_SECRET); body.append('response', token); body.append('remoteip', ip);
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
  const j = await r.json().catch(() => ({}));
  return !!j.success;
}

/* ---------------- rate limit ---------------- */
async function limited(binding, key) {
  if (!binding || typeof binding.limit !== 'function') return false;
  try { const { success } = await binding.limit({ key }); return !success; } catch { return false; }
}

/* ---------------- header di sicurezza ---------------- */
const CSP_PANEL = [
  "default-src 'self'",
  "script-src 'self' https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "frame-src https://challenges.cloudflare.com",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');
function harden(res, req) {
  const url = new URL(req.url);
  const r = new Response(res.body, res);
  const h = r.headers;
  h.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('X-Frame-Options', 'DENY');
  h.set('Referrer-Policy', 'no-referrer');
  h.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()');
  h.set('Cross-Origin-Opener-Policy', 'same-origin');
  h.set('X-Robots-Tag', 'noindex, nofollow');
  h.delete('Server');
  if (url.pathname.startsWith('/api/')) {
    h.set('Cache-Control', 'no-store');
    h.set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  } else {
    h.set('Content-Security-Policy', CSP_PANEL);
    if (url.pathname.endsWith('.html') || url.pathname.endsWith('/')) h.set('Cache-Control', 'no-cache');
  }
  if (url.pathname.startsWith('/app/')) {
    h.set('Access-Control-Allow-Origin', '*');
    h.set('Cross-Origin-Resource-Policy', 'cross-origin');
    h.set('Cache-Control', 'no-cache');
  }
  if (url.pathname.startsWith('/api/player/')) {
    h.set('Access-Control-Allow-Origin', '*');
    h.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    h.set('Access-Control-Allow-Headers', 'Content-Type');
    h.set('Access-Control-Max-Age', '86400');
    h.set('Cross-Origin-Resource-Policy', 'cross-origin');
  } else {
    if (!url.pathname.startsWith('/app/')) h.set('Cross-Origin-Resource-Policy', 'same-origin');
  }
  if (url.pathname.startsWith('/api/store/')) storeHeaders(h, url.pathname); // CORS per lo store + pagine dei link email
  if (url.pathname === '/privacy' || url.pathname === '/privacy/') {
    // pagina pubblica senza script né azioni: l'app può leggerla o mostrarla in un riquadro
    h.delete('X-Frame-Options');
    h.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'");
    h.set('Access-Control-Allow-Origin', '*');
    h.set('Cross-Origin-Resource-Policy', 'cross-origin');
  }
  return r;
}

/* ====================================================================== */
/* Dati                                                                   */
/* ====================================================================== */
const DEFAULT_SETTINGS = {
  brand: 'KAIROS', tagline: 'Streaming', accent: 'cinema',
  announcement: 'Benvenuto su KAIROS — buona visione!', supportContact: '',
  allowLocalPlaylists: true, apkUrl: '', apkVersionCode: 0, downloaderCode: '',
  serverUrl: '', showFootball: true,
  price: '22 € / anno', privacy: '',
};
/* Versione dell'APK da proporre alle app: quella pubblicata in automatico da GitHub (kairos-tv.json)
   oppure, solo se strettamente più recente, quella scritta a mano nel pannello.
   Il versionCode si ricava SEMPRE dal nome versione con lo stesso schema della build (X.Y.Z → X*10000+Y*100+Z):
   un numero scritto a mano con un altro schema (es. versioni vecchie del pannello) faceva riproporre all'infinito
   un aggiornamento già installato. */
const semverCode = (v) => { const m = String(v || '').trim().replace(/^v/i, '').match(/^(\d{1,3})\.(\d{1,2})\.(\d{1,2})$/); return m ? +m[1] * 10000 + +m[2] * 100 + +m[3] : 0; };
let feedMem = { t: 0, v: null };
async function apkFeed(env) {
  if (!env.APK_FEED) return null;
  if (now() - feedMem.t < 5 * 60e3) return feedMem.v;
  let v = null;
  try {
    const r = await fetch(env.APK_FEED, { headers: { 'User-Agent': 'KairosPanel' }, cf: { cacheTtl: 300, cacheEverything: true } });
    if (r.ok) {
      const j = await r.json();
      const code = semverCode(j.version) || +j.versionCode;
      if (code > 0 && /^https:\/\//.test(j.url || '')) v = { versionCode: code, version: String(j.version || '').slice(0, 20), url: String(j.url).slice(0, 500), date: String(j.date || '').slice(0, 40) };
    }
  } catch {}
  feedMem = { t: now(), v };
  return v;
}
async function latestApk(env, s) {
  // versione manuale valida solo se scritta come X.Y.Z (i vecchi numeri "a mano" senza nome versione vengono ignorati)
  const code = semverCode(s.apkVersion);
  const manual = { versionCode: code, version: code ? String(s.apkVersion) : '', url: code ? s.apkUrl || '' : '', auto: false };
  const f = await apkFeed(env);
  if (!f) return manual;
  return manual.url && manual.versionCode > f.versionCode ? manual : { ...f, auto: true };
}

async function getSettings(env) {
  const row = await env.DB.prepare('SELECT v FROM settings WHERE k = ?').bind('app').first();
  let s = {}; try { s = row ? JSON.parse(row.v) : {}; } catch {}
  return { ...DEFAULT_SETTINGS, ...s };
}
const publicSettings = (s) => ({ brand: s.brand, tagline: s.tagline, accent: s.accent, announcement: s.announcement, supportContact: s.supportContact, allowLocalPlaylists: !!s.allowLocalPlaylists, serverUrl: s.serverUrl || '', showFootball: s.showFootball !== false, price: typeof s.price === 'string' ? s.price : DEFAULT_SETTINGS.price, privacy: typeof s.privacy === 'string' ? s.privacy : '' });

/* ---------------- eventi di calcio (calendario pubblico ESPN, in cache 15 minuti) ---------------- */
const LEAGUES = [
  ['ita.1', 'Serie A'], ['uefa.champions', 'Champions League'], ['uefa.europa', 'Europa League'], ['uefa.europa.conf', 'Conference League'],
  ['ita.coppa_italia', 'Coppa Italia'], ['eng.1', 'Premier League'], ['esp.1', 'LaLiga'], ['ger.1', 'Bundesliga'], ['fra.1', 'Ligue 1'],
];
const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');
/* Eventi di calcio da ESPN.
   ESPN rifiuta gli intervalli di date: si chiede un giorno alla volta per ogni campionato.
   Ogni "campionato+giorno" viene salvato in D1 (la cache di Cloudflare non funziona su workers.dev)
   e riscaricato solo quando è vecchio, restando sotto il limite di 50 richieste del piano gratuito. */
let evMem = { t: 0, body: null };
async function espnDay(code, label, day) {
  const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${code}/scoreboard?dates=${day}`, { headers: { 'User-Agent': 'Mozilla/5.0 KairosPanel' } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const j = await r.json();
  return (j.events || []).map((e) => {
    const c = (e.competitions || [])[0] || {};
    const team = (side) => { const t = ((c.competitors || []).find((x) => x.homeAway === side) || {}).team || {}; return { name: t.shortDisplayName || t.displayName || '', logo: t.logo || '' }; };
    const score = (side) => ((c.competitors || []).find((x) => x.homeAway === side) || {}).score;
    const state = (e.status && e.status.type && e.status.type.state) || 'pre';
    return { id: String(e.id), league: label, start: e.date, home: { ...team('home'), score: score('home') }, away: { ...team('away'), score: score('away') }, venue: (c.venue && c.venue.fullName) || '', live: state === 'in', state, clock: (e.status && e.status.type && e.status.type.shortDetail) || '' };
  }).filter((e) => e.home.name && e.away.name);
}
async function footballEvents(env, ctx) {
  if (evMem.body && now() - evMem.t < 3 * 60e3) return evMem.body;
  const days = [...Array(8)].map((_, i) => ymd(new Date(now() + i * 86400e3)));
  const rows = ((await env.DB.prepare("SELECT k, v FROM settings WHERE k LIKE 'ev:%'").all()).results) || [];
  const have = new Map(rows.map((r) => { try { return [r.k, JSON.parse(r.v)]; } catch { return [r.k, null]; } }));
  // validità: oggi 5 minuti (risultati in diretta), domani 1 ora, gli altri giorni 6 ore
  const ttl = (di) => (di === 0 ? 5 * 60e3 : di === 1 ? 3600e3 : 6 * 3600e3);
  const todo = [];
  days.forEach((day, di) => LEAGUES.forEach(([code, label]) => { const k = `ev:${code}:${day}`, h = have.get(k); if (!h || now() - h.t > ttl(di)) todo.push({ k, code, label, day, di }); }));
  todo.sort((a, b) => a.di - b.di);
  const batch = todo.slice(0, 40);
  const got = await Promise.all(batch.map(async (x) => { try { return { ...x, ev: await espnDay(x.code, x.label, x.day) }; } catch { return null; } }));
  const writes = [];
  for (const g of got) if (g) { const v = { t: now(), ev: g.ev }; have.set(g.k, v); writes.push(env.DB.prepare('INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind(g.k, JSON.stringify(v))); }
  const old = [...have.keys()].filter((k) => !days.includes(k.split(':')[2]));
  for (const k of old) { writes.push(env.DB.prepare('DELETE FROM settings WHERE k = ?').bind(k)); have.delete(k); }
  if (writes.length) { const w = env.DB.batch(writes).catch(() => {}); ctx && ctx.waitUntil ? ctx.waitUntil(w) : await w; }
  const seen = new Set(), t = now();
  const events = [...have.values()].flatMap((v) => (v && v.ev) || [])
    .filter((e) => { if (seen.has(e.id)) return false; seen.add(e.id); return e.state !== 'post' && +new Date(e.start) > t - 4 * 3600e3; })
    .sort((a, b) => (+b.live - +a.live) || (new Date(a.start) - new Date(b.start))).slice(0, 40);
  const body = { events, updated: t };
  evMem = { t, body };
  return body;
}
async function log(env, type, text, ip = '') {
  await env.DB.prepare('INSERT INTO activity (t, type, text, ip) VALUES (?, ?, ?, ?)').bind(now(), type, String(text).slice(0, 300), ip).run();
}
const isExpired = (d) => d.expires && new Date(d.expires + 'T23:59:59Z').getTime() < now();
function statusOf(d, pls) {
  if (!d.active) return pls && pls.length ? 'disabled' : 'pending';
  if (isExpired(d)) return 'expired';
  return 'active';
}
function cleanPlaylists(list) {
  if (!Array.isArray(list)) return [];
  const okUrl = (u) => { if (!u) return ''; try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href.slice(0, 1000) : ''; } catch { return ''; } };
  const ids = new Set();
  const pid = (v) => { let id = str(v, 40); if (!/^[A-Za-z0-9_-]{1,40}$/.test(id) || ids.has(id)) id = b64url(rand(6)); ids.add(id); return id; };
  return list.slice(0, 20).map((p) => ({
    id: pid(p.id),
    name: str(p.name, 60) || 'Playlist',
    type: p.type === 'xtream' ? 'xtream' : 'm3u',
    url: okUrl(str(p.url, 1000)),
    host: okUrl(str(p.host, 300)).replace(/\/+$/, ''),
    username: str(p.username, 120),
    password: str(p.password, 120),
  }));
}
const CODE_RE = /^KX[A-Z0-9]{2}-[A-Z0-9]{4}$/;
// '' (illimitata) oppure una data AAAA-MM-GG esistente (una data impossibile non scadrebbe mai)
const DATE_RE = { test: (s) => { if (s === '') return true; if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false; const t = new Date(s + 'T00:00:00Z'); return !isNaN(t) && t.toISOString().slice(0, 10) === s; } };

/* ====================================================================== */
/* Account: connessioni (più dispositivi), profili personali, VPN           */
/* ====================================================================== */
const AVATAR_RE = /^a([1-9]|1[0-2])$/;
const PROFILE_ID_RE = /^[a-z0-9]{4,12}$/;
const MAX_CONN = 20, MAX_PROFILES = 12;
const intIn = (v, lo, hi, label) => { const n = Number(v); if (!Number.isInteger(n) || n < lo || n > hi) throw new HttpErr(400, `${label}: scegli un numero da ${lo} a ${hi}`); return n; };
const nameClean = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max).trim() : '');
function newProfileId(taken) { const A = 'abcdefghijklmnopqrstuvwxyz0123456789'; let id; do id = [...rand(8)].map((x) => A[x % 36]).join(''); while (taken.has(id)); return id; }
/** valida la lista profili (dall'app o dal pannello). plIds = id delle playlist dell'account */
function cleanProfiles(list, max, plIds) {
  if (!Array.isArray(list)) throw new HttpErr(400, 'Profili non validi');
  if (list.length > max) throw new HttpErr(400, max ? `Puoi avere al massimo ${max} profili` : 'I profili personali non sono inclusi in questo abbonamento');
  const taken = new Set(list.map((p) => (p && typeof p.id === 'string' ? p.id : '')).filter((x) => PROFILE_ID_RE.test(x)));
  const seen = new Set();
  return list.map((p) => {
    if (!p || typeof p !== 'object' || Array.isArray(p)) throw new HttpErr(400, 'Profilo non valido');
    let id = typeof p.id === 'string' ? p.id.trim() : '';
    if (!id) id = newProfileId(new Set([...taken, ...seen]));
    else if (!PROFILE_ID_RE.test(id)) throw new HttpErr(400, 'Profilo non valido');
    if (seen.has(id)) throw new HttpErr(400, 'Due profili hanno lo stesso identificativo');
    seen.add(id);
    const name = nameClean(p.name, 24);
    if (!name) throw new HttpErr(400, 'Ogni profilo deve avere un nome');
    const avatar = p.avatar === undefined || p.avatar === null || p.avatar === '' ? 'a1' : String(p.avatar);
    if (!AVATAR_RE.test(avatar)) throw new HttpErr(400, 'Avatar non valido');
    // una playlist rimossa nel frattempo non blocca il salvataggio: il profilo torna su "tutte"
    const pl = typeof p.pl === 'string' && p.pl.length <= 40 && plIds.includes(p.pl) ? p.pl : 'all';
    return { id, name, avatar, kids: p.kids === true, pl };
  });
}
/** profili salvati, già pronti per l'app (mai oltre il limite, playlist inesistenti → "all") */
function readProfiles(d, plIds) {
  let a = []; try { a = JSON.parse(d.profiles || '[]'); } catch {}
  if (!Array.isArray(a)) return [];
  return a.filter((p) => p && PROFILE_ID_RE.test(p.id)).slice(0, d.max_profiles ?? 3)
    .map((p) => ({ id: p.id, name: nameClean(p.name, 24) || 'Profilo', avatar: AVATAR_RE.test(p.avatar) ? p.avatar : 'a1', kids: p.kids === true, pl: plIds.includes(p.pl) ? p.pl : 'all' }));
}
/** dispositivo principale dell'account (se stesso, oppure quello a cui è collegato); null se il principale non esiste più */
async function primaryOf(env, d) {
  if (!d.parent) return d;
  const p = await env.DB.prepare('SELECT * FROM devices WHERE id = ?').bind(d.parent).first();
  return p && !p.parent ? p : null;
}
const linkedOf = async (env, id) => ((await env.DB.prepare('SELECT id, code, name, model, last_seen, vpn_conf FROM devices WHERE parent = ? ORDER BY created_at LIMIT 100').bind(id).all()).results) || [];
async function accountOf(env, P, me, pls) {
  const conns = [P, ...(await linkedOf(env, P.id))].map((x) => ({ name: x.name || '', model: x.model || '', seen: x.id === me.id ? now() : +x.last_seen || 0, me: x.id === me.id }));
  return { primary: me.id === P.id, owner: P.name || '', maxConn: P.max_conn ?? 1, conns, maxProfiles: P.max_profiles ?? 3, profiles: readProfiles(P, pls.map((p) => p.id)), canEdit: !P.lock_profiles };
}
/* ---------------- VPN (WireGuard) ---------------- */
/** controlla una configurazione wg-quick; '' = nessuna */
function cleanWg(t) {
  t = typeof t === 'string' ? t.replace(/\r\n?/g, '\n').trim() : '';
  if (!t) return '';
  if (t.length > 4000) throw new HttpErr(400, 'Configurazione WireGuard troppo lunga');
  if (/[\u0000-\u0008\u000b-\u001f\u007f]/.test(t)) throw new HttpErr(400, 'La configurazione WireGuard contiene caratteri non validi');
  const has = (re) => re.test(t);
  if (!has(/^\s*\[Interface\]\s*$/im) || !has(/^\s*PrivateKey\s*=\s*\S+/im) || !has(/^\s*Address\s*=\s*\S+/im) || !has(/^\s*\[Peer\]\s*$/im) || !has(/^\s*PublicKey\s*=\s*\S+/im) || !has(/^\s*Endpoint\s*=\s*\S+/im))
    throw new HttpErr(400, 'Configurazione WireGuard non valida: servono [Interface] con PrivateKey e Address, e [Peer] con PublicKey ed Endpoint');
  return t;
}
const unsealText = async (env, s) => { if (!s) return ''; const v = await unseal(env, s).catch(() => ''); return typeof v === 'string' ? v : ''; };
async function wgGlobal(env) {
  const r = await env.DB.prepare('SELECT v FROM settings WHERE k = ?').bind('wg').first();
  return r ? unsealText(env, r.v) : '';
}
async function vpnOf(env, P, me) {
  const lvl = +P.vpn || 0, mode = lvl === 2 ? 'force' : lvl === 1 ? 'allow' : 'off';
  const out = { mode };
  if (mode !== 'off') {
    // ogni dispositivo dovrebbe avere la sua chiave: prima la sua, poi quella del principale, poi quella generale
    const conf = (me.id !== P.id && await unsealText(env, me.vpn_conf)) || await unsealText(env, P.vpn_conf) || await wgGlobal(env);
    if (conf) out.conf = conf;
  }
  return out;
}
/* ---------------- contatori anti-abuso su D1 (finestre lunghe, oltre i 60 s del rate limiting nativo) ---------------- */
async function throttled(env, key, max, windowMs) {
  try {
    const t = now();
    const r = await env.DB.prepare('INSERT INTO throttle (k, n, until) VALUES (?, 1, ?) ON CONFLICT(k) DO UPDATE SET n = CASE WHEN throttle.until < ? THEN 1 ELSE throttle.n + 1 END, until = CASE WHEN throttle.until < ? THEN excluded.until ELSE throttle.until END RETURNING n')
      .bind(key, t + windowMs, t, t).first();
    return !!r && r.n > max;
  } catch { return false; }
}
async function overLimit(env, key, max) {
  try { const r = await env.DB.prepare('SELECT n FROM throttle WHERE k = ? AND until >= ?').bind(key, now()).first(); return !!r && r.n >= max; } catch { return false; }
}
/* ---------------- collegamento di un altro dispositivo con codice a 6 cifre ---------------- */
const PIN_TTL = 10 * 60e3;
const pinHash = (env, pin) => sha256('pin:' + (env.ENC_KEY || '') + ':' + pin); // con "pepe" segreto: l'hash da solo non basta a risalire al codice
function newPin() { for (;;) { const n = new DataView(rand(4).buffer).getUint32(0); if (n < 4294000000) return String(n % 1e6).padStart(6, '0'); } }
/** autentica un'app con codice + segreto (come per le segnalazioni) */
async function deviceAuth(env, b) {
  const code = str(b.code, 20).toUpperCase(), secret = str(b.secret, 100);
  if (!CODE_RE.test(code) || !/^[A-Za-z0-9_-]{32,100}$/.test(secret)) return [null, json({ error: 'Dati non validi' }, 400)];
  const sh = await sha256('dev:' + secret);
  const d = await env.DB.prepare('SELECT * FROM devices WHERE code = ?').bind(code).first();
  if (!d || !d.secret_hash || !safeEq(d.secret_hash, sh)) return [null, json({ error: 'Dispositivo non riconosciuto' }, 403)];
  return [d, null];
}
/** account attivo del dispositivo: [principale, playlist] oppure [null] */
async function activeAccount(env, d) {
  const P = await primaryOf(env, d);
  if (!P) return [null, []];
  const pls = await unseal(env, P.playlists).catch(() => []);
  return statusOf(P, pls) === 'active' ? [P, pls] : [null, []];
}
const connCount = async (env, P) => 1 + ((await env.DB.prepare('SELECT COUNT(*) AS n FROM devices WHERE parent = ?').bind(P.id).first()) || { n: 0 }).n;

async function playerProfiles(req, env, ip, ctx) {
  if (await limited(env.RL_DEVICE, 'prof:' + ip)) return json({ error: 'Troppe richieste, riprova tra poco' }, 429);
  let b;
  try { b = await readJSON(req, 16384); } catch (e) { return json({ error: e.message }, e.status || 400); }
  const [d, bad] = await deviceAuth(env, b);
  if (bad) return bad;
  const [P, pls] = await activeAccount(env, d);
  if (!P) return json({ error: 'Abbonamento non attivo' }, 403);
  if (P.lock_profiles) return json({ error: 'La modifica dei profili è stata bloccata dal fornitore' }, 403);
  if (await throttled(env, 'prof:' + P.id, 60, 3600e3)) return json({ error: 'Troppe modifiche, riprova più tardi' }, 429);
  let list;
  try { list = cleanProfiles(b.profiles, P.max_profiles ?? 3, pls.map((p) => p.id)); } catch (e) { return json({ error: e.message }, e.status || 400); }
  await env.DB.prepare('UPDATE devices SET profiles = ? WHERE id = ?').bind(JSON.stringify(list), P.id).run();
  ctx.waitUntil(log(env, 'edit', `Profili modificati dal cliente ${P.name || P.code} (${list.length})`, ip));
  return json({ ok: true, profiles: list });
}
async function playerLinkCode(req, env, ip, ctx) {
  if (await limited(env.RL_DEVICE, 'lc:' + ip)) return json({ error: 'Troppe richieste, riprova tra poco' }, 429);
  let b;
  try { b = await readJSON(req, 2048); } catch (e) { return json({ error: e.message }, e.status || 400); }
  const [d, bad] = await deviceAuth(env, b);
  if (bad) return bad;
  const [P] = await activeAccount(env, d);
  if (!P) return json({ error: 'Abbonamento non attivo' }, 403);
  const used = await connCount(env, P), max = P.max_conn ?? 1;
  if (used >= max) return json({ error: `Connessioni esaurite (${used} di ${max})` }, 409);
  if (await throttled(env, 'lc:' + P.id, 12, 3600e3)) return json({ error: 'Hai richiesto troppi codici, riprova più tardi' }, 429);
  const until = now() + PIN_TTL;
  await env.DB.prepare('DELETE FROM link_pins WHERE device_id = ? OR until < ?').bind(P.id, now()).run(); // un solo codice valido per account
  for (let i = 0; i < 8; i++) {
    const pin = newPin();
    try {
      await env.DB.prepare('INSERT INTO link_pins (pin_hash, device_id, until) VALUES (?, ?, ?)').bind(await pinHash(env, pin), P.id, until).run();
      return json({ pin, until });
    } catch {} // stesso codice già in uso da un altro account: se ne genera un altro
  }
  return json({ error: 'Riprova tra poco' }, 503);
}
async function playerLink(req, env, ip, ctx) {
  if (await limited(env.RL_DEVICE, 'lk:' + ip)) return json({ error: 'Troppe richieste, riprova tra poco' }, 429);
  let b;
  try { b = await readJSON(req, 2048); } catch (e) { return json({ error: e.message }, e.status || 400); }
  const [d, bad] = await deviceAuth(env, b);
  if (bad) return bad;
  // contro chi prova i codici a caso: 5 tentativi ogni 10 minuti per IP e per dispositivo, e al massimo 100 errori ogni 10 minuti in tutto
  if (await throttled(env, 'lk:ip:' + ip, 5, PIN_TTL) || await throttled(env, 'lk:dev:' + d.id, 5, PIN_TTL)) return json({ error: 'Troppi tentativi: riprova tra 10 minuti' }, 429);
  if (await overLimit(env, 'lk:fail', 100)) return json({ error: 'Collegamento temporaneamente sospeso, riprova tra qualche minuto' }, 429);
  if (d.parent) return json({ error: 'Questo dispositivo è già collegato a un account' }, 409);
  const own = await unseal(env, d.playlists).catch(() => []);
  if (d.active || own.length) return json({ error: 'Questo dispositivo ha già un abbonamento suo: chiedi al fornitore di collegarlo' }, 409);
  // come nel pannello: un principale con connessioni proprie non può diventare a sua volta una connessione (catena a due livelli)
  if ((await connCount(env, d)) > 1) return json({ error: 'Questo dispositivo ha già altre connessioni collegate: chiedi al fornitore di collegarlo' }, 409);
  const fail = async () => {
    await throttled(env, 'lk:fail', 1e9, PIN_TTL);
    ctx.waitUntil(log(env, 'off', `Codice di collegamento errato da ${d.code}${d.model ? ' (' + d.model + ')' : ''}`, ip));
    return json({ error: 'Codice non valido o scaduto' }, 400);
  };
  const pin = String(b.pin ?? '').replace(/[\s-]/g, '');
  if (!/^\d{6}$/.test(pin)) return fail();
  const h = await pinHash(env, pin);
  const row = await env.DB.prepare('SELECT device_id FROM link_pins WHERE pin_hash = ? AND until > ?').bind(h, now()).first();
  if (!row) return fail();
  const P0 = await env.DB.prepare('SELECT * FROM devices WHERE id = ?').bind(row.device_id).first();
  const [P] = P0 && !P0.parent && P0.id !== d.id ? await activeAccount(env, P0) : [null];
  if (!P) return fail();
  const used = await connCount(env, P), max = P.max_conn ?? 1;
  if (used >= max) return json({ error: `Connessioni esaurite (${used} di ${max})` }, 409);
  // il codice si usa una volta sola (se due dispositivi lo inviano insieme, solo uno lo ottiene)
  if (!(await env.DB.prepare('DELETE FROM link_pins WHERE pin_hash = ? AND until > ? RETURNING device_id').bind(h, now()).first())) return fail();
  await env.DB.prepare("UPDATE devices SET parent = ?, active = 0, expires = '', playlists = '', profiles = '' WHERE id = ? AND parent = ''").bind(P.id, d.id).run();
  ctx.waitUntil(log(env, 'on', `${d.code}${d.model ? ' (' + d.model + ')' : ''} collegato come connessione di ${P.name || P.code} (${used + 1} di ${max})`, ip));
  return json({ ok: true });
}
/** in pannello: rende di nuovo "in attesa" un dispositivo collegato */
const unlinkStmt = (env, id) => env.DB.prepare("UPDATE devices SET parent = '', active = 0, expires = '', playlists = '', profiles = '' WHERE id = ?").bind(id);

/* ====================================================================== */
/* Tendenze: film e serie più popolari in Italia (Apple iTunes, oppure TMDB) */
/* ====================================================================== */
const TREND_TTL = 6 * 3600e3;
let trMem = { exp: 0, body: null };
const tmo = (ms = 8000) => (typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(ms) : undefined);
const yearOf = (s) => { const m = String(s || '').match(/\b(?:19|20)\d{2}\b/); return m ? +m[0] : null; };
/** titolo pulito: senza "(Doppiato)", "(4K)" e, per le serie, senza ", Stagione 2", "- Parte 1" ecc. */
function cleanTitle(t, tv) {
  let s = String(t || '').replace(/\s+/g, ' ').trim();
  s = s.replace(/\s*[([]\s*(?:doppiato|sottotitolato|versione originale|v\.?o\.?(?:st)?|ita|4k(?: uhd)?|uhd|hd|extended(?: edition)?|director'?s cut)\s*[)\]]\s*$/i, '');
  if (tv) {
    s = s.replace(/(?:\s*[,:\-–—]\s*|\s+)(?:la\s+)?(?:serie\s+completa|stagion[ei]\s+\d+(?:\s*[-–e]\s*\d+)?|stagione\s+(?:uno|due|tre|quattro|cinque|sei|sette|otto|nove|dieci|unica|finale)|seasons?\s+\d+(?:\s*[-–]\s*\d+)?)\b.*$/i, '');
    s = s.replace(/\s*[,:\-–—]\s*(?:parte|part|vol\.?|volume|anno|capitolo)\s+\d+\b.*$/i, '');
  }
  return s.replace(/[\s,:\-–—]+$/, '').trim().slice(0, 120);
}
const uniqT = (a) => { const seen = new Set(); return a.filter((x) => { const k = x.t.toLowerCase(); if (!x.t || seen.has(k)) return false; seen.add(k); return true; }).slice(0, 50); };
async function trendItunes() {
  const get = async (feed, tv) => {
    const r = await fetch(`https://itunes.apple.com/it/rss/${feed}/limit=50/json`, { headers: { 'User-Agent': 'Mozilla/5.0 KairosPanel', Accept: 'application/json' }, signal: tmo() });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = JSON.parse(await r.text());
    let e = j && j.feed && j.feed.entry;
    if (!e) return [];
    if (!Array.isArray(e)) e = [e]; // con un solo risultato il feed restituisce un oggetto
    const lab = (x) => (x && typeof x.label === 'string' ? x.label : '');
    return e.map((x) => ({ t: cleanTitle(lab(x['im:name']) || lab(x.title), tv), y: yearOf(lab(x['im:releaseDate']) || (x['im:releaseDate'] && x['im:releaseDate'].attributes && x['im:releaseDate'].attributes.label)) }));
  };
  const [movies, series] = await Promise.all([get('topmovies', false).catch(() => []), get('toptvseasons', true).catch(() => [])]);
  return { movies: uniqT(movies), series: uniqT(series), src: 'itunes' };
}
async function trendTmdb(env) {
  const k = String(env.TMDB_KEY).trim(), bearer = k.length > 40; // token di lettura (v4) oppure chiave API (v3)
  const get = async (kind) => {
    const r = await fetch(`https://api.themoviedb.org/3/trending/${kind}/week?language=it-IT${bearer ? '' : '&api_key=' + encodeURIComponent(k)}`, { headers: { Accept: 'application/json', ...(bearer ? { Authorization: 'Bearer ' + k } : {}) }, signal: tmo() });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    return Array.isArray(j.results) ? j.results : [];
  };
  const [m, s] = await Promise.all([get('movie'), get('tv')]);
  return { movies: uniqT(m.map((x) => ({ t: cleanTitle(x.title || x.original_title, false), y: yearOf(x.release_date) }))), series: uniqT(s.map((x) => ({ t: cleanTitle(x.name || x.original_name, false), y: yearOf(x.first_air_date) }))), src: 'tmdb' };
}
/** non lancia mai errori: in caso di problemi restituisce l'ultima classifica salvata oppure liste vuote */
async function trending(env, ctx) {
  try {
    if (trMem.body && now() < trMem.exp) return trMem.body;
    let cached = null;
    try { const r = await env.DB.prepare('SELECT v FROM settings WHERE k = ?').bind('trend:it').first(); cached = r ? JSON.parse(r.v) : null; } catch {}
    if (cached && Array.isArray(cached.movies) && now() - (+cached.updated || 0) < TREND_TTL) { trMem = { exp: +cached.updated + TREND_TTL, body: cached }; return cached; }
    let fresh = env.TMDB_KEY ? await trendTmdb(env).catch(() => null) : null;
    if (!fresh || (!fresh.movies.length && !fresh.series.length)) fresh = await trendItunes().catch(() => null);
    if (fresh && (fresh.movies.length || fresh.series.length)) {
      const body = { movies: fresh.movies, series: fresh.series, src: fresh.src, updated: now() };
      const w = env.DB.prepare('INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind('trend:it', JSON.stringify(body)).run().catch(() => {});
      ctx && ctx.waitUntil ? ctx.waitUntil(w) : await w;
      trMem = { exp: now() + TREND_TTL, body };
      return body;
    }
    const body = cached && Array.isArray(cached.movies) ? cached : { movies: [], series: [], src: '', updated: 0 };
    trMem = { exp: now() + 15 * 60e3, body }; // sorgenti non raggiungibili: si riprova tra 15 minuti
    return body;
  } catch { return { movies: [], series: [], src: '', updated: 0 }; }
}

/* ====================================================================== */
/* Pagina pubblica /privacy (informativa + condizioni del servizio)        */
/* ====================================================================== */
const escH = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/* MODELLO PREDEFINITO: è un testo generico e non è una consulenza legale.
   Il fornitore deve farlo verificare da un professionista (avvocato / consulente privacy) e adattarlo
   (dati del titolare, prezzo, durata, recesso) dal pannello: Impostazioni → Privacy e condizioni.
   Segnaposto sostituiti al momento: {nome} {prezzo} {contatti} */
const PRIVACY_TEMPLATE = `# Informativa sulla privacy e condizioni del servizio

# 1. Chi fornisce il servizio
{nome} è un'app per guardare contenuti in streaming su TV, telefono e tablet. Il servizio ti viene fornito e attivato dal rivenditore da cui hai acquistato l'abbonamento (il "Fornitore"), che è il titolare del trattamento dei tuoi dati personali.
Contatti del Fornitore: {contatti}

# 2. Cosa fa l'app
L'app è un lettore: non contiene canali né contenuti propri. Riproduce soltanto le playlist che il Fornitore associa al tuo abbonamento oppure, se la funzione è attiva, quelle che aggiungi tu. Il Fornitore garantisce di avere i diritti necessari sui contenuti che distribuisce.

# 3. Quali dati trattiamo
- Il codice del dispositivo, generato a caso dall'app alla prima apertura, e un codice segreto che lega l'abbonamento al tuo dispositivo.
- Il modello del dispositivo (ad esempio "Fire TV Stick 4K").
- L'indirizzo IP e la data dell'ultimo collegamento, usati solo per la sicurezza e per bloccare gli abusi.
- Il nome e le note che il Fornitore inserisce per riconoscere il tuo abbonamento.
- I dati di accesso alle playlist (indirizzo, nome utente, password), conservati cifrati (AES-256).
- I profili personali che crei nell'app (nome, immagine, profilo bambini, playlist scelta) e l'elenco dei dispositivi collegati al tuo abbonamento.
- Le segnalazioni che invii volontariamente dall'app, con le informazioni tecniche utili a risolvere il problema.
Non raccogliamo posizione, rubrica, foto, microfono o fotocamera. L'app non contiene pubblicità e non registra sul server cosa guardi: preferiti, cronologia e PIN del controllo genitori restano solo sul tuo dispositivo.

# 4. Perché li trattiamo
- Per fornirti il servizio acquistato: attivare l'abbonamento, inviarti le playlist, gestire dispositivi collegati e profili (esecuzione del contratto, art. 6.1.b del Regolamento UE 2016/679, "GDPR").
- Per proteggere il servizio da accessi non autorizzati e abusi (legittimo interesse, art. 6.1.f GDPR).

# 5. Per quanto tempo
- Per tutta la durata dell'abbonamento; quando termina, il Fornitore può cancellare i dati del dispositivo.
- I dispositivi mai attivati vengono cancellati da soli dopo 30 giorni senza collegamenti.
- Il registro delle attività di sicurezza viene cancellato da solo dopo 90 giorni.

# 6. Con chi li condividiamo
I tuoi dati non vengono venduti, ceduti a terzi o usati per pubblicità o profilazione.
Sono conservati sull'infrastruttura di Cloudflare, Inc., che li tratta per conto del Fornitore come responsabile del trattamento, con garanzie adeguate per eventuali trasferimenti fuori dall'Unione Europea (clausole contrattuali standard ed EU-U.S. Data Privacy Framework).
Per mostrare loghi, locandine e calendari delle partite l'app può scaricare immagini da servizi pubblici: come per qualsiasi sito web, questi servizi vedono l'indirizzo IP del dispositivo. Se il Fornitore attiva la VPN, il traffico del dispositivo passa dal server VPN indicato dal Fornitore.

# 7. I tuoi diritti
Puoi chiedere in qualsiasi momento al Fornitore di accedere ai tuoi dati, correggerli, cancellarli, limitarne il trattamento, opporti al trattamento o riceverne una copia (artt. 15-22 GDPR). Puoi anche presentare reclamo al Garante per la protezione dei dati personali (www.garanteprivacy.it).

# 8. Condizioni del servizio
- Prezzo: {prezzo}. Durata, rinnovo e modalità di pagamento vengono concordati con il Fornitore.
- L'abbonamento è personale: il codice del dispositivo non può essere ceduto. Il numero di dispositivi e di profili utilizzabili dipende dall'abbonamento acquistato.
- Il Fornitore può sospendere il servizio in caso di uso illecito, condivisione non autorizzata o mancato pagamento.
- Il servizio dipende da reti e fornitori esterni: possono verificarsi interruzioni temporanee, che il Fornitore si impegna a risolvere nel più breve tempo possibile.
- Restano salvi i diritti riconosciuti al consumatore dal Codice del Consumo (D.Lgs. 206/2005). Si applica la legge italiana.

# 9. Modifiche
Questa informativa può essere aggiornata: la versione valida è sempre quella pubblicata in questa pagina.`;
const privacyVars = (t, s) => String(t)
  .replace(/\{nome\}/g, s.brand || 'KAIROS')
  .replace(/\{prezzo\}/g, s.price || 'indicato dal Fornitore al momento dell\'acquisto')
  .replace(/\{contatti\}/g, s.supportContact || 'chiedi al rivenditore che ti ha attivato l\'app');
/** testo semplice → HTML sicuro: "# " titolo, "- " elenco, riga vuota = nuovo paragrafo */
function textToHtml(t) {
  const out = []; let para = [], list = [];
  const endPara = () => { if (para.length) out.push('<p>' + para.map(escH).join('<br>') + '</p>'); para = []; };
  const endList = () => { if (list.length) out.push('<ul>' + list.map((l) => '<li>' + escH(l) + '</li>').join('') + '</ul>'); list = []; };
  for (const raw of String(t).replace(/\r\n?/g, '\n').split('\n')) {
    const l = raw.trim();
    if (!l) { endPara(); endList(); }
    else if (/^#{1,3}\s+/.test(l)) { endPara(); endList(); out.push('<h2>' + escH(l.replace(/^#{1,3}\s+/, '')) + '</h2>'); }
    else if (/^[-•*]\s+/.test(l)) { endPara(); list.push(l.replace(/^[-•*]\s+/, '')); }
    else { endList(); para.push(l); }
  }
  endPara(); endList();
  return out.join('\n');
}
async function privacyPage(env) {
  const s = await getSettings(env);
  const custom = typeof s.privacy === 'string' ? s.privacy.trim() : '';
  const brand = escH(s.brand || 'KAIROS');
  const bodyHtml = textToHtml(privacyVars(custom || PRIVACY_TEMPLATE, s)).replace(/^<h2>/, '<h1>').replace(/^(<h1>.*?)<\/h2>/, '$1</h1>');
  const html = `<!DOCTYPE html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="dark">
<title>Privacy e condizioni · ${brand}</title>
<style>
:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#07080f;color:#e9ecf8;font:16px/1.65 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:820px;margin:0 auto;padding:36px 22px 60px}header{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap;border-bottom:1px solid #ffffff1a;padding-bottom:18px;margin-bottom:8px}
header b{font-weight:900;letter-spacing:.22em;font-size:20px;color:#ff3b45}header span{color:#9aa1c0}
h1{font-size:28px;line-height:1.25;margin:26px 0 10px}h2{font-size:19px;margin:30px 0 8px;color:#fff}p,li{color:#c9cee6}ul{padding-left:22px}
.box{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-top:34px}.box div{padding:16px 18px;border-radius:14px;background:#ffffff0d;border:1px solid #ffffff1a}
.box small{display:block;color:#9aa1c0;font-size:12px;letter-spacing:.12em;text-transform:uppercase}.box b{font-size:17px}footer{margin-top:34px;color:#6f7697;font-size:13px}
</style></head><body><main>
<header><b>${brand}</b><span>Privacy e condizioni del servizio</span></header>
${custom ? '' : '<!-- Testo predefinito: modello generico da far verificare a un professionista (pannello → Impostazioni → Privacy e condizioni) -->'}
<article>${bodyHtml}</article>
<section class="box"><div><small>Prezzo</small><b>${escH(s.price || '—')}</b></div><div><small>Contatti</small><b>${escH(s.supportContact || 'il tuo rivenditore')}</b></div></section>
<footer>© ${new Date().getUTCFullYear()} ${brand}</footer>
</main></body></html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300' } });
}

/* ====================================================================== */
/* Router                                                                 */
/* ====================================================================== */
async function route(req, env, ctx) {
  const url = new URL(req.url);
  const path = url.pathname;
  const ip = ipOf(req);

  if (path === '/' || path === '/panel') return Response.redirect(url.origin + '/panel/', 302);

  /* ---------- API app (pubblica) ---------- */
  if (path.startsWith('/api/player/')) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204 });
    if (path === '/api/player/register' && req.method === 'POST') return playerRegister(req, env, ip, ctx);
    if (path === '/api/player/report' && req.method === 'POST') return playerReport(req, env, ip, ctx);
    if (path === '/api/player/profiles' && req.method === 'POST') return playerProfiles(req, env, ip, ctx);
    if (path === '/api/player/linkcode' && req.method === 'POST') return playerLinkCode(req, env, ip, ctx);
    if (path === '/api/player/link' && req.method === 'POST') return playerLink(req, env, ip, ctx);
    if (path === '/api/player/trending' && req.method === 'GET') {
      if (await limited(env.RL_DEVICE, 'tr:' + ip)) return json({ movies: [], series: [], src: '', updated: 0 }, 429);
      return json(await trending(env, ctx));
    }
    if (path === '/api/player/ping' && req.method === 'GET') return json({ ok: true, service: 'kairos', time: now() });
    if (path === '/api/player/events' && req.method === 'GET') {
      if (await limited(env.RL_DEVICE, 'ev:' + ip)) return json({ events: [] }, 429);
      return json(await footballEvents(env, ctx));
    }
    if (path === '/api/player/update' && req.method === 'GET') {
      if (await limited(env.RL_DEVICE, 'up:' + ip)) return json({ ui: null, apk: null }, 429);
      const s = await getSettings(env);
      return json({
        ui: env.UI_VERSION ? { version: env.UI_VERSION, url: '/app/index.html' } : null,
        apk: await latestApk(env, s),
      }, 200, { 'Cache-Control': 'no-store' });
    }
    return json({ error: 'Non trovato' }, 404);
  }

  /* ---------- autorizzazione dei download dello Store (pubblica, vedi store.js) ---------- */
  if (path.startsWith('/api/store/')) return storeApi(req, env, ctx, url, ip);

  /* ---------- informativa privacy e condizioni (pubblica, la apre anche l'app) ---------- */
  if ((path === '/privacy' || path === '/privacy/') && (req.method === 'GET' || req.method === 'HEAD')) return privacyPage(env);

  /* ---------- config pubblica del pannello ---------- */
  if (path === '/api/public/config' && req.method === 'GET') {
    if (!(await verifyAccess(req, env))) return json({ error: 'Accesso negato' }, 403);
    return json({ turnstileSiteKey: env.TURNSTILE_SITEKEY || '' });
  }

  /* ---------- API pannello ---------- */
  if (path.startsWith('/api/admin/')) {
    if (!(await verifyAccess(req, env))) return json({ error: 'Accesso negato (Cloudflare Access)' }, 403);
    try { return await admin(req, env, url, ip, ctx); }
    catch (e) { if (e instanceof HttpErr) return json({ error: e.message }, e.status); throw e; }
  }

  /* ---------- interfaccia dell'app per l'aggiornamento automatico ---------- */
  if (path.startsWith('/app/')) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('Metodo non consentito', { status: 405 });
    return env.ASSETS.fetch(req);
  }

  /* ---------- pannello (asset) ---------- */
  if (path.startsWith('/panel/')) {
    if (!(await verifyAccess(req, env))) return new Response('Accesso negato', { status: 403 });
    if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('Metodo non consentito', { status: 405 });
    return env.ASSETS.fetch(req);
  }

  return new Response('Non trovato', { status: 404 });
}

/* ---------------- app: registrazione / sync ---------------- */
async function playerRegister(req, env, ip, ctx) {
  if (await limited(env.RL_DEVICE, 'dev:' + ip)) return json({ error: 'Troppe richieste, riprova tra poco' }, 429);
  let b;
  try { b = await readJSON(req, 4096); } catch (e) { return json({ error: e.message }, e.status || 400); }
  const code = str(b.code, 20).toUpperCase();
  const secret = str(b.secret, 100);
  if (!CODE_RE.test(code)) return json({ error: 'Codice non valido' }, 400);
  if (!/^[A-Za-z0-9_-]{32,100}$/.test(secret)) return json({ error: 'Segreto non valido' }, 400);
  const sh = await sha256('dev:' + secret);
  const model = str(b.model, 80);

  let d = await env.DB.prepare('SELECT * FROM devices WHERE code = ?').bind(code).first();
  if (!d) {
    if (await limited(env.RL_DEVICE, 'new:' + ip)) return json({ error: 'Troppe richieste' }, 429);
    const PENDING_SQL = "FROM devices WHERE active = 0 AND playlists = '' AND parent = '' AND name = '' AND notes = ''";
    let pending = await env.DB.prepare('SELECT COUNT(*) AS n ' + PENDING_SQL).first();
    if (pending && pending.n >= MAX_PENDING) {
      // pieno (anche per colpa di chi registra codici a raffica): si fa posto togliendo i "in attesa" non più visti da 2 ore.
      // Un'app vera che mostra il codice si ricollega ogni pochi secondi, quindi non viene toccata.
      await env.DB.prepare('DELETE ' + PENDING_SQL + ' AND last_seen < ?').bind(now() - 2 * 3600e3).run();
      pending = await env.DB.prepare('SELECT COUNT(*) AS n ' + PENDING_SQL).first();
      if (pending && pending.n >= MAX_PENDING) return json({ error: 'Registrazioni temporaneamente sospese' }, 503);
    }
    d = { id: b64url(rand(9)), code, secret_hash: sh, name: '', model, notes: '', active: 0, expires: '', playlists: '', created_at: now(), last_seen: now(), last_ip: ip };
    await env.DB.prepare('INSERT INTO devices (id, code, secret_hash, model, created_at, last_seen, last_ip) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(d.id, code, sh, model, d.created_at, d.last_seen, ip).run();
    ctx.waitUntil(log(env, 'new', `Nuovo dispositivo in attesa: ${code}${model ? ' (' + model + ')' : ''}`, ip));
  } else if (!d.secret_hash) {
    // dispositivo creato dal pannello: il primo che si presenta col codice lo "lega" al proprio segreto
    await env.DB.prepare('UPDATE devices SET secret_hash = ? WHERE id = ? AND secret_hash = ?').bind(sh, d.id, '').run();
    d.secret_hash = sh;
    ctx.waitUntil(log(env, 'edit', `Dispositivo collegato: ${d.name || code}`, ip));
  } else if (!safeEq(d.secret_hash, sh)) {
    ctx.waitUntil(log(env, 'off', `Tentativo con codice già in uso: ${code}`, ip));
    return json({ status: 'locked' }, 403);
  }

  ctx.waitUntil(env.DB.prepare('UPDATE devices SET last_seen = ?, last_ip = ?, model = CASE WHEN ? <> \'\' THEN ? ELSE model END WHERE id = ?')
    .bind(now(), ip, model, model, d.id).run());

  // un dispositivo collegato usa stato, scadenza, playlist, profili e limiti del suo principale
  const P = await primaryOf(env, d);
  const pls = P ? await unseal(env, P.playlists).catch(() => []) : [];
  const status = P ? statusOf(P, pls) : 'pending';
  const s = await getSettings(env);
  const out = { status, name: P ? P.name : '', expires: P ? P.expires : '', settings: publicSettings(s), playlists: status === 'active' ? pls : [], messages: await deviceMessages(env, d.id, P && P.id) };
  if (status === 'active') {
    out.account = await accountOf(env, P, d, pls);
    out.vpn = await vpnOf(env, P, d);
  }
  return json(out);
}
/* messaggi del fornitore per questo dispositivo (tutti + personali + quelli del cliente principale, non scaduti) */
async function deviceMessages(env, id, pid) {
  try {
    const r = await env.DB.prepare('SELECT id, title, body, level, created FROM messages WHERE (target = ? OR target = ? OR target = ?) AND (until = 0 OR until > ?) ORDER BY id DESC LIMIT 10').bind('all', id, pid || id, now()).all();
    return r.results || [];
  } catch { return []; } // tabella non ancora creata
}
/* "Segnala un problema" dall'app: finisce nell'attività del pannello */
async function playerReport(req, env, ip, ctx) {
  if (await limited(env.RL_DEVICE, 'rep:' + ip)) return json({ error: 'Troppe segnalazioni, riprova più tardi' }, 429);
  let b;
  try { b = await readJSON(req, 8192); } catch (e) { return json({ error: e.message }, e.status || 400); }
  const code = str(b.code, 20).toUpperCase(), secret = str(b.secret, 100);
  if (!CODE_RE.test(code) || !/^[A-Za-z0-9_-]{32,100}$/.test(secret)) return json({ error: 'Dati non validi' }, 400);
  const d = await env.DB.prepare('SELECT id, name, secret_hash FROM devices WHERE code = ?').bind(code).first();
  if (!d || !d.secret_hash || !safeEq(d.secret_hash, await sha256('dev:' + secret))) return json({ error: 'Dispositivo non riconosciuto' }, 403);
  const kind = str(b.kind, 40), text = str(b.text, 400), info = str(b.info, 400);
  ctx.waitUntil(log(env, 'report', `Segnalazione da ${d.name || code} · ${kind}${text ? ': ' + text : ''}${info ? ' [' + info + ']' : ''}`, ip));
  return json({ ok: true });
}

/* ---------------- pannello ---------------- */
function cookieOf(req) { return (req.headers.get('Cookie') || '').match(new RegExp('(?:^|;\\s*)' + COOKIE.replace(/[-$]/g, '\\$&') + '=([^;]+)'))?.[1] || ''; }
async function getSession(req, env) {
  const tok = cookieOf(req);
  if (!tok) return null;
  const id = await sha256('ses:' + tok);
  const s = await env.DB.prepare('SELECT s.id, s.expires, a.id AS admin_id, a.username, a.totp_on FROM sessions s JOIN admins a ON a.id = s.admin_id WHERE s.id = ?').bind(id).first();
  if (!s || s.expires < now()) return null;
  return s;
}
const setCookie = (tok, maxAge) => `${COOKIE}=${tok}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`;

async function admin(req, env, url, ip, ctx) {
  const path = url.pathname.slice('/api/admin'.length);
  const m = req.method;

  /* protezione CSRF per tutte le richieste che modificano dati */
  if (m !== 'GET' && m !== 'HEAD') {
    const origin = req.headers.get('Origin');
    const site = req.headers.get('Sec-Fetch-Site');
    if (req.headers.get('X-Kairos') !== '1') throw new HttpErr(403, 'Richiesta non valida');
    if (origin && origin !== url.origin) throw new HttpErr(403, 'Origine non valida');
    if (site && !['same-origin', 'none'].includes(site)) throw new HttpErr(403, 'Origine non valida');
  }

  if (path === '/login' && m === 'POST') return login(req, env, ip, ctx);

  const ses = await getSession(req, env);
  if (!ses) throw new HttpErr(401, 'Sessione scaduta');
  const who = ses.username;
  if (path === '/store' || path.startsWith('/store/')) return storeAdmin(req, env, path, who, ip); // Download store

  if (path === '/logout' && m === 'POST') {
    await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(ses.id).run();
    return json({ ok: true }, 200, { 'Set-Cookie': setCookie('', 0) });
  }
  if (path === '/logout-all' && m === 'POST') {
    await env.DB.prepare('DELETE FROM sessions WHERE admin_id = ? AND id <> ?').bind(ses.admin_id, ses.id).run();
    await log(env, 'auth', `${who}: chiuse tutte le altre sessioni`, ip);
    return json({ ok: true });
  }

  if (path === '/state' && m === 'GET') {
    const rows = (await env.DB.prepare('SELECT * FROM devices ORDER BY created_at DESC LIMIT 5000').all()).results || [];
    const devices = [];
    for (const d of rows) {
      const pls = await unseal(env, d.playlists).catch(() => []);
      // le configurazioni WireGuard non tornano mai al pannello: solo "configurata sì/no"
      devices.push({ id: d.id, code: d.code, name: d.name, model: d.model, notes: d.notes, active: !!d.active, expires: d.expires, playlists: pls, createdAt: d.created_at, lastSeen: d.last_seen, lastIp: d.last_ip, bound: !!d.secret_hash, status: statusOf(d, pls),
        parent: d.parent || '', maxConn: d.max_conn ?? 1, maxProfiles: d.max_profiles ?? 3, profiles: readProfiles(d, pls.map((p) => p.id)), lockProfiles: !!d.lock_profiles, vpn: +d.vpn || 0, vpnConf: !!d.vpn_conf });
    }
    const byId = new Map(devices.map((x) => [x.id, x]));
    for (const x of devices) if (x.parent) { const p = byId.get(x.parent); x.status = p && !p.parent ? p.status : 'pending'; }
    const activity = ((await env.DB.prepare('SELECT t, type, text, ip FROM activity ORDER BY id DESC LIMIT 200').all()).results) || [];
    let messages = [];
    try { messages = ((await env.DB.prepare('SELECT id, target, title, body, level, created, until FROM messages ORDER BY id DESC LIMIT 100').all()).results) || []; } catch {}
    const sessions = (await env.DB.prepare('SELECT COUNT(*) AS n FROM sessions WHERE admin_id = ? AND expires > ?').bind(ses.admin_id, now()).first()).n;
    return json({
      settings: await getSettings(env), devices, activity, messages, user: who, apk: await latestApk(env, await getSettings(env)), apkFeed: await apkFeed(env),
      wgConf: !!(await env.DB.prepare('SELECT 1 AS x FROM settings WHERE k = ?').bind('wg').first()),
      security: { totp: !!ses.totp_on, encryption: !!env.ENC_KEY, access: !!(env.ACCESS_AUD && env.ACCESS_TEAM_DOMAIN), turnstile: !!env.TURNSTILE_SECRET, sessions },
    });
  }

  if (path === '/messages' && m === 'POST') {
    const b = await readJSON(req);
    const title = str(b.title, 80), body = str(b.body, 600);
    if (!title && !body) throw new HttpErr(400, 'Scrivi il titolo o il testo del messaggio');
    let target = str(b.target, 20) || 'all';
    if (target !== 'all' && !(await env.DB.prepare('SELECT id FROM devices WHERE id = ?').bind(target).first())) throw new HttpErr(400, 'Dispositivo non trovato');
    const level = ['info', 'warn', 'urgent'].includes(b.level) ? b.level : 'info';
    const days = Math.max(0, Math.min(365, +b.days || 0));
    await env.DB.prepare('INSERT INTO messages (target, title, body, level, created, until) VALUES (?, ?, ?, ?, ?, ?)').bind(target, title, body, level, now(), days ? now() + days * 864e5 : 0).run();
    await log(env, 'msg', `${who}: messaggio inviato a ${target === 'all' ? 'tutti' : 'un dispositivo'} · ${title || body.slice(0, 40)}`, ip);
    return json({ ok: true });
  }
  const mm = path.match(/^\/messages\/(\d{1,10})$/);
  if (mm && m === 'DELETE') {
    await env.DB.prepare('DELETE FROM messages WHERE id = ?').bind(+mm[1]).run();
    return json({ ok: true });
  }

  if (path === '/settings' && m === 'PUT') {
    const b = await readJSON(req);
    const s = await getSettings(env);
    for (const k of ['brand', 'tagline', 'accent', 'announcement', 'supportContact', 'downloaderCode']) if (typeof b[k] === 'string') s[k] = str(b[k], k === 'announcement' ? 300 : 80);
    if (typeof b.apkUrl === 'string') { const u = str(b.apkUrl, 500); s.apkUrl = !u || /^https:\/\//.test(u) ? u : s.apkUrl; }
    if (typeof b.allowLocalPlaylists === 'boolean') s.allowLocalPlaylists = b.allowLocalPlaylists;
    if (typeof b.showFootball === 'boolean') s.showFootball = b.showFootball;
    if (b.apkVersionCode !== undefined) {
      // si scrive la versione pubblicata, es. "1.3.0" (→ 10300, lo stesso numero che calcola la build su GitHub)
      const v = String(b.apkVersionCode).trim().replace(/^v/i, '');
      const code = semverCode(v);
      if (!v) { s.apkVersionCode = 0; s.apkVersion = ''; }
      else if (code) { s.apkVersionCode = code; s.apkVersion = v; }
      else throw new HttpErr(400, 'Versione APK non valida: scrivila come 1.3.0');
    }
    if (typeof b.price === 'string') s.price = nameClean(b.price, 60);
    if (typeof b.privacy === 'string') {
      const p = b.privacy.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim();
      if (p.length > 10000) throw new HttpErr(400, 'Il testo della privacy è troppo lungo (massimo 10.000 caratteri)');
      s.privacy = p;
    }
    // VPN: la configurazione WireGuard generale è salvata cifrata a parte e non viene mai rimandata al pannello
    if (b.wgClear === true) await env.DB.prepare('DELETE FROM settings WHERE k = ?').bind('wg').run();
    else if (typeof b.wgConf === 'string' && b.wgConf.trim()) {
      await env.DB.prepare('INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind('wg', await seal(env, cleanWg(b.wgConf))).run();
      await log(env, 'settings', `${who}: configurazione VPN aggiornata`, ip);
    }
    if (typeof b.serverUrl === 'string') {
      const u = str(b.serverUrl, 300).replace(/\/+$/, '').replace(/\/panel$/i, '');
      if (!u) s.serverUrl = '';
      else if (/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(u)) s.serverUrl = u;
      else throw new HttpErr(400, 'Indirizzo server non valido: usa https://dominio (senza percorsi)');
    }
    await env.DB.prepare('INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind('app', JSON.stringify(s)).run();
    await log(env, 'settings', `${who}: impostazioni aggiornate`, ip);
    return json({ settings: s });
  }

  if (path === '/password' && m === 'PUT') {
    const b = await readJSON(req);
    const a = await env.DB.prepare('SELECT * FROM admins WHERE id = ?').bind(ses.admin_id).first();
    if (!(await checkPass(str(b.current, 200), a.pass_hash))) throw new HttpErr(400, 'Password attuale errata');
    const next = typeof b.next === 'string' ? b.next : '';
    if (next.length < 10) throw new HttpErr(400, 'La nuova password deve avere almeno 10 caratteri');
    // il login legge al massimo 200 caratteri: una password più lunga renderebbe impossibile accedere
    if (next.length > 200) throw new HttpErr(400, 'La nuova password può avere al massimo 200 caratteri');
    const user = str(b.user, 40) || a.username;
    if (!/^[A-Za-z0-9._@-]{3,40}$/.test(user)) throw new HttpErr(400, 'Nome utente non valido');
    await env.DB.prepare('UPDATE admins SET username = ?, pass_hash = ? WHERE id = ?').bind(user, await hashPass(next), a.id).run();
    await env.DB.prepare('DELETE FROM sessions WHERE admin_id = ? AND id <> ?').bind(a.id, ses.id).run();
    await log(env, 'auth', `${user}: credenziali aggiornate`, ip);
    return json({ ok: true });
  }

  if (path === '/totp/setup' && m === 'POST') {
    if (ses.totp_on) throw new HttpErr(400, '2FA già attiva');
    const secret = b32enc(rand(20));
    await env.DB.prepare('UPDATE admins SET totp_secret = ? WHERE id = ?').bind(secret, ses.admin_id).run();
    const s = await getSettings(env);
    const label = encodeURIComponent(`${s.brand || 'KAIROS'}:${who}`);
    return json({ secret, uri: `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(s.brand || 'KAIROS')}&digits=6&period=30` });
  }
  if (path === '/totp/enable' && m === 'POST') {
    const b = await readJSON(req);
    const a = await env.DB.prepare('SELECT * FROM admins WHERE id = ?').bind(ses.admin_id).first();
    if (!a.totp_secret) throw new HttpErr(400, 'Genera prima il codice segreto');
    const ctr = await checkTotp(a.totp_secret, b.code, a.totp_last);
    if (ctr < 0) throw new HttpErr(400, 'Codice non valido');
    await env.DB.prepare('UPDATE admins SET totp_on = 1, totp_last = ? WHERE id = ?').bind(ctr, a.id).run();
    await log(env, 'auth', `${who}: verifica in due passaggi attivata`, ip);
    return json({ ok: true });
  }
  if (path === '/totp/disable' && m === 'POST') {
    const b = await readJSON(req);
    const a = await env.DB.prepare('SELECT * FROM admins WHERE id = ?').bind(ses.admin_id).first();
    if (!(await checkPass(str(b.password, 200), a.pass_hash))) throw new HttpErr(400, 'Password errata');
    const ctr = await checkTotp(a.totp_secret, b.code, a.totp_last);
    if (ctr < 0) throw new HttpErr(400, 'Codice non valido');
    await env.DB.prepare('UPDATE admins SET totp_on = 0, totp_secret = ?, totp_last = 0 WHERE id = ?').bind('', a.id).run();
    await log(env, 'auth', `${who}: verifica in due passaggi disattivata`, ip);
    return json({ ok: true });
  }

  if (path === '/devices' && m === 'POST') {
    const b = await readJSON(req);
    let code = str(b.code, 20).toUpperCase();
    if (!code) { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', r = rand(6); const c = [...r].map((x) => A[x % A.length]); code = `KX${c[0]}${c[1]}-${c[2]}${c[3]}${c[4]}${c[5]}`; }
    if (!CODE_RE.test(code)) throw new HttpErr(400, 'Formato codice non valido (es. KXAB-12CD)');
    if (await env.DB.prepare('SELECT 1 FROM devices WHERE code = ?').bind(code).first()) throw new HttpErr(400, 'Codice già esistente');
    if (!DATE_RE.test(str(b.expires, 10))) throw new HttpErr(400, 'Data non valida');
    const id = b64url(rand(9));
    const pls = cleanPlaylists(b.playlists);
    const acc = await accountFields(env, b, {}, pls);
    await env.DB.prepare('INSERT INTO devices (id, code, name, notes, active, expires, playlists, created_at, max_conn, max_profiles, profiles, lock_profiles, vpn, vpn_conf) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, code, str(b.name, 60), str(b.notes, 500), b.active ? 1 : 0, str(b.expires, 10), await seal(env, pls), now(), acc.max_conn, acc.max_profiles, acc.profiles, acc.lock_profiles, acc.vpn, acc.vpn_conf).run();
    await log(env, 'new', `${who}: creato dispositivo ${str(b.name, 60) || code}`, ip);
    return json({ ok: true, id, code });
  }

  if (path === '/privacy-template' && m === 'GET') return json({ text: PRIVACY_TEMPLATE });

  const dm = path.match(/^\/devices\/([A-Za-z0-9_-]{6,20})(\/reset|\/link|\/unlink)?$/);
  if (dm) {
    const d = await env.DB.prepare('SELECT * FROM devices WHERE id = ?').bind(dm[1]).first();
    if (!d) throw new HttpErr(404, 'Dispositivo non trovato');
    const label = d.name || d.code;
    if (dm[2] === '/reset' && m === 'POST') {
      await env.DB.prepare('UPDATE devices SET secret_hash = ? WHERE id = ?').bind('', d.id).run();
      await log(env, 'edit', `${who}: sbloccato il collegamento di ${label}`, ip);
      return json({ ok: true });
    }
    if (dm[2] === '/unlink' && m === 'POST') {
      if (!d.parent) throw new HttpErr(400, 'Il dispositivo non è collegato a nessun cliente');
      const P = await env.DB.prepare('SELECT name, code FROM devices WHERE id = ?').bind(d.parent).first();
      await unlinkStmt(env, d.id).run();
      await log(env, 'off', `${who}: scollegato ${label} da ${P ? P.name || P.code : 'un cliente'} (torna in attesa)`, ip);
      return json({ ok: true });
    }
    if (dm[2] === '/link' && m === 'POST') {
      const b = await readJSON(req, 1024);
      const P = await env.DB.prepare('SELECT * FROM devices WHERE id = ?').bind(str(b.primary, 20)).first();
      if (!P || P.parent || P.id === d.id) throw new HttpErr(400, 'Cliente principale non valido');
      if (d.parent) throw new HttpErr(400, 'Il dispositivo è già collegato a un cliente: scollegalo prima');
      if (d.active || (await unseal(env, d.playlists).catch(() => [])).length) throw new HttpErr(400, 'Il dispositivo ha già un abbonamento suo: disattivalo e togli le playlist prima di collegarlo');
      if ((await connCount(env, d)) > 1) throw new HttpErr(400, 'Il dispositivo ha già altre connessioni collegate');
      if (statusOf(P, await unseal(env, P.playlists).catch(() => [])) === 'pending') throw new HttpErr(400, 'Il cliente scelto non ha ancora un abbonamento');
      const used = await connCount(env, P), max = P.max_conn ?? 1;
      if (used >= max) throw new HttpErr(400, `Connessioni esaurite (${used} di ${max}): aumenta "Connessioni massime" del cliente`);
      await env.DB.prepare("UPDATE devices SET parent = ?, active = 0, expires = '', playlists = '', profiles = '' WHERE id = ? AND parent = ''").bind(P.id, d.id).run();
      await log(env, 'on', `${who}: ${label} collegato come connessione di ${P.name || P.code} (${used + 1} di ${max})`, ip);
      return json({ ok: true });
    }
    if (m === 'PUT' && d.parent) {
      // connessione di un altro cliente: abbonamento, playlist, profili e limiti si cambiano dal principale
      const b = await readJSON(req);
      if (['active', 'expires', 'playlists', 'profiles', 'maxConn', 'maxProfiles', 'lockProfiles', 'vpn'].some((k) => b[k] !== undefined)) throw new HttpErr(400, 'Questo dispositivo è una connessione di un altro cliente: abbonamento, playlist e profili si modificano dal cliente principale');
      const acc = await accountFields(env, { vpnConf: b.vpnConf, vpnConfClear: b.vpnConfClear }, d, []);
      await env.DB.prepare('UPDATE devices SET name = ?, notes = ?, vpn_conf = ? WHERE id = ?')
        .bind(typeof b.name === 'string' ? str(b.name, 60) : d.name, typeof b.notes === 'string' ? str(b.notes, 500) : d.notes, acc.vpn_conf, d.id).run();
      await log(env, 'edit', `${who}: modificato ${str(b.name, 60) || label}`, ip);
      return json({ ok: true });
    }
    if (m === 'PUT') {
      const b = await readJSON(req);
      const before = statusOf(d, await unseal(env, d.playlists).catch(() => []));
      const name = typeof b.name === 'string' ? str(b.name, 60) : d.name;
      const notes = typeof b.notes === 'string' ? str(b.notes, 500) : d.notes;
      const expires = typeof b.expires === 'string' ? str(b.expires, 10) : d.expires;
      if (!DATE_RE.test(expires)) throw new HttpErr(400, 'Data non valida');
      const active = typeof b.active === 'boolean' ? (b.active ? 1 : 0) : d.active;
      const pls = b.playlists ? cleanPlaylists(b.playlists) : await unseal(env, d.playlists).catch(() => []);
      const acc = await accountFields(env, b, d, pls);
      const used = await connCount(env, d);
      if (acc.max_conn < used) throw new HttpErr(400, `Su questo abbonamento ci sono già ${used} dispositivi: scollegane qualcuno prima di ridurre le connessioni`);
      await env.DB.prepare('UPDATE devices SET name = ?, notes = ?, expires = ?, active = ?, playlists = ?, max_conn = ?, max_profiles = ?, profiles = ?, lock_profiles = ?, vpn = ?, vpn_conf = ? WHERE id = ?')
        .bind(name, notes, expires, active, await seal(env, pls), acc.max_conn, acc.max_profiles, acc.profiles, acc.lock_profiles, acc.vpn, acc.vpn_conf, d.id).run();
      const after = statusOf({ active, expires }, pls);
      await log(env, before !== after ? (after === 'active' ? 'on' : 'off') : 'edit', before !== after ? `${who}: ${name || d.code} ${before} → ${after}` : `${who}: modificato ${name || d.code}`, ip);
      return json({ ok: true });
    }
    if (m === 'DELETE') {
      // eliminando un cliente principale le sue connessioni tornano "in attesa" (non restano agganciate al nulla)
      const kids = d.parent ? [] : await linkedOf(env, d.id);
      await env.DB.batch([...kids.map((k) => unlinkStmt(env, k.id)), env.DB.prepare('DELETE FROM devices WHERE id = ?').bind(d.id), env.DB.prepare('DELETE FROM link_pins WHERE device_id = ?').bind(d.id)]);
      await log(env, 'del', `${who}: eliminato ${label}${kids.length ? ` (${kids.length} connessioni tornate in attesa)` : ''}`, ip);
      return json({ ok: true });
    }
  }
  throw new HttpErr(404, 'Endpoint sconosciuto');
}
/** campi "account" inviati dal pannello: connessioni, profili, VPN (cur = valori attuali del dispositivo) */
async function accountFields(env, b, cur, pls) {
  const o = { max_conn: cur.max_conn ?? 1, max_profiles: cur.max_profiles ?? 3, lock_profiles: cur.lock_profiles ? 1 : 0, vpn: +cur.vpn || 0, vpn_conf: cur.vpn_conf || '', profiles: cur.profiles || '' };
  if (b.maxConn !== undefined) o.max_conn = intIn(b.maxConn, 1, MAX_CONN, 'Connessioni massime');
  if (b.maxProfiles !== undefined) o.max_profiles = intIn(b.maxProfiles, 0, MAX_PROFILES, 'Profili massimi');
  if (typeof b.lockProfiles === 'boolean') o.lock_profiles = b.lockProfiles ? 1 : 0;
  if (b.vpn !== undefined) { const v = Number(b.vpn); if (![0, 1, 2].includes(v)) throw new HttpErr(400, 'Modalità VPN non valida'); o.vpn = v; }
  if (b.vpnConfClear === true) o.vpn_conf = '';
  else if (typeof b.vpnConf === 'string' && b.vpnConf.trim()) o.vpn_conf = await seal(env, cleanWg(b.vpnConf));
  const plIds = pls.map((p) => p.id);
  if (b.profiles !== undefined) o.profiles = JSON.stringify(cleanProfiles(b.profiles, o.max_profiles, plIds));
  else if (o.profiles && o.max_profiles < (cur.max_profiles ?? 3)) o.profiles = JSON.stringify(readProfiles({ profiles: o.profiles, max_profiles: o.max_profiles }, plIds));
  return o;
}

async function login(req, env, ip, ctx) {
  if (await limited(env.RL_LOGIN, 'login:' + ip)) throw new HttpErr(429, 'Troppi tentativi, attendi un minuto');
  const fail = await env.DB.prepare('SELECT * FROM login_fail WHERE ip = ?').bind(ip).first();
  if (fail && fail.until > now()) throw new HttpErr(429, `Accesso bloccato per sicurezza. Riprova tra ${Math.ceil((fail.until - now()) / 60000)} minuti`);

  const b = await readJSON(req, 8192);
  if (!(await verifyTurnstile(env, str(b.turnstile, 4096), ip))) throw new HttpErr(400, 'Verifica anti-bot non superata, riprova');
  const user = str(b.user, 40), pass = typeof b.pass === 'string' ? b.pass.slice(0, 200) : '';

  // primo avvio: crea l'amministratore con la password di bootstrap (segreto del Worker)
  const count = (await env.DB.prepare('SELECT COUNT(*) AS n FROM admins').first()).n;
  if (!count) {
    if (!env.ADMIN_BOOTSTRAP_PASS || env.ADMIN_BOOTSTRAP_PASS.length < 10) throw new HttpErr(503, 'Imposta il segreto ADMIN_BOOTSTRAP_PASS (min 10 caratteri) sul Worker');
    if (user === 'admin' && safeEq(pass, env.ADMIN_BOOTSTRAP_PASS)) {
      await env.DB.prepare('INSERT INTO admins (username, pass_hash, created_at) VALUES (?, ?, ?)').bind('admin', await hashPass(pass), now()).run();
      await log(env, 'auth', 'Amministratore creato al primo accesso', ip);
    }
  }

  const a = await env.DB.prepare('SELECT * FROM admins WHERE username = ?').bind(user).first();
  // calcola comunque un hash per non rivelare se l'utente esiste (timing)
  const ok = a ? await checkPass(pass, a.pass_hash) : (await hashPass(pass), false);
  // errori di password E di codice 2FA contano insieme: dopo 5 l'IP resta bloccato 15 minuti
  const strike = async () => {
    const c = (fail && fail.until <= now() && now() - fail.updated > 3600e3 ? 0 : (fail ? fail.count : 0)) + 1;
    const until = c >= 5 ? now() + 15 * 60e3 : 0;
    await env.DB.prepare('INSERT INTO login_fail (ip, count, until, updated) VALUES (?, ?, ?, ?) ON CONFLICT(ip) DO UPDATE SET count = excluded.count, until = excluded.until, updated = excluded.updated')
      .bind(ip, until ? 0 : c, until, now()).run();
    return until ? ' — IP bloccato 15 min' : '';
  };
  if (!ok) {
    const blocked = await strike();
    await log(env, 'off', `Accesso fallito per "${user.slice(0, 30)}"${blocked}`, ip);
    throw new HttpErr(401, 'Credenziali errate');
  }
  if (a.totp_on) {
    if (!b.totp) return json({ needTotp: true }, 200);
    const ctr = await checkTotp(a.totp_secret, b.totp, a.totp_last);
    if (ctr < 0) {
      const blocked = await strike();
      await log(env, 'off', `Codice 2FA errato per ${a.username}${blocked}`, ip);
      throw new HttpErr(401, 'Codice di verifica errato');
    }
    await env.DB.prepare('UPDATE admins SET totp_last = ? WHERE id = ?').bind(ctr, a.id).run();
  }
  await env.DB.prepare('DELETE FROM login_fail WHERE ip = ?').bind(ip).run();
  // un eventuale cookie di sessione già presente viene invalidato: a ogni accesso un token nuovo
  const old = cookieOf(req);
  if (old) await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(await sha256('ses:' + old)).run();
  const tok = b64url(rand(32));
  await env.DB.prepare('INSERT INTO sessions (id, admin_id, expires, ip, ua, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(await sha256('ses:' + tok), a.id, now() + SESSION_TTL * 1000, ip, str(req.headers.get('User-Agent') || '', 200), now()).run();
  await log(env, 'auth', `Accesso di ${a.username}`, ip);
  ctx.waitUntil(cleanup(env));
  return json({ ok: true, user: a.username, totp: !!a.totp_on }, 200, { 'Set-Cookie': setCookie(tok, SESSION_TTL) });
}

async function cleanup(env) {
  const t = now();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE expires < ?').bind(t),
    env.DB.prepare('DELETE FROM login_fail WHERE until < ? AND updated < ?').bind(t, t - 86400e3),
    env.DB.prepare('DELETE FROM activity WHERE t < ?').bind(t - 90 * 86400e3),
    // dispositivi mai attivati e non più visti da 30 giorni (non le connessioni collegate a un cliente,
    // né quelli a cui il fornitore ha dato un nome o una nota dal pannello)
    env.DB.prepare("DELETE FROM devices WHERE active = 0 AND playlists = '' AND parent = '' AND name = '' AND notes = '' AND last_seen < ?").bind(t - 30 * 86400e3),
  ]);
  try { await env.DB.prepare('DELETE FROM messages WHERE until > 0 AND until < ?').bind(t).run(); } catch {}
  try { await env.DB.batch([env.DB.prepare('DELETE FROM link_pins WHERE until < ?').bind(t), env.DB.prepare('DELETE FROM throttle WHERE until < ?').bind(t)]); } catch {}
}

// esportati per i test
export const _internal = { hashPass, checkPass, hotp, checkTotp, b32enc, seal, unseal, cleanTitle, cleanProfiles, semverCode, textToHtml, cleanWg };
