/* KAIROS Control — pagina «KAIROS HEAVY» (14 novembre 2026, solo titolare).
   Tutte le funzioni della app 3D personale accese e spente da qui, ognuna con la spiegazione di cosa fa.
   Le voci sono quelle del catalogo del controllo remoto con app «heavy» (worker.js, RC_CAT, gruppi «KAIROS HEAVY · …»):
   si salvano nel profilo «heavy» (PUT /admin/rctl/app/heavy) e arrivano all'app al battito successivo.
   Per tutto il resto (linee, DNS cifrato, scudo, aggiornamenti…) la HEAVY segue il profilo di KAIROS Ultimate.
   Usa le funzioni di app.js ($, $$, esc, api, toast, D, view, TITLES, ago). */
(() => {
  if (typeof $ !== 'function') return;
  const css = document.createElement('style');
  css.textContent = `
.hv-top{display:flex;gap:18px;align-items:center;padding:20px 22px;margin-bottom:16px;background:radial-gradient(120% 140% at 0% 0%,rgba(0,229,255,.16),transparent 55%),radial-gradient(120% 140% at 100% 100%,rgba(255,64,129,.16),transparent 55%),rgba(10,11,26,.9)}
.hv-top img{width:86px;height:86px;border-radius:22px;flex:none;box-shadow:0 10px 30px rgba(0,229,255,.25)}
.hv-top h2{margin:0;font-size:24px;letter-spacing:.08em}.hv-top p{margin:5px 0 0;color:var(--mut);font-size:13px;line-height:1.5}
.hv-top .hv-st{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.hv-top .hv-st span{font-size:12px;font-weight:700;padding:4px 10px;border-radius:999px;background:rgba(255,255,255,.07);border:1px solid var(--line)}
.hv-g{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:12px}
.hv-sec{grid-column:1/-1;margin:14px 0 0;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--mut)}.hv-sec:first-child{margin-top:0}
.hv-c{display:flex;flex-direction:column;gap:8px;padding:14px 16px;border-radius:14px;border:1px solid var(--line);background:rgba(255,255,255,.03)}
.hv-c.set{border-color:color-mix(in srgb,var(--a1) 55%,transparent);background:color-mix(in srgb,var(--a1) 7%,transparent)}
.hv-c .hv-h{display:flex;align-items:center;gap:10px}.hv-c .hv-h b{flex:1;font-size:14.5px}
.hv-c small{color:var(--mut);font-size:12.5px;line-height:1.5}
.hv-c select{margin:0;padding:8px 10px;font-size:13px;width:100%}
.hv-sw{all:unset;cursor:pointer;flex:none;width:46px;height:26px;border-radius:13px;background:rgba(255,255,255,.14);position:relative;transition:background .15s}
.hv-sw::after{content:'';position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;transition:left .15s}
.hv-sw.on{background:var(--a1)}.hv-sw.on::after{left:23px}
.hv-c .hv-def{font-size:11.5px;color:var(--mut)}
.hv-bar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:16px}
.hv-dl{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:10px;font-size:13px}.hv-dl code{font:600 12.5px ui-monospace,monospace;background:rgba(0,0,0,.35);padding:4px 8px;border-radius:7px}
@media (max-width:700px){.hv-top{flex-direction:column;align-items:flex-start}.hv-g{grid-template-columns:1fr}}`;
  document.head.appendChild(css);

  const owner = () => D.role !== 'agent' && !window.__assist;
  const H = { data: null, busy: false, draft: null, t: 0 };
  TITLES.heavy = 'KAIROS HEAVY';
  const side = $('#side'), dash = $('#v-dash');
  if (side && dash && !$('.nav[data-v="heavy"]')) {
    const b = document.createElement('button'); b.className = 'nav'; b.dataset.v = 'heavy'; b.style.display = 'none';
    b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V6l4-2v16"/><path d="M16 20V4l4 2v14"/><path d="M8 12h8"/></svg>KAIROS HEAVY';
    b.onclick = () => view('heavy'); side.appendChild(b);
    const sec = document.createElement('section'); sec.className = 'view'; sec.id = 'v-heavy'; dash.after(sec);
  }

  async function load(force) {
    if (H.busy || (!force && H.data && Date.now() - H.t < 20e3)) return;
    H.busy = true;
    try { H.data = await api('GET', '/admin/rctl'); H.t = Date.now(); H.draft = null; } catch (e) { H.data = { err: e.message }; } finally { H.busy = false; }
    draw();
  }
  const cat = () => ((H.data || {}).cat || []).filter((c) => c[4].includes('heavy') && String(c[0]).startsWith('h.'));
  const isSwitch = (c) => c[3].length === 2 && ['on', 'off'].includes(String(c[3][0][0])) && ['on', 'off'].includes(String(c[3][1][0]));
  const prof = () => H.draft || { ...(((H.data || {}).apps || {}).heavy || {}) };

  function card(c, rc) {
    const k = c[0], cur = rc[k], set = cur !== undefined && cur !== '';
    const ctl = isSwitch(c)
      ? `<button type="button" class="hv-sw ${String(set ? cur : 'on') === 'on' ? 'on' : ''}" data-hvsw="${esc(k)}" title="Accendi / spegni"></button>`
      : '';
    const sel = isSwitch(c) ? '' : `<select class="inp" data-hvsel="${esc(k)}"><option value="">${esc(c[6] || 'Predefinito')} (predefinito)</option>${c[3].map(([v, l]) => `<option value="${esc(String(v))}" ${set && String(cur) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    const now = isSwitch(c) ? `<span class="hv-def">${set ? (String(cur) === 'on' ? 'Accesa' : 'Spenta') : 'Accesa (predefinito)'}</span>` : '';
    return `<div class="hv-c ${set ? 'set' : ''}"><div class="hv-h"><b>${esc(c[1])}</b>${ctl}</div><small>${esc(c[5] || '')}</small>${sel}${now}</div>`;
  }

  function draw() {
    const V = $('#v-heavy'); if (!V || !V.classList.contains('on')) return;
    if (!owner()) { V.innerHTML = '<div class="emptyc">Riservato al titolare</div>'; return; }
    if (!H.data) { V.innerHTML = '<div class="card glass"><p class="mut">Carico…</p></div>'; return; }
    if (H.data.err) { V.innerHTML = `<div class="card glass"><p class="mut">${esc(H.data.err)}</p></div>`; return; }
    const rc = prof(), list = cat();
    const devs = Object.values(H.data.devs || {}).filter((p) => /^heavy\b/i.test(String(p.ver || '')));
    const onNow = devs.filter((p) => Date.now() - (+p.t || 0) < 5 * 60e3).length;
    const groups = []; for (const c of list) { const g = String(c[7] || 'Altro').replace(/^KAIROS HEAVY · /, ''); let x = groups.find((y) => y[0] === g); if (!x) groups.push(x = [g, []]); x[1].push(c); }
    const dirty = !!H.draft;
    V.innerHTML = `<div class="card glass hv-top"><img src="heavy-icon.png" alt=""><div><h2>KAIROS HEAVY</h2>
      <p>La tua app 3D personale. Ogni funzione si accende e si spegne da qui, con la spiegazione di cosa fa. Per linee, DNS cifrato, scudo VPN e aggiornamenti la HEAVY segue il profilo di <b>KAIROS Ultimate</b> (pagina Controllo remoto).</p>
      <div class="hv-st"><span>${devs.length} ${devs.length === 1 ? 'dispositivo' : 'dispositivi'} negli ultimi 30 giorni</span><span>${onNow} aperte adesso</span><span>${Object.keys(rc).length} funzioni decise da te</span></div>
      <div class="hv-dl">Scarica: <code>store-k.download/get/heavy.apk</code></div></div></div>
      <div class="card glass"><div class="hv-g">${groups.map(([g, cs]) => `<div class="hv-sec">${esc(g)}</div>${cs.map((c) => card(c, rc)).join('')}`).join('')}</div>
      <div class="hv-bar"><button class="btn pri" id="hvSave" ${dirty ? '' : 'disabled'}>Salva</button><button class="btn" id="hvReset">Torna ai predefiniti</button><span class="rc-note mut">${dirty ? 'Modifiche non salvate' : 'Arriva all\'app al prossimo battito (entro un minuto se è aperta). Effetti e apertura valgono dall\'avvio successivo.'}</span></div></div>`;
    $$('[data-hvsw]', V).forEach((b) => (b.onclick = () => { const r = prof(), k = b.dataset.hvsw, cur = r[k] === undefined ? 'on' : String(r[k]); r[k] = cur === 'on' ? 'off' : 'on'; if (r[k] === 'on') delete r[k]; H.draft = r; draw(); }));
    $$('[data-hvsel]', V).forEach((s) => (s.onchange = () => { const r = prof(), k = s.dataset.hvsel; if (s.value === '') delete r[k]; else { const o = list.find((c) => c[0] === k)[3].find((x) => String(x[0]) === s.value); r[k] = o ? o[0] : s.value; } H.draft = r; draw(); }));
    $('#hvSave').onclick = () => save(prof());
    $('#hvReset').onclick = () => { H.draft = {}; draw(); };
  }

  async function save(rc) {
    try { const r = await api('PUT', '/admin/rctl/app/heavy', { rc }); H.data.apps = { ...(H.data.apps || {}), heavy: r.rc || {} }; H.draft = null; toast('KAIROS HEAVY: salvato, arriva all\'app al prossimo battito'); draw(); } catch (e) { toast(e.message, 1); }
  }

  const ra = renderAll;
  window.renderAll = renderAll = function () { ra(); const n = $('.nav[data-v="heavy"]'); if (n) { const d = owner() ? '' : 'none'; if (n.style.display !== d) n.style.display = d; } if ($('#v-heavy') && $('#v-heavy').classList.contains('on')) draw(); };
  const v0 = view;
  window.view = view = function (v) { const r = v0.apply(this, arguments); if (v === 'heavy') { draw(); load(false); } return r; };
})();
