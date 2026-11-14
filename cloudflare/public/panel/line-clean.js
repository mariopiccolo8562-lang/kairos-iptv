/* KAIROS Control — Linee IPTV → «🧹 Pulizia scadute» (14 novembre 2026).
   Cancella in un colpo solo le linee scadute da tanto tempo dai pannelli WOLF, Atlantix, Realott e SLT:
   - 1 · da quanto: scadute da più di 7, 10 o 20 giorni, oppure prima di una data scelta;
   - 2 · di chi: tutte (titolare e agenti) o un solo reseller; quali pannelli;
   - 3 · l'elenco con le spunte (si può togliere una linea dalla pulizia) e la conferma scrivendo il numero di linee.
   Usa le stesse letture e le stesse cancellazioni delle schede dei pannelli (DELETE /admin/wolf/lines/<id>,
   POST /admin/atx/lines/action e /admin/<ro|slt>/lines/action con action «delete»): una linea alla volta, ognuna
   finisce nel registro Attività. Diritti e limiti li decide il server come per il pulsante «Elimina» della linea:
   l'agente vede e cancella solo le sue. Armada e Storm non hanno la cancellazione dal pannello: qui non compaiono.
   Niente parte da solo: la pulizia si avvia solo con il pulsante e la conferma.
   Usa app.js ($, $$, esc, api, view, toast, ask, TITLES, D) e, se ci sono, KXSort, KXPay, KXAllPanels. */
(() => {
  if (!$('#side')) return;
  const css = document.createElement('style');
  css.textContent = `
#v-lclean .lc-warn{border:1px solid rgba(251,191,36,.35);background:rgba(251,191,36,.07);border-radius:12px;padding:10px 14px;font-size:13.5px;line-height:1.5;margin:12px 0}
#v-lclean .lc-step{margin:16px 0 0}
#v-lclean .lc-step>b{display:block;font-size:14px;margin-bottom:4px}
#v-lclean .lc-step>small{display:block;color:var(--mut);font-size:12.5px;line-height:1.45;margin-bottom:8px}
#v-lclean .lc-opts{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
#v-lclean .lc-opts .inp{margin:0;width:auto}
#v-lclean .lc-info{font-size:12.5px;color:var(--mut);margin-top:8px}
#v-lclean .lc-err{font-size:12.5px;color:#fbbf24;margin-top:6px}
#v-lclean .lc-sum{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:14px 0 8px;font-size:14px}
#v-lclean .lc-sum b{font-size:17px}
#v-lclean .lc-list{border:1px solid var(--line);border-radius:14px;overflow:hidden;max-height:52vh;overflow-y:auto}
#v-lclean .lc-row{display:grid;grid-template-columns:26px 86px minmax(0,1.1fr) minmax(0,1.3fr) 150px minmax(0,.9fr);gap:10px;align-items:center;padding:9px 12px;border-top:1px solid var(--line);font-size:13.5px}
#v-lclean .lc-row:first-child{border-top:0}
#v-lclean .lc-row.off{opacity:.5}
#v-lclean .lc-row.lc-head{font-size:11.5px;color:var(--mut);text-transform:uppercase;letter-spacing:.05em;position:sticky;top:0;background:var(--bg2,#0b1020);z-index:1}
#v-lclean .lc-row input{width:17px;height:17px;margin:0;cursor:pointer;accent-color:#f87171}
#v-lclean .lc-row>span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#v-lclean .lc-row small{display:block;color:var(--mut);font-size:11.5px}
#v-lclean .lc-pn{font-weight:800;font-size:11.5px;letter-spacing:.04em;color:var(--c)}
#v-lclean .lc-u{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-weight:700}
#v-lclean .lc-tag{display:inline-block;font-size:10.5px;font-weight:800;border-radius:99px;padding:1px 7px;margin-left:6px;border:1px solid currentColor}
#v-lclean .lc-tag.due{color:#fbbf24}
#v-lclean .lc-tag.dis{color:#94a3b8}
#v-lclean .lc-empty{padding:24px;text-align:center;color:var(--mut)}
#v-lclean .lc-go{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:14px}
#v-lclean .lc-bar{height:8px;border-radius:99px;background:rgba(255,255,255,.08);overflow:hidden;margin:10px 0}
#v-lclean .lc-bar i{display:block;height:100%;background:linear-gradient(90deg,#f87171,#fbbf24);transition:width .25s}
#v-lclean .lc-done{border:1px solid var(--line);border-radius:12px;padding:12px 14px;margin-top:12px;font-size:13.5px;line-height:1.5}
@media (max-width:820px){
  #v-lclean .lc-row.lc-head{display:none}
  #v-lclean .lc-row{grid-template-columns:26px minmax(0,1fr) minmax(0,1fr);gap:3px 10px}
  #v-lclean .lc-row>input{grid-column:1;grid-row:1/span 3;align-self:start;margin-top:3px}
  #v-lclean .lc-row>.lc-pn{grid-column:2/-1}
}`;
  document.head.appendChild(css);

  const IC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 3h4M6 7l1 13h10l1-13M10 11v6M14 11v6"/></svg>';
  if (!$('.nav[data-v="lclean"]')) {
    const b = document.createElement('button'); b.className = 'nav'; b.dataset.v = 'lclean'; b.innerHTML = IC + 'Pulizia scadute'; b.onclick = () => view('lclean');
    const ref = $('.nav[data-v="wolf"]'); ref ? ref.before(b) : $('#side').appendChild(b);
    const sec = document.createElement('section'); sec.className = 'view'; sec.id = 'v-lclean'; ($('#v-wolf') || $('#v-dash')).before(sec);
  }
  if (typeof TITLES === 'object') TITLES.lclean = 'Pulizia scadute';
  const V = $('#v-lclean');

  const PN = { wolf: 'WOLF', atx: 'Atlantix', ro: 'Realott', slt: 'SLT' };
  const PC = { wolf: '#38bdf8', atx: '#22d3ee', ro: '#4ade80', slt: '#f472b6' };
  const ORDER = Object.keys(PN), DAY = 864e5, SHOW = 300;
  const S = { rows: null, t: 0, busy: null, errs: [], mode: '7', date: '', own: '', pn: new Set(ORDER), off: new Set(), keepDue: true, run: null, last: null };
  const isAgent = () => typeof D === 'object' && D && D.role === 'agent';
  const ms = (v) => (window.KXSort ? KXSort.ms(v) : +v || 0);
  // pannello non collegato o non concesso all'agente: non è un errore da mostrare, semplicemente non c'è
  const quiet = (m) => /collega prima|non (è )?collegat|non configurat|non puoi|non hai|permess|riservat|non trovat/i.test(m || '');
  const keyOf = (r) => r.p + ':' + r.id;
  const sleep = (t) => new Promise((r) => setTimeout(r, t));
  const day = (t) => (t ? new Date(t).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—');
  // giorni di calendario (come nelle altre schede): scaduta ieri = 1 giorno, a qualunque ora
  const day0 = (t) => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
  const daysAgo = (t) => Math.round((day0(Date.now()) - day0(t)) / DAY);
  const ago = (t) => { const d = daysAgo(t); return d <= 0 ? 'scaduta oggi' : d === 1 ? 'scaduta da 1 giorno' : `scaduta da ${d} giorni`; };

  /* ---------- dati: le stesse letture delle schede dei pannelli ---------- */
  async function load(force) {
    if (S.busy) return S.busy;
    if (!force && S.rows && Date.now() - S.t < 120e3) return paint();
    S.busy = (async () => {
      const rows = [], errs = [], err = (n) => (e) => { const m = (e && e.message) || String(e); if (!quiet(m)) errs.push(n + ': ' + m); };
      paint();
      await Promise.all([
        (async () => {
          if (!isAgent()) { const c = await api('GET', '/admin/wolf/config'); if (!c || !c.set) return; }
          const d = await api('GET', '/admin/wolf/lines');
          for (const l of d.lines || []) rows.push({ p: 'wolf', id: String(l.id == null ? '' : l.id), u: l.username || '', n: l.note || '', exp: ms(l.exp), en: !!l.enabled, owner: l.owner || '', trial: !!l.trial });
        })().catch(err('WOLF')),
        (async () => {
          const d = await api('GET', '/admin/atx/lines?all=1&page=1&q=&status=&reseller=');
          for (const x of d.rows || d.lines || []) rows.push({ p: 'atx', id: String(x.id == null ? '' : x.id), u: x.username || '', n: x.notes || '', exp: ms(x.exp_date), en: Number(x.enabled) !== 0, owner: x.reseller || x.owner || x.reseller_username || '', trial: Number(x.is_trial) === 1 });
        })().catch(err('Atlantix')),
        ...['ro', 'slt'].map((k) => (async () => {
          const st = await api('GET', `/admin/${k}/state`); if (!st || !st.connected) return;
          const d = await api('GET', `/admin/${k}/lines`);
          for (const x of d.rows || []) rows.push({ p: k, id: String(x.id == null ? '' : x.id), u: x.username || '', n: x.notes || '', exp: ms(x.exp), en: !!x.enabled, owner: x.owner || '', trial: !!x.trial });
        })().catch(err(PN[k]))),
      ]);
      S.rows = rows; S.errs = errs; S.t = Date.now();
      const have = new Set(rows.map(keyOf)); for (const k of [...S.off]) if (!have.has(k)) S.off.delete(k);
    })().finally(() => { S.busy = null; paint(); });
    return S.busy;
  }

  /* ---------- quali linee: scadute davvero (data passata) e prima del limite scelto ---------- */
  function cutoff() {
    if (S.mode === 'date') { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(S.date || ''); if (!m) return 0; return Math.min(new Date(+m[1], +m[2] - 1, +m[3]).getTime(), Date.now()); }
    // «da più di N giorni»: scaduta prima dell'inizio del giorno di N giorni fa (N giorni di calendario pieni)
    const n = +S.mode; if (!(n > 0)) return 0; const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate() - n).getTime();
  }
  const isDue = (r) => !!(window.KXPay && KXPay.isDue && KXPay.isDue('line', r.p, r.id));
  /* una linea entra solo con: id per cancellarla, una data di scadenza vera, già passata e più vecchia del limite */
  function matches() {
    const c = cutoff(); if (!c) return [];
    return (S.rows || []).filter((r) => r.id && r.exp > 0 && r.exp < Date.now() && r.exp < c && S.pn.has(r.p) && (!S.own || r.owner === S.own))
      .sort((a, b) => a.exp - b.exp);
  }
  const skipped = (r) => S.off.has(keyOf(r)) || (S.keepDue && isDue(r));
  const chosen = () => matches().filter((r) => !skipped(r));
  const limitText = () => (S.mode === 'date' ? (S.date ? 'scadute prima del ' + day(cutoff()) : '') : `scadute da più di ${S.mode} giorni`);

  /* ---------- disegno ---------- */
  function shell() {
    if ($('#lcList', V)) return;
    const today = new Date(), iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    V.innerHTML = `<div class="card glass"><div class="hd"><h3>🧹 Pulizia delle linee scadute<small>Toglie in un colpo solo dai pannelli le linee scadute da tanto tempo, ${isAgent() ? 'le tue' : 'tue e dei tuoi agenti'}: l'elenco resta pulito e trovi prima i clienti veri.</small></h3>
        <button class="btn sm" type="button" id="lcRe">Rileggi le linee</button></div>
      <div class="lc-warn"><b>Cosa succede:</b> ogni linea scelta viene <b>eliminata per sempre dal pannello del fornitore</b> (WOLF, Atlantix, Realott, SLT). Non finisce nel Cestino, non si può recuperare e i crediti non tornano indietro. Il cliente resta nel tuo elenco Clienti: se torna, gli crei una linea nuova. <b>Niente parte da solo</b>: si cancella solo quando premi il pulsante e confermi.</div>
      <div class="lc-step"><b>1 · Scadute da quanto</b><small>Più giorni scegli, più sei sicuro che il cliente non rinnova. Con la data cancelli tutto quello che è scaduto prima di quel giorno.</small>
        <div class="lc-opts" id="lcMode"></div></div>
      <div class="lc-step"><b>2 · Di chi e su quali pannelli</b><small>${isAgent() ? 'Vedi solo le linee che hai creato tu.' : '«Tutti» prende le tue linee e quelle dei tuoi agenti. Scegli un nome per pulire solo le linee di quel reseller.'}</small>
        <div class="lc-opts"><select class="inp" id="lcOwn" title="Di chi"></select><span id="lcPn" class="lc-opts"></span></div>
        <label style="display:flex;gap:8px;align-items:center;margin-top:10px;font-size:13.5px;cursor:pointer"><input type="checkbox" id="lcDue" checked style="width:17px;height:17px;accent-color:#fbbf24">Non toccare le linee con un pagamento ancora da incassare («Deve pagare»)</label></div>
      <div class="lc-info" id="lcInfo"></div><div id="lcErr"></div>
      <div class="lc-step"><b>3 · Controlla l'elenco e cancella</b><small>Togli la spunta alle linee che vuoi tenere. Si cancellano solo quelle con la spunta.</small></div>
      <div class="lc-sum" id="lcSum"></div><div class="lc-list" id="lcList"></div>
      <div class="lc-go" id="lcGo"></div><div id="lcRun"></div>
      <div class="lc-info">Armada e Storm non permettono di cancellare le linee da qui: per quelle si usa il loro sito.</div></div>`;
    $('#lcMode', V).dataset.max = iso(today);
  }
  function paint() {
    if (!V.classList.contains('on')) return;
    shell();
    const R = S.rows || [], run = S.run;
    $('#lcMode', V).innerHTML = [['7', '7 giorni'], ['10', '10 giorni'], ['20', '20 giorni']].map(([k, l]) => `<button type="button" class="fchip ${S.mode === k ? 'on' : ''}" data-lcm="${k}">Da più di ${l}</button>`).join('')
      + `<button type="button" class="fchip ${S.mode === 'date' ? 'on' : ''}" data-lcm="date">Prima del…</button><input class="inp" type="date" id="lcDate" value="${esc(S.date)}" max="${$('#lcMode', V).dataset.max}" title="Cancella le linee scadute prima di questo giorno"${S.mode === 'date' ? '' : ' style="display:none"'}>`;
    $('#lcInfo', V).textContent = S.busy && !S.rows ? 'Leggo le linee dai pannelli…' : S.t ? `${R.length} linee lette alle ${new Date(S.t).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}${S.busy ? ' · aggiorno…' : ''}` : '';
    $('#lcErr', V).innerHTML = S.errs.map((e) => `<div class="lc-err">⚠ ${esc(e)}</div>`).join('');
    const owners = [...new Set(R.map((r) => r.owner).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'it', { sensitivity: 'base' }));
    if (S.own && !owners.includes(S.own)) S.own = '';
    const ow = $('#lcOwn', V), ownH = `<option value="">${isAgent() ? 'Tutte le mie linee' : 'Tutti (io e i miei agenti)'}</option>${owners.map((o) => `<option value="${esc(o)}"${S.own === o ? ' selected' : ''}>Solo ${esc(o)}</option>`).join('')}`;
    if (ow._h !== ownH) { ow._h = ownH; ow.innerHTML = ownH; } ow.style.display = owners.length > 1 || S.own ? '' : 'none';
    const have = ORDER.filter((p) => R.some((r) => r.p === p));
    $('#lcPn', V).innerHTML = have.map((p) => `<button type="button" class="fchip ${S.pn.has(p) ? 'on' : ''}" data-lcp="${p}">${PN[p]}</button>`).join('');
    $('#lcDue', V).checked = S.keepDue; $('#lcDue', V).closest('label').style.display = window.KXPay && KXPay.isDue ? '' : 'none';
    for (const e of $$('#lcMode button,#lcPn button,#lcOwn,#lcDue,#lcDate,#lcRe', V)) e.disabled = !!run;
    if (!S.rows) { $('#lcList', V).innerHTML = '<div class="lc-empty">Carico…</div>'; $('#lcSum', V).innerHTML = $('#lcGo', V).innerHTML = ''; return; }
    const M = matches(), C = M.filter((r) => !skipped(r)), due = S.keepDue ? M.filter(isDue).length : 0;
    const per = ORDER.map((p) => [p, C.filter((r) => r.p === p).length]).filter(([, n]) => n);
    const lt = limitText();
    $('#lcSum', V).innerHTML = !lt ? '<span class="mut">Scegli il giorno: si cancellano le linee scadute prima di quella data.</span>'
      : `<b>${C.length}</b> ${C.length === 1 ? 'linea da cancellare' : 'linee da cancellare'} · ${esc(lt)}${per.length ? ' · ' + per.map(([p, n]) => `<span class="lc-pn" style="--c:${PC[p]}">${PN[p]} ${n}</span>`).join(' ') : ''}${due ? ` · <span class="mut">${due} con pagamento da incassare ${due === 1 ? 'lasciata' : 'lasciate'} stare</span>` : ''}`;
    const shown = M.slice(0, SHOW);
    $('#lcList', V).innerHTML = shown.length ? `<div class="lc-row lc-head"><span></span><span>Pannello</span><span>Utente</span><span>Cliente / nota</span><span>Scadenza</span><span>Reseller</span></div>` + shown.map((r, i) => {
      const d = S.keepDue && isDue(r), off = skipped(r);
      return `<label class="lc-row${off ? ' off' : ''}"><input type="checkbox" data-lck="${i}"${off ? '' : ' checked'}${d || run ? ' disabled' : ''} aria-label="Cancella ${esc(r.u)}">
        <span class="lc-pn" style="--c:${PC[r.p]}">${PN[r.p]}</span>
        <span class="lc-u">${esc(r.u || '—')}${r.trial ? '<span class="lc-tag dis">prova</span>' : ''}${!r.en ? '<span class="lc-tag dis">disattivata</span>' : ''}${d ? '<span class="lc-tag due">deve pagare</span>' : ''}</span>
        <span class="${r.n ? '' : 'mut'}">${esc(r.n || '—')}</span>
        <span>${esc(day(r.exp))}<small>${esc(ago(r.exp))}</small></span>
        <span class="mut">${esc(r.owner || '—')}</span></label>`;
    }).join('') + (M.length > shown.length ? `<div class="lc-empty">…e altre ${M.length - shown.length} linee più recenti (entrano nella pulizia anche se qui non le vedi).</div>` : '')
      : `<div class="lc-empty">${!lt ? 'Scegli una data.' : R.length ? 'Nessuna linea ' + esc(lt) + ': è già tutto pulito.' : 'Nessun pannello con linee da pulire.'}</div>`;
    S.vis = shown;
    $('#lcGo', V).innerHTML = run ? `<button class="btn" type="button" id="lcStop"${run.stop ? ' disabled' : ''}>${run.stop ? 'Mi fermo…' : 'Ferma'}</button>`
      : C.length ? `<button class="btn danger" type="button" id="lcDel">Cancella ${C.length} ${C.length === 1 ? 'linea' : 'linee'} dai pannelli</button><button class="btn sm" type="button" id="lcAllOn">Rimetti tutte le spunte</button>` : '';
    paintRun();
  }
  function paintRun() {
    const box = $('#lcRun', V); if (!box) return;
    const run = S.run, last = S.last;
    if (run) { box.innerHTML = `<div class="lc-bar"><i style="width:${run.tot ? Math.round((run.n / run.tot) * 100) : 0}%"></i></div><div class="lc-info">Cancello… ${run.n} di ${run.tot} · ${run.ok} eliminate${run.errs.length ? ` · ${run.errs.length} non riuscite` : ''}. Non chiudere questa pagina.</div>`; return; }
    box.innerHTML = last ? `<div class="lc-done"><b>${last.ok} ${last.ok === 1 ? 'linea eliminata' : 'linee eliminate'}</b> su ${last.tot}${last.stopped ? ' (ti sei fermato prima della fine)' : ''}. Ogni cancellazione è nel registro Attività.${last.errs.length ? `<div class="lc-err" style="margin-top:8px"><b>${last.errs.length} non riuscite:</b><br>${last.errs.slice(0, 12).map(esc).join('<br>')}${last.errs.length > 12 ? '<br>…' : ''}</div>` : ''}</div>` : '';
  }

  /* ---------- cancellazione: una linea alla volta, con le stesse chiamate del pulsante «Elimina» della linea ---------- */
  const delOne = (r) => (r.p === 'wolf' ? api('DELETE', '/admin/wolf/lines/' + encodeURIComponent(r.id))
    : r.p === 'atx' ? api('POST', '/admin/atx/lines/action', { action: 'delete', user_id: r.id, user: r.u })
      : api('POST', `/admin/${r.p}/lines/action`, { action: 'delete', id: r.id, username: r.u }));
  async function start() {
    if (S.run) return;
    const C = chosen(); if (!C.length) return;
    const per = ORDER.map((p) => [p, C.filter((r) => r.p === p).length]).filter(([, n]) => n);
    const ok = await ask(`Cancellare ${C.length} ${C.length === 1 ? 'linea' : 'linee'}?`, `<p style="margin:0">Elimino per sempre dai pannelli le linee ${esc(limitText())}${S.own ? ' di <b>' + esc(S.own) + '</b>' : ''}: ${per.map(([p, n]) => `<b>${n}</b> su ${PN[p]}`).join(', ')}. Non si possono recuperare e i crediti non tornano indietro.</p>
      <label class="lbl" style="margin-top:12px">Per confermare scrivi il numero di linee: <b class="mono">${C.length}</b></label><input class="inp mono" id="lcC" inputmode="numeric" autocomplete="off">`, 'Cancella per sempre');
    if (!ok) return;
    if (String(($('#lcC') || {}).value || '').trim() !== String(C.length)) return toast('Numero diverso: non ho cancellato niente', 1);
    const run = S.run = { n: 0, tot: C.length, ok: 0, errs: [], stop: false }, fail = {}, gone = new Set();
    S.last = null; paint();
    for (const r of C) {
      if (run.stop) break;
      // tre errori di fila sullo stesso pannello: quel pannello non risponde, le sue linee restano dove sono
      if ((fail[r.p] || 0) >= 3) { run.n++; continue; }
      try { await delOne(r); run.ok++; fail[r.p] = 0; gone.add(keyOf(r)); }
      catch (e) { fail[r.p] = (fail[r.p] || 0) + 1; run.errs.push(`${PN[r.p]} · ${r.u}: ${(e && e.message) || e}${fail[r.p] >= 3 ? ` — ${PN[r.p]} non risponde: mi fermo su questo pannello` : ''}`); }
      run.n++; paintRun();
      await sleep(350);
    }
    S.last = { ok: run.ok, tot: run.tot, errs: run.errs, stopped: run.stop && run.n < run.tot };
    S.run = null;
    if (S.rows) S.rows = S.rows.filter((r) => !gone.has(keyOf(r)));
    paint();
    toast(run.ok ? `${run.ok} ${run.ok === 1 ? 'linea eliminata' : 'linee eliminate'}` : 'Nessuna linea eliminata', !run.ok);
    load(true); // rilegge dai pannelli: l'elenco torna quello vero
    if (window.KXAllPanels && KXAllPanels.load) try { KXAllPanels.load(true); } catch {}
  }

  V.addEventListener('click', (e) => {
    const t = e.target.closest('#lcRe,#lcDel,#lcStop,#lcAllOn,[data-lcm],[data-lcp]'); if (!t) return;
    if (t.id === 'lcStop') { if (S.run) { S.run.stop = true; paint(); } return; }
    if (S.run) return;
    if (t.id === 'lcRe') return load(true);
    if (t.id === 'lcDel') return start();
    if (t.id === 'lcAllOn') { S.off.clear(); return paint(); }
    if (t.dataset.lcm) { S.mode = t.dataset.lcm; S.last = null; paint(); if (S.mode === 'date' && !S.date) { const d = $('#lcDate', V); if (d) d.focus(); } return; }
    if (t.dataset.lcp) { const p = t.dataset.lcp; S.pn.has(p) ? S.pn.delete(p) : S.pn.add(p); S.last = null; return paint(); }
  });
  V.addEventListener('change', (e) => {
    if (S.run) return;
    if (e.target.id === 'lcOwn') { S.own = e.target.value; S.last = null; return paint(); }
    if (e.target.id === 'lcDue') { S.keepDue = e.target.checked; return paint(); }
    if (e.target.id === 'lcDate') { S.date = e.target.value; S.last = null; return paint(); }
    const ck = e.target.closest('input[data-lck]');
    if (ck) { const r = (S.vis || [])[+ck.dataset.lck]; if (r) { ck.checked ? S.off.delete(keyOf(r)) : S.off.add(keyOf(r)); } paint(); }
  });
  // aprendo la pagina si legge (se i dati hanno più di 2 minuti)
  new MutationObserver(() => { if (V.classList.contains('on')) { shell(); load(false); } }).observe(V, { attributes: true, attributeFilter: ['class'] });
  // uscita dal pannello: niente resta in memoria (né le linee né le scelte)
  const appEl = $('#app');
  if (appEl) new MutationObserver(() => { if (!appEl.classList.contains('on')) { if (S.run) S.run.stop = true; Object.assign(S, { rows: null, t: 0, errs: [], mode: '7', date: '', own: '', keepDue: true, last: null }); S.pn = new Set(ORDER); S.off.clear(); V.innerHTML = ''; } }).observe(appEl, { attributes: true, attributeFilter: ['class'] });
  window.KXLineClean = { open: () => view('lclean'), matches, chosen, state: S };
})();
