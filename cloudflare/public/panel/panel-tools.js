/* KAIROS Control — strumenti comuni ai pannelli WOLF, Armada, MaxPlayer e OrbixPlay: export Excel (CSV con «;»,
   si apre con doppio clic in Excel italiano), statistiche, azioni su più linee una alla volta con avanzamento e
   messaggi ai clienti KAIROS che hanno quelle linee nelle loro playlist. Usa le funzioni di app.js. */
(() => {
  const css = document.createElement('style');
  css.textContent = `
.kt-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px;padding:8px 10px;border:1px solid var(--line);border-radius:10px;background:#ffffff08;font-size:13px}
.kt-bar b{margin-right:4px}.kt-bar .sp{flex:1}
.kt-st{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;margin-top:12px}
.kt-st div{border:1px solid var(--line);border-radius:10px;padding:9px 11px;background:#ffffff06}.kt-st small{display:block;color:var(--mut);font-size:11.5px}
.kt-st span{font-size:20px;font-weight:800}.kt-st .g{color:#6ee3a6}.kt-st .w{color:#ecc06f}.kt-st .b{color:#ff8f8f}
.kt-top{margin-top:10px;font-size:12.5px;color:var(--mut)}.kt-top b{color:var(--txt,#fff)}
.kt-ck{width:16px;height:16px;accent-color:#22c55e;vertical-align:middle;margin:0 6px 0 0;cursor:pointer}
.kt-renew-head{margin:0 0 10px;padding:8px 10px;border-left:4px solid var(--kt-panel);border-radius:7px;background:color-mix(in srgb,var(--kt-panel) 12%,transparent);color:var(--kt-panel);font-weight:800}
.kt-renew-list{max-height:min(46vh,420px);overflow:auto;border:1px solid var(--line);border-radius:9px}
.kt-renew-table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:12px}
.kt-renew-table th,.kt-renew-table td{padding:7px 6px;text-align:left;vertical-align:top;border-bottom:1px solid var(--line);overflow-wrap:anywhere}
.kt-renew-table th{position:sticky;top:0;z-index:1;background:#18202b;color:var(--mut);font-size:11px}
.kt-renew-table tr:last-child td{border-bottom:0}
.kt-renew-foot{margin:10px 0 0;padding:9px 10px;border-radius:8px;background:#ffffff08;font-size:13px}
.kt-renew-report{display:grid;gap:10px;max-height:62vh;overflow:auto}
.kt-renew-report h4{margin:0 0 5px;font-size:13px}.kt-renew-report ul{margin:0;padding-left:19px}
.kt-renew-report li{margin:4px 0;overflow-wrap:anywhere}
.kt-renew-report .ok{color:#7ee2a8}.kt-renew-report .err{color:#ff9b9b}
.kx-creds{display:grid;gap:9px}.kx-creds-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;padding:10px;border:1px solid var(--line);border-radius:10px;background:#ffffff06}
.kx-creds-row small{display:block;color:var(--mut);font-size:11.5px;margin-bottom:3px}.kx-creds-row .mono{display:block;overflow-wrap:anywhere;white-space:pre-wrap}`;
  document.head.appendChild(css);

  const cell = (v) => { const s = v === null || v === undefined ? '' : String(v); return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  function csv(name, cols, rows) {
    if (!rows.length) return toast('Niente da esportare', 1);
    const txt = '\ufeff' + [cols.map((c) => cell(c[0])).join(';'), ...rows.map((r) => cols.map((c) => cell(c[1](r))).join(';'))].join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' }));
    a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast(`Esportate ${rows.length} righe`);
  }
  const day = (t) => (t ? new Date(t).toLocaleDateString('it-IT') : '');

  /* items: [etichetta, valore, colore g|w|b]; top: [[titolo, [[nome, n], …]]] */
  function stats(items, top) {
    return `<div class="kt-st">${items.map(([l, v, c]) => `<div><small>${esc(l)}</small><span class="${c || ''}">${esc(v)}</span></div>`).join('')}</div>`
      + (top || []).filter((t) => t[1].length).map(([t, L]) => `<div class="kt-top">${esc(t)}: ${L.slice(0, 8).map(([n, k]) => `<b>${esc(n || '—')}</b> ${k}`).join(' · ')}</div>`).join('');
  }
  const count = (arr, f) => { const m = new Map(); arr.forEach((x) => { const k = f(x); m.set(k, (m.get(k) || 0) + 1); }); return [...m.entries()].sort((a, b) => b[1] - a[1]); };

  /* esegue fn su ogni elemento, uno alla volta: i pannelli esterni non reggono raffiche di richieste */
  async function run(list, fn, label) {
    const err = []; let ok = 0;
    for (let i = 0; i < list.length; i++) {
      if (i % 5 === 0) toast(`${label}: ${i + 1} di ${list.length}…`);
      try { await fn(list[i]); ok++; } catch (e) { err.push(e.message || String(e)); }
    }
    toast(`${label}: ${ok} fatte${err.length ? ` · ${err.length} errori (${err[0]})` : ''}`, !!err.length);
    return { ok, err };
  }
  async function runReport(list, fn, label) {
    const err = [], items = []; let ok = 0;
    for (let i = 0; i < list.length; i++) {
      if (i % 5 === 0) toast(`${label}: ${i + 1} di ${list.length}…`);
      try { const value = await fn(list[i]); items.push({ item: list[i], ok: true, value }); ok++; }
      catch (e) { const error = e && e.message ? e.message : String(e); err.push(error); items.push({ item: list[i], ok: false, error }); }
    }
    toast(`${label}: ${ok} fatte${err.length ? ` · ${err.length} errori (${err[0]})` : ''}`, !!err.length);
    return { ok, err, items };
  }
  const panelHeader = (name, color) => `<div class="kt-renew-head" style="--kt-panel:${esc(color)}">Pannello: ${esc(name)}</div>`;

  /* clienti KAIROS (principali) che hanno nelle playlist uno di questi utenti */
  function devsFor(users, extra) {
    const U = new Set(users.filter(Boolean).map((u) => String(u).toLowerCase()));
    const out = new Set(extra || []);
    (D.devices || []).forEach((d) => { if (d && !d.parent && (d.playlists || []).some((p) => p && p.username && U.has(String(p.username).toLowerCase()))) out.add(d.id); });
    return [...out];
  }
  async function msg(ids, nLines) {
    if (!ids.length) return toast('Nessuna di queste linee è in un cliente KAIROS: i messaggi arrivano solo sulle app Kairos', 1);
    const ok = await ask(`Messaggio a ${ids.length} client${ids.length === 1 ? 'e' : 'i'}`, `<p class="mut" style="margin:0 0 10px;font-size:12.5px">${nLines === 1 ? '1 linea selezionata' : nLines + ' linee selezionate'} · ${ids.length === 1 ? '1 cliente KAIROS la ha' : ids.length + ' clienti KAIROS le hanno'} nelle loro app. Il messaggio compare sulle loro TV.</p>
      <label class="lbl">Titolo</label><input class="inp" id="ktT" maxlength="80" placeholder="es. Abbonamento in scadenza">
      <label class="lbl">Testo</label><textarea class="inp" id="ktB" rows="4" maxlength="600"></textarea>
      <div class="row"><div><label class="lbl">Tipo</label><select class="inp" id="ktL"><option value="info">Informazione</option><option value="warn">Avviso</option><option value="urgent">Urgente</option></select></div>
      <div><label class="lbl">Visibile per</label><select class="inp" id="ktD"><option value="1">1 giorno</option><option value="3">3 giorni</option><option value="7" selected>7 giorni</option><option value="30">30 giorni</option></select></div></div>`, 'Invia');
    if (!ok) return;
    const b = { title: $('#ktT').value.trim(), body: $('#ktB').value.trim(), level: $('#ktL').value, days: +$('#ktD').value || 7, targets: ids };
    if (!b.title && !b.body) return toast('Scrivi il titolo o il testo', 1);
    try { const r = await api('POST', '/admin/messages', b); toast(`Messaggio inviato a ${(r && r.sent) || ids.length} clienti`); } catch (e) { toast(e.message, 1); }
  }

  function showCredentials(title, rows, note) {
    const items = (Array.isArray(rows) ? rows : []).filter((row) => Array.isArray(row) && row.length > 1 && String(row[1] ?? '').trim() !== '')
      .map(([label, value]) => [String(label), String(value)]);
    const body = `<div class="kx-creds">${items.map(([label, value], i) => `<div class="kx-creds-row"><div><small>${esc(label)}</small><span class="mono">${esc(value)}</span></div><button type="button" class="btn sm" data-kx-creds-copy="${i}" title="Copia ${esc(label)}">Copia</button></div>`).join('')}
      ${note ? `<p class="mut" style="font-size:12.5px;margin:0">${esc(note)}</p>` : ''}
      <button type="button" class="btn" id="kxCredsCopyAll">Copia tutto</button></div>`;
    const prompt = ask(title, body, 'Chiudi');
    const copy = (value, label) => {
      if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') return toast('Copia non consentita dal browser', 1);
      navigator.clipboard.writeText(value).then(() => toast(`${label} copiato`), () => toast('Copia non consentita dal browser', 1));
    };
    $$('[data-kx-creds-copy]').forEach((button) => {
      button.onclick = () => {
        const row = items[+button.dataset.kxCredsCopy];
        if (row) copy(row[1], row[0]);
      };
    });
    const all = $('#kxCredsCopyAll');
    if (all) all.onclick = () => copy(items.map(([label, value]) => `${label}: ${value}`).join('\n'), 'Dati');
    return prompt;
  }

  /* barra sopra l'elenco: export, statistiche e, con linee selezionate, le azioni multiple */
  function bar(p, n, total, acts) {
    return `<div class="kt-bar"><label style="display:flex;align-items:center;cursor:pointer"><input type="checkbox" class="kt-ck" data-kt="${p}all"${n && n === total ? ' checked' : ''}>Seleziona tutte (${total})</label>
      <b>${n ? n + ' selezionate' : ''}</b>${n ? acts.map(([k, l, c]) => `<button class="btn sm ${c || ''}" data-kt="${p}${k}">${l}</button>`).join('') : '<span class="mut">Spunta le linee per rinnovarle o scrivere ai clienti tutte insieme</span>'}
      <span class="sp"></span><button class="btn sm" data-kt="${p}stats">Statistiche</button><button class="btn sm" data-kt="${p}csv">Esporta Excel</button></div>`;
  }
  const ck = (p, id, on) => `<input type="checkbox" class="kt-ck" data-ktc="${p}" data-id="${esc(String(id))}"${on ? ' checked' : ''}>`;
  /* collega la barra: sel è un Set di id, ids() quelli filtrati, on = { all, csv, stats, …azioni } */
  function bind(root, p, sel, ids, on, redraw) {
    root.querySelectorAll(`[data-ktc="${p}"]`).forEach((c) => { c.onchange = () => { const id = c.dataset.id; c.checked ? sel.add(id) : sel.delete(id); redraw(); }; });
    root.querySelectorAll('[data-kt]').forEach((b) => {
      const k = b.dataset.kt; if (!k.startsWith(p)) return;
      const a = k.slice(p.length);
      if (a === 'all') b.onchange = () => { const L = ids(); if (b.checked) L.forEach((i) => sel.add(String(i))); else sel.clear(); redraw(); };
      else if (on[a]) b.onclick = () => on[a]();
    });
  }

  window.KXTools = { csv, day, stats, count, run, runReport, panelHeader, devsFor, msg, bar, ck, bind };
  window.KXCreds = { show: showCredentials };
})();
