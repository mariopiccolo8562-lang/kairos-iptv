/* KAIROS Control — «Accesso degli agenti» in Impostazioni → Sicurezza e account (11 novembre 2026).
   Tre protezioni in più per agenti e sotto-agenti, spente finché il titolare non le accende:
   - «Accesso di 7 giorni»: 7 giorni dopo l'accesso l'agente rientra con link e codice (o utente e password);
   - «Massimo 2 dispositivi per agente»: al terzo accesso si scollega il dispositivo entrato per primo;
   - «Solo da questi Paesi»: gli agenti entrano e lavorano solo dai Paesi scelti (di serie l'Italia);
   - «Avvisami su Telegram»: accesso fermato dall'estero, agente scollegato perché lavora da un altro Paese, terzo dispositivo;
   - «Verifica in due passaggi obbligatoria»: l'agente senza la attiva prima di usare il pannello (schermata qui sotto).
   Il titolare non è toccato da nessuna. Server: PUT /api/admin/settings { agSec: { week, two, geo, cc, tg, tfa } }.
   Usa app.js ($, esc, api, toast, ask, D, renderSecurity) e qr.js (KXQR). */
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
  const DEF = { week: false, two: false, geo: false, cc: ['IT'], tg: false, tfa: false };
  const cur = () => { const x = (D.settings && D.settings.agSec) || {}; return { week: x.week === true, two: x.two === true, geo: x.geo === true, cc: Array.isArray(x.cc) && x.cc.length ? x.cc.slice() : DEF.cc.slice(), tg: x.tg === true, tfa: x.tfa === true }; };
  const noTfa = () => (Array.isArray(D.agents) ? D.agents : []).filter((a) => !a.totp).length;
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
        ${tog('tg', s.tg, 'Avvisami su Telegram', s.tg ? 'Acceso: ti scrive quando un agente con il link o la password giusti viene fermato dall\'estero, viene scollegato perché lavora da un altro Paese o entra da un terzo dispositivo. Serve il tuo Telegram collegato al pannello.' : 'Spento. Acceso: ti scrive quando un agente viene fermato dall\'estero o entra da un terzo dispositivo (segnali di un link passato ad altri). Serve il tuo Telegram collegato al pannello.')}
        ${tog('tfa', s.tfa, 'Verifica in due passaggi obbligatoria', (s.tfa ? 'Acceso: l\'agente senza la verifica la attiva prima di usare il pannello e non la può spegnere. ' : 'Spento: la verifica è facoltativa. Acceso: oltre a link e codice serve il codice dell\'app sul telefono, quindi un link rubato da solo non basta. ') + (noTfa() ? `Oggi senza verifica: ${noTfa()} ${noTfa() === 1 ? 'agente' : 'agenti'}.` : 'Tutti i tuoi agenti ce l\'hanno già.'))}
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
        tfa: ['Verifica in due passaggi obbligatoria?', `Gli agenti senza verifica la dovranno attivare al prossimo uso del pannello: serve un'app dei codici sul telefono (Password dell'iPhone, Google Authenticator). ${noTfa() ? `<b>Oggi sono ${noTfa()}.</b>` : 'Oggi ce l\'hanno già tutti.'} Chi ce l'ha già non nota niente.`, 'Attiva'],
      }[k];
      if (Q && !(await ask(Q[0], Q[1], Q[2]))) return;
    }
    const txt = { week: on ? 'Accesso degli agenti: 7 giorni' : 'Accesso degli agenti: 30 giorni dall\'ultimo uso', two: on ? 'Massimo 2 dispositivi per agente' : 'Dispositivi degli agenti senza limite', geo: on ? `Agenti solo da ${names(s.cc)}` : 'Agenti da qualunque Paese', tg: on ? 'Avvisi su Telegram per gli accessi degli agenti' : 'Niente avvisi su Telegram per gli accessi degli agenti', tfa: on ? 'Verifica in due passaggi obbligatoria per gli agenti' : 'Verifica in due passaggi facoltativa per gli agenti' }[k];
    save({ [k]: on }, txt);
  }

  /* ---------------- «Verifica in due passaggi obbligatoria»: schermata dell'agente che non l'ha ancora ----------------
     Il server risponde 403 { mustTotp } a tutto tranne attivazione e uscita: app.js chiama KXMustTotp(messaggio). */
  let mt = null;
  const mbox = (html) => { mt.innerHTML = `<div class="card glass" style="max-width:500px;width:100%;padding:26px 24px;line-height:1.55">${html}</div>`; };
  function mustTotp(msg) {
    if (mt) return;
    mt = document.createElement('div'); mt.id = 'mtScr';
    mt.style.cssText = 'position:fixed;inset:0;z-index:100001;display:grid;place-items:center;padding:20px;background:rgba(8,9,22,.96);backdrop-filter:blur(6px);overflow:auto';
    document.body.appendChild(mt);
    first(msg);
  }
  function first(msg) {
    mbox(`<div style="font-size:44px;line-height:1;text-align:center">🔐</div><h3 style="margin:12px 0 8px;font-size:20px;text-align:center">Verifica in due passaggi obbligatoria</h3>
      <p class="mut" style="margin:0 0 8px">${esc(msg || 'Il titolare chiede la verifica in due passaggi: attivala per continuare.')}</p>
      <p class="mut" style="margin:0">Oltre al link e al codice servirà il codice di 6 cifre dell'app sul telefono (Password dell'iPhone, Google Authenticator…): così il tuo link, da solo, non basta a nessuno.</p>
      <div style="display:flex;gap:8px;justify-content:center;margin-top:18px;flex-wrap:wrap"><button type="button" class="btn pri" id="mtGo">Attiva adesso</button><button type="button" class="btn" id="mtOut">Esci</button></div>`);
    mt.querySelector('#mtGo').onclick = () => setup(false);
    mt.querySelector('#mtOut').onclick = out;
  }
  async function setup(fresh) {
    let r; try { r = await api('POST', '/admin/totp/setup', fresh ? { fresh: true } : {}); } catch (e) { return toast(e.message, 1); }
    const key = String(r.secret || ''), grp = key.replace(/(.{4})/g, '$1 ').trim();
    let qr = ''; try { qr = window.KXQR && r.uri ? KXQR.svg(r.uri, 4) : ''; } catch {}
    const touch = matchMedia('(pointer:coarse)').matches;
    mbox(`<h3 style="margin:0 0 10px;font-size:19px">Attiva la verifica in due passaggi</h3>
      ${qr && !touch ? `<div style="background:#fff;padding:8px;border-radius:12px;width:max-content;max-width:100%;margin:0 auto 12px;line-height:0">${qr}</div>` : ''}
      <p style="margin:0 0 8px"><b>1.</b> ${touch ? `Tocca <a class="btn sm pri" href="${esc(r.uri || '')}" style="text-decoration:none">Aggiungi al telefono</a>: si apre l'app dei codici e lo salvi.` : 'Inquadra il QR con l\'app dei codici del telefono (iPhone: app <b>Password</b>; oppure Google Authenticator: <b>+</b> → Scansiona un codice QR).'}</p>
      <p class="mut" style="margin:0 0 10px;font-size:13px">Oppure scrivi a mano la chiave: <b class="mono" style="letter-spacing:.04em">${esc(grp)}</b> <button type="button" class="btn sm" id="mtCopy">Copia chiave</button></p>
      <p style="margin:0 0 8px"><b>2.</b> Scrivi il codice di 6 cifre che vedi nell'app:</p>
      <div class="row" style="grid-template-columns:1fr auto;gap:8px"><input class="inp mono" id="mtCode" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="123456" style="letter-spacing:.2em;margin:0"><button type="button" class="btn pri" id="mtOk">Conferma</button></div>
      <div style="display:flex;gap:14px;margin-top:12px;font-size:12.5px"><a href="#" id="mtBack" class="mut">Indietro</a><a href="#" id="mtNew" class="mut">Chiave nuova</a></div>`);
    mt.querySelector('#mtCopy').onclick = () => navigator.clipboard.writeText(key).then(() => toast('Chiave copiata'), () => toast('Copia non consentita', 1));
    mt.querySelector('#mtBack').onclick = (e) => { e.preventDefault(); first(); };
    mt.querySelector('#mtNew').onclick = (e) => { e.preventDefault(); setup(true); };
    const go = async () => {
      const code = mt.querySelector('#mtCode').value.replace(/\D/g, '');
      if (code.length !== 6) return toast('Scrivi le 6 cifre dell\'app', 1);
      try { const x = await api('POST', '/admin/totp/enable', { code }); done(x.recovery || []); } catch (e) { toast(e.message, 1); }
    };
    mt.querySelector('#mtOk').onclick = go;
    mt.querySelector('#mtCode').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } };
    setTimeout(() => { const i = mt && mt.querySelector('#mtCode'); if (i && !touch) i.focus(); }, 50);
  }
  function done(L) {
    mbox(`<div style="font-size:40px;line-height:1;text-align:center">✅</div><h3 style="margin:10px 0 8px;font-size:19px;text-align:center">Verifica attivata</h3>
      <p class="mut" style="margin:0 0 10px">Salva questi <b>codici di recupero</b> (ognuno vale una volta): servono se perdi il telefono.</p>
      <div class="tf-codes">${L.map((c) => `<code>${esc(c)}</code>`).join('')}</div>
      <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap"><button type="button" class="btn" id="mtCodes">Copia i codici</button><button type="button" class="btn pri" id="mtIn">Ho salvato i codici: entra</button></div>`);
    mt.querySelector('#mtCodes').onclick = () => navigator.clipboard.writeText(L.join('\n')).then(() => toast('Codici copiati'), () => toast('Copia non consentita', 1));
    mt.querySelector('#mtIn').onclick = () => location.reload();
  }
  async function out() {
    try { await fetch('/api/admin/logout', { method: 'POST', credentials: 'same-origin', headers: { 'X-Kairos': '1' } }); } catch {}
    location.reload();
  }
  window.KXMustTotp = mustTotp;

  // si ridisegna con il riquadro «Sicurezza» (a ogni aggiornamento del pannello)
  if (typeof renderSecurity === 'function') {
    const rs = renderSecurity;
    window.renderSecurity = renderSecurity = function () { rs.apply(this, arguments); try { card(); } catch {} };
  }
  window.KXAgSec = { card };
})();
