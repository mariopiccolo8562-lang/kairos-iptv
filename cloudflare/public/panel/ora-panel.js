/* KAIROS Control — «Pannello ORA» (panel.oraplayers.com): dispositivi, sub-reseller e crediti del tuo account ORA.
   ORA non ha API e il suo login ha la verifica «sono umano»: entri tu su ORA e con il pulsante «KAIROS ORA»
   nei Preferiti passi l'accesso a KAIROS. Solo il titolare. Usa app.js. */
(() => {
  const IC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>';
  if (!$('.nav[data-v="ora"]')) {
    const b = document.createElement('button'); b.className = 'nav'; b.dataset.v = 'ora'; b.innerHTML = IC + 'Pannello ORA'; b.onclick = () => view('ora');
    const anchor = $('.nav[data-v="oxp"]') || $('.nav[data-v="wolf"]') || $('.nav[data-v="devices"]'); anchor ? anchor.after(b) : $('#side').appendChild(b);
    const sec = document.createElement('section'); sec.className = 'view'; sec.id = 'v-ora'; $('#v-dash').after(sec);
  }
  TITLES.ora = 'Pannello ORA';
  const isAg = () => D.role === 'agent';
  const TABS = [['devices', 'Dispositivi'], ['subs', 'Sub-reseller'], ['credits', 'Crediti'], ['history', 'Movimenti'], ['info', 'Il mio account']];
  const R = { st: null, tab: 'devices', page: 0, q: '', data: null, total: null, path: '', err: '', busy: false, payOnly: false };
  const BM = `javascript:(()=>{const S=[localStorage,sessionStorage];let t='';for(const s of S){t=s.getItem('accessToken')||s.getItem('access_token')||'';if(t)break}if(!t)for(const s of S)for(let i=0;i<s.length&&!t;i++){const m=/eyJ[\\w-]+\\.[\\w-]+\\.[\\w-]+/.exec(s.getItem(s.key(i))||'');if(m)t=m[0]}t=t.replace(/^"|"$/g,'');if(!/oraplayers\\.com$/.test(location.hostname)){alert('Questo pulsante va cliccato quando sei dentro il pannello ORA (panel.oraplayers.com).');return}if(!t){alert('Prima entra su ORA con utente e password, poi clicca di nuovo KAIROS ORA.');return}const u='${location.origin}/panel/#ora='+encodeURIComponent(t);const w=window.open(u,'_blank');if(!w)location.href=u})()`;

  /* il pulsante nei Preferiti apre KAIROS con l'accesso nel «#»: lo prendo, lo tolgo dall'indirizzo e lo salvo appena sei dentro */
  const pend = () => { try { return sessionStorage.getItem('kxOraTok') || ''; } catch { return ''; } };
  const grab = () => {
    const h = /^#ora=([\w.%-]+)$/.exec(location.hash); if (!h) return;
    try { sessionStorage.setItem('kxOraTok', decodeURIComponent(h[1])); } catch {} history.replaceState(null, '', location.pathname + location.search);
    if (!pend()) return;
    const t0 = Date.now(), iv = setInterval(async () => {
      if (Date.now() - t0 > 10 * 60e3) return clearInterval(iv);
      if (!D.role && !D.settings) return;
      clearInterval(iv); const t = pend(); try { sessionStorage.removeItem('kxOraTok'); } catch {}
      if (isAg()) return toast('Solo il titolare può collegare ORA', 1);
      try { await api('PUT', '/admin/ora/token', { token: t }); toast('ORA collegato'); R.st = null; R.data = null; R.err = ''; view('ora'); } catch (e) { toast(e.message, 1); }
    }, 700);
  };
  grab(); window.addEventListener('hashchange', grab);

  const cell = (v) => {
    if (v == null || v === '') return '<span class="mut">—</span>';
    if (typeof v === 'boolean') return v ? 'sì' : 'no';
    if (typeof v === 'object') { const s = Array.isArray(v) ? v.map((x) => (x && typeof x === 'object' ? x.name || x.id || '' : x)).filter((x) => x !== '').join(', ') : (v.name || v.login || v.username || v.id || ''); return s === '' ? '<span class="mut">…</span>' : esc(String(s)); }
    const s = String(v); if (/^\d{4}-\d\d-\d\dT/.test(s)) { const d = new Date(s); if (!isNaN(d)) return esc(d.toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })); }
    return esc(s.length > 80 ? s.slice(0, 80) + '…' : s);
  };
  const rowsOf = (d) => (Array.isArray(d) ? d : d && typeof d === 'object' ? (['content', 'items', 'data', 'results', 'list', 'devices', 'resellers'].map((k) => d[k]).find(Array.isArray) || null) : null);
  const payRef = (r) => {
    for (const k of ['id', 'device_id', 'deviceId', 'mac', 'username', 'user', 'code']) {
      const v = r && r[k]; if ((typeof v === 'string' || typeof v === 'number') && String(v).trim()) return String(v).trim();
    }
    return '';
  };
  const HIDE = /password|passcode|pin|token|secret|hash/i;
  function table(rows) {
    if (R.tab === 'devices' && R.payOnly && window.KXPay) rows = KXPay.filterDue(rows, (r) => ['ora', payRef(r)]);
    if (!rows.length) return '<p class="mut" style="margin:14px 0">Nessun elemento.</p>';
    const keys = []; for (const r of rows.slice(0, 30)) for (const k of Object.keys(r || {})) if (!keys.includes(k) && !HIDE.test(k)) keys.push(k);
    const ks = keys.slice(0, 14);
    const payCol = R.tab === 'devices' && window.KXPay;
    return `<div style="overflow:auto"><table class="tbl" style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr>${ks.map((k) => `<th style="text-align:left;padding:8px;border-bottom:1px solid var(--line,#333);white-space:nowrap">${esc(k)}</th>`).join('')}${payCol ? '<th style="text-align:left;padding:8px;border-bottom:1px solid var(--line,#333);white-space:nowrap">Pagamento</th>' : ''}</tr></thead><tbody>${rows.map((r) => {
      const ref = payRef(r), label = r && (r.name || r.username || r.user || r.device_name || r.label) || ref;
      const pay = payCol && ref ? KXPay.badge('line', 'ora', ref) : '';
      const btn = payCol && ref && KXPay.canEdit() ? `<button class="btn sm act-pay" data-kxpay-open data-kind="line" data-panel="ora" data-ref="${esc(ref)}" data-label="${esc(label)}">💰 Pagamento</button>` : '';
      const noteAttrs = R.tab === 'devices' && ref ? `data-kx-line-note-ref="${esc(ref)}" data-kx-line-note-label="${esc(label)}"` : '';
      return `<tr ${noteAttrs}>${ks.map((k) => `<td style="padding:8px;border-bottom:1px solid var(--line,#222);vertical-align:top">${cell(r && r[k])}</td>`).join('')}${payCol ? `<td style="padding:8px;border-bottom:1px solid var(--line,#222);vertical-align:top">${pay}${btn ? `${pay ? '<br>' : ''}${btn}` : ''}</td>` : ''}</tr>`;
    }).join('')}</tbody></table></div>`;
  }
  function body() {
    if (R.busy) return '<p class="mut" style="margin:14px 0">Carico da ORA…</p>';
    if (R.err) return `<p style="color:#ff8f8f;margin:14px 0">${esc(R.err)}</p>`;
    if (R.data == null) return '';
    const rows = rowsOf(R.data);
    if (!rows) return `<div style="overflow:auto">${table([R.data])}</div>`;
    const more = rows.length >= 50 || (R.total && (R.page + 1) * 50 < R.total);
    return `<p class="mut" style="font-size:12.5px;margin:10px 0">${R.total != null ? R.total + ' in tutto · ' : ''}pagina ${R.page + 1}</p>${table(rows)}
      <div style="display:flex;gap:8px;margin-top:12px">${R.page > 0 ? '<button class="btn sm" data-o="prev">← Indietro</button>' : ''}${more ? '<button class="btn sm" data-o="next">Avanti →</button>' : ''}</div>`;
  }
  function render() {
    const V = $('#v-ora'); if (!V) return;
    if (isAg()) { V.innerHTML = '<div class="card glass"><p>Il Pannello ORA lo usa solo il titolare.</p></div>'; return; }
    const st = R.st || {};
    const exp = st.exp ? new Date(st.exp * 1000).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' }) : '';
    const ok = st.connected && !st.expired;
    V.innerHTML = `<div class="card glass" style="margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;gap:14px;flex-wrap:wrap;align-items:flex-start">
        <div><b style="font-size:16px">${ok ? '✅ ORA collegato' : st.connected ? '⚠️ Accesso ORA scaduto' : 'ORA non collegato'}</b>
          <p class="mut" style="margin:4px 0 0;font-size:13px">${ok ? `Account ${esc(st.user || '')}${exp ? ' · l\'accesso scade il ' + esc(exp) : ''}` : 'Entra su ORA nel tuo browser e clicca «KAIROS ORA» nei Preferiti (come crearlo è spiegato qui sotto).'}</p></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><a class="btn sm" href="https://panel.oraplayers.com/sign-in" target="_blank" rel="noopener" style="color:inherit;text-decoration:none">Apri ORA</a>${st.connected ? '<button class="btn sm" data-o="reload">Aggiorna</button><button class="btn sm" data-o="off">Scollega</button>' : ''}</div>
      </div>
      <details style="margin-top:12px"${ok ? '' : ' open'}><summary style="cursor:pointer;font-weight:600">Come si collega (una volta sola, da computer)</summary>
        <ol style="margin:10px 0 0;padding-left:20px;line-height:1.8;font-size:13.5px">
          <li><b>Crea il pulsante nei Preferiti</b> (una volta sola):
            <ol type="a" style="padding-left:18px;margin:4px 0">
              <li>premi <button class="btn sm pri" data-o="cpbm">Copia il pulsante</button></li>
              <li>in Chrome/Edge premi <b>Ctrl + Maiusc + B</b>: sotto la barra degli indirizzi compare la barra dei Preferiti;</li>
              <li>clicca col <b>tasto destro</b> su quella barra → <b>«Aggiungi pagina…»</b> (Edge: «Aggiungi preferito»);</li>
              <li>come <b>Nome</b> scrivi <b>KAIROS ORA</b>, nel campo <b>URL</b> cancella tutto e premi <b>Ctrl + V</b>, poi <b>Salva</b>.</li>
            </ol>
            <span class="mut" style="font-size:12.5px">Oppure trascina questo pulsante sulla barra dei Preferiti: <a class="btn sm" id="oraBm" href="#" style="cursor:grab;text-decoration:none;color:inherit" title="Trascinami nei Preferiti">KAIROS ORA</a></span></li>
          <li>Apri <a href="https://panel.oraplayers.com/sign-in" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline"><b>panel.oraplayers.com</b></a> ed entra come sempre (utente, password, «Verify you are human»).</li>
          <li>Quando vedi il pannello ORA aperto, clicca <b>KAIROS ORA</b> nella barra dei Preferiti: si apre KAIROS con «ORA collegato».</li>
        </ol>
        <p class="mut" style="font-size:12.5px;margin:8px 0 0">Quando ORA fa scadere l'accesso, ripeti solo i passi 2 e 3. Utente e password di ORA non passano mai da KAIROS.</p></details></div>
        ${st.connected ? `<div class="card glass"><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:6px">${TABS.map(([k, n]) => `<button class="btn sm${R.tab === k ? ' pri' : ''}" data-t="${k}">${n}</button>`).join('')}
        ${R.tab === 'devices' && window.KXPay ? R.payOnly ? '<button type="button" class="pay-panel-tile" data-kxpay-filter="ora">Mostra tutte le linee</button>' : KXPay.panelTile('ora') : ''}
        ${R.tab === 'devices' || R.tab === 'subs' ? `<input class="inp" id="oraQ" placeholder="Cerca…" value="${esc(R.q)}" style="max-width:240px;margin-left:auto">` : ''}</div>${body()}</div>` : ''}`;
    const bm = $('#oraBm'); if (bm) { bm.setAttribute('href', BM); bm.onclick = (e) => { e.preventDefault(); toast('Non cliccarlo qui: usa «Copia il pulsante» oppure trascinalo nella barra dei Preferiti', 1); }; }
    $$('[data-t]', V).forEach((b) => (b.onclick = () => { R.tab = b.dataset.t; R.page = 0; R.q = ''; R.payOnly = false; load(); }));
    $$('[data-o]', V).forEach((b) => (b.onclick = async () => {
      const o = b.dataset.o;
      if (o === 'cpbm') return navigator.clipboard.writeText(BM).then(() => toast('Pulsante copiato: ora incollalo nei Preferiti come URL'), () => toast('Il browser non permette di copiare: trascina il pulsante KAIROS ORA', 1));
      if (o === 'prev') { R.page--; return load(); } if (o === 'next') { R.page++; return load(); }
      if (o === 'reload') { R.st = null; return open(); }
      if (o === 'off') { if (!(await ask('Scollegare ORA?', 'KAIROS dimentica l\'accesso a ORA. Su ORA non cambia niente.', 'Scollega'))) return; await api('DELETE', '/admin/ora/token').catch((e) => toast(e.message, 1)); R.st = null; R.data = null; return open(); }
    }));
    const q = $('#oraQ'); if (q) q.onkeydown = (e) => { if (e.key === 'Enter') { R.q = q.value.trim(); R.page = 0; load(); } };
  }
  async function load() {
    R.busy = true; R.err = ''; show();
    try { const j = await api('GET', `/admin/ora/data?w=${R.tab}&page=${R.page}&q=${encodeURIComponent(R.q)}`); R.data = j.data; R.total = j.total; R.path = j.path; }
    catch (e) { R.err = e.message; R.data = null; if (/scadut/i.test(e.message) && R.st) R.st.expired = true; }
    R.busy = false; show();
  }
  function show() { try { render(); } catch (e) { const V = $('#v-ora'); if (V) V.innerHTML = `<div class="card glass"><p style="color:#ff8f8f">Errore nella sezione ORA: ${esc(e.message || String(e))}</p></div>`; } }
  async function open() {
    if (isAg()) return show();
    if (!R.st) { try { R.st = await api('GET', '/admin/ora/state'); } catch (e) { R.st = { connected: false }; R.err = e.message; } }
    show(); if (R.st.connected && R.data == null && !R.busy && !R.err) load();
  }
  const v0 = view;
  window.view = view = function (v) { const r = v0.apply(this, arguments); if (v === 'ora') open(); return r; };
  window.addEventListener('kxpay:filter', (e) => {
    if (e.detail.panel !== 'ora') return;
    const wasDevices = R.tab === 'devices';
    R.tab = 'devices'; R.page = 0; R.payOnly = !R.payOnly;
    if (!wasDevices || R.data == null) load(); else show();
  });
  window.addEventListener('kxpay:update', () => { if ($('#v-ora')?.classList.contains('on')) show(); });
})();
