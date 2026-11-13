/* KAIROS Control — «Backup dei dati» (13 novembre 2026). Impostazioni → Sicurezza. Solo il titolare, con la sua password.
   - «Scarica backup completo»: tutto il database in un file (clienti, scadenze, linee, agenti, pagamenti, impostazioni,
     store, messaggi, registro). La pagina lo legge una tabella alla volta e alla fine lo salva sul computer.
   - «Ripristina da un backup»: ricarica un file scaricato da qui. Prima salva da sola lo stato di adesso, poi svuota e
     riscrive ogni tabella del file. Serve la password e la parola RIPRISTINA.
   Il file vale quanto il database (ci sono gli accessi e le playlist, cifrati): va tenuto in un posto sicuro.
   Usa app.js (api, toast, D, $). */
(() => {
  const owner = () => typeof D === 'object' && D && D.role !== 'agent' && !window.__assist && !D.demo;
  const pane = document.querySelector('[data-pane="sec"] .st-g') || document.querySelector('[data-pane="sec"]');
  if (!pane || document.getElementById('bkCard')) return;
  const css = document.createElement('style');
  css.textContent = `
#bkCard .bk-row{display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;margin-top:10px}
#bkCard .bk-row>div{flex:1 1 220px;min-width:0}
#bkCard .bk-st{margin-top:10px;font-size:13px;color:var(--mut);min-height:18px;line-height:1.45}
#bkCard .bk-st.ok{color:#34d399}#bkCard .bk-st.bad{color:#f87171}
#bkCard .bk-bar{height:6px;border-radius:99px;background:rgba(255,255,255,.08);overflow:hidden;margin-top:8px;display:none}
#bkCard .bk-bar.on{display:block}#bkCard .bk-bar i{display:block;height:100%;width:0;background:var(--a1);transition:width .2s}
#bkCard details{margin-top:16px;border-top:1px solid var(--line);padding-top:12px}
#bkCard summary{cursor:pointer;font-weight:700;font-size:14px}
#bkCard .bk-warn{margin:10px 0 0;padding:10px 12px;border-radius:10px;border:1px solid rgba(245,176,65,.45);background:rgba(245,176,65,.1);color:#f2c46c;font-size:12.5px;line-height:1.45}`;
  document.head.appendChild(css);
  pane.insertAdjacentHTML('beforeend', `<div class="card glass" id="bkCard"><div class="hd"><h3>💾 Backup dei dati<small>Tutto il database in un file: clienti, scadenze, linee, agenti, pagamenti, impostazioni, store, messaggi, registro</small></h3></div>
    <p class="mut" style="font-size:13px;margin:0">Scaricalo ogni tanto e tienilo in un posto sicuro (non sullo stesso computer soltanto). Dentro ci sono gli accessi e le playlist dei clienti, cifrati: vale quanto il pannello.</p>
    <div class="bk-row"><div><label class="lbl" for="bkPass">La tua password</label><input class="inp" type="password" id="bkPass" autocomplete="current-password"></div><button class="btn pri" type="button" id="bkGo">Scarica backup completo</button></div>
    <div class="bk-bar" id="bkBar"><i></i></div><div class="bk-st" id="bkSt" aria-live="polite"></div>
    <details id="bkRes"><summary>Ripristina da un backup</summary>
      <div class="bk-warn"><b>Attenzione:</b> i dati di adesso vengono sostituiti con quelli del file. Clienti, scadenze e agenti tornano com'erano il giorno del backup; quello che è cambiato dopo si perde. Prima di cominciare il pannello salva da solo un backup di adesso. Alla fine si rientra con le credenziali che c'erano nel backup.</div>
      <div class="bk-row"><div><label class="lbl" for="bkFile">File del backup</label><input class="inp" type="file" id="bkFile" accept=".json,application/json"></div><div><label class="lbl" for="bkWord">Scrivi RIPRISTINA</label><input class="inp" id="bkWord" autocomplete="off" placeholder="RIPRISTINA"></div></div>
      <div class="bk-row"><div><label class="lbl" for="bkPass2">La tua password</label><input class="inp" type="password" id="bkPass2" autocomplete="current-password"></div><button class="btn" type="button" id="bkResGo">Ripristina</button></div>
      <div class="bk-bar" id="bkBar2"><i></i></div><div class="bk-st" id="bkSt2" aria-live="polite"></div>
    </details></div>`);
  const card = document.getElementById('bkCard');
  for (const ev of ['input', 'change']) card.addEventListener(ev, (e) => e.stopPropagation()); // non conta tra le «modifiche non salvate»
  const q = (id) => document.getElementById(id);
  const say = (id, t, cls) => { const e = q(id); e.textContent = t; e.className = 'bk-st' + (cls ? ' ' + cls : ''); };
  const bar = (id, p) => { const b = q(id); b.classList.toggle('on', p >= 0); if (p >= 0) b.firstElementChild.style.width = Math.max(2, Math.min(100, p)) + '%'; };
  const stamp = (iso) => { const d = new Date(iso), z = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}`; };
  let busy = false;

  /** legge tutto il database a pagine: { blob, rows, tables, at } */
  async function exportAll(password, onProg) {
    const st = await api('POST', '/admin/backup/start', { password });
    const parts = [JSON.stringify({ kairosBackup: st.format, at: st.at, tables: st.tables.map((t) => t.name), schema: st.tables }) + '\n'];
    let rows = 0;
    for (let i = 0; i < st.tables.length; i++) {
      const t = st.tables[i].name;
      let after = 0, mode = '';
      for (let guard = 0; guard < 100000; guard++) {
        const r = await api('POST', '/admin/backup/page', { token: st.token, t, after, ...(mode ? { mode } : {}) });
        if (r.rows && r.rows.length) { parts.push(JSON.stringify({ t, rows: r.rows }) + '\n'); rows += r.rows.length; }
        if (onProg) onProg(i + 1, st.tables.length, rows);
        if (r.next === null || r.next === undefined) break;
        after = r.next; mode = r.mode === 'off' ? 'off' : '';
      }
    }
    parts.push(JSON.stringify({ end: true, rows }) + '\n');
    await api('POST', '/admin/backup/end', { token: st.token, rows });
    return { blob: new Blob(parts, { type: 'application/json' }), rows, tables: st.tables.length, at: st.at };
  }
  function save(blob, name) {
    const a = document.createElement('a'), u = URL.createObjectURL(blob);
    a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 60000);
  }
  /** file di backup → { head, byTable: Map(nome → righe), rows }; lancia un errore con il motivo se non è valido */
  function parse(text) {
    const lines = text.split('\n').filter((l) => l.trim());
    if (lines.length < 2) throw new Error('Il file non è un backup di Kairos');
    let head, tail;
    try { head = JSON.parse(lines[0]); tail = JSON.parse(lines[lines.length - 1]); } catch { throw new Error('Il file non è un backup di Kairos'); }
    if (!head || head.kairosBackup !== 1 || !Array.isArray(head.tables)) throw new Error('Il file non è un backup di Kairos (o è di un formato più nuovo)');
    if (!tail || tail.end !== true) throw new Error('Il backup è incompleto: manca la chiusura (download interrotto?)');
    const byTable = new Map(head.tables.map((t) => [t, []]));
    let rows = 0;
    for (let i = 1; i < lines.length - 1; i++) {
      let o; try { o = JSON.parse(lines[i]); } catch { throw new Error('Il backup è rovinato alla riga ' + (i + 1)); }
      if (!o || typeof o.t !== 'string' || !Array.isArray(o.rows) || !byTable.has(o.t)) throw new Error('Il backup è rovinato alla riga ' + (i + 1));
      const list = byTable.get(o.t); for (const r of o.rows) list.push(r);
      rows += o.rows.length;
    }
    if (rows !== tail.rows) throw new Error(`Il backup è incompleto: ${rows} righe invece di ${tail.rows}`);
    return { head, byTable, rows };
  }
  /** manda un pezzo; se il server lo trova troppo grande o pesante lo si divide e si riprova (mai meno di una riga) */
  async function sendRows(token, t, rows, first) {
    try { await api('POST', '/admin/restore/table', { token, t, first, rows }); }
    catch (e) {
      if (rows.length <= 1 || /scadut|non valid|riservat|Sessione/i.test(e.message)) throw e;
      const h = Math.ceil(rows.length / 2);
      await sendRows(token, t, rows.slice(0, h), first);
      await sendRows(token, t, rows.slice(h), false);
    }
  }

  q('bkGo').onclick = async () => {
    if (busy) return;
    const pw = q('bkPass').value; if (!pw) return say('bkSt', 'Scrivi la tua password per scaricare il backup', 'bad');
    busy = true; q('bkGo').disabled = true; bar('bkBar', 1); say('bkSt', 'Leggo il database…');
    try {
      const r = await exportAll(pw, (i, n, rows) => { bar('bkBar', (i / n) * 100); say('bkSt', `Leggo il database… tabella ${i} di ${n} · ${rows} righe`); });
      const name = `kairos-backup-${stamp(r.at)}.json`;
      save(r.blob, name);
      q('bkPass').value = '';
      say('bkSt', `Backup scaricato: ${name} · ${r.rows} righe in ${r.tables} tabelle · ${(r.blob.size / 1048576).toFixed(1)} MB. Tienilo in un posto sicuro.`, 'ok');
    } catch (e) { say('bkSt', e.message || 'Backup non riuscito', 'bad'); }
    finally { busy = false; q('bkGo').disabled = false; bar('bkBar', -1); }
  };

  q('bkResGo').onclick = async () => {
    if (busy) return;
    const f = q('bkFile').files && q('bkFile').files[0], pw = q('bkPass2').value, word = q('bkWord').value.trim();
    if (!f) return say('bkSt2', 'Scegli il file del backup', 'bad');
    if (word !== 'RIPRISTINA') return say('bkSt2', 'Scrivi RIPRISTINA (in maiuscolo) per confermare', 'bad');
    if (!pw) return say('bkSt2', 'Scrivi la tua password', 'bad');
    busy = true; q('bkResGo').disabled = true; bar('bkBar2', 1);
    try {
      say('bkSt2', 'Controllo il file…');
      const bk = parse(await f.text());
      // prima lo stato di adesso: se il ripristino non è quello giusto si torna indietro con questo file
      say('bkSt2', 'Salvo prima un backup di adesso…');
      const nowBk = await exportAll(pw, (i, n) => bar('bkBar2', (i / n) * 30));
      save(nowBk.blob, `kairos-backup-prima-del-ripristino-${stamp(nowBk.at)}.json`);
      const st = await api('POST', '/admin/restore/start', { password: pw, confirm: 'RIPRISTINA', tables: bk.head.tables });
      const max = Math.max(1, Math.min(100, +st.max || 50));
      let done = 0;
      for (let i = 0; i < st.tables.length; i++) {
        const t = st.tables[i], rows = bk.byTable.get(t) || [];
        if (!rows.length) await sendRows(st.token, t, [], true); // tabella vuota nel backup: si svuota
        for (let k = 0; k < rows.length; k += max) {
          await sendRows(st.token, t, rows.slice(k, k + max), k === 0);
          done += Math.min(max, rows.length - k);
          bar('bkBar2', 30 + (done / Math.max(1, bk.rows)) * 70);
          say('bkSt2', `Ripristino… tabella ${i + 1} di ${st.tables.length} · ${done} righe su ${bk.rows}`);
        }
      }
      await api('POST', '/admin/restore/end', { token: st.token, rows: done });
      q('bkPass2').value = ''; q('bkWord').value = ''; q('bkFile').value = '';
      say('bkSt2', `Ripristino completato: ${done} righe in ${st.tables.length} tabelle, dal backup del ${new Date(bk.head.at).toLocaleString('it-IT')}. Ricarico il pannello…`, 'ok');
      setTimeout(() => location.reload(), 2500);
    } catch (e) { say('bkSt2', (e.message || 'Ripristino non riuscito') + '. Se si è fermato a metà, ripeti il ripristino con lo stesso file: riparte da capo.', 'bad'); }
    finally { busy = false; q('bkResGo').disabled = false; bar('bkBar2', -1); }
  };

  const sync = () => { card.style.display = owner() ? '' : 'none'; };
  const ra = renderAll;
  window.renderAll = renderAll = function () { ra(); sync(); };
  sync();
  window.KXBackup = { exportAll, parse };
})();
