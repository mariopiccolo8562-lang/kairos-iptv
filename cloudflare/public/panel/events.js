/* KAIROS Control — «Eventi ora» (10 novembre 2026): sport in diretta e di oggi, con dove vederli.
   - Pagina «Eventi ora» (voce del menu subito dopo lo Store): gli stessi eventi della Pro (calcio, F1, MotoGP, tennis,
     NBA, NFL, UFC, rugby) con risultato e minuto in diretta, le emittenti italiane di solito e i canali della lista più usata
     dai clienti che li trasmettono (per nome e gruppo; «Guida TV» controlla cosa va in onda su quei canali).
   - Striscia in alto su ogni pagina: gli eventi scorrono da destra a sinistra; con la rotellina del mouse o col dito si va
     avanti e indietro (si ferma e riparte da sola); clic → la pagina; ✕ la nasconde (si riaccende dalla pagina).
   Titolare sempre; agenti solo con il permesso «Eventi ora» (events), spento per tutti. Dati: /admin/events (server). */
(() => {
  const css = document.createElement('style');
  css.textContent = `#evStrip{display:flex;align-items:center;gap:8px;margin:0 0 12px;padding:6px 8px 6px 10px;border-radius:12px;border:1px solid rgba(34,197,94,.35);background:linear-gradient(90deg,rgba(34,197,94,.12),rgba(79,140,255,.06));font-size:13px;min-width:0}
#evStrip[hidden]{display:none}
#evStrip .es-lab{flex:none;font-weight:800;color:#86efac;cursor:pointer;white-space:nowrap}
#evStrip .es-scr{flex:1;min-width:0;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;-webkit-overflow-scrolling:touch;overscroll-behavior-x:contain;cursor:grab;-webkit-mask-image:linear-gradient(90deg,transparent,#000 24px,#000 calc(100% - 24px),transparent);mask-image:linear-gradient(90deg,transparent,#000 24px,#000 calc(100% - 24px),transparent)}
#evStrip .es-scr::-webkit-scrollbar{display:none}
#evStrip .es-run{display:inline-flex;gap:22px;white-space:nowrap;padding:2px 12px}
#evStrip .es-it{display:inline-flex;align-items:center;gap:6px;cursor:pointer;color:var(--txt,#e6e9f2)}
#evStrip .es-it:hover{color:#fff;text-decoration:underline dotted}
#evStrip .es-live{color:#f87171;font-weight:800}#evStrip .es-tm{color:#fbbf24;font-weight:700}#evStrip .es-sc{font-weight:800;color:#fff}
#evStrip .es-tv{color:var(--mut);font-size:12px}
#evStrip .es-x{flex:none;border:0;background:none;color:var(--mut);cursor:pointer;font-size:14px;padding:2px 6px;border-radius:6px}#evStrip .es-x:hover{color:#fff;background:rgba(255,255,255,.08)}
#v-events .ev-tabs{display:flex;gap:6px;flex-wrap:wrap;margin:4px 0 14px}
#v-events .ev-tabs button{border:1px solid var(--line);background:rgba(255,255,255,.03);color:var(--txt,#e6e9f2);border-radius:999px;padding:6px 12px;font:inherit;font-size:13px;font-weight:700;cursor:pointer}
#v-events .ev-tabs button.on{background:linear-gradient(90deg,rgba(34,197,94,.3),rgba(79,140,255,.2));border-color:rgba(34,197,94,.6);color:#fff}
#v-events .ev-tabs button em{font-style:normal;margin-left:6px;color:var(--mut);font-weight:600}
#v-events h4.ev-h{margin:16px 0 8px;font-size:14px;color:var(--mut);text-transform:uppercase;letter-spacing:.06em}
#v-events .ev-it{display:grid;grid-template-columns:96px minmax(0,1fr);gap:14px;padding:12px 14px;border:1px solid var(--line);border-radius:14px;margin-bottom:8px;background:rgba(255,255,255,.025)}
#v-events .ev-it.live{border-color:rgba(248,113,113,.55);background:linear-gradient(100deg,rgba(248,113,113,.1),rgba(255,255,255,.02))}
#v-events .ev-tm b{display:block;font-size:18px}#v-events .ev-tm small{color:var(--mut);font-size:12px}
#v-events .ev-it.live .ev-tm b{color:#f87171}
#v-events .ev-lg{font-size:12px;color:var(--mut);font-weight:700;text-transform:uppercase;letter-spacing:.04em}
#v-events .ev-teams{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:16px;font-weight:700;margin:4px 0}
#v-events .ev-teams img{width:24px;height:24px;object-fit:contain}
#v-events .ev-sc{padding:2px 10px;border-radius:8px;background:rgba(255,255,255,.08);font-weight:800}
#v-events .ev-sub{font-size:12.5px;color:var(--mut)}
#v-events .ev-tv{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:6px;font-size:12.5px}
#v-events .ev-b{padding:2px 8px;border-radius:999px;background:rgba(79,140,255,.16);color:#9cc0ff;font-weight:700}
#v-events .ev-ch{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:6px;font-size:12.5px}
#v-events .ev-c{padding:2px 8px;border-radius:8px;border:1px solid var(--line);background:rgba(255,255,255,.04)}
#v-events .ev-c.ok{border-color:rgba(34,197,94,.6);background:rgba(34,197,94,.14);color:#86efac}
#v-events .ev-c small{display:block;color:var(--mut);font-size:11px}
#v-events .ev-empty{padding:18px;color:var(--mut)}
@media (max-width:700px){#v-events .ev-it{grid-template-columns:64px minmax(0,1fr);gap:10px;padding:10px}#v-events .ev-tm b{font-size:15px}#v-events .ev-teams{font-size:14.5px}#evStrip{margin:0 0 10px}}
@media (prefers-reduced-motion:reduce){#evStrip .es-scr{cursor:auto}}`;
  document.head.appendChild(css);

  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const isAg = () => typeof D === 'object' && D && D.role === 'agent';
  const can = () => typeof D === 'object' && !!D && !!D.role && (!isAg() || !!(((D.me || {}).perms || {}).events));
  const SP = [['calcio', 'Calcio', '⚽'], ['f1', 'F1', '🏎️'], ['motogp', 'MotoGP', '🏍️'], ['tennis', 'Tennis', '🎾'], ['basket', 'NBA', '🏀'], ['nfl', 'NFL', '🏈'], ['ufc', 'UFC', '🥊'], ['rugby', 'Rugby', '🏉']];
  const ICO = Object.fromEntries(SP.map(([k, , i]) => [k, i])), NAME = Object.fromEntries(SP.map(([k, n]) => [k, n]));
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const LS = 'kx.evstrip';
  const stripOn = () => { try { return localStorage.getItem(LS) !== 'off'; } catch { return true; } };
  const setStrip = (on) => { try { on ? localStorage.removeItem(LS) : localStorage.setItem(LS, 'off'); } catch {} };

  /* ---------- dati ---------- */
  const E = { list: null, t: 0, busy: null, err: '', chans: null, chT: 0, chBusy: null, epg: {}, sport: '', open: new Set() };
  function load(force) {
    if (!can()) return Promise.resolve(null);
    if (E.busy) return E.busy;
    if (!force && E.list && Date.now() - E.t < 55e3) return Promise.resolve(E.list);
    E.busy = (async () => {
      try { const r = await api('GET', '/admin/events'); E.list = Array.isArray(r.events) ? r.events : []; E.err = ''; }
      catch (e) { E.err = (e && e.message) || 'non disponibili'; if (!E.list) E.list = []; }
      E.t = Date.now(); E.busy = null; paintStrip(); paintPage(); return E.list;
    })();
    return E.busy;
  }
  function chans() {
    if (E.chBusy) return E.chBusy;
    if (E.chans && Date.now() - E.chT < 30 * 60e3) return Promise.resolve(E.chans);
    E.chBusy = (async () => { try { const r = await api('GET', '/admin/events/chans'); E.chans = r.chans || []; } catch { E.chans = E.chans || []; } E.chT = Date.now(); E.chBusy = null; paintPage(); return E.chans; })();
    return E.chBusy;
  }

  /* ---------- testi ---------- */
  const hm = (t) => new Date(t).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  function whenOf(e) {
    const d = new Date(e.start), n = new Date(), dd = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((dd(d) - dd(n)) / 864e5);
    return { h: hm(d), day: diff === 0 ? 'oggi' : diff === 1 ? 'domani' : diff === -1 ? 'ieri' : d.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' }) };
  }
  const score = (e) => (e.home && e.away && e.home.score != null && e.away.score != null && e.home.score !== '' ? `${e.home.score} - ${e.away.score}` : '');
  const titleOf = (e) => (e.home && e.away ? `${e.home.name} – ${e.away.name}` : e.title || e.gp || e.league);
  const kindOf = (e) => (e.sport === 'calcio' ? e.league : [NAME[e.sport] || e.league, e.sport !== 'calcio' && e.league && e.league !== NAME[e.sport] ? e.league : ''].filter(Boolean).join(' · '));

  /* ---------- canali della lista che la trasmettono (come «Dove vederla» della Pro) ---------- */
  const qual = (n) => (/\b(4k|uhd)\b/i.test(n) ? 0 : /\bfhd\b/i.test(n) ? 1 : /\bhd\b/i.test(n) ? 2 : 3);
  const kw = (k) => (k.length < 4 ? ((re) => (s) => re.test(s))(new RegExp('(^|[^a-z0-9])' + k.replace(/[^a-z0-9 ]/g, '') + '($|[^a-z0-9])')) : (s) => s.includes(k));
  // canali dedicati a un altro sport (es. «Sky Sport MotoGP» per una partita di Serie A): si scartano
  const ONLY = { motogp: /motogp/, f1: /(^| )f1( |$)|formula 1/, tennis: /tennis/, basket: /(^| )nba( |$)|basket/, golf: /golf/, nfl: /(^| )nfl( |$)/, ufc: /(^| )ufc( |$)/, rugby: /rugby/ };
  function chansFor(e) {
    if (!E.chans || !E.chans.length) return [];
    const keys = [...new Set([...(e.tv || []).map(norm), norm(e.sport === 'calcio' ? e.league : NAME[e.sport] || ''), e.sport === 'motogp' ? 'motogp' : '', e.sport === 'f1' ? 'formula 1' : ''])].filter((k) => k && k.length > 2), hits = keys.map(kw);
    const other = Object.entries(ONLY).filter(([k]) => k !== e.sport).map(([, re]) => re);
    return E.chans.filter((c) => { const n = norm(c.name) + ' ' + norm(c.group), nm = norm(c.name); return hits.some((f) => f(n)) && !other.some((re) => re.test(nm)); }).sort((a, b) => qual(a.name) - qual(b.name)).slice(0, 6);
  }
  /** parole dell'evento da cercare nella guida TV: squadre, cognomi, Gran Premio */
  function words(e) {
    const toks = (s) => norm(s).split(' ').filter((w) => w.length >= 4 && !/^(calcio|club|city|united|real|sport|team|rugby|basket|gran|premio|grand|prix)$/.test(w));
    if (!e.home) return [...new Set([...toks(e.gp || e.title), ...(e.sport === 'f1' ? ['formula 1'] : e.sport === 'motogp' ? ['motogp'] : [])])];
    return [...new Set([...toks(e.home.name), ...toks(e.away.name)])];
  }
  async function epgFor(i) {
    const e = (E.view || [])[i]; if (!e) return;
    const cs = chansFor(e).filter((c) => !E.epg[c.id]); if (!cs.length) return;
    try { const r = await api('GET', '/admin/events/epg?ids=' + cs.map((c) => encodeURIComponent(c.id)).join(',')); Object.assign(E.epg, r.epg || {}); } catch (er) { if (typeof toast === 'function') toast(er.message, 1); }
    paintPage();
  }
  const onAir = (c, e) => { const L = E.epg[c.id]; if (!L) return null; const t0 = Date.parse(e.start) || Date.now(), W = words(e).map(kw); const p = L.find((x) => x.end >= t0 - 30 * 60e3 && x.start <= t0 + 150 * 60e3 && W.some((f) => f(norm(x.title)))); const now = L.find((x) => x.start <= Date.now() && x.end > Date.now()); return { hit: p || null, now: now || null }; };

  /* ---------- pagina ---------- */
  const TITLE = 'Eventi ora';
  if (typeof TITLES === 'object') TITLES.events = TITLE;
  const side = $('#side');
  if (side && !$('.nav[data-v="events"]')) {
    const b = document.createElement('button'); b.className = 'nav'; b.dataset.v = 'events'; b.textContent = TITLE; b.onclick = () => view('events');
    side.appendChild(b);
    const sec = document.createElement('section'); sec.className = 'view'; sec.id = 'v-events'; ($('#v-dash') || $('main section.view')).after(sec);
  }
  function card(e, i) {
    const w = whenOf(e), sc = score(e), cs = chansFor(e), ok = E.open.has(i);
    const tm = e.live ? `<b>● ${esc(e.clock || 'LIVE')}</b><small>in diretta</small>` : e.state === 'post' ? `<b>${esc(w.h)}</b><small>finita</small>` : `<b>${esc(w.h)}</b><small>${esc(w.day)}</small>`;
    const mid = e.home && e.away
      ? `<div class="ev-teams">${e.home.logo ? `<img src="${esc(e.home.logo)}" alt="" loading="lazy">` : ''}<span>${esc(e.home.name)}</span>${sc ? `<span class="ev-sc">${esc(sc)}</span>` : '<span class="ev-sub">vs</span>'}<span>${esc(e.away.name)}</span>${e.away.logo ? `<img src="${esc(e.away.logo)}" alt="" loading="lazy">` : ''}</div>`
      : `<div class="ev-teams"><span>${esc(e.gp || e.title || e.league)}</span>${e.session ? `<span class="ev-sc">${esc(e.session)}</span>` : ''}</div>`;
    const sub = [e.round && e.round !== e.session ? e.round : '', e.venue].filter(Boolean).join(' · ');
    const top = Array.isArray(e.top) && e.top.length ? `<div class="ev-sub">🏁 ${e.top.map((p, k) => `${k + 1}. ${esc(p.name)}`).join(' · ')}</div>` : '';
    const tv = (e.tv || []).length ? `<div class="ev-tv">📺 Di solito su ${e.tv.map((x) => `<span class="ev-b">${esc(x)}</span>`).join('')}</div>` : '';
    const lst = E.chans === null ? '' : cs.length ? `<div class="ev-ch">📡 Sulla tua lista: ${cs.map((c) => { const a = ok ? onAir(c, e) : null; return `<span class="ev-c${a && a.hit ? ' ok' : ''}" title="${esc(c.group)}">${a && a.hit ? '✓ ' : ''}${esc(c.name)}${a && (a.hit || a.now) ? `<small>${esc((a.hit || a.now).title)}</small>` : ''}</span>`; }).join('')}<button type="button" class="btn sm" data-evg="${i}">${ok ? '↻ Guida TV' : '🔍 Guida TV'}</button></div>` : '<div class="ev-ch ev-sub">📡 Nessun canale della tua lista con questo nome</div>';
    return `<div class="ev-it${e.live ? ' live' : ''}" data-evi="${i}"><div class="ev-tm">${tm}</div><div><div class="ev-lg">${ICO[e.sport] || '🏟️'} ${esc(kindOf(e))}</div>${mid}${sub ? `<div class="ev-sub">${esc(sub)}</div>` : ''}${top}${tv}${lst}</div></div>`;
  }
  function paintPage() {
    const V = $('#v-events'); if (!V || !V.classList.contains('on')) return;
    if (!can()) { V.innerHTML = '<div class="card glass"><p class="mut">«Eventi ora» non è attivo per te: chiedilo al titolare.</p></div>'; return; }
    const L = E.list || [], by = {}; for (const e of L) by[e.sport] = (by[e.sport] || 0) + 1;
    const vis = E.view = L.filter((e) => !E.sport || e.sport === E.sport);
    const live = vis.filter((e) => e.live), next = vis.filter((e) => !e.live && e.state !== 'post'), post = vis.filter((e) => e.state === 'post' && !e.live);
    const idx = (e) => vis.indexOf(e);
    const sec = (t, a) => (a.length ? `<h4 class="ev-h">${t} · ${a.length}</h4>${a.map((e) => card(e, idx(e))).join('')}` : '');
    const scrollY = window.scrollY;
    V.innerHTML = `<div class="card glass"><div class="hd"><h3>⚽ ${TITLE}<small>Le stesse partite e gare della app Pro, con risultato e minuto in diretta. «Di solito su»: le emittenti italiane; «Sulla tua lista»: i canali della tua lista con quel nome (🔍 Guida TV controlla cosa va in onda)</small></h3>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><label class="ev-sub" style="display:flex;gap:6px;align-items:center;cursor:pointer"><input type="checkbox" id="evStripOn"${stripOn() ? ' checked' : ''}> Striscia in alto</label><button type="button" class="btn sm" id="evRe">↻ Aggiorna</button></div></div>
      <div class="ev-tabs">${[['', 'Tutti', '🏟️'], ...SP].filter(([k]) => !k || by[k]).map(([k, n, ic]) => `<button type="button" data-evs="${k}" class="${E.sport === k ? 'on' : ''}">${ic} ${n}<em>${k ? by[k] : L.length}</em></button>`).join('')}</div>
      ${E.list === null ? '<p class="ev-empty">Carico gli eventi…</p>' : !vis.length ? `<p class="ev-empty">${E.err ? 'Eventi non disponibili adesso: ' + esc(E.err) : 'Nessun evento in diretta o nelle prossime ore.'}</p>` : sec('🔴 In diretta', live) + sec('Più tardi', next) + sec('Finiti da poco', post)}
      <p class="ev-sub" style="margin-top:10px">Aggiornati alle ${E.t ? esc(hm(E.t)) : '—'} · si aggiornano da soli ogni minuto.</p></div>`;
    window.scrollTo(0, scrollY);
  }
  document.addEventListener('click', (e) => {
    const V = $('#v-events'); if (!V || !V.contains(e.target)) return;
    const t = e.target.closest('[data-evs],[data-evg],#evRe'); if (!t) return;
    if (t.id === 'evRe') return load(true);
    if (t.dataset.evs !== undefined) { E.sport = t.dataset.evs; E.open.clear(); return paintPage(); }
    if (t.dataset.evg !== undefined) { const i = +t.dataset.evg; E.open.add(i); const e2 = (E.view || [])[i]; if (e2) for (const c of chansFor(e2)) delete E.epg[c.id]; epgFor(i); }
  });
  document.addEventListener('change', (e) => { if (e.target && e.target.id === 'evStripOn') { setStrip(e.target.checked); paintStrip(); } });
  const v0 = window.view;
  if (typeof v0 === 'function') window.view = view = function (v) { const r = v0.apply(this, arguments); if (v === 'events') { paintPage(); load(); chans(); } return r; };

  /* ---------- striscia che scorre ---------- */
  const strip = document.createElement('div'); strip.id = 'evStrip'; strip.hidden = true;
  strip.innerHTML = '<span class="es-lab" title="Apri «Eventi ora»">⚽ Eventi</span><div class="es-scr" id="evScr"><div class="es-run" id="evRun"></div></div><button type="button" class="es-x" title="Nascondi la striscia (si riaccende da «Eventi ora»)">✕</button>';
  const place = () => { const tb = $('main .topbar'); if (tb && tb.nextElementSibling !== strip) tb.after(strip); };
  place();
  const scr = strip.querySelector('.es-scr'), run = strip.querySelector('.es-run');
  const itemOf = (e) => {
    const w = whenOf(e), sc = score(e), tv = (e.tv || [])[0];
    const head = e.live ? `<span class="es-live">● ${esc(e.clock || 'LIVE')}</span>` : `<span class="es-tm">${esc(w.day === 'oggi' ? w.h : w.day + ' ' + w.h)}</span>`;
    const what = e.home && e.away ? `${esc(e.home.name)} ${sc ? `<span class="es-sc">${esc(sc)}</span>` : '–'} ${esc(e.away.name)}` : `${esc(e.session || '')}${e.session ? ' · ' : ''}${esc(e.gp || e.title || e.league)}`;
    return `<span class="es-it" data-esi="1">${ICO[e.sport] || '🏟️'} ${head} ${what}${tv ? ` <span class="es-tv">· ${esc(tv)}</span>` : ''}</span>`;
  };
  let sig = '';
  function paintStrip() {
    place();
    const L = (E.list || []).filter((e) => e.live || (e.state !== 'post' && Date.parse(e.start) - Date.now() < 12 * 3600e3)).slice(0, 30);
    const show = can() && stripOn() && L.length > 0;
    strip.hidden = !show; if (!show) return;
    const html = L.map(itemOf).join('');
    if (html === sig) return; sig = html;
    // contenuto doppio: quando la prima metà è passata si torna indietro di mezza striscia e non si vede il salto
    run.innerHTML = html + html;
  }
  strip.addEventListener('click', (e) => {
    if (e.target.closest('.es-x')) { setStrip(false); paintStrip(); if (typeof toast === 'function') toast('Striscia nascosta: la riaccendi da «Eventi ora»'); return; }
    if (e.target.closest('.es-it,.es-lab') && !drag.moved) view('events');
  });
  // scorrimento automatico; la rotellina e il dito lo spostano a mano (pausa e poi riparte)
  const RM = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let pauseTo = 0, hover = false, last = 0;
  const pause = (ms) => { pauseTo = Math.max(pauseTo, Date.now() + ms); };
  scr.addEventListener('mouseenter', () => { hover = true; });
  scr.addEventListener('mouseleave', () => { hover = false; pause(800); });
  scr.addEventListener('wheel', (e) => { const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY; if (!d) return; e.preventDefault(); scr.scrollLeft += d; wrap(); pause(2500); }, { passive: false });
  scr.addEventListener('touchstart', () => pause(4000), { passive: true });
  scr.addEventListener('touchmove', () => pause(3000), { passive: true });
  // trascinare col mouse (PC) come col dito
  const drag = { on: false, x: 0, s: 0, moved: false };
  scr.addEventListener('mousedown', (e) => { drag.on = true; drag.moved = false; drag.x = e.clientX; drag.s = scr.scrollLeft; scr.style.cursor = 'grabbing'; });
  addEventListener('mousemove', (e) => { if (!drag.on) return; const dx = e.clientX - drag.x; if (Math.abs(dx) > 4) drag.moved = true; scr.scrollLeft = drag.s - dx; wrap(); pause(2500); });
  addEventListener('mouseup', () => { if (!drag.on) return; drag.on = false; scr.style.cursor = ''; setTimeout(() => { drag.moved = false; }, 0); });
  function wrap() { const half = run.scrollWidth / 2; if (half <= scr.clientWidth) return; if (scr.scrollLeft >= half) scr.scrollLeft -= half; else if (scr.scrollLeft <= 0 && pauseTo > Date.now()) scr.scrollLeft += half; }
  let acc = 0;
  function tick(t) {
    const dt = last ? Math.min(100, t - last) : 16; last = t;
    if (!strip.hidden && !RM && !hover && !drag.on && Date.now() > pauseTo && document.visibilityState === 'visible') {
      const half = run.scrollWidth / 2;
      if (half > scr.clientWidth) { acc += dt * 0.045; const step = Math.floor(acc); if (step) { acc -= step; scr.scrollLeft += step; if (scr.scrollLeft >= half) scr.scrollLeft -= half; } }
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  // aggiornamento: ogni minuto, solo con la scheda del browser in primo piano
  setInterval(() => { if (document.visibilityState === 'visible' && can()) load(); else paintStrip(); }, 60e3);
  let tries = 0; const first = setInterval(() => { if (can()) { clearInterval(first); load(); } else if (++tries > 60) clearInterval(first); }, 1000);
  window.KXEvents = { load, can, strip: paintStrip, list: () => E.list || [] };
})();
