/* KAIROS Control — Store → «App dello store» (solo titolare).
   L'elenco delle app che i clienti vedono nel Kairos Store: è docs/apps.json del repository kairos-store, lo stesso che
   prima si cambiava solo dal pannello a parte dello store (Worker «kairos-store»). Stesse voci: nome, etichetta, colore,
   descrizione, link all'APK, codice Downloader, pacchetto, icona (caricata e ridotta a 144×144), nascondi, ordine.
   Salva il server (/api/admin/store-apps) con il suo token: il browser non lo vede mai. Usa $, esc, api, toast, ask, D, view di app.js. */
(() => {
  if (!$('#side')) return;
  const css = document.createElement('style');
  css.textContent = `
#v-stapps .sa-act{display:flex;gap:8px;flex-wrap:wrap;margin-left:auto}
#v-stapps a.btn{text-decoration:none}
#v-stapps .sa-note{margin:4px 0 0;padding:12px 14px;border-radius:12px;border:1px solid rgba(245,176,65,.45);background:rgba(245,176,65,.1);color:#f4d08f;font-size:13.5px;line-height:1.5}
#v-stapps .sa-note b{color:#ffe2a8}
#v-stapps .sa-note ol{margin:6px 0 0 18px;padding:0}
#v-stapps .sa-store{display:grid;grid-template-columns:1fr 1fr;gap:10px 14px}
#v-stapps .sa-store label,#v-stapps .sa-b label{display:block;font-size:12.5px;color:var(--mut);margin:0 0 4px}
#v-stapps .sa-store .w{grid-column:1/-1}
#v-stapps .sa-store .inp,#v-stapps .sa-b .inp{margin:0;width:100%}
#v-stapps textarea.inp{min-height:64px;resize:vertical;font:inherit}
#v-stapps .sa-list{display:flex;flex-direction:column;gap:10px}
#v-stapps .sa-app{--g:#22d3ee;border:1px solid var(--line);border-radius:14px;background:rgba(255,255,255,.02);overflow:hidden}
#v-stapps .sa-app.open{border-color:color-mix(in srgb,var(--g) 55%,transparent);box-shadow:0 0 0 1px color-mix(in srgb,var(--g) 25%,transparent)}
#v-stapps .sa-app.hid{opacity:.62}
#v-stapps .sa-h{display:flex;align-items:center;gap:12px;padding:10px 12px;cursor:pointer;min-width:0}
#v-stapps .sa-ic{flex:none;width:46px;height:46px;border-radius:12px;display:grid;place-items:center;overflow:hidden;background:color-mix(in srgb,var(--g) 18%,#0b0f17);box-shadow:0 0 18px -6px var(--g);font-weight:800;color:#fff}
#v-stapps .sa-ic img{width:100%;height:100%;object-fit:cover}
#v-stapps .sa-ic.contain img{object-fit:contain;padding:4px}
#v-stapps .sa-tt{flex:1;min-width:0}
#v-stapps .sa-tt b{font-size:15px}
#v-stapps .sa-tt small{display:block;color:var(--mut);font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#v-stapps .sa-bd{display:inline-block;margin-left:8px;padding:1px 7px;border-radius:999px;font-size:10.5px;font-weight:800;letter-spacing:.04em;vertical-align:2px;background:rgba(148,163,184,.18);color:#cbd5e1}
#v-stapps .sa-bd.warn{background:rgba(245,176,65,.16);color:#f2c46c}
#v-stapps .sa-bd.tag{background:color-mix(in srgb,var(--g) 18%,transparent);color:color-mix(in srgb,var(--g) 70%,#fff)}
#v-stapps .sa-mv{display:flex;gap:4px;flex:none}
#v-stapps .sa-mv button{width:32px;height:32px;border-radius:9px;border:1px solid var(--line);background:transparent;color:inherit;cursor:pointer;font-size:15px}
#v-stapps .sa-mv button:disabled{opacity:.3;cursor:default}
#v-stapps .sa-chev{flex:none;transition:transform .2s;opacity:.7}
#v-stapps .sa-app.open .sa-chev{transform:rotate(180deg)}
#v-stapps .sa-b{display:none;padding:4px 14px 14px;border-top:1px solid var(--line)}
#v-stapps .sa-app.open .sa-b{display:block}
#v-stapps .sa-g3{display:grid;grid-template-columns:2fr 1fr 1fr;gap:10px 14px;margin-top:10px}
#v-stapps .sa-g2{display:grid;grid-template-columns:1fr 1fr;gap:10px 14px;margin-top:10px}
#v-stapps .sa-f{margin-top:10px}
#v-stapps .inp.err{border-color:var(--bad)!important}
#v-stapps .sa-col{display:flex;align-items:center;gap:8px}
#v-stapps .sa-col input[type=color]{width:44px;height:38px;border:1px solid var(--line);border-radius:9px;background:transparent;padding:2px;cursor:pointer}
#v-stapps .sa-icrow{display:flex;gap:14px;align-items:flex-start;margin-top:10px;flex-wrap:wrap}
#v-stapps .sa-icrow .sa-ic{width:84px;height:84px;border-radius:18px;font-size:26px}
#v-stapps .sa-icrow>div{flex:1;min-width:220px;display:flex;flex-direction:column;gap:8px}
#v-stapps .sa-chk{display:flex;align-items:center;gap:8px;margin-top:10px;font-size:13.5px;cursor:pointer}
#v-stapps .sa-err{margin-top:10px;color:#fca5a5;font-size:13px}
#v-stapps .sa-del{margin-top:12px;display:flex;justify-content:flex-end}
#v-stapps .sa-bar{position:sticky;bottom:12px;z-index:9;display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:14px;padding:10px 14px;border-radius:14px;border:1px solid rgba(245,176,65,.5);background:rgba(20,16,8,.92);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}
#v-stapps .sa-bar[hidden]{display:none}
#v-stapps .sa-bar span{flex:1;min-width:160px;color:#f4d08f;font-size:13.5px}
@media (max-width:700px){#v-stapps .sa-store,#v-stapps .sa-g3,#v-stapps .sa-g2{grid-template-columns:1fr}#v-stapps .sa-bar{bottom:calc(84px + env(safe-area-inset-bottom));padding:8px 10px;gap:8px}#v-stapps .sa-bar span{flex-basis:100%}#v-stapps .sa-bar .btn{flex:1}#v-stapps .sa-h{gap:9px}}`;
  document.head.appendChild(css);

  const IC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18M16 10a4 4 0 0 1-8 0"/></svg>';
  if (!$('.nav[data-v="stapps"]')) {
    const b = document.createElement('button'); b.className = 'nav'; b.dataset.v = 'stapps'; b.innerHTML = IC + 'App dello store'; b.onclick = () => view('stapps');
    const ref = $('.nav[data-v="store"]'); ref ? ref.before(b) : $('#side').appendChild(b);
    const sec = document.createElement('section'); sec.className = 'view'; sec.id = 'v-stapps'; ($('#v-store') || $('#v-dash')).before(sec);
  }
  if (typeof TITLES === 'object') TITLES.stapps = 'App dello store';
  const V = $('#v-stapps');

  const S = { data: null, saved: '', sha: '', icons: [], canSave: false, token: '', from: '', open: -1, local: {}, busy: false, loading: null, upFor: -1 };
  const PAL = ['#22d3ee', '#8b5cf6', '#ec4899', '#34d399', '#f59e0b', '#60a5fa', '#f43f5e'];
  const isOwner = () => typeof D === 'object' && D && D.role !== 'agent';
  const dirty = () => !!S.data && JSON.stringify(S.data) !== S.saved;
  const validUrl = (u) => /^https?:\/\/[^\s"'<>\\]+\.[^\s"'<>\\]+$/i.test(u);
  const glowOf = (a) => (/^#[0-9a-f]{6}$/i.test(a.glow || '') ? a.glow : '#22d3ee');
  const iconSrc = (p) => (p ? S.local[p] || '/store/' + p.split('/').map(encodeURIComponent).join('/') : '');
  const iconHtml = (a) => (a.icon ? `<img src="${esc(iconSrc(a.icon))}" alt="" loading="lazy">` : esc((a.name || '?').trim().charAt(0).toUpperCase() || '?'));
  const problems = (a) => {
    const p = [];
    if (!String(a.name || '').trim()) p.push('manca il nome');
    if (!String(a.url || '').trim() && !a.hidden) p.push('manca il link all\'APK (oppure nascondila)');
    else if (a.url && !validUrl(a.url)) p.push('il link all\'APK non è valido');
    if (a.pkg && !/^[A-Za-z0-9._]*$/.test(a.pkg)) p.push('nome pacchetto non valido');
    return p;
  };

  async function load(force) {
    if (!isOwner()) return;
    if (S.loading) return S.loading;
    if (S.data && !force && dirty()) return render(); // modifiche in corso: non si ricarica sopra
    S.loading = (async () => {
      if (!S.data) V.innerHTML = '<div class="card glass"><div class="hd"><h3>App dello store<small>Carico l\'elenco dallo store…</small></h3></div></div>';
      try {
        const r = await api('GET', '/admin/store-apps');
        S.data = r.data; S.saved = JSON.stringify(r.data); S.sha = r.sha || ''; S.icons = Array.isArray(r.icons) ? r.icons : [];
        S.canSave = !!r.canSave; S.token = r.token || ''; S.from = r.from || '';
        if (S.open >= S.data.apps.length) S.open = -1;
        render();
      } catch (e) {
        V.innerHTML = `<div class="card glass"><div class="hd"><h3>App dello store<small>${esc(e.message || 'Errore')}</small></h3><button class="btn sm" id="saRetry">Riprova</button></div></div>`;
        const b = $('#saRetry'); if (b) b.onclick = () => load(true);
      } finally { S.loading = null; }
    })();
    return S.loading;
  }

  function note() {
    if (S.canSave) return '';
    if (S.token === 'scrittura') return `<div class="sa-note">GitHub non risponde adesso: vedi la copia pubblicata dello store, solo da guardare. Premi <b>Ricarica</b> tra poco.</div>`;
    return `<div class="sa-note"><b>Per cambiare le app da qui manca un passaggio, da fare una volta sola.</b> Finché non lo fai, qui vedi l'elenco e lo cambi ancora dal pannello a parte dello store.
      <ol><li>Su GitHub: Settings → Developer settings → Fine-grained tokens → <b>Generate new token</b>, con accesso solo al repository <b>kairos-store</b> e permesso <b>Contents: Read and write</b>.</li>
      <li>Nel repository <b>kairos-iptv</b>: Settings → Secrets and variables → Actions → <b>New repository secret</b>, nome <b>STORE_GH_TOKEN</b>, valore il token.</li>
      <li>In Actions rilancia <b>«Pannello Cloudflare»</b> (Run workflow).</li></ol></div>`;
  }

  function appRow(a, i, n) {
    const pr = problems(a), ro = !S.canSave, dis = ro ? ' disabled' : '';
    const icons = [...new Set([...S.icons, ...Object.keys(S.local), a.icon].filter(Boolean))];
    return `<div class="sa-app${i === S.open ? ' open' : ''}${a.hidden ? ' hid' : ''}" style="--g:${esc(glowOf(a))}" data-app="${i}">
      <div class="sa-h" data-act="toggle" data-i="${i}">
        <span class="sa-ic${a.light ? ' contain' : ''}">${iconHtml(a)}</span>
        <span class="sa-tt"><b>${esc(a.name || 'Nuova app')}</b>${a.tag ? `<span class="sa-bd tag">${esc(a.tag)}</span>` : ''}${a.hidden ? '<span class="sa-bd">NASCOSTA</span>' : ''}${pr.length ? '<span class="sa-bd warn">DA COMPLETARE</span>' : ''}
          <small>${esc(a.description || a.url || '—')}</small></span>
        ${ro ? '' : `<span class="sa-mv"><button type="button" data-act="up" data-i="${i}" title="Sposta su" aria-label="Sposta su"${i === 0 ? ' disabled' : ''}>↑</button><button type="button" data-act="down" data-i="${i}" title="Sposta giù" aria-label="Sposta giù"${i === n - 1 ? ' disabled' : ''}>↓</button></span>`}
        <svg class="sa-chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M6 9l6 6 6-6"/></svg>
      </div>
      <div class="sa-b">
        <div class="sa-g3">
          <div><label>Nome *</label><input class="inp" data-f="name" data-i="${i}" value="${esc(a.name || '')}" maxlength="30"${dis}></div>
          <div><label>Etichetta (es. PLAYER)</label><input class="inp" data-f="tag" data-i="${i}" value="${esc(a.tag || '')}" maxlength="14"${dis}></div>
          <div><label>Colore del bagliore</label><div class="sa-col"><input type="color" data-f="glow" data-i="${i}" value="${esc(glowOf(a))}"${dis}><span class="mut">${esc(glowOf(a))}</span></div></div>
        </div>
        <div class="sa-f"><label>Descrizione (si vede nello store)</label><textarea class="inp" data-f="description" data-i="${i}" rows="3" maxlength="1000"${dis}>${esc(a.description || '')}</textarea></div>
        <div class="sa-f"><label>Link diretto all'APK * (deve scaricare il file, non aprire una pagina)</label><input class="inp${a.url && !validUrl(a.url) ? ' err' : ''}" type="url" data-f="url" data-i="${i}" value="${esc(a.url || '')}" placeholder="https://…/app.apk" maxlength="500" spellcheck="false"${dis}></div>
        <div class="sa-g2">
          <div><label>Codice Downloader (promemoria, non si vede nello store)</label><input class="inp" data-f="code" data-i="${i}" value="${esc(a.code || '')}" maxlength="12"${dis}></div>
          <div><label>Nome pacchetto Android (facoltativo, per «Disinstalla»)</label><input class="inp" data-f="pkg" data-i="${i}" value="${esc(a.pkg || '')}" placeholder="com.esempio.player" maxlength="100" spellcheck="false"${dis}></div>
        </div>
        <div class="sa-icrow">
          <span class="sa-ic${a.light ? ' contain' : ''}">${iconHtml(a)}</span>
          <div>
            ${ro ? '' : `<button class="btn sm" type="button" data-act="upload" data-i="${i}">Carica immagine</button>`}
            <select class="inp" data-f="icon" data-i="${i}" aria-label="Icona già caricata"${dis}><option value="">— scegli un'icona già caricata —</option>${icons.map((p) => `<option value="${esc(p)}"${p === a.icon ? ' selected' : ''}>${esc(p.replace(/^icons\//, ''))}</option>`).join('')}</select>
            <label class="sa-chk"><input type="checkbox" data-f="light" data-i="${i}"${a.light ? ' checked' : ''}${dis}> Logo con sfondo trasparente (mostralo intero)</label>
          </div>
        </div>
        <label class="sa-chk"><input type="checkbox" data-f="hidden" data-i="${i}"${a.hidden ? ' checked' : ''}${dis}> Nascondi dallo store (resta qui, la puoi riattivare)</label>
        ${pr.length ? `<div class="sa-err">⚠ ${esc(pr.join(' · '))}</div>` : ''}
        ${ro ? '' : `<div class="sa-del"><button class="btn sm" type="button" data-act="del" data-i="${i}" style="color:#fca5a5">Elimina app</button></div>`}
      </div>
    </div>`;
  }

  function render() {
    if (!S.data) return;
    const d = S.data, st = d.store || (d.store = { name: '', taglines: [], contact: '' }), ro = !S.canSave, dis = ro ? ' disabled' : '';
    const vis = d.apps.filter((a) => !a.hidden).length, y = scrollY;
    V.innerHTML = `
      <div class="card glass"><div class="hd"><h3>App dello store<small>Le app che i clienti vedono nel Kairos Store. È lo stesso elenco del pannello a parte dello store: ora lo cambi da qui, solo tu.</small></h3>
        <div class="sa-act"><a class="btn sm" href="/store/" target="_blank" rel="noopener">Apri lo store</a><button class="btn sm" type="button" id="saReload">Ricarica</button></div></div>
        ${note()}</div>
      <div class="card glass"><div class="hd"><h3>Lo store<small>Nome, contatto e frasi in alto nella pagina dello store</small></h3></div>
        <div class="sa-store">
          <div><label>Nome dello store</label><input class="inp" id="saName" value="${esc(st.name || '')}" maxlength="40"${dis}></div>
          <div><label>Contatto (facoltativo)</label><input class="inp" id="saContact" value="${esc(st.contact || '')}" maxlength="80"${dis}></div>
          <div class="w"><label>Frasi che scorrono in alto (una per riga, massimo 10)</label><textarea class="inp" id="saTag" rows="3"${dis}>${esc((st.taglines || []).join('\n'))}</textarea></div>
        </div></div>
      <div class="card glass"><div class="hd"><h3>App <span class="mut" id="saCount" style="font-weight:500">(${vis} visibili su ${d.apps.length})</span><small>Tocca un'app per cambiarla. Le frecce decidono l'ordine nello store.</small></h3>
        ${ro || d.apps.length >= 60 ? '' : '<button class="btn pri sm" type="button" id="saAdd">+ Aggiungi app</button>'}</div>
        <div class="sa-list" id="saList">${d.apps.length ? d.apps.map((a, i) => appRow(a, i, d.apps.length)).join('') : '<p class="mut">Nessuna app. Premi «+ Aggiungi app».</p>'}</div></div>
      <div class="sa-bar" id="saBar" hidden><span id="saSt">Modifiche non salvate</span><button class="btn" type="button" id="saUndo">Annulla</button><button class="btn pri" type="button" id="saSave">Salva</button></div>
      <input type="file" id="saFile" accept="image/png,image/webp,image/jpeg" hidden>`;
    if (V.classList.contains('on')) scrollTo(0, y);
    bar();
  }
  function bar() {
    const b = $('#saBar'); if (!b) return;
    const d = dirty(), bad = S.data.apps.map(problems).reduce((n, p) => n + (p.length ? 1 : 0), 0);
    b.hidden = !d || !S.canSave;
    const t = $('#saSt'); if (t) t.textContent = S.busy ? 'Salvo…' : bad ? `Modifiche non salvate · ${bad === 1 ? '1 app da completare' : bad + ' app da completare'}` : 'Modifiche non salvate';
    const sv = $('#saSave'); if (sv) sv.disabled = S.busy;
    const c = $('#saCount'); if (c) c.textContent = `(${S.data.apps.filter((a) => !a.hidden).length} visibili su ${S.data.apps.length})`;
  }
  function head(i) { // aggiorna solo l'intestazione dell'app i (mentre si scrive non si ridisegna tutto)
    const el = V.querySelector(`.sa-app[data-app="${i}"]`), a = S.data.apps[i]; if (!el || !a) return;
    const tmp = document.createElement('div'); tmp.innerHTML = appRow(a, i, S.data.apps.length);
    const nh = tmp.querySelector('.sa-h'); el.querySelector('.sa-h').replaceWith(nh);
    const err = el.querySelector('.sa-err'), pr = problems(a);
    if (pr.length) { if (err) err.textContent = '⚠ ' + pr.join(' · '); else { const e = document.createElement('div'); e.className = 'sa-err'; e.textContent = '⚠ ' + pr.join(' · '); const del = el.querySelector('.sa-del'); del ? del.before(e) : el.querySelector('.sa-b').appendChild(e); } }
    else if (err) err.remove();
  }

  async function save() {
    if (S.busy || !dirty()) return;
    const bad = S.data.apps.map((a, i) => [i, problems(a)]).filter(([, p]) => p.length);
    if (bad.length) { S.open = bad[0][0]; render(); toast(`App ${bad[0][0] + 1}: ${bad[0][1][0]}`, 1); return; }
    S.busy = true; bar();
    try {
      const r = await api('PUT', '/admin/store-apps', { data: S.data, sha: S.sha });
      S.data = r.data; S.saved = JSON.stringify(r.data); S.sha = r.sha || S.sha;
      render(); toast('Salvato: lo store mostra le app nuove entro un minuto');
    } catch (e) { toast(e.message || 'Errore', 1); }
    finally { S.busy = false; bar(); }
  }

  // icona: ridotta a 144×144 nel browser (come nel pannello dello store), poi salvata su GitHub dal server
  const readUrl = (f) => new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = ko; r.readAsDataURL(f); });
  async function upload(file, i) {
    const a = S.data.apps[i]; if (!file || !a) return;
    try {
      toast('Carico l\'icona…');
      const src = await readUrl(file);
      const img = await new Promise((ok, ko) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => ko(new Error('Immagine non valida')); im.src = src; });
      const Z = 144, cv = document.createElement('canvas'); cv.width = cv.height = Z;
      const cx = cv.getContext('2d'), k = Math.max(Z / img.width, Z / img.height), w = img.width * k, h = img.height * k;
      cx.drawImage(img, (Z - w) / 2, (Z - h) / 2, w, h);
      let url = cv.toDataURL('image/webp', 0.82), type = 'webp';
      if (!url.startsWith('data:image/webp')) { url = cv.toDataURL('image/png'); type = 'png'; }
      const r = await api('POST', '/admin/store-apps/icon', { name: a.name || 'app', type, data: url.split(',')[1] });
      S.local[r.path] = url; if (!S.icons.includes(r.path)) S.icons.push(r.path);
      a.icon = r.path; S.open = i; render(); toast('Icona caricata: ricordati di salvare');
    } catch (e) { toast(e.message || 'Errore', 1); }
  }

  V.addEventListener('input', (e) => {
    const t = e.target;
    if (t.id === 'saName' || t.id === 'saContact' || t.id === 'saTag') {
      const st = S.data.store; st.name = $('#saName').value; st.contact = $('#saContact').value;
      st.taglines = $('#saTag').value.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 10);
      return bar();
    }
    const f = t.dataset.f, i = +t.dataset.i; if (!f || isNaN(i) || !S.data.apps[i]) return;
    S.data.apps[i][f] = t.type === 'checkbox' ? t.checked : t.value;
    if (f === 'url') t.classList.toggle('err', !!t.value && !validUrl(t.value));
    head(i); bar();
  });
  V.addEventListener('change', (e) => {
    const t = e.target;
    if (t.id === 'saFile') { const i = S.upFor; S.upFor = -1; if (t.files && t.files[0]) upload(t.files[0], i); return; }
    const f = t.dataset.f; if (!f) return;
    if (['icon', 'light', 'hidden', 'glow'].includes(f)) render(); else head(+t.dataset.i);
    bar();
  });
  V.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-act],#saReload,#saAdd,#saSave,#saUndo'); if (!t || !V.contains(t)) return;
    if (t.id === 'saReload') { if (dirty() && !(await ask('Ricaricare l\'elenco?', 'Le modifiche non salvate si perdono.', 'Ricarica'))) return; S.data = null; return load(true); }
    if (t.id === 'saSave') return save();
    if (t.id === 'saUndo') { S.data = JSON.parse(S.saved); render(); return; }
    if (t.id === 'saAdd') {
      S.data.apps.push({ name: '', tag: 'PLAYER', description: '', url: '', code: '', icon: '', glow: PAL[S.data.apps.length % PAL.length], pkg: '', light: false, hidden: false });
      S.open = S.data.apps.length - 1; render();
      const el = V.querySelector(`.sa-app[data-app="${S.open}"]`); if (el) { el.scrollIntoView({ block: 'center' }); const n = el.querySelector('[data-f="name"]'); if (n) n.focus(); }
      return;
    }
    const act = t.dataset.act, i = +t.dataset.i, A = S.data.apps;
    if (act === 'toggle') { if (e.target.closest('.sa-mv')) return; S.open = S.open === i ? -1 : i; const el = V.querySelector(`.sa-app[data-app="${i}"]`); V.querySelectorAll('.sa-app.open').forEach((x) => { if (x !== el) x.classList.remove('open'); }); if (el) el.classList.toggle('open', S.open === i); return; }
    if (act === 'up' && i > 0) { [A[i - 1], A[i]] = [A[i], A[i - 1]]; if (S.open === i) S.open = i - 1; else if (S.open === i - 1) S.open = i; render(); return; }
    if (act === 'down' && i < A.length - 1) { [A[i + 1], A[i]] = [A[i], A[i + 1]]; if (S.open === i) S.open = i + 1; else if (S.open === i + 1) S.open = i; render(); return; }
    if (act === 'del') {
      if (!(await ask('Eliminare l\'app?', `«${esc(A[i].name || 'Nuova app')}» sparisce dallo store dopo il salvataggio. Se vuoi solo toglierla per un po', usa «Nascondi».`, 'Elimina'))) return;
      A.splice(i, 1); S.open = -1; render(); return;
    }
    if (act === 'upload') { S.upFor = i; const fi = $('#saFile'); fi.value = ''; fi.click(); }
  });

  V.addEventListener('error', (e) => { const im = e.target; if (im && im.tagName === 'IMG' && im.closest('.sa-ic')) { const a = S.data && S.data.apps[+((im.closest('.sa-app') || {}).dataset || {}).app]; im.replaceWith(document.createTextNode(((a && a.name) || '?').trim().charAt(0).toUpperCase() || '?')); } }, true);
  addEventListener('beforeunload', (e) => { if (dirty() && isOwner()) { e.preventDefault(); e.returnValue = ''; } });
  // si carica quando la pagina si apre; uscendo dal pannello i dati spariscono dalla memoria
  new MutationObserver(() => { if (V.classList.contains('on')) load(false); }).observe(V, { attributes: true, attributeFilter: ['class'] });
  const appEl = $('#app');
  if (appEl) new MutationObserver(() => { if (!appEl.classList.contains('on')) { S.data = null; S.saved = ''; S.sha = ''; S.local = {}; S.open = -1; V.innerHTML = ''; } }).observe(appEl, { attributes: true, attributeFilter: ['class'] });
})();
