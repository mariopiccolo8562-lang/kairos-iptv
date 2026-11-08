import { ADDON_ASSETS } from './addon-assets.js';
/*  KAIROS — Cloudflare Worker
 *  - /panel/*            pannello (asset statici) — protetto da Cloudflare Access se configurato
 *  - /api/admin/*        API del pannello — sessione + 2FA + CSRF + Access JWT
 *  - /api/player/*       API pubblica per l'app (rate limit + segreto dispositivo)
 *  - /api/public/config  configurazione pubblica minima del pannello (chiave Turnstile)
 *
 *  Binding:  DB (D1), ASSETS, RL_LOGIN / RL_DEVICE / RL_HB (rate limiting)
 *  Segreti:  ENC_KEY (base64, 32 byte), ADMIN_BOOTSTRAP_PASS, TURNSTILE_SECRET (opzionale)
 *  Variabili: ACCESS_TEAM_DOMAIN, ACCESS_AUD, TURNSTILE_SITEKEY (opzionali)
 */
import { storeApi, storeAdmin, storeHeaders, storeHooks, storeDecide, storeAgentAlerts, storeDeviceSeller } from './store.js'; // autorizzazione download dello Store (/api/store/*)
import { wolfRoutes, wolfCron, sockFetch } from './wolf.js'; // pannello WOLF collegato (sezione «WOLF» del pannello)
import { atxRoutes } from './atlantix.js'; // Pannello Atlantix (cms.axdash.biz), solo titolare
import { oraRoutes } from './orapanel.js';
import { orcpRoutes, ovpnFile } from './orcp.js'; // Pannello ORCP (cp.ottrun.com): l'app brandizzata OTTRUN, accesso passato dal titolare
import { extRoutes } from './extpanels.js'; // Pannelli Realott e SLT (accesso diretto senza API), solo titolare // Pannello ORA (panel.oraplayers.com), accesso passato dal titolare
import { oxpRoutes } from './orbixpanel.js'; // playlist OrbixPlay gestite da KAIROS (sezione «Pannello OrbixPlay»)
import { mxpRoutes } from './mxpanel.js'; // account MaxPlayer gestiti da KAIROS (sezione «Pannello MaxPlayer»)
import { tgHook, notifyNew, notifyDecided, notifyActivated, notifyAdmin } from './notify.js'; // avvisi su Telegram e notifiche del pannello

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
      res = await route(req, reqEnv(env), ctx);
    } catch (e) {
      console.error('ERR', e && e.stack || e);
      res = json({ error: 'Errore interno' }, 500);
    }
    return harden(res, req);
  },
  async scheduled(_ev, env0) {
    const env = reqEnv(env0);
    await cleanup(env);
    try { await pendSweep(env, true); } catch {} // richieste «da attivare» non accettate entro il tempo scelto
    // app terzi: se l'hai chiesto, ogni notte si tolgono le liste inattive
    try { const c = (await getSettings(env)).playersCfg || {}; if (c.autoClean) await thirdCleanup(env, c.cleanDays || 60, 'Pulizia automatica', ''); } catch {}
    try { await wolfCron(env, WOLF_H); } catch {}
  },
};

/* ====================================================================== */
/* Utility                                                                */
/* ====================================================================== */
const now = () => Date.now();
/* Memoria della singola richiesta. Il database è lontano (ogni lettura è un viaggio): la stessa lettura — impostazioni,
   DNS salvati, agenti, presenza — chiesta da più funzioni durante la stessa richiesta si fa una volta sola.
   env di ogni richiesta è un oggetto suo (Object.create: i binding restano quelli veri), quindi niente resta
   tra una richiesta e l'altra e non c'è nessun dato vecchio. Fuori da una richiesta (env non avvolto) non memorizza. */
const REQ_MEMO = new WeakMap();
function reqEnv(env) { const e = Object.create(env); REQ_MEMO.set(e, new Map()); return e; }
function reqMemo(env, k, fn) {
  const m = REQ_MEMO.get(env);
  if (!m) return fn();
  if (!m.has(k)) { const p = fn(); m.set(k, p); Promise.resolve(p).catch(() => { if (m.get(k) === p) m.delete(k); }); }
  return m.get(k);
}
/** dopo una scrittura: la prossima lettura nella stessa richiesta torna al database */
function memoDrop(env, ...ks) { const m = REQ_MEMO.get(env); if (m) for (const k of ks) m.delete(k); }
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
class HttpErr extends Error { constructor(status, msg, extra) { super(msg); this.status = status; this.extra = extra; } }
// strumenti passati al modulo WOLF (src/wolf.js)
const WOLF_H = { seal: (...a) => seal(...a), unseal: (...a) => unseal(...a), HttpErr, json, readJSON, str, log: (...a) => log(...a), note: (...a) => llNote(...a), pid: () => b64url(rand(6)), plsChanged: () => { srcMem.map = null; } };
const AGM_MSG = 'Pannello in manutenzione: torniamo operativi a breve. Riprova tra poco.';

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
/* playlist già decifrate in questa istanza: /admin/state ogni 15-20 s decifrava di nuovo migliaia di clienti */
const unsealMem = new Map();
async function unseal(env, s) {
  if (!s) return [];
  if (!s.startsWith('v1:')) return [];
  const c = unsealMem.get(s);
  if (c !== undefined) return JSON.parse(c);
  const raw = unb64(s.slice(3));
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(0, 12) }, await getKey(env), raw.slice(12));
  const txt = dec.decode(pt);
  unsealMem.set(s, txt);
  if (unsealMem.size > 12000) unsealMem.delete(unsealMem.keys().next().value);
  return JSON.parse(txt);
}
/* /admin/state: se dall'ultima volta non è cambiato niente (stessa impronta) risponde { same: true } invece di rimandare tutto */
async function stateJson(req, obj) {
  const body = JSON.stringify(obj);
  const tag = [...new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(body)))].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
  const h = { 'Content-Type': 'application/json; charset=utf-8', 'X-Kairos-Etag': tag, 'Cache-Control': 'no-store' };
  return new Response(req.headers.get('X-Kairos-Etag') === tag ? '{"same":true}' : body, { headers: h });
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
  } else if (url.pathname.startsWith('/store/') || url.pathname.startsWith('/get/')) {
    // pagina dello store (da GitHub Pages) e APK (dalle release): link senza nomi; la pagina ha script interni, niente CSP del pannello
    if (url.pathname.endsWith('.html') || url.pathname.endsWith('/') || url.pathname.endsWith('.json')) h.set('Cache-Control', 'no-cache');
  } else if (url.pathname.startsWith('/app/') && url.searchParams.get('app') === 'vega') {
    // solo per l'app KAIROS delle Fire TV con Vega OS (WebView): la pagina ha script interni e si collega
    // ai server IPTV dei clienti, quindi la CSP del pannello la bloccherebbe. Tutto il resto resta com'era.
    if (url.pathname.endsWith('.html') || url.pathname.endsWith('/')) h.set('Cache-Control', 'no-cache');
  } else {
    h.set('Content-Security-Policy', CSP_PANEL);
    if (url.pathname.endsWith('.html') || url.pathname.endsWith('/')) h.set('Cache-Control', 'no-cache');
    // file del pannello con la versione nel link (?v=…, messa dal deploy): il browser li tiene e non li richiede più finché non cambiano
    else if (url.pathname.startsWith('/panel/') && /^[a-f0-9]{8,16}$/.test(url.searchParams.get('v') || '') && r.status === 200) h.set('Cache-Control', 'public, max-age=31536000, immutable');
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
  allowLocalPlaylists: true, apkUrl: '', apkVersionCode: 0, downloaderCode: '', storeDownloaderCode: '', liteDownloaderCode: '', liteApkUrl: '', ktvDownloaderCode: '', ktvApkUrl: '', xcDownloaderCode: '', xcApkUrl: '', plusDownloaderCode: '', plusApkUrl: '', premDownloaderCode: '', novaDownloaderCode: '',
  serverUrl: '', showFootball: true,
  price: '22 € / anno', privacy: '',
  aiDaily: 20, aiProvider: 'gm', aiClaude: 'haiku', aiGemini: 'flash',
  maint: { on: false, msg: '', allow: [] },
  // DNS personali per OrbixPlay e MaxPlayer (gli agenti vedono solo il nome, salvo showDnsAgents)
  playersCfg: { orbix: [{ name: 'NKI OrbixPlay', host: 'http://orbx.nki-orbx.download' }], max: [], showDnsAgents: false, codes: { orbix: '265847', max: '265847' }, slots: null }, // link diretto NKI e codice cliente già pronti (slots: vedi SLOTS_DEFAULT)
  // «Attiva app»: il link di gestione dispositivo di ogni app dello store (dove il titolare attiva la lista col codice del cliente). Modificabile e ampliabile dal pannello.
  appLinks: [
    { name: 'OrbixPlay', url: 'https://orbixplay.com/mylist' },
    { name: 'MaxPlayer', url: 'https://maxplayer.tv/it/tools/playlist-checker' },
    { name: 'Ora Player', url: 'https://euser.oraplayers.com/subscribe-web' },
    { name: 'Ora Pro', url: 'https://euser.oraprotv.com/manage-device?redirectURL=%2Fdevice-info' },
    { name: 'Ibo One', url: 'https://euser.iboonetv.com/manage-device?redirectURL=%2Fsubscribe-web' },
    { name: 'Ibo Player', url: 'https://iboplayer.com/device/login' },
    { name: 'Kemet', url: 'https://euser.kemetiptv.com/manage-device' },
    { name: 'Gravity', url: 'https://euser.gravityiptv.com/manage-device' },
    { name: 'Hot Ora IPTV', url: 'https://euser.hotoraiptv.com/manage-device' },
    { name: 'Duplex Pro', url: 'https://euser.duplexprotv.com/manage-device' },
    { name: 'TiviMate Pro', url: 'https://www.tivimateiptvpro.com/playlist' },
  ],
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
    const r = await fetch(env.APK_FEED, { headers: { 'User-Agent': 'KairosPanel' }, signal: AbortSignal.timeout(4000), cf: { cacheTtl: 300, cacheEverything: true } });
    if (r.ok) {
      const j = await r.json();
      const code = semverCode(j.version) || +j.versionCode;
      if (code > 0 && /^https:\/\//.test(j.url || '')) v = { versionCode: code, version: String(j.version || '').slice(0, 20), url: String(j.url).slice(0, 500), date: String(j.date || '').slice(0, 40) };
    }
  } catch {}
  feedMem = { t: now(), v };
  return v;
}
/* Kairos TV (versione leggera stile Netflix, repository separato kairos-tv come la Lite):
   aggiornamenti da kairos-tv.json dell'ultima release, oppure dal link scritto nel pannello */
const KTV_APK = 'https://github.com/mariopiccolo8562-lang/kairos-tv/releases/latest/download/kairos-tv.apk';
let ktvMem = { t: 0, k: '', v: null };
async function ktvFeed(s) {
  const apk = s.ktvApkUrl || KTV_APK, url = apk.replace(/\.apk(\?.*)?$/i, '.json');
  if (ktvMem.k === url && now() - ktvMem.t < 5 * 60e3) return ktvMem.v;
  let v = null;
  if (/^https:\/\/.+\.json$/i.test(url)) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'KairosPanel' }, signal: AbortSignal.timeout(4000), cf: { cacheTtl: 300, cacheEverything: true } });
      if (r.ok) {
        const j = await r.json();
        const code = semverCode(j.version) || +j.versionCode;
        if (code > 0) v = { versionCode: code, version: String(j.version || '').replace(/^v/i, '').slice(0, 20), url: /^https:\/\//.test(j.url || '') ? String(j.url).slice(0, 500) : apk, date: String(j.date || '').slice(0, 40), auto: true };
      }
    } catch {}
  }
  ktvMem = { t: now(), k: url, v };
  return v;
}
/* Kairos Premium (repository kairos-premium): aggiornamenti da kairos-premium.json dell'ultima release */
const PREM_APK = 'https://github.com/mariopiccolo8562-lang/kairos-premium/releases/latest/download/kairos-premium.apk';
let premMem = { t: 0, v: null };
async function premFeed() {
  if (now() - premMem.t < 5 * 60e3) return premMem.v;
  let v = null;
  try {
    const r = await fetch(PREM_APK.replace(/\.apk$/, '.json'), { headers: { 'User-Agent': 'KairosPanel' }, signal: AbortSignal.timeout(4000), cf: { cacheTtl: 300, cacheEverything: true } });
    if (r.ok) {
      const j = await r.json();
      const code = semverCode(j.version) || +j.versionCode;
      if (code > 0) v = { versionCode: code, version: String(j.version || '').replace(/^v/i, '').slice(0, 20), url: /^https:\/\//.test(j.url || '') ? String(j.url).slice(0, 500) : PREM_APK, date: String(j.date || '').slice(0, 40) };
    }
  } catch {}
  premMem = { t: now(), v };
  return v;
}
/* Kairos XC (stile MirkoTeam, repository separato kairos-xc): stesso meccanismo di Kairos TV */
const XC_APK = 'https://github.com/mariopiccolo8562-lang/kairos-xc/releases/latest/download/kairos-xc.apk';
let xcMem = { t: 0, k: '', v: null };
async function xcFeed(s) {
  const apk = s.xcApkUrl || XC_APK, url = apk.replace(/\.apk(\?.*)?$/i, '.json');
  if (xcMem.k === url && now() - xcMem.t < 5 * 60e3) return xcMem.v;
  let v = null;
  if (/^https:\/\/.+\.json$/i.test(url)) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'KairosPanel' }, signal: AbortSignal.timeout(4000), cf: { cacheTtl: 300, cacheEverything: true } });
      if (r.ok) { const j = await r.json(); const code = semverCode(j.version) || +j.versionCode; if (code > 0) v = { versionCode: code, version: String(j.version || '').replace(/^v/i, '').slice(0, 20), url: /^https:\/\//.test(j.url || '') ? String(j.url).slice(0, 500) : apk, date: String(j.date || '').slice(0, 40) }; }
    } catch {}
  }
  xcMem = { t: now(), k: url, v };
  return v;
}
/* Kairos Plus (app stile Netflix in Flutter, repository kairos-flutter, pacchetto com.kairos.plus):
   la release più recente pubblica kairos-plus.apk e kairos-plus.json (versione 0.1.N) */
const PLUS_APK = 'https://github.com/mariopiccolo8562-lang/kairos-flutter/releases/latest/download/kairos-plus.apk';
let plusMem = { t: 0, k: '', v: null };
const NOVA_FEED = 'https://github.com/mariopiccolo8562-lang/Lairos-nova/releases/download/latest/kairos-nova.json';
// 32 bit: si installa su tutte le chiavette, anche le Fire TV Stick vecchie
const NOVA_APK = NOVA_FEED.replace('kairos-nova.json', 'KairosNova-arm32.apk');
let novaMem = { t: 0, v: null };
/** Kairos Nova: feed kairos-nova.json della release «latest» (versione, numero, link dell'APK arm64) */
async function novaFeed() {
  if (now() - novaMem.t < 5 * 60e3) return novaMem.v;
  let v = null;
  try {
    const r = await fetch(NOVA_FEED, { headers: { 'User-Agent': 'KairosPanel' }, signal: AbortSignal.timeout(4000), cf: { cacheTtl: 300, cacheEverything: true } });
    if (r.ok) { const j = await r.json(); const ver = String(j.version || '').replace(/^v/i, '').slice(0, 20); if (ver) v = { versionCode: +j.versionCode || semverCode(ver), version: ver, url: /^https:\/\//.test(j.url || '') ? String(j.url) : '', date: j.date || '' }; }
  } catch {}
  novaMem = { t: now(), v };
  return v;
}
async function plusFeed(s) {
  const apk = s.plusApkUrl || PLUS_APK, url = apk.replace(/\.apk(\?.*)?$/i, '.json');
  if (plusMem.k === url && now() - plusMem.t < 5 * 60e3) return plusMem.v;
  let v = null;
  if (/^https:\/\/.+\.json$/i.test(url)) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'KairosPanel' }, signal: AbortSignal.timeout(4000), cf: { cacheTtl: 300, cacheEverything: true } });
      if (r.ok) { const j = await r.json(); const ver = String(j.version || '').replace(/^v/i, '').slice(0, 20); if (ver) v = { versionCode: +j.versionCode || semverCode(ver), version: ver, url: /^https:\/\//.test(j.url || '') ? String(j.url).slice(0, 500) : apk, date: String(j.date || '').slice(0, 40) }; }
    } catch {}
  }
  plusMem = { t: now(), k: url, v };
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

/** nomi delle app richieste dallo store (per scegliere quali può approvare un agente) */
let sanMem = { t: 0, v: null };
async function storeAppNames(env) {
  // letta a ogni apertura/aggiornamento del pannello scorrendo tutte le richieste dello store: ora resta in memoria 5 minuti
  if (sanMem.v && now() - sanMem.t < 5 * 60e3) return sanMem.v;
  try { const v = (((await env.DB.prepare('SELECT DISTINCT app FROM store_requests ORDER BY app LIMIT 200').all()).results) || []).map((r) => r.app).filter(Boolean); sanMem = { t: now(), v }; return v; } catch { return []; }
}
/* ---------------- OrbixPlay: invio delle playlist del cliente all'app OrbixPlay (API ufficiale, chiave ORBIX_KEY) ---------------- */
const ORBIX_API = 'https://apis.orbixplay.com';
const ORBIX_ID_RE = /^[A-Za-z0-9:._-]{4,64}$/;
/* ID OrbixPlay: se è un MAC (12 cifre esadecimali, con o senza separatori) lo scrive come 00:1A:79:AA:BB:CC, come lo mostra l'app */
const macShort = (v) => /^[0-9A-Fa-f]{2}([:.-][0-9A-Fa-f]{2}){2,4}$/.test(String(v || '').trim()); // sembra un MAC ma ha meno di 6 coppie
const macNorm = (v) => { v = String(v || '').trim(); const h = v.replace(/[^0-9A-Fa-f]/g, ''); return h.length === 12 && /^[0-9A-Fa-f:.\s-]+$/.test(v) ? h.toUpperCase().match(/../g).join(':') : v; };
/** linee Xtream di un cliente: le M3U con get.php?username=…&password=… diventano Xtream */
function xtreamLines(pls) {
  const out = [];
  for (const p of pls || []) {
    if (p.type === 'xtream' && p.host && p.username && p.password) { out.push({ name: p.name || 'Kairos', host: p.host, username: p.username, password: p.password }); continue; }
    try { const u = new URL(p.url || ''); const us = u.searchParams.get('username'), pw = u.searchParams.get('password'); if (us && pw) out.push({ name: p.name || 'Kairos', host: u.origin, username: us, password: pw }); } catch {}
  }
  return out.slice(0, 10);
}
const macVariants = (v) => { const h = String(v || '').replace(/[^0-9A-Fa-f]/g, ''); if (h.length !== 12 || !/^[0-9A-Fa-f:.\s-]+$/.test(String(v || '').trim())) return [v]; const u = h.toUpperCase(), l = h.toLowerCase(), c = (x, sp) => x.match(/../g).join(sp); return [...new Set([v, c(u, ':'), c(l, ':'), u, l, c(u, '-'), c(l, '-')])]; }; // OrbixPlay a volte salva il MAC in un'altra scrittura
async function orbixCall(env, path, query) {
  if (!env.ORBIX_KEY) throw new HttpErr(400, 'OrbixPlay non è collegato: aggiungi il segreto ORBIX_KEY su GitHub (vedi la guida in Impostazioni)');
  const alt = query && query.hostUrl; if (query && 'hostUrl' in query) delete query.hostUrl; // indirizzo del DNS, se OrbixPlay non riconosce il codice host
  const ids = path === '/add-playlist' && query && query.deviceid ? macVariants(query.deviceid) : [null];
  let r, j, why = '';
  for (const id of ids) {
    const qq = id ? { ...query, deviceid: id } : query;
    try { r = await fetch(ORBIX_API + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-customer-key': env.ORBIX_KEY }, body: JSON.stringify({ query: qq }) }); } catch { throw new HttpErr(502, 'OrbixPlay non risponde, riprova tra poco'); }
    j = await r.json().catch(() => ({}));
    if (r.ok) { if (id) query.deviceid = id; return j; }
    why = str(j.error || j.message || '', 160);
    if (!/device not found/i.test(why)) break;
  }
  if (/host code not found/i.test(why)) { if (alt && query.host !== alt) { query.host = alt; return orbixCall(env, path, query); } throw new HttpErr(400, 'OrbixPlay non riconosce il «codice host» di questo DNS: correggilo (o toglilo) in Impostazioni → App e aggiornamenti → DNS di OrbixPlay'); }
  const MSG = { 400: 'Dati non accettati da OrbixPlay', 401: 'Chiave OrbixPlay non valida', 403: 'Abbonamento OrbixPlay scaduto o posti finiti', 404: 'Dispositivo non trovato su OrbixPlay: controlla l\'ID (il cliente deve prima aprire l\'app OrbixPlay)' };
  throw new HttpErr(r.status === 404 || r.status === 403 || r.status === 400 ? 400 : 502, (MSG[r.status] || 'Errore di OrbixPlay') + (why ? ' — ' + why : ''));
}
const orbixOf = (d) => { try { const o = JSON.parse(d.orbix || '{}'); return { id: str(o.id, 64), pls: Array.isArray(o.pls) ? o.pls.map((x) => str(String(x), 64)).filter(Boolean) : [], t: +o.t || 0, n: +o.n || 0, u: str(o.u, 120), dns: +o.dns || 0, h: str(o.h, 300) }; } catch { return { id: '', pls: [], t: 0, n: 0, u: '', dns: 0, h: '' }; } };
/** attiva il dispositivo OrbixPlay: ID del dispositivo + utente e password della linea, sul DNS personale scelto
    (l'indirizzo non lo scrive nessuno: lo prende dalle impostazioni; con il «codice host» non viaggia nemmeno in chiaro) */
async function orbixSend(env, d, b, who, ip, agentLines, allow) {
  if (!env.ORBIX_KEY) throw new HttpErr(400, 'OrbixPlay non è collegato: aggiungi il segreto ORBIX_KEY su GitHub (vedi la guida in Impostazioni)');
  let orbixId = macNorm(str(b.orbixId, 64)); const username = str(b.username, 120), password = typeof b.password === 'string' ? b.password.slice(0, 200) : '';
  if (!ORBIX_ID_RE.test(orbixId)) throw new HttpErr(400, 'Scrivi l\'ID del dispositivo che compare nell\'app OrbixPlay');
  if (macShort(orbixId)) throw new HttpErr(400, `ID incompleto: ${orbixId} ha ${orbixId.split(/[:.-]/).length} coppie, un ID OrbixPlay ne ha 6 (es. 00:1A:79:AA:BB:CC). Controllalo nell'app OrbixPlay`);
  if (!username || !password) throw new HttpErr(400, 'Scrivi utente e password della linea');
  if (agentLines && !agentLines.some((l) => l.username === username && l.password === password)) throw new HttpErr(400, 'Usa utente e password di una linea di questo cliente');
  const s = await getSettings(env), list = agentLines ? agOrbList(s, allow) : orbixDnsList((s.playersCfg || {}).orbix, await dnsList(env));
  if (!list.length) throw new HttpErr(400, agentLines ? 'Nessun DNS di OrbixPlay disponibile per te: chiedilo a chi ti gestisce' : 'Imposta prima un DNS (OrbixPlay in APP Store, oppure in «Server DNS»)');
  const di = Math.max(0, Math.min(list.length - 1, parseInt(b.dns, 10) || 0)), dns = list[di];
  const old = orbixOf(d);
  const oq = { deviceid: orbixId, playlistName: str(s.brand || 'Kairos', 40), username, password, host: dns.code || dns.host, hostUrl: dns.code ? dns.host : '', notes: str(d.name || d.code, 60) };
  const j = await orbixCall(env, '/add-playlist', oq);
  orbixId = oq.deviceid;
  const pid = j.playlist_id ?? (j.playlist && j.playlist.playlist_id) ?? j.id;
  const pls = pid !== undefined && pid !== null ? [String(pid)] : [];
  // solo ora (se l'invio è riuscito) si toglie quella mandata l'ultima volta: un ID sbagliato non svuota il dispositivo giusto
  if (old.id) for (const id of old.pls) if (!pls.includes(id)) await orbixCall(env, '/delete-playlist', { playlist_id: /^\d+$/.test(id) ? +id : id }).catch(() => {});
  const o = { id: orbixId, pls, t: now(), n: 1, u: username, dns: di, h: hostKey(dns.host) };
  await env.DB.prepare('UPDATE devices SET orbix = ? WHERE id = ?').bind(JSON.stringify(o), d.id).run();
  await llAuto(env, d, 'orbix', username, password, dns.host, dns.name, orbixId).catch(() => {}); // registro «Linee collegate»
  await log(env, 'edit', `${who}: OrbixPlay attivato per ${d.name || d.code} (dispositivo ${orbixId}, ${dns.name})`, ip);
  return { id: orbixId, n: 1, t: o.t, u: username, dns: di };
}
/* ---------------- MaxPlayer: account del cliente creato con la sua API ufficiale (chiave MAXPLAYER_KEY, intestazione Api-Token).
   Il DNS è un «dominio» registrato su MaxPlayer: si sceglie per ID, l'indirizzo non viaggia e il cliente non lo vede. ---------------- */
const MX_API = 'https://api.maxplayer.tv/v3/api/public';
async function mxCall(env, method, path, body) {
  if (!env.MAXPLAYER_KEY) throw new HttpErr(400, 'MaxPlayer non è collegato: aggiungi il segreto MAXPLAYER_KEY su GitHub (vedi la guida in Impostazioni)');
  let r;
  try { r = await fetch(MX_API + path, { method, headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'Api-Token': env.MAXPLAYER_KEY }, body: body === undefined ? undefined : JSON.stringify(body) }); } catch { throw new HttpErr(502, 'MaxPlayer non risponde, riprova tra poco'); }
  const j = await r.json().catch(() => ({}));
  if (r.ok && j && j.success !== 0) return j;
  const why = str((j && j.error) || '', 200);
  const MSG = { 401: 'Chiave MaxPlayer non valida o servizio MaxPlayer non attivo', 403: 'MaxPlayer: operazione non consentita (permessi o servizio)', 404: 'MaxPlayer: non trovato', 409: 'MaxPlayer: conflitto (già esistente o in uso)', 429: 'MaxPlayer: troppe richieste, riprova tra un minuto' };
  throw new HttpErr(r.status >= 500 ? 502 : 400, (MSG[r.status] || 'Errore di MaxPlayer') + (why ? ' — ' + why : ''));
}
let mxDomMem = { t: 0, list: null };
async function mxDomains(env, fresh) {
  if (!fresh && mxDomMem.list && Date.now() - mxDomMem.t < 5 * 60e3) return mxDomMem.list;
  const j = await mxCall(env, 'GET', '/domains');
  const list = (Array.isArray(j.data) ? j.data : []).map((x) => ({ id: str(String(x.id ?? ''), 30), domain: str(x.domain, 200), port: str(String(x.port ?? ''), 8), https: !!+x.https, label: str(x.label, 60), status: str(x.status, 20) })).filter((x) => x.id);
  mxDomMem = { t: Date.now(), list };
  return list;
}
const maxpOf = (d) => { try { const o = JSON.parse(d.maxp || '{}'); return { uid: str(String(o.uid || ''), 30), u: str(o.u, 120), dom: str(String(o.dom || ''), 30), t: +o.t || 0 }; } catch { return { uid: '', u: '', dom: '', t: 0 }; } };
/** attiva (crea l'account) o aggiorna la lista del cliente su MaxPlayer: utente e password della linea + dominio scelto */
async function mxSend(env, d, b, who, ip, agentLines, allow) {
  if (!env.MAXPLAYER_KEY) throw new HttpErr(400, 'MaxPlayer non è collegato: aggiungi il segreto MAXPLAYER_KEY su GitHub (vedi la guida in Impostazioni)');
  const username = str(b.username, 120), password = typeof b.password === 'string' ? b.password.slice(0, 200) : '', dom = str(String(b.domain ?? ''), 30);
  if (!username || !password) throw new HttpErr(400, 'Scrivi utente e password della linea');
  if (agentLines && !agentLines.some((l) => l.username === username && l.password === password)) throw new HttpErr(400, 'Usa utente e password di una linea di questo cliente');
  const doms = agentLines ? agMxList(await mxDomains(env), allow) : await mxDomains(env); // agente: solo i DNS che gli hai concesso
  if (!doms.length) throw new HttpErr(400, agentLines ? 'Nessun DNS di MaxPlayer disponibile per te: chiedilo a chi ti gestisce' : 'Su MaxPlayer non hai ancora un DNS: aggiungilo in Impostazioni → App e aggiornamenti');
  const D0 = doms.find((x) => x.id === dom) || doms.find((x) => x.domain === 'maxplayer.nki-max.stream') || doms[0];
  const old = maxpOf(d);
  let uid = old.uid, login = old.u, created = false;
  if (uid) {
    try { await mxCall(env, 'PUT', '/users/list', { user_id: uid, domain_id: D0.id, iptv_username: username, iptv_password: password }); }
    catch (e) { if (!/non trovato/i.test(e.message)) throw e; uid = ''; } // account cancellato da MaxPlayer: si ricrea
  }
  if (!uid) {
    const P = d.parent ? await env.DB.prepare('SELECT * FROM devices WHERE id = ?').bind(d.parent).first() : d;
    const body = { domain_id: D0.id, iptv_user: username, iptv_pass: password, fullname: str((P || d).name || d.name || d.code, 60) };
    const j = await mxCall(env, 'POST', '/users', body);
    uid = str(String(j.user_id ?? ''), 30); login = username; created = true;
    if (!uid) throw new HttpErr(502, 'MaxPlayer non ha restituito l\'account creato');
  }
  const o = { uid, u: login, dom: D0.id, t: now() };
  await env.DB.prepare('UPDATE devices SET maxp = ? WHERE id = ?').bind(JSON.stringify(o), d.id).run();
  await llAuto(env, d, 'max', username, password, D0.domain ? `${D0.https ? 'https' : 'http'}://${D0.domain}${D0.port && !['80', '443'].includes(String(D0.port)) ? ':' + D0.port : ''}` : '', D0.label || 'DNS ' + D0.id, login).catch(() => {});
  await log(env, 'edit', `${who}: MaxPlayer ${created ? 'attivato' : 'aggiornato'} per ${d.name || d.code} (${D0.label || 'DNS ' + D0.id})`, ip);
  return { uid, u: login, dom: D0.id, t: o.t, created };
}
async function mxRemove(env, d, who, ip) {
  const old = maxpOf(d);
  if (old.uid) await mxCall(env, 'DELETE', '/users/' + encodeURIComponent(old.uid)).catch((e) => { if (!/non trovato/i.test(e.message)) throw e; });
  await env.DB.prepare("UPDATE devices SET maxp = '' WHERE id = ?").bind(d.id).run();
  await llAutoOff(env, d, 'max').catch(() => {});
  await log(env, 'off', `${who}: MaxPlayer — account tolto a ${d.name || d.code}`, ip);
  return { ok: true };
}
/** «http(s)://host:porta» → dominio per MaxPlayer */
function mxDomainBody(u, label) {
  let x; try { x = new URL(/^https?:\/\//i.test(u) ? u : 'http://' + u); } catch { throw new HttpErr(400, 'Scrivi il DNS completo, es. http://dns.esempio.com:8080'); }
  const https = x.protocol === 'https:', port = +(x.port || (https ? 443 : 80));
  if (!/^[a-z0-9.-]+$/i.test(x.hostname)) throw new HttpErr(400, 'DNS non valido');
  return { domain: x.hostname.toLowerCase(), port, https, label: str(label, 60) };
}

/* ---------------- «Crea lista»: liste caricate su OrbixPlay / MaxPlayer senza un cliente Kairos ----------------
   Il titolare le vede tutte; un agente (con «Attivare OrbixPlay e MaxPlayer dal pannello») solo le sue e quelle dei suoi
   sotto-agenti. Le chiavi e gli indirizzi dei DNS restano nel pannello: si sceglie il DNS per nome. */
async function extListsRoutes(req, env, path, who, ip, ag) {
  const m = req.method, t = now();
  const mine = ag ? ag.tree : null; // null = titolare (tutte)
  if (path === '/ext-lists' && m === 'GET') {
    const rows = ((await env.DB.prepare('SELECT * FROM ext_lists ORDER BY created DESC LIMIT 1000').all()).results || []).filter((r) => !mine || mine.includes(+r.owner_id));
    const names = new Map((await agentsAll(env)).map((a) => [a.id, a.username]));
    return json({ lists: rows.map((r) => ({ id: r.id, app: r.app, name: r.name, ref: r.ref, username: r.username, dns: r.dns, note: r.note, created: r.created, updated: r.updated, by: +r.owner_id ? names.get(+r.owner_id) || 'agente eliminato' : 'Tu', mine: ag ? +r.owner_id === ag.id : !+r.owner_id })) });
  }
  if (path === '/ext-lists' && m === 'POST') {
    const b = await readJSON(req, 4096);
    const app = b.app === 'max' ? 'max' : b.app === 'orbix' ? 'orbix' : '';
    if (!app) throw new HttpErr(400, 'Scegli OrbixPlay o MaxPlayer');
    const name = nameClean(b.name, 60), note = nameClean(b.note, 200), username = str(b.username, 120), password = typeof b.password === 'string' ? b.password.slice(0, 200) : '';
    if (!username || !password) throw new HttpErr(400, 'Scrivi utente e password della linea');
    const s = await getSettings(env);
    let ref = '', ext = '', dnsName = '';
    if (app === 'orbix') {
      if (!env.ORBIX_KEY) throw new HttpErr(400, 'OrbixPlay non è collegato: aggiungi il segreto ORBIX_KEY su GitHub');
      let orbixId = macNorm(str(b.orbixId, 64));
      if (!ORBIX_ID_RE.test(orbixId)) throw new HttpErr(400, 'Scrivi l\'ID del dispositivo che compare nell\'app OrbixPlay');
      if (macShort(orbixId)) throw new HttpErr(400, `ID incompleto: ${orbixId} ha ${orbixId.split(/[:.-]/).length} coppie, un ID OrbixPlay ne ha 6 (es. 00:1A:79:AA:BB:CC). Controllalo nell'app OrbixPlay`);
      const list = ag ? agOrbList(s, ag.orbDns) : orbixDnsList((s.playersCfg || {}).orbix, await dnsList(env));
      if (!list.length) throw new HttpErr(400, ag ? 'Nessun DNS di OrbixPlay disponibile per te: chiedilo a chi ti gestisce' : 'Imposta prima un DNS di OrbixPlay');
      const dns = list[Math.max(0, Math.min(list.length - 1, parseInt(b.dns, 10) || 0))];
      const oq = { deviceid: orbixId, playlistName: str(s.brand || 'Kairos', 40), username, password, host: dns.code || dns.host, hostUrl: dns.code ? dns.host : '', notes: name || username };
      const j = await orbixCall(env, '/add-playlist', oq);
      orbixId = oq.deviceid;
      const pid = j.playlist_id ?? (j.playlist && j.playlist.playlist_id) ?? j.id;
      ref = orbixId; ext = JSON.stringify(pid !== undefined && pid !== null ? [String(pid)] : []); dnsName = dns.name || 'DNS';
    } else {
      if (!env.MAXPLAYER_KEY) throw new HttpErr(400, 'MaxPlayer non è collegato: aggiungi il segreto MAXPLAYER_KEY su GitHub');
      const doms = ag ? agMxList(await mxDomains(env), ag.mxDns) : await mxDomains(env);
      if (!doms.length) throw new HttpErr(400, ag ? 'Nessun DNS di MaxPlayer disponibile per te: chiedilo a chi ti gestisce' : 'Su MaxPlayer non hai ancora un DNS');
      const dom = str(String(b.domain ?? ''), 30), D0 = doms.find((x) => x.id === dom) || doms.find((x) => x.domain === 'maxplayer.nki-max.stream') || doms[0];
      const j = await mxCall(env, 'POST', '/users', { domain_id: D0.id, iptv_user: username, iptv_pass: password, fullname: name || username });
      const uid = str(String(j.user_id ?? ''), 30); if (!uid) throw new HttpErr(502, 'MaxPlayer non ha restituito l\'account creato');
      ref = username; ext = uid; dnsName = D0.label || 'DNS ' + D0.id;
    }
    const id = b64url(rand(9));
    await env.DB.prepare('INSERT INTO ext_lists (id, owner_id, app, name, ref, ext, username, pass_seal, dns, note, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, ag ? ag.id : 0, app, name, ref, ext, username, await seal(env, [password]), dnsName, note, t, t).run();
    await llNote(env, { src: app === 'max' ? 'mxp' : 'oxp', app: app === 'max' ? 'MaxPlayer' : 'OrbixPlay', owner: ag ? ag.id : 0, username, password, mac: app === 'orbix' ? ref : '', note: [name, note, dnsName].filter(Boolean).join(' · ') });
    await log(env, 'new', `${who}: lista creata su ${app === 'max' ? 'MaxPlayer' : 'OrbixPlay'}${name ? ' per ' + name : ''} (${app === 'max' ? 'utente ' + username : 'dispositivo ' + ref}, ${dnsName})`, ip);
    return json({ ok: true, id, app, ref, dns: dnsName });
  }
  const em = path.match(/^\/ext-lists\/([A-Za-z0-9_-]{6,20})$/);
  if (em && m === 'DELETE') {
    const r = await env.DB.prepare('SELECT * FROM ext_lists WHERE id = ?').bind(em[1]).first();
    if (!r || (mine && !mine.includes(+r.owner_id))) throw new HttpErr(404, 'Lista non trovata');
    if (r.app === 'orbix') { let pls = []; try { pls = JSON.parse(r.ext || '[]'); } catch {} for (const x of pls) await orbixCall(env, '/delete-playlist', { playlist_id: /^\d+$/.test(x) ? +x : x }).catch((e) => { if (!/non trovato/i.test(e.message)) throw e; }); }
    else if (r.ext) await mxCall(env, 'DELETE', '/users/' + encodeURIComponent(r.ext)).catch((e) => { if (!/non trovato/i.test(e.message)) throw e; });
    await trashPut(env, 'extlist', r.id, `${r.name || r.username} · ${r.app === 'max' ? 'MaxPlayer' : 'OrbixPlay'}`, r, null, who);
    await env.DB.prepare('DELETE FROM ext_lists WHERE id = ?').bind(r.id).run();
    await log(env, 'del', `${who}: lista tolta da ${r.app === 'max' ? 'MaxPlayer' : 'OrbixPlay'}${r.name ? ' (' + r.name + ')' : ''}`, ip);
    return json({ ok: true });
  }
  return null;
}

/* ---------------- liste create sulle app terzi (OrbixPlay, MaxPlayer): elenco e pulizia di quelle inattive ---------------- */
/** inattiva: abbonamento scaduto da più di «days» giorni, oppure cliente disattivato e fermo (nessuna attività, né invio) da più di «days» giorni */
function thirdInactive(d, P, days, t = now()) {
  const lim = t - days * 864e5, src = P || d;
  if (src.expires && DATE_RE.test(src.expires)) { const e = new Date(src.expires + 'T23:59:59Z').getTime(); if (e < lim) return { inactive: true, why: 'scaduto', since: e }; }
  if (!src.active) { const last = Math.max(+d.last_seen || 0, +src.last_seen || 0, orbixOf(d).t, maxpOf(d).t); if (last < lim) return { inactive: true, why: 'disattivato', since: last }; }
  return { inactive: false };
}
/** «Reinvia» a OrbixPlay/MaxPlayer: la linea Xtream del cliente con quell'utente (o la prima), senza riscrivere nulla a mano */
async function resendLine(env, d, username) {
  const P0 = d.parent && !ownOf(d) ? await env.DB.prepare('SELECT playlists FROM devices WHERE id = ?').bind(d.parent).first() : d;
  const lines = xtreamLines(await unseal(env, (P0 || d).playlists).catch(() => []));
  const l = lines.find((x) => x.username === username) || lines[0];
  if (!l) throw new HttpErr(400, 'Questo cliente non ha una linea Xtream da reinviare');
  return l;
}
async function thirdLists(env, days) {
  const rows = ((await env.DB.prepare("SELECT * FROM devices WHERE orbix <> '' OR maxp <> ''").all()).results) || [];
  // DNS usato e chi ha fatto l'attivazione (tu o quale agente): così la pagina dice tutto quello che Kairos sa
  const s0 = await getSettings(env), odns = orbixDnsList((s0.playersCfg || {}).orbix, await dnsList(env));
  let mdoms = []; if (env.MAXPLAYER_KEY) try { mdoms = await mxDomains(env); } catch {}
  const who = new Map((await agentsAll(env)).map((a) => [a.id, a.username]));
  const pm = new Map();
  for (const r of rows) if (r.parent && !pm.has(r.parent)) pm.set(r.parent, await env.DB.prepare('SELECT id, name, active, expires, last_seen FROM devices WHERE id = ?').bind(r.parent).first());
  const out = [];
  for (const d of rows) {
    const P = d.parent ? pm.get(d.parent) : d, ia = thirdInactive(d, P, days);
    const base = { id: d.id, name: d.name || (P && P.name) || '', code: d.code, ownerId: +d.owner_id || 0, by: +d.owner_id ? who.get(+d.owner_id) || 'agente eliminato' : 'Tu', expires: (P || d).expires || '', status: statusOf(P || d, ['x']), inactive: ia.inactive, why: ia.why || '', since: ia.since || 0 };
    const o = orbixOf(d), x = maxpOf(d);
    if (o.id) { const dn = odns[o.dns]; out.push({ ...base, app: 'orbix', ref: o.id, t: o.t, dns: dn ? dn.name || dn.host || '' : '', dnsIdx: o.dns, user: o.u }); }
    if (x.uid) { const dm = mdoms.find((y) => y.id === x.dom); out.push({ ...base, app: 'max', ref: x.u, t: x.t, dns: dm ? dm.label || dm.domain || '' : (x.dom ? 'DNS ' + x.dom : ''), dom: x.dom, user: x.u }); }
  }
  return out.sort((a, b) => (+b.inactive - +a.inactive) || (a.since - b.since) || (b.t - a.t));
}
/** toglie dalle app terzi tutte le liste inattive da più di «days» giorni; restituisce quante e gli eventuali errori */
async function thirdCleanup(env, days, who, ip) {
  const list = (await thirdLists(env, days)).filter((x) => x.inactive);
  let n = 0; const errors = [];
  for (const x of list) {
    const d = await env.DB.prepare('SELECT * FROM devices WHERE id = ?').bind(x.id).first(); if (!d) continue;
    try { if (x.app === 'orbix') { if (env.ORBIX_KEY) { await orbixRemove(env, d, who, ip); n++; } } else if (env.MAXPLAYER_KEY) { await mxRemove(env, d, who, ip); n++; } }
    catch (e) { errors.push(`${x.name || x.code} (${x.app === 'max' ? 'MaxPlayer' : 'OrbixPlay'}): ${e.message}`); }
  }
  if (n) await log(env, 'del', `${who}: app terzi — tolte ${n} liste inattive da più di ${days} giorni`, ip);
  return { removed: n, errors: errors.slice(0, 20) };
}

/* ---------------- Clienti inattivi: chi non apre l'app da più di N giorni (come «Elimina utenti inattivi» di MaxPlayer) ----------------
   Si conservano sempre: i clienti con liste attive su OrbixPlay o MaxPlayer e quelli con una connessione collegata usata di recente. */
async function inactiveClients(env, o) {
  const days = Math.max(7, Math.min(3650, parseInt(o.days, 10) || 30)), lim = now() - days * 864e5;
  const rows = ((await env.DB.prepare("SELECT id, code, name, active, expires, playlists, last_seen, created_at, secret_hash, orbix, maxp, owner_id FROM devices WHERE parent = ''").all()).results) || [];
  const kids = ((await env.DB.prepare("SELECT parent, MAX(last_seen) AS ls, MAX(CASE WHEN orbix <> '' OR maxp <> '' THEN 1 ELSE 0 END) AS third FROM devices WHERE parent <> '' GROUP BY parent").all()).results) || [];
  const km = new Map(kids.map((k) => [k.parent, k]));
  const out = [];
  for (const d of rows) {
    const st = statusOf(d, d.playlists ? ['x'] : []);
    if (st === 'pending') continue; // i codici «da attivare» non sono clienti
    if (d.orbix || d.maxp || (km.get(d.id) || {}).third) continue; // liste attive sulle app terzi: si conservano
    if (o.onlyExp && st === 'active') continue;
    const k = km.get(d.id), seen = Math.max(+d.last_seen || 0, +(k && k.ls) || 0);
    const never = !d.secret_hash && !seen;
    if (never) { if (!o.never || (+d.created_at || 0) >= lim) continue; }
    else if (seen >= lim) continue;
    out.push({ id: d.id, code: d.code, name: d.name, status: st, seen, never, ownerId: +d.owner_id || 0 });
  }
  return { days, list: out.sort((a, b) => a.seen - b.seen) };
}

async function orbixRemove(env, d, who, ip) {
  const old = orbixOf(d);
  if (old.id) await orbixCall(env, '/delete-playlists', { deviceid: old.id }).catch((e) => { if (!/non trovato/i.test(e.message)) throw e; });
  await env.DB.prepare("UPDATE devices SET orbix = '' WHERE id = ?").bind(d.id).run();
  await llAutoOff(env, d, 'orbix').catch(() => {});
  await log(env, 'off', `${who}: OrbixPlay — linee tolte da ${d.name || d.code}`, ip);
  return { ok: true };
}

/* ---------------- Codici downloader: le app da far installare ai clienti (il titolare le modifica dal pannello) ---------------- */
const DLW = 'https://upgrade.logicyel.com/windows/';
const DL_DEFAULT = [
  ...[['IBO Player (Default)', '1171959'], ['IBO Player Pro', '923441', 'Nuova'], ['IBO Pro Player TV', '6402995', 'Nuova'], ['IBO Pro', '474637', 'Solo con codici di attivazione'], ['BOB Player', '815778'], ['King4K Player', '862414'], ['IBOSS IPTV', '967528'],
    ['IBO XPlayer', '7947185', 'Nuova'], ['PIA VPN per Android TV', '1163646', 'Nuova'], ['MT', '8128314'], ['IboOne', '2533617'], ['IBO-PRO', '9416617'], ['TiviMate', '2578076'], ['OrbixPlay', '618101']]
    .map(([name, code, note]) => ({ group: 'Android TV', name, code, note: note || '', links: [] })),
  { group: 'ORA HUB Family', name: 'ORA Player', code: '8408809', note: 'Su tutti i Samsung e LG, anche Apple TV e Roku', links: [{ label: 'Sito', url: 'https://oraplayers.com/' }, { label: 'APK telefono', url: 'http://aftv.news/3819491' }, { label: 'Windows', url: DLW + 'ORA-TV-Setup-1.1.2.exe' }, { label: 'Google Play', url: 'https://play.google.com/store/apps/details?id=org.ora.player' }, { label: 'iPhone', url: 'https://apps.apple.com/eg/app/ora-iptv-player/id6744371383' }] },
  { group: 'ORA HUB Family', name: 'ORA Pro', code: '5290692', note: 'Su tutti i Samsung e LG', links: [{ label: 'Sito', url: 'https://oraprotv.com/' }, { label: 'APK telefono', url: 'https://aftv.news/5290692' }, { label: 'Google Play', url: 'https://play.google.com/store/apps/details?id=com.orapro.app' }, { label: 'iPhone', url: 'https://apps.apple.com/eg/app/orapro-player/id6804694740' }, { label: 'Windows', url: DLW + 'ORA-Pro-Setup-1.1.2.exe' }] },
  { group: 'ORA HUB Family', name: 'Duplex Pro', code: '9812319', note: 'Su tutti i Samsung e LG', links: [{ label: 'Sito', url: 'https://duplexprotv.com/' }, { label: 'APK telefono', url: 'https://go.aftvnews.com/9812319' }] },
  { group: 'ORA HUB Family', name: 'Kemet Player', code: '6604691', note: 'Su tutti i Samsung e LG', links: [{ label: 'Sito', url: 'https://kemetiptv.com/' }, { label: 'APK telefono', url: 'https://go.aftvnews.com/6604691' }, { label: 'Google Play', url: 'https://play.google.com/store/apps/details?id=org.kemet.app' }, { label: 'Windows', url: DLW + 'Kemet-TV-Setup-1.1.2.exe' }] },
  { group: 'ORA HUB Family', name: 'Gravity Player', code: '', note: 'Su tutti i Samsung e LG', links: [{ label: 'Sito', url: 'https://gravityiptv.com/' }, { label: 'Windows', url: DLW + 'Gravity-IPTV-Player-Setup-1.1.2.exe' }] },
  { group: 'ORA HUB Family', name: 'Hot ORA IPTV', code: '', note: 'Su tutti i Samsung e LG', links: [{ label: 'Gestione dispositivo', url: 'https://euser.hotoraiptv.com/manage-device' }] },
];
const dlCodesOf = (s) => (Array.isArray(s.dlCodes) ? s.dlCodes : DL_DEFAULT);
function cleanDlCodes(v) {
  if (!Array.isArray(v)) throw new HttpErr(400, 'dlCodes deve essere un elenco');
  const url = (u, what) => { u = str(u, 500); if (u && !/^https?:\/\/[^\s]+$/i.test(u)) throw new HttpErr(400, `${what}: il link deve iniziare con http:// o https://`); return u; };
  return v.slice(0, 200).map((x, i) => {
    const name = str(x && x.name, 60); if (!name) throw new HttpErr(400, `App n. ${i + 1}: manca il nome`);
    const code = str(x.code, 12).replace(/\s+/g, ''); if (code && !/^\d{3,10}$/.test(code)) throw new HttpErr(400, `${name}: il codice downloader è fatto solo di numeri`);
    const links = (Array.isArray(x.links) ? x.links : []).slice(0, 10).map((l) => ({ label: str(l && l.label, 30) || 'Link', url: url(l && l.url, name) })).filter((l) => l.url);
    return { group: str(x.group, 40), name, code, note: str(x.note, 120), link: url(x.link, name), links };
  });
}

/* «slot» delle app terzi: fornitore + app + link (DNS) + codice cliente, tutti modificabili dal titolare */
const SLOTS_DEFAULT = [
  { id: 'nki-orbix', name: 'NKI', app: 'orbix', link: 'orbx.nki-orbx.download', code: '265847' },
  { id: 'nki-max', name: 'NKI', app: 'max', link: 'maxplayer.nki-max.stream', code: '265847' },
  { id: 'armada-max', name: 'Armada', app: 'max', link: 'maxplayer-armada.chasertv2.stream', code: '265847' },
];
const slotsOf = (c) => (Array.isArray(c && c.slots) ? c.slots : SLOTS_DEFAULT);
function cleanSlots(v) {
  if (!Array.isArray(v)) throw new HttpErr(400, 'Gli slot devono essere un elenco');
  const ids = new Set();
  return v.slice(0, 60).map((x, i) => {
    const name = str(x && x.name, 40); if (!name) throw new HttpErr(400, `Slot n. ${i + 1}: scrivi il nome (es. il fornitore)`);
    const app = x.app === 'max' ? 'max' : x.app === 'orbix' ? 'orbix' : ''; if (!app) throw new HttpErr(400, `${name}: scegli OrbixPlay o MaxPlayer`);
    const link = str(x.link, 300).replace(/^\s*https?:\/\//i, (m) => m.trim()).replace(/\/+$/, '');
    if (link && !/^(https?:\/\/)?[a-z0-9.-]+(:\d{1,5})?(\/\S*)?$/i.test(link)) throw new HttpErr(400, `${name}: link non valido (es. maxplayer.esempio.stream)`);
    const code = str(String(x.code ?? ''), 30); if (code && !/^[A-Za-z0-9_-]{1,30}$/.test(code)) throw new HttpErr(400, `${name}: il codice cliente può avere solo lettere e numeri`);
    let id = str(x.id, 40); if (!/^[A-Za-z0-9_-]{1,40}$/.test(id) || ids.has(id)) id = b64url(rand(6)); ids.add(id);
    return { id, name, app, link, code };
  });
}

/* «Attiva app»: il link di gestione dispositivo di ogni app dello store. Copiabile/modificabile dal titolare. */
function cleanAppLinks(v) {
  if (!Array.isArray(v)) throw new HttpErr(400, 'appLinks deve essere un elenco');
  return v.slice(0, 100).map((x, i) => {
    const name = str(x && x.name, 60); if (!name) throw new HttpErr(400, `App n. ${i + 1}: scrivi il nome`);
    const url = str(x && x.url, 300).trim().replace(/\/+$/, '');
    if (url && !/^https?:\/\/[^\s]+$/i.test(url)) throw new HttpErr(400, `${name}: il link deve iniziare con http:// o https://`);
    return { name, url };
  });
}

/* ---------------- Linee collegate: registro delle linee IPTV collegate alle app ----------------
   Le app senza API (OraPlayer, IboOne…) le registra il titolare/agente incollando la linea; OrbixPlay e MaxPlayer
   si registrano da sole quando le attivi dal pannello. Password cifrate; per l'agente gli host dei DNS restano nascosti. */
const LL_MAX = 20000;
function llClean(b) {
  const app = nameClean(b && b.app, 60); if (!app) throw new HttpErr(400, 'Scegli l\'app a cui hai collegato la linea');
  const username = str(b.username, 120).trim(); if (!username) throw new HttpErr(400, 'Scrivi il nome utente della linea');
  let dns = str(b.dns, 300).trim().replace(/\/+$/, '');
  if (dns && !/^https?:\/\//i.test(dns)) dns = 'http://' + dns;
  if (dns && !/^https?:\/\/[^\s/?#]+(:\d+)?(\/[^\s?#]*)?$/i.test(dns)) throw new HttpErr(400, 'DNS non valido: es. http://dns.esempio.com:8080');
  return { app, username, password: typeof b.password === 'string' ? b.password.slice(0, 200) : null, dns, mac: nameClean(b.mac, 64), deviceId: str(b.deviceId, 40), note: nameClean(b.note, 200) };
}
async function devOwnerOf(env, id) {
  const d = id ? await env.DB.prepare('SELECT id, owner_id, parent FROM devices WHERE id = ?').bind(id).first() : null;
  if (!d) return null;
  const P0 = d.parent ? await env.DB.prepare('SELECT owner_id FROM devices WHERE id = ?').bind(d.parent).first() : d;
  return { id: d.id, owner: +((P0 || {}).owner_id) || 0 };
}
/** registrazione automatica (attivazioni OrbixPlay / MaxPlayer dal pannello) */
async function llAuto(env, d, src, username, password, dns, dnsName, mac) {
  const o = await devOwnerOf(env, d.id), t = now(), ps = await seal(env, password || '');
  const app = src === 'orbix' ? 'OrbixPlay' : 'MaxPlayer';
  const ex = await env.DB.prepare('SELECT id FROM linked_lines WHERE device_id = ? AND source = ?').bind(d.id, src).first();
  if (ex) await env.DB.prepare('UPDATE linked_lines SET owner_id = ?, app = ?, username = ?, pass_seal = ?, dns = ?, dns_name = ?, mac = ?, updated = ? WHERE id = ?').bind(o ? o.owner : 0, app, str(username, 120), ps, str(dns, 300), str(dnsName, 60), str(mac, 64), t, ex.id).run();
  else await env.DB.prepare('INSERT INTO linked_lines (owner_id, app, username, pass_seal, dns, dns_name, mac, device_id, note, source, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(o ? o.owner : 0, app, str(username, 120), ps, str(dns, 300), str(dnsName, 60), str(mac, 64), d.id, '', src, t, t).run();
}
/** appunto automatico di un'attivazione fatta da un pannello (WOLF, Armada, Atlantix, MaxPlayer, OrbixPlay): source 'p-…' */
async function llNote(env, o) {
  try {
    const t = now(), src = 'p-' + o.src, user = str(o.username || '', 120), mac = str(o.mac || '', 64);
    if (!user && !mac) return;
    const ex = await env.DB.prepare('SELECT id FROM linked_lines WHERE source = ? AND app = ? AND username = ? AND mac = ?').bind(src, o.app, user, mac).first();
    if (ex) { await env.DB.prepare('UPDATE linked_lines SET updated = ? WHERE id = ?').bind(t, ex.id).run(); return; }
    if (((await env.DB.prepare('SELECT COUNT(*) AS n FROM linked_lines').first()) || { n: 0 }).n >= LL_MAX) return;
    await env.DB.prepare('INSERT INTO linked_lines (owner_id, app, username, pass_seal, dns, dns_name, mac, device_id, note, source, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(+o.owner || 0, o.app, user, await seal(env, o.password || ''), str(o.dns || '', 300), '', mac, '', str(o.note || '', 200), src, t, t).run();
  } catch (e) { console.error('llNote', e && e.message); }
}
const llAutoOff = (env, d, src) => env.DB.prepare('DELETE FROM linked_lines WHERE device_id = ? AND source = ?').bind(d.id, src).run();
/** ag: null = titolare (vede tutto) · { id, tree, hideHosts } = agente (solo le linee sue e dei sotto-agenti visibili) */
async function linkedLinesRoutes(req, env, path, who, ip, ag) {
  const m = req.method;
  const sel = 'SELECT l.*, d.name AS dname, d.code AS dcode FROM linked_lines l LEFT JOIN devices d ON d.id = l.device_id';
  /* ---------- note KAIROS sulle linee dei pannelli senza campo nota (Armada, MirkoTeam, MaxPlayer, OrbixPlay) ---------- */
  if (path === '/line-notes' && m === 'GET') {
    const panel = str(new URL(req.url).searchParams.get('panel'), 20).toLowerCase(); if (!/^[a-z]{2,10}$/.test(panel)) throw new HttpErr(400, 'Pannello non valido');
    const rows = ((await env.DB.prepare('SELECT ref, note, updated FROM line_notes WHERE panel = ? AND note <> ? LIMIT 5000').bind(panel, '').all()).results) || [];
    const notes = {}; for (const r of rows) notes[r.ref] = r.note; return json({ notes });
  }
  if (path === '/line-notes' && m === 'PUT') {
    const b = await readJSON(req, 2048), panel = str(b.panel, 20).toLowerCase(), ref = str(b.ref, 120).trim().toLowerCase(), note = str(b.note, 300).trim();
    if (!/^[a-z]{2,10}$/.test(panel) || !ref) throw new HttpErr(400, 'Linea non valida');
    if (!note) await env.DB.prepare('DELETE FROM line_notes WHERE panel = ? AND ref = ?').bind(panel, ref).run();
    else await env.DB.prepare('INSERT INTO line_notes (panel, ref, note, owner_id, updated) VALUES (?, ?, ?, ?, ?) ON CONFLICT(panel, ref) DO UPDATE SET note = excluded.note, owner_id = excluded.owner_id, updated = excluded.updated').bind(panel, ref, note, ag ? ag.id : 0, now()).run();
    await log(env, 'edit', `${who}: nota ${note ? 'salvata' : 'tolta'} sulla linea ${ref} (${panel})`, ip).catch(() => {});
    return json({ ok: true, note });
  }
  if (path === '/linked-lines' && m === 'GET') {
    let rows = [];
    if (!ag) rows = ((await env.DB.prepare(sel + ' ORDER BY l.updated DESC LIMIT 5000').all()).results) || [];
    else for (let i = 0; i < ag.tree.length; i += 90) { const part = ag.tree.slice(i, i + 90); rows.push(...(((await env.DB.prepare(sel + ` WHERE l.owner_id IN (${part.map(() => '?').join(',')}) ORDER BY l.updated DESC LIMIT 5000`).bind(...part).all()).results) || [])); }
    rows.sort((a, b) => b.updated - a.updated);
    const names = new Map((await agentsAll(env)).map((a) => [a.id, a.username]));
    const items = [];
    for (const r of rows) {
      const auto = !!r.source;
      items.push({ id: r.id, ownerId: +r.owner_id || 0, ownerName: names.get(+r.owner_id) || '', app: r.app, username: r.username, password: await unsealText(env, r.pass_seal),
        dns: ag && ((ag.hideHosts && auto) || String(r.source).startsWith('p-')) ? '' : r.dns, dnsName: r.dns_name || '', mac: r.mac, deviceId: r.device_id, deviceName: r.dname || '', deviceCode: r.dcode || '', deviceGone: !!r.device_id && !r.dcode,
        note: r.note, source: r.source, created: r.created, updated: r.updated });
    }
    return json({ items });
  }
  if (path === '/linked-lines' && m === 'POST') {
    const b = llClean(await readJSON(req, 4096));
    let owner = ag ? ag.id : 0;
    if (b.deviceId) { const d = await devOwnerOf(env, b.deviceId); if (!d || (ag && !ag.tree.includes(d.owner))) throw new HttpErr(400, 'Cliente non trovato'); if (!ag) owner = d.owner; }
    if (((await env.DB.prepare('SELECT COUNT(*) AS n FROM linked_lines').first()) || { n: 0 }).n >= LL_MAX) throw new HttpErr(400, 'Hai raggiunto il massimo di linee registrate: togli quelle che non servono');
    const t = now();
    const r = await env.DB.prepare('INSERT INTO linked_lines (owner_id, app, username, pass_seal, dns, dns_name, mac, device_id, note, source, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id')
      .bind(owner, b.app, b.username, await seal(env, b.password || ''), b.dns, '', b.mac, b.deviceId, b.note, '', t, t).first();
    await log(env, 'new', `${who}: linea ${b.username} collegata a ${b.app}`, ip);
    return json({ id: (r && r.id) || 0 });
  }
  const mm = path.match(/^\/linked-lines\/(\d+)$/);
  if (mm && (m === 'PUT' || m === 'DELETE')) {
    const row = await env.DB.prepare('SELECT * FROM linked_lines WHERE id = ?').bind(+mm[1]).first();
    if (!row || (ag && !ag.tree.includes(+row.owner_id))) throw new HttpErr(404, 'Linea non trovata');
    if (m === 'DELETE') {
      await trashPut(env, 'line', String(row.id), `${row.username} (${row.app})`, row, null, who);
      await env.DB.prepare('DELETE FROM linked_lines WHERE id = ?').bind(row.id).run();
      await log(env, 'del', `${who}: tolta dal registro la linea ${row.username} (${row.app})`, ip);
      return json({ ok: true });
    }
    if (row.source === 'orbix' || row.source === 'max') throw new HttpErr(400, 'Questa linea è registrata in automatico dall\'attivazione: la modifichi dalla scheda del cliente');
    const b = llClean(await readJSON(req, 4096));
    let owner = +row.owner_id || 0;
    if (b.deviceId && b.deviceId !== row.device_id) { const d = await devOwnerOf(env, b.deviceId); if (!d || (ag && !ag.tree.includes(d.owner))) throw new HttpErr(400, 'Cliente non trovato'); if (!ag) owner = d.owner; }
    const ps = b.password === null ? row.pass_seal : await seal(env, b.password);
    await env.DB.prepare('UPDATE linked_lines SET owner_id = ?, app = ?, username = ?, pass_seal = ?, dns = ?, mac = ?, device_id = ?, note = ?, updated = ? WHERE id = ?').bind(owner, b.app, b.username, ps, b.dns, b.mac, b.deviceId, b.note, now(), row.id).run();
    return json({ ok: true });
  }
  return null;
}

/* ---------------- «Collegati ora»: connessioni attive delle linee Xtream dei pannelli esterni ----------------
   player_api.php → user_info.active_cons (come un'app che entra: non apre il video e non occupa una connessione).
   Prima fetch(), poi socket TCP (alcuni server bloccano gli IP di Cloudflare come il firewall di WOLF). Cache 60 s. */
const onMem = new Map();
async function onlineOne(origin, u, p) {
  const k = origin + '|' + u, c = onMem.get(k);
  if (c && now() - c.t < 60e3) return c.v;
  const url = `${origin}/player_api.php?username=${encodeURIComponent(u)}&password=${encodeURIComponent(p)}`, hd = { 'User-Agent': 'IPTVSmartersPro', Accept: 'application/json' };
  const parse = async (r) => { if (!r || !r.ok) return null; let j = null; try { j = JSON.parse(await r.text()); } catch { return null; } const ui = j && j.user_info; if (!ui || typeof ui !== 'object') return null; const n = +ui.active_cons || 0; return { on: n > 0, conns: n, max: +ui.max_connections || 0 }; };
  let v = null;
  try { v = await parse(await fetch(url, { headers: hd, signal: AbortSignal.timeout(6000) })); } catch {}
  if (!v) { try { v = await parse(await Promise.race([sockFetch(url, { method: 'GET', headers: hd }), new Promise((_, no) => setTimeout(() => no(new Error('timeout')), 7000))])); } catch {} }
  onMem.set(k, { t: now(), v });
  if (onMem.size > 5000) onMem.delete(onMem.keys().next().value);
  return v;
}
async function onlineRoute(req) {
  const b = await readJSON(req, 64 * 1024);
  const res = {};
  await Promise.all((Array.isArray(b.lines) ? b.lines : []).slice(0, 15).map(async (x) => {
    const k = str(x && x.k, 520), u = str(x && x.u, 120), p = str(x && x.p, 200);
    let h = str(x && x.h, 300); if (h && !/^https?:\/\//i.test(h)) h = 'http://' + h;
    let o = ''; try { const U = new URL(h); if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|\[)/i.test(U.hostname)) return; o = U.origin; } catch { return; }
    if (k && u && p) res[k] = await onlineOne(o, u, p);
  }));
  return json({ res });
}

/* ---------------- link puliti: /get/<app>.apk e /store/ (proxy delle release GitHub e di GitHub Pages) ----------------
   Il link che il cliente vede è quello del pannello (es. https://panel-kairos.com/get/store.apk): l'account GitHub resta qui. */
const GH_OWNER = 'mariopiccolo8562-lang';
const GET_APK = {
  store: ['kairos-store/releases/latest/download/KairosStore.apk', 'KairosStore.apk'],
  pro: ['kairos-store/releases/download/kairos-tv/kairos-tv.apk', 'kairos-pro.apk'],
  premium: ['kairos-premium/releases/latest/download/kairos-premium.apk', 'kairos-premium.apk'],
  tv: ['kairos-tv/releases/latest/download/kairos-tv.apk', 'kairos-tv.apk'],
  plus: ['kairos-flutter/releases/latest/download/kairos-plus.apk', 'kairos-plus.apk'],
  xc: ['kairos-xc/releases/latest/download/kairos-xc.apk', 'kairos-xc.apk'],
  lite: ['kairos-lite/releases/latest/download/kairos-lite.apk', 'kairos-lite.apk'],
  nova: ['Lairos-nova/releases/download/latest/KairosNova-arm64.apk', 'kairos-nova.apk'],
  'nova-arm32': ['Lairos-nova/releases/download/latest/KairosNova-arm32.apk', 'kairos-nova-arm32.apk'],
};
const STORE_PAGES = `https://${GH_OWNER}.github.io/kairos-store/`;
async function cleanLinks(req, url, path) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('Metodo non consentito', { status: 405 });
  const m = path.match(/^\/get\/([a-z0-9-]{1,24})\.apk$/);
  if (m) {
    const e = GET_APK[m[1]]; if (!e) return new Response('Non trovato', { status: 404 });
    const up = await fetch(`https://github.com/${GH_OWNER}/${e[0]}`, { method: req.method === 'HEAD' ? 'HEAD' : 'GET', redirect: 'follow', cf: { cacheTtl: 600, cacheEverything: true } });
    if (!up.ok) return new Response('App non disponibile al momento, riprova tra poco', { status: 502 });
    const h = new Headers();
    h.set('Content-Type', 'application/vnd.android.package-archive');
    h.set('Content-Disposition', `attachment; filename="${e[1]}"`);
    const len = up.headers.get('Content-Length'); if (len) h.set('Content-Length', len);
    h.set('Cache-Control', 'public, max-age=600');
    h.set('Accept-Ranges', 'none');
    return new Response(req.method === 'HEAD' ? null : up.body, { status: 200, headers: h });
  }
  if (path === '/store') return Response.redirect(url.origin + '/store/' + url.search, 302);
  let rel = path.slice('/store/'.length);
  if (!rel || rel.endsWith('/')) rel += 'index.html';
  if (!/^[A-Za-z0-9_./-]{1,200}$/.test(rel) || rel.includes('..')) return new Response('Non trovato', { status: 404 });
  const img = /\.(png|jpe?g|webp|gif|svg|ico|woff2?)$/i.test(rel);
  const up = await fetch(STORE_PAGES + rel + url.search, { cf: { cacheTtl: img ? 3600 : 60, cacheEverything: true } });
  if (!up.ok) return new Response(up.status === 404 ? 'Non trovato' : 'Store non disponibile al momento, riprova tra poco', { status: up.status === 404 ? 404 : 502 });
  const h = new Headers();
  for (const k of ['content-type', 'content-length', 'last-modified', 'etag']) { const v = up.headers.get(k); if (v) h.set(k, v); }
  h.set('Cache-Control', img ? 'public, max-age=3600' : 'no-cache');
  return new Response(req.method === 'HEAD' ? null : up.body, { status: 200, headers: h });
}

/* ---------------- Pannelli Armada e Storm: stessa API reseller (api.php?action=…&api_key=…) ----------------
   Azioni: resellers_list, lines_list, mag_devices_list, new, device_info, device_status, renew, bouquet, reseller.
   Ogni pannello ha la sua chiave (ARMADA_KEY, STORM_KEY), che resta sul server: non arriva mai al pannello né ai log.
   Tutto il codice qui sotto vale per entrambi: «pv» è il pannello ('armada' o 'storm'). */
const ARM_PROV = {
  armada: { name: 'Armada', url: 'https://ts-spain.xyz/api.php', key: 'ARMADA_KEY', sUrl: 'armadaUrl', sDns: 'armadaDns' },
  storm: { name: 'Storm', url: 'https://storm-panel.pro/api.php', key: 'STORM_KEY', sUrl: 'stormUrl', sDns: 'stormDns' },
};
const ARM_PVS = Object.keys(ARM_PROV);
const armP = (pv) => ARM_PROV[pv] || ARM_PROV.armada;
const armKeyOf = (env, pv) => env[armP(pv).key] || '';
const armadaUrlOf = (s, pv) => (s && s[armP(pv).sUrl]) || armP(pv).url;
const armOk = (x) => x === true || x === 'true' || x === 1 || x === '1';
async function armadaCall(env, s, params, pv = 'armada') {
  const P = armP(pv), N = P.name, key = armKeyOf(env, pv);
  if (!key) throw new HttpErr(400, `${N} non è collegato: aggiungi il segreto ${P.key} su GitHub (guida nella pagina ${N})`);
  const u = new URL(armadaUrlOf(s, pv));
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, String(v));
  u.searchParams.set('api_key', key);
  let r; try { r = await fetch(u.toString(), { headers: { Accept: 'application/json' } }); } catch { throw new HttpErr(502, `${N} non risponde, riprova tra poco`); }
  const txt = await r.text();
  let j; try { j = JSON.parse(txt); } catch { throw new HttpErr(502, r.ok ? `${N} ha risposto in un formato inatteso: controlla l'indirizzo dell'API` : `Errore di ${N} (${r.status})`); }
  const first = Array.isArray(j) ? j[0] : j;
  if (!r.ok || (first && typeof first === 'object' && 'status' in first && !armOk(first.status))) {
    const why = str(String((first && (first.message || first.error || first.msg)) || ''), 200).split(key).join('***');
    throw new HttpErr(r.status >= 500 ? 502 : 400, N + ': ' + (why || (r.status === 401 || r.status === 403 ? 'chiave API non valida' : 'operazione non riuscita')));
  }
  return j;
}
const armList = (j) => (Array.isArray(j) ? j : j && Array.isArray(j.data) ? j.data : []);
const armTs = (v) => { const n = +v; return Number.isFinite(n) && n > 0 ? (n < 1e12 ? n * 1000 : n) : 0; };
const armCommon = (x) => ({ id: +x.id || 0, enabled: armOk(x.enabled) && !(x.admin_enabled !== undefined && !armOk(x.admin_enabled)), adminOff: x.admin_enabled !== undefined && !armOk(x.admin_enabled), exp: armTs(x.exp_date), created: armTs(x.created_at), owner: str(x.owner_username, 80), notes: str(x.notes, 300), trial: armOk(x.is_trial), maxConn: +x.max_connections || 0, country: str(x.forced_country, 8), isp: str(x.isp_desc, 80), lastActivity: str(x.last_activity, 30), lastIp: str(x.last_ip, 60) });
const armMac = (v) => { const h = String(v || '').toUpperCase().replace(/[^0-9A-F]/g, ''); return h.length === 12 ? h.match(/.{2}/g).join(':') : ''; };
/** cambia solo alcune chiavi delle impostazioni salvate (senza scrivere i valori predefiniti) */
/* ---------- Guida «Attivare una linea IPTV e metterla sulle app» (in fondo alla Panoramica) ---------- */
const GUIDE_DEF_TITLE = 'Come attivare una linea IPTV e metterla sulle app';
const GUIDE_DEF_TEXT = `# 1. Crea la linea sul pannello IPTV
1. Da Panoramica premi il pulsante rosso **Nuova attivazione: App e Linea IPTV** (lo trovi anche dentro WOLF, Armada, Atlantix, Realott e SLT).
2. Scegli il **pannello** (WOLF, Armada, Atlantix, Realott o SLT), il **pacchetto o i mesi** e scrivi il **nome del cliente**.
3. Se vuoi solo la linea, puoi anche usare «+ Nuova linea» nella pagina del pannello: la linea compare subito nella sua lista e negli **Appunti App**.

# 2. Mettila sulle app
Nel passo «App» spunta dove deve andare la linea (anche più di una):
- **MaxPlayer**: scegli il server; KAIROS crea l'account MaxPlayer con utente e password della linea.
- **OrbixPlay**: scrivi l'ID o il MAC che il cliente vede nell'app OrbixPlay.
- **Cliente Kairos** (Kairos Pro, TV, Lite, XC, Plus, Premium): crea il cliente con il suo **codice KX** e la durata (mesi o data precisa), oppure aggiungi la linea a un cliente che hai già.
- **Altre app** (IBO, Smarters, ecc.): la linea finisce negli Appunti App e si apre la pagina di attivazione di quell'app.
Premi **Crea e attiva**: nel riepilogo hai utente e password da copiare, **Riprova** su quello che non è riuscito e **Copia messaggio** pronto per WhatsApp.

# 3. Installazione sul dispositivo del cliente e Store
1. Fai installare al cliente **Kairos Store** (o l'app Kairos scelta) con il **codice Downloader** che trovi in App e Store → Codici downloader.
2. Nello Store il cliente scrive il **tuo codice venditore** (lo trovi in App e Store, pulsante «Copia»): così le sue richieste arrivano a te.
3. Quando il cliente chiede un'app, approvala in **App e Store → Richieste** (se l'approvazione è accesa). Da lì scarica e installa l'app.
4. Nell'app Kairos il cliente inserisce il **codice KX** del cliente creato al passo 2; su MaxPlayer e OrbixPlay la lista è già dentro, basta aprire l'app.

# 4. Controlli finali
- In **Clienti → Appunti App** vedi su quali app è attiva ogni linea.
- In **Clienti → Collegati ora** vedi se il cliente sta guardando e con quante connessioni.
- Se qualcosa non riesce, dal riepilogo di «Nuova attivazione» usa **Riprova** senza ricreare la linea.`;
function guideNorm(g) {
  const o = g && typeof g === 'object' ? g : {};
  const share = ['all', 'some', 'none'].includes(o.share) ? o.share : 'none';
  return { title: typeof o.title === 'string' && o.title.trim() ? o.title.trim().slice(0, 120) : GUIDE_DEF_TITLE, text: typeof o.text === 'string' && o.text.trim() ? o.text.slice(0, 20000) : GUIDE_DEF_TEXT, share, agents: Array.isArray(o.agents) ? o.agents.map(String).slice(0, 500) : [], noticeAt: Number.isFinite(+o.noticeAt) && +o.noticeAt > 0 ? +o.noticeAt : 0 };
}
function guideForAgent(s, agentId) {
  const g = guideNorm(s.guide); if (g.share === 'all' || (g.share === 'some' && g.agents.includes(String(agentId)))) return { title: g.title, text: g.text, noticeAt: g.noticeAt };
  return null;
}
/* avviso «Nuova guida da leggere»: l'agente lo vede finché non apre la guida (agent_reads k='guide') */
async function guideReads(env) {
  try { return (await env.DB.prepare("SELECT agent_id, at FROM agent_reads WHERE k = 'guide'").all()).results || []; } catch { return []; }
}

async function settingsPatch(env, patch) {
  const row = await env.DB.prepare("SELECT v FROM settings WHERE k = 'app'").first();
  let raw = {}; try { raw = row ? JSON.parse(row.v) : {}; } catch {}
  Object.assign(raw, patch);
  await env.DB.prepare("INSERT INTO settings (k, v) VALUES ('app', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(JSON.stringify(raw)).run();
  cfgDirty(env);
}
/* chi ha creato le linee Armada (0 = titolare) e crediti usati dagli agenti */
const armOwnRows = (env, pv) => reqMemo(env, 'armown:' + pv, async () => { try { return ((await env.DB.prepare('SELECT agent_id, type, line_id, username, mac FROM armada_own WHERE prov = ?').bind(pv).all()).results) || []; } catch { return []; } });
const armKey = (type, x) => (type === 'mag' ? 'm:' + String(x.mac || '').toUpperCase() : 'u:' + String(x.username || ''));
async function armOwnerMap(env, pv) {
  const m = new Map();
  for (const r of await armOwnRows(env, pv)) { m.set(armKey(r.type, r), +r.agent_id); if (r.line_id) m.set('i:' + r.type + ':' + r.line_id, +r.agent_id); }
  return m;
}
const armByOf = (map, type, x) => { const a = map.get('i:' + type + ':' + x.id); return a !== undefined ? a : map.get(armKey(type, x)); };
const monthIT = (t = now()) => dayIT(t).slice(0, 7);
const armSpentRows = (env, pv) => reqMemo(env, 'armsp:' + pv, async () => { const m = new Map(); try { for (const r of ((await env.DB.prepare('SELECT agent_id, SUM(credits) AS c FROM armada_spend WHERE month = ? AND prov = ? GROUP BY agent_id').bind(monthIT(), pv).all()).results) || []) m.set(+r.agent_id, +r.c || 0); } catch {} return m; });
async function armadaRoutes(req, env, url, path, who, ip, agentId = 0, pv = 'armada') {
  const m = req.method, s = await getSettings(env), P = armP(pv), N = P.name, R = '/' + pv, call = (params) => armadaCall(env, s, params, pv);
  if (path === R + '/state' && m === 'GET') {
    const out = { connected: !!armKeyOf(env, pv), url: armadaUrlOf(s, pv), dns: s[P.sDns] || '' };
    if (armKeyOf(env, pv)) { try { const x = armList(await call({ action: 'reseller' }))[0] || {}; out.reseller = { username: str(x.username, 80), credits: str(String(x.credits ?? ''), 20), enabled: armOk(x.enabled) }; } catch (e) { out.error = e.message; } }
    return json(out);
  }
  if (path === R + '/packages' && m === 'GET') return json({ packages: armList(await call({ action: 'bouquet' })).map((x) => ({ id: str(String(x.id ?? ''), 20), name: str(x.name, 80) })).filter((x) => x.id) });
  if ((path === R + '/lines' || path === R + '/mags') && m === 'GET') {
    const lines = path === R + '/lines', type = lines ? 'm3u' : 'mag';
    const [raw, own, ags] = await Promise.all([call({ action: lines ? 'lines_list' : 'mag_devices_list' }), armOwnerMap(env, pv), agentsAll(env)]);
    const names = new Map(ags.map((a) => [a.id, a.username]));
    const list = armList(raw).map((x) => { const o = lines ? { ...armCommon(x), username: str(x.username, 120), password: str(x.password, 200) } : { ...armCommon(x), mac: str(x.mac, 32) }; const by = armByOf(own, type, o); o.byAgent = by || 0; o.by = by ? names.get(by) || 'agente eliminato' : by === 0 ? 'Tu' : ''; return o; });
    return json(lines ? { lines: list } : { mags: list });
  }
  if (path === R + '/resellers' && m === 'GET') return json({ resellers: armList(await call({ action: 'resellers_list' })).map((x) => ({ id: +x.id || 0, username: str(x.username, 80), email: str(x.email, 120), credits: str(String(x.credits ?? ''), 20), enabled: armOk(x.status), notes: str(x.notes, 300), lastLogin: str(x.last_login, 30), group: str(x.group_name, 60), clients: +x.total_clients || 0, owner: str(x.owner_username, 80), relation: str(x.relation_type, 20) })) });
  if (path === R + '/new' && m === 'POST') {
    const b = await readJSON(req, 2048);
    const type = b.type === 'mag' ? 'mag' : 'm3u', sub = parseInt(b.sub, 10);
    if (![0, 1, 3, 6, 12].includes(sub)) throw new HttpErr(400, 'Scegli la durata: prova, 1, 3, 6 o 12 mesi');
    const pack = str(String(b.pack ?? ''), 20); if (!/^\d+$/.test(pack)) throw new HttpErr(400, 'Scegli il pacchetto di canali');
    const params = { action: 'new', type, sub, pack };
    if (type === 'mag') { const mac = armMac(b.mac); if (!mac) throw new HttpErr(400, 'MAC non valido (es. 00:1A:79:12:34:56)'); params.user = mac; }
    if (sub === 0 && b.htime !== undefined && b.htime !== '') { const h = parseInt(b.htime, 10); if (!(h >= 1 && h <= 24)) throw new HttpErr(400, 'Ore di prova: da 1 a 24'); params.htime = h; }
    const country = str(b.country, 3).toUpperCase(); if (country) { if (!/^([A-Z]{2}|ALL)$/.test(country)) throw new HttpErr(400, 'Paese: due lettere (es. IT) oppure ALL'); params.country = country; }
    const notes = nameClean(b.notes, 200); if (notes) params.notes = notes;
    if (b.adult === true || b.adult === false) params.adult = b.adult ? 1 : 0;
    const x = armList(await call(params))[0] || {};
    const out = { type, userId: str(String(x.user_id ?? ''), 20), url: str(x.url, 500), mac: str(x.mac, 32) || params.user || '', message: str(x.message, 120), username: '', password: '', host: '' };
    if (type === 'm3u') { try { const u = new URL(out.url); out.username = u.searchParams.get('username') || ''; out.password = u.searchParams.get('password') || ''; out.host = u.origin; } catch {} }
    if (out.host && !s[P.sDns]) await settingsPatch(env, { [P.sDns]: out.host }); // il DNS delle linee si impara dalla prima linea creata
    try { await env.DB.prepare('INSERT INTO armada_own (agent_id, type, line_id, username, mac, created, prov) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(agentId, type, out.userId, out.username, type === 'mag' ? out.mac.toUpperCase() : '', now(), pv).run(); memoDrop(env, 'armown:' + pv); } catch (e) { console.error('armada_own', e && e.message); }
    await llNote(env, { src: pv, app: N, owner: agentId, username: out.username || (type === 'mag' ? '' : out.userId), password: out.password, dns: out.host, mac: type === 'mag' ? out.mac : '', note: notes || '' });
    await log(env, 'new', `${who}: ${N} — creata ${type === 'mag' ? 'MAG ' + out.mac : 'linea ' + (out.username || out.userId)} (${sub ? sub + (sub === 1 ? ' mese' : ' mesi') : 'prova'})`, ip);
    return json(out);
  }
  if (path === R + '/renew' && m === 'POST') {
    const b = await readJSON(req, 1024);
    const type = b.type === 'mag' ? 'mag' : 'm3u', sub = parseInt(b.sub, 10);
    if (![1, 3, 6, 12].includes(sub)) throw new HttpErr(400, 'Rinnovo: 1, 3, 6 o 12 mesi');
    const params = { action: 'renew', type, sub };
    if (type === 'mag') { params.mac = armMac(b.mac); if (!params.mac) throw new HttpErr(400, 'MAC non valido'); }
    else { params.username = str(b.username, 120); params.password = typeof b.password === 'string' ? b.password.slice(0, 200) : ''; if (!params.username || !params.password) throw new HttpErr(400, 'Servono utente e password della linea'); }
    const x = armList(await call(params))[0] || {};
    await log(env, 'edit', `${who}: ${N} — rinnovata ${type === 'mag' ? 'MAG ' + params.mac : 'linea ' + params.username} di ${sub} ${sub === 1 ? 'mese' : 'mesi'}`, ip);
    return json({ ok: true, exp: armTs(x.expire_date) });
  }
  if (path === R + '/toggle' && m === 'POST') {
    const b = await readJSON(req, 512);
    const id = parseInt(b.id, 10), on = b.enabled === true;
    if (!(id > 0)) throw new HttpErr(400, 'Linea non valida');
    await call({ action: 'device_status', id, status: on ? 'enable' : 'disable' });
    await log(env, on ? 'on' : 'off', `${who}: ${N} — ${on ? 'attivata' : 'disattivata'} la linea #${id}`, ip);
    return json({ ok: true });
  }
  return null;
}

/* ---------------- Pannello Armada per gli agenti (solo con il permesso del titolare) ----------------
   Usa i crediti del titolare: ogni agente ha un tetto di crediti al mese (vale per lui e i suoi sotto-agenti; il tetto
   di chi sta sopra conta tutto il suo gruppo). Prove gratuite solo se concesse, al massimo 10 al giorno.
   Vede e gestisce solo linee e MAG creati da lui (e dai sotto-agenti di cui vede i clienti). Mai il saldo del titolare,
   mai i sotto-reseller; dall'API di integrazione Armada resta chiuso. Ogni operazione resta nel registro attività. */
const ARM_TRIALS_DAY = 10;
const armFmt = (n) => (Math.round(n * 100) / 100).toLocaleString('it-IT');
async function armCreditsNow(env, s, pv) { try { const x = armList(await armadaCall(env, s, { action: 'reseller' }, pv))[0] || {}; const v = parseFloat(String(x.credits ?? '').replace(',', '.')); return Number.isFinite(v) ? v : null; } catch { return null; } }
function agEffPerms(all, id) { const by = new Map(all.map((a) => [a.id, a])), A = by.get(id); if (!A) return null; let P = agentPerms(A.perms); for (let x = by.get(A.parent_id), k = 0; x && k < 20; x = by.get(x.parent_id), k++) P = agentPermsWithin(P, agentPerms(x.perms)); return P; }
/** crediti usati questo mese dal gruppo dell'agente (lui e i suoi sotto-agenti) */
const armUsedBy = (all, spent, id) => agentTree(all, id).reduce((t, x) => t + (spent.get(x) || 0), 0);
/** il costo previsto deve stare nel tetto dell'agente e di tutta la catena sopra di lui */
async function armBudget(env, all, A, cost, pv) {
  const N = armP(pv).name, spent = await armSpentRows(env, pv), by = new Map(all.map((a) => [a.id, a]));
  for (let x = A, k = 0; x && k < 20; x = by.get(x.parent_id), k++) {
    const lim = (agEffPerms(all, x.id) || {})[pv + 'Credits'] || 0, used = armUsedBy(all, spent, x.id);
    if (used + cost > lim + 1e-9) throw new HttpErr(400, x.id === A.id ? `Crediti ${N} di questo mese finiti: ne hai usati ${armFmt(used)} su ${armFmt(lim)} (questa operazione ne usa circa ${armFmt(cost)}). Chiedi a chi ti gestisce di aumentarli.` : `Crediti Armada del mese finiti per il gruppo di ${x.username} (${armFmt(used)} su ${armFmt(lim)})`);
  }
}
async function armSpend(env, A, credits, action, ref, pv) {
  const t = now();
  await env.DB.prepare('INSERT INTO armada_spend (agent_id, t, month, day, credits, action, ref, prov) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(A.id, t, monthIT(t), dayIT(t), credits, action, String(ref || '').slice(0, 120), pv).run();
  memoDrop(env, 'armsp:' + pv);
}
const armTrialsToday = async (env, id, pv) => { try { return ((await env.DB.prepare("SELECT COUNT(*) AS n FROM armada_spend WHERE agent_id = ? AND day = ? AND action = 'trial' AND prov = ?").bind(id, dayIT(), pv).first()) || {}).n || 0; } catch { return 0; } };
/** costo vero: crediti del titolare prima e dopo (se Armada li indica); altrimenti 1 credito al mese */
const armCost = (sub, before, after) => (!sub ? 0 : before !== null && after !== null && before - after >= 0 && before - after <= sub * 3 ? Math.round((before - after) * 100) / 100 : sub);
async function agentArmada(req, env, url, path, who, ip, ctx, X, pv = 'armada') {
  const { A, P, all, tree } = X, m = req.method, s = await getSettings(env), mine = new Set(tree), N = armP(pv).name, R = '/' + pv, call = (params) => armadaCall(env, s, params, pv);
  const cr = P[pv + 'Credits'] || 0;
  const sub2 = (body) => new Request(url.href, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const ownFn = async () => { const own = await armOwnerMap(env, pv); return (type, x) => { const by = armByOf(own, type, x); return by !== undefined && mine.has(by); }; };
  if (path === R + '/state' && m === 'GET') {
    const [spent, trials] = await Promise.all([armSpentRows(env, pv), armTrialsToday(env, A.id, pv)]), used = Math.round(armUsedBy(all, spent, A.id) * 100) / 100;
    return json({ connected: !!armKeyOf(env, pv), agent: true, dns: '', budget: { limit: cr, used, left: Math.max(0, Math.round((cr - used) * 100) / 100), trial: !!P[pv + 'Trial'], trials, trialMax: ARM_TRIALS_DAY } });
  }
  if (path === R + '/packages' && m === 'GET') return armadaRoutes(req, env, url, path, who, ip, A.id, pv);
  if ((path === R + '/lines' || path === R + '/mags') && m === 'GET') {
    const lines = path === R + '/lines', type = lines ? 'm3u' : 'mag';
    const [raw, ok] = await Promise.all([call({ action: lines ? 'lines_list' : 'mag_devices_list' }), ownFn()]);
    const list = armList(raw).map((x) => (lines ? { ...armCommon(x), username: str(x.username, 120), password: str(x.password, 200) } : { ...armCommon(x), mac: str(x.mac, 32) })).filter((o) => ok(type, o)).map(({ owner, ...o }) => o);
    return json(lines ? { lines: list } : { mags: list });
  }
  if (path === R + '/new' && m === 'POST') {
    const b = await readJSON(req, 2048), sub = parseInt(b.sub, 10), type = b.type === 'mag' ? 'mag' : 'm3u';
    if (![0, 1, 3, 6, 12].includes(sub)) throw new HttpErr(400, 'Scegli la durata: prova, 1, 3, 6 o 12 mesi');
    if (sub === 0) {
      if (!P[pv + 'Trial']) throw new HttpErr(403, `Non puoi creare prove su ${N}: chiedilo a chi ti gestisce`);
      if ((await armTrialsToday(env, A.id, pv)) >= ARM_TRIALS_DAY) throw new HttpErr(400, `Hai già creato ${ARM_TRIALS_DAY} prove oggi: riprova domani`);
    } else await armBudget(env, all, A, sub, pv);
    const before = sub ? await armCreditsNow(env, s, pv) : null;
    const r = await armadaRoutes(sub2({ ...b, type, sub }), env, url, path, who, ip, A.id, pv);
    if (!r || r.status !== 200) return r;
    const out = await r.json(), cost = armCost(sub, before, sub ? await armCreditsNow(env, s, pv) : null);
    await armSpend(env, A, cost, sub ? 'new' : 'trial', type === 'mag' ? out.mac : out.username || out.userId, pv);
    if (sub) ctx.waitUntil(log(env, 'edit', `${who}: ${N} — ${armFmt(cost)} crediti del titolare (${type === 'mag' ? 'MAG ' + out.mac : 'linea ' + (out.username || out.userId)})`, ip));
    return json({ ...out, host: '', url: '', cost }); // all'agente mai il DNS né il link M3U
  }
  if (path === R + '/renew' && m === 'POST') {
    const b = await readJSON(req, 1024), sub = parseInt(b.sub, 10), type = b.type === 'mag' ? 'mag' : 'm3u';
    if (![1, 3, 6, 12].includes(sub)) throw new HttpErr(400, 'Rinnovo: 1, 3, 6 o 12 mesi');
    const ok = await ownFn(), x = type === 'mag' ? { mac: armMac(b.mac) } : { username: str(b.username, 120) };
    if (!(type === 'mag' ? x.mac : x.username) || !ok(type, x)) throw new HttpErr(404, 'Puoi rinnovare solo le linee create da te');
    await armBudget(env, all, A, sub, pv);
    const before = await armCreditsNow(env, s, pv);
    const r = await armadaRoutes(sub2({ ...b, type, sub }), env, url, path, who, ip, A.id, pv);
    if (!r || r.status !== 200) return r;
    const out = await r.json(), cost = armCost(sub, before, await armCreditsNow(env, s, pv));
    await armSpend(env, A, cost, 'renew', type === 'mag' ? x.mac : x.username, pv);
    ctx.waitUntil(log(env, 'edit', `${who}: ${N} — ${armFmt(cost)} crediti del titolare (rinnovo ${type === 'mag' ? 'MAG ' + x.mac : 'linea ' + x.username})`, ip));
    return json({ ...out, cost });
  }
  if (path === R + '/toggle' && m === 'POST') {
    const b = await readJSON(req, 512), id = parseInt(b.id, 10);
    if (!(id > 0)) throw new HttpErr(400, 'Linea non valida');
    // l'id da solo non basta: si cerca la linea su Armada e deve essere una di quelle create da lui
    const [ls, ms, ok] = await Promise.all([call({ action: 'lines_list' }), call({ action: 'mag_devices_list' }), ownFn()]);
    const L = armList(ls).find((x) => +x.id === id), M = !L && armList(ms).find((x) => +x.id === id);
    if (!(L ? ok('m3u', { id, username: str(L.username, 120) }) : M ? ok('mag', { id, mac: str(M.mac, 32) }) : false)) throw new HttpErr(404, 'Puoi attivare o disattivare solo le linee create da te');
    return armadaRoutes(sub2({ id, enabled: b.enabled === true }), env, url, path, who, ip, A.id, pv);
  }
  if (path === R + '/resellers') throw new HttpErr(403, `I sotto-reseller di ${N} li vede solo il titolare`);
  throw new HttpErr(404, 'Non trovato');
}

/** impostazioni ('app') e DNS salvati ('dnsl'): un solo viaggio al database per richiesta (vedi reqMemo).
    Ogni chiamata restituisce oggetti nuovi (JSON riletto), quindi chi li modifica non tocca gli altri */
const cfgRows = (env) => reqMemo(env, 'cfg', async () => {
  const o = {};
  for (const r of ((await env.DB.prepare("SELECT k, v FROM settings WHERE k IN ('app', 'dnsl', 'dnsSat')").all()).results) || []) o[r.k] = r.v;
  return o;
});
const cfgDirty = (env) => memoDrop(env, 'cfg');
async function getSettings(env) {
  const v = (await cfgRows(env)).app;
  let s = {}; try { s = v ? JSON.parse(v) : {}; } catch {}
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
/** codice della TV scritto a mano: maiuscole, trattino al posto giusto, «KX» aggiunto se manca (AB12CD → KXAB-12CD) */
function codeNorm(v) {
  let c = String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
  if (c.length === 6 && !c.startsWith('KX')) c = 'KX' + c;
  return c.length === 8 ? c.slice(0, 4) + '-' + c.slice(4) : c;
}
// '' (illimitata) oppure una data AAAA-MM-GG esistente (una data impossibile non scadrebbe mai)
const DATE_RE = { test: (s) => { if (s === '') return true; if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false; const t = new Date(s + 'T00:00:00Z'); return !isNaN(t) && t.toISOString().slice(0, 10) === s; } };

/* ---------------- permessi per dispositivo ---------------- */
// tutte le funzioni sono consentite se non vengono spente: nel DB restano solo le chiavi a false
const PERM_KEYS = ['report', 'request', 'profiles', 'link', 'rec', 'speed', 'vpn', 'epgUrl', 'localPl', 'plSwitch', 'multi', 'ai', 'lite', 'resInd'];
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
/** confronta due indirizzi solo per nome host (ignora schema e porta): per abbinare una linea incollata a un server salvato */
function sameHostname(a, b) {
  const h = (x) => { try { return new URL(/^https?:\/\//i.test(x) ? x : 'http://' + x).hostname.toLowerCase(); } catch { return ''; } };
  const ha = h(a); return !!ha && ha === h(b);
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
/* ---------------- modifica in massa ----------------
   scope: 'ids' (i clienti scelti) | 'active' (tutti gli attivi) | 'all' (tutti, esclusi quelli ancora da attivare).
   Ogni campo assente resta com'è; lettore: '' = lo sceglie il cliente nell'app. Il lettore vale anche per le connessioni
   collegate «indipendenti» (hanno il loro); permessi, VPN e visioni stanno sul cliente principale. L'app si riallinea al battito. */
const MASS_MAX = 5000;
const MASS_RC = ['lite', 'posters', 'intro']; // voci del Controllo remoto cambiabili in massa
function massInput(b) {
  if (!b || typeof b !== 'object') throw new HttpErr(400, 'Richiesta non valida');
  const o = {};
  if (b.player !== undefined) {
    if (!b.player || typeof b.player !== 'object') throw new HttpErr(400, 'Lettore non valido');
    const p = {};
    for (const k of ['live', 'movie', 'series']) { const v = b.player[k]; if (v === undefined || v === null) continue; if (v !== '' && !PLAYER_ENG.includes(v)) throw new HttpErr(400, 'Lettore non valido: usa auto, exo o vlc'); p[k] = v; }
    if (Object.keys(p).length) o.player = p;
  }
  if (b.perms !== undefined) {
    if (!b.perms || typeof b.perms !== 'object' || Array.isArray(b.perms)) throw new HttpErr(400, 'Permessi non validi');
    const p = {};
    for (const [k, v] of Object.entries(b.perms)) { if (!PERM_KEYS.includes(k)) throw new HttpErr(400, `Permesso sconosciuto: ${String(k).slice(0, 20)}`); if (typeof v !== 'boolean') throw new HttpErr(400, 'Permessi non validi'); p[k] = v; }
    if (Object.keys(p).length) o.perms = p;
  }
  if (b.vpn !== undefined && b.vpn !== null && b.vpn !== '') { const v = Number(b.vpn); if (![0, 1, 2].includes(v)) throw new HttpErr(400, 'Modalità VPN non valida'); o.vpn = v; }
  if (b.maxStreams !== undefined && b.maxStreams !== null && b.maxStreams !== '') o.maxStreams = intIn(b.maxStreams, 0, MAX_CONN, 'Visioni contemporanee');
  if (b.rcClear === true) o.rcClear = true;
  // voci del Controllo remoto solo per questi clienti: '' = tolta (vale il profilo dell'app)
  if (b.rcSet !== undefined && b.rcSet !== null) {
    if (typeof b.rcSet !== 'object' || Array.isArray(b.rcSet)) throw new HttpErr(400, 'Impostazioni non valide');
    const r = {};
    for (const [k, v] of Object.entries(b.rcSet)) {
      const c = MASS_RC.includes(k) && rcCatByKey.get(k); if (!c) throw new HttpErr(400, `Voce sconosciuta: ${String(k).slice(0, 20)}`);
      if (v !== '' && !c[3].some((x) => x[0] === v)) throw new HttpErr(400, `${c[1]}: valore non valido`);
      r[k] = v;
    }
    if (Object.keys(r).length) o.rcSet = r;
  }
  if (!Object.keys(o).length) throw new HttpErr(400, 'Non hai scelto niente da cambiare');
  return o;
}
async function massEdit(env, b, who, ip) {
  const ch = massInput(b), scope = ['ids', 'active', 'all'].includes(b.scope) ? b.scope : 'ids';
  const cols = "id, name, code, parent, active, expires, (playlists <> '') AS has_pl, perms, player, vpn, max_streams, rc, app";
  let list;
  if (scope === 'ids') {
    if (!Array.isArray(b.ids) || !b.ids.length) throw new HttpErr(400, 'Scegli almeno un cliente');
    const ids = [...new Set(b.ids.map((x) => str(x, 20)).filter((x) => /^[A-Za-z0-9_-]{6,20}$/.test(x)))].slice(0, MASS_MAX);
    list = (await devicesByIds(env, ids, cols)).filter((d) => !d.parent);
  } else {
    list = ((await env.DB.prepare(`SELECT ${cols} FROM devices WHERE parent = '' LIMIT ${MASS_MAX + 1}`).all()).results) || [];
    if (list.length > MASS_MAX) throw new HttpErr(400, `Più di ${MASS_MAX} clienti: usa la selezione`);
    // «da attivare» (mai attivati, senza playlist) restano fuori; «attivi» = abbonamento in corso
    list = list.filter((d) => { const s = statusOf(d, d.has_pl ? [1] : []); return scope === 'active' ? s === 'active' : s !== 'pending'; });
  }
  if (!list.length) return { changed: 0, total: 0 };
  // connessioni collegate indipendenti: hanno il loro lettore
  let kids = [];
  if (ch.player || ch.rcClear || ch.rcSet) {
    const ids = list.map((d) => d.id);
    for (let i = 0; i < ids.length; i += 90) {
      const part = ids.slice(i, i + 90);
      kids.push(...((((await env.DB.prepare(`SELECT id, parent, own, player, rc, app FROM devices WHERE parent IN (${part.map(() => '?').join(',')})`).bind(...part).all()).results) || [])));
    }
  }
  // impostazioni imposte solo a lui: «togli tutte» e/o voci scelte (solo quelle che la sua app capisce)
  const rcStr = (o) => (Object.keys(o).length ? JSON.stringify(o) : '');
  const nextRc = (x) => {
    const rc = ch.rcClear ? {} : rcDevOf(x);
    for (const [k, v] of Object.entries(ch.rcSet || {})) { const c = rcCatByKey.get(k); if (x.app && c && !c[4].includes(x.app)) continue; if (v === '') delete rc[k]; else rc[k] = v; }
    return rcStr(rc);
  };
  const rcChange = (x) => { if (!ch.rcClear && !ch.rcSet) return null; const v = nextRc(x); return v !== rcStr(rcDevOf(x)) || (ch.rcClear && (x.rc || '') && !v) ? v : null; };
  const nextPlayer = (cur) => { const p = playerParse(cur); for (const [k, v] of Object.entries(ch.player || {})) { if (v === '') delete p[k]; else p[k] = v; } return Object.keys(p).length ? JSON.stringify(p) : ''; };
  const stmts = [];
  let changed = 0;
  for (const d of list) {
    const set = {};
    if (ch.player) { const v = nextPlayer(d.player); if (v !== (d.player || '')) set.player = v; }
    if (ch.perms) { const v = permsJson({ ...permsParse(d.perms), ...ch.perms }); if (v !== (d.perms || '')) set.perms = v; }
    if (ch.vpn !== undefined && ch.vpn !== (+d.vpn || 0)) set.vpn = ch.vpn;
    if (ch.maxStreams !== undefined && ch.maxStreams !== (+d.max_streams || 0)) set.max_streams = ch.maxStreams;
    { const v = rcChange(d); if (v !== null) set.rc = v; }
    const k = Object.keys(set);
    if (!k.length) continue;
    changed++;
    stmts.push(env.DB.prepare(`UPDATE devices SET ${k.map((c) => c + ' = ?').join(', ')} WHERE id = ?`).bind(...k.map((c) => set[c]), d.id));
  }
  for (const x of kids) {
    const set = {};
    if (ch.player && +x.own) { const v = nextPlayer(x.player); if (v !== (x.player || '')) set.player = v; }
    { const v = rcChange(x); if (v !== null) set.rc = v; }
    const k = Object.keys(set);
    if (k.length) stmts.push(env.DB.prepare(`UPDATE devices SET ${k.map((c) => c + ' = ?').join(', ')} WHERE id = ?`).bind(...k.map((c) => set[c]), x.id));
  }
  for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50));
  const ENG_N = { auto: 'automatico', exo: 'ExoPlayer', vlc: 'VLC', '': 'scelto dal cliente' };
  const what = [
    ch.player ? 'lettore ' + Object.entries(ch.player).map(([k, v]) => `${{ live: 'diretta', movie: 'film', series: 'serie' }[k]} ${ENG_N[v]}`).join(', ') : '',
    ch.perms ? 'permessi ' + Object.entries(ch.perms).map(([k, v]) => `${k} ${v ? 'sì' : 'no'}`).join(', ') : '',
    ch.vpn !== undefined ? 'VPN ' + ['spenta', 'a scelta del cliente', 'sempre attiva'][ch.vpn] : '',
    ch.maxStreams !== undefined ? 'visioni ' + (ch.maxStreams || 'illimitate') : '',
    ch.rcClear ? 'tolte le voci imposte solo a loro' : '',
    ch.rcSet ? 'Controllo remoto: ' + Object.entries(ch.rcSet).map(([k, v]) => { const c = rcCatByKey.get(k); return `${c[1]} ${v === '' ? 'come il profilo' : (c[3].find((x) => x[0] === v) || [v, v])[1]}`; }).join(', ') : '',
  ].filter(Boolean).join(' · ');
  await log(env, 'edit', `${who}: modifica in massa (${scope === 'ids' ? 'selezionati' : scope === 'active' ? 'tutti gli attivi' : 'tutti'}) — ${what} — ${changed} su ${list.length} clienti`, ip);
  return { changed, total: list.length, kids: kids.length };
}
/* DNS salvati dal pannello (elenco indipendente dai clienti) */
async function dnsList(env) {
  const v = (await cfgRows(env)).dnsl;
  let l = []; try { l = v ? JSON.parse(v) : []; } catch {}
  if (!Array.isArray(l)) return [];
  const ids = new Set(l.filter((x) => x && typeof x.host === 'string' && typeof x.id === 'string').map((x) => x.id));
  return l.filter((x) => x && typeof x.host === 'string' && typeof x.id === 'string').map((x) => ({
    ...x,
    alts: [...new Set((Array.isArray(x.alts) ? x.alts : []).filter((id) => typeof id === 'string' && id !== x.id && ids.has(id)))].slice(0, 4),
    mode: ['auto', 'main', 'alt'].includes(x.mode) ? x.mode : 'auto',
  }));
}
async function dnsSave(env, list) {
  await env.DB.prepare('INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind('dnsl', JSON.stringify(list.slice(0, 100))).run();
  cfgDirty(env);
}
/* Elenco DNS per OrbixPlay: i DNS Orbix dedicati (con eventuale «codice host») PIÙ tutti i DNS salvati in «Server DNS».
   Così nella scheda del cliente si sceglie tra TUTTI i propri DNS, non uno solo. Dedup per host, l'ordine resta stabile
   (prima i DNS Orbix, così gli indici già salvati sui dispositivi non cambiano). */
const hostKey = (h) => String(h || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '').toLowerCase();
async function portalsOf(env, pls) {
  const saved = await dnsList(env), byHost = new Map(saved.map((x) => [hostKey(x.host), x]));
  const byId = new Map(saved.map((x) => [x.id, x]));
  return pls.map((p) => {
    const main = byHost.get(hostKey(hostOf(p)));
    const alts = main ? main.alts.map((id) => byId.get(id)).filter((x) => x && x.id !== main.id) : [];
    return alts.length ? { ...p, alts: alts.map((x) => x.host), altNames: alts.map((x) => x.name), mainName: main.name, mode: main.mode } : p;
  });
}
async function dnsSatOf(env) {
  let sat = {};
  try { sat = JSON.parse((await cfgRows(env)).dnsSat || '{}'); } catch {}
  return sat && typeof sat === 'object' && !Array.isArray(sat) ? sat : {};
}
async function saturatedHosts(env, pls, portalPls, t = now()) {
  const sat = await dnsSatOf(env), candidates = new Map();
  for (let i = 0; i < pls.length; i++) {
    const main = hostOf(pls[i]);
    if (main) candidates.set(hostKey(main), main);
    for (const alt of (portalPls[i] && portalPls[i].alts) || []) if (alt) candidates.set(hostKey(alt), alt);
  }
  return [...candidates].filter(([key]) => +((sat[key] || {}).until) > t).map(([, origin]) => origin);
}
async function saturationList(env, knownHosts, t = now()) {
  const sat = await dnsSatOf(env), origins = new Map((knownHosts || []).filter(Boolean).map((x) => [hostKey(x), x]));
  return Object.entries(sat).filter(([, v]) => +((v || {}).until) > t).map(([key, v]) => ({ host: origins.get(key) || key, until: +v.until }));
}
function orbixDnsList(orbixCfg, dnsl) {
  const base = (Array.isArray(orbixCfg) ? orbixCfg : []).map((x) => ({ ...x }));
  const seen = new Set(base.map((x) => hostKey(x.host)));
  for (const d of (Array.isArray(dnsl) ? dnsl : [])) { const h = hostKey(d.host); if (h && !seen.has(h)) { seen.add(h); base.push({ name: str(d.name, 40) || d.host, host: str(d.host, 300) }); } }
  return base;
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
  cfgDirty(env);
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
/* PIN del profilo (impronta calcolata dall'app, mai il PIN in chiaro) ed età massima dei contenuti con il controllo genitori acceso */
const PROF_PIN_RE = /^[a-z0-9]{1,24}$/;
const PROF_AGES = [7, 12, 14, 16];
const profPin = (v) => (typeof v === 'string' && PROF_PIN_RE.test(v) ? v : '');
const profAge = (v) => { if (v === null || v === undefined || v === '') return null; const n = +v; return PROF_AGES.includes(n) ? n : null; };
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
    return { id, name, avatar, kids: p.kids === true, pl, pinH: profPin(p.pinH), age: p.kids === true ? profAge(p.age) : null };
  });
}
/** profili salvati, già pronti per l'app (mai oltre il limite, playlist inesistenti → "all") */
function readProfiles(d, plIds) {
  let a = []; try { a = JSON.parse(d.profiles || '[]'); } catch {}
  if (!Array.isArray(a)) return [];
  return a.filter((p) => p && PROFILE_ID_RE.test(p.id)).slice(0, d.max_profiles ?? 3)
    .map((p) => ({ id: p.id, name: nameClean(p.name, 24) || 'Profilo', avatar: AVATAR_RE.test(p.avatar) ? p.avatar : 'a1', kids: p.kids === true, pl: plIds.includes(p.pl) ? p.pl : 'all', pinH: profPin(p.pinH), age: p.kids === true ? profAge(p.age) : null }));
}
/** dispositivo principale dell'account (se stesso, oppure quello a cui è collegato); null se il principale non esiste più */
async function primaryOf(env, d) {
  if (!d.parent) return d;
  const p = await env.DB.prepare('SELECT * FROM devices WHERE id = ?').bind(d.parent).first();
  return p && !p.parent ? p : null;
}
const linkedOf = async (env, id) => ((await env.DB.prepare('SELECT id, code, name, model, last_seen, vpn_conf FROM devices WHERE parent = ? ORDER BY created_at LIMIT 100').bind(id).all()).results) || [];
/** connessione collegata con «gestione indipendente»: playlist e lettore suoi; abbonamento, scadenza, profili, permessi e limiti del principale */
const ownOf = (d) => !!(d && d.parent && +d.own);
/** playlist e scelte (unite/divise, playlist da usare, lettore) che valgono per il dispositivo d dell'account P:
    C = da dove si leggono le scelte (il dispositivo stesso se è indipendente, altrimenti il principale) */
async function effOf(env, d, P, Ppls) {
  if (!ownOf(d)) return { C: P, pls: Ppls };
  const pls = await unseal(env, d.playlists).catch(() => []);
  return pls.length ? { C: d, pls } : { C: P, pls: Ppls }; // per sicurezza: senza playlist sue usa quelle del principale
}
/** impronta dell'account (profili e loro PIN, numero massimo di profili, blocco dei profili, intestatario, connessioni):
    il battito la manda come `af` e l'app, se cambia, ricarica lo stato. Così profili, PIN e utenti creati dal pannello
    arrivano entro un battito anche senza riaprire l'app (prima arrivavano solo alla riapertura). */
const acctFp = async (P) => (P ? (await sha256(JSON.stringify([P.profiles || '', P.max_profiles ?? 3, P.lock_profiles ? 1 : 0, P.name || '', P.max_conn ?? 1]))).slice(0, 12) : '');
async function accountOf(env, P, me, pls, C = P) {
  const conns = [P, ...(await linkedOf(env, P.id))].map((x) => ({ name: x.name || '', model: x.model || '', seen: x.id === me.id ? now() : +x.last_seen || 0, me: x.id === me.id }));
  return { primary: me.id === P.id, owner: P.name || '', maxConn: P.max_conn ?? 1, conns, maxProfiles: P.max_profiles ?? 3, profiles: readProfiles(P, pls.map((p) => p.id)), canEdit: !P.lock_profiles, maxStreams: +P.max_streams || 0, plMode: C.pl_mode === 'split' ? 'split' : 'merge', plDefault: pls.some((p) => p.id === C.pl_default) ? C.pl_default : '', player: playerParse(C.player) };
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
  let list, mine = null;
  try {
    if (ownOf(d)) {
      // TV collegata con playlist sue: i profili restano quelli dell'account e la playlist scelta per ogni profilo
      // (che si riferisce alle playlist del principale) non si cambia da qui
      const keep = new Map(readProfiles(P, pls.map((p) => p.id)).map((p) => [p.id, p.pl]));
      list = cleanProfiles(b.profiles, P.max_profiles ?? 3, []).map((p) => ({ ...p, pl: keep.get(p.id) || 'all' }));
      const ids = (await unseal(env, d.playlists).catch(() => [])).map((p) => p.id);
      mine = list.map((p) => ({ ...p, pl: ids.includes(p.pl) ? p.pl : 'all' }));
    } else list = cleanProfiles(b.profiles, P.max_profiles ?? 3, pls.map((p) => p.id));
  } catch (e) { return json({ error: e.message }, e.status || 400); }
  await env.DB.prepare('UPDATE devices SET profiles = ? WHERE id = ?').bind(JSON.stringify(list), P.id).run();
  ctx.waitUntil(log(env, 'edit', `Profili modificati dal cliente ${P.name || P.code} (${list.length})`, ip));
  return json({ ok: true, profiles: mine || list });
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
  await env.DB.prepare("UPDATE devices SET parent = ?, active = 0, expires = '', playlists = '', profiles = '', own = 0 WHERE id = ? AND parent = ''").bind(P.id, d.id).run();
  ctx.waitUntil(log(env, 'on', `${d.code}${d.model ? ' (' + d.model + ')' : ''} collegato come connessione di ${P.name || P.code} (${used + 1} di ${max})`, ip));
  return json({ ok: true });
}
/** in pannello: rende di nuovo "in attesa" un dispositivo collegato */
const unlinkStmt = (env, id) => env.DB.prepare("UPDATE devices SET parent = '', active = 0, expires = '', playlists = '', profiles = '', own = 0 WHERE id = ?").bind(id);

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
const ONLINE_MS = 4 * 60e3;      // "online" = segnale negli ultimi 4 minuti (tollera un paio di battiti persi per strada)
const STATES = ['idle', 'live', 'movie', 'series', 'rec'];
const NETS = ['wifi', 'eth', 'mobile', 'none', ''];
const num = (v, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : 0; };
const cfOf = (req) => { const c = req.cf || {}; return { country: str(c.country, 4).toUpperCase(), city: str(c.city, 60) }; };
/** giorno in ora italiana AAAA-MM-GG (per le classifiche) */
function dayIT(t = now()) {
  try { return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t)); }
  catch { return new Date(t).toISOString().slice(0, 10); }
}
const FG_MS = 3 * 60e3;          // app dichiarata in primo piano: per 3 minuti i battiti di sfondo di un'altra app non contano
const PRESENCE_COLS = ['fg_app', 'fg_t', 't', 'hb_t', 'ip', 'ip2', 'ip2_t', 'country', 'city', 'home_country', 'ver', 'ui', 'model', 'state', 'title', 'ch', 'ch_id', 'grp', 'pl', 'prof', 'screen', 'net', 'rssi', 'speed_dl', 'speed_ul', 'speed_ping', 'speed_jit', 'speed_t', 'res', 'fps', 'bitrate', 'buffers', 'dropped', 'engine', 'vpn', 'codec', 'dec', 'stalls_h', 'rec', 'reduced', 'app_cfg', 'rcv', 'bw', 'line', 'dev_class', 'fill', 'ttff', 'stall_ms', 'var', 'fmt'];
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
    const old = await env.DB.prepare('SELECT ip, t, hb_t, state, home_country FROM presence WHERE device_id = ?').bind(d.id).first();
    // le app native rileggono lo stato ogni 20 minuti anche durante la visione: se l'ultimo battito è recente
    // la visione in corso resta com'è (prima per qualche secondo il cliente risultava «nei menu»)
    const watching = old && old.state && old.state !== 'idle' && now() - (+old.hb_t || 0) < 90e3;
    const f = { t: now(), ...(watching ? {} : { state: 'idle', title: '', ch: '', ch_id: '', grp: '' }), ...whereFields(old, ip, cf) };
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
const ERR_PROBLEMS = ['freeze', 'stall', 'error', 'restart', 'crash', 'killed', 'uierr']; // uierr = errore dell'interfaccia (JavaScript) // restart = motore web chiuso da Android; crash = errore interno; killed = app chiusa dal sistema (memoria)
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
  const abandoned = items.filter((x) => x && x.action === 'server di riserva' && typeof x.srv === 'string').map((x) => {
    try { return hostKey(cleanHost(x.srv)); } catch { return ''; }
  }).filter(Boolean);
  if (abandoned.length) {
    const sat = await dnsSatOf(env);
    for (const key of abandoned) {
      const prev = sat[key] && typeof sat[key] === 'object' ? sat[key] : {};
      const ev = [...(Array.isArray(prev.ev) ? prev.ev : []).filter((x) => Array.isArray(x) && +x[0] > t - 10 * 60e3), [t, d.id]];
      const until = new Set(ev.map((x) => String(x[1]))).size >= 3 ? t + 30 * 60e3 : (+prev.until > t ? +prev.until : 0);
      sat[key] = { ev, until };
    }
    await env.DB.prepare('INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind('dnsSat', JSON.stringify(sat)).run();
    cfgDirty(env);
  }
  // «Risolvi da solo»: al massimo ogni 6 ore per dispositivo, solo correzioni che non interrompono la visione
  if (t - (+d.fix_t || 0) > 6 * 3600e3) ctx.waitUntil((async () => { const S = await getSettings(env); if (S.health && S.health.on && S.health.autoFix) await fixDevice(env, S, d, 'Pannello', true); })().catch(() => {}));
  // pulizia: ogni tanto si tolgono quelli più vecchi di 7 giorni
  if (Math.random() < 0.1) ctx.waitUntil(env.DB.prepare('DELETE FROM app_errors WHERE t < ?').bind(t - ERR_KEEP_MS).run().catch(() => {}));
  return json({ ok: true, saved: stmts.length });
}
async function adminErrors(req, env, path, url, who, ip) {
  const m = req.method;
  if (path === '/app-errors' && m === 'GET') {
    const t = now(), since = t - Math.min(ERR_KEEP_MS, Math.max(3600e3, (+url.searchParams.get('hours') || 168) * 3600e3));
    const rows = ((await env.DB.prepare('SELECT e.*, d.name, d.code, d.parent, d.owner_id AS oid, p.owner_id AS poid, pr.net, pr.rssi, pr.vpn, pr.speed_dl, pr.line AS pline, (SELECT GROUP_CONCAT(DISTINCT ll.source || \'|\' || ll.dns_name || \'|\' || ll.dns) FROM linked_lines ll WHERE ll.device_id = e.device_id) AS srv, (SELECT COUNT(*) FROM wolf_links wl WHERE wl.device_id = e.device_id) AS wolf FROM app_errors e LEFT JOIN devices d ON d.id = e.device_id LEFT JOIN devices p ON p.id = d.parent LEFT JOIN presence pr ON pr.device_id = e.device_id WHERE e.t > ? ORDER BY e.t DESC LIMIT 2000').bind(since).all()).results) || [];
    const seen = +((await env.DB.prepare("SELECT v FROM settings WHERE k = 'errSeen'").first()) || { v: 0 }).v || 0;
    const items = rows.map((r) => ({ id: r.id, t: r.t, deviceId: r.device_id, name: r.name || '', code: r.code || '', problem: r.problem, action: r.action, outcome: r.outcome, err: r.err, title: r.title, itemId: r.item_id, kind: r.kind, engine: r.engine, codec: r.codec, dec: r.dec, res: r.res, variant: r.variant, model: r.model, ver: r.ver, ownerId: +(r.parent ? r.poid : r.oid) || 0, isNew: r.t > seen,
      // pagina «Buffering»: rete del cliente (dall'ultima presenza) e pannello/DNS delle sue linee collegate (solo titolare)
      net: r.net || '', rssi: +r.rssi || 0, vpn: r.vpn || '', speedDl: +r.speed_dl || 0, line: r.pline || '', srv: [r.wolf ? 'wolf||' : '', r.srv || ''].filter(Boolean).join(',') }));
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
  let b;
  try { b = await readJSON(req, 4096); } catch (e) { return json({ error: e.message }, e.status || 400); }
  // limite per dispositivo (prima era per IP: più TV nella stessa casa, o tanti clienti dietro lo stesso IP
  // dell'operatore, si bloccavano a vicenda e sparivano da «Online ora»); per IP resta solo un tetto alto anti-abuso
  const code = str(b && b.code, 20).toUpperCase();
  const [l1, l2] = await Promise.all([limited(env.RL_HB, 'hbip:' + ip), limited(env.RL_DEVICE, 'hb:' + (CODE_RE.test(code) ? code : ip))]);
  if (l1 || l2) return json({ error: 'Troppe richieste' }, 429);
  const [d, bad] = await deviceAuth(env, b);
  if (bad) return bad;
  const t = now();
  // il database è lontano: abbonamento, impostazioni e messaggi non letti partono subito, insieme alla presenza
  // (prima erano sei attese una dopo l'altra, ora tre)
  const accP = activeAccount(env, d), setP = getSettings(env), unP = unseenCount(env, d, d.parent), cmdP = rcPending(env, ctx, d.id);
  for (const x of [accP, setP, unP, cmdP]) x.catch(() => {});
  const old = await env.DB.prepare('SELECT * FROM presence WHERE device_id = ?').bind(d.id).first();
  // vis: l'app dice se è in primo piano (Pro dalla 2.6: true in uso o in visione, false quando va in sfondo); le app vecchie non lo mandano
  const vis = b.vis === true ? true : b.vis === false ? false : null;
  // il limite conta solo i battiti (register e inizio visione aggiornano la presenza ma non contano); il «vado in sfondo» passa sempre
  if (vis !== false && old && t - (+old.hb_t || 0) < HB_MIN_MS) return json({ error: 'Troppi battiti: attendi qualche secondo', wait: Math.ceil((HB_MIN_MS - (t - old.hb_t)) / 1000) }, 429);
  const cf = cfOf(req);
  const app = appFrom(req, b);
  const state0 = STATES.includes(b.state) ? b.state : 'idle';
  // due app Kairos con lo stesso codice (es. Premium lasciata aperta mentre si usa la Pro): il battito di sfondo
  // dell'altra app non tocca la presenza, che resta dell'app in primo piano; il resto del battito (impostazioni, comandi) vale lo stesso
  const fgFresh = !!(old && +old.fg_t && t - +old.fg_t < FG_MS && old.fg_app);
  const bgOther = !!(app && fgFresh && old.fg_app !== app && (vis === false || (vis === null && state0 === 'idle')));
  if (app && d.app !== app && !bgOther && vis !== false) ctx.waitUntil(env.DB.prepare('UPDATE devices SET app = ? WHERE id = ?').bind(app, d.id).run());
  const state = vis === false ? 'idle' : state0;
  const net = b.net && typeof b.net === 'object' ? b.net : {};
  const sp = b.speed && typeof b.speed === 'object' ? b.speed : null;
  const st = b.stats && typeof b.stats === 'object' ? b.stats : null;
  const f = {
    t, hb_t: t, ...whereFields(old, ip, cf),
    ver: str(b.ver, 20), ui: str(b.ui, 20), model: str(b.model, 80) || (old && old.model) || d.model || '',
    // primo piano: chi lo dichiara lo prende; chi va in sfondo lo lascia e risulta subito non in linea (t spostato indietro)
    ...(vis === true ? { fg_app: app, fg_t: t } : {}),
    // il «vado in sfondo» non conta come battito: chi riapre subito l'app non trova il limite dei 15 secondi
    ...(vis === false ? { fg_t: 0, t: t - ONLINE_MS - 1000, hb_t: old ? +old.hb_t || 0 : 0 } : {}),
    state, title: state === 'idle' ? '' : nameClean(b.title, 120), ch: nameClean(b.ch, 80), ch_id: str(b.chId, 60), grp: nameClean(b.group, 60),
    pl: str(b.pl, 40), prof: nameClean(b.prof, 24), screen: str(b.screen, 20),
    net: NETS.includes(net.type) ? net.type : '', rssi: Math.round(num(net.rssi, -120, 0)),
    vpn: b.vpn === 'on' ? 'on' : b.vpn === 'off' ? 'off' : '',
    ...rcSnapshot(b), // impostazioni attuali dell'app e configurazione remota applicata
  };
  if (sp) Object.assign(f, { speed_dl: num(sp.dl, 0, 1e5), speed_ul: num(sp.ul, 0, 1e5), speed_ping: num(sp.ping, 0, 1e5), speed_jit: num(sp.jitter, 0, 1e5), speed_t: Math.round(num(sp.t, 0, 1e13)) || t });
  if (st) Object.assign(f, { res: str(st.res, 20), fps: num(st.fps, 0, 1e3), bitrate: num(st.bitrate, 0, 1e9), buffers: Math.round(num(st.buffers, 0, 1e6)), dropped: Math.round(num(st.dropped, 0, 1e9)), engine: str(st.engine, 20), codec: str(st.codec, 16), dec: st.dec === 'sw' ? 'sw' : st.dec === 'hw' ? 'hw' : '', stalls_h: Math.round(num(st.stallsH, 0, 1e4)), rec: nameClean(st.rec, 80), reduced: str(st.reduced, 12),
    // Kairos Adaptive: linea e lettore come li vede l'app (solo se l'app li manda)
    ...(st.bw !== undefined ? { bw: Math.round(num(st.bw, 0, 1e4) * 10) / 10 } : {}), ...(st.line ? { line: ['weak', 'normal', 'good'].includes(st.line) ? st.line : '' } : {}),
    ...(st.dev ? { dev_class: ['D', 'N', 'O'].includes(st.dev) ? st.dev : '' } : {}), ...(st.fill !== undefined ? { fill: Math.round(num(st.fill, 0, 100) * 100) / 100 } : {}),
    ...(st.ttff !== undefined ? { ttff: Math.round(num(st.ttff, 0, 1e6)) } : {}), ...(st.stallMs !== undefined ? { stall_ms: Math.round(num(st.stallMs, 0, 1e8)) } : {}),
    ...(st.var !== undefined ? { var: str(st.var, 16) } : {}), ...(st.fmt !== undefined ? { fmt: str(st.fmt, 8) } : {}) });
  else if (state === 'idle') Object.assign(f, { res: '', fps: 0, bitrate: 0, buffers: 0, dropped: 0, engine: '', codec: '', dec: '', rec: '', reduced: '', fill: 0, ttff: 0, stall_ms: 0, var: '', fmt: '' });
  // durante la visione l'app batte ogni 20 s (per «Disconnetti»): se non è cambiato niente di importante la riga
  // si riscrive al massimo una volta al minuto, così le scritture su D1 restano quelle di prima
  // bgOther: non si scrive (la presenza resta dell'app in primo piano); «vado in sfondo» (vis false) e cambio di app in primo piano si scrivono sempre
  const same = bgOther || (old && vis !== false && !(vis === true && old.fg_app !== app) && t - (+old.t || 0) < 55e3 && old.state === state && (old.title || '') === f.title && (old.ch_id || '') === f.ch_id
    && (old.vpn || '') === f.vpn && (old.screen || '') === f.screen && (old.rcv || '') === (f.rcv || '') && (f.app_cfg === undefined || (old.app_cfg || '') === f.app_cfg) && (old.rec || '') === (f.rec ?? old.rec ?? '') && (old.reduced || '') === (f.reduced ?? old.reduced ?? '') && (+old.stalls_h || 0) === (f.stalls_h ?? +old.stalls_h ?? 0) && (!sp || +old.speed_t === f.speed_t) && (old.ip || '') === (f.ip ?? old.ip ?? ''));
  // la presenza è la cosa che conta: si scrive per prima e un errore qui non fa fallire il battito
  if (!same) { try { await upsertPresence(env, d.id, f); } catch (e) { console.error('presenza non scritta', e && e.message); } }
  // il resto (statistiche) va in sottofondo: non rallenta la risposta e non può bloccarla
  const side = [];
  // tempo di visione per cliente: quando la riga si riscrive (al massimo una volta al minuto) si aggiunge il tempo
  // passato dall'ultima scrittura al contenuto che stava guardando (al massimo 2 minuti: niente buchi gonfiati)
  if (!same && old && old.state && old.state !== 'idle' && old.title) {
    const secs = Math.round(Math.min(Math.max(0, t - (+old.t || t)), 120e3) / 1000);
    if (secs > 0) side.push(env.DB.prepare('INSERT INTO watch_dev (device_id, day, kind, title, secs, last) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(device_id, day, kind, title) DO UPDATE SET secs = watch_dev.secs + excluded.secs, last = excluded.last').bind(d.id, dayIT(t), old.state, old.title, secs, t).run());
  }
  // nuova "sessione" di visione: contenuto diverso da quello dell'ultimo battito
  if (state !== 'idle' && f.title && (!old || old.state !== state || old.title !== f.title))
    side.push(env.DB.prepare('INSERT INTO watch (day, kind, title, n) VALUES (?, ?, ?, 1) ON CONFLICT(day, kind, title) DO UPDATE SET n = watch.n + 1').bind(dayIT(t), state, f.title).run());
  if (side.length) ctx.waitUntil(Promise.allSettled(side));
  // modalità VPN e permessi attuali: se il pannello li ha cambiati l'app si riallinea subito (senza aspettare 20 minuti)
  const [P, pls0] = await accP;
  const { C, pls } = P ? await effOf(env, d, P, pls0) : { C: null, pls: [] }; // connessione indipendente: le sue playlist e il suo lettore
  const vm = P ? (+P.vpn === 2 ? 'force' : +P.vpn === 1 ? 'allow' : 'off') : 'off';
  // impronta dei server delle playlist: se cambia (DNS cambiato dal pannello) l'app aggiorna gli indirizzi senza ricaricare la lista
  const portalPls = await portalsOf(env, pls);
  const pv = pls.length ? (await sha256(pls.map((p, i) => p.id + '|' + hostOf(p) + '|' + (p.username || '') + '|' + JSON.stringify([(portalPls[i] && portalPls[i].mode) || 'auto', (portalPls[i] && portalPls[i].alts) || []])).join(','))).slice(0, 12) : '';
  const sat = await saturatedHosts(env, pls, portalPls, t);
  // "Disconnetti" dal pannello: l'ordine resta valido 3 minuti; l'app lo conferma (kickAck) e viene azzerato
  let kick = 0;
  if (+d.kick_t > 0) {
    if (b.kickAck && +b.kickAck === +d.kick_t) await env.DB.prepare('UPDATE devices SET kick_t = 0 WHERE id = ? AND kick_t = ?').bind(d.id, +d.kick_t).run();
    else if (t - +d.kick_t < 180e3) kick = +d.kick_t;
  }
  const S0 = await setP, mt = maintFor(S0, P) ? 1 : 0;
  // «Invia aggiornamento» dal pannello (o in automatico se l'app è vecchia e il titolare l'ha scelto): l'app controlla subito
  let upd = +d.upd_req || 0;
  if (!upd && S0.health && S0.health.on && S0.health.autoUpd) {
    // ultima versione: di solito già in memoria; se va scaricata il battito non aspetta più di 800 ms
    const apu = appOfVer(f.ver, d.app); if (RC_APPS.includes(apu)) try { const lp = latestFor(env, S0, apu); ctx.waitUntil(lp.catch(() => {})); const L = await Promise.race([lp, new Promise((r) => setTimeout(() => r(null), 800))]); if (L && verBehind(f.ver, L.version)) upd = L.versionCode || 1; } catch {}
  }
  const eff = rcEffective(S0, d, appOfVer(f.ver, d.app)), cmds = await cmdP;
  return json({ ok: true, mt, ...(upd ? { upd } : {}), rc: JSON.stringify(eff.rc), rcv: eff.rcv, ...(cmds.length ? { cmds } : {}), unseen: await unP, ts: t, vm, ph: P ? permsJson(permsParse(P.perms)) : '', ms: P ? +P.max_streams || 0 : 0, pv, pm: P ? (C.pl_mode === 'split' ? 'split' : 'merge') + '|' + (pls.some((p) => p.id === C.pl_default) ? C.pl_default : '') + '|' + JSON.stringify(playerParse(C.player)) : '', adg: P ? P.addons || '' : '', af: await acctFp(P), ...(sat.length ? { sat } : {}), ...(kick ? { kick } : {}) });
}
/* ---------------- dati del cliente e salute delle app ---------------- */
const verNum = (v) => { const m = String(v || '').match(/(\d{1,3})\.(\d{1,3})(?:\.(\d{1,3}))?/); return m ? +m[1] * 1e6 + +m[2] * 1e3 + +(m[3] || 0) : 0; };
const verBehind = (cur, latest) => { const a = verNum(cur), b = verNum(latest); return !!(a && b && a < b); };
/** ultima versione pubblicata dell'app del cliente: tv = Kairos Pro, ktv = Kairos TV, lite, xc */
async function latestFor(env, s, app) {
  if (app === 'lite') { const f = await liteFeed(s); return f && f.version ? { version: f.version, versionCode: semverCode(f.version) } : null; }
  if (app === 'prem') { const f = await premFeed(); return f ? { version: f.version, versionCode: f.versionCode } : null; }
  if (app === 'ktv') { const f = await ktvFeed(s); return f ? { version: f.version, versionCode: f.versionCode } : null; }
  if (app === 'xc') { const f = await xcFeed(s); return f ? { version: f.version, versionCode: f.versionCode } : null; }
  if (app === 'plus') { const f = await plusFeed(s); return f ? { version: f.version, versionCode: f.versionCode } : null; }
  if (app === 'nova') { const f = await novaFeed(); return f ? { version: f.version, versionCode: f.versionCode } : null; }
  if (app !== 'tv') return null; // app non riconosciuta (es. KAIROS per Fire TV Vega OS): nessun confronto con gli APK
  const a = await latestApk(env, s); return a && a.version ? { version: a.version, versionCode: a.versionCode } : null;
}
const APP_NAME = { tv: 'Kairos Pro', ktv: 'Kairos TV', prem: 'Kairos Premium', lite: 'Kairos Lite', xc: 'Kairos XC', plus: 'Kairos Plus', nova: 'Kairos Nova', vega: 'Kairos per Fire TV (Vega OS)' };

/* ====================================================================== */
/* Controllo remoto delle app                                              */
/*  - profilo per app (impostazioni → rcApp[app]) + impostazioni imposte a un singolo cliente (devices.rc)     */
/*  - l'app riceve la configurazione effettiva nel battito (rc) e nell'apertura (register): ogni voce imposta  */
/*    vince su quella scelta nell'app e lì risulta «scelta dal fornitore»                                        */
/*  - comandi (ricarica, svuota cache, apri impostazioni, aggiorna liste, speed test, chiudi): coda per          */
/*    dispositivo, consegnati nel battito (cmds) e confermati dall'app (POST /api/player/cmd)                    */
/*  - l'app riporta le sue impostazioni attuali (cfg) e la versione della configurazione applicata (rcv)        */
/* ====================================================================== */
const RC_APPS = ['tv', 'ktv', 'prem', 'lite', 'xc', 'plus', 'nova'];
/** app collegate al pannello con codice (battito e comandi); Kairos Nova può anche restare libera: allora legge solo la politica degli aggiornamenti */
const RC_LINKED = ['tv', 'ktv', 'prem', 'lite', 'xc', 'plus', 'nova'];
// catalogo: [chiave, nome, tipo, valori [[valore, etichetta]], app che la capiscono, spiegazione, etichetta «libera» (opz.), sezione]
// Ogni voce corrisponde a un'impostazione che il cliente trova nell'app: imposta dal pannello, lì risulta «scelta dal fornitore».
const KPRO = ['tv'], KPRO_XC = ['tv', 'xc'], KALL_LITE = ['tv', 'ktv', 'prem', 'lite', 'xc', 'plus'];
const YN = [[true, 'Sì'], [false, 'No']];
const ENG_OPTS = [['auto', 'Automatico (ExoPlayer, passa a VLC se serve)'], ['exo', 'ExoPlayer'], ['vlc', 'VLC']];
const RC_CAT = [
  /* ---- Generale ---- */
  ['lite', 'Modalità leggera', 'sel', [['auto', 'Automatica'], ['on', 'Sempre attiva'], ['max', 'Leggerissima'], ['off', 'Spenta']], KALL_LITE, 'Niente animazioni ed effetti, immagini e memoria ridotte: per chiavette e TV vecchie. «Leggerissima» toglie anche le transizioni e svuota le cache: la scelta giusta per Fire Stick con poca memoria', '', 'Generale'],
  ['privacy', 'Finestra «Privacy e condizioni»', 'sel', [['show', 'Mostrala al primo avvio'], ['skip', 'Non mostrarla']], ['tv', 'ktv', 'prem', 'lite', 'xc'], 'Con «Non mostrarla» il cliente non vede più la finestra all\'avvio', '', 'Generale'],
  ['o.startScr', 'Schermata iniziale', 'sel', [['home', 'Home'], ['movies', 'Film'], ['series', 'Serie'], ['live', 'In Diretta'], ['guide', 'Guida TV'], ['lastch', 'Ultimo canale guardato']], KPRO, '', '', 'Generale'],
  ['o.orient', 'Layout su telefoni e tablet', 'sel', [['auto', 'Automatico'], ['land', 'Sempre orizzontale']], KPRO, 'Sulle TV non cambia nulla', '', 'Generale'],
  ['tvmode', 'Modalità TV', 'sel', [['on', 'Attiva: interfaccia per telecomando'], ['off', 'Spenta']], ['nova'], '', '', 'Generale'],
  /* ---- Home: tipo «txt» = elenco di nomi (o parti di nome) di categorie separati da virgola ---- */
  ['home.top', 'Categorie in primo piano', 'txt', [], RC_APPS, 'Nomi (anche solo una parte) delle categorie da mettere per prime, separati da virgola e nell\'ordine che vuoi. Es.: Sport, Prime Video, Netflix. Valgono per la Home e per gli elenchi di Film, Serie e canali', '', 'Home'],
  ['home.hide', 'Categorie nascoste dalla Home', 'txt', [], RC_APPS, 'Nomi (anche solo una parte) delle categorie da non mostrare nella Home, separati da virgola. Es.: adult, xxx, 18+. Negli elenchi di Film, Serie e canali restano in fondo (con il PIN se bloccate)', '', 'Home'],
  /* ---- Aggiornamenti ---- */
  ['bgupd', 'Aggiornamenti in background', 'sel', [['on', 'Sì: scarica da sola, poi chiede solo «Installa»'], ['off', 'No: scarica solo quando il cliente accetta']], RC_APPS, 'Con «Sì» l\'app scarica e verifica da sola la versione nuova (su Wi-Fi o cavo, mai durante la visione): al cliente resta un solo tasto', '', 'Aggiornamenti'],
  ['force', 'Aggiornamento obbligatorio', 'sel', [['off', 'No: il cliente può rimandare'], ['7d', 'Dopo 7 giorni dal primo avviso'], ['3d', 'Dopo 3 giorni dal primo avviso'], ['now', 'Subito']], RC_APPS, 'Scaduto il termine l\'app si apre solo dopo aver installato la versione nuova. Blocca soltanto se l\'APK è già scaricato e verificato sul dispositivo, mai per un problema di rete', 'No: il cliente può rimandare', 'Aggiornamenti'],
  /* ---- Aspetto ---- */
  ['theme', 'Colore dell\'interfaccia', 'sel', [['cinema', 'Cinema (rosso)'], ['aurora', 'Aurora'], ['plasma', 'Plasma'], ['matrix', 'Matrix'], ['solar', 'Solare'], ['ice', 'Ghiaccio'], ['oro', 'Oro'], ['smeraldo', 'Smeraldo'], ['oceano', 'Oceano'], ['tramonto', 'Tramonto'], ['viola', 'Viola'], ['rosa', 'Rosa']], KPRO, 'I temi speciali dello Store restano quelli del cliente', '', 'Aspetto'],
  ['o.textSize', 'Dimensione testi', 'sel', [['s', 'Piccola'], ['m', 'Media'], ['l', 'Grande'], ['xl', 'Molto grande']], KPRO, '', '', 'Aspetto'],
  ['o.sfx', 'Effetti sonori', 'sel', [['classic', 'Classici'], ['soft', 'Morbidi'], ['futur', 'Futuristici'], ['retro', 'Retrò'], ['off', 'Disattivati']], KPRO, '', '', 'Aspetto'],
  ['adult', 'Contenuti per adulti nella Home e nei consigliati', 'sel', [['on', 'Sì'], ['off', 'No']], KPRO, 'Riguarda solo Home e consigliati: le categorie restano raggiungibili (vedi «Blocca contenuti per adulti»)', '', 'Aspetto'],
  ['logos', 'Loghi dei canali automatici', 'sel', [['on', 'Sì'], ['off', 'No']], KPRO, 'Con «No» l\'app non cerca i loghi mancanti: meno rete e memoria', '', 'Aspetto'],
  ['posters', 'Locandine', 'sel', [['auto', 'Automatiche (più leggere sulle chiavette da 1 GB)'], ['hi', 'Sempre nitide']], KPRO, 'Automatiche: sulle chiavette da 1 GB (Fire TV Stick/Lite) locandine e sfondi si scaricano più piccoli, un po\' meno nitidi ma con meno memoria. «Sempre nitide»: come sugli altri dispositivi, usa più memoria', '', 'Aspetto'],
  ['intro', 'Animazione d\'avvio', 'sel', [['auto', 'Automatica'], ['simple', 'Semplice'], ['off', 'Spenta']], KPRO, 'Automatica: completa sui dispositivi forti, senza gli effetti di sfondo pesanti su quelli deboli. Semplice: logo, scritta e barra, senza effetti di sfondo. Spenta: logo fermo e barra. Vale dall\'apertura successiva', '', 'Aspetto'],
  /* ---- Lettore ---- */
  ['o.engLive', 'Lettore TV in diretta', 'sel', ENG_OPTS, KPRO_XC, 'Se nella scheda del cliente hai già scelto il lettore, vale quello', '', 'Lettore'],
  ['o.engMovie', 'Lettore film', 'sel', ENG_OPTS, KPRO_XC, '', '', 'Lettore'],
  ['o.engSeries', 'Lettore serie TV', 'sel', ENG_OPTS, KPRO_XC, '', '', 'Lettore'],
  ['o.hw', 'Decodifica', 'sel', [['auto', 'Automatica'], ['on', 'Hardware'], ['off', 'Software']], KPRO_XC, 'Disattivala solo se il cliente vede immagini verdi o a scatti', '', 'Lettore'],
  ['o.adaptQ', 'Qualità adattiva automatica', 'sel', YN, KPRO_XC, 'Se la linea non regge passa da sola a una versione più leggera del canale', '', 'Lettore'],
  ['o.drainQ', 'Discesa anticipata della qualità', 'sel', YN, KPRO_XC, '', '', 'Lettore'],
  ['p.quality', 'Qualità video', 'sel', [['auto', 'Automatica'], ['max', 'Massima'], ['1080', '1080p'], ['720', '720p'], ['480', '480p']], KPRO_XC, '', '', 'Lettore'],
  ['p.buffer', 'Buffer di rete', 'sel', [['fast', 'Piccolo (veloce)'], ['balanced', 'Normale'], ['stable', 'Grande (stabile)']], ['tv', 'nova', 'xc'], 'Veloce: parte prima ma regge meno · Stabile: per Wi-Fi debole o server lenti', '', 'Lettore'],
  ['p.aspect', 'Formato immagine', 'sel', [['fit', 'Adatta'], ['fill', 'Riempi'], ['zoom', 'Zoom']], KPRO, '', '', 'Lettore'],
  ['o.autoNext', 'Episodio successivo automatico', 'sel', YN, KPRO, '', '', 'Lettore'],
  ['o.introAuto', 'Salta l\'intro delle serie', 'sel', YN, KPRO, '', '', 'Lettore'],
  ['o.resInd', 'Indicatore risoluzione', 'sel', YN, KPRO, '', '', 'Lettore'],
  ['o.subSize', 'Dimensione sottotitoli', 'sel', [['small', 'Piccola'], ['medium', 'Media'], ['large', 'Grande'], ['xl', 'Molto grande']], KPRO, '', '', 'Lettore'],
  /* ---- TV in diretta e guida TV ---- */
  ['preview', 'Anteprima nella lista canali', 'sel', [['click', 'Al primo OK'], ['off', 'Spenta']], ['ktv', 'prem', 'lite', 'xc', 'plus'], 'Spenta: il canale parte subito a schermo intero (meno lavoro per il dispositivo)', '', 'TV in diretta e guida TV'],
  ['o.liveFmt', 'Formato TV in diretta', 'sel', [['ts', 'Veloce (TS)'], ['hls', 'HLS']], ['tv', 'plus'], 'TS è il formato consigliato; HLS solo se il fornitore lo richiede', '', 'TV in diretta e guida TV'],
  ['o.epgShift', 'Spostamento orario guida', 'sel', [[0, 'Nessuno'], [1, '+1 ora'], [2, '+2 ore'], [-1, '−1 ora'], [-2, '−2 ore']], KPRO, '', '', 'TV in diretta e guida TV'],
  ['o.showHidden', 'Mostra i canali nascosti', 'sel', [[false, 'No'], [true, 'Sì']], KPRO, 'I canali che il cliente ha nascosto tornano visibili', '', 'TV in diretta e guida TV'],
  /* ---- Ordinamento ---- */
  ['o.sortCats', 'Ordina categorie', 'sel', [['pl', 'Come la playlist'], ['az', 'A → Z'], ['za', 'Z → A'], ['custom', 'Ordine personalizzato del cliente']], KPRO, '', '', 'Ordinamento'],
  ['o.sortCh', 'Ordina canali', 'sel', [['pl', 'Come la playlist'], ['num', 'Per numero'], ['az', 'A → Z'], ['za', 'Z → A'], ['added', 'Aggiunti di recente']], KPRO, '', '', 'Ordinamento'],
  ['o.sortVod', 'Ordina film e serie', 'sel', [['pl', 'Come la playlist'], ['recent', 'Aggiunti di recente'], ['az', 'A → Z'], ['rating', 'Valutazione']], KPRO, '', '', 'Ordinamento'],
  /* ---- Controllo genitori ---- */
  ['o.lockAdult', 'Blocca contenuti per adulti', 'sel', YN, KPRO, 'Con «Sì» le categorie per adulti chiedono il PIN del controllo genitori', '', 'Controllo genitori'],
];
// comandi: [chiave, nome, spiegazione, app che li eseguono]
const RC_CMDS = [
  ['reload', 'Riavvia l\'app', 'Chiude e riapre l\'interfaccia (la visione in corso si interrompe)', RC_LINKED],
  ['cache', 'Svuota cache e riavvia', 'Cancella liste, immagini e dati temporanei salvati sul dispositivo e riscarica tutto', RC_LINKED],
  ['sync', 'Aggiorna le liste', 'Riscarica canali, film e serie senza riavviare', RC_LINKED],
  ['settings', 'Apri le impostazioni', 'Porta il cliente nella pagina Impostazioni dell\'app', RC_LINKED],
  ['update', 'Aggiorna l\'app', 'L\'app controlla subito se c\'è una versione nuova: la scarica in background e propone «Installa ora»', RC_LINKED],
  ['speed', 'Speed test', 'Misura la connessione del dispositivo (il risultato arriva in «Online ora»)', ['tv']],
  ['perm', 'Chiedi il permesso per gli aggiornamenti', 'Apre sulla TV la schermata di Android «Installa app sconosciute»: il cliente deve solo attivarla (Android non permette di farlo da remoto)', ['tv', 'ktv', 'prem', 'lite', 'xc']],
  ['pin', 'Reimposta PIN controllo genitori', 'Il PIN torna 0000 e l\'app chiede al cliente di sceglierne uno nuovo: per chi lo ha dimenticato', RC_LINKED],
  ['exit', 'Chiudi l\'app', 'L\'app si chiude; il cliente la riapre quando vuole', RC_LINKED],
];
const rcCatByKey = new Map(RC_CAT.map((x) => [x[0], x]));
/** voce di tipo «txt»: elenco di nomi separati da virgola (o righe), senza doppioni, al massimo 20 da 40 caratteri; null = non valido */
const RC_TXT_MAX = 20;
function rcTxt(v) {
  if (typeof v !== 'string' && !Array.isArray(v)) return null;
  const parts = (Array.isArray(v) ? v.map(String) : String(v).split(/[,;\n]+/)).map((x) => x.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40)).filter(Boolean);
  const seen = new Set(), out = [];
  for (const p of parts) { const k = p.toLowerCase(); if (seen.has(k)) continue; seen.add(k); out.push(p); if (out.length >= RC_TXT_MAX) break; }
  return out.join(', ');
}
/** oggetto di configurazione pulito: solo chiavi e valori del catalogo (per l'app indicata, o per tutte) */
function rcClean(src, app) {
  let o = src; if (typeof src === 'string') { try { o = src ? JSON.parse(src) : {}; } catch { o = {}; } }
  if (!o || typeof o !== 'object') throw new HttpErr(400, 'Configurazione non valida');
  const out = {}, allows = {};
  for (const [k, v] of Object.entries(o)) {
    const allow = k.endsWith(':allow'), base = allow ? k.slice(0, -6) : k, c = rcCatByKey.get(base); if (!c) continue;
    if (allow && (c[2] !== 'sel' || c[7] !== 'Lettore')) continue;
    if (v === '' || v === null || v === undefined) continue;
    if (app && !c[4].includes(app)) continue;
    if (allow) {
      if (!Array.isArray(v)) throw new HttpErr(400, `${c[1]}: valori non validi`);
      const seen = new Set(), values = [];
      for (const value of v) {
        const ok = c[3].find((x) => x[0] === value || String(x[0]) === String(value));
        if (!ok) throw new HttpErr(400, `${c[1]}: valore non valido`);
        const key = String(ok[0]); if (seen.has(key)) continue; seen.add(key); values.push(ok[0]);
      }
      allows[base] = values;
      continue;
    }
    if (c[2] === 'txt') { const t = rcTxt(v); if (t === null) throw new HttpErr(400, `${c[1]}: valore non valido`); if (t) out[k] = t; continue; }
    const ok = c[3].find((x) => x[0] === v || String(x[0]) === String(v));
    if (!ok) throw new HttpErr(400, `${c[1]}: valore non valido`);
    out[k] = ok[0];
  }
  for (const [k, values] of Object.entries(allows)) {
    if (Object.prototype.hasOwnProperty.call(out, k)) continue;
    if (values.length === 1) out[k] = values[0];
    else if (values.length > 1) out[`${k}:allow`] = values;
  }
  return out;
}
const rcProfiles = (s) => { const r = s && s.rcApp && typeof s.rcApp === 'object' ? s.rcApp : {}; const o = {}; for (const a of RC_APPS) { try { o[a] = rcClean(r[a] || {}, a); } catch { o[a] = {}; } } return o; };
const rcDevOf = (d, app) => { try { return rcClean(d && d.rc ? d.rc : {}, app || (d && d.app)); } catch { return {}; } };
/** configurazione effettiva per un dispositivo: profilo della sua app + impostazioni sue; «rcv» = impronta corta */
function rcEffective(s, d, app) {
  const a = app || appOfVer('', d && d.app) || 'tv';
  const rc = { ...(rcProfiles(s)[a] || {}) }, own = rcDevOf(d, a);
  for (const [k, v] of Object.entries(own)) {
    const base = k.endsWith(':allow') ? k.slice(0, -6) : k;
    delete rc[base]; delete rc[`${base}:allow`]; rc[k] = v;
  }
  const keys = Object.keys(rc).sort();
  const flat = keys.map((k) => k + '=' + JSON.stringify(rc[k])).join('&');
  let h = 0; for (let i = 0; i < flat.length; i++) h = (h * 31 + flat.charCodeAt(i)) >>> 0;
  return { rc, rcv: keys.length ? h.toString(36) : '' };
}
/** comandi in attesa per un dispositivo (al massimo 5 per battito); si segnano come consegnati */
async function rcPending(env, ctx, deviceId) {
  try {
    const rows = ((await env.DB.prepare('SELECT id, cmd, args FROM remote_cmds WHERE device_id = ? AND done = 0 AND created > ? ORDER BY id LIMIT 5').bind(deviceId, now() - 7 * 864e5).all()).results) || [];
    if (!rows.length) return [];
    const w = env.DB.prepare(`UPDATE remote_cmds SET sent = ? WHERE sent = 0 AND id IN (${rows.map(() => '?').join(',')})`).bind(now(), ...rows.map((r) => r.id)).run().catch(() => {});
    ctx && ctx.waitUntil ? ctx.waitUntil(w) : await w;
    return rows.map((r) => { let a = null; try { a = r.args ? JSON.parse(r.args) : null; } catch {} return { id: r.id, c: r.cmd, ...(a ? { a } : {}) }; });
  } catch { return []; }
}
/** l'app conferma un comando eseguito */
async function playerCmdAck(req, env, ip) {
  let b; try { b = await readJSON(req, 2048); } catch (e) { return json({ error: e.message }, e.status || 400); }
  const [d, bad] = await deviceAuth(env, b); if (bad) return bad;
  const id = parseInt(b.id, 10); if (!(id > 0)) return json({ error: 'Comando non valido' }, 400);
  await env.DB.prepare('UPDATE remote_cmds SET done = ?, ok = ?, info = ? WHERE id = ? AND device_id = ? AND done = 0').bind(now(), b.ok === false ? 0 : 1, str(b.info, 200), id, d.id).run();
  return json({ ok: true });
}
/** impostazioni attuali dell'app come le manda il dispositivo (cfg) e versione della configurazione applicata (rcv) */
function rcSnapshot(b) {
  const cfg = b && b.cfg && typeof b.cfg === 'object' && !Array.isArray(b.cfg) ? b.cfg : null;
  const out = { rcv: str(b && b.rcv, 16) };
  if (cfg) { const o = {}; let n = 0; for (const [k, v] of Object.entries(cfg)) { if (n++ > 60) break; const kk = str(k, 30); if (!kk) continue; o[kk] = typeof v === 'boolean' || typeof v === 'number' ? v : str(String(v ?? ''), 60); } out.app_cfg = JSON.stringify(o).slice(0, 2000); }
  return out;
}
/** quale app sta usando il cliente: dalla versione che manda l'app stessa («lite 1.3.0», «tv 2.2.4», «xc 2.0.2», «plus 0.1.5»,
    Kairos Pro solo il numero «2.5.3»), che è la cosa più affidabile; altrimenti quella salvata nel pannello.
    Prima la salute delle app confrontava tutti con la versione della Pro e proponeva aggiornamenti sbagliati. */
function appOfVer(ver, saved) {
  const v = String(ver || '').trim();
  if (/vega/i.test(v)) return 'vega';
  if (/^lite\b/i.test(v)) return 'lite';
  if (/^xc\b/i.test(v)) return 'xc';
  if (/^plus\b/i.test(v)) return 'plus';
  if (/^nova\b/i.test(v)) return 'nova';
  if (/premium/i.test(v)) return 'prem';
  if (/^tv\b/i.test(v)) return 'ktv';
  if (/^\d+\.\d+/.test(v)) return 'tv';
  return saved || 'tv';
}
/** come si aggiorna ogni app: solo Kairos Pro riceve «Invia aggiornamento» dal pannello */
const UPD_HOW = { tv: 'Invia l\'aggiornamento: l\'app lo propone subito al cliente', prem: 'Invia l\'aggiornamento: Kairos Premium lo scarica in background e propone «Installa ora»', ktv: 'Invia l\'aggiornamento: Kairos TV lo scarica in background e propone «Installa ora» (dalla versione con il controllo remoto; le vecchie lo propongono all\'avvio)', lite: 'Invia l\'aggiornamento: Kairos Lite lo scarica in background e propone «Installa ora» (dalla versione con il controllo remoto; le vecchie lo propongono all\'avvio)', xc: 'Invia l\'aggiornamento: Kairos XC lo scarica in background e propone «Installa ora» (dalla versione con il controllo remoto; le vecchie lo propongono all\'avvio)', plus: 'Invia l\'aggiornamento: Kairos Plus lo scarica in background e propone «Installa ora» (dalla versione con il controllo remoto; le vecchie si aggiornano dal Kairos Store)', nova: 'Invia l\'aggiornamento: Kairos Nova lo scarica in background e propone «Installa ora»' };
/** problemi trovati per un cliente, con la soluzione suggerita (sev: bad | warn) */
/* «Risolvi»: azioni vere sui problemi trovati da healthIssues. auto = solo quelle che non interrompono la visione
   (impostazioni dell'app); a mano anche svuota cache e riavvio. Linee scadute o piene: solo segnalate (rinnovare usa crediti). */
async function xtUserInfo(origin, u, p) {
  const url = `${origin}/player_api.php?username=${encodeURIComponent(u)}&password=${encodeURIComponent(p)}`, hd = { 'User-Agent': 'IPTVSmartersPro', Accept: 'application/json' };
  const parse = async (r) => { if (!r || !r.ok) return null; try { const j = JSON.parse(await r.text()); return j && typeof j === 'object' ? j.user_info || { auth: 0 } : null; } catch { return null; } };
  let v = null;
  try { v = await parse(await fetch(url, { headers: hd, signal: AbortSignal.timeout(6000) })); } catch {}
  if (!v) { try { v = await parse(await Promise.race([sockFetch(url, { method: 'GET', headers: hd }), new Promise((_, no) => setTimeout(() => no(new Error('timeout')), 7000))])); } catch {} }
  return v;
}
async function lineProblem(pl) {
  let o = ''; try { o = new URL(/^https?:\/\//i.test(pl.host) ? pl.host : 'http://' + pl.host).origin; } catch { return ''; }
  const ui = await xtUserInfo(o, pl.username, pl.password);
  if (!ui) return 'il server della linea non risponde';
  if (ui.auth !== undefined && +ui.auth === 0) return 'il server rifiuta utente e password (linea cancellata o password cambiata)';
  const exp = +ui.exp_date ? +ui.exp_date * 1000 : 0;
  if (exp && exp < now()) return `linea scaduta il ${new Date(exp).toLocaleDateString('it-IT')}: va rinnovata`;
  if (ui.status && !/^active$/i.test(String(ui.status))) return `linea in stato «${str(String(ui.status), 30)}» sul server`;
  const a = +ui.active_cons || 0, mx = +ui.max_connections || 0;
  if (mx && a >= mx) return `connessioni piene (${a}/${mx}): qualcun altro usa la stessa linea`;
  return '';
}
/* soft = «Risolvi tutti» senza riavvii: aggiornamento, impostazioni e controllo linea sì, svuota cache e riavvio no
   (la visione in corso dei clienti non si interrompe) */
async function fixDevice(env, s, d, who, auto = false, soft = false) {
  const t = now();
  const p = await env.DB.prepare('SELECT * FROM presence WHERE device_id = ?').bind(d.id).first();
  const app = appOfVer(p && p.ver, d.app);
  if (!RC_LINKED.includes(app)) throw new HttpErr(400, `${APP_NAME[app] || 'Questa app'} non si gestisce dal pannello`);
  const errs = ((await env.DB.prepare('SELECT t, problem, outcome, codec, dec FROM app_errors WHERE device_id = ? AND t > ?').bind(d.id, Math.max(t - 864e5, +d.fix_t || 0)).all().catch(() => ({ results: [] }))).results) || [];
  const latest = auto ? null : await latestFor(env, s, app).catch(() => null);
  const iss = healthIssues(p, errs, latest, app);
  const rc = rcDevOf(d), rc0 = JSON.stringify(rc), cmds = new Set(), done = [], todo = [];
  /* voci già decise dal titolare (su questo cliente o sul profilo dell'app): «Risolvi» automatico non le cambia mai.
     «Modalità leggera: Spenta» non la cambia nemmeno «Risolvi» premuto a mano (lo segnala soltanto), e la modalità leggera non scende mai */
  const prof = rcProfiles(s)[app] || {}, LR = { auto: 1, on: 2, max: 3 };
  const set = (k, v, why, keep) => {
    const c = rcCatByKey.get(k); if (!c || !(c[4] || []).includes(app) || rc[k] === v) return;
    const cur = rc[k] !== undefined ? rc[k] : prof[k];
    if (k === 'lite' && cur === 'off') { if (!auto && keep) todo.push(keep); return; }
    if (k === 'lite' && (LR[cur] || 0) >= (LR[v] || 0)) return;
    if (auto && rc[k] !== undefined) return;
    rc[k] = v; done.push(why);
  };
  let upd = false;
  for (const i of iss) {
    if (i.key === 'upd') { upd = true; done.push(`Aggiornamento alla versione ${latest ? latest.version : 'nuova'} inviato`); }
    else if (i.key === 'restart') { set('lite', 'max', 'Modalità leggerissima attivata: il dispositivo ha poca memoria', 'Si riavvia per poca memoria, ma la modalità leggera è «Spenta» per tua scelta: non la cambio. Per meno riavvii mettila su «Leggerissima» da Controllo remoto'); cmds.add('cache'); }
    else if (i.key === 'err') {
      cmds.add('cache');
      if (errs.some((e) => /hevc|h\.?265/i.test(e.codec || ''))) { set('lite', 'on', 'Modalità leggera attivata: i canali HEVC pesano sul dispositivo', 'Canali HEVC pesanti, ma la modalità leggera è «Spenta» per tua scelta: non la cambio'); todo.push('Canali HEVC/H.265: se la playlist ha la versione H.264 del canale, è più leggera'); }
    } else if (i.key === 'dec') set('o.hw', 'on', 'Decodifica hardware attivata');
    else if (i.key === 'stall' || i.key === 'speed' || i.key === 'wifi') {
      set('o.adaptQ', true, 'Qualità adattiva attivata: con la rete lenta passa da sola alla versione più leggera del canale');
      if (i.key === 'wifi') todo.push('Wi-Fi debole: il cliente deve avvicinare il router, usare un ripetitore o il cavo');
      if (i.key === 'speed') todo.push('Connessione del cliente lenta: per l\'HD servono almeno 8–10 Mbps stabili');
    }
  }
  if (!auto) for (const pl of (await unseal(env, d.playlists).catch(() => [])).filter((x) => x && x.type === 'xtream' && x.host && x.username && x.password).slice(0, 3)) {
    const why = await lineProblem(pl); if (why) todo.push(`Linea «${pl.name || pl.username}»: ${why}`);
  }
  if (auto || soft) cmds.clear();
  const stmts = [];
  if (JSON.stringify(rc) !== rc0) stmts.push(env.DB.prepare('UPDATE devices SET rc = ? WHERE id = ?').bind(JSON.stringify(rc), d.id));
  if (upd) stmts.push(env.DB.prepare('UPDATE devices SET upd_req = ? WHERE id = ? OR parent = ?').bind(t, d.id, d.id));
  for (const c of cmds) {
    const have = await env.DB.prepare('SELECT 1 AS x FROM remote_cmds WHERE device_id = ? AND cmd = ? AND done = 0').bind(d.id, c).first();
    if (!have) stmts.push(env.DB.prepare('INSERT INTO remote_cmds (device_id, cmd, args, created, by) VALUES (?, ?, ?, ?, ?)').bind(d.id, c, '', t, who));
  }
  if (cmds.has('cache')) done.push('Cache svuotata e app riavviata (appena l\'app si collega: entro 1 minuto se è aperta)');
  if (done.length) stmts.push(env.DB.prepare('UPDATE devices SET fix_t = ? WHERE id = ?').bind(t, d.id));
  if (stmts.length) await env.DB.batch(stmts);
  if (done.length) await log(env, 'edit', `${who}: «Risolvi»${auto ? ' automatico' : soft ? ' (tutti, senza riavvii)' : ''} su ${d.name || d.code} — ${done.join('; ')}`, '');
  return { ok: true, done, todo, issues: iss.length };
}
function healthIssues(p, errs, latest, app) {
  const out = [];
  const pro = !app || RC_APPS.includes(app);
  if (p && latest && verBehind(p.ver, latest.version)) out.push({ sev: 'warn', key: 'upd', what: `App vecchia: ${APP_NAME[app || 'tv'] || ''} ${String(p.ver || '?').replace(/^(lite|tv|xc|plus)\s+/i, '').replace(/\s+premium$/i, '')} (ultima ${latest.version})`, fix: UPD_HOW[app || 'tv'] || 'Aggiorna l\'app del cliente', ...(pro ? { act: 'upd' } : {}) });
  const kd = errs.filter((e) => e.problem === 'killed').length, cr = errs.filter((e) => e.problem === 'crash').length;
  if (kd >= 2) out.push({ sev: 'bad', key: 'killed', what: `Si è chiusa da sola ${kd} volte nelle ultime 24 ore: il sistema l'ha terminata per poca memoria${/fire|aft/i.test((p && p.model) || '') ? ' (tipico dei Fire Stick)' : ''}`, fix: 'L\'app passa da sola alla modalità leggerissima (salvo se l\'hai messa «Spenta»). Fai chiudere le altre app sul dispositivo e riavviarlo; se continua, quel dispositivo ha troppo poca memoria per l\'app: serve un box o una stick con almeno 2 GB' });
  const ue = errs.filter((e) => e.problem === 'uierr').length;
  if (ue >= 1) out.push({ sev: 'warn', key: 'uierr', what: `${ue} ${ue === 1 ? 'errore dell\'interfaccia' : 'errori dell\'interfaccia'} nelle ultime 24 ore`, fix: 'Il dettaglio (messaggio e riga) è in «Errori delle app»: mandalo allo sviluppatore' });
  if (cr >= 1) out.push({ sev: 'bad', key: 'crash', what: `${cr} ${cr === 1 ? 'chiusura improvvisa per errore interno' : 'chiusure improvvise per errore interno'} nelle ultime 24 ore`, fix: 'Guarda il dettaglio in «Errori delle app» e segnalalo: con quel testo si trova la causa' });
  const rs = errs.filter((e) => e.problem === 'restart').length;
  if (rs >= 2) out.push({ sev: 'bad', key: 'restart', what: `Si è riavviata da sola ${rs} volte nelle ultime 24 ore: Android chiude il motore web per poca memoria${/fire|aft/i.test((p && p.model) || '') ? ' (tipico dei Fire Stick)' : ''}`, fix: 'L\'app passa da sola alla modalità leggerissima (salvo se l\'hai messa «Spenta»). Se continua: Controllo remoto → Modalità leggera «Leggerissima» per questo cliente, chiudi le altre app sul dispositivo e riavvialo; se ha ancora problemi serve un dispositivo con più memoria' });
  const nr = errs.filter((e) => e.outcome === 'non risolto' && !['restart', 'crash', 'killed', 'uierr'].includes(e.problem)).length, fr = errs.filter((e) => e.problem === 'freeze').length;
  if (nr >= 3) out.push({ sev: 'bad', key: 'err', what: `${nr} errori non risolti nelle ultime 24 ore`, fix: errs.some((e) => /hevc|h\.?265/i.test(e.codec || '')) ? 'Canali HEVC/H.265 su un dispositivo che fatica: usa la versione H.264 del canale o un dispositivo più recente' : 'Controlla il canale o la linea: se succede su più clienti è il server', ...(pro ? { act: 'upd' } : {}) });
  else if (errs.length >= 5) out.push({ sev: 'warn', key: 'err', what: `${errs.length} problemi di visione nelle ultime 24 ore (risolti da soli)`, fix: 'Tienilo d\'occhio: se aumentano controlla linea e dispositivo' });
  if (fr >= 3 && errs.some((e) => e.dec === 'sw')) out.push({ sev: 'warn', key: 'dec', what: 'Immagine ferma con decodifica software', fix: 'Nel lettore del cliente prova ExoPlayer con decodifica hardware, oppure VLC' });
  if (p && p.state !== 'idle' && +p.stalls_h >= 3) out.push({ sev: 'warn', key: 'stall', what: `${p.stalls_h} blocchi nell'ultima ora`, fix: p.net === 'wifi' && +p.rssi < -70 ? 'Wi-Fi debole: avvicina il router o usa il cavo' : 'Linea o server lenti in questo momento' });
  if (p && p.net === 'wifi' && +p.rssi && +p.rssi < -75) out.push({ sev: 'warn', key: 'wifi', what: `Wi-Fi molto debole (${p.rssi} dBm)`, fix: 'Avvicina il router, usa un ripetitore o il cavo' });
  if (p && +p.speed_dl && +p.speed_dl < 8) out.push({ sev: 'warn', key: 'speed', what: `Connessione lenta (${(+p.speed_dl).toFixed(1)} Mbps)`, fix: 'Per l\'HD servono almeno 8–10 Mbps stabili' });
  return out;
}
async function insightFor(env, d, s) {
  const t = now(), p = await env.DB.prepare('SELECT * FROM presence WHERE device_id = ?').bind(d.id).first();
  const app = appOfVer(p && p.ver, d.app), latest = await latestFor(env, s, app).catch(() => null);
  const since = dayIT(t - 6 * 864e5);
  const wd = ((await env.DB.prepare('SELECT day, kind, title, secs, last FROM watch_dev WHERE device_id = ? AND day >= ? ORDER BY last DESC LIMIT 500').bind(d.id, since).all().catch(() => ({ results: [] }))).results) || [];
  const errs = ((await env.DB.prepare('SELECT t, problem, action, outcome, err, title, kind, engine, codec, dec, res, ver FROM app_errors WHERE device_id = ? AND t > ? ORDER BY t DESC LIMIT 200').bind(d.id, t - 7 * 864e5).all().catch(() => ({ results: [] }))).results) || [];
  const errs24 = errs.filter((e) => e.t > t - 864e5 && e.t > (+d.fix_t || 0));
  const today = dayIT(t), byTitle = new Map(), byDay = new Map();
  for (const w of wd) { const k = w.kind + '|' + w.title, x = byTitle.get(k) || { kind: w.kind, title: w.title, secs: 0, last: 0 }; x.secs += +w.secs; x.last = Math.max(x.last, +w.last); byTitle.set(k, x); byDay.set(w.day, (byDay.get(w.day) || 0) + +w.secs); }
  const online = p && t - (+p.t || 0) <= ONLINE_MS;
  return {
    id: d.id, name: d.name || '', code: d.code, app, appName: APP_NAME[app] || 'Kairos', model: (p && p.model) || d.model || '',
    online, lastSeen: Math.max(+d.last_seen || 0, p ? +p.t : 0), lastIp: (p && p.ip) || d.last_ip || '', city: p ? [p.city, p.country].filter(Boolean).join(', ') : '',
    ver: (p && p.ver) || '', latest: latest ? latest.version : '', needsUpdate: !!(p && latest && verBehind(p.ver, latest.version)), canUpd: RC_LINKED.includes(app), updSent: +d.upd_req || 0,
    now: p && p.state !== 'idle' && online ? { kind: p.state, title: p.title, ch: p.ch, res: p.res, codec: p.codec, engine: p.engine } : null,
    last: wd.length ? { kind: wd[0].kind, title: wd[0].title, t: +wd[0].last } : p && p.title ? { kind: p.state, title: p.title, t: +p.t } : null,
    net: p ? { type: p.net, rssi: +p.rssi || 0, dl: +p.speed_dl || 0, ul: +p.speed_ul || 0, ping: +p.speed_ping || 0, t: +p.speed_t || 0 } : null,
    watch: { today: byDay.get(today) || 0, week: [...byDay.values()].reduce((a, b) => a + b, 0), days: [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([day, secs]) => ({ day, secs })), top: [...byTitle.values()].sort((a, b) => b.secs - a.secs).slice(0, 15) },
    errors: { n24: errs24.length, n7: errs.length, unresolved24: errs24.filter((e) => e.outcome === 'non risolto').length, list: errs.slice(0, 12) },
    issues: healthIssues(p, errs24, latest, app),
  };
}
/** riepilogo per il pannello: clienti con problemi (versione vecchia, errori, blocchi), dal più grave */
async function healthList(env, s, ids) {
  const t = now();
  // presenza, errori e ultime versioni: tutto insieme (prima erano tre attese una dopo l'altra)
  const L = {};
  const [rowsR, erR] = await Promise.all([
    env.DB.prepare("SELECT p.device_id AS id, p.ver, p.state, p.stalls_h, p.net, p.rssi, p.speed_dl, p.t, d.name, d.code, d.app, d.parent, d.upd_req, d.fix_t FROM presence p JOIN devices d ON d.id = p.device_id WHERE p.t > ?").bind(t - 3 * 864e5).all(),
    env.DB.prepare('SELECT device_id, t, problem, outcome, codec, dec FROM app_errors WHERE t > ?').bind(t - 864e5).all().catch(() => ({ results: [] })),
    ...['tv', 'ktv', 'prem', 'lite', 'xc', 'plus'].map(async (a) => { L[a] = await latestFor(env, s, a).catch(() => null); }),
  ]);
  const rows = (rowsR && rowsR.results) || [];
  const er = new Map(((erR && erR.results) || []).reduce((m, e) => { const a = m.get(e.device_id) || []; a.push(e); m.set(e.device_id, a); return m; }, new Map()));
  const out = [];
  for (const r of rows) {
    if (ids && !ids.has(r.id)) continue;
    const app = appOfVer(r.ver, r.app), iss = healthIssues(r, (er.get(r.id) || []).filter((e) => +e.t > (+r.fix_t || 0)), L[app] || null, app);
    if (iss.length) out.push({ id: r.id, name: r.name || '', code: r.code, app, appName: APP_NAME[app] || '', canUpd: RC_LINKED.includes(app), ver: r.ver, online: t - +r.t <= ONLINE_MS, lastSeen: +r.t, updSent: +r.upd_req || 0, issues: iss, bad: iss.filter((x) => x.sev === 'bad').length });
  }
  out.sort((a, b) => b.bad - a.bad || b.issues.length - a.issues.length || b.lastSeen - a.lastSeen);
  return { list: out.slice(0, 300), latest: Object.fromEntries(Object.entries(L).map(([k, v]) => [k, v ? v.version : ''])), settings: { on: !!(s.health && s.health.on), autoUpd: !!(s.health && s.health.autoUpd), autoFix: !!(s.health && s.health.autoFix) } };
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
  if ((await getSettings(env)).aiOff) return json({ off: true });
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
  { const w = await reqWait(env, 'ai', [P.id, d.id]); if (w) return w; }
  if (!cleanReqWait((await getSettings(env)).reqWait).ai && await env.DB.prepare("SELECT 1 AS x FROM requests WHERE kind = 'ai' AND device_id = ? AND status <> 'done'").bind(P.id).first()) return json({ ok: true, already: true });
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
  // una sola andata al database: presenza + dispositivo + (per le connessioni collegate) il loro principale, e insieme
  // i titoli più visti e il totale. Delle playlist basta sapere se ci sono (prima viaggiava tutto il blocco cifrato)
  const [rowsR, topR, totR] = await Promise.all([
    env.DB.prepare("SELECT p.*, d.name, d.code, d.expires, d.active, d.parent, (d.playlists <> '') AS has_pl, d.model AS dmodel, pd.id AS p_id, pd.name AS p_name, pd.code AS p_code, pd.active AS p_active, pd.expires AS p_expires, (pd.playlists <> '') AS p_has_pl, pd.parent AS p_parent FROM presence p JOIN devices d ON d.id = p.device_id LEFT JOIN devices pd ON d.parent <> '' AND pd.id = d.parent WHERE p.t > ? ORDER BY p.t DESC LIMIT 1000").bind(t - 86400e3).all(),
    env.DB.prepare('SELECT kind, title, n FROM watch WHERE day = ? ORDER BY n DESC, title LIMIT 15').bind(dayIT(t)).all().catch(() => null),
    env.DB.prepare('SELECT COUNT(*) AS n FROM devices').first(),
  ]);
  const rows = (rowsR && rowsR.results) || [];
  const parents = new Map();
  for (const r of rows) if (r.parent && r.p_id && !parents.has(r.p_id)) parents.set(r.p_id, { id: r.p_id, name: r.p_name, code: r.p_code, active: r.p_active, expires: r.p_expires, has_pl: r.p_has_pl, parent: r.p_parent || '' });
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
  const top = (topR && topR.results) || [];
  const total = (totR || { n: 0 }).n;
  const watching = online.filter((o) => o.state !== 'idle').length;
  return { online, recent, top, counts: { online: online.length, watching, idle: online.length - watching, total }, ts: t };
}
const onlineCount = async (env) => { try { return (await env.DB.prepare('SELECT COUNT(*) AS n FROM presence WHERE t > ?').bind(now() - ONLINE_MS).first()).n; } catch { return 0; } };
/** ultimo contatto di ogni dispositivo dalla presenza (battiti): «Ultimo accesso» prima guardava solo l'apertura dell'app,
    così chi guardava da ore risultava «visto 3 ore fa» anche se era collegato */
function presenceMap(env) {
  return reqMemo(env, 'pm', async () => { try { return new Map((((await env.DB.prepare('SELECT device_id, t, state FROM presence WHERE t > ?').bind(now() - 30 * 864e5).all()).results) || []).map((r) => [r.device_id, r])); } catch { return new Map(); } });
}
/** aggiunge ai dispositivi del pannello l'ultimo contatto vero e, se collegati adesso, cosa stanno facendo (live: idle|live|movie|series|rec) */
function withPresence(devs, pm) {
  const t = now();
  for (const x of devs) {
    const p = pm.get(x.id); if (!p) continue;
    if (+p.t > (+x.lastSeen || 0)) x.lastSeen = +p.t;
    if (t - +p.t <= ONLINE_MS) x.live = STATES.includes(p.state) ? p.state : 'idle';
  }
  return devs;
}

/* ====================================================================== */
/* Segnalazioni e richieste di contenuti                                   */
/* ====================================================================== */
const CTYPES = ['movie', 'series', 'live', 'addon'];
const REQ_STATUS = ['new', 'seen', 'done'];
/* tempi di attesa tra una richiesta e l'altra, uno per tipo (minuti; 0 = nessuno), decisi dal titolare.
   Dopo una richiesta il cliente aspetta la fine del tempo oppure che il fornitore risponda (fatta/rifiutata/eliminata). */
const REQ_KINDS = ['report', 'content', 'addon', 'ai', 'store'];
const REQ_WAIT_MAX = 10080; // 7 giorni
function cleanReqWait(v) { const o = {}; const x = v && typeof v === 'object' ? v : {}; for (const k of REQ_KINDS) { const n = parseInt(x[k], 10); o[k] = n > 0 ? Math.min(REQ_WAIT_MAX, n) : 0; } return o; }
const waitTxt = (ms) => { const m = Math.max(1, Math.ceil(ms / 60e3)); if (m < 60) return m + (m === 1 ? ' minuto' : ' minuti'); if (m < 1440) { const h = Math.floor(m / 60), r = m % 60; return h + (h === 1 ? ' ora' : ' ore') + (r ? ' e ' + r + (r === 1 ? ' minuto' : ' minuti') : ''); } const g = Math.floor(m / 1440), h = Math.round((m % 1440) / 60); return g + (g === 1 ? ' giorno' : ' giorni') + (h ? ' e ' + h + (h === 1 ? ' ora' : ' ore') : ''); };
/** se c'è una richiesta dello stesso tipo ancora senza risposta e dentro il tempo di attesa: risposta «in attesa del fornitore» */
async function reqWait(env, kind, ids) {
  const min = cleanReqWait((await getSettings(env)).reqWait)[kind];
  if (!min) return null;
  const list = [...new Set(ids.filter(Boolean))];
  const r = await env.DB.prepare(`SELECT created FROM requests WHERE kind = ? AND status <> 'done' AND device_id IN (${list.map(() => '?').join(',')}) AND created > ? ORDER BY created DESC LIMIT 1`).bind(kind, ...list, now() - min * 60e3).first();
  if (!r) return null;
  const left = r.created + min * 60e3 - now();
  return json({ error: `In attesa del fornitore: la tua richiesta precedente non ha ancora ricevuto risposta. Potrai inviarne un'altra appena il fornitore risponde, oppure tra ${waitTxt(left)}.`, waiting: true, retryIn: Math.ceil(left / 1000) }, 429);
}
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
  { const w = await reqWait(env, 'addon', [P.id, d.id]); if (w) return w; }
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
  { const w = await reqWait(env, 'content', [d.id, P.id]); if (w) return w; }
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
    const ACT = { series: ['get_series_categories', 'get_series'], live: ['get_live_categories', 'get_live_streams'], movies: ['get_vod_categories', 'get_vod_streams'] }[kind] || ['get_vod_categories', 'get_vod_streams'];
    const [cats, items] = await Promise.all([xtreamGet(src, ACT[0]), xtreamGet(src, ACT[1])]);
    const okUrl = (u) => (typeof u === 'string' && /^https?:\/\//i.test(u) ? u.slice(0, 500) : '');
    const s = (v, n) => (v === undefined || v === null ? '' : String(v).slice(0, n));
    return {
      cats: cats.map((c) => ({ id: s(c.category_id, 20), name: nameClean(c.category_name, 60) || 'Altro' })).filter((c) => c.id),
      items: items.map((x) => (kind === 'series'
        ? { id: s(x.series_id, 20), name: nameClean(x.name, 160), year: (s(x.releaseDate || x.release_date, 10).match(/^\d{4}/) || [yearOf(x.name)])[0] || '', cat: s(x.category_id, 20), poster: okUrl(x.cover), rating: num(x.rating_5based ? x.rating_5based * 2 : x.rating, 0, 10), added: +x.last_modified || 0 }
        : kind === 'live'
          ? { id: s(x.stream_id, 20), name: nameClean(x.name, 160), year: '', cat: s(x.category_id, 20), poster: okUrl(x.stream_icon), rating: 0, added: +x.added || 0, num: +x.num || 0, epg: s(x.epg_channel_id, 60), archive: +x.tv_archive ? +x.tv_archive_duration || 1 : 0 }
          : { id: s(x.stream_id, 20), name: nameClean(x.name, 160), year: yearOf(x.name) || '', cat: s(x.category_id, 20), poster: okUrl(x.stream_icon), rating: num(x.rating_5based ? x.rating_5based * 2 : x.rating, 0, 10), added: +x.added || 0 })).filter((x) => x.id && x.name),
    };
  });
}
/** scheda di un titolo: film → trama/cast, serie → stagioni ed episodi, canale live → EPG (ora e prossimi). In cache 1 ora */
const b64txt = (v) => { const t = String(v || ''); if (!t) return ''; try { return decodeURIComponent(escape(atob(t))); } catch { try { return atob(t); } catch { return t; } } };
async function xtreamInfo(src, kind, id) {
  return cachedJson(`catalog/${src.key}/info/${kind}/${id}`, async () => {
    const s = (v, n) => (v === undefined || v === null ? '' : String(v).slice(0, n)), okUrl = (u) => (typeof u === 'string' && /^https?:\/\//i.test(u) ? u.slice(0, 500) : '');
    const people = (v) => s(v, 600).split(/\s*,\s*/).map((x) => x.trim()).filter(Boolean).slice(0, 30);
    const get = async (action, extra) => { const u = `${src.host}/player_api.php?username=${encodeURIComponent(src.user)}&password=${encodeURIComponent(src.pass)}&action=${action}&${extra}`; const r = await fetch(u, { headers: { 'User-Agent': CAT_UA, Accept: 'application/json' }, signal: tmo(20000), redirect: 'follow' }); if (!r.ok) throw new HttpErr(502, `Il server ha risposto ${r.status}`); const j = await r.json().catch(() => null); if (!j || typeof j !== 'object') throw new HttpErr(502, 'Il server non ha restituito la scheda'); return j; };
    if (kind === 'live') {
      const j = await get('get_short_epg', `stream_id=${encodeURIComponent(id)}&limit=14`);
      const L = Array.isArray(j.epg_listings) ? j.epg_listings : [];
      return { kind, epg: L.map((e) => ({ title: nameClean(b64txt(e.title), 160), desc: b64txt(e.description).slice(0, 1200), start: (+e.start_timestamp || Math.floor(Date.parse(e.start) / 1000) || 0) * 1000, end: (+e.stop_timestamp || Math.floor(Date.parse(e.end) / 1000) || 0) * 1000 })).filter((e) => e.title) };
    }
    if (kind === 'series') {
      const j = await get('get_series_info', `series_id=${encodeURIComponent(id)}`), I = j.info || {};
      const eps = j.episodes && typeof j.episodes === 'object' ? (Array.isArray(j.episodes) ? j.episodes.flat() : Object.values(j.episodes).flat()) : [];
      const seasons = new Map();
      for (const e of eps) { if (!e || typeof e !== 'object') continue; const sn = +e.season || 0, inf = e.info || {}; if (!seasons.has(sn)) seasons.set(sn, []); seasons.get(sn).push({ id: s(e.id, 20), num: +e.episode_num || 0, title: nameClean(e.title, 160), plot: s(inf.plot, 800), duration: s(inf.duration, 12), date: s(inf.releasedate || inf.release_date, 10), image: okUrl(inf.movie_image), rating: num(inf.rating, 0, 10) }); }
      const meta = Array.isArray(j.seasons) ? j.seasons : [];
      return { kind, title: nameClean(I.name, 160), plot: s(I.plot, 2000), cast: people(I.cast), director: people(I.director), genre: s(I.genre, 120), date: s(I.releaseDate || I.release_date, 10), rating: num(I.rating_5based ? I.rating_5based * 2 : I.rating, 0, 10), poster: okUrl(I.cover), backdrop: okUrl(Array.isArray(I.backdrop_path) ? I.backdrop_path[0] : I.backdrop_path), trailer: s(I.youtube_trailer, 40),
        seasons: [...seasons.entries()].sort((a, b) => a[0] - b[0]).map(([n, list]) => { const m = meta.find((x) => +x.season_number === n) || {}; return { num: n, name: nameClean(m.name, 80) || (n ? 'Stagione ' + n : 'Speciali'), date: s(m.air_date, 10), cover: okUrl(m.cover), episodes: list.sort((a, b) => a.num - b.num).slice(0, 400) }; }) };
    }
    const j = await get('get_vod_info', `vod_id=${encodeURIComponent(id)}`), I = j.info || {}, M = j.movie_data || {};
    return { kind: 'movies', title: nameClean(M.name || I.name, 160), plot: s(I.plot || I.description, 2000), cast: people(I.cast || I.actors), director: people(I.director), genre: s(I.genre, 120), date: s(I.releasedate || I.release_date, 10), duration: s(I.duration, 12), rating: num(I.rating_5based ? I.rating_5based * 2 : I.rating, 0, 10), poster: okUrl(I.movie_image || I.cover_big), backdrop: okUrl(Array.isArray(I.backdrop_path) ? I.backdrop_path[0] : I.backdrop_path), trailer: s(I.youtube_trailer, 40), country: s(I.country, 60) };
  });
}
async function adminCatalogInfo(env, url) {
  const srcs = await catalogSources(env);
  const key = str(url.searchParams.get('src'), 16), src = /^[A-Za-z0-9_-]{16}$/.test(key) ? srcs.get(key) : null;
  if (!src) throw new HttpErr(400, 'Scegli una sorgente');
  const kind = ['series', 'live'].includes(url.searchParams.get('kind')) ? url.searchParams.get('kind') : 'movies', id = str(url.searchParams.get('id'), 20);
  if (!/^[A-Za-z0-9_-]{1,20}$/.test(id)) throw new HttpErr(400, 'Titolo non valido');
  return xtreamInfo(src, kind, id);
}
async function adminCatalog(env, url) {
  const srcs = await catalogSources(env);
  const key = str(url.searchParams.get('src'), 16), src = /^[A-Za-z0-9_-]{16}$/.test(key) ? srcs.get(key) : null;
  if (!src) throw new HttpErr(400, 'Scegli una sorgente');
  const kind = ['series', 'live'].includes(url.searchParams.get('kind')) ? url.searchParams.get('kind') : 'movies';
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
    if (path === '/api/player/cmd' && req.method === 'POST') { if (await limited(env.RL_DEVICE, 'cmd:' + ip)) return json({ error: 'Troppe richieste' }, 429); return playerCmdAck(req, env, ip); }
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
      // Kairos TV ha la sua interfaccia dentro l'APK (repository kairos-tv): niente interfaccia della Pro e solo il suo APK
      const who = appFrom(req, null), prem = who === 'prem', ktv = who === 'ktv' || prem, xc = who === 'xc', plus = who === 'plus', nova = who === 'nova';
      // politica degli aggiornamenti del profilo dell'app (solo le due voci pubbliche): serve a Kairos Nova, che non si registra
      const prof = rcProfiles(s)[who] || {}, policy = {}; for (const k of ['bgupd', 'force']) if (prof[k] !== undefined) policy[k] = prof[k];
      return json({
        ui: env.UI_VERSION && !ktv && !xc && !plus && !nova ? { version: env.UI_VERSION, url: '/app/index.html' } : null,
        apk: nova ? await novaFeed() : plus ? await plusFeed(s) : xc ? await xcFeed(s) : prem ? await premFeed() : ktv ? await ktvFeed(s) : await latestApk(env, s),
        policy,
      }, 200, { 'Cache-Control': 'no-store' });
    }
    return json({ error: 'Non trovato' }, 404);
  }

  /* ---------- autorizzazione dei download dello Store (pubblica, vedi store.js) ---------- */
  if (path === '/api/tg/hook' && req.method === 'POST') return tgHook(req, env, ctx, ip, notifyH(env)); // webhook del bot Telegram
  if (path.startsWith('/api/store/')) return storeApi(req, env, ctx, url, ip, { sellerOf: (c) => sellerOf(env, c), sellerName: (id) => sellerNameOf(env, id), sellerActive: (id) => (id ? agentChainActive(env, +id) : true), storeCap: (id, def) => storeCapOf(env, id, def), sellerChain: (r) => sellerChain(env, r), smsAgents: (app, ids) => storeSmsAgents(env, app, ids), waitMin: async () => cleanReqWait((await getSettings(env)).reqWait).store, waitTxt });

  /* ---------- informativa privacy e condizioni (pubblica, la apre anche l'app) ---------- */
  if ((path === '/privacy' || path === '/privacy/') && (req.method === 'GET' || req.method === 'HEAD')) return privacyPage(env);

  /* ---------- file OpenVPN dell'app MirkoTeam ospitato da KAIROS (link segreto, vedi Pannello ORCP → VPN) ---------- */
  if (path.startsWith('/ovpn/') && req.method === 'GET') { const r = await ovpnFile(env, path, WOLF_H); if (r) return r; }

  /* ---------- link puliti: APK delle app e pagina dello store serviti da qui (nessun nome nel link) ---------- */
  if (path.startsWith('/get/') || path === '/store' || path.startsWith('/store/')) return cleanLinks(req, url, path);

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
    catch (e) { if (e instanceof HttpErr) return json({ error: e.message, ...(e.extra || {}) }, e.status); throw e; }
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
      const r = await fetch(url, { headers: { 'User-Agent': 'KairosPanel' }, signal: AbortSignal.timeout(4000), cf: { cacheTtl: 300, cacheEverything: true } });
      if (r.ok) { const j = await r.json(); v = { version: String(j.version || '').replace(/^v/i, '').slice(0, 20), date: String(j.date || '').slice(0, 40), url: /^https:\/\//.test(j.url || '') ? String(j.url).slice(0, 500) : apk }; }
    } catch {}
  }
  liteMem = { t: now(), k: url, v };
  return v;
}
/** manutenzione: l'app è bloccata per tutti tranne i clienti scelti nel pannello (P = abbonamento principale) */
const maintAgOf = (s, P) => P && +P.owner_id ? Object.values(s.maintAg || {}).find((x) => x && x.on && (x.owners || []).includes(+P.owner_id) && !(x.allow || []).includes(P.id)) : null;
const maintFor = (s, P) => !!((s.maint && s.maint.on && P && !(s.maint.allow || []).includes(P.id)) || maintAgOf(s, P));
const maintMsgFor = (s, P) => { const a = !(s.maint && s.maint.on && P && !(s.maint.allow || []).includes(P.id)) && maintAgOf(s, P); return (a ? a.msg : s.maint && s.maint.msg) || MAINT_MSG; };
const MAINT_MSG = 'Servizio in manutenzione: torna disponibile a breve. Grazie per la pazienza!';
/** quale app si collega: Kairos Lite si presenta con «KairosLite/x.y» (e versione «lite x.y»),
    Kairos TV con «KairosPlayer/x.y KairosTV/x.y», Kairos Pro solo con «KairosPlayer/x.y».
    Chiavi interne: 'tv' = Kairos Pro (nome storico), 'ktv' = Kairos TV, 'lite' = Kairos Lite, 'xc' = Kairos XC
    (Kairos XC si presenta con «KairosTV/x.y KairosXC/x.y» e versione «xc x.y»: va riconosciuta prima di Kairos TV) */
const APPS = ['tv', 'lite', 'ktv', 'prem', 'xc', 'plus', 'nova'];
function appFrom(req, b) {
  const ua = req.headers.get('User-Agent') || '', ver = String((b && b.ver) || '');
  if (/KairosLite\//i.test(ua) || /^lite\b/i.test(ver)) return 'lite';
  if (/KairosXC\//i.test(ua) || /^xc\b/i.test(ver)) return 'xc';
  if (/KairosPlus\//i.test(ua) || /^plus\b/i.test(ver)) return 'plus'; // Kairos Plus: «KairosPlus/x.y» e versione «plus x.y»
  if (/KairosNova\//i.test(ua) || /^nova\b/i.test(ver)) return 'nova';
  // Kairos Premium (repository kairos-premium): versione «tv x.y premium», user agent «KairosPremium/x.y»
  if (/KairosPremium\//i.test(ua) || /\bpremium\b/i.test(ver)) return 'prem';
  if (/KairosTV\//i.test(ua)) return 'ktv';
  if (/KairosPlayer\//i.test(ua) || ver) return 'tv';
  return '';
}
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
  { const app = appFrom(req, b); if (app && d.app !== app) { d.app = app; ctx.waitUntil(env.DB.prepare('UPDATE devices SET app = ? WHERE id = ?').bind(app, d.id).run()); } }
  ctx.waitUntil(presenceFromRegister(env, d, b, ip, cfOf(req)));

  // un dispositivo collegato usa stato, scadenza, profili e limiti del suo principale; le playlist e il lettore
  // anche, salvo «gestione indipendente» (allora sono i suoi). Impostazioni e messaggi partono insieme al principale
  const sP = getSettings(env), msgP = deviceMessages(env, d.id, d.parent || d.id);
  sP.catch(() => {});
  const P = await primaryOf(env, d);
  const Ppls = P ? await unseal(env, P.playlists).catch(() => []) : [];
  const s = await sP;
  let status = P ? statusOf(P, Ppls) : 'pending';
  const { C, pls } = status === 'active' ? await effOf(env, d, P, Ppls) : { C: P, pls: [] };
  if (status === 'active' && maintFor(s, P)) status = 'maintenance';
  const eff = rcEffective(s, d, appFrom(req, b) || appOfVer('', d.app));
  const out = { status, ...(status === 'maintenance' ? { maintMsg: maintMsgFor(s, P) } : {}), name: P ? P.name : '', expires: P ? P.expires : '', settings: publicSettings(s), playlists: status === 'active' ? await portalsOf(env, pls) : [], messages: await msgP, rc: eff.rc, rcv: eff.rcv };
  if (status === 'active') {
    [out.account, out.vpn, out.af] = await Promise.all([accountOf(env, P, d, pls, C), vpnOf(env, P, d), acctFp(P)]);
    out.perms = permsOf(P); // i collegati ereditano i permessi del principale
    if (s.aiOff) out.perms.ai = false; // assistente spento dal pannello
    out.addons = addonsFor(s, P); out.adg = P.addons || ''; // add-on (i collegati usano quelli del principale)
  }
  return json(out);
}
/* messaggi del fornitore per questo dispositivo (tutti + personali + quelli del cliente principale, non scaduti) */
/** messaggi per il pannello: quelli di gruppo (stesso «grp») diventano una riga sola con l'elenco dei destinatari */
function msgGroups(rows) {
  const out = [], by = new Map();
  for (const r of rows) {
    if (!r.grp) { out.push({ ...r, targets: [r.target] }); continue; }
    const g = by.get(r.grp); if (g) { g.targets.push(r.target); continue; }
    const x = { ...r, target: 'group', targets: [r.target] }; by.set(r.grp, x); out.push(x);
  }
  return out;
}
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
  { const w = await reqWait(env, 'report', [d.id, P.id]); if (w) return w; }
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
  if (path === '/link-login' && m === 'POST') return linkLogin(req, env, ip, ctx);

  // la sessione e, nello stesso viaggio, impostazioni e agenti (servono quasi a ogni richiesta del pannello)
  const pre = cookieOf(req) ? Promise.all([cfgRows(env), agentsAll(env)]).catch(() => {}) : null;
  const ses = await getSession(req, env);
  if (!ses) throw new HttpErr(401, 'Sessione scaduta');
  await pre;
  // rinnovo automatico: chi usa il pannello resta collegato (al massimo un aggiornamento ogni 6 ore; in sottofondo)
  if (ses.expires - now() < SESSION_TTL * 1000 - 6 * 3600e3 && path !== '/logout') {
    ctx.waitUntil(env.DB.prepare('UPDATE sessions SET expires = ? WHERE id = ?').bind(now() + SESSION_TTL * 1000, ses.id).run().catch(() => {}));
    RENEW.set(req, cookieOf(req));
  }
  if (ses.role === 'agent') return agentRoutes(req, env, url, path, ses, ip, ctx);
  // «Entra per assistenza»: il titolare opera nel pannello di un suo agente (solo il titolare; le azioni restano registrate come assistenza)
  const assistId = req.headers.get('X-Assist');
  if (assistId && /^\d+$/.test(assistId)) {
    const ag = (await agentsAll(env)).find((a) => a.id === +assistId);
    if (!ag) throw new HttpErr(404, 'Agente non trovato');
    return agentRoutes(req, env, url, path, { ...ses, role: 'agent', admin_id: ag.id, assist: true, assistBy: ses.username }, ip, ctx);
  }
  return adminRoutes(req, env, url, path, ses.username, ip, ctx, ses);
}
/* ======================================================================
   AGENTI (reseller): entrano nel pannello con le loro credenziali (2FA facoltativa) e vedono SOLO i propri clienti
   e quelli dei loro sotto-agenti. Cosa possono fare lo decide chi li ha creati.
   ====================================================================== */
const AGENT_FLAGS = ['create', 'renew', 'disable', 'delete', 'kick', 'playlists', 'clientPerms', 'vpn', 'link', 'account', 'ai',
  'dash', 'online', 'errors', 'reports', 'contentReq', 'addonReq', 'messages', 'store', 'vod', 'activity', 'storeAll', 'subClients', 'maint', 'players', 'dlcodes', 'appstore', 'lines', 'appsOp', 'appk', 'armada', 'armadaTrial', 'storm', 'stormTrial', 'wolf', 'mxp', 'oxp', 'oxpNew', 'ro', 'slt'];
const AGENT_DEF = { create: true, renew: true, disable: true, delete: false, kick: true, playlists: true, clientPerms: false, vpn: false, link: true, account: false, ai: false,
  dash: true, online: false, errors: false, reports: false, contentReq: false, addonReq: false, messages: false, store: false, vod: false, activity: false,
  storeAll: false, subClients: true, maint: false, players: false, dlcodes: true, appstore: false, lines: false, appsOp: false, appk: false, armada: false, armadaTrial: false, armadaCredits: 0, storm: false, stormTrial: false, stormCredits: 0, wolf: false, ro: false, slt: false, mxp: false, oxp: false, oxpNew: false, addons: [], storeApps: ['*'], appsAllow: ['*'], dlcAllow: ['*'], kAllow: ['*'], orbDns: ['*'], mxDns: ['*'], maxConn: 1 };
/** app dello store che l'agente può approvare: ['*'] = tutte */
function storeAppsList(v) {
  if (!Array.isArray(v)) return ['*'];
  const out = [...new Set(v.map((x) => str(x, 80)).filter(Boolean))].slice(0, 100);
  return out.includes('*') ? ['*'] : out;
}
/* app Kairos (link per scaricarle e codice Downloader): quali vede l'agente lo decide il titolare (kAllow) */
const KAIROS_APPS = [['pro', 'Kairos Pro'], ['tv', 'Kairos TV'], ['prem', 'Kairos Premium'], ['lite', 'Kairos Lite'], ['xc', 'Kairos XC'], ['plus', 'Kairos Plus'], ['nova', 'Kairos Nova'], ['store', 'Kairos Store']];
function kairosAppsOf(s) {
  return [
    ['pro', s.apkUrl || '', s.downloaderCode || ''], ['tv', s.ktvApkUrl || KTV_APK, s.ktvDownloaderCode || ''], ['prem', PREM_APK, s.premDownloaderCode || ''], ['lite', s.liteApkUrl || LITE_APK, s.liteDownloaderCode || ''],
    ['xc', s.xcApkUrl || XC_APK, s.xcDownloaderCode || ''], ['plus', s.plusApkUrl || PLUS_APK, s.plusDownloaderCode || ''], ['nova', NOVA_APK, s.novaDownloaderCode || ''], ['store', '', s.storeDownloaderCode || ''],
  ].map(([k, apk, code]) => ({ key: k, name: KAIROS_APPS.find((x) => x[0] === k)[1], apk, code }));
}
const storeAppOk = (list, app) => list.includes('*') || list.some((x) => x.toLowerCase() === String(app || '').toLowerCase());
/** DNS che un agente può usare per OrbixPlay (scelti dal titolare per nome) e MaxPlayer (per id del dominio); ['*'] = tutti */
const agOrbList = (s, allow) => (((s.playersCfg || {}).orbix) || []).filter((x) => storeAppOk(Array.isArray(allow) ? allow : ['*'], x.name));
const agMxList = (doms, allow) => doms.filter((x) => storeAppOk(Array.isArray(allow) ? allow : ['*'], x.id));
/** «OrbixPlay e MaxPlayer» nel pannello dell'agente: solo i DNS che gli hai concesso (per nome) e i codici cliente
    dei soli fornitori di quei DNS. Uno slot con il link (il DNS del fornitore) si abbina per host; senza link per nome.
    mxAll = domini di MaxPlayer (null se non disponibili: con DNS MaxPlayer limitati gli slot MaxPlayer restano nascosti) */
function agPlayers(env, s, P, mxAll) {
  const c = s.playersCfg || {}, show = !!c.showDnsAgents, orb = agOrbList(s, P.orbDns);
  const hn = (x) => String(x || '').trim().replace(/^https?:\/\//i, '').split(/[:/]/)[0].toLowerCase(), lc = (x) => String(x || '').trim().toLowerCase();
  const allO = !Array.isArray(P.orbDns) || P.orbDns.includes('*'), allM = !Array.isArray(P.mxDns) || P.mxDns.includes('*');
  const mx = allM ? [] : agMxList(Array.isArray(mxAll) ? mxAll : [], P.mxDns);
  const ok = (x) => {
    const h = hn(x.link), n = lc(x.name);
    if (x.app === 'orbix') return allO || orb.some((d) => (h ? hn(d.host) === h : !!n && lc(d.name).includes(n)));
    return allM || mx.some((d) => (h ? lc(d.domain) === h : !!n && lc(d.label).includes(n)));
  };
  return { orbix: !!env.ORBIX_KEY, max: !!env.MAXPLAYER_KEY, dns: { orbix: orb.map((x) => (show ? { name: x.name, host: x.host } : { name: x.name })), max: [] }, showDnsAgents: show,
    codes: c.codes || { orbix: '265847', max: '265847' }, slots: slotsOf(c).filter(ok).map((x) => (show ? x : { ...x, link: '' })) };
}
function agentPerms(src) {
  let o = {}; try { o = typeof src === 'string' ? JSON.parse(src || '{}') : src || {}; } catch {}
  const p = { ...AGENT_DEF };
  for (const k of AGENT_FLAGS) if (typeof o[k] === 'boolean') p[k] = o[k];
  p.addons = addonsList(o.addons || []);
  p.storeApps = storeAppsList(o.storeApps);
  p.appsAllow = storeAppsList(o.appsAllow); // app di «Attiva app» che l'agente può vedere/usare (['*'] = tutte)
  p.dlcAllow = storeAppsList(o.dlcAllow); // codici downloader che vede (per nome; ['*'] = tutti)
  p.kAllow = storeAppsList(o.kAllow).filter((x) => x === '*' || KAIROS_APPS.some((k) => k[0] === x)); // app Kairos di cui vede link e codice
  p.orbDns = storeAppsList(o.orbDns); // DNS di OrbixPlay che può usare per le attivazioni (per nome; ['*'] = tutti). Ne vede solo il nome
  p.mxDns = storeAppsList(o.mxDns); // DNS (domini) di MaxPlayer che può usare (per id; ['*'] = tutti). Ne vede solo il nome
  p.maxConn = Math.max(1, Math.min(MAX_CONN, parseInt(o.maxConn, 10) || 1));
  for (const k of ['armadaCredits', 'stormCredits']) p[k] = Math.max(0, Math.min(100000, Math.round((parseFloat(o[k]) || 0) * 100) / 100)); // crediti Armada/Storm del titolare al mese (0 = nessuno)
  return p;
}
/** permessi richiesti per un sotto-agente: mai più di quelli di chi lo crea */
function agentPermsWithin(req, top) {
  const p = agentPerms(req);
  if (!top) return p;
  for (const k of AGENT_FLAGS) if (!top[k]) p[k] = false;
  p.addons = p.addons.filter((x) => top.addons.includes(x));
  if (!top.storeApps.includes('*')) p.storeApps = p.storeApps.includes('*') ? [...top.storeApps] : p.storeApps.filter((x) => storeAppOk(top.storeApps, x));
  if (!top.appsAllow.includes('*')) p.appsAllow = p.appsAllow.includes('*') ? [...top.appsAllow] : p.appsAllow.filter((x) => storeAppOk(top.appsAllow, x));
  for (const k of ['dlcAllow', 'kAllow', 'orbDns', 'mxDns']) if (!top[k].includes('*')) p[k] = p[k].includes('*') ? [...top[k]] : p[k].filter((x) => storeAppOk(top[k], x));
  p.maxConn = Math.min(p.maxConn, top.maxConn);
  p.armadaCredits = Math.min(p.armadaCredits, top.armadaCredits);
  p.stormCredits = Math.min(p.stormCredits, top.stormCredits);
  return p;
}
/** tutti gli agenti (una lettura per richiesta; chi modifica gli agenti chiama memoDrop(env, 'ags')). Copia nuova a ogni chiamata */
const agentsAll = async (env) => (await reqMemo(env, 'ags', async () => ((await env.DB.prepare("SELECT id, username, email, parent_id, max_clients, can_agents, perms, servers, active, disabled_by, notes, last_seen, created_at, totp_on, store_code, store_max, pw_seal FROM admins WHERE role = 'agent' ORDER BY id").all()).results) || [])).map((a) => ({ ...a }));
/** id dell'agente e di tutti i suoi sotto-agenti (a qualsiasi livello) */
function agentTree(all, rootId) {
  const out = [rootId], seen = new Set(out);
  for (let i = 0; i < out.length; i++) for (const a of all) if (a.parent_id === out[i] && !seen.has(a.id)) { seen.add(a.id); out.push(a.id); }
  return out;
}
/** agenti che gestiscono le richieste dei loro store per quell'app (app null = per almeno un'app) e ricevono gli avvisi:
 *  attivi con tutta la catena sopra di loro; l'elenco «App dello store che può approvare» limita le app.
 *  Le richieste degli store attivati con il loro codice gli arrivano sempre (prima serviva anche il permesso
 *  «Download store», spento di serie: senza, la richiesta restava ferma e nessuno veniva avvisato) */
async function storeSmsAgents(env, app, ids, all) {
  all = all || (await agentsAll(env));
  const by = new Map(all.map((a) => [a.id, a])), out = [];
  for (const id of ids) {
    const A = by.get(id);
    if (!A || !(await agentChainActive(env, id, all))) continue;
    let P = agentPerms(A.perms);
    for (let x = by.get(A.parent_id), n = 0; x && n < 20; x = by.get(x.parent_id), n++) P = agentPermsWithin(P, agentPerms(x.perms));
    if (app === null || storeAppOk(P.storeApps, app)) out.push(id);
  }
  return out;
}
/** collegamenti per gli avvisi (Telegram, notifiche): chi è titolare, quali agenti possono ricevere, come si decide */
const notifyH = (env) => ({
  owners: async () => ((await env.DB.prepare("SELECT id, username FROM admins WHERE role <> 'agent' AND active <> 0").all()).results) || [],
  eligible: (app, ids) => storeSmsAgents(env, app, ids),
  agents: () => storeSmsAgentList(env),
  decide: storeDecide,
  /** per una richiesta: quali agenti la riguardano (il venditore e chi sta sopra di lui); nessuno se è del titolare */
  sellerChain: (r) => sellerChain(env, r),
  /** il titolare vuole gli avvisi anche per le richieste con il codice di un agente? */
  agentAlerts: () => storeAgentAlerts(env),
});
async function sellerChain(env, r) {
  const id = +(r && r.seller) || 0; if (!id) return [];
  const by = new Map((await agentsAll(env)).map((a) => [a.id, a])), out = [];
  for (let a = by.get(id), n = 0; a && n < 20; a = by.get(a.parent_id), n++) out.push(a.id);
  return out;
}
storeHooks({
  created: (env, r, origin, ip) => notifyNew(env, r, origin, ip, notifyH(env)),
  decided: (env, r, st, via, who) => notifyDecided(env, r, st, via, who),
  activated: (env, d, origin, ip) => notifyActivated(env, d, ip, notifyH(env)),
});
/** elenco degli agenti per la scheda SMS del pannello del titolare */
async function storeSmsAgentList(env) {
  const all = await agentsAll(env), ok = new Set(await storeSmsAgents(env, null, all.map((a) => a.id), all));
  return all.map((a) => ({ id: a.id, username: a.username, store: ok.has(a.id), active: !!a.active }));
}
/* ---- codice venditore dello Store: corto, senza lettere ambigue; il cliente lo scrive nello Store (o arriva col link) ---- */
const SELLER_ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const SELLER_RE = /^[A-Z0-9]{3,8}$/; // scelto dal titolare: 3-8 lettere/cifre; quelli generati sono 4 caratteri senza lettere ambigue
function sellerCodeGen() { const b = rand(4); let o = ''; for (let i = 0; i < 4; i++) o += SELLER_ALPHA[b[i] % SELLER_ALPHA.length]; return o; }
const sellerNorm = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
/** codice venditore del titolare (creato la prima volta che serve) */
async function sellerOwnerCode(env) {
  const s = await getSettings(env);
  if (SELLER_RE.test(s.storeOwnerCode || '')) return s.storeOwnerCode;
  let c = sellerCodeGen(); for (let i = 0; i < 20 && (await env.DB.prepare('SELECT id FROM admins WHERE store_code = ?').bind(c).first()); i++) c = sellerCodeGen();
  await settingsPatch(env, { storeOwnerCode: c });
  return c;
}
/** codice venditore di un agente (creato la prima volta che serve) */
async function sellerAgentCode(env, A) {
  if (SELLER_RE.test(A.store_code || '')) return A.store_code;
  const own = (await getSettings(env)).storeOwnerCode || '';
  let c = sellerCodeGen(); for (let i = 0; i < 20 && (c === own || (await env.DB.prepare('SELECT id FROM admins WHERE store_code = ?').bind(c).first())); i++) c = sellerCodeGen();
  await env.DB.prepare('UPDATE admins SET store_code = ? WHERE id = ?').bind(c, A.id).run();
  memoDrop(env, 'ags');
  A.store_code = c;
  return c;
}
/** nome del venditore da id (0 = titolare, col nome dello store) */
async function sellerNameOf(env, id) {
  if (!id) return (await getSettings(env)).brand || 'Kairos';
  const A = (await agentsAll(env)).find((a) => a.id === +id);
  return A ? A.username : 'agente eliminato';
}
/** tetto di store attivabili di un agente: il suo (store_max) oppure quello di serie delle impostazioni dello Store */
async function storeCapOf(env, id, def) {
  const A = (await agentsAll(env)).find((a) => a.id === +id);
  return A && A.store_max >= 0 ? A.store_max : def;
}
/** da codice venditore a {id, name}: 0 = titolare; null = codice sconosciuto */
async function sellerOf(env, code) {
  const c = sellerNorm(code);
  if (!SELLER_RE.test(c)) return null;
  const s = await getSettings(env);
  if (c === (s.storeOwnerCode || '')) return { id: 0, name: s.brand || 'Kairos' };
  const A = (await agentsAll(env)).find((a) => a.store_code === c);
  if (!A || !(await agentChainActive(env, A.id))) return null;
  return { id: A.id, name: A.username };
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
/** store attivati per agente (una sola query, condivisa nella stessa richiesta) */
const agentStoreCounts = (env) => reqMemo(env, 'agst', async () => {
  const m = new Map();
  try { for (const r of ((await env.DB.prepare('SELECT seller, COUNT(*) AS n FROM store_devices WHERE active = 1 AND seller > 0 GROUP BY seller').all()).results) || []) m.set(r.seller, r.n); } catch {}
  return m;
});
/** clienti principali per agente (una sola query, condivisa nella stessa richiesta) */
const agentCounts = (env) => reqMemo(env, 'agc', async () => {
  const counts = new Map();
  for (const r of ((await env.DB.prepare("SELECT owner_id, COUNT(*) AS n FROM devices WHERE parent = '' AND owner_id > 0 GROUP BY owner_id").all()).results) || []) counts.set(r.owner_id, r.n);
  return counts;
});
/** forAgent: falso = titolare; un elenco di id = un agente che guarda i suoi sotto-agenti (o sé stesso): solo i server
    che lui ha davvero (anche se a un sotto-agente ne era rimasto uno tolto più in alto), con i nomi «da agente» */
async function agentsOut(env, all, onlyIds, forAgent) {
  const lim = Array.isArray(forAgent) ? new Set(forAgent) : null;
  const [dns, counts, armSp, stSp, storeCounts] = await Promise.all([dnsList(env), agentCounts(env), armSpentRows(env, 'armada'), armSpentRows(env, 'storm'), agentStoreCounts(env)]);
  const dn = new Map(dns.map((x, i) => [x.id, forAgent ? { ...x, name: svName(x, i) } : x]));
  const svOk = (x) => dn.has(x) && (!lim || lim.has(x));
  const list = all.filter((a) => !onlyIds || onlyIds.includes(a.id));
  return Promise.all(list.map(async (a) => {
    const tree = agentTree(all, a.id), sv = serverIds(a.servers).filter(svOk);
    return { id: a.id, username: a.username, email: a.email, parentId: a.parent_id, maxClients: a.max_clients, canAgents: !!a.can_agents, perms: agentPerms(a.perms),
      servers: sv, serverNames: sv.map((x) => dn.get(x).name),
      active: !!a.active, notes: a.notes, lastSeen: a.last_seen, createdAt: a.created_at, totp: !!a.totp_on, password: a.pw_seal ? await unseal(env, a.pw_seal).catch(() => '') : '',
      clients: tree.reduce((n, id) => n + (counts.get(id) || 0), 0), ownClients: counts.get(a.id) || 0, subAgents: tree.length - 1,
      armadaUsed: Math.round(armUsedBy(all, armSp, a.id) * 100) / 100, stormUsed: Math.round(armUsedBy(all, stSp, a.id) * 100) / 100, storeCode: await sellerAgentCode(env, a), storeMax: a.store_max >= 0 ? a.store_max : null, stores: storeCounts.get(a.id) || 0 };
  }));
}
/** crea / modifica / elimina agenti. top = agente che sta agendo (null = proprietario) */
async function agentsAdmin(req, env, path, who, ip, top) {
  const m = req.method;
  const all = await agentsAll(env);
  const scope = top ? agentTree(all, top.id).filter((x) => x !== top.id) : all.map((a) => a.id);
  if (path === '/agents' && m === 'GET') return json({ agents: await agentsOut(env, all, scope, top ? serverIds(top.servers) : null) });
  const dnsIds = new Set((await dnsList(env)).map((x) => x.id));
  const clean = async (b, cur) => {
    const o = {};
    if (b.email !== undefined) { const e = str(b.email, 120); if (e && !/^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(e)) throw new HttpErr(400, 'Email non valida'); o.email = e; }
    if (b.notes !== undefined) o.notes = str(b.notes, 300);
    if (b.storeMax !== undefined) { const n = b.storeMax === null || b.storeMax === '' ? -1 : parseInt(b.storeMax, 10); if (!(n === -1 || (n >= 0 && n <= 100000))) throw new HttpErr(400, 'Tetto di store non valido (da 0 a 100000, vuoto = quello di serie)'); if (top) { if (n !== (cur ? cur.store_max : -1)) throw new HttpErr(403, 'Il tetto di store attivabili lo decide il titolare'); } else o.store_max = n; }
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
    // codice venditore scelto dal titolare già alla creazione
    if (!top && b.storeCode !== undefined && String(b.storeCode).trim()) {
      const c = sellerNorm(b.storeCode);
      if (!SELLER_RE.test(c)) throw new HttpErr(400, 'Codice venditore: da 3 a 8 lettere o cifre');
      if (c === ((await getSettings(env)).storeOwnerCode || '') || all.some((x) => x.store_code === c)) throw new HttpErr(400, `Il codice ${c} è già usato`);
      await env.DB.prepare('UPDATE admins SET store_code = ? WHERE id = ?').bind(c, r.id).run();
    }
    memoDrop(env, 'ags');
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
    if (b.storeCode !== undefined) {
      if (top) throw new HttpErr(403, 'Il codice venditore lo decide il titolare');
      const c = sellerNorm(b.storeCode);
      if (!SELLER_RE.test(c)) throw new HttpErr(400, 'Codice venditore: da 3 a 8 lettere o cifre');
      if (c === ((await getSettings(env)).storeOwnerCode || '')) throw new HttpErr(400, 'Questo è il tuo codice venditore: scegline un altro per l\'agente');
      const dup = all.find((x) => x.id !== id && x.store_code === c); if (dup) throw new HttpErr(400, `Il codice ${c} è già di ${dup.username}`);
      o.store_code = c;
    }
    const keys = Object.keys(o);
    if (keys.length) { await env.DB.prepare(`UPDATE admins SET ${keys.map((k) => k + ' = ?').join(', ')} WHERE id = ? AND role = 'agent'`).bind(...keys.map((k) => o[k]), id).run(); memoDrop(env, 'ags'); }
    if (o.pass_hash || o.active === 0 || b.resetTotp === true) await env.DB.prepare('DELETE FROM sessions WHERE admin_id = ?').bind(id).run(); // nuova password, disattivato o 2FA azzerata: si rientra
    await log(env, 'edit', `${who}: modificato l'agente ${A.username}${o.active === 0 ? ' (disattivato)' : o.active === 1 ? ' (attivato)' : ''}${b.resetTotp === true ? ' · 2FA azzerata' : ''}`, ip);
    return json({ ok: true });
  }
  if (m === 'DELETE') {
    // i suoi clienti e i suoi sotto-agenti passano a chi stava sopra di lui
    const up = A.parent_id;
    const devs = (((await env.DB.prepare('SELECT id FROM devices WHERE owner_id = ?').bind(id).all()).results) || []).map((x) => x.id);
    const subs = (((await env.DB.prepare("SELECT id FROM admins WHERE parent_id = ? AND role = 'agent'").bind(id).all()).results) || []).map((x) => x.id);
    const fullA = (await env.DB.prepare('SELECT * FROM admins WHERE id = ?').bind(id).first()) || A; // la riga intera (anche password e TOTP), così il ripristino lo rimette com'era
    await trashPut(env, 'agent', String(id), A.username, fullA, { up, devices: devs, agents: subs }, who);
    await env.DB.batch([
      env.DB.prepare('UPDATE devices SET owner_id = ? WHERE owner_id = ?').bind(up, id),
      env.DB.prepare("UPDATE admins SET parent_id = ? WHERE parent_id = ? AND role = 'agent'").bind(up, id),
      env.DB.prepare('DELETE FROM sessions WHERE admin_id = ?').bind(id),
      env.DB.prepare("DELETE FROM admins WHERE id = ? AND role = 'agent'").bind(id),
      env.DB.prepare('DELETE FROM settings WHERE k IN (?, ?, ?, ?, ?, ?, ?)').bind('wolf:ag:' + id, 'wolf:ag:' + id + ':ses', 'mxp:ag:' + id, 'ro:ag:' + id, 'ro:ag:' + id + ':ses', 'slt:ag:' + id, 'slt:ag:' + id + ':ses'),
    ]);
    memoDrop(env, 'ags', 'agc');
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
    // in assistenza la sessione è quella del titolare: non va chiusa, l'agente semplicemente non è disponibile
    if (ses.assist) throw new HttpErr(403, 'Questo agente è disattivato (o lo è chi l\'ha creato): riattivalo per entrare in assistenza');
    await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(ses.id).run();
    throw new HttpErr(401, 'Account disattivato');
  }
  if (!ses.assist) { const S1 = await getSettings(env); if (S1.agentHost && S1.agentHostOnly && new URL(req.url).hostname.toLowerCase() !== S1.agentHost) { await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(ses.id).run(); throw new HttpErr(401, 'Accedi dall\'indirizzo del pannello che ti è stato dato'); } }
  if (!ses.assist && path !== '/logout') { const am = (await getSettings(env)).agMaint; if (am && am.on) throw new HttpErr(503, am.msg || AGM_MSG, { maint: true }); } // manutenzione del pannello agenti
  const A = all.find((a) => a.id === ses.admin_id);
  const by = new Map(all.map((a) => [a.id, a]));
  let P = agentPerms(A.perms), mine = serverIds(A.servers);
  let canAg = !!A.can_agents;
  for (let x = by.get(A.parent_id), n = 0; x && n < 20; x = by.get(x.parent_id), n++) { P = agentPermsWithin(P, agentPerms(x.perms)); const up = serverIds(x.servers); mine = mine.filter((y) => up.includes(y)); if (!x.can_agents) canAg = false; }
  const Aeff = { ...A, can_agents: canAg ? 1 : 0, perms: JSON.stringify(P), servers: mine.join(',') };
  const tree = agentTree(all, A.id), who = ses.assist ? `Assistenza di ${ses.assistBy} · ${A.username}` : 'Agente ' + A.username;
  const ctree = P.subClients ? tree : [A.id]; // clienti visibili: i suoi e (se concesso) quelli dei sotto-agenti
  const aSes = { ...ses, agent: true, orbDns: P.orbDns, mxDns: P.mxDns };
  // in assistenza: niente «ultimo accesso» falsato e niente modifiche alla sicurezza dell'account dell'agente
  if (ses.assist && /^\/(logout-all|password|totp\/(setup|enable|disable))$/.test(path)) throw new HttpErr(403, 'In assistenza non puoi cambiare password, verifica in due passaggi o sessioni dell\'agente');
  if (!ses.assist && now() - (+A.last_seen || 0) > 5 * 60e3) ctx.waitUntil(env.DB.prepare('UPDATE admins SET last_seen = ? WHERE id = ?').bind(now(), A.id).run());
  if (path === '/password' && m === 'PUT') { const b = await readJSON(req, 4096); if (typeof b.next === 'string' && b.next.length >= 10 && b.next.length <= 200 && (await checkPass(str(b.current, 200), (await env.DB.prepare('SELECT pass_hash FROM admins WHERE id = ?').bind(A.id).first()).pass_hash))) ctx.waitUntil((async () => { await env.DB.prepare('UPDATE admins SET pw_seal = ? WHERE id = ?').bind(await seal(env, b.next), A.id).run(); })()); return adminRoutes(new Request(url.href, { method: 'PUT', body: JSON.stringify({ current: b.current, next: b.next }) }), env, url, path, who, ip, ctx, aSes); } // il nome utente lo cambia solo chi l'ha creato
  if (AGENT_SELF.test(path) && m !== 'GET') return adminRoutes(req, env, url, path, who, ip, ctx, aSes);
  if (path === '/agents' || path.startsWith('/agents/')) { if (!canAg) throw new HttpErr(403, 'Non puoi gestire agenti'); return agentsAdmin(req, env, path, who, ip, Aeff); }
  const dns = (await dnsList(env)).map((x, i) => ({ ...x, name: svName(x, i) })), servers = dns.filter((x) => mine.includes(x.id));
  // l'agente non vede gli indirizzi dei server: solo il nome del server scelto
  let dvOrb = null; // DNS OrbixPlay concessi all'agente (chiavi degli host, in ordine): per indicare quello del cliente senza mostrarlo
  const dnA = new Map(servers.map((y) => [y.host, y])); // solo i server assegnati: degli altri non vede nemmeno il nome
  const dview = (x) => {
    const dn = dnA;
    const { hosts, vpnConf, ...rest } = x;
    if (rest.orbix) { const { h, ...ob } = rest.orbix; rest.orbix = dvOrb && h ? { ...ob, di: dvOrb.indexOf(h) } : ob; } // l'host del DNS OrbixPlay resta nascosto all'agente
    return { ...rest, playlists: (x.playlists || []).map((p) => { const sv = dn.get(hostOf(p)); return { id: p.id, name: p.name, type: p.type, serverId: sv ? sv.id : '', serverName: sv ? sv.name : 'Altro server', username: p.username, password: p.password }; }) };
  };
  const own = async (id) => {
    const d = await env.DB.prepare('SELECT * FROM devices WHERE id = ?').bind(id).first();
    if (!d) return null;
    const P0 = d.parent ? await env.DB.prepare('SELECT owner_id FROM devices WHERE id = ?').bind(d.parent).first() : d;
    return P0 && ctree.includes(+P0.owner_id || 0) ? d : null;
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

  // «Incolla linea»: a quale server assegnato corrisponde l'indirizzo incollato (l'agente ha già l'host, nessun dato nuovo)
  if (path === '/match-server' && m === 'POST') { if (!P.create && !P.playlists) throw new HttpErr(403, 'Non puoi impostare le linee'); const b = await readJSON(req, 1024); const sv = servers.find((x) => sameHostname(x.host, str(b.host, 300))); return json({ server: sv ? { id: sv.id, name: sv.name } : null }); }
  const apv = path.match(/^\/addon-preview\/([a-z0-9-]{3,40})$/);
  if (apv && m === 'GET') { if (!allowedAddons.has(apv[1])) throw new HttpErr(404, 'Anteprima non disponibile'); return adminRoutes(req, env, url, path, who, ip, ctx, aSes); }
  const need = (k, msg) => { if (!P[k]) throw new HttpErr(403, msg || 'Funzione non consentita: chiedila a chi ti ha creato'); };
  // tutti i dispositivi dei suoi clienti (principali e collegati)
  let scopeMem = null;
  const scope = async () => {
    if (scopeMem) return scopeMem;
    const ids = new Set();
    // principali dei suoi agenti e loro collegati: un solo viaggio (prima due, uno dopo l'altro)
    const parts = []; for (let i = 0; i < ctree.length; i += 45) parts.push(ctree.slice(i, i + 45));
    for (const r of await Promise.all(parts.map((part) => { const q = part.map(() => '?').join(','); return env.DB.prepare(`SELECT id FROM devices WHERE parent = '' AND owner_id IN (${q}) UNION ALL SELECT id FROM devices WHERE parent IN (SELECT id FROM devices WHERE parent = '' AND owner_id IN (${q}))`).bind(...part, ...part).all(); })))
      for (const x of (r && r.results) || []) ids.add(x.id);
    return (scopeMem = ids);
  };
  const viaOwner = async (r) => (r instanceof Response ? r.json() : r);
  // «Dati» dei suoi clienti, salute delle loro app, «Invia aggiornamento» ai suoi clienti
  const ains = path.match(/^\/insight\/([A-Za-z0-9_-]{6,20})$/);
  if (ains && m === 'GET') { const d = await own(ains[1]); if (!d) throw new HttpErr(404, 'Cliente non trovato'); return json(await insightFor(env, d, await getSettings(env))); }
  const aup = path.match(/^\/devices\/([A-Za-z0-9_-]{6,20})\/(upd|fix)$/);
  if (aup && m === 'POST') { if (!(await own(aup[1]))) throw new HttpErr(404, 'Cliente non trovato'); return adminRoutes(req, env, url, path, who, ip, ctx, aSes); }
  // Pannello Armada: solo con il permesso del titolare (suoi crediti, tetto mensile, solo le linee create da lui)
  for (const pv of ARM_PVS) if (path.startsWith('/' + pv + '/')) { need(pv, `Non puoi usare il pannello ${armP(pv).name}: chiedilo a chi ti gestisce`); return agentArmada(req, env, url, path, who, ip, ctx, { A, P, all, tree: ctree }, pv); }
  // Pannello OrbixPlay: con il permesso del titolare, solo le playlist dei dispositivi dei suoi clienti e delle sue liste
  if (path.startsWith('/oxp/')) { need('oxp', 'Non puoi usare il Pannello OrbixPlay: chiedilo a chi ti gestisce'); const r = await oxpRoutes(req, env, path, who, ip, WOLF_H, { id: A.id, tree: ctree, canNew: !!P.oxpNew }); if (r) return r; throw new HttpErr(404, 'Funzione non trovata'); }
  // Pannello MaxPlayer: con il permesso del titolare, solo i clienti dell'agente MaxPlayer che gli ha assegnato
  if (path.startsWith('/mxp/')) { need('mxp', 'Non puoi usare il Pannello MaxPlayer: chiedilo a chi ti gestisce'); const r = await mxpRoutes(req, env, path, who, ip, WOLF_H, { id: A.id }); if (r) return r; throw new HttpErr(404, 'Funzione non trovata'); }
  // Pannello WOLF: con il permesso del titolare, sul proprio account reseller WOLF (sue linee e suoi crediti)
  if (path === '/online' && m === 'POST') { if (!['wolf', 'armada', 'storm', 'mxp', 'oxp', 'ro', 'slt'].some((k) => P[k])) throw new HttpErr(403, 'Non hai pannelli esterni collegati'); return onlineRoute(req); }
  if (path.startsWith('/wolf/')) { need('wolf', 'Non puoi usare il pannello WOLF: chiedilo a chi ti gestisce'); const r = await wolfRoutes(req, env, path, who, ip, WOLF_H, { id: A.id }); if (r) return r; throw new HttpErr(404, 'Funzione non trovata'); }
  if (/^\/(ro|slt)\//.test(path)) { need(path.split('/')[1], 'Non puoi usare questo pannello IPTV: chiedilo a chi ti gestisce'); const r = await extRoutes(req, env, path, who, ip, WOLF_H, { id: A.id }); if (r) return r; throw new HttpErr(404, 'Funzione non trovata'); }
  // «Crea lista» su OrbixPlay/MaxPlayer senza cliente Kairos: con il permesso di attivarle dal pannello
  if (path === '/ext-lists' || path.startsWith('/ext-lists/')) { need('players', 'Non puoi creare liste su OrbixPlay e MaxPlayer'); const r = await extListsRoutes(req, env, path, who, ip, { id: A.id, tree: ctree, orbDns: P.orbDns, mxDns: P.mxDns }); if (r) return r; }
  // App → OrbixPlay e MaxPlayer: le liste create sulle app terzi, solo dei suoi clienti
  if (path === '/apps3/lists' && m === 'GET') {
    need('appsOp'); const sc = await scope();
    const days = Math.max(7, Math.min(365, parseInt(url.searchParams.get('days'), 10) || 60));
    return json({ days, lists: (await thirdLists(env, days)).filter((x) => sc.has(x.id)).map(({ ownerId, ...x }) => x) });
  }
  const REQ_PERM = { report: 'reports', content: 'contentReq', addon: 'addonReq', ai: 'ai' };
  // «Online ora» e «Salute delle app» sono del titolare: mostrano tutti i clienti del pannello (totali, più visti, app da aggiornare)
  if ((path === '/presence' || path === '/health') && m === 'GET') throw new HttpErr(403, '«Online ora» è riservata al titolare');
  // Linee collegate: solo le sue (e dei sotto-agenti, se li vede); gli host delle attivazioni automatiche restano nascosti
  if (path === '/line-notes') { const r = await linkedLinesRoutes(req, env, path, who, ip, { id: A.id, tree: ctree }); if (r) return r; } // note KAIROS sulle linee (Armada, MirkoTeam, MaxPlayer, OrbixPlay)
  if (path === '/linked-lines' || path.startsWith('/linked-lines/')) { need('lines', 'Non puoi usare le linee collegate'); const r = await linkedLinesRoutes(req, env, path, who, ip, { id: A.id, tree: ctree, hideHosts: !((await getSettings(env)).playersCfg || {}).showDnsAgents }); if (r) return r; throw new HttpErr(404, 'Non trovato'); }
  // Errori dell'applicazione
  if (path === '/app-errors' && m === 'GET') {
    need('errors'); const sc = await scope(), j = await viaOwner(await adminErrors(req, env, path, url, who, ip));
    const items = j.items.filter((x) => sc.has(x.deviceId)).map((x) => ({ ...x, srv: '' })); // pannelli e DNS: solo il titolare
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
    need('messages'); const b = await readJSON(req, 65536);
    // a un cliente, a un gruppo dei suoi clienti, o a tutti i suoi clienti («mine»); mai a tutti i clienti del pannello
    if (b.target === 'mine' || Array.isArray(b.targets)) {
      const sc = await scope(), mineIds = [...sc];
      const ids = b.target === 'mine' ? mineIds : [...new Set(b.targets.map((x) => str(x, 20)))];
      if (!ids.length || ids.some((x) => !sc.has(x))) throw new HttpErr(400, 'Scegli solo tra i tuoi clienti');
      const prim = b.target === 'mine' ? new Set((((await env.DB.prepare(`SELECT id FROM devices WHERE parent = '' AND id IN (${ids.slice(0, 2000).map(() => '?').join(',')})`).bind(...ids.slice(0, 2000)).all()).results) || []).map((r) => r.id)) : null;
      const list = prim ? ids.filter((x) => prim.has(x)) : ids;
      if (!list.length) throw new HttpErr(400, 'Non hai clienti a cui scrivere');
      return adminRoutes(new Request(url.href, { method: 'POST', body: JSON.stringify({ ...b, target: undefined, targets: list }) }), env, url, path, who, ip, ctx, aSes);
    }
    if (!b.target || b.target === 'all' || !(await own(str(b.target, 20)))) throw new HttpErr(400, 'Scegli uno dei tuoi clienti');
    return adminRoutes(new Request(url.href, { method: 'POST', body: JSON.stringify(b) }), env, url, path, who, ip, ctx, aSes);
  }
  const msm = path.match(/^\/messages\/(\d{1,10})$/);
  if (msm && m === 'DELETE') {
    need('messages'); const r = await env.DB.prepare('SELECT target, grp FROM messages WHERE id = ?').bind(+msm[1]).first();
    if (!r || !(await scope()).has(r.target)) throw new HttpErr(404, 'Messaggio non trovato');
    if (r.grp) { const sc = await scope(); const all = ((await env.DB.prepare('SELECT target FROM messages WHERE grp = ?').bind(r.grp).all()).results) || []; if (all.some((x) => !sc.has(x.target))) throw new HttpErr(403, 'Questo messaggio lo può eliminare solo il titolare'); }
    return adminRoutes(req, env, url, path, who, ip, ctx, aSes);
  }
  // Avvisi su Telegram e notifiche del pannello: solo se il titolare li consente a questo agente
  if (path === '/notify' || path.startsWith('/notify/')) return notifyAdmin(req, env, path, { id: A.id, username: A.username, agent: true }, ip, url.origin, notifyH(env));
  // Download store: vedere e decidere le richieste (le impostazioni restano tue)
  // (solo le app che gli concedi; nello storico solo i download decisi da lui o dai suoi sotto-agenti, salvo «vedere tutto»)
  if (path === '/store' && m === 'GET') {
    const j = await viaOwner(await storeAdmin(req, env, path, who, ip)); // niente permesso a parte: gli store attivati con il suo codice sono suoi
    const mineSet = new Set(ctree);
    // le richieste arrivano a chi ha dato il codice venditore (lui o i suoi sotto-agenti); quelle senza codice sono del titolare
    const reqs = (j.requests || []).filter((r) => storeAppOk(P.storeApps, r.app) && (P.storeAll || mineSet.has(+r.seller || 0) || (r.status !== 'pending' && mineSet.has(+r.by || 0))));
    // store intestati a lui (o ai suoi sotto-agenti): li vede e li può scollegare; il tetto è quello deciso dal titolare
    const stores = (j.devices || []).filter((d) => d.activated && mineSet.has(+d.seller || 0)).map((d) => ({ did: d.did, device: d.device, note: d.note, country: d.country, activated: d.activated, last: d.last, downloads: d.storeDownloads || 0, requests: d.requests, blocked: d.blocked, mine: +d.seller === A.id, sellerName: +d.seller === A.id ? '' : (all.find((x) => x.id === +d.seller) || {}).username || '' }));
    const cap = await storeCapOf(env, A.id, (j.settings && j.settings.storeMax) || 0);
    return json({ requests: reqs.map(({ by, seller, ...x }) => ({ ...x, byMe: by === A.id, mine: seller === A.id })), pending: reqs.filter((r) => r.status === 'pending').length, settings: { approval: !!(j.settings && j.settings.approval), activation: !!(j.settings && j.settings.activation) }, mail: {}, agent: true, apps: P.storeApps, sellerCode: await sellerAgentCode(env, A), stores, storeCap: cap, storesUsed: stores.filter((d) => d.mine).length });
  }
  if (path === '/store/device/unlink' && m === 'POST') {
    const b = await readJSON(req, 4096);
    const sel = await storeDeviceSeller(env, String(b.did || ''));
    if (sel === null || !ctree.includes(sel)) throw new HttpErr(404, 'Store non trovato tra i tuoi');
    return storeAdmin(new Request(req.url, { method: 'POST', headers: req.headers, body: JSON.stringify({ did: b.did }) }), env, path, who, ip, A.id);
  }
  const sdm = path.match(/^\/store\/([A-Za-z0-9_-]{12,40})\/(approve|deny|revoke)$/);
  if (sdm && m === 'POST') {
    const r = await env.DB.prepare('SELECT app, by_admin, seller FROM store_requests WHERE id = ?').bind(sdm[1]).first();
    if (!r || !storeAppOk(P.storeApps, r.app)) throw new HttpErr(404, 'Richiesta non trovata');
    if (!P.storeAll && !ctree.includes(+r.seller || 0)) throw new HttpErr(404, 'Richiesta non trovata'); // non è di un suo cliente
    if (sdm[2] === 'revoke' && !ctree.includes(+r.by_admin || 0)) throw new HttpErr(403, 'Puoi revocare solo i download che hai autorizzato tu');
    return storeAdmin(req, env, path, who, ip, A.id);
  }
  // Altre app (OrbixPlay): solo per i suoi clienti e con il permesso
  const aorb = path.match(/^\/orbix\/([A-Za-z0-9_-]{6,20})$/);
  if (aorb && (m === 'POST' || m === 'DELETE')) { need('players', 'Non puoi inviare le linee alle altre app'); if (!(await own(aorb[1]))) throw new HttpErr(404, 'Cliente non trovato'); return adminRoutes(req, env, url, path, who, ip, ctx, aSes); }
  if (path === '/maxplayer/domains' && m === 'GET') { need('players', 'Non puoi usare le altre app'); return adminRoutes(req, env, url, path, who, ip, ctx, aSes); }
  if (path === '/maxplayer/domains') throw new HttpErr(403, 'I DNS di MaxPlayer li gestisce solo il titolare');
  const amx = path.match(/^\/maxplayer\/([A-Za-z0-9_-]{6,20})$/);
  if (amx && (m === 'POST' || m === 'DELETE')) { need('players', 'Non puoi usare le altre app'); if (!(await own(amx[1]))) throw new HttpErr(404, 'Cliente non trovato'); return adminRoutes(req, env, url, path, who, ip, ctx, aSes); }
  // Manutenzione dei suoi clienti (se concessa): schermata «manutenzione» solo per loro
  if (path === '/agent-maint' && m === 'GET') { need('maint'); const s = await getSettings(env); return json((s.maintAg || {})[A.id] || { on: false, msg: '', allow: [] }); }
  if (path === '/agent-maint' && m === 'PUT') {
    need('maint'); const b = await readJSON(req, 16384), s = await getSettings(env), sc = await scope();
    const allow = [...new Set((Array.isArray(b.allow) ? b.allow : []).map((x) => str(x, 20)).filter((x) => sc.has(x)))].slice(0, 500);
    const on = b.on === true, cur = (s.maintAg || {})[A.id];
    const maintAg = { ...(s.maintAg || {}) };
    if (on) maintAg[A.id] = { on: true, msg: str(b.msg || '', 300), allow, owners: ctree };
    else delete maintAg[A.id];
    const row = await env.DB.prepare("SELECT v FROM settings WHERE k = 'app'").first(); let raw = {}; try { raw = row ? JSON.parse(row.v) : {}; } catch {}
    raw.maintAg = maintAg;
    await env.DB.prepare("INSERT INTO settings (k, v) VALUES ('app', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(JSON.stringify(raw)).run();
    cfgDirty(env);
    if (!!(cur && cur.on) !== on) await log(env, on ? 'off' : 'on', `${who}: manutenzione dei suoi clienti ${on ? 'ATTIVATA' : 'terminata'}`, ip);
    return json(maintAg[A.id] || { on: false, msg: '', allow: [] });
  }
  // Videoteca: solo le linee dei suoi clienti, senza indirizzi
  if (path === '/catalog/sources' || path === '/catalog' || path === '/catalog/info') {
    need('vod');
    const sc = await scope(), all2 = await catalogSources(env), keys = new Set(), dn = dnA;
    const ids = [...sc];
    for (let i = 0; i < ids.length; i += 90) { const part = ids.slice(i, i + 90); for (const d of ((await env.DB.prepare(`SELECT playlists FROM devices WHERE playlists <> '' AND id IN (${part.map(() => '?').join(',')})`).bind(...part).all()).results) || []) for (const p of await unseal(env, d.playlists).catch(() => [])) { if (p.type !== 'xtream' || !p.host || !p.username) continue; const h = hostOf(p); if (h) keys.add((await sha256(`src:${h}|${p.username}|${p.password}`)).slice(0, 16)); } }
    if (path === '/catalog/sources') return json([...all2.values()].filter((x) => keys.has(x.key)).map((x) => ({ key: x.key, label: `${(dn.get(x.host) || {}).name || 'Server'} · ${x.user}`, devices: x.devices })));
    if (!keys.has(str(url.searchParams.get('src') || '', 40))) throw new HttpErr(404, 'Linea non trovata');
    return adminRoutes(req, env, url, path, who, ip, ctx, aSes);
  }
  if (path === '/state' && m === 'GET') {
    // tutto ciò che non dipende dall'elenco dei clienti parte subito, in parallelo (prima erano una decina di attese una dopo l'altra)
    const chunks = (arr, k = 90) => { const o = []; for (let i = 0; i < arr.length; i += k) o.push(arr.slice(i, i + k)); return o; };
    const sP = getSettings(env), meP = agentsOut(env, all, [A.id], mine), snP = canAg ? storeAppNames(env) : Promise.resolve([]), pmP = presenceMap(env);
    // DNS di MaxPlayer limitati: servono i domini per mostrargli solo i codici cliente dei fornitori concessi (al massimo 2,5 s di attesa)
    const mxP = P.players && env.MAXPLAYER_KEY && !P.mxDns.includes('*') ? Promise.race([mxDomains(env).catch(() => null), new Promise((r) => setTimeout(() => r(null), 2500))]) : Promise.resolve(null);
    const agP = canAg ? agentsOut(env, all, tree.filter((x) => x !== A.id), mine) : Promise.resolve([]);
    const actP = P.activity ? env.DB.prepare('SELECT t, type, text FROM activity WHERE ' + ctree.map(() => 'text LIKE ?').join(' OR ') + ' ORDER BY t DESC LIMIT 200').bind(...ctree.map((id) => 'Agente ' + (by.get(id) || {}).username + ':%')).all() : null;
    const msgP = P.messages ? env.DB.prepare('SELECT id, target, title, body, level, created, until, grp FROM messages ORDER BY id DESC LIMIT 3000').all() : null;
    const inboxP = ses.assist ? Promise.resolve([]) : (async () => { try { return ((await env.DB.prepare("SELECT id, title, body, level, created FROM agent_msgs WHERE (target = 'all' OR target = ?) AND (until = 0 OR until > ?) ORDER BY id DESC LIMIT 20").bind(String(A.id), now()).all()).results) || []; } catch { return []; } })();
    // i suoi clienti (principali) e le loro connessioni collegate: una sola query per gruppo di agenti
    const fam = (await Promise.all(chunks(ctree, 45).map((part) => { const q = part.map(() => '?').join(','); return env.DB.prepare(`SELECT * FROM devices WHERE parent = '' AND owner_id IN (${q}) UNION ALL SELECT * FROM devices WHERE parent IN (SELECT id FROM devices WHERE parent = '' AND owner_id IN (${q}))`).bind(...part, ...part).all(); }))).flatMap((r) => r.results || []);
    const rows = fam.filter((d) => !d.parent).sort((a, b) => (+b.created_at || 0) - (+a.created_at || 0)).slice(0, 5000), kept = new Set(rows.map((d) => d.id));
    const kids = fam.filter((d) => d.parent && kept.has(d.parent));
    dvOrb = agOrbList(await sP, P.orbDns).map((x) => hostKey(x.host));
    const devices = withPresence((await Promise.all([...rows, ...kids].map((d) => deviceOut(env, d)))).map(dview), await pmP); // in parallelo
    const byId = new Map(devices.map((x) => [x.id, x]));
    for (const x of devices) if (x.parent) { const p = byId.get(x.parent); x.status = p ? p.status : 'pending'; }
    const [s, meArr, sAll, agList, actR, msgR, inbox] = await Promise.all([sP, meP, snP, agP, actP, msgP, inboxP]);
    const meOut = meArr[0];
    const { password: _pw, ...meSafe } = meOut;
    const sNames = canAg ? sAll.filter((x) => storeAppOk(P.storeApps, x)) : [];
    return stateJson(req, { role: 'agent', user: A.username, me: { ...meSafe, storeCode: await sellerAgentCode(env, A), perms: P, servers: mine, canAgents: canAg, clientsUsed: meOut.clients }, devices, storeAppNames: sNames, dlCodes: P.dlcodes ? dlCodesOf(s).filter((x) => storeAppOk(P.dlcAllow, x.name)) : [], players: P.players ? agPlayers(env, s, P, await mxP) : null, maint: P.maint ? (({ on, msg, allow } = (s.maintAg || {})[A.id] || {}) => ({ on: !!on, msg: msg || '', allow: allow || [] }))() : null,
      agents: agList,
      appLinks: P.appstore ? (Array.isArray(s.appLinks) ? s.appLinks : []).filter((x) => storeAppOk(P.appsAllow, x.name)).map((x) => (/orbix|max\s*-?player/i.test(x.name) ? { name: x.name, url: '' } : x)) : [], // «Attiva app» (OrbixPlay/MaxPlayer senza indirizzo: l'agente le attiva dal pannello): solo le app consentite dal titolare (sola lettura)
      servers: servers.map((x) => ({ id: x.id, name: x.name })), addonCat: addonCfg(s).filter((a) => allowedAddons.has(a.id)),
      // codici Downloader e link delle app Kairos: solo quelli che il titolare gli concede (kAllow)
      settings: (() => { const ok = (k) => storeAppOk(P.kAllow, k); return { brand: s.brand, accent: s.accent, downloaderCode: ok('pro') ? s.downloaderCode || '' : '', storeDownloaderCode: ok('store') ? s.storeDownloaderCode || '' : '', liteDownloaderCode: ok('lite') ? s.liteDownloaderCode || '' : '', ktvDownloaderCode: ok('tv') ? s.ktvDownloaderCode || '' : '', xcDownloaderCode: ok('xc') ? s.xcDownloaderCode || '' : '', plusDownloaderCode: ok('plus') ? s.plusDownloaderCode || '' : '', premDownloaderCode: ok('prem') ? s.premDownloaderCode || '' : '', novaDownloaderCode: ok('nova') ? s.novaDownloaderCode || '' : '', apkUrl: ok('pro') ? s.apkUrl || '' : '' }; })(),
      // app Kairos per gli agenti: sempre visibili (quali le decide il titolare in kAllow), con il link pulito del pannello
      // (/get/<app>.apk: niente nome del titolare nei link) e il codice Downloader se c'è
      kairosApps: kairosAppsOf(s).filter((x) => storeAppOk(P.kAllow, x.key)).map((x) => { const g = { prem: 'premium' }[x.key] || x.key; return { ...x, apk: GET_APK[g] ? `${url.origin}/get/${g}.apk` : x.apk }; }), permKeys: PERM_KEYS, security: { totp: !!(ses.assist ? A.totp_on : ses.totp_on) }, counts: {}, ...(ses.assist ? { assist: { by: ses.assistBy } } : {}),
      activity: actR ? actR.results || [] : [],
      messages: msgR ? msgGroups((msgR.results || []).filter((x) => byId.has(x.target))).slice(0, 150) : [],
      // messaggi del titolare per questo agente (a tutti gli agenti, a lui o al suo gruppo)
      inbox });
  }
  // «Attiva un cliente»: controlla il codice della TV prima di attivarla (trovata? app e modello; libera, già tua o di altri)
  if (path === '/devices/lookup' && m === 'GET') {
    if (!P.create) throw new HttpErr(403, 'Non puoi attivare clienti');
    const code = codeNorm(url.searchParams.get('code'));
    if (!CODE_RE.test(code)) return json({ ok: false, error: 'Il codice è come KXAB-12CD: KX e altre 6 lettere o cifre' });
    const d = await env.DB.prepare('SELECT id, owner_id, parent, active, playlists, name, notes, expires, app, model, created_at FROM devices WHERE code = ?').bind(code).first();
    if (!d) return json({ ok: true, code, found: false });
    const p = await env.DB.prepare('SELECT ver, t FROM presence WHERE device_id = ?').bind(d.id).first().catch(() => null);
    const app = appOfVer(p && p.ver, d.app);
    const info = { app, appName: APP_NAME[app] || 'Kairos', model: str(d.model, 60), seen: +(p && p.t) || +d.created_at || 0 };
    if (ctree.includes(+d.owner_id)) return json({ ok: true, code, found: true, mine: true, id: d.id, name: d.name, ...info });
    const free = !+d.owner_id && !d.parent && !+d.active && !d.playlists && !d.name && !d.notes && !d.expires;
    return json(free ? { ok: true, code, found: true, free: true, ...info } : { ok: true, code, found: true, taken: true });
  }
  if (path === '/devices' && m === 'POST') {
    if (!P.create) throw new HttpErr(403, 'Non puoi attivare clienti');
    const b = await readJSON(req, 65536);
    const code = codeNorm(str(b.code, 20));
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
      try { r = await forward('PUT', '/devices/' + d.id, { name: str(b.name, 60), notes: str(b.notes, 500), expires, active: true, playlists: pls, maxConn, addons, ...(APPS.includes(b.app) ? { app: b.app } : {}) }); } catch (e) { await back(); throw e; }
      if (r.status !== 200) { await back(); return r; }
      return json({ ok: true, id: d.id, code });
    }
    const r = await forward('POST', '/devices', { code, name: str(b.name, 60), notes: str(b.notes, 500), expires, active: true, playlists: pls, maxConn, addons, ...(APPS.includes(b.app) ? { app: b.app } : {}) });
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
        return forward('POST', '/devices/' + t.id + '/link', { primary: str(b.primary, 20), name: typeof b.name === 'string' ? str(b.name, 60) : '' });
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
      if (APPS.includes(b.app)) o.app = b.app;
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
      } else {
        // TV collegata: con il permesso «playlist» l'agente le dà linee sue (gestione indipendente), restando collegata al cliente
        if (typeof b.own === 'boolean' || b.playlists !== undefined) {
          if (!P.playlists) throw new HttpErr(403, 'Non puoi cambiare le playlist');
          o.own = typeof b.own === 'boolean' ? b.own : !!+d.own;
          if (o.own && b.playlists !== undefined) {
            // una riga copiata dal cliente principale (stesso id) senza password tiene la sua
            const par = await env.DB.prepare('SELECT playlists FROM devices WHERE id = ?').bind(d.parent).first();
            o.playlists = plsFrom(b.playlists, [...(await unseal(env, d.playlists).catch(() => [])), ...(par ? await unseal(env, par.playlists).catch(() => []) : [])]);
          }
        }
        for (const k of ['plMode', 'plDefault', 'player']) if (b[k] !== undefined) { if (!P.account) throw new HttpErr(403, 'Non puoi cambiare profili, lettore e visioni'); o[k] = b[k]; }
      }
      if (o.aiLimit !== undefined || o.aiProvider !== undefined) return adminRoutes(new Request(url.href, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(o) }), env, url, path, who, ip, ctx, { ...aSes, aiOk: true });
      return forward('PUT', path, o);
    }
    if (m === 'GET') return json(dview(await deviceOut(env, d)));
  }
  if (path === '/guide' && m === 'GET') {
    const g = guideForAgent(await getSettings(env), A.id);
    if (g && g.noticeAt) { const r = (await guideReads(env)).find((x) => x.agent_id === A.id); g.notice = !r || +r.at < g.noticeAt; }
    return json({ guide: g });
  }
  if (path === '/guide/read' && m === 'POST') { // l'agente ha aperto la guida: l'avviso non si ripresenta (in assistenza il titolare non la segna come letta per lui)
    if (!ses.assist) await env.DB.prepare("INSERT INTO agent_reads (agent_id, k, at) VALUES (?, 'guide', ?) ON CONFLICT(agent_id, k) DO UPDATE SET at = excluded.at").bind(A.id, Date.now()).run();
    return json({ ok: true });
  }
  throw new HttpErr(403, 'Funzione non disponibile per gli agenti');
}

/** funzioni del pannello: le usa il pannello (sessione) e l'API di integrazione (chiave API, ses = null) */
async function adminRoutes(req, env, url, path, who, ip, ctx, ses) {
  const m = req.method;
  if (!ses && API_DENY.test(path)) throw new HttpErr(403, 'Funzione disponibile solo dal pannello');
  if (path === '/api-keys' || path.startsWith('/api-keys/') || path === '/webhook' || path.startsWith('/webhook/')) return apiAdmin(req, env, path, who, ip, ctx);
  if (path.startsWith('/oxp/')) { if (!ses || ses.agent) throw new HttpErr(403, 'Solo il titolare può usare il Pannello OrbixPlay'); const r = await oxpRoutes(req, env, path, who, ip, WOLF_H); if (r) return r; }
  if (path.startsWith('/atx/')) { if (!ses || ses.agent) throw new HttpErr(403, 'Solo il titolare può usare il Pannello Atlantix'); const r = await atxRoutes(req, env, path, who, ip, WOLF_H); if (r) return r; }
  if (path.startsWith('/ora/')) { if (!ses || ses.agent) throw new HttpErr(403, 'Solo il titolare può usare il Pannello ORA'); const r = await oraRoutes(req, env, path, who, ip, WOLF_H); if (r) return r; }
  if (/^\/(ro|slt)\//.test(path)) { if (!ses || ses.agent) throw new HttpErr(403, 'Solo il titolare può usare questo pannello'); const r = await extRoutes(req, env, path, who, ip, WOLF_H); if (r) return r; }
  if (path.startsWith('/orcp/')) { if (!ses || ses.agent) throw new HttpErr(403, 'Solo il titolare può usare il Pannello ORCP'); const r = await orcpRoutes(req, env, path, who, ip, WOLF_H, ctx); if (r) return r; }
  if (path.startsWith('/mxp/')) { if (!ses || ses.agent) throw new HttpErr(403, 'Solo il titolare può usare il Pannello MaxPlayer'); const r = await mxpRoutes(req, env, path, who, ip, WOLF_H); if (r) return r; }
  if (path === '/online' && m === 'POST') { if (!ses || ses.agent) throw new HttpErr(403, 'Funzione disponibile solo dal pannello'); return onlineRoute(req); }
  if (path.startsWith('/wolf/')) { if (!ses || ses.agent) throw new HttpErr(403, 'Solo il titolare può usare WOLF'); const r = await wolfRoutes(req, env, path, who, ip, WOLF_H); if (r) return r; }
  if ((path === '/ext-lists' || path.startsWith('/ext-lists/')) && !(ses && ses.agent)) { if (!ses) throw new HttpErr(403, 'Solo dal pannello'); const r = await extListsRoutes(req, env, path, who, ip, null); if (r) return r; }
  const orb = path.match(/^\/orbix\/([A-Za-z0-9_-]{6,20})$/);
  if (orb && (m === 'POST' || m === 'DELETE')) {
    const d = await env.DB.prepare('SELECT * FROM devices WHERE id = ?').bind(orb[1]).first();
    if (!d) throw new HttpErr(404, 'Cliente non trovato');
    if (m === 'DELETE') return json(await orbixRemove(env, d, who, ip));
    let b = await readJSON(req, 2048);
    let agentLines = null;
    if (ses && ses.agent) { const P0 = d.parent && !ownOf(d) ? await env.DB.prepare('SELECT playlists FROM devices WHERE id = ?').bind(d.parent).first() : d; agentLines = xtreamLines(await unseal(env, (P0 || d).playlists).catch(() => [])); }
    else if (b.resend) { const o = orbixOf(d); if (!o.id) throw new HttpErr(400, 'Nessuna lista OrbixPlay da reinviare per questo cliente'); const l = await resendLine(env, d, o.u); b = { orbixId: o.id, dns: o.dns, username: l.username, password: l.password }; } // «Reinvia»: stessa lista, stesso DNS, stesso dispositivo
    return json(await orbixSend(env, d, b, who, ip, agentLines, ses && ses.agent ? ses.orbDns : null));
  }
  if (path === '/maxplayer/domains' && m === 'GET' && url.searchParams.get('owned') === '1' && !(ses && ses.agent)) {
    // gestione (Gestione app terzi): tutti i DNS che hai su MaxPlayer, anche quelli in attesa di approvazione
    const j = await mxCall(env, 'GET', '/domains/owned');
    return json({ domains: (Array.isArray(j.data) ? j.data : []).map((x) => ({ id: str(String(x.id ?? ''), 30), domain: str(x.domain, 200), port: str(String(x.port ?? ''), 8), https: !!+x.https, label: str(x.label, 60), status: str(x.status, 20) })).filter((x) => x.id) });
  }
  const mdm = path.match(/^\/maxplayer\/domains\/(\d{1,20})$/);
  if (mdm && (m === 'PUT' || m === 'DELETE') && !(ses && ses.agent)) {
    const b = await readJSON(req, 2048);
    if (m === 'PUT') {
      const body = str(b.url, 300) ? mxDomainBody(str(b.url, 300), b.label) : { label: str(b.label, 60) };
      if (!str(b.url, 300)) body.label = str(b.label, 60);
      await mxCall(env, 'PUT', '/domains/' + mdm[1], body);
      mxDomMem.list = null;
      await log(env, 'settings', `${who}: MaxPlayer — modificato il DNS ${str(b.label, 60) || mdm[1]}`, ip);
      return json({ ok: true });
    }
    const to = str(String(b.transferTo ?? ''), 30);
    if (!/^\d{1,20}$/.test(to) || to === mdm[1]) throw new HttpErr(400, 'Scegli il DNS su cui spostare i clienti di quello che cancelli');
    await mxCall(env, 'DELETE', '/domains/' + mdm[1], { transfer_id: to, confirm: true });
    mxDomMem.list = null;
    await log(env, 'del', `${who}: MaxPlayer — cancellato un DNS (clienti spostati sull'altro)`, ip);
    return json({ ok: true });
  }
  if (path === '/maxplayer/domains' && m === 'GET') {
    const list = await mxDomains(env, url.searchParams.get('fresh') === '1');
    return json({ domains: ses && ses.agent ? agMxList(list, ses.mxDns).map((x) => ({ id: x.id, label: x.label || 'DNS ' + x.id })) : list });
  }
  if (path === '/maxplayer/domains' && m === 'POST' && !(ses && ses.agent)) {
    const b = await readJSON(req, 2048);
    const j = await mxCall(env, 'POST', '/domains', mxDomainBody(str(b.url, 300), b.label));
    mxDomMem.list = null;
    await log(env, 'settings', `${who}: MaxPlayer — aggiunto un DNS (${str(b.label, 60) || 'senza nome'})`, ip);
    return json({ ok: true, id: String(j.domain_id || '') });
  }
  const mxm = path.match(/^\/maxplayer\/([A-Za-z0-9_-]{6,20})$/);
  if (mxm && (m === 'POST' || m === 'DELETE')) {
    const d = await env.DB.prepare('SELECT * FROM devices WHERE id = ?').bind(mxm[1]).first();
    if (!d) throw new HttpErr(404, 'Cliente non trovato');
    if (m === 'DELETE') return json(await mxRemove(env, d, who, ip));
    let b = await readJSON(req, 2048);
    let agentLines = null;
    if (ses && ses.agent) { const P0 = d.parent && !ownOf(d) ? await env.DB.prepare('SELECT playlists FROM devices WHERE id = ?').bind(d.parent).first() : d; agentLines = xtreamLines(await unseal(env, (P0 || d).playlists).catch(() => [])); }
    else if (b.resend) { const x = maxpOf(d); if (!x.uid && !x.u) throw new HttpErr(400, 'Nessun account MaxPlayer da reinviare per questo cliente'); const l = await resendLine(env, d, x.u); b = { domain: x.dom, username: l.username, password: l.password }; }
    return json(await mxSend(env, d, b, who, ip, agentLines, ses && ses.agent ? ses.mxDns : null));
  }
  if (path === '/devices/inactive' && m === 'GET' && !(ses && ses.agent)) {
    const r = await inactiveClients(env, { days: url.searchParams.get('days'), never: url.searchParams.get('never') === '1', onlyExp: url.searchParams.get('onlyExp') === '1' });
    return json({ days: r.days, count: r.list.length, sample: r.list.slice(0, 20) });
  }
  // richieste «da attivare»: eliminarne una o più. Niente cestino: non hanno dati, e se l'app è aperta la richiesta ricompare da sola con lo stesso codice
  if (path === '/devices/pending/delete' && m === 'POST' && !(ses && ses.agent)) {
    const b = await readJSON(req, 32 * 1024);
    const ids = [...new Set((Array.isArray(b.ids) ? b.ids : []).map((x) => str(x, 20)).filter((x) => /^[A-Za-z0-9_-]{6,20}$/.test(x)))].slice(0, 500);
    if (!ids.length) throw new HttpErr(400, 'Nessuna richiesta scelta');
    let n = 0;
    for (let i = 0; i < ids.length; i += 90) {
      const part = ids.slice(i, i + 90);
      const r = await env.DB.prepare(`DELETE FROM devices WHERE ${PEND_WHERE} AND id IN (${part.map(() => '?').join(',')})`).bind(...part).run();
      n += +((r && r.meta && r.meta.changes) || 0);
    }
    if (n) await log(env, 'del', `${who}: eliminate ${n === 1 ? '1 richiesta' : n + ' richieste'} da attivare`, ip);
    return json({ deleted: n });
  }
  if (path === '/devices/purge' && m === 'POST' && !(ses && ses.agent)) {
    const b = await readJSON(req, 512);
    const r = await inactiveClients(env, { days: b.days, never: b.never === true, onlyExp: b.onlyExp === true });
    const del = r.list.slice(0, 500);
    for (let i = 0; i < del.length; i += 40) {
      const part = del.slice(i, i + 40), ph = part.map(() => '?').join(','), ids = part.map((x) => x.id);
      // le connessioni collegate tornano «in attesa», come quando elimini un cliente a mano
      await env.DB.batch([
        env.DB.prepare(`UPDATE devices SET parent = '', active = 0, expires = '', playlists = '', profiles = '', own = 0 WHERE parent IN (${ph})`).bind(...ids),
        env.DB.prepare(`DELETE FROM devices WHERE id IN (${ph})`).bind(...ids),
        env.DB.prepare(`DELETE FROM link_pins WHERE device_id IN (${ph})`).bind(...ids),
      ]);
    }
    if (del.length) await log(env, 'del', `${who}: eliminati ${del.length} clienti inattivi da più di ${r.days} giorni${b.onlyExp ? ' (solo scaduti o disattivati)' : ''}${b.never ? ', compresi quelli mai collegati' : ''}`, ip);
    return json({ deleted: del.length, left: Math.max(0, r.list.length - del.length) });
  }
  if (path === '/apps3/lists' && m === 'GET' && !(ses && ses.agent)) {
    const days = Math.max(7, Math.min(365, parseInt(url.searchParams.get('days'), 10) || 60));
    return json({ days, lists: await thirdLists(env, days) });
  }
  if (path === '/apps3/cleanup' && m === 'POST' && !(ses && ses.agent)) {
    const b = await readJSON(req, 512);
    const days = Math.max(7, Math.min(365, parseInt(b.days, 10) || 60));
    return json(await thirdCleanup(env, days, who, ip));
  }
  const amd = path.match(/^\/agent-maint\/(\d{1,9})$/);
  if (amd && m === 'DELETE' && !(ses && ses.agent)) {
    // il titolare spegne la manutenzione accesa da un agente
    const row = await env.DB.prepare("SELECT v FROM settings WHERE k = 'app'").first(); let raw = {}; try { raw = row ? JSON.parse(row.v) : {}; } catch {}
    if (raw.maintAg && raw.maintAg[amd[1]]) { delete raw.maintAg[amd[1]]; await env.DB.prepare("UPDATE settings SET v = ? WHERE k = 'app'").bind(JSON.stringify(raw)).run(); cfgDirty(env); await log(env, 'on', `${who}: spenta la manutenzione accesa da un agente`, ip); }
    return json({ ok: true });
  }
  if (path === '/store' && m === 'GET') {
    // accanto a ogni download deciso da un agente compare il suo nome
    const j = await (await storeAdmin(req, env, path, who, ip, 0, { smsAgentList: () => storeSmsAgentList(env) })).json();
    const names = new Map((await agentsAll(env)).map((a) => [a.id, a.username]));
    for (const r of j.requests || []) { if (r.by) r.byName = names.get(r.by) || 'agente eliminato'; r.sellerName = r.seller ? names.get(r.seller) || 'agente eliminato' : ''; }
    const allAg = await agentsAll(env);
    for (const d of j.devices || []) if (d.activated) { d.sellerName = d.seller ? names.get(d.seller) || 'agente eliminato' : 'tu'; d.sellerOff = !!d.seller && !(await agentChainActive(env, +d.seller, allAg)); }
    j.sellerCode = await sellerOwnerCode(env);
    return json(j);
  }
  if (path === '/store/summary' && m === 'GET') {
    // riepilogo store per il titolare: ogni riga con nome, tetto e stato dell'agente
    const j = await (await storeAdmin(req, env, path, who, ip, 0)).json();
    const all = await agentsAll(env), def = (j.settings && j.settings.storeMax) || 0;
    const seen = new Set((j.sellers || []).map((x) => x.id));
    for (const a of all) if (!seen.has(a.id)) j.sellers.push({ id: a.id, stores: 0, storeDl: 0, last: 0, newest: 0, dl30: 0, dl7: 0, dl1: 0, devs30: 0, pending: 0, apps: [], storeList: [] });
    if (!seen.has(0)) j.sellers.push({ id: 0, stores: 0, storeDl: 0, last: 0, newest: 0, dl30: 0, dl7: 0, dl1: 0, devs30: 0, pending: 0, apps: [], storeList: [] });
    for (const x of j.sellers) {
      const a = x.id ? all.find((y) => y.id === x.id) : null;
      x.name = x.id ? (a ? a.username : 'agente eliminato') : 'tu (titolare)';
      x.capOwn = a && a.store_max >= 0 ? a.store_max : null; // tetto suo (null = quello di serie)
      x.cap = x.id ? (x.capOwn !== null ? x.capOwn : def) : null;
      x.active = x.id ? !!(a && a.active) : true; x.parentId = a ? a.parent_id : 0; x.storeCode = a ? a.store_code : '';
    }
    j.sellers.sort((p, q) => (q.dl30 - p.dl30) || (q.stores - p.stores) || String(p.name).localeCompare(String(q.name)));
    return json(j);
  }
  if (path === '/store' || path.startsWith('/store/')) return storeAdmin(req, env, path, who, ip, 0, { smsAgentList: () => storeSmsAgentList(env) }); // Download store
  if ((path === '/notify' || path.startsWith('/notify/')) && ses && !ses.agent) return notifyAdmin(req, env, path, { id: ses.admin_id, username: ses.username, agent: false }, ip, url.origin, notifyH(env)); // avvisi Telegram / notifiche

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
    // tutto in parallelo: le query al database, la decifratura delle playlist e i controlli delle versioni delle app
    if (ses) agentCounts(env).catch(() => {}); // clienti per agente: parte subito (la usa agentsOut alla fine)
    const settings = await getSettings(env);
    if (+settings.pendTtl) await pendSweep(env, false, +settings.pendTtl).catch(() => {}); // al più ogni 5 minuti
    const [rowsR, activityR, messagesR, agentMsgsR, sessionsR, dnslOwner, wgR, apk, apkF, liteF, ktvF, xcF, plusF, sAppNames, nCounts, onl, agAll, presLast] = await Promise.all([
      env.DB.prepare('SELECT * FROM devices ORDER BY created_at DESC LIMIT 5000').all(),
      env.DB.prepare('SELECT t, type, text, ip FROM activity ORDER BY id DESC LIMIT 200').all(),
      env.DB.prepare('SELECT id, target, title, body, level, created, until, grp FROM messages ORDER BY id DESC LIMIT 3000').all().catch(() => ({ results: [] })),
      env.DB.prepare('SELECT id, target, title, body, level, created, until, grp FROM agent_msgs ORDER BY id DESC LIMIT 1000').all().catch(() => ({ results: [] })),
      ses ? env.DB.prepare('SELECT COUNT(*) AS n FROM sessions WHERE admin_id = ? AND expires > ?').bind(ses.admin_id, now()).first() : null,
      dnsList(env),
      env.DB.prepare('SELECT 1 AS x FROM settings WHERE k = ?').bind('wg').first(),
      latestApk(env, settings), apkFeed(env), liteFeed(settings), ktvFeed(settings), xcFeed(settings), plusFeed(settings),
      storeAppNames(env), newCounts(env), onlineCount(env), ses ? agentsAll(env) : null, presenceMap(env),
    ]);
    const rows = rowsR.results || [];
    const devices = withPresence(await Promise.all(rows.map((d) => deviceOut(env, d))), presLast);
    const byId = new Map(devices.map((x) => [x.id, x]));
    for (const x of devices) if (x.parent) { const p = byId.get(x.parent); x.status = p && !p.parent ? p.status : 'pending'; }
    const activity = activityR.results || [], messages = msgGroups(messagesR.results || []).slice(0, 150), agentMsgs = msgGroups(agentMsgsR.results || []).slice(0, 100), sessions = sessionsR ? sessionsR.n : 0;
    return stateJson(req, {
      settings, devices, activity, messages, agentMsgs, user: who, apk, apkFeed: apkF,
      wgConf: !!wgR,
      security: { totp: !!(ses && ses.totp_on), encryption: !!env.ENC_KEY, access: !!(env.ACCESS_AUD && env.ACCESS_TEAM_DOMAIN), turnstile: !!env.TURNSTILE_SECRET, sessions },
      lite: { apk: settings.liteApkUrl || LITE_APK, feed: liteF },
      ktv: { apk: settings.ktvApkUrl || KTV_APK, feed: ktvF },
      xc: { apk: settings.xcApkUrl || XC_APK, feed: xcF },
      plus: { apk: settings.plusApkUrl || PLUS_APK, feed: plusF },
      ...(await Promise.all([premFeed(), novaFeed()]).then(([pf, nf]) => ({ prem: { apk: PREM_APK, feed: pf }, nova: { apk: NOVA_APK, feed: nf } })).catch(() => ({}))),
      players: { orbix: !!env.ORBIX_KEY, max: !!env.MAXPLAYER_KEY, dns: { orbix: orbixDnsList(settings.playersCfg.orbix, dnslOwner), max: settings.playersCfg.max || [] }, showDnsAgents: !!settings.playersCfg.showDnsAgents, codes: settings.playersCfg.codes || { orbix: '265847', max: '265847' }, slots: slotsOf(settings.playersCfg) },
      dlCodes: dlCodesOf(settings),
      storeOwnerCode: await sellerOwnerCode(env),
      storeAppNames: sAppNames, maintAg: Object.entries(settings.maintAg || {}).filter(([, x]) => x && x.on).map(([id]) => +id),
      counts: { ...nCounts, online: onl }, permKeys: PERM_KEYS, addonCat: addonCfg(settings), role: 'owner', ...(ses ? { agents: await agentsOut(env, agAll) } : {}),
    });
  }

  /* ---------- utenti online ---------- */
  if (path === '/presence' && m === 'GET') return json(await adminPresence(env));
  /* ---------- controllo remoto delle app: solo il titolare, dal pannello ---------- */
  if (path === '/rctl' || path.startsWith('/rctl/')) {
    if (!ses || ses.agent) throw new HttpErr(403, 'Il controllo remoto delle app è riservato al titolare');
    const s0 = await getSettings(env);
    if (path === '/rctl' && m === 'GET') {
      // per ogni dispositivo visto negli ultimi 30 giorni: impostazioni attuali dell'app, configurazione applicata, ultimo comando
      const [pr, dr, cr] = await Promise.all([
        env.DB.prepare('SELECT device_id, app_cfg, rcv, ver, t FROM presence WHERE t > ?').bind(now() - 30 * 864e5).all(),
        env.DB.prepare("SELECT id, app, rc FROM devices WHERE rc <> ''").all(),
        env.DB.prepare('SELECT device_id, cmd, created, sent, done, ok, info FROM remote_cmds WHERE created > ? ORDER BY id DESC LIMIT 3000').bind(now() - 7 * 864e5).all(),
      ]);
      const ov = {}; for (const r of dr.results || []) ov[r.id] = rcDevOf(r);
      const last = {}, pend = {}; for (const c of cr.results || []) { if (!c.done) pend[c.device_id] = (pend[c.device_id] || 0) + 1; if (!last[c.device_id]) last[c.device_id] = { cmd: c.cmd, t: c.created, sent: c.sent, done: c.done, ok: !!c.ok, info: c.info }; }
      const devs = {}; for (const r of pr.results || []) { let cfg = null; try { cfg = r.app_cfg ? JSON.parse(r.app_cfg) : null; } catch {} devs[r.device_id] = { cfg, rcv: r.rcv || '', ver: r.ver || '', t: +r.t }; }
      return json({ apps: rcProfiles(s0), cat: RC_CAT, cmds: RC_CMDS, appNames: APP_NAME, linked: RC_LINKED, devs, over: ov, last, pending: pend });
    }
    const pa = path.match(/^\/rctl\/app\/(tv|ktv|prem|lite|xc|plus|nova)$/);
    if (pa && m === 'PUT') {
      const b = await readJSON(req, 8192), rc = rcClean(b.rc || {}, pa[1]);
      await settingsPatch(env, { rcApp: { ...rcProfiles(s0), [pa[1]]: rc } });
      await log(env, 'settings', `${who}: controllo remoto — profilo ${APP_NAME[pa[1]]} aggiornato (${Object.keys(rc).length} impostazioni imposte)`, ip);
      return json({ ok: true, rc });
    }
    // stesse voci a tutte le app (es. la Home): '' toglie la voce; le app che non la capiscono restano come sono
    if (path === '/rctl/all' && m === 'PUT') {
      const b = await readJSON(req, 8192), src = b.rc && typeof b.rc === 'object' && !Array.isArray(b.rc) ? b.rc : {};
      const keyBase = (k) => k.endsWith(':allow') ? k.slice(0, -6) : k;
      const keys = Object.keys(src).filter((k) => {
        const c = rcCatByKey.get(keyBase(k));
        return c && (!k.endsWith(':allow') || (c[2] === 'sel' && c[7] === 'Lettore'));
      });
      if (!keys.length) throw new HttpErr(400, 'Niente da salvare');
      const prof = rcProfiles(s0);
      for (const a of RC_APPS) {
        const cur = { ...(prof[a] || {}) };
        for (const k of keys) {
          const base = keyBase(k), c = rcCatByKey.get(base); if (!c[4].includes(a)) continue;
          const other = k === base ? `${base}:allow` : base, v = src[k];
          if (v === '' || v === null || v === undefined) { delete cur[k]; if (k === base) delete cur[other]; }
          else { delete cur[other]; cur[k] = v; }
        }
        prof[a] = rcClean(cur, a);
      }
      await settingsPatch(env, { rcApp: prof });
      await log(env, 'settings', `${who}: controllo remoto — ${keys.map((k) => rcCatByKey.get(keyBase(k))[1]).join(', ')} per tutte le app`, ip);
      return json({ ok: true, apps: prof });
    }
    const pd = path.match(/^\/rctl\/device\/([A-Za-z0-9_-]{6,20})$/);
    if (pd && m === 'PUT') {
      const d = await env.DB.prepare('SELECT id, name, code, app FROM devices WHERE id = ?').bind(pd[1]).first();
      if (!d) throw new HttpErr(404, 'Cliente non trovato');
      const b = await readJSON(req, 8192), rc = rcClean(b.rc || {}, d.app);
      await env.DB.prepare('UPDATE devices SET rc = ? WHERE id = ?').bind(Object.keys(rc).length ? JSON.stringify(rc) : '', d.id).run();
      await log(env, 'edit', `${who}: controllo remoto — ${d.name || d.code}: ${Object.keys(rc).length ? Object.keys(rc).length + ' impostazioni imposte' : 'tolte le impostazioni imposte'}`, ip);
      return json({ ok: true, rc, ...rcEffective(s0, { ...d, rc: JSON.stringify(rc) }) });
    }
    if (path === '/rctl/cmd' && m === 'POST') {
      const b = await readJSON(req, 65536);
      const C = RC_CMDS.find((x) => x[0] === b.cmd); if (!C) throw new HttpErr(400, 'Comando non valido');
      let ids = [];
      if (Array.isArray(b.ids)) ids = [...new Set(b.ids.map((x) => str(x, 20)).filter(Boolean))].slice(0, 2000);
      else if (b.app === 'all' || RC_LINKED.includes(b.app)) {
        // tutti i dispositivi di quell'app aperti negli ultimi 7 giorni (gli altri lo ricevono quando riaprono: inutile accodare)
        const rows = ((await env.DB.prepare('SELECT d.id, d.app, p.ver FROM devices d JOIN presence p ON p.device_id = d.id WHERE p.t > ?').bind(now() - 7 * 864e5).all()).results) || [];
        ids = rows.filter((r) => b.app === 'all' || appOfVer(r.ver, r.app) === b.app).map((r) => r.id).slice(0, 5000);
      } else throw new HttpErr(400, 'Indica i clienti (ids) o l\'app');
      if (!ids.length) return json({ ok: true, queued: 0 });
      const args = b.args && typeof b.args === 'object' ? JSON.stringify(b.args).slice(0, 500) : '', t = now();
      // un comando uguale già in attesa non si duplica
      const have = new Set();
      for (let i = 0; i < ids.length; i += 90) { const part = ids.slice(i, i + 90); for (const r of ((await env.DB.prepare(`SELECT device_id FROM remote_cmds WHERE done = 0 AND cmd = ? AND device_id IN (${part.map(() => '?').join(',')})`).bind(C[0], ...part).all()).results) || []) have.add(r.device_id); }
      const todo = ids.filter((x) => !have.has(x));
      for (let i = 0; i < todo.length; i += 50) await env.DB.batch(todo.slice(i, i + 50).map((id) => env.DB.prepare('INSERT INTO remote_cmds (device_id, cmd, args, created, by) VALUES (?, ?, ?, ?, ?)').bind(id, C[0], args, t, who)));
      await log(env, 'edit', `${who}: controllo remoto — «${C[1]}» inviato a ${todo.length} ${todo.length === 1 ? 'dispositivo' : 'dispositivi'}${b.app ? ' (' + (b.app === 'all' ? 'tutte le app' : APP_NAME[b.app]) + ')' : ''}`, ip);
      return json({ ok: true, queued: todo.length, skipped: ids.length - todo.length });
    }
    const pc = path.match(/^\/rctl\/cmds\/([A-Za-z0-9_-]{6,20})$/);
    if (pc && m === 'GET') return json({ items: ((await env.DB.prepare('SELECT id, cmd, created, sent, done, ok, info, by FROM remote_cmds WHERE device_id = ? ORDER BY id DESC LIMIT 30').bind(pc[1]).all()).results) || [] });
    if (pc && m === 'DELETE') { const r = await env.DB.prepare('DELETE FROM remote_cmds WHERE device_id = ? AND done = 0').bind(pc[1]).run(); return json({ ok: true, deleted: (r.meta && r.meta.changes) || 0 }); }
    throw new HttpErr(404, 'Non trovato');
  }
  /* ---------- registro attività: lo svuota solo il titolare dal pannello (mai gli agenti né l'API di integrazione) ---------- */
  // Cestino (solo titolare): elenco, ripristino, eliminazione definitiva
  if (path === '/trash' || path.startsWith('/trash/')) {
    if (ses && ses.agent) throw new HttpErr(403, 'Il cestino è del titolare');
    if (path === '/trash' && m === 'GET') return json({ items: await trashList(env), days: TRASH_DAYS });
    if (path === '/trash' && m === 'DELETE') { const r = await env.DB.prepare('DELETE FROM trash').run(); await log(env, 'del', `${who}: cestino svuotato`, ip); return json({ ok: true, deleted: (r.meta && r.meta.changes) || 0 }); }
    const tm = path.match(/^\/trash\/([A-Za-z0-9_-]{6,20})(\/restore)?$/);
    if (tm && tm[2] && m === 'POST') return json(await trashRestore(env, tm[1], who, ip));
    if (tm && !tm[2] && m === 'DELETE') { const r = await env.DB.prepare('SELECT label, kind FROM trash WHERE id = ?').bind(tm[1]).first(); await env.DB.prepare('DELETE FROM trash WHERE id = ?').bind(tm[1]).run(); if (r) await log(env, 'del', `${who}: eliminato per sempre dal cestino ${TRASH_KIND[r.kind] || r.kind} · ${r.label}`, ip); return json({ ok: true }); }
    throw new HttpErr(404, 'Funzione non trovata');
  }
  // link di accesso personale di un agente (+ codice): vedere, creare/rigenerare, revocare
  const alm = path.match(/^\/agents\/(\d+)\/access-link$/);
  if (alm) {
    if (!ses || ses.agent) throw new HttpErr(403, 'Solo il titolare, dal pannello');
    const A = await env.DB.prepare("SELECT id, username, link_seal, code_seal, link_t, link_used FROM admins WHERE id = ? AND role = 'agent'").bind(+alm[1]).first();
    if (!A) throw new HttpErr(404, 'Agente non trovato');
    const S = await getSettings(env), base = S.agentHost ? 'https://' + S.agentHost : url.origin;
    const out = async (r) => { const k = r.link_seal ? await unseal(env, r.link_seal).catch(() => '') : ''; return json({ on: !!k, url: k ? `${base}/panel/?k=${k}` : '', code: k ? await unseal(env, r.code_seal).catch(() => '') : '', created: r.link_t || 0, used: r.link_used || 0 }); };
    if (m === 'GET') return out(A);
    if (m === 'POST') {
      const k = b64url(rand(24)), AL = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789', rb = rand(10);
      let code = ''; for (let i = 0; i < 10; i++) code += AL[rb[i] % AL.length];
      const r = { link_seal: await seal(env, k), code_seal: await seal(env, code), link_t: now(), link_used: 0 };
      await env.DB.prepare('UPDATE admins SET link_hash = ?, link_seal = ?, code_seal = ?, link_t = ?, link_used = 0 WHERE id = ?').bind(await sha256('lnk:' + k), r.link_seal, r.code_seal, r.link_t, A.id).run();
      memoDrop(env, 'ags');
      await log(env, 'settings', `${who}: ${A.link_seal ? 'nuovo' : 'creato il'} link di accesso dell'agente ${A.username}`, ip);
      return out(r);
    }
    if (m === 'DELETE') {
      await env.DB.prepare("UPDATE admins SET link_hash = '', link_seal = '', code_seal = '', link_t = 0, link_used = 0 WHERE id = ?").bind(A.id).run();
      await env.DB.prepare('DELETE FROM sessions WHERE admin_id = ?').bind(A.id).run(); // chi era dentro viene scollegato
      memoDrop(env, 'ags');
      await log(env, 'settings', `${who}: link di accesso dell'agente ${A.username} revocato (sessioni chiuse)`, ip);
      return json({ ok: true });
    }
  }
  // nuovo codice venditore per un agente (il vecchio smette subito di valere)
  const scm = path.match(/^\/agents\/(\d+)\/store-code$/);
  if (scm && m === 'POST') {
    if (ses && ses.agent) throw new HttpErr(403, 'Solo il titolare');
    const A = (await agentsAll(env)).find((a) => a.id === +scm[1]); if (!A) throw new HttpErr(404, 'Agente non trovato');
    A.store_code = ''; const c = await sellerAgentCode(env, A);
    await log(env, 'settings', `${who}: nuovo codice venditore Store per l'agente ${A.username}`, ip);
    return json({ ok: true, storeCode: c });
  }
  if (path === '/activity' && m === 'DELETE') {
    if (!ses || ses.agent) throw new HttpErr(403, 'Il registro lo può svuotare solo il titolare');
    const days = parseInt(url.searchParams.get('older') || '0', 10);
    if (!(days >= 0 && days <= 3650)) throw new HttpErr(400, 'Giorni non validi');
    const r = days ? await env.DB.prepare('DELETE FROM activity WHERE t < ?').bind(now() - days * 864e5).run() : await env.DB.prepare('DELETE FROM activity').run();
    const n = (r.meta && r.meta.changes) || 0;
    // resta una riga: chi l'ha svuotato e quando (le azioni successive si registrano come sempre)
    await log(env, 'settings', `${who}: registro attività svuotato${days ? ` (voci più vecchie di ${days} ${days === 1 ? 'giorno' : 'giorni'})` : ''} · ${n} ${n === 1 ? 'voce tolta' : 'voci tolte'}`, ip);
    return json({ ok: true, deleted: n });
  }
  /* ---------- «Dati» di un cliente e salute delle app ---------- */
  const ins = path.match(/^\/insight\/([A-Za-z0-9_-]{6,20})$/);
  if (ins && m === 'GET') { const d = await env.DB.prepare('SELECT * FROM devices WHERE id = ?').bind(ins[1]).first(); if (!d) throw new HttpErr(404, 'Cliente non trovato'); return json(await insightFor(env, d, await getSettings(env))); }
  if (path === '/health' && m === 'GET') return json(await healthList(env, await getSettings(env), null));
  if (path === '/guide' && m === 'GET') { const g = guideNorm((await getSettings(env)).guide); return json({ guide: { ...g, readBy: g.noticeAt ? (await guideReads(env)).filter((x) => +x.at >= g.noticeAt).map((x) => String(x.agent_id)) : [], defTitle: GUIDE_DEF_TITLE, defText: GUIDE_DEF_TEXT } }); }
  if (path === '/guide' && m === 'PUT') {
    const b = await readJSON(req, 64 * 1024), cur = guideNorm((await getSettings(env)).guide), g = guideNorm({ ...b, noticeAt: cur.noticeAt });
    if (b.notify === true && g.share !== 'none') g.noticeAt = Date.now(); // «Avvisali all'apertura»: gli agenti scelti vedono «Nuova guida da leggere» finché non la aprono
    if (g.share === 'none') g.noticeAt = 0;
    await settingsPatch(env, { guide: g });
    await log(env, 'settings', `${who}: guida della Panoramica aggiornata (${g.share === 'all' ? 'tutti gli agenti' : g.share === 'some' ? g.agents.length + ' agenti' : 'solo titolare'})`, ip);
    return json({ guide: { ...g, readBy: [], defTitle: GUIDE_DEF_TITLE, defText: GUIDE_DEF_TEXT } });
  }
  if (path === '/health/settings' && m === 'PUT' && !(ses && ses.agent)) {
    const b = await readJSON(req, 1024), s0 = await getSettings(env), h = { on: !!(s0.health && s0.health.on), autoUpd: !!(s0.health && s0.health.autoUpd), autoFix: !!(s0.health && s0.health.autoFix) };
    if (typeof b.on === 'boolean') h.on = b.on; if (typeof b.autoUpd === 'boolean') h.autoUpd = b.autoUpd; if (typeof b.autoFix === 'boolean') h.autoFix = b.autoFix;
    await settingsPatch(env, { health: h });
    await log(env, 'settings', `${who}: salute delle app — controllo ${h.on ? 'attivo' : 'spento'}, aggiornamento automatico ${h.autoUpd ? 'attivo' : 'spento'}, risolvi da solo ${h.autoFix ? 'attivo' : 'spento'}`, ip);
    return json({ ok: true, health: h });
  }
  const fxm = path.match(/^\/devices\/([A-Za-z0-9_-]{6,20})\/fix$/);
  if (fxm && m === 'POST') { const d = await env.DB.prepare('SELECT * FROM devices WHERE id = ?').bind(fxm[1]).first(); if (!d) throw new HttpErr(404, 'Cliente non trovato'); return json(await fixDevice(env, await getSettings(env), d, who, false, url.searchParams.get('soft') === '1')); }
  const upm = path.match(/^\/devices\/([A-Za-z0-9_-]{6,20})\/upd$/);
  if (upm && m === 'POST') {
    const d = await env.DB.prepare('SELECT d.id, d.name, d.code, d.app, p.ver FROM devices d LEFT JOIN presence p ON p.device_id = d.id WHERE d.id = ?').bind(upm[1]).first(); if (!d) throw new HttpErr(404, 'Cliente non trovato');
    // tutte le app Kairos ricevono l'aggiornamento dal pannello: la scaricano in background e propongono «Installa ora»
    const app = appOfVer(d.ver, d.app); if (!RC_LINKED.includes(app)) throw new HttpErr(400, `${APP_NAME[app] || 'Questa app'} non riceve l'aggiornamento dal pannello.`);
    const t = now(); await env.DB.batch([env.DB.prepare('UPDATE devices SET upd_req = ? WHERE id = ? OR parent = ?').bind(t, d.id, d.id)]);
    await log(env, 'edit', `${who}: aggiornamento dell'app inviato a ${d.name || d.code}`, ip);
    return json({ ok: true, t });
  }

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
    const all0 = await wgLocs(env), gone = all0.find((x) => x.id === vl[1]), list = all0.filter((x) => x.id !== vl[1]);
    if (gone) await trashPut(env, 'vpnloc', gone.id, gone.name || gone.id, gone, null, who);
    await env.DB.batch([env.DB.prepare('INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind('wgl', await seal(env, list)), env.DB.prepare("UPDATE devices SET vpn_loc = '' WHERE vpn_loc = ?").bind(vl[1])]);
    await log(env, 'settings', `${who}: località VPN eliminata`, ip);
    return json({ ok: true });
  }

  /* ---------- segnalazioni e richieste di contenuti ---------- */
  if (path === '/requests' || path.startsWith('/requests/')) { const r = await adminRequests(req, env, path, url, who, ip); if (r) return r; }
  if (path === '/app-errors' || path.startsWith('/app-errors/')) { const r = await adminErrors(req, env, path, url, who, ip); if (r) return r; }
  // password delle linee e crediti Armada: solo dal pannello (mai dalle chiavi API di integrazione)
  if (path === '/linked-lines' || path.startsWith('/linked-lines/') || path === '/line-notes') { if (!ses) throw new HttpErr(403, 'Funzione disponibile solo dal pannello'); const r = await linkedLinesRoutes(req, env, path, who, ip, null); if (r) return r; }
  for (const pv of ARM_PVS) if (path.startsWith('/' + pv + '/')) { if (!ses || ses.agent) throw new HttpErr(403, `${armP(pv).name} è riservato al titolare, dal pannello`); const r = await armadaRoutes(req, env, url, path, who, ip, 0, pv); if (r) return r; }

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
    const sat = await saturationList(env, [...saved.map((x) => x.host), ...count.keys()]);
    return json({ saved, hosts, byDev, sat });
  }
  if (path === '/dns/saved' && m === 'POST') {
    const b = await readJSON(req, 4096);
    const host = cleanHost(b.host), name = nameClean(b.name, 40) || new URL(host).hostname;
    const list = await dnsList(env);
    if (list.some((x) => x.host === host)) throw new HttpErr(400, 'Questo DNS è già salvato');
    if (list.length >= 100) throw new HttpErr(400, 'Puoi salvare al massimo 100 DNS');
    const item = { id: b64url(rand(6)), name, host, alts: [], mode: 'auto' };
    list.push(item); await dnsSave(env, list);
    await log(env, 'settings', `${who}: DNS salvato · ${name} (${host})`, ip);
    return json(item);
  }
  const dsm = path.match(/^\/dns\/saved\/([A-Za-z0-9_-]{4,20})$/);
  if (dsm && (m === 'PUT' || m === 'DELETE')) {
    const list = await dnsList(env), i = list.findIndex((x) => x.id === dsm[1]);
    if (i < 0) throw new HttpErr(404, 'DNS non trovato');
    if (m === 'DELETE') { const [x] = list.splice(i, 1); for (const item of list) item.alts = (item.alts || []).filter((id) => id !== x.id); await trashPut(env, 'dns', x.id, `${x.name} (${x.host})`, x, null, who); await dnsSave(env, list); await log(env, 'settings', `${who}: DNS tolto dall'elenco · ${x.name} (i clienti non cambiano)`, ip); return json({ ok: true }); }
    const b = await readJSON(req, 4096);
    if (typeof b.name === 'string') list[i].name = nameClean(b.name, 40) || list[i].name;
    if (typeof b.host === 'string') { const h = cleanHost(b.host); if (list.some((x, j) => j !== i && x.host === h)) throw new HttpErr(400, 'Questo DNS è già salvato'); list[i].host = h; }
    if (b.alts !== undefined) list[i].alts = [...new Set((Array.isArray(b.alts) ? b.alts : []).filter((id) => typeof id === 'string' && id !== list[i].id && list.some((x) => x.id === id)))].slice(0, 4);
    if (b.mode !== undefined) list[i].mode = ['auto', 'main', 'alt'].includes(b.mode) ? b.mode : 'auto';
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
  /* ---------- modifica in massa (solo titolare): lettore, permessi, VPN, visioni, voci imposte solo al cliente ---------- */
  if (path === '/devices/mass' && m === 'POST') {
    if (!ses || ses.agent) throw new HttpErr(403, 'La modifica in massa è riservata al titolare');
    return json(await massEdit(env, await readJSON(req, 65536), who, ip));
  }

  /* ---------- videoteca ---------- */
  if (path === '/catalog/sources' && m === 'GET') {
    const srcs = await catalogSources(env);
    return json([...srcs.values()].map((s) => ({ key: s.key, label: `${s.host.replace(/^https?:\/\//, '')} · ${s.user}`, host: s.host, devices: s.devices })).sort((a, b) => b.devices - a.devices || a.label.localeCompare(b.label)));
  }
  if (path === '/catalog/info' && m === 'GET') {
    try { return json(await adminCatalogInfo(env, url)); }
    catch (e) { if (e instanceof HttpErr) throw e; return json({ error: e && e.name === 'TimeoutError' ? 'Il server non ha risposto entro 20 secondi' : 'Server non raggiungibile' }, 502); }
  }
  if (path === '/catalog' && m === 'GET') {
    try { return json(await adminCatalog(env, url)); }
    catch (e) { if (e instanceof HttpErr) throw e; return json({ error: e && e.name === 'TimeoutError' ? 'Il server non ha risposto entro 20 secondi' : 'Server non raggiungibile' }, 502); }
  }

  if (path === '/messages' && m === 'POST') {
    const b = await readJSON(req, 65536);
    const title = str(b.title, 80), body = str(b.body, 600);
    if (!title && !body) throw new HttpErr(400, 'Scrivi il titolo o il testo del messaggio');
    const level = ['info', 'warn', 'urgent'].includes(b.level) ? b.level : 'info';
    const days = Math.max(0, Math.min(365, +b.days || 0)), until = days ? now() + days * 864e5 : 0;
    // destinatari: tutti, un cliente, oppure un gruppo di clienti scelti (una riga per cliente, stesso «grp»)
    if (Array.isArray(b.targets)) {
      const ids = [...new Set(b.targets.map((x) => str(x, 20)).filter(Boolean))].slice(0, 2000);
      if (!ids.length) throw new HttpErr(400, 'Scegli almeno un cliente');
      const ok = new Set();
      for (let i = 0; i < ids.length; i += 90) { const part = ids.slice(i, i + 90); for (const r of ((await env.DB.prepare(`SELECT id FROM devices WHERE id IN (${part.map(() => '?').join(',')})`).bind(...part).all()).results) || []) ok.add(r.id); }
      const list = ids.filter((x) => ok.has(x)); if (!list.length) throw new HttpErr(400, 'Clienti non trovati');
      const grp = list.length > 1 ? b64url(rand(8)) : '';
      const st = list.map((t) => env.DB.prepare('INSERT INTO messages (target, title, body, level, created, until, grp) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(t, title, body, level, now(), until, grp));
      for (let i = 0; i < st.length; i += 50) await env.DB.batch(st.slice(i, i + 50));
      await log(env, 'msg', `${who}: messaggio inviato a ${list.length === 1 ? 'un cliente' : 'un gruppo di ' + list.length + ' clienti'} · ${title || body.slice(0, 40)}`, ip);
      return json({ ok: true, sent: list.length });
    }
    let target = str(b.target, 20) || 'all';
    if (target !== 'all' && !(await env.DB.prepare('SELECT id FROM devices WHERE id = ?').bind(target).first())) throw new HttpErr(400, 'Dispositivo non trovato');
    await env.DB.prepare('INSERT INTO messages (target, title, body, level, created, until) VALUES (?, ?, ?, ?, ?, ?)').bind(target, title, body, level, now(), until).run();
    await log(env, 'msg', `${who}: messaggio inviato a ${target === 'all' ? 'tutti' : 'un dispositivo'} · ${title || body.slice(0, 40)}`, ip);
    return json({ ok: true, sent: 1 });
  }
  /* ---------- messaggi agli agenti (solo il titolare): a tutti, a uno o a un gruppo ---------- */
  if (path === '/agent-msgs' && m === 'POST' && !(ses && ses.agent)) {
    const b = await readJSON(req, 16384);
    const title = str(b.title, 80), body = str(b.body, 600);
    if (!title && !body) throw new HttpErr(400, 'Scrivi il titolo o il testo del messaggio');
    const level = ['info', 'warn', 'urgent'].includes(b.level) ? b.level : 'info';
    const days = Math.max(0, Math.min(365, +b.days || 0)), until = days ? now() + days * 864e5 : 0;
    const all = await agentsAll(env), known = new Set(all.map((a) => a.id));
    let list = b.target === 'all' ? ['all'] : (Array.isArray(b.targets) ? b.targets : [b.target]).map((x) => parseInt(x, 10)).filter((x) => known.has(x)).map(String);
    list = [...new Set(list)].slice(0, 500);
    if (!list.length) throw new HttpErr(400, 'Scegli almeno un agente');
    const grp = list.length > 1 ? b64url(rand(8)) : '';
    await env.DB.batch(list.map((t) => env.DB.prepare('INSERT INTO agent_msgs (target, title, body, level, grp, created, until) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(t, title, body, level, grp, now(), until)));
    await log(env, 'msg', `${who}: messaggio agli agenti (${list[0] === 'all' ? 'tutti' : list.length === 1 ? 'uno' : 'gruppo di ' + list.length}) · ${title || body.slice(0, 40)}`, ip);
    return json({ ok: true, sent: list.length });
  }
  const agm = path.match(/^\/agent-msgs\/(\d{1,10})$/);
  if (agm && m === 'DELETE' && !(ses && ses.agent)) {
    const r = await env.DB.prepare('SELECT grp FROM agent_msgs WHERE id = ?').bind(+agm[1]).first();
    if (r && r.grp) await env.DB.prepare('DELETE FROM agent_msgs WHERE grp = ?').bind(r.grp).run(); else await env.DB.prepare('DELETE FROM agent_msgs WHERE id = ?').bind(+agm[1]).run();
    return json({ ok: true });
  }
  const mm = path.match(/^\/messages\/(\d{1,10})$/);
  if (mm && m === 'DELETE') {
    // un messaggio di gruppo si elimina per tutti i clienti del gruppo
    const r = await env.DB.prepare('SELECT grp FROM messages WHERE id = ?').bind(+mm[1]).first();
    const rows = ((await (r && r.grp ? env.DB.prepare('SELECT * FROM messages WHERE grp = ?').bind(r.grp) : env.DB.prepare('SELECT * FROM messages WHERE id = ?').bind(+mm[1])).all()).results) || [];
    if (rows.length) await trashPut(env, 'msg', String(mm[1]), (rows[0].title || rows[0].body || 'messaggio').slice(0, 80) + (rows.length > 1 ? ` (${rows.length} clienti)` : ''), rows, null, who);
    if (r && r.grp) await env.DB.prepare('DELETE FROM messages WHERE grp = ?').bind(r.grp).run(); else await env.DB.prepare('DELETE FROM messages WHERE id = ?').bind(+mm[1]).run();
    return json({ ok: true });
  }

  if (path === '/settings' && m === 'PUT') {
    const b = await readJSON(req);
    const s = await getSettings(env);
    for (const k of ['brand', 'tagline', 'accent', 'announcement', 'supportContact', 'downloaderCode', 'storeDownloaderCode', 'liteDownloaderCode', 'ktvDownloaderCode', 'xcDownloaderCode', 'plusDownloaderCode', 'premDownloaderCode', 'novaDownloaderCode']) if (typeof b[k] === 'string') s[k] = str(b[k], k === 'announcement' ? 300 : 80);
    if (typeof b.apkUrl === 'string') { const u = str(b.apkUrl, 500); s.apkUrl = !u || /^https:\/\//.test(u) ? u : s.apkUrl; }
    if (typeof b.plusApkUrl === 'string') { const u = str(b.plusApkUrl, 500); if (u && !/^https:\/\//.test(u)) throw new HttpErr(400, 'Il link di Kairos Plus deve iniziare con https://'); s.plusApkUrl = u; }
    if (typeof b.xcApkUrl === 'string') { const u = str(b.xcApkUrl, 500); if (u && !/^https:\/\//.test(u)) throw new HttpErr(400, 'Il link di Kairos XC deve iniziare con https://'); s.xcApkUrl = u; }
    if (typeof b.ktvApkUrl === 'string') { const u = str(b.ktvApkUrl, 500); if (u && !/^https:\/\//.test(u)) throw new HttpErr(400, 'Il link di Kairos TV deve iniziare con https://'); s.ktvApkUrl = u; }
    if (typeof b.liteApkUrl === 'string') { const u = str(b.liteApkUrl, 500); if (u && !/^https:\/\//.test(u)) throw new HttpErr(400, 'Il link di Kairos Lite deve iniziare con https://'); s.liteApkUrl = u; }
    if (typeof b.allowLocalPlaylists === 'boolean') s.allowLocalPlaylists = b.allowLocalPlaylists;
    if (typeof b.showFootball === 'boolean') s.showFootball = b.showFootball;
    if (typeof b.aiOff === 'boolean') s.aiOff = b.aiOff; // interruttore rapido: assistente IA spento per tutti
    if (b.aiDaily !== undefined) { const n = parseInt(b.aiDaily, 10); if (!(n >= 0 && n <= 1000)) throw new HttpErr(400, 'Domande al giorno: da 0 a 1000'); s.aiDaily = n; }
    if (b.aiProvider !== undefined) { if (!AI_PROVIDERS.includes(b.aiProvider)) throw new HttpErr(400, 'Servizio non valido'); s.aiProvider = b.aiProvider; }
    if (b.dlCodes !== undefined) s.dlCodes = cleanDlCodes(b.dlCodes);
    if (b.storeOwnerCode !== undefined) {
      const c = sellerNorm(b.storeOwnerCode);
      if (!SELLER_RE.test(c)) throw new HttpErr(400, 'Codice venditore: da 3 a 8 lettere o cifre');
      const dup = (await agentsAll(env)).find((x) => x.store_code === c); if (dup) throw new HttpErr(400, `Il codice ${c} è già dell'agente ${dup.username}`);
      s.storeOwnerCode = c;
    }
    if (b.appLinks !== undefined) s.appLinks = cleanAppLinks(b.appLinks);
    let pendNow = 0;
    if (b.pendTtl !== undefined) {
      const h = parseInt(b.pendTtl, 10);
      if (!PEND_TTL.includes(h)) throw new HttpErr(400, 'Tempo non valido per le richieste da attivare');
      if (h !== (+s.pendTtl || 0)) { await log(env, 'settings', `${who}: richieste da attivare non accettate → ${h ? 'si annullano dopo ' + pendTtlTxt(h) : 'restano fino a 30 giorni senza contatti'}`, ip); pendNow = h; }
      s.pendTtl = h;
    }
    if (typeof b.agentHost === 'string') {
      // indirizzo separato da cui entrano gli agenti (così non vedono quello del titolare)
      let h = b.agentHost.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
      if (h && !/^(?=.{4,190}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/.test(h)) throw new HttpErr(400, 'Indirizzo per gli agenti non valido (es. agenti-tuodominio.com)');
      if (h && h === new URL(req.url).hostname.toLowerCase()) throw new HttpErr(400, 'L\'indirizzo degli agenti deve essere diverso da quello che usi tu');
      if (h !== (s.agentHost || '')) await log(env, 'edit', `${who}: indirizzo degli agenti ${h ? 'impostato su ' + h : 'tolto'}`, ip);
      s.agentHost = h; if (!h) s.agentHostOnly = false;
    }
    if (typeof b.agentHostOnly === 'boolean') {
      if (b.agentHostOnly && !s.agentHost) throw new HttpErr(400, 'Imposta prima l\'indirizzo degli agenti');
      if (b.agentHostOnly && new URL(req.url).hostname.toLowerCase() === s.agentHost) throw new HttpErr(400, 'Questa impostazione si cambia dal tuo indirizzo');
      s.agentHostOnly = b.agentHostOnly;
    }
    if (b.reqWait !== undefined) { const was = JSON.stringify(cleanReqWait(s.reqWait)); s.reqWait = cleanReqWait({ ...cleanReqWait(s.reqWait), ...(b.reqWait && typeof b.reqWait === 'object' ? b.reqWait : {}) }); if (JSON.stringify(s.reqWait) !== was) await log(env, 'edit', `${who}: tempi di attesa delle richieste aggiornati`, ip); }
    if (b.agMaint !== undefined) {
      const x = b.agMaint && typeof b.agMaint === 'object' ? b.agMaint : {}, was = !!(s.agMaint && s.agMaint.on), on = x.on === true;
      s.agMaint = { on, msg: nameClean(x.msg, 300) || (s.agMaint && s.agMaint.msg) || '', since: on ? (was ? (s.agMaint.since || now()) : now()) : 0 };
      if (was !== on) await log(env, on ? 'off' : 'on', `${who}: manutenzione del pannello agenti ${on ? 'ATTIVATA' : 'terminata'}`, ip);
    }
    for (const pv of ARM_PVS) { const AP = armP(pv);
      if (typeof b[AP.sUrl] === 'string') { const u = str(b[AP.sUrl], 300).trim(); if (!u) s[AP.sUrl] = ''; else { let x; try { x = new URL(u); } catch {} if (!x || x.protocol !== 'https:' || x.username || x.password) throw new HttpErr(400, `Indirizzo API di ${AP.name} non valido: es. ${AP.url}`); s[AP.sUrl] = x.origin + x.pathname; } }
      if (typeof b[AP.sDns] === 'string') { const u = str(b[AP.sDns], 300).trim().replace(/\/+$/, ''); if (!u) s[AP.sDns] = ''; else { let x; try { x = new URL(/^https?:\/\//i.test(u) ? u : 'http://' + u); } catch {} if (!x) throw new HttpErr(400, 'DNS delle linee non valido: es. http://dns.esempio.com:8080'); s[AP.sDns] = x.origin; } }
    }
    if (b.playersCfg !== undefined) {
      const c = b.playersCfg && typeof b.playersCfg === 'object' ? b.playersCfg : {};
      const list = (v, app) => (Array.isArray(v) ? v : []).slice(0, 20).map((x, i) => {
        const host = str(x && x.host, 300).replace(/\/+$/, '');
        if (!/^https?:\/\/[^\s/?#]+(:\d+)?(\/[^\s?#]*)?$/i.test(host)) throw new HttpErr(400, `DNS ${app} n. ${i + 1}: scrivi l'indirizzo completo, es. http://dns.esempio.com:8080`);
        const code = x && x.code !== undefined && x.code !== '' && x.code !== null ? parseInt(x.code, 10) : null;
        if (code !== null && !(code > 0 && code < 1e9)) throw new HttpErr(400, `DNS ${app} n. ${i + 1}: il codice host deve essere un numero`);
        return { name: str(x.name, 40) || 'DNS ' + (i + 1), host, ...(code ? { code } : {}) };
      });
      const prev = s.playersCfg || {};
      s.playersCfg = { orbix: c.orbix !== undefined ? list(c.orbix, 'OrbixPlay') : prev.orbix || [], max: c.max !== undefined ? list(c.max, 'MaxPlayer') : prev.max || [], showDnsAgents: c.showDnsAgents !== undefined ? c.showDnsAgents === true : !!prev.showDnsAgents,
        autoClean: c.autoClean !== undefined ? c.autoClean === true : !!prev.autoClean, cleanDays: c.cleanDays !== undefined ? Math.max(7, Math.min(365, parseInt(c.cleanDays, 10) || 60)) : prev.cleanDays || 60,
        slots: c.slots !== undefined ? cleanSlots(c.slots) : prev.slots || null,
        codes: (() => { const pc = prev.codes || { orbix: '265847', max: '265847' }, nc = c.codes && typeof c.codes === 'object' ? c.codes : {}; const one = (k) => { if (nc[k] === undefined) return pc[k] || ''; const v = str(String(nc[k]), 30); if (v && !/^[A-Za-z0-9_-]{1,30}$/.test(v)) throw new HttpErr(400, 'Il codice cliente può avere solo lettere e numeri'); return v; }; return { orbix: one('orbix'), max: one('max') }; })() };
    }
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
    cfgDirty(env);
    await log(env, 'settings', `${who}: impostazioni aggiornate`, ip);
    // appena scelto il tempo: via subito anche le richieste di adesso che lo hanno già superato
    if (pendNow) return json({ settings: s, pendDeleted: await pendSweep(env, true, pendNow).catch(() => 0) });
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
    if (APPS.includes(b.app)) await env.DB.prepare('UPDATE devices SET app = ? WHERE id = ?').bind(b.app, id).run();
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
      if (d.parent && !ownOf(d)) throw new HttpErr(400, 'Le playlist di una connessione collegata si cambiano dal cliente principale (oppure attiva la sua gestione indipendente)');
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
      // move: un cliente con abbonamento suo passa sotto un altro (con le sue connessioni); keep: tiene le sue linee (gestione indipendente)
      const move = b.move === true, myPls = await unseal(env, d.playlists).catch(() => []), keep = move && b.keep !== false && myPls.length > 0;
      if (!move && (d.active || myPls.length)) throw new HttpErr(400, 'Il dispositivo ha già un abbonamento suo: disattivalo e togli le playlist prima di collegarlo');
      const kids = move ? ((await env.DB.prepare('SELECT id FROM devices WHERE parent = ? LIMIT 100').bind(d.id).all()).results || []) : [];
      if (!move && (await connCount(env, d)) > 1) throw new HttpErr(400, 'Il dispositivo ha già altre connessioni collegate');
      if (statusOf(P, await unseal(env, P.playlists).catch(() => [])) === 'pending') throw new HttpErr(400, 'Il cliente scelto non ha ancora un abbonamento');
      const used = await connCount(env, P), max = P.max_conn ?? 1, add = 1 + kids.length;
      if (used + add > max) throw new HttpErr(400, `Connessioni esaurite (${used} di ${max}${add > 1 ? `, ne servono altre ${add}` : ''}): aumenta "Connessioni massime" del cliente`);
      const name = typeof b.name === 'string' && b.name.trim() ? str(b.name, 60) : d.name;
      const ok = await env.DB.prepare("UPDATE devices SET parent = ?, name = ?, active = 0, expires = '', playlists = ?, profiles = '', own = ? WHERE id = ? AND parent = '' RETURNING id").bind(P.id, name, keep ? d.playlists : '', keep ? 1 : 0, d.id).first();
      if (!ok) throw new HttpErr(409, 'Il dispositivo è appena stato collegato: ricarica');
      if (move) await env.DB.batch([...kids.map((k) => env.DB.prepare('UPDATE devices SET parent = ? WHERE id = ? AND parent = ?').bind(P.id, k.id, d.id)), env.DB.prepare('DELETE FROM link_pins WHERE device_id = ?').bind(d.id)]);
      if (myPls.length) srcMem.map = null;
      await log(env, 'on', `${who}: ${name || label} ${move ? 'messo sotto' : 'collegato come connessione di'} ${P.name || P.code} (${used + add} di ${max})${kids.length ? ` con le sue ${kids.length} connessioni` : ''}${keep ? ', linee sue' : ''}`, ip);
      return json({ ok: true });
    }
    if (m === 'PUT' && d.parent) {
      // connessione di un altro cliente: abbonamento, profili, permessi e limiti si cambiano dal principale.
      // Con «gestione indipendente» (own) la TV collegata ha playlist e lettore suoi, restando collegata al principale.
      const b = await readJSON(req, 512 * 1024);
      if (['active', 'expires', 'profiles', 'maxConn', 'maxProfiles', 'lockProfiles', 'vpn', 'perms', 'addons'].some((k) => b[k] !== undefined)) throw new HttpErr(400, 'Questo dispositivo è una connessione di un altro cliente: abbonamento, scadenza, profili e permessi si modificano dal cliente principale');
      const wasOwn = ownOf(d), own = typeof b.own === 'boolean' ? b.own : wasOwn;
      if (!own && b.playlists !== undefined) throw new HttpErr(400, 'Per dare a questa TV playlist sue attiva prima la gestione indipendente');
      const oldPls = await unseal(env, d.playlists).catch(() => []);
      const pls = own ? (b.playlists !== undefined ? cleanPlaylists(b.playlists) : oldPls) : [];
      if (own && !pls.length) throw new HttpErr(400, 'Gestione indipendente: aggiungi almeno una playlist per questa TV');
      let plMode = own ? d.pl_mode || '' : '', plDef = own ? d.pl_default || '' : '', player = own ? d.player || '' : '';
      if (own) {
        if (b.plMode !== undefined) plMode = b.plMode === 'split' ? 'split' : 'merge';
        if (b.plDefault !== undefined) { const v = str(b.plDefault, 40); if (v && !pls.some((p) => p.id === v)) throw new HttpErr(400, 'Playlist da usare non trovata'); plDef = v; }
        if (!pls.some((p) => p.id === plDef)) plDef = '';
        if (b.player !== undefined) player = playerInput(b.player);
      }
      const acc = await accountFields(env, { vpnConf: b.vpnConf, vpnConfClear: b.vpnConfClear }, d, []);
      const name = typeof b.name === 'string' ? str(b.name, 60) : d.name;
      await env.DB.prepare('UPDATE devices SET name = ?, notes = ?, vpn_conf = ?, own = ?, playlists = ?, pl_mode = ?, pl_default = ?, player = ? WHERE id = ?')
        .bind(name, typeof b.notes === 'string' ? str(b.notes, 500) : d.notes, acc.vpn_conf, own ? 1 : 0, own ? await seal(env, pls) : '', plMode, plDef, player, d.id).run();
      if (b.app !== undefined) { if (!['', ...APPS].includes(b.app)) throw new HttpErr(400, 'App non valida'); await env.DB.prepare('UPDATE devices SET app = ? WHERE id = ?').bind(b.app, d.id).run(); }
      if (JSON.stringify(pls) !== JSON.stringify(oldPls)) srcMem.map = null;
      await log(env, 'edit', own !== wasOwn ? `${who}: ${name || label} — gestione indipendente ${own ? 'attivata (playlist e lettore suoi)' : 'tolta (usa quelli del cliente principale)'}` : `${who}: modificato ${name || label}`, ip);
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
      if (b.app !== undefined) { if (!['', ...APPS].includes(b.app)) throw new HttpErr(400, 'App non valida'); await env.DB.prepare('UPDATE devices SET app = ? WHERE id = ?').bind(b.app, d.id).run(); }
      if (JSON.stringify(pls) !== JSON.stringify(await unseal(env, d.playlists).catch(() => []))) srcMem.map = null;
      const after = statusOf({ active, expires }, pls);
      if (before !== after && after === 'active') ctx.waitUntil(webhookSend(env, 'device.activated', { id: d.id, code: d.code, name, expires }));
      await log(env, before !== after ? (after === 'active' ? 'on' : 'off') : 'edit', before !== after ? `${who}: ${name || d.code} ${before} → ${after}` : `${who}: modificato ${name || d.code}`, ip);
      return json({ ok: true });
    }
    if (m === 'DELETE') {
      // le liste mandate alle app terzi non restano orfane
      if (d.orbix && env.ORBIX_KEY) ctx.waitUntil(orbixRemove(env, d, who, ip).catch(() => {}));
      if (d.maxp && env.MAXPLAYER_KEY) ctx.waitUntil(mxRemove(env, d, who, ip).catch(() => {}));
      // eliminando un cliente principale le sue connessioni tornano "in attesa" (non restano agganciate al nulla)
      const kids = d.parent ? [] : await linkedOf(env, d.id);
      // nel cestino: la riga com'era e le connessioni collegate (per rimetterle sotto di lui al ripristino)
      const kidRows = kids.length ? (((await env.DB.prepare(`SELECT id, active, expires, playlists, profiles, own FROM devices WHERE id IN (${kids.map(() => '?').join(',')})`).bind(...kids.map((k) => k.id)).all()).results) || []) : [];
      await trashPut(env, 'device', d.id, label, d, { kids: kidRows }, who);
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
const API_DENY = /^\/(login|logout|logout-all|password|totp|api-keys|webhook|agents|ai|rctl|activity|armada|storm|trash)(\/|$)/;
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
    const k = await env.DB.prepare('SELECT * FROM api_keys WHERE id = ?').bind(km[1]).first();
    if (!k) throw new HttpErr(404, 'Chiave non trovata');
    await trashPut(env, 'apikey', k.id, k.name, k, null, who);
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
  // una connessione collegata ha lo stato del principale (il pannello lo copia); le sue eventuali playlist non la rendono «disattivata»
  return { id: d.id, code: d.code, name: d.name, model: d.model, notes: d.notes, active: !!d.active, expires: d.expires, playlists: pls, hosts: [...new Set(pls.map(hostOf).filter(Boolean))], createdAt: d.created_at, lastSeen: d.last_seen, lastIp: d.last_ip, bound: !!d.secret_hash, status: statusOf(d, d.parent ? [] : pls), own: ownOf(d),
    addons: addonsList(d.addons), ownerId: +d.owner_id || 0, aiLimit: d.ai_limit ?? -1, aiExtra: +d.ai_extra || 0, aiProvider: d.ai_provider || '', app: d.app || '', orbix: (({ id, t, n, u, dns, h }) => (id ? { id, t, n, u, dns, h } : null))(orbixOf(d)), maxp: (({ uid, u, dom, t }) => (uid ? { uid, u, dom, t } : null))(maxpOf(d)), parent: d.parent || '', maxConn: d.max_conn ?? 1, maxProfiles: d.max_profiles ?? 3, profiles: readProfiles(d, pls.map((p) => p.id)), lockProfiles: !!d.lock_profiles, vpn: +d.vpn || 0, vpnConf: !!d.vpn_conf, perms: permsParse(d.perms), maxStreams: +d.max_streams || 0, vpnLoc: d.vpn_loc || '', plMode: d.pl_mode === 'split' ? 'split' : 'merge', plDefault: d.pl_default || '', player: playerParse(d.player) };
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
  // indirizzo degli agenti: lì il titolare non entra (come credenziali errate); con «solo da lì» gli agenti non entrano dal tuo
  let okHost = ok;
  if (ok) {
    const S0 = await getSettings(env), host = new URL(req.url).hostname.toLowerCase();
    if (S0.agentHost && host === S0.agentHost && a.role !== 'agent') okHost = false;
    if (S0.agentHost && S0.agentHostOnly && host !== S0.agentHost && a.role === 'agent') {
      await log(env, 'off', `Accesso rifiutato all'agente ${a.username}: deve entrare dal suo indirizzo`, ip);
      throw new HttpErr(403, 'Accedi dall\'indirizzo del pannello che ti è stato dato');
    }
  }
  if (okHost && a.role === 'agent' && !(await agentChainActive(env, a.id))) {
    await log(env, 'off', `Accesso rifiutato all'agente ${a.username}: account disattivato`, ip);
    throw new HttpErr(403, 'Account disattivato: contatta il tuo fornitore');
  }
  if (okHost && a.role === 'agent') { const am = (await getSettings(env)).agMaint; if (am && am.on) throw new HttpErr(503, am.msg || AGM_MSG, { maint: true }); }
  if (!okHost) {
    const blocked = await strike();
    await log(env, 'off', `Accesso fallito per "${user.slice(0, 30)}"${ok ? ' (titolare dall\'indirizzo degli agenti)' : ''}${blocked}`, ip);
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

/** accesso di un agente con il link personale (…/panel/?k=token) + codice di accesso, senza utente e password */
async function linkLogin(req, env, ip, ctx) {
  if (await limited(env.RL_LOGIN, 'login:' + ip)) throw new HttpErr(429, 'Troppi tentativi, attendi un minuto');
  const fail = await env.DB.prepare('SELECT * FROM login_fail WHERE ip = ?').bind(ip).first();
  if (fail && fail.until > now()) throw new HttpErr(429, `Accesso bloccato per sicurezza. Riprova tra ${Math.ceil((fail.until - now()) / 60000)} minuti`);
  const b = await readJSON(req, 8192);
  if (!(await verifyTurnstile(env, str(b.turnstile, 4096), ip))) throw new HttpErr(400, 'Verifica anti-bot non superata, riprova');
  const k = str(b.k, 64), code = str(b.code, 20);
  const strike = async () => {
    const c = (fail && fail.until <= now() && now() - fail.updated > 3600e3 ? 0 : (fail ? fail.count : 0)) + 1, until = c >= 5 ? now() + 15 * 60e3 : 0;
    await env.DB.prepare('INSERT INTO login_fail (ip, count, until, updated) VALUES (?, ?, ?, ?) ON CONFLICT(ip) DO UPDATE SET count = excluded.count, until = excluded.until, updated = excluded.updated').bind(ip, until ? 0 : c, until, now()).run();
    return until ? ' — IP bloccato 15 min' : '';
  };
  const a = /^[A-Za-z0-9_-]{20,64}$/.test(k) ? await env.DB.prepare("SELECT * FROM admins WHERE link_hash = ? AND role = 'agent'").bind(await sha256('lnk:' + k)).first() : null;
  const want = a && a.code_seal ? await unseal(env, a.code_seal).catch(() => '') : '';
  if (!a || !want || !code || !safeEq(code, want)) {
    const blocked = await strike();
    await log(env, 'off', `Accesso con link fallito${a ? ' per ' + a.username + ' (codice errato)' : ' (link non valido o revocato)'}${blocked}`, ip);
    throw new HttpErr(401, a ? 'Codice di accesso errato' : 'Link non valido o revocato: chiedine uno nuovo');
  }
  const S0 = await getSettings(env), host = new URL(req.url).hostname.toLowerCase();
  if (S0.agentHost && S0.agentHostOnly && host !== S0.agentHost) throw new HttpErr(403, 'Accedi dall\'indirizzo del pannello che ti è stato dato');
  if (!(await agentChainActive(env, a.id))) { await log(env, 'off', `Accesso rifiutato all'agente ${a.username}: account disattivato`, ip); throw new HttpErr(403, 'Account disattivato: contatta il tuo fornitore'); }
  { const am = S0.agMaint; if (am && am.on) throw new HttpErr(503, am.msg || AGM_MSG, { maint: true }); }
  if (a.totp_on) {
    if (!b.totp) return json({ needTotp: true }, 200);
    const ctr = await checkTotp(a.totp_secret, b.totp, a.totp_last);
    if (ctr < 0) { const blocked = await strike(); await log(env, 'off', `Codice 2FA errato per ${a.username}${blocked}`, ip); throw new HttpErr(401, 'Codice di verifica errato'); }
    await env.DB.prepare('UPDATE admins SET totp_last = ? WHERE id = ?').bind(ctr, a.id).run();
  }
  await env.DB.prepare('DELETE FROM login_fail WHERE ip = ?').bind(ip).run();
  const old = cookieOf(req);
  if (old) await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(await sha256('ses:' + old)).run();
  const tok = b64url(rand(32));
  await env.DB.prepare('INSERT INTO sessions (id, admin_id, expires, ip, ua, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(await sha256('ses:' + tok), a.id, now() + SESSION_TTL * 1000, ip, str(req.headers.get('User-Agent') || '', 200), now()).run();
  await env.DB.prepare('UPDATE admins SET link_used = ? WHERE id = ?').bind(now(), a.id).run();
  await log(env, 'auth', `Accesso di ${a.username} con il link personale`, ip);
  ctx.waitUntil(cleanup(env));
  return json({ ok: true, user: a.username, totp: !!a.totp_on, role: 'agent' }, 200, { 'Set-Cookie': setCookie(tok, SESSION_TTL) });
}

/* ====================================================================== */
/* Cestino: ciò che si elimina resta 30 giorni e si può ripristinare       */
/* ====================================================================== */
const TRASH_DAYS = 30;
const TRASH_KIND = { device: 'Cliente', agent: 'Agente', dns: 'DNS', line: 'Linea collegata', msg: 'Messaggio', apikey: 'Chiave API', vpnloc: 'Località VPN', extlist: 'Lista su app terza' };
/** mette nel cestino: [data] = righe originali, [extra] = cose da rimettere a posto al ripristino */
async function trashPut(env, kind, ref, label, data, extra, who) {
  const id = b64url(rand(9)), t = now();
  await env.DB.prepare('INSERT INTO trash (id, kind, ref, label, data, extra, by, t, exp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, kind, String(ref || ''), str(label, 120), JSON.stringify(data ?? null), JSON.stringify(extra ?? null), str(who, 60), t, t + TRASH_DAYS * 86400e3).run();
  return id;
}
/** rimette una riga com'era (stesse colonne); false se l'id c'è già */
async function trashRow(env, table, row) {
  if (!row || typeof row !== 'object') return false;
  const keys = Object.keys(row).filter((k) => /^[a-z_]+$/i.test(k));
  const r = await env.DB.prepare(`INSERT OR IGNORE INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`).bind(...keys.map((k) => row[k])).run();
  return !!(r.meta && r.meta.changes);
}
async function trashList(env) {
  const rows = ((await env.DB.prepare('SELECT id, kind, ref, label, by, t, exp FROM trash ORDER BY t DESC LIMIT 500').all()).results) || [];
  return rows.map((r) => ({ ...r, kindLabel: TRASH_KIND[r.kind] || r.kind, daysLeft: Math.max(0, Math.ceil((+r.exp - now()) / 86400e3)) }));
}
/** ripristina un elemento del cestino; lancia HttpErr se non si può più (es. codice ormai preso da un altro) */
async function trashRestore(env, id, who, ip) {
  const r = await env.DB.prepare('SELECT * FROM trash WHERE id = ?').bind(id).first();
  if (!r) throw new HttpErr(404, 'Non è più nel cestino');
  let data = null, extra = null; try { data = JSON.parse(r.data); } catch {} try { extra = JSON.parse(r.extra); } catch {}
  const done = async (msg) => { await env.DB.prepare('DELETE FROM trash WHERE id = ?').bind(id).run(); await log(env, 'new', `${who}: ripristinato dal cestino ${TRASH_KIND[r.kind] || r.kind} · ${r.label}`, ip); return { ok: true, kind: r.kind, label: r.label, msg: msg || '' }; };
  if (r.kind === 'device') {
    const d = { ...data, orbix: '', maxp: '' }; // le liste sulle app terze erano state tolte: si rimandano dalla scheda
    if (await env.DB.prepare('SELECT id FROM devices WHERE code = ? AND id <> ?').bind(d.code, d.id).first()) throw new HttpErr(409, `Il codice ${d.code} è stato preso da un altro dispositivo: il cliente non si può ripristinare`);
    if (!(await trashRow(env, 'devices', d))) throw new HttpErr(409, 'Il cliente esiste già');
    // le connessioni collegate tornano sotto di lui (solo quelle rimaste "in attesa")
    let n = 0;
    for (const k of (extra && Array.isArray(extra.kids) ? extra.kids : [])) {
      const x = await env.DB.prepare('SELECT id FROM devices WHERE id = ? AND parent = \'\'').bind(k.id).first();
      if (!x) continue;
      await env.DB.prepare('UPDATE devices SET parent = ?, active = ?, expires = ?, playlists = ?, profiles = ?, own = ? WHERE id = ?').bind(d.id, k.active || 0, k.expires || '', k.playlists || '', k.profiles || '', k.own || 0, k.id).run(); n++;
    }
    srcMem.map = null;
    return done((n ? `${n} connessioni ricollegate. ` : '') + ((data.orbix || data.maxp) ? 'Le liste su OrbixPlay/MaxPlayer vanno rimandate dalla scheda del cliente.' : ''));
  }
  if (r.kind === 'agent') {
    if (await env.DB.prepare('SELECT id FROM admins WHERE username = ? AND id <> ?').bind(data.username, data.id).first()) throw new HttpErr(409, `Il nome «${data.username}» è stato preso da un altro account`);
    if (!(await trashRow(env, 'admins', data))) throw new HttpErr(409, 'L\'agente esiste già');
    const devs = (extra && extra.devices) || [], subs = (extra && extra.agents) || [];
    const q = (a) => a.map(() => '?').join(',');
    if (devs.length) for (let i = 0; i < devs.length; i += 90) { const part = devs.slice(i, i + 90); await env.DB.prepare(`UPDATE devices SET owner_id = ? WHERE id IN (${q(part)}) AND owner_id = ?`).bind(data.id, ...part, extra.up || 0).run(); }
    if (subs.length) await env.DB.prepare(`UPDATE admins SET parent_id = ? WHERE id IN (${q(subs)}) AND role = 'agent'`).bind(data.id, ...subs).run();
    memoDrop(env, 'ags', 'agc');
    return done(`${devs.length} clienti e ${subs.length} sotto-agenti tornati a lui`);
  }
  if (r.kind === 'dns') {
    const list = await dnsList(env);
    if (list.some((x) => x.id === data.id)) throw new HttpErr(409, 'Questo DNS è già nell\'elenco');
    list.push(data); await dnsSave(env, list); return done();
  }
  if (r.kind === 'vpnloc') {
    const list = await wgLocs(env);
    if (list.some((x) => x.id === data.id)) throw new HttpErr(409, 'Questa località è già nell\'elenco');
    list.push(data);
    await env.DB.prepare('INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind('wgl', await seal(env, list)).run();
    return done();
  }
  if (r.kind === 'line') { if (!(await trashRow(env, 'linked_lines', data))) throw new HttpErr(409, 'La linea esiste già'); return done(); }
  if (r.kind === 'apikey') { if (!(await trashRow(env, 'api_keys', data))) throw new HttpErr(409, 'La chiave esiste già'); return done(); }
  if (r.kind === 'msg') { let n = 0; for (const row of (Array.isArray(data) ? data : [data])) if (await trashRow(env, 'messages', row)) n++; return done(`${n} messaggi`); }
  if (r.kind === 'extlist') { if (!(await trashRow(env, 'ext_lists', { ...data, ext: '' }))) throw new HttpErr(409, 'La lista esiste già'); return done('Sull\'app terza la lista era stata cancellata: va reinviata (pulsante «Reinvia»)'); }
  throw new HttpErr(400, 'Elemento non ripristinabile');
}
/* ---------------- Richieste «da attivare» non accettate: si annullano da sole (Impostazioni → pendTtl, in ore) ----------------
   Si conta dalla richiesta, ma mai mentre l'app mostra il codice (si ricollega ogni pochi secondi): se il cliente riapre l'app
   la richiesta ricompare da sola, con lo stesso codice. 0 = come prima: via dopo 30 giorni senza contatti (pulizia notturna). */
const PEND_TTL = [0, 1, 6, 24, 72, 168];
const PEND_WHERE = "active = 0 AND playlists = '' AND parent = ''";
const pendTtlTxt = (h) => (h % 24 ? (h === 1 ? '1 ora' : h + ' ore') : h === 24 ? '24 ore' : h / 24 + ' giorni');
let pendSweepT = 0;
async function pendSweep(env, force = false, h0 = null) {
  const h = h0 !== null ? h0 : +(await getSettings(env)).pendTtl || 0, t = now();
  if (!h || !PEND_TTL.includes(h) || (!force && t - pendSweepT < 5 * 60e3)) return 0;
  pendSweepT = t;
  // quelle con un nome o una nota date dal pannello restano (come nella pulizia dei 30 giorni)
  const r = await env.DB.prepare(`DELETE FROM devices WHERE ${PEND_WHERE} AND name = '' AND notes = '' AND created_at < ? AND last_seen < ?`).bind(t - h * 3600e3, t - 10 * 60e3).run();
  const n = +((r && r.meta && r.meta.changes) || 0);
  if (n) await log(env, 'del', `Annullate da sole ${n === 1 ? '1 richiesta' : n + ' richieste'} da attivare non accettate entro ${pendTtlTxt(h)}`);
  return n;
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
  try { await env.DB.prepare('DELETE FROM armada_spend WHERE t < ?').bind(t - 400 * 86400e3).run(); } catch {} // crediti Armada degli agenti: basta poco più di un anno
  try { await env.DB.prepare('DELETE FROM remote_cmds WHERE created < ?').bind(t - 30 * 86400e3).run(); } catch {} // comandi del controllo remoto: 30 giorni
  try { await env.DB.prepare('DELETE FROM trash WHERE exp < ?').bind(t).run(); } catch {} // cestino: 30 giorni, poi via per sempre
}

// esportati per i test
export const _internal = { hashPass, checkPass, hotp, checkTotp, b32enc, seal, unseal, cleanTitle, cleanProfiles, semverCode, textToHtml, cleanWg, permsParse, permsJson, hostOf, cleanHost, swapHost, dayIT, PERM_KEYS };
