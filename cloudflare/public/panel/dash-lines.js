(() => {
  const root = document.getElementById('v-dash'), anchor = document.getElementById('qaG');
  if (!root || document.getElementById('kxDashLines')) return;
  const card = document.createElement('div');
  card.id = 'kxDashLines';
  card.className = 'card glass';
  card.style.cssText = 'display:none;min-width:0;margin:14px 0';
  card.innerHTML = '<div class="hd"><h3>📊 Linee attivate<small>Riepilogo dei pannelli IPTV</small></h3><button class="btn sm" data-kx-dash-refresh>Aggiorna</button></div><div data-kx-dash-body><p class="mut">Carico…</p></div>';
  (anchor || document.getElementById('kpis')).insertAdjacentElement('afterend', card);

  const side = document.getElementById('side');
  let appNav = side.querySelector('.nav[data-v="appsum"]');
  if (!appNav) {
    appNav = document.createElement('button');
    appNav.className = 'nav';
    appNav.dataset.v = 'appsum';
    appNav.style.display = 'none';
    appNav.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><rect x="7" y="12" width="3" height="6" rx="1"/><rect x="13" y="8" width="3" height="10" rx="1"/><rect x="19" y="5" width="2" height="13" rx="1"/></svg>Riepilogo app';
    appNav.onclick = () => view('appsum');
    const navAnchor = side.querySelector('.nav[data-v="pan"]') || side.querySelector('.nav[data-v="wolf"]');
    if (navAnchor) navAnchor.after(appNav); else side.appendChild(appNav);
  }
  let appView = document.getElementById('v-appsum');
  if (!appView) {
    appView = document.createElement('section');
    appView.className = 'view';
    appView.id = 'v-appsum';
    root.after(appView);
  }
  appView.innerHTML = '<div class="card glass" style="min-width:0;margin:14px 0"><div class="hd"><h3>Riepilogo app<small>Linee attivate sulle app collegate</small></h3><button class="btn sm" data-kx-app-refresh>Aggiorna</button></div><div data-kx-app-body><p class="mut">Carico…</p></div></div>';
  TITLES.appsum = 'Riepilogo app';

  const PANEL = { wolf: 'WOLF IPTV', armada: 'Armada IPTV', storm: 'Storm IPTV', atx: 'Atlantix IPTV', ro: 'Realott IPTV', slt: 'SLT' };
  const PCOL = { wolf: '#e0524f', armada: '#2f7fd6', storm: '#7c4dff', atx: '#1fa0b6', ro: '#e08a1e', slt: '#2a9d5c' };
  const APP_COL = { maxplayer: '#d6336c', orbixplay: '#6f42c1', mirkoteam: '#0ca678', oraplayer: '#e08a1e' };
  const ORDER = Object.keys(PANEL), canonical = { maxplayer: 'MaxPlayer', orbixplay: 'OrbixPlay', mirkoteam: 'MirkoTeam', oraplayer: 'Ora Player', iboone: 'Ibo One', iboplayer: 'Ibo Player', duplexpro: 'Duplex Pro' };
  const cache = { at: 0, panels: [], apps: [], cr: {} };
  let busy = false;
  /* crediti dell'account collegato a ogni pannello: WOLF, Armada e Storm arrivano con le linee (KXLinePick.credits),
     Atlantix dal riepilogo dell'account. Agente Armada/Storm: «rimasti di quelli del mese». Realott e SLT non li danno */
  const crNum = (v) => v != null && String(v).trim() !== '' && Number.isFinite(+v) ? +v : null;
  const crFmt = (v) => typeof v === 'number' ? v.toLocaleString('it-IT', { maximumFractionDigits: 2 }) : String(v);
  const crText = (c, short) => !c ? '' : c.wait ? '…' : c.of != null ? (short ? `${crFmt(c.v)}/${crFmt(c.of)}` : `${crFmt(c.v)} di ${crFmt(c.of)} questo mese`) : crFmt(c.v);
  const crPill = (p) => { const t = crText(cache.cr[p]); return t ? `<span class="kx-dl-cr" style="display:inline-flex;align-items:center;gap:5px;margin-top:8px;padding:3px 10px;border-radius:999px;background:rgba(0,0,0,.25);font-size:12.5px;font-weight:700;max-width:100%">💳 Crediti: ${esc(t)}</span>` : ''; };
  const nameKey = (s) => String(s || '').trim().toLowerCase().replace(/[\s._-]+/g, '');
  const canSeeApps = () => D.role !== 'agent' || !!((D.me || {}).perms || {}).lines;
  const panelStats = (rows) => KXStats.calc(rows, {
    exp: (l) => l.exp || (l.expired ? 1 : 0),
    enabled: (l) => !(l.enabled === false || l.enabled === 0 || l.enabled === '0' || l.enabled === 'false' || l.status === 'disattivata'),
    conns: (l) => +l.conns || 0
  });
  const label = (title, detail) => `${esc(title)}<small style="display:block;margin-top:3px;font-weight:500;line-height:1.35">${esc(detail)}</small>`;
  const panelBody = card.querySelector('[data-kx-dash-body]');
  const appBody = appView.querySelector('[data-kx-app-body]');

  function panelTiles() {
    return ORDER.filter((p) => cache.panels.some((l) => l.p === p)).map((p) => {
      const s = panelStats(cache.panels.filter((l) => l.p === p));
      return { k: `panel-${p}`, v: s.active, c: PCOL[p] || 'red', label: label(`Linee attivate su ${PANEL[p]}`, `scadono 7 g: ${s.soon} · scadute: ${s.expired}`) + crPill(p) };
    });
  }
  function homeSummary() {
    const total = panelStats(cache.panels);
    const panels = ORDER.filter((p) => cache.panels.some((l) => l.p === p)).map((p) => ({ id: p, name: PANEL[p], ...panelStats(cache.panels.filter((l) => l.p === p)), cr: crText(cache.cr[p], true) }));
    return { total, panels, apps: cache.apps.length, canSeeApps: canSeeApps(), at: cache.at };
  }
  function appTiles() {
    const groups = new Map(), byUser = new Map();
    for (const item of cache.apps) {
      const key = nameKey(item.app); if (!key) continue;
      if (!groups.has(key)) groups.set(key, { name: canonical[key] || String(item.app).trim(), items: [] });
      groups.get(key).items.push(item);
    }
    for (const l of cache.panels) {
      const k = String(l.username || '').trim().toLowerCase();
      if (k) { const a = byUser.get(k) || []; a.push(l); byUser.set(k, a); }
    }
    return [...groups.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name)).map(([key, group], i) => {
      let soon = 0, expired = 0;
      for (const item of group.items) {
        const match = panelStats(byUser.get(String(item.username || '').trim().toLowerCase()) || []);
        if (match.expired) expired++;
        else if (match.soon) soon++;
      }
      return { k: `app-${i}`, v: group.items.length, c: APP_COL[key] || '#2f7fd6', label: label(`Linee attivate con ${group.name}`, `scadono 7 g: ${soon} · scadute: ${expired}`), hint: key };
    });
  }
  function render(loading) {
    if (loading) {
      card.style.display = root.classList.contains('on') ? '' : 'none';
      panelBody.innerHTML = '<p class="mut">Carico…</p>';
      appBody.innerHTML = '<p class="mut">Carico…</p>';
      return;
    }
    const panels = panelTiles(), all = panelStats(cache.panels);
    if (!panels.length) card.style.display = 'none';
    else {
      card.style.display = '';
      const overall = [{ label: 'Linee attive', v: all.active, c: 'red' }, { label: 'Scadono entro 7 giorni', v: all.soon, c: 'dark' }, { label: 'Scadute', v: all.expired, c: 'dark' }];
      if (all.hasConns) overall.unshift({ label: 'Online ora', v: all.online, c: 'blue' });
      panelBody.innerHTML = `<b class="mut">Riepilogo</b>${KXStats.strip(overall)}<b class="mut" style="display:block;margin-top:16px">Pannelli IPTV</b>${KXStats.strip(panels)}`;
      KXStats.bind(panelBody, (k) => k.startsWith('panel-') ? view(k.slice(6)) : null);
    }
    const apps = appTiles();
    appBody.innerHTML = apps.length ? KXStats.strip(apps) : '<p class="mut" style="margin:14px 0">Nessuna app collegata.</p>';
    KXStats.bind(appBody, (k) => k.startsWith('app-') ? view('lines') : null);
  }
  function syncAccess() {
    appNav.style.display = canSeeApps() ? '' : 'none';
    if (!canSeeApps() && appView.classList.contains('on')) view('dash');
  }
  async function load(force = false) {
    const dashOn = root.classList.contains('on'), appOn = appView.classList.contains('on'), homeOn = $('#v-home')?.classList.contains('on');
    if (!dashOn && !appOn && !homeOn) return;
    if (busy) return;
    if (!force && Date.now() - cache.at < 300e3) { render(false); return; }
    busy = true; render(true);
    const [panels, apps] = await Promise.all([
      window.KXLinePick.load(force).catch(() => []),
      canSeeApps() ? api('GET', '/admin/linked-lines').then((r) => r.items || []).catch(() => []) : Promise.resolve([])
    ]);
    cache.panels = panels || []; cache.apps = apps || []; cache.at = Date.now(); busy = false;
    cache.cr = window.KXLinePick.credits ? window.KXLinePick.credits() : {};
    // Atlantix: i crediti stanno nel riepilogo dell'account (lo stesso della pagina Atlantix); arrivano dopo le linee
    if (cache.panels.some((l) => l.p === 'atx')) {
      const at = cache.at; cache.cr.atx = { wait: true };
      api('GET', '/admin/atx/overview').then((d) => {
        const m = (d && d.member) || {};
        return [true, 1, '1', 'true'].includes(m.unlimited) ? { v: '∞' } : crNum(m.credits) != null ? { v: Math.trunc(+m.credits) } : null;
      }).catch(() => null).then((c) => {
        if (at !== cache.at) return; // nel frattempo è ripartito il caricamento
        if (c) cache.cr.atx = c; else delete cache.cr.atx;
        if (root.classList.contains('on') || appView.classList.contains('on')) render(false);
        window.dispatchEvent(new Event('kxlines:update'));
      });
    }
    if (dashOn || appOn) render(false);
    window.dispatchEvent(new Event('kxlines:update'));
  }
  card.querySelector('[data-kx-dash-refresh]').onclick = () => load(true);
  appView.querySelector('[data-kx-app-refresh]').onclick = () => load(true);
  window.KXDashLines = { load, homeSummary, canSeeApps };
  const oldView = view;
  window.view = view = function (v) { const r = oldView.apply(this, arguments); if (v === 'dash' || v === 'appsum' || v === 'home') load(); return r; };
  const oldRenderAll = renderAll;
  window.renderAll = renderAll = function () { const r = oldRenderAll.apply(this, arguments); syncAccess(); if (root.classList.contains('on') || appView.classList.contains('on') || $('#v-home')?.classList.contains('on')) load(); return r; };
  syncAccess();
})();
