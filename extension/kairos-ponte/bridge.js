const DEFAULT_KAIROS_URL = 'https://panel-kairos.com';
const TARGET_ORIGIN = 'https://reseller.blkaccess.com';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let generation = 0;
let status = { lastPoll: 0, lastJob: 0, jobs: 0, lastError: '' };

async function saveStatus(patch) {
  status = { ...status, ...patch };
  await chrome.storage.local.set({ relayStatus: status });
}

async function readConfig() {
  const values = await chrome.storage.local.get(['kairosUrl', 'token']);
  const kairosUrl = String(values.kairosUrl || DEFAULT_KAIROS_URL).replace(/\/+$/, '');
  const token = String(values.token || '').trim();
  if (!token) return null;
  try {
    if (new URL(kairosUrl).origin !== DEFAULT_KAIROS_URL) return null;
  } catch {
    return null;
  }
  return { kairosUrl: DEFAULT_KAIROS_URL, token };
}

async function sendToKairos(message) {
  return chrome.runtime.sendMessage(message);
}

function safeHeaders(input) {
  const output = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return output;
  for (const [key, value] of Object.entries(input)) {
    const name = String(key).trim();
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,80}$/.test(name)) continue;
    if (/^(?:cookie|set-cookie|authorization|proxy-authorization|host|origin|referer|connection|content-length)$/i.test(name) || /^sec-/i.test(name)) continue;
    output[name] = String(value).slice(0, 2000);
  }
  return output;
}

async function run(myGeneration) {
  let failures = 0;
  while (myGeneration === generation) {
    const config = await readConfig();
    if (!config) {
      await saveStatus({ lastError: 'Non configurato' });
      return;
    }
    try {
      const poll = await sendToKairos({ type: 'poll', ...config });
      if (!poll || !poll.ok) throw new Error(poll && poll.error || 'Collegamento a KAIROS non riuscito');
      failures = 0;
      await saveStatus({ lastPoll: Date.now(), lastError: '' });
      const job = poll.data && poll.data.job;
      if (job) {
        await saveStatus({ lastJob: Date.now(), jobs: status.jobs + 1 });
        const validPath = typeof job.path === 'string' && job.path.startsWith('/');
        let result;
        if (!validPath) {
          result = { type: 'result', ...config, id: job.id, err: 'Percorso non valido' };
        } else {
          try {
            const target = new URL(job.path, TARGET_ORIGIN);
            if (target.origin !== TARGET_ORIGIN) throw new Error('Percorso non valido');
            const method = String(job.method || 'GET').toUpperCase();
            if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) throw new Error('Metodo non consentito');
            const response = await fetch(TARGET_ORIGIN + job.path, {
              method,
              headers: safeHeaders(job.headers),
              body: ['GET', 'HEAD'].includes(method) ? undefined : (job.body == null ? undefined : String(job.body)),
              credentials: 'include',
              redirect: 'follow',
            });
            const text = await response.text();
            result = { type: 'result', ...config, id: job.id, status: response.status, body: text.slice(0, 900001) };
          } catch (error) {
            result = { type: 'result', ...config, id: job.id, err: String(error && error.message || error).slice(0, 200) };
          }
        }
        const posted = await sendToKairos(result);
        if (!posted || !posted.ok) throw new Error(posted && posted.error || 'Risposta non inviata a KAIROS');
      }
    } catch (error) {
      failures++;
      await saveStatus({ lastError: String(error && error.message || error).slice(0, 200) });
      await sleep(failures >= 5 ? 10000 : 2000);
    }
  }
}

async function start() {
  const stored = await chrome.storage.local.get('relayStatus');
  if (stored.relayStatus && typeof stored.relayStatus === 'object') status = { ...status, ...stored.relayStatus };
  const config = await readConfig();
  generation++;
  if (!config) {
    await saveStatus({ lastError: 'Non configurato' });
    return;
  }
  await saveStatus({ lastError: '' });
  void run(generation);
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.kairosUrl || changes.token)) void start();
});

void start();
