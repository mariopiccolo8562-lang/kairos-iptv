/* KAIROS Control — «➕ Aggiungi dispositivo» su ogni cliente (11 novembre 2026).
   Dal cliente (riga dell'elenco o scheda) si collega un'altra TV allo stesso abbonamento, senza aprire niente altro:
   - «TV in attesa adesso»: le TV che hanno appena aperto l'app sul codice; quelle della stessa rete del cliente (stesso IP)
     in cima con «🏠 stessa rete». Un clic su «Collega» e la TV è sua. Il titolare vede tutte quelle delle ultime 48 ore,
     l'agente solo quelle della stessa rete di un suo cliente (GET /admin/devices/near?for=…). Si aggiorna ogni 5 secondi;
   - «Codice della TV» (KXAB-12CD) se la TV non è nell'elenco;
   - «Codice a 6 cifre» se la TV è a casa del cliente: lo scrive sulla TV nuova («Ho già un abbonamento»), vale 10 minuti.
   Se il cliente ha già tutti i dispositivi, si aumentano da soli di quelli che servono (spunta accesa), fino a 20 per il
   titolare e fino a «Connessioni per cliente» per l'agente. Titolare e agenti con «Collegare altri dispositivi».
   Nell'elenco «Da attivare» (solo titolare) ogni TV della stessa rete di un cliente mostra «🏠 Casa di …» con «Collega».
   Usa app.js ($, esc, api, toast, ask, D, load, renderDevices). */
(() => {
  const css = document.createElement('style');
  css.textContent = `#adOv{position:fixed;inset:0;z-index:39;background:rgba(5,8,16,.62);backdrop-filter:blur(3px);display:flex;align-items:flex-start;justify-content:center;padding:6vh 16px;overflow:auto}
#adOv .ad-box{width:min(620px,100%);background:var(--pane,#0e1424);border:1px solid var(--line);border-radius:18px;padding:18px 18px 16px;box-shadow:0 30px 80px rgba(0,0,0,.5)}
#adOv .ad-hd{display:flex;align-items:flex-start;gap:10px}#adOv .ad-hd h3{flex:1;margin:0;font-size:18px}#adOv .ad-hd h3 small{display:block;color:var(--mut);font-size:12.5px;font-weight:500;margin-top:3px}
#adOv .ad-sec{margin-top:14px}#adOv .ad-sec>b{display:block;font-size:13.5px;margin-bottom:6px}#adOv .ad-sec>b small{color:var(--mut);font-weight:500;margin-left:6px}
#adOv .ad-tv{display:flex;align-items:center;gap:10px;padding:9px 11px;border:1px solid var(--line);border-radius:12px;margin-top:6px;background:rgba(255,255,255,.025)}
#adOv .ad-tv.same{border-color:rgba(34,197,94,.55);background:rgba(34,197,94,.07)}#adOv .ad-tv>div{flex:1;min-width:0}#adOv .ad-tv b{font-size:14px}#adOv .ad-tv small{display:block;color:var(--mut);font-size:12px}
#adOv .ad-same{display:inline-block;font-size:11.5px;font-weight:700;color:#86efac;background:rgba(34,197,94,.15);border-radius:999px;padding:1px 8px;margin-left:6px}
#adOv .ad-row{display:flex;gap:8px;align-items:center}#adOv .ad-row .inp{margin:0;flex:1}
#adOv .ad-pin{font-size:38px;font-weight:800;letter-spacing:.25em;text-align:center;margin:8px 0 2px}#adOv .ad-empty{color:var(--mut);font-size:13px;padding:6px 2px}
#adOv .ad-warn{padding:9px 12px;border-radius:12px;border:1px solid rgba(245,158,11,.45);background:rgba(245,158,11,.1);color:#fcd34d;font-size:13px;margin-top:10px}
#adOv .tog{margin-top:10px}
.dvt-ib.a{color:#22d3ee;border-color:rgba(34,211,238,.35);background:rgba(34,211,238,.08)}
.ad-near{display:flex;align-items:center;gap:6px 8px;flex-wrap:wrap;margin-top:6px;font-size:12.5px;color:#86efac}.ad-near b{color:#bbf7d0}.ad-near span{white-space:nowrap}
.dvt .ad-near{margin:4px 0 0;flex-direction:column;align-items:flex-start}.dvt .ad-near .btn{padding:4px 10px;font-size:12px}
.dvt .ad-near span,.dvt .ad-near b{display:inline;white-space:nowrap;font-size:12.5px;margin:0}`;
  document.head.appendChild(css);

  const MAX = 20;
  const isAg = () => typeof D === 'object' && D && D.role === 'agent';
  const perms = () => ((typeof D === 'object' && D && D.me) || {}).perms || {};
  const can = () => typeof D === 'object' && D && !window.__assist && (!isAg() || !!perms().link);
  const cap = () => (isAg() ? Math.max(1, +perms().maxConn || 1) : MAX);
  const devs = () => ((typeof D === 'object' && D && D.devices) || []);
  const kids = (id) => devs().filter((x) => x.parent === id).length;
  const ago = (t) => { const s = Math.max(0, (Date.now() - (+t || 0)) / 1000); return s < 60 ? 'adesso' : s < 3600 ? Math.round(s / 60) + ' min fa' : s < 86400 ? Math.round(s / 3600) + ' h fa' : Math.round(s / 86400) + ' g fa'; };
  const codeNorm = (v) => { let c = String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); if (c.length === 8) c = c.slice(0, 4) + '-' + c.slice(4); return c; };
  const reload = async () => { try { if (typeof load === 'function') await load(); } catch {} };

  let S = null; // finestra aperta: { c, tvs, err, grow, pin, busy, timer }
  const counts = () => { const c = S.c, used = 1 + kids(c.id), max = +c.maxConn || 1; return { used, max, need: used + 1, full: used + 1 > max }; };
  function growHtml() {
    const g = counts(); if (!g.full) return '';
    if (g.need > cap()) return `<div class="ad-warn">⚠️ ${esc(S.c.name || S.c.code)} ha già ${g.used} di ${g.max} dispositivi e ${isAg() ? `il tuo limite è ${cap()} per cliente: chiedi al titolare di aumentarlo.` : `il massimo è ${MAX}.`}</div>`;
    if (isAg() && g.max > cap()) return `<div class="ad-warn">⚠️ I dispositivi di ${esc(S.c.name || S.c.code)} li ha decisi il titolare: chiedi a lui di aumentarli.</div>`;
    return `<div class="tog${S.grow ? ' on' : ''}" data-adgrow><div><b>Aumenta i dispositivi a ${g.need}</b><small>${esc(S.c.name || S.c.code)} ha già ${g.used} di ${g.max} ${g.max === 1 ? 'dispositivo' : 'dispositivi'}: lo faccio insieme al collegamento.</small></div><i></i></div>`;
  }
  const blocked = () => { const g = counts(); return g.full && (g.need > cap() || (isAg() && g.max > cap()) || !S.grow); };
  function tvsHtml() {
    if (!S.tvs) return '<div class="ad-empty">Cerco le TV in attesa…</div>';
    if (!S.tvs.length) return `<div class="ad-empty">${isAg() ? 'Nessuna TV nuova dalla stessa rete di questo cliente.' : 'Nessuna TV in attesa.'} Sulla TV nuova apri l'app: compare un codice e la TV appare qui da sola. Oppure usa una delle strade qui sotto.</div>`;
    return S.tvs.map((t) => `<div class="ad-tv${t.same ? ' same' : ''}"><div><b>${esc(t.model || 'TV')}</b>${t.same ? '<span class="ad-same">🏠 stessa rete</span>' : ''}<small><span class="mono">${esc(t.code)}</span> · ${esc(ago(t.seen))}</small></div><button type="button" class="btn sm pri" data-adtv="${esc(t.id)}" data-adcode="${esc(t.code)}">Collega</button></div>`).join('');
  }
  function html() {
    const g = counts(), c = S.c;
    return `<div class="ad-box" role="dialog" aria-modal="true" aria-labelledby="adT"><div class="ad-hd"><h3 id="adT">➕ Aggiungi un dispositivo a ${esc(c.name || c.code)}<small><span class="mono">${esc(c.code)}</span> · ${g.used} di ${g.max} ${g.max === 1 ? 'dispositivo' : 'dispositivi'}</small></h3><button type="button" class="btn sm" data-adx title="Chiudi">✕</button></div>
      <div id="adGrow">${growHtml()}</div>
      <div class="ad-sec"><b>📺 TV in attesa adesso<small>${isAg() ? 'solo quelle della stessa rete del cliente' : 'quelle della stessa rete del cliente sono in cima'}</small></b><div id="adTvs">${tvsHtml()}</div></div>
      <div class="ad-sec"><b>⌨️ Codice della TV<small>quello che la TV nuova mostra, es. KXAB-12CD</small></b><div class="ad-row"><input class="inp mono" id="adCode" placeholder="KXAB-12CD" autocomplete="off" spellcheck="false" maxlength="12"><button type="button" class="btn" data-adgo>Collega</button></div></div>
      <div class="ad-sec"><b>🔢 La TV è a casa del cliente<small>sulla TV nuova sceglie «Ho già un abbonamento» e scrive il codice</small></b><div id="adPin">${S.pin ? `<div class="ad-pin mono">${esc(S.pin.pin)}</div><p class="mut" style="text-align:center;margin:0">Valido fino alle ${esc(new Date(S.pin.until).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }))}</p>` : '<button type="button" class="btn" data-adpin style="width:100%">Genera codice a 6 cifre</button>'}</div></div>
      <div class="ad-sec"><b>Nome della TV<small>facoltativo, es. «Camera»</small></b><input class="inp" id="adName" maxlength="60" placeholder="${esc((c.name || c.code) + ' · TV ' + (g.used + 1))}"></div></div>`;
  }
  function paint(full) {
    const ov = document.getElementById('adOv'); if (!ov || !S) return;
    if (full) { const nm = ov.querySelector('#adName'), cd = ov.querySelector('#adCode'), keep = [nm && nm.value, cd && cd.value]; ov.innerHTML = html(); if (keep[0]) ov.querySelector('#adName').value = keep[0]; if (keep[1]) ov.querySelector('#adCode').value = keep[1]; return; }
    const t = ov.querySelector('#adTvs'); if (t) { const h = tvsHtml(); if (t._h !== h) { t._h = h; t.innerHTML = h; } }
    const gr = ov.querySelector('#adGrow'); if (gr) gr.innerHTML = growHtml();
  }
  async function fetchTvs() {
    if (!S) return;
    const my = S;
    try { const r = await api('GET', '/admin/devices/near?for=' + encodeURIComponent(S.c.id)); if (S !== my) return; S.tvs = r.tvs || []; S.err = ''; }
    catch (e) { if (S !== my) return; S.tvs = S.tvs || []; S.err = e.message; }
    paint(false);
  }
  function close() { if (!S) return; clearInterval(S.timer); S = null; const ov = document.getElementById('adOv'); if (ov) ov.remove(); document.removeEventListener('keydown', onKey, true); }
  const onKey = (e) => { if (e.key === 'Escape' && S) { e.preventDefault(); e.stopPropagation(); close(); } };
  function open(c) {
    if (!c || c.parent || c.status === 'pending' || !can()) return;
    close();
    S = { c, tvs: null, err: '', grow: true, pin: null, busy: false };
    const ov = document.createElement('div'); ov.id = 'adOv'; document.body.appendChild(ov);
    paint(true);
    ov.addEventListener('click', onClick);
    ov.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'adCode') { e.preventDefault(); byCode(); } });
    document.addEventListener('keydown', onKey, true);
    fetchTvs(); S.timer = setInterval(fetchTvs, 5000);
    setTimeout(() => { const b = document.querySelector('#adOv [data-adtv], #adOv #adCode'); if (b) b.focus(); }, 60);
  }
  /** collega la TV [tv] (id; per l'agente anche il codice) al cliente aperto */
  async function link(tv, label) {
    if (!S || S.busy) return;
    if (blocked()) { toast(counts().need > cap() || (isAg() && counts().max > cap()) ? 'Il cliente ha già tutti i dispositivi: vedi l\'avviso in alto' : 'Il cliente ha già tutti i dispositivi: accendi «Aumenta i dispositivi»', 1); return; }
    const g = counts(), c = S.c, name = ((document.getElementById('adName') || {}).value || '').trim();
    S.busy = true;
    try {
      const r = await api('POST', '/admin/devices/' + encodeURIComponent(tv) + '/link', { primary: c.id, name, ...(g.full ? { grow: true } : {}) });
      toast(`📺 ${label || 'TV'} collegata a ${c.name || c.code}: ${g.need} di ${Math.max(g.max, (r && r.grown) || g.need)} dispositivi`);
      close(); await reload();
    } catch (e) { toast(e.message, 1); if (S) S.busy = false; }
  }
  async function byCode() {
    const code = codeNorm((document.getElementById('adCode') || {}).value);
    if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) { toast('Scrivi il codice della TV, es. KXAB-12CD', 1); return; }
    if (isAg()) return link(code, code); // l'agente collega col codice: lo controlla il server
    let d = devs().find((x) => x.code === code);
    if (!d) { await reload(); d = devs().find((x) => x.code === code); }
    if (!d) { toast('Nessuna TV con questo codice: deve avere l\'app aperta sul codice', 1); return; }
    if (d.parent || d.status !== 'pending') { toast(d.parent ? 'Questa TV è già collegata a un cliente' : 'Questo codice è già un cliente con il suo abbonamento', 1); return; }
    return link(d.id, code);
  }
  async function pin() {
    if (!S || S.busy) return;
    const g = counts(), c = S.c;
    if (g.full) {
      if (blocked()) { toast('Il cliente ha già tutti i dispositivi: vedi l\'avviso in alto', 1); return; }
      if (!(await ask(`Aumentare a ${g.need} i dispositivi di ${c.name || c.code}?`, `Ha già ${g.used} di ${g.max} dispositivi: per il codice ne serve uno libero.`, `Aumenta a ${g.need}`))) return;
      try { await api('PUT', '/admin/devices/' + c.id, { maxConn: g.need }); c.maxConn = g.need; } catch (e) { toast(e.message, 1); return; }
    }
    S.busy = true;
    try { S.pin = await api('POST', '/admin/devices/' + c.id + '/linkcode'); paint(true); toast('Codice pronto: dettalo al cliente'); }
    catch (e) { toast(e.message, 1); }
    if (S) S.busy = false;
  }
  function onClick(e) {
    if (e.target.id === 'adOv') return close();
    if (e.target.closest('[data-adx]')) return close();
    const t = e.target.closest('[data-adtv]'); if (t) return link(isAg() ? t.dataset.adcode : t.dataset.adtv, t.dataset.adcode);
    if (e.target.closest('[data-adgo]')) return byCode();
    if (e.target.closest('[data-adpin]')) return pin();
    const gr = e.target.closest('[data-adgrow]'); if (gr) { S.grow = !S.grow; gr.classList.toggle('on', S.grow); }
  }

  /* ---------- «stessa rete» nell'elenco «Da attivare» (solo titolare) ---------- */
  const N = { t: 0, m: new Map(), busy: null };
  function nearLoad(force) {
    if (isAg() || window.__assist) return Promise.resolve(N.m);
    if (N.busy) return N.busy;
    if (!force && Date.now() - N.t < 20e3) return Promise.resolve(N.m);
    const had = N.m.size;
    N.busy = api('GET', '/admin/devices/near').then((r) => {
      const m = new Map(((r && r.pend) || []).map((x) => [x.id, x.near || []]));
      const changed = JSON.stringify([...m]) !== JSON.stringify([...N.m]);
      N.m = m; N.t = Date.now();
      if (changed && (m.size || had) && typeof renderDevices === 'function' && document.querySelector('#v-devices.on')) renderDevices();
      return m;
    }).catch(() => N.m).finally(() => { N.busy = null; });
    return N.busy;
  }
  /** riga «🏠 Casa di …» sotto una TV in attesa ([d] = la TV), con «Collega» per ogni cliente della stessa rete */
  function nearHtml(d) {
    if (isAg() || !d || d.parent || d.status !== 'pending') return '';
    nearLoad(false);
    const L = N.m.get(d.id) || []; if (!L.length) return '';
    return `<div class="ad-near">${L.map((c) => `<span>🏠 Casa di <b>${esc(c.name || c.code)}</b>?</span><button type="button" class="btn sm" data-act="nearlink" data-near="${esc(c.id)}">Collega a ${esc(c.name || c.code)}</button>`).join('')}</div>`;
  }
  /** «Collega a …» dalla TV in attesa: collega con un clic; se il cliente è pieno chiede prima di aumentare */
  async function nearLink(tv, cid) {
    const c = devs().find((x) => x.id === cid); if (!c || !tv) return;
    const used = 1 + kids(c.id), max = +c.maxConn || 1, full = used + 1 > max;
    if (full && !(await ask(`Collegare ${tv.model || 'la TV'} a ${c.name || c.code}?`, `<span class="mono">${esc(tv.code)}</span> · ${esc(c.name || c.code)} ha già ${used} di ${max} ${max === 1 ? 'dispositivo' : 'dispositivi'}: li porto a ${used + 1}.`, `Aumenta a ${used + 1} e collega`))) return;
    try {
      const r = await api('POST', '/admin/devices/' + tv.id + '/link', { primary: c.id, name: '', ...(full ? { grow: true } : {}) });
      toast(`📺 ${tv.model || tv.code} collegata a ${c.name || c.code}: ${used + 1} di ${Math.max(max, (r && r.grown) || used + 1)} dispositivi`);
      N.t = 0; await reload();
    } catch (e) { toast(e.message, 1); }
  }

  window.KXAddDev = { open, close, can, nearHtml, nearLink, nearLoad };
})();
