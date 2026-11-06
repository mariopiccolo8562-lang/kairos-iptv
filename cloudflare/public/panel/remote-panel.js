/* KAIROS Control — «Controllo remoto»: comandi le tue app (Pro, TV, Lite, XC, Plus) senza toccare la TV del cliente.
   - Profilo per app: impostazioni imposte a tutti i clienti di quell'app (modalità leggera, anteprima, lettore, tema…).
     Nell'app la voce risulta «scelta dal fornitore» e il cliente non la cambia.
   - Singolo cliente: vedi le impostazioni attuali della sua app, ne imponi di diverse, mandi comandi
     (riavvia, svuota cache, aggiorna liste, apri impostazioni, speed test, chiudi).
   - Tutto arriva al battito successivo: entro un minuto se l'app è aperta, altrimenti alla prossima apertura.
   Solo titolare. Usa le funzioni di app.js ($, $$, esc, api, toast, ask, D, load, ago…). */
(() => {
  const css = document.createElement('style');
  css.textContent = `
.rc-apps{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}
.rc-apps button{all:unset;cursor:pointer;display:flex;align-items:center;gap:8px;padding:9px 15px;border-radius:11px;font-size:13.5px;font-weight:700;color:#eef1f8;background:rgba(255,255,255,.04);border:1px solid var(--line)}
.rc-apps button.on{background:var(--a1);border-color:transparent;color:#fff}.rc-apps button .n{font-size:11px;font-weight:800;padding:1px 7px;border-radius:9px;background:rgba(255,255,255,.14)}
.rc-g{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);gap:16px;align-items:start}
.rc-rows{display:grid;gap:6px}
.rc-r{display:grid;grid-template-columns:minmax(0,1fr) 220px;gap:10px;align-items:center;padding:9px 12px;border-radius:10px;border:1px solid var(--line);background:rgba(255,255,255,.025)}
.rc-r b{font-size:13.5px;display:block}.rc-r small{display:block;color:var(--mut);font-size:11.5px;margin-top:2px;line-height:1.35}
.rc-r select{margin:0;padding:8px 10px;font-size:13px;width:100%}.rc-r.set{border-color:color-mix(in srgb,var(--a1) 55%,transparent);background:color-mix(in srgb,var(--a1) 8%,transparent)}
.rc-r .cur{font-size:11.5px;color:var(--mut);margin-top:3px}.rc-r .cur b{display:inline;font-size:11.5px;color:#eef1f8}
.rc-cmds{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:8px}
.rc-cmd{all:unset;cursor:pointer;display:flex;flex-direction:column;gap:3px;padding:11px 13px;border-radius:11px;border:1px solid var(--line);background:rgba(255,255,255,.03);transition:background .15s}
.rc-cmd:hover{background:rgba(255,255,255,.07)}.rc-cmd b{font-size:13.5px}.rc-cmd small{color:var(--mut);font-size:11.5px;line-height:1.35}.rc-cmd.danger b{color:var(--bad)}
.rc-cmd:disabled{opacity:.4;cursor:not-allowed}
.rc-tbl{width:100%;border-collapse:collapse;font-size:13.5px}.rc-tbl th{text-align:left;font-size:12px;color:var(--mut);font-weight:600;padding:10px 12px;border-bottom:1px solid var(--line);white-space:nowrap}
.rc-tbl td{padding:10px 12px;border-bottom:1px solid var(--line);vertical-align:middle}.rc-tbl tbody tr:hover{background:var(--hov)}
.rc-tbl small{display:block;color:var(--mut);font-size:12px}
.rc-st{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:600}.rc-st i{width:8px;height:8px;border-radius:50%;background:var(--mut)}.rc-st.ok i{background:var(--ok)}.rc-st.wait i{background:var(--warn)}
.rc-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px}.rc-bar .inp{flex:1;min-width:200px;margin:0}
.rc-note{font-size:12.5px;color:var(--mut);line-height:1.5}
#rcM .glass{max-width:980px!important;width:min(980px,96vw)!important}
.rc-hist{font-size:12.5px;color:var(--mut);display:grid;gap:4px;max-height:160px;overflow:auto}.rc-hist b{color:#eef1f8;font-weight:600}
.rc-dr{margin-top:12px;padding:12px 14px;border-radius:12px;border:1px solid var(--line);background:rgba(255,255,255,.025);display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.rc-dr .sp{flex:1}
@media (max-width:1000px){.rc-g{grid-template-columns:1fr}.rc-r{grid-template-columns:1fr}}`;
  document.head.appendChild(css);

  const owner = () => D.role !== 'agent' && !window.__assist;
  const APPS = [['tv', 'Kairos Pro'], ['ktv', 'Kairos TV'], ['prem', 'Kairos Premium'], ['lite', 'Kairos Lite'], ['xc', 'Kairos XC'], ['plus', 'Kairos Plus'], ['nova', 'Kairos Nova']];
  /** app che non si collegano al pannello con un codice (nessuna, oggi): niente clienti né comandi, solo la politica degli aggiornamenti */
  const unlinked = (app) => R.data && Array.isArray(R.data.linked) && !R.data.linked.includes(app);
  const R = { data: null, app: 'tv', q: '', busy: false, draft: {}, t: 0 };
  TITLES.rctl = 'Controllo remoto';
  const side = $('#side'), dash = $('#v-dash');
  if (side && !$('.nav[data-v="rctl"]')) {
    const b = document.createElement('button'); b.className = 'nav'; b.dataset.v = 'rctl'; b.style.display = 'none';
    b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8"/><path d="M8 10h.01M12 10h.01M16 10h.01M8 13h8"/></svg>Controllo remoto';
    b.onclick = () => view('rctl'); side.appendChild(b);
    const sec = document.createElement('section'); sec.className = 'view'; sec.id = 'v-rctl'; dash.after(sec);
  }

  /* ---------- dati ---------- */
  async function loadR(force) {
    if (R.busy || (!force && R.data && Date.now() - R.t < 20e3)) return;
    R.busy = true;
    try { R.data = await api('GET', '/admin/rctl'); R.t = Date.now(); } catch (e) { R.data = { err: e.message }; } finally { R.busy = false; }
    draw();
  }
  const appOf = (d) => { const v = String(((R.data || {}).devs || {})[d.id] && R.data.devs[d.id].ver || '').trim(); if (/vega/i.test(v)) return 'vega'; if (/^lite\b/i.test(v)) return 'lite'; if (/^xc\b/i.test(v)) return 'xc'; if (/^plus\b/i.test(v)) return 'plus'; if (/^nova\b/i.test(v)) return 'nova'; if (/premium/i.test(v)) return 'prem'; if (/^tv\b/i.test(v)) return 'ktv'; if (/^\d+\.\d+/.test(v)) return 'tv'; return d.app || 'tv'; };
  const catFor = (app) => ((R.data || {}).cat || []).filter((c) => c[4].includes(app));
  const cmdsFor = (app) => ((R.data || {}).cmds || []).filter((c) => !app || c[3].includes(app));
  const lblOf = (c, v) => { if (v === undefined || v === null || v === '') return ''; const o = c[3].find((x) => x[0] === v || String(x[0]) === String(v)); return o ? o[1] : String(v); };
  const rcvOf = (rc) => { const keys = Object.keys(rc || {}).sort(), flat = keys.map((k) => k + '=' + JSON.stringify(rc[k])).join('&'); let h = 0; for (let i = 0; i < flat.length; i++) h = (h * 31 + flat.charCodeAt(i)) >>> 0; return keys.length ? h.toString(36) : ''; };
  const effOf = (d) => ({ ...((R.data.apps || {})[appOf(d)] || {}), ...((R.data.over || {})[d.id] || {}) });
  /** stato della configurazione sul dispositivo: applicata / in attesa / app vecchia (non la manda ancora) */
  function cfgState(d) {
    const p = (R.data.devs || {})[d.id]; if (!p) return ['', 'mai aperta di recente'];
    const want = rcvOf(effOf(d));
    if (!want) return ['ok', p.cfg ? 'nessuna impostazione imposta' : 'app da aggiornare'];
    if (p.rcv === want) return ['ok', 'applicata'];
    if (!p.cfg && !p.rcv) return ['wait', 'app da aggiornare: non riceve ancora il controllo remoto'];
    return ['wait', 'in attesa del prossimo battito'];
  }
  const selHtml = (c, cur, dflt, name) => `<select class="inp" data-${name}="${esc(c[0])}"><option value="">${esc(dflt)}</option>${c[3].map(([v, l]) => `<option value="${esc(String(v))}" ${cur !== undefined && cur !== null && String(cur) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  const readSel = (root, name) => { const o = {}; $$(`[data-${name}]`, root).forEach((s) => { if (s.value !== '') { const c = (R.data.cat || []).find((x) => x[0] === s.dataset[name]); const v = c && c[3].find((x) => String(x[0]) === s.value); o[s.dataset[name]] = v ? v[0] : s.value; } }); return o; };

  /* ---------- pagina ---------- */
  function draw() {
    const V = $('#v-rctl'); if (!V || !V.classList.contains('on')) return;
    if (!owner()) { V.innerHTML = '<div class="emptyc">Riservato al titolare</div>'; return; }
    if (!R.data) { V.innerHTML = '<div class="card glass"><p class="mut">Carico…</p></div>'; return; }
    if (R.data.err) { V.innerHTML = `<div class="card glass"><p class="mut">${esc(R.data.err)}</p></div>`; return; }
    const devs = (D.devices || []).filter((d) => !d.parent || d.own), byApp = {}; for (const d of devs) { const a = appOf(d); byApp[a] = (byApp[a] || 0) + 1; }
    const app = R.app, name = (APPS.find((x) => x[0] === app) || [])[1] || app, prof = (R.data.apps || {})[app] || {}, cat = catFor(app), cmds = cmdsFor(app);
    const list = devs.filter((d) => appOf(d) === app && (!R.q || [d.name, d.code, d.notes].join(' ').toLowerCase().includes(R.q))).sort((a, b) => (((R.data.devs || {})[b.id] || {}).t || 0) - (((R.data.devs || {})[a.id] || {}).t || 0));
    const nSet = Object.keys(prof).length;
    V.innerHTML = `<div class="card glass" style="margin-bottom:16px"><div class="hd"><h3>Controllo remoto delle app<small>Imposti e comandi le app dei clienti da qui: tutto arriva al battito successivo (entro un minuto se l'app è aperta, altrimenti alla prossima apertura). Nell'app le voci imposte risultano «scelte dal fornitore».</small></h3><button class="btn sm" id="rcRe">Aggiorna</button></div>
      <div class="rc-apps">${APPS.map(([k, l]) => `<button type="button" data-rca="${k}" class="${k === app ? 'on' : ''}">${esc(l)}${unlinked(k) ? '' : `<span class="n">${byApp[k] || 0}</span>`}</button>`).join('')}</div>
      <div class="rc-g">
        <div><h4 style="margin:0 0 4px">Profilo di ${esc(name)}</h4><p class="rc-note" style="margin:0 0 10px">${unlinked(app) ? `${esc(name)} non si collega al pannello con un codice: vale per tutte le installazioni, che leggono la politica degli aggiornamenti a ogni controllo (all'apertura e ogni ora).` : `Vale per tutti i clienti con ${esc(name)} (${byApp[app] || 0}). «Decide il cliente» = la voce resta libera nell'app.`} ${nSet ? `<b>${nSet}</b> ${nSet === 1 ? 'voce imposta' : 'voci imposte'}.` : 'Nessuna voce imposta.'}</p>
          <div class="rc-rows" id="rcProf">${cat.map((c) => `<div class="rc-r ${prof[c[0]] !== undefined ? 'set' : ''}"><div><b>${esc(c[1])}</b>${c[5] ? `<small>${esc(c[5])}</small>` : ''}</div>${selHtml(c, prof[c[0]], c[6] || 'Decide il cliente', 'rcp')}</div>`).join('')}</div>
          <div style="display:flex;gap:8px;margin-top:12px;align-items:center"><button class="btn pri" id="rcSave">Salva profilo ${esc(name)}</button><button class="btn" id="rcClear">Libera tutto</button></div></div>
        ${unlinked(app) ? `<div><h4 style="margin:0 0 4px">Comandi</h4><p class="rc-note" style="margin:0">Non disponibili: ${esc(name)} non riceve il battito del pannello. Qui decidi solo come si aggiorna (in background e, se vuoi, obbligatoriamente).</p></div>` : `<div><h4 style="margin:0 0 4px">Comandi a tutti i clienti ${esc(name)}</h4><p class="rc-note" style="margin:0 0 10px">A chi ha aperto l'app negli ultimi 7 giorni. Chi sta guardando riceve «aggiorna liste» e «speed test» dopo la visione.</p>
          <div class="rc-cmds">${cmds.map((c) => `<button type="button" class="rc-cmd ${c[0] === 'exit' || c[0] === 'cache' ? 'danger' : ''}" data-rcall="${c[0]}"><b>${esc(c[1])}</b><small>${esc(c[2])}</small></button>`).join('')}</div></div>`}
      </div></div>
      ${unlinked(app) ? '' : `<div class="card glass"><div class="hd" style="flex-wrap:wrap;gap:10px"><h3>Clienti con ${esc(name)}<small>Per ognuno: impostazioni attuali dell'app, voci imposte solo a lui, comandi</small></h3><input class="inp" id="rcQ" placeholder="Cerca cliente…" value="${esc(R.q)}" style="width:240px;margin:0"></div>
        ${list.length ? `<div class="tbl-wrap"><table class="rc-tbl"><thead><tr><th>Cliente</th><th>Versione</th><th>Visto</th><th>Configurazione</th><th>Solo lui</th><th>Ultimo comando</th><th></th></tr></thead><tbody>${list.slice(0, 400).map((d) => rowHtml(d)).join('')}</tbody></table></div>${list.length > 400 ? `<p class="mut">Mostrati 400 su ${list.length}: usa la ricerca.</p>` : ''}` : `<div class="emptyc">${devs.length ? 'Nessun cliente con questa app' : 'Nessun cliente'}</div>`}</div>`}`;
    $('#rcRe').onclick = () => { loadR(true); load(true).catch(() => {}); };
    $$('[data-rca]', V).forEach((b) => (b.onclick = () => { R.app = b.dataset.rca; draw(); }));
    if ($('#rcQ')) $('#rcQ').oninput = (e) => { R.q = e.target.value.toLowerCase().trim(); const p = e.target.selectionStart; draw(); const q = $('#rcQ'); q.focus(); q.setSelectionRange(p, p); };
    $('#rcSave').onclick = () => saveProfile(app, readSel($('#rcProf'), 'rcp'));
    $('#rcClear').onclick = async () => { if (!(await ask(`Liberare tutte le voci di ${name}?`, 'I clienti torneranno a scegliere da soli nell\'app (le voci imposte a un singolo cliente restano).', 'Libera'))) return; saveProfile(app, {}); };
    $$('[data-rcall]', V).forEach((b) => (b.onclick = () => sendCmd(b.dataset.rcall, { app }, `a tutti i clienti ${name} aperti negli ultimi 7 giorni`)));
    $$('[data-rcdev]', V).forEach((b) => (b.onclick = () => { const d = D.devices.find((x) => x.id === b.dataset.rcdev); if (d) openDev(d); }));
  }
  function rowHtml(d) {
    const p = (R.data.devs || {})[d.id] || {}, ov = (R.data.over || {})[d.id] || {}, [st, txt] = cfgState(d), lc = (R.data.last || {})[d.id], pend = (R.data.pending || {})[d.id] || 0;
    const cmdName = (k) => ((R.data.cmds || []).find((c) => c[0] === k) || [k, k])[1];
    return `<tr><td><b>${esc(d.name || 'Senza nome')}</b><small class="mono">${esc(d.code)}</small></td><td>${esc(p.ver || '—')}</td><td>${p.t ? esc(ago(p.t)) : '<span class="mut">—</span>'}${d.live ? ' <span class="rc-st ok"><i></i>online</span>' : ''}</td>
      <td><span class="rc-st ${st}"><i></i>${esc(txt)}</span></td><td>${Object.keys(ov).length ? `<b>${Object.keys(ov).length}</b> ${Object.keys(ov).length === 1 ? 'voce' : 'voci'}` : '<span class="mut">—</span>'}</td>
      <td>${lc ? `${esc(cmdName(lc.cmd))}<small>${lc.done ? (lc.ok ? '✓ eseguito' : '✗ ' + esc(lc.info || 'non riuscito')) + ' · ' + esc(ago(lc.done)) : lc.sent ? 'consegnato, in esecuzione' : 'in attesa del battito'}${pend > 1 ? ` · ${pend} in coda` : ''}</small>` : '<span class="mut">—</span>'}</td>
      <td><button class="btn sm" data-rcdev="${esc(d.id)}">Impostazioni e comandi</button></td></tr>`;
  }
  async function saveProfile(app, rc) {
    try { const r = await api('PUT', '/admin/rctl/app/' + app, { rc }); R.data.apps[app] = r.rc || {}; toast('Profilo salvato: arriva alle app al prossimo battito'); draw(); } catch (e) { toast(e.message, 1); }
  }
  async function sendCmd(cmd, target, who) {
    const C = (R.data.cmds || []).find((c) => c[0] === cmd); if (!C) return;
    if (!(await ask(`${C[1]}?`, `<p class="mut" style="margin:0 0 6px">${esc(C[2])}.</p>Inviato ${esc(who)}. L'app lo esegue al prossimo battito (entro un minuto se è aperta).`, C[1]))) return;
    try { const r = await api('POST', '/admin/rctl/cmd', { cmd, ...target }); toast(r.queued ? `«${C[1]}» inviato a ${r.queued} ${r.queued === 1 ? 'dispositivo' : 'dispositivi'}${r.skipped ? ` (${r.skipped} lo avevano già in coda)` : ''}` : 'Nessun dispositivo da raggiungere (app non aperta negli ultimi 7 giorni)'); loadR(true); } catch (e) { toast(e.message, 1); }
  }

  /* ---------- scheda del singolo cliente ---------- */
  async function openDev(d) {
    if (!R.data) { await loadR(true); if (!R.data || R.data.err) return; }
    const app = appOf(d), name = (APPS.find((x) => x[0] === app) || [])[1] || app, cat = catFor(app), cmds = cmdsFor(app);
    const p = (R.data.devs || {})[d.id] || {}, ov = (R.data.over || {})[d.id] || {}, prof = (R.data.apps || {})[app] || {}, cfg = p.cfg || null, [st, txt] = cfgState(d);
    let M = $('#rcM'); if (!M) { M = document.createElement('div'); M.id = 'rcM'; M.className = 'modal'; document.body.appendChild(M); }
    const curOf = (c) => { if (!cfg) return ''; const v = cfg[c[0]]; return v === undefined ? '' : lblOf(c, v) || String(v); };
    M.innerHTML = `<div class="glass" style="padding:22px 24px"><div class="hd" style="margin-bottom:12px"><h3>${esc(d.name || 'Senza nome')} <small class="mono">${esc(d.code)} · ${esc(name)}${p.ver ? ' ' + esc(p.ver) : ''}${p.t ? ' · visto ' + esc(ago(p.t)) : ''}</small></h3><button class="icb" id="rcMx" title="Chiudi">✕</button></div>
      <p class="rc-note" style="margin:0 0 12px">Configurazione: <span class="rc-st ${st}"><i></i>${esc(txt)}</span>${cfg ? '' : ' · le impostazioni attuali dell\'app arrivano appena il cliente la apre con la versione aggiornata.'}</p>
      <div class="rc-g">
        <div><h4 style="margin:0 0 4px">Impostazioni dell'app</h4><p class="rc-note" style="margin:0 0 10px">A sinistra il valore che l'app usa adesso; a destra quello che imponi solo a questo cliente (vince sul profilo ${esc(name)}).</p>
          <div class="rc-rows" id="rcDev">${cat.map((c) => { const cur = curOf(c), pv = prof[c[0]]; return `<div class="rc-r ${ov[c[0]] !== undefined ? 'set' : ''}"><div><b>${esc(c[1])}</b><div class="cur">Nell'app: <b>${esc(cur || '—')}</b>${pv !== undefined ? ` · profilo ${esc(name)}: ${esc(lblOf(c, pv))}` : ''}</div></div>${selHtml(c, ov[c[0]], pv !== undefined ? 'Come il profilo (' + lblOf(c, pv) + ')' : 'Decide il cliente', 'rcd')}</div>`; }).join('')}</div>
          <div style="display:flex;gap:8px;margin-top:12px"><button class="btn pri" id="rcDevSave">Salva per questo cliente</button><button class="btn" id="rcDevClr">Togli le voci solo sue</button></div></div>
        <div><h4 style="margin:0 0 4px">Comandi</h4><p class="rc-note" style="margin:0 0 10px">${d.live ? 'L\'app è aperta adesso: il comando arriva entro un minuto.' : 'App chiusa o non in contatto: il comando parte alla prossima apertura.'}</p>
          <div class="rc-cmds" style="grid-template-columns:1fr 1fr">${cmds.map((c) => `<button type="button" class="rc-cmd ${c[0] === 'exit' || c[0] === 'cache' ? 'danger' : ''}" data-rcone="${c[0]}"><b>${esc(c[1])}</b><small>${esc(c[2])}</small></button>`).join('')}</div>
          <h4 style="margin:14px 0 6px">Ultimi comandi</h4><div class="rc-hist" id="rcHist">Carico…</div></div>
      </div></div>`;
    M.classList.add('on');
    const close = () => M.classList.remove('on');
    $('#rcMx').onclick = close; M.onclick = (e) => { if (e.target === M) close(); };
    $('#rcDevSave').onclick = async () => { try { const r = await api('PUT', '/admin/rctl/device/' + d.id, { rc: readSel($('#rcDev'), 'rcd') }); R.data.over[d.id] = r.rc || {}; toast('Salvato: arriva all\'app al prossimo battito'); close(); draw(); } catch (e) { toast(e.message, 1); } };
    $('#rcDevClr').onclick = async () => { try { await api('PUT', '/admin/rctl/device/' + d.id, { rc: {} }); delete R.data.over[d.id]; toast('Tolte: vale il profilo ' + name); close(); draw(); } catch (e) { toast(e.message, 1); } };
    $$('[data-rcone]', M).forEach((b) => (b.onclick = () => sendCmd(b.dataset.rcone, { ids: [d.id] }, 'a ' + (d.name || d.code)).then(() => hist())));
    const hist = async () => { const H = $('#rcHist'); if (!H) return; try { const r = await api('GET', '/admin/rctl/cmds/' + d.id); const cmdName = (k) => ((R.data.cmds || []).find((c) => c[0] === k) || [k, k])[1]; H.innerHTML = r.items.length ? r.items.map((x) => `<div><b>${esc(cmdName(x.cmd))}</b> · ${new Date(x.created).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })} · ${x.done ? (x.ok ? '✓ eseguito' : '✗ ' + esc(x.info || 'non riuscito')) + (x.info && x.ok ? ' (' + esc(x.info) + ')' : '') : x.sent ? 'consegnato' : 'in attesa'}</div>`).join('') : '<span>Nessun comando inviato</span>'; } catch (e) { H.textContent = e.message; } };
    hist();
  }
  window.KXRemote = { open: openDev };

  /* ---------- scheda cliente: collegamento al controllo remoto ---------- */
  const rdw = renderDrawer;
  window.renderDrawer = renderDrawer = function () {
    const r = rdw.apply(this, arguments);
    try {
      if (!edit || !edit.id || isNew || !owner()) return r;
      const sec = $('#ds-oth'); if (!sec || $('#rcDrawer')) return r;
      sec.insertAdjacentHTML('beforeend', `<div class="rc-dr" id="rcDrawer"><div><b>Controllo remoto</b><br><small class="mut">Impostazioni dell'app di questo cliente e comandi (riavvia, svuota cache, aggiorna liste…)</small></div><span class="sp"></span><button class="btn sm pri" type="button" id="rcDrawerB">Apri</button></div>`);
      $('#rcDrawerB').onclick = (e) => { e.preventDefault(); const d = D.devices.find((x) => x.id === edit.id); if (d) openDev(d); };
    } catch {}
    return r;
  };

  /* ---------- menu e aggiornamento ---------- */
  const ra = renderAll;
  window.renderAll = renderAll = function () { ra(); const n = $('.nav[data-v="rctl"]'); if (n) { const d = owner() ? '' : 'none'; if (n.style.display !== d) n.style.display = d; } if ($('#v-rctl') && $('#v-rctl').classList.contains('on')) draw(); };
  const v0 = view;
  window.view = view = function (v) { const r = v0.apply(this, arguments); if (v === 'rctl') { draw(); loadR(false); } return r; };

  /* ---------- demo ---------- */
  if (typeof DEMO !== 'undefined') {
    const dm = demoApi;
    const CAT = [['lite', 'Modalità leggera', 'sel', [['auto', 'Automatica'], ['on', 'Sempre attiva'], ['max', 'Leggerissima'], ['off', 'Spenta']], ['tv', 'ktv', 'lite', 'xc', 'plus'], 'Niente animazioni ed effetti, immagini e memoria ridotte'], ['bgupd', 'Aggiornamenti in background', 'sel', [['on', 'Sì: scarica da sola, poi chiede solo «Installa»'], ['off', 'No: scarica solo quando il cliente accetta']], ['tv', 'ktv', 'lite', 'xc', 'plus', 'nova'], 'L\'app scarica e verifica da sola la versione nuova (solo su Wi-Fi o cavo); al cliente resta un solo OK, quello di Android'], ['force', 'Aggiornamento obbligatorio', 'sel', [['off', 'No: il cliente può rimandare'], ['7d', 'Dopo 7 giorni dal primo avviso'], ['3d', 'Dopo 3 giorni dal primo avviso'], ['now', 'Subito']], ['tv', 'ktv', 'lite', 'xc', 'plus', 'nova'], 'Scaduto il termine l\'app si apre solo dopo aver installato la versione nuova. Blocca soltanto se l\'APK è già scaricato e verificato, mai per un problema di rete', 'No: il cliente può rimandare'], ['preview', 'Anteprima nella lista canali', 'sel', [['click', 'Al primo OK'], ['off', 'Spenta']], ['ktv', 'lite', 'xc'], ''], ['theme', 'Colore', 'sel', [['cinema', 'Cinema'], ['ocean', 'Oceano'], ['forest', 'Foresta'], ['sunset', 'Tramonto'], ['mono', 'Mono']], ['tv'], ''], ['o.startScr', 'Schermata iniziale', 'sel', [['home', 'Home'], ['movies', 'Film'], ['series', 'Serie'], ['live', 'In Diretta'], ['guide', 'Guida TV'], ['lastch', 'Ultimo canale guardato']], ['tv'], ''], ['o.hw', 'Accelerazione hardware', 'sel', [['auto', 'Automatica'], ['on', 'Sempre attiva'], ['off', 'Disattivata (software)']], ['tv'], ''], ['p.quality', 'Qualità video', 'sel', [['auto', 'Automatica'], ['max', 'Massima'], ['1080', '1080p'], ['720', '720p']], ['tv'], '']];
    const CM = [['reload', 'Riavvia l\'app', 'Chiude e riapre l\'interfaccia', ['tv', 'ktv', 'lite', 'xc', 'plus', 'nova']], ['cache', 'Svuota cache e riavvia', 'Cancella liste e immagini salvate e riscarica tutto', ['tv', 'ktv', 'lite', 'xc', 'plus', 'nova']], ['sync', 'Aggiorna le liste', 'Riscarica canali, film e serie', ['tv', 'ktv', 'lite', 'xc', 'plus', 'nova']], ['update', 'Aggiorna l\'app', 'Controlla subito se c\'è una versione nuova: la scarica in background e propone «Installa ora»', ['tv', 'ktv', 'lite', 'xc', 'plus', 'nova']], ['settings', 'Apri le impostazioni', 'Porta il cliente nelle Impostazioni', ['tv', 'ktv', 'lite', 'xc', 'plus', 'nova']], ['speed', 'Speed test', 'Misura la connessione', ['tv']], ['exit', 'Chiudi l\'app', 'L\'app si chiude', ['tv', 'ktv', 'lite', 'xc', 'plus', 'nova']]];
    const RD = (DEMO.rctl = DEMO.rctl || { apps: { tv: { lite: 'auto' }, ktv: {}, lite: { lite: 'on' }, xc: {}, plus: {}, nova: {} }, over: {}, cmds: [], seq: 1 });
    const rcv = (rc) => { const keys = Object.keys(rc || {}).sort(), flat = keys.map((k) => k + '=' + JSON.stringify(rc[k])).join('&'); let h = 0; for (let i = 0; i < flat.length; i++) h = (h * 31 + flat.charCodeAt(i)) >>> 0; return keys.length ? h.toString(36) : ''; };
    window.demoApi = demoApi = async function (m, p, b) {
      if (!p.startsWith('/admin/rctl')) return dm(m, p, b);
      await new Promise((r) => setTimeout(r, 120));
      if (p === '/admin/rctl' && m === 'GET') {
        const devs = {}, t = Date.now();
        DEMO.devices.filter((d) => !d.parent).forEach((d, i) => { const app = d.app || 'tv'; const eff = { ...(RD.apps[app] || {}), ...(RD.over[d.id] || {}) }; devs[d.id] = { ver: app === 'tv' ? '2.5.3' : app + ' 1.3.0', t: d.lastSeen || t - i * 3600e3, rcv: i % 4 === 1 ? '' : rcv(eff), cfg: i % 5 === 2 ? null : { lite: 'auto', liteOn: i % 2 ? 'on' : 'off', preview: 'click', theme: 'cinema', 'o.startScr': 'home', 'o.hw': 'auto', 'p.quality': 'auto' } }; });
        const last = {}, pending = {}; for (const c of RD.cmds) { if (!c.done) pending[c.device_id] = (pending[c.device_id] || 0) + 1; if (!last[c.device_id]) last[c.device_id] = c; }
        return { apps: RD.apps, cat: CAT, cmds: CM, appNames: {}, linked: ['tv', 'ktv', 'lite', 'xc', 'plus', 'nova'], devs, over: RD.over, last, pending };
      }
      const pa = p.match(/^\/admin\/rctl\/app\/(\w+)$/); if (pa && m === 'PUT') { RD.apps[pa[1]] = b.rc || {}; return { ok: true, rc: RD.apps[pa[1]] }; }
      const pd = p.match(/^\/admin\/rctl\/device\/(.+)$/); if (pd && m === 'PUT') { if (Object.keys(b.rc || {}).length) RD.over[pd[1]] = b.rc; else delete RD.over[pd[1]]; return { ok: true, rc: RD.over[pd[1]] || {} }; }
      if (p === '/admin/rctl/cmd' && m === 'POST') { const ids = b.ids || DEMO.devices.filter((d) => !d.parent && (b.app === 'all' || (d.app || 'tv') === b.app)).map((d) => d.id); const t = Date.now(); for (const id of ids) RD.cmds.unshift({ id: RD.seq++, device_id: id, cmd: b.cmd, created: t, sent: 0, done: 0, ok: 0, info: '' }); setTimeout(() => { for (const c of RD.cmds) if (!c.done && t === c.created) { c.sent = Date.now(); c.done = Date.now(); c.ok = 1; c.info = 'demo'; } }, 2500); return { ok: true, queued: ids.length, skipped: 0 }; }
      const pc = p.match(/^\/admin\/rctl\/cmds\/(.+)$/); if (pc && m === 'GET') return { items: RD.cmds.filter((c) => c.device_id === pc[1]).slice(0, 30) };
      if (pc && m === 'DELETE') { RD.cmds = RD.cmds.filter((c) => !(c.device_id === pc[1] && !c.done)); return { ok: true }; }
      return dm(m, p, b);
    };
  }
})();
