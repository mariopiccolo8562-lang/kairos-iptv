const KAIROS_ORIGIN = 'https://panel-kairos.com';
const BLACK_ORIGIN = 'https://reseller.blkaccess.com';
const ORCP_URL = 'https://cp.ottrun.com/';
const ORCP_INTERVAL_MS = 6 * 60 * 60 * 1000;
let orcpSyncPromise = null;
let cookieChangeTimer = 0;

function allowedSender(sender) {
  try { return new URL(sender.url).origin === BLACK_ORIGIN; } catch { return false; }
}

function allowedPairSender(sender) {
  try {
    const urlOrigin = new URL(sender.url).origin;
    return urlOrigin === KAIROS_ORIGIN && sender.origin === KAIROS_ORIGIN;
  } catch {
    return false;
  }
}

function kairosBase(value) {
  try {
    const url = new URL(value || KAIROS_ORIGIN);
    return url.origin === KAIROS_ORIGIN ? KAIROS_ORIGIN : '';
  } catch {
    return '';
  }
}

async function requestKairos(message) {
  const base = kairosBase(message.kairosUrl);
  if (!base || typeof message.token !== 'string' || !message.token) return { ok: false, networkError: false, error: 'Configurazione non valida' };
  const endpoint = message.type === 'poll' ? 'poll' : 'result';
  const response = await fetch(`${base}/api/relay/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message.type === 'poll'
      ? { token: message.token }
      : {
        token: message.token,
        id: message.id,
        status: message.status,
        body: message.body,
        err: message.err,
        ...(message.via === 'fetch' || message.via === 'iframe' ? { via: message.via } : {}),
      }),
    credentials: 'omit',
  });
  let data = {};
  try { data = await response.json(); } catch {}
  if (!response.ok) return { ok: false, networkError: true, error: String(data.error || `KAIROS HTTP ${response.status}`).slice(0, 200) };
  return { ok: true, data };
}

function isOrcpCookie(cookie) {
  const domain = String(cookie && cookie.domain || '').replace(/^\./, '').toLowerCase();
  const named = cookie && (cookie.name.startsWith('remember_web_') || cookie.name === 'orcp_ottrun_control_panel_session');
  return named && (domain === 'cp.ottrun.com' || domain === 'ottrun.com');
}

async function cookieHash(value) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function setOrcpStatus(state, remember, error) {
  const status = { state, at: Date.now(), remember: !!remember };
  if (error) status.error = String(error).slice(0, 200);
  await chrome.storage.local.set({ orcpStatus: status });
  return state;
}

async function syncOrcpNow(_reason) {
  const cookies = (await chrome.cookies.getAll({ url: ORCP_URL })).filter((cookie) => isOrcpCookie(cookie) && typeof cookie.value === 'string');
  if (!cookies.length) return setOrcpStatus('nologin', false);
  const rememberCookie = cookies.find((cookie) => cookie.name.startsWith('remember_web_'));
  const sessionCookie = cookies.find((cookie) => cookie.name === 'orcp_ottrun_control_panel_session');
  const remember = !!rememberCookie;
  const identity = rememberCookie || sessionCookie;
  if (!identity) return setOrcpStatus('nologin', false);

  const fingerprint = await cookieHash(identity.value);
  const stored = await chrome.storage.local.get(['kairosUrl', 'token', 'orcpHash', 'orcpSentAt', 'orcpStatus']);
  const now = Date.now();
  if (stored.orcpHash === fingerprint && now - (Number(stored.orcpSentAt) || 0) <= ORCP_INTERVAL_MS) {
    await chrome.storage.local.set({
      orcpStatus: { state: 'ok', at: Number(stored.orcpSentAt) || now, remember },
    });
    return 'ok';
  }
  const base = kairosBase(stored.kairosUrl);
  if (!base || typeof stored.token !== 'string' || !stored.token) {
    return setOrcpStatus('error', remember, 'Estensione non collegata a KAIROS');
  }

  try {
    const response = await fetch(`${base}/api/relay/orcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: stored.token,
        cookies: cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; '),
      }),
      credentials: 'omit',
    });
    let data = {};
    try { data = await response.json(); } catch {}
    if (!response.ok || data.ok !== true) {
      return setOrcpStatus('error', remember, String(data.error || `KAIROS HTTP ${response.status}`).slice(0, 200));
    }
    const sentAt = Date.now();
    await chrome.storage.local.set({
      orcpHash: fingerprint,
      orcpSentAt: sentAt,
      orcpStatus: { state: 'ok', at: sentAt, remember },
    });
    return 'ok';
  } catch (error) {
    return setOrcpStatus('error', remember, String(error && error.message || 'KAIROS non raggiungibile').slice(0, 200));
  }
}

function syncOrcp(reason) {
  if (orcpSyncPromise) return orcpSyncPromise;
  orcpSyncPromise = syncOrcpNow(reason)
    .catch(() => setOrcpStatus('error', false, 'Sincronizzazione ORCP non riuscita'))
    .finally(() => { orcpSyncPromise = null; });
  return orcpSyncPromise;
}

async function startOrcpSync(reason) {
  try { await chrome.alarms.create('orcpKeepAlive', { periodInMinutes: 360 }); } catch {}
  void syncOrcp(reason);
}

chrome.cookies.onChanged.addListener(({ cookie, removed }) => {
  if (removed || !isOrcpCookie(cookie)) return;
  if (cookieChangeTimer) clearTimeout(cookieChangeTimer);
  cookieChangeTimer = setTimeout(() => {
    cookieChangeTimer = 0;
    void syncOrcp('cookie');
  }, 3000);
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'orcpKeepAlive') void syncOrcp('alarm');
});

chrome.runtime.onStartup.addListener(() => { void startOrcpSync('startup'); });
chrome.runtime.onInstalled.addListener(() => { void startOrcpSync('installed'); });

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message) return false;
  if (message.type === 'pair') {
    if (!allowedPairSender(sender) || typeof message.token !== 'string' || message.token.length < 20 || message.token.length > 200) {
      sendResponse({ ok: false, orcp: 'error' });
      return false;
    }
    chrome.storage.local.set({ kairosUrl: KAIROS_ORIGIN, token: message.token })
      .then(() => syncOrcp('pair'))
      .then((orcp) => sendResponse({ ok: true, orcp }))
      .catch(() => sendResponse({ ok: false, orcp: 'error' }));
    return true;
  }
  if (!['poll', 'result'].includes(message.type) || !allowedSender(sender)) return false;
  requestKairos(message).then(sendResponse).catch((error) => {
    sendResponse({ ok: false, networkError: true, error: String(error && error.message || error).slice(0, 200) });
  });
  return true;
});
