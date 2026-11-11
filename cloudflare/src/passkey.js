/* KAIROS Control — accesso del titolare con impronta o Face ID (passkey, WebAuthn), 11 novembre 2026.
   Qui solo la parte che non tocca il database: lettura CBOR, dati dell'autenticatore, chiave COSE → JWK e verifica della
   firma con WebCrypto (ES256 e RS256: le chiavi di telefoni, computer e chiavette di sicurezza). Niente librerie.
   Le sfide, le credenziali salvate e le sessioni le gestisce worker.js. */
const dec = new TextDecoder();

export function b64u(buf) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function unb64u(s) {
  s = String(s ?? '').replace(/-/g, '+').replace(/_/g, '/');
  if (!/^[A-Za-z0-9+/]*$/.test(s)) throw new Error('base64 non valido');
  const bin = atob(s + '==='.slice((s.length + 3) % 4));
  const o = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) o[i] = bin.charCodeAt(i);
  return o;
}

/** CBOR (RFC 8949), solo quello che serve a WebAuthn: interi, stringhe, array, mappe, vero/falso/null. Risponde { v, p } */
export function cbor(u8, pos = 0, depth = 0) {
  if (!(u8 instanceof Uint8Array)) throw new Error('CBOR: dati mancanti');
  if (depth > 16) throw new Error('CBOR troppo annidato');
  if (pos >= u8.length) throw new Error('CBOR troncato');
  const ib = u8[pos++], mt = ib >> 5, ai = ib & 31;
  let len;
  if (ai < 24) len = ai;
  else if (ai === 24) { len = u8[pos]; pos += 1; }
  else if (ai === 25) { len = (u8[pos] << 8) | u8[pos + 1]; pos += 2; }
  else if (ai === 26) { len = u8[pos] * 2 ** 24 + ((u8[pos + 1] << 16) | (u8[pos + 2] << 8) | u8[pos + 3]); pos += 4; }
  else if (ai === 27) {
    const hi = u8[pos] * 2 ** 24 + ((u8[pos + 1] << 16) | (u8[pos + 2] << 8) | u8[pos + 3]);
    const lo = u8[pos + 4] * 2 ** 24 + ((u8[pos + 5] << 16) | (u8[pos + 6] << 8) | u8[pos + 7]);
    if (hi >= 2 ** 21) throw new Error('CBOR: numero troppo grande');
    len = hi * 2 ** 32 + lo; pos += 8;
  } else throw new Error('CBOR: lunghezza indefinita non supportata');
  if (pos > u8.length) throw new Error('CBOR troncato');
  switch (mt) {
    case 0: return { v: len, p: pos };
    case 1: return { v: -1 - len, p: pos };
    case 2: if (pos + len > u8.length) throw new Error('CBOR troncato'); return { v: u8.slice(pos, pos + len), p: pos + len };
    case 3: if (pos + len > u8.length) throw new Error('CBOR troncato'); return { v: dec.decode(u8.subarray(pos, pos + len)), p: pos + len };
    case 4: {
      if (len > 1000) throw new Error('CBOR: elenco troppo lungo');
      const a = [];
      for (let i = 0; i < len; i++) { const r = cbor(u8, pos, depth + 1); a.push(r.v); pos = r.p; }
      return { v: a, p: pos };
    }
    case 5: {
      if (len > 1000) throw new Error('CBOR: mappa troppo lunga');
      const m = new Map();
      for (let i = 0; i < len; i++) { const k = cbor(u8, pos, depth + 1), val = cbor(u8, k.p, depth + 1); m.set(k.v, val.v); pos = val.p; }
      return { v: m, p: pos };
    }
    case 6: return cbor(u8, pos, depth + 1); // etichetta: si guarda solo il valore
    default:
      if (ai === 20) return { v: false, p: pos };
      if (ai === 21) return { v: true, p: pos };
      if (ai === 22 || ai === 23) return { v: null, p: pos };
      throw new Error('CBOR: valore non supportato');
  }
}

/** dati dell'autenticatore: impronta del dominio, flag (presenza, verifica dell'utente), contatore e, alla registrazione,
 *  la credenziale nuova con la sua chiave COSE */
export function parseAuthData(ad) {
  if (!(ad instanceof Uint8Array) || ad.length < 37) throw new Error('dati dell\'autenticatore troppo corti');
  const flags = ad[32];
  const out = { rpIdHash: ad.slice(0, 32), flags, up: !!(flags & 1), uv: !!(flags & 4), at: !!(flags & 64), count: ad[33] * 2 ** 24 + ((ad[34] << 16) | (ad[35] << 8) | ad[36]) };
  if (out.at) {
    if (ad.length < 55) throw new Error('credenziale troncata');
    const n = (ad[53] << 8) | ad[54];
    if (n < 16 || n > 1023 || 55 + n > ad.length) throw new Error('identificativo della credenziale non valido');
    out.credId = ad.slice(55, 55 + n);
    out.cose = cbor(ad, 55 + n).v;
  }
  return out;
}

/** chiave pubblica COSE → JWK per WebCrypto. ES256 (P-256) e RS256 */
export function coseToJwk(m) {
  if (!(m instanceof Map)) throw new Error('chiave non valida');
  const kty = m.get(1), alg = m.get(3);
  if (kty === 2 && alg === -7 && m.get(-1) === 1) {
    const x = m.get(-2), y = m.get(-3);
    if (!(x instanceof Uint8Array) || x.length !== 32 || !(y instanceof Uint8Array) || y.length !== 32) throw new Error('chiave P-256 non valida');
    return { alg: -7, jwk: { kty: 'EC', crv: 'P-256', x: b64u(x), y: b64u(y) } };
  }
  if (kty === 3 && alg === -257) {
    const n = m.get(-1), e = m.get(-2);
    if (!(n instanceof Uint8Array) || n.length < 256 || !(e instanceof Uint8Array) || !e.length || e.length > 8) throw new Error('chiave RSA non valida');
    return { alg: -257, jwk: { kty: 'RSA', n: b64u(n), e: b64u(e) } };
  }
  throw new Error('tipo di chiave non supportato');
}

/** firma ECDSA in DER (come la danno gli autenticatori) → r||s di 64 byte (come la vuole WebCrypto) */
export function derToRaw(der, size = 32) {
  if (!(der instanceof Uint8Array) || der.length < 8 || der[0] !== 0x30) throw new Error('firma non valida');
  let p = 1, len = der[p++];
  if (len & 0x80) { const nb = len & 0x7f; if (nb > 2) throw new Error('firma non valida'); len = 0; for (let i = 0; i < nb; i++) len = (len << 8) | der[p++]; }
  if (p + len !== der.length) throw new Error('firma non valida');
  const out = new Uint8Array(size * 2);
  for (let k = 0; k < 2; k++) {
    if (der[p++] !== 0x02) throw new Error('firma non valida');
    const n = der[p++];
    if (!n || p + n > der.length) throw new Error('firma non valida');
    let v = der.subarray(p, p + n); p += n;
    while (v.length > size && v[0] === 0) v = v.subarray(1);
    if (v.length > size) throw new Error('firma non valida');
    out.set(v, k * size + (size - v.length));
  }
  if (p !== der.length) throw new Error('firma non valida');
  return out;
}

/** verifica di [sig] su [data] con la chiave salvata */
export async function verifySig(jwk, alg, data, sig) {
  try {
    if (alg === -7) {
      const key = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y, ext: true }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
      return await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, derToRaw(sig), data);
    }
    if (alg === -257) {
      const key = await crypto.subtle.importKey('jwk', { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
      return await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, sig, data);
    }
  } catch {}
  return false;
}

/** SHA-256 in byte */
export async function sha(bytes) { return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)); }
export function same(a, b) {
  if (!(a instanceof Uint8Array) || !(b instanceof Uint8Array) || a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}
export function concat(a, b) { const o = new Uint8Array(a.length + b.length); o.set(a, 0); o.set(b, a.length); return o; }
