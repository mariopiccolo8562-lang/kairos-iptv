/* KAIROS Control — «Pannello Atlantix» (cms.axdash.biz): linee, sub-reseller e connessioni del tuo account Atlantix.
   KAIROS entra con utente, password e codice di accesso (salvati cifrati) e legge/scrive direttamente su Atlantix.
   Solo il titolare (Master). Usa app.js. */
(() => {
  const IC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 18H4z"/><path d="M8.5 14h7"/></svg>';
  if (!$('.nav[data-v="atx"]')) {
    const b = document.createElement('button'); b.className = 'nav'; b.dataset.v = 'atx'; b.innerHTML = IC + 'Pannello Atlantix'; b.onclick = () => view('atx');
    const anchor = $('.nav[data-v="ora"]') || $('.nav[data-v="oxp"]') || $('.nav[data-v="wolf"]'); anchor ? anchor.after(b) : $('#side').appendChild(b);
    const sec = document.createElement('section'); sec.className = 'view'; sec.id = 'v-atx'; $('#v-dash').after(sec);
  }
  TITLES.atx = 'Pannello Atlantix';
  const isAg = () => D.role === 'agent';
  const TABS = [['lines', 'Linee'], ['subs', 'Sub-reseller'], ['conns', 'Connessioni'], ['overview', 'Panoramica']];
  const A = { st: null, tab: 'lines', page: 1, q: '', status: '', reseller: '', sort: '', days: 0, resellers: [], data: null, err: '', busy: false, edit: false };
  const now = () => Math.floor(Date.now() / 1000);
  const day = (t) => { const n = Number(t); if (!n) return 'Illimitato'; const d = new Date(n > 1e11 ? n : n * 1000); return isNaN(d) ? esc(String(t)) : d.toLocaleDateString('it-IT'); };
  const dur = (s) => { s = Number(s) || 0; const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h} h ${m} min` : `${m} min`; };
  const on = (v) => v === true || v === 1 || v === '1' || /^(active|enabled|attivo|on)$/i.test(String(v || ''));
  const badge = (t, c) => `<span style="display:inline-block;padding:2px 9px;border-radius:999px;font-size:12px;font-weight:600;background:${c}22;color:${c};white-space:nowrap">${t}</span>`;
  const lineState = (r) => { if (Number(r.enabled) === 0) return badge('Disattivata', '#9aa4b2'); const e = Number(r.exp_date); if (e && e < now()) return badge('Scaduta', '#ff6b6b'); if (e && e <= now() + 7 * 86400) return badge('In scadenza', '#ffb020'); if (Number(r.is_trial) === 1) return badge('Prova', '#7aa7ff'); return badge('Attiva', '#2ecc71'); };
  const mut = '<span class="mut">—</span>';
  const copy = (v, what) => navigator.clipboard.writeText(String(v)).then(() => toast(what + ' copiato'), () => toast('Copia non riuscita', 1));
  const m3u = (r) => { let d = String(r.reseller_dns || '').trim().replace(/\/+$/, ''); if (!d) return ''; if (!/^https?:\/\//i.test(d)) d = 'http://' + d; return `${d}/get.php?username=${encodeURIComponent(r.username)}&password=${encodeURIComponent(r.password)}&type=m3u_plus&output=ts`; };
  const TH = 'text-align:left;padding:9px 8px;border-bottom:1px solid var(--line,#333);white-space:nowrap;font-size:12px;text-transform:uppercase;letter-spacing:.04em;opacity:.75';
  const TD = 'padding:9px 8px;border-bottom:1px solid var(--line,#222);vertical-align:middle';
  const grid = (heads, rows) => `<div style="overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:13.5px"><thead><tr>${heads.map((h) => `<th style="${TH}">${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
  const tr = (cells) => `<tr>${cells.map((c) => `<td style="${TD}">${c}</td>`).join('')}</tr>`;
  const btn = (a, i, t, extra = '') => `<button class="btn sm" data-a="${a}" data-i="${i}" ${extra}>${t}</button>`;
  const rowsOf = (d) => (Array.isArray(d) ? d : d && typeof d === 'object' ? (['rows', 'items', 'lines', 'users', 'connections', 'list', 'data'].map((k) => d[k]).find(Array.isArray) || []) : []);

  function linesHtml(rows) {
    if (!rows.length) return '<p class="mut" style="margin:14px 0">Nessuna linea trovata.</p>';
    return grid(['Utente', 'Password', 'Stato', 'Scadenza', 'Connessi', 'Canale / IP', 'Reseller', 'Note', 'Azioni'], rows.map((r, i) => tr([
      `<b>${esc(r.username || '')}</b> <button class="btn sm" data-a="cu" data-i="${i}" title="Copia utente" style="padding:2px 7px;font-size:11px">Copia</button><div class="mut" style="font-size:11.5px">#${esc(String(r.id))}${Number(r.auto_renew) ? ' · auto-rinnovo' : ''}</div>`,
      `<code>${esc(r.password || '')}</code> <button class="btn sm" data-a="cp" data-i="${i}" title="Copia password" style="padding:2px 7px;font-size:11px">Copia</button>`,
      lineState(r),
      `<b>${day(r.exp_date)}</b>`,
      Number(r.online) > 0 ? `<button class="btn sm" data-a="lc" data-i="${i}" title="Vedi chi è connesso">🟢 ${Number(r.online)}/${Number(r.max_connections || 0)}</button>` : `<span class="mut">${Number(r.online) || 0}/${Number(r.max_connections || 0)}</span>`,
      r.channel || r.ip ? `${r.channel ? `<b>${esc(r.channel)}</b>` : ''}<div class="mut" style="font-size:11.5px">${esc([r.country, r.ip].filter(Boolean).join(' · '))}</div>` : mut,
      r.reseller ? esc(r.reseller) : mut,
      `<button class="btn sm" data-a="note" data-i="${i}" style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.notes ? esc(r.notes) : '+ nota'}</button>`,
      `<div style="display:flex;gap:5px;flex-wrap:wrap;min-width:330px">${btn('edit', i, 'Modifica')}${btn('renew', i, 'Rinnova')}${Number(r.enabled) === 0 ? btn('on', i, 'Attiva') : btn('off', i, 'Disattiva')}${m3u(r) ? btn('m3u', i, 'M3U') : ''}${window.KXMxpNew ? btn('mxp', i, 'MaxPlayer') : ''}${window.KXOxpNew ? btn('oxp', i, 'OrbixPlay') : ''}${window.KXOrcpNew ? btn('orcp', i, KXOrcpName()) : ''}${btn('del', i, 'Elimina', 'style="color:#ff8f8f"')}</div>`
    ])));
  }
  function subsHtml(rows) {
    if (!rows.length) return '<p class="mut" style="margin:14px 0">Nessun sub-reseller.</p>';
    return grid(['Reseller', 'Sopra di lui', 'Crediti', 'Stato', 'Linee attive', 'DNS', 'Crea sub', 'Ultimo accesso', 'Azioni'], rows.map((r, i) => tr([
      `<b>${esc(r.username || '')}</b><div class="mut" style="font-size:11.5px">#${esc(String(r.id))}${r.notes ? ' · ' + esc(r.notes) : ''}</div>`,
      r.owner_username ? esc(r.owner_username) : mut,
      `<b>${esc(String(r.credits ?? 0))}</b>`,
      on(r.status) ? badge('Attivo', '#2ecc71') : badge('Disattivato', '#9aa4b2'),
      `${Number(r.iptv_active || 0)} / ${Number(r.iptv_total || 0)}`,
      r.reseller_dns ? `<code style="font-size:12px">${esc(r.reseller_dns)}</code>` : mut,
      on(r.can_create_sub) ? 'sì' : 'no',
      r.last_login ? esc(String(r.last_login)) : mut,
      `<div style="display:flex;gap:5px;flex-wrap:wrap;min-width:330px">${btn('cr', i, '± Crediti')}${on(r.status) ? btn('sdis', i, 'Disattiva') : btn('sen', i, 'Riattiva')}${btn('uoff', i, 'Blocca linee')}${btn('uon', i, 'Sblocca linee')}${on(r.can_create_sub) ? btn('poff', i, 'Togli crea sub') : btn('pon', i, 'Permetti sub')}${btn('sdel', i, 'Elimina', 'style="color:#ff8f8f"')}</div>`
    ])));
  }
  function connsHtml(rows) {
    if (!rows.length) return '<p class="mut" style="margin:14px 0">Nessuno collegato in questo momento.</p>';
    return grid(['Utente', 'Canale', 'IP', 'Luogo', 'Provider', 'Reseller', 'Da', 'Dispositivo', ''], rows.map((c, i) => tr([
      `<b>${esc(c.username || '')}</b>`, c.channel ? esc(c.channel) : mut, esc(c.user_ip || c.ip || ''), esc([c.city, c.geoip_country_code].filter(Boolean).join(', ')) || mut,
      c.isp ? esc(c.isp) : mut, c.owner_username ? esc(c.owner_username) : mut, dur(c.total_seconds),
      `<span class="mut" style="font-size:11.5px">${esc(String(c.user_agent || '').slice(0, 40))}</span>`, c.activity_id ? btn('kill', i, 'Disconnetti') : ''
    ])));
  }
  function overviewHtml(d) {
    const mem = d.member || {}, st = d.stats || {};
    const LBL = { total: 'Linee totali', active: 'Attive', expired: 'Scadute', expiring: 'In scadenza', online: 'Collegati ora', trial: 'Prove', disabled: 'Disattivate', subresellers: 'Sub-reseller' };
    const card = (n, v) => `<div class="card glass" style="padding:14px 16px;min-width:150px"><div class="mut" style="font-size:12px">${esc(n)}</div><div style="font-size:24px;font-weight:700;margin-top:4px">${esc(String(v))}</div></div>`;
    const CL = { total: 'dark', active: 'red', expired: 'dark', expiring: 'dark', online: 'blue', trial: 'dark', disabled: 'dark', subresellers: 'dark' };
    const T = [{ label: 'Crediti disponibili', v: mem.unlimited ? '∞' : Math.trunc(Number(mem.credits || 0)), c: 'green' }, ...Object.entries(st).filter(([, v]) => typeof v !== 'object').map(([k, v]) => ({ label: LBL[k] || k.replace(/_/g, ' '), v: esc(String(v)), c: CL[k] || 'dark' }))];
    return window.KXStats ? KXStats.strip(T, { margin: '10px 0 0' }) : `<div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:10px">${T.map((t) => card(t.label, t.v)).join('')}</div>`;
  }
  function body() {
    if (A.busy) return '<p class="mut" style="margin:14px 0">Carico da Atlantix…</p>';
    if (A.err) return `<p style="color:#ff8f8f;margin:14px 0">${esc(A.err)}</p>`;
    if (A.data == null) return '';
    if (A.tab === 'overview') return overviewHtml(A.data);
    const rows = rowsOf(A.data), pages = +A.data.pages || 0, total = A.data.total != null ? +A.data.total : rows.length;
    const sum = A.tab === 'lines' && A.data.summary ? Object.entries(A.data.summary).map(([k, v]) => `<span class="mut">${esc(({ total: 'totali', active: 'attive', expired: 'scadute', expiring: 'in scadenza', online: 'online', disabled: 'disattivate', trial: 'prove' })[k] || k)}: <b>${esc(String(v))}</b></span>`).join(' · ') : '';
    const pager = A.tab === 'conns' ? '' : `<div style="display:flex;gap:8px;margin-top:12px;align-items:center">${A.page > 1 ? '<button class="btn sm" data-o="prev">← Indietro</button>' : ''}${pages ? `<span class="mut" style="font-size:12.5px">pagina ${A.page} di ${pages}</span>` : ''}${(pages ? A.page < pages : rows.length >= 50) ? '<button class="btn sm" data-o="next">Avanti →</button>' : ''}</div>`;
    return `<p style="font-size:12.5px;margin:10px 0">${total} ${A.tab === 'lines' ? 'linee' : A.tab === 'subs' ? 'sub-reseller' : 'collegati'}${sum ? ' · ' + sum : ''}</p>${A.tab === 'lines' ? linesHtml(rows) : A.tab === 'subs' ? subsHtml(rows) : connsHtml(rows)}${pager}`;
  }
  function toolbar() {
    if (A.tab === 'overview' || A.tab === 'conns') return '';
    const st = A.tab === 'lines' ? `<select class="inp" id="axS" style="max-width:160px">${[['', 'Tutti gli stati'], ['active', 'Attive'], ['expiring', 'In scadenza'], ['expired', 'Scadute'], ['disabled', 'Disattivate'], ['trial', 'Prove'], ['online', 'Online']].map(([v, t]) => `<option value="${v}"${A.status === v ? ' selected' : ''}>${t}</option>`).join('')}</select>` : '';
    const rs = A.tab === 'lines' && A.resellers.length ? `<select class="inp" id="axR" style="max-width:180px"><option value="">Tutti i reseller</option>${A.resellers.map((r) => `<option value="${esc(String(r.id))}"${String(A.reseller) === String(r.id) ? ' selected' : ''}>${esc(r.username || '#' + r.id)}</option>`).join('')}</select>` : '';
    return `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-left:auto">${st}${rs}${A.tab === 'lines' && window.KXSort ? KXSort.ui(A, 'ax') : ''}<input class="inp" id="axQ" placeholder="Cerca utente…" value="${esc(A.q)}" style="max-width:200px">${A.tab === 'lines' ? '<button class="btn pri sm" data-o="new">+ Nuova linea</button>' + (window.KXQuick ? KXQuick.button('atx') : '') : ''}</div>`;
  }
  function render() {
    const V = $('#v-atx'); if (!V) return;
    if (isAg()) { V.innerHTML = '<div class="card glass"><p>Il Pannello Atlantix lo usa solo il Master.</p></div>'; return; }
    const st = A.st || {}, form = !st.connected || A.edit;
    V.innerHTML = `<div class="card glass" style="margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;gap:14px;flex-wrap:wrap;align-items:flex-start">
        <div><b style="font-size:16px">${st.connected ? '✅ Atlantix collegato' : 'Atlantix non collegato'}</b>
          <p class="mut" style="margin:4px 0 0;font-size:13px">${st.connected ? 'Account ' + esc(st.user || '') : 'Scrivi qui i dati con cui entri su cms.axdash.biz: restano cifrati in KAIROS.'}</p></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><a class="btn sm" href="https://cms.axdash.biz/login" target="_blank" rel="noopener" style="color:inherit;text-decoration:none">Apri Atlantix</a>${st.connected ? `<button class="btn sm" data-o="reload">Aggiorna</button><button class="btn sm" data-o="edit">${A.edit ? 'Chiudi' : 'Cambia dati'}</button><button class="btn sm" data-o="off">Scollega</button>` : ''}</div>
      </div>
      ${form ? `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-top:14px">
        <label>Username<input class="inp" id="axU" autocomplete="off" value="${esc(st.user || '')}"></label>
        <label>Password<input class="inp" id="axP" type="password" autocomplete="new-password" placeholder="${st.connected ? 'lascia vuoto per non cambiarla' : ''}"></label>
        <label>Codice di accesso<input class="inp" id="axC" type="password" autocomplete="new-password" placeholder="${st.connected ? 'lascia vuoto per non cambiarlo' : ''}"></label>
        <label>Codice 2FA (solo se Atlantix lo chiede)<input class="inp" id="axO" inputmode="numeric" maxlength="6" placeholder="000000"></label></div>
        <button class="btn pri" data-o="save" style="margin-top:12px">Collega Atlantix</button>` : ''}</div>
      ${st.connected ? `<div class="card glass"><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:6px">${TABS.map(([k, n]) => `<button class="btn sm${A.tab === k ? ' pri' : ''}" data-t="${k}">${n}</button>`).join('')}${toolbar()}</div>${body()}</div>` : ''}`;
    $$('[data-t]', V).forEach((b) => (b.onclick = () => { A.tab = b.dataset.t; A.page = 1; A.q = ''; A.status = ''; A.reseller = ''; A.days = 0; load(); }));
    $$('[data-o]', V).forEach((b) => (b.onclick = () => op(b.dataset.o)));
    $$('[data-a]', V).forEach((b) => (b.onclick = () => act(b.dataset.a, rowsOf(A.data)[+b.dataset.i])));
    const q = $('#axQ'); if (q) q.onkeydown = (e) => { if (e.key === 'Enter') { A.q = q.value.trim(); A.page = 1; load(); } };
    const s = $('#axS'); if (s) s.onchange = () => { A.status = s.value; A.page = 1; load(); };
    const r = $('#axR'); if (r) r.onchange = () => { A.reseller = r.value; A.page = 1; load(); };
    if (window.KXSort) KXSort.bind(V, A, 'ax', () => { A.page = 1; load(); });
  }
  async function newLine() {
    toast('Carico il modulo di Atlantix…');
    const { fields } = await api('GET', '/admin/atx/createform');
    const inp = (f, i) => {
      const id = 'axF' + i, req = f.required ? ' *' : '';
      if (f.type === 'select') return `<label>${esc(f.label)}${req}<select class="inp" id="${id}">${f.options.map((o) => `<option value="${esc(o.v)}"${o.sel ? ' selected' : ''}>${esc(o.t)}</option>`).join('')}</select></label>`;
      if (f.type === 'checkbox' || f.type === 'radio') return `<label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="${id}"${f.checked ? ' checked' : ''}> ${esc(f.label)}</label>`;
      if (f.type === 'textarea') return `<label>${esc(f.label)}${req}<textarea class="inp" id="${id}" rows="2">${esc(f.value || '')}</textarea></label>`;
      return `<label>${esc(f.label)}${req}<input class="inp" id="${id}" type="${f.type === 'number' ? 'number' : 'text'}" value="${esc(f.value || '')}" placeholder="${esc(f.ph || '')}"${f.min ? ` min="${esc(f.min)}"` : ''}${f.max ? ` max="${esc(f.max)}"` : ''}></label>`;
    };
    if (!(await ask('Nuova linea Atlantix', `<p class="mut" style="font-size:13px">Sono le stesse opzioni del modulo «Crea linea» di Atlantix. La creazione usa i tuoi crediti Atlantix.</p><div style="display:grid;gap:10px">${fields.map(inp).join('')}</div>`, 'Crea linea'))) return;
    const vals = {};
    fields.forEach((f, i) => { const el = $('#axF' + i); if (!el) return; vals[f.name] = f.type === 'checkbox' || f.type === 'radio' ? el.checked : el.value; });
    const miss = fields.find((f) => f.required && f.type !== 'checkbox' && !String(vals[f.name] || '').trim());
    if (miss) return toast('Compila «' + miss.label + '»', 1);
    const r = await api('POST', '/admin/atx/lines/create', { fields: vals });
    await ask('Linea creata', `<p>Utente: <b>${esc(r.username)}</b><br>Password: <b>${esc(r.password)}</b></p>`, 'OK');
    A.page = 1; return load();
  }
  async function op(o) {
    try {
      if (o === 'prev') { A.page--; return load(); } if (o === 'next') { A.page++; return load(); }
      if (o === 'new') return await newLine();
      if (o === 'reload') { A.st = null; A.data = null; A.err = ''; return open(); }
      if (o === 'edit') { A.edit = !A.edit; return show(); }
      if (o === 'off') { if (!(await ask('Scollegare Atlantix?', 'KAIROS dimentica utente, password e codice di Atlantix. Su Atlantix non cambia niente.', 'Scollega'))) return; await api('DELETE', '/admin/atx/config'); A.st = null; A.data = null; return open(); }
      if (o === 'save') {
        const b = { user: $('#axU').value.trim(), pass: $('#axP').value, code: $('#axC').value.trim(), otp: $('#axO').value.trim() };
        if (!b.user || (!b.pass && !(A.st || {}).connected)) return toast('Scrivi utente e password di Atlantix', 1);
        toast('Entro su Atlantix…'); await api('PUT', '/admin/atx/config', b); toast('Atlantix collegato'); A.edit = false; A.st = null; A.data = null; A.err = ''; return open();
      }
    } catch (e) { toast(e.message, 1); }
  }
  const lineAct = (body, msg) => api('POST', '/admin/atx/lines/action', body).then(() => { toast(msg); return load(); });
  const subAct = (body, msg) => api('POST', '/admin/atx/subs/action', body).then(() => { toast(msg); return load(); });
  async function act(a, r) {
    if (!r) return;
    const u = r.username || '#' + (r.id || ''), U = esc(u);
    try {
      if (a === 'cu') return copy(r.username, 'Utente');
      if (a === 'cp') return copy(r.password, 'Password');
      if (a === 'm3u') return copy(m3u(r), 'Link M3U');
      if (a === 'orcp') return KXOrcpNew({ user: r.username, pass: r.password, name: r.username, note: 'Atlantix #' + r.id, panel: 'atx' });
      if (a === 'mxp' || a === 'oxp') { const pre = { user: r.username, pass: r.password, name: r.username, note: 'Atlantix #' + r.id }; return a === 'mxp' ? KXMxpNew(pre) : KXOxpNew(pre); }
      if (a === 'lc') { const d = await api('GET', '/admin/atx/line/conns?id=' + r.id); const c = rowsOf(d); return ask('Connessi su ' + u, c.length ? c.map((x) => `<p style="margin:6px 0"><b>${esc(x.channel || 'canale ?')}</b><br><span class="mut" style="font-size:12.5px">${esc([x.user_ip || x.ip, x.city, x.geoip_country_code, x.isp].filter(Boolean).join(' · '))}</span></p>`).join('') : '<p class="mut">Nessuna connessione adesso.</p>', 'OK'); }
      if (a === 'renew') {
        if (!(await ask('Rinnovare ' + u + '?', `<p>Scade il <b>${day(r.exp_date)}</b>. Il rinnovo usa i crediti del tuo account Atlantix.</p><label>Durata<select class="inp" id="axM">${[1, 2, 3, 6, 12].map((n) => `<option value="${n}"${n === 12 ? ' selected' : ''}>${n} ${n === 1 ? 'mese' : 'mesi'}</option>`).join('')}</select></label><label style="display:block;margin-top:10px">Nota (nome del cliente, telefono…)<textarea class="inp" id="axRN" rows="2" maxlength="300" placeholder="es. Mario Rossi · 333 1234567">${esc(r.notes || '')}</textarea></label>`, 'Rinnova'))) return;
        const months = +$('#axM').value, notes = $('#axRN').value.trim();
        await api('POST', '/admin/atx/lines/action', { action: 'renew', user_id: r.id, months });
        if (notes !== String(r.notes || '').trim()) await api('POST', '/admin/atx/lines/action', { action: 'save_notes', user_id: r.id, notes }).catch((e) => toast('Rinnovata, ma la nota non è stata salvata: ' + e.message, 1));
        toast(`${u} rinnovata di ${months} ${months === 1 ? 'mese' : 'mesi'}`); return load();
      }
      if (a === 'on' || a === 'off') { const en = a === 'on'; if (!(await ask((en ? 'Attivare ' : 'Disattivare ') + u + '?', `La linea ${U} viene ${en ? 'attivata' : 'disattivata'} subito su Atlantix.`, en ? 'Attiva' : 'Disattiva'))) return; return await lineAct({ action: 'toggle', user_id: r.id, enabled: en }, `${u} ${en ? 'attivata' : 'disattivata'}`); }
      if (a === 'edit') {
        if (!(await ask('Modifica ' + u, `<p class="mut" style="font-size:12.5px;margin:0 0 8px">Utente <b class="mono">${esc(r.username || '')}</b> · password <b class="mono">${esc(r.password || '—')}</b>. Atlantix non permette di cambiarli dal pannello reseller: puoi modificare la nota.</p><label>Nota (nome del cliente, telefono…)<textarea class="inp" id="axN" rows="3" maxlength="300">${esc(r.notes || '')}</textarea></label>`, 'Salva'))) return;
        return await lineAct({ action: 'save_notes', user_id: r.id, notes: $('#axN').value }, `${u} modificata`);
      }
      if (a === 'note') { if (!(await ask('Nota di ' + u, `<textarea class="inp" id="axN" rows="3" maxlength="300">${esc(r.notes || '')}</textarea>`, 'Salva'))) return; return await lineAct({ action: 'save_notes', user_id: r.id, notes: $('#axN').value }, 'Nota salvata'); }
      if (a === 'del') { if (!(await ask('Eliminare ' + u + '?', `<p>La linea <b>${U}</b> viene <b>eliminata definitivamente</b> da Atlantix. Non si può annullare.</p>`, 'Elimina'))) return; return await lineAct({ action: 'delete', user_id: r.id }, `${u} eliminata`); }
      if (a === 'kill') { if (!(await ask('Disconnettere ' + u + '?', `Chiude la connessione su ${esc(r.channel || 'questo canale')}.`, 'Disconnetti'))) return; await api('POST', '/admin/atx/conns/kill', { activity_id: r.activity_id }); toast('Disconnesso'); return load(); }
      if (a === 'cr') {
        if (!(await ask('Crediti di ' + u, `<p>Ha <b>${esc(String(r.credits ?? 0))}</b> crediti. Scrivi quanti aggiungere (es. 10) o togliere (es. -10).</p><label>Crediti<input class="inp" id="axA" type="number" step="1"></label><label>Motivo (facoltativo)<input class="inp" id="axW" maxlength="200"></label>`, 'Conferma'))) return;
        const amount = Math.trunc(+$('#axA').value || 0); if (!amount) return toast('Scrivi un numero diverso da zero', 1);
        return await subAct({ op: 'credits', id: r.id, amount, reason: $('#axW').value.trim() }, amount > 0 ? `+${amount} crediti a ${u}` : `${amount} crediti a ${u}`);
      }
      const SUB = { sen: ['enable', 'Riattivare il reseller ' + U + '?', 'Riattiva', 'Reseller riattivato'], sdis: ['disable', 'Disattivare il reseller ' + U + '? Non potrà più entrare su Atlantix.', 'Disattiva', 'Reseller disattivato'], uon: ['users_on', 'Riattivare tutte le linee IPTV di ' + U + '?', 'Sblocca linee', 'Linee riattivate'], uoff: ['users_off', 'Disattivare tutte le linee IPTV di ' + U + '? I suoi clienti smettono di vedere.', 'Blocca linee', 'Linee bloccate'], pon: ['sub_on', 'Permettere a ' + U + ' di creare sub-reseller?', 'Permetti', 'Permesso dato'], poff: ['sub_off', 'Togliere a ' + U + ' il permesso di creare sub-reseller?', 'Togli', 'Permesso tolto'], sdel: ['delete', `<p>Il reseller <b>${U}</b> viene <b>eliminato definitivamente</b> da Atlantix. Non si può annullare.</p>`, 'Elimina', 'Reseller eliminato'] };
      if (SUB[a]) { const [opn, txt, yes, ok] = SUB[a]; if (!(await ask(yes + ' · ' + u, txt, yes))) return; return await subAct({ op: opn, id: r.id }, ok); }
    } catch (e) { toast(e.message, 1); }
  }
  async function load() {
    A.busy = true; A.err = ''; show();
    try {
      const sorting = A.tab === 'lines' && window.KXSort && (A.sort || +A.days > 0);
      const p = new URLSearchParams({ page: sorting ? 1 : A.page, q: A.q, status: A.status, reseller: A.reseller, ...(sorting ? { all: 1 } : {}) });
      A.data = await api('GET', `/admin/atx/${A.tab}?${p}`);
      if (sorting && A.data) { // ordino/filtro dentro i dati, così gli indici dei pulsanti restano quelli giusti
        const key = ['rows', 'items', 'lines', 'users', 'list', 'data'].find((k) => Array.isArray(A.data[k]));
        if (key) { A.data[key] = KXSort.apply(A.data[key], A, { exp: (r) => { const v = r.exp_date ?? r.exp; if (v == null || v === '') return 0; const n = Number(v); if (!isNaN(n)) return n > 1e12 ? n : n * 1000; const t = Date.parse(String(v).replace(' ', 'T')); return isNaN(t) ? 0 : t; }, name: (r) => r.username, enabled: (r) => !!+r.enabled, conns: (r) => +r.online || 0, owner: (r) => r.reseller, created: (r) => Date.parse(String(r.created_at || r.created || '').replace(' ', 'T')) || 0 }); A.data.total = A.data[key].length; }
      }
      if (A.tab === 'lines' && Array.isArray(A.data.resellers) && A.data.resellers.length) A.resellers = A.data.resellers;
    } catch (e) { A.err = e.message; A.data = null; }
    A.busy = false; show();
  }
  function show() { try { render(); } catch (e) { const V = $('#v-atx'); if (V) V.innerHTML = `<div class="card glass"><p style="color:#ff8f8f">Errore nella sezione Atlantix: ${esc(e.message || String(e))}</p></div>`; } }
  async function open() {
    if (isAg()) return show();
    if (!A.st) { try { A.st = await api('GET', '/admin/atx/state'); } catch (e) { A.st = { connected: false }; A.err = e.message; } }
    show(); if (A.st.connected && A.data == null && !A.busy && !A.err) load();
  }
  const v0 = view;
  window.view = view = function (v) { const r = v0.apply(this, arguments); if (v === 'atx') open(); return r; };
})();
