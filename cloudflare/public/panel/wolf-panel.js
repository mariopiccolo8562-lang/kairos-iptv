/* KAIROS Control — «Pannello WOLF»: il pannello reseller WOLF collegato a KAIROS.
   Le linee non vengono copiate: questa sezione legge e scrive direttamente su WOLF, quindi una linea creata o
   modificata su WOLF si vede qui e una creata o modificata qui si vede su WOLF. Una linea si può collegare a un
   cliente KAIROS: se cambiano utente o password (da qui o da WOLF) la sua playlist si aggiorna da sola.
   Titolare, e agenti con il permesso «Pannello WOLF» (con il loro account reseller WOLF). Utente e password di WOLF restano cifrati sul server. Usa le funzioni di app.js. */
(() => {
  const css = document.createElement('style');
  css.textContent = `
.wf-st{display:flex;align-items:center;gap:14px;flex-wrap:wrap}.wf-st .cr{font-size:26px;font-weight:800}.wf-st small{display:block;color:var(--mut);font-size:12px}
.wf-f{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.wf-f .inp{margin:0}
.wf-f label{display:flex;flex-direction:column;gap:5px;font-size:11.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--mut)}
.wf-row{display:grid;grid-template-columns:60px minmax(0,1.2fr) minmax(0,1fr) minmax(0,.9fr) minmax(0,1fr) auto;gap:10px;align-items:center;padding:9px 0;border-top:1px solid var(--line);font-size:13px}
.wf-row .k{font-size:11px;color:var(--mut);display:block}.wf-row .mono{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wf-v{display:flex;align-items:center;gap:4px;min-width:0}.wf-v .mono{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wf-v button{flex:none;background:none;border:0;color:var(--mut);cursor:pointer;padding:2px 5px;border-radius:5px;font:inherit;font-size:12px}.wf-v button:hover{color:var(--txt,#fff);background:#ffffff14}
.wf-tag{display:inline-block;font-size:10.5px;font-weight:700;padding:1px 7px;border-radius:5px;background:rgba(52,199,123,.15);color:#6ee3a6;margin-right:4px}
.wf-tag.w{background:rgba(224,164,49,.16);color:#ecc06f}.wf-tag.b{background:rgba(255,107,107,.14);color:#ff8f8f}.wf-tag.g{background:#ffffff12;color:var(--mut)}
.wf-act{display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap}
.wf-tabs{display:flex;gap:6px;margin:14px 0 0}.wf-tabs button{background:#ffffff0d;border:1px solid var(--line);color:var(--mut);padding:7px 14px;border-radius:9px;font:inherit;font-weight:700;font-size:13px;cursor:pointer}.wf-tabs button.on{color:var(--txt,#fff);background:#ffffff1c}
.wf-rs{display:grid;grid-template-columns:minmax(0,1.3fr) 80px 80px minmax(0,1fr) minmax(0,1.1fr) auto;gap:10px;align-items:center;padding:10px 0;border-top:1px solid var(--line);font-size:13px}.wf-rs .k{font-size:11px;color:var(--mut);display:block}.wf-rs .n{font-size:17px;font-weight:800}
@media (max-width:1000px){.wf-rs{grid-template-columns:1fr 1fr 1fr}.wf-rs .wf-act{grid-column:1/-1;justify-content:flex-start}}
@media (max-width:1000px){.wf-f{grid-template-columns:1fr 1fr}.wf-row{grid-template-columns:1fr 1fr}.wf-act{grid-column:1/-1;justify-content:flex-start}}
@media (max-width:560px){.wf-f{grid-template-columns:1fr}}`;
  document.head.appendChild(css);

  const IC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4l4 5 4-3 4 3 4-5v9a8 8 0 0 1-16 0z"/><path d="M9 13h.01M15 13h.01M10 17l2 1 2-1"/></svg>';
  if (!$('.nav[data-v="wolf"]')) {
    const b = document.createElement('button'); b.className = 'nav'; b.dataset.v = 'wolf'; b.innerHTML = IC + 'Pannello WOLF'; b.onclick = () => view('wolf');
    const anchor = $('.nav[data-v="armada"]') || $('.nav[data-v="devices"]'); anchor ? anchor.after(b) : $('#side').appendChild(b);
    const sec = document.createElement('section'); sec.className = 'view'; sec.id = 'v-wolf'; $('#v-dash').after(sec);
  }
  TITLES.wolf = 'Pannello WOLF';

  const W = { cfg: null, data: null, pk: null, err: '', q: '', f: '', own: '', limit: 100, show: new Set(), busy: false, tab: 'lines', rs: null, rsBusy: false, rsErr: '' };
  const isAg = () => D.role === 'agent';
  const DAY = 864e5, fmtD = (t) => (t ? new Date(t).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Illimitata');
  const left = (t) => { if (!t) return ''; const d = Math.ceil((t - Date.now()) / DAY); return d < 0 ? `scaduta da ${-d} g` : d === 0 ? 'scade oggi' : `tra ${d} g`; };
  const copy = (t, w) => navigator.clipboard.writeText(t).then(() => toast(w + ' copiato'), () => toast('Copia non consentita dal browser', 1));
  const gen = (n) => { const a = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'; const r = crypto.getRandomValues(new Uint8Array(n)); return [...r].map((x) => a[x % a.length]).join(''); };
  const devs = () => (Array.isArray(D.devices) ? D.devices : []).filter((d) => d && d.id);
  const devOpts = (sel) => '<option value="">— nessuno —</option>' + devs().map((d) => `<option value="${esc(d.id)}"${d.id === sel ? ' selected' : ''}>${esc(d.name || d.code)}${d.name && d.code ? ' · ' + esc(d.code) : ''}</option>`).join('');
  const pkOpts = () => (W.pk || []).map((p) => `<option value="${esc(p.id)}">${esc(p.name)} · ${p.credits} credit${p.credits === 1 ? 'o' : 'i'}</option>`).join('');
  const m3u = (l) => { const h = (W.data && W.data.dns) || l.dns; return h ? `${h}/get.php?username=${encodeURIComponent(l.username)}&password=${encodeURIComponent(l.password)}&type=m3u_plus&output=ts` : ''; };

  async function loadCfg() { try { W.cfg = await api('GET', '/admin/wolf/config'); W.err = ''; } catch (e) { W.cfg = { set: false }; W.err = e.message; } }
  async function loadLines(fresh) {
    if (!W.cfg || !W.cfg.set) return;
    W.busy = true; render();
    try { W.data = await api('GET', '/admin/wolf/lines' + (fresh ? '?fresh=1' : '')); W.err = ''; if (W.data.synced) toast(`${W.data.synced} playlist aggiornate da WOLF`); }
    catch (e) { W.err = e.message; }
    W.busy = false; show();
  }
  async function loadRs() {
    W.rsBusy = true; render();
    try { W.rs = await api('GET', '/admin/wolf/resellers'); W.rsErr = ''; } catch (e) { W.rsErr = e.message; }
    W.rsBusy = false; render();
  }
  async function loadPk() { if (W.pk) return; try { W.pk = (await api('GET', '/admin/wolf/packages')).packages || []; } catch (e) { W.pk = []; toast(e.message, 1); } }

  function cfgForm(c) {
    if (isAg()) return `<div class="wf-f" style="margin-top:12px">
      <label>Pannello WOLF<input class="inp mono" value="${esc(c.url || '')}" readonly></label>
      <label>Il tuo utente WOLF<input class="inp" id="wfUser" value="${esc(c.user || '')}" autocomplete="off"></label>
      <label>La tua password WOLF<input class="inp" id="wfPass" type="password" autocomplete="new-password" placeholder="${c.set ? 'lascia vuoto per non cambiarla' : ''}"></label></div>
      <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><button class="btn" id="wfSave">${c.set ? 'Salva' : 'Collega il mio account'}</button>${c.set ? '<button class="btn sm ghost" id="wfOff">Scollega</button>' : ''}</div>`;
    return `<div class="wf-f" style="margin-top:12px">
      <label>Indirizzo di WOLF<input class="inp mono" id="wfUrl" value="${esc(c.url || '')}" placeholder="https://pannello.esempio.com"></label>
      <label>Utente<input class="inp" id="wfUser" value="${esc(c.user || '')}" autocomplete="off"></label>
      <label>Password<input class="inp" id="wfPass" type="password" autocomplete="new-password" placeholder="${c.set ? 'lascia vuoto per non cambiarla' : ''}"></label>
      <label>DNS delle linee (facoltativo)<input class="inp mono" id="wfDns" value="${esc(c.dns || '')}" placeholder="si trova da solo, es. http://server.tv"></label></div>
      <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><button class="btn" id="wfSave">${c.set ? 'Salva' : 'Collega WOLF'}</button>${c.set ? '<button class="btn sm ghost" id="wfOff">Scollega WOLF</button>' : ''}</div>`;
  }
  const status = (l) => !l.enabled ? '<span class="wf-tag b">Disattivata</span>' : l.exp && l.exp < Date.now() ? '<span class="wf-tag b">Scaduta</span>' : l.exp && l.exp - Date.now() < 7 * DAY ? '<span class="wf-tag w">In scadenza</span>' : '<span class="wf-tag">Attiva</span>';
  function filtered() {
    const q = W.q.trim().toLowerCase(), now = Date.now();
    return ((W.data && W.data.lines) || []).filter((l) => {
      if (q && !`${l.id} ${l.username} ${l.note} ${l.owner}`.toLowerCase().includes(q)) return false;
      if (W.own && l.owner !== W.own) return false;
      if (W.f === 'on') return l.enabled && (!l.exp || l.exp > now);
      if (W.f === 'exp') return l.exp && l.exp < now + 7 * DAY;
      if (W.f === 'off') return !l.enabled;
      if (W.f === 'link') return linkOf(l.id);
      return true;
    });
  }
  const linkOf = (id) => ((W.data && W.data.links) || []).find((k) => k.line === id);

  function render() {
    const V = $('#v-wolf'); if (!V) return;
    if (!W.cfg) { V.innerHTML = '<div class="card glass"><p class="mut">Carico…</p></div>'; return; }
    if (!W.cfg.set) {
      if (isAg() && !W.cfg.ownerSet) { V.innerHTML = `<div class="card glass"><b style="font-size:15px">Pannello WOLF</b><p class="mut" style="margin:6px 0 0">Chi ti gestisce non ha ancora collegato WOLF a KAIROS.</p>${W.err ? `<p style="color:#ff8f8f">${esc(W.err)}</p>` : ''}</div>`; return; }
      V.innerHTML = `<div class="card glass"><b style="font-size:15px">${isAg() ? 'Collega il tuo account WOLF' : 'Collega il pannello WOLF'}</b>
        <p class="mut" style="margin:6px 0 0">${isAg() ? 'Scrivi utente e password con cui entri su WOLF. Vedrai le tue linee e i tuoi crediti; restano cifrati sul server.' : 'Scrivi indirizzo, utente e password del tuo account WOLF. Restano cifrati sul server e servono a KAIROS per leggere e modificare le linee come fai tu dal browser.'}</p>
        ${W.err ? `<p style="color:#ff8f8f">${esc(W.err)}</p>` : ''}${cfgForm(W.cfg)}</div>`;
      bindCfg(); return;
    }
    const d = W.data || {}, list = filtered(), shown = list.slice(0, W.limit);
    const FL = [['', 'Tutte'], ['on', 'Attive'], ['exp', 'In scadenza / scadute'], ['off', 'Disattivate'], ...(isAg() ? [] : [['link', 'Collegate a clienti']])];
    V.innerHTML = `<div class="card glass"><div class="wf-st"><div style="flex:1;min-width:220px"><b style="font-size:15px">✅ Pannello WOLF collegato</b><small>${esc(W.cfg.url)} · ${esc(W.cfg.user)}</small><small>Quello che fai qui succede subito anche su WOLF, e viceversa.</small></div>
        <div><small>Crediti WOLF</small><span class="cr">${d.credits ?? '—'}</span></div><div><small>Linee</small><span class="cr">${d.lines ? d.lines.length : '—'}</span></div>
        <button class="btn sm" id="wfRe">${W.busy || W.rsBusy ? 'Carico…' : 'Aggiorna'}</button><button class="btn sm" id="wfNew">${W.tab === 'rs' ? '+ Nuovo reseller' : '+ Nuova linea'}</button></div>
        ${W.err ? `<p style="color:#ff8f8f;margin:10px 0 0">${esc(W.err)}</p>` : ''}
        <details style="margin-top:12px"><summary style="cursor:pointer;font-weight:600;font-size:13px">Impostazioni WOLF</summary>${cfgForm(W.cfg)}</details>
        <div class="wf-tabs"><button data-t="lines" class="${W.tab === 'lines' ? 'on' : ''}">Linee${d.lines ? ' · ' + d.lines.length : ''}</button><button data-t="rs" class="${W.tab === 'rs' ? 'on' : ''}">Reseller${W.rs ? ' · ' + W.rs.resellers.length : ''}</button></div></div>
      ${W.tab === 'rs' ? rsHtml() : `<div class="card glass" style="margin-top:14px">
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><input class="inp" id="wfQ" placeholder="Cerca utente, ID o nota" value="${esc(W.q)}" style="max-width:280px;margin:0">
          <select class="inp" id="wfF" style="width:auto;margin:0">${FL.map(([k, t]) => `<option value="${k}"${W.f === k ? ' selected' : ''}>${t}</option>`).join('')}</select>
          <select class="inp" id="wfO" style="width:auto;margin:0"><option value="">Tutti i reseller</option>${owners().map(([o, n]) => `<option value="${esc(o)}"${W.own === o ? ' selected' : ''}>${esc(o)} · ${n}</option>`).join('')}</select>
          <span class="mut" style="font-size:12.5px">${list.length} linee</span></div>
        <div style="margin-top:8px">${!d.lines ? `<p class="mut">${W.busy ? 'Carico le linee da WOLF…' : 'Nessun dato'}</p>` : shown.map((l) => {
          const k = linkOf(l.id), sh = W.show.has(l.id);
          return `<div class="wf-row" data-id="${l.id}"><div><span class="k">ID</span>${l.id}</div>
            <div><span class="k">Utente / password</span><div class="wf-v"><b class="mono">${esc(l.username)}</b><button data-a="cu" title="Copia utente">⧉</button></div><div class="wf-v"><span class="mono">${sh ? esc(l.password) : '••••••'}</span><button data-a="eye" title="${sh ? 'Nascondi' : 'Mostra'} password">${sh ? 'Nascondi' : 'Mostra'}</button><button data-a="cp" title="Copia password">⧉</button></div></div>
            <div><span class="k">Scadenza</span>${fmtD(l.exp)}<br><small class="mut">${left(l.exp)}</small></div>
            <div><span class="k">Stato</span>${status(l)}${l.trial ? '<span class="wf-tag g">Prova</span>' : ''}<br><small class="mut">${l.conns}/${l.max || '?'} conn.</small></div>
            <div><span class="k">Nota / cliente KAIROS</span><div class="mono">${esc(l.note) || '<span class="mut">—</span>'}</div>${k ? `<span class="wf-tag">↔ ${esc(k.name)}</span>` : ''}${l.owner && l.owner !== W.cfg.user ? `<span class="wf-tag g" title="Reseller">${esc(l.owner)}</span>` : ''}</div>
            <div class="wf-act"><button class="btn sm" data-a="edit">Modifica</button><button class="btn sm" data-a="ext">Rinnova</button>${isAg() ? '' : `<button class="btn sm" data-a="link">${k ? 'Cliente' : 'Collega cliente'}</button>`}<button class="btn sm" data-a="m3u">M3U</button><button class="btn sm ghost" data-a="tgl">${l.enabled ? 'Disattiva' : 'Attiva'}</button><button class="btn sm ghost" data-a="del" style="color:#ff8f8f">Elimina</button></div></div>`;
        }).join('')}</div>
        ${list.length > shown.length ? `<div style="margin-top:10px"><button class="btn sm" id="wfMore">Mostra altre ${Math.min(100, list.length - shown.length)}</button></div>` : ''}</div>`}`;
    bindCfg();
    V.querySelectorAll('.wf-tabs [data-t]').forEach((b) => { b.onclick = () => { W.tab = b.dataset.t; render(); if (W.tab === 'rs' && !W.rs && !W.rsBusy) loadRs(); }; });
    $('#wfRe').onclick = () => (W.tab === 'rs' ? loadRs() : loadLines(true));
    $('#wfNew').onclick = W.tab === 'rs' ? newRs : newLine;
    if (W.tab === 'rs') { V.querySelectorAll('.wf-rs [data-a]').forEach((b) => { b.onclick = () => rsAct(b.dataset.a, +b.closest('.wf-rs').dataset.id); }); return; }
    $('#wfO').onchange = (e) => { W.own = e.target.value; W.limit = 100; render(); };
    const q = $('#wfQ'); q.oninput = () => { W.q = q.value; W.limit = 100; const p = q.selectionStart; render(); const n = $('#wfQ'); n.focus(); n.setSelectionRange(p, p); };
    $('#wfF').onchange = (e) => { W.f = e.target.value; W.limit = 100; render(); };
    if ($('#wfMore')) $('#wfMore').onclick = () => { W.limit += 100; render(); };
    V.querySelectorAll('.wf-row [data-a]').forEach((b) => { b.onclick = () => act(b.dataset.a, +b.closest('.wf-row').dataset.id); });
  }
  const owners = () => { const c = new Map(); ((W.data && W.data.lines) || []).forEach((l) => c.set(l.owner, (c.get(l.owner) || 0) + 1)); return [...c.entries()].sort((a, b) => b[1] - a[1]); };
  function rsHtml() {
    const R = W.rs;
    const head = `<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><b style="font-size:15px">Reseller su WOLF</b><span class="mut" style="font-size:12.5px">I tuoi sub-reseller: crediti, linee, ultimo accesso. Quello che cambi qui cambia anche su WOLF.</span></div>`;
    if (!R) return `<div class="card glass" style="margin-top:14px">${head}${W.rsErr ? `<p style="color:#ff8f8f">${esc(W.rsErr)}</p>` : `<p class="mut">${W.rsBusy ? 'Carico i reseller da WOLF…' : ''}</p>`}</div>`;
    const tot = R.resellers.reduce((a, r) => a + r.credits, 0);
    return `<div class="card glass" style="margin-top:14px">${head}
      <p class="mut" style="font-size:12.5px;margin:8px 0 0">${R.resellers.length} reseller · ${tot} crediti in totale presso di loro · ${R.resellers.reduce((a, r) => a + r.lines, 0)} linee</p>
      ${W.rsErr ? `<p style="color:#ff8f8f;margin:8px 0 0">${esc(W.rsErr)}</p>` : ''}
      <div style="margin-top:8px">${R.resellers.length ? R.resellers.map((r) => `<div class="wf-rs" data-id="${r.id}">
        <div><span class="k">ID ${r.id} · ${esc(r.type || 'Reseller')}</span><b class="mono">${esc(r.username)}</b><br>${r.enabled ? '<span class="wf-tag">Attivo</span>' : '<span class="wf-tag b">Disattivato</span>'}${r.canSub ? '<span class="wf-tag g">Crea sub-reseller</span>' : ''}</div>
        <div><span class="k">Crediti</span><span class="n">${r.credits}</span></div>
        <div><span class="k">Linee</span><span class="n">${r.lines}</span>${r.mags || r.enigma ? `<br><small class="mut">${r.mags} MAG · ${r.enigma} Enigma</small>` : ''}</div>
        <div><span class="k">DNS</span><span class="mono">${esc(r.dns) || '—'}</span></div>
        <div><span class="k">Ultimo accesso</span>${esc(r.login) || '—'}<br><small class="mut mono">${esc(r.ip)}</small></div>
        <div class="wf-act"><button class="btn sm" data-a="lines">Linee</button><button class="btn sm" data-a="cr">Crediti</button><button class="btn sm" data-a="edit">Modifica</button><button class="btn sm ghost" data-a="tgl">${r.enabled ? 'Disattiva' : 'Attiva'}</button><button class="btn sm ghost" data-a="del" style="color:#ff8f8f">Elimina</button></div></div>`).join('') : '<p class="mut">Nessun reseller su questo account WOLF.</p>'}</div></div>`;
  }
  async function newRs() {
    const ok = await ask('Nuovo reseller su WOLF', `<div class="wf-f" style="grid-template-columns:1fr 1fr">
      <label>Utente<input class="inp mono" id="wrU"></label><label>Password<input class="inp mono" id="wrP" value="${gen(12)}"></label>
      <label>Email (facoltativa)<input class="inp" id="wrE" type="email"></label><label>DNS (facoltativo)<input class="inp mono" id="wrD" placeholder="quello di WOLF"></label>
      <label style="grid-column:1/-1">Descrizione<input class="inp" id="wrN" maxlength="500"></label></div>
      <p class="mut" style="font-size:12.5px;margin:10px 0 0">Il reseller parte con 0 crediti: dopo puoi dargliene con «Crediti».</p>`, 'Crea reseller');
    if (!ok) return;
    try { await api('POST', '/admin/wolf/resellers', { username: $('#wrU').value, password: $('#wrP').value, email: $('#wrE').value, dns: $('#wrD').value, note: $('#wrN').value }); toast('Reseller creato su WOLF'); await loadRs(); } catch (e) { toast(e.message, 1); }
  }
  async function rsAct(a, id) {
    const r = ((W.rs && W.rs.resellers) || []).find((x) => x.id === id); if (!r) return;
    try {
      if (a === 'lines') { W.tab = 'lines'; W.own = r.username; W.f = ''; W.q = ''; W.limit = 100; render(); if (!W.data) loadLines(); return; }
      if (a === 'cr') {
        const ok = await ask('Crediti a ' + r.username, `<label class="lbl">Quanti crediti</label><input class="inp" id="wcN" type="number" step="1" placeholder="es. 10 per dare, -5 per togliere">
          <label class="lbl" style="margin-top:10px">Motivo (facoltativo)</label><input class="inp" id="wcM" maxlength="300">
          <p class="mut" style="font-size:12.5px;margin:10px 0 0">Crediti attuali di ${esc(r.username)}: <b>${r.credits}</b>. I tuoi crediti: <b>${W.rs.credits ?? '—'}</b>.</p>`, 'Conferma');
        if (!ok) return;
        const res = await api('POST', `/admin/wolf/resellers/${id}/credits`, { credits: $('#wcN').value, message: $('#wcM').value });
        toast(res.message || 'Crediti aggiornati su WOLF'); return loadRs();
      }
      if (a === 'edit') {
        const ok = await ask('Modifica reseller ' + r.username, `<div class="wf-f" style="grid-template-columns:1fr 1fr">
          <label>Email<input class="inp" id="wmE" type="email" placeholder="lascia vuoto per non cambiarla"></label><label>DNS<input class="inp mono" id="wmD" value="${esc(r.dns)}"></label>
          <label style="grid-column:1/-1">Nuova password<input class="inp mono" id="wmP" placeholder="lascia vuoto per non cambiarla" autocomplete="new-password"></label></div>
          <p class="mut" style="font-size:12.5px;margin:10px 0 0">L'utente non si può cambiare (WOLF non lo permette). Descrizione ed email attuali restano se lasci vuoto.</p>`, 'Salva');
        if (!ok) return;
        const body = { dns: $('#wmD').value }; if ($('#wmE').value.trim()) body.email = $('#wmE').value; if ($('#wmP').value) body.password = $('#wmP').value;
        await api('PUT', '/admin/wolf/resellers/' + id, body); toast('Reseller modificato su WOLF'); return loadRs();
      }
      if (a === 'tgl') {
        const ok = await ask((r.enabled ? 'Disattivare ' : 'Attivare ') + r.username + '?', r.enabled
          ? `Il reseller non potrà più entrare su WOLF.<label style="display:flex;gap:8px;align-items:center;margin-top:12px;font-size:13px"><input type="checkbox" id="wtL"> Disattiva anche tutte le sue ${r.lines} linee (i clienti smettono di vedere)</label>`
          : 'Il reseller potrà di nuovo entrare su WOLF.', r.enabled ? 'Disattiva' : 'Attiva');
        if (!ok) return;
        await api('POST', `/admin/wolf/resellers/${id}/toggle`, { lines: !!($('#wtL') && $('#wtL').checked) }); toast(r.enabled ? 'Reseller disattivato' : 'Reseller attivato'); W.data = null; return loadRs();
      }
      if (a === 'del') {
        const ok = await ask('Eliminare ' + r.username + ' da WOLF?', `<p style="margin:0">WOLF cancella il reseller <b>e tutte le sue ${r.lines} linee</b>, per sempre. I clienti di quelle linee smettono di vedere.</p>
          <label class="lbl" style="margin-top:12px">Per confermare scrivi <b class="mono">${esc(r.username)}</b></label><input class="inp mono" id="wdC" autocomplete="off">`, 'Elimina per sempre');
        if (!ok) return;
        await api('POST', `/admin/wolf/resellers/${id}/delete`, { confirm: $('#wdC').value }); toast('Reseller eliminato da WOLF'); W.data = null; return loadRs();
      }
    } catch (e) { toast(e.message, 1); }
  }
  function bindCfg() {
    const s = $('#wfSave'); if (!s) return;
    s.onclick = async () => {
      s.disabled = true;
      try {
        const r = await api('PUT', '/admin/wolf/config', { url: $('#wfUrl') ? $('#wfUrl').value : '', user: $('#wfUser').value, pass: $('#wfPass').value, dns: $('#wfDns') ? $('#wfDns').value : '' });
        toast('WOLF collegato' + (r.dns ? ' · DNS ' + r.dns : '')); W.pk = null; await loadCfg(); await loadLines(true);
      } catch (e) { toast(e.message, 1); s.disabled = false; }
    };
    const o = $('#wfOff');
    if (o) o.onclick = async () => {
      if (!(await ask('Scollegare WOLF?', isAg() ? 'KAIROS dimentica il tuo utente e la password di WOLF. Le tue linee su WOLF restano come sono.' : 'KAIROS dimentica utente e password di WOLF. Le linee su WOLF e le playlist dei clienti restano come sono.', 'Scollega'))) return;
      try { await api('DELETE', '/admin/wolf/config'); W.data = null; await loadCfg(); render(); toast('WOLF scollegato'); } catch (e) { toast(e.message, 1); }
    };
  }

  async function newLine() {
    await loadPk();
    if (!W.pk.length) return toast('Non trovo i pacchetti su WOLF', 1);
    const ok = await ask('Nuova linea su WOLF', `<div class="wf-f" style="grid-template-columns:1fr 1fr">
      <label>Utente<input class="inp mono" id="wnU" value="${gen(10)}"></label><label>Password<input class="inp mono" id="wnP" value="${gen(10)}"></label>
      <label style="grid-column:1/-1">Pacchetto (usa crediti WOLF)<select class="inp" id="wnK">${pkOpts()}</select></label>
      <label style="grid-column:1/-1">Nota<input class="inp" id="wnN" maxlength="300"></label>
      ${isAg() ? '' : `<label style="grid-column:1/-1">Collega a un cliente KAIROS (facoltativo)<select class="inp" id="wnD">${devOpts('')}</select></label>`}</div>
      <p class="mut" style="font-size:12.5px;margin:10px 0 0">Crediti WOLF disponibili: <b>${(W.data && W.data.credits) ?? '—'}</b>. La linea compare subito anche su WOLF.</p>`, 'Crea linea');
    if (!ok) return;
    const body = { username: $('#wnU').value, password: $('#wnP').value, package: $('#wnK').value, note: $('#wnN').value, deviceId: $('#wnD') ? $('#wnD').value : '' };
    try { await api('POST', '/admin/wolf/lines', body); toast('Linea creata su WOLF'); await loadLines(true); } catch (e) { toast(e.message, 1); }
  }

  async function act(a, id) {
    const l = ((W.data && W.data.lines) || []).find((x) => x.id === id); if (!l) return;
    try {
      if (a === 'eye') { W.show.has(id) ? W.show.delete(id) : W.show.add(id); return render(); }
      if (a === 'cu') return copy(l.username, 'Utente');
      if (a === 'cp') return copy(l.password, 'Password');
      if (a === 'm3u') { const u = m3u(l); return u ? copy(u, 'Link M3U') : toast('Imposta il DNS in «Impostazioni WOLF»', 1); }
      if (a === 'edit') {
        const ok = await ask('Modifica linea ' + l.username, `<div class="wf-f" style="grid-template-columns:1fr 1fr">
          <label>Utente<input class="inp mono" id="weU" value="${esc(l.username)}"></label><label>Password<input class="inp mono" id="weP" value="${esc(l.password)}"></label>
          <label style="grid-column:1/-1">Nota<input class="inp" id="weN" maxlength="300" value="${esc(l.note)}"></label></div>
          <p class="mut" style="font-size:12.5px;margin:10px 0 0">La modifica vale subito anche su WOLF${linkOf(id) ? ' e nella playlist del cliente collegato' : ''}.</p>`, 'Salva');
        if (!ok) return;
        const r = await api('PUT', '/admin/wolf/lines/' + id, { username: $('#weU').value, password: $('#weP').value, note: $('#weN').value });
        toast('Linea modificata su WOLF' + (r.synced ? ' · playlist del cliente aggiornata' : '')); return loadLines(true);
      }
      if (a === 'ext') {
        await loadPk();
        const ok = await ask('Rinnova ' + l.username, `<label class="lbl">Pacchetto (usa crediti WOLF)</label><select class="inp" id="wxK">${pkOpts()}</select>
          <p class="mut" style="font-size:12.5px;margin:10px 0 0">Scadenza attuale: <b>${fmtD(l.exp)}</b>. Crediti disponibili: <b>${(W.data && W.data.credits) ?? '—'}</b>.</p>`, 'Rinnova');
        if (!ok) return;
        await api('POST', `/admin/wolf/lines/${id}/extend`, { package: $('#wxK').value }); toast('Linea rinnovata su WOLF'); return loadLines(true);
      }
      if (a === 'link') {
        const k = linkOf(id);
        const ok = await ask('Cliente KAIROS della linea ' + l.username, `<label class="lbl">Cliente</label><select class="inp" id="wlD">${devOpts(k ? k.device : '')}</select>
          <p class="mut" style="font-size:12.5px;margin:10px 0 0">Se il cliente non ha ancora questa linea, gli viene aggiunta come playlist. Quando cambi utente o password (qui o su WOLF) la sua playlist si aggiorna da sola.</p>`, 'Salva');
        if (!ok) return;
        const dv = $('#wlD').value;
        if (!dv) { if (k) { await api('DELETE', '/admin/wolf/links/' + id); toast('Collegamento tolto'); } return loadLines(); }
        const r = await api('POST', '/admin/wolf/links', { line: id, device: dv }); toast(`Collegata a ${r.name}` + (r.added ? ' · playlist aggiunta' : '')); return loadLines();
      }
      if (a === 'tgl') {
        if (!(await ask((l.enabled ? 'Disattivare ' : 'Attivare ') + l.username + '?', `La linea viene ${l.enabled ? 'disattivata' : 'attivata'} anche su WOLF.`, l.enabled ? 'Disattiva' : 'Attiva'))) return;
        await api('POST', `/admin/wolf/lines/${id}/toggle`); toast(l.enabled ? 'Linea disattivata' : 'Linea attivata'); return loadLines(true);
      }
      if (a === 'del') {
        if (!(await ask('Eliminare ' + l.username + ' da WOLF?', 'La linea viene cancellata da WOLF per sempre e i crediti non tornano indietro. Le playlist dei clienti non vengono toccate.', 'Elimina'))) return;
        await api('DELETE', '/admin/wolf/lines/' + id); toast('Linea eliminata da WOLF'); return loadLines(true);
      }
    } catch (e) { toast(e.message, 1); }
  }

  function show() {
    try { render(); } catch (e) { const V = $('#v-wolf'); if (V) V.innerHTML = `<div class="card glass"><p style="color:#ff8f8f">Errore nella sezione WOLF: ${esc(e.message || String(e))}</p></div>`; }
  }
  function open() {
    show();
    (W.cfg ? Promise.resolve() : loadCfg()).then(() => { show(); if (W.cfg.set && !W.data) loadLines(); });
  }
  const v0 = view;
  window.view = view = function (v) { const r = v0.apply(this, arguments); if (v === 'wolf') open(); return r; };
  /* qualunque menu apra la sezione (anche quelli caricati dopo), la si riempie quando diventa visibile */
  const sec = $('#v-wolf');
  if (sec) new MutationObserver(() => { if (sec.classList.contains('on') && !sec.innerHTML.trim()) open(); }).observe(sec, { attributes: true, attributeFilter: ['class'] });
})();
