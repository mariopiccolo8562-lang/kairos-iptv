/* KAIROS Control — «Pannello Armada»: il pannello IPTV Armada collegato con la sua API reseller ufficiale.
   Crei linee e MAG (prova o 1/3/6/12 mesi), vedi crediti, linee, MAG e sotto-reseller, rinnovi, attivi/disattivi.
   La linea creata si aggiunge a un cliente Kairos o si registra in «Appunti App» con un clic.
   Titolare; agenti solo con il suo permesso (suoi crediti, tetto mensile, solo le linee create da loro, niente
   sotto-reseller né saldo). La chiave ARMADA_KEY resta sul server. Usa le funzioni di app.js. */
(() => {
  const css = document.createElement('style');
  css.textContent = `
.ar-st{display:flex;align-items:center;gap:14px;flex-wrap:wrap}.ar-st .cr{font-size:26px;font-weight:800}.ar-st small{display:block;color:var(--mut);font-size:12px}
.ar-tabs{display:flex;gap:6px;flex-wrap:wrap;margin:16px 0 12px}
.ar-f{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.ar-f .inp{margin:0}
.ar-f label{display:flex;flex-direction:column;gap:5px;font-size:11.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--mut)}
.ar-ch{display:flex;flex-wrap:wrap;gap:6px}.ar-ch button{border:1px solid var(--line);background:none;color:var(--txt,#fff);border-radius:999px;padding:6px 13px;font:inherit;font-size:13px;cursor:pointer}
.ar-ch button.on{background:var(--acc,#3b82f6);border-color:transparent;color:#fff;font-weight:600}
.ar-res{margin-top:16px;border:1px solid rgba(52,199,123,.4);background:rgba(52,199,123,.07);border-radius:12px;padding:14px 16px}
.ar-kv{display:grid;grid-template-columns:110px minmax(0,1fr) auto;gap:8px 10px;align-items:center;font-size:13.5px}.ar-kv .mono{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ar-row{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) auto;gap:10px;align-items:center;padding:10px 0;border-top:1px solid var(--line);font-size:13px}
.ar-row .k{font-size:11px;color:var(--mut);display:block}.ar-v{display:flex;align-items:center;gap:6px;min-width:0}.ar-v span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ar-v button{background:none;border:0;color:var(--mut);cursor:pointer;padding:2px 4px;border-radius:5px;font-size:12px}.ar-v button:hover{color:var(--txt,#fff);background:#ffffff14}
.ar-tag{display:inline-block;font-size:10.5px;font-weight:700;padding:1px 7px;border-radius:5px;background:rgba(52,199,123,.15);color:#6ee3a6;margin-right:4px}
.ar-tag.w{background:rgba(224,164,49,.16);color:#ecc06f}.ar-tag.b{background:rgba(255,107,107,.14);color:#ff8f8f}.ar-tag.g{background:#ffffff12;color:var(--mut)}
.ar-act{display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap;align-items:center}.ar-act select{width:auto;margin:0;padding:5px 8px;font-size:12.5px}
@media (max-width:1000px){.ar-f{grid-template-columns:1fr 1fr}.ar-row{grid-template-columns:1fr 1fr}.ar-act{grid-column:1/-1;justify-content:flex-start}}
@media (max-width:560px){.ar-f{grid-template-columns:1fr}.ar-kv{grid-template-columns:80px minmax(0,1fr) auto}}`;
  document.head.appendChild(css);

  const IC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18h18l-2 3H5z"/><path d="M12 3v12M12 4l6 9h-6M12 6l-5 7h5"/></svg>';
  if (!$('.nav[data-v="armada"]')) {
    const b = document.createElement('button'); b.className = 'nav'; b.dataset.v = 'armada'; b.innerHTML = IC + 'Pannello Armada'; b.onclick = () => view('armada');
    const anchor = $('.nav[data-v="agents"]') || $('.nav[data-v="devices"]'); anchor ? anchor.after(b) : $('#side').appendChild(b);
    const sec = document.createElement('section'); sec.className = 'view'; sec.id = 'v-armada'; $('#v-dash').after(sec);
  }
  TITLES.armada = 'Pannello Armada';

  const A = { st: null, tab: 'new', pk: null, lines: null, mags: null, res: null, F: { q: '', f: '' }, show: new Set(), last: null, sel: new Set(), vis: [], stOn: false, limit: 100,
    form: { type: 'm3u', sub: 12, htime: 24, pack: '', mac: '', country: '', adult: false, notes: '' } };
  const DAY = 864e5, fmtD = (t) => (t ? new Date(t).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
  const left = (t) => { if (!t) return ''; const d = Math.ceil((t - Date.now()) / DAY); return d < 0 ? `scaduta da ${-d} g` : d === 0 ? 'scade oggi' : `tra ${d} g`; };
  const copy = (t, w) => navigator.clipboard.writeText(t).then(() => toast(w + ' copiato'), () => toast('Copia non consentita dal browser', 1));
  const SUBS = [[0, 'Prova'], [1, '1 mese'], [3, '3 mesi'], [6, '6 mesi'], [12, '12 mesi']];
  const m3u = (u, p) => (A.st && A.st.dns ? `${A.st.dns}/get.php?username=${encodeURIComponent(u)}&password=${encodeURIComponent(p)}&type=m3u_plus&output=ts` : '');
  const ldErr = (e) => ({ err: e.message });
  const isAg = () => D.role === 'agent';
  const fmtC = (n) => (Math.round((+n || 0) * 100) / 100).toLocaleString('it-IT');

  async function loadState() { try { A.st = await api('GET', '/admin/armada/state'); } catch (e) { A.st = { connected: false, error: e.message }; } render(); }
  async function loadTab(force) {
    if (!A.st || !A.st.connected) return;
    const t = A.tab;
    try {
      if (t === 'new' && (!A.pk || force)) A.pk = (await api('GET', '/admin/armada/packages')).packages || [];
      if (t === 'lines' && (!A.lines || force)) A.lines = (await api('GET', '/admin/armada/lines')).lines || [];
      if (t === 'mags' && (!A.mags || force)) A.mags = (await api('GET', '/admin/armada/mags')).mags || [];
      if (t === 'res' && (!A.res || force)) A.res = (await api('GET', '/admin/armada/resellers')).resellers || [];
    } catch (e) { if (t === 'new') A.pk = ldErr(e); if (t === 'lines') A.lines = ldErr(e); if (t === 'mags') A.mags = ldErr(e); if (t === 'res') A.res = ldErr(e); }
    render();
  }

  function stateHtml() {
    const s = A.st;
    if (!s) return '<div class="card glass"><p class="mut">Caricamento…</p></div>';
    if (s.agent) {
      const bd = s.budget || {}, pct = bd.limit ? Math.min(100, Math.round((bd.used / bd.limit) * 100)) : 100;
      if (!s.connected) return `<div class="card glass"><p class="mut">Armada non è collegato: chiedi a chi ti gestisce.</p></div>`;
      return `<div class="card glass"><div class="ar-st"><div style="flex:1;min-width:220px"><b style="font-size:15px">✅ Pannello Armada</b><small>Usi i crediti di chi ti gestisce, entro il tuo tetto del mese. Vedi solo le linee create da te.</small></div>
        <div><small>Crediti usati questo mese</small><span class="cr">${fmtC(bd.used)}</span><small>su ${fmtC(bd.limit)} · ne restano <b>${fmtC(bd.left)}</b></small><div class="ag-bar2" style="margin-top:6px;width:160px"><s style="width:${pct}%"></s></div></div>
        ${bd.trial ? `<div><small>Prove di oggi</small><span class="cr" style="font-size:20px">${bd.trials}/${bd.trialMax}</span></div>` : ''}<button class="btn sm" id="arRe">Aggiorna</button></div></div>`;
    }
    const cfg = `<details style="margin-top:12px"><summary style="cursor:pointer;font-weight:600;font-size:13px">Indirizzi</summary>
      <div class="ar-f" style="margin-top:10px;grid-template-columns:1fr 1fr auto"><label>Indirizzo API<input class="inp mono" id="arUrl" value="${esc(s.url || '')}" placeholder="https://ts-spain.xyz/api.php"></label>
      <label>DNS delle linee (per i link M3U)<input class="inp mono" id="arDns" value="${esc(s.dns || '')}" placeholder="si imposta da solo alla prima linea"></label><div style="display:flex;align-items:flex-end"><button class="btn sm" id="arCfg">Salva</button></div></div></details>`;
    if (!s.connected) return `<div class="card glass"><div class="hd"><h3>Collega Armada<small>Con la chiave API ufficiale del tuo account Armada crei e rinnovi le linee da qui</small></h3></div>
      <ol style="margin:4px 0 0 18px;line-height:1.75;font-size:13.5px">
        <li>Nel pannello Armada apri il <b>profilo</b> → menu <b>strumenti</b> → genera la <b>chiave API</b> e copiala.</li>
        <li>Su GitHub apri il repository <b>kairos-iptv</b> → <b>Settings</b> → <b>Secrets and variables</b> → <b>Actions</b> → <b>New repository secret</b>.</li>
        <li>Nome: <code>ARMADA_KEY</code>, valore: la chiave. Salva.</li>
        <li>Vai su <b>Actions</b> → <b>Pannello Cloudflare</b> → <b>Run workflow</b>: dopo un minuto qui comparirà «Collegato».</li></ol>
      <p class="mut" style="font-size:12.5px;margin-top:8px">Non scrivere mai la chiave in chat o nel pannello.</p>${s.error ? `<p class="mut">${esc(s.error)}</p>` : ''}${cfg}</div>`;
    const r = s.reseller;
    return `<div class="card glass"><div class="ar-st"><div style="flex:1;min-width:200px"><b style="font-size:15px">✅ Armada collegato</b><small>${r ? `Account reseller <b>${esc(r.username)}</b>${r.enabled ? '' : ' · <span style="color:var(--bad)">disattivato</span>'}` : esc(s.error || '')}</small></div>
      ${r ? `<div><small>Crediti</small><span class="cr">${esc(r.credits)}</span></div>` : ''}<button class="btn sm" id="arRe">Aggiorna</button></div>${cfg}</div>`;
  }

  function newHtml() {
    const f = A.form, pk = A.pk;
    const packs = !pk ? '<option value="">Carico…</option>' : pk.err ? `<option value="">${esc(pk.err)}</option>` : `<option value="">Scegli…</option>${pk.map((x) => `<option value="${esc(x.id)}" ${String(f.pack) === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}`;
    const res = A.last ? resultHtml(A.last) : '';
    const bd = (A.st && A.st.budget) || null, subs = bd && !bd.trial ? SUBS.filter(([v]) => v) : SUBS;
    if (bd && !bd.trial && f.sub === 0) f.sub = 1;
    const noCr = bd && !bd.left && !bd.trial ? '<p class="mut" style="margin:0 0 12px">⚠️ Questo mese non hai più crediti Armada: chiedi a chi ti gestisce di aumentarli.</p>' : '';
    return `<div class="card glass"><div class="hd"><h3>Nuova linea<small>${bd ? 'Si crea su Armada con i crediti di chi ti gestisce (entro il tuo tetto del mese).' : 'Si crea su Armada con i tuoi crediti.'} Poi la aggiungi a un cliente${bd ? '' : ' o la registri in «Appunti App»'}.</small></h3>${window.KXQuick ? KXQuick.button('armada') : ''}</div>${noCr}
      <div class="ar-f">
        <label>Tipo<div class="ar-ch" id="arType"><button type="button" data-t="m3u" class="${f.type === 'm3u' ? 'on' : ''}">Linea M3U / Xtream</button><button type="button" data-t="mag" class="${f.type === 'mag' ? 'on' : ''}">MAG</button></div></label>
        <label style="grid-column:span 2">Durata<div class="ar-ch" id="arSub">${subs.map(([v, l]) => `<button type="button" data-s="${v}" class="${+f.sub === v ? 'on' : ''}">${l}</button>`).join('')}${+f.sub === 0 ? `<select class="inp" id="arH" style="width:auto;padding:5px 8px">${Array.from({ length: 24 }, (_, i) => i + 1).map((h) => `<option value="${h}" ${+f.htime === h ? 'selected' : ''}>${h} ${h === 1 ? 'ora' : 'ore'}</option>`).join('')}</select>` : ''}</div></label>
        ${f.type === 'mag' ? `<label>MAC del MAG<input class="inp mono" id="arMac" data-mac="strict" maxlength="17" autocomplete="off" value="${esc(f.mac)}" placeholder="00:1A:79:12:34:56"></label>` : ''}
        <label>Pacchetto di canali<select class="inp" id="arPk">${packs}</select></label>
        <label>Paese (facoltativo)<input class="inp" id="arCo" maxlength="3" value="${esc(f.country)}" placeholder="IT, oppure ALL per la VPN"></label>
        <label>Note (facoltative)<input class="inp" id="arNo" maxlength="200" value="${esc(f.notes)}" placeholder="es. nome del cliente"></label>
        <label>Contenuti per adulti<div class="tog ${f.adult ? 'on' : ''}" id="arAd" style="margin:0;padding:8px 10px"><div><b style="font-size:13px;text-transform:none;letter-spacing:0">${f.adult ? 'Attivi' : 'Spenti'}</b></div><i></i></div></label>
      </div>
      <div style="display:flex;gap:8px;margin-top:14px"><button class="btn pri" id="arGo">Crea ${f.type === 'mag' ? 'MAG' : 'linea'}</button></div>${res}</div>`;
  }

  function resultHtml(x) {
    const kv = (k, v, w) => `<span class="mut">${k}</span><span class="mono" title="${esc(v)}">${esc(v)}</span>${v ? `<button class="btn sm" data-arcp="${esc(w)}">Copia</button>` : '<span></span>'}`;
    const apps = [...new Set((((D.settings && D.settings.appLinks) || []).map((y) => y.name)))];
    return `<div class="ar-res"><b>✅ ${x.type === 'mag' ? 'MAG creato' : 'Linea creata'}</b>${x.userId ? ` <span class="mut">· ID ${esc(x.userId)}</span>` : ''}
      <div class="ar-kv" style="margin-top:10px">${x.type === 'mag' ? kv('MAC', x.mac, 'mac') + (isAg() ? '' : kv('Portale', x.url, 'url')) : kv('Utente', x.username, 'username') + kv('Password', x.password, 'password') + (isAg() ? '' : kv('DNS', x.host, 'host') + kv('Link M3U', x.url, 'url'))}</div>
      ${x.type === 'm3u' && x.username ? `<div style="margin-top:14px;display:grid;gap:10px">
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><b style="font-size:13px">Aggiungila a un cliente:</b><input class="inp" id="arCl" list="arClL" placeholder="nome o codice del cliente" style="margin:0;max-width:280px"><button class="btn sm" id="arToCl">Apri la scheda</button></div>
        <datalist id="arClL">${(D.devices || []).filter((d) => !d.parent).slice(0, 3000).map((d) => `<option value="${esc((d.name || 'Senza nome') + ' · ' + d.code)}">`).join('')}</datalist>
        ${isAg() ? '' : `<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center"><b style="font-size:13px">Registrala in «Appunti App» con l'app:</b>${apps.map((a) => `<button class="btn sm" data-arapp="${esc(a)}">${esc(a)}</button>`).join('')}</div>`}</div>` : ''}${x.cost ? `<p class="mut" style="margin:10px 0 0;font-size:12.5px">Crediti usati: <b>${fmtC(x.cost)}</b></p>` : ''}</div>`;
  }

  function listHtml(kind) {
    const L = kind === 'lines' ? A.lines : A.mags;
    if (!L) return '<p class="mut">Caricamento…</p>';
    if (L.err) return `<p class="mut">${esc(L.err)}</p>`;
    const now = Date.now(), F = A.F, q = F.q.toLowerCase().trim();
    const st = (x) => (!x.enabled ? 'off' : x.exp && x.exp < now ? 'exp' : x.trial ? 'trial' : x.exp && x.exp - now < 7 * DAY ? 'soon' : 'ok');
    const FL = [['', 'Tutte'], ['ok', 'Attive'], ['soon', 'In scadenza'], ['exp', 'Scadute'], ['trial', 'Prova'], ['off', 'Disattivate']];
    const K = kind === 'lines' && A.st && A.st.dns ? window.KXOnline : null;
    const list = L.filter((x) => (!F.f || st(x) === F.f) && (!F.on || !K || K.match(F.on, [K.state(A.st.dns, x.username, x.password)])) && (!q || [x.username, x.mac, x.notes, x.owner, x.isp, x.country, x.by].join(' ').toLowerCase().includes(q)));
    A.vis = list.map((x) => (kind === 'lines' ? 'l' : 'm') + x.id);
    const TAG = { ok: ['Attiva', ''], soon: ['In scadenza', 'w'], exp: ['Scaduta', 'b'], trial: ['Prova', 'w'], off: ['Disattivata', 'g'] };
    const row = (x) => {
      const t = TAG[st(x)], id = kind === 'lines' ? 'l' + x.id : 'm' + x.id, vis = A.show.has(id), link = kind === 'lines' ? m3u(x.username, x.password) : '';
      return `<div class="ar-row">
        <div>${window.KXTools ? KXTools.ck('ar', id, A.sel.has(id)) : ''}${kind === 'lines' ? `<span class="k">Utente</span><div class="ar-v"><span class="mono">${esc(x.username)}</span><button data-arc="u" data-ari="${x.id}" title="Copia">⧉</button></div><span class="k" style="margin-top:4px">Password</span><div class="ar-v"><span class="mono">${vis ? esc(x.password) : '••••••••'}</span><button data-areye="${id}" title="Mostra / nascondi">👁</button><button data-arc="p" data-ari="${x.id}" title="Copia">⧉</button></div>`
          : `<span class="k">MAC</span><div class="ar-v"><span class="mono">${esc(x.mac)}</span><button data-arc="m" data-ari="${x.id}" title="Copia">⧉</button></div>`}</div>
        <div><span class="k">Scadenza</span>${esc(fmtD(x.exp))}<br><span class="mut" style="font-size:12px">${esc(left(x.exp))}</span></div>
        <div><span class="ar-tag ${t[1]}">${t[0]}</span>${x.trial && st(x) !== 'trial' ? '<span class="ar-tag w">prova</span>' : ''}<br><span class="mut" style="font-size:12px">${x.maxConn ? x.maxConn + ' conn.' : ''}${x.country ? ' · ' + esc(x.country) : ''}</span></div>
        <div>${kind === 'lines' && window.KXOnline && A.st ? KXOnline.slot(A.st.dns, x.username, x.password) + '<br>' : ''}<span class="k">Ultima attività</span>${esc(x.lastActivity || '—')}${x.notes ? `<span class="k" style="margin-top:4px">Note</span><span>${esc(x.notes)}</span>` : ''}${x.owner && A.st.reseller && x.owner !== A.st.reseller.username ? `<span class="k" style="margin-top:4px">Reseller</span><span>${esc(x.owner)}</span>` : ''}${x.byAgent ? `<span class="k" style="margin-top:4px">Creata dall'agente</span><span>${esc(x.by)}</span>` : ''}</div>
        <div class="ar-act">${link ? `<button class="btn sm" data-arlink="${x.id}">Copia link</button>` : ''}${kind === 'lines' && window.KXMxpNew ? `<button class="btn sm" data-armxp="${x.id}" title="Crea il cliente su MaxPlayer con questa linea">MaxPlayer</button>` : ''}${kind === 'lines' && window.KXOxpNew ? `<button class="btn sm" data-aroxp="${x.id}" title="Aggiungi questa linea a un dispositivo OrbixPlay">OrbixPlay</button>` : ''}${kind === 'lines' && window.KXOrcpNew ? `<button class="btn sm" data-arorcp="${x.id}" title="Segna la linea per l'app e prepara il messaggio al cliente">${esc(KXOrcpName())}</button>` : ''}<select class="inp" data-arsub="${id}">${[1, 3, 6, 12].map((m) => `<option value="${m}">${m} ${m === 1 ? 'mese' : 'mesi'}</option>`).join('')}</select><button class="btn sm pri" data-arren="${id}">Rinnova</button><button class="btn sm ${x.enabled ? 'danger' : ''}" data-artog="${id}">${x.enabled ? 'Disattiva' : 'Attiva'}</button></div></div>`;
    };
    const cnt = (k) => L.filter((x) => !k || st(x) === k).length;
    return `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px"><input class="inp" id="arQ" placeholder="Cerca ${kind === 'lines' ? 'utente' : 'MAC'}, note${isAg() ? '' : ', reseller, agente'}…" value="${esc(F.q)}" style="flex:1;min-width:220px;margin:0">${K ? K.sel('arOn', F.on || '') : ''}</div>
      <div class="filters" style="margin:0 0 6px">${FL.map(([k, l]) => `<button class="fchip ${F.f === k ? 'on' : ''}" data-arf="${k}">${l}<span>${cnt(k)}</span></button>`).join('')}</div>
      ${window.KXTools ? KXTools.bar('ar', A.vis.filter((k) => A.sel.has(k)).length, list.length, [['ren', 'Rinnova', 'pri'], ['on', 'Attiva'], ['off', 'Disattiva'], ...(kind === 'lines' ? [['msg', 'Messaggio ai clienti']] : [])]) + (A.stOn ? statsHtml(L, st) : '') : ''}
      ${list.length ? list.slice(0, A.limit).map(row).join('') : `<p class="mut" style="padding:12px 0">${L.length ? 'Nessuna con questi filtri.' : 'Ancora niente.'}</p>`}
      ${list.length > A.limit ? `<button class="btn sm" id="arMore" style="margin-top:10px">Mostra altre ${Math.min(100, list.length - A.limit)} (${A.limit} su ${list.length})</button>` : ''}`;
  }

  function resHtml() {
    const L = A.res;
    if (!L) return '<p class="mut">Caricamento…</p>';
    if (L.err) return `<p class="mut">${esc(L.err)}</p>`;
    if (!L.length) return '<p class="mut">Nessun sotto-reseller.</p>';
    return L.map((x) => `<div class="ar-row" style="grid-template-columns:minmax(0,1.3fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)">
      <div><b>${esc(x.username)}</b><br><span class="mut" style="font-size:12px">${esc(x.email || '')}</span></div>
      <div><span class="k">Crediti</span><b>${esc(x.credits)}</b></div>
      <div><span class="k">Clienti</span>${x.clients} · <span class="ar-tag ${x.enabled ? '' : 'g'}">${x.enabled ? 'Attivo' : 'Disattivato'}</span></div>
      <div><span class="k">Ultimo accesso</span>${esc(x.lastLogin || '—')}${x.notes ? `<span class="k" style="margin-top:4px">Note</span>${esc(x.notes)}` : ''}</div></div>`).join('');
  }

  function render() {
    const V = $('#v-armada'); if (!V) return;
    if (isAg() && !(((D.me || {}).perms) || {}).armada) { V.innerHTML = '<div class="emptyc">Il pannello Armada non ti è stato concesso: chiedilo a chi ti gestisce.</div>'; return; }
    const s = A.st, on = s && s.connected;
    const nL = A.lines && !A.lines.err ? ` <span>${A.lines.length}</span>` : '', nM = A.mags && !A.mags.err ? ` <span>${A.mags.length}</span>` : '';
    if (isAg() && A.tab === 'res') A.tab = 'new';
    const body = !on ? '' : A.tab === 'new' ? newHtml() : `<div class="card glass"><div class="hd"><h3>${A.tab === 'lines' ? 'Linee' : A.tab === 'mags' ? 'MAG' : 'Sotto-reseller'}<small>${A.tab === 'res' ? 'I reseller sotto il tuo account Armada' : isAg() ? 'Solo quelle create da te: i rinnovi usano i crediti del tuo tetto mensile' : 'Dal tuo account Armada: rinnovi e attivazioni usano i tuoi crediti'}</small></h3><button class="btn sm" id="arReT">Aggiorna</button></div>${A.tab === 'res' ? resHtml() : listHtml(A.tab)}</div>`;
    const y = window.scrollY;
    V.innerHTML = stateHtml() + (on ? `<div class="ar-tabs filters">${[['new', 'Nuova linea'], ['lines', 'Linee' + nL], ['mags', 'MAG' + nM], ...(isAg() ? [] : [['res', 'Sotto-reseller']])].map(([k, l]) => `<button class="fchip ${A.tab === k ? 'on' : ''}" data-artab="${k}">${l}</button>`).join('')}</div>` + body : '');
    window.scrollTo(0, y);
    bind(V); bindTools(V);
  }

  function readForm() {
    const f = A.form;
    if ($('#arMac')) f.mac = $('#arMac').value.trim();
    if ($('#arPk')) f.pack = $('#arPk').value;
    if ($('#arCo')) f.country = $('#arCo').value.trim();
    if ($('#arNo')) f.notes = $('#arNo').value.trim();
    if ($('#arH')) f.htime = +$('#arH').value;
  }

  function bind(V) {
    if (!V.dataset.bound) { V.dataset.bound = '1'; for (const ev of ['input', 'change']) V.addEventListener(ev, (e) => e.stopPropagation()); } // non conta tra le «modifiche non salvate»
    $('#arRe') && ($('#arRe').onclick = () => loadState());
    $('#arCfg') && ($('#arCfg').onclick = async () => { try { await api('PUT', '/admin/settings', { armadaUrl: $('#arUrl').value.trim(), armadaDns: $('#arDns').value.trim() }); toast('Indirizzi salvati'); A.pk = A.lines = A.mags = A.res = null; await loadState(); loadTab(); } catch (e) { toast(e.message, 1); } });
    $$('[data-artab]', V).forEach((b) => (b.onclick = () => { readForm(); A.tab = b.dataset.artab; A.F = { q: '', f: '' }; A.sel.clear(); A.limit = 100; render(); loadTab(); }));
    $('#arReT') && ($('#arReT').onclick = () => loadTab(true));
    // nuova linea
    $$('#arType [data-t]').forEach((b) => (b.onclick = () => { readForm(); A.form.type = b.dataset.t; render(); }));
    $$('#arSub [data-s]').forEach((b) => (b.onclick = () => { readForm(); A.form.sub = +b.dataset.s; render(); }));
    $('#arAd') && ($('#arAd').onclick = () => { readForm(); A.form.adult = !A.form.adult; render(); });
    $('#arGo') && ($('#arGo').onclick = async () => {
      readForm(); const f = A.form;
      if (!f.pack) return toast('Scegli il pacchetto di canali', 1);
      if (f.type === 'mag' && !f.mac) return toast('Scrivi il MAC del MAG', 1);
      const pn = ((A.pk || []).find((x) => x.id === String(f.pack)) || {}).name || '', dur = f.sub ? (SUBS.find((x) => x[0] === f.sub) || [])[1] : `prova di ${f.htime} ${f.htime === 1 ? 'ora' : 'ore'}`;
      const bd = A.st && A.st.budget, cr = bd ? ` Crediti del tuo tetto ancora disponibili questo mese: <b>${fmtC(bd.left)}</b>.` : A.st && A.st.reseller ? ` Crediti disponibili: <b>${esc(A.st.reseller.credits)}</b>.` : '';
      if (!(await ask(`Creare ${f.type === 'mag' ? 'il MAG' : 'la linea'} su Armada?`, `<b>${esc(dur)}</b> · pacchetto <b>${esc(pn)}</b>${f.type === 'mag' ? ` · MAC <span class="mono">${esc(f.mac)}</span>` : ''}.${f.sub ? (bd ? ' Usa i crediti di chi ti gestisce.' : ' Usa i tuoi crediti Armada.') : ''}${cr}`, 'Crea'))) return;
      const btn = $('#arGo'); btn.disabled = true; btn.textContent = 'Creo…';
      try {
        A.last = await api('POST', '/admin/armada/new', { type: f.type, sub: f.sub, htime: f.sub ? undefined : f.htime, pack: f.pack, mac: f.type === 'mag' ? f.mac : undefined, country: f.country, adult: f.adult, notes: f.notes });
        toast(f.type === 'mag' ? 'MAG creato' : 'Linea creata'); A.form.mac = ''; A.form.notes = ''; A.lines = A.mags = null; loadState();
      } catch (e) { toast(e.message, 1); }
      render();
    });
    const L = A.last;
    $$('[data-arcp]', V).forEach((b) => (b.onclick = () => copy(L[b.dataset.arcp] || '', { username: 'Utente', password: 'Password', host: 'DNS', url: 'Link', mac: 'MAC' }[b.dataset.arcp] || 'Testo')));
    $('#arToCl') && ($('#arToCl').onclick = () => {
      const t = ($('#arCl').value || '').trim().toLowerCase(); const d = (D.devices || []).find((x) => !x.parent && (((x.name || 'Senza nome') + ' · ' + x.code).toLowerCase() === t || String(x.code).toLowerCase() === t));
      if (!d) return toast('Cliente non trovato: sceglilo dall\'elenco', 1);
      openDrawer(d, false);
      setTimeout(() => { try { edit.playlists.push({ id: 'p' + Date.now(), name: 'Armada', type: 'xtream', url: '', host: L.host, username: L.username, password: L.password }); renderDrawer(); toast('Linea aggiunta alle playlist: controlla e premi Salva'); } catch (e) { toast('Aggiungila a mano con «Incolla linea»', 1); } }, 60);
    });
    $$('[data-arapp]', V).forEach((b) => (b.onclick = async () => {
      try { await api('POST', '/admin/linked-lines', { app: b.dataset.arapp, username: L.username, password: L.password, dns: L.host, note: A.form.notes || '' }); toast('Registrata in Appunti App su ' + b.dataset.arapp); } catch (e) { toast(e.message, 1); }
    }));
    // elenchi
    if ($('#arOn')) $('#arOn').onchange = (e) => { A.F.on = e.target.value; A.limit = 100; render(); };
    const qi = $('#arQ'); if (qi) qi.oninput = () => { A.F.q = qi.value; A.limit = 100; const p = qi.selectionStart; render(); const n = $('#arQ'); n.focus(); n.setSelectionRange(p, p); };
    $$('[data-arf]', V).forEach((b) => (b.onclick = () => { A.F.f = b.dataset.arf; A.limit = 100; render(); }));
    const more = V.querySelector('#arMore'); if (more) more.onclick = () => { A.limit += 100; render(); };
    const find = (k) => (k[0] === 'l' ? A.lines : A.mags).find((x) => 'lm'[k[0] === 'l' ? 0 : 1] + x.id === k) || {};
    $$('[data-arc]', V).forEach((b) => (b.onclick = () => { const k = (A.tab === 'lines' ? 'l' : 'm') + b.dataset.ari, x = find(k); copy(b.dataset.arc === 'u' ? x.username : b.dataset.arc === 'p' ? x.password : x.mac, b.dataset.arc === 'u' ? 'Utente' : b.dataset.arc === 'p' ? 'Password' : 'MAC'); }));
    $$('[data-areye]', V).forEach((b) => (b.onclick = () => { const k = b.dataset.areye; A.show.has(k) ? A.show.delete(k) : A.show.add(k); render(); }));
    $$('[data-arlink]', V).forEach((b) => (b.onclick = () => { const x = find('l' + b.dataset.arlink); copy(m3u(x.username, x.password), 'Link M3U'); }));
    $$('[data-arorcp]', V).forEach((b) => (b.onclick = () => { const x = find('l' + b.dataset.arorcp); KXOrcpNew({ user: x.username, pass: x.password, name: x.username, note: 'Armada #' + b.dataset.arorcp, panel: 'armada' }); }));
    $$('[data-armxp],[data-aroxp]', V).forEach((b) => (b.onclick = () => { const id = b.dataset.armxp || b.dataset.aroxp, x = find('l' + id), pre = { user: x.username, pass: x.password, name: x.username, note: 'Armada #' + id }; b.dataset.armxp ? KXMxpNew(pre) : KXOxpNew(pre); }));
    $$('[data-arren]', V).forEach((b) => (b.onclick = async () => {
      const k = b.dataset.arren, x = find(k), sub = +$(`[data-arsub="${k}"]`).value, who = k[0] === 'l' ? x.username : x.mac;
      const bd = A.st && A.st.budget;
      if (!(await ask('Rinnovare su Armada?', `<b>${esc(who)}</b> di <b>${sub} ${sub === 1 ? 'mese' : 'mesi'}</b>. ${bd ? `Usa i crediti del tuo tetto (ne restano ${fmtC(bd.left)} questo mese).` : 'Usa i tuoi crediti Armada.'}`, 'Rinnova'))) return;
      try { const r = await api('POST', '/admin/armada/renew', k[0] === 'l' ? { type: 'm3u', username: x.username, password: x.password, sub } : { type: 'mag', mac: x.mac, sub }); if (r.exp) x.exp = r.exp; toast('Rinnovata' + (r.exp ? ' fino al ' + fmtD(r.exp) : '')); loadState(); loadTab(true); } catch (e) { toast(e.message, 1); }
    }));
    $$('[data-artog]', V).forEach((b) => (b.onclick = async () => {
      const x = find(b.dataset.artog), on = !x.enabled;
      if (!on && !(await ask('Disattivare su Armada?', `<b>${esc(x.username || x.mac)}</b> smette di funzionare finché non la riattivi.`, 'Disattiva'))) return;
      try { await api('POST', '/admin/armada/toggle', { id: x.id, enabled: on }); x.enabled = on; toast(on ? 'Attivata' : 'Disattivata'); render(); } catch (e) { toast(e.message, 1); }
    }));
  }

  /* azioni su più linee/MAG: solo quelle selezionate e visibili con i filtri attuali */
  const selX = () => { const L = (A.tab === 'lines' ? A.lines : A.mags) || [], p = A.tab === 'lines' ? 'l' : 'm', V = new Set(A.vis); return L.filter((x) => V.has(p + x.id) && A.sel.has(p + x.id)); };
  const who = (x) => x.username || x.mac;
  function statsHtml(L, st) {
    const now = Date.now(), c = (k) => L.filter((x) => st(x) === k).length;
    return KXTools.stats([[A.tab === 'lines' ? 'Linee' : 'MAG', L.length], ['Attive', c('ok') + c('soon'), 'g'], ['Scadono in 7 giorni', c('soon'), 'w'],
      ['Scadono in 30 giorni', L.filter((x) => x.enabled && x.exp && x.exp > now && x.exp - now < 30 * DAY).length, 'w'], ['Scadute', c('exp'), 'b'], ['Prove', c('trial')], ['Disattivate', c('off'), 'b'],
      ['Create negli ultimi 30 giorni', L.filter((x) => x.created && now - x.created < 30 * DAY).length]],
      [['Per reseller', KXTools.count(L, (x) => x.by || x.owner)], ['Per paese', KXTools.count(L.filter((x) => x.country), (x) => x.country)], ['Per operatore', KXTools.count(L.filter((x) => x.isp), (x) => x.isp)]]);
  }
  function exportCsv() {
    const S = selX(), V = new Set(A.vis), p = A.tab === 'lines' ? 'l' : 'm', L = S.length ? S : ((A.tab === 'lines' ? A.lines : A.mags) || []).filter((x) => V.has(p + x.id));
    const ln = A.tab === 'lines';
    KXTools.csv(ln ? 'armada-linee' : 'armada-mag', [['ID', (x) => x.id], ...(ln ? [['Utente', (x) => x.username], ['Password', (x) => x.password]] : [['MAC', (x) => x.mac]]),
      ['Scadenza', (x) => KXTools.day(x.exp)], ['Stato', (x) => (!x.enabled ? 'Disattivata' : x.exp && x.exp < Date.now() ? 'Scaduta' : 'Attiva')], ['Prova', (x) => (x.trial ? 'sì' : '')],
      ['Connessioni', (x) => x.maxConn || ''], ['Paese', (x) => x.country], ['Ultima attività', (x) => x.lastActivity], ['Note', (x) => x.notes], ['Reseller', (x) => x.by || x.owner],
      ...(ln ? [['Link M3U', (x) => m3u(x.username, x.password)]] : [])], L);
  }
  async function bulkRen() {
    const S = selX(); if (!S.length) return;
    const bd = A.st && A.st.budget;
    const ok = await ask(`Rinnovare ${S.length} ${A.tab === 'lines' ? (S.length === 1 ? 'linea' : 'linee') : 'MAG'} su Armada?`, `<label class="lbl">Durata per tutte</label><select class="inp" id="abS">${[1, 3, 6, 12].map((m) => `<option value="${m}">${m} ${m === 1 ? 'mese' : 'mesi'}</option>`).join('')}</select>
      <p style="margin:12px 0 0;font-size:13.5px">Costa come <b>${S.length === 1 ? '1 rinnovo singolo' : S.length + ' rinnovi singoli'}</b>. ${bd ? `Usa i crediti del tuo tetto (ne restano ${fmtC(bd.left)} questo mese).` : A.st && A.st.reseller ? `Crediti disponibili: <b>${esc(A.st.reseller.credits)}</b>.` : ''}</p>
      <p class="mut" style="font-size:12.5px;margin:6px 0 0">${S.slice(0, 12).map((x) => esc(who(x))).join(', ')}${S.length > 12 ? ` e altre ${S.length - 12}` : ''}</p>`, 'Rinnova tutte');
    if (!ok) return;
    const sub = +$('#abS').value;
    await KXTools.run(S, async (x) => { const r = await api('POST', '/admin/armada/renew', x.mac && !x.username ? { type: 'mag', mac: x.mac, sub } : { type: 'm3u', username: x.username, password: x.password, sub }); if (r.exp) x.exp = r.exp; }, 'Rinnovo');
    A.sel.clear(); loadState(); render();
  }
  async function bulkTgl(on) {
    const S = selX().filter((x) => !!x.enabled !== on);
    if (!S.length) return toast(on ? 'Sono già tutte attive' : 'Sono già tutte disattivate');
    if (!(await ask(`${on ? 'Attivare' : 'Disattivare'} ${S.length} su Armada?`, on ? 'Tornano a funzionare.' : 'Smettono di funzionare finché non le riattivi.', on ? 'Attiva' : 'Disattiva'))) return;
    await KXTools.run(S, async (x) => { await api('POST', '/admin/armada/toggle', { id: x.id, enabled: on }); x.enabled = on; }, on ? 'Attivazione' : 'Disattivazione');
    A.sel.clear(); render();
  }
  const bindTools = (V) => window.KXTools && (A.tab === 'lines' || A.tab === 'mags') && KXTools.bind(V, 'ar', A.sel, () => A.vis, { ren: bulkRen, on: () => bulkTgl(true), off: () => bulkTgl(false), csv: exportCsv,
    msg: () => { const S = selX(); KXTools.msg(KXTools.devsFor(S.map((x) => x.username)), S.length); }, stats: () => { A.stOn = !A.stOn; render(); } }, render);

  setTimeout(() => window.KXOnline && KXOnline.watch('v-armada', () => !!(A.F && A.F.on), render), 0);
  const v0 = view;
  window.view = view = function (v) { v0(v); if (v === 'armada') { render(); loadState().then(() => loadTab()); } };

  // demo
  if (typeof DEMO !== 'undefined') {
    const dm = demoApi, t = Date.now(), r6 = () => Math.random().toString(36).slice(2, 8);
    const DA = { credits: 42.5, lines: [
      { id: 456, username: 'rossi_m', password: 'Rx8-2210', enabled: true, exp: t + 120 * 864e5, created: t - 240 * 864e5, owner: 'kairos_res', notes: 'Marco Rossi', trial: false, maxConn: 1, country: 'IT', isp: 'TIM', lastActivity: '2026-11-04 20:12:00', lastIp: '' },
      { id: 457, username: 'bianchi_g', password: 'Bg-7712', enabled: true, exp: t + 4 * 864e5, created: t - 360 * 864e5, owner: 'kairos_res', notes: 'Giulia', trial: false, maxConn: 2, country: 'IT', isp: 'Fastweb', lastActivity: '2026-11-04 18:40:00', lastIp: '' },
      { id: 458, username: 'prova_99', password: 'p99', enabled: true, exp: t + 0.5 * 864e5, created: t - 0.5 * 864e5, owner: 'kairos_res', notes: '', trial: true, maxConn: 1, country: '', isp: '', lastActivity: '', lastIp: '' },
      { id: 459, username: 'vecchio_c', password: 'Vc-11', enabled: false, exp: t - 20 * 864e5, created: t - 400 * 864e5, owner: 'sub1', notes: 'non rinnovato', trial: false, maxConn: 1, country: 'IT', isp: '', lastActivity: '2026-10-10 21:00:00', lastIp: '' }],
      mags: [{ id: 789, mac: '00:1A:79:4B:22:10', enabled: true, exp: t + 60 * 864e5, created: t - 300 * 864e5, owner: 'kairos_res', notes: 'Hotel', trial: false, maxConn: 1, country: 'IT', isp: '', lastActivity: '2026-11-04 19:00:00', lastIp: '' }] };
    window.demoApi = demoApi = async function (m, p, b) {
      if (!p.startsWith('/admin/armada/')) return dm(m, p, b);
      await new Promise((r) => setTimeout(r, 150));
      const ag = D.role === 'agent', agP = ag ? (((D.me || {}).perms) || {}) : null;
      if (ag) DA.ag = DA.ag || { used: 3, trials: 0 };
      if (p === '/admin/armada/state') return ag ? { connected: true, agent: true, dns: 'http://line.armada.example:8080', budget: { limit: +agP.armadaCredits || 0, used: DA.ag.used, left: Math.max(0, (+agP.armadaCredits || 0) - DA.ag.used), trial: !!agP.armadaTrial, trials: DA.ag.trials, trialMax: 10 } } : { connected: true, url: 'https://ts-spain.xyz/api.php', dns: 'http://line.armada.example:8080', reseller: { username: 'kairos_res', credits: DA.credits.toFixed(2), enabled: true } };
      if (ag && p === '/admin/armada/resellers') throw new Error('I sotto-reseller di Armada li vede solo il titolare');
      if (ag && p === '/admin/armada/new') { if (b.sub && DA.ag.used + b.sub > (+agP.armadaCredits || 0)) throw new Error('Crediti Armada di questo mese finiti'); if (!b.sub && !agP.armadaTrial) throw new Error('Non puoi creare prove su Armada'); }
      if (ag && (p === '/admin/armada/lines' || p === '/admin/armada/mags')) { const L = p === '/admin/armada/lines' ? DA.lines : DA.mags; return { [p === '/admin/armada/lines' ? 'lines' : 'mags']: L.filter((x) => x.byAg).map(({ owner, ...x }) => ({ ...x })) }; }
      if (p === '/admin/armada/packages') return { packages: [{ id: '1', name: 'ITALIA FULL' }, { id: '2', name: 'ITALIA + SPORT' }, { id: '3', name: 'EUROPA' }] };
      if (p === '/admin/armada/lines') return { lines: DA.lines.map((x) => ({ ...x, by: x.byAg ? 'mario.rossi' : 'Tu', byAgent: x.byAg ? 2 : 0 })) };
      if (p === '/admin/armada/mags') return { mags: DA.mags.map((x) => ({ ...x, by: x.byAg ? 'mario.rossi' : 'Tu', byAgent: x.byAg ? 2 : 0 })) };
      if (p === '/admin/armada/resellers') return { resellers: [{ id: 123, username: 'sub1', email: 'sub1@esempio.it', credits: '10.50', enabled: true, notes: '', lastLogin: '2026-11-03 10:00:00', group: 'Reseller', clients: 3, owner: 'kairos_res', relation: 'direct' }] };
      if (p === '/admin/armada/new') {
        if (b.sub) DA.credits = Math.max(0, DA.credits - b.sub);
        if (ag) { if (b.sub) DA.ag.used += b.sub; else DA.ag.trials++; }
        if (b.type === 'mag') { const mac = String(b.mac || '').toUpperCase(); DA.mags.unshift({ id: 800 + DA.mags.length, mac, enabled: true, exp: t + (b.sub || 0.04) * 30 * 864e5, created: Date.now(), owner: 'kairos_res', notes: b.notes || '', trial: !b.sub, maxConn: 1 }); return { type: 'mag', mac, userId: '5001', url: 'http://portal.armada.example/c/', message: 'Add MAG successful' }; }
        const u = 'kx_' + r6(), pw = r6(); DA.lines.unshift({ id: 500 + DA.lines.length, username: u, password: pw, enabled: true, exp: t + (b.sub ? b.sub * 30 : (b.htime || 24) / 24) * 864e5, created: Date.now(), owner: 'kairos_res', notes: b.notes || '', trial: !b.sub, maxConn: 1, country: b.country || '', lastActivity: '', byAg: ag });
        return { type: 'm3u', userId: '5000', cost: ag ? b.sub : undefined, username: u, password: pw, host: 'http://line.armada.example:8080', url: `http://line.armada.example:8080/get.php?username=${u}&password=${pw}&type=m3u_plus&output=ts`, message: 'Add M3U successful' };
      }
      if (p === '/admin/armada/renew') { if (ag) { if (DA.ag.used + b.sub > (+agP.armadaCredits || 0)) throw new Error('Crediti Armada di questo mese finiti'); DA.ag.used += b.sub; } DA.credits = Math.max(0, DA.credits - b.sub); const x = b.type === 'mag' ? DA.mags.find((y) => y.mac === b.mac) : DA.lines.find((y) => y.username === b.username); const base = Math.max(Date.now(), (x && x.exp) || 0); if (x) x.exp = base + b.sub * 30 * 864e5; return { ok: true, exp: x ? x.exp : 0 }; }
      if (p === '/admin/armada/toggle') { const x = [...DA.lines, ...DA.mags].find((y) => y.id === b.id); if (x) x.enabled = !!b.enabled; return { ok: true }; }
      return dm(m, p, b);
    };
  }
})();
