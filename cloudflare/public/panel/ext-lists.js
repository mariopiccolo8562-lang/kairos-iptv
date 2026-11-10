/* KAIROS Control — Attivazione app: attiva una linea sulle app disponibili senza creare un cliente Kairos. */
(() => {
  const css = document.createElement('style');
  css.textContent = `.xl-apps{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}
.xl-apps button{display:flex;align-items:center;gap:10px;padding:10px 16px;border-radius:14px;border:1px solid var(--line);background:rgba(255,255,255,.03);color:#eef1f8;font:inherit;font-weight:700;cursor:pointer}
.xl-apps button i{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;font-style:normal;font-size:11px;font-weight:800;background:rgba(79,140,255,.2);color:#8fb3ff}
.xl-apps button.mx i{background:rgba(251,113,133,.2);color:#fda4af}
.xl-apps button.on{border-color:#22c55e;background:rgba(34,197,94,.14);box-shadow:0 8px 22px -14px #22c55e}
.xl-apps button:disabled{opacity:.45;cursor:not-allowed}
.xl-apps button{--xlc:#2563eb;border-color:color-mix(in srgb,var(--xlc) 40%,var(--line));background:color-mix(in srgb,var(--xlc) 9%,transparent)}
.xl-apps button i{background:color-mix(in srgb,var(--xlc) 24%,transparent);color:var(--xlc)}
.xl-apps button.on{border-color:var(--xlc);background:color-mix(in srgb,var(--xlc) 20%,transparent);box-shadow:0 8px 22px -14px var(--xlc)}
.xl-g{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}.xl-g .inp{margin:0}
.xl-g label{display:block;font-size:12px;color:var(--mut);font-weight:600;letter-spacing:.04em;text-transform:uppercase;margin-bottom:5px}
.xl-result{display:grid;gap:8px;margin-top:14px}.xl-result .act-app-link{width:fit-content}
.act-app-link{color:#7dd3fc!important;text-decoration:none!important;border-color:#38bdf855!important;background:rgba(56,189,248,.12)!important}
.act-app-link:hover{background:rgba(56,189,248,.22)!important}
@media(max-width:600px){.xl-g{grid-template-columns:minmax(0,1fr)}.xl-apps button{flex:1 1 150px;min-width:0}}`;
  document.head.appendChild(css);
  const isAg = () => D.role === 'agent';
  const P = () => D.players || {};
  const appLabel = (app) => app === 'max' ? 'MaxPlayer' : app === 'nanomid' ? 'Nanomid' : 'OrbixPlay';
  const dynApps = () => KXActApps.dynamicApps(D.activationApps, isAg(), ((D.me || {}).perms) || {});
  let orcpCfg = null, orcpLoading = false, orcpLoaded = false, dnsSaved = [];
  const tiles = () => [
    { key: 'orbix', name: 'OrbixPlay', color: KXActApps.targetColor('orbix'), icon: KXActApps.targetIcon('orbix', 'OrbixPlay'), enabled: !!P().orbix },
    { key: 'max', name: 'MaxPlayer', color: KXActApps.targetColor('max'), icon: KXActApps.targetIcon('max', 'MaxPlayer'), enabled: !!P().max },
    { key: 'orcp', name: 'MirkoTeam', color: KXActApps.targetColor('orcp'), icon: KXActApps.targetIcon('orcp', 'MirkoTeam'), enabled: !!(orcpCfg && (orcpCfg.servers || []).length) },
    ...dynApps().map((x) => ({ ...x, color: KXActApps.targetColor(x.key), icon: KXActApps.targetIcon(x.key, x.name), enabled: true })),
  ].filter((x) => x.enabled);
  const canUse = () => tiles().length > 0;
  TITLES.xlist = 'Attivazione app';
  const side = $('#side'), dash = $('#v-dash');
  if (side && !$('.nav[data-v="xlist"]')) { const b = document.createElement('button'); b.className = 'nav'; b.dataset.v = 'xlist'; b.textContent = 'Attivazione app'; b.style.display = 'none'; b.onclick = () => view('xlist'); side.appendChild(b); }
  if (dash && !$('#v-xlist')) { const s = document.createElement('section'); s.className = 'view'; s.id = 'v-xlist'; dash.after(s); }

  const F = { app: 'orbix', name: '', id: '', u: '', p: '', dns: '', note: '', mac: '', deviceKey: '', serverId: '', orcpServer: '', result: null, msg: '' };
  let L = null, doms = null, domsT = 0, domsK = '', busy = false, dnsLoaded = false;
  async function ensureOrcp() {
    if (orcpLoaded || orcpLoading) return;
    orcpLoading = true;
    try { orcpCfg = await KXActApps.loadOrcpConfig(isAg()); } catch { orcpCfg = null; }
    orcpLoaded = true; orcpLoading = false;
    if (typeof renderAll === 'function') renderAll();
    draw();
  }
  async function loadDns() { if (isAg() || dnsLoaded) return; dnsLoaded = true; try { dnsSaved = (await api('GET', '/admin/dns')).saved || []; } catch { dnsSaved = []; } draw(); }
  // DNS di MaxPlayer: si rileggono se sono passati più di 60 s o se il titolare ha cambiato quelli concessi all'agente
  const domsKey = () => JSON.stringify([D.role, ((D.me || {}).perms || {}).mxDns || null]);
  async function loadDoms() { if (!P().max || (doms && !doms.err && Date.now() - domsT < 60e3 && domsK === domsKey())) return; const k = domsKey(); if (!doms || domsK !== k) doms = null; try { const l = (await api('GET', '/admin/maxplayer/domains')).domains || []; doms = l; } catch (e) { doms = []; doms.err = e.message; } domsT = Date.now(); domsK = k; draw(); }
  async function loadL() { try { L = await api('GET', '/admin/ext-lists'); } catch (e) { L = { lists: [], err: e.message }; } draw(); }
  const read = () => {
    const v = (id) => ($('#' + id) || {}).value || '';
    const serverId = v('xlServer'), selected = !isAg() && dnsSaved.find((x) => String(x.id) === String(serverId));
    Object.assign(F, { name: v('xlN').trim(), id: v('xlI').trim(), u: v('xlU').trim(), p: v('xlP'), dns: isAg() && !['orbix', 'max'].includes(F.app) ? '' : (v('xlManualDns').trim() || selected && selected.host || v('xlD')), note: v('xlNo').trim(), mac: v('xlMac').trim(), deviceKey: v('xlKey').trim(), serverId, orcpServer: v('xlOrcpSrv') });
  };
  function draw() {
    const V = $('#v-xlist'); if (!V || !V.classList.contains('on')) return;
    const available = tiles();
    if (!available.some((x) => x.key === F.app)) F.app = (available[0] || {}).key || '';
    const selected = available.find((x) => x.key === F.app) || {};
    const isDynamic = selected.key && !['orbix', 'max', 'orcp'].includes(selected.key);
    const ok = { orbix: !!P().orbix, max: !!P().max };
    const orbDns = ((P().dns || {}).orbix) || [];
    const dnsHtml = F.app === 'orbix'
      ? (orbDns.length ? `<select class="inp" id="xlD">${orbDns.map((x, i) => `<option value="${i}" ${String(i) === String(F.dns || 0) ? 'selected' : ''}>${esc(x.name)}${x.host ? ' — ' + esc(x.host.replace(/^https?:\/\//, '')) : ''}</option>`).join('')}</select>` : '<small class="mut">Nessun DNS di OrbixPlay impostato</small>')
      : (!doms ? '<small class="mut">Carico i DNS di MaxPlayer…</small>' : doms.length ? `<select class="inp" id="xlD">${doms.map((x) => `<option value="${esc(x.id)}" ${x.id === F.dns ? 'selected' : ''}>${esc(x.label || x.domain || 'DNS ' + x.id)}</option>`).join('')}</select>` : `<small class="mut">${esc(doms.err || 'Nessun DNS su MaxPlayer')}</small>`);
    const all = (L && L.lists) || [];
    const fmt = (t) => (t ? new Date(t).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
    const dynamicServer = isAg()
      ? `<label>Server della linea<select class="inp" id="xlServer"><option value="">Non lo so / altro server</option>${(D.servers || []).map((x) => `<option value="${esc(x.id)}"${String(F.serverId) === String(x.id) ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>`
      : `<label>Server della linea<select class="inp" id="xlServer"><option value="">Inserisci un DNS manualmente</option>${dnsSaved.map((x) => `<option value="${esc(x.id)}"${String(F.serverId) === String(x.id) ? ' selected' : ''}>${esc(x.name || x.host)} · ${esc(x.host)}</option>`).join('')}</select></label><label>DNS manuale<input class="inp" id="xlManualDns" value="${esc(F.dns)}" placeholder="http://server:porta"></label>`;
    const tilesHtml = available.map((x) => `<button type="button" data-xla="${esc(x.key)}" class="${F.app === x.key ? 'on' : ''}" style="--xlc:${x.color}"><i>${esc(x.icon)}</i>${esc(x.name)}</button>`).join('');
    const targetFields = F.app === 'orcp'
      ? `<div class="xl-g" style="margin-top:12px"><label>Server<select class="inp" id="xlOrcpSrv"><option value="">Scegli il server…</option>${((orcpCfg && orcpCfg.servers) || []).map((x) => `<option value="${esc(x.n)}"${String(F.orcpServer) === String(x.n) ? ' selected' : ''}>Server ${esc(x.n)} · ${esc(x.name)}</option>`).join('')}</select></label><label>Utente<input class="inp" id="xlU" value="${esc(F.u)}" autocomplete="off"></label><label>Password<input class="inp" id="xlP" value="${esc(F.p)}" autocomplete="off"></label></div>`
      : isDynamic
        ? `<label class="lbl">Incolla la linea (facoltativo)</label><input class="inp" id="xlPaste" placeholder="Incolla il link M3U o il messaggio con server, utente e password" autocomplete="off"><div class="xl-g" style="margin-top:10px"><label>Nome (cliente)<input class="inp" id="xlN" maxlength="60" value="${esc(F.name)}" placeholder="es. Mario Rossi"></label><label>MAC / ID del dispositivo<input class="inp mono" id="xlMac" data-mac value="${esc(F.mac)}" maxlength="64" autocomplete="off"></label><label>Device key (facoltativa)<input class="inp" id="xlKey" value="${esc(F.deviceKey)}" maxlength="120" autocomplete="off"></label><label>Utente<input class="inp" id="xlU" maxlength="120" value="${esc(F.u)}" autocomplete="off"></label><label>Password<input class="inp" id="xlP" maxlength="200" value="${esc(F.p)}" autocomplete="off"></label>${dynamicServer}<label>Note (facoltative)<input class="inp" id="xlNo" maxlength="200" value="${esc(F.note)}"></label></div>`
        : `<label class="lbl">Incolla la linea (facoltativo)</label><input class="inp" id="xlPaste" placeholder="Incolla il link M3U o il messaggio con server, utente e password" autocomplete="off"><div class="xl-g" style="margin-top:10px"><label>Nome (cliente)<input class="inp" id="xlN" maxlength="60" value="${esc(F.name)}" placeholder="es. Mario Rossi"></label>${F.app === 'orbix' ? `<label>ID dispositivo OrbixPlay<input class="inp mono" id="xlI" data-mac maxlength="64" value="${esc(F.id)}" placeholder="es. 00:1A:79:AA:BB:CC"></label>` : ''}<label>Utente<input class="inp" id="xlU" maxlength="120" value="${esc(F.u)}" autocomplete="off"></label><label>Password<input class="inp" id="xlP" maxlength="200" value="${esc(F.p)}" autocomplete="off"></label><label>${F.app === 'orbix' ? 'DNS OrbixPlay' : 'DNS MaxPlayer'}${dnsHtml}</label><label>Note (facoltative)<input class="inp" id="xlNo" maxlength="200" value="${esc(F.note)}"></label></div>`;
    const resultHtml = F.result ? `<div class="xl-result wz-result ok"><b>${esc(F.result.message || '')}</b>${F.result.activationUrl ? `<a class="btn sm act-app-link" href="${esc(F.result.activationUrl)}" target="_blank" rel="noopener">Apri il sito di attivazione ↗</a>` : ''}${F.result.copyText ? '<button type="button" class="btn sm" data-xl-copy>📋 Copia tutto</button>' : ''}${F.result.copyItems && F.result.copyItems.length ? `<div class="wz-copy-items">${F.result.copyItems.map((x, i) => `<button type="button" class="btn sm" data-xl-copyitem="${i}">Copia ${esc(x.label)}</button>`).join('')}</div>` : ''}</div>` : '';
    const nanomidClearHtml = isAg() ? '' : `<div class="card glass" style="margin:16px 0 0;padding:14px"><div class="hd"><h3>Nanomid: svuota tutte le liste di una TV<small>Elimina tutte le liste del dispositivo, non solo quelle create da KAIROS.</small></h3></div><div style="display:flex;gap:8px;align-items:end;flex-wrap:wrap"><label style="flex:1;min-width:220px">Codice Nanomid sulla TV<input class="inp mono" id="xlNmClearCode" maxlength="16" autocomplete="off" placeholder="Codice mostrato nell'app Nanomid"></label><button type="button" class="btn" id="xlNmClear" ${busy ? 'disabled' : ''}>Svuota</button></div></div>`;
    V.innerHTML = `<div class="card glass"><div class="hd"><h3>Attivazione app<small>Scegli l'app, scrivi i dati della linea e attivala in un attimo</small></h3></div>
      ${available.length ? `<div class="xl-apps">${tilesHtml}</div>${targetFields}<div style="display:flex;gap:10px;align-items:center;margin-top:14px"><button class="btn pri" id="xlGo" ${busy ? 'disabled' : ''}>${busy ? 'Invio…' : '⚡ Attiva app'}</button><span class="mut" id="xlMsg" style="font-size:13px">${esc(F.msg)}</span></div>${resultHtml}` : '<div class="emptyc">Nessuna app disponibile. Chiedi al titolare di abilitarne una.</div>'}
      </div>
      <div class="card glass" style="margin-top:16px"><div class="hd"><h3>Liste create<small>${isAg() ? 'Le tue e quelle dei tuoi sotto-agenti' : 'Tutte, anche quelle create dagli agenti'}. «Rimuovi» la toglie anche dall'app.</small></h3></div>
      ${!L ? '<p class="mut">Carico…</p>' : L.err ? `<p class="mut">${esc(L.err)}</p>` : all.length ? `<div class="tbl-wrap"><table class="tbl" style="width:100%"><thead><tr><th>Nome</th><th>App</th><th>ID / utente</th><th>DNS</th><th>Creata</th><th>Da</th><th></th></tr></thead><tbody>${all.map((x) => `<tr><td><b>${esc(x.name || '—')}</b>${x.note ? `<br><small class="mut">${esc(x.note)}</small>` : ''}</td><td>${appLabel(x.app)}</td><td class="mono" style="font-size:12.5px">${esc(x.app === 'max' ? x.ref : x.ref + ' · ' + x.username)}</td><td>${esc(x.dns)}</td><td>${esc(fmt(x.created))}</td><td>${esc(x.by)}</td><td><button class="btn sm" data-xlrm="${esc(x.id)}">Rimuovi</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="emptyc">Nessuna lista creata da qui</div>'}${nanomidClearHtml}<button type="button" class="btn sm" data-xlappsview style="margin-top:10px">Vedi tutte le attivazioni in Appunti App</button></div>`;
    if ($('#xlNmClear')) $('#xlNmClear').onclick = async () => {
      const input = $('#xlNmClearCode'), quickCode = (input && input.value || '').trim();
      if (!/^[A-Za-z0-9]{4,16}$/.test(quickCode)) return toast('Scrivi il codice che compare nell\'app Nanomid sulla TV del cliente', 1);
      if (!(await ask('Svuotare tutte le liste Nanomid di questa TV?', `<p>Il codice <b>${esc(quickCode)}</b> identifica la TV. Nanomid eliminerà <b>tutte le liste</b> di quel dispositivo, non solo quelle create da KAIROS.</p>`, 'Svuota tutte'))) return;
      const button = $('#xlNmClear'); if (button) button.disabled = true;
      try { await api('POST', '/admin/ext-lists/nanomid-clear', { quickCode }); toast('Tutte le liste Nanomid della TV sono state svuotate'); if (input) input.value = ''; }
      catch (e) { toast(e.message, 1); }
      finally { if (button) button.disabled = false; }
    };
    $$('[data-xla]', V).forEach((b) => (b.onclick = () => { read(); F.app = b.dataset.xla; F.dns = ''; F.result = null; F.msg = ''; draw(); if (F.app === 'max') loadDoms(); }));
    const pi = $('#xlPaste');
    if (pi) {
      const go = async () => {
        const r = window.KXPaste && window.KXPaste.parse(pi.value);
        if (!r || !r.username) { F.msg = pi.value.trim() ? 'Non riconosco la linea: scrivi utente e password a mano' : ''; return; }
        F.u = r.username; F.p = r.password || ''; F.msg = '';
        if (isAg()) {
          pi.value = '';
          try { const match = r.host ? await api('POST', '/admin/match-server', { host: r.host }) : null; F.serverId = match && match.server ? match.server.id : ''; F.msg = F.serverId ? `✓ Server riconosciuto: ${(D.servers || []).find((x) => x.id === F.serverId)?.name || 'assegnato'}` : 'Linea riconosciuta: se il server non è assegnato, la richiesta sarà inviata al fornitore.'; }
          catch { F.serverId = ''; F.msg = 'Linea riconosciuta: scegli un server assegnato o invia una richiesta al fornitore.'; }
        } else F.dns = r.host || '';
        draw();
      };
      pi.addEventListener('paste', () => setTimeout(go, 0)); pi.addEventListener('change', go);
    }
    $$('[data-xlappsview]', V).forEach((b) => (b.onclick = () => view('lines')));
    $$('[data-xl-copy]', V).forEach((b) => (b.onclick = () => navigator.clipboard.writeText(F.result.copyText || '').then(() => toast('Messaggio copiato'), () => toast('Copia non consentita dal browser', 1))));
    $$('[data-xl-copyitem]', V).forEach((b) => (b.onclick = () => { const item = F.result.copyItems[+b.dataset.xlCopyitem]; if (item) navigator.clipboard.writeText(item.value).then(() => toast(item.label + ' copiato'), () => toast('Copia non consentita dal browser', 1)); }));
    if ($('#xlServer')) $('#xlServer').onchange = () => { read(); if (isAg()) F.msg = ''; };
    if ($('#xlGo')) $('#xlGo').onclick = async () => {
      read();
      if (!F.u || !F.p) return toast('Scrivi utente e password della linea', 1);
      busy = true; draw();
      try {
        if (F.app === 'orcp') {
          F.result = await KXActApps.submitOrcp({ cfg: orcpCfg, serverNumber: F.orcpServer, username: F.u, password: F.p, registerLinked: !isAg() || !!((D.me || {}).perms || {}).lines });
        } else if (isDynamic) {
          if (!F.mac) throw new Error('Scrivi il MAC / ID del dispositivo');
          if (!isAg() && !F.dns) throw new Error('Scegli un server o scrivi il DNS della linea');
          F.result = await KXActApps.submitApp({ app: selected, agent: isAg(), username: F.u, password: F.p, mac: F.mac, deviceKey: F.deviceKey, serverId: F.serverId, dns: F.dns });
        } else {
          if (F.app === 'orbix' && !F.id) throw new Error('Scrivi l\'ID del dispositivo OrbixPlay');
          const body = F.app === 'max' ? { app: 'max', name: F.name, username: F.u, password: F.p, domain: F.dns, note: F.note } : { app: 'orbix', name: F.name, orbixId: F.id, username: F.u, password: F.p, dns: +F.dns || 0, note: F.note };
          const r = await api('POST', '/admin/ext-lists', body); toast(`${F.app === 'max' ? 'MaxPlayer' : 'OrbixPlay'}: lista creata ✓ (${r.dns})`); Object.assign(F, { name: '', id: '', u: '', p: '', note: '' }); await loadL();
        }
      }
      catch (e) { toast(e.message, 1); } finally { busy = false; draw(); }
    };
    $$('[data-xlrm]', V).forEach((b) => (b.onclick = async () => {
      const x = all.find((y) => y.id === b.dataset.xlrm) || {}, NAME = appLabel(x.app);
      const effect = x.app === 'max' ? 'l\'account MaxPlayer viene cancellato' : x.app === 'nanomid' ? 'Nanomid elimina tutte le liste della TV associata a questo codice' : 'la lista sparisce dall\'app OrbixPlay';
      if (!(await askDanger(`Rimuovere la lista da ${NAME}?`, `${esc(x.name || x.ref || '')}: ${effect}.`, 'ELIMINA', 'Rimuovi'))) return;
      try { await api('DELETE', '/admin/ext-lists/' + x.id); toast(x.app === 'nanomid' ? 'Liste Nanomid della TV rimosse' : 'Lista rimossa da ' + NAME); loadL(); } catch (e) { toast(e.message, 1); }
    }));
  }
  const ra = renderAll;
  window.renderAll = renderAll = function () { ra(); ensureOrcp(); const n = $('.nav[data-v="xlist"]'); if (n) { const d = canUse() ? '' : 'none'; if (n.style.display !== d) n.style.display = d; } };
  const v0 = view;
  window.view = view = function (v) { const r = v0.apply(this, arguments); if (v === 'xlist') { draw(); loadL(); loadDns(); ensureOrcp(); if (F.app === 'max') loadDoms(); } return r; };
  if (typeof DEMO !== 'undefined') {
    const XL = [{ id: 'xl1demo', app: 'orbix', name: 'Bar Roma', ref: '00:1A:79:12:34:56', username: 'barroma', dns: 'Principale', note: 'TV del locale', created: Date.now() - 3 * 864e5, by: 'Tu', mine: true }];
    const dm = demoApi;
    window.demoApi = demoApi = async function (m, p, b) {
      if (p === '/admin/ext-lists' && m === 'GET') return { lists: XL.slice() };
      if (p === '/admin/ext-lists' && m === 'POST') { if (!b.username || !b.password) throw new Error('Scrivi utente e password della linea'); XL.unshift({ id: 'xl' + Date.now().toString(36), app: b.app, name: b.name || '', ref: b.app === 'max' ? b.username : b.orbixId, username: b.username, dns: b.app === 'max' ? 'NKI' : 'Principale', note: b.note || '', created: Date.now(), by: D.role === 'agent' ? 'mario.rossi' : 'Tu', mine: true }); return { ok: true, dns: b.app === 'max' ? 'NKI' : 'Principale' }; }
      const dm2 = p.match(/^\/admin\/ext-lists\/(.+)$/); if (dm2 && m === 'DELETE') { const i = XL.findIndex((x) => x.id === dm2[1]); if (i >= 0) XL.splice(i, 1); return { ok: true }; }
      return dm(m, p, b);
    };
  }
})();
