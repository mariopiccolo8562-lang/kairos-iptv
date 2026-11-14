/* Kairos Player — dati: le liste dell'utente (link M3U oppure accesso Xtream), lettura dei contenuti, preferiti.
   L'app si collega solo al server della lista scelta dall'utente. */
(function (KP) {
  'use strict';

  KP.get = function (url, cb, timeout) {
    var x = new XMLHttpRequest(), done = false;
    function end(err, txt) { if (done) return; done = true; cb(err, txt); }
    try {
      x.open('GET', url, true);
      x.timeout = timeout || 45000;
      x.onload = function () { if (x.status >= 200 && x.status < 300) end(null, x.responseText); else end(x.status === 401 || x.status === 403 ? 'auth' : 'net'); };
      x.onerror = function () { end('net'); };
      x.ontimeout = function () { end('net'); };
      x.send();
    } catch (e) { end('net'); }
  };
  function json(url, cb) { KP.get(url, function (err, txt) { if (err) return cb(err); var j; try { j = JSON.parse(txt); } catch (e) { return cb('net'); } cb(null, j); }); }
  function enc(s) { return encodeURIComponent(String(s)); }
  /** indirizzo scritto dall'utente → http(s)://server[:porta] senza barra finale; '' se non valido */
  KP.cleanHost = function (v) {
    v = String(v || '').replace(/^\s+|\s+$/g, ''); if (!v) return '';
    if (!/^https?:\/\//i.test(v)) v = 'http://' + v;
    var m = /^(https?:\/\/[^\/\s?#]+)/i.exec(v);
    return m ? m[1] : '';
  };
  /** link M3U del tipo …/get.php?username=…&password=… → accesso Xtream (così ci sono categorie, film, serie e guida) */
  KP.xtreamFromUrl = function (url) {
    var u = /[?&]username=([^&]+)/i.exec(url), p = /[?&]password=([^&]+)/i.exec(url), h = KP.cleanHost(url);
    if (!u || !p || !h || !/\.php(\?|$)/i.test(url)) return null;
    var dec = function (s) { try { return decodeURIComponent(s.replace(/\+/g, ' ')); } catch (e) { return s; } };
    return { host: h, user: dec(u[1]), pass: dec(p[1]) };
  };

  /* ---------- liste salvate ---------- */
  KP.lists = KP.load('lists', []);
  KP.activeId = KP.load('active', '');
  KP.saveLists = function () { KP.save('lists', KP.lists); KP.save('active', KP.activeId); };
  KP.active = function () { for (var i = 0; i < KP.lists.length; i++) if (KP.lists[i].id === KP.activeId) return KP.lists[i]; return KP.lists[0] || null; };
  KP.newId = function () { return 'l' + new Date().getTime().toString(36) + Math.floor(Math.random() * 1e6).toString(36); };

  /* ---------- contenuti della lista in uso (in memoria) ---------- */
  function blank() { return { live: { cats: null, items: null }, vod: { cats: null, items: null }, series: { cats: null, items: null }, listId: '' }; }
  KP.db = blank();
  KP.resetDb = function () { KP.db = blank(); };
  var ADULT = /xxx|adult|adulti|18\+|\+18|porn|erotic/i;
  KP.isAdult = function (name) { return ADULT.test(String(name || '')); };
  KP.showAdult = function () { return KP.set.adult === true; };

  /* ---------- Xtream ---------- */
  function api(pl, action, extra) { return pl.host + '/player_api.php?username=' + enc(pl.user) + '&password=' + enc(pl.pass) + (action ? '&action=' + action : '') + (extra || ''); }
  KP.xtCheck = function (pl, cb) {
    json(api(pl), function (err, j) {
      if (err) return cb(err);
      var ui = j && j.user_info;
      if (!ui || String(ui.auth) === '0' || (ui.status && !/active|trial/i.test(String(ui.status)))) return cb('auth');
      cb(null, ui);
    });
  };
  var ACT = { live: ['get_live_categories', 'get_live_streams'], vod: ['get_vod_categories', 'get_vod_streams'], series: ['get_series_categories', 'get_series'] };
  function xtItem(kind, o) {
    return { kind: kind, id: String(kind === 'series' ? o.series_id : o.stream_id), name: String(o.name || o.title || ''), logo: String(o.stream_icon || o.cover || ''),
      cat: String(o.category_id || ''), ext: String(o.container_extension || ''), plot: String(o.plot || ''), year: String(o.year || o.releaseDate || '').slice(0, 4), rating: String(o.rating || '') };
  }
  function xtLoad(pl, kind, cb) {
    var d = KP.db[kind];
    json(api(pl, ACT[kind][0]), function (err, cats) {
      if (err) return cb(err);
      json(api(pl, ACT[kind][1]), function (err2, items) {
        if (err2) return cb(err2);
        var i, c = [], it = [];
        if (cats && cats.length) for (i = 0; i < cats.length; i++) c.push({ id: String(cats[i].category_id), name: String(cats[i].category_name || '') });
        if (items && items.length) for (i = 0; i < items.length; i++) it.push(xtItem(kind, items[i]));
        d.cats = c; d.items = it; cb(null);
      });
    });
  }
  /** indirizzi da riprodurre: il primo e, se non parte, quello di riserva */
  KP.urls = function (item) {
    var pl = KP.active(); if (!pl) return [];
    if (item.url) return [item.url];
    var base = pl.host + '/', cred = enc(pl.user) + '/' + enc(pl.pass) + '/';
    if (item.kind === 'live') return [base + 'live/' + cred + item.id + '.m3u8', base + 'live/' + cred + item.id + '.ts'];
    if (item.kind === 'episode') return [base + 'series/' + cred + item.id + '.' + (item.ext || 'mp4')];
    return [base + 'movie/' + cred + item.id + '.' + (item.ext || 'mp4')];
  };
  KP.seriesInfo = function (item, cb) {
    var pl = KP.active();
    if (!pl || pl.type !== 'xtream') return cb(null, item.eps || {});
    json(api(pl, 'get_series_info', '&series_id=' + enc(item.id)), function (err, j) {
      if (err) return cb(err);
      var out = {}, eps = (j && j.episodes) || {}, s, i;
      for (s in eps) { if (!eps.hasOwnProperty(s)) continue; out[s] = []; for (i = 0; i < eps[s].length; i++) { var e = eps[s][i]; out[s].push({ kind: 'episode', id: String(e.id), name: String(e.title || (KP.t('episode') + ' ' + e.episode_num)), num: e.episode_num, ext: String(e.container_extension || 'mp4'), logo: String((e.info && e.info.movie_image) || '') }); } }
      if (j && j.info && j.info.plot && !item.plot) item.plot = String(j.info.plot);
      cb(null, out);
    });
  };
  KP.vodInfo = function (item, cb) {
    var pl = KP.active();
    if (!pl || pl.type !== 'xtream' || item.plot) return cb();
    json(api(pl, 'get_vod_info', '&vod_id=' + enc(item.id)), function (err, j) { if (!err && j && j.info) { item.plot = String(j.info.plot || j.info.description || ''); if (!item.year) item.year = String(j.info.releasedate || '').slice(0, 4); } cb(); });
  };
  function b64(s) { try { return decodeURIComponent(escape(window.atob(String(s || '')))); } catch (e) { return ''; } }
  KP.epg = function (item, cb) {
    var pl = KP.active();
    if (!pl || pl.type !== 'xtream' || item.kind !== 'live') return cb([]);
    json(api(pl, 'get_short_epg', '&stream_id=' + enc(item.id) + '&limit=2'), function (err, j) {
      var out = [], l = (j && j.epg_listings) || [], i;
      if (!err) for (i = 0; i < l.length && i < 2; i++) out.push({ title: b64(l[i].title), start: String(l[i].start || '').slice(11, 16), end: String(l[i].end || '').slice(11, 16) });
      cb(out);
    });
  };

  /* ---------- M3U ---------- */
  KP.parseM3u = function (txt) {
    var lines = String(txt || '').split(/\r?\n/), out = { live: [], vod: [], series: [] }, info = null, i, n = 0;
    function attr(s, k) { var m = new RegExp(k + '="([^"]*)"', 'i').exec(s); return m ? m[1] : ''; }
    for (i = 0; i < lines.length; i++) {
      var l = lines[i].replace(/^\s+|\s+$/g, '');
      if (!l) continue;
      if (l.indexOf('#EXTINF') === 0) { var c = l.lastIndexOf(','); info = { name: c >= 0 ? l.substring(c + 1).replace(/^\s+|\s+$/g, '') : '', logo: attr(l, 'tvg-logo'), group: attr(l, 'group-title') }; continue; }
      if (l.charAt(0) === '#') continue;
      if (!/^https?:\/\//i.test(l)) { info = null; continue; }
      var path = l.split('?')[0], kind = /\/series\//i.test(path) ? 'series' : (/\/movie\//i.test(path) || /\.(mp4|mkv|avi|mov|m4v)$/i.test(path)) ? 'vod' : 'live';
      out[kind].push({ kind: kind === 'series' ? 'episode' : kind, id: 'm' + (n++), name: (info && info.name) || ('#' + n), logo: (info && info.logo) || '', cat: (info && info.group) || '', url: l, ext: '', plot: '', year: '', rating: '' });
      info = null;
    }
    return out;
  };
  function m3uFill(parsed) {
    var kinds = ['live', 'vod', 'series'], k, i;
    for (k = 0; k < kinds.length; k++) {
      var kind = kinds[k], items = parsed[kind], seen = {}, cats = [];
      for (i = 0; i < items.length; i++) { var g = items[i].cat || ''; if (g && !seen[g]) { seen[g] = 1; cats.push({ id: g, name: g }); } }
      KP.db[kind].cats = cats; KP.db[kind].items = items;
    }
  }

  /** controlla una lista prima di salvarla: cb(errore) */
  KP.check = function (pl, cb) {
    if (pl.type === 'xtream') return KP.xtCheck(pl, function (err) { cb(err || null); });
    KP.get(pl.url, function (err, txt) {
      if (err) return cb(err);
      var p = KP.parseM3u(txt);
      if (!p.live.length && !p.vod.length && !p.series.length) return cb('empty');
      KP.resetDb(); KP.db.listId = pl.id; m3uFill(p); cb(null);
    }, 90000);
  };
  /** carica una sezione della lista in uso (una volta sola): cb(errore) */
  KP.need = function (kind, cb) {
    var pl = KP.active(); if (!pl) return cb('nolist');
    if (KP.db.listId !== pl.id) { KP.resetDb(); KP.db.listId = pl.id; }
    if (KP.db[kind].items) return cb(null);
    if (pl.type === 'xtream') return xtLoad(pl, kind, cb);
    KP.get(pl.url, function (err, txt) { if (err) return cb(err); var p = KP.parseM3u(txt); m3uFill(p); cb(null); }, 90000);
  };
  KP.cats = function (kind) {
    var c = KP.db[kind].cats || [], out = [], i;
    for (i = 0; i < c.length; i++) if (KP.showAdult() || !KP.isAdult(c[i].name)) out.push(c[i]);
    return out;
  };
  KP.items = function (kind, catId) {
    var all = KP.db[kind].items || [], out = [], i, hide = {}, c = KP.db[kind].cats || [];
    if (!KP.showAdult()) for (i = 0; i < c.length; i++) if (KP.isAdult(c[i].name)) hide[c[i].id] = 1;
    for (i = 0; i < all.length; i++) { var it = all[i]; if (hide[it.cat]) continue; if (catId === '*' || it.cat === catId) out.push(it); }
    return out;
  };

  /* ---------- preferiti e ripresa dei film (per lista) ---------- */
  function fk() { var pl = KP.active(); return 'fav.' + (pl ? pl.id : ''); }
  KP.favs = function () { return KP.load(fk(), []); };
  KP.isFav = function (item) { var f = KP.favs(), i; for (i = 0; i < f.length; i++) if (f[i].kind === item.kind && f[i].id === item.id) return true; return false; };
  KP.toggleFav = function (item) {
    var f = KP.favs(), i, out = [], had = false;
    for (i = 0; i < f.length; i++) { if (f[i].kind === item.kind && f[i].id === item.id) had = true; else out.push(f[i]); }
    if (!had) out.unshift({ kind: item.kind, id: item.id, name: item.name, logo: item.logo, cat: item.cat, ext: item.ext, url: item.url || '' });
    KP.save(fk(), out.slice(0, 300));
    return !had;
  };
  KP.pos = function (item, v) {
    var pl = KP.active(), k = 'pos.' + (pl ? pl.id : ''), m = KP.load(k, {}), key = item.kind + ':' + item.id;
    if (v === undefined) return +m[key] || 0;
    if (v > 0) m[key] = Math.floor(v); else delete m[key];
    KP.save(k, m);
  };
})(KP);
