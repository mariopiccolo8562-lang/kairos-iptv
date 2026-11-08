/* KAIROS Control — «Modifica in massa»: cambia a tanti clienti insieme lettore (ExoPlayer, VLC, automatico),
   permessi, VPN e visioni contemporanee, e toglie le impostazioni del Controllo remoto imposte solo a loro.
   Si apre da Dispositivi: pulsante in alto (tutti i clienti) o dalla barra della selezione in vista Tabella.
   Solo titolare. Le app si riallineano da sole al battito successivo (entro un minuto se sono aperte). */
(() => {
  const css = document.createElement('style');
  css.textContent = `
#massM{position:fixed;inset:0;z-index:38;display:none;align-items:flex-start;justify-content:center;background:rgba(3,4,10,.62);backdrop-filter:blur(8px);padding:24px 16px;overflow:auto}
#massM.on{display:flex}
#massM .glass{width:min(760px,96vw);margin:auto 0;padding:22px 24px 16px;background:rgba(14,15,34,.96)}
#massM .mhd{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}
#massM .mhd h3{margin:0;font-size:19px}#massM .mhd small{display:block;color:var(--mut);font-size:12.5px;font-weight:400;margin-top:4px;line-height:1.45}
.ms-sc{display:grid;gap:6px;margin:0 0 6px}
.ms-sc label{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;border:1px solid var(--line);background:rgba(255,255,255,.03);cursor:pointer;font-size:13.5px}
.ms-sc label.on{border-color:color-mix(in srgb,var(--a1) 60%,transparent);background:color-mix(in srgb,var(--a1) 10%,transparent)}
.ms-sc input{accent-color:var(--a1);margin:0}.ms-sc small{color:var(--mut);margin-left:auto;font-size:12px}
.ms-h{margin:16px 0 6px;font-size:11.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--mut);display:flex;align-items:center;gap:8px}
.ms-h .btn{margin-left:auto;text-transform:none;letter-spacing:0}.ms-h .btn+.btn{margin-left:0}
.ms-r{display:grid;grid-template-columns:minmax(0,1fr) 220px;gap:10px;align-items:center;padding:8px 12px;border-radius:10px;border:1px solid var(--line);background:rgba(255,255,255,.025);margin-bottom:6px}
.ms-r b{font-size:13.5px;display:block}.ms-r small{display:block;color:var(--mut);font-size:11.5px;margin-top:2px;line-height:1.35}
.ms-r select,.ms-r input[type=number]{margin:0;padding:8px 10px;font-size:13px;width:100%}
.ms-r.set{border-color:color-mix(in srgb,var(--a1) 55%,transparent);background:color-mix(in srgb,var(--a1) 8%,transparent)}
.ms-ck{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border-radius:10px;border:1px solid var(--line);background:rgba(255,255,255,.025);cursor:pointer;font-size:13.5px}
.ms-ck input{accent-color:var(--a1);margin:3px 0 0}.ms-ck small{display:block;color:var(--mut);font-size:11.5px;margin-top:2px}
.ms-ck.set{border-color:color-mix(in srgb,var(--a1) 55%,transparent);background:color-mix(in srgb,var(--a1) 8%,transparent)}
.ms-ft{display:flex;gap:8px;align-items:center;margin-top:14px;position:sticky;bottom:-16px;padding:12px 0 6px;background:rgba(14,15,34,.98);border-top:1px solid var(--line)}
.ms-ft .sp{flex:1}.ms-sum{font-size:12.5px;color:var(--mut);line-height:1.4}
@media (max-width:700px){.ms-r{grid-template-columns:1fr}}`;
  document.head.appendChild(css);

  const owner = () => typeof D !== 'undefined' && D.role !== 'agent' && !window.__assist;
  const ENG = [['live', 'TV in diretta'], ['movie', 'Film'], ['series', 'Serie TV']];
  const ENG_O = [['', 'Non cambiare'], ['-', 'Lo sceglie il cliente nell\'app'], ['auto', 'Automatico'], ['exo', 'ExoPlayer'], ['vlc', 'VLC']];
  const ENG_N = { '-': 'scelto dal cliente', auto: 'automatico', exo: 'ExoPlayer', vlc: 'VLC' };
  const VPN_O = [['', 'Non cambiare'], ['0', 'Disattivata'], ['1', 'Consentita (la accende il cliente)'], ['2', 'Sempre attiva']];
  const perms = () => (typeof PERM_L !== 'undefined' ? PERM_L : []);
  const prim = () => (D.devices || []).filter((d) => !d.parent);
  const nActive = () => prim().filter((d) => d.status === 'active').length;
  const nAll = () => prim().filter((d) => d.status !== 'pending').length;
  const sel = (name, opts) => `<select class="inp" data-ms="${name}">${opts.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('')}</select>`;
  // voci del Controllo remoto che si possono imporre in massa (stesse etichette del catalogo del server)
  const RCM = [
    ['lite', 'Modalità leggera', 'Tutte le app · «Spenta» non la riaccende nemmeno «Risolvi»', [['auto', 'Automatica'], ['on', 'Sempre attiva'], ['max', 'Leggerissima'], ['off', 'Spenta']]],
    ['posters', 'Locandine', 'Solo Kairos Pro · «Sempre nitide» usa più memoria sulle chiavette da 1 GB', [['auto', 'Automatiche'], ['hi', 'Sempre nitide']]],
    ['intro', 'Animazione d\'avvio', 'Solo Kairos Pro · vale dall\'apertura successiva', [['auto', 'Automatica'], ['simple', 'Semplice'], ['off', 'Spenta']]],
  ];
  let M = null, ids0 = [], after = null;
  // sezione dei Clienti (I miei / degli agenti / un agente): le scelte «solo questa sezione» vengono prima
  let sec = null, secA = [], secAll = [];

  /** cosa è stato scelto (null = niente) */
  function readForm() {
    const v = (k) => { const e = M.querySelector(`[data-ms="${k}"]`); return e ? e.value : ''; };
    const b = {};
    const pl = {}; for (const [k] of ENG) { const x = v('eng.' + k); if (x) pl[k] = x === '-' ? '' : x; }
    if (Object.keys(pl).length) b.player = pl;
    const pm = {}; for (const [k] of perms()) { const x = v('perm.' + k); if (x) pm[k] = x === '1'; }
    if (Object.keys(pm).length) b.perms = pm;
    if (v('vpn') !== '') b.vpn = +v('vpn');
    const ms = M.querySelector('[data-ms="streams"]'); if (ms && ms.value.trim() !== '') b.maxStreams = Math.max(0, parseInt(ms.value, 10) || 0);
    if (M.querySelector('[data-ms="rcClear"]').checked) b.rcClear = true;
    const rs = {}; for (const [k] of RCM) { const x = v('rc.' + k); if (x) rs[k] = x === '-' ? '' : x; }
    if (Object.keys(rs).length) b.rcSet = rs;
    return b;
  }
  function summary(b) {
    const out = [];
    if (b.player) out.push('lettore: ' + Object.entries(b.player).map(([k, x]) => `${(ENG.find((e) => e[0] === k) || [k, k])[1]} → ${ENG_N[x === '' ? '-' : x]}`).join(', '));
    if (b.perms) { const on = Object.keys(b.perms).filter((k) => b.perms[k]), off = Object.keys(b.perms).filter((k) => !b.perms[k]); const nm = (k) => (perms().find((p) => p[0] === k) || [k, k])[1]; if (on.length) out.push('consenti: ' + on.map(nm).join(', ')); if (off.length) out.push('blocca: ' + off.map(nm).join(', ')); }
    if (b.vpn !== undefined) out.push('VPN: ' + VPN_O.find((o) => o[0] === String(b.vpn))[1].toLowerCase());
    if (b.maxStreams !== undefined) out.push('visioni contemporanee: ' + (b.maxStreams || 'illimitate'));
    if (b.rcClear) out.push('tolte le impostazioni imposte solo a loro');
    if (b.rcSet) out.push(Object.entries(b.rcSet).map(([k, x]) => { const r = RCM.find((e) => e[0] === k); return `${r[1]} → ${x === '' ? 'come il profilo' : (r[3].find((o) => o[0] === x) || [x, x])[1]}`; }).join(', '));
    return out;
  }
  const scopeOf = () => (M.querySelector('[name="msSc"]:checked') || {}).value || 'active';
  const countOf = (sc) => (sc === 'ids' ? ids0.length : sc === 'secA' ? secA.length : sc === 'secAll' ? secAll.length : sc === 'active' ? nActive() : nAll());
  const idsOf = (sc) => (sc === 'ids' ? ids0 : sc === 'secA' ? secA : sc === 'secAll' ? secAll : null);
  const scLabel = (sc) => (sc === 'ids' ? 'Clienti selezionati' : sc === 'secA' ? sec.label + ': clienti attivi' : sc === 'secAll' ? sec.label + ': tutti' : sc === 'active' ? 'Tutti i clienti attivi' + (sec ? ' (tuoi e degli agenti)' : '') : 'Tutti i clienti' + (sec ? ' (tuoi e degli agenti)' : ''));
  function refresh() {
    M.querySelectorAll('.ms-sc label').forEach((l) => l.classList.toggle('on', l.querySelector('input').checked));
    M.querySelectorAll('.ms-r').forEach((r) => { const e = r.querySelector('select, input[type=number]'); r.classList.toggle('set', !!e && e.value !== '' && e.value.trim() !== ''); });
    const ck = M.querySelector('[data-ms="rcClear"]'); ck.closest('.ms-ck').classList.toggle('set', ck.checked);
    const b = readForm(), s = summary(b), n = countOf(scopeOf());
    M.querySelector('#msSum').innerHTML = s.length ? `<b>${n}</b> client${n === 1 ? 'e' : 'i'} · ${esc(s.join(' · '))}` : 'Scegli cosa cambiare: le voci lasciate su «Non cambiare» restano come sono.';
    const go = M.querySelector('#msGo'); go.disabled = !s.length || !n; go.textContent = n ? `Applica a ${n} client${n === 1 ? 'e' : 'i'}` : 'Applica';
  }
  function open(ids, done) {
    if (!owner()) return toast('La modifica in massa è riservata al titolare', 1);
    ids0 = (ids || []).filter((i) => { const d = (D.devices || []).find((x) => x.id === i); return d && !d.parent && d.status !== 'pending'; });
    after = done || null;
    sec = window.KXOwn && KXOwn.scope ? KXOwn.scope() : null;
    secA = sec ? sec.devs.filter((d) => d.status === 'active').map((d) => d.id) : [];
    secAll = sec ? sec.devs.filter((d) => d.status !== 'pending').map((d) => d.id) : [];
    M = $('#massM'); if (!M) { M = document.createElement('div'); M.id = 'massM'; document.body.appendChild(M); }
    const sc = ids0.length ? 'ids' : sec ? 'secA' : 'active';
    M.innerHTML = `<div class="glass"><div class="mhd"><h3>Modifica in massa<small>Cambi le stesse cose a tanti clienti insieme. Le voci su «Non cambiare» restano come sono; le app si aggiornano da sole entro un minuto (alla prossima apertura se sono chiuse).</small></h3><button class="icb" id="msX" title="Chiudi">✕</button></div>
      <div class="ms-h">A chi</div>
      <div class="ms-sc">${ids0.length ? `<label><input type="radio" name="msSc" value="ids" ${sc === 'ids' ? 'checked' : ''}> Solo i clienti selezionati <small>${ids0.length}</small></label>` : ''}
        ${sec ? `<label><input type="radio" name="msSc" value="secA" ${sc === 'secA' ? 'checked' : ''}> <span><b>${esc(sec.label)}</b>: clienti attivi</span> <small>${secA.length}</small></label>
        <label><input type="radio" name="msSc" value="secAll"> <span><b>${esc(sec.label)}</b>: tutti (anche scaduti e disattivati)</span> <small>${secAll.length}</small></label>` : ''}
        <label><input type="radio" name="msSc" value="active" ${sc === 'active' ? 'checked' : ''}> Tutti i clienti attivi${sec ? ' (tuoi e degli agenti)' : ''} <small>${nActive()}</small></label>
        <label><input type="radio" name="msSc" value="all"> Tutti i clienti${sec ? ' (tuoi e degli agenti)' : ''}, anche scaduti e disattivati <small>${nAll()}</small></label></div>
      <div class="ms-h">Lettore <button class="btn sm" type="button" id="msExo">ExoPlayer ovunque</button><button class="btn sm" type="button" id="msCli">Lo sceglie il cliente</button></div>
      ${ENG.map(([k, l]) => `<div class="ms-r"><div><b>${esc(l)}</b><small>${k === 'live' ? 'Canali in diretta' : k === 'movie' ? 'Film on demand' : 'Episodi delle serie'}</small></div>${sel('eng.' + k, ENG_O)}</div>`).join('')}
      <div class="ms-h">Permessi <button class="btn sm" type="button" id="msAllOn">Consenti tutto</button></div>
      ${perms().map(([k, l, d]) => `<div class="ms-r"><div><b>${esc(l)}</b><small>${esc(d)}</small></div>${sel('perm.' + k, [['', 'Non cambiare'], ['1', 'Consenti'], ['0', 'Blocca']])}</div>`).join('')}
      <div class="ms-h">Altro</div>
      <div class="ms-r"><div><b>VPN</b><small>Come nella scheda del cliente</small></div>${sel('vpn', VPN_O)}</div>
      <div class="ms-r"><div><b>Visioni contemporanee</b><small>Vuoto = non cambiare · 0 = senza limite</small></div><input class="inp" type="number" min="0" max="20" data-ms="streams" placeholder="Non cambiare"></div>
      <div class="ms-h">Controllo remoto · solo per questi clienti</div>
      ${RCM.map(([k, l, d, o]) => `<div class="ms-r"><div><b>${esc(l)}</b><small>${esc(d)}</small></div>${sel('rc.' + k, [['', 'Non cambiare'], ['-', 'Come il profilo (togli la voce)'], ...o])}</div>`).join('')}
      <label class="ms-ck"><input type="checkbox" data-ms="rcClear"><span><b>Togli le impostazioni del Controllo remoto imposte solo a loro</b><small>Torna a valere il profilo dell'app (Controllo remoto → profilo di ogni app)</small></span></label>
      <div class="ms-ft"><span class="ms-sum" id="msSum"></span><span class="sp"></span><button class="btn" type="button" id="msNo">Annulla</button><button class="btn pri" type="button" id="msGo" disabled>Applica</button></div></div>`;
    M.classList.add('on');
    const close = () => M.classList.remove('on');
    M.querySelector('#msX').onclick = close; M.querySelector('#msNo').onclick = close;
    M.onclick = (e) => { if (e.target === M) close(); };
    M.addEventListener('change', refresh); M.addEventListener('input', refresh);
    const setAll = (pre, v) => { M.querySelectorAll(`[data-ms^="${pre}"]`).forEach((s) => (s.value = v)); refresh(); };
    M.querySelector('#msExo').onclick = () => setAll('eng.', 'exo');
    M.querySelector('#msCli').onclick = () => setAll('eng.', '-');
    M.querySelector('#msAllOn').onclick = () => setAll('perm.', '1');
    M.querySelector('#msGo').onclick = async () => {
      const b = readForm(), s = summary(b), sc0 = scopeOf(), n = countOf(sc0);
      if (!s.length || !n) return;
      if (!(await ask(`Modificare ${n} client${n === 1 ? 'e' : 'i'}?`, `<p class="mut" style="margin:0 0 8px">${esc(scLabel(sc0))}</p>${s.map((x) => '• ' + esc(x)).join('<br>')}`, 'Applica'))) return;
      const go = M.querySelector('#msGo'); go.disabled = true; go.textContent = 'Applico…';
      try {
        const ids = idsOf(sc0);
        const r = await api('POST', '/admin/devices/mass', { scope: ids ? 'ids' : sc0, ...(ids ? { ids } : {}), ...b });
        close();
        toast(r.changed ? `Fatto: cambiati ${r.changed} client${r.changed === 1 ? 'e' : 'i'} su ${r.total}. Le app si aggiornano entro un minuto` : `Niente da cambiare: i ${r.total} clienti avevano già queste impostazioni`);
        if (after) try { after(); } catch {}
        load(true).catch(() => {});
      } catch (e) { toast(e.message, 1); go.disabled = false; refresh(); }
    };
    refresh();
  }
  window.KXMass = { open, ok: owner };

  /* pulsante in alto nei Dispositivi: solo per il titolare */
  const ra = renderAll;
  window.renderAll = renderAll = function () { ra(); const b = $('#dvMass'); if (b) { const d = owner() ? '' : 'none'; if (b.style.display !== d) b.style.display = d; } };
  try { const b = $('#dvMass'); if (b) b.style.display = owner() ? '' : 'none'; } catch {}

  /* ---------- demo ---------- */
  if (typeof DEMO !== 'undefined') {
    const dm = demoApi;
    window.demoApi = demoApi = async function (m, p, b) {
      if (p !== '/admin/devices/mass' || m !== 'POST') return dm(m, p, b);
      await new Promise((r) => setTimeout(r, 150));
      const all = DEMO.devices.filter((d) => !d.parent), stOf = (d) => d.status || ((D.devices || []).find((x) => x.id === d.id) || {}).status;
      const list = b.scope === 'ids' ? all.filter((d) => (b.ids || []).includes(d.id)) : all.filter((d) => (b.scope === 'active' ? stOf(d) === 'active' : stOf(d) !== 'pending'));
      let changed = 0;
      for (const d of list) {
        const before = JSON.stringify([d.player, d.perms, d.vpn, d.maxStreams]);
        if (b.player) { d.player = { ...(d.player || {}) }; for (const [k, v] of Object.entries(b.player)) { if (v === '') delete d.player[k]; else d.player[k] = v; } }
        if (b.perms) d.perms = { ...(d.perms || {}), ...b.perms };
        if (b.vpn !== undefined) d.vpn = b.vpn;
        if (b.maxStreams !== undefined) d.maxStreams = b.maxStreams;
        const ov = (DEMO.rctl && DEMO.rctl.over) || null, rc0 = JSON.stringify((ov && ov[d.id]) || {});
        if (b.rcClear && ov) delete ov[d.id];
        if (b.rcSet && ov) { const o = { ...(ov[d.id] || {}) }; for (const [k, v] of Object.entries(b.rcSet)) { if (v === '') delete o[k]; else o[k] = v; } if (Object.keys(o).length) ov[d.id] = o; else delete ov[d.id]; }
        if (JSON.stringify([d.player, d.perms, d.vpn, d.maxStreams]) !== before || JSON.stringify((ov && ov[d.id]) || {}) !== rc0) changed++;
      }
      return { changed, total: list.length, kids: 0 };
    };
  }
})();
