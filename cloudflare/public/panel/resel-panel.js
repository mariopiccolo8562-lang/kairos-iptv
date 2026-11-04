/* KAIROS Control — Reseller (app terze): quadro personale del titolare.
   Kairos NON entra nel pannello del fornitore (es. OraPlayers): qui tieni l'elenco dei tuoi reseller,
   scegli quali abilitare e per quanto (1 anno / illimitato) e segni lo stato. L'abilitazione la fai tu
   nel pannello del fornitore, con un clic. Niente automazioni sul loro sito, niente rischio ban.
   Usa le funzioni di app.js ($, $$, esc, api, toast, ask, D, load, view, TITLES, renderAll). Solo titolare. */
(() => {
  const ORA = 'https://panel.oraplayers.com/reseller/users/sub-resellers';
  const css = document.createElement('style');
  css.textContent = `
.rs-top{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:8px}
.rs-top .inp{margin:0}.rs-q{flex:1;min-width:200px;max-width:360px}
.rs-note-top{font-size:12.5px;color:var(--mut);margin:0 0 16px;line-height:1.5;max-width:720px}
.rs-link{display:flex;gap:8px;align-items:center;flex-wrap:wrap;background:var(--glass);border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin-bottom:16px}
.rs-link label{font-size:12px;color:var(--mut);font-weight:600;flex:0 0 auto}
.rs-link .inp{flex:1;min-width:220px;margin:0;font-family:'JetBrains Mono',monospace;font-size:12.5px}
.rs-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px}
.rs-c{background:var(--glass);border:1px solid var(--line);border-radius:12px;padding:14px 16px;display:flex;flex-direction:column;gap:10px;transition:border-color .15s}
.rs-c.on{border-color:rgba(52,199,123,.45)}
.rs-h{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.rs-h b{font-size:15px;flex:1;min-width:0;word-break:break-word}
.rs-pan{font-size:11px;font-weight:700;padding:2px 7px;border-radius:5px;background:rgba(224,164,49,.16);color:#ecc06f;white-space:nowrap}
.rs-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.rs-seg{display:inline-flex;border:1px solid var(--line);border-radius:8px;overflow:hidden}
.rs-seg button{background:none;border:0;color:var(--mut);font:inherit;font-size:12px;padding:5px 10px;cursor:pointer}
.rs-seg button.on{background:#2a2e36;color:var(--tx,#fff);font-weight:600}
.rs-st{border:0;border-radius:8px;padding:6px 12px;font:inherit;font-size:12.5px;font-weight:700;cursor:pointer;flex:1;min-width:130px}
.rs-st.todo{background:rgba(224,164,49,.16);color:#ecc06f}.rs-st.done{background:rgba(52,199,123,.18);color:#6ee3a6}
.rs-note{width:100%;margin:0;font-size:12.5px}
.rs-foot{display:flex;align-items:center;gap:8px;font-size:11.5px;color:var(--mut)}.rs-foot .sp{flex:1}
.rs-del{background:none;border:0;color:var(--mut);cursor:pointer;font-size:14px;padding:2px 6px;border-radius:6px}.rs-del:hover{color:#ff6b6b;background:rgba(255,107,107,.12)}
.rs-count{font-size:12.5px;color:var(--mut)}`;
  document.head.appendChild(css);

  const IC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';
  if (!$('.nav[data-v="resel"]')) {
    const b = document.createElement('button'); b.className = 'nav'; b.dataset.v = 'resel'; b.innerHTML = IC + 'Reseller'; b.onclick = () => view('resel');
    const anchor = $('.nav[data-v="dlc"]') || $('.nav[data-v="apps3"]') || $('.nav[data-v="dns"]');
    anchor ? anchor.after(b) : $('#side').appendChild(b);
    const sec = document.createElement('section'); sec.className = 'view'; sec.id = 'v-resel'; $('#v-dash').after(sec);
  }
  TITLES.resel = 'Reseller';

  const ago2 = (t) => (typeof ago === 'function' ? ago(t) : new Date(t).toLocaleDateString('it-IT'));
  const isOwner = () => D.role !== 'agent';
  const listRaw = () => (D.settings && Array.isArray(D.settings.resel) ? D.settings.resel : []);
  const panelUrl = () => (D.settings && D.settings.reselUrl) || ORA;
  let q = '', onlyTodo = false, busy = false;

  const save = async (resel, extra) => {
    if (busy) return; busy = true;
    try { await api('PUT', '/admin/settings', { resel, ...(extra || {}) }); await load(); }
    catch (e) { toast(e.message, 1); }
    busy = false; render();
  };

  function card(x) {
    const d1 = x.dur === '1y', un = x.dur === 'unlim';
    return `<div class="rs-c ${x.done ? 'on' : ''}" data-id="${esc(x.id)}">
      <div class="rs-h"><b>${esc(x.name)}</b>${x.panel ? `<span class="rs-pan">${esc(x.panel)}</span>` : ''}</div>
      <div class="rs-row"><span class="rs-seg" data-dur><button data-d="1y" class="${d1 ? 'on' : ''}">1 anno</button><button data-d="unlim" class="${un ? 'on' : ''}">Illimitato</button><button data-d="" class="${!x.dur ? 'on' : ''}">—</button></span></div>
      <button class="rs-st ${x.done ? 'done' : 'todo'}" data-st>${x.done ? '✓ Abilitato' : '○ Da abilitare'}</button>
      <input class="inp rs-note" data-note placeholder="Nota (facoltativa)" maxlength="200" value="${esc(x.note || '')}">
      <div class="rs-foot"><span>${x.t ? 'agg. ' + ago2(x.t) : ''}</span><span class="sp"></span><button class="rs-del" data-del title="Togli">✕ togli</button></div>
    </div>`;
  }

  function render() {
    const el = $('#v-resel'); if (!el) return;
    if (!isOwner()) { el.innerHTML = '<div class="emptyc">Sezione riservata al titolare</div>'; return; }
    const all = listRaw(), ql = q.toLowerCase();
    const shown = all.filter((x) => (!onlyTodo || !x.done) && (!ql || [x.name, x.panel, x.note].join(' ').toLowerCase().includes(ql)));
    const todo = all.filter((x) => !x.done).length;
    el.innerHTML =
      `<p class="rs-note-top">Qui scegli <b>tu</b> quali reseller abilitare e per quanto. Kairos tiene l'elenco e lo stato: <b>non entra nel pannello del fornitore</b>. Quando segni «da abilitare», apri il pannello col pulsante qui sotto e lo abiliti lì con un clic.</p>
      <div class="rs-link"><label>Pannello fornitore</label><input class="inp" id="rsUrl" placeholder="https://panel.oraplayers.com/..." value="${esc(panelUrl())}"><button class="btn sm" id="rsUrlSave">Salva link</button><a class="btn sm pri" href="${esc(panelUrl())}" target="_blank" rel="noopener">Apri pannello ↗</a></div>
      <div class="rs-top"><input class="inp rs-q" id="rsQ" placeholder="Cerca reseller" value="${esc(q)}"><button class="btn sm ${onlyTodo ? 'pri' : ''}" id="rsFilt">${onlyTodo ? '● ' : ''}Solo da abilitare</button><button class="btn" id="rsAdd">+ Aggiungi reseller</button><span class="rs-count">${all.length} reseller · ${todo} da abilitare</span></div>
      ${shown.length ? `<div class="rs-grid">${shown.map(card).join('')}</div>` : `<div class="emptyc">${all.length ? 'Nessun reseller con questo filtro' : 'Ancora nessun reseller. Premi «+ Aggiungi reseller».'}</div>`}`;

    const Q = $('#rsQ'); Q.oninput = (e) => { q = e.target.value; const p = e.target.selectionStart; render(); const n = $('#rsQ'); n.focus(); n.setSelectionRange(p, p); };
    $('#rsFilt').onclick = () => { onlyTodo = !onlyTodo; render(); };
    $('#rsUrlSave').onclick = () => { const u = $('#rsUrl').value.trim(); save(listRaw(), { reselUrl: u }); toast('Link salvato'); };
    $('#rsAdd').onclick = async () => {
      const name = (await askText('Nuovo reseller', 'Nome / username del reseller su OraPlayers')); if (!name) return;
      save([{ id: '', name, panel: 'OraPlayers', dur: '', done: false, note: '', t: Date.now() }, ...listRaw().map((x) => ({ ...x }))]);
    };
    $$('#v-resel .rs-c', el).forEach((c) => {
      const id = c.dataset.id, cur = () => listRaw().find((x) => x.id === id) || {};
      $$('[data-dur] button', c).forEach((b) => (b.onclick = () => { const next = listRaw().map((x) => x.id === id ? { ...x, dur: b.dataset.d, t: Date.now() } : x); save(next); }));
      $('[data-st]', c).onclick = () => { const next = listRaw().map((x) => x.id === id ? { ...x, done: !x.done, t: Date.now() } : x); save(next); };
      $('[data-note]', c).onchange = (e) => { const v = e.target.value.trim(); const next = listRaw().map((x) => x.id === id ? { ...x, note: v, t: Date.now() } : x); save(next); };
      $('[data-del]', c).onclick = async () => { if (!(await ask('Togliere questo reseller dall\'elenco?', esc(cur().name || ''), 'Togli'))) return; save(listRaw().filter((x) => x.id !== id)); };
    });
  }

  // piccolo prompt testuale (non c'è un helper nel core): usa un overlay semplice
  function askText(title, ph) {
    return new Promise((res) => {
      const ov = document.createElement('div'); ov.style = 'position:fixed;inset:0;background:#0008;display:flex;align-items:center;justify-content:center;z-index:9999';
      ov.innerHTML = `<div style="background:var(--bg,#14161b);border:1px solid var(--line);border-radius:14px;padding:20px;width:min(420px,92vw)">
        <b style="font-size:15px">${esc(title)}</b><input class="inp" id="atIn" placeholder="${esc(ph || '')}" maxlength="60" style="margin:12px 0 14px;width:100%">
        <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn" id="atNo">Annulla</button><button class="btn pri" id="atOk">Aggiungi</button></div></div>`;
      document.body.appendChild(ov);
      const inp = ov.querySelector('#atIn'); inp.focus();
      const done = (v) => { ov.remove(); res(v); };
      ov.querySelector('#atNo').onclick = () => done('');
      ov.querySelector('#atOk').onclick = () => done(inp.value.trim());
      inp.onkeydown = (e) => { if (e.key === 'Enter') done(inp.value.trim()); if (e.key === 'Escape') done(''); };
      ov.onclick = (e) => { if (e.target === ov) done(''); };
    });
  }

  const ra = renderAll;
  window.renderAll = renderAll = function () {
    ra();
    const nav = $('.nav[data-v="resel"]'); if (nav) nav.style.display = isOwner() ? '' : 'none';
    if (isOwner()) render();
  };

  if (typeof DEMO !== 'undefined' && DEMO.settings && !DEMO.settings.resel) {
    DEMO.settings.resel = [
      { id: 'r1', name: 'luca.tv', panel: 'OraPlayers', dur: '1y', done: true, note: 'Rinnovato a ottobre', t: Date.now() - 86400000 * 3 },
      { id: 'r2', name: 'marco_reseller', panel: 'OraPlayers', dur: 'unlim', done: false, note: '', t: Date.now() - 86400000 },
      { id: 'r3', name: 'sud_iptv', panel: 'OraPlayers', dur: '', done: false, note: 'Da ricontattare', t: Date.now() - 3600000 },
    ];
    DEMO.settings.reselUrl = ORA;
  }
})();
