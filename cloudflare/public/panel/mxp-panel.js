/* KAIROS Control — «Pannello MaxPlayer»: i tuoi account MaxPlayer gestiti da KAIROS con l'API pubblica ufficiale.
   Clienti, liste, agenti e domini si leggono e si scrivono direttamente su MaxPlayer (niente copie): quello che fai qui
   si vede su my.maxplayer.tv e viceversa. Puoi collegare più account con la loro chiave API (salvata cifrata).
   Titolare; gli agenti con il permesso vedono solo i clienti del loro agente MaxPlayer. Usa le funzioni di app.js. */
(() => {
  const css = document.createElement('style');
  css.textContent = `
.mx-acc{display:flex;gap:6px;flex-wrap:wrap;align-items:center}.mx-acc button{background:#ffffff0d;border:1px solid var(--line);color:var(--mut);padding:7px 14px;border-radius:9px;font:inherit;font-weight:700;font-size:13px;cursor:pointer}.mx-acc button.on{color:var(--txt,#fff);background:#ffffff1c}
.mx-row{display:grid;grid-template-columns:90px minmax(0,1fr) minmax(0,2.2fr) auto;gap:10px;align-items:start;padding:10px 0;border-top:1px solid var(--line);font-size:13px}
.mx-row .k,.mx-ag .k{font-size:11px;color:var(--mut);display:block}.mx-l{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:2px 0}.mx-l .mono{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:240px}
.mx-l button{background:none;border:0;color:var(--mut);cursor:pointer;padding:2px 5px;border-radius:5px;font:inherit;font-size:12px}.mx-l button:hover{color:var(--txt,#fff);background:#ffffff14}
.mx-ag{display:grid;grid-template-columns:minmax(0,1.4fr) 90px 90px minmax(0,1fr) auto;gap:10px;align-items:center;padding:10px 0;border-top:1px solid var(--line);font-size:13px}.mx-ag .n{font-size:17px;font-weight:800}
@media (max-width:1000px){.mx-row,.mx-ag{grid-template-columns:1fr 1fr}.mx-row .wf-act,.mx-ag .wf-act{grid-column:1/-1;justify-content:flex-start}}`;
  document.head.appendChild(css);

  const IC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8M12 17v4M10 9l4 2-4 2z"/></svg>';
  if (!$('.nav[data-v="mxp"]')) {
    const b = document.createElement('button'); b.className = 'nav'; b.dataset.v = 'mxp'; b.innerHTML = IC + 'Pannello MaxPlayer'; b.onclick = () => view('mxp');
    const anchor = $('.nav[data-v="wolf"]') || $('.nav[data-v="armada"]') || $('.nav[data-v="devices"]'); anchor ? anchor.after(b) : $('#side').appendChild(b);
    const sec = document.createElement('section'); sec.className = 'view'; sec.id = 'v-mxp'; $('#v-dash').after(sec);
  }
  TITLES.mxp = 'Pannello MaxPlayer';

  const isAg = () => D.role === 'agent';
  const KXMxpCan = () => !isAg() || !!(((D.me || {}).perms || {}).mxp);
  window.KXMxpCan = KXMxpCan;
  const linePanels = ['wolf', 'armada', 'storm', 'ro', 'slt'];
  const canLoadLines = () => !!window.KXLinePick && (!isAg() || linePanels.some((k) => !!(((D.me || {}).perms || {})[k])));
  const originOf = (value) => {
    const v = String(value || '').trim();
    if (!v) return '';
    try { return new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(v) ? v : `http://${v}`).origin.toLowerCase(); } catch { return ''; }
  };
  const domainOrigin = (d) => {
    if (!d || !d.domain) return '';
    const port = d.port && !['80', '443'].includes(String(d.port)) ? ':' + d.port : '';
    return originOf(`${d.https ? 'https' : 'http'}://${d.domain}${port}`);
  };
  const M = { accs: null, acc: '', tab: 'users', ov: null, users: null, doms: null, agents: null, q: '', limit: 100, show: new Set(), busy: false, err: '', sel: new Set(), stOn: false };
  const copy = (t, w) => navigator.clipboard.writeText(t).then(() => toast(w + ' copiato'), () => toast('Copia non consentita dal browser', 1));
  const gen = (n) => { const a = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'; const r = crypto.getRandomValues(new Uint8Array(n)); return [...r].map((x) => a[x % a.length]).join(''); };
  const P = (p) => `/admin/mxp/a/${M.acc}${p}`;
  const domName = (id) => { const d = (M.doms || []).find((x) => x.id === id); return d ? d.label || d.domain : ''; };
  const domOpts = (sel) => (M.doms || []).map((d) => `<option value="${esc(d.id)}"${d.id === sel ? ' selected' : ''}>${esc(d.label || d.domain)}${d.label && d.domain ? ' — ' + esc(d.domain) : ''}</option>`).join('');

  async function loadAccs() { try { M.accs = (await api('GET', '/admin/mxp/accounts')).accounts || []; M.err = ''; } catch (e) { M.accs = []; M.err = e.message; } if (!M.accs.some((a) => a.id === M.acc)) M.acc = (M.accs.find((a) => !a.main) || M.accs[0] || {}).id || ''; }
  async function loadAll(fresh) {
    if (!M.acc) return;
    M.busy = true; M.err = ''; render();
    const acc = M.acc;
    try {
      const [ov, us, dm] = await Promise.all([api('GET', P('/overview')), api('GET', P('/users') + (fresh ? '?fresh=1' : '')), api('GET', P('/domains')).catch(() => ({ domains: [] }))]);
      if (acc !== M.acc) return;
      M.ov = ov; M.users = us.users || []; M.doms = dm.domains || [];
      if (M.tab === 'agents') await loadAgents();
    } catch (e) { M.err = e.message; }
    M.busy = false; show();
  }
  async function loadAgents() { try { M.agents = (await api('GET', P('/agents'))).agents || []; } catch (e) { M.agents = []; M.err = e.message; } }
  function switchAcc(id) { M.acc = id; M.sel.clear(); M.ov = M.users = M.doms = M.agents = null; M.q = ''; M.limit = 100; M.show.clear(); loadAll(); }

  function connectForm() {
    return `<div class="wf-f" style="margin-top:12px;grid-template-columns:1fr 2fr">
      <label>Nome dell'account<input class="inp" id="mxN" maxlength="40" placeholder="es. MaxPlayer 2"></label>
      <label>Chiave API<input class="inp mono" id="mxK" type="password" autocomplete="off" placeholder="MaxPlayer → API pubblica → Accesso → Crea chiave"></label></div>
      <div style="display:flex;gap:8px;margin-top:12px"><button class="btn" id="mxAdd">Collega account</button></div>`;
  }
  function bindConnect() {
    const b = $('#mxAdd'); if (!b) return;
    b.onclick = async () => {
      b.disabled = true;
      try { const r = await api('POST', '/admin/mxp/accounts', { name: $('#mxN').value, key: $('#mxK').value }); toast('Account MaxPlayer collegato'); await loadAccs(); switchAcc(r.id); }
      catch (e) { toast(e.message, 1); b.disabled = false; }
    };
  }
  function filtered() {
    const q = M.q.trim().toLowerCase();
    const K = window.KXOnline, hs = (l) => (l.ssl ? 'https://' : 'http://') + l.fqdn + (l.port ? ':' + l.port : '');
    return (M.users || []).filter((u) => (!q || `${u.id} ${u.username} ${u.email} ${u.lists.map((l) => `${l.user} ${l.fqdn} ${l.name}`).join(' ')}`.toLowerCase().includes(q)) && (!M.on || !K || K.match(M.on, u.lists.map((l) => K.state(hs(l), l.user, l.pass)))));
  }
  function usersHtml() {
    if (!M.users) return `<p class="mut">${M.busy ? 'Carico i clienti da MaxPlayer…' : 'Nessun dato'}</p>`;
    const list = filtered(), shown = list.slice(0, M.limit);
    return `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><input class="inp" id="mxQ" placeholder="Cerca utente, ID, linea o DNS" value="${esc(M.q)}" style="max-width:300px;margin:0">${window.KXOnline ? KXOnline.sel('mxOn', M.on || '') : ''}<span class="mut" style="font-size:12.5px">${list.length} clienti</span></div>
      ${window.KXTools ? KXTools.bar('mx', list.filter((u) => M.sel.has(String(u.id))).length, list.length, [['msg', 'Messaggio ai clienti']]) + (M.stOn ? statsHtml() : '') : ''}
      <div style="margin-top:8px">${shown.map((u) => `<div class="mx-row" data-id="${esc(u.id)}">
        <div><span class="k">${window.KXTools ? KXTools.ck('mx', u.id, M.sel.has(String(u.id))) : ''}ID</span>${esc(u.id)}</div>
        <div><span class="k">Utente app</span><b class="mono">${esc(u.username) || '—'}</b> <button data-a="cua" title="Copia utente">⧉</button>${u.email ? `<br><small class="mut">${esc(u.email)}</small>` : ''}</div>
        <div><span class="k">Liste</span>${u.lists.length ? u.lists.map((l) => { const k = u.id + '|' + l.id, sh = M.show.has(k); return `<div class="mx-l" data-l="${esc(l.id)}">${window.KXOnline ? KXOnline.slot((l.ssl ? 'https://' : 'http://') + l.fqdn + (l.port ? ':' + l.port : ''), l.user, l.pass) : ''}${window.KXWatch ? KXWatch.slot('mxp', l.user) : ''}<span class="wf-tag g">${esc(l.name || 'Lista')}</span><span class="mono" title="${esc(l.fqdn)}">${esc(domName(l.dom) || l.fqdn)}</span><span class="mono"><b>${esc(l.user)}</b></span> <button data-a="cu" title="Copia utente">⧉</button><span class="mono">${sh ? esc(l.pass) : '••••••'}</span><button data-a="eye">${sh ? 'Nascondi' : 'Mostra'}</button><button data-a="cp" title="Copia password">⧉</button><button data-a="le">Modifica</button><button data-a="ld" style="color:#ff8f8f">Togli</button></div>`; }).join('') : '<span class="mut">nessuna lista</span>'}</div>
        <div class="wf-act"><button class="btn sm" data-a="la">+ Lista</button><button class="btn sm" data-a="dv">Dispositivi</button><button class="btn sm" data-a="pw">Password app</button><button class="btn sm ghost" data-a="del" style="color:#ff8f8f">Elimina</button></div></div>`).join('')}</div>
      ${list.length > shown.length ? `<div style="margin-top:10px"><button class="btn sm" id="mxMore">Mostra altri ${Math.min(100, list.length - shown.length)}</button></div>` : ''}`;
  }
  function agentsHtml() {
    if (!M.agents) return `<p class="mut">Carico gli agenti da MaxPlayer…</p>`;
    if (!M.agents.length) return '<p class="mut">Nessun agente su questo account.</p>';
    return M.agents.map((a) => `<div class="mx-ag" data-id="${esc(a.id)}">
      <div><span class="k">ID ${esc(a.id)}${a.agents ? ` · ${a.agents} sotto-agenti` : ''}</span><b>${esc(a.name || a.username)}</b> <span class="mono mut">${esc(a.username)}</span><br><small class="mut">${esc(a.email)}</small> ${a.disabled ? '<span class="wf-tag b">Disattivato</span>' : '<span class="wf-tag">Attivo</span>'}</div>
      <div><span class="k">Clienti</span><span class="n">${a.users}</span></div><div><span class="k">Massimo</span><span class="n">${a.max}</span></div>
      <div><span class="k">Ultimo accesso</span>${esc(a.last) || '—'}</div>
      <div class="wf-act"><button class="btn sm ghost" data-a="${a.disabled ? 'enable' : 'disable'}">${a.disabled ? 'Attiva' : 'Disattiva'}</button></div></div>`).join('');
  }
  function domsHtml() {
    if (!M.doms) return '<p class="mut">Carico…</p>';
    return (isAg() ? '' : '<div style="margin-bottom:8px"><button class="btn sm" data-d="+">+ Nuovo DNS</button></div>') + (M.doms.length ? M.doms.map((d, i) => `<div class="mx-ag" style="grid-template-columns:minmax(0,1fr) minmax(0,1.5fr) 90px 90px"><div><span class="k">ID ${esc(d.id)}</span><b>${esc(d.label || '—')}</b></div><div><span class="k">DNS</span><span class="mono">${isAg() ? `DNS ${i + 1} · ${esc(d.label || 'MaxPlayer')}` : `${d.https ? 'https' : 'http'}://${esc(d.domain)}${d.port && !['80', '443'].includes(d.port) ? ':' + esc(d.port) : ''}`}</span></div><div><span class="k">Stato</span>${esc(d.status) || '—'}</div><div class="wf-act">${isAg() ? '' : `<button class="btn sm" data-d="${esc(d.id)}">Modifica DNS</button>`}</div></div>`).join('') : '<p class="mut">Nessun dominio.</p>');
  }

  function mxStats(o, inf) { if (!window.KXStats || M.acc === '+') return ''; const U = M.users || [], L = U.flatMap((u) => u.lists || []), has = !!M.users; return KXStats.strip([{ label: 'Clienti totali', v: has ? U.length : inf.users ?? null, c: 'red' }, { label: 'Posti liberi', v: o.cap ? o.cap.free : null, c: 'teal' }, { label: 'Posti totali', v: inf.max ?? null, c: 'dark' }, { label: 'Liste collegate', v: has ? L.length : null, c: 'blue' }, { label: 'Clienti senza liste', v: has ? U.filter((u) => !(u.lists || []).length).length : null, c: 'dark' }, { label: 'Con più liste', v: has ? U.filter((u) => (u.lists || []).length > 1).length : null, c: 'orange' }, { label: isAg() ? 'Sotto-agenti' : 'Agenti', v: inf.resellers ?? null, c: 'dark' }], { margin: '12px 0 0' }); }
  function render() {
    const V = $('#v-mxp'); if (!V) return;
    if (!M.accs) { V.innerHTML = '<div class="card glass"><p class="mut">Carico…</p></div>'; return; }
    if (!M.accs.length && isAg()) { V.innerHTML = `<div class="card glass"><b style="font-size:15px">Pannello MaxPlayer</b><p class="mut" style="margin:6px 0 0">Chi ti gestisce non ti ha ancora assegnato un agente MaxPlayer.</p>${M.err ? `<p style="color:#ff8f8f">${esc(M.err)}</p>` : ''}</div>`; return; }
    if (!M.accs.length) {
      V.innerHTML = `<div class="card glass"><b style="font-size:15px">Collega un account MaxPlayer</b><p class="mut" style="margin:6px 0 0">Su my.maxplayer.tv vai in <b>API pubblica → Accesso → Crea chiave</b> e incolla qui la chiave. Resta cifrata sul server; KAIROS la usa per gestire clienti, liste e agenti come fai tu sul sito.</p>${M.err ? `<p style="color:#ff8f8f">${esc(M.err)}</p>` : ''}${connectForm()}</div>`;
      bindConnect(); return;
    }
    const cur = M.accs.find((a) => a.id === M.acc) || {}, o = M.ov || {}, inf = o.info || {};
    V.innerHTML = `<div class="card glass">
      <div class="mx-acc" style="${isAg() ? 'display:none' : ''}">${M.accs.map((a) => `<button data-acc="${esc(a.id)}" class="${a.id === M.acc ? 'on' : ''}">${esc(a.name)}${a.main ? ' · attivazioni KAIROS' : ''}</button>`).join('')}<button data-acc="+">+ Account</button></div>
      <div class="wf-st" style="margin-top:12px"><div style="flex:1;min-width:220px"><b style="font-size:15px">✅ ${esc(inf.name || cur.name || 'MaxPlayer')}</b><small>Quello che fai qui succede subito anche su MaxPlayer, e viceversa.</small></div>
        <div><small>Clienti</small><span class="cr">${inf.users ?? '—'}<span style="font-size:14px;color:var(--mut)">${inf.max ? ' / ' + inf.max : ''}</span></span></div><div><small>Posti liberi</small><span class="cr">${o.cap ? o.cap.free : '—'}</span></div><div><small>${isAg() ? 'Sotto-agenti' : 'Agenti'}</small><span class="cr">${inf.resellers ?? '—'}</span></div>
        <button class="btn sm" id="mxRe">${M.busy ? 'Carico…' : 'Aggiorna'}</button><button class="btn sm" id="mxNew">+ Nuovo cliente</button>${isAg() ? '' : '<button class="btn sm ghost" id="mxIn">Elimina inattive</button>'}</div>
      ${mxStats(o, inf)}
      ${M.err ? `<p style="color:#ff8f8f;margin:10px 0 0">${esc(M.err)}</p>` : ''}
      ${cur.main || isAg() ? '' : `<details style="margin-top:12px"><summary style="cursor:pointer;font-weight:600;font-size:13px">Impostazioni account</summary><div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><input class="inp" id="mxRn" maxlength="40" value="${esc(cur.name || '')}" style="max-width:240px;margin:0"><button class="btn sm" id="mxRnB">Rinomina</button><button class="btn sm ghost" id="mxOff">Scollega account</button></div></details>`}
      <div class="wf-tabs"><button data-t="users" class="${M.tab === 'users' ? 'on' : ''}">Clienti${M.users ? ' · ' + M.users.length : ''}</button><button data-t="agents" class="${M.tab === 'agents' ? 'on' : ''}">${isAg() ? 'Sotto-agenti' : 'Agenti'}${M.agents ? ' · ' + M.agents.length : ''}</button><button data-t="doms" class="${M.tab === 'doms' ? 'on' : ''}">Domini (DNS)${M.doms ? ' · ' + M.doms.length : ''}</button></div></div>
      <div class="card glass" style="margin-top:14px">${M.acc === '+' ? '' : M.tab === 'agents' ? agentsHtml() : M.tab === 'doms' ? domsHtml() : usersHtml()}</div>`;
    bind();
  }
  function bind() {
    const V = $('#v-mxp');
    V.querySelectorAll('[data-acc]').forEach((b) => { b.onclick = () => (b.dataset.acc === '+' ? addAcc() : b.dataset.acc !== M.acc && switchAcc(b.dataset.acc)); });
    V.querySelectorAll('.wf-tabs [data-t]').forEach((b) => { b.onclick = async () => { M.tab = b.dataset.t; render(); if (M.tab === 'agents' && !M.agents) { await loadAgents(); show(); } }; });
    $('#mxRe').onclick = async () => { await loadAll(true); };
    $('#mxNew').onclick = newUser;
    if ($('#mxIn')) $('#mxIn').onclick = () => window.KXPurgeThird && window.KXPurgeThird();
    V.querySelectorAll('[data-d]').forEach((b) => { b.onclick = () => domEdit(b.dataset.d); });
    if ($('#mxRnB')) $('#mxRnB').onclick = async () => { try { await api('PUT', '/admin/mxp/accounts/' + M.acc, { name: $('#mxRn').value }); await loadAccs(); render(); toast('Nome salvato'); } catch (e) { toast(e.message, 1); } };
    if ($('#mxOff')) $('#mxOff').onclick = async () => {
      if (!(await ask('Scollegare questo account?', 'KAIROS dimentica la chiave API. Su MaxPlayer clienti e liste restano come sono.', 'Scollega'))) return;
      try { await api('DELETE', '/admin/mxp/accounts/' + M.acc); await loadAccs(); switchAcc(M.acc); toast('Account scollegato'); } catch (e) { toast(e.message, 1); }
    };
    const q = $('#mxQ'); if (q) q.oninput = () => { M.q = q.value; M.limit = 100; const p = q.selectionStart; render(); const n = $('#mxQ'); n.focus(); n.setSelectionRange(p, p); };
    if ($('#mxMore')) $('#mxMore').onclick = () => { M.limit += 100; render(); };
    if ($('#mxOn')) $('#mxOn').onchange = (e) => { M.on = e.target.value; M.limit = 100; render(); };
    V.querySelectorAll('.mx-row [data-a]').forEach((b) => { b.onclick = () => userAct(b.dataset.a, b.closest('.mx-row').dataset.id, (b.closest('.mx-l') || {}).dataset ? b.closest('.mx-l') && b.closest('.mx-l').dataset.l : ''); });
    V.querySelectorAll('.mx-ag [data-a]').forEach((b) => { b.onclick = () => agentAct(b.dataset.a, b.closest('.mx-ag').dataset.id); });
    if (window.KXTools && M.tab === 'users' && M.users) KXTools.bind(V, 'mx', M.sel, () => filtered().map((u) => u.id), { csv: exportCsv, stats: () => { M.stOn = !M.stOn; render(); },
      msg: () => { const S = selU(); KXTools.msg(KXTools.devsFor(S.flatMap((u) => u.lists.map((l) => l.user))), S.length); } }, render);
  }
  const selU = () => filtered().filter((u) => M.sel.has(String(u.id)));
  function statsHtml() {
    const U = M.users || [], L = U.flatMap((u) => u.lists), o = M.ov || {};
    return KXTools.stats([['Clienti', U.length], ['Liste', L.length], ['Clienti senza liste', U.filter((u) => !u.lists.length).length, 'w'], ['Con più liste', U.filter((u) => u.lists.length > 1).length],
      ['Posti liberi', o.cap ? o.cap.free : '—', 'g'], ['DNS', (M.doms || []).length]], [['Liste per DNS', KXTools.count(L, (l) => domName(l.dom) || l.fqdn)]]);
  }
  function exportCsv() {
    const S = selU(), U = S.length ? S : filtered(), rows = U.flatMap((u) => (u.lists.length ? u.lists : [{}]).map((l) => ({ u, l })));
    KXTools.csv('maxplayer-clienti', [['ID', (r) => r.u.id], ['Utente app', (r) => r.u.username], ['Email', (r) => r.u.email], ['Lista', (r) => r.l.name], ['DNS', (r) => (r.l.dom ? domName(r.l.dom) : '') || r.l.fqdn],
      ['Utente linea', (r) => r.l.user], ['Password linea', (r) => r.l.pass]], rows);
  }
  async function addAcc() {
    const ok = await ask('Collega un altro account MaxPlayer', `<p class="mut" style="margin:0 0 6px;font-size:12.5px">Su my.maxplayer.tv: API pubblica → Accesso → Crea chiave.</p>${connectForm().replace(/<div style="display:flex;gap:8px;margin-top:12px"><button class="btn" id="mxAdd">Collega account<\/button><\/div>/, '')}`, 'Collega');
    if (!ok) return;
    try { const r = await api('POST', '/admin/mxp/accounts', { name: $('#mxN').value, key: $('#mxK').value }); toast('Account MaxPlayer collegato'); await loadAccs(); switchAcc(r.id); } catch (e) { toast(e.message, 1); }
  }
  async function newUser(pre) {
    pre = pre || {};
    if (!M.doms || !M.doms.length) return toast('Nessun dominio (DNS) su questo account', 1);
    const prompt = ask('Nuovo cliente su MaxPlayer', `<div class="wf-f" style="grid-template-columns:1fr 1fr">
      ${canLoadLines() ? '<div id="mnLinePick" style="grid-column:1/-1"></div>' : ''}
      <label>Utente della linea<input class="inp mono" id="mnU" autocomplete="off" value="${esc(pre.user || '')}"></label><label>Password della linea<input class="inp mono" id="mnP" autocomplete="off" value="${esc(pre.pass || '')}"></label>
      <label style="grid-column:1/-1">DNS (dominio)<select class="inp" id="mnD">${domOpts('')}</select></label>
      <label>Nome (facoltativo)<input class="inp" id="mnN" maxlength="60" value="${esc(pre.name || '')}"></label><label>Dispositivi (facoltativo)<input class="inp" id="mnX" type="number" min="1" max="50" placeholder="come da account"></label></div>
      <p class="mut" style="font-size:12.5px;margin:10px 0 0">Usa un posto dell'account (liberi: <b>${M.ov && M.ov.cap ? M.ov.cap.free : '—'}</b>). Il cliente compare subito anche su MaxPlayer.</p>`, 'Crea cliente');
    if (canLoadLines()) window.KXLinePick.mount($('#mnLinePick'), (line) => {
      $('#mnU').value = line.username;
      $('#mnP').value = line.password;
      if (!$('#mnN').value.trim()) $('#mnN').value = line.username;
      if (!isAg() && line.host) {
        const target = originOf(line.host);
        const domain = (M.doms || []).find((d) => domainOrigin(d) === target);
        if (domain) $('#mnD').value = domain.id;
      }
    });
    const ok = await prompt;
    if (!ok) return;
    try {
      const user = $('#mnU').value, pass = $('#mnP').value;
      await api('POST', P('/users'), { user, pass, domain: $('#mnD').value, name: $('#mnN').value, devices: $('#mnX').value });
      const refresh = loadAll(true);
      if (window.KXCreds) await KXCreds.show('✅ Cliente creato su MaxPlayer', [['Utente della linea', user], ['Password della linea', pass]]);
      else toast('Cliente creato su MaxPlayer');
      await refresh;
    } catch (e) { toast(e.message, 1); }
  }
  async function domEdit(id) {
    const d = (M.doms || []).find((x) => x.id === id), url = d ? `${d.https ? 'https' : 'http'}://${d.domain}${d.port && !['80', '443'].includes(d.port) ? ':' + d.port : ''}` : '';
    const ok = await ask(d ? 'Modifica DNS ' + (d.label || d.domain) : 'Nuovo DNS su MaxPlayer', `<div class="wf-f" style="grid-template-columns:1fr 1fr"><label>Nome<input class="inp" id="mdL" maxlength="60" value="${esc(d ? d.label : '')}"></label><label>DNS completo<input class="inp mono" id="mdU" value="${esc(url)}" placeholder="http://dns.esempio.com:8080"></label></div>
      <p class="mut" style="font-size:12.5px;margin:10px 0 0">${d ? 'Tutti i clienti che usano questo DNS passano al nuovo indirizzo, subito.' : 'Il DNS si aggiunge al tuo account MaxPlayer.'}</p>`, 'Salva');
    if (!ok) return;
    try { await api(d ? 'PUT' : 'POST', P('/domains' + (d ? '/' + id : '')), { url: $('#mdU').value, label: $('#mdL').value }); toast(d ? 'DNS modificato su MaxPlayer' : 'DNS aggiunto su MaxPlayer'); M.doms = (await api('GET', P('/domains'))).domains || []; show(); } catch (e) { toast(e.message, 1); }
  }
  async function userAct(a, id, lid) {
    const u = (M.users || []).find((x) => x.id === id); if (!u) return;
    const l = u.lists.find((x) => x.id === lid);
    try {
      if (a === 'eye' && l) { const k = id + '|' + lid; M.show.has(k) ? M.show.delete(k) : M.show.add(k); return render(); }
      if (a === 'cua') return copy(u.username, 'Utente app');
      if (a === 'cu' && l) return copy(l.user, 'Utente');
      if (a === 'cp' && l) return copy(l.pass, 'Password');
      if (a === 'le' && l) {
        const ok = await ask('Modifica lista di ' + (u.username || id), `<div class="wf-f" style="grid-template-columns:1fr 1fr">
          <label>Utente della linea<input class="inp mono" id="meU" value="${esc(l.user)}"></label><label>Password della linea<input class="inp mono" id="meP" value="${esc(l.pass)}"></label>
          <label>Nome della lista<input class="inp" id="meN" maxlength="60" value="${esc(l.name)}"></label><label>DNS (dominio)<select class="inp" id="meD">${domOpts(l.dom)}</select></label></div>
          <p class="mut" style="font-size:12.5px;margin:10px 0 0">La modifica vale subito anche su MaxPlayer: il cliente vede la lista aggiornata nell'app.</p>`, 'Salva');
        if (!ok) return;
        await api('PUT', P(`/users/${id}/lists/${encodeURIComponent(lid)}`), { user: $('#meU').value, pass: $('#meP').value, name: $('#meN').value, domain: $('#meD').value }); toast('Lista modificata su MaxPlayer'); return loadAll(true);
      }
      if (a === 'ld' && l) {
        if (!(await ask('Togliere la lista ' + (l.name || '') + '?', `La lista viene tolta dal cliente ${esc(u.username || id)} su MaxPlayer; il cliente resta.`, 'Togli'))) return;
        await api('DELETE', P(`/users/${id}/lists/${encodeURIComponent(lid)}`)); toast('Lista tolta'); return loadAll(true);
      }
      if (a === 'la') {
        const ok = await ask('Nuova lista per ' + (u.username || id), `<div class="wf-f" style="grid-template-columns:1fr 1fr"><label>Utente della linea<input class="inp mono" id="maU"></label><label>Password della linea<input class="inp mono" id="maP"></label><label style="grid-column:1/-1">DNS (dominio)<select class="inp" id="maD">${domOpts('')}</select></label></div>`, 'Aggiungi');
        if (!ok) return;
        await api('POST', P(`/users/${id}/lists`), { user: $('#maU').value, pass: $('#maP').value, domain: $('#maD').value }); toast('Lista aggiunta su MaxPlayer'); return loadAll(true);
      }
      if (a === 'dv') {
        const ok = await ask('Dispositivi di ' + (u.username || id), '<label class="lbl">Quanti dispositivi può usare</label><input class="inp" id="mvN" type="number" min="1" max="50" value="1">', 'Salva');
        if (!ok) return;
        await api('PUT', P(`/users/${id}/devices`), { limit: $('#mvN').value }); return toast('Dispositivi aggiornati su MaxPlayer');
      }
      if (a === 'pw') {
        const ok = await ask('Password dell\'app di ' + (u.username || id), `<label class="lbl">Nuova password per entrare nell'app MaxPlayer</label><input class="inp mono" id="mpP" value="${gen(10)}"><p class="mut" style="font-size:12.5px;margin:10px 0 0">Comunicala al cliente: dovrà usarla al prossimo accesso.</p>`, 'Cambia');
        if (!ok) return;
        await api('PUT', P(`/users/${id}/password`), { password: $('#mpP').value }); return toast('Password cambiata su MaxPlayer');
      }
      if (a === 'del') {
        if (!(await ask('Eliminare ' + (u.username || id) + ' da MaxPlayer?', 'Il cliente e le sue liste vengono cancellati da MaxPlayer per sempre; il posto torna libero.', 'Elimina'))) return;
        await api('DELETE', P('/users/' + id)); toast('Cliente eliminato da MaxPlayer'); return loadAll(true);
      }
    } catch (e) { toast(e.message, 1); }
  }
  async function agentAct(a, id) {
    const g = (M.agents || []).find((x) => x.id === id); if (!g) return;
    if (!(await ask((a === 'enable' ? 'Attivare ' : 'Disattivare ') + (g.name || g.username) + '?', a === 'enable' ? 'L\'agente potrà di nuovo entrare su MaxPlayer.' : 'L\'agente non potrà più entrare su MaxPlayer finché non lo riattivi.', a === 'enable' ? 'Attiva' : 'Disattiva'))) return;
    try { await api('POST', P(`/agents/${id}/${a}`)); toast(a === 'enable' ? 'Agente attivato' : 'Agente disattivato'); await loadAgents(); show(); } catch (e) { toast(e.message, 1); }
  }

  /* «Elimina inattive»: toglie da OrbixPlay e MaxPlayer le liste dei clienti KAIROS scaduti o disattivati da N giorni */
  window.KXPurgeThird = async () => {
    const pr = ask('Elimina liste inattive', `<p class="mut" style="margin:0 0 10px;font-size:12.5px">Toglie da OrbixPlay e MaxPlayer le liste dei clienti KAIROS con abbonamento scaduto, o disattivati e fermi, da più dei giorni che scegli. I clienti restano in KAIROS.</p>
      <label class="lbl">Giorni di inattività</label><input class="inp" type="number" id="piD" min="7" max="365" value="60"><p class="mut" id="piC" style="margin:10px 0 0;font-size:12.5px"></p>`, 'Elimina');
    {
      const c = async () => { const d = Math.max(7, Math.min(365, +$('#piD').value || 60)); try { const r = await api('GET', '/admin/apps3/lists?days=' + d); $('#piC').textContent = `Liste da togliere: ${(r.lists || []).filter((x) => x.inactive).length}`; } catch (e) { $('#piC').textContent = e.message; } };
      $('#piD').oninput = c; c();
    }
    const ok = await pr;
    if (!ok) return;
    try { const r = await api('POST', '/admin/apps3/cleanup', { days: Math.max(7, Math.min(365, +$('#piD').value || 60)) }); toast(`Tolte ${r.removed} liste${r.errors && r.errors.length ? ` · ${r.errors.length} errori` : ''}`, !!(r.errors && r.errors.length)); } catch (e) { toast(e.message, 1); }
  };
  function show() { try { render(); } catch (e) { const V = $('#v-mxp'); if (V) V.innerHTML = `<div class="card glass"><p style="color:#ff8f8f">Errore nella sezione MaxPlayer: ${esc(e.message || String(e))}</p></div>`; } }
  function open() { show(); (M.accs ? Promise.resolve() : loadAccs()).then(() => { show(); if (M.acc && !M.users && !M.busy) loadAll(); }); }
  /* da WOLF/Armada: apre MaxPlayer con «Nuovo cliente» già compilato con utente e password della linea */
  window.KXMxpNew = async (pre) => {
    if (!KXMxpCan()) return toast('Non hai il permesso per creare clienti MaxPlayer: chiedilo a chi ti gestisce', 1);
    view('mxp');
    if (!M.accs) await loadAccs();
    if (!M.acc) return toast('Collega prima un account MaxPlayer', 1);
    if (!M.doms) await loadAll();
    newUser(pre);
  };
  setTimeout(() => window.KXOnline && KXOnline.watch('v-mxp', () => !!M.on, render), 0);
  const v0 = view;
  window.view = view = function (v) { const r = v0.apply(this, arguments); if (v === 'mxp') open(); return r; };
  const sec = $('#v-mxp');
  if (sec) new MutationObserver(() => { if (sec.classList.contains('on') && !sec.innerHTML.trim()) open(); }).observe(sec, { attributes: true, attributeFilter: ['class'] });
})();
