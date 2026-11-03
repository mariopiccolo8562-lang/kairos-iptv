/* KAIROS Control 2.4 — pagina «Assistente IA»: stato di Cloudflare Workers AI, consumo del giorno, domande al giorno
   per cliente, richieste di altre domande (con +10 / +25 / +50). Usa le funzioni di app.js ($, $$, esc, api, toast, ago, D, view, load…). */
(() => {
  const css = document.createElement('style');
  css.textContent = `
.ai-k{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-bottom:14px}
.ai-k .c{padding:16px;border-radius:10px;border:1px solid var(--line);background:var(--glass)}
.ai-k small{display:block;color:var(--mut);font-size:12px}.ai-k b{display:block;font-size:24px;margin-top:4px}.ai-k em{display:block;font-style:normal;font-size:12.5px;color:var(--mut);margin-top:4px}
.ai-k .ok b{color:var(--ok)}.ai-k .bad b{color:var(--bad)}.ai-k .warn b{color:var(--warn)}
.ai-bar{height:8px;border-radius:8px;background:#2a2e36;overflow:hidden;margin-top:8px}.ai-bar s{display:block;height:100%;background:var(--a1)}
.ai-bar.warn s{background:var(--warn)}.ai-bar.bad s{background:var(--bad)}
.ai-g{display:grid;grid-template-columns:1fr 1fr;gap:14px;align-items:start}
.ai-row{display:flex;align-items:center;gap:12px;padding:10px 2px;border-bottom:1px solid var(--line)}.ai-row:last-child{border-bottom:0}
.ai-row .tx{flex:1;min-width:0}.ai-row .tx b{font-size:14px}.ai-row .tx small{display:block;color:var(--mut);font-size:12.5px;margin-top:2px}
.ai-row .ac{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
.ai-row.new{background:rgba(61,124,245,.05)}
.ai-days{display:flex;align-items:flex-end;gap:4px;height:90px;margin-top:10px}.ai-days i{flex:1;background:rgba(61,124,245,.55);border-radius:3px 3px 0 0;min-height:2px;position:relative}
.ai-days i span{position:absolute;bottom:-18px;left:50%;transform:translateX(-50%);font-size:10px;color:var(--mut);font-style:normal}
.ai-help{font-size:13px;color:var(--mut);line-height:1.55}.ai-help b{color:var(--txt)}
@media (max-width:1100px){.ai-g{grid-template-columns:1fr}}`;
  document.head.appendChild(css);

  const IC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>';
  if (!$('.nav[data-v="ai"]')) {
    const b = document.createElement('button'); b.className = 'nav'; b.dataset.v = 'ai'; b.innerHTML = IC + 'Assistente IA<span class="kc-nb" id="nb_ai"></span>';
    b.onclick = () => view('ai');
    ($('.nav[data-v="areq"]') || $('.nav[data-v="creq"]') || $('.nav[data-v="dash"]')).after(b);
    const sec = document.createElement('section'); sec.className = 'view'; sec.id = 'v-ai'; $('#v-dash').after(sec);
  }
  TITLES.ai = 'Assistente IA';

  /* ---------- dati (demo compresa) ---------- */
  const A = { data: null, reqs: null, f: 'open', last: null };
  function demoData() {
    const ds = D.devices.filter((d) => !d.parent && d.status === 'active');
    const t = Date.now(), day = (k) => new Date(t - k * 864e5).toISOString().slice(0, 10);
    const clients = ds.slice(0, 7).map((d, i) => ({ id: d.id, name: d.name, code: d.code, n: [20, 14, 9, 6, 4, 2, 1][i], limit: i === 1 ? 30 : 20, own: i === 1, extra: i === 0 ? 5 : 0 }));
    return { status: { cf: true, gemini: false, claude: true, cfOut: false, freeNeurons: 10000, resetUtc: '00:00 UTC' }, today: { day: day(0), n: 56, cf: 40, gm: 0, cl: 16, neu: 420, usd: 0.003 }, month: { n: 640, cl: 210, usd: 0.04 },
      days: Array.from({ length: 14 }, (_, k) => ({ day: day(13 - k), n: [12, 18, 25, 22, 30, 41, 38, 35, 44, 52, 48, 61, 49, 56][k] })), clients, settings: { aiDaily: 20, aiModel: 'gemma', aiProvider: 'cf', aiClaude: 'haiku' }, claudeModels: [{ id: 'haiku', name: 'Claude Haiku 5.5 (veloce, costa pochissimo)' }, { id: 'sonnet', name: 'Claude Sonnet 5.5 (più preciso, costa circa 20 volte di più)' }],
      models: [{ id: 'gemma', name: 'Gemma 4 (consigliato)' }, { id: 'llama', name: 'Llama 3.1 8B (più veloce, italiano meno curato)' }] };
  }
  function demoReqs() {
    const ds = D.devices.filter((d) => !d.parent && d.status === 'active');
    return ds.slice(0, 2).map((d, i) => ({ id: 700 + i, deviceId: d.id, kind: 'ai', title: 'Altre domande all\'assistente IA', body: `Oggi ha usato ${i ? 20 : 30} domande su ${i ? 20 : 30}`, status: 'new', created: Date.now() - (i + 1) * 40 * 60e3, name: d.name, code: d.code }));
  }
  async function aapi(m, p, b) {
    if (!D.demo) return api(m, p, b);
    if (p === '/admin/ai') return A.demo || (A.demo = demoData());
    if (p.startsWith('/admin/requests?kind=ai') && m === 'GET') return { items: A.demoR || (A.demoR = demoReqs()) };
    if (p === '/admin/ai/grant') { const c = (A.demo || demoData()).clients.find((x) => x.id === b.deviceId); if (c) c.extra += b.n; return { ok: true }; }
    const sm = p.match(/requests\/(\d+)\/status$/); if (sm) { const x = (A.demoR || []).find((r) => r.id === +sm[1]); if (x) { x.status = b.status; x.note = b.note || ''; } return { ok: true }; }
    const dm = p.match(/requests\/(\d+)$/); if (dm) { A.demoR = (A.demoR || []).filter((r) => r.id !== +dm[1]); return { ok: true }; }
    if (p === '/admin/settings') { const d = A.demo || (A.demo = demoData()); Object.assign(d.settings, b); return { ok: true }; }
    return { ok: true };
  }

  async function aiLoad(quiet) {
    if (D.role === 'agent') return;
    const V = $('#v-ai');
    if (!quiet && !A.data) V.innerHTML = '<div class="card glass"><p class="mut">Caricamento…</p></div>';
    try { [A.data, A.reqs] = await Promise.all([aapi('GET', '/admin/ai'), aapi('GET', '/admin/requests?kind=ai').then((r) => r.items || [])]); }
    catch (e) { if (!quiet) V.innerHTML = `<div class="card glass"><p class="mut">${esc(e.message)}</p></div>`; return; }
    const nNew = A.reqs.filter((r) => r.status === 'new').length, nb = $('#nb_ai');
    if (nb) { nb.textContent = nNew; nb.classList.toggle('on', nNew > 0); }
    if (A.last !== null && nNew > A.last) toast(`Nuova richiesta di domande all'assistente (${nNew})`);
    A.last = nNew;
    if (quiet && !V.classList.contains('on')) return;
    if (quiet && V.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return; // non disturba mentre scrivi
    render();
  }
  function render() {
    const V = $('#v-ai'), x = A.data, st = x.status, t = x.today;
    const pct = Math.min(100, Math.round((t.neu / (st.freeNeurons || 10000)) * 100));
    const perQ = t.cf ? t.neu / t.cf : 10.5, leftQ = Math.max(0, Math.floor(((st.freeNeurons || 10000) - t.neu) / (perQ || 10.5)));
    const useCl = x.settings.aiProvider === 'claude', useGm = x.settings.aiProvider === 'gm';
    const cfState = useGm ? (st.gemini ? ['ok', 'Gemini', 'Google Gemini (gratis, più lento)'] : ['bad', 'Gemini senza chiave', 'Aggiungi GEMINI_API_KEY']) : useCl ? (st.claude ? ['ok', 'Claude', (x.claudeModels.find((m) => m.id === x.settings.aiClaude) || {}).name || 'Anthropic'] : ['bad', 'Claude senza chiave', 'Aggiungi ANTHROPIC_API_KEY (guida sotto)']) : !st.cf ? ['bad', 'Non collegato', 'Segui la guida qui sotto'] : st.cfOut ? ['warn', 'Limite di oggi finito', st.claude || st.gemini ? 'Ora risponde il servizio di riserva' : 'Riparte alle 01:00 italiane'] : ['ok', 'Attivo', 'Cloudflare Workers AI (gratis)'];
    const usd = (v) => (v < 0.01 ? (v > 0 ? 'meno di 0,01' : '0') : v.toFixed(2).replace('.', ',')) + ' $';
    const max = Math.max(1, ...x.days.map((d) => d.n));
    const fit = (r, k) => (k === 'open' ? r.status !== 'done' : k === 'done' ? r.status === 'done' : true);
    const reqs = A.reqs.filter((r) => fit(r, A.f));
    V.innerHTML = `<div class="ai-k">
      <div class="c ${cfState[0]}"><small>Servizio</small><b>${cfState[1]}</b><em>${cfState[2]}</em></div>
      <div class="c"><small>Domande oggi</small><b>${t.n}</b><em>${[t.cf ? t.cf + ' Cloudflare' : '', t.cl ? t.cl + ' Claude' : '', t.gm ? t.gm + ' Gemini' : ''].filter(Boolean).join(' · ') || 'nessuna'}</em></div>
      <div class="c ${pct >= 90 ? 'bad' : pct >= 70 ? 'warn' : ''}"><small>Gratis di oggi usato (Cloudflare)</small><b>${pct}%</b><div class="ai-bar ${pct >= 90 ? 'bad' : pct >= 70 ? 'warn' : ''}"><s style="width:${pct}%"></s></div><em>circa ${t.neu} di ${st.freeNeurons} neuroni · restano ~${leftQ} domande</em></div>
      <div class="c ${st.claude ? 'ok' : ''}"><small>Claude · spesa stimata</small><b>${st.claude ? usd(x.today.usd || 0) : 'Non collegato'}</b><em>${st.claude ? `oggi · ultimi 30 giorni: ${usd((x.month && x.month.usd) || 0)} (${(x.month && x.month.cl) || 0} domande)` : 'Facoltativo, a pagamento (segreto ANTHROPIC_API_KEY)'}</em></div>
    </div>
    <div class="ai-g">
      <div class="card glass"><div class="hd"><h3>Richieste di altre domande<small>I clienti le inviano dall'app quando finiscono le domande del giorno</small></h3>
        <div class="filters" style="margin:0">${[['open', 'Da gestire'], ['done', 'Fatte'], ['all', 'Tutte']].map(([k, l]) => `<button class="fchip ${A.f === k ? 'on' : ''}" data-aif="${k}">${l}<span>${A.reqs.filter((r) => fit(r, k)).length}</span></button>`).join('')}</div></div>
        ${reqs.length ? reqs.map((r) => `<div class="ai-row ${r.status === 'new' ? 'new' : ''}"><div class="tx"><b>${esc(r.name || 'Cliente')}</b> <span class="mono mut" style="font-size:12px">${esc(r.code || '')}</span><small>${esc(r.body || '')} · ${esc(ago(r.created))}${r.note ? ' · <b>' + esc(r.note) + '</b>' : ''}</small></div>
          <div class="ac">${r.status !== 'done' ? `${[10, 25, 50].map((n) => `<button class="btn sm ${n === 10 ? 'pri' : ''}" data-aig="${r.id}:${n}">+${n}</button>`).join('')}<button class="btn sm" data-aino="${r.id}">Rifiuta</button>` : ''}<button class="icb" data-aidel="${r.id}" title="Elimina">✕</button></div></div>`).join('')
        : '<div class="emptyc">Nessuna richiesta.</div>'}
      </div>
      <div class="card glass"><div class="hd"><h3>Impostazioni<small>Valgono per tutti i clienti; nella scheda del cliente puoi dargliene di più o di meno</small></h3></div>
        <label class="lbl">Chi risponde ai clienti</label><div class="seg" id="aiProv" style="display:flex">${[['cf', 'Cloudflare · gratis, veloce', st.cf], ['claude', 'Claude · a pagamento, preciso', st.claude], ['gm', 'Gemini · gratis, lento', st.gemini]].map(([k, l, on]) => `<button data-prov="${k}" class="${x.settings.aiProvider === k ? 'on' : ''}" style="flex:1">${l}${on ? '' : ' ⚠'}</button>`).join('')}</div>
        <p class="ai-help" style="margin-top:6px">Se il servizio scelto non risponde (limite, credito finito, chiave sbagliata) rispondono gli altri collegati. ⚠ = non ancora collegato. Collegati: ${[st.cf ? 'Cloudflare' : '', st.claude ? 'Claude' : '', st.gemini ? 'Gemini' : ''].filter(Boolean).join(', ') || 'nessuno'}.</p>
        <div class="row"><div><label class="lbl">Domande al giorno per cliente</label><input class="inp" type="number" id="aiDaily" min="0" max="1000" value="${x.settings.aiDaily}"></div>
        <div><label class="lbl">Modello Cloudflare</label><select class="inp" id="aiModel">${x.models.map((m) => `<option value="${m.id}" ${x.settings.aiModel === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></div></div>
        <label class="lbl">Modello Claude</label><select class="inp" id="aiClaude">${(x.claudeModels || []).map((m) => `<option value="${m.id}" ${x.settings.aiClaude === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select>
        <button class="btn pri" id="aiSave" style="margin-top:12px">Salva</button>
        <p class="ai-help" style="margin-top:12px">Con il piano gratuito Cloudflare dà <b>10.000 neuroni al giorno</b> (circa <b>900 domande</b> con Gemma 4), che ripartono a mezzanotte UTC (01:00 in Italia). Se finiscono, l'app avvisa il cliente e gli permette di chiedertene altre.</p>
        <label class="lbl">Ultimi 14 giorni</label><div class="ai-days">${x.days.map((d) => `<i style="height:${Math.round((d.n / max) * 100)}%" title="${esc(d.day)}: ${d.n} domande"><span>${esc(d.day.slice(8))}</span></i>`).join('')}</div><div style="height:16px"></div>
      </div>
    </div>
    <div class="card glass" style="margin-top:14px"><div class="hd"><h3>Clienti che l'hanno usato oggi<small>Domande usate, limite del giorno e domande extra ancora disponibili</small></h3></div>
      ${x.clients.length ? x.clients.map((c) => `<div class="ai-row"><div class="tx"><b>${esc(c.name || 'Cliente')}</b> <span class="mono mut" style="font-size:12px">${esc(c.code)}</span><small>${c.n} di ${c.limit} oggi${c.own ? ' (limite personalizzato)' : ''}${c.extra ? ' · ' + c.extra + ' extra' : ''}</small><div class="ai-bar" style="max-width:260px"><s style="width:${Math.min(100, Math.round((c.n / Math.max(1, c.limit)) * 100))}%"></s></div></div>
        <div class="ac"><button class="btn sm" data-aiga="${esc(c.id)}:10">+10 oggi</button><button class="btn sm" data-aiopen="${esc(c.id)}">Cliente</button></div></div>`).join('') : '<div class="emptyc">Nessuno ha usato l\'assistente oggi.</div>'}
    </div>
    ${st.claude ? '' : `<div class="card glass" style="margin-top:14px"><div class="hd"><h3>Come collegare Claude (Anthropic)</h3></div><div class="ai-help">
      1. Vai su <b>console.anthropic.com</b>, crea l'account e in <b>Billing</b> aggiungi una carta e un piccolo credito (es. 5 $: con Haiku bastano per migliaia di domande).<br>
      2. <b>API Keys → Create Key</b>, dagli un nome (es. Kairos) e copia la chiave (inizia con <span class="mono">sk-ant-</span>).<br>
      3. Cloudflare → <b>Workers → kairos-panel → Impostazioni → Variabili e segreti → Aggiungi</b>: tipo <b>Segreto</b>, nome <b>ANTHROPIC_API_KEY</b>, valore la chiave. Salva.<br>
      4. Qui sopra scegli <b>Claude</b> e premi <b>Salva</b>. Per non spendere troppo puoi impostare un limite di spesa mensile su console.anthropic.com → Limits.</div></div>`}
    ${st.gemini ? '' : `<div class="card glass" style="margin-top:14px"><div class="hd"><h3>Come collegare Gemini (Google)</h3></div><div class="ai-help">
      1. Vai su <b>aistudio.google.com</b> → <b>Get API key → Create API key</b> e copia la chiave.<br>
      2. Cloudflare → <b>Workers → kairos-panel → Impostazioni → Variabili e segreti → Aggiungi</b>: tipo <b>Segreto</b>, nome <b>GEMINI_API_KEY</b>, valore la chiave. Salva.</div></div>`}
    ${st.cf ? '' : `<div class="card glass" style="margin-top:14px"><div class="hd"><h3>Come collegare Cloudflare Workers AI</h3></div><div class="ai-help">
      1. Cloudflare → <b>My Profile → API Tokens</b> → modifica il token che usi per GitHub (CLOUDFLARE_API_TOKEN).<br>
      2. <b>Add more</b> → <b>Account</b> → <b>Workers AI</b> → <b>Edit</b> → salva il token (resta lo stesso, non devi ricopiarlo).<br>
      3. GitHub → Actions → <b>Pannello Cloudflare</b> → <b>Run workflow</b> (o chiedimi di ricaricare). Fatto: nessuna chiave da copiare.</div></div>`}`;
    $$('[data-aif]', V).forEach((b) => (b.onclick = () => { A.f = b.dataset.aif; render(); }));
    $$('[data-aig]', V).forEach((b) => (b.onclick = async () => {
      const [rid, n] = b.dataset.aig.split(':'), r = A.reqs.find((y) => y.id === +rid);
      try { await aapi('POST', '/admin/ai/grant', { deviceId: r.deviceId, n: +n }); await aapi('POST', `/admin/requests/${rid}/status`, { status: 'done', note: `+${n} domande` }); toast(`+${n} domande a ${r.name || r.code}`); aiLoad(); } catch (e) { toast(e.message, 1); }
    }));
    $$('[data-aino]', V).forEach((b) => (b.onclick = async () => { try { await aapi('POST', `/admin/requests/${b.dataset.aino}/status`, { status: 'done', note: 'Rifiutata' }); aiLoad(); } catch (e) { toast(e.message, 1); } }));
    $$('[data-aidel]', V).forEach((b) => (b.onclick = async () => { try { await aapi('DELETE', '/admin/requests/' + b.dataset.aidel); aiLoad(); } catch (e) { toast(e.message, 1); } }));
    $$('[data-aiga]', V).forEach((b) => (b.onclick = async () => { const [id, n] = b.dataset.aiga.split(':'); try { await aapi('POST', '/admin/ai/grant', { deviceId: id, n: +n }); toast(`+${n} domande`); aiLoad(); } catch (e) { toast(e.message, 1); } }));
    $$('[data-aiopen]', V).forEach((b) => (b.onclick = () => { const d = D.devices.find((y) => y.id === b.dataset.aiopen); d ? openDrawer(d, false) : toast('Cliente non trovato', 1); }));
    let prov = x.settings.aiProvider;
    $$('#aiProv [data-prov]', V).forEach((b) => (b.onclick = () => { prov = b.dataset.prov; $$('#aiProv [data-prov]', V).forEach((y) => y.classList.toggle('on', y === b)); if ((prov === 'claude' && !st.claude) || (prov === 'gm' && !st.gemini) || (prov === 'cf' && !st.cf)) toast('Questo servizio non è ancora collegato: segui la guida in fondo alla pagina', 1); }));
    $('#aiSave').onclick = async () => { try { await aapi('PUT', '/admin/settings', { aiDaily: +$('#aiDaily').value, aiModel: $('#aiModel').value, aiProvider: prov, aiClaude: $('#aiClaude').value }); toast('Impostazioni dell\'assistente salvate'); aiLoad(); } catch (e) { toast(e.message, 1); } };
  }
  const v0 = view;
  window.view = view = function (v) { v0(v); if (v === 'ai') aiLoad(); };
  setInterval(() => { if (!document.hidden && $('#app').classList.contains('on') && D.role !== 'agent') aiLoad(true).catch(() => {}); }, 30000);
  const t0 = setInterval(() => { if ($('#app').classList.contains('on') && D.devices) { clearInterval(t0); aiLoad(true).catch(() => {}); } }, 700);

  /* ---------- scheda cliente: domande al giorno ---------- */
  const rdw = renderDrawer;
  window.renderDrawer = renderDrawer = function () {
    rdw();
    if (!edit || edit.parent || D.role === 'agent') return;
    const sec = $('#ds-perm') || $('#ds-note'); if (!sec || $('#eAiLim')) return;
    const v = edit.aiLimitIn !== undefined ? edit.aiLimitIn : edit.aiLimit ?? -1, def = (A.data && A.data.settings.aiDaily) ?? (D.settings.aiDaily ?? 20);
    sec.insertAdjacentHTML('beforeend', `<label class="lbl">Assistente IA: domande al giorno</label><div class="row"><input class="inp" type="number" id="eAiLim" min="0" max="1000" placeholder="Predefinito (${def})" value="${v >= 0 ? v : ''}"><span class="mut" style="font-size:12px;align-self:center">Vuoto = ${def} come tutti · 0 = niente assistente${edit.aiExtra ? ` · ${edit.aiExtra} domande extra disponibili` : ''}</span></div>`);
    $('#eAiLim').oninput = (e) => { const s = e.target.value.trim(); edit.aiLimitIn = s === '' ? -1 : Math.max(0, Math.min(1000, parseInt(s, 10) || 0)); };
  };
})();
