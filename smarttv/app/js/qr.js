/* Kairos Player — codice QR disegnato nel TV (niente servizi esterni). Standard ISO/IEC 18004: modalità byte, correzione M,
   versioni 1–10 (fino a 213 caratteri), maschera scelta con le 4 penalità dello standard. KXQR.svg(testo) → <svg>;
   KXQR.matrix(testo) → righe di 0/1. Scritto in JavaScript ES5 perché giri anche sui TV LG e Samsung meno recenti. */
(function () {
  'use strict';
  // per versione: [codici di correzione per blocco, [[blocchi, dati per blocco], …]] (livello M)
  var EC = [null, [10, [[1, 16]]], [16, [[1, 28]]], [26, [[1, 44]]], [18, [[2, 32]]], [24, [[2, 43]]], [16, [[4, 27]]], [18, [[4, 31]]], [22, [[2, 38], [2, 39]]], [22, [[3, 36], [2, 37]]], [26, [[4, 43], [1, 44]]]];
  var ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
  var EXP = new Uint8Array(512), LOG = new Uint8Array(256), i0, x0;
  for (i0 = 0, x0 = 1; i0 < 255; i0++) { EXP[i0] = x0; LOG[x0] = i0; x0 <<= 1; if (x0 & 256) x0 ^= 0x11d; }
  for (i0 = 255; i0 < 512; i0++) EXP[i0] = EXP[i0 - 255];
  function mul(a, b) { return a && b ? EXP[LOG[a] + LOG[b]] : 0; }
  function zeros(n, v) { var a = new Array(n), i; for (i = 0; i < n; i++) a[i] = v; return a; }
  // testo → byte UTF-8 (come TextEncoder, che sui TV vecchi non c'è): i mezzi caratteri isolati diventano U+FFFD
  function utf8(s) {
    var o = '', b = [], i, c, d, t;
    for (i = 0; i < s.length; i++) {
      c = s.charCodeAt(i);
      if (c >= 0xd800 && c <= 0xdbff) { d = s.charCodeAt(i + 1); if (d >= 0xdc00 && d <= 0xdfff) { o += s.charAt(i) + s.charAt(i + 1); i++; } else o += '\ufffd'; }
      else if (c >= 0xdc00 && c <= 0xdfff) o += '\ufffd';
      else o += s.charAt(i);
    }
    t = unescape(encodeURIComponent(o));
    for (i = 0; i < t.length; i++) b.push(t.charCodeAt(i));
    return b;
  }
  function rsRem(data, n) {
    var g = [1], i, j, k;
    for (i = 0; i < n; i++) { var ng = zeros(g.length + 1, 0); for (j = 0; j < g.length; j++) { ng[j] ^= g[j]; ng[j + 1] ^= mul(g[j], EXP[i]); } g = ng; }
    var r = zeros(n, 0);
    for (k = 0; k < data.length; k++) { var f = data[k] ^ r[0]; r.shift(); r.push(0); if (f) for (i = 0; i < n; i++) r[i] ^= mul(g[i + 1], f); }
    return r;
  }
  function codewords(text) {
    var bytes = utf8(String(text)), v, i, j;
    for (v = 1; v <= 10; v++) {
      var ecn = EC[v][0], groups = EC[v][1], dataCw = 0, cc = v < 10 ? 8 : 16;
      for (i = 0; i < groups.length; i++) dataCw += groups[i][0] * groups[i][1];
      if (4 + cc + bytes.length * 8 > dataCw * 8) continue;
      var bits = [];
      var put = function (val, len) { for (var q = len - 1; q >= 0; q--) bits.push((val >>> q) & 1); };
      put(4, 4); put(bytes.length, cc); for (i = 0; i < bytes.length; i++) put(bytes[i], 8);
      for (i = 0; i < 4 && bits.length < dataCw * 8; i++) bits.push(0);
      while (bits.length % 8) bits.push(0);
      var cw = [];
      for (i = 0; i < bits.length; i += 8) { var b = 0; for (j = 0; j < 8; j++) b = (b << 1) | bits[i + j]; cw.push(b); }
      for (var p = 0; cw.length < dataCw; p++) cw.push(p % 2 ? 0x11 : 0xec);
      var blocks = [], ecs = [], k = 0, gI, maxD = 0;
      for (gI = 0; gI < groups.length; gI++) for (i = 0; i < groups[gI][0]; i++) { var bl = cw.slice(k, k + groups[gI][1]); k += groups[gI][1]; blocks.push(bl); ecs.push(rsRem(bl, ecn)); }
      for (i = 0; i < blocks.length; i++) if (blocks[i].length > maxD) maxD = blocks[i].length;
      var out = [];
      for (i = 0; i < maxD; i++) for (j = 0; j < blocks.length; j++) if (i < blocks[j].length) out.push(blocks[j][i]);
      for (i = 0; i < ecn; i++) for (j = 0; j < ecs.length; j++) out.push(ecs[j][i]);
      return { v: v, cw: out };
    }
    throw new Error('Testo troppo lungo per il codice QR');
  }
  var MASKS = [
    function (r, c) { return (r + c) % 2 === 0; }, function (r) { return r % 2 === 0; }, function (r, c) { return c % 3 === 0; }, function (r, c) { return (r + c) % 3 === 0; },
    function (r, c) { return (Math.floor(c / 3) + Math.floor(r / 2)) % 2 === 0; }, function (r, c) { return ((r * c) % 2) + ((r * c) % 3) === 0; },
    function (r, c) { return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0; }, function (r, c) { return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0; }];
  function penalty(M) {
    var N = M.length, p = 0, dark = 0, lines = [], i, r, c, n;
    for (i = 0; i < N; i++) { lines.push(M[i]); var col = []; for (r = 0; r < N; r++) col.push(M[r][i]); lines.push(col); }
    for (n = 0; n < lines.length; n++) {
      var L = lines[n], run = 1;
      for (i = 1; i <= N; i++) { if (i < N && L[i] === L[i - 1]) run++; else { if (run >= 5) p += 3 + run - 5; run = 1; } }
      var s = L.join(''), pats = ['10111010000', '00001011101'];
      for (var q = 0; q < pats.length; q++) { var j = s.indexOf(pats[q]); while (j >= 0) { p += 40; j = s.indexOf(pats[q], j + 1); } }
    }
    for (r = 0; r < N - 1; r++) for (c = 0; c < N - 1; c++) { var v = M[r][c]; if (v === M[r][c + 1] && v === M[r + 1][c] && v === M[r + 1][c + 1]) p += 3; }
    for (r = 0; r < N; r++) for (c = 0; c < N; c++) dark += M[r][c];
    return p + 10 * Math.floor(Math.abs((dark * 100) / (N * N) - 50) / 5);
  }
  function matrix(text) {
    var cwd = codewords(text), v = cwd.v, cw = cwd.cw, N = 17 + 4 * v, M = [], F = [], i, j, r, c;
    for (i = 0; i < N; i++) { M.push(zeros(N, 0)); F.push(zeros(N, false)); }
    function set(rr, cc, d) { M[rr][cc] = d ? 1 : 0; F[rr][cc] = true; }
    function finder(r0, c0) {
      for (var a = -1; a <= 7; a++) for (var b = -1; b <= 7; b++) {
        var rr = r0 + a, cc = c0 + b; if (rr < 0 || cc < 0 || rr >= N || cc >= N) continue;
        set(rr, cc, a >= 0 && a <= 6 && b >= 0 && b <= 6 && (a === 0 || a === 6 || b === 0 || b === 6 || (a >= 2 && a <= 4 && b >= 2 && b <= 4)));
      }
    }
    finder(0, 0); finder(0, N - 7); finder(N - 7, 0);
    for (i = 8; i < N - 8; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    var al = ALIGN[v], L = al.length - 1;
    for (i = 0; i <= L; i++) for (j = 0; j <= L; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === L) || (i === L && j === 0)) continue;
      for (var y = -2; y <= 2; y++) for (var x = -2; x <= 2; x++) set(al[i] + y, al[j] + x, Math.max(Math.abs(y), Math.abs(x)) !== 1);
    }
    set(N - 8, 8, 1);
    for (i = 0; i < 9; i++) { F[8][i] = true; F[i][8] = true; }
    for (i = 0; i < 8; i++) { F[8][N - 1 - i] = true; F[N - 1 - i][8] = true; }
    if (v >= 7) {
      var rem = v; for (i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
      var vb = (v << 12) | rem;
      for (i = 0; i < 18; i++) { var bb = (vb >>> i) & 1, aa = N - 11 + (i % 3), ca = Math.floor(i / 3); set(aa, ca, bb); set(ca, aa, bb); }
    }
    // dati a zig-zag da in basso a destra, due colonne alla volta (salta la colonna 6)
    var bi = 0, total = cw.length * 8, right, vert;
    for (right = N - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (vert = 0; vert < N; vert++) for (j = 0; j < 2; j++) {
        c = right - j; var up = ((right + 1) & 2) === 0; r = up ? N - 1 - vert : vert;
        if (!F[r][c] && bi < total) { M[r][c] = (cw[bi >>> 3] >>> (7 - (bi & 7))) & 1; bi++; }
      }
    }
    function format(mask) {
      var data = (0 << 3) | mask, rm = data, k; // livello M = 00
      for (k = 0; k < 10; k++) rm = (rm << 1) ^ ((rm >>> 9) * 0x537);
      return ((data << 10) | rm) ^ 0x5412;
    }
    function build(mask) {
      var X = [], fn = MASKS[mask], k, b = format(mask);
      for (k = 0; k < N; k++) X.push(M[k].slice());
      for (r = 0; r < N; r++) for (c = 0; c < N; c++) if (!F[r][c] && fn(r, c)) X[r][c] ^= 1;
      function bit(n) { return (b >>> n) & 1; }
      for (k = 0; k <= 5; k++) X[k][8] = bit(k);
      X[7][8] = bit(6); X[8][8] = bit(7); X[8][7] = bit(8);
      for (k = 9; k < 15; k++) X[8][14 - k] = bit(k);
      for (k = 0; k < 8; k++) X[8][N - 1 - k] = bit(k);
      for (k = 8; k < 15; k++) X[N - 15 + k][8] = bit(k);
      X[N - 8][8] = 1;
      return X;
    }
    var best = null, bp = Infinity, m;
    for (m = 0; m < 8; m++) { var Xm = build(m), pm = penalty(Xm); if (pm < bp) { bp = pm; best = Xm; } }
    return best;
  }
  function svg(text, px) {
    if (px === undefined) px = 4;
    var m = matrix(text), N = m.length, q = 4, S = N + 2 * q, d = '', r, c;
    for (r = 0; r < N; r++) for (c = 0; c < N; c++) if (m[r][c]) d += 'M' + (c + q) + ' ' + (r + q) + 'h1v1h-1z';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + S + ' ' + S + '" width="' + (S * px) + '" height="' + (S * px) + '" shape-rendering="crispEdges" role="img" aria-label="QR"><rect width="' + S + '" height="' + S + '" fill="#fff"/><path d="' + d + '" fill="#000"/></svg>';
  }
  window.KXQR = { matrix: matrix, svg: svg };
})();
