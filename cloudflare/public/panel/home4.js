/* Home: riepilogo rapido degli hub visibili all'utente. */
(() => {
  const side = $('#side'), main = document.querySelector('main');
  if (!side || !main) return;
  const S = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  let nav = side.querySelector('.nav[data-v="home"]');
  if (!nav) {
    nav = document.createElement('button');
    nav.className = 'nav h4-home-nav'; nav.dataset.v = 'home';
    nav.innerHTML = `${S('<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>')}Home`;
    nav.onclick = () => view('home');
    (side.querySelector('.brand') || side.firstElementChild).after(nav);
  }
  const home = document.createElement('section');
  home.className = 'view'; home.id = 'v-home';
  main.appendChild(home);
  TITLES.home = 'Home';

  const css = document.createElement('style');
  css.textContent = `
.h4-home{max-width:1500px;margin:0 auto;padding-bottom:22px}
.h4-home-head{display:flex;align-items:center;justify-content:space-between;gap:14px;margin:0 0 16px}
.h4-home-head h2{font-size:clamp(20px,2vw,26px);margin:0}
.h4-home-head small{display:block;color:var(--mut);margin-top:4px;font-size:13px}
.h4-home-grid{display:grid;grid-template-columns:1fr;gap:14px}
.h4-home-tile{--hc:#4f8cff;position:relative;display:flex;flex-direction:column;justify-content:flex-start;width:100%;min-width:0;text-align:left;color:var(--txt,#f4f5fa);font:inherit;padding:19px;border:1px solid color-mix(in srgb,var(--hc) 38%,var(--line));border-radius:18px;background:linear-gradient(135deg,color-mix(in srgb,var(--hc) 14%,rgba(17,19,34,.96)),rgba(17,19,34,.92));box-shadow:0 12px 32px rgba(0,0,0,.12);cursor:pointer;transition:transform .16s,border-color .16s,box-shadow .16s}
.h4-home-tile:hover{transform:translateY(-2px);border-color:var(--hc);box-shadow:0 16px 34px color-mix(in srgb,var(--hc) 14%,transparent)}
.h4-home-title{display:flex;align-items:center;gap:11px;min-width:0}
.h4-home-icon{width:42px;height:42px;display:grid;place-items:center;flex:none;border-radius:13px;background:color-mix(in srgb,var(--hc) 18%,transparent);color:var(--hc)}
.h4-home-icon svg{width:23px;height:23px}
.h4-home-title b{font-size:17px;line-height:1.2}
.h4-home-badge{margin-left:auto;min-width:24px;height:24px;padding:0 7px;display:grid;place-items:center;border-radius:12px;background:var(--bad);color:#fff;font-size:12px;font-weight:800}
.h4-home-sub{display:block;color:var(--mut);font-size:12.5px;line-height:1.45;margin:13px 0 0}
.h4-home-metrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:14px}
.h4-home-metric{min-width:0;padding:9px 10px;border-radius:11px;background:rgba(255,255,255,.045)}
.h4-home-metric b{display:block;font-size:19px;line-height:1.1;color:var(--hc)}
.h4-home-metric small{display:block;color:var(--mut);font-size:11px;line-height:1.3;margin-top:4px}
.h4-home-panels{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.h4-home-panels span{padding:4px 8px;border-radius:8px;background:rgba(255,255,255,.06);font-size:10.5px;color:var(--mut)}
@media(min-width:650px){.h4-home-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.h4-home-tile{padding:21px}}
@media(min-width:1180px){.h4-home-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(min-width:1550px){.h4-home-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}
@media(max-width:480px){.h4-home-head{align-items:flex-start}.h4-home-head .btn{white-space:nowrap}.h4-home-tile{padding:16px}.h4-home-title b{font-size:16px}}
#side .h4-home-nav{display:none!important}
.brand{cursor:pointer}`;
  document.head.appendChild(css);

  const metric = (value, label) => `<span class="h4-home-metric"><b>${esc(String(value))}</b><small>${esc(label)}</small></span>`;
  const dayLeft = (d) => d.expires ? Math.ceil((new Date(d.expires) - Date.now()) / 864e5) : null;
  const liveNavVisible = () => { const n = side.querySelector('.nav[data-v="live"]'); return !!n && n.style.display !== 'none'; };
  function stats(id, label) {
    if (id === 'dash') {
      const online = liveNavVisible() ? window.KC?.live?.counts?.online : null;
      const recent = D.devices.filter((d) => Date.now() - d.lastSeen < 24 * 3600e3).length;
      const liveMetric = liveNavVisible() ? metric(online == null ? '—' : online, 'Online ora') : '';
      return `<div class="h4-home-metrics">${liveMetric}${metric(recent, 'Visti nelle 24h')}</div>`;
    }
    if (id === 'cli') {
      const active = D.devices.filter((d) => d.status === 'active').length;
      const sd = window.kxSoonDays ? kxSoonDays() : 14, soon = D.devices.filter((d) => d.status === 'active' && dayLeft(d) !== null && dayLeft(d) <= sd).length;
      const expired = D.devices.filter((d) => d.status === 'expired').length;
      return `<div class="h4-home-metrics">${metric(active, 'Attivi')}${metric(soon, 'In scadenza · ' + sd + ' g')}${metric(expired, 'Scaduti')}</div>`;
    }
    if (id === 'pan') {
      const s = window.KXDashLines?.homeSummary?.();
      const total = s?.total || { active: 0, soon: 0, expired: 0 };
      const waiting = !s?.at;
      const chips = (s?.panels || []).map((p) => `<span>${esc(p.name)} · ${p.active}${p.cr ? ` · 💳 ${esc(p.cr)}` : ''}</span>`).join('');
      return `<div class="h4-home-metrics">${metric(waiting ? '…' : total.active, 'Linee attive')}${metric(waiting ? '…' : total.soon, 'Scadono · 7 g')}${metric(waiting ? '…' : total.expired, 'Scadute')}</div>${chips ? `<div class="h4-home-panels">${chips}</div>` : ''}`;
    }
    if (id === 'att') {
      const s = window.KXDashLines?.homeSummary?.();
      return s?.canSeeApps ? `<div class="h4-home-metrics">${metric(s.at ? s.apps : '…', 'Attivazioni collegate')}</div>` : `<small class="h4-home-sub">MaxPlayer, OrbixPlay, MirkoTeam…</small>`;
    }
    if (id === 'pay') {
      const due = window.KXPay?.dueSummary?.() || { n: 0, text: '0 €' };
      // anche gli agenti che ti devono soldi o crediti (registro), e per l'agente quanto deve lui al fornitore: visibili subito in Home
      const ag = !isAgent() ? window.KXPay?.agentDebtSummary?.() : null, own = isAgent() ? window.KXPay?.ownDebtText?.() : '';
      return `<div class="h4-home-metrics">${metric(due.n, 'Da pagare')}${metric(due.text, 'Totale da riscuotere')}${ag && ag.n ? metric(ag.short || ag.text, ag.n === 1 ? 'Ti deve 1 agente' : `Ti devono ${ag.n} agenti`) : ''}${own ? metric(own, 'Devi al fornitore') : ''}</div>`;
    }
    if (id === 'sto') return '<small class="h4-home-sub">App dello store, riepilogo e App Kairos</small>';
    if (id === 'ev') { const L = (window.KXEvents && KXEvents.list && KXEvents.list()) || [], live = L.filter((e) => e.live).length; return live ? `<div class="h4-home-metrics">${metric(live, 'In diretta')}${metric(L.filter((e) => !e.live && e.state !== 'post').length, 'Più tardi')}</div>` : '<small class="h4-home-sub">Sport in diretta e dove vederli</small>'; }
    if (id === 'ag') {
      if (isAgent()) return '';
      const agents = D.agents || [];
      return `<div class="h4-home-metrics">${metric(agents.length, 'Agenti')}${metric(agents.filter((a) => a.active !== 0).length, 'Attivi')}</div>`;
    }
    return `<small class="h4-home-sub">${isAgent() ? 'Altre funzioni autorizzate' : 'DNS, server, app, registro, impostazioni'}</small>`;
  }
  function isAgent() { return D.role === 'agent'; }
  function render() {
    if (!window.KXHub?.list) return;
    const hubs = KXHub.list();
    // saluto con nome, data e ruolo (prima: «Benvenuto su KAIROS»); «Nuovo cliente» c'è già in alto (e in basso sul telefono)
    const h = new Date().getHours(), hi = h < 5 ? 'Buonanotte' : h < 13 ? 'Buongiorno' : h < 18 ? 'Buon pomeriggio' : h < 23 ? 'Buonasera' : 'Buonanotte';
    const who = (isAgent() && D.me && D.me.username) || D.user || '', day = new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
    home.innerHTML = `<div class="h4-home"><div class="h4-home-head"><div><h2>${hi}${who ? `, <span class="h4-hi">${esc(who)}</span>` : ''}</h2><small>${esc(day)}${window.KXRoleTxt ? ' · ' + esc(window.KXRoleTxt) : ''}</small></div></div>
      <div class="h4-home-grid">${hubs.map((h) => `<button type="button" class="h4-home-tile" data-home-hub="${esc(h.id)}" style="--hc:${esc(h.color)}"><span class="h4-home-title"><i class="h4-home-icon">${h.icon}</i><b>${esc(h.label)}</b>${KXHub.badge(h.id) ? `<span class="h4-home-badge">${KXHub.badge(h.id)}</span>` : ''}</span>${stats(h.id, h.label)}</button>`).join('')}</div></div>`;
    $$('[data-home-hub]', home).forEach((b) => b.addEventListener('click', () => KXHub(b.dataset.homeHub)));
  }
  let presenceAt = 0, presenceAttemptAt = 0, presenceRequest = null;
  function refreshPresence() {
    if (!home.classList.contains('on') || !liveNavVisible() || !window.KC?.api) return;
    const now = Date.now();
    if (window.KC.live && now - presenceAt < 120e3) return;
    if (presenceRequest || now - presenceAttemptAt < 120e3) return presenceRequest;
    presenceAttemptAt = now;
    presenceRequest = (async () => {
      try {
        window.KC.live = await window.KC.api('GET', '/admin/presence');
        presenceAt = Date.now();
        if (home.classList.contains('on')) render();
      } catch {} finally { presenceRequest = null; }
    })();
    return presenceRequest;
  }
  const refreshLines = () => { if (home.classList.contains('on')) window.KXDashLines?.load().catch(() => {}); };
  window.addEventListener('kxlines:update', render);
  window.addEventListener('kxpay:update', render);
  const oldView = view;
  window.view = view = function (v) { const r = oldView.apply(this, arguments); if (v === 'home') { render(); refreshLines(); refreshPresence(); } return r; };
  const oldRenderAll = renderAll;
  window.renderAll = renderAll = function () { const r = oldRenderAll.apply(this, arguments); if (home.classList.contains('on')) { render(); refreshLines(); } return r; };
  const brand = side.querySelector('.brand');
  if (brand) {
    brand.setAttribute('role', 'button'); brand.tabIndex = 0;
    const goHome = () => { side.classList.remove('open'); view('home'); };
    brand.addEventListener('click', goHome);
    brand.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goHome(); } });
  }
})();
