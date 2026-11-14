/* Kairos Player — schermate: prima lista, Home, Diretta, Film, Serie, scheda, preferiti, ricerca, liste, impostazioni. */
(function (KP) {
  'use strict';
  var app, stack = [], clockT = 0, onLeave = null, el = KP.el, t = KP.t;

  /* ---------- pila delle schermate ---------- */
  function show(name, arg) { var top = stack[stack.length - 1], c = KP.cur(); if (top && c && c._key !== undefined) top.fk = c._key; stack.push({ name: name, arg: arg || {} }); render(); }
  function replace(name, arg) { stack = [{ name: name, arg: arg || {} }]; render(); }
  function back() {
    if (stack.length > 1) { stack.pop(); render(); return; }
    if (stack[0] && stack[0].name === 'setup' && KP.lists.length) { replace('home'); return; }
    // prima schermata: sui TV LG decide il sistema (finestra «Uscire?» da webOS 6, prima la Home del TV), come chiede LG;
    // sugli altri TV si chiede conferma
    if (KP.webos) { KP.exit(); return; }
    KP.confirm(t('askExit'), t('exit'), KP.exit);
  }
  KP.onBack = back;
  function render() {
    var s = stack[stack.length - 1];
    if (onLeave) { var bye = onLeave; onLeave = null; bye(); } // la schermata che se ne va ferma i suoi timer
    KP.clear(app);
    var scr = el('div', 'screen s-' + s.name);
    app.appendChild(scr);
    SCREENS[s.name](scr, s.arg, s);
    focusKey(scr, s.fk);
  }
  function focusKey(root, key) {
    var l = root.querySelectorAll('.f'), i;
    if (key !== undefined) for (i = 0; i < l.length; i++) if (l[i]._key === key) { KP.focus(l[i]); return; }
    KP.first(root);
  }

  /* ---------- pezzi comuni ---------- */
  function header(scr, title) {
    var h = el('div', 'head'), pl = KP.active();
    h.appendChild(el('div', 'brand', 'KAIROS PLAYER'));
    h.appendChild(el('div', 'htitle', title || ''));
    h.appendChild(el('div', 'hlist', pl ? pl.name : ''));
    var c = el('div', 'clock'); h.appendChild(c);
    function tick() { var d = new Date(), m = d.getMinutes(); c.textContent = d.getHours() + ':' + (m < 10 ? '0' : '') + m; }
    tick(); window.clearInterval(clockT); clockT = window.setInterval(tick, 20000);
    scr.appendChild(h);
  }
  function btn(label, fn, cls) { var b = el('div', 'btn f' + (cls ? ' ' + cls : ''), label); b._ok = fn; return b; }
  function msg(scr, text) { var m = el('div', 'msg', text); scr.appendChild(m); return m; }
  /** «Caricamento…» con l'indicatore che gira (LG chiede un segno visibile mentre si carica) */
  function loading(text) { var m = el('div', 'msg busy'); m.appendChild(el('span', 'spin')); m.appendChild(document.createTextNode(text || t('loading'))); return m; }
  function errText(e) { return e === 'auth' ? t('errAuth') : e === 'empty' ? t('errEmpty') : e === 'nolist' ? t('noList') : e === 'big' ? t('errBig') : t('errNet'); }
  function img(src, cls) {
    var i = el('img', cls); i.alt = '';
    i.onerror = function () { i.style.visibility = 'hidden'; };
    if (src && /^https?:\/\//i.test(src)) i.src = src; else i.style.visibility = 'hidden';
    return i;
  }
  /** elenco lungo a pezzi: i primi subito, gli altri quando il fuoco si avvicina alla fine */
  function fill(box, items, make, chunk) {
    var n = 0;
    function more() { var end = Math.min(items.length, n + chunk), i; for (i = n; i < end; i++) box.appendChild(wrap(items[i], i)); n = end; }
    function wrap(it, i) { var e = make(it, i), f0 = e._focus; e._focus = function () { if (i > n - 14 && n < items.length) more(); if (f0) f0(); }; return e; }
    more();
    if (!items.length) box.appendChild(el('div', 'msg', t('empty')));
  }
  function input(label, hint, value, secret) {
    var w = el('label', 'field'), i = el('input', 'f');
    w.appendChild(el('span', '', label));
    i.type = secret ? 'password' : 'text'; i.placeholder = hint || ''; i.value = value || '';
    i.setAttribute('autocomplete', 'off'); i.setAttribute('autocapitalize', 'off'); i.setAttribute('spellcheck', 'false');
    i._ok = function () { try { i.focus(); } catch (x) {} }; // OK sul campo: si apre la tastiera del TV
    w.appendChild(i); w._in = i;
    return w;
  }
  function askPin(title, cb) {
    var m = el('div', 'modal'), box = el('div', 'mbox'), prev = KP.cur(), f = input(title, '••••', '', true), row = el('div', 'mrow');
    f._in.setAttribute('maxlength', '4'); f._in.setAttribute('inputmode', 'numeric');
    m._close = function () { if (m.parentNode) m.parentNode.removeChild(m); if (prev && document.body.contains(prev)) KP.focus(prev); else KP.first(); };
    row.appendChild(btn(t('cancel'), function () { m._close(); }));
    row.appendChild(btn(t('ok'), function () { var v = f._in.value.replace(/\D/g, ''); m._close(); cb(v); }, 'pri'));
    box.appendChild(f); box.appendChild(row); m.appendChild(box); document.body.appendChild(m);
    KP.focus(f._in);
  }

  var SCREENS = {};

  /* ---------- aggiungi una lista (anche prima apertura) ---------- */
  SCREENS.setup = function (scr, arg) {
    header(scr, t('addList'));
    var box = el('div', 'panel'), type = arg.type || 'm3u', first = !KP.lists.length;
    var hello = null;
    if (first) { box.appendChild(el('h1', '', t('welcome'))); hello = el('p', 'lead', t('welcomeTxt')); box.appendChild(hello); }
    var seg = el('div', 'seg'), fields = el('div', 'fields'), status = el('div', 'status', ''), F = {}, row = el('div', 'mrow'), pair = null, pollT = 0, gone = false;
    /** riga di stato; busy = con l'indicatore che gira */
    function say(text, busy) { KP.clear(status); if (busy) status.appendChild(el('span', 'spin')); status.appendChild(document.createTextNode(text || '')); }
    function stopPair() { window.clearInterval(pollT); pollT = 0; pair = null; }
    onLeave = function () { gone = true; stopPair(); };
    /* «Dal telefono»: il TV chiede un codice, lo mostra con l'indirizzo della pagina, poi aspetta che la lista arrivi */
    function phone() {
      stopPair(); say(t('loading'), true);
      KP.post(KP.PAIR + '/api/tv/pair', {}, function (err, j) {
        if (gone || type !== 'phone') return;
        if (err || !j || !j.code) { say(t('phoneErr')); return; }
        pair = j; say(t('phoneWait'), true);
        var page = KP.PAIR.replace(/^https?:\/\//i, '') + '/tv', code = String(j.code), box = el('div', 'phone'), left = el('div', 'phl');
        left.appendChild(el('div', 'phk', '1 · ' + t('phoneOpen'))); left.appendChild(el('div', 'phv', page));
        left.appendChild(el('div', 'phk', '2 · ' + t('phoneCode'))); left.appendChild(el('div', 'phcode', code.slice(0, 3) + ' ' + code.slice(3)));
        box.appendChild(left);
        try { if (window.KXQR) { var q = el('div', 'qr'); q.innerHTML = window.KXQR.svg(KP.PAIR + '/tv?c=' + code); box.appendChild(q); } } catch (e) {}
        KP.clear(fields); fields.appendChild(el('p', 'lead', t('phoneLead'))); fields.appendChild(box); fields.appendChild(el('p', 'note', t('phoneNote')));
        pollT = window.setInterval(function () {
          if (!pair) return;
          KP.post(KP.PAIR + '/api/tv/poll', { code: pair.code, secret: pair.secret }, function (e2, r) {
            if (gone || !pair || e2 || !r) return;
            if (r.status === 'gone') { stopPair(); say(t('phoneOld')); return; }
            if (r.status !== 'ready' || !r.list) return;
            stopPair(); say(t('phoneGot'), true);
            var l = r.list, pl = { id: KP.newId(), name: String(l.name || ''), type: l.type === 'xtream' ? 'xtream' : 'm3u' };
            if (pl.type === 'xtream') { pl.host = KP.cleanHost(l.host); pl.user = String(l.user || ''); pl.pass = String(l.pass || ''); }
            else { var xt2 = KP.xtreamFromUrl(String(l.url || '')); if (xt2) { pl.type = 'xtream'; pl.host = xt2.host; pl.user = xt2.user; pl.pass = xt2.pass; } else pl.url = String(l.url || ''); }
            commit(pl);
          });
        }, 3000);
      });
    }
    function draw() {
      KP.clear(seg); KP.clear(fields); KP.clear(row); stopPair(); say('');
      if (hello) hello.style.display = type === 'phone' ? 'none' : ''; // con codice e QR lo spazio serve tutto
      function tb(k, label) { var b0 = btn(label, function () { type = k; arg.type = k; draw(); var l = seg.childNodes, i; for (i = 0; i < l.length; i++) if (l[i]._key === 't:' + k) KP.focus(l[i]); }, type === k ? 'sel' : ''); b0._key = 't:' + k; return b0; }
      seg.appendChild(tb('m3u', t('typeM3u'))); seg.appendChild(tb('xtream', t('typeXt'))); seg.appendChild(tb('phone', t('typePhone')));
      if (type === 'phone') {
        row.appendChild(btn(t('newCode'), phone));
        if (!first) row.appendChild(btn(t('cancel'), back));
        phone();
        return;
      }
      row.appendChild(btn(t('save'), save, 'pri'));
      if (!first) row.appendChild(btn(t('cancel'), back));
      F.name = input(t('name'), t('nameHint'), F.name ? F.name._in.value : '');
      fields.appendChild(F.name);
      if (type === 'm3u') { F.url = input(t('url'), t('urlHint'), F.url ? F.url._in.value : ''); fields.appendChild(F.url); }
      else {
        F.host = input(t('host'), t('hostHint'), F.host ? F.host._in.value : ''); F.user = input(t('user'), '', F.user ? F.user._in.value : ''); F.pass = input(t('pass'), '', F.pass ? F.pass._in.value : '', true);
        fields.appendChild(F.host); fields.appendChild(F.user); fields.appendChild(F.pass);
      }
    }
    var busy = false;
    /** controlla la lista e, se va, la salva e la mette in uso */
    function commit(pl) {
      if (!pl.name) pl.name = (pl.host || pl.url || '').replace(/^https?:\/\//i, '').split('/')[0].split(':')[0];
      busy = true; if (type !== 'phone') say(t('saving'), true);
      KP.check(pl, function (err) {
        busy = false;
        if (gone) return;
        if (err) { say(errText(err)); return; }
        if (pl.type === 'xtream') KP.resetDb();
        KP.lists.push(pl); KP.activeId = pl.id; KP.saveLists();
        replace('home');
      });
    }
    function save() {
      if (busy) return;
      var pl = { id: KP.newId(), name: F.name._in.value.replace(/^\s+|\s+$/g, ''), type: type };
      if (type === 'm3u') {
        var u = F.url._in.value.replace(/^\s+|\s+$/g, ''); if (u && !/^https?:\/\//i.test(u)) u = 'http://' + u;
        if (!KP.cleanHost(u)) { status.textContent = t('errFields'); return; }
        var xt = KP.xtreamFromUrl(u); // link «get.php?username=…»: si usa come accesso Xtream (categorie, film, serie, guida)
        if (xt) { pl.type = 'xtream'; pl.host = xt.host; pl.user = xt.user; pl.pass = xt.pass; } else pl.url = u;
      } else {
        pl.host = KP.cleanHost(F.host._in.value); pl.user = F.user._in.value.replace(/^\s+|\s+$/g, ''); pl.pass = F.pass._in.value;
        if (!pl.host || !pl.user || !pl.pass) { status.textContent = t('errFields'); return; }
      }
      commit(pl);
    }
    draw();
    box.appendChild(seg); box.appendChild(fields);
    box.appendChild(row); box.appendChild(status);
    box.appendChild(el('p', 'note', t('rights')));
    scr.appendChild(box);
  };

  /* ---------- Home ---------- */
  SCREENS.home = function (scr) {
    header(scr, '');
    var g = el('div', 'tiles'), items = [['live', '📺'], ['vod', '🎬'], ['series', '🎞'], ['fav', '★'], ['search', '🔎'], ['lists', '☰'], ['settings', '⚙']], i;
    function tile(k, ic) {
      var e = el('div', 'tile f t-' + k); e._key = k;
      e.appendChild(el('div', 'tic', ic)); e.appendChild(el('div', 'tname', t(k)));
      e._ok = function () { show(k === 'live' || k === 'vod' || k === 'series' ? 'section' : k, { kind: k }); };
      return e;
    }
    for (i = 0; i < items.length; i++) g.appendChild(tile(items[i][0], items[i][1]));
    scr.appendChild(g);
    scr.appendChild(el('p', 'note center', t('rights')));
  };

  /* ---------- Diretta, Film, Serie ---------- */
  SCREENS.section = function (scr, arg, entry) {
    var kind = arg.kind;
    header(scr, t(kind));
    var wait = loading(); scr.appendChild(wait);
    KP.need(kind, function (err) {
      if (stack[stack.length - 1] !== entry) return; // nel frattempo si è cambiata schermata
      scr.removeChild(wait);
      if (err) { msg(scr, errText(err)); var r = el('div', 'mrow'); r.appendChild(btn(t('refresh'), function () { render(); }, 'pri')); scr.appendChild(r); KP.first(scr); return; }
      var cols = el('div', 'cols'), cbox = el('div', 'cats scroll'), right = el('div', 'right'), cats = [{ id: '*', name: t('all') }].concat(KP.cats(kind)), i;
      if (arg.cat === undefined) arg.cat = '*';
      function cat(c) {
        var e = el('div', 'cat f' + (c.id === arg.cat ? ' sel' : ''), c.name || '—'); e._key = 'c:' + c.id;
        e._ok = function () { arg.cat = c.id; entry.fk = 'c:' + c.id; render(); };
        return e;
      }
      for (i = 0; i < cats.length; i++) cbox.appendChild(cat(cats[i]));
      var items = KP.items(kind, arg.cat);
      right.appendChild(el('div', 'count', items.length + ' ' + t(kind === 'live' ? 'channels' : 'titles')));
      if (kind === 'live') liveList(right, items); else grid(right, items);
      cols.appendChild(cbox); cols.appendChild(right); scr.appendChild(cols);
      focusKey(scr, entry.fk);
    });
  };
  function liveList(right, items) {
    var wrap = el('div', 'livewrap'), list = el('div', 'rows scroll'), info = el('div', 'info'), epgT = 0;
    function row(it, i) {
      var e = el('div', 'row f'); e._key = 'i:' + it.id;
      e.appendChild(el('span', 'num', i + 1)); e.appendChild(img(it.logo, 'logo')); e.appendChild(el('span', 'rname', it.name));
      if (KP.isFav(it)) e.appendChild(el('span', 'star', '★'));
      e._focus = function () {
        KP.clear(info); info.appendChild(img(it.logo, 'biglogo')); info.appendChild(el('h2', '', it.name));
        window.clearTimeout(epgT);
        epgT = window.setTimeout(function () { KP.epg(it, function (l) { if (KP.cur() !== e) return; for (var k = 0; k < l.length; k++) { info.appendChild(el('div', 'epg-h', t(k ? 'next' : 'now') + (l[k].start ? ' · ' + l[k].start + '–' + l[k].end : ''))); info.appendChild(el('div', 'epg-t', l[k].title)); } }); }, 500);
      };
      e._ok = function () { stack[stack.length - 1].fk = e._key; KP.player.play({ item: it, list: items, index: i, onClose: function (last) { stack[stack.length - 1].fk = 'i:' + last.id; render(); } }); };
      return e;
    }
    fill(list, items, row, 80);
    wrap.appendChild(list); wrap.appendChild(info); right.appendChild(wrap);
  }
  function grid(right, items) {
    var g = el('div', 'grid scroll');
    function card(it) {
      var e = el('div', 'card f'); e._key = 'i:' + it.id;
      e.appendChild(el('div', 'ctitle', it.name)); e.appendChild(img(it.logo, 'poster'));
      e._ok = function () { if (it.kind === 'episode' && it.url) playItem(it, false); else show('detail', { item: it }); };
      return e;
    }
    fill(g, items, card, 48);
    right.appendChild(g);
  }
  function playItem(it, resume) { KP.player.play({ item: it, resume: resume, onClose: function () { render(); } }); }

  /* ---------- scheda di un film o di una serie ---------- */
  SCREENS.detail = function (scr, arg, entry) {
    var it = arg.item;
    header(scr, t(it.kind === 'series' ? 'series' : 'vod'));
    var box = el('div', 'detail'), left = el('div', 'dleft'), right = el('div', 'dright'), plot = el('p', 'plot', it.plot || ''), acts = el('div', 'mrow');
    left.appendChild(img(it.logo, 'dposter'));
    right.appendChild(el('h1', '', it.name));
    right.appendChild(el('div', 'meta', [it.year, it.rating ? '★ ' + it.rating : ''].join('  ').replace(/^\s+|\s+$/g, '')));
    right.appendChild(plot); right.appendChild(acts);
    function favBtn() { var b = btn(t(KP.isFav(it) ? 'delFav' : 'addFav'), function () { KP.toggleFav(it); entry.fk = 'fav'; render(); }); b._key = 'fav'; return b; }
    if (it.kind === 'series') {
      acts.appendChild(favBtn());
      var eps = el('div', 'eps'); right.appendChild(eps); eps.appendChild(loading());
      KP.seriesInfo(it, function (err, seasons) {
        if (stack[stack.length - 1] !== entry) return;
        KP.clear(eps); plot.textContent = it.plot || '';
        if (err) { eps.appendChild(el('div', 'msg', errText(err))); return; }
        var keys = [], k, i;
        for (k in seasons) if (seasons.hasOwnProperty(k)) keys.push(k);
        keys.sort(function (a, b) { return (+a || 0) - (+b || 0); });
        if (!keys.length) { eps.appendChild(el('div', 'msg', t('empty'))); return; }
        if (arg.season === undefined || !seasons[arg.season]) arg.season = keys[0];
        var srow = el('div', 'seg');
        function sb(s) { var b = btn(t('seasons') + ' ' + s, function () { arg.season = s; entry.fk = 's:' + s; render(); }, s === arg.season ? 'sel' : ''); b._key = 's:' + s; return b; }
        for (i = 0; i < keys.length; i++) srow.appendChild(sb(keys[i]));
        eps.appendChild(srow);
        var list = el('div', 'rows scroll');
        fill(list, seasons[arg.season], function (e) {
          var r = el('div', 'row f'); r._key = 'e:' + e.id;
          r.appendChild(el('span', 'num', e.num || '')); r.appendChild(el('span', 'rname', e.name));
          r._ok = function () { entry.fk = r._key; playItem(e, KP.pos(e) > 30); };
          return r;
        }, 60);
        eps.appendChild(list);
        if (entry.fk !== undefined) focusKey(scr, entry.fk);
      });
    } else {
      var at = KP.pos(it), p = btn(t(at > 30 ? 'resume' : 'play'), function () { entry.fk = 'play'; playItem(it, at > 30); }, 'pri'); p._key = 'play';
      acts.appendChild(p);
      if (at > 30) acts.appendChild(btn(t('fromStart'), function () { KP.pos(it, 0); playItem(it, false); }));
      acts.appendChild(favBtn());
      KP.vodInfo(it, function () { if (stack[stack.length - 1] === entry) plot.textContent = it.plot || ''; });
    }
    box.appendChild(left); box.appendChild(right); scr.appendChild(box);
  };

  /* ---------- preferiti ---------- */
  SCREENS.fav = function (scr, arg, entry) {
    header(scr, t('fav'));
    var list = el('div', 'rows scroll wide'), f = KP.favs(), lives = [], i;
    for (i = 0; i < f.length; i++) if (f[i].kind === 'live') lives.push(f[i]);
    fill(list, f, function (it) {
      var e = el('div', 'row f'); e._key = it.kind + ':' + it.id;
      e.appendChild(el('span', 'num', it.kind === 'live' ? '📺' : it.kind === 'series' ? '🎞' : '🎬')); e.appendChild(img(it.logo, 'logo')); e.appendChild(el('span', 'rname', it.name));
      e._ok = function () {
        entry.fk = e._key;
        if (it.kind === 'live') { var idx = 0, k; for (k = 0; k < lives.length; k++) if (lives[k].id === it.id) idx = k; KP.player.play({ item: it, list: lives, index: idx, onClose: function () { render(); } }); }
        else show('detail', { item: it });
      };
      return e;
    }, 80);
    scr.appendChild(list);
  };

  /* ---------- ricerca nella lista in uso ---------- */
  SCREENS.search = function (scr, arg, entry) {
    header(scr, t('search'));
    var f = input(t('search'), t('searchHint'), arg.q || ''), res = el('div', 'rows scroll wide'), timer = 0, ready = false;
    f._in._key = 'q';
    scr.appendChild(f); scr.appendChild(res);
    function run() {
      var q = f._in.value.toLowerCase().replace(/^\s+|\s+$/g, ''); arg.q = f._in.value;
      KP.clear(res);
      if (!ready) { res.appendChild(loading()); return; }
      if (q.length < 2) { res.appendChild(el('div', 'msg', t('searchHint'))); return; }
      var kinds = ['live', 'vod', 'series'], out = [], k, i;
      for (k = 0; k < kinds.length && out.length < 90; k++) { var all = KP.items(kinds[k], '*'); for (i = 0; i < all.length && out.length < 90; i++) if (all[i].name.toLowerCase().indexOf(q) >= 0) out.push(all[i]); }
      fill(res, out, function (it) {
        var e = el('div', 'row f'); e._key = it.kind + ':' + it.id;
        e.appendChild(el('span', 'num', it.kind === 'live' ? '📺' : it.kind === 'vod' ? '🎬' : '🎞')); e.appendChild(img(it.logo, 'logo')); e.appendChild(el('span', 'rname', it.name));
        e._ok = function () { entry.fk = e._key; if (it.kind === 'live' || (it.kind === 'episode' && it.url)) KP.player.play({ item: it, onClose: function () { render(); } }); else show('detail', { item: it }); };
        return e;
      }, 90);
    }
    f._in.oninput = function () { window.clearTimeout(timer); timer = window.setTimeout(run, 350); };
    run();
    KP.need('live', function () { KP.need('vod', function () { KP.need('series', function () { if (stack[stack.length - 1] !== entry) return; ready = true; run(); if (entry.fk && entry.fk !== 'q') focusKey(scr, entry.fk); }); }); });
  };

  /* ---------- le mie liste: aggiungi, cambia, aggiorna, elimina ---------- */
  SCREENS.lists = function (scr, arg, entry) {
    header(scr, t('lists'));
    var box = el('div', 'panel wide'), i, act = KP.active();
    function line(pl) {
      var r = el('div', 'lrow'), on = act && act.id === pl.id;
      r.appendChild(el('div', 'lname', pl.name + (on ? '  ·  ' + t('inUse') : '')));
      r.appendChild(el('div', 'ltype', pl.type === 'xtream' ? t('typeXt') : t('typeM3u')));
      var u = btn(t('use'), function () { KP.activeId = pl.id; KP.saveLists(); KP.resetDb(); entry.fk = 'u:' + pl.id; render(); }, on ? 'sel' : ''); u._key = 'u:' + pl.id;
      var rf = btn(t('refresh'), function () { KP.activeId = pl.id; KP.saveLists(); KP.resetDb(); KP.toast(t('refreshed')); entry.fk = 'r:' + pl.id; render(); }); rf._key = 'r:' + pl.id;
      var d = btn(t('remove'), function () {
        KP.confirm(t('askRemove', pl.name), t('remove'), function () {
          var out = [], k; for (k = 0; k < KP.lists.length; k++) if (KP.lists[k].id !== pl.id) out.push(KP.lists[k]);
          KP.lists = out; if (KP.activeId === pl.id) KP.activeId = out.length ? out[0].id : ''; KP.saveLists(); KP.resetDb();
          try { window.localStorage.removeItem('kp.fav.' + pl.id); window.localStorage.removeItem('kp.pos.' + pl.id); } catch (x) {}
          KP.toast(t('removed')); if (!out.length) replace('setup'); else render();
        });
      });
      r.appendChild(u); r.appendChild(rf); r.appendChild(d);
      return r;
    }
    for (i = 0; i < KP.lists.length; i++) box.appendChild(line(KP.lists[i]));
    var add = btn('+ ' + t('addList'), function () { show('setup'); }, 'pri'); add._key = 'add';
    var row = el('div', 'mrow'); row.appendChild(add); box.appendChild(row);
    scr.appendChild(box);
  };

  /* ---------- impostazioni ---------- */
  SCREENS.settings = function (scr, arg, entry) {
    header(scr, t('settings'));
    var box = el('div', 'panel wide');
    function line(key, label, value, fn) { var r = el('div', 'srow f'); r._key = key; r.appendChild(el('span', 'sl', label)); r.appendChild(el('span', 'sv', value)); r._ok = function () { entry.fk = key; fn(); }; box.appendChild(r); }
    line('lang', t('language'), KP.lang === 'it' ? 'Italiano' : 'English', function () { KP.lang = KP.lang === 'it' ? 'en' : 'it'; KP.set.lang = KP.lang; KP.saveSet(); render(); });
    line('adult', t('parental'), t(KP.showAdult() ? 'shown' : 'hidden'), function () {
      if (KP.showAdult()) { KP.set.adult = false; KP.saveSet(); render(); return; }
      // mostrarle richiede il PIN dei genitori: se non c'è, lo si sceglie adesso
      if (!KP.set.pin) { askPin(t('pinSet'), function (v) { if (v.length === 4) { KP.set.pin = v; KP.set.adult = true; KP.saveSet(); } render(); }); return; }
      askPin(t('pinAsk'), function (v) { if (v === KP.set.pin) { KP.set.adult = true; KP.saveSet(); } else KP.toast(t('pinBad')); render(); });
    });
    line('pin', t('pin'), t(KP.set.pin ? 'pinOn' : 'pinNone'), function () {
      function choose() { askPin(t('pinSet'), function (v) { if (v.length === 4) { KP.set.pin = v; KP.saveSet(); } render(); }); }
      if (!KP.set.pin) return choose();
      askPin(t('pinAsk'), function (v) { if (v === KP.set.pin) choose(); else { KP.toast(t('pinBad')); render(); } });
    });
    line('info', t('info'), '', function () { KP.modal(t('info'), t('infoTxt', KP.version), [{ label: t('ok'), pri: true }]); });
    line('clear', t('clear'), '', function () { KP.confirm(t('askClear'), t('clear'), function () { KP.wipe(); KP.lists = []; KP.activeId = ''; KP.set = {}; KP.resetDb(); replace('setup'); }); });
    scr.appendChild(box);
  };

  /* ---------- avvio ---------- */
  KP.start = function () {
    app = document.getElementById('app');
    if (KP.lists.length) replace('home'); else replace('setup');
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', KP.start, false); else KP.start();
})(KP);
