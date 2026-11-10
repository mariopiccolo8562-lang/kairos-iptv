/* Pannello Black IPTV: il collegamento passa dalla scheda già autenticata. */
(() => {
  const PRESETS = ['/TOmnO8fxP3rl/', '/TOmnO8fxP3rl/users.php', '/TOmnO8fxP3rl/mags.php', '/TOmnO8fxP3rl/live_connections.php', '/TOmnO8fxP3rl/user_reseller.php'];
  const nav = document.createElement('button');
  nav.className = 'nav';
  nav.dataset.v = 'blk';
  nav.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 22h8M12 18v4M7 9h10M7 13h6"/></svg>Pannello Black IPTV';
  nav.onclick = () => view('blk');
  const anchor = $('.nav[data-v="slt"]');
  if (anchor) anchor.after(nav); else $('#side').appendChild(nav);
  if (D.role === 'agent') nav.style.display = 'none';

  const section = document.createElement('section');
  section.className = 'view';
  section.id = 'v-blk';
  $('#v-dash').after(section);
  TITLES.blk = 'Pannello Black IPTV';

  const state = { data: null, error: '', token: '', busy: false, probing: false, pointerDown: false, probe: null, probeError: '', path: '', post: false, form: '', render: false };
  const safe = (value) => esc(String(value == null ? '' : value));
  const pill = (text, color) => `<span style="display:inline-block;padding:4px 10px;border-radius:999px;background:${color}22;color:${color};font-weight:700">${safe(text)}</span>`;
  function since(value) {
    const time = Number(value);
    if (!time) return 'Mai';
    const seconds = Math.max(0, Math.floor(Date.now() / 1000 - time));
    if (seconds < 10) return 'Adesso';
    if (seconds < 60) return `${seconds} secondi fa`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)} minuti fa`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} ore fa`;
    return new Date(time * 1000).toLocaleString('it-IT');
  }
  function structureHtml(probe) {
    if (!probe) return '<p class="mut" style="margin-top:12px">Scegli un percorso per controllarne la struttura.</p>';
    const statusText = probe.status === 404
      ? 'La pagina ha risposto 404. È normale se il percorso non esiste: puoi provarne un altro.'
      : `Risposta HTTP ${safe(probe.status)} · ${safe(probe.bytes)} byte${probe.trunc ? ' · risposta abbreviata' : ''}`;
    const viaText = probe.via === 'iframe' ? ' · letta tramite pagina nascosta' : '';
    const tables = (probe.tables || []).map((table) => `<div class="card" style="padding:12px;margin-top:10px">
      <b>Tabella ${safe(Number(table.idx) + 1)}</b> · ${safe(table.rows)} righe
      <div style="margin-top:6px"><span class="mut">Intestazioni:</span> ${table.headers && table.headers.length ? table.headers.map(safe).join(' · ') : 'nessuna'}</div>
      <div style="margin-top:4px"><span class="mut">Tipo celle prima riga:</span> ${table.firstRowCellKinds && table.firstRowCellKinds.length ? table.firstRowCellKinds.map(safe).join(' · ') : 'nessuna'}</div>
    </div>`).join('') || '<p class="mut" style="margin-top:10px">Nessuna tabella trovata.</p>';
    const forms = (probe.forms || []).map((form, index) => `<div style="margin-top:8px"><b>Modulo ${index + 1}</b> · ${safe(form.method)} · ${safe(form.action)}
      <div class="mut">${(form.fields || []).map((field) => `${safe(field.name || '(senza nome)')} (${safe(field.type)})`).join(' · ') || 'nessun campo'}</div></div>`).join('') || '<div class="mut" style="margin-top:8px">Nessun modulo trovato.</div>';
    const links = (probe.links || []).map((link) => `<li><a href="${safe(link.href)}" data-blk-path="${safe(link.href)}" style="color:var(--a1)">${safe(link.text || '(senza testo)')}</a> · <span class="mono">${safe(link.href)}</span></li>`).join('') || '<li class="mut">Nessun collegamento trovato.</li>';
    const formatKeys = (keys) => keys && keys.length
      ? keys.map((key) => `${safe(key.name)} (${safe(key.type)})`).join(' · ')
      : 'nessuna';
    const json = probe.json ? `<div class="card" style="padding:12px;margin-top:10px">
      <b>Risposta in formato JSON</b>
      <div style="margin-top:6px">Tipo: ${safe(probe.json.kind)} · Elementi/chiavi: ${safe(probe.json.count)}</div>
      ${probe.json.rowsKey !== undefined ? `<div style="margin-top:4px">Elenco: ${safe(probe.json.rowsKey)} · ${safe(probe.json.rows)} righe</div>` : ''}
      <div style="margin-top:6px"><span class="mut">Chiavi:</span> ${formatKeys(probe.json.keys)}</div>
      ${probe.json.rowsKey !== undefined ? `<div style="margin-top:4px"><span class="mut">Chiavi della prima riga:</span> ${formatKeys(probe.json.rowKeys)}</div>` : ''}
    </div>` : '';
    const endpoints = probe.endpoints && probe.endpoints.length
      ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">${probe.endpoints.map((endpoint) => `<button class="btn sm" data-blk-path="${safe(endpoint.url)}">${safe(endpoint.url)}</button>`).join('')}</div>`
      : '<p class="mut" style="margin-top:8px">Nessuna richiesta nascosta trovata.</p>';
    const details = probe.json ? json : `<div style="margin-top:6px">Titolo pagina: ${safe(probe.title || '—')} · Script: ${safe(probe.scripts)} · Percorso: <span class="mono">${safe(probe.url)}</span></div>
      ${tables}<div style="margin-top:14px"><b>Moduli e campi</b>${forms}</div>
      <div style="margin-top:14px"><b>Collegamenti interni</b><ul style="padding-left:20px;margin-top:5px">${links}</ul></div>`;
    return `<div class="card" style="padding:12px;margin-top:12px">
      <b>Risultato · ${statusText}${viaText}</b>
      ${details}
      <div style="margin-top:14px"><b>Richieste nascoste della pagina</b>${endpoints}</div>
      <p class="mut" style="margin-top:12px">Qui vedi solo la struttura della pagina, mai i dati dei clienti.</p>
    </div>`;
  }
  function render() {
    const data = state.data || {};
    const fresh = !!(data.installed && data.lastSeen && Date.now() / 1000 - data.lastSeen < 20);
    const status = fresh ? pill('Ponte collegato', '#3dffb0') : data.installed ? pill('Ponte non collegato', '#ffcc4d') : pill('Codice non creato', '#9ca8c5');
    section.innerHTML = `<div class="card glass" style="margin-bottom:14px">
      <h2 style="font-size:20px;margin-bottom:8px">Pannello Black IPTV</h2>
      <p class="mut">Black IPTV richiede una sessione del browser e non è raggiungibile direttamente dal Worker KAIROS. Il ponte usa la scheda Chrome o Edge in cui hai già effettuato l'accesso: non prova a superare controlli o protezioni del sito.</p>
    </div>
    <div class="card glass" style="margin-bottom:14px">
      <div style="display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap">
        <div><b>Stato del ponte</b><div style="margin-top:7px">${status}</div></div>
        <div><div class="mut">Ultimo contatto</div><b>${safe(since(data.lastSeen))}</b></div>
        <div><div class="mut">Richieste in coda</div><b>${safe(data.pending || 0)}</b></div>
        <button class="btn sm" data-blk="refresh">Aggiorna</button>
      </div>
      ${state.error ? `<p style="color:#ff8f8f;margin-top:10px">${safe(state.error)} ${/Sessione scaduta/i.test(state.error) ? '<a href="/panel/" style="color:var(--a1)">Accedi a KAIROS</a>' : ''}</p>` : ''}
    </div>
    <div class="card glass" style="margin-bottom:14px">
      <b>Crea il codice del ponte</b>
      <p class="mut" style="margin:5px 0 12px">Il codice collega questa installazione dell'estensione a KAIROS. Non condividerlo con altre persone.</p>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <button class="btn pri sm" data-blk="create" ${state.busy ? 'disabled' : ''}>Crea codice</button>
        ${data.installed ? '<button class="btn danger sm" data-blk="disconnect">Scollega il ponte</button>' : ''}
      </div>
      ${state.token ? `<div style="margin-top:12px;padding:12px;border:1px solid var(--line);border-radius:12px"><b>Codice (visibile solo adesso)</b><p class="mut" style="margin:4px 0 8px">Copialo e salvalo nell'estensione: KAIROS non potrà mostrarlo di nuovo.</p><div style="display:flex;gap:8px;flex-wrap:wrap"><code class="mono" style="overflow-wrap:anywhere;flex:1">${safe(state.token)}</code><button class="btn sm" data-blk="copy">Copia</button></div></div>` : ''}
    </div>
    <div class="card glass" style="margin-bottom:14px">
      <b>Installa l'estensione</b>
      <ol class="mut" style="padding-left:20px;margin-top:8px;line-height:1.8">
        <li>Scarica la cartella <span class="mono">extension/kairos-ponte</span> sul computer.</li>
        <li>In Chrome o Edge apri <span class="mono">chrome://extensions</span> o <span class="mono">edge://extensions</span> e attiva «Modalità sviluppatore».</li>
        <li>Scegli «Carica estensione non pacchettizzata» (Chrome) o «Carica decompressa» (Edge) e seleziona la cartella.</li>
        <li>Apri «KAIROS Ponte», incolla il codice e premi «Salva».</li>
        <li>Accedi a Black IPTV in Chrome o Edge e lascia aperta la scheda.</li>
      </ol>
      <p class="mut" style="margin-top:8px">La guida completa è nella cartella dell'estensione, nel file LEGGIMI.md.</p>
    </div>
    <div class="card glass">
      <b>Controllo pagine</b>
      <p class="mut" style="margin:5px 0 12px">Il controllo restituisce solo titolo, intestazioni, numero di righe e tipi di campi. Non mostra né salva i valori delle celle o i dati dei clienti.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap">${PRESETS.map((path) => `<button class="btn sm" data-blk-path="${safe(path)}" ${state.probing ? 'disabled' : ''}>${safe(path)}</button>`).join('')}</div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:10px">
        <input class="inp" id="blkPath" placeholder="Percorso pagina (es. /account/users)" value="${safe(state.path)}" style="flex:1;min-width:220px">
        <label class="mut" style="display:flex;gap:6px;align-items:center;white-space:nowrap"><input type="checkbox" id="blkPost" ${state.post ? 'checked' : ''}>Invia come POST</label>
        <label class="mut" style="display:flex;gap:6px;align-items:center;white-space:nowrap"><input type="checkbox" id="blkRender" ${state.render ? 'checked' : ''}>Leggi la pagina come la vedi tu (più lento)</label>
        <input type="text" class="inp" id="blkForm" placeholder="Parametri POST, es. draw=1&start=0&length=10" value="${safe(state.form)}" style="flex:1;min-width:220px">
        <button class="btn pri sm" data-blk="probe" ${state.busy ? 'disabled' : ''}>Controlla</button>
      </div>
      ${state.probing ? `<p class="mut" role="status" style="margin-top:10px">${state.render ? 'Controllo in corso… con la lettura completa può servire fino a 45 secondi' : 'Controllo in corso… può servire fino a 45 secondi'}</p>` : ''}
      ${state.probeError ? `<p class="mut" style="margin-top:10px">${safe(state.probeError)}</p>` : ''}
      ${structureHtml(state.probe)}
    </div>`;
  }
  async function loadState() {
    try {
      state.data = await api('GET', '/admin/blk/state');
      state.error = '';
    } catch (error) {
      state.error = error.message || 'Stato non disponibile';
    }
    const probeInputFocused = ['#blkPath', '#blkPost', '#blkRender', '#blkForm'].some((selector) => document.activeElement === $(selector, section));
    if (!state.busy && !state.pointerDown && !probeInputFocused) render();
  }
  async function createToken() {
    state.busy = true;
    render();
    try {
      const result = await api('POST', '/admin/blk/token', {});
      state.token = result.token || '';
      state.error = '';
      toast('Codice del ponte creato');
      await loadState();
    } catch (error) {
      state.error = error.message || 'Non è stato possibile creare il codice';
      render();
    } finally {
      state.busy = false;
      render();
    }
  }
  async function disconnect() {
    if (!await ask('Scollegare il ponte?', 'Il codice attuale verrà revocato e le richieste in coda saranno eliminate.', 'Scollega')) return;
    try {
      await api('DELETE', '/admin/blk/token', {});
      state.token = '';
      state.probe = null;
      toast('Ponte scollegato');
      await loadState();
    } catch (error) {
      state.error = error.message || 'Non è stato possibile scollegare il ponte';
      render();
    }
  }
  async function copyToken() {
    try {
      await navigator.clipboard.writeText(state.token);
      toast('Codice copiato');
    } catch {
      toast('Copia non riuscita', 1);
    }
  }
  async function probe(path) {
    if (state.probing) return;
    if (!path) { state.probeError = 'Inserisci un percorso da controllare.'; render(); return; }
    state.post = !!$('#blkPost', section).checked;
    state.render = !!$('#blkRender', section).checked;
    state.form = $('#blkForm', section).value;
    state.busy = true;
    state.probing = true;
    state.probeError = '';
    render();
    try {
      const request = { path };
      if (state.post) { request.method = 'POST'; request.form = state.form; }
      if (state.render) request.render = true;
      state.probe = await api('POST', '/admin/blk/probe', request);
      state.probeError = '';
    } catch (error) {
      const message = error.message || 'Il controllo non è riuscito. Verifica che Chrome o Edge siano aperti sulla pagina Black IPTV.';
      state.probeError = /Failed to fetch|reindirizzata/i.test(message)
        ? `Black IPTV ha bloccato la lettura diretta di questa pagina: ${message}`
        : message;
    } finally {
      state.busy = false;
      state.probing = false;
      render();
    }
  }
  section.addEventListener('click', (event) => {
    const target = event.target.closest('[data-blk-path], [data-blk]');
    if (!target || !section.contains(target) || target.disabled) return;
    if (target.matches('[data-blk-path]')) {
      if (target.matches('a')) event.preventDefault();
      state.path = target.dataset.blkPath;
      void probe(state.path);
      return;
    }
    switch (target.dataset.blk) {
      case 'refresh': void loadState(); break;
      case 'create': void createToken(); break;
      case 'disconnect': void disconnect(); break;
      case 'copy': void copyToken(); break;
      case 'probe':
        state.path = $('#blkPath', section).value.trim();
        void probe(state.path);
        break;
    }
  });
  section.addEventListener('input', (event) => {
    if (event.target.matches('#blkPath')) state.path = event.target.value;
    if (event.target.matches('#blkForm')) state.form = event.target.value;
  });
  section.addEventListener('change', (event) => {
    if (event.target.matches('#blkPost')) state.post = event.target.checked;
    if (event.target.matches('#blkRender')) state.render = event.target.checked;
  });
  section.addEventListener('pointerdown', (event) => {
    if (event.target.closest('[data-blk-path], [data-blk="probe"]')) state.pointerDown = true;
  });
  const releasePointer = () => { state.pointerDown = false; };
  window.addEventListener('pointerup', releasePointer);
  window.addEventListener('pointercancel', releasePointer);
  const view0 = view;
  window.view = view = function (key) {
    const result = view0.apply(this, arguments);
    if (key === 'blk' && D.role !== 'agent') void loadState();
    return result;
  };
  setInterval(() => {
    if (section.classList.contains('on') && D.role !== 'agent') void loadState();
  }, 10000);
  render();
})();
