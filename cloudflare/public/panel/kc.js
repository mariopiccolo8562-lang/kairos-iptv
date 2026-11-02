/* KAIROS Control 1.8 — pagine: Online ora, Segnalazioni, Richieste contenuti, Videoteca, Server DNS e VPN.
   Usa le funzioni di app.js ($, $$, esc, api, toast, ask, ago, D, TITLES, view, openDrawer, load). In demo usa dati di esempio. */
(() => {
  const KC = (window.KC = { vpnLocs: [], live: null, req: { report: null, content: null }, dns: null, cat: { src: '', kind: 'movies', cat: '', q: '', page: 1 } });
  Object.assign(TITLES, { live: 'Online ora', reports: 'Segnalazioni', creq: 'Richieste contenuti', vod: 'Videoteca', dns: 'Server DNS e VPN' });

  /* ---------- dati di esempio per la demo ---------- */
  const now = () => Date.now();
  const DM = {
    pres: () => {
      const devs = D.devices.filter((d) => d.status === 'active').slice(0, 6);
      const W = [['live', 'Tg1', 'Rai 1 HD'], ['movie', 'Dune - Parte Due', ''], ['series', 'Mare Fuori S4 E2', ''], ['idle', '', ''], ['live', 'Inter - Milan', 'DAZN 1 FHD'], ['idle', '', '']];
      const online = devs.map((d, i) => ({ id: d.id, name: d.name, code: d.code, status: 'active', state: W[i % 6][0], title: W[i % 6][1], ch: W[i % 6][2], prof: ['Mario', 'Giulia', 'Bimbi', '', 'Luca', ''][i % 6], ip: `93.45.${10 + i}.${20 + i * 7}`, city: ['Milano', 'Roma', 'Napoli', 'Torino', 'Bari', 'Palermo'][i % 6], country: 'IT', ver: i === 3 ? '1.6.0' : '1.8.0', ui: 'a1b2c3d4e5f6', model: d.model || 'Fire TV Stick 4K', net: ['wifi', 'eth', 'wifi', 'mobile', 'wifi', 'eth'][i % 6], rssi: [-52, 0, -71, 0, -64, 0][i % 6], speed_dl: [180, 940, 42, 18, 300, 95][i % 6], speed_ul: [35, 400, 12, 5, 60, 20][i % 6], speed_ping: [18, 6, 35, 60, 14, 22][i % 6], speed_jit: [3, 1, 12, 30, 2, 5][i % 6], speed_t: now() - i * 3600e3, res: ['1920x1080', '3840x2160', '1280x720', '', '1920x1080', ''][i % 6], fps: [50, 24, 25, 0, 50, 0][i % 6], bitrate: [6.2e6, 15e6, 2.8e6, 0, 8e6, 0][i % 6], buffers: [0, 1, 6, 0, 0, 0][i % 6], engine: 'exo', vpn: i === 1 ? 'on' : 'off', ago: i * 20e3, online: true, flags: i === 2 ? ['ip'] : [] }));
      return { online, recent: [], top: [{ kind: 'live', title: 'Inter - Milan', n: 14 }, { kind: 'movie', title: 'Dune - Parte Due', n: 9 }, { kind: 'live', title: 'Tg1', n: 7 }, { kind: 'series', title: 'Mare Fuori', n: 5 }], counts: { online: online.length, watching: online.filter((o) => o.state !== 'idle').length, idle: online.filter((o) => o.state === 'idle').length, total: D.devices.length } };
    },
    req: { report: [{ id: 1, kind: 'report', title: '', body: 'Rai 1 HD resta nero', info: 'app 1.8.0 · Fire TV · canale: Rai 1 HD', status: 'new', created: now() - 6e5, name: 'Mario Rossi', code: 'KXAB-7Q2M' }], content: [{ id: 2, kind: 'content', ctype: 'movie', title: 'Oppenheimer', body: 'versione in italiano', status: 'new', created: now() - 36e5, name: 'Giulia', code: 'KXCD-9P3L' }, { id: 3, kind: 'content', ctype: 'series', title: 'The Bear', body: '', status: 'done', created: now() - 864e5, name: 'Luca', code: 'KXEF-2K8S', note: 'Aggiunta' }] },
    locs: [{ id: 'mil1', name: 'Milano' }],
  };
  async function kapi(method, path, body) {
    if (!D.demo) return api(method, path, body);
    await new Promise((r) => setTimeout(r, 120));
    if (path === '/admin/presence') return DM.pres();
    if (path.startsWith('/admin/requests')) {
      const m = path.match(/^\/admin\/requests\/(\d+)(\/status)?/);
      const all = [...DM.req.report, ...DM.req.content];
      if (m && m[2]) { const r = all.find((x) => x.id === +m[1]); if (r) Object.assign(r, { status: body.status, note: body.note ?? r.note }); return { ok: true }; }
      if (m && method === 'DELETE') { for (const k of ['report', 'content']) DM.req[k] = DM.req[k].filter((x) => x.id !== +m[1]); return { ok: true }; }
      const kind = /kind=content/.test(path) ? 'content' : 'report';
      return { kind, items: DM.req[kind] };
    }
    if (path === '/admin/vpn-locs' && method === 'GET') return DM.locs;
    if (path === '/admin/vpn-locs' && method === 'POST') { DM.locs.push({ id: 'l' + now(), name: body.name }); return { ok: true }; }
    if (path.startsWith('/admin/vpn-locs/') && method === 'DELETE') { DM.locs = DM.locs.filter((l) => !path.endsWith(l.id)); return { ok: true }; }
    if (path === '/admin/dns') { const m = new Map(); for (const d of DEMO.devices) for (const p of d.playlists || []) { try { const h = new URL(p.type === 'xtream' ? p.host : p.url).origin; m.set(h, (m.get(h) || 0) + 1); } catch {} } return [...m].map(([host, devices]) => ({ host, devices })); }
    if (path === '/admin/devices/dns') { let n = 0; for (const d of DEMO.devices) { if (body.ids ? !body.ids.includes(d.id) : !(d.playlists || []).some((p) => { try { return new URL(p.type === 'xtream' ? p.host : p.url).origin === body.from; } catch { return false; } })) continue; n++; d.playlists = d.playlists.map((p) => { try { const h = /^https?:/.test(body.host) ? body.host : 'http://' + body.host; if (p.type === 'xtream') return { ...p, host: h }; const u = new URL(p.url); return { ...p, url: h + u.pathname + u.search }; } catch { return p; } }); } return { changed: n, host: body.host }; }
    if (path === '/admin/catalog/sources') return [{ key: 'demo0000demo0000', label: 'demo.server.tv · mario', host: 'http://demo.server.tv', devices: 3 }];
    if (path.startsWith('/admin/catalog')) {
      const kind = /kind=series/.test(path) ? 'series' : 'movies';
      const T = kind === 'series' ? ['Mare Fuori', 'The Bear', 'Gomorra', 'Suburra', 'Romulus', 'Il Trono di Spade', 'Breaking Bad', 'Dark'] : ['Dune - Parte Due', 'Oppenheimer', 'Barbie', 'C\'è ancora domani', 'Il Gladiatore II', 'Napoleon', 'Wonka', 'Inside Out 2', 'Deadpool & Wolverine', 'Io Capitano'];
      const q = (new URL('http://x' + path).searchParams.get('q') || '').toLowerCase();
      const items = T.filter((t) => t.toLowerCase().includes(q)).map((t, i) => ({ id: String(i), name: t, year: String(2018 + (i % 7)), cat: String(i % 3), catName: ['Novità', 'Azione', 'Drammatico'][i % 3], poster: '', rating: 6 + (i % 4) }));
      return { total: items.length, page: 1, pages: 1, cats: [{ id: '0', name: 'Novità', n: 4 }, { id: '1', name: 'Azione', n: 3 }, { id: '2', name: 'Drammatico', n: 3 }], items, kind };
    }
    if (path.endsWith('/linkcode')) return { pin: '482915', until: now() + 6e5 };
    return api(method, path, body);
  }
  KC.api = kapi;

  /* ---------- stile ---------- */
  const css = document.createElement('style');
  css.textContent = `
.kc-k{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:18px}
.kc-k .kpi{cursor:default}.kc-k .v{font-size:30px}
.kc-row{display:grid;grid-template-columns:minmax(170px,1.3fr) minmax(200px,1.7fr) minmax(150px,1fr) minmax(150px,1fr) minmax(120px,.8fr) auto;gap:14px;align-items:center;padding:12px 14px;border-radius:14px;border:1px solid var(--line);margin-bottom:8px;background:rgba(255,255,255,.02)}
.kc-row:hover{background:rgba(255,255,255,.045)}
.kc-row b{display:block;font-size:14px}.kc-row small{display:block;color:var(--mut);font-size:12px;line-height:1.45;word-break:break-word}
.kc-dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px;vertical-align:1px;background:var(--mut)}
.kc-dot.live{background:#ff3b3b;box-shadow:0 0 10px #ff3b3b;animation:kcb 1.4s infinite}.kc-dot.movie,.kc-dot.series{background:var(--a2);box-shadow:0 0 10px var(--a2)}.kc-dot.idle{background:var(--ok)}
@keyframes kcb{50%{opacity:.35}}
.kc-tag{display:inline-block;font-size:10px;font-weight:700;letter-spacing:.08em;padding:3px 7px;border-radius:6px;margin:2px 4px 0 0;background:rgba(255,255,255,.07);color:var(--txt)}
.kc-tag.warn{background:color-mix(in srgb,var(--warn) 18%,transparent);color:var(--warn)}.kc-tag.ok{background:color-mix(in srgb,var(--ok) 18%,transparent);color:var(--ok)}.kc-tag.bad{background:color-mix(in srgb,var(--bad) 18%,transparent);color:var(--bad)}
.kc-bars{display:inline-flex;gap:2px;align-items:flex-end;height:12px;margin-right:6px;vertical-align:-1px}.kc-bars i{width:3px;border-radius:1px;background:rgba(255,255,255,.18)}.kc-bars i.on{background:var(--ok)}
.kc-acts{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
.kc-top{display:flex;flex-direction:column;gap:6px}.kc-top div{display:flex;justify-content:space-between;gap:10px;font-size:14px;padding:8px 10px;border-radius:10px;background:rgba(255,255,255,.03)}
.kc-req{display:flex;gap:14px;align-items:flex-start;padding:14px;border-radius:14px;border:1px solid var(--line);margin-bottom:10px}
.kc-req.new{border-color:color-mix(in srgb,var(--warn) 45%,transparent);background:color-mix(in srgb,var(--warn) 6%,transparent)}
.kc-req .tx{flex:1;min-width:0}.kc-req .tx b{font-size:15px}.kc-req .tx p{margin:6px 0 0;line-height:1.5;font-size:14px}.kc-req .tx small{display:block;color:var(--mut);font-size:12px;margin-top:4px;word-break:break-word}
.kc-nb{margin-left:auto;min-width:20px;height:20px;padding:0 6px;border-radius:10px;background:var(--bad);color:#fff;font-size:11px;font-weight:800;display:none;place-items:center}
.kc-nb.on{display:inline-grid}
.kc-vgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:14px}
.kc-post{border-radius:12px;overflow:hidden;background:rgba(255,255,255,.04);border:1px solid var(--line);position:relative;aspect-ratio:2/3;display:flex;flex-direction:column;justify-content:flex-end}
.kc-post img{position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover}
.kc-post div{position:relative;padding:28px 10px 10px;background:linear-gradient(transparent,rgba(0,0,0,.9));font-size:13px;font-weight:600;line-height:1.25}
.kc-post div small{display:block;color:var(--mut);font-weight:400;font-size:11px;margin-top:3px}
.kc-post .rt{position:absolute;top:8px;right:8px;font-size:11px;font-weight:700;padding:3px 7px;border-radius:7px;background:rgba(0,0,0,.6);color:var(--warn)}
.kc-vc{display:grid;grid-template-columns:220px 1fr;gap:18px}
.kc-cats{display:flex;flex-direction:column;gap:2px;max-height:70vh;overflow:auto}
.kc-cats button{all:unset;cursor:pointer;display:flex;justify-content:space-between;gap:8px;padding:9px 12px;border-radius:10px;font-size:14px}
.kc-cats button:hover{background:rgba(255,255,255,.05)}.kc-cats button.on{background:color-mix(in srgb,var(--a1) 18%,transparent);color:#fff}
.kc-cats small{color:var(--mut)}
.kc-host{display:flex;gap:12px;align-items:center;padding:12px;border-radius:12px;border:1px solid var(--line);margin-bottom:8px;flex-wrap:wrap}
.kc-host .tx{flex:1;min-width:200px}.kc-host b{font-family:ui-monospace,monospace;font-size:14px}
.kc-devs{max-height:46vh;overflow:auto;border:1px solid var(--line);border-radius:12px;padding:6px}
.kc-devs label{display:flex;gap:10px;align-items:center;padding:8px 10px;border-radius:9px;cursor:pointer;font-size:14px}
.kc-devs label:hover{background:rgba(255,255,255,.04)}.kc-devs input{width:18px;height:18px;accent-color:var(--a1)}
.kc-devs small{color:var(--mut);font-size:12px;margin-left:auto;font-family:ui-monospace,monospace}
.perms{display:grid;grid-template-columns:1fr 1fr;gap:8px}.perms .tog{margin:0}
.kpi.go{cursor:pointer;transition:transform .15s}.kpi.go:hover{transform:translateY(-3px)}
@media (max-width:1100px){.kc-row{grid-template-columns:1fr 1fr}.kc-acts{justify-content:flex-start}.kc-k{grid-template-columns:1fr 1fr}.kc-vc{grid-template-columns:1fr}.perms{grid-template-columns:1fr}}`;
  document.head.appendChild(css);

  /* ---------- menu e pagine ---------- */
  const IC = {
    live: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="2.5"/><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M4.9 4.9a10 10 0 0 0 0 14.2M19.1 4.9a10 10 0 0 1 0 14.2"/></svg>',
    reports: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/></svg>',
    creq: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M12 9v6M9 12h6"/></svg>',
    vod: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="9" rx="1.5"/><rect x="3" y="15" width="18" height="6" rx="1.5"/></svg>',
    dns: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/></svg>',
  };
  const dash = $('.nav[data-v="dash"]');
  const navs = [['live', 'Online ora'], ['reports', 'Segnalazioni'], ['creq', 'Richieste contenuti'], ['vod', 'Videoteca'], ['dns', 'Server DNS e VPN']];
  let after = dash;
  for (const [v, l] of navs) {
    const b = document.createElement('button'); b.className = 'nav'; b.dataset.v = v;
    b.innerHTML = `${IC[v]}${l}${v === 'reports' || v === 'creq' ? `<span class="kc-nb" id="nb_${v}"></span>` : ''}`;
    after.after(b); after = b;
    const sec = document.createElement('section'); sec.className = 'view'; sec.id = 'v-' + v;
    $('#v-dash').after(sec);
    b.onclick = () => view(v);
  }
  // all'apertura di una pagina si caricano i suoi dati
  const origView = view;
  window.view = view = function (v) { origView(v); if (v === 'live') liveLoad(); if (v === 'reports') reqLoad('report'); if (v === 'creq') reqLoad('content'); if (v === 'vod') vodInit(); if (v === 'dns') dnsLoad(); };

  /* ---------- Online ora ---------- */
  const STATE_L = { live: 'In diretta', movie: 'Film', series: 'Serie TV', rec: 'Registrazione', idle: 'Nell\'app' };
  const NET_L = { wifi: 'Wi-Fi', eth: 'Ethernet', mobile: 'Rete mobile', none: 'Senza rete' };
  const bars = (rssi) => { const n = rssi >= -55 ? 4 : rssi >= -65 ? 3 : rssi >= -75 ? 2 : 1; return `<span class="kc-bars">${[4, 7, 10, 12].map((h, i) => `<i style="height:${h}px" class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`; };
  const mbps = (v) => (v >= 100 ? Math.round(v) : (+v).toFixed(1)) + ' Mbps';
  function liveRow(o) {
    const d = D.devices.find((x) => x.id === o.id);
    const what = o.state === 'idle' ? `<b><span class="kc-dot idle"></span>Nell'app</b><small>${esc(o.screen || 'naviga nei menu')}</small>` : `<b><span class="kc-dot ${esc(o.state)}"></span>${esc(o.title || o.ch || '—')}</b><small>${STATE_L[o.state] || ''}${o.ch && o.title ? ' · ' + esc(o.ch) : ''}${o.grp ? ' · ' + esc(o.grp) : ''}</small>`;
    const play = o.state !== 'idle' && (o.res || o.bitrate) ? `<small>${o.res ? esc(o.res) : ''}${o.fps ? ' · ' + Math.round(o.fps) + ' fps' : ''}${o.bitrate ? ' · ' + mbps(o.bitrate / 1e6) : ''}${o.buffers ? ` · <span style="color:var(--warn)">${o.buffers} blocchi</span>` : ''}${o.engine ? ' · ' + esc(o.engine) : ''}</small>` : '';
    const net = `<b>${o.net === 'wifi' && o.rssi ? bars(o.rssi) : ''}${NET_L[o.net] || 'Rete ?'}${o.net === 'wifi' && o.rssi ? ` <span class="mut" style="font-weight:400;font-size:12px">${o.rssi} dBm</span>` : ''}</b>${o.speed_dl ? `<small>↓ ${mbps(o.speed_dl)} · ↑ ${o.speed_ul ? mbps(o.speed_ul) : '—'} · ${Math.round(o.speed_ping)} ms${o.speed_jit ? ' (±' + Math.round(o.speed_jit) + ')' : ''}<br>speed test ${ago(o.speed_t)}</small>` : '<small>nessuno speed test</small>'}`;
    const where = `<b class="mono" style="font-size:13px">${esc(o.ip || '—')}</b><small>${esc([o.city, o.country].filter(Boolean).join(', ') || '')}</small>${(o.flags || []).includes('ip') ? '<span class="kc-tag warn" title="Due indirizzi IP diversi in pochi minuti: possibile codice condiviso">⚠ 2 IP</span>' : ''}${(o.flags || []).includes('country') ? '<span class="kc-tag warn">⚠ paese diverso</span>' : ''}`;
    const app = `<b>${esc(o.ver ? 'App ' + o.ver : 'App ?')}</b><small>${esc(o.model || '')}${o.prof ? '<br>Profilo: ' + esc(o.prof) : ''}</small>${o.vpn === 'on' ? '<span class="kc-tag ok">🛡 VPN attiva</span>' : ''}`;
    const vpnBtn = d && !d.parent && +d.vpn ? `<button class="btn sm" data-kvpn="${esc(o.id)}" title="Spegne la VPN su questo abbonamento">Spegni VPN</button>` : '';
    return `<div class="kc-row"><div><b>${esc(o.name || o.code)}</b><small><span class="mono">${esc(o.code)}</span> · ${o.online ? 'adesso' : ago(Date.now() - o.ago)}</small></div><div>${what}${play}</div><div>${net}</div><div>${where}</div><div>${app}</div><div class="kc-acts">${vpnBtn}<button class="btn sm" data-kopen="${esc(o.id)}">Scheda</button></div></div>`;
  }
  let liveT = null;
  async function liveLoad() {
    const V = $('#v-live');
    if (!KC.live) V.innerHTML = '<div class="card glass"><p class="mut">Caricamento…</p></div>';
    try { KC.live = await kapi('GET', '/admin/presence'); } catch (e) { V.innerHTML = `<div class="card glass"><p class="mut">${esc(e.message)}</p></div>`; return; }
    const P = KC.live, c = P.counts;
    V.innerHTML = `<div class="kc-k">${[['Online ora', c.online, 'app aperte negli ultimi 3 minuti', 'var(--ok)'], ['Stanno guardando', c.watching, 'canali, film e serie', 'var(--bad)'], ['Nei menu', c.idle, 'app aperta senza video', 'var(--a2)'], ['Dispositivi totali', c.total, 'registrati nel pannello', 'var(--a1)']].map(([l, v, s, col]) => `<div class="kpi glass"><div class="halo" style="background:${col}"></div><div class="lb"><i style="background:${col};box-shadow:0 0 10px ${col}"></i>${l}</div><div class="v">${v}</div><div class="s">${s}</div></div>`).join('')}</div>
      <div class="g2b" style="grid-template-columns:minmax(0,2.4fr) minmax(260px,1fr)">
        <div class="card glass"><div class="hd"><h3>Utenti collegati<small>Si aggiorna da solo ogni 15 secondi · dati inviati dalle app 1.8 o successive</small></h3><button class="btn sm" id="kLiveR">Aggiorna</button></div>
          ${P.online.length ? P.online.map(liveRow).join('') : '<p class="mut">Nessun utente collegato in questo momento.</p>'}
          ${P.recent.length ? `<div class="sd-sub" style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--mut);font-weight:600;margin:18px 0 8px">Visti nelle ultime 24 ore</div>${P.recent.slice(0, 40).map(liveRow).join('')}` : ''}
        </div>
        <div class="card glass"><div class="hd"><h3>Più visti oggi<small>Quante volte è iniziata la visione</small></h3></div>
          <div class="kc-top">${(P.top || []).map((x) => `<div><span>${x.kind === 'live' ? '📺' : x.kind === 'series' ? '🎞' : '🎬'} ${esc(x.title)}</span><b>${x.n}</b></div>`).join('') || '<p class="mut">Ancora nessun dato oggi.</p>'}</div>
          <div class="sd-note" style="font-size:13px;margin-top:14px;color:var(--mut);line-height:1.5"><b>⚠ 2 IP</b>: lo stesso codice si è collegato da due indirizzi diversi in pochi minuti (possibile condivisione). <b>Paese diverso</b>: collegamento da un paese diverso dal solito.</div>
        </div>
      </div>`;
    $('#kLiveR').onclick = liveLoad;
    $$('[data-kopen]', V).forEach((b) => (b.onclick = () => { const d = D.devices.find((x) => x.id === b.dataset.kopen); d ? openDrawer(d) : toast('Dispositivo non trovato', 1); }));
    $$('[data-kvpn]', V).forEach((b) => (b.onclick = async () => {
      if (!(await ask('Spegnere la VPN?', 'La VPN verrà disattivata su questo abbonamento: l\'app la chiude al prossimo controllo (entro qualche minuto).', 'Spegni'))) return;
      try { await api('PUT', '/admin/devices/' + b.dataset.kvpn, { vpn: 0 }); await load(); toast('VPN disattivata'); liveLoad(); } catch (e) { toast(e.message, 1); }
    }));
    clearTimeout(liveT);
    liveT = setTimeout(() => { if ($('#v-live').classList.contains('on')) liveLoad(); }, 15000);
  }

  /* ---------- Segnalazioni e Richieste contenuti ---------- */
  const RS = { new: ['Nuova', 'pending'], seen: ['Vista', 'active'], done: ['Fatta', 'active'] };
  const CT = { movie: '🎬 Film', series: '🎞 Serie TV', live: '📺 Canale', '': '' };
  async function reqLoad(kind, quiet) {
    const V = $(kind === 'report' ? '#v-reports' : '#v-creq');
    if (!quiet && !KC.req[kind]) V.innerHTML = '<div class="card glass"><p class="mut">Caricamento…</p></div>';
    try { KC.req[kind] = (await kapi('GET', '/admin/requests?kind=' + kind)).items || []; } catch (e) { if (!quiet) V.innerHTML = `<div class="card glass"><p class="mut">${esc(e.message)}</p></div>`; return; }
    badges();
    if (quiet && !V.classList.contains('on')) return;
    const list = KC.req[kind], f = KC.req[kind + 'F'] || 'open';
    const shown = list.filter((r) => (f === 'open' ? r.status !== 'done' : f === 'done' ? r.status === 'done' : true));
    const cnt = (k) => list.filter((r) => (k === 'open' ? r.status !== 'done' : k === 'done' ? r.status === 'done' : true)).length;
    V.innerHTML = `<div class="card glass"><div class="hd"><h3>${kind === 'report' ? 'Segnalazioni dei clienti<small>Problemi inviati dall\'app con «Segnala un problema»</small>' : 'Richieste di contenuti<small>Film, serie e canali che i clienti ti chiedono di aggiungere</small>'}</h3>
      <div class="filters" style="margin:0">${[['open', 'Da gestire'], ['done', 'Fatte'], ['all', 'Tutte']].map(([k, l]) => `<button class="fchip ${f === k ? 'on' : ''}" data-rf="${k}">${l}<span>${cnt(k)}</span></button>`).join('')}</div></div>
      ${shown.map((r) => `<div class="kc-req ${r.status === 'new' ? 'new' : ''}"><div class="tx">
        <b>${kind === 'content' ? `${CT[r.ctype] || ''} ${esc(r.title)}` : esc(r.title || 'Segnalazione')}</b> <span class="st ${RS[r.status] ? RS[r.status][1] : ''}"><i></i>${RS[r.status] ? RS[r.status][0] : esc(r.status)}</span>
        ${r.body ? `<p>${esc(r.body)}</p>` : ''}
        <small>${esc(r.name || 'Dispositivo')} · <span class="mono">${esc(r.code || '')}</span>${r.model ? ' · ' + esc(r.model) : ''} · ${ago(r.created)}${r.info ? '<br>' + esc(r.info) : ''}${r.note ? '<br><b>Nota:</b> ' + esc(r.note) : ''}</small></div>
        <div class="kc-acts">${r.status === 'new' ? `<button class="btn sm" data-rs="${r.id}:seen">Vista</button>` : ''}${r.status !== 'done' ? `<button class="btn sm pri" data-rs="${r.id}:done">${kind === 'content' ? 'Aggiunto' : 'Risolto'}</button>` : `<button class="btn sm" data-rs="${r.id}:new">Riapri</button>`}${r.deviceId ? `<button class="btn sm" data-ro="${esc(r.deviceId)}">Scheda</button>` : ''}<button class="icb" title="Elimina" data-rd="${r.id}">✕</button></div></div>`).join('') || `<p class="mut">${f === 'open' ? 'Niente da gestire. 👍' : 'Nessuna voce.'}</p>`}
      ${list.some((r) => r.status === 'done') ? '<button class="btn sm" id="rClr" style="margin-top:10px">Svuota le fatte</button>' : ''}</div>`;
    $$('[data-rf]', V).forEach((b) => (b.onclick = () => { KC.req[kind + 'F'] = b.dataset.rf; reqLoad(kind); }));
    $$('[data-rs]', V).forEach((b) => (b.onclick = async () => {
      const [id, status] = b.dataset.rs.split(':');
      let note;
      if (status === 'done' && kind === 'content') note = 'Aggiunto';
      try { await kapi('POST', `/admin/requests/${id}/status`, note ? { status, note } : { status }); reqLoad(kind); } catch (e) { toast(e.message, 1); }
    }));
    $$('[data-ro]', V).forEach((b) => (b.onclick = () => { const d = D.devices.find((x) => x.id === b.dataset.ro); d ? openDrawer(d) : toast('Dispositivo non trovato', 1); }));
    $$('[data-rd]', V).forEach((b) => (b.onclick = async () => { try { await kapi('DELETE', '/admin/requests/' + b.dataset.rd); reqLoad(kind); } catch (e) { toast(e.message, 1); } }));
    const rc = $('#rClr', V); if (rc) rc.onclick = async () => { try { await kapi('DELETE', `/admin/requests?kind=${kind}&status=done`); reqLoad(kind); } catch (e) { toast(e.message, 1); } };
  }
  let lastNew = null;
  function badges() {
    for (const [k, v] of [['report', 'reports'], ['content', 'creq']]) {
      const n = (KC.req[k] || []).filter((r) => r.status === 'new').length, e = $('#nb_' + v);
      if (e) { e.textContent = n; e.classList.toggle('on', n > 0); }
    }
    const tot = ['report', 'content'].reduce((a, k) => a + (KC.req[k] || []).filter((r) => r.status === 'new').length, 0);
    if (lastNew !== null && tot > lastNew) toast(`Nuove segnalazioni o richieste dai clienti (${tot})`);
    lastNew = tot;
  }
  const pollReq = () => Promise.all([reqLoad('report', true), reqLoad('content', true)]).catch(() => {});

  /* ---------- Videoteca ---------- */
  async function vodInit() {
    const V = $('#v-vod'), C = KC.cat;
    if (!KC.srcs) {
      V.innerHTML = '<div class="card glass"><p class="mut">Caricamento delle sorgenti…</p></div>';
      try { KC.srcs = await kapi('GET', '/admin/catalog/sources'); } catch (e) { V.innerHTML = `<div class="card glass"><p class="mut">${esc(e.message)}</p></div>`; return; }
      if (!C.src && KC.srcs.length) C.src = KC.srcs[0].key;
    }
    if (!KC.srcs.length) { V.innerHTML = '<div class="card glass"><p class="mut">La videoteca legge film e serie dai server Xtream assegnati ai tuoi clienti: assegna almeno una playlist Xtream per vederla qui.</p></div>'; return; }
    V.innerHTML = `<div class="card glass"><div class="hd" style="flex-wrap:wrap;gap:10px"><h3>Videoteca<small>Film e serie disponibili sul server scelto</small></h3>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><select class="inp" id="vSrc" style="width:auto;margin:0">${KC.srcs.map((s) => `<option value="${esc(s.key)}" ${s.key === C.src ? 'selected' : ''}>${esc(s.label)} (${s.devices})</option>`).join('')}</select>
      <div class="seg" id="vKind"><button data-k="movies" class="${C.kind === 'movies' ? 'on' : ''}">Film</button><button data-k="series" class="${C.kind === 'series' ? 'on' : ''}">Serie TV</button></div>
      <input class="inp" id="vQ" placeholder="Cerca un titolo…" style="width:220px;margin:0" value="${esc(C.q)}"></div></div>
      <div class="kc-vc"><div class="kc-cats" id="vCats"></div><div><div class="mut" id="vInfo" style="font-size:13px;margin-bottom:10px"></div><div class="kc-vgrid" id="vGrid"></div><div style="display:flex;gap:8px;justify-content:center;margin-top:16px" id="vPg"></div></div></div></div>`;
    $('#vSrc').onchange = (e) => { C.src = e.target.value; C.cat = ''; C.page = 1; vodLoad(); };
    $$('#vKind [data-k]').forEach((b) => (b.onclick = () => { C.kind = b.dataset.k; C.cat = ''; C.page = 1; $$('#vKind button').forEach((x) => x.classList.toggle('on', x === b)); vodLoad(); }));
    let qt; $('#vQ').oninput = (e) => { clearTimeout(qt); qt = setTimeout(() => { C.q = e.target.value.trim(); C.page = 1; vodLoad(); }, 350); };
    vodLoad();
  }
  async function vodLoad() {
    const C = KC.cat;
    $('#vInfo').textContent = 'Caricamento… (la prima volta il server può impiegare qualche secondo)';
    let r;
    try { r = await kapi('GET', `/admin/catalog?src=${encodeURIComponent(C.src)}&kind=${C.kind}&cat=${encodeURIComponent(C.cat)}&q=${encodeURIComponent(C.q)}&page=${C.page}`); } catch (e) { $('#vInfo').textContent = e.message; $('#vGrid').innerHTML = ''; return; }
    if (r.error) { $('#vInfo').textContent = r.error; return; }
    $('#vCats').innerHTML = `<button class="${!C.cat ? 'on' : ''}" data-c="">Tutte<small>${r.cats.reduce((a, c) => a + c.n, 0)}</small></button>` + r.cats.map((c) => `<button class="${C.cat === c.id ? 'on' : ''}" data-c="${esc(c.id)}">${esc(c.name)}<small>${c.n}</small></button>`).join('');
    $$('#vCats [data-c]').forEach((b) => (b.onclick = () => { C.cat = b.dataset.c; C.page = 1; vodLoad(); }));
    $('#vInfo').textContent = `${r.total.toLocaleString('it-IT')} ${C.kind === 'series' ? 'serie' : 'film'}${C.q ? ' per «' + C.q + '»' : ''} · pagina ${r.page} di ${r.pages}`;
    $('#vGrid').innerHTML = r.items.map((x) => `<div class="kc-post">${x.poster ? `<img loading="lazy" src="${esc(x.poster)}" onerror="this.remove()" referrerpolicy="no-referrer">` : ''}${x.rating ? `<span class="rt">★ ${(+x.rating).toFixed(1)}</span>` : ''}<div>${esc(x.name)}<small>${esc([x.year, x.catName].filter(Boolean).join(' · '))}</small></div></div>`).join('') || '<p class="mut">Nessun titolo.</p>';
    $('#vPg').innerHTML = r.pages > 1 ? `<button class="btn sm" data-p="${r.page - 1}" ${r.page <= 1 ? 'disabled' : ''}>‹ Indietro</button><button class="btn sm" data-p="${r.page + 1}" ${r.page >= r.pages ? 'disabled' : ''}>Avanti ›</button>` : '';
    $$('#vPg [data-p]').forEach((b) => (b.onclick = () => { C.page = +b.dataset.p; vodLoad(); $('#v-vod').scrollIntoView({ behavior: 'smooth' }); }));
  }

  /* ---------- Server DNS e VPN ---------- */
  const hostsOf = (d) => [...new Set((d.playlists || []).map((p) => { try { return new URL(p.type === 'xtream' ? p.host : p.url).origin; } catch { return ''; } }).filter(Boolean))];
  async function dnsLoad() {
    const V = $('#v-dns');
    let hosts = [];
    try { [hosts, KC.vpnLocs] = await Promise.all([kapi('GET', '/admin/dns'), kapi('GET', '/admin/vpn-locs')]); } catch (e) { V.innerHTML = `<div class="card glass"><p class="mut">${esc(e.message)}</p></div>`; return; }
    const devs = D.devices.filter((d) => !d.parent && (d.playlists || []).length);
    const sel = (KC.dnsSel = KC.dnsSel || new Set());
    const flt = KC.dnsF || '';
    V.innerHTML = `<div class="g2b" style="grid-template-columns:minmax(0,1.3fr) minmax(300px,1fr)">
      <div class="card glass"><div class="hd"><h3>Server delle playlist (DNS)<small>Cambia il server di tutti o di un gruppo di clienti senza riscrivere le playlist: si sostituisce solo l'indirizzo del server, utente e password restano uguali</small></h3></div>
        ${hosts.map((h) => `<div class="kc-host"><div class="tx"><b>${esc(h.host)}</b><small class="mut" style="display:block">${h.devices} ${h.devices === 1 ? 'cliente' : 'clienti'}</small></div><button class="btn sm" data-hsel="${esc(h.host)}">Seleziona i clienti</button><button class="btn sm pri" data-hall="${esc(h.host)}">Cambia per tutti</button></div>`).join('') || '<p class="mut">Nessuna playlist assegnata.</p>'}
        <label class="lbl" style="margin-top:18px">Clienti selezionati <span class="cnt" id="dnsCnt">${sel.size}</span></label>
        <div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap"><input class="inp" id="dnsQ" placeholder="Filtra per nome, codice o server" style="flex:1;min-width:180px;margin:0" value="${esc(flt)}"><button class="btn sm" id="dnsAll">Seleziona visibili</button><button class="btn sm" id="dnsNone">Deseleziona</button></div>
        <div class="kc-devs" id="dnsDevs"></div>
        <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><input class="inp" id="dnsNew" placeholder="Nuovo server, es. http://nuovo.server.tv:8080" style="flex:1;min-width:220px;margin:0"><button class="btn pri" id="dnsGo">Cambia DNS ai selezionati</button></div>
        <small class="mut" style="display:block;margin-top:8px;font-size:12px">Le app dei clienti si aggiornano da sole al prossimo controllo (entro 20 minuti, o subito al riavvio) senza riscaricare la lista.</small>
      </div>
      <div class="card glass"><div class="hd"><h3>Località VPN<small>Più server WireGuard: nella scheda del cliente scegli quale usare. Nell'app il cliente non vede le località</small></h3></div>
        ${KC.vpnLocs.map((l) => `<div class="kc-host"><div class="tx"><b style="font-family:inherit">🛡 ${esc(l.name)}</b><small class="mut" style="display:block">${D.devices.filter((d) => d.vpnLoc === l.id).length} clienti</small></div><button class="icb" title="Elimina" data-ldel="${esc(l.id)}">✕</button></div>`).join('') || '<p class="mut">Nessuna località: si usa la configurazione generale (Impostazioni) o quella del singolo dispositivo.</p>'}
        <label class="lbl">Nuova località</label><input class="inp" id="locN" placeholder="Nome, es. Milano">
        <textarea class="inp mono" id="locC" rows="6" spellcheck="false" autocomplete="off" placeholder="[Interface]&#10;PrivateKey = …&#10;Address = …&#10;&#10;[Peer]&#10;PublicKey = …&#10;Endpoint = …"></textarea>
        <button class="btn pri" id="locAdd">Aggiungi località</button>
        <div class="sd-note" style="font-size:13px;margin-top:12px;color:var(--mut);line-height:1.5">La configurazione viene salvata cifrata e non viene più mostrata. Usa una chiave diversa per ogni cliente se il tuo server lo richiede: la stessa chiave su due TV accese insieme fa cadere la connessione.</div>
      </div></div>`;
    const drawDevs = () => {
      const q = (KC.dnsF || '').toLowerCase();
      const list = devs.filter((d) => !q || [d.name, d.code, ...hostsOf(d)].join(' ').toLowerCase().includes(q));
      $('#dnsDevs').innerHTML = list.map((d) => `<label><input type="checkbox" data-did="${esc(d.id)}" ${sel.has(d.id) ? 'checked' : ''}><span><b style="font-size:14px">${esc(d.name || d.code)}</b> <span class="mut mono" style="font-size:12px">${esc(d.code)}</span></span><small>${esc(hostsOf(d).join(', '))}</small></label>`).join('') || '<p class="mut" style="padding:10px">Nessun cliente.</p>';
      $$('#dnsDevs [data-did]').forEach((c) => (c.onchange = () => { c.checked ? sel.add(c.dataset.did) : sel.delete(c.dataset.did); $('#dnsCnt').textContent = sel.size; }));
      KC.dnsVisible = list;
    };
    drawDevs();
    $('#dnsQ').oninput = (e) => { KC.dnsF = e.target.value; drawDevs(); };
    $('#dnsAll').onclick = () => { for (const d of KC.dnsVisible || []) sel.add(d.id); drawDevs(); $('#dnsCnt').textContent = sel.size; };
    $('#dnsNone').onclick = () => { sel.clear(); drawDevs(); $('#dnsCnt').textContent = 0; };
    $$('[data-hsel]', V).forEach((b) => (b.onclick = () => { for (const d of devs) if (hostsOf(d).includes(b.dataset.hsel)) sel.add(d.id); KC.dnsF = b.dataset.hsel; $('#dnsQ').value = KC.dnsF; drawDevs(); $('#dnsCnt').textContent = sel.size; }));
    $$('[data-hall]', V).forEach((b) => (b.onclick = async () => {
      const from = b.dataset.hall;
      const to = prompt(`Nuovo server al posto di ${from} per TUTTI i suoi clienti:`, from);
      if (!to || to.trim() === from) return;
      try { const r = await kapi('POST', '/admin/devices/dns', { from, host: to.trim() }); toast(`Server cambiato su ${r.changed} clienti`); await load(); dnsLoad(); } catch (e) { toast(e.message, 1); }
    }));
    $('#dnsGo').onclick = async () => {
      const host = $('#dnsNew').value.trim();
      if (!sel.size) return toast('Seleziona almeno un cliente', 1);
      if (!host) return toast('Scrivi il nuovo server', 1);
      if (!(await ask('Cambiare il server?', `Il server delle playlist di <b>${sel.size}</b> clienti diventa <b class="mono">${esc(host)}</b>. Utente e password non cambiano.`, 'Cambia'))) return;
      try { const r = await kapi('POST', '/admin/devices/dns', { ids: [...sel], host }); toast(`Server cambiato su ${r.changed} clienti`); sel.clear(); await load(); dnsLoad(); } catch (e) { toast(e.message, 1); }
    };
    $('#locAdd').onclick = async () => {
      try { await kapi('POST', '/admin/vpn-locs', { name: $('#locN').value, conf: $('#locC').value }); toast('Località aggiunta'); dnsLoad(); } catch (e) { toast(e.message, 1); }
    };
    $$('[data-ldel]', V).forEach((b) => (b.onclick = async () => {
      if (!(await ask('Eliminare la località?', 'I clienti che la usano torneranno alla configurazione generale.', 'Elimina'))) return;
      try { await kapi('DELETE', '/admin/vpn-locs/' + b.dataset.ldel); await load(); dnsLoad(); } catch (e) { toast(e.message, 1); }
    }));
  }

  /* ---------- Dashboard: i riquadri aprono la pagina giusta ---------- */
  const origDash = window.renderDash;
  const linkDash = () => {
    const go = [() => { D.filter = 'active'; view('devices'); renderDevices(); }, () => { D.filter = 'pending'; view('devices'); renderDevices(); }, () => { D.filter = 'soon'; view('devices'); renderDevices(); }, () => view('live')];
    $$('#kpis .kpi').forEach((k, i) => { if (go[i]) { k.classList.add('go'); k.title = 'Apri'; k.onclick = go[i]; } });
    const h = (id, f) => { const c = $(id); const hd = c && c.closest('.card') && c.closest('.card').querySelector('.hd h3'); if (hd) { hd.style.cursor = 'pointer'; hd.onclick = f; } };
    h('#pendList', go[1]); h('#expList', go[2]);
  };
  if (typeof origDash === 'function') window.renderDash = renderDash = function () { origDash(); linkDash(); };
  linkDash();

  /* ---------- avvio: località VPN (per la scheda) e avvisi delle richieste ---------- */
  const boot = async () => {
    try { KC.vpnLocs = await kapi('GET', '/admin/vpn-locs'); } catch {}
    pollReq();
  };
  const t0 = setInterval(() => { if ($('#app') && $('#app').classList.contains('on') && D.devices) { clearInterval(t0); boot(); setInterval(pollReq, 30000); } }, 500);
})();
