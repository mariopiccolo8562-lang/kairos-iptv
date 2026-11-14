/* Kairos Player — lettore: elemento <video> (webOS e browser) oppure AVPlay sui TV Samsung, con i comandi del telecomando.
   In diretta ▲ ▼ (e CH+ / CH−) cambiano canale; nei film ◀ ▶ saltano di 10 secondi e la posizione si ricorda. */
(function (KP) {
  'use strict';
  var P = { open: false, item: null, list: null, index: 0, urls: [], tryN: 0, live: false, av: false, osdT: 0, posT: 0, paused: false, onClose: null };
  var video, osd;
  function $(id) { return document.getElementById(id); }
  function avOk() { return KP.tizen && window.webapis && window.webapis.avplay; }
  function fmt(s) { s = Math.max(0, Math.floor(s)); var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (h ? h + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (x < 10 ? '0' : '') + x; }

  /* pulsanti a schermo: con il telecomando a puntatore (LG Magic Remote non ha play, pausa e avanti veloce) */
  function ctl(label, act, big) { var b = KP.el('div', 'obtn' + (big ? ' big' : ''), label); b.setAttribute('data-a', act); return b; }
  function controls() {
    var row = KP.el('div', 'octl');
    if (P.live) { row.appendChild(ctl('▲  ' + KP.t('chPrev'), 'prev')); row.appendChild(ctl('▼  ' + KP.t('chNext'), 'next')); }
    else { row.appendChild(ctl('◀◀  ' + KP.t('back10'), 'rw')); row.appendChild(ctl(P.paused ? '▶  ' + KP.t('resumePlay') : '❚❚  ' + KP.t('pause'), 'pp', true)); row.appendChild(ctl(KP.t('fwd10') + '  ▶▶', 'ff')); }
    row.appendChild(ctl('✕  ' + KP.t('close'), 'close'));
    return row;
  }
  function act(a) {
    if (a === 'close') return KP.player.close();
    if (a === 'pp') return pause(!P.paused);
    if (a === 'rw') return seek(-10);
    if (a === 'ff') return seek(10);
    if (a === 'prev') return zap(-1);
    if (a === 'next') return zap(1);
  }
  // con i comandi a schermo, barra e minuti del film si aggiornano ogni secondo
  function tick() {
    if (!P.open || P.live || !osd || osd.style.display !== 'block') return;
    var d = duration(), c = current(), f = osd.querySelector('.osd-fill'), tm = osd.querySelector('.osd-time');
    if (!(d > 0)) return;
    if (!f) return showOsd('', P.paused);
    f.style.width = Math.min(100, (c / d) * 100) + '%';
    if (tm) tm.textContent = fmt(c) + ' / ' + fmt(d);
  }
  function hideLater() { window.clearTimeout(P.osdT); P.osdT = window.setTimeout(function () { if (!P.paused) osd.style.display = 'none'; }, 4500); }
  function showOsd(state, keep) {
    if (!osd) return;
    KP.clear(osd);
    var top = KP.el('div', 'osd-top');
    if (P.live) top.appendChild(KP.el('span', 'osd-live', KP.t('liveTag')));
    top.appendChild(KP.el('span', 'osd-title', P.item ? P.item.name : ''));
    if (P.list && P.live) top.appendChild(KP.el('span', 'osd-n', (P.index + 1) + ' / ' + P.list.length));
    osd.appendChild(top);
    if (state) osd.appendChild(KP.el('div', 'osd-state', state));
    if (!P.live) { var d = duration(), c = current(); if (d > 0) { var bar = KP.el('div', 'osd-bar'), fill = KP.el('div', 'osd-fill'); fill.style.width = Math.min(100, (c / d) * 100) + '%'; bar.appendChild(fill); osd.appendChild(bar); osd.appendChild(KP.el('div', 'osd-time', fmt(c) + ' / ' + fmt(d))); } }
    osd.appendChild(controls());
    osd.appendChild(KP.el('div', 'osd-hint', KP.t(P.live ? 'hintLive' : 'hintVod')));
    osd.style.display = 'block';
    window.clearTimeout(P.osdT);
    if (!keep) hideLater();
  }
  function current() { try { return P.av ? window.webapis.avplay.getCurrentTime() / 1000 : (video.currentTime || 0); } catch (e) { return 0; } }
  function duration() { try { var d = P.av ? window.webapis.avplay.getDuration() / 1000 : video.duration; return isFinite(d) ? d : 0; } catch (e) { return 0; } }

  function stopEngine() {
    window.clearInterval(P.posT);
    try { if (P.av) { window.webapis.avplay.stop(); window.webapis.avplay.close(); } } catch (e) {}
    try { video.pause(); video.removeAttribute('src'); video.load(); } catch (e2) {}
    P.av = false;
  }
  function fail() {
    // primo indirizzo non partito: si prova quello di riserva (es. .ts al posto di .m3u8), poi si avvisa
    if (P.tryN + 1 < P.urls.length) { P.tryN++; start(); return; }
    showOsd(KP.t('errPlay'), true);
  }
  function started() {
    P.paused = false; showOsd('');
    if (!P.live) {
      var at = KP.pos(P.item);
      if (P.resume && at > 30 && at < duration() - 30) seekTo(at);
      P.resume = false;
      window.clearInterval(P.posT);
      P.posT = window.setInterval(function () { var c = current(), d = duration(); if (c > 30) KP.pos(P.item, d > 0 && c > d - 60 ? 0 : c); }, 10000);
    }
  }
  function start() {
    var url = P.urls[P.tryN]; if (!url) return fail();
    stopEngine();
    showOsd(KP.t('buffering'), true);
    if (avOk()) {
      try {
        var av = window.webapis.avplay;
        P.av = true; video.style.display = 'none'; $('avbox').style.display = 'block';
        av.open(url);
        av.setDisplayRect(0, 0, 1920, 1080);
        av.setListener({
          onbufferingstart: function () { showOsd(KP.t('buffering'), true); },
          onbufferingcomplete: function () { showOsd(''); },
          onstreamcompleted: function () { ended(); },
          onerror: function () { fail(); }
        });
        av.prepareAsync(function () { try { av.play(); started(); } catch (e) { fail(); } }, function () { fail(); });
        return;
      } catch (e2) { P.av = false; try { window.webapis.avplay.close(); } catch (e3) {} }
    }
    $('avbox').style.display = 'none'; video.style.display = 'block';
    video.src = url;
    try { var pr = video.play(); if (pr && pr['catch']) pr['catch'](function () {}); } catch (e4) {}
  }
  function ended() { if (P.live) return; KP.pos(P.item, 0); KP.player.close(); }
  function seekTo(sec) { try { if (P.av) window.webapis.avplay.seekTo(Math.max(0, sec * 1000)); else video.currentTime = Math.max(0, sec); } catch (e) {} }
  function seek(delta) { if (P.live) return; var d = duration(), t = Math.max(0, current() + delta); if (d > 0) t = Math.min(d - 2, t); seekTo(t); showOsd(''); }
  function pause(on) {
    P.paused = on;
    try { if (P.av) { if (on) window.webapis.avplay.pause(); else window.webapis.avplay.play(); } else if (on) video.pause(); else { var pr = video.play(); if (pr && pr['catch']) pr['catch'](function () {}); } } catch (e) {}
    showOsd(on ? '❚❚' : '', on);
  }
  function zap(step) {
    if (!P.live || !P.list || P.list.length < 2) return;
    P.index = (P.index + step + P.list.length) % P.list.length;
    P.item = P.list[P.index]; P.urls = KP.urls(P.item); P.tryN = 0;
    start();
  }
  function keys(k) {
    if (!P.open) return false;
    if (k === 'back' || k === 'stop') { KP.player.close(); return true; }
    if (k === 'ok') { if (P.live) showOsd(''); else pause(!P.paused); return true; }
    // il tasto Play e il tasto Pausa fanno entrambi play e pausa, come chiede la lista di controllo LG
    if (k === 'playpause' || k === 'play' || k === 'pause') { if (!P.live) pause(!P.paused); else showOsd(''); return true; }
    if (k === 'up' || k === 'chup') { if (P.live) zap(-1); else showOsd(''); return true; }
    if (k === 'down' || k === 'chdown') { if (P.live) zap(1); else showOsd(''); return true; }
    if (k === 'left' || k === 'rw') { if (P.live) showOsd(''); else seek(k === 'rw' ? -30 : -10); return true; }
    if (k === 'right' || k === 'ff') { if (P.live) showOsd(''); else seek(k === 'ff' ? 30 : 10); return true; }
    return true;
  }

  KP.player = {
    isOpen: function () { return P.open; },
    /** o = { item, list (canali per lo zapping), index, resume, onClose } */
    play: function (o) {
      video = $('video'); osd = $('osd');
      if (!video._kp) {
        video._kp = true;
        osd.addEventListener('click', function (ev) {
          var b = ev.target; while (b && b !== osd && !KP.has(b, 'obtn')) b = b.parentNode;
          if (b && b !== osd && P.open) { ev.stopPropagation(); act(b.getAttribute('data-a')); }
        }, false);
        // il puntatore che si muove mostra i comandi (e li tiene finché si muove)
        document.addEventListener('mousemove', function () { if (!P.open) return; if (osd.style.display !== 'block') showOsd(''); else hideLater(); }, false);
        document.addEventListener('click', function (ev) { if (P.open && !KP.up(ev.target, 'obtn') && osd.style.display !== 'block') showOsd(''); }, false);
        window.setInterval(tick, 1000);
        video.addEventListener('playing', function () { if (P.open && !P.av) started(); }, false);
        video.addEventListener('waiting', function () { if (P.open && !P.av) showOsd(KP.t('buffering'), true); }, false);
        video.addEventListener('error', function () { if (P.open && !P.av) fail(); }, false);
        video.addEventListener('ended', function () { if (P.open && !P.av) ended(); }, false);
      }
      P.open = true; P.item = o.item; P.list = o.list || null; P.index = o.index || 0; P.live = o.item.kind === 'live';
      P.urls = KP.urls(o.item); P.tryN = 0; P.resume = !!o.resume; P.onClose = o.onClose || null; P.paused = false;
      document.body.className = (document.body.className.replace(/ ?\bplaying\b/g, '') + ' playing').replace(/^ /, '');
      P.prevKeys = KP.keys; KP.keys = keys;
      start();
    },
    close: function () {
      if (!P.open) return;
      if (!P.live) { var c = current(), d = duration(); if (c > 30) KP.pos(P.item, d > 0 && c > d - 60 ? 0 : c); }
      stopEngine();
      P.open = false; window.clearTimeout(P.osdT);
      if (osd) osd.style.display = 'none';
      video.style.display = 'none'; $('avbox').style.display = 'none';
      document.body.className = document.body.className.replace(/ ?\bplaying\b/g, '');
      KP.keys = P.prevKeys || null;
      var cb = P.onClose; P.onClose = null; if (cb) cb(P.item);
    },
    /** l'app va in secondo piano (tasto Home, altro ingresso): la riproduzione si ferma */
    background: function () { if (P.open) KP.player.close(); }
  };
  document.addEventListener('visibilitychange', function () { if (document.hidden) KP.player.background(); }, false);
  document.addEventListener('webkitvisibilitychange', function () { if (document.webkitHidden) KP.player.background(); }, false);
})(KP);
