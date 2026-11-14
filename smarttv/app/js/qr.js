/* KAIROS Control — codice QR disegnato nel browser (per la verifica in due passaggi: la chiave non esce mai dal pannello,
   niente servizi esterni). Standard ISO/IEC 18004: modalità byte, correzione M, versioni 1–10 (fino a 213 caratteri),
   maschera scelta con le 4 penalità dello standard. KXQR.svg(testo) → <svg>; KXQR.matrix(testo) → righe di 0/1. */
(() => {
  // per versione: [codici di correzione per blocco, [[blocchi, dati per blocco], …]] (livello M)
  const EC = [null, [10, [[1, 16]]], [16, [[1, 28]]], [26, [[1, 44]]], [18, [[2, 32]]], [24, [[2, 43]]], [16, [[4, 27]]], [18, [[4, 31]]], [22, [[2, 38], [2, 39]]], [22, [[3, 36], [2, 37]]], [26, [[4, 43], [1, 44]]]];
  const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
  const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
  for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11d; }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);
  function rsRem(data, n) {
    let g = [1];
    for (let i = 0; i < n; i++) { const ng = new Array(g.length + 1).fill(0); for (let j = 0; j < g.length; j++) { ng[j] ^= g[j]; ng[j + 1] ^= mul(g[j], EXP[i]); } g = ng; }
    const r = new Array(n).fill(0);
    for (const d of data) { const f = d ^ r[0]; r.shift(); r.push(0); if (f) for (let i = 0; i < n; i++) r[i] ^= mul(g[i + 1], f); }
    return r;
  }
  function codewords(text) {
    const bytes = new TextEncoder().encode(String(text));
    for (let v = 1; v <= 10; v++) {
      const [ecn, groups] = EC[v], dataCw = groups.reduce((s, [b, d]) => s + b * d, 0), cc = v < 10 ? 8 : 16;
      if (4 + cc + bytes.length * 8 > dataCw * 8) continue;
      const bits = [], put = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
      put(4, 4); put(bytes.length, cc); for (const b of bytes) put(b, 8);
      for (let i = 0; i < 4 && bits.length < dataCw * 8; i++) bits.push(0);
      while (bits.length % 8) bits.push(0);
      const cw = [];
      for (let i = 0; i < bits.length; i += 8) { let b = 0; for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j]; cw.push(b); }
      for (let p = 0; cw.length < dataCw; p++) cw.push(p % 2 ? 0x11 : 0xec);
      const blocks = [], ecs = []; let k = 0;
      for (const [nb, nd] of groups) for (let i = 0; i < nb; i++) { const b = cw.slice(k, k + nd); k += nd; blocks.push(b); ecs.push(rsRem(b, ecn)); }
      const out = [], maxD = Math.max(...blocks.map((b) => b.length));
      for (let i = 0; i < maxD; i++) for (const b of blocks) if (i < b.length) out.push(b[i]);
      for (let i = 0; i < ecn; i++) for (const e of ecs) out.push(e[i]);
      return { v, cw: out };
    }
    throw new Error('Testo troppo lungo per il codice QR');
  }
  const MASKS = [(r, c) => (r + c) % 2 === 0, (r) => r % 2 === 0, (r, c) => c % 3 === 0, (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(c / 3) + Math.floor(r / 2)) % 2 === 0, (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
    (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0, (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0];
  function penalty(M) {
    const N = M.length; let p = 0, dark = 0;
    const lines = [];
    for (let i = 0; i < N; i++) { lines.push(M[i]); lines.push(M.map((row) => row[i])); }
    for (const L of lines) {
      let run = 1;
      for (let i = 1; i <= N; i++) { if (i < N && L[i] === L[i - 1]) run++; else { if (run >= 5) p += 3 + run - 5; run = 1; } }
      const s = L.join('');
      for (const pat of ['10111010000', '00001011101']) { let j = s.indexOf(pat); while (j >= 0) { p += 40; j = s.indexOf(pat, j + 1); } }
    }
    for (let r = 0; r < N - 1; r++) for (let c = 0; c < N - 1; c++) { const v = M[r][c]; if (v === M[r][c + 1] && v === M[r + 1][c] && v === M[r + 1][c + 1]) p += 3; }
    for (const row of M) for (const v of row) dark += v;
    return p + 10 * Math.floor(Math.abs((dark * 100) / (N * N) - 50) / 5);
  }
  function matrix(text) {
    const { v, cw } = codewords(text), N = 17 + 4 * v;
    const M = Array.from({ length: N }, () => new Array(N).fill(0)), F = Array.from({ length: N }, () => new Array(N).fill(false));
    const set = (r, c, d) => { M[r][c] = d ? 1 : 0; F[r][c] = true; };
    const finder = (r0, c0) => {
      for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) {
        const rr = r0 + r, cc = c0 + c; if (rr < 0 || cc < 0 || rr >= N || cc >= N) continue;
        set(rr, cc, r >= 0 && r <= 6 && c >= 0 && c <= 6 && (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4)));
      }
    };
    finder(0, 0); finder(0, N - 7); finder(N - 7, 0);
    for (let i = 8; i < N - 8; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    const al = ALIGN[v], L = al.length - 1;
    for (let i = 0; i <= L; i++) for (let j = 0; j <= L; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === L) || (i === L && j === 0)) continue;
      for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) set(al[i] + y, al[j] + x, Math.max(Math.abs(y), Math.abs(x)) !== 1);
    }
    set(N - 8, 8, 1);
    for (let i = 0; i < 9; i++) { F[8][i] = true; F[i][8] = true; }
    for (let i = 0; i < 8; i++) { F[8][N - 1 - i] = true; F[N - 1 - i][8] = true; }
    if (v >= 7) {
      let rem = v; for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
      const bits = (v << 12) | rem;
      for (let i = 0; i < 18; i++) { const b = (bits >>> i) & 1, a = N - 11 + (i % 3), c = Math.floor(i / 3); set(a, c, b); set(c, a, b); }
    }
    // dati a zig-zag da in basso a destra, due colonne alla volta (salta la colonna 6)
    let bi = 0; const total = cw.length * 8;
    for (let right = N - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < N; vert++) for (let j = 0; j < 2; j++) {
        const c = right - j, up = ((right + 1) & 2) === 0, r = up ? N - 1 - vert : vert;
        if (!F[r][c] && bi < total) { M[r][c] = (cw[bi >>> 3] >>> (7 - (bi & 7))) & 1; bi++; }
      }
    }
    const format = (mask) => {
      const data = (0 << 3) | mask; let rem = data; // livello M = 00
      for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      return ((data << 10) | rem) ^ 0x5412;
    };
    const build = (mask) => {
      const X = M.map((row) => row.slice()), fn = MASKS[mask];
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (!F[r][c] && fn(r, c)) X[r][c] ^= 1;
      const b = format(mask), bit = (i) => (b >>> i) & 1;
      for (let i = 0; i <= 5; i++) X[i][8] = bit(i);
      X[7][8] = bit(6); X[8][8] = bit(7); X[8][7] = bit(8);
      for (let i = 9; i < 15; i++) X[8][14 - i] = bit(i);
      for (let i = 0; i < 8; i++) X[8][N - 1 - i] = bit(i);
      for (let i = 8; i < 15; i++) X[N - 15 + i][8] = bit(i);
      X[N - 8][8] = 1;
      return X;
    };
    let best = null, bp = Infinity;
    for (let m = 0; m < 8; m++) { const X = build(m), p = penalty(X); if (p < bp) { bp = p; best = X; } }
    return best;
  }
  function svg(text, px = 4) {
    const m = matrix(text), N = m.length, q = 4, S = N + 2 * q; let d = '';
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (m[r][c]) d += `M${c + q} ${r + q}h1v1h-1z`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S * px}" height="${S * px}" shape-rendering="crispEdges" role="img" aria-label="Codice QR"><rect width="${S}" height="${S}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
  }
  window.KXQR = { matrix, svg };
})();
