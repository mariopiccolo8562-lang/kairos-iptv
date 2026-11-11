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

const postReach = (env, code, secret, origin) => _internal.playerReach(new Request('https://panel.example/api/player/reach', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, secret, origin }),
}), env);

test('reach only probes an assigned host, hides upstream bodies, and rate-limits per device', async () => {
  const { env, secret } = await reachEnv();
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => { calls.push([String(url), options]); return new Response('upstream secret body', { status: 503 }); };
  try {
    const allowed = await postReach(env, 'KXAB-12CD', secret, 'https://portal.example:8443');
    assert.equal(allowed.status, 200);
    assert.deepEqual(await allowed.json(), { ok: true, status: 503 });
    assert.equal(calls[0][0], 'https://portal.example:8443/player_api.php');
    assert.equal(calls[0][1].redirect, 'manual');

    const foreign = await postReach(env, 'KXAB-12CD', secret, 'https://foreign.example');
    assert.equal(foreign.status, 403);
    assert.deepEqual(await foreign.json(), { ok: false, reason: 'host' });
    assert.equal(calls.length, 1);

    const badAuth = await postReach(env, 'KXAB-12CD', 'x'.repeat(40), 'https://portal.example:8443');
    assert.equal(badAuth.status, 401);
    assert.equal(calls.length, 1);

    const { env: rateEnv, secret: rateSecret } = await reachEnv();
    for (let i = 0; i < 6; i++) assert.equal((await postReach(rateEnv, 'KXAB-12CD', rateSecret, 'https://portal.example:8443')).status, 200);
    const limited = await postReach(rateEnv, 'KXAB-12CD', rateSecret, 'https://portal.example:8443');
    assert.equal(limited.status, 429);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
