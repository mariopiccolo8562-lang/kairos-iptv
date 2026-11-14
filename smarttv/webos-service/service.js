/* Kairos Player — servizio interno per i TV LG (webOS).
   Le app web dei TV LG seguono le regole CORS dei browser: da sole non possono leggere le liste dei server che non lo
   permettono. Questo servizio fa parte del pacchetto dell'app e gira sul TV stesso (JS service di webOS): scarica per
   l'app la lista scelta dall'utente (file M3U, risposte del server Xtream, guida dei programmi) e gliela passa a pezzi.
   Si collega solo all'indirizzo che l'app gli chiede, cioè quello scritto dall'utente; nessun altro server in mezzo.
   Scritto in ES5: sui TV webOS 3 e 4 gira con Node.js 0.12. */
var Service = require('webos-service');
var http = require('http');
var https = require('https');
var zlib = require('zlib');
var urlLib = require('url');

var service = new Service('com.kairos.player.service');
try { service.activityManager.idleTimeout = 30; } catch (e) {} // tra un pezzo e l'altro il servizio resta acceso

var MAX = 64 * 1024 * 1024; // byte, prima e dopo la decompressione
var PART = 131072; // caratteri per pezzo
var KEEP = 120000; // ms: un testo non ritirato si butta
var HOPS = 5; // reindirizzamenti al massimo
var UA = 'KairosPlayer/0.3 (webOS TV)';
var ERR = { url: 1, net: 2, big: 3, gone: 4 };
var store = {};
var seq = 0;

function sweep() {
  var now = Date.now(), k;
  for (k in store) if (store.hasOwnProperty(k) && now - store[k].t > KEEP) delete store[k];
}

function fail(message, what) {
  message.respond({ returnValue: false, errorCode: ERR[what] || ERR.net, errorText: what });
}

/** scarica un indirizzo http(s), segue i reindirizzamenti, decomprime gzip e deflate: done(errore, codice, testo) */
function download(target, timeout, hops, done) {
  var u = null;
  try { u = urlLib.parse(target); } catch (e) { u = null; }
  if (!u || (u.protocol !== 'http:' && u.protocol !== 'https:') || !u.hostname) return done('url');
  var lib = u.protocol === 'https:' ? https : http;
  var finished = false;
  var timer = null;
  var req = null;
  function end(err, code, body) {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    done(err, code, body);
  }
  var opts = {
    hostname: u.hostname,
    port: u.port || undefined,
    path: u.path || '/',
    method: 'GET',
    headers: { 'User-Agent': UA, 'Accept': '*/*', 'Accept-Encoding': 'gzip, deflate', 'Connection': 'close' }
  };
  try {
    req = lib.request(opts, function (res) {
      var code = res.statusCode || 0;
      if (code >= 300 && code < 400 && res.headers.location) {
        res.resume();
        if (finished) return;
        if (hops >= HOPS) return end('net');
        finished = true;
        clearTimeout(timer);
        download(urlLib.resolve(target, String(res.headers.location)), timeout, hops + 1, done);
        return;
      }
      var parts = [];
      var size = 0;
      res.on('data', function (c) {
        if (finished) return;
        size += c.length;
        if (size > MAX) { try { req.abort(); } catch (e) {} end('big'); return; }
        parts.push(c);
      });
      res.on('end', function () {
        if (finished) return;
        var buf = Buffer.concat(parts);
        var enc = String(res.headers['content-encoding'] || '').toLowerCase();
        function text(b) {
          if (b.length > MAX) return end('big');
          var s = b.toString('utf8');
          if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);
          end(null, code, s);
        }
        if (enc.indexOf('gzip') >= 0) {
          zlib.gunzip(buf, function (e, out) { if (e) end('net'); else text(out); });
        } else if (enc.indexOf('deflate') >= 0) {
          zlib.inflate(buf, function (e, out) {
            if (!e) return text(out);
            zlib.inflateRaw(buf, function (e2, out2) { if (e2) end('net'); else text(out2); });
          });
        } else {
          text(buf);
        }
      });
      res.on('error', function () { end('net'); });
    });
  } catch (e) {
    return done('url');
  }
  timer = setTimeout(function () { try { req.abort(); } catch (e) {} end('net'); }, timeout);
  req.on('error', function () { end('net'); });
  req.end();
}

/** get {url, timeout}: testo intero se è corto, altrimenti {id, length} e poi i pezzi con «part» */
service.register('get', function (message) {
  var p = message.payload || {};
  var target = String(p.url || '');
  var timeout = Math.min(Math.max(+p.timeout || 45000, 5000), 120000);
  sweep();
  download(target, timeout, 0, function (err, code, body) {
    if (err) return fail(message, err);
    if (code >= 400) return message.respond({ returnValue: true, status: code, text: '' });
    if (body.length <= PART) return message.respond({ returnValue: true, status: code, text: body });
    seq += 1;
    var id = 'd' + seq;
    store[id] = { s: body, t: Date.now() };
    message.respond({ returnValue: true, status: code, id: id, length: body.length });
  });
});

/** part {id, from, size}: un pezzo del testo; l'ultimo lo cancella dalla memoria */
service.register('part', function (message) {
  var p = message.payload || {};
  var id = String(p.id || '');
  var e = store[id];
  if (!e) return fail(message, 'gone');
  var from = Math.max(0, Math.floor(+p.from || 0));
  var size = Math.min(Math.max(Math.floor(+p.size || PART), 1024), 1048576);
  var stop = Math.min(from + size, e.s.length);
  var c = e.s.charCodeAt(stop - 1);
  if (stop < e.s.length && c >= 0xD800 && c <= 0xDBFF) stop -= 1; // non si spezza un carattere speciale (emoji) a metà
  var last = stop >= e.s.length;
  var chunk = e.s.substring(from, stop);
  e.t = Date.now();
  if (last) delete store[id];
  message.respond({ returnValue: true, text: chunk, next: stop, end: last });
});

/** drop {id}: libera la memoria se l'app non ritira più il testo */
service.register('drop', function (message) {
  var p = message.payload || {};
  delete store[String(p.id || '')];
  message.respond({ returnValue: true });
});
