import { ADDON_ASSETS } from './addon-assets.js';
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

const SESSION_TTL = 30 * 86400; // secondi: l'accesso resta valido 30 giorni dall'ultimo uso (si rinnova da solo)
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
  let v; try { v = JSON.parse(t || '{}'); } catch { throw new HttpErr(400, 'JSON non valido'); }
  if (v === null || typeof v !== 'object') throw new HttpErr(400, 'JSON non valido');
  return v;
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
  "img-src 'self' data: https: http:", // locandine della videoteca (server dei clienti)
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
  allowLocalPlaylists: true, apkUrl: '', apkVersionCode: 0, downloaderCode: '', storeDownloaderCode: '', liteDownloaderCode: '', liteApkUrl: '',
  serverUrl: '', showFootball: true,
  price: '22 € / anno', privacy: '',
  aiDaily: 20, aiProvider: 'gm', aiClaude: 'haiku', aiGemini: 'flash',
  maint: { on: false, msg: '', allow: [] },
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
  return list.slice(0, 100).map((p) => ({ // fino a 100 playlist per cliente
    id: pid(p.id),
    name: str(p.name, 60) || 'Playlist',
    type: p.type === 'xtream' ? 'xtream' : 'm3u',
    url: okUrl(str(p.url, 1000)),
    host: okUrl(str(p.host, 300)).replace(/\/+$/, ''),
    username: str(p.username, 120),
    password: str(p.password, 120),
    tag: str(p.tag, 8).toUpperCase().replace(/[^A-Z0-9+&. -]/g, '').trim(), // sigla mostrata nell'app quando le playlist sono unite
  }));
}
const CODE_RE = /^KX[A-Z0-9]{2}-[A-Z0-9]{4}$/;
// '' (illimitata) oppure una data AAAA-MM-GG esistente (una data impossibile non scadrebbe mai)
const DATE_RE = { test: (s) => { if (s === '') return true; if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false; const t = new Date(s + 'T00:00:00Z'); return !isNaN(t) && t.toISOString().slice(0, 10) === s; } };

/* ---------------- permessi per dispositivo ---------------- */
// tutte le funzioni sono consentite se non vengono spente: nel DB restano solo le chiavi a false
const PERM_KEYS = ['report', 'request', 'profiles', 'link', 'rec', 'speed', 'vpn', 'epgUrl', 'localPl', 'plSwitch', 'multi', 'ai'];
const PERM_MSG = 'Funzione disattivata dal fornitore';
/** oggetto completo {chiave: bool} a partire dal JSON salvato (o da un oggetto parziale) */
function permsParse(src) {
  let o = src;
  if (typeof src === 'string') { try { o = src ? JSON.parse(src) : {}; } catch { o = {}; } }
  if (!o || typeof o !== 'object' || Array.isArray(o)) o = {};
  const out = {};
  for (const k of PERM_KEYS) out[k] = o[k] !== false;
  return out;
}
/** forma compatta per il DB: solo le chiavi spente ('' = tutto consentito) */
function permsJson(obj) {
  const off = {};
  for (const k of PERM_KEYS) if (obj && obj[k] === false) off[k] = false;
  return Object.keys(off).length ? JSON.stringify(off) : '';
}
/** permessi inviati dal pannello: solo booleani su chiavi note (altro → errore) */
function permsInput(b) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) throw new HttpErr(400, 'Permessi non validi');
  const out = {};
  for (const [k, v] of Object.entries(b)) {
    if (!PERM_KEYS.includes(k)) throw new HttpErr(400, `Permesso sconosciuto: ${String(k).slice(0, 20)}`);
    if (typeof v !== 'boolean') throw new HttpErr(400, 'Permessi non validi');
    out[k] = v;
  }
  return out;
}
/** permessi effettivi dell'account (un dispositivo collegato eredita quelli del principale) */
const permsOf = (P) => permsParse(P && P.perms);
/** permessi predefiniti per i nuovi dispositivi (Impostazioni) in forma compatta per il DB */
const defaultPermsJson = (s) => permsJson(permsParse(s && s.permsDefault));

/* ---------------- DNS = server delle playlist ---------------- */
/** origine (schema + host[:porta]) di una playlist, '' se non valida */
function hostOf(p) {
  try { const u = new URL(p.type === 'xtream' ? p.host : p.url); return /^https?:$/.test(u.protocol) ? u.origin : ''; } catch { return ''; }
}
/** controlla il nuovo server: http(s)://host[:porta], senza percorsi, credenziali o parametri */
function cleanHost(h) {
  h = str(h, 300).replace(/\/+$/, '');
  if (!h) throw new HttpErr(400, 'Scrivi il nuovo server, es. http://nuovo.server.tv:8080');
  if (!/^https?:\/\//i.test(h)) h = 'http://' + h;
  let u; try { u = new URL(h); } catch { throw new HttpErr(400, 'Indirizzo del server non valido'); }
  if (!/^https?:$/.test(u.protocol) || u.username || u.password || u.search || u.hash || (u.pathname && u.pathname !== '/')) throw new HttpErr(400, 'Indica solo schema e host, es. http://nuovo.server.tv:8080 (senza percorsi)');
  if (!/^[a-z0-9.-]+$/i.test(u.hostname) && !/^\[[0-9a-f:.]+\]$/i.test(u.hostname)) throw new HttpErr(400, 'Nome del server non valido');
  return u.origin;
}
/** stessa playlist con un altro server (percorso e parametri invariati) */
/* lettore per tipo di contenuto scelto dal pannello ('' = decide il cliente) */
const PLAYER_ENG = ['auto', 'exo', 'vlc'];
function playerParse(v) {
  let o = {}; try { o = v ? JSON.parse(v) : {}; } catch {}
  const out = {};
  for (const k of ['live', 'movie', 'series']) if (PLAYER_ENG.includes(o && o[k])) out[k] = o[k];
  return out;
}
function playerInput(v) {
  if (!v || typeof v !== 'object') throw new HttpErr(400, 'Lettore non valido');
  const out = {};
  for (const k of ['live', 'movie', 'series']) { const x = v[k]; if (x === '' || x == null) continue; if (!PLAYER_ENG.includes(x)) throw new HttpErr(400, 'Lettore non valido: usa auto, exo o vlc'); out[k] = x; }
  return Object.keys(out).length ? JSON.stringify(out) : '';
}
/* DNS salvati dal pannello (elenco indipendente dai clienti) */
async function dnsList(env) {
  const r = await env.DB.prepare('SELECT v FROM settings WHERE k = ?').bind('dnsl').first();
  let l = []; try { l = r ? JSON.parse(r.v) : []; } catch {}
  return Array.isArray(l) ? l.filter((x) => x && typeof x.host === 'string' && typeof x.id === 'string') : [];
}
async function dnsSave(env, list) {
  await env.DB.prepare('INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind('dnsl', JSON.stringify(list.slice(0, 100))).run();
}
function swapHost(p, host) {
  if (p.type === 'xtream') return { ...p, host };
  try { const u = new URL(p.url); return { ...p, url: (host + u.pathname + u.search).slice(0, 1000) }; } catch { return p; }
}

/* ====================================================================== */
/* Account: connessioni (più dispositivi), profili personali, VPN           */
/* ====================================================================== */
const AV_MAX = 144; // 48 avatar (classici, animali, sport, spazio) + 4 per ognuno dei 24 temi speciali
const AVATAR_RE = { test: (v) => /^a\d{1,3}$/.test(String(v)) && +String(v).slice(1) >= 1 && +String(v).slice(1) <= AV_MAX };

/* ---------------- add-on: temi speciali, skin colorate, pacchetti avatar ----------------
   Il disegno è nell'app; qui solo l'elenco. Per ognuno il fornitore sceglie nel pannello:
   all = per tutti i clienti · some = solo a chi lo assegna · off = nascosto (e un prezzo da mostrare, facoltativo) */
const ADDONS = [
  ['tema-ghiaccio', 'Regno di Ghiaccio', 'tema'], ['tema-draghi', 'Terra dei Draghi', 'tema'], ['tema-magia', 'Accademia di Magia', 'tema'],
  ['tema-eroi', 'Lega degli Eroi', 'tema'], ['tema-cyber', 'Città Cyber', 'tema'], ['tema-vichinghi', 'Saga Vichinga', 'tema'],
  ['tema-dei', "Dei dell'Olimpo", 'tema'], ['tema-neon', 'Notti al Neon', 'tema'], ['tema-pirati', 'Mari dei Pirati', 'tema'], ['tema-western', 'Frontiera Western', 'tema'],
  ['tema-halloween', 'Halloween', 'tema'], ['tema-muertos', 'Día de los Muertos', 'tema'], ['tema-natale', 'Natale', 'tema'],
  ['tema-capodanno', 'Capodanno', 'tema'], ['tema-sanvalentino', 'San Valentino', 'tema'], ['tema-carnevale', 'Carnevale', 'tema'],
  ['tema-fantasy', 'Regni Fantasy', 'tema'], ['tema-corse', 'Gran Premio', 'tema'], ['tema-arcade', 'Galassia Arcade', 'tema'], ['tema-pixel', 'Pixel Retrò', 'tema'], ['tema-isola', 'Isola della Sfida', 'tema'], ['tema-horror', 'Città Abbandonata', 'tema'], ['tema-torneo', 'Torneo dei Campioni', 'tema'], ['tema-giungla', 'Giungla Perduta', 'tema'],
  ['skin-rubino', 'Rubino', 'skin'], ['skin-zaffiro', 'Zaffiro', 'skin'], ['skin-ambra', 'Ambra', 'skin'], ['skin-giada', 'Giada', 'skin'],
  ['skin-lavanda', 'Lavanda', 'skin'], ['skin-corallo', 'Corallo', 'skin'], ['skin-grafite', 'Grafite', 'skin'], ['skin-menta', 'Menta', 'skin'],
  ['av-animali', 'Avatar Animali', 'avatar', 'all'], ['av-sport', 'Avatar Sport', 'avatar', 'all'], ['av-spazio', 'Avatar Spazio', 'avatar', 'all'],
];
const ADDON_IDS = new Set(ADDONS.map((a) => a[0]));
const ADDON_MODES = ['all', 'some', 'off'];
const addonsList = (v) => [...new Set((Array.isArray(v) ? v : String(v || '').split(',')).map((x) => String(x).trim()).filter((x) => ADDON_IDS.has(x)))];
/** catalogo con le scelte del fornitore (modo e prezzo) */
function addonCfg(s) {
  const c = s && s.addons && typeof s.addons === 'object' ? s.addons : {};
  return ADDONS.map(([id, name, cat, def = 'some']) => { const x = c[id] || {}; return { id, name, cat, mode: ADDON_MODES.includes(x.m) ? x.m : def, price: str(x.p || '', 20) }; });
}
/* immagini dei temi caricate dal fornitore (sfondo + 4 avatar): sostituiscono i disegni.
   Salvate in D1 come data URL JPEG/PNG/WebP (già ridimensionate dal pannello), al massimo 1,5 MB l'una. */
const MEDIA_SLOTS = ['bg', 'a1', 'a2', 'a3', 'a4'];
const MEDIA_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const mediaVer = (s, id) => (s && s.addonMedia && +s.addonMedia[id]) || 0;
async function mediaTouch(env, id) {
  const s = await getSettings(env);
  s.addonMedia = { ...(s.addonMedia || {}), [id]: now() };
  await env.DB.prepare('INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind('app', JSON.stringify(s)).run();
}
/** anteprima di un tema (miniature a bassa risoluzione): per tutti i temi visibili nello store, anche non posseduti */
async function playerAddonPreview(req, env, ip) {
  if (await limited(env.RL_DEVICE, 'adp:' + ip)) return json({ error: 'Troppe richieste' }, 429);
  let b;
  try { b = await readJSON(req, 2048); } catch (e) { return json({ error: e.message }, e.status || 400); }
  const [d, bad] = await deviceAuth(env, b);
  if (bad) return bad;
  const id = str(b.id, 40), asset = ADDON_ASSETS[id];
  if (!asset || !asset.prev) return json({ error: 'Add-on non trovato' }, 404);
  const [P] = await activeAccount(env, d);
  if (!P) return json({ error: 'Abbonamento non attivo' }, 403);
  if (!addonsFor(await getSettings(env), P).some((a) => a.id === id)) return json({ error: 'Add-on non disponibile' }, 404); // nascosto dal fornitore
  return json({ id, bg: asset.prev.bg, avs: asset.prev.avs }, 200, { 'Cache-Control': 'private, max-age=3600' });
}
/** disegni di un tema speciale (scena + 4 avatar): solo al cliente che lo ha */
async function playerAddon(req, env, ip) {
  if (await limited(env.RL_DEVICE, 'ad:' + ip)) return json({ error: 'Troppe richieste' }, 429);
  let b;
  try { b = await readJSON(req, 2048); } catch (e) { return json({ error: e.message }, e.status || 400); }
  const [d, bad] = await deviceAuth(env, b);
  if (bad) return bad;
  const id = str(b.id, 40), asset = ADDON_ASSETS[id];
  if (!asset) return json({ error: 'Add-on non trovato' }, 404);
  const [P] = await activeAccount(env, d);
  if (!P) return json({ error: 'Abbonamento non attivo' }, 403);
  const it = addonsFor(await getSettings(env), P).find((a) => a.id === id);
  if (!it || !it.own) return json({ error: 'Questo tema non è attivo per te: chiedilo al tuo fornitore' }, 403);
  const img = { ...(asset.img || {}) };
  try { for (const r of ((await env.DB.prepare('SELECT slot, data FROM addon_media WHERE addon = ?').bind(id).all()).results) || []) img[r.slot] = r.data; } catch {}
  return json({ id, avs: asset.avs, scene: asset.scene, img, v: mediaVer(await getSettings(env), id) }, 200, { 'Cache-Control': 'private, no-store' });
}
/** per l'app: add-on visibili, con prezzo e se il cliente li ha */
function addonsFor(s, P) {
  const own = new Set(addonsList(P && P.addons));
  return addonCfg(s).filter((a) => a.mode !== 'off').map((a) => { const own2 = a.mode === 'all' || own.has(a.id), v = mediaVer(s, a.id); return { id: a.id, p: a.price, own: own2, ...(own2 && v ? { m: v } : {}) }; });
}
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
  return { primary: me.id === P.id, owner: P.name || '', maxConn: P.max_conn ?? 1, conns, maxProfiles: P.max_profiles ?? 3, profiles: readProfiles(P, pls.map((p) => p.id)), canEdit: !P.lock_profiles, maxStreams: +P.max_streams || 0, plMode: P.pl_mode === 'split' ? 'split' : 'merge', plDefault: pls.some((p) => p.id === P.pl_default) ? P.pl_default : '', player: playerParse(P.player) };
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
/** località VPN: più server WireGuard salvati cifrati, scelti dal pannello per ogni cliente (l'app non le mostra) */
async function wgLocs(env) {
  const r = await env.DB.prepare('SELECT v FROM settings WHERE k = ?').bind('wgl').first();
  const v = r ? await unseal(env, r.v).catch(() => []) : [];
  return Array.isArray(v) ? v.filter((x) => x && typeof x.id === 'string' && typeof x.conf === 'string') : [];
}
async function vpnOf(env, P, me) {
  const lvl = +P.vpn || 0, mode = lvl === 2 ? 'force' : lvl === 1 ? 'allow' : 'off';
  const out = { mode };
  if (mode !== 'off') {
    // ogni dispositivo dovrebbe avere la sua chiave: prima la sua, poi quella del principale, poi la località scelta, poi quella generale
    let conf = (me.id !== P.id && await unsealText(env, me.vpn_conf)) || await unsealText(env, P.vpn_conf);
    if (!conf && P.vpn_loc) { const l = (await wgLocs(env)).find((x) => x.id === P.vpn_loc); if (l) { conf = l.conf; out.loc = l.name; } }
    if (!conf) conf = await wgGlobal(env);
    if (conf) out.conf = conf;
  }
  return out;
}
/* ---------------- contatori anti-abuso su D1 (finestre lunghe, oltre i 60 s del rate limiting nativo) ---------------- */
async function throttled(env, key, max, windowMs, inc = 1) {
  try {
    const t = now();
    const r = await env.DB.prepare('INSERT INTO throttle (k, n, until) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET n = CASE WHEN throttle.until < ? THEN excluded.n ELSE throttle.n + excluded.n END, until = CASE WHEN throttle.until < ? THEN excluded.until ELSE throttle.until END RETURNING n')
      .bind(key, inc, t + windowMs, t, t).first();
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
  if (!permsOf(P).profiles) return json({ error: PERM_MSG }, 403);
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
  if (!permsOf(P).link) return json({ error: PERM_MSG }, 403);
  const used = await connCount(env, P), max = P.max_conn ?? 1;
  if (used >= max) return json({ error: `Connessioni esaurite (${used} di ${max})` }, 409);
  if (await throttled(env, 'lc:' + P.id, 12, 3600e3)) return json({ error: 'Hai richiesto troppi codici, riprova più tardi' }, 429);
  try { return json(await issuePin(env, P)); } catch (e) { return json({ error: e.message }, e.status || 500); }
}
/** genera un codice a 6 cifre per collegare un dispositivo all'account P (dall'app o dal pannello) */
async function issuePin(env, P) {
  const until = now() + PIN_TTL;
  await env.DB.prepare('DELETE FROM link_pins WHERE device_id = ? OR until < ?').bind(P.id, now()).run(); // un solo codice valido per account
  for (let i = 0; i < 8; i++) {
    const pin = newPin();
    try {
      await env.DB.prepare('INSERT INTO link_pins (pin_hash, device_id, until) VALUES (?, ?, ?)').bind(await pinHash(env, pin), P.id, until).run();
      return { pin, until };
    } catch {} // stesso codice già in uso da un altro account: se ne genera un altro
  }
  throw new HttpErr(503, 'Riprova tra poco');
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
  if (!permsOf(P).link) return json({ error: PERM_MSG }, 403);
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
/* Utenti online: battito dell'app, presenza, contenuti più guardati       */
/* ====================================================================== */
const HB_MIN_MS = 15e3;          // un battito ogni 15 s al massimo per dispositivo
const ONLINE_MS = 3 * 60e3;      // "online" = segnale negli ultimi 3 minuti
const STATES = ['idle', 'live', 'movie', 'series', 'rec'];
const NETS = ['wifi', 'eth', 'mobile', 'none', ''];
const num = (v, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : 0; };
const cfOf = (req) => { const c = req.cf || {}; return { country: str(c.country, 4).toUpperCase(), city: str(c.city, 60) }; };
/** giorno in ora italiana AAAA-MM-GG (per le classifiche) */
function dayIT(t = now()) {
  try { return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t)); }
  catch { return new Date(t).toISOString().slice(0, 10); }
}
const PRESENCE_COLS = ['t', 'hb_t', 'ip', 'ip2', 'ip2_t', 'country', 'city', 'home_country', 'ver', 'ui', 'model', 'state', 'title', 'ch', 'ch_id', 'grp', 'pl', 'prof', 'screen', 'net', 'rssi', 'speed_dl', 'speed_ul', 'speed_ping', 'speed_jit', 'speed_t', 'res', 'fps', 'bitrate', 'buffers', 'dropped', 'engine', 'vpn', 'codec', 'dec', 'stalls_h', 'rec', 'reduced'];
/** scrive/aggiorna la riga di presenza con i campi indicati (gli altri restano) */
async function upsertPresence(env, id, fields) {
  const cols = Object.keys(fields).filter((k) => PRESENCE_COLS.includes(k));
  if (!cols.length) return;
  const sql = `INSERT INTO presence (device_id, ${cols.join(', ')}) VALUES (?${', ?'.repeat(cols.length)}) ON CONFLICT(device_id) DO UPDATE SET ${cols.map((c) => `${c} = excluded.${c}`).join(', ')}`;
  await env.DB.prepare(sql).bind(id, ...cols.map((c) => fields[c])).run();
}
/** campi "da dove si collega": IP attuale, IP precedente se diverso (per notare condivisioni), paese di casa */
function whereFields(old, ip, cf) {
  const f = { ip, country: cf.country, city: cf.city };
  if (old && old.ip && old.ip !== ip) { f.ip2 = old.ip; f.ip2_t = old.t; }
  if (!old || !old.home_country) f.home_country = cf.country;
  return f;
}
/** al register: il dispositivo è nei menu (non nel lettore) → presenza minima, stato "idle" */
async function presenceFromRegister(env, d, b, ip, cf) {
  try {
    const old = await env.DB.prepare('SELECT ip, t, home_country FROM presence WHERE device_id = ?').bind(d.id).first();
    const f = { t: now(), state: 'idle', title: '', ch: '', ch_id: '', grp: '', ...whereFields(old, ip, cf) };
    const model = str(b.model, 80), ver = str(b.ver, 20), ui = str(b.ui, 20);
    if (model) f.model = model; if (ver) f.ver = ver; if (ui) f.ui = ui;
    await upsertPresence(env, d.id, f);
  } catch {} // tabella non ancora creata
}
/* messaggi arrivati dopo l'ultimo register: l'app li scarica al prossimo register */
async function unseenCount(env, d, pid) {
  try { return (await env.DB.prepare('SELECT COUNT(*) AS n FROM messages WHERE (target = ? OR target = ? OR target = ?) AND created > ? AND (until = 0 OR until > ?)').bind('all', d.id, pid || d.id, +d.last_seen || 0, now()).first()).n; } catch { return 0; }
}
/* problemi della visione mandati dall'app (recupero automatico, errori del lettore) → «Errori applicazione» */
const ERR_PROBLEMS = ['freeze', 'stall', 'error'];
const ERR_OUTCOMES = ['risolto', 'non risolto', 'chiuso'];
const ERR_KEEP_MS = 7 * 86400e3;
async function playerErrors(req, env, ip, ctx) {
  if (await limited(env.RL_DEVICE, 'er:' + ip)) return json({ error: 'Troppe richieste' }, 429);
  let b;
  try { b = await readJSON(req, 32768); } catch (e) { return json({ error: e.message }, e.status || 400); }
  const [d, bad] = await deviceAuth(env, b);
  if (bad) return bad;
  const items = Array.isArray(b.items) ? b.items.slice(0, 20) : [];
  if (!items.length) return json({ ok: true, saved: 0 });
  // al massimo 300 problemi l'ora per dispositivo (contati uno per uno): un'app impazzita non riempie il database
  if (await throttled(env, 'er:' + d.id, 300, 3600e3, items.length)) return json({ ok: true, saved: 0, limited: true });
  const t = now(), model = str(b.model, 80) || d.model || '', ver = str(b.ver, 20);
  const stmts = [];
  for (const x of items) {
    if (!x || typeof x !== 'object') continue;
    const problem = ERR_PROBLEMS.includes(x.problem) ? x.problem : 'error';
    const outcome = ERR_OUTCOMES.includes(x.outcome) ? x.outcome : '';
    // l'orologio del dispositivo può sbagliare: si usa quello dell'app solo se plausibile (ultime 24 h)
    const at = Number.isFinite(+x.t) && +x.t > t - 86400e3 && +x.t <= t + 60e3 ? Math.round(+x.t) : t;
    stmts.push(env.DB.prepare('INSERT INTO app_errors (t, device_id, problem, action, outcome, err, title, item_id, kind, engine, codec, dec, res, variant, model, ver) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(at, d.id, problem, nameClean(x.action, 60), outcome, str(x.err, 120), nameClean(x.title, 120), str(x.id, 60), x.k === 'live' ? 'live' : x.k ? 'vod' : '', str(x.engine, 12), str(x.codec, 16), x.dec === 'sw' ? 'sw' : x.dec === 'hw' ? 'hw' : '', str(x.res, 12), str(x.var, 12), model, ver));
  }
  if (stmts.length) await env.DB.batch(stmts);
  // pulizia: ogni tanto si tolgono quelli più vecchi di 7 giorni
  if (Math.random() < 0.1) ctx.waitUntil(env.DB.prepare('DELETE FROM app_errors WHERE t < ?').bind(t - ERR_KEEP_MS).run().catch(() => {}));
  return json({ ok: true, saved: stmts.length });
}
async function adminErrors(req, env, path, url, who, ip) {
  const m = req.method;
  if (path === '/app-errors' && m === 'GET') {
    const t = now(), since = t - Math.min(ERR_KEEP_MS, Math.max(3600e3, (+url.searchParams.get('hours') || 168) * 3600e3));
    const rows = ((await env.DB.prepare('SELECT e.*, d.name, d.code, d.parent FROM app_errors e LEFT JOIN devices d ON d.id = e.device_id WHERE e.t > ? ORDER BY e.t DESC LIMIT 2000').bind(since).all()).results) || [];
    const seen = +((await env.DB.prepare("SELECT v FROM settings WHERE k = 'errSeen'").first()) || { v: 0 }).v || 0;
    const items = rows.map((r) => ({ id: r.id, t: r.t, deviceId: r.device_id, name: r.name || '', code: r.code || '', problem: r.problem, action: r.action, outcome: r.outcome, err: r.err, title: r.title, itemId: r.item_id, kind: r.kind, engine: r.engine, codec: r.codec, dec: r.dec, res: r.res, variant: r.variant, model: r.model, ver: r.ver, isNew: r.t > seen }));
    // riepiloghi: un canale con problemi su tanti dispositivi diversi è un problema del canale
    const by = (key) => {
      const mp = new Map();
      for (const x of items) {
        const k = key(x); if (!k) continue;
        const o = mp.get(k) || { key: k, n: 0, unresolved: 0, devs: new Set(), titles: new Set() };
        o.n++; if (x.outcome === 'non risolto') o.unresolved++; o.devs.add(x.deviceId); o.titles.add(x.title);
        mp.set(k, o);
      }
      return [...mp.values()].sort((a, b) => b.n - a.n).slice(0, 10).map((o) => ({ key: o.key, n: o.n, unresolved: o.unresolved, devices: o.devs.size, titles: o.titles.size }));
    };
    const topTitles = by((x) => x.title), topDevices = by((x) => x.deviceId).map((o) => { const x = items.find((i) => i.deviceId === o.key) || {}; return { ...o, name: x.name, code: x.code, model: x.model }; });
    return json({ items, topTitles, topDevices, newCount: items.filter((x) => x.isNew).length });
  }
  if (path === '/app-errors/seen' && m === 'POST') {
    await env.DB.prepare("INSERT INTO settings (k, v) VALUES ('errSeen', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(String(now())).run();
    return json({ ok: true });
  }
  if (path === '/app-errors' && m === 'DELETE') {
    const r = await env.DB.prepare('DELETE FROM app_errors').run();
    await log(env, 'del', `${who}: svuotati gli errori dell'applicazione`, ip);
    return json({ ok: true, deleted: (r.meta && r.meta.changes) || 0 });
  }
  return null;
}
async function playerHeartbeat(req, env, ip, ctx) {
  if (await limited(env.RL_DEVICE, 'hb:' + ip)) return json({ error: 'Troppe richieste' }, 429);
  let b;
  try { b = await readJSON(req, 4096); } catch (e) { return json({ error: e.message }, e.status || 400); }
  const [d, bad] = await deviceAuth(env, b);
  if (bad) return bad;
  const t = now();
  const old = await env.DB.prepare('SELECT * FROM presence WHERE device_id = ?').bind(d.id).first();
  // il limite conta solo i battiti (register e inizio visione aggiornano la presenza ma non contano)
  if (old && t - (+old.hb_t || 0) < HB_MIN_MS) return json({ error: 'Troppi battiti: attendi qualche secondo', wait: Math.ceil((HB_MIN_MS - (t - old.hb_t)) / 1000) }, 429);
  const cf = cfOf(req);
  { const app = /^lite\b/i.test(String(b.ver || '')) ? 'lite' : 'tv'; if (d.app !== app) ctx.waitUntil(env.DB.prepare('UPDATE devices SET app = ? WHERE id = ?').bind(app, d.id).run()); }
  const state = STATES.includes(b.state) ? b.state : 'idle';
  const net = b.net && typeof b.net === 'object' ? b.net : {};
  const sp = b.speed && typeof b.speed === 'object' ? b.speed : null;
  const st = b.stats && typeof b.stats === 'object' ? b.stats : null;
  const f = {
    t, hb_t: t, ...whereFields(old, ip, cf),
    ver: str(b.ver, 20), ui: str(b.ui, 20), model: str(b.model, 80) || (old && old.model) || d.model || '',
    state, title: state === 'idle' ? '' : nameClean(b.title, 120), ch: nameClean(b.ch, 80), ch_id: str(b.chId, 60), grp: nameClean(b.group, 60),
    pl: str(b.pl, 40), prof: nameClean(b.prof, 24), screen: str(b.screen, 20),
    net: NETS.includes(net.type) ? net.type : '', rssi: Math.round(num(net.rssi, -120, 0)),
    vpn: b.vpn === 'on' ? 'on' : b.vpn === 'off' ? 'off' : '',
  };
  if (sp) Object.assign(f, { speed_dl: num(sp.dl, 0, 1e5), speed_ul: num(sp.ul, 0, 1e5), speed_ping: num(sp.ping, 0, 1e5), speed_jit: num(sp.jitter, 0, 1e5), speed_t: Math.round(num(sp.t, 0, 1e13)) || t });
  if (st) Object.assign(f, { res: str(st.res, 20), fps: num(st.fps, 0, 1e3), bitrate: num(st.bitrate, 0, 1e9), buffers: Math.round(num(st.buffers, 0, 1e6)), dropped: Math.round(num(st.dropped, 0, 1e9)), engine: str(st.engine, 20), codec: str(st.codec, 16), dec: st.dec === 'sw' ? 'sw' : st.dec === 'hw' ? 'hw' : '', stalls_h: Math.round(num(st.stallsH, 0, 1e4)), rec: nameClean(st.rec, 80), reduced: str(st.reduced, 12) });
  else if (state === 'idle') Object.assign(f, { res: '', fps: 0, bitrate: 0, buffers: 0, dropped: 0, engine: '', codec: '', dec: '', rec: '', reduced: '' });
  // durante la visione l'app batte ogni 20 s (per «Disconnetti»): se non è cambiato niente di importante la riga
  // si riscrive al massimo una volta al minuto, così le scritture su D1 restano quelle di prima
  const same = old && t - (+old.t || 0) < 55e3 && old.state === state && (old.title || '') === f.title && (old.ch_id || '') === f.ch_id
    && (old.vpn || '') === f.vpn && (old.screen || '') === f.screen && (old.rec || '') === (f.rec ?? old.rec ?? '') && (old.reduced || '') === (f.reduced ?? old.reduced ?? '') && (+old.stalls_h || 0) === (f.stalls_h ?? +old.stalls_h ?? 0) && (!sp || +old.speed_t === f.speed_t) && (old.ip || '') === (f.ip ?? old.ip ?? '');
  const writes = same ? [] : [upsertPresence(env, d.id, f)];
  // nuova "sessione" di visione: contenuto diverso da quello dell'ultimo battito
  if (state !== 'idle' && f.title && (!old || old.state !== state || old.title !== f.title))
    writes.push(env.DB.prepare('INSERT INTO watch (day, kind, title, n) VALUES (?, ?, ?, 1) ON CONFLICT(day, kind, title) DO UPDATE SET n = watch.n + 1').bind(dayIT(t), state, f.title).run());
  await Promise.all(writes);
  // modalità VPN e permessi attuali: se il pannello li ha cambiati l'app si riallinea subito (senza aspettare 20 minuti)
  const [P, pls] = await activeAccount(env, d);
  const vm = P ? (+P.vpn === 2 ? 'force' : +P.vpn === 1 ? 'allow' : 'off') : 'off';
  // impronta dei server delle playlist: se cambia (DNS cambiato dal pannello) l'app aggiorna gli indirizzi senza ricaricare la lista
  const pv = pls.length ? (await sha256(pls.map((p) => p.id + '|' + hostOf(p) + '|' + (p.username || '')).join(','))).slice(0, 12) : '';
  // "Disconnetti" dal pannello: l'ordine resta valido 3 minuti; l'app lo conferma (kickAck) e viene azzerato
  let kick = 0;
  if (+d.kick_t > 0) {
    if (b.kickAck && +b.kickAck === +d.kick_t) await env.DB.prepare('UPDATE devices SET kick_t = 0 WHERE id = ? AND kick_t = ?').bind(d.id, +d.kick_t).run();
    else if (t - +d.kick_t < 180e3) kick = +d.kick_t;
  }
  const mt = maintFor(await getSettings(env), P) ? 1 : 0;
  return json({ ok: true, mt, unseen: await unseenCount(env, d, d.parent), ts: t, vm, ph: P ? permsJson(permsParse(P.perms)) : '', ms: P ? +P.max_streams || 0 : 0, pv, pm: P ? (P.pl_mode === 'split' ? 'split' : 'merge') + '|' + (pls.some((p) => p.id === P.pl_default) ? P.pl_default : '') + '|' + JSON.stringify(playerParse(P.player)) : '', adg: P ? P.addons || '' : '', ...(kick ? { kick } : {}) });
}
/** vista pannello: chi è collegato e cosa guarda */
/* visioni contemporanee: prima di iniziare a guardare l'app chiede il permesso (solo se il pannello ha messo un limite) */
async function playerStream(req, env, ip, ctx) {
  if (await limited(env.RL_DEVICE, 'st:' + ip)) return json({ ok: true }); // in caso di dubbio non si blocca la visione
  let b;
  try { b = await readJSON(req, 2048); } catch (e) { return json({ error: e.message }, e.status || 400); }
  const [d, bad] = await deviceAuth(env, b);
  if (bad) return bad;
  const [P] = await activeAccount(env, d);
  if (!P) return json({ error: 'Abbonamento non attivo' }, 403);
  const max = +P.max_streams || 0, state = STATES.includes(b.state) && b.state !== 'idle' ? b.state : 'live', t = now();
  if (max > 0) {
    const ids = [P.id, ...(await linkedOf(env, P.id)).map((x) => x.id)].filter((id) => id !== d.id);
    let busy = 0;
    for (let i = 0; i < ids.length; i += 90) { const part = ids.slice(i, i + 90); const r = await env.DB.prepare(`SELECT COUNT(*) AS n FROM presence WHERE state != 'idle' AND t > ? AND device_id IN (${part.map(() => '?').join(',')})`).bind(t - 150e3, ...part).first(); busy += (r && r.n) || 0; }
    if (busy >= max) {
      ctx.waitUntil(log(env, 'off', `Limite visioni contemporanee raggiunto: ${P.name || P.code} (${max})`, ip));
      return json({ ok: false, error: `Limite di visioni contemporanee raggiunto (${max} su questo abbonamento). Chiudi la visione su un altro dispositivo e riprova.`, max, busy });
    }
  }
  ctx.waitUntil(upsertPresence(env, d.id, { t, state, title: nameClean(b.title, 120) }));
  return json({ ok: true, max });
}
/* trailer: anteprime ufficiali dalla ricerca di Apple iTunes (senza chiave), conservate 14 giorni */
/* dispositivo registrato (?c=codice): può riempire la cache; chiunque altro legge solo ciò che c'è già */
const devSeen = new Map();
async function knownDevice(env, url) {
  const code = String(url.searchParams.get('c') || '').toUpperCase();
  if (!CODE_RE.test(code)) return '';
  const t = devSeen.get(code);
  if (t && now() - t < 10 * 60e3) return code;
  const r = await env.DB.prepare('SELECT 1 AS x FROM devices WHERE code = ?').bind(code).first().catch(() => null);
  if (!r) return '';
  if (devSeen.size > 2000) devSeen.clear();
  devSeen.set(code, now());
  return code;
}
/* scrittura in cache: un risultato trovato si salva sempre (i titoli veri sono pochi);
   un «non trovato» solo da un dispositivo registrato, al massimo 30 al minuto: titoli inventati non riempiono il database */
async function cacheOk(env, url, tag, found) {
  if (found) return true;
  const code = await knownDevice(env, url);
  return !!code && !(await limited(env.RL_DEVICE, tag + code));
}
/** dispositivi per id, una query ogni 90 */
async function devicesByIds(env, ids, cols) {
  const out = [];
  for (let i = 0; i < ids.length; i += 90) {
    const part = ids.slice(i, i + 90);
    out.push(...(((await env.DB.prepare(`SELECT ${cols} FROM devices WHERE id IN (${part.map(() => '?').join(',')})`).bind(...part).all()).results) || []));
  }
  return out;
}
async function playerTrailer(req, env, ip, url, ctx) {
  if (await limited(env.RL_DEVICE, 'tr:' + ip)) return json({ error: 'Troppe richieste' }, 429);
  const raw = nameClean(url.searchParams.get('t') || '', 160);
  const title = trailerTitle(raw);
  const year = parseInt(url.searchParams.get('y') || '', 10) || yearIn(raw), kind = url.searchParams.get('kind') === 'series' ? 'series' : 'movie';
  if (title.length < 2) return json({ url: '', yt: '' });
  const key = 'trl2:' + (await sha256(kind + '|' + title.toLowerCase() + '|' + year)).slice(0, 24);
  const c = await env.DB.prepare('SELECT v FROM settings WHERE k = ?').bind(key).first();
  if (c) {
    try {
      const v = JSON.parse(c.v), age = now() - v.t;
      // trovato: 14 giorni · non trovato: si riprova dopo 6 ore
      if ((v.url || v.yt) ? age < 14 * 864e5 : age < 6 * 3600e3) return json({ url: v.url || '', yt: v.yt || '', title: v.title || '', src: v.src || '' });
    } catch {}
  }
  const want = normT(title);
  let out = null, failures = 0;
  const tries = [
    env.TMDB_KEY ? () => trailerTmdb(env, title, year, kind) : null,
    () => trailerYoutube(title, year, kind, want),
    () => trailerItunes(title, year, kind, want),
  ].filter(Boolean);
  for (const f of tries) {
    try { out = await f(); if (out) break; } catch { failures++; }
  }
  const res = { url: out && out.url || '', yt: out && out.yt || '', title: out && out.title || '', src: out && out.src || '', t: now() };
  // se tutte le fonti erano irraggiungibili non si salva nulla (si riprova alla prossima richiesta)
  if ((res.url || res.yt || failures < tries.length) && (await cacheOk(env, url, 'cwt:', !!(res.url || res.yt)))) ctx.waitUntil(env.DB.prepare('INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind(key, JSON.stringify(res)).run());
  return json({ url: res.url, yt: res.yt, title: res.title, src: res.src });
}
/* ---------- età consigliata e contenuti speciali (TMDB, solo se c'è TMDB_KEY) ---------- */
const tmdbGet = (env) => {
  const k = String(env.TMDB_KEY || '').trim(), bearer = k.length > 40;
  const H = { Accept: 'application/json', ...(bearer ? { Authorization: 'Bearer ' + k } : {}) };
  return async (u) => { const r = await fetch('https://api.themoviedb.org/3' + u + (bearer ? '' : (u.includes('?') ? '&' : '?') + 'api_key=' + encodeURIComponent(k)), { headers: H, signal: AbortSignal.timeout(7000) }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); };
};
/* classificazione americana → fascia italiana più vicina */
const US_CERT = { G: 'T', 'TV-Y': 'T', 'TV-G': 'T', 'TV-Y7': '6+', PG: '6+', 'TV-PG': '6+', 'PG-13': '14+', 'TV-14': '14+', R: '14+', 'NC-17': '18+', 'TV-MA': '18+' };
const certIt = (c) => { const x = String(c || '').trim().toUpperCase().replace(/^VM\s*/, ''); if (!x) return ''; if (x === 'T' || x === 'TUTTI') return 'T'; const n = parseInt(x, 10); return n ? n + '+' : ''; };
async function metaTmdb(env, title, year, kind) {
  const get = tmdbGet(env), t = kind === 'series' ? 'tv' : 'movie';
  const yq = year ? (t === 'tv' ? '&first_air_date_year=' : '&year=') + year : '';
  let res = (await get(`/search/${t}?query=${encodeURIComponent(title)}&language=it-IT${yq}`)).results || [];
  if (!res.length && yq) res = (await get(`/search/${t}?query=${encodeURIComponent(title)}&language=it-IT`)).results || [];
  const hit = res[0]; if (!hit) return null;
  const [rd, vids] = await Promise.all([
    get(t === 'tv' ? `/tv/${hit.id}/content_ratings` : `/movie/${hit.id}/release_dates`).catch(() => ({})),
    get(`/${t}/${hit.id}/videos?language=it-IT&include_video_language=it,en,null`).catch(() => ({})),
  ]);
  const rows = rd.results || [];
  const country = (cc) => rows.find((r) => r.iso_3166_1 === cc);
  let cert = '', src = '';
  const it = country('IT');
  if (it) { cert = certIt(t === 'tv' ? it.rating : ((it.release_dates || []).find((d) => d.certification) || {}).certification); if (cert) src = 'IT'; }
  if (!cert) { const us = country('US'); const c = us ? (t === 'tv' ? us.rating : ((us.release_dates || []).find((d) => d.certification) || {}).certification) : ''; if (US_CERT[c]) { cert = US_CERT[c]; src = 'US'; } }
  const EX = { Featurette: 'Speciale', 'Behind the Scenes': 'Dietro le quinte', Clip: 'Clip', Bloopers: 'Papere', Teaser: 'Teaser', Trailer: 'Trailer' };
  const extras = (vids.results || []).filter((v) => v.site === 'YouTube' && /^[\w-]{11}$/.test(v.key) && EX[v.type]).slice(0, 12)
    .map((v) => ({ yt: v.key, name: String(v.name || '').slice(0, 90), type: EX[v.type] }));
  return { cert, certSrc: src, extras, tmdb: hit.id };
}
async function playerMeta(req, env, ip, url, ctx) {
  if (await limited(env.RL_DEVICE, 'mt:' + ip)) return json({ error: 'Troppe richieste' }, 429);
  if (!env.TMDB_KEY) return json({ cert: '', extras: [], off: true });
  const raw = nameClean(url.searchParams.get('t') || '', 160), title = trailerTitle(raw);
  const year = parseInt(url.searchParams.get('y') || '', 10) || yearIn(raw), kind = url.searchParams.get('kind') === 'series' ? 'series' : 'movie';
  if (title.length < 2) return json({ cert: '', extras: [] });
  const key = 'mta:' + (await sha256(kind + '|' + title.toLowerCase() + '|' + year)).slice(0, 24);
  const c = await env.DB.prepare('SELECT v FROM settings WHERE k = ?').bind(key).first();
  if (c) { try { const v = JSON.parse(c.v), age = now() - v.t; if ((v.tmdb ? age < 14 * 864e5 : age < 6 * 3600e3)) return json({ cert: v.cert || '', certSrc: v.certSrc || '', extras: v.extras || [] }); } catch {} }
  let out = null;
  try { out = await metaTmdb(env, title, year, kind); } catch { return json({ cert: '', extras: [] }); }
  const v = { cert: out ? out.cert : '', certSrc: out ? out.certSrc : '', extras: out ? out.extras : [], tmdb: out ? out.tmdb : 0, t: now() };
  if (await cacheOk(env, url, 'cwm:', !!v.tmdb)) ctx.waitUntil(env.DB.prepare('INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind(key, JSON.stringify(v)).run());
  return json({ cert: v.cert, certSrc: v.certSrc, extras: v.extras });
}
/* ======================================================================
   ASSISTENTE IA: Claude (Anthropic, a pagamento) o Google Gemini (gratis). Il servizio si sceglie nel pannello per tutti
   e, se serve, per il singolo cliente; se quello scelto non risponde, risponde l'altro (se collegato).
   Ogni cliente ha un numero di domande al giorno (dal pannello) + domande extra.
   ====================================================================== */
const AI_PROVIDERS = ['claude', 'gm'];
const AI_NAMES = { claude: 'Claude', gm: 'Gemini' };
// prezzi in dollari per milione di parole (token), dalla pagina prezzi di Anthropic: servono solo per stimare la spesa nel pannello
const AI_CLAUDE_MODELS = {
  haiku: { id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5 (veloce, costa pochissimo)', pin: 0.10, pout: 0.50 },
  sonnet: { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5 (più preciso, costa circa 20 volte di più)', pin: 2, pout: 10 },
};
// Gemini: «thinkingLevel» basso = risponde subito (senza, la versione Flash ragiona a lungo ed è lenta)
const AI_GEMINI_MODELS = {
  flash: { name: 'Gemini 3.8 Flash (risposte migliori)', list: [['gemini-3.8-flash', 'low'], ['gemini-3.5-flash-lite', '']] },
  lite: { name: 'Gemini 3.5 Flash-Lite (più veloce)', list: [['gemini-3.5-flash-lite', ''], ['gemini-3.8-flash', 'low']] },
};
const AI_SYSTEM = 'Sei l\'assistente di un\'app per guardare la TV. Rispondi in italiano, in modo breve e chiaro: al massimo 5 frasi brevi, adatte a essere lette sulla TV. Parla solo del contenuto indicato e di argomenti legati (trama, attori, genere, età consigliata, titoli simili). Non rivelare il finale se non te lo chiedono. Se non conosci il titolo dillo chiaramente in una frase, non inventare. Non usare markdown, elenchi puntati o simboli.';
const utcDay = (t = now()) => new Date(t).toISOString().slice(0, 10);
async function claudeAsk(env, model, text) {
  const m = AI_CLAUDE_MODELS[model] || AI_CLAUDE_MODELS.haiku;
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', signal: AbortSignal.timeout(25000),
    headers: { 'content-type': 'application/json', 'x-api-key': String(env.ANTHROPIC_API_KEY).trim(), 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: m.id, max_tokens: 400, system: AI_SYSTEM, messages: [{ role: 'user', content: text }] }), // niente «temperature»: Haiku 5.5 e Sonnet 5.5 rispondono con errore 400 se c'è
  });
  const j = await r.json().catch(() => null);
  const answer = j && Array.isArray(j.content) ? j.content.map((p) => (p && p.type === 'text' ? p.text : '')).join('').trim() : '';
  const u = (j && j.usage) || {};
  return { status: r.status, answer, tin: +u.input_tokens || 0, tout: +u.output_tokens || 0, err: (j && j.error && j.error.message) || '' };
}
async function geminiAsk(env, model, text, think) {
  const gc = { maxOutputTokens: 1024, temperature: 0.6 };
  if (think) gc.thinkingConfig = { thinkingLevel: think };
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST', signal: AbortSignal.timeout(25000),
    headers: { 'content-type': 'application/json', 'x-goog-api-key': String(env.GEMINI_API_KEY).trim() },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: AI_SYSTEM }] }, contents: [{ role: 'user', parts: [{ text }] }], generationConfig: gc }),
  });
  const j = await r.json().catch(() => null);
  const answer = j && Array.isArray(j.candidates) && j.candidates[0] && j.candidates[0].content ? (j.candidates[0].content.parts || []).filter((p) => !p.thought).map((p) => p.text || '').join('').trim() : '';
  return { status: r.status, answer };
}
const aiLimitOf = (P, set) => (+P.ai_limit >= 0 ? +P.ai_limit : Math.max(0, parseInt(set.aiDaily ?? 20, 10) || 0));
const aiProvOf = (set) => (AI_PROVIDERS.includes(set.aiProvider) ? set.aiProvider : 'gm');
async function aiUsed(env, id) { return ((await env.DB.prepare('SELECT n FROM ai_usage WHERE day = ? AND device_id = ?').bind(utcDay(), id).first()) || { n: 0 }).n; }
async function aiCount(env, id, f, tin = 0, tout = 0) {
  await env.DB.prepare(`INSERT INTO ai_usage (day, device_id, n, gm, cl, cl_in, cl_out) VALUES (?, ?, 1, ?, ?, ?, ?) ON CONFLICT(day, device_id) DO UPDATE SET n = n + 1, gm = gm + excluded.gm, cl = cl + excluded.cl, cl_in = cl_in + excluded.cl_in, cl_out = cl_out + excluded.cl_out`)
    .bind(utcDay(), id, f === 'gm' ? 1 : 0, f === 'claude' ? 1 : 0, tin, tout).run();
}
async function playerAi(req, env, ip, ctx) {
  if (await limited(env.RL_DEVICE, 'ai:' + ip)) return json({ error: 'Troppe richieste' }, 429);
  let b;
  try { b = await readJSON(req, 8192); } catch (e) { return json({ error: e.message }, e.status || 400); }
  const [d, bad] = await deviceAuth(env, b);
  if (bad) return bad;
  if (!env.GEMINI_API_KEY && !env.ANTHROPIC_API_KEY) return json({ off: true });
  const [P] = await activeAccount(env, d);
  if (!P) return json({ error: 'Abbonamento non attivo' }, 403);
  if (permsParse(P.perms).ai === false) return json({ error: 'Assistente non attivo su questo abbonamento' }, 403);
  const set = await getSettings(env), limit = aiLimitOf(P, set), used = await aiUsed(env, P.id);
  if (limit === 0 && !(+P.ai_extra > 0)) return json({ error: 'Assistente non attivo su questo abbonamento' }, 403);
  let extra = false;
  if (used >= limit) {
    const r = await env.DB.prepare('UPDATE devices SET ai_extra = ai_extra - 1 WHERE id = ? AND ai_extra > 0').bind(P.id).run();
    if (!r.meta || r.meta.changes !== 1) return json({ error: `Hai usato le ${limit} domande di oggi. Puoi chiederne altre al fornitore.`, limit: true, used, max: limit }, 429);
    extra = true;
  }
  const back = () => (extra ? env.DB.prepare('UPDATE devices SET ai_extra = ai_extra + 1 WHERE id = ?').bind(P.id).run() : null);
  const q = nameClean(b.q, 200), c = b.ctx && typeof b.ctx === 'object' ? b.ctx : {};
  if (q.length < 2) { await back(); return json({ error: 'Scrivi una domanda' }, 400); }
  const info = [
    c.kind === 'live' ? `Canale TV: ${nameClean(c.ch, 80)}` : '', `Titolo: ${nameClean(c.title, 120)}`,
    `Tipo: ${c.kind === 'series' ? 'serie TV' : c.kind === 'live' ? 'programma in diretta' : 'film'}`,
    c.year ? `Anno: ${str(c.year, 8)}` : '', c.genre ? `Generi: ${nameClean(c.genre, 100)}` : '', c.cast ? `Cast: ${nameClean(c.cast, 200)}` : '',
    c.plot ? `Trama dalla playlist: ${nameClean(c.plot, 600)}` : '',
  ].filter(Boolean).join('\n');
  const text = `${info}\n\nDomanda: ${q}`;
  const left = () => Math.max(0, limit - used - 1) + Math.max(0, +P.ai_extra - (extra ? 1 : 0));
  const ok = (answer, f, tin, tout) => { ctx.waitUntil(aiCount(env, P.id, f, tin, tout)); return json({ answer: (answer || 'Non ho una risposta per questa domanda.').slice(0, 2000), left: left(), by: AI_NAMES[f] }); };
  const first = AI_PROVIDERS.includes(P.ai_provider) ? P.ai_provider : aiProvOf(set);
  for (const prov of [first, ...AI_PROVIDERS.filter((x) => x !== first)]) {
    if (prov === 'claude' && env.ANTHROPIC_API_KEY) {
      let r = null;
      try { r = await claudeAsk(env, set.aiClaude, text); } catch {}
      if (r && r.status === 200 && r.answer) return ok(r.answer, 'claude', r.tin, r.tout);
      if (r && [401, 403].includes(r.status)) ctx.waitUntil(log(env, 'off', `Assistente IA: Anthropic ha rifiutato la chiave ANTHROPIC_API_KEY (errore ${r.status}). Controlla di aver copiato la chiave giusta da console.anthropic.com`, ip));
      else if (r && r.status === 400 && /credit|balance|billing/i.test(r.err)) ctx.waitUntil(log(env, 'off', 'Assistente IA: credito di Claude finito. Ricarica su console.anthropic.com → Billing (intanto risponde Gemini, se è collegato)', ip));
      else if (!(await throttled(env, 'aierr:claude', 1, 600e3))) ctx.waitUntil(log(env, 'off', `Assistente IA: Claude non ha risposto (${r ? 'errore ' + r.status + (r.err ? ': ' + str(r.err, 160) : '') : 'nessuna risposta dal server di Anthropic'}); ha risposto l'altra IA`, ip));
    }
    if (prov === 'gm' && env.GEMINI_API_KEY) {
      const list = (AI_GEMINI_MODELS[set.aiGemini] || AI_GEMINI_MODELS.flash).list;
      let last = 0;
      for (const [model, think] of list) {
        let r;
        try { r = await geminiAsk(env, model, text, think); } catch { last = 502; continue; }
        if (r.status === 200 && r.answer) return ok(r.answer, 'gm');
        last = r.status;
        if (r.status === 200 || [429, 404, 500, 503].includes(r.status)) continue;
        break;
      }
      if ([400, 401, 403].includes(last)) ctx.waitUntil(log(env, 'off', `Assistente IA: Google ha rifiutato la chiave GEMINI_API_KEY o la richiesta (errore ${last}). Controlla la chiave su aistudio.google.com`, ip));
      if (last === 429) ctx.waitUntil(log(env, 'off', 'Assistente IA: Gemini ha finito le risposte gratuite per ora (riprova più tardi o collega Claude)', ip));
    }
  }
  await back();
  return json({ error: 'L\'assistente non riesce a rispondere adesso: riprova tra poco.' }, 502);
}
/* richiesta di altre domande all'assistente (dall'app, quando finiscono quelle del giorno) */
async function playerAiMore(env, d, P, ip, ctx) {
  if (permsParse(P.perms).ai === false) return json({ error: 'Assistente non attivo su questo abbonamento' }, 403);
  if (await env.DB.prepare("SELECT 1 AS x FROM requests WHERE kind = 'ai' AND device_id = ? AND status <> 'done'").bind(P.id).first()) return json({ ok: true, already: true });
  if (await throttled(env, 'rqi:' + P.id, 5, 86400e3)) return json({ error: 'Hai già chiesto più volte oggi: aspetta la risposta del fornitore' }, 429);
  const set = await getSettings(env), limit = aiLimitOf(P, set), used = await aiUsed(env, P.id);
  await addRequest(env, P, 'ai', { ctype: 'ai', title: 'Altre domande all\'assistente IA', body: `Oggi ha usato ${used} domande su ${limit}`, info: 'ai' }, ip);
  ctx.waitUntil(log(env, 'req', `Richiesta di altre domande all'assistente da ${P.name || P.code}`, ip));
  return json({ ok: true });
}
/* pannello: pagina «Assistente IA» */
async function adminAi(req, env, path, who, ip) {
  const m = req.method;
  if (path === '/ai' && m === 'GET') {
    const day = utcDay(), set = await getSettings(env);
    const days = ((await env.DB.prepare("SELECT day, SUM(n) AS n, SUM(gm) AS gm, SUM(cl) AS cl, SUM(cl_in) AS cl_in, SUM(cl_out) AS cl_out FROM ai_usage WHERE device_id <> '_cf' AND day >= ? GROUP BY day ORDER BY day").bind(utcDay(now() - 29 * 864e5)).all()).results) || [];
    const cm = AI_CLAUDE_MODELS[set.aiClaude] || AI_CLAUDE_MODELS.haiku, cost = (r) => ((+r.cl_in || 0) * cm.pin + (+r.cl_out || 0) * cm.pout) / 1e6;
    const rows = ((await env.DB.prepare("SELECT u.device_id AS id, u.n, u.gm, u.cl, d.name, d.code, d.ai_limit, d.ai_extra, d.ai_provider FROM ai_usage u LEFT JOIN devices d ON d.id = u.device_id WHERE u.day = ? AND u.device_id <> '_cf' ORDER BY u.n DESC LIMIT 200").bind(day).all()).results) || [];
    const t = days.find((x) => x.day === day) || { n: 0, gm: 0, cl: 0 };
    return json({
      status: { gemini: !!env.GEMINI_API_KEY, claude: !!env.ANTHROPIC_API_KEY },
      today: { day, n: t.n || 0, gm: t.gm || 0, cl: t.cl || 0, usd: +cost(t).toFixed(4) },
      month: { n: days.reduce((a, r) => a + (+r.n || 0), 0), cl: days.reduce((a, r) => a + (+r.cl || 0), 0), usd: +days.reduce((a, r) => a + cost(r), 0).toFixed(4) },
      days: days.slice(-14).map((r) => ({ day: r.day, n: r.n, gm: r.gm, cl: r.cl })),
      clients: rows.map((r) => ({ id: r.id, name: r.name || '', code: r.code || '', n: r.n, gm: r.gm || 0, cl: r.cl || 0, limit: r.ai_limit >= 0 ? r.ai_limit : set.aiDaily ?? 20, own: r.ai_limit >= 0, extra: r.ai_extra || 0, provider: AI_PROVIDERS.includes(r.ai_provider) ? r.ai_provider : '' })),
      settings: { aiDaily: set.aiDaily ?? 20, aiProvider: aiProvOf(set), aiClaude: AI_CLAUDE_MODELS[set.aiClaude] ? set.aiClaude : 'haiku', aiGemini: AI_GEMINI_MODELS[set.aiGemini] ? set.aiGemini : 'flash' },
      claudeModels: Object.entries(AI_CLAUDE_MODELS).map(([k, v]) => ({ id: k, name: v.name })), geminiModels: Object.entries(AI_GEMINI_MODELS).map(([k, v]) => ({ id: k, name: v.name })),
    });
  }
  if (path === '/ai/test' && m === 'POST') {
    // «Prova»: una domanda di prova per vedere subito se la chiave e il credito funzionano (e perché no)
    const b = await readJSON(req, 1024), set = await getSettings(env), t0 = now(), text = 'Titolo: Prova\n\nDomanda: rispondi solo con la parola OK';
    if (b.provider === 'claude') {
      if (!env.ANTHROPIC_API_KEY) return json({ ok: false, error: 'Manca il segreto ANTHROPIC_API_KEY su Cloudflare' });
      let r; try { r = await claudeAsk(env, set.aiClaude, text); } catch (e) { return json({ ok: false, error: 'Il server di Anthropic non risponde: ' + str(String(e && e.message), 120) }); }
      const why = r.status === 401 ? 'Chiave sbagliata o revocata: creane una nuova su console.anthropic.com → API Keys' : r.status === 400 && /credit|balance|billing/i.test(r.err) ? 'Credito finito o mai caricato: console.anthropic.com → Billing' : r.status === 404 ? 'Modello non disponibile per il tuo account: prova Claude Haiku' : r.status === 429 ? 'Troppe richieste o limite di spesa raggiunto (console.anthropic.com → Limits)' : r.status === 529 ? 'Anthropic è sovraccarico in questo momento: riprova tra poco' : '';
      return json({ ok: r.status === 200 && !!r.answer, status: r.status, ms: now() - t0, model: (AI_CLAUDE_MODELS[set.aiClaude] || AI_CLAUDE_MODELS.haiku).id, answer: str(r.answer, 200), error: r.status === 200 ? '' : why || ('Errore ' + r.status + (r.err ? ': ' + str(r.err, 200) : '')) });
    }
    if (b.provider === 'gm') {
      if (!env.GEMINI_API_KEY) return json({ ok: false, error: 'Manca il segreto GEMINI_API_KEY su Cloudflare' });
      const [model, think] = (AI_GEMINI_MODELS[set.aiGemini] || AI_GEMINI_MODELS.flash).list[0];
      let r; try { r = await geminiAsk(env, model, text, think); } catch (e) { return json({ ok: false, error: 'Il server di Google non risponde' }); }
      return json({ ok: r.status === 200 && !!r.answer, status: r.status, ms: now() - t0, model, answer: str(r.answer, 200), error: r.status === 200 ? '' : r.status === 429 ? 'Limite gratuito di Google raggiunto per ora' : [400, 401, 403].includes(r.status) ? 'Chiave sbagliata: controllala su aistudio.google.com' : 'Errore ' + r.status });
    }
    throw new HttpErr(400, 'Servizio non valido');
  }
  if (path === '/ai/grant' && m === 'POST') {
    const b = await readJSON(req, 1024), n = parseInt(b.n, 10), id = str(b.deviceId, 20);
    if (!(n >= 1 && n <= 1000)) throw new HttpErr(400, 'Da 1 a 1000 domande');
    const d = await env.DB.prepare("SELECT id, name, code, parent FROM devices WHERE id = ?").bind(id).first();
    if (!d || d.parent) throw new HttpErr(404, 'Cliente non trovato');
    await env.DB.prepare('UPDATE devices SET ai_extra = MIN(ai_extra + ?, 10000) WHERE id = ?').bind(n, d.id).run();
    await log(env, 'edit', `${who}: +${n} domande all'assistente per ${d.name || d.code}`, ip);
    return json({ ok: true });
  }
  return null;
}
/* ricerca per attore: titoli in cui ha recitato (l'app li confronta con la propria libreria) */
async function playerPerson(req, env, ip, url, ctx) {
  if (await limited(env.RL_DEVICE, 'ps:' + ip)) return json({ error: 'Troppe richieste' }, 429);
  const q = nameClean(url.searchParams.get('q') || '', 60);
  if (!env.TMDB_KEY) return json({ people: [], off: true });
  if (q.length < 3) return json({ people: [] });
  const key = 'prs:' + (await sha256(q.toLowerCase())).slice(0, 24);
  const c = await env.DB.prepare('SELECT v FROM settings WHERE k = ?').bind(key).first();
  if (c) { try { const v = JSON.parse(c.v); if (now() - v.t < 7 * 864e5) return json({ people: v.people || [] }); } catch {} }
  const get = tmdbGet(env);
  let people = [];
  try {
    const res = ((await get(`/search/person?query=${encodeURIComponent(q)}&language=it-IT`)).results || []).filter((p) => p.known_for_department === 'Acting' || !p.known_for_department).slice(0, 3);
    for (const p of res) {
      const cr = await get(`/person/${p.id}/combined_credits?language=it-IT`).catch(() => ({}));
      const credits = (cr.cast || []).filter((x) => x.media_type === 'movie' || x.media_type === 'tv').sort((a, b) => (b.popularity || 0) - (a.popularity || 0)).slice(0, 120)
        .map((x) => ({ t: String(x.title || x.name || '').slice(0, 120), o: String(x.original_title || x.original_name || '').slice(0, 120), y: +String(x.release_date || x.first_air_date || '').slice(0, 4) || 0, k: x.media_type === 'tv' ? 'series' : 'movie' }));
      people.push({ name: String(p.name || '').slice(0, 80), credits });
    }
  } catch { return json({ people: [] }); }
  if (await cacheOk(env, url, 'cwp:', people.length > 0)) ctx.waitUntil(env.DB.prepare('INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind(key, JSON.stringify({ people, t: now() })).run());
  return json({ people });
}
/* titolo pulito: via prefissi di lingua/qualità ("IT |", "|4K|"), anni, parentesi, "multi-sub", stagioni */
function trailerTitle(t) {
  return String(t || '')
    .replace(/[\[(][^\])]*[\])]/g, ' ')
    .replace(/^\W*(it|ita|en|eng|4k|uhd|fhd|hd|sd|vip|multi|sub[- ]?ita|netflix|nf|amz|prime|disney\+?)\s*[|:\-–]\s*/i, '')
    .replace(/^\W*(it|ita|en|eng|4k|uhd|fhd|hd|vip|multi)\s*[|:\-–]\s*/i, '')
    .replace(/\b(19|20)\d{2}\b/g, ' ')
    .replace(/\b(4k|uhd|fhd|1080p|720p|hdr|dolby vision|ita|eng|sub ?ita|multi(sub)?)\b/gi, ' ')
    .replace(/\b(s\d{1,2}\s*e\d{1,3}|stagione\s*\d+|season\s*\d+)\b.*$/i, ' ')
    .replace(/[|•·_]+/g, ' ').replace(/\s+/g, ' ').trim();
}
const yearIn = (t) => { const m = String(t || '').match(/\b(19[3-9]\d|20[0-4]\d)\b/); return m ? +m[1] : 0; };
const normT = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
/* 1) TMDB (se c'è la chiave): trailer ufficiale su YouTube, prima in italiano */
async function trailerTmdb(env, title, year, kind) {
  const k = String(env.TMDB_KEY).trim(), bearer = k.length > 40, t = kind === 'series' ? 'tv' : 'movie';
  const H = { Accept: 'application/json', ...(bearer ? { Authorization: 'Bearer ' + k } : {}) }, ak = bearer ? '' : '&api_key=' + encodeURIComponent(k);
  const get = async (u) => { const r = await fetch('https://api.themoviedb.org/3' + u + ak, { headers: H, signal: AbortSignal.timeout(7000) }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); };
  const yq = year ? (t === 'tv' ? '&first_air_date_year=' : '&year=') + year : '';
  let res = (await get(`/search/${t}?query=${encodeURIComponent(title)}&language=it-IT${yq}`)).results || [];
  if (!res.length && yq) res = (await get(`/search/${t}?query=${encodeURIComponent(title)}&language=it-IT`)).results || [];
  const hit = res[0]; if (!hit) return null;
  const pick = (v) => { const yt = (v.results || []).filter((x) => x.site === 'YouTube' && /^[\w-]{11}$/.test(x.key)); return yt.find((x) => x.type === 'Trailer' && x.official) || yt.find((x) => x.type === 'Trailer') || yt.find((x) => x.type === 'Teaser') || null; };
  const v = pick(await get(`/${t}/${hit.id}/videos?language=it-IT`)) || pick(await get(`/${t}/${hit.id}/videos?language=en-US`));
  return v ? { yt: v.key, title: hit.title || hit.name || title, src: 'tmdb' } : null;
}
/* 2) YouTube: primo video della ricerca "titolo anno trailer ita" (nessuna chiave) */
async function trailerYoutube(title, year, kind, want) {
  const q = `${title}${year ? ' ' + year : ''} ${kind === 'series' ? 'serie tv ' : ''}trailer ita`;
  const r = await fetch('https://www.youtube.com/results?hl=it&gl=IT&search_query=' + encodeURIComponent(q), {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36', 'Accept-Language': 'it-IT,it;q=0.9', Cookie: 'CONSENT=YES+cb.20240101-00-p0.it+FX+100; SOCS=CAI' },
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const html = await r.text();
  const found = [];
  const re = /"videoRenderer":\{"videoId":"([\w-]{11})"[\s\S]{0,1500}?"title":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"/g;
  let m; while ((m = re.exec(html)) && found.length < 8) { let tt = m[2]; try { tt = JSON.parse('"' + tt + '"'); } catch {} found.push({ id: m[1], t: tt }); }
  if (!found.length) { const ids = [...html.matchAll(/"videoId":"([\w-]{11})"/g)].map((x) => x[1]); if (!ids.length) throw new Error('nessun risultato'); return { yt: ids[0], title, src: 'youtube' }; }
  const words = want.split(' ').filter((w) => w.length > 2);
  const score = (v) => { const n = normT(v.t); return words.filter((w) => n.includes(w)).length * 3 + (/trailer|teaser/i.test(v.t) ? 2 : 0) + (/\bita|italiano\b/i.test(v.t) ? 1 : 0); };
  const best = found.map((v, i) => ({ ...v, s: score(v) - i * 0.3 })).sort((a, b) => b.s - a.s)[0];
  return { yt: best.id, title: best.t, src: 'youtube' };
}
/* 3) Apple: anteprima video ufficiale (file diretto, si guarda nel lettore dell'app) */
async function trailerItunes(title, year, kind, want) {
  let best = null, ok = false;
  for (const country of ['it', 'us']) {
    const q = kind === 'series' ? `media=tvShow&entity=tvSeason` : `media=movie&entity=movie`;
    const r = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(title)}&country=${country}&${q}&limit=10`, { headers: { 'User-Agent': 'KairosPanel' }, signal: AbortSignal.timeout(7000) }).catch(() => null);
    if (!r || !r.ok) continue;
    ok = true;
    const j = await r.json().catch(() => ({}));
    for (const x of j.results || []) {
      if (!x.previewUrl || !/^https:\/\//.test(x.previewUrl)) continue;
      const name = normT(kind === 'series' ? String(x.collectionName || '').replace(/,?\s*(stagione|season)\s*\d+.*$/i, '') : x.trackName);
      const y = parseInt(String(x.releaseDate || '').slice(0, 4), 10) || 0;
      const score = (name === want ? 10 : name.startsWith(want) || want.startsWith(name) ? 5 : name.includes(want) || want.includes(name) ? 3 : 0) + (year && y ? (y === year ? 4 : Math.abs(y - year) <= 1 ? 2 : -3) : 0);
      if (score >= 3 && (!best || score > best.score)) best = { score, url: x.previewUrl, title: x.trackName || x.collectionName || '' };
    }
    if (best && best.score >= 10) break;
  }
  if (!ok) throw new Error('Apple non raggiungibile');
  return best ? { url: best.url, title: best.title, src: 'itunes' } : null;
}
async function adminPresence(env) {
  const t = now();
  const rows = ((await env.DB.prepare('SELECT p.*, d.name, d.code, d.expires, d.active, d.parent, d.playlists AS has_pl, d.model AS dmodel FROM presence p JOIN devices d ON d.id = p.device_id WHERE p.t > ? ORDER BY p.t DESC LIMIT 1000').bind(t - 86400e3).all()).results) || [];
  const pids = [...new Set(rows.filter((r) => r.parent).map((r) => r.parent))];
  const parents = new Map();
  // clienti principali delle connessioni collegate: una sola query ogni 90 (il piano gratuito ne concede 50 per richiesta)
  for (let i = 0; i < pids.length; i += 90) {
    const part = pids.slice(i, i + 90);
    for (const p of (await env.DB.prepare(`SELECT id, name, code, active, expires, playlists, parent FROM devices WHERE id IN (${part.map(() => '?').join(',')})`).bind(...part).all()).results || []) parents.set(p.id, p);
  }
  const stOf = (d) => statusOf(d, d.playlists || d.has_pl ? [1] : []);
  const online = [], recent = [];
  for (const r of rows) {
    const P = r.parent ? parents.get(r.parent) : null;
    const o = { id: r.device_id, name: r.name || (P ? `${P.name || P.code} · ${r.dmodel || r.model || 'dispositivo'}` : ''), code: r.code, expires: r.parent ? (P ? P.expires : '') : r.expires, status: r.parent ? (P && !P.parent ? stOf(P) : 'pending') : stOf(r), parent: r.parent || '', owner: P ? P.name || P.code : '' };
    for (const c of PRESENCE_COLS) o[c] = r[c];
    if (!o.model) o.model = r.dmodel || '';
    o.ago = t - r.t;
    o.online = t - r.t <= ONLINE_MS;
    // segnali utili, calcolati qui per non far lavorare il pannello
    o.flags = [];
    if (r.ip2 && r.ip2 !== r.ip && r.t - r.ip2_t < 10 * 60e3) o.flags.push('ip');            // due IP diversi a pochi minuti: possibile condivisione
    if (r.home_country && r.country && r.country !== r.home_country) o.flags.push('country'); // paese diverso dal solito
    (o.online ? online : recent).push(o);
  }
  let top = [];
  try { top = ((await env.DB.prepare('SELECT kind, title, n FROM watch WHERE day = ? ORDER BY n DESC, title LIMIT 15').bind(dayIT(t)).all()).results) || []; } catch {}
  const total = ((await env.DB.prepare('SELECT COUNT(*) AS n FROM devices').first()) || { n: 0 }).n;
  const watching = online.filter((o) => o.state !== 'idle').length;
  return { online, recent, top, counts: { online: online.length, watching, idle: online.length - watching, total }, ts: t };
}
const onlineCount = async (env) => { try { return (await env.DB.prepare('SELECT COUNT(*) AS n FROM presence WHERE t > ?').bind(now() - ONLINE_MS).first()).n; } catch { return 0; } };

/* ====================================================================== */
/* Segnalazioni e richieste di contenuti                                   */
/* ====================================================================== */
const CTYPES = ['movie', 'series', 'live', 'addon'];
const REQ_STATUS = ['new', 'seen', 'done'];
async function addRequest(env, d, kind, f, ip) {
  await env.DB.prepare('INSERT INTO requests (device_id, kind, ctype, title, body, info, status, created, ip) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(d.id, kind, f.ctype || '', f.title || '', f.body || '', f.info || '', 'new', now(), ip).run();
}
/* "Richiedi un contenuto" dall'app: film, serie o canale che il cliente vorrebbe */
async function playerAddonRequest(req, env, ip, ctx, b, d, P) {
  const id = str(b.addon || '', 40), row = ADDONS.find((x) => x[0] === id), a = row && { id: row[0], name: row[1] };
  if (!a) return json({ error: 'Add-on non trovato' }, 404);
  const it = addonsFor(await getSettings(env), P).find((x) => x.id === id);
  if (!it) return json({ error: 'Add-on non disponibile' }, 404);
  if (it.own) return json({ ok: true, own: true });
  if (await env.DB.prepare("SELECT 1 AS x FROM requests WHERE kind = 'addon' AND device_id = ? AND info = ? AND status <> 'done'").bind(P.id, 'addon:' + id).first()) return json({ ok: true, already: true });
  if (await throttled(env, 'rqa:' + P.id, 10, 3600e3)) return json({ error: 'Hai inviato troppe richieste: riprova tra un\'ora' }, 429);
  await addRequest(env, P, 'addon', { ctype: 'addon', title: a.name, body: it.p ? 'Prezzo indicato: ' + str(it.p, 40) : '', info: 'addon:' + id }, ip);
  ctx.waitUntil(webhookSend(env, 'request.new', { code: P.code, name: P.name || '', ctype: 'addon', title: a.name, note: '' }));
  ctx.waitUntil(log(env, 'req', `Richiesta tema/add-on da ${P.name || P.code}: ${a.name}${d.id !== P.id ? ' (da un dispositivo collegato)' : ''}`, ip));
  return json({ ok: true });
}
async function playerRequest(req, env, ip, ctx) {
  if (await limited(env.RL_DEVICE, 'rq:' + ip)) return json({ error: 'Troppe richieste, riprova tra poco' }, 429);
  let b;
  try { b = await readJSON(req, 4096); } catch (e) { return json({ error: e.message }, e.status || 400); }
  const [d, bad] = await deviceAuth(env, b);
  if (bad) return bad;
  const [P] = await activeAccount(env, d);
  if (!P) return json({ error: 'Abbonamento non attivo' }, 403);
  if (b.ctype === 'addon' && b.addon) return playerAddonRequest(req, env, ip, ctx, b, d, P); // non dipende dal permesso «richieste»
  if (b.ctype === 'ai') return playerAiMore(env, d, P, ip, ctx);
  if (!permsOf(P).request) return json({ error: PERM_MSG }, 403);
  const title = nameClean(b.title, 120), body = nameClean(b.body, 400), ctype = CTYPES.includes(b.ctype) ? b.ctype : '';
  if (!title) return json({ error: 'Scrivi il titolo' }, 400);
  if (await throttled(env, 'rq:' + d.id, 10, 3600e3)) return json({ error: 'Hai inviato troppe richieste: riprova tra un\'ora' }, 429);
  await addRequest(env, d, 'content', { ctype, title, body }, ip);
  ctx.waitUntil(webhookSend(env, 'request.new', { code: d.code, name: d.name || '', ctype, title, note: body }));
  ctx.waitUntil(log(env, 'req', `Richiesta contenuto da ${P.name || d.code}: ${title}`, ip));
  return json({ ok: true });
}
const newCounts = async (env) => {
  const out = { reports: 0, requests: 0, addons: 0, ai: 0 };
  try {
    const r = ((await env.DB.prepare("SELECT kind, COUNT(*) AS n FROM requests WHERE status = 'new' GROUP BY kind").all()).results) || [];
    for (const x of r) { if (x.kind === 'report') out.reports = x.n; else if (x.kind === 'content') out.requests = x.n; else if (x.kind === 'addon') out.addons = x.n; else if (x.kind === 'ai') out.ai = x.n; }
  } catch {}
  return out;
};
async function adminRequests(req, env, path, url, who, ip) {
  const m = req.method;
  if (path === '/requests' && m === 'GET') {
    const kind = ['content', 'addon', 'ai'].includes(url.searchParams.get('kind')) ? url.searchParams.get('kind') : 'report';
    const rows = ((await env.DB.prepare('SELECT r.id, r.device_id, r.kind, r.ctype, r.title, r.body, r.info, r.status, r.created, r.ip, r.note, d.name, d.code, d.model FROM requests r LEFT JOIN devices d ON d.id = r.device_id WHERE r.kind = ? ORDER BY r.id DESC LIMIT 300').bind(kind).all()).results) || [];
    return json({ kind, items: rows.map((r) => ({ id: r.id, deviceId: r.device_id, kind: r.kind, ctype: r.ctype, title: r.title, body: r.body, info: r.info, status: r.status, created: r.created, ip: r.ip, note: r.note, name: r.name || '', code: r.code || '', model: r.model || '' })) });
  }
  if (path === '/requests' && m === 'DELETE') {
    const kind = url.searchParams.get('kind') || '', status = url.searchParams.get('status') || 'done';
    if (!['seen', 'done'].includes(status)) throw new HttpErr(400, 'Si possono svuotare solo le richieste viste o fatte');
    if (kind && !['report', 'content', 'addon', 'ai'].includes(kind)) throw new HttpErr(400, 'Tipo non valido');
    const r = kind ? await env.DB.prepare('DELETE FROM requests WHERE kind = ? AND status = ?').bind(kind, status).run() : await env.DB.prepare('DELETE FROM requests WHERE status = ?').bind(status).run();
    await log(env, 'del', `${who}: svuotate ${kind === 'content' ? 'richieste' : kind === 'addon' ? 'richieste di temi' : kind === 'report' ? 'segnalazioni' : 'segnalazioni e richieste'} (${status === 'done' ? 'fatte' : 'viste'})`, ip);
    return json({ ok: true, deleted: (r.meta && r.meta.changes) || 0 });
  }
  const rm = path.match(/^\/requests\/(\d{1,10})(\/status)?$/);
  if (rm && rm[2] && m === 'POST') {
    const b = await readJSON(req, 2048);
    const status = String(b.status || '');
    if (!REQ_STATUS.includes(status)) throw new HttpErr(400, 'Stato non valido');
    const note = typeof b.note === 'string' ? nameClean(b.note, 300) : null;
    const r = note === null ? await env.DB.prepare('UPDATE requests SET status = ? WHERE id = ?').bind(status, +rm[1]).run() : await env.DB.prepare('UPDATE requests SET status = ?, note = ? WHERE id = ?').bind(status, note, +rm[1]).run();
    if (!(r.meta && r.meta.changes)) throw new HttpErr(404, 'Richiesta non trovata');
    return json({ ok: true });
  }
  if (rm && !rm[2] && m === 'DELETE') {
    await env.DB.prepare('DELETE FROM requests WHERE id = ?').bind(+rm[1]).run();
    return json({ ok: true });
  }
  return null;
}

/* ====================================================================== */
/* Videoteca: catalogo film/serie dei server Xtream usati dai clienti      */
/* ====================================================================== */
const CAT_TTL = 3600e3, CAT_PAGE = 60, CAT_UA = 'Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36 KairosPlayer/1.7';
let srcMem = { t: 0, map: null };
/** sorgenti Xtream distinte tra tutte le playlist dei clienti: chiave → {host, user, pass, devices} (mai verso il pannello le credenziali) */
async function catalogSources(env) {
  if (srcMem.map && now() - srcMem.t < 5 * 60e3) return srcMem.map;
  const rows = ((await env.DB.prepare("SELECT id, playlists FROM devices WHERE playlists <> '' LIMIT 5000").all()).results) || [];
  const map = new Map();
  for (const d of rows) {
    const pls = await unseal(env, d.playlists).catch(() => []);
    const seen = new Set();
    for (const p of pls) {
      if (p.type !== 'xtream' || !p.host || !p.username) continue;
      const host = hostOf(p); if (!host) continue;
      const key = (await sha256(`src:${host}|${p.username}|${p.password}`)).slice(0, 16);
      if (seen.has(key)) continue; seen.add(key);
      const e = map.get(key) || { key, host, user: p.username, pass: p.password, devices: 0 };
      e.devices++; map.set(key, e);
    }
  }
  srcMem = { t: now(), map };
  return map;
}
const catMem = new Map(); // piccola cache in memoria (su workers.dev la cache di Cloudflare non è disponibile)
async function cachedJson(key, loader) {
  const m = catMem.get(key);
  if (m && now() - m.t < CAT_TTL) return m.v;
  const ck = new Request('https://kairos-cache.invalid/' + key);
  let cache = null; try { cache = typeof caches !== 'undefined' && caches.default ? caches.default : null; } catch {}
  if (cache) { try { const r = await cache.match(ck); if (r) { const v = await r.json(); catMem.set(key, { t: now(), v }); return v; } } catch {} }
  const v = await loader();
  if (catMem.size > 6) catMem.delete(catMem.keys().next().value);
  catMem.set(key, { t: now(), v });
  if (cache) { try { await cache.put(ck, new Response(JSON.stringify(v), { headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${CAT_TTL / 1000}` } })); } catch {} }
  return v;
}
async function xtreamGet(src, action) {
  const u = `${src.host}/player_api.php?username=${encodeURIComponent(src.user)}&password=${encodeURIComponent(src.pass)}&action=${action}`;
  const r = await fetch(u, { headers: { 'User-Agent': CAT_UA, Accept: 'application/json' }, signal: tmo(20000), redirect: 'follow' });
  if (!r.ok) throw new HttpErr(502, `Il server ha risposto ${r.status}`);
  const txt = await r.text();
  if (txt.length > 40 * 1024 * 1024) throw new HttpErr(502, 'Catalogo troppo grande');
  let j; try { j = JSON.parse(txt); } catch { throw new HttpErr(502, 'Il server non ha restituito un catalogo valido'); }
  return Array.isArray(j) ? j : j && typeof j === 'object' ? Object.values(j) : [];
}
/** catalogo normalizzato e già in cache: {cats:[{id,name}], items:[{id,name,year,cat,poster,rating,added}]} */
async function xtreamCatalog(src, kind) {
  return cachedJson(`catalog/${src.key}/${kind}`, async () => {
    const [cats, items] = await Promise.all([xtreamGet(src, kind === 'series' ? 'get_series_categories' : 'get_vod_categories'), xtreamGet(src, kind === 'series' ? 'get_series' : 'get_vod_streams')]);
    const okUrl = (u) => (typeof u === 'string' && /^https?:\/\//i.test(u) ? u.slice(0, 500) : '');
    const s = (v, n) => (v === undefined || v === null ? '' : String(v).slice(0, n));
    return {
      cats: cats.map((c) => ({ id: s(c.category_id, 20), name: nameClean(c.category_name, 60) || 'Altro' })).filter((c) => c.id),
      items: items.map((x) => (kind === 'series'
        ? { id: s(x.series_id, 20), name: nameClean(x.name, 160), year: (s(x.releaseDate || x.release_date, 10).match(/^\d{4}/) || [yearOf(x.name)])[0] || '', cat: s(x.category_id, 20), poster: okUrl(x.cover), rating: num(x.rating_5based ? x.rating_5based * 2 : x.rating, 0, 10), added: +x.last_modified || 0 }
        : { id: s(x.stream_id, 20), name: nameClean(x.name, 160), year: yearOf(x.name) || '', cat: s(x.category_id, 20), poster: okUrl(x.stream_icon), rating: num(x.rating_5based ? x.rating_5based * 2 : x.rating, 0, 10), added: +x.added || 0 })).filter((x) => x.id && x.name),
    };
  });
}
async function adminCatalog(env, url) {
  const srcs = await catalogSources(env);
  const key = str(url.searchParams.get('src'), 16), src = /^[A-Za-z0-9_-]{16}$/.test(key) ? srcs.get(key) : null;
  if (!src) throw new HttpErr(400, 'Scegli una sorgente');
  const kind = url.searchParams.get('kind') === 'series' ? 'series' : 'movies';
  const q = nameClean(url.searchParams.get('q') || '', 80).toLowerCase(), cat = str(url.searchParams.get('cat'), 20);
  const page = Math.max(1, Math.min(10000, parseInt(url.searchParams.get('page') || '1', 10) || 1));
  const data = await xtreamCatalog(src, kind);
  let items = q ? data.items.filter((x) => x.name.toLowerCase().includes(q)) : data.items;
  const perCat = new Map();
  for (const x of items) perCat.set(x.cat, (perCat.get(x.cat) || 0) + 1);
  if (cat) items = items.filter((x) => x.cat === cat);
  const catName = new Map(data.cats.map((c) => [c.id, c.name]));
  const cats = data.cats.map((c) => ({ ...c, n: perCat.get(c.id) || 0 })).filter((c) => c.n || !q);
  return { total: items.length, page, pages: Math.max(1, Math.ceil(items.length / CAT_PAGE)), cats, items: items.slice((page - 1) * CAT_PAGE, page * CAT_PAGE).map((x) => ({ ...x, catName: catName.get(x.cat) || '' })), kind, src: key };
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
    if (path === '/api/player/heartbeat' && req.method === 'POST') return playerHeartbeat(req, env, ip, ctx);
    if (path === '/api/player/errors' && req.method === 'POST') return playerErrors(req, env, ip, ctx);
    if (path === '/api/player/stream' && req.method === 'POST') return playerStream(req, env, ip, ctx);
    if (path === '/api/player/trailer' && req.method === 'GET') return playerTrailer(req, env, ip, url, ctx);
    if (path === '/api/player/meta' && req.method === 'GET') return playerMeta(req, env, ip, url, ctx);
    if (path === '/api/player/addon' && req.method === 'POST') return playerAddon(req, env, ip);
    if (path === '/api/player/addon-preview' && req.method === 'POST') return playerAddonPreview(req, env, ip);
    if (path === '/api/player/ai' && req.method === 'POST') return playerAi(req, env, ip, ctx);
    if (path === '/api/player/person' && req.method === 'GET') return playerPerson(req, env, ip, url, ctx);
    if (path === '/api/player/request' && req.method === 'POST') return playerRequest(req, env, ip, ctx);
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

  /* ---------- API di integrazione (chiave API) ---------- */
  if (path === '/api/v1' || path.startsWith('/api/v1/')) {
    try { return await apiV1(req, env, url, ip, ctx); }
    catch (e) { if (e instanceof HttpErr) return json({ error: e.message }, e.status); throw e; }
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
const LITE_APK = 'https://github.com/mariopiccolo8562-lang/kairos-lite/releases/latest/download/kairos-lite.apk';
let liteMem = { t: 0, k: '', v: null };
async function liteFeed(s) {
  const apk = s.liteApkUrl || LITE_APK, url = apk.replace(/\.apk(\?.*)?$/i, '.json');
  if (liteMem.k === url && now() - liteMem.t < 10 * 60e3) return liteMem.v;
  let v = null;
  if (/^https:\/\/.+\.json$/i.test(url)) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'KairosPanel' }, signal: AbortSignal.timeout(6000) });
      if (r.ok) { const j = await r.json(); v = { version: String(j.version || '').replace(/^v/i, '').slice(0, 20), date: String(j.date || '').slice(0, 40), url: /^https:\/\//.test(j.url || '') ? String(j.url).slice(0, 500) : apk }; }
    } catch {}
  }
  liteMem = { t: now(), k: url, v };
  return v;
}
/** manutenzione: l'app è bloccata per tutti tranne i clienti scelti nel pannello (P = abbonamento principale) */
const maintFor = (s, P) => !!(s.maint && s.maint.on && P && !(s.maint.allow || []).includes(P.id));
const MAINT_MSG = 'Servizio in manutenzione: torna disponibile a breve. Grazie per la pazienza!';
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
    d = { id: b64url(rand(9)), code, secret_hash: sh, name: '', model, notes: '', active: 0, expires: '', playlists: '', created_at: now(), last_seen: now(), last_ip: ip, perms: defaultPermsJson(await getSettings(env)) };
    await env.DB.prepare('INSERT INTO devices (id, code, secret_hash, model, created_at, last_seen, last_ip, perms, max_streams) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)')
      .bind(d.id, code, sh, model, d.created_at, d.last_seen, ip, d.perms).run();
    ctx.waitUntil(log(env, 'new', `Nuovo dispositivo in attesa: ${code}${model ? ' (' + model + ')' : ''}`, ip));
    ctx.waitUntil(webhookSend(env, 'device.new', { id: d.id, code, model, ip }));
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
  ctx.waitUntil(presenceFromRegister(env, d, b, ip, cfOf(req)));

  // un dispositivo collegato usa stato, scadenza, playlist, profili e limiti del suo principale
  const P = await primaryOf(env, d);
  const pls = P ? await unseal(env, P.playlists).catch(() => []) : [];
  const s = await getSettings(env);
  let status = P ? statusOf(P, pls) : 'pending';
  if (status === 'active' && maintFor(s, P)) status = 'maintenance';
  const out = { status, ...(status === 'maintenance' ? { maintMsg: (s.maint && s.maint.msg) || MAINT_MSG } : {}), name: P ? P.name : '', expires: P ? P.expires : '', settings: publicSettings(s), playlists: status === 'active' ? pls : [], messages: await deviceMessages(env, d.id, P && P.id) };
  if (status === 'active') {
    out.account = await accountOf(env, P, d, pls);
    out.vpn = await vpnOf(env, P, d);
    out.perms = permsOf(P); // i collegati ereditano i permessi del principale
    out.addons = addonsFor(s, P); out.adg = P.addons || ''; // add-on (i collegati usano quelli del principale)
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
  const d = await env.DB.prepare('SELECT id, name, secret_hash, parent, perms FROM devices WHERE code = ?').bind(code).first();
  if (!d || !d.secret_hash || !safeEq(d.secret_hash, await sha256('dev:' + secret))) return json({ error: 'Dispositivo non riconosciuto' }, 403);
  const P = (await primaryOf(env, d)) || d;
  if (!permsOf(P).report) return json({ error: PERM_MSG }, 403);
  if (await throttled(env, 'rep:' + d.id, 20, 3600e3)) return json({ error: 'Troppe segnalazioni, riprova più tardi' }, 429);
  const kind = nameClean(b.kind, 40), text = nameClean(b.text, 400), info = nameClean(b.info, 400);
  await addRequest(env, d, 'report', { title: kind, body: text, info }, ip).catch(() => {}); // sezione "Segnalazioni" del pannello
  ctx.waitUntil(webhookSend(env, 'report.new', { code, name: P.name || d.name || '', kind, text, info }));
  ctx.waitUntil(log(env, 'report', `Segnalazione da ${P.name || d.name || code} · ${kind}${text ? ': ' + text : ''}${info ? ' [' + info + ']' : ''}`, ip));
  return json({ ok: true });
}

/* ---------------- pannello ---------------- */
function cookieOf(req) { return (req.headers.get('Cookie') || '').match(new RegExp('(?:^|;\\s*)' + COOKIE.replace(/[-$]/g, '\\$&') + '=([^;]+)'))?.[1] || ''; }
async function getSession(req, env) {
  const tok = cookieOf(req);
  if (!tok) return null;
  const id = await sha256('ses:' + tok);
  const s = await env.DB.prepare('SELECT s.id, s.expires, a.id AS admin_id, a.username, a.totp_on, a.role, a.active, a.last_seen FROM sessions s JOIN admins a ON a.id = s.admin_id WHERE s.id = ?').bind(id).first();
  if (!s || s.expires < now()) return null;
  return s;
}
const setCookie = (tok, maxAge) => `${COOKIE}=${tok}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`;

const RENEW = new WeakMap();
async function admin(req, env, url, ip, ctx) {
  const res = await adminInner(req, env, url, ip, ctx);
  const tok = RENEW.get(req);
  if (tok && res && !res.headers.has('Set-Cookie')) { try { res.headers.append('Set-Cookie', setCookie(tok, SESSION_TTL)); } catch {} }
  return res;
}
async function adminInner(req, env, url, ip, ctx) {
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
  // rinnovo automatico: chi usa il pannello resta collegato (al massimo un aggiornamento ogni 6 ore)
  if (ses.expires - now() < SESSION_TTL * 1000 - 6 * 3600e3 && path !== '/logout') {
    await env.DB.prepare('UPDATE sessions SET expires = ? WHERE id = ?').bind(now() + SESSION_TTL * 1000, ses.id).run();
    RENEW.set(req, cookieOf(req));
  }
  if (ses.role === 'agent') return agentRoutes(req, env, url, path, ses, ip, ctx);
  return adminRoutes(req, env, url, path, ses.username, ip, ctx, ses);
}
/* ======================================================================
   AGENTI (reseller): entrano nel pannello con le loro credenziali (2FA facoltativa) e vedono SOLO i propri clienti
   e quelli dei loro sotto-agenti. Cosa possono fare lo decide chi li ha creati.
   ====================================================================== */
const AGENT_FLAGS = ['create', 'renew', 'disable', 'delete', 'kick', 'playlists', 'clientPerms', 'vpn', 'link', 'account', 'ai',
  'dash', 'online', 'errors', 'reports', 'contentReq', 'addonReq', 'messages', 'store', 'vod', 'activity'];
const AGENT_DEF = { create: true, renew: true, disable: true, delete: false, kick: true, playlists: true, clientPerms: false, vpn: false, link: true, account: false, ai: false,
  dash: true, online: false, errors: false, reports: false, contentReq: false, addonReq: false, messages: false, store: false, vod: false, activity: false, addons: [], maxConn: 1 };
function agentPerms(src) {
  let o = {}; try { o = typeof src === 'string' ? JSON.parse(src || '{}') : src || {}; } catch {}
  const p = { ...AGENT_DEF };
  for (const k of AGENT_FLAGS) if (typeof o[k] === 'boolean') p[k] = o[k];
  p.addons = addonsList(o.addons || []);
  p.maxConn = Math.max(1, Math.min(MAX_CONN, parseInt(o.maxConn, 10) || 1));
  return p;
}
/** permessi richiesti per un sotto-agente: mai più di quelli di chi lo crea */
function agentPermsWithin(req, top) {
  const p = agentPerms(req);
  if (!top) return p;
  for (const k of AGENT_FLAGS) if (!top[k]) p[k] = false;
  p.addons = p.addons.filter((x) => top.addons.includes(x));
  p.maxConn = Math.min(p.maxConn, top.maxConn);
  return p;
}
const agentsAll = async (env) => ((await env.DB.prepare("SELECT id, username, email, parent_id, max_clients, can_agents, perms, servers, active, disabled_by, notes, last_seen, created_at, totp_on, pw_seal FROM admins WHERE role = 'agent' ORDER BY id").all()).results) || [];
/** id dell'agente e di tutti i suoi sotto-agenti (a qualsiasi livello) */
function agentTree(all, rootId) {
  const out = [rootId], seen = new Set(out);
  for (let i = 0; i < out.length; i++) for (const a of all) if (a.parent_id === out[i] && !seen.has(a.id)) { seen.add(a.id); out.push(a.id); }
  return out;
}
async function agentChainActive(env, id, all) {
  all = all || (await agentsAll(env));
  const by = new Map(all.map((a) => [a.id, a]));
  for (let a = by.get(id), n = 0; a && n < 20; a = by.get(a.parent_id), n++) if (!a.active) return false;
  return by.has(id);
}
/** nome del server mostrato agli agenti: se il nome è l'indirizzo (DNS salvato senza nome) diventa «Server N» */
const svName = (x, i) => { const n = String((x && x.name) || ''), h = String((x && x.host) || '').replace(/^https?:\/\//, '').replace(/[:/].*$/, ''); return !n || /[.:/]/.test(n) || (h && n.toLowerCase().includes(h.toLowerCase())) ? 'Server ' + (i + 1) : n; };
const serverIds = (v) => [...new Set(String(v || '').split(',').map((x) => x.trim()).filter((x) => /^[A-Za-z0-9_-]{4,20}$/.test(x)))];
async function clientsCount(env, ids) {
  let n = 0;
  for (let i = 0; i < ids.length; i += 90) { const part = ids.slice(i, i + 90); n += ((await env.DB.prepare(`SELECT COUNT(*) AS n FROM devices WHERE parent = '' AND owner_id IN (${part.map(() => '?').join(',')})`).bind(...part).first()) || { n: 0 }).n; }
  return n;
}
async function agentsOut(env, all, onlyIds, forAgent) {
  const dns = await dnsList(env), dn = new Map(dns.map((x, i) => [x.id, forAgent ? { ...x, name: svName(x, i) } : x]));
  const counts = new Map();
  for (const r of ((await env.DB.prepare("SELECT owner_id, COUNT(*) AS n FROM devices WHERE parent = '' AND owner_id > 0 GROUP BY owner_id").all()).results) || []) counts.set(r.owner_id, r.n);
  const list = all.filter((a) => !onlyIds || onlyIds.includes(a.id)), out = [];
  for (const a of list) out.push(await (async () => {
    const tree = agentTree(all, a.id);
    return { id: a.id, username: a.username, email: a.email, parentId: a.parent_id, maxClients: a.max_clients, canAgents: !!a.can_agents, perms: agentPerms(a.perms),
      servers: serverIds(a.servers).filter((x) => dn.has(x)), serverNames: serverIds(a.servers).map((x) => dn.get(x)).filter(Boolean).map((x) => x.name),
      active: !!a.active, notes: a.notes, lastSeen: a.last_seen, createdAt: a.created_at, totp: !!a.totp_on, password: a.pw_seal ? await unseal(env, a.pw_seal).catch(() => '') : '',
      clients: tree.reduce((n, id) => n + (counts.get(id) || 0), 0), ownClients: counts.get(a.id) || 0, subAgents: tree.length - 1 };
  })());
  return out;
}
/** crea / modifica / elimina agenti. top = agente che sta agendo (null = proprietario) */
async function agentsAdmin(req, env, path, who, ip, top) {
  const m = req.method;
  const all = await agentsAll(env);
  const scope = top ? agentTree(all, top.id).filter((x) => x !== top.id) : all.map((a) => a.id);
  if (path === '/agents' && m === 'GET') return json({ agents: await agentsOut(env, all, scope, !!top) });
  const dnsIds = new Set((await dnsList(env)).map((x) => x.id));
  const clean = async (b, cur) => {
    const o = {};
    if (b.email !== undefined) { const e = str(b.email, 120); if (e && !/^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(e)) throw new HttpErr(400, 'Email non valida'); o.email = e; }
    if (b.notes !== undefined) o.notes = str(b.notes, 300);
    if (b.maxClients !== undefined) { const n = parseInt(b.maxClients, 10); if (!(n >= 0 && n <= 100000)) throw new HttpErr(400, 'Limite clienti non valido'); if (top && n > top.max_clients) throw new HttpErr(400, `Il limite non può superare il tuo (${top.max_clients})`); o.max_clients = n; }
    if (b.canAgents !== undefined) { if (top && !top.can_agents) throw new HttpErr(403, 'Non puoi creare sotto-agenti'); o.can_agents = b.canAgents === true ? 1 : 0; }
    if (b.perms !== undefined) o.perms = JSON.stringify(agentPermsWithin(b.perms, top ? agentPerms(top.perms) : null));
    if (b.servers !== undefined) { if (!Array.isArray(b.servers)) throw new HttpErr(400, 'servers deve essere un elenco'); let l = serverIds(b.servers.join(',')).filter((x) => dnsIds.has(x)); if (top) { const mine = serverIds(top.servers); l = l.filter((x) => mine.includes(x)); } o.servers = l.join(','); }
    if (typeof b.active === 'boolean' && (!cur || b.active !== !!cur.active)) {
      if (b.active && cur && top && cur.disabled_by && !agentTree(all, top.id).includes(cur.disabled_by)) throw new HttpErr(403, 'Disattivato da chi sta sopra di te: non puoi riattivarlo');
      o.active = b.active ? 1 : 0; o.disabled_by = b.active ? 0 : top ? top.id : -1;
    }
    if (b.password !== undefined && b.password !== '') { if (typeof b.password !== 'string' || b.password.length < 10 || b.password.length > 200) throw new HttpErr(400, 'Password di almeno 10 caratteri'); o.pass_hash = await hashPass(b.password); o.pw_seal = await seal(env, b.password); }
    return o;
  };
  if (path === '/agents' && m === 'POST') {
    if (top && !top.can_agents) throw new HttpErr(403, 'Non puoi creare sotto-agenti');
    const b = await readJSON(req, 16384);
    const user = str(b.username, 40);
    if (!/^[A-Za-z0-9._-]{3,40}$/.test(user)) throw new HttpErr(400, 'Nome utente: 3-40 caratteri tra lettere, numeri, punto, trattino');
    if (await env.DB.prepare('SELECT 1 AS x FROM admins WHERE username = ?').bind(user).first()) throw new HttpErr(400, 'Nome utente già usato');
    if (typeof b.password !== 'string' || b.password.length < 10 || b.password.length > 200) throw new HttpErr(400, 'Password di almeno 10 caratteri');
    if (all.length >= 1000) throw new HttpErr(400, 'Hai raggiunto il massimo di 1000 agenti');
    const o = await clean({ maxClients: top ? Math.min(10, top.max_clients) : 10, perms: {}, servers: [], ...b }, null);
    const r = await env.DB.prepare("INSERT INTO admins (username, pass_hash, created_at, role, parent_id, email, max_clients, can_agents, perms, servers, active, notes, pw_seal) VALUES (?, ?, ?, 'agent', ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id")
      .bind(user, o.pass_hash, now(), top ? top.id : 0, o.email || '', o.max_clients ?? 10, o.can_agents || 0, o.perms || JSON.stringify(AGENT_DEF), o.servers || '', o.active ?? 1, o.notes || '', o.pw_seal || '').first();
    await log(env, 'new', `${who}: creato l'agente ${user}${top ? ' (sotto-agente)' : ''}`, ip);
    return json({ ok: true, id: r.id });
  }
  const am = path.match(/^\/agents\/(\d{1,9})$/);
  if (!am) throw new HttpErr(404, 'Non trovato');
  const id = +am[1], A = all.find((a) => a.id === id);
  if (!A || !scope.includes(id)) throw new HttpErr(404, 'Agente non trovato');
  if (m === 'PUT') {
    const b = await readJSON(req, 16384);
    const o = await clean(b, A);
    if (b.resetTotp === true) { o.totp_on = 0; o.totp_secret = ''; o.totp_last = 0; }
    const keys = Object.keys(o);
    if (keys.length) await env.DB.prepare(`UPDATE admins SET ${keys.map((k) => k + ' = ?').join(', ')} WHERE id = ? AND role = 'agent'`).bind(...keys.map((k) => o[k]), id).run();
    if (o.pass_hash || o.active === 0 || b.resetTotp === true) await env.DB.prepare('DELETE FROM sessions WHERE admin_id = ?').bind(id).run(); // nuova password, disattivato o 2FA azzerata: si rientra
    await log(env, 'edit', `${who}: modificato l'agente ${A.username}${o.active === 0 ? ' (disattivato)' : o.active === 1 ? ' (attivato)' : ''}${b.resetTotp === true ? ' · 2FA azzerata' : ''}`, ip);
    return json({ ok: true });
  }
  if (m === 'DELETE') {
    // i suoi clienti e i suoi sotto-agenti passano a chi stava sopra di lui
    const up = A.parent_id;
    await env.DB.batch([
      env.DB.prepare('UPDATE devices SET owner_id = ? WHERE owner_id = ?').bind(up, id),
      env.DB.prepare("UPDATE admins SET parent_id = ? WHERE parent_id = ? AND role = 'agent'").bind(up, id),
      env.DB.prepare('DELETE FROM sessions WHERE admin_id = ?').bind(id),
      env.DB.prepare("DELETE FROM admins WHERE id = ? AND role = 'agent'").bind(id),
    ]);
    await log(env, 'off', `${who}: eliminato l'agente ${A.username} (clienti e sotto-agenti passati a ${up ? 'chi stava sopra' : 'te'})`, ip);
    return json({ ok: true });
  }
  throw new HttpErr(405, 'Metodo non consentito');
}
/** pannello dell'agente: solo queste funzioni, sempre limitate ai suoi clienti */
const AGENT_SELF = /^\/(logout|logout-all|password|totp\/(setup|enable|disable))$/;
/** dispositivo "libero": comparso sulla TV ma mai toccato dal pannello (né dal proprietario né da altri agenti) */
const FREE_DEV = "owner_id = 0 AND parent = '' AND active = 0 AND playlists = '' AND name = '' AND notes = '' AND expires = ''";
async function agentRoutes(req, env, url, path, ses, ip, ctx) {
  const m = req.method;
  const all = await agentsAll(env);
  if (!(await agentChainActive(env, ses.admin_id, all))) {
    await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(ses.id).run();
    throw new HttpErr(401, 'Account disattivato');
  }
  const A = all.find((a) => a.id === ses.admin_id);
  const by = new Map(all.map((a) => [a.id, a]));
  let P = agentPerms(A.perms), mine = serverIds(A.servers);
  let canAg = !!A.can_agents;
  for (let x = by.get(A.parent_id), n = 0; x && n < 20; x = by.get(x.parent_id), n++) { P = agentPermsWithin(P, agentPerms(x.perms)); const up = serverIds(x.servers); mine = mine.filter((y) => up.includes(y)); if (!x.can_agents) canAg = false; }
  const Aeff = { ...A, can_agents: canAg ? 1 : 0, perms: JSON.stringify(P), servers: mine.join(',') };
  const tree = agentTree(all, A.id), who = 'Agente ' + A.username;
  const aSes = { ...ses, agent: true };
  if (now() - (+A.last_seen || 0) > 5 * 60e3) ctx.waitUntil(env.DB.prepare('UPDATE admins SET last_seen = ? WHERE id = ?').bind(now(), A.id).run());
  if (path === '/password' && m === 'PUT') { const b = await readJSON(req, 4096); if (typeof b.next === 'string' && b.next.length >= 10 && b.next.length <= 200 && (await checkPass(str(b.current, 200), (await env.DB.prepare('SELECT pass_hash FROM admins WHERE id = ?').bind(A.id).first()).pass_hash))) ctx.waitUntil((async () => { await env.DB.prepare('UPDATE admins SET pw_seal = ? WHERE id = ?').bind(await seal(env, b.next), A.id).run(); })()); return adminRoutes(new Request(url.href, { method: 'PUT', body: JSON.stringify({ current: b.current, next: b.next }) }), env, url, path, who, ip, ctx, aSes); } // il nome utente lo cambia solo chi l'ha creato
  if (AGENT_SELF.test(path) && m !== 'GET') return adminRoutes(req, env, url, path, who, ip, ctx, aSes);
  if (path === '/agents' || path.startsWith('/agents/')) { if (!canAg) throw new HttpErr(403, 'Non puoi gestire agenti'); return agentsAdmin(req, env, path, who, ip, Aeff); }
  const dns = (await dnsList(env)).map((x, i) => ({ ...x, name: svName(x, i) })), servers = dns.filter((x) => mine.includes(x.id));
  // l'agente non vede gli indirizzi dei server: solo il nome del server scelto
  const dview = (x) => {
    const dn = new Map(dns.map((y) => [y.host, y]));
    const { hosts, vpnConf, ...rest } = x;
    return { ...rest, playlists: (x.playlists || []).map((p) => { const sv = dn.get(hostOf(p)); return { id: p.id, name: p.name, type: p.type, serverId: sv ? sv.id : '', serverName: sv ? sv.name : 'Altro server', username: p.username, password: p.password }; }) };
  };
  const own = async (id) => {
    const d = await env.DB.prepare('SELECT * FROM devices WHERE id = ?').bind(id).first();
    if (!d) return null;
    const P0 = d.parent ? await env.DB.prepare('SELECT owner_id FROM devices WHERE id = ?').bind(d.parent).first() : d;
    return P0 && tree.includes(+P0.owner_id || 0) ? d : null;
  };
  const allowedAddons = new Set(addonCfg(await getSettings(env)).filter((a) => a.mode === 'some' && P.addons.includes(a.id)).map((a) => a.id));
  // playlist scelte dall'agente: solo i server assegnati, con utente e password del cliente
  const plsFrom = (list, cur) => {
    if (!Array.isArray(list)) throw new HttpErr(400, 'playlists deve essere un elenco');
    if (list.length > 10) throw new HttpErr(400, 'Al massimo 10 playlist');
    return list.map((p, i) => {
      const old = p && p.id && (cur || []).find((x) => x.id === p.id);
      const sv = servers.find((x) => x.id === str(p && p.serverId, 20)) || (old && servers.find((x) => x.host === hostOf(old)));
      if (!sv) throw new HttpErr(400, 'Scegli uno dei server che ti sono stati assegnati');
      const username = str(p.username, 120) || (old && old.username) || '', password = typeof p.password === 'string' && p.password ? p.password.slice(0, 200) : (old && old.password) || '';
      if (!username || !password) throw new HttpErr(400, 'Inserisci utente e password della linea');
      return { id: old ? old.id : undefined, name: str(p.name, 60) || sv.name || 'Playlist ' + (i + 1), type: 'xtream', host: sv.host, username, password };
    });
  };
  const okDate = (e) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(e) || !DATE_RE.test(e)) throw new HttpErr(400, 'Scadenza non valida'); if (new Date(e + 'T00:00:00Z') - Date.now() > 3 * 366 * 864e5) throw new HttpErr(400, 'Scadenza massima: 3 anni'); return e; };
  const limitCheck = async (after) => {
    for (let x = A, n = 0; x && n < 20; x = by.get(x.parent_id), n++) {
      const used = await clientsCount(env, agentTree(all, x.id));
      if (after ? used > x.max_clients : used >= x.max_clients) throw new HttpErr(400, x.id === A.id ? `Hai raggiunto il limite di ${x.max_clients} clienti` : `Limite di clienti raggiunto (${x.username}: ${x.max_clients})`);
    }
  };
  const forward = (method, p, body) => adminRoutes(new Request(url.href, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }), env, url, p, who, ip, ctx, aSes);

  const apv = path.match(/^\/addon-preview\/([a-z0-9-]{3,40})$/);
  if (apv && m === 'GET') { if (!allowedAddons.has(apv[1])) throw new HttpErr(404, 'Anteprima non disponibile'); return adminRoutes(req, env, url, path, who, ip, ctx, aSes); }
  const need = (k, msg) => { if (!P[k]) throw new HttpErr(403, msg || 'Funzione non consentita: chiedila a chi ti ha creato'); };
  // tutti i dispositivi dei suoi clienti (principali e collegati)
  let scopeMem = null;
  const scope = async () => {
    if (scopeMem) return scopeMem;
    const ids = new Set();
    for (let i = 0; i < tree.length; i += 90) { const part = tree.slice(i, i + 90); for (const r of ((await env.DB.prepare(`SELECT id FROM devices WHERE parent = '' AND owner_id IN (${part.map(() => '?').join(',')})`).bind(...part).all()).results) || []) ids.add(r.id); }
    const pids = [...ids];
    for (let i = 0; i < pids.length; i += 90) { const part = pids.slice(i, i + 90); for (const r of ((await env.DB.prepare(`SELECT id FROM devices WHERE parent IN (${part.map(() => '?').join(',')})`).bind(...part).all()).results) || []) ids.add(r.id); }
    return (scopeMem = ids);
  };
  const viaOwner = async (r) => (r instanceof Response ? r.json() : r);
  const REQ_PERM = { report: 'reports', content: 'contentReq', addon: 'addonReq', ai: 'ai' };
  // Online ora
  if (path === '/presence' && m === 'GET') {
    need('online'); const sc = await scope(), j = await adminPresence(env);
    const f = (l) => (l || []).filter((x) => sc.has(x.id));
    return json({ ...j, online: f(j.online), recent: f(j.recent), top: [] });
  }
  // Errori dell'applicazione
  if (path === '/app-errors' && m === 'GET') {
    need('errors'); const sc = await scope(), j = await viaOwner(await adminErrors(req, env, path, url, who, ip));
    const items = j.items.filter((x) => sc.has(x.deviceId));
    const by = (key) => { const mp = new Map(); for (const x of items) { const k = key(x); if (!k) continue; const o = mp.get(k) || { key: k, n: 0, unresolved: 0, devs: new Set(), titles: new Set() }; o.n++; if (x.outcome === 'non risolto') o.unresolved++; o.devs.add(x.deviceId); o.titles.add(x.title); mp.set(k, o); } return [...mp.values()].sort((a, b) => b.n - a.n).slice(0, 10).map((o) => ({ key: o.key, n: o.n, unresolved: o.unresolved, devices: o.devs.size, titles: o.titles.size })); };
    return json({ items, topTitles: by((x) => x.title), topDevices: by((x) => x.deviceId).map((o) => { const x = items.find((i) => i.deviceId === o.key) || {}; return { ...o, name: x.name, code: x.code, model: x.model }; }), newCount: items.filter((x) => x.isNew).length });
  }
  if (path === '/app-errors/seen' && m === 'POST') { need('errors'); return json({ ok: true }); }
  // Segnalazioni, richieste di contenuti, di temi e di domande all'assistente
  if (path === '/requests' && m === 'GET') {
    const kind = ['content', 'addon', 'ai'].includes(url.searchParams.get('kind')) ? url.searchParams.get('kind') : 'report';
    need(REQ_PERM[kind]); const sc = await scope(), j = await viaOwner(await adminRequests(req, env, path, url, who, ip));
    return json({ ...j, items: j.items.filter((x) => sc.has(x.deviceId)) });
  }
  if (path === '/requests' && m === 'DELETE') {
    const kind = str(url.searchParams.get('kind') || '', 10), status = url.searchParams.get('status') === 'seen' ? 'seen' : 'done';
    if (!REQ_PERM[kind]) throw new HttpErr(400, 'Tipo non valido'); need(REQ_PERM[kind]);
    const ids = [...(await scope())]; let n = 0;
    for (let i = 0; i < ids.length; i += 90) { const part = ids.slice(i, i + 90); const r = await env.DB.prepare(`DELETE FROM requests WHERE kind = ? AND status = ? AND device_id IN (${part.map(() => '?').join(',')})`).bind(kind, status, ...part).run(); n += (r.meta && r.meta.changes) || 0; }
    return json({ ok: true, deleted: n });
  }
  const rqm = path.match(/^\/requests\/(\d{1,10})(\/status)?$/);
  if (rqm) {
    const r = await env.DB.prepare('SELECT kind, device_id FROM requests WHERE id = ?').bind(+rqm[1]).first();
    if (!r || !(await scope()).has(r.device_id)) throw new HttpErr(404, 'Richiesta non trovata');
    need(REQ_PERM[r.kind] || 'reports');
    return adminRoutes(req, env, url, path, who, ip, ctx, aSes);
  }
  // domande extra all'assistente per i suoi clienti
  if (path === '/ai/grant' && m === 'POST') {
    need('ai'); const b = await readJSON(req, 1024);
    if (!(await own(str(b.deviceId, 20)))) throw new HttpErr(404, 'Cliente non trovato');
    return adminRoutes(new Request(url.href, { method: 'POST', body: JSON.stringify({ deviceId: b.deviceId, n: b.n }) }), env, url, path, who, ip, ctx, aSes);
  }
  // Messaggi: solo ai suoi clienti
  if (path === '/messages' && m === 'POST') {
    need('messages'); const b = await readJSON(req, 8192);
    if (!b.target || b.target === 'all' || !(await own(str(b.target, 20)))) throw new HttpErr(400, 'Scegli uno dei tuoi clienti');
    return adminRoutes(new Request(url.href, { method: 'POST', body: JSON.stringify(b) }), env, url, path, who, ip, ctx, aSes);
  }
  const msm = path.match(/^\/messages\/(\d{1,10})$/);
  if (msm && m === 'DELETE') {
    need('messages'); const r = await env.DB.prepare('SELECT target FROM messages WHERE id = ?').bind(+msm[1]).first();
    if (!r || !(await scope()).has(r.target)) throw new HttpErr(404, 'Messaggio non trovato');
    return adminRoutes(req, env, url, path, who, ip, ctx, aSes);
  }
  // Download store: vedere e decidere le richieste (le impostazioni restano tue)
  if (path === '/store' && m === 'GET') {
    need('store'); const j = await viaOwner(await adminRoutes(req, env, url, path, who, ip, ctx, aSes));
    return json({ requests: j.requests || [], pending: j.pending || 0, settings: { approval: !!(j.settings && j.settings.approval) }, mail: {}, agent: true });
  }
  if (/^\/store\/[A-Za-z0-9_-]{12,40}\/(approve|deny|revoke)$/.test(path) && m === 'POST') { need('store'); return adminRoutes(req, env, url, path, who, ip, ctx, aSes); }
  // Videoteca: solo le linee dei suoi clienti, senza indirizzi
  if (path === '/catalog/sources' || path === '/catalog') {
    need('vod');
    const sc = await scope(), all2 = await catalogSources(env), keys = new Set(), dn = new Map(dns.map((x) => [x.host, x]));
    const ids = [...sc];
    for (let i = 0; i < ids.length; i += 90) { const part = ids.slice(i, i + 90); for (const d of ((await env.DB.prepare(`SELECT playlists FROM devices WHERE playlists <> '' AND id IN (${part.map(() => '?').join(',')})`).bind(...part).all()).results) || []) for (const p of await unseal(env, d.playlists).catch(() => [])) { if (p.type !== 'xtream' || !p.host || !p.username) continue; const h = hostOf(p); if (h) keys.add((await sha256(`src:${h}|${p.username}|${p.password}`)).slice(0, 16)); } }
    if (path === '/catalog/sources') return json([...all2.values()].filter((x) => keys.has(x.key)).map((x) => ({ key: x.key, label: `${(dn.get(x.host) || {}).name || 'Server'} · ${x.user}`, devices: x.devices })));
    if (!keys.has(str(url.searchParams.get('src') || '', 40))) throw new HttpErr(404, 'Linea non trovata');
    return adminRoutes(req, env, url, path, who, ip, ctx, aSes);
  }
  if (path === '/state' && m === 'GET') {
    const rows = [];
    for (let i = 0; i < tree.length; i += 90) { const part = tree.slice(i, i + 90); rows.push(...((await env.DB.prepare(`SELECT * FROM devices WHERE parent = '' AND owner_id IN (${part.map(() => '?').join(',')}) ORDER BY created_at DESC LIMIT 5000`).bind(...part).all()).results || [])); }
    const pids = rows.map((r) => r.id), kids = [];
    for (let i = 0; i < pids.length; i += 90) { const part = pids.slice(i, i + 90); kids.push(...((await env.DB.prepare(`SELECT * FROM devices WHERE parent IN (${part.map(() => '?').join(',')})`).bind(...part).all()).results || [])); }
    const devices = [];
    for (const d of [...rows, ...kids]) devices.push(dview(await deviceOut(env, d)));
    const byId = new Map(devices.map((x) => [x.id, x]));
    for (const x of devices) if (x.parent) { const p = byId.get(x.parent); x.status = p ? p.status : 'pending'; }
    const s = await getSettings(env);
    const meOut = (await agentsOut(env, all, [A.id], true))[0];
    const { password: _pw, ...meSafe } = meOut;
    return json({ role: 'agent', user: A.username, me: { ...meSafe, perms: P, servers: mine, canAgents: canAg, clientsUsed: meOut.clients }, devices,
      agents: canAg ? await agentsOut(env, all, tree.filter((x) => x !== A.id), true) : [],
      servers: servers.map((x) => ({ id: x.id, name: x.name })), addonCat: addonCfg(s).filter((a) => allowedAddons.has(a.id)),
      settings: { brand: s.brand, accent: s.accent, downloaderCode: s.downloaderCode || '', storeDownloaderCode: s.storeDownloaderCode || '', liteDownloaderCode: s.liteDownloaderCode || '', apkUrl: s.apkUrl || '' }, permKeys: PERM_KEYS, security: { totp: !!ses.totp_on }, counts: {},
      activity: P.activity ? ((await env.DB.prepare('SELECT t, type, text FROM activity WHERE ' + tree.map(() => 'text LIKE ?').join(' OR ') + ' ORDER BY t DESC LIMIT 200').bind(...tree.map((id) => 'Agente ' + (by.get(id) || {}).username + ':%')).all()).results || []) : [],
      messages: P.messages ? (((await env.DB.prepare('SELECT id, target, title, body, level, created, until FROM messages ORDER BY id DESC LIMIT 300').all()).results) || []).filter((x) => devices.some((d) => d.id === x.target)) : [] });
  }
  if (path === '/devices' && m === 'POST') {
    if (!P.create) throw new HttpErr(403, 'Non puoi attivare clienti');
    const b = await readJSON(req, 65536);
    const code = str(b.code, 20).toUpperCase();
    if (!CODE_RE.test(code)) throw new HttpErr(400, 'Scrivi il codice che il cliente vede sulla TV (es. KXAB-12CD)');
    await limitCheck();
    const expires = okDate(str(b.expires, 10));
    const pls = plsFrom(b.playlists || [], []);
    if (!pls.length) throw new HttpErr(400, 'Aggiungi almeno una playlist');
    const maxConn = Math.max(1, Math.min(P.maxConn, parseInt(b.maxConn, 10) || 1));
    const addons = addonsList(b.addons || []).filter((x) => allowedAddons.has(x));
    const d = await env.DB.prepare('SELECT * FROM devices WHERE code = ?').bind(code).first();
    if (d) {
      // codice già comparso sulla TV: si prende solo se nessuno l'ha mai toccato (né tu né altri agenti)
      const r0 = await env.DB.prepare(`UPDATE devices SET owner_id = ? WHERE id = ? AND ${FREE_DEV}`).bind(A.id, d.id).run();
      if (!r0.meta || r0.meta.changes !== 1) throw new HttpErr(400, 'Questo codice è già in uso');
      const back = () => env.DB.prepare(`UPDATE devices SET owner_id = 0 WHERE id = ? AND owner_id = ? AND ${FREE_DEV.replace('owner_id = 0 AND ', '')}`).bind(d.id, A.id).run();
      try { await limitCheck(true); } catch (e) { await back(); throw e; }
      let r;
      try { r = await forward('PUT', '/devices/' + d.id, { name: str(b.name, 60), notes: str(b.notes, 500), expires, active: true, playlists: pls, maxConn, addons }); } catch (e) { await back(); throw e; }
      if (r.status !== 200) { await back(); return r; }
      return json({ ok: true, id: d.id, code });
    }
    const r = await forward('POST', '/devices', { code, name: str(b.name, 60), notes: str(b.notes, 500), expires, active: true, playlists: pls, maxConn, addons });
    if (r.status !== 200) return r;
    const j = await r.json();
    try { await limitCheck(true); } catch (e) { await env.DB.prepare('DELETE FROM devices WHERE id = ? AND owner_id = ?').bind(j.id, A.id).run(); throw e; }
    return json(j);
  }
  const dm = path.match(/^\/devices\/([A-Za-z0-9_-]{6,20})(\/reset|\/kick|\/linkcode|\/unlink|\/link)?$/);
  if (dm) {
    const d = await own(dm[1]);
    if (!d) {
      // collegare una TV nuova (codice libero) a un proprio cliente
      if (dm[2] === '/link' && m === 'POST') {
        need('link', 'Non puoi gestire i collegamenti dei dispositivi');
        const t = await env.DB.prepare('SELECT * FROM devices WHERE id = ?').bind(dm[1]).first();
        const b = await readJSON(req, 1024);
        if (!t || !(await env.DB.prepare(`SELECT 1 AS x FROM devices WHERE id = ? AND ${FREE_DEV}`).bind(t.id).first()) || !(await own(str(b.primary, 20)))) throw new HttpErr(404, 'Dispositivo non trovato');
        return forward('POST', '/devices/' + t.id + '/link', { primary: str(b.primary, 20) });
      }
      throw new HttpErr(404, 'Dispositivo non trovato');
    }
    if (dm[2] === '/kick') { if (!P.kick) throw new HttpErr(403, 'Non puoi disconnettere'); return forward('POST', path); }
    if (dm[2] === '/linkcode' || dm[2] === '/reset' || dm[2] === '/unlink') { need('link', 'Non puoi gestire i collegamenti dei dispositivi'); return forward('POST', path); }
    if (dm[2]) throw new HttpErr(404, 'Non trovato');
    if (m === 'DELETE') { if (!P.delete) throw new HttpErr(403, 'Non puoi eliminare clienti'); return forward('DELETE', path); }
    if (m === 'PUT') {
      const b = await readJSON(req, 65536), o = {};
      if (typeof b.name === 'string') o.name = str(b.name, 60);
      if (typeof b.notes === 'string') o.notes = str(b.notes, 500);
      if (!d.parent) {
        if (b.expires !== undefined && b.expires !== d.expires) { if (!P.renew) throw new HttpErr(403, 'Non puoi cambiare la scadenza'); o.expires = okDate(str(b.expires, 10)); }
        if (typeof b.active === 'boolean' && b.active !== !!d.active) { if (!P.disable) throw new HttpErr(403, 'Non puoi attivare o disattivare'); o.active = b.active; }
        if (b.playlists !== undefined) { if (!P.playlists) throw new HttpErr(403, 'Non puoi cambiare le playlist'); o.playlists = plsFrom(b.playlists, await unseal(env, d.playlists).catch(() => [])); }
        if (b.maxConn !== undefined) o.maxConn = Math.max(1, Math.min(P.maxConn, parseInt(b.maxConn, 10) || 1));
        if (b.addons !== undefined) { if (!Array.isArray(b.addons)) throw new HttpErr(400, 'addons deve essere un elenco'); const keep = addonsList(d.addons).filter((x) => !allowedAddons.has(x)); o.addons = [...keep, ...addonsList(b.addons).filter((x) => allowedAddons.has(x))]; }
        if (b.perms !== undefined) { if (!P.clientPerms) throw new HttpErr(403, 'Non puoi cambiare i permessi dell\'app'); o.perms = b.perms; }
        if (b.vpn !== undefined) { if (!P.vpn) throw new HttpErr(403, 'Non puoi cambiare la VPN'); o.vpn = b.vpn; }
        for (const k of ['maxProfiles', 'lockProfiles', 'maxStreams', 'plMode', 'plDefault', 'player', 'profiles']) if (b[k] !== undefined) { if (!P.account) throw new HttpErr(403, 'Non puoi cambiare profili, lettore e visioni'); o[k] = b[k]; }
        if (o.maxStreams !== undefined) o.maxStreams = Math.min(Math.max(0, parseInt(o.maxStreams, 10) || 0), P.maxConn);
        for (const k of ['aiLimit', 'aiProvider']) if (b[k] !== undefined) { if (!P.ai) throw new HttpErr(403, 'Non puoi cambiare l\'assistente IA'); o[k] = b[k]; }
      }
      if (o.aiLimit !== undefined || o.aiProvider !== undefined) return adminRoutes(new Request(url.href, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(o) }), env, url, path, who, ip, ctx, { ...aSes, aiOk: true });
      return forward('PUT', path, o);
    }
    if (m === 'GET') return json(dview(await deviceOut(env, d)));
  }
  throw new HttpErr(403, 'Funzione non disponibile per gli agenti');
}

/** funzioni del pannello: le usa il pannello (sessione) e l'API di integrazione (chiave API, ses = null) */
async function adminRoutes(req, env, url, path, who, ip, ctx, ses) {
  const m = req.method;
  if (!ses && API_DENY.test(path)) throw new HttpErr(403, 'Funzione disponibile solo dal pannello');
  if (path === '/api-keys' || path.startsWith('/api-keys/') || path === '/webhook' || path.startsWith('/webhook/')) return apiAdmin(req, env, path, who, ip, ctx);
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
    for (const d of rows) devices.push(await deviceOut(env, d));
    const byId = new Map(devices.map((x) => [x.id, x]));
    for (const x of devices) if (x.parent) { const p = byId.get(x.parent); x.status = p && !p.parent ? p.status : 'pending'; }
    const activity = ((await env.DB.prepare('SELECT t, type, text, ip FROM activity ORDER BY id DESC LIMIT 200').all()).results) || [];
    let messages = [];
    try { messages = ((await env.DB.prepare('SELECT id, target, title, body, level, created, until FROM messages ORDER BY id DESC LIMIT 100').all()).results) || []; } catch {}
    const sessions = ses ? (await env.DB.prepare('SELECT COUNT(*) AS n FROM sessions WHERE admin_id = ? AND expires > ?').bind(ses.admin_id, now()).first()).n : 0;
    const settings = await getSettings(env);
    return json({
      settings, devices, activity, messages, user: who, apk: await latestApk(env, settings), apkFeed: await apkFeed(env),
      wgConf: !!(await env.DB.prepare('SELECT 1 AS x FROM settings WHERE k = ?').bind('wg').first()),
      security: { totp: !!(ses && ses.totp_on), encryption: !!env.ENC_KEY, access: !!(env.ACCESS_AUD && env.ACCESS_TEAM_DOMAIN), turnstile: !!env.TURNSTILE_SECRET, sessions },
      lite: { apk: settings.liteApkUrl || LITE_APK, feed: await liteFeed(settings) },
      counts: { ...(await newCounts(env)), online: await onlineCount(env) }, permKeys: PERM_KEYS, addonCat: addonCfg(settings), role: 'owner', ...(ses ? { agents: await agentsOut(env, await agentsAll(env)) } : {}),
    });
  }

  /* ---------- utenti online ---------- */
  if (path === '/presence' && m === 'GET') return json(await adminPresence(env));

  /* ---------- località VPN (più server WireGuard) ---------- */
  if (path === '/vpn-locs' && m === 'GET') return json((await wgLocs(env)).map((x) => ({ id: x.id, name: x.name })));
  if (path === '/vpn-locs' && m === 'POST') {
    const b = await readJSON(req, 16384);
    const name = nameClean(b.name, 40); if (!name) throw new HttpErr(400, 'Scrivi il nome della località, es. Milano');
    const conf = cleanWg(b.conf); if (!conf) throw new HttpErr(400, 'Incolla la configurazione WireGuard');
    const list = await wgLocs(env); if (list.length >= 20) throw new HttpErr(400, 'Puoi salvare al massimo 20 località');
    list.push({ id: b64url(rand(6)), name, conf });
    await env.DB.prepare('INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind('wgl', await seal(env, list)).run();
    await log(env, 'settings', `${who}: località VPN aggiunta · ${name}`, ip);
    return json({ ok: true });
  }
  const vl = path.match(/^\/vpn-locs\/([A-Za-z0-9_-]{4,20})$/);
  if (vl && m === 'DELETE') {
    const list = (await wgLocs(env)).filter((x) => x.id !== vl[1]);
    await env.DB.batch([env.DB.prepare('INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind('wgl', await seal(env, list)), env.DB.prepare("UPDATE devices SET vpn_loc = '' WHERE vpn_loc = ?").bind(vl[1])]);
    await log(env, 'settings', `${who}: località VPN eliminata`, ip);
    return json({ ok: true });
  }

  /* ---------- segnalazioni e richieste di contenuti ---------- */
  if (path === '/requests' || path.startsWith('/requests/')) { const r = await adminRequests(req, env, path, url, who, ip); if (r) return r; }
  if (path === '/app-errors' || path.startsWith('/app-errors/')) { const r = await adminErrors(req, env, path, url, who, ip); if (r) return r; }

  /* ---------- DNS (server delle playlist) ---------- */
  /* ---------- DNS: server salvati (anche senza clienti) e cambio di massa ---------- */
  if (path === '/dns' && m === 'GET') {
    const rows = ((await env.DB.prepare("SELECT id, playlists FROM devices WHERE playlists <> '' AND parent = '' LIMIT 5000").all()).results) || [];
    const count = new Map(), byDev = {};
    for (const r of rows) {
      const hosts = [...new Set((await unseal(env, r.playlists).catch(() => [])).map(hostOf).filter(Boolean))];
      byDev[r.id] = hosts;
      for (const h of hosts) count.set(h, (count.get(h) || 0) + 1);
    }
    const saved = (await dnsList(env)).map((x) => ({ ...x, devices: count.get(x.host) || 0 }));
    const names = new Map(saved.map((x) => [x.host, x]));
    const hosts = [...new Set([...count.keys(), ...saved.map((x) => x.host)])]
      .map((host) => ({ host, devices: count.get(host) || 0, name: names.get(host) ? names.get(host).name : '', savedId: names.get(host) ? names.get(host).id : '' }))
      .sort((a, b) => b.devices - a.devices || a.host.localeCompare(b.host));
    return json({ saved, hosts, byDev });
  }
  if (path === '/dns/saved' && m === 'POST') {
    const b = await readJSON(req, 4096);
    const host = cleanHost(b.host), name = nameClean(b.name, 40) || new URL(host).hostname;
    const list = await dnsList(env);
    if (list.some((x) => x.host === host)) throw new HttpErr(400, 'Questo DNS è già salvato');
    if (list.length >= 100) throw new HttpErr(400, 'Puoi salvare al massimo 100 DNS');
    const item = { id: b64url(rand(6)), name, host };
    list.push(item); await dnsSave(env, list);
    await log(env, 'settings', `${who}: DNS salvato · ${name} (${host})`, ip);
    return json(item);
  }
  const dsm = path.match(/^\/dns\/saved\/([A-Za-z0-9_-]{4,20})$/);
  if (dsm && (m === 'PUT' || m === 'DELETE')) {
    const list = await dnsList(env), i = list.findIndex((x) => x.id === dsm[1]);
    if (i < 0) throw new HttpErr(404, 'DNS non trovato');
    if (m === 'DELETE') { const [x] = list.splice(i, 1); await dnsSave(env, list); await log(env, 'settings', `${who}: DNS tolto dall'elenco · ${x.name} (i clienti non cambiano)`, ip); return json({ ok: true }); }
    const b = await readJSON(req, 4096);
    if (typeof b.name === 'string') list[i].name = nameClean(b.name, 40) || list[i].name;
    if (typeof b.host === 'string') { const h = cleanHost(b.host); if (list.some((x, j) => j !== i && x.host === h)) throw new HttpErr(400, 'Questo DNS è già salvato'); list[i].host = h; }
    await dnsSave(env, list);
    return json(list[i]);
  }
  if (path === '/devices/dns' && m === 'POST') {
    const b = await readJSON(req, 16384);
    const host = cleanHost(b.host);
    // "from" = sostituisci SOLO le playlist su quel server (le altre playlist del cliente non si toccano)
    const from = typeof b.from === 'string' && b.from.trim() ? cleanHost(b.from) : '';
    if (from && from === host) throw new HttpErr(400, 'Il nuovo server è uguale a quello attuale');
    let rows;
    if (Array.isArray(b.ids)) {
      if (!b.ids.length) throw new HttpErr(400, 'Scegli almeno un cliente');
      if (b.ids.length > 2000) throw new HttpErr(400, 'Puoi cambiare al massimo 2000 clienti alla volta');
      const ids = [...new Set(b.ids.map((x) => str(x, 20)).filter((x) => /^[A-Za-z0-9_-]{6,20}$/.test(x)))];
      rows = [];
      for (let i = 0; i < ids.length; i += 90) {
        const part = ids.slice(i, i + 90);
        rows.push(...((await env.DB.prepare(`SELECT id, name, code, playlists FROM devices WHERE playlists <> '' AND id IN (${part.map(() => '?').join(',')})`).bind(...part).all()).results || []));
      }
    } else if (from) {
      rows = (((await env.DB.prepare("SELECT id, name, code, playlists FROM devices WHERE playlists <> '' LIMIT 5000").all()).results) || []);
    } else throw new HttpErr(400, 'Scegli i clienti oppure il server da sostituire');
    const stmts = [], done = [];
    for (const d of rows) {
      const pls = await unseal(env, d.playlists).catch(() => []);
      const next = pls.map((p) => (from && hostOf(p) !== from ? p : hostOf(p) === host ? p : swapHost(p, host)));
      if (JSON.stringify(next) === JSON.stringify(pls)) continue;
      done.push(d.name || d.code);
      if (!b.preview) stmts.push(env.DB.prepare('UPDATE devices SET playlists = ? WHERE id = ?').bind(await seal(env, next), d.id));
    }
    if (b.preview) return json({ preview: true, changed: done.length, names: done.slice(0, 50), host, from });
    for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50));
    srcMem.map = null;
    // cambio per tutti i clienti di un DNS salvato → anche il DNS salvato passa al nuovo indirizzo
    let savedMoved = '';
    if (from && !Array.isArray(b.ids) && b.updateSaved !== false) {
      const list = await dnsList(env), x = list.find((y) => y.host === from);
      if (x && !list.some((y) => y.host === host)) { x.host = host; await dnsSave(env, list); savedMoved = x.name; }
    }
    await log(env, 'edit', `${who}: DNS cambiato in ${host} su ${done.length} ${done.length === 1 ? 'cliente' : 'clienti'}${from ? ' (prima ' + from + ')' : ''}`, ip);
    return json({ changed: done.length, names: done.slice(0, 50), host, from, savedMoved });
  }

  /* ---------- permessi di massa ---------- */
  if (path === '/devices/perms' && m === 'POST') {
    const b = await readJSON(req, 16384);
    if (!Array.isArray(b.ids) || !b.ids.length) throw new HttpErr(400, 'Scegli almeno un dispositivo');
    if (b.ids.length > 200) throw new HttpErr(400, 'Puoi modificare al massimo 200 dispositivi alla volta');
    const set = permsInput(b.perms);
    if (!Object.keys(set).length) throw new HttpErr(400, 'Scegli almeno un permesso da cambiare');
    const ids = [...new Set(b.ids.map((x) => str(x, 20)).filter((x) => /^[A-Za-z0-9_-]{6,20}$/.test(x)))];
    const stmts = [];
    for (const d of await devicesByIds(env, ids, 'id, perms')) stmts.push(env.DB.prepare('UPDATE devices SET perms = ? WHERE id = ?').bind(permsJson({ ...permsParse(d.perms), ...set }), d.id));
    for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50));
    await log(env, 'edit', `${who}: permessi (${Object.entries(set).map(([k, v]) => k + (v ? ' on' : ' off')).join(', ')}) su ${stmts.length} dispositivi`, ip);
    return json({ changed: stmts.length });
  }

  // add-on a più clienti insieme: { ids, add: [...], remove: [...] } (solo clienti principali: i collegati usano quelli del principale)
  if (path === '/addon-media' && m === 'GET') {
    const rows = ((await env.DB.prepare('SELECT addon, slot, updated, LENGTH(data) AS size FROM addon_media ORDER BY addon, slot').all()).results) || [];
    return json({ items: rows, slots: MEDIA_SLOTS });
  }
  const amm = path.match(/^\/addon-media\/([a-z0-9-]{3,40})\/(bg|a[1-4])$/);
  if (amm) {
    const [, id, slot] = amm;
    if (!ADDON_ASSETS[id]) throw new HttpErr(404, 'Tema non trovato');
    if (m === 'GET') {
      const r = await env.DB.prepare('SELECT data FROM addon_media WHERE addon = ? AND slot = ?').bind(id, slot).first();
      if (!r) throw new HttpErr(404, 'Nessuna immagine');
      return json({ data: r.data });
    }
    if (m === 'PUT') {
      const b = await readJSON(req, 2200 * 1024);
      const data = typeof b.data === 'string' ? b.data : '';
      if (!MEDIA_RE.test(data)) throw new HttpErr(400, 'Immagine non valida: usa JPG, PNG o WebP');
      if (data.length > 2000 * 1024) throw new HttpErr(413, 'Immagine troppo grande (massimo 1,5 MB)');
      await env.DB.prepare('INSERT INTO addon_media (addon, slot, data, updated) VALUES (?, ?, ?, ?) ON CONFLICT(addon, slot) DO UPDATE SET data = excluded.data, updated = excluded.updated').bind(id, slot, data, now()).run();
      await mediaTouch(env, id);
      await log(env, 'edit', `${who}: immagine ${slot === 'bg' ? 'di sfondo' : 'avatar ' + slot.slice(1)} del tema ${(ADDONS.find((a) => a[0] === id) || [id, id])[1]}`, ip);
      return json({ ok: true });
    }
    if (m === 'DELETE') {
      await env.DB.prepare('DELETE FROM addon_media WHERE addon = ? AND slot = ?').bind(id, slot).run();
      await mediaTouch(env, id);
      return json({ ok: true });
    }
  }
  if (path === '/agents' || path.startsWith('/agents/')) return agentsAdmin(req, env, path, who, ip, null);
  if (path === '/ai' || path === '/ai/grant' || path === '/ai/test') { const r = await adminAi(req, env, path, who, ip); if (r) return r; }
  const apv = path.match(/^\/addon-preview\/([a-z0-9-]{3,40})$/);
  if (apv && m === 'GET') { const a = ADDON_ASSETS[apv[1]]; if (!a || !a.prev) throw new HttpErr(404, 'Anteprima non disponibile'); return json({ id: apv[1], bg: a.prev.bg, avs: a.prev.avs }, 200, { 'Cache-Control': 'private, max-age=3600' }); }
  if (path === '/devices/addons' && m === 'POST') {
    const b = await readJSON(req, 16384);
    if (!Array.isArray(b.ids) || !b.ids.length) throw new HttpErr(400, 'Scegli almeno un cliente');
    if (b.ids.length > 500) throw new HttpErr(400, 'Puoi modificare al massimo 500 clienti alla volta');
    const add = addonsList(b.add), del = new Set(addonsList(b.remove));
    if (!add.length && !del.size) throw new HttpErr(400, 'Scegli almeno un add-on da dare o togliere');
    const ids = [...new Set(b.ids.map((x) => str(x, 20)).filter((x) => /^[A-Za-z0-9_-]{6,20}$/.test(x)))];
    const stmts = [];
    for (const d of await devicesByIds(env, ids, 'id, parent, addons')) {
      if (d.parent) continue;
      const next = addonsList([...addonsList(d.addons).filter((x) => !del.has(x)), ...add]).join(',');
      if (next !== (d.addons || '')) stmts.push(env.DB.prepare('UPDATE devices SET addons = ? WHERE id = ?').bind(next, d.id));
    }
    for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50));
    const nm = (l) => l.map((id) => (ADDONS.find((a) => a[0] === id) || [id, id])[1]).join(', ');
    await log(env, 'edit', `${who}: add-on${add.length ? ' dati: ' + nm(add) : ''}${del.size ? ' tolti: ' + nm([...del]) : ''} (${stmts.length} clienti)`, ip);
    return json({ changed: stmts.length });
  }

  /* ---------- videoteca ---------- */
  if (path === '/catalog/sources' && m === 'GET') {
    const srcs = await catalogSources(env);
    return json([...srcs.values()].map((s) => ({ key: s.key, label: `${s.host.replace(/^https?:\/\//, '')} · ${s.user}`, host: s.host, devices: s.devices })).sort((a, b) => b.devices - a.devices || a.label.localeCompare(b.label)));
  }
  if (path === '/catalog' && m === 'GET') {
    try { return json(await adminCatalog(env, url)); }
    catch (e) { if (e instanceof HttpErr) throw e; return json({ error: e && e.name === 'TimeoutError' ? 'Il server non ha risposto entro 20 secondi' : 'Server non raggiungibile' }, 502); }
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
    for (const k of ['brand', 'tagline', 'accent', 'announcement', 'supportContact', 'downloaderCode', 'storeDownloaderCode', 'liteDownloaderCode']) if (typeof b[k] === 'string') s[k] = str(b[k], k === 'announcement' ? 300 : 80);
    if (typeof b.apkUrl === 'string') { const u = str(b.apkUrl, 500); s.apkUrl = !u || /^https:\/\//.test(u) ? u : s.apkUrl; }
    if (typeof b.liteApkUrl === 'string') { const u = str(b.liteApkUrl, 500); if (u && !/^https:\/\//.test(u)) throw new HttpErr(400, 'Il link di Kairos Lite deve iniziare con https://'); s.liteApkUrl = u; }
    if (typeof b.allowLocalPlaylists === 'boolean') s.allowLocalPlaylists = b.allowLocalPlaylists;
    if (typeof b.showFootball === 'boolean') s.showFootball = b.showFootball;
    if (b.aiDaily !== undefined) { const n = parseInt(b.aiDaily, 10); if (!(n >= 0 && n <= 1000)) throw new HttpErr(400, 'Domande al giorno: da 0 a 1000'); s.aiDaily = n; }
    if (b.aiProvider !== undefined) { if (!AI_PROVIDERS.includes(b.aiProvider)) throw new HttpErr(400, 'Servizio non valido'); s.aiProvider = b.aiProvider; }
    if (b.maint !== undefined) {
      const mt = b.maint && typeof b.maint === 'object' ? b.maint : {};
      if (mt.allow !== undefined && !Array.isArray(mt.allow)) throw new HttpErr(400, 'allow deve essere un elenco');
      const was = !!(s.maint && s.maint.on);
      s.maint = { on: mt.on === true, msg: str(mt.msg || '', 300), allow: [...new Set((mt.allow || []).map((x) => str(x, 20)).filter((x) => /^[A-Za-z0-9_-]{6,20}$/.test(x)))].slice(0, 500) };
      if (was !== s.maint.on) await log(env, s.maint.on ? 'off' : 'on', `${who}: manutenzione ${s.maint.on ? 'ATTIVATA (app bloccata tranne ' + s.maint.allow.length + ' clienti)' : 'terminata: app di nuovo disponibile per tutti'}`, ip);
    }
    if (b.aiGemini !== undefined) { if (!AI_GEMINI_MODELS[b.aiGemini]) throw new HttpErr(400, 'Modello Gemini non valido'); s.aiGemini = b.aiGemini; }
    if (b.aiClaude !== undefined) { if (!AI_CLAUDE_MODELS[b.aiClaude]) throw new HttpErr(400, 'Modello Claude non valido'); s.aiClaude = b.aiClaude; }
    if (b.apkVersionCode !== undefined) {
      // si scrive la versione pubblicata, es. "1.3.0" (→ 10300, lo stesso numero che calcola la build su GitHub)
      const v = String(b.apkVersionCode).trim().replace(/^v/i, '');
      const code = semverCode(v);
      if (!v) { s.apkVersionCode = 0; s.apkVersion = ''; }
      else if (code) { s.apkVersionCode = code; s.apkVersion = v; }
      else throw new HttpErr(400, 'Versione APK non valida: scrivila come 1.3.0');
    }
    if (typeof b.price === 'string') s.price = nameClean(b.price, 60);
    if (b.addons && typeof b.addons === 'object' && !Array.isArray(b.addons)) {
      const cur = s.addons && typeof s.addons === 'object' ? { ...s.addons } : {};
      for (const [id, v] of Object.entries(b.addons)) {
        if (!ADDON_IDS.has(id) || !v || typeof v !== 'object') continue;
        cur[id] = { m: ADDON_MODES.includes(v.m) ? v.m : (cur[id] && cur[id].m) || (ADDONS.find((a) => a[0] === id)[3] || 'some'), p: nameClean(String(v.p ?? (cur[id] && cur[id].p) ?? '').replace(/[<>"'`]/g, ''), 20) };
      }
      s.addons = cur;
    }
    if (b.permsDefault !== undefined) s.permsDefault = { ...permsParse(s.permsDefault), ...permsInput(b.permsDefault) }; // permessi dei nuovi dispositivi
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
    const acc = await accountFields(env, b, { max_streams: 1 }, pls); // di base: una visione alla volta
    const perms = b.perms !== undefined ? permsJson({ ...permsParse((await getSettings(env)).permsDefault), ...permsInput(b.perms) }) : defaultPermsJson(await getSettings(env));
    await env.DB.prepare('INSERT INTO devices (id, code, name, notes, active, expires, playlists, created_at, max_conn, max_profiles, profiles, lock_profiles, vpn, vpn_conf, perms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, code, str(b.name, 60), str(b.notes, 500), b.active ? 1 : 0, str(b.expires, 10), await seal(env, pls), now(), acc.max_conn, acc.max_profiles, acc.profiles, acc.lock_profiles, acc.vpn, acc.vpn_conf, perms).run();
    const newOwner = ses && ses.agent ? ses.admin_id : Math.max(0, parseInt(b.ownerId, 10) || 0);
    if (newOwner && !(ses && ses.agent) && !(await env.DB.prepare("SELECT 1 AS x FROM admins WHERE id = ? AND role = 'agent'").bind(newOwner).first())) throw new HttpErr(400, 'Agente non trovato');
    await env.DB.prepare('UPDATE devices SET max_streams = ?, vpn_loc = ?, pl_mode = ?, pl_default = ?, player = ?, addons = ?, owner_id = ? WHERE id = ?').bind(acc.max_streams, acc.vpn_loc, acc.pl_mode, acc.pl_default, acc.player, Array.isArray(b.addons) ? addonsList(b.addons).join(',') : '', newOwner, id).run();
    if (ses && ses.agent) return json({ ok: true, id, code });
    await log(env, 'new', `${who}: creato dispositivo ${str(b.name, 60) || code}`, ip);
    return json({ ok: true, id, code });
  }

  if (path === '/privacy-template' && m === 'GET') return json({ text: PRIVACY_TEMPLATE });

  const dm = path.match(/^\/devices\/([A-Za-z0-9_-]{6,20})(\/reset|\/link|\/unlink|\/dns|\/linkcode|\/kick)?$/);
  if (dm) {
    const d = await env.DB.prepare('SELECT * FROM devices WHERE id = ?').bind(dm[1]).first();
    if (!d) throw new HttpErr(404, 'Dispositivo non trovato');
    const label = d.name || d.code;
    if (dm[2] === '/kick' && m === 'POST') {
      // "Disconnetti": l'app interrompe la visione in corso al prossimo battito (entro ~20 s) e torna alla home;
      // l'abbonamento non cambia. Con ?all=1 vale anche per le connessioni collegate a questo cliente.
      const t = now();
      const ids = [d.id];
      if (url.searchParams.get('all') === '1' && !d.parent) for (const k of (await env.DB.prepare('SELECT id FROM devices WHERE parent = ?').bind(d.id).all()).results || []) ids.push(k.id);
      await env.DB.batch(ids.map((id) => env.DB.prepare('UPDATE devices SET kick_t = ? WHERE id = ?').bind(t, id)));
      await log(env, 'off', `${who}: disconnesso ${label}${ids.length > 1 ? ` e ${ids.length - 1} dispositivi collegati` : ''} (visione interrotta)`, ip);
      return json({ ok: true, kicked: ids.length });
    }
    if (dm[2] === '/reset' && m === 'POST') {
      await env.DB.prepare('UPDATE devices SET secret_hash = ? WHERE id = ?').bind('', d.id).run();
      await log(env, 'edit', `${who}: sbloccato il collegamento di ${label}`, ip);
      return json({ ok: true });
    }
    if (dm[2] === '/dns' && m === 'POST') {
      // cambia solo il server (schema+host[:porta]) di tutte le playlist: percorsi, utente e password restano
      const b = await readJSON(req, 2048);
      const host = cleanHost(b.host);
      if (d.parent) throw new HttpErr(400, 'Le playlist di una connessione collegata si cambiano dal cliente principale');
      const pls = await unseal(env, d.playlists).catch(() => []);
      if (!pls.length) throw new HttpErr(400, 'Il dispositivo non ha playlist');
      const next = pls.map((p) => swapHost(p, host));
      await env.DB.prepare('UPDATE devices SET playlists = ? WHERE id = ?').bind(await seal(env, next), d.id).run();
      srcMem.map = null;
      await log(env, 'edit', `${who}: server playlist di ${label} → ${host}`, ip);
      return json(await deviceOut(env, { ...d, playlists: await seal(env, next) }));
    }
    if (dm[2] === '/linkcode' && m === 'POST') {
      // codice a 6 cifre da dettare al cliente per collegare un altro dispositivo ("Ho già un abbonamento")
      if (d.parent) throw new HttpErr(400, 'Genera il codice dal cliente principale');
      const [P] = await activeAccount(env, d);
      if (!P) throw new HttpErr(400, 'L\'abbonamento non è attivo');
      const used = await connCount(env, P), max = P.max_conn ?? 1;
      if (used >= max) throw new HttpErr(400, `Connessioni esaurite (${used} di ${max}): aumenta "Connessioni massime"`);
      const r = await issuePin(env, P);
      await log(env, 'edit', `${who}: codice di collegamento generato per ${label} (${used} di ${max} connessioni)`, ip);
      return json(r);
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
      if (['active', 'expires', 'playlists', 'profiles', 'maxConn', 'maxProfiles', 'lockProfiles', 'vpn', 'perms', 'addons'].some((k) => b[k] !== undefined)) throw new HttpErr(400, 'Questo dispositivo è una connessione di un altro cliente: abbonamento, playlist, profili e permessi si modificano dal cliente principale');
      const acc = await accountFields(env, { vpnConf: b.vpnConf, vpnConfClear: b.vpnConfClear }, d, []);
      await env.DB.prepare('UPDATE devices SET name = ?, notes = ?, vpn_conf = ? WHERE id = ?')
        .bind(typeof b.name === 'string' ? str(b.name, 60) : d.name, typeof b.notes === 'string' ? str(b.notes, 500) : d.notes, acc.vpn_conf, d.id).run();
      await log(env, 'edit', `${who}: modificato ${str(b.name, 60) || label}`, ip);
      return json({ ok: true });
    }
    if (m === 'PUT') {
      const b = await readJSON(req, 512 * 1024); // fino a 100 playlist con indirizzi lunghi
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
      const perms = b.perms !== undefined ? permsJson({ ...permsParse(d.perms), ...permsInput(b.perms) }) : d.perms || '';
      if (b.addons !== undefined && !Array.isArray(b.addons)) throw new HttpErr(400, 'addons deve essere un elenco');
      const addons = b.addons !== undefined ? addonsList(b.addons).join(',') : d.addons || '';
      let aiLimit = d.ai_limit ?? -1, aiProv = d.ai_provider || '';
      if (b.aiProvider !== undefined && (!ses?.agent || ses.aiOk)) { if (!['', ...AI_PROVIDERS].includes(b.aiProvider)) throw new HttpErr(400, 'Intelligenza artificiale non valida'); aiProv = b.aiProvider; }
      if (b.aiLimit !== undefined && (!ses?.agent || ses.aiOk)) { const n = b.aiLimit === '' || b.aiLimit === null ? -1 : parseInt(b.aiLimit, 10); if (!(n >= -1 && n <= 1000)) throw new HttpErr(400, 'Domande al giorno: da 0 a 1000 (vuoto = predefinito)'); aiLimit = n; }
      let ownerId = +d.owner_id || 0;
      if (b.ownerId !== undefined && !ses?.agent) {
        ownerId = Math.max(0, parseInt(b.ownerId, 10) || 0);
        if (ownerId && !(await env.DB.prepare("SELECT 1 AS x FROM admins WHERE id = ? AND role = 'agent'").bind(ownerId).first())) throw new HttpErr(400, 'Agente non trovato');
      }
      await env.DB.prepare('UPDATE devices SET name = ?, notes = ?, expires = ?, active = ?, playlists = ?, max_conn = ?, max_profiles = ?, profiles = ?, lock_profiles = ?, vpn = ?, vpn_conf = ?, perms = ? WHERE id = ?')
        .bind(name, notes, expires, active, await seal(env, pls), acc.max_conn, acc.max_profiles, acc.profiles, acc.lock_profiles, acc.vpn, acc.vpn_conf, perms, d.id).run();
      await env.DB.prepare('UPDATE devices SET max_streams = ?, vpn_loc = ?, pl_mode = ?, pl_default = ?, player = ?, addons = ?, owner_id = ?, ai_limit = ?, ai_provider = ? WHERE id = ?').bind(acc.max_streams, acc.vpn_loc, acc.pl_mode, acc.pl_default, acc.player, addons, ownerId, aiLimit, aiProv, d.id).run();
      if (JSON.stringify(pls) !== JSON.stringify(await unseal(env, d.playlists).catch(() => []))) srcMem.map = null;
      const after = statusOf({ active, expires }, pls);
      if (before !== after && after === 'active') ctx.waitUntil(webhookSend(env, 'device.activated', { id: d.id, code: d.code, name, expires }));
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
/* ====================================================================== */
/* API di integrazione: /api/v1 con chiave API (Authorization: Bearer kx_…) */
/* Espone le stesse funzioni del pannello (tranne accesso, password, 2FA,   */
/* chiavi e webhook) più alcune scorciatoie per codice dispositivo.         */
/* ====================================================================== */
const API_DENY = /^\/(login|logout|logout-all|password|totp|api-keys|webhook|agents|ai)(\/|$)/;
const API_KEY_RE = /^kx_[A-Za-z0-9_-]{30,80}$/;
async function apiV1(req, env, url, ip, ctx) {
  const auth = req.headers.get('Authorization') || '';
  const key = ((auth.match(/^Bearer\s+(\S+)$/i) || [])[1] || req.headers.get('X-Api-Key') || '').trim();
  if (await limited(env.RL_DEVICE, 'apiip:' + ip)) return json({ error: 'Troppe richieste, riprova tra poco' }, 429);
  if (!API_KEY_RE.test(key)) return json({ error: 'Chiave API mancante o non valida. Usa l\'intestazione Authorization: Bearer kx_…' }, 401);
  const k = await env.DB.prepare('SELECT * FROM api_keys WHERE hash = ?').bind(await sha256('api:' + key)).first().catch(() => null);
  if (!k) return json({ error: 'Chiave API non valida o revocata' }, 401);
  if (await throttled(env, 'api:' + k.id, 600, 60e3)) return json({ error: 'Troppe richieste: massimo 600 al minuto per chiave' }, 429);
  const m = req.method;
  if (!['GET', 'POST', 'PUT', 'DELETE'].includes(m)) return json({ error: 'Metodo non consentito' }, 405);
  if (k.scope === 'read' && m !== 'GET') return json({ error: 'Questa chiave è di sola lettura' }, 403);
  ctx.waitUntil(env.DB.prepare('UPDATE api_keys SET last_used = ?, last_ip = ?, uses = uses + 1 WHERE id = ?').bind(now(), ip, k.id).run());
  const who = 'API ' + (k.name || k.prefix);
  let path = url.pathname.slice('/api/v1'.length) || '/';
  if (path === '/' || path === '/ping') return json({ ok: true, key: k.name, scope: k.scope, version: '1.9', time: new Date().toISOString() });
  // dispositivo indicato con il codice (KXAB-12CD) invece dell'id interno
  const cm = path.match(/^\/devices\/(KX[A-Za-z0-9]{2}-[A-Za-z0-9]{4})(\/.*)?$/i);
  if (cm) {
    const d = await env.DB.prepare('SELECT id FROM devices WHERE code = ?').bind(cm[1].toUpperCase()).first();
    if (!d) return json({ error: 'Dispositivo non trovato' }, 404);
    path = '/devices/' + d.id + (cm[2] || '');
  }
  // elenco dispositivi con filtri: /devices?status=active&q=mario
  if (path === '/devices' && m === 'GET') {
    const st = url.searchParams.get('status') || '', q = (url.searchParams.get('q') || '').toLowerCase().slice(0, 60);
    const rows = (await env.DB.prepare('SELECT * FROM devices ORDER BY created_at DESC LIMIT 5000').all()).results || [];
    const out = [];
    for (const d of rows) {
      const o = await deviceOut(env, d);
      if (st && o.status !== st) continue;
      if (q && ![o.code, o.name, o.notes, o.model].join(' ').toLowerCase().includes(q)) continue;
      out.push(apiDevice(o));
    }
    return json({ count: out.length, devices: out });
  }
  const dm = path.match(/^\/devices\/([A-Za-z0-9_-]{6,20})(?:\/(activate|extend|disable|enable))?$/);
  if (dm && m === 'GET' && !dm[2]) {
    const d = await env.DB.prepare('SELECT * FROM devices WHERE id = ?').bind(dm[1]).first();
    if (!d) return json({ error: 'Dispositivo non trovato' }, 404);
    return json(apiDevice(await deviceOut(env, d)));
  }
  if (dm && dm[2] && m === 'POST') {
    const d = await env.DB.prepare('SELECT * FROM devices WHERE id = ?').bind(dm[1]).first();
    if (!d) return json({ error: 'Dispositivo non trovato' }, 404);
    if (d.parent) return json({ error: 'È una connessione di un altro cliente: usa il codice del cliente principale' }, 400);
    const b = await readJSON(req, 65536).catch(() => ({}));
    const body = {};
    if (dm[2] === 'disable') body.active = false;
    else if (dm[2] === 'enable') body.active = true;
    else {
      const base = dm[2] === 'extend' && d.expires && d.expires >= new Date().toISOString().slice(0, 10) ? new Date(d.expires + 'T00:00:00Z') : new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
      if (typeof b.expires === 'string') body.expires = b.expires;
      else if (b.unlimited === true) body.expires = '';
      else {
        const months = +b.months || 0, days = +b.days || 0;
        if (!months && !days) return json({ error: 'Indica months, days, expires (AAAA-MM-GG) oppure unlimited: true' }, 400);
        if (months < 0 || months > 120 || days < 0 || days > 3650) return json({ error: 'Durata non valida' }, 400);
        base.setUTCMonth(base.getUTCMonth() + months); base.setUTCDate(base.getUTCDate() + days);
        body.expires = base.toISOString().slice(0, 10);
      }
      body.active = true;
      for (const f of ['playlists', 'name', 'notes', 'maxConn', 'maxStreams', 'maxProfiles', 'plMode', 'plDefault', 'perms', 'vpn', 'vpnLoc', 'player', 'addons']) if (b[f] !== undefined) body[f] = b[f];
    }
    const sub = new Request(new URL('/api/v1/devices/' + d.id, url).href, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    await adminRoutes(sub, env, url, '/devices/' + d.id, who, ip, ctx, null);
    const after = await env.DB.prepare('SELECT * FROM devices WHERE id = ?').bind(d.id).first();
    return json({ ok: true, device: apiDevice(await deviceOut(env, after)) });
  }
  if (path === '/state' && m === 'GET') {
    const j = await (await adminRoutes(req, env, url, path, who, ip, ctx, null)).json();
    delete j.agents;
    return json({ ...j, devices: (j.devices || []).map(apiDevice) });
  }
  const pm = path.match(/^\/devices\/([A-Za-z0-9_-]{6,20})$/);
  if (pm && m === 'PUT') {
    const b = await readJSON(req, 512 * 1024).catch((e) => e);
    if (b instanceof Error || !b || typeof b !== 'object' || Array.isArray(b)) return json({ error: 'JSON non valido' }, 400);
    if (b.playlists !== undefined) {
      if (!Array.isArray(b.playlists)) return json({ error: 'playlists deve essere un elenco' }, 400);
      const d = await env.DB.prepare('SELECT playlists FROM devices WHERE id = ?').bind(pm[1]).first();
      if (!d) return json({ error: 'Dispositivo non trovato' }, 404);
      const old = new Map((await unseal(env, d.playlists).catch(() => [])).map((p) => [p.id, p]));
      // una playlist già esistente (stesso id) tiene i dati che l'API non restituisce: password, indirizzo M3U, EPG
      b.playlists = b.playlists.map((p) => { const o = p && p.id && old.get(p.id); if (!o) return p; const q = { ...o, ...p }; if (o.type !== 'xtream' && p.host !== undefined && p.url === undefined) delete q.host; return q; });
    }
    const sub = new Request(url.href, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
    return apiClean(await adminRoutes(sub, env, url, path, who, ip, ctx, null));
  }
  return apiClean(await adminRoutes(req, env, url, path, who, ip, ctx, null));
}
/* risposte dell'API che contengono un dispositivo: mai le password delle playlist */
async function apiClean(r) {
  if (!r || !(r.headers.get('Content-Type') || '').includes('json')) return r;
  const j = await r.clone().json().catch(() => null);
  if (!j || typeof j !== 'object') return r;
  const isDev = (o) => o && typeof o === 'object' && Array.isArray(o.playlists) && 'code' in o;
  if (isDev(j)) return json(apiDevice(j), r.status);
  if (isDev(j.device)) return json({ ...j, device: apiDevice(j.device) }, r.status);
  if (Array.isArray(j.devices) && j.devices.some(isDev)) return json({ ...j, devices: j.devices.map((o) => (isDev(o) ? apiDevice(o) : o)) }, r.status);
  return r;
}
/* dispositivo per l'API: le password delle playlist non escono mai */
function apiDevice(o) {
  return { ...o, playlists: (o.playlists || []).map((p) => ({ id: p.id, name: p.name, type: p.type, host: p.type === 'xtream' ? p.host : hostOf(p), username: p.username, tag: p.tag || '' })) };
}

/* ---------- chiavi API e webhook (si gestiscono solo dal pannello) ---------- */
const WH_EVENTS = ['device.new', 'device.activated', 'report.new', 'request.new'];
async function webhookCfg(env) {
  const r = await env.DB.prepare('SELECT v FROM settings WHERE k = ?').bind('webhook').first();
  if (!r) return { url: '', events: [...WH_EVENTS], secret: '', last: null };
  try { const v = await unseal(env, r.v); return { url: v.url || '', events: Array.isArray(v.events) ? v.events : [...WH_EVENTS], secret: v.secret || '', last: v.last || null }; } catch { return { url: '', events: [...WH_EVENTS], secret: '', last: null }; }
}
async function webhookSave(env, cfg) {
  await env.DB.prepare('INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind('webhook', await seal(env, cfg)).run();
}
async function hmacHex(secret, text) {
  const k = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(text)))].map((b) => b.toString(16).padStart(2, '0')).join('');
}
/** invia un evento al webhook configurato (in sottofondo, non blocca mai la richiesta) */
async function webhookSend(env, event, data, force) {
  try {
    const cfg = await webhookCfg(env);
    if (!cfg.url || (!force && !cfg.events.includes(event))) return null;
    const body = JSON.stringify({ event, time: new Date().toISOString(), data });
    const ts = String(Math.floor(now() / 1000));
    const sig = cfg.secret ? await hmacHex(cfg.secret, ts + '.' + body) : '';
    let status = 0;
    try {
      const r = await fetch(cfg.url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'KairosControl-Webhook/1.9', 'X-Kairos-Event': event, 'X-Kairos-Timestamp': ts, 'X-Kairos-Signature': 'sha256=' + sig }, body, signal: AbortSignal.timeout(8000), redirect: 'manual' });
      status = r.status;
    } catch { status = -1; }
    cfg.last = { t: now(), event, status };
    await webhookSave(env, cfg);
    return status;
  } catch { return null; }
}
function webhookUrlOk(u) {
  let x; try { x = new URL(u); } catch { return false; }
  if (x.protocol !== 'https:' || x.username || x.password) return false;
  const h = x.hostname.toLowerCase();
  return !(h === 'localhost' || /\.(local|internal|lan)$/.test(h) || /^(10|127|0)\./.test(h) || /^192\.168\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || /^169\.254\./.test(h) || h.includes(':'));
}
async function apiAdmin(req, env, path, who, ip, ctx) {
  const m = req.method;
  if (path === '/api-keys' && m === 'GET') {
    const rows = (await env.DB.prepare('SELECT id, name, prefix, scope, created, last_used, last_ip, uses FROM api_keys ORDER BY created DESC').all()).results || [];
    return json(rows);
  }
  if (path === '/api-keys' && m === 'POST') {
    const b = await readJSON(req, 2048);
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM api_keys').first();
    if (n && n.n >= 20) throw new HttpErr(400, 'Puoi avere al massimo 20 chiavi API');
    const key = 'kx_' + b64url(rand(30)), id = b64url(rand(8));
    const item = { id, name: nameClean(b.name, 40) || 'Integrazione', prefix: key.slice(0, 9), scope: b.scope === 'read' ? 'read' : 'full', created: now() };
    await env.DB.prepare('INSERT INTO api_keys (id, name, hash, prefix, scope, created) VALUES (?, ?, ?, ?, ?, ?)').bind(id, item.name, await sha256('api:' + key), item.prefix, item.scope, item.created).run();
    await log(env, 'settings', `${who}: creata chiave API «${item.name}» (${item.scope === 'read' ? 'sola lettura' : 'completa'})`, ip);
    return json({ ...item, key });
  }
  const km = path.match(/^\/api-keys\/([A-Za-z0-9_-]{6,20})$/);
  if (km && m === 'DELETE') {
    const k = await env.DB.prepare('SELECT name FROM api_keys WHERE id = ?').bind(km[1]).first();
    if (!k) throw new HttpErr(404, 'Chiave non trovata');
    await env.DB.prepare('DELETE FROM api_keys WHERE id = ?').bind(km[1]).run();
    await log(env, 'settings', `${who}: revocata chiave API «${k.name}»`, ip);
    return json({ ok: true });
  }
  if (path === '/webhook' && m === 'GET') { const c = await webhookCfg(env); return json({ url: c.url, events: c.events, hasSecret: !!c.secret, last: c.last, all: WH_EVENTS }); }
  if (path === '/webhook' && m === 'PUT') {
    const b = await readJSON(req, 4096), c = await webhookCfg(env);
    const u = str(b.url, 500).trim();
    if (u && !webhookUrlOk(u)) throw new HttpErr(400, 'Indirizzo del webhook non valido: serve https:// verso un server pubblico');
    c.url = u;
    if (Array.isArray(b.events)) c.events = b.events.filter((e) => WH_EVENTS.includes(e));
    let secret = '';
    if (u && (!c.secret || b.newSecret === true)) { c.secret = b64url(rand(24)); secret = c.secret; }
    await webhookSave(env, c);
    await log(env, 'settings', `${who}: webhook ${u ? 'impostato' : 'tolto'}`, ip);
    return json({ ok: true, url: c.url, events: c.events, secret });
  }
  if (path === '/webhook/test' && m === 'POST') {
    const st = await webhookSend(env, 'test', { message: 'Prova dal pannello Kairos Control' }, true);
    if (st === null) throw new HttpErr(400, 'Imposta prima l\'indirizzo del webhook');
    return json({ ok: st >= 200 && st < 300, status: st });
  }
  throw new HttpErr(404, 'Endpoint sconosciuto');
}
/** dispositivo come lo vede il pannello (le configurazioni WireGuard non tornano mai: solo "configurata sì/no") */
async function deviceOut(env, d) {
  const pls = await unseal(env, d.playlists).catch(() => []);
  return { id: d.id, code: d.code, name: d.name, model: d.model, notes: d.notes, active: !!d.active, expires: d.expires, playlists: pls, hosts: [...new Set(pls.map(hostOf).filter(Boolean))], createdAt: d.created_at, lastSeen: d.last_seen, lastIp: d.last_ip, bound: !!d.secret_hash, status: statusOf(d, pls),
    addons: addonsList(d.addons), ownerId: +d.owner_id || 0, aiLimit: d.ai_limit ?? -1, aiExtra: +d.ai_extra || 0, aiProvider: d.ai_provider || '', app: d.app || '', parent: d.parent || '', maxConn: d.max_conn ?? 1, maxProfiles: d.max_profiles ?? 3, profiles: readProfiles(d, pls.map((p) => p.id)), lockProfiles: !!d.lock_profiles, vpn: +d.vpn || 0, vpnConf: !!d.vpn_conf, perms: permsParse(d.perms), maxStreams: +d.max_streams || 0, vpnLoc: d.vpn_loc || '', plMode: d.pl_mode === 'split' ? 'split' : 'merge', plDefault: d.pl_default || '', player: playerParse(d.player) };
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
  o.max_streams = +cur.max_streams || 0; o.vpn_loc = cur.vpn_loc || '';
  if (b.maxStreams !== undefined) o.max_streams = intIn(b.maxStreams, 0, MAX_CONN, 'Visioni contemporanee');
  if (b.vpnLoc !== undefined) { const v = str(b.vpnLoc, 20); if (v && !(await wgLocs(env)).some((x) => x.id === v)) throw new HttpErr(400, 'Località VPN non trovata'); o.vpn_loc = v; }
  const plIds = pls.map((p) => p.id);
  o.pl_mode = cur.pl_mode || ''; o.pl_default = plIds.includes(cur.pl_default) ? cur.pl_default : '';
  if (b.plMode !== undefined) o.pl_mode = b.plMode === 'split' ? 'split' : 'merge';
  if (b.plDefault !== undefined) { const v = str(b.plDefault, 40); if (v && !plIds.includes(v)) throw new HttpErr(400, 'Playlist da usare non trovata'); o.pl_default = v; }
  o.player = cur.player || '';
  if (b.player !== undefined) o.player = playerInput(b.player);
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
  if (ok && a.role === 'agent' && !(await agentChainActive(env, a.id))) {
    await log(env, 'off', `Accesso rifiutato all'agente ${a.username}: account disattivato`, ip);
    throw new HttpErr(403, 'Account disattivato: contatta il tuo fornitore');
  }
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
  return json({ ok: true, user: a.username, totp: !!a.totp_on, role: a.role === 'agent' ? 'agent' : 'owner' }, 200, { 'Set-Cookie': setCookie(tok, SESSION_TTL) });
}

async function cleanup(env) {
  const t = now();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE expires < ?').bind(t),
    env.DB.prepare("DELETE FROM settings WHERE (k LIKE 'trl:%' OR k LIKE 'trl2:%' OR k LIKE 'mta:%' OR k LIKE 'prs:%') AND CAST(json_extract(v, '$.t') AS INTEGER) < ?").bind(t - 14 * 864e5),
    env.DB.prepare('DELETE FROM login_fail WHERE until < ? AND updated < ?').bind(t, t - 86400e3),
    env.DB.prepare('DELETE FROM activity WHERE t < ?').bind(t - 90 * 86400e3),
    // dispositivi mai attivati e non più visti da 30 giorni (non le connessioni collegate a un cliente,
    // né quelli a cui il fornitore ha dato un nome o una nota dal pannello)
    env.DB.prepare("DELETE FROM devices WHERE active = 0 AND playlists = '' AND parent = '' AND name = '' AND notes = '' AND last_seen < ?").bind(t - 30 * 86400e3),
  ]);
  try { await env.DB.prepare('DELETE FROM messages WHERE until > 0 AND until < ?').bind(t).run(); } catch {}
  try { await env.DB.prepare('DELETE FROM app_errors WHERE t < ?').bind(t - ERR_KEEP_MS).run(); } catch {} // errori dell'app: solo gli ultimi 7 giorni
  try { await env.DB.batch([env.DB.prepare('DELETE FROM link_pins WHERE until < ?').bind(t), env.DB.prepare('DELETE FROM throttle WHERE until < ?').bind(t)]); } catch {}
  // segnalazioni/richieste "fatte" da più di 90 giorni, presenze vecchie di 30 giorni, classifiche di oltre 60 giorni
  try { await env.DB.batch([env.DB.prepare("DELETE FROM requests WHERE status = 'done' AND created < ?").bind(t - 90 * 86400e3), env.DB.prepare('DELETE FROM presence WHERE t < ?').bind(t - 30 * 86400e3), env.DB.prepare('DELETE FROM watch WHERE day < ?').bind(dayIT(t - 60 * 86400e3))]); } catch {}
}

// esportati per i test
export const _internal = { hashPass, checkPass, hotp, checkTotp, b32enc, seal, unseal, cleanTitle, cleanProfiles, semverCode, textToHtml, cleanWg, permsParse, permsJson, hostOf, cleanHost, swapHost, dayIT, PERM_KEYS };
