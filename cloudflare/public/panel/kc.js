/* KAIROS Control 2.0 — pagine: Online ora, Segnalazioni, Richieste contenuti, Videoteca, Server DNS e VPN; Dispositivi a schede, Impostazioni a schede.
   Usa le funzioni di app.js ($, $$, esc, api, toast, ask, ago, D, TITLES, view, openDrawer, load). In demo usa dati di esempio. */
(() => {
  /* «Collega» di un dispositivo in attesa: si apre la scheda e subito l'elenco dei clienti con la ricerca (cli-pick.js) */
  const linkPick = () => { const b = document.getElementById('eLinkToBtn'); if (b && window.KXCliPick) { b.scrollIntoView({ block: 'center' }); KXCliPick.open('eLinkTo'); return; } const s = document.getElementById('eLinkTo'); if (s) { s.scrollIntoView({ block: 'center' }); s.focus(); } };
  const KC = (window.KC = { vpnLocs: [], live: null, req: { report: null, content: null }, dns: null, cat: { src: '', kind: 'movies', cat: '', q: '', page: 1 } });
  Object.assign(TITLES, { live: 'Online ora Kairos', reports: 'Segnalazioni', creq: 'Richieste contenuti', vod: 'Videoteca', dns: 'Server DNS e VPN', api: 'API e integrazioni' });

  /* ---------- dati di esempio per la demo ---------- */
  const now = () => Date.now();
  const DM = {
    pres: () => {
      const devs = D.devices.filter((d) => d.status === 'active').slice(0, 6);
      const W = [['live', 'Tg1', 'Rai 1 HD'], ['movie', 'Dune - Parte Due', ''], ['series', 'Mare Fuori S4 E2', ''], ['idle', '', ''], ['live', 'Inter - Milan', 'DAZN 1 FHD'], ['idle', '', '']];
      const online = devs.map((d, i) => ({ id: d.id, name: d.name, code: d.code, status: 'active', state: W[i % 6][0], title: W[i % 6][1], ch: W[i % 6][2], prof: ['Mario', 'Giulia', 'Bimbi', '', 'Luca', ''][i % 6], ip: `93.45.${10 + i}.${20 + i * 7}`, city: ['Milano', 'Roma', 'Napoli', 'Torino', 'Bari', 'Palermo'][i % 6], country: 'IT', ver: i === 3 ? '1.6.0' : '1.8.0', ui: 'a1b2c3d4e5f6', model: d.model || 'Fire TV Stick 4K', net: ['wifi', 'eth', 'wifi', 'mobile', 'wifi', 'eth'][i % 6], rssi: [-52, 0, -71, 0, -64, 0][i % 6], speed_dl: [180, 940, 42, 18, 300, 95][i % 6], speed_ul: [35, 400, 12, 5, 60, 20][i % 6], speed_ping: [18, 6, 35, 60, 14, 22][i % 6], speed_jit: [3, 1, 12, 30, 2, 5][i % 6], speed_t: now() - i * 3600e3, res: ['1920x1080', '3840x2160', '1280x720', '', '1920x1080', ''][i % 6], fps: [50, 24, 25, 0, 50, 0][i % 6], bitrate: [6.2e6, 15e6, 2.8e6, 0, 8e6, 0][i % 6], buffers: [0, 1, 6, 0, 0, 0][i % 6], engine: 'exo', vpn: i === 1 ? 'on' : 'off', ago: i * 20e3, online: true, flags: i === 2 ? ['ip'] : [], codec: ['H.264', 'HEVC', 'H.264', '', 'H.264', ''][i % 6], dec: ['hw', 'hw', 'sw', '', 'hw', ''][i % 6], stalls_h: [0, 1, 5, 0, 4, 0][i % 6], dropped: [0, 12, 340, 0, 30, 0][i % 6], rec: ['', '', 'Immagine ferma → decodifica software', '', 'Caricamento continuo → qualità ridotta', ''][i % 6], reduced: ['', '', '', '', 'HD', ''][i % 6] }));
      const recent = D.devices.filter((d) => !devs.includes(d)).slice(0, 6).map((d, i) => ({ id: d.id, name: d.name, code: d.code, status: d.status, state: ['live', 'movie', 'idle', 'series', 'live', 'idle'][i], title: ['Rai 1 HD', 'Il Gladiatore II', '', 'Gomorra S2 E4', 'Sky Sport 1', ''][i], ip: `79.12.${30 + i}.${40 + i}`, city: ['Firenze', 'Genova', 'Verona', 'Catania', 'Padova', 'Lecce'][i], country: 'IT', ver: '1.8.0', model: d.model || 'Fire TV Stick 4K', online: false, ago: [25, 70, 180, 420, 900, 1300][i] * 60e3, flags: [] }));
      return { online, recent, top: [{ kind: 'live', title: 'Inter - Milan', n: 14 }, { kind: 'movie', title: 'Dune - Parte Due', n: 9 }, { kind: 'live', title: 'Tg1', n: 7 }, { kind: 'series', title: 'Mare Fuori', n: 5 }], counts: { online: online.length, watching: online.filter((o) => o.state !== 'idle').length, idle: online.filter((o) => o.state === 'idle').length, total: D.devices.length } };
    },
    req: { report: [{ id: 1, kind: 'report', title: '', body: 'Rai 1 HD resta nero', info: 'app 1.8.0 · Fire TV · canale: Rai 1 HD', status: 'new', created: now() - 6e5, name: 'Mario Rossi', code: 'KXAB-7Q2M' }], content: [{ id: 2, kind: 'content', ctype: 'movie', title: 'Oppenheimer', body: 'versione in italiano', status: 'new', created: now() - 36e5, name: 'Giulia', code: 'KXCD-9P3L' }, { id: 3, kind: 'content', ctype: 'series', title: 'The Bear', body: '', status: 'done', created: now() - 864e5, name: 'Luca', code: 'KXEF-2K8S', note: 'Aggiunta' }] },
    locs: [{ id: 'mil1', name: 'Milano' }],
    get errs() {
      if (this._errs) return this._errs;
      const ds = D.devices.filter((d) => d.status === 'active'); if (!ds.length) return [];
      const mk = (i, min, problem, outcome, title, action, extra = {}) => { const d = ds[i % ds.length] || {}; return { id: 100 + i, t: now() - min * 60e3, deviceId: d.id, name: d.name, code: d.code, model: d.model || 'Fire TV Stick Lite', ver: '2.0.3', problem, outcome, title, action, kind: 'live', engine: 'exo', codec: 'H.264', dec: 'hw', res: '1080p', err: '', variant: '', ...extra }; };
      this._errs = [
        mk(0, 4, 'stall', 'risolto', 'Sky Sport 1 FHD', 'qualità ridotta (HD)', { variant: '' }),
        mk(1, 9, 'stall', 'risolto', 'Sky Sport 1 FHD', 'formato alternativo'),
        mk(2, 15, 'stall', 'non risolto', 'Sky Sport 1 FHD', 'ricaricato'),
        mk(3, 31, 'freeze', 'risolto', 'DAZN 1 FHD', 'decodifica software', { codec: 'HEVC', model: 'AFTSSS', err: '' }),
        mk(3, 58, 'error', 'risolto', 'Eurosport 1 HD', 'passato a VLC', { codec: 'MPEG-2', err: 'ERROR_CODE_DECODING_FORMAT_UNSUPPORTED' }),
        mk(4, 95, 'error', 'non risolto', 'Dune - Parte Due', 'nessuna soluzione', { kind: 'vod', engine: 'vlc', codec: '', err: 'VLC_ERROR' }),
        mk(0, 140, 'stall', 'chiuso', 'Rai 1 HD', 'ricaricato'),
      ];
      return this._errs;
    },
    set errs(v) { this._errs = v; },
    keys: [{ id: 'k1', name: 'Gestionale', prefix: 'kx_Q7pT2a', scope: 'full', created: now() - 9 * 864e5, last_used: now() - 36e5, last_ip: '93.45.10.20', uses: 1240 }],
    wh: { url: '', events: ['device.new', 'device.activated', 'report.new', 'request.new'], hasSecret: false, last: null },
  };
  async function kapi(method, path, body) {
    if (!D.demo || D.role === 'agent') return api(method, path, body);
    await new Promise((r) => setTimeout(r, 120));
    if (path === '/admin/presence') return DM.pres();
    if (path.startsWith('/admin/app-errors')) {
      if (method === 'DELETE') { DM.errs = []; return { ok: true }; }
      if (path === '/admin/app-errors/seen') { DM.errSeen = now(); return { ok: true }; }
      const items = DM.errs.map((x) => ({ ...x, ownerId: (() => { const d = DEMO.devices.find((y) => y.id === x.deviceId) || {}; const pd = d.parent ? DEMO.devices.find((y) => y.id === d.parent) || {} : d; return +(pd.ownerId || 0); })(), isNew: x.t > (DM.errSeen || 0) }));
      const by = (key) => { const mp = new Map(); for (const x of items) { const k = key(x); const o = mp.get(k) || { key: k, n: 0, unresolved: 0, devs: new Set(), titles: new Set(), name: x.name, code: x.code, model: x.model }; o.n++; if (x.outcome === 'non risolto') o.unresolved++; o.devs.add(x.deviceId); o.titles.add(x.title); mp.set(k, o); } return [...mp.values()].sort((a, b) => b.n - a.n).slice(0, 10).map((o) => ({ ...o, devices: o.devs.size, titles: o.titles.size, devs: undefined })); };
      return { items, topTitles: by((x) => x.title).map(({ name, code, model, ...o }) => o), topDevices: by((x) => x.deviceId), newCount: items.filter((x) => x.isNew).length };
    }
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
.kc-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.9fr) minmax(0,1.15fr) minmax(0,.9fr) minmax(0,1fr);gap:14px;align-items:center;padding:12px 14px;border-radius:14px;border:1px solid var(--line);margin-bottom:8px;background:rgba(255,255,255,.02)}
.kc-row:hover{background:rgba(255,255,255,.045)}
.kc-ltabs{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:2px 0 14px}
.kc-grp{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 12px}
.kc-grp button{display:flex;align-items:center;gap:8px;padding:8px 14px;border-radius:12px;font:inherit;font-size:13.5px;font-weight:700;cursor:pointer;color:#dfe5f3;border:1px solid var(--line);background:rgba(255,255,255,.03)}
.kc-grp button.on{border-color:var(--a1,#4f8cff);background:rgba(79,140,255,.16);color:#fff}
.kc-grp button span{min-width:24px;padding:1px 8px;border-radius:999px;background:rgba(0,0,0,.28);font-size:12.5px;text-align:center}
.kc-agf{display:flex;flex-wrap:wrap;gap:6px;margin:-4px 0 12px}
.kc-by{display:inline-flex;align-items:center;gap:4px;margin-top:5px;font-size:11.5px;font-weight:700;padding:1px 8px;border-radius:999px;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis}
.kc-by.me{background:rgba(79,140,255,.14);color:#9cc0ff}.kc-by.ag{background:rgba(250,204,21,.14);color:#fde68a}
.kc-ext{border:1px solid var(--line);border-radius:14px;overflow:hidden}.kc-ext .ao-row{cursor:pointer}.kc-ext .ao-head{cursor:default}.kc-ext-note{font-size:12.5px;color:var(--mut);margin:0 0 10px}#v-live .ao-err{font-size:12.5px;color:#fbbf24;margin:0 0 6px}
.kc-ltabs button{display:flex;align-items:center;gap:9px;padding:10px 16px;border-radius:14px;font:inherit;font-size:14px;font-weight:700;cursor:pointer;color:#eef1f8;border:1px solid var(--c2);background:color-mix(in srgb,var(--c) 12%,transparent)}
.kc-ltabs button em{font-style:normal;font-weight:500;font-size:12px;opacity:.75}
.kc-ltabs button span{min-width:26px;padding:2px 8px;border-radius:999px;background:rgba(0,0,0,.25);font-size:13px;text-align:center}
.kc-ltabs button i{width:10px;height:10px;border-radius:50%;background:var(--c)}
.kc-ltabs .on-t{--c:#34d399;--c2:color-mix(in srgb,#34d399 45%,transparent)}.kc-ltabs .on-t i{box-shadow:0 0 0 4px color-mix(in srgb,#34d399 25%,transparent);animation:kcPulse 1.6s infinite}
.kc-ltabs .off-t{--c:#ef4444;--c2:color-mix(in srgb,#ef4444 45%,transparent)}
.kc-ltabs button.on{background:var(--c);border-color:transparent;color:#0b0d12;box-shadow:0 10px 26px -14px var(--c)}.kc-ltabs button.on span{background:rgba(255,255,255,.35)}.kc-ltabs button.on i{background:#0b0d12}
.kc-ltabs .inp{flex:1;min-width:180px;margin:0}
@keyframes kcPulse{50%{box-shadow:0 0 0 7px transparent}}
#kLiveList>.kc-row:not(.kc-off){border-left:4px solid #34d399}
.kc-row.kc-off{border-left:4px solid #ef4444;background:rgba(148,163,184,.04);opacity:.92}
.kc-offt{color:#cbd5e1}.kc-dot.off{background:#ef4444!important;box-shadow:0 0 8px #ef4444!important}
.kc-row b{display:block;font-size:14px}.kc-row small{display:block;color:var(--mut);font-size:12px;line-height:1.45;word-break:break-word}
.kc-dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px;vertical-align:1px;background:var(--mut)}
.kc-dot.live{background:#22c55e;box-shadow:0 0 10px #22c55e;animation:kcb 1.4s infinite}.kc-dot.movie,.kc-dot.series{background:var(--a2);box-shadow:0 0 10px var(--a2)}.kc-dot.idle{background:#facc15;box-shadow:0 0 8px #facc15}
@keyframes kcb{50%{opacity:.35}}
.kc-row>div{min-width:0}
.kc-row b.kc-codec,.kc-codec{display:inline!important;font-size:inherit!important;font-weight:700;color:#cfd3ff}
.kc-acts{flex-wrap:wrap}
.kc-row>.kc-acts{grid-column:1/-1;justify-content:flex-end;margin-top:-4px}
.kc-row b{overflow-wrap:anywhere}
.kc-ef{display:flex;flex-direction:column;gap:10px;margin:0 0 12px}
.kc-err{display:grid;grid-template-columns:34px minmax(0,1fr) auto;gap:12px;align-items:flex-start;padding:12px 4px;border-top:1px solid var(--line)}
.kc-err.bad{background:linear-gradient(90deg,color-mix(in srgb,var(--bad) 8%,transparent),transparent 60%)}
.kc-err .ei{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;background:rgba(255,255,255,.05);font-size:17px}
.kc-err .eb b{font-size:14px}.kc-err .et{margin:4px 0 2px;font-weight:600}
.kc-err small{display:block;color:var(--mut);font-size:12px;margin-top:2px}
.kc-err .ew{display:flex;flex-direction:column;align-items:flex-end;gap:6px;font-size:12px;color:var(--mut);white-space:nowrap}
.kc-erank{display:flex;align-items:center;gap:10px;padding:9px 6px;border-top:1px solid var(--line);cursor:pointer;border-radius:8px}
.kc-erank:hover{background:rgba(255,255,255,.04)}
.kc-erank span{flex:1;min-width:0;font-weight:600;overflow:hidden;text-overflow:ellipsis}.kc-erank small{display:block;font-weight:400;color:var(--mut);font-size:12px}
.kc-erank>b{font-size:18px}
.kc-kp{display:flex;flex-direction:column;gap:2px}.kc-kp small{color:var(--mut);font-size:12px;letter-spacing:.08em;text-transform:uppercase}.kc-kp b{font-size:28px}.kc-kp span{color:var(--mut);font-size:12px}
@media (max-width:700px){.kc-err{grid-template-columns:30px minmax(0,1fr)}.kc-err .ew{grid-column:2;flex-direction:row;align-items:center}}
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
.kc-post.kc-ch{aspect-ratio:1/1;background:rgba(255,255,255,.06)}.kc-post.kc-ch img{object-fit:contain;padding:14px 14px 44px;box-sizing:border-box}.kc-post.kc-ch .rt{left:8px;right:auto;color:#fff}.kc-post.kc-ch .rt.ar{left:auto;right:8px;color:var(--warn)}
.kc-post[data-vid]{cursor:pointer;transition:transform .15s}.kc-post[data-vid]:hover{transform:translateY(-3px)}
.kc-det{position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:1200;display:none;align-items:flex-start;justify-content:center;padding:4vh 12px;overflow:auto}.kc-det.on{display:flex}
.kc-det-box{position:relative;width:100%;max-width:880px;background:var(--card,#141821);border:1px solid var(--line,#2a2f3a);border-radius:16px;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.6)}
.kc-det-head{display:flex;gap:18px;align-items:flex-end;padding:26px;background-size:cover;background-position:center;min-height:120px}.kc-det-head img{width:120px;aspect-ratio:2/3;object-fit:cover;border-radius:10px;flex:none;box-shadow:0 8px 24px rgba(0,0,0,.5)}
.kc-det-body{padding:18px 26px 8px}.kc-plot{font-size:14px;line-height:1.55;margin:0 0 14px}.kc-det-row{display:flex;gap:12px;font-size:13px;margin-bottom:9px;align-items:flex-start}.kc-det-row .k{color:var(--mut);min-width:64px;flex:none;padding-top:2px}
.kc-check-head{display:flex;gap:12px;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--line,#2a2f3a)}.kc-check-body{padding:16px 20px 20px}.kc-check-top{display:flex;gap:12px;align-items:center;justify-content:space-between;margin-bottom:12px}.kc-check-table-wrap{max-height:68vh;overflow:auto}.kc-check-table{border-collapse:collapse;width:100%;min-width:620px;font-size:13px}.kc-check-table th,.kc-check-table td{padding:9px 10px;text-align:left;border-bottom:1px solid var(--line,#2a2f3a)}.kc-check-table tbody tr[data-src]{cursor:pointer}.kc-check-table tbody tr[data-src]:hover{background:rgba(255,255,255,.05)}
.kc-chip{display:inline-block;padding:2px 9px;border-radius:999px;background:rgba(255,255,255,.07);font-size:12px;margin:0 5px 5px 0}.kc-chip.live{background:rgba(45,212,191,.18);color:#2dd4bf;margin-left:8px}
.kc-seasons{display:flex;gap:6px;flex-wrap:wrap;padding:6px 26px 12px}.kc-eps{padding:0 26px 22px;display:grid;gap:10px}.kc-ep{display:flex;gap:12px;align-items:flex-start;font-size:13.5px}.kc-ep img{width:150px;aspect-ratio:16/9;object-fit:cover;border-radius:8px;flex:none}.kc-ep-n{width:150px;aspect-ratio:16/9;flex:none;border-radius:8px;background:rgba(255,255,255,.05);display:flex;align-items:center;justify-content:center;font-weight:700;color:var(--mut)}.kc-ep small{display:block;margin-top:2px}.kc-ep p{margin:6px 0 0;color:var(--mut);font-size:12.5px;line-height:1.45}
.kc-epg{padding:10px 26px 24px;display:grid;gap:8px}.kc-epg-i{display:flex;gap:14px;padding:10px 12px;border-radius:10px;background:rgba(255,255,255,.03);font-size:13.5px}.kc-epg-i.on{background:rgba(45,212,191,.08);border:1px solid rgba(45,212,191,.3)}.kc-epg-i .t{min-width:58px;font-weight:700;flex:none}.kc-epg-i .t small{display:block;font-weight:400;color:var(--mut);font-size:11px}.kc-epg-i p{margin:5px 0 0;color:var(--mut);font-size:12.5px;line-height:1.45}
@media(max-width:640px){.kc-det-head{flex-direction:column;align-items:flex-start}.kc-det-head img{width:90px}.kc-ep img,.kc-ep-n{width:100px}}
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
.st-tabs{display:grid;grid-template-columns:repeat(auto-fit,minmax(165px,1fr));gap:10px;margin-bottom:18px}
.st-tab{all:unset;cursor:pointer;display:flex;gap:10px;align-items:center;padding:12px 12px;border-radius:16px;border:1px solid var(--line);background:rgba(255,255,255,.03);transition:background .15s,border-color .15s}
.st-tab:hover{background:rgba(255,255,255,.06)}
.st-tab.on{border-color:rgba(255,90,60,.55);background:linear-gradient(135deg,rgba(255,60,60,.16),rgba(255,255,255,.03));box-shadow:0 0 24px rgba(255,60,60,.12)}
.st-tab i{font-style:normal;font-size:22px;width:40px;height:40px;display:grid;place-items:center;border-radius:12px;background:rgba(255,255,255,.06);flex:none}
.st-tab.on i{background:linear-gradient(135deg,#ff7a45,#ff2a3d)}
.st-tab b{display:block;font-size:15px}.st-tab small{display:block;color:var(--mut);font-size:12px;margin-top:2px}
.st-tab .dot{width:8px;height:8px;border-radius:50%;background:var(--warn);margin-left:auto;display:none}.st-tab.dirty .dot{display:block}
.st-pane{display:none}.st-pane.on{display:block;animation:kcIn .25s ease}
@keyframes kcIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.st-g{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(300px,1fr);gap:18px;align-items:start}
@media (max-width:1100px){.st-g{grid-template-columns:1fr}}
.st-row{display:grid;grid-template-columns:minmax(200px,1fr) minmax(0,1.6fr);gap:18px;align-items:center;padding:16px 0;border-bottom:1px solid var(--line)}
.st-row:last-child{border-bottom:0}.st-row.col{grid-template-columns:1fr;gap:10px}
.st-l b{display:block;font-size:15px}.st-l small{display:block;color:var(--mut);font-size:12.5px;line-height:1.5;margin-top:3px}
.st-c .inp,.st-row textarea{margin:0}.st-two{display:grid;grid-template-columns:1fr 130px;gap:10px}
.st-tog{padding:18px}.st-tog b{font-size:15px}
.st-note{font-size:13px;line-height:1.55;color:var(--mut);padding:12px 14px;border-radius:12px;background:rgba(255,255,255,.04);border:1px solid var(--line);margin:8px 0}
.st-note.warn{border-color:rgba(255,194,61,.35);background:rgba(255,194,61,.07);color:#f2d9a0}
.st-adv{margin-top:10px;border:1px dashed var(--line);border-radius:14px;padding:4px 16px}
.st-adv summary{cursor:pointer;padding:12px 0;font-weight:700;color:var(--mut)}
.st-save{position:sticky;bottom:14px;z-index:5;display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:18px;padding:12px 14px 12px 20px;border-radius:16px;border:1px solid var(--line);background:rgba(12,12,18,.92);backdrop-filter:blur(10px)}
.st-save.dirty{border-color:rgba(255,194,61,.5);box-shadow:0 10px 40px rgba(0,0,0,.5)}.st-save.dirty #stDirty{color:#ffd37a}
.st-save.hide{display:none}
.dnav{position:sticky;top:-22px;z-index:4;display:flex;gap:6px;overflow-x:auto;padding:20px 0 12px;margin:-22px 0 6px;background:#0d0e1f;box-shadow:0 10px 14px -6px #0d0e1f;scrollbar-width:none}
.dnav::-webkit-scrollbar{display:none}
.dnav button{all:unset;cursor:pointer;flex:none;display:flex;align-items:center;gap:6px;padding:7px 11px 7px 7px;border-radius:99px;border:1px solid var(--line);background:rgba(255,255,255,.04);font-size:12.5px;font-weight:700;white-space:nowrap}
.dnav button:hover{background:rgba(255,255,255,.09)}.dnav button.on{border-color:rgba(255,90,60,.6);background:rgba(255,60,60,.15)}.dnav button.on i{background:linear-gradient(135deg,#ff7a45,#ff2a3d)}
.dnav button i{font-style:normal;width:20px;height:20px;border-radius:50%;display:grid;place-items:center;font-size:11px;background:rgba(255,255,255,.1)}
/* scheda cliente a pagina intera (crea e modifica completa) */
#drawer.full{left:250px;width:auto;border-radius:0;background:#0b0c1c}
#drawer.full .dh{padding:20px 32px 16px}
#drawer.full .db{display:grid;grid-template-columns:210px minmax(0,1fr);gap:28px;padding:22px 32px}
#drawer.full .dnav{position:sticky;top:0;align-self:start;flex-direction:column;overflow:visible;margin:0;padding:0;background:none;box-shadow:none;gap:6px}
#drawer.full .dnav button{padding:10px 12px 10px 10px;font-size:13.5px;border-radius:12px}
#drawer.full .dsecs{columns:2 440px;column-gap:18px}
#drawer.full .dsec{break-inside:avoid;display:inline-block;width:100%;vertical-align:top}
#drawer.full .df{padding:14px 32px}
#drawer.quick .db{padding:20px 26px}
.qsum{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:6px}
.qsum.full{grid-template-columns:repeat(auto-fit,minmax(140px,1fr));margin-bottom:18px}
.qsum>div{padding:12px 14px;border-radius:14px;border:1px solid var(--line);background:rgba(255,255,255,.03);display:flex;flex-direction:column;gap:3px}
.qsum small{font-size:11.5px;opacity:.6}.qsum b{font-size:15px}.qsum em{font-style:normal;font-size:12px;opacity:.8}
.qfull{width:100%;margin-top:18px;justify-content:center;border-style:dashed;white-space:normal;flex-direction:column;gap:2px;text-align:center}.qfull small{font-weight:400;opacity:.65;font-size:12px}
#drawer>*{min-width:0}
@media (max-width:900px){#drawer.full{left:0}#drawer.full .db{grid-template-columns:1fr;padding:16px}#drawer.full .dnav{position:sticky;top:-16px;flex-direction:row;overflow-x:auto;background:#0b0c1c;padding:8px 0}#drawer.full .dsecs{columns:1}}
.dsec{padding:16px;border-radius:16px;border:1px solid var(--line);background:rgba(255,255,255,.025);margin-bottom:14px}
.dsec .lbl:first-of-type{margin-top:6px}
.dsh{display:flex;gap:12px;align-items:center;margin-bottom:12px}
.dsh>i{flex:none;width:30px;height:30px;border-radius:50%;display:grid;place-items:center;font-style:normal;font-weight:800;background:linear-gradient(135deg,#ff7a45,#ff2a3d);color:#fff;box-shadow:0 0 16px rgba(255,60,60,.35)}
.dsh b{display:block;font-size:16px}.dsh small{display:block;color:var(--mut);font-size:12px;margin-top:1px}
.pl-eng{display:grid;grid-template-columns:28px 110px 1fr;gap:10px;align-items:center;padding:10px 0;border-bottom:1px solid var(--line)}.pl-eng:last-child{border-bottom:0}
.pl-eng .ic{font-size:18px}.pl-eng .seg{display:grid;grid-template-columns:1fr 1fr;gap:2px}.pl-eng .seg button{white-space:nowrap}
.dv-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin-bottom:14px}
.dv-tile{all:unset;cursor:pointer;display:flex;gap:12px;align-items:center;padding:14px;border-radius:16px;border:1px solid var(--line);background:rgba(255,255,255,.03);transition:background .15s,border-color .15s}
.dv-tile:hover{background:rgba(255,255,255,.06)}.dv-tile i{font-style:normal;font-size:20px;width:40px;height:40px;display:grid;place-items:center;border-radius:12px;background:rgba(255,255,255,.06);flex:none}
.dv-tile b{display:block;font-size:24px;line-height:1}.dv-tile em{display:block;font-style:normal;font-weight:700;font-size:14px;margin-top:3px}.dv-tile small{display:block;color:var(--mut);font-size:11.5px}
.dv-tile.on{border-color:rgba(255,90,60,.55);background:linear-gradient(135deg,rgba(255,60,60,.16),rgba(255,255,255,.03));box-shadow:0 0 24px rgba(255,60,60,.12)}
.dv-soon{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:-4px 0 14px}.dv-soon>span{color:var(--mut);font-size:13px;margin-right:2px}.dv-soon .fchip{margin:0}
.dv-tile.pending b{color:#ffd37a}.dv-tile.soon b{color:#ffd37a}.dv-tile.expired b,.dv-tile.disabled b{color:#ff8f96}.dv-tile.active b{color:#7ef0ab}
.dv-bar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:16px}
.dv-q{flex:1;min-width:240px;position:relative}.dv-q svg{position:absolute;left:14px;top:50%;width:18px;height:18px;transform:translateY(-50%);color:var(--mut)}.dv-q .inp{margin:0;padding-left:42px}
#dvSort{width:auto;margin:0;flex:0 0 220px}
#v-devices.dv-cardsview #filters,#v-devices.dv-cardsview .tbl,#v-devices.dv-cardsview #noRows{display:none!important}
.dv-pend{margin-bottom:18px}.dv-pgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:10px}
.dvp-codeonly{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 14px;border:1px solid rgba(255,194,61,.35);border-radius:12px;background:linear-gradient(135deg,rgba(255,194,61,.08),rgba(255,255,255,.02));font-size:13.5px}
.dvp-codeonly button{flex:none}
.dv-pend:has(.dv-pgrid) .dvp-codeonly{margin-bottom:12px}
.dv-pc{display:flex;flex-direction:column;gap:12px;padding:14px;border-radius:14px;border:1px solid rgba(255,194,61,.35);background:linear-gradient(135deg,rgba(255,194,61,.08),rgba(255,255,255,.02))}
.dv-pc .code.big{font-size:17px;padding:5px 10px}.dv-pc small{display:block;color:var(--mut);font-size:12px;margin-top:6px}
.dvp-tools{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:10px}
.dvp-tools label{display:flex;gap:8px;align-items:center;font-size:12.5px;color:var(--mut);font-weight:600;cursor:help}
.dvp-tools select{width:auto;margin:0;padding:6px 10px;font-size:12.5px}
.dvp-bar{display:flex;gap:6px 14px;align-items:center;flex-wrap:wrap;margin:0 0 10px;padding:10px 14px;border-radius:12px;border:1px solid rgba(255,194,61,.35);background:linear-gradient(135deg,rgba(255,194,61,.08),rgba(255,255,255,.02));font-size:13.5px}
.dvp-bar .dvp-tools{margin:0 0 0 auto}
.dv-pc .dv-act .dvp-x{flex:0 0 auto!important;margin-left:auto;padding-left:12px;padding-right:12px}
.dv-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:12px}
.dv-card{display:flex;flex-direction:column;gap:12px;padding:16px;border-radius:18px;border:1px solid var(--line);background:rgba(255,255,255,.03);cursor:pointer;transition:transform .15s,background .15s,border-color .15s}
.dv-card:hover{background:rgba(255,255,255,.055);border-color:rgba(255,255,255,.18);transform:translateY(-2px)}
.dv-card.expired,.dv-card.disabled{border-color:rgba(255,74,85,.28)}
.dv-top{display:flex;gap:12px;align-items:center}.dv-n{flex:1;min-width:0}.dv-n b{display:block;font-size:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dv-n .code{display:inline-block;margin-top:4px}
.dv-meta{font-size:13px;color:var(--mut);line-height:1.45}
.dv-exp{display:flex;justify-content:space-between;gap:8px;font-size:13.5px}.dv-exp em{font-style:normal;font-weight:700}
.dv-act .dv-x{flex:0 0 auto}
#drawer #dAv{display:none}
.dv-av{flex:none;width:42px;height:42px;border-radius:14px;display:grid;place-items:center;font-weight:800;font-size:18px;color:#fff;background:linear-gradient(135deg,hsl(var(--h,0) 75% 55%),hsl(calc(var(--h,0) + 40) 75% 42%))}
.dv-exp>div{display:flex;justify-content:space-between;gap:8px;font-size:13px}.dv-exp em{font-style:normal;font-weight:700}
.dv-exp>i{display:block;height:6px;border-radius:6px;background:rgba(255,255,255,.07);margin-top:7px;overflow:hidden}.dv-exp s{display:block;height:100%;border-radius:6px;background:linear-gradient(90deg,#3ddc84,#7ef0ab)}
.dv-exp.warn em{color:#ffd37a}.dv-exp.warn s{background:linear-gradient(90deg,#ffb23d,#ffd37a)}.dv-exp.bad em{color:#ff8f96}.dv-exp.bad s{background:linear-gradient(90deg,#ff2a3d,#ff7a45)}
.dv-info{display:grid;grid-template-columns:1fr 1fr;gap:6px 12px;font-size:12.5px;color:var(--mut)}.dv-info span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dv-kids{display:flex;flex-direction:column;gap:6px}.dv-kid{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0}.dv-kids .dv-kid-open{all:unset;cursor:pointer;min-width:0;flex:1;font-size:12px;padding:4px 9px;border-radius:99px;background:rgba(255,255,255,.06);border:1px solid var(--line)}.dv-kids .dv-kid-open:hover{background:rgba(255,255,255,.12)}.dv-kid-actions{display:flex;flex:none;gap:6px}
.dv-note{font-size:12.5px;color:var(--mut);padding:8px 10px;border-radius:10px;background:rgba(255,255,255,.03)}
.dv-act{display:flex;gap:6px;flex-wrap:wrap;margin-top:auto}.dv-act .btn{flex:0 0 auto}.dv-act .dv-kick{flex:0 0 auto;color:#ff6b81;border-color:rgba(255,107,129,.35)}
.dvt-wrap{padding:0!important;overflow:auto}
.dvt{width:100%;border-collapse:separate;border-spacing:0;font-size:13px}
.dvt th{position:sticky;top:0;z-index:1;background:#12132a;text-align:left;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--mut);padding:12px 10px;border-bottom:1px solid var(--line);white-space:nowrap}
.dvt td{padding:10px;border-bottom:1px solid rgba(255,255,255,.05);vertical-align:middle}
.dvt .c{text-align:center;width:1%}
.dvt tbody tr{cursor:pointer;transition:background .12s}
.dvt tbody tr:hover{background:rgba(255,255,255,.035)}
.dvt tbody tr.sel{background:rgba(124,92,255,.12)}
.dvt tbody tr.sub td{padding-top:6px;padding-bottom:6px;background:rgba(0,0,0,.12)}
.dvt input[type=checkbox]{width:16px;height:16px;accent-color:var(--a1);cursor:pointer}
.dvt-u{display:flex;align-items:center;gap:10px;min-width:170px}
.dvt-u b{display:block;font-size:14px}
.dvt-av{width:32px;height:32px;flex:0 0 32px;border-radius:10px;display:grid;place-items:center;font-weight:800;font-size:13px;color:#fff;background:linear-gradient(135deg,hsl(var(--h),70%,52%),hsl(calc(var(--h) + 40),70%,38%))}
.dvt-sub{width:32px;text-align:center;color:var(--mut);font-size:16px}
.dvt-code{display:inline-flex;align-items:center;gap:4px;font-family:ui-monospace,Menlo,monospace;font-size:11px;color:var(--mut);cursor:copy}
.dvt-code svg{width:11px;height:11px;opacity:.6}.dvt-code:hover{color:#fff}
.dvt-app{display:inline-block;vertical-align:middle;margin-left:7px;font-size:9.5px;font-weight:800;letter-spacing:.06em;padding:2px 6px;border-radius:5px;line-height:1.5;white-space:nowrap}
.dvt-app.na{background:rgba(255,255,255,.06);color:var(--mut);font-weight:700}
.dvp-dl{margin-top:5px;font-size:12.5px;color:#67e8f9}.dvp-dl b{color:#a5f3fc}
.dvt-exp b,.dvt-dev b{display:block;font-weight:600;white-space:nowrap}
.dvt-exp small,.dvt-dev small{display:block;font-size:11px;color:var(--mut);margin-top:2px}
.dvt-exp small.warn{color:var(--warn)}.dvt-exp small.bad{color:var(--bad)}
.dvt-dev{max-width:170px}.dvt-dev b{overflow:hidden;text-overflow:ellipsis}
.dvt-dev small.dvt-on{color:#22c55e;font-weight:700}
.dvt-pl{white-space:nowrap;max-width:170px;overflow:hidden;text-overflow:ellipsis}
.dvt-now{min-width:190px;max-width:300px}
.dvt-now b{display:block;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dvt-now b.idle{font-weight:500;color:var(--mut)}
.dvt-now small{display:block;font-size:11px;color:var(--mut);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dvt-now .dn-tags{display:flex;gap:4px;flex-wrap:wrap;margin-top:4px}
.dn-t{display:inline-block;padding:1px 6px;border-radius:999px;font-size:10.5px;font-weight:700;line-height:1.5;background:rgba(148,163,184,.14);color:#cbd5e1;white-space:nowrap}
.dn-t.ok{background:rgba(34,197,94,.16);color:#86efac}.dn-t.no{background:transparent;border:1px dashed rgba(148,163,184,.45);color:var(--mut);padding:0 6px}
.dn-t.vpn{background:rgba(96,165,250,.16);color:#bfdbfe}.dn-t.warn{background:rgba(245,176,65,.16);color:#f2c46c}.dn-t.bad{background:rgba(248,113,113,.16);color:#fecaca}
.dvt-note{max-width:200px;color:#d7d9ef;cursor:text;white-space:nowrap}
.dvt-note span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:inline-block;max-width:170px;vertical-align:middle}
.dvt-note svg{width:12px;height:12px;opacity:.45;vertical-align:middle}
.dvt-ni{padding:6px 8px!important;font-size:13px!important;min-width:170px}
.dvt-acts{white-space:nowrap;text-align:right}
.dvt-acts .btn{margin-left:4px}
.dvt-ib{width:30px;height:30px;margin-left:4px;border-radius:9px;display:inline-grid;place-items:center;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);color:#cfd3ff;cursor:pointer;transition:all .12s;vertical-align:middle}
.dvt-ib svg{width:15px;height:15px}
.dvt-ib:hover{transform:translateY(-1px);filter:brightness(1.25)}
.dvt-ib.g{color:#4ce3a0;border-color:rgba(76,227,160,.3);background:rgba(76,227,160,.08)}
.dvt-add{margin-right:2px;padding:5px 10px;font-size:12px;color:#67e8f9;border-color:rgba(34,211,238,.4);background:rgba(34,211,238,.08);white-space:nowrap;vertical-align:middle}
.dvt-rc{margin-right:2px;padding:5px 10px;font-size:12px;color:#c4b5fd;border-color:rgba(167,139,250,.45);background:rgba(167,139,250,.1);white-space:nowrap;vertical-align:middle}
.dvt-rc svg{width:13px;height:13px;vertical-align:-2px;margin-right:5px}
.dvt-dev .dn-t{margin-top:4px}
@media (max-width:1650px){.dvt .dvt-rc span{display:none}.dvt .dvt-rc{padding:5px 8px}.dvt .dvt-rc svg{margin-right:0}}
.dvt-ib.b{color:#6fb7ff;border-color:rgba(111,183,255,.3);background:rgba(111,183,255,.08)}
.dvt-ib.k{color:#ff6b81;border-color:rgba(255,107,129,.35);background:rgba(255,107,129,.1)}
.dvt-ib.o{color:#ffb547;border-color:rgba(255,181,71,.3);background:rgba(255,181,71,.08)}
.dvt-ib.e{color:#a99bff;border-color:rgba(169,155,255,.3);background:rgba(169,155,255,.08)}
.dvt-ib.r{color:#ff5470;border-color:rgba(255,84,112,.3);background:rgba(255,84,112,.06)}
.dvt-bulk{display:none;position:sticky;top:8px;z-index:5;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 10px;padding:10px 14px;border-radius:14px;background:linear-gradient(90deg,rgba(124,92,255,.25),rgba(255,59,90,.18));border:1px solid rgba(124,92,255,.45);box-shadow:0 10px 30px rgba(0,0,0,.35)}
.dvt-bulk.on{display:flex}
.adbulk{display:grid;gap:6px;max-height:50vh;overflow:auto;text-align:left}.adbulk label{display:flex;align-items:center;justify-content:space-between;gap:10px}.adbulk small{display:block;opacity:.6;font-size:11px}.adbulk select{width:110px;padding:6px 8px}
.adcfg{display:grid;gap:4px}.adcfg h4{margin:14px 0 6px;font-size:13px;opacity:.7;letter-spacing:.04em;text-transform:uppercase}
.adrow{display:grid;grid-template-columns:1fr 210px 130px 70px;gap:10px;align-items:center;padding:8px 10px;border-radius:12px;background:rgba(255,255,255,.03)}
.adrow b{font-size:14px}.adrow small{display:block;opacity:.6;font-size:12px}.adrow .cnt{text-align:right;opacity:.75;font-size:12px}
.adrow select,.adrow input{padding:7px 9px}
@media (max-width:760px){.adrow{grid-template-columns:1fr 1fr}.adrow .cnt{text-align:left}}
.adsw{display:inline-block;width:14px;height:14px;border-radius:50%;margin-right:6px;vertical-align:-2px}
.tog.fixed{opacity:.6;cursor:default}
@media (max-width:900px){.dvt th.dvh-dev,.dvt td.dvt-dev,.dvt th.dvh-now,.dvt td.dvt-now,.dvt th.dvh-pl,.dvt td.dvt-pl,.dvt th.dvh-note,.dvt td.dvt-note{display:none}}
@media (max-width:1500px){.dvt-now{min-width:150px;max-width:220px}}
.kc-dns-table{margin-top:16px;border:1px solid var(--line);border-radius:12px;overflow:hidden}
.kc-dns-row{display:grid;grid-template-columns:minmax(80px,.75fr) minmax(115px,1.1fr) 45px minmax(85px,.85fr) minmax(100px,.9fr) minmax(115px,.95fr) minmax(226px,1.9fr);gap:8px;align-items:center;padding:11px 10px;border-top:1px solid var(--line);font-size:13px}
.kc-dns-row:first-child{border-top:0}.kc-dns-row.head{background:rgba(255,255,255,.04);font-size:11px;font-weight:800;color:var(--mut);text-transform:uppercase;letter-spacing:.04em}
.kc-dns-row .mono{display:block;overflow-wrap:anywhere;color:#cdd2ee;font-size:12px}.kc-dns-row .mut{font-size:12px}.kc-dns-row .status-sat{color:#ffb28a}
.kc-dns-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.kc-dns-actions .btn{white-space:nowrap;flex:none}
.kc-dns-add{display:grid;grid-template-columns:minmax(150px,1fr) minmax(190px,1.3fr) minmax(180px,1fr) auto;gap:10px;align-items:center;margin-top:14px}
.kc-dns-add .inp{min-width:0;margin:0}.kc-dns-other{margin-top:18px;padding-top:12px;border-top:1px solid var(--line)}
.kc-dns-other h4{margin:0 0 8px;font-size:13px}.kc-dns-unsaved{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;padding:9px 0;border-top:1px solid var(--line)}
.kc-dns-unsaved .mono{display:block;overflow-wrap:anywhere;font-size:12px}
.kc-add,.kc-vpnadd{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}.kc-add .inp{flex:1;min-width:200px;margin:0}.kc-vpnadd>div{flex:1;min-width:180px}
.kc-wiz,.kc-dnsl{margin-bottom:18px}
.kc-step{display:flex;gap:14px;align-items:flex-start;padding:14px 0;border-bottom:1px solid var(--line)}
.kc-step>i{flex:none;width:30px;height:30px;border-radius:50%;display:grid;place-items:center;font-style:normal;font-weight:800;background:linear-gradient(135deg,#ff7a45,#ff2a3d);color:#fff;box-shadow:0 0 16px rgba(255,60,60,.4)}
.kc-step b{display:block;font-size:15px;margin:4px 0 10px}.kc-step select.inp{max-width:640px}.kc-step small{display:block;margin-top:6px;font-size:12px}
.kc-tools{display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap}.kc-tools .inp{flex:1;min-width:180px;margin:0}
.kc-app-filters{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin:8px 0 10px}.kc-app-filters .mut{font-size:12px;font-weight:700}.kc-app-filters .btn{margin:0}
.kc-devs small .hl{color:#fff;background:rgba(255,60,60,.25);border-radius:5px;padding:1px 6px}
.kc-sum{margin-top:14px;padding:14px;border-radius:12px;background:rgba(255,255,255,.04);border:1px dashed var(--line);font-size:14px;line-height:1.5}
.kc-devs{max-height:46vh;overflow:auto;border:1px solid var(--line);border-radius:12px;padding:6px}
.kc-devs label{display:flex;gap:10px;align-items:center;padding:8px 10px;border-radius:9px;cursor:pointer;font-size:14px}
.kc-devs label:hover{background:rgba(255,255,255,.04)}.kc-devs input{width:18px;height:18px;accent-color:var(--a1)}
.kc-devs small{color:var(--mut);font-size:12px;margin-left:auto;font-family:ui-monospace,monospace}
.perms{display:grid;grid-template-columns:1fr 1fr;gap:8px}.perms .tog{margin:0}
.kpi.go{cursor:pointer;transition:transform .15s}.kpi.go:hover{transform:translateY(-3px)}
@media (max-width:1100px){.kc-row{grid-template-columns:1fr 1fr}.kc-acts{justify-content:flex-start}.kc-k{grid-template-columns:1fr 1fr}.kc-vc{grid-template-columns:1fr}.perms{grid-template-columns:1fr}}
@media (max-width:1100px){.kc-dns-row.head{display:none}.kc-dns-row{grid-template-columns:1fr 1fr;align-items:start}.kc-dns-cell{display:flex;gap:12px;align-items:flex-start}.kc-dns-cell:before{content:attr(data-label);flex:0 0 82px;font-size:11px;color:var(--mut);font-weight:800;text-transform:uppercase}.kc-dns-actions{justify-content:flex-start}}
@media (max-width:520px){.kc-dns-add{grid-template-columns:1fr}.kc-dns-add .btn{width:100%}.kc-dns-row{grid-template-columns:1fr;gap:9px;padding:12px}.kc-dns-cell:before{flex-basis:76px}.kc-dns-actions{justify-content:flex-start}}
`;
  document.head.appendChild(css);

  /* ---------- menu e pagine ---------- */
  const IC = {
    buff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3 10c2-3 4-3 6 0s4 3 6 0 4-3 6 0"/><path d="M3 16c2-3 4-3 6 0s4 3 6 0 4-3 6 0"/></svg>',
    live: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="2.5"/><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M4.9 4.9a10 10 0 0 0 0 14.2M19.1 4.9a10 10 0 0 1 0 14.2"/></svg>',
    reports: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/></svg>',
    creq: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M12 9v6M9 12h6"/></svg>',
    vod: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="9" rx="1.5"/><rect x="3" y="15" width="18" height="6" rx="1.5"/></svg>',
    api: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16"/></svg>',
    dns: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/></svg>',
    apperr: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4M12 8v4M12 14.5h.01"/></svg>',
  };
  const dash = $('.nav[data-v="dash"]');
  const navs = [['live', 'Online ora Kairos'], ['apperr', 'Errori applicazione'], ['buff', 'Buffering'], ['reports', 'Segnalazioni'], ['creq', 'Richieste contenuti'], ['vod', 'Videoteca'], ['dns', 'Server DNS e VPN'], ['api', 'API e integrazioni']];
  let after = dash;
  for (const [v, l] of navs) {
    const b = document.createElement('button'); b.className = 'nav'; b.dataset.v = v;
    b.innerHTML = `${IC[v]}${l}${v === 'reports' || v === 'creq' || v === 'apperr' ? `<span class="kc-nb" id="nb_${v}"></span>` : ''}`;
    after.after(b); after = b;
    const sec = document.createElement('section'); sec.className = 'view'; sec.id = 'v-' + v;
    $('#v-dash').after(sec);
    b.onclick = () => view(v);
  }
  // all'apertura di una pagina si caricano i suoi dati
  const origView = view;
  window.view = view = function (v) { origView(v); if (v === 'live') liveLoad(); if (v === 'reports') reqLoad('report'); if (v === 'creq') reqLoad('content'); if (v === 'vod') vodInit(); if (v === 'dns') dnsLoad(); if (v === 'api') apiLoad(); if (v === 'apperr') errLoad(); if (v === 'buff') buffLoad(); };

  /* ---------- Online ora ---------- */
  const STATE_L = { live: 'In diretta', movie: 'Film', series: 'Serie TV', rec: 'Registrazione', idle: 'Nell\'app' };
  const NET_L = { wifi: 'Wi-Fi', eth: 'Ethernet', mobile: 'Rete mobile', none: 'Senza rete' };
  const bars = (rssi) => { const n = rssi >= -55 ? 4 : rssi >= -65 ? 3 : rssi >= -75 ? 2 : 1; return `<span class="kc-bars">${[4, 7, 10, 12].map((h, i) => `<i style="height:${h}px" class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`; };
  const mbps = (v) => (v >= 100 ? Math.round(v) : (+v).toFixed(1)) + ' Mbps';
  /* dove sta probabilmente il problema: linea del cliente, dispositivo o canale */
  function diagOf(o) {
    if (!o || o.state === 'idle') return null;
    const stalls = +o.stalls_h || 0, rec = String(o.rec || '');
    if (/immagine ferma|decodifica|errore/i.test(rec) && !/qualità/i.test(rec)) return ['dispositivo', 'Il video si fermava o il decoder dava errore: probabile limite del dispositivo con questo canale (es. HEVC su chiavette vecchie)'];
    if (stalls < 3 && !o.reduced) return null;
    const errs = KC.errs && KC.errs.topTitles ? KC.errs.topTitles.find((x) => x.key === o.title && x.devices >= 2) : null;
    if (errs) return ['canale', `Lo stesso contenuto ha avuto problemi su ${errs.devices} dispositivi diversi: probabile problema del canale o del server`];
    const weakWifi = o.net === 'wifi' && o.rssi && o.rssi < -70;
    const slow = (o.speed_dl && o.bitrate && o.speed_dl * 1e6 < o.bitrate * 1.6) || o.line === 'weak' || (o.fill && o.fill < 1) || (o.bw && o.bitrate && o.bw * 1e6 < o.bitrate * 1.3);
    if (weakWifi || slow || o.net === 'mobile') return ['linea', weakWifi ? `Segnale Wi-Fi debole (${o.rssi} dBm): avvicinare il router o usare il cavo` : slow ? 'La velocità del cliente è appena sopra quella del canale: serve più banda o una versione più leggera' : 'Rete mobile: velocità variabile'];
    return ['linea o server', 'Blocchi ripetuti con segnale e velocità buoni: controlla se altri clienti hanno problemi sullo stesso canale (Errori applicazione)'];
  }
  /* Kairos Adaptive: come l'app vede la linea del cliente (classe + banda misurata sui flussi HLS/VOD) */
  const LINE_L = { weak: ['debole', 'bad', 'Linea debole: l\'app usa buffer più lunghi e parte dalla versione più leggera dei canali'], normal: ['normale', '', 'Linea normale'], good: ['ottima', 'ok', 'Linea ottima: buffer corti e qualità piena'] };
  const lineTag = (o) => { const l = LINE_L[o.line]; if (!l) return ''; return `<span class="kc-tag ${l[1]}" title="${esc(l[2])}">linea ${l[0]}${o.bw ? ' · ' + mbps(o.bw) : ''}${o.dev_class === 'D' ? ' · dispositivo debole' : ''}</span>`; };
  const diagTag = (o) => { const d = diagOf(o); return d ? `<span class="kc-tag ${d[0] === 'dispositivo' ? 'bad' : 'warn'}" title="${esc(d[1])}">🔎 probabile problema: ${esc(d[0])}</span>` : ''; };
  /* «Attivato da» (11 novembre 2026): l'agente del cliente principale, altrimenti tu */
  const liveOwner = (o) => { const d = D.devices.find((x) => x.id === o.id), m = d && d.parent ? D.devices.find((x) => x.id === d.parent) : d; return m && +m.ownerId ? +m.ownerId : 0; };
  const liveAgName = (id) => { const a = (D.agents || []).find((x) => +x.id === +id); return a ? a.username || a.name || 'agente' : 'agente #' + id; };
  const byTag = (o) => { const a = liveOwner(o); return a ? `<span class="kc-by ag" title="Cliente attivato dall'agente ${esc(liveAgName(a))}">🤝 Attivato da ${esc(liveAgName(a))}</span>` : '<span class="kc-by me" title="Cliente attivato da te">👤 Attivato da te</span>'; };
  function liveRow(o) {
    const d = D.devices.find((x) => x.id === o.id);
    const what = o.state === 'idle' ? `<b><span class="kc-dot idle"></span>Nell'app</b><small>${esc(o.screen || 'naviga nei menu')}</small>` : `<b><span class="kc-dot ${esc(o.state)}"></span>${esc(o.title || o.ch || '—')}</b><small>${STATE_L[o.state] || ''}${o.ch && o.title ? ' · ' + esc(o.ch) : ''}${o.grp ? ' · ' + esc(o.grp) : ''}</small>`;
    const ENG = { exo: 'ExoPlayer', vlc: 'VLC' };
    const play = o.state !== 'idle' && (o.res || o.bitrate || o.codec) ? `<small>${o.res ? esc(o.res) : ''}${o.fps ? ' · ' + Math.round(o.fps) + ' fps' : ''}${o.bitrate ? ' · ' + mbps(o.bitrate / 1e6) : ''}${o.codec ? ' · <b class="kc-codec">' + esc(o.codec) + '</b>' : ''}${o.engine ? ' · ' + esc(ENG[o.engine] || o.engine) : ''}${o.dec ? (o.dec === 'sw' ? ' (software)' : ' (hardware)') : ''}${o.fmt ? ' · ' + esc(String(o.fmt).toUpperCase()) : ''}${o.var && o.var !== 'full' ? ' · versione ' + esc(o.var) : ''}${o.ttff ? ' · parte in ' + (o.ttff / 1000).toFixed(1) + ' s' : ''}${o.fill ? ` · <span title="Riempimento del buffer nei primi 10 s: sopra 1 la linea ha margine, sotto 1 non regge il canale">buffer ×${(+o.fill).toFixed(1)}</span>` : ''}</small>
      <small>${o.stalls_h != null && o.codec ? `<span style="color:${o.stalls_h >= 3 ? 'var(--bad)' : o.stalls_h ? 'var(--warn)' : 'var(--ok)'}">${o.stalls_h} blocchi nell'ultima ora</span>` : o.buffers ? `<span style="color:var(--warn)">${o.buffers} blocchi</span>` : ''}${o.dropped ? ` · ${o.dropped} fotogrammi persi` : ''}</small>
      ${o.reduced ? `<span class="kc-tag warn" title="La linea non reggeva: l'app è passata da sola a una versione più leggera del canale">⬇ qualità ridotta: ${esc(o.reduced)}</span>` : ''}${o.rec ? `<span class="kc-tag" title="Ultimo recupero automatico">🛠 ${esc(o.rec)}</span>` : ''}${diagTag(o)}` : '';
    const net = `<b>${o.net === 'wifi' && o.rssi ? bars(o.rssi) : ''}${NET_L[o.net] || 'Rete ?'}${o.net === 'wifi' && o.rssi ? ` <span class="mut" style="font-weight:400;font-size:12px">${o.rssi} dBm</span>` : ''}</b>${o.speed_dl ? `<small>↓ ${mbps(o.speed_dl)} · ↑ ${o.speed_ul ? mbps(o.speed_ul) : '—'} · ${Math.round(o.speed_ping)} ms${o.speed_jit ? ' (±' + Math.round(o.speed_jit) + ')' : ''}<br>speed test ${ago(o.speed_t)}</small>` : '<small>nessuno speed test</small>'}${lineTag(o)}`;
    const where = `<b class="mono" style="font-size:13px">${esc(o.ip || '—')}</b><small>${esc([o.city, o.country].filter(Boolean).join(', ') || '')}</small>${(o.flags || []).includes('ip') ? '<span class="kc-tag warn" title="Due indirizzi IP diversi in pochi minuti: possibile codice condiviso">⚠ 2 IP</span>' : ''}${(o.flags || []).includes('country') ? '<span class="kc-tag warn">⚠ paese diverso</span>' : ''}`;
    const app = `<b>${esc(o.ver ? 'App ' + o.ver : 'App ?')}</b><small>${esc(o.model || '')}${o.prof ? '<br>Profilo: ' + esc(o.prof) : ''}</small>${o.vpn === 'on' ? '<span class="kc-tag ok">🛡 VPN attiva</span>' : ''}`;
    const vpnBtn = d && !d.parent && +d.vpn ? `<button class="btn sm" data-kvpn="${esc(o.id)}" title="Spegne la VPN su questo abbonamento">Spegni VPN</button>` : '';
    return `<div class="kc-row"><div><b>${esc(o.name || o.code)}</b><small><span class="mono">${esc(o.code)}</span> · ${o.online ? 'adesso' : ago(Date.now() - o.ago)}</small>${byTag(o)}</div><div>${what}${play}</div><div>${net}</div><div>${where}</div><div>${app}</div><div class="kc-acts">${o.online && o.state !== 'idle' ? `<button class="btn sm danger" data-kkick="${esc(o.id)}" title="Interrompe subito la visione (l'abbonamento resta attivo)">⛔ Disconnetti</button>` : ''}${vpnBtn}<button class="btn sm kc-dati" data-kdati="${esc(o.id)}">📊 Dati</button><button class="btn sm" data-kopen="${esc(o.id)}">Scheda</button></div></div>`;
  }
  const offFor = (ms) => { const m = Math.max(1, Math.round(ms / 60e3)); return m < 60 ? m + ' min' : m < 1440 ? Math.floor(m / 60) + ' h' + (m % 60 >= 10 && m < 600 ? ' ' + (m % 60) + ' min' : '') : Math.floor(m / 1440) + ' g'; };
  function offRow(o) {
    const last = o.title || o.ch ? `<b>${o.state === 'live' ? '📺' : o.state === 'series' ? '🎞' : o.state === 'movie' ? '🎬' : ''} ${esc(o.title || o.ch)}</b><small>ultima visione</small>` : '<b class="mut" style="font-weight:500">—</b><small>nessuna visione registrata</small>';
    return `<div class="kc-row kc-off"><div><b>${esc(o.name || o.code)}</b>${o.name ? `<small><span class="mono">${esc(o.code)}</span></small>` : ''}${o.owner ? `<small>di ${esc(o.owner)}</small>` : ''}${byTag(o)}</div><div><b class="kc-offt"><span class="kc-dot off"></span>Offline da ${offFor(o.ago)}</b><small>ultimo collegamento alle ${new Date(Date.now() - o.ago).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</small></div><div>${last}</div><div><b class="mono" style="font-size:13px">${esc(o.ip || '—')}</b><small>${esc([o.city, o.country].filter(Boolean).join(', ') || '')}</small></div><div><b>${esc(o.ver ? 'App ' + o.ver : 'App ?')}</b><small>${esc(o.model || '')}</small></div><div class="kc-acts"><button class="btn sm kc-dati" data-kdati="${esc(o.id)}">📊 Dati</button><button class="btn sm" data-kopen="${esc(o.id)}">Scheda</button></div></div>`;
  }
  /* schede «Tutti» · «I miei clienti» · «Clienti agenti» (con filtro per agente) · «App terze» (11 novembre 2026) */
  const grpFit = (o) => { const a = liveOwner(o); return KC.liveGrp === 'mine' ? !a : KC.liveGrp === 'agents' ? !!a && (!KC.liveAg || String(a) === KC.liveAg) : true; };
  const XA = () => window.KXAppsOnline;
  function extList() {
    const X = XA(); if (!X) return null;
    const q = (KC.liveQ || '').trim().toLowerCase();
    // «Collegati ora»: collegate o in verifica; «Offline»: scollegate o non verificabili (il server della linea non ha risposto)
    const L = X.rows().filter((r) => X.ext(r)).filter((r) => (KC.liveTab === 'off') === ['off', 'na'].includes(X.stOf(r)));
    return q ? L.filter((r) => [r.name, r.sub, r.by, r.owner, r.appL, r.ip, ...(r.lines || []).map((l) => l.user)].some((x) => String(x || '').toLowerCase().includes(q))) : L;
  }
  function grpBar(P) {
    const L = KC.liveTab === 'off' ? P.recent : P.online, X = XA(), ext = extList();
    const n = { all: L.length, mine: L.filter((o) => !liveOwner(o)).length, agents: L.filter((o) => liveOwner(o)).length };
    const B = [['all', 'Tutti', n.all], ['mine', '👤 I miei clienti', n.mine], ['agents', '🤝 Clienti agenti', n.agents], ['ext', '🧩 App terze', ext && X.at() ? ext.length : '…']];
    let h = `<div class="kc-grp">${B.map(([k, l, c]) => `<button type="button" data-lgrp="${k}" class="${KC.liveGrp === k ? 'on' : ''}">${l}<span>${c}</span></button>`).join('')}</div>`;
    if (KC.liveGrp === 'agents') {
      const by = new Map(); for (const o of L) { const a = liveOwner(o); if (a) by.set(a, (by.get(a) || 0) + 1); }
      const ags = [...by.entries()].sort((a, b) => b[1] - a[1] || liveAgName(a[0]).localeCompare(liveAgName(b[0]), 'it'));
      if (KC.liveAg && !by.has(+KC.liveAg)) KC.liveAg = '';
      h += `<div class="kc-agf">${[['', 'Tutti gli agenti', n.agents], ...ags.map(([id, c]) => [String(id), liveAgName(id), c])].map(([k, l, c]) => `<button type="button" class="fchip ${KC.liveAg === k ? 'on' : ''}" data-lag="${esc(k)}">${esc(l)}<span>${c}</span></button>`).join('')}</div>`;
    }
    return h;
  }
  function liveList(P) {
    const q = (KC.liveQ || '').trim().toLowerCase();
    const fit = (o) => grpFit(o) && (!q || [o.name, o.code, o.owner, o.city, liveOwner(o) ? liveAgName(liveOwner(o)) : ''].some((x) => String(x || '').toLowerCase().includes(q)));
    if (KC.liveGrp === 'ext') {
      const X = XA(); if (!X) return '<p class="mut">Le app terze non sono disponibili in questa pagina.</p>';
      const L = extList();
      if (!X.at()) return '<p class="mut">Leggo MaxPlayer, OrbixPlay e MirkoTeam…</p>';
      const errs = X.errs().map((e) => `<div class="ao-err">⚠ ${esc(e)}</div>`).join('');
      const note = '<p class="kc-ext-note">MaxPlayer e OrbixPlay non dicono IP e canale: «collegato» è il controllo della linea, il canale solo se la stessa linea è anche su WOLF, Atlantix, Realott o SLT. MirkoTeam dice IP e dispositivo, non il canale. Tocca una riga per vedere tutto.</p>';
      return errs + note + (L.length ? `<div class="kc-ext">${X.listHtml(L.slice(0, 300))}</div>` : `<p class="mut">${q ? 'Nessun risultato.' : KC.liveTab === 'off' ? 'Nessuna app terza scollegata nelle ultime 24 ore.' : 'Nessuna app terza collegata adesso.'}</p>`);
    }
    if (KC.liveTab === 'off') {
      const L = P.recent.filter(fit).sort((a, b) => a.ago - b.ago);
      return L.length ? L.slice(0, 200).map(offRow).join('') : `<p class="mut">${q ? 'Nessun risultato.' : 'Nessun dispositivo offline visto nelle ultime 24 ore.'}</p>`;
    }
    const L = P.online.filter(fit);
    return L.length ? L.map(liveRow).join('') : `<p class="mut">${q ? 'Nessun risultato.' : 'Nessun utente collegato in questo momento.'}</p>`;
  }
  function extLoad(force) {
    const X = XA(); if (!X || X.busy()) return;
    if (!force && X.at() && Date.now() - X.at() < 60e3) return;
    X.load(force).then(() => { if ($('#v-live').classList.contains('on') && KC.liveRedraw) KC.liveRedraw(); }).catch(() => {});
  }
  { let et = 0; document.addEventListener('kx-online', () => { if (et || KC.liveGrp !== 'ext' || !$('#v-live').classList.contains('on')) return; et = setTimeout(() => { et = 0; if (KC.liveRedraw) KC.liveRedraw(); }, 400); }); }
  function liveBind(V) {
    $$('.kc-ext [data-aok]', V).forEach((x) => { x.onclick = () => XA() && XA().open(x.dataset.aok); x.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); XA() && XA().open(x.dataset.aok); } }; });
    $$('[data-kdati]', V).forEach((x) => (x.onclick = () => window.KXInsight && KXInsight.open(x.dataset.kdati)));
    $$('[data-kopen]', V).forEach((b) => (b.onclick = () => { const d = D.devices.find((x) => x.id === b.dataset.kopen); d ? openQuick(d) : toast('Dispositivo non trovato', 1); }));
    $$('[data-kkick]', V).forEach((b) => (b.onclick = async () => { const d = D.devices.find((x) => x.id === b.dataset.kkick); if (d && (await kickDev(d))) { b.disabled = true; b.textContent = 'Disconnessione…'; } }));
    $$('[data-kvpn]', V).forEach((b) => (b.onclick = async () => {
      if (!(await ask('Spegnere la VPN?', 'La VPN verrà disattivata su questo abbonamento: l\'app la chiude al prossimo controllo (entro qualche minuto).', 'Spegni'))) return;
      try { await api('PUT', '/admin/devices/' + b.dataset.kvpn, { vpn: 0 }); await load(); toast('VPN disattivata'); liveLoad(); } catch (e) { toast(e.message, 1); }
    }));
  }
  try { KC.liveTab = sessionStorage.getItem('kc_lt') || 'on'; } catch {}
  try { KC.liveGrp = sessionStorage.getItem('kc_lg') || 'all'; } catch { KC.liveGrp = 'all'; }
  KC.liveAg = '';
  let liveT = null;
  async function liveLoad() {
    const V = $('#v-live');
    if (!KC.live) V.innerHTML = '<div class="card glass"><p class="mut">Caricamento…</p></div>';
    if (!KC.errs) { try { KC.errs = await kapi('GET', '/admin/app-errors?hours=24'); KC.errN = null; errBadge(); } catch {} }
    try { KC.live = await kapi('GET', '/admin/presence'); } catch (e) { V.innerHTML = `<div class="card glass"><p class="mut">${esc(e.message)}</p></div>`; return; }
    const P = KC.live, c = P.counts;
    V.innerHTML = `<div class="kc-k">${[['Online ora', c.online, 'app aperte negli ultimi 4 minuti', '#4f8cff'], ['Stanno guardando', c.watching, 'canali, film e serie', '#22c55e'], ['Nei menu', c.idle, 'app aperta senza video', '#facc15'], ['Dispositivi totali', c.total, 'registrati nel pannello', 'var(--a1)']].map(([l, v, s, col]) => `<div class="kpi glass"><div class="halo" style="background:${col}"></div><div class="lb"><i style="background:${col};box-shadow:0 0 10px ${col}"></i>${l}</div><div class="v">${v}</div><div class="s">${s}</div></div>`).join('')}</div>
      <div class="g2b" style="grid-template-columns:minmax(0,2.4fr) minmax(260px,1fr)">
        <div class="card glass"><div class="hd"><h3>Utenti<small>${window.KXAuto ? (KXAuto.on() ? 'Si aggiorna da solo ogni ' + KXAuto.sec() + ' secondi (pulsante «Auto» in alto)' : 'Aggiornamento automatico spento (pulsante «Auto» in alto)') : 'Si aggiorna da solo ogni 15 secondi'} · dati inviati dalle app 1.8 o successive</small></h3><button class="btn sm" id="kLiveR">Aggiorna</button></div>
          <div id="kLiveGrp">${grpBar(P)}</div>
          <div class="kc-ltabs"><button class="on-t ${KC.liveTab !== 'off' ? 'on' : ''}" data-ltab="on"><i></i>Collegati ora<span>${P.online.length}</span></button><button class="off-t ${KC.liveTab === 'off' ? 'on' : ''}" data-ltab="off"><i></i>Offline<em>visti nelle ultime 24 ore</em><span>${P.recent.length}</span></button>
            <input class="inp" id="kLiveQ" placeholder="Cerca nome o codice…" value="${esc(KC.liveQ || '')}"></div>
          <div id="kLiveList">${liveList(P)}</div>
        </div>
        <div class="card glass"><div class="hd"><h3>Più visti oggi<small>Quante volte è iniziata la visione</small></h3></div>
          <div class="kc-top">${(P.top || []).map((x) => `<div><span>${x.kind === 'live' ? '📺' : x.kind === 'series' ? '🎞' : '🎬'} ${esc(x.title)}</span><b>${x.n}</b></div>`).join('') || '<p class="mut">Ancora nessun dato oggi.</p>'}</div>
          <div class="sd-note" style="font-size:13px;margin-top:14px;color:var(--mut);line-height:1.5"><b>⚠ 2 IP</b>: lo stesso codice si è collegato da due indirizzi diversi in pochi minuti (possibile condivisione). <b>Paese diverso</b>: collegamento da un paese diverso dal solito.</div>
        </div>
      </div>`;
    $('#kLiveR').onclick = liveLoad;
    const redraw = () => { const G = $('#kLiveGrp'); if (G) G.innerHTML = grpBar(P); const L = $('#kLiveList'); L.innerHTML = liveList(P); liveBind(L); };
    KC.liveRedraw = redraw;
    $$('[data-ltab]', V).forEach((b) => (b.onclick = () => { KC.liveTab = b.dataset.ltab; try { sessionStorage.setItem('kc_lt', KC.liveTab); } catch {} $$('[data-ltab]', V).forEach((x) => x.classList.toggle('on', x === b)); redraw(); }));
    // gruppi e agenti (la barra si ridisegna a ogni cambio: i click arrivano qui)
    $('#kLiveGrp').onclick = (e) => {
      const g = e.target.closest('[data-lgrp]'), a = e.target.closest('[data-lag]');
      if (g) { KC.liveGrp = g.dataset.lgrp; if (KC.liveGrp !== 'agents') KC.liveAg = ''; try { sessionStorage.setItem('kc_lg', KC.liveGrp); } catch {} if (KC.liveGrp === 'ext') extLoad(false); redraw(); }
      if (a) { KC.liveAg = a.dataset.lag; redraw(); }
    };
    if (KC.liveGrp === 'ext') extLoad(false); // le app terze si leggono solo con la loro scheda aperta (niente richieste in più a MaxPlayer, OrbixPlay e MirkoTeam)
    $('#kLiveQ').oninput = (e) => { KC.liveQ = e.target.value; redraw(); };
    liveBind(V);
    clearTimeout(liveT);
    if (!window.KXAuto) liveT = setTimeout(() => { if ($('#v-live').classList.contains('on')) liveLoad(); }, 15000); // con il pulsante «Auto» decide auto-refresh.js
  }

  /* ---------- Errori applicazione ---------- */
  const PROB = { freeze: ['Immagine ferma', '🧊'], stall: ['Caricamento continuo', '⏳'], error: ['Errore del lettore', '⚠'], restart: ['Riavvio per memoria', '🔁'], crash: ['Chiusura per errore interno', '💥'], killed: ['Chiusa dal sistema (memoria)', '🧠'], uierr: ['Errore dell\'interfaccia', '🐞'], inuse: ['Linea già in uso', '⚠'], expired: ['Lista scaduta/sospesa', '⚠'], unreach: ['Server non raggiungibile dalla rete del cliente', '🌐'], down: ['Server della lista spento', '⚠'], nonet: ['Senza internet', '🌐'] };
  const OUTC = { risolto: ['Risolto da solo', 'ok'], 'non risolto': ['Non risolto', 'bad'], chiuso: ['Il cliente è uscito', ''], '': ['—', ''] };
  KC.errF = { q: '', p: '', o: '', ow: '', hours: 168 };
  async function errLoad(quiet) {
    const V = $('#v-apperr');
    // in sottofondo con le pagine degli errori chiuse basta il numero dei nuovi (prima: elenco completo fino a 2000 righe ogni 30 secondi)
    const onV = (id) => { const x = document.getElementById(id); return !!x && x.classList.contains('on'); };
    if (quiet && KC.errs && !onV('v-apperr') && !onV('v-buff') && !onV('v-live')) {
      try {
        const r = await kapi('GET', '/admin/app-errors?hours=' + KC.errF.hours + '&count=1');
        if (r && Array.isArray(r.items)) { KC.errs = r; KC.errN = null; } else if (r && typeof r.newCount === 'number') KC.errN = r.newCount;
        errBadge();
      } catch {}
      return;
    }
    if (!quiet && !KC.errs) V.innerHTML = '<div class="card glass"><p class="mut">Caricamento…</p></div>';
    try { KC.errs = await kapi('GET', '/admin/app-errors?hours=' + KC.errF.hours); KC.errN = null; } catch (e) { if (!quiet) V.innerHTML = `<div class="card glass"><p class="mut">${esc(e.message)}</p></div>`; return; }
    errBadge();
    if (quiet && !V.classList.contains('on')) return;
    if (!quiet && KC.errs.newCount) { kapi('POST', '/admin/app-errors/seen').then(() => { KC.errs.newCount = 0; KC.errN = null; errBadge(); }).catch(() => {}); }
    errRender();
  }
  function errBadge() {
    const n = KC.errN != null ? KC.errN : (KC.errs && KC.errs.newCount) || 0, e = $('#nb_apperr');
    if (e) { e.textContent = n; e.classList.toggle('on', n > 0); }
  }
  function errRender() {
    const V = $('#v-apperr'), E = KC.errs, F = KC.errF;
    const q = F.q.toLowerCase().trim();
    // filtro per proprietario: tutti, i miei clienti, quelli di un singolo agente (reseller)
    const AG = D.agents || [], mineId = D.role === 'agent' ? +((D.me || {}).id || 0) : 0;
    if (F.ow !== '' && F.ow !== String(mineId) && !AG.some((a) => String(a.id) === F.ow)) F.ow = '';
    const base = F.ow === '' ? E.items : E.items.filter((x) => String(x.ownerId || 0) === F.ow);
    const nOf = (id) => E.items.filter((x) => (x.ownerId || 0) === id).length;
    const owSel = AG.length ? `<select class="inp" id="eOw" style="width:auto;margin:0" title="Di chi sono i clienti"><option value="" ${F.ow === '' ? 'selected' : ''}>Tutti i clienti (${E.items.length})</option><option value="${mineId}" ${F.ow === String(mineId) ? 'selected' : ''}>I miei clienti (${nOf(mineId)})</option>${AG.map((a) => `<option value="${a.id}" ${F.ow === String(a.id) ? 'selected' : ''}>Agente ${esc(a.username)} (${nOf(a.id)})</option>`).join('')}</select>` : '';
    const agOf = (id) => { if (!id || id === mineId) return ''; const a = AG.find((y) => y.id === id); return a ? a.username : 'agente #' + id; };
    const rank = (key) => { const mp = new Map(); for (const x of base) { const k = key(x); if (!k) continue; const o = mp.get(k) || { key: k, n: 0, unresolved: 0, devs: new Set(), titles: new Set() }; o.n++; if (x.outcome === 'non risolto') o.unresolved++; o.devs.add(x.deviceId); o.titles.add(x.title); mp.set(k, o); } return [...mp.values()].sort((a, b) => b.n - a.n).slice(0, 10).map((o) => ({ key: o.key, n: o.n, unresolved: o.unresolved, devices: o.devs.size, titles: o.titles.size })); };
    const topTitles = rank((x) => x.title), topDevices = rank((x) => x.deviceId).map((o) => { const x = base.find((i) => i.deviceId === o.key) || {}; return { ...o, name: x.name, code: x.code, model: x.model }; });
    const list = base.filter((x) => (!F.p || x.problem === F.p) && (!F.o || x.outcome === F.o) && (!q || [x.title, x.name, x.code, x.model, x.err, x.codec, agOf(x.ownerId)].join(' ').toLowerCase().includes(q)));
    const tot = base.length, fixed = base.filter((x) => x.outcome === 'risolto').length, unres = base.filter((x) => x.outcome === 'non risolto').length;
    const devs = new Set(base.map((x) => x.deviceId)).size;
    const card = (t, v, sub, col) => `<div class="card glass kc-kp"><small>${t}</small><b style="color:${col}">${v}</b><span>${sub}</span></div>`;
    V.innerHTML = `<div class="kc-k">${card('Problemi', tot, 'negli ultimi ' + (F.hours >= 168 ? '7 giorni' : F.hours >= 24 ? F.hours / 24 + ' giorni' : F.hours + ' ore'), 'var(--txt)')}${card('Risolti da soli', fixed, tot ? Math.round((fixed / tot) * 100) + '% dal recupero automatico' : 'recupero automatico', 'var(--ok)')}${card('Non risolti', unres, 'il cliente non ha potuto guardare', 'var(--bad)')}${card('Dispositivi coinvolti', devs, 'diversi', 'var(--a2)')}</div>
      <div class="g2b" style="grid-template-columns:minmax(0,2.4fr) minmax(260px,1fr)">
        <div class="card glass"><div class="hd" style="flex-wrap:wrap;gap:10px"><h3>Errori applicazione<small>Problemi della visione inviati dalle app 2.0.3 o successive: cosa è successo e cosa ha fatto l'app da sola</small></h3>
          <div style="display:flex;gap:8px;flex-wrap:wrap">${owSel}<select class="inp" id="eH" style="width:auto;margin:0">${[[1, 'Ultima ora'], [24, 'Ultime 24 ore'], [72, 'Ultimi 3 giorni'], [168, 'Ultimi 7 giorni']].map(([h, l]) => `<option value="${h}" ${F.hours === h ? 'selected' : ''}>${l}</option>`).join('')}</select><button class="btn sm" id="eR">Aggiorna</button>${tot ? '<button class="btn sm danger" id="eClr">Svuota</button>' : ''}</div></div>
          <div class="kc-ef"><input class="inp" id="eQ" placeholder="Cerca cliente, codice, canale, modello, codec…" value="${esc(F.q)}">
            <div class="filters" style="margin:0">${[['', 'Tutti'], ['freeze', 'Immagine ferma'], ['stall', 'Caricamento'], ['error', 'Errori']].map(([k, l]) => `<button class="fchip ${F.p === k ? 'on' : ''}" data-ep="${k}">${l}<span>${base.filter((x) => !k || x.problem === k).length}</span></button>`).join('')}</div>
            <div class="filters" style="margin:0">${[['', 'Ogni esito'], ['risolto', 'Risolti'], ['non risolto', 'Non risolti']].map(([k, l]) => `<button class="fchip ${F.o === k ? 'on' : ''}" data-eo="${k}">${l}</button>`).join('')}</div></div>
          ${list.length ? list.slice(0, 300).map((x) => `<div class="kc-err ${x.outcome === 'non risolto' ? 'bad' : ''}">
            <div class="ei">${(PROB[x.problem] || PROB.error)[1]}</div>
            <div class="eb"><b>${esc((PROB[x.problem] || PROB.error)[0])}</b> <span class="kc-tag ${(OUTC[x.outcome] || OUTC[''])[1]}">${esc((OUTC[x.outcome] || OUTC[''])[0])}</span>${x.action ? `<span class="kc-tag" title="Cosa ha fatto l'app">🛠 ${esc(x.action)}</span>` : ''}
              <div class="et">${x.kind === 'live' ? '📺' : '🎬'} ${esc(x.title || '—')}${x.variant ? ' <span class="mut">(versione ' + esc(x.variant) + ')</span>' : ''}</div>
              <small>${esc(x.name || 'Dispositivo')} · <span class="mono">${esc(x.code)}</span>${agOf(x.ownerId) ? ` · <b>agente ${esc(agOf(x.ownerId))}</b>` : ''} · ${esc(x.model || '')}${x.ver ? ' · app ' + esc(x.ver) : ''}</small>
              <small class="mono">${[x.engine === 'vlc' ? 'VLC' : x.engine ? 'ExoPlayer' : '', x.codec, x.dec === 'sw' ? 'software' : x.dec === 'hw' ? 'hardware' : '', x.res, x.err].filter(Boolean).map(esc).join(' · ')}</small></div>
            <div class="ew"><span>${ago(x.t)}</span>${x.deviceId ? `<button class="btn sm" data-eopen="${esc(x.deviceId)}">Scheda</button>` : ''}</div></div>`).join('') : `<p class="mut" style="padding:10px 0">${tot ? 'Nessun problema con questi filtri.' : 'Nessun problema registrato: le app non hanno avuto blocchi né errori (o non sono ancora alla 2.0.3).'}</p>`}
          ${list.length > 300 ? `<p class="mut">Mostrati i 300 più recenti su ${list.length}: usa la ricerca per restringere.</p>` : ''}
        </div>
        <div>
          <div class="card glass"><div class="hd"><h3>Contenuti con più problemi<small>Se un canale ha problemi su tanti dispositivi diversi, il guasto è del canale o del server</small></h3></div>
            ${topTitles.length ? topTitles.map((t) => `<div class="kc-erank" data-eq="${esc(t.key)}"><span>${esc(t.key)}<small>${t.devices} dispositiv${t.devices === 1 ? 'o' : 'i'}${t.unresolved ? ` · <b style="color:var(--bad)">${t.unresolved} non risolti</b>` : ''}</small></span><b>${t.n}</b>${t.devices >= 2 ? '<i class="kc-tag warn">canale</i>' : ''}</div>`).join('') : '<p class="mut">—</p>'}</div>
          <div class="card glass" style="margin-top:14px"><div class="hd"><h3>Dispositivi con più problemi<small>Molti problemi su canali diversi = limite del dispositivo o della sua linea</small></h3></div>
            ${topDevices.length ? topDevices.map((t) => `<div class="kc-erank" data-eq="${esc(t.code || '')}"><span>${esc(t.name || t.code || 'Dispositivo')}<small><span class="mono">${esc(t.code || '')}</span> · ${esc(t.model || '')} · ${t.titles} contenut${t.titles === 1 ? 'o' : 'i'}</small></span><b>${t.n}</b>${t.titles >= 3 ? '<i class="kc-tag bad">dispositivo</i>' : ''}</div>`).join('') : '<p class="mut">—</p>'}</div>
        </div>
      </div>`;
    $('#eR').onclick = () => errLoad();
    $('#eH').onchange = (e) => { F.hours = +e.target.value; errLoad(); };
    $('#eOw') && ($('#eOw').onchange = (e) => { F.ow = e.target.value; errRender(); });
    const qi = $('#eQ'); qi.oninput = () => { F.q = qi.value; const pos = qi.selectionStart; errRender(); const n = $('#eQ'); n.focus(); n.setSelectionRange(pos, pos); };
    $$('[data-ep]', V).forEach((b) => (b.onclick = () => { F.p = b.dataset.ep; errRender(); }));
    $$('[data-eo]', V).forEach((b) => (b.onclick = () => { F.o = b.dataset.eo; errRender(); }));
    $$('[data-eq]', V).forEach((b) => (b.onclick = () => { F.q = b.dataset.eq; errRender(); }));
    $$('[data-eopen]', V).forEach((b) => (b.onclick = () => { const d = D.devices.find((x) => x.id === b.dataset.eopen); d ? openQuick(d) : toast('Dispositivo non trovato', 1); }));
    const c = $('#eClr'); if (c) c.onclick = async () => { if (!(await askDanger('Svuotare gli errori?', 'Tutti gli errori registrati verranno cancellati. Quelli nuovi continueranno ad arrivare.', 'SVUOTA', 'Svuota', false))) return; try { await kapi('DELETE', '/admin/app-errors'); errLoad(); } catch (e) { toast(e.message, 1); } };
  }

  /* ---------- Buffering: dove si blocca la visione (canale, pannello/server, cliente, ora) ---------- */
  const PANEL_N = { wolf: 'WOLF', armada: 'Armada', storm: 'Storm', atx: 'Atlantix', ro: 'Realott', slt: 'SLT', orcp: 'MirkoTeam', mxp: 'MaxPlayer', oxp: 'OrbixPlay', ora: 'ORA' };
  KC.buffH = 168;
  async function buffLoad() {
    const V = $('#v-buff');
    if (!KC.errs) V.innerHTML = '<div class="card glass"><p class="mut">Caricamento…</p></div>';
    try {
      if (!KC.errs || KC.errF.hours !== KC.buffH) { KC.errF.hours = KC.buffH; KC.errs = await kapi('GET', '/admin/app-errors?hours=' + KC.buffH); KC.errN = null; errBadge(); }
    } catch (e) { V.innerHTML = `<div class="card glass"><p class="mut">${esc(e.message)}</p></div>`; return; }
    buffRender();
  }
  function buffRender() {
    const V = $('#v-buff'), E = KC.errs || { items: [] };
    const all = E.items.filter((x) => x.problem === 'stall' || x.problem === 'freeze');
    const devs = new Set(all.map((x) => x.deviceId)), fixed = all.filter((x) => x.outcome === 'risolto').length;
    const hourOf = (t) => +new Date(t).toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Europe/Rome' }) % 24;
    const H = Array(24).fill(0); for (const x of all) H[hourOf(x.t)]++;
    const hmax = Math.max(1, ...H), peak = H.indexOf(Math.max(...H));
    const grp = (key) => { const mp = new Map(); for (const x of all) { const k = key(x); if (!k) continue; const o = mp.get(k) || { key: k, n: 0, devs: new Set(), titles: new Set(), x }; o.n++; o.devs.add(x.deviceId); o.titles.add(x.title); mp.set(k, o); } return [...mp.values()].sort((a, b) => b.n - a.n); };
    const srvOf = (x) => !x.srv ? '' : x.srv.split(',').map((s) => { const [src, name, host] = s.split('|'); return (PANEL_N[src] || src || 'Linea') + (name || host ? ' · ' + (name || String(host).replace(/^https?:\/\//, '')) : ''); }).join(', ');
    const chans = grp((x) => x.title).slice(0, 12), srvs = D.role === 'agent' ? [] : grp(srvOf).slice(0, 10), clients = grp((x) => x.deviceId).slice(0, 15);
    const pct = (n) => (all.length ? Math.round(n / all.length * 100) : 0);
    const verdictC = (o) => o.devs.size >= 3 ? ['canale o server', 'bad'] : o.devs.size === 2 ? ['da osservare', ''] : ['un solo cliente', 'ok'];
    const verdictD = (o) => { const x = o.x, many = o.titles.size >= 3, weak = x.net === 'wifi' && x.rssi && x.rssi < -70, slow = (x.speedDl && x.speedDl < 8) || x.line === 'weak'; if (many && (weak || slow)) return ['rete del cliente', 'bad']; if (many) return ['probabile rete del cliente', '']; return ['canale o server', 'ok']; };
    const netL = (x) => [NET_L[x.net] || '', x.net === 'wifi' && x.rssi ? bars(x.rssi) : '', x.speedDl ? mbps(x.speedDl) : '', x.vpn === 'on' ? 'VPN accesa' : x.vpn === 'off' ? 'VPN spenta' : ''].filter(Boolean).join(' · ');
    const card = (t, v, sub, col) => `<div class="card glass kc-kp"><small>${t}</small><b style="color:${col}">${v}</b><span>${sub}</span></div>`;
    const per = KC.buffH >= 168 ? '7 giorni' : KC.buffH >= 24 ? KC.buffH / 24 + ' giorni' : KC.buffH + ' ore';
    const cl = (n) => `${n} client${n === 1 ? 'e' : 'i'}`;
    V.innerHTML = `<div class="kc-k">${card('Blocchi', all.length, 'negli ultimi ' + per, 'var(--txt)')}${card('Clienti coinvolti', devs.size, D.devices ? 'su ' + D.devices.length : '', 'var(--txt)')}${card('Risolti da soli', all.length ? pct(fixed) + '%' : '—', 'dall\'app, senza intervento', '#2ecc71')}${card('Ora di punta', all.length ? peak + ':00' : '—', 'quando si blocca di più', '#f5a623')}</div>
      <div class="card glass"><div class="hd" style="flex-wrap:wrap;gap:10px"><h3>Buffering<small>Blocchi («caricamento continuo») e immagine ferma segnalati dalle app: capisci se è il canale, il server o la rete del cliente</small></h3>
        <div style="display:flex;gap:8px"><select class="inp" id="bH" style="width:auto;margin:0">${[[24, 'Ultime 24 ore'], [72, 'Ultimi 3 giorni'], [168, 'Ultimi 7 giorni']].map(([h, l]) => `<option value="${h}" ${KC.buffH === h ? 'selected' : ''}>${l}</option>`).join('')}</select><button class="btn sm" id="bR">Aggiorna</button></div></div>
        ${all.length ? `<div class="mut" style="font-size:12.5px;margin-bottom:6px">Quando si blocca (ora italiana)</div>
          <div style="display:grid;grid-template-columns:repeat(24,1fr);gap:3px;align-items:end;height:70px">${H.map((n, h) => `<div title="${h}:00 · ${n} blocchi" style="background:${n === hmax ? '#e0524f' : '#2f7fd6'};opacity:${n ? 1 : .18};height:${Math.max(4, Math.round(n / hmax * 64))}px;border-radius:3px"></div>`).join('')}</div>
          <div style="display:grid;grid-template-columns:repeat(24,1fr);gap:3px;font-size:10px;color:#9aa4b2;margin-top:3px">${H.map((_, h) => `<div style="text-align:center">${h % 3 === 0 ? h : ''}</div>`).join('')}</div>` : '<p class="mut">Nessun blocco nel periodo: le app non hanno segnalato buffering.</p>'}
      </div>
      <div class="g2b" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr));margin-top:14px">
        <div class="card glass"><div class="hd"><h3>Canali<small>Tanti clienti diversi sullo stesso canale = problema del canale o del server</small></h3></div>
          ${chans.length ? chans.map((o) => { const [v, c] = verdictC(o); return `<div class="kc-erank"><span>${esc(o.key)}<small>${o.n} blocchi · ${cl(o.devs.size)} · ${pct(o.n)}%</small></span><span class="kc-tag ${c}" style="white-space:nowrap;flex:none">${v}</span></div>`; }).join('') : '<p class="mut">—</p>'}</div>
        ${D.role === 'agent' ? '' : `<div class="card glass"><div class="hd"><h3>Pannelli e server<small>Dalle linee collegate ai clienti: se un server concentra i blocchi, cambia DNS o pannello a quei clienti</small></h3></div>
          ${srvs.length ? srvs.map((o) => `<div class="kc-erank"><span>${esc(o.key)}<small>${o.n} blocchi · ${cl(o.devs.size)} · ${o.titles.size} canal${o.titles.size === 1 ? 'e' : 'i'}</small></span><b>${pct(o.n)}%</b></div>`).join('') : '<p class="mut">Nessun blocco su clienti con una linea collegata in KAIROS: collega le linee dai Pannelli IPTV per vedere qui il server.</p>'}</div>`}
        <div class="card glass"><div class="hd"><h3>Clienti<small>Blocchi su tanti canali diversi = rete o dispositivo del cliente: VPN o Wi-Fi migliore</small></h3></div>
          ${clients.length ? clients.map((o) => { const x = o.x, [v, c] = verdictD(o); return `<div class="kc-erank"><span>${esc(x.name || x.code || 'Dispositivo')} <span class="mono">${esc(x.code || '')}</span><small>${o.n} blocchi · ${o.titles.size} canal${o.titles.size === 1 ? 'e' : 'i'} · ${esc(x.model || '')}${netL(x) ? '<br>' + netL(x) : ''}</small></span><span style="display:flex;flex-direction:column;gap:6px;align-items:flex-end;flex:none"><span class="kc-tag ${c}" style="white-space:nowrap">${v}</span>${x.deviceId ? `<button class="btn sm" data-bopen="${esc(x.deviceId)}">Scheda</button>` : ''}</span></div>`; }).join('') : '<p class="mut">—</p>'}</div>
      </div>`;
    $('#bH').onchange = (e) => { KC.buffH = +e.target.value; buffLoad(); };
    $('#bR').onclick = () => { KC.errs = null; buffLoad(); };
    $$('[data-bopen]', V).forEach((b) => (b.onclick = () => { const d = D.devices.find((x) => x.id === b.dataset.bopen); d ? openQuick(d) : toast('Dispositivo non trovato', 1); }));
  }

  /* ---------- Segnalazioni e Richieste contenuti ---------- */
  const RS = { new: ['Nuova', 'pending'], seen: ['Vista', 'active'], done: ['Fatta', 'active'] };
  const CT = { movie: '🎬 Film', series: '🎞 Serie TV', live: '📺 Canale', addon: '🧩 Add-on', '': '' };
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
    $$('[data-ro]', V).forEach((b) => (b.onclick = () => { const d = D.devices.find((x) => x.id === b.dataset.ro); d ? openQuick(d) : toast('Dispositivo non trovato', 1); }));
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
  const pollReq = () => (document.hidden || !document.querySelector('#app.on') ? Promise.resolve() : Promise.all([reqLoad('report', true), reqLoad('content', true), errLoad(true)]).catch(() => {}));

  /* ---------- Videoteca ---------- */
  async function vodInit() {
    const V = $('#v-vod'), C = KC.cat;
    if (!KC.srcs) {
      V.innerHTML = '<div class="card glass"><p class="mut">Caricamento delle sorgenti…</p></div>';
      try { KC.srcs = await kapi('GET', '/admin/catalog/sources'); } catch (e) { V.innerHTML = `<div class="card glass"><p class="mut">${esc(e.message)}</p></div>`; return; }
      if (!C.src && KC.srcs.length) C.src = KC.srcs[0].key;
    }
    if (!KC.srcs.length) { V.innerHTML = '<div class="card glass"><p class="mut">La videoteca legge film e serie dai server Xtream assegnati ai tuoi clienti: assegna almeno una playlist Xtream per vederla qui.</p></div>'; return; }
    V.innerHTML = `<div class="card glass"><div class="hd" style="flex-wrap:wrap;gap:10px"><h3>Videoteca<small>Canali live, film e serie disponibili sul server scelto</small></h3>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><select class="inp" id="vSrc" style="width:auto;margin:0">${KC.srcs.map((s) => `<option value="${esc(s.key)}" ${s.key === C.src ? 'selected' : ''}>${esc(s.label)} (${s.devices})</option>`).join('')}</select>
      <button class="btn sm" id="vChk">🩺 Controlla tutte le linee</button>
      <div class="seg" id="vKind"><button data-k="live" class="${C.kind === 'live' ? 'on' : ''}">Canali live</button><button data-k="movies" class="${C.kind === 'movies' ? 'on' : ''}">Film</button><button data-k="series" class="${C.kind === 'series' ? 'on' : ''}">Serie TV</button></div>
      <input class="inp" id="vQ" placeholder="Cerca un titolo…" style="width:220px;margin:0" value="${esc(C.q)}"></div></div>
      <div class="kc-vc"><div class="kc-cats" id="vCats"></div><div><div class="mut" id="vInfo" style="font-size:13px;margin-bottom:10px"></div><div class="kc-vgrid" id="vGrid"></div><div style="display:flex;gap:8px;justify-content:center;margin-top:16px" id="vPg"></div></div></div></div>`;
    $('#vSrc').onchange = (e) => { C.src = e.target.value; C.cat = ''; C.page = 1; vodLoad(); };
    $('#vChk').onclick = () => vodCheck();
    $$('#vKind [data-k]').forEach((b) => (b.onclick = () => { C.kind = b.dataset.k; C.cat = ''; C.page = 1; $$('#vKind button').forEach((x) => x.classList.toggle('on', x === b)); vodLoad(); }));
    let qt; $('#vQ').oninput = (e) => { clearTimeout(qt); qt = setTimeout(() => { C.q = e.target.value.trim(); C.page = 1; vodLoad(); }, 350); };
    vodLoad();
  }
  async function vodCheck(fresh = false) {
    let ov = $('#kcCheck');
    if (!ov) {
      ov = document.createElement('div'); ov.id = 'kcCheck'; ov.className = 'kc-det'; document.body.appendChild(ov);
      ov.onclick = (e) => { if (e.target === ov || e.target.closest('[data-close]')) ov.classList.remove('on'); };
    }
    const render = (body) => {
      ov.innerHTML = `<div class="kc-det-box"><div class="kc-check-head"><b>🩺 Controlla tutte le linee</b><button class="btn sm" data-close>✕</button></div><div class="kc-check-body">${body}</div></div>`;
      ov.classList.add('on');
    };
    render('<p class="mut">Controllo in corso… (può servire fino a un minuto)</p>');
    let rows;
    try {
      rows = await kapi('GET', `/admin/catalog/check${fresh ? '?fresh=1' : ''}`);
      if (rows.error) throw new Error(rows.error);
    } catch (e) {
      if (!ov.classList.contains('on')) return;
      render(`<div class="kc-check-top"><span style="color:#ff8f8f">${esc(e.message)}</span><button class="btn sm" id="vChkFresh">Ricontrolla</button></div>`);
      $('#vChkFresh').onclick = () => { ov.classList.remove('on'); vodCheck(true); };
      return;
    }
    if (!ov.classList.contains('on')) return;
    const count = (status) => rows.filter((x) => x.status === status).length;
    const summary = [`${rows.length} linee`, `${count('ok')} attive`, `${count('expired')} scadute`,
      count('timeout') ? `${count('timeout')} server non risponde` : '',
      count('down') ? `${count('down')} server non raggiungibile` : '',
      count('auth') ? `${count('auth')} utente o password errati` : '',
      count('disabled') ? `${count('disabled')} disattivate` : '',
      count('http') ? `${count('http')} errori HTTP` : '',
    ].filter(Boolean).join(' · ');
    const state = (row) => ({
      ok: ['Attiva', '#6ee3a6'],
      expired: ['Scaduta', '#ff8f8f'],
      disabled: ['Disattivata', '#9aa2ad'],
      auth: ['Utente o password errati', '#ff8f8f'],
      timeout: ['Il server non risponde', '#ecc06f'],
      down: ['Server non raggiungibile', '#ecc06f'],
      http: [`Errore ${row.code || ''}`.trim(), '#ecc06f'],
    }[row.status] || ['Server non raggiungibile', '#ecc06f']);
    const ordered = rows.slice().sort((a, b) => (a.status === 'ok') - (b.status === 'ok') || (a.exp || Number.MAX_SAFE_INTEGER) - (b.exp || Number.MAX_SAFE_INTEGER));
    const showAgents = D.role === 'owner';
    render(`<div class="kc-check-top"><b class="kc-check-summary">${esc(summary)}</b><button class="btn sm" id="vChkFresh">Ricontrolla</button></div>
      <div class="kc-check-table-wrap"><table class="kc-check-table"><thead><tr><th>Linea</th>${showAgents ? '<th>Agente</th>' : ''}<th>Clienti</th><th>Stato</th><th>Scadenza</th></tr></thead><tbody>${ordered.map((x) => {
        const [label, color] = state(x), exp = x.exp ? new Date(x.exp).toLocaleDateString('it-IT') : '—';
        return `<tr data-src="${esc(x.key)}"><td>${esc(x.label)}</td>${showAgents ? `<td>${esc((x.agents || []).join(', ') || '—')}</td>` : ''}<td>${+x.devices || 0}</td><td style="color:${color};font-weight:700">${esc(label)}</td><td>${exp}</td></tr>`;
      }).join('')}</tbody></table></div>`);
    $('#vChkFresh').onclick = () => { ov.classList.remove('on'); vodCheck(true); };
    $$('#kcCheck [data-src]').forEach((row) => (row.onclick = () => {
      KC.cat.src = row.dataset.src; KC.cat.cat = ''; KC.cat.page = 1;
      if ($('#vSrc')) $('#vSrc').value = KC.cat.src;
      ov.classList.remove('on'); vodLoad();
    }));
  }
  async function vodLoad() {
    const C = KC.cat;
    $('#vInfo').textContent = 'Caricamento… (la prima volta può servire fino a un minuto)';
    const vodError = (message) => {
      $('#vCats').innerHTML = ''; $('#vGrid').innerHTML = ''; $('#vPg').innerHTML = '';
      $('#vInfo').innerHTML = `${esc(message)} <button class="btn sm" id="vRetry">Riprova</button>`;
      $('#vRetry').onclick = () => vodLoad();
    };
    let r;
    try { r = await kapi('GET', `/admin/catalog?src=${encodeURIComponent(C.src)}&kind=${C.kind}&cat=${encodeURIComponent(C.cat)}&q=${encodeURIComponent(C.q)}&page=${C.page}`); } catch (e) { vodError(e.message); return; }
    if (r.error) { vodError(r.error); return; }
    $('#vCats').innerHTML = `<button class="${!C.cat ? 'on' : ''}" data-c="">Tutte<small>${r.cats.reduce((a, c) => a + c.n, 0)}</small></button>` + r.cats.map((c) => `<button class="${C.cat === c.id ? 'on' : ''}" data-c="${esc(c.id)}">${esc(c.name)}<small>${c.n}</small></button>`).join('');
    $$('#vCats [data-c]').forEach((b) => (b.onclick = () => { C.cat = b.dataset.c; C.page = 1; vodLoad(); }));
    $('#vInfo').textContent = `${r.total.toLocaleString('it-IT')} ${C.kind === 'series' ? 'serie' : C.kind === 'live' ? 'canali' : 'film'}${C.q ? ' per «' + C.q + '»' : ''} · pagina ${r.page} di ${r.pages}`;
    const live = C.kind === 'live';
    $('#vGrid').innerHTML = r.items.map((x) => `<div class="kc-post${live ? ' kc-ch' : ''}" data-vid="${esc(x.id)}" title="Apri la scheda">${x.poster ? `<img loading="lazy" src="${esc(x.poster)}" referrerpolicy="no-referrer">` : ''}${live ? (x.num ? `<span class="rt">${x.num}</span>` : '') + (x.archive ? `<span class="rt ar">⏪ ${x.archive}g</span>` : '') : x.rating ? `<span class="rt">★ ${(+x.rating).toFixed(1)}</span>` : ''}<div>${esc(x.name)}<small>${esc([x.year, x.catName].filter(Boolean).join(' · '))}</small></div></div>`).join('') || `<p class="mut">${live ? 'Nessun canale.' : 'Nessun titolo.'}</p>`;
    document.querySelectorAll('#vGrid img').forEach((im) => im.addEventListener('error', () => im.remove(), { once: true }));
    $$('#vGrid [data-vid]').forEach((el) => (el.onclick = () => vodInfo(el.dataset.vid, r.items.find((x) => String(x.id) === el.dataset.vid))));
    $('#vPg').innerHTML = r.pages > 1 ? `<button class="btn sm" data-p="${r.page - 1}" ${r.page <= 1 ? 'disabled' : ''}>‹ Indietro</button><button class="btn sm" data-p="${r.page + 1}" ${r.page >= r.pages ? 'disabled' : ''}>Avanti ›</button>` : '';
    $$('#vPg [data-p]').forEach((b) => (b.onclick = () => { C.page = +b.dataset.p; vodLoad(); $('#v-vod').scrollIntoView({ behavior: 'smooth' }); }));
  }

  /* ---------- Videoteca: scheda del titolo (trama/cast, stagioni ed episodi, EPG) ---------- */
  const vTime = (t) => (t ? new Date(t).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : '');
  const vDay = (t) => (t ? new Date(t).toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: '2-digit' }) : '');
  async function vodInfo(id, item) {
    const C = KC.cat, kind = C.kind, name = (item && item.name) || '';
    let ov = $('#kcDet'); if (!ov) { ov = document.createElement('div'); ov.id = 'kcDet'; ov.className = 'kc-det'; document.body.appendChild(ov); ov.onclick = (e) => { if (e.target === ov || e.target.closest('[data-close]')) ov.classList.remove('on'); }; }
    const shell = (body) => `<div class="kc-det-box"><button class="btn sm" data-close style="position:absolute;top:10px;right:10px;z-index:2">✕</button>${body}</div>`;
    ov.innerHTML = shell(`<div style="padding:26px"><b style="font-size:17px">${esc(name)}</b><p class="mut" style="margin-top:8px">Carico la scheda dal server…</p></div>`); ov.classList.add('on');
    let d;
    try { d = await kapi('GET', `/admin/catalog/info?src=${encodeURIComponent(C.src)}&kind=${kind}&id=${encodeURIComponent(id)}`); } catch (e) { ov.innerHTML = shell(`<div style="padding:26px"><b>${esc(name)}</b><p style="color:#ff8f8f;margin-top:8px">${esc(e.message)}</p></div>`); return; }
    if (d.error) { ov.innerHTML = shell(`<div style="padding:26px"><b>${esc(name)}</b><p style="color:#ff8f8f;margin-top:8px">${esc(d.error)}</p></div>`); return; }
    const chips = (arr, lbl) => (arr && arr.length ? `<div class="kc-det-row"><span class="k">${lbl}</span><span>${arr.map((x) => `<span class="kc-chip">${esc(x)}</span>`).join('')}</span></div>` : '');
    const row = (lbl, v) => (v ? `<div class="kc-det-row"><span class="k">${lbl}</span><span>${esc(v)}</span></div>` : '');
    const poster = d.poster || (item && item.poster) || '';
    const head = (sub) => `<div class="kc-det-head"${d.backdrop ? ` style="background-image:linear-gradient(rgba(12,14,20,.55),rgba(12,14,20,.97)),url('${esc(d.backdrop)}')"` : ''}>${poster ? `<img src="${esc(poster)}" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}<div><b style="font-size:19px;line-height:1.2">${esc(d.title || name)}</b><div class="mut" style="font-size:13px;margin-top:6px">${esc(sub)}</div></div></div>`;
    if (kind === 'live') {
      const now = Date.now(), L = d.epg || [];
      ov.innerHTML = shell(head(`${item && item.catName ? item.catName + ' · ' : ''}${L.length ? 'Guida programmi (EPG)' : 'Il server non dà l\'EPG per questo canale'}`) + `<div class="kc-epg">${L.map((e) => { const on = e.start <= now && e.end > now, pct = on ? Math.round(((now - e.start) / Math.max(1, e.end - e.start)) * 100) : 0; return `<div class="kc-epg-i${on ? ' on' : ''}"><div class="t">${vTime(e.start)}<small>${vDay(e.start)}</small></div><div><b>${esc(e.title)}</b>${on ? `<span class="kc-chip live">In onda · ${pct}%</span>` : ''}${e.desc ? `<p>${esc(e.desc)}</p>` : ''}</div></div>`; }).join('') || '<p class="mut" style="padding:16px 26px">Nessun programma in guida.</p>'}</div>`);
      return;
    }
    const meta = [d.date ? d.date.slice(0, 4) : '', d.genre, d.duration, d.rating ? '★ ' + (+d.rating).toFixed(1) : '', d.country].filter(Boolean).join(' · ');
    const common = `<div class="kc-det-body">${d.plot ? `<p class="kc-plot">${esc(d.plot)}</p>` : '<p class="mut">Il server non ha la trama di questo titolo.</p>'}${chips(d.cast, 'Cast')}${chips(d.director, 'Regia')}${row('Genere', d.genre)}${row('Uscita', d.date)}${d.trailer ? `<div class="kc-det-row"><span class="k">Trailer</span><a href="https://www.youtube.com/watch?v=${esc(d.trailer)}" target="_blank" rel="noopener">YouTube ↗</a></div>` : ''}</div>`;
    if (kind === 'movies') { ov.innerHTML = shell(head(meta) + common); return; }
    const S = d.seasons || []; let cur = S.length ? S[0].num : 0;
    const draw = () => {
      const sea = S.find((x) => x.num === cur) || S[0];
      ov.innerHTML = shell(head(`${meta}${S.length ? (meta ? ' · ' : '') + S.length + (S.length === 1 ? ' stagione' : ' stagioni') + ' · ' + S.reduce((a, x) => a + x.episodes.length, 0) + ' episodi' : ''}`) + common +
        (S.length ? `<div class="kc-seasons">${S.map((x) => `<button class="btn sm${x.num === cur ? ' pri' : ''}" data-sea="${x.num}">${esc(x.name)}<small> ${x.episodes.length}</small></button>`).join('')}</div>
        <div class="kc-eps">${(sea ? sea.episodes : []).map((e) => `<div class="kc-ep">${e.image ? `<img loading="lazy" src="${esc(e.image)}" referrerpolicy="no-referrer" onerror="this.remove()">` : '<span class="kc-ep-n">' + e.num + '</span>'}<div><b>${e.num ? e.num + '. ' : ''}${esc(e.title || 'Episodio ' + e.num)}</b><small class="mut">${[e.date, e.duration, e.rating ? '★ ' + (+e.rating).toFixed(1) : ''].filter(Boolean).join(' · ')}</small>${e.plot ? `<p>${esc(e.plot)}</p>` : ''}</div></div>`).join('') || '<p class="mut">Nessun episodio in questa stagione.</p>'}</div>` : '<p class="mut" style="padding:0 26px 20px">Il server non elenca gli episodi di questa serie.</p>'));
      $$('#kcDet [data-sea]').forEach((b) => (b.onclick = () => { cur = +b.dataset.sea; draw(); }));
    };
    draw();
  }

  /* ---------- Server DNS e VPN ---------- */
  async function dnsLoad() {
    const V = $('#v-dns');
    let dd;
    try { [dd, KC.vpnLocs] = await Promise.all([kapi('GET', '/admin/dns'), kapi('GET', '/admin/vpn-locs')]); } catch (e) { V.innerHTML = `<div class="card glass"><p class="mut">${esc(e.message)}</p></div>`; return; }
    KC.dns = dd;
    const W = (KC.dnsW = KC.dnsW || { from: '', sel: new Set(), to: '', other: '', q: '', apps: new Set() });
    const selectedApps = W.apps instanceof Set ? [...W.apps] : [];
    const hosts = dd.hosts, byDev = dd.byDev || {};
    const dnsKey = (h) => String(h || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '').toLowerCase();
    if (W.from && W.from !== '*' && !hosts.some((h) => h.host === W.from)) W.from = '';
    if (!W.from) W.from = (hosts.find((h) => h.devices) || { host: '*' }).host;
    const devs = D.devices.filter((d) => !d.parent && (byDev[d.id] || []).length);
    const appNames = { tv: 'Kairos Pro', ktv: 'Kairos TV', xc: 'Kairos XC', lite: 'Kairos Lite', prem: 'Kairos Premium', plus: 'Kairos Plus', nova: 'Kairos Nova', pro: 'Kairos Pro' };
    const appKey = (d) => String(d.app || '').trim().toLowerCase();
    const appLabel = (app) => appNames[app] || (app ? app.replace(/[_-]+/g, ' ').replace(/\b[a-z]/g, (x) => x.toUpperCase()) : 'Non rilevata');
    const appLabels = new Set([...Object.values(appNames), 'Non rilevata']);
    W.apps = new Set(selectedApps.map((app) => {
      const value = String(app).trim();
      return appLabels.has(value) ? value : appLabel(value.toLowerCase());
    }));
    const appOrder = ['Kairos Pro', 'Kairos TV', 'Kairos XC', 'Kairos Lite', 'Kairos Premium', 'Kairos Plus'];
    const appSortOrder = [...appOrder, 'Kairos Nova'];
    const sortApps = (a, b) => (appSortOrder.indexOf(a) < 0 ? appSortOrder.length : appSortOrder.indexOf(a)) - (appSortOrder.indexOf(b) < 0 ? appSortOrder.length : appSortOrder.indexOf(b)) || a.localeCompare(b, 'it');
    const label = (h) => { const x = hosts.find((y) => y.host === h); return x && x.name ? `${x.name} · ${h}` : h; };
    const nm = (x) => x.name || (x.code || '');
    V.innerHTML = `
      <div class="card glass kc-dnsl"><div class="hd"><h3>I tuoi DNS e i server di riserva<small>Aggiungi i DNS dei tuoi pannelli e scegli per ciascuno una riserva: l'app Kairos XC passa da sola alla riserva se il server si blocca.</small></h3></div>
        <div class="kc-dns-add"><input class="inp" id="dnN" aria-label="Nome" placeholder="Nome, es. WOLF principale" maxlength="40"><input class="inp mono" id="dnH" aria-label="Indirizzo" placeholder="Indirizzo, es. http://server:porta"><select class="inp" id="dnReserve" aria-label="Riserva di…"><option value="">Riserva di… (facoltativa)</option>${dd.saved.map((x) => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('')}</select><button class="btn pri" id="dnAdd">+ Aggiungi DNS</button></div>
        <div class="kc-dns-table">
          <div class="kc-dns-row head"><span>Nome</span><span>Indirizzo</span><span>Clienti</span><span>Riserve</span><span>Modalità</span><span>Stato</span><span></span></div>
          ${dd.saved.map((x) => {
            const h = hosts.find((y) => y.savedId === x.id) || { host: x.host, devices: 0 };
            const altNames = (x.alts || []).map((id) => dd.saved.find((y) => y.id === id)).filter(Boolean).map((y) => y.name);
            const modeName = x.mode === 'main' ? 'Sempre il principale' : x.mode === 'alt' ? 'Sempre la riserva' : x.mode === 'rot' ? 'Rotazione per dispositivo' : 'Automatico';
            const saturated = (dd.sat || []).find((y) => dnsKey(y.host) === dnsKey(x.host));
            const until = saturated ? new Date(saturated.until).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : '';
            return `<div class="kc-dns-row">
              <span class="kc-dns-cell" data-label="Nome"><b>${esc(x.name)}</b></span>
              <span class="kc-dns-cell" data-label="Indirizzo"><span class="mono">${esc(x.host)}</span></span>
              <span class="kc-dns-cell" data-label="Clienti">${h.devices || 0}</span>
              <span class="kc-dns-cell" data-label="Riserve">${altNames.length ? esc(altNames.join(', ')) : '—'}</span>
              <span class="kc-dns-cell" data-label="Modalità">${modeName}</span>
              <span class="kc-dns-cell" data-label="Stato"><span class="${saturated ? 'status-sat' : 'mut'}">${saturated ? `⚠ saturo fino alle ${until}` : '✓ ok'}</span></span>
              <span class="kc-dns-cell kc-dns-actions" data-label="Azioni">${h.devices ? `<button class="btn sm pri" data-dfrom="${esc(x.host)}">Cambia DNS…</button>` : ''}<button class="btn sm" data-dedit="${esc(x.id)}">Modifica</button><button class="icb" title="Elimina" aria-label="Elimina" data-ddel="${esc(x.id)}">✕</button></span>
            </div>`;
          }).join('') || '<p class="mut" style="padding:12px">Nessun DNS salvato.</p>'}
        </div>
        ${hosts.filter((h) => !h.savedId).length ? `<div class="kc-dns-other"><h4>DNS usati dai clienti ma non salvati</h4>${hosts.filter((h) => !h.savedId).map((h) => `<div class="kc-dns-unsaved"><div><b>Non salvato</b><span class="mono">${esc(h.host)}</span><small class="mut">${h.devices || 0} ${h.devices === 1 ? 'cliente' : 'clienti'}</small></div><button class="btn sm" data-dsave="${esc(h.host)}">Salva</button></div>`).join('')}</div>` : ''}
      </div>
      <div class="card glass kc-wiz"><div class="hd"><h3>Cambia DNS ai clienti<small>Cambia solo l'indirizzo del server: <b>nome utente, password e playlist restano uguali</b>. Le app si aggiornano da sole entro un minuto, senza ricaricare la lista.</small></h3></div>
        <div class="kc-step"><i>1</i><div><b>Quale DNS vuoi sostituire?</b>
          <select class="inp" id="wFrom">${hosts.filter((h) => h.devices).map((h) => `<option value="${esc(h.host)}" ${W.from === h.host ? 'selected' : ''}>${esc(label(h.host))} — ${h.devices} ${h.devices === 1 ? 'cliente' : 'clienti'}</option>`).join('')}<option value="*" ${W.from === '*' ? 'selected' : ''}>Tutti i DNS dei clienti scelti</option></select>
          <small class="mut">Se un cliente ha più playlist su server diversi, cambia solo quella su questo DNS.</small></div></div>
        <div class="kc-step"><i>2</i><div style="flex:1;min-width:0"><b>Quali clienti? <span class="cnt" id="wCnt">0/0</span></b>
          <div class="kc-app-filters" id="wApps" aria-label="Filtra per app"></div>
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
    const appPool = () => pool().filter((d) => !W.apps.size || W.apps.has(appLabel(appKey(d))));
    const sum = () => {
      const visible = KC.dnsVisible || [], n = visible.filter((d) => W.sel.has(d.id)).length, to = target();
      const apps = W.apps.size ? [...W.apps].sort(sortApps).join(', ') : 'Tutte';
      $('#wCnt').textContent = `${n}/${visible.length}`;
      const appText = `<small class="mut">App: ${esc(apps)}</small>`;
      $('#wSum').innerHTML = !n ? `<span class="mut">Scegli i clienti al punto 2.</span><br>${appText}` : !to ? `<span class="mut">Scegli il nuovo DNS al punto 3.</span><br>${appText}`
        : `Sposti <b>${n} ${n === 1 ? 'cliente' : 'clienti'}</b> da <b class="mono">${esc(W.from === '*' ? 'qualsiasi DNS' : label(W.from))}</b> a <b class="mono">${esc(to === '+' ? '' : label(to))}</b><br>${appText}`;
    };
    const drawApps = () => {
      const counts = new Map();
      for (const d of pool()) { const app = appLabel(appKey(d)); counts.set(app, (counts.get(app) || 0) + 1); }
      const apps = [...appOrder, ...[...counts.keys()].filter((app) => !appOrder.includes(app)).sort(sortApps)];
      $('#wApps').innerHTML = `<b class="mut">App:</b><button type="button" class="btn sm ${W.apps.size ? '' : 'pri'}" data-app-all aria-pressed="${!W.apps.size}">Tutte</button>${apps.map((app) => `<button type="button" class="btn sm ${W.apps.has(app) ? 'pri' : ''}" data-app-label="${esc(app)}" aria-pressed="${W.apps.has(app)}">${esc(app)} (${counts.get(app) || 0})</button>`).join('')}`;
      $('#wApps [data-app-all]').onclick = () => { W.apps.clear(); drawDevs(); };
      $$('#wApps [data-app-label]').forEach((b) => (b.onclick = () => { const app = b.dataset.appLabel; W.apps.has(app) ? W.apps.delete(app) : W.apps.add(app); drawDevs(); }));
    };
    const drawDevs = () => {
      const q = W.q.toLowerCase();
      drawApps();
      const list = appPool().filter((d) => !q || [d.name, d.code, d.notes].join(' ').toLowerCase().includes(q));
      $('#wDevs').innerHTML = list.map((d) => `<label><input type="checkbox" data-did="${esc(d.id)}" ${W.sel.has(d.id) ? 'checked' : ''}><span><b style="font-size:14px">${esc(nm(d))}</b> <span class="mut mono" style="font-size:12px">${esc(d.code)}</span></span><small>${(byDev[d.id] || []).map((h) => `<span class="${h === W.from ? 'hl' : ''}">${esc(label(h))}</span>`).join(' ')}</small></label>`).join('') || '<p class="mut" style="padding:10px">Nessun cliente usa questo DNS.</p>';
      $$('#wDevs [data-did]').forEach((c) => (c.onchange = () => { c.checked ? W.sel.add(c.dataset.did) : W.sel.delete(c.dataset.did); sum(); }));
      KC.dnsVisible = list; sum();
    };
    drawDevs();
    $('#wFrom').onchange = (e) => { W.from = e.target.value; W.sel = new Set(appPool().map((d) => d.id)); drawDevs(); };
    $('#wQ').oninput = (e) => { W.q = e.target.value; drawDevs(); };
    $('#wAll').onclick = () => { for (const d of KC.dnsVisible || []) W.sel.add(d.id); drawDevs(); };
    $('#wNone').onclick = () => { for (const d of KC.dnsVisible || []) W.sel.delete(d.id); drawDevs(); };
    $('#wTo').onchange = (e) => { W.to = e.target.value; $('#wOther').style.display = W.to === '+' ? 'block' : 'none'; if (W.to === '+') $('#wOther').focus(); sum(); };
    $('#wOther').oninput = (e) => { W.other = e.target.value; sum(); };
    $('#wGo').onclick = async () => {
      const ids = (KC.dnsVisible || []).filter((d) => W.sel.has(d.id)).map((d) => d.id), to = target();
      if (!ids.length) return toast('Scegli almeno un cliente (punto 2)', 1);
      if (!to || to === '+') return toast('Scegli il nuovo DNS (punto 3)', 1);
      const body = { ids, host: to, from: W.from === '*' ? '' : W.from };
      let pv; try { pv = await kapi('POST', '/admin/devices/dns', { ...body, preview: true }); } catch (e) { return toast(e.message, 1); }
      if (!pv.changed) return toast('Nessuna playlist da cambiare: i clienti scelti usano già questo DNS', 1);
      const names = pv.names.slice(0, 12).map((x) => esc(x)).join(', ') + (pv.changed > 12 ? ` e altri ${pv.changed - 12}` : '');
      if (!(await ask('Confermi il cambio DNS?', `<b>${pv.changed} ${pv.changed === 1 ? 'cliente' : 'clienti'}</b> passano a <b class="mono">${esc(pv.host)}</b>${pv.from ? ` (al posto di <span class="mono">${esc(pv.from)}</span>)` : ''}.<br><span class="mut">${names}</span><br><br>Nome utente, password e playlist non cambiano.`, 'Cambia DNS'))) return;
      try { const r = await kapi('POST', '/admin/devices/dns', body); toast(`✓ DNS cambiato su ${r.changed} ${r.changed === 1 ? 'cliente' : 'clienti'}`); W.sel.clear(); await load(); dnsLoad(); } catch (e) { toast(e.message, 1); }
    };
    $$('[data-dfrom]', V).forEach((b) => (b.onclick = () => { W.from = b.dataset.dfrom; W.sel = new Set(devs.filter((d) => (byDev[d.id] || []).includes(W.from) && (!W.apps.size || W.apps.has(appLabel(appKey(d))))).map((d) => d.id)); W.q = ''; dnsLoad().then(() => $('.kc-wiz').scrollIntoView({ behavior: 'smooth', block: 'start' })); }));
    $('#dnAdd').onclick = async () => {
      const reserveId = $('#dnReserve').value;
      const reserve = dd.saved.find((x) => x.id === reserveId);
      if (reserve && (reserve.alts || []).length >= 4) return toast('La riserva selezionata ha già quattro server', 1);
      try {
        const created = await kapi('POST', '/admin/dns/saved', { name: $('#dnN').value, host: $('#dnH').value });
        if (reserve) {
          try { await kapi('PUT', '/admin/dns/saved/' + reserve.id, { alts: [...(reserve.alts || []), created.id] }); }
          catch (e) { try { await kapi('DELETE', '/admin/dns/saved/' + created.id); } catch (_) {} throw e; }
        }
        toast('DNS aggiunto'); await dnsLoad();
      } catch (e) { toast(e.message, 1); }
    };
    $$('[data-dsave]', V).forEach((b) => (b.onclick = async () => { const n = prompt('Nome per questo DNS:', ''); if (n === null) return; try { await kapi('POST', '/admin/dns/saved', { name: n, host: b.dataset.dsave }); toast('DNS salvato'); dnsLoad(); } catch (e) { toast(e.message, 1); } }));
    $$('[data-dedit]', V).forEach((b) => (b.onclick = async () => {
      const x = dd.saved.find((y) => y.id === b.dataset.dedit); if (!x) return;
      const hasClients = (hosts.find((y) => y.savedId === x.id)?.devices || 0) > 0;
      const order = (x.alts || []).filter((id, i, a) => id !== x.id && a.indexOf(id) === i && dd.saved.some((y) => y.id === id));
      let mode = ['auto', 'main', 'alt', 'rot'].includes(x.mode) ? x.mode : 'auto';
      const drawAlts = () => {
        const box = $('#dnsAltList');
        if (!box) return;
        const rest = dd.saved.filter((y) => y.id !== x.id && !order.includes(y.id));
        box.innerHTML = [...order.map((id) => dd.saved.find((y) => y.id === id)).filter(Boolean), ...rest].map((y) => {
          const i = order.indexOf(y.id), checked = i >= 0;
          return `<div class="kc-host"><label style="display:flex;align-items:center;gap:8px;flex:1"><input type="checkbox" data-alt="${esc(y.id)}" ${checked ? 'checked' : ''} ${!checked && order.length >= 4 ? 'disabled' : ''}><span><b>${esc(y.name)}</b><small class="mono" style="display:block">${esc(y.host)}</small></span></label>${checked ? `<span class="mut">${i + 1}</span><button class="btn sm" data-move="-1" data-id="${esc(y.id)}" ${i === 0 ? 'disabled' : ''}>↑</button><button class="btn sm" data-move="1" data-id="${esc(y.id)}" ${i === order.length - 1 ? 'disabled' : ''}>↓</button>` : ''}</div>`;
        }).join('') || '<p class="mut">Aggiunga altri DNS prima di scegliere una riserva.</p>';
      };
      const hostNote = hasClients ? '<small class="mut">Per spostare i clienti su un altro indirizzo usa "Cambia DNS ai clienti"</small>' : '';
      const done = ask('Modifica DNS', `<label class="lbl" for="dnsName">Nome</label><input class="inp" id="dnsName" maxlength="40" value="${esc(x.name)}"><label class="lbl" for="dnsHost" style="margin-top:12px">Indirizzo</label><input class="inp mono" id="dnsHost" value="${esc(x.host)}" ${hasClients ? 'readonly' : ''}>${hostNote}<label class="lbl" style="margin-top:12px">Riserve (massimo 4)</label><p class="mut">Le app compatibili provano gli indirizzi in ordine; la rotazione assegna un ordine stabile diverso per dispositivo.</p><div id="dnsAltList"></div><label class="lbl" for="dnsMode" style="margin-top:12px">Modalità</label><select class="inp" id="dnsMode"><option value="auto">Automatico</option><option value="main">Sempre il principale</option><option value="alt">Sempre la riserva</option><option value="rot">Rotazione per dispositivo</option></select>`, 'Salva');
      const modal = $('#mB');
      modal.onchange = (e) => {
        if (e.target.id === 'dnsMode') mode = e.target.value;
        if (e.target.matches('[data-alt]')) {
          const id = e.target.dataset.alt;
          if (e.target.checked && !order.includes(id) && order.length < 4) order.push(id);
          else if (!e.target.checked) { const i = order.indexOf(id); if (i >= 0) order.splice(i, 1); }
          drawAlts();
        }
      };
      modal.onclick = (e) => {
        const move = e.target.closest('[data-move]');
        if (!move) return;
        const i = order.indexOf(move.dataset.id), to = i + Number(move.dataset.move);
        if (i >= 0 && to >= 0 && to < order.length) { [order[i], order[to]] = [order[to], order[i]]; drawAlts(); }
      };
      drawAlts();
      $('#dnsMode').value = mode;
      if (!(await done)) { modal.onchange = modal.onclick = null; return; }
      modal.onchange = modal.onclick = null;
      const update = { name: $('#dnsName').value, alts: order, mode };
      if (!hasClients) update.host = $('#dnsHost').value;
      try { await kapi('PUT', '/admin/dns/saved/' + x.id, update); toast('DNS aggiornato'); await dnsLoad(); } catch (e) { toast(e.message, 1); }
    }));
    $$('[data-ddel]', V).forEach((b) => (b.onclick = async () => { if (!(await askDanger('Eliminare il DNS?', 'I clienti che lo usano non cambiano; il DNS viene tolto anche dalle riserve.', 'ELIMINA', 'Elimina'))) return; try { await kapi('DELETE', '/admin/dns/saved/' + b.dataset.ddel); toast('DNS eliminato'); await dnsLoad(); } catch (e) { toast(e.message, 1); } }));
    $('#locAdd').onclick = async () => {
      try { await kapi('POST', '/admin/vpn-locs', { name: $('#locN').value, conf: $('#locC').value }); toast('Località aggiunta'); dnsLoad(); } catch (e) { toast(e.message, 1); }
    };
    $$('[data-ldel]', V).forEach((b) => (b.onclick = async () => {
      if (!(await askDanger('Eliminare la località?', 'I clienti che la usano torneranno alla configurazione generale.', 'ELIMINA'))) return;
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
      ['POST', '/devices/KXAB-12CD/kick', 'Disconnetti: interrompe la visione in corso entro ~20 s (l\'abbonamento resta attivo). Con ?all=1 anche i dispositivi collegati'],
      ['PUT', '/devices/KXAB-12CD', 'Modifica: name, notes, expires, active, playlists, maxConn (1-20, 999 = illimitati), maxStreams, maxProfiles, plMode, plDefault, player ({live, movie, series}: auto · exo · vlc · "" = sceglie il cliente), perms, vpn, vpnLoc'],
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
    $$('[data-kdel]', V).forEach((b) => (b.onclick = async () => { if (!(await askDanger('Revocare la chiave?', 'I programmi che la usano smetteranno subito di funzionare.', 'ELIMINA', 'Revoca'))) return; try { await kapi('DELETE', '/admin/api-keys/' + b.dataset.kdel); toast('Chiave revocata'); apiLoad(); } catch (e) { toast(e.message, 1); } }));
    const whBody = (extra) => ({ url: $('#whU').value.trim(), events: $$('[data-ev]', V).filter((c) => c.checked).map((c) => c.dataset.ev), ...extra });
    const whSave = async (extra) => { try { const r = await kapi('PUT', '/admin/webhook', whBody(extra)); if (r.secret) await showOnce('Segreto del webhook', 'Usalo per verificare la firma dei messaggi:', r.secret); else toast('Webhook salvato'); apiLoad(); } catch (e) { toast(e.message, 1); } };
    $('#whSave').onclick = () => whSave();
    $('#whNew') && ($('#whNew').onclick = async () => { if (await ask('Nuovo segreto?', 'Il segreto attuale smette di valere: aggiornalo anche sul tuo server.', 'Cambia segreto')) whSave({ newSecret: true }); });
    $('#whTest').onclick = async () => { try { const r = await kapi('POST', '/admin/webhook/test'); toast(r.ok ? `✓ Prova ricevuta (HTTP ${r.status})` : `Il tuo server ha risposto ${r.status > 0 ? 'HTTP ' + r.status : 'nulla'}`, !r.ok); apiLoad(); } catch (e) { toast(e.message, 1); } };
  }

  /* ---------- Impostazioni: schede tematiche e avviso delle modifiche non salvate ---------- */
  (function settingsTabs() {
    const V = $('#v-settings'); if (!V || !$('#stTabs')) return;
    const paneOf = (el) => { const p = el.closest('.st-pane'); return p && p.dataset.pane; };
    $$('.st-tab', V).forEach((t) => { t.insertAdjacentHTML('beforeend', '<span class="dot"></span>'); t.onclick = () => stShow(t.dataset.st); });
    window.stShow = (k) => {
      $$('.st-tab', V).forEach((t) => t.classList.toggle('on', t.dataset.st === k));
      $$('.st-pane', V).forEach((p) => p.classList.toggle('on', p.dataset.pane === k));
      $('#stSave').classList.toggle('hide', k === 'sec' || k === 'addon'); // gli add-on hanno il loro pulsante
      try { sessionStorage.setItem('kc_st', k); } catch {}
    };
    window.stDirtyUpd = () => {
      const dirty = new Set($$('[data-dirty="1"]', V).map(paneOf).filter(Boolean));
      if ($('#sWg').value.trim()) dirty.add('vpn');
      $$('.st-tab', V).forEach((t) => t.classList.toggle('dirty', dirty.has(t.dataset.st)));
      $('#stSave').classList.toggle('dirty', dirty.size > 0);
      $('#stDirty').textContent = dirty.size ? `Modifiche non salvate in ${dirty.size === 1 ? '1 scheda' : dirty.size + ' schede'}` : 'Nessuna modifica da salvare';
    };
    V.addEventListener('input', () => setTimeout(stDirtyUpd, 0));
    V.addEventListener('click', (e) => { if (e.target.closest('.tog, [data-th]')) setTimeout(stDirtyUpd, 0); const g = e.target.closest('[data-goto]'); if (g) { e.preventDefault(); view(g.dataset.goto); } });
    let k0 = 'look'; try { k0 = sessionStorage.getItem('kc_st') || 'look'; } catch {}
    stShow($(`.st-tab[data-st="${k0}"]`, V) ? k0 : 'look');
  })();
  /* «In scadenza» dei clienti: entro quanti giorni (4, 7, 14 o 30; predefinito 14), scelto in Clienti e ricordato sul dispositivo */
  const SOON_OPTS = [4, 7, 14, 30];
  window.kxSoonDays = () => { try { const v = +localStorage.getItem('kc_soon'); return SOON_OPTS.includes(v) ? v : 14; } catch { return 14; } };
  /* ---------- Dispositivi (2.0): riquadri-filtro, clienti in schede, dispositivi da attivare in evidenza ---------- */
  (function devicesCards() {
    const V = $('#v-devices'); if (!V) return;
    V.insertAdjacentHTML('afterbegin', `<div class="dv-tiles" id="dvTiles"></div><div id="dvSoon"></div>
      <div class="dv-bar"><div class="dv-q"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input class="inp" id="dvQ" placeholder="Cerca per nome, codice, note o modello"></div>
        <select class="inp" id="dvSort"><option value="exp">Scadenza più vicina</option><option value="name">Nome A–Z</option><option value="seen">Ultimo accesso</option><option value="new">Aggiunti di recente</option></select>
        <button class="btn" id="dvMass" type="button" title="Cambia lettore, permessi, VPN… a tanti clienti insieme" style="display:none">⚙ Modifica in massa</button><div class="seg" id="dvView"><button data-dv="cards" title="Schede grandi: comode con pochi clienti">Schede</button><button data-dv="table" title="Tabella compatta con azioni rapide e selezione multipla: comoda con tanti clienti">Tabella</button><button data-dv="list" title="Elenco semplice di prima">Elenco</button></div></div>
      <div id="dvPend"></div><div class="dv-grid" id="dvCards"></div><div id="dvBulk" class="dvt-bulk"></div><div id="dvTbl"></div><div id="dvMore"></div>`);
    const st = { view: 'cards', sort: 'exp', limit: 60, sel: new Set(), pendOpen: false };
    try { st.view = localStorage.getItem('kc_dv') || 'cards'; st.sort = localStorage.getItem('kc_dvs') || 'exp'; } catch {}
    $('#dvSort').value = st.sort;
    const TILES = [
      ['all', 'Tutti', '👥', 'Ogni dispositivo'], ['active', 'Attivi', '✅', 'Abbonamento in corso'], ['soon', 'In scadenza', '⏳', 'Entro 14 giorni'],
      ['pending', 'Da attivare', '🆕', 'Aspettano te'], ['expired', 'Scaduti', '⌛', 'Da rinnovare'], ['disabled', 'Disattivati', '⏸️', 'Spenti da te'],
    ];
    const soon = (d) => d.status === 'active' && !d.parent && daysLeft(d) !== null && daysLeft(d) <= kxSoonDays();
    const fit = (d, f) => f === 'all' || (f === 'soon' ? soon(d) : d.status === f);
    const initial = (t) => (String(t || '?').trim()[0] || '?').toUpperCase();
    const hue = (t) => { let h = 0; for (const c of String(t || '')) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
    const hostsOf = (d) => [...new Set((d.playlists || []).map((p) => { try { return new URL(p.type === 'xtream' ? p.host : p.url).hostname; } catch { return ''; } }).filter(Boolean))];
    // collegato adesso (dai battiti dell'app): pallino giallo nell'app, verde in diretta, viola film/serie
    const LIVE_L = { live: 'guarda la TV in diretta', movie: 'guarda un film', series: 'guarda una serie', rec: 'sta registrando', idle: 'nell\'app' };
    const liveDot = (d) => (d.live ? `<span class="kc-dot ${d.live === 'idle' ? 'idle' : d.live === 'live' || d.live === 'rec' ? 'live' : 'movie'}" title="Collegato adesso: ${LIVE_L[d.live] || ''}"></span>` : '');
    const seenTxt = (d) => (d.live ? 'collegato adesso · ' + (LIVE_L[d.live] || '') + (d.now && d.now.t ? ': ' + d.now.t : '') : 'visto ' + ago(d.lastSeen));
    /* «Adesso» nell'elenco (12 novembre 2026, solo titolare): cosa guarda, IP e città, DNS cifrato sì o no, VPN, rete, versione.
       I dati sono quelli del battito dell'app (come «Online nelle app»); chi non è collegato non ha niente da mostrare */
    const nowOn = () => D.role === 'owner' && !window.__assist;
    const NOW_K = { live: '📺', movie: '🎬', series: '🎞️', rec: '⏺' };
    const NET_L = { wifi: 'Wi-Fi', eth: 'Cavo', mobile: 'Rete mobile' };
    const SDNS_L = { on: ['ok', '🔒 DNS cifrato', 'DNS cifrato attivo'], vpn: ['vpn', '🔒 DNS nella VPN', 'DNS cifrato: protetto dalla VPN'], asking: ['warn', 'DNS: in attesa', 'DNS cifrato acceso dal pannello: il cliente non ha ancora dato il permesso'],
      denied: ['warn', 'DNS: permesso negato', 'DNS cifrato acceso dal pannello: il cliente ha negato il permesso'], other: ['warn', 'DNS: altra VPN', 'DNS cifrato acceso dal pannello: sul dispositivo c\'è un\'altra VPN attiva'], error: ['bad', 'DNS: errore', 'DNS cifrato acceso dal pannello ma non partito'] };
    /* App accanto a ogni cliente (12 novembre 2026): quale app Kairos sta usando.
       Fonte: d.app risolto dal pannello; in mancanza, la versione del battito (now.ver) o quella registrata. */
    const APP_SHORT = { tv: 'PRO', ktv: 'TV', xc: 'XC', lite: 'LITE', prem: 'PREMIUM', plus: 'PLUS', nova: 'NOVA', ult: 'ULTIMATE', heavy: 'HEAVY', portal: 'STB', smart: 'SMARTERS' };
    const APP_FULL = { tv: 'Kairos Pro', ktv: 'Kairos TV', xc: 'Kairos XC', lite: 'Kairos Lite', prem: 'Kairos Premium', plus: 'Kairos Plus', nova: 'Kairos Nova', ult: 'KAIROS Ultimate', heavy: 'KAIROS HEAVY', portal: 'Kairos STB', smart: 'Kairos Smarters' };
    const APP_C = { tv: '#60a5fa', ktv: '#38bdf8', xc: '#2dd4bf', lite: '#f0b429', prem: '#a78bfa', plus: '#34d399', nova: '#f472b6', ult: '#fb923c', heavy: '#fbbf24', portal: '#818cf8', smart: '#22d3ee' };
    const verApp = (v) => { v = String(v || '').trim().toLowerCase(); for (const [re, k] of [[/^portal/, 'portal'], [/^smart/, 'smart'], [/^xc/, 'xc'], [/^lite/, 'lite'], [/^prem/, 'prem'], [/^nova/, 'nova'], [/^plus/, 'plus'], [/^ult/, 'ult'], [/^(pro|tv)\b/, 'tv'], [/^ktv/, 'ktv']]) if (re.test(v)) return k; return ''; };
    const appCode = (d) => { const k = String((d && d.app) || '').trim().toLowerCase(); if (k) return k; const nv = d && d.now && d.now.ver; return verApp(nv || (d && d.ver)); };
    const appTag = (d) => {
      // la HEAVY per il pannello è una Ultimate: nella pastiglia si distingue dalla versione «heavy x.y» dell'ultimo battito
      const k0 = appCode(d), k = k0 === 'ult' && /^heavy\b/i.test(String((d && ((d.now && d.now.ver) || d.ver)) || '')) ? 'heavy' : k0;
      if (!k) return '<span class="dvt-app na" title="App non ancora rilevata">n/d</span>';
      const s = APP_SHORT[k] || k.toUpperCase(), f = APP_FULL[k] || s, c = APP_C[k] || '#9aa';
      return `<span class="dvt-app" style="background:color-mix(in srgb,${c} 20%,transparent);color:${c}" title="App in uso: ${esc(f)}">${esc(s)}</span>`;
    };
    /* prima versione di ogni app con il DNS cifrato: una più vecchia non può accenderlo (Portal, Smart e Ultimate lo hanno dalla prima) */
    const SDNS_MIN = { tv: [2, 7, 6], ktv: [2, 4, 7], prem: [1, 7, 6], lite: [1, 5, 7], xc: [3, 4, 6], plus: [0, 1, 29] };
    const sdnsOld = (d) => {
      const min = SDNS_MIN[appCode(d)], m = /(\d+)\.(\d+)\.(\d+)/.exec(String((d.now && d.now.ver) || d.ver || ''));
      if (!min || !m) return false;
      for (let i = 0; i < 3; i++) if (+m[i + 1] !== min[i]) return +m[i + 1] < min[i];
      return false;
    };
    /* DNS cifrato accanto al dispositivo (12 novembre 2026, solo titolare): acceso o spento per ogni cliente, anche se adesso
       non è collegato. È quello che l'app ha dichiarato all'ultimo battito (d.now.sdns se collegato, altrimenti d.sdns) */
    function dnsTag(d) {
      const v = (d.now && d.now.sdns) || d.sdns || '';
      const L = SDNS_L[v];
      if (L) return `<span class="dn-t ${L[0]}" data-dns="${esc(v)}" title="${esc(L[2])}">${v === 'on' ? '🔒 DNS cifrato attivo' : L[1]}</span>`;
      if (v === 'off') return '<span class="dn-t no" data-dns="off" title="Il dispositivo dichiara il DNS cifrato spento">DNS cifrato spento</span>';
      // il dispositivo non ha dichiarato niente: si dice perché (13 novembre 2026). Prima c'era «spento» per tutti i casi
      if (!d.sdnsWant) return '<span class="dn-t no" data-dns="none" title="Non è acceso dal pannello per questo cliente. Si accende da «Remoto» → Rete → DNS cifrato → «Decido io» → «Acceso», oppure per tutta l\'app dal Controllo remoto">DNS cifrato non acceso</span>';
      const ver = (d.now && d.now.ver) || d.ver || '';
      if (sdnsOld(d)) return `<span class="dn-t warn" data-dns="old" title="${esc('Acceso dal pannello, ma l\'app installata (' + ver + ') è più vecchia della prima versione che lo ha (' + SDNS_MIN[appCode(d)].join('.') + '): parte dopo l\'aggiornamento')}">DNS: app da aggiornare</span>`;
      return '<span class="dn-t warn" data-dns="wait" title="Acceso dal pannello: l\'app non lo ha ancora dichiarato. Parte alla prossima apertura dell\'app (la prima volta Android chiede il permesso al cliente)">DNS: app da riaprire</span>';
    }
    /* «Remoto» accanto a «➕ Dispositivo» (12 novembre 2026, solo titolare): apre subito il Controllo remoto di quel cliente
       (impostazioni dell'app e comandi), senza passare dalla scheda */
    const rcOn = () => D.role === 'owner' && !window.__assist && !!window.KXRemote;
    const DNS_ROT_APPS = new Set(['ult', 'xc']);
    const dnsRotApp = (d) => DNS_ROT_APPS.has(appCode(d));
    const RC_IC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></svg>';
    const rcBtn = (cls) => (rcOn() ? `<button class="btn sm ${cls}" data-act="rc" title="Controllo remoto: impostazioni dell'app di questo cliente e comandi (riavvia, svuota cache, aggiorna liste…)">${RC_IC}<span>Remoto</span></button>` : '');
    let dnsRotOverrides = null, dnsRotLoad = null, dnsRotRev = 0, dnsRotServers = null, dnsRotServersLoad = null;
    function paintDnsRotButtons() {
      $$('.dv-card[data-id], .dv-kid[data-id], .dvt tbody tr[data-id]', V).forEach((el) => {
        const b = el.querySelector('[data-act="dnsrot"]'); if (!b) return;
        const on = ((dnsRotOverrides || {})[el.dataset.id] || {})['u.dnsRot'] === 'on';
        b.classList.toggle('pri', on); b.textContent = on ? '🔄 Rotativo ON' : '🔄 DNS rotativo';
      });
    }
    function loadDnsRotOverrides() {
      if (!rcOn()) return Promise.resolve({});
      if (dnsRotOverrides) return Promise.resolve(dnsRotOverrides);
      if (!dnsRotLoad) {
        const rev = dnsRotRev;
        dnsRotLoad = api('GET', '/admin/rctl').then((r) => {
          if (rev === dnsRotRev) dnsRotOverrides = r.over || {};
          paintDnsRotButtons(); return dnsRotOverrides || {};
        }).catch(() => { if (rev === dnsRotRev) dnsRotOverrides = {}; return dnsRotOverrides || {}; }).finally(() => { dnsRotLoad = null; });
      }
      return dnsRotLoad;
    }
    function dnsRotBtn(d) {
      if (!rcOn() || !dnsRotApp(d)) return '';
      loadDnsRotOverrides();
      const on = ((dnsRotOverrides || {})[d.id] || {})['u.dnsRot'] === 'on';
      return `<button class="btn sm${on ? ' pri' : ''}" data-act="dnsrot" title="Imposta il DNS rotativo per questo cliente">${on ? '🔄 Rotativo ON' : '🔄 DNS rotativo'}</button>`;
    }
    const DNS_ROT_NOTE = 'Nessun DNS di riserva: aggiungi le riserve in Solo Master → Server DNS e VPN';
    const DNS_ROT_APPS_NOTE = 'Solo KAIROS Ultimate e Kairos XC (versione nuova)';
    const dnsRotHostKey = (h) => String(h || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '').toLowerCase();
    async function dnsRotDnsList() {
      if (dnsRotServers) return dnsRotServers;
      if (!dnsRotServersLoad) dnsRotServersLoad = api('GET', '/admin/dns').then((r) => (dnsRotServers = r.saved || [])).finally(() => { dnsRotServersLoad = null; });
      return dnsRotServersLoad;
    }
    function hasDnsRotReserve(d, saved) {
      const source = d.parent ? parentOf(d) || d : d;
      const byHost = new Map(saved.map((x) => [dnsRotHostKey(x.host), x]));
      return (source.playlists || []).some((p) => {
        const address = p.type === 'xtream' ? p.host : p.url;
        let host = address;
        try { host = new URL(address).origin; } catch {}
        const server = byHost.get(dnsRotHostKey(host));
        return !!(server && server.alts && server.alts.length);
      });
    }
    async function setDnsRot(ds, bulkMode = false) {
      if (!rcOn()) return;
      let targets = (ds || []).filter((d) => d && d.status !== 'pending');
      if (bulkMode) {
        const expanded = [];
        for (const d of targets) expanded.push(d, ...kidsOf(d.id));
        targets = [...new Map(expanded.filter((d) => d && d.status !== 'pending').map((d) => [d.id, d])).values()];
      }
      if (!targets.length) return toast('Nessun dispositivo attivabile tra quelli selezionati', 1);
      const eligible = targets.filter(dnsRotApp);
      if (!eligible.length) return toast('Nessun dispositivo KAIROS Ultimate o Kairos XC selezionato', 1);
      let saved;
      try { saved = await dnsRotDnsList(); } catch (e) { return toast(e.message, 1); }
      await loadDnsRotOverrides();
      const withoutReserve = eligible.filter((d) => !hasDnsRotReserve(d, saved)).length;
      const skipped = targets.length - eligible.length;
      const current = !bulkMode ? ((dnsRotOverrides || {})[eligible[0].id] || {})['u.dnsRot'] || '' : '';
      const options = [['on', 'Attiva'], ['off', 'Spegni'], ['', 'Come il DNS']];
      const body = `${bulkMode
        ? `<p class="mut" style="margin:0 0 10px">${eligible.length} dispositivi KAIROS Ultimate / Kairos XC · ${withoutReserve} senza DNS di riserva${skipped ? ` · ${skipped} altri dispositivi verranno saltati` : ''}</p>`
        : `<p class="mut" style="margin:0 0 10px">${esc(eligible[0].name || eligible[0].code)}</p>`}
        <p class="mut" style="margin:0 0 10px">${DNS_ROT_APPS_NOTE}</p>
        <div style="display:grid;gap:8px">${options.map(([v, label]) => `<label style="display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--line);border-radius:10px;cursor:pointer"><input type="radio" name="dnsRotChoice" value="${v}" ${v === current ? 'checked' : ''} style="accent-color:var(--a1);margin:0"><b>${label}</b></label>`).join('')}</div>
        ${bulkMode ? (withoutReserve ? `<p class="mut" style="margin:10px 0 0">${DNS_ROT_NOTE}</p>` : '') : (!hasDnsRotReserve(eligible[0], saved) ? `<p class="mut" style="margin:10px 0 0">${DNS_ROT_NOTE}</p>` : '')}`;
      if (!(await ask('🔄 DNS rotativo', body, 'Applica'))) return;
      const choice = $('#mB').querySelector('input[name="dnsRotChoice"]:checked');
      if (!choice) return;
      const value = choice.value;
      try {
        const parents = eligible.filter((d) => !d.parent), children = eligible.filter((d) => !!d.parent);
        if (parents.length) await api('POST', '/admin/devices/mass', { scope: 'ids', ids: parents.map((d) => d.id), rcSet: { 'u.dnsRot': value } });
        for (const d of children) {
          const rc = { ...(dnsRotOverrides[d.id] || {}) };
          if (value === '') delete rc['u.dnsRot']; else rc['u.dnsRot'] = value;
          await api('PUT', '/admin/rctl/device/' + encodeURIComponent(d.id), { rc });
        }
        for (const d of eligible) if (window.KXRemote && KXRemote.setOverride) KXRemote.setOverride(d.id, 'u.dnsRot', value);
        dnsRotRev++; dnsRotOverrides = null;
        await loadDnsRotOverrides();
        paintDnsRotButtons();
        await load();
        toast(`DNS rotativo aggiornato su ${eligible.length} dispositiv${eligible.length === 1 ? 'o' : 'i'}`);
      } catch (e) { toast(e.message, 1); }
    }
    function nowCell(d) {
      const n = d.now;
      if (!d.live || !n) return '<span class="mut">—</span>';
      const what = n.k === 'idle' || !n.t ? '<b class="idle">nei menu</b>' : `<b title="${esc((LIVE_L[n.k] || '') + ': ' + n.t + (n.p ? ' · ' + n.p : ''))}">${NOW_K[n.k] || '▶'} ${esc(n.t)}</b>`;
      const where = [n.ip, [n.city, n.cc].filter(Boolean).join(' ')].filter(Boolean).join(' · ');
      const sd = SDNS_L[n.sdns] || ['no', 'DNS non cifrato', n.sdns === 'off' ? 'DNS cifrato spento sul dispositivo' : 'DNS cifrato non attivo (non acceso dal pannello, oppure app non aggiornata)'];
      const tags = [`<span class="dn-t ${sd[0]}" title="${esc(sd[2])}">${sd[1]}</span>`];
      if (n.vpn === 'on') tags.push('<span class="dn-t vpn" title="VPN accesa">🛡 VPN</span>');
      if (n.away) tags.push('<span class="dn-t warn" title="Collegato da un paese diverso dal solito">⚠ altro paese</span>');
      if (n.line === 'weak') tags.push('<span class="dn-t warn" title="L\'app vede la linea del cliente debole">linea debole</span>');
      if (NET_L[n.net]) tags.push(`<span class="dn-t">${NET_L[n.net]}</span>`);
      if (n.res) tags.push(`<span class="dn-t">${esc(n.res)}</span>`);
      if (n.ver) tags.push(`<span class="dn-t" title="Versione dell'app">v${esc(String(n.ver).replace(/^[a-z]+\s+/i, ''))}</span>`);
      return `${what}${where ? `<small title="Indirizzo IP e posizione approssimata">${esc(where)}</small>` : ''}<div class="dn-tags">${tags.join('')}</div>`;
    }
    function card(d) {
      const kids = kidsOf(d.id), dl = daysLeft(d), tot = 365;
      const pct = dl === null ? 100 : Math.max(0, Math.min(100, (dl / tot) * 100));
      const tone = d.status !== 'active' ? 'bad' : dl !== null && dl <= 3 ? 'bad' : dl !== null && dl <= 14 ? 'warn' : 'ok';
      const name = d.name || '— senza nome —';
      const info = [d.model || 'Modello sconosciuto', seenTxt(d), `${1 + kids.length}/${+d.maxConn >= 999 ? '∞' : d.maxConn || 1} dispositivi`, (d.playlists || []).length ? (d.playlists || []).length + ((d.playlists || []).length === 1 ? ' playlist' : ' playlist') : 'nessuna playlist'];
      return `<div class="dv-card ${d.status}" data-id="${esc(d.id)}">
        <div class="dv-top"><div class="dv-n"><b>${liveDot(d)}${esc(name)}${d.status === 'pending' ? '' : appTag(d)}</b><span class="code">${esc(d.code)}</span></div>${stPill(d.status)}</div>
        <div class="dv-exp ${tone}"><span>${d.expires ? 'Scade il <b>' + esc(fmtD(d.expires)) + '</b>' : '<b>Senza scadenza</b>'}</span><em>${dl === null ? '' : dl < 0 ? 'scaduto da ' + -dl + ' giorni' : dl === 0 ? 'scade oggi' : dl === 1 ? 'domani' : 'tra ' + dl + ' giorni'}</em></div>
        ${window.KXPay ? KXPay.badge('device', '', d.id) : ''}
        <div class="dv-meta">${info.map(esc).join(' · ')}</div>
        ${kids.length ? `<div class="dv-kids">${kids.map((k) => `<div class="dv-kid" data-id="${esc(k.id)}"><button class="dv-kid-open" data-open="${esc(k.id)}" title="${esc(k.code)}${k.own ? ' · gestione indipendente (playlist sue)' : ''}">${liveDot(k)}↳ ${esc(k.name || k.model || k.code)}${k.own ? ' · <em>playlist sue</em>' : ''}</button><div class="dv-kid-actions">${rcBtn('dvt-rc')}${dnsRotBtn(k)}</div></div>`).join('')}</div>` : ''}
        ${d.notes ? `<div class="dv-note">${esc(d.notes.slice(0, 90))}</div>` : ''}
        <div class="dv-act">${window.KXAddDev && KXAddDev.can() ? '<button class="btn sm" data-act="adddev" title="Collega e aggiungi un altro dispositivo a questo cliente">➕ Dispositivo</button>' : ''}${rcBtn('dvt-rc')}${dnsRotBtn(d)}<button class="btn sm" data-act="renew">Rinnova</button><button class="btn sm pri" data-act="open">Modifica</button></div>
      </div>`;
    }
    // «📥 Scaricata col codice di …»: scritto sul dispositivo al download (sempre presente); se manca, il riconoscimento dal vivo (add-dev.js)
    function dlWho(d) {
      if (!d || !d.dl) return '';
      return `<div class="dvp-dl">📥 Scaricata ${d.dl.mine ? 'con il <b>tuo codice</b>' : `dal codice di <b>${esc(d.dl.by || 'un agente')}</b>`}</div>`;
    }
    function pendCard(d) {
      return `<div class="dv-pc" data-id="${esc(d.id)}"><div><span class="code big">${esc(d.code)}</span><small>${esc(d.model || 'Dispositivo')} · si è collegato ${esc(ago(d.lastSeen || d.createdAt))}</small>${dlWho(d)}${window.KXAddDev ? KXAddDev.nearHtml(d) : ''}</div>
        <div class="dv-act"><button class="btn sm pri" data-act="activate">Attiva</button><button class="btn sm" data-act="link">Collega a un cliente</button>${pendOwner() ? '<button class="btn sm dvp-x" data-act="delp" title="Elimina la richiesta">🗑</button>' : ''}</div></div>`;
    }
    /* richieste «da attivare»: eliminarle (una o tutte) e farle annullare da sole se non le accetti entro un tempo (solo titolare) */
    const PTTL = [[0, '30 giorni (predefinito)'], [1, '1 ora'], [6, '6 ore'], [24, '24 ore'], [72, '3 giorni'], [168, '7 giorni']];
    const pendOwner = () => D.role !== 'agent' && !window.__assist;
    const codeOnlyMode = () => pendOwner() && !!(D.settings || {}).codeOnly;
    function pendTools(pend) {
      if (!pendOwner()) return '';
      const codeOnly = codeOnlyMode(), raw = +((D.settings || {}).pendTtl || 0);
      const cur = codeOnly ? (raw ? Math.min(raw, 24) : 0) : raw;
      const options = codeOnly ? PTTL.filter(([v]) => v <= 24).map(([v, l]) => [v, v === 0 ? '24 ore (predefinito)' : l]) : PTTL;
      return `<div class="dvp-tools"><label title="Si conta dalla richiesta. Mai mentre il cliente ha l'app aperta sul codice; se la riapre, la richiesta ricompare con lo stesso codice.">Se non le accetti si annullano dopo <select class="inp" data-pendttl>${options.map(([v, l]) => `<option value="${v}" ${cur === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>${pend.length ? `<button type="button" class="btn sm danger" data-pendall>🗑 ${pend.length === 1 ? 'Elimina la richiesta' : 'Elimina tutte (' + pend.length + ')'}</button>` : ''}</div>`;
    }
    async function delPend(list) {
      list = (list || []).filter((d) => d && !d.parent && d.status === 'pending');
      if (!list.length) return;
      const one = list.length === 1;
      const names = list.slice(0, 6).map((d) => `<b class="mono">${esc(d.code)}</b>${d.model ? ' · ' + esc(d.model) : ''}`).join('<br>') + (list.length > 6 ? `<br>e altre ${list.length - 6}` : '');
      if (!(await ask(one ? 'Eliminare la richiesta?' : `Eliminare ${list.length} richieste da attivare?`, `${names}<p class="mut" style="margin:10px 0 0">Se l'app è ancora aperta su quel dispositivo, la richiesta ricompare da sola con lo stesso codice.</p>`, 'Elimina'))) return;
      try {
        const r = await api('POST', '/admin/devices/pending/delete', { ids: list.map((d) => d.id) });
        list.forEach((d) => st.sel.delete(d.id)); await load();
        toast(r.deleted ? (r.deleted === 1 ? 'Richiesta eliminata' : `Eliminate ${r.deleted} richieste`) : 'Niente da eliminare: erano già state attivate o tolte');
      } catch (e) { toast(e.message, 1); }
    }
    async function setPendTtl(v) {
      v = +v || 0;
      try {
        const r = await api('PUT', '/admin/settings', { pendTtl: v });
        if (r && r.settings) D.settings = r.settings; else (D.settings || (D.settings = {})).pendTtl = v;
        const n = (r && r.pendDeleted) || 0;
        const effective = codeOnlyMode() ? (v ? Math.min(v, 24) : 24) : v;
        const label = PTTL.find((x) => x[0] === effective)?.[1] || '24 ore';
        toast(effective ? `Le richieste non accettate entro ${label} si annullano da sole${n ? ` · tolte subito ${n === 1 ? '1 richiesta vecchia' : n + ' richieste vecchie'}` : ''}` : 'Le richieste da attivare restano fino a 30 giorni senza contatti');
        await load();
      } catch (e) { toast(e.message, 1); renderDevices(); }
    }
    const IC = {
      ext1: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>',
      ext12: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
      kick: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18.4 5.6a9 9 0 1 1-12.8 0"/><path d="M12 2v10"/></svg>',
      off: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
      on: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 4v16l13-8z"/></svg>',
      edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
      del: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
      copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16V4h12"/></svg>',
      note: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
    };
    const ib = (act, cls, title) => `<button class="dvt-ib ${cls}" data-act="${act}" title="${title}">${IC[act]}</button>`;
    function trow(d, sub) {
      const kids = sub ? [] : kidsOf(d.id), p = sub ? parentOf(d) : null;
      const base = sub && p ? p : d, dl = daysLeft(base);
      const exp = base.expires ? `<b>${esc(fmtD(base.expires))}</b><small class="${dl !== null && dl < 0 ? 'bad' : dl !== null && dl <= 14 ? 'warn' : ''}">${dl === null ? '' : dl < 0 ? 'scaduto da ' + -dl + ' g' : dl === 0 ? 'scade oggi' : 'tra ' + dl + ' g'}</small>` : (d.status === 'pending' ? '<span class="mut">—</span>' : '<b>Senza scadenza</b>');
      const pls = sub && !d.own ? '<span class="mut">dal principale</span>' : (d.playlists || []).length ? `${(d.playlists || []).length} · <span class="mut">${esc(hostsOf(d).slice(0, 1).join(''))}</span>${sub ? ' <span class="kc-tag" title="Gestione indipendente: playlist e lettore di questa TV">propria</span>' : ''}` : '<span class="mut">nessuna</span>';
      // «➕ Dispositivo» (add-dev.js, 11 novembre 2026): collega un'altra TV a questo cliente, per titolare e agenti con il permesso
      const addDev = window.KXAddDev && KXAddDev.can() ? '<button class="btn sm dvt-add" data-act="adddev" title="Collega e aggiungi un altro dispositivo a questo cliente">➕ Dispositivo</button>' : '';
      const acts = d.status === 'pending' && !sub
        ? '<button class="btn sm pri" data-act="activate">Attiva</button><button class="btn sm" data-act="link">Collega</button>' + (pendOwner() ? ib('del', 'r', 'Elimina la richiesta') : '')
        : sub ? rcBtn('dvt-rc') + dnsRotBtn(d) + ib('kick', 'k', 'Disconnetti') + ib('edit', 'e', 'Apri scheda')
        : addDev + rcBtn('dvt-rc') + dnsRotBtn(d) + ib('ext1', 'g', '+1 mese') + ib('ext12', 'b', '+12 mesi') + (d.status === 'active' ? ib('kick', 'k', 'Disconnetti: interrompe la visione in corso') : '') + (d.active ? ib('off', 'o', 'Disattiva') : ib('on', 'g', 'Riattiva')) + ib('edit', 'e', 'Apri scheda') + ib('del', 'r', 'Elimina');
      return `<tr data-id="${esc(d.id)}" class="${sub ? 'sub' : ''} ${st.sel.has(d.id) ? 'sel' : ''}">
        <td class="c">${sub ? '' : `<input type="checkbox" data-sel="${esc(d.id)}" ${st.sel.has(d.id) ? 'checked' : ''}>`}</td>
        <td><div class="dvt-u">${sub ? '<span class="dvt-sub">↳</span>' : ''}<div><b>${liveDot(d)}${esc(d.name || (sub ? d.model || 'Dispositivo' : '') || '— senza nome —')}${d.status === 'pending' ? '' : appTag(d)}</b><span class="dvt-code" data-copy="${esc(d.code)}" title="Copia il codice">${esc(d.code)} ${IC.copy}</span>${!sub && d.status === 'pending' ? dlWho(d) : ''}${!sub && d.status === 'pending' && window.KXAddDev ? KXAddDev.nearHtml(d) : ''}</div></div></td>
        <td>${stPill(d.status)}</td>
        <td class="dvt-exp">${exp}${window.KXPay ? KXPay.badge('device', '', base.id) : ''}</td>
        <td class="c mono">${sub || d.status === 'pending' ? '—' : `${1 + kids.length}/${+d.maxConn >= 999 ? '∞' : esc(d.maxConn || 1)}`}</td>
        <td class="dvt-dev"><b>${esc(d.model || '—')}</b><small${d.live ? ' class="dvt-on"' : ''}>${esc(d.live ? 'collegato adesso' : ago(d.lastSeen))}</small>${nowOn() && d.status !== 'pending' ? dnsTag(d) : ''}</td>
        ${nowOn() ? `<td class="dvt-now">${nowCell(d)}</td>` : ''}
        <td class="dvt-pl">${pls}</td>
        <td class="dvt-note" data-note="${esc(d.id)}">${d.notes ? `<span>${esc(d.notes.slice(0, 60))}</span>` : `<span class="mut">Aggiungi nota</span>`} ${IC.note}</td>
        <td class="dvt-acts">${acts}</td></tr>`;
    }
    function renderTable(list, pend, q) {
      const rows = [];
      for (const d of [...pend, ...list.slice(0, st.limit)]) { rows.push(trow(d, false)); for (const k of kidsOf(d.id)) rows.push(trow(k, true)); }
      const pbar = pend.length && pendOwner() ? `<div class="dvp-bar"><span>🆕 <b>${pend.length}</b> ${pend.length === 1 ? 'richiesta' : 'richieste'} da attivare in cima all'elenco</span>${pendTools(pend)}</div>` : '';
      $('#dvTbl').innerHTML = pbar + (rows.length ? `<div class="card glass dvt-wrap"><table class="dvt"><thead><tr><th class="c"><input type="checkbox" id="dvtAll" title="Seleziona tutti quelli mostrati"></th><th>Cliente</th><th>Stato</th><th>Scadenza</th><th class="c">Conn.</th><th class="dvh-dev">Dispositivo</th>${nowOn() ? '<th class="dvh-now" title="Chi è collegato adesso: cosa guarda, da dove, DNS cifrato, rete e versione">Adesso</th>' : ''}<th class="dvh-pl">Playlist</th><th class="dvh-note">Note</th><th>Azioni</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>`
        : `<div class="emptyc" style="display:block">${q ? 'Nessun cliente trovato per «' + esc(q) + '»' : 'Nessun cliente in questo elenco'}</div>`);
      const all = $('#dvtAll'); if (all) { const ids = [...pend, ...list.slice(0, st.limit)].map((d) => d.id); all.checked = ids.length > 0 && ids.every((i) => st.sel.has(i)); all.onchange = () => { ids.forEach((i) => (all.checked ? st.sel.add(i) : st.sel.delete(i))); renderDevices(); }; }
      bulkBar();
    }
    function bulkBar() {
      for (const i of [...st.sel]) if (!D.devices.some((d) => d.id === i)) st.sel.delete(i);
      const n = st.sel.size;
      $('#dvBulk').innerHTML = n && st.view === 'table' ? `<b>${n} selezionat${n === 1 ? 'o' : 'i'}</b>${window.KXMass && KXMass.ok() ? '<button class="btn sm pri" data-bulk="mass">⚙ Modifica in massa</button>' : ''}${rcOn() ? '<button class="btn sm" data-bulk="dnsrot">🔄 DNS rotativo</button>' : ''}<button class="btn sm" data-bulk="ext1">+1 mese</button><button class="btn sm" data-bulk="addon">🧩 Add-on</button><button class="btn sm" data-bulk="ext12">+12 mesi</button><button class="btn sm danger" data-bulk="kick">⛔ Disconnetti</button><button class="btn sm" data-bulk="off">Disattiva</button><button class="btn sm" data-bulk="on">Riattiva</button><span style="flex:1"></span><button class="btn sm" data-bulk="clear">Deseleziona</button>` : '';
      $('#dvBulk').classList.toggle('on', !!n && st.view === 'table');
    }
    async function bulk(act) {
      if (act === 'clear') { st.sel.clear(); return renderDevices(); }
      if (act === 'mass') { if (window.KXMass) KXMass.open([...st.sel], () => { st.sel.clear(); renderDevices(); }); return; }
      if (act === 'dnsrot') return setDnsRot([...st.sel].map((i) => D.devices.find((d) => d.id === i)).filter(Boolean), true);
      const ds = [...st.sel].map((i) => D.devices.find((d) => d.id === i)).filter((d) => d && !d.parent && d.status !== 'pending');
      if (!ds.length) return toast('Nessun cliente attivabile tra quelli selezionati', 1);
      if (act === 'addon') {
        const cat = addonCatNow().filter((a) => a.mode === 'some');
        if (!cat.length) return toast('Nessun add-on «solo a chi assegno»: sceglilo in Impostazioni → Store add-on', 1);
        const names2 = ds.slice(0, 6).map((d) => esc(d.name || d.code)).join(', ') + (ds.length > 6 ? ` e altri ${ds.length - 6}` : '');
        const okA = await ask('Add-on per ' + ds.length + ' client' + (ds.length === 1 ? 'e' : 'i'), `<p class="mut" style="margin:0 0 10px">${names2}</p><div class="adbulk">${cat.map((a) => `<label><span>${esc(a.name)}<small>${ADDON_GRP[a.cat]}</small></span><select class="inp" data-adb="${a.id}"><option value="">—</option><option value="add">Dai</option><option value="del">Togli</option></select></label>`).join('')}</div>`, 'Applica');
        if (!okA) return;
        const add = $$('#mB [data-adb]').filter((x) => x.value === 'add').map((x) => x.dataset.adb), remove = $$('#mB [data-adb]').filter((x) => x.value === 'del').map((x) => x.dataset.adb);
        if (!add.length && !remove.length) return toast('Non hai scelto nessun add-on', 1);
        try { const r = await api('POST', '/admin/devices/addons', { ids: ds.map((d) => d.id), add, remove }); st.sel.clear(); await load(); toast(`Add-on aggiornati su ${r.changed} client${r.changed === 1 ? 'e' : 'i'}`); } catch (e) { toast(e.message, 1); }
        return;
      }
      const L = { ext1: ['Aggiungere 1 mese?', 'Aggiungi'], ext12: ['Aggiungere 12 mesi?', 'Aggiungi'], kick: ['Disconnettere?', 'Disconnetti'], off: ['Disattivare?', 'Disattiva'], on: ['Riattivare?', 'Riattiva'] }[act];
      const names = ds.slice(0, 8).map((d) => esc(d.name || d.code)).join(', ') + (ds.length > 8 ? ` e altri ${ds.length - 8}` : '');
      if (!(await ask(L[0], `<b>${ds.length}</b> client${ds.length === 1 ? 'e' : 'i'}: ${names}${act === 'kick' ? '<br><span class="mut">La visione in corso si interrompe entro una ventina di secondi; gli abbonamenti restano attivi.</span>' : ''}`, L[1]))) return;
      let ok = 0;
      for (const d of ds) {
        try {
          if (act === 'kick') { if (await kickDev(d, true)) ok++; continue; }
          const patch = act === 'ext1' ? { expires: addMonths(d.expires, 1), active: true } : act === 'ext12' ? { expires: addMonths(d.expires, 12), active: true } : { active: act === 'on' };
          await api('PUT', '/admin/devices/' + d.id, patch); ok++;
        } catch (e) { toast((d.name || d.code) + ': ' + e.message, 1); }
      }
      st.sel.clear(); await load(); toast(`Fatto su ${ok} di ${ds.length}`);
    }
    function render() {
      const f = D.filter || 'all', q = ($('#dvQ').value || D.q || '').toLowerCase().trim();
      const codeOnly = codeOnlyMode(), untouchedPending = (d) => !d.parent && !+d.active && !(d.playlists || []).length && !d.name && !d.notes && !d.expires;
      const hay = (d) => [d.code, d.name, d.notes, d.model].join(' ').toLowerCase();
      const pend = D.devices.filter((d) => d.status === 'pending' && !d.parent && (f === 'all' || f === 'pending') && (!q || hay(d).includes(q)));
      st.pend = pend; // per «Elimina tutte»: quelle mostrate (sezione, app e ricerca)
      const pendingTitle = `📵 ${pend.length} app aperte non attivate · si cancellano da sole dopo 24 ore`;
      const expandedPend = `<div class="dvp-codeonly"><span>${pendingTitle}</span><button type="button" class="btn sm" data-pendtoggle aria-expanded="true">Nascondi</button></div><div class="hd"><h3>🆕 Da attivare <span class="cnt">${pend.length}</span><small>Il cliente apre l'app e ti legge il codice: premi <b>Attiva</b>, scegli durata e playlist. Se è una TV in più di un cliente che hai già, usa <b>Collega a un cliente</b>.</small></h3>${pendTools(pend)}</div><div class="dv-pgrid">${pend.slice(0, 24).map(pendCard).join('')}</div>`;
      const pendingHtml = !pend.length ? '' : codeOnly
        ? `<div class="card glass dv-pend">${st.pendOpen ? expandedPend : `<div class="dvp-codeonly"><span>${pendingTitle}</span><button type="button" class="btn sm pri" data-pendtoggle aria-expanded="false">Mostra</button></div>`}</div>`
        : `<div class="card glass dv-pend"><div class="hd"><h3>🆕 Da attivare <span class="cnt">${pend.length}</span><small>Il cliente apre l'app e ti legge il codice: premi <b>Attiva</b>, scegli durata e playlist. Se è una TV in più di un cliente che hai già, usa <b>Collega a un cliente</b>.</small></h3>${pendTools(pend)}</div><div class="dv-pgrid">${pend.slice(0, 24).map(pendCard).join('')}</div></div>`;
      $('#dvPend').innerHTML = pendingHtml;
      const sd = kxSoonDays();
      $('#dvTiles').innerHTML = TILES.map(([k, l, ic, sub]) => `<button class="dv-tile ${k} ${f === k && !(codeOnly && k === 'pending') ? 'on' : ''}" data-fl2="${k}"><span><b>${D.devices.filter((d) => fit(d, k)).length}</b><em>${l}</em><small>${k === 'soon' ? `Entro ${sd} giorni` : sub}</small></span></button>`).join('');
      $('#dvSoon').innerHTML = f === 'soon' ? `<div class="dv-soon"><span>Scadono entro</span>${SOON_OPTS.map((n) => `<button type="button" class="fchip ${sd === n ? 'on' : ''}" data-soon="${n}">${n} giorni</button>`).join('')}</div>` : '';
      $$('#dvView [data-dv]').forEach((b) => b.classList.toggle('on', b.dataset.dv === st.view));
      V.classList.toggle('dv-cardsview', st.view !== 'list');
      if (st.view === 'list') { if (!codeOnly) $('#dvPend').innerHTML = ''; $('#dvCards').innerHTML = $('#dvMore').innerHTML = $('#dvTbl').innerHTML = ''; bulkBar(); return; }
      let list = D.devices.filter((d) => !d.parent && d.status !== 'pending' && fit(d, f) && (!q || hay(d).includes(q) || kidsOf(d.id).some((k) => hay(k).includes(q))));
      // connessioni che corrispondono alla ricerca ma il cui cliente principale non c'è (o è eliminato)
      const orphans = D.devices.filter((d) => d.parent && !parentOf(d) && (!q || hay(d).includes(q)) && f === 'all');
      const by = { exp: (a, b) => (daysLeft(a) ?? 1e9) - (daysLeft(b) ?? 1e9), name: (a, b) => String(a.name || a.code).localeCompare(String(b.name || b.code), 'it'), seen: (a, b) => (b.lastSeen || 0) - (a.lastSeen || 0), new: (a, b) => (b.createdAt || 0) - (a.createdAt || 0) }[st.sort];
      list = list.sort(by);
      if (st.view === 'table') {
        if (!codeOnly) $('#dvPend').innerHTML = '';
        $('#dvCards').innerHTML = '';
        renderTable(list, codeOnly ? pend.filter((d) => !untouchedPending(d)) : pend, q);
        $('#dvMore').innerHTML = list.length > st.limit ? `<button class="btn" id="dvMoreB" style="width:100%;margin-top:14px">Mostra altri ${Math.min(100, list.length - st.limit)} (${list.length - st.limit} rimanenti)</button>` : '';
        $('#dvMoreB') && ($('#dvMoreB').onclick = () => { st.limit += 100; renderDevices(); });
        return;
      }
      $('#dvTbl').innerHTML = ''; bulkBar();
      const shown = list.slice(0, st.limit);
      $('#dvCards').innerHTML = shown.map(card).join('') + orphans.map((d) => `<div class="dv-card" data-id="${esc(d.id)}"><div class="dv-top"><div class="dv-av">?</div><div class="dv-n"><b>${esc(d.name || d.model || d.code)}</b><span class="code">${esc(d.code)}</span></div></div><p class="mut" style="font-size:13px">Connessione di un cliente eliminato</p><div class="dv-act"><button class="btn sm pri" data-act="open">Apri scheda</button></div></div>`).join('')
        || (pend.length ? '' : `<div class="emptyc" style="display:block;grid-column:1/-1">${q ? 'Nessun cliente trovato per «' + esc(q) + '»' : 'Nessun cliente in questo elenco'}</div>`);
      $('#dvMore').innerHTML = list.length > st.limit ? `<button class="btn" id="dvMoreB" style="width:100%;margin-top:14px">Mostra altri ${Math.min(60, list.length - st.limit)} (${list.length - st.limit} rimanenti)</button>` : '';
      $('#dvMoreB') && ($('#dvMoreB').onclick = () => { st.limit += 60; renderDevices(); });
    }
    V.addEventListener('click', async (e) => {
      const pToggle = e.target.closest('[data-pendtoggle]'); if (pToggle) { st.pendOpen = !st.pendOpen; return renderDevices(); }
      const sdb = e.target.closest('[data-soon]'); if (sdb) { try { localStorage.setItem('kc_soon', sdb.dataset.soon); } catch {} st.limit = st.view === 'table' ? 100 : 60; return renderDevices(); }
      const t = e.target.closest('[data-fl2]'); if (t) { D.filter = t.dataset.fl2; st.limit = st.view === 'table' ? 100 : 60; return renderDevices(); }
      const v = e.target.closest('[data-dv]'); if (v) { st.view = v.dataset.dv; st.limit = st.view === 'table' ? 100 : 60; try { localStorage.setItem('kc_dv', st.view); } catch {} V.classList.toggle('dv-cardsview', st.view !== 'list'); return renderDevices(); }
      const o = e.target.closest('[data-open]'); if (o) { const k = D.devices.find((x) => x.id === o.dataset.open); if (k) openQuick(k); return; }
      const bk = e.target.closest('[data-bulk]'); if (bk) return bulk(bk.dataset.bulk);
      if (e.target.closest('[data-pendall]')) return delPend(st.pend);
      if (e.target.closest('#dvMass')) { if (window.KXMass) KXMass.open(st.view === 'table' ? [...st.sel] : [], () => { st.sel.clear(); renderDevices(); }); return; }
      const cp = e.target.closest('[data-copy]'); if (cp) { try { await navigator.clipboard.writeText(cp.dataset.copy); toast('Codice copiato: ' + cp.dataset.copy); } catch { toast(cp.dataset.copy); } return; }
      const sl = e.target.closest('[data-sel]'); if (sl) { sl.checked ? st.sel.add(sl.dataset.sel) : st.sel.delete(sl.dataset.sel); sl.closest('tr').classList.toggle('sel', sl.checked); const all = $('#dvtAll'); if (all && !sl.checked) all.checked = false; return bulkBar(); }
      const nt = e.target.closest('[data-note]');
      if (nt && !nt.querySelector('input')) {
        const d = D.devices.find((x) => x.id === nt.dataset.note); if (!d) return;
        nt.innerHTML = `<input class="inp dvt-ni" maxlength="500" value="${esc(d.notes || '')}" placeholder="Nota (Invio per salvare, Esc per annullare)">`;
        const inp = nt.querySelector('input'); inp.focus(); inp.select();
        let done = false;
        const fin = async (keep) => { if (done) return; done = true; if (keep && inp.value.trim() !== (d.notes || '')) { if (await save(d, { notes: inp.value.trim() })) toast('Nota salvata'); else renderDevices(); } else renderDevices(); };
        inp.onkeydown = (ev) => { if (ev.key === 'Enter') fin(true); else if (ev.key === 'Escape') fin(false); };
        inp.onblur = () => fin(true);
        return;
      }
      if (nt) return;
      const tr = e.target.closest('.dvt tbody tr');
      if (tr) {
        const d = D.devices.find((x) => x.id === tr.dataset.id); if (!d) return;
        const a = (e.target.closest('[data-act]') || {}).dataset?.act;
        if (a === 'ext1') return extend(d, 1);
        if (a === 'ext12') return extend(d, 12);
        if (a === 'kick') return kickDev(d);
        if (a === 'off') { if (!(await ask('Disattivare il cliente?', `<b>${esc(d.name || d.code)}</b> non potrà più guardare finché non lo riattivi.`, 'Disattiva'))) return; if (await save(d, { active: false })) toast('Disattivato'); return; }
        if (a === 'on') { if (await save(d, { active: true })) toast('Riattivato'); return; }
        if (a === 'del' && d.status === 'pending' && !d.parent) return delPend([d]);
        if (a === 'del') {
          const n = kidsOf(d.id).length;
          if (!(await askDanger('Eliminare il cliente?', `Il codice <b class="mono">${esc(d.code)}</b> verrà rimosso e il player tornerà alla schermata di attivazione.${n ? ` Le ${n} connessioni collegate torneranno “in attesa”.` : ''}`, d.code))) return;
          try { await api('DELETE', '/admin/devices/' + d.id); st.sel.delete(d.id); await load(); toast('Eliminato'); } catch (er) { toast(er.message, 1); }
          return;
        }
        if (a === 'activate') return openDrawer(d, true);
        if (a === 'adddev') return window.KXAddDev && KXAddDev.open(d);
        if (a === 'rc') return window.KXRemote && KXRemote.open(d);
        if (a === 'dnsrot') return setDnsRot([d]);
        if (a === 'nearlink') return window.KXAddDev && KXAddDev.nearLink(d, (e.target.closest('[data-near]') || {}).dataset?.near);
        if (a === 'link') { openDrawer(d, false); setTimeout(() => linkPick(), 350); return; }
        if (a === 'edit') return openDrawer(d, d.status === 'pending');
        if (!e.target.closest('button,input')) return openQuick(d);
        return;
      }
      const c = e.target.closest('.dv-kid[data-id], .dv-card, .dv-pc'); if (!c) return;
      const d = D.devices.find((x) => x.id === c.dataset.id); if (!d) return;
      const act = (e.target.closest('[data-act]') || {}).dataset?.act;
      if (act === 'renew') { const box = c.querySelector('.dv-act'); box.innerHTML = [1, 3, 6, 12].map((m) => `<button class="btn sm" data-act="ext${m}">+${m} ${m === 1 ? 'mese' : 'mesi'}</button>`).join('') + '<button class="btn sm dv-x" data-act="renewx" title="Annulla">✕</button>'; return; }
      if (act === 'renewx') return renderDevices();
      if (act === 'delp') return delPend([d]);
      if (act === 'adddev') return window.KXAddDev && KXAddDev.open(d);
      if (act === 'rc') return window.KXRemote && KXRemote.open(d);
      if (act === 'dnsrot') return setDnsRot([d]);
      if (act === 'nearlink') return window.KXAddDev && KXAddDev.nearLink(d, (e.target.closest('[data-near]') || {}).dataset?.near);
      const em = /^ext(\d+)$/.exec(act || ''); if (em) return extend(d, +em[1]);
      if (act === 'kick') return kickDev(d);
      if (act === 'tog') { if (d.active && !(await ask('Disattivare il cliente?', `<b>${esc(d.name || d.code)}</b> non potrà più guardare finché non lo riattivi.`, 'Disattiva'))) return; if (await save(d, { active: !d.active })) toast(d.active ? 'Cliente disattivato' : 'Cliente riattivato'); return; }
      if (act === 'activate') return openDrawer(d, true);
      if (act === 'link') { openDrawer(d, false); setTimeout(() => linkPick(), 350); return; }
      if (act === 'open') return openDrawer(d, d.status === 'pending');
      if (!e.target.closest('button')) openQuick(d);
    });
    V.addEventListener('change', (e) => { const t = e.target.closest('[data-pendttl]'); if (t) setPendTtl(t.value); });
    $('#dvQ').addEventListener('input', () => { st.limit = st.view === 'table' ? 100 : 60; renderDevices(); });
    $('#dvSort').onchange = (e) => { st.sort = e.target.value; try { localStorage.setItem('kc_dvs', st.sort); } catch {} renderDevices(); };
    const orig = window.renderDevices;
    // la vecchia tabella (nascosta con schede/tabella nuova) non va riempita: con 1500 clienti erano 37.000 elementi in più
    window.renderDevices = renderDevices = function () { const cv = st.view !== 'list'; V.classList.toggle('dv-cardsview', cv); if (cv) { const r = $('#rows'); if (r && r.firstChild) r.textContent = ''; } orig(); render(); };
    KC.dvRender = render;
    // demo: elimina richieste e annullamento automatico come sul server
    if (typeof DEMO !== 'undefined') {
      const dm0 = demoApi;
      const isPend = (d) => !d.parent && !d.active && !(d.playlists || []).length;
      window.demoApi = demoApi = async function (m, p, b) {
        if (p === '/admin/devices/pending/delete' && m === 'POST') {
          const ids = new Set((b && b.ids) || []), n0 = DEMO.devices.length;
          DEMO.devices = DEMO.devices.filter((d) => !(ids.has(d.id) && isPend(d)));
          return { deleted: n0 - DEMO.devices.length };
        }
        const r = await dm0(m, p, b);
        if (p === '/admin/settings' && m === 'PUT' && b && +b.pendTtl) {
          const t = Date.now(), h = +b.pendTtl, n0 = DEMO.devices.length;
          DEMO.devices = DEMO.devices.filter((d) => !(isPend(d) && !d.name && !d.notes && (d.createdAt || 0) < t - h * 3600e3 && (d.lastSeen || 0) < t - 10 * 60e3));
          return { ...r, pendDeleted: n0 - DEMO.devices.length };
        }
        return r;
      };
    }
  })();
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
