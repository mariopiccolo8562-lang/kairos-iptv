/* KAIROS Control — accesso degli agenti con il link personale (…/panel/?k=…): niente utente e password,
   si scrive solo il codice di accesso che il titolare ha dato insieme al link. Va caricato subito dopo app.js. */
(() => {
  const k = new URLSearchParams(location.search).get('k');
  if (!k || !/^[A-Za-z0-9_-]{20,64}$/.test(k)) return;
  const f = $('#lform'); if (!f) return;
  $('#lu').style.display = 'none'; $('#lp').style.display = 'none';
  const sub = f.querySelector('p.mut'); if (sub) sub.textContent = 'Accesso con il link personale · scrivi il codice di accesso';
  $('#lp').insertAdjacentHTML('afterend', '<input class="inp mono" id="lk" autocomplete="off" spellcheck="false" maxlength="20" placeholder="Codice di accesso" style="text-align:center;letter-spacing:.18em">');
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
