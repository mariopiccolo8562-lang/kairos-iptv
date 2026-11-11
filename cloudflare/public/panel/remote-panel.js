  /* KAIROS Control — «Controllo remoto»: comandi le tue app (Pro, TV, Lite, XC, Plus) senza toccare la TV del cliente.
   - Profilo per app: impostazioni governate per tutti i clienti di quell'app (modalità leggera, anteprima, lettore, tema…).
     Nell'app la voce risulta «scelta dal fornitore» e il cliente non la cambia.
   - Singolo cliente: vedi le impostazioni attuali della sua app, ne imponi di diverse, mandi comandi
     (riavvia, svuota cache, aggiorna liste, apri impostazioni, speed test, chiudi).
   - Tutto arriva al battito successivo: entro un minuto se l'app è aperta, altrimenti alla prossima apertura.
   Solo titolare. Usa le funzioni di app.js ($, $$, esc, api, toast, ask, D, load, ago…). */
(() => {
  const css = document.createElement('style');
  css.textContent = `
.rc-apps{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}
.rc-apps button{all:unset;cursor:pointer;display:flex;align-items:center;gap:8px;padding:9px 15px;border-radius:11px;font-size:13.5px;font-weight:700;color:#eef1f8;background:rgba(255,255,255,.04);border:1px solid var(--line)}
.rc-apps button.on{background:var(--a1);border-color:transparent;color:#fff}.rc-apps button .n{font-size:11px;font-weight:800;padding:1px 7px;border-radius:9px;background:rgba(255,255,255,.14)}
.rc-g{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);gap:16px;align-items:start}
.rc-rows{display:grid;gap:6px}
.rc-sec{margin:10px 0 2px;font-size:11.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--mut)}.rc-sec:first-child{margin-top:0}.rc-sec b{color:#eef1f8;margin-left:6px;font-weight:600;text-transform:none;letter-spacing:0}
.rc-r{display:grid;grid-template-columns:minmax(0,1fr) 220px;gap:10px;align-items:center;padding:9px 12px;border-radius:10px;border:1px solid var(--line);background:rgba(255,255,255,.025)}
.rc-r b{font-size:13.5px;display:block}.rc-r small{display:block;color:var(--mut);font-size:11.5px;margin-top:2px;line-height:1.35}
.rc-r select{margin:0;padding:8px 10px;font-size:13px;width:100%}.rc-r.set{border-color:color-mix(in srgb,var(--a1) 55%,transparent);background:color-mix(in srgb,var(--a1) 8%,transparent)}
.rc-reader{grid-template-columns:minmax(0,1fr) minmax(0,1.5fr)}.rc-reader .rc-controls{display:grid;gap:7px}.rc-reader .rc-mode{display:grid;grid-template-columns:90px minmax(0,1fr);gap:8px;align-items:center}.rc-reader .rc-mode>span{font-size:12px;color:var(--mut)}
.rc-reader .rc-allow{display:flex;gap:6px;flex-wrap:wrap}.rc-reader .rc-chip{display:inline-flex;align-items:center;gap:5px;padding:5px 8px;border:1px solid var(--line);border-radius:8px;font-size:12px;cursor:pointer}.rc-reader .rc-chip input{margin:0;accent-color:var(--a1)}.rc-reader [hidden]{display:none!important}
.rc-r .cur{font-size:11.5px;color:var(--mut);margin-top:3px}.rc-r .cur b{display:inline;font-size:11.5px;color:#eef1f8}
.rc-cmds{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:8px}
.rc-cmd{all:unset;cursor:pointer;display:flex;flex-direction:column;gap:3px;padding:11px 13px;border-radius:11px;border:1px solid var(--line);background:rgba(255,255,255,.03);transition:background .15s}
.rc-cmd:hover{background:rgba(255,255,255,.07)}.rc-cmd b{font-size:13.5px}.rc-cmd small{color:var(--mut);font-size:11.5px;line-height:1.35}.rc-cmd.danger b{color:var(--bad)}
.rc-cmd:disabled{opacity:.4;cursor:not-allowed}
.rc-tbl{width:100%;border-collapse:collapse;font-size:13.5px}.rc-tbl th{text-align:left;font-size:12px;color:var(--mut);font-weight:600;padding:10px 12px;border-bottom:1px solid var(--line);white-space:nowrap}
.rc-tbl td{padding:10px 12px;border-bottom:1px solid var(--line);vertical-align:middle}.rc-tbl tbody tr:hover{background:var(--hov)}
.rc-tbl small{display:block;color:var(--mut);font-size:12px}
.rc-st{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:600}.rc-st i{width:8px;height:8px;border-radius:50%;background:var(--mut)}.rc-st.ok i{background:var(--ok)}.rc-st.wait i{background:var(--warn)}
.rc-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px}.rc-bar .inp{flex:1;min-width:200px;margin:0}
.rc-note{font-size:12.5px;color:var(--mut);line-height:1.5}
/* finestra del singolo cliente: sopra la scheda cliente (#drawer, 21) e sotto le conferme (#modal, 40) */
#rcM{position:fixed;inset:0;z-index:38;display:none;align-items:flex-start;justify-content:center;background:rgba(3,4,10,.62);backdrop-filter:blur(8px);padding:24px 16px;overflow:auto}
#rcM.on{display:flex}
#rcM .glass{max-width:980px!important;width:min(980px,96vw)!important;margin:auto 0;background:rgba(14,15,34,.94)}
#rcM .hd{display:flex;flex-wrap:nowrap;align-items:flex-start;justify-content:space-between;gap:12px}#rcM .hd h3{flex:1 1 auto;min-width:0}
.rc-hist{font-size:12.5px;color:var(--mut);display:grid;gap:4px;max-height:160px;overflow:auto}.rc-hist b{color:#eef1f8;font-weight:600}
.rc-dr{margin-top:12px;padding:12px 14px;border-radius:12px;border:1px solid var(--line);background:rgba(255,255,255,.025);display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.rc-dr .sp{flex:1}
/* voci di testo (Home): la casella va a tutta larghezza sotto il titolo */
.rc-r.txt{grid-template-columns:1fr}.rc-tx{display:grid;gap:6px}.rc-tx textarea{margin:0;padding:8px 10px;font-size:13px;width:100%;resize:vertical;min-height:42px;font-family:inherit;line-height:1.4}
.rc-tx .btn{justify-self:start}
.rc-home .rc-hg{display:grid;grid-template-columns:1fr 1fr;gap:12px}.rc-home label{display:block;font-size:13px;font-weight:700;margin-bottom:4px}.rc-home label small{display:block;font-weight:400;color:var(--mut);font-size:11.5px;margin-top:2px;line-height:1.35}
.rc-home .rc-hf{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:12px}
.rc-home label.rc-adult{display:flex;gap:12px;align-items:flex-start;padding:12px 14px;margin:0 0 14px;border:1px solid rgba(96,165,250,.45);border-radius:12px;background:rgba(59,130,246,.08);cursor:pointer;font-weight:400}.rc-home label.rc-adult input{width:22px;height:22px;margin:1px 0 0;flex:none;accent-color:#3b82f6;cursor:pointer}.rc-home label.rc-adult b{display:block;font-size:15px;font-weight:700}.rc-home label.rc-adult small{display:block;margin-top:3px;font-size:12px;line-height:1.45;opacity:.8}
.rc-qb{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
.rc-qb button{all:unset;box-sizing:border-box;cursor:pointer;display:flex;flex-direction:column;gap:4px;padding:11px 13px;border-radius:11px;border:1px solid var(--line);background:rgba(255,255,255,.03);transition:background .15s}
.rc-qb button:hover{background:rgba(255,255,255,.07)}.rc-qb button b{font-size:13.5px}.rc-qb button small{color:var(--mut);font-size:11.5px;line-height:1.35}.rc-qb button code{font:600 12px/1.3 ui-monospace,monospace;color:#eef1f8;background:rgba(0,0,0,.35);border-radius:6px;padding:3px 7px;align-self:flex-start}
.rc-qb button.on{background:var(--a1);border-color:transparent}.rc-qb button.on small{color:rgba(255,255,255,.85)}.rc-qb button:disabled{opacity:.5;cursor:wait}
@media (max-width:700px){.rc-qb{grid-template-columns:1fr 1fr}}
@media (max-width:1000px){.rc-g{grid-template-columns:1fr}.rc-r{grid-template-columns:1fr}.rc-reader .rc-mode{grid-template-columns:1fr}.rc-home .rc-hg{grid-template-columns:1fr}}`;
  document.head.appendChild(css);

  const owner = () => D.role !== 'agent' && !window.__assist;
  const APPS = [['tv', 'Kairos Pro'], ['ktv', 'Kairos TV'], ['prem', 'Kairos Premium'], ['lite', 'Kairos Lite'], ['xc', 'Kairos XC'], ['ult', 'KAIROS Ultimate'], ['plus', 'Kairos Plus'], ['nova', 'Kairos Nova']];
  /** app che non si collegano al pannello con un codice (nessuna, oggi): niente clienti né comandi, solo la politica degli aggiornamenti */
  const unlinked = (app) => R.data && Array.isArray(R.data.linked) && !R.data.linked.includes(app);
  const R = { data: null, app: 'tv', q: '', busy: false, draft: {}, t: 0 };
  TITLES.rctl = 'Controllo remoto';
  const side = $('#side'), dash = $('#v-dash');
  if (side && !$('.nav[data-v="rctl"]')) {
    const b = document.createElement('button'); b.className = 'nav'; b.dataset.v = 'rctl'; b.style.display = 'none';
    b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8"/><path d="M8 10h.01M12 10h.01M16 10h.01M8 13h8"/></svg>Controllo remoto';
    b.onclick = () => view('rctl'); side.appendChild(b);
    const sec = document.createElement('section'); sec.className = 'view'; sec.id = 'v-rctl'; dash.after(sec);
  }

  /* ---------- dati ---------- */
  async function loadR(force) {
    if (R.busy || (!force && R.data && Date.now() - R.t < 20e3)) return;
    R.busy = true;
    try { R.data = await api('GET', '/admin/rctl'); R.t = Date.now(); } catch (e) { R.data = { err: e.message }; } finally { R.busy = false; }
    draw();
  }
  const appOf = (d) => { const v = String(((R.data || {}).devs || {})[d.id] && R.data.devs[d.id].ver || '').trim(); if (/vega/i.test(v)) return 'vega'; if (/^lite\b/i.test(v)) return 'lite'; if (/^ult\b/i.test(v)) return 'ult'; if (/^xc\b/i.test(v)) return 'xc'; if (/^plus\b/i.test(v)) return 'plus'; if (/^nova\b/i.test(v)) return 'nova'; if (/premium/i.test(v)) return 'prem'; if (/^tv\b/i.test(v)) return 'ktv'; if (/^\d+\.\d+/.test(v)) return 'tv'; return d.app || 'tv'; };
  const catFor = (app) => ((R.data || {}).cat || []).filter((c) => c[4].includes(app));
  const cmdsFor = (app) => ((R.data || {}).cmds || []).filter((c) => !app || c[3].includes(app));
  const lblOf = (c, v) => { if (v === undefined || v === null || v === '') return ''; const o = c[3].find((x) => x[0] === v || String(x[0]) === String(v)); return o ? o[1] : String(v); };
  const rcvOf = (rc) => { const keys = Object.keys(rc || {}).sort(), flat = keys.map((k) => k + '=' + JSON.stringify(rc[k])).join('&'); let h = 0; for (let i = 0; i < flat.length; i++) h = (h * 31 + flat.charCodeAt(i)) >>> 0; return keys.length ? h.toString(36) : ''; };
  /** come rcSent/adultMerge del server (worker.js): con gli adulti nascosti le app diverse dalla Pro ricevono anche le parole per
      adulti in «home.hide». Serve per l'impronta: se il calcolo è diverso il cliente resta «in attesa» */
  const adultMerge = (h) => { const cur = String(h || '').split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean), seen = new Set(cur.map((x) => x.toLowerCase())); for (const w of (R.data.adultWords || [])) if (!seen.has(w)) { seen.add(w); cur.push(w); } return cur.join(', '); };
  const sentOf = (rc, app) => ((R.data.adultApps || []).includes(app) && rc.adult !== 'on' ? { ...rc, 'home.hide': adultMerge(rc['home.hide']) } : rc);
  const effOf = (d, forApp) => {
    const app = appOf(d), rc = { ...((R.data.apps || {})[app] || {}) }, own = (R.data.over || {})[d.id] || {};
    for (const [k, v] of Object.entries(own)) { const base = k.endsWith(':allow') ? k.slice(0, -6) : k; delete rc[base]; delete rc[`${base}:allow`]; rc[k] = v; }
    return forApp ? sentOf(rc, app) : rc;
  };
  /** stato della configurazione sul dispositivo: applicata / in attesa / app vecchia (non la manda ancora) */
  function cfgState(d) {
    const p = (R.data.devs || {})[d.id]; if (!p) return ['', 'mai aperta di recente'];
    const want = rcvOf(effOf(d, true));
    if (!want) return ['ok', p.cfg ? 'nessuna impostazione imposta' : 'app da aggiornare'];
    if (p.rcv === want) return ['ok', 'applicata'];
    if (!p.cfg && !p.rcv) return ['wait', 'app da aggiornare: non riceve ancora il controllo remoto'];
    return ['wait', 'in attesa del prossimo battito'];
  }
  const ADULT_WORDS = ['adult', 'xxx', '18+', '+18', 'porn', 'erotic', 'hentai', 'playboy', 'brazzers', 'hustler', 'onlyfans', 'red light', 'x-rated', 'vm18', 'sexy', 'milf'];
  const READER_DEFAULTS = { 'o.engLive': 'auto', 'o.engMovie': 'auto', 'o.engSeries': 'auto', 'o.hw': 'auto', 'o.adaptQ': true, 'o.drainQ': true, 'p.quality': 'auto', 'p.buffer': 'balanced' };
  const isReader = (c) => c && c[2] === 'sel' && c[0] !== 'qbox';
  const hasRcKey = (rc, key) => Object.prototype.hasOwnProperty.call(rc || {}, key);
  const policyOf = (c, rc = {}) => {
    const key = c[0], encoded = typeof rc[key] === 'string' && rc[key].startsWith('allow:') ? rc[key].slice(6).split(',') : null;
    const allowed = Array.isArray(rc[`${key}:allow`]) ? rc[`${key}:allow`] : encoded;
    if (encoded) rc = { ...rc, [key]: undefined };
    if (hasRcKey(rc, key) && !encoded) return { mode: 'impose', value: rc[key], allowed: [] };
    if (Array.isArray(allowed)) {
      const values = c[3].filter(([v]) => allowed.some((x) => String(x) === String(v))).map(([v]) => v);
      if (values.length >= c[3].length && values.length) return { mode: 'free', value: null, allowed: values };
      if (values.length === 1) return { mode: 'impose', value: values[0], allowed: [] };
      if (values.length > 1) return { mode: 'allow', value: null, allowed: values };
    }
    return { mode: 'free', value: null, allowed: [] };
  };
  const samePolicy = (a, b) => a.mode === b.mode && (a.mode === 'impose' ? String(a.value) === String(b.value) : a.mode !== 'allow' || JSON.stringify(a.allowed.map(String)) === JSON.stringify(b.allowed.map(String)));
  const policyName = (c, p) => p.mode === 'impose' ? lblOf(c, p.value) : p.mode === 'allow' ? `sceglie tra ${p.allowed.map((v) => lblOf(c, v)).join(', ')}` : 'Decide il cliente';
  const readerHtml = (c, state, name, { set = false, inherited = null, info = '' } = {}) => {
    const key = c[0], all = c[3].map(([v]) => v), selected = state.mode === 'allow' ? state.allowed : all;
    const def = READER_DEFAULTS[key] !== undefined ? READER_DEFAULTS[key] : all[0];
    const value = state.mode === 'impose' ? state.value : def;
    const inherit = inherited ? ` data-inherit="${esc(JSON.stringify(inherited))}"` : '';
    return `<div class="rc-r rc-reader${set ? ' set' : ''}" data-reader="${esc(key)}"${inherit}><div><b>${esc(c[1])}</b>${c[5] ? `<small>${esc(c[5])}</small>` : ''}${info ? `<div class="cur">${info}</div>` : ''}</div>
      <div class="rc-controls"><label class="rc-mode"><span>Chi decide</span><select class="inp" data-${name}-mode="${esc(key)}"><option value="free" ${state.mode === 'free' ? 'selected' : ''}>Decide il cliente</option><option value="allow" ${state.mode === 'allow' ? 'selected' : ''}>Il cliente sceglie tra…</option><option value="impose" ${state.mode === 'impose' ? 'selected' : ''}>Decido io</option></select></label>
        <div class="rc-allow" data-reader-allow hidden>${c[3].map(([v, label]) => `<label class="rc-chip"><input type="checkbox" data-${name}-allow="${esc(key)}" value="${esc(String(v))}" ${selected.some((x) => String(x) === String(v)) ? 'checked' : ''}>${esc(label)}</label>`).join('')}</div>
        <div class="rc-force" data-reader-force hidden><select class="inp" data-${name}="${esc(key)}">${c[3].map(([v, label]) => `<option value="${esc(String(v))}" ${String(value) === String(v) ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select></div>
      </div></div>`;
  };
  const bindReaderControls = (root, name) => {
    $$(`[data-${name}-mode]`, root).forEach((s) => {
      const row = s.closest('.rc-reader');
      const update = () => { row.querySelector('[data-reader-allow]').hidden = s.value !== 'allow'; row.querySelector('[data-reader-force]').hidden = s.value !== 'impose'; };
      s.addEventListener('change', update); update();
    });
  };
  const txtHtml = (c, cur, dflt, name) => `<div class="rc-tx"><textarea class="inp" rows="2" data-${name}="${esc(c[0])}" placeholder="${esc(dflt === 'Decide il cliente' ? 'Nessuna: vale l\'ordine della playlist' : dflt)}">${esc(cur == null ? '' : String(cur))}</textarea>${c[0] === 'home.hide' ? `<button type="button" class="btn sm" data-rcpre="1" title="Aggiunge: ${ADULT_WORDS.join(', ')}">＋ categorie per adulti</button>` : ''}</div>`;
  /** aggiunge le parole delle categorie per adulti alla casella accanto al pulsante (senza doppioni) */
  const addAdult = (btn) => { const ta = btn.parentElement.querySelector('textarea'); if (!ta) return; const have = ta.value.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean); for (const w of ADULT_WORDS) if (!have.some((h) => h.toLowerCase() === w)) have.push(w); ta.value = have.join(', '); ta.dispatchEvent(new Event('input', { bubbles: true })); };
  const selHtml = (c, cur, dflt, name) => c[2] === 'txt' ? txtHtml(c, cur, dflt, name) : `<select class="inp" data-${name}="${esc(c[0])}"><option value="">${esc(dflt)}</option>${c[3].map(([v, l]) => `<option value="${esc(String(v))}" ${cur !== undefined && cur !== null && String(cur) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  const readSel = (root, name) => {
    const o = {}, readerKeys = new Set();
    $$(`[data-${name}-mode]`, root).forEach((mode) => {
      const key = mode.dataset[`${name}Mode`], c = (R.data.cat || []).find((x) => x[0] === key);
      if (!isReader(c)) return;
      readerKeys.add(key);
      const row = mode.closest('.rc-reader');
      let policy;
      if (mode.value === 'impose') {
        const val = row.querySelector(`[data-${name}="${key}"]`).value, option = c[3].find((x) => String(x[0]) === val);
        if (option) policy = { mode: 'impose', value: option[0], allowed: [] };
      } else if (mode.value === 'allow') {
        const allowed = $$(`[data-${name}-allow="${key}"]:checked`, row).map((x) => c[3].find((v) => String(v[0]) === x.value)?.[0]).filter((x) => x !== undefined);
        policy = { mode: 'allow', value: null, allowed };
      } else policy = { mode: 'free', value: null, allowed: [] };
      if (!policy) return;
      if (name === 'rcd') {
        let inherited = { mode: 'free', value: null, allowed: [] };
        try { inherited = JSON.parse(row.dataset.inherit || '{}'); } catch {}
        if (samePolicy(policy, inherited)) return;
        if (policy.mode === 'free') {
          if (inherited.mode === 'free') return;
          o[`${key}:allow`] = c[3].map(([v]) => v);
        } else if (policy.mode === 'allow') o[`${key}:allow`] = policy.allowed;
        else o[key] = policy.value;
      } else if (policy.mode === 'allow') o[`${key}:allow`] = policy.allowed;
      else if (policy.mode === 'impose') o[key] = policy.value;
    });
    $$(`[data-${name}]`, root).forEach((s) => {
      const key = s.dataset[name]; if (readerKeys.has(key)) return;
      const val = s.tagName === 'TEXTAREA' ? s.value.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean).join(', ') : s.value;
      if (val !== '') { const c = (R.data.cat || []).find((x) => x[0] === key); const v = c && c[2] !== 'txt' && c[3].find((x) => String(x[0]) === val); o[key] = v ? v[0] : val; }
    });
    return o;
  };

  /** righe del catalogo raggruppate per sezione (c[7]): le voci corrispondono una a una alle Impostazioni dell'app */
  const grouped = (cat, rowOf) => { const out = []; let last = null; for (const c of cat) { const g = c[7] || 'Generale'; if (g !== last) { out.push(`<div class="rc-sec">${esc(g)}</div>`); last = g; } out.push(rowOf(c)); } return out.join(''); };
  /* ---------- pagina ---------- */
  function draw() {
    const V = $('#v-rctl'); if (!V || !V.classList.contains('on')) return;
    if (!owner()) { V.innerHTML = '<div class="emptyc">Riservato al titolare</div>'; return; }
    if (!R.data) { V.innerHTML = '<div class="card glass"><p class="mut">Carico…</p></div>'; return; }
    if (R.data.err) { V.innerHTML = `<div class="card glass"><p class="mut">${esc(R.data.err)}</p></div>`; return; }
    const devs = (D.devices || []).filter((d) => !d.parent || d.own), byApp = {}; for (const d of devs) { const a = appOf(d); byApp[a] = (byApp[a] || 0) + 1; }
    const app = R.app, name = (APPS.find((x) => x[0] === app) || [])[1] || app, prof = (R.data.apps || {})[app] || {}, cat = catFor(app), cmds = cmdsFor(app);
    const list = devs.filter((d) => appOf(d) === app && (!R.q || [d.name, d.code, d.notes].join(' ').toLowerCase().includes(R.q))).sort((a, b) => (((R.data.devs || {})[b.id] || {}).t || 0) - (((R.data.devs || {})[a.id] || {}).t || 0));
    const nSet = Object.keys(prof).length;
    const allApps = APPS.map((a) => a[0]), same = (k) => { const vals = allApps.map((a) => ((R.data.apps || {})[a] || {})[k] || ''); return vals.every((v) => v === vals[0]) ? vals[0] : null; };
    const hTop = same('home.top'), hHide = same('home.hide'), hCat = (k) => ((R.data.cat || []).find((c) => c[0] === k)), mixed = hTop === null || hHide === null;
    // spunta «Nascondi gli adulti dalla Home»: voce «adult» = «off» in tutte le app
    const aAll = same('adult'), adultBox = hCat('adult') ? `<label class="rc-adult"><input type="checkbox" id="rcAdultAll"${aAll === 'off' ? ' checked' : ''}><span><b>Nascondi gli adulti dalla Home</b><small>In tutte le app (Pro, TV, Premium, Lite, XC, Plus, Nova): nessuna categoria, film, serie o canale per adulti nella Home — righe, titolo in evidenza, novità, tendenze, consigliati, continua a guardare, preferiti, canali. Le app li riconoscono da sole (xxx, adult, +18, 18+, porn, hentai, OnlyFans…) oltre alla lista qui sotto; negli elenchi restano in fondo, raggiungibili. Il cliente non può riattivarli.${aAll === null ? ' ⚠ Ora le app hanno valori diversi: con la spunta diventano uguali.' : aAll === 'off' ? '' : ' Senza spunta: nella Kairos Pro decide il cliente (di base nascosti), nelle altre app restano nascosti; «Visibili» si sceglie nel profilo di ogni app.'}</small></span></label>` : '';
    const homeCard = hCat('home.top') ? `<div class="card glass rc-home" style="margin-bottom:16px"><div class="hd"><h3>Home dei clienti · tutte le app<small>Le categorie da mettere per prime e quelle da non mostrare nella Home: valgono per Kairos Pro, TV, Premium, Lite, XC, Plus e Nova. Basta una parte del nome (es. «sport» prende «SPORT HD» e «Sport Italia»). Puoi poi cambiarle per una sola app (profilo qui sotto) o per un solo cliente (Impostazioni e comandi).</small></h3></div>
      ${adultBox}<div class="rc-hg"><div><label>Categorie in primo piano<small>Nell'ordine che vuoi, separate da virgola: compaiono per prime nella Home e in cima agli elenchi</small></label><div class="rc-tx"><textarea class="inp" rows="3" id="rcHomeTop" placeholder="Es.: Sport, Prime Video, Netflix, Bambini">${esc(hTop || '')}</textarea></div></div>
        <div><label>Categorie nascoste dalla Home<small>Non compaiono nella Home; negli elenchi di Film, Serie e canali restano in fondo (con il PIN se bloccate)</small></label><div class="rc-tx"><textarea class="inp" rows="3" id="rcHomeHide" placeholder="Es.: adult, xxx, 18+">${esc(hHide || '')}</textarea><button type="button" class="btn sm" data-rcpre="1">＋ categorie per adulti</button></div></div></div>
      <div class="rc-hf"><button class="btn pri" id="rcHomeSave">Salva per tutte le app</button><span class="rc-note">${mixed ? '⚠ Ora le app hanno valori diversi: salvando diventano uguali per tutte.' : 'Arriva alle app al prossimo battito (entro un minuto se sono aperte).'}</span></div></div>` : '';
    // riquadro «FHD · 1080p · 50 fps» del lettore: voce «qbox» uguale in tutte le app (vuota = non imposto)
    const qAll = same('qbox'), QB = [['full', 'Completo', 'FHD · 1080p · 50 fps'], ['noq', 'Senza sigla', '1080p · 50 fps'], ['off', 'Nascosto', ''], ['', 'Non imposto', '']];
    const qboxCard = hCat('qbox') ? `<div class="card glass rc-home" style="margin-bottom:16px"><div class="hd"><h3>Riquadro della qualità nel lettore · tutte le app<small>Il riquadro in alto a destra quando il cliente apre un canale in diretta, cambia risoluzione o apre la barra informazioni. Vale per Kairos Pro, TV, Premium, Lite, XC, Plus e Nova (le versioni vecchie lo mostrano completo finché non si aggiornano). Il permesso «Vedere risoluzione e FPS» del singolo cliente vale comunque. Puoi poi cambiarlo per una sola app (profilo qui sotto, sezione Aspetto) o per un solo cliente.</small></h3></div>
      <div class="rc-qb">${QB.map(([v, l, ex]) => `<button type="button" data-rcqb="${v}" class="${qAll === v ? 'on' : ''}"><b>${esc(l)}</b>${ex ? `<code>${esc(ex)}</code>` : `<small>${v === 'off' ? 'Il cliente non vede né sigla né risoluzione' : 'Come oggi: completo; nella Pro decide il cliente'}</small>`}</button>`).join('')}</div>
      <p class="rc-note" style="margin:10px 0 0">${qAll === null ? '⚠ Ora le app hanno valori diversi: scegliendo diventano uguali per tutte.' : 'Arriva alle app al prossimo battito (entro un minuto se sono aperte).'}</p></div>` : '';
    V.innerHTML = homeCard + qboxCard + `<div class="card glass" style="margin-bottom:16px"><div class="hd"><h3>Controllo remoto delle app<small>Decidi cosa resta libero, cosa il cliente può scegliere e cosa vuoi imporre: tutto arriva al battito successivo (entro un minuto se l'app è aperta, altrimenti alla prossima apertura).</small></h3><button class="btn sm" id="rcRe">Aggiorna</button></div>
      <div class="rc-apps">${APPS.map(([k, l]) => `<button type="button" data-rca="${k}" class="${k === app ? 'on' : ''}">${esc(l)}${unlinked(k) ? '' : `<span class="n">${byApp[k] || 0}</span>`}</button>`).join('')}</div>
      <div class="rc-g">
        <div><h4 style="margin:0 0 4px">Profilo di ${esc(name)}</h4><p class="rc-note" style="margin:0 0 10px">${unlinked(app) ? `${esc(name)} non si collega al pannello con un codice: vale per tutte le installazioni, che leggono la politica degli aggiornamenti a ogni controllo (all'apertura e ogni ora).` : `Vale per tutti i clienti con ${esc(name)} (${byApp[app] || 0}). «Decide il cliente» lascia la voce libera nell'app.`} ${nSet ? `<b>${nSet}</b> ${nSet === 1 ? 'regola impostata' : 'regole impostate'}.` : 'Nessuna regola impostata.'}</p>
          <div class="rc-rows" id="rcProf">${grouped(cat, (c) => {
            if (isReader(c)) {
              const has = hasRcKey(prof, c[0]) || hasRcKey(prof, `${c[0]}:allow`);
              return readerHtml(c, policyOf(c, prof), 'rcp', { set: has });
            }
            return `<div class="rc-r ${c[2] === 'txt' ? 'txt ' : ''}${prof[c[0]] !== undefined ? 'set' : ''}"><div><b>${esc(c[1])}</b>${c[5] ? `<small>${esc(c[5])}</small>` : ''}</div>${selHtml(c, prof[c[0]], c[6] || 'Decide il cliente', 'rcp')}</div>`;
          })}</div>
          <div style="display:flex;gap:8px;margin-top:12px;align-items:center"><button class="btn pri" id="rcSave">Salva profilo ${esc(name)}</button><button class="btn" id="rcClear">Libera tutto</button></div></div>
        ${unlinked(app) ? `<div><h4 style="margin:0 0 4px">Comandi</h4><p class="rc-note" style="margin:0">Non disponibili: ${esc(name)} non riceve il battito del pannello. Qui decidi solo come si aggiorna (in background e, se vuoi, obbligatoriamente).</p></div>` : `<div><h4 style="margin:0 0 4px">Comandi a tutti i clienti ${esc(name)}</h4><p class="rc-note" style="margin:0 0 10px">A chi ha aperto l'app negli ultimi 7 giorni. Chi sta guardando riceve «aggiorna liste» e «speed test» dopo la visione.</p>
          <div class="rc-cmds">${cmds.map((c) => `<button type="button" class="rc-cmd ${c[0] === 'exit' || c[0] === 'cache' ? 'danger' : ''}" data-rcall="${c[0]}"><b>${esc(c[1])}</b><small>${esc(c[2])}</small></button>`).join('')}</div></div>`}
      </div></div>
      ${unlinked(app) ? '' : `<div class="card glass"><div class="hd" style="flex-wrap:wrap;gap:10px"><h3>Clienti con ${esc(name)}<small>Per ognuno: impostazioni attuali dell'app, voci imposte solo a lui, comandi</small></h3><input class="inp" id="rcQ" placeholder="Cerca cliente…" value="${esc(R.q)}" style="width:240px;margin:0"></div>
        ${list.length ? `<div class="tbl-wrap"><table class="rc-tbl"><thead><tr><th>Cliente</th><th>Versione</th><th>Visto</th><th>Configurazione</th><th>Solo lui</th><th>Ultimo comando</th><th></th></tr></thead><tbody>${list.slice(0, 400).map((d) => rowHtml(d)).join('')}</tbody></table></div>${list.length > 400 ? `<p class="mut">Mostrati 400 su ${list.length}: usa la ricerca.</p>` : ''}` : `<div class="emptyc">${devs.length ? 'Nessun cliente con questa app' : 'Nessun cliente'}</div>`}</div>`}`;
    bindReaderControls($('#rcProf'), 'rcp');
    $('#rcRe').onclick = () => { loadR(true); load(true).catch(() => {}); };
    $$('[data-rcpre]', V).forEach((b) => (b.onclick = () => addAdult(b)));
    const cbA = $('#rcAdultAll');
    if (cbA) {
      if (aAll === null) cbA.indeterminate = true;
      cbA.onchange = async () => {
        const on = cbA.checked; cbA.disabled = true;
        try {
          const r = await api('PUT', '/admin/rctl/all', { rc: { adult: on ? 'off' : '' } });
          R.data.apps = r.apps || R.data.apps;
          toast(on ? 'Adulti nascosti dalla Home in tutte le app: arriva al prossimo battito' : 'Spunta tolta: nella Kairos Pro decide il cliente, nelle altre app restano nascosti');
          draw();
        } catch (e) { cbA.checked = !on; cbA.disabled = false; toast(e.message, 1); }
      };
    }
    $$('[data-rcqb]', V).forEach((b) => (b.onclick = async () => {
      const v = b.dataset.rcqb; if (b.classList.contains('on')) return;
      $$('[data-rcqb]', V).forEach((x) => (x.disabled = true));
      try {
        const r = await api('PUT', '/admin/rctl/all', { rc: { qbox: v } });
        R.data.apps = r.apps || R.data.apps;
        const msg = { full: 'Riquadro completo in tutte le app', noq: 'Riquadro senza sigla (HD, FHD…) in tutte le app', off: 'Riquadro della qualità nascosto in tutte le app' }[v];
        toast(msg ? `${msg}: arriva al prossimo battito` : 'Riquadro non più imposto: torna come prima');
      } catch (e) { toast(e.message, 1); }
      draw();
    }));
    if ($('#rcHomeSave')) $('#rcHomeSave').onclick = async () => {
      const clean = (v) => v.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean).join(', ');
      const rc = { 'home.top': clean($('#rcHomeTop').value), 'home.hide': clean($('#rcHomeHide').value) };
      try { const r = await api('PUT', '/admin/rctl/all', { rc }); R.data.apps = r.apps || R.data.apps; toast('Home salvata per tutte le app: arriva al prossimo battito'); draw(); } catch (e) { toast(e.message, 1); }
    };
    $$('[data-rca]', V).forEach((b) => (b.onclick = () => { R.app = b.dataset.rca; draw(); }));
    if ($('#rcQ')) $('#rcQ').oninput = (e) => { R.q = e.target.value.toLowerCase().trim(); const p = e.target.selectionStart; draw(); const q = $('#rcQ'); q.focus(); q.setSelectionRange(p, p); };
    $('#rcSave').onclick = () => saveProfile(app, readSel($('#rcProf'), 'rcp'));
    $('#rcClear').onclick = async () => { if (!(await ask(`Liberare tutte le voci di ${name}?`, 'I clienti torneranno a scegliere da soli nell\'app (le voci imposte a un singolo cliente restano).', 'Libera'))) return; saveProfile(app, {}); };
    $$('[data-rcall]', V).forEach((b) => (b.onclick = () => sendCmd(b.dataset.rcall, { app }, `a tutti i clienti ${name} aperti negli ultimi 7 giorni`)));
    $$('[data-rcdev]', V).forEach((b) => (b.onclick = () => { const d = D.devices.find((x) => x.id === b.dataset.rcdev); if (d) openDev(d); }));
  }
  function rowHtml(d) {
    const p = (R.data.devs || {})[d.id] || {}, ov = (R.data.over || {})[d.id] || {}, [st, txt] = cfgState(d), lc = (R.data.last || {})[d.id], pend = (R.data.pending || {})[d.id] || 0;
    const cmdName = (k) => ((R.data.cmds || []).find((c) => c[0] === k) || [k, k])[1];
    return `<tr><td><b>${esc(d.name || 'Senza nome')}</b><small class="mono">${esc(d.code)}</small></td><td>${esc(p.ver || '—')}</td><td>${p.t ? esc(ago(p.t)) : '<span class="mut">—</span>'}${d.live ? ' <span class="rc-st ok"><i></i>online</span>' : ''}</td>
      <td><span class="rc-st ${st}"><i></i>${esc(txt)}</span></td><td>${Object.keys(ov).length ? `<b>${Object.keys(ov).length}</b> ${Object.keys(ov).length === 1 ? 'voce' : 'voci'}` : '<span class="mut">—</span>'}</td>
      <td>${lc ? `${esc(cmdName(lc.cmd))}<small>${lc.done ? (lc.ok ? '✓ eseguito' : '✗ ' + esc(lc.info || 'non riuscito')) + ' · ' + esc(ago(lc.done)) : lc.sent ? 'consegnato, in esecuzione' : 'in attesa del battito'}${pend > 1 ? ` · ${pend} in coda` : ''}</small>` : '<span class="mut">—</span>'}</td>
      <td><button class="btn sm" data-rcdev="${esc(d.id)}">Impostazioni e comandi</button></td></tr>`;
  }
  async function saveProfile(app, rc) {
    try { const r = await api('PUT', '/admin/rctl/app/' + app, { rc }); R.data.apps[app] = r.rc || {}; toast('Profilo salvato: arriva alle app al prossimo battito'); draw(); } catch (e) { toast(e.message, 1); }
  }
  async function sendCmd(cmd, target, who) {
    const C = (R.data.cmds || []).find((c) => c[0] === cmd); if (!C) return;
    if (!(await ask(`${C[1]}?`, `<p class="mut" style="margin:0 0 6px">${esc(C[2])}.</p>Inviato ${esc(who)}. L'app lo esegue al prossimo battito (entro un minuto se è aperta).`, C[1]))) return;
    try { const r = await api('POST', '/admin/rctl/cmd', { cmd, ...target }); toast(r.queued ? `«${C[1]}» inviato a ${r.queued} ${r.queued === 1 ? 'dispositivo' : 'dispositivi'}${r.skipped ? ` (${r.skipped} lo avevano già in coda)` : ''}` : 'Nessun dispositivo da raggiungere (app non aperta negli ultimi 7 giorni)'); loadR(true); } catch (e) { toast(e.message, 1); }
  }

  /* ---------- scheda del singolo cliente ---------- */
  async function openDev(d) {
    if (!R.data) { await loadR(true); if (!R.data || R.data.err) return; }
    const app = appOf(d), name = (APPS.find((x) => x[0] === app) || [])[1] || app, cat = catFor(app).filter((c) => c[8] !== 'prof'), cmds = cmdsFor(app);
    const profOnly = catFor(app).filter((c) => c[8] === 'prof'); // es. Assistente IA: per il singolo cliente si sceglie nella sua scheda
    const p = (R.data.devs || {})[d.id] || {}, ov = (R.data.over || {})[d.id] || {}, prof = (R.data.apps || {})[app] || {}, cfg = p.cfg || null, [st, txt] = cfgState(d);
    let M = $('#rcM'); if (!M) { M = document.createElement('div'); M.id = 'rcM'; M.className = 'modal'; document.body.appendChild(M); }
    const curOf = (c) => { if (!cfg) return ''; const v = cfg[c[0]]; return v === undefined ? '' : lblOf(c, v) || String(v); };
    M.innerHTML = `<div class="glass" style="padding:22px 24px"><div class="hd" style="margin-bottom:12px"><h3>${esc(d.name || 'Senza nome')} <small class="mono">${esc(d.code)} · ${esc(name)}${p.ver ? ' ' + esc(p.ver) : ''}${p.t ? ' · visto ' + esc(ago(p.t)) : ''}</small></h3><button class="icb" id="rcMx" title="Chiudi">✕</button></div>
      <p class="rc-note" style="margin:0 0 12px">Configurazione: <span class="rc-st ${st}"><i></i>${esc(txt)}</span>${cfg ? '' : ' · le impostazioni attuali dell\'app arrivano appena il cliente la apre con la versione aggiornata.'}</p>
      <div class="rc-g">
        <div><h4 style="margin:0 0 4px">Impostazioni dell'app</h4><p class="rc-note" style="margin:0 0 10px">A sinistra il valore che l'app usa adesso; a destra come gestire ciascuna voce solo per questo cliente (vince sul profilo ${esc(name)}).</p>
          <div class="rc-rows" id="rcDev">${grouped(cat, (c) => {
            if (isReader(c)) {
              const inherited = policyOf(c, prof), has = hasRcKey(ov, c[0]) || hasRcKey(ov, `${c[0]}:allow`), state = has ? policyOf(c, ov) : inherited;
              const info = `Nell'app: <b>${esc(curOf(c) || '—')}</b>${inherited.mode !== 'free' ? ` · profilo ${esc(name)}: ${esc(policyName(c, inherited))}` : ''}`;
              return readerHtml(c, state, 'rcd', { set: has, inherited, info });
            }
            const cur = curOf(c), pv = prof[c[0]];
            return `<div class="rc-r ${c[2] === 'txt' ? 'txt ' : ''}${ov[c[0]] !== undefined ? 'set' : ''}"><div><b>${esc(c[1])}</b><div class="cur">Nell'app: <b>${esc(cur || '—')}</b>${pv !== undefined ? ` · profilo ${esc(name)}: ${esc(lblOf(c, pv))}` : ''}</div></div>${selHtml(c, ov[c[0]], pv !== undefined ? 'Come il profilo (' + lblOf(c, pv) + ')' : 'Decide il cliente', 'rcd')}</div>`;
          })}</div>
          ${profOnly.length ? `<p class="rc-note" style="margin:10px 0 0">${profOnly.map((c) => `<b>${esc(c[1])}</b>`).join(', ')}: per questo cliente si sceglie nella sua scheda (sezione Permessi); qui vale il profilo ${esc(name)}${profOnly.map((c) => (R.data.apps || {})[app] && (R.data.apps[app] || {})[c[0]] !== undefined ? ` (${esc(lblOf(c, R.data.apps[app][c[0]]))})` : '').join('')}.</p>` : ''}
          <div style="display:flex;gap:8px;margin-top:12px"><button class="btn pri" id="rcDevSave">Salva per questo cliente</button><button class="btn" id="rcDevClr">Togli le voci solo sue</button></div></div>
        <div><h4 style="margin:0 0 4px">Comandi</h4><p class="rc-note" style="margin:0 0 10px">${d.live ? 'L\'app è aperta adesso: il comando arriva entro un minuto.' : 'App chiusa o non in contatto: il comando parte alla prossima apertura.'}</p>
          <div class="rc-cmds" style="grid-template-columns:1fr 1fr">${cmds.map((c) => `<button type="button" class="rc-cmd ${c[0] === 'exit' || c[0] === 'cache' ? 'danger' : ''}" data-rcone="${c[0]}"><b>${esc(c[1])}</b><small>${esc(c[2])}</small></button>`).join('')}</div>
          <h4 style="margin:14px 0 6px">Ultimi comandi</h4><div class="rc-hist" id="rcHist">Carico…</div></div>
      </div></div>`;
    bindReaderControls($('#rcDev'), 'rcd');
    M.classList.add('on');
    const close = () => M.classList.remove('on');
    $('#rcMx').onclick = close; M.onclick = (e) => { if (e.target === M) close(); };
    $$('[data-rcpre]', M).forEach((b) => (b.onclick = () => addAdult(b)));
    $('#rcDevSave').onclick = async () => { try { const rc = readSel($('#rcDev'), 'rcd'); await api('PUT', '/admin/rctl/device/' + d.id, { rc }); R.data.over[d.id] = rc; toast('Salvato: arriva all\'app al prossimo battito'); close(); draw(); } catch (e) { toast(e.message, 1); } };
    $('#rcDevClr').onclick = async () => { try { await api('PUT', '/admin/rctl/device/' + d.id, { rc: {} }); delete R.data.over[d.id]; toast('Tolte: vale il profilo ' + name); close(); draw(); } catch (e) { toast(e.message, 1); } };
    $$('[data-rcone]', M).forEach((b) => (b.onclick = () => sendCmd(b.dataset.rcone, { ids: [d.id] }, 'a ' + (d.name || d.code)).then(() => hist())));
    const hist = async () => { const H = $('#rcHist'); if (!H) return; try { const r = await api('GET', '/admin/rctl/cmds/' + d.id); const cmdName = (k) => ((R.data.cmds || []).find((c) => c[0] === k) || [k, k])[1]; // in attesa: da quanto l'app non si collega (chiusa, in sfondo o senza rete); consegnati: in esecuzione (lo speed test dura ~30 s)
      const pv = ((R.data || {}).devs || {})[d.id] || {}, seenMin = pv.t ? Math.round((Date.now() - pv.t) / 60000) : -1;
      const waitTxt = (x) => (Date.now() - x.created > 120e3 && seenMin >= 2 ? `in attesa: l'app non si collega da ${seenMin} min (chiusa, in sfondo o senza rete): parte quando si ricollega` : 'in attesa del collegamento dell\'app');
      const expired = (x) => !x.done && Date.now() - x.created > 7 * 864e5; // non consegnato entro 7 giorni: il server non lo manda più
      H.innerHTML = r.items.length ? r.items.map((x) => `<div><b>${esc(cmdName(x.cmd))}</b> · ${new Date(x.created).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })} · ${x.done ? (x.ok ? '✓ eseguito' : '✗ ' + esc(x.info || 'non riuscito')) + (x.info && x.ok ? ' (' + esc(x.info) + ')' : '') : expired(x) ? 'scaduto: l\'app non si è collegata entro 7 giorni (puoi inviarlo di nuovo)' : x.sent ? (x.cmd === 'speed' ? 'consegnato: speed test in corso…' : 'consegnato, in esecuzione') : esc(waitTxt(x))}</div>`).join('') : '<span>Nessun comando inviato</span>';
      // finché c'è qualcosa in attesa o in corso la cronologia si aggiorna da sola (il risultato compare senza riaprire)
      clearTimeout(H._t); if (r.items.some((x) => !x.done && !expired(x)) && document.body.contains(H)) H._t = setTimeout(hist, 8000); } catch (e) { H.textContent = e.message; } };
    hist();
  }
  window.KXRemote = { open: openDev };

  /* ---------- scheda cliente: collegamento al controllo remoto ---------- */
  const rdw = renderDrawer;
  window.renderDrawer = renderDrawer = function () {
    const r = rdw.apply(this, arguments);
    try {
      if (!edit || !edit.id || isNew || !owner()) return r;
      const sec = $('#ds-oth'); if (!sec || $('#rcDrawer')) return r;
      sec.insertAdjacentHTML('beforeend', `<div class="rc-dr" id="rcDrawer"><div><b>Controllo remoto</b><br><small class="mut">Impostazioni dell'app di questo cliente e comandi (riavvia, svuota cache, aggiorna liste…)</small></div><span class="sp"></span><button class="btn sm pri" type="button" id="rcDrawerB">Apri</button></div>`);
      $('#rcDrawerB').onclick = (e) => { e.preventDefault(); const d = D.devices.find((x) => x.id === edit.id); if (d) openDev(d); };
    } catch {}
    return r;
  };

  /* ---------- menu e aggiornamento ---------- */
  const ra = renderAll;
  window.renderAll = renderAll = function () { ra(); const n = $('.nav[data-v="rctl"]'); if (n) { const d = owner() ? '' : 'none'; if (n.style.display !== d) n.style.display = d; } if ($('#v-rctl') && $('#v-rctl').classList.contains('on')) draw(); };
  const v0 = view;
  window.view = view = function (v) { const r = v0.apply(this, arguments); if (v === 'rctl') { draw(); loadR(false); } return r; };

  /* ---------- demo ---------- */
  if (typeof DEMO !== 'undefined') {
    const dm = demoApi;
    const A6 = ['tv', 'ktv', 'lite', 'xc', 'ult', 'plus'], PRO_XC = ['tv', 'xc', 'ult'], YN = [[true, 'Sì'], [false, 'No']], ENG = [['auto', 'Automatico (ExoPlayer, passa a VLC se serve)'], ['exo', 'ExoPlayer'], ['vlc', 'VLC']];
    const CAT = [['lite', 'Modalità leggera', 'sel', [['auto', 'Automatica'], ['on', 'Sempre attiva'], ['max', 'Leggerissima'], ['off', 'Spenta']], A6, 'Niente animazioni ed effetti, immagini e memoria ridotte', '', 'Generale'], ['o.startScr', 'Schermata iniziale', 'sel', [['home', 'Home'], ['movies', 'Film'], ['series', 'Serie'], ['live', 'In Diretta'], ['guide', 'Guida TV']], ['tv'], '', '', 'Generale'], ['tvmode', 'Modalità TV', 'sel', [['on', 'Attiva'], ['off', 'Spenta']], ['nova'], '', '', 'Generale'], ['ai', 'Assistente IA', 'sel', [['gm', 'Gemini'], ['claude', 'Claude'], ['off', 'Spento']], ['tv'], 'Ricerca con le frasi, «Cosa guardo stasera?» e domande sui titoli. Vale per i clienti con «predefinito» nella loro scheda', 'Predefinito (pagina Assistente IA)', 'Generale', 'prof'],
      ['home.top', 'Categorie in primo piano', 'txt', [], [...A6, 'prem', 'nova'], 'Nomi (anche solo una parte) delle categorie da mettere per prime, separati da virgola', '', 'Home'], ['home.hide', 'Categorie nascoste dalla Home', 'txt', [], [...A6, 'prem', 'nova'], 'Nomi (anche solo una parte) delle categorie da non mostrare nella Home', '', 'Home'],
      ['bgupd', 'Aggiornamenti in background', 'sel', [['on', 'Sì: scarica da sola, poi chiede solo «Installa»'], ['off', 'No: scarica solo quando il cliente accetta']], [...A6, 'nova'], 'Con «Sì» l\'app scarica e verifica da sola la versione nuova', '', 'Aggiornamenti'], ['force', 'Aggiornamento obbligatorio', 'sel', [['off', 'No: il cliente può rimandare'], ['7d', 'Dopo 7 giorni dal primo avviso'], ['3d', 'Dopo 3 giorni dal primo avviso'], ['now', 'Subito']], [...A6, 'nova'], 'Scaduto il termine l\'app si apre solo dopo l\'installazione', 'No: il cliente può rimandare', 'Aggiornamenti'],
      ['theme', 'Colore dell\'interfaccia', 'sel', [['cinema', 'Cinema (rosso)'], ['aurora', 'Aurora'], ['oceano', 'Oceano'], ['oro', 'Oro']], ['tv'], '', '', 'Aspetto'], ['o.textSize', 'Dimensione testi', 'sel', [['s', 'Piccola'], ['m', 'Media'], ['l', 'Grande'], ['xl', 'Molto grande']], ['tv'], '', '', 'Aspetto'], ['adult', 'Contenuti per adulti nella Home e nei consigliati', 'sel', [['on', 'Sì'], ['off', 'No']], ['tv'], '', '', 'Aspetto'],
      ['intro', 'Animazione d\'avvio', 'sel', [['auto', 'Automatica'], ['simple', 'Semplice'], ['off', 'Spenta']], ['tv'], 'Automatica: completa sui dispositivi forti, senza gli effetti di sfondo pesanti su quelli deboli. Semplice: logo, scritta e barra, senza effetti di sfondo. Spenta: logo fermo e barra. Vale dall\'apertura successiva', '', 'Aspetto'],
      ['o.engLive', 'Lettore TV in diretta', 'sel', ENG, PRO_XC, '', '', 'Lettore'], ['o.engMovie', 'Lettore film', 'sel', ENG, PRO_XC, '', '', 'Lettore'], ['o.engSeries', 'Lettore serie TV', 'sel', ENG, PRO_XC, '', '', 'Lettore'],
      ['o.hw', 'Decodifica', 'sel', [['auto', 'Automatica'], ['on', 'Hardware'], ['off', 'Software']], PRO_XC, '', '', 'Lettore'], ['o.adaptQ', 'Qualità adattiva automatica', 'sel', YN, PRO_XC, '', '', 'Lettore'], ['o.drainQ', 'Discesa anticipata della qualità', 'sel', YN, PRO_XC, '', '', 'Lettore'],
      ['p.quality', 'Qualità video', 'sel', [['auto', 'Automatica'], ['max', 'Massima'], ['1080', '1080p'], ['720', '720p'], ['480', '480p']], PRO_XC, '', '', 'Lettore'],
      ['p.buffer', 'Buffer di rete', 'sel', [['fast', 'Piccolo (veloce)'], ['balanced', 'Normale'], ['stable', 'Grande (stabile)']], ['tv', 'nova', 'xc', 'ult'], '', '', 'Lettore'],
      ['preview', 'Anteprima nella lista canali', 'sel', [['click', 'Al primo OK'], ['off', 'Spenta']], ['ktv', 'lite', 'xc', 'ult', 'plus'], 'Spenta: il canale parte subito a schermo intero', '', 'TV in diretta e guida TV'], ['o.liveFmt', 'Formato TV in diretta', 'sel', [['ts', 'Veloce (TS)'], ['hls', 'HLS']], ['tv', 'plus'], '', '', 'TV in diretta e guida TV'],
      ['o.sortCh', 'Ordina canali', 'sel', [['pl', 'Come la playlist'], ['num', 'Per numero'], ['az', 'A → Z']], ['tv'], '', '', 'Ordinamento'], ['o.lockAdult', 'Blocca contenuti per adulti', 'sel', YN, ['tv'], '', '', 'Controllo genitori']];
    const CM = [['reload', 'Riavvia l\'app', 'Chiude e riapre l\'interfaccia', ['tv', 'ktv', 'lite', 'xc', 'ult', 'plus', 'nova']], ['cache', 'Svuota cache e riavvia', 'Cancella liste e immagini salvate e riscarica tutto', ['tv', 'ktv', 'lite', 'xc', 'ult', 'plus', 'nova']], ['sync', 'Aggiorna le liste', 'Riscarica canali, film e serie', ['tv', 'ktv', 'lite', 'xc', 'ult', 'plus', 'nova']], ['update', 'Aggiorna l\'app', 'Controlla subito se c\'è una versione nuova: la scarica in background e propone «Installa ora»', ['tv', 'ktv', 'lite', 'xc', 'ult', 'plus', 'nova']], ['settings', 'Apri le impostazioni', 'Porta il cliente nelle Impostazioni', ['tv', 'ktv', 'lite', 'xc', 'ult', 'plus', 'nova']], ['speed', 'Speed test', 'Misura la connessione', ['tv', 'xc', 'ult']], ['exit', 'Chiudi l\'app', 'L\'app si chiude', ['tv', 'ktv', 'lite', 'xc', 'ult', 'plus', 'nova']]];
    const RD = (DEMO.rctl = DEMO.rctl || { apps: { tv: { lite: 'auto' }, ktv: {}, lite: { lite: 'on' }, xc: {}, ult: {}, plus: {}, nova: {} }, over: {}, cmds: [], seq: 1 });
    const rcv = (rc) => { const keys = Object.keys(rc || {}).sort(), flat = keys.map((k) => k + '=' + JSON.stringify(rc[k])).join('&'); let h = 0; for (let i = 0; i < flat.length; i++) h = (h * 31 + flat.charCodeAt(i)) >>> 0; return keys.length ? h.toString(36) : ''; };
    window.demoApi = demoApi = async function (m, p, b) {
      if (!p.startsWith('/admin/rctl')) return dm(m, p, b);
      await new Promise((r) => setTimeout(r, 120));
      if (p === '/admin/rctl' && m === 'GET') {
        const devs = {}, t = Date.now();
        DEMO.devices.filter((d) => !d.parent).forEach((d, i) => { const app = d.app || 'tv', eff = { ...(RD.apps[app] || {}) }; for (const [k, v] of Object.entries(RD.over[d.id] || {})) { const base = k.endsWith(':allow') ? k.slice(0, -6) : k; delete eff[base]; delete eff[`${base}:allow`]; eff[k] = v; } devs[d.id] = { ver: app === 'tv' ? '2.5.3' : app + ' 1.3.0', t: d.lastSeen || t - i * 3600e3, rcv: i % 4 === 1 ? '' : rcv(eff), cfg: i % 5 === 2 ? null : { lite: 'auto', liteOn: i % 2 ? 'on' : 'off', preview: 'click', theme: 'cinema', 'o.startScr': 'home', 'o.hw': 'auto', 'p.quality': 'auto' } }; });
        const last = {}, pending = {}; for (const c of RD.cmds) { if (!c.done) pending[c.device_id] = (pending[c.device_id] || 0) + 1; if (!last[c.device_id]) last[c.device_id] = c; }
        return { apps: RD.apps, cat: CAT, cmds: CM, appNames: {}, linked: ['tv', 'ktv', 'lite', 'xc', 'ult', 'plus', 'nova'], devs, over: RD.over, last, pending };
      }
      const pa = p.match(/^\/admin\/rctl\/app\/(\w+)$/); if (pa && m === 'PUT') { RD.apps[pa[1]] = b.rc || {}; return { ok: true, rc: RD.apps[pa[1]] }; }
      if (p === '/admin/rctl/all' && m === 'PUT') { for (const a of ['tv', 'ktv', 'prem', 'lite', 'xc', 'ult', 'plus', 'nova']) { const cur = { ...(RD.apps[a] || {}) }; for (const [k, v] of Object.entries(b.rc || {})) { const base = k.endsWith(':allow') ? k.slice(0, -6) : k, other = k === base ? `${base}:allow` : base; if (v === '' || v === null || v === undefined) delete cur[k]; else { delete cur[other]; cur[k] = v; } } RD.apps[a] = cur; } return { ok: true, apps: RD.apps }; }
      const pd = p.match(/^\/admin\/rctl\/device\/(.+)$/); if (pd && m === 'PUT') { if (Object.keys(b.rc || {}).length) RD.over[pd[1]] = b.rc; else delete RD.over[pd[1]]; return { ok: true, rc: RD.over[pd[1]] || {} }; }
      if (p === '/admin/rctl/cmd' && m === 'POST') { const ids = b.ids || DEMO.devices.filter((d) => !d.parent && (b.app === 'all' || (d.app || 'tv') === b.app)).map((d) => d.id); const t = Date.now(); for (const id of ids) RD.cmds.unshift({ id: RD.seq++, device_id: id, cmd: b.cmd, created: t, sent: 0, done: 0, ok: 0, info: '' }); setTimeout(() => { for (const c of RD.cmds) if (!c.done && t === c.created) { c.sent = Date.now(); c.done = Date.now(); c.ok = 1; c.info = 'demo'; } }, 2500); return { ok: true, queued: ids.length, skipped: 0 }; }
      const pc = p.match(/^\/admin\/rctl\/cmds\/(.+)$/); if (pc && m === 'GET') return { items: RD.cmds.filter((c) => c.device_id === pc[1]).slice(0, 30) };
      if (pc && m === 'DELETE') { RD.cmds = RD.cmds.filter((c) => !(c.device_id === pc[1] && !c.done)); return { ok: true }; }
      return dm(m, p, b);
    };
  }
})();
