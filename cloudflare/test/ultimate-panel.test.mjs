import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';
import { _internal } from '../src/worker.js';

test('recognizes Ultimate without changing existing app recognition', () => {
  const from = (ua, ver) => _internal.appFrom(new Request('https://panel.example/', { headers: { 'User-Agent': ua } }), { ver });
  assert.equal(from('KairosUltimate/1.0.0', ''), 'ult');
  assert.equal(from('KairosPlayer/2.0', 'ult 1.0.0'), 'ult');
  assert.equal(from('KairosTV/2.0 KairosXC/3.4', 'xc 3.4.0'), 'xc');
  assert.equal(from('KairosTV/2.0', 'tv 2.0.0'), 'ktv');
  assert.equal(from('KairosPlayer/2.0', '2.0.0'), 'tv');
  assert.equal(_internal.appOfVer('ult 1.0.0'), 'ult');
  assert.equal(_internal.appOfVer('xc 3.4.0'), 'xc');
});

class FakeStatement {
  constructor(db, sql) { this.db = db; this.sql = sql; this.args = []; }
  bind(...args) { this.args = args; return this; }
  async first() {
    if (this.sql.includes('FROM devices WHERE code')) return this.db.device.code === this.args[0] ? this.db.device : null;
    if (this.sql.includes('INTO throttle')) { const n = (this.db.limits.get(this.args[0]) || 0) + this.args[1]; this.db.limits.set(this.args[0], n); return { n }; }
    return null;
  }
  async all() { return { results: [] }; }
}

async function reachEnv() {
  const env = { ENC_KEY: Buffer.alloc(32, 1).toString('base64') };
  const secret = 's'.repeat(40);
  const digest = await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode('dev:' + secret));
  const playlist = { id: 'p1', type: 'xtream', host: 'https://portal.example:8443', url: 'https://portal.example:8443' };
  env.DB = {
    device: { id: 1, code: 'KXAB-12CD', secret_hash: Buffer.from(digest).toString('base64url'), playlists: await _internal.seal(env, [playlist]), parent: '' },
    limits: new Map(),
    prepare(sql) { return new FakeStatement(this, sql); },
  };
  return { env, secret };
}

const postReach = (env, code, secret, origin, transports) => _internal.playerReach(new Request('https://panel.example/api/player/reach', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, secret, origin }),
}), env, transports);

test('reach falls back to sockets, limits hosts and rate-limits per device', async () => {
  const { env, secret } = await reachEnv();
  const calls = [], upstreamResponse = new Response('upstream secret body', { status: 503 });
  const transports = {
    fetch: async (url, options) => { calls.push(['fetch', String(url), options]); throw new Error('Worker fetch port blocked'); },
    sockFetch: async (url, options) => { calls.push(['socket', String(url), options]); return upstreamResponse; },
  };
  const allowed = await postReach(env, 'KXAB-12CD', secret, 'https://portal.example:8443', transports);
  assert.equal(allowed.status, 200);
  assert.deepEqual(await allowed.json(), { ok: true, status: 503 });
  assert.deepEqual(calls.map(([type, url]) => [type, url]), [
    ['fetch', 'https://portal.example:8443/player_api.php'],
    ['socket', 'https://portal.example:8443/player_api.php'],
  ]);
  assert.equal(calls[0][2].redirect, 'manual');
  assert.equal(calls[1][2].method, 'GET');
  assert.equal(calls[1][2].headers['User-Agent'], 'Mozilla/5.0');
  assert.equal(calls[1][2].headersOnly, true);
  assert.equal(calls[0][2].signal.aborted, true);
  assert.equal(calls[1][2].signal.aborted, true);
  assert.equal(upstreamResponse.bodyUsed, true);

  const foreign = await postReach(env, 'KXAB-12CD', secret, 'https://foreign.example', transports);
  assert.equal(foreign.status, 403);
  assert.deepEqual(await foreign.json(), { ok: false, reason: 'host' });
  assert.equal(calls.length, 2);

  const badAuth = await postReach(env, 'KXAB-12CD', 'x'.repeat(40), 'https://portal.example:8443', transports);
  assert.equal(badAuth.status, 401);
  assert.equal(calls.length, 2);

  const { env: rateEnv, secret: rateSecret } = await reachEnv();
  const rateTransports = {
    fetch: async () => new Response('ok', { status: 200 }),
    sockFetch: async (_url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')))),
  };
  for (let i = 0; i < 6; i++) assert.equal((await postReach(rateEnv, 'KXAB-12CD', rateSecret, 'https://portal.example:8443', rateTransports)).status, 200);
  const limited = await postReach(rateEnv, 'KXAB-12CD', rateSecret, 'https://portal.example:8443', rateTransports);
  assert.equal(limited.status, 429);
});

test('TMDB search metadata returns artwork, rating, plot and Italian providers', async () => {
  const originalFetch = globalThis.fetch, calls = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input)), path = url.pathname;
    calls.push(path);
    let body = {};
    if (path === '/3/search/movie') body = { results: [{ id: 42, backdrop_path: '/backdrop.jpg', vote_average: 8.27, overview: 'Trama italiana' }] };
    else if (path === '/3/movie/42/release_dates') body = { results: [] };
    else if (path === '/3/movie/42/videos') body = { results: [] };
    else if (path === '/3/movie/42/images') body = { logos: [
      { iso_639_1: 'en', file_path: '/english.png' },
      { iso_639_1: 'it', file_path: '/italian.jpg' },
      { iso_639_1: 'it', file_path: '/italian.png' },
      { iso_639_1: null, file_path: '/neutral.png' },
    ] };
    else if (path === '/3/movie/42/watch/providers') body = { results: {
      IT: { flatrate: [
        { provider_name: 'A', logo_path: '/a.png' }, { provider_name: 'Senza logo' },
        { provider_name: 'C', logo_path: '/c.png' }, { provider_name: 'D', logo_path: '/d.png' },
        { provider_name: 'Quinto', logo_path: '/e.png' },
      ] },
      US: { flatrate: [{ provider_name: 'USA', logo_path: '/us.png' }] },
    } };
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const meta = await _internal.metaTmdb({ TMDB_KEY: 'unit-test-key' }, 'Film', 2025, 'movie');
    assert.equal(meta.logo, 'https://image.tmdb.org/t/p/w500/italian.png');
    assert.equal(meta.backdrop, 'https://image.tmdb.org/t/p/w1280/backdrop.jpg');
    assert.equal(meta.vote, 8.3);
    assert.equal(meta.plot, 'Trama italiana');
    assert.equal(meta.tmdb, 42);
    assert.deepEqual(meta.providers, [
      { n: 'A', logo: 'https://image.tmdb.org/t/p/w92/a.png' },
      { n: 'C', logo: 'https://image.tmdb.org/t/p/w92/c.png' },
      { n: 'D', logo: 'https://image.tmdb.org/t/p/w92/d.png' },
    ]);
    assert.ok(calls.includes('/3/search/movie'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('TMDB id lookup skips search', async () => {
  const originalFetch = globalThis.fetch, calls = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input)), path = url.pathname;
    calls.push(path);
    const body = path === '/3/movie/1234567890'
      ? { id: 1234567890, title: 'Titolo', backdrop_path: '/bg.jpg', vote_average: 7.5, overview: 'Descrizione' }
      : {};
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const meta = await _internal.metaTmdb({ TMDB_KEY: 'unit-test-key' }, '', 0, 'movie', '1234567890');
    assert.equal(meta.tmdb, 1234567890);
    assert.equal(meta.backdrop, 'https://image.tmdb.org/t/p/w1280/bg.jpg');
    assert.equal(calls[0], '/3/movie/1234567890');
    assert.ok(!calls.some((path) => path.startsWith('/3/search/')));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('player metadata preserves the no-key off response', async () => {
  const url = new URL('https://panel.example/api/player/meta?t=Film');
  const response = await _internal.playerMeta(new Request(url), {}, '127.0.0.1', url, {});
  assert.deepEqual(await response.json(), { cert: '', extras: [], off: true });
});

test('remote allow values and DNS rotation stay app-limited', () => {
  const rc = _internal.rcClean({ 'o.engLive:allow': ['exo', 'vlc'] }, 'ult');
  assert.deepEqual(rc, { 'o.engLive': 'allow:exo,vlc' });
  assert.deepEqual(_internal.rcClean(rc, 'ult'), rc);
  assert.equal(_internal.rcSent(rc, 'tv')['o.engLive'], undefined);
  assert.ok(Object.values(_internal.rcSent(rc, 'tv')).every((value) => typeof value !== 'string' || !value.startsWith('allow:')));
  assert.equal(_internal.rcSent(rc, 'ult')['o.engLive'], rc['o.engLive']);
  assert.equal(_internal.portalModeForApp('rot', 'tv'), 'auto');
  assert.equal(_internal.portalModeForApp('rot', 'tv', '2.7.7'), 'auto');
  assert.equal(_internal.portalModeForApp('rot', 'tv', '2.7.8'), 'rot');
  assert.equal(_internal.portalModeForApp('rot', 'ult'), 'rot');
  assert.equal(_internal.portalModeForApp('rot', 'plus'), 'rot');
  assert.equal(_internal.portalModeForApp('rot', 'nova'), 'rot');
  for (const app of ['max', 'orbix']) assert.equal(_internal.portalModeForApp('rot', app), 'auto');
  const tvRc = _internal.rcClean({ 'o.engLive:allow': ['exo', 'vlc'] }, 'tv');
  assert.equal(_internal.rcSent(tvRc, 'tv')['o.engLive'], undefined);
  assert.ok(_internal.RC_CMDS.some(([key, , , apps]) => key === 'epg' && apps.length === 1 && apps[0] === 'ult'));
  assert.ok(_internal.RC_CAT.filter(([key]) => key.startsWith('u.') && key !== 'u.dnsRot').every(([, , , , apps]) => apps.length === 1 && apps[0] === 'ult'));
  assert.deepEqual(_internal.RC_CAT.find(([key]) => key === 'u.dnsRot')[4], ['ult', 'xc', 'tv', 'ktv', 'prem', 'lite', 'plus', 'nova']);
});

test('device DNS rotation override selects rot for enabled apps with reserves only', async () => {
  const saved = [
    { id: 'main', name: 'Main', host: 'https://main.example', alts: ['backup'], mode: 'auto' },
    { id: 'backup', name: 'Backup', host: 'https://backup.example', alts: [], mode: 'auto' },
    { id: 'rot-main', name: 'Rotating', host: 'https://rot.example', alts: ['backup'], mode: 'rot' },
    { id: 'solo', name: 'Solo', host: 'https://solo.example', alts: [], mode: 'rot' },
  ];
  const env = {
    DB: {
      prepare() {
        return { all: async () => ({ results: [{ k: 'dnsl', v: JSON.stringify(saved) }] }) };
      },
    },
  };
  const main = { id: 'p1', type: 'xtream', host: 'https://main.example' };
  const rotating = { id: 'p2', type: 'xtream', host: 'https://rot.example' };
  const solo = { id: 'p3', type: 'xtream', host: 'https://solo.example' };

  const enabled = (await _internal.portalsOf(env, [main], 'ult', 'on'))[0];
  assert.equal(enabled.mode, 'rot');
  assert.deepEqual(enabled.alts, ['https://backup.example']);
  assert.equal((await _internal.portalsOf(env, [main], 'xc', 'on'))[0].mode, 'rot');
  for (const app of ['ktv', 'prem', 'lite']) assert.equal((await _internal.portalsOf(env, [main], app, 'on'))[0].mode, 'rot');
  assert.equal((await _internal.portalsOf(env, [main], 'tv', 'on'))[0].mode, 'auto');
  assert.equal((await _internal.portalsOf(env, [main], 'tv', 'on', '2.7.7'))[0].mode, 'auto');
  assert.equal((await _internal.portalsOf(env, [main], 'tv', 'on', '2.7.8'))[0].mode, 'rot');
  assert.equal((await _internal.portalsOf(env, [main], 'tv', 'off', '2.7.8'))[0].mode, 'auto');
  assert.equal((await _internal.portalsOf(env, [rotating], 'ult', 'off'))[0].mode, 'auto');
  assert.equal((await _internal.portalsOf(env, [rotating], 'xc', 'off'))[0].mode, 'auto');
  for (const app of ['ktv', 'prem', 'lite']) {
    assert.equal((await _internal.portalsOf(env, [rotating], app, 'on'))[0].mode, 'rot');
    assert.equal((await _internal.portalsOf(env, [rotating], app, 'off'))[0].mode, 'auto');
  }
  for (const app of ['portal', 'smart', 'max', 'orbix']) {
    assert.equal(_internal.portalModeForApp('rot', app), 'auto');
    assert.equal((await _internal.portalsOf(env, [main], app, 'on'))[0].mode, 'auto');
  }
  for (const app of ['plus', 'nova']) {
    assert.equal(_internal.portalModeForApp('rot', app), 'rot');
    assert.equal((await _internal.portalsOf(env, [main], app, 'on'))[0].mode, 'rot');
  }
  assert.deepEqual(await _internal.portalsOf(env, [solo], 'ult', 'on'), [solo]);
  assert.deepEqual(_internal.rcClean({ 'u.dnsRot': 'on' }, 'ult'), { 'u.dnsRot': 'on' });
  assert.deepEqual(_internal.rcClean({ 'u.dnsRot': 'on' }, 'xc'), { 'u.dnsRot': 'on' });
  assert.deepEqual(_internal.rcClean({ 'u.dnsRot': 'on' }, 'tv'), { 'u.dnsRot': 'on' });
  assert.deepEqual(_internal.RC_CAT.find(([key]) => key === 'u.dnsRot'), [
    'u.dnsRot', 'DNS rotativo', 'sel', [['on', 'Attivo'], ['off', 'Spento']], ['ult', 'xc', 'tv', 'ktv', 'prem', 'lite', 'plus', 'nova'], '', '', 'App Kairos aggiornate (Ultimate, XC, Pro, TV, Premium, Lite, Plus, Nova)',
  ]);
});

test('legacy clients never receive allow values or rot mode', () => {
  const rc = _internal.rcClean({
    'o.engLive:allow': ['exo', 'vlc'],
    'o.autoNext:allow': [true, false],
    'u.saver:allow': ['off', '20'],
  });
  for (const app of ['tv', 'portal', 'smart', 'max', 'orbix']) {
    const delivered = _internal.rcSent(rc, app);
    assert.ok(Object.keys(delivered).every((key) => !key.endsWith(':allow')), `${app} received an allow key`);
    assert.ok(Object.values(delivered).every((value) => typeof value !== 'string' || !value.startsWith('allow:')), `${app} received an allow value`);
    assert.equal(_internal.portalModeForApp('rot', app), 'auto');
  }
  const ultimate = _internal.rcSent(rc, 'ult');
  assert.equal(ultimate['o.engLive'], 'allow:exo,vlc');
  assert.equal(ultimate['o.autoNext'], 'allow:true,false');
  assert.equal(ultimate['u.saver'], 'allow:off,20');
  assert.equal(_internal.portalModeForApp('rot', 'ult'), 'rot');
  assert.equal(_internal.portalModeForApp('rot', 'xc'), 'rot');
  for (const app of ['tv', 'portal', 'smart', 'max', 'orbix']) assert.equal(_internal.portalModeForApp('rot', app), 'auto');
  assert.equal(_internal.portalModeForApp('rot', 'plus'), 'rot');
  assert.equal(_internal.portalModeForApp('rot', 'nova'), 'rot');
});

test('Ultimate catalog exposes implemented settings and omits unsupported Pro-only controls', () => {
  const ultimate = new Set(_internal.RC_CAT.filter(([, , , , apps]) => apps.includes('ult')).map(([key]) => key));
  for (const key of ['o.startScr', 'o.textSize', 'posters', 'intro', 'p.aspect', 'o.autoNext',
    'o.subSize', 'mergeVar', 'o.sortCh', 'o.sortVod', 'o.lockAdult']) {
    assert.equal(ultimate.has(key), true, `${key} must be available to Ultimate`);
  }
  for (const key of ['logos', 'o.introAuto', 'o.autoRem', 'o.showHidden', 'o.sortCats']) {
    assert.equal(ultimate.has(key), false, `${key} must remain Pro-only until Ultimate supports it`);
  }
  assert.equal(ultimate.has('o.resInd'), true);
  assert.equal(ultimate.has('o.epgShift'), true);
});
