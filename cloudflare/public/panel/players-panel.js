/* KAIROS Control 2.8 — Altre app: invio delle linee del cliente a OrbixPlay (API ufficiale) direttamente dal pannello.
   MaxPlayer arriva appena c'è la documentazione della sua API. Usa le funzioni di app.js ($, $$, esc, api, toast, ask, D, load…). */
(() => {
  const css = document.createElement('style');
  css.textContent = `
.op-row{padding:12px 14px;border-radius:10px;border:1px solid var(--line);background:#1a1d22}.op-h{display:flex;align-items:center;gap:12px}
.op-f{display:grid;grid-template-columns:1.1fr 1fr 1fr auto auto;gap:8px;margin-top:12px;align-items:center}.op-f .inp{width:auto!important;min-width:0}
.op-d{display:flex;align-items:center;gap:10px;margin-top:8px;flex-wrap:wrap}
.op-f.mx{grid-template-columns:1fr 1fr auto auto}
@media (max-width:900px){.op-f{grid-template-columns:1fr 1fr}}
.op-row+.op-row{margin-top:8px}
.op-ic{width:38px;height:38px;border-radius:9px;display:grid;place-items:center;font-weight:800;font-size:13px;flex:0 0 auto;background:rgba(124,92,255,.18);color:#b9a6ff}
.op-ic.mx{background:rgba(229,83,75,.16);color:#ff9d97}
.op-tx{flex:1;min-width:180px}.op-tx b{display:block;font-size:14px}.op-tx small{display:block;color:var(--mut);font-size:12.5px;margin-top:2px}
.op-row .inp{margin:0}
.op-ok{color:var(--ok)}`;
  document.head.appendChild(css);

  const P = () => D.players || {};
  const ago2 = (t) => (typeof ago === 'function' ? ago(t) : new Date(t).toLocaleString('it-IT'));
  const owner = () => D.role !== 'agent';
  /** utente e password della prima linea del cliente (Xtream, o M3U con username/password) */
  function lineOf(d) {
    const src = d.parent ? D.devices.find((x) => x.id === d.parent) || d : d;
    for (const p of src.playlists || []) {
      if (p.username && p.password && (p.type === 'xtream' || p.serverId !== undefined)) return { u: p.username, p: p.password };
      try { const u = new URL(p.url || ''); if (u.searchParams.get('username')) return { u: u.searchParams.get('username'), p: u.searchParams.get('password') || '' }; } catch {}
    }
    return { u: '', p: '' };
  }
  const dnsSel = (app, cur) => {
    const l = ((P().dns || {})[app]) || [];
    if (!l.length) return `<small class="mut">${owner() ? 'Nessun DNS personale: impostalo in Impostazioni → App e aggiornamenti' : 'Il DNS non è ancora impostato: chiedilo a chi ti gestisce'}</small>`;
    return `<label class="mut" style="font-size:12.5px">DNS</label><select class="inp" data-opdns style="width:auto;min-width:200px;margin:0">${l.map((x, i) => `<option value="${i}" ${i === (cur || 0) ? 'selected' : ''}>${esc(x.name)}${x.host ? ' — ' + esc(x.host.replace(/^https?:\/\//, '')) : ''}${x.code ? ' (codice ' + x.code + ')' : ''}</option>`).join('')}</select>`;
  };
  /* domini (DNS) di MaxPlayer: letti dalla sua API, l'agente vede solo i nomi */
  let mxDoms = null, mxBusy = false;
  async function loadMx(fresh) {
    if (!P().max || mxBusy) return; mxBusy = true;
    try { mxDoms = (await api('GET', '/admin/maxplayer/domains' + (fresh ? '?fresh=1' : ''))).domains || []; } catch (e) { mxDoms = []; mxDoms.err = e.message; }
    mxBusy = false;
    $$('[data-mxsel]').forEach((el) => { el.outerHTML = mxSel(el.dataset.mxsel); });
    renderMxSettings();
  }
  const mxLbl = (x) => (x.label || 'DNS ' + x.id) + (owner() && x.domain ? ' — ' + x.domain + (x.port ? ':' + x.port : '') : '');
  const mxSel = (cur) => {
    if (!mxDoms) return `<small class="mut" data-mxsel="${esc(cur || '')}">Carico i DNS di MaxPlayer…</small>`;
    if (!mxDoms.length) return `<small class="mut" data-mxsel="${esc(cur || '')}">${mxDoms.err ? esc(mxDoms.err) : owner() ? 'Nessun DNS su MaxPlayer: aggiungilo in Impostazioni → App e aggiornamenti' : 'Il DNS non è ancora impostato: chiedilo a chi ti gestisce'}</small>`;
    return `<label class="mut" style="font-size:12.5px">DNS</label><select class="inp" data-opdns style="width:auto;min-width:200px;margin:0">${mxDoms.map((x) => `<option value="${esc(x.id)}" ${x.id === cur ? 'selected' : ''}>${esc(mxLbl(x))}</option>`).join('')}</select>`;
  };
  /** riquadro «Altre app» di un cliente (lo usano la scheda del titolare e quella degli agenti) */
  function box(d) {
    const o = d.orbix, x = d.maxp, ln = lineOf(d);
    const up = (u) => `<input class="inp" data-opu placeholder="Utente" maxlength="120" value="${esc(u || ln.u)}" autocomplete="off"><input class="inp" data-opp type="password" placeholder="Password" maxlength="200" value="${esc(ln.p)}" autocomplete="new-password">`;
    const btns = (on) => `<button class="btn sm pri" data-opsend>${on ? 'Riattiva' : 'Attiva'}</button>${on ? '<button class="btn sm danger" data-opdel>Togli</button>' : '<span></span>'}`;
    const orb = `<div class="op-row" data-op="${esc(d.id)}" data-app="orbix"><div class="op-h"><div class="op-ic">OP</div>
      <div class="op-tx"><b>OrbixPlay</b><small>${!P().orbix ? 'Non collegato: aggiungi la chiave ORBIX_KEY (Impostazioni → App e aggiornamenti)' : o ? `<span class="op-ok">✓ Attivo</span> sul dispositivo <span class="mono">${esc(o.id)}</span> · ${esc(ago2(o.t))}` : 'Scrivi l\'ID che il cliente vede nell\'app OrbixPlay, utente e password: il DNS lo mette il pannello'}</small></div></div>
      ${P().orbix ? `<div class="op-f"><input class="inp mono" data-opid placeholder="ID dispositivo" maxlength="64" value="${esc(o ? o.id : '')}">${up(o && o.u)}${btns(!!o)}</div><div class="op-d">${dnsSel('orbix', o ? o.dns : 0)}</div>` : ''}</div>`;
    const mx = `<div class="op-row" data-op="${esc(d.id)}" data-app="max"><div class="op-h"><div class="op-ic mx">MX</div>
      <div class="op-tx"><b>MaxPlayer</b><small>${!P().max ? 'Non collegato: aggiungi la chiave MAXPLAYER_KEY (Impostazioni → App e aggiornamenti)' : x ? `<span class="op-ok">✓ Attivo</span>: il cliente entra in MaxPlayer con utente <span class="mono" style="color:var(--tx,#fff);font-weight:600">${esc(x.u)}</span> e la password della linea · ${esc(ago2(x.t))}` : 'Utente e password della linea: il pannello crea l\'account MaxPlayer del cliente (entra con gli stessi dati)'}</small></div></div>
      ${P().max ? `<div class="op-f mx">${up(x && x.u)}${btns(!!x)}</div><div class="op-d">${mxSel(x ? x.dom : '')}</div>` : ''}</div>`;
    if (P().max && !mxDoms && !mxBusy) setTimeout(() => loadMx(), 0);
    return orb + mx;
  }
  function bind(root, d, after) {
    for (const row of root.querySelectorAll(`[data-op="${CSS.escape(d.id)}"]`)) {
      const app = row.dataset.app, send = row.querySelector('[data-opsend]'), del = row.querySelector('[data-opdel]'), NAME = app === 'max' ? 'MaxPlayer' : 'OrbixPlay';
      if (send) send.onclick = async () => {
        const v = (sel) => (row.querySelector(sel) || {}).value || '';
        const b = app === 'max' ? { username: v('[data-opu]').trim(), password: v('[data-opp]'), domain: v('[data-opdns]') } : { orbixId: v('[data-opid]').trim(), username: v('[data-opu]').trim(), password: v('[data-opp]'), dns: +v('[data-opdns]') || 0 };
        if ((app === 'orbix' && !b.orbixId) || !b.username || !b.password) { toast(app === 'orbix' ? 'Scrivi ID dispositivo, utente e password' : 'Scrivi utente e password della linea', 1); return; }
        send.disabled = true; send.textContent = 'Attivo…';
        try {
          const r = await api('POST', (app === 'max' ? '/admin/maxplayer/' : '/admin/orbix/') + d.id, b);
          if (app === 'max') d.maxp = { uid: r.uid, u: r.u, dom: r.dom, t: r.t }; else d.orbix = { id: r.id, n: r.n, t: r.t, u: r.u, dns: r.dns };
          toast(NAME + (r.created === false ? ' aggiornato' : ' attivato')); await load(); if (after) after();
        } catch (e) { toast(e.message, 1); send.disabled = false; send.textContent = (app === 'max' ? d.maxp : d.orbix) ? 'Riattiva' : 'Attiva'; }
      };
      if (del) del.onclick = async () => {
        if (!(await ask(`Togliere il cliente da ${NAME}?`, app === 'max' ? 'L\'account MaxPlayer del cliente viene cancellato. L\'abbonamento Kairos non cambia.' : 'La linea sparisce dall\'app OrbixPlay del cliente. L\'abbonamento Kairos non cambia.', 'Togli'))) return;
        try { await api('DELETE', (app === 'max' ? '/admin/maxplayer/' : '/admin/orbix/') + d.id); if (app === 'max') d.maxp = null; else d.orbix = null; await load(); toast('Tolto da ' + NAME); if (after) after(); } catch (e) { toast(e.message, 1); }
      };
    }
  }
  window.KXPlayers = { box, bind };

  /* ---------- scheda cliente (titolare): sezione «Altre app» prima delle note ---------- */
  const rdw = renderDrawer;
  window.renderDrawer = renderDrawer = function () {
    rdw();
    if (!edit || isNew || edit.parent || D.role === 'agent') return;
    const secs = $('#dBody .dsecs'); if (!secs || $('#ds-oth')) return;
    const html = `<section class="dsec" id="ds-oth"><div class="dsh"><i></i><div><b>Altre app</b><small>Manda le linee di questo cliente anche alle altre app</small></div></div>${box(edit)}</section>`;
    const note = $('#ds-note');
    note ? note.insertAdjacentHTML('beforebegin', html) : secs.insertAdjacentHTML('beforeend', html);
    const nb = $('#dBody .dnav [data-ds="note"]'), btn = document.createElement('button'); btn.dataset.ds = 'oth'; btn.innerHTML = '<i></i>Altre app';
    nb ? nb.before(btn) : $('#dBody .dnav').appendChild(btn);
    btn.onclick = () => $('#ds-oth').scrollIntoView({ behavior: 'smooth', block: 'start' });
    let k = 0; $$('#dBody .dnav [data-ds]').forEach((b) => { const i = $('i', b); if (i && b.style.display !== 'none') i.textContent = ++k; });
    k = 0; $$('#dBody .dsec').forEach((s) => { const i = $('.dsh i', s); if (i && s.style.display !== 'none') i.textContent = ++k; });
    const refresh = () => { const d = D.devices.find((x) => x.id === edit.id); if (d) edit.orbix = d.orbix; const sx = $('#ds-oth'); if (!sx) return; sx.querySelectorAll('.op-row').forEach((r) => r.remove()); sx.insertAdjacentHTML('beforeend', box(edit)); bind(sx, edit, refresh); };
    bind($('#ds-oth'), edit, refresh);
  };

  /* ---------- Impostazioni → App e aggiornamenti: OrbixPlay e MaxPlayer (DNS personali + guida) ---------- */
  const pane = $('[data-pane="upd"]');
  let cfg = null, dirty = false;
  const cfgNow = () => { const c = (D.settings && D.settings.playersCfg) || {}; return { orbix: (c.orbix || []).map((x) => ({ ...x })), max: (c.max || []).map((x) => ({ ...x })), showDnsAgents: !!c.showDnsAgents }; };
  if (pane && !$('#opCard')) {
    pane.insertAdjacentHTML('beforeend', `<div class="card glass" id="opCard" style="margin-top:18px"><div class="hd"><h3>OrbixPlay e MaxPlayer<small>Attivi le app dalla scheda del cliente (sezione «Altre app») con ID dispositivo, utente e password: il DNS lo mette il pannello</small></h3></div>
      <div id="opState" class="st-note"></div>
      <div class="st-row" style="align-items:flex-start"><div class="st-l"><b>DNS personale di OrbixPlay</b><small>Il primo è quello proposto di base. Il «codice host» (facoltativo) è il numero che OrbixPlay ti dà per il tuo DNS: se c'è, l'indirizzo non viene inviato.</small></div><div class="st-c" id="opDnsO"></div></div>
      <div class="st-row" style="align-items:flex-start"><div class="st-l"><b>DNS di MaxPlayer</b><small>Sono i «Domini» del tuo pannello MaxPlayer: al cliente arriva solo il dominio scelto, mai l'indirizzo. Puoi aggiungerne uno da qui.</small></div><div class="st-c"><div id="opMx"></div>
        <div style="display:grid;grid-template-columns:1fr 2fr auto;gap:8px;margin-top:10px"><input class="inp" id="opMxL" maxlength="60" placeholder="Nome (es. Principale)" style="margin:0"><input class="inp mono" id="opMxU" maxlength="300" placeholder="http://dns.esempio.com:8080" style="margin:0"><button class="btn sm" id="opMxAdd">Aggiungi a MaxPlayer</button></div></div></div>
      <div class="tog" id="opShow" style="margin-top:12px"><div><b>Gli agenti vedono l'indirizzo dei DNS</b><small>Spento: vedono solo il nome che dai al DNS. I clienti non lo vedono mai nel pannello.</small></div><i></i></div>
      <div style="display:flex;gap:10px;margin-top:12px"><button class="btn pri" id="opSave">Salva DNS</button></div>
      <details style="margin-top:14px"><summary style="cursor:pointer;font-weight:600">Come collegare OrbixPlay (chiave)</summary>
        <ol style="margin:10px 0 0 18px;line-height:1.7;font-size:13.5px">
          <li>Prendi la tua <b>customer key</b> dal tuo account OrbixPlay (o chiedila al loro supporto).</li>
          <li>Su GitHub apri il repository <b>kairos-iptv</b> → <b>Settings</b> → <b>Secrets and variables</b> → <b>Actions</b> → <b>New repository secret</b>.</li>
          <li>Nome: <code>ORBIX_KEY</code>, valore: la customer key. Salva.</li>
          <li>Vai su <b>Actions</b> → <b>Pannello Cloudflare</b> → <b>Run workflow</b> (oppure aspetta il prossimo aggiornamento): qui comparirà «collegato».</li>
        </ol>
        <p style="font-weight:600;margin-top:12px">MaxPlayer</p>
        <ol style="margin:6px 0 0 18px;line-height:1.7;font-size:13.5px">
          <li>Nel pannello MaxPlayer apri <b>API pubblica</b> → <b>Accesso</b> → <b>Crea chiave</b> (una chiave apposta per Kairos) e copiala: la vedi una volta sola.</li>
          <li>Su GitHub crea il segreto <code>MAXPLAYER_KEY</code> con quella chiave, poi <b>Run workflow</b> come sopra.</li>
        </ol>
        <p class="mut" style="font-size:12.5px;margin-top:8px">Non scrivere mai le chiavi in chat o nel pannello.</p></details></div>`);
    $('#opMxAdd').onclick = async () => {
      const u = $('#opMxU').value.trim(), l = $('#opMxL').value.trim(); if (!u) { toast('Scrivi il DNS', 1); return; }
      try { await api('POST', '/admin/maxplayer/domains', { url: u, label: l }); $('#opMxU').value = ''; $('#opMxL').value = ''; toast('DNS aggiunto su MaxPlayer'); await loadMx(true); } catch (e) { toast(e.message, 1); }
    };
    for (const ev of ['input', 'change']) $('#opCard').addEventListener(ev, (e) => { e.stopPropagation(); dirty = true; });
    $('#opShow').onclick = () => { $('#opShow').classList.toggle('on'); dirty = true; };
    $('#opSave').onclick = async () => {
      readCfg();
      try { await api('PUT', '/admin/settings', { playersCfg: cfg }); dirty = false; cfg = null; await load(); toast('DNS salvati'); } catch (e) { toast(e.message, 1); }
    };
  }
  function readCfg() {
    for (const [app, el] of [['orbix', '#opDnsO']]) cfg[app] = $$(el + ' .op-dr').map((r) => ({ name: $('[data-k="name"]', r).value.trim(), host: $('[data-k="host"]', r).value.trim(), ...($('[data-k="code"]', r) && $('[data-k="code"]', r).value.trim() ? { code: $('[data-k="code"]', r).value.trim() } : {}) }));
    cfg.showDnsAgents = $('#opShow').classList.contains('on');
  }
  function drawDns() {
    for (const [app, el] of [['orbix', '#opDnsO']]) {
      const box2 = $(el); if (!box2) continue;
      box2.innerHTML = cfg[app].map((x, i) => `<div class="op-dr" style="display:grid;grid-template-columns:1fr 2fr ${app === 'orbix' ? '110px ' : ''}auto;gap:8px;margin-bottom:8px"><input class="inp" data-k="name" maxlength="40" placeholder="Nome (es. Principale)" value="${esc(x.name || '')}" style="margin:0"><input class="inp mono" data-k="host" maxlength="300" placeholder="http://dns.esempio.com:8080" value="${esc(x.host || '')}" style="margin:0">${app === 'orbix' ? `<input class="inp mono" data-k="code" maxlength="9" placeholder="Codice host" value="${esc(x.code || '')}" style="margin:0">` : ''}<button class="icb" data-oprm="${app}:${i}" title="Togli">✕</button></div>`).join('') + `<button class="btn sm" data-opadd="${app}">+ Aggiungi DNS</button>`;
    }
    $$('[data-opadd]').forEach((b) => (b.onclick = () => { readCfg(); cfg[b.dataset.opadd].push({ name: '', host: '' }); dirty = true; drawDns(); }));
    $$('[data-oprm]').forEach((b) => (b.onclick = () => { readCfg(); const [a, i] = b.dataset.oprm.split(':'); cfg[a].splice(+i, 1); dirty = true; drawDns(); }));
  }
  function renderMxSettings() {
    const el = $('#opMx'); if (!el) return;
    el.innerHTML = !P().max ? '<small class="mut">Collega prima MaxPlayer (chiave MAXPLAYER_KEY, guida qui sotto)</small>' : !mxDoms ? '<small class="mut">Carico i DNS…</small>' : mxDoms.length ? mxDoms.map((x) => `<div class="dlc-l" style="margin-bottom:6px"><span>${esc(x.label || 'DNS ' + x.id)}</span><b class="mono" style="flex:1;font-weight:500">${esc(x.domain ? x.domain + (x.port ? ':' + x.port : '') : '(nascosto)')}</b><small class="mut">${esc(x.status || '')}</small></div>`).join('') + '<button class="btn sm" id="opMxR">Aggiorna</button>' : `<small class="mut">${esc(mxDoms.err || 'Nessun DNS su MaxPlayer: aggiungilo qui sotto')}</small>`;
    $('#opMxR') && ($('#opMxR').onclick = () => loadMx(true));
    $('#opMxAdd') && ($('#opMxAdd').disabled = !P().max);
  }
  function renderOp() {
    const el = $('#opState'); if (!el) return;
    const n = D.devices.filter((d) => d.orbix).length;
    el.innerHTML = `${P().orbix ? `✅ <b>OrbixPlay collegato</b> · clienti attivi su OrbixPlay: <b>${n}</b>` : '⚠️ <b>OrbixPlay non collegato</b>: manca il segreto ORBIX_KEY (guida qui sotto)'}<br>${P().max ? `✅ <b>MaxPlayer collegato</b> · clienti attivi su MaxPlayer: <b>${D.devices.filter((d) => d.maxp).length}</b>` : '⚠️ <b>MaxPlayer non collegato</b>: manca il segreto MAXPLAYER_KEY (guida qui sotto)'}`;
    if (P().max && !mxDoms && !mxBusy) loadMx(); else renderMxSettings();
    if (!dirty || !cfg) { cfg = cfgNow(); drawDns(); $('#opShow').classList.toggle('on', cfg.showDnsAgents); }
  }
  const ra = renderAll;
  window.renderAll = renderAll = function () { ra(); if (D.role !== 'agent') renderOp(); };
  const api0 = api;
  window.api = api = async function (m, p, b) { const r = await api0(m, p, b); if (p === '/admin/state' && m === 'GET' && r) D.players = r.players || null; return r; };
  if (typeof DEMO !== 'undefined') {
    const dm = demoApi;
    window.demoApi = demoApi = async function (m, p, b) {
      if (p.split('?')[0] === '/admin/maxplayer/domains' && m === 'GET') return { domains: D.role === 'agent' ? [{ id: '1', label: 'Principale' }] : [{ id: '1', domain: 'dns.kairos-esempio.tv', port: '8080', label: 'Principale', status: 'approved' }, ...(DEMO.mxNew || [])] };
      if (p === '/admin/maxplayer/domains' && m === 'POST') { (DEMO.mxNew = DEMO.mxNew || []).push({ id: String(10 + DEMO.mxNew.length), domain: b.url.replace(/^https?:\/\//, '').split(/[:/]/)[0], port: '80', label: b.label, status: 'pending' }); return { ok: true }; }
      const xm = p.match(/^\/admin\/maxplayer\/(.+)$/);
      if (xm) { const d = DEMO.devices.find((x) => x.id === xm[1]); if (!d) throw new Error('Cliente non trovato'); if (m === 'DELETE') { d.maxp = null; return { ok: true }; } if (!b.username || !b.password) throw new Error('Scrivi utente e password della linea'); const created = !d.maxp; d.maxp = { uid: d.maxp ? d.maxp.uid : String(500 + Math.floor(Math.random() * 99)), u: d.maxp ? d.maxp.u : b.username, dom: b.domain || '1', t: Date.now() }; return { ...d.maxp, created }; }
      const om = p.match(/^\/admin\/orbix\/(.+)$/);
      if (om) { const d = DEMO.devices.find((x) => x.id === om[1]); if (!d) throw new Error('Cliente non trovato'); if (m === 'DELETE') { d.orbix = null; return { ok: true }; } if (!/^[A-Za-z0-9:._-]{4,64}$/.test(b.orbixId || '')) throw new Error('Scrivi l\'ID del dispositivo che compare nell\'app OrbixPlay'); if (!b.username || !b.password) throw new Error('Scrivi utente e password della linea'); d.orbix = { id: b.orbixId, n: 1, t: Date.now(), u: b.username, dns: b.dns || 0 }; return { ...d.orbix }; }
      const r = await dm(m, p, b);
      if (p === '/admin/state' && r && !r.players) { const c = (DEMO.settings.playersCfg = DEMO.settings.playersCfg || { orbix: [{ name: 'Principale', host: 'http://dns.kairos-esempio.tv:8080' }], max: [], showDnsAgents: false }); r.players = { orbix: true, max: true, dns: { orbix: c.orbix, max: c.max }, showDnsAgents: c.showDnsAgents }; r.settings = { ...r.settings, playersCfg: c }; }
      return r;
    };
  }
})();
