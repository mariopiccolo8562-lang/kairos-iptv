const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ss = { get(k) { try { return sessionStorage.getItem(k); } catch { return null; } }, set(k, v) { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch {} } };
const THEMES = { cinema: ['#e5202b', '#ff5a36', '#b3121b'], aurora: ['#22e1ff', '#7b5cff', '#ff3df2'], plasma: ['#ff3d8b', '#ff7a3d', '#ffd23d'], matrix: ['#3dffb0', '#22e1ff', '#3d7bff'], solar: ['#ffb23d', '#ff3d6e', '#b13dff'], ice: ['#9ef0ff', '#5d9bff', '#c3b5ff'], oro: ['#f5c542', '#ff9d2e', '#b8860b'], smeraldo: ['#2ee59d', '#13a8a8', '#0b7a4b'], oceano: ['#2f80ed', '#56ccf2', '#1b3a8f'], tramonto: ['#ff6b35', '#f7c548', '#c2185b'], viola: ['#9b5cff', '#d86bff', '#5b2bd1'], rosa: ['#ff5fa2', '#ff9ec7', '#c2185b'] };
const applyTheme = (n) => { const t = THEMES[n] || THEMES.cinema; ['--a1', '--a2', '--a3'].forEach((v, i) => document.documentElement.style.setProperty(v, t[i])); };
const STL = { active: 'Attivo', pending: 'In attesa', expired: 'Scaduto', disabled: 'Disattivato' };
const STC = { active: 'var(--ok)', pending: 'var(--warn)', expired: 'var(--bad)', disabled: '#ff7aa0' };
const D = { demo: false, security: {}, settings: {}, devices: [], activity: [], user: 'admin', filter: 'all', q: '', range: 30 };

addEventListener('pointermove', (e) => { const s = $('#spot'); s.style.left = e.clientX + 'px'; s.style.top = e.clientY + 'px'; });

/* ---------------- API (con fallback demo) ---------------- */
async function api(method, path, body) {
  if (D.demo) return demoApi(method, path, body);
  const r = await fetch('/api' + path, { method, credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json', 'X-Kairos': '1', ...(window.__assist ? { 'X-Assist': String(window.__assist) } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && path !== '/admin/login') { showLogin(); throw new Error('Sessione scaduta, accedi di nuovo'); }
  if (!r.ok) throw new Error(j.error || 'Errore ' + r.status);
  return j;
}
function rndCode() { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', r = () => A[Math.floor(Math.random() * A.length)]; return 'KX' + r() + r() + '-' + r() + r() + r() + r(); }
function statusOf(d) { if (!d.active) return d.playlists.length ? 'disabled' : 'pending'; if (d.expires && new Date(d.expires) < new Date()) return 'expired'; return 'active'; }
const DEMO = (() => {
  const names = ['Marco Rossi', 'Giulia Bianchi', 'Luca Ferrari', 'Sara Romano', 'Paolo Colombo', 'Elena Ricci', 'Andrea Marino', 'Chiara Greco', 'Davide Bruno', 'Francesca Gallo', 'Matteo Conti', 'Alessia De Luca', 'Simone Costa', 'Martina Giordano', 'Stefano Mancini', 'Valentina Rizzo', 'Fabio Lombardi', 'Laura Moretti', 'Bar Centrale', 'Hotel Belvedere', 'Roberto Barbieri', 'Silvia Fontana'];
  const models = ['AFTKA Fire TV Stick 4K', 'Android TV · Chromecast', 'Android 13 · Galaxy Tab', 'AFTMM Fire TV Cube', 'Google TV · TCL', 'Android 14 · Pixel 8', 'Fire TV Stick Lite', 'Android TV · Xiaomi Box'];
  const now = Date.now(), day = 864e5;
  const devices = names.map((n, i) => {
    const created = now - Math.floor(Math.pow(Math.random(), 1.6) * 88 + 1) * day;
    const exp = i % 7 === 3 ? new Date(now - 3 * day) : i % 5 === 1 ? new Date(now + (2 + i) * day) : new Date(now + (30 + i * 11) * day);
    const profiles = i % 3 === 0 ? [{ id: 'pr' + i + 'a', name: n.split(' ')[0], avatar: 'a' + (1 + (i % 12)), kids: false, pl: 'all' }, { id: 'pr' + i + 'b', name: 'Bambini', avatar: 'a7', kids: true, pl: 'all' }] : [];
    return { bound: true, id: 'd' + i, code: rndCode(), name: n, model: models[i % models.length], notes: '', active: i % 9 !== 4, expires: exp.toISOString().slice(0, 10), playlists: [{ id: 'p' + i, name: 'Principale', type: i % 2 ? 'xtream' : 'm3u', url: 'http://esempio.tv/lista.m3u', host: 'http://esempio.tv:8080', username: 'user' + i, password: '••••', epg: '' }], createdAt: created, lastSeen: now - Math.floor(Math.random() * 60) * 3600e3,
      parent: '', maxConn: i % 4 === 0 ? 2 : 1, maxProfiles: 3, profiles, lockProfiles: false, vpn: i % 6 === 0 ? 1 : 0, vpnConf: false };
  });
  const acc0 = { parent: '', maxConn: 1, maxProfiles: 3, profiles: [], lockProfiles: false, vpn: 0, vpnConf: false };
  devices.push({ ...acc0, bound: true, id: 'l0', code: rndCode(), name: 'Camera da letto', model: 'Fire TV Stick Lite', notes: '', active: false, expires: '', playlists: [], parent: 'd0', createdAt: now - 5 * 864e5, lastSeen: now - 2 * 3600e3 });
  for (let i = 0; i < 3; i++) devices.unshift({ ...acc0, bound: true, id: 'n' + i, code: rndCode(), name: '', model: models[(i + 3) % models.length], notes: '', active: false, expires: '', playlists: [], createdAt: now - i * 3600e3, lastSeen: now - i * 600e3 });
  const activity = [
    { t: now - 120e3, type: 'new', text: `Nuovo dispositivo in attesa: ${devices[0].code} (${devices[0].model})` },
    { t: now - 3600e3, type: 'on', text: 'Giulia Bianchi: pending → active' },
    { t: now - 7200e3, type: 'edit', text: 'Modificato Hotel Belvedere' },
    { t: now - 5 * 3600e3, type: 'settings', text: 'Impostazioni aggiornate' },
    { t: now - 9 * 3600e3, type: 'off', text: 'Bar Centrale: active → disabled' },
    { t: now - 26 * 3600e3, type: 'auth', text: 'Accesso al pannello' },
  ];
  return { settings: { brand: 'KAIROS', tagline: 'Next-gen streaming', accent: 'cinema', announcement: 'Benvenuto su KAIROS — buona visione!', allowLocalPlaylists: true, showFootball: true, serverUrl: '', apkVersionCode: 10200, apkVersion: '1.2.0', supportContact: 'WhatsApp +39 333 000 0000', apkUrl: 'https://github.com/tuo-utente/kairos-iptv/releases/latest/download/kairos.apk', downloaderCode: '1234567', price: '22 € / anno', privacy: '' }, devices, activity,
    wgConf: false, apkFeed: { version: '1.5.0', versionCode: 10500, url: 'https://github.com/tuo-utente/kairos-store/releases/download/kairos-tv/kairos-tv.apk', date: new Date(now - 864e5).toISOString() } };
})();
/* stesso schema della build su GitHub: X.Y.Z → X*10000 + Y*100 + Z (0 = non valida) */
const verCode = (v) => { const m = String(v || '').trim().replace(/^v/i, '').match(/^(\d{1,3})\.(\d{1,2})\.(\d{1,2})$/); return m ? +m[1] * 10000 + +m[2] * 100 + +m[3] : 0; };
async function demoApi(method, path, body) {
  if (path === '/admin/messages' && method === 'POST') { DEMO.messages = [{ id: Date.now(), target: body.target || 'all', title: body.title || '', body: body.body || '', level: body.level || 'info', created: Date.now(), until: body.days ? Date.now() + body.days * 864e5 : 0 }, ...(DEMO.messages || [])]; return { ok: true }; }
  const dmm = path.match(/^\/admin\/messages\/(\d+)$/); if (dmm && method === 'DELETE') { DEMO.messages = (DEMO.messages || []).filter((m) => String(m.id) !== dmm[1]); return { ok: true }; }
  await new Promise((r) => setTimeout(r, 160));
  const pub = (d) => { const p = d.parent && DEMO.devices.find((x) => x.id === d.parent); return { ...d, status: d.parent ? (p ? statusOf(p) : 'pending') : statusOf(d) }; };
  const log = (type, text) => DEMO.activity.unshift({ t: Date.now(), type, text });
  const used = (id) => 1 + DEMO.devices.filter((x) => x.parent === id).length;
  // come il server: la configurazione VPN non viene mai conservata/rimandata in chiaro
  const accIn = (d, b) => { if (b.vpnConfClear) d.vpnConf = false; else if (typeof b.vpnConf === 'string' && b.vpnConf.trim()) d.vpnConf = true; delete b.vpnConf; delete b.vpnConfClear; if (Array.isArray(b.profiles)) b.profiles = b.profiles.map((p, i) => ({ ...p, id: p.id || 'np' + Date.now().toString(36) + i })); if (b.player && typeof b.player === 'object') b.player = Object.fromEntries(Object.entries(b.player).filter(([k, v]) => ['live', 'movie', 'series'].includes(k) && ['auto', 'exo', 'vlc'].includes(v))); };
  if (path === '/admin/login') return { ok: true, user: body.user || 'admin' };
  if (path === '/admin/privacy-template') return { text: '# Informativa sulla privacy e condizioni del servizio\n\n# 1. Chi fornisce il servizio\n{nome} è fornito dal rivenditore che ti ha attivato l\'app.\nContatti: {contatti}\n\n# 8. Condizioni del servizio\n- Prezzo: {prezzo}.\n- (modello dimostrativo: sul server trovi il testo completo)' };
  if (path === '/admin/state') { const ap = DEMO.settings, mc = verCode(ap.apkVersion); return { settings: DEMO.settings, devices: DEMO.devices.map(pub), activity: DEMO.activity, messages: DEMO.messages || [], user: 'admin', wgConf: !!DEMO.wgConf, apkFeed: DEMO.apkFeed, apk: ap.apkUrl && mc > DEMO.apkFeed.versionCode ? { versionCode: mc, version: ap.apkVersion, url: ap.apkUrl, auto: false } : { ...DEMO.apkFeed, auto: true }, security: DEMO.sec || (DEMO.sec = { totp: false, encryption: true, access: true, turnstile: true, sessions: 1 }) }; }
  const km = path.match(/^\/admin\/devices\/([^/?]+)\/kick(\?all=1)?$/);
  if (km) { const d = DEMO.devices.find((x) => x.id === km[1]); const n = 1 + (km[2] && !d.parent ? DEMO.devices.filter((x) => x.parent === d.id).length : 0); d.kickT = Date.now(); log('off', `Disconnesso ${d.name || d.code}${n > 1 ? ` e ${n - 1} dispositivi collegati` : ''} (visione interrotta)`); return { ok: true, kicked: n }; }
  const lm = path.match(/^\/admin\/devices\/([^/]+)\/(link|unlink)$/);
  if (lm) {
    const d = DEMO.devices.find((x) => x.id === lm[1]);
    if (lm[2] === 'unlink') { d.parent = ''; log('off', `Scollegato ${d.name || d.code} (torna in attesa)`); return { ok: true }; }
    const p = DEMO.devices.find((x) => x.id === body.primary);
    if (!p) throw new Error('Cliente principale non valido');
    if (used(p.id) >= (p.maxConn || 1)) throw new Error(`Connessioni esaurite (${used(p.id)} di ${p.maxConn || 1}): aumenta "Connessioni massime" del cliente`);
    Object.assign(d, { parent: p.id, active: false, expires: '', playlists: [], profiles: [] }); log('on', `${d.name || d.code} collegato come connessione di ${p.name || p.code}`); return { ok: true };
  }
  if (path === '/admin/totp/setup') return { secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP', uri: 'otpauth://totp/KAIROS:admin?secret=JBSWY3DPEHPK3PXP' };
  if (path === '/admin/totp/enable') { DEMO.sec.totp = true; return { ok: true }; }
  if (path === '/admin/totp/disable') { DEMO.sec.totp = false; return { ok: true }; }
  if (path === '/admin/logout' || path === '/admin/logout-all') return { ok: true };
  if (/\/reset$/.test(path)) { const d = DEMO.devices.find((x) => path.includes(x.id)); d.bound = false; return { ok: true }; }
  if (path === '/admin/settings') {
    const b = { ...body };
    if (b.wgClear) DEMO.wgConf = false; else if (typeof b.wgConf === 'string' && b.wgConf.trim()) DEMO.wgConf = true;
    delete b.wgConf; delete b.wgClear;
    if (b.apkVersionCode !== undefined) { const v = String(b.apkVersionCode).trim(), c = verCode(v); if (v && !c) throw new Error('Versione APK non valida: scrivila come 1.3.0'); b.apkVersion = c ? v.replace(/^v/i, '') : ''; b.apkVersionCode = c; }
    Object.assign(DEMO.settings, b); log('settings', 'Impostazioni aggiornate'); return { settings: DEMO.settings };
  }
  if (path === '/admin/devices/addons') { let n = 0; for (const id of body.ids || []) { const d = DEMO.devices.find((x) => x.id === id); if (!d || d.parent) continue; d.addons = [...new Set([...(d.addons || []).filter((x) => !(body.remove || []).includes(x)), ...(body.add || [])])]; n++; } return { changed: n }; }
  if (path === '/admin/password') return { ok: true };
  if (path === '/admin/devices' && method === 'POST') { const b = { ...body }; const d = { parent: '', maxConn: 1, maxProfiles: 3, profiles: [], lockProfiles: false, vpn: 0, vpnConf: false, id: 'x' + Date.now(), code: b.code || rndCode(), createdAt: Date.now(), lastSeen: 0, model: '' }; accIn(d, b); Object.assign(d, b, { code: b.code || d.code }); DEMO.devices.unshift(d); log('new', 'Dispositivo creato: ' + (d.name || d.code)); return pub(d); }
  const m = path.match(/^\/admin\/devices\/(.+)$/);
  if (m) {
    const d = DEMO.devices.find((x) => x.id === m[1]);
    if (method === 'DELETE') { DEMO.devices.forEach((x) => { if (x.parent === d.id) x.parent = ''; }); DEMO.devices = DEMO.devices.filter((x) => x !== d); log('del', 'Eliminato ' + (d.name || d.code)); return { ok: 1 }; }
    const b = { ...body };
    if (b.maxConn !== undefined && +b.maxConn < used(d.id)) throw new Error(`Su questo abbonamento ci sono già ${used(d.id)} dispositivi: scollegane qualcuno prima di ridurre le connessioni`);
    if (b.profiles && b.profiles.length > (b.maxProfiles ?? d.maxProfiles ?? 3)) throw new Error(`Puoi avere al massimo ${b.maxProfiles ?? d.maxProfiles} profili`);
    accIn(d, b);
    const was = statusOf(d); Object.assign(d, b); const now = statusOf(d); log(was !== now ? (now === 'active' ? 'on' : 'off') : 'edit', was !== now ? `${d.name || d.code}: ${was} → ${now}` : 'Modificato ' + (d.name || d.code)); return pub(d);
  }
  throw new Error('demo');
}

/* ---------------- toast / modal ---------------- */
function toast(t, bad) { const e = document.createElement('div'); e.className = 'toast' + (bad ? ' bad' : ''); e.innerHTML = `<i></i>${esc(t)}`; $('#toasts').appendChild(e); setTimeout(() => { e.style.transition = '.4s'; e.style.opacity = 0; e.style.transform = 'translateX(30px)'; setTimeout(() => e.remove(), 400); }, 2800); }
function ask(title, body, yes = 'Conferma') { return new Promise((res) => { $('#mT').textContent = title; $('#mB').innerHTML = body; $('#mYes').textContent = yes; $('#modal').classList.add('on'); const done = (v) => { $('#modal').classList.remove('on'); res(v); }; $('#mYes').onclick = () => done(true); $('#mNo').onclick = () => done(false); }); }

/* ---------------- login ---------------- */
$('#lform').addEventListener('submit', async (e) => {
  e.preventDefault(); $('#lerr').textContent = '';
  try {
    const j = await api('POST', '/admin/login', { user: $('#lu').value.trim(), pass: $('#lp').value, totp: $('#lt').value.trim(), turnstile: tsToken() });
    if (j.needTotp) { $('#lt').style.display = 'block'; $('#lt').focus(); $('#lerr').innerHTML = '<span class="mut">Inserisci il codice dell\'app di autenticazione</span>'; return; }
    $('#lp').value = ''; $('#lt').value = ''; await enter();
  } catch (err) { tsReset(); $('#lerr').textContent = D.demo ? '' : err.message; $('.lcard').animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-10px)' }, { transform: 'translateX(10px)' }, { transform: 'translateX(0)' }], { duration: 300 }); }
});
let poll;
function showLogin() { clearInterval(poll); const c = $('#chk'); if (c) c.remove(); $('#app').classList.remove('on'); $('#login').style.display = 'grid'; $('#lt').style.display = 'none'; tsReset(); }
async function logout() { try { await api('POST', '/admin/logout'); } catch {} showLogin(); }
$('#logout').onclick = logout;

/* ---------------- Turnstile (anti-bot) ---------------- */
let tsId = null;
function tsToken() { try { return tsId !== null && window.turnstile ? window.turnstile.getResponse(tsId) || '' : ''; } catch { return ''; } }
function tsReset() { try { tsId !== null && window.turnstile && window.turnstile.reset(tsId); } catch {} }
function loadTurnstile(key) {
  if (!key) return;
  const sc = document.createElement('script');
  sc.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  sc.async = true;
  sc.onload = () => { tsId = window.turnstile.render('#ts', { sitekey: key, theme: 'dark', language: 'it' }); };
  document.head.appendChild(sc);
}

async function load() {
  const s = await api('GET', '/admin/state');
  D.settings = s.settings; D.devices = s.devices; D.activity = s.activity; D.user = s.user; D.security = s.security || {}; D.apk = s.apk || null; D.messages = s.messages || [];
  D.apkFeed = s.apkFeed || null; D.wgConf = !!s.wgConf;
  const aa = document.getElementById('apkAuto');
  const mv = D.settings.apkVersion || '', mc = verCode(mv), fd = D.apkFeed;
  const older = fd && mc && mc <= fd.versionCode ? `<br><span class="warnx">⚠️ La versione scritta a mano (<b>${esc(mv)}</b>) non è più recente di quella pubblicata in automatico (<b>${esc(fd.version || String(fd.versionCode))}</b>), quindi viene ignorata: puoi svuotare il campo.</span>` : '';
  const noUrl = mc && !D.settings.apkUrl ? '<br><span class="warnx">⚠️ Hai scritto una versione ma manca il link di download: viene ignorata.</span>' : '';
  if (aa) aa.innerHTML = (D.apk && D.apk.auto ? `✅ <b>Aggiornamento automatico attivo</b> · versione pubblicata: <b>${esc(D.apk.version || String(D.apk.versionCode))}</b>` : D.apk && D.apk.versionCode ? `✍️ Versione impostata a mano: <b>${esc(D.apk.version || String(D.apk.versionCode))}</b>${fd ? ' (più nuova di quella automatica ' + esc(fd.version) + ')' : ' (aggiornamento automatico non attivo)'}` : '⚠️ Aggiornamento automatico non attivo: nessuna versione pubblicata') + older + noUrl;
  applyTheme(D.settings.accent);
  $$('.brandName').forEach((e) => (e.textContent = (D.settings.brand || 'KAIROS').toUpperCase()));
  $('#av').textContent = (D.user || 'A')[0].toUpperCase();
  const pend = D.devices.filter((d) => d.status === 'pending' && !d.parent).length;
  $('#pendB').style.display = pend ? '' : 'none'; $('#pendB').textContent = pend;
  renderAll();
}
async function enter() {
  await load();
  { const c = $('#chk'); if (c) c.remove(); }
  $('#login').style.display = 'none'; $('#app').classList.add('on'); requestAnimationFrame(drawChart);
  $('#copyLink').onclick = () => { const l = D.settings.apkUrl; if (!l) return toast('Imposta il link APK in Impostazioni', 1); navigator.clipboard.writeText(l).then(() => toast('Link copiato'), () => toast('Copia non consentita', 1)); };
  clearInterval(poll);
  if (!D.demo) poll = setInterval(() => { if (!document.hidden && document.querySelector('#app.on')) load().catch(() => {}); }, 20000);
}
function renderSide() {
  $('#dlCode').textContent = D.settings.downloaderCode ? 'Downloader ' + D.settings.downloaderCode : '';
  $('#plLink').textContent = D.settings.apkUrl || 'Link APK non impostato';
}
function renderAll() { renderSide(); renderSecurity(); renderDash(); renderDevices(); renderFeed(); renderSettings(); renderMsgs(); }

/* ---------------- navigazione ---------------- */
const TITLES = { dash: 'Dashboard', devices: 'Dispositivi', msgs: 'Messaggi', activity: 'Attività', settings: 'Impostazioni' };
function view(v) { $$('.nav[data-v]').forEach((n) => n.classList.toggle('on', n.dataset.v === v)); $$('.view').forEach((x) => x.classList.toggle('on', x.id === 'v-' + v)); $('#vTitle').textContent = TITLES[v]; $('#side').classList.remove('open'); if (v === 'dash') renderDash(); }
$$('.nav[data-v]').forEach((n) => (n.onclick = () => view(n.dataset.v)));
$('#menuB').onclick = () => $('#side').classList.toggle('open');
$('#gq').addEventListener('input', (e) => { D.q = e.target.value.toLowerCase(); if (!$('#v-devices').classList.contains('on')) view('devices'); renderDevices(); });

/* ---------------- helpers ---------------- */
const daysLeft = (d) => (d.expires ? Math.ceil((new Date(d.expires) - Date.now()) / 864e5) : null);
const ago = (t) => { if (!t) return 'mai'; const s = (Date.now() - t) / 1000; if (s < 90) return 'adesso'; if (s < 3600) return Math.floor(s / 60) + ' min fa'; if (s < 86400) return Math.floor(s / 3600) + ' h fa'; return Math.floor(s / 86400) + ' g fa'; };
const fmtD = (d) => (d ? new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Illimitata');
const stPill = (s) => `<span class="st ${s}"><i></i>${STL[s]}</span>`;
function countUp(el, to) { const t0 = performance.now(), from = 0; const f = (t) => { const p = Math.min(1, (t - t0) / 900), e = 1 - Math.pow(1 - p, 3); el.textContent = Math.round(from + (to - from) * e); if (p < 1) requestAnimationFrame(f); }; requestAnimationFrame(f); }
function spark(vals, color) { const max = Math.max(1, ...vals), w = 200, h = 60; const pts = vals.map((v, i) => [i * (w / (vals.length - 1 || 1)), h - 6 - (v / max) * (h - 16)]); const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' '); const id = 'sg' + Math.random().toString(36).slice(2, 7); return `<svg class="sl" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".45"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs><path d="${d} L${w} ${h} L0 ${h}Z" fill="url(#${id})"/><path d="${d}" fill="none" stroke="${color}" stroke-width="2"/></svg>`; }
function series(days, pred) { const out = [], now = Date.now(); for (let i = days - 1; i >= 0; i--) { const end = now - i * 864e5; out.push(D.devices.filter((d) => d.createdAt <= end && pred(d)).length); } return out; }

/* ---------------- dashboard ---------------- */
function renderDash() {
  const by = (s) => D.devices.filter((d) => d.status === s).length;
  const soon = D.devices.filter((d) => d.status === 'active' && daysLeft(d) !== null && daysLeft(d) <= 14);
  const online = D.devices.filter((d) => Date.now() - d.lastSeen < 24 * 3600e3).length;
  const k = [
    ['Dispositivi attivi', by('active'), `su ${D.devices.length} totali`, 'var(--ok)', series(14, (d) => d.status === 'active')],
    ['In attesa', by('pending'), 'da attivare', 'var(--warn)', series(14, (d) => d.status === 'pending')],
    ['In scadenza', soon.length, 'entro 14 giorni', 'var(--a3)', series(14, () => true).map((v, i, a) => (i ? v - a[i - 1] : 0))],
    ['Visti nelle 24h', online, 'player che si sono collegati', 'var(--a1)', series(14, (d) => d.lastSeen > Date.now() - 7 * 864e5)],
  ];
  const kc = getComputedStyle(document.documentElement);
  const col = (c) => (c.startsWith('var') ? kc.getPropertyValue(c.slice(4, -1)).trim() : c);
  $('#kpis').innerHTML = k.map(([l, v, s, c, sp]) => `<div class="kpi glass"><div class="halo" style="background:${c}"></div><div class="lb"><i style="background:${c};box-shadow:0 0 10px ${c}"></i>${l}</div><div class="v" data-v="${v}">0</div><div class="s">${s}</div>${spark(sp, col(c))}</div>`).join('');
  $$('#kpis .v').forEach((e) => countUp(e, +e.dataset.v));
  // donut
  const parts = ['active', 'pending', 'expired', 'disabled'].map((s) => [s, by(s)]), tot = Math.max(1, D.devices.length);
  let acc = 0; const R = 70, C = 2 * Math.PI * R;
  $('#donut').innerHTML = `<svg viewBox="0 0 180 180"><circle cx="90" cy="90" r="${R}" fill="none" stroke="rgba(255,255,255,.06)" stroke-width="18"/>${parts.map(([s, n]) => { const len = (n / tot) * C, el = `<circle cx="90" cy="90" r="${R}" fill="none" stroke="${col(STC[s])}" stroke-width="18" stroke-dasharray="0 ${C}" stroke-dashoffset="${-acc}" transform="rotate(-90 90 90)" stroke-linecap="${n ? 'round' : 'butt'}" data-len="${Math.max(0, len - 4)}" style="transition:stroke-dasharray 1.1s cubic-bezier(.2,.8,.2,1);filter:drop-shadow(0 0 6px ${col(STC[s])})"/>`; acc += len; return el; }).join('')}<text x="90" y="88" text-anchor="middle" fill="#fff" font-family="Orbitron" font-weight="700" font-size="34">${D.devices.length}</text><text x="90" y="110" text-anchor="middle" fill="${col('var(--mut)')}" font-size="12">dispositivi</text></svg><div class="legend">${parts.map(([s, n]) => `<div><i style="background:${STC[s]}"></i>${STL[s]}<b>${n}</b></div>`).join('')}</div>`;
  requestAnimationFrame(() => setTimeout(() => $$('#donut circle[data-len]').forEach((c) => c.setAttribute('stroke-dasharray', `${c.dataset.len} ${C}`)), 50));
  // liste
  const pend = D.devices.filter((d) => d.status === 'pending' && !d.parent).slice(0, 6);
  $('#pendList').innerHTML = pend.length ? pend.map((d) => `<div class="mini"><div class="ic" style="color:var(--warn)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8"/></svg></div><div class="tx"><b class="mono">${esc(d.code)}</b><small>${esc(d.model || 'Dispositivo sconosciuto')} · ${ago(d.lastSeen)}</small></div><button class="btn sm pri" data-open="${d.id}">Attiva</button></div>`).join('') : '<div class="emptyc">Nessun dispositivo in attesa ✓</div>';
  $('#expList').innerHTML = soon.length ? soon.sort((a, b) => daysLeft(a) - daysLeft(b)).slice(0, 6).map((d) => `<div class="mini"><div class="ic" style="color:var(--a3)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></div><div class="tx"><b>${esc(d.name || d.code)}</b><small>scade ${fmtD(d.expires)} · tra ${daysLeft(d)} g</small></div><button class="btn sm" data-ext="${d.id}">+1 mese</button></div>`).join('') : '<div class="emptyc">Nessuna scadenza imminente</div>';
  $$('[data-open]').forEach((b) => (b.onclick = () => openDrawer(D.devices.find((d) => d.id === b.dataset.open), true)));
  $$('[data-ext]').forEach((b) => (b.onclick = () => extend(D.devices.find((d) => d.id === b.dataset.ext), 1)));
  drawChart();
}
function drawChart() {
  const cv = $('#chart'); if (!cv.offsetParent) return;
  const dpr = devicePixelRatio || 1, W = cv.clientWidth, H = 260;
  cv.width = W * dpr; cv.height = H * dpr; const x = cv.getContext('2d'); x.scale(dpr, dpr);
  const n = D.range, tot = series(n, () => true), act = series(n, (d) => d.status === 'active');
  const max = Math.max(4, ...tot) * 1.15, pad = { l: 34, r: 10, t: 14, b: 26 };
  const cs = getComputedStyle(document.documentElement), a1 = cs.getPropertyValue('--a1').trim(), a2 = cs.getPropertyValue('--a2').trim(), a3 = cs.getPropertyValue('--a3').trim();
  const X = (i) => pad.l + (i / (n - 1)) * (W - pad.l - pad.r), Y = (v) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  let prog = 0; const t0 = performance.now();
  function frame(t) {
    prog = Math.min(1, (t - t0) / 1100); const e = 1 - Math.pow(1 - prog, 3);
    x.clearRect(0, 0, W, H);
    x.strokeStyle = 'rgba(255,255,255,.06)'; x.fillStyle = 'rgba(139,147,184,.8)'; x.font = '11px Space Grotesk'; x.lineWidth = 1;
    for (let g = 0; g <= 4; g++) { const v = (max / 4) * g, y = Y(v); x.beginPath(); x.moveTo(pad.l, y); x.lineTo(W - pad.r, y); x.stroke(); x.fillText(Math.round(v), 4, y + 4); }
    const step = Math.ceil(n / 6);
    for (let i = 0; i < n; i += step) { const d = new Date(Date.now() - (n - 1 - i) * 864e5); x.fillText(d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' }), X(i) - 16, H - 6); }
    const line = (arr, c1, c2, fill) => {
      x.save(); x.beginPath(); x.rect(0, 0, pad.l + (W - pad.l) * e, H); x.clip();
      x.beginPath(); arr.forEach((v, i) => { const px = X(i), py = Y(v); if (!i) x.moveTo(px, py); else { const qx = X(i - 1), qy = Y(arr[i - 1]); x.bezierCurveTo((qx + px) / 2, qy, (qx + px) / 2, py, px, py); } });
      const lg = x.createLinearGradient(0, 0, W, 0); lg.addColorStop(0, c1); lg.addColorStop(1, c2);
      x.strokeStyle = lg; x.lineWidth = 2.5; x.shadowBlur = 0; x.stroke(); x.shadowBlur = 0;
      if (fill) { x.lineTo(X(n - 1), H - pad.b); x.lineTo(X(0), H - pad.b); x.closePath(); const fg = x.createLinearGradient(0, pad.t, 0, H); fg.addColorStop(0, c1 + '55'); fg.addColorStop(1, c1 + '00'); x.fillStyle = fg; x.fill(); }
      x.restore();
    };
    line(tot, a1, a2, true); line(act, a3, a2, false);
    if (prog >= 1) { const px = X(n - 1), py = Y(tot[n - 1]); x.fillStyle = a1; x.shadowBlur = 0; x.beginPath(); x.arc(px, py, 5, 0, 7); x.fill(); x.shadowBlur = 0; }
    if (prog < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
$$('#rng button').forEach((b) => (b.onclick = () => { D.range = +b.dataset.r; $$('#rng button').forEach((x) => x.classList.toggle('on', x === b)); drawChart(); }));
addEventListener('resize', () => drawChart());

/* ---------------- dispositivi ---------------- */
function renderDevices() {
  const soon = (d) => d.status === 'active' && !d.parent && daysLeft(d) !== null && daysLeft(d) <= 14;
  const fit = (d, s) => s === 'all' || (s === 'soon' ? soon(d) : d.status === s);
  const cnt = (s) => D.devices.filter((d) => fit(d, s)).length;
  $('#filters').innerHTML = ['all', 'active', 'soon', 'pending', 'expired', 'disabled'].map((s) => `<button class="fchip ${D.filter === s ? 'on' : ''}" data-fl="${s}">${s === 'all' ? 'Tutti' : s === 'soon' ? 'In scadenza' : STL[s]}<span>${cnt(s)}</span></button>`).join('');
  $$('[data-fl]').forEach((b) => (b.onclick = () => { D.filter = b.dataset.fl; renderDevices(); }));
  const hay = (d) => { const p = parentOf(d); return [d.code, d.name, d.notes, d.model, p ? p.name + ' ' + p.code : ''].join(' ').toLowerCase(); };
  const list = D.devices.filter((d) => fit(d, D.filter || 'all') && (!D.q || hay(d).includes(D.q)));
  // le connessioni collegate compaiono subito sotto il loro cliente principale
  const inList = new Set(list.map((d) => d.id)), ordered = [];
  for (const d of list) {
    if (d.parent && inList.has(d.parent)) continue;
    ordered.push(d);
    if (!d.parent) for (const k of list) if (k.parent === d.id) ordered.push(k);
  }
  $('#noRows').style.display = ordered.length ? 'none' : 'block';
  $('#rows').innerHTML = ordered.map((d, i) => {
    const p = parentOf(d), sub = !!d.parent;
    const exp = sub && p ? p.expires : d.expires, dl = sub ? (p ? daysLeft(p) : null) : daysLeft(d);
    const conns = sub ? 0 : kidsOf(d.id).length;
    return `<tr data-id="${esc(d.id)}" class="${sub ? 'sub' : ''}" style="animation-delay:${Math.min(i, 20) * 25}ms">
      <td><span class="code">${esc(d.code)}</span></td>
      <td>${sub ? `<span class="subt">↳ connessione di ${esc(p ? p.name || p.code : 'cliente eliminato')}</span><br>` : ''}<b>${esc(d.name) || (sub ? esc(d.model || 'Dispositivo') : '<span class="mut">— senza nome —</span>')}</b>${d.notes ? `<span class="days">${esc(d.notes.slice(0, 40))}</span>` : ''}${conns || (d.maxConn || 1) > 1 ? `<span class="days">${1 + conns} di ${esc(d.maxConn || 1)} connessioni</span>` : ''}</td>
      <td class="hm mut">${esc(d.model || '—')}</td>
      <td>${stPill(d.status)}</td>
      <td class="hm">${fmtD(exp)}${dl !== null ? `<span class="days" style="color:${dl < 0 ? 'var(--bad)' : dl <= 14 ? 'var(--warn)' : ''}">${dl < 0 ? 'scaduto da ' + -dl + ' g' : 'tra ' + dl + ' g'}</span>` : ''}</td>
      <td class="hm">${sub ? '<span class="mut">—</span>' : d.playlists.length}</td>
      <td class="hm mut">${ago(d.lastSeen)}</td>
      <td>${sub ? '' : d.status === 'pending' ? `<button class="btn sm pri" data-act="open">Attiva</button>` : `<button class="icb" title="+1 mese" data-act="ext"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg></button><button class="icb" title="${d.active ? 'Disattiva' : 'Riattiva'}" data-act="tog"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.8 0"/></svg></button>`}<button class="icb" title="Modifica" data-act="open"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button></td></tr>`;
  }).join('');
}
const parentOf = (d) => (d && d.parent ? D.devices.find((x) => x.id === d.parent) || null : null);
const kidsOf = (id) => D.devices.filter((x) => x.parent === id);
/* add-on dello Store dell'app (stesso elenco del server) */
const ADDON_CAT = [
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
const ADDON_GRP = { tema: 'Temi speciali', skin: 'Skin colorate', avatar: 'Pacchetti avatar' };
const ADDON_SW = { 'tema-fantasy': '#52d68a', 'tema-corse': '#ff3b30', 'tema-arcade': '#4cc9f0', 'tema-pixel': '#ff6ad5', 'tema-isola': '#74c69d', 'tema-horror': '#e5383b', 'tema-torneo': '#ffba08', 'tema-giungla': '#80b918', 'tema-ghiaccio': '#6fd3ff', 'tema-draghi': '#ff7a2f', 'tema-magia': '#b58cff', 'tema-eroi': '#ff3b3b', 'tema-cyber': '#00f0ff', 'tema-vichinghi': '#e3b778', 'tema-dei': '#f5c542', 'tema-neon': '#ff4fd8', 'tema-pirati': '#4fb3ff', 'tema-western': '#ff9f43', 'tema-halloween': '#ff8c1a', 'tema-muertos': '#e83f6f', 'tema-natale': '#e63946', 'tema-capodanno': '#ffd166', 'tema-sanvalentino': '#ff4d6d', 'tema-carnevale': '#7ae582', 'skin-rubino': '#e0115f', 'skin-zaffiro': '#2f5bff', 'skin-ambra': '#ffb000', 'skin-giada': '#00a86b', 'skin-lavanda': '#a78bfa', 'skin-corallo': '#ff6f61', 'skin-grafite': '#b8c0cc', 'skin-menta': '#3ee6b4', 'av-animali': '#ffb36b', 'av-sport': '#16a34a', 'av-spazio': '#6d28d9' };
function addonCatNow() {
  const c = (D.settings && D.settings.addons) || {};
  return ADDON_CAT.map(([id, name, cat, def = 'some']) => { const x = c[id] || {}; return { id, name, cat, mode: ['all', 'some', 'off'].includes(x.m) ? x.m : def, price: x.p || '' }; });
}
function renderAddonCfg() {
  const box = $('#adCfg'); if (!box || box.dataset.dirty === '1') return;
  const cat = addonCatNow(), prim = D.devices.filter((d) => !d.parent);
  box.innerHTML = `<div class="adcfg">${Object.entries(ADDON_GRP).map(([g, gl]) => `<h4>${gl}</h4>${cat.filter((a) => a.cat === g).map((a) => { const n = prim.filter((d) => (d.addons || []).includes(a.id)).length; return `<div class="adrow"><div><b><span class="adsw" style="background:${ADDON_SW[a.id] || '#888'}"></span>${esc(a.name)}</b></div>
    <select class="inp" data-adm="${a.id}"><option value="all" ${a.mode === 'all' ? 'selected' : ''}>Tutti i clienti</option><option value="some" ${a.mode === 'some' ? 'selected' : ''}>Solo a chi lo assegno</option><option value="off" ${a.mode === 'off' ? 'selected' : ''}>Nascosto</option></select>
    <input class="inp" data-adp="${a.id}" maxlength="20" placeholder="Prezzo (es. 13,99 €)" value="${esc(a.price)}">
    <span class="cnt" title="Clienti a cui è assegnato">${a.mode === 'all' ? 'tutti' : n + ' clienti'}</span></div>`; }).join('')}`).join('')}</div>`;
}
$('#adCfg') && $('#adCfg').addEventListener('input', () => { $('#adCfg').dataset.dirty = '1'; });
$('#adCfg') && $('#adCfg').addEventListener('change', () => { $('#adCfg').dataset.dirty = '1'; });
$('#adAllSome') && ($('#adAllSome').onclick = () => { $$('#adCfg [data-adm]').forEach((s) => { if (!s.dataset.adm.startsWith('av-')) s.value = 'some'; }); $('#adCfg').dataset.dirty = '1'; toast('Temi e skin impostati su «solo a chi assegno»: premi Salva add-on'); });
$('#adSave') && ($('#adSave').onclick = async () => {
  const addons = {};
  $$('#adCfg [data-adm]').forEach((s) => { addons[s.dataset.adm] = { m: s.value, p: ($(`#adCfg [data-adp="${s.dataset.adm}"]`).value || '').trim() }; });
  try { await api('PUT', '/admin/settings', { addons }); $('#adCfg').dataset.dirty = ''; await load(); toast('Add-on salvati: i clienti li vedono entro 20 minuti (o subito riaprendo l\'app)'); } catch (e) { toast(e.message, 1); }
});
/* 48 avatar dell'app (4 pacchetti da 12): nel pannello un pallino colorato numerato */
const AVC = ['#e5202b', '#ff7a3d', '#e0a800', '#1fbf75', '#13a8d8', '#3d6bff', '#7b5cff', '#b13dff', '#e535c8', '#ff3d7a', '#5f9e2f', '#7a839e'];
const AV_PACKS = [['Classici', Array.from({ length: 12 }, (_, i) => 'Classico ' + (i + 1))],
  ['Animali', ['Gatto', 'Cane', 'Volpe', 'Gufo', 'Pesce', 'Farfalla', 'Coniglio', 'Tartaruga', 'Pinguino', 'Leone', 'Balena', 'Ape']],
  ['Sport', ['Calcio', 'Basket', 'Tennis', 'Coppa', 'Bici', 'Auto da corsa', 'Medaglia', 'Bersaglio', 'Golf', 'Pesi', 'Scarpa', 'Ping pong']],
  ['Spazio', ['Razzo', 'Pianeta', 'Luna', 'Astronauta', 'Disco volante', 'Stella cadente', 'Satellite', 'Sole', 'Costellazione', 'Telescopio', 'Alieno', 'Scintille']]];
const avDot = (a) => { const n = Math.min(48, Math.max(1, parseInt(String(a || 'a1').slice(1), 10) || 1)); return `<span class="avd" data-avd style="background:${AVC[(n - 1) % 12]}">${n}</span>`; };
const avOptions = (sel) => AV_PACKS.map(([g, names], k) => `<optgroup label="${g}">${names.map((nm, i) => { const v = 'a' + (k * 12 + i + 1); return `<option value="${v}" ${sel === v ? 'selected' : ''}>${k * 12 + i + 1} · ${nm}</option>`; }).join('')}</optgroup>`).join('');
$('#rows').addEventListener('click', async (e) => {
  const tr = e.target.closest('tr'); if (!tr) return;
  const d = D.devices.find((x) => x.id === tr.dataset.id), act = e.target.closest('[data-act]')?.dataset.act;
  if (!d) return;
  if (d.parent) return openQuick(d); // connessione collegata: abbonamento gestito dal principale
  if (act === 'ext') return extend(d, 1);
  if (act === 'tog') { await save(d, { active: !d.active }); return toast(d.active ? 'Dispositivo disattivato' : 'Dispositivo riattivato'); }
  if (act === 'open') return openDrawer(d, d.status === 'pending'); // «Modifica»: scheda completa
  openQuick(d);
});
function addMonths(base, m) { const b = base && new Date(base) > new Date() ? new Date(base) : new Date(); b.setMonth(b.getMonth() + m); return b.toISOString().slice(0, 10); }
/* «Disconnetti»: interrompe la visione in corso sull'app (entro ~20 s); l'abbonamento resta attivo */
async function kickDev(d, quiet) {
  const kids = d.parent ? [] : kidsOf(d.id);
  if (!quiet && !(await ask('Disconnettere?', `La visione in corso su <b>${esc(d.name || d.code)}</b>${kids.length ? ` e sui suoi ${kids.length} dispositivi collegati` : ''} viene interrotta entro una ventina di secondi e l'app torna alla home.<br><span class="mut">L'abbonamento resta attivo: il cliente può riprendere a guardare. Per bloccarlo usa «Disattiva».</span>`, 'Disconnetti'))) return false;
  try { const r = await api('POST', '/admin/devices/' + d.id + '/kick' + (kids.length ? '?all=1' : '')); if (!quiet) toast(`${d.name || d.code}: disconnesso${r && r.kicked > 1 ? ' (' + r.kicked + ' dispositivi)' : ''}`); return true; } catch (e) { toast(e.message, 1); return false; }
}
async function extend(d, m) { await save(d, { expires: addMonths(d.expires, m), active: true }); toast(`${d.name || d.code}: +${m} ${m === 1 ? 'mese' : 'mesi'}`); }
async function save(d, patch) { try { await api('PUT', '/admin/devices/' + d.id, patch); await load(); } catch (e) { toast(e.message, 1); } }

/* ---------------- drawer ---------------- */
let edit = null, isNew = false;
function openDrawer(d, activating) {
  isNew = !d;
  edit = d ? JSON.parse(JSON.stringify(d)) : { code: '', name: '', notes: '', maxStreams: 1, active: true, expires: addMonths('', 12), playlists: [] };
  edit = { parent: '', maxConn: 1, maxProfiles: 3, lockProfiles: false, vpn: 0, vpnConf: false, ...edit, profiles: Array.isArray(edit.profiles) ? edit.profiles : [], wgText: '', vpnConfClear: false };
  if (activating && !edit.parent) { edit.active = true; if (!edit.expires) edit.expires = addMonths('', 12); if (!edit.playlists.length) edit.playlists.push({ id: 'p' + Date.now(), name: 'Principale', type: 'xtream', url: '', host: '', username: '', password: '' }); }
  $('#dTitle').innerHTML = isNew ? 'Nuovo dispositivo' : `${esc(edit.name || (edit.parent ? edit.model : '') || 'Dispositivo')} <span class="code" style="margin-left:6px">${esc(edit.code)}</span>`;
  $('#dAv').textContent = (edit.name || 'K')[0].toUpperCase();
  $('#dDel').style.display = isNew ? 'none' : '';
  $('#dKick').style.display = isNew || d.status === 'pending' ? 'none' : '';
  $('#dKick').onclick = () => kickDev(d);
  $('#drawer').classList.add('full'); $('#drawer').classList.remove('quick');
  renderDrawer();
  $('#dBody').scrollTop = 0;
  $('#shade').classList.add('on'); $('#drawer').classList.add('on');
}
function closeDrawer() { $('#shade').classList.remove('on'); $('#drawer').classList.remove('on'); }
/* modifica veloce nel pannello laterale: nome, attivo, scadenza, note (il resto nella scheda completa) */
function openQuick(d) {
  if (!d) return openDrawer(null);
  if (!d.parent && d.status === 'pending') return openDrawer(d, true); // da attivare: serve la scheda completa
  isNew = false;
  edit = JSON.parse(JSON.stringify(d));
  const linked = !!edit.parent, P = linked ? parentOf(edit) : null, dl = daysLeft(edit);
  $('#drawer').classList.remove('full'); $('#drawer').classList.add('quick');
  $('#dTitle').innerHTML = `${esc(edit.name || (linked ? edit.model : '') || 'Cliente')} <span class="code" style="margin-left:6px">${esc(edit.code)}</span>`;
  $('#dAv').textContent = (edit.name || 'K')[0].toUpperCase();
  $('#dDel').style.display = 'none';
  $('#dKick').style.display = d.status === 'pending' ? 'none' : '';
  $('#dKick').onclick = () => kickDev(d);
  const ST = { active: ['Attivo', 'var(--ok)'], expired: ['Scaduto', 'var(--bad)'], disabled: ['Disattivato', 'var(--bad)'], pending: ['Da attivare', 'var(--warn)'] }[d.status] || [d.status, ''];
  const kids = linked ? [] : kidsOf(edit.id);
  $('#dBody').innerHTML = `<div class="qsum"><div><small>Stato</small><b style="color:${ST[1]}">${ST[0]}</b></div><div><small>Scadenza</small><b>${linked ? (P ? fmtD(P.expires) : '—') : fmtD(edit.expires)}</b>${!linked && dl !== null ? `<em style="color:${dl < 0 ? 'var(--bad)' : dl <= 14 ? 'var(--warn)' : ''}">${dl < 0 ? 'scaduto da ' + -dl + ' g' : dl + ' giorni'}</em>` : ''}</div><div><small>Ultimo accesso</small><b>${ago(edit.lastSeen)}</b></div><div><small>${linked ? 'Collegato a' : 'Playlist · dispositivi'}</small><b>${linked ? esc(P ? P.name || P.code : '—') : `${(edit.playlists || []).length} · ${1 + kids.length}/${edit.maxConn || 1}`}</b></div></div>
    <label class="lbl">${linked ? 'Nome del dispositivo' : 'Nome cliente'}</label><input class="inp" id="qName" maxlength="60" value="${esc(edit.name)}" placeholder="${linked ? 'es. Camera da letto' : 'es. Mario Rossi'}">
    ${linked ? '' : `<div class="tog ${edit.active ? 'on' : ''}" id="qAct" style="margin-top:16px"><div><b>Servizio attivo</b><small>Se spento il player mostra “dispositivo disattivato”</small></div><i></i></div>
    <label class="lbl">Scadenza</label><div class="row"><input class="inp" type="date" id="qExp" value="${esc(edit.expires)}"><button class="btn" id="qInf">${edit.expires ? 'Rendi illimitato' : 'Illimitato ✓'}</button></div>
    <div class="quick">${[1, 3, 6, 12].map((m) => `<button class="btn sm" data-qm="${m}">+${m} ${m === 1 ? 'mese' : 'mesi'}</button>`).join('')}</div>`}
    <label class="lbl">Note</label><textarea class="inp" id="qNotes" placeholder="Pagamento, contatto, dettagli…">${esc(edit.notes || '')}</textarea>
    <button class="btn qfull" id="qFull">Scheda completa →<small>playlist, lettore, profili, VPN, permessi, add-on</small></button>`;
  if ($('#qAct')) $('#qAct').onclick = () => { edit.active = !edit.active; $('#qAct').classList.toggle('on', edit.active); };
  if ($('#qInf')) $('#qInf').onclick = () => { $('#qExp').value = ''; $('#qInf').textContent = 'Illimitato ✓'; };
  $$('#dBody [data-qm]').forEach((b) => (b.onclick = () => { const v = addMonths($('#qExp').value, +b.dataset.qm); $('#qExp').value = v; edit.active = true; if ($('#qAct')) $('#qAct').classList.add('on'); $('#qInf').textContent = 'Rendi illimitato'; }));
  const read = () => ({ name: $('#qName').value.trim(), notes: $('#qNotes').value, ...(linked ? {} : { expires: $('#qExp').value, active: !!edit.active }) });
  $('#qFull').onclick = () => { const v = read(); const cur = D.devices.find((x) => x.id === edit.id) || d; openDrawer({ ...cur, ...v }, false); };
  $('#dSave').onclick = async () => {
    try { await api('PUT', '/admin/devices/' + edit.id, read()); closeDrawer(); await load(); toast('Modifiche salvate'); } catch (e) { toast(e.message, 1); }
  };
  $('#dBody').scrollTop = 0;
  $('#shade').classList.add('on'); $('#drawer').classList.add('on');
  setTimeout(() => $('#qName') && $('#qName').focus(), 350);
}
$('#shade').onclick = closeDrawer; $('#dClose').onclick = closeDrawer; $('#dCancel').onclick = closeDrawer;
addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeDrawer(); $('#modal').classList.remove('on'); } });
const ICO_TV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8"/></svg>';
const ICO_BIN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>';
const VPN_L = ['Disattivata', 'Consentita', 'Sempre attiva'];
const VPN_H = ['Il cliente non vede l\'opzione VPN.', 'Il cliente può accendere e spegnere la VPN dall\'app.', 'L\'app usa sempre la VPN e il cliente non può spegnerla.'];
function profRow(p, i) {
  return `<div class="pl prof" data-pi="${i}">
    <div class="ph">${avDot(p.avatar)}<input class="inp" data-pk="name" maxlength="24" value="${esc(p.name)}" placeholder="Nome del profilo"><button class="icb" data-prm title="Elimina profilo">${ICO_BIN}</button></div>
    <div class="row3"><select class="inp" data-pk="avatar" title="Avatar">${avOptions(p.avatar)}</select>
    <select class="inp" data-pk="pl" title="Playlist del profilo"><option value="all">Tutte le playlist</option>${edit.playlists.map((x) => `<option value="${esc(x.id)}" ${p.pl === x.id ? 'selected' : ''}>${esc(x.name || 'Playlist')}</option>`).join('')}</select>
    <button class="btn sm kid ${p.kids ? 'on' : ''}" data-pkids title="Profilo per bambini">${p.kids ? '✓ ' : ''}Bambini</button></div></div>`;
}
const PERM_L = [
  ['report', 'Segnalare problemi', 'Pulsante «Segnala un problema» nell\'app'],
  ['request', 'Richiedere contenuti', 'Il cliente può chiederti film e serie'],
  ['profiles', 'Gestire i profili', 'Creare, modificare ed eliminare i profili'],
  ['link', 'Collegare altri dispositivi', 'Generare il codice dall\'app (entro le connessioni massime)'],
  ['rec', 'Registrare', 'Registrazioni dei canali e programmate'],
  ['speed', 'Speed test', 'Misura della velocità della linea'],
  ['vpn', 'Accendere/spegnere la VPN', 'Se spento decidi tu dal pannello'],
  ['epgUrl', 'Cambiare la guida TV', 'Inserire un indirizzo EPG diverso'],
  ['localPl', 'Aggiungere, modificare ed eliminare playlist', 'Playlist personali nell\'app (oltre alle tue) e nascondere quelle che non usa'],
  ['plSwitch', 'Cambiare playlist', 'Pulsante rapido vicino a «Guida TV» per passare da una playlist all\'altra'],
  ['multi', 'Multi-schermo', '2 o 4 canali insieme sullo stesso schermo (usa più connessioni)'],
  ['ai', 'Assistente IA', 'Domande sul film, la serie o il programma che sta guardando'],
];
function renderDrawer() {
  const linked = !!edit.parent, P = linked ? parentOf(edit) : null;
  const kids = isNew || linked ? [] : kidsOf(edit.id);
  const pendingFree = !isNew && !linked && edit.status === 'pending' && !kids.length;
  const maxP = Math.max(0, +edit.maxProfiles || 0);
  const effVpn = linked ? (P ? +P.vpn || 0 : 0) : +edit.vpn || 0;
  const ownConf = edit.vpnConf && !edit.vpnConfClear;
  const linkBox = !pendingFree ? '' : (() => {
    const opts = D.devices.filter((x) => !x.parent && x.id !== edit.id && x.status !== 'pending').map((x) => { const u = 1 + kidsOf(x.id).length, mx = x.maxConn || 1; return `<option value="${esc(x.id)}" ${u >= mx ? 'disabled' : ''}>${esc(x.name || x.code)} · ${u} di ${esc(mx)} connessioni${u >= mx ? ' (pieno)' : ''}</option>`; }).join('');
    return `<div class="lnk"><b>🔗 È il dispositivo di un cliente che hai già?</b><small>Collegalo al suo abbonamento come connessione in più: userà le sue playlist, la sua scadenza e i suoi profili.</small>${opts ? `<div class="row"><select class="inp" id="eLinkTo"><option value="">Scegli il cliente…</option>${opts}</select><button class="btn" id="eLinkGo">Collega a un cliente</button></div>` : '<small>Nessun cliente con abbonamento a cui collegarlo.</small>'}</div>`;
  })();
  const linkedBox = !linked ? '' : `<div class="lnk"><b>🔗 Connessione di ${esc(P ? P.name || P.code : 'un cliente eliminato')}</b><small>Abbonamento, scadenza, playlist, profili e limiti sono quelli del cliente principale${P ? ` (${1 + kidsOf(P.id).length} di ${esc(P.maxConn || 1)} connessioni)` : ''}.</small><div style="display:flex;gap:8px">${P ? '<button class="btn sm" id="eOpenP">Apri il cliente principale</button>' : ''}<button class="btn sm danger" id="eUnlink">Scollega</button></div></div>`;
  const accBox = linked ? '' : `
    <div class="row"><div><small class="mut">Connessioni massime</small><input class="inp" type="number" min="1" max="20" id="eMaxC" value="${esc(edit.maxConn ?? 1)}"></div><div><small class="mut">Profili massimi</small><input class="inp" type="number" min="0" max="12" id="eMaxP" value="${esc(maxP)}"></div></div>
    <div style="margin-top:10px"><small class="mut">Visioni contemporanee (0 = senza limite)</small><input class="inp" type="number" min="0" max="20" id="eMaxS" value="${esc(edit.maxStreams ?? 0)}"><small class="mut" style="display:block;margin-top:4px;font-size:11px">Quanti dispositivi di questo abbonamento possono guardare nello stesso momento</small></div>
    <div class="tog ${edit.lockProfiles ? 'on' : ''}" id="eLockP" style="margin-top:10px"><div><b>Blocca modifica profili</b><small>Il cliente usa i profili ma non può crearli, modificarli o eliminarli dall'app</small></div><i></i></div>
    <label class="lbl">Profili personali <span class="cnt">${edit.profiles.length} di ${maxP}</span></label>
    <div id="profs">${edit.profiles.map(profRow).join('') || `<p class="mut" style="font-size:12px;margin-bottom:8px">${maxP ? 'Nessun profilo: il cliente può crearli dall\'app, oppure aggiungili qui.' : 'Profili non inclusi in questo abbonamento (profili massimi = 0).'}</p>`}</div>
    <button class="btn" id="addProf" style="width:100%;border-style:dashed" ${edit.profiles.length >= maxP ? 'disabled' : ''}>+ Aggiungi profilo</button>
    ${isNew ? '' : `<label class="lbl">Dispositivi su questo abbonamento <span class="cnt">${1 + kids.length} di ${esc(edit.maxConn ?? 1)}</span></label>
    ${kids.map((k) => `<div class="mini"><div class="ic">${ICO_TV}</div><div class="tx"><b>${esc(k.name || k.model || k.code)}</b><small><span class="mono">${esc(k.code)}</span>${k.model ? ' · ' + esc(k.model) : ''} · ${ago(k.lastSeen)}</small></div><button class="btn sm" data-unlink="${esc(k.id)}">Scollega</button></div>`).join('') || '<p class="mut" style="font-size:12px">Solo questo dispositivo. Il cliente può aggiungerne altri dall\'app con un codice a 6 cifre (se le connessioni lo permettono), oppure puoi collegarli tu: apri un dispositivo in attesa → "Collega a un cliente".</p>'}`}`;
  const vpnBox = `
    ${linked ? `<p class="mut" style="font-size:13px;margin-bottom:8px">Modalità del cliente principale: <b>${VPN_L[effVpn]}</b></p>` : `<div class="seg" id="eVpn">${VPN_L.map((l, v) => `<button data-vpn="${v}" class="${effVpn === v ? 'on' : ''}">${l}</button>`).join('')}</div><p class="mut" style="font-size:12px;margin:6px 0 10px">${VPN_H[effVpn]}${effVpn && !ownConf && !edit.wgText && !D.wgConf ? ' <span class="warnx">⚠️ Nessuna configurazione WireGuard: incollala qui sotto o in Impostazioni.</span>' : ''}</p>`}
    ${effVpn || ownConf || edit.vpnConfClear ? `<div class="kvst"><span>WireGuard di questo dispositivo (facoltativa): ${ownConf ? '<b>✓ configurata</b>' : edit.vpnConfClear ? '<span class="warnx">verrà rimossa al salvataggio</span>' : D.wgConf ? 'usa quella generale' : 'non impostata'}</span>${ownConf ? '<button class="btn sm danger" id="eWgClr">Rimuovi</button>' : ''}</div>
    <textarea class="inp mono" id="eWg" rows="4" spellcheck="false" autocomplete="off" placeholder="${ownConf ? 'Incolla una nuova configurazione per sostituirla' : '[Interface]&#10;PrivateKey = …&#10;Address = …&#10;&#10;[Peer]&#10;PublicKey = …&#10;Endpoint = …'}">${esc(edit.wgText || '')}</textarea>` : ''}`;
  // località VPN, permessi e codice di collegamento (1.8)
  const locs = (window.KC && KC.vpnLocs) || [];
  const locBox = linked || !locs.length ? '' : `<label class="lbl">Località VPN</label><select class="inp" id="eLoc"><option value="">Configurazione generale / del dispositivo</option>${locs.map((l) => `<option value="${esc(l.id)}" ${edit.vpnLoc === l.id ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select>`;
  // lettore per tipo di contenuto (2.0): '' = lo sceglie il cliente nell'app
  const pl = edit.player || {};
  const playerBox = linked ? '' : [['live', 'TV in diretta', '📡'], ['movie', 'Film', '🎬'], ['series', 'Serie TV', '🎞️']].map(([k, l, ic]) => `<div class="pl-eng"><span class="ic">${ic}</span><b>${l}</b><div class="seg">${[['', 'Sceglie il cliente'], ['auto', 'Automatico'], ['exo', 'ExoPlayer'], ['vlc', 'VLC']].map(([v, t]) => `<button class="${(pl[k] || '') === v ? 'on' : ''}" data-peng="${k}" data-v="${v}">${t}</button>`).join('')}</div></div>`).join('');
  const extraBox = linked ? '' : `
    <div class="perms">${PERM_L.map(([k, l, d]) => `<div class="tog ${!edit.perms || edit.perms[k] !== false ? 'on' : ''}" data-perm="${k}"><div><b>${l}</b><small>${d}</small></div><i></i></div>`).join('')}</div>
    ${isNew ? '' : `<label class="lbl">Collegare un altro dispositivo</label><button class="btn" id="eLinkCode" style="width:100%">🔗 Genera codice di collegamento (6 cifre)</button><small class="mut" style="display:block;margin-top:6px;font-size:12px">Sulla nuova TV il cliente sceglie «Ho già un abbonamento» e scrive il codice. Vale 10 minuti.</small>`}`;
  // scheda a sezioni numerate, con un menu rapido in alto per saltare alla sezione
  const sec = (id, n, t, sub, html) => html.trim() ? `<section class="dsec" id="ds-${id}"><div class="dsh"><i>${n}</i><div><b>${t}</b>${sub ? `<small>${sub}</small>` : ''}</div></div>${html}</section>` : '';
  const S1 = `${isNew ? `<label class="lbl">Codice dispositivo</label><input class="inp mono" id="eCode" placeholder="Vuoto = generato, oppure quello mostrato dall'app (KXAB-12CD)" value="${esc(edit.code)}">` : `<div class="tog" style="cursor:default"><div><b>${edit.bound ? '🔒 Collegato al dispositivo' : '🔓 Non ancora collegato'}</b><small>${edit.bound ? 'Il codice funziona solo sul dispositivo che l\'ha generato. Se il cliente cambia TV o reinstalla l\'app, sblocca il collegamento.' : 'Il primo dispositivo che usa questo codice verrà collegato.'}</small></div>${edit.bound ? '<button class="btn sm" id="eReset">Sblocca</button>' : ''}</div>`}
    ${linkedBox}${linkBox}
    <label class="lbl">${linked ? 'Nome del dispositivo' : 'Nome cliente'}</label><input class="inp" id="eName" placeholder="${linked ? 'es. Camera da letto' : 'es. Mario Rossi'}" value="${esc(edit.name)}">
    ${!linked && D.role !== 'agent' && (D.agents || []).length ? `<label class="lbl">Responsabile</label><select class="inp" id="eOwner"><option value="0">Tu (nessun agente)</option>${D.agents.map((a) => `<option value="${a.id}" ${+edit.ownerId === a.id ? 'selected' : ''}>${esc(a.username)}${a.active ? '' : ' (disattivato)'}</option>`).join('')}</select><small class="mut" style="display:block;margin-top:6px;font-size:12px">L'agente scelto vede e gestisce questo cliente dal suo pannello.</small>` : ''}`;
  const S2 = linked ? '' : `<div class="tog ${edit.active ? 'on' : ''}" id="eAct"><div><b>Servizio attivo</b><small>Se spento il player mostra “dispositivo disattivato”</small></div><i></i></div>
    <div class="row"><input class="inp" type="date" id="eExp" value="${esc(edit.expires)}"><button class="btn" id="eInf">${edit.expires ? 'Rendi illimitato' : 'Illimitato ✓'}</button></div>
    <div class="quick">${[1, 3, 6, 12].map((m) => `<button class="btn sm" data-m="${m}">+${m} ${m === 1 ? 'mese' : 'mesi'}</button>`).join('')}</div>`;
  const S3 = linked ? '' : `<div id="pls">${edit.playlists.map((p, i) => `<div class="pl" data-i="${i}">
      <div class="ph"><input class="inp" data-k="name" value="${esc(p.name)}" placeholder="Nome"><input class="inp pltag" data-k="tag" value="${esc(p.tag || '')}" maxlength="6" placeholder="Sigla" title="Sigla mostrata nell'app sui contenuti di questa playlist quando sono unite (es. SKY, A, B)"><div class="seg"><button class="${p.type === 'm3u' ? 'on' : ''}" data-t="m3u">M3U</button><button class="${p.type === 'xtream' ? 'on' : ''}" data-t="xtream">Xtream</button></div><button class="icb" data-rm><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg></button></div>
      ${p.type === 'm3u' ? `<input class="inp mono" data-k="url" value="${esc(p.url)}" placeholder="http://…/get.php?…&type=m3u_plus">` : `<input class="inp mono" data-k="host" value="${esc(p.host)}" placeholder="http://host:porta"><div class="row"><input class="inp" data-k="username" value="${esc(p.username)}" placeholder="Username"><input class="inp" data-k="password" value="${esc(p.password)}" placeholder="Password"></div>`}
    </div>`).join('')}</div>
    <button class="btn" id="addPl" style="width:100%;border-style:dashed">+ Aggiungi playlist</button>
    ${edit.playlists.length > 1 ? `<div class="plmode"><b>Più playlist: come le vede il cliente?</b>
      <div class="seg wide"><button class="${edit.plMode !== 'split' ? 'on' : ''}" data-plm="merge">Unite</button><button class="${edit.plMode === 'split' ? 'on' : ''}" data-plm="split">Divise</button></div>
      <small>${edit.plMode === 'split' ? 'Il cliente vede una playlist alla volta. Con il permesso «Cambiare playlist» passa all\'altra con il pulsante vicino a «Guida TV».' : 'Tutti i contenuti insieme; ogni film, serie e canale mostra la sigla colorata della sua playlist. Con «Cambiare playlist» il cliente può anche filtrarne una sola.'}</small>
      ${edit.plMode === 'split' ? `<label class="lbl">Playlist da usare</label><select class="inp" id="ePlDef"><option value="">La prima (${esc(edit.playlists[0].name || 'Playlist 1')})</option>${edit.playlists.filter((p) => p.id).map((p) => `<option value="${esc(p.id)}" ${edit.plDefault === p.id ? 'selected' : ''}>${esc(p.name || 'Playlist')}</option>`).join('')}</select><small>Se il cliente non può cambiare playlist, usa sempre questa.</small>` : ''}
    </div>` : ''}`;
  if (!Array.isArray(edit.addons)) edit.addons = [];
  const adCat = addonCatNow().filter((a) => a.mode !== 'off');
  const addonBox = linked ? '' : `<div class="perms">${adCat.map((a) => a.mode === 'all' ? `<div class="tog on fixed" title="Incluso per tutti i clienti (si cambia in Impostazioni → Store add-on)"><div><b><span class="adsw" style="background:${ADDON_SW[a.id] || '#888'}"></span>${esc(a.name)}</b><small>${ADDON_GRP[a.cat]} · incluso per tutti</small></div><i></i></div>`
    : `<div class="tog ${edit.addons.includes(a.id) ? 'on' : ''}" data-addon="${a.id}"><div><b><span class="adsw" style="background:${ADDON_SW[a.id] || '#888'}"></span>${esc(a.name)}</b><small>${ADDON_GRP[a.cat]}${a.price ? ' · ' + esc(a.price) : ''}</small></div><i></i></div>`).join('')}</div>
    ${adCat.length ? '' : '<p class="mut">Tutti gli add-on sono nascosti (Impostazioni → Store add-on).</p>'}`;
  const S8 = `<textarea class="inp" id="eNotes" placeholder="Pagamento, contatto, dettagli…">${esc(edit.notes)}</textarea>
    ${!isNew ? `<p class="mut" style="font-size:12px;margin-top:10px">Registrato ${fmtD(edit.createdAt)} · ultimo accesso ${ago(edit.lastSeen)}${edit.model ? ' · ' + esc(edit.model) : ''}</p>` : ''}`;
  const SECS = linked
    ? [['cli', 'Dispositivo', 'Codice e nome', S1], ['vpn', 'VPN', '', vpnBox], ['note', 'Note', 'Solo per te, il cliente non le vede', S8]]
    : [['cli', 'Cliente', 'Codice, collegamento e nome', S1], ['abb', 'Abbonamento', 'Attivo e scadenza', S2], ['pl', 'Playlist', 'Liste M3U o Xtream del cliente', S3],
      ['ply', 'Lettore', 'Quale lettore usa l\'app per ogni tipo di contenuto', playerBox], ['acc', 'Account e profili', 'Dispositivi, profili e visioni insieme', accBox],
      ['vpn', 'VPN', 'Modalità e località', vpnBox + locBox], ['perm', 'Permessi', 'Cosa può fare il cliente nell\'app', extraBox], ['add', 'Add-on', 'Temi, skin e avatar dello Store dell\'app', addonBox], ['note', 'Note', 'Solo per te, il cliente non le vede', S8]];
  const shown = SECS.filter((x) => String(x[3]).trim());
  const dlv = daysLeft(edit), stv = isNew ? '' : (D.devices.find((x) => x.id === edit.id) || {}).status;
  const STV = { active: ['Attivo', 'var(--ok)'], expired: ['Scaduto', 'var(--bad)'], disabled: ['Disattivato', 'var(--bad)'], pending: ['Da attivare', 'var(--warn)'] }[stv];
  const sum = linked || isNew ? '' : `<div class="qsum full">${STV ? `<div><small>Stato</small><b style="color:${STV[1]}">${STV[0]}</b></div>` : ''}<div><small>Scadenza</small><b>${fmtD(edit.expires)}</b>${dlv !== null ? `<em style="color:${dlv < 0 ? 'var(--bad)' : dlv <= 14 ? 'var(--warn)' : ''}">${dlv < 0 ? 'scaduto da ' + -dlv + ' g' : dlv + ' giorni'}</em>` : ''}</div><div><small>Playlist</small><b>${edit.playlists.length}</b></div><div><small>Dispositivi</small><b>${1 + kidsOf(edit.id).length}/${edit.maxConn || 1}</b></div><div><small>Add-on</small><b>${(edit.addons || []).length}</b></div><div><small>Ultimo accesso</small><b>${ago(edit.lastSeen)}</b></div></div>`;
  $('#dBody').innerHTML = `<nav class="dnav">${shown.map(([id, t], i) => `<button data-ds="${id}"><i>${i + 1}</i>${t}</button>`).join('')}</nav>`
    + `<div class="dmain">${sum}<div class="dsecs">${shown.map(([id, t, sub, html], i) => sec(id, i + 1, t, sub, html)).join('')}</div></div>`;
  $$('#dBody [data-ds]').forEach((b) => (b.onclick = () => { const el = $('#ds-' + b.dataset.ds), body = $('#dBody'); if (!el) return; if ($('#drawer').classList.contains('full')) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); $$('#dBody [data-ds]').forEach((x) => x.classList.toggle('on', x === b)); return; } body.scrollTo({ top: body.scrollTop + el.getBoundingClientRect().top - body.getBoundingClientRect().top - $('#dBody .dnav').offsetHeight - 8, behavior: 'smooth' }); }));
  // il menu in alto segue la sezione che si sta guardando
  $('#dBody').onscroll = () => { const body = $('#dBody'), nav = $('#dBody .dnav'); if (!nav || $('#drawer').classList.contains('full')) return; /* pagina intera: sezioni su due colonne, la voce si evidenzia al clic */ const lim = body.getBoundingClientRect().top + ($('#drawer').classList.contains('full') ? 90 : nav.offsetHeight + 40); let curS = ''; for (const el of $$('#dBody .dsec')) if (el.getBoundingClientRect().top <= lim) curS = el.id.slice(3); $$('#dBody [data-ds]').forEach((b) => b.classList.toggle('on', b.dataset.ds === curS)); };
  $$('#dBody [data-peng]').forEach((b) => (b.onclick = () => { sync(); edit.player = { ...(edit.player || {}), [b.dataset.peng]: b.dataset.v }; if (!b.dataset.v) delete edit.player[b.dataset.peng]; $$(`#dBody [data-peng="${b.dataset.peng}"]`).forEach((x) => x.classList.toggle('on', x === b)); }));
  $('#eReset') && ($('#eReset').onclick = async () => { if (await ask('Sbloccare il collegamento?', 'Il prossimo dispositivo che usa questo codice verrà collegato al suo posto.', 'Sblocca')) { try { await api('POST', '/admin/devices/' + edit.id + '/reset'); edit.bound = false; renderDrawer(); await load(); toast('Collegamento sbloccato'); } catch (e) { toast(e.message, 1); } } });
  const sync = () => {
    edit.name = $('#eName').value; edit.notes = $('#eNotes').value;
    if ($('#eExp')) edit.expires = $('#eExp').value;
    if ($('#eCode')) edit.code = $('#eCode').value.toUpperCase();
    if ($('#eOwner')) edit.ownerId = +$('#eOwner').value || 0;
    $$('#pls .pl').forEach((el) => { const p = edit.playlists[+el.dataset.i]; $$('[data-k]', el).forEach((i) => (p[i.dataset.k] = i.value)); });
    if ($('#eMaxC')) edit.maxConn = Math.round(+$('#eMaxC').value) || 1;
    if ($('#eMaxP')) edit.maxProfiles = Math.max(0, Math.round(+$('#eMaxP').value) || 0);
    $$('#profs .prof').forEach((el) => { const p = edit.profiles[+el.dataset.pi]; $$('[data-pk]', el).forEach((i) => (p[i.dataset.pk] = i.value)); });
    if ($('#eWg')) edit.wgText = $('#eWg').value;
    if ($('#eMaxS')) edit.maxStreams = Math.max(0, Math.round(+$('#eMaxS').value) || 0);
    if ($('#eLoc')) edit.vpnLoc = $('#eLoc').value;
  };
  $$('[data-addon]').forEach((b) => (b.onclick = () => { const k = b.dataset.addon; edit.addons = edit.addons.includes(k) ? edit.addons.filter((x) => x !== k) : [...edit.addons, k]; b.classList.toggle('on', edit.addons.includes(k)); }));
  $$('[data-perm]').forEach((b) => (b.onclick = () => { const k = b.dataset.perm; edit.perms = { ...(edit.perms || {}) }; edit.perms[k] = edit.perms[k] === false; b.classList.toggle('on', edit.perms[k] !== false); }));
  $('#eLinkCode') && ($('#eLinkCode').onclick = async () => {
    try {
      const r = await (window.KC ? KC.api : api)('POST', '/admin/devices/' + edit.id + '/linkcode');
      await ask('Codice di collegamento', `<div style="font-size:40px;font-weight:700;letter-spacing:.25em;text-align:center;margin:10px 0" class="mono">${esc(r.pin)}</div><p class="mut" style="text-align:center">Valido fino alle ${new Date(r.until).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}. Sulla nuova TV: <b>Ho già un abbonamento</b> → scrivi il codice.</p>`, 'Fatto');
    } catch (e) { toast(e.message, 1); }
  });
  window.__dsync = sync;
  const re = () => { sync(); renderDrawer(); };
  $('#eAct') && ($('#eAct').onclick = () => { edit.active = !edit.active; $('#eAct').classList.toggle('on', edit.active); });
  $('#eInf') && ($('#eInf').onclick = () => { sync(); edit.expires = ''; renderDrawer(); });
  $$('[data-m]').forEach((b) => (b.onclick = () => { sync(); edit.expires = addMonths(edit.expires, +b.dataset.m); edit.active = true; renderDrawer(); }));
  $$('[data-plm]').forEach((b) => (b.onclick = () => { sync(); edit.plMode = b.dataset.plm; renderDrawer(); }));
  $('#ePlDef') && ($('#ePlDef').onchange = (e) => { edit.plDefault = e.target.value; });
  $('#addPl') && ($('#addPl').onclick = () => { sync(); edit.playlists.push({ id: 'p' + Date.now(), name: 'Playlist ' + (edit.playlists.length + 1), type: 'm3u', url: '', host: '', username: '', password: '' }); renderDrawer(); });
  $$('#pls .pl').forEach((el) => { const i = +el.dataset.i; $$('[data-t]', el).forEach((b) => (b.onclick = () => { sync(); edit.playlists[i].type = b.dataset.t; renderDrawer(); })); $('[data-rm]', el).onclick = () => { sync(); edit.playlists.splice(i, 1); renderDrawer(); }; });
  /* account: limiti e profili */
  $('#eMaxP') && ($('#eMaxP').onchange = re);
  $('#eMaxC') && ($('#eMaxC').onchange = re);
  $('#eLockP') && ($('#eLockP').onclick = () => { edit.lockProfiles = !edit.lockProfiles; $('#eLockP').classList.toggle('on', edit.lockProfiles); });
  $('#addProf') && ($('#addProf').onclick = () => { sync(); if (edit.profiles.length >= (+edit.maxProfiles || 0)) return toast('Hai raggiunto i profili massimi: aumentali prima', 1); const n = edit.profiles.length; edit.profiles.push({ id: '', name: 'Profilo ' + (n + 1), avatar: 'a' + (1 + (n % 12)), kids: false, pl: 'all' }); renderDrawer(); });
  $$('#profs .prof').forEach((el) => {
    const i = +el.dataset.pi;
    $('[data-prm]', el).onclick = () => { sync(); edit.profiles.splice(i, 1); renderDrawer(); };
    $('[data-pkids]', el).onclick = () => { sync(); edit.profiles[i].kids = !edit.profiles[i].kids; renderDrawer(); };
    $('[data-pk="avatar"]', el).onchange = (e) => { $('[data-avd]', el).outerHTML = avDot(e.target.value); };
  });
  /* VPN */
  $$('#eVpn [data-vpn]').forEach((b) => (b.onclick = () => { sync(); edit.vpn = +b.dataset.vpn; renderDrawer(); }));
  $('#eWgClr') && ($('#eWgClr').onclick = () => { sync(); edit.vpnConfClear = true; edit.wgText = ''; renderDrawer(); });
  /* connessioni */
  $('#eOpenP') && ($('#eOpenP').onclick = () => openDrawer(parentOf(edit)));
  $('#eUnlink') && ($('#eUnlink').onclick = async () => {
    if (!(await ask('Scollegare il dispositivo?', `<b class="mono">${esc(edit.code)}</b> non userà più l'abbonamento del cliente e tornerà “in attesa” di attivazione.`, 'Scollega'))) return;
    try { await api('POST', '/admin/devices/' + edit.id + '/unlink'); closeDrawer(); await load(); toast('Dispositivo scollegato: ora è in attesa'); } catch (e) { toast(e.message, 1); }
  });
  $$('[data-unlink]').forEach((b) => (b.onclick = async () => {
    const k = D.devices.find((x) => x.id === b.dataset.unlink);
    if (!k || !(await ask('Scollegare il dispositivo?', `<b class="mono">${esc(k.code)}</b> non userà più questo abbonamento e tornerà “in attesa”.`, 'Scollega'))) return;
    try { sync(); await api('POST', '/admin/devices/' + k.id + '/unlink'); await load(); renderDrawer(); toast('Dispositivo scollegato'); } catch (e) { toast(e.message, 1); }
  }));
  $('#eLinkGo') && ($('#eLinkGo').onclick = async () => {
    const pid = $('#eLinkTo').value, p = D.devices.find((x) => x.id === pid);
    if (!p) return toast('Scegli il cliente a cui collegarlo', 1);
    if (!(await ask('Collegare a un cliente?', `<b class="mono">${esc(edit.code)}</b> diventerà una connessione di <b>${esc(p.name || p.code)}</b> e userà il suo abbonamento.`, 'Collega'))) return;
    try { await api('POST', '/admin/devices/' + edit.id + '/link', { primary: pid }); closeDrawer(); await load(); toast('Dispositivo collegato a ' + (p.name || p.code)); } catch (e) { toast(e.message, 1); }
  });
  $('#dSave').onclick = async () => {
    sync();
    const vpnPart = edit.wgText && edit.wgText.trim() ? { vpnConf: edit.wgText } : edit.vpnConfClear ? { vpnConfClear: true } : {};
    const acc = { maxConn: edit.maxConn, maxProfiles: edit.maxProfiles, maxStreams: +edit.maxStreams || 0, vpnLoc: edit.vpnLoc || '', perms: Object.fromEntries(PERM_L.map(([k]) => [k, !edit.perms || edit.perms[k] !== false])), lockProfiles: !!edit.lockProfiles, vpn: +edit.vpn || 0, plMode: edit.plMode === 'split' ? 'split' : 'merge', plDefault: edit.plDefault || '', player: { live: (edit.player || {}).live || '', movie: (edit.player || {}).movie || '', series: (edit.player || {}).series || '' }, profiles: edit.profiles.map((p) => ({ id: p.id || undefined, name: p.name, avatar: p.avatar, kids: !!p.kids, pl: p.pl || 'all' })) };
    try {
      const own = $('#eOwner') ? { ownerId: edit.ownerId || 0 } : {};
      if (edit.aiLimitIn !== undefined) own.aiLimit = edit.aiLimitIn;
      if (edit.aiProviderIn !== undefined) own.aiProvider = edit.aiProviderIn;
      if (isNew) await api('POST', '/admin/devices', { code: edit.code, name: edit.name, notes: edit.notes, expires: edit.expires, active: edit.active, playlists: edit.playlists, addons: edit.addons, ...acc, ...vpnPart, ...own });
      else if (edit.parent) await api('PUT', '/admin/devices/' + edit.id, { name: edit.name, notes: edit.notes, ...vpnPart });
      else await api('PUT', '/admin/devices/' + edit.id, { name: edit.name, notes: edit.notes, expires: edit.expires, active: edit.active, playlists: edit.playlists, addons: edit.addons, ...acc, ...vpnPart, ...own });
      closeDrawer(); await load(); toast(isNew ? 'Dispositivo creato' : 'Modifiche salvate');
    } catch (e) { toast(e.message, 1); }
  };
  $('#dDel').onclick = async () => {
    const n = kidsOf(edit.id).length;
    if (!(await ask('Eliminare il dispositivo?', `Il codice <b class="mono">${esc(edit.code)}</b> verrà rimosso e il player tornerà alla schermata di attivazione.${n ? ` Le ${n} connessioni collegate torneranno “in attesa”.` : ''}`, 'Elimina'))) return;
    try { await api('DELETE', '/admin/devices/' + edit.id); closeDrawer(); await load(); toast('Eliminato'); } catch (e) { toast(e.message, 1); }
  };
}
$('#newDev').onclick = () => openDrawer(null);

/* ---------------- attività ---------------- */
const AIC = { report: ['var(--warn)', 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z'], msg: ['var(--a1)', 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'], new: ['var(--warn)', 'M12 5v14M5 12h14'], on: ['var(--ok)', 'M5 12l5 5L20 7'], off: ['var(--bad)', 'M18 6 6 18M6 6l12 12'], edit: ['var(--a1)', 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z'], del: ['var(--bad)', 'M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14'], settings: ['var(--a2)', 'M4 6h16M4 12h16M4 18h16'], auth: ['var(--a3)', 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3'] };
function renderFeed() {
  $('#feed').innerHTML = D.activity.length ? D.activity.map((a) => { const [c, p] = AIC[a.type] || AIC.edit; return `<div class="mini"><div class="ic" style="color:${c}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="${p}"/></svg></div><div class="tx"><b>${esc(a.text)}</b><small>${new Date(a.t).toLocaleString('it-IT', { dateStyle: 'medium', timeStyle: 'short' })} · ${ago(a.t)}</small></div></div>`; }).join('') : '<div class="emptyc">Nessuna attività</div>';
}

/* ---------------- messaggi ai dispositivi ---------------- */
const LVL = { info: ['Informazione', 'var(--a1)'], warn: ['Avviso', 'var(--warn)'], urgent: ['Urgente', 'var(--bad)'] };
function renderMsgs() {
  const sel = $('#mTo'); if (!sel) return;
  const keep = sel.value;
  sel.innerHTML = '<option value="all">Tutti i dispositivi</option>' + D.devices.map((d) => `<option value="${esc(d.id)}">${esc(d.name || d.code)} · ${esc(d.code)}</option>`).join('');
  if (keep) sel.value = keep;
  const devName = (id) => { const d = D.devices.find((x) => x.id === id); return d ? d.name || d.code : 'dispositivo eliminato'; };
  const list = (D.messages || []).filter((m) => !m.until || m.until > Date.now());
  $('#mList').innerHTML = list.length ? list.map((m) => `<div class="mini"><div class="ic" style="color:${LVL[m.level] ? LVL[m.level][1] : 'var(--a1)'}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="${AIC.msg[1]}"/></svg></div><div class="tx"><b>${esc(m.title || '(senza titolo)')}</b><small style="display:block">${esc(String(m.body || '').slice(0, 140))}</small><small style="display:block;margin-top:2px">${m.target === 'all' ? 'A tutti' : 'A ' + esc(devName(m.target))} · ${new Date(m.created).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })}${m.until ? ' · fino al ' + new Date(m.until).toLocaleDateString('it-IT') : ''}</small></div><button class="btn sm" data-mdel="${m.id}">Elimina</button></div>`).join('') : '<div class="emptyc">Nessun messaggio attivo</div>';
  $$('[data-mdel]').forEach((b) => (b.onclick = async () => { try { await api('DELETE', '/admin/messages/' + b.dataset.mdel); await load(); toast('Messaggio eliminato'); } catch (e) { toast(e.message, 1); } }));
}
document.addEventListener('click', async (e) => {
  if (!e.target.closest('#mSend')) return;
  try {
    await api('POST', '/admin/messages', { target: $('#mTo').value, title: $('#mTitle').value.trim(), body: $('#mBody').value.trim(), level: $('#mLvl').value, days: +$('#mDays').value });
    $('#mTitle').value = ''; $('#mBody').value = '';
    await load(); toast('Messaggio inviato: comparirà sulle TV entro pochi minuti');
  } catch (err) { toast(err.message, 1); }
});

/* ---------------- impostazioni ---------------- */
let tmpAccent = 'cinema';
function renderSettings() {
  renderAddonCfg();
  // l'aggiornamento automatico ogni 20 s non deve cancellare quello che si sta scrivendo: i campi modificati restano
  const s = D.settings, setv = (sel, v) => { const el = $(sel); if (el && el.dataset.dirty !== '1') el.value = v; }, sett = (sel, on) => { const el = $(sel); if (el && el.dataset.dirty !== '1') el.classList.toggle('on', on); };
  if ($('#themes').dataset.dirty !== '1') tmpAccent = s.accent || 'cinema';
  setv('#sBrand', s.brand || ''); setv('#sTag', s.tagline || ''); setv('#sAnn', s.announcement || ''); setv('#sSup', s.supportContact || '');
  sett('#sLocal', !!s.allowLocalPlaylists); setv('#sApk', s.apkUrl || ''); setv('#sDl', s.downloaderCode || ''); setv('#sDlStore', s.storeDownloaderCode || '');
  sett('#sFoot', s.showFootball !== false); setv('#sSrv', s.serverUrl || ''); setv('#sVer', s.apkVersion || '');
  setv('#sPrice', typeof s.price === 'string' ? s.price : ''); setv('#sPriv', s.privacy || '');
  showVerCode();
  $('#wgSt').innerHTML = D.wgConf ? '<b style="color:var(--ok)">✓ configurata</b>' : 'non configurata';
  $('#wgClear').style.display = D.wgConf ? '' : 'none';
  setv('#aUser', D.user);
  $('#themes').innerHTML = Object.entries(THEMES).map(([n, c]) => `<button class="th ${n === tmpAccent ? 'on' : ''}" data-th="${n}"><div class="sw" style="background:linear-gradient(120deg,${c.join(',')})"></div><b>${n}</b></button>`).join('');
  $$('[data-th]').forEach((b) => (b.onclick = () => { tmpAccent = b.dataset.th; $('#themes').dataset.dirty = '1'; $$('[data-th]').forEach((x) => x.classList.toggle('on', x === b)); applyTheme(tmpAccent); preview(); drawChart(); }));
  preview();
}
/* codice versione calcolato dal nome (sola lettura), come fa la build su GitHub */
function showVerCode() { const v = $('#sVer').value.trim(), c = verCode(v); $('#sVerCode').value = !v ? '—' : c ? String(c) : 'non valida'; $('#sVerCode').style.color = v && !c ? 'var(--bad)' : ''; }
$('#sVer').addEventListener('input', showVerCode);
$('#v-settings').addEventListener('input', (e) => { if (e.target.matches('.inp')) e.target.dataset.dirty = '1'; });
const clearDirty = () => $$('#v-settings [data-dirty]').forEach((el) => delete el.dataset.dirty);
$('#wgClear').onclick = async () => {
  if (!(await ask('Rimuovere la configurazione VPN?', 'I dispositivi senza una configurazione propria non potranno più usare la VPN finché non ne incolli una nuova.', 'Rimuovi'))) return;
  try { await api('PUT', '/admin/settings', { wgClear: true }); await load(); toast('Configurazione VPN rimossa'); } catch (e) { toast(e.message, 1); }
};
$('#sPrivTpl').onclick = async (e) => {
  e.preventDefault();
  if ($('#sPriv').value.trim() && !(await ask('Sostituire il testo?', 'Il testo attuale verrà sostituito dal modello predefinito (non viene salvato finché non premi Salva).', 'Sostituisci'))) return;
  try { const r = await api('GET', '/admin/privacy-template'); $('#sPriv').value = r.text || ''; $('#sPriv').dataset.dirty = '1'; toast('Modello inserito: completalo e premi Salva'); } catch (err) { toast(err.message, 1); }
};
function preview() { const c = THEMES[tmpAccent]; $('#tvA').style.background = `radial-gradient(circle at 20% 30%,${c[0]},transparent 45%),radial-gradient(circle at 80% 50%,${c[1]},transparent 45%),radial-gradient(circle at 50% 100%,${c[2]},transparent 45%)`; $('#tvN').textContent = ($('#sBrand').value || 'KAIROS').toUpperCase(); $('#tvT').textContent = $('#sAnn').value || '—'; }
['#sBrand', '#sAnn'].forEach((s) => $(s).addEventListener('input', preview));
$('#sLocal').onclick = () => { $('#sLocal').classList.toggle('on'); $('#sLocal').dataset.dirty = '1'; };
$('#sFoot').onclick = () => { $('#sFoot').classList.toggle('on'); $('#sFoot').dataset.dirty = '1'; };
$('#sSave').onclick = async () => {
  const wg = $('#sWg').value.trim();
  try { const r = await api('PUT', '/admin/settings', { brand: $('#sBrand').value.trim() || 'KAIROS', tagline: $('#sTag').value, accent: tmpAccent, announcement: $('#sAnn').value, supportContact: $('#sSup').value, allowLocalPlaylists: $('#sLocal').classList.contains('on'), apkUrl: $('#sApk').value.trim(), downloaderCode: $('#sDl').value.trim(), storeDownloaderCode: $('#sDlStore').value.trim(), showFootball: $('#sFoot').classList.contains('on'), serverUrl: $('#sSrv').value.trim(), apkVersionCode: $('#sVer').value.trim(), price: $('#sPrice').value.trim(), privacy: $('#sPriv').value, ...(wg ? { wgConf: wg } : {}) }); D.settings = r.settings; $('#sWg').value = ''; clearDirty(); await load(); toast('Impostazioni salvate — le app si aggiornano da sole'); if (window.stDirtyUpd) stDirtyUpd(); } catch (e) { toast(e.message, 1); }
};
function renderSecurity() {
  const x = D.security || {};
  const row = (ok, t, d) => `<div class="sec"><i class="${ok ? 'y' : 'n'}">${ok ? '✓' : '!'}</i><div><b>${t}</b><small>${d}</small></div></div>`;
  $('#secList').innerHTML = [
    row(true, 'Password cifrate (PBKDF2)', 'Le password non sono mai salvate in chiaro'),
    row(true, 'Sessione protetta', 'Cookie sicuro, valido 30 giorni dall\'ultimo uso, protezione CSRF e blocco dopo 5 tentativi falliti'),
    row(x.encryption, 'Playlist cifrate (AES-256)', x.encryption ? 'Le credenziali delle playlist sono cifrate nel database' : 'Manca il segreto ENC_KEY sul Worker'),
    row(x.totp, 'Verifica in due passaggi', x.totp ? 'Attiva sul tuo account' : 'Consigliata: attivala qui sotto'),
    row(x.turnstile, 'Anti-bot Turnstile', x.turnstile ? 'Attivo sulla pagina di accesso' : 'Non configurato (vedi guida)'),
    row(x.access, 'Cloudflare Access', x.access ? 'Il pannello è dietro Zero Trust' : 'Non configurato (vedi guida)'),
    row(true, 'Codici legati al dispositivo', 'Un codice copiato su un\'altra TV non funziona'),
  ].join('') + `<p class="mut" style="font-size:12px;margin-top:8px">Sessioni aperte: ${x.sessions ?? 1}</p>`;
  $('#totpBox').innerHTML = x.totp
    ? '<button class="btn sm danger" id="tOff">Disattiva verifica in due passaggi</button>'
    : '<button class="btn sm pri" id="tOn">Attiva verifica in due passaggi</button>';
  $('#tOn') && ($('#tOn').onclick = async () => {
    try {
      const r = await api('POST', '/admin/totp/setup');
      $('#totpBox').innerHTML = `<p class="mut" style="font-size:13px">Apri Google Authenticator, Microsoft Authenticator o Authy, scegli <b>Inserisci chiave</b> e scrivi questo codice:</p><div class="secret">${esc(r.secret.replace(/(.{4})/g, '$1 ').trim())}</div><div class="row"><input class="inp mono" id="tCode" inputmode="numeric" maxlength="6" placeholder="Codice a 6 cifre"><button class="btn pri" id="tConf">Conferma</button></div>`;
      $('#tConf').onclick = async () => { try { await api('POST', '/admin/totp/enable', { code: $('#tCode').value }); toast('Verifica in due passaggi attivata'); await load(); } catch (e) { toast(e.message, 1); } };
    } catch (e) { toast(e.message, 1); }
  });
  $('#tOff') && ($('#tOff').onclick = () => {
    $('#totpBox').innerHTML = '<div class="row"><input class="inp" type="password" id="tPw" placeholder="Password" autocomplete="current-password"><input class="inp mono" id="tCode" maxlength="6" placeholder="Codice 2FA"></div><button class="btn sm danger" id="tOffC">Conferma disattivazione</button>';
    $('#tOffC').onclick = async () => { try { await api('POST', '/admin/totp/disable', { password: $('#tPw').value, code: $('#tCode').value }); toast('Verifica in due passaggi disattivata'); await load(); } catch (e) { toast(e.message, 1); } };
  });
}
$('#killSes').onclick = async () => { try { await api('POST', '/admin/logout-all'); toast('Altre sessioni chiuse'); await load(); } catch (e) { toast(e.message, 1); } };
$('#aSave').onclick = async () => { try { await api('PUT', '/admin/password', { user: $('#aUser').value.trim(), current: $('#aCur').value, next: $('#aNew').value }); $('#aCur').value = $('#aNew').value = ''; toast('Credenziali aggiornate'); } catch (e) { toast(e.message, 1); } };

/* ---------------- avvio ---------------- */
(async () => {
  // se non c'è un server Kairos dietro questa pagina → demo
  try {
    const c = await fetch('/api/public/config', { credentials: 'same-origin' });
    if (!c.ok || !(c.headers.get('content-type') || '').includes('json')) throw 0;
    loadTurnstile((await c.json()).turnstileSiteKey);
  } catch { D.demo = true; $('#demoTag').style.display = 'block'; $('#lp').value = 'demo'; $('#lerr').innerHTML = '<span class="mut">Nessun server collegato: premi Accedi per esplorare la demo.</span>'; showLogin(); return; }
  // sessione ancora valida → si entra senza rifare l'accesso; un errore di rete o del server non fa uscire (si riprova)
  for (let i = 0; i < 4; i++) {
    let r = null;
    try { r = await fetch('/api/admin/state', { credentials: 'same-origin', headers: { 'X-Kairos': '1' }, cache: 'no-store' }); } catch {}
    if (r && r.ok) { try { return await enter(); } catch { break; } }
    if (r && r.status === 401) break;
    await new Promise((ok) => setTimeout(ok, 800 * (i + 1)));
  }
  showLogin();
})();

/* MAC: i «:» si mettono da soli mentre scrivi, in ogni campo con data-mac.
   data-mac="strict" = sempre un MAC · data-mac (senza valore) = MAC o ID: se scrivi lettere oltre A-F o più di 12 cifre, si lascia com'è.
   In cattura: arriva anche dove i moduli fermano gli eventi «input». */
document.addEventListener('input', (e) => {
  const el = e.target;
  if (!el || !el.matches || !el.matches('input[data-mac]')) return;
  const v = el.value, prev = el.dataset.prev || '', loose = el.dataset.mac !== 'strict';
  if (loose && /[^0-9a-f:\-.\s]/i.test(v)) { el.dataset.prev = v; return; }
  const caret = el.selectionStart == null ? v.length : el.selectionStart;
  let n = v.slice(0, caret).replace(/[^0-9a-f]/gi, '').length;
  let hex = v.replace(/[^0-9a-f]/gi, '').toUpperCase();
  const it = e.inputType || '';
  if (it.startsWith('delete') && hex === prev.replace(/[^0-9a-f]/gi, '').toUpperCase() && hex.length) {
    // cancellato solo un «:»: si cancella la cifra accanto
    if (it === 'deleteContentBackward' && n > 0) { hex = hex.slice(0, n - 1) + hex.slice(n); n--; }
    else if (it === 'deleteContentForward') hex = hex.slice(0, n) + hex.slice(n + 1);
  }
  if (loose && hex.length > 12) { el.dataset.prev = v; return; }
  hex = hex.slice(0, 12); n = Math.min(n, hex.length);
  const out = (hex.match(/.{1,2}/g) || []).join(':');
  el.value = out; el.dataset.prev = out;
  const pos = n ? n + Math.floor((n - 1) / 2) : 0;
  if (document.activeElement === el) { try { el.setSelectionRange(pos, pos); } catch {} }
}, true);
