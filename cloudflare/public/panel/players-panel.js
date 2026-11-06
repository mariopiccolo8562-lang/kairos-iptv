/* KAIROS Control 2.8 — Altre app: invio delle linee del cliente a OrbixPlay (API ufficiale) direttamente dal pannello.
   MaxPlayer arriva appena c'è la documentazione della sua API. Usa le funzioni di app.js ($, $$, esc, api, toast, ask, D, load…). */
(() => {
  const css = document.createElement('style');
  css.textContent = `
.op-row{padding:12px 14px;border-radius:10px;border:1px solid var(--line);background:#1a1d22}.op-h{display:flex;align-items:center;gap:12px}
.op-f{display:grid;grid-template-columns:1.1fr 1fr 1fr auto auto;gap:8px;margin-top:12px;align-items:center}.op-f .inp{width:auto!important;min-width:0}
.op-d{display:flex;align-items:center;gap:10px;margin-top:8px;flex-wrap:wrap}
.op-f.mx{grid-template-columns:1fr 1fr auto auto}
.op-h{flex-wrap:wrap}.op-h .op-tx{min-width:220px}
#drawer.full #ds-oth{grid-column:1/-1}
.op-slot{padding:12px 14px;border-radius:10px;border:1px solid var(--line);background:#1a1d22;margin-bottom:8px}
.op-slot .sl-h{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.op-slot .op-ic{width:30px;height:30px;font-size:11px}
.op-slot .sl-b{display:grid;grid-template-columns:1.6fr 1fr;gap:8px;margin-top:10px}
.op-slot .sl-b>div{display:flex;align-items:center;gap:8px;padding:7px 9px;border-radius:8px;background:rgba(255,255,255,.03);border:1px solid var(--line);min-width:0}
.op-slot .sl-b small{color:var(--mut);font-size:11.5px;flex:0 0 auto}.op-slot .sl-b b{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13.5px}
@media (max-width:700px){.op-slot .sl-b{grid-template-columns:1fr}}
.op-code{margin-left:auto;flex:0 0 auto;display:flex;align-items:center;gap:8px;padding:6px 6px 6px 12px;border-radius:9px;background:rgba(255,255,255,.04);border:1px solid var(--line)}
.op-code small{color:var(--mut);font-size:11.5px}.op-code b{font-size:16px;letter-spacing:.06em}
@media (max-width:900px){.op-f{grid-template-columns:1fr 1fr}}
.op-row+.op-row{margin-top:8px}
.op-ic{width:38px;height:38px;border-radius:9px;display:grid;place-items:center;font-weight:800;font-size:13px;flex:0 0 auto;background:rgba(124,92,255,.18);color:#b9a6ff}
.op-ic.mx{background:rgba(229,83,75,.16);color:#ff9d97}
.op-tx{flex:1;min-width:180px}.op-tx b{display:block;font-size:14px}.op-tx small{display:block;color:var(--mut);font-size:12.5px;margin-top:2px}
.op-row .inp{margin:0}
.op-ok{color:var(--ok)}
.op-auto{display:flex;align-items:center;gap:8px;margin-top:10px;font-size:13px;font-weight:600;cursor:pointer;color:#bbf7d0}.op-auto input{width:17px;height:17px;accent-color:#22c55e}.op-auto small{font-weight:400;color:var(--mut)}`;
  document.head.appendChild(css);

  const P = () => D.players || {};
  const ago2 = (t) => (typeof ago === 'function' ? ago(t) : new Date(t).toLocaleString('it-IT'));
  const owner = () => D.role !== 'agent';
  /** utente e password della prima linea del cliente (Xtream, o M3U con username/password) */
  function lineOf(d) {
    const src = d.parent && !d.own ? D.devices.find((x) => x.id === d.parent) || d : d; // TV collegata indipendente: le sue linee
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
  /* slot: fornitore + app + link (DNS) + codice cliente. Il codice mostrato segue il DNS scelto nell'attivazione */
  const SLOTS = () => P().slots || [];
  // posizione del DNS OrbixPlay usato dal cliente: si cerca per host (l'elenco può cambiare), altrimenti l'indice salvato
  const kh = (h) => String(h || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '').toLowerCase();
  const orbIdx = (o) => { if (!o) return 0; if (o.di !== undefined) return o.di >= 0 ? o.di : 0; /* agente: posizione nel suo elenco (calcolata dal server) */ const l = ((P().dns || {}).orbix) || []; if (o.h) { const i = l.findIndex((x) => x.host && kh(x.host) === o.h); if (i >= 0) return i; } return +o.dns || 0; };
  const hostOf2 = (h) => String(h || '').trim().replace(/^https?:\/\//i, '').split(/[:/]/)[0].toLowerCase();
  function slotFor(app, dnsName, dnsHost) {
    const l = SLOTS().filter((x) => x.app === app); if (!l.length) return null;
    const h = hostOf2(dnsHost), n = String(dnsName || '').toLowerCase();
    return (h && l.find((x) => hostOf2(x.link) === h)) || (n && l.find((x) => n.includes(x.name.toLowerCase()))) || l[0];
  }
  const codeOf = (app, sl) => (sl ? sl.code : '') || ((P().codes || {})[app]) || '';
  const codeBox = (app, sl) => { const c = codeOf(app, sl); return c ? `<div class="op-code" data-opcodebox="${app}"><small>Codice cliente${sl ? ' · ' + esc(sl.name) : ''}</small><b class="mono">${esc(c)}</b><button class="btn sm" data-opcode="${esc(c)}">Copia</button></div>` : ''; };
  /** dopo aver scelto un DNS nell'attivazione, il codice cliente si aggiorna */
  function syncCode(row) {
    const app = row.dataset.app, sel = $('[data-opdns]', row); if (!sel) return;
    let name = '', host = '';
    if (app === 'orbix') { const d = ((P().dns || {}).orbix || [])[+sel.value || 0] || {}; name = d.name; host = d.host; }
    else { const d = (mxDoms || []).find((x) => x.id === sel.value) || {}; name = d.label; host = d.domain; }
    const box = $('[data-opcodebox]', row), html = codeBox(app, slotFor(app, name, host));
    if (box) box.outerHTML = html || '<span></span>'; bindCodes(row);
  }
  const bindCodes = (root) => $$('[data-opcode]', root).forEach((b) => (b.onclick = (e) => { e.stopPropagation(); navigator.clipboard.writeText(b.dataset.opcode).then(() => toast('Codice cliente copiato: ' + b.dataset.opcode), () => toast('Codice cliente: ' + b.dataset.opcode)); }));
  /* domini (DNS) di MaxPlayer: letti dalla sua API, l'agente vede solo i nomi */
  let mxDoms = null, mxBusy = false;
  async function loadMx(fresh) {
    if (!P().max || mxBusy) return; mxBusy = true;
    try { mxDoms = (await api('GET', '/admin/maxplayer/domains' + (fresh ? '?fresh=1' : ''))).domains || []; } catch (e) { mxDoms = []; mxDoms.err = e.message; }
    mxBusy = false;
    $$('[data-mxsel]').forEach((el) => { el.outerHTML = mxSel(el.dataset.mxsel); });
    $$('.op-row[data-app="max"]').forEach(syncCode);
    renderMxSettings();
  }
  const mxLbl = (x) => (x.label || 'DNS ' + x.id) + (owner() && x.domain ? ' — ' + x.domain + (x.port ? ':' + x.port : '') : '');
  const mxSel = (cur) => {
    if (!mxDoms) return `<small class="mut" data-mxsel="${esc(cur || '')}">Carico i DNS di MaxPlayer…</small>`;
    if (!mxDoms.length) return `<small class="mut" data-mxsel="${esc(cur || '')}">${mxDoms.err ? esc(mxDoms.err) : owner() ? 'Nessun DNS su MaxPlayer: aggiungilo in Impostazioni → App e aggiornamenti' : 'Il DNS non è ancora impostato: chiedilo a chi ti gestisce'}</small>`;
    if (!cur) { const nki = mxDoms.find((x) => (x.domain || '').toLowerCase() === 'maxplayer.nki-max.stream' || /nki/i.test(x.label || '')); if (nki) cur = nki.id; } // di base il link diretto NKI
    return `<label class="mut" style="font-size:12.5px">DNS</label><select class="inp" data-opdns style="width:auto;min-width:200px;margin:0">${mxDoms.map((x) => `<option value="${esc(x.id)}" ${x.id === cur ? 'selected' : ''}>${esc(mxLbl(x))}</option>`).join('')}</select>`;
  };
  /** riquadro «Altre app» di un cliente (lo usano la scheda del titolare e quella degli agenti) */
  function box(d) {
    const o = d.orbix, x = d.maxp, ln = lineOf(d);
    const up = (u) => `<input class="inp" data-opu placeholder="Utente" maxlength="120" value="${esc(u || ln.u)}" autocomplete="off"><input class="inp" data-opp type="password" placeholder="Password" maxlength="200" value="${esc(ln.p)}" autocomplete="new-password">`;
    const fresh = !d.id; // cliente nuovo: si attiva dopo «Attiva cliente / Salva»
    const btns = (on) => fresh ? '<span></span><span></span>' : `<button class="btn sm pri" data-opsend>${on ? 'Riattiva' : 'Attiva'}</button>${on ? '<button class="btn sm danger" data-opdel>Togli</button>' : '<span></span>'}`;
    const auto = (app, on) => `<label class="op-auto"><input type="checkbox" data-opauto ${fresh || !on ? '' : ''}>${on ? 'Aggiorna' : 'Attiva'} su ${app} quando premi «${fresh ? (owner() ? 'Salva' : 'Attiva cliente') : 'Salva'}»<small>${fresh ? 'utente e password: se li lasci vuoti si usano quelli della linea' : 'manda utente e password scritti qui'}</small></label>`;
    const orb = `<div class="op-row" data-op="${esc(d.id || 'new')}" data-app="orbix"><div class="op-h"><div class="op-ic">OP</div>
      <div class="op-tx"><b>OrbixPlay</b><small>${!P().orbix ? 'Non collegato: aggiungi la chiave ORBIX_KEY (Impostazioni → App e aggiornamenti)' : o ? `<span class="op-ok">✓ Attivo</span> sul dispositivo <span class="mono">${esc(o.id)}</span> · ${esc(ago2(o.t))}` : 'Scrivi l\'ID che il cliente vede nell\'app OrbixPlay, utente e password: il DNS lo mette il pannello'}</small></div>${codeBox('orbix', slotFor('orbix', (((P().dns || {}).orbix || [])[orbIdx(o)] || {}).name, (((P().dns || {}).orbix || [])[orbIdx(o)] || {}).host))}</div>
      ${P().orbix ? `<div class="op-f"><input class="inp mono" data-opid data-mac placeholder="ID dispositivo, es. 00:1A:79:AA:BB:CC" maxlength="64" autocomplete="off" value="${esc(o ? o.id : '')}">${up(o && o.u)}${btns(!!o)}</div><div class="op-d">${dnsSel('orbix', orbIdx(o))}</div>${auto('OrbixPlay', !!o)}` : ''}</div>`;
    const mx = `<div class="op-row" data-op="${esc(d.id || 'new')}" data-app="max"><div class="op-h"><div class="op-ic mx">MX</div>
      <div class="op-tx"><b>MaxPlayer</b><small>${!P().max ? 'Non collegato: aggiungi la chiave MAXPLAYER_KEY (Impostazioni → App e aggiornamenti)' : x ? `<span class="op-ok">✓ Attivo</span>: il cliente entra in MaxPlayer con utente <span class="mono" style="color:var(--tx,#fff);font-weight:600">${esc(x.u)}</span> e la password della linea · ${esc(ago2(x.t))}` : 'Utente e password della linea: il pannello crea l\'account MaxPlayer del cliente (entra con gli stessi dati)'}</small></div>${codeBox('max', slotFor('max', '', ''))}</div>
      ${P().max ? `<div class="op-f mx">${up(x && x.u)}${btns(!!x)}</div><div class="op-d">${mxSel(x ? x.dom : '')}</div>${auto('MaxPlayer', !!x)}` : ''}</div>`;
    if (P().max && !mxDoms && !mxBusy) setTimeout(() => loadMx(), 0);
    return orb + mx;
  }
  function bind(root, d, after) {
    bindCodes(root);
    for (const row of root.querySelectorAll(`[data-op="${CSS.escape(d.id || 'new')}"]`)) {
      syncCode(row); row.addEventListener('change', (e) => { if (e.target.matches('[data-opdns]')) syncCode(row); });
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
        if (!(await askDanger(`Togliere il cliente da ${NAME}?`, (app === 'max' ? 'L\'account MaxPlayer del cliente viene cancellato. L\'abbonamento Kairos non cambia.' : 'La linea sparisce dall\'app OrbixPlay del cliente. L\'abbonamento Kairos non cambia.') + ' Potrai reinviarla dalla scheda del cliente.', 'ELIMINA', 'Togli', false))) return;
        try { await api('DELETE', (app === 'max' ? '/admin/maxplayer/' : '/admin/orbix/') + d.id); if (app === 'max') d.maxp = null; else d.orbix = null; await load(); toast('Tolto da ' + NAME); if (after) after(); } catch (e) { toast(e.message, 1); }
      };
    }
  }
  window.KXPlayers = { box, bind };

  /* ---------- attivazione al salvataggio: spunta «Attiva su … quando premi Salva» (titolare e agenti, anche cliente nuovo) ---------- */
  let pending = null;
  const lineFrom = (pls) => { for (const p of Array.isArray(pls) ? pls : []) { if (p && p.username && p.password) return { u: p.username, p: p.password }; try { const u = new URL((p && p.url) || ''); if (u.searchParams.get('username')) return { u: u.searchParams.get('username'), p: u.searchParams.get('password') || '' }; } catch {} } return { u: '', p: '' }; };
  document.addEventListener('click', (e) => {
    const b = e.target.closest('#dSave, #cOk'); if (!b) return;
    const root = b.id === 'dSave' ? $('#dBody') : $('#agB'); if (!root) return;
    const rows = [...root.querySelectorAll('.op-row')].filter((r) => { const c = r.querySelector('[data-opauto]'); return c && c.checked; });
    pending = rows.length ? rows.map((r) => { const v = (sel) => (r.querySelector(sel) || {}).value || ''; return { app: r.dataset.app, id: v('[data-opid]').trim(), u: v('[data-opu]').trim(), p: v('[data-opp]'), dns: v('[data-opdns]') }; }) : null;
  }, true);
  async function runPending(list, devId, body) {
    const ln = lineFrom(body && body.playlists);
    for (const x of list) {
      const NAME = x.app === 'max' ? 'MaxPlayer' : 'OrbixPlay', u = x.u || ln.u, pw = x.p || ln.p;
      if (x.app === 'orbix' && !x.id) { toast(`${NAME}: manca l'ID del dispositivo, non attivato`, 1); continue; }
      if (!u || !pw) { toast(`${NAME}: mancano utente e password, non attivato`, 1); continue; }
      const b = x.app === 'max' ? { username: u, password: pw, domain: x.dns } : { orbixId: x.id, username: u, password: pw, dns: +x.dns || 0 };
      try { const r = await api('POST', (x.app === 'max' ? '/admin/maxplayer/' : '/admin/orbix/') + devId, b); toast(`${NAME} ${r && r.created === false ? 'aggiornato' : 'attivato'} ✓`); } catch (e) { toast(`${NAME}: ${e.message}`, 1); }
    }
    try { await load(); } catch {}
  }
  const apiP = api;
  window.api = api = async function (m, p, b) {
    const isSave = (m === 'POST' && p === '/admin/devices') || (m === 'PUT' && /^\/admin\/devices\/[^/]+$/.test(p));
    const list = isSave && pending ? pending : null; if (list) pending = null;
    const r = await apiP(m, p, b);
    if (list) { const id = m === 'PUT' ? p.split('/').pop() : (r && r.id) || ((D.devices || []).find((x) => x.code === (b && b.code)) || {}).id; if (id) setTimeout(() => runPending(list, id, b), 0); }
    return r;
  };

  /* ---------- scheda cliente (titolare): sezione «Altre app» prima delle note ---------- */
  const rdw = renderDrawer;
  window.renderDrawer = renderDrawer = function () {
    rdw();
    if (!edit || (edit.parent && !edit.own) || D.role === 'agent') return; // TV collegata: solo con gestione indipendente (linee sue)
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
  // pagina «Gestione app terzi» nel menu, sotto Server DNS e VPN (solo titolare)
  if (!$('.nav[data-v="apps3"]')) {
    const b = document.createElement('button'); b.className = 'nav'; b.dataset.v = 'apps3';
    b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><path d="M17.5 14v7M14 17.5h7"/></svg>Gestione app terzi';
    b.onclick = () => view('apps3');
    const dns = $('.nav[data-v="dns"]'); dns ? dns.after(b) : $('#side').appendChild(b);
    const sec = document.createElement('section'); sec.className = 'view'; sec.id = 'v-apps3'; $('#v-dash').after(sec);
  }
  TITLES.apps3 = 'Gestione app terzi';
  const pane = $('#v-apps3');
  let cfg = null, dirty = false;
  const cfgNow = () => { const c = (D.settings && D.settings.playersCfg) || {}; return { orbix: (c.orbix || []).map((x) => ({ ...x })), max: (c.max || []).map((x) => ({ ...x })), showDnsAgents: !!c.showDnsAgents }; };
  if (pane && !$('#opCard')) {
    pane.insertAdjacentHTML('beforeend', `<div class="card glass" id="opCard"><div class="hd"><h3>OrbixPlay e MaxPlayer<small>Attivi le app dalla scheda del cliente (sezione «Altre app») con ID dispositivo, utente e password: il DNS lo mette il pannello</small></h3></div>
      <div id="opState" class="st-note"></div>
      <div class="st-row" style="align-items:flex-start"><div class="st-l"><b>Link diretti e codici cliente</b><small>Uno «slot» per ogni fornitore: app, link (DNS) e codice cliente. Crea, modifica ed elimina come vuoi. Nella scheda del cliente («Altre app») il codice segue il DNS che scegli.</small></div><div class="st-c" id="opDirect"></div></div>
      <div class="st-row" style="align-items:flex-start"><div class="st-l"><b>DNS di OrbixPlay</b><small>Modificali e premi «Salva DNS»; con ✕ li cancelli. Il primo è quello proposto di base. Il «codice host» (facoltativo) è il numero che OrbixPlay ti dà per il tuo DNS: se c'è, l'indirizzo non viene inviato.</small></div><div class="st-c" id="opDnsO"></div></div>
      <div class="st-row" style="align-items:flex-start"><div class="st-l"><b>DNS di MaxPlayer</b><small>Sono i «Domini» del tuo pannello MaxPlayer: al cliente arriva solo il dominio scelto, mai l'indirizzo. Qui li aggiungi, rinomini, cambi o cancelli (i clienti passano su un altro DNS).</small></div><div class="st-c"><div id="opMx"></div>
        <div style="display:grid;grid-template-columns:1fr 2fr auto;gap:8px;margin-top:10px"><input class="inp" id="opMxL" maxlength="60" placeholder="Nome (es. Principale)" style="margin:0"><input class="inp mono" id="opMxU" maxlength="300" placeholder="http://dns.esempio.com:8080" style="margin:0"><button class="btn sm" id="opMxAdd">Aggiungi a MaxPlayer</button></div></div></div>
      <div class="tog" id="opShow" style="margin-top:12px"><div><b>Gli agenti vedono l'indirizzo dei DNS</b><small>Spento: vedono solo il nome che dai al DNS. I clienti non lo vedono mai nel pannello.</small></div><i></i></div>
      <div style="display:flex;gap:10px;margin-top:12px"><button class="btn pri" id="opSave">Salva DNS OrbixPlay</button></div>
      <details style="margin-top:14px"><summary style="cursor:pointer;font-weight:600">Come collegare OrbixPlay e MaxPlayer (chiavi)</summary>
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
      try { await api('POST', '/admin/maxplayer/domains', { url: u, label: l }); $('#opMxU').value = ''; $('#opMxL').value = ''; toast('DNS aggiunto su MaxPlayer (può restare «in attesa» finché MaxPlayer lo approva)'); mxOwned = null; await loadMx(true); } catch (e) { toast(e.message, 1); }
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
  /* DNS di MaxPlayer (tutti i tuoi, anche in attesa): nome e indirizzo modificabili, cancellazione con spostamento dei clienti */
  let mxOwned = null, mxOwnBusy = false;
  async function loadOwned() {
    if (!P().max || mxOwnBusy) return; mxOwnBusy = true;
    try { mxOwned = (await api('GET', '/admin/maxplayer/domains?owned=1')).domains || []; } catch (e) { mxOwned = []; mxOwned.err = e.message; }
    mxOwnBusy = false; renderMxSettings();
  }
  const ST = { approved: ['Approvato', 'var(--ok)'], pending: ['In attesa', 'var(--warn)'] };
  const urlOf = (x) => x.domain ? `${x.https ? 'https' : 'http'}://${x.domain}${x.port && !((x.https && x.port === '443') || (!x.https && x.port === '80')) ? ':' + x.port : ''}` : '';
  /* Link diretti e codici cliente: «slot» creati e modificati dal titolare */
  const APPN = { orbix: 'OrbixPlay', max: 'MaxPlayer' };
  const slotReady = (x) => x.app === 'orbix' ? ((cfg && cfg.orbix) || cfgNow().orbix).some((d) => hostOf2(d.host) === hostOf2(x.link)) : (mxOwned || mxDoms || []).some((d) => (d.domain || '').toLowerCase() === hostOf2(x.link));
  const saveSlots = async (slots, msg) => { try { await api('PUT', '/admin/settings', { playersCfg: { ...cfgNow(), slots } }); await load(); toast(msg); } catch (e) { toast(e.message, 1); } };
  function slotModal(x) {
    const isNew = !x; x = x || { name: '', app: 'max', link: '', code: (SLOTS()[0] || {}).code || '' };
    const go = ask(isNew ? 'Nuovo slot' : 'Modifica slot', `<label class="lbl">Nome (es. il fornitore)</label><input class="inp" id="slN" maxlength="40" value="${esc(x.name)}" placeholder="es. Armada">
      <label class="lbl">App</label><div class="seg" id="slA" style="display:flex">${['orbix', 'max'].map((a) => `<button type="button" data-sla="${a}" class="${x.app === a ? 'on' : ''}">${APPN[a]}</button>`).join('')}</div>
      <label class="lbl">Link (DNS)</label><input class="inp mono" id="slL" maxlength="300" value="${esc(x.link)}" placeholder="es. maxplayer.esempio.stream">
      <label class="lbl">Codice cliente</label><input class="inp mono" id="slC" maxlength="30" value="${esc(x.code)}" placeholder="es. 265847">`, isNew ? 'Crea' : 'Salva');
    let app = x.app;
    $$('#slA [data-sla]').forEach((b) => (b.onclick = () => { app = b.dataset.sla; $$('#slA [data-sla]').forEach((y) => y.classList.toggle('on', y === b)); }));
    go.then(async (ok) => {
      if (!ok) return;
      const v = { ...(isNew ? {} : { id: x.id }), name: $('#slN').value.trim(), app, link: $('#slL').value.trim(), code: $('#slC').value.trim() };
      const list = SLOTS().map((y) => ({ ...y }));
      if (isNew) list.push(v); else list.splice(list.findIndex((y) => y.id === x.id), 1, v);
      await saveSlots(list, isNew ? 'Slot creato' : 'Slot salvato');
    });
  }
  function renderDirect() {
    const el = $('#opDirect'); if (!el) return;
    const l = SLOTS();
    el.innerHTML = (l.length ? l.map((x) => {
      const ready = x.link && slotReady(x);
      const use = !x.link ? '' : ready ? '<small style="color:var(--ok);white-space:nowrap">✓ pronto</small>' : x.app === 'max' && !P().max ? '<small class="mut">serve la chiave</small>' : `<button class="btn sm pri" data-sluse="${esc(x.id)}">${x.app === 'max' ? 'Aggiungi a MaxPlayer' : 'Aggiungi ai DNS'}</button>`;
      return `<div class="op-slot"><div class="sl-h"><span class="op-ic ${x.app === 'max' ? 'mx' : ''}">${x.app === 'max' ? 'MX' : 'OP'}</span><b>${esc(x.name)}</b><small class="mut">${APPN[x.app]}</small><span style="flex:1"></span>${use}<button class="btn sm" data-sled="${esc(x.id)}">Modifica</button><button class="icb" data-sldel="${esc(x.id)}" title="Elimina">✕</button></div>
        <div class="sl-b"><div><small>Link</small><b class="mono">${esc(x.link || '—')}</b>${x.link ? `<button class="btn sm" data-slcopy="${esc(x.link)}">Copia</button>` : ''}</div><div><small>Codice cliente</small><b class="mono">${esc(x.code || '—')}</b>${x.code ? `<button class="btn sm pri" data-opcode="${esc(x.code)}">Copia</button>` : ''}</div></div></div>`;
    }).join('') : '<small class="mut">Nessuno slot: creane uno.</small>') + '<button class="btn sm" id="slNew" style="margin-top:8px">+ Nuovo slot</button>';
    bindCodes(el);
    $$('[data-slcopy]', el).forEach((b) => (b.onclick = () => navigator.clipboard.writeText(b.dataset.slcopy).then(() => toast('Link copiato'), () => toast(b.dataset.slcopy))));
    $('#slNew').onclick = () => slotModal(null);
    $$('[data-sled]', el).forEach((b) => (b.onclick = () => slotModal(l.find((x) => x.id === b.dataset.sled))));
    $$('[data-sldel]', el).forEach((b) => (b.onclick = async () => { const x = l.find((y) => y.id === b.dataset.sldel); if (!(await ask('Eliminare lo slot?', `<b>${esc(x.name)}</b> · ${APPN[x.app]}. I DNS già aggiunti e le attivazioni fatte non cambiano.`, 'Elimina'))) return; await saveSlots(l.filter((y) => y.id !== x.id), 'Slot eliminato'); }));
    $$('[data-sluse]', el).forEach((b) => (b.onclick = async () => {
      const x = l.find((y) => y.id === b.dataset.sluse), url = /^https?:\/\//i.test(x.link) ? x.link : 'http://' + x.link;
      if (x.app === 'orbix') { if (cfg) readCfg(); const c = cfg || cfgNow(); c.orbix = [...c.orbix, { name: `${x.name} OrbixPlay`, host: url }]; try { await api('PUT', '/admin/settings', { playersCfg: c }); cfg = null; dirty = false; await load(); toast(`OrbixPlay: ${x.name} aggiunto ai DNS`); } catch (e) { toast(e.message, 1); } return; }
      try { await api('POST', '/admin/maxplayer/domains', { url, label: `${x.name} MaxPlayer` }); toast(`MaxPlayer: ${x.name} aggiunto (può restare «in attesa» finché MaxPlayer lo approva)`); mxOwned = null; mxDoms = null; renderMxSettings(); loadMx(true); } catch (e) { toast(e.message, 1); }
    }));
  }
  function renderMxSettings() {
    renderDirect();
    const el = $('#opMx'); if (!el) return;
    $('#opMxAdd') && ($('#opMxAdd').disabled = !P().max);
    if (!P().max) { el.innerHTML = '<small class="mut">Collega prima MaxPlayer (chiave MAXPLAYER_KEY, guida qui sotto)</small>'; return; }
    if (!mxOwned) { el.innerHTML = '<small class="mut">Carico i DNS…</small>'; loadOwned(); return; }
    if (!mxOwned.length) { el.innerHTML = `<small class="mut">${esc(mxOwned.err || 'Nessun DNS su MaxPlayer: aggiungilo qui sotto')}</small>`; return; }
    el.innerHTML = mxOwned.map((x) => { const st = ST[x.status] || [x.status || '', 'var(--mut)']; return `<div class="op-dr" data-mxd="${esc(x.id)}" style="display:grid;grid-template-columns:1fr 2fr auto auto auto;gap:8px;margin-bottom:8px;align-items:center"><input class="inp" data-k="label" maxlength="60" placeholder="Nome" value="${esc(x.label || '')}" style="margin:0"><input class="inp mono" data-k="url" maxlength="300" placeholder="${x.domain ? '' : 'indirizzo nascosto'}" value="${esc(urlOf(x))}" style="margin:0"><small style="color:${st[1]};white-space:nowrap">${esc(st[0])}</small><button class="btn sm" data-mxsave>Salva</button><button class="icb" data-mxdel title="Cancella">✕</button></div>`; }).join('') + '<button class="btn sm" id="opMxR">Aggiorna</button>';
    $('#opMxR').onclick = () => { mxOwned = null; mxDoms = null; renderMxSettings(); loadMx(true); };
    $$('[data-mxd]', el).forEach((row) => {
      const id = row.dataset.mxd, x = mxOwned.find((y) => y.id === id);
      $('[data-mxsave]', row).onclick = async () => {
        const label = $('[data-k="label"]', row).value.trim(), u = $('[data-k="url"]', row).value.trim();
        if (u && u !== urlOf(x) && !(await ask('Cambiare l\'indirizzo di questo DNS?', 'MaxPlayer aggiorna subito le liste di tutti i clienti che lo usano.', 'Cambia'))) return;
        try { await api('PUT', '/admin/maxplayer/domains/' + id, { label, url: u && u !== urlOf(x) ? u : '' }); toast('DNS aggiornato'); mxOwned = null; mxDoms = null; renderMxSettings(); loadMx(true); } catch (e) { toast(e.message, 1); }
      };
      $('[data-mxdel]', row).onclick = async () => {
        const others = mxOwned.filter((y) => y.id !== id && y.status === 'approved');
        if (!others.length) { toast('MaxPlayer non permette di cancellare l\'ultimo DNS: aggiungine prima un altro (approvato)', 1); return; }
        const pick = `<p>I clienti che usano <b>${esc(x.label || urlOf(x) || 'questo DNS')}</b> passano su:</p><select class="inp" id="mxTo">${others.map((y) => `<option value="${esc(y.id)}">${esc((y.label || 'DNS ' + y.id) + (y.domain ? ' — ' + y.domain : ''))}</option>`).join('')}</select>`;
        const go = ask('Cancellare il DNS su MaxPlayer?', pick, 'Cancella');
        await new Promise((r) => setTimeout(r, 0)); const sel = $('#mxTo'); let to = sel ? sel.value : others[0].id; if (sel) sel.onchange = () => (to = sel.value);
        if (!(await go)) return;
        try { await api('DELETE', '/admin/maxplayer/domains/' + id, { transferTo: to }); toast('DNS cancellato, clienti spostati'); mxOwned = null; mxDoms = null; renderMxSettings(); loadMx(true); } catch (e) { toast(e.message, 1); }
      };
    });
    for (const ev of ['input', 'change']) el.addEventListener(ev, (e) => e.stopPropagation());
  }
  /* ---------- liste create sulle app terzi: elenco, rimozione e pulizia delle inattive ---------- */
  if (pane && !$('#tlCard')) {
    pane.insertAdjacentHTML('beforeend', `<div class="card glass" id="tlCard" style="margin-top:18px"><div class="hd"><h3>Liste create sulle app terzi<small>Le attivazioni fatte dal pannello su OrbixPlay e MaxPlayer. Inattiva = abbonamento scaduto, o cliente disattivato e fermo, da più dei giorni scelti.</small></h3></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:12px">
        <label class="mut" style="font-size:13px">Inattive da più di</label><input class="inp" id="tlDays" type="number" min="7" max="365" value="60" style="width:90px;margin:0"><span class="mut" style="font-size:13px">giorni</span>
        <div class="seg" id="tlF"><button data-tlf="all" class="on">Tutte</button><button data-tlf="ina">Solo inattive</button></div>
        <div style="flex:1"></div><button class="btn danger" id="tlClean">🧹 Elimina liste inattive</button></div>
      <div class="tog" id="tlAuto"><div><b>Rimuovi da sole ogni notte</b><small>Ogni notte il pannello toglie da OrbixPlay e MaxPlayer le liste inattive da più dei giorni scelti qui sopra</small></div><i></i></div>
      <div id="tlList" style="margin-top:12px"></div></div>`);
    let tlF = 'all', tlData = null, tlBusy = false;
    const days = () => Math.max(7, Math.min(365, +$('#tlDays').value || 60));
    const loadTl = async () => { if (tlBusy) return; tlBusy = true; try { tlData = await api('GET', '/admin/apps3/lists?days=' + days()); } catch (e) { tlData = { lists: [], err: e.message }; } tlBusy = false; drawTl(); };
    const fmt = (t) => (t ? new Date(t).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
    function drawTl() {
      const el = $('#tlList'); if (!el) return;
      if (!tlData) { el.innerHTML = '<small class="mut">Carico…</small>'; return; }
      const all = tlData.lists || [], ina = all.filter((x) => x.inactive), show = tlF === 'ina' ? ina : all;
      $('#tlClean').textContent = `🧹 Elimina liste inattive${ina.length ? ` (${ina.length})` : ''}`;
      el.innerHTML = tlData.err ? `<small class="mut">${esc(tlData.err)}</small>` : show.length ? `<div class="tbl-wrap"><table class="tbl" style="width:100%"><thead><tr><th>Cliente</th><th>App</th><th>Lista</th><th>DNS</th><th>Inviata</th><th>Da</th><th>Stato</th><th></th></tr></thead><tbody>${show.map((x) => {
        const st = x.inactive ? `<span style="color:var(--bad)">${x.why === 'scaduto' ? 'Scaduto' : 'Disattivato'} da ${Math.max(1, Math.floor((Date.now() - x.since) / 864e5))} giorni</span>` : x.status === 'expired' ? '<span style="color:var(--warn)">Scaduto da poco</span>' : x.status === 'disabled' ? '<span style="color:var(--warn)">Disattivato</span>' : '<span style="color:var(--ok)">Attivo</span>';
        return `<tr><td><b>${esc(x.name || '—')}</b><br><small class="mono mut">${esc(x.code)}</small></td><td><span class="op-ic ${x.app === 'max' ? 'mx' : ''}" style="width:30px;height:30px;font-size:11px;display:inline-grid">${x.app === 'max' ? 'MX' : 'OP'}</span></td><td class="mono" style="font-size:12.5px">${esc(x.app === 'max' ? 'utente ' + x.ref : 'ID ' + x.ref)}${x.app !== 'max' && x.user ? `<br><small class="mut">linea ${esc(x.user)}</small>` : ''}</td><td>${esc(x.dns || '—')}</td><td>${esc(fmt(x.t))}</td><td>${esc(x.by || '—')}</td><td>${st}</td><td style="text-align:right;white-space:nowrap"><button class="btn sm" data-tlre="${esc(x.app)}:${esc(x.id)}" title="Rimanda la stessa lista (stesso DNS) all'app: utile se sul dispositivo è sparita o dopo un ripristino">Reinvia</button> <button class="btn sm danger" data-tlrm="${esc(x.app)}:${esc(x.id)}">Rimuovi</button></td></tr>`;
      }).join('')}</tbody></table></div>` : `<div class="emptyc">${tlF === 'ina' ? 'Nessuna lista inattiva da più di ' + days() + ' giorni' : 'Nessuna lista creata sulle app terzi'}</div>`;
      $$('[data-tlre]', el).forEach((b) => (b.onclick = async () => {
        const [app, id] = b.dataset.tlre.split(':'), x = all.find((y) => y.id === id && y.app === app) || {}, NAME = app === 'max' ? 'MaxPlayer' : 'OrbixPlay';
        if (!(await ask(`Reinviare la lista a ${NAME}?`, `${esc(x.name || x.code || '')}: la linea del cliente viene rimandata a ${NAME} con lo stesso DNS (${esc(x.dns || '—')}).`, 'Reinvia'))) return;
        b.disabled = true;
        try { await api('POST', (app === 'max' ? '/admin/maxplayer/' : '/admin/orbix/') + id, { resend: true }); toast('Lista reinviata a ' + NAME); await load(); loadTl(); } catch (e) { toast(e.message, 1); b.disabled = false; }
      }));
      $$('[data-tlrm]', el).forEach((b) => (b.onclick = async () => {
        const [app, id] = b.dataset.tlrm.split(':'), x = all.find((y) => y.id === id && y.app === app), NAME = app === 'max' ? 'MaxPlayer' : 'OrbixPlay';
        if (!(await askDanger(`Rimuovere la lista da ${NAME}?`, `${esc(x.name || x.code)}: ${app === 'max' ? 'l\'account MaxPlayer viene cancellato' : 'la linea sparisce dall\'app OrbixPlay'}. L'abbonamento Kairos non cambia; potrai reinviarla con «Reinvia».`, 'ELIMINA', 'Rimuovi', false))) return;
        try { await api('DELETE', (app === 'max' ? '/admin/maxplayer/' : '/admin/orbix/') + id); toast('Lista rimossa da ' + NAME); await load(); loadTl(); } catch (e) { toast(e.message, 1); }
      }));
    }
    $('#tlDays').addEventListener('change', (e) => { e.stopPropagation(); loadTl(); });
    $('#tlDays').addEventListener('input', (e) => e.stopPropagation());
    $$('#tlF [data-tlf]').forEach((b) => (b.onclick = () => { tlF = b.dataset.tlf; $$('#tlF [data-tlf]').forEach((x) => x.classList.toggle('on', x === b)); drawTl(); }));
    // come «Elimina utenti inattivi» di MaxPlayer: soglia in giorni, conteggio degli idonei, Elimina
    $('#tlClean').onclick = async () => {
      const go = ask('Elimina liste inattive', `<div class="ina-m"><p class="mut" style="margin:0 0 10px">Toglie da OrbixPlay e MaxPlayer le liste dei clienti con abbonamento scaduto, o disattivati e fermi, da più dei giorni scelti. Gli abbonamenti Kairos non cambiano.</p>
        <label class="lbl">Giorni di inattività</label><input class="inp" type="number" id="tlmD" min="7" max="365" value="${days()}"><div class="cnt" id="tlmC" style="margin-top:14px">Calcolo…</div></div>`, 'Elimina');
      const yes = $('#mYes'); yes.classList.add('danger'); yes.style.background = 'var(--bad)'; yes.style.borderColor = 'var(--bad)'; yes.disabled = true;
      let n = 0, tm = 0;
      const count = async () => { const d = Math.max(7, Math.min(365, +$('#tlmD').value || 60)); yes.disabled = true; try { const r = await api('GET', '/admin/apps3/lists?days=' + d); n = (r.lists || []).filter((x) => x.inactive).length; $('#tlmC').innerHTML = `Liste idonee: <b>${n}</b>. Soglia di inattività: ${d} giorni.`; yes.disabled = !n; } catch (e) { $('#tlmC').textContent = e.message; } };
      $('#tlmD').oninput = () => { clearTimeout(tm); tm = setTimeout(count, 300); }; count();
      const ok = await go; yes.classList.remove('danger'); yes.style.background = yes.style.borderColor = ''; yes.disabled = false;
      if (!ok || !n) return;
      const d = Math.max(7, Math.min(365, +$('#tlmD').value || 60)); $('#tlDays').value = d;
      try { const r = await api('POST', '/admin/apps3/cleanup', { days: d }); toast(`Rimosse ${r.removed} liste${r.errors && r.errors.length ? ` · ${r.errors.length} non riuscite` : ''}`, r.errors && r.errors.length ? 1 : 0); await load(); loadTl(); } catch (e) { toast(e.message, 1); }
    };
    $('#tlAuto').onclick = async () => {
      const on = !$('#tlAuto').classList.contains('on');
      try { await api('PUT', '/admin/settings', { playersCfg: { autoClean: on, cleanDays: days() } }); $('#tlAuto').classList.toggle('on', on); toast(on ? `Ogni notte tolgo le liste inattive da più di ${days()} giorni` : 'Pulizia automatica spenta'); await load(); } catch (e) { toast(e.message, 1); }
    };
    window.KXThird = { load: loadTl, sync: () => { const c = (D.settings && D.settings.playersCfg) || {}; $('#tlAuto').classList.toggle('on', !!c.autoClean); if (!tlData && document.activeElement !== $('#tlDays')) $('#tlDays').value = c.cleanDays || 60; } };
    const navB = $('.nav[data-v="apps3"]'); if (navB) navB.addEventListener('click', () => loadTl());
  }
  function renderOp() {
    if (window.KXThird) KXThird.sync();
    const el = $('#opState'); if (!el) return;
    const n = D.devices.filter((d) => d.orbix).length;
    el.innerHTML = `${P().orbix ? `✅ <b>OrbixPlay collegato</b> · clienti attivi su OrbixPlay: <b>${n}</b>` : '⚠️ <b>OrbixPlay non collegato</b>: manca il segreto ORBIX_KEY (guida qui sotto)'}<br>${P().max ? `✅ <b>MaxPlayer collegato</b> · clienti attivi su MaxPlayer: <b>${D.devices.filter((d) => d.maxp).length}</b>` : '⚠️ <b>MaxPlayer non collegato</b>: manca il segreto MAXPLAYER_KEY (guida qui sotto)'}`;
    if (P().max && !mxDoms && !mxBusy) loadMx(); else renderMxSettings();
    if (!dirty || !cfg) { cfg = cfgNow(); drawDns(); $('#opShow').classList.toggle('on', cfg.showDnsAgents); }
    renderDirect();
  }
  const ra = renderAll;
  window.renderAll = renderAll = function () { ra(); if (D.role !== 'agent') renderOp(); };
  const api0 = api;
  // agente: se il titolare cambia i DNS di MaxPlayer concessi, l'elenco già caricato si butta e si rilegge
  let mxKey = '';
  window.api = api = async function (m, p, b) {
    const r = await api0(m, p, b);
    if (p === '/admin/state' && m === 'GET' && r) {
      D.players = r.players || null;
      const k = JSON.stringify([r.role || '', (((r.me || {}).perms) || {}).mxDns || null, !!(r.players && r.players.max)]);
      if (k !== mxKey) { if (mxKey && !mxBusy) mxDoms = null; mxKey = k; }
    }
    return r;
  };
  if (typeof DEMO !== 'undefined') {
    const dm = demoApi;
    window.demoApi = demoApi = async function (m, p, b) {
      if (p === '/admin/state' && !DEMO.seed3) { DEMO.seed3 = 1; const o = DEMO.devices.filter((d) => !d.parent && d.playlists && d.playlists.length); if (o[1]) { o[1].maxp = { uid: '501', u: 'cliente.vecchio', dom: '1', t: Date.now() - 200 * 864e5 }; o[1].demoOld = true; } if (o[2]) o[2].orbix = { id: 'AA11BB22', n: 1, t: Date.now() - 20 * 864e5, u: 'mario', dns: 0 }; }
      if (p.startsWith('/admin/apps3/lists')) { const dd = +(p.split('days=')[1] || 60), t = Date.now(); return { days: dd, lists: DEMO.devices.filter((d) => d.orbix || d.maxp || d.demo3).flatMap((d) => { const ex = d.demoOld ? t - 95 * 864e5 : d.expires ? new Date(d.expires + 'T23:59:59Z').getTime() : 0, ina = ex && ex < t - dd * 864e5; const b = { id: d.id, name: d.name, code: d.code, expires: d.expires, status: ex && ex < t ? 'expired' : 'active', inactive: !!ina, why: ina ? 'scaduto' : '', since: ina ? ex : 0 }; return [...(d.orbix ? [{ ...b, app: 'orbix', ref: d.orbix.id, t: d.orbix.t, dns: 'DNS Principale', by: 'Tu', user: d.orbix.u || 'mario77' }] : []), ...(d.maxp ? [{ ...b, app: 'max', ref: d.maxp.u, t: d.maxp.t, dns: 'maxplayer.nki-max.stream', by: d.demoAg || 'Tu' }] : [])]; }) }; }
      if (p === '/admin/apps3/cleanup') { const t = Date.now(); let n = 0; for (const d of DEMO.devices) { const ex = d.demoOld ? t - 95 * 864e5 : d.expires ? new Date(d.expires + 'T23:59:59Z').getTime() : 0; if (ex && ex < t - (b.days || 60) * 864e5) { if (d.orbix) { d.orbix = null; n++; } if (d.maxp) { d.maxp = null; n++; } } } return { removed: n, errors: [] }; }
      const mdd = p.match(/^\/admin\/maxplayer\/domains\/(\d+)$/);
      if (mdd && m === 'PUT') { const all = [DEMO.mx0 = DEMO.mx0 || { id: '1', domain: 'dns.kairos-esempio.tv', port: '8080', label: 'Principale', status: 'approved' }, ...(DEMO.mxNew || [])]; const x = all.find((y) => y.id === mdd[1]); if (x) { x.label = b.label; if (b.url) { const u = new URL(b.url); x.domain = u.hostname; x.port = u.port || (u.protocol === 'https:' ? '443' : '80'); x.https = u.protocol === 'https:'; } } return { ok: true }; }
      if (mdd && m === 'DELETE') { DEMO.mxNew = (DEMO.mxNew || []).filter((y) => y.id !== mdd[1]); return { ok: true }; }
      if (p.split('?')[0] === '/admin/maxplayer/domains' && m === 'GET') { const all = [(DEMO.mx0 = DEMO.mx0 || { id: '1', domain: 'dns.kairos-esempio.tv', port: '8080', label: 'Principale', status: 'approved' }), ...(DEMO.mxNew || [])]; if (D.role !== 'agent') return { domains: all }; const al = ((DEMO.agents || [])[0] || { perms: {} }).perms.mxDns; return { domains: all.filter((x) => !Array.isArray(al) || al.includes('*') || al.includes(x.id)).map((x) => ({ id: x.id, label: x.label })) }; } // demo: l'agente vede solo i nomi dei DNS concessi
      if (p === '/admin/maxplayer/domains' && m === 'POST') { (DEMO.mxNew = DEMO.mxNew || []).push({ id: String(10 + DEMO.mxNew.length), domain: b.url.replace(/^https?:\/\//, '').split(/[:/]/)[0], port: '80', label: b.label, status: 'approved' }); return { ok: true }; }
      const xm = p.match(/^\/admin\/maxplayer\/(.+)$/);
      if (xm) { const d = DEMO.devices.find((x) => x.id === xm[1]); if (!d) throw new Error('Cliente non trovato'); if (m === 'DELETE') { d.maxp = null; return { ok: true }; } if (!b.username || !b.password) throw new Error('Scrivi utente e password della linea'); const created = !d.maxp; d.maxp = { uid: d.maxp ? d.maxp.uid : String(500 + Math.floor(Math.random() * 99)), u: d.maxp ? d.maxp.u : b.username, dom: b.domain || '1', t: Date.now() }; return { ...d.maxp, created }; }
      const om = p.match(/^\/admin\/orbix\/(.+)$/);
      if (om) { const d = DEMO.devices.find((x) => x.id === om[1]); if (!d) throw new Error('Cliente non trovato'); if (m === 'DELETE') { d.orbix = null; return { ok: true }; } if (!/^[A-Za-z0-9:._-]{4,64}$/.test(b.orbixId || '')) throw new Error('Scrivi l\'ID del dispositivo che compare nell\'app OrbixPlay'); if (!b.username || !b.password) throw new Error('Scrivi utente e password della linea'); d.orbix = { id: b.orbixId, n: 1, t: Date.now(), u: b.username, dns: b.dns || 0 }; return { ...d.orbix }; }
      const r = await dm(m, p, b);
      if (p === '/admin/state' && r && !r.players) { const c = (DEMO.settings.playersCfg = DEMO.settings.playersCfg || { orbix: [{ name: 'Principale', host: 'http://dns.kairos-esempio.tv:8080' }], max: [], showDnsAgents: false });
        // OrbixPlay: i suoi DNS PIÙ tutti i DNS salvati in «Server DNS» (come fa il worker con orbixDnsList)
        const savedDemo = [{ name: 'DNS principale', host: 'http://demo.server.tv' }, { name: 'DNS di riserva', host: 'http://backup.server.tv:8080' }];
        const kh = (h) => String(h || '').replace(/^https?:\/\//i, '').replace(/\/+$/, '').toLowerCase();
        const orbUni = [...c.orbix]; for (const d of savedDemo) if (!orbUni.some((x) => kh(x.host) === kh(d.host))) orbUni.push({ name: d.name, host: d.host });
        r.players = { orbix: true, max: true, dns: { orbix: orbUni, max: c.max }, showDnsAgents: c.showDnsAgents, codes: c.codes || { orbix: '265847', max: '265847' }, slots: c.slots || [{ id: 'nki-orbix', name: 'NKI', app: 'orbix', link: 'orbx.nki-orbx.download', code: '265847' }, { id: 'nki-max', name: 'NKI', app: 'max', link: 'maxplayer.nki-max.stream', code: '265847' }, { id: 'armada-max', name: 'Armada', app: 'max', link: 'maxplayer-armada.chasertv2.stream', code: '265847' }] }; r.settings = { ...r.settings, playersCfg: c }; }
      return r;
    };
  }
})();
