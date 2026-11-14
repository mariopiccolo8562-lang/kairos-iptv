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
import { b64u as pkB64, unb64u as pkUnb64, cbor as pkCbor, parseAuthData as pkAuthData, coseToJwk as pkJwk, verifySig as pkVerify, sha as pkSha, same as pkSame, concat as pkCat } from './passkey.js'; // accesso del titolare con impronta o Face ID
import { storeApi, storeAdmin, storeCodes, storeCodesOn, storeHeaders, storeHooks, storeDecide, storeAgentAlerts } from './store.js'; // Store aperto: conteggi e compatibilità con gli store vecchi (/api/store/*)
import { tvPair, tvHeaders } from './tvpair.js'; // Kairos Player per TV LG e Samsung: «invia la lista dal telefono» (pubblica, senza legami con il pannello)
import { wolfRoutes, wolfCron, sockFetch, wolfCfg, wolfGlance } from './wolf.js'; // pannello WOLF collegato (sezione «WOLF» del pannello)
import { atxRoutes, clearAtxAgent, atxGlance } from './atlantix.js'; // Pannello Atlantix (cms.axdash.biz)
import { oraRoutes } from './orapanel.js';
import { orcpRoutes, orcpAgentConfig, setOrcpDownloader, ovpnFile, orcpRemoteHosts, orcpKeepAlive } from './orcp.js'; // Pannello ORCP (cp.ottrun.com): l'app brandizzata OTTRUN, accesso passato dal titolare
import { vpnMark as vpnMarkRows } from './vpn-mark.js';
import { extRoutes, extGlance } from './extpanels.js'; // Pannelli Realott e SLT (accesso diretto senza API), solo titolare // Pannello ORA (panel.oraplayers.com), accesso passato dal titolare
import { blkRoutes, relayPublic } from './relay.js';
import { orbixFetch, orbixOutageMessage, oxpRoutes } from './orbixpanel.js'; // playlist OrbixPlay gestite da KAIROS (sezione «Pannello OrbixPlay»)
import { mxpRoutes } from './mxpanel.js'; // account MaxPlayer gestiti da KAIROS (sezione «Pannello MaxPlayer»)
import { tgHook, notifyNew, notifyDecided, notifyActivated, notifyDownload, notifyAdmin, notifyOwnersText } from './notify.js'; // avvisi su Telegram e notifiche del pannello

const SESSION_TTL = 30 * 86400; // secondi: l'accesso resta valido 30 giorni dall'ultimo uso (si rinnova da solo)
const ORCP_KEEPALIVE_CRON = '41 */6 * * *';
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
    if (_ev && _ev.cron === ORCP_KEEPALIVE_CRON) {
      try { await orcpKeepAlive(env, WOLF_H); } catch {}
      return;
    }
    await cleanup(env);
    try { await pendSweep(env, true, effectivePendTtl(await getSettings(env))); } catch {} // richieste «da attivare» non accettate entro il tempo scelto
    // app terzi: se l'hai chiesto, ogni notte si tolgono le liste inattive
    try { const c = (await getSettings(env)).playersCfg || {}; if (c.autoClean) await thirdCleanup(env, c.cleanDays || 60, 'Pulizia automatica', ''); } catch {}
    try { await wolfCron(env, WOLF_H); } catch {}
    try { await orcpKeepAlive(env, WOLF_H); } catch {}
    try { await paymentsAutoRenew(env); } catch {}
    try { await lineSyncCron(env); } catch {}
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
const WOLF_H = { seal: (...a) => seal(...a), unseal: (...a) => unseal(...a), HttpErr, json, readJSON, str, log: (...a) => log(...a), note: (...a) => llNote(...a), dnsList: (...a) => dnsList(...a), pid: () => b64url(rand(6)), vpnMark: (env, rows, fields) => vpnMark(env, rows, fields, WOLF_H), notifyOwnersText: (env, text) => notifyOwnersText(env, notifyH(env), text), plsChanged: () => { srcMem.map = null; } };
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
  const bytes = enc.encode(JSON.stringify(obj)); // codificato una volta sola: serve all'impronta e diventa la risposta
  const tag = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
  const h = { 'Content-Type': 'application/json; charset=utf-8', 'X-Kairos-Etag': tag, 'Cache-Control': 'no-store' };
  return new Response(req.headers.get('X-Kairos-Etag') === tag ? '{"same":true}' : bytes, { headers: h });
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

/* codici di recupero della verifica in due passaggi (come nel pannello a parte dello store): 10 codici da 8 caratteri senza
   lettere che si confondono, ognuno vale una volta. Nel database solo l'impronta (HMAC con ENC_KEY), in settings 'totprec:<id>'.
   Si creano quando si attiva la verifica e con «Nuovi codici» (password + codice); spariscono disattivandola o azzerandola */
const REC_AB = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const recNorm = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const recIs = (c) => recNorm(c).length === 8;
const recHash = (env, id, c) => hmacHex(String(env.ENC_KEY || 'kairos'), 'rec:' + id + ':' + recNorm(c));
async function recNew(env, id) {
  const codes = [], hashes = [];
  while (codes.length < 10) {
    let x = '';
    while (x.length < 8) for (const b of rand(16)) if (b < 248 && x.length < 8) x += REC_AB[b % 31]; // senza sbilanciamenti
    if (codes.includes(x.slice(0, 4) + '-' + x.slice(4))) continue;
    codes.push(x.slice(0, 4) + '-' + x.slice(4)); hashes.push(await recHash(env, id, x));
  }
  await env.DB.prepare('INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind('totprec:' + id, JSON.stringify(hashes)).run();
  return codes;
}
async function recLeft(env, id) {
  const r = await env.DB.prepare('SELECT v FROM settings WHERE k = ?').bind('totprec:' + id).first();
  try { const l = r ? JSON.parse(r.v) : []; return Array.isArray(l) ? l.length : 0; } catch { return 0; }
}
/** usa un codice di recupero: quanti ne restano, -1 se non vale (sbagliato o già usato) */
async function recUse(env, id, code) {
  const r = await env.DB.prepare('SELECT v FROM settings WHERE k = ?').bind('totprec:' + id).first(); if (!r) return -1;
  let l; try { l = JSON.parse(r.v); } catch { return -1; }
  if (!Array.isArray(l)) return -1;
  const i = l.indexOf(await recHash(env, id, code)); if (i < 0) return -1;
  l.splice(i, 1);
  const u = await env.DB.prepare('UPDATE settings SET v = ? WHERE k = ? AND v = ?').bind(JSON.stringify(l), 'totprec:' + id, r.v).run();
  return u && u.meta && u.meta.changes ? l.length : -1; // usato nello stesso istante da un'altra richiesta: non vale due volte
}
const recDrop = (env, id) => env.DB.prepare('DELETE FROM settings WHERE k = ?').bind('totprec:' + id).run();

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
    // pagina dello store (da GitHub Pages) e APK (dalle release): link senza nomi; la pagina ha script interni, niente CSP del pannello.
    // I feed /get/<app>.json tengono la loro cache breve (5 minuti)
    if (!url.pathname.startsWith('/get/') && (url.pathname.endsWith('.html') || url.pathname.endsWith('/') || url.pathname.endsWith('.json'))) h.set('Cache-Control', 'no-cache');
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
  if (url.pathname.startsWith('/get/') && url.pathname.endsWith('.json')) {
    // feed degli aggiornamenti: li leggono le app e lo store (anche da un'altra origine)
    h.set('Access-Control-Allow-Origin', '*');
    h.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    h.set('Cross-Origin-Resource-Policy', 'cross-origin');
  }
  if (url.pathname.startsWith('/api/store/')) storeHeaders(h, url.pathname); // CORS per lo store + pagine dei link email
  if (url.pathname.startsWith('/api/tv/')) tvHeaders(h, false); else if (url.pathname === '/tv' || url.pathname === '/tv/') tvHeaders(h, true); // Kairos Player: le API le chiama il TV, la pagina ha script interni
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
  allowLocalPlaylists: true, codeOnly: false, apkUrl: '', apkVersionCode: 0, downloaderCode: '', storeDownloaderCode: '', liteDownloaderCode: '', liteApkUrl: '', ktvDownloaderCode: '', ktvApkUrl: '', xcDownloaderCode: '', xcApkUrl: '', ultDownloaderCode: '', ultApkUrl: '', plusDownloaderCode: '', plusApkUrl: '', premDownloaderCode: '', novaDownloaderCode: '',
  serverUrl: '', showFootball: true,
  price: '22 € / anno', privacy: '',
  aiDaily: 20, aiProvider: 'gm', aiClaude: 'haiku', aiGemini: 'flash',
  maint: { on: false, msg: '', allow: [] },
  // DNS MaxPlayer/OrbixPlay degli agenti: solo etichette, indipendentemente da showDnsAgents
  playersCfg: { orbix: [{ name: 'NKI OrbixPlay', host: 'http://orbx.nki-orbx.download' }], max: [], showDnsAgents: false, codes: { orbix: '265847', max: '265847' }, slots: null }, // link diretto NKI e codice cliente già pronti (slots: vedi SLOTS_DEFAULT)
  // «Attiva app»: il link di gestione dispositivo di ogni app dello store (dove il titolare attiva la lista col codice del cliente). Modificabile e ampliabile dal pannello.
  actApps: {},
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
const actAppSlug = (name) => String(name || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
const actAppCompact = (name) => actAppSlug(name).replace(/-/g, '');
const actAppExcluded = (name) => /^(?:kairos\b|max\s*-?player\b|orbix\s*play\b|mirkoteam\b|nanomid\b)/i.test(String(name || '').trim());
const activationAliases = (app) => Array.isArray(app && app.aliases) && app.aliases.length ? app.aliases : [app && app.key].filter(Boolean);
const activationAppEnabled = (settings, app) => activationAliases(app).some((key) => settings && settings.actApps && settings.actApps[key] === true);
const activationAppAllowed = (perms, app) => activationAliases(app).some((key) => Array.isArray(perms && perms.actApps) && perms.actApps.includes(key));
const isPanelHost = (value) => /^(?:https?:\/\/|localhost(?::\d+)?$|(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?$|[a-z0-9.-]+\.[a-z]{2,}(?::\d+)?(?:\/|$))/i.test(String(value || '').trim());
const agentDnsLabel = (value, index, fallback = '') => { const label = str(value, 80).trim(); return label && !isPanelHost(label) ? label : fallback || `DNS ${index + 1}`; };
async function activationApps(env, settings) {
  const links = (Array.isArray(settings.appLinks) ? settings.appLinks : []).filter((x) => x && typeof x.name === 'string');
  const groups = new Map();
  const priorKeys = new Set(Object.keys(settings.actApps || {}).filter(validActAppKey));
  try { for (const agent of await agentsAll(env)) for (const key of agentPerms(agent.perms).actApps) priorKeys.add(key); } catch {}
  for (const value of [...(await storeAppNames(env)), ...links.map((x) => x.name)]) {
    const name = String(value || '').trim(), key = actAppSlug(name), compact = actAppCompact(name);
    if (!name || !key || !compact || actAppExcluded(name)) continue;
    let group = groups.get(compact);
    if (!group) { group = { names: [], aliases: new Set() }; groups.set(compact, group); }
    group.names.push({ name, key });
    group.aliases.add(key);
  }
  return [...groups.entries()].map(([compact, group]) => {
    const link = links.find((x) => actAppCompact(x.name) === compact && /^https?:\/\//i.test(String(x.url || ''))) || null;
    const preferred = link ? { name: String(link.name).trim(), key: actAppSlug(link.name) } : group.names[0];
    group.aliases.add(preferred.key);
    for (const key of priorKeys) if (actAppCompact(key) === compact) group.aliases.add(key);
    return { key: preferred.key, name: preferred.name, link, aliases: [...group.aliases] };
  });
}
const validActAppKey = (key) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(key || ''));
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
    const r = await relFetch(env, env.APK_FEED, { headers: { 'User-Agent': 'KairosPanel' }, signal: AbortSignal.timeout(4000), cf: { cacheTtl: 300, cacheEverything: true } });
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
async function ktvFeed(s, env) {
  const apk = s.ktvApkUrl || KTV_APK, url = apk.replace(/\.apk(\?.*)?$/i, '.json');
  if (ktvMem.k === url && now() - ktvMem.t < 5 * 60e3) return ktvMem.v;
  let v = null;
  if (/^https:\/\/.+\.json$/i.test(url)) {
    try {
      const r = await relFetch(env, url, { headers: { 'User-Agent': 'KairosPanel' }, signal: AbortSignal.timeout(4000), cf: { cacheTtl: 300, cacheEverything: true } });
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
async function premFeed(env) {
  if (now() - premMem.t < 5 * 60e3) return premMem.v;
  let v = null;
  try {
    const r = await relFetch(env, PREM_APK.replace(/\.apk$/, '.json'), { headers: { 'User-Agent': 'KairosPanel' }, signal: AbortSignal.timeout(4000), cf: { cacheTtl: 300, cacheEverything: true } });
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
async function xcFeed(s, env) {
  const apk = s.xcApkUrl || XC_APK, url = apk.replace(/\.apk(\?.*)?$/i, '.json');
  if (xcMem.k === url && now() - xcMem.t < 5 * 60e3) return xcMem.v;
  let v = null;
  if (/^https:\/\/.+\.json$/i.test(url)) {
    try {
      const r = await relFetch(env, url, { headers: { 'User-Agent': 'KairosPanel' }, signal: AbortSignal.timeout(4000), cf: { cacheTtl: 300, cacheEverything: true } });
      if (r.ok) { const j = await r.json(); const code = semverCode(j.version) || +j.versionCode; if (code > 0) v = { versionCode: code, version: String(j.version || '').replace(/^v/i, '').slice(0, 20), url: /^https:\/\//.test(j.url || '') ? String(j.url).slice(0, 500) : apk, date: String(j.date || '').slice(0, 40) }; }
    } catch {}
  }
  xcMem = { t: now(), k: url, v };
  return v;
}
/* KAIROS Ultimate: feed indipendente dal repository kairos-ultimate */
const ULT_APK = 'https://github.com/mariopiccolo8562-lang/kairos-ultimate/releases/latest/download/kairos-ultimate.apk';
let ultMem = { t: 0, k: '', v: null };
async function ultFeed(s, env) {
  const apk = s.ultApkUrl || ULT_APK, url = apk.replace(/\.apk(\?.*)?$/i, '.json');
  if (ultMem.k === url && now() - ultMem.t < 5 * 60e3) return ultMem.v;
  let v = null;
  if (/^https:\/\/.+\.json$/i.test(url)) {
    try {
      const r = await relFetch(env, url, { headers: { 'User-Agent': 'KairosPanel' }, signal: AbortSignal.timeout(4000), cf: { cacheTtl: 300, cacheEverything: true } });
      if (r.ok) { const j = await r.json(); const code = semverCode(j.version) || +j.versionCode; if (code > 0) v = { versionCode: code, version: String(j.version || '').replace(/^v/i, '').slice(0, 20), url: /^https:\/\//.test(j.url || '') ? String(j.url).slice(0, 500) : apk, date: String(j.date || '').slice(0, 40) }; }
    } catch {}
  }
  ultMem = { t: now(), k: url, v };
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
async function novaFeed(env) {
  if (now() - novaMem.t < 5 * 60e3) return novaMem.v;
  let v = null;
  try {
    const r = await relFetch(env, NOVA_FEED, { headers: { 'User-Agent': 'KairosPanel' }, signal: AbortSignal.timeout(4000), cf: { cacheTtl: 300, cacheEverything: true } });
    if (r.ok) { const j = await r.json(); const ver = String(j.version || '').replace(/^v/i, '').slice(0, 20); if (ver) v = { versionCode: +j.versionCode || semverCode(ver), version: ver, url: /^https:\/\//.test(j.url || '') ? String(j.url) : '', date: j.date || '' }; }
  } catch {}
  novaMem = { t: now(), v };
  return v;
}
async function plusFeed(s, env) {
  const apk = s.plusApkUrl || PLUS_APK, url = apk.replace(/\.apk(\?.*)?$/i, '.json');
  if (plusMem.k === url && now() - plusMem.t < 5 * 60e3) return plusMem.v;
  let v = null;
  if (/^https:\/\/.+\.json$/i.test(url)) {
    try {
      const r = await relFetch(env, url, { headers: { 'User-Agent': 'KairosPanel' }, signal: AbortSignal.timeout(4000), cf: { cacheTtl: 300, cacheEverything: true } });
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
    const result = await orbixFetch(ORBIX_API + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-customer-key': env.ORBIX_KEY }, body: JSON.stringify({ query: qq }) }, path);
    if (result.unavailable) throw new HttpErr(502, orbixOutageMessage(path, result.status));
    r = result.response;
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
function appLabel(app) { return app === 'max' ? 'MaxPlayer' : app === 'orbix' ? 'OrbixPlay' : app === 'nanomid' ? 'Nanomid' : String(app || 'App'); }
function nanomidHost(value) {
  const raw = str(value, 200);
  let x;
  try { x = new URL(/^https?:\/\//i.test(raw) ? raw : 'http://' + raw); } catch { throw new HttpErr(400, 'Scrivi il DNS della linea (es. http://dns.esempio.com:8080)'); }
  if (!/^https?:$/.test(x.protocol) || !/^[a-z0-9.-]+$/i.test(x.hostname) || x.username || x.password || !['', '/'].includes(x.pathname) || x.search || x.hash) {
    throw new HttpErr(400, 'Scrivi il DNS della linea (es. http://dns.esempio.com:8080)');
  }
  return { host: x.origin, dns: x.hostname.toLowerCase() };
}
async function nanomidCall(method, path, body) {
  let r;
  try {
    r = await fetch('https://nanomid.com/api/Partner/PlayListFromOtp' + path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new HttpErr(502, 'Nanomid non risponde: riprova tra poco');
  }
  if (r.status === 200) return;
  if (r.status === 400) throw new HttpErr(400, 'Nanomid ha rifiutato i dati della lista');
  if (r.status === 404) throw new HttpErr(404, 'Codice Nanomid non valido o scaduto: controlla il codice sulla TV del cliente');
  throw new HttpErr(502, 'Nanomid: errore ' + r.status);
}

/* ---------------- «Crea lista»: liste caricate su OrbixPlay / MaxPlayer / Nanomid senza un cliente Kairos ----------------
   Il titolare le vede tutte; un agente (con «Attivare OrbixPlay e MaxPlayer dal pannello») solo le sue e quelle dei suoi
   sotto-agenti. Le chiavi e gli indirizzi dei DNS restano nel pannello: si sceglie il DNS per nome. */
async function extListsRoutes(req, env, path, who, ip, ag) {
  const m = req.method, t = now();
  const mine = ag ? ag.tree : null; // null = titolare (tutte)
  if (path === '/ext-lists/nanomid-clear' && m === 'POST') {
    if (ag) throw new HttpErr(403, 'Nanomid per ora è solo del titolare');
    const b = await readJSON(req, 4096), quickCode = str(b.quickCode, 32).replace(/\s+/g, '');
    if (!/^[A-Za-z0-9]{4,16}$/.test(quickCode)) throw new HttpErr(400, 'Scrivi il codice che compare nell\'app Nanomid sulla TV del cliente');
    await nanomidCall('DELETE', '/' + encodeURIComponent(quickCode)).catch((e) => { if (e.status !== 404) throw e; });
    await log(env, 'del', `${who}: liste Nanomid svuotate (codice ${quickCode})`, ip);
    return json({ ok: true });
  }
  if (path === '/ext-lists' && m === 'GET') {
    const rows = ((await env.DB.prepare('SELECT * FROM ext_lists ORDER BY created DESC LIMIT 1000').all()).results || []).filter((r) => (!mine || mine.includes(+r.owner_id)) && (!ag || r.app !== 'nanomid'));
    const names = new Map((await agentsAll(env)).map((a) => [a.id, a.username]));
    return json({ lists: rows.map((r) => ({ id: r.id, app: r.app, name: r.name, ref: r.ref, username: r.username, dns: ag && /^(orbix|max)$/.test(r.app) ? agentDnsLabel(r.dns, 0, 'DNS ' + appLabel(r.app)) : r.dns, note: r.note, created: r.created, updated: r.updated, by: +r.owner_id ? names.get(+r.owner_id) || 'agente eliminato' : 'Tu', mine: ag ? +r.owner_id === ag.id : !+r.owner_id })) });
  }
  if (path === '/ext-lists' && m === 'POST') {
    const b = await readJSON(req, 4096);
    const app = b.app === 'max' ? 'max' : b.app === 'orbix' ? 'orbix' : b.app === 'nanomid' ? 'nanomid' : '';
    if (!app) throw new HttpErr(400, 'Scegli OrbixPlay, MaxPlayer o Nanomid');
    if (app === 'nanomid' && ag) throw new HttpErr(403, 'Nanomid per ora è solo del titolare');
    const name = nameClean(b.name, 60), note = nameClean(b.note, 200), username = str(b.username, 120), password = typeof b.password === 'string' ? b.password.slice(0, 200) : '';
    if (!username || !password) throw new HttpErr(400, 'Scrivi utente e password della linea');
    const s = await getSettings(env);
    let ref = '', ext = '', dnsName = '';
    if (app === 'nanomid') {
      const quickCode = str(b.quickCode, 32).replace(/\s+/g, '');
      if (!/^[A-Za-z0-9]{4,16}$/.test(quickCode)) throw new HttpErr(400, 'Scrivi il codice che compare nell\'app Nanomid sulla TV del cliente');
      const { host, dns } = nanomidHost(b.host);
      const url = host + '/get.php?username=' + encodeURIComponent(username) + '&password=' + encodeURIComponent(password) + '&type=m3u_plus&output=ts';
      await nanomidCall('POST', '', { title: name || str(s.brand || 'Kairos', 40), url, quickCode, hiddenInfo: true });
      ref = quickCode; dnsName = dns;
    } else if (app === 'orbix') {
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
    await llNote(env, { src: app === 'max' ? 'mxp' : app === 'orbix' ? 'oxp' : 'nmd', app: appLabel(app), owner: ag ? ag.id : 0, username, password, mac: app === 'orbix' ? ref : '', note: [name, note, dnsName].filter(Boolean).join(' · ') });
    const target = app === 'max' ? 'utente ' + username : app === 'orbix' ? 'dispositivo ' + ref : 'codice ' + ref;
    await log(env, 'new', `${who}: lista creata su ${appLabel(app)}${name ? ' per ' + name : ''} (${target}, ${dnsName})`, ip);
    return json({ ok: true, id, app, ref, dns: dnsName });
  }
  const em = path.match(/^\/ext-lists\/([A-Za-z0-9_-]{6,20})$/);
  if (em && m === 'DELETE') {
    const r = await env.DB.prepare('SELECT * FROM ext_lists WHERE id = ?').bind(em[1]).first();
    if (r && r.app === 'nanomid' && ag) throw new HttpErr(403, 'Nanomid per ora è solo del titolare');
    if (!r || (mine && !mine.includes(+r.owner_id))) throw new HttpErr(404, 'Lista non trovata');
    if (r.app === 'orbix') { let pls = []; try { pls = JSON.parse(r.ext || '[]'); } catch {} for (const x of pls) await orbixCall(env, '/delete-playlist', { playlist_id: /^\d+$/.test(x) ? +x : x }).catch((e) => { if (!/non trovato/i.test(e.message)) throw e; }); }
    else if (r.ext) await mxCall(env, 'DELETE', '/users/' + encodeURIComponent(r.ext)).catch((e) => { if (!/non trovato/i.test(e.message)) throw e; });
    await trashPut(env, 'extlist', r.id, `${r.name || r.username} · ${appLabel(r.app)}`, r, null, who);
    await env.DB.prepare('DELETE FROM ext_lists WHERE id = ?').bind(r.id).run();
    await log(env, 'del', `${who}: lista tolta da ${appLabel(r.app)}${r.name ? ' (' + r.name + ')' : ''}`, ip);
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
    return { group: str(x.group, 40), name, code, note: str(x.note, 120), warn: str(x.warn, 120), link: url(x.link, name), links };
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
    return { name, url, warn: str(x && x.warn, 120) };
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
const PAY_PANELS = new Set(['wolf', 'armada', 'storm', 'atx', 'ora', 'ro', 'slt', 'orcp', 'mxp', 'oxp']);
const AUTO_PAY_PANELS = new Set(['wolf', 'armada', 'storm', 'atx', 'ro', 'slt']);
/* Promemoria dei pagamenti (10 novembre 2026). remind_days: 0 = una volta sola, 1/2/3/7 = ogni N giorni; remind_from = giorno
   da cui partono ('' = da quando deve pagare); remind = 0 spento. Impostazioni → Promemoria pagamenti (payRemind):
   def = promemoria proposto quando si segna «deve pagare» (-1 = spento); ag = cosa possono usare gli agenti, tutto spento
   finché il titolare non lo accende. Il server non lascia mai a un agente un'opzione spenta. */
const PAY_REMIND_DAYS = [0, 1, 2, 3, 7];
function payRemindCfg(s) {
  const o = s && s.payRemind && typeof s.payRemind === 'object' && !Array.isArray(s.payRemind) ? s.payRemind : {};
  const a = o.ag && typeof o.ag === 'object' && !Array.isArray(o.ag) ? o.ag : {};
  const d = o.def === null || o.def === undefined || o.def === '' ? NaN : Number(o.def);
  return { def: d === -1 || PAY_REMIND_DAYS.includes(d) ? d : 2, ag: { on: a.on === true, d0: a.d0 === true, d1: a.d1 === true, d2: a.d2 === true, d3: a.d3 === true, d7: a.d7 === true, from: a.from === true } };
}
/** quello che può usare un agente: frequenze accese, «dal giorno…», e quella proposta (la tua se l'hai accesa, sennò la prima accesa) */
function payRemindAgent(s) {
  const c = payRemindCfg(s), a = c.ag, days = a.on ? PAY_REMIND_DAYS.filter((d) => a['d' + d]) : [];
  const def = days.includes(c.def) ? c.def : [2, 7, 3, 1, 0].find((d) => days.includes(d));
  return { on: days.length > 0, days, from: days.length > 0 && a.from, def: def === undefined ? -1 : def };
}
const paymentToday = () => new Date().toISOString().slice(0, 10);
function paymentEffective(row, today = paymentToday()) {
  if (row.status === 'paid' && row.paid_until && row.paid_until < today)
    return { ...row, status: 'due', since: Date.parse(row.paid_until + 'T00:00:00Z') || +row.since || 0 };
  return row;
}
function paymentAddMonths(months, base = paymentToday()) {
  const d = new Date(base + 'T00:00:00Z'), day = d.getUTCDate();
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + months);
  d.setUTCDate(Math.min(day, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate())); // dal 31 gennaio +1 mese = 28/29 febbraio (prima 3 marzo)
  return d.toISOString().slice(0, 10);
}
const paymentAddDays = (n, base = paymentToday()) => new Date(Date.parse(base + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
async function paymentDeviceOwner(env, id) {
  const d = await env.DB.prepare('SELECT id, parent, owner_id FROM devices WHERE id = ?').bind(id).first();
  if (!d) return null;
  const root = d.parent ? await env.DB.prepare('SELECT owner_id FROM devices WHERE id = ?').bind(d.parent).first() : d;
  return root ? (+root.owner_id || 0) : null;
}
const PAYMENT_PANEL_NAMES = { wolf: 'WOLF', armada: 'Armada', storm: 'Storm', atx: 'Atlantix', ora: 'ORA', ro: 'Realott', slt: 'SLT', orcp: 'MirkoTeam', mxp: 'MaxPlayer', oxp: 'OrbixPlay' };
// Register a panel here only when it has a native, writable line-note field.
const PAYMENT_PANEL_NOTE_WRITERS = {
  wolf: {
    read: async (env, ownerId, ref) => {
      const d = await cronDispatch(env, ownerId, 'GET', '/wolf/lines');
      return (d.lines || []).find((x) => String(x.id) === String(ref));
    },
    note: (line) => line.note || '',
    write: (env, ownerId, ref, note) => cronDispatch(env, ownerId, 'PUT', `/wolf/lines/${encodeURIComponent(ref)}`, { note })
  },
  atx: {
    read: async (env, ownerId, ref) => {
      const d = await cronDispatch(env, ownerId, 'GET', '/atx/lines?all=1');
      return (d.rows || d.lines || []).find((x) => String(x.id || x.user_id || '') === String(ref));
    },
    note: (line) => line.notes || '',
    write: (env, ownerId, ref, note) => cronDispatch(env, ownerId, 'POST', '/atx/lines/action', { action: 'save_notes', user_id: +ref, notes: note })
  },
  ro: {
    read: async (env, ownerId, ref) => {
      const d = await cronDispatch(env, ownerId, 'GET', '/ro/lines');
      return (d.rows || d.lines || []).find((x) => String(x.id || x.user_id || x.username || '') === String(ref));
    },
    note: (line) => line.notes || '',
    write: (env, ownerId, ref, note) => cronDispatch(env, ownerId, 'POST', '/ro/lines/action', { action: 'notes', id: ref, notes: note })
  },
  slt: {
    read: async (env, ownerId, ref) => {
      const d = await cronDispatch(env, ownerId, 'GET', '/slt/lines');
      return (d.rows || d.lines || []).find((x) => String(x.id || x.user_id || x.username || '') === String(ref));
    },
    note: (line) => line.notes || '',
    write: (env, ownerId, ref, note) => cronDispatch(env, ownerId, 'POST', '/slt/lines/action', { action: 'notes', id: ref, notes: note })
  }
};
const PAYMENT_NOTE_TAG = /\s*\[K: [^\]]*\]\s*$/;
function paymentNoteTag(row) {
  if (row.status === 'due') {
    const amount = row.amount == null || row.amount === '' ? '' : ` · ${Number(row.amount).toLocaleString('it-IT', { maximumFractionDigits: 2 })}€`;
    return `[K: DEVE PAGARE ${+row.months || 0} ${+row.months === 1 ? 'mese' : 'mesi'}${amount}]`;
  }
  const d = String(row.paid_until || '');
  const date = /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(2, 4)}` : '';
  return `[K: PAGATO fino al ${date}${+row.auto_months > 0 || row.auto_opt ? ' · rinnovo auto' : ''}]`;
}
function paymentNoteText(current, row) {
  const currentBase = String(current || '').replace(PAYMENT_NOTE_TAG, '').trim();
  const base = String(row.note || '').trim() || currentBase;
  const tag = paymentNoteTag(row);
  return `${base.slice(0, Math.max(0, 300 - tag.length - (base ? 1 : 0)))} ${tag}`.trim();
}
/** nota KAIROS di una linea: nessuna nota oppure scritta da chi ha questo elenco di id (l'agente e i suoi sotto-agenti) */
async function lineNoteMine(env, panel, ref, tree) {
  const row = await env.DB.prepare('SELECT owner_id FROM line_notes WHERE panel = ? AND ref = ?').bind(panel, String(ref || '').toLowerCase()).first();
  return !row || tree.includes(+row.owner_id || 0);
}
/** tree: per un agente i suoi id (la nota KAIROS di un altro non si tocca né si legge); null = titolare */
async function setPanelLineNote(env, panel, ref, mutate, ownerId = 0, tree = null) {
  const panelName = PAYMENT_PANEL_NAMES[panel] || String(panel || '').toUpperCase();
  const writer = PAYMENT_PANEL_NOTE_WRITERS[panel], where = writer ? 'panel' : 'kairos';
  if (writer) {
    const line = await writer.read(env, ownerId, ref);
    if (!line) throw new Error('Linea non trovata');
    const current = String(writer.note(line) || '');
    const next = String(mutate(current) || '').trim().slice(0, 300);
    if (next !== current) await writer.write(env, ownerId, ref, next);
  } else {
    const key = String(ref || '').toLowerCase();
    if (tree && !(await lineNoteMine(env, panel, key, tree))) throw new Error('Nota di un altro');
    const row = await env.DB.prepare('SELECT note FROM line_notes WHERE panel = ? AND ref = ?').bind(panel, key).first();
    const current = String(row && row.note || ''), next = String(mutate(current) || '').trim().slice(0, 300);
    if (next !== current) {
      if (!next) await env.DB.prepare('DELETE FROM line_notes WHERE panel = ? AND ref = ?').bind(panel, key).run();
      else await env.DB.prepare('INSERT INTO line_notes (panel, ref, note, owner_id, updated) VALUES (?, ?, ?, ?, ?) ON CONFLICT(panel, ref) DO UPDATE SET note = excluded.note, owner_id = excluded.owner_id, updated = excluded.updated').bind(panel, key, next, ownerId, now()).run();
    }
  }
  return { ok: true, where, panelName };
}
async function trySetPanelLineNote(env, panel, ref, mutate, ownerId = 0, tree = null) {
  try { return await setPanelLineNote(env, panel, ref, mutate, ownerId, tree); }
  catch { return { ok: false, where: PAYMENT_PANEL_NOTE_WRITERS[panel] ? 'panel' : 'kairos', panelName: PAYMENT_PANEL_NAMES[panel] || String(panel || '').toUpperCase(), error: 'pannello non raggiungibile o linea non trovata' }; }
}
const LEDGER_PANELS = new Set(['', 'wolf', 'armada', 'storm', 'atx', 'ro', 'slt']);
async function agentLedgerDetail(env, agentId, includeBy = true) {
  const [eur, credits, rows] = await Promise.all([
    env.DB.prepare("SELECT SUM(CASE WHEN type = 'debt' THEN eur ELSE -eur END) AS eur FROM agent_ledger WHERE agent_id = ?").bind(agentId).first(),
    env.DB.prepare("SELECT panel, SUM(CASE WHEN type = 'debt' THEN credits ELSE -credits END) AS credits FROM agent_ledger WHERE agent_id = ? GROUP BY panel").bind(agentId).all(),
    env.DB.prepare('SELECT * FROM agent_ledger WHERE agent_id = ? ORDER BY t DESC, id DESC LIMIT 500').bind(agentId).all(),
  ]);
  const rounded = (n) => Math.round(((+n || 0) + Number.EPSILON) * 100) / 100;
  const balance = {
    eur: rounded(eur && eur.eur),
    credits: Object.fromEntries(((credits && credits.results) || []).filter((x) => +x.credits).map((x) => [x.panel || '', rounded(x.credits)])),
  };
  const entries = (rows && rows.results) || [];
  return { balance, entries: includeBy ? entries : entries.map(({ by, ...row }) => row) };
}
function filterLedgerForAgent(detail, allowed) {
  if (allowed === null) return detail;
  const panels = new Set(allowed || []);
  return {
    balance: {
      ...detail.balance,
      credits: Object.fromEntries(Object.entries(detail.balance.credits || {}).filter(([panel]) => panels.has(panel))),
    },
    entries: detail.entries.flatMap((entry) => {
      if (+entry.credits > 0 && !panels.has(entry.panel || '')) {
        return +entry.eur > 0 ? [{ ...entry, credits: 0, panel: '' }] : [];
      }
      return [entry];
    }),
  };
}
async function agentLedgerSummary(env) {
  const totals = ((await env.DB.prepare(`SELECT agent_id, SUM(CASE WHEN type = 'debt' THEN eur ELSE -eur END) AS eur, MAX(t) AS last
    FROM agent_ledger GROUP BY agent_id`).all()).results) || [];
  const credits = ((await env.DB.prepare(`SELECT agent_id, panel, SUM(CASE WHEN type = 'debt' THEN credits ELSE -credits END) AS credits
    FROM agent_ledger GROUP BY agent_id, panel`).all()).results) || [];
  const names = new Map((await agentsAll(env)).map((a) => [a.id, a.username]));
  const byId = new Map();
  for (const row of credits) {
    const item = byId.get(row.agent_id) || {};
    if (+row.credits) item[row.panel || ''] = Math.round((+row.credits + Number.EPSILON) * 100) / 100;
    byId.set(row.agent_id, item);
  }
  return totals.map((row) => ({
    agentId: row.agent_id,
    username: names.get(row.agent_id) || '',
    eur: Math.round((+row.eur + Number.EPSILON) * 100) / 100,
    credits: byId.get(row.agent_id) || {},
    last: row.last,
  }));
}
function cleanAgentLedgerEntry(b) {
  if (!['debt', 'pay'].includes(b.type)) throw new HttpErr(400, 'Tipo di movimento non valido');
  const amount = (value, max, label) => {
    if (value === undefined || value === null || value === '') return 0;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0 || n > max) throw new HttpErr(400, `${label} non valido`);
    return n;
  };
  const eur = amount(b.eur, 100000, 'Importo in euro'), credits = amount(b.credits, 1000000, 'Crediti');
  if (!(eur > 0 || credits > 0)) throw new HttpErr(400, 'Indica un importo in euro o crediti');
  const panel = str(b.panel, 20).toLowerCase();
  if (!LEDGER_PANELS.has(panel)) throw new HttpErr(400, 'Pannello non valido');
  if (b.note !== undefined && (typeof b.note !== 'string' || b.note.length > 200)) throw new HttpErr(400, 'Nota non valida');
  const note = typeof b.note === 'string' ? b.note.trim() : '';
  const date = b.date === undefined ? new Date(now()).toISOString().slice(0, 10) : b.date;
  if (typeof date !== 'string' || !DATE_RE.test(date) || date < '2020-01-01') throw new HttpErr(400, 'Data non valida: scegli una data dal 2020 in poi');
  const today = new Date(now()).toISOString().slice(0, 10);
  const tomorrow = new Date(Date.parse(`${today}T12:00:00Z`) + 864e5).toISOString().slice(0, 10);
  if (date > tomorrow) throw new HttpErr(400, 'La data non può essere oltre domani');
  return { type: b.type, eur, credits, panel, note, date, t: Date.parse(`${date}T12:00:00Z`) };
}
function agentLedgerAudit(e) {
  return `${e.type === 'debt' ? 'debito' : 'pagamento'} · ${new Date(+e.t).toISOString().slice(0, 10)} · ${e.eur} € · ${e.credits} crediti ${e.panel || 'generici'}${e.note ? ` · ${e.note}` : ''}`;
}
async function addAgentLedgerEntry(req, env, who, ip) {
  const b = await readJSON(req, 4096);
  const agentId = Number(b.agent);
  if (!Number.isInteger(agentId) || agentId < 1 || agentId > 999999999 || !(await env.DB.prepare("SELECT id FROM admins WHERE id = ? AND role = 'agent'").bind(agentId).first()))
    throw new HttpErr(400, 'Agente non valido');
  const entry = cleanAgentLedgerEntry(b);
  const result = await env.DB.prepare('INSERT INTO agent_ledger (agent_id, t, type, eur, credits, panel, note, "by") VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(agentId, entry.t, entry.type, entry.eur, entry.credits, entry.panel, entry.note, who).run();
  const id = result.meta && result.meta.last_row_id;
  await log(env, 'edit', `${who}: ${agentLedgerAudit({ ...entry, t: entry.t })} agente · ${agentId}`, ip);
  return { ok: true, id };
}
async function generalHealthCheck(env, fresh = false) {
  const all = await agentsAll(env), owner = { issues: [] };
  const agents = all.map((a) => ({ id: a.id, username: a.username, active: !!a.active, issues: [] }));
  const byId = new Map(agents.map((a) => [a.id, a]));
  const target = (id) => +id ? byId.get(+id) : owner;
  const addIssue = (id, level, area, text, n = 1) => { const x = target(id); if (x) x.issues.push({ level, area, text, n }); };
  const emptyDns = (value) => Array.isArray(value) && !value.length;
  for (const a of all) {
    const p = agentPerms(a.perms);
    if (p.players && emptyDns(p.orbDns)) addIssue(a.id, 'amber', 'OrbixPlay', 'Permesso acceso ma nessun DNS OrbixPlay assegnato');
    if ((p.players || p.mxp) && emptyDns(p.mxDns)) addIssue(a.id, 'amber', 'MaxPlayer', 'Permesso acceso ma nessun DNS MaxPlayer assegnato');
    if (p.oxp && !p.oxpNew) addIssue(a.id, 'amber', 'OrbixPlay', 'Pannello OrbixPlay acceso senza «Può creare playlist»');
  }

  const sources = await catalogSources(env);
  const checked = await catalogCheck(env, [...sources.values()], (s) => `${s.host.replace(/^https?:\/\//, '')} · ${s.user}`, fresh);
  const lineStatus = { expired: 'Scaduta', disabled: 'Disattivata', auth: 'Utente o password errati', timeout: 'Il server non risponde', down: 'Server non raggiungibile' };
  for (const result of checked) {
    if (result.status === 'ok') continue;
    const source = sources.get(result.key);
    const state = result.status === 'http' ? `Errore ${result.code || ''}`.trim() : lineStatus[result.status] || 'Stato non riconosciuto';
    for (const id of source ? source.owners : []) {
      const n = source.ownerDevices && source.ownerDevices.get(id) || result.devices || 0;
      addIssue(id, 'red', 'Linee IPTV', `Linea ${source.user} (${n} clienti): ${state}`, n);
    }
  }

  const missing = ((await env.DB.prepare("SELECT owner_id, COUNT(*) AS n FROM devices WHERE parent = '' AND playlists = '' GROUP BY owner_id").all()).results) || [];
  for (const x of missing) addIssue(x.owner_id, 'amber', 'Clienti', `${x.n} clienti senza playlist`, x.n);
  const expRows = ((await env.DB.prepare("SELECT owner_id, active, expires FROM devices WHERE parent = '' AND active <> 0 AND expires <> ''").all()).results) || [];
  const expired = new Map();
  for (const d of expRows) if (statusOf(d, []) === 'expired') expired.set(+d.owner_id || 0, (expired.get(+d.owner_id || 0) || 0) + 1);
  for (const [id, n] of expired) addIssue(id, 'amber', 'Clienti', `${n} clienti scaduti`, n);

  const t = now(), due = ((await env.DB.prepare("SELECT owner_id, COUNT(*) AS n FROM payments WHERE kind <> 'agent' AND status = 'due' AND (CASE WHEN since > 0 THEN since ELSE updated END) < ? GROUP BY owner_id").bind(t - 30 * 864e5).all()).results) || [];
  for (const x of due) addIssue(x.owner_id, 'amber', 'Pagamenti', `${x.n} pagamenti in sospeso da oltre 30 giorni`, x.n);
  const failures = ((await env.DB.prepare("SELECT owner_id, label, last_result FROM payments WHERE kind <> 'agent' AND updated > ?").bind(t - 48 * 3600e3).all()).results) || [];
  for (const x of failures) if (String(x.last_result || '').startsWith('Errore')) addIssue(x.owner_id, 'red', 'Rinnovo automatico', `${x.label || 'Rinnovo'}: ${x.last_result}`, 1);

  const errors = ((await env.DB.prepare("SELECT d.owner_id, COUNT(*) AS n FROM app_errors e JOIN devices d ON d.id = e.device_id WHERE e.t > ? AND e.outcome = 'non risolto' GROUP BY d.owner_id").bind(t - 24 * 3600e3).all()).results) || [];
  for (const x of errors) if (+x.n >= 5) addIssue(x.owner_id, 'amber', 'Errori app', `${x.n} errori dell'app non risolti nelle ultime 24 ore`, x.n);
  const stalls = ((await env.DB.prepare('SELECT d.owner_id, COUNT(DISTINCT p.device_id) AS n FROM presence p JOIN devices d ON d.id = p.device_id WHERE p.stalls_h > 3 AND p.t > ? GROUP BY d.owner_id').bind(t - 3600e3).all()).results) || [];
  for (const x of stalls) addIssue(x.owner_id, 'amber', 'Buffering', `${x.n} clienti con buffering nell'ultima ora`, x.n);

  const ledgerRows = ((await env.DB.prepare('SELECT agent_id, t, type, eur, credits, panel FROM agent_ledger ORDER BY agent_id, t, id').all()).results) || [];
  const queues = new Map(), debtForAgent = new Map(), cutoff = t - 30 * 864e5;
  const applyLedger = (key, value, isDebt, time) => {
    if (!(value > 0)) return;
    const state = queues.get(key) || { credit: 0, debts: [] };
    let rest = value;
    if (isDebt) {
      const used = Math.min(rest, state.credit); state.credit -= used; rest -= used;
      if (rest > 0) state.debts.push({ t: time, amount: rest });
    } else {
      while (rest > 0 && state.debts.length) {
        const first = state.debts[0], used = Math.min(rest, first.amount);
        first.amount -= used; rest -= used;
        if (first.amount <= 0.000001) state.debts.shift();
      }
      if (rest > 0) state.credit += rest;
    }
    queues.set(key, state);
  };
  for (const row of ledgerRows) {
    const agentId = +row.agent_id || 0, debt = row.type === 'debt', time = +row.t || 0;
    applyLedger(`${agentId}|eur`, +row.eur || 0, debt, time);
    applyLedger(`${agentId}|cr|${row.panel || ''}`, +row.credits || 0, debt, time);
  }
  for (const [key, state] of queues) {
    const [id, type, panel] = key.split('|');
    for (const debt of state.debts) {
      if (!(debt.amount > 0)) continue;
      const item = debtForAgent.get(+id) || { eur: 0, credits: {}, oldest: Infinity };
      if (type === 'eur') item.eur += debt.amount;
      else item.credits[panel] = (item.credits[panel] || 0) + debt.amount;
      item.oldest = Math.min(item.oldest, debt.t);
      debtForAgent.set(+id, item);
    }
  }
  for (const [id, balance] of debtForAgent) {
    if (balance.oldest >= cutoff) continue;
    const amounts = [balance.eur > 0 ? `${balance.eur.toLocaleString('it-IT', { maximumFractionDigits: 2 })} €` : '', ...Object.entries(balance.credits).filter(([, n]) => n > 0).map(([panel, n]) => `${n.toLocaleString('it-IT', { maximumFractionDigits: 2 })} crediti${panel ? ' ' + panel.toUpperCase() : ''}`)].filter(Boolean).join(' · ');
    const date = new Date(balance.oldest).toISOString().slice(0, 10);
    addIssue(id, 'amber', 'Debito agente', `Debito: ${amounts} · il più vecchio dal ${date}`, 1);
  }
  return { t, owner, agents };
}
async function paymentsRoutes(req, env, who, ip, ag) {
  const m = req.method;
  if (m === 'GET') {
    // il promemoria di un cliente segue il cliente: owner_id è quello di adesso (passato a un altro agente, agente eliminato…)
    const rows = (((await env.DB.prepare("SELECT pm.*, CASE WHEN pm.kind = 'device' THEN COALESCE(CASE WHEN d.parent = '' THEN d.owner_id ELSE p.owner_id END, pm.owner_id) ELSE pm.owner_id END AS cur_owner FROM payments pm LEFT JOIN devices d ON pm.kind = 'device' AND d.id = pm.ref LEFT JOIN devices p ON p.id = d.parent ORDER BY pm.updated DESC LIMIT 10000").all()).results) || [])
      .map(({ cur_owner, ...r }) => ({ ...r, owner_id: cur_owner ?? r.owner_id }));
    const visible = ag
      ? rows.filter((r) => ['line', 'device'].includes(r.kind) && ag.tree.includes(+r.owner_id || 0))
      : rows.filter((r) => r.kind !== 'agent');
    return json({ rows: visible.map((r) => paymentEffective(r)) });
  }
  if (m !== 'PUT') throw new HttpErr(405, 'Metodo non consentito');
  const b = await readJSON(req, 4096);
  const kind = str(b.kind, 12);
  if (kind === 'agent') throw new HttpErr(400, 'Usa Debito agente');
  const panel = kind === 'line' ? str(b.panel, 20).toLowerCase() : '';
  const rawRef = str(b.ref, 120), ref = kind === 'line' ? rawRef.toLowerCase() : rawRef;
  if (!['line', 'device'].includes(kind) || !ref || (kind === 'line' && !PAY_PANELS.has(panel)) || (kind !== 'line' && b.panel && str(b.panel, 20)))
    throw new HttpErr(400, 'Cliente o linea non validi');
  if (kind === 'device' && !/^[A-Za-z0-9_-]{6,20}$/.test(ref))
    throw new HttpErr(400, 'Riferimento non valido');
  const old = await env.DB.prepare('SELECT * FROM payments WHERE kind = ? AND panel = ? AND ref = ?').bind(kind, panel, ref).first();
  let ownerId = Number.isInteger(+b.ownerId) && +b.ownerId >= 0 ? +b.ownerId : 0;
  if (kind === 'device') {
    const deviceOwner = await paymentDeviceOwner(env, ref);
    if (deviceOwner === null) throw new HttpErr(404, 'Cliente non trovato');
    ownerId = deviceOwner;
  }
  if (ag) {
    if (kind === 'device') {
      // basta che il cliente sia suo adesso: il promemoria lasciato da chi lo aveva prima passa a lui
      if (!(await ag.own(ref))) throw new HttpErr(404, 'Cliente non trovato');
    } else {
      if (old && !ag.tree.includes(+old.owner_id || 0)) throw new HttpErr(403, 'Non puoi gestire i pagamenti di questa linea');
      ownerId = ag.id;
    }
  }
  const status = b.status === '' ? '' : str(b.status, 8);
  if (!['', 'due', 'paid'].includes(status)) throw new HttpErr(400, 'Stato del pagamento non valido');
  if (!status) {
    let panelNote = null;
    if (old) {
      await env.DB.prepare('DELETE FROM payments WHERE kind = ? AND panel = ? AND ref = ?').bind(kind, panel, ref).run();
      if (kind === 'line') panelNote = await trySetPanelLineNote(env, panel, ref, (current) => String(current || '').replace(PAYMENT_NOTE_TAG, '').trim(), ownerId, ag ? ag.tree : null);
      const noteResult = panelNote ? ` · nota ${panelNote.ok ? panelNote.where === 'panel' ? 'aggiornata su ' + panelNote.panelName : 'aggiornata in KAIROS' : 'non aggiornata'}` : '';
      await log(env, 'edit', `${who}: promemoria di pagamento rimosso (${panel || kind})${noteResult}`, ip).catch(() => {});
    }
    return json({ ok: true, deleted: !!old, ...(panelNote ? { panelNote } : {}) });
  }
  if (b.months !== undefined && String(b.months).trim() === '') throw new HttpErr(400, 'I mesi devono essere da 0 a 120');
  const months = b.months === undefined ? (+old?.months || 0) : Number(b.months);
  if (!Number.isInteger(months) || months < 0 || months > 120) throw new HttpErr(400, 'I mesi devono essere da 0 a 120');
  const amount = b.amount === undefined || b.amount === null || b.amount === '' ? null : Number(b.amount);
  if (amount !== null && (!Number.isFinite(amount) || amount < 0 || amount > 100000)) throw new HttpErr(400, 'L’importo deve essere da 0 a 100000 euro');
  if (b.note !== undefined && typeof b.note !== 'string') throw new HttpErr(400, 'Nota non valida');
  const note = b.note === undefined ? old?.note || '' : b.note.trim();
  if (note.length > 200) throw new HttpErr(400, 'La nota può contenere al massimo 200 caratteri');
  let autoMonths = +old?.auto_months || 0, autoOpt = old?.auto_opt || '', autoLine = old?.auto_line || '';
  const autoTouched = ['autoMonths', 'autoOpt', 'autoLine'].some((k) => Object.prototype.hasOwnProperty.call(b, k));
  if (autoTouched && kind === 'line' && !AUTO_PAY_PANELS.has(panel)) throw new HttpErr(400, 'Rinnovo automatico non disponibile su questo pannello');
  if (autoTouched) {
    autoMonths = b.autoMonths === undefined || b.autoMonths === '' ? 0 : Number(b.autoMonths);
    autoOpt = b.autoOpt === undefined ? '' : str(b.autoOpt, 80).trim();
    if (!Number.isInteger(autoMonths) || autoMonths < 0 || autoMonths > 12) throw new HttpErr(400, 'Periodo automatico non valido');
    const enabled = autoMonths > 0 || !!autoOpt || !!b.autoLine;
    if (enabled && !(kind === 'device' || kind === 'line' && AUTO_PAY_PANELS.has(panel))) throw new HttpErr(400, 'Rinnovo automatico non disponibile su questo pannello');
    if (enabled && ag && !ag.autoRenew) throw new HttpErr(403, 'Non puoi usare il rinnovo automatico');
    if (!enabled) { autoMonths = 0; autoOpt = ''; autoLine = ''; }
    else if (kind === 'device') {
      if (autoMonths < 1 || autoMonths > 12 || autoOpt || b.autoLine) throw new HttpErr(400, 'Scegli un rinnovo da 1 a 12 mesi');
      autoLine = '';
    } else {
      let line = b.autoLine;
      if (typeof line === 'string') { try { line = JSON.parse(line); } catch { line = line.trim(); } }
      if (panel === 'armada' || panel === 'storm') {
        if (!line || typeof line !== 'object') throw new HttpErr(400, 'Linea automatica non valida');
        const type = line.type === 'mag' ? 'mag' : line.type === 'm3u' ? 'm3u' : '';
        const username = type === 'm3u' ? str(line.username, 120).trim() : '';
        const mac = type === 'mag' ? str(line.mac, 32).trim() : '';
        if (!type || (type === 'm3u' ? !username || !/^[\w.@-]{1,120}$/.test(username) : !/^(?:[0-9A-Fa-f]{2}[:-]?){6}$/.test(mac))) throw new HttpErr(400, 'Linea automatica non valida');
        autoLine = JSON.stringify(type === 'm3u' ? { type, username } : { type, mac });
        if (![1, 3, 6, 12].includes(autoMonths) || autoOpt) throw new HttpErr(400, 'Scegli 1, 3, 6 o 12 mesi');
      } else {
        const id = typeof line === 'object' && line ? String(line.id || '') : String(line || '');
        const validId = panel === 'wolf' || panel === 'atx' ? /^\d{1,12}$/.test(id) : /^[A-Za-z0-9_-]{1,80}$/.test(id);
        if (!validId) throw new HttpErr(400, 'Linea automatica non valida');
        autoLine = id;
        if (panel === 'atx') {
          if (![1, 2, 3, 6, 12].includes(autoMonths) || autoOpt) throw new HttpErr(400, 'Scegli 1, 2, 3, 6 o 12 mesi');
        } else if (panel === 'wolf' || panel === 'ro' || panel === 'slt') {
          if (autoMonths || !/^[A-Za-z0-9_-]{1,80}$/.test(autoOpt)) throw new HttpErr(400, 'Scegli il pacchetto');
        }
      }
    }
  }
  let paidUntil = '';
  if (status === 'paid') {
    paidUntil = str(b.paidUntil, 10) || paymentAddMonths(months);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paidUntil) || !DATE_RE.test(paidUntil)) throw new HttpErr(400, 'Data «Pagato fino al» non valida');
  }
  const label = str(b.label, 160) || (old && old.label) || ref;
  // promemoria: interruttore, ogni quanto e da quale giorno. Senza indicazioni vale quello proposto nelle impostazioni
  const prS = await getSettings(env), prA = ag ? payRemindAgent(prS) : null, prDef = ag ? prA.def : payRemindCfg(prS).def;
  let remind = b.remind === undefined ? (old ? +old.remind : prDef >= 0 ? 1 : 0) : (b.remind === true || b.remind === 1 ? 1 : 0);
  const rdIn = b.remindDays === undefined || b.remindDays === null || b.remindDays === '' ? null : Number(b.remindDays);
  if (rdIn !== null && !PAY_REMIND_DAYS.includes(rdIn)) throw new HttpErr(400, 'Promemoria non valido: scegli una volta, ogni 1, 2, 3 o 7 giorni');
  let remindDays = rdIn !== null ? rdIn : old && old.remind_days !== undefined && old.remind_days !== null ? +old.remind_days : prDef >= 0 ? prDef : 2;
  let remindFrom = b.remindFrom === undefined ? String((old && old.remind_from) || '') : str(b.remindFrom, 10);
  if (remindFrom && (!/^\d{4}-\d{2}-\d{2}$/.test(remindFrom) || !DATE_RE.test(remindFrom))) throw new HttpErr(400, 'Giorno del promemoria non valido');
  if (prA) { // agente: solo le opzioni che il titolare ha acceso (le altre si adattano, mai oltre quello che ha deciso)
    if (!prA.on) remind = 0;
    else if (!prA.days.includes(remindDays)) remindDays = prA.def >= 0 ? prA.def : prA.days[0];
    if (!prA.from) remindFrom = '';
  }
  if (remindDays === 0 && remind && !remindFrom) remindFrom = paymentAddDays(1); // «una volta sola» senza giorno: domani
  const t = now();
  // resta «deve pagare» (cambiano nota, importo o avviso): i giorni contano da quando deve pagare, non dall'ultima modifica
  const was = old ? paymentEffective(old) : null, since = status === 'due' && was && was.status === 'due' && +was.since > 0 ? +was.since : t;
  await env.DB.prepare(`INSERT INTO payments (kind, panel, ref, owner_id, label, status, months, amount, note, since, paid_until, remind, updated, auto_months, auto_opt, auto_line, remind_days, remind_from)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(kind, panel, ref) DO UPDATE SET owner_id = excluded.owner_id, label = excluded.label, status = excluded.status,
    months = excluded.months, amount = excluded.amount, note = excluded.note, since = excluded.since, paid_until = excluded.paid_until,
    remind = excluded.remind, updated = excluded.updated, auto_months = excluded.auto_months, auto_opt = excluded.auto_opt, auto_line = excluded.auto_line,
    remind_days = excluded.remind_days, remind_from = excluded.remind_from`)
    .bind(kind, panel, ref, ownerId, label, status, months, amount, note, since, paidUntil, remind, t, autoMonths, autoOpt, autoLine, remindDays, remindFrom).run();
  let panelNote = null;
  if (kind === 'line') {
    const payment = { status, months, amount, note, paid_until: paidUntil, auto_months: autoMonths, auto_opt: autoOpt };
    panelNote = await trySetPanelLineNote(env, panel, ref, (current) => paymentNoteText(current, payment), ownerId, ag ? ag.tree : null);
  }
  // il cliente allineato a questa linea vede subito il «Pagato fino al», se è più avanti della scadenza che ha adesso
  let clientDate = 0;
  if (kind === 'line' && status === 'paid') clientDate = await linePaidApplyNow(env, panel, ref, label, ag).catch(() => 0);
  const noteResult = panelNote ? ` · nota ${panelNote.ok ? panelNote.where === 'panel' ? 'scritta su ' + panelNote.panelName : 'salvata in KAIROS' : 'non scritta'}` : '';
  await log(env, 'edit', `${who}: pagamento ${status === 'due' ? 'da riscuotere' : 'segnato pagato'} (${panel || kind})${noteResult}`, ip).catch(() => {});
  return json({ ok: true, row: paymentEffective({ kind, panel, ref, owner_id: ownerId, label, status, months, amount, note, since, paid_until: paidUntil, remind, remind_days: remindDays, remind_from: remindFrom, updated: t, auto_months: autoMonths, auto_opt: autoOpt, auto_line: autoLine, last_renew: old?.last_renew || '', last_result: old?.last_result || '' }), ...(panelNote ? { panelNote } : {}), ...(clientDate ? { clientDate } : {}) });
}
const LINE_SYNC_PANELS = new Set(['wolf', 'armada', 'storm', 'atx', 'ro', 'slt']);
function lineSyncDate(v) {
  const s = String(v ?? '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return DATE_RE.test(s) ? s : '';
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return '';
  const d = new Date(n < 1e12 ? n * 1000 : n);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}
/* Data che il cliente allineato a una linea vede nell'app. Di base è la scadenza della linea; ma chi rinnova la linea un mese
   alla volta e ha incassato più mesi mostrerebbe al cliente la data sbagliata. Quindi vale la più avanti fra:
   - la scadenza della linea sul pannello;
   - il «Pagato fino al» registrato per quella linea (💶, lo stesso che finisce nella nota come «[K: PAGATO fino al …]»);
   - la data fissata a mano per quel cliente (line_sync.hold: di solito quella scritta nella nota della linea).
   Quando la linea raggiunge quella data si torna a seguire la linea. */
async function linePaidMap(env, panel) {
  const rows = ((await env.DB.prepare("SELECT ref, label, owner_id, paid_until FROM payments WHERE kind = 'line' AND panel = ? AND status = 'paid' AND paid_until <> ''").bind(panel).all()).results) || [];
  const today = paymentToday(), map = new Map();
  // il riferimento del pagamento è il nome utente su Armada/Storm (e a volte su Realott/SLT); su WOLF e Atlantix è il numero
  // della linea, e il nome utente sta nell'etichetta
  const byRef = panel === 'armada' || panel === 'storm' || panel === 'ro' || panel === 'slt';
  for (const r of rows) {
    if (!DATE_RE.test(String(r.paid_until)) || r.paid_until < today) continue; // scaduto: è di nuovo «deve pagare»
    const ref = String(r.ref || '').trim().toLowerCase(), label = String(r.label || '').trim().toLowerCase();
    const keys = new Set();
    if (label && (byRef || label !== ref)) keys.add(label);
    if (byRef && ref) keys.add(ref);
    for (const k of keys) { if (!map.has(k)) map.set(k, []); map.get(k).push({ owner: +r.owner_id || 0, until: r.paid_until }); }
  }
  return map;
}
function linePaidFor(map, username, ownerId) {
  const list = map.get(String(username || '').trim().toLowerCase()) || [];
  if (!list.length) return '';
  // prima il pagamento di chi ha il cliente; se non c'è e tutti i pagamenti con quel nome sono della stessa persona, quello
  const mine = list.filter((x) => x.owner === (+ownerId || 0));
  const pick = mine.length ? mine : new Set(list.map((x) => x.owner)).size === 1 ? list : [];
  return pick.reduce((a, x) => (x.until > a ? x.until : a), '');
}
/* Data scritta nella nota di una linea. Stesse regole di line-note-box.js (datesIn, dateOf): le due versioni vanno tenute
   uguali, le confronta la prova srv_line_src. Prima il segno dei pagamenti «PAGATO fino al gg/mm/aa», altrimenti la data più
   avanti fra quelle scritte a mano. ref = scadenza della linea: dà l'anno alle date senza anno («21/02»). '' = nessuna data. */
const NOTE_MON = { gen: 1, feb: 2, mar: 3, apr: 4, mag: 5, giu: 6, lug: 7, ago: 8, set: 9, ott: 10, nov: 11, dic: 12 };
function noteDatesIn(note, ref) {
  const pad = (n) => String(n).padStart(2, '0'), ms = (ymd) => Date.parse(ymd + 'T00:00:00Z'), today = paymentToday();
  const ymdOf = (y, m, d) => { const t = new Date(Date.UTC(y, m - 1, d)); return m >= 1 && m <= 12 && d >= 1 && t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : ''; };
  const s = String(note || ''), out = [], base = ms(/^\d{4}-\d{2}-\d{2}$/.test(ref || '') ? ref : today);
  const yr = (v) => (v.length === 2 ? 2000 + +v : +v);
  const noYear = (m, d) => { const y0 = new Date(base).getUTCFullYear(); for (const y of [y0 - 1, y0, y0 + 1]) { const v = ymdOf(y, m, d); if (v && ms(v) >= base - 31 * 864e5) return v; } return ''; };
  let m;
  const iso = /(^|[^\d])(\d{4})-(\d{2})-(\d{2})(?!\d)/g;
  while ((m = iso.exec(s))) { const v = ymdOf(+m[2], +m[3], +m[4]); if (v) out.push(v); }
  const num = /(^|[^\d\/.-])(\d{1,2})([\/.-])(\d{1,2})(?:\3(\d{4}|\d{2}))?(?![\d\/.-])/g;
  while ((m = num.exec(s))) {
    if (!m[5] && m[3] !== '/') continue;
    const v = m[5] ? ymdOf(yr(m[5]), +m[4], +m[2]) : noYear(+m[4], +m[2]);
    if (v) out.push(v);
  }
  const txt = /(^|[^\d])(\d{1,2})°?\s*(gen|feb|mar|apr|mag|giu|lug|ago|set|ott|nov|dic)[a-zà]*\.?(?:\s+(\d{4}|\d{2}))?(?![\d])/gi;
  while ((m = txt.exec(s))) { const mo = NOTE_MON[m[3].toLowerCase()], v = m[4] ? ymdOf(yr(m[4]), mo, +m[2]) : noYear(mo, +m[2]); if (v) out.push(v); }
  const lo = ms(today) - 400 * 864e5, hi = ms(today) + (3 * 366 + 31) * 864e5;
  return [...new Set(out)].filter((v) => ms(v) >= lo && ms(v) <= hi);
}
function noteDateOf(note, ref) {
  const s = String(note || ''), k = s.match(/PAGATO\s+fino\s+al\s+(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})/i);
  if (k) { const d = noteDatesIn(k[1], ref); if (d.length) return d[0]; }
  const all = noteDatesIn(s.replace(/\[K:[^\]]*\]/g, ' '), ref);
  return all.length ? all.sort().pop() : '';
}
/* src = scelta fatta nella scheda del cliente (line_sync.src): 'note' = la scadenza dell'app è la data scritta nella nota
   della linea (noteDate), anche quando è prima della scadenza della linea; se nella nota non c'è una data vale la regola
   di sempre. past = la data della nota è già passata: chi chiama non la applica da sola. */
function lineSyncTarget(exp, paid, hold, src = '', noteDate = '') {
  if (src === 'note' && noteDate && /^\d{4}-\d{2}-\d{2}$/.test(noteDate) && DATE_RE.test(noteDate)) return { date: noteDate, src: 'note', past: noteDate < paymentToday() };
  let date = exp, from = 'line';
  if (paid && DATE_RE.test(paid) && paid > date) { date = paid; from = 'paid'; }
  if (hold && DATE_RE.test(hold) && hold > date) { date = hold; from = 'hold'; }
  return { date, src: from };
}
const LINE_SYNC_WHY = { paid: 'pagato fino al', hold: 'data fissata dalla nota', note: 'data della nota, scelta nella scheda' };
async function applyLineSync(env, panel, lines, ownerId, ag) {
  if (!LINE_SYNC_PANELS.has(panel)) throw new HttpErr(400, 'Pannello non valido');
  if (!Array.isArray(lines) || lines.length > 5000) throw new HttpErr(400, 'Elenco linee non valido');
  const expiry = new Map(), notes = new Map(); // notes: solo le linee arrivate con il campo «note» (la nota che hanno nel loro pannello)
  for (const line of lines) {
    const username = str(line && line.username, 120).trim().toLowerCase(), exp = lineSyncDate(line && line.exp);
    if (username && exp) { expiry.set(username, exp); if (typeof line.note === 'string') notes.set(username, line.note.slice(0, 400)); }
  }
  const query = ownerId === undefined
    ? env.DB.prepare('SELECT * FROM line_sync WHERE panel = ?').bind(panel)
    : env.DB.prepare('SELECT * FROM line_sync WHERE panel = ? AND owner_id = ?').bind(panel, ownerId);
  const links = ((await query.all()).results) || [];
  const paid = links.length && expiry.size ? await linePaidMap(env, panel) : new Map();
  let changed = 0;
  for (const link of links) {
    const key = String(link.username || '').trim().toLowerCase(), exp = expiry.get(key);
    if (!exp) continue;
    let noteDate = '';
    if (link.src === 'note') {
      // scadenza dell'app «dalla nota»: la nota arriva con l'elenco; per i pannelli senza campo nota è quella tenuta in KAIROS
      let note = notes.get(key);
      if (!note) {
        const kn = await env.DB.prepare('SELECT note, owner_id FROM line_notes WHERE panel = ? AND ref = ?').bind(panel, key).first().catch(() => null);
        if (kn && kn.note && (!ag || (+kn.owner_id || 0) === (+link.owner_id || 0))) note = String(kn.note);
      }
      if (note === undefined) continue; // nota non arrivata (pagina vecchia rimasta aperta): non si tocca, ci pensa il prossimo allineamento
      noteDate = noteDateOf(note, exp);
    }
    const want = lineSyncTarget(exp, linePaidFor(paid, link.username, link.owner_id), link.hold, link.src, noteDate);
    if (want.past) continue; // data della nota già passata: non si applica da sola (il cliente risulterebbe scaduto per una data vecchia)
    const device = await env.DB.prepare('SELECT id, name, expires, parent FROM devices WHERE id = ?').bind(link.device_id).first();
    if (!device || !device.expires || device.parent || device.expires === want.date) continue;
    if (ag && !(await ag.own(device.id))) continue;
    if (ag && Date.parse(want.date + 'T00:00:00Z') - now() > 3 * 366 * 864e5) continue; // agenti: scadenza massima 3 anni, come dalla scheda del cliente
    await env.DB.prepare('UPDATE devices SET expires = ? WHERE id = ?').bind(want.date, device.id).run();
    await log(env, 'edit', `Scadenza di ${device.name || device.id} allineata alla linea ${panel} ${link.username}: ${want.date}${want.src === 'line' ? '' : ` (${LINE_SYNC_WHY[want.src]}; la linea scade il ${exp})`}`, '').catch(() => {});
    changed++;
  }
  return changed;
}
/** appena si registra un «Pagato fino al» su una linea, il cliente allineato vede subito quella data (solo in avanti: se la
    data scende o il pagamento si toglie, ci pensa il prossimo allineamento, che conosce la scadenza della linea) */
async function linePaidApplyNow(env, panel, ref, label, ag) {
  if (!LINE_SYNC_PANELS.has(panel)) return 0;
  const names = [...new Set([String(label || '').trim().toLowerCase(), String(ref || '').trim().toLowerCase()].filter(Boolean))];
  if (!names.length) return 0;
  const links = ((await env.DB.prepare(`SELECT * FROM line_sync WHERE panel = ? AND lower(username) IN (${names.map(() => '?').join(',')})`).bind(panel, ...names).all()).results) || [];
  if (!links.length) return 0;
  const paid = await linePaidMap(env, panel);
  let changed = 0;
  for (const link of links) {
    const until = linePaidFor(paid, link.username, link.owner_id);
    if (!until) continue;
    const device = await env.DB.prepare('SELECT id, name, expires, parent FROM devices WHERE id = ?').bind(link.device_id).first();
    if (!device || !device.expires || device.parent || device.expires >= until) continue;
    if (ag && !(await ag.own(device.id))) continue;
    if (ag && Date.parse(until + 'T00:00:00Z') - now() > 3 * 366 * 864e5) continue;
    await env.DB.prepare('UPDATE devices SET expires = ? WHERE id = ?').bind(until, device.id).run();
    await log(env, 'edit', `Scadenza di ${device.name || device.id} portata al «Pagato fino al» della linea ${panel} ${link.username}: ${until}`, '').catch(() => {});
    changed++;
  }
  return changed;
}
async function lineSyncRoutes(req, env, path, who, ip, ag, ownerFilter) {
  const m = req.method, url = new URL(req.url);
  if (path === '/line-sync/apply') {
    if (m !== 'POST') throw new HttpErr(405, 'Metodo non consentito');
    const b = await readJSON(req, 3 * 1024 * 1024), panel = str(b.panel, 20).toLowerCase(); // con le note delle linee
    const changed = await applyLineSync(env, panel, b.lines, ownerFilter, ag);
    return json({ ok: true, changed });
  }
  if (path === '/line-sync/hold') {
    // data fissata per il cliente (di solito quella scritta a mano nella nota della linea); date '' = torna a seguire la
    // linea; senza date = non cambia nulla, rimette solo subito la data giusta sul cliente
    if (m !== 'PUT') throw new HttpErr(405, 'Metodo non consentito');
    const b = await readJSON(req, 4096), deviceId = str(b.deviceId, 40);
    if (!deviceId) throw new HttpErr(400, 'Cliente non valido');
    const device = await env.DB.prepare('SELECT id, name, expires, parent FROM devices WHERE id = ?').bind(deviceId).first();
    if (!device || ag && !(await ag.own(deviceId))) throw new HttpErr(404, 'Cliente non trovato');
    const link = await env.DB.prepare('SELECT * FROM line_sync WHERE device_id = ?').bind(deviceId).first();
    if (!link) throw new HttpErr(400, 'Questo cliente non è allineato a una linea');
    const set = b.date !== undefined && b.date !== null;
    if (set && typeof b.date !== 'string') throw new HttpErr(400, 'Data non valida');
    const date = set ? b.date.trim().slice(0, 10) : String(link.hold || '');
    if (set && date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !DATE_RE.test(date)) throw new HttpErr(400, 'Data non valida');
      if (date <= paymentToday()) throw new HttpErr(400, 'La data deve essere futura');
      if (Date.parse(date + 'T00:00:00Z') - now() > (ag ? 3 : 10) * 366 * 864e5) throw new HttpErr(400, ag ? 'Scadenza massima: 3 anni' : 'Data troppo lontana: controlla l’anno');
    }
    if (set) {
      await env.DB.prepare('UPDATE line_sync SET hold = ?, updated = ? WHERE device_id = ?').bind(date, now(), deviceId).run();
      await log(env, 'edit', `${who}: ${date ? `data del cliente ${device.name || device.id} fissata al ${date}` : `il cliente ${device.name || device.id} torna a seguire la scadenza`} (linea ${link.panel} ${link.username})`, ip).catch(() => {});
    }
    // subito sul cliente: con la scadenza della linea (la manda il pannello, come per l'allineamento) si ricalcola la data giusta
    const lineExp = lineSyncDate(b.lineExp);
    if (lineExp) await applyLineSync(env, String(link.panel), [{ username: link.username, exp: lineExp }], ownerFilter, ag);
    else if (set && date && device.expires && !device.parent && date > device.expires) await env.DB.prepare('UPDATE devices SET expires = ? WHERE id = ?').bind(date, deviceId).run();
    const after = await env.DB.prepare('SELECT expires FROM devices WHERE id = ?').bind(deviceId).first();
    const paid = LINE_SYNC_PANELS.has(String(link.panel)) ? linePaidFor(await linePaidMap(env, String(link.panel)), link.username, link.owner_id) : '';
    return json({ ok: true, hold: date, paid, expires: (after && after.expires) || '' });
  }
  if (path === '/line-sync/src') {
    // da dove viene la scadenza che il cliente vede nell'app: 'line' = dalla scadenza della linea (con «Pagato fino al» e data
    // fissata, come sempre), 'note' = dalla data scritta nella nota della linea. Si applica subito: scadenza e nota le manda il pannello
    if (m !== 'PUT') throw new HttpErr(405, 'Metodo non consentito');
    const b = await readJSON(req, 8192), deviceId = str(b.deviceId, 40);
    if (!deviceId) throw new HttpErr(400, 'Cliente non valido');
    if (b.src !== 'line' && b.src !== 'note') throw new HttpErr(400, 'Scelta non valida');
    const device = await env.DB.prepare('SELECT id, name, expires, parent FROM devices WHERE id = ?').bind(deviceId).first();
    if (!device || ag && !(await ag.own(deviceId))) throw new HttpErr(404, 'Cliente non trovato');
    const link = await env.DB.prepare('SELECT * FROM line_sync WHERE device_id = ?').bind(deviceId).first();
    if (!link) throw new HttpErr(400, 'Questo cliente non è allineato a una linea');
    const src = b.src === 'note' ? 'note' : '';
    if (String(link.src || '') !== src) {
      await env.DB.prepare('UPDATE line_sync SET src = ?, updated = ? WHERE device_id = ?').bind(src, now(), deviceId).run();
      await log(env, 'edit', `${who}: scadenza del cliente ${device.name || device.id} ${src ? 'dalla nota della linea' : 'dalla scadenza della linea'} (linea ${link.panel} ${link.username})`, ip).catch(() => {});
    }
    const lineExp = lineSyncDate(b.lineExp);
    if (lineExp) await applyLineSync(env, String(link.panel), [{ username: link.username, exp: lineExp, ...(typeof b.note === 'string' ? { note: b.note } : {}) }], ownerFilter, ag);
    const after = await env.DB.prepare('SELECT expires FROM devices WHERE id = ?').bind(deviceId).first();
    const paid = LINE_SYNC_PANELS.has(String(link.panel)) ? linePaidFor(await linePaidMap(env, String(link.panel)), link.username, link.owner_id) : '';
    return json({ ok: true, src: src || 'line', hold: String(link.hold || ''), paid, expires: (after && after.expires) || '' });
  }
  if (path !== '/line-sync') throw new HttpErr(404, 'Non trovato');
  if (m === 'GET') {
    const deviceId = str(url.searchParams.get('deviceId'), 40);
    if (!deviceId) throw new HttpErr(400, 'Cliente non valido');
    const device = await env.DB.prepare('SELECT id FROM devices WHERE id = ?').bind(deviceId).first();
    if (!device || ag && !(await ag.own(deviceId))) throw new HttpErr(404, 'Cliente non trovato');
    const link = await env.DB.prepare('SELECT panel, username, owner_id, updated, hold, src FROM line_sync WHERE device_id = ?').bind(deviceId).first();
    if (link) link.src = link.src === 'note' ? 'note' : 'line'; // da dove viene la scadenza dell'app: linea o nota della linea
    // paid = «Pagato fino al» della linea, se c'è: è la data che il cliente vede quando è più avanti della scadenza della linea
    if (link) link.paid = LINE_SYNC_PANELS.has(String(link.panel)) ? linePaidFor(await linePaidMap(env, String(link.panel)), link.username, link.owner_id) : '';
    return json({ link: link || null });
  }
  if (m === 'PUT') {
    const b = await readJSON(req, 4096), deviceId = str(b.deviceId, 40), panel = str(b.panel, 20).toLowerCase(), username = str(b.username, 120).trim();
    if (!deviceId || !LINE_SYNC_PANELS.has(panel) || !username) throw new HttpErr(400, 'Collegamento linea non valido');
    const device = await env.DB.prepare('SELECT id, owner_id, parent FROM devices WHERE id = ?').bind(deviceId).first();
    if (!device || ag && !(await ag.own(deviceId))) throw new HttpErr(404, 'Cliente non trovato');
    if (device.parent) throw new HttpErr(400, 'Collega solo il cliente principale');
    const ownerId = +device.owner_id || 0;
    // src (facoltativo): 'note' = scadenza dell'app dalla nota della linea, 'line' = dalla scadenza della linea. Non detto:
    // resta la scelta di prima se la linea è la stessa, altrimenti si riparte dalla linea
    const old = await env.DB.prepare('SELECT panel, username, src FROM line_sync WHERE device_id = ?').bind(deviceId).first();
    const same = !!old && String(old.panel) === panel && String(old.username || '').toLowerCase() === username.toLowerCase();
    const src = b.src === 'note' ? 'note' : b.src === 'line' ? '' : same ? String(old.src || '') : '';
    await env.DB.prepare(`INSERT INTO line_sync (device_id, panel, username, owner_id, updated, src) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(device_id) DO UPDATE SET hold = CASE WHEN line_sync.panel = excluded.panel AND lower(line_sync.username) = lower(excluded.username) THEN line_sync.hold ELSE '' END,
        panel = excluded.panel, username = excluded.username, owner_id = excluded.owner_id, updated = excluded.updated, src = excluded.src`)
      .bind(deviceId, panel, username, ownerId, now(), src).run();
    return json({ ok: true, src: src || 'line' });
  }
  if (m === 'DELETE') {
    const b = await readJSON(req, 4096), deviceId = str(b.deviceId, 40);
    if (!deviceId) throw new HttpErr(400, 'Cliente non valido');
    if (ag && !(await ag.own(deviceId))) throw new HttpErr(404, 'Cliente non trovato');
    await env.DB.prepare('DELETE FROM line_sync WHERE device_id = ?').bind(deviceId).run();
    return json({ ok: true });
  }
  throw new HttpErr(405, 'Metodo non consentito');
}
async function cronDispatch(env, ownerId, method, path, body) {
  const settings = ownerId ? await getSettings(env) : null;
  const agent = ownerId ? await env.DB.prepare("SELECT username FROM admins WHERE id = ? AND role = 'agent'").bind(ownerId).first() : null;
  const host = String(settings && settings.agentHost || 'localhost');
  const url = new URL(path, /^https?:\/\//i.test(host) ? host : `https://${host}`);
  const req = new Request(url, { method, headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const ctx = { waitUntil: (p) => Promise.resolve(p).catch(() => {}) };
  const who = 'Rinnovo automatico', ip = '';
  const res = ownerId
    ? await agentRoutes(req, env, url, url.pathname, { id: 'auto-renew-' + ownerId, expires: now() + 60000, admin_id: ownerId, username: agent && agent.username || who, role: 'agent', active: 1 }, ip, ctx)
    : await adminRoutes(req, env, url, url.pathname, who, ip, ctx, { id: 'auto-renew', admin_id: 0, username: who, role: 'admin' });
  if (!(res instanceof Response)) return res;
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error || data.ok === false || data.success === false) throw new Error(data.error || data.message || `HTTP ${res.status}`);
  return data;
}
async function lineSyncCron(env) {
  const groups = ((await env.DB.prepare('SELECT DISTINCT panel, owner_id FROM line_sync ORDER BY panel, owner_id').all()).results) || [];
  for (const group of groups) {
    const panel = String(group.panel || '').toLowerCase(), ownerId = +group.owner_id || 0;
    if (!LINE_SYNC_PANELS.has(panel)) continue;
    try {
      const data = await cronDispatch(env, ownerId, 'GET', panel === 'wolf' ? '/wolf/lines' : `/${panel}/lines`);
      const lines = Array.isArray(data.lines) ? data.lines : Array.isArray(data.rows) ? data.rows : [];
      await cronDispatch(env, ownerId, 'POST', '/line-sync/apply', { panel, lines: lines.map((x) => ({ username: x.username, exp: x.exp, note: String(x.note || x.notes || '').slice(0, 400) })) });
    } catch {}
  }
}
function autoDate(v) {
  const s = String(v || '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(s) && DATE_RE.test(s)) return s;
  const n = +v;
  if (Number.isFinite(n) && n > 0) return new Date((n < 1e12 ? n * 1000 : n)).toISOString().slice(0, 10);
  const m = s.match(/(\d{4}-\d{2}-\d{2})/);
  return m && DATE_RE.test(m[1]) ? m[1] : '';
}
async function paymentsAutoRenew(env) {
  const rows = ((await env.DB.prepare("SELECT * FROM payments WHERE auto_months > 0 OR auto_opt <> '' ORDER BY updated LIMIT 200").all()).results) || [];
  const allAgents = rows.some((r) => +r.owner_id > 0) ? await agentsAll(env) : [];
  const today = paymentToday();
  const setResult = (r, result, renewed = '') => env.DB.prepare('UPDATE payments SET last_result = ?, last_renew = CASE WHEN ? <> ? THEN ? ELSE last_renew END, updated = ? WHERE kind = ? AND panel = ? AND ref = ?')
    .bind(result, renewed, '', renewed, now(), r.kind, r.panel, r.ref).run();
  for (const r of rows) {
    try {
      const owner = +r.owner_id || 0;
      if (owner) {
        const P = agEffPerms(allAgents, owner);
        if (!(await agentChainActive(env, owner, allAgents)) || !P || !P.autoRenew) { await setResult(r, 'Fermo: agente disattivato o senza permesso'); continue; }
      }
      let expiry = '', line = null, lineKey = r.auto_line;
      if (r.kind === 'device') {
        const d = await env.DB.prepare('SELECT expires FROM devices WHERE id = ? AND parent = ?').bind(r.ref, '').first();
        expiry = autoDate(d && d.expires);
      } else {
        let auto = lineKey;
        if (r.panel === 'armada' || r.panel === 'storm') { try { auto = JSON.parse(lineKey); } catch { auto = { type: 'm3u', username: lineKey }; } }
        const path = r.panel === 'wolf' ? '/wolf/lines' : r.panel === 'armada' || r.panel === 'storm' ? `/${r.panel}/${auto.type === 'mag' ? 'mags' : 'lines'}` : r.panel === 'atx' ? '/atx/lines?all=1' : `/${r.panel}/lines`;
        const data = await cronDispatch(env, owner, 'GET', path);
        const list = Array.isArray(data) ? data : data.lines || data.rows || data.items || data.list || [];
        line = list.find((x) => r.panel === 'armada' || r.panel === 'storm'
          ? auto.type === 'mag' ? String(x.mac || '').replace(/[^0-9a-f]/gi, '').toLowerCase() === String(auto.mac || '').replace(/[^0-9a-f]/gi, '').toLowerCase() : String(x.username || '') === String(auto.username || '')
          : String(x.id || x.user_id || '') === String(lineKey));
        expiry = autoDate(line && (line.exp ?? line.exp_date ?? line.expire_date ?? line.expTxt));
      }
      if (!expiry) { await setResult(r, 'Fermo: scadenza sconosciuta'); continue; }
      if (r.last_renew === today) continue;
      if ((Date.parse(expiry + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 864e5 > 2) continue;
      if (paymentEffective(r, today).status !== 'paid' || !r.paid_until || r.paid_until <= expiry) { await setResult(r, 'Fermo: non ha pagato'); continue; }
      let out;
      if (r.kind === 'device') {
        const base = expiry >= today ? expiry : today;
        out = await cronDispatch(env, owner, 'PUT', `/devices/${encodeURIComponent(r.ref)}`, { expires: paymentAddMonths(+r.auto_months, base) });
      } else if (r.panel === 'wolf') out = await cronDispatch(env, owner, 'POST', `/wolf/lines/${encodeURIComponent(lineKey)}/extend`, { package: r.auto_opt });
      else if (r.panel === 'armada' || r.panel === 'storm') {
        const auto = JSON.parse(lineKey);
        out = await cronDispatch(env, owner, 'POST', `/${r.panel}/renew`, { type: auto.type, sub: +r.auto_months, ...(auto.type === 'mag' ? { mac: auto.mac } : { username: auto.username, password: line.password || '' }) });
      } else if (r.panel === 'atx') out = await cronDispatch(env, owner, 'POST', '/atx/lines/action', { action: 'renew', user_id: lineKey, months: +r.auto_months });
      else out = await cronDispatch(env, owner, 'POST', `/${r.panel}/lines/action`, { action: 'renew', id: lineKey, package_id: r.auto_opt });
      let renewed = autoDate(out && (out.exp ?? out.exp_date ?? out.expire_date));
      if (!renewed && r.kind === 'device') renewed = autoDate((await env.DB.prepare('SELECT expires FROM devices WHERE id = ?').bind(r.ref).first() || {}).expires);
      if (!renewed && r.kind === 'line') {
        try {
          const path = r.panel === 'wolf' ? '/wolf/lines' : r.panel === 'armada' || r.panel === 'storm' ? `/${r.panel}/${JSON.parse(lineKey).type === 'mag' ? 'mags' : 'lines'}` : r.panel === 'atx' ? '/atx/lines?all=1' : `/${r.panel}/lines`;
          const d = await cronDispatch(env, owner, 'GET', path), list = d.lines || d.rows || [];
          const a = r.panel === 'armada' || r.panel === 'storm' ? JSON.parse(lineKey) : null;
          const x = list.find((y) => a ? a.type === 'mag' ? String(y.mac || '').replace(/[^0-9a-f]/gi, '').toLowerCase() === String(a.mac).replace(/[^0-9a-f]/gi, '').toLowerCase() : String(y.username || '') === a.username : String(y.id || y.user_id || '') === lineKey);
          renewed = autoDate(x && (x.exp ?? x.exp_date ?? x.expire_date ?? x.expTxt));
        } catch {}
      }
      const result = 'Rinnovata' + (renewed ? ` fino al ${renewed}` : '');
      await setResult(r, result, today);
      await log(env, 'edit', `Rinnovo automatico: ${r.label || r.ref} (${r.panel || 'device'})${renewed ? ' fino al ' + renewed : ''}`, '').catch(() => {});
    } catch (e) {
      const result = 'Errore: ' + String(e && e.message || e || 'operazione non riuscita').replace(/[\r\n]+/g, ' ').slice(0, 160);
      await setResult(r, result).catch(() => {});
      await log(env, 'edit', `Rinnovo automatico: ${r.label || r.ref} (${r.panel || 'device'}) — ${result}`, '').catch(() => {});
    }
  }
}
/** ag: null = titolare (vede tutto) · { id, tree, hideHosts } = agente (solo le linee sue e dei sotto-agenti visibili) */
async function linkedLinesRoutes(req, env, path, who, ip, ag) {
  const m = req.method;
  const sel = 'SELECT l.*, d.name AS dname, d.code AS dcode FROM linked_lines l LEFT JOIN devices d ON d.id = l.device_id';
  /* ---------- note KAIROS sulle linee dei pannelli senza campo nota (Armada, Storm, ORA, MirkoTeam, MaxPlayer, OrbixPlay) ---------- */
  if (path === '/line-notes' && m === 'GET') {
    const panel = str(new URL(req.url).searchParams.get('panel'), 20).toLowerCase(); if (!/^[a-z]{2,10}$/.test(panel)) throw new HttpErr(400, 'Pannello non valido');
    let rows = [];
    if (ag) {
      const tree = Array.isArray(ag.tree) ? ag.tree : [ag.id];
      for (let i = 0; i < tree.length; i += 90) {
        const part = tree.slice(i, i + 90);
        rows.push(...(((await env.DB.prepare(`SELECT ref, note, updated FROM line_notes WHERE panel = ? AND note <> ? AND owner_id IN (${part.map(() => '?').join(',')}) LIMIT 5000`).bind(panel, '', ...part).all()).results) || []));
      }
    } else rows = ((await env.DB.prepare('SELECT ref, note, updated FROM line_notes WHERE panel = ? AND note <> ? LIMIT 5000').bind(panel, '').all()).results) || [];
    const notes = {}; for (const r of rows) notes[r.ref] = r.note; return json({ notes });
  }
  if (path === '/line-notes' && m === 'PUT') {
    const b = await readJSON(req, 2048), panel = str(b.panel, 20).toLowerCase(), ref = str(b.ref, 120).trim().toLowerCase(), note = str(b.note, 300).trim();
    if (!/^[a-z]{2,10}$/.test(panel) || !ref) throw new HttpErr(400, 'Linea non valida');
    if (ag && !(await lineNoteMine(env, panel, ref, ag.tree || [ag.id]))) throw new HttpErr(403, 'Questa nota non è tua: non puoi modificarla'); // la nota del titolare o di un altro agente
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
      const hidePlayerDns = ag && /orbix|max\s*-?player/i.test(r.app || ''), assignedDns = ag && Array.isArray(ag.dnsHosts) && ag.dnsHosts.includes(r.dns), hideUnassignedDns = ag && isPanelHost(r.dns) && !assignedDns;
      items.push({ id: r.id, ownerId: +r.owner_id || 0, ownerName: names.get(+r.owner_id) || '', app: r.app, username: r.username, password: await unsealText(env, r.pass_seal),
        dns: ag && (hidePlayerDns || hideUnassignedDns || ((ag.hideHosts || String(r.source).startsWith('p-')) && !assignedDns && auto)) ? '' : r.dns, dnsName: hidePlayerDns && isPanelHost(r.dns_name) ? (/max\s*-?player/i.test(r.app) ? 'DNS MaxPlayer' : 'DNS OrbixPlay') : r.dns_name || '', mac: r.mac, deviceId: r.device_id, deviceName: r.dname || '', deviceCode: r.dcode || '', deviceGone: !!r.device_id && !r.dcode,
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
  const doneMatch = path.match(/^\/linked-lines\/(\d+)\/done$/);
  if (doneMatch && m === 'POST') {
    if (ag) throw new HttpErr(403, 'Solo il Master può completare una richiesta');
    const row = await env.DB.prepare('SELECT * FROM linked_lines WHERE id = ?').bind(+doneMatch[1]).first();
    if (!row) throw new HttpErr(404, 'Linea non trovata');
    const note = String(row.note || '').replace(/\s*·?\s*DA ATTIVARE\b/ig, '').replace(/^[\s·]+|[\s·]+$/g, '').slice(0, 300);
    await env.DB.prepare('UPDATE linked_lines SET note = ?, updated = ? WHERE id = ?').bind(note, now(), +doneMatch[1]).run();
    await log(env, 'edit', `Richiesta app completata: ${row.username} (${row.app})`, ip).catch(() => {});
    return json({ ok: true, note });
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

/* ---------------- link puliti: /get/<app>.apk, /get/<app>.json e /store/ (release GitHub e pagina dello store) ----------------
   Il link che il cliente vede è quello del pannello (es. https://panel-kairos.com/get/store.apk): l'account GitHub resta qui.
   Il pannello è il punto unico di download (README §34): gli APK passano in streaming dal Worker (con Range: i download
   interrotti riprendono), i feed degli aggiornamenti escono con i link del pannello, la pagina dello store pure.
   Senza il segreto GH_TOKEN si usano i link pubblici delle release e GitHub Pages, come prima (nessun limite di richieste).
   Con GH_TOKEN (token a grana fine, sola lettura di «Contents») l'API GitHub autenticata: funziona anche con i repository
   privati. Il token resta nel Worker: mai nelle risposte, nei log o nei messaggi d'errore. */
const GH_OWNER = 'mariopiccolo8562-lang';
/** versione di prova di KAIROS HEAVY data da /get/heavy.apk e dallo Store: a ogni nuova prova si cambia solo questo numero */
const HEAVY_REL = 'kairos-ultimate/releases/download/heavy-prova-16/';
const GET_APK = {
  store: ['kairos-store/releases/latest/download/KairosStore.apk', 'KairosStore.apk'],
  pro: ['kairos-store/releases/download/kairos-tv/kairos-tv.apk', 'kairos-pro.apk'],
  premium: ['kairos-premium/releases/latest/download/kairos-premium.apk', 'kairos-premium.apk'],
  tv: ['kairos-tv/releases/latest/download/kairos-tv.apk', 'kairos-tv.apk'],
  plus: ['kairos-flutter/releases/latest/download/kairos-plus.apk', 'kairos-plus.apk'],
  xc: ['kairos-xc/releases/latest/download/kairos-xc.apk', 'kairos-xc.apk'],
  ult: ['kairos-ultimate/releases/latest/download/kairos-ultimate.apk', 'kairos-ultimate.apk'],
  // KAIROS Ultimate dalla 1.0.1: APK leggeri per ABI (circa metà del peso), dati a chi chiede /get/ult.apk?abi=… (apkForAbi)
  'ult-arm32': ['kairos-ultimate/releases/latest/download/kairos-ultimate-arm32.apk', 'kairos-ultimate-arm32.apk'],
  'ult-arm64': ['kairos-ultimate/releases/latest/download/kairos-ultimate-arm64.apk', 'kairos-ultimate-arm64.apk'],
  lite: ['kairos-lite/releases/latest/download/kairos-lite.apk', 'kairos-lite.apk'],
  nova: ['Lairos-nova/releases/download/latest/KairosNova-arm64.apk', 'kairos-nova.apk'],
  'nova-arm32': ['Lairos-nova/releases/download/latest/KairosNova-arm32.apk', 'kairos-nova-arm32.apk'],
  // Kairos Portal e Kairos Smart (11 novembre 2026): un solo repository privato, due APK nella stessa release.
  // Servono il segreto GH_TOKEN e il repository aggiunto al token dei download; finché manca, qui risponde 502
  portal: ['kairos-portal-smart/releases/latest/download/kairos-portal.apk', 'kairos-portal.apk'],
  smart: ['kairos-portal-smart/releases/latest/download/kairos-smart.apk', 'kairos-smart.apk'],
  // KAIROS HEAVY (13 novembre 2026): ramo «heavy» del repository della Ultimate. Si scarica la versione di prova
  // indicata in HEAVY_REL (le prove sono anteprime: non sono l'«ultima release» della Ultimate). Dal 14 novembre 2026 è
  // nello Store: lì «Installa» scarica sempre questa versione, anche sopra quella già installata (è così che si aggiorna),
  // e con «?abi=» riceve l'APK leggero della sua ABI, come per la Ultimate
  heavy: [HEAVY_REL + 'kairos-ultimate.apk', 'kairos-heavy.apk'],
  'heavy-arm32': [HEAVY_REL + 'kairos-ultimate-arm32.apk', 'kairos-heavy-arm32.apk'],
  'heavy-arm64': [HEAVY_REL + 'kairos-ultimate-arm64.apk', 'kairos-heavy-arm64.apk'],
};
/** feed degli aggiornamenti (/get/<id>.json): file della stessa release dell'APK di GET_APK[id]. Lo store non ne ha uno:
 *  si ricava dalla sua ultima release (tag v1.0.N con KairosStore.apk) */
const GET_FEED = { tv: 'kairos-tv.json', premium: 'kairos-premium.json', lite: 'kairos-lite.json', xc: 'kairos-xc.json', ult: 'kairos-ultimate.json', plus: 'kairos-plus.json', nova: 'kairos-nova.json', pro: 'kairos-tv.json', store: '', portal: 'kairos-portal.json', smart: 'kairos-smart.json' };
const STORE_PAGES = `https://${GH_OWNER}.github.io/kairos-store/`;
const GH_UA = 'KairosPanel', GH_API = 'https://api.github.com', GH_V = '2022-11-28';
const hasKey = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
/** token GitHub del Worker (segreto GH_TOKEN, facoltativo): '' se manca */
const ghTok = (env) => { const t = String((env && env.GH_TOKEN) || '').trim(); return /^[\x21-\x7e]{20,255}$/.test(t) ? t : ''; };
/** domini dei download come indirizzi https, il primo è quello principale (store-k.download) e gli altri sono le riserve;
 *  «www.» di un dominio già in elenco non conta due volte. Vanno nei file degli aggiornamenti («mirrors»): le app li
 *  ricordano e li provano se il principale non risponde (10 novembre 2026: niente più pannello né GitHub negli aggiornamenti) */
function dlOrigins(env) {
  const hs = String((env && env.DL_HOSTS) || '').toLowerCase().split(',').map((x) => x.trim().replace(/^https?:\/\//, '').replace(/[/:].*$/, '')).filter((x) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(x));
  const out = [];
  for (const h of hs) { const b = h.replace(/^www\./, ''); if (h.startsWith('www.') && hs.includes(b)) continue; if (!out.includes('https://' + h)) out.push('https://' + h); }
  return out.slice(0, 4);
}
/** host dedicati ai download (variabile DL_HOSTS, nomi separati da virgola): lì il Worker serve solo /get/… e /store/… */
function dlHost(env, host) {
  const v = String((env && env.DL_HOSTS) || '').trim().toLowerCase();
  return !!v && v.split(',').map((x) => x.trim().replace(/^https?:\/\//, '').replace(/[/:].*$/, '')).filter(Boolean).includes(String(host || '').toLowerCase());
}
/** «repo/releases/latest/download/file» o «repo/releases/download/tag/file» → { repo, tag ('' = ultima release), file } */
function ghRelOf(rel) {
  const m = String(rel || '').match(/^([A-Za-z0-9._-]+)\/releases\/(?:latest\/download|download\/([A-Za-z0-9._-]+))\/([A-Za-z0-9._-]+)$/);
  return m ? { repo: m[1], tag: m[2] || '', file: m[3] } : null;
}
/** link pubblico di un file di una release del titolare → { repo, tag, file }; null per tutti gli altri link */
function ghRelUrl(u) {
  const m = String(u || '').match(/^https:\/\/github\.com\/([A-Za-z0-9-]+)\/([^?#]+)(?:[?#].*)?$/);
  return m && m[1].toLowerCase() === GH_OWNER.toLowerCase() ? ghRelOf(m[2]) : null;
}
const ghPub = (p) => `https://github.com/${GH_OWNER}/${p.repo}/releases/${p.tag ? 'download/' + p.tag : 'latest/download'}/${p.file}`;
/** fetch con un tempo massimo per la risposta (le intestazioni): il corpo poi arriva con calma (APK grandi) */
async function tfetch(u, init, ms = 8000) {
  const ac = new AbortController(), timer = setTimeout(() => ac.abort(), ms);
  try { return await fetch(u, { ...init, signal: ac.signal }); }
  finally { clearTimeout(timer); }
}
async function ghFetch(u, method, ms = 8000, headers) {
  return tfetch(u, { method, redirect: 'follow', cf: { cacheTtl: 600, cacheEverything: true }, ...(headers ? { headers } : {}) }, ms);
}
/* API GitHub (JSON). Con il token: autenticata, in memoria per [ttl] e poi riconvalidata con l'ETag (una risposta 304 non
   consuma il limite di 5000 richieste all'ora); se GitHub non risponde resta buona l'ultima risposta. Senza token come
   prima: senza autenticazione, con la cache di Cloudflare di 5 minuti. [pick] tiene solo ciò che serve */
const ghMem = new Map(), ghWait = new Map();
async function ghApi(env, path, pick, ttl = 300e3) {
  const tok = ghTok(env), h = { Accept: 'application/vnd.github+json', 'User-Agent': GH_UA, 'X-GitHub-Api-Version': GH_V };
  const take = async (r) => { const j = await r.json().catch(() => null); return j && pick ? pick(j) : j; };
  if (!tok) {
    try { const r = await fetch(GH_API + path, { headers: h, signal: AbortSignal.timeout(6000), cf: { cacheTtl: 300, cacheEverything: true } }); return r.ok ? await take(r) : null; } catch { return null; }
  }
  const c = ghMem.get(path);
  if (c && now() - c.t < ttl) return c.v;
  if (ghWait.has(path)) return ghWait.get(path);
  const p = (async () => {
    h.Authorization = 'Bearer ' + tok;
    if (c && c.etag) h['If-None-Match'] = c.etag;
    let v = null, etag = '', st = 0;
    try {
      const r = await fetch(GH_API + path, { headers: h, signal: AbortSignal.timeout(6000) });
      st = r.status;
      if (st === 304 && c) { c.t = now(); return c.v; }
      if (r.ok) { v = await take(r); etag = r.headers.get('ETag') || ''; }
    } catch {}
    // GitHub non risponde (o limite raggiunto): resta l'ultima risposta buona e si riprova fra un minuto
    if (v === null && c && c.v !== null && st !== 404) { c.t = now() - ttl + 60e3; return c.v; }
    ghMem.set(path, { t: v === null ? now() - ttl + 60e3 : now(), etag: v === null ? '' : etag, v });
    if (ghMem.size > 300) ghMem.delete(ghMem.keys().next().value);
    return v;
  })().finally(() => ghWait.delete(path));
  ghWait.set(path, p);
  return p;
}
/** release ridotta a ciò che serve (in memoria si tiene poco) */
const relSlim = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? {
  tag_name: String(x.tag_name || ''), draft: !!x.draft, prerelease: !!x.prerelease, published_at: String(x.published_at || ''), created_at: String(x.created_at || ''),
  assets: (Array.isArray(x.assets) ? x.assets : []).filter((a) => a && typeof a === 'object').slice(0, 60).map((a) => ({ id: +a.id || 0, name: String(a.name || ''), state: String(a.state || 'uploaded'), size: +a.size || 0, updated_at: String(a.updated_at || ''), browser_download_url: String(a.browser_download_url || '') })),
} : null);
const relsSlim = (v) => (Array.isArray(v) ? v.map(relSlim).filter(Boolean) : null);
const relTime = (x) => Date.parse(x.published_at || x.created_at || '') || 0;
const relFile = (x, file) => (x && Array.isArray(x.assets) && x.assets.find((f) => f && f.name === file && (f.state || 'uploaded') === 'uploaded')) || null;
/** release pubblicate (né bozze né anteprime), dalla più recente */
const relsByDate = (list) => (Array.isArray(list) ? list : []).filter((x) => x && !x.draft && !x.prerelease).sort((a, b) => relTime(b) - relTime(a));
/** l'ultima release è stata creata senza il file (es. Kairos Premium 1.7.0 e 1.7.1, compilate senza la chiave di firma):
 *  link al file della release più recente che ce l'ha, così il download dallo store non resta rotto; '' se non c'è.
 *  Con il token l'elenco delle release arriva dall'API autenticata */
async function ghOlderAsset(env, rel) {
  const mm = rel.match(/^([A-Za-z0-9._-]+)\/releases\/latest\/download\/([A-Za-z0-9._-]+)$/); if (!mm) return '';
  const base = `https://github.com/${GH_OWNER}/${mm[1]}/releases/download/`;
  for (const x of relsByDate(await ghApi(env, `/repos/${GH_OWNER}/${mm[1]}/releases?per_page=20`, relsSlim))) {
    const a = relFile(x, mm[2]);
    if (a && a.browser_download_url.startsWith(base)) return a.browser_download_url;
  }
  return '';
}
/** con il token: il file [p.file] della release [p] dall'API; se è l'ultima release ed è uscita senza quel file, quello
 *  della più recente che ce l'ha (come per i link pubblici). { a: file, rel: release } | null */
async function ghAssetOf(env, p) {
  const rel = await ghApi(env, `/repos/${GH_OWNER}/${p.repo}/releases/${p.tag ? 'tags/' + encodeURIComponent(p.tag) : 'latest'}`, relSlim);
  const a = relFile(rel, p.file);
  if (a && a.id) return { a, rel };
  if (p.tag) return null;
  for (const x of relsByDate(await ghApi(env, `/repos/${GH_OWNER}/${p.repo}/releases?per_page=20`, relsSlim))) { const b = relFile(x, p.file); if (b && b.id) return { a: b, rel: x }; }
  return null;
}
/* con il token: file di una release (anche privata). L'API risponde con un rimando a un indirizzo firmato (valido pochi
   minuti) da scaricare SENZA il token. L'indirizzo resta in memoria al massimo un minuto e non esce mai dal Worker */
const ghSigned = new Map();
async function ghAssetGet(env, p, a, hdr) {
  for (let n = 0; n < 2; n++) {
    const c = ghSigned.get(a.id), old = !!(c && now() - c.t < 60e3);
    let loc = old ? c.u : '';
    if (!loc) {
      let r = null;
      try { r = await tfetch(`${GH_API}/repos/${GH_OWNER}/${p.repo}/releases/assets/${a.id}`, { redirect: 'manual', headers: { Accept: 'application/octet-stream', Authorization: 'Bearer ' + ghTok(env), 'User-Agent': GH_UA, 'X-GitHub-Api-Version': GH_V } }); } catch { return null; }
      if (r.status < 300 || r.status >= 400) return r.ok || r.status === 416 ? r : null; // GitHub ha mandato il file direttamente (o errore)
      loc = r.headers.get('Location') || '';
      if (!/^https:\/\//i.test(loc)) return null;
      ghSigned.set(a.id, { t: now(), u: loc }); if (ghSigned.size > 100) ghSigned.delete(ghSigned.keys().next().value);
    }
    let up = null;
    try { up = await tfetch(loc, { redirect: 'follow', headers: { ...hdr, 'User-Agent': GH_UA } }); } catch {}
    if (up && (up.ok || up.status === 416)) return up;
    if (up && up.body) up.body.cancel().catch(() => {});
    ghSigned.delete(a.id);
    if (!old) return null; // indirizzo appena avuto: niente da riprovare
    // l'indirizzo in memoria era scaduto: se ne chiede uno nuovo
  }
  return null;
}
/** con il token: file piccolo di una release (i feed) dall'API; il testo resta in memoria finché il file su GitHub non cambia */
const ghBlob = new Map();
async function ghSmall(env, p) {
  const x = await ghAssetOf(env, p);
  if (!x || x.a.size > 256 * 1024) return null;
  const k = `${p.repo}/${x.a.id}/${x.a.updated_at}`;
  let t = ghBlob.get(k);
  if (t === undefined) {
    const r = await ghAssetGet(env, p, x.a, {});
    if (!r || !r.ok) return null;
    t = await r.text();
    if (t.length > 256 * 1024) return null;
    ghBlob.set(k, t); if (ghBlob.size > 60) ghBlob.delete(ghBlob.keys().next().value);
  }
  return { text: t, rel: x.rel };
}
/** file di una release del titolare dal suo link pubblico (i feed delle app). Con il token dall'API autenticata, anche dai
 *  repository privati (se l'API non risponde si prova il link pubblico). Se l'ultima release è uscita senza il file si usa
 *  la più recente che ce l'ha, come per gli APK. Tutti gli altri link: fetch normale, come prima */
async function relFetch(env, u, init) {
  const p = ghRelUrl(u);
  if (p && ghTok(env)) { const x = await ghSmall(env, p).catch(() => null); if (x) return new Response(x.text, { status: 200, headers: { 'Content-Type': 'application/json' } }); }
  const r = await fetch(u, init);
  if (p && !p.tag && r.status === 404) { const alt = await ghOlderAsset(env, `${p.repo}/releases/latest/download/${p.file}`); if (alt) return fetch(alt, init); }
  return r;
}
/** Range della richiesta (un solo intervallo): { s, e } (e = -1: fino alla fine; s = -1: gli ultimi e byte); null se manca o
 *  non si capisce (allora si manda il file intero, come permette HTTP) */
function rangeOf(v) {
  const m = String(v || '').trim().match(/^bytes=(\d{0,15})-(\d{0,15})$/i);
  if (!m || (!m[1] && !m[2])) return null;
  if (!m[1]) return +m[2] > 0 ? { s: -1, e: +m[2] } : null;
  const s = +m[1], e = m[2] ? +m[2] : -1;
  return e !== -1 && e < s ? null : { s, e };
}
/** [inizio, fine] dell'intervallo su un file di [size] byte; null se comincia oltre la fine (416) */
const rangeOn = (r, size) => (r.s === -1 ? [Math.max(0, size - r.e), size - 1] : r.s >= size ? null : [r.s, r.e === -1 ? size - 1 : Math.min(r.e, size - 1)]);
/** If-Range: il pezzo si manda solo se il file è ancora quello (stesso ETag o stessa data), altrimenti il file intero */
function ifRangeOk(v, h) {
  if (!v) return true;
  if (/^(W\/)?"/.test(v)) return !v.startsWith('W/') && h.get('ETag') === v;
  const a = Date.parse(v);
  return !!a && a === Date.parse(h.get('Last-Modified') || '');
}
/** byte [start, start+len) di un corpo in streaming (quando GitHub manda il file intero a una richiesta con Range) */
function sliceBody(body, start, len) {
  let pos = 0, left = len;
  const ts = new TransformStream({
    transform(ch, ctl) {
      const u = ch instanceof Uint8Array ? ch : new Uint8Array(ch), a = Math.max(0, start - pos);
      pos += u.length;
      if (left <= 0 || a >= u.length) return;
      const part = u.subarray(a, a + Math.min(left, u.length - a));
      left -= part.length; ctl.enqueue(part);
      if (left <= 0) ctl.terminate();
    },
  });
  body.pipeTo(ts.writable).catch(() => {});
  if (typeof FixedLengthStream !== 'function') return ts.readable;
  const f = new FixedLengthStream(len); // Cloudflare: così la risposta porta la lunghezza esatta
  ts.readable.pipeTo(f.writable).catch(() => {});
  return f.readable;
}
/** risposta con l'APK: 200 (file intero), 206 (un pezzo, con Content-Range) o 416; [up] = risposta di GitHub (null per HEAD con il token) */
function apkOut(req, h, up, rg, size0) {
  const head = req.method === 'HEAD', drop = () => { if (up && up.body) up.body.cancel().catch(() => {}); };
  if (up) for (const k of ['ETag', 'Last-Modified']) { const v = up.headers.get(k); if (v) h.set(k, v); }
  if (up && up.status === 206) {
    for (const k of ['Content-Range', 'Content-Length']) { const v = up.headers.get(k); if (v) h.set(k, v); }
    if (head) drop();
    return new Response(head ? null : up.body, { status: 206, headers: h });
  }
  if (up && up.status === 416) { drop(); const cr = up.headers.get('Content-Range'); if (cr) h.set('Content-Range', cr); return new Response(null, { status: 416, headers: h }); }
  const size = (up && +(up.headers.get('Content-Length') || 0)) || size0 || 0;
  // file intero: se il cliente ne ha chiesto un pezzo (ed è ancora lo stesso file) si ritaglia qui
  if (rg && size > 0 && ifRangeOk(req.headers.get('If-Range'), h)) {
    const r = rangeOn(rg, size);
    if (!r) { drop(); h.set('Content-Range', `bytes */${size}`); return new Response(null, { status: 416, headers: h }); }
    h.set('Content-Range', `bytes ${r[0]}-${r[1]}/${size}`); h.set('Content-Length', String(r[1] - r[0] + 1));
    if (head || !up || !up.body) { drop(); return new Response(null, { status: 206, headers: h }); }
    return new Response(sliceBody(up.body, r[0], r[1] - r[0] + 1), { status: 206, headers: h });
  }
  if (size > 0) h.set('Content-Length', String(size));
  if (head) drop();
  return new Response(head || !up ? null : up.body, { status: 200, headers: h });
}
/* /get/<app>.apk: l'APK in streaming dal Worker, senza rimandare a GitHub. Range (206 e Content-Range) per riprendere i
   download interrotti; If-Range: se intanto è uscita una versione nuova si riparte dall'inizio con il file intero */
async function dlApk(req, env, e) {
  const method = req.method === 'HEAD' ? 'HEAD' : 'GET', p = ghRelOf(e[0]), rg = rangeOf(req.headers.get('Range')), ifr = req.headers.get('If-Range');
  const hdr = rg ? { Range: String(req.headers.get('Range')).trim(), ...(ifr ? { 'If-Range': ifr } : {}) } : null;
  const h = new Headers();
  h.set('Content-Type', 'application/vnd.android.package-archive');
  h.set('Content-Disposition', `attachment; filename="${e[1]}"`);
  h.set('Cache-Control', 'public, max-age=600');
  h.set('Accept-Ranges', 'bytes');
  // con il token dall'API (anche dai repository privati); se l'API non risponde si prova il link pubblico
  if (p && ghTok(env)) {
    const x = await ghAssetOf(env, p).catch(() => null);
    if (x && x.a.size > 0) {
      if (method === 'HEAD') { const lm = Date.parse(x.a.updated_at); if (lm) h.set('Last-Modified', new Date(lm).toUTCString()); return apkOut(req, h, null, rg, x.a.size); }
      const up = await ghAssetGet(env, p, x.a, hdr || {}).catch(() => null);
      if (up) return apkOut(req, h, up, rg, x.a.size);
    }
  }
  // link pubblico, come prima: se «latest» è senza il file si serve quello della release più recente che ce l'ha
  const getUp = async (u) => {
    let r = null;
    for (let n = 0; n < 2; n++) {
      try { r = await ghFetch(u, method, 8000, hdr || undefined); if (r.status !== 429 && r.status < 500) break; } catch { r = null; }
    }
    return r;
  };
  let target = `https://github.com/${GH_OWNER}/${e[0]}`, up = await getUp(target);
  if (up && up.status === 404) { const alt = await ghOlderAsset(env, e[0]); if (alt) { target = alt; up = await getUp(alt); } }
  // HEAD: l'indirizzo firmato dove GitHub tiene il file accetta solo GET (a HEAD risponde 401): si chiede il primo byte
  // e se ne leggono lunghezza (Content-Range), ETag e data
  if (method === 'HEAD' && up && (up.status === 401 || up.status === 403)) {
    let g = null;
    try { g = await ghFetch(target, 'GET', 8000, { Range: 'bytes=0-0' }); } catch {}
    if (g && g.body) g.body.cancel().catch(() => {});
    const tot = g && g.status === 206 ? +(String(g.headers.get('Content-Range') || '').split('/')[1] || 0) : g && g.ok ? +(g.headers.get('Content-Length') || 0) : 0;
    if (tot > 0) { for (const k of ['ETag', 'Last-Modified']) { const v = g.headers.get(k); if (v) h.set(k, v); } return apkOut(req, h, null, rg, tot); }
  }
  if (up && (up.ok || up.status === 416)) return apkOut(req, h, up, rg, 0);
  if (up && up.body) up.body.cancel().catch(() => {});
  return new Response('App non disponibile al momento, riprova tra poco', { status: 502, headers: { 'Cache-Control': 'no-store' } });
}
/* /get/<id>.json: il feed dell'ultima release dell'app com'è nel file della release (per lo store ricavato dalla release),
   con i link del pannello al posto di quelli di GitHub. In memoria 5 minuti (le app controllano spesso); se GitHub non
   risponde resta buono l'ultimo letto (fino a 6 ore), altrimenti 502 e le app lo trattano come «nessun aggiornamento» */
const dlFeedMem = new Map();
async function dlFeed(env, id) {
  const k = (ghTok(env) ? 't:' : 'p:') + id, c = dlFeedMem.get(k), TTL = 300e3;
  if (c && now() - c.t < TTL) return c.v;
  let v = null;
  try { v = id === 'store' ? await dlStoreFeed(env) : await dlAppFeed(env, id); } catch { v = null; }
  if (!v && c && c.v && now() - c.ok < 6 * 3600e3) { c.t = now() - TTL + 60e3; return c.v; }
  dlFeedMem.set(k, { t: v ? now() : now() - TTL + 60e3, ok: v ? now() : 0, v });
  return v;
}
async function dlAppFeed(env, id) {
  const r = await relFetch(env, ghPub({ ...ghRelOf(GET_APK[id][0]), file: GET_FEED[id] }), { headers: { 'User-Agent': GH_UA }, signal: AbortSignal.timeout(6000), cf: { cacheTtl: 300, cacheEverything: true } });
  if (!r.ok) return null;
  const t = await r.text();
  if (t.length > 64 * 1024) return null;
  const j = JSON.parse(t);
  return j && typeof j === 'object' && !Array.isArray(j) && (typeof j.version === 'string' || typeof j.version === 'number') && String(j.version) ? j : null;
}
/** feed dello store (le app nuove lo chiedono qui invece che all'API GitHub): versione dal tag dell'ultima release con
 *  KairosStore.apk (v1.0.131 → 1.0.131), versionCode come nella build dello store (1.0.N → N), data della release */
async function dlStoreFeed(env) {
  const p = ghRelOf(GET_APK.store[0]);
  let tag = '', date = '';
  if (ghTok(env)) { const x = await ghAssetOf(env, p).catch(() => null); if (x) { tag = x.rel.tag_name; date = x.rel.published_at || x.rel.created_at; } }
  if (!tag) {
    // senza token: «latest/download/KairosStore.apk» rimanda a «download/<tag>/KairosStore.apk», il tag senza usare l'API
    let r = null;
    try { r = await tfetch(ghPub(p), { method: 'HEAD', redirect: 'manual', headers: { 'User-Agent': GH_UA }, cf: { cacheTtl: 300, cacheEverything: true } }, 6000); } catch {}
    let loc = r && r.status >= 300 && r.status < 400 ? r.headers.get('Location') || '' : '';
    if (!loc && r && r.status === 404) loc = await ghOlderAsset(env, GET_APK.store[0]); // ultima release senza l'APK
    const m = loc.match(/\/releases\/download\/([A-Za-z0-9._-]+)\/KairosStore\.apk(?:[?#]|$)/);
    if (m) {
      tag = m[1];
      // data: quella del file (Last-Modified), come nei feed delle altre app. Solo il primo byte: a HEAD GitHub risponde 401
      try { const hr = await ghFetch(new URL(loc, 'https://github.com/').href, 'GET', 6000, { Range: 'bytes=0-0' }); if (hr.body) hr.body.cancel().catch(() => {}); const lm = Date.parse(hr.headers.get('Last-Modified') || ''); if (hr.ok && lm) date = new Date(lm).toISOString().replace(/\.\d{3}Z$/, 'Z'); } catch {}
    }
  }
  const v = String(tag || '').replace(/^v/i, '');
  if (!/^\d{1,4}(\.\d{1,6}){1,3}$/.test(v)) return null;
  const n = v.match(/^1\.0\.(\d+)$/);
  return { version: v, versionCode: n ? +n[1] : semverCode(v), url: '', date: String(date || '') };
}
/** nessun indirizzo GitHub e nessun nome del titolare nei feed: i link diventano quelli del pannello (/get/<id>.apk) */
const GH_HOST_RE = /github\.com|githubusercontent\.com|github\.io/i;
function feedLinks(f, id, origin) {
  const who = GH_OWNER.split('-')[0], ownT = new RegExp(who, 'i'), ownG = new RegExp(who + '[A-Za-z0-9-]*', 'gi');
  const apk = (k) => `${origin}/get/${k === 'urlArm32' && hasKey(GET_APK, id + '-arm32') ? id + '-arm32' : id}.apk`;
  const fix = (v, k, d) => {
    if (typeof v === 'string') {
      if (!GH_HOST_RE.test(v) && !ownT.test(v)) return v;
      if (/^\s*https?:\/\/\S*\s*$/i.test(v)) return apk(k); // un link (dell'APK): quello del pannello
      return v.replace(ownG, '').replace(/(?:https?:\/\/)?[A-Za-z0-9.-]*(?:github\.com|githubusercontent\.com|github\.io)[^\s"'<>]*/gi, apk(k));
    }
    if (!v || typeof v !== 'object') return v;
    if (d > 8) return null;
    if (Array.isArray(v)) return v.slice(0, 100).map((x) => fix(x, k, d + 1));
    const o = {}; for (const [kk, x] of Object.entries(v).slice(0, 100)) o[kk] = fix(x, kk, d + 1);
    return o;
  };
  const out = fix(f, '', 0);
  if (id === 'store') out.url = `${origin}/get/store.apk`;
  return out;
}
/** link GitHub dell'APK nelle risposte alle app (/api/player/update) → link del pannello /get/<id>.apk, solo se è proprio il
 *  file che /get/<id>.apk serve: stesso repository, file e release ([fromLatest]: il feed è quello dell'ultima release) */
function dlApkLink(origin, id, a, fromLatest) {
  const p = hasKey(GET_APK, id) && ghRelOf(GET_APK[id][0]), q = p && a && ghRelUrl(a.url);
  if (!q || q.repo.toLowerCase() !== p.repo.toLowerCase() || q.file !== p.file) return a;
  if (q.tag !== p.tag && !(p.tag === '' && fromLatest)) return a;
  return { ...a, url: `${origin}/get/${id}.apk` };
}
/* pagina dello store con il token: i file di docs/ di kairos-store (ramo main) dall'API GitHub, così vale anche con il
   repository privato (GitHub Pages è gratis solo per i pubblici). L'elenco dei file si rilegge al più ogni minuto
   (riconvalidato con l'ETag: un 304 non consuma il limite); il contenuto di ogni file resta in memoria finché non cambia
   (per impronta). Un file che non c'è risponde 404 senza chiedere nulla a GitHub */
const DOC_TYPE = { html: 'text/html; charset=utf-8', json: 'application/json; charset=utf-8', webmanifest: 'application/manifest+json', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', txt: 'text/plain; charset=utf-8', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', ico: 'image/x-icon', woff: 'font/woff', woff2: 'font/woff2' };
const docTreePick = (j) => { if (!j || !Array.isArray(j.tree)) return null; const m = Object.create(null); for (const x of j.tree) if (x && typeof x.path === 'string' && x.path.startsWith('docs/')) m[x.path.slice(5)] = [x.type === 'tree' ? 'd' : 'f', String(x.sha || ''), +x.size || 0]; return m; };
const docBlob = new Map(); let docBytes = 0;
async function storeDoc(env, rel) {
  const tree = await ghApi(env, `/repos/${GH_OWNER}/kairos-store/git/trees/main?recursive=1`, docTreePick, 60e3);
  if (!tree) return null;
  const x = tree[rel];
  if (!x) return { nf: true };
  if (x[0] === 'd') return { dir: true };
  if (!/^[0-9a-f]{40,64}$/.test(x[1])) return null;
  let b = docBlob.get(x[1]);
  if (b) { docBlob.delete(x[1]); docBlob.set(x[1], b); return { b }; } // usato adesso: in fondo alla coda
  const r = await tfetch(`${GH_API}/repos/${GH_OWNER}/kairos-store/git/blobs/${x[1]}`, { headers: { Accept: 'application/vnd.github.raw+json', Authorization: 'Bearer ' + ghTok(env), 'User-Agent': GH_UA, 'X-GitHub-Api-Version': GH_V } });
  if (!r.ok) { if (r.body) r.body.cancel().catch(() => {}); return null; }
  b = await r.arrayBuffer();
  if (b.byteLength <= 2 * 1024 * 1024) {
    docBlob.set(x[1], b); docBytes += b.byteLength;
    while (docBytes > 24 * 1024 * 1024 || docBlob.size > 400) { const [k0, v0] = docBlob.entries().next().value; docBlob.delete(k0); docBytes -= v0.byteLength; }
  }
  return { b };
}
/* ---------------- App nascoste nello Store (12 novembre 2026) ----------------
   «Nascondi» in Store → App dello store vale per clienti e agenti:
   - lo Store non riceve più le app nascoste: /store/apps.json esce senza (prima arrivavano e la pagina non le disegnava);
   - le app Kairos nascoste spariscono anche dal pannello degli agenti (link e codice Downloader). Il titolare vede tutto.
   Gli indirizzi /get/<app>.apk e i file di aggiornamento NON cambiano: le app già installate continuano ad aggiornarsi.
   Elenco non letto (GitHub non risponde): vale l'ultimo letto, altrimenti niente di nascosto per gli agenti. */
const SA_KKEY = { pro: 'pro', tv: 'tv', ktv: 'tv', premium: 'prem', prem: 'prem', lite: 'lite', xc: 'xc', ult: 'ult', ultimate: 'ult', 'ult-arm32': 'ult', 'ult-arm64': 'ult', plus: 'plus', nova: 'nova', 'nova-arm32': 'nova', store: 'store' };
/** chiave dell'app Kairos (come in kAllow) di una voce dello Store: dal link /get/<app>.apk, altrimenti dal nome «Kairos …» */
function storeAppKey(a) {
  if (!a || typeof a !== 'object') return '';
  const m = /\/get\/([a-z0-9-]+)\.apk(?:[?#]|$)/i.exec(String(a.url || ''));
  if (m && hasKey(SA_KKEY, m[1].toLowerCase())) return SA_KKEY[m[1].toLowerCase()];
  const n = String(a.name || '').toLowerCase().replace(/\([^)]*\)/g, '').replace(/[^a-z0-9]/g, '');
  return n.startsWith('kairos') && hasKey(SA_KKEY, n.slice(6)) ? SA_KKEY[n.slice(6)] : '';
}
/** app Kairos nascoste: quelle che nello Store hanno solo voci nascoste (una voce visibile basta a tenerla) */
function storeHiddenOf(apps) {
  const hid = new Set(), vis = new Set();
  for (const a of Array.isArray(apps) ? apps : []) { const k = storeAppKey(a); if (k) (a.hidden === true ? hid : vis).add(k); }
  return new Set([...hid].filter((k) => !vis.has(k)));
}
let saHidMem = { t: 0, v: new Set() };
async function storeHiddenKeys(env) {
  if (saHidMem.t && now() - saHidMem.t < 60e3) return saHidMem.v;
  let v = saHidMem.v;
  try {
    let j = null;
    const d = ghTok(env) ? await storeDoc(env, 'apps.json').catch(() => null) : null;
    if (d && d.b) j = JSON.parse(new TextDecoder().decode(d.b));
    else if (!d || !d.nf) { const r = await tfetch(STORE_PAGES + 'apps.json', { cf: { cacheTtl: 60, cacheEverything: true } }, 5000); if (r.ok) j = await r.json(); else if (r.body) r.body.cancel().catch(() => {}); }
    if (d && d.nf) v = new Set(); else if (j && Array.isArray(j.apps)) v = storeHiddenOf(j.apps);
  } catch {}
  saHidMem = { t: now(), v };
  return v;
}
/** apps.json come lo riceve lo Store: senza le app nascoste. null = niente da togliere (o file non leggibile: esce com'è) */
function storeAppsPublic(buf) {
  try {
    const j = JSON.parse(new TextDecoder().decode(buf));
    if (!j || !Array.isArray(j.apps) || !j.apps.some((a) => a && a.hidden === true)) return null;
    j.apps = j.apps.filter((a) => !(a && a.hidden === true));
    return new TextEncoder().encode(JSON.stringify(j, null, 2) + '\n');
  } catch { return null; }
}
/** politica pubblica degli aggiornamenti di Kairos Nova (solo bgupd e force del profilo «nova», come /api/player/update)
 *  per /get/nova.json. In memoria per 60 s: il feed è pubblico e non legge il database a ogni richiesta.
 *  Database non raggiungibile: l'ultima letta, altrimenti null (l'app tiene la politica salvata). */
let novaPolMem = null;
async function novaPolicy(env) {
  if (novaPolMem && now() - novaPolMem.t < 60e3) return novaPolMem.v;
  try {
    const prof = rcProfiles(await getSettings(env)).nova || {}, v = {};
    for (const k of ['bgupd', 'force']) if (prof[k] !== undefined) v[k] = prof[k];
    novaPolMem = { t: now(), v };
    return v;
  } catch { return novaPolMem ? novaPolMem.v : null; }
}
/* Limite agli scaricamenti in massa degli APK (11 novembre 2026): per indirizzo (IPv6: la rete /64) al massimo APK_PER_MIN
   download che partono al minuto (limitatore di Cloudflare RL_APK) e APK_PER_HOUR all'ora (contatore dl_hits). Un cliente,
   un negozio che installa su più TV o gli aggiornamenti delle app restano molto sotto; chi copia tutti gli APK in serie no. */
const APK_PER_HOUR = 120;
const apkStart = (req) => { const r = req.headers.get('Range'); return !r || /^bytes=0-/.test(r.trim()); };
async function apkFlood(env, req) {
  const key = ipNet(req.headers.get('CF-Connecting-IP') || '');
  if (!key) return false;
  if (env.RL_APK && typeof env.RL_APK.limit === 'function') {
    try { const { success } = await env.RL_APK.limit({ key: 'apk:' + key }); if (!success) return true; } catch {}
  }
  try {
    const r = await env.DB.prepare('INSERT INTO dl_hits (ip, h, n) VALUES (?, ?, 1) ON CONFLICT(ip, h) DO UPDATE SET n = dl_hits.n + 1 RETURNING n').bind(key, Math.floor(now() / 36e5)).first();
    return !!(r && +r.n > APK_PER_HOUR);
  } catch { return false; }
}
/** APK per ABI (13 novembre 2026): /get/<id>.apk?abi=arm64-v8a | armeabi-v7a dà l'APK leggero di quella ABI
 *  (GET_APK['<id>-arm64'] o ['<id>-arm32']) solo se l'ULTIMA release ce l'ha; in ogni altro caso quello di sempre.
 *  Lo chiedono l'app (aggiornamenti) e lo Store, che conoscono l'ABI del dispositivo: non devono sapere quali file ci sono.
 *  Serve il token (risposta certa, anche dai repository privati): senza, sempre l'APK di sempre. */
const ABI_APK = { 'arm64-v8a': '-arm64', 'armeabi-v7a': '-arm32' };
async function apkForAbi(env, id, abi) {
  const k = hasKey(ABI_APK, abi) ? id + ABI_APK[abi] : '';
  if (!k || !hasKey(GET_APK, k) || !ghTok(env)) return GET_APK[id];
  const p = ghRelOf(GET_APK[k][0]);
  if (!p) return GET_APK[id];
  try {
    const rel = await ghApi(env, `/repos/${GH_OWNER}/${p.repo}/releases/${p.tag ? 'tags/' + encodeURIComponent(p.tag) : 'latest'}`, relSlim);
    const a = relFile(rel, p.file);
    if (a && a.id && a.size > 0) return GET_APK[k];
  } catch {}
  return GET_APK[id];
}
async function cleanLinks(req, env, url, path) {
  const mj = path.match(/^\/get\/([a-z0-9-]{1,24})\.json$/);
  if (mj && req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS', 'Access-Control-Max-Age': '86400' } });
  if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('Metodo non consentito', { status: 405 });
  if (mj) {
    if (!hasKey(GET_FEED, mj[1])) return new Response('Non trovato', { status: 404 });
    const f = await dlFeed(env, mj[1]);
    if (!f) return new Response('Aggiornamenti non disponibili al momento', { status: 502, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
    // i link dell'APK sul dominio dei download (mai il pannello): se la richiesta arriva da lì, lo stesso dominio
    const dl = dlOrigins(env), base = dlHost(env, url.hostname) || !dl.length ? url.origin : dl[0];
    const out = feedLinks(f, mj[1], base);
    if (dl.length) out.mirrors = dl;
    // Kairos Nova non si registra: la politica pubblica degli aggiornamenti arriva col feed, come da /api/player/update
    if (mj[1] === 'nova') { const p = await novaPolicy(env); if (p) out.policy = p; }
    return new Response(req.method === 'HEAD' ? null : JSON.stringify(out), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=300' } });
  }
  const m = path.match(/^\/get\/([a-z0-9-]{1,24})\.apk$/);
  if (m) {
    if (!hasKey(GET_APK, m[1])) return new Response('Non trovato', { status: 404 });
    // limite agli scaricamenti in massa (11 novembre 2026): conta solo l'inizio di un download, non i pezzi «Range» né HEAD
    if (req.method === 'GET' && apkStart(req) && await apkFlood(env, req)) return new Response('Troppi download da questa connessione: riprova tra qualche minuto', { status: 429, headers: { 'Retry-After': '300', 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
    return dlApk(req, env, await apkForAbi(env, m[1], url.searchParams.get('abi') || ''));
  }
  if (path.startsWith('/get/')) return new Response('Non trovato', { status: 404 });
  if (path === '/store') return Response.redirect(url.origin + '/store/' + url.search, 302);
  let rel = path.slice('/store/'.length);
  if (!rel || rel.endsWith('/')) rel += 'index.html';
  if (!/^[A-Za-z0-9_./-]{1,200}$/.test(rel) || rel.includes('..')) return new Response('Non trovato', { status: 404 });
  const img = /\.(png|jpe?g|webp|gif|svg|ico|woff2?)$/i.test(rel);
  // con il token: i file di docs/ del repository kairos-store dall'API GitHub (anche con il repository privato)
  if (ghTok(env)) {
    const d = await storeDoc(env, rel).catch(() => null);
    if (d && d.dir) return Response.redirect(url.origin + '/store/' + rel + '/' + url.search, 302);
    if (d && d.nf) return new Response('Non trovato', { status: 404 });
    if (d && d.b) {
      const pub = rel === 'apps.json' ? storeAppsPublic(d.b) : null; // lo Store non riceve le app nascoste
      const h = new Headers();
      h.set('Content-Type', DOC_TYPE[((rel.match(/\.([A-Za-z0-9]+)$/) || [])[1] || '').toLowerCase()] || 'application/octet-stream');
      h.set('Content-Length', String(pub ? pub.byteLength : d.b.byteLength));
      h.set('Cache-Control', img ? 'public, max-age=3600' : 'no-cache');
      return new Response(req.method === 'HEAD' ? null : pub || d.b.slice(0), { status: 200, headers: h }); // una copia: quella in memoria resta intatta
    }
    // GitHub non risponde: si prova GitHub Pages (finché il repository è pubblico)
  }
  const up = await fetch(STORE_PAGES + rel + url.search, { cf: { cacheTtl: img ? 3600 : 60, cacheEverything: true } });
  if (!up.ok) return new Response(up.status === 404 ? 'Non trovato' : 'Store non disponibile al momento, riprova tra poco', { status: up.status === 404 ? 404 : 502 });
  const h = new Headers();
  for (const k of ['content-type', 'content-length', 'last-modified', 'etag']) { const v = up.headers.get(k); if (v) h.set(k, v); }
  h.set('Cache-Control', img ? 'public, max-age=3600' : 'no-cache');
  if (rel === 'apps.json') { // lo Store non riceve le app nascoste (il file è piccolo: si legge tutto)
    const raw = await up.arrayBuffer(), pub = storeAppsPublic(raw), out = pub || raw;
    h.set('Content-Length', String(out.byteLength)); if (pub) { h.delete('etag'); h.delete('last-modified'); }
    return new Response(req.method === 'HEAD' ? null : out, { status: 200, headers: h });
  }
  return new Response(req.method === 'HEAD' ? null : up.body, { status: 200, headers: h });
}

/* ---------------- App dello store (solo titolare): l'elenco delle app del Kairos Store ----------------
   È il file docs/apps.json del repository kairos-store, con le icone in docs/icons/. Prima si cambiava solo dal pannello
   a parte dello store (Worker «kairos-store»); ora anche da qui: Store → App dello store. Stesse regole dei dati.
   Per salvare serve STORE_GH_TOKEN: token GitHub a grana fine, solo kairos-store, «Contents» lettura e scrittura. Resta
   sul server (non arriva mai al browser). Senza, l'elenco si legge con GH_TOKEN o dalla copia pubblicata, solo da vedere.
   Gli agenti non arrivano qui: le loro rotte sono a parte e chiuse per tutto il resto. */
const storeTok = (env) => { const t = String((env && env.STORE_GH_TOKEN) || '').trim(); return /^[\x21-\x7e]{20,255}$/.test(t) ? t : ''; };
const SA_DOCS = `/repos/${GH_OWNER}/kairos-store/contents/docs/`;
const saStr = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
function storeAppsClean(d) {
  if (!d || typeof d !== 'object' || !Array.isArray(d.apps)) throw new HttpErr(400, 'Dati non validi');
  if (d.apps.length > 60) throw new HttpErr(400, 'Massimo 60 app');
  const st = d.store && typeof d.store === 'object' ? d.store : {};
  const out = {
    store: {
      name: saStr(st.name, 40) || 'KAIROS STORE',
      taglines: (Array.isArray(st.taglines) ? st.taglines : []).map((t) => saStr(t, 120)).filter(Boolean).slice(0, 10),
      contact: saStr(st.contact, 80),
    },
    apps: [],
  };
  d.apps.forEach((a0, i) => {
    const a = a0 && typeof a0 === 'object' ? a0 : {};
    const o = {
      name: saStr(a.name, 30), tag: saStr(a.tag, 14), description: saStr(a.description, 1000), url: saStr(a.url, 500),
      code: saStr(a.code, 12), icon: saStr(a.icon, 120), glow: saStr(a.glow, 7), pkg: saStr(a.pkg, 100),
      light: a.light === true, hidden: a.hidden === true,
    };
    const n = 'App ' + (i + 1) + (o.name ? ' (' + o.name + ')' : '');
    if (!o.name) throw new HttpErr(400, n + ': manca il nome');
    if (o.url && !/^https?:\/\/[^\s"'<>\\]+\.[^\s"'<>\\]+$/i.test(o.url)) throw new HttpErr(400, n + ': il link all\'APK non è valido');
    if (!o.url && !o.hidden) throw new HttpErr(400, n + ': manca il link all\'APK (oppure nascondila)');
    if (o.icon && !/^icons\/[A-Za-z0-9._-]+\.(webp|png|jpe?g|svg)$/.test(o.icon)) throw new HttpErr(400, n + ': icona non valida');
    if (!/^#[0-9a-fA-F]{6}$/.test(o.glow)) o.glow = '#22d3ee';
    if (!/^[A-Za-z0-9._]*$/.test(o.pkg)) throw new HttpErr(400, n + ': nome pacchetto non valido');
    out.apps.push(o);
  });
  return out;
}
const saB64 = (u8) => { let x = ''; for (let i = 0; i < u8.length; i += 0x8000) x += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(x); };
const saUnB64 = (t) => Uint8Array.from(atob(String(t || '').replace(/\s+/g, '')), (c) => c.charCodeAt(0));
async function saGh(tok, path, init = {}) {
  const h = { Accept: 'application/vnd.github+json', 'User-Agent': GH_UA, 'X-GitHub-Api-Version': GH_V, Authorization: 'Bearer ' + tok };
  if (init.body) h['Content-Type'] = 'application/json';
  const r = await tfetch(GH_API + path, { ...init, headers: h }, 15000);
  const j = await r.json().catch(() => null);
  if (!r.ok) { const e = new Error('GitHub ' + r.status); e.status = r.status; throw e; }
  return j;
}
function saErr(e) {
  const st = (e && e.status) || 0;
  if (st === 409 || st === 422) return new HttpErr(409, 'L\'elenco è stato cambiato altrove nel frattempo (per esempio dal pannello dello store a parte): ricarica e riprova');
  if (st === 401 || st === 403 || st === 404) return new HttpErr(502, `Il token dello store non può scrivere su kairos-store (GitHub ${st}): deve avere «Contents: Read and write» sul repository kairos-store`);
  return new HttpErr(502, `GitHub non risponde (${st || 'rete'}): riprova tra poco`);
}
async function storeApps(req, env, path, m, who, ip) {
  const wTok = storeTok(env), rTok = wTok || ghTok(env);
  if (path === '/store-apps' && m === 'GET') {
    let data = null, sha = '', icons = null, from = '';
    if (rTok) {
      try { const j = await saGh(rTok, SA_DOCS + 'apps.json?ref=main'); sha = String(j.sha || ''); data = JSON.parse(new TextDecoder().decode(saUnB64(j.content))); from = 'github'; }
      catch (e) { if (e && e.status === 404) from = 'nuovo'; }
      try { const l = await saGh(rTok, SA_DOCS + 'icons?ref=main'); if (Array.isArray(l)) icons = l.filter((f) => f && f.type === 'file' && /\.(webp|png|jpe?g|svg)$/i.test(f.name)).map((f) => 'icons/' + f.name); } catch {}
    }
    if (!data && from !== 'nuovo') { // senza token, o GitHub non risponde: la copia pubblicata dello store, solo da vedere
      try { const r = await tfetch(STORE_PAGES + 'apps.json', { cf: { cacheTtl: 30, cacheEverything: true } }, 8000); if (r.ok) { data = await r.json(); from = 'copia'; } } catch {}
    }
    if (!data || typeof data !== 'object' || !Array.isArray(data.apps)) data = { store: { name: 'KAIROS STORE', taglines: ['Le tue app, in un solo posto.'], contact: '' }, apps: [] };
    if (!icons) icons = [...new Set(data.apps.map((a) => a && a.icon).filter((x) => typeof x === 'string' && /^icons\//.test(x)))];
    return json({ data, sha, icons, from, canSave: !!wTok && (from === 'github' || from === 'nuovo'), token: wTok ? 'scrittura' : rTok ? 'lettura' : '' });
  }
  if (path === '/store-apps' && m === 'PUT') {
    if (!wTok) throw new HttpErr(400, 'Per salvare da qui manca il token dello store (STORE_GH_TOKEN): vedi le istruzioni nella pagina');
    const b = await readJSON(req, 256 * 1024);
    const clean = storeAppsClean(b.data);
    const put = { message: 'Aggiorna app dal pannello Kairos Control', content: saB64(new TextEncoder().encode(JSON.stringify(clean, null, 2) + '\n')), branch: 'main' };
    if (b.sha) put.sha = saStr(b.sha, 64);
    let r; try { r = await saGh(wTok, SA_DOCS + 'apps.json', { method: 'PUT', body: JSON.stringify(put) }); } catch (e) { throw saErr(e); }
    ghMem.delete(`/repos/${GH_OWNER}/kairos-store/git/trees/main?recursive=1`); // la pagina dello store la rilegge subito
    saHidMem = { t: now(), v: storeHiddenOf(clean.apps) }; // e gli agenti smettono subito di vedere le app Kairos nascoste
    await log(env, 'settings', `${who}: app dello store salvate (${clean.apps.filter((a) => !a.hidden).length} visibili su ${clean.apps.length})`, ip);
    return json({ ok: true, sha: String((r && r.content && r.content.sha) || ''), data: clean });
  }
  if (path === '/store-apps/icon' && m === 'POST') {
    if (!wTok) throw new HttpErr(400, 'Per caricare icone manca il token dello store (STORE_GH_TOKEN)');
    const b = await readJSON(req, 600 * 1024);
    const ext = b.type === 'png' ? 'png' : b.type === 'webp' ? 'webp' : '';
    if (!ext) throw new HttpErr(400, 'Formato icona non valido: serve PNG o WEBP');
    let bytes; try { bytes = saUnB64(b.data); } catch { throw new HttpErr(400, 'Immagine non valida'); }
    if (!bytes.length || bytes.length > 400000) throw new HttpErr(400, 'Immagine troppo grande (massimo 400 KB)');
    const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
    const isWebp = String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP';
    if ((ext === 'png' && !isPng) || (ext === 'webp' && !isWebp)) throw new HttpErr(400, 'Immagine non valida');
    const slug = saStr(b.name, 30).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'app';
    const rel = 'icons/' + slug + '-' + Date.now().toString(36) + '.' + ext;
    try { await saGh(wTok, SA_DOCS + rel, { method: 'PUT', body: JSON.stringify({ message: 'Icona ' + slug + ' dal pannello Kairos Control', content: saB64(bytes), branch: 'main' }) }); } catch (e) { throw saErr(e); }
    await log(env, 'settings', `${who}: icona caricata per lo store (${rel})`, ip);
    return json({ ok: true, path: rel });
  }
  throw new HttpErr(404, 'Non trovato');
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
const armOrigin = (value) => {
  const raw = str(value, 500).trim();
  if (!raw) return '';
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `http://${raw}`);
    return /^https?:$/.test(u.protocol) && !u.username && !u.password ? u.origin : '';
  } catch { return ''; }
};
const armLineOrigin = (line) => armOrigin(line && (line.url || line.dns || line.host));
async function linkedPanelDns(env, panel) {
  try {
    const row = await env.DB.prepare("SELECT dns FROM linked_lines WHERE source = ? AND dns IS NOT NULL AND dns <> '' LIMIT 1").bind(panel).first();
    return armOrigin(row && row.dns);
  } catch { return ''; }
}
async function armMasterDns(env, pv, settings, rawLines) {
  const P = armP(pv);
  let dns = armOrigin(settings && settings[P.sDns]);
  if (!dns && Array.isArray(rawLines)) dns = rawLines.map(armLineOrigin).find(Boolean) || '';
  if (!dns && rawLines === undefined && armKeyOf(env, pv)) {
    try { dns = armList(await armadaCall(env, settings || await getSettings(env), { action: 'lines_list' }, pv)).map(armLineOrigin).find(Boolean) || ''; } catch {}
  }
  if (!dns) dns = await linkedPanelDns(env, pv);
  if (dns && !(settings && settings[P.sDns])) await settingsPatch(env, { [P.sDns]: dns });
  return dns;
}
async function masterLineDns(env, panel) {
  if (ARM_PROV[panel]) return armMasterDns(env, panel, await getSettings(env));
  if (panel === 'wolf') {
    const cfg = await wolfCfg(env, WOLF_H);
    return armOrigin(cfg && cfg.dns) || await linkedPanelDns(env, panel);
  }
  if (panel === 'ro' || panel === 'slt') {
    const linked = await linkedPanelDns(env, panel);
    if (linked) return linked;
    try {
      const req = new Request(`https://kairos.local/admin/${panel}/lines`);
      const res = await extRoutes(req, env, `/${panel}/lines`, 'Risoluzione server', '', WOLF_H, null);
      const data = res instanceof Response ? await res.json() : res;
      return armOrigin(data && data.dns);
    } catch {}
  }
  return '';
}
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
2. Lo Store è **aperto**: nessun codice da scrivere e nessuna autorizzazione da chiedere. Il cliente preme **Installa** sull'app che vuole e l'app si scarica subito.
3. Il cliente apre l'app Kairos e ti manda la **foto del codice** che vede sulla TV: lo attivi tu dal pannello (Clienti → «+ Nuovo cliente» con quel codice), come sempre.
4. Nell'app Kairos il cliente inserisce il **codice KX** del cliente creato al passo 2; su MaxPlayer e OrbixPlay la lista è già dentro, basta aprire l'app.

# 4. Controlli finali
- In **Clienti → Appunti App** vedi su quali app è attiva ogni linea.
- In **Clienti → Collegati ora** vedi se il cliente sta guardando e con quante connessioni.
- Se qualcosa non riesce, dal riepilogo di «Nuova attivazione» usa **Riprova** senza ricreare la linea.`;
/* passaggi della guida di prima (codice venditore e approvazione dello store): nelle guide già salvate diventano quelli dello store aperto */
const GUIDE_OLD_STORE = [
  ["2. Nello Store il cliente scrive il **tuo codice venditore** (lo trovi in App e Store, pulsante «Copia»): così le sue richieste arrivano a te.", "2. Lo Store è **aperto**: nessun codice da scrivere e nessuna autorizzazione da chiedere. Il cliente preme **Installa** sull'app che vuole e l'app si scarica subito."],
  ["3. Quando il cliente chiede un'app, approvala in **App e Store → Richieste** (se l'approvazione è accesa). Da lì scarica e installa l'app.", "3. Il cliente apre l'app Kairos e ti manda la **foto del codice** che vede sulla TV: lo attivi tu dal pannello (Clienti → «+ Nuovo cliente» con quel codice), come sempre."],
];
const guideStoreOpen = (t) => GUIDE_OLD_STORE.reduce((x, [a, b]) => x.split(a).join(b), t);
function guideNorm(g) {
  const o = g && typeof g === 'object' ? g : {};
  const share = ['all', 'some', 'none'].includes(o.share) ? o.share : 'none';
  return { title: typeof o.title === 'string' && o.title.trim() ? o.title.trim().slice(0, 120) : GUIDE_DEF_TITLE, text: typeof o.text === 'string' && o.text.trim() ? guideStoreOpen(o.text).slice(0, 20000) : GUIDE_DEF_TEXT, share, agents: Array.isArray(o.agents) ? o.agents.map(String).slice(0, 500) : [], noticeAt: Number.isFinite(+o.noticeAt) && +o.noticeAt > 0 ? +o.noticeAt : 0 };
}
function guideForAgent(s, agentId) {
  const g = guideNorm(s.guide); if (g.share === 'all' || (g.share === 'some' && g.agents.includes(String(agentId)))) return { title: g.title, text: g.text, noticeAt: g.noticeAt };
  return null;
}
/* ---------------- «Info»: comunicazioni del titolare e guida «quale app su quale dispositivo» (14 novembre 2026) ----------------
   Il titolare le scrive nella pagina «Info» del pannello; gli agenti le leggono lì; lo Store le mostra nel riquadro «Info»
   (GET /api/store/info, pubblico: solo le parti con «Mostra anche nello Store» accesa). Stanno in una riga a parte della
   tabella settings (k = 'info'), non dentro le impostazioni: sono testi lunghi e non servono alle app. */
const INFO_APPS_DEF = `# Prima di installare: guarda quanta memoria (RAM) ha il dispositivo
- Apri il **Kairos Store** sul dispositivo del cliente e premi **«App consigliata per questo dispositivo»**: lo Store legge la memoria e ti dice l'app giusta.
- Nello stesso riquadro c'è la scheda del dispositivo: lì leggi quanta RAM ha.
- L'abbonamento e le liste sono gli stessi in tutte le app: cambiare app non cambia quello che il cliente vede.

# Fino a 1 GB di RAM
Fire TV Stick Lite, Fire TV Stick (1ª, 2ª e 3ª generazione), Fire TV Stick HD, box Android economici.
- **Kairos-XC**: la più leggera, è quella da installare.
- In alternativa **Kairos STB** o **Kairos Smarters**: riconoscono la chiavetta da 1 GB e si alleggeriscono da sole.
- Non installare Kairos Pro, KAIROS Ultimate e KAIROS HEAVY: qui vanno a scatti o si chiudono.

# Da 1 a 1,5 GB di RAM
Fire TV Stick 4K prima versione (2018), molti box Android.
- **Kairos-XC**, **Kairos STB** o **Kairos Smarters**.
- **Kairos Premium** solo se il dispositivo ha 1,5 GB pieni.

# Da 1,5 a 2 GB di RAM
- **Kairos Premium**: stile Netflix, fluida.
- **KAIROS Ultimate**: la più completa (Top 10, trailer, guida TV su tre livelli).

# 2 GB di RAM o più
Fire TV Stick 4K seconda versione (2023), Fire TV Stick 4K Max, Fire TV Cube, TV e box Android recenti.
- **Kairos Pro** oppure **KAIROS Ultimate**.
- **KAIROS HEAVY** (tutta in 3D, in anteprima): solo su dispositivi potenti.

# Regole semplici
- Nel dubbio scegli l'app più leggera: il cliente è più contento con un'app fluida che con una bella ma lenta.
- Una sola app Kairos per dispositivo: due app installate insieme occupano memoria per niente.
- Se un cliente ha blocchi o scatti, prima prova l'app più leggera della sua fascia, poi guarda la linea.`;
const infoText = (v, max) => (typeof v === 'string' ? v.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').slice(0, max) : '');
/* Due voci separate (14 novembre 2026, richiesta del titolare: «non devono essere collegati»):
   - per gli agenti: news (comunicazione) e apps (guida), si leggono solo nel pannello;
   - per lo Store: sNews e sApps, pubblicate nel riquadro «Info» dello Store. Vuote = lo Store non mostra quella parte.
   La prima stesura aveva un testo solo con «Mostra anche nello Store»: quello che lo Store mostrava allora resta. */
function infoNorm(x) {
  const o = x && typeof x === 'object' && !Array.isArray(x) ? x : {}, apps = infoText(o.apps, 12000).trim();
  const out = { news: infoText(o.news, 6000).trim(), apps: apps || INFO_APPS_DEF, newsAt: +o.newsAt > 0 ? +o.newsAt : 0, sNews: '', sApps: '', sNewsAt: 0, at: +o.at > 0 ? +o.at : 0 };
  if (typeof o.sNews === 'string' || typeof o.sApps === 'string') {
    out.sNews = infoText(o.sNews, 6000).trim(); out.sApps = typeof o.sApps === 'string' ? infoText(o.sApps, 12000).trim() : INFO_APPS_DEF; out.sNewsAt = +o.sNewsAt > 0 ? +o.sNewsAt : 0;
  } else { out.sNews = o.storeNews !== false ? out.news : ''; out.sNewsAt = out.newsAt; out.sApps = o.storeApps !== false ? out.apps : ''; }
  if (!out.news) out.newsAt = 0;
  if (!out.sNews) out.sNewsAt = 0;
  return out;
}
const infoMem = { t: 0, v: null };
async function infoGet(env) {
  if (infoMem.v && now() - infoMem.t < 60e3) return infoMem.v;
  let raw = null; try { const r = await env.DB.prepare("SELECT v FROM settings WHERE k = 'info'").first(); raw = r ? JSON.parse(r.v) : null; } catch {}
  infoMem.v = infoNorm(raw); infoMem.t = now(); return infoMem.v;
}
/** salva (solo titolare): la data di una comunicazione cambia solo quando cambia il suo testo, così «nuova» non si riaccende
 *  per niente. Una pagina del pannello rimasta aperta dalla prima stesura (senza sNews/sApps) cambia solo le voci degli agenti. */
async function infoPut(env, b) {
  infoMem.v = null;
  b = b && typeof b === 'object' && !Array.isArray(b) ? b : {};
  const cur = await infoGet(env), two = typeof b.sNews === 'string' || typeof b.sApps === 'string';
  const n = infoNorm({ news: b.news, apps: b.apps, sNews: two ? String(b.sNews == null ? '' : b.sNews) : cur.sNews, sApps: two ? String(b.sApps == null ? '' : b.sApps) : cur.sApps, newsAt: cur.newsAt, sNewsAt: cur.sNewsAt, at: now() });
  if (n.news !== cur.news) n.newsAt = n.news ? now() : 0;
  if (n.sNews !== cur.sNews) n.sNewsAt = n.sNews ? now() : 0;
  await env.DB.prepare("INSERT INTO settings (k, v) VALUES ('info', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(JSON.stringify(n)).run();
  infoMem.v = n; infoMem.t = now(); return n;
}
/** quello che riceve lo Store (pubblico, senza accesso): solo le due voci scritte per lo Store */
async function infoPublic(env) { const i = await infoGet(env); return { news: i.sNews, newsAt: i.sNewsAt, apps: i.sApps }; }
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
async function armadaRoutes(req, env, url, path, who, ip, agentId = 0, pv = 'armada', deferLog = false) {
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
    const rawLines = armList(raw), names = new Map(ags.map((a) => [a.id, a.username]));
    const dns = lines && !agentId ? await armMasterDns(env, pv, s, rawLines) : '';
    const list = rawLines.map((x) => { const o = lines ? { ...armCommon(x), username: str(x.username, 120), password: str(x.password, 200) } : { ...armCommon(x), mac: str(x.mac, 32) }; const by = armByOf(own, type, o); o.byAgent = by || 0; o.by = by ? names.get(by) || 'agente eliminato' : by === 0 ? 'Tu' : ''; return o; });
    return json(lines ? { lines: list, ...(agentId ? {} : { dns }) } : { mags: list });
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
    const x = armList(await call(params))[0] || {};
    const out = { type, userId: str(String(x.user_id ?? ''), 20), url: str(x.url, 500), mac: str(x.mac, 32) || params.user || '', message: str(x.message, 120), username: '', password: '', host: '' };
    if (type === 'm3u') { try { const u = new URL(out.url); out.username = u.searchParams.get('username') || ''; out.password = u.searchParams.get('password') || ''; out.host = u.origin; } catch {} }
    if (!agentId && out.host && !s[P.sDns]) await settingsPatch(env, { [P.sDns]: out.host }); // il DNS delle linee si impara dalla prima linea creata
    try { await env.DB.prepare('INSERT INTO armada_own (agent_id, type, line_id, username, mac, created, prov) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(agentId, type, out.userId, out.username, type === 'mag' ? out.mac.toUpperCase() : '', now(), pv).run(); memoDrop(env, 'armown:' + pv); } catch (e) { console.error('armada_own', e && e.message); }
    await llNote(env, { src: pv, app: N, owner: agentId, username: out.username || (type === 'mag' ? '' : out.userId), password: out.password, dns: out.host, mac: type === 'mag' ? out.mac : '', note: notes || '' });
    if (!deferLog) await log(env, 'new', `${who}: ${N} — creata ${type === 'mag' ? 'MAG ' + out.mac : 'linea ' + (out.username || out.userId)} (${sub ? sub + (sub === 1 ? ' mese' : ' mesi') : 'prova'})`, ip);
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
    const exp = armTs(x.expire_date ?? x.new_exp ?? x.exp_date), expText = exp ? ` · scadenza ${new Date(exp).toLocaleDateString('it-IT')}` : '';
    const credits = x.credits_spent ?? x.credits_used ?? x.debited ?? x.cost;
    const creditText = credits !== undefined && credits !== null ? ` · ${str(String(credits), 30)} crediti` : '';
    if (!deferLog) await log(env, 'edit', `${who}: ${N} — ${type === 'mag' ? 'MAG ' + params.mac : 'linea ' + params.username} rinnovata · durata ${sub} ${sub === 1 ? 'mese' : 'mesi'}${creditText}${expText}`, ip);
    return json({ ok: true, exp });
  }
  if (path === R + '/toggle' && m === 'POST') {
    const b = await readJSON(req, 512);
    const id = parseInt(b.id, 10), on = b.enabled === true;
    if (!(id > 0)) throw new HttpErr(400, 'Linea non valida');
    await call({ action: 'device_status', id, status: on ? 'enable' : 'disable' });
    const target = b.mac && !b.username ? `MAG ${str(b.mac, 32)}` : `linea ${str(b.username, 120).trim() || `#${id}`}`;
    await log(env, on ? 'on' : 'off', `${who}: ${N} — ${on ? 'attivata' : 'disattivata'} ${target} (#${id})`, ip);
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
    const [raw, own] = await Promise.all([call({ action: lines ? 'lines_list' : 'mag_devices_list' }), armOwnerMap(env, pv)]);
    const list = armList(raw).map((x) => {
      const o = lines ? { ...armCommon(x), username: str(x.username, 120), password: str(x.password, 200) } : { ...armCommon(x), mac: str(x.mac, 32) };
      return { o, by: armByOf(own, type, o) };
    }).filter(({ by }) => by !== undefined && mine.has(by)).map(({ o, by }) => {
      const { owner, ...item } = o;
      return lines ? { ...item, self: by === A.id } : item;
    });
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
    const r = await armadaRoutes(sub2({ ...b, type, sub }), env, url, path, who, ip, A.id, pv, sub > 0);
    if (!r || r.status !== 200) return r;
    const out = await r.json(), cost = armCost(sub, before, sub ? await armCreditsNow(env, s, pv) : null);
    await armSpend(env, A, cost, sub ? 'new' : 'trial', type === 'mag' ? out.mac : out.username || out.userId, pv);
    if (sub) ctx.waitUntil(log(env, 'new', `${who}: ${N} — creata ${type === 'mag' ? 'MAG ' + out.mac : 'linea ' + (out.username || out.userId)} (${sub} ${sub === 1 ? 'mese' : 'mesi'}) · ${armFmt(cost)} crediti del titolare`, ip));
    return json({ ...out, host: '', url: '', cost }); // all'agente mai il DNS né il link M3U
  }
  if (path === R + '/renew' && m === 'POST') {
    const b = await readJSON(req, 1024), sub = parseInt(b.sub, 10), type = b.type === 'mag' ? 'mag' : 'm3u';
    if (![1, 3, 6, 12].includes(sub)) throw new HttpErr(400, 'Rinnovo: 1, 3, 6 o 12 mesi');
    const ok = await ownFn(), x = type === 'mag' ? { mac: armMac(b.mac) } : { username: str(b.username, 120) };
    if (!(type === 'mag' ? x.mac : x.username) || !ok(type, x)) throw new HttpErr(404, 'Puoi rinnovare solo le linee create da te');
    await armBudget(env, all, A, sub, pv);
    const before = await armCreditsNow(env, s, pv);
    const r = await armadaRoutes(sub2({ ...b, type, sub }), env, url, path, who, ip, A.id, pv, true);
    if (!r || r.status !== 200) return r;
    const out = await r.json(), after = await armCreditsNow(env, s, pv);
    const measured = before !== null && after !== null && before - after >= 0 && before - after <= sub * 3;
    const cost = armCost(sub, before, after);
    await armSpend(env, A, cost, 'renew', type === 'mag' ? x.mac : x.username, pv);
    const expText = out.exp ? ` · scadenza ${new Date(out.exp).toLocaleDateString('it-IT')}` : '';
    ctx.waitUntil(log(env, 'edit', `${who}: ${N} — ${type === 'mag' ? 'MAG ' + x.mac : 'linea ' + x.username} rinnovata · durata ${sub} ${sub === 1 ? 'mese' : 'mesi'} · ${measured ? '' : 'circa '}${armFmt(cost)} crediti del titolare${expText}`, ip));
    return json({ ...out, cost, costEstimated: !measured });
  }
  if (path === R + '/toggle' && m === 'POST') {
    const b = await readJSON(req, 512), id = parseInt(b.id, 10);
    if (!(id > 0)) throw new HttpErr(400, 'Linea non valida');
    // l'id da solo non basta: si cerca la linea su Armada e deve essere una di quelle create da lui
    const [ls, ms, ok] = await Promise.all([call({ action: 'lines_list' }), call({ action: 'mag_devices_list' }), ownFn()]);
    const L = armList(ls).find((x) => +x.id === id), M = !L && armList(ms).find((x) => +x.id === id);
    if (!(L ? ok('m3u', { id, username: str(L.username, 120) }) : M ? ok('mag', { id, mac: str(M.mac, 32) }) : false)) throw new HttpErr(404, 'Puoi attivare o disattivare solo le linee create da te');
    return armadaRoutes(sub2({ id, enabled: b.enabled === true, username: L ? str(L.username, 120) : '', mac: M ? armMac(M.mac) : '' }), env, url, path, who, ip, A.id, pv);
  }
  if (path === R + '/resellers') throw new HttpErr(403, `I sotto-reseller di ${N} li vede solo il titolare`);
  throw new HttpErr(404, 'Non trovato');
}

/** impostazioni ('app') e DNS salvati ('dnsl'): un solo viaggio al database per richiesta (vedi reqMemo).
    Ogni chiamata restituisce oggetti nuovi (JSON riletto), quindi chi li modifica non tocca gli altri */
const cfgRows = (env) => reqMemo(env, 'cfg', async () => {
  const o = {};
  for (const r of ((await env.DB.prepare("SELECT k, v FROM settings WHERE k IN ('app', 'dnsl', 'dnsSat', 'chDead')").all()).results) || []) o[r.k] = r.v;
  return o;
});
const cfgDirty = (env) => memoDrop(env, 'cfg');
async function getSettings(env) {
  const v = (await cfgRows(env)).app;
  let s = {}; try { s = v ? JSON.parse(v) : {}; } catch {}
  const actApps = s.actApps && typeof s.actApps === 'object' && !Array.isArray(s.actApps) ? Object.fromEntries(Object.entries(s.actApps).filter(([k, v]) => validActAppKey(k) && typeof v === 'boolean')) : {};
  return { ...DEFAULT_SETTINGS, ...s, actApps, agSec: agSecNorm(s.agSec) };
}
const publicSettings = (s) => ({ brand: s.brand, tagline: s.tagline, accent: s.accent, announcement: s.announcement, supportContact: s.supportContact, allowLocalPlaylists: !!s.allowLocalPlaylists, serverUrl: s.serverUrl || '', showFootball: s.showFootball !== false, price: typeof s.price === 'string' ? s.price : DEFAULT_SETTINGS.price, privacy: typeof s.privacy === 'string' ? s.privacy : '' });

/* ---------------- eventi sportivi (calendari pubblici ESPN, in cache su D1) ---------------- */
const LEAGUES = [
  ['ita.1', 'Serie A'], ['uefa.champions', 'Champions League'], ['uefa.europa', 'Europa League'], ['uefa.europa.conf', 'Conference League'],
  ['ita.coppa_italia', 'Coppa Italia'], ['eng.1', 'Premier League'], ['esp.1', 'LaLiga'], ['ger.1', 'Bundesliga'], ['fra.1', 'Ligue 1'],
  // nazionali (12 novembre 2026): nelle soste dei campionati il calcio spariva dagli eventi. Le amichevoli solo dell'Italia
  ['uefa.nations', 'Nations League', { nat: 1 }], ['uefa.euroq', 'Qualificazioni Europei', { nat: 1 }], ['fifa.friendly', 'Amichevole', { nat: 1, only: 'Italia' }],
];
/* giorni in avanti per campionato: la Serie A due settimane (dopo una sosta si vede già la giornata successiva), gli altri 8 */
const LEAGUE_DAYS = { 'ita.1': 14 };
const EV_AHEAD = 14 * 86400e3; // fin dove arrivano gli eventi futuri nelle risposte (app e «Eventi ora»)
const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');
/* Fonti: «site API» pubblica di ESPN, senza chiavi: https://site.api.espn.com/apis/site/v2/sports/<percorso>/scoreboard
   tipo  'team'   due squadre (calcio, basket, NFL, rugby)
         'race'   un Gran Premio con le sue sessioni (F1: Libere, Qualifiche, Sprint, Gara)
         'tennis' tornei → tabelloni (singolare, doppio…) → partite
         'mma'    serate (UFC 310…) → incontri
   giorni: una richiesta per giorno da oggi (ESPN rifiuta gli intervalli di date). 0 = calendario corrente, senza data:
   per la F1 ESPN dà in una sola richiesta il weekend di gara in corso (o il prossimo) con tutte le sessioni.
   Il calcio resta com'era (8 giorni, stesse righe di cache «ev:<campionato>:<giorno>»); gli altri sport meno giorni,
   così ogni giro resta sotto il limite di 50 richieste del piano gratuito di Cloudflare.
   Mancano MotoGP, Eurolega, volley e ciclismo: ESPN non li ha. Per MotoGP ed Eurolega esistono solo le API interne dei
   siti ufficiali (non documentate, senza garanzie per chi le usa da fuori); per volley italiano e ciclismo nessuna fonte
   pubblica gratuita senza chiavi: andrebbero lette le pagine dei siti, cosa che qui non si fa. */
const EV_SRC = [
  ...LEAGUES.map(([code, label, x]) => ({ sport: 'calcio', key: code, path: 'soccer/' + code, label, kind: 'team', days: LEAGUE_DAYS[code] || 8, ...(x || {}) })),
  { sport: 'f1', key: 'racing/f1', label: 'Formula 1', kind: 'race', days: 0 },
  { sport: 'tennis', key: 'tennis/atp', label: 'ATP', kind: 'tennis', days: 2 },
  { sport: 'tennis', key: 'tennis/wta', label: 'WTA', kind: 'tennis', days: 2 },
  { sport: 'basket', key: 'basketball/nba', label: 'NBA', kind: 'team', days: 3 },
  { sport: 'nfl', key: 'football/nfl', label: 'NFL', kind: 'team', days: 7 },
  { sport: 'ufc', key: 'mma/ufc', label: 'UFC', kind: 'mma', days: 7 },
  { sport: 'rugby', key: 'rugby/180659', label: 'Sei Nazioni', kind: 'team', days: 3 },
  { sport: 'rugby', key: 'rugby/17567', label: 'Nations Championship', kind: 'team', days: 3 },
  { sport: 'rugby', key: 'rugby/270557', label: 'URC', kind: 'team', days: 3 },
  { sport: 'rugby', key: 'rugby/271937', label: 'Champions Cup', kind: 'team', days: 3 },
  { sport: 'rugby', key: 'rugby/289234', label: 'Test match', kind: 'team', days: 3 },
  // MotoGP (10 novembre 2026): non c'è su ESPN, si legge dal sito ufficiale (motogpBoard)
  { sport: 'motogp', key: 'motogp', label: 'MotoGP', kind: 'motogp', days: 0 },
];
for (const s of EV_SRC) if (!s.path) s.path = s.key;
/** sport che il titolare accende e spegne dal pannello (impostazione «sports»; non impostata = tutti) */
const SPORTS = ['calcio', 'f1', 'motogp', 'tennis', 'basket', 'nfl', 'ufc', 'rugby'];
// nelle app la MotoGP (arrivata dopo) resta spenta finché il titolare non la accende negli sport della Home
const sportsOf = (s) => (s.showFootball === false ? [] : Array.isArray(s.sports) ? SPORTS.filter((k) => s.sports.includes(k)) : SPORTS.filter((k) => k !== 'motogp'));
const EV_FETCH_MAX = 40;   // richieste a ESPN per giro (il piano gratuito ne permette 50 in tutto)
const EV_MAX = 30;         // eventi nella risposta v2
const EV_MIN = 2;          // posti garantiti a ogni sport presente
const EV_CAP = { f1: 5, motogp: 4, tennis: 4, basket: 4, nfl: 4, ufc: 2, rugby: 5 }; // al massimo per sport (il calcio riempie il resto; tennis ridotto da 6 a 4 per non coprire il calcio)

/* lettura difensiva: un campo mancante o di tipo sbagliato fa scartare l'evento, mai un'eccezione */
const evArr = (x) => (Array.isArray(x) ? x : []);
const evObj = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
const evS = (x, max = 120) => (typeof x === 'string' ? x.trim().slice(0, max) : typeof x === 'number' && isFinite(x) ? String(x) : '');
const evUrl = (x) => { const u = evS(x, 400); return /^https:\/\/[^\s"'<>]+$/.test(u) ? u : ''; };
const evDate = (x) => (typeof x === 'string' && isFinite(Date.parse(x)) ? x : '');
const evNorm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const evLogo = (j) => evUrl(evObj(evArr(evObj(evArr(evObj(j).leagues)[0]).logos)[0]).href);
function evSt(st) {
  const o = evObj(st), ty = evObj(o.type);
  const state = ['pre', 'in', 'post'].includes(ty.state) ? ty.state : ty.completed === true ? 'post' : 'pre';
  return { state, sd: evS(ty.shortDetail, 60), short: evS(ty.shortDetail, 40) || evS(ty.detail, 40), name: evS(ty.name, 40), period: Math.max(0, parseInt(o.period, 10) || 0), dclock: evS(o.displayClock, 12) };
}
/** orologio in italiano per gli sport diversi dal calcio (il calcio tiene quello di ESPN: «67'», «HT») */
function evClock(sport, st) {
  if (st.state !== 'in') return '';
  if (/HALF/i.test(st.name) || /^(half|halftime|ht)\b/i.test(st.short)) return 'Intervallo';
  if (sport === 'basket' || sport === 'nfl') return st.period ? (st.period > 4 ? 'Suppl.' : `${st.period}° quarto`) + (st.dclock && st.dclock !== '0:00' ? ' · ' + st.dclock : '') : '';
  return st.short;
}
/* nazionali di rugby: ESPN le dà in inglese, nella guida TV italiana sono in italiano */
const RUGBY_IT = { Italy: 'Italia', England: 'Inghilterra', France: 'Francia', Ireland: 'Irlanda', Scotland: 'Scozia', Wales: 'Galles', 'South Africa': 'Sudafrica', 'New Zealand': 'Nuova Zelanda', Japan: 'Giappone', Fiji: 'Figi', Chile: 'Cile', Portugal: 'Portogallo', Spain: 'Spagna', 'United States': 'Stati Uniti', USA: 'Stati Uniti', Netherlands: 'Paesi Bassi', Germany: 'Germania', Belgium: 'Belgio', Russia: 'Russia', Uruguay: 'Uruguay', Georgia: 'Georgia', Romania: 'Romania', Samoa: 'Samoa', Tonga: 'Tonga', Namibia: 'Namibia', Canada: 'Canada', Argentina: 'Argentina', Australia: 'Australia' };

/* nazionali di calcio: ESPN le dà in inglese */
const NAT_IT = { Italy: 'Italia', France: 'Francia', Germany: 'Germania', Spain: 'Spagna', England: 'Inghilterra', Portugal: 'Portogallo', Netherlands: 'Olanda', Belgium: 'Belgio', Croatia: 'Croazia',
  Switzerland: 'Svizzera', Denmark: 'Danimarca', Sweden: 'Svezia', Norway: 'Norvegia', Finland: 'Finlandia', Iceland: 'Islanda', Poland: 'Polonia', Czechia: 'Rep. Ceca', 'Czech Republic': 'Rep. Ceca',
  Slovakia: 'Slovacchia', Hungary: 'Ungheria', Greece: 'Grecia', 'Türkiye': 'Turchia', Turkey: 'Turchia', Cyprus: 'Cipro', Israel: 'Israele', Ukraine: 'Ucraina', Azerbaijan: 'Azerbaigian',
  Kazakhstan: 'Kazakistan', Belarus: 'Bielorussia', Lithuania: 'Lituania', Latvia: 'Lettonia', Moldova: 'Moldavia', Scotland: 'Scozia', Wales: 'Galles', 'Northern Ireland': 'Irlanda del Nord',
  'Republic of Ireland': 'Irlanda', Ireland: 'Irlanda', Luxembourg: 'Lussemburgo', 'North Macedonia': 'Macedonia del Nord', 'Bosnia-Herzegovina': 'Bosnia', 'Bosnia and Herzegovina': 'Bosnia',
  'Faroe Islands': 'Isole Faroe', Gibraltar: 'Gibilterra', Brazil: 'Brasile', 'United States': 'Stati Uniti', USA: 'Stati Uniti', Mexico: 'Messico', Japan: 'Giappone', Morocco: 'Marocco',
  Egypt: 'Egitto', Chile: 'Cile', Peru: 'Perù', 'South Korea': 'Corea del Sud', Cameroon: 'Camerun', 'Ivory Coast': 'Costa d\'Avorio', 'Saudi Arabia': 'Arabia Saudita', China: 'Cina' };
/* due squadre: calcio (stessa forma di prima), basket NBA, NFL, rugby */
function evTeam(j, src) {
  const out = [], lg = src.sport === 'calcio' ? '' : evLogo(j);
  for (const e of evArr(evObj(j).events)) {
    try {
      const c = evObj(evArr(e.competitions)[0]), cs = evArr(c.competitors);
      const side = (h) => {
        const x = evObj(cs.find((k) => k && k.homeAway === h)), t = evObj(x.team);
        let name = evS(t.shortDisplayName) || evS(t.displayName);
        if (src.sport === 'rugby') name = RUGBY_IT[evS(t.displayName)] || RUGBY_IT[name] || name;
        if (src.nat) name = NAT_IT[evS(t.displayName)] || NAT_IT[name] || evS(t.displayName) || name;
        const sc = x.score; // stringa («2») come la dà ESPN
        return { name, logo: evUrl(t.logo), score: typeof sc === 'string' || typeof sc === 'number' ? sc : undefined };
      };
      const st = evSt(e.status), home = side('home'), away = side('away'), start = evDate(e.date);
      if (!home.name || !away.name || !start) continue;
      if (src.only && home.name !== src.only && away.name !== src.only) continue; // amichevoli: solo quelle dell'Italia
      const ev = { id: evS(e.id, 40), league: src.label, start, home, away, venue: evS(evObj(c.venue).fullName, 120), live: st.state === 'in', state: st.state, clock: src.sport === 'calcio' ? st.sd : evClock(src.sport, st), sport: src.sport };
      if (!ev.id) continue;
      if (src.sport === 'nfl' && evObj(e.week).number) ev.round = `Settimana ${parseInt(e.week.number, 10) || ''}`.trim();
      if (lg) ev.logo = lg;
      out.push(ev);
    } catch {}
  }
  return out;
}

/* F1: ogni sessione del Gran Premio è un evento («GP del Brasile · Gara»), senza due lati */
const F1_SES = { fp1: 'Libere 1', fp2: 'Libere 2', fp3: 'Libere 3', p1: 'Libere 1', p2: 'Libere 2', p3: 'Libere 3', qual: 'Qualifiche', q: 'Qualifiche', qualifying: 'Qualifiche', ss: 'Qualifiche Sprint', sq: 'Qualifiche Sprint', sprintqualifying: 'Qualifiche Sprint', sprintshootout: 'Qualifiche Sprint', sr: 'Sprint', sprint: 'Sprint', sprintrace: 'Sprint', race: 'Gara', r: 'Gara' };
// prima il nome del circuito, la città e il paese (senza sponsor), poi il nome dell'evento; Qatar per ultimo («Qatar Airways» sponsorizza altri GP)
const GP_IT = [
  [/miami/, 'GP di Miami'], [/las vegas/, 'GP di Las Vegas'], [/sao paulo|interlagos|brazil|brasil/, 'GP del Brasile'], [/mexic/, 'GP del Messico'],
  [/united states|austin|americas/, 'GP degli Stati Uniti'], [/abu dhabi|yas marina/, 'GP di Abu Dhabi'], [/bahrain|sakhir/, 'GP del Bahrein'],
  [/jeddah|saudi/, "GP dell'Arabia Saudita"], [/melbourne|albert park|australia/, "GP d'Australia"], [/shanghai|china|chinese/, 'GP della Cina'],
  [/suzuka|japan/, 'GP del Giappone'], [/monaco|monte carlo/, 'GP di Monaco'], [/montreal|villeneuve|canad/, 'GP del Canada'],
  [/barcelona|catalunya|catalonia/, 'GP di Barcellona'], [/madrid|madring|spain|spanish|espana/, 'GP di Spagna'], [/spielberg|red bull ring|austria/, "GP d'Austria"],
  [/silverstone|brit/, 'GP di Gran Bretagna'], [/spa francorchamps|belgi/, 'GP del Belgio'], [/hungaroring|budapest|hungar/, "GP d'Ungheria"],
  [/zandvoort|netherlands|dutch/, "GP d'Olanda"], [/imola|emilia/, "GP dell'Emilia-Romagna"], [/monza|ital/, "GP d'Italia"],
  [/baku|azerbaijan/, "GP dell'Azerbaigian"], [/marina bay|singapore/, 'GP di Singapore'], [/lusail|qatar/, 'GP del Qatar'],
];
function gpIt(e) {
  const ci = evObj(e.circuit), ad = evObj(ci.address);
  for (const h of [evNorm([ci.fullName, ad.city, ad.country].map((x) => evS(x)).join(' ')), evNorm(evS(e.shortName) + ' ' + evS(e.name))]) {
    if (!h) continue;
    const m = GP_IT.find(([re]) => re.test(h)); if (m) return m[1];
  }
  const n = (evS(e.shortName) || evS(e.name)).replace(/\bformula\s*(1|one)\b/ig, '').replace(/\b(19|20)\d\d\b/g, '').replace(/\b(grand prix|gran premio|grande pr[eê]mio)\b/ig, 'GP').replace(/\s+/g, ' ').trim();
  return n.slice(0, 60);
}
function evRace(j, src) {
  const out = [], lg = evLogo(j);
  for (const e of evArr(evObj(j).events)) {
    try {
      const gp = gpIt(e), ci = evObj(e.circuit), venue = evS(ci.fullName, 80) || evS(evObj(evObj(evArr(e.competitions)[0]).venue).fullName, 80);
      if (!gp) continue;
      for (const c of evArr(e.competitions)) {
        try {
          const ty = evObj(c.type), ab = evS(ty.abbreviation, 30) || evS(ty.text, 30) || evS(ty.name, 30);
          const ses = F1_SES[ab.toLowerCase().replace(/[^a-z0-9]/g, '')] || ab, start = evDate(c.date) || evDate(c.startDate);
          if (!ses || !start) continue;
          const st = evSt(c.status), id = evS(c.id, 40) || (evS(e.id, 40) && `${evS(e.id, 40)}-${ab}`);
          if (!id) continue;
          const ev = { id, sport: src.sport, league: src.label, start, live: st.state === 'in', state: st.state, clock: st.state === 'in' && /^(Gara|Sprint)$/.test(ses) && st.period ? `Giro ${st.period}` : '', title: `${gp} · ${ses}`, gp, session: ses, venue, round: ses };
          if (st.state !== 'pre') {
            // in corso o finita: i primi tre (ordine di ESPN = posizione)
            const top = evArr(c.competitors).map((x) => { const a = evObj(evObj(x).athlete); return { o: parseInt(evObj(x).order, 10) || 99, name: evS(a.shortName, 40) || evS(a.displayName, 40), flag: evUrl(evObj(a.flag).href) }; })
              .filter((x) => x.name).sort((a, b) => a.o - b.o).slice(0, 3).map(({ name, flag }) => ({ name, flag }));
            if (top.length) ev.top = top;
          }
          if (lg) ev.logo = lg;
          out.push(ev);
        } catch {}
      }
    } catch {}
  }
  return out;
}

/* tennis: solo il tabellone principale di singolare (niente doppi, qualificazioni, juniores) */
const TN_ROUND = [[/^finals?$/i, 'Finale', 6], [/semi/i, 'Semifinale', 5], [/quarter/i, 'Quarti di finale', 4], [/round robin/i, 'Round robin', 4],
  [/round of 16|4th round|fourth round/i, 'Ottavi di finale', 3], [/round of 32/i, 'Sedicesimi di finale', 2], [/round of 64/i, 'Trentaduesimi di finale', 1],
  [/round of 128|first round/i, '1° turno', 1], [/second round/i, '2° turno', 1], [/third round/i, '3° turno', 2], [/(\d)\s*(?:st|nd|rd|th)?\s*round|round\s*(\d)/i, null, 1]];
function tnRound(s) {
  for (const [re, it, w] of TN_ROUND) { const m = s.match(re); if (m) return [it || `${m[1] || m[2]}° turno`, w]; }
  return [s, 1];
}
function evTennis(j, src) {
  const out = [], lg = evLogo(j);
  for (const e of evArr(evObj(j).events)) {
    try {
      const tn = evS(e.shortName, 60) || evS(e.name, 60);
      if (!tn) continue;
      const league = new RegExp('\\b' + src.label + '\\b', 'i').test(tn) ? tn : `${src.label} · ${tn}`;
      // peso del torneo: Slam, Finals, Masters 1000
      const tier = e.major === true || /australian open|roland|garros|wimbledon|us open|finals|masters|1000/i.test(tn) ? 2 : 0;
      const groups = evArr(e.groupings).length ? evArr(e.groupings) : [{ grouping: {}, competitions: e.competitions }];
      for (const g of groups) {
        const gg = evObj(evObj(g).grouping), gn = (evS(gg.slug) + ' ' + evS(gg.displayName)).toLowerCase();
        if (gn.trim() && (!/singles|singolare/.test(gn) || /doubles|doppio|qualif|junior|boys|girls|wheelchair|legend|mixed/.test(gn))) continue;
        for (const c of evArr(evObj(g).competitions)) {
          try {
            const ty = evObj(c.type), tt = (evS(ty.slug) + ' ' + evS(ty.text) + ' ' + evS(ty.name)).toLowerCase(), rr = evS(evObj(c.round).displayName, 40) || evS(evObj(c.round).name, 40);
            if (/doubles|qualif|mixed/.test(tt) || /qualif/i.test(rr)) continue;
            const cs = evArr(c.competitors).filter((x) => x && typeof x === 'object');
            if (cs.length !== 2) continue;
            const pl = (x) => {
              const a = evObj(x.athlete), fl = evObj(a.flag), full = evS(a.displayName, 60) || evS(a.fullName, 60);
              const ls = evArr(x.linescores).map(evObj);
              const seed = parseInt(x.tournamentSeed, 10) || parseInt(evObj(x.curatedRank).current, 10) || 0;
              return { name: evS(a.shortName, 40) || full, full, logo: evUrl(fl.href), it: /^ital/i.test(evS(fl.alt)) || /\/ita\.png$/i.test(evS(fl.href)), seed: seed > 0 && seed < 99 ? seed : 0,
                ls, sets: ls.map((l) => (l.value === '' || l.value == null || !isFinite(+l.value) ? null : +l.value)).filter((v) => v !== null), home: x.homeAway === 'home', order: parseInt(x.order, 10) || 9 };
            };
            let [h, a] = cs.map(pl);
            if (a.home && !h.home || (!h.home && !a.home && a.order < h.order)) [h, a] = [a, h];
            if (!h.name || !a.name || [h.name, a.name, h.full, a.full].some((n) => /^tbd$|^bye$/i.test(n))) continue;
            const st = evSt(c.status), start = evDate(c.date) || evDate(c.startDate), id = evS(c.id, 40);
            if (!start || !id) continue;
            // set vinti: quelli che ESPN segna come vinti, altrimenti i set finiti (6-4, 7-5, 7-6…)
            const won = (p, q) => p.ls.reduce((n, l, i) => { const g = +l.value, o = +evObj(q.ls[i]).value; if (l.winner === true) return n + 1; if (p.ls.some((y) => y.winner !== undefined)) return n; return n + (isFinite(g) && isFinite(o) && ((g >= 6 && g - o >= 2) || (g === 7 && o === 6)) ? 1 : 0); }, 0);
            const [rd, rw] = tnRound(rr);
            const side = (p, q) => ({ name: p.name, logo: p.logo, score: st.state === 'pre' ? undefined : String(won(p, q)), sets: p.sets, ...(p.seed ? { seed: p.seed } : {}), ...(p.it ? { it: true } : {}) });
            const best = Math.min(h.seed || 99, a.seed || 99);
            out.push({ id, sport: src.sport, league, start, live: st.state === 'in', state: st.state, clock: st.state === 'in' ? (st.period ? `${st.period}° set` : 'In corso') : '',
              home: side(h, a), away: side(a, h), venue: evS(evObj(c.venue).court, 60) || evS(evObj(c.venue).fullName, 60) || evS(evObj(e.venue).fullName, 60), round: rd,
              // importanza per la scelta (non esce nella risposta): italiani, teste di serie, turno, torneo
              imp: (h.it || a.it ? 50 : 0) + (best < 99 ? Math.max(0, 33 - best) / 2 : 0) + rw * 4 + tier * 5, ...(lg ? { logo: lg } : {}) });
          } catch {}
        }
      }
    } catch {}
  }
  return out;
}

/* UFC: una serata è un evento («UFC 310»), con i due lottatori dell'incontro principale */
function evMma(j, src) {
  const out = [], lg = evLogo(j);
  for (const e of evArr(evObj(j).events)) {
    try {
      const name = evS(e.name, 160), title = (name.split(':')[0] || '').trim() || evS(e.shortName, 60) || src.label, id = evS(e.id, 40);
      const all = evArr(e.competitions).map(evObj), fights = all.filter((c) => evArr(c.competitors).filter((x) => x && x.athlete).length === 2);
      const sts = all.map((c) => evSt(c.status)), live = sts.find((s) => s.state === 'in');
      const start = evDate(e.date) || evDate((all[0] || {}).date);
      if (!id || !start || !title) continue;
      // serata in corso: un incontro in corso, oppure già iniziata con incontri finiti e altri da fare
      // (prima dell'inizio un incontro «finito» è uno annullato: la serata non è in diretta)
      const state = live ? 'in' : sts.length ? (sts.every((s) => s.state === 'post') ? 'post' : sts.some((s) => s.state === 'post') && Date.parse(start) <= now() ? 'in' : 'pre') : evSt(e.status).state;
      // incontro principale: quello dei due nomi nel titolo («… : Pantoja vs. Asakura»), altrimenti l'ultimo in programma
      const names = (c) => evArr(c.competitors).map((x) => evNorm(evS(evObj(evObj(x).athlete).displayName)));
      const vs = evNorm(name.split(':').slice(1).join(' ')).split(/\s+vs\s+/).map((s) => s.split(' ').pop()).filter(Boolean);
      let main = vs.length === 2 ? fights.find((c) => { const n = names(c).join('|'); return vs.every((v) => n.includes(v)); }) : null;
      if (!main && fights.length) main = fights.reduce((b, c) => ((Date.parse(c.date) || 0) >= (Date.parse(b.date) || 0) ? c : b));
      const ev = { id, sport: src.sport, league: src.label, start, live: state === 'in', state, clock: live && live.period ? `${live.period}° round` : '', title, venue: evS(evObj(evArr(e.venues)[0]).fullName, 80) || evS(evObj(evObj(all[0]).venue).fullName, 80) };
      if (main) {
        const cs = evArr(main.competitors).map(evObj).sort((a, b) => (parseInt(a.order, 10) || 9) - (parseInt(b.order, 10) || 9));
        const f = (x) => { const a = evObj(x.athlete); return { name: evS(a.shortName, 40) || evS(a.displayName, 40), logo: evUrl(evObj(a.flag).href) }; };
        const [h, a] = cs.map(f);
        if (h && a && h.name && a.name) { ev.home = h; ev.away = a; ev.round = 'Incontro principale'; }
      }
      if (lg) ev.logo = lg;
      out.push(ev);
    } catch {}
  }
  return out;
}
const EV_PARSE = { team: evTeam, race: evRace, tennis: evTennis, mma: evMma };
/* MotoGP: API pubblica del sito ufficiale (la usa motogp.com; senza chiavi ma senza documentazione: se cambia, la MotoGP
   resta vuota e il resto va avanti). Stagione corrente → classe MotoGP → GP in corso o prossimo → sessioni con l'orario.
   Un solo GP alla volta, come il calendario corrente della F1. Stagione e classe restano in memoria un giorno. */
const MGP_API = 'https://api.motogp.pulselive.com/motogp/v1/results';
const MGP_SES = { FP: 'Prove libere', PR: 'Pre-qualifiche', Q: 'Qualifiche', SPR: 'Sprint', WUP: 'Warm up', RAC: 'Gara' };
const MGP_MIN = { FP: 45, PR: 60, Q: 15, SPR: 45, WUP: 10, RAC: 50 };
let mgpMem = { t: 0, sid: '', cat: '' };
async function motogpBoard() {
  const get = async (p) => { const r = await fetch(MGP_API + p, { headers: { 'User-Agent': 'Mozilla/5.0 KairosPanel', Accept: 'application/json' }, signal: AbortSignal.timeout(8000) }); if (!r.ok) throw Object.assign(new Error('HTTP ' + r.status), { status: r.status }); return r.json(); };
  const t = now();
  if (!mgpMem.sid || t - mgpMem.t > 86400e3) {
    const seasons = evArr(await get('/seasons')).map(evObj), yr = new Date(t).getUTCFullYear();
    const season = seasons.find((x) => x.current === true) || seasons.find((x) => +x.year === yr);
    const sid = season ? evS(season.id, 60) : '';
    if (!sid) return [];
    const cat = evArr(await get('/categories?seasonUuid=' + encodeURIComponent(sid))).map(evObj).find((c) => /^motogp/i.test(evS(c.name, 40)));
    if (!cat || !evS(cat.id, 60)) return [];
    mgpMem = { t, sid, cat: evS(cat.id, 60) };
  }
  const day = (v) => { const x = Date.parse(evS(v, 40)); return isFinite(x) ? x : NaN; };
  const L = evArr(await get('/events?seasonUuid=' + encodeURIComponent(mgpMem.sid) + '&isFinished=false')).map(evObj)
    .filter((e) => evS(e.id, 60) && e.test !== true).map((e) => ({ e, a: day(e.date_start), b: day(e.date_end) })).filter((x) => isFinite(x.a)).sort((x, y) => x.a - y.a);
  const cur = L.find((x) => (isFinite(x.b) ? x.b : x.a) + 86400e3 > t);
  if (!cur) return [];
  const gp = evS(cur.e.name, 80) || evS(cur.e.sponsored_name, 80), ci = evObj(cur.e.circuit), venue = [evS(ci.name, 80), evS(ci.place, 40)].filter(Boolean).join(', ');
  const out = [];
  for (const x of evArr(await get('/sessions?eventUuid=' + encodeURIComponent(evS(cur.e.id, 60)) + '&categoryUuid=' + encodeURIComponent(mgpMem.cat))).map(evObj)) {
    const ty = evS(x.type, 10).toUpperCase(), num = parseInt(x.number, 10) || 0, start = evDate(x.date);
    if (!MGP_SES[ty] || !start) continue;
    const st0 = Date.parse(start), end = st0 + (MGP_MIN[ty] || 45) * 60e3 + 20 * 60e3, status = evS(x.status, 30).toLowerCase();
    const done = /finish|complete|official|ended/.test(status) || t > end, live = !done && t >= st0;
    const name = MGP_SES[ty] + (num && (ty === 'FP' || ty === 'Q') ? ' ' + num : '');
    out.push({ id: evS(x.id, 60) || `${evS(cur.e.id, 60)}-${ty}${num}`, sport: 'motogp', league: 'MotoGP', start, live, state: live ? 'in' : done ? 'post' : 'pre', clock: '', title: `${gp} · ${name}`, gp, session: name, venue, round: name });
  }
  return out;
}
async function espnBoard(src, day) {
  if (src.kind === 'motogp') return motogpBoard();
  const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${src.path}/scoreboard${day ? '?dates=' + day : ''}`, { headers: { 'User-Agent': 'Mozilla/5.0 KairosPanel' } });
  if (!r.ok) throw Object.assign(new Error('HTTP ' + r.status), { status: r.status });
  return EV_PARSE[src.kind](await r.json(), src);
}
/** validità di una riga di cache: oggi 5 minuti (risultati in diretta), domani 1 ora, gli altri giorni 6 ore.
    Giorno senza eventi: oggi 30 minuti, domani 2 ore. Calendario corrente (F1): 5 minuti se c'è una sessione entro 36 ore.
    Errore: oggi si riprova tra 15 minuti, gli altri giorni tra un'ora; fonte rifiutata da ESPN (400/404) tra 6 ore */
function evTtl(src, di, v) {
  if (v && v.err) return v.err >= 400 && v.err < 500 && v.err !== 429 ? 6 * 3600e3 : di === 0 ? 15 * 60e3 : 3600e3;
  const ev = (v && v.ev) || [];
  if (!src.days) { const t = now(); return ev.some((e) => e.live || Math.abs(Date.parse(e.start) - t) < 36 * 3600e3) ? 5 * 60e3 : 3600e3; }
  if (di === 0) return ev.length ? 5 * 60e3 : 30 * 60e3;
  if (di === 1) return ev.length ? 3600e3 : 2 * 3600e3;
  return 6 * 3600e3;
}
/** righe di cache volute per gli sport accesi: il calcio a giorni come prima (UTC), gli altri sul giorno di ESPN
    (orario della costa est USA: le partite NBA/NFL della notte italiana restano nel giorno giusto) */
function evWanted(on, t = now()) {
  const out = [];
  for (const src of EV_SRC) {
    if (!on.includes(src.sport)) continue;
    if (!src.days) { out.push({ k: `ev:${src.key}:cur`, src, day: '', di: 0 }); continue; }
    for (let i = 0; i < src.days; i++) {
      const day = ymd(new Date(t + (src.sport === 'calcio' ? 0 : -5 * 3600e3) + i * 86400e3));
      out.push({ k: `ev:${src.key}:${day}`, src, day, di: i });
    }
  }
  return out;
}
/* ESPN si interroga un giorno alla volta per ogni fonte; ogni «fonte+giorno» viene salvato in D1 (la cache di Cloudflare
   non funziona su workers.dev) e riscaricato solo quando è vecchio, prima oggi, al massimo EV_FETCH_MAX richieste per giro */
let evMem = { t: 0, sigs: new Set(), have: null, out: {} };
// richieste che costa una fonte: la MotoGP fino a 4 (stagione, classe, GP, sessioni), le altre 1
const evCost = (w) => (w.src.kind === 'motogp' ? 4 : 1);
async function evData(env, ctx, on) {
  const sig = on.join(), fresh = evMem.have && now() - evMem.t < 3 * 60e3;
  if (fresh && evMem.sigs.has(sig)) return evMem;
  // le app (sport accesi) e il pannello («Eventi ora», tutti gli sport) usano le stesse righe: entro 3 minuti niente nuova lettura
  const have = fresh ? evMem.have : new Map(((((await env.DB.prepare("SELECT k, v FROM settings WHERE k LIKE 'ev:%'").all()).results) || [])).map((r) => { try { return [r.k, JSON.parse(r.v)]; } catch { return [r.k, null]; } }));
  const wanted = evWanted(on);
  const todo = wanted.filter((w) => { const h = have.get(w.k); return !h || now() - (+h.t || 0) > evTtl(w.src, w.di, h); }).sort((a, b) => a.di - b.di);
  const go = []; let cost = 0; for (const w of todo) { if (cost + evCost(w) > EV_FETCH_MAX) break; cost += evCost(w); go.push(w); }
  const got = await Promise.all(go.map(async (w) => { try { return { ...w, ev: await espnBoard(w.src, w.day) }; } catch (e) { return { ...w, err: +(e && e.status) || 1 }; } }));
  const writes = [], put = (k, v) => env.DB.prepare('INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind(k, JSON.stringify(v));
  for (const g of got) {
    // errore (ESPN giù, campionato sparito): si tengono gli eventi di prima e si riprova più tardi, senza insistere a ogni giro
    const old = have.get(g.k), v = g.err ? { t: now(), ev: (old && old.ev) || [], err: g.err } : { t: now(), ev: g.ev };
    have.set(g.k, v); writes.push(put(g.k, v));
  }
  // via le righe che non servono più: giorni passati e fonti sparite (quelle degli sport spenti nelle app restano per «Eventi ora»)
  const want = new Set(evWanted(SPORTS).map((w) => w.k));
  for (const k of [...have.keys()]) if (!want.has(k)) { writes.push(env.DB.prepare('DELETE FROM settings WHERE k = ?').bind(k)); have.delete(k); }
  if (writes.length) { const w = env.DB.batch(writes).catch(() => {}); ctx && ctx.waitUntil ? ctx.waitUntil(w) : await w; }
  evMem = { t: fresh ? evMem.t : now(), sigs: new Set([...(fresh ? evMem.sigs : []), sig]), have, out: {} };
  return evMem;
}
const evOrd = (a, b) => (+!!b.live - +!!a.live) || (Date.parse(a.start) - Date.parse(b.start));
/** scelta degli eventi della risposta v2: prima quelli in diretta, poi i più vicini; qualche posto garantito a ogni sport
    e un massimo per gli sport con tante partite. Tennis: in corso, poi italiani, teste di serie e turni avanzati */
function evPick(list) {
  const by = new Map();
  for (const e of list) { if (!by.has(e.sport)) by.set(e.sport, []); by.get(e.sport).push(e); }
  for (const [sp, a] of by) {
    a.sort(sp === 'tennis' ? (x, y) => (+!!y.live - +!!x.live) || ((y.imp || 0) - (x.imp || 0)) || (Date.parse(x.start) - Date.parse(y.start)) : evOrd);
    if (EV_CAP[sp] && a.length > EV_CAP[sp]) a.length = EV_CAP[sp];
  }
  const pick = new Set();
  for (const a of by.values()) a.slice(0, EV_MIN).forEach((e) => pick.add(e));
  // riempimento dei posti rimasti con priorità al calcio (12 novembre 2026): prima gli eventi in diretta di ogni sport,
  // poi il calcio (per orario), poi gli altri sport. Così il calcio e gli sport grossi non restano fuori per i tornei minori
  const fill = [...by.values()].flat().sort((x, y) =>
    (+!!y.live - +!!x.live) || (+(y.sport === 'calcio') - +(x.sport === 'calcio')) || evOrd(x, y));
  for (const e of fill) { if (pick.size >= EV_MAX) break; pick.add(e); }
  return [...pick].sort(evOrd);
}
const evSide = (s) => { const o = { name: s.name, logo: s.logo || '' }; for (const k of ['score', 'sets', 'seed', 'it']) if (s[k] !== undefined) o[k] = s[k]; return o; };
/** evento normalizzato della risposta v2 */
function evOut(e) {
  const o = { id: `${e.sport}:${e.id}`, sport: e.sport, league: e.league, start: e.start, live: !!e.live, state: e.state, clock: e.clock || '' };
  if (e.title) o.title = e.title;
  if (e.home && e.away) { o.home = evSide(e.home); o.away = evSide(e.away); }
  o.venue = e.venue || ''; o.round = e.round || '';
  for (const k of ['gp', 'session', 'top', 'logo']) if (e[k]) o[k] = e[k];
  // emittenti italiane «di solito» (12 novembre 2026): anche alle app, per cercare subito il canale dell'evento scelto
  const tv = evTv(e); if (tv.length) o.tv = tv;
  return o;
}
/** /api/player/events — senza ?v=2 solo calcio e la stessa forma di sempre (le interfacce vecchie leggono home/away);
    con ?v=2 tutti gli sport accesi dal pannello, nel formato nuovo */
async function sportsEvents(env, ctx, v = 1) {
  const s = await getSettings(env), on = sportsOf(s);
  const t = now(), use = v === 2 ? on : on.filter((k) => k === 'calcio');
  if (!use.length) return v === 2 ? { v: 2, events: [], sports: [], updated: t } : { events: [], updated: t };
  const mem = await evData(env, ctx, on);
  const key = v + '|' + use.join();
  if (mem.out[key]) return mem.out[key];
  const seen = new Set(), all = [];
  for (const val of mem.have.values()) for (const e of (val && val.ev) || []) {
    const sp = e.sport || 'calcio'; // righe salvate prima degli altri sport: sono di calcio
    if (!use.includes(sp) || seen.has(sp + ':' + e.id)) continue;
    seen.add(sp + ':' + e.id); all.push(sp === e.sport ? e : { ...e, sport: sp });
  }
  let body;
  if (v === 2) {
    // in corso (anche da molte ore: tennis, UFC) oppure da giocare entro due settimane
    const ok = all.filter((e) => { const st = Date.parse(e.start); return st < t + EV_AHEAD && ((e.live && st > t - 12 * 3600e3) || (e.state !== 'post' && st > t - 4 * 3600e3)); });
    body = { v: 2, events: evPick(ok).map(evOut), sports: on, updated: t };
  } else {
    const events = all.filter((e) => e.state !== 'post' && +new Date(e.start) > t - 4 * 3600e3)
      .sort((a, b) => (+b.live - +a.live) || (new Date(a.start) - new Date(b.start))).slice(0, 40)
      .map((e) => ({ id: e.id, league: e.league, start: e.start, home: { name: e.home.name, logo: e.home.logo, score: e.home.score }, away: { name: e.away.name, logo: e.away.logo, score: e.away.score }, venue: e.venue, live: e.live, state: e.state, clock: e.clock }));
    body = { events, updated: t };
  }
  mem.out[key] = body;
  return body;
}
/* ---------------- «Eventi ora» nel pannello (10 novembre 2026) ----------------
   Gli stessi eventi della Pro (ESPN e MotoGP), tutti gli sport: in diretta, finiti da poco e da giocare entro due settimane
   (12 novembre 2026: prima 36 ore; la pagina li divide in «Più tardi» e «Prossimi giorni»), con le
   emittenti italiane di solito (le stesse di «Dove vederla» della Pro). Canali della lista e guida TV a parte (eventsChans). */
const EV_TV = [
  [/serie a/i, ['DAZN', 'Sky Sport']], [/champions/i, ['Sky Sport', 'Prime Video', 'Canale 5']], [/europa|conference/i, ['Sky Sport', 'DAZN', 'TV8']],
  [/premier/i, ['Sky Sport']], [/laliga|la liga|liga/i, ['DAZN']], [/bundesliga/i, ['Sky Sport']], [/ligue/i, ['DAZN']], [/serie b/i, ['DAZN', 'Sky Sport']], [/coppa italia/i, ['Canale 5', 'Italia 1']],
  ['f1', ['Sky Sport F1', 'TV8']], ['motogp', ['Sky Sport MotoGP', 'TV8']], ['tennis', ['Sky Sport Tennis', 'SuperTennis']], ['basket', ['Sky Sport NBA']], ['nfl', ['DAZN']], ['ufc', ['DAZN']], ['rugby', ['Sky Sport']],
];
const evTv = (e) => {
  // la Nazionale italiana (Nations League, qualificazioni, amichevoli): di solito sulla Rai; le altre nazionali non si indovinano
  if ((!e.sport || e.sport === 'calcio') && /nations|qualificazioni|amichevole/i.test(e.league || '')) return [e.home, e.away].some((x) => x && x.name === 'Italia') ? ['Rai 1'] : [];
  const r = e.sport && e.sport !== 'calcio' ? EV_TV.find(([k]) => k === e.sport) : EV_TV.find(([k]) => k instanceof RegExp && k.test(e.league || '')); return r ? r[1] : [];
};
async function panelEvents(env, ctx) {
  const mem = await evData(env, ctx, SPORTS);
  const t = now(), seen = new Set(), all = [];
  for (const val of mem.have.values()) for (const e of (val && val.ev) || []) {
    const sp = e.sport || 'calcio';
    if (!SPORTS.includes(sp) || seen.has(sp + ':' + e.id)) continue;
    seen.add(sp + ':' + e.id); all.push(sp === e.sport ? e : { ...e, sport: sp });
  }
  const ok = all.filter((e) => { const st = Date.parse(e.start); if (!isFinite(st)) return false; if (e.live) return st > t - 12 * 3600e3; if (e.state === 'post') return st > t - 5 * 3600e3 && st <= t; return st > t - 3 * 3600e3 && st < t + EV_AHEAD; });
  return { v: 1, events: ok.sort(evOrd).slice(0, 220).map((e) => ({ ...evOut(e), tv: evTv(e) })), sports: SPORTS, updated: t };
}
/** canali sportivi della lista più usata dai clienti (solo nome e gruppo, mai indirizzi o credenziali), per «dove vederla» */
const EV_CH_RX = /sport|calcio|dazn|eurosport|serie ?a\b|football|formula ?1|\bf1\b|motogp|tennis|\bnba\b|\bufc\b|basket|rugby|champions|premier|liga|bundesliga|ligue|tv8|canale 5|italia 1|rai ?sport|rai ?(?:1|uno)\b|prime/i;
async function eventsSource(env) {
  let best = null;
  for (const src of (await catalogSources(env)).values()) if (!best || src.devices > best.devices) best = src;
  return best;
}
async function eventsChans(env) {
  const src = await eventsSource(env);
  if (!src) return { src: '', chans: [] };
  const data = await xtreamCatalog(env, src, 'live');
  const cats = new Map((data.cats || []).map((c) => [c.id, c.name]));
  const chans = [];
  for (const x of data.items || []) { const g = cats.get(x.cat) || ''; if (EV_CH_RX.test(x.name) || EV_CH_RX.test(g)) chans.push({ id: x.id, name: x.name, group: g }); if (chans.length >= 800) break; }
  return { src: src.key, chans };
}
/** guida TV (ora e prossimi) di pochi canali della lista, per confermare dove va in onda un evento */
async function eventsEpg(env, ids) {
  const src = await eventsSource(env);
  if (!src) return { epg: {} };
  const out = {};
  await Promise.all(ids.slice(0, 12).map(async (id) => {
    try { const r = await xtreamInfo(env, src, 'live', id); out[id] = (r.epg || []).slice(0, 4).map((p) => ({ title: p.title, start: p.start, end: p.end })); } catch { out[id] = []; }
  }));
  return { epg: out };
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
  return list.filter((p) => p && typeof p === 'object' && !Array.isArray(p)).slice(0, 100).map((p) => ({ // fino a 100 playlist per cliente (voci non valide ignorate: prima davano «Errore interno»)
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
/** confronta nome host e porta effettiva, usando 80/443 se manca la porta esplicita */
function sameServerEndpoint(a, b) {
  const endpoint = (x) => {
    try {
      const u = new URL(/^https?:\/\//i.test(x) ? x : 'http://' + x);
      return { host: u.hostname.toLowerCase(), port: u.port || (u.protocol === 'https:' ? '443' : '80') };
    } catch { return null; }
  };
  const aa = endpoint(a), bb = endpoint(b);
  return !!aa && !!bb && aa.host === bb.host && aa.port === bb.port;
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
const MASS_RC = ['lite', 'posters', 'intro', 'mergeVar', 'u.dnsRot', 'sdns']; // voci del Controllo remoto cambiabili in massa
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
  // assistente IA del cliente (come nella sua scheda): '' = predefinito, 'gm' = Gemini, 'claude' = Claude; «Spento» = permesso ai a false
  if (b.aiProvider !== undefined && b.aiProvider !== null) { if (!['', ...AI_PROVIDERS].includes(b.aiProvider)) throw new HttpErr(400, 'Assistente IA non valido'); o.aiProvider = b.aiProvider; }
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
  const cols = "id, name, code, parent, active, expires, (playlists <> '') AS has_pl, perms, player, vpn, max_streams, rc, app, ai_provider";
  let list;
  if (scope === 'ids') {
    if (!Array.isArray(b.ids) || !b.ids.length) throw new HttpErr(400, 'Scegli almeno un cliente');
    const ids = [...new Set(b.ids.map((x) => str(x, 20)).filter((x) => /^[A-Za-z0-9_-]{6,20}$/.test(x)))].slice(0, MASS_MAX);
    // dispositivi collegati scelti nella tabella (13 novembre 2026): VPN, permessi e visioni sono del cliente principale,
    // quindi si cambia lui e vale anche per loro. Prima restavano fuori e la modifica non toccava niente
    const picked = await devicesByIds(env, ids, cols);
    const up = [...new Set(picked.filter((d) => d.parent).map((d) => d.parent))].filter((p) => !picked.some((d) => d.id === p));
    list = [...picked, ...(up.length ? await devicesByIds(env, up, cols) : [])].filter((d) => !d.parent);
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
    // Portal e Smart valgono come Kairos XC (stesso motore, stesso profilo di partenza): prendono le sue voci, DNS cifrato compreso
    for (const [k, v] of Object.entries(ch.rcSet || {})) { const ak = RC_PARENT[x.app] || x.app, c = rcCatFor(k, ak); if (ak && c && !c[4].includes(ak)) continue; if (v === '') delete rc[k]; else rc[k] = v; }
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
    if (ch.aiProvider !== undefined && ch.aiProvider !== (d.ai_provider || '')) set.ai_provider = ch.aiProvider;
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
    ch.aiProvider !== undefined ? 'assistente IA ' + (AI_NAMES[ch.aiProvider] || 'predefinito') : '',
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
    mode: ['auto', 'main', 'alt', 'rot'].includes(x.mode) ? x.mode : 'auto',
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
const ROT_APPS = ['ult', 'xc'];
const portalModeForApp = (mode, app) => mode === 'rot' && !ROT_APPS.includes(app) ? 'auto' : mode;
async function portalsOf(env, pls, app = '', rot = '') {
  const saved = await dnsList(env), byHost = new Map(saved.map((x) => [hostKey(x.host), x]));
  const byId = new Map(saved.map((x) => [x.id, x]));
  return pls.map((p) => {
    const main = byHost.get(hostKey(hostOf(p)));
    const alts = main ? main.alts.map((id) => byId.get(id)).filter((x) => x && x.id !== main.id) : [];
    if (!alts.length) return p;
    const mode = rot === 'on' && ROT_APPS.includes(app) ? 'rot' : rot === 'off' && main.mode === 'rot' ? 'auto' : main.mode;
    return { ...p, alts: alts.map((x) => x.host), altNames: alts.map((x) => x.name), mainName: main.name, mode: portalModeForApp(mode, app) };
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
/* Disegni dei temi speciali (scena + 4 avatar, immagini realistiche, anteprime): un file per tema in
   public/privato/temi/<id>.json, letto con env.ASSETS solo quando un cliente (o il pannello) lo chiede.
   Prima erano 2,3 MB dentro il codice del Worker e ogni avvio a freddo li caricava tutti (bundle 3 MB → 0,7 MB).
   Non sono raggiungibili dal web: con run_worker_first = true ogni richiesta passa dal Worker, che per /privato/ risponde 404.
   In memoria dell'istanza restano gli ultimi temi letti (gli stessi dati per tutti: niente di personale). */
const themeMem = new Map();
function addonAsset(env, id) {
  if (typeof id !== 'string' || !/^tema-[a-z0-9-]{1,34}$/.test(id) || !ADDON_IDS.has(id)) return Promise.resolve(null);
  let p = themeMem.get(id);
  if (!p) {
    p = env.ASSETS.fetch(new Request('https://kairos.assets/privato/temi/' + id + '.json')).then((r) => (r.ok ? r.json() : null));
    themeMem.set(id, p);
    p.then((v) => { if (!v) themeMem.delete(id); }, () => themeMem.delete(id));
    if (themeMem.size > 8) themeMem.delete(themeMem.keys().next().value);
  }
  return p.catch(() => null);
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
  const assetP = addonAsset(env, str(b.id, 40)); // il file del tema si legge mentre si controlla il dispositivo
  const [d, bad] = await deviceAuth(env, b);
  if (bad) return bad;
  const id = str(b.id, 40), asset = await assetP;
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
  const assetP = addonAsset(env, str(b.id, 40));
  const [d, bad] = await deviceAuth(env, b);
  if (bad) return bad;
  const id = str(b.id, 40), asset = await assetP;
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
// «Illimitati» (11 novembre 2026): dispositivi senza limite per cliente, solo dal titolare (gli agenti restano entro il loro
// tetto «Connessioni per cliente»). È il numero 999: tutti i controlli «usati + 1 > massimo» restano quelli di sempre
const CONN_UNLIM = 999;
/** «3 di 5» per i registri, «3, illimitati» se non c'è limite */
const connTxt = (used, max) => (max >= CONN_UNLIM ? `${used}, illimitati` : `${used} di ${max}`);
/** connessioni massime scelte dal titolare: da 1 a [MAX_CONN] oppure «illimitati» ([CONN_UNLIM], anche come 'unlim') */
const connIn = (v) => {
  if (v === 'unlim' || v === 'illimitati' || Number(v) === CONN_UNLIM) return CONN_UNLIM;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > MAX_CONN) throw new HttpErr(400, `Connessioni massime: scegli un numero da 1 a ${MAX_CONN} oppure «Illimitati»`);
  return n;
};
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
async function wgLocs(env, H) {
  const r = await env.DB.prepare('SELECT v FROM settings WHERE k = ?').bind('wgl').first();
  const read = H && H.unseal ? H.unseal : unseal;
  const v = r ? await read(env, r.v).catch(() => []) : [];
  return Array.isArray(v) ? v.filter((x) => x && typeof x.id === 'string' && typeof x.conf === 'string') : [];
}
async function vpnMark(env, rows, fields, H) {
  return vpnMarkRows(env, rows, fields, H, { wgLocs: (e, helper) => wgLocs(e, helper), orcpRemoteHosts });
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
  // scudo nelle app (13 novembre 2026): quando la VPN la gestisce il fornitore lo scudo si vede sempre, anche spenta o non
  // modificabile dal cliente; al tocco le app dicono «VPN gestita dal fornitore». Vale solo se nel pannello c'è una VPN
  // (configurazione generale, di una località o del cliente): senza, niente scudo. Le versioni vecchie ignorano la voce
  out.shield = !!out.conf || await vpnAny(env);
  return out;
}
/** nel pannello c'è almeno una configurazione VPN (generale o una località)? Non la legge: guarda solo se esiste */
async function vpnAny(env) {
  try {
    if (await env.DB.prepare('SELECT 1 AS x FROM settings WHERE k = ?').bind('wg').first()) return true;
    return (await wgLocs(env)).length > 0;
  } catch { return false; }
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
  ctx.waitUntil(log(env, 'on', `${d.code}${d.model ? ' (' + d.model + ')' : ''} collegato come connessione di ${P.name || P.code} (${connTxt(used + 1, max)})`, ip));
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
/* ---- Notizie del giorno per la Home di KAIROS HEAVY (14 novembre 2026): titoli dal feed RSS pubblico scelto nel pannello ---- */
// doppia fonte (14 novembre 2026): per ogni voce due feed, se il primo non risponde o è vuoto si legge il secondo
const NEWS_ANSA = 'https://www.ansa.it/sito/', NEWS_RAI = 'https://www.rainews.it/rss/';
const NEWS_FEEDS = {
  ansa: [['ANSA', NEWS_ANSA + 'ansait_rss.xml'], ['RaiNews', NEWS_RAI + 'tutti']],
  ultimaora: [['ANSA', NEWS_ANSA + 'notizie/topnews/topnews_rss.xml'], ['RaiNews', NEWS_RAI + 'ultimora']],
  sport: [['ANSA Sport', NEWS_ANSA + 'notizie/sport/sport_rss.xml'], ['RaiNews Sport', NEWS_RAI + 'sport']],
  calcio: [['ANSA Calcio', NEWS_ANSA + 'notizie/sport/calcio/calcio_rss.xml'], ['RaiNews Sport', NEWS_RAI + 'sport']],
  rai: [['RaiNews', NEWS_RAI + 'tutti'], ['ANSA', NEWS_ANSA + 'ansait_rss.xml']],
};
const NEWS_TTL = 10 * 60e3;
const newsMem = {};
const xmlText = (x) => String(x || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' ')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ').trim();
/** titoli di un feed RSS o Atom (solo i titoli delle notizie, non quello del canale) */
function rssTitles(xml) {
  const out = [], seen = new Set();
  const items = String(xml || '').match(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi) || [];
  for (const it of items) {
    const m = it.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const t = m ? xmlText(m[1]).slice(0, 180) : '';
    if (t.length < 8 || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase()); out.push(t);
    if (out.length >= 20) break;
  }
  return out;
}
/** non lancia mai errori: fonte non raggiungibile ⇒ le ultime notizie salvate (fino a 12 ore) oppure elenco vuoto */
async function news(env, ctx, feed) {
  const f = NEWS_FEEDS[feed] ? feed : 'ansa';
  try {
    const mem = newsMem[f];
    if (mem && now() < mem.exp) return mem.body;
    let cached = null;
    try { const r = await env.DB.prepare('SELECT v FROM settings WHERE k = ?').bind('news:' + f).first(); cached = r ? JSON.parse(r.v) : null; } catch {}
    if (cached && Array.isArray(cached.items) && now() - (+cached.updated || 0) < NEWS_TTL) { newsMem[f] = { exp: +cached.updated + NEWS_TTL, body: cached }; return cached; }
    let items = [], src = NEWS_FEEDS[f][0][0], backup = false;
    for (let i = 0; i < NEWS_FEEDS[f].length && !items.length; i++) {
      try {
        const r = await fetch(NEWS_FEEDS[f][i][1], { headers: { Accept: 'application/rss+xml, application/xml, text/xml', 'User-Agent': 'Mozilla/5.0 (compatible; KairosNews/1.0)' }, signal: tmo(6000) });
        if (r.ok) items = rssTitles(await r.text());
        if (items.length) { src = NEWS_FEEDS[f][i][0]; backup = i > 0; }
      } catch {}
    }
    if (items.length) {
      const body = { items, src, feed: f, updated: now(), ...(backup ? { backup: true } : {}) };
      const w = env.DB.prepare('INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind('news:' + f, JSON.stringify(body)).run().catch(() => {});
      ctx && ctx.waitUntil ? ctx.waitUntil(w) : await w;
      newsMem[f] = { exp: now() + NEWS_TTL, body };
      return body;
    }
    const stale = cached && Array.isArray(cached.items) && now() - (+cached.updated || 0) < 12 * 3600e3 ? { ...cached, stale: true } : { items: [], src: NEWS_FEEDS[f][0][0], feed: f, updated: 0 };
    newsMem[f] = { exp: now() + 3 * 60e3, body: stale }; // fonte non raggiungibile: si riprova fra 3 minuti
    return stale;
  } catch { return { items: [], src: '', feed: f, updated: 0 }; }
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
const SDNS_ST = ['on', 'off', 'asking', 'denied', 'error', 'other', 'vpn']; // DNS cifrato come lo dichiara l'app
const PRESENCE_COLS = ['sdns', 'fg_app', 'fg_t', 't', 'hb_t', 'ip', 'ip2', 'ip2_t', 'country', 'city', 'home_country', 'ver', 'ui', 'model', 'state', 'title', 'ch', 'ch_id', 'grp', 'pl', 'prof', 'screen', 'net', 'rssi', 'speed_dl', 'speed_ul', 'speed_ping', 'speed_jit', 'speed_t', 'res', 'fps', 'bitrate', 'buffers', 'dropped', 'engine', 'vpn', 'codec', 'dec', 'stalls_h', 'rec', 'reduced', 'app_cfg', 'rcv', 'bw', 'line', 'dev_class', 'fill', 'ttff', 'stall_ms', 'var', 'fmt', 'chk'];
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
const ERR_PROBLEMS = ['freeze', 'stall', 'error', 'restart', 'crash', 'killed', 'uierr', 'inuse', 'expired', 'unreach', 'down', 'nonet']; // uierr = errore dell'interfaccia (JavaScript) // restart = motore web chiuso da Android; crash = errore interno; killed = app chiusa dal sistema (memoria)
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
  const deadNew = new Set();
  // chiusure dell'app (uccisa dal sistema, errore interno): l'app le rimanda se la consegna non viene confermata, e arrivavano
  // doppie con la stessa ora. La stessa chiusura (stesso tipo, stessa ora) si salva una volta sola
  const DUP = ['killed', 'crash'], dup = new Set();
  if (items.some((x) => x && DUP.includes(x.problem))) { try { for (const e of ((await env.DB.prepare("SELECT t, problem FROM app_errors WHERE device_id = ? AND t > ? AND problem IN ('killed', 'crash')").bind(d.id, t - 86400e3 - 60e3).all()).results) || []) dup.add(e.problem + '|' + e.t); } catch {} }
  for (const x of items) {
    if (!x || typeof x !== 'object') continue;
    const problem = ERR_PROBLEMS.includes(x.problem) ? x.problem : 'error';
    const outcome = ERR_OUTCOMES.includes(x.outcome) ? x.outcome : '';
    // l'orologio del dispositivo può sbagliare: si usa quello dell'app solo se plausibile (ultime 24 h)
    const at = Number.isFinite(+x.t) && +x.t > t - 86400e3 && +x.t <= t + 60e3 ? Math.round(+x.t) : t;
    if (DUP.includes(problem) && Number.isFinite(+x.t)) { const k = problem + '|' + at; if (dup.has(k)) continue; dup.add(k); }
    const ck = x.k === 'live' ? ckClean(x.ck) : ''; // canale (server|flusso): per i «Canali non funzionanti»
    if (ck && outcome === 'non risolto') deadNew.add(ck);
    const rawErr = str(x.err, 120), isp = str(req.cf?.asOrganization || '?', 80);
    const err = problem === 'unreach' ? str(`${rawErr.slice(0, Math.max(0, 120 - isp.length - 3))} · ${isp}`, 120) : rawErr;
    stmts.push(env.DB.prepare('INSERT INTO app_errors (t, device_id, problem, action, outcome, err, title, item_id, kind, engine, codec, dec, res, variant, model, ver, ck) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(at, d.id, problem, nameClean(x.action, 60), outcome, err, nameClean(x.title, 120), str(x.id, 60), x.k === 'live' ? 'live' : x.k ? 'vod' : '', str(x.engine, 12), str(x.codec, 16), x.dec === 'sw' ? 'sw' : x.dec === 'hw' ? 'hw' : '', str(x.res, 12), str(x.var, 12), model, ver, ck));
  }
  if (stmts.length) await env.DB.batch(stmts);
  // canali che non funzionano per nessuno: ricalcolo al più ogni 3 minuti, subito se il canale è nuovo o finora l'aveva un cliente solo
  if (deadNew.size) ctx.waitUntil((async () => { const o = await deadOf(env); await deadRefresh(env, [...deadNew].some((k) => !o.d[k] && !((o.c[k] || [])[1] >= 2)) ? 0 : 3 * 60e3); })().catch(() => {}));
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
async function playerReach(req, env, transports = {}) {
  let b;
  try { b = await readJSON(req, 4096); } catch (e) { return json({ error: e.message }, e.status || 400); }
  const [d, bad] = await deviceAuth(env, b);
  if (bad) return bad.status === 403 ? json({ error: 'Dispositivo non riconosciuto' }, 401) : bad;
  if (await throttled(env, 'reach:' + d.id, 6, 60e3)) return json({ ok: false, error: 'Troppe richieste' }, 429);
  let origin;
  try { origin = cleanHost(b.origin); } catch { return json({ ok: false, reason: 'host' }, 403); }
  const P = await primaryOf(env, d);
  if (!P) return json({ ok: false, reason: 'host' }, 403);
  const saved = await unseal(env, P.playlists).catch(() => []);
  const { pls } = await effOf(env, d, P, Array.isArray(saved) ? saved : []);
  const portalPls = await portalsOf(env, pls);
  const matches = (host) => !!host && sameServerEndpoint(origin, host);
  const allowed = pls.some((p, i) => matches(hostOf(p)) || (portalPls[i]?.alts || []).some(matches));
  if (!allowed) return json({ ok: false, reason: 'host' }, 403);
  const xtream = pls.some((p, i) => p.type === 'xtream' && (matches(hostOf(p)) || (portalPls[i]?.alts || []).some(matches)));
  const url = origin + (xtream ? '/player_api.php' : '/'), controller = new AbortController();
  const workerFetch = transports.fetch || fetch, socketFetch = transports.sockFetch || sockFetch;
  const statusOf = async (response) => {
    if (!response || !Number.isInteger(response.status)) throw new Error('risposta non valida');
    try { if (response.body) void response.body.cancel().catch(() => {}); } catch {}
    return response.status;
  };
  const viaFetch = Promise.resolve().then(() => workerFetch(url, { redirect: 'manual', signal: controller.signal })).then(statusOf);
  const viaSocket = Promise.resolve().then(() => socketFetch(url, { method: 'GET', headers: { 'User-Agent': 'Mozilla/5.0' }, headersOnly: true, signal: controller.signal })).then(statusOf);
  let timer;
  const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve(null), 3500); });
  let status;
  try { status = await Promise.race([Promise.any([viaFetch, viaSocket]).catch(() => null), timeout]); }
  finally { clearTimeout(timer); controller.abort(); }
  return status === null ? json({ ok: false }) : json({ ok: true, status });
}
/** ids: dispositivi da guardare (un agente: i suoi clienti) — il filtro è nella query, così i 2000 errori sono i suoi */
async function adminErrors(req, env, path, url, who, ip, ids = null) {
  const m = req.method;
  if (path === '/app-errors' && m === 'GET') {
    const t = now(), since = t - Math.min(ERR_KEEP_MS, Math.max(3600e3, (+url.searchParams.get('hours') || 168) * 3600e3));
    // solo il numero dei nuovi (pallino del menu, ogni 30 secondi con la pagina chiusa): niente elenco da 2000 righe con i collegamenti
    if (url.searchParams.get('count') === '1') {
      const seen0 = +((await env.DB.prepare("SELECT v FROM settings WHERE k = 'errSeen'").first()) || { v: 0 }).v || 0;
      const c = await env.DB.prepare('SELECT COUNT(*) AS n FROM app_errors e WHERE e.t > ?' + (ids ? ' AND e.device_id IN (SELECT value FROM json_each(?))' : '')).bind(Math.max(since, seen0), ...(ids ? [JSON.stringify([...ids])] : [])).first();
      return json({ newCount: Math.min(2000, +(c && c.n) || 0), countOnly: true });
    }
    const rows = ((await env.DB.prepare('SELECT e.*, d.name, d.code, d.parent, d.owner_id AS oid, p.owner_id AS poid, pr.net, pr.rssi, pr.vpn, pr.speed_dl, pr.line AS pline, (SELECT GROUP_CONCAT(DISTINCT ll.source || \'|\' || ll.dns_name || \'|\' || ll.dns) FROM linked_lines ll WHERE ll.device_id = e.device_id) AS srv, (SELECT COUNT(*) FROM wolf_links wl WHERE wl.device_id = e.device_id) AS wolf FROM app_errors e LEFT JOIN devices d ON d.id = e.device_id LEFT JOIN devices p ON p.id = d.parent LEFT JOIN presence pr ON pr.device_id = e.device_id WHERE e.t > ?' + (ids ? ' AND e.device_id IN (SELECT value FROM json_each(?))' : '') + ' ORDER BY e.t DESC LIMIT 2000').bind(since, ...(ids ? [JSON.stringify([...ids])] : [])).all()).results) || [];
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
/* ====================================================================== */
/* Kairos Pro «intelligente» (autopilota)                                  */
/*  - chk: esito degli auto-controlli silenziosi dell'app, nel battito (campo piccolo, solo voci e valori noti) */
/*  - canali non funzionanti: lo stesso canale (server della lista + numero del flusso) con errori «non risolti» */
/*    su almeno 2 clienti, da almeno 10 minuti, e nessuna visione riuscita dopo l'ultimo errore. L'app lo mette  */
/*    in fondo con «non disponibile»; torna da solo appena qualcuno lo vede di nuovo (o dopo 12 ore senza errori) */
/* ====================================================================== */
const CHK_ENUM = { srv: ['ok', 'down', 'alt', 'auth'], acc: ['ok', 'exp', 'full', 'off'], epg: ['ok', 'old', 'fix', 'none', 'err'], dsk: ['ok', 'low', 'fix'] };
/** campo «chk» del battito → JSON pulito (senza l'istante), undefined se assente o vuoto */
function chkClean(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const o = {};
  for (const [k, vals] of Object.entries(CHK_ENUM)) if (vals.includes(v[k])) o[k] = v[k];
  const int = (k, lo, hi) => { if (typeof v[k] === 'number' && Number.isFinite(v[k])) o[k] = Math.round(num(v[k], lo, hi)); };
  int('exp', -3650, 36500); int('clk', -1e6, 1e6); int('mb', 0, 1e8); int('boot', 0, 6e5); int('slow', 0, 2);
  for (const [k, re, max] of [['con', /^\d{1,4}\/\d{1,4}$/, 9], ['eng', /^[a-z0-9:,]+$/, 40], ['fix', /^[a-z,]+$/, 40], ['cap', /^[a-z0-9,]+$/, 40]]) { const x = str(v[k], max); if (x && re.test(x)) o[k] = x; }
  return Object.keys(o).length ? JSON.stringify(o).slice(0, 380) : undefined;
}
const chkCore = (s) => String(s || '').replace(/,?"at":\d+\}$/, '}').replace(/^\{\}$/, '');
const chkParse = (s) => { try { const o = s ? JSON.parse(s) : null; return o && typeof o === 'object' && !Array.isArray(o) ? o : null; } catch { return null; } };
const DEAD_SPAN_MS = 10 * 60e3, DEAD_WINDOW_MS = 12 * 3600e3, DEAD_MAX = 300;
/** canale «server|flusso»: host[:porta] della lista e numero del flusso (uguale per tutti i clienti dello stesso server) */
const CK_RE = /^[a-z0-9.-]{1,200}(:\d{1,5})?\|\d{1,12}$/;
const ckClean = (v) => { const x = str(v, 220).toLowerCase(); return CK_RE.test(x) ? x : ''; };
const capMap = (o, n) => Object.fromEntries(Object.entries(o).slice(0, n));
async function deadOf(env) {
  let o = {}; try { o = JSON.parse((await cfgRows(env)).chDead || '{}'); } catch {}
  const ob = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
  o = ob(o);
  return { at: +o.at || 0, d: ob(o.d), c: ob(o.c), ok: ob(o.ok) };
}
async function deadSave(env, o) {
  await env.DB.prepare('INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind('chDead', JSON.stringify(o)).run();
  cfgDirty(env);
}
/** ricalcolo dagli errori delle ultime 12 ore (dalle app al più ogni 3 minuti, dal pannello ogni 30 secondi). Non contano
    gli errori del decoder (sono del dispositivo) né i clienti che l'app vede con la linea scaduta, piena, bloccata o
    rifiutata (lì non va niente) */
async function deadRefresh(env, maxAge = 3 * 60e3) {
  const t = now(), o = await deadOf(env);
  if (t - o.at < maxAge) return o;
  const rows = ((await env.DB.prepare(`SELECT e.ck AS ck, MAX(e.title) AS name, COUNT(*) AS n, COUNT(DISTINCT e.device_id) AS devs, MIN(e.t) AS t0, MAX(e.t) AS t1
    FROM app_errors e LEFT JOIN presence p ON p.device_id = e.device_id
    WHERE e.t > ? AND e.ck != '' AND e.kind = 'live' AND e.problem = 'error' AND e.outcome = 'non risolto'
      AND e.err NOT LIKE '%DECOD%' AND e.err NOT LIKE '%CODEC%' AND e.err NOT LIKE 'AUDIO%'
      AND (CASE WHEN p.chk IS NULL OR p.chk = '' OR NOT json_valid(p.chk) THEN 1
                WHEN COALESCE(json_extract(p.chk, '$.acc'), 'ok') = 'ok' AND COALESCE(json_extract(p.chk, '$.srv'), 'ok') IN ('ok', 'alt') THEN 1 ELSE 0 END) = 1
    GROUP BY e.ck ORDER BY t1 DESC LIMIT 600`).bind(t - DEAD_WINDOW_MS).all().catch(() => ({ results: [] }))).results) || [];
  const d = {}, c = {};
  for (const r of rows) {
    const ck = String(r.ck || ''); if (!ck) continue;
    if ((+o.ok[ck] || 0) > +r.t1) continue; // visto bene dopo l'ultimo errore: funziona
    c[ck] = [+r.t1, +r.devs]; // con errori recenti: una visione riuscita va annotata (vedi deadOk); quanti clienti finora
    if (+r.devs >= 2 && +r.t1 - +r.t0 >= DEAD_SPAN_MS) d[ck] = { n: nameClean(r.name, 80), devs: +r.devs, f: +r.n, t0: +r.t0, t1: +r.t1, since: (o.d[ck] && +o.d[ck].since) || t };
  }
  const ok = {}; for (const [k, v] of Object.entries(o.ok)) if (t - +v < 864e5) ok[k] = +v; // visioni riuscite: si ricordano 24 ore
  const out = { at: t, d: capMap(d, DEAD_MAX), c: capMap(c, DEAD_MAX), ok: capMap(ok, DEAD_MAX) };
  await deadSave(env, out);
  return out;
}
/** un cliente sta vedendo bene un canale segnalato (o con errori recenti): torna subito per tutti */
async function deadOk(env, ck, t = now()) {
  const o = await deadOf(env);
  if (!o.d[ck] && !o.c[ck]) return false;
  delete o.d[ck]; delete o.c[ck]; o.ok[ck] = t;
  await deadSave(env, o);
  return true;
}
/** canali non funzionanti dei server di questo cliente (principali e di riserva): «server|flusso», ordinati */
function deadFor(o, pls, portalPls) {
  const hosts = new Set();
  pls.forEach((p, i) => { const h = hostKey(hostOf(p)); if (h) hosts.add(h); for (const a of (portalPls[i] && portalPls[i].alts) || []) hosts.add(hostKey(a)); });
  const l = [];
  if (hosts.size) for (const ck of Object.keys(o.d)) { if (hosts.has(ck.slice(0, ck.lastIndexOf('|')))) l.push(ck); if (l.length >= 200) break; }
  return l.sort();
}
const djb = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
/** «server della lista non raggiungibile» superato: dopo quell'esito il dispositivo ha guardato qualcosa, quindi il server lo
 *  raggiunge (l'app non rifà il controllo durante la visione e il pannello tiene l'esito per 24 ore). Restituisce l'istante
 *  dell'ultima visione, 0 se l'allarme resta. Prudente: serve una visione almeno 3 minuti dopo (il tempo di visione arriva col
 *  battito successivo) e nessun errore di visione rimasto senza soluzione da allora (un lettore fermo sull'errore conta come visione) */
const CHK_NOT_PLAY = ['killed', 'crash', 'restart', 'uierr'];
function chkSeenAfter(c, lastPlay, errs) {
  if (!c || c.srv !== 'down') return 0;
  const from = +c.dn || +c.at || 0, last = +lastPlay || 0;
  if (!from || last <= from + 3 * 60e3) return 0;
  if ((errs || []).some((e) => +e.t > from && !CHK_NOT_PLAY.includes(e.problem) && (e.outcome === 'non risolto' || ['error', 'unreach', 'down', 'nonet'].includes(e.problem)))) return 0;
  return last;
}
/** problemi trovati dagli auto-controlli dell'app (vale l'esito delle ultime 24 ore) */
function chkIssues(p, lastPlay = 0, errs = []) {
  const c = chkParse(p && p.chk), out = [];
  if (!c || (c.at && now() - +c.at > 864e5)) return out;
  const days = (n) => `${n} ${n === 1 ? 'giorno' : 'giorni'}`;
  if (c.acc === 'exp') out.push({ sev: 'bad', key: 'line', what: `Linea scaduta${typeof c.exp === 'number' && c.exp < 0 ? ' da ' + days(-c.exp) : ''} (controllo automatico dell'app)`, fix: 'Rinnova la linea sul pannello IPTV: nell\'app il cliente vede solo un avviso neutro che la linea va rinnovata' });
  else if (c.acc === 'off') out.push({ sev: 'bad', key: 'line', what: 'Linea disattivata o bloccata sul server della lista (controllo automatico dell\'app)', fix: 'Controlla lo stato della linea sul pannello IPTV' });
  else if (c.acc === 'full') out.push({ sev: 'warn', key: 'line', what: `Connessioni della linea piene${c.con ? ' (' + c.con + ')' : ''}`, fix: 'Qualcun altro usa la stessa linea o un dispositivo è rimasto collegato: controlla le connessioni sul pannello IPTV' });
  if (c.srv === 'auth') out.push({ sev: 'bad', key: 'line', what: 'Il server della lista rifiuta utente e password', fix: 'Linea cancellata o password cambiata: correggi la playlist nella scheda del cliente' });
  else if (c.srv === 'down' && !chkSeenAfter(c, lastPlay, errs)) out.push({ sev: 'bad', key: 'srv', what: 'Il dispositivo non raggiunge il server della lista', fix: 'Se succede a più clienti è il server: aggiungi un server di riserva in «Server DNS». Se è solo lui, è la sua rete o il suo operatore' });
  else if (c.srv === 'alt') out.push({ sev: 'warn', key: 'srv', what: 'Server principale della lista non raggiungibile: l\'app usa da sola il server di riserva', fix: 'Controlla il server principale in «Server DNS»' });
  if (typeof c.clk === 'number' && Math.abs(c.clk) >= 10) out.push({ sev: 'warn', key: 'clock', what: `Orologio del dispositivo sbagliato di ${Math.abs(c.clk) >= 120 ? Math.round(Math.abs(c.clk) / 60) + ' ore' : Math.abs(c.clk) + ' minuti'}`, fix: 'Sul dispositivo: Impostazioni › Data e ora › automatiche. Con l\'ora sbagliata la guida TV è sfasata e alcuni server rifiutano il collegamento' });
  if (c.dsk === 'low') out.push({ sev: 'warn', key: 'disk', what: `Poco spazio libero sul dispositivo${typeof c.mb === 'number' ? ' (' + c.mb + ' MB)' : ''}`, fix: 'L\'app ha già pulito da sola le sue cache: se continua, sul dispositivo vanno tolte app o file che non si usano' });
  if (c.epg === 'err') out.push({ sev: 'warn', key: 'epg', what: 'Guida TV vecchia: il riscaricamento automatico non è riuscito', fix: 'Controlla la guida (EPG) della linea o l\'indirizzo EPG del cliente' });
  return out;
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
  const accP = activeAccount(env, d), setP = getSettings(env), unP = unseenCount(env, d, d.parent), cmdP = rcPending(env, ctx, d.id, +d.last_seen || 0);
  for (const x of [accP, setP, unP, cmdP]) x.catch(() => {});
  const old = await env.DB.prepare('SELECT * FROM presence WHERE device_id = ?').bind(d.id).first();
  // vis: l'app dice se è in primo piano (Pro dalla 2.6: true in uso o in visione, false quando va in sfondo); le app vecchie non lo mandano
  const vis = b.vis === true ? true : b.vis === false ? false : null;
  // il limite conta solo i battiti (register e inizio visione aggiornano la presenza ma non contano); il «vado in sfondo» passa sempre
  if (vis !== false && old && t - (+old.hb_t || 0) < HB_MIN_MS) return json({ error: 'Troppi battiti: attendi qualche secondo', wait: Math.ceil((HB_MIN_MS - (t - old.hb_t)) / 1000) }, 429);
  const cf = cfOf(req);
  const app = appFrom(req, b);
  // Kairos Nova durante la visione manda «playing» (non distingue canali e film): conta come visione, non come «nei menu»
  // (prima risultava sempre ferma nei menu: niente titolo in «Online ora», niente conteggio delle visioni contemporanee)
  const state0 = STATES.includes(b.state) ? b.state : b.state === 'playing' ? 'live' : 'idle';
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
    sdns: SDNS_ST.includes(b.sdns) ? b.sdns : '',
    ...rcSnapshot(b), // impostazioni attuali dell'app e configurazione remota applicata
  };
  // autopilota: esito degli auto-controlli dell'app (arriva quando cambia e ogni 15 minuti), con l'istante del server
  // «dn» = da quando il server della lista risulta non raggiungibile: l'app non rifà il controllo durante la visione e rimanda
  // lo stesso esito ogni 15 minuti, quindi «at» da solo non dice quando è stato visto giù la prima volta (vedi chkSeenAfter)
  { const ck0 = chkClean(b.chk); if (ck0) { let dn = ''; if (ck0.includes('"srv":"down"')) { const o0 = chkParse(old && old.chk); dn = ',"dn":' + (o0 && o0.srv === 'down' ? +o0.dn || +o0.at || t : t); } f.chk = ck0.slice(0, -1) + dn + ',"at":' + t + '}'; } }
  if (sp) {
    // l'ora della misura arriva dall'orologio del dispositivo: se è sbagliato (nel futuro o più vecchio di un mese) vale quella
    // già salvata per la stessa misura, altrimenti l'ora del server (prima «Online ora» mostrava «speed test» di anni fa)
    const spDl = num(sp.dl, 0, 1e5), spUl = num(sp.ul, 0, 1e5), spPing = num(sp.ping, 0, 1e5), spT = Math.round(num(sp.t, 0, 1e13));
    const spSame = old && +old.speed_t > 0 && +old.speed_dl === spDl && +old.speed_ul === spUl && +old.speed_ping === spPing;
    Object.assign(f, { speed_dl: spDl, speed_ul: spUl, speed_ping: spPing, speed_jit: num(sp.jitter, 0, 1e5), speed_t: spT > t - 30 * 864e5 && spT <= t + 60e3 ? spT : spSame ? +old.speed_t : t });
  }
  if (st) Object.assign(f, { res: str(st.res, 20), fps: num(st.fps, 0, 1e3), bitrate: num(st.bitrate, 0, 1e9), buffers: Math.round(num(st.buffers, 0, 1e6)), dropped: Math.round(num(st.dropped, 0, 1e9)), engine: str(st.engine, 20), codec: str(st.codec, 16), dec: st.dec === 'sw' ? 'sw' : st.dec === 'hw' ? 'hw' : '', stalls_h: Math.round(num(st.stallsH, 0, 1e4)), rec: nameClean(st.rec, 80), reduced: str(st.reduced, 12),
    // Kairos Adaptive: linea e lettore come li vede l'app (solo se l'app li manda)
    ...(st.bw !== undefined ? { bw: Math.round(num(st.bw, 0, 1e4) * 10) / 10 } : {}), ...(st.line ? { line: ['weak', 'normal', 'good'].includes(st.line) ? st.line : '' } : {}),
    ...(st.dev ? { dev_class: ['D', 'N', 'O'].includes(st.dev) ? st.dev : '' } : {}), ...(st.fill !== undefined ? { fill: Math.round(num(st.fill, 0, 100) * 100) / 100 } : {}),
    ...(st.ttff !== undefined ? { ttff: Math.round(num(st.ttff, 0, 1e6)) } : {}), ...(st.stallMs !== undefined ? { stall_ms: Math.round(num(st.stallMs, 0, 1e8)) } : {}),
    ...(st.var !== undefined ? { var: str(st.var, 16) } : {}), ...(st.fmt !== undefined ? { fmt: str(st.fmt, 8) } : {}) });
  else if (state === 'idle') Object.assign(f, { res: '', fps: 0, bitrate: 0, buffers: 0, dropped: 0, engine: '', codec: '', dec: '', rec: '', reduced: '', fill: 0, ttff: 0, stall_ms: 0, var: '', fmt: '' });
  // linea, banda e classe del dispositivo anche da «net» (Kairos Pro le calcola nell'interfaccia e le manda lì, anche fuori dalla
  // visione): prima il pannello mostrava «linea … · Mbps» solo per le app che le mettono nelle misure del lettore (13 novembre 2026)
  if (!(st && st.line) && ['weak', 'normal', 'good'].includes(net.line)) f.line = net.line;
  if (!(st && st.bw !== undefined) && +net.bw > 0) f.bw = Math.round(num(net.bw, 0, 1e4) * 10) / 10;
  if (!(st && st.dev) && ['D', 'N', 'O'].includes(net.dev)) f.dev_class = net.dev;
  // durante la visione l'app batte ogni 20 s (per «Disconnetti»): se non è cambiato niente di importante la riga
  // si riscrive al massimo una volta al minuto, così le scritture su D1 restano quelle di prima
  // bgOther: non si scrive (la presenza resta dell'app in primo piano); «vado in sfondo» (vis false) e cambio di app in primo piano si scrivono sempre
  const same = bgOther || (old && vis !== false && !(vis === true && old.fg_app !== app) && t - (+old.t || 0) < 55e3 && old.state === state && (old.title || '') === f.title && (old.ch_id || '') === f.ch_id
    && (old.vpn || '') === f.vpn && (old.sdns || '') === f.sdns && (old.screen || '') === f.screen && (old.rcv || '') === (f.rcv || '') && (f.app_cfg === undefined || (old.app_cfg || '') === f.app_cfg) && (old.rec || '') === (f.rec ?? old.rec ?? '') && (old.reduced || '') === (f.reduced ?? old.reduced ?? '') && (+old.stalls_h || 0) === (f.stalls_h ?? +old.stalls_h ?? 0) && (!sp || +old.speed_t === f.speed_t) && (old.ip || '') === (f.ip ?? old.ip ?? '') && (f.chk === undefined || chkCore(old.chk) === chkCore(f.chk)));
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
  // autopilota: un canale che non funzionava visto bene adesso torna subito per tutti; l'app riceve l'elenco dei
  // canali non funzionanti dei suoi server solo quando cambia (dv = impronta di quello che ha già)
  const okCk = state === 'live' && st && (num(st.fps, 0, 1e3) > 0 || str(st.res, 20)) ? ckClean(b.ck) : '';
  const D0 = await deadOf(env);
  if (okCk && (D0.d[okCk] || D0.c[okCk])) ctx.waitUntil(deadOk(env, okCk, t).catch(() => {}));
  // candidati in attesa e ultimo ricalcolo vecchio (nessun errore nuovo da allora): ogni tanto un battito lo rifà
  else if (Object.keys(D0.c).length && t - D0.at > 3 * 60e3 && Math.random() < 0.2) ctx.waitUntil(deadRefresh(env).catch(() => {}));
  const dl = deadFor(D0, pls, portalPls).filter((x) => x !== okCk), dv = dl.length ? djb(dl.join(',')) : '';
  const dead = str(b.dv, 16) !== dv && (dl.length || b.dv) ? { v: dv, l: dl } : null;
  // "Disconnetti" dal pannello: l'ordine resta valido 3 minuti; l'app lo conferma (kickAck) e viene azzerato
  let kick = 0;
  if (+d.kick_t > 0) {
    if (b.kickAck && +b.kickAck === +d.kick_t) await env.DB.prepare('UPDATE devices SET kick_t = 0 WHERE id = ? AND kick_t = ?').bind(d.id, +d.kick_t).run();
    else if (t - +d.kick_t < 180e3) kick = +d.kick_t;
  }
  // mt = 1: l'app rilegge subito lo stato (register) e si ferma. Vale per la manutenzione e anche per l'abbonamento non più attivo
  // (scaduto, disattivato, scollegato): prima il battito non lo diceva e l'app continuava fino alla rilettura dei 20 minuti
  // (Kairos Pro durante la visione anche oltre). Tutte le app con il battito reagiscono già a mt rileggendo lo stato
  const S0 = await setP, mt = !P || maintFor(S0, P) ? 1 : 0;
  // «Invia aggiornamento» dal pannello (o in automatico se l'app è vecchia e il titolare l'ha scelto): l'app controlla subito
  let upd = +d.upd_req || 0;
  if (!upd && S0.health && S0.health.on && S0.health.autoUpd) {
    // ultima versione: di solito già in memoria; se va scaricata il battito non aspetta più di 800 ms
    const apu = appOfVer(f.ver, d.app); if (RC_APPS.includes(apu)) try { const lp = latestFor(env, S0, apu); ctx.waitUntil(lp.catch(() => {})); const L = await Promise.race([lp, new Promise((r) => setTimeout(() => r(null), 800))]); if (L && verBehind(f.ver, L.version)) upd = L.versionCode || 1; } catch {}
  }
  const eff = rcEffective(S0, d, appOfVer(f.ver, d.app), true, /^heavy\b/i.test(String(f.ver || ''))), cmds = await cmdP;
  // permessi spenti; l'assistente IA anche quando lo spegne il pannello (per tutti o dal profilo dell'app): l'app si riallinea subito
  const ph = P ? permsJson({ ...permsParse(P.perms), ...(aiEngineOf(S0, P, d, appOfVer(f.ver, d.app)) === 'off' ? { ai: false } : {}) }) : '';
  return json({ ok: true, mt, ...(upd ? { upd } : {}), rc: JSON.stringify(eff.rc), rcv: eff.rcv, ...(cmds.length ? { cmds } : {}), unseen: await unP, ts: t, vm, ph, ms: P ? +P.max_streams || 0 : 0, pv, pm: P ? (C.pl_mode === 'split' ? 'split' : 'merge') + '|' + (pls.some((p) => p.id === C.pl_default) ? C.pl_default : '') + '|' + JSON.stringify(playerParse(C.player)) : '', adg: P ? P.addons || '' : '', af: await acctFp(P), ...(sat.length ? { sat } : {}), ...(kick ? { kick } : {}), ...(dead ? { dead } : {}) });
}
/** «Controllo remoto» dell'agente (13 novembre 2026): solo le voci che il titolare gli ha dato (P.rcKeys), solo sui suoi
    clienti (e dei sotto-agenti se li vede). Cambia le voci «solo per questo cliente» del dispositivo: le altre voci
    impostate dal titolare sul dispositivo restano com'erano; i profili delle app e i comandi restano del titolare. */
async function agentRctl(req, env, path, m, P, ctree, who, ip) {
  const keys = new Set(P.rcKeys || []);
  if (!keys.size) throw new HttpErr(403, 'Il titolare non ti ha dato voci del controllo remoto');
  const okKey = (k) => keys.has(k.endsWith(':allow') ? k.slice(0, -6) : k);
  const own = [];
  for (let i = 0; i < ctree.length; i += 45) {
    const part = ctree.slice(i, i + 45), q = part.map(() => '?').join(',');
    own.push(...(((await env.DB.prepare(`SELECT id, name, code, app, rc FROM devices WHERE owner_id IN (${q}) OR parent IN (SELECT id FROM devices WHERE owner_id IN (${q}))`).bind(...part, ...part).all()).results) || []));
  }
  const byId = new Map(own.map((d) => [d.id, d]));
  const mineOnly = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => okKey(k)));
  /** voci del dispositivo con quelle concesse sostituite da [src] (valore vuoto = tolta) */
  const merged = (d, src, partial) => {
    const cur = rcDevOf(d);
    if (!partial) for (const k of Object.keys(cur)) if (okKey(k)) delete cur[k];
    for (const [k, v] of Object.entries(src && typeof src === 'object' && !Array.isArray(src) ? src : {})) {
      if (!okKey(k)) continue;
      const base = k.endsWith(':allow') ? k.slice(0, -6) : k;
      delete cur[base]; delete cur[base + ':allow'];
      if (v !== '' && v !== null && v !== undefined) cur[k] = v;
    }
    return rcNoProf(rcClean(cur, d.app));
  };
  if (path === '/rctl' && m === 'GET') {
    const ids = [...byId.keys()], devs = {}, over = {};
    for (let i = 0; i < ids.length; i += 90) {
      const part = ids.slice(i, i + 90);
      for (const r of ((await env.DB.prepare(`SELECT device_id, app_cfg, rcv, ver, t FROM presence WHERE device_id IN (${part.map(() => '?').join(',')})`).bind(...part).all()).results) || []) {
        let cfg = null; try { cfg = r.app_cfg ? JSON.parse(r.app_cfg) : null; } catch {}
        devs[r.device_id] = { cfg, rcv: r.rcv || '', ver: r.ver || '', t: +r.t };
      }
    }
    for (const d of own) { const o = mineOnly(rcDevOf(d)); if (Object.keys(o).length) over[d.id] = o; }
    return json({ agent: true, apps: {}, cat: RC_CAT.filter((c) => keys.has(c[0])), cmds: [], appNames: APP_NAME, linked: RC_LINKED, devs, over, last: {}, pending: {}, adultWords: ADULT_HOME_WORDS, adultApps: [...ADULT_MERGE_APPS] });
  }
  const pd = path.match(/^\/rctl\/device\/([A-Za-z0-9_-]{6,20})$/);
  if (pd && m === 'PUT') {
    const d = byId.get(pd[1]); if (!d) throw new HttpErr(404, 'Cliente non trovato');
    const b = await readJSON(req, 8192), rc = merged(d, b.rc, false);
    await env.DB.prepare('UPDATE devices SET rc = ? WHERE id = ?').bind(Object.keys(rc).length ? JSON.stringify(rc) : '', d.id).run();
    await log(env, 'edit', `${who}: controllo remoto — ${d.name || d.code}: voci aggiornate`, ip);
    return json({ ok: true, rc: mineOnly(rc) });
  }
  // stessa voce a tutti i suoi clienti (valore vuoto = la toglie): chi ha un'app che non la capisce resta com'è
  if (path === '/rctl/mine' && m === 'PUT') {
    const b = await readJSON(req, 8192), src = b.rc && typeof b.rc === 'object' && !Array.isArray(b.rc) ? b.rc : {};
    const ks = Object.keys(src).filter(okKey);
    if (!ks.length) throw new HttpErr(400, 'Niente da salvare');
    const ups = [];
    for (const d of own) {
      let rc; try { rc = merged(d, Object.fromEntries(ks.map((k) => [k, src[k]])), true); } catch { continue; }
      const nv = Object.keys(rc).length ? JSON.stringify(rc) : '';
      if (nv !== (d.rc || '')) ups.push(env.DB.prepare('UPDATE devices SET rc = ? WHERE id = ?').bind(nv, d.id));
    }
    for (let i = 0; i < ups.length; i += 50) await env.DB.batch(ups.slice(i, i + 50));
    await log(env, 'edit', `${who}: controllo remoto — ${ks.map((k) => (rcCatFor(k.replace(/:allow$/, '')) || [k, k])[1]).join(', ')} per tutti i suoi clienti (${ups.length})`, ip);
    return json({ ok: true, updated: ups.length });
  }
  const pc = path.match(/^\/rctl\/cmds\/([A-Za-z0-9_-]{6,20})$/);
  if (pc && m === 'GET') { if (!byId.has(pc[1])) throw new HttpErr(404, 'Cliente non trovato'); return json({ items: [] }); }
  throw new HttpErr(403, 'I comandi e i profili delle app restano del titolare');
}
/* ---------------- dati del cliente e salute delle app ---------------- */
const verNum = (v) => { const m = String(v || '').match(/(\d{1,3})\.(\d{1,3})(?:\.(\d{1,3}))?/); return m ? +m[1] * 1e6 + +m[2] * 1e3 + +(m[3] || 0) : 0; };
const verBehind = (cur, latest) => { const a = verNum(cur), b = verNum(latest); return !!(a && b && a < b); };
/** ultima versione pubblicata dell'app del cliente: tv = Kairos Pro, ktv = Kairos TV, lite, xc */
async function latestFor(env, s, app) {
  if (app === 'lite') { const f = await liteFeed(s, env); return f && f.version ? { version: f.version, versionCode: semverCode(f.version) } : null; }
  if (app === 'prem') { const f = await premFeed(env); return f ? { version: f.version, versionCode: f.versionCode } : null; }
  if (app === 'ktv') { const f = await ktvFeed(s, env); return f ? { version: f.version, versionCode: f.versionCode } : null; }
  if (app === 'xc') { const f = await xcFeed(s, env); return f ? { version: f.version, versionCode: f.versionCode } : null; }
  if (app === 'ult') { const f = await ultFeed(s, env); return f ? { version: f.version, versionCode: f.versionCode } : null; }
  if (app === 'plus') { const f = await plusFeed(s, env); return f ? { version: f.version, versionCode: f.versionCode } : null; }
  if (app === 'nova') { const f = await novaFeed(env); return f ? { version: f.version, versionCode: f.versionCode } : null; }
  if (app !== 'tv') return null; // app non riconosciuta (es. KAIROS per Fire TV Vega OS): nessun confronto con gli APK
  const a = await latestApk(env, s); return a && a.version ? { version: a.version, versionCode: a.versionCode } : null;
}
const APP_NAME = { tv: 'Kairos Pro', ktv: 'Kairos TV', prem: 'Kairos Premium', lite: 'Kairos Lite', xc: 'Kairos XC', ult: 'KAIROS Ultimate', plus: 'Kairos Plus', nova: 'Kairos Nova', portal: 'Kairos Portal', smart: 'Kairos Smart', heavy: 'KAIROS HEAVY', vega: 'Kairos per Fire TV (Vega OS)' };
/* ---------------- «🔒 Repo privati» (10 novembre 2026, solo titolare) ----------------
   Per ogni app: quanti clienti (visti negli ultimi 30 giorni) hanno già l'ultima versione e chi manca. Quando un'app è
   aggiornata da tutti, il suo repository GitHub si può rendere privato: i download passano da store-k.download con il token.
   Il Kairos Store sta nello stesso repository della Pro (kairos-store): la sua riga conta gli store visti negli ultimi 30
   giorni con la versione che hanno mandato all'apertura (store_seen; «web» = browser, non conta). Gli store più vecchi della
   1.0.132 si aggiornano solo dalle release di GitHub: kairos-store si può chiudere quando sono pronte tutte e due le righe. */
const REPO_OF = [['tv', 'kairos-store', 'Kairos Pro'], ['ktv', 'kairos-tv', 'Kairos TV'], ['prem', 'kairos-premium', 'Kairos Premium'], ['lite', 'kairos-lite', 'Kairos Lite'], ['xc', 'kairos-xc', 'Kairos XC'], ['ult', 'kairos-ultimate', 'KAIROS Ultimate'], ['plus', 'kairos-flutter', 'Kairos Plus'], ['nova', 'Lairos-nova', 'Kairos Nova']];
async function repoReady(env) {
  const s = await getSettings(env), t = now(), DAYS = 30, L = {}, since = t - DAYS * 864e5;
  const [rowsR, storeR, storeL] = await Promise.all([
    env.DB.prepare('SELECT p.device_id AS id, p.ver, p.t, d.name, d.code, d.app FROM presence p JOIN devices d ON d.id = p.device_id WHERE p.t > ?').bind(since).all(),
    env.DB.prepare("SELECT device, country, version, last_seen FROM store_seen WHERE last_seen > ? AND version <> '' AND version <> 'web' ORDER BY last_seen DESC LIMIT 5000").bind(since).all().catch(() => null),
    dlFeed(env, 'store').catch(() => null),
    ...REPO_OF.map(async ([a]) => { L[a] = await latestFor(env, s, a).catch(() => null); }),
  ]);
  const by = Object.fromEntries(REPO_OF.map(([a]) => [a, { total: 0, ok: 0, old: [] }]));
  for (const r of (rowsR && rowsR.results) || []) {
    const b = by[appOfVer(r.ver, r.app)]; if (!b) continue;
    b.total++;
    const lat = L[appOfVer(r.ver, r.app)];
    if (lat && lat.version && !verBehind(r.ver, lat.version)) b.ok++;
    else if (b.old.length < 200) b.old.push({ id: r.id, name: str(r.name || r.code, 60), code: r.code, ver: str(r.ver, 30), seen: +r.t || 0 });
  }
  const apps = REPO_OF.map(([a, repo, name]) => { const b = by[a]; b.old.sort((x, y) => y.seen - x.seen); return { app: a, repo, name, latest: (L[a] && L[a].version) || '', total: b.total, ok: b.ok, old: b.old }; });
  // Kairos Store: gli store (non i clienti) con la loro versione; nessuna scheda da aprire, solo modello e paese
  const sl = storeL && storeL.version ? String(storeL.version) : '', st = { total: 0, ok: 0, old: [] };
  for (const r of (storeR && storeR.results) || []) {
    st.total++;
    if (sl && !verBehind(r.version, sl)) st.ok++;
    else if (st.old.length < 200) st.old.push({ id: '', name: str(r.device, 60) || 'Store', code: str(r.country, 4), ver: str(r.version, 30), seen: +r.last_seen || 0 });
  }
  apps.splice(apps.findIndex((x) => x.app === 'tv') + 1, 0, { app: 'store', repo: 'kairos-store', name: 'Kairos Store', latest: sl, total: st.total, ok: st.ok, old: st.old, store: true });
  return { days: DAYS, token: !!ghTok(env), t, apps };
}

/* ====================================================================== */
/* Controllo remoto delle app                                              */
/*  - profilo per app (impostazioni → rcApp[app]) + impostazioni imposte a un singolo cliente (devices.rc)     */
/*  - l'app riceve la configurazione effettiva nel battito (rc) e nell'apertura (register): ogni voce imposta  */
/*    vince su quella scelta nell'app e lì risulta «scelta dal fornitore»                                        */
/*  - comandi (ricarica, svuota cache, apri impostazioni, aggiorna liste, speed test, chiudi): coda per          */
/*    dispositivo, consegnati nel battito (cmds) e confermati dall'app (POST /api/player/cmd)                    */
/*  - l'app riporta le sue impostazioni attuali (cfg) e la versione della configurazione applicata (rcv)        */
/* ====================================================================== */
const RC_APPS = ['tv', 'ktv', 'prem', 'lite', 'xc', 'ult', 'plus', 'nova', 'portal', 'smart', 'heavy'];
const RC_PARENT = { portal: 'xc', smart: 'xc' }; // Portal e Smart ereditano il profilo di Kairos XC (stesso motore)
/** app collegate al pannello con codice (battito e comandi); Kairos Nova può anche restare libera: allora legge solo la politica degli aggiornamenti */
const RC_LINKED = ['tv', 'ktv', 'prem', 'lite', 'xc', 'ult', 'plus', 'nova', 'portal', 'smart'];
// catalogo: [chiave, nome, tipo, valori [[valore, etichetta]], app che la capiscono, spiegazione, etichetta «libera» (opz.), sezione]
// Ogni voce corrisponde a un'impostazione che il cliente trova nell'app: imposta dal pannello, lì risulta «scelta dal fornitore».
const KPRO = ['tv'], KPRO_XC = ['tv', 'xc', 'ult'], KALL_LITE = ['tv', 'ktv', 'prem', 'lite', 'xc', 'ult', 'plus'];
const YN = [[true, 'Sì'], [false, 'No']];
const ENG_OPTS = [['auto', 'Automatico (ExoPlayer, passa a VLC se serve)'], ['exo', 'ExoPlayer'], ['vlc', 'VLC']];
const RC_CAT = [
  /* ---- Generale ---- */
  ['lite', 'Modalità leggera', 'sel', [['auto', 'Automatica'], ['on', 'Sempre attiva'], ['max', 'Leggerissima'], ['off', 'Spenta']], KALL_LITE, 'Niente animazioni ed effetti, immagini e memoria ridotte: per chiavette e TV vecchie. «Leggerissima» toglie anche le transizioni e svuota le cache: la scelta giusta per Fire Stick con poca memoria', '', 'Generale'],
  ['privacy', 'Finestra «Privacy e condizioni»', 'sel', [['show', 'Mostrala al primo avvio'], ['skip', 'Non mostrarla']], ['tv', 'ktv', 'prem', 'lite', 'xc', 'ult', 'plus'], 'Al primo avvio l\'app mostra al cliente la finestra «Privacy e condizioni» da accettare. Con «Non mostrarla» il cliente entra subito, senza quella finestra: comodo quando l\'app la installa l\'agente a casa del cliente.', '', 'Generale'],
  ['o.startScr', 'Schermata iniziale', 'sel', [['home', 'Home'], ['movies', 'Film'], ['series', 'Serie'], ['live', 'In Diretta'], ['guide', 'Guida TV'], ['lastch', 'Ultimo canale guardato']], [...KPRO, 'ult'], 'La pagina che il cliente trova quando apre l\'app. «In Diretta» o «Ultimo canale guardato» sono comode per chi usa l\'app come una TV normale; «Home» mostra tutto. Il cliente non deve fare niente: la trova già così.', '', 'Generale'],
  ['o.orient', 'Layout su telefoni e tablet', 'sel', [['auto', 'Automatico'], ['land', 'Sempre orizzontale']], KPRO, 'Solo su telefoni e tablet: «Sempre orizzontale» tiene l\'app in orizzontale anche girando il dispositivo; «Automatico» la gira insieme allo schermo. Sulle TV e sulle chiavette non cambia nulla.', '', 'Generale'],
  ['tvmode', 'Modalità TV', 'sel', [['on', 'Attiva: interfaccia per telecomando'], ['off', 'Spenta']], ['nova'], '«Attiva»: Kairos Nova usa l\'interfaccia per il telecomando, con riquadri grandi, frecce e OK. «Spenta»: interfaccia a tocco, per telefoni e tablet. Sulle TV e sulle chiavette lasciala attiva, altrimenti il cliente non riesce a muoversi.', '', 'Generale'],
  // solo nel profilo dell'app (c[8] = 'prof'): per il singolo cliente l'IA si sceglie nella sua scheda, che vince sul profilo
  // Kairos XC: su main c'è la 3.4.0, senza assistente né funzioni intelligenti (sono nel ramo xc-intelligente, non pubblicato):
  // le due voci tornano con 'xc' quando quella versione esce, prima il pannello offrirebbe impostazioni che l'app ignora
  ['ai', 'Assistente IA', 'sel', [['gm', 'Gemini'], ['claude', 'Claude'], ['off', 'Spento']], KPRO, 'Ricerca con le frasi (anche a voce), «Cosa guardo stasera?» e domande sui titoli. Vale per i clienti che nella loro scheda hanno «predefinito»; le domande al giorno restano quelle della pagina Assistente IA. Spento: le funzioni IA spariscono dall\'app', 'Predefinito (pagina Assistente IA)', 'Generale', 'prof'],
  // Kairos XC «intelligente» (ramo xc-intelligente): autopilota, canali non funzionanti in fondo, promemoria, «Per te», «Stasera»,
  // assistente e ricerca a voce. Nessuna app per ora (vedi sopra): con la versione pubblicata si rimette ['xc']
  ['smart', 'Funzioni intelligenti', 'sel', [['on', 'Accese'], ['off', 'Spente']], [], 'Kairos XC si adatta da sola (decoder del dispositivo, lettore imparato), si controlla da sola nei menu (server, linea, guida, spazio, orologio: esito in Salute e Dati), propone promemoria, «Per te» e «Stasera», assistente IA e ricerca a voce. Leggera anche sulle chiavette da 1 GB: niente lavoro all\'avvio né durante la visione', 'Spente (di serie)', 'Generale'],
  /* ---- Home: tipo «txt» = elenco di nomi (o parti di nome) di categorie separati da virgola ---- */
  ['home.top', 'Categorie in primo piano', 'txt', [], RC_APPS, 'Nomi (anche solo una parte) delle categorie da mettere per prime, separati da virgola e nell\'ordine che vuoi. Es.: Sport, Prime Video, Netflix. Valgono per la Home e per gli elenchi di Film, Serie e canali', '', 'Home'],
  ['home.hide', 'Categorie nascoste dalla Home', 'txt', [], RC_APPS, 'Nomi (anche solo una parte) delle categorie da non mostrare nella Home, separati da virgola. Es.: adult, xxx, 18+. Negli elenchi di Film, Serie e canali restano in fondo (con il PIN se bloccate)', '', 'Home'],
  ['adult', 'Contenuti per adulti nella Home', 'sel', [['off', 'Nascosti'], ['on', 'Visibili']], RC_APPS, 'Nascosti: in nessuna riga della Home (categorie, titolo in evidenza, novità, tendenze, consigliati, continua a guardare, preferiti, canali). L\'app li riconosce da sola (xxx, adult, +18, 18+, porn, hentai, OnlyFans…) oltre alle «Categorie nascoste dalla Home»; negli elenchi restano in fondo, raggiungibili. «Decide il cliente»: nella Kairos Pro la scelta delle sue Impostazioni (di base nascosti), nelle altre app nascosti', '', 'Home'],
  /* ---- Aggiornamenti ---- */
  ['bgupd', 'Aggiornamenti in background', 'sel', [['on', 'Sì: scarica da sola, poi chiede solo «Installa»'], ['off', 'No: scarica solo quando il cliente accetta']], RC_APPS, 'Con «Sì» l\'app scarica e verifica da sola la versione nuova (su Wi-Fi o cavo, mai durante la visione): al cliente resta un solo tasto', '', 'Aggiornamenti'],
  ['force', 'Aggiornamento obbligatorio', 'sel', [['off', 'No: il cliente può rimandare'], ['7d', 'Dopo 7 giorni dal primo avviso'], ['3d', 'Dopo 3 giorni dal primo avviso'], ['now', 'Subito']], RC_APPS, 'Scaduto il termine l\'app si apre solo dopo aver installato la versione nuova. Blocca soltanto se l\'APK è già scaricato e verificato sul dispositivo, mai per un problema di rete', 'No: il cliente può rimandare', 'Aggiornamenti'],
  /* ---- Aspetto ---- */
  ['theme', 'Colore dell\'interfaccia', 'sel', [['cinema', 'Cinema (rosso)'], ['aurora', 'Aurora'], ['plasma', 'Plasma'], ['matrix', 'Matrix'], ['solar', 'Solare'], ['ice', 'Ghiaccio'], ['oro', 'Oro'], ['smeraldo', 'Smeraldo'], ['oceano', 'Oceano'], ['tramonto', 'Tramonto'], ['viola', 'Viola'], ['rosa', 'Rosa']], KPRO, 'Il colore di pulsanti, menu ed evidenziazioni di Kairos Pro. È solo estetica: non cambia canali, qualità né velocità. I temi speciali presi dallo Store restano quelli scelti dal cliente.', '', 'Aspetto'],
  ['o.textSize', 'Dimensione testi', 'sel', [['s', 'Piccola'], ['m', 'Media'], ['l', 'Grande'], ['xl', 'Molto grande']], [...KPRO, 'ult'], 'Quanto sono grandi le scritte dell\'app. «Grande» o «Molto grande» per chi guarda da lontano o vede poco; «Piccola» fa stare più canali e titoli nello schermo.', '', 'Aspetto'],
  ['o.sfx', 'Effetti sonori', 'sel', [['classic', 'Classici'], ['soft', 'Morbidi'], ['futur', 'Futuristici'], ['retro', 'Retrò'], ['off', 'Disattivati']], KPRO, 'I suoni dei tasti e dei menu. «Disattivati» per i clienti che li trovano fastidiosi; le altre voci cambiano solo il tipo di suono. Non toccano l\'audio dei canali e dei film.', '', 'Aspetto'],
  ['logos', 'Loghi dei canali automatici', 'sel', [['on', 'Sì'], ['off', 'No']], KPRO, 'Con «Sì» l\'app cerca da sola in rete il logo dei canali che nella lista non ce l\'hanno. Con «No» non li cerca: un po\' meno rete e memoria, utile sulle chiavette deboli; quei canali restano con il solo nome.', '', 'Aspetto'],
  ['posters', 'Locandine', 'sel', [['auto', 'Automatiche (più leggere sulle chiavette da 1 GB)'], ['hi', 'Sempre nitide']], [...KPRO, 'ult'], 'Automatiche: sulle chiavette da 1 GB (Fire TV Stick/Lite) locandine e sfondi si scaricano più piccoli, un po\' meno nitidi ma con meno memoria. «Sempre nitide»: come sugli altri dispositivi, usa più memoria', '', 'Aspetto'],
  ['intro', 'Animazione d\'avvio', 'sel', [['auto', 'Automatica'], ['simple', 'Semplice'], ['off', 'Spenta']], [...KPRO, 'ult'], 'Automatica: completa sui dispositivi forti, senza gli effetti di sfondo pesanti su quelli deboli. Semplice: logo, scritta e barra, senza effetti di sfondo. Spenta: logo fermo e barra. Vale dall\'apertura successiva', '', 'Aspetto'],
  // riquadro «FHD · 1080p · 50 fps» del lettore (contratto comune: "full" | "noq" | "off"; vuoto/assente = completo).
  // Gruppo «Aspetto» e non «Lettore»: è una scelta del titolare, non una voce che il cliente può scegliere (niente «:allow»).
  ['qbox', 'Riquadro qualità nel lettore', 'sel', [['full', 'Completo: «FHD · 1080p · 50 fps»'], ['noq', 'Senza sigla: «1080p · 50 fps»'], ['off', 'Nascosto']], RC_APPS, 'Il riquadro in alto a destra quando il cliente apre un canale in diretta, cambia risoluzione o apre la barra informazioni. «Senza sigla» toglie HD, FHD, 4K e SD e lascia risoluzione e FPS. Il permesso «Vedere risoluzione e FPS» del singolo cliente vale comunque', 'Non imposto (completo)', 'Aspetto'],
  // Portal e Smart (motore di Kairos XC, ma Home propria con i temi Skin): il pannello sceglie tema, effetti e scritte neon
  ['theme', 'Tema', 'sel', [['nero', 'Nero'], ['neon', 'Neon'], ['oro', 'Oro'], ['smeraldo', 'Smeraldo'], ['rubino', 'Rubino'], ['artico', 'Artico'], ['tramonto', 'Tramonto'], ['terminale', 'Terminale'], ['classico', 'Classico']], ['portal', 'smart'], 'Il colore e l\'aspetto della Home di Kairos STB e Kairos Smarters. È solo estetica. La scelta fatta qui vince su quella del cliente: serve per dare a tutti lo stesso aspetto, per esempio con i colori del tuo marchio.', '', 'Aspetto'],
  ['fx', 'Effetti e animazioni', 'sel', [['full', 'Completi'], ['soft', 'Ridotti'], ['off', 'Spenti']], ['portal', 'smart'], 'Quante animazioni mostra la Home. «Completi» è la più bella; «Ridotti» o «Spenti» la rendono più leggera e veloce: sceglili per le chiavette da 1 GB o quando il cliente vede scatti nei menu.', '', 'Aspetto'],
  ['neon', 'Scritte neon', 'sel', [['on', 'Accese'], ['off', 'Spente']], ['portal', 'smart'], 'Le scritte luminose della Home. Si vedono solo con gli effetti «Completi». «Spente»: Home più sobria e un filo più leggera.', '', 'Aspetto'],
  /* ---- Lettore ---- */
  ['o.engLive', 'Lettore TV in diretta', 'sel', ENG_OPTS, KPRO_XC, 'Il motore che riproduce i canali in diretta. «Automatico» va bene quasi sempre: usa ExoPlayer e passa a VLC se un canale non parte. Scegli «VLC» se al cliente manca l\'audio o molti canali restano neri. Se nella scheda del cliente hai già scelto il lettore, vale quello.', '', 'Lettore'],
  ['o.engMovie', 'Lettore film', 'sel', ENG_OPTS, KPRO_XC, 'Il motore che riproduce i film. Lascia «Automatico»; passa a «VLC» solo se al cliente i film non partono o sono senza audio (capita con alcuni formati audio che ExoPlayer non legge).', '', 'Lettore'],
  ['o.engSeries', 'Lettore serie TV', 'sel', ENG_OPTS, KPRO_XC, 'Il motore che riproduce le serie TV. Lascia «Automatico»; passa a «VLC» solo se al cliente le puntate non partono o sono senza audio.', '', 'Lettore'],
  ['o.hw', 'Decodifica', 'sel', [['auto', 'Automatica'], ['on', 'Hardware'], ['off', 'Software']], KPRO_XC, 'Chi trasforma il video in immagini: il chip del dispositivo («Hardware», più fluido e senza scaldare) o l\'app («Software», più pesante). Lascia «Automatica»; metti «Software» solo se il cliente vede immagini verdi, a quadretti o a scatti.', '', 'Lettore'],
  ['o.adaptQ', 'Qualità adattiva automatica', 'sel', YN, KPRO_XC, 'Con «Sì», se la linea del cliente non regge, l\'app passa da sola a una versione più leggera del canale (per esempio da FHD a HD) invece di fermarsi a caricare. Con «No» resta sulla versione scelta: più qualità, ma più blocchi con le linee lente.', '', 'Lettore'],
  ['o.drainQ', 'Discesa anticipata della qualità', 'sel', YN, KPRO_XC, 'Con «Sì» l\'app abbassa la qualità un attimo prima che il video si blocchi, quando vede la riserva di video scendere: meno rotelline, ma a volte la qualità cala anche per un vuoto breve del Wi-Fi. Con «No» scende solo dopo un blocco vero.', '', 'Lettore'],
  ['p.quality', 'Qualità video', 'sel', [['auto', 'Automatica'], ['max', 'Massima'], ['1080', '1080p'], ['720', '720p'], ['480', '480p']], KPRO_XC, 'La qualità più alta che l\'app può usare. «Automatica» sceglie in base alla linea e al dispositivo. «Massima» non scende mai per colpa della linea. 1080p, 720p e 480p fanno da tetto: utili per chi ha poca banda o i giga contati.', '', 'Lettore'],
  ['p.buffer', 'Buffer di rete', 'sel', [['fast', 'Piccolo (veloce)'], ['balanced', 'Normale'], ['stable', 'Grande (stabile)']], ['tv', 'nova', 'xc', 'ult'], 'Quanta riserva di video l\'app mette da parte prima di mostrarlo. «Piccolo» fa partire il canale prima ma regge meno i cali; «Grande» parte un po\' dopo ma si blocca meno: usalo con Wi-Fi debole o server lenti.', '', 'Lettore'],
  ['p.aspect', 'Formato immagine', 'sel', [['fit', 'Adatta'], ['fill', 'Riempi'], ['zoom', 'Zoom']], [...KPRO, 'ult'], 'Come l\'immagine occupa lo schermo. «Adatta» la mostra tutta (possono restare bande nere); «Riempi» toglie le bande allargandola un po\'; «Zoom» la ingrandisce e taglia i bordi.', '', 'Lettore'],
  ['o.autoNext', 'Episodio successivo automatico', 'sel', YN, [...KPRO, 'ult'], 'Con «Sì», finita una puntata parte da sola la successiva. Con «No» il cliente la sceglie a mano: meglio per chi si addormenta davanti alla TV.', '', 'Lettore'],
  ['o.introAuto', 'Salta l\'intro delle serie', 'sel', YN, KPRO, 'Con «Sì» l\'app salta da sola la sigla iniziale delle serie, quando la riconosce. Con «No» il cliente la guarda o la salta a mano con il pulsante.', '', 'Lettore'],
  ['o.resInd', 'Indicatore risoluzione', 'sel', YN, [...KPRO, 'ult'], 'È l\'interruttore del cliente nelle Impostazioni della Pro. Per decidere tu in tutte le app usa «Riquadro qualità nel lettore» (Aspetto): con «Nascosto» vince quello', '', 'Lettore'],
  ['o.subSize', 'Dimensione sottotitoli', 'sel', [['small', 'Piccola'], ['medium', 'Media'], ['large', 'Grande'], ['xl', 'Molto grande']], [...KPRO, 'ult'], 'Quanto sono grandi i sottotitoli di film e serie. «Grande» o «Molto grande» per chi guarda da lontano.', '', 'Lettore'],
  /* ---- TV in diretta e guida TV ---- */
  ['preview', 'Anteprima nella lista canali', 'sel', [['click', 'Al primo OK'], ['off', 'Spenta']], ['ktv', 'prem', 'lite', 'xc', 'ult', 'plus'], '«Al primo OK»: il canale si vede in un riquadro accanto alla lista e solo al secondo OK va a schermo intero, comodo per sfogliare. «Spenta»: parte subito a schermo intero, con meno lavoro per il dispositivo (consigliata sulle chiavette deboli).', '', 'TV in diretta e guida TV'],
  ['o.liveFmt', 'Formato TV in diretta', 'sel', [['ts', 'Veloce (TS)'], ['hls', 'HLS']], ['tv', 'plus'], 'Il formato con cui l\'app chiede i canali al server. «Veloce (TS)» è quello consigliato: il canale parte prima. «HLS» solo se il fornitore lo richiede o se con TS i canali non partono.', '', 'TV in diretta e guida TV'],
  ['mergeVar', 'Versioni dello stesso canale in una voce sola', 'sel', [['off', 'No: ogni versione ha la sua voce'], ['on', 'Sì: una voce, con la versione giusta per la linea']], [...KPRO, 'ult'], 'Con «Sì» le versioni 4K, FHD, HD e SD dello stesso canale diventano una sola voce nelle liste e nello zapping: l\'app sceglie da sola quella adatta alla linea e al dispositivo. Le versioni si riconoscono dal nome del canale: se nella lista due canali diversi hanno nomi quasi uguali potrebbero finire insieme, per questo di serie è spenta', '', 'TV in diretta e guida TV'],
  ['o.autoRem', 'Promemoria automatici', 'sel', YN, KPRO, 'L\'app propone da sola un avviso poco prima dei programmi e delle partite che il cliente guarda spesso, con «Guarda». Il cliente può spegnerli anche dalle Impostazioni', '', 'TV in diretta e guida TV'],
  ['o.epgShift', 'Spostamento orario guida', 'sel', [[0, 'Nessuno'], [1, '+1 ora'], [2, '+2 ore'], [-1, '−1 ora'], [-2, '−2 ore']], [...KPRO, 'ult'], 'Sposta avanti o indietro gli orari della guida TV. Serve solo quando i programmi risultano sfasati di una o due ore rispetto a quello che va davvero in onda.', '', 'TV in diretta e guida TV'],
  ['o.showHidden', 'Mostra i canali nascosti', 'sel', [[false, 'No'], [true, 'Sì']], KPRO, 'Con «Sì» tornano visibili i canali e le categorie che il cliente aveva nascosto dall\'app. Utile quando ha nascosto qualcosa per sbaglio e non lo trova più.', '', 'TV in diretta e guida TV'],
  /* ---- Ordinamento ---- */
  ['o.sortCats', 'Ordina categorie', 'sel', [['pl', 'Come la playlist'], ['az', 'A → Z'], ['za', 'Z → A'], ['custom', 'Ordine personalizzato del cliente']], KPRO, 'L\'ordine delle categorie. «Come la playlist» rispetta l\'ordine del fornitore; «A → Z» le mette in ordine alfabetico; «Ordine personalizzato del cliente» lascia quello che il cliente ha sistemato a mano.', '', 'Ordinamento'],
  ['o.sortCh', 'Ordina canali', 'sel', [['pl', 'Come la playlist'], ['num', 'Per numero'], ['az', 'A → Z'], ['za', 'Z → A'], ['added', 'Aggiunti di recente']], [...KPRO, 'ult'], 'L\'ordine dei canali dentro ogni categoria. «Come la playlist» è l\'ordine del fornitore; «Per numero» segue il numero del canale; «Aggiunti di recente» mette in alto i canali nuovi.', '', 'Ordinamento'],
  ['o.sortVod', 'Ordina film e serie', 'sel', [['pl', 'Come la playlist'], ['recent', 'Aggiunti di recente'], ['az', 'A → Z'], ['rating', 'Valutazione']], [...KPRO, 'ult'], 'L\'ordine di film e serie. «Aggiunti di recente» mostra per prime le novità; «Valutazione» i titoli con il voto più alto; «Come la playlist» lascia l\'ordine del fornitore.', '', 'Ordinamento'],
  /* ---- Controllo genitori ---- */
  ['o.lockAdult', 'Blocca contenuti per adulti', 'sel', YN, [...KPRO, 'ult'], 'Con «Sì» le categorie per adulti si aprono solo con il PIN del controllo genitori: consigliato nelle case con bambini. Con «No» si aprono come le altre.', '', 'Controllo genitori'],
  ['u.theme', 'Tema colore', 'sel', [['tramonto', 'Tramonto'], ['neon', 'Neon'], ['smeraldo', 'Smeraldo'], ['rubino', 'Rubino'], ['ghiaccio', 'Ghiaccio'], ['aurora', 'Aurora'], ['oceano', 'Oceano'], ['lava', 'Lava'], ['oro', 'Oro'], ['ametista', 'Ametista'], ['tricolore', 'Tricolore'], ['cyber', 'Cyber'], ['corallo', 'Corallo'], ['notte', 'Notte'], ['menta', 'Menta'], ['fucsia', 'Fucsia'], ['sabbia', 'Sabbia'], ['carbonio', 'Carbonio']], ['ult'], 'Il cliente lo cambia anche dall\'app (Impostazioni → Tema colore). Aurora, Oceano, Lava, Oro, Ametista dalla 1.0; gli ultimi otto dalla 1.1.2', '', 'KAIROS Ultimate'],
  ['u.bg', 'Sfondo', 'sel', [['hud', 'HUD (esagoni)'], ['nero', 'Nero puro'], ['notte', 'Blu notte'], ['grafite', 'Grafite']], ['ult'], 'Lo sfondo delle schermate di KAIROS Ultimate. È solo estetica; «Nero puro» è il più leggero. Il cliente lo può cambiare anche dall\'app (Impostazioni → Sfondo). Dalla versione 1.1.3.', '', 'KAIROS Ultimate'],
  ['u.neon', 'Scritte neon', 'sel', YN, ['ult'], 'Le scritte luminose dei titoli di KAIROS Ultimate. Con «No» le scritte sono normali: aspetto più sobrio e un filo più leggero.', '', 'KAIROS Ultimate'],
  ['u.anim', 'Animazioni', 'sel', [['auto', 'Automatiche'], ['on', 'Accese'], ['off', 'Spente']], ['ult'], 'Le animazioni dei menu e della Home. «Automatiche» le riduce da sole sui dispositivi deboli; «Spente» rende l\'app più scattante sulle chiavette lente; «Accese» le tiene sempre.', '', 'KAIROS Ultimate'],
  ['u.trailer', 'Trailer', 'sel', YN, ['ult'], 'Con «Sì», fermandosi su un film o una serie parte il trailer. Con «No» niente trailer: meno dati consumati e meno lavoro per il dispositivo.', '', 'KAIROS Ultimate'],
  ['u.tmdb', 'Metadati TMDB', 'sel', YN, ['ult'], 'Con «Sì» l\'app prende da TMDB (l\'archivio pubblico dei film) trama, voto, anno e locandina quando la lista non li ha. Con «No» mostra solo quello che manda il fornitore: schede più povere, ma meno richieste in rete.', '', 'KAIROS Ultimate'],
  ['u.speedBar', 'Velocità in alto', 'sel', YN, ['ult'], 'Mostra in alto la velocità della connessione del cliente. Serve all\'agente per capire, anche al telefono, se i blocchi dipendono dalla linea di casa. Con «No» non si vede.', '', 'KAIROS Ultimate'],
  ['u.dnsRot', 'DNS rotativo', 'sel', [['on', 'Attivo'], ['off', 'Spento']], ['ult', 'xc'], 'Solo KAIROS Ultimate e Kairos XC, e solo per le linee il cui server ha indirizzi alternativi salvati in «Server DNS». «Attivo»: l\'app li usa a turno invece di usare sempre il principale. «Spento»: niente rotazione per questo cliente, anche se il server è impostato così.', '', 'KAIROS Ultimate · Kairos XC'],
  ['u.sport', 'Sport', 'sel', YN, ['ult'], 'Con «Sì» nell\'app c\'è la sezione Sport, con gli eventi in diretta e i canali dove vederli. Con «No» la sezione sparisce dal menu e dalla Home.', '', 'KAIROS Ultimate'],
  ['u.sports', 'Sport da mostrare', 'txt', [], ['ult'], 'Quali sport mostrare nella sezione Sport, scritti separati da una virgola: per esempio «calcio, basket, motogp». Lascia vuoto per mostrarli tutti.', '', 'KAIROS Ultimate'],
  ['u.sportHome', 'Sport in Home', 'sel', YN, ['ult'], 'Con «Sì» la Home mostra la riga «EVENTI ORA» con le partite in corso. Con «No» gli eventi restano solo dentro la sezione Sport.', '', 'KAIROS Ultimate'],
  ['u.follow', 'Squadre seguite', 'sel', YN, ['ult'], 'Con «Sì» il cliente può scegliere le sue squadre e l\'app lo avvisa con una striscia quando giocano o cambia il risultato. Con «No» la funzione non c\'è.', '', 'KAIROS Ultimate'],
  ['u.saver', 'Salvaschermo', 'sel', [['off', 'Spento'], ['5', '5 minuti'], ['10', '10 minuti'], ['20', '20 minuti']], ['ult'], 'Dopo quanti minuti senza toccare il telecomando parte il salvaschermo, che protegge lo schermo della TV quando l\'app resta ferma su un menu. «Spento»: non parte mai.', '', 'KAIROS Ultimate'],
  ['o.homeArt', 'Titoli di tendenza nella Home', 'sel', [['on', 'Sì'], ['off', 'No']], ['ktv', 'prem', 'lite', 'xc', 'portal', 'smart', 'plus', 'nova'], 'Locandine dei film e delle serie di tendenza della settimana che la linea ha davvero: dentro i cerchi (XC), le tessere (Lite), il riquadro a destra (STB) e le porte (Smarters), in una riga «di tendenza» (TV, Premium, Plus, Nova).', '', 'Home'],
  ['o.sep', 'Nascondi i separatori del fornitore', 'sel', [['on', 'Sì (consigliato)'], ['off', 'No']], ['tv', 'ktv', 'prem', 'lite', 'xc', 'ult', 'portal', 'smart', 'plus', 'nova'], 'Titoli come «----SPORT----» o «##### FILM #####» che il fornitore mette per dividere le liste: non sono canali né film e non si aprono (davano «io_bad_http_status»). Con «Sì» non si vedono in diretta, film e serie; vale dal prossimo aggiornamento della lista. Kairos Pro li nascondeva già in diretta.', '', 'Liste'],
  ['u.home', 'Home', 'sel', [['plancia', 'Plancia (riquadri vivi)'], ['classic', 'Classica (con la ruota)']], ['ult'], 'Plancia: cinque riquadri vivi (in onda ora, film e serie di tendenza, riprendi, eventi) e la striscia «Adesso». Classica: la Home di prima con la ruota.', '', 'KAIROS Ultimate'],
  ['u.top10', 'Righe Top 10', 'sel', YN, ['ult'], 'Con «Sì» la Home mostra le righe «Top 10 film» e «Top 10 serie». Con «No» non compaiono.', '', 'KAIROS Ultimate'],
  ['u.heroTrailer', 'Anteprima del trailer nella Home', 'sel', [['auto', 'Automatica (solo dispositivi potenti)'], ['off', 'Spenta']], ['ult'], 'Dopo qualche secondo fermi su un titolo in evidenza il trailer parte senza audio. Solo con 2 GB o più e Android 9+: sugli altri dispositivi non parte mai. Dalla versione 1.0.1', '', 'KAIROS Ultimate'],
  ['u.rows', 'Righe Home nascoste', 'txt', [], ['ult'], 'Le righe della Home da nascondere, separate da una virgola. Parole valide: «continua» (Continua a guardare), «top10», «sport» (Eventi ora), «tendenza» (Di tendenza), «novita» (aggiunti di recente). Lascia vuoto per mostrarle tutte.', '', 'KAIROS Ultimate'],
  /* ---- Rete ---- */
  // DNS cifrato (DNS su HTTPS): voce «sdns» on | off, vuota = spento; non è una scelta del cliente (niente «:allow»).
  // Nelle app (DnsShield): interfaccia locale di Android che vale solo per l'app e solo per le domande DNS, inoltrate su https a
  // 1.1.1.1 / 8.8.8.8 / 9.9.9.9; se non rispondono si chiude e torna il DNS normale. Dal 12 novembre 2026 tutte le app:
  // Kairos Pro dalla 2.7.6 (le più vecchie ignorano la voce), Plus e Nova dalla versione di quel giorno, Ultimate dalla prima
  ['sdns', 'DNS cifrato', 'sel', [['on', 'Acceso'], ['off', 'Spento']], ['tv', 'ktv', 'prem', 'lite', 'xc', 'ult', 'plus', 'nova'], 'L\'app chiede gli indirizzi dei server a un DNS pubblico dentro una connessione protetta, invece che al DNS dell\'operatore: l\'operatore non legge la domanda e non può cambiare la risposta. Passano di lì solo le domande DNS: video e liste vanno diretti come prima, quindi non rallenta. Android chiede il permesso una volta, con la stessa finestra della VPN. Se il servizio non risponde l\'app torna da sola al DNS normale; con la VPN accesa non serve e resta spento. Serve Kairos XC 3.4.6, Kairos TV 2.4.7, Kairos Lite 1.5.7 o Kairos Premium 1.7.6', 'Non imposto (spento)', 'Rete'],
  // KAIROS HEAVY (14 novembre 2026): pagina «KAIROS HEAVY» del pannello. Parte dal profilo della Ultimate, queste voci sono solo sue
  ['h.fx', 'Effetti 3D', 'sel', [['auto', 'Automatici (pieni sui dispositivi potenti)'], ['reduced', 'Ridotti']], ['heavy'], 'Ridotti: niente stelle in movimento e luci pesanti, la Home resta 3D ma più leggera. Utile su TV box lenti. Vale dall\'apertura successiva', 'Automatici', 'KAIROS HEAVY · Aspetto'],
  ['h.intro', 'Apertura con il logo di luci', 'sel', [['on', 'Sì'], ['off', 'No: Home subito']], ['heavy'], 'All\'avvio le luci arrivano da lontano e compongono il logo, poi la detonazione: lampo, onde d\'urto e il logo che scoppia verso chi guarda (circa 3 secondi). Con «No» la Home compare subito', 'Sì', 'KAIROS HEAVY · Aspetto'],
  ['h.sky', 'Cielo di stelle', 'sel', [['on', 'Sì'], ['off', 'No']], ['heavy'], 'Le stelle che vengono incontro dietro la Home della HEAVY. È solo scena: con «No» la grafica è un po\' più leggera, utile se la Home va a scatti.', 'Sì', 'KAIROS HEAVY · Aspetto'],
  ['h.sparks', 'Scintille sugli oggetti', 'sel', [['on', 'Sì'], ['off', 'No']], ['heavy'], 'Le piccole luci che salgono attorno all\'oggetto scelto nella Home della HEAVY. È solo scena: con «No» la grafica è un po\' più leggera.', 'Sì', 'KAIROS HEAVY · Aspetto'],
  ['h.theme', 'Tema dei colori', 'sel', [['neon', 'Neon: rosa, viola e azzurro'], ['oro', 'Oro e nero'], ['ghiaccio', 'Ghiaccio: azzurro e lilla'], ['fuoco', 'Fuoco: rosso e arancio'], ['smeraldo', 'Smeraldo: verde e acqua'], ['viola', 'Viola e rosa']], ['heavy'], 'I colori di tutta l\'app: oggetti della Home, luci, bordi, pulsanti, barre di caricamento e sfondo. Cambia subito, senza riavviare', 'Neon', 'KAIROS HEAVY · Aspetto'],
  ['h.bg', 'Sfondo', 'sel', [['aurora', 'Aurora: luci morbide che si muovono'], ['spazio', 'Spazio profondo: buio con una nebulosa'], ['griglia', 'Griglia al tramonto: stile anni \'80'], ['onde', 'Onde di luce'], ['nero', 'Nero puro: il più leggero']], ['heavy'], 'Quello che si vede dietro a tutte le schermate. «Nero puro» è il più leggero per i TV box lenti. Le stelle si spengono a parte, con «Cielo di stelle»', 'Aurora', 'KAIROS HEAVY · Aspetto'],
  ['h.trans', 'Animazione fra le schermate', 'sel', [['tuffo', 'Tuffo dentro l\'oggetto con lampo'], ['dissolvenza', 'Dissolvenza morbida nel buio'], ['veloce', 'Immediata: nessuna animazione']], ['heavy'], 'Cosa si vede quando si apre una sezione dalla Home o un titolo. «Tuffo» è la più scenografica; «Dissolvenza» è più morbida; «Immediata» non ha animazione ed è la più rapida: sceglila se il dispositivo è lento.', 'Tuffo', 'KAIROS HEAVY · Aspetto'],
  ['h.hints', 'Suggerimenti dei tasti', 'sel', [['on', 'Mostra'], ['off', 'Nascondi']], ['heavy'], 'La barra in basso con i tastini in rilievo («OK anteprima», «◀ ▶ canale», «▲ ▼ evento»…): dice al cliente cosa fa ogni tasto in quella schermata. Da nascondere solo per chi conosce già l\'app', 'Mostra', 'KAIROS HEAVY · Aspetto'],
  ['h.net', 'Wi-Fi e velocità in alto', 'sel', [['on', 'Mostra'], ['off', 'Nascondi']], ['heavy'], 'Nella Home, accanto allo scudo: le tacche del Wi-Fi (o il cavo) e la velocità di Internet in numeri (Mb/s), misurata dall\'app ogni mezz\'ora quando non si sta guardando. Verde = buono, giallo = discreto, rosso = debole', 'Mostra', 'KAIROS HEAVY · Home'],
  ['h.news', 'Notizie del giorno', 'sel', [['ansa', 'ANSA · prima pagina'], ['ultimaora', 'ANSA · ultima ora'], ['sport', 'ANSA · sport'], ['calcio', 'ANSA · calcio'], ['rai', 'RaiNews · tutte le notizie'], ['off', 'Spenta']], ['heavy'], 'La riga che scorre da destra a sinistra in alto nella Home con i titoli veri delle notizie, aggiornati ogni 10 minuti (accanto compare il nome della fonte). Doppia fonte: se quella scelta non risponde si leggono le notizie dall\'altra (ANSA ⇄ RaiNews); se non risponde nessuna restano le ultime lette, e solo se non ce ne sono la riga non compare', 'ANSA · prima pagina', 'KAIROS HEAVY · Home'],
  ['h.top10', 'Top 10 film e serie', 'sel', [['on', 'Mostra'], ['off', 'Nascondi']], ['heavy'], 'Nella Home, con ▼, due mensole con i 10 film e le 10 serie del momento, con il numero gigante in rilievo. Prende i titoli di tendenza (se ci sono nella lista del cliente), altrimenti i più votati', 'Mostra', 'KAIROS HEAVY · Home'],
  ['h.recent', 'Ultimi visti', 'sel', [['on', 'Mostra'], ['off', 'Nascondi']], ['heavy'], 'Mensola con gli ultimi 10 film ed episodi guardati, con la barra di quanto manca: OK riprende da dove il cliente era rimasto', 'Mostra', 'KAIROS HEAVY · Home'],
  ['h.lastch', '«Ultimi canali» nella Home', 'sel', [['on', 'Mostra'], ['off', 'Nascondi']], ['heavy'], 'Un telecomando 3D con i loghi degli ultimi 5 canali guardati che gli girano attorno: OK apre il menu e il cliente sceglie quale riaprire a schermo intero. In Diretta c\'è anche la cartella «Ultimi canali»', 'Mostra', 'KAIROS HEAVY · Home'],
  ['h.plHome', 'Playlist nella Home', 'sel', [['on', 'Mostra'], ['off', 'Nascondi']], ['heavy'], 'Tre sfere in alto nella Home, accanto a Cerca e Profilo. «Aggiungi playlist»: il cliente scrive server, utente e password, oppure incolla il link M3U intero (serve il permesso «Aggiungere, modificare ed eliminare playlist» nella sua scheda). «Cambia playlist»: elenca tutte le playlist che gli hai caricato dal pannello più quelle aggiunte da lui; con le playlist «Unite» c\'è anche «Tutte insieme» (serve il permesso «Cambiare playlist»). «Aggiorna canali»: riscarica subito canali, film e serie. Nascondi: le stesse funzioni restano in Profilo e Impostazioni', 'Mostra', 'KAIROS HEAVY · Home'],
  ['h.rec', 'Consigliati per te', 'sel', [['on', 'Mostra'], ['off', 'Nascondi']], ['heavy'], 'Mensola nella Home con film e serie scelti in base a quello che il cliente ha guardato: prende le categorie che guarda di più e propone i titoli più votati che non ha ancora visto', 'Mostra', 'KAIROS HEAVY · Home'],
  ['h.fresh', 'Appena arrivati', 'sel', [['on', 'Mostra'], ['off', 'Nascondi']], ['heavy'], 'Mensola nella Home della HEAVY con gli ultimi film e le ultime serie aggiunti alla lista del cliente. «Nascondi» la toglie: Home più corta.', 'Mostra', 'KAIROS HEAVY · Home'],
  ['h.surprise', '«Scegli per me» nella Home', 'sel', [['on', 'Mostra'], ['off', 'Nascondi']], ['heavy'], 'Per chi non sa cosa guardare: un dado 3D. Il cliente sceglie film, serie o sorpresa, il rullo di locandine gira, rallenta e si ferma su un titolo (Top 10, consigliati, appena arrivati), poi apre la scheda', 'Mostra', 'KAIROS HEAVY · Home'],
  ['h.preview', 'Anteprima dei canali', 'sel', [['on', 'Al primo OK nello schermo 3D'], ['off', 'Spenta: il canale parte subito a schermo intero']], ['heavy'], 'In Diretta ed Eventi il primo OK accende il canale nello schermo di vetro con l\'audio, il secondo lo apre a schermo intero. Spenta: un solo OK, schermo intero (consuma meno banda)', 'Al primo OK', 'KAIROS HEAVY · Diretta e film'],
  ['h.zoom', 'Anteprima che si allarga a schermo intero', 'sel', [['on', 'Sì'], ['off', 'No: stacco con lampo']], ['heavy'], 'Al secondo OK l\'anteprima del canale cresce fino a riempire lo schermo mentre continua a vedersi e sentirsi; il lettore parte sopra l\'ultima immagine, senza schermo nero né rotellina. Al ritorno l\'ultima immagine resta nel riquadro finché l\'anteprima riparte', 'Sì', 'KAIROS HEAVY · Diretta e film'],
  ['h.trailer', 'Trailer automatici', 'sel', [['on', 'Sì'], ['off', 'No']], ['heavy'], 'In Film e Serie, fermandosi su una locandina parte da solo il trailer dentro la scena 3D. Con «No» niente trailer: meno dati consumati e meno lavoro per il dispositivo.', 'Sì', 'KAIROS HEAVY · Diretta e film'],
  ['h.trailerDelay', 'Quando parte il trailer', 'sel', [['0', 'Quasi subito (0,4 s)'], ['1', 'Dopo 1 secondo'], ['2', 'Dopo 2 secondi'], ['4', 'Dopo 4 secondi']], ['heavy'], 'Quanto aspettare fermi su una locandina prima che parta il trailer. Più tempo = meno trailer avviati mentre si scorre', 'Dopo 1 secondo', 'KAIROS HEAVY · Diretta e film'],
  ['h.liveCheck', 'Solo canali funzionanti', 'sel', [['hide', 'Prova i canali e nascondi quelli spenti'], ['mark', 'Prova i canali e segnali «non risponde»'], ['learn', 'Nessuna prova: impara solo dai canali aperti'], ['off', 'Spento']], ['heavy'], 'In Diretta l\'app prova da sola i canali attorno a quello scelto (al massimo 40 per cartella, uno ogni 2 secondi, solo a telecomando fermo e mai mentre si guarda): quelli che non mandano video due volte di fila spariscono o restano segnati in rosso, quelli buoni hanno un puntino verde. Se il fornitore ha una sola connessione per linea o non gradisce le prove, scegli «Nessuna prova»: l\'app segna solo i canali che il cliente ha aperto davvero. Se un fornitore smette di funzionare solo su HEAVY, prova per prima cosa a mettere «Spento» qui', 'Prova e nascondi', 'KAIROS HEAVY · Stabilità'],
  ['h.group', 'Canali doppi in fila', 'sel', [['on', 'Sì: tutti i Rai 1, poi tutti i Rai 2…'], ['off', 'No: ordine del fornitore']], ['heavy'], 'In Diretta i canali con lo stesso nome (cambia solo la qualità, il paese davanti o «backup») stanno uno dopo l\'altro: Rai 1, Rai 1 HD, RAI UNO FHD… poi tutti i Rai 2, e così via. Il gruppo sta dove il fornitore ha messo il primo; i doppioni hanno una freccetta ↳ davanti al nome', 'Sì', 'KAIROS HEAVY · Diretta e film'],
  ['h.epg2', 'Guida TV di riserva', 'sel', [['on', 'Sì: doppia fonte per i canali senza guida'], ['off', 'No: solo la guida del fornitore']], ['heavy'], 'Se il fornitore non dà la guida di un canale (o la sua guida non si scarica), l\'app prende i programmi da una guida italiana pubblica riconoscendo il canale dal nome; se anche quella non risponde ne prova una seconda. La guida del fornitore, quando c\'è, ha sempre la precedenza. Si aggiorna da sola ogni 8 ore, mai mentre si guarda', 'Sì', 'KAIROS HEAVY · Stabilità'],
  ['h.neverStop', 'Canale che non si spegne mai', 'sel', [['on', 'Sì: riaggancia il canale all\'infinito'], ['off', 'No: si ferma dopo 10 tentativi']], ['heavy'], 'Quando il canale cade (linea o fornitore) l\'app prova da sola tutte le soluzioni (ricarica, decodifica, VLC) e poi continua a riagganciarlo ogni 5-20 secondi finché non torna, senza che il cliente tocchi nulla', 'Sì', 'KAIROS HEAVY · Stabilità'],
  ['h.buffer', 'Riserva di video (buffer)', 'sel', [['auto', 'Automatica: si adatta alla linea Internet'], ['fast', 'Piccola: avvio più veloce'], ['balanced', 'Normale'], ['stable', 'Grande: meno blocchi'], ['max', 'Massima: per linee molto instabili']], ['heavy'], 'Quanti secondi di video l\'app tiene da parte. Automatica: con linea debole tiene una riserva lunga (meno salti), con linea veloce parte prima. Massima usa più memoria: solo su dispositivi da 2 GB o più', 'Automatica', 'KAIROS HEAVY · Stabilità'],
  ['h.audioFix', 'Audio universale (FFmpeg)', 'sel', [['vlc', 'Sì: se l\'audio non è supportato passa al motore completo'], ['off', 'No']], ['heavy'], 'Alcuni canali hanno l\'audio in formati che molti TV box non sanno leggere (MP2, AC3, E-AC3, DTS): si vede ma non si sente. Con «Sì» l\'app se ne accorge e passa da sola al motore VLC, che ha dentro i decodificatori FFmpeg: nessun canale muto, senza appesantire l\'app', 'Sì', 'KAIROS HEAVY · Stabilità'],
];
// comandi: [chiave, nome, spiegazione, app che li eseguono]
const RC_CMDS = [
  ['reload', 'Riavvia l\'app', 'Chiude e riapre l\'interfaccia (la visione in corso si interrompe)', RC_LINKED],
  ['cache', 'Svuota cache e riavvia', 'Cancella liste, immagini e dati temporanei salvati sul dispositivo e riscarica tutto', RC_LINKED],
  ['sync', 'Aggiorna le liste', 'Riscarica canali, film e serie senza riavviare', RC_LINKED],
  ['settings', 'Apri le impostazioni', 'Porta il cliente nella pagina Impostazioni dell\'app', RC_LINKED],
  ['update', 'Aggiorna l\'app', 'L\'app controlla subito se c\'è una versione nuova: la scarica in background e propone «Installa ora»', RC_LINKED],
  ['speed', 'Speed test', 'Misura la connessione del dispositivo: il risultato arriva qui sotto e in «Online ora» (Kairos XC dalla versione 3.3.2)', ['tv', 'xc', 'ult']],
  ['epg', 'Aggiorna la guida TV', 'Ricostruisce la guida TV XMLTV', ['ult']],
  ['perm', 'Chiedi il permesso per gli aggiornamenti', 'Apre sulla TV la schermata di Android «Installa app sconosciute»: il cliente deve solo attivarla (Android non permette di farlo da remoto)', ['tv', 'ktv', 'prem', 'lite', 'xc', 'ult', 'plus', 'nova']],
  // Kairos Premium non ha il controllo genitori: il comando le arriverebbe come «non supportato»
  ['pin', 'Reimposta PIN controllo genitori', 'Il PIN torna 0000 e l\'app chiede al cliente di sceglierne uno nuovo: per chi lo ha dimenticato', RC_LINKED.filter((a) => a !== 'prem')],
  ['exit', 'Chiudi l\'app', 'L\'app si chiude; il cliente la riapre quando vuole', RC_LINKED],
];
// Portal e Smart condividono il motore di Kairos XC: ricevono ogni voce che vale per 'xc' (preview, lettore, qualità, DNS cifrato…)
for (const c of RC_CAT) if (c[0] !== 'u.dnsRot' && c[4].includes('xc') && !c[4].includes('portal')) c[4].push('portal', 'smart');
// catalogo per chiave: più voci con la stessa chiave (es. «theme» per Kairos Pro e per Portal/Smart), si sceglie quella dell'app
const rcCatAll = new Map();
for (const c of RC_CAT) { const a = rcCatAll.get(c[0]); if (a) a.push(c); else rcCatAll.set(c[0], [c]); }
const rcCatFor = (key, app) => { const a = rcCatAll.get(key); if (!a) return undefined; return (app && a.find((c) => c[4].includes(app))) || a[0]; };
const rcCatByKey = { get: (k) => rcCatFor(k) };
/** voci che valgono solo nel profilo dell'app (mai imposte al singolo dispositivo) */
const RC_PROF_ONLY = new Set(RC_CAT.filter((x) => x[8] === 'prof').map((x) => x[0]));
/** voci che il titolare può dare agli agenti (una per chiave): [chiave, nome, gruppo] */
const RC_CAT_AG = [...rcCatAll.values()].map((a) => a[0]).filter((c) => !RC_PROF_ONLY.has(c[0])).map((c) => [c[0], c[1], c[7] || 'Altro']);
const rcNoProf = (rc) => { for (const k of Object.keys(rc)) if (RC_PROF_ONLY.has(k.endsWith(':allow') ? k.slice(0, -6) : k)) delete rc[k]; return rc; };
/** voce di tipo «txt»: elenco di nomi separati da virgola (o righe), senza doppioni, al massimo 20 da 40 caratteri; null = non valido */
const RC_TXT_MAX = 40;
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
    const allow = k.endsWith(':allow'), base = allow ? k.slice(0, -6) : k, c = rcCatFor(base, app); if (!c) continue;
    if (allow && (c[2] !== 'sel' || base === 'qbox')) continue;
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
    if (typeof v === 'string' && v.startsWith('allow:')) {
      if (c[2] !== 'sel' || base === 'qbox') continue;
      allows[base] = v.slice(6).split(',').map((x) => c[3].find((option) => String(option[0]) === x)?.[0]).filter((x) => x !== undefined);
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
      else if (values.length > 1) out[k] = `allow:${values.map(String).join(',')}`;
  }
  return out;
}
const rcProfiles = (s) => { const r = s && s.rcApp && typeof s.rcApp === 'object' ? s.rcApp : {}; const o = {}; for (const a of RC_APPS) { try { o[a] = rcClean(r[a] || {}, a); } catch { o[a] = {}; } } return o; };
const rcDevOf = (d, app) => { try { return rcNoProf(rcClean(d && d.rc ? d.rc : {}, app || (d && d.app))); } catch { return {}; } };
/** adulti fuori dalla Home anche nelle versioni già installate: le app diverse dalla Pro conoscono solo «home.hide» (parti di nome
    delle categorie, maiuscole e accenti non contano), quindi con «adult» diverso da «on» ricevono anche queste parole. Le versioni
    nuove riconoscono gli adulti da sole (vedi README §33): per loro è un di più che non cambia nulla. Stesso calcolo in remote-panel.js
    (impronta «applicata»): se cambia qui, cambia anche lì */
const ADULT_HOME_WORDS = ['xxx', 'adult', '18+', '+18', 'porn', 'hentai', 'erotic', 'erotik', 'playboy', 'brazzers', 'hustler', 'dorcel', 'onlyfans', 'only fans', 'red light', 'redlight', 'x-rated', 'vm18', 'vm 18', 'hot club', 'private tv', 'sexy', 'milf', 'nsfw', 'vietato ai minori'];
const ADULT_MERGE_APPS = new Set(['ktv', 'prem', 'lite', 'xc', 'ult', 'plus', 'nova', 'portal', 'smart']);
function adultMerge(h) {
  const cur = String(h || '').split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean), seen = new Set(cur.map((x) => x.toLowerCase()));
  for (const w of ADULT_HOME_WORDS) if (!seen.has(w)) { seen.add(w); cur.push(w); }
  return cur.join(', ');
}
/** configurazione mandata all'app: con gli adulti nascosti (voce «adult» diversa da «on») le parole per adulti in «home.hide» */
function rcSent(rc, app) {
  const sent = { ...rc };
  if (app !== 'ult') {
    for (const [k, v] of Object.entries(sent)) if (typeof v === 'string' && v.startsWith('allow:')) delete sent[k];
  }
  if (!ADULT_MERGE_APPS.has(app) || sent.adult === 'on') return sent;
  return { ...sent, 'home.hide': adultMerge(sent['home.hide']) };
}
/** configurazione effettiva per un dispositivo: profilo della sua app + impostazioni sue; «rcv» = impronta corta di quella mandata
    all'app. [forApp] = la configurazione da mandare all'app (con le parole per adulti), altrimenti quella decisa nel pannello */
function rcEffective(s, d, app, forApp, heavy) {
  const a = app || appOfVer('', d && d.app) || 'tv';
  const prof = rcProfiles(s);
  // KAIROS HEAVY: per il pannello è una Ultimate (stessi codici, linee, DNS…) con in più le voci «h.*» del suo profilo
  if (heavy && a === 'ult') prof.ult = { ...(prof.ult || {}), ...(prof.heavy || {}) };
  // Portal e Smart partono dal profilo di Kairos XC (stesso motore), poi il loro profilo lo sovrascrive: così il DNS cifrato e le
  // altre voci messe su «Kairos XC» valgono anche per loro, finché il titolare non sceglie qualcosa di diverso
  const rc = RC_PARENT[a] ? { ...(prof[RC_PARENT[a]] || {}), ...(prof[a] || {}) } : { ...(prof[a] || {}) }, own = rcDevOf(d, a);
  for (const [k, v] of Object.entries(own)) {
    const base = k.endsWith(':allow') ? k.slice(0, -6) : k;
    delete rc[base]; delete rc[`${base}:allow`]; rc[k] = v;
  }
  const sent = rcSent(rc, a), keys = Object.keys(sent).sort();
  const flat = keys.map((k) => k + '=' + JSON.stringify(sent[k])).join('&');
  let h = 0; for (let i = 0; i < flat.length; i++) h = (h * 31 + flat.charCodeAt(i)) >>> 0;
  return { rc: forApp ? sent : rc, rcv: keys.length ? h.toString(36) : '' };
}
/** un comando non consegnato entro 7 giorni scade: non arriva più all'app (e non ne blocca uno nuovo uguale) */
const RC_CMD_TTL = 7 * 864e5;
/** riavvio, svuota cache e chiudi: l'app li conferma e dopo meno di un secondo si riavvia o si chiude, quindi con la rete lenta la
    conferma può perdersi. Se l'app si è riaperta dopo la consegna (register più recente) sono già stati eseguiti: si segnano fatti
    invece di rimandarli, altrimenti l'app si riavviava di nuovo (o si chiudeva appena il cliente la riapriva) */
const RC_ONCE = new Set(['reload', 'cache', 'exit']);
/** comandi in attesa per un dispositivo (al massimo 5 per battito); si segnano come consegnati. [regT] = ultima apertura (register) */
async function rcPending(env, ctx, deviceId, regT = 0) {
  try {
    let rows = ((await env.DB.prepare('SELECT id, cmd, args, sent FROM remote_cmds WHERE device_id = ? AND done = 0 AND created > ? ORDER BY id LIMIT 5').bind(deviceId, now() - RC_CMD_TTL).all()).results) || [];
    const gone = regT > 0 ? rows.filter((r) => RC_ONCE.has(r.cmd) && +r.sent > 0 && regT > +r.sent) : [];
    if (gone.length) {
      const g = env.DB.prepare(`UPDATE remote_cmds SET done = ?, ok = 1, info = ? WHERE done = 0 AND id IN (${gone.map(() => '?').join(',')})`).bind(now(), 'eseguito: l\'app si è riaperta (conferma non arrivata)', ...gone.map((r) => r.id)).run().catch(() => {});
      ctx && ctx.waitUntil ? ctx.waitUntil(g) : await g;
      rows = rows.filter((r) => !gone.includes(r));
    }
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
/** quale app sta usando il cliente: dalla versione che manda l'app stessa («lite 1.3.0», «tv 2.2.4», «xc 2.0.2», «ult 1.0.0», «plus 0.1.5»,
    Kairos Pro solo il numero «2.5.3»), che è la cosa più affidabile; altrimenti quella salvata nel pannello.
    Prima la salute delle app confrontava tutti con la versione della Pro e proponeva aggiornamenti sbagliati. */
function appOfVer(ver, saved) {
  const v = String(ver || '').trim();
  if (/vega/i.test(v)) return 'vega';
  if (/^lite\b/i.test(v)) return 'lite';
  if (/^ult\b/i.test(v)) return 'ult';
  if (/^xc\b/i.test(v)) return 'xc';
  if (/^plus\b/i.test(v)) return 'plus';
  if (/^nova\b/i.test(v)) return 'nova';
  if (/^portal\b/i.test(v)) return 'portal';
  if (/^smart\b/i.test(v)) return 'smart';
  if (/premium/i.test(v)) return 'prem';
  if (/^tv\b/i.test(v)) return 'ktv';
  if (/^\d+\.\d+/.test(v)) return 'tv';
  return saved || 'tv';
}
/** come si aggiorna ogni app: solo Kairos Pro riceve «Invia aggiornamento» dal pannello */
const UPD_HOW = { tv: 'Invia l\'aggiornamento: l\'app lo propone subito al cliente', prem: 'Invia l\'aggiornamento: Kairos Premium lo scarica in background e propone «Installa ora»', ktv: 'Invia l\'aggiornamento: Kairos TV lo scarica in background e propone «Installa ora» (dalla versione con il controllo remoto; le vecchie lo propongono all\'avvio)', lite: 'Invia l\'aggiornamento: Kairos Lite lo scarica in background e propone «Installa ora» (dalla versione con il controllo remoto; le vecchie lo propongono all\'avvio)', xc: 'Invia l\'aggiornamento: Kairos XC lo scarica in background e propone «Installa ora» (dalla versione con il controllo remoto; le vecchie lo propongono all\'avvio)', ult: 'Invia l\'aggiornamento: KAIROS Ultimate lo scarica in background e propone «Installa ora»', plus: 'Invia l\'aggiornamento: Kairos Plus lo scarica in background e propone «Installa ora» (dalla versione con il controllo remoto; le vecchie si aggiornano dal Kairos Store)', nova: 'Invia l\'aggiornamento: Kairos Nova lo scarica in background e propone «Installa ora»' };
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
/** ultima visione del dispositivo (serve solo se l'auto-controllo dice «server non raggiungibile»: altrimenti niente lettura) */
const chkDown = (p) => !!(p && typeof p.chk === 'string' && p.chk.includes('"srv":"down"'));
async function lastPlayOf(env, id, p, t = now()) {
  if (!chkDown(p)) return 0;
  try { return +((await env.DB.prepare('SELECT MAX(last) AS last FROM watch_dev WHERE device_id = ? AND day >= ?').bind(id, dayIT(t - 2 * 864e5)).first()) || {}).last || 0; } catch { return 0; }
}
async function fixDevice(env, s, d, who, auto = false, soft = false) {
  const t = now();
  const p = await env.DB.prepare('SELECT * FROM presence WHERE device_id = ?').bind(d.id).first();
  const app = appOfVer(p && p.ver, d.app);
  if (!RC_LINKED.includes(app)) throw new HttpErr(400, `${APP_NAME[app] || 'Questa app'} non si gestisce dal pannello`);
  const errs = ((await env.DB.prepare('SELECT t, problem, outcome, codec, dec FROM app_errors WHERE device_id = ? AND t > ?').bind(d.id, Math.max(t - 864e5, +d.fix_t || 0)).all().catch(() => ({ results: [] }))).results) || [];
  const latest = auto ? null : await latestFor(env, s, app).catch(() => null);
  const iss = healthIssues(p, errs, latest, app, await lastPlayOf(env, d.id, p, t));
  const rc = rcDevOf(d), rc0 = JSON.stringify(rc), cmds = new Set(), done = [], todo = [];
  /* voci già decise dal titolare (su questo cliente o sul profilo dell'app): «Risolvi» automatico non le cambia mai.
     «Modalità leggera: Spenta» non la cambia nemmeno «Risolvi» premuto a mano (lo segnala soltanto), e la modalità leggera non scende mai */
  const prof = rcProfiles(s)[app] || {}, LR = { auto: 1, on: 2, max: 3 };
  const set = (k, v, why, keep) => {
    const c = rcCatFor(k, app); if (!c || !(c[4] || []).includes(app) || rc[k] === v) return;
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
    const have = await env.DB.prepare('SELECT 1 AS x FROM remote_cmds WHERE device_id = ? AND cmd = ? AND done = 0 AND created > ?').bind(d.id, c, t - RC_CMD_TTL).first();
    if (!have) stmts.push(env.DB.prepare('INSERT INTO remote_cmds (device_id, cmd, args, created, by) VALUES (?, ?, ?, ?, ?)').bind(d.id, c, '', t, who));
  }
  if (cmds.has('cache')) done.push('Cache svuotata e app riavviata (appena l\'app si collega: entro 1 minuto se è aperta)');
  if (done.length) stmts.push(env.DB.prepare('UPDATE devices SET fix_t = ? WHERE id = ?').bind(t, d.id));
  if (stmts.length) await env.DB.batch(stmts);
  if (done.length) await log(env, 'edit', `${who}: «Risolvi»${auto ? ' automatico' : soft ? ' (tutti, senza riavvii)' : ''} su ${d.name || d.code} — ${done.join('; ')}`, '');
  return { ok: true, done, todo, issues: iss.length };
}
/** quante volte davvero: le segnalazioni a meno di 5 minuti dalla prima del gruppo sono la stessa chiusura (l'app la rimanda
 *  quando la consegna non viene confermata; un dispositivo che si spegne ne lascia più d'una) */
function distinctTimes(list, gap = 5 * 60e3) {
  let n = 0, start = -Infinity;
  for (const t of list.map((e) => +e.t || 0).sort((a, b) => a - b)) if (t - start > gap) { n++; start = t; }
  return n;
}
function healthIssues(p, errs, latest, app, lastPlay = 0) {
  const out = [];
  const pro = !app || RC_APPS.includes(app);
  if (p && latest && verBehind(p.ver, latest.version)) out.push({ sev: 'warn', key: 'upd', what: `App vecchia: ${APP_NAME[app || 'tv'] || ''} ${String(p.ver || '?').replace(/^(lite|tv|xc|ult|plus|nova)\s+/i, '').replace(/\s+premium$/i, '')} (ultima ${latest.version})`, fix: UPD_HOW[app || 'tv'] || 'Aggiorna l\'app del cliente', ...(pro ? { act: 'upd' } : {}) });
  const kd = distinctTimes(errs.filter((e) => e.problem === 'killed')), cr = distinctTimes(errs.filter((e) => e.problem === 'crash'));
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
  out.push(...chkIssues(p, lastPlay, errs)); // auto-controlli dell'app (linea, server, orologio, spazio, guida)
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
  const lastPlay = wd.reduce((m, w) => Math.max(m, +w.last || 0), 0);
  return {
    id: d.id, name: d.name || '', code: d.code, app, appName: APP_NAME[app] || 'Kairos', model: (p && p.model) || d.model || '',
    online, lastSeen: Math.max(+d.last_seen || 0, p ? +p.t : 0), lastIp: (p && p.ip) || d.last_ip || '', city: p ? [p.city, p.country].filter(Boolean).join(', ') : '',
    ver: (p && p.ver) || '', latest: latest ? latest.version : '', needsUpdate: !!(p && latest && verBehind(p.ver, latest.version)), canUpd: RC_LINKED.includes(app), updSent: +d.upd_req || 0,
    now: p && p.state !== 'idle' && online ? { kind: p.state, title: p.title, ch: p.ch, res: p.res, codec: p.codec, engine: p.engine } : null,
    last: wd.length ? { kind: wd[0].kind, title: wd[0].title, t: +wd[0].last } : p && p.title ? { kind: p.state, title: p.title, t: +p.t } : null,
    net: p ? { type: p.net, rssi: +p.rssi || 0, dl: +p.speed_dl || 0, ul: +p.speed_ul || 0, ping: +p.speed_ping || 0, t: +p.speed_t || 0 } : null,
    watch: { today: byDay.get(today) || 0, week: [...byDay.values()].reduce((a, b) => a + b, 0), days: [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([day, secs]) => ({ day, secs })), top: [...byTitle.values()].sort((a, b) => b.secs - a.secs).slice(0, 15) },
    errors: { n24: errs24.length, n7: errs.length, unresolved24: errs24.filter((e) => e.outcome === 'non risolto').length, list: errs.slice(0, 12) },
    issues: healthIssues(p, errs24, latest, app, lastPlay),
    chk: (() => { const c = chkParse(p && p.chk), seen = chkSeenAfter(c, lastPlay, errs24); return c && seen ? { ...c, seen } : c; })(), // auto-controlli silenziosi dell'app (autopilota); «seen» = server raggiunto dopo: ha guardato a quell'ora
  };
}
/** riepilogo per il pannello: clienti con problemi (versione vecchia, errori, blocchi), dal più grave */
async function healthList(env, s, ids) {
  const t = now();
  // presenza, errori e ultime versioni: tutto insieme (prima erano tre attese una dopo l'altra)
  const L = {};
  const [rowsR, erR] = await Promise.all([
    env.DB.prepare("SELECT p.device_id AS id, p.ver, p.state, p.stalls_h, p.net, p.rssi, p.speed_dl, p.t, p.chk, d.name, d.code, d.app, d.parent, d.upd_req, d.fix_t, d.hl_hide FROM presence p JOIN devices d ON d.id = p.device_id WHERE p.t > ?").bind(t - 3 * 864e5).all(),
    env.DB.prepare('SELECT device_id, t, problem, outcome, codec, dec FROM app_errors WHERE t > ?').bind(t - 864e5).all().catch(() => ({ results: [] })),
    ...RC_APPS.map(async (a) => { L[a] = await latestFor(env, s, a).catch(() => null); }), // anche Kairos Nova (prima mancava: le Nova vecchie non comparivano)
  ]);
  const rows = (rowsR && rowsR.results) || [];
  const er = new Map(((erR && erR.results) || []).reduce((m, e) => { const a = m.get(e.device_id) || []; a.push(e); m.set(e.device_id, a); return m; }, new Map()));
  // ultima visione: si legge solo se qualcuno ha «server non raggiungibile» (di solito nessuno), una richiesta per tutti
  const lp = new Map();
  if (rows.some(chkDown)) { try { for (const w of ((await env.DB.prepare('SELECT device_id, MAX(last) AS last FROM watch_dev WHERE day >= ? GROUP BY device_id').bind(dayIT(t - 2 * 864e5)).all()).results) || []) lp.set(w.device_id, +w.last || 0); } catch {} }
  const out = []; let hidden = 0;
  const errorKeys = new Set(['killed', 'uierr', 'crash', 'restart', 'err', 'dec']);
  for (const r of rows) {
    if (ids && !ids.has(r.id)) continue;
    let hide = null; try { const h = r.hl_hide ? JSON.parse(r.hl_hide) : null; if (h && Number.isFinite(+h.t) && Array.isArray(h.keys)) hide = h; } catch {}
    const app = appOfVer(r.ver, r.app), errs = (er.get(r.id) || []).filter((e) => +e.t > Math.max(+r.fix_t || 0, hide ? +hide.t : 0));
    let iss = healthIssues(r, errs, L[app] || null, app, lp.get(r.id) || 0);
    if (hide) iss = iss.filter((i) => !hide.keys.includes(i.key) || errorKeys.has(i.key));
    if (!iss.length) { if (hide) hidden++; continue; }
    out.push({ id: r.id, name: r.name || '', code: r.code, app, appName: APP_NAME[app] || '', canUpd: RC_LINKED.includes(app), ver: r.ver, online: t - +r.t <= ONLINE_MS, lastSeen: +r.t, updSent: +r.upd_req || 0, issues: iss, bad: iss.filter((x) => x.sev === 'bad').length });
  }
  out.sort((a, b) => b.bad - a.bad || b.issues.length - a.issues.length || b.lastSeen - a.lastSeen);
  return { list: out.slice(0, 300), hidden, latest: Object.fromEntries(Object.entries(L).map(([k, v]) => [k, v ? v.version : ''])), settings: { on: !!(s.health && s.health.on), autoUpd: !!(s.health && s.health.autoUpd), autoFix: !!(s.health && s.health.autoFix), card: !(s.health && s.health.card === false) } };
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
  // lingua scelta dal titolare: in inglese prima l'anteprima di Apple (file che parte nel lettore), poi TMDB e YouTube in inglese
  const en = trailerLangOf(await getSettings(env)) === 'en';
  const key = 'trl2:' + (await sha256(kind + '|' + title.toLowerCase() + '|' + year + (en ? '|en' : ''))).slice(0, 24);
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
  const tries = (en ? [
    () => trailerItunes(title, year, kind, want, true),
    env.TMDB_KEY ? () => trailerTmdb(env, title, year, kind, true) : null,
    () => trailerYoutube(title, year, kind, want, true),
  ] : [
    env.TMDB_KEY ? () => trailerTmdb(env, title, year, kind) : null,
    () => trailerYoutube(title, year, kind, want),
    () => trailerItunes(title, year, kind, want),
  ]).filter(Boolean);
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
async function metaTmdb(env, title, year, kind, id = '') {
  const get = tmdbGet(env), t = kind === 'series' ? 'tv' : 'movie';
  const yq = year ? (t === 'tv' ? '&first_air_date_year=' : '&year=') + year : '';
  let hit;
  if (id) hit = await get(`/${t}/${id}?language=it-IT`);
  else {
    let res = (await get(`/search/${t}?query=${encodeURIComponent(title)}&language=it-IT${yq}`)).results || [];
    if (!res.length && yq) res = (await get(`/search/${t}?query=${encodeURIComponent(title)}&language=it-IT`)).results || [];
    hit = res[0];
  }
  if (!hit) return null;
  const hitId = hit.id || id;
  const [rd, vids, images, watch] = await Promise.all([
    get(t === 'tv' ? `/tv/${hitId}/content_ratings` : `/movie/${hitId}/release_dates`).catch(() => ({})),
    get(`/${t}/${hitId}/videos?language=it-IT&include_video_language=it,en,null`).catch(() => ({})),
    get(`/${t}/${hitId}/images?include_image_language=it,en,null`).catch(() => ({})),
    get(`/${t}/${hitId}/watch/providers`).catch(() => ({})),
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
  const logos = (Array.isArray(images.logos) ? images.logos : []).filter((image) => typeof image.file_path === 'string' && image.file_path);
  const logo = ['it', 'en', null].map((lang) => {
    const group = logos.filter((image) => image.iso_639_1 === lang);
    return group.find((image) => /\.png$/i.test(image.file_path || '')) || group[0];
  }).find(Boolean);
  const providers = (watch.results?.IT?.flatrate || []).slice(0, 4).filter((p) => p.logo_path)
    .map((p) => ({ n: String(p.provider_name || '').slice(0, 40), logo: 'https://image.tmdb.org/t/p/w92' + p.logo_path }));
  const vote = Number.isFinite(+hit.vote_average) ? Math.round(+hit.vote_average * 10) / 10 : 0;
  return {
    cert, certSrc: src, extras, tmdb: hitId,
    logo: logo ? 'https://image.tmdb.org/t/p/w500' + logo.file_path : '',
    backdrop: hit.backdrop_path ? 'https://image.tmdb.org/t/p/w1280' + hit.backdrop_path : '',
    providers, vote, plot: String(hit.overview || '').slice(0, 600),
  };
}
async function playerMeta(req, env, ip, url, ctx) {
  if (await limited(env.RL_DEVICE, 'mt:' + ip)) return json({ error: 'Troppe richieste' }, 429);
  if (!env.TMDB_KEY) return json({ cert: '', extras: [], off: true });
  const raw = nameClean(url.searchParams.get('t') || '', 160), title = trailerTitle(raw);
  const year = parseInt(url.searchParams.get('y') || '', 10) || yearIn(raw), kind = url.searchParams.get('kind') === 'series' ? 'series' : 'movie';
  const rawId = url.searchParams.get('id') || '', id = /^\d{1,10}$/.test(rawId) ? rawId : '';
  if (title.length < 2 && !id) return json({ cert: '', extras: [] });
  const key = 'mta2:' + (await sha256(id ? kind + '|id:' + id : kind + '|' + title.toLowerCase() + '|' + year)).slice(0, 24);
  const c = await env.DB.prepare('SELECT v FROM settings WHERE k = ?').bind(key).first();
  if (c) { try { const v = JSON.parse(c.v), age = now() - v.t; if ((v.tmdb ? age < 14 * 864e5 : age < 6 * 3600e3)) return json({ cert: v.cert || '', certSrc: v.certSrc || '', extras: v.extras || [], logo: v.logo || '', backdrop: v.backdrop || '', providers: v.providers || [], vote: v.vote || 0, plot: v.plot || '', tmdb: v.tmdb || '' }); } catch {} }
  let out = null;
  try { out = await metaTmdb(env, title, year, kind, id); } catch { return json({ cert: '', extras: [] }); }
  const v = { cert: out ? out.cert : '', certSrc: out ? out.certSrc : '', extras: out ? out.extras : [], logo: out ? out.logo : '', backdrop: out ? out.backdrop : '', providers: out ? out.providers : [], vote: out ? out.vote : 0, plot: out ? out.plot : '', tmdb: out ? out.tmdb : 0, t: now() };
  if (await cacheOk(env, url, 'cwm:', !!v.tmdb)) ctx.waitUntil(env.DB.prepare('INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind(key, JSON.stringify(v)).run());
  return json({ cert: v.cert, certSrc: v.certSrc, extras: v.extras, logo: v.logo, backdrop: v.backdrop, providers: v.providers, vote: v.vote, plot: v.plot, tmdb: v.tmdb || '' });
}
/* ======================================================================
   ASSISTENTE IA: Claude (Anthropic, a pagamento) o Google Gemini (gratis). Gemini di serie; il titolare sceglie Claude
   (o «Spento») per il singolo cliente nella sua scheda, per tutti i clienti di Kairos Pro nel Controllo remoto (profilo
   dell'app) o per tutti nella pagina «Assistente IA». Se quello scelto non risponde, risponde l'altro (se collegato).
   Ogni cliente ha un numero di domande al giorno (dal pannello) + domande extra: ogni richiesta all'IA ne usa una.
   Modalità: «ask» (domanda su un titolo o libera), «search» (frase → criteri di ricerca: la app cerca da sola nella sua
   libreria e nella guida TV), «tonight» (sceglie e motiva 3–5 proposte tra quelle preparate dalla app).
   All'IA arrivano solo la domanda e il minimo dei titoli: mai nome, codice o dati del cliente.
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
// vocabolario fisso dei criteri: l'app sa cercarli nei generi, nelle categorie e nella guida TV
const AI_GENRES = ['azione', 'avventura', 'animazione', 'commedia', 'crimine', 'documentario', 'drammatico', 'famiglia', 'fantascienza', 'fantasy', 'guerra', 'horror', 'musica', 'mistero', 'romantico', 'storico', 'thriller', 'western', 'sport', 'reality', 'notizie', 'bambini'];
const AI_SPORTS = ['calcio', 'f1', 'motogp', 'tennis', 'basket', 'nfl', 'ufc', 'rugby'];
const AI_FIND_KEYS = `"type": "movie" (film), "series" (serie TV), "live" (TV in diretta: partite, programmi, canali) o "any"; "genres": solo tra ${AI_GENRES.join(', ')}; "years": [anno iniziale, anno finale] (es. «anni 90» = [1990, 1999]); "people": nomi completi di attori o registi (es. «Stallone» = «Sylvester Stallone»); "titles": titoli precisi citati o chiaramente intesi; "words": parole da cercare nei titoli e nella guida TV (squadre con il nome breve, es. «Inter»; piloti; programmi; canali); "sport": ${AI_SPORTS.join(', ')}; "when": "now" (adesso), "tonight" (stasera), "today" o "tomorrow"; "kids": true se è per bambini`;
const AI_SYS_FIND = `Trasformi la richiesta di chi guarda la TV in criteri di ricerca per la sua app (film, serie, canali e guida TV). Rispondi solo con un oggetto JSON, senza altro testo. Chiavi, solo quelle utili: ${AI_FIND_KEYS}; "label": riassunto in italiano di massimo 50 caratteri. Non inventare titoli né orari.`;
const AI_SYS_ASK = `Sei l'assistente di un'app per guardare la TV (film, serie, canali). Rispondi in italiano, breve e chiaro, da leggere sulla TV: al massimo 4 frasi brevi, niente markdown né elenchi. Non rivelare il finale se non te lo chiedono. Se non sai una cosa dillo, non inventare. Orari e programmi TV non li conosci: per quelli (e per film simili, film di un attore, cose da guardare) compila "find" e l'app li cerca nella libreria e nella guida TV di chi chiede. Rispondi solo con JSON: {"answer": "risposta", "titles": ["titoli di film o serie che citi"], "find": {criteri} oppure null}. Criteri di "find": ${AI_FIND_KEYS}.`;
const AI_SYS_TONIGHT = 'Aiuti a scegliere cosa guardare stasera. Ricevi un elenco numerato di proposte (film, serie, programmi TV con orario) e i gusti di chi guarda. Scegline da 3 a 5, varie tra loro e adatte alla serata. Rispondi solo con JSON: {"picks": [{"i": numero, "why": "motivo"}]}. Il motivo è in italiano, al massimo 70 caratteri, concreto (genere, orario, perché può piacere), senza spoiler. Usa solo i numeri dell\'elenco.';
const utcDay = (t = now()) => new Date(t).toISOString().slice(0, 10);
/** o: system (istruzioni), max (parole in uscita), ms (attesa massima) */
async function claudeAsk(env, model, text, o = {}) {
  const m = AI_CLAUDE_MODELS[model] || AI_CLAUDE_MODELS.haiku;
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', signal: AbortSignal.timeout(o.ms || 25000),
    headers: { 'content-type': 'application/json', 'x-api-key': String(env.ANTHROPIC_API_KEY).trim(), 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: m.id, max_tokens: o.max || 400, system: o.system || AI_SYSTEM, messages: [{ role: 'user', content: text }] }), // niente «temperature»: Haiku 5.5 e Sonnet 5.5 rispondono con errore 400 se c'è
  });
  const j = await r.json().catch(() => null);
  const answer = j && Array.isArray(j.content) ? j.content.map((p) => (p && p.type === 'text' ? p.text : '')).join('').trim() : '';
  const u = (j && j.usage) || {};
  return { status: r.status, answer, tin: +u.input_tokens || 0, tout: +u.output_tokens || 0, err: (j && j.error && j.error.message) || '' };
}
/** o: system, json (risposta in JSON), temp, ms */
async function geminiAsk(env, model, text, think, o = {}) {
  const gc = { maxOutputTokens: 1024, temperature: o.temp ?? 0.6 };
  if (think) gc.thinkingConfig = { thinkingLevel: think };
  if (o.json) gc.responseMimeType = 'application/json';
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST', signal: AbortSignal.timeout(o.ms || 25000),
    headers: { 'content-type': 'application/json', 'x-goog-api-key': String(env.GEMINI_API_KEY).trim() },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: o.system || AI_SYSTEM }] }, contents: [{ role: 'user', parts: [{ text }] }], generationConfig: gc }),
  });
  const j = await r.json().catch(() => null);
  const answer = j && Array.isArray(j.candidates) && j.candidates[0] && j.candidates[0].content ? (j.candidates[0].content.parts || []).filter((p) => !p.thought).map((p) => p.text || '').join('').trim() : '';
  return { status: r.status, answer };
}
const aiLimitOf = (P, set) => (+P.ai_limit >= 0 ? +P.ai_limit : Math.max(0, parseInt(set.aiDaily ?? 20, 10) || 0));
const aiProvOf = (set) => (AI_PROVIDERS.includes(set.aiProvider) ? set.aiProvider : 'gm');
/** IA che risponde a questo cliente: 'gm' | 'claude' | 'off'. Spenta per tutti (pagina Assistente IA), permesso spento o
    0 domande al giorno = 'off'; poi vince la scelta nella scheda del cliente, poi il profilo dell'app (Controllo remoto),
    infine l'IA predefinita (Gemini di serie). Decide anche se l'app mostra le funzioni IA (perms.ai). */
function aiEngineOf(s, P, d, app) {
  if (!P || s.aiOff || permsParse(P.perms).ai === false) return 'off';
  if (aiLimitOf(P, s) === 0 && !(+P.ai_extra > 0)) return 'off';
  if (AI_PROVIDERS.includes(P.ai_provider)) return P.ai_provider;
  const v = rcEffective(s, d || P, app).rc.ai;
  if (v === 'off') return 'off';
  return AI_PROVIDERS.includes(v) ? v : aiProvOf(s);
}
async function aiUsed(env, id) { return ((await env.DB.prepare('SELECT n FROM ai_usage WHERE day = ? AND device_id = ?').bind(utcDay(), id).first()) || { n: 0 }).n; }
/** consumo della risposta (Gemini/Claude e token) sul giorno della domanda: la domanda è già contata quando si prenota */
async function aiCount(env, id, f, tin = 0, tout = 0, day = utcDay()) {
  await env.DB.prepare(`INSERT INTO ai_usage (day, device_id, n, gm, cl, cl_in, cl_out) VALUES (?, ?, 0, ?, ?, ?, ?) ON CONFLICT(day, device_id) DO UPDATE SET gm = gm + excluded.gm, cl = cl + excluded.cl, cl_in = cl_in + excluded.cl_in, cl_out = cl_out + excluded.cl_out`)
    .bind(day, id, f === 'gm' ? 1 : 0, f === 'claude' ? 1 : 0, tin, tout).run();
}
/** primo oggetto JSON nel testo dell'IA (anche dentro ```json … ``` o con una virgola di troppo); null se non c'è */
function aiJson(t) {
  let s = String(t || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  const a = s.indexOf('{'), z = s.lastIndexOf('}');
  if (a < 0 || z <= a) return null;
  s = s.slice(a, z + 1);
  for (const x of [s, s.replace(/,\s*([}\]])/g, '$1')]) { try { const o = JSON.parse(x); if (o && typeof o === 'object' && !Array.isArray(o)) return o; } catch {} }
  return null;
}
/** elenco di testi brevi, senza doppioni */
const aiList = (v, n, len) => {
  const out = [];
  for (const x of Array.isArray(v) ? v : typeof v === 'string' ? [v] : []) {
    if (typeof x !== 'string' && typeof x !== 'number') continue;
    const t = nameClean(String(x), len); if (t.length < 2 || out.some((y) => y.toLowerCase() === t.toLowerCase())) continue;
    out.push(t); if (out.length >= n) break;
  }
  return out;
};
const AI_TYPE_IT = { film: 'movie', movie: 'movie', movies: 'movie', serie: 'series', series: 'series', tv: 'live', live: 'live', diretta: 'live', any: 'any', tutto: 'any' };
const AI_WHEN_IT = { now: 'now', adesso: 'now', ora: 'now', tonight: 'tonight', stasera: 'tonight', today: 'today', oggi: 'today', tomorrow: 'tomorrow', domani: 'tomorrow' };
/** criteri di ricerca dell'IA ripuliti: solo chiavi e valori noti, testi corti (null = niente di utile) */
function aiFindClean(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
  const low = (v) => (typeof v === 'string' ? v.toLowerCase().trim() : ''), out = {};
  if (AI_TYPE_IT[low(o.type)]) out.type = AI_TYPE_IT[low(o.type)];
  const g = aiList(o.genres, 4, 20).map(low).filter((x) => AI_GENRES.includes(x)); if (g.length) out.genres = g;
  const ys = (Array.isArray(o.years) ? o.years : [o.years]).map((y) => parseInt(y, 10)).filter((y) => y >= 1900 && y <= 2100);
  if (ys.length) out.years = [Math.min(...ys), Math.max(...ys)];
  for (const [k, n, len] of [['people', 3, 50], ['titles', 6, 80], ['words', 5, 30]]) { const v = aiList(o[k], n, len); if (v.length) out[k] = v; }
  if (AI_SPORTS.includes(low(o.sport))) out.sport = low(o.sport);
  if (AI_WHEN_IT[low(o.when)]) out.when = AI_WHEN_IT[low(o.when)];
  if (o.kids === true || low(o.kids) === 'true') out.kids = true;
  return Object.keys(out).length ? out : null;
}
/** proposte per «Cosa guardo stasera?» preparate dalla app: solo titolo, tipo, anno, genere, canale, orario e un indizio.
    Stessa posizione dell'elenco della app (null = proposta non valida), così le scelte tornano con i suoi indici */
function aiCands(v) {
  return (Array.isArray(v) ? v.slice(0, 24) : []).map((c) => {
    if (!c || typeof c !== 'object') return null;
    const t = nameClean(c.t, 80); if (t.length < 2) return null;
    return { k: ['film', 'serie', 'tv', 'sport'].includes(c.k) ? c.k : 'film', t, y: parseInt(c.y, 10) || 0, g: nameClean(c.g, 50), c: nameClean(c.c, 40), h: /^\d{1,2}:\d{2}$/.test(String(c.h || '')) ? c.h : '', w: nameClean(c.w, 70) };
  });
}
const AI_K_IT = { film: 'Film', serie: 'Serie TV', tv: 'In TV', sport: 'Sport in TV' };
async function playerAi(req, env, ip, ctx) {
  if (await limited(env.RL_DEVICE, 'ai:' + ip)) return json({ error: 'Troppe richieste' }, 429);
  let b;
  try { b = await readJSON(req, 16384); } catch (e) { return json({ error: e.message }, e.status || 400); }
  const [d, bad] = await deviceAuth(env, b);
  if (bad) return bad;
  if (!env.GEMINI_API_KEY && !env.ANTHROPIC_API_KEY) return json({ off: true });
  if ((await getSettings(env)).aiOff) return json({ off: true });
  const [P] = await activeAccount(env, d);
  if (!P) return json({ error: 'Abbonamento non attivo' }, 403);
  if (permsParse(P.perms).ai === false) return json({ error: 'Assistente non attivo su questo abbonamento' }, 403);
  const set = await getSettings(env), limit = aiLimitOf(P, set);
  if (limit === 0 && !(+P.ai_extra > 0)) return json({ error: 'Assistente non attivo su questo abbonamento' }, 403);
  const eng = aiEngineOf(set, P, d, appFrom(req, b) || appOfVer('', d.app));
  if (eng === 'off') return json({ off: true }); // spento dal Controllo remoto (profilo dell'app)
  // domanda della modalità scelta: prima si controlla che sia valida, poi si usa una domanda del giorno
  const mode = ['search', 'tonight'].includes(b.mode) ? b.mode : 'ask', v2 = mode === 'ask' && +b.v >= 2;
  const q = nameClean(b.q, 200), c = b.ctx && typeof b.ctx === 'object' ? b.ctx : {};
  let text = '', o = {}, cands = [];
  if (mode === 'tonight') {
    cands = aiCands(b.cands);
    if (cands.filter(Boolean).length < 3) return json({ error: 'Servono almeno 3 proposte' }, 400);
    const taste = aiList(b.taste, 5, 24), hm = /^\d{2}:\d{2}$/.test(String(b.hm || '')) ? b.hm : '';
    text = [`Gusti: ${taste.join(', ') || 'non noti'}`, hm ? `Ora: ${hm}` : '', b.kids === true ? 'Profilo bambini: proponi solo cose adatte ai bambini.' : '', q ? `Richiesta: ${q}` : '', 'Proposte:',
      ...cands.map((x, i) => (x ? `${i + 1}. ${AI_K_IT[x.k]} «${x.t}»${x.y ? ` (${x.y})` : ''}${x.h ? ` alle ${x.h}` : ''}${x.c ? ` su ${x.c}` : ''}${x.g ? ` · ${x.g}` : ''}${x.w ? ` · ${x.w}` : ''}` : ''))].filter(Boolean).join('\n');
    o = { system: AI_SYS_TONIGHT, json: true, max: 500, temp: 0.7, ms: 15000 };
  } else {
    if (q.length < 2) return json({ error: 'Scrivi una domanda' }, 400);
    if (mode === 'search') { text = `Richiesta: ${q}`; o = { system: AI_SYS_FIND, json: true, max: 300, temp: 0.2, ms: 12000 }; }
    else {
      const info = c.title || c.ch ? [
        c.kind === 'live' ? `Canale TV: ${nameClean(c.ch, 80)}` : '', `Titolo: ${nameClean(c.title, 120)}`,
        `Tipo: ${c.kind === 'series' ? 'serie TV' : c.kind === 'live' ? 'programma in diretta' : 'film'}`,
        c.year ? `Anno: ${str(String(c.year), 8)}` : '', c.genre ? `Generi: ${nameClean(c.genre, 100)}` : '', c.cast ? `Cast: ${nameClean(c.cast, 200)}` : '',
        c.plot ? `Trama dalla playlist: ${nameClean(c.plot, 600)}` : '',
      ].filter(Boolean).join('\n') : '';
      text = v2 ? `${info ? info + '\n\n' : 'Domanda libera (nessun titolo aperto).\n\n'}Domanda: ${q}` : `${info}\n\nDomanda: ${q}`;
      if (v2) o = { system: AI_SYS_ASK, json: true, max: 500, ms: 15000 };
    }
  }
  // la domanda si prenota subito con un contatore atomico (prima si leggeva il conteggio e si aggiungeva 1 solo dopo la
  // risposta: tante richieste insieme superavano tutte il limite del giorno). Oltre il limite serve una domanda extra;
  // se l'IA non risponde la prenotazione (e l'extra) tornano indietro
  const day = utcDay();
  const n = +((await env.DB.prepare('INSERT INTO ai_usage (day, device_id, n) VALUES (?, ?, 1) ON CONFLICT(day, device_id) DO UPDATE SET n = n + 1 RETURNING n').bind(day, P.id).first()) || { n: 1 }).n;
  const unbook = () => env.DB.prepare('UPDATE ai_usage SET n = MAX(n - 1, 0) WHERE day = ? AND device_id = ?').bind(day, P.id).run();
  let extra = false;
  if (n > limit) {
    const r = await env.DB.prepare('UPDATE devices SET ai_extra = ai_extra - 1 WHERE id = ? AND ai_extra > 0').bind(P.id).run();
    if (!r.meta || r.meta.changes !== 1) { await unbook(); return json({ error: `Hai usato le ${limit} domande di oggi: riprendono domani.`, limit: true, used: n - 1, max: limit }, 429); }
    extra = true;
  }
  const back = async () => { await unbook(); if (extra) await env.DB.prepare('UPDATE devices SET ai_extra = ai_extra + 1 WHERE id = ?').bind(P.id).run(); };
  const left = () => Math.max(0, limit - n) + Math.max(0, +P.ai_extra - (extra ? 1 : 0));
  // risposta dell'IA → quello che serve alla app (criteri, proposte o risposta con i titoli da cercare nella libreria)
  const shape = (answer) => {
    if (mode === 'search') { const j = aiJson(answer); return { find: aiFindClean(j), label: j ? nameClean(j.label, 60) : '' }; }
    if (mode === 'tonight') {
      const j = aiJson(answer), picks = [], seen = new Set();
      for (const p of j && Array.isArray(j.picks) ? j.picks : []) {
        const i = parseInt(p && p.i, 10) - 1; if (!(i >= 0 && i < cands.length) || !cands[i] || seen.has(i)) continue;
        seen.add(i); picks.push({ i, why: nameClean(String((p && p.why) || ''), 90) }); if (picks.length >= 5) break;
      }
      return { picks };
    }
    if (!v2) return { answer: (answer || 'Non ho una risposta per questa domanda.').slice(0, 2000) };
    const j = aiJson(answer);
    if (j && typeof j.answer === 'string') return { answer: j.answer.trim().slice(0, 1200) || 'Non ho una risposta per questa domanda.', titles: aiList(j.titles, 8, 80), find: aiFindClean(j.find) };
    // niente JSON valido: si usa il testo (senza parentesi e chiavi, se è un JSON rotto)
    const m = /"answer"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(answer || ''); let t = m ? m[1].replace(/\\n/g, ' ').replace(/\\"/g, '"') : String(answer || '');
    if (!m && /^\s*[{[]/.test(t)) t = '';
    return { answer: t.trim().slice(0, 1200) || 'Non ho una risposta per questa domanda.', titles: [], find: null };
  };
  const ok = (answer, f, tin, tout) => { ctx.waitUntil(aiCount(env, P.id, f, tin, tout, day)); return json({ ...shape(answer), left: left(), by: AI_NAMES[f] }); };
  for (const prov of [eng, ...AI_PROVIDERS.filter((x) => x !== eng)]) {
    if (prov === 'claude' && env.ANTHROPIC_API_KEY) {
      let r = null;
      try { r = await claudeAsk(env, set.aiClaude, text, o); } catch {}
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
        try { r = await geminiAsk(env, model, text, think, o); } catch { last = 502; continue; }
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
  if (await throttled(env, 'rqi:' + P.id, 5, 86400e3)) return json({ error: 'Hai già chiesto più volte oggi: aspetta la risposta' }, 429);
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
      settings: { aiDaily: set.aiDaily ?? 20, aiProvider: aiProvOf(set), aiClaude: AI_CLAUDE_MODELS[set.aiClaude] ? set.aiClaude : 'haiku', aiGemini: AI_GEMINI_MODELS[set.aiGemini] ? set.aiGemini : 'flash', proAi: rcProfiles(set).tv.ai || '' },
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
        .map((x) => ({ t: String(x.title || x.name || '').slice(0, 120), o: String(x.original_title || x.original_name || '').slice(0, 120), y: +String(x.release_date || x.first_air_date || '').slice(0, 4) || 0, k: x.media_type === 'tv' ? 'series' : 'movie', g: (Array.isArray(x.genre_ids) ? x.genre_ids : []).filter((n) => Number.isInteger(n)).slice(0, 4) }));
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
const trailerLangOf = (s) => (s && s.trailerLang === 'en' ? 'en' : 'it');
/* 1) TMDB (se c'è la chiave): trailer ufficiale su YouTube, prima in italiano ([en]: prima in inglese) */
async function trailerTmdb(env, title, year, kind, en = false) {
  const k = String(env.TMDB_KEY).trim(), bearer = k.length > 40, t = kind === 'series' ? 'tv' : 'movie';
  const H = { Accept: 'application/json', ...(bearer ? { Authorization: 'Bearer ' + k } : {}) }, ak = bearer ? '' : '&api_key=' + encodeURIComponent(k);
  const get = async (u) => { const r = await fetch('https://api.themoviedb.org/3' + u + ak, { headers: H, signal: AbortSignal.timeout(7000) }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); };
  const yq = year ? (t === 'tv' ? '&first_air_date_year=' : '&year=') + year : '';
  let res = (await get(`/search/${t}?query=${encodeURIComponent(title)}&language=it-IT${yq}`)).results || [];
  if (!res.length && yq) res = (await get(`/search/${t}?query=${encodeURIComponent(title)}&language=it-IT`)).results || [];
  const hit = res[0]; if (!hit) return null;
  const pick = (v) => { const yt = (v.results || []).filter((x) => x.site === 'YouTube' && /^[\w-]{11}$/.test(x.key)); return yt.find((x) => x.type === 'Trailer' && x.official) || yt.find((x) => x.type === 'Trailer') || yt.find((x) => x.type === 'Teaser') || null; };
  const [l1, l2] = en ? ['en-US', 'it-IT'] : ['it-IT', 'en-US'];
  const v = pick(await get(`/${t}/${hit.id}/videos?language=${l1}`)) || pick(await get(`/${t}/${hit.id}/videos?language=${l2}`));
  return v ? { yt: v.key, title: hit.title || hit.name || title, src: 'tmdb' } : null;
}
/* 2) YouTube: primo video della ricerca "titolo anno trailer ita" (nessuna chiave); [en]: "official trailer", risultati in inglese */
async function trailerYoutube(title, year, kind, want, en = false) {
  const q = en ? `${title}${year ? ' ' + year : ''} ${kind === 'series' ? 'tv series ' : ''}official trailer` : `${title}${year ? ' ' + year : ''} ${kind === 'series' ? 'serie tv ' : ''}trailer ita`;
  const r = await fetch(`https://www.youtube.com/results?${en ? 'hl=en&gl=US' : 'hl=it&gl=IT'}&search_query=` + encodeURIComponent(q), {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36', 'Accept-Language': en ? 'en-US,en;q=0.9' : 'it-IT,it;q=0.9', Cookie: 'CONSENT=YES+cb.20240101-00-p0.it+FX+100; SOCS=CAI' },
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const html = await r.text();
  const found = [];
  const re = /"videoRenderer":\{"videoId":"([\w-]{11})"[\s\S]{0,1500}?"title":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"/g;
  let m; while ((m = re.exec(html)) && found.length < 8) { let tt = m[2]; try { tt = JSON.parse('"' + tt + '"'); } catch {} found.push({ id: m[1], t: tt }); }
  if (!found.length) { const ids = [...html.matchAll(/"videoId":"([\w-]{11})"/g)].map((x) => x[1]); if (!ids.length) throw new Error('nessun risultato'); return { yt: ids[0], title, src: 'youtube' }; }
  const words = want.split(' ').filter((w) => w.length > 2);
  // in inglese: «official» vale un punto, un trailer dichiarato italiano ne perde due
  const score = (v) => { const n = normT(v.t), ita = /\bita\b|italiano|\bsub ?ita\b/i.test(v.t); return words.filter((w) => n.includes(w)).length * 3 + (/trailer|teaser/i.test(v.t) ? 2 : 0) + (en ? (/official/i.test(v.t) ? 1 : 0) - (ita ? 2 : 0) : /\bita|italiano\b/i.test(v.t) ? 1 : 0); };
  const best = found.map((v, i) => ({ ...v, s: score(v) - i * 0.3 })).sort((a, b) => b.s - a.s)[0];
  return { yt: best.id, title: best.t, src: 'youtube' };
}
/* 3) Apple: anteprima video ufficiale (file diretto, si guarda nel lettore dell'app).
   12 novembre 2026: la ricerca di Apple con «media=movie» non restituisce più niente (provato: 0 risultati per qualsiasi
   titolo, in Italia e negli Stati Uniti); senza filtro i film arrivano, in mezzo ad audiolibri e podcast, e si tengono solo
   quelli («feature-movie»). Le serie non hanno un trailer (solo l'anteprima di un episodio): non si cercano più.
   Il catalogo è ridotto: su 12 film famosi cercati con il titolo inglese ne ha trovati 4. Senza filtro serve più rigore:
   vale solo il titolo uguale, con l'anno uguale o vicino («Oppenheimer: The Real Story», stesso anno, non è «Oppenheimer»).
   [en]: prima il catalogo americano. */
async function trailerItunes(title, year, kind, want, en = false) {
  if (kind === 'series') return null;
  let best = null, ok = false;
  for (const country of en ? ['us', 'gb'] : ['it', 'us']) {
    const r = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(title)}&country=${country}&limit=50`, { headers: { 'User-Agent': 'KairosPanel' }, signal: AbortSignal.timeout(7000) }).catch(() => null);
    if (!r || !r.ok) continue;
    ok = true;
    const j = await r.json().catch(() => ({}));
    for (const x of j.results || []) {
      if (x.kind !== 'feature-movie' || !x.previewUrl || !/^https:\/\//.test(x.previewUrl)) continue;
      const name = normT(x.trackName);
      const y = parseInt(String(x.releaseDate || '').slice(0, 4), 10) || 0, same = !!(year && y && y === year), far = !!(year && y && Math.abs(y - year) > 1);
      const score = far || name !== want ? 0 : same ? 14 : 10;
      if (score && (!best || score > best.score)) best = { score, url: x.previewUrl, title: x.trackName || '' };
    }
    if (best) break;
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
/** Elenco Clienti del titolare (12 novembre 2026): per chi è collegato adesso, cosa guarda, da dove e con che rete.
    Solo i collegati (pochi), una lettura sola; agli agenti non arriva (come «Online nelle app», riservata al titolare) */
/** DNS cifrato come lo ha dichiarato l'app all'ultimo battito (ultimi 30 giorni), anche per chi adesso non è collegato:
    nell'elenco Clienti del titolare compare accanto al dispositivo. Solo le righe che lo dichiarano; agli agenti non arriva */
async function presenceSdns(env) {
  try { return new Map((((await env.DB.prepare('SELECT device_id, sdns, ver FROM presence WHERE t > ?').bind(now() - 30 * 864e5).all()).results) || []).map((r) => [r.device_id, { sdns: String(r.sdns || ''), ver: String(r.ver || '') }])); }
  catch { return new Map(); } // colonna «sdns» non ancora creata
}
/** il pannello vuole il DNS cifrato acceso su un dispositivo? (13 novembre 2026) Stessa regola di rcEffective per la sola voce
 *  «sdns»: la scelta fatta per il cliente vince sul profilo dell'app (Portal e Smart partono da quello di Kairos XC).
 *  I profili si leggono una volta per tutto l'elenco: rcEffective li rifarebbe per ogni dispositivo */
function sdnsWanted(s) {
  const prof = rcProfiles(s);
  return (d, app) => {
    const a = app || 'tv';
    if (d && d.rc && d.rc !== '{}') {
      const own = rcDevOf(d, a);
      if (hasKey(own, 'sdns') || hasKey(own, 'sdns:allow')) return own.sdns === 'on';
    }
    const p = prof[a] || {}, base = RC_PARENT[a] && !hasKey(p, 'sdns') && !hasKey(p, 'sdns:allow') ? prof[RC_PARENT[a]] || {} : p;
    return base.sdns === 'on';
  };
}
async function presenceNow(env) {
  try {
    const r = (await env.DB.prepare('SELECT device_id, state, title, ch, grp, ip, city, country, home_country, ver, net, vpn, sdns, res, line FROM presence WHERE t > ?').bind(now() - ONLINE_MS).all()).results || [];
    return new Map(r.map((p) => [p.device_id, p]));
  } catch { return new Map(); } // colonna «sdns» non ancora creata: l'elenco resta com'era
}
function withNow(devs, pn) {
  for (const x of devs) {
    const p = pn.get(x.id); if (!p || !x.live) continue;
    const o = { k: STATES.includes(p.state) ? p.state : 'idle' };
    const t = p.state === 'idle' ? '' : String(p.ch || p.title || '').slice(0, 80); if (t) o.t = t;
    if (p.state !== 'idle' && p.title && p.ch && p.title !== p.ch) o.p = String(p.title).slice(0, 80); // programma in onda, se l'app lo manda
    for (const [k, v] of [['ip', p.ip], ['city', p.city], ['cc', p.country], ['ver', p.ver], ['net', p.net], ['vpn', p.vpn], ['sdns', p.sdns], ['res', p.res], ['line', p.line]]) if (v) o[k] = String(v).slice(0, 60);
    if (p.home_country && p.country && p.home_country !== p.country) o.away = 1; // collegato da un paese diverso dal solito
    x.now = o;
  }
  return devs;
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
/** ids: dispositivi da guardare (un agente: i suoi clienti), filtrati nella query come per gli errori delle app */
async function adminRequests(req, env, path, url, who, ip, ids = null) {
  const m = req.method;
  if (path === '/requests' && m === 'GET') {
    const kind = ['content', 'addon', 'ai'].includes(url.searchParams.get('kind')) ? url.searchParams.get('kind') : 'report';
    const rows = ((await env.DB.prepare('SELECT r.id, r.device_id, r.kind, r.ctype, r.title, r.body, r.info, r.status, r.created, r.ip, r.note, d.name, d.code, d.model FROM requests r LEFT JOIN devices d ON d.id = r.device_id WHERE r.kind = ?' + (ids ? ' AND r.device_id IN (SELECT value FROM json_each(?))' : '') + ' ORDER BY r.id DESC LIMIT 300').bind(kind, ...(ids ? [JSON.stringify([...ids])] : [])).all()).results) || [];
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
  const rows = ((await env.DB.prepare("SELECT id, playlists, owner_id FROM devices WHERE playlists <> '' LIMIT 5000").all()).results) || [];
  const map = new Map();
  for (const d of rows) {
    const pls = await unseal(env, d.playlists).catch(() => []);
    const seen = new Set();
    for (const p of pls) {
      if (p.type !== 'xtream' || !p.host || !p.username) continue;
      const host = hostOf(p); if (!host) continue;
      const key = (await sha256(`src:${host}|${p.username}|${p.password}`)).slice(0, 16);
      if (seen.has(key)) continue; seen.add(key);
      const owner = +d.owner_id || 0;
      const e = map.get(key) || { key, host, user: p.username, pass: p.password, devices: 0, owners: new Set(), ownerDevices: new Map() };
      e.devices++; e.owners.add(owner); e.ownerDevices.set(owner, (e.ownerDevices.get(owner) || 0) + 1); map.set(key, e);
    }
  }
  srcMem = { t: now(), map };
  return map;
}
const catMem = new Map(); // piccola cache in memoria (su workers.dev la cache di Cloudflare non è disponibile)
async function cachedJson(key, loader, ttl = CAT_TTL, fresh = false) {
  const m = !fresh && catMem.get(key);
  if (m && now() - m.t < ttl) return m.v;
  const ck = new Request('https://kairos-cache.invalid/' + key);
  let cache = null; try { cache = typeof caches !== 'undefined' && caches.default ? caches.default : null; } catch {}
  if (cache && !fresh) { try { const r = await cache.match(ck); if (r) { const v = await r.json(); catMem.set(key, { t: now(), v }); return v; } } catch {} }
  const v = await loader();
  if (catMem.size > 6) catMem.delete(catMem.keys().next().value);
  catMem.set(key, { t: now(), v });
  if (cache) { try { await cache.put(ck, new Response(JSON.stringify(v), { headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${ttl / 1000}` } })); } catch {} }
  return v;
}
async function catalogHosts(env, src) {
  const saved = await dnsList(env), main = saved.find((x) => hostKey(x.host) === hostKey(src.host));
  const byId = new Map(saved.map((x) => [x.id, x])), hosts = [src.host], seen = new Set([hostKey(src.host)]);
  for (const id of (main && main.alts) || []) {
    const alt = byId.get(id), key = hostKey(alt && alt.host);
    if (!key || seen.has(key)) continue;
    seen.add(key); hosts.push(alt.host);
    if (hosts.length === 5) break;
  }
  return hosts;
}
async function catalogWithFallback(env, src, get) {
  let last;
  for (const host of await catalogHosts(env, src)) {
    try { return await get(host); }
    catch (e) {
      last = e;
      if (e instanceof HttpErr && Number.isInteger(e.upstreamStatus) && e.upstreamStatus >= 100 && e.upstreamStatus <= 599) throw e;
    }
  }
  throw last;
}
async function xtreamGet(src, action, host = src.host) {
  const u = `${host}/player_api.php?username=${encodeURIComponent(src.user)}&password=${encodeURIComponent(src.pass)}&action=${action}`;
  const timeout = /^(?:get_[a-z]+_categories|get_[a-z]+_streams|get_series)$/.test(action) ? 45000 : 20000;
  const r = await fetch(u, { headers: { 'User-Agent': CAT_UA, Accept: 'application/json' }, signal: tmo(timeout), redirect: 'follow' });
  if (!r.ok) { const e = new HttpErr(502, `Il server ha risposto ${r.status}`); e.upstreamStatus = r.status; throw e; }
  const txt = await r.text();
  if (txt.length > 40 * 1024 * 1024) throw new HttpErr(502, 'Catalogo troppo grande');
  let j; try { j = JSON.parse(txt); } catch { throw new HttpErr(502, 'Il server non ha restituito un catalogo valido'); }
  return Array.isArray(j) ? j : j && typeof j === 'object' ? Object.values(j) : [];
}
/** catalogo normalizzato e già in cache: {cats:[{id,name}], items:[{id,name,year,cat,poster,rating,added}]} */
async function xtreamCatalog(env, src, kind) {
  return cachedJson(`catalog/${src.key}/${kind}`, async () => {
    const ACT = { series: ['get_series_categories', 'get_series'], live: ['get_live_categories', 'get_live_streams'], movies: ['get_vod_categories', 'get_vod_streams'] }[kind] || ['get_vod_categories', 'get_vod_streams'];
    const [cats, items] = await catalogWithFallback(env, src, (host) => Promise.all([xtreamGet(src, ACT[0], host), xtreamGet(src, ACT[1], host)]));
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
async function xtreamInfo(env, src, kind, id) {
  return cachedJson(`catalog/${src.key}/info/${kind}/${id}`, async () => {
    const s = (v, n) => (v === undefined || v === null ? '' : String(v).slice(0, n)), okUrl = (u) => (typeof u === 'string' && /^https?:\/\//i.test(u) ? u.slice(0, 500) : '');
    const people = (v) => s(v, 600).split(/\s*,\s*/).map((x) => x.trim()).filter(Boolean).slice(0, 30);
    const get = async (action, extra, host = src.host) => { const u = `${host}/player_api.php?username=${encodeURIComponent(src.user)}&password=${encodeURIComponent(src.pass)}&action=${action}&${extra}`; const r = await fetch(u, { headers: { 'User-Agent': CAT_UA, Accept: 'application/json' }, signal: tmo(20000), redirect: 'follow' }); if (!r.ok) { const e = new HttpErr(502, `Il server ha risposto ${r.status}`); e.upstreamStatus = r.status; throw e; } const j = await r.json().catch(() => null); if (!j || typeof j !== 'object') throw new HttpErr(502, 'Il server non ha restituito la scheda'); return j; };
    const getAny = (action, extra) => catalogWithFallback(env, src, (host) => get(action, extra, host));
    if (kind === 'live') {
      const j = await getAny('get_short_epg', `stream_id=${encodeURIComponent(id)}&limit=14`);
      const L = Array.isArray(j.epg_listings) ? j.epg_listings : [];
      return { kind, epg: L.map((e) => ({ title: nameClean(b64txt(e.title), 160), desc: b64txt(e.description).slice(0, 1200), start: (+e.start_timestamp || Math.floor(Date.parse(e.start) / 1000) || 0) * 1000, end: (+e.stop_timestamp || Math.floor(Date.parse(e.end) / 1000) || 0) * 1000 })).filter((e) => e.title) };
    }
    if (kind === 'series') {
      const j = await getAny('get_series_info', `series_id=${encodeURIComponent(id)}`), I = j.info || {};
      const eps = j.episodes && typeof j.episodes === 'object' ? (Array.isArray(j.episodes) ? j.episodes.flat() : Object.values(j.episodes).flat()) : [];
      const seasons = new Map();
      for (const e of eps) { if (!e || typeof e !== 'object') continue; const sn = +e.season || 0, inf = e.info || {}; if (!seasons.has(sn)) seasons.set(sn, []); seasons.get(sn).push({ id: s(e.id, 20), num: +e.episode_num || 0, title: nameClean(e.title, 160), plot: s(inf.plot, 800), duration: s(inf.duration, 12), date: s(inf.releasedate || inf.release_date, 10), image: okUrl(inf.movie_image), rating: num(inf.rating, 0, 10) }); }
      const meta = Array.isArray(j.seasons) ? j.seasons : [];
      return { kind, title: nameClean(I.name, 160), plot: s(I.plot, 2000), cast: people(I.cast), director: people(I.director), genre: s(I.genre, 120), date: s(I.releaseDate || I.release_date, 10), rating: num(I.rating_5based ? I.rating_5based * 2 : I.rating, 0, 10), poster: okUrl(I.cover), backdrop: okUrl(Array.isArray(I.backdrop_path) ? I.backdrop_path[0] : I.backdrop_path), trailer: s(I.youtube_trailer, 40),
        seasons: [...seasons.entries()].sort((a, b) => a[0] - b[0]).map(([n, list]) => { const m = meta.find((x) => +x.season_number === n) || {}; return { num: n, name: nameClean(m.name, 80) || (n ? 'Stagione ' + n : 'Speciali'), date: s(m.air_date, 10), cover: okUrl(m.cover), episodes: list.sort((a, b) => a.num - b.num).slice(0, 400) }; }) };
    }
    const j = await getAny('get_vod_info', `vod_id=${encodeURIComponent(id)}`), I = j.info || {}, M = j.movie_data || {};
    return { kind: 'movies', title: nameClean(M.name || I.name, 160), plot: s(I.plot || I.description, 2000), cast: people(I.cast || I.actors), director: people(I.director), genre: s(I.genre, 120), date: s(I.releasedate || I.release_date, 10), duration: s(I.duration, 12), rating: num(I.rating_5based ? I.rating_5based * 2 : I.rating, 0, 10), poster: okUrl(I.movie_image || I.cover_big), backdrop: okUrl(Array.isArray(I.backdrop_path) ? I.backdrop_path[0] : I.backdrop_path), trailer: s(I.youtube_trailer, 40), country: s(I.country, 60) };
  });
}
async function catalogCheck(env, srcs, labelOf, fresh = false) {
  const sources = srcs.slice().sort((a, b) => (b.devices || 0) - (a.devices || 0) || a.key.localeCompare(b.key)).slice(0, 150);
  const sourceKeys = sources.map((x) => x.key).sort(), labels = sources.map((x) => `${x.key}:${labelOf(x)}`).sort().join('\n');
  const cacheKey = `catalog/check/${sourceKeys.join(',')}/${await sha256(labels)}`;
  return cachedJson(cacheKey, async () => {
    const agentRows = ((await env.DB.prepare("SELECT id, username FROM admins WHERE role = 'agent'").all()).results) || [];
    const agentNames = new Map(agentRows.map((x) => [+x.id, x.username]));
    const results = new Array(sources.length);
    let next = 0;
    const checkOne = async (src) => {
      let last;
      for (const host of await catalogHosts(env, src)) {
        let r;
        try { r = await fetch(`${host}/player_api.php?username=${encodeURIComponent(src.user)}&password=${encodeURIComponent(src.pass)}`, { headers: { 'User-Agent': CAT_UA, Accept: 'application/json' }, signal: tmo(12000), redirect: 'follow' }); }
        catch (e) { last = e; continue; }
        if (!r.ok) return { status: 'http', code: r.status, exp: 0 };
        let text;
        try { text = await r.text(); } catch (e) { last = e; continue; }
        let data; try { data = JSON.parse(text); } catch { return { status: 'down', exp: 0 }; }
        const info = data && data.user_info, expDate = info ? Number(info.exp_date) : 0;
        const exp = Number.isFinite(expDate) && expDate > 0 ? expDate * 1000 : 0;
        if (!info || +info.auth !== 1) return { status: 'auth', exp };
        const status = String(info.status || '').toLowerCase();
        if (status === 'expired' || (exp && exp < now())) return { status: 'expired', exp };
        return { status: status === 'active' ? 'ok' : 'disabled', exp };
      }
      return { status: last && last.name === 'TimeoutError' ? 'timeout' : 'down', exp: 0 };
    };
    const workers = Array.from({ length: Math.min(6, sources.length) }, async () => {
      while (true) {
        const i = next++;
        if (i >= sources.length) return;
        const src = sources[i], health = await checkOne(src);
        const owners = src.owners instanceof Set ? [...src.owners] : [];
        const agents = [...new Set(owners.map((id) => +id ? agentNames.get(+id) : 'Tu').filter(Boolean))].sort();
        results[i] = { key: src.key, label: labelOf(src), devices: src.devices, agents, ...health };
      }
    });
    await Promise.all(workers);
    return results;
  }, 10 * 60e3, fresh);
}
async function adminCatalogInfo(env, url) {
  const srcs = await catalogSources(env);
  const key = str(url.searchParams.get('src'), 16), src = /^[A-Za-z0-9_-]{16}$/.test(key) ? srcs.get(key) : null;
  if (!src) throw new HttpErr(400, 'Scegli una sorgente');
  const kind = ['series', 'live'].includes(url.searchParams.get('kind')) ? url.searchParams.get('kind') : 'movies', id = str(url.searchParams.get('id'), 20);
  if (!/^[A-Za-z0-9_-]{1,20}$/.test(id)) throw new HttpErr(400, 'Titolo non valido');
  return xtreamInfo(env, src, kind, id);
}
async function adminCatalog(env, url) {
  const srcs = await catalogSources(env);
  const key = str(url.searchParams.get('src'), 16), src = /^[A-Za-z0-9_-]{16}$/.test(key) ? srcs.get(key) : null;
  if (!src) throw new HttpErr(400, 'Scegli una sorgente');
  const kind = ['series', 'live'].includes(url.searchParams.get('kind')) ? url.searchParams.get('kind') : 'movies';
  const q = nameClean(url.searchParams.get('q') || '', 80).toLowerCase(), cat = str(url.searchParams.get('cat'), 20);
  const page = Math.max(1, Math.min(10000, parseInt(url.searchParams.get('page') || '1', 10) || 1));
  const data = await xtreamCatalog(env, src, kind);
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

  // dominio dedicato ai download (variabile DL_HOSTS): solo /get/… e /store/…, mai il pannello né le API (README §34)
  if (dlHost(env, url.hostname)) {
    if (path === '/') return Response.redirect(url.origin + '/store/', 302);
    if (path.startsWith('/get/') || path === '/store' || path.startsWith('/store/')) return cleanLinks(req, env, url, path);
    if (path === '/tv' || path === '/tv/' || path.startsWith('/api/tv/')) return tvPair(req, env, ctx, url, ip, { json, limited, seal, unseal, now, rand, b64url, sha256 });
    return new Response('Non trovato', { status: 404 });
  }

  if (path === '/' || path === '/panel') return Response.redirect(url.origin + '/panel/', 302);

  if (path.startsWith('/api/relay/')) {
    const r = await relayPublic(req, env, path, WOLF_H);
    if (r) return r;
  }
  /* ---------- API app (pubblica) ---------- */
  if (path.startsWith('/api/player/')) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204 });
    if (path === '/api/player/register' && req.method === 'POST') return playerRegister(req, env, ip, ctx);
    if (path === '/api/player/report' && req.method === 'POST') return playerReport(req, env, ip, ctx);
    if (path === '/api/player/profiles' && req.method === 'POST') return playerProfiles(req, env, ip, ctx);
    if (path === '/api/player/linkcode' && req.method === 'POST') return playerLinkCode(req, env, ip, ctx);
    if (path === '/api/player/link' && req.method === 'POST') return playerLink(req, env, ip, ctx);
    if (path === '/api/player/heartbeat' && req.method === 'POST') return playerHeartbeat(req, env, ip, ctx);
    if (path === '/api/player/reach' && req.method === 'POST') return playerReach(req, env);
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
    if (path === '/api/player/news' && req.method === 'GET') {
      if (await limited(env.RL_DEVICE, 'nw:' + ip)) return json({ items: [], src: '', updated: 0 }, 429);
      return json(await news(env, ctx, String(url.searchParams.get('f') || 'ansa').slice(0, 20)));
    }
    if (path === '/api/player/ping' && req.method === 'GET') return json({ ok: true, service: 'kairos', time: now() });
    if (path === '/api/player/events' && req.method === 'GET') {
      if (await limited(env.RL_DEVICE, 'ev:' + ip)) return json({ events: [] }, 429);
      return json(await sportsEvents(env, ctx, url.searchParams.get('v') === '2' ? 2 : 1));
    }
    if (path === '/api/player/update' && req.method === 'GET') {
      if (await limited(env.RL_DEVICE, 'up:' + ip)) return json({ ui: null, apk: null }, 429);
      const s = await getSettings(env);
      // Kairos TV ha la sua interfaccia dentro l'APK (repository kairos-tv): niente interfaccia della Pro e solo il suo APK
      const who = appFrom(req, null), ult = who === 'ult', prem = who === 'prem', ktv = who === 'ktv' || prem, xc = who === 'xc', plus = who === 'plus', nova = who === 'nova';
      // politica degli aggiornamenti del profilo dell'app (solo le due voci pubbliche): serve a Kairos Nova, che non si registra
      const prof = rcProfiles(s)[who] || {}, policy = {}; for (const k of ['bgupd', 'force']) if (prof[k] !== undefined) policy[k] = prof[k];
      const apk = nova ? await novaFeed(env) : plus ? await plusFeed(s, env) : ult ? await ultFeed(s, env) : xc ? await xcFeed(s, env) : prem ? await premFeed(env) : ktv ? await ktvFeed(s, env) : await latestApk(env, s);
      // l'APK si scarica dal pannello (/get/<app>.apk), non da GitHub: le app già installate si aggiornano anche con i repository privati
      const gid = nova ? 'nova' : plus ? 'plus' : ult ? 'ult' : xc ? 'xc' : prem ? 'premium' : ktv ? 'tv' : 'pro';
      const fromLatest = ult ? (s.ultApkUrl || ULT_APK) === ULT_APK : prem || (plus ? (s.plusApkUrl || PLUS_APK) === PLUS_APK : xc ? (s.xcApkUrl || XC_APK) === XC_APK : ktv && (s.ktvApkUrl || KTV_APK) === KTV_APK);
      // l'APK dal dominio dei download (store-k.download), non dal pannello; «mirrors» = i domini di riserva da ricordare
      const dl = dlOrigins(env);
      return json({
        ui: env.UI_VERSION && !ktv && !xc && !ult && !plus && !nova ? { version: env.UI_VERSION, url: '/app/index.html' } : null,
        apk: dlApkLink(dl[0] || url.origin, gid, apk, fromLatest),
        policy,
        ...(dl.length ? { mirrors: dl } : {}),
      }, 200, { 'Cache-Control': 'no-store' });
    }
    return json({ error: 'Non trovato' }, 404);
  }

  /* ---------- Store aperto: conteggio di store e download, compatibilità con gli store vecchi (pubblica, vedi store.js) ---------- */
  if (path === '/api/tg/hook' && req.method === 'POST') return tgHook(req, env, ctx, ip, notifyH(env)); // webhook del bot Telegram
  if (path === '/tv' || path === '/tv/' || path.startsWith('/api/tv/')) return tvPair(req, env, ctx, url, ip, { json, limited, seal, unseal, now, rand, b64url, sha256 });
  if (path.startsWith('/api/store/')) return storeApi(req, env, ctx, url, ip, { sellerName: (id) => sellerNameOf(env, id), info: () => infoPublic(env) });

  /* ---------- informativa privacy e condizioni (pubblica, la apre anche l'app) ---------- */
  if ((path === '/privacy' || path === '/privacy/') && (req.method === 'GET' || req.method === 'HEAD')) return privacyPage(env);

  /* ---------- file OpenVPN dell'app MirkoTeam ospitato da KAIROS (link segreto, vedi Pannello ORCP → VPN) ---------- */
  if (path.startsWith('/ovpn/') && req.method === 'GET') { const r = await ovpnFile(env, path, WOLF_H); if (r) return r; }

  /* ---------- link puliti: APK delle app e pagina dello store serviti da qui (nessun nome nel link) ---------- */
  if (path.startsWith('/get/') || path === '/store' || path.startsWith('/store/')) return cleanLinks(req, env, url, path);

  /* ---------- config pubblica del pannello ---------- */
  if (path === '/api/public/config' && req.method === 'GET') {
    if (!(await verifyAccess(req, env))) return json({ error: 'Accesso negato' }, 403);
    // pk: il pulsante «Entra con impronta o Face ID» (non dall'indirizzo degli agenti)
    let pk = false;
    try { const S = await getSettings(env), host = new URL(req.url).hostname.toLowerCase(); pk = !(S.agentHost && host === S.agentHost) && !!(await env.DB.prepare('SELECT 1 AS x FROM passkeys LIMIT 1').first()); } catch {}
    return json({ turnstileSiteKey: env.TURNSTILE_SITEKEY || '', pk });
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

  /* ---------- file statici: niente percorsi codificati («..%2f», «%2e%2e», «%5c», «\\»). Nessun file vero li usa e non devono
     poter risalire ai file privati di public/privato (temi), che il Worker legge da sé con env.ASSETS ---------- */
  if ((path.startsWith('/app/') || path.startsWith('/panel/')) && /%2e|%2f|%5c|\\/i.test(path)) return new Response('Non trovato', { status: 404 });

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
async function liteFeed(s, env) {
  const apk = s.liteApkUrl || LITE_APK, url = apk.replace(/\.apk(\?.*)?$/i, '.json');
  if (liteMem.k === url && now() - liteMem.t < 10 * 60e3) return liteMem.v;
  let v = null;
  if (/^https:\/\/.+\.json$/i.test(url)) {
    try {
      const r = await relFetch(env, url, { headers: { 'User-Agent': 'KairosPanel' }, signal: AbortSignal.timeout(4000), cf: { cacheTtl: 300, cacheEverything: true } });
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
    Chiavi interne: 'tv' = Kairos Pro (nome storico), 'ktv' = Kairos TV, 'lite' = Kairos Lite, 'xc' = Kairos XC, 'ult' = KAIROS Ultimate
    (Ultimate e XC si riconoscono prima delle app che condividono il prefisso KairosTV) */
const APPS = ['tv', 'lite', 'ktv', 'prem', 'ult', 'xc', 'plus', 'nova', 'portal', 'smart'];
function appFrom(req, b) {
  const ua = req.headers.get('User-Agent') || '', ver = String((b && b.ver) || '');
  if (/KairosUltimate\//i.test(ua) || /^ult\b/i.test(ver)) return 'ult';
  if (/KairosLite\//i.test(ua) || /^lite\b/i.test(ver)) return 'lite';
  if (/KairosPortal\//i.test(ua) || /^portal\b/i.test(ver)) return 'portal'; // Portal e Smart: motore di Kairos XC, ma app a sé per il pannello
  if (/KairosSmart\//i.test(ua) || /^smart\b/i.test(ver)) return 'smart';
  if (/KairosXC\//i.test(ua) || /^xc\b/i.test(ver)) return 'xc';
  if (/KairosPlus\//i.test(ua) || /^plus\b/i.test(ver)) return 'plus'; // Kairos Plus: «KairosPlus/x.y» e versione «plus x.y»
  if (/KairosNova\//i.test(ua) || /^nova\b/i.test(ver)) return 'nova';
  // Kairos Premium (repository kairos-premium): versione «tv x.y premium», user agent «KairosPremium/x.y»
  if (/KairosPremium\//i.test(ua) || /\bpremium\b/i.test(ver)) return 'prem';
  if (/KairosTV\//i.test(ua)) return 'ktv';
  if (/KairosPlayer\//i.test(ua) || ver) return 'tv';
  return '';
}
/** app che si apre (register): Kairos Premium fino alla 1.7.x all'apertura non manda la versione e si presenta come «KairosTV/x.y»,
    quindi risultava Kairos TV e riceveva le impostazioni imposte di Kairos TV (poi, al battito, di nuovo le sue: la modalità leggera
    diversa la faceva riavviare a ogni apertura). Ogni app ha i suoi codici: un dispositivo che i battiti («tv x.y premium») hanno già
    riconosciuto come Premium resta Premium */
function regAppOf(req, b, d) {
  const a = appFrom(req, b), noVer = !String((b && b.ver) || '').trim();
  if (a === 'ktv' && d && d.app === 'prem' && noVer) return 'prem';
  // Kairos STB e Smarters usano il motore di Kairos XC: all'apertura si presentano come «KairosXC/x.y» senza versione, mentre i battiti
  // dicono «portal x.y» / «smart x.y». Prima a ogni apertura tornavano «XC» (pastiglia sbagliata nel pannello e, per un attimo, le
  // impostazioni di XC): una TV già riconosciuta dai battiti come STB o Smarters resta quella (14 novembre 2026)
  if (a === 'xc' && d && (d.app === 'portal' || d.app === 'smart') && noVer) return d.app;
  return a;
}
/** TV nuova che si presenta come XC senza versione: può essere Kairos STB o Smarters (stesso motore). Lo dice l'ultimo download
    dello Store dalla stessa rete (o dallo stesso IP) nelle ultime 48 ore: STB, Smarters o XC. '' = nessun download trovato */
async function storeAppGuess(env, ip) {
  try {
    const net = ipNet(ip);
    const r = await env.DB.prepare("SELECT app, app_url, ip FROM store_requests WHERE created > ? AND uses > 0 AND ip <> '' ORDER BY created DESC LIMIT 150").bind(now() - 48 * 36e5).all();
    const kind = (x) => { const u = String(x.app_url || ''), n = String(x.app || ''); return /\/get\/portal\b/i.test(u) || /\bstb\b/i.test(n) ? 'portal' : /\/get\/smart\b/i.test(u) || /smarters/i.test(n) ? 'smart' : /\/get\/xc\b/i.test(u) || /kairos[- ]?xc\b/i.test(n) ? 'xc' : ''; };
    let sameNet = '';
    for (const x of (r && r.results) || []) {
      const k = kind(x); if (!k) continue;
      if (x.ip === ip) return k;
      if (!sameNet && net && net.includes('/') && ipNet(x.ip) === net) sameNet = k;
    }
    return sameNet;
  } catch { return ''; }
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
    const settings = await getSettings(env);
    d = { id: b64url(rand(9)), code, secret_hash: sh, name: '', model, notes: '', active: 0, expires: '', playlists: '', created_at: now(), last_seen: now(), last_ip: ip, perms: defaultPermsJson(settings) };
    await env.DB.prepare('INSERT INTO devices (id, code, secret_hash, model, created_at, last_seen, last_ip, perms, max_streams) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)')
      .bind(d.id, code, sh, model, d.created_at, d.last_seen, ip, d.perms).run();
    if (!settings.codeOnly) {
      ctx.waitUntil(log(env, 'new', `Nuovo dispositivo in attesa: ${code}${model ? ' (' + model + ')' : ''}`, ip));
      ctx.waitUntil(webhookSend(env, 'device.new', { id: d.id, code, model, ip }));
    }
    ctx.waitUntil(recStamp(env, d.id, ip));
  } else if (!d.secret_hash) {
    // dispositivo creato dal pannello: il primo che si presenta col codice lo "lega" al proprio segreto
    const bound = await env.DB.prepare('UPDATE devices SET secret_hash = ? WHERE id = ? AND secret_hash = ?').bind(sh, d.id, '').run();
    // due app con lo stesso codice nello stesso istante: vince la prima, l'altra non riceve playlist né VPN
    if (!+((bound && bound.meta && bound.meta.changes) || 0)) { const cur = await env.DB.prepare('SELECT secret_hash FROM devices WHERE id = ?').bind(d.id).first(); if (!cur || !safeEq(cur.secret_hash || '', sh)) return json({ status: 'locked' }, 403); }
    d.secret_hash = sh;
    ctx.waitUntil(log(env, 'edit', `Dispositivo collegato: ${d.name || code}`, ip));
  } else if (!safeEq(d.secret_hash, sh)) {
    ctx.waitUntil(log(env, 'off', `Tentativo con codice già in uso: ${code}`, ip));
    return json({ status: 'locked' }, 403);
  }
  if (!+d.active && !d.parent && !(+d.rec_t)) ctx.waitUntil(recStamp(env, d.id, ip)); // in attesa e non ancora segnato: chi l'ha scaricata

  ctx.waitUntil(env.DB.prepare('UPDATE devices SET last_seen = ?, last_ip = ?, model = CASE WHEN ? <> \'\' THEN ? ELSE model END WHERE id = ?')
    .bind(now(), ip, model, model, d.id).run());
  let regApp = regAppOf(req, b, d);
  // prima volta che questa TV si presenta, come XC e senza versione: l'app vera (STB, Smarters o XC) la dice il download dello Store
  if (regApp === 'xc' && !d.app && !String(b.ver || '').trim()) { const g = await storeAppGuess(env, ip); if (g) regApp = g; }
  // KAIROS HEAVY all'apertura non manda la versione: si usa quella dell'ultimo battito, così riceve subito le sue voci (prima, per un
  // attimo, quelle della Ultimate)
  let regVer = String(b.ver || '');
  if (!regVer && regApp === 'ult') { try { const pv = await env.DB.prepare('SELECT ver FROM presence WHERE device_id = ?').bind(d.id).first(); regVer = String((pv && pv.ver) || ''); } catch {} }
  { const app = regApp; if (app && d.app !== app) { d.app = app; ctx.waitUntil(env.DB.prepare('UPDATE devices SET app = ? WHERE id = ?').bind(app, d.id).run()); } }
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
  const eff = rcEffective(s, d, regApp || appOfVer('', d.app), true, /^heavy\b/i.test(regVer));
  const out = { status, ...(status === 'maintenance' ? { maintMsg: maintMsgFor(s, P) } : {}), name: P ? P.name : '', expires: P ? P.expires : '', settings: publicSettings(s), playlists: status === 'active' ? await portalsOf(env, pls, d.app, rcDevOf(d)['u.dnsRot']) : [], messages: await msgP, rc: eff.rc, rcv: eff.rcv };
  if (status === 'active') {
    [out.account, out.vpn, out.af] = await Promise.all([accountOf(env, P, d, pls, C), vpnOf(env, P, d), acctFp(P)]);
    out.perms = permsOf(P); // i collegati ereditano i permessi del principale
    if (aiEngineOf(s, P, d, regApp || appOfVer('', d.app)) === 'off') out.perms.ai = false; // assistente spento dal pannello (per tutti, dal profilo dell'app o per il cliente)
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
  const s = await env.DB.prepare('SELECT s.id, s.expires, s.created_at, a.id AS admin_id, a.username, a.totp_on, a.role, a.active, a.last_seen FROM sessions s JOIN admins a ON a.id = s.admin_id WHERE s.id = ?').bind(id).first();
  if (!s || s.expires < now()) return null;
  return s;
}
const setCookie = (tok, maxAge) => `${COOKIE}=${tok}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`;

/* ---------------- Accesso degli agenti (11 novembre 2026, Impostazioni → Sicurezza e account) ----------------
   Tre regole che il titolare accende quando vuole (spente di serie), solo per agenti e sotto-agenti: mai per il titolare
   né per la sua «Entra per assistenza».
   - week: l'accesso dura 7 giorni da quando l'agente è entrato, poi rientra con link e codice (o utente e password);
   - two: al massimo 2 dispositivi per agente; al terzo accesso si chiude la sessione entrata per prima;
   - geo: accesso e lavoro solo dai Paesi scelti (cc, di serie l'Italia), dal Paese che Cloudflare vede per la connessione;
   - tg: avviso su Telegram al titolare quando un agente con link/password giusti viene fermato dall'estero, viene scollegato
     perché lavora da un altro Paese o entra da un terzo dispositivo;
   - tfa: verifica in due passaggi obbligatoria: finché non la attiva l'agente può solo attivarla (e uscire).
   Una sessione chiusa per una regola lascia il motivo in ses_out (8 giorni): il dispositivo scollegato lo mostra all'agente.
   Il titolare vede e scollega i dispositivi di ogni agente (Agenti → Link accesso). */
const AG_WEEK = 7 * 864e5, AG_MAXDEV = 2, SES_OUT_KEEP = 8 * 864e5;
const CC_RE = /^[A-Z]{2}$/;
function agSecNorm(x) {
  x = x && typeof x === 'object' ? x : {};
  const cc = [...new Set((Array.isArray(x.cc) ? x.cc : []).map((c) => String(c || '').toUpperCase()).filter((c) => CC_RE.test(c)))].slice(0, 60);
  return { week: x.week === true, two: x.two === true, geo: x.geo === true, cc: cc.length ? cc : ['IT'], tg: x.tg === true, tfa: x.tfa === true };
}
/** Paese della connessione visto da Cloudflare (fuori da Cloudflare, nelle prove, dall'intestazione CF-IPCountry) */
const countryOf = (req) => String((req.cf ? req.cf.country : req.headers.get('CF-IPCountry')) || '').toUpperCase().slice(0, 2);
const CC_IT = { IT: 'Italia', SM: 'San Marino', VA: 'Città del Vaticano', CH: 'Svizzera', FR: 'Francia', DE: 'Germania', AT: 'Austria', ES: 'Spagna', PT: 'Portogallo', GB: 'Regno Unito', IE: 'Irlanda', BE: 'Belgio', NL: 'Paesi Bassi', LU: 'Lussemburgo', MC: 'Monaco', AD: 'Andorra', LI: 'Liechtenstein', DK: 'Danimarca', SE: 'Svezia', NO: 'Norvegia', FI: 'Finlandia', IS: 'Islanda', PL: 'Polonia', CZ: 'Cechia', SK: 'Slovacchia', HU: 'Ungheria', SI: 'Slovenia', HR: 'Croazia', BA: 'Bosnia ed Erzegovina', RS: 'Serbia', ME: 'Montenegro', MK: 'Macedonia del Nord', AL: 'Albania', XK: 'Kosovo', GR: 'Grecia', MT: 'Malta', CY: 'Cipro', RO: 'Romania', BG: 'Bulgaria', MD: 'Moldavia', UA: 'Ucraina', LT: 'Lituania', LV: 'Lettonia', EE: 'Estonia', TR: 'Turchia', MA: 'Marocco', TN: 'Tunisia', DZ: 'Algeria', EG: 'Egitto', US: 'Stati Uniti', CA: 'Canada', MX: 'Messico', BR: 'Brasile', AR: 'Argentina', AU: 'Australia', AE: 'Emirati Arabi Uniti', CN: 'Cina', IN: 'India', JP: 'Giappone', RU: 'Russia', T1: 'la rete Tor', XX: 'un Paese sconosciuto' };
const ccName = (c) => CC_IT[c] || (c ? c : 'un Paese sconosciuto');
const ccList = (L) => L.map(ccName).join(', ').replace(/, ([^,]*)$/, ' e $1');
// all'agente non si dice quali Paesi sono consentiti (chi ha rubato link e codice saprebbe quale VPN usare)
const geoMsg = (cc) => `Accesso non consentito dal Paese in cui ti trovi (${ccName(cc)}). Se usi una VPN spegnila; se sei all'estero avvisa il titolare.`;
const WEEK_MSG = 'Accesso scaduto: sono passati 7 giorni da quando sei entrato. Rientra con il tuo link e il codice (o con utente e password).';
const KICK_MSG = 'Il titolare ti ha scollegato da questo dispositivo. Se serve, rientra con il tuo link e il codice.';
const TFA_MSG = 'Il titolare chiede la verifica in due passaggi: attivala per continuare.';
const tgEsc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/** «Avvisami su Telegram»: messaggio al titolare (in sottofondo, non rallenta l'accesso) */
function agTg(env, ctx, G, text) {
  if (!G.tg) return;
  const p = notifyOwnersText(env, notifyH(env), text).catch(() => 0);
  if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(p);
}
/** da dove arriva la richiesta, per l'elenco dei dispositivi: «Napoli (IT)» */
const geoOf = (req) => { const cc = countryOf(req), city = req.cf ? str(req.cf.city || '', 40) : ''; return city ? `${city}${cc ? ' (' + cc + ')' : ''}` : cc ? ccName(cc) : ''; };
const TWO_MSG = 'Sei stato scollegato: il tuo account è entrato da un altro dispositivo (al massimo 2). Se non sei stato tu, avvisa subito il titolare.';
const whenIT = (t) => { try { return new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(+t)); } catch { return ''; } };
/** browser e sistema in breve (per il registro): «Chrome su Android», «Safari su iPhone»… */
function uaShort(ua) {
  ua = String(ua || '');
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS X|Macintosh/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : '';
  const br = /Edg\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
  return br && os ? `${br} su ${os}` : br || os || ua.slice(0, 40) || 'dispositivo';
}
/** chiude la sessione di un agente per una regola e ne ricorda il motivo */
async function sesOut(env, id, why, msg) {
  try { await env.DB.batch([env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(id), env.DB.prepare('INSERT OR REPLACE INTO ses_out (id, why, msg, t) VALUES (?, ?, ?, ?)').bind(id, why, msg, now())]); }
  catch { await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(id).run(); }
}
/** motivo per cui la sessione di questo cookie è stata chiusa da una regola (null = scaduta e basta) */
async function sesOutOf(req, env) {
  const tok = cookieOf(req); if (!tok) return null;
  try { return await env.DB.prepare('SELECT why, msg FROM ses_out WHERE id = ? AND t > ?').bind(await sha256('ses:' + tok), now() - SES_OUT_KEEP).first(); } catch { return null; }
}
/** sessioni dell'agente oltre le 2 più recenti: chiuse. Risponde quelle chiuse */
async function agTrim(env, adminId) {
  const R = ((await env.DB.prepare('SELECT id, created_at, ua FROM sessions WHERE admin_id = ? ORDER BY created_at DESC, rowid DESC').bind(adminId).all()).results) || [];
  const out = R.slice(AG_MAXDEV);
  for (const x of out) await sesOut(env, x.id, 'two', TWO_MSG);
  return out;
}
/** accesso di un agente (utente e password o link e codice): rifiutato fuori dai Paesi consentiti */
async function agGeoLogin(req, env, a, ip, ctx) {
  const G = agSecNorm((await getSettings(env)).agSec);
  if (!G.geo) return;
  const cc = countryOf(req);
  if (G.cc.includes(cc)) return;
  await log(env, 'off', `Accesso rifiutato all'agente ${a.username}: collegato da ${ccName(cc)}${CC_RE.test(cc) && CC_IT[cc] ? ' (' + cc + ')' : ''}, consentito solo da ${ccList(G.cc)}`, ip);
  agTg(env, ctx, G, `🚫 <b>Accesso fermato</b>\nL'agente <b>${tgEsc(a.username)}</b> ha provato a entrare da ${tgEsc(ccName(cc))} con il link o la password giusti. Se non è lui, rigenera il suo link e il codice (Agenti → Link accesso).`);
  throw new HttpErr(403, geoMsg(cc), { why: 'geo' });
}
/** dopo l'accesso di un agente: con «Massimo 2 dispositivi» si chiude quello entrato per primo */
async function agTwoAfterLogin(req, env, a, ip, ctx) {
  const G = agSecNorm((await getSettings(env)).agSec);
  if (!G.two) return;
  const out = await agTrim(env, a.id);
  if (!out.length) return;
  const gone = out.map((x) => `quello entrato il ${whenIT(x.created_at)} (${uaShort(x.ua)})`).join(', ');
  await log(env, 'auth', `Agente ${a.username}: entrato da un altro dispositivo (al massimo ${AG_MAXDEV}) · scollegato ${gone}`, ip);
  const here = [uaShort(req.headers.get('User-Agent')), geoOf(req)].filter(Boolean).join(', ');
  agTg(env, ctx, G, `📱 <b>Nuovo dispositivo</b>\nL'agente <b>${tgEsc(a.username)}</b> è entrato da ${tgEsc(here)}; è stato scollegato ${tgEsc(gone)}. Se non è stato lui, rigenera il suo link e il codice (Agenti → Link accesso).`);
}
/* ---------------- Il tuo accesso (titolare, 11 novembre 2026, Impostazioni → Sicurezza e account) ----------------
   - codice di accesso (admins.acc_seal, cifrato; '' = spento): chiesto solo sui dispositivi che il pannello non ricorda;
   - «Ricorda questo dispositivo»: cookie __Host-kxtd (HttpOnly, 90 giorni) e la sua impronta in trusted_devices;
   - avviso su Telegram (admins.acc_tg): accesso da un dispositivo nuovo, codice sbagliato dopo la password giusta,
     passkey aggiunta;
   - impronta o Face ID (passkey, WebAuthn, passkey.js): chiavi pubbliche in passkeys, sfide usa e getta in pk_chal.
   Con la passkey non servono password, codice e 2FA: è già «qualcosa che hai» più impronta o volto. Solo per il titolare. */
const TD_COOKIE = '__Host-kxtd', TD_MS = 90 * 864e5, PK_TTL = 5 * 60e3, PK_MAX = 10;
const tdCookieOf = (req) => (req.headers.get('Cookie') || '').match(/(?:^|;\s*)__Host-kxtd=([A-Za-z0-9_-]{20,80})/)?.[1] || '';
const tdSet = (tok, sec) => `${TD_COOKIE}=${tok}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${sec}`;
const devWhere = (req) => [uaShort(req.headers.get('User-Agent')), geoOf(req)].filter(Boolean).join(', ');
/** dispositivo ricordato per questo titolare (riga di trusted_devices) o null */
async function trustOf(req, env, adminId) {
  const t = tdCookieOf(req);
  if (!t) return null;
  try { return await env.DB.prepare('SELECT * FROM trusted_devices WHERE id = ? AND admin_id = ? AND expires > ?').bind(await sha256('td:' + t), adminId, now()).first(); } catch { return null; }
}
/** ricorda questo dispositivo per 90 giorni: risponde il valore del cookie */
async function trustNew(req, env, adminId) {
  const tok = b64url(rand(32)), t = now();
  await env.DB.prepare('INSERT INTO trusted_devices (id, admin_id, ua, geo, created, used, expires) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(await sha256('td:' + tok), adminId, str(req.headers.get('User-Agent') || '', 200), geoOf(req), t, t, t + TD_MS).run();
  return tok;
}
function ownTg(env, ctx, a, text) {
  if (!a || !+a.acc_tg) return;
  const p = notifyOwnersText(env, notifyH(env), text).catch(() => 0);
  if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(p);
}
/** dopo l'accesso del titolare: dispositivo ricordato (si segna l'uso) o nuovo (registro, avviso, ricordato se chiesto).
 *  Risponde il cookie del dispositivo da aggiungere alla risposta ('' = nessuno) */
async function ownAfterLogin(req, env, a, ip, ctx, trust, remember, how) {
  if (trust) { ctx.waitUntil(env.DB.prepare('UPDATE trusted_devices SET used = ? WHERE id = ?').bind(now(), trust.id).run().catch(() => {})); return ''; }
  const tok = remember ? await trustNew(req, env, a.id) : '', where = devWhere(req);
  await log(env, 'auth', `${a.username}: accesso${how ? ' ' + how : ''} da un dispositivo nuovo (${where})${tok ? ' · ricordato per 90 giorni' : ''}`, ip);
  ownTg(env, ctx, a, `🔐 <b>Accesso al pannello</b>\nIl titolare <b>${tgEsc(a.username)}</b> è entrato${how ? ' ' + tgEsc(how) : ''} da un dispositivo nuovo: ${tgEsc(where)}. Se non eri tu, cambia subito password e codice di accesso (Sicurezza e account).`);
  return tok;
}
const pkUser = async (id) => pkB64((await pkSha(enc.encode('pkuser:' + id))).slice(0, 16));
const pkDec = (s) => { const raw = pkUnb64(s); return { raw, obj: JSON.parse(dec.decode(raw)) }; };
/** sfida usa e getta: si cancella mentre si controlla (una sola volta, entro 5 minuti) */
async function pkTake(env, id, kind, adminId) {
  const t = now();
  const r = await env.DB.prepare(`DELETE FROM pk_chal WHERE id = ? AND kind = ? AND t > ?${kind === 'reg' ? ' AND admin_id = ?' : ''} RETURNING id`).bind(...[str(id, 100), kind, t - PK_TTL, ...(kind === 'reg' ? [adminId] : [])]).first().catch(() => null);
  return !!r;
}
async function pkNewChallenge(env, kind, adminId) {
  const ch = pkB64(rand(32)), t = now();
  await env.DB.batch([env.DB.prepare('DELETE FROM pk_chal WHERE t < ?').bind(t - PK_TTL), env.DB.prepare('INSERT INTO pk_chal (id, admin_id, kind, t) VALUES (?, ?, ?, ?)').bind(ch, adminId || 0, kind, t)]);
  return ch;
}
/** POST /api/admin/passkey/login-options (senza sessione): sfida per «Entra con impronta o Face ID» */
async function pkLoginOptions(req, env, ip) {
  if (await limited(env.RL_LOGIN, 'pko:' + ip)) throw new HttpErr(429, 'Troppi tentativi, attendi un minuto');
  const host = new URL(req.url).hostname.toLowerCase(), S = await getSettings(env);
  if (S.agentHost && host === S.agentHost) throw new HttpErr(403, 'Da questo indirizzo non si entra con impronta o Face ID');
  return json({ challenge: await pkNewChallenge(env, 'auth', 0), rpId: host, timeout: 120000, userVerification: 'required' });
}
/** POST /api/admin/passkey/login: firma della passkey verificata → sessione del titolare (senza password, codice e 2FA) */
async function pkLogin(req, env, ip, ctx) {
  if (await limited(env.RL_LOGIN, 'login:' + ip)) throw new HttpErr(429, 'Troppi tentativi, attendi un minuto');
  const fail = await env.DB.prepare('SELECT * FROM login_fail WHERE ip = ?').bind(ip).first();
  if (fail && fail.until > now()) throw new HttpErr(429, `Accesso bloccato per sicurezza. Riprova tra ${Math.ceil((fail.until - now()) / 60000)} minuti`);
  const b = await readJSON(req, 16384), url = new URL(req.url), host = url.hostname.toLowerCase();
  const bad = async (why) => {
    const c = (fail && fail.until <= now() && now() - fail.updated > 3600e3 ? 0 : (fail ? fail.count : 0)) + 1, until = c >= 5 ? now() + 15 * 60e3 : 0;
    await env.DB.prepare('INSERT INTO login_fail (ip, count, until, updated) VALUES (?, ?, ?, ?) ON CONFLICT(ip) DO UPDATE SET count = excluded.count, until = excluded.until, updated = excluded.updated').bind(ip, until ? 0 : c, until, now()).run();
    await log(env, 'off', `Accesso con impronta o Face ID non riuscito: ${why}${until ? ' — IP bloccato 15 min' : ''}`, ip);
    return new HttpErr(401, 'Impronta o Face ID non riconosciuti: entra con la password');
  };
  const id = str(b.id, 600);
  if (!/^[A-Za-z0-9_-]{16,600}$/.test(id)) throw await bad('credenziale non valida');
  const pk = await env.DB.prepare('SELECT * FROM passkeys WHERE id = ?').bind(id).first();
  if (!pk) throw await bad('passkey sconosciuta');
  let cd, ad, sig;
  try { cd = pkDec(b.clientDataJSON); ad = pkUnb64(b.authenticatorData); sig = pkUnb64(b.signature); } catch { throw await bad('risposta del dispositivo non valida'); }
  if (!(await pkTake(env, cd.obj.challenge, 'auth'))) throw await bad('sfida scaduta o già usata'); // usa e getta, anche se poi qualcosa non va
  if (cd.obj.type !== 'webauthn.get' || cd.obj.origin !== url.origin) throw await bad('origine non valida');
  let A; try { A = pkAuthData(ad); } catch { throw await bad('dati del dispositivo non validi'); }
  if (!pkSame(A.rpIdHash, await pkSha(enc.encode(host)))) throw await bad('indirizzo del pannello diverso');
  if (!A.up || !A.uv) throw await bad('impronta o volto non verificati');
  let key; try { key = JSON.parse(pk.jwk); } catch { throw await bad('chiave salvata non valida'); }
  if (!(await pkVerify(key, +pk.alg, pkCat(ad, await pkSha(cd.raw)), sig))) throw await bad('firma non valida');
  if ((A.count > 0 || +pk.count > 0) && A.count <= +pk.count) throw await bad('contatore della passkey non valido (copia?)');
  const a = await env.DB.prepare('SELECT * FROM admins WHERE id = ?').bind(pk.admin_id).first();
  if (!a || a.role === 'agent') throw await bad('account non valido');
  if (b.userHandle && str(b.userHandle, 200) !== (await pkUser(a.id))) throw await bad('utente diverso');
  const S0 = await getSettings(env);
  if (S0.agentHost && host === S0.agentHost) throw await bad('indirizzo degli agenti');
  await env.DB.prepare('DELETE FROM login_fail WHERE ip = ?').bind(ip).run();
  const old = cookieOf(req);
  if (old) await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(await sha256('ses:' + old)).run();
  const tok = b64url(rand(32));
  await env.DB.prepare('INSERT INTO sessions (id, admin_id, expires, ip, ua, created_at, geo) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(await sha256('ses:' + tok), a.id, now() + SESSION_TTL * 1000, ip, str(req.headers.get('User-Agent') || '', 200), now(), geoOf(req)).run();
  await env.DB.prepare('UPDATE passkeys SET count = ?, used = ? WHERE id = ?').bind(A.count, now(), pk.id).run();
  await log(env, 'auth', `Accesso di ${a.username} con impronta o Face ID (${pk.name || 'passkey'})`, ip);
  const td = await ownAfterLogin(req, env, a, ip, ctx, await trustOf(req, env, a.id), b.remember === true, 'con impronta o Face ID');
  ctx.waitUntil(cleanup(env));
  const res = json({ ok: true, user: a.username, totp: !!a.totp_on, role: 'owner', passkey: true }, 200, { 'Set-Cookie': setCookie(tok, SESSION_TTL) });
  if (td) res.headers.append('Set-Cookie', tdSet(td, TD_MS / 1000));
  return res;
}
/** «Il tuo accesso» (Sicurezza e account): codice, dispositivi ricordati, passkey, avvisi. Solo il titolare */
async function ownSec(req, env, url, path, m, ses, who, ip, ctx) {
  const a = await env.DB.prepare('SELECT * FROM admins WHERE id = ?').bind(ses.admin_id).first();
  if (!a || a.role === 'agent') throw new HttpErr(403, 'Solo il titolare');
  const host = url.hostname.toLowerCase();
  if (path === '/own-sec' && m === 'GET') {
    const here = await trustOf(req, env, a.id);
    const [D, P, T] = await Promise.all([
      env.DB.prepare('SELECT * FROM trusted_devices WHERE admin_id = ? AND expires > ? ORDER BY used DESC').bind(a.id, now()).all(),
      env.DB.prepare('SELECT id, name, created, used FROM passkeys WHERE admin_id = ? ORDER BY created DESC').bind(a.id).all(),
      env.DB.prepare('SELECT tg_chat FROM notify_links WHERE admin_id = ?').bind(a.id).first().catch(() => null),
    ]);
    return json({
      code: { on: !!a.acc_seal, value: a.acc_seal ? String(await unseal(env, a.acc_seal).catch(() => '')) : '' },
      tg: !!+a.acc_tg, tgLinked: !!(T && T.tg_chat), days: TD_MS / 864e5, here: here ? String(here.id).slice(0, 16) : '',
      devices: ((D && D.results) || []).map((d) => ({ id: String(d.id).slice(0, 16), dev: uaShort(d.ua), where: d.geo || '', created: +d.created, used: +d.used, expires: +d.expires })),
      passkeys: ((P && P.results) || []).map((x) => ({ id: String(x.id).slice(0, 16), name: x.name, created: +x.created, used: +x.used })),
    });
  }
  if (path === '/own-sec' && m === 'PUT') {
    const b = await readJSON(req, 4096);
    let td = '';
    if (b.code !== undefined) {
      if (!(await checkPass(str(b.password, 200), a.pass_hash))) throw new HttpErr(400, 'Password attuale errata');
      const c = typeof b.code === 'string' ? b.code.trim() : '';
      if (c && !/^[\x21-\x7e]{6,40}$/.test(c)) throw new HttpErr(400, 'Il codice di accesso va da 6 a 40 caratteri, senza spazi né lettere accentate');
      await env.DB.prepare('UPDATE admins SET acc_seal = ? WHERE id = ?').bind(c ? await seal(env, c) : '', a.id).run();
      await log(env, 'settings', `${who}: Sicurezza — codice di accesso ${c ? (a.acc_seal ? 'cambiato' : 'attivato') : 'spento'}`, ip);
      if (c && !(await trustOf(req, env, a.id))) td = await trustNew(req, env, a.id); // da qui il codice non serve: questo dispositivo resta ricordato
    }
    if (typeof b.tg === 'boolean' && b.tg !== !!+a.acc_tg) {
      await env.DB.prepare('UPDATE admins SET acc_tg = ? WHERE id = ?').bind(b.tg ? 1 : 0, a.id).run();
      await log(env, 'settings', `${who}: Sicurezza — avvisi su Telegram per i tuoi accessi ${b.tg ? 'accesi' : 'spenti'}`, ip);
    }
    const res = json({ ok: true, trusted: !!td });
    if (td) res.headers.append('Set-Cookie', tdSet(td, TD_MS / 1000));
    return res;
  }
  const odm = path.match(/^\/own-sec\/devices(?:\/([A-Za-z0-9_-]{16}))?$/);
  if (odm && m === 'DELETE') {
    const rows = ((await env.DB.prepare('SELECT id FROM trusted_devices WHERE admin_id = ?').bind(a.id).all()).results) || [];
    const del = odm[1] ? rows.filter((r) => String(r.id).slice(0, 16) === odm[1]) : rows;
    if (odm[1] && !del.length) throw new HttpErr(404, 'Dispositivo non trovato');
    const here = await trustOf(req, env, a.id), mine = !!here && del.some((r) => r.id === here.id);
    if (del.length) await env.DB.batch(del.map((r) => env.DB.prepare('DELETE FROM trusted_devices WHERE id = ?').bind(r.id)));
    await log(env, 'settings', `${who}: Sicurezza — ${odm[1] ? 'dimenticato un dispositivo' : `dimenticati tutti i dispositivi (${del.length})`}: lì il codice di accesso servirà di nuovo`, ip);
    return json({ ok: true, n: del.length }, 200, mine ? { 'Set-Cookie': tdSet('', 0) } : {});
  }
  if (path === '/passkey/options' && m === 'POST') {
    const mine = ((await env.DB.prepare('SELECT id FROM passkeys WHERE admin_id = ?').bind(a.id).all()).results) || [];
    if (mine.length >= PK_MAX) throw new HttpErr(400, `Hai già ${PK_MAX} passkey: togline una prima di aggiungerne un'altra`);
    const S = await getSettings(env), brand = `${S.brand || 'Kairos'} Control`;
    return json({
      challenge: await pkNewChallenge(env, 'reg', a.id), rp: { name: brand, id: host },
      user: { id: await pkUser(a.id), name: a.username, displayName: `${a.username} · ${brand}` },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }], timeout: 120000, attestation: 'none',
      authenticatorSelection: { residentKey: 'required', requireResidentKey: true, userVerification: 'required' },
      excludeCredentials: mine.map((x) => ({ type: 'public-key', id: x.id })),
    });
  }
  if (path === '/passkey/register' && m === 'POST') {
    const b = await readJSON(req, 16384);
    let cd, att;
    try { cd = pkDec(b.clientDataJSON); att = pkCbor(pkUnb64(b.attestationObject)).v; } catch { throw new HttpErr(400, 'Risposta del dispositivo non valida'); }
    if (!(await pkTake(env, cd.obj.challenge, 'reg', a.id))) throw new HttpErr(400, 'Tempo scaduto: riprova'); // usa e getta, anche se poi qualcosa non va
    if (cd.obj.type !== 'webauthn.create' || cd.obj.origin !== url.origin) throw new HttpErr(400, 'Origine non valida');
    let A; try { A = pkAuthData(att instanceof Map ? att.get('authData') : null); } catch { throw new HttpErr(400, 'Risposta del dispositivo non valida'); }
    if (!pkSame(A.rpIdHash, await pkSha(enc.encode(host)))) throw new HttpErr(400, 'Indirizzo del pannello diverso');
    if (!A.up || !A.uv || !A.at || !A.credId) throw new HttpErr(400, 'Impronta o volto non verificati: riprova');
    let K; try { K = pkJwk(A.cose); } catch { throw new HttpErr(400, 'Questo dispositivo usa una chiave non supportata'); }
    const id = pkB64(A.credId);
    if (b.id !== undefined && str(b.id, 600) !== id) throw new HttpErr(400, 'Risposta del dispositivo non valida');
    if (await env.DB.prepare('SELECT 1 AS x FROM passkeys WHERE id = ?').bind(id).first()) throw new HttpErr(400, 'Questa passkey c\'è già');
    const name = str(b.name, 60) || devWhere(req) || 'Passkey', t = now();
    await env.DB.prepare('INSERT INTO passkeys (id, admin_id, name, jwk, alg, count, created, used) VALUES (?, ?, ?, ?, ?, ?, ?, 0)').bind(id, a.id, name, JSON.stringify(K.jwk), K.alg, A.count, t).run();
    await log(env, 'settings', `${who}: Sicurezza — aggiunta una passkey (impronta o Face ID): ${name}`, ip);
    ownTg(env, ctx, a, `🔑 <b>Passkey aggiunta</b>\nSul pannello è stata aggiunta una passkey (impronta o Face ID) per <b>${tgEsc(a.username)}</b>: ${tgEsc(name)}. Se non sei stato tu, toglila da Sicurezza e account e cambia la password.`);
    return json({ ok: true, passkey: { id: id.slice(0, 16), name, created: t, used: 0 } });
  }
  const pkm = path.match(/^\/passkey\/([A-Za-z0-9_-]{16})$/);
  if (pkm && m === 'DELETE') {
    const rows = ((await env.DB.prepare('SELECT id, name FROM passkeys WHERE admin_id = ?').bind(a.id).all()).results) || [];
    const x = rows.find((r) => String(r.id).slice(0, 16) === pkm[1]);
    if (!x) throw new HttpErr(404, 'Passkey non trovata');
    await env.DB.prepare('DELETE FROM passkeys WHERE id = ?').bind(x.id).run();
    await log(env, 'settings', `${who}: Sicurezza — tolta la passkey ${x.name || ''}`.trim(), ip);
    return json({ ok: true });
  }
  throw new HttpErr(404, 'Funzione non trovata');
}
/** a ogni richiesta di un agente (non in assistenza): accesso di 7 giorni e Paesi consentiti */
async function agSecCheck(req, env, ses, ip, ctx) {
  const G = agSecNorm((await getSettings(env)).agSec);
  if (G.week && +ses.created_at && now() - +ses.created_at > AG_WEEK) { await sesOut(env, ses.id, 'week', WEEK_MSG); throw new HttpErr(401, WEEK_MSG, { why: 'week' }); }
  if (G.geo) {
    const cc = countryOf(req);
    if (!G.cc.includes(cc)) {
      const msg = geoMsg(cc);
      await sesOut(env, ses.id, 'geo', msg);
      await log(env, 'off', `Agente ${ses.username}: scollegato, collegato da ${ccName(cc)}${CC_IT[cc] && CC_RE.test(cc) ? ' (' + cc + ')' : ''} (consentito solo da ${ccList(G.cc)})`, ip);
      agTg(env, ctx, G, `🚫 <b>Agente scollegato</b>\n<b>${tgEsc(ses.username)}</b> stava lavorando da ${tgEsc(ccName(cc))}, fuori dai Paesi consentiti.`);
      throw new HttpErr(401, msg, { why: 'geo' });
    }
  }
}

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
  if (path === '/passkey/login-options' && m === 'POST') return pkLoginOptions(req, env, ip); // impronta o Face ID (titolare)
  if (path === '/passkey/login' && m === 'POST') return pkLogin(req, env, ip, ctx);

  // la sessione e, nello stesso viaggio, impostazioni e agenti (servono quasi a ogni richiesta del pannello)
  const pre = cookieOf(req) ? Promise.all([cfgRows(env), agentsAll(env)]).catch(() => {}) : null;
  const ses = await getSession(req, env);
  if (!ses) {
    if (path === '/health-check' && m === 'GET') throw new HttpErr(403, 'Il controllo generale è riservato al titolare');
    const out = await sesOutOf(req, env); // chiusa da una regola di «Accesso degli agenti»: l'agente vede perché
    if (out) throw new HttpErr(401, out.msg, { why: out.why });
    throw new HttpErr(401, 'Sessione scaduta');
  }
  if (path.startsWith('/blk/') && (!ses || ses.role === 'agent')) throw new HttpErr(403, 'Solo il titolare può usare il Pannello Black IPTV');
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
const AGENT_FLAGS = ['create', 'renew', 'disable', 'delete', 'kick', 'playlists', 'clientPerms', 'vpn', 'link', 'lineView', 'events', 'account', 'ai',
  'dash', 'online', 'errors', 'reports', 'contentReq', 'addonReq', 'messages', 'store', 'vod', 'activity', 'storeAll', 'subClients', 'maint', 'players', 'payments', 'autoRenew', 'dlcodes', 'stcodes', 'appstore', 'lines', 'appsOp', 'appk', 'armada', 'armadaTrial', 'storm', 'stormTrial', 'wolf', 'mxp', 'oxp', 'oxpNew', 'ro', 'slt', 'atx', 'orcpApp',
  // 14 novembre 2026: pagina «Info» (comunicazioni e guida alle app, accesa di serie) e «Pulizia scadute» (cancellazione in blocco, spenta di serie)
  'info', 'lineClean'];
const ORCP_SERVER_KEYS = ['portal', 'portal2', 'portal3', 'portal4', 'portal5'];
function checkedOrcpServers(value) {
  if (!Array.isArray(value) || value.length > ORCP_SERVER_KEYS.length || value.some((x) => typeof x !== 'string' || !ORCP_SERVER_KEYS.includes(x)) || new Set(value).size !== value.length) {
    throw new HttpErr(400, 'Server MirkoTeam non validi');
  }
  return value;
}
const AGENT_DEF = { create: true, renew: true, disable: true, delete: false, kick: true, playlists: true, clientPerms: false, vpn: false, link: true, lineView: false, events: false, account: false, ai: false,
  dash: true, online: false, errors: false, reports: false, contentReq: false, addonReq: false, messages: false, store: false, vod: false, activity: false,
  storeAll: false, subClients: true, maint: false, players: false, payments: false, autoRenew: false, dlcodes: true, stcodes: false, appstore: false, lines: false, appsOp: false, appk: false, armada: false, armadaTrial: false, armadaCredits: 0, storm: false, stormTrial: false, stormCredits: 0, wolf: false, ro: false, slt: false, atx: false, mxp: false, oxp: false, oxpNew: false, orcpApp: false, info: true, lineClean: false, orcpSrv: [], actApps: [], addons: [], storeApps: ['*'], appsAllow: ['*'], dlcAllow: ['*'], kAllow: ['*'], orbDns: ['*'], mxDns: ['*'], maxConn: 1 };
/** app dello store che l'agente può approvare: ['*'] = tutte */
function storeAppsList(v) {
  if (!Array.isArray(v)) return ['*'];
  const out = [...new Set(v.map((x) => str(x, 80)).filter(Boolean))].slice(0, 100);
  return out.includes('*') ? ['*'] : out;
}
/* app Kairos (link per scaricarle e codice Downloader): quali vede l'agente lo decide il titolare (kAllow) */
const KAIROS_APPS = [['pro', 'Kairos Pro'], ['tv', 'Kairos TV'], ['prem', 'Kairos Premium'], ['lite', 'Kairos Lite'], ['xc', 'Kairos XC'], ['ult', 'KAIROS Ultimate'], ['plus', 'Kairos Plus'], ['nova', 'Kairos Nova'], ['store', 'Kairos Store']];
function kairosAppsOf(s) {
  return [
    ['pro', s.apkUrl || '', s.downloaderCode || ''], ['tv', s.ktvApkUrl || KTV_APK, s.ktvDownloaderCode || ''], ['prem', PREM_APK, s.premDownloaderCode || ''], ['lite', s.liteApkUrl || LITE_APK, s.liteDownloaderCode || ''],
    ['xc', s.xcApkUrl || XC_APK, s.xcDownloaderCode || ''], ['ult', s.ultApkUrl || ULT_APK, s.ultDownloaderCode || ''], ['plus', s.plusApkUrl || PLUS_APK, s.plusDownloaderCode || ''], ['nova', NOVA_APK, s.novaDownloaderCode || ''], ['store', '', s.storeDownloaderCode || ''],
  ].map(([k, apk, code]) => ({ key: k, name: KAIROS_APPS.find((x) => x[0] === k)[1], apk, code }));
}
const storeAppOk = (list, app) => list.includes('*') || list.some((x) => x.toLowerCase() === String(app || '').toLowerCase());
/** DNS che un agente può usare per OrbixPlay (scelti dal titolare per nome) e MaxPlayer (per id del dominio); ['*'] = tutti */
const agOrbList = (s, allow) => (((s.playersCfg || {}).orbix) || []).filter((x) => storeAppOk(Array.isArray(allow) ? allow : ['*'], x.name)).map((x, i) => ({ ...x, name: agentDnsLabel(x.name, i, `DNS ${i + 1}`) }));
const agMxList = (doms, allow) => doms.filter((x) => storeAppOk(Array.isArray(allow) ? allow : ['*'], x.id)).map((x, i) => ({ ...x, label: agentDnsLabel(x.label, i, `DNS ${x.id || i + 1}`) }));
/** «OrbixPlay e MaxPlayer» nel pannello dell'agente: solo i DNS che gli hai concesso (per nome) e i codici cliente
    dei soli fornitori di quei DNS. Uno slot con il link (il DNS del fornitore) si abbina per host; senza link per nome.
    mxAll = domini di MaxPlayer (null se non disponibili: con DNS MaxPlayer limitati gli slot MaxPlayer restano nascosti) */
function agPlayers(env, s, P, mxAll) {
  const c = s.playersCfg || {}, orb = agOrbList(s, P.orbDns);
  const hn = (x) => String(x || '').trim().replace(/^https?:\/\//i, '').split(/[:/]/)[0].toLowerCase(), lc = (x) => String(x || '').trim().toLowerCase();
  const allO = !Array.isArray(P.orbDns) || P.orbDns.includes('*'), allM = !Array.isArray(P.mxDns) || P.mxDns.includes('*');
  const mx = allM ? [] : agMxList(Array.isArray(mxAll) ? mxAll : [], P.mxDns);
  const ok = (x) => {
    const h = hn(x.link), n = lc(x.name);
    if (x.app === 'orbix') return allO || orb.some((d) => (h ? hn(d.host) === h : !!n && lc(d.name).includes(n)));
    return allM || mx.some((d) => (h ? lc(d.domain) === h : !!n && lc(d.label).includes(n)));
  };
  return { orbix: !!env.ORBIX_KEY, max: !!env.MAXPLAYER_KEY, dns: { orbix: orb.map((x) => ({ name: x.name })), max: [] }, showDnsAgents: false,
    codes: c.codes || { orbix: '265847', max: '265847' }, slots: slotsOf(c).filter(ok).map((x, i) => ({ ...x, name: agentDnsLabel(x.name, i), link: '' })) };
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
  p.orcpSrv = Array.isArray(o.orcpSrv) ? [...new Set(o.orcpSrv.filter((x) => typeof x === 'string' && ORCP_SERVER_KEYS.includes(x)))].slice(0, 5) : [];
  p.actApps = Array.isArray(o.actApps) ? [...new Set(o.actApps.filter(validActAppKey))].slice(0, 200) : [];
  // voci del «Controllo remoto» che l'agente può cambiare per i suoi clienti, scelte dal titolare una per una (13 novembre 2026)
  p.rcKeys = Array.isArray(o.rcKeys) ? [...new Set(o.rcKeys.filter((k) => typeof k === 'string' && rcCatAll.has(k) && !RC_PROF_ONLY.has(k)))].slice(0, 200) : [];
  p.ledgerPanels = Array.isArray(o.ledgerPanels) ? [...new Set(o.ledgerPanels.filter((x) => typeof x === 'string' && LEDGER_PANELS.has(x)))] : null;
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
  p.orcpSrv = p.orcpSrv.filter((x) => top.orcpSrv.includes(x));
  p.rcKeys = p.rcKeys.filter((k) => (top.rcKeys || []).includes(k));
  const topActApps = new Set(top.actApps.map(actAppCompact));
  p.actApps = p.actApps.filter((x) => topActApps.has(actAppCompact(x)));
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
  downloaded: (env, d, origin, ip) => notifyDownload(env, d, origin, ip, notifyH(env)),
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
/** agenti spenti con «Disattiva solo agente»: i loro sotto-agenti continuano a lavorare (13 novembre 2026) */
const agSolo = (env) => reqMemo(env, 'agsolo', async () => { try { const r = await env.DB.prepare("SELECT v FROM settings WHERE k = 'agsolo'").first(); return new Set(r ? JSON.parse(r.v) : []); } catch { return new Set(); } });
async function agSoloSet(env, id, on) {
  const cur = await agSolo(env), next = new Set(cur); if (on) next.add(id); else next.delete(id);
  if (next.size === cur.size && [...next].every((x) => cur.has(x))) return;
  await env.DB.prepare("INSERT INTO settings (k, v) VALUES ('agsolo', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(JSON.stringify([...next])).run();
  memoDrop(env, 'agsolo');
}
async function agentChainActive(env, id, all) {
  all = all || (await agentsAll(env));
  const by = new Map(all.map((a) => [a.id, a]));
  const solo = all.some((a) => !a.active) ? await agSolo(env) : null;
  // l'agente stesso spento: fuori sempre; chi sta sopra spento: fuori, tranne se è stato spento «solo lui»
  for (let a = by.get(id), n = 0; a && n < 20; a = by.get(a.parent_id), n++) if (!a.active && (a.id === id || !solo || !solo.has(a.id))) return false;
  return by.has(id);
}
/** nome del server mostrato agli agenti: se il nome è l'indirizzo (DNS salvato senza nome) diventa «Server N» */
const svName = (x, i) => { const n = String((x && x.name) || ''), h = String((x && x.host) || '').replace(/^https?:\/\//, '').replace(/[:/].*$/, ''); return !n || /[.:/]/.test(n) || (h && n.toLowerCase().includes(h.toLowerCase())) ? 'Server ' + (i + 1) : n; };
const serverIds = (v) => [...new Set(String(v || '').split(',').map((x) => x.trim()).filter((x) => /^[A-Za-z0-9_-]{4,20}$/.test(x)))];
function agentCanManage(all, id) {
  const by = new Map(all.map((a) => [a.id, a]));
  for (let a = by.get(id), n = 0; a && n < 20; a = by.get(a.parent_id), n++) if (!a.can_agents) return false;
  return by.has(id);
}
function agentServersWithin(all, id) {
  const by = new Map(all.map((a) => [a.id, a]));
  let a = by.get(id), servers = serverIds(a && a.servers);
  for (let p = a && by.get(a.parent_id), n = 0; p && n < 20; p = by.get(p.parent_id), n++) servers = servers.filter((x) => serverIds(p.servers).includes(x));
  return servers;
}
function agentParent(all, parentId, targetId = 0) {
  const id = Number(parentId);
  if (!Number.isInteger(id) || id < 0) throw new HttpErr(400, 'Agente superiore non valido');
  if (!id) return null;
  const parent = all.find((a) => a.id === id);
  if (!parent || !agentCanManage(all, id)) throw new HttpErr(400, 'Scegli un agente attivo alla gestione di sotto-agenti');
  if (targetId && (id === targetId || agentTree(all, targetId).includes(id))) throw new HttpErr(400, 'Non puoi spostare un agente sotto sé stesso o un suo sotto-agente');
  return parent;
}
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
  // linee spente insieme all'agente («Disattiva agente e le sue linee»): quante tornano attive riattivandolo
  const solo = await agSolo(env);
  const offLines = new Map(), offWith = new Set(); try { for (const r of ((await env.DB.prepare("SELECT k, v FROM settings WHERE k LIKE 'agoff:%'").all()).results) || []) { try { { const j = JSON.parse(r.v); offLines.set(+String(r.k).slice(6), Math.max((j.ids || []).length, j.lines ? 0 : 0)); if (j.lines) offWith.add(+String(r.k).slice(6)); } } catch {} } } catch {}
  const dn = new Map(dns.map((x, i) => [x.id, forAgent ? { ...x, name: svName(x, i) } : x]));
  const svOk = (x) => dn.has(x) && (!lim || lim.has(x));
  const list = all.filter((a) => !onlyIds || onlyIds.includes(a.id));
  return Promise.all(list.map(async (a) => {
    const tree = agentTree(all, a.id), sv = serverIds(a.servers).filter(svOk);
    return { id: a.id, username: a.username, email: a.email, parentId: a.parent_id, maxClients: a.max_clients, canAgents: !!a.can_agents, perms: agentPerms(a.perms),
      servers: sv, serverNames: sv.map((x) => dn.get(x).name),
      active: !!a.active, offLines: offLines.get(a.id) || 0, offWithLines: offWith.has(a.id), offSolo: !a.active && solo.has(a.id), notes: a.notes, lastSeen: a.last_seen, createdAt: a.created_at, totp: !!a.totp_on, password: a.pw_seal ? await unseal(env, a.pw_seal).catch(() => '') : '',
      clients: tree.reduce((n, id) => n + (counts.get(id) || 0), 0), ownClients: counts.get(a.id) || 0, subAgents: tree.length - 1,
      armadaUsed: Math.round(armUsedBy(all, armSp, a.id) * 100) / 100, stormUsed: Math.round(armUsedBy(all, stSp, a.id) * 100) / 100, storeCode: await sellerAgentCode(env, a), storeMax: a.store_max >= 0 ? a.store_max : null, stores: storeCounts.get(a.id) || 0 };
  }));
}
/**
 * Agente spento o riattivato anche sui pannelli esterni dove il suo account sta sotto quello del titolare (13 novembre 2026):
 * WOLF (reseller; spento «con le linee» = disable-client), Atlantix (sub-reseller + blocco/sblocco delle sue linee),
 * Realott (sub-reseller). SLT non lo permette da qui. Ogni pannello è indipendente: un errore non ferma gli altri.
 * [lines] = anche le linee. Risponde un elenco [pannello, esito] da mostrare al titolare.
 */
async function agentExtSync(env, A, off, lines, who, ip) {
  const out = [];
  const call = async (fn, path, method, body, query = '') => {
    const req = new Request('https://kairos.local/admin' + path + query, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const r = await fn(req, env, path, who, ip, WOLF_H, null);
    if (!(r instanceof Response)) return r;
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'HTTP ' + r.status);
    return j;
  };
  const userOf = async (k) => { try { const r = await env.DB.prepare('SELECT v FROM settings WHERE k = ?').bind(k).first(); const c = r ? await unseal(env, r.v) : null; return c && c.user ? String(c.user) : ''; } catch { return ''; } };
  const same = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
  const rowsOf = (d) => (Array.isArray(d) ? d : d && typeof d === 'object' ? (['rows', 'items', 'subresellers', 'resellers', 'list', 'data'].map((k) => d[k]).find(Array.isArray) || []) : []);
  const isOn = (v) => v === true || v === 1 || v === '1' || /^(active|enabled|attivo|on)$/i.test(String(v || ''));
  // WOLF
  const wu = await userOf('wolf:ag:' + A.id);
  if (wu) {
    try {
      const r = rowsOf((await call(wolfRoutes, '/wolf/resellers', 'GET')).resellers).find((x) => same(x.username, wu));
      if (!r) out.push(['WOLF', `reseller ${wu} non trovato sotto il tuo account`]);
      else {
        // le sue linee su WOLF (dal tuo account si vedono anche quelle dei reseller): quelle attive spente da qui si ricordano
        // («agoffw:<id>») e riattivando l'agente tornano attive una per una (WOLF non ha un «riattiva tutte»)
        const wk = 'agoffw:' + A.id;
        const mine = async () => rowsOf((await call(wolfRoutes, '/wolf/lines', 'GET', null, '?fresh=1')).lines).filter((l) => same(l.owner, wu));
        const toggleLines = async (ls) => { let n = 0; for (const l of ls.slice(0, 150)) { try { await call(wolfRoutes, `/wolf/lines/${l.id}/toggle`, 'POST', {}); n++; } catch {} } return n; };
        let done = '';
        if (off) {
          let had = [];
          if (lines) { had = (await mine()).filter((l) => l.enabled).map((l) => l.id); let prev = []; try { const x = await env.DB.prepare('SELECT v FROM settings WHERE k = ?').bind(wk).first(); prev = x ? JSON.parse(x.v) : []; } catch {} await env.DB.prepare('INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind(wk, JSON.stringify([...new Set([...prev, ...had])])).run(); }
          if (r.enabled) { await call(wolfRoutes, `/wolf/resellers/${r.id}/toggle`, 'POST', { lines: !!(lines && r.tglLines) }); done = 'disattivato'; }
          else done = 'era già disattivato';
          if (lines) { const still = (await mine()).filter((l) => l.enabled); const n = still.length ? await toggleLines(still) : 0; done += ` · ${had.length} linee spente`; }
        } else {
          if (!r.enabled) { await call(wolfRoutes, `/wolf/resellers/${r.id}/toggle`, 'POST', {}); done = 'riattivato'; } else done = 'era già attivo';
          let ids = []; try { const x = await env.DB.prepare('SELECT v FROM settings WHERE k = ?').bind(wk).first(); ids = x ? JSON.parse(x.v) : []; } catch {}
          if (lines && ids.length) {
            const set = new Set(ids.map(String)), back = (await mine()).filter((l) => !l.enabled && set.has(String(l.id)));
            const n = await toggleLines(back);
            done += ` · ${n} linee riattivate`;
            await env.DB.prepare('DELETE FROM settings WHERE k = ?').bind(wk).run();
          }
        }
        out.push(['WOLF', done]);
      }
    } catch (e) { out.push(['WOLF', 'non riuscito: ' + String(e.message || e).slice(0, 120)]); }
  }
  // Atlantix
  const au = await userOf('atx:ag:' + A.id);
  if (au) {
    try {
      const r = rowsOf(await call(atxRoutes, '/atx/subs', 'GET', null, '?q=' + encodeURIComponent(au))).find((x) => same(x.username || x.user || x.name, au));
      if (!r) out.push(['Atlantix', `sub-reseller ${au} non trovato sotto il tuo account`]);
      else {
        const ops = [];
        const enabled = isOn(r.status !== undefined ? r.status : r.enabled);
        if (off && enabled) ops.push('disable'); if (!off && !enabled) ops.push('enable');
        if (lines) ops.push(off ? 'users_off' : 'users_on');
        for (const op of ops) await call(atxRoutes, '/atx/subs/action', 'POST', { op, id: r.id, user: au });
        out.push(['Atlantix', ops.length ? (off ? 'disattivato' : 'riattivato') + (lines ? (off ? ' e linee bloccate' : ' e linee sbloccate') : '') : off ? 'era già disattivato' : 'era già attivo']);
      }
    } catch (e) { out.push(['Atlantix', 'non riuscito: ' + String(e.message || e).slice(0, 120)]); }
  }
  // Realott
  const ru = await userOf('ro:ag:' + A.id);
  if (ru) {
    try {
      const r = rowsOf(await call(extRoutes, '/ro/subs', 'GET')).find((x) => same(x.username, ru));
      if (!r) out.push(['Realott', `sub-reseller ${ru} non trovato sotto il tuo account`]);
      else if (off ? r.enabled : !r.enabled) { await call(extRoutes, '/ro/subs/action', 'POST', { op: 'toggle', id: r.id, username: ru }); out.push(['Realott', (off ? 'disattivato' : 'riattivato') + (lines ? ' (le linee si gestiscono dal pannello Realott)' : '')]); }
      else out.push(['Realott', off ? 'era già disattivato' : 'era già attivo']);
    } catch (e) { out.push(['Realott', 'non riuscito: ' + String(e.message || e).slice(0, 120)]); }
  }
  if (await userOf('slt:ag:' + A.id)) out.push(['SLT', 'da fare dal pannello SLT (non lo permette da qui)']);
  return out;
}
/* «A colpo d'occhio» nell'elenco Agenti (13 novembre 2026, solo titolare): per ogni agente gli account suoi sui pannelli
   esterni (WOLF, Realott, SLT, Atlantix) con utente, crediti rimasti e DNS. Si leggono dai pannelli, al massimo 4 alla
   volta e 15 secondi ciascuno; il risultato resta 10 minuti (anche fra le istanze, in settings «agGlance»). */
const GLANCE_TTL = 10 * 60e3;
let glanceMem = null;
async function agentsGlance(env, fresh) {
  if (!fresh && glanceMem && now() - glanceMem.t < GLANCE_TTL) return glanceMem;
  if (!fresh) {
    try { const r = await env.DB.prepare('SELECT v FROM settings WHERE k = ?').bind('agGlance').first(); const g = r && JSON.parse(r.v); if (g && now() - g.t < GLANCE_TTL) return (glanceMem = g); } catch {}
  }
  const rows = ((await env.DB.prepare("SELECT k FROM settings WHERE (k LIKE 'wolf:ag:%' OR k LIKE 'ro:ag:%' OR k LIKE 'slt:ag:%' OR k LIKE 'atx:ag:%') AND k NOT LIKE '%:ses'").all()).results) || [];
  const jobs = [];
  for (const { k } of rows) {
    const [panel, , raw] = String(k).split(':'), id = +raw;
    if (!(id > 0)) continue;
    jobs.push({ id, panel, run: () => (panel === 'wolf' ? wolfGlance(env, WOLF_H, id) : panel === 'atx' ? atxGlance(env, WOLF_H, id) : extGlance(env, WOLF_H, panel, id)) });
  }
  const agents = {};
  let next = 0;
  const lane = async () => {
    while (next < jobs.length) {
      const j = jobs[next++];
      let r;
      try { r = await Promise.race([j.run(), new Promise((_, no) => setTimeout(() => no(new Error('il pannello non risponde')), 15000))]); }
      catch (e) { r = { err: String((e && e.message) || e).slice(0, 80) }; }
      if (r) (agents[j.id] ||= []).push({ panel: j.panel, user: r.user || '', credits: r.credits ?? null, unlimited: !!r.unlimited, dns: r.dns || '', err: r.err || '' });
    }
  };
  await Promise.all([lane(), lane(), lane(), lane()]);
  const out = { t: now(), agents };
  glanceMem = out;
  await env.DB.prepare('INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind('agGlance', JSON.stringify(out)).run().catch(() => {});
  return out;
}

/** crea / modifica / elimina agenti. top = agente che sta agendo (null = proprietario) */
async function agentsAdmin(req, env, path, who, ip, top) {
  const m = req.method;
  const all = await agentsAll(env);
  const scope = top ? agentTree(all, top.id).filter((x) => x !== top.id) : all.map((a) => a.id);
  if (path === '/agents' && m === 'GET') return json({ agents: await agentsOut(env, all, scope, top ? serverIds(top.servers) : null) });
  if (path === '/agents/glance' && m === 'GET') {
    if (top) throw new HttpErr(403, 'Riservato al titolare');
    return json(await agentsGlance(env, new URL(req.url).searchParams.get('fresh') === '1'));
  }
  const dnsIds = new Set((await dnsList(env)).map((x) => x.id));
  const clean = async (b, cur, parentForCaps = top) => {
    const o = {};
    if (b.email !== undefined) { const e = str(b.email, 120); if (e && !/^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(e)) throw new HttpErr(400, 'Email non valida'); o.email = e; }
    if (b.notes !== undefined) o.notes = str(b.notes, 300);
    if (b.storeMax !== undefined) { const n = b.storeMax === null || b.storeMax === '' ? -1 : parseInt(b.storeMax, 10); if (!(n === -1 || (n >= 0 && n <= 100000))) throw new HttpErr(400, 'Tetto di store non valido (da 0 a 100000, vuoto = quello di serie)'); if (top) { if (n !== (cur ? cur.store_max : -1)) throw new HttpErr(403, 'Il tetto di store attivabili lo decide il titolare'); } else o.store_max = n; }
    if (b.maxClients !== undefined) { const n = parseInt(b.maxClients, 10); if (!(n >= 0 && n <= 100000)) throw new HttpErr(400, 'Limite clienti non valido'); if (parentForCaps && n > parentForCaps.max_clients) throw new HttpErr(400, `Il limite non può superare quello di chi lo gestisce (${parentForCaps.max_clients})`); o.max_clients = n; }
    if (b.canAgents !== undefined) { if (parentForCaps && !agentCanManage(all, parentForCaps.id)) throw new HttpErr(403, 'Non puoi creare sotto-agenti'); o.can_agents = b.canAgents === true ? 1 : 0; }
    if (b.perms !== undefined) {
      let requested = b.perms;
      if (typeof requested === 'string') { try { requested = JSON.parse(requested); } catch { requested = {}; } }
      if (requested && typeof requested === 'object' && !Array.isArray(requested)) {
        if (Object.hasOwn(requested, 'orcpSrv')) checkedOrcpServers(requested.orcpSrv);
        if (Object.hasOwn(requested, 'actApps')) {
          if (!Array.isArray(requested.actApps)) throw new HttpErr(400, 'Le app da attivare devono essere un elenco');
          const known = new Set((await activationApps(env, await getSettings(env))).flatMap(activationAliases));
          requested = { ...requested, actApps: [...new Set(requested.actApps.filter((x) => typeof x === 'string' && known.has(x)))] };
        }
      }
      const requestedPerms = requested && typeof requested === 'object' && !Array.isArray(requested) ? requested : {};
      if (top || parentForCaps || !Object.prototype.hasOwnProperty.call(requestedPerms, 'ledgerPanels')) requested = { ...requestedPerms, ledgerPanels: cur ? agentPerms(cur.perms).ledgerPanels : null };
      o.perms = JSON.stringify(agentPermsWithin(requested, parentForCaps ? agEffPerms(all, parentForCaps.id) : null));
    }
    if (b.servers !== undefined) { if (!Array.isArray(b.servers)) throw new HttpErr(400, 'servers deve essere un elenco'); let l = serverIds(b.servers.join(',')).filter((x) => dnsIds.has(x)); if (parentForCaps) { const mine = agentServersWithin(all, parentForCaps.id); l = l.filter((x) => mine.includes(x)); } o.servers = l.join(','); }
    if (typeof b.active === 'boolean' && (!cur || b.active !== !!cur.active)) {
      if (b.active && cur && parentForCaps && cur.disabled_by && !agentTree(all, parentForCaps.id).includes(cur.disabled_by)) throw new HttpErr(403, 'Disattivato da chi sta sopra di te: non puoi riattivarlo');
      o.active = b.active ? 1 : 0; o.disabled_by = b.active ? 0 : top ? top.id : -1; if (b.active && cur) await agSoloSet(env, cur.id, false);
    }
    if (b.password !== undefined && b.password !== '') { if (typeof b.password !== 'string' || b.password.length < 10 || b.password.length > 200) throw new HttpErr(400, 'Password di almeno 10 caratteri'); o.pass_hash = await hashPass(b.password); o.pw_seal = await seal(env, b.password); }
    return o;
  };
  if (path === '/agents/bulk' && m === 'POST') {
    const b = await readJSON(req, 65536);
    if (!b || typeof b !== 'object' || Array.isArray(b)) throw new HttpErr(400, 'Richiesta non valida');
    if (Object.keys(b).some((k) => !['ids', 'flags', 'lists'].includes(k))) throw new HttpErr(400, 'Campo non valido');
    if (!Array.isArray(b.ids) || b.ids.length < 1 || b.ids.length > 200 || b.ids.some((id) => !Number.isInteger(id) || id < 1)) throw new HttpErr(400, 'Scegli da 1 a 200 agenti');
    const ids = [...new Set(b.ids)];
    const flags = b.flags === undefined ? {} : b.flags, lists = b.lists === undefined ? {} : b.lists;
    if (!flags || typeof flags !== 'object' || Array.isArray(flags)) throw new HttpErr(400, 'flags deve essere un oggetto');
    if (!lists || typeof lists !== 'object' || Array.isArray(lists)) throw new HttpErr(400, 'lists deve essere un oggetto');
    for (const [k, v] of Object.entries(flags)) {
      if (!AGENT_FLAGS.includes(k)) throw new HttpErr(400, `Permesso non valido: ${k}`);
      if (typeof v !== 'boolean') throw new HttpErr(400, `Il permesso ${k} deve essere Sì o No`);
    }
    const actSettings = await getSettings(env), actCatalog = await activationApps(env, actSettings), listKeys = ['dlcAllow', 'appsAllow', 'kAllow', 'storeApps', 'actApps'], listOps = {}, actKeys = new Set(actCatalog.flatMap(activationAliases)), actEnabled = new Set(actCatalog.filter((x) => activationAppEnabled(actSettings, x)).map((x) => x.key));
    for (const [k, op] of Object.entries(lists)) {
      if (!listKeys.includes(k)) throw new HttpErr(400, `Elenco non valido: ${k}`);
      if (!op || typeof op !== 'object' || Array.isArray(op) || Object.keys(op).some((x) => !['mode', 'items'].includes(x))) throw new HttpErr(400, `Operazione non valida per ${k}`);
      if (!['add', 'remove', 'set'].includes(op.mode) || !Array.isArray(op.items) || op.items.length > 100) throw new HttpErr(400, `Operazione non valida per ${k}`);
      const items = [];
      for (const item of op.items) {
        if (typeof item !== 'string') throw new HttpErr(400, `Voce non valida per ${k}`);
        const value = str(item, 80);
        if (!value) throw new HttpErr(400, `Voce non valida per ${k}`);
        if (k === 'actApps' && value === '*') { for (const key of actEnabled) if (!items.includes(key)) items.push(key); continue; }
        if (k === 'actApps') {
          if (!actKeys.has(value)) continue;
          const app = actCatalog.find((x) => activationAliases(x).includes(value));
          if (app && !items.includes(app.key)) items.push(app.key);
          continue;
        }
        if (!items.some((x) => x.toLowerCase() === value.toLowerCase())) items.push(value);
      }
      if (items.length) listOps[k] = { mode: op.mode, items };
    }
    if (!Object.keys(flags).length && !Object.keys(listOps).length) throw new HttpErr(400, 'Scegli almeno una modifica');
    let updated = 0;
    const skipped = [];
    for (const id of ids) {
      const A = all.find((x) => x.id === id);
      if (!A) { skipped.push({ id, username: '', reason: 'Agente non trovato' }); continue; }
      if (!scope.includes(id)) { skipped.push({ id, username: '', reason: 'Agente fuori dalla tua lista' }); continue; }
      const perms = agentPerms(A.perms);
      for (const [k, value] of Object.entries(flags)) perms[k] = value;
      for (const [k, op] of Object.entries(listOps)) {
        const current = k === 'actApps' ? [...new Set(perms[k].map((key) => actCatalog.find((x) => activationAliases(x).includes(key))?.key).filter(Boolean))] : perms[k], selected = op.items;
        if (op.mode === 'set') perms[k] = selected.includes('*') ? ['*'] : selected;
        else if (op.mode === 'add') {
          perms[k] = current.includes('*') || selected.includes('*') ? ['*'] : [...current, ...selected.filter((x) => !current.some((y) => y.toLowerCase() === x.toLowerCase()))];
        } else if (!current.includes('*')) {
          const remove = new Set(selected.map((x) => x.toLowerCase()));
          perms[k] = current.filter((x) => !remove.has(x.toLowerCase()));
        }
      }
      const normalized = agentPermsWithin(perms, top ? agentPerms(top.perms) : null);
      await env.DB.prepare("UPDATE admins SET perms = ? WHERE id = ? AND role = 'agent'").bind(JSON.stringify(normalized), id).run();
      await log(env, 'edit', `${who}: applicate modifiche multiple ai permessi e agli elenchi di ${A.username}`, ip);
      updated++;
    }
    if (updated) memoDrop(env, 'ags');
    return json({ updated, skipped });
  }
  if (path === '/agents' && m === 'POST') {
    if (top && !top.can_agents) throw new HttpErr(403, 'Non puoi creare sotto-agenti');
    const b = await readJSON(req, 16384);
    const user = str(b.username, 40);
    if (!/^[A-Za-z0-9._-]{3,40}$/.test(user)) throw new HttpErr(400, 'Nome utente: 3-40 caratteri tra lettere, numeri, punto, trattino');
    if (await env.DB.prepare('SELECT 1 AS x FROM admins WHERE username = ?').bind(user).first()) throw new HttpErr(400, 'Nome utente già usato');
    if (typeof b.password !== 'string' || b.password.length < 10 || b.password.length > 200) throw new HttpErr(400, 'Password di almeno 10 caratteri');
    if (all.length >= 1000) throw new HttpErr(400, 'Hai raggiunto il massimo di 1000 agenti');
    const parent = top ? all.find((a) => a.id === top.id) : agentParent(all, b.parentId === undefined ? 0 : b.parentId);
    const parentId = top ? top.id : parent ? parent.id : 0;
    const o = await clean({ maxClients: parent ? Math.min(10, parent.max_clients) : 10, perms: {}, servers: [], ...b }, null, parent);
    // codice venditore scelto dal titolare già alla creazione: controllato prima di creare l'agente
    // (prima un codice non valido dava errore ma l'agente restava creato, e riprovando «Nome utente già usato»)
    const wantSc = !top && b.storeCode !== undefined && String(b.storeCode).trim(), sc = wantSc ? sellerNorm(b.storeCode) : '';
    if (wantSc && !SELLER_RE.test(sc)) throw new HttpErr(400, 'Codice venditore: da 3 a 8 lettere o cifre');
    if (wantSc && (sc === ((await getSettings(env)).storeOwnerCode || '') || all.some((x) => x.store_code === sc))) throw new HttpErr(400, `Il codice ${sc} è già usato`);
    const r = await env.DB.prepare("INSERT INTO admins (username, pass_hash, created_at, role, parent_id, email, max_clients, can_agents, perms, servers, active, notes, pw_seal) VALUES (?, ?, ?, 'agent', ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id")
      .bind(user, o.pass_hash, now(), parentId, o.email || '', o.max_clients ?? 10, o.can_agents || 0, o.perms || JSON.stringify(AGENT_DEF), o.servers || '', o.active ?? 1, o.notes || '', o.pw_seal || '').first();
    if (wantSc) await env.DB.prepare('UPDATE admins SET store_code = ? WHERE id = ?').bind(sc, r.id).run();
    memoDrop(env, 'ags');
    await log(env, 'new', `${who}: creato l'agente ${user}${parentId ? ' (sotto ' + (parent && parent.username || user) + ')' : ''}`, ip);
    return json({ ok: true, id: r.id });
  }
  const pm = path.match(/^\/agents\/(\d{1,9})\/parent$/);
  if (pm) {
    if (top) throw new HttpErr(403, 'Solo il titolare può spostare un agente');
    if (m !== 'PUT') throw new HttpErr(405, 'Metodo non consentito');
    const id = +pm[1], target = all.find((a) => a.id === id);
    if (!target) throw new HttpErr(404, 'Agente non trovato');
    const b = await readJSON(req, 2048);
    if (!b || typeof b !== 'object' || Array.isArray(b) || Object.keys(b).length !== 1 || !Object.hasOwn(b, 'parentId')) throw new HttpErr(400, 'Indica il nuovo agente superiore');
    const parent = agentParent(all, b.parentId, id), parentId = parent ? parent.id : 0;
    if (parentId === target.parent_id) return json({ ok: true, unchanged: true });
    const oldParent = all.find((a) => a.id === target.parent_id);
    const perms = agentPermsWithin(agentPerms(target.perms), parent ? agEffPerms(all, parent.id) : null);
    const servers = parent ? serverIds(target.servers).filter((x) => agentServersWithin(all, parent.id).includes(x)) : serverIds(target.servers);
    const maxClients = parent ? Math.min(target.max_clients, parent.max_clients) : target.max_clients;
    await env.DB.prepare("UPDATE admins SET parent_id = ?, max_clients = ?, perms = ?, servers = ? WHERE id = ? AND role = 'agent'")
      .bind(parentId, maxClients, JSON.stringify(perms), servers.join(','), id).run();
    memoDrop(env, 'ags');
    await log(env, 'edit', `${who}: agente ${target.username} spostato sotto ${parent ? parent.username : 'Master'} (prima sotto ${oldParent ? oldParent.username : 'Master'})`, ip);
    return json({ ok: true, parentId });
  }
  // «Disattiva agente» e «Disattiva agente e le sue linee» (13 novembre 2026). Con le linee: i suoi clienti (e quelli dei
  // suoi sotto-agenti) attivi vengono disattivati e ricordati; riattivando l'agente tornano attivi proprio quelli.
  // Solo le linee di KAIROS: quelle sui pannelli esterni (WOLF, Atlantix…) restano come sono.
  const offm = path.match(/^\/agents\/(\d{1,9})\/(off|on)$/);
  if (offm && m === 'POST') {
    const id = +offm[1], A = all.find((a) => a.id === id);
    if (!A || !scope.includes(id)) throw new HttpErr(404, 'Agente non trovato');
    const b = await readJSON(req, 1024), key = 'agoff:' + id, tree = agentTree(all, id);
    let saved = null; try { const r = await env.DB.prepare('SELECT v FROM settings WHERE k = ?').bind(key).first(); saved = r ? JSON.parse(r.v) : null; } catch {}
    if (offm[2] === 'off') {
      const ids = [];
      if (b.lines === true || b.linesOnly === true) {
        for (let i = 0; i < tree.length; i += 90) {
          const part = tree.slice(i, i + 90);
          for (const r of ((await env.DB.prepare(`SELECT id FROM devices WHERE parent = '' AND active = 1 AND owner_id IN (${part.map(() => '?').join(',')})`).bind(...part).all()).results) || []) ids.push(r.id);
        }
        for (let i = 0; i < ids.length; i += 90) { const part = ids.slice(i, i + 90); await env.DB.prepare(`UPDATE devices SET active = 0 WHERE id IN (${part.map(() => '?').join(',')})`).bind(...part).run(); }
        const keep = [...new Set([...((saved && saved.ids) || []), ...ids])];
        await env.DB.prepare('INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind(key, JSON.stringify({ t: now(), ids: keep, lines: true })).run();
      }
      // «Disattiva anche le linee» su un agente già disattivato: solo le linee, l'agente resta come l'avevi spento (anche «solo lui»)
      if (b.linesOnly === true) {
        await log(env, 'off', `${who}: linee dell'agente ${A.username} disattivate (${ids.length} clienti)`, ip);
        const ext = !top && b.ext !== false ? await agentExtSync(env, A, true, true, who, ip) : [];
        return json({ ok: true, lines: ids.length, ext });
      }
      await env.DB.batch([
        env.DB.prepare('UPDATE admins SET active = 0, disabled_by = ? WHERE id = ?').bind(top ? top.id : -1, id),
        env.DB.prepare('DELETE FROM sessions WHERE admin_id = ?').bind(id),
      ]);
      await agSoloSet(env, id, b.solo === true && b.lines !== true); // «solo agente»: i suoi sotto-agenti restano attivi
      memoDrop(env, 'ags');
      await log(env, 'off', `${who}: agente ${A.username} disattivato${b.lines === true ? ` con le sue linee (${ids.length} clienti disattivati)` : b.solo === true ? ' (solo lui: i sotto-agenti restano attivi)' : ''}`, ip);
      const ext = !top && b.ext !== false ? await agentExtSync(env, A, true, b.lines === true, who, ip) : [];
      return json({ ok: true, lines: ids.length, ext });
    }
    if (top && A.disabled_by && !agentTree(all, top.id).includes(A.disabled_by)) throw new HttpErr(403, 'Disattivato da chi sta sopra di te: non puoi riattivarlo');
    await env.DB.prepare('UPDATE admins SET active = 1, disabled_by = 0 WHERE id = ?').bind(id).run();
    await agSoloSet(env, id, false);
    let back = 0;
    if (b.lines !== false && saved && Array.isArray(saved.ids)) {
      for (let i = 0; i < saved.ids.length; i += 90) { const part = saved.ids.slice(i, i + 90); const r = await env.DB.prepare(`UPDATE devices SET active = 1 WHERE active = 0 AND id IN (${part.map(() => '?').join(',')})`).bind(...part).run(); back += (r.meta && r.meta.changes) || 0; }
      await env.DB.prepare('DELETE FROM settings WHERE k = ?').bind(key).run();
    }
    memoDrop(env, 'ags');
    await log(env, 'on', `${who}: agente ${A.username} riattivato${back ? ` con le sue linee (${back} clienti riattivati)` : ''}`, ip);
    const ext = !top && b.ext !== false ? await agentExtSync(env, A, false, !!(saved && saved.lines) && b.lines !== false, who, ip) : [];
    return json({ ok: true, lines: back, ext });
  }
  const am = path.match(/^\/agents\/(\d{1,9})$/);
  if (!am) throw new HttpErr(404, 'Non trovato');
  const id = +am[1], A = all.find((a) => a.id === id);
  if (!A || !scope.includes(id)) throw new HttpErr(404, 'Agente non trovato');
  if (m === 'PUT') {
    const b = await readJSON(req, 16384);
    const o = await clean(b, A);
    if (b.resetTotp === true) { o.totp_on = 0; o.totp_secret = ''; o.totp_last = 0; await recDrop(env, id); }
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
    clearAtxAgent(id);
    await trashPut(env, 'agent', String(id), A.username, fullA, { up, devices: devs, agents: subs }, who);
    await env.DB.batch([
      env.DB.prepare('UPDATE devices SET owner_id = ? WHERE owner_id = ?').bind(up, id),
      env.DB.prepare("UPDATE admins SET parent_id = ? WHERE parent_id = ? AND role = 'agent'").bind(up, id),
      env.DB.prepare('DELETE FROM sessions WHERE admin_id = ?').bind(id),
      env.DB.prepare("DELETE FROM admins WHERE id = ? AND role = 'agent'").bind(id),
      env.DB.prepare('DELETE FROM settings WHERE k IN (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind('wolf:ag:' + id, 'wolf:ag:' + id + ':ses', 'mxp:ag:' + id, 'ro:ag:' + id, 'ro:ag:' + id + ':ses', 'slt:ag:' + id, 'slt:ag:' + id + ':ses', 'atx:ag:' + id, 'atx:ag:' + id + ':ses'),
    ]);
    memoDrop(env, 'ags', 'agc');
    await log(env, 'off', `${who}: eliminato l'agente ${A.username} (clienti e sotto-agenti passati a ${up ? 'chi stava sopra' : 'te'})`, ip);
    return json({ ok: true });
  }
  throw new HttpErr(405, 'Metodo non consentito');
}
/** pannello dell'agente: solo queste funzioni, sempre limitate ai suoi clienti */
const AGENT_SELF = /^\/(logout|logout-all|password|totp\/(setup|enable|disable|recovery))$/;
/** dispositivo "libero": comparso sulla TV ma mai toccato dal pannello (né dal proprietario né da altri agenti) */
const FREE_DEV = "owner_id = 0 AND parent = '' AND active = 0 AND playlists = '' AND name = '' AND notes = '' AND expires = ''";
/* ---------------- «Aggiungi dispositivo» e «stessa rete» (11 novembre 2026) ----------------
   Una TV nuova in attesa (codice libero, FREE_DEV) collegata dallo stesso IP di un cliente (IPv6: stessa rete /64) è
   probabilmente della sua casa. Gli IP restano qui: al pannello arrivano solo nomi, codici e modelli.
   - per un cliente ([forId]): le TV in attesa delle ultime 48 ore, quelle della stessa rete per prime («same»).
     Il titolare le vede tutte; l'agente solo quelle della stessa rete di un suo cliente, viste nelle ultime 6 ore;
   - senza cliente (solo titolare): per ogni TV in attesa i clienti della stessa rete.
   Con più di 2 clienti sullo stesso IP (rete condivisa, es. operatore mobile) la rete non conta: niente suggerimento. */
function ipNet(ip) {
  ip = String(ip || '').trim().toLowerCase().replace(/^::ffff:(?=\d+\.)/, '');
  if (!ip) return '';
  if (!ip.includes(':')) return /^\d{1,3}(\.\d{1,3}){3}$/.test(ip) ? ip : '';
  const [a, b = ''] = ip.split('::'), A = a ? a.split(':') : [], B = b ? b.split(':') : [];
  const full = ip.includes('::') ? [...A, ...Array(Math.max(0, 8 - A.length - B.length)).fill('0'), ...B] : A;
  if (full.length !== 8 || full.some((x) => !/^[0-9a-f]{1,4}$/.test(x))) return '';
  return full.slice(0, 4).map((x) => x.replace(/^0+(?=.)/, '')).join(':') + '::/64';
}
/** «📥 Scaricata col codice di …» scritto sul dispositivo al register (12 novembre 2026): quando una TV nuova si presenta in
    attesa, si cerca il codice dello Store usato da poco dalla stessa rete (o dallo stesso IP) e si segna chi l'aveva generato
    (agente o titolare). Così la scheda «Da attivare» lo mostra sempre, anche se poi l'IP cambia. Una volta sola per dispositivo. */
async function recStamp(env, id, ip) {
  try {
    const t = now(), net = ipNet(ip);
    const r = await env.DB.prepare("SELECT by_id, by_name, ip, used FROM store_codes WHERE used > ? AND ip <> '' ORDER BY used DESC LIMIT 80").bind(t - 48 * 36e5).all();
    let exact = null, sameNet = null;
    for (const c of (r && r.results) || []) {
      if (!exact && c.ip === ip) exact = c;
      if (!sameNet && net && ipNet(c.ip) === net) sameNet = c;
      if (exact) break;
    }
    const best = exact || sameNet;
    if (!best) return;
    await env.DB.prepare("UPDATE devices SET rec_by = ?, rec_name = ?, rec_t = ? WHERE id = ? AND rec_t = 0 AND active = 0 AND parent = '' AND secret_hash <> ''")
      .bind(+best.by_id || 0, str(best.by_name, 60), t, id).run();
  } catch {}
}
async function devicesNear(env, forId, agentId) {
  const t = now(), SINCE_TV = t - 48 * 36e5, SINCE_CL = t - 14 * 864e5;
  const [tvR, devR, preR] = await Promise.all([
    env.DB.prepare(`SELECT id, code, model, last_seen, last_ip FROM devices WHERE ${FREE_DEV} AND last_seen > ? ORDER BY last_seen DESC LIMIT 300`).bind(SINCE_TV).all(),
    env.DB.prepare(`SELECT id, parent, name, code, last_ip, last_seen, active, expires, playlists FROM devices WHERE last_seen > ? AND NOT (${FREE_DEV})`).bind(SINCE_CL).all(),
    env.DB.prepare('SELECT device_id, ip, ip2, t FROM presence WHERE t > ?').bind(SINCE_CL).all(),
  ]);
  const tvs = (tvR && tvR.results) || [], devs = (devR && devR.results) || [];
  // rete → clienti principali visti di recente (la TV collegata conta per il suo principale)
  const mainOf = new Map(), nets = new Map(), names = new Map();
  for (const d of devs) { mainOf.set(d.id, d.parent || d.id); if (!d.parent) names.set(d.id, { id: d.id, name: d.name || d.code, code: d.code, real: !!(+d.active || d.expires || d.playlists) }); }
  const addNet = (ip, devId) => { const n = ipNet(ip), m = mainOf.get(devId); if (!n || !m) return; if (!nets.has(n)) nets.set(n, new Set()); nets.get(n).add(m); };
  for (const d of devs) addNet(d.last_ip, d.id);
  for (const p of (preR && preR.results) || []) { addNet(p.ip, p.device_id); if (p.ip2 && t - (+p.t || 0) < 864e5) addNet(p.ip2, p.device_id); }
  // solo clienti veri (con abbonamento) e reti con al massimo 2 clienti
  const near = (ip) => { const set = nets.get(ipNet(ip)); if (!set) return []; const L = [...set].map((id) => names.get(id)).filter((x) => x && x.real); return L.length <= 2 ? L : []; };
  const tvOut = (d, same) => ({ id: d.id, code: d.code, model: str(d.model || '', 60), seen: +d.last_seen || 0, same: !!same });
  if (forId) {
    const C = names.get(forId) || await env.DB.prepare('SELECT id, name, code, parent FROM devices WHERE id = ?').bind(forId).first().then((r) => (r && !r.parent ? { id: r.id, name: r.name || r.code, code: r.code } : null));
    if (!C) throw new HttpErr(404, 'Cliente non trovato');
    const L = tvs.map((d) => tvOut(d, near(d.last_ip).some((x) => x.id === C.id)))
      .filter((x) => !agentId || (x.same && t - x.seen < 6 * 36e5));
    L.sort((a, b) => (b.same - a.same) || (b.seen - a.seen));
    return { client: { id: C.id, name: C.name }, tvs: L.slice(0, 30) };
  }
  // «📥 col codice di …» (11 novembre 2026): la TV in attesa è sulla stessa rete di un Kairos Store che nelle ultime 48 ore ha
  // usato un codice per scaricare: si dice chi l'aveva generato (agente o titolare)
  const byNet = new Map();
  try {
    const R = await env.DB.prepare("SELECT ip, by_id, by_name, used FROM store_codes WHERE used > ? AND ip <> ''").bind(SINCE_TV).all();
    for (const r of (R && R.results) || []) { const n = ipNet(r.ip); if (!n) continue; const p = byNet.get(n); if (!p || +r.used > p.used) byNet.set(n, { used: +r.used, by: +r.by_id ? r.by_name || 'agente' : '', mine: !+r.by_id }); }
  } catch {}
  const viaCode = (d) => { const c = byNet.get(ipNet(d.last_ip)); return c ? { by: c.by, mine: c.mine } : null; };
  return { pend: tvs.map((d) => ({ id: d.id, near: near(d.last_ip).map((x) => ({ id: x.id, name: x.name, code: x.code })), via: viaCode(d) })).filter((x) => x.near.length || x.via) };
}
async function agentRoutes(req, env, url, path, ses, ip, ctx) {
  const m = req.method;
  const all = await agentsAll(env);
  // agente disattivato: fuori lui; il titolare in assistenza entra lo stesso (13 novembre 2026), per controllare o sistemare
  if (!ses.assist && !(await agentChainActive(env, ses.admin_id, all))) {
    await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(ses.id).run();
    throw new HttpErr(401, 'Account disattivato');
  }
  if (!ses.assist) { const S1 = await getSettings(env); if (S1.agentHost && S1.agentHostOnly && new URL(req.url).hostname.toLowerCase() !== S1.agentHost) { await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(ses.id).run(); throw new HttpErr(401, 'Accedi dall\'indirizzo del pannello che ti è stato dato'); } }
  if (!ses.assist) await agSecCheck(req, env, ses, ip, ctx); // «Accesso di 7 giorni» e «Solo da questi Paesi»
  if (!ses.assist && path !== '/logout') { const am = (await getSettings(env)).agMaint; if (am && am.on) throw new HttpErr(503, am.msg || AGM_MSG, { maint: true }); } // manutenzione del pannello agenti
  // «Verifica in due passaggi obbligatoria» (Accesso degli agenti): finché non la attiva può solo attivarla (o uscire)
  if (!ses.assist && (!ses.totp_on || path === '/totp/disable')) {
    const G2 = agSecNorm((await getSettings(env)).agSec);
    if (G2.tfa && !ses.totp_on && !/^\/(logout|totp\/(setup|enable))$/.test(path)) throw new HttpErr(403, TFA_MSG, { mustTotp: true });
    if (G2.tfa && path === '/totp/disable') throw new HttpErr(403, 'La verifica in due passaggi è obbligatoria: il titolare non la fa spegnere');
  }
  const A = all.find((a) => a.id === ses.admin_id);
  const by = new Map(all.map((a) => [a.id, a]));
  let P = agentPerms(A.perms), mine = serverIds(A.servers);
  let canAg = !!A.can_agents;
  for (let x = by.get(A.parent_id), n = 0; x && n < 20; x = by.get(x.parent_id), n++) { P = agentPermsWithin(P, agentPerms(x.perms)); const up = serverIds(x.servers); mine = mine.filter((y) => up.includes(y)); if (!x.can_agents) canAg = false; }
  const currentActKeys = new Set((await activationApps(env, await getSettings(env))).flatMap(activationAliases));
  P.actApps = P.actApps.filter((x) => currentActKeys.has(x));
  const Aeff = { ...A, can_agents: canAg ? 1 : 0, perms: JSON.stringify(P), servers: mine.join(',') };
  const tree = agentTree(all, A.id), who = ses.assist ? `Assistenza di ${ses.assistBy} · ${A.username}` : 'Agente ' + A.username;
  const ctree = P.subClients ? tree : [A.id]; // clienti visibili: i suoi e (se concesso) quelli dei sotto-agenti
  const aSes = { ...ses, agent: true, orbDns: P.orbDns, mxDns: P.mxDns };
  if (path === '/rctl' || path.startsWith('/rctl/')) return agentRctl(req, env, path, m, P, ctree, who, ip);
  if (path === '/agent/orcp') {
    if (m !== 'GET') throw new HttpErr(405, 'Metodo non consentito');
    if (!P.orcpApp) throw new HttpErr(403, 'App MirkoTeam non abilitata: chiedila al tuo fornitore');
    return json(await orcpAgentConfig(env, P.orcpSrv));
  }
  if (path.startsWith('/orcp/')) throw new HttpErr(403, 'Solo il titolare può gestire il Pannello ORCP');
  // in assistenza: niente «ultimo accesso» falsato e niente modifiche alla sicurezza dell'account dell'agente
  if (ses.assist && /^\/(logout-all|password|totp\/(setup|enable|disable|recovery))$/.test(path)) throw new HttpErr(403, 'In assistenza non puoi cambiare password, verifica in due passaggi o sessioni dell\'agente');
  // (anche i lavori notturni fatti a suo nome — rinnovi automatici, allineamento delle scadenze — non sono un suo accesso)
  if (!ses.assist && !/^auto-renew-/.test(String(ses.id || '')) && now() - (+A.last_seen || 0) > 5 * 60e3) ctx.waitUntil(env.DB.prepare('UPDATE admins SET last_seen = ? WHERE id = ?').bind(now(), A.id).run());
  if (path === '/password' && m === 'PUT') { const b = await readJSON(req, 4096); if (typeof b.next === 'string' && b.next.length >= 10 && b.next.length <= 200 && (await checkPass(str(b.current, 200), (await env.DB.prepare('SELECT pass_hash FROM admins WHERE id = ?').bind(A.id).first()).pass_hash))) ctx.waitUntil((async () => { await env.DB.prepare('UPDATE admins SET pw_seal = ? WHERE id = ?').bind(await seal(env, b.next), A.id).run(); })()); return adminRoutes(new Request(url.href, { method: 'PUT', body: JSON.stringify({ current: b.current, next: b.next }) }), env, url, path, who, ip, ctx, aSes); } // il nome utente lo cambia solo chi l'ha creato
  if (AGENT_SELF.test(path) && m !== 'GET') return adminRoutes(req, env, url, path, who, ip, ctx, aSes);
  if (path === '/agents' || path.startsWith('/agents/')) { if (!canAg) throw new HttpErr(403, 'Non puoi gestire agenti'); return agentsAdmin(req, env, path, who, ip, Aeff); }
  const dns = (await dnsList(env)).map((x, i) => ({ ...x, name: svName(x, i) })), servers = dns.filter((x) => mine.includes(x.id));
  if (path === '/agent/act-request') {
    if (m !== 'POST') throw new HttpErr(405, 'Metodo non consentito');
    const b = await readJSON(req, 4096);
    if (!b || typeof b !== 'object' || Array.isArray(b) || Object.keys(b).some((k) => !['appKey', 'username', 'password', 'mac', 'deviceKey', 'serverId'].includes(k))) throw new HttpErr(400, 'Richiesta di attivazione non valida');
    const key = str(b.appKey, 60), settings = await getSettings(env), app = (await activationApps(env, settings)).find((x) => activationAliases(x).includes(key));
    if (!app || !activationAppAllowed(P, app) || !activationAppEnabled(settings, app)) throw new HttpErr(403, 'Questa app non è abilitata per te');
    const username = str(b.username, 120).trim(), password = str(b.password, 200), mac = str(b.mac, 64).trim(), deviceKey = str(b.deviceKey, 120).trim();
    if (!username || !password || !mac) throw new HttpErr(400, 'Scrivi utente, password e MAC / ID del dispositivo');
    const serverId = str(b.serverId, 20), server = serverId ? servers.find((x) => x.id === serverId && x.host) || null : null;
    const pending = !server;
    const note = [deviceKey ? `key: ${deviceKey}` : '', pending ? 'DA ATTIVARE' : ''].filter(Boolean).join(' · ');
    const clean = llClean({ app: app.name, username, password, dns: server ? server.host : '', mac, note });
    if (((await env.DB.prepare('SELECT COUNT(*) AS n FROM linked_lines').first()) || { n: 0 }).n >= LL_MAX) throw new HttpErr(400, 'Hai raggiunto il massimo di linee registrate: togli quelle che non servono');
    const t = now(), row = await env.DB.prepare('INSERT INTO linked_lines (owner_id, app, username, pass_seal, dns, dns_name, mac, device_id, note, source, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id')
      .bind(A.id, clean.app, clean.username, await seal(env, clean.password || ''), clean.dns, server ? server.name : '', clean.mac, '', clean.note, '', t, t).first();
    await log(env, 'new', `${who}: ${pending ? 'richiesta da attivare per' : 'linea registrata per'} ${clean.app} · ${clean.username}`, ip);
    if (pending) return json({ id: (row && row.id) || 0, pending: true, app: clean.app, mac: clean.mac });
    const dnsHost = server.host.replace(/\/+$/, ''), m3u = `${dnsHost}/get.php?username=${encodeURIComponent(clean.username)}&password=${encodeURIComponent(clean.password || '')}&type=m3u_plus&output=ts`;
    return json({ id: (row && row.id) || 0, pending: false, app: clean.app, mac: clean.mac, serverName: server.name, activationUrl: app.link ? app.link.url : '', dns: server.host, m3u });
  }
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
      // una playlist che il cliente ha già, rimandata uguale (server non più assegnato, M3U messa dal titolare…), resta com'è:
      // prima rinominare o rinnovare quel cliente dava «Scegli uno dei server…» (cambiarla resta possibile solo verso i suoi server)
      if (!sv && old && !str(p && p.serverId, 20) && (!p.username || p.username === old.username) && (!p.password || p.password === old.password)) return old;
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
  if (path === '/match-server' && m === 'POST') {
    if (!P.create && !P.playlists && !P.actApps.length) throw new HttpErr(403, 'Non puoi impostare le linee');
    const b = await readJSON(req, 1024), panel = str(b.panel, 20).toLowerCase();
    if (panel && !LINE_SYNC_PANELS.has(panel)) throw new HttpErr(400, 'Pannello non valido');
    if (panel && !P[panel]) throw new HttpErr(403, 'Non puoi usare questo pannello IPTV');
    const host = str(b.host, 300) || (panel ? await masterLineDns(env, panel) : '');
    let sv = servers.find((x) => host && sameServerEndpoint(x.host, host));
    // linea presa da un pannello (WOLF, Atlantix…) ma il DNS dell'agente è un altro indirizzo dello stesso server: se
    // l'agente ha un solo server assegnato si usa quello, senza fargli scegliere niente (13 novembre 2026)
    if (!sv && panel && servers.length === 1) sv = servers[0];
    return json({ server: sv ? { id: sv.id, name: sv.name } : null });
  }
  const apv = path.match(/^\/addon-preview\/([a-z0-9-]{3,40})$/);
  if (apv && m === 'GET') { if (!allowedAddons.has(apv[1])) throw new HttpErr(404, 'Anteprima non disponibile'); return adminRoutes(req, env, url, path, who, ip, ctx, aSes); }
  const need = (k, msg) => { if (!P[k]) throw new HttpErr(403, msg || 'Funzione non consentita: chiedila a chi ti ha creato'); };
  if (path === '/agent/agent-ledger') {
    if (m !== 'GET') throw new HttpErr(403, 'Il registro debiti è di sola lettura');
    return json(filterLedgerForAgent(await agentLedgerDetail(env, A.id, false), P.ledgerPanels));
  }
  if (path === '/agent-ledger' || path.startsWith('/agent-ledger/')) throw new HttpErr(403, 'Il registro debiti è riservato al titolare');
  if (path === '/health-check' && m === 'GET') throw new HttpErr(403, 'Il controllo generale è riservato al titolare');
  if (path === '/events' || path.startsWith('/events/')) {
    need('events', '«Eventi ora» non è attivo per te: chiedi al titolare');
    if (m !== 'GET') throw new HttpErr(405, 'Metodo non consentito');
    if (path === '/events') return json(await panelEvents(env, ctx));
    if (path === '/events/chans') return json(await eventsChans(env));
    if (path === '/events/epg') return json(await eventsEpg(env, String(url.searchParams.get('ids') || '').split(',').map((x) => x.trim()).filter((x) => /^[A-Za-z0-9_-]{1,20}$/.test(x))));
    throw new HttpErr(404, 'Non trovato');
  }
  if (path === '/payments') {
    if (m === 'PUT') need('payments', 'Non puoi gestire i pagamenti');
    return paymentsRoutes(req, env, who, ip, { id: A.id, tree: ctree, own, autoRenew: !!P.autoRenew });
  }
  if (path === '/line-sync' || path.startsWith('/line-sync/')) {
    if (m === 'PUT' && path === '/line-sync') {
      if (!P.create && !P.renew) throw new HttpErr(403, 'Non puoi gestire l’allineamento delle scadenze');
    } else need('renew', 'Non puoi gestire l’allineamento delle scadenze'); // anche fissare la data del cliente (/line-sync/hold) è un rinnovo
    const ownerFilter = /^auto-renew-\d+$/.test(String(ses.id || '')) ? A.id : undefined;
    return lineSyncRoutes(req, env, path, who, ip, { own }, ownerFilter);
  }
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
  if (path.startsWith('/oxp/')) { need('oxp', 'Non puoi usare il Pannello OrbixPlay: chiedilo a chi ti gestisce'); const r = await oxpRoutes(req, env, path, who, ip, WOLF_H, { id: A.id, tree: ctree, canNew: !!P.oxpNew, orbDns: agOrbList(await getSettings(env), P.orbDns) }); if (r) return r; throw new HttpErr(404, 'Funzione non trovata'); }
  // Pannello MaxPlayer: con il permesso del titolare, solo i clienti dell'agente MaxPlayer che gli ha assegnato
  if (path.startsWith('/mxp/')) { need('mxp', 'Non puoi usare il Pannello MaxPlayer: chiedilo a chi ti gestisce'); const r = await mxpRoutes(req, env, path, who, ip, WOLF_H, { id: A.id }); if (r) return r; throw new HttpErr(404, 'Funzione non trovata'); }
  // Pannello WOLF: con il permesso del titolare, sul proprio account reseller WOLF (sue linee e suoi crediti)
  if (path === '/online' && m === 'POST') { if (!['wolf', 'armada', 'storm', 'mxp', 'oxp', 'atx', 'ro', 'slt'].some((k) => P[k])) throw new HttpErr(403, 'Non hai pannelli esterni collegati'); return onlineRoute(req); }
  if (path.startsWith('/wolf/')) { need('wolf', 'Non puoi usare il pannello WOLF: chiedilo a chi ti gestisce'); const r = await wolfRoutes(req, env, path, who, ip, WOLF_H, { id: A.id }); if (r) return r; throw new HttpErr(404, 'Funzione non trovata'); }
  if (path.startsWith('/atx/')) { need('atx', 'Non puoi usare il pannello Atlantix: chiedilo a chi ti gestisce'); const r = await atxRoutes(req, env, path, who, ip, WOLF_H, { id: A.id }); if (r) return r; throw new HttpErr(404, 'Funzione non trovata'); }
  if (/^\/(ro|slt)\//.test(path)) { need(path.split('/')[1], 'Non puoi usare questo pannello IPTV: chiedilo a chi ti gestisce'); const r = await extRoutes(req, env, path, who, ip, WOLF_H, { id: A.id }); if (r) return r; throw new HttpErr(404, 'Funzione non trovata'); }
  // «Crea lista» su OrbixPlay/MaxPlayer senza cliente Kairos: con il permesso di attivarle dal pannello
  if (path === '/ext-lists' || path.startsWith('/ext-lists/')) {
    if (path === '/ext-lists/nanomid-clear' || (path === '/ext-lists' && m === 'POST' && (await readJSON(req.clone(), 4096)).app === 'nanomid')) throw new HttpErr(403, 'Nanomid per ora è solo del titolare');
    const deleting = m === 'DELETE' && path.match(/^\/ext-lists\/([A-Za-z0-9_-]{6,20})$/);
    if (deleting && (await env.DB.prepare('SELECT app FROM ext_lists WHERE id = ?').bind(deleting[1]).first())?.app === 'nanomid') throw new HttpErr(403, 'Nanomid per ora è solo del titolare');
    need('players', 'Non puoi creare liste su OrbixPlay e MaxPlayer');
    const r = await extListsRoutes(req, env, path, who, ip, { id: A.id, tree: ctree, orbDns: P.orbDns, mxDns: P.mxDns }); if (r) return r;
  }
  // App → OrbixPlay e MaxPlayer: le liste create sulle app terzi, solo dei suoi clienti
  if (path === '/apps3/lists' && m === 'GET') {
    need('appsOp'); const sc = await scope();
    const days = Math.max(7, Math.min(365, parseInt(url.searchParams.get('days'), 10) || 60));
    return json({ days, lists: (await thirdLists(env, days)).filter((x) => sc.has(x.id)).map(({ ownerId, ...x }) => ({ ...x, dns: /^(orbix|max)$/.test(x.app) ? agentDnsLabel(x.dns, x.app === 'max' ? 0 : +x.dnsIdx || 0, x.app === 'max' ? `DNS ${x.dom || 1}` : `DNS ${(+x.dnsIdx || 0) + 1}`) : x.dns })) });
  }
  const REQ_PERM = { report: 'reports', content: 'contentReq', addon: 'addonReq', ai: 'ai' };
  // «Online ora» e «Salute delle app» sono del titolare: mostrano tutti i clienti del pannello (totali, più visti, app da aggiornare)
  if ((path === '/presence' && m === 'GET') || ['/health', '/health/hide', '/health/unhide'].includes(path)) throw new HttpErr(403, '«Online ora» e «Salute delle app» sono riservate al titolare');
  // Linee collegate: solo le sue (e dei sotto-agenti, se li vede); gli host delle attivazioni automatiche restano nascosti
  if (path === '/line-notes') { const r = await linkedLinesRoutes(req, env, path, who, ip, { id: A.id, tree: ctree }); if (r) return r; } // note KAIROS sulle linee (Armada, MirkoTeam, MaxPlayer, OrbixPlay)
  if (path === '/linked-lines' || path.startsWith('/linked-lines/')) { need('lines', 'Non puoi usare le linee collegate'); const r = await linkedLinesRoutes(req, env, path, who, ip, { id: A.id, tree: ctree, hideHosts: !((await getSettings(env)).playersCfg || {}).showDnsAgents, dnsHosts: servers.map((x) => x.host) }); if (r) return r; throw new HttpErr(404, 'Non trovato'); }
  // Errori dell'applicazione
  if (path === '/app-errors' && m === 'GET') {
    need('errors'); const sc = await scope(), j = await viaOwner(await adminErrors(req, env, path, url, who, ip, sc));
    if (j && j.countOnly) return json({ newCount: +j.newCount || 0, countOnly: true });
    const items = j.items.filter((x) => sc.has(x.deviceId)).map((x) => ({ ...x, srv: '' })); // pannelli e DNS: solo il titolare
    const by = (key) => { const mp = new Map(); for (const x of items) { const k = key(x); if (!k) continue; const o = mp.get(k) || { key: k, n: 0, unresolved: 0, devs: new Set(), titles: new Set() }; o.n++; if (x.outcome === 'non risolto') o.unresolved++; o.devs.add(x.deviceId); o.titles.add(x.title); mp.set(k, o); } return [...mp.values()].sort((a, b) => b.n - a.n).slice(0, 10).map((o) => ({ key: o.key, n: o.n, unresolved: o.unresolved, devices: o.devs.size, titles: o.titles.size })); };
    return json({ items, topTitles: by((x) => x.title), topDevices: by((x) => x.deviceId).map((o) => { const x = items.find((i) => i.deviceId === o.key) || {}; return { ...o, name: x.name, code: x.code, model: x.model }; }), newCount: items.filter((x) => x.isNew).length });
  }
  if (path === '/app-errors/seen' && m === 'POST') { need('errors'); return json({ ok: true }); }
  // Segnalazioni, richieste di contenuti, di temi e di domande all'assistente
  if (path === '/requests' && m === 'GET') {
    const kind = ['content', 'addon', 'ai'].includes(url.searchParams.get('kind')) ? url.searchParams.get('kind') : 'report';
    need(REQ_PERM[kind]); const sc = await scope(), j = await viaOwner(await adminRequests(req, env, path, url, who, ip, sc));
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
  // Store aperto: niente richieste da approvare né store intestati, quindi niente pagina «Download store» per gli agenti
  // (i download dello store non appartengono a nessun agente: li vede solo il titolare nel Riepilogo store)
  // «Codici per lo Store» (11 novembre 2026): codice usa e getta per scaricare dallo Store, solo con il permesso (spento di serie)
  if (path === '/store/codes' && (m === 'GET' || m === 'POST')) {
    need('stcodes', 'Non puoi generare codici per lo Store: chiedi al titolare il permesso «Codici per lo Store»');
    return storeCodes(req, env, m, { id: A.id, name: A.username, log: ses.assist ? who : '' }, ip); // in assistenza il codice è dell'agente, ma nel registro si legge chi l'ha generato
  }
  if (path === '/store' && m === 'GET') return json({ open: true, agent: true, requests: [], pending: 0, devices: [], stores: [], settings: { approval: false, activation: false, open: true }, mail: {} });
  if (path === '/store' || path.startsWith('/store/')) throw new HttpErr(410, 'Lo store è aperto: non ci sono più richieste da approvare');
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
  if (path === '/catalog/sources' || path === '/catalog' || path === '/catalog/info' || path === '/catalog/check') {
    need('vod');
    const sc = await scope(), all2 = await catalogSources(env), keys = new Set(), dn = dnA;
    const ids = [...sc];
    for (let i = 0; i < ids.length; i += 90) { const part = ids.slice(i, i + 90); for (const d of ((await env.DB.prepare(`SELECT playlists FROM devices WHERE playlists <> '' AND id IN (${part.map(() => '?').join(',')})`).bind(...part).all()).results) || []) for (const p of await unseal(env, d.playlists).catch(() => [])) { if (p.type !== 'xtream' || !p.host || !p.username) continue; const h = hostOf(p); if (h) keys.add((await sha256(`src:${h}|${p.username}|${p.password}`)).slice(0, 16)); } }
    if (path === '/catalog/sources') return json([...all2.values()].filter((x) => keys.has(x.key)).map((x) => ({ key: x.key, label: `${(dn.get(x.host) || {}).name || 'Server'} · ${x.user}`, devices: x.devices })));
    if (path === '/catalog/check') return json((await catalogCheck(env, [...all2.values()].filter((x) => keys.has(x.key)), (x) => `${(dn.get(x.host) || {}).name || 'Server'} · ${x.user}`, url.searchParams.get('fresh') === '1')).map((x) => ({ ...x, agents: [] })));
    if (!keys.has(str(url.searchParams.get('src') || '', 40))) throw new HttpErr(404, 'Linea non trovata');
    return adminRoutes(req, env, url, path, who, ip, ctx, aSes);
  }
  if (path === '/state' && m === 'GET') {
    // tutto ciò che non dipende dall'elenco dei clienti parte subito, in parallelo (prima erano una decina di attese una dopo l'altra)
    const chunks = (arr, k = 90) => { const o = []; for (let i = 0; i < arr.length; i += k) o.push(arr.slice(i, i + k)); return o; };
    const sP = getSettings(env), meP = agentsOut(env, all, [A.id], mine), snP = canAg ? storeAppNames(env) : Promise.resolve([]), pmP = presenceMap(env);
    const hidP = Promise.race([storeHiddenKeys(env).catch(() => new Set()), new Promise((r) => setTimeout(() => r(saHidMem.v), 2500))]); // app Kairos nascoste nello Store: agli agenti non si mostrano
    // DNS di MaxPlayer limitati: servono i domini per mostrargli solo i codici cliente dei fornitori concessi (al massimo 2,5 s di attesa)
    const mxP = P.players && env.MAXPLAYER_KEY && !P.mxDns.includes('*') ? Promise.race([mxDomains(env).catch(() => null), new Promise((r) => setTimeout(() => r(null), 2500))]) : Promise.resolve(null);
    const agP = canAg ? agentsOut(env, all, tree.filter((x) => x !== A.id), mine) : Promise.resolve([]);
    // inizio esatto «Agente nome:» (con LIKE «_» faceva da jolly e le maiuscole non contavano: «a_b» vedeva le azioni di «axb», «rosa» quelle di «Rosa»)
    const actP = P.activity ? env.DB.prepare('SELECT t, type, text FROM activity WHERE ' + ctree.map(() => 'instr(text, ?) = 1').join(' OR ') + ' ORDER BY t DESC LIMIT 200').bind(...ctree.map((id) => 'Agente ' + (by.get(id) || {}).username + ':')).all() : null;
    const msgP = P.messages ? env.DB.prepare('SELECT id, target, title, body, level, created, until, grp FROM messages ORDER BY id DESC LIMIT 3000').all() : null;
    const inboxP = ses.assist ? Promise.resolve([]) : (async () => { try { return ((await env.DB.prepare("SELECT id, title, body, level, created FROM agent_msgs WHERE (target = 'all' OR target = ?) AND (until = 0 OR until > ?) ORDER BY id DESC LIMIT 20").bind(String(A.id), now()).all()).results) || []; } catch { return []; } })();
    // i suoi clienti (principali) e le loro connessioni collegate: una sola query per gruppo di agenti
    const fam = (await Promise.all(chunks(ctree, 45).map((part) => { const q = part.map(() => '?').join(','); return env.DB.prepare(`SELECT * FROM devices WHERE parent = '' AND owner_id IN (${q}) UNION ALL SELECT * FROM devices WHERE parent IN (SELECT id FROM devices WHERE parent = '' AND owner_id IN (${q}))`).bind(...part, ...part).all(); }))).flatMap((r) => r.results || []);
    const s = await sP;
    const rows = fam.filter((d) => !d.parent && !(s.codeOnly && !+d.active && !d.playlists && !d.name && !d.notes && !d.expires)).sort((a, b) => (+b.created_at || 0) - (+a.created_at || 0)).slice(0, 5000), kept = new Set(rows.map((d) => d.id));
    const kids = fam.filter((d) => d.parent && kept.has(d.parent));
    dvOrb = agOrbList(await sP, P.orbDns).map((x) => hostKey(x.host));
    // «Da attivare» dell'agente (13 novembre 2026): le TV nuove scaricate con il codice dello Store suo (o di un suo sotto-agente)
    // le vede anche lui, non solo il titolare; le attiva o le collega come le altre (diventano sue al primo salvataggio)
    let recPend = [];
    try { recPend = (await Promise.all(chunks(ctree, 45).map((part) => env.DB.prepare(`SELECT * FROM devices WHERE ${FREE_DEV} AND rec_t > 0 AND rec_by IN (${part.map(() => '?').join(',')}) ORDER BY created_at DESC LIMIT 100`).bind(...part).all()))).flatMap((r) => r.results || []); } catch {}
    const devices = withPresence((await Promise.all([...rows, ...kids, ...recPend].map((d) => deviceOut(env, d)))).map(dview), await pmP); // in parallelo
    const recBy = new Map(recPend.map((d) => [d.id, d]));
    for (const x of devices) { const r = recBy.get(x.id); if (r) { x.status = 'pending'; x.dl = { by: +r.rec_by === A.id ? '' : r.rec_name || 'agente', mine: +r.rec_by === A.id }; } }
    const byId = new Map(devices.map((x) => [x.id, x]));
    for (const x of devices) if (x.parent) { const p = byId.get(x.parent); x.status = p ? p.status : 'pending'; }
    const [meArr, sAll, agList, actR, msgR, inbox, kHid] = await Promise.all([meP, snP, agP, actP, msgP, inboxP, hidP]);
    // pannelli esterni con un account suo (13 novembre 2026): senza account la voce del pannello non compare nel suo menu,
    // anche se il permesso è acceso (prima vedeva «Atlantix non collegato» pur non avendo Atlantix)
    const accKeys = ['wolf', 'atx', 'ro', 'slt'].map((k) => `${k}:ag:${A.id}`);
    const panelAcc = Object.fromEntries(['wolf', 'atx', 'ro', 'slt'].map((k) => [k, false]));
    try { for (const r of ((await env.DB.prepare(`SELECT k FROM settings WHERE k IN (${accKeys.map(() => '?').join(',')})`).bind(...accKeys).all()).results) || []) panelAcc[String(r.k).split(':')[0]] = true; } catch {}
    const meOut = meArr[0];
    const { password: _pw, ...meSafe } = meOut;
    const sNames = canAg ? sAll.filter((x) => storeAppOk(P.storeApps, x)) : [];
    const activationCatalog = await activationApps(env, s);
    return stateJson(req, { role: 'agent', user: A.username, rcCat: RC_CAT_AG.filter((c) => P.rcKeys.includes(c[0])), storeCodesOn: P.stcodes ? await storeCodesOn(env) : false, me: { ...meSafe, storeCode: await sellerAgentCode(env, A), perms: P, servers: mine, canAgents: canAg, clientsUsed: meOut.clients, payRemind: payRemindAgent(s), panelAcc }, devices, storeAppNames: sNames, dlCodes: P.dlcodes ? dlCodesOf(s).filter((x) => storeAppOk(P.dlcAllow, x.name)) : [], players: P.players ? agPlayers(env, s, P, await mxP) : null, maint: P.maint ? (({ on, msg, allow } = (s.maintAg || {})[A.id] || {}) => ({ on: !!on, msg: msg || '', allow: allow || [] }))() : null,
      agents: agList,
      activationApps: activationCatalog.filter((x) => activationAppAllowed(P, x)).map((x) => ({ key: x.key, name: x.name, aliases: activationAliases(x), enabled: activationAppEnabled(s, x), link: x.link ? x.link.url : '' })),
      appLinks: P.appstore ? (Array.isArray(s.appLinks) ? s.appLinks : []).filter((x) => storeAppOk(P.appsAllow, x.name)).map((x) => (/orbix|max\s*-?player/i.test(x.name) ? { ...x, url: '' } : x)) : [], // «Attiva app» (OrbixPlay/MaxPlayer senza indirizzo: l'agente le attiva dal pannello): solo le app consentite dal titolare (sola lettura)
      servers: servers.map((x) => ({ id: x.id, name: x.name })), addonCat: addonCfg(s).filter((a) => allowedAddons.has(a.id)),
      // codici Downloader e link delle app Kairos: solo quelli che il titolare gli concede (kAllow)
      settings: (() => { const ok = (k) => k === 'store' || (storeAppOk(P.kAllow, k) && !kHid.has(k)); return { brand: s.brand, accent: s.accent, downloaderCode: ok('pro') ? s.downloaderCode || '' : '', storeDownloaderCode: ok('store') ? s.storeDownloaderCode || '' : '', liteDownloaderCode: ok('lite') ? s.liteDownloaderCode || '' : '', ktvDownloaderCode: ok('tv') ? s.ktvDownloaderCode || '' : '', xcDownloaderCode: ok('xc') ? s.xcDownloaderCode || '' : '', ultDownloaderCode: ok('ult') ? s.ultDownloaderCode || '' : '', plusDownloaderCode: ok('plus') ? s.plusDownloaderCode || '' : '', premDownloaderCode: ok('prem') ? s.premDownloaderCode || '' : '', novaDownloaderCode: ok('nova') ? s.novaDownloaderCode || '' : '', apkUrl: ok('pro') ? s.apkUrl || '' : '' }; })(),
      // app Kairos per gli agenti: sempre visibili (quali le decide il titolare in kAllow), con il link pulito del pannello
      // (/get/<app>.apk: niente nome del titolare nei link) e il codice Downloader se c'è
      // il Kairos Store c'è sempre (13 novembre 2026): è da lì che i clienti scaricano le app
      kairosApps: kairosAppsOf(s).filter((x) => x.key === 'store' || (storeAppOk(P.kAllow, x.key) && !kHid.has(x.key))).map((x) => { const g = { prem: 'premium' }[x.key] || x.key; return { ...x, apk: GET_APK[g] ? `${url.origin}/get/${g}.apk` : x.apk }; }), permKeys: PERM_KEYS, security: { totp: !!(ses.assist ? A.totp_on : ses.totp_on), rec: (ses.assist ? A.totp_on : ses.totp_on) ? await recLeft(env, A.id) : 0 }, counts: {}, ...(ses.assist ? { assist: { by: ses.assistBy } } : {}),
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
    await log(env, 'new', `${who}: creato dispositivo ${str(b.name, 60) || code}`, ip); // per gli agenti /devices non lo scrive (il controllo del limite viene dopo)
    return json(j);
  }
  // «Aggiungi dispositivo» (11 novembre 2026): solo per un proprio cliente e solo le TV in attesa della sua stessa rete
  if (path === '/devices/near' && m === 'GET') {
    need('link', 'Non puoi gestire i collegamenti dei dispositivi');
    const c = await own(str(url.searchParams.get('for') || '', 20));
    if (!c || c.parent) throw new HttpErr(404, 'Cliente non trovato');
    return json(await devicesNear(env, c.id, A.id));
  }
  const dm = path.match(/^\/devices\/([A-Za-z0-9_-]{6,20})(\/reset|\/kick|\/linkcode|\/unlink|\/link)?$/);
  if (dm) {
    const d = await own(dm[1]);
    if (!d) {
      // «Attiva» su una TV da attivare scaricata con il suo codice: si attiva come «Nuovo cliente» con il codice della TV
      if (!dm[2] && m === 'PUT') {
        const t = await env.DB.prepare(`SELECT code, rec_by FROM devices WHERE id = ? AND ${FREE_DEV} AND rec_t > 0`).bind(dm[1]).first();
        if (t && ctree.includes(+t.rec_by)) {
          const b = await readJSON(req, 65536);
          const hh = new Headers(req.headers); hh.delete('Content-Length'); hh.set('Content-Type', 'application/json');
          return agentRoutes(new Request(url.origin + '/api/admin/devices', { method: 'POST', headers: hh, body: JSON.stringify({ ...b, code: t.code }) }), env, url, '/devices', ses, ip, ctx);
        }
      }
      // collegare una TV nuova (codice libero) a un proprio cliente
      if (dm[2] === '/link' && m === 'POST') {
        need('link', 'Non puoi gestire i collegamenti dei dispositivi');
        // la TV nuova si indica con il suo id oppure con il codice che il cliente vede (KXAB-12CD, da «Nuovo cliente»)
        const t = await env.DB.prepare('SELECT * FROM devices WHERE id = ?').bind(dm[1]).first() || (CODE_RE.test(codeNorm(dm[1])) ? await env.DB.prepare('SELECT * FROM devices WHERE code = ?').bind(codeNorm(dm[1])).first() : null);
        const b = await readJSON(req, 1024), pd = await own(str(b.primary, 20));
        if (!t || !(await env.DB.prepare(`SELECT 1 AS x FROM devices WHERE id = ? AND ${FREE_DEV}`).bind(t.id).first()) || !pd || pd.parent) throw new HttpErr(404, 'Dispositivo non trovato');
        // cliente pieno: l'agente può aumentare i dispositivi solo fino al tetto che gli dà il titolare («Connessioni per cliente»)
        let grow = false;
        if (b.grow === true) {
          const used = await connCount(env, pd), max = pd.max_conn ?? 1;
          if (used + 1 > max) {
            if (used + 1 > P.maxConn) throw new HttpErr(403, `Il tuo limite è ${P.maxConn} ${P.maxConn === 1 ? 'dispositivo' : 'dispositivi'} per cliente: chiedi al titolare di aumentarlo`);
            grow = true;
          }
        }
        return forward('POST', '/devices/' + t.id + '/link', { primary: pd.id, name: typeof b.name === 'string' ? str(b.name, 60) : '', ...(grow ? { grow: true } : {}) });
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
        // connessioni e visioni contano solo se l'agente le cambia davvero (il suo modulo le rimanda sempre): oltre il suo tetto le ha
        // decise il titolare e restano (prima a ogni salvataggio scendevano al tetto, o con più TV collegate il salvataggio falliva)
        const capped = (v, cur, min, what) => { const n = Math.max(min, v === 'unlim' || v === 'illimitati' ? CONN_UNLIM : parseInt(v, 10) || min); if (n === cur) return undefined; if (cur > P.maxConn) throw new HttpErr(403, `${what} di questo cliente (${cur >= CONN_UNLIM ? 'illimitate' : cur}) le ha decise il titolare: chiedile a lui`); return Math.min(P.maxConn, n); };
        if (b.maxConn !== undefined) { const n = capped(b.maxConn, d.max_conn ?? 1, 1, 'Le connessioni'); if (n !== undefined) o.maxConn = n; }
        if (b.addons !== undefined) { if (!Array.isArray(b.addons)) throw new HttpErr(400, 'addons deve essere un elenco'); const keep = addonsList(d.addons).filter((x) => !allowedAddons.has(x)); o.addons = [...keep, ...addonsList(b.addons).filter((x) => allowedAddons.has(x))]; }
        if (b.perms !== undefined) { if (!P.clientPerms) throw new HttpErr(403, 'Non puoi cambiare i permessi dell\'app'); o.perms = b.perms; }
        if (b.vpn !== undefined) { if (!P.vpn) throw new HttpErr(403, 'Non puoi cambiare la VPN'); o.vpn = b.vpn; }
        for (const k of ['maxProfiles', 'lockProfiles', 'maxStreams', 'plMode', 'plDefault', 'player', 'profiles']) if (b[k] !== undefined) { if (!P.account) throw new HttpErr(403, 'Non puoi cambiare profili, lettore e visioni'); o[k] = b[k]; }
        if (o.maxStreams !== undefined) { const n = capped(o.maxStreams, +d.max_streams || 0, 0, 'Le visioni'); if (n === undefined) delete o.maxStreams; else o.maxStreams = n; }
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
  if (path === '/info' && m === 'GET') { need('info', 'Il titolare non ti ha attivato la pagina Info'); const i = await infoGet(env); return json({ info: { news: i.news, newsAt: i.newsAt, apps: i.apps } }); } // pagina «Info»: l'agente legge soltanto, se il titolare gliel'ha attivata
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
  if (path === '/orcp/agents') {
    if (!ses || ses.agent || ses.assist) throw new HttpErr(403, 'Solo il titolare può assegnare l’app MirkoTeam');
    if (m !== 'PUT') throw new HttpErr(405, 'Metodo non consentito');
    const b = await readJSON(req, 131072);
    if (!b || typeof b !== 'object' || Array.isArray(b) || Object.keys(b).some((k) => !['dl', 'agents'].includes(k))) throw new HttpErr(400, 'Impostazioni MirkoTeam non valide');
    const dl = str(b.dl, 12).trim();
    if (!/^\d{1,12}$/.test(dl)) throw new HttpErr(400, 'Codice Downloader non valido: usa da 1 a 12 cifre');
    if (!Array.isArray(b.agents) || b.agents.length > 1000) throw new HttpErr(400, 'Elenco agenti non valido');
    const all = await agentsAll(env), byId = new Map(all.map((a) => [a.id, a])), seen = new Set(), updates = [];
    for (const row of b.agents) {
      if (!row || typeof row !== 'object' || Array.isArray(row) || Object.keys(row).some((k) => !['id', 'on', 'srv'].includes(k)) || !Number.isInteger(row.id) || row.id < 1 || seen.has(row.id) || typeof row.on !== 'boolean') throw new HttpErr(400, 'Agente non valido');
      seen.add(row.id);
      const srv = checkedOrcpServers(row.srv);
      if (!byId.has(row.id)) throw new HttpErr(400, `Agente ${row.id} non trovato`);
      const A = byId.get(row.id), parent = A.parent_id ? byId.get(A.parent_id) : null;
      const perms = agentPerms(A.perms);
      perms.orcpApp = row.on; perms.orcpSrv = srv;
      updates.push({ id: row.id, perms: agentPermsWithin(perms, parent ? agentPerms(parent.perms) : null), username: A.username });
    }
    await setOrcpDownloader(env, dl);
    for (let i = 0; i < updates.length; i += 100) {
      const batch = updates.slice(i, i + 100).map((row) => {
        return env.DB.prepare("UPDATE admins SET perms = ? WHERE id = ? AND role = 'agent'").bind(JSON.stringify(row.perms), row.id);
      });
      await env.DB.batch(batch);
    }
    if (updates.length) memoDrop(env, 'ags');
    await log(env, 'edit', `${who}: aggiornati i permessi App MirkoTeam di ${updates.length} agenti`, ip).catch(() => {});
    return json({ ok: true, updated: updates.length });
  }
  if (path.startsWith('/oxp/')) { if (!ses || ses.agent) throw new HttpErr(403, 'Solo il titolare può usare il Pannello OrbixPlay'); const r = await oxpRoutes(req, env, path, who, ip, WOLF_H); if (r) return r; }
  if (path.startsWith('/atx/')) { if (!ses || ses.agent) throw new HttpErr(403, 'Solo il titolare può usare il Pannello Atlantix'); const r = await atxRoutes(req, env, path, who, ip, WOLF_H); if (r) return r; }
  if (path.startsWith('/ora/')) { if (!ses || ses.agent) throw new HttpErr(403, 'Solo il titolare può usare il Pannello ORA'); const r = await oraRoutes(req, env, path, who, ip, WOLF_H); if (r) return r; }
  if (/^\/(ro|slt)\//.test(path)) { if (!ses || ses.agent) throw new HttpErr(403, 'Solo il titolare può usare questo pannello'); const r = await extRoutes(req, env, path, who, ip, WOLF_H); if (r) return r; }
  if (path.startsWith('/blk/')) { if (!ses || ses.agent) throw new HttpErr(403, 'Solo il titolare può usare il Pannello Black IPTV'); const r = await blkRoutes(req, env, path, who, ip, WOLF_H); if (r) return r; }
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
  // «Aggiungi dispositivo» e «stessa rete» (11 novembre 2026): TV in attesa per un cliente, o i suggerimenti per tutte
  if (path === '/devices/near' && m === 'GET' && !(ses && ses.agent)) return json(await devicesNear(env, str(url.searchParams.get('for') || '', 20), 0));
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
  if (path === '/store/summary' && m === 'GET') return storeAdmin(req, env, path, who, ip, 0); // riepilogo dello store aperto (solo titolare)
  if (path === '/store/codes' && (m === 'GET' || m === 'POST')) return storeCodes(req, env, m, { id: 0, name: 'Titolare' }, ip); // codici usa e getta per lo Store
  if (path === '/store-apps' || path === '/store-apps/icon') return storeApps(req, env, path, m, who, ip); // app dello store (solo titolare)
  if (path === '/store' || path.startsWith('/store/')) return storeAdmin(req, env, path, who, ip, 0, { smsAgentList: () => storeSmsAgentList(env) }); // Download store
  if ((path === '/notify' || path.startsWith('/notify/')) && ses && !ses.agent) return notifyAdmin(req, env, path, { id: ses.admin_id, username: ses.username, agent: false }, ip, url.origin, notifyH(env)); // avvisi Telegram / notifiche

  // «Il tuo accesso» (Sicurezza e account): codice, dispositivi ricordati, passkey, avvisi — solo il titolare
  if (path === '/own-sec' || path.startsWith('/own-sec/') || path === '/passkey/options' || path === '/passkey/register' || /^\/passkey\/[A-Za-z0-9_-]{16}$/.test(path)) {
    if (!ses || ses.agent) throw new HttpErr(403, 'Solo il titolare, dal pannello');
    return ownSec(req, env, url, path, m, ses, who, ip, ctx);
  }
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
    const pendTtl = effectivePendTtl(settings);
    if (pendTtl) await pendSweep(env, false, pendTtl).catch(() => {}); // al più ogni 5 minuti
    const [rowsR, activityR, messagesR, agentMsgsR, sessionsR, dnslOwner, wgR, apk, apkF, liteF, ktvF, xcF, ultF, plusF, sAppNames, nCounts, onl, agAll, presLast, presNow, presDns] = await Promise.all([
      env.DB.prepare('SELECT * FROM devices ORDER BY created_at DESC LIMIT 5000').all(),
      env.DB.prepare('SELECT t, type, text, ip FROM activity ORDER BY id DESC LIMIT 200').all(),
      env.DB.prepare('SELECT id, target, title, body, level, created, until, grp FROM messages ORDER BY id DESC LIMIT 3000').all().catch(() => ({ results: [] })),
      env.DB.prepare('SELECT id, target, title, body, level, created, until, grp FROM agent_msgs ORDER BY id DESC LIMIT 1000').all().catch(() => ({ results: [] })),
      ses ? env.DB.prepare('SELECT COUNT(*) AS n FROM sessions WHERE admin_id = ? AND expires > ?').bind(ses.admin_id, now()).first() : null,
      dnsList(env),
      env.DB.prepare('SELECT 1 AS x FROM settings WHERE k = ?').bind('wg').first(),
      latestApk(env, settings), apkFeed(env), liteFeed(settings, env), ktvFeed(settings, env), xcFeed(settings, env), ultFeed(settings, env), plusFeed(settings, env),
      storeAppNames(env), newCounts(env), onlineCount(env), ses ? agentsAll(env) : null, presenceMap(env), presenceNow(env), presenceSdns(env),
    ]);
    const rows = rowsR.results || [];
    const devices = withNow(withPresence(await Promise.all(rows.map((d) => deviceOut(env, d))), presLast), presNow);
    // DNS cifrato: lo stato dichiarato dall'app all'ultimo battito e, per spiegare un dispositivo che non lo dichiara, la
    // versione dell'app e se il pannello lo vuole acceso (sdnsWant): «non acceso», «app da aggiornare», «alla prossima apertura»
    const wantDns = sdnsWanted(settings);
    for (let i = 0; i < devices.length; i++) {
      const x = devices[i], p = presDns.get(x.id);
      if (p && SDNS_ST.includes(p.sdns)) x.sdns = p.sdns;
      if (p && p.ver) x.ver = p.ver.slice(0, 40);
      try { if (wantDns(rows[i], appOfVer(p ? p.ver : '', rows[i].app))) x.sdnsWant = true; } catch {}
    }
    const byId = new Map(devices.map((x) => [x.id, x]));
    for (const x of devices) if (x.parent) { const p = byId.get(x.parent); x.status = p && !p.parent ? p.status : 'pending'; }
    const activity = activityR.results || [], messages = msgGroups(messagesR.results || []).slice(0, 150), agentMsgs = msgGroups(agentMsgsR.results || []).slice(0, 100), sessions = sessionsR ? sessionsR.n : 0;
    return stateJson(req, {
      settings, devices, activity, messages, agentMsgs, user: who, apk, apkFeed: apkF, storeCodesOn: await storeCodesOn(env),
      wgConf: !!wgR,
      security: { totp: !!(ses && ses.totp_on), rec: ses && ses.totp_on ? await recLeft(env, ses.admin_id) : 0, encryption: !!env.ENC_KEY, access: !!(env.ACCESS_AUD && env.ACCESS_TEAM_DOMAIN), turnstile: !!env.TURNSTILE_SECRET, sessions },
      lite: { apk: settings.liteApkUrl || LITE_APK, feed: liteF },
      ktv: { apk: settings.ktvApkUrl || KTV_APK, feed: ktvF },
      xc: { apk: settings.xcApkUrl || XC_APK, feed: xcF },
      ult: { apk: settings.ultApkUrl || ULT_APK, feed: ultF },
      plus: { apk: settings.plusApkUrl || PLUS_APK, feed: plusF },
      ...(await Promise.all([premFeed(env), novaFeed(env)]).then(([pf, nf]) => ({ prem: { apk: PREM_APK, feed: pf }, nova: { apk: NOVA_APK, feed: nf } })).catch(() => ({}))),
      players: { orbix: !!env.ORBIX_KEY, max: !!env.MAXPLAYER_KEY, dns: { orbix: orbixDnsList(settings.playersCfg.orbix, dnslOwner), max: settings.playersCfg.max || [] }, showDnsAgents: !!settings.playersCfg.showDnsAgents, codes: settings.playersCfg.codes || { orbix: '265847', max: '265847' }, slots: slotsOf(settings.playersCfg) },
      dlCodes: dlCodesOf(settings),
      rcCat: RC_CAT_AG,
      storeOwnerCode: await sellerOwnerCode(env),
      storeAppNames: sAppNames, activationApps: (await activationApps(env, settings)).map((x) => ({ key: x.key, name: x.name, aliases: activationAliases(x), enabled: activationAppEnabled(settings, x), link: x.link ? x.link.url : '' })), maintAg: Object.entries(settings.maintAg || {}).filter(([, x]) => x && x.on).map(([id]) => +id),
      counts: { ...nCounts, online: onl }, permKeys: PERM_KEYS, addonCat: addonCfg(settings), role: 'owner', ...(ses ? { agents: await agentsOut(env, agAll) } : {}),
    });
  }

  /* ---------- utenti online ---------- */
  if (path === '/presence' && m === 'GET') return json(await adminPresence(env));
  /* ---------- «🔒 Repo privati»: chi deve ancora aggiornare le app (solo titolare) ---------- */
  if (path === '/repo-ready' && m === 'GET') { if (!ses || ses.agent) throw new HttpErr(403, 'Riservato al titolare'); return json(await repoReady(env)); }
  /* ---------- «Eventi ora» ---------- */
  if (path === '/events' && m === 'GET') return json(await panelEvents(env, ctx));
  if (path === '/events/chans' && m === 'GET') return json(await eventsChans(env));
  if (path === '/events/epg' && m === 'GET') return json(await eventsEpg(env, String(url.searchParams.get('ids') || '').split(',').map((x) => x.trim()).filter((x) => /^[A-Za-z0-9_-]{1,20}$/.test(x))));
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
      return json({ apps: rcProfiles(s0), cat: RC_CAT, cmds: RC_CMDS, appNames: APP_NAME, linked: RC_LINKED, devs, over: ov, last, pending: pend, adultWords: ADULT_HOME_WORDS, adultApps: [...ADULT_MERGE_APPS] });
    }
    const pa = path.match(/^\/rctl\/app\/(tv|ktv|prem|lite|xc|ult|plus|nova|portal|smart|heavy)$/);
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
          const base = keyBase(k), c = rcCatFor(base, a); if (!c[4].includes(a)) continue;
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
      const b = await readJSON(req, 8192), rc = rcNoProf(rcClean(b.rc || {}, d.app));
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
      // un comando uguale già in attesa non si duplica (quelli scaduti, mai consegnati, non contano più)
      const have = new Set();
      for (let i = 0; i < ids.length; i += 90) { const part = ids.slice(i, i + 90); for (const r of ((await env.DB.prepare(`SELECT device_id FROM remote_cmds WHERE done = 0 AND cmd = ? AND created > ? AND device_id IN (${part.map(() => '?').join(',')})`).bind(C[0], t - RC_CMD_TTL, ...part).all()).results) || []) have.add(r.device_id); }
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
  // Backup completo dei dati e ripristino (solo titolare, con la sua password): vedi bkRoutes
  if (path.startsWith('/backup/') || path.startsWith('/restore/')) {
    if (!ses || ses.agent || m !== 'POST') throw new HttpErr(403, 'Il backup è riservato al titolare');
    return json(await bkRoutes(req, env, path, ses, who, ip));
  }
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
  // dispositivi collegati di un agente (11 novembre 2026, Agenti → Link accesso): vedere e scollegare
  const asm = path.match(/^\/agents\/(\d+)\/sessions(?:\/([A-Za-z0-9_-]{16}))?$/);
  if (asm) {
    if (!ses || ses.agent) throw new HttpErr(403, 'Solo il titolare, dal pannello');
    const A = await env.DB.prepare("SELECT id, username FROM admins WHERE id = ? AND role = 'agent'").bind(+asm[1]).first();
    if (!A) throw new HttpErr(404, 'Agente non trovato');
    const rows = ((await env.DB.prepare('SELECT id, created_at, expires, ua, geo FROM sessions WHERE admin_id = ? AND expires > ? ORDER BY created_at DESC').bind(A.id, now()).all()).results) || [];
    if (m === 'GET' && !asm[2]) {
      // ultimo uso: la sessione si rinnova al massimo ogni 6 ore, quindi è indicativo
      return json({ sessions: rows.map((r) => ({ sid: String(r.id).slice(0, 16), dev: uaShort(r.ua), where: r.geo || '', created: +r.created_at || 0, seen: Math.max(+r.created_at || 0, (+r.expires || 0) - SESSION_TTL * 1000) })) });
    }
    if (m === 'DELETE' && asm[2]) {
      const r = rows.find((x) => String(x.id).slice(0, 16) === asm[2]);
      if (!r) throw new HttpErr(404, 'Dispositivo non trovato: forse è già uscito');
      await sesOut(env, r.id, 'kick', KICK_MSG);
      await log(env, 'auth', `${who}: scollegato un dispositivo dell'agente ${A.username} (${uaShort(r.ua)}${r.geo ? ', ' + r.geo : ''})`, ip);
      return json({ ok: true });
    }
    throw new HttpErr(405, 'Metodo non consentito');
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
      // rigenerato: chi era entrato con il link vecchio viene scollegato (prima restava dentro fino a 30 giorni)
      if (A.link_seal) await env.DB.prepare('DELETE FROM sessions WHERE admin_id = ?').bind(A.id).run();
      memoDrop(env, 'ags');
      await log(env, 'settings', `${who}: ${A.link_seal ? 'nuovo' : 'creato il'} link di accesso dell'agente ${A.username}${A.link_seal ? ' (sessioni chiuse)' : ''}`, ip);
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
  if (path === '/activity/panel' && m === 'GET') {
    if (!ses || ses.agent || ses.assist) throw new HttpErr(403, 'Il registro è disponibile solo al titolare');
    const panelName = { wolf: 'WOLF', armada: 'Armada', storm: 'Storm', atx: 'Atlantix', ro: 'Realott', slt: 'SLT' }[url.searchParams.get('p') || ''];
    if (!panelName) throw new HttpErr(400, 'Pannello non valido');
    const kind = url.searchParams.get('kind') || 'all';
    if (!['all', 'lines', 'renew', 'credits', 'resellers'].includes(kind)) throw new HttpErr(400, 'Filtro non valido');
    const beforeText = url.searchParams.get('before') || '';
    const before = beforeText ? Number(beforeText) : 0;
    if (beforeText && (!/^\d{1,18}$/.test(beforeText) || !Number.isSafeInteger(before) || before < 1)) throw new HttpErr(400, 'Pagina non valida');
    const q = str(url.searchParams.get('q') || '', 120).trim().toLowerCase();
    const where = ['(instr(text, ?) > 0 OR instr(text, ?) > 0 OR instr(text, ?) > 0)'];
    const args = [` ${panelName} — `, `pannello ${panelName} `, `account ${panelName}`];
    if (kind === 'renew') {
      where.push("(instr(lower(text), 'rinnov') > 0 OR instr(lower(text), 'estesa') > 0 OR instr(lower(text), 'correzione') > 0)");
    } else if (kind === 'credits') {
      where.push("instr(lower(text), 'credit') > 0");
    } else if (kind === 'resellers') {
      where.push("(instr(lower(text), 'reseller') > 0 OR instr(lower(text), 'sub-reseller') > 0 OR instr(lower(text), 'venditore') > 0)");
    } else if (kind === 'lines') {
      where.push("(instr(lower(text), 'linea') > 0 OR instr(lower(text), 'mag') > 0 OR instr(lower(text), 'linee') > 0)");
      where.push("instr(lower(text), 'rinnov') = 0 AND instr(lower(text), 'estesa') = 0 AND instr(lower(text), 'correzione') = 0 AND instr(lower(text), 'credit') = 0 AND instr(lower(text), 'reseller') = 0 AND instr(lower(text), 'venditore') = 0");
    }
    if (q) { where.push('instr(lower(text), ?) > 0'); args.push(q); }
    if (before) { where.push('id < ?'); args.push(before); }
    const result = await env.DB.prepare(`SELECT id, t, type, text FROM activity WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT 101`).bind(...args).all();
    const all = result.results || [], rows = all.slice(0, 100);
    return json({ rows: rows.map(({ id, t, type, text }) => ({ id, t, type, text })), more: all.length > 100 });
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
  if (path === '/health/hide' && m === 'POST') {
    const b = await readJSON(req, 12 * 1024);
    if (b.all === true && b.ids !== undefined || b.all !== true && !Array.isArray(b.ids)) throw new HttpErr(400, 'Indica i clienti da togliere');
    let ids = b.all === true ? null : b.ids;
    if (ids && (ids.length > 300 || ids.some((id) => typeof id !== 'string' || !/^[A-Za-z0-9_-]{6,20}$/.test(id)))) throw new HttpErr(400, 'Elenco clienti non valido');
    const s = await getSettings(env);
    if (b.all === true) ids = (await healthList(env, s, null)).list.map((x) => x.id);
    ids = [...new Set(ids)];
    const current = await healthList(env, s, new Set(ids));
    const prior = current.list.length ? ((await env.DB.prepare(`SELECT id, hl_hide FROM devices WHERE id IN (${current.list.map(() => '?').join(',')})`).bind(...current.list.map((x) => x.id)).all()).results || []) : [];
    const priorKeys = new Map(prior.map((x) => { let keys = []; try { const h = JSON.parse(x.hl_hide || ''); if (Array.isArray(h.keys)) keys = h.keys.filter((k) => typeof k === 'string'); } catch {} return [x.id, keys]; }));
    const t = now(), updates = current.list.map((x) => env.DB.prepare('UPDATE devices SET hl_hide = ? WHERE id = ?').bind(JSON.stringify({ t, keys: [...new Set([...(priorKeys.get(x.id) || []), ...x.issues.map((i) => i.key)])] }), x.id));
    if (updates.length) await env.DB.batch(updates);
    await log(env, 'edit', `${who}: ${updates.length} clienti tolti da «Salute delle app»`, ip);
    return json({ ok: true, updated: updates.length });
  }
  if (path === '/health/unhide' && m === 'POST') {
    const b = await readJSON(req, 12 * 1024);
    if (b.all === true && b.ids !== undefined || b.all !== true && !Array.isArray(b.ids)) throw new HttpErr(400, 'Indica i clienti da ripristinare');
    const ids = b.all === true ? null : b.ids;
    if (ids && (ids.length > 300 || ids.some((id) => typeof id !== 'string' || !/^[A-Za-z0-9_-]{6,20}$/.test(id)))) throw new HttpErr(400, 'Elenco clienti non valido');
    const result = ids === null
      ? await env.DB.prepare("UPDATE devices SET hl_hide = '' WHERE hl_hide <> ''").run()
      : ids.length ? await env.DB.prepare(`UPDATE devices SET hl_hide = '' WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).run() : { meta: { changes: 0 } };
    const n = +(result.meta && result.meta.changes) || 0;
    await log(env, 'edit', `${who}: ${n} clienti ripristinati in «Salute delle app»`, ip);
    return json({ ok: true, updated: n });
  }
  /* ---------- «Canali non funzionanti» (autopilota, solo titolare: gli agenti hanno 403) ---------- */
  if (path === '/dead-channels' && m === 'GET') {
    const o = await deadRefresh(env, url.searchParams.get('fresh') === '1' ? 0 : 30e3), byHost = new Map((await dnsList(env)).map((x) => [hostKey(x.host), x.name || '']));
    const list = Object.entries(o.d).map(([ck, x]) => { const i = ck.lastIndexOf('|'), h = ck.slice(0, i); return { ck, name: x.n || '', host: h, dns: byHost.get(h) || '', sid: ck.slice(i + 1), devs: +x.devs || 0, fails: +x.f || 0, first: +x.t0 || 0, last: +x.t1 || 0, since: +x.since || 0 }; }).sort((a, b) => b.last - a.last);
    return json({ list, candidates: Object.keys(o.c).length, at: o.at, rules: { devices: 2, minutes: DEAD_SPAN_MS / 60e3, hours: DEAD_WINDOW_MS / 3600e3 } });
  }
  const dch = path.match(/^\/dead-channels\/([^/]{3,260})$/);
  if (dch && m === 'DELETE') {
    let ck = ''; try { ck = ckClean(decodeURIComponent(dch[1])); } catch {}
    if (!ck) throw new HttpErr(400, 'Canale non valido');
    const o = await deadOf(env), x = o.d[ck];
    delete o.d[ck]; delete o.c[ck]; o.ok[ck] = now();
    await deadSave(env, o);
    await log(env, 'edit', `${who}: canale «${(x && x.n) || ck}» segnato come funzionante (torna al suo posto nelle app)`, ip);
    return json({ ok: true });
  }
  if (path === '/guide' && m === 'GET') { const g = guideNorm((await getSettings(env)).guide); return json({ guide: { ...g, readBy: g.noticeAt ? (await guideReads(env)).filter((x) => +x.at >= g.noticeAt).map((x) => String(x.agent_id)) : [], defTitle: GUIDE_DEF_TITLE, defText: GUIDE_DEF_TEXT } }); }
  if (path === '/info' && m === 'GET') return json({ info: { ...(await infoGet(env)), defApps: INFO_APPS_DEF } });
  if (path === '/info' && m === 'PUT') {
    const i = await infoPut(env, await readJSON(req, 64 * 1024));
    await log(env, 'settings', `${who}: pagina «Info» aggiornata (agenti: comunicazione ${i.news ? 'scritta' : 'vuota'}; Store: comunicazione ${i.sNews ? 'pubblicata' : 'vuota'}, guida ${i.sApps ? 'pubblicata' : 'non mostrata'})`, ip);
    return json({ info: { ...i, defApps: INFO_APPS_DEF } });
  }
  if (path === '/guide' && m === 'PUT') {
    const b = await readJSON(req, 64 * 1024), cur = guideNorm((await getSettings(env)).guide), g = guideNorm({ ...b, noticeAt: cur.noticeAt });
    if (b.notify === true && g.share !== 'none') g.noticeAt = Date.now(); // «Avvisali all'apertura»: gli agenti scelti vedono «Nuova guida da leggere» finché non la aprono
    if (g.share === 'none') g.noticeAt = 0;
    await settingsPatch(env, { guide: g });
    await log(env, 'settings', `${who}: guida della Panoramica aggiornata (${g.share === 'all' ? 'tutti gli agenti' : g.share === 'some' ? g.agents.length + ' agenti' : 'solo titolare'})`, ip);
    return json({ guide: { ...g, readBy: [], defTitle: GUIDE_DEF_TITLE, defText: GUIDE_DEF_TEXT } });
  }
  if (path === '/health/settings' && m === 'PUT' && !(ses && ses.agent)) {
    const b = await readJSON(req, 1024), s0 = await getSettings(env), h = { on: !!(s0.health && s0.health.on), autoUpd: !!(s0.health && s0.health.autoUpd), autoFix: !!(s0.health && s0.health.autoFix), card: !(s0.health && s0.health.card === false) };
    if (typeof b.on === 'boolean') h.on = b.on; if (typeof b.autoUpd === 'boolean') h.autoUpd = b.autoUpd; if (typeof b.autoFix === 'boolean') h.autoFix = b.autoFix; if (typeof b.card === 'boolean') h.card = b.card;
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
  if (path === '/agent-ledger' || path.startsWith('/agent-ledger/')) {
    if (!ses || ses.agent) throw new HttpErr(403, 'Il registro debiti è riservato al titolare');
    if (path === '/agent-ledger' && m === 'GET') {
      const id = url.searchParams.get('agent');
      if (!id) return json({ agents: await agentLedgerSummary(env) });
      if (!/^\d{1,9}$/.test(id)) throw new HttpErr(400, 'Agente non valido');
      if (!(await env.DB.prepare("SELECT id FROM admins WHERE id = ? AND role = 'agent'").bind(+id).first())) throw new HttpErr(404, 'Agente non trovato');
      return json(await agentLedgerDetail(env, +id));
    }
    if (path === '/agent-ledger' && m === 'POST') return json(await addAgentLedgerEntry(req, env, who, ip));
    const ledgerDelete = path.match(/^\/agent-ledger\/(\d{1,12})$/);
    if (ledgerDelete && m === 'PUT') {
      const row = await env.DB.prepare('SELECT * FROM agent_ledger WHERE id = ?').bind(+ledgerDelete[1]).first();
      if (!row) throw new HttpErr(404, 'Movimento non trovato');
      const entry = cleanAgentLedgerEntry(await readJSON(req, 4096));
      const date = new Date(+row.t).toISOString().slice(0, 10);
      const t = date === entry.date ? +row.t : entry.t;
      const updated = { ...row, ...entry, t };
      await env.DB.prepare('UPDATE agent_ledger SET t = ?, type = ?, eur = ?, credits = ?, panel = ?, note = ? WHERE id = ?')
        .bind(updated.t, updated.type, updated.eur, updated.credits, updated.panel, updated.note, +ledgerDelete[1]).run();
      await log(env, 'edit', `${who}: movimento del registro agente ${row.agent_id} modificato · ${agentLedgerAudit(row)} → ${agentLedgerAudit(updated)}`, ip);
      return json({ ok: true });
    }
    if (ledgerDelete && m === 'DELETE') {
      const row = await env.DB.prepare('SELECT agent_id, type, eur, credits, panel, note FROM agent_ledger WHERE id = ?').bind(+ledgerDelete[1]).first();
      if (!row) throw new HttpErr(404, 'Movimento non trovato');
      await env.DB.prepare('DELETE FROM agent_ledger WHERE id = ?').bind(+ledgerDelete[1]).run();
      await log(env, 'edit', `${who}: movimento del registro agente ${row.agent_id} eliminato · ${row.type} · ${row.eur} € · ${row.credits} crediti`, ip);
      return json({ ok: true });
    }
    throw new HttpErr(405, 'Metodo non consentito');
  }
  if (path === '/payments') { if (!ses) throw new HttpErr(403, 'Funzione disponibile solo dal pannello'); return paymentsRoutes(req, env, who, ip, null); }
  if (path === '/line-sync' || path.startsWith('/line-sync/')) { if (!ses) throw new HttpErr(403, 'Funzione disponibile solo dal pannello'); return lineSyncRoutes(req, env, path, who, ip, null, ses.id === 'auto-renew' ? 0 : undefined); }
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
    if (m === 'DELETE') { const [x] = list.splice(i, 1); for (const item of list) item.alts = (item.alts || []).filter((id) => id !== x.id); await trashPut(env, 'dns', x.id, `${x.name} (${x.host})`, x, null, who); await dnsSave(env, list);
      // 13 novembre 2026: il DNS tolto esce anche dai «Server delle linee» degli agenti. Prima restava scritto (nascosto) e,
      // ripristinandolo dal Cestino, ricompariva assegnato a chi lo aveva avuto, anche se nel frattempo era stato tolto.
      for (const ag of await agentsAll(env)) { const sv = serverIds(ag.servers); if (sv.includes(x.id)) await env.DB.prepare("UPDATE admins SET servers = ? WHERE id = ? AND role = 'agent'").bind(sv.filter((y) => y !== x.id).join(','), ag.id).run(); }
      memoDrop(env, 'ags'); await log(env, 'settings', `${who}: DNS tolto dall'elenco · ${x.name} (i clienti non cambiano)`, ip); return json({ ok: true }); }
    const b = await readJSON(req, 4096);
    if (typeof b.name === 'string') list[i].name = nameClean(b.name, 40) || list[i].name;
    if (typeof b.host === 'string') { const h = cleanHost(b.host); if (list.some((x, j) => j !== i && x.host === h)) throw new HttpErr(400, 'Questo DNS è già salvato'); list[i].host = h; }
    if (b.alts !== undefined) list[i].alts = [...new Set((Array.isArray(b.alts) ? b.alts : []).filter((id) => typeof id === 'string' && id !== list[i].id && list.some((x) => x.id === id)))].slice(0, 4);
    if (b.mode !== undefined) list[i].mode = ['auto', 'main', 'alt', 'rot'].includes(b.mode) ? b.mode : 'auto';
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
    if (!(await addonAsset(env, id))) throw new HttpErr(404, 'Tema non trovato');
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
  if (apv && m === 'GET') { const a = await addonAsset(env, apv[1]); if (!a || !a.prev) throw new HttpErr(404, 'Anteprima non disponibile'); return json({ id: apv[1], bg: a.prev.bg, avs: a.prev.avs }, 200, { 'Cache-Control': 'private, max-age=3600' }); }
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
  if (path === '/health-check' && m === 'GET') {
    if (!ses || ses.agent) throw new HttpErr(403, 'Il controllo generale è riservato al titolare');
    return json(await generalHealthCheck(env, url.searchParams.get('fresh') === '1'));
  }
  if (path === '/catalog/sources' && m === 'GET') {
    const srcs = await catalogSources(env);
    return json([...srcs.values()].map((s) => ({ key: s.key, label: `${s.host.replace(/^https?:\/\//, '')} · ${s.user}`, host: s.host, devices: s.devices })).sort((a, b) => b.devices - a.devices || a.label.localeCompare(b.label)));
  }
  if (path === '/catalog/check' && m === 'GET') {
    const srcs = await catalogSources(env);
    return json(await catalogCheck(env, [...srcs.values()], (s) => `${s.host.replace(/^https?:\/\//, '')} · ${s.user}`, url.searchParams.get('fresh') === '1'));
  }
  if (path === '/catalog/info' && m === 'GET') {
    try { return json(await adminCatalogInfo(env, url)); }
    catch (e) { if (e instanceof HttpErr) throw e; return json({ error: e && e.name === 'TimeoutError' ? 'Il server di questa linea non ha risposto entro 45 secondi: può essere lento o non accettare collegamenti da KAIROS. Le app dei clienti non sono toccate.' : 'Il server di questa linea non è raggiungibile da KAIROS. Le app dei clienti non sono toccate.' }, 502); }
  }
  if (path === '/catalog' && m === 'GET') {
    try { return json(await adminCatalog(env, url)); }
    catch (e) { if (e instanceof HttpErr) throw e; return json({ error: e && e.name === 'TimeoutError' ? 'Il server di questa linea non ha risposto entro 45 secondi: può essere lento o non accettare collegamenti da KAIROS. Le app dei clienti non sono toccate.' : 'Il server di questa linea non è raggiungibile da KAIROS. Le app dei clienti non sono toccate.' }, 502); }
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
    for (const k of ['brand', 'tagline', 'accent', 'announcement', 'supportContact', 'downloaderCode', 'storeDownloaderCode', 'liteDownloaderCode', 'ktvDownloaderCode', 'xcDownloaderCode', 'ultDownloaderCode', 'plusDownloaderCode', 'premDownloaderCode', 'novaDownloaderCode']) if (typeof b[k] === 'string') s[k] = str(b[k], k === 'announcement' ? 300 : 80);
    if (typeof b.apkUrl === 'string') { const u = str(b.apkUrl, 500); s.apkUrl = !u || /^https:\/\//.test(u) ? u : s.apkUrl; }
    if (typeof b.plusApkUrl === 'string') { const u = str(b.plusApkUrl, 500); if (u && !/^https:\/\//.test(u)) throw new HttpErr(400, 'Il link di Kairos Plus deve iniziare con https://'); s.plusApkUrl = u; }
    if (typeof b.xcApkUrl === 'string') { const u = str(b.xcApkUrl, 500); if (u && !/^https:\/\//.test(u)) throw new HttpErr(400, 'Il link di Kairos XC deve iniziare con https://'); s.xcApkUrl = u; }
    if (typeof b.ultApkUrl === 'string') { const u = str(b.ultApkUrl, 500); if (u && !/^https:\/\//.test(u)) throw new HttpErr(400, 'Il link di KAIROS Ultimate deve iniziare con https://'); s.ultApkUrl = u; }
    if (typeof b.ktvApkUrl === 'string') { const u = str(b.ktvApkUrl, 500); if (u && !/^https:\/\//.test(u)) throw new HttpErr(400, 'Il link di Kairos TV deve iniziare con https://'); s.ktvApkUrl = u; }
    if (typeof b.liteApkUrl === 'string') { const u = str(b.liteApkUrl, 500); if (u && !/^https:\/\//.test(u)) throw new HttpErr(400, 'Il link di Kairos Lite deve iniziare con https://'); s.liteApkUrl = u; }
    if (typeof b.allowLocalPlaylists === 'boolean') s.allowLocalPlaylists = b.allowLocalPlaylists;
    if (typeof b.showFootball === 'boolean') s.showFootball = b.showFootball;
    if (b.sports !== undefined) { // sport da mostrare nella Home (vale con «Eventi sportivi nella Home» acceso)
      if (!Array.isArray(b.sports)) throw new HttpErr(400, 'Sport non validi');
      s.sports = SPORTS.filter((k) => b.sports.includes(k));
    }
    if (typeof b.aiOff === 'boolean') s.aiOff = b.aiOff; // interruttore rapido: assistente IA spento per tutti
    if (b.aiDaily !== undefined) { const n = parseInt(b.aiDaily, 10); if (!(n >= 0 && n <= 1000)) throw new HttpErr(400, 'Domande al giorno: da 0 a 1000'); s.aiDaily = n; }
    if (b.aiProvider !== undefined) { if (!AI_PROVIDERS.includes(b.aiProvider)) throw new HttpErr(400, 'Servizio non valido'); s.aiProvider = b.aiProvider; }
    if (b.dlCodes !== undefined) s.dlCodes = cleanDlCodes(b.dlCodes);
    if (b.payRemind !== undefined) { // Impostazioni → Promemoria pagamenti
      const v = b.payRemind;
      if (!v || typeof v !== 'object' || Array.isArray(v)) throw new HttpErr(400, 'Impostazioni dei promemoria non valide');
      const d = Number(v.def);
      if (v.def !== undefined && !(d === -1 || PAY_REMIND_DAYS.includes(d))) throw new HttpErr(400, 'Promemoria proposto non valido');
      const a = v.ag && typeof v.ag === 'object' && !Array.isArray(v.ag) ? v.ag : {};
      for (const [k, x] of Object.entries(a)) if (!['on', 'd0', 'd1', 'd2', 'd3', 'd7', 'from'].includes(k) || typeof x !== 'boolean') throw new HttpErr(400, 'Opzione dei promemoria non valida');
      const cur = payRemindCfg(s);
      s.payRemind = payRemindCfg({ payRemind: { def: v.def === undefined ? cur.def : d, ag: { ...cur.ag, ...a } } });
    }
    if (b.storeOwnerCode !== undefined) {
      const c = sellerNorm(b.storeOwnerCode);
      if (!SELLER_RE.test(c)) throw new HttpErr(400, 'Codice venditore: da 3 a 8 lettere o cifre');
      const dup = (await agentsAll(env)).find((x) => x.store_code === c); if (dup) throw new HttpErr(400, `Il codice ${c} è già dell'agente ${dup.username}`);
      s.storeOwnerCode = c;
    }
    if (b.appLinks !== undefined) s.appLinks = cleanAppLinks(b.appLinks);
    if (b.actApps !== undefined) {
      if (!b.actApps || typeof b.actApps !== 'object' || Array.isArray(b.actApps)) throw new HttpErr(400, 'Impostazioni app da attivare non valide');
      const known = await activationApps(env, s);
      if (known.some((x) => activationAliases(x).some((key) => Object.hasOwn(b.actApps, key) && typeof b.actApps[key] !== 'boolean'))) throw new HttpErr(400, 'Ogni app da attivare deve essere Sì o No');
      s.actApps = Object.fromEntries(known.map((x) => {
        const aliases = activationAliases(x);
        const enabled = Object.hasOwn(b.actApps, x.key) ? b.actApps[x.key] === true : aliases.some((key) => b.actApps[key] === true);
        return [x.key, enabled];
      }));
    }
    let pendNow = 0;
    if (b.codeOnly !== undefined) {
      if (!ses || ses.agent || ses.assist) throw new HttpErr(403, 'Impostazione riservata al titolare');
      if (typeof b.codeOnly !== 'boolean') throw new HttpErr(400, 'Impostazione non valida');
      if (!!s.codeOnly !== b.codeOnly) await log(env, 'settings', `${who}: attivazione solo con codice ${b.codeOnly ? 'accesa' : 'spenta'}`, ip);
      s.codeOnly = b.codeOnly;
    }
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
    if (b.trailerLang !== undefined) { // lingua dei trailer cercati dal pannello (12 novembre 2026): la decide il titolare
      if (!ses || ses.agent || ses.assist) throw new HttpErr(403, 'Impostazione riservata al titolare');
      if (!['it', 'en'].includes(b.trailerLang)) throw new HttpErr(400, 'Lingua dei trailer non valida: italiano o inglese');
      if (trailerLangOf(s) !== b.trailerLang) await log(env, 'settings', `${who}: trailer cercati in ${b.trailerLang === 'en' ? 'inglese' : 'italiano'}`, ip);
      s.trailerLang = b.trailerLang;
    }
    if (b.reqWait !== undefined) { const was = JSON.stringify(cleanReqWait(s.reqWait)); s.reqWait = cleanReqWait({ ...cleanReqWait(s.reqWait), ...(b.reqWait && typeof b.reqWait === 'object' ? b.reqWait : {}) }); if (JSON.stringify(s.reqWait) !== was) await log(env, 'edit', `${who}: tempi di attesa delle richieste aggiornati`, ip); }
    let kicked = 0;
    if (b.agSec !== undefined) {
      // «Accesso degli agenti» (Sicurezza e account): 7 giorni, 2 dispositivi, Paesi consentiti
      const x = b.agSec;
      if (!x || typeof x !== 'object' || Array.isArray(x) || ['week', 'two', 'geo', 'tg', 'tfa'].some((k) => x[k] !== undefined && typeof x[k] !== 'boolean')) throw new HttpErr(400, 'Impostazioni di accesso degli agenti non valide');
      const was = agSecNorm(s.agSec), nx = { ...was };
      for (const k of ['week', 'two', 'geo', 'tg', 'tfa']) if (typeof x[k] === 'boolean') nx[k] = x[k];
      if (x.cc !== undefined) {
        if (!Array.isArray(x.cc) || x.cc.length > 60 || x.cc.some((c) => typeof c !== 'string' || !CC_RE.test(c.toUpperCase()))) throw new HttpErr(400, 'Paese non valido: usa il codice di 2 lettere (es. IT)');
        const cc = [...new Set(x.cc.map((c) => c.toUpperCase()))];
        if (!cc.length) throw new HttpErr(400, 'Scegli almeno un Paese');
        nx.cc = cc;
      }
      s.agSec = nx;
      const ch = [], ccCh = nx.cc.join() !== was.cc.join();
      if (nx.week !== was.week) ch.push(nx.week ? 'accesso degli agenti di 7 giorni' : 'accesso degli agenti di 30 giorni dall\'ultimo uso');
      if (nx.two !== was.two) ch.push(nx.two ? 'massimo 2 dispositivi per agente' : 'dispositivi degli agenti senza limite');
      if (nx.geo !== was.geo) ch.push(nx.geo ? 'agenti solo da ' + ccList(nx.cc) : 'agenti da qualunque Paese');
      else if (ccCh) ch.push('Paesi consentiti agli agenti: ' + ccList(nx.cc));
      if (nx.tg !== was.tg) ch.push(nx.tg ? 'avvisi su Telegram per gli accessi degli agenti' : 'niente avvisi su Telegram per gli accessi degli agenti');
      if (nx.tfa !== was.tfa) ch.push(nx.tfa ? 'verifica in due passaggi obbligatoria per gli agenti' : 'verifica in due passaggi facoltativa per gli agenti');
      if (ch.length) await log(env, 'settings', `${who}: Sicurezza — ${ch.join(' · ')}`, ip);
      if (nx.two && !was.two) {
        // accesa adesso: chi ha già più di 2 dispositivi resta collegato solo sui 2 più recenti
        const many = ((await env.DB.prepare("SELECT a.id, a.username FROM admins a WHERE a.role = 'agent' AND (SELECT COUNT(*) FROM sessions x WHERE x.admin_id = a.id) > ?").bind(AG_MAXDEV).all()).results) || [];
        for (const a of many) { const out = await agTrim(env, a.id); kicked += out.length; if (out.length) await log(env, 'auth', `Agente ${a.username}: restano i ${AG_MAXDEV} dispositivi più recenti · scollegati ${out.length}`, ip); }
      }
    }
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
    if (pendNow) return json({ settings: s, pendDeleted: await pendSweep(env, true, pendNow).catch(() => 0), ...(kicked ? { kicked } : {}) });
    return json(kicked ? { settings: s, kicked } : { settings: s });
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
    // la chiave non ancora confermata resta la stessa: premendo di nuovo «Attiva» il telefono non resta con una chiave vecchia
    // (prima ne nasceva una nuova a ogni clic e il codice del telefono smetteva di valere). «Chiave nuova» (fresh) la cambia
    const tb = await readJSON(req, 512).catch(() => ({}));
    const cur = await env.DB.prepare('SELECT totp_secret FROM admins WHERE id = ?').bind(ses.admin_id).first();
    let secret = tb.fresh !== true && cur && /^[A-Z2-7]{32}$/.test(cur.totp_secret || '') ? cur.totp_secret : '';
    if (!secret) { secret = b32enc(rand(20)); await env.DB.prepare('UPDATE admins SET totp_secret = ? WHERE id = ?').bind(secret, ses.admin_id).run(); }
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
    const recovery = await recNew(env, a.id);
    await log(env, 'auth', `${who}: verifica in due passaggi attivata (10 codici di recupero)`, ip);
    return json({ ok: true, recovery });
  }
  if (path === '/totp/recovery' && m === 'POST') {
    const b = await readJSON(req);
    const a = await env.DB.prepare('SELECT * FROM admins WHERE id = ?').bind(ses.admin_id).first();
    if (!a.totp_on) throw new HttpErr(400, 'Attiva prima la verifica in due passaggi');
    if (!(await checkPass(str(b.password, 200), a.pass_hash))) throw new HttpErr(400, 'Password errata');
    const ctr = await checkTotp(a.totp_secret, b.code, a.totp_last);
    if (ctr < 0) throw new HttpErr(400, 'Codice non valido');
    await env.DB.prepare('UPDATE admins SET totp_last = ? WHERE id = ?').bind(ctr, a.id).run();
    const recovery = await recNew(env, a.id);
    await log(env, 'auth', `${who}: nuovi codici di recupero (i vecchi non valgono più)`, ip);
    return json({ ok: true, recovery });
  }
  if (path === '/totp/disable' && m === 'POST') {
    const b = await readJSON(req);
    const a = await env.DB.prepare('SELECT * FROM admins WHERE id = ?').bind(ses.admin_id).first();
    if (!(await checkPass(str(b.password, 200), a.pass_hash))) throw new HttpErr(400, 'Password errata');
    const ctr = await checkTotp(a.totp_secret, b.code, a.totp_last);
    if (ctr < 0) throw new HttpErr(400, 'Codice non valido');
    await env.DB.prepare('UPDATE admins SET totp_on = 0, totp_secret = ?, totp_last = 0 WHERE id = ?').bind('', a.id).run();
    await recDrop(env, a.id);
    await log(env, 'auth', `${who}: verifica in due passaggi disattivata`, ip);
    return json({ ok: true });
  }

  if (path === '/devices/lookup' && m === 'GET') {
    if (!ses || ses.agent) throw new HttpErr(403, 'Solo il titolare può cercare codici');
    const code = codeNorm(url.searchParams.get('code'));
    if (!CODE_RE.test(code)) return json({ ok: false, error: 'Il codice è come KXAB-12CD: KX e altre 6 lettere o cifre' });
    const d = await env.DB.prepare('SELECT id, owner_id, parent, active, playlists, name, notes, expires, app, model, created_at FROM devices WHERE code = ?').bind(code).first();
    if (!d) return json({ ok: true, code, found: false });
    const p = await env.DB.prepare('SELECT ver, t FROM presence WHERE device_id = ?').bind(d.id).first().catch(() => null);
    const app = appOfVer(p && p.ver, d.app);
    const info = { app, appName: APP_NAME[app] || 'Kairos', model: str(d.model, 60), seen: +(p && p.t) || +d.created_at || 0 };
    const free = await env.DB.prepare(`SELECT 1 AS x FROM devices WHERE id = ? AND ${FREE_DEV}`).bind(d.id).first();
    if (free) return json({ ok: true, code, found: true, free: true, id: d.id, ...info });
    if (!+d.owner_id) return json({ ok: true, code, found: true, mine: true, id: d.id, name: d.name, ...info });
    return json({ ok: true, code, found: true, taken: true });
  }
  if (path === '/devices' && m === 'POST') {
    const b = await readJSON(req);
    let code = codeNorm(str(b.code, 20)); // scritto a mano come viene (kxab12cd, AB12CD…): come «Controlla il codice» e gli agenti
    if (!code) { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', r = rand(6); const c = [...r].map((x) => A[x % A.length]); code = `KX${c[0]}${c[1]}-${c[2]}${c[3]}${c[4]}${c[5]}`; }
    if (!CODE_RE.test(code)) throw new HttpErr(400, 'Formato codice non valido (es. KXAB-12CD)');
    const existing = await env.DB.prepare('SELECT * FROM devices WHERE code = ?').bind(code).first();
    if (existing && !(await env.DB.prepare(`SELECT 1 AS x FROM devices WHERE id = ? AND ${FREE_DEV}`).bind(existing.id).first())) throw new HttpErr(400, 'Codice già esistente');
    if (!DATE_RE.test(str(b.expires, 10))) throw new HttpErr(400, 'Data non valida');
    const id = existing ? existing.id : b64url(rand(9));
    const pls = cleanPlaylists(b.playlists);
    const acc = await accountFields(env, b, { max_streams: 1 }, pls); // di base: una visione alla volta
    const settings = await getSettings(env);
    const perms = b.perms !== undefined ? permsJson({ ...permsParse(settings.permsDefault), ...permsInput(b.perms) }) : defaultPermsJson(settings);
    const name = str(b.name, 60), notes = str(b.notes, 500), active = b.active ? 1 : 0, expires = str(b.expires, 10), playlists = await seal(env, pls);
    const newOwner = ses && ses.agent ? ses.admin_id : Math.max(0, parseInt(b.ownerId, 10) || 0);
    if (newOwner && !(ses && ses.agent) && !(await env.DB.prepare("SELECT 1 AS x FROM admins WHERE id = ? AND role = 'agent'").bind(newOwner).first())) throw new HttpErr(400, 'Agente non trovato');
    const addons = Array.isArray(b.addons) ? addonsList(b.addons).join(',') : '';
    const app = APPS.includes(b.app) ? b.app : (existing && existing.app) || '';
    if (existing) {
      const r = await env.DB.prepare(`UPDATE devices SET name = ?, notes = ?, active = ?, expires = ?, playlists = ?, max_conn = ?, max_profiles = ?, profiles = ?, lock_profiles = ?, vpn = ?, vpn_conf = ?, perms = ?, max_streams = ?, vpn_loc = ?, pl_mode = ?, pl_default = ?, player = ?, addons = ?, owner_id = ?, app = ? WHERE id = ? AND ${FREE_DEV}`)
        .bind(name, notes, active, expires, playlists, acc.max_conn, acc.max_profiles, acc.profiles, acc.lock_profiles, acc.vpn, acc.vpn_conf, perms, acc.max_streams, acc.vpn_loc, acc.pl_mode, acc.pl_default, acc.player, addons, newOwner, app, id).run();
      if (!+((r && r.meta && r.meta.changes) || 0)) throw new HttpErr(400, 'Codice già esistente');
    } else {
      await env.DB.prepare('INSERT INTO devices (id, code, name, notes, active, expires, playlists, created_at, max_conn, max_profiles, profiles, lock_profiles, vpn, vpn_conf, perms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(id, code, name, notes, active, expires, playlists, now(), acc.max_conn, acc.max_profiles, acc.profiles, acc.lock_profiles, acc.vpn, acc.vpn_conf, perms).run();
      await env.DB.prepare('UPDATE devices SET max_streams = ?, vpn_loc = ?, pl_mode = ?, pl_default = ?, player = ?, addons = ?, owner_id = ? WHERE id = ?').bind(acc.max_streams, acc.vpn_loc, acc.pl_mode, acc.pl_default, acc.player, addons, newOwner, id).run();
      if (APPS.includes(b.app)) await env.DB.prepare('UPDATE devices SET app = ? WHERE id = ?').bind(b.app, id).run();
    }
    srcMem.map = null;
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
      await log(env, 'edit', `${who}: codice di collegamento generato per ${label} (${max >= CONN_UNLIM ? `${used} connessioni, illimitate` : `${used} di ${max} connessioni`})`, ip);
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
      // grow (10 novembre 2026): il cliente principale è pieno e chi collega ha scelto «aumenta i dispositivi»: si portano a quelli che servono
      // (gli agenti arrivano qui solo entro il loro tetto, controllato prima di inoltrare)
      const growTo = b.grow === true && used + add > max ? used + add : 0;
      if (growTo > MAX_CONN) throw new HttpErr(400, `Servono ${growTo} dispositivi: il massimo è ${MAX_CONN}`);
      if (used + add > max && !growTo) throw new HttpErr(400, `Connessioni esaurite (${used} di ${max}${add > 1 ? `, ne servono altre ${add}` : ''}): aumenta "Connessioni massime" del cliente`);
      const name = typeof b.name === 'string' && b.name.trim() ? str(b.name, 60) : d.name;
      const ok = await env.DB.prepare("UPDATE devices SET parent = ?, name = ?, active = 0, expires = '', playlists = ?, profiles = '', own = ? WHERE id = ? AND parent = '' RETURNING id").bind(P.id, name, keep ? d.playlists : '', keep ? 1 : 0, d.id).first();
      if (!ok) throw new HttpErr(409, 'Il dispositivo è appena stato collegato: ricarica');
      if (growTo) await env.DB.prepare('UPDATE devices SET max_conn = MAX(COALESCE(max_conn, 1), ?) WHERE id = ?').bind(growTo, P.id).run();
      if (move) await env.DB.batch([...kids.map((k) => env.DB.prepare('UPDATE devices SET parent = ? WHERE id = ? AND parent = ?').bind(P.id, k.id, d.id)), env.DB.prepare('DELETE FROM link_pins WHERE device_id = ?').bind(d.id)]);
      if (myPls.length) srcMem.map = null;
      await log(env, 'on', `${who}: ${name || label} ${move ? 'messo sotto' : 'collegato come connessione di'} ${P.name || P.code} (${connTxt(used + add, growTo || max)}${growTo ? `, dispositivi portati da ${max} a ${growTo}` : ''})${kids.length ? ` con le sue ${kids.length} connessioni` : ''}${keep ? ', linee sue' : ''}`, ip);
      return json({ ok: true, ...(growTo ? { grown: growTo } : {}) });
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
      srcMem.map = null;
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
    addons: addonsList(d.addons), ownerId: +d.owner_id || 0, aiLimit: d.ai_limit ?? -1, aiExtra: +d.ai_extra || 0, aiProvider: d.ai_provider || '', app: d.app || '', orbix: (({ id, t, n, u, dns, h }) => (id ? { id, t, n, u, dns, h } : null))(orbixOf(d)), maxp: (({ uid, u, dom, t }) => (uid ? { uid, u, dom, t } : null))(maxpOf(d)), parent: d.parent || '', maxConn: d.max_conn ?? 1, maxProfiles: d.max_profiles ?? 3, profiles: readProfiles(d, pls.map((p) => p.id)), lockProfiles: !!d.lock_profiles, vpn: +d.vpn || 0, vpnConf: !!d.vpn_conf, perms: permsParse(d.perms), maxStreams: +d.max_streams || 0, vpnLoc: d.vpn_loc || '', plMode: d.pl_mode === 'split' ? 'split' : 'merge', plDefault: d.pl_default || '', player: playerParse(d.player), dl: (+d.rec_t ? { by: d.rec_name || '', mine: !(+d.rec_by) } : null) };
}
/** campi "account" inviati dal pannello: connessioni, profili, VPN (cur = valori attuali del dispositivo) */
async function accountFields(env, b, cur, pls) {
  const o = { max_conn: cur.max_conn ?? 1, max_profiles: cur.max_profiles ?? 3, lock_profiles: cur.lock_profiles ? 1 : 0, vpn: +cur.vpn || 0, vpn_conf: cur.vpn_conf || '', profiles: cur.profiles || '' };
  if (b.maxConn !== undefined) o.max_conn = connIn(b.maxConn);
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
  if (okHost && a.role === 'agent') await agGeoLogin(req, env, a, ip, ctx); // «Solo da questi Paesi» (credenziali già giuste)
  if (!okHost) {
    const blocked = await strike();
    await log(env, 'off', `Accesso fallito per "${user.slice(0, 30)}"${ok ? ' (titolare dall\'indirizzo degli agenti)' : ''}${blocked}`, ip);
    throw new HttpErr(401, 'Credenziali errate');
  }
  // il titolare: codice di accesso sui dispositivi che il pannello non ricorda (Sicurezza e account → Il tuo accesso)
  const trust = a.role !== 'agent' ? await trustOf(req, env, a.id) : null;
  if (a.role !== 'agent' && a.acc_seal && !trust) {
    const code = str(b.code, 64).trim();
    if (!code) return json({ needCode: true }, 200);
    const want = String(await unseal(env, a.acc_seal).catch(() => ''));
    if (!want || !safeEq(code, want)) {
      const blocked = await strike();
      await log(env, 'off', `Codice di accesso errato per ${a.username}${blocked}`, ip);
      ownTg(env, ctx, a, `⚠️ <b>Codice di accesso sbagliato</b>\nQualcuno ha scritto la password giusta del titolare <b>${tgEsc(a.username)}</b> ma il codice di accesso sbagliato, da ${tgEsc(devWhere(req))}. Se non eri tu, cambia subito la password (Sicurezza e account).`);
      throw new HttpErr(401, 'Codice di accesso errato');
    }
  }
  if (a.totp_on) {
    if (!b.totp) return json({ needTotp: true }, 200);
    const rec = recIs(b.totp) ? await recUse(env, a.id, b.totp) : -1;
    const ctr = rec < 0 ? await checkTotp(a.totp_secret, b.totp, a.totp_last) : -1;
    if (ctr < 0 && rec < 0) {
      const blocked = await strike();
      await log(env, 'off', `Codice 2FA errato per ${a.username}${blocked}`, ip);
      throw new HttpErr(401, 'Codice di verifica errato');
    }
    if (ctr >= 0) await env.DB.prepare('UPDATE admins SET totp_last = ? WHERE id = ?').bind(ctr, a.id).run();
    else await log(env, 'auth', `${a.username}: accesso con un codice di recupero (ne restano ${rec})`, ip);
  }
  await env.DB.prepare('DELETE FROM login_fail WHERE ip = ?').bind(ip).run();
  // un eventuale cookie di sessione già presente viene invalidato: a ogni accesso un token nuovo
  const old = cookieOf(req);
  if (old) await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(await sha256('ses:' + old)).run();
  const tok = b64url(rand(32));
  await env.DB.prepare('INSERT INTO sessions (id, admin_id, expires, ip, ua, created_at, geo) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(await sha256('ses:' + tok), a.id, now() + SESSION_TTL * 1000, ip, str(req.headers.get('User-Agent') || '', 200), now(), geoOf(req)).run();
  await log(env, 'auth', `Accesso di ${a.username}`, ip);
  if (a.role === 'agent') await agTwoAfterLogin(req, env, a, ip, ctx); // «Massimo 2 dispositivi per agente»
  const td = a.role !== 'agent' ? await ownAfterLogin(req, env, a, ip, ctx, trust, b.remember === true, '') : ''; // «Ricorda questo dispositivo»
  ctx.waitUntil(cleanup(env));
  const res = json({ ok: true, user: a.username, totp: !!a.totp_on, role: a.role === 'agent' ? 'agent' : 'owner' }, 200, { 'Set-Cookie': setCookie(tok, SESSION_TTL) });
  if (td) res.headers.append('Set-Cookie', tdSet(td, TD_MS / 1000));
  return res;
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
  await agGeoLogin(req, env, a, ip, ctx); // «Solo da questi Paesi» (link e codice già giusti)
  if (a.totp_on) {
    if (!b.totp) return json({ needTotp: true }, 200);
    const rec = recIs(b.totp) ? await recUse(env, a.id, b.totp) : -1;
    const ctr = rec < 0 ? await checkTotp(a.totp_secret, b.totp, a.totp_last) : -1;
    if (ctr < 0 && rec < 0) { const blocked = await strike(); await log(env, 'off', `Codice 2FA errato per ${a.username}${blocked}`, ip); throw new HttpErr(401, 'Codice di verifica errato'); }
    if (ctr >= 0) await env.DB.prepare('UPDATE admins SET totp_last = ? WHERE id = ?').bind(ctr, a.id).run();
    else await log(env, 'auth', `${a.username}: accesso con un codice di recupero (ne restano ${rec})`, ip);
  }
  await env.DB.prepare('DELETE FROM login_fail WHERE ip = ?').bind(ip).run();
  const old = cookieOf(req);
  if (old) await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(await sha256('ses:' + old)).run();
  const tok = b64url(rand(32));
  await env.DB.prepare('INSERT INTO sessions (id, admin_id, expires, ip, ua, created_at, geo) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(await sha256('ses:' + tok), a.id, now() + SESSION_TTL * 1000, ip, str(req.headers.get('User-Agent') || '', 200), now(), geoOf(req)).run();
  await env.DB.prepare('UPDATE admins SET link_used = ? WHERE id = ?').bind(now(), a.id).run();
  await log(env, 'auth', `Accesso di ${a.username} con il link personale`, ip);
  await agTwoAfterLogin(req, env, a, ip, ctx); // «Massimo 2 dispositivi per agente»
  ctx.waitUntil(cleanup(env));
  return json({ ok: true, user: a.username, totp: !!a.totp_on, role: 'agent' }, 200, { 'Set-Cookie': setCookie(tok, SESSION_TTL) });
}

/* ======================================================================
   Backup completo dei dati e ripristino (13 novembre 2026) — solo il titolare, con la sua password.

   Il backup è un file di testo, una riga JSON per pezzo: la prima dice formato, data, tabelle e come sono fatte; poi le
   righe di ogni tabella a pagine; l'ultima chiude con il totale. Dentro c'è tutto il database: clienti, scadenze, linee,
   agenti e loro permessi, pagamenti, impostazioni, store, messaggi, registro. Restano fuori solo le tabelle di servizio
   (sessioni aperte, tentativi di accesso, limiti, codici temporanei): dopo un ripristino si rientra con le credenziali
   del backup.

   Lo scarica e lo ricarica la pagina, una tabella alla volta: ogni richiesta fa poche letture o scritture, così non ci
   sono limiti di tempo o di numero di operazioni da superare, qualunque sia la grandezza del database.
   - POST /backup/start {password}            → { token, format, at, tables: [{ name, sql }] }
   - POST /backup/page  {token, t, after}     → { rows, next }   (next = da dove riprendere; null = tabella finita)
   - POST /backup/end   {token, rows}         → { ok }
   - POST /restore/start {password, confirm: 'RIPRISTINA', tables: [nomi nel file]} → { token, tables: [quelle che si ricaricano] }
   - POST /restore/table {token, t, first, rows} → { ok, n }     (first: svuota la tabella prima di scrivere)
   - POST /restore/end   {token, rows}        → { ok }
   Il file vale quanto il database: contiene le password cifrate degli accessi e le playlist dei clienti (sigillate con
   ENC_KEY: per rileggerle dopo un ripristino serve lo stesso ENC_KEY). Ogni backup e ogni ripristino finisce nel registro.
   ====================================================================== */
const BK_SKIP = new Set(['sessions', 'login_fail', 'throttle', 'pk_chal', 'store_act_fail', 'store_code_fail', 'tg_codes', 'ses_out', 'relay_jobs', 'd1_migrations']);
const BK_TOK_K = 'bkTok', BK_TTL = 30 * 60e3, BK_PAGE = 500, BK_FORMAT = 1, BK_ROWS_MAX = 100;
const bkName = (t) => typeof t === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(t) && !BK_SKIP.has(t) && !/^(sqlite_|_cf_)/i.test(t);
async function bkTables(env) {
  const r = (await env.DB.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'table' ORDER BY name").all()).results || [];
  return r.filter((t) => bkName(t.name)).map((t) => ({ name: String(t.name), sql: String(t.sql || '') }));
}
async function bkCols(env, t) {
  return ((((await env.DB.prepare(`PRAGMA table_info("${t}")`).all()).results) || []).map((c) => String(c.name))).filter((c) => /^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(c));
}
async function bkTokNew(env, adminId, kind) {
  const tok = b64url(rand(24));
  await env.DB.prepare('INSERT OR REPLACE INTO settings (k, v) VALUES (?, ?)').bind(BK_TOK_K, JSON.stringify({ h: await sha256(tok), a: adminId, kind, until: now() + BK_TTL })).run();
  return tok;
}
async function bkTokOk(env, tok, adminId, kind) {
  if (typeof tok !== 'string' || tok.length < 20 || tok.length > 80) return false;
  const r = await env.DB.prepare('SELECT v FROM settings WHERE k = ?').bind(BK_TOK_K).first();
  let o = null; try { o = r && JSON.parse(r.v); } catch {}
  return !!(o && o.kind === kind && o.a === adminId && o.until > now() && safeEq(await sha256(tok), String(o.h || '')));
}
async function bkRoutes(req, env, path, ses, who, ip) {
  const b = await readJSON(req, 3 * 1024 * 1024);
  const start = path === '/backup/start' || path === '/restore/start';
  if (start) {
    if (await limited(env.RL_LOGIN, 'bk:' + ses.admin_id)) throw new HttpErr(429, 'Troppi tentativi: riprova tra un minuto');
    const a = await env.DB.prepare('SELECT pass_hash FROM admins WHERE id = ?').bind(ses.admin_id).first();
    if (!a || !(await checkPass(str(b.password, 200), a.pass_hash))) { await log(env, 'auth', `${who}: password errata per ${path === '/backup/start' ? 'il backup' : 'il ripristino'}`, ip); throw new HttpErr(400, 'Password errata'); }
  }
  if (path === '/backup/start') {
    const tables = await bkTables(env);
    const token = await bkTokNew(env, ses.admin_id, 'backup');
    await log(env, 'settings', `${who}: backup dei dati avviato`, ip);
    return { token, format: BK_FORMAT, at: new Date(now()).toISOString(), tables };
  }
  if (path === '/backup/page') {
    if (!(await bkTokOk(env, b.token, ses.admin_id, 'backup'))) throw new HttpErr(403, 'Backup scaduto: ricomincia');
    const t = b.t; if (!bkName(t)) throw new HttpErr(400, 'Tabella non valida');
    const after = Number.isFinite(+b.after) && +b.after >= 0 ? Math.floor(+b.after) : 0, byOff = b.mode === 'off';
    let rows, next = null, mode = byOff ? 'off' : 'rid';
    const strip = (list) => list.map((r) => { const o = { ...r }; delete o.__rid; return o; });
    try {
      if (byOff) throw new Error('off');
      rows = (await env.DB.prepare(`SELECT rowid AS __rid, * FROM "${t}" WHERE rowid > ? ORDER BY rowid LIMIT ${BK_PAGE}`).bind(after).all()).results || [];
      if (rows.length === BK_PAGE) next = +rows[rows.length - 1].__rid;
    } catch (e) {
      if (!byOff && !/rowid|off/i.test(String(e && e.message))) throw new HttpErr(400, 'Tabella non leggibile');
      // tabella senza rowid: a pagine per posizione
      mode = 'off';
      rows = (await env.DB.prepare(`SELECT * FROM "${t}" LIMIT ${BK_PAGE} OFFSET ?`).bind(after).all()).results || [];
      if (rows.length === BK_PAGE) next = after + rows.length;
    }
    rows = strip(rows);
    if (t === 'settings') rows = rows.filter((r) => r.k !== BK_TOK_K); // il gettone di questo backup non fa parte dei dati
    return { rows, next, mode };
  }
  if (path === '/backup/end') {
    if (!(await bkTokOk(env, b.token, ses.admin_id, 'backup'))) throw new HttpErr(403, 'Backup scaduto: ricomincia');
    await env.DB.prepare('DELETE FROM settings WHERE k = ?').bind(BK_TOK_K).run();
    await log(env, 'settings', `${who}: backup dei dati scaricato (${Math.max(0, Math.floor(+b.rows || 0))} righe)`, ip);
    return { ok: true };
  }
  if (path === '/restore/start') {
    if (b.confirm !== 'RIPRISTINA') throw new HttpErr(400, 'Per ripristinare scrivi RIPRISTINA');
    if (!Array.isArray(b.tables) || !b.tables.length || b.tables.length > 300) throw new HttpErr(400, 'File di backup non valido');
    const have = new Set((await bkTables(env)).map((t) => t.name));
    const tables = [...new Set(b.tables.filter((t) => bkName(t) && have.has(t)))];
    if (!tables.includes('devices') || !tables.includes('admins') || !tables.includes('settings')) throw new HttpErr(400, 'File di backup non valido: mancano clienti, accessi o impostazioni');
    const token = await bkTokNew(env, ses.admin_id, 'restore');
    await log(env, 'settings', `${who}: ripristino dei dati da un backup avviato (${tables.length} tabelle)`, ip);
    return { token, tables, max: BK_ROWS_MAX };
  }
  if (path === '/restore/table') {
    if (!(await bkTokOk(env, b.token, ses.admin_id, 'restore'))) throw new HttpErr(403, 'Ripristino scaduto: ricomincia');
    const t = b.t; if (!bkName(t)) throw new HttpErr(400, 'Tabella non valida');
    const rows = Array.isArray(b.rows) ? b.rows : null;
    if (!rows || rows.length > BK_ROWS_MAX) throw new HttpErr(400, 'Righe non valide');
    const cols = await bkCols(env, t);
    if (!cols.length) throw new HttpErr(400, 'Tabella non trovata');
    const st = [];
    // il gettone del ripristino resta dov'è (è nella tabella delle impostazioni) finché non si chiude
    if (b.first === true) st.push(t === 'settings' ? env.DB.prepare('DELETE FROM settings WHERE k <> ?').bind(BK_TOK_K) : env.DB.prepare(`DELETE FROM "${t}"`));
    for (const r of rows) {
      if (!r || typeof r !== 'object' || Array.isArray(r)) throw new HttpErr(400, 'Righe non valide');
      if (t === 'settings' && r.k === BK_TOK_K) continue;
      const ks = cols.filter((c) => hasKey(r, c));
      if (!ks.length) continue;
      const vals = ks.map((c) => { const v = r[c]; if (v === null || typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v))) return v; if (typeof v === 'boolean') return v ? 1 : 0; throw new HttpErr(400, `Valore non valido in ${t}.${c}`); });
      st.push(env.DB.prepare(`INSERT OR REPLACE INTO "${t}" (${ks.map((c) => `"${c}"`).join(', ')}) VALUES (${ks.map(() => '?').join(', ')})`).bind(...vals));
    }
    // una chiamata = una transazione: o entrano tutte le righe di questo pezzo (con lo svuotamento, se è il primo) o nessuna
    for (let i = 0; i < st.length; i += 101) await env.DB.batch(st.slice(i, i + 101));
    return { ok: true, n: rows.length };
  }
  if (path === '/restore/end') {
    if (!(await bkTokOk(env, b.token, ses.admin_id, 'restore'))) throw new HttpErr(403, 'Ripristino scaduto: ricomincia');
    await env.DB.prepare('DELETE FROM settings WHERE k = ?').bind(BK_TOK_K).run();
    await log(env, 'settings', `${who}: dati ripristinati da un backup (${Math.max(0, Math.floor(+b.rows || 0))} righe)`, ip);
    return { ok: true };
  }
  throw new HttpErr(404, 'Non trovato');
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
    const other = await env.DB.prepare('SELECT id, secret_hash FROM devices WHERE code = ? AND id <> ?').bind(d.code, d.id).first();
    // l'app del cliente, rimasta aperta, si ripresenta subito con lo stesso codice come richiesta «da attivare»: se è la stessa
    // app (stesso segreto) e nessuno ha toccato la richiesta, lascia il posto al cliente ripristinato (prima il ripristino era
    // quasi sempre impossibile). Un altro dispositivo con quel codice resta com'è
    const same = other && (!d.secret_hash || other.secret_hash === d.secret_hash);
    if (other && !(same && (await env.DB.prepare(`DELETE FROM devices WHERE id = ? AND ${FREE_DEV} RETURNING id`).bind(other.id).first()))) throw new HttpErr(409, `Il codice ${d.code} è stato preso da un altro dispositivo: il cliente non si può ripristinare`);
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
const effectivePendTtl = (s) => {
  const h = +(s && s.pendTtl) || 0;
  return s && s.codeOnly ? (h ? Math.min(h, 24) : 24) : h;
};
let pendSweepT = 0;
async function pendSweep(env, force = false, h0 = null) {
  const settings = await getSettings(env);
  const h = effectivePendTtl(h0 !== null ? { ...settings, pendTtl: h0 } : settings), t = now();
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
  // limite agli scaricamenti degli APK e codici sbagliati dello Store: si tengono solo le ultime ore
  try { await env.DB.batch([env.DB.prepare('DELETE FROM dl_hits WHERE h < ?').bind(Math.floor(t / 36e5) - 48), env.DB.prepare('DELETE FROM store_code_fail WHERE t < ?').bind(t - 86400e3)]); } catch {}
  try { await env.DB.prepare('DELETE FROM ses_out WHERE t < ?').bind(t - SES_OUT_KEEP).run(); } catch {} // motivi delle sessioni chiuse dalle regole degli agenti
  try { await env.DB.batch([env.DB.prepare('DELETE FROM trusted_devices WHERE expires < ?').bind(t), env.DB.prepare('DELETE FROM pk_chal WHERE t < ?').bind(t - PK_TTL)]); } catch {} // dispositivi ricordati scaduti, sfide delle passkey
  try { await env.DB.prepare('DELETE FROM app_errors WHERE t < ?').bind(t - ERR_KEEP_MS).run(); } catch {} // errori dell'app: solo gli ultimi 7 giorni
  try { await env.DB.batch([env.DB.prepare('DELETE FROM link_pins WHERE until < ?').bind(t), env.DB.prepare('DELETE FROM throttle WHERE until < ?').bind(t)]); } catch {}
  // segnalazioni/richieste "fatte" da più di 90 giorni, presenze vecchie di 30 giorni, classifiche di oltre 60 giorni
  try { await env.DB.batch([env.DB.prepare("DELETE FROM requests WHERE status = 'done' AND created < ?").bind(t - 90 * 86400e3), env.DB.prepare('DELETE FROM presence WHERE t < ?').bind(t - 30 * 86400e3), env.DB.prepare('DELETE FROM watch WHERE day < ?').bind(dayIT(t - 60 * 86400e3))]); } catch {}
  try { await env.DB.prepare('DELETE FROM armada_spend WHERE t < ?').bind(t - 400 * 86400e3).run(); } catch {} // crediti Armada degli agenti: basta poco più di un anno
  try { await env.DB.prepare('DELETE FROM remote_cmds WHERE created < ?').bind(t - 30 * 86400e3).run(); } catch {} // comandi del controllo remoto: 30 giorni
  try { await env.DB.prepare('DELETE FROM trash WHERE exp < ?').bind(t).run(); } catch {} // cestino: 30 giorni, poi via per sempre
}

// esportati per i test
export const _internal = { hashPass, checkPass, hotp, checkTotp, b32enc, seal, unseal, cleanTitle, cleanProfiles, semverCode, textToHtml, cleanWg, permsParse, permsJson, hostOf, cleanHost, swapHost, dayIT, PERM_KEYS, appFrom, appOfVer, playerReach, playerMeta, metaTmdb, ultFeed, ULT_APK, rcClean, rcSent, portalModeForApp, portalsOf, RC_CAT, RC_CMDS };
