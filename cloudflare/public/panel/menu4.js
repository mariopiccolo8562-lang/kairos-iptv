/* KAIROS Control 4 — menu corto: 7 voci al posto di ~35. Ogni voce è un gruppo di pagine; le pagine del gruppo
   diventano schede in alto nella pagina (#hub4). Le voci vecchie restano nel DOM (nascoste) e vengono «cliccate»
   dalle schede, così permessi agenti, contatori, F5 e ricerca funzionano come prima.
   PC: menu laterale · tablet (701–1180 px): barra stretta con icone · telefono: menu a scomparsa + barra in basso.
   Va caricato dopo layout3.js e colors.js. */
(() => {
  const side = $('#side'); if (!side) return;
  const S = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const HUBS = [
    ['dash', 'Panoramica', '#4f8cff', S('<rect x="3" y="3" width="7" height="9" rx="2"/><rect x="14" y="3" width="7" height="5" rx="2"/><rect x="14" y="12" width="7" height="9" rx="2"/><rect x="3" y="16" width="7" height="5" rx="2"/>'), ['dash', 'live', 'conn']],
    ['cli', 'Clienti', '#22c55e', S('<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>'), ['devices', 'lmap', 'lines', 'msgs', 'trash']],
    ['pay', '💰 Pagamenti', '#ef4444', S('<circle cx="12" cy="12" r="9"/><path d="M16 8.5c-.8-1-2-1.5-3.7-1.5-1.8 0-3.1.9-3.1 2.2 0 3.4 6.9 1.3 6.9 5 0 1.5-1.4 2.6-3.5 2.6-1.7 0-3.1-.6-4-1.7M12 5v14"/>'), ['payments']],
    ['pan', 'Pannelli IPTV', '#2dd4bf', S('<rect x="3" y="3" width="18" height="6" rx="2"/><rect x="3" y="15" width="18" height="6" rx="2"/><path d="M7 6h.01M7 18h.01M12 9v6"/>'), ['wolf', 'armada', 'storm', 'atx', 'ro', 'slt', 'blk', 'dns']],
    ['att', 'Pannelli attivazione', '#f472b6', S('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><path d="M7 14v7M3.5 17.5h7M17.5 14v7M14 17.5h7"/>'), ['appsum', 'mxp', 'oxp', 'orcp', 'orcp-agent', 'ora']],
    ['ag', 'Agenti', '#38bdf8', S('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18.5 14a5 5 0 0 1 3 6"/>'), ['agents']],
    ['app', 'App e Store', '#a78bfa', S('<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><path d="M17.5 14v7M14 17.5h7"/>'), ['store', 'apps3', 'apps3op', 'agop', 'xlist', 'dlc', 'appk', 'agk', 'vod']],
    ['req', 'Richieste e controllo', '#fb923c', S('<path d="M4 5h16v11H8l-4 4z"/><path d="M8 9h8M8 12h5"/>'), ['reports', 'creq', 'areq', 'reqai', 'apperr', 'rctl', 'activity']],
    ['set', 'Impostazioni', '#f5b041', S('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'), ['set-look', 'set-app', 'set-addon', 'set-ai', 'set-maint', 'set-sec', 'api', 'sec']],
  ];
  HUBS.splice(0, HUBS.length,
    ['dash', 'Oggi', '#4f8cff', S('<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>'), ['home', 'dash', 'live', 'conn']],
    ['cli', 'Clienti', '#22c55e', S('<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>'), ['devices', 'msgs', 'trash']],
    ['pan', 'Linee IPTV', '#2dd4bf', S('<rect x="3" y="3" width="18" height="6" rx="2"/><rect x="3" y="15" width="18" height="6" rx="2"/><path d="M7 6h.01M7 18h.01M12 9v6"/>'), ['allp', 'wolf', 'armada', 'storm', 'atx', 'ro', 'slt', 'blk']],
    ['att', 'Attivazione app', '#f472b6', S('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><path d="M7 14v7M3.5 17.5h7M17.5 14v7M14 17.5h7"/>'), ['appsum', 'xlist', 'mxp', 'oxp', 'orcp', 'orcp-agent', 'ora', 'apps3', 'apps3op', 'agop', 'agk', 'lines', 'lmap', 'dlc']],
    ['pay', 'Soldi', '#ef4444', S('<circle cx="12" cy="12" r="9"/><path d="M16 8.5c-.8-1-2-1.5-3.7-1.5-1.8 0-3.1.9-3.1 2.2 0 3.4 6.9 1.3 6.9 5 0 1.5-1.4 2.6-3.5 2.6-1.7 0-3.1-.6-4-1.7M12 5v14"/>'), ['payments']],
    ['ag', 'Agenti', '#38bdf8', S('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18.5 14a5 5 0 0 1 3 6"/>'), ['agents']],
    // Store (solo titolare): le app dello store (prima in un pannello a parte), il riepilogo e App Kairos, tutto in un posto
    ['sto', 'Store', '#a78bfa', S('<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18M16 10a4 4 0 0 1-8 0"/>'), ['stapps', 'store', 'appk']],
    ['set', 'Solo Master', '#f5b041', S('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l-.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'), ['dns', 'vod', 'activity', 'reports', 'creq', 'areq', 'reqai', 'apperr', 'rctl', 'set-look', 'set-app', 'set-addon', 'set-ai', 'set-maint', 'set-sec', 'api', 'sec']]
  );
  const css = document.createElement('style');
  css.textContent = `
#side.m4>.nav[data-v],#side.m4>.nav-h{display:none!important}
#hub4side{display:flex;flex-direction:column;gap:4px}
#hub4side .nav{--sc:#4f8cff;width:100%}
#hub4side .nav svg{color:var(--sc)}
#hub4side .nav:hover{background:color-mix(in srgb,var(--sc) 10%,transparent)}
#hub4side .nav.on{background:linear-gradient(100deg,color-mix(in srgb,var(--sc) 26%,transparent),transparent);color:#fff}
#hub4side .nav.on::before{background:var(--sc);box-shadow:0 0 14px var(--sc)}
#hub4side .nav .h4n{margin-left:auto;min-width:20px;height:20px;padding:0 6px;border-radius:10px;background:var(--bad);color:#fff;font-size:11px;font-weight:800;display:none;place-items:center}
#hub4side .nav .h4n.on{display:grid}
#hub4side .nav .h4l{flex:1;min-width:0}
#hub4 button{--c:var(--sc,#4f8cff)}
#hub4 button .h4n{background:var(--bad);color:#fff;border-radius:9px;padding:0 6px;font-size:11px;font-weight:800;margin-left:2px}
.h4-hidden{display:none!important}
#dlBar.dl-st-only>:not([data-dlk="ST"]){display:none!important}
#dlBar.dl-st-only:not(:has(>[data-dlk="ST"]:not(.no))){display:none!important}
@media (min-width:701px) and (max-width:1180px){
  #app.on{grid-template-columns:92px 1fr!important}
  #side{position:sticky!important;top:0;height:100vh;inset:auto!important;width:92px!important;transform:none!important;box-shadow:none!important;padding:18px 8px!important;overflow-y:auto;scrollbar-width:none;z-index:15!important}
  #side .brand{flex-direction:column;justify-content:center;gap:7px;padding:0 0 16px!important}
  #side .brand>div{display:flex;flex-direction:column;align-items:center;gap:4px;text-align:center;max-width:100%;min-width:0}
  #side .brand b.brandName{font-size:11px!important;letter-spacing:.2em;margin-right:-.2em;line-height:1}
  #side .brand small.brandRole{margin:0;font-size:10.5px!important;line-height:1.2;white-space:nowrap;max-width:76px;overflow:hidden;text-overflow:ellipsis}
  #side .foot{display:none!important}
  #hub4side .nav{flex-direction:column;gap:5px;padding:10px 4px;font-size:10.5px;line-height:1.15;text-align:center;justify-content:center}
  #hub4side .nav svg{width:23px;height:23px}
  #hub4side .nav.on::before{left:-8px}
  #hub4side .nav .h4n{position:absolute;top:4px;right:10px;margin:0}
  #side #logout{flex-direction:column;gap:4px;font-size:10.5px;padding:10px 4px;justify-content:center;flex-shrink:0}
  .menu-b,#kcScrim{display:none!important}
  main{padding:0 18px 28px!important}
  .topbar{margin:0 -18px 14px!important;padding:10px 18px!important}
}
@media (min-width:701px) and (max-width:1180px) and (max-height:800px){#side .brand{gap:5px;padding-bottom:12px!important}aside#side .brand svg.kx-logo{width:44px!important;height:44px!important}}
@media (max-width:700px){#hub4{position:sticky;top:var(--tb4,104px);z-index:12;margin:0 -14px 14px!important;padding:8px 14px;background:rgba(11,12,16,.92);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}}`;
  document.head.appendChild(css);

  const navOf = (v) => side.querySelector(`.nav[data-v="${v}"]`);
  const vis = (b) => b && b.style.display !== 'none';
  const items = (h) => h[4].map(navOf).filter(vis);
  const labelOf = (h) => h[0] === 'set' && D.role === 'agent' ? 'Altro' : h[1];
  const nameOf = (b) => { let t = ''; for (const n of b.childNodes) if (n.nodeType === 3) t += n.textContent; return t.trim() || b.textContent.replace(/\d+\s*$/, '').trim(); };
  const badgeOf = (b) => { let t = 0; for (const e of b.querySelectorAll('span')) { const x = (e.textContent || '').trim(); if (/^\d+$/.test(x) && e.style.display !== 'none' && getComputedStyle(e).display !== 'none' && (e.classList.contains('on') || !e.classList.contains('kc-nb'))) t += +x; } return t; };
  const LK = 'kx_hub4';
  const lastOf = () => { try { return JSON.parse(localStorage.getItem(LK) || '{}') || {}; } catch { return {}; } };
  const hubOfV = (v) => HUBS.find((h) => h[4].includes(v));
  const curV = () => { const b = side.querySelector('.nav.on[data-v]'); if (b) return b.dataset.v; const s = document.querySelector('section.view.on'); return s ? s.id.slice(2) : ''; };

  const box = document.createElement('div'); box.id = 'hub4side';
  (side.querySelector('.foot') || $('#logout')).before(box);
  for (const h of HUBS) {
    const b = document.createElement('button'); b.className = 'nav'; b.dataset.hub = h[0]; b.style.setProperty('--sc', h[2]);
    b.innerHTML = `${h[3]}<span class="h4l">${esc(labelOf(h))}</span><b class="h4n"></b>`; b.title = labelOf(h);
    b.onclick = () => go(h[0]);
    box.appendChild(b);
  }
  side.classList.add('m4');
  const bar = document.createElement('div'); bar.className = 'hubbar'; bar.id = 'hub4';
  ($('#hubBar') || $('#dlBar') || $('.topbar')).after(bar);

  function go(id) {
    const h = HUBS.find((x) => x[0] === id); if (!h) return;
    const its = items(h); if (!its.length) return;
    const last = navOf(lastOf()[id]);
    (its.includes(last) ? last : its[0]).click();
  }
  const badge = (id) => { const h = HUBS.find((x) => x[0] === id); return h ? items(h).reduce((a, x) => a + badgeOf(x), 0) : 0; };
  window.KXHub = Object.assign(go, {
    has: (id) => { const h = HUBS.find((x) => x[0] === id); return !!h && items(h).length > 0; },
    cur: () => (hubOfV(curV()) || [''])[0],
    badge,
    list: () => HUBS.filter((h) => items(h).length).map((h) => ({ id: h[0], label: labelOf(h), color: h[2], icon: h[3] })),
  });

  let sig = '';
  function sync() {
    const v = curV(), hub = hubOfV(v);
    if (hub && navOf(v)) { const l = lastOf(); if (l[hub[0]] !== v) { l[hub[0]] = v; try { localStorage.setItem(LK, JSON.stringify(l)); } catch {} } }
    for (const b of box.children) {
      const h = HUBS.find((x) => x[0] === b.dataset.hub), its = items(h);
      const d = its.length ? '' : 'none'; if (b.style.display !== d) b.style.display = d;
      const label = labelOf(h), name = b.querySelector('.h4l'); if (name && name.textContent !== label) name.textContent = label; b.title = label;
      const on = hub === h; if (b.classList.contains('on') !== on) b.classList.toggle('on', on);
      const n = badge(h[0]), el = b.querySelector('.h4n'), t = n ? String(n) : '';
      if (el.textContent !== t) { el.textContent = t; el.classList.toggle('on', !!n); }
    }
    // schede del gruppo (solo se ha più di una pagina)
    const its = hub ? items(hub) : [];
    const s = its.length > 1 ? hub[0] + '|' + its.map((x) => x.dataset.v + ':' + badgeOf(x) + ':' + nameOf(x)).join(',') + '|' + v : '';
    if (s !== sig) {
      sig = s;
      bar.style.setProperty('--sc', hub ? hub[2] : '');
      bar.innerHTML = s ? its.map((x) => { const n = badgeOf(x); return `<button data-h4="${esc(x.dataset.v)}" class="${x.dataset.v === v ? 'on' : ''}">${esc(nameOf(x).replace(/^Pannello\s+/, ''))}${n ? `<span class="h4n">${n}</span>` : ''}</button>`; }).join('') : '';
      bar.querySelectorAll('[data-h4]').forEach((t) => { t.onclick = () => { const n = navOf(t.dataset.h4); if (n) n.click(); }; });
      const on = bar.querySelector('.on'); if (on && bar.scrollWidth > bar.clientWidth) on.scrollIntoView({ block: 'nearest', inline: 'center' });
    }
    const tb = $('.topbar'); if (tb) document.documentElement.style.setProperty('--tb4', tb.offsetHeight + 'px');
    // codici Downloader: tutti in Home, «Codici Downloader», Store e Solo Master; nelle altre schede di «Oggi» e nella pagina Clienti
    // solo quello del Kairos Store (codice, oppure indirizzo se il codice non c'è; niente barra se lo Store non è tra le sue app)
    const dl = $('#dlBar'), showDl = v === 'home' || v === 'dlc' || hub?.[0] === 'set' || hub?.[0] === 'sto', stOnly = !showDl && (hub?.[0] === 'dash' || v === 'devices');
    if (dl) { dl.classList.toggle('h4-hidden', !showDl && !stOnly); dl.classList.toggle('dl-st-only', stOnly); }
  }
  let raf = 0; const later = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; sync(); }); };
  new MutationObserver(later).observe(side, { subtree: true, characterData: true, childList: true, attributes: true, attributeFilter: ['class', 'style'] });
  const v0 = view; window.view = view = function () { const r = v0.apply(this, arguments); later(); return r; };
  const ra = renderAll; window.renderAll = renderAll = function () { const r = ra.apply(this, arguments); later(); return r; };
  addEventListener('resize', later);
  sync();
})();
