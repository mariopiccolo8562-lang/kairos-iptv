const PANEL_ORIGIN = 'https://panel-kairos.com';
const TOKEN_MIN = 20;
const TOKEN_MAX = 200;

function announceHere() {
  window.postMessage({
    type: 'kairos-ponte-here',
    version: chrome.runtime.getManifest().version,
  }, PANEL_ORIGIN);
}

window.addEventListener('message', (event) => {
  if (event.source !== window || event.origin !== PANEL_ORIGIN) return;
  const data = event.data;
  if (!data || typeof data !== 'object') return;
  if (data.type === 'kairos-ponte-discover') {
    announceHere();
    return;
  }
  if (data.type !== 'kairos-ponte-pair' || typeof data.token !== 'string' || data.token.length < TOKEN_MIN || data.token.length > TOKEN_MAX) return;
  chrome.runtime.sendMessage({ type: 'pair', token: data.token })
    .then((result) => {
      window.postMessage({
        type: 'kairos-ponte-paired',
        version: chrome.runtime.getManifest().version,
        orcp: result && ['ok', 'nologin', 'error'].includes(result.orcp) ? result.orcp : 'error',
      }, PANEL_ORIGIN);
    })
    .catch(() => {
      window.postMessage({
        type: 'kairos-ponte-paired',
        version: chrome.runtime.getManifest().version,
        orcp: 'error',
      }, PANEL_ORIGIN);
    });
});

announceHere();
