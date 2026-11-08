/* KAIROS Control — pagamenti clienti, linee e agenti */
(() => {
  const escP = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const addMonths = (n, base = localDay()) => { const d = new Date(base + 'T00:00:00'); d.setMonth(d.getMonth() + n); return localDay(d); };
  const amountText = (v) => v == null || v === '' ? '' : `${Number(v).toLocaleString('it-IT', { maximumFractionDigits: 2 })} €`;
  const dateText = (v) => v ? new Date(v + 'T00:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  const effective = (r, today = localDay()) => {
    if (r && r.status === 'paid' && r.paid_until && r.paid_until < today) return { ...r, status: 'due', since: new Date(r.paid_until + 'T00:00:00').getTime() };
    return r;
  };
  const sinceMs = (r) => typeof r.since === 'number' ? r.since : (r.since ? new Date(String(r.since).slice(0, 10) + 'T00:00:00').getTime() : 0);
  const daysSince = (r) => Math.max(0, Math.floor((new Date(localDay() + 'T00:00:00').getTime() - sinceMs(r)) / 864e5));
  const rowKey = (kind, panel, ref) => `${kind}|${kind === 'line' ? String(panel || '').toLowerCase() : ''}|${kind === 'line' ? String(ref || '').toLowerCase() : String(ref || '')}`;
  let cache = { at: 0, rows: [] }, pending = null;
  let ledgerCache = { at: 0, summary: [], own: null }, ledgerPending = null;
  const byKey = () => new Map(cache.rows.map((r) => [rowKey(r.kind, r.panel, r.ref), effective(r)]));
  async function load(force = false) {
    if (!force && Date.now() - cache.at < 60e3) return cache.rows.map(effective);
    if (pending) return pending;
    pending = api('GET', '/admin/payments').then((r) => {
      cache = { at: Date.now(), rows: Array.isArray(r.rows) ? r.rows : [] };
      renderMenuCount();
      maybeRemind();
      dispatch();
      return cache.rows.map(effective);
    }).catch((e) => { if (!cache.at) toast(e.message, 1); return cache.rows.map(effective); }).finally(() => { pending = null; });
    return pending;
  }
  function get(kind, panel, ref) { return byKey().get(rowKey(kind, panel, ref)) || null; }
  function badge(kind, panel, ref) {
    const r = get(kind, panel, ref); if (!r) return '';
    const auto = +r.auto_months > 0 || !!r.auto_opt ? ' <span title="Rinnovo automatico attivo">🔁</span>' : '';
    if (r.status === 'due') {
      const n = daysSince(r), money = amountText(r.amount);
      return `<span class="pay-badge due">💰 Deve pagare · ${+r.months || 0} ${+r.months === 1 ? 'mese' : 'mesi'}${money ? ' · ' + escP(money) : ''} · da ${n} ${n === 1 ? 'giorno' : 'giorni'}${auto}</span>`;
    }
    const until = dateText(r.paid_until), left = r.paid_until ? daysLeft(r.paid_until) : null;
    const rest = left == null ? '' : left < 0 ? ' · scaduto' : left === 0 ? ' · scade oggi' : ` · ${remainingText(r.paid_until)}`;
    return `<span class="pay-badge paid">✓ Pagato${r.amount == null ? '' : ' ' + escP(amountText(r.amount))}${until ? ' · fino al ' + escP(until) : ''}${rest}${auto}</span>`;
  }
  function daysLeft(date) {
    if (!date) return null;
    return Math.ceil((new Date(date + 'T00:00:00').getTime() - new Date(localDay() + 'T00:00:00').getTime()) / 864e5);
  }
  function remainingText(date) {
    const left = daysLeft(date); if (left == null) return '—'; if (left <= 0) return left === 0 ? 'scade oggi' : 'scaduto';
    const from = new Date(localDay() + 'T00:00:00'), to = new Date(date + 'T00:00:00');
    let months = (to.getFullYear() - from.getFullYear()) * 12 + to.getMonth() - from.getMonth();
    if (to.getDate() < from.getDate()) months--;
    const base = new Date(from); base.setMonth(base.getMonth() + Math.max(0, months));
    const days = Math.max(0, Math.ceil((to.getTime() - base.getTime()) / 864e5));
    return `restano ${months > 0 ? months + (months === 1 ? ' mese' : ' mesi') + (days ? ' e ' + days + (days === 1 ? ' giorno' : ' giorni') : '') : days + (days === 1 ? ' giorno' : ' giorni')}`;
  }
  function isDue(kind, panel, ref) { const r = get(kind, panel, ref); return !!r && r.status === 'due'; }
  function filterDue(list, keyFn) {
    return (list || []).filter((x) => { const k = keyFn(x) || []; return isDue('line', k[0], k[1]); });
  }
  const isAgent = () => typeof D !== 'undefined' && D.role === 'agent';
  const canEdit = () => !isAgent() || !!((D.me || {}).perms || {}).payments;
  const dispatch = () => window.dispatchEvent(new CustomEvent('kxpay:update'));
  async function loadLedger(force = false) {
    if (!force && Date.now() - ledgerCache.at < 60e3) return ledgerCache;
    if (ledgerPending) return ledgerPending;
    const path = isAgent() ? '/admin/agent/agent-ledger' : '/admin/agent-ledger';
    ledgerPending = api('GET', path).then((r) => {
      ledgerCache = { at: Date.now(), summary: isAgent() ? [] : (r.agents || []), own: isAgent() ? r : null };
      maybeRemind();
      if ($('#v-payments')?.classList.contains('on')) renderPage();
      dispatch();
      window.dispatchEvent(new CustomEvent('kxledger:update'));
      return ledgerCache;
    }).finally(() => { ledgerPending = null; });
    return ledgerPending;
  }
  const css = document.createElement('style');
  css.textContent = `.pay-badge{display:inline-flex;align-items:center;max-width:100%;width:max-content;padding:3px 8px;border-radius:999px;font-size:11px;line-height:1.35;font-weight:700;white-space:normal}.pay-badge.due{background:rgba(239,68,68,.16);border:1px solid rgba(239,68,68,.42);color:#ff9a9a}.pay-badge.paid{background:rgba(34,197,94,.13);border:1px solid rgba(34,197,94,.32);color:#79e6a0}.pay-panel-tile{display:inline-flex;align-items:center;padding:9px 13px;border-radius:11px;border:1px solid rgba(239,68,68,.45);background:rgba(239,68,68,.14);color:#ffaaaa;font-weight:700;cursor:pointer;white-space:nowrap}.kxpay-veil{position:fixed;inset:0;z-index:5000;background:rgba(0,0,0,.68);display:grid;place-items:center;padding:14px}.kxpay-box{width:min(500px,100%);max-height:90vh;overflow:auto;background:#151923;border:1px solid var(--line);border-radius:16px;padding:20px;box-shadow:0 20px 80px #0009}.kxpay-box h3{margin:0 0 6px}.kxpay-tabs{display:flex;gap:8px;margin:16px 0}.kxpay-tabs button{flex:1}.kxpay-tabs .on{background:var(--pri,#367bf5);color:#fff;border-color:transparent}.kxpay-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.kxpay-grid label{display:grid;gap:5px;font-size:12px;color:var(--mut)}.kxpay-full{grid-column:1/-1}.kxpay-paid-fields{display:grid;grid-template-columns:1fr;gap:10px}.kxpay-box textarea{resize:vertical}.kxpay-actions{display:flex;justify-content:space-between;gap:8px;margin-top:18px}.kxpay-actions>span{display:flex;gap:8px}.kxpay-box .ck{margin-top:12px}.kxpay-auto{display:grid;gap:8px;margin-top:12px;padding:12px;border:1px solid var(--line);border-radius:11px}.kxpay-switch{display:flex!important;align-items:center;gap:8px}.kxpay-summary{margin-top:12px;padding:12px;border:1px solid var(--line);border-radius:11px;font-size:13px;line-height:1.55}.kxpay-summary>div{margin-top:4px}.pay-edit{white-space:nowrap}@media(max-width:500px){.kxpay-grid{grid-template-columns:1fr}.kxpay-full{grid-column:auto}}`;
  css.textContent += `.kxpay-grid label.ck{display:flex;align-items:center;gap:8px;margin:0;padding:4px 0}.kxpay-grid label.ck input{margin:0}`;
  css.textContent += `.kxpay-box{border-color:#35445c;border-radius:20px;background:linear-gradient(145deg,#171e2b,#111620)}.kxpay-box button{border-radius:11px}.kxpay-tabs{gap:9px}.kxpay-tabs button{min-height:42px;border-radius:12px;background:#202a39;color:#aebbd0;border-color:#364258}.kxpay-tabs [data-st="due"].on{background:linear-gradient(135deg,#fb923c,#ef4444);color:#fff;border-color:transparent;box-shadow:0 5px 18px #ef444433}.kxpay-tabs [data-st="paid"].on{background:linear-gradient(135deg,#22c55e,#059669);color:#fff;border-color:transparent;box-shadow:0 5px 18px #10b98133}.kxpay-field-card{padding:12px;border:1px solid #344156;border-left:3px solid #60a5fa;border-radius:13px;background:rgba(24,33,48,.78)}.kxpay-date-card{border-left-color:#60a5fa}.kxpay-amount-card{border-left-color:#fbbf24}.kxpay-note-card{border-left-color:#94a3b8}.kxpay-month-row{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:end;gap:10px}.kxpay-month-row>label{display:grid;gap:6px}.kxpay-quick-months{display:flex;align-items:center;gap:5px;flex-wrap:wrap;padding-bottom:1px}.kxpay-quick-months button{min-width:34px;height:32px;padding:0 8px;background:#1e2b41;color:#bfdbfe;border:1px solid #3c5274}.kxpay-quick-months button.on{background:#2563eb;color:#fff;border-color:#60a5fa}.kxpay-amount-input{display:flex;overflow:hidden;border:1px solid #46546a;border-radius:10px;background:#10151e}.kxpay-amount-input>span{display:grid;place-items:center;min-width:40px;background:#283244;color:#fcd34d;font-weight:800;border-right:1px solid #46546a}.kxpay-amount-input input{min-width:0;flex:1;border:0!important;border-radius:0!important;background:transparent!important}.kxpay-auto{border-color:#176d72;border-left:3px solid #2dd4bf;background:linear-gradient(115deg,#0d3439aa,#152431)}.kxpay-switch{position:relative;display:flex!important;align-items:center;gap:10px;cursor:pointer}.kxpay-switch input{appearance:none;-webkit-appearance:none;position:relative;flex:0 0 44px;width:44px;height:25px;margin:0;border:1px solid #66758a!important;border-radius:999px!important;background:#394456;cursor:pointer;transition:background .18s,border-color .18s}.kxpay-switch input::before{content:"";position:absolute;top:2px;left:2px;width:19px;height:19px;border-radius:50%;background:#e2e8f0;box-shadow:0 1px 4px #0008;transition:transform .18s}.kxpay-switch input:checked{background:#0d9488;border-color:#5eead4!important}.kxpay-switch input:checked::before{transform:translateX(19px)}.kxpay-switch input:focus-visible{outline:2px solid #5eead4;outline-offset:2px}.kxpay-summary{padding:15px;border-radius:15px;transition:background .18s,border-color .18s}.kxpay-summary.due{background:linear-gradient(120deg,#421f2a,#241923);border-color:#b94c55}.kxpay-summary.paid{background:linear-gradient(120deg,#12382f,#172a2b);border-color:#319b74}.kxpay-summary>b{font-size:14px}.kxpay-summary #kpSummaryText{font-size:15px;line-height:1.65;color:#f1f5f9}.kxpay-note-preview{display:grid;gap:5px;margin-top:11px;padding:10px 11px;border:1px solid #475569;border-radius:11px;background:#111722;color:#cbd5e1;font-size:12.5px;line-height:1.5;overflow-wrap:anywhere}.kxpay-note-preview b{color:#e2e8f0}.kxpay-actions{align-items:center;gap:10px}.kxpay-actions button{min-height:40px;padding:8px 14px;border-radius:12px}.kxpay-actions #kpDelete{color:#ff8f8f;background:transparent;border:1px solid #a94450}.kxpay-actions #kpDelete:not(:disabled):hover{background:#7f1d2b33}.kxpay-actions #kpSave.due{background:linear-gradient(135deg,#3b82f6,#2563eb);border-color:transparent;color:#fff}.kxpay-actions #kpSave.paid{background:linear-gradient(135deg,#22c55e,#059669);border-color:transparent;color:#fff}.kxpay-box .ck#kpRemindWrap{margin-top:10px;padding:8px 10px;border:1px solid #3e4859;border-radius:10px;background:#1b2230;color:#d2d9e6}@media(max-width:420px){.kxpay-veil{padding:7px}.kxpay-box{width:100%;max-height:94vh;padding:14px;border-radius:16px}.kxpay-box h3{font-size:18px}.kxpay-tabs{gap:6px;margin:13px 0}.kxpay-tabs button{min-height:40px;padding:7px 5px;font-size:12px}.kxpay-grid{grid-template-columns:1fr;gap:9px}.kxpay-month-row{grid-template-columns:1fr;gap:8px}.kxpay-quick-months{justify-content:flex-start}.kxpay-actions{flex-wrap:wrap}.kxpay-actions>span{width:100%;justify-content:flex-end}.kxpay-actions #kpDelete{margin-right:auto}.kxpay-summary #kpSummaryText{font-size:14px}.kxpay-note-preview{font-size:12px}}`;
  document.head.appendChild(css);
  const PANEL_NAMES = { wolf: 'WOLF', armada: 'Armada', storm: 'Storm', atx: 'Atlantix', ora: 'ORA', ro: 'Realott', slt: 'SLT', orcp: 'MirkoTeam', mxp: 'MaxPlayer', oxp: 'OrbixPlay' };
  const NATIVE_NOTE_PANELS = new Set(['wolf', 'atx', 'ro', 'slt']);
  const PAYMENT_NOTE_TAG = /\s*\[K: [^\]]*\]\s*$/;
  const noteTag = (status, months, amount, paidUntil, autoOn) => {
    if (status === 'due') return `[K: DEVE PAGARE ${months} ${months === 1 ? 'mese' : 'mesi'}${amount === null ? '' : ` · ${Number(amount).toLocaleString('it-IT', { maximumFractionDigits: 2 })}€`}]`;
    const d = String(paidUntil || '');
    const date = /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(2, 4)}` : '';
    return `[K: PAGATO fino al ${date}${autoOn ? ' · rinnovo auto' : ''}]`;
  };
  const panelNoteText = (current, note, tag) => {
    const base = String(note || '').trim() || String(current || '').replace(PAYMENT_NOTE_TAG, '').trim();
    return `${base.slice(0, Math.max(0, 300 - tag.length - (base ? 1 : 0)))} ${tag}`.trim();
  };
  function open(kind, panel, ref, label, ownerId, initialStatus = '', autoLine = '', currentPanelNote) {
    if (!canEdit()) return toast('Non puoi gestire i pagamenti', 1);
    load().then(async () => {
      const old = get(kind, panel, ref), status = ['due', 'paid'].includes(initialStatus) ? initialStatus : (old && old.status) || 'due';
      const row = old || {};
      const supportedAuto = kind === 'device' || kind === 'line' && ['wolf', 'armada', 'storm', 'atx', 'ro', 'slt'].includes(panel);
      const canAuto = supportedAuto && (!isAgent() || !!((D.me || {}).perms || {}).autoRenew);
      const packageTarget = kind === 'line' && ['wolf', 'ro', 'slt'].includes(panel);
      let packages = [];
      if (canAuto && packageTarget) {
        try { packages = (await api('GET', `/admin/${panel}/packages`)).packages || []; } catch {}
      }
      const lineValue = autoLine || row.auto_line || '';
      const lineText = typeof lineValue === 'string' ? lineValue : JSON.stringify(lineValue);
      const periods = kind === 'device' ? Array.from({ length: 12 }, (_, i) => i + 1) : panel === 'atx' ? [1, 2, 3, 6, 12] : [1, 3, 6, 12];
      const autoOn0 = +row.auto_months > 0 || !!row.auto_opt;
      const autoControl = !supportedAuto ? kind === 'line' ? `<div class="kxpay-auto kxpay-full mut" id="kpAutoWrap" style="${status === 'paid' ? '' : 'display:none'}">Rinnovo automatico non disponibile su questo pannello</div>` : '' : !canAuto ? '' : `<div class="kxpay-auto kxpay-full" id="kpAutoWrap" style="${status === 'paid' ? '' : 'display:none'}"><b>🔁 Rinnovo automatico</b><label class="ck kxpay-switch"><input id="kpAutoOn" type="checkbox"${autoOn0 ? ' checked' : ''}><span>Rinnova la linea da solo quando scade</span></label>
        ${packageTarget ? `<label class="kxpay-full">Ogni volta rinnova di:<select class="inp" id="kpAutoOpt">${packages.map((p) => `<option value="${escP(p.id)}"${String(row.auto_opt || '') === String(p.id) ? ' selected' : ''}>${escP(p.name || p.id)}</option>`).join('')}</select></label>` : `<label class="kxpay-full">Ogni volta rinnova di:<select class="inp" id="kpAutoMonths">${periods.map((n) => `<option value="${n}"${(+row.auto_months || periods[0]) === n ? ' selected' : ''}>${n} ${n === 1 ? 'mese' : 'mesi'}</option>`).join('')}</select></label>`}
        <input type="hidden" id="kpAutoLine" value="${escP(lineText)}"><small class="mut" id="kpAutoHelp"></small></div>`;
      const veil = document.createElement('div'); veil.className = 'kxpay-veil';
      veil.innerHTML = `<div class="kxpay-box" role="dialog" aria-modal="true" aria-label="Pagamento"><h3>💰 Pagamento</h3><div class="mut">${escP(label || row.label || ref)}</div>
      <div class="kxpay-tabs"><button type="button" class="btn ${status === 'due' ? 'on' : ''}" data-st="due">⏳ Deve ancora pagare</button><button type="button" class="btn ${status === 'paid' ? 'on' : ''}" data-st="paid">✅ Ha già pagato</button></div>
        <div class="kxpay-grid"><div class="kxpay-full kxpay-paid-fields kxpay-field-card kxpay-date-card"><div class="kxpay-month-row"><label id="kpMonthsLabel">${status === 'paid' ? 'Quanti mesi ha pagato?' : 'Quanti mesi deve pagare?'}<input class="inp" id="kpMonths" type="number" min="0" max="120" step="1" value="${Number.isInteger(+row.months) ? +row.months : 1}"></label><div class="kxpay-quick-months" aria-label="Imposta rapidamente i mesi"><button type="button" data-kp-months="1">1</button><button type="button" data-kp-months="3">3</button><button type="button" data-kp-months="6">6</button><button type="button" data-kp-months="12">12</button></div></div>
        <label id="kpDateWrap" style="${status === 'paid' ? '' : 'display:none'}">Coperto fino al<input class="inp" id="kpDate" type="date" value="${escP(status === 'paid' && row.paid_until >= localDay() ? row.paid_until : addMonths(+row.months || 1))}"></label></div>
        <label class="kxpay-field-card kxpay-amount-card">Importo (facoltativo)<span class="kxpay-amount-input"><span>€</span><input class="inp" id="kpAmount" type="number" min="0" max="100000" step="0.01" value="${row.amount == null ? '' : escP(row.amount)}" placeholder="es. 10"></span></label>
        <label class="kxpay-full kxpay-field-card kxpay-note-card">Nota<textarea class="inp" id="kpNote" maxlength="200" rows="2" placeholder="es. Mario Rossi">${escP(row.note || '')}</textarea></label>
        ${autoControl}</div>
        <label class="ck" id="kpRemindWrap" style="${status === 'due' ? '' : 'display:none'}"><input id="kpRemind" type="checkbox"${row.remind === 0 ? '' : ' checked'}><span>Ricordamelo ogni 2 giorni finché non paga</span></label>
        <div class="kxpay-summary ${status}" id="kpSummary"><b>Riepilogo</b><div id="kpSummaryText"></div>${kind === 'line' ? `<div class="kxpay-note-preview"><b id="kpPanelNoteLabel"></b><span id="kpPanelNote"></span></div>` : ''}</div>
        <div class="kxpay-actions"><button type="button" class="btn danger" id="kpDelete"${old ? '' : ' disabled'}>Togli</button><span><button type="button" class="btn" id="kpCancel">Annulla</button><button type="button" class="btn pri" id="kpSave">Salva</button></span></div></div>`;
      document.body.appendChild(veil);
      let curStatus = status, dateEdited = false;
      const close = () => veil.remove();
      const date = $('#kpDate', veil), months = $('#kpMonths', veil);
      if (kind === 'line' && currentPanelNote === undefined && !NATIVE_NOTE_PANELS.has(panel)) {
        try {
          const notes = await api('GET', `/admin/line-notes?panel=${encodeURIComponent(panel)}`);
          currentPanelNote = (notes.notes || {})[String(ref).toLowerCase()] || '';
        } catch { currentPanelNote = ''; }
      }
      currentPanelNote = String(currentPanelNote || '');
      const autoHelp = $('#kpAutoHelp', veil), summary = $('#kpSummaryText', veil), summaryBox = $('#kpSummary', veil);
      const selectedAutoPeriod = () => {
        const opt = $('#kpAutoOpt', veil), period = $('#kpAutoMonths', veil);
        return opt ? (opt.selectedOptions[0]?.textContent || 'pacchetto') : period ? `${period.value} ${+period.value === 1 ? 'mese' : 'mesi'}` : +row.auto_months ? `${+row.auto_months} ${+row.auto_months === 1 ? 'mese' : 'mesi'}` : row.auto_opt ? 'pacchetto scelto' : '';
      };
      const autoHelpText = () => {
        if (!autoHelp) return;
        const period = selectedAutoPeriod() || 'periodo scelto';
        const until = date.value ? dateText(date.value) : '—';
        const monthsPerRenewal = +($('#kpAutoMonths', veil)?.value || 0);
        const untilMs = date.value ? Date.parse(date.value + 'T00:00:00') : NaN;
        const todayMs = Date.parse(localDay() + 'T00:00:00');
        const count = monthsPerRenewal && Number.isFinite(untilMs) ? Math.max(0, Math.ceil((untilMs - todayMs) / (monthsPerRenewal * 30.4375 * 864e5))) : 0;
        autoHelp.textContent = `Quando la linea scade, KAIROS la rinnova di ${period} alla volta, fino al ${until}.${monthsPerRenewal ? ` (circa ${count} rinnovi)` : ''} Usa i tuoi crediti.`;
      };
      const updateSummary = () => {
        const n = Number(months.value) || 0, av = $('#kpAmount', veil).value.trim(), amount = av && Number.isFinite(Number(av)) ? Number(av) : null;
        const monthText = `${n} ${n === 1 ? 'mese' : 'mesi'}`, money = amount === null ? '' : ` (${amountText(amount)})`;
        let text = curStatus === 'paid' ? `Ha pagato ${monthText}${money}.` : `Deve ancora pagare ${monthText}${money}.`;
        const autoMonthsValue = +($('#kpAutoMonths', veil)?.value || row.auto_months || 0), autoOptValue = $('#kpAutoOpt', veil)?.value || row.auto_opt || '';
        const autoOn = $('#kpAutoOn', veil)?.checked ?? autoOn0;
        if (curStatus === 'paid' && autoOn && supportedAuto) text += ` La linea si rinnova da sola di ${selectedAutoPeriod()} alla volta fino al ${date.value ? dateText(date.value) : '—'}. Usa i tuoi crediti.`;
        if (curStatus === 'due') text += $('#kpRemind', veil).checked ? ' Ti ricordo ogni 2 giorni.' : ' Promemoria disattivato.';
        if (kind === 'line') {
          const paidUntil = curStatus === 'paid' ? date.value || addMonths(n) : '';
          const tag = noteTag(curStatus, n, amount, paidUntil, autoOn && (autoMonthsValue > 0 || !!autoOptValue));
          $('#kpPanelNoteLabel', veil).textContent = `📝 Nota sul pannello ${PANEL_NAMES[panel] || panel.toUpperCase()}:`;
          $('#kpPanelNote', veil).textContent = `«${panelNoteText(currentPanelNote, $('#kpNote', veil).value, tag)}»`;
        }
        summary.textContent = text;
        summaryBox.classList.toggle('due', curStatus === 'due');
        summaryBox.classList.toggle('paid', curStatus === 'paid');
        $('#kpSave', veil).classList.toggle('due', curStatus === 'due');
        $('#kpSave', veil).classList.toggle('paid', curStatus === 'paid');
        autoHelpText();
      };
      const toggle = (s) => {
        curStatus = s;
        $$('.kxpay-tabs [data-st]', veil).forEach((b) => b.classList.toggle('on', b.dataset.st === s));
        $('#kpDateWrap', veil).style.display = s === 'paid' ? '' : 'none';
        if ($('#kpAutoWrap', veil)) $('#kpAutoWrap', veil).style.display = s === 'paid' ? '' : 'none';
        $('#kpMonthsLabel', veil).firstChild.textContent = s === 'paid' ? 'Quanti mesi ha pagato?' : 'Quanti mesi deve pagare?';
        $('#kpRemindWrap', veil).style.display = s === 'due' ? '' : 'none';
        updateSummary();
      };
      $$('.kxpay-tabs [data-st]', veil).forEach((b) => { b.onclick = () => toggle(b.dataset.st); });
      date.oninput = () => { dateEdited = true; updateSummary(); };
      months.oninput = () => {
        if (!dateEdited) date.value = addMonths(+months.value || 0);
        $$('[data-kp-months]', veil).forEach((b) => b.classList.toggle('on', +b.dataset.kpMonths === +months.value));
        updateSummary();
      };
      $$('[data-kp-months]', veil).forEach((b) => { b.onclick = () => { months.value = b.dataset.kpMonths; months.dispatchEvent(new Event('input', { bubbles: true })); }; });
      ['kpAmount', 'kpNote', 'kpRemind', 'kpAutoOpt', 'kpAutoMonths'].forEach((id) => {
        const control = $('#' + id, veil);
        control?.addEventListener('input', updateSummary);
        control?.addEventListener('change', updateSummary);
      });
      $('#kpAutoOn', veil)?.addEventListener('change', (e) => {
        const control = $('#kpAutoMonths', veil) || $('#kpAutoOpt', veil);
        if (control) control.disabled = !e.target.checked;
        updateSummary();
      });
      const autoCtl = $('#kpAutoMonths', veil) || $('#kpAutoOpt', veil);
      if (autoCtl) autoCtl.disabled = !$('#kpAutoOn', veil).checked;
      updateSummary();
      $('#kpCancel', veil).onclick = close;
      veil.onclick = (e) => { if (e.target === veil) close(); };
      $('#kpDelete', veil).onclick = async () => {
        if (!old) return;
        try {
          const result = await api('PUT', '/admin/payments', { kind, panel, ref, label, status: '', ownerId });
          cache.at = 0; await load(true); close();
          if (result.panelNote?.ok) toast(result.panelNote.where === 'panel' ? `Nota rimossa su ${result.panelNote.panelName}` : `Nota rimossa in KAIROS (${result.panelNote.panelName} non ha le note)`);
          else if (result.panelNote) toast(`Promemoria tolto, ma la nota non è stata aggiornata su ${result.panelNote.panelName}: ${result.panelNote.error}`, 1);
          else toast('Promemoria tolto');
        }
        catch (e) { toast(e.message, 1); }
      };
      $('#kpSave', veil).onclick = async () => {
        const n = Number(months.value), av = $('#kpAmount', veil).value.trim(), amount = av ? Number(av) : null, note = $('#kpNote', veil).value.trim();
        if (!Number.isInteger(n) || n < 0 || n > 120) return toast('I mesi devono essere da 0 a 120', 1);
        if (amount !== null && (!Number.isFinite(amount) || amount < 0 || amount > 100000)) return toast('Importo non valido (da 0 a 100000 €)', 1);
        if (note.length > 200) return toast('La nota può contenere al massimo 200 caratteri', 1);
        const paidUntil = curStatus === 'paid' ? date.value || addMonths(n) : '';
        if (curStatus === 'paid' && !/^\d{4}-\d{2}-\d{2}$/.test(paidUntil)) return toast('Scegli la data «Pagato fino al»', 1);
        try {
          const autoOn = $('#kpAutoOn', veil)?.checked;
          const autoBody = canAuto ? {
            autoMonths: autoOn && $('#kpAutoMonths', veil) ? Number($('#kpAutoMonths', veil).value) : 0,
            autoOpt: autoOn && $('#kpAutoOpt', veil) ? $('#kpAutoOpt', veil).value : '',
            autoLine: autoOn ? $('#kpAutoLine', veil).value : ''
          } : {};
          if (autoOn && kind === 'line' && !autoBody.autoLine) return toast('Linea non valida per il rinnovo automatico', 1);
          if (autoOn && packageTarget && !autoBody.autoOpt) return toast('Scegli il pacchetto per il rinnovo automatico', 1);
          const result = await api('PUT', '/admin/payments', { kind, panel, ref, ownerId, label, status: curStatus, months: n, amount, note, paidUntil, remind: curStatus === 'due' ? $('#kpRemind', veil).checked : row.remind !== 0, ...autoBody });
          cache.at = 0; await load(true); close();
          if (result.panelNote?.ok && result.panelNote.where === 'panel') toast(`Nota scritta anche su ${result.panelNote.panelName}`);
          else if (result.panelNote?.ok) toast(`Nota salvata in KAIROS (${result.panelNote.panelName} non ha le note)`);
          else if (result.panelNote) toast(`Pagamento salvato, ma non sono riuscito a scrivere la nota su ${result.panelNote.panelName}: ${result.panelNote.error}`, 1);
          else toast(curStatus === 'due' ? 'Pagamento segnato: deve pagare' : 'Pagamento registrato');
        } catch (e) { toast(e.message, 1); }
      };
    });
  }
  const rows = () => cache.rows.map(effective);
  const dueRows = () => rows().filter((r) => r.status === 'due');
  const agentId = () => isAgent() ? +((D.me || {}).id) || 0 : 0;
  const ledgerNumber = (n) => (+n || 0).toLocaleString('it-IT', { maximumFractionDigits: 2 });
  const ledgerCreditTotal = (balance) => Object.values(balance && balance.credits || {}).reduce((n, x) => n + Math.max(0, +x || 0), 0);
  const ledgerHasDebt = (balance) => !!balance && (+balance.eur > 0 || Object.values(balance.credits || {}).some((x) => +x > 0));
  const ledgerPositiveText = (balance) => {
    const parts = [];
    if (+balance?.eur > 0) parts.push(`${ledgerNumber(balance.eur)} €`);
    const panels = { wolf: 'WOLF', armada: 'Armada', storm: 'Storm', atx: 'Atlantix', ro: 'Realott', slt: 'SLT' };
    for (const [panel, value] of Object.entries(balance?.credits || {})) if (+value > 0) parts.push(`${ledgerNumber(value)} crediti${panel ? ' ' + (panels[panel] || panel) : ''}`);
    return parts.join(' e ');
  };
  const ledgerPanelText = (p) => ({ '': 'Generico', wolf: 'WOLF', armada: 'Armada', storm: 'Storm', atx: 'Atlantix', ro: 'Realott', slt: 'SLT' }[p || ''] || p);
  function ledgerHistory(entries, deletable = false) {
    if (!entries || !entries.length) return '<div class="mut" style="padding:12px 4px">Nessun movimento registrato.</div>';
    return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Data</th><th>Tipo</th><th>€</th><th>Crediti</th><th>Nota</th>${deletable ? '<th></th>' : ''}</tr></thead><tbody>${entries.map((e) => `<tr><td>${new Date(+e.t).toLocaleDateString('it-IT')}</td><td style="color:${e.type === 'debt' ? '#ff8f8f' : '#6ee3a6'}">${e.type === 'debt' ? 'Debito' : 'Pagamento'}</td><td>${+e.eur ? ledgerNumber(e.eur) : '—'}</td><td>${+e.credits ? `${ledgerNumber(e.credits)} cr${e.panel ? ' · ' + escP(ledgerPanelText(e.panel)) : ''}` : '—'}</td><td>${escP(e.note || '')}</td>${deletable ? `<td><button class="btn sm danger" data-ledger-delete="${e.id}" title="Elimina movimento">🗑</button></td>` : ''}</tr>`).join('')}</tbody></table></div>`;
  }
  async function refreshLedger() {
    await loadLedger(true);
    if ($('#v-payments')?.classList.contains('on')) renderPage();
    window.dispatchEvent(new CustomEvent('kxledger:update'));
  }
  function promptLedgerEntry(agent, type) {
    const title = type === 'debt' ? 'Aggiungi debito' : 'Registra pagamento';
    ask(title, `<label class="lbl">Euro</label><input class="inp" id="payLedgerEur" type="number" min="0" max="100000" step="0.01"><label class="lbl">Crediti</label><div style="display:flex;gap:8px"><input class="inp" id="payLedgerCredits" type="number" min="0" max="1000000" step="0.01" style="flex:1"><select class="inp" id="payLedgerPanel"><option value="">Generico</option><option value="wolf">WOLF</option><option value="armada">Armada</option><option value="storm">Storm</option><option value="atx">Atlantix</option><option value="ro">Realott</option><option value="slt">SLT</option></select></div><label class="lbl">Nota</label><input class="inp" id="payLedgerNote" maxlength="200">`, 'Salva').then(async (ok) => {
      if (!ok) return;
      const eur = Number($('#payLedgerEur').value), credits = Number($('#payLedgerCredits').value), note = $('#payLedgerNote').value.trim();
      if (!Number.isFinite(eur) || eur < 0 || eur > 100000 || !Number.isFinite(credits) || credits < 0 || credits > 1000000 || !(eur > 0 || credits > 0) || note.length > 200) return toast('Controlla importi e nota', 1);
      try {
        await api('POST', '/admin/agent-ledger', { agent: agent.id, type, eur, credits, panel: $('#payLedgerPanel').value, note });
        await refreshLedger(); toast(type === 'debt' ? 'Debito aggiunto' : 'Pagamento registrato');
      } catch (e) { toast(e.message, 1); }
    });
  }
  async function openAgentLedger(agent) {
    let data;
    try { data = await api('GET', `/admin/agent-ledger?agent=${agent.id}`); } catch (e) { toast(e.message, 1); return; }
    const pr = ask(`Storico · ${agent.username}`, ledgerHistory(data.entries, true), 'Chiudi');
    const bind = () => $$('#mB [data-ledger-delete]').forEach((button) => {
      button.onclick = async () => {
        const entry = data.entries.find((x) => String(x.id) === button.dataset.ledgerDelete);
        if (!entry || !window.confirm('Eliminare questo movimento?')) return;
        try {
          await api('DELETE', `/admin/agent-ledger/${entry.id}`);
          data = await api('GET', `/admin/agent-ledger?agent=${agent.id}`);
          $('#mB').innerHTML = ledgerHistory(data.entries, true);
          bind();
          await refreshLedger();
        } catch (e) { toast(e.message, 1); }
      };
    });
    bind();
    await pr;
  }
  function renderMenuCount() {
    const b = $('#payCount'), n = dueRows().length; if (!b) return;
    b.textContent = n > 99 ? '99+' : String(n);
    b.style.display = n ? '' : 'none'; b.classList.toggle('on', !!n);
  }
  function refreshOpenBoxes() {
    for (const id of ['ePayBadge', 'cPayBadge']) {
      const box = $('#' + id), button = box && box.parentElement.querySelector('[data-kxpay-open]');
      if (box && button) box.innerHTML = badge(button.dataset.kind, button.dataset.panel, button.dataset.ref);
    }
    const info = $('#agPayInfo'), button = $('#agPayBox [data-kxpay-open]');
    if (info && button) {
      const r = get('agent', '', button.dataset.ref);
      info.textContent = r ? `${amountText(r.amount) || 'Importo non indicato'}${r.note ? ' · ' + r.note : ''}` : 'Nessun debito registrato.';
    }
  }
  function maybeRemind() {
    const list = dueRows().filter((r) => r.remind !== 0);
    const failures = rows().filter((r) => String(r.last_result || '').startsWith('Errore') && Date.now() - (+r.updated || 0) < 48 * 3600e3);
    const balance = isAgent() && ledgerCache.own && ledgerCache.own.balance;
    const debt = ledgerHasDebt(balance);
    if (!list.length && !failures.length && !debt) { $('#kxPayBanner')?.remove(); return; }
    const k = `kx-pay-remind-${isAgent() ? 'agent-' + agentId() : 'owner'}`;
    let seen = 0; try { seen = +localStorage.getItem(k) || 0; } catch {}
    if (Date.now() - seen < 48 * 3600e3) return;
    const total = list.reduce((a, r) => a + (+r.amount || 0), 0);
    const paymentText = debt
      ? `Devi pagare ${ledgerPositiveText(balance)} al tuo fornitore`
      : list.length ? `💰 ${list.length} clienti devono ancora pagare (totale ${amountText(total) || '0 €'})` : '';
    const text = [paymentText, failures.length ? `${failures.length} rinnovi automatici non riusciti` : ''].filter(Boolean).join(' · ');
    let b = $('#kxPayBanner');
    if (!b) {
      b = document.createElement('div'); b.id = 'kxPayBanner';
      b.style.cssText = 'display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:0 0 14px;padding:12px 14px;border-radius:12px;background:rgba(220,38,38,.16);border:1px solid rgba(239,68,68,.45);color:#ffd2d2';
      const top = $('.topbar'); if (top) top.after(b); else $('main').prepend(b);
    }
    b.innerHTML = `<b style="flex:1;min-width:220px">${escP(text)}</b><button class="btn sm" id="kxPayOpen">Apri Pagamenti</button><button class="icb" id="kxPayClose" aria-label="Chiudi">×</button>`;
    $('#kxPayOpen').onclick = () => { const n = $('.nav[data-v="payments"]'); if (n) n.click(); };
    $('#kxPayClose').onclick = () => b.remove();
    try { localStorage.setItem(k, String(Date.now())); } catch {}
  }
  function typeText(r) { return r.kind === 'device' ? 'Cliente KAIROS' : r.kind === 'agent' ? 'Ti deve' : (r.panel || '').toUpperCase(); }
  function rowFromKey(key) { const [kind, panel, ...rest] = String(key).split('|'); return get(kind, panel, rest.join('|')); }
  function table(list, due) {
    if (!list.length) return '<div class="mut" style="padding:18px 4px">Nessun pagamento in questa scheda.</div>';
    return `<div class="tbl-wrap"><table class="tbl"><thead><tr>${due ? '<th>Tipo / pannello</th><th>Cliente o linea</th><th>Mesi</th><th>Importo</th><th>Da</th><th></th>' : '<th>Cliente o linea</th><th>Importo</th><th>Pagato fino al</th><th>Scadenza</th><th></th>'}</tr></thead><tbody>${list.map((r) => {
      const key = escP(rowKey(r.kind, r.panel, r.ref));
      const editable = canEdit() && (!isAgent() || r.kind !== 'agent');
      if (due) return `<tr><td>${escP(typeText(r))}</td><td><b>${escP(r.label || r.ref)}</b>${r.note ? `<small style="display:block;margin-top:3px;color:var(--mut)">${escP(r.note)}</small>` : ''}</td><td>${+r.months || 0}</td><td>${amountText(r.amount) || '—'}</td><td>${daysSince(r)} ${daysSince(r) === 1 ? 'giorno' : 'giorni'}</td><td style="white-space:nowrap">${editable ? `<button class="btn sm pri" data-paid="${key}">Ha pagato</button> <button class="btn sm" data-remind="${key}">Togli promemoria</button>` : ''}</td></tr>`;
      const left = daysLeft(r.paid_until), remaining = left == null ? '—' : left === 0 ? 'oggi' : remainingText(r.paid_until);
      return `<tr><td><b>${escP(r.label || r.ref)}</b><small style="display:block;margin-top:3px;color:var(--mut)">${escP(typeText(r))}${r.note ? ' · ' + escP(r.note) : ''}</small></td><td>${amountText(r.amount) || '—'}</td><td>${escP(dateText(r.paid_until) || '—')}</td><td>${remaining}</td><td>${editable ? `<button class="btn sm" data-edit="${key}">Modifica</button>` : ''}</td></tr>`;
    }).join('')}</tbody></table></div>`;
  }
  function agentRows() {
    const agents = (D.agents || []).filter((a) => a.active !== 0), summary = new Map(ledgerCache.summary.map((x) => [String(x.agentId), x]));
    const euro = ledgerCache.summary.reduce((n, x) => n + Math.max(0, +x.eur || 0), 0);
    const credits = ledgerCache.summary.reduce((n, x) => n + Object.values(x.credits || {}).reduce((m, v) => m + Math.max(0, +v || 0), 0), 0);
    return `<div style="margin:8px 0 12px"><b>Ti devono: ${escP(amountText(euro) || '0 €')} · ${escP(ledgerNumber(credits))} crediti</b></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Agente</th><th>Saldo €</th><th>Crediti</th><th>Ultimo movimento</th><th></th></tr></thead><tbody>${agents.map((a) => {
      const s = summary.get(String(a.id)), credit = Object.entries(s?.credits || {}).filter(([, v]) => +v).map(([p, v]) => `${ledgerNumber(v)} cr${p ? ' · ' + escP(ledgerPanelText(p)) : ''}`).join('<br>') || '—';
      return `<tr><td><b>${escP(a.username)}</b></td><td>${s ? `${ledgerNumber(s.eur)} €` : '0 €'}</td><td>${credit}</td><td>${s?.last ? new Date(+s.last).toLocaleDateString('it-IT') : '—'}</td><td style="white-space:nowrap"><button class="btn sm" data-agent-ledger-add="${a.id}">➕ Aggiungi debito</button> <button class="btn sm pri" data-agent-ledger-pay="${a.id}">✅ Registra pagamento</button> <button class="btn sm" data-agent-ledger-history="${a.id}">Storico</button></td></tr>`;
    }).join('')}</tbody></table></div>`;
  }
  function autoTable(list) {
    if (!list.length) return '<div class="mut" style="padding:18px 4px">Nessun rinnovo automatico configurato.</div>';
    return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Cliente/linea</th><th>Pannello</th><th>Ogni</th><th>Pagato fino al</th><th>Ultimo rinnovo</th><th>Esito</th><th></th></tr></thead><tbody>${list.map((r) => {
      const key = escP(rowKey(r.kind, r.panel, r.ref)), result = String(r.last_result || '—'), bad = /^(Errore|Fermo)/.test(result);
      const period = +r.auto_months ? `${r.auto_months} ${+r.auto_months === 1 ? 'mese' : 'mesi'}` : `Pacchetto ${r.auto_opt}`;
      return `<tr><td><b>${escP(r.label || r.ref)}</b></td><td>${r.kind === 'device' ? 'KAIROS' : escP(r.panel)}</td><td>${escP(period)}</td><td>${escP(dateText(r.paid_until) || '—')}</td><td>${escP(dateText(r.last_renew) || '—')}</td><td style="${bad ? 'color:#ff8f8f' : ''}">${escP(result)}</td><td><button class="btn sm" data-auto-edit="${key}">Modifica</button></td></tr>`;
    }).join('')}</tbody></table></div>`;
  }
  let pageTab = 'due';
  function renderPage() {
    const V = $('#v-payments'); if (!V || !V.classList.contains('on')) return;
    const all = rows(), clients = all.filter((r) => r.kind !== 'agent');
    const due = clients.filter((r) => r.status === 'due'), paid = clients.filter((r) => r.status === 'paid');
    const master = !isAgent(), total = due.reduce((a, r) => a + (+r.amount || 0), 0);
    const autoRows = clients.filter((r) => +r.auto_months > 0 || !!r.auto_opt);
    const ownBalance = !master && ledgerCache.own && ledgerCache.own.balance;
    const debtBox = ledgerHasDebt(ownBalance) ? `<div style="margin-bottom:14px;padding:12px 14px;border-radius:12px;background:rgba(220,38,38,.16);border:1px solid rgba(239,68,68,.45);color:#ffd2d2"><b>Devi pagare ${escP(ledgerPositiveText(ownBalance))} al tuo fornitore</b> <button class="btn sm" id="payLedgerHistory">Storico</button></div>` : '';
    if (pageTab === 'agents' && !master) pageTab = 'due';
    V.innerHTML = `${debtBox}<div class="card glass"><div class="hd"><h3>💰 Pagamenti<small>Così sai sempre chi deve pagare e chi ha già pagato</small></h3></div>
      <div class="filters"><button class="fchip ${pageTab === 'due' ? 'on' : ''}" data-pt="due">Da pagare <span>${due.length}</span></button><button class="fchip ${pageTab === 'paid' ? 'on' : ''}" data-pt="paid">Pagati <span>${paid.length}</span></button>${master ? `<button class="fchip ${pageTab === 'agents' ? 'on' : ''}" data-pt="agents">Agenti <span>${ledgerCache.summary.length}</span></button>` : `<button class="fchip ${pageTab === 'ledger' ? 'on' : ''}" data-pt="ledger">Storico <span>${ledgerCache.own?.entries?.length || 0}</span></button>`}<button class="fchip ${pageTab === 'auto' ? 'on' : ''}" data-pt="auto">🔁 Rinnovi automatici <span>${autoRows.length}</span></button></div>
      ${pageTab === 'due' ? `<div style="margin:8px 0 12px"><b>Totale da riscuotere: ${amountText(total) || '0 €'}</b></div>${table(due, true)}` : pageTab === 'paid' ? table(paid, false) : pageTab === 'auto' ? autoTable(autoRows) : master ? agentRows() : ledgerHistory(ledgerCache.own?.entries || [])}</div>`;
    $$('[data-pt]', V).forEach((b) => { b.onclick = () => { pageTab = b.dataset.pt; renderPage(); }; });
    $$('[data-paid]', V).forEach((b) => { b.onclick = () => { const r = rowFromKey(b.dataset.paid); if (r) open(r.kind, r.panel, r.ref, r.label, r.owner_id, 'paid'); }; });
    $$('[data-edit]', V).forEach((b) => { b.onclick = () => { const r = rowFromKey(b.dataset.edit); if (r) open(r.kind, r.panel, r.ref, r.label, r.owner_id); }; });
    $$('[data-auto-edit]', V).forEach((b) => { b.onclick = () => { const r = rowFromKey(b.dataset.autoEdit); if (r) open(r.kind, r.panel, r.ref, r.label, r.owner_id, r.status, r.auto_line); }; });
    $$('[data-remind]', V).forEach((b) => { b.onclick = async () => { const r = rowFromKey(b.dataset.remind); if (!r) return; try { await api('PUT', '/admin/payments', { kind: r.kind, panel: r.panel, ref: r.ref, label: r.label, ownerId: r.owner_id, status: r.status, months: r.months, amount: r.amount, note: r.note, remind: false }); cache.at = 0; await load(true); toast('Promemoria disattivato'); } catch (e) { toast(e.message, 1); } }; });
    $$('[data-agent-ledger-add]', V).forEach((b) => { b.onclick = () => { const agent = (D.agents || []).find((x) => String(x.id) === b.dataset.agentLedgerAdd); if (agent) promptLedgerEntry(agent, 'debt'); }; });
    $$('[data-agent-ledger-pay]', V).forEach((b) => { b.onclick = () => { const agent = (D.agents || []).find((x) => String(x.id) === b.dataset.agentLedgerPay); if (agent) promptLedgerEntry(agent, 'pay'); }; });
    $$('[data-agent-ledger-history]', V).forEach((b) => { b.onclick = () => { const agent = (D.agents || []).find((x) => String(x.id) === b.dataset.agentLedgerHistory); if (agent) openAgentLedger(agent); }; });
    $('#payLedgerHistory') && ($('#payLedgerHistory').onclick = () => { pageTab = 'ledger'; renderPage(); });
  }
  function openOwnLedgerHistory() {
    const n = $('.nav[data-v="payments"]'); if (n) n.click();
    pageTab = 'ledger';
    renderPage();
  }
  function renderAgentDebtDash() {
    const V = $('#v-dash');
    if (!V) return;
    const balance = isAgent() && ledgerCache.own && ledgerCache.own.balance;
    if (!ledgerHasDebt(balance)) { $('#kxAgentDebtDash')?.remove(); return; }
    let box = $('#kxAgentDebtDash');
    if (!box) { box = document.createElement('div'); box.id = 'kxAgentDebtDash'; box.className = 'card glass'; }
    box.style.cssText = 'display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:0 0 14px;padding:12px 14px;border-radius:12px;background:rgba(220,38,38,.16);border:1px solid rgba(239,68,68,.45);color:#ffd2d2';
    box.innerHTML = `<b style="flex:1;min-width:220px">💰 Devi pagare ${escP(ledgerPositiveText(balance))} al tuo fornitore</b><button class="btn sm" id="kxAgentDebtHistory">Storico</button>`;
    if (box.parentElement !== V || V.firstElementChild !== box) V.prepend(box);
    $('#kxAgentDebtHistory', box).onclick = openOwnLedgerHistory;
  }
  function saveDue(kind, panel, ref, label, ownerId, months = 1, amount = null, note = '') {
    return api('PUT', '/admin/payments', { kind, panel, ref, label, ownerId, status: 'due', months, amount, note, remind: true }).then(async (r) => { cache.at = 0; await load(true); return r; });
  }
  function duePrompt(prefix, months = 1) {
    if (!canEdit()) return '';
    return `<div style="margin-top:12px;padding:10px 12px;border:1px solid var(--line);border-radius:10px"><label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="${escP(prefix)}On"> Non ha ancora pagato</label><div style="display:flex;gap:8px;margin-top:8px"><label>Mesi<input class="inp" type="number" id="${escP(prefix)}Months" min="0" max="120" value="${+months || 0}" style="width:90px;margin:0"></label><label>Importo € (facoltativo)<input class="inp" type="number" id="${escP(prefix)}Amount" min="0" max="100000" step="0.01" style="width:140px;margin:0"></label></div></div>`;
  }
  function readDuePrompt(prefix) {
    const on = $('#' + prefix + 'On'); if (!on || !on.checked) return null;
    const months = Number($('#' + prefix + 'Months').value), av = $('#' + prefix + 'Amount').value.trim(), amount = av ? Number(av) : null;
    if (!Number.isInteger(months) || months < 0 || months > 120) { toast('I mesi devono essere da 0 a 120', 1); return false; }
    if (amount !== null && (!Number.isFinite(amount) || amount < 0 || amount > 100000)) { toast('Importo non valido (da 0 a 100000 €)', 1); return false; }
    return { months, amount };
  }
  function panelTile(panel) {
    const n = rows().filter((r) => r.kind === 'line' && r.panel === panel && r.status === 'due').length;
    return `<button type="button" class="pay-panel-tile" data-kxpay-filter="${escP(panel)}"><span>💰 ${n} da pagare</span></button>`;
  }
  new MutationObserver(() => { if ($('#v-payments')?.classList.contains('on')) renderPage(); }).observe($('#v-payments'), { attributes: true, attributeFilter: ['class'] });
  window.addEventListener('kxpay:update', () => { renderMenuCount(); refreshOpenBoxes(); if ($('#v-payments')?.classList.contains('on')) renderPage(); });
  window.addEventListener('kxledger:update', renderAgentDebtDash);
  const dash = $('#v-dash'); if (dash) new MutationObserver(renderAgentDebtDash).observe(dash, { childList: true });
  Object.assign(TITLES, { payments: 'Pagamenti' });
  window.KXPay = { load, loadLedger, get, hasRows: () => cache.rows.length > 0 || !!(ledgerCache.own && ledgerCache.own.entries && ledgerCache.own.entries.length), effective, badge, open, isDue, filterDue, daysSince, amountText, dateText, remainingText, canEdit, saveDue, duePrompt, readDuePrompt, panelTile, renderPage, ownDebtText: () => { const balance = isAgent() && ledgerCache.own && ledgerCache.own.balance; return ledgerHasDebt(balance) ? ledgerPositiveText(balance) : ''; }, openOwnLedgerHistory };
  renderAgentDebtDash();
  document.addEventListener('click', (e) => {
    const del = e.target.closest('[data-kxpay-delete]');
    if (del) {
      e.preventDefault();
      api('PUT', '/admin/payments', { kind: del.dataset.kind, panel: del.dataset.panel, ref: del.dataset.ref, status: '' })
        .then(() => { cache.at = 0; return load(true); }).then(() => toast('Debito tolto')).catch((e2) => toast(e2.message, 1));
      return;
    }
    const b = e.target.closest('[data-kxpay-open]'); if (!b) return;
    e.preventDefault(); open(b.dataset.kind, b.dataset.panel, b.dataset.ref, b.dataset.label, +b.dataset.owner || 0, b.dataset.status || '', b.dataset.autoLine || '', b.dataset.panelNote);
  });
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-kxpay-filter]'); if (!b) return;
    window.dispatchEvent(new CustomEvent('kxpay:filter', { detail: { panel: b.dataset.kxpayFilter } }));
  });
  window.addEventListener('kxpay:update', () => { if (window.renderDevices) renderDevices(); });
  load();
})();
