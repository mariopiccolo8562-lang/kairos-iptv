/* KAIROS Control 2.4.3 — Manutenzione: blocca l'app a tutti i clienti tranne quelli scelti (per provare le novità).
   Usa le funzioni di app.js ($, $$, esc, api, toast, ask, D, load, renderAll…). */
(() => {
  const css = document.createElement('style');
  css.textContent = `
#mtBtn.on{background:var(--bad)!important;border-color:var(--bad)!important;color:#fff!important}
.mtbar{display:none;align-items:center;gap:12px;flex-wrap:wrap;margin:-6px 0 16px;padding:12px 16px;border-radius:10px;border:1px solid rgba(229,83,75,.55);background:rgba(229,83,75,.12)}
.mtbar.on{display:flex}.mtbar b{color:#ff9d97}.mtbar span{flex:1;min-width:220px;font-size:13.5px}
#mtPage{position:fixed;top:0;bottom:0;right:0;left:240px;z-index:21;background:var(--bg);display:none;flex-direction:column}
#mtPage.on{display:flex}
#mtPage .ah{display:flex;align-items:center;gap:12px;padding:16px 28px;border-bottom:1px solid var(--line);background:var(--pane)}#mtPage .ah h3{flex:1;font-size:18px;font-weight:600}
#mtPage .ab{flex:1;overflow:auto;padding:22px 28px}#mtPage .af{display:flex;gap:10px;padding:14px 28px;border-top:1px solid var(--line);background:var(--pane)}
.mt-g{display:grid;grid-template-columns:minmax(300px,1fr) minmax(360px,1.3fr);gap:16px;align-items:start}
.mt-c{background:var(--glass);border:1px solid var(--line);border-radius:10px;padding:18px}.mt-c h4{font-size:14px;font-weight:600}.mt-c>small{display:block;color:var(--mut);font-size:12.5px;margin:2px 0 12px}
.mt-list{max-height:56vh;overflow:auto;display:grid;gap:5px;margin-top:10px}
.mt-list label{display:flex;align-items:center;gap:10px;padding:9px 11px;border-radius:7px;background:#1a1d22;border:1px solid var(--line);cursor:pointer;font-size:13.5px}
.mt-list label.on{border-color:rgba(61,124,245,.6);background:rgba(61,124,245,.1)}
.mt-list input{width:16px;height:16px;accent-color:var(--a1)}.mt-list small{margin-left:auto;color:var(--mut);font-size:12px;font-family:'JetBrains Mono',monospace}
@media (max-width:900px){#mtPage{left:0}.mt-g{grid-template-columns:1fr}}`;
  document.head.appendChild(css);

  const btn = document.createElement('button'); btn.className = 'btn'; btn.id = 'mtBtn'; btn.title = 'Blocca l\'app a tutti tranne i clienti che scegli';
  btn.innerHTML = '🔧 Manutenzione';
  $('#newDev').before(btn);
  const bar = document.createElement('div'); bar.className = 'mtbar'; bar.id = 'mtBar';
  ($('#dlBar') || $('.topbar')).after(bar);
  const page = document.createElement('div'); page.id = 'mtPage'; document.body.appendChild(page);
  // il titolare blocca tutti; un agente con il permesso blocca solo i suoi clienti
  const isAg = () => D.role === 'agent';
  const M = () => (isAg() ? D.maintMe : D.settings && D.settings.maint) || { on: false, msg: '', allow: [] };
  const saveM = (m) => (isAg() ? api('PUT', '/admin/agent-maint', m) : api('PUT', '/admin/settings', { maint: m }));
  const tutti = () => (isAg() ? 'i tuoi clienti' : 'tutti i clienti');

  function renderBar() {
    const owner = !isAg() || !!D.maintMe, m = M();
    btn.style.display = owner ? '' : 'none';
    btn.classList.toggle('on', owner && !!m.on);
    btn.innerHTML = m.on ? '🔧 Manutenzione attiva' : '🔧 Manutenzione';
    const agOn = !isAg() ? (D.maintAg || []).map((id) => (D.agents || []).find((a) => a.id === id)).filter(Boolean) : [];
    bar.classList.toggle('on', owner && (!!m.on || agOn.length > 0));
    bar.innerHTML = '';
    if (owner && !m.on && agOn.length) {
      bar.innerHTML = `<span><b>Manutenzione degli agenti:</b> ${agOn.map((a) => esc(a.username)).join(', ')} ${agOn.length === 1 ? 'ha' : 'hanno'} bloccato l'app ai propri clienti.</span>` + agOn.map((a) => `<button class="btn sm" data-mtag="${a.id}">Spegni ${esc(a.username)}</button>`).join('');
      $$('[data-mtag]', bar).forEach((b) => (b.onclick = async () => { try { await api('DELETE', '/admin/agent-maint/' + b.dataset.mtag); await load(); toast('Manutenzione dell\'agente spenta'); } catch (e) { toast(e.message, 1); } }));
    }
    if (owner && m.on) {
      const names = (m.allow || []).map((id) => D.devices.find((d) => d.id === id)).filter(Boolean).map((d) => d.name || d.code);
      bar.innerHTML = `<span><b>Manutenzione attiva:</b> l'app è bloccata per ${tutti()}${names.length ? ' tranne ' + names.slice(0, 4).map(esc).join(', ') + (names.length > 4 ? ` e altri ${names.length - 4}` : '') : ''}.</span><button class="btn sm" id="mtEdit">Gestisci</button><button class="btn sm pri" id="mtStop">Termina manutenzione</button>`;
      $('#mtEdit').onclick = openPage;
      $('#mtStop').onclick = async () => {
        if (!(await ask('Terminare la manutenzione?', `L'app torna disponibile per ${tutti()} entro pochi secondi.`, 'Termina'))) return;
        try { await saveM({ ...M(), on: false }); await load(); toast('Manutenzione terminata: app di nuovo disponibile'); } catch (e) { toast(e.message, 1); }
      };
    }
  }
  const rall = renderAll;
  window.renderAll = renderAll = function () { rall(); renderBar(); };

  function openPage() {
    const m = M(), sel = new Set(m.allow || []);
    let q = '';
    const prim = () => D.devices.filter((d) => !d.parent && d.status !== 'pending');
    page.innerHTML = `<div class="ah"><h3>🔧 Manutenzione</h3><button class="icb" id="mtX" title="Chiudi"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg></button></div>
      <div class="ab"><div class="mt-g">
        <div class="mt-c"><h4>Stato</h4><small>Quando è attiva, l'app dei clienti si ferma e mostra il messaggio qui sotto (anche durante la visione, entro circa 20 secondi). I clienti scelti a destra continuano a usarla normalmente: servono per provare le novità.</small>
          <div class="tog ${m.on ? 'on' : ''}" id="mtOn"><div><b>Manutenzione attiva</b><small>Spenta = app disponibile per tutti</small></div><i></i></div>
          <label class="lbl">Messaggio per i clienti</label><textarea class="inp" id="mtMsg" maxlength="300" placeholder="Servizio in manutenzione: torna disponibile a breve. Grazie per la pazienza!">${esc(m.msg || '')}</textarea>
          <p class="mut" style="font-size:12.5px;margin-top:10px">Le scadenze non cambiano e nessun dato viene toccato: finita la manutenzione l'app si riapre da sola.</p></div>
        <div class="mt-c"><h4>Chi può usare l'app durante la manutenzione</h4><small>Scegli i tuoi dispositivi di prova (le connessioni collegate seguono il loro cliente)</small>
          <div style="display:flex;gap:8px;flex-wrap:wrap"><input class="inp" id="mtQ" placeholder="Cerca nome o codice" style="flex:1;min-width:180px;margin:0"><button class="btn sm" id="mtNone">Nessuno</button></div>
          <div class="mt-list" id="mtList"></div><p class="mut" id="mtCnt" style="font-size:12.5px;margin-top:8px"></p></div>
      </div></div>
      <div class="af"><div style="flex:1"></div><button class="btn" id="mtNo">Annulla</button><button class="btn pri" id="mtOk">Salva</button></div>`;
    const draw = () => {
      const list = prim().filter((d) => !q || [d.name, d.code, d.notes].join(' ').toLowerCase().includes(q)).sort((a, b) => (sel.has(b.id) - sel.has(a.id)) || String(a.name || a.code).localeCompare(String(b.name || b.code)));
      $('#mtList').innerHTML = list.length ? list.slice(0, 300).map((d) => `<label class="${sel.has(d.id) ? 'on' : ''}"><input type="checkbox" data-mt="${esc(d.id)}" ${sel.has(d.id) ? 'checked' : ''}>${esc(d.name || '— senza nome —')}<small>${esc(d.code)}</small></label>`).join('') : '<div class="emptyc">Nessun cliente trovato</div>';
      $('#mtCnt').textContent = sel.size ? `${sel.size} client${sel.size === 1 ? 'e può' : 'i possono'} usare l'app durante la manutenzione` : 'Nessuno: durante la manutenzione l\'app sarà bloccata per tutti';
      $$('#mtList [data-mt]').forEach((c) => (c.onchange = () => { c.checked ? sel.add(c.dataset.mt) : sel.delete(c.dataset.mt); c.closest('label').classList.toggle('on', c.checked); $('#mtCnt').textContent = sel.size ? `${sel.size} client${sel.size === 1 ? 'e può' : 'i possono'} usare l'app durante la manutenzione` : 'Nessuno: durante la manutenzione l\'app sarà bloccata per tutti'; }));
    };
    draw();
    $('#mtQ').oninput = (e) => { q = e.target.value.toLowerCase(); draw(); };
    $('#mtNone').onclick = () => { sel.clear(); draw(); };
    $('#mtOn').onclick = () => $('#mtOn').classList.toggle('on');
    const close = () => page.classList.remove('on');
    $('#mtX').onclick = close; $('#mtNo').onclick = close;
    $('#mtOk').onclick = async () => {
      const on = $('#mtOn').classList.contains('on');
      if (on && !m.on && !(await ask('Attivare la manutenzione?', `L'app si fermerà per ${tutti()}${sel.size ? ` tranne ${sel.size}` : ''}, anche per chi sta guardando (entro circa 20 secondi).`, 'Attiva'))) return;
      try { await saveM({ on, msg: $('#mtMsg').value.trim(), allow: [...sel] }); close(); await load(); toast(on ? 'Manutenzione attiva' : 'Impostazioni di manutenzione salvate'); } catch (e) { toast(e.message, 1); }
    };
    page.classList.add('on');
  }
  btn.onclick = openPage;
  addEventListener('keydown', (e) => { if (e.key === 'Escape') page.classList.remove('on'); });
  if ($('#app').classList.contains('on')) renderBar();
})();
