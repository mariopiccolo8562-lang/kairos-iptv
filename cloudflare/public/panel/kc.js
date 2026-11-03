/* KAIROS Control 2.0 — pagine: Online ora, Segnalazioni, Richieste contenuti, Videoteca, Server DNS e VPN; Dispositivi a schede, Impostazioni a schede.
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
.dv-tile.pending b{color:#ffd37a}.dv-tile.soon b{color:#ffd37a}.dv-tile.expired b,.dv-tile.disabled b{color:#ff8f96}.dv-tile.active b{color:#7ef0ab}
.dv-bar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:16px}
.dv-q{flex:1;min-width:240px;position:relative}.dv-q svg{position:absolute;left:14px;top:50%;width:18px;height:18px;transform:translateY(-50%);color:var(--mut)}.dv-q .inp{margin:0;padding-left:42px}
#dvSort{width:auto;margin:0;flex:0 0 220px}
#v-devices.dv-cardsview #filters,#v-devices.dv-cardsview .tbl,#v-devices.dv-cardsview #noRows{display:none!important}
.dv-pend{margin-bottom:18px}.dv-pgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:10px}
.dv-pc{display:flex;flex-direction:column;gap:12px;padding:14px;border-radius:14px;border:1px solid rgba(255,194,61,.35);background:linear-gradient(135deg,rgba(255,194,61,.08),rgba(255,255,255,.02))}
.dv-pc .code.big{font-size:17px;padding:5px 10px}.dv-pc small{display:block;color:var(--mut);font-size:12px;margin-top:6px}
.dv-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:12px}
.dv-card{display:flex;flex-direction:column;gap:12px;padding:16px;border-radius:18px;border:1px solid var(--line);background:rgba(255,255,255,.03);cursor:pointer;transition:transform .15s,background .15s,border-color .15s}
.dv-card:hover{background:rgba(255,255,255,.055);border-color:rgba(255,255,255,.18);transform:translateY(-2px)}
.dv-card.expired,.dv-card.disabled{border-color:rgba(255,74,85,.28)}
.dv-top{display:flex;gap:12px;align-items:center}.dv-n{flex:1;min-width:0}.dv-n b{display:block;font-size:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dv-n .code{display:inline-block;margin-top:4px}
.dv-av{flex:none;width:42px;height:42px;border-radius:14px;display:grid;place-items:center;font-weight:800;font-size:18px;color:#fff;background:linear-gradient(135deg,hsl(var(--h,0) 75% 55%),hsl(calc(var(--h,0) + 40) 75% 42%))}
.dv-exp>div{display:flex;justify-content:space-between;gap:8px;font-size:13px}.dv-exp em{font-style:normal;font-weight:700}
.dv-exp>i{display:block;height:6px;border-radius:6px;background:rgba(255,255,255,.07);margin-top:7px;overflow:hidden}.dv-exp s{display:block;height:100%;border-radius:6px;background:linear-gradient(90deg,#3ddc84,#7ef0ab)}
.dv-exp.warn em{color:#ffd37a}.dv-exp.warn s{background:linear-gradient(90deg,#ffb23d,#ffd37a)}.dv-exp.bad em{color:#ff8f96}.dv-exp.bad s{background:linear-gradient(90deg,#ff2a3d,#ff7a45)}
.dv-info{display:grid;grid-template-columns:1fr 1fr;gap:6px 12px;font-size:12.5px;color:var(--mut)}.dv-info span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dv-kids{display:flex;flex-wrap:wrap;gap:6px}.dv-kids button{all:unset;cursor:pointer;font-size:12px;padding:4px 9px;border-radius:99px;background:rgba(255,255,255,.06);border:1px solid var(--line)}.dv-kids button:hover{background:rgba(255,255,255,.12)}
.dv-note{font-size:12.5px;color:var(--mut);padding:8px 10px;border-radius:10px;background:rgba(255,255,255,.03)}
.dv-act{display:flex;gap:6px;flex-wrap:wrap;margin-top:auto}.dv-act .btn{flex:1}.dv-act .dv-kick{flex:0 0 auto;color:#ff6b81;border-color:rgba(255,107,129,.35)}
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
.dvt-exp b,.dvt-dev b{display:block;font-weight:600;white-space:nowrap}
.dvt-exp small,.dvt-dev small{display:block;font-size:11px;color:var(--mut);margin-top:2px}
.dvt-exp small.warn{color:var(--warn)}.dvt-exp small.bad{color:var(--bad)}
.dvt-dev{max-width:170px}.dvt-dev b{overflow:hidden;text-overflow:ellipsis}
.dvt-pl{white-space:nowrap;max-width:170px;overflow:hidden;text-overflow:ellipsis}
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
.dvt-ib.b{color:#6fb7ff;border-color:rgba(111,183,255,.3);background:rgba(111,183,255,.08)}
.dvt-ib.k{color:#ff6b81;border-color:rgba(255,107,129,.35);background:rgba(255,107,129,.1)}
.dvt-ib.o{color:#ffb547;border-color:rgba(255,181,71,.3);background:rgba(255,181,71,.08)}
.dvt-ib.e{color:#a99bff;border-color:rgba(169,155,255,.3);background:rgba(169,155,255,.08)}
.dvt-ib.r{color:#ff5470;border-color:rgba(255,84,112,.3);background:rgba(255,84,112,.06)}
.dvt-bulk{display:none;position:sticky;top:8px;z-index:5;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 10px;padding:10px 14px;border-radius:14px;background:linear-gradient(90deg,rgba(124,92,255,.25),rgba(255,59,90,.18));border:1px solid rgba(124,92,255,.45);box-shadow:0 10px 30px rgba(0,0,0,.35)}
.dvt-bulk.on{display:flex}
@media (max-width:900px){.dvt th:nth-child(6),.dvt td:nth-child(6),.dvt th:nth-child(7),.dvt td:nth-child(7),.dvt th:nth-child(8),.dvt td:nth-child(8){display:none}}
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
    return `<div class="kc-row"><div><b>${esc(o.name || o.code)}</b><small><span class="mono">${esc(o.code)}</span> · ${o.online ? 'adesso' : ago(Date.now() - o.ago)}</small></div><div>${what}${play}</div><div>${net}</div><div>${where}</div><div>${app}</div><div class="kc-acts">${o.online && o.state !== 'idle' ? `<button class="btn sm danger" data-kkick="${esc(o.id)}" title="Interrompe subito la visione (l'abbonamento resta attivo)">⛔ Disconnetti</button>` : ''}${vpnBtn}<button class="btn sm" data-kopen="${esc(o.id)}">Scheda</button></div></div>`;
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
    $$('[data-kkick]', V).forEach((b) => (b.onclick = async () => { const d = D.devices.find((x) => x.id === b.dataset.kkick); if (d && (await kickDev(d))) { b.disabled = true; b.textContent = 'Disconnessione…'; } }));
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
      ['POST', '/devices/KXAB-12CD/kick', 'Disconnetti: interrompe la visione in corso entro ~20 s (l\'abbonamento resta attivo). Con ?all=1 anche i dispositivi collegati'],
      ['PUT', '/devices/KXAB-12CD', 'Modifica: name, notes, expires, active, playlists, maxConn, maxStreams, maxProfiles, plMode, plDefault, player ({live, movie, series}: auto · exo · vlc · "" = sceglie il cliente), perms, vpn, vpnLoc'],
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

  /* ---------- Impostazioni: schede tematiche e avviso delle modifiche non salvate ---------- */
  (function settingsTabs() {
    const V = $('#v-settings'); if (!V || !$('#stTabs')) return;
    const paneOf = (el) => { const p = el.closest('.st-pane'); return p && p.dataset.pane; };
    $$('.st-tab', V).forEach((t) => { t.insertAdjacentHTML('beforeend', '<span class="dot"></span>'); t.onclick = () => stShow(t.dataset.st); });
    window.stShow = (k) => {
      $$('.st-tab', V).forEach((t) => t.classList.toggle('on', t.dataset.st === k));
      $$('.st-pane', V).forEach((p) => p.classList.toggle('on', p.dataset.pane === k));
      $('#stSave').classList.toggle('hide', k === 'sec');
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
  /* ---------- Dispositivi (2.0): riquadri-filtro, clienti in schede, dispositivi da attivare in evidenza ---------- */
  (function devicesCards() {
    const V = $('#v-devices'); if (!V) return;
    V.insertAdjacentHTML('afterbegin', `<div class="dv-tiles" id="dvTiles"></div>
      <div class="dv-bar"><div class="dv-q"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input class="inp" id="dvQ" placeholder="Cerca per nome, codice, note o modello"></div>
        <select class="inp" id="dvSort"><option value="exp">Scadenza più vicina</option><option value="name">Nome A–Z</option><option value="seen">Ultimo accesso</option><option value="new">Aggiunti di recente</option></select>
        <div class="seg" id="dvView"><button data-dv="cards" title="Schede grandi: comode con pochi clienti">Schede</button><button data-dv="table" title="Tabella compatta con azioni rapide e selezione multipla: comoda con tanti clienti">Tabella</button><button data-dv="list" title="Elenco semplice di prima">Elenco</button></div></div>
      <div id="dvPend"></div><div class="dv-grid" id="dvCards"></div><div id="dvBulk" class="dvt-bulk"></div><div id="dvTbl"></div><div id="dvMore"></div>`);
    const st = { view: 'cards', sort: 'exp', limit: 60, sel: new Set() };
    try { st.view = localStorage.getItem('kc_dv') || 'cards'; st.sort = localStorage.getItem('kc_dvs') || 'exp'; } catch {}
    $('#dvSort').value = st.sort;
    const TILES = [
      ['all', 'Tutti', '👥', 'Ogni dispositivo'], ['active', 'Attivi', '✅', 'Abbonamento in corso'], ['soon', 'In scadenza', '⏳', 'Entro 14 giorni'],
      ['pending', 'Da attivare', '🆕', 'Aspettano te'], ['expired', 'Scaduti', '⌛', 'Da rinnovare'], ['disabled', 'Disattivati', '⏸️', 'Spenti da te'],
    ];
    const soon = (d) => d.status === 'active' && !d.parent && daysLeft(d) !== null && daysLeft(d) <= 14;
    const fit = (d, f) => f === 'all' || (f === 'soon' ? soon(d) : d.status === f);
    const initial = (t) => (String(t || '?').trim()[0] || '?').toUpperCase();
    const hue = (t) => { let h = 0; for (const c of String(t || '')) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
    const hostsOf = (d) => [...new Set((d.playlists || []).map((p) => { try { return new URL(p.type === 'xtream' ? p.host : p.url).hostname; } catch { return ''; } }).filter(Boolean))];
    function card(d) {
      const kids = kidsOf(d.id), dl = daysLeft(d), tot = 365;
      const pct = dl === null ? 100 : Math.max(0, Math.min(100, (dl / tot) * 100));
      const tone = d.status !== 'active' ? 'bad' : dl !== null && dl <= 3 ? 'bad' : dl !== null && dl <= 14 ? 'warn' : 'ok';
      const name = d.name || '— senza nome —';
      return `<div class="dv-card ${d.status}" data-id="${esc(d.id)}">
        <div class="dv-top"><div class="dv-av" style="--h:${hue(d.name || d.code)}">${esc(initial(d.name || d.code))}</div>
          <div class="dv-n"><b>${esc(name)}</b><span class="code">${esc(d.code)}</span></div>${stPill(d.status)}</div>
        <div class="dv-exp ${tone}"><div><span>${d.expires ? 'Scade il <b>' + esc(fmtD(d.expires)) + '</b>' : '<b>Senza scadenza</b>'}</span><em>${dl === null ? '∞' : dl < 0 ? 'scaduto da ' + -dl + ' g' : dl === 0 ? 'oggi' : 'tra ' + dl + ' g'}</em></div><i><s style="width:${pct}%"></s></i></div>
        <div class="dv-info">
          <span title="Modello">📺 ${esc(d.model || '—')}</span>
          <span title="Ultimo accesso">🕒 ${esc(ago(d.lastSeen))}</span>
          <span title="Connessioni">🔗 ${1 + kids.length} di ${esc(d.maxConn || 1)}</span>
          <span title="Playlist">📋 ${(d.playlists || []).length ? (d.playlists || []).length + ' · ' + esc(hostsOf(d).slice(0, 2).join(', ') || '') : 'nessuna'}</span>
        </div>
        ${kids.length ? `<div class="dv-kids">${kids.map((k) => `<button data-open="${esc(k.id)}" title="${esc(k.code)}">↳ ${esc(k.name || k.model || k.code)}</button>`).join('')}</div>` : ''}
        ${d.notes ? `<div class="dv-note">📝 ${esc(d.notes.slice(0, 90))}</div>` : ''}
        <div class="dv-act">${d.status === 'active' ? '<button class="btn sm dv-kick" data-act="kick" title="Disconnetti: interrompe la visione in corso">⛔</button>' : ''}<button class="btn sm" data-act="ext1">+1 mese</button><button class="btn sm" data-act="ext12">+12 mesi</button><button class="btn sm ${d.active ? '' : 'pri'}" data-act="tog">${d.active ? 'Disattiva' : 'Riattiva'}</button><button class="btn sm pri" data-act="open">Apri scheda</button></div>
      </div>`;
    }
    function pendCard(d) {
      return `<div class="dv-pc" data-id="${esc(d.id)}"><div><span class="code big">${esc(d.code)}</span><small>${esc(d.model || 'Dispositivo')} · si è collegato ${esc(ago(d.lastSeen || d.createdAt))}</small></div>
        <div class="dv-act"><button class="btn sm pri" data-act="activate">Attiva</button><button class="btn sm" data-act="link">Collega a un cliente</button></div></div>`;
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
      const pls = sub ? '<span class="mut">dal principale</span>' : (d.playlists || []).length ? `${(d.playlists || []).length} · <span class="mut">${esc(hostsOf(d).slice(0, 1).join(''))}</span>` : '<span class="mut">nessuna</span>';
      const acts = d.status === 'pending' && !sub
        ? '<button class="btn sm pri" data-act="activate">Attiva</button><button class="btn sm" data-act="link">Collega</button>'
        : sub ? ib('kick', 'k', 'Disconnetti') + ib('edit', 'e', 'Apri scheda')
        : ib('ext1', 'g', '+1 mese') + ib('ext12', 'b', '+12 mesi') + (d.status === 'active' ? ib('kick', 'k', 'Disconnetti: interrompe la visione in corso') : '') + (d.active ? ib('off', 'o', 'Disattiva') : ib('on', 'g', 'Riattiva')) + ib('edit', 'e', 'Apri scheda') + ib('del', 'r', 'Elimina');
      return `<tr data-id="${esc(d.id)}" class="${sub ? 'sub' : ''} ${st.sel.has(d.id) ? 'sel' : ''}">
        <td class="c">${sub ? '' : `<input type="checkbox" data-sel="${esc(d.id)}" ${st.sel.has(d.id) ? 'checked' : ''}>`}</td>
        <td><div class="dvt-u">${sub ? '<span class="dvt-sub">↳</span>' : `<span class="dvt-av" style="--h:${hue(d.name || d.code)}">${esc(initial(d.name || d.code))}</span>`}<div><b>${esc(d.name || (sub ? d.model || 'Dispositivo' : '') || '— senza nome —')}</b><span class="dvt-code" data-copy="${esc(d.code)}" title="Copia il codice">${esc(d.code)} ${IC.copy}</span></div></div></td>
        <td>${stPill(d.status)}</td>
        <td class="dvt-exp">${exp}</td>
        <td class="c mono">${sub || d.status === 'pending' ? '—' : `${1 + kids.length}/${esc(d.maxConn || 1)}`}</td>
        <td class="dvt-dev"><b>${esc(d.model || '—')}</b><small>${esc(ago(d.lastSeen))}</small></td>
        <td class="dvt-pl">${pls}</td>
        <td class="dvt-note" data-note="${esc(d.id)}">${d.notes ? `<span>${esc(d.notes.slice(0, 60))}</span>` : `<span class="mut">Aggiungi nota</span>`} ${IC.note}</td>
        <td class="dvt-acts">${acts}</td></tr>`;
    }
    function renderTable(list, pend, q) {
      const rows = [];
      for (const d of [...pend, ...list.slice(0, st.limit)]) { rows.push(trow(d, false)); for (const k of kidsOf(d.id)) rows.push(trow(k, true)); }
      $('#dvTbl').innerHTML = rows.length ? `<div class="card glass dvt-wrap"><table class="dvt"><thead><tr><th class="c"><input type="checkbox" id="dvtAll" title="Seleziona tutti quelli mostrati"></th><th>Cliente</th><th>Stato</th><th>Scadenza</th><th class="c">Conn.</th><th>Dispositivo</th><th>Playlist</th><th>Note</th><th>Azioni</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>`
        : `<div class="emptyc" style="display:block">${q ? 'Nessun cliente trovato per «' + esc(q) + '»' : 'Nessun cliente in questo elenco'}</div>`;
      const all = $('#dvtAll'); if (all) { const ids = [...pend, ...list.slice(0, st.limit)].map((d) => d.id); all.checked = ids.length > 0 && ids.every((i) => st.sel.has(i)); all.onchange = () => { ids.forEach((i) => (all.checked ? st.sel.add(i) : st.sel.delete(i))); render(); }; }
      bulkBar();
    }
    function bulkBar() {
      for (const i of [...st.sel]) if (!D.devices.some((d) => d.id === i)) st.sel.delete(i);
      const n = st.sel.size;
      $('#dvBulk').innerHTML = n && st.view === 'table' ? `<b>${n} selezionat${n === 1 ? 'o' : 'i'}</b><button class="btn sm" data-bulk="ext1">+1 mese</button><button class="btn sm" data-bulk="ext12">+12 mesi</button><button class="btn sm danger" data-bulk="kick">⛔ Disconnetti</button><button class="btn sm" data-bulk="off">Disattiva</button><button class="btn sm" data-bulk="on">Riattiva</button><span style="flex:1"></span><button class="btn sm" data-bulk="clear">Deseleziona</button>` : '';
      $('#dvBulk').classList.toggle('on', !!n && st.view === 'table');
    }
    async function bulk(act) {
      if (act === 'clear') { st.sel.clear(); return render(); }
      const ds = [...st.sel].map((i) => D.devices.find((d) => d.id === i)).filter((d) => d && !d.parent && d.status !== 'pending');
      if (!ds.length) return toast('Nessun cliente attivabile tra quelli selezionati', 1);
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
      $('#dvTiles').innerHTML = TILES.map(([k, l, ic, sub]) => `<button class="dv-tile ${k} ${f === k ? 'on' : ''}" data-fl2="${k}"><i>${ic}</i><span><b>${D.devices.filter((d) => fit(d, k)).length}</b><em>${l}</em><small>${sub}</small></span></button>`).join('');
      $$('#dvView [data-dv]').forEach((b) => b.classList.toggle('on', b.dataset.dv === st.view));
      V.classList.toggle('dv-cardsview', st.view !== 'list');
      if (st.view === 'list') { $('#dvPend').innerHTML = $('#dvCards').innerHTML = $('#dvMore').innerHTML = $('#dvTbl').innerHTML = ''; bulkBar(); return; }
      const hay = (d) => [d.code, d.name, d.notes, d.model].join(' ').toLowerCase();
      const pend = D.devices.filter((d) => d.status === 'pending' && !d.parent && (f === 'all' || f === 'pending') && (!q || hay(d).includes(q)));
      $('#dvPend').innerHTML = pend.length ? `<div class="card glass dv-pend"><div class="hd"><h3>🆕 Da attivare <span class="cnt">${pend.length}</span><small>Il cliente apre l'app e ti legge il codice: premi <b>Attiva</b>, scegli durata e playlist. Se è una TV in più di un cliente che hai già, usa <b>Collega a un cliente</b>.</small></h3></div><div class="dv-pgrid">${pend.slice(0, 24).map(pendCard).join('')}</div></div>` : '';
      let list = D.devices.filter((d) => !d.parent && d.status !== 'pending' && fit(d, f) && (!q || hay(d).includes(q) || kidsOf(d.id).some((k) => hay(k).includes(q))));
      // connessioni che corrispondono alla ricerca ma il cui cliente principale non c'è (o è eliminato)
      const orphans = D.devices.filter((d) => d.parent && !parentOf(d) && (!q || hay(d).includes(q)) && f === 'all');
      const by = { exp: (a, b) => (daysLeft(a) ?? 1e9) - (daysLeft(b) ?? 1e9), name: (a, b) => String(a.name || a.code).localeCompare(String(b.name || b.code), 'it'), seen: (a, b) => (b.lastSeen || 0) - (a.lastSeen || 0), new: (a, b) => (b.createdAt || 0) - (a.createdAt || 0) }[st.sort];
      list = list.sort(by);
      if (st.view === 'table') {
        $('#dvPend').innerHTML = $('#dvCards').innerHTML = '';
        renderTable(list, pend, q);
        $('#dvMore').innerHTML = list.length > st.limit ? `<button class="btn" id="dvMoreB" style="width:100%;margin-top:14px">Mostra altri ${Math.min(100, list.length - st.limit)} (${list.length - st.limit} rimanenti)</button>` : '';
        $('#dvMoreB') && ($('#dvMoreB').onclick = () => { st.limit += 100; render(); });
        return;
      }
      $('#dvTbl').innerHTML = ''; bulkBar();
      const shown = list.slice(0, st.limit);
      $('#dvCards').innerHTML = shown.map(card).join('') + orphans.map((d) => `<div class="dv-card" data-id="${esc(d.id)}"><div class="dv-top"><div class="dv-av">?</div><div class="dv-n"><b>${esc(d.name || d.model || d.code)}</b><span class="code">${esc(d.code)}</span></div></div><p class="mut" style="font-size:13px">Connessione di un cliente eliminato</p><div class="dv-act"><button class="btn sm pri" data-act="open">Apri scheda</button></div></div>`).join('')
        || (pend.length ? '' : `<div class="emptyc" style="display:block;grid-column:1/-1">${q ? 'Nessun cliente trovato per «' + esc(q) + '»' : 'Nessun cliente in questo elenco'}</div>`);
      $('#dvMore').innerHTML = list.length > st.limit ? `<button class="btn" id="dvMoreB" style="width:100%;margin-top:14px">Mostra altri ${Math.min(60, list.length - st.limit)} (${list.length - st.limit} rimanenti)</button>` : '';
      $('#dvMoreB') && ($('#dvMoreB').onclick = () => { st.limit += 60; render(); });
    }
    V.addEventListener('click', async (e) => {
      const t = e.target.closest('[data-fl2]'); if (t) { D.filter = t.dataset.fl2; st.limit = st.view === 'table' ? 100 : 60; return renderDevices(); }
      const v = e.target.closest('[data-dv]'); if (v) { st.view = v.dataset.dv; st.limit = st.view === 'table' ? 100 : 60; try { localStorage.setItem('kc_dv', st.view); } catch {} return renderDevices(); }
      const o = e.target.closest('[data-open]'); if (o) { const k = D.devices.find((x) => x.id === o.dataset.open); if (k) openDrawer(k, false); return; }
      const bk = e.target.closest('[data-bulk]'); if (bk) return bulk(bk.dataset.bulk);
      const cp = e.target.closest('[data-copy]'); if (cp) { try { await navigator.clipboard.writeText(cp.dataset.copy); toast('Codice copiato: ' + cp.dataset.copy); } catch { toast(cp.dataset.copy); } return; }
      const sl = e.target.closest('[data-sel]'); if (sl) { sl.checked ? st.sel.add(sl.dataset.sel) : st.sel.delete(sl.dataset.sel); sl.closest('tr').classList.toggle('sel', sl.checked); const all = $('#dvtAll'); if (all && !sl.checked) all.checked = false; return bulkBar(); }
      const nt = e.target.closest('[data-note]');
      if (nt && !nt.querySelector('input')) {
        const d = D.devices.find((x) => x.id === nt.dataset.note); if (!d) return;
        nt.innerHTML = `<input class="inp dvt-ni" maxlength="300" value="${esc(d.notes || '')}" placeholder="Nota (Invio per salvare, Esc per annullare)">`;
        const inp = nt.querySelector('input'); inp.focus(); inp.select();
        let done = false;
        const fin = async (keep) => { if (done) return; done = true; if (keep && inp.value.trim() !== (d.notes || '')) { await save(d, { notes: inp.value.trim() }); toast('Nota salvata'); } else render(); };
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
        if (a === 'off') { if (!(await ask('Disattivare il cliente?', `<b>${esc(d.name || d.code)}</b> non potrà più guardare finché non lo riattivi.`, 'Disattiva'))) return; await save(d, { active: false }); return toast('Disattivato'); }
        if (a === 'on') { await save(d, { active: true }); return toast('Riattivato'); }
        if (a === 'del') {
          const n = kidsOf(d.id).length;
          if (!(await ask('Eliminare il dispositivo?', `Il codice <b class="mono">${esc(d.code)}</b> verrà rimosso e il player tornerà alla schermata di attivazione.${n ? ` Le ${n} connessioni collegate torneranno “in attesa”.` : ''}`, 'Elimina'))) return;
          try { await api('DELETE', '/admin/devices/' + d.id); st.sel.delete(d.id); await load(); toast('Eliminato'); } catch (er) { toast(er.message, 1); }
          return;
        }
        if (a === 'activate') return openDrawer(d, true);
        if (a === 'link') { openDrawer(d, false); setTimeout(() => { const s2 = $('#eLinkTo'); if (s2) { s2.scrollIntoView({ block: 'center' }); s2.focus(); } }, 350); return; }
        if (a === 'edit' || !e.target.closest('button,input')) return openDrawer(d, d.status === 'pending');
        return;
      }
      const c = e.target.closest('.dv-card, .dv-pc'); if (!c) return;
      const d = D.devices.find((x) => x.id === c.dataset.id); if (!d) return;
      const act = (e.target.closest('[data-act]') || {}).dataset?.act;
      if (act === 'ext1') return extend(d, 1);
      if (act === 'ext12') return extend(d, 12);
      if (act === 'kick') return kickDev(d);
      if (act === 'tog') { if (d.active && !(await ask('Disattivare il cliente?', `<b>${esc(d.name || d.code)}</b> non potrà più guardare finché non lo riattivi.`, 'Disattiva'))) return; await save(d, { active: !d.active }); return toast(d.active ? 'Cliente disattivato' : 'Cliente riattivato'); }
      if (act === 'activate') return openDrawer(d, true);
      if (act === 'link') { openDrawer(d, false); setTimeout(() => { const s = $('#eLinkTo'); if (s) { s.scrollIntoView({ block: 'center' }); s.focus(); } }, 350); return; }
      if (act === 'open' || !e.target.closest('button')) openDrawer(d, d.status === 'pending');
    });
    $('#dvQ').addEventListener('input', () => { st.limit = st.view === 'table' ? 100 : 60; render(); });
    $('#dvSort').onchange = (e) => { st.sort = e.target.value; try { localStorage.setItem('kc_dvs', st.sort); } catch {} render(); };
    const orig = window.renderDevices;
    window.renderDevices = renderDevices = function () { orig(); render(); };
    KC.dvRender = render;
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
