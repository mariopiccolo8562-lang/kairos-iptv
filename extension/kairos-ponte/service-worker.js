const KAIROS_ORIGIN = 'https://panel-kairos.com';
const BLACK_ORIGIN = 'https://reseller.blkaccess.com';

function allowedSender(sender) {
  try { return new URL(sender.url).origin === BLACK_ORIGIN; } catch { return false; }
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
      : { token: message.token, id: message.id, status: message.status, body: message.body, err: message.err }),
    credentials: 'omit',
  });
  let data = {};
  try { data = await response.json(); } catch {}
  if (!response.ok) return { ok: false, networkError: true, error: String(data.error || `KAIROS HTTP ${response.status}`).slice(0, 200) };
  return { ok: true, data };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !['poll', 'result'].includes(message.type) || !allowedSender(sender)) return false;
  requestKairos(message).then(sendResponse).catch((error) => {
    sendResponse({ ok: false, networkError: true, error: String(error && error.message || error).slice(0, 200) });
  });
  return true;
});
