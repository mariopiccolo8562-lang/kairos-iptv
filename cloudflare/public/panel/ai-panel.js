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
    const clients = ds.slice(0, 7).map((d, i) => ({ id: d.id, name: d.name, code: d.code, n: [20, 14, 9, 6, 4, 2, 1][i], cl: i === 1 ? 14 : 0, gm: i === 1 ? 0 : [20, 14, 9, 6, 4, 2, 1][i], limit: i === 1 ? 30 : 20, own: i === 1, extra: i === 0 ? 5 : 0, provider: i === 1 ? 'claude' : '' }));
    return { status: { gemini: true, claude: true }, today: { day: day(0), n: 56, gm: 42, cl: 14, usd: 0.003 }, month: { n: 640, cl: 210, usd: 0.04 },
      days: Array.from({ length: 14 }, (_, k) => ({ day: day(13 - k), n: [12, 18, 25, 22, 30, 41, 38, 35, 44, 52, 48, 61, 49, 56][k] })), clients, settings: { aiDaily: 20, aiProvider: 'gm', aiClaude: 'haiku', aiGemini: 'flash' },
      claudeModels: [{ id: 'haiku', name: 'Claude Haiku 5.5 (veloce, costa pochissimo)' }, { id: 'sonnet', name: 'Claude Sonnet 5.5 (più preciso, costa circa 20 volte di più)' }],
      geminiModels: [{ id: 'flash', name: 'Gemini 3.8 Flash (risposte migliori)' }, { id: 'lite', name: 'Gemini 3.5 Flash-Lite (più veloce)' }] };
  }
  function demoReqs() {
    const ds = D.devices.filter((d) => !d.parent && d.status === 'active');
    return ds.slice(0, 2).map((d, i) => ({ id: 700 + i, deviceId: d.id, kind: 'ai', title: 'Altre domande all\'assistente IA', body: `Oggi ha usato ${i ? 20 : 30} domande su ${i ? 20 : 30}`, status: 'new', created: Date.now() - (i + 1) * 40 * 60e3, name: d.name, code: d.code }));
  }
  async function aapi(m, p, b) {
    if (!D.demo) return api(m, p, b);
    if (p === '/admin/ai') return A.demo || (A.demo = demoData());
    if (p.startsWith('/admin/requests?kind=ai') && m === 'GET') return { items: A.demoR || (A.demoR = demoReqs()) };
    if (p === '/admin/ai/test') return b.provider === 'claude' ? { ok: false, status: 400, error: 'Credito finito o mai caricato: console.anthropic.com → Billing' } : { ok: true, model: 'gemini-3.8-flash', ms: 1400 };
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
  const PROV = { claude: 'Claude', gm: 'Gemini' };
  function render() {
    const V = $('#v-ai'), x = A.data, st = x.status, t = x.today, S = x.settings;
    const usd = (v) => (v < 0.01 ? (v > 0 ? 'meno di 0,01' : '0') : v.toFixed(2).replace('.', ',')) + ' $';
    const on = (k) => (k === 'claude' ? st.claude : st.gemini);
    const def = S.aiProvider, defOk = on(def), other = def === 'claude' ? 'gm' : 'claude';
    const svc = defOk ? ['ok', PROV[def], def === 'claude' ? (x.claudeModels.find((m) => m.id === S.aiClaude) || {}).name : (x.geminiModels.find((m) => m.id === S.aiGemini) || {}).name]
      : on(other) ? ['warn', PROV[def] + ' non collegato', 'Per ora risponde ' + PROV[other] + ' · guida in fondo'] : ['bad', 'Nessuna IA collegata', 'Segui la guida in fondo alla pagina'];
    const max = Math.max(1, ...x.days.map((d) => d.n));
    const fit = (r, k) => (k === 'open' ? r.status !== 'done' : k === 'done' ? r.status === 'done' : true);
    const reqs = A.reqs.filter((r) => fit(r, A.f));
    V.innerHTML = `<div class="ai-k">
      <div class="c ${svc[0]}"><small>Risponde ai clienti (predefinito)</small><b>${esc(svc[1])}</b><em>${esc(svc[2] || '')}</em></div>
      <div class="c"><small>Domande oggi</small><b>${t.n}</b><em>${[t.cl ? t.cl + ' Claude' : '', t.gm ? t.gm + ' Gemini' : ''].filter(Boolean).join(' · ') || 'nessuna'}</em></div>
      <div class="c ${st.claude ? 'ok' : ''}"><small>Claude · spesa stimata</small><b>${st.claude ? usd(t.usd || 0) : 'Non collegato'}</b><em>${st.claude ? `oggi · ultimi 30 giorni: ${usd((x.month && x.month.usd) || 0)} (${(x.month && x.month.cl) || 0} domande)` : 'A pagamento: serve la chiave ANTHROPIC_API_KEY e del credito'}</em>${st.claude ? '<button class="btn sm" data-aitest="claude" style="margin-top:8px">Prova Claude</button><em id="aiT_claude"></em>' : ''}</div>
      <div class="c ${st.gemini ? 'ok' : ''}"><small>Gemini</small><b>${st.gemini ? 'Collegato' : 'Non collegato'}</b><em>${st.gemini ? 'Gratis, con un limite giornaliero di Google' : 'Gratis: serve la chiave GEMINI_API_KEY'}</em>${st.gemini ? '<button class="btn sm" data-aitest="gm" style="margin-top:8px">Prova Gemini</button><em id="aiT_gm"></em>' : ''}</div>
    </div>
    <div class="ai-g">
      <div class="card glass"><div class="hd"><h3>Richieste di altre domande<small>I clienti le inviano dall'app quando finiscono le domande del giorno</small></h3>
        <div class="filters" style="margin:0">${[['open', 'Da gestire'], ['done', 'Fatte'], ['all', 'Tutte']].map(([k, l]) => `<button class="fchip ${A.f === k ? 'on' : ''}" data-aif="${k}">${l}<span>${A.reqs.filter((r) => fit(r, k)).length}</span></button>`).join('')}</div></div>
        ${reqs.length ? reqs.map((r) => `<div class="ai-row ${r.status === 'new' ? 'new' : ''}"><div class="tx"><b>${esc(r.name || 'Cliente')}</b> <span class="mono mut" style="font-size:12px">${esc(r.code || '')}</span><small>${esc(r.body || '')} · ${esc(ago(r.created))}${r.note ? ' · <b>' + esc(r.note) + '</b>' : ''}</small></div>
          <div class="ac">${r.status !== 'done' ? `${[10, 25, 50].map((n) => `<button class="btn sm ${n === 10 ? 'pri' : ''}" data-aig="${r.id}:${n}">+${n}</button>`).join('')}<button class="btn sm" data-aino="${r.id}">Rifiuta</button>` : ''}<button class="icb" data-aidel="${r.id}" title="Elimina">✕</button></div></div>`).join('')
        : '<div class="emptyc">Nessuna richiesta.</div>'}
      </div>
      <div class="card glass"><div class="hd"><h3>Impostazioni<small>Valgono per tutti i clienti; nella scheda del singolo cliente puoi scegliere un'altra IA e un altro numero di domande</small></h3></div>
        <label class="lbl">Intelligenza artificiale predefinita</label><div class="seg" id="aiProv" style="display:flex">${[['claude', 'Claude · a pagamento, preciso'], ['gm', 'Gemini · gratis']].map(([k, l]) => `<button data-prov="${k}" class="${def === k ? 'on' : ''}" style="flex:1">${l}${on(k) ? '' : ' ⚠'}</button>`).join('')}</div>
        <p class="ai-help" style="margin-top:6px">Se quella scelta non risponde (credito finito, limite, chiave sbagliata) risponde l'altra, se è collegata. ⚠ = non ancora collegata.</p>
        <div class="row"><div><label class="lbl">Modello Claude</label><select class="inp" id="aiClaude">${x.claudeModels.map((m) => `<option value="${m.id}" ${S.aiClaude === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></div>
        <div><label class="lbl">Modello Gemini</label><select class="inp" id="aiGemini">${x.geminiModels.map((m) => `<option value="${m.id}" ${S.aiGemini === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></div></div>
        <label class="lbl">Domande al giorno per cliente</label><input class="inp" type="number" id="aiDaily" min="0" max="1000" value="${S.aiDaily}" style="max-width:200px">
        <div><button class="btn pri" id="aiSave" style="margin-top:12px">Salva</button></div>
        <p class="ai-help" style="margin-top:12px">Prezzi di Claude: <b>Haiku 5.5</b> circa 0,17 $ ogni 1.000 domande, <b>Sonnet 5.5</b> circa 3,30 $ ogni 1.000 domande (stime per risposte brevi). Gemini è gratis.</p>
        <label class="lbl">Ultimi 14 giorni</label><div class="ai-days">${x.days.map((d) => `<i style="height:${Math.round((d.n / max) * 100)}%" title="${esc(d.day)}: ${d.n} domande (${d.cl || 0} Claude, ${d.gm || 0} Gemini)"><span>${esc(d.day.slice(8))}</span></i>`).join('')}</div><div style="height:16px"></div>
      </div>
    </div>
    <div class="card glass" style="margin-top:14px"><div class="hd"><h3>Clienti che l'hanno usato oggi<small>Domande usate, IA, limite del giorno e domande extra</small></h3></div>
      ${x.clients.length ? x.clients.map((c) => `<div class="ai-row"><div class="tx"><b>${esc(c.name || 'Cliente')}</b> <span class="mono mut" style="font-size:12px">${esc(c.code)}</span> <span class="chip ${c.provider ? 'b' : ''}">${c.provider ? PROV[c.provider] : 'IA predefinita'}</span><small>${c.n} di ${c.limit} oggi${c.own ? ' (limite personalizzato)' : ''}${c.extra ? ' · ' + c.extra + ' extra' : ''}${c.cl || c.gm ? ` · ${[c.cl ? c.cl + ' Claude' : '', c.gm ? c.gm + ' Gemini' : ''].filter(Boolean).join(', ')}` : ''}</small><div class="ai-bar" style="max-width:260px"><s style="width:${Math.min(100, Math.round((c.n / Math.max(1, c.limit)) * 100))}%"></s></div></div>
        <div class="ac"><button class="btn sm" data-aiga="${esc(c.id)}:10">+10 oggi</button><button class="btn sm" data-aiopen="${esc(c.id)}">Cliente</button></div></div>`).join('') : '<div class="emptyc">Nessuno ha usato l\'assistente oggi.</div>'}
    </div>
    ${st.claude ? '' : `<div class="card glass" style="margin-top:14px"><div class="hd"><h3>Come collegare Claude (Anthropic)</h3></div><div class="ai-help">
      1. Vai su <b>console.anthropic.com</b>, crea l'account e in <b>Billing</b> aggiungi una carta e un credito (es. 5 $: con Haiku bastano per migliaia di domande). Senza credito Claude non risponde.<br>
      2. <b>API Keys → Create Key</b>, dagli un nome (es. Kairos) e copia la chiave (inizia con <span class="mono">sk-ant-</span>).<br>
      3. Cloudflare → <b>Workers → kairos-panel → Impostazioni → Variabili e segreti → Aggiungi</b>: tipo <b>Segreto</b>, nome <b>ANTHROPIC_API_KEY</b>, valore la chiave. Salva.<br>
      4. Ricarica questa pagina: il riquadro «Claude» deve dire la spesa invece di «Non collegato». In <b>Limits</b> su console.anthropic.com puoi mettere un tetto di spesa mensile.</div></div>`}
    ${st.gemini ? '' : `<div class="card glass" style="margin-top:14px"><div class="hd"><h3>Come collegare Gemini (Google)</h3></div><div class="ai-help">
      1. Vai su <b>aistudio.google.com</b> → <b>Get API key → Create API key</b> e copia la chiave.<br>
      2. Cloudflare → <b>Workers → kairos-panel → Impostazioni → Variabili e segreti → Aggiungi</b>: tipo <b>Segreto</b>, nome <b>GEMINI_API_KEY</b>, valore la chiave. Salva.</div></div>`}`;
    $$('[data-aif]', V).forEach((b) => (b.onclick = () => { A.f = b.dataset.aif; render(); }));
    $$('[data-aig]', V).forEach((b) => (b.onclick = async () => {
      const [rid, n] = b.dataset.aig.split(':'), r = A.reqs.find((y) => y.id === +rid);
      try { await aapi('POST', '/admin/ai/grant', { deviceId: r.deviceId, n: +n }); await aapi('POST', `/admin/requests/${rid}/status`, { status: 'done', note: `+${n} domande` }); toast(`+${n} domande a ${r.name || r.code}`); aiLoad(); } catch (e) { toast(e.message, 1); }
    }));
    $$('[data-aino]', V).forEach((b) => (b.onclick = async () => { try { await aapi('POST', `/admin/requests/${b.dataset.aino}/status`, { status: 'done', note: 'Rifiutata' }); aiLoad(); } catch (e) { toast(e.message, 1); } }));
    $$('[data-aidel]', V).forEach((b) => (b.onclick = async () => { try { await aapi('DELETE', '/admin/requests/' + b.dataset.aidel); aiLoad(); } catch (e) { toast(e.message, 1); } }));
    $$('[data-aiga]', V).forEach((b) => (b.onclick = async () => { const [id, n] = b.dataset.aiga.split(':'); try { await aapi('POST', '/admin/ai/grant', { deviceId: id, n: +n }); toast(`+${n} domande`); aiLoad(); } catch (e) { toast(e.message, 1); } }));
    $$('[data-aiopen]', V).forEach((b) => (b.onclick = () => { const d = D.devices.find((y) => y.id === b.dataset.aiopen); d ? openDrawer(d, false) : toast('Cliente non trovato', 1); }));
    $$('[data-aitest]', V).forEach((b) => (b.onclick = async () => {
      const k = b.dataset.aitest, out = $('#aiT_' + k); b.disabled = true; out.textContent = 'Provo…'; out.style.color = '';
      try {
        const r = await aapi('POST', '/admin/ai/test', { provider: k });
        out.innerHTML = r.ok ? `✓ Funziona (${esc(r.model)}, ${(r.ms / 1000).toFixed(1).replace('.', ',')} s)` : '✗ ' + esc(r.error || 'Non risponde');
        out.style.color = r.ok ? 'var(--ok)' : 'var(--bad)';
      } catch (e) { out.textContent = '✗ ' + e.message; out.style.color = 'var(--bad)'; }
      b.disabled = false;
    }));
    let prov = def;
    $$('#aiProv [data-prov]', V).forEach((b) => (b.onclick = () => { prov = b.dataset.prov; $$('#aiProv [data-prov]', V).forEach((y) => y.classList.toggle('on', y === b)); if (!on(prov)) toast(PROV[prov] + ' non è ancora collegato: segui la guida in fondo alla pagina', 1); }));
    $('#aiSave').onclick = async () => { try { await aapi('PUT', '/admin/settings', { aiDaily: +$('#aiDaily').value, aiProvider: prov, aiClaude: $('#aiClaude').value, aiGemini: $('#aiGemini').value }); toast('Impostazioni dell\'assistente salvate'); aiLoad(); } catch (e) { toast(e.message, 1); } };
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
    const pv = edit.aiProviderIn !== undefined ? edit.aiProviderIn : edit.aiProvider || '';
    sec.insertAdjacentHTML('beforeend', `<label class="lbl">Assistente IA: quale intelligenza artificiale</label><select class="inp" id="eAiProv"><option value="">Quella predefinita (Assistente IA nel menu)</option><option value="claude" ${pv === 'claude' ? 'selected' : ''}>Claude · a pagamento, più preciso</option><option value="gm" ${pv === 'gm' ? 'selected' : ''}>Gemini · gratis</option></select>`);
    $('#eAiProv').onchange = (e) => { edit.aiProviderIn = e.target.value; };
    sec.insertAdjacentHTML('beforeend', `<label class="lbl">Assistente IA: domande al giorno</label><div class="row"><input class="inp" type="number" id="eAiLim" min="0" max="1000" placeholder="Predefinito (${def})" value="${v >= 0 ? v : ''}"><span class="mut" style="font-size:12px;align-self:center">Vuoto = ${def} come tutti · 0 = niente assistente${edit.aiExtra ? ` · ${edit.aiExtra} domande extra disponibili` : ''}</span></div>`);
    $('#eAiLim').oninput = (e) => { const s = e.target.value.trim(); edit.aiLimitIn = s === '' ? -1 : Math.max(0, Math.min(1000, parseInt(s, 10) || 0)); };
  };
})();
