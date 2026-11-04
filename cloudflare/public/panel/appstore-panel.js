/* KAIROS Control — APP Store: rinomina «App terzi» in «APP Store» e aggiunge in cima il blocco «Attiva app»
   con il link di gestione dispositivo di ogni app dello store (OraPlayers, IboOne, ecc.): copiabile, modificabile,
   e con «+ Aggiungi app». Sotto resta tutto quello che c'era in App terzi (OrbixPlay/MaxPlayer, DNS, pulizia inattivi).
   Deve caricarsi DOPO players-panel.js e nav2.js. Usa le funzioni di app.js. Solo titolare. */
(() => {
  const DEF = [
    { name: 'OrbixPlay', url: 'https://orbixplay.com/mylist' },
    { name: 'MaxPlayer', url: 'https://my.maxplayer.tv' },
    { name: 'Ora Player', url: 'https://euser.oraplayers.com/subscribe-web' },
    { name: 'Ora Pro', url: 'https://euser.oraprotv.com/manage-device?redirectURL=%2Fdevice-info' },
    { name: 'Ibo One', url: 'https://euser.iboonetv.com/manage-device?redirectURL=%2Fsubscribe-web' },
    { name: 'Ibo Player', url: 'https://iboplayer.com/device/login' },
    { name: 'Kemet', url: 'https://euser.kemetiptv.com/manage-device' },
    { name: 'Gravity', url: 'https://euser.gravityiptv.com/manage-device' },
    { name: 'Hot Ora IPTV', url: 'https://euser.hotoraiptv.com/manage-device' },
    { name: 'Duplex Pro', url: 'https://euser.duplexprotv.com/manage-device' },
    { name: 'TiviMate Pro', url: 'https://www.tivimateiptvpro.com/playlist' },
  ];
  const css = document.createElement('style');
  css.textContent = `
#appLinksCard .al-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:4px}
#appLinksCard .al-head .sp{flex:1}
.al-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:10px;margin-top:12px}
.al-c{display:flex;flex-direction:column;gap:8px;background:#1a1d22;border:1px solid var(--line);border-radius:10px;padding:12px 14px}
.al-c b{font-size:14.5px}
.al-u{display:flex;align-items:center;gap:8px;padding:7px 9px;border-radius:7px;background:var(--glass);border:1px solid var(--line);font-size:12.5px}
.al-u a{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#8fb3ff;text-decoration:none;font-family:'JetBrains Mono',monospace}
.al-u .nourl{flex:1;color:var(--mut)}
.al-act{display:flex;gap:6px}
.al-e{display:grid;grid-template-columns:150px 1fr auto;gap:8px;align-items:center;margin-bottom:8px}
.al-e .inp{margin:0}
@media (max-width:760px){.al-e{grid-template-columns:1fr}}`;
  document.head.appendChild(css);

  // --- rinomina «App terzi» → «APP Store» (menu + titolo) ---
  const setNavLabel = (v, label) => { const b = $(`.nav[data-v="${v}"]`); if (!b) return; let done = false; for (const n of b.childNodes) if (n.nodeType === 3 && n.textContent.trim()) { n.textContent = label; done = true; break; } if (!done) b.appendChild(document.createTextNode(label)); };
  const applyName = () => { TITLES.apps3 = 'APP Store'; setNavLabel('apps3', 'APP Store'); if ($('#vTitle') && $('.view.on') && $('.view.on').id === 'v-apps3') $('#vTitle').textContent = 'APP Store'; };
  applyName();

  const isOwner = () => D.role !== 'agent';
  const copy = (t) => navigator.clipboard.writeText(t).then(() => toast('Link copiato'), () => toast('Copia non consentita dal browser', 1));
  const links = () => { const a = D.settings && D.settings.appLinks; return Array.isArray(a) && a.length ? a : DEF; };
  let editing = null, busy = false;

  // --- card «Attiva app» in cima alla pagina APP Store ---
  const pane = $('#v-apps3');
  if (pane && !$('#appLinksCard')) {
    const card = document.createElement('div');
    card.className = 'card glass'; card.id = 'appLinksCard';
    pane.insertAdjacentElement('afterbegin', card);
  }

  const save = async (list) => {
    if (busy) return; busy = true;
    try { await api('PUT', '/admin/settings', { appLinks: list }); await load(); toast('Salvato'); editing = null; }
    catch (e) { toast(e.message, 1); }
    busy = false; render();
  };

  function render() {
    const card = $('#appLinksCard'); if (!card) return;
    if (!isOwner()) { card.style.display = 'none'; return; }
    card.style.display = '';
    if (editing) return renderEdit(card);
    const l = links();
    card.innerHTML = `<div class="hd"><h3>Attiva app<small>Il link di gestione dispositivo di ogni app dello store: aprilo, incolla il codice del cliente e attivi la lista. Copia il link, modificalo o aggiungine altri.</small></h3></div>
      <div class="al-head"><span class="mut" style="font-size:12.5px">${l.length} app</span><span class="sp"></span><button class="btn sm" id="alEdit">Modifica elenco</button></div>
      ${l.length ? `<div class="al-grid">${l.map((x, i) => `<div class="al-c"><b>${esc(x.name)}</b>
        <div class="al-u">${x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.url.replace(/^https?:\/\//, ''))}</a>` : '<span class="nourl">— nessun link —</span>'}</div>
        <div class="al-act">${x.url ? `<button class="btn sm pri" data-alc="${i}">Copia link</button><a class="btn sm" href="${esc(x.url)}" target="_blank" rel="noopener">Apri ↗</a>` : ''}</div></div>`).join('')}</div>` : '<div class="emptyc" style="padding:18px">Nessuna app. Premi «Modifica elenco» per aggiungerne.</div>'}`;
    $('#alEdit').onclick = () => { editing = links().map((x) => ({ ...x })); render(); };
    $$('[data-alc]', card).forEach((b) => (b.onclick = () => copy(links()[+b.dataset.alc].url)));
  }

  function readEdit(card) {
    editing = $$('.al-e', card).map((r) => ({ name: $('[data-k="name"]', r).value.trim(), url: $('[data-k="url"]', r).value.trim() }));
  }
  function renderEdit(card) {
    card.innerHTML = `<div class="hd"><h3>Attiva app — modifica<small>Nome dell'app e link di gestione dispositivo. Trascina non serve: l'ordine è quello della lista.</small></h3></div>
      <div class="al-head"><button class="btn sm" id="alAdd">+ Aggiungi app</button><span class="sp"></span><button class="btn sm" id="alNo">Annulla</button><button class="btn sm pri" id="alOk">Salva</button></div>
      <div style="margin-top:12px">${editing.map((x, i) => `<div class="al-e"><input class="inp" data-k="name" maxlength="60" placeholder="Nome app (es. OraPlayers)" value="${esc(x.name || '')}"><input class="inp mono" data-k="url" maxlength="300" placeholder="https://euser.esempio.com/manage-device" value="${esc(x.url || '')}"><button class="icb" data-aldel="${i}" title="Togli">✕</button></div>`).join('')}</div>`;
    $('#alAdd').onclick = () => { readEdit(card); editing.push({ name: '', url: '' }); render(); };
    $('#alNo').onclick = () => { editing = null; render(); };
    $$('[data-aldel]', card).forEach((b) => (b.onclick = () => { readEdit(card); editing.splice(+b.dataset.aldel, 1); render(); }));
    $('#alOk').onclick = () => { readEdit(card); save(editing.filter((x) => x.name || x.url)); };
    for (const ev of ['input', 'change']) card.addEventListener(ev, (e) => e.stopPropagation());
  }

  const ra = renderAll;
  window.renderAll = renderAll = function () { ra(); applyName(); render(); };

  if (typeof DEMO !== 'undefined' && DEMO.settings && !DEMO.settings.appLinks) {
    DEMO.settings.appLinks = DEF.map((x) => ({ ...x }));
  }
})();
