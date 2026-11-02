/* KAIROS Control 1.9 — pagine: Online ora, Segnalazioni, Richieste contenuti, Videoteca, Server DNS e VPN.
   Usa le funzioni di app.js ($, $$, esc, api, toast, ask, ago, D, TITLES, view, openDrawer, load). In demo usa dati di esempio. */
(() => {
  const KC = (window.KC = { vpnLocs: [], live: null, req: { report: null, content: null }, dns: null, cat: { src: '', kind: 'movies', cat: '', q: '', page: 1 } });
  Object.assign(TITLES, { live: 'Online ora', reports: 'Segnalazioni', creq: 'Richieste contenuti', vod: 'Videoteca', dns: 'Server DNS e VPN', api: 'API e integrazioni' });

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
    keys: [{ id: 'k1', name: 'Gestionale', prefix: 'kx_Q7pT2a', scope: 'full', created: now() - 9 * 864e5, last_used: now() - 36e5, last_ip: '93.45.10.20', uses: 1240 }],
    wh: { url: '', events: ['device.new', 'device.activated', 'report.new', 'request.new'], hasSecret: false, last: null },
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
    if (path.startsWith('/admin/dns') || path === '/admin/devices/dns') return demoDns(method, path, body);
    if (path === '/admin/api-keys' && method === 'GET') return DM.keys;
    if (path === '/admin/api-keys' && method === 'POST') { const key = 'kx_' + Array.from({ length: 40 }, () => 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 56)]).join(''); const it = { id: 'k' + now(), name: body.name || 'Integrazione', prefix: key.slice(0, 9), scope: body.scope === 'read' ? 'read' : 'full', created: now(), last_used: 0, uses: 0 }; DM.keys.unshift(it); return { ...it, key }; }
    if (path.startsWith('/admin/api-keys/') && method === 'DELETE') { DM.keys = DM.keys.filter((k) => !path.endsWith(k.id)); return { ok: true }; }
    if (path === '/admin/webhook' && method === 'GET') return { ...DM.wh, all: ['device.new', 'device.activated', 'report.new', 'request.new'] };
    if (path === '/admin/webhook' && method === 'PUT') { if (body.url && !/^https:\/\//.test(body.url)) throw new Error('Indirizzo del webhook non valido: serve https:// verso un server pubblico'); const first = !DM.wh.hasSecret && body.url; Object.assign(DM.wh, { url: body.url, events: body.events, hasSecret: !!body.url }); return { ok: true, secret: first || body.newSecret ? 'demo_' + now().toString(36) + 'segreto' : '' }; }
    if (path === '/admin/webhook/test') { DM.wh.last = { t: now(), event: 'test', status: 200 }; return { ok: true, status: 200 }; }
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
  /* DNS in demo: stessa logica del server */
  const originOf = (p) => { try { return new URL(p.type === 'xtream' ? p.host : p.url).origin; } catch { return ''; } };
  const cleanH = (h) => { h = String(h || '').trim().replace(/\/+$/, ''); if (!h) throw new Error('Scrivi il nuovo server, es. http://nuovo.server.tv:8080'); if (!/^https?:\/\//i.test(h)) h = 'http://' + h; let u; try { u = new URL(h); } catch { throw new Error('Indirizzo del server non valido'); } if (u.pathname !== '/' || u.search || u.username) throw new Error('Indica solo schema e host, es. http://nuovo.server.tv:8080 (senza percorsi)'); return u.origin; };
  function demoDns(method, path, body) {
    DM.dnsl = DM.dnsl || [{ id: 'dnsA', name: 'DNS principale', host: 'http://demo.server.tv' }, { id: 'dnsB', name: 'DNS di riserva', host: 'http://backup.server.tv:8080' }];
    const devs = DEMO.devices.filter((d) => !d.parent && (d.playlists || []).length);
    if (path === '/admin/dns') {
      const count = new Map(), byDev = {};
      for (const d of devs) { const hs = [...new Set(d.playlists.map(originOf).filter(Boolean))]; byDev[d.id] = hs; hs.forEach((h) => count.set(h, (count.get(h) || 0) + 1)); }
      const names = new Map(DM.dnsl.map((x) => [x.host, x]));
      const hosts = [...new Set([...count.keys(), ...DM.dnsl.map((x) => x.host)])].map((host) => ({ host, devices: count.get(host) || 0, name: names.get(host) ? names.get(host).name : '', savedId: names.get(host) ? names.get(host).id : '' })).sort((a, b) => b.devices - a.devices);
      return { saved: DM.dnsl.map((x) => ({ ...x, devices: count.get(x.host) || 0 })), hosts, byDev };
    }
    if (path === '/admin/dns/saved' && method === 'POST') { const host = cleanH(body.host); if (DM.dnsl.some((x) => x.host === host)) throw new Error('Questo DNS è già salvato'); const it = { id: 'd' + now(), name: (body.name || '').trim() || new URL(host).hostname, host }; DM.dnsl.push(it); return it; }
    const m = path.match(/^\/admin\/dns\/saved\/(.+)$/);
    if (m) { const i = DM.dnsl.findIndex((x) => x.id === m[1]); if (i < 0) throw new Error('DNS non trovato'); if (method === 'DELETE') { DM.dnsl.splice(i, 1); return { ok: true }; } if (body.name) DM.dnsl[i].name = body.name; if (body.host) DM.dnsl[i].host = cleanH(body.host); return DM.dnsl[i]; }
    if (path === '/admin/devices/dns') {
      const host = cleanH(body.host), from = body.from ? cleanH(body.from) : '';
      if (from && from === host) throw new Error('Il nuovo server è uguale a quello attuale');
      const rows = body.ids ? devs.filter((d) => body.ids.includes(d.id)) : devs;
      const done = [];
      for (const d of rows) {
        const next = d.playlists.map((p) => { const o = originOf(p); if ((from && o !== from) || o === host) return p; if (p.type === 'xtream') return { ...p, host }; const u = new URL(p.url); return { ...p, url: host + u.pathname + u.search }; });
        if (JSON.stringify(next) === JSON.stringify(d.playlists)) continue;
        done.push(d.name || d.code); if (!body.preview) d.playlists = next;
      }
      if (body.preview) return { preview: true, changed: done.length, names: done, host, from };
      let savedMoved = ''; if (from && !body.ids) { const x = DM.dnsl.find((y) => y.host === from); if (x && !DM.dnsl.some((y) => y.host === host)) { x.host = host; savedMoved = x.name; } }
      return { changed: done.length, names: done, host, from, savedMoved };
    }
    throw new Error('Non trovato');
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
.pl .ph .pltag{flex:0 0 78px;text-transform:uppercase;text-align:center;font-weight:700;letter-spacing:.06em}
.plmode{margin:12px 0 4px;padding:14px;border-radius:14px;border:1px solid var(--line);background:rgba(255,255,255,.03)}
.plmode b{display:block;margin-bottom:10px}.plmode small{display:block;color:var(--mut);font-size:12px;line-height:1.5;margin-top:8px}
.seg.wide{display:flex}.seg.wide button{flex:1}
.kc-evs{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:6px}
.kc-evs label{display:flex;gap:10px;align-items:center;padding:8px 10px;border-radius:10px;border:1px solid var(--line);cursor:pointer;font-size:14px}.kc-evs input{width:18px;height:18px;accent-color:var(--a1)}.kc-evs small{display:block;color:var(--mut);font-size:11px}
.kc-doc{display:grid;grid-template-columns:150px 1fr;gap:10px 14px;align-items:start;margin:6px 0 16px}.kc-doc b{font-size:13px;color:var(--mut);padding-top:8px}
.kc-doc code,.kc-key{display:block;font-family:ui-monospace,monospace;font-size:13px;padding:9px 12px;border-radius:10px;background:rgba(0,0,0,.35);border:1px solid var(--line);word-break:break-all;line-height:1.6}
.kc-key{margin:10px 0;color:#fff;user-select:all}
.kc-ep{width:100%;border-collapse:collapse;margin-bottom:12px}.kc-ep td{padding:8px 10px;border-bottom:1px solid var(--line);font-size:13px;vertical-align:top}.kc-ep td.mono{white-space:nowrap}
.kc-m{display:inline-block;min-width:56px;text-align:center;font:800 11px/1 ui-monospace,monospace;padding:4px 6px;border-radius:6px;background:rgba(61,220,132,.16);color:#7ef0ab}.kc-m.post{background:rgba(63,180,255,.16);color:#8fd0ff}.kc-m.put{background:rgba(255,194,61,.16);color:#ffd37a}.kc-m.delete{background:rgba(255,74,85,.16);color:#ff8f96}
.kc-dgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:10px}
.kc-dns{display:flex;flex-direction:column;gap:10px;padding:14px;border-radius:14px;border:1px solid var(--line);background:rgba(255,255,255,.02)}
.kc-dns.saved{border-color:rgba(255,90,60,.35);background:linear-gradient(135deg,rgba(255,60,60,.08),rgba(255,255,255,.02))}
.kc-dns .tx b{display:block;font-size:15px}.kc-dns .tx .mono{display:block;font-size:13px;word-break:break-all;margin:3px 0}.kc-dns .tx small{color:var(--mut);font-size:12px}
.kc-dns .ac{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.kc-add,.kc-vpnadd{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}.kc-add .inp{flex:1;min-width:200px;margin:0}.kc-vpnadd>div{flex:1;min-width:180px}
.kc-wiz,.kc-dnsl{margin-bottom:18px}
.kc-step{display:flex;gap:14px;align-items:flex-start;padding:14px 0;border-bottom:1px solid var(--line)}
.kc-step>i{flex:none;width:30px;height:30px;border-radius:50%;display:grid;place-items:center;font-style:normal;font-weight:800;background:linear-gradient(135deg,#ff7a45,#ff2a3d);color:#fff;box-shadow:0 0 16px rgba(255,60,60,.4)}
.kc-step b{display:block;font-size:15px;margin:4px 0 10px}.kc-step select.inp{max-width:640px}.kc-step small{display:block;margin-top:6px;font-size:12px}
.kc-tools{display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap}.kc-tools .inp{flex:1;min-width:180px;margin:0}
.kc-devs small .hl{color:#fff;background:rgba(255,60,60,.25);border-radius:5px;padding:1px 6px}
.kc-sum{margin-top:14px;padding:14px;border-radius:12px;background:rgba(255,255,255,.04);border:1px dashed var(--line);font-size:14px;line-height:1.5}
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
    api: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16"/></svg>',
    dns: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/></svg>',
  };
  const dash = $('.nav[data-v="dash"]');
  const navs = [['live', 'Online ora'], ['reports', 'Segnalazioni'], ['creq', 'Richieste contenuti'], ['vod', 'Videoteca'], ['dns', 'Server DNS e VPN'], ['api', 'API e integrazioni']];
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
  window.view = view = function (v) { origView(v); if (v === 'live') liveLoad(); if (v === 'reports') reqLoad('report'); if (v === 'creq') reqLoad('content'); if (v === 'vod') vodInit(); if (v === 'dns') dnsLoad(); if (v === 'api') apiLoad(); };

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
  async function dnsLoad() {
    const V = $('#v-dns');
    let dd;
    try { [dd, KC.vpnLocs] = await Promise.all([kapi('GET', '/admin/dns'), kapi('GET', '/admin/vpn-locs')]); } catch (e) { V.innerHTML = `<div class="card glass"><p class="mut">${esc(e.message)}</p></div>`; return; }
    KC.dns = dd;
    const W = (KC.dnsW = KC.dnsW || { from: '', sel: new Set(), to: '', other: '', q: '' });
    const hosts = dd.hosts, byDev = dd.byDev || {};
    if (W.from && W.from !== '*' && !hosts.some((h) => h.host === W.from)) W.from = '';
    if (!W.from) W.from = (hosts.find((h) => h.devices) || { host: '*' }).host;
    const devs = D.devices.filter((d) => !d.parent && (byDev[d.id] || []).length);
    const label = (h) => { const x = hosts.find((y) => y.host === h); return x && x.name ? `${x.name} · ${h}` : h; };
    const nm = (x) => x.name || (x.code || '');
    V.innerHTML = `
      <div class="card glass kc-dnsl"><div class="hd"><h3>I tuoi DNS<small>Salva qui i server dei tuoi fornitori, anche se nessun cliente li usa ancora. Poi li assegni ai clienti con "Cambia DNS".</small></h3></div>
        <div class="kc-dgrid">${hosts.map((h) => `<div class="kc-dns${h.savedId ? ' saved' : ''}">
            <div class="tx"><b>${esc(h.name || (h.savedId ? '' : 'Non salvato'))}</b><span class="mono">${esc(h.host)}</span><small>${h.devices ? `${h.devices} ${h.devices === 1 ? 'cliente' : 'clienti'}` : 'nessun cliente'}</small></div>
            <div class="ac">${h.devices ? `<button class="btn sm pri" data-dfrom="${esc(h.host)}">Cambia DNS…</button>` : ''}${h.savedId ? `<button class="btn sm" data-dren="${esc(h.savedId)}">Modifica</button><button class="icb" title="Togli dall'elenco" data-ddel="${esc(h.savedId)}">✕</button>` : `<button class="btn sm" data-dsave="${esc(h.host)}">Salva</button>`}</div></div>`).join('') || '<p class="mut">Nessun DNS: aggiungine uno qui sotto.</p>'}</div>
        <div class="kc-add"><input class="inp" id="dnN" placeholder="Nome, es. DNS principale" maxlength="40"><input class="inp mono" id="dnH" placeholder="Indirizzo, es. http://server.tv:8080"><button class="btn pri" id="dnAdd">+ Aggiungi DNS</button></div>
      </div>
      <div class="card glass kc-wiz"><div class="hd"><h3>Cambia DNS ai clienti<small>Cambia solo l'indirizzo del server: <b>nome utente, password e playlist restano uguali</b>. Le app si aggiornano da sole entro un minuto, senza ricaricare la lista.</small></h3></div>
        <div class="kc-step"><i>1</i><div><b>Quale DNS vuoi sostituire?</b>
          <select class="inp" id="wFrom">${hosts.filter((h) => h.devices).map((h) => `<option value="${esc(h.host)}" ${W.from === h.host ? 'selected' : ''}>${esc(label(h.host))} — ${h.devices} ${h.devices === 1 ? 'cliente' : 'clienti'}</option>`).join('')}<option value="*" ${W.from === '*' ? 'selected' : ''}>Tutti i DNS dei clienti scelti</option></select>
          <small class="mut">Se un cliente ha più playlist su server diversi, cambia solo quella su questo DNS.</small></div></div>
        <div class="kc-step"><i>2</i><div style="flex:1;min-width:0"><b>Quali clienti? <span class="cnt" id="wCnt">0</span></b>
          <div class="kc-tools"><input class="inp" id="wQ" placeholder="Cerca nome o codice" value="${esc(W.q)}"><button class="btn sm" id="wAll">Seleziona tutti</button><button class="btn sm" id="wNone">Nessuno</button></div>
          <div class="kc-devs" id="wDevs"></div></div></div>
        <div class="kc-step"><i>3</i><div style="flex:1"><b>Nuovo DNS</b>
          <select class="inp" id="wTo"><option value="">Scegli…</option>${dd.saved.map((x) => `<option value="${esc(x.host)}" ${W.to === x.host ? 'selected' : ''}>${esc(x.name)} · ${esc(x.host)}</option>`).join('')}<option value="+" ${W.to === '+' ? 'selected' : ''}>Un altro indirizzo…</option></select>
          <input class="inp mono" id="wOther" placeholder="http://nuovo.server.tv:8080" value="${esc(W.other)}" style="display:${W.to === '+' ? 'block' : 'none'}"></div></div>
        <div class="kc-sum" id="wSum"></div>
        <button class="btn pri" id="wGo" style="width:100%;margin-top:10px">Controlla e cambia DNS</button>
      </div>
      <div class="card glass"><div class="hd"><h3>Località VPN<small>Più server WireGuard: nella scheda del cliente scegli quale usare. Nell'app il cliente non vede le località</small></h3></div>
        ${KC.vpnLocs.map((l) => `<div class="kc-host"><div class="tx"><b style="font-family:inherit">🛡 ${esc(l.name)}</b><small class="mut" style="display:block">${D.devices.filter((d) => d.vpnLoc === l.id).length} clienti</small></div><button class="icb" title="Elimina" data-ldel="${esc(l.id)}">✕</button></div>`).join('') || '<p class="mut">Nessuna località: si usa la configurazione generale (Impostazioni) o quella del singolo dispositivo.</p>'}
        <div class="kc-vpnadd"><div><label class="lbl">Nuova località</label><input class="inp" id="locN" placeholder="Nome, es. Milano"></div>
        <div style="flex:2;min-width:260px"><label class="lbl">Configurazione WireGuard</label><textarea class="inp mono" id="locC" rows="5" spellcheck="false" autocomplete="off" placeholder="[Interface]&#10;PrivateKey = …&#10;Address = …&#10;&#10;[Peer]&#10;PublicKey = …&#10;Endpoint = …"></textarea></div></div>
        <button class="btn pri" id="locAdd">Aggiungi località</button>
        <div class="sd-note" style="font-size:13px;margin-top:12px;color:var(--mut);line-height:1.5">La configurazione viene salvata cifrata e non viene più mostrata. Usa una chiave diversa per ogni cliente se il tuo server lo richiede: la stessa chiave su due TV accese insieme fa cadere la connessione.</div>
      </div>`;
    const target = () => (W.to === '+' ? W.other.trim() : W.to);
    const pool = () => devs.filter((d) => W.from === '*' || (byDev[d.id] || []).includes(W.from));
    const sum = () => {
      const n = [...W.sel].filter((id) => pool().some((d) => d.id === id)).length, to = target();
      $('#wCnt').textContent = n;
      $('#wSum').innerHTML = !n ? '<span class="mut">Scegli i clienti al punto 2.</span>' : !to ? '<span class="mut">Scegli il nuovo DNS al punto 3.</span>'
        : `Sposti <b>${n} ${n === 1 ? 'cliente' : 'clienti'}</b> da <b class="mono">${esc(W.from === '*' ? 'qualsiasi DNS' : label(W.from))}</b> a <b class="mono">${esc(to === '+' ? '' : label(to))}</b>`;
    };
    const drawDevs = () => {
      const q = W.q.toLowerCase();
      const list = pool().filter((d) => !q || [d.name, d.code, d.notes].join(' ').toLowerCase().includes(q));
      $('#wDevs').innerHTML = list.map((d) => `<label><input type="checkbox" data-did="${esc(d.id)}" ${W.sel.has(d.id) ? 'checked' : ''}><span><b style="font-size:14px">${esc(nm(d))}</b> <span class="mut mono" style="font-size:12px">${esc(d.code)}</span></span><small>${(byDev[d.id] || []).map((h) => `<span class="${h === W.from ? 'hl' : ''}">${esc(label(h))}</span>`).join(' ')}</small></label>`).join('') || '<p class="mut" style="padding:10px">Nessun cliente usa questo DNS.</p>';
      $$('#wDevs [data-did]').forEach((c) => (c.onchange = () => { c.checked ? W.sel.add(c.dataset.did) : W.sel.delete(c.dataset.did); sum(); }));
      KC.dnsVisible = list; sum();
    };
    drawDevs();
    $('#wFrom').onchange = (e) => { W.from = e.target.value; W.sel = new Set(pool().map((d) => d.id)); drawDevs(); };
    $('#wQ').oninput = (e) => { W.q = e.target.value; drawDevs(); };
    $('#wAll').onclick = () => { for (const d of KC.dnsVisible || []) W.sel.add(d.id); drawDevs(); };
    $('#wNone').onclick = () => { W.sel.clear(); drawDevs(); };
    $('#wTo').onchange = (e) => { W.to = e.target.value; $('#wOther').style.display = W.to === '+' ? 'block' : 'none'; if (W.to === '+') $('#wOther').focus(); sum(); };
    $('#wOther').oninput = (e) => { W.other = e.target.value; sum(); };
    $('#wGo').onclick = async () => {
      const ids = [...W.sel].filter((id) => pool().some((d) => d.id === id)), to = target();
      if (!ids.length) return toast('Scegli almeno un cliente (punto 2)', 1);
      if (!to || to === '+') return toast('Scegli il nuovo DNS (punto 3)', 1);
      const body = { ids, host: to, from: W.from === '*' ? '' : W.from };
      let pv; try { pv = await kapi('POST', '/admin/devices/dns', { ...body, preview: true }); } catch (e) { return toast(e.message, 1); }
      if (!pv.changed) return toast('Nessuna playlist da cambiare: i clienti scelti usano già questo DNS', 1);
      const names = pv.names.slice(0, 12).map((x) => esc(x)).join(', ') + (pv.changed > 12 ? ` e altri ${pv.changed - 12}` : '');
      if (!(await ask('Confermi il cambio DNS?', `<b>${pv.changed} ${pv.changed === 1 ? 'cliente' : 'clienti'}</b> passano a <b class="mono">${esc(pv.host)}</b>${pv.from ? ` (al posto di <span class="mono">${esc(pv.from)}</span>)` : ''}.<br><span class="mut">${names}</span><br><br>Nome utente, password e playlist non cambiano.`, 'Cambia DNS'))) return;
      try { const r = await kapi('POST', '/admin/devices/dns', body); toast(`✓ DNS cambiato su ${r.changed} ${r.changed === 1 ? 'cliente' : 'clienti'}`); W.sel.clear(); await load(); dnsLoad(); } catch (e) { toast(e.message, 1); }
    };
    $$('[data-dfrom]', V).forEach((b) => (b.onclick = () => { W.from = b.dataset.dfrom; W.sel = new Set(devs.filter((d) => (byDev[d.id] || []).includes(W.from)).map((d) => d.id)); W.q = ''; dnsLoad().then(() => $('.kc-wiz').scrollIntoView({ behavior: 'smooth', block: 'start' })); }));
    $('#dnAdd').onclick = async () => { try { await kapi('POST', '/admin/dns/saved', { name: $('#dnN').value, host: $('#dnH').value }); toast('DNS aggiunto'); dnsLoad(); } catch (e) { toast(e.message, 1); } };
    $$('[data-dsave]', V).forEach((b) => (b.onclick = async () => { const n = prompt('Nome per questo DNS:', ''); if (n === null) return; try { await kapi('POST', '/admin/dns/saved', { name: n, host: b.dataset.dsave }); toast('DNS salvato'); dnsLoad(); } catch (e) { toast(e.message, 1); } }));
    $$('[data-dren]', V).forEach((b) => (b.onclick = async () => {
      const x = dd.saved.find((y) => y.id === b.dataset.dren); if (!x) return;
      const n = prompt('Nome del DNS:', x.name); if (n === null) return;
      let h = x.host;
      if (!x.devices) { const v = prompt('Indirizzo del DNS:', x.host); if (v === null) return; h = v; }
      try { await kapi('PUT', '/admin/dns/saved/' + x.id, { name: n, host: h }); toast('DNS aggiornato'); dnsLoad(); } catch (e) { toast(e.message, 1); }
    }));
    $$('[data-ddel]', V).forEach((b) => (b.onclick = async () => { if (!(await ask('Togliere il DNS dall\'elenco?', 'I clienti che lo usano non cambiano: viene tolto solo dai DNS salvati.', 'Togli'))) return; try { await kapi('DELETE', '/admin/dns/saved/' + b.dataset.ddel); dnsLoad(); } catch (e) { toast(e.message, 1); } }));
    $('#locAdd').onclick = async () => {
      try { await kapi('POST', '/admin/vpn-locs', { name: $('#locN').value, conf: $('#locC').value }); toast('Località aggiunta'); dnsLoad(); } catch (e) { toast(e.message, 1); }
    };
    $$('[data-ldel]', V).forEach((b) => (b.onclick = async () => {
      if (!(await ask('Eliminare la località?', 'I clienti che la usano torneranno alla configurazione generale.', 'Elimina'))) return;
      try { await kapi('DELETE', '/admin/vpn-locs/' + b.dataset.ldel); await load(); dnsLoad(); } catch (e) { toast(e.message, 1); }
    }));
  }

  /* ---------- API e integrazioni ---------- */
  const EVL = { 'device.new': 'Nuovo dispositivo in attesa', 'device.activated': 'Abbonamento attivato', 'report.new': 'Nuova segnalazione', 'request.new': 'Nuova richiesta di contenuto' };
  async function apiLoad() {
    const V = $('#v-api');
    let keys, wh;
    try { [keys, wh] = await Promise.all([kapi('GET', '/admin/api-keys'), kapi('GET', '/admin/webhook')]); } catch (e) { V.innerHTML = `<div class="card glass"><p class="mut">${esc(e.message)}</p></div>`; return; }
    const base = (D.demo ? 'https://kairos-panel.TUO-NOME.workers.dev' : location.origin) + '/api/v1';
    const EP = [
      ['GET', '/ping', 'Prova della chiave'],
      ['GET', '/devices?status=active&q=mario', 'Elenco dei dispositivi (status: active, pending, expired, disabled)'],
      ['GET', '/devices/KXAB-12CD', 'Un dispositivo (codice o id)'],
      ['POST', '/devices', 'Crea un cliente: { code?, name, expires, active, playlists, maxConn, … }'],
      ['PUT', '/devices/KXAB-12CD', 'Modifica: name, notes, expires, active, playlists, maxConn, maxStreams, maxProfiles, plMode, plDefault, perms, vpn, vpnLoc'],
      ['POST', '/devices/KXAB-12CD/activate', 'Attiva: { months | days | expires | unlimited, playlists? }'],
      ['POST', '/devices/KXAB-12CD/extend', 'Rinnova dalla scadenza attuale: { months | days }'],
      ['POST', '/devices/KXAB-12CD/disable', 'Disattiva (enable per riattivare)'],
      ['DELETE', '/devices/KXAB-12CD', 'Elimina il dispositivo'],
      ['POST', '/devices/KXAB-12CD/reset', 'Sblocca (nuova TV o app reinstallata)'],
      ['POST', '/devices/dns', 'DNS di massa: { ids, from?, host, preview? }'],
      ['GET', '/dns', 'DNS in uso e salvati'],
      ['GET', '/presence', 'Utenti online e cosa guardano'],
      ['GET', '/requests?kind=report', 'Segnalazioni (kind=content per le richieste)'],
      ['POST', '/messages', 'Invia un messaggio: { title, body, level, target }'],
      ['GET', '/state', 'Tutto lo stato del pannello (senza password)'],
    ];
    V.innerHTML = `<div class="card glass kc-wiz"><div class="hd"><h3>Chiavi API<small>Per collegare il tuo gestionale, un bot o un sito: la chiave dà accesso alle funzioni del pannello. Con «Sola lettura» si può solo leggere.</small></h3></div>
        ${keys.map((k) => `<div class="kc-host"><div class="tx"><b style="font-family:inherit">🔑 ${esc(k.name)} <span class="kc-tag">${k.scope === 'read' ? 'SOLA LETTURA' : 'COMPLETA'}</span></b><small class="mut" style="display:block"><span class="mono">${esc(k.prefix)}…</span> · creata ${esc(ago(k.created))}${k.last_used ? ` · ultimo uso ${esc(ago(k.last_used))}${k.last_ip ? ' da ' + esc(k.last_ip) : ''} · ${k.uses} richieste` : ' · mai usata'}</small></div><button class="btn sm danger" data-kdel="${esc(k.id)}">Revoca</button></div>`).join('') || '<p class="mut">Nessuna chiave.</p>'}
        <div class="kc-add"><input class="inp" id="kN" placeholder="Nome, es. Gestionale" maxlength="40"><select class="inp" id="kS" style="flex:0 0 200px"><option value="full">Completa</option><option value="read">Sola lettura</option></select><button class="btn pri" id="kAdd">+ Crea chiave</button></div>
      </div>
      <div class="card glass kc-wiz"><div class="hd"><h3>Webhook<small>Il pannello avvisa il tuo server quando succede qualcosa (richiesta POST in JSON, firmata).</small></h3></div>
        <label class="lbl">Indirizzo (https)</label><input class="inp mono" id="whU" placeholder="https://tuo-server.it/kairos-webhook" value="${esc(wh.url || '')}">
        <label class="lbl">Eventi</label><div class="kc-evs">${(wh.all || []).map((e) => `<label><input type="checkbox" data-ev="${e}" ${wh.events.includes(e) ? 'checked' : ''}><span>${esc(EVL[e] || e)} <small class="mono">${e}</small></span></label>`).join('')}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"><button class="btn pri" id="whSave">Salva webhook</button><button class="btn" id="whTest" ${wh.url ? '' : 'disabled'}>Invia una prova</button>${wh.hasSecret ? '<button class="btn" id="whNew">Nuovo segreto</button>' : ''}</div>
        <small class="mut" style="display:block;margin-top:10px">${wh.last ? `Ultimo invio: ${esc(wh.last.event)} · ${esc(ago(wh.last.t))} · risposta ${wh.last.status > 0 ? 'HTTP ' + wh.last.status : 'nessuna (server non raggiungibile)'}` : 'Nessun invio ancora.'}</small>
      </div>
      <div class="card glass"><div class="hd"><h3>Come si usa<small>Indirizzo base e principali funzioni. Gli errori tornano come { "error": "…" } con il codice HTTP.</small></h3></div>
        <div class="kc-doc"><b>Indirizzo base</b><code>${esc(base)}</code>
        <b>Autenticazione</b><code>Authorization: Bearer kx_LA-TUA-CHIAVE</code>
        <b>Esempio</b><code>curl -X POST ${esc(base)}/devices/KXAB-12CD/extend \\<br>&nbsp;&nbsp;-H "Authorization: Bearer kx_…" -H "Content-Type: application/json" \\<br>&nbsp;&nbsp;-d '{"months":12}'</code></div>
        <table class="kc-ep">${EP.map(([mm, pth, d]) => `<tr><td><span class="kc-m ${mm.toLowerCase()}">${mm}</span></td><td class="mono">${esc(pth)}</td><td>${esc(d)}</td></tr>`).join('')}</table>
        <div class="kc-doc"><b>Firma dei webhook</b><p class="mut" style="font-size:13px;line-height:1.55">Ogni invio ha le intestazioni <span class="mono">X-Kairos-Event</span>, <span class="mono">X-Kairos-Timestamp</span> e <span class="mono">X-Kairos-Signature: sha256=…</span>: è l'HMAC-SHA256 di <span class="mono">timestamp + "." + corpo</span> con il segreto del webhook. Controllala sul tuo server per essere sicuro che il messaggio arrivi dal pannello. Limite: 600 richieste al minuto per chiave.</p></div>
      </div>`;
    const showOnce = (title, label, val) => ask(title, `${label}<br><code class="kc-key" id="kcKey">${esc(val)}</code><br><span class="mut">Copiala adesso: per sicurezza non verrà più mostrata.</span>`, 'Copia e chiudi').then((ok) => { if (ok) navigator.clipboard.writeText(val).then(() => toast('Copiata'), () => toast('Copia non consentita: selezionala a mano', 1)); });
    $('#kAdd').onclick = async () => { try { const r = await kapi('POST', '/admin/api-keys', { name: $('#kN').value, scope: $('#kS').value }); await showOnce('Chiave API creata', `<b>${esc(r.name)}</b> (${r.scope === 'read' ? 'sola lettura' : 'completa'}):`, r.key); apiLoad(); } catch (e) { toast(e.message, 1); } };
    $$('[data-kdel]', V).forEach((b) => (b.onclick = async () => { if (!(await ask('Revocare la chiave?', 'I programmi che la usano smetteranno subito di funzionare.', 'Revoca'))) return; try { await kapi('DELETE', '/admin/api-keys/' + b.dataset.kdel); toast('Chiave revocata'); apiLoad(); } catch (e) { toast(e.message, 1); } }));
    const whBody = (extra) => ({ url: $('#whU').value.trim(), events: $$('[data-ev]', V).filter((c) => c.checked).map((c) => c.dataset.ev), ...extra });
    const whSave = async (extra) => { try { const r = await kapi('PUT', '/admin/webhook', whBody(extra)); if (r.secret) await showOnce('Segreto del webhook', 'Usalo per verificare la firma dei messaggi:', r.secret); else toast('Webhook salvato'); apiLoad(); } catch (e) { toast(e.message, 1); } };
    $('#whSave').onclick = () => whSave();
    $('#whNew') && ($('#whNew').onclick = async () => { if (await ask('Nuovo segreto?', 'Il segreto attuale smette di valere: aggiornalo anche sul tuo server.', 'Cambia segreto')) whSave({ newSecret: true }); });
    $('#whTest').onclick = async () => { try { const r = await kapi('POST', '/admin/webhook/test'); toast(r.ok ? `✓ Prova ricevuta (HTTP ${r.status})` : `Il tuo server ha risposto ${r.status > 0 ? 'HTTP ' + r.status : 'nulla'}`, !r.ok); apiLoad(); } catch (e) { toast(e.message, 1); } };
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
