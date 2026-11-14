/* Kairos Player per TV LG e Samsung — «invia la lista dal telefono» (14 novembre 2026).
   Il TV chiede un codice breve (POST /api/tv/pair) e lo mostra; chi ha il codice apre la pagina /tv e scrive la lista
   (POST /api/tv/send); il TV la ritira una volta sola (POST /api/tv/poll, con il suo segreto) e la salva su di sé.
   Sul server la lista resta cifrata, al massimo 15 minuti, e si cancella alla consegna. Nessun legame con clienti, codici o
   linee del pannello: è solo un passaggio di dati verso il TV che ha chiesto il codice. */

const TTL = 15 * 60e3;
const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // senza 0 O 1 I L: si legge e si scrive senza errori
const MAX_ROWS = 4000;
let ready = false;

async function ensure(env) {
  if (ready) return;
  // la migrazione 0057 crea la tabella; qui solo per sicurezza se il codice arriva prima della migrazione
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS tv_pair (code TEXT PRIMARY KEY, secret_hash TEXT NOT NULL, payload TEXT NOT NULL DEFAULT '', created INTEGER NOT NULL, ip TEXT NOT NULL DEFAULT '')").run();
  ready = true;
}
const cleanCode = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
const str = (v, n) => String(v === undefined || v === null ? '' : v).trim().slice(0, n);
const originOf = (v) => { try { const u = new URL(/^https?:\/\//i.test(v) ? v : 'http://' + v); return /^https?:$/.test(u.protocol) && u.hostname && !u.username && !u.password ? u.origin : ''; } catch { return ''; } };
async function body(req) { try { const t = await req.text(); return t.length > 6000 ? {} : JSON.parse(t || '{}') || {}; } catch { return {}; } }

/** intestazioni: le API le chiama l'app del TV (altra origine), la pagina ha stile e script interni */
export function tvHeaders(h, page) {
  if (page) {
    h.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'");
    h.set('Cache-Control', 'no-cache');
    return;
  }
  h.set('Access-Control-Allow-Origin', '*');
  h.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  h.set('Access-Control-Allow-Headers', 'Content-Type');
  h.set('Access-Control-Max-Age', '86400');
  h.set('Cross-Origin-Resource-Policy', 'cross-origin');
  h.set('Cache-Control', 'no-store');
}

export async function tvPair(req, env, ctx, url, ip, H) {
  const { json, limited, seal, unseal, now, rand, b64url, sha256 } = H, path = url.pathname, m = req.method;
  if (path === '/tv' || path === '/tv/') return new Response(PAGE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  if (m === 'OPTIONS') return new Response(null, { status: 204 });
  if (m !== 'POST') return json({ error: 'Metodo non valido' }, 405);
  await ensure(env);
  const t = now(), b = await body(req);

  if (path === '/api/tv/pair') {
    if (await limited(env.RL_DEVICE, 'tvp:' + ip)) return json({ error: 'Troppe richieste, riprova tra poco' }, 429);
    await env.DB.prepare('DELETE FROM tv_pair WHERE created < ?').bind(t - TTL).run();
    const cnt = await env.DB.prepare('SELECT COUNT(*) AS n FROM tv_pair').first();
    if (cnt && cnt.n >= MAX_ROWS) return json({ error: 'Servizio occupato, riprova tra qualche minuto' }, 503);
    const secret = b64url(rand(18)), sh = await sha256('tv:' + secret);
    for (let k = 0; k < 6; k++) {
      const r = rand(6); let code = '';
      for (let i = 0; i < 6; i++) code += ALPHA[r[i] % ALPHA.length];
      try { await env.DB.prepare("INSERT INTO tv_pair (code, secret_hash, payload, created, ip) VALUES (?, ?, '', ?, ?)").bind(code, sh, t, ip).run(); } catch { continue; } // codice già in uso: se ne prova un altro
      return json({ code, secret, ttl: Math.round(TTL / 1000), page: url.origin + '/tv' });
    }
    return json({ error: 'Riprova' }, 503);
  }

  if (path === '/api/tv/send') {
    if (await limited(env.RL_DEVICE, 'tvs:' + ip)) return json({ error: 'Troppe richieste, riprova tra poco' }, 429);
    const code = cleanCode(b.code);
    const row = code.length === 6 ? await env.DB.prepare('SELECT code FROM tv_pair WHERE code = ? AND created >= ?').bind(code, t - TTL).first() : null;
    if (!row) return json({ error: 'Codice non valido o scaduto: controlla quello che vedi sul TV' }, 404);
    const list = { name: str(b.name, 60), type: b.type === 'xtream' ? 'xtream' : 'm3u' };
    if (list.type === 'xtream') {
      list.host = originOf(str(b.host, 300)); list.user = str(b.user, 200); list.pass = String(b.pass === undefined || b.pass === null ? '' : b.pass).slice(0, 200);
      if (!list.host || !list.user || !list.pass) return json({ error: 'Scrivi server, utente e password' }, 400);
    } else {
      let u = str(b.url, 1000); if (u && !/^https?:\/\//i.test(u)) u = 'http://' + u;
      if (!originOf(u)) return json({ error: 'Scrivi l\'indirizzo della lista (http://…)' }, 400);
      list.url = u;
    }
    await env.DB.prepare('UPDATE tv_pair SET payload = ? WHERE code = ?').bind(await seal(env, list), code).run();
    return json({ ok: true });
  }

  if (path === '/api/tv/poll') {
    const code = cleanCode(b.code), secret = str(b.secret, 80);
    const row = code.length === 6 && secret ? await env.DB.prepare('SELECT secret_hash, payload, created FROM tv_pair WHERE code = ?').bind(code).first() : null;
    if (!row || row.secret_hash !== await sha256('tv:' + secret) || +row.created < t - TTL) return json({ status: 'gone' });
    if (!row.payload) return json({ status: 'wait', left: Math.max(0, Math.round((+row.created + TTL - t) / 1000)) });
    const list = await unseal(env, row.payload);
    await env.DB.prepare('DELETE FROM tv_pair WHERE code = ?').bind(code).run(); // consegnata: sul server non resta nulla
    return list && list.type ? json({ status: 'ready', list }) : json({ status: 'gone' });
  }
  return json({ error: 'Non trovato' }, 404);
}

/* pagina per chi scrive la lista (dal telefono o dal computer). Nessun contenuto, nessun elenco di fornitori. */
const PAGE = `<!DOCTYPE html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>Kairos Player</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#0b0f1a;color:#eef1f8;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;line-height:1.45}
main{max-width:460px;margin:0 auto;padding:22px 18px 40px}h1{font-size:15px;letter-spacing:.24em;color:#f5b301;margin:6px 0 18px}
h2{font-size:22px;margin:0 0 8px}p{color:#b9c1d8;font-size:15px;margin:0 0 16px}
label{display:block;font-size:13px;color:#9aa3bd;margin:14px 0 5px}
input{width:100%;height:48px;border-radius:10px;border:2px solid #24304d;background:#121a2b;color:#fff;font-size:17px;padding:0 12px;outline:none}
input:focus{border-color:#f5b301}#code{font-size:26px;letter-spacing:.3em;text-align:center;text-transform:uppercase;font-weight:700}
.seg{display:flex;gap:8px;margin-top:16px}.seg button{flex:1;height:44px;border-radius:10px;border:2px solid #24304d;background:#121a2b;color:#c8cfe3;font-size:15px;font-weight:600}
.seg button.on{border-color:#f5b301;color:#fff;background:#1a2a4a}
#go{width:100%;height:52px;margin-top:22px;border:0;border-radius:12px;background:#f5b301;color:#0b0f1a;font-size:17px;font-weight:700}
#go[disabled]{opacity:.5}#msg{min-height:24px;margin-top:14px;font-size:15px;color:#ffcf66}#msg.ok{color:#7dffb0}
small{display:block;color:#7f8aa8;font-size:12.5px;margin-top:22px}.hide{display:none}
</style></head><body><main>
<h1>KAIROS PLAYER</h1>
<h2 data-t="title">Invia la lista al TV</h2>
<p data-t="lead">Scrivi il codice che vedi sul TV e la tua lista. Arriva al TV in pochi secondi.</p>
<label for="code" data-t="code">Codice sul TV</label><input id="code" maxlength="7" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABC234">
<div class="seg"><button type="button" id="tM" class="on" data-t="m3u">Link M3U</button><button type="button" id="tX" data-t="xt">Accesso Xtream</button></div>
<label for="name" data-t="name">Nome (facoltativo)</label><input id="name" maxlength="60" autocomplete="off">
<div id="bM"><label for="url" data-t="url">Indirizzo della lista</label><input id="url" inputmode="url" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="http://…"></div>
<div id="bX" class="hide"><label for="host" data-t="host">Server</label><input id="host" inputmode="url" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="http://server:porta">
<label for="user" data-t="user">Utente</label><input id="user" autocomplete="off" autocapitalize="none" spellcheck="false">
<label for="pass" data-t="pass">Password</label><input id="pass" autocomplete="off" autocapitalize="none" spellcheck="false"></div>
<button type="button" id="go" data-t="go">Invia al TV</button>
<div id="msg" role="status"></div>
<small data-t="note">Kairos Player è un lettore: non fornisce contenuti. Usa solo liste che hai il diritto di guardare. La lista passa da questo server solo per arrivare al tuo TV: resta cifrata e viene cancellata alla consegna, o dopo 15 minuti.</small>
</main><script>
(function(){
var EN={title:'Send the playlist to the TV',lead:'Enter the code shown on the TV and your playlist. It reaches the TV in a few seconds.',code:'Code on the TV',m3u:'M3U link',xt:'Xtream login',name:'Name (optional)',url:'Playlist address',host:'Server',user:'Username',pass:'Password',go:'Send to the TV',note:'Kairos Player is a media player: it provides no content. Only use playlists you have the right to watch. The playlist passes through this server only to reach your TV: it is kept encrypted and deleted on delivery, or after 15 minutes.',sent:'Done: look at the TV.',wait:'Sending…',net:'Connection problem: try again.',need:'Enter the code shown on the TV.'};
var IT={sent:'Fatto: guarda il TV.',wait:'Invio…',net:'Problema di connessione: riprova.',need:'Scrivi il codice che vedi sul TV.'};
var en=!/^it/i.test(navigator.language||''),T=en?EN:IT,$=function(i){return document.getElementById(i)};
if(en){document.documentElement.lang='en';var l=document.querySelectorAll('[data-t]');for(var i=0;i<l.length;i++){var k=l[i].getAttribute('data-t');if(EN[k])l[i].textContent=EN[k];}}
var type='m3u',c=/[?&]c=([A-Za-z0-9-]{4,8})/.exec(location.search);if(c)$('code').value=c[1].toUpperCase();
function pick(t){type=t;$('tM').className=t==='m3u'?'on':'';$('tX').className=t==='xtream'?'on':'';$('bM').className=t==='m3u'?'':'hide';$('bX').className=t==='xtream'?'':'hide';}
$('tM').onclick=function(){pick('m3u')};$('tX').onclick=function(){pick('xtream')};
function say(t,ok){$('msg').textContent=t;$('msg').className=ok?'ok':'';}
$('go').onclick=function(){
var code=$('code').value.replace(/[^A-Za-z0-9]/g,'');if(code.length<6){say(T.need);$('code').focus();return;}
var b={code:code,name:$('name').value,type:type,url:$('url').value,host:$('host').value,user:$('user').value,pass:$('pass').value};
$('go').disabled=true;say(T.wait);
fetch('/api/tv/send',{method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify(b),cache:'no-store',credentials:'omit'})
.then(function(r){return r.json().then(function(j){return{ok:r.ok,j:j}},function(){return{ok:false,j:{}}})})
.then(function(x){$('go').disabled=false;if(x.ok&&x.j.ok){say(T.sent,true);$('url').value='';$('pass').value='';}else say(x.j.error||T.net);})
.catch(function(){$('go').disabled=false;say(T.net);});
};
})();
</script></body></html>`;
