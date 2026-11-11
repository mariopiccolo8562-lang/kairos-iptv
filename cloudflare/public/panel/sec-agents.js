/* KAIROS Control — «Accesso degli agenti» in Impostazioni → Sicurezza e account (11 novembre 2026).
   Tre protezioni in più per agenti e sotto-agenti, spente finché il titolare non le accende:
   - «Accesso di 7 giorni»: 7 giorni dopo l'accesso l'agente rientra con link e codice (o utente e password);
   - «Massimo 2 dispositivi per agente»: al terzo accesso si scollega il dispositivo entrato per primo;
   - «Solo da questi Paesi»: gli agenti entrano e lavorano solo dai Paesi scelti (di serie l'Italia).
   Il titolare non è toccato da nessuna delle tre. Server: PUT /api/admin/settings { agSec: { week, two, geo, cc } }.
   Usa app.js ($, esc, api, toast, ask, D, renderSecurity). */
(() => {
  const css = document.createElement('style');
  css.textContent = `#agSecCard{grid-column:1/-1}
#agSecCard .ags-g{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}#agSecCard .ags-g .tog{margin:0;align-items:flex-start}
@media (max-width:1100px){#agSecCard .ags-g{grid-template-columns:1fr}}
#agSecCard .ags-cc{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:12px;padding:10px 12px;border:1px dashed var(--line);border-radius:12px}
#agSecCard .ags-cc.off{opacity:.6}#agSecCard .ags-cc>b{font-size:13px;margin-right:4px}
#agSecCard .ags-chip{display:inline-flex;align-items:center;gap:6px;padding:4px 6px 4px 10px;border-radius:999px;background:rgba(34,211,238,.12);border:1px solid rgba(34,211,238,.35);font-size:13px;font-weight:600}
#agSecCard .ags-chip button{border:0;background:transparent;color:var(--mut);cursor:pointer;font-size:15px;line-height:1;padding:0 4px;border-radius:999px}#agSecCard .ags-chip button:hover{color:#fca5a5}
#agSecCard .ags-cc select{width:auto;margin:0;padding:6px 10px;font-size:13px}
#agSecCard .ags-note{display:block;margin-top:10px;font-size:12.5px;color:var(--mut);line-height:1.5}`;
  document.head.appendChild(css);

  // Paesi proposti (Europa e vicini, poi i più comuni); il nome si legge in italiano dal browser
  const CC = ['IT', 'SM', 'VA', 'CH', 'FR', 'DE', 'AT', 'ES', 'PT', 'GB', 'IE', 'BE', 'NL', 'LU', 'MC', 'AD', 'LI', 'DK', 'SE', 'NO', 'FI', 'IS', 'PL', 'CZ', 'SK', 'HU', 'SI', 'HR', 'BA', 'RS', 'ME', 'MK', 'AL', 'XK', 'GR', 'MT', 'CY', 'RO', 'BG', 'MD', 'UA', 'LT', 'LV', 'EE', 'TR', 'MA', 'TN', 'DZ', 'EG', 'US', 'CA', 'MX', 'BR', 'AR', 'AU', 'AE', 'CN', 'IN', 'JP'];
  let DN = null; try { DN = new Intl.DisplayNames(['it'], { type: 'region' }); } catch {}
  const nm = (c) => { try { return (DN && DN.of(c)) || c; } catch { return c; } };
  const flag = (c) => (/^[A-Z]{2}$/.test(c) ? String.fromCodePoint(...[...c].map((x) => 127397 + x.charCodeAt(0))) : '');
  const DEF = { week: false, two: false, geo: false, cc: ['IT'] };
  const cur = () => { const x = (D.settings && D.settings.agSec) || {}; return { week: x.week === true, two: x.two === true, geo: x.geo === true, cc: Array.isArray(x.cc) && x.cc.length ? x.cc.slice() : DEF.cc.slice() }; };
  const owner = () => typeof D === 'object' && D && D.role !== 'agent' && !window.__assist && !D.demo;
  const names = (L) => L.map(nm).join(', ').replace(/, ([^,]*)$/, ' e $1');
  let busy = false;

  async function save(part, msg) {
    if (busy) return; busy = true;
    try {
      const r = await api('PUT', '/admin/settings', { agSec: part });
      if (r && r.settings) D.settings = r.settings; else D.settings.agSec = { ...cur(), ...part };
      toast(msg + (r && r.kicked ? ` · scollegati ${r.kicked} ${r.kicked === 1 ? 'dispositivo' : 'dispositivi'} in più` : ''));
    } catch (e) { toast(e.message, 1); }
    finally { busy = false; card(); }
  }

  function card() {
    const g = document.querySelector('.st-pane[data-pane="sec"] .st-g');
    let el = document.getElementById('agSecCard');
    if (!owner()) { if (el) el.remove(); return; }
    if (!g) return;
    if (!el) { el = document.createElement('div'); el.className = 'card glass'; el.id = 'agSecCard'; g.appendChild(el); }
    if (el.contains(document.activeElement) && document.activeElement.tagName === 'SELECT') return; // si sta scegliendo un Paese
    const s = cur();
    const tog = (k, on, t, d) => `<div class="tog ${on ? 'on' : ''}" data-ags="${k}" role="switch" aria-checked="${on}" tabindex="0"><div><b>${t}</b><small>${d}</small></div><i></i></div>`;
    el.innerHTML = `<div class="hd"><h3>Accesso degli agenti<small>Protezioni in più per agenti e sotto-agenti: le accendi tu. Tu (titolare) entri sempre come adesso, da qualunque Paese.</small></h3></div>
      <div class="ags-g">
        ${tog('week', s.week, 'Accesso di 7 giorni', s.week ? 'Acceso: 7 giorni dopo l\'accesso l\'agente rientra con il link e il codice (o utente e password). Se link e codice finiscono in mano a qualcuno, resta dentro al massimo una settimana.' : 'Spento: l\'accesso resta valido 30 giorni dall\'ultimo uso. Acceso: dopo 7 giorni dall\'accesso l\'agente rientra con link e codice.')}
        ${tog('two', s.two, 'Massimo 2 dispositivi per agente', s.two ? 'Acceso: al terzo accesso il dispositivo entrato per primo viene scollegato e vede «Il tuo account è entrato da un altro dispositivo». Così l\'agente si accorge se qualcuno usa il suo link.' : 'Spento: nessun limite. Acceso: al terzo accesso il dispositivo entrato per primo viene scollegato, così il link non si può passare ad altri senza che l\'agente se ne accorga.')}
        ${tog('geo', s.geo, `Solo da ${esc(names(s.cc))}`, s.geo ? 'Acceso: gli agenti entrano e lavorano solo dai Paesi qui sotto. Da un altro Paese (o con una VPN estera) l\'accesso viene rifiutato e chi era dentro viene scollegato.' : 'Spento: da qualunque Paese. Acceso: accessi da altri Paesi rifiutati (dà fastidio solo a chi lavora con una VPN o dall\'estero).')}
      </div>
      <div class="ags-cc ${s.geo ? '' : 'off'}"><b>Paesi consentiti</b>${s.cc.map((c) => `<span class="ags-chip" title="${esc(c)}">${flag(c)} ${esc(nm(c))}${s.cc.length > 1 ? `<button type="button" data-agsdel="${esc(c)}" title="Togli ${esc(nm(c))}" aria-label="Togli ${esc(nm(c))}">×</button>` : ''}</span>`).join('')}
        <select class="inp" id="agsAdd" aria-label="Aggiungi un Paese"><option value="">+ Aggiungi un Paese</option>${CC.filter((c) => !s.cc.includes(c)).map((c) => `<option value="${c}">${flag(c)} ${esc(nm(c))}</option>`).join('')}</select></div>
      <small class="ags-note">Gli agenti già collegati: con «7 giorni» chi è entrato da più di una settimana rientra al prossimo uso; con «2 dispositivi» chi ne ha di più resta collegato solo sui 2 più recenti; con i Paesi chi lavora da un altro Paese viene scollegato. Ogni accesso rifiutato o dispositivo scollegato finisce in Attività. L'«Entra per assistenza» del titolare non conta.</small>`;
    el.querySelectorAll('[data-ags]').forEach((t) => {
      const go = () => flip(t.dataset.ags);
      t.onclick = go;
      t.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } };
    });
    el.querySelectorAll('[data-agsdel]').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); const c = b.dataset.agsdel, L = cur().cc.filter((x) => x !== c); if (L.length) save({ cc: L }, `${nm(c)} tolto: Paesi consentiti ${names(L)}`); }));
    const sel = el.querySelector('#agsAdd');
    sel.onchange = () => { const c = sel.value; if (!c) return; const L = [...cur().cc, c]; sel.blur(); save({ cc: L }, `${nm(c)} aggiunto: Paesi consentiti ${names(L)}`); };
  }

  async function flip(k) {
    const s = cur(), on = !s[k];
    if (on) {
      const Q = {
        week: ['Accesso di 7 giorni per gli agenti?', 'Da adesso l\'accesso degli agenti dura 7 giorni: poi rientrano con il link e il codice (o utente e password). <b>Chi è entrato da più di 7 giorni dovrà rientrare al prossimo uso.</b>', 'Attiva'],
        two: ['Massimo 2 dispositivi per agente?', 'Al terzo accesso il dispositivo entrato per primo viene scollegato. <b>Chi adesso è collegato su più di 2 dispositivi resta collegato solo sui 2 più recenti.</b>', 'Attiva'],
        geo: [`Agenti solo da ${names(s.cc)}?`, `Da adesso gli agenti entrano solo da <b>${esc(names(s.cc))}</b>. Chi lavora da un altro Paese o con una VPN estera viene scollegato e non rientra finché non torna in un Paese consentito. Tu (titolare) entri sempre.`, 'Attiva'],
      }[k];
      if (!(await ask(Q[0], Q[1], Q[2]))) return;
    }
    const txt = { week: on ? 'Accesso degli agenti: 7 giorni' : 'Accesso degli agenti: 30 giorni dall\'ultimo uso', two: on ? 'Massimo 2 dispositivi per agente' : 'Dispositivi degli agenti senza limite', geo: on ? `Agenti solo da ${names(s.cc)}` : 'Agenti da qualunque Paese' }[k];
    save({ [k]: on }, txt);
  }

  // si ridisegna con il riquadro «Sicurezza» (a ogni aggiornamento del pannello)
  if (typeof renderSecurity === 'function') {
    const rs = renderSecurity;
    window.renderSecurity = renderSecurity = function () { rs.apply(this, arguments); try { card(); } catch {} };
  }
  window.KXAgSec = { card };
})();
