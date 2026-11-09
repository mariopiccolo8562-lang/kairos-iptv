(() => {
  const root = document.getElementById('v-dash'), anchor = document.getElementById('qaG');
  if (!root || document.getElementById('kxDashLines')) return;
  const card = document.createElement('div');
  card.id = 'kxDashLines';
  card.className = 'card glass';
  card.style.cssText = 'display:none;min-width:0;margin:14px 0';
  card.innerHTML = '<div class="hd"><h3>📊 Linee attivate<small>Riepilogo dei pannelli IPTV e delle app collegate</small></h3><button class="btn sm" data-kx-dash-refresh>Aggiorna</button></div><div data-kx-dash-body><p class="mut">Carico…</p></div>';
  (anchor || document.getElementById('kpis')).insertAdjacentElement(anchor ? 'afterend' : 'afterend', card);
  const DAY = 864e5, PANEL = { wolf: 'WOLF IPTV', armada: 'Armada IPTV', storm: 'Storm IPTV', atx: 'Atlantix IPTV', ro: 'Realott IPTV', slt: 'SLT' };
  const PCOL = { wolf: '#e0524f', armada: '#2f7fd6', storm: '#7c4dff', atx: '#1fa0b6', ro: '#e08a1e', slt: '#2a9d5c' };
  const ORDER = Object.keys(PANEL), canonical = { maxplayer: 'MaxPlayer', orbixplay: 'OrbixPlay', mirkoteam: 'MirkoTeam', oraplayer: 'Ora Player', iboone: 'Ibo One', iboplayer: 'Ibo Player', duplexpro: 'Duplex Pro' };
  const cache = { at: 0, panels: [], apps: [] };
  let busy = false;
  const nameKey = (s) => String(s || '').trim().toLowerCase().replace(/[\s._-]+/g, '');
  const panelStats = (rows) => {
    return KXStats.calc(rows, {
      exp: (l) => l.exp || (l.expired ? 1 : 0),
      enabled: (l) => !(l.enabled === false || l.enabled === 0 || l.enabled === '0' || l.enabled === 'false' || l.status === 'disattivata'),
      conns: (l) => +l.conns || 0
    });
  };
  const label = (title, detail) => `${esc(title)}<small style="display:block;margin-top:3px;font-weight:500;line-height:1.35">${esc(detail)}</small>`;
  function draw(loading) {
    const body = card.querySelector('[data-kx-dash-body]');
    if (loading) { card.style.display = ''; body.innerHTML = '<p class="mut">Carico…</p>'; return; }
    const rows = cache.panels, apps = cache.apps;
    const panelTiles = ORDER.filter((p) => rows.some((l) => l.p === p)).map((p) => {
      const s = panelStats(rows.filter((l) => l.p === p));
      return { k: `panel-${p}`, v: s.active, c: PCOL[p] || 'red', label: label(`Linee attivate su ${PANEL[p]}`, `scadono 7 g: ${s.soon} · scadute: ${s.expired}`) };
    });
    const all = panelStats(rows), groups = new Map();
    for (const item of apps) {
      const key = nameKey(item.app); if (!key) continue;
      if (!groups.has(key)) groups.set(key, { name: canonical[key] || String(item.app).trim(), items: [] });
      groups.get(key).items.push(item);
    }
    const byUser = new Map();
    for (const l of rows) { const k = String(l.username || '').trim().toLowerCase(); if (k) { const a = byUser.get(k) || []; a.push(l); byUser.set(k, a); } }
    const appTiles = [...groups.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name)).map(([key, group], i) => {
      let soon = 0, expired = 0;
      for (const item of group.items) {
        const match = panelStats(byUser.get(String(item.username || '').trim().toLowerCase()) || []);
        if (match.expired) expired++;
        else if (match.soon) soon++;
      }
      return { k: `app-${i}`, v: group.items.length, c: 'blue', label: label(`Linee attivate con ${group.name}`, `scadono 7 g: ${soon} · scadute: ${expired}`), hint: key };
    });
    if (!panelTiles.length && !appTiles.length) { card.style.display = 'none'; return; }
    card.style.display = '';
    const overall = [{ label: 'Linee attive', v: all.active, c: 'red' }, { label: 'Scadono entro 7 giorni', v: all.soon, c: 'dark' }, { label: 'Scadute', v: all.expired, c: 'dark' }];
    if (all.hasConns) overall.unshift({ label: 'Online ora', v: all.online, c: 'blue' });
    body.innerHTML = `<b class="mut">Riepilogo</b>${KXStats.strip(overall)}${panelTiles.length ? `<b class="mut" style="display:block;margin-top:16px">Pannelli IPTV</b>${KXStats.strip(panelTiles)}` : ''}${appTiles.length ? `<b class="mut" style="display:block;margin-top:16px">App</b>${KXStats.strip(appTiles)}` : ''}`;
    KXStats.bind(body, (k) => k.startsWith('panel-') ? view(k.slice(6)) : k.startsWith('app-') ? view('lines') : null);
  }
  async function load(force = false) {
    if (!document.getElementById('v-dash')?.classList.contains('on')) return;
    if (busy) return;
    if (!force && Date.now() - cache.at < 300e3) { draw(false); return; }
    busy = true; draw(true);
    const canLines = D.role !== 'agent' || !!((D.me || {}).perms || {}).lines;
    const [panels, apps] = await Promise.all([
      window.KXLinePick.load(force).catch(() => []),
      canLines ? api('GET', '/admin/linked-lines').then((r) => r.items || []).catch(() => []) : Promise.resolve([])
    ]);
    cache.panels = panels || []; cache.apps = apps || []; cache.at = Date.now(); busy = false; draw(false);
  }
  card.querySelector('[data-kx-dash-refresh]').onclick = () => load(true);
  window.KXDashLines = { load };
  const oldView = view;
  window.view = view = function (v) { const r = oldView.apply(this, arguments); if (v === 'dash') load(); return r; };
  const oldRenderAll = renderAll;
  window.renderAll = renderAll = function () { const r = oldRenderAll.apply(this, arguments); if (document.getElementById('v-dash')?.classList.contains('on')) load(); return r; };
})();
