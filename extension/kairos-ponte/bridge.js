const DEFAULT_KAIROS_URL = 'https://panel-kairos.com';
const TARGET_ORIGIN = 'https://reseller.blkaccess.com';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const FETCH_TIMEOUT_MS = 10000;
const FRAME_LOAD_TIMEOUT_MS = 10000;
const FRAME_STABLE_TIMEOUT_MS = 20000;
const FRAME_MIN_WAIT_MS = 1500;
const FRAME_POLL_MS = 500;
let generation = 0;
let status = { lastPoll: 0, lastJob: 0, jobs: 0, lastError: '' };
let activeIframe = null;

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

function redirectedError(reason) {
  return new Error(`Black IPTV ha rimandato la pagina fuori dal sito (${reason})`);
}

async function readWithIframe(path, reason) {
  if (activeIframe) throw new Error(`Black IPTV non ha caricato la pagina (${reason})`);
  const iframe = document.createElement('iframe');
  activeIframe = iframe;
  iframe.width = '0';
  iframe.height = '0';
  iframe.tabIndex = -1;
  iframe.setAttribute('aria-hidden', 'true');
  Object.assign(iframe.style, {
    width: '0',
    height: '0',
    visibility: 'hidden',
    position: 'fixed',
    left: '-9999px',
    border: '0',
    pointerEvents: 'none',
  });
  let loadTimer;
  try {
    const loaded = new Promise((resolve, reject) => {
      loadTimer = setTimeout(() => reject(new Error(`Black IPTV non ha caricato la pagina (${reason})`)), FRAME_LOAD_TIMEOUT_MS);
      const onLoad = () => {
        let doc;
        try { doc = iframe.contentDocument; } catch {}
        if (doc && doc.URL === 'about:blank') return;
        iframe.removeEventListener('load', onLoad);
        clearTimeout(loadTimer);
        resolve();
      };
      iframe.addEventListener('load', onLoad);
      iframe.addEventListener('error', () => {
        clearTimeout(loadTimer);
        reject(new Error(`Black IPTV non ha caricato la pagina (${reason})`));
      }, { once: true });
    });
    iframe.src = TARGET_ORIGIN + path;
    document.body.appendChild(iframe);
    await loaded;
    clearTimeout(loadTimer);
    const getDocument = () => {
      let origin, doc;
      try {
        origin = iframe.contentWindow.location.origin;
        doc = iframe.contentDocument;
      } catch {
        throw redirectedError(reason);
      }
      if (origin !== TARGET_ORIGIN || !doc) throw redirectedError(reason);
      return doc;
    };
    let previousLength = -1, previousRows = -1, unchanged = 0, html = '';
    const started = Date.now();
    while (true) {
      const doc = getDocument();
      html = doc.documentElement ? doc.documentElement.outerHTML : '';
      const rows = doc.querySelectorAll('tbody tr').length;
      if (html.length === previousLength && rows === previousRows) unchanged++;
      else unchanged = 0;
      previousLength = html.length;
      previousRows = rows;
      const elapsed = Date.now() - started;
      if ((elapsed >= FRAME_MIN_WAIT_MS && unchanged >= 2) || elapsed >= FRAME_STABLE_TIMEOUT_MS) break;
      await sleep(Math.min(FRAME_POLL_MS, FRAME_STABLE_TIMEOUT_MS - elapsed));
    }
    html = getDocument().documentElement?.outerHTML || html;
    return { status: 200, body: html.slice(0, 900001), via: 'iframe' };
  } finally {
    clearTimeout(loadTimer);
    iframe.remove();
    if (activeIframe === iframe) activeIframe = null;
  }
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
            const headers = safeHeaders(job.headers);
            const body = ['GET', 'HEAD'].includes(method) ? undefined : (job.body == null ? undefined : String(job.body));
            if (method === 'GET') {
              let reason = '';
              const controller = new AbortController();
              const fetchTimer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
              try {
                const response = await fetch(target.href, {
                  method,
                  headers,
                  credentials: 'include',
                  redirect: 'manual',
                  signal: controller.signal,
                });
                if (response.type === 'opaqueredirect') reason = 'reindirizzata';
                else {
                  const text = await response.text();
                  result = { type: 'result', ...config, id: job.id, status: response.status, body: text.slice(0, 900001), via: 'fetch' };
                }
              } catch (error) {
                reason = `rete: ${String(error && error.message || error).slice(0, 160)}`;
              } finally {
                clearTimeout(fetchTimer);
              }
              if (!result) {
                try {
                  const page = await readWithIframe(target.pathname + target.search, reason || 'reindirizzata');
                  result = { type: 'result', ...config, id: job.id, ...page };
                } catch (error) {
                  result = { type: 'result', ...config, id: job.id, err: String(error && error.message || error).slice(0, 200) };
                }
              }
            } else {
              const response = await fetch(target.href, {
                method,
                headers,
                body,
                credentials: 'include',
                redirect: 'follow',
              });
              const text = await response.text();
              result = { type: 'result', ...config, id: job.id, status: response.status, body: text.slice(0, 900001), via: 'fetch' };
            }
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
