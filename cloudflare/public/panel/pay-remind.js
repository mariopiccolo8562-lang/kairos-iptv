/* KAIROS Control — Solo Master → Impostazioni → «🔔 Promemoria pagamenti» (10 novembre 2026).
   Decide tutto il titolare:
   - il promemoria proposto quando segna «deve pagare» (lui ha sempre tutte le opzioni, cliente per cliente);
   - cosa possono usare gli agenti, uguale per tutti: interruttore generale e un interruttore per ogni opzione
     (una volta sola, ogni giorno, ogni 2 giorni, ogni 3 giorni, ogni settimana, «dal giorno…»).
   Per gli agenti parte tutto spento; ⭐ = consigliato, con «Attiva le consigliate». Ogni scelta si salva subito.
   Il server controlla comunque: un agente non può usare un'opzione spenta. Usa app.js ($, esc, api, view, toast, D, TITLES). */
(() => {
  if (!$('#side')) return;
  const css = document.createElement('style');
  css.textContent = `
#v-set-pay .pr-card{margin-bottom:16px}
#v-set-pay .pr-lead{color:var(--mut);font-size:13.5px;line-height:1.5;margin:4px 0 0}
#v-set-pay .pr-chips{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 6px}
#v-set-pay .pr-chips button{min-height:38px;padding:0 13px;border-radius:11px;border:1px solid var(--line);background:rgba(255,255,255,.04);color:var(--txt,#e8eef8);font:inherit;font-size:13.5px;font-weight:700;cursor:pointer}
#v-set-pay .pr-chips button.on{background:#f59e0b;border-color:#fcd34d;color:#1a1204}
#v-set-pay .pr-chips button[data-def="-1"].on{background:#475569;border-color:#94a3b8;color:#fff}
#v-set-pay .pr-row{display:grid;grid-template-columns:auto minmax(0,1fr);gap:12px;align-items:start;padding:14px 0;border-top:1px solid var(--line)}
#v-set-pay .pr-row:first-child{border-top:0}
#v-set-pay .pr-row.main{padding:16px;border:1px solid var(--line);border-radius:14px;background:rgba(255,255,255,.03)}
#v-set-pay .pr-row.main.on{border-color:#0d9488;background:linear-gradient(115deg,#0d343988,#15243188)}
#v-set-pay .pr-t{font-weight:800;font-size:14.5px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
#v-set-pay .pr-t .st{font-size:11px;font-weight:800;padding:2px 8px;border-radius:999px;background:#475569;color:#fff}
#v-set-pay .pr-row.on .pr-t .st{background:#0d9488}
#v-set-pay .pr-star{font-size:11px;font-weight:800;padding:2px 8px;border-radius:999px;background:#78350f88;border:1px solid #f59e0b88;color:#fcd34d}
#v-set-pay .pr-d{margin-top:6px;font-size:13px;line-height:1.5;color:var(--mut)}
#v-set-pay .pr-d b{color:var(--txt,#e8eef8);font-weight:700}
#v-set-pay .pr-list.dim .pr-row{opacity:.5}
#v-set-pay .pr-wait{font-size:12.5px;color:#fbbf24;margin:10px 0 0}
#v-set-pay .pr-acts{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
#v-set-pay .pr-sum{margin-top:14px;padding:12px 14px;border-radius:12px;border:1px solid #80631e;border-left:3px solid #fbbf24;background:linear-gradient(115deg,#3b2c13,#28251d);color:#f5e5b8;font-size:13.5px;line-height:1.5}
#v-set-pay .pr-info{display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:13px;color:var(--mut);margin:12px 0 4px}
.pr-sw{appearance:none;-webkit-appearance:none;position:relative;flex:0 0 46px;width:46px;height:26px;margin:2px 0 0;border:1px solid #66758a;border-radius:999px;background:#394456;cursor:pointer;transition:background .18s,border-color .18s}
.pr-sw::before{content:"";position:absolute;top:2px;left:2px;width:20px;height:20px;border-radius:50%;background:#e2e8f0;box-shadow:0 1px 4px #0008;transition:transform .18s}
.pr-sw:checked{background:#0d9488;border-color:#5eead4}.pr-sw:checked::before{transform:translateX(20px)}
.pr-sw:focus-visible{outline:2px solid #5eead4;outline-offset:2px}
@media (max-width:700px){#v-set-pay .pr-chips button{flex:1 1 40%}}`;
  document.head.appendChild(css);

  const IC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>';
  if (!$('.nav[data-v="set-pay"]')) {
    const b = document.createElement('button'); b.className = 'nav'; b.dataset.v = 'set-pay'; b.innerHTML = IC + 'Promemoria pagamenti'; b.onclick = () => view('set-pay');
    const ref = $('.nav[data-v="set-sec"]'); ref ? ref.before(b) : $('#side').appendChild(b);
    const sec = document.createElement('section'); sec.className = 'view'; sec.id = 'v-set-pay'; ($('#v-settings') || $('#v-dash')).after(sec);
  }
  if (typeof TITLES === 'object') TITLES['set-pay'] = 'Promemoria pagamenti';
  const V = $('#v-set-pay');
  const isOwner = () => typeof D === 'object' && D && D.role !== 'agent';

  // frequenze per «Per te» (-1 = spento) e opzioni per gli agenti: [chiave, nome, consigliata, se acceso, se spento]
  const DEFS = [[-1, 'Spento'], [0, 'Una volta sola'], [1, 'Ogni giorno'], [2, 'Ogni 2 giorni'], [3, 'Ogni 3 giorni'], [7, 'Ogni settimana']];
  const OPTS = [
    ['d0', 'Una volta sola', false, 'l\'agente può farsi ricordare un cliente <b>una volta sola</b>, nel giorno che sceglie (oppure domani).', 'non può scegliere «Una volta sola».'],
    ['d1', 'Ogni giorno', false, 'può farsi ricordare un cliente <b>tutti i giorni</b> finché non paga.', 'non può scegliere «Ogni giorno».'],
    ['d2', 'Ogni 2 giorni', true, 'può farsi ricordare un cliente <b>ogni 2 giorni</b> finché non paga (come il promemoria di prima).', 'non può scegliere «Ogni 2 giorni».'],
    ['d3', 'Ogni 3 giorni', false, 'può farsi ricordare un cliente <b>ogni 3 giorni</b> finché non paga.', 'non può scegliere «Ogni 3 giorni».'],
    ['d7', 'Ogni settimana', true, 'può farsi ricordare un cliente <b>una volta a settimana</b> finché non paga.', 'non può scegliere «Ogni settimana».'],
    ['from', 'Dal giorno…', true, 'può scegliere <b>il giorno da cui partono</b> i promemoria (es. «mi paga il 15»).', 'i suoi promemoria partono sempre da quando segna «deve pagare».'],
  ];
  const DAYS_TXT = { 0: 'una volta sola', 1: 'ogni giorno', 2: 'ogni 2 giorni', 3: 'ogni 3 giorni', 7: 'ogni settimana' };
  const cfg = () => (window.KXPay && KXPay.remindCfg ? KXPay.remindCfg((D.settings || {}).payRemind) : { def: 2, ag: {} });
  let busy = false;

  async function save(patch, msg) {
    if (busy) return; busy = true;
    try {
      const r = await api('PUT', '/admin/settings', { payRemind: patch });
      D.settings = { ...(D.settings || {}), payRemind: (r.settings || {}).payRemind };
      toast(msg || 'Salvato');
    } catch (e) { toast(e.message, 1); }
    busy = false; render();
  }
  function summary(c) {
    const a = c.ag, days = [0, 1, 2, 3, 7].filter((d) => a['d' + d]);
    if (!a.on || !days.length) return `<b>Adesso gli agenti non hanno promemoria.</b> I loro clienti «deve pagare» restano in Pagamenti, ma il pannello non glieli ricorda.${a.on && !days.length ? ' (L\'interruttore generale è acceso, ma nessuna opzione: accendine almeno una.)' : ''}`;
    const def = days.includes(c.def) ? c.def : [2, 7, 3, 1, 0].find((d) => days.includes(d));
    const list = days.map((d) => DAYS_TXT[d]);
    return `<b>Adesso gli agenti possono usare:</b> ${list.join(', ')}${a.from ? ' e «dal giorno…»' : ''}.<br>Quando segnano «deve pagare» parte <b>${DAYS_TXT[def]}</b>${days.includes(c.def) ? ' (come il tuo)' : ' (la tua scelta non è accesa per loro: vale la prima accesa)'}; possono cambiarlo solo tra le opzioni accese.`;
  }
  function render() {
    if (!V.classList.contains('on')) return;
    if (!isOwner()) { V.innerHTML = ''; return; }
    const c = cfg(), a = c.ag;
    const ags = (D.agents || []).filter((x) => x.active !== 0), withPay = ags.filter((x) => x.perms && x.perms.payments).length;
    V.innerHTML = `<div class="card glass pr-card"><div class="hd"><h3>🔔 Promemoria pagamenti<small>Decidi tu ogni quanto il pannello ricorda chi deve pagare, e cosa possono usare gli agenti. Il promemoria compare in alto nel pannello nei giorni giusti, e in Pagamenti nell'elenco «Da ricordare oggi».</small></h3></div></div>
      <div class="card glass pr-card"><div class="hd"><h3>👤 Per te (Master)<small>Quando segni un cliente «deve pagare» ti propongo questo promemoria. Tu hai sempre tutte le opzioni e puoi cambiarle cliente per cliente nella finestra 💰 Pagamento.</small></h3></div>
        <div class="pr-chips" role="radiogroup" aria-label="Promemoria proposto">${DEFS.map(([d, l]) => `<button type="button" data-def="${d}" class="${c.def === d ? 'on' : ''}" aria-checked="${c.def === d}">${l}</button>`).join('')}</div>
        <p class="pr-lead">Adesso: ${c.def < 0 ? '<b>nessun promemoria</b> (lo accendi a mano cliente per cliente)' : `<b>${DAYS_TXT[c.def]}</b> finché non paga`}.</p></div>
      <div class="card glass pr-card"><div class="hd"><h3>🧑‍💼 Per gli agenti (uguale per tutti)<small>Partono tutte spente: decidi tu cosa accendere. ⭐ = consigliato. Il server controlla comunque: un agente non può usare un'opzione spenta.</small></h3></div>
        <div class="pr-row main${a.on ? ' on' : ''}"><input type="checkbox" class="pr-sw" id="prOn"${a.on ? ' checked' : ''} aria-label="Gli agenti possono usare i promemoria">
          <div><div class="pr-t">Gli agenti possono usare i promemoria <span class="st">${a.on ? 'ACCESO' : 'SPENTO'}</span></div>
          <div class="pr-d">✅ <b>Acceso</b>: gli agenti col permesso «Gestire i pagamenti» possono mettere un promemoria ai loro clienti, solo con le opzioni accese qui sotto.<br>⛔ <b>Spento</b>: nessun promemoria per gli agenti. I loro clienti «deve pagare» restano in Pagamenti, ma il pannello non glieli ricorda.</div></div></div>
        <div class="pr-info">👥 Agenti col permesso «Gestire i pagamenti»: <b>${withPay}</b> su ${ags.length}. Il permesso si dà nella pagina dell'agente.<button class="btn sm" type="button" id="prAg">Apri Agenti</button></div>
        <div class="pr-list${a.on ? '' : ' dim'}">${OPTS.map(([k, l, star, yes, no]) => `<div class="pr-row${a[k] ? ' on' : ''}"><input type="checkbox" class="pr-sw" data-opt="${k}"${a[k] ? ' checked' : ''} aria-label="${l}">
          <div><div class="pr-t">${l} <span class="st">${a[k] ? 'ACCESO' : 'SPENTO'}</span>${star ? '<span class="pr-star">⭐ consigliato</span>' : ''}</div>
          <div class="pr-d">✅ <b>Se lo accendi</b>: ${yes}<br>⛔ <b>Se lo spegni</b>: ${no}</div></div></div>`).join('')}</div>
        ${a.on ? '' : '<p class="pr-wait">Le opzioni qui sopra si possono già scegliere, ma valgono solo con «Gli agenti possono usare i promemoria» acceso.</p>'}
        <div class="pr-acts"><button class="btn pri" type="button" id="prRec">⭐ Attiva le consigliate</button><button class="btn" type="button" id="prOff">Spegni tutto</button></div>
        <div class="pr-sum">${summary(c)}</div></div>`;
  }
  V.addEventListener('click', (e) => {
    const t = e.target.closest('[data-def],#prRec,#prOff,#prAg'); if (!t || busy) return;
    if (t.id === 'prAg') return view('agents');
    if (t.id === 'prRec') return save({ ag: { on: true, d0: false, d1: false, d2: true, d3: false, d7: true, from: true } }, 'Accese le consigliate: ogni 2 giorni, ogni settimana e «dal giorno…»');
    if (t.id === 'prOff') return save({ ag: { on: false, d0: false, d1: false, d2: false, d3: false, d7: false, from: false } }, 'Promemoria degli agenti spenti');
    if (t.dataset.def !== undefined) return save({ def: +t.dataset.def }, 'Promemoria proposto salvato');
  });
  V.addEventListener('change', (e) => {
    const t = e.target; if (busy) { render(); return; }
    if (t.id === 'prOn') return save({ ag: { on: t.checked } }, t.checked ? 'Promemoria degli agenti accesi' : 'Promemoria degli agenti spenti');
    if (t.dataset.opt) return save({ ag: { [t.dataset.opt]: t.checked } }, `${(OPTS.find((o) => o[0] === t.dataset.opt) || [])[1]}: ${t.checked ? 'acceso' : 'spento'}`);
  });
  const v0 = window.view;
  window.view = view = function (v) { v0(v); if (v === 'set-pay') render(); };
  new MutationObserver(() => { if (V.classList.contains('on')) render(); }).observe(V, { attributes: true, attributeFilter: ['class'] });
  const appEl = $('#app');
  if (appEl) new MutationObserver(() => { if (!appEl.classList.contains('on')) V.innerHTML = ''; }).observe(appEl, { attributes: true, attributeFilter: ['class'] });
})();
