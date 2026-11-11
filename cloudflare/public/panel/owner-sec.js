/* KAIROS Control — «Il tuo accesso» (11 novembre 2026), solo per il titolare:
   - Impostazioni → Sicurezza e account: codice di accesso (chiesto solo sui dispositivi che il pannello non ricorda),
     dispositivi ricordati con «Dimentica», impronta o Face ID (passkey) con «Aggiungi questo dispositivo», avvisi su Telegram;
   - pagina di accesso: «Entra con impronta o Face ID» (KXPk.offer, chiamato da app.js se c'è almeno una passkey).
   Server: /api/admin/own-sec, /api/admin/passkey/*. Le passkey le firma il telefono o il computer: qui arriva solo la firma.
   Usa app.js ($, esc, api, toast, ask, D, enter, renderSecurity). */
(() => {
  const css = document.createElement('style');
  css.textContent = `#ownSecCard{grid-column:1/-1}
#ownSecCard .os-g{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
@media (max-width:1100px){#ownSecCard .os-g{grid-template-columns:1fr}}
#ownSecCard .os-b{border:1px solid var(--line);border-radius:14px;padding:14px 16px;background:linear-gradient(150deg,rgba(255,255,255,.035),rgba(255,255,255,.01));display:flex;flex-direction:column;gap:8px;min-width:0}
#ownSecCard .os-b h4{display:flex;align-items:center;gap:8px;margin:0;font-size:14px}
#ownSecCard .os-b h4 i{font-style:normal;font-size:16px}
#ownSecCard .os-st{display:inline-block;font-size:11px;font-weight:800;letter-spacing:.06em;padding:2px 8px;border-radius:999px;margin-left:auto}
#ownSecCard .os-st.on{background:rgba(52,211,153,.15);color:#6ee7b7}#ownSecCard .os-st.off{background:rgba(148,163,184,.14);color:#cbd5e1}
#ownSecCard .os-b p{margin:0;font-size:12.5px;line-height:1.5;color:var(--mut)}
#ownSecCard .os-code{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
#ownSecCard .os-code b{font-family:'JetBrains Mono',monospace;font-size:16px;letter-spacing:.12em}
#ownSecCard .os-act{display:flex;gap:6px;flex-wrap:wrap;margin-top:auto}
#ownSecCard .os-row{display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid var(--line);font-size:13px}
#ownSecCard .os-row:first-child{border-top:0}
#ownSecCard .os-row>div{flex:1;min-width:0}#ownSecCard .os-row small{display:block;color:var(--mut);font-size:11.5px}
#ownSecCard .os-here{font-size:10.5px;font-weight:800;letter-spacing:.06em;color:#67e8f9;margin-left:6px}
#ownSecCard .os-devs{margin-top:12px;border:1px solid var(--line);border-radius:14px;padding:12px 16px}
#ownSecCard .os-devs h4{display:flex;align-items:center;gap:8px;margin:0 0 4px;font-size:14px}
#ownSecCard .tog{margin:0}`;
  document.head.appendChild(css);

  const b64u = (buf) => { const b = new Uint8Array(buf); let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const unb64u = (s) => { s = String(s).replace(/-/g, '+').replace(/_/g, '/'); const b = atob(s + '==='.slice((s.length + 3) % 4)); return Uint8Array.from(b, (c) => c.charCodeAt(0)); };
  const canPk = () => !!(window.PublicKeyCredential && navigator.credentials && window.isSecureContext);
  const owner = () => typeof D === 'object' && D && D.role !== 'agent' && !window.__assist && !D.demo;
  const day = (t) => (t ? new Date(t).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—');
  const ago = (t) => { if (!t) return 'mai'; const d = Date.now() - t; return d < 36e5 ? 'nell\'ultima ora' : d < 864e5 ? 'oggi' : d < 2 * 864e5 ? 'ieri' : day(t); };
  const genCode = () => { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789', r = crypto.getRandomValues(new Uint8Array(8)); return [...r].map((x) => A[x % A.length]).join(''); };

  /* ---------------- pagina di accesso: «Entra con impronta o Face ID» ---------------- */
  async function pkLogin() {
    const btn = document.getElementById('lpk'); if (!btn || btn.disabled) return;
    const err = document.getElementById('lerr'); err.textContent = '';
    btn.disabled = true;
    try {
      const o = await api('POST', '/admin/passkey/login-options', {});
      const cred = await navigator.credentials.get({ publicKey: { challenge: unb64u(o.challenge), rpId: o.rpId, timeout: o.timeout, userVerification: 'required' } });
      if (!cred) throw new Error('Accesso con impronta o Face ID annullato');
      const r = cred.response, rem = document.getElementById('lrem');
      await api('POST', '/admin/passkey/login', { id: cred.id, clientDataJSON: b64u(r.clientDataJSON), authenticatorData: b64u(r.authenticatorData), signature: b64u(r.signature), userHandle: r.userHandle ? b64u(r.userHandle) : '', remember: !!(rem && rem.checked) });
      document.getElementById('lp').value = '';
      await enter();
    } catch (e) {
      err.textContent = e && e.name === 'NotAllowedError' ? 'Accesso con impronta o Face ID annullato' : (e && e.message) || 'Impronta o Face ID non riusciti';
    } finally { btn.disabled = false; }
  }
  window.KXPk = {
    offer() {
      if (!canPk() || new URLSearchParams(location.search).get('k') || (typeof D === 'object' && D && D.demo)) return;
      const w = document.getElementById('lpkW'), b = document.getElementById('lpk');
      if (!w || !b) return;
      w.hidden = false; b.onclick = pkLogin;
    },
  };

  /* ---------------- Sicurezza e account → «Il tuo accesso» ---------------- */
  const S = { d: null, t: 0, busy: false, show: false };
  async function load(force) {
    if (S.busy || (!force && S.d && Date.now() - S.t < 30000)) return;
    S.busy = true;
    try { S.d = await api('GET', '/admin/own-sec'); S.t = Date.now(); }
    catch (e) { if (force) toast(e.message, 1); }
    finally { S.busy = false; }
    draw();
  }
  function card() {
    const g = document.querySelector('.st-pane[data-pane="sec"] .st-g');
    let el = document.getElementById('ownSecCard');
    if (!owner()) { if (el) el.remove(); return; }
    if (!g) return;
    if (!el) {
      el = document.createElement('div'); el.className = 'card glass'; el.id = 'ownSecCard';
      const ag = document.getElementById('agSecCard');
      if (ag && ag.parentNode === g) g.insertBefore(el, ag); else g.appendChild(el);
      draw();
    }
    if (g.closest('.st-pane') && g.closest('.st-pane').classList.contains('on')) load(false);
  }
  function draw() {
    const el = document.getElementById('ownSecCard'); if (!el) return;
    const d = S.d;
    if (!d) { el.innerHTML = '<div class="hd"><h3>Il tuo accesso<small>Caricamento…</small></h3></div>'; return; }
    const c = d.code || {};
    el.innerHTML = `<div class="hd"><h3>Il tuo accesso<small>Solo per te: il codice si chiede sui dispositivi nuovi, quelli che usi di solito li ricorda per ${esc(String(d.days || 90))} giorni. Con impronta o Face ID entri senza scrivere nulla.</small></h3></div>
      <div class="os-g">
        <div class="os-b"><h4><i>🔑</i>Codice di accesso<span class="os-st ${c.on ? 'on' : 'off'}">${c.on ? 'ATTIVO' : 'SPENTO'}</span></h4>
          ${c.on ? `<div class="os-code"><b id="osCodeV" data-v="${esc(c.value)}">${'•'.repeat(Math.min(12, (c.value || '').length || 8))}</b><button type="button" class="btn sm" data-os="show">Mostra</button><button type="button" class="btn sm" data-os="copy">Copia</button></div>
          <p>Il pannello lo chiede dopo la password, solo su un dispositivo che non ricorda (computer o telefono nuovo, oppure dimenticato).</p>
          <div class="os-act"><button type="button" class="btn sm" data-os="change">Cambia</button><button type="button" class="btn sm danger" data-os="off">Spegni</button></div>`
          : `<p>Un passaggio in più dopo la password, ma comodo: lo scrivi una volta per dispositivo, poi il pannello se lo ricorda. Chi trova la tua password non entra senza il codice.</p>
          <div class="os-act"><button type="button" class="btn sm pri" data-os="on">Attiva il codice</button></div>`}
        </div>
        <div class="os-b"><h4><i>👆</i>Impronta o Face ID<span class="os-st ${d.passkeys.length ? 'on' : 'off'}">${d.passkeys.length ? d.passkeys.length + (d.passkeys.length === 1 ? ' ATTIVA' : ' ATTIVE') : 'NESSUNA'}</span></h4>
          ${d.passkeys.length ? `<div>${d.passkeys.map((x) => `<div class="os-row"><div><b>${esc(x.name || 'Passkey')}</b><small>aggiunta il ${esc(day(x.created))} · ultimo uso ${esc(ago(x.used))}</small></div><button type="button" class="btn sm" data-os="pkdel" data-id="${esc(x.id)}">Togli</button></div>`).join('')}</div>`
          : '<p>Sul telefono o sul computer che usi di solito entri con il dito o con il viso: niente password, niente codici. La chiave segreta resta nel dispositivo.</p>'}
          <div class="os-act">${canPk() ? '<button type="button" class="btn sm pri" data-os="pkadd">Aggiungi questo dispositivo</button>' : '<small class="mut">Questo browser non le supporta: aprilo da Chrome, Safari o Edge aggiornati.</small>'}</div>
        </div>
        <div class="os-b"><h4><i>📣</i>Avvisami su Telegram</h4>
          <div class="tog ${d.tg ? 'on' : ''}" data-os="tg" role="switch" aria-checked="${!!d.tg}" tabindex="0"><div><b>${d.tg ? 'Acceso' : 'Spento'}</b><small>Ti scrive quando entri da un dispositivo nuovo, quando qualcuno ha la tua password ma sbaglia il codice e quando si aggiunge una passkey.</small></div><i></i></div>
          ${d.tgLinked ? '' : '<p>⚠️ Il tuo Telegram non è collegato al pannello: collegalo dagli avvisi su Telegram, altrimenti i messaggi non arrivano.</p>'}
        </div>
      </div>
      <div class="os-devs"><h4>💻 Dispositivi ricordati${d.devices.length ? ' · ' + d.devices.length : ''}${d.devices.length > 1 ? '<button type="button" class="btn sm" data-os="tdall" style="margin-left:auto">Dimentica tutti</button>' : ''}</h4>
        ${d.devices.length ? d.devices.map((x) => `<div class="os-row"><div><b>${esc(x.dev)}</b>${x.id === d.here ? '<span class="os-here">QUESTO DISPOSITIVO</span>' : ''}<small>${esc([x.where, 'ricordato fino al ' + day(x.expires), 'ultimo accesso ' + ago(x.used)].filter(Boolean).join(' · '))}</small></div><button type="button" class="btn sm" data-os="tddel" data-id="${esc(x.id)}">Dimentica</button></div>`).join('')
          : '<p class="mut" style="font-size:12.5px;margin:4px 0 0">Nessuno: all\'accesso spunta «Ricorda questo dispositivo».</p>'}
      </div>`;
    el.querySelectorAll('[data-os]').forEach((b) => {
      const go = () => act(b.dataset.os, b);
      b.onclick = go;
      if (b.classList.contains('tog')) b.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } };
    });
  }
  async function askCode(title, intro, yes, withCode) {
    const v = withCode ? genCode() : '';
    const okk = await ask(title, `${intro}${withCode ? `<label class="lbl" style="margin-top:12px">Codice di accesso (puoi cambiarlo: da 6 a 40 caratteri)</label><input class="inp mono" id="osCode" value="${esc(v)}" autocomplete="off" spellcheck="false" maxlength="40" style="letter-spacing:.12em">` : ''}<label class="lbl" style="margin-top:12px">La tua password attuale</label><input class="inp" type="password" id="osPw" autocomplete="current-password" placeholder="Password">`, yes);
    if (!okk) return null;
    return { code: withCode ? (document.getElementById('osCode') || {}).value || '' : '', password: (document.getElementById('osPw') || {}).value || '' };
  }
  async function act(k, b) {
    const d = S.d; if (!d) return;
    try {
      if (k === 'show') { const v = document.getElementById('osCodeV'); if (v) { const vis = v.dataset.vis === '1'; v.textContent = vis ? '•'.repeat(Math.min(12, v.dataset.v.length || 8)) : v.dataset.v; v.dataset.vis = vis ? '' : '1'; b.textContent = vis ? 'Mostra' : 'Nascondi'; } return; }
      if (k === 'copy') { return navigator.clipboard.writeText(d.code.value).then(() => toast('Codice copiato'), () => toast('Copia non consentita', 1)); }
      if (k === 'on' || k === 'change') {
        const r = await askCode(k === 'on' ? 'Attiva il codice di accesso' : 'Cambia il codice di accesso', `<p style="margin:0">Il pannello lo chiederà dopo la password, solo sui dispositivi che non ricorda. <b>Questo dispositivo resta ricordato</b>: qui non te lo chiede. Salvalo in un posto sicuro (anche nel gestore delle password).</p>`, k === 'on' ? 'Attiva' : 'Cambia', true);
        if (!r) return;
        const x = await api('PUT', '/admin/own-sec', { code: r.code.trim(), password: r.password });
        toast(k === 'on' ? 'Codice di accesso attivo' + (x.trusted ? ': questo dispositivo è ricordato' : '') : 'Codice di accesso cambiato');
      } else if (k === 'off') {
        const r = await askCode('Spegnere il codice di accesso?', '<p style="margin:0">Da un dispositivo nuovo basterà di nuovo la password (più la 2FA, se attiva).</p>', 'Spegni', false);
        if (!r) return;
        await api('PUT', '/admin/own-sec', { code: '', password: r.password });
        toast('Codice di accesso spento');
      } else if (k === 'tg') {
        await api('PUT', '/admin/own-sec', { tg: !d.tg });
        toast(!d.tg ? 'Avvisi su Telegram accesi' : 'Avvisi su Telegram spenti');
      } else if (k === 'tddel' || k === 'tdall') {
        const one = k === 'tddel';
        if (!(await ask(one ? 'Dimenticare questo dispositivo?' : 'Dimenticare tutti i dispositivi?', one ? 'Al prossimo accesso da lì il codice di accesso servirà di nuovo. Chi è già dentro resta collegato.' : 'Al prossimo accesso da ognuno il codice di accesso servirà di nuovo. Chi è già dentro resta collegato.', 'Dimentica'))) return;
        await api('DELETE', '/admin/own-sec/devices' + (one ? '/' + b.dataset.id : ''));
        toast(one ? 'Dispositivo dimenticato' : 'Dispositivi dimenticati');
      } else if (k === 'pkdel') {
        if (!(await ask('Togliere questa passkey?', 'Da quel dispositivo non entrerai più con impronta o Face ID (puoi riaggiungerla quando vuoi). Per sicurezza toglila anche dal telefono o dal computer.', 'Togli'))) return;
        await api('DELETE', '/admin/passkey/' + b.dataset.id);
        toast('Passkey tolta');
      } else if (k === 'pkadd') {
        b.disabled = true;
        try {
          const o = await api('POST', '/admin/passkey/options', {});
          const cred = await navigator.credentials.create({ publicKey: { ...o, challenge: unb64u(o.challenge), user: { ...o.user, id: unb64u(o.user.id) }, excludeCredentials: (o.excludeCredentials || []).map((x) => ({ type: 'public-key', id: unb64u(x.id) })) } });
          if (!cred) return;
          const r = cred.response;
          await api('POST', '/admin/passkey/register', { id: cred.id, clientDataJSON: b64u(r.clientDataJSON), attestationObject: b64u(r.attestationObject) });
          toast('Fatto: da questo dispositivo entri con impronta o Face ID');
        } catch (e) {
          if (e && e.name === 'InvalidStateError') toast('Questo dispositivo ha già una passkey del pannello', 1);
          else if (e && e.name === 'NotAllowedError') toast('Annullato', 1);
          else throw e;
        } finally { b.disabled = false; }
      }
      await load(true);
    } catch (e) { toast(e.message || 'Errore', 1); }
  }

  // si disegna con il riquadro «Sicurezza» (a ogni aggiornamento del pannello) e quando si apre la scheda
  if (typeof renderSecurity === 'function') {
    const rs = renderSecurity;
    window.renderSecurity = renderSecurity = function () { rs.apply(this, arguments); try { card(); } catch {} };
  }
  const pane = document.querySelector('#v-settings .st-pane[data-pane="sec"]');
  if (pane) new MutationObserver(() => { if (pane.classList.contains('on')) { card(); load(true); } }).observe(pane, { attributes: true, attributeFilter: ['class'] });
  window.KXOwnSec = { load, card };
})();
