/* KAIROS Control — Pannelli IPTV esterni senza API: «Pannello Realott» (my.realott.com), «Pannello SLT» (p.slt.st) e
   «Pannello blkaccess» (reseller.blkaccess.com). Realott e SLT: KAIROS entra con utente e password (cifrati) e legge/scrive
   direttamente sul pannello. blkaccess ha il controllo Cloudflare «sono umano»: le linee arrivano con il pulsante nei Preferiti.
   Solo il titolare (Master). Usa app.js. */
(() => {
  const isAg = () => D.role === 'agent';
  const PANELS = {
    ro: { name: 'Realott', url: 'https://my.realott.com/login', site: 'my.realott.com', ic: '<path d="M4 6h16v12H4z"/><path d="M8 18v2M16 18v2M8 10h8M8 13h5"/>' },
    slt: { name: 'SLT', url: 'https://p.slt.st/dashboard', site: 'p.slt.st', ic: '<path d="M12 2l9 5v10l-9 5-9-5V7z"/><path d="M12 12l9-5M12 12v10M12 12L3 7"/>' },
    blk: { name: 'blkaccess', url: '', site: 'reseller.blkaccess.com', ic: '<rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>' },
  };
  const svg = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  let anchor = $('.nav[data-v="atx"]') || $('.nav[data-v="ora"]') || $('.nav[data-v="wolf"]');
  for (const [k, P] of Object.entries(PANELS)) {
    if ($(`.nav[data-v="${k}"]`)) continue;
    const b = document.createElement('button'); b.className = 'nav'; b.dataset.v = k; b.innerHTML = svg(P.ic) + 'Pannello ' + P.name; b.onclick = () => view(k);
    anchor ? anchor.after(b) : $('#side').appendChild(b); anchor = b;
    const sec = document.createElement('section'); sec.className = 'view'; sec.id = 'v-' + k; $('#v-dash').after(sec);
    TITLES[k] = 'Pannello ' + P.name;
  }
  const TABS = [['lines', 'Linee'], ['subs', 'Sub-reseller'], ['conns', 'Connessioni'], ['overview', 'Panoramica']];
  const ST = {}; for (const k of Object.keys(PANELS)) ST[k] = { st: null, tab: 'lines', q: '', status: '', data: null, err: '', busy: false, edit: false, pk: null };
  const now = () => Math.floor(Date.now() / 1000);
  const day = (t, txt) => { const n = Number(t); if (!n) return txt ? esc(txt) : 'Illimitato'; const d = new Date(n * 1000); return isNaN(d) ? esc(txt || '') : d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }); };
  const badge = (t, c) => `<span style="display:inline-block;padding:2px 9px;border-radius:999px;font-size:12px;font-weight:600;background:${c}22;color:${c}">${esc(t)}</span>`;
  const lineState = (r) => !r.enabled ? badge(r.status || 'Disattivata', '#9aa4b2') : r.expired || (r.exp && r.exp < now()) ? badge('Scaduta', '#ff6b6b') : r.exp && r.exp - now() < 7 * 86400 ? badge('In scadenza', '#ffb020') : r.trial ? badge('Prova', '#4f8cff') : badge('Attiva', '#2ecc71');
  const mut = '<span class="mut">—</span>';
  const copy = (v, what) => navigator.clipboard.writeText(String(v)).then(() => toast(what + ' copiato'), () => toast('Copia non riuscita', 1));
  const m3u = (dns, r) => { let d = String(dns || '').trim().replace(/\/+$/, ''); if (!d || !r.username) return ''; if (!/^https?:\/\//i.test(d)) d = 'http://' + d; return `${d}/get.php?username=${encodeURIComponent(r.username)}&password=${encodeURIComponent(r.password || '')}&type=m3u_plus&output=ts`; };
  const TH = 'text-align:left;padding:9px 8px;border-bottom:1px solid var(--line,#333);white-space:nowrap;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--mut)';
  const TD = 'padding:9px 8px;border-bottom:1px solid var(--line,#222);vertical-align:middle';
  const grid = (heads, rows) => `<div style="overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:13.5px"><thead><tr>${heads.map((h) => `<th style="${TH}">${h}</th>`).join('')}</tr></thead><tbody>${rows.join('') || `<tr><td colspan="${heads.length}" class="mut" style="padding:14px 8px">Niente da mostrare.</td></tr>`}</tbody></table></div>`;
  const tr = (cells) => `<tr>${cells.map((c) => `<td style="${TD}">${c}</td>`).join('')}</tr>`;
  const btn = (a, i, t, extra = '') => `<button class="btn sm" data-a="${a}" data-i="${i}" ${extra}>${t}</button>`;
  const filt = (k, rows) => { const A = ST[k], q = A.q.toLowerCase(); return rows.filter((r) => (!q || [r.username, r.notes, r.owner, r.type].some((x) => String(x || '').toLowerCase().includes(q))) && (!A.status || (A.status === 'active' ? r.enabled && !r.expired : A.status === 'expired' ? r.expired : A.status === 'disabled' ? !r.enabled : A.status === 'online' ? r.conns > 0 : A.status === 'expiring' ? r.exp && r.exp > now() && r.exp - now() < 7 * 86400 : true))); };

  function linesHtml(k, rows, dns) {
    const all = ST[k].data.rows, snap = k === 'blk';
    return grid(snap ? ['Utente', 'Password', 'Scadenza', 'Stato', 'Conn.', 'Reseller', 'Note'] : ['Utente', 'Password', 'Stato', 'Scadenza', 'Conn.', 'Pacchetto', 'Reseller', 'Note', ''], rows.map((r) => {
      const i = all.indexOf(r);
      if (snap) return tr([`<b>${esc(r.username)}</b>`, r.password ? `<span class="mono">${esc(r.password)}</span> ${btn('cp', i, 'Copia')}` : mut, esc(r.exp || '—'), esc(r.status || '—'), esc(r.conns || '—'), esc(r.owner || '—'), esc(r.notes || '—')]);
      const acts = [btn('renew', i, 'Rinnova'), btn(r.enabled ? 'off' : 'on', i, r.enabled ? 'Disattiva' : 'Attiva'), btn('kill', i, 'Disconnetti'), dns ? btn('m3u', i, 'M3U') : '', btn('mxp', i, 'MaxPlayer'), btn('oxp', i, 'OrbixPlay'), btn('del', i, 'Elimina', 'style="color:#ff8f8f"')].filter(Boolean).join(' ');
      return tr([`<b>${esc(r.username)}</b> ${btn('cu', i, 'Copia')}${r.ip ? `<br><span class="mut" style="font-size:11.5px">${esc(r.stream || '')}${r.last ? ' · ' + esc(r.last) : ''}</span>` : ''}`, r.password ? `<span class="mono">${esc(r.password)}</span> ${btn('cp', i, 'Copia')}` : mut, lineState(r), day(r.exp, r.expTxt), r.max ? `${r.conns}/${r.max}` : String(r.conns ?? '—'), esc(r.type || '—'), esc(r.owner || '—'), r.notes ? esc(r.notes) : mut, `<div style="display:flex;gap:4px;flex-wrap:wrap">${acts}</div>`]);
    }));
  }
  const subsHtml = (k, rows) => grid(['Utente', 'Superiore', 'Tipo', 'Crediti', 'Linee', 'Stato', ''], rows.map((r, i) => tr([`<b>${esc(r.username)}</b>`, esc(r.owner || '—'), esc(r.type || '—'), esc(String(r.credits ?? '—')), esc(String(r.lines ?? '—')), r.enabled ? badge(r.status || 'Attivo', '#2ecc71') : badge(r.status || 'Disattivato', '#9aa4b2'), k === 'ro' ? btn('stog', i, r.enabled ? 'Disattiva' : 'Riattiva') : ''])));
  const connsHtml = (rows) => grid(['Utente', 'Canale', 'IP', 'Info'], rows.map((r) => tr([`<b>${esc(r.username)}</b>`, esc(r.stream || '—'), esc(r.ip || '—'), esc(r.info || '—')])));
  const overviewHtml = (d) => `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px">${[['Crediti', d.credits], ['Linee totali', d.total], ['Attive', d.active], ['Scadute', d.expired], ['Online', d.online], ['Connessioni', d.conns]].filter(([, v]) => v != null).map(([l, v]) => `<div class="card" style="padding:14px"><div class="mut" style="font-size:12px">${l}</div><div style="font-size:24px;font-weight:700">${esc(String(v))}</div></div>`).join('')}</div>`;

  function body(k) {
    const A = ST[k], P = PANELS[k];
    if (A.busy) return `<p class="mut" style="margin:14px 0">Carico da ${P.name}…</p>`;
    if (A.err) return `<p style="color:#ff8f8f;margin:14px 0">${esc(A.err)}</p>`;
    if (A.data == null) return '';
    if (A.tab === 'overview') return overviewHtml(A.data);
    const rows = Array.isArray(A.data.rows) ? A.data.rows : [], vis = A.tab === 'lines' ? filt(k, rows) : rows;
    const sum = A.tab === 'lines' ? ` · attive: <b>${rows.filter((r) => r.enabled && !r.expired).length}</b> · scadute: <b>${rows.filter((r) => r.expired).length}</b> · disattivate: <b>${rows.filter((r) => !r.enabled).length}</b>${A.data.dns && k !== 'blk' ? ` · DNS: <b>${esc(A.data.dns)}</b>` : ''}` : '';
    return `<p style="font-size:12.5px;margin:10px 0">${vis.length}${vis.length !== rows.length ? ' di ' + rows.length : ''} ${A.tab === 'lines' ? 'linee' : A.tab === 'subs' ? 'sub-reseller' : 'collegati'}${sum}</p>${A.tab === 'lines' ? linesHtml(k, vis, A.data.dns) : A.tab === 'subs' ? subsHtml(k, vis) : connsHtml(vis)}`;
  }
  function toolbar(k) {
    const A = ST[k]; if (A.tab !== 'lines') return '';
    const st = `<select class="inp" id="exS" style="max-width:160px">${[['', 'Tutti gli stati'], ['active', 'Attive'], ['expiring', 'In scadenza'], ['expired', 'Scadute'], ['disabled', 'Disattivate'], ['online', 'Online']].map(([v, t]) => `<option value="${v}"${A.status === v ? ' selected' : ''}>${t}</option>`).join('')}</select>`;
    return `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-left:auto">${k === 'blk' ? '' : st}<input class="inp" id="exQ" placeholder="Cerca utente…" value="${esc(A.q)}" style="max-width:200px">${k === 'blk' ? '' : '<button class="btn pri sm" data-o="new">+ Nuova linea</button>' + (window.KXQuick ? KXQuick.button(k) : '')}</div>`;
  }
  const kx = () => location.origin + location.pathname;
  const BM = `javascript:(()=>{const H=(t)=>(t.innerText||t.textContent||'').trim();const tabs=[...document.querySelectorAll('table')].filter(t=>t.querySelectorAll('tr').length>1);let best=null,bm=-1;for(const t of tabs){const hs=[...(t.querySelector('thead')||t.querySelector('tr')).querySelectorAll('th,td')].map(H);const i={};hs.forEach((h,x)=>{h=h.toLowerCase();if(/^user|username|utente|login/.test(h))i.u=i.u??x;else if(/pass/.test(h))i.p=i.p??x;else if(/exp|scad/.test(h))i.e=i.e??x;else if(/status|stato|enabled|attiv|online/.test(h))i.s=i.s??x;else if(/conn|max/.test(h))i.c=i.c??x;else if(/owner|member|reseller|propr/.test(h))i.o=i.o??x;else if(/note|desc|comment/.test(h))i.n=i.n??x;});const sc=(i.u!=null)+(i.p!=null)+(i.e!=null);if(i.u!=null&&sc>bm){bm=sc;best={t,i};}}if(!best){alert('Apri la pagina con la lista delle linee e ripremi il pulsante');return;}const {t,i}=best;const rows=[];t.querySelectorAll('tr').forEach(r=>{if(r.querySelector('th'))return;const c=[...r.children].map(H);const g=k=>i[k]!=null?(c[i[k]]||''):'';const u=g('u');if(!u)return;rows.push({username:u,password:g('p'),exp:g('e'),status:g('s'),conns:g('c'),owner:g('o'),notes:g('n')});});if(!rows.length){alert('Nessuna linea in questa pagina');return;}window.open('${kx()}#blk='+encodeURIComponent(JSON.stringify({rows,from:location.host})),'_blank');})()`;
  const pendBlk = () => { try { return sessionStorage.getItem('kxBlkSnap') || ''; } catch { return ''; } };
  const grab = () => {
    const h = /^#blk=(.+)$/.exec(location.hash); if (!h) return;
    try { sessionStorage.setItem('kxBlkSnap', decodeURIComponent(h[1])); } catch {} history.replaceState(null, '', location.pathname + location.search);
    if (!pendBlk()) return;
    const t0 = Date.now(), iv = setInterval(async () => {
      if (Date.now() - t0 > 10 * 60e3) return clearInterval(iv);
      if (!D.role && !D.settings) return;
      clearInterval(iv); const t = pendBlk(); try { sessionStorage.removeItem('kxBlkSnap'); } catch {}
      if (isAg()) return toast('Solo il titolare può usare il Pannello blkaccess', 1);
      try { const d = JSON.parse(t); const r = await api('POST', '/admin/blk/snapshot', d); toast(`blkaccess: ${r.count} linee aggiornate`); ST.blk.st = null; ST.blk.data = null; ST.blk.err = ''; view('blk'); } catch (e) { toast(e.message, 1); }
    }, 700);
  };
  grab(); window.addEventListener('hashchange', grab);

  function render(k) {
    const V = $('#v-' + k); if (!V) return; const A = ST[k], P = PANELS[k];
    if (isAg()) { V.innerHTML = `<div class="card glass"><p>Il Pannello ${esc(P.name)} lo usa solo il Master.</p></div>`; return; }
    const st = A.st || {};
    if (k === 'blk') {
      const url = st.url || 'https://reseller.blkaccess.com/';
      V.innerHTML = `<div class="card glass" style="margin-bottom:14px">
        <div style="display:flex;justify-content:space-between;gap:14px;flex-wrap:wrap;align-items:flex-start">
          <div><b style="font-size:16px">${st.connected ? `✅ blkaccess: ${st.count} linee` : 'blkaccess: nessuna linea ancora'}</b>
            <p class="mut" style="margin:4px 0 0;font-size:13px">${st.connected ? 'Ultimo aggiornamento ' + new Date(st.updated * 1000).toLocaleString('it-IT') + (st.from ? ' da ' + esc(st.from) : '') : 'Questo pannello ha il controllo Cloudflare «sono umano», quindi KAIROS non può entrarci da solo.'}</p></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap"><a class="btn sm" href="${esc(url)}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none">Apri blkaccess</a><button class="btn sm" data-o="edit">${A.edit ? 'Chiudi' : 'Indirizzo'}</button>${st.connected ? '<button class="btn sm" data-o="off">Cancella linee</button>' : ''}</div></div>
        ${A.edit ? `<div style="display:grid;grid-template-columns:1fr auto;gap:10px;margin-top:14px;align-items:end"><label>Indirizzo del pannello (il link con cui entri)<input class="inp" id="exUrl" value="${esc(st.url || '')}" placeholder="https://reseller.blkaccess.com/…/login.php?acto=…"></label><button class="btn pri" data-o="saveurl">Salva</button></div>` : ''}
        <div style="margin-top:14px;padding:12px;border:1px dashed var(--line,#444);border-radius:10px">
          <b>Come portare le linee qui</b>
          <ol style="margin:8px 0 0 18px;padding:0;font-size:13px;line-height:1.7">
            <li>Trascina questo pulsante nella barra dei Preferiti: <a id="exBm" class="btn sm pri" href="#" style="text-decoration:none">KAIROS ← blkaccess</a> <button class="btn sm" data-o="copybm">Copia il pulsante</button></li>
            <li>Entra su blkaccess e apri la lista delle linee (scegli «mostra tutte»).</li>
            <li>Premi il pulsante nei Preferiti: si apre KAIROS e le linee compaiono qui sotto.</li></ol>
          <p class="mut" style="font-size:12px;margin:8px 0 0">È una fotografia: rinnovi e nuove linee si fanno su blkaccess, poi ripremi il pulsante per aggiornare. Per segnare un'attivazione usa «+ Aggiungi a mano» in Appunti App.</p></div></div>
        ${st.connected ? `<div class="card glass"><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:6px"><b>Linee</b>${toolbar(k)}</div>${body(k)}</div>` : ''}`;
      const bm = $('#exBm'); if (bm) { bm.setAttribute('href', BM); bm.onclick = (e) => { e.preventDefault(); toast('Non cliccarlo qui: trascinalo nella barra dei Preferiti oppure usa «Copia il pulsante»', 1); }; }
    } else {
      const form = !st.connected || A.edit;
      V.innerHTML = `<div class="card glass" style="margin-bottom:14px">
        <div style="display:flex;justify-content:space-between;gap:14px;flex-wrap:wrap;align-items:flex-start">
          <div><b style="font-size:16px">${st.connected ? `✅ ${esc(P.name)} collegato` : `${esc(P.name)} non collegato`}</b>
            <p class="mut" style="margin:4px 0 0;font-size:13px">${st.connected ? 'Account ' + esc(st.user || '') : `Scrivi qui i dati con cui entri su ${esc(P.site)}: restano cifrati in KAIROS e li vedi solo tu.`}</p></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap"><a class="btn sm" href="${esc(P.url)}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none">Apri ${esc(P.name)}</a>${st.connected ? `<button class="btn sm" data-o="reload">Aggiorna</button><button class="btn sm" data-o="edit">${A.edit ? 'Chiudi' : 'Cambia dati'}</button><button class="btn sm" data-o="off">Scollega</button>` : ''}</div></div>
        ${form ? `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-top:14px">
          <label>Username<input class="inp" id="exU" autocomplete="off" value="${esc(st.user || '')}"></label>
          <label>Password<input class="inp" id="exP" type="password" autocomplete="new-password" placeholder="${st.connected ? 'lascia vuoto per non cambiarla' : ''}"></label></div>
          <button class="btn pri" data-o="save" style="margin-top:12px">Collega ${esc(P.name)}</button>` : ''}</div>
        ${st.connected ? `<div class="card glass"><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:6px">${TABS.map(([t, n]) => `<button class="btn sm${A.tab === t ? ' pri' : ''}" data-t="${t}">${n}</button>`).join('')}${toolbar(k)}</div>${body(k)}</div>` : ''}`;
    }
    $$('[data-t]', V).forEach((b) => (b.onclick = () => { A.tab = b.dataset.t; A.q = ''; A.status = ''; load(k); }));
    $$('[data-o]', V).forEach((b) => (b.onclick = () => op(k, b.dataset.o)));
    $$('[data-a]', V).forEach((b) => (b.onclick = () => act(k, b.dataset.a, (A.data && A.data.rows || [])[+b.dataset.i])));
    const q = $('#exQ', V); if (q) q.oninput = () => { A.q = q.value.trim(); const x = $('#exQ', V); show(k); const y = $('#exQ', V); if (y && x !== y) { y.focus(); y.setSelectionRange(y.value.length, y.value.length); } };
    const s = $('#exS', V); if (s) s.onchange = () => { A.status = s.value; show(k); };
  }
  const fieldHtml = (f, i) => {
    const id = 'exF' + i, req = f.required ? ' *' : '';
    if (f.type === 'select') return `<label>${esc(f.label)}${req}<select class="inp" id="${id}">${f.options.map((o) => `<option value="${esc(o.v)}"${o.sel ? ' selected' : ''}>${esc(o.t)}</option>`).join('')}</select></label>`;
    if (f.type === 'checkbox') return `<label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="${id}"${f.checked ? ' checked' : ''}> ${esc(f.label)}</label>`;
    if (f.type === 'textarea') return `<label>${esc(f.label)}${req}<textarea class="inp" id="${id}" rows="2">${esc(f.value || '')}</textarea></label>`;
    return `<label>${esc(f.label)}${req}<input class="inp" id="${id}" value="${esc(f.value || '')}"></label>`;
  };
  async function newLine(k) {
    const P = PANELS[k]; toast(`Carico i pacchetti di ${P.name}…`);
    const { fields } = await api('GET', `/admin/${k}/createform`);
    if (!(await ask(`Nuova linea ${P.name}`, `<p class="mut" style="font-size:13px">La creazione usa i crediti del tuo account ${esc(P.name)}. Utente e password vuoti li genera KAIROS.</p><div style="display:grid;gap:10px">${fields.map(fieldHtml).join('')}</div>`, 'Crea linea'))) return;
    const vals = {}; fields.forEach((f, i) => { const el = $('#exF' + i); if (el) vals[f.name] = f.type === 'checkbox' ? el.checked : el.value; });
    const miss = fields.find((f) => f.required && f.type !== 'checkbox' && !String(vals[f.name] || '').trim()); if (miss) return toast('Compila «' + miss.label + '»', 1);
    const r = await api('POST', `/admin/${k}/lines/create`, { fields: vals });
    await ask('Linea creata', `<p>Utente: <b>${esc(r.username)}</b><br>Password: <b>${esc(r.password)}</b></p><p class="mut" style="font-size:12.5px">È già segnata in Appunti App.</p>`, 'OK');
    return load(k);
  }
  async function op(k, o) {
    const A = ST[k], P = PANELS[k];
    try {
      if (o === 'new') return await newLine(k);
      if (o === 'reload') { A.st = null; A.data = null; A.err = ''; A.pk = null; return open(k); }
      if (o === 'edit') { A.edit = !A.edit; return show(k); }
      if (o === 'copybm') return copy(BM, 'Pulsante');
      if (o === 'saveurl') { await api('PUT', '/admin/blk/config', { url: $('#exUrl').value.trim() }); toast('Indirizzo salvato'); A.edit = false; A.st = null; return open(k); }
      if (o === 'off') { if (!(await ask(k === 'blk' ? 'Cancellare le linee salvate?' : `Scollegare ${P.name}?`, k === 'blk' ? 'KAIROS cancella la fotografia delle linee di blkaccess. Su blkaccess non cambia niente.' : `KAIROS dimentica utente e password di ${esc(P.name)}. Su ${esc(P.name)} non cambia niente.`, k === 'blk' ? 'Cancella' : 'Scollega'))) return; await api('DELETE', `/admin/${k}/config`); A.st = null; A.data = null; return open(k); }
      if (o === 'save') {
        const b = { user: $('#exU').value.trim(), pass: $('#exP').value };
        if (!b.user || (!b.pass && !(A.st || {}).connected)) return toast(`Scrivi utente e password di ${P.name}`, 1);
        toast(`Entro su ${P.name}…`); await api('PUT', `/admin/${k}/config`, b); toast(`${P.name} collegato`); A.edit = false; A.st = null; A.data = null; A.err = ''; return open(k);
      }
    } catch (e) { toast(e.message, 1); }
  }
  const lineAct = (k, body, msg) => api('POST', `/admin/${k}/lines/action`, body).then((r) => { toast(msg + (r.balance != null ? ` · crediti: ${r.balance}` : '')); return load(k); });
  async function act(k, a, r) {
    if (!r) return; const A = ST[k], P = PANELS[k], u = r.username || '#' + (r.id || ''), U = esc(u);
    try {
      if (a === 'cu') return copy(r.username, 'Utente');
      if (a === 'cp') return copy(r.password, 'Password');
      if (a === 'm3u') return copy(m3u(A.data.dns, r), 'Link M3U');
      if (a === 'mxp' || a === 'oxp') { const pre = { user: r.username, pass: r.password, name: r.username, note: P.name + (r.id ? ' #' + r.id : '') }; return a === 'mxp' ? KXMxpNew(pre) : KXOxpNew(pre); }
      if (a === 'renew') {
        if (!A.pk) A.pk = (await api('GET', `/admin/${k}/packages`)).packages || [];
        if (!(await ask('Rinnovare ' + u + '?', `<p>Scade il <b>${day(r.exp, r.expTxt)}</b>. Il rinnovo usa i crediti del tuo account ${esc(P.name)}.</p><label>Pacchetto<select class="inp" id="exM">${A.pk.map((p) => `<option value="${esc(p.id)}"${String(p.id) === String(r.pkg) ? ' selected' : ''}>${esc(p.name)} — ${p.cost} crediti${p.dur ? ' · ' + esc(String(p.dur)) : ''}</option>`).join('')}</select></label>`, 'Rinnova'))) return;
        return await lineAct(k, { action: 'renew', id: r.id, username: r.username, package_id: $('#exM').value }, `${u} rinnovata`);
      }
      if (a === 'on' || a === 'off') { const en = a === 'on'; if (!(await ask((en ? 'Attivare ' : 'Disattivare ') + u + '?', `La linea ${U} viene ${en ? 'attivata' : 'disattivata'} subito su ${esc(P.name)}.`, en ? 'Attiva' : 'Disattiva'))) return; return await lineAct(k, { action: 'toggle', id: r.id, username: r.username, enabled: en }, `${u} ${en ? 'attivata' : 'disattivata'}`); }
      if (a === 'kill') { if (!(await ask('Disconnettere ' + u + '?', 'Chiude le connessioni aperte adesso su questa linea. Il cliente potrà ricollegarsi.', 'Disconnetti'))) return; return await lineAct(k, { action: 'kill', id: r.id, username: r.username }, `${u}: connessioni chiuse`); }
      if (a === 'del') { if (!(await ask('Eliminare ' + u + '?', `<p>La linea <b>${U}</b> viene <b>eliminata definitivamente</b> da ${esc(P.name)}. Non si può annullare.</p>`, 'Elimina'))) return; return await lineAct(k, { action: 'delete', id: r.id, username: r.username }, `${u} eliminata`); }
      if (a === 'stog') { if (!(await ask((r.enabled ? 'Disattivare ' : 'Riattivare ') + u + '?', `Il sub-reseller ${U} viene ${r.enabled ? 'disattivato' : 'riattivato'} su ${esc(P.name)}.`, r.enabled ? 'Disattiva' : 'Riattiva'))) return; await api('POST', `/admin/${k}/subs/action`, { op: 'toggle', id: r.id }); toast('Fatto'); return load(k); }
    } catch (e) { toast(e.message, 1); }
  }
  async function load(k) {
    const A = ST[k]; A.busy = true; A.err = ''; show(k);
    try { A.data = await api('GET', `/admin/${k}/${k === 'blk' ? 'lines' : A.tab}`); } catch (e) { A.err = e.message; A.data = null; }
    A.busy = false; show(k);
  }
  function show(k) { try { render(k); } catch (e) { const V = $('#v-' + k); if (V) V.innerHTML = `<div class="card glass"><p style="color:#ff8f8f">Errore nella sezione ${esc(PANELS[k].name)}: ${esc(e.message || String(e))}</p></div>`; } }
  async function open(k) {
    const A = ST[k]; if (isAg()) return show(k);
    if (!A.st) { try { A.st = await api('GET', `/admin/${k}/state`); } catch (e) { A.st = { connected: false }; A.err = e.message; } }
    show(k); if (A.st.connected && A.data == null && !A.busy && !A.err) load(k);
  }
  const v0 = view;
  window.view = view = function (v) { const r = v0.apply(this, arguments); if (PANELS[v]) open(v); return r; };
})();
