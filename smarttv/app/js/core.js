/* Kairos Player per TV LG (webOS) e Samsung (Tizen) — base: testi, memoria, piattaforma, telecomando.
   Lettore neutro: l'app non contiene canali né indirizzi di contenuti; l'utente inserisce la propria lista.
   Nessun codice scaricato da fuori, nessuna statistica, nessuna pubblicità. Scritto in ES5: gira anche sui TV meno recenti. */
var KP = (function () {
  'use strict';
  var KP = { version: '0.2.0' };
  /** «Dal telefono»: il TV mostra un codice e la lista si scrive su questa pagina (KP.PAIR + '/tv'). È l'unico indirizzo fisso dell'app e serve solo a questo passaggio */
  KP.PAIR = 'https://store-k.download';

  /* ---------- testi (italiano e inglese) ---------- */
  var T = {
    it: {
      appName: 'Kairos Player', live: 'TV in diretta', vod: 'Film', series: 'Serie TV', fav: 'Preferiti', search: 'Cerca',
      lists: 'Le mie liste', settings: 'Impostazioni', all: 'Tutti', back: 'Indietro', yes: 'Sì', no: 'No', ok: 'OK', cancel: 'Annulla',
      welcome: 'Benvenuto', welcomeTxt: 'Kairos Player è un lettore: non contiene canali né film. Aggiungi la tua lista, quella che ti ha dato il tuo fornitore o che hai creato tu.',
      rights: 'Usa solo liste e contenuti che hai il diritto di guardare.',
      addList: 'Aggiungi una lista', typeM3u: 'Link M3U', typeXt: 'Accesso Xtream', typePhone: 'Dal telefono',
      phoneLead: 'Più comodo che scrivere con il telecomando: apri la pagina dal telefono o dal computer, scrivi questo codice e la tua lista. Il codice lo puoi anche dare a chi ti prepara la lista.',
      phoneOpen: 'Apri', phoneCode: 'Codice', phoneWait: 'Aspetto la lista…', phoneGot: 'Lista ricevuta: la controllo…', phoneErr: 'Non riesco a chiedere il codice. Controlla la connessione del TV.',
      phoneOld: 'Codice scaduto.', newCode: 'Nuovo codice', phoneNote: 'La lista passa da un server solo per arrivare a questo TV: resta cifrata e viene cancellata alla consegna, o dopo 15 minuti.', name: 'Nome', nameHint: 'es. La mia lista',
      url: 'Indirizzo della lista', urlHint: 'http://… .m3u', host: 'Server', hostHint: 'http://server:porta', user: 'Utente', pass: 'Password',
      save: 'Salva', saving: 'Controllo la lista…', loading: 'Caricamento…', empty: 'Qui non c\'è nulla', noList: 'Nessuna lista: aggiungine una',
      errNet: 'Non riesco a raggiungere il server. Controlla l\'indirizzo e la connessione.', errAuth: 'Utente o password non validi, oppure accesso scaduto.',
      errEmpty: 'La lista è vuota o non è una lista M3U valida.', errFields: 'Compila tutti i campi.', errPlay: 'Questo contenuto non si riesce ad aprire.',
      use: 'Usa questa', refresh: 'Aggiorna', remove: 'Elimina', inUse: 'in uso', removed: 'Lista eliminata', refreshed: 'Lista aggiornata',
      askRemove: 'Eliminare la lista «%s»?', askExit: 'Uscire da Kairos Player?', exit: 'Esci',
      play: 'Guarda', resume: 'Riprendi', fromStart: 'Dall\'inizio', addFav: 'Aggiungi ai preferiti', delFav: 'Togli dai preferiti',
      seasons: 'Stagione', episode: 'Episodio', now: 'Ora', next: 'A seguire', channels: 'canali', titles: 'titoli',
      searchHint: 'Scrivi almeno 2 lettere', results: 'Risultati', language: 'Lingua', parental: 'Categorie per adulti',
      shown: 'Mostrate', hidden: 'Nascoste', pin: 'PIN dei genitori', pinSet: 'Scegli un PIN di 4 cifre', pinAsk: 'Scrivi il PIN', pinBad: 'PIN sbagliato',
      pinNone: 'Non impostato', pinOn: 'Impostato', clear: 'Cancella tutti i dati', askClear: 'Cancellare liste, preferiti e impostazioni da questo TV?',
      info: 'Informazioni e privacy', infoTxt: 'Kairos Player %s\n\nKairos Player è un lettore multimediale. Non fornisce, non contiene e non suggerisce canali, film o altri contenuti: riproduce solo le liste che l\'utente inserisce.\n\nPrivacy: le liste, i preferiti e le impostazioni restano salvati solo su questo TV. L\'app non raccoglie dati personali, non usa pubblicità né statistiche e si collega soltanto al server della lista scelta dall\'utente. Solo se usi «Dal telefono», la lista passa dal server di Kairos Player per arrivare al TV: resta cifrata e viene cancellata alla consegna, o dopo 15 minuti.\n\nL\'utente è responsabile dei contenuti delle proprie liste e deve avere il diritto di guardarli.',
      buffering: 'Carico…', liveTag: 'DIRETTA', hintLive: '▲ ▼ canale · OK informazioni · INDIETRO chiudi', hintVod: '◀ ▶ 10 secondi · OK pausa · INDIETRO chiudi'
    },
    en: {
      appName: 'Kairos Player', live: 'Live TV', vod: 'Movies', series: 'TV Series', fav: 'Favourites', search: 'Search',
      lists: 'My playlists', settings: 'Settings', all: 'All', back: 'Back', yes: 'Yes', no: 'No', ok: 'OK', cancel: 'Cancel',
      welcome: 'Welcome', welcomeTxt: 'Kairos Player is a media player: it includes no channels or movies. Add your own playlist, the one from your provider or one you created.',
      rights: 'Only use playlists and content you have the right to watch.',
      addList: 'Add a playlist', typeM3u: 'M3U link', typeXt: 'Xtream login', typePhone: 'From your phone',
      phoneLead: 'Easier than typing with the remote: open the page on your phone or computer, enter this code and your playlist. You can also give the code to whoever prepares the playlist for you.',
      phoneOpen: 'Open', phoneCode: 'Code', phoneWait: 'Waiting for the playlist…', phoneGot: 'Playlist received: checking it…', phoneErr: 'Cannot get a code. Check the TV connection.',
      phoneOld: 'The code has expired.', newCode: 'New code', phoneNote: 'The playlist passes through a server only to reach this TV: it is kept encrypted and deleted on delivery, or after 15 minutes.', name: 'Name', nameHint: 'e.g. My playlist',
      url: 'Playlist address', urlHint: 'http://… .m3u', host: 'Server', hostHint: 'http://server:port', user: 'Username', pass: 'Password',
      save: 'Save', saving: 'Checking the playlist…', loading: 'Loading…', empty: 'Nothing here', noList: 'No playlist yet: add one',
      errNet: 'Cannot reach the server. Check the address and your connection.', errAuth: 'Wrong username or password, or the account has expired.',
      errEmpty: 'The playlist is empty or is not a valid M3U file.', errFields: 'Fill in all the fields.', errPlay: 'This content cannot be played.',
      use: 'Use this one', refresh: 'Refresh', remove: 'Delete', inUse: 'in use', removed: 'Playlist deleted', refreshed: 'Playlist refreshed',
      askRemove: 'Delete the playlist "%s"?', askExit: 'Exit Kairos Player?', exit: 'Exit',
      play: 'Play', resume: 'Resume', fromStart: 'From the start', addFav: 'Add to favourites', delFav: 'Remove from favourites',
      seasons: 'Season', episode: 'Episode', now: 'Now', next: 'Next', channels: 'channels', titles: 'titles',
      searchHint: 'Type at least 2 letters', results: 'Results', language: 'Language', parental: 'Adult categories',
      shown: 'Shown', hidden: 'Hidden', pin: 'Parental PIN', pinSet: 'Choose a 4-digit PIN', pinAsk: 'Enter the PIN', pinBad: 'Wrong PIN',
      pinNone: 'Not set', pinOn: 'Set', clear: 'Erase all data', askClear: 'Erase playlists, favourites and settings from this TV?',
      info: 'About and privacy', infoTxt: 'Kairos Player %s\n\nKairos Player is a media player. It does not provide, include or suggest any channels, movies or other content: it only plays the playlists added by the user.\n\nPrivacy: playlists, favourites and settings are stored only on this TV. The app collects no personal data, has no ads or analytics, and connects only to the server of the playlist chosen by the user. Only if you use "From your phone", the playlist passes through the Kairos Player server to reach the TV: it is kept encrypted and deleted on delivery, or after 15 minutes.\n\nUsers are responsible for the content of their playlists and must have the right to watch it.',
      buffering: 'Loading…', liveTag: 'LIVE', hintLive: '▲ ▼ channel · OK info · BACK close', hintVod: '◀ ▶ 10 seconds · OK pause · BACK close'
    }
  };
  KP.t = function (k, a) {
    var s = (T[KP.lang] && T[KP.lang][k]) || T.en[k] || k;
    return a === undefined ? s : s.replace('%s', a);
  };

  /* ---------- memoria: tutto resta su questo TV ---------- */
  KP.load = function (k, d) { try { var v = window.localStorage.getItem('kp.' + k); return v === null || v === undefined ? d : JSON.parse(v); } catch (e) { return d; } };
  KP.save = function (k, v) { try { window.localStorage.setItem('kp.' + k, JSON.stringify(v)); } catch (e) {} };
  KP.wipe = function () { try { var ks = [], i; for (i = 0; i < window.localStorage.length; i++) { var k = window.localStorage.key(i); if (k && k.indexOf('kp.') === 0) ks.push(k); } for (i = 0; i < ks.length; i++) window.localStorage.removeItem(ks[i]); } catch (e) {} };
  KP.set = KP.load('set', {});
  var navLang = String((window.navigator && (window.navigator.language || window.navigator.userLanguage)) || 'en').toLowerCase();
  KP.lang = KP.set.lang === 'it' || KP.set.lang === 'en' ? KP.set.lang : (navLang.indexOf('it') === 0 ? 'it' : 'en');
  KP.saveSet = function () { KP.save('set', KP.set); };

  /* ---------- piattaforma ---------- */
  KP.tizen = typeof window.tizen !== 'undefined';
  KP.webos = !KP.tizen && (typeof window.webOS !== 'undefined' || typeof window.PalmSystem !== 'undefined' || /web0s|webos/i.test(window.navigator.userAgent));
  KP.exit = function () {
    try { if (KP.tizen) { window.tizen.application.getCurrentApplication().exit(); return; } } catch (e) {}
    try { if (window.webOS && window.webOS.platformBack) { window.webOS.platformBack(); return; } } catch (e2) {}
    try { window.close(); } catch (e3) {}
  };
  if (KP.tizen) {
    // tasti del telecomando che Tizen consegna solo se richiesti
    try {
      var want = ['MediaPlay', 'MediaPause', 'MediaStop', 'MediaFastForward', 'MediaRewind', 'MediaPlayPause', 'ChannelUp', 'ChannelDown'];
      for (var wi = 0; wi < want.length; wi++) { try { window.tizen.tvinputdevice.registerKey(want[wi]); } catch (e4) {} }
    } catch (e5) {}
  }

  /* ---------- piccoli aiuti ---------- */
  KP.el = function (tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined && text !== null) e.textContent = String(text); return e; };
  KP.has = function (e, c) { return !!e && (' ' + e.className + ' ').indexOf(' ' + c + ' ') >= 0; };
  KP.up = function (e, c) { while (e && e !== document.body) { if (KP.has(e, c)) return e; e = e.parentNode; } return null; };
  KP.clear = function (e) { while (e.firstChild) e.removeChild(e.firstChild); };
  var toastT = 0;
  KP.toast = function (msg) {
    var b = document.getElementById('toast'); if (!b) return;
    b.textContent = msg; b.style.display = 'block';
    window.clearTimeout(toastT); toastT = window.setTimeout(function () { b.style.display = 'none'; }, 3200);
  };

  /* ---------- telecomando: fuoco che si sposta verso l'elemento più vicino nella direzione premuta ---------- */
  var cur = null;
  KP.cur = function () { return cur; };
  function scope() { var m = document.querySelectorAll('.modal'); return m.length ? m[m.length - 1] : document.getElementById('app'); }
  function visible(e) { return !!(e.offsetWidth || e.offsetHeight) && e.style.visibility !== 'hidden'; }
  function reveal(e) {
    var p = e.parentNode;
    while (p && p !== document.body) {
      if (KP.has(p, 'scroll')) {
        var a = p.getBoundingClientRect(), b = e.getBoundingClientRect(), pad = a.height * 0.12;
        if (b.top < a.top + pad) p.scrollTop -= (a.top + pad - b.top); else if (b.bottom > a.bottom - pad) p.scrollTop += (b.bottom - a.bottom + pad);
        if (b.left < a.left + 8) p.scrollLeft -= (a.left + 8 - b.left); else if (b.right > a.right - 8) p.scrollLeft += (b.right - a.right + 8);
      }
      p = p.parentNode;
    }
  }
  KP.focus = function (e) {
    if (!e) return;
    if (cur && cur !== e) { cur.className = cur.className.replace(/ ?\bon\b/g, ''); if (cur.tagName === 'INPUT') { try { cur.blur(); } catch (x) {} } }
    cur = e;
    if (!KP.has(e, 'on')) e.className += ' on';
    reveal(e);
    if (e.tagName === 'INPUT') { try { e.focus(); } catch (x2) {} }
    if (e._focus) e._focus();
  };
  KP.first = function (root) {
    var l = (root || scope()).querySelectorAll('.f'), i, pick = null;
    for (i = 0; i < l.length; i++) { if (!visible(l[i])) continue; if (KP.has(l[i], 'sel')) { pick = l[i]; break; } if (!pick) pick = l[i]; }
    if (pick) KP.focus(pick);
    return pick;
  };
  function move(dir) {
    var sc = scope();
    if (!cur || !sc.contains(cur) || !visible(cur)) { KP.first(sc); return; }
    var c = cur.getBoundingClientRect(), list = sc.querySelectorAll('.f'), best = null, bestS = 1e12, i;
    var ccx = (c.left + c.right) / 2, ccy = (c.top + c.bottom) / 2;
    for (i = 0; i < list.length; i++) {
      var e = list[i]; if (e === cur || !visible(e)) continue;
      var r = e.getBoundingClientRect(), cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2, main, side;
      if (dir === 'right') { if (r.left < c.right - 2 && cx <= ccx + 2) continue; main = Math.max(0, r.left - c.right); side = (r.bottom > c.top && r.top < c.bottom) ? 0 : Math.abs(cy - ccy); }
      else if (dir === 'left') { if (r.right > c.left + 2 && cx >= ccx - 2) continue; main = Math.max(0, c.left - r.right); side = (r.bottom > c.top && r.top < c.bottom) ? 0 : Math.abs(cy - ccy); }
      else if (dir === 'down') { if (r.top < c.bottom - 2 && cy <= ccy + 2) continue; main = Math.max(0, r.top - c.bottom); side = (r.right > c.left && r.left < c.right) ? 0 : Math.abs(cx - ccx); }
      else { if (r.bottom > c.top + 2 && cy >= ccy - 2) continue; main = Math.max(0, c.top - r.bottom); side = (r.right > c.left && r.left < c.right) ? 0 : Math.abs(cx - ccx); }
      var s = main + side * 3 + (side ? 400 : 0);
      if (s < bestS) { bestS = s; best = e; }
    }
    if (best) KP.focus(best);
  }

  var KEY = { 37: 'left', 38: 'up', 39: 'right', 40: 'down', 13: 'ok', 461: 'back', 10009: 'back', 27: 'back', 415: 'play', 19: 'pause', 413: 'stop', 417: 'ff', 412: 'rw', 10252: 'playpause', 427: 'chup', 428: 'chdown', 33: 'chup', 34: 'chdown' };
  /** la schermata attiva può prendersi i tasti (lettore): KP.keys = function (nome) { return true se l'ha usato } */
  KP.keys = null;
  KP.onBack = null;
  document.addEventListener('keydown', function (ev) {
    var k = KEY[ev.keyCode]; if (!k) return;
    var inInput = cur && cur.tagName === 'INPUT' && document.activeElement === cur;
    if (inInput && (k === 'left' || k === 'right')) return; // dentro il campo le frecce spostano il cursore
    if (KP.keys && !document.querySelector('.modal') && KP.keys(k)) { ev.preventDefault(); return; }
    if (k === 'left' || k === 'right' || k === 'up' || k === 'down') { ev.preventDefault(); move(k); return; }
    if (k === 'ok') { if (inInput) { move('down'); ev.preventDefault(); return; } if (cur && cur._ok) { ev.preventDefault(); cur._ok(); } return; }
    if (k === 'back') { ev.preventDefault(); var m = document.querySelectorAll('.modal'); if (m.length) { var top = m[m.length - 1]; if (top._close) top._close(); return; } if (KP.onBack) KP.onBack(); }
  }, false);
  // telecomando a puntatore (LG Magic Remote) e mouse
  document.addEventListener('mouseover', function (ev) { var f = KP.up(ev.target, 'f'); if (f && scope().contains(f) && f !== cur) KP.focus(f); }, false);
  // rotella del puntatore: scorre l'elenco sotto il cursore
  function wheel(ev) { var s = KP.up(ev.target, 'scroll'); if (s) s.scrollTop += ev.deltaY !== undefined ? ev.deltaY : -(ev.wheelDelta || 0); }
  document.addEventListener('wheel', wheel, false);
  document.addEventListener('mousewheel', wheel, false);
  document.addEventListener('click', function (ev) { var f = KP.up(ev.target, 'f'); if (f && scope().contains(f)) { KP.focus(f); if (f._ok && f.tagName !== 'INPUT') f._ok(); } }, false);

  /* ---------- finestre ---------- */
  KP.modal = function (title, text, buttons, onClose) {
    var m = KP.el('div', 'modal'), box = KP.el('div', 'mbox'), row = KP.el('div', 'mrow'), prev = cur, i;
    if (title) box.appendChild(KP.el('h2', '', title));
    if (text) box.appendChild(KP.el('p', 'mtext', text));
    m._close = function () { if (m.parentNode) m.parentNode.removeChild(m); cur = null; if (prev && document.body.contains(prev)) KP.focus(prev); else KP.first(); if (onClose) onClose(); };
    function mk(b) { var e = KP.el('div', 'btn f' + (b.pri ? ' pri' : ''), b.label); e._ok = function () { m._close(); if (b.fn) b.fn(); }; return e; }
    for (i = 0; i < buttons.length; i++) row.appendChild(mk(buttons[i]));
    box.appendChild(row); m.appendChild(box); document.body.appendChild(m);
    KP.focus(row.firstChild);
    return m;
  };
  KP.confirm = function (text, yesLabel, fn) { KP.modal('', text, [{ label: KP.t('cancel') }, { label: yesLabel, pri: true, fn: fn }]); };

  return KP;
})();
