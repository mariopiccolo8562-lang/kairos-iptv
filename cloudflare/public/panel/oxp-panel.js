/* KAIROS Control — «Pannello OrbixPlay»: le playlist del tuo account OrbixPlay (Integration API, chiave ORBIX_KEY).
   Niente copie: si leggono e si scrivono su OrbixPlay, quindi la dashboard e KAIROS mostrano gli stessi dati.
   Titolare: tutte, con i posti. Agente con il permesso: solo le playlist dei dispositivi dei suoi clienti. Usa app.js. */
(() => {
  const IC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M10 8.5l5 3.5-5 3.5z"/></svg>';
  if (!$('.nav[data-v="oxp"]')) {
    const b = document.createElement('button'); b.className = 'nav'; b.dataset.v = 'oxp'; b.innerHTML = IC + 'Pannello OrbixPlay'; b.onclick = () => view('oxp');
    const anchor = $('.nav[data-v="mxp"]') || $('.nav[data-v="wolf"]') || $('.nav[data-v="devices"]'); anchor ? anchor.after(b) : $('#side').appendChild(b);
    const sec = document.createElement('section'); sec.className = 'view'; sec.id = 'v-oxp'; $('#v-dash').after(sec);
  }
  TITLES.oxp = 'Pannello OrbixPlay';
  const isAg = () => D.role === 'agent';
  const canNew = () => !isAg() || !!(((D.me || {}).perms || {}).oxpNew);
  if (!$('#oxCss')) { const c = document.createElement('style'); c.id = 'oxCss'; c.textContent = '.ox-row{grid-template-columns:minmax(0,1fr) minmax(0,1.3fr) minmax(0,1.3fr) minmax(0,1.2fr) auto!important}.ox-row .oxid{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12.5px;word-break:break-all;color:var(--txt,#fff)}@media (max-width:1000px){.ox-row{grid-template-columns:1fr 1fr!important}}'; document.head.appendChild(c); }
  const O = { st: null, pls: null, slots: null, q: '', limit: 100, show: new Set(), busy: false, err: '', sel: new Set(), stOn: false };
  const copy = (t, w) => navigator.clipboard.writeText(t).then(() => toast(w + ' copiato'), () => toast('Copia non consentita dal browser', 1));
  const dnsOpts = (sel) => { const L = ((((D.settings || {}).playersCfg || {}).orbix) || []).filter((x) => x && (x.host || x.code)); return L.map((x) => { const v = x.code || x.host; return `<option value="${esc(v)}" data-h="${esc(x.code ? x.host || '' : '')}"${v === sel ? ' selected' : ''}>${esc(x.name || v)}</option>`; }).join(''); };

  async function load() {
    O.busy = true; O.err = ''; render();
    try {
      if (!O.st) O.st = await api('GET', '/admin/oxp/state');
      if (O.st.connected) {
        const [p, sl] = await Promise.all([api('GET', '/admin/oxp/playlists'), isAg() ? Promise.resolve({ slots: null }) : api('GET', '/admin/oxp/slots').catch((e) => ({ slots: null, err: e.message }))]);
        O.pls = p.playlists || []; O.slots = sl.slots; if (sl.err) O.err = sl.err;
      }
    } catch (e) { O.err = e.message; }
    O.busy = false; show();
  }
  function filtered() { const q = O.q.trim().toLowerCase(); return (O.pls || []).filter((p) => !q || `${p.id} ${p.device} ${p.name} ${p.user} ${p.host} ${p.notes}`.toLowerCase().includes(q)); }
  function render() {
    const V = $('#v-oxp'); if (!V) return;
    if (!O.st) { V.innerHTML = `<div class="card glass"><p class="mut">${O.err ? esc(O.err) : 'Carico…'}</p></div>`; return; }
    if (!O.st.connected) { V.innerHTML = '<div class="card glass"><b style="font-size:15px">OrbixPlay non è collegato</b><p class="mut" style="margin:6px 0 0">Serve la customer key di OrbixPlay nel segreto ORBIX_KEY (vedi la guida in Impostazioni).</p></div>'; return; }
    const list = filtered(), shown = list.slice(0, O.limit), sl = O.slots;
    V.innerHTML = `<div class="card glass"><div class="wf-st"><div style="flex:1;min-width:220px"><b style="font-size:15px">✅ OrbixPlay collegato</b><small>${isAg() ? 'Le playlist OrbixPlay dei tuoi clienti.' : 'Quello che fai qui succede subito anche su OrbixPlay, e viceversa.'}</small></div>
        <div><small>Playlist</small><span class="cr">${O.pls ? O.pls.length : '—'}</span></div>${isAg() ? '' : `<div><small>Posti liberi</small><span class="cr">${sl ? sl.free : '—'}<span style="font-size:14px;color:var(--mut)">${sl ? ' / ' + sl.total : ''}</span></span></div>`}
        <button class="btn sm" id="oxRe">${O.busy ? 'Carico…' : 'Aggiorna'}</button>${canNew() ? '<button class="btn sm" id="oxNew">+ Nuova playlist</button>' : ''}${isAg() ? '' : '<button class="btn sm" id="oxDns">Cambia DNS</button><button class="btn sm ghost" id="oxIn">Elimina inattive</button>'}</div>
      ${O.err ? `<p style="color:#ff8f8f;margin:10px 0 0">${esc(O.err)}</p>` : ''}
      ${isAg() ? '' : `<details style="margin-top:12px"><summary style="cursor:pointer;font-weight:600;font-size:13px">Impostazioni</summary><div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;align-items:center"><input class="inp" id="oxEm" type="email" value="${esc(O.st.email || '')}" placeholder="email dell'account OrbixPlay" style="max-width:300px;margin:0"><button class="btn sm" id="oxEmB">Salva</button><small class="mut">Serve solo per leggere i posti.</small></div></details>`}</div>
      <div class="card glass" style="margin-top:14px"><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><input class="inp" id="oxQ" placeholder="Cerca dispositivo, nome, utente, DNS" value="${esc(O.q)}" style="max-width:300px;margin:0"><span class="mut" style="font-size:12.5px">${list.length} playlist</span></div>${window.KXTools && O.pls ? KXTools.bar('ox', list.filter((p) => O.sel.has(String(p.id))).length, list.length, [['msg', 'Messaggio ai clienti']]) + (O.stOn ? statsHtml() : '') : ''}
      <div style="margin-top:8px">${!O.pls ? `<p class="mut">${O.busy ? 'Carico le playlist da OrbixPlay…' : 'Nessun dato'}</p>` : shown.map((p) => { const sh = O.show.has(p.id); return `<div class="wf-row ox-row" data-id="${esc(p.id)}"><div><span class="k">${window.KXTools ? KXTools.ck('ox', p.id, O.sel.has(String(p.id))) : ''}ID playlist</span><span class="oxid">${esc(p.id)}</span></div>
        <div><span class="k">Dispositivo</span><b class="mono">${esc(p.device)}</b>${p.notes ? `<br><small class="mut">${esc(p.notes)}</small>` : ''}</div>
        <div><span class="k">Playlist</span>${esc(p.name) || '—'}<br><small class="mut mono">${esc(p.host)}</small></div>
        <div>${window.KXOnline ? KXOnline.slot(p.host, p.user, p.pass) : ''}<span class="k">Utente / password</span><div class="wf-v"><b class="mono">${esc(p.user)}</b><button data-a="cu">⧉</button></div><div class="wf-v"><span class="mono">${sh ? esc(p.pass) : '••••••'}</span><button data-a="eye">${sh ? 'Nascondi' : 'Mostra'}</button><button data-a="cp">⧉</button></div></div>
        <div class="wf-act"><button class="btn sm" data-a="edit">Modifica</button><button class="btn sm ghost" data-a="del" style="color:#ff8f8f">Elimina</button></div></div>`; }).join('')}</div>
      ${list.length > shown.length ? `<div style="margin-top:10px"><button class="btn sm" id="oxMore">Mostra altre ${Math.min(100, list.length - shown.length)}</button></div>` : ''}</div>`;
    $('#oxRe').onclick = load;
    if ($('#oxNew')) $('#oxNew').onclick = newPl;
    if ($('#oxDns')) $('#oxDns').onclick = chDns;
    if ($('#oxIn')) $('#oxIn').onclick = () => window.KXPurgeThird && window.KXPurgeThird();
    if ($('#oxEmB')) $('#oxEmB').onclick = async () => { try { await api('PUT', '/admin/oxp/email', { email: $('#oxEm').value }); O.st = null; toast('Email salvata'); load(); } catch (e) { toast(e.message, 1); } };
    const q = $('#oxQ'); q.oninput = () => { O.q = q.value; O.limit = 100; const c = q.selectionStart; render(); const n = $('#oxQ'); n.focus(); n.setSelectionRange(c, c); };
    if ($('#oxMore')) $('#oxMore').onclick = () => { O.limit += 100; render(); };
    V.querySelectorAll('.wf-row [data-a]').forEach((b) => { b.onclick = () => act(b.dataset.a, b.closest('.wf-row').dataset.id); });
    if (window.KXTools && O.pls) KXTools.bind(V, 'ox', O.sel, () => filtered().map((p) => p.id), { csv: exportCsv, stats: () => { O.stOn = !O.stOn; render(); },
      msg: () => { const S = selP(); KXTools.msg(KXTools.devsFor(S.map((p) => p.user)), S.length); } }, render);
  }
  const selP = () => filtered().filter((p) => O.sel.has(String(p.id)));
  function statsHtml() {
    const P = O.pls || [], sl = O.slots;
    return KXTools.stats([['Playlist', P.length], ['Dispositivi', new Set(P.map((p) => p.device)).size], ['DNS diversi', new Set(P.map((p) => p.host)).size],
      ...(sl ? [['Posti liberi', `${sl.free} / ${sl.total}`, 'g']] : [])], [['Playlist per DNS', KXTools.count(P, (p) => p.host)], ['Per nome', KXTools.count(P, (p) => p.name)]]);
  }
  function exportCsv() {
    const S = selP();
    KXTools.csv('orbixplay-playlist', [['ID playlist', (p) => p.id], ['Dispositivo', (p) => p.device], ['Nome', (p) => p.name], ['DNS', (p) => p.host], ['Utente', (p) => p.user], ['Password', (p) => p.pass], ['Note', (p) => p.notes]], S.length ? S : filtered());
  }
  async function newPl(pre) {
    pre = pre || {};
    const opts = dnsOpts('');
    const ok = await ask('Nuova playlist su OrbixPlay', `<div class="wf-f" style="grid-template-columns:1fr 1fr">
      <label style="grid-column:1/-1">ID del dispositivo (dall'app OrbixPlay)<input class="inp mono" id="onD" data-mac maxlength="64" autocomplete="off" placeholder="es. 00:1A:79:AA:BB:CC"></label>
      <label>Utente della linea<input class="inp mono" id="onU" value="${esc(pre.user || '')}"></label><label>Password della linea<input class="inp mono" id="onP" value="${esc(pre.pass || '')}"></label>
      <label>DNS${opts ? `<select class="inp" id="onH">${opts}</select>` : '<input class="inp mono" id="onH" placeholder="http://dns.esempio.com:8080">'}</label><label>Nome<input class="inp" id="onN" maxlength="40" value="${esc(pre.name || 'Kairos')}"></label>
      <label style="grid-column:1/-1">Note (facoltative)<input class="inp" id="onT" maxlength="60" value="${esc(pre.note || '')}"></label></div>
      <p class="mut" style="font-size:12.5px;margin:10px 0 0">Usa un posto del tuo account OrbixPlay.</p>`, 'Aggiungi');
    if (!ok) return;
    try { await api('POST', '/admin/oxp/playlists', { device: $('#onD').value, user: $('#onU').value, pass: $('#onP').value, host: $('#onH').value, hostUrl: ($('#onH').selectedOptions && $('#onH').selectedOptions[0] && $('#onH').selectedOptions[0].dataset.h) || '', name: $('#onN').value, notes: $('#onT').value }); toast('Playlist aggiunta su OrbixPlay'); load(); } catch (e) { toast(e.message, 1); }
  }
  async function chDns() {
    const hosts = [...new Set((O.pls || []).map((p) => p.host).filter(Boolean))];
    if (!hosts.length) return toast('Nessuna playlist', 1);
    const ok = await ask('Cambia DNS su OrbixPlay', `<label class="lbl">DNS attuale</label><select class="inp" id="odF">${hosts.map((h) => `<option value="${esc(h)}">${esc(h)} · ${(O.pls || []).filter((p) => p.host === h).length} playlist</option>`).join('')}</select>
      <label class="lbl" style="margin-top:10px">Nuovo DNS</label><input class="inp mono" id="odT" placeholder="http://nuovo-dns.esempio.com:8080">
      <p class="mut" style="font-size:12.5px;margin:10px 0 0">Tutte le playlist con il DNS attuale passano al nuovo, subito anche su OrbixPlay.</p>`, 'Cambia DNS');
    if (!ok) return;
    try { const r = await api('POST', '/admin/oxp/dns', { from: $('#odF').value, to: $('#odT').value }); toast(`DNS cambiato su ${r.changed} playlist${r.errors && r.errors.length ? ` · ${r.errors.length} errori` : ''}`, !!(r.errors && r.errors.length)); load(); } catch (e) { toast(e.message, 1); }
  }
  async function act(a, id) {
    const p = (O.pls || []).find((x) => x.id === id); if (!p) return;
    try {
      if (a === 'eye') { O.show.has(id) ? O.show.delete(id) : O.show.add(id); return render(); }
      if (a === 'cu') return copy(p.user, 'Utente');
      if (a === 'cp') return copy(p.pass, 'Password');
      if (a === 'edit') {
        const ok = await ask('Modifica playlist ' + (p.name || p.id), `<div class="wf-f" style="grid-template-columns:1fr 1fr">
          <label>Utente della linea<input class="inp mono" id="oeU" value="${esc(p.user)}"></label><label>Password della linea<input class="inp mono" id="oeP" value="${esc(p.pass)}"></label>
          <label>Nome<input class="inp" id="oeN" maxlength="40" value="${esc(p.name)}"></label>${isAg() ? '' : `<label>DNS<input class="inp mono" id="oeH" value="${esc(p.host)}"></label>`}
          <label style="grid-column:1/-1">Note<input class="inp" id="oeT" maxlength="60" value="${esc(p.notes)}"></label></div>
          <p class="mut" style="font-size:12.5px;margin:10px 0 0">Dispositivo ${esc(p.device)}. La modifica vale subito anche su OrbixPlay.</p>`, 'Salva');
        if (!ok) return;
        const body = { user: $('#oeU').value, pass: $('#oeP').value, name: $('#oeN').value, notes: $('#oeT').value }; if ($('#oeH')) body.host = $('#oeH').value;
        await api('PUT', '/admin/oxp/playlists/' + encodeURIComponent(id), body); toast('Playlist modificata su OrbixPlay'); return load();
      }
      if (a === 'del') {
        if (!(await ask('Eliminare la playlist ' + (p.name || p.id) + '?', `Viene tolta dal dispositivo ${esc(p.device)} su OrbixPlay; le altre playlist del dispositivo restano.`, 'Elimina'))) return;
        await api('DELETE', '/admin/oxp/playlists/' + encodeURIComponent(id)); toast('Playlist eliminata da OrbixPlay'); return load();
      }
    } catch (e) { toast(e.message, 1); }
  }
  function show() { try { render(); } catch (e) { const V = $('#v-oxp'); if (V) V.innerHTML = `<div class="card glass"><p style="color:#ff8f8f">Errore nella sezione OrbixPlay: ${esc(e.message || String(e))}</p></div>`; } }
  function open() { show(); if (!O.pls && !O.busy) load(); }
  /* da WOLF/Armada: apre OrbixPlay con «Nuova playlist» già compilata, resta solo l'ID del dispositivo */
  window.KXOxpNew = async (pre) => { view('oxp'); if (!O.pls) await load(); if (!canNew()) return toast('OrbixPlay non è collegato o non puoi creare playlist', 1); setTimeout(() => { newPl(pre); $('#onD') && $('#onD').focus(); }, 50); };
  const v0 = view;
  window.view = view = function (v) { const r = v0.apply(this, arguments); if (v === 'oxp') open(); return r; };
  const sec = $('#v-oxp');
  if (sec) new MutationObserver(() => { if (sec.classList.contains('on') && !sec.innerHTML.trim()) open(); }).observe(sec, { attributes: true, attributeFilter: ['class'] });
})();
