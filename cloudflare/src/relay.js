const ORIGIN = 'https://reseller.blkaccess.com';
const enc = new TextEncoder();
const JSON_LIMIT = 2 * 1024 * 1024;
const RESULT_LIMIT = 900000;
const resultVia = new Map();
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store',
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const nowSec = () => Math.floor(Date.now() / 1000);
const setting = async (env, key) => ((await env.DB.prepare('SELECT v FROM settings WHERE k = ?').bind(key).first()) || {}).v || '';
const putSetting = (env, key, value) => env.DB.prepare('INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind(key, value).run();
const deleteSetting = (env, key) => env.DB.prepare('DELETE FROM settings WHERE k = ?').bind(key).run();
const b64url = (bytes) => {
  let value = '';
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
async function tokenHash(token) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(token)));
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
function constantTimeEqual(left, right) {
  const a = enc.encode(String(left || '')), b = enc.encode(String(right || ''));
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] || 0) ^ (b[i] || 0);
  return diff === 0;
}
async function relayConfig(env, H) {
  const value = await setting(env, 'blk:relay');
  if (!value) return null;
  try {
    const config = await H.unseal(env, value);
    return config && typeof config.tokenHash === 'string' ? config : null;
  } catch {
    return null;
  }
}
async function authorized(env, H, token) {
  const config = await relayConfig(env, H);
  const candidate = await tokenHash(typeof token === 'string' ? token : '');
  return !!(config && constantTimeEqual(config.tokenHash, candidate));
}
function corsJSON(H, data, status = 200) {
  return H.json(data, status, CORS);
}
function rememberResultVia(id, via) {
  if (!id || !via) return;
  resultVia.delete(id);
  resultVia.set(id, via);
  if (resultVia.size > 1000) resultVia.delete(resultVia.keys().next().value);
}
function jsonField(value, fallback) {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}
function safePath(path) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.length > 2048) return false;
  try { return new URL(path, ORIGIN).origin === ORIGIN; } catch { return false; }
}

export async function relayPublic(req, env, path, H) {
  const started = Date.now();
  if (path !== '/api/relay/poll' && path !== '/api/relay/result') return null;
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return corsJSON(H, { error: 'Metodo non consentito' }, 405);
  try {
    const body = await H.readJSON(req, JSON_LIMIT);
    if (!await authorized(env, H, body.token)) return corsJSON(H, { error: 'Token del ponte non valido' }, 401);
    const now = nowSec();
    if (path === '/api/relay/poll') {
      await putSetting(env, 'blk:relay:seen', String(now));
      await env.DB.prepare("UPDATE relay_jobs SET state = 'failed', err = 'scaduta', done = ? WHERE state IN ('pending', 'taken') AND created < ?")
        .bind(now, now - 90).run();
      const deadline = started + 8000;
      while (true) {
        const job = await env.DB.prepare("UPDATE relay_jobs SET state = 'taken', taken = ? WHERE id = (SELECT id FROM relay_jobs WHERE state = 'pending' ORDER BY created, id LIMIT 1) AND state = 'pending' RETURNING id, method, path, headers, body")
          .bind(nowSec()).first();
        if (job) return corsJSON(H, {
          job: {
            id: job.id, method: job.method, path: job.path,
            headers: jsonField(job.headers, {}), body: job.body,
          },
        });
        const remaining = deadline - Date.now();
        if (remaining <= 0) return corsJSON(H, {});
        await sleep(Math.min(500, remaining));
      }
    }
    const id = typeof body.id === 'string' ? body.id.slice(0, 80) : '';
    if (!id) return corsJSON(H, { ok: true });
    const text = typeof body.body === 'string' ? body.body : body.body == null ? '' : JSON.stringify(body.body);
    const trunc = text.length > RESULT_LIMIT ? 1 : 0;
    const err = typeof body.err === 'string' ? body.err.slice(0, 200) : '';
    const status = Number.isInteger(body.status) && body.status >= 100 && body.status <= 599 ? body.status : null;
    const via = body.via === 'fetch' || body.via === 'iframe' ? body.via : '';
    const pending = !err && via
      ? await env.DB.prepare("SELECT id FROM relay_jobs WHERE id = ? AND state IN ('pending', 'taken')").bind(id).first()
      : null;
    if (pending) rememberResultVia(id, via);
    try {
      const updated = await env.DB.prepare("UPDATE relay_jobs SET state = ?, status = ?, res_body = ?, trunc = ?, err = ?, done = ? WHERE id = ? AND state IN ('pending', 'taken')")
        .bind(err ? 'failed' : 'done', status, text.slice(0, RESULT_LIMIT), trunc, err, now, id).run();
      if (pending && !updated.meta.changes) resultVia.delete(id);
    } catch (error) {
      if (pending) resultVia.delete(id);
      throw error;
    }
    return corsJSON(H, { ok: true });
  } catch (error) {
    const status = error instanceof H.HttpErr ? error.status : 500;
    return corsJSON(H, { error: error instanceof H.HttpErr ? error.message : 'Errore del ponte' }, status);
  }
}

export async function relayFetch(env, H, options = {}) {
  const config = await relayConfig(env, H);
  if (!config) throw new H.HttpErr(503, "Ponte KAIROS non collegato: apri Chrome con il pannello Black IPTV e l'estensione KAIROS Ponte attiva");
  const path = options.path;
  if (!safePath(path)) throw new H.HttpErr(400, 'Percorso Black IPTV non valido');
  const method = String(options.method || 'GET').toUpperCase();
  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) throw new H.HttpErr(400, 'Metodo Black IPTV non valido');
  const headers = options.headers && typeof options.headers === 'object' && !Array.isArray(options.headers) ? options.headers : {};
  const body = options.body == null ? null : typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
  const now = nowSec(), id = b64url(crypto.getRandomValues(new Uint8Array(18)));
  await env.DB.prepare('DELETE FROM relay_jobs WHERE created < ?').bind(now - 600).run();
  await env.DB.prepare("INSERT INTO relay_jobs (id, method, path, headers, body, state, created) VALUES (?, ?, ?, ?, ?, 'pending', ?)")
    .bind(id, method, path, JSON.stringify(headers), body, now).run();
  const timeout = Number.isFinite(+options.timeout) ? Math.max(1000, Math.min(60000, +options.timeout)) : 45000;
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    const job = await env.DB.prepare('SELECT state, status, res_body, trunc, err FROM relay_jobs WHERE id = ?').bind(id).first();
    if (!job) {
      resultVia.delete(id);
      throw new H.HttpErr(502, 'La richiesta del ponte non è più disponibile');
    }
    if (job.state === 'done' || job.state === 'failed') {
      const via = resultVia.get(id) || null;
      resultVia.delete(id);
      await env.DB.prepare('DELETE FROM relay_jobs WHERE id = ?').bind(id).run();
      if (job.state === 'failed') throw new H.HttpErr(502, String(job.err || 'Il ponte non ha completato la richiesta').slice(0, 200));
      return { status: job.status || 502, txt: job.res_body || '', trunc: !!job.trunc, via };
    }
    await sleep(Math.min(500, Math.max(0, until - Date.now())));
  }
  resultVia.delete(id);
  await env.DB.prepare('DELETE FROM relay_jobs WHERE id = ?').bind(id).run();
  throw new H.HttpErr(504, 'Il ponte KAIROS non ha risposto: controlla che Chrome sia aperto sul pannello Black IPTV');
}

function decodeText(value) {
  return String(value || '').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Math.min(0x10ffff, +n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(Math.min(0x10ffff, parseInt(n, 16))))
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&#0?39;/g, "'");
}
function textOnly(html) {
  return decodeText(String(html || '').replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ').trim();
}
function attr(tag, name) {
  const match = String(tag).match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return match ? decodeText(match[1] ?? match[2] ?? match[3] ?? '') : '';
}
function cellKind(html) {
  if (/<input\b[^>]*type\s*=\s*["']?(?:checkbox|radio)\b/i.test(html)) return 'checkbox';
  if (/<(?:input|select|textarea)\b/i.test(html)) return 'input';
  if (/<button\b|role\s*=\s*["']button/i.test(html)) return 'pulsante';
  if (/<a\b/i.test(html)) return 'link';
  const text = textOnly(html);
  if (!text) return 'vuota';
  if (/^(?:\d{1,4}[./-]){1,2}\d{1,4}(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?$/.test(text) || /^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?$/.test(text)) return 'data';
  if (/^[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(text)) return 'numero';
  return 'testo';
}
function sameHostPath(href, path) {
  try {
    const url = new URL(href, ORIGIN + path);
    return url.origin === ORIGIN ? url.pathname.slice(0, 300) : '';
  } catch { return ''; }
}
function sameHostUrl(href, path) {
  try {
    const url = new URL(href, ORIGIN + path);
    return url.origin === ORIGIN ? `${url.pathname}${url.search}`.slice(0, 300) : '';
  } catch { return ''; }
}
function pageEndpoints(html, path) {
  const endpoints = [], seen = new Set();
  const add = (value, from) => {
    if (!value || value.length > 300 || endpoints.length >= 40) return;
    const url = sameHostUrl(value, path);
    if (!url || url.split('?')[0].toLowerCase().endsWith('.js') || seen.has(url)) return;
    seen.add(url);
    endpoints.push({ url, from });
  };
  const endpointPattern = /^(?:https?:\/\/[^\s"']+|\/[A-Za-z0-9_\-./]+\.php(?:\?[^\s"']*)?|[A-Za-z0-9_\-.]+\.php(?:\?[^\s"']*)?)$/;
  for (const script of String(html).matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    const src = attr(`<script${script[1]}>`, 'src');
    if (src) add(src, 'src');
    if (src) continue;
    for (const match of script[2].matchAll(/(["'])([^"'\\\r\n]{1,300})\1/g)) {
      if (endpointPattern.test(match[2])) add(match[2], 'script');
      if (endpoints.length >= 40) break;
    }
    if (endpoints.length >= 40) break;
  }
  return endpoints;
}
function jsonType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') return 'object';
  return typeof value;
}
function jsonKeys(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.keys(value).slice(0, 60).map((name) => ({ name: name.slice(0, 80), type: jsonType(value[name]) }));
}
function arrayKeys(value) {
  return value.slice(0, 60).map((item, index) => ({ name: String(index), type: jsonType(item) }));
}
function jsonShape(value) {
  if (Array.isArray(value)) {
    const first = value[0];
    return {
      kind: 'array',
      count: value.length,
      keys: first && typeof first === 'object' && !Array.isArray(first) ? jsonKeys(first) : [],
    };
  }
  if (!value || typeof value !== 'object') return null;
  const names = Object.keys(value);
  const summary = {
    kind: 'object',
    count: names.length,
    keys: names.slice(0, 60).map((name) => ({ name: name.slice(0, 80), type: jsonType(value[name]) })),
  };
  const rowsKey = names.find((name) => ['data', 'aaData', 'rows'].includes(name) && Array.isArray(value[name]))
    ?? names.find((name) => Array.isArray(value[name]) && value[name].some((row) => row !== null && typeof row === 'object'));
  if (rowsKey !== undefined) {
    const rows = value[rowsKey], first = rows[0];
    summary.rowsKey = rowsKey.slice(0, 80);
    summary.rows = rows.length;
    summary.rowKeys = Array.isArray(first) ? arrayKeys(first) : jsonKeys(first);
  }
  return summary;
}
export function jsonStructure(text, path, status, trunc, via) {
  const raw = String(text || '');
  let value = raw;
  if (via === 'iframe') {
    const pre = raw.match(/<pre\b[^>]*>([\s\S]*?)<\/pre\s*>/i);
    if (pre) value = textOnly(pre[1]);
  }
  value = value.trim();
  if (!value.startsWith('{') && !value.startsWith('[')) return null;
  let parsed;
  try { parsed = JSON.parse(value); } catch { return null; }
  const json = jsonShape(parsed);
  return json ? {
    status, trunc, via: via === 'fetch' || via === 'iframe' ? via : null,
    url: path, bytes: enc.encode(raw).length, json,
  } : null;
}
export function pageStructure(html, path, status, trunc, via) {
  const tables = [];
  for (const table of String(html).matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)) {
    const tableHtml = table[1], allRows = [...tableHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
    const headerRow = allRows.find((row) => /<th\b/i.test(row[1]));
    const headerHtml = (tableHtml.match(/<thead\b[^>]*>([\s\S]*?)<\/thead>/i) || [])[1] || (headerRow && headerRow[1]) || '';
    const headers = [...headerHtml.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)].map((cell) => textOnly(cell[1]).slice(0, 80)).slice(0, 40);
    const bodyHtml = (tableHtml.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/i) || [])[1];
    const rows = bodyHtml != null
      ? [...bodyHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
      : allRows.filter((row) => row !== headerRow);
    const cells = rows[0] ? [...rows[0][1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)] : [];
    tables.push({ idx: tables.length, headers, rows: rows.length, firstRowCellKinds: cells.map((cell) => cellKind(cell[1])).slice(0, 40) });
    if (tables.length >= 40) break;
  }
  const title = textOnly((String(html).match(/<title\b[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').slice(0, 160);
  const forms = [...String(html).matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)].slice(0, 40).map((form) => {
    const fields = [...form[2].matchAll(/<(input|select|textarea|button)\b([^>]*)>/gi)].slice(0, 80).map((field) => ({
      name: attr(field[0], 'name').slice(0, 80),
      type: (attr(field[0], 'type') || (field[1].toLowerCase() === 'textarea' ? 'textarea' : field[1].toLowerCase() === 'select' ? 'select' : 'button')).slice(0, 24),
    }));
    return { action: sameHostPath(attr(form[0], 'action') || path, path), method: (attr(form[0], 'method') || 'get').toLowerCase().slice(0, 8), fields };
  });
  const outsideTables = String(html).replace(/<table\b[^>]*>[\s\S]*?<\/table>/gi, ' ');
  const links = [...outsideTables.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].map((link) => ({
    href: sameHostPath(attr(link[0], 'href'), path),
    text: textOnly(link[2]).slice(0, 40),
  })).filter((link) => link.href).slice(0, 40);
  return {
    status, trunc, via: via === 'fetch' || via === 'iframe' ? via : null, title, url: path, tables, forms, links,
    scripts: [...String(html).matchAll(/<script\b/gi)].length,
    bytes: enc.encode(String(html)).length,
    endpoints: pageEndpoints(html, path),
  };
}

export async function blkRoutes(req, env, path, who, ip, H) {
  if (!path.startsWith('/blk/')) return null;
  const method = req.method;
  if (path === '/blk/state' && method === 'GET') {
    const [config, seen, pending] = await Promise.all([
      relayConfig(env, H), setting(env, 'blk:relay:seen'),
      env.DB.prepare("SELECT COUNT(*) AS n FROM relay_jobs WHERE state IN ('pending', 'taken')").first(),
    ]);
    return H.json({ installed: !!config, lastSeen: Number(seen) || 0, pending: Number(pending && pending.n) || 0 });
  }
  if (path === '/blk/token' && method === 'POST') {
    const token = b64url(crypto.getRandomValues(new Uint8Array(32)));
    await putSetting(env, 'blk:relay', await H.seal(env, { tokenHash: await tokenHash(token), created: nowSec() }));
    await deleteSetting(env, 'blk:relay:seen');
    await env.DB.prepare("DELETE FROM relay_jobs WHERE state IN ('pending', 'taken')").run();
    await H.log(env, 'edit', `${who}: creato il codice del ponte Black IPTV`, ip).catch(() => {});
    return H.json({ token });
  }
  if (path === '/blk/token' && method === 'DELETE') {
    await Promise.all([deleteSetting(env, 'blk:relay'), deleteSetting(env, 'blk:relay:seen')]);
    await env.DB.prepare("DELETE FROM relay_jobs WHERE state IN ('pending', 'taken')").run();
    await H.log(env, 'edit', `${who}: scollegato il ponte Black IPTV`, ip).catch(() => {});
    return H.json({ ok: true });
  }
  if (path === '/blk/probe' && method === 'POST') {
    const body = await H.readJSON(req, 32768);
    const target = typeof body.path === 'string' ? body.path : '';
    if (target.length > 512 || target.includes('..') || !/^\/[A-Za-z0-9_.\/-]*(?:\?[A-Za-z0-9_.\/\-=&%+:,~*!'()\[\]]*)?$/.test(target)) throw new H.HttpErr(400, 'Percorso non valido');
    const probeMethod = body.method === undefined ? 'GET' : body.method;
    if (probeMethod !== 'GET' && probeMethod !== 'POST') throw new H.HttpErr(400, 'Metodo non consentito');
    if (body.form !== undefined && (typeof body.form !== 'string' || body.form.length > 4000)) throw new H.HttpErr(400, 'Parametri POST non validi');
    const headers = probeMethod === 'POST'
      ? { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' }
      : target.includes('?') ? { 'X-Requested-With': 'XMLHttpRequest' } : {};
    const result = await relayFetch(env, H, {
      method: probeMethod, path: target, headers,
      body: probeMethod === 'POST' ? body.form || '' : undefined,
      timeout: 45000, label: 'Controllo pagine Black IPTV',
    });
    const summary = jsonStructure(result.txt, target, result.status, result.trunc, result.via)
      || pageStructure(result.txt, target, result.status, result.trunc, result.via);
    await H.log(env, 'edit', `${who}: controllo struttura pagina Black IPTV (HTTP ${result.status})`, ip).catch(() => {});
    return H.json(summary);
  }
  if (path === '/blk/state' || path === '/blk/token' || path === '/blk/probe') throw new H.HttpErr(405, 'Metodo non consentito');
  return null;
}
