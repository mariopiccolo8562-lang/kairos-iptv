/* Occhio mostra/nascondi su ogni campo password del pannello, anche su quelli creati dopo (modali, pannelli esterni). */
(() => {
  const EYE = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  const OFF = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.9 17.9A10.9 10.9 0 0 1 12 19C5.5 19 2 12 2 12a19 19 0 0 1 5.1-6"/><path d="M9.9 4.2A10.4 10.4 0 0 1 12 4c6.5 0 10 7 10 7a19 19 0 0 1-2.2 3.2"/><path d="M14.1 14.1a3 3 0 0 1-4.2-4.2"/><path d="M2 2l20 20"/></svg>';
  const wrap = (i) => {
    if (i.dataset.eye || i.closest('.pw-wrap')) return;
    i.dataset.eye = '1';
    const w = document.createElement('span'); w.className = 'pw-wrap';
    i.parentNode.insertBefore(w, i); w.appendChild(i);
    const b = document.createElement('button'); b.type = 'button'; b.className = 'pw-eye'; b.tabIndex = -1;
    b.title = 'Mostra password'; b.setAttribute('aria-label', 'Mostra password'); b.innerHTML = EYE;
    b.onclick = (e) => {
      e.preventDefault(); e.stopPropagation();
      const show = i.type === 'password'; i.type = show ? 'text' : 'password';
      b.innerHTML = show ? OFF : EYE; b.title = b.ariaLabel = show ? 'Nascondi password' : 'Mostra password';
      i.focus();
    };
    w.appendChild(b);
  };
  const scan = (root) => (root.querySelectorAll ? root.querySelectorAll('input[type="password"]') : []).forEach(wrap);
  const go = () => {
    scan(document);
    new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => { if (n.nodeType !== 1) return; if (n.matches && n.matches('input[type="password"]')) wrap(n); else scan(n); }))).observe(document.body, { childList: true, subtree: true });
  };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', go) : go();
})();
