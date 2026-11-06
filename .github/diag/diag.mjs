// Diagnosi del pannello: SOLO numeri aggregati e percentuali.
// Il repository è pubblico: qui non si stampano MAI IP, nomi, codici, email, ID o credenziali.
import { execFileSync, spawn } from 'node:child_process';

const TOKEN = process.env.CLOUDFLARE_API_TOKEN, ACC = process.env.CLOUDFLARE_ACCOUNT_ID;
const SCRIPT = 'kairos-panel', DBN = 'kairos-iptv-db';
const FREE = { rowsWritten: 1e5, rowsRead: 5e6, requests: 1e5 };
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0) + '%';
// toglie dai messaggi tutto ciò che potrebbe identificare qualcuno o l'account
const clean = (s) => String(s || '')
  .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '<email>')
  .replace(/\b\d{1,3}(\.\d{1,3}){3}\b/g, '<ip>')
  .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, '<id>')
  .replace(/\b[0-9a-f]{20,}\b/gi, '<id>')
  .replace(/'[^']*'/g, "'…'")
  .replace(/"[^"]*"/g, '"…"')
  .replace(/\bKX[A-Z0-9]{2}-[A-Z0-9]{4}\b/gi, '<cod>')
  .replace(/\b(?=[A-Za-z0-9]*\d)[A-Za-z0-9_-]{12,}\b/g, '<x>')
  .slice(0, 160);
const sh = (args) => execFileSync('wrangler', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64e6 });

async function gql(query, variables) {
  const r = await fetch('https://api.cloudflare.com/client/v4/graphql', { method: 'POST', headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify({ query, variables }) });
  const j = await r.json().catch(() => ({}));
  if (j.errors && j.errors.length) throw new Error(clean(j.errors[0].message));
  return j.data;
}

let dbId = '';
try { dbId = (JSON.parse(sh(['d1', 'list', '--json'])).find((d) => d.name === DBN) || {}).uuid || ''; } catch (e) { console.log('Elenco database non disponibile'); }


if (process.env.DIAG_MODE === 'latency') {
  console.log('\n== Database e tempi del Worker');
  try {
    const info = JSON.parse(sh(['d1', 'info', DBN, '--json']));
    const pick = {}; for (const k of Object.keys(info)) if (/region|replica|version|num_tables|size/i.test(k)) pick[k] = info[k];
    console.log('D1:', JSON.stringify(pick));
  } catch (e) { console.log('d1 info non disponibile: ' + clean(e.stderr || e.message)); }
  const host = 'https://panel-kairos.com';
  const time = async (path, init) => { const a = performance.now(); try { const r = await fetch(host + path, init); await r.text(); return [Math.round(performance.now() - a), r.status]; } catch { return [-1, 0]; } };
  const med = (a) => { const b = a.filter((x) => x >= 0).sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : -1; };
  for (const [label, path, init] of [
    ['ping (nessuna query)', '/api/player/ping', undefined],
    ['battito con codice inesistente (1 query D1)', '/api/player/heartbeat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: 'KXZZ-ZZZZ', secret: 'x'.repeat(43) }) }],
  ]) { const t = []; let st = 0; for (let i = 0; i < 7; i++) { const [ms, s] = await time(path, init); t.push(ms); st = s; } console.log(`${label}: mediana ${med(t)} ms (HTTP ${st}) · ${t.join(', ')}`); }
  try { const r = await fetch(host + '/cdn-cgi/trace'); const tx = await r.text(); const colo = (tx.match(/colo=([A-Z]+)/) || [])[1]; console.log('Worker eseguito a: ' + (colo || '?')); } catch {}
  process.exit(0);
}
/* 1) presenza nel database */
console.log('\n== Presenza nel database (adesso)');
try {
  const now = 'strftime(\'%s\',\'now\')*1000';
  const sql = `SELECT
    (SELECT COUNT(*) FROM presence WHERE t > ${now} - 180000) AS on3,
    (SELECT COUNT(*) FROM presence WHERE t > ${now} - 600000) AS on10,
    (SELECT COUNT(*) FROM presence WHERE t > ${now} - 3600000) AS on60,
    (SELECT COUNT(*) FROM presence WHERE t > ${now} - 86400000) AS d24,
    (SELECT (${now} - MAX(t)) / 1000 FROM presence) AS age_t,
    (SELECT (${now} - MAX(hb_t)) / 1000 FROM presence) AS age_hb,
    (SELECT (${now} - MAX(last_seen)) / 1000 FROM devices) AS age_reg,
    (SELECT COUNT(*) FROM devices WHERE last_seen > ${now} - 3600000) AS reg60,
    (SELECT COUNT(*) FROM presence WHERE hb_t > ${now} - 3600000) AS hb60`;
  const out = JSON.parse(sh(['d1', 'execute', DBN, '--remote', '--json', '--command', sql]));
  const r = (out[0] && out[0].results && out[0].results[0]) || {};
  console.log(`ultimo aggiornamento della presenza: ${r.age_t} s fa`);
  console.log(`ultimo battito accettato: ${r.age_hb} s fa`);
  console.log(`ultima apertura dell'app (register): ${r.age_reg} s fa`);
  console.log(`online ora (3 min) rispetto ai visti nelle 24 h: ${pct(r.on3, r.d24)}`);
  console.log(`attivi negli ultimi 10 min: ${pct(r.on10, r.d24)} · ultima ora: ${pct(r.on60, r.d24)}`);
  console.log(`dispositivi aperti nell'ultima ora che hanno anche mandato battiti: ${pct(r.hb60, r.reg60)}`);
  const by = JSON.parse(sh(['d1', 'execute', DBN, '--remote', '--json', '--command', `SELECT COALESCE(NULLIF(d.app,''),'?') AS app, SUM(p.t > ${now} - 180000) AS on3, SUM(p.t > ${now} - 3600000) AS on60, SUM(p.hb_t > ${now} - 3600000) AS hb60 FROM presence p JOIN devices d ON d.id = p.device_id WHERE p.t > ${now} - 86400000 GROUP BY 1`]));
  for (const x of (by[0] && by[0].results) || []) console.log(`  app ${x.app}: online/ultima ora ${pct(x.on3, x.on60)} · con battiti/ultima ora ${pct(x.hb60, x.on60)}`);
} catch (e) { console.log('query non riuscita: ' + clean(e.stderr || e.message)); }

/* 2) traffico in diretta: esito dei battiti per 75 secondi */
console.log('\n== Traffico in diretta (75 s)');
await new Promise((res) => {
  let buf = '';
  const p = spawn('wrangler', ['tail', SCRIPT, '--format', 'json'], { stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', (d) => { buf += d; });
  p.stderr.on('data', () => {});
  setTimeout(() => { try { p.kill('SIGINT'); } catch {} setTimeout(() => { try { p.kill('SIGKILL'); } catch {} res(buf); }, 3000); }, 75e3);
  p.on('exit', () => res(buf));
}).then((buf) => {
  // flusso di oggetti JSON uno dopo l'altro
  const evs = []; let depth = 0, start = -1, inS = false, esc = false;
  for (let i = 0; i < buf.length; i++) {
    const c = buf[i];
    if (inS) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inS = false; continue; }
    if (c === '"') inS = true; else if (c === '{') { if (!depth) start = i; depth++; } else if (c === '}') { depth--; if (!depth && start >= 0) { try { evs.push(JSON.parse(buf.slice(start, i + 1))); } catch {} start = -1; } }
  }
  // solo i primi 3 pezzi del percorso (es. /api/player/heartbeat): niente ID nei log
  const norm = (u) => { try { return new URL(u).pathname.split('/').map((s, i) => (i > 3 || /\d/.test(s) || s.length > 24 ? (s ? ':x' : s) : s)).join('/'); } catch { return '?'; } };
  // dei messaggi d'errore si stampano solo quelli tecnici (database, limiti, codice): gli altri potrebbero contenere nomi
  const TECH = /D1_|SQLITE|sqlite|TypeError|ReferenceError|SyntaxError|RangeError|exceed|limit|timeout|timed out|Network|network|CPU|memory|Too many|subrequest|constraint|no such|fetch/;
  const msgOf = (name, m) => (TECH.test(name + ' ' + m) ? clean(name + ': ' + m) : clean(name) + ': (messaggio non tecnico, nascosto)');
  const groups = new Map(), exc = new Map(), outc = new Map();
  for (const e of evs) {
    const rq = e.event && e.event.request; if (!rq) continue;
    const path = norm(rq.url), st = (e.event.response && e.event.response.status) || 0;
    const key = path.startsWith('/api/player/') || path.startsWith('/admin/') || path.startsWith('/api/') ? path : path.startsWith('/panel') ? '/panel/*' : '(altro)';
    const g = groups.get(key) || { n: 0, st: new Map(), ms: [] }; g.n++; g.st.set(st, (g.st.get(st) || 0) + 1); groups.set(key, g);
    outc.set(e.outcome, (outc.get(e.outcome) || 0) + 1);
    for (const x of e.exceptions || []) { const k = msgOf(x.name, x.message); exc.set(k, (exc.get(k) || 0) + 1); }
    for (const l of e.logs || []) if (l.level === 'error') { const k = msgOf('log', [].concat(l.message).join(' ')); exc.set(k, (exc.get(k) || 0) + 1); }
  }
  if (!evs.length) { console.log('nessun evento ricevuto (tail non disponibile o nessun traffico)'); return; }
  const tot = evs.length;
  console.log('esiti: ' + [...outc].map(([k, v]) => `${k} ${pct(v, tot)}`).join(' · '));
  for (const [k, g] of [...groups].sort((a, b) => b[1].n - a[1].n).slice(0, 25)) console.log(`${k}  (${pct(g.n, tot)} del traffico)  → ${[...g.st].sort((a, b) => b[1] - a[1]).map(([s, v]) => `${s}: ${pct(v, g.n)}`).join(', ')}`);
  if (exc.size) { console.log('errori:'); for (const [k, v] of [...exc].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`  ${pct(v, tot)}  ${k}`); }
});

/* 3) consumi del piano (oggi UTC e ieri) */
console.log('\n== Consumi (limiti del piano gratuito: D1 100.000 righe scritte e 5 milioni lette al giorno, Worker 100.000 richieste al giorno)');
const d0 = new Date(Date.now() - 864e5).toISOString().slice(0, 10), t0 = new Date(Date.now() - 864e5).toISOString();
try {
  const q = `query($a: String!, $d: Date!, $db: String!) { viewer { accounts(filter: {accountTag: $a}) {
    d1AnalyticsAdaptiveGroups(limit: 10, filter: {date_geq: $d, databaseId: $db}) { sum { rowsRead rowsWritten readQueries writeQueries } dimensions { date } } } } }`;
  const d = await gql(q, { a: ACC, d: d0, db: dbId });
  for (const g of d.viewer.accounts[0].d1AnalyticsAdaptiveGroups.sort((a, b) => a.dimensions.date.localeCompare(b.dimensions.date)))
    console.log(`D1 ${g.dimensions.date}: righe scritte ${pct(g.sum.rowsWritten, FREE.rowsWritten)} del limite gratuito · righe lette ${pct(g.sum.rowsRead, FREE.rowsRead)}`);
} catch (e) { console.log('D1: dati non disponibili (' + clean(e.message) + ')'); }
try {
  const q = `query($a: String!, $t: Time!, $s: String!) { viewer { accounts(filter: {accountTag: $a}) {
    workersInvocationsAdaptive(limit: 50, filter: {datetime_geq: $t, scriptName: $s}) { sum { requests errors subrequests } dimensions { status date } } } } }`;
  const d = await gql(q, { a: ACC, t: t0, s: SCRIPT });
  const byDay = new Map();
  for (const g of d.viewer.accounts[0].workersInvocationsAdaptive) { const o = byDay.get(g.dimensions.date) || { req: 0, err: 0, st: new Map() }; o.req += g.sum.requests; o.err += g.sum.errors; o.st.set(g.dimensions.status, (o.st.get(g.dimensions.status) || 0) + g.sum.requests); byDay.set(g.dimensions.date, o); }
  for (const [day, o] of [...byDay].sort()) console.log(`Worker ${day}: richieste ${pct(o.req, FREE.requests)} del limite gratuito · errori ${pct(o.err, o.req)} · ${[...o.st].map(([k, v]) => `${k} ${pct(v, o.req)}`).join(', ')}`);
} catch (e) { console.log('Worker: dati non disponibili (' + clean(e.message) + ')'); }
try {
  const q = `query($a: String!, $d: Date!, $db: String!) { viewer { accounts(filter: {accountTag: $a}) {
    d1QueriesAdaptiveGroups(limit: 12, orderBy: [sum_rowsWritten_DESC], filter: {date_geq: $d, databaseId: $db}) { sum { rowsRead rowsWritten } count dimensions { query } }
    r: d1QueriesAdaptiveGroups(limit: 12, orderBy: [sum_rowsRead_DESC], filter: {date_geq: $d, databaseId: $db}) { sum { rowsRead rowsWritten } count dimensions { query } } } } }`;
  const d = await gql(q, { a: ACC, d: d0, db: dbId });
  const A = d.viewer.accounts[0], W = A.d1QueriesAdaptiveGroups, R = A.r;
  const tw = W.reduce((s, g) => s + g.sum.rowsWritten, 0) || 1, tr = R.reduce((s, g) => s + g.sum.rowsRead, 0) || 1;
  console.log('\nquery che scrivono di più (quota sul totale delle prime 12):');
  for (const g of W) console.log(`  ${pct(g.sum.rowsWritten, tw)}  ${clean(g.dimensions.query).slice(0, 120)}`);
  console.log('query che leggono di più:');
  for (const g of R) console.log(`  ${pct(g.sum.rowsRead, tr)}  ${clean(g.dimensions.query).slice(0, 120)}`);
} catch (e) { console.log('dettaglio query non disponibile (' + clean(e.message) + ')'); }
process.exit(0);
