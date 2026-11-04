/* KAIROS Control 2.8 — Altre app: invio delle linee del cliente a OrbixPlay (API ufficiale) direttamente dal pannello.
   MaxPlayer arriva appena c'è la documentazione della sua API. Usa le funzioni di app.js ($, $$, esc, api, toast, ask, D, load…). */
(() => {
  const css = document.createElement('style');
  css.textContent = `
.op-row{padding:12px 14px;border-radius:10px;border:1px solid var(--line);background:#1a1d22}.op-h{display:flex;align-items:center;gap:12px}
.op-f{display:grid;grid-template-columns:1.1fr 1fr 1fr auto auto;gap:8px;margin-top:12px;align-items:center}.op-f .inp{width:auto!important;min-width:0}
.op-d{display:flex;align-items:center;gap:10px;margin-top:8px;flex-wrap:wrap}
[data-opmx] .op-f,[data-opmx] .op-d{opacity:.45}
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
  /** riquadro «Altre app» di un cliente (lo usano la scheda del titolare e quella degli agenti) */
  function box(d) {
    const o = d.orbix, on = !!P().orbix, ln = lineOf(d);
    const form = (app, dis) => `<div class="op-f"><input class="inp mono" data-opid placeholder="ID dispositivo" maxlength="64" value="${esc(app === 'orbix' && o ? o.id : '')}" ${dis}>
        <input class="inp" data-opu placeholder="Utente" maxlength="120" value="${esc(app === 'orbix' && o && o.u ? o.u : ln.u)}" autocomplete="off" ${dis}>
        <input class="inp" data-opp type="password" placeholder="Password" maxlength="200" value="${esc(ln.p)}" autocomplete="new-password" ${dis}>
        <button class="btn sm pri" data-opsend ${dis}>${app === 'orbix' && o ? 'Riattiva' : 'Attiva'}</button>${app === 'orbix' && o ? '<button class="btn sm danger" data-opdel>Togli</button>' : ''}</div>
      <div class="op-d">${dnsSel(app, app === 'orbix' && o ? o.dns : 0)}</div>`;
    return `<div class="op-row" data-op="${esc(d.id)}"><div class="op-h"><div class="op-ic">OP</div>
      <div class="op-tx"><b>OrbixPlay</b><small>${!on ? 'Non collegato: aggiungi la chiave ORBIX_KEY (Impostazioni → App e aggiornamenti)' : o ? `<span class="op-ok">✓ Attivo</span> sul dispositivo <span class="mono">${esc(o.id)}</span> · ${esc(ago2(o.t))}` : 'Scrivi l\'ID che il cliente vede nell\'app OrbixPlay, utente e password: il DNS lo mette il pannello'}</small></div></div>
      ${on ? form('orbix', '') : ''}</div>
      <div class="op-row" data-opmx><div class="op-h"><div class="op-ic mx">MX</div><div class="op-tx"><b>MaxPlayer</b><small>${P().max ? 'Chiave presente: l\'attivazione arriva con il prossimo aggiornamento' : 'In preparazione: serve la documentazione dell\'API di MaxPlayer'}</small></div></div>
      ${form('max', 'disabled')}</div>`;
  }
  function bind(root, d, after) {
    const row = root.querySelector(`[data-op="${CSS.escape(d.id)}"]`); if (!row) return;
    const send = row.querySelector('[data-opsend]'), del = row.querySelector('[data-opdel]');
    if (send) send.onclick = async () => {
      const v = (sel) => (row.querySelector(sel) || {}).value || '';
      const b = { orbixId: v('[data-opid]').trim(), username: v('[data-opu]').trim(), password: v('[data-opp]'), dns: +v('[data-opdns]') || 0 };
      if (!b.orbixId || !b.username || !b.password) { toast('Scrivi ID dispositivo, utente e password', 1); return; }
      send.disabled = true; send.textContent = 'Attivo…';
      try { const r = await api('POST', '/admin/orbix/' + d.id, b); toast('OrbixPlay attivato'); d.orbix = { id: r.id, n: r.n, t: r.t, u: r.u, dns: r.dns }; await load(); if (after) after(); }
      catch (e) { toast(e.message, 1); send.disabled = false; send.textContent = d.orbix ? 'Riattiva' : 'Attiva'; }
    };
    if (del) del.onclick = async () => {
      if (!(await ask('Togliere il cliente da OrbixPlay?', 'La linea sparisce dall\'app OrbixPlay del cliente. L\'abbonamento Kairos non cambia.', 'Togli'))) return;
      try { await api('DELETE', '/admin/orbix/' + d.id); d.orbix = null; await load(); toast('Tolto da OrbixPlay'); if (after) after(); } catch (e) { toast(e.message, 1); }
    };
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
      <div class="st-row" style="align-items:flex-start"><div class="st-l"><b>DNS personale di MaxPlayer</b><small>Pronto per quando colleghiamo MaxPlayer</small></div><div class="st-c" id="opDnsM"></div></div>
      <div class="tog" id="opShow" style="margin-top:12px"><div><b>Gli agenti vedono l'indirizzo dei DNS</b><small>Spento: vedono solo il nome che dai al DNS. I clienti non lo vedono mai nel pannello.</small></div><i></i></div>
      <div style="display:flex;gap:10px;margin-top:12px"><button class="btn pri" id="opSave">Salva DNS</button></div>
      <details style="margin-top:14px"><summary style="cursor:pointer;font-weight:600">Come collegare OrbixPlay (chiave)</summary>
        <ol style="margin:10px 0 0 18px;line-height:1.7;font-size:13.5px">
          <li>Prendi la tua <b>customer key</b> dal tuo account OrbixPlay (o chiedila al loro supporto).</li>
          <li>Su GitHub apri il repository <b>kairos-iptv</b> → <b>Settings</b> → <b>Secrets and variables</b> → <b>Actions</b> → <b>New repository secret</b>.</li>
          <li>Nome: <code>ORBIX_KEY</code>, valore: la customer key. Salva.</li>
          <li>Vai su <b>Actions</b> → <b>Pannello Cloudflare</b> → <b>Run workflow</b> (oppure aspetta il prossimo aggiornamento): qui comparirà «collegato».</li>
        </ol>
        <p class="mut" style="font-size:12.5px;margin-top:8px">Per MaxPlayer il segreto si chiamerà <code>MAXPLAYER_KEY</code>. Non scrivere mai le chiavi in chat o nel pannello.</p></details></div>`);
    for (const ev of ['input', 'change']) $('#opCard').addEventListener(ev, (e) => { e.stopPropagation(); dirty = true; });
    $('#opShow').onclick = () => { $('#opShow').classList.toggle('on'); dirty = true; };
    $('#opSave').onclick = async () => {
      readCfg();
      try { await api('PUT', '/admin/settings', { playersCfg: cfg }); dirty = false; cfg = null; await load(); toast('DNS salvati'); } catch (e) { toast(e.message, 1); }
    };
  }
  function readCfg() {
    for (const [app, el] of [['orbix', '#opDnsO'], ['max', '#opDnsM']]) cfg[app] = $$(el + ' .op-dr').map((r) => ({ name: $('[data-k="name"]', r).value.trim(), host: $('[data-k="host"]', r).value.trim(), ...($('[data-k="code"]', r) && $('[data-k="code"]', r).value.trim() ? { code: $('[data-k="code"]', r).value.trim() } : {}) }));
    cfg.showDnsAgents = $('#opShow').classList.contains('on');
  }
  function drawDns() {
    for (const [app, el] of [['orbix', '#opDnsO'], ['max', '#opDnsM']]) {
      const box2 = $(el); if (!box2) continue;
      box2.innerHTML = cfg[app].map((x, i) => `<div class="op-dr" style="display:grid;grid-template-columns:1fr 2fr ${app === 'orbix' ? '110px ' : ''}auto;gap:8px;margin-bottom:8px"><input class="inp" data-k="name" maxlength="40" placeholder="Nome (es. Principale)" value="${esc(x.name || '')}" style="margin:0"><input class="inp mono" data-k="host" maxlength="300" placeholder="http://dns.esempio.com:8080" value="${esc(x.host || '')}" style="margin:0">${app === 'orbix' ? `<input class="inp mono" data-k="code" maxlength="9" placeholder="Codice host" value="${esc(x.code || '')}" style="margin:0">` : ''}<button class="icb" data-oprm="${app}:${i}" title="Togli">✕</button></div>`).join('') + `<button class="btn sm" data-opadd="${app}">+ Aggiungi DNS</button>`;
    }
    $$('[data-opadd]').forEach((b) => (b.onclick = () => { readCfg(); cfg[b.dataset.opadd].push({ name: '', host: '' }); dirty = true; drawDns(); }));
    $$('[data-oprm]').forEach((b) => (b.onclick = () => { readCfg(); const [a, i] = b.dataset.oprm.split(':'); cfg[a].splice(+i, 1); dirty = true; drawDns(); }));
  }
  function renderOp() {
    const el = $('#opState'); if (!el) return;
    const n = D.devices.filter((d) => d.orbix).length;
    el.innerHTML = `${P().orbix ? `✅ <b>OrbixPlay collegato</b> · clienti attivi su OrbixPlay: <b>${n}</b>` : '⚠️ <b>OrbixPlay non collegato</b>: manca il segreto ORBIX_KEY (guida qui sotto)'}<br>${P().max ? '🔑 MaxPlayer: chiave presente, collegamento in preparazione' : '⏳ MaxPlayer: in preparazione'}`;
    if (!dirty || !cfg) { cfg = cfgNow(); drawDns(); $('#opShow').classList.toggle('on', cfg.showDnsAgents); }
  }
  const ra = renderAll;
  window.renderAll = renderAll = function () { ra(); if (D.role !== 'agent') renderOp(); };
  const api0 = api;
  window.api = api = async function (m, p, b) { const r = await api0(m, p, b); if (p === '/admin/state' && m === 'GET' && r) D.players = r.players || null; return r; };
  if (typeof DEMO !== 'undefined') {
    const dm = demoApi;
    window.demoApi = demoApi = async function (m, p, b) {
      const om = p.match(/^\/admin\/orbix\/(.+)$/);
      if (om) { const d = DEMO.devices.find((x) => x.id === om[1]); if (!d) throw new Error('Cliente non trovato'); if (m === 'DELETE') { d.orbix = null; return { ok: true }; } if (!/^[A-Za-z0-9:._-]{4,64}$/.test(b.orbixId || '')) throw new Error('Scrivi l\'ID del dispositivo che compare nell\'app OrbixPlay'); if (!b.username || !b.password) throw new Error('Scrivi utente e password della linea'); d.orbix = { id: b.orbixId, n: 1, t: Date.now(), u: b.username, dns: b.dns || 0 }; return { ...d.orbix }; }
      const r = await dm(m, p, b);
      if (p === '/admin/state' && r && !r.players) { const c = (DEMO.settings.playersCfg = DEMO.settings.playersCfg || { orbix: [{ name: 'Principale', host: 'http://dns.kairos-esempio.tv:8080' }], max: [], showDnsAgents: false }); r.players = { orbix: true, max: false, dns: { orbix: c.orbix, max: c.max }, showDnsAgents: c.showDnsAgents }; r.settings = { ...r.settings, playersCfg: c }; }
      return r;
    };
  }
})();
