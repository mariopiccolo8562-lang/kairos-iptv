/* KAIROS Control — «Pannello Atlantix» (cms.axdash.biz): linee, sub-reseller e connessioni del tuo account Atlantix.
   KAIROS entra con utente, password e codice di accesso (salvati cifrati) e legge/scrive direttamente su Atlantix.
   Solo il titolare. Usa app.js. */
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
  const A = { st: null, tab: 'lines', page: 1, q: '', data: null, err: '', busy: false, edit: false };
  const HIDE = /token|secret|hash|csrf/i;
  const cell = (v) => {
    if (v == null || v === '') return '<span class="mut">—</span>';
    if (typeof v === 'boolean') return v ? 'sì' : 'no';
    if (typeof v === 'object') { const s = Array.isArray(v) ? v.map((x) => (x && typeof x === 'object' ? x.name || x.username || x.id || '' : x)).filter((x) => x !== '').join(', ') : (v.name || v.username || v.id || ''); return s === '' ? '<span class="mut">…</span>' : esc(String(s)); }
    const s = String(v); return esc(s.length > 80 ? s.slice(0, 80) + '…' : s);
  };
  const rowsOf = (d) => (Array.isArray(d) ? d : d && typeof d === 'object' ? (['rows', 'items', 'lines', 'users', 'connections', 'data', 'list'].map((k) => d[k]).find(Array.isArray) || null) : null);
  function table(rows, act) {
    if (!rows.length) return '<p class="mut" style="margin:14px 0">Nessun elemento.</p>';
    const keys = []; for (const r of rows.slice(0, 30)) for (const k of Object.keys(r || {})) if (!keys.includes(k) && !HIDE.test(k)) keys.push(k);
    const ks = keys.slice(0, 14), th = 'text-align:left;padding:8px;border-bottom:1px solid var(--line,#333);white-space:nowrap', td = 'padding:8px;border-bottom:1px solid var(--line,#222);vertical-align:top';
    return `<div style="overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr>${ks.map((k) => `<th style="${th}">${esc(k)}</th>`).join('')}${act ? `<th style="${th}">Azioni</th>` : ''}</tr></thead><tbody>${rows.map((r, i) => `<tr>${ks.map((k) => `<td style="${td}">${cell(r && r[k])}</td>`).join('')}${act ? `<td style="${td};white-space:nowrap">${r && r.id ? `<button class="btn sm" data-a="renew" data-i="${i}">Rinnova</button> <button class="btn sm" data-a="on" data-i="${i}">Attiva</button> <button class="btn sm" data-a="off" data-i="${i}">Disattiva</button>` : ''}</td>` : ''}</tr>`).join('')}</tbody></table></div>`;
  }
  function body() {
    if (A.busy) return '<p class="mut" style="margin:14px 0">Carico da Atlantix…</p>';
    if (A.err) return `<p style="color:#ff8f8f;margin:14px 0">${esc(A.err)}</p>`;
    if (A.data == null) return '';
    const rows = rowsOf(A.data);
    if (!rows) return table([A.data]);
    const pages = +A.data.pages || 0, total = A.data.total != null ? +A.data.total : null;
    const more = pages ? A.page < pages : rows.length >= 50;
    return `<p class="mut" style="font-size:12.5px;margin:10px 0">${total != null ? total + ' in tutto · ' : ''}pagina ${A.page}${pages ? ' di ' + pages : ''}</p>${table(rows, A.tab === 'lines')}
      <div style="display:flex;gap:8px;margin-top:12px">${A.page > 1 ? '<button class="btn sm" data-o="prev">← Indietro</button>' : ''}${more && A.tab !== 'conns' ? '<button class="btn sm" data-o="next">Avanti →</button>' : ''}</div>`;
  }
  function render() {
    const V = $('#v-atx'); if (!V) return;
    if (isAg()) { V.innerHTML = '<div class="card glass"><p>Il Pannello Atlantix lo usa solo il titolare.</p></div>'; return; }
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
      ${st.connected ? `<div class="card glass"><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:6px">${TABS.map(([k, n]) => `<button class="btn sm${A.tab === k ? ' pri' : ''}" data-t="${k}">${n}</button>`).join('')}
        ${A.tab === 'lines' || A.tab === 'subs' ? `<input class="inp" id="axQ" placeholder="Cerca…" value="${esc(A.q)}" style="max-width:240px;margin-left:auto">` : ''}</div>${body()}</div>` : ''}`;
    $$('[data-t]', V).forEach((b) => (b.onclick = () => { A.tab = b.dataset.t; A.page = 1; A.q = ''; load(); }));
    $$('[data-o]', V).forEach((b) => (b.onclick = () => op(b.dataset.o)));
    $$('[data-a]', V).forEach((b) => (b.onclick = () => act(b.dataset.a, (rowsOf(A.data) || [])[+b.dataset.i])));
    const q = $('#axQ'); if (q) q.onkeydown = (e) => { if (e.key === 'Enter') { A.q = q.value.trim(); A.page = 1; load(); } };
  }
  async function op(o) {
    try {
      if (o === 'prev') { A.page--; return load(); } if (o === 'next') { A.page++; return load(); }
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
  async function act(a, r) {
    if (!r || !r.id) return;
    const who = esc(r.username || '#' + r.id);
    try {
      if (a === 'renew') {
        if (!(await ask('Rinnovare ' + (r.username || '#' + r.id) + '?', `<p>Il rinnovo usa i crediti del tuo account Atlantix.</p><label>Mesi<select class="inp" id="axM">${[1, 2, 3, 6, 12].map((n) => `<option value="${n}">${n} ${n === 1 ? 'mese' : 'mesi'}</option>`).join('')}</select></label>`, 'Rinnova'))) return;
        const months = +$('#axM').value; await api('POST', '/admin/atx/lines/action', { action: 'renew', user_id: r.id, months }); toast(`Linea ${r.username || r.id} rinnovata di ${months} ${months === 1 ? 'mese' : 'mesi'}`); return load();
      }
      const on = a === 'on';
      if (!(await ask((on ? 'Attivare ' : 'Disattivare ') + (r.username || '#' + r.id) + '?', `La linea ${who} viene ${on ? 'attivata' : 'disattivata'} subito su Atlantix.`, on ? 'Attiva' : 'Disattiva'))) return;
      await api('POST', '/admin/atx/lines/action', { action: 'toggle', user_id: r.id, enabled: on }); toast(`Linea ${on ? 'attivata' : 'disattivata'} su Atlantix`); return load();
    } catch (e) { toast(e.message, 1); }
  }
  async function load() {
    A.busy = true; A.err = ''; show();
    try { A.data = await api('GET', `/admin/atx/${A.tab}?page=${A.page}&q=${encodeURIComponent(A.q)}`); } catch (e) { A.err = e.message; A.data = null; }
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
