/* KAIROS Control — accesso degli agenti con il link personale (…/panel/?k=…): niente utente e password,
   si scrive solo il codice di accesso che il titolare ha dato insieme al link. Va caricato subito dopo app.js. */
(() => {
  const k = new URLSearchParams(location.search).get('k');
  if (!k || !/^[A-Za-z0-9_-]{20,64}$/.test(k)) return;
  const f = $('#lform'); if (!f) return;
  // campi utente e password (con le loro etichette e icone), «Ricorda» e impronta: non servono con il link
  const hide = (el) => { if (el) el.style.display = 'none'; };
  ['lu', 'lp'].forEach((id) => { const i = $('#' + id); hide((i && i.closest('.lx-f')) || i); hide(f.querySelector(`label[for="${id}"]`)); });
  hide($('#lremW')); hide($('#lpkW')); hide($('#lcW'));
  const sub = f.querySelector('p.mut'); if (sub) sub.textContent = 'Accesso con il link personale · scrivi il codice di accesso';
  const pw = $('#lp'), after = (pw && pw.closest('.lx-f')) || pw;
  after.insertAdjacentHTML('afterend', '<label class="lx-l" for="lk">Codice di accesso</label><div class="lx-f"><span class="lx-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="7.5" cy="15.5" r="4"/><path d="m10.4 12.6 9.1-9.1M16.5 6.5l2.6 2.6M13.6 9.4l2 2"/></svg></span><input class="inp mono" id="lk" autocomplete="off" spellcheck="false" maxlength="20" placeholder="Codice di accesso" style="letter-spacing:.18em"></div>');
  setTimeout(() => $('#lk') && $('#lk').focus(), 300);
  // prima del login normale di app.js (fase di cattura sul documento)
  document.addEventListener('submit', async (e) => {
    if (e.target !== f) return;
    e.preventDefault(); e.stopImmediatePropagation(); $('#lerr').textContent = '';
    try {
      const j = await api('POST', '/admin/link-login', { k, code: $('#lk').value.trim(), totp: $('#lt').value.trim(), turnstile: tsToken() });
      if (j.needTotp) { kxTotpAsk(); return; }
      $('#lk').value = ''; $('#lt').value = '';
      history.replaceState(null, '', location.pathname); // il link non resta nella barra degli indirizzi
      await enter();
    } catch (err) { tsReset(); $('#lerr').textContent = err.message; }
  }, true);
})();
