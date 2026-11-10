/* KAIROS Control — «🔒 Repo privati» nella Home, solo per il titolare (10 novembre 2026).
   Promemoria per rendere privati i repository GitHub delle app: per ogni app quanti clienti (visti negli ultimi 30 giorni)
   hanno già l'ultima versione e chi manca (nome, codice, versione, ultimo accesso; clic → la sua scheda). Quando un'app è
   aggiornata da tutti compare «✅ Ora puoi rendere privato …». In alto lo stato del token GH_RELEASES_TOKEN (senza token,
   con un repo privato, store-k.download non legge più gli APK). Dati: GET /admin/repo-ready. Si può ridurre a una riga.
   Kairos Store: riga a parte con gli store (modello, paese, versione); sta nel repository della Pro (kairos-store), che si
   può rendere privato solo quando sono pronte tutte e due le righe. */
(() => {
  const css = document.createElement('style');
  css.textContent = `#rrCard{margin-top:16px}#rrCard .hd h3 small{max-width:760px}
#rrCard .rr-tok{padding:10px 12px;border-radius:12px;margin:4px 0 12px;font-size:13px}
#rrCard .rr-tok.ok{background:rgba(34,197,94,.12);border:1px solid rgba(34,197,94,.4);color:#86efac}#rrCard .rr-tok.no{background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.45);color:#fcd34d}
#rrCard .rr-row{display:grid;grid-template-columns:minmax(150px,1.2fr) minmax(120px,2fr) auto;gap:8px 14px;align-items:center;padding:10px 0;border-top:1px solid var(--line)}
#rrCard .rr-row:first-child{border-top:0}
#rrCard .rr-row b{display:block}#rrCard .rr-row small{color:var(--mut);font-size:12px}
#rrCard .rr-bar{height:8px;border-radius:99px;background:rgba(255,255,255,.08);overflow:hidden}#rrCard .rr-bar i{display:block;height:100%;background:linear-gradient(90deg,#22c55e,#4ade80)}
#rrCard .rr-row.wait .rr-bar i{background:linear-gradient(90deg,#f59e0b,#fbbf24)}
#rrCard .rr-ok{color:#86efac;font-weight:700;font-size:13px}
#rrCard .rr-old{grid-column:1/-1;margin:2px 0 4px;font-size:12.5px;max-height:260px;overflow:auto}
#rrCard .rr-old div{display:flex;gap:10px;align-items:center;padding:4px 6px;border-radius:8px;cursor:pointer}#rrCard .rr-old div:hover{background:rgba(79,140,255,.1)}
#rrCard .rr-old .mono{font-size:12px}#rrCard .rr-old small{margin-left:auto}#rrCard .rr-old div.st{cursor:default}#rrCard .rr-old div.st:hover{background:none}
#rrCard .rr-row small.rr-wait2{display:block;color:var(--mut);font-weight:400}
#rrCard .rr-how{margin-top:10px;font-size:13px}#rrCard .rr-how summary{cursor:pointer;font-weight:700}#rrCard .rr-how ol{margin:8px 0 0 20px;padding:0}#rrCard .rr-how li{margin:4px 0}
#rrCard .rr-note{color:var(--mut);font-size:12px;margin-top:10px}
#rrCard.min .rr-body{display:none}
@media (max-width:700px){#rrCard .rr-row{grid-template-columns:minmax(0,1fr) auto}#rrCard .rr-row .rr-bar{grid-column:1/-1;grid-row:2}}`;
  document.head.appendChild(css);
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const owner = () => typeof D === 'object' && D && D.role && D.role !== 'agent' && !window.__assist;
  const LS = 'kx.rr.min';
  const isMin = () => { try { return localStorage.getItem(LS) === '1'; } catch { return false; } };
  const R = { d: null, t: 0, busy: null, open: new Set(), err: '' };
  const agoTxt = (t) => { if (!t) return '—'; const s = Math.max(0, (Date.now() - t) / 1000); return s < 3600 ? Math.max(1, Math.round(s / 60)) + ' min fa' : s < 129600 ? Math.round(s / 3600) + ' h fa' : Math.round(s / 86400) + ' g fa'; };
  function load(force) {
    if (!owner()) return Promise.resolve(null);
    if (R.busy) return R.busy;
    if (!force && R.d && Date.now() - R.t < 300e3) return Promise.resolve(R.d);
    R.busy = (async () => { try { R.d = await api('GET', '/admin/repo-ready'); R.err = ''; } catch (e) { R.err = (e && e.message) || 'non disponibile'; } R.t = Date.now(); R.busy = null; paint(); return R.d; })();
    return R.busy;
  }
  function html() {
    const d = R.d, apps = (d && d.apps) || [];
    const isDone = (a) => !!a.latest && a.ok === a.total;
    const ready = apps.filter(isDone).length;
    // un repository con più righe (kairos-store: Kairos Pro e Kairos Store) è pronto solo quando lo sono tutte
    const waitOf = (a) => apps.filter((x) => x.repo === a.repo && x !== a && !isDone(x)).map((x) => x.name);
    const head = `<div class="hd"><h3>🔒 Repo privati${d ? ` · ${ready} di ${apps.length} app pronte` : ''}<small>Quando tutti i clienti hanno l'ultima versione di un'app, puoi rendere privato il suo repository su GitHub. Conto i clienti visti negli ultimi ${d ? d.days : 30} giorni. Lo vedi solo tu.</small></h3><div style="display:flex;gap:6px"><button type="button" class="btn sm" data-rr="re" title="Aggiorna">↻</button><button type="button" class="btn sm" data-rr="min">${isMin() ? 'Apri' : 'Riduci'}</button></div></div>`;
    if (!d) return head + `<div class="rr-body"><p class="mut">${R.err ? 'Non disponibile: ' + esc(R.err) : 'Controllo le versioni dei clienti…'}</p></div>`;
    const tok = d.token ? '<div class="rr-tok ok">✅ Token GH_RELEASES_TOKEN messo: con i repo privati gli APK e gli aggiornamenti passano lo stesso da store-k.download.</div>'
      : '<div class="rr-tok no">⚠️ Prima metti il token GH_RELEASES_TOKEN (passi qui sotto): senza, appena un repo è privato si fermano download e aggiornamenti per tutti.</div>';
    const rows = apps.map((a) => {
      const pct = a.total ? Math.round((a.ok / a.total) * 100) : 100, done = isDone(a), miss = a.total - a.ok, op = R.open.has(a.app);
      const others = done ? waitOf(a) : [];
      const right = !a.latest ? '<small>ultima versione non disponibile</small>'
        : done && others.length ? `<span class="rr-ok">✅ Aggiornata da tutti<small class="rr-wait2">per ${esc(a.repo)} aspetta ${esc(others.join(', '))}</small></span>`
        : done ? `<span class="rr-ok">✅ Ora puoi rendere privato ${esc(a.repo)}</span>`
        : `<button type="button" class="btn sm" data-rr="old" data-a="${esc(a.app)}">${op ? 'Chiudi' : `Chi manca (${miss})`}</button>`;
      // righe dei clienti: clic → la sua scheda; righe degli store: solo modello, paese, versione e ultima apertura
      const item = (x) => x.id
        ? `<div data-rrdev="${esc(x.id)}" title="Apri il cliente"><b>${esc(x.name)}</b><span class="mono">${esc(x.code)}</span><span>versione ${esc(x.ver || '?')}</span><small>${esc(agoTxt(x.seen))}</small></div>`
        : `<div class="st"><b>${esc(x.name)}</b><span class="mono">${esc(x.code)}</span><span>versione ${esc(x.ver || '?')}</span><small>${esc(agoTxt(x.seen))}</small></div>`;
      const list = op && !done ? `<div class="rr-old">${a.old.map(item).join('')}${miss > a.old.length ? `<p class="mut">… e altri ${miss - a.old.length}</p>` : ''}</div>` : '';
      const who = a.store ? 'store' : 'clienti', none = a.store ? 'nessuno store aperto negli ultimi 30 giorni' : 'nessun cliente negli ultimi 30 giorni';
      return `<div class="rr-row${done ? '' : ' wait'}"><div><b>${esc(a.name)}</b><small>repo ${esc(a.repo)}${a.latest ? ' · ultima ' + esc(a.latest) : ''}</small></div><div><div class="rr-bar"><i style="width:${pct}%"></i></div><small>${a.total ? `${a.ok} di ${a.total} ${who} aggiornati` : none}</small></div>${right}${list}</div>`;
    }).join('');
    const how = `<details class="rr-how"><summary>Passi: token e repo privati</summary><ol>
      <li>GitHub → foto in alto a destra → Settings → Developer settings → Personal access tokens → <b>Fine-grained tokens</b> → <b>Generate new token</b>.</li>
      <li>Nome «Kairos download», scadenza la più lunga; <b>Only select repositories</b>: kairos-tv, kairos-premium, kairos-xc, kairos-lite, kairos-flutter, Lairos-nova, kairos-store.</li>
      <li>Permissions → Repository permissions → <b>Contents: Read-only</b> (nient'altro). <b>Generate token</b> e copialo subito: non mandarlo in chat.</li>
      <li>Repo <b>kairos-iptv</b> → Settings → Secrets and variables → Actions → <b>New repository secret</b> → nome <b>GH_RELEASES_TOKEN</b> → incolla → Add secret.</li>
      <li>Actions → «Pannello Cloudflare» → <b>Run workflow</b>: qui sopra compare «✅ Token messo».</li>
      <li>Quando un'app ha «✅ Ora puoi rendere privato»: repo → Settings → General → Danger Zone → <b>Change visibility</b> → Private. Poi prova subito un aggiornamento dall'app.</li></ol></details>
      <p class="rr-note">Minuti GitHub: 2.000 al mese gratis per tutti i repo privati insieme (GitHub Free). Negli ultimi 30 giorni le app ne hanno usati circa 1.220 e il pannello circa 710: il pannello (kairos-iptv) lascialo per ultimo, oppure con GitHub Pro (3.000 minuti). Aggiornato alle ${esc(new Date(d.t || R.t).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }))}.</p>`;
    return head + `<div class="rr-body">${tok}<div class="rr-list">${rows}</div>${how}</div>`;
  }
  function paint() {
    const home = $('#v-home .h4-home'); if (!home) return;
    let c = $('#rrCard');
    if (!owner()) { if (c) c.remove(); return; }
    if (!c || c.parentElement !== home) { if (c) c.remove(); c = document.createElement('div'); c.id = 'rrCard'; c.className = 'card glass'; home.appendChild(c); }
    c.classList.toggle('min', isMin());
    const h = html(); if (c._h !== h) { c._h = h; const det = c.querySelector('.rr-how'), wasOpen = det && det.open; c.innerHTML = h; if (wasOpen && c.querySelector('.rr-how')) c.querySelector('.rr-how').open = true; }
  }
  document.addEventListener('click', (e) => {
    const c = $('#rrCard'); if (!c || !c.contains(e.target)) return;
    const b = e.target.closest('[data-rr],[data-rrdev]'); if (!b) return;
    if (b.dataset.rrdev) { const d = ((typeof D === 'object' && D && D.devices) || []).find((x) => x.id === b.dataset.rrdev); if (d && typeof openDrawer === 'function') openDrawer(d); return; }
    const a = b.dataset.rr;
    if (a === 're') return load(true);
    if (a === 'min') { try { localStorage.setItem(LS, isMin() ? '0' : '1'); } catch {} c._h = ''; return paint(); }
    if (a === 'old') { const k = b.dataset.a; R.open.has(k) ? R.open.delete(k) : R.open.add(k); return paint(); }
  });
  // la Home si ridisegna da sola (home4.js): il riquadro si rimette in fondo ogni volta
  const home = $('#v-home');
  if (home) new MutationObserver(() => { if (home.classList.contains('on') && !$('#rrCard', home)) { paint(); load(); } }).observe(home, { childList: true, subtree: false, attributes: true, attributeFilter: ['class'] });
  window.KXRepoReady = { load, paint };
})();
