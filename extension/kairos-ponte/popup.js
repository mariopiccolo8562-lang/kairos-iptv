const DEFAULT_URL = 'https://panel-kairos.com';
const $ = (id) => document.getElementById(id);

function formatTime(value) {
  return value ? new Date(value).toLocaleString('it-IT') : 'Mai';
}

async function render() {
  const stored = await chrome.storage.local.get(['kairosUrl', 'token', 'relayStatus']);
  const configured = !!String(stored.token || '').trim();
  const status = stored.relayStatus || {};
  const active = configured && status.lastPoll && Date.now() - status.lastPoll < 20000;
  $('kairosUrl').value = stored.kairosUrl || DEFAULT_URL;
  $('token').value = stored.token || '';
  $('state').textContent = active ? 'Ponte attivo' : configured ? 'Ponte spento' : 'Non configurato';
  $('state').className = `state ${active ? 'ok' : 'off'}`;
  $('lastPoll').textContent = formatTime(status.lastPoll);
  $('jobs').textContent = String(Number(status.jobs) || 0);
  $('lastError').textContent = status.lastError || 'Nessuno';
}

$('save').addEventListener('click', async () => {
  const rawUrl = $('kairosUrl').value.trim() || DEFAULT_URL;
  const token = $('token').value.trim();
  let url;
  try { url = new URL(rawUrl); } catch { $('message').textContent = 'Inserisci un indirizzo KAIROS valido.'; return; }
  if (url.origin !== DEFAULT_URL) { $('message').textContent = 'Per sicurezza usa https://panel-kairos.com.'; return; }
  if (!token) { $('message').textContent = 'Incolla il codice creato nel pannello KAIROS.'; return; }
  await chrome.storage.local.set({ kairosUrl: DEFAULT_URL, token });
  $('message').textContent = 'Impostazioni salvate.';
  await render();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local') void render();
});

setInterval(() => void render(), 1000);
void render();
