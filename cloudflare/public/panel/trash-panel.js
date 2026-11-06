/* Cestino (solo titolare): quello che è stato eliminato resta 30 giorni e si può ripristinare.
   Clienti, agenti, DNS, linee collegate, messaggi, chiavi API, località VPN, liste create sulle app terze. */
(function () {
  const owner = () => D.role !== 'agent' && !window.__assist;
  const T = { data: null, busy: false, t: 0, q: '' };
  const KIND_ICON = { device: '👤', agent: '🧑‍💼', dns: '🌐', line: '🔗', msg: '✉️', apikey: '🔑', vpnloc: '🛡️', extlist: '📺' };
  TITLES.trash = 'Cestino';
  const side = $('#side'), dash = $('#v-dash');
  if (side && !$('.nav[data-v="trash"]')) {
    const b = document.createElement('button'); b.className = 'nav'; b.dataset.v = 'trash'; b.style.display = 'none';
    b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 14h10l1-14"/><path d="M10 11v6M14 11v6"/></svg>Cestino';
    b.onclick = () => view('trash'); side.appendChild(b);
    const sec = document.createElement('section'); sec.className = 'view'; sec.id = 'v-trash'; dash.after(sec);
  }

  async function loadT(force) {
    if (T.busy || (!force && T.data && Date.now() - T.t < 15e3)) return;
    T.busy = true;
    try { T.data = await api('GET', '/admin/trash'); T.t = Date.now(); } catch (e) { T.data = { err: e.message }; } finally { T.busy = false; }
    draw();
  }

  const when = (t) => { try { return new Date(t).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };

  function draw() {
    const V = $('#v-trash'); if (!V || !V.classList.contains('on')) return;
    if (!owner()) { V.innerHTML = '<div class="card glass"><p class="mut">Il cestino è del titolare.</p></div>'; return; }
    if (!T.data) { V.innerHTML = '<div class="card glass"><p class="mut">Carico…</p></div>'; return; }
    if (T.data.err) { V.innerHTML = `<div class="card glass"><p class="mut">${esc(T.data.err)}</p></div>`; return; }
    const all = T.data.items || [], q = T.q.toLowerCase();
    const list = all.filter((x) => !q || [x.label, x.kindLabel, x.by, x.ref].join(' ').toLowerCase().includes(q));
    V.innerHTML = `<div class="card glass"><div class="hd" style="flex-wrap:wrap;gap:10px"><h3>Cestino<small>Quello che elimini resta qui ${T.data.days || 30} giorni e si può ripristinare: clienti (con le connessioni collegate), agenti (con i loro clienti), DNS, linee collegate, messaggi, chiavi API, località VPN, liste create sulle app terze. Poi sparisce da solo.</small></h3>
        <div style="display:flex;gap:8px;align-items:center"><input class="inp" id="trQ" placeholder="Cerca…" value="${esc(T.q)}" style="width:200px;margin:0"><button class="btn sm" id="trRe">Aggiorna</button>${all.length ? '<button class="btn sm danger" id="trEmpty">Svuota cestino</button>' : ''}</div></div>
      ${list.length ? `<div class="tbl-wrap"><table class="tbl" style="width:100%"><thead><tr><th>Cosa</th><th>Eliminato</th><th>Da</th><th>Resta</th><th></th></tr></thead><tbody>${list.map((x) => `<tr>
        <td><span style="font-size:16px;margin-right:8px">${KIND_ICON[x.kind] || '🗑️'}</span><b>${esc(x.label || x.ref)}</b><br><small class="mut">${esc(x.kindLabel)}</small></td>
        <td>${esc(when(x.t))}</td><td>${esc(x.by || '—')}</td>
        <td>${x.daysLeft <= 3 ? `<span style="color:var(--bad)">${x.daysLeft} ${x.daysLeft === 1 ? 'giorno' : 'giorni'}</span>` : `${x.daysLeft} giorni`}</td>
        <td style="text-align:right;white-space:nowrap"><button class="btn sm pri" data-trres="${esc(x.id)}">Ripristina</button> <button class="btn sm danger" data-trdel="${esc(x.id)}">Elimina per sempre</button></td></tr>`).join('')}</tbody></table></div>` : `<div class="emptyc">${all.length ? 'Nessun elemento corrisponde alla ricerca' : 'Il cestino è vuoto'}</div>`}</div>`;
    $('#trRe').onclick = () => loadT(true);
    $('#trQ').oninput = (e) => { T.q = e.target.value; const p = e.target.selectionStart; draw(); const i = $('#trQ'); i.focus(); i.setSelectionRange(p, p); };
    if ($('#trEmpty')) $('#trEmpty').onclick = async () => {
      if (!(await askDanger('Svuotare il cestino?', `${all.length} ${all.length === 1 ? 'elemento verrà eliminato' : 'elementi verranno eliminati'} per sempre: dopo non si può più ripristinare nulla.`, 'SVUOTA', 'Svuota per sempre', false))) return;
      try { const r = await api('DELETE', '/admin/trash'); toast(`Cestino svuotato: ${r.deleted} eliminati per sempre`); await loadT(true); } catch (e) { toast(e.message, 1); }
    };
    $$('[data-trres]', V).forEach((b) => (b.onclick = async () => {
      const x = all.find((y) => y.id === b.dataset.trres); if (!x) return;
      if (!(await ask(`Ripristinare ${x.kindLabel.toLowerCase()}?`, `<b>${esc(x.label)}</b> torna dov'era${x.kind === 'device' ? ', con le connessioni collegate rimaste in attesa' : x.kind === 'agent' ? ', con i suoi clienti e sotto-agenti' : ''}.`, 'Ripristina'))) return;
      b.disabled = true;
      try { const r = await api('POST', '/admin/trash/' + x.id + '/restore'); toast(`Ripristinato: ${r.label}${r.msg ? ' · ' + r.msg : ''}`); await load().catch(() => {}); await loadT(true); } catch (e) { toast(e.message, 1); b.disabled = false; }
    }));
    $$('[data-trdel]', V).forEach((b) => (b.onclick = async () => {
      const x = all.find((y) => y.id === b.dataset.trdel); if (!x) return;
      if (!(await askDanger('Eliminare per sempre?', `<b>${esc(x.label)}</b> (${esc(x.kindLabel.toLowerCase())}) non si potrà più ripristinare.`, 'ELIMINA', 'Elimina per sempre', false))) return;
      try { await api('DELETE', '/admin/trash/' + x.id); toast('Eliminato per sempre'); await loadT(true); } catch (e) { toast(e.message, 1); }
    }));
  }

  const ra = renderAll;
  window.renderAll = renderAll = function () { ra(); const n = $('.nav[data-v="trash"]'); if (n) { const d = owner() ? '' : 'none'; if (n.style.display !== d) n.style.display = d; } if ($('#v-trash') && $('#v-trash').classList.contains('on')) draw(); };
  const v0 = view;
  window.view = view = function (v) { const r = v0.apply(this, arguments); if (v === 'trash') { draw(); loadT(false); } return r; };
  window.KXTrash = { load: loadT };

  /* ---------- demo ---------- */
  if (typeof DEMO !== 'undefined') {
    const dm = demoApi;
    const TD = (DEMO.trash = DEMO.trash || { items: [
      { id: 'tr000001', kind: 'device', ref: 'x', label: 'Salotto Rossi (KXAB-12CD)', by: 'Tu', t: Date.now() - 2 * 3600e3, exp: Date.now() + 28 * 864e5 },
      { id: 'tr000002', kind: 'agent', ref: '7', label: 'mario-store', by: 'Tu', t: Date.now() - 5 * 864e5, exp: Date.now() + 25 * 864e5 },
      { id: 'tr000003', kind: 'dns', ref: 'd1', label: 'DNS Nord (nord.example.com)', by: 'Tu', t: Date.now() - 20 * 864e5, exp: Date.now() + 10 * 864e5 },
      { id: 'tr000004', kind: 'msg', ref: '12', label: 'Manutenzione sabato (3 clienti)', by: 'agente-luca', t: Date.now() - 28 * 864e5, exp: Date.now() + 2 * 864e5 },
    ] });
    const K = { device: 'Cliente', agent: 'Agente', dns: 'DNS', line: 'Linea collegata', msg: 'Messaggio', apikey: 'Chiave API', vpnloc: 'Località VPN', extlist: 'Lista su app terza' };
    window.demoApi = demoApi = async function (m, p, b) {
      if (!p.startsWith('/admin/trash')) return dm(m, p, b);
      await new Promise((r) => setTimeout(r, 120));
      if (p === '/admin/trash' && m === 'GET') return { days: 30, items: TD.items.map((x) => ({ ...x, kindLabel: K[x.kind] || x.kind, daysLeft: Math.max(0, Math.ceil((x.exp - Date.now()) / 864e5)) })) };
      if (p === '/admin/trash' && m === 'DELETE') { const n = TD.items.length; TD.items = []; return { ok: true, deleted: n }; }
      const r = p.match(/^\/admin\/trash\/(\w+)(\/restore)?$/);
      if (r) { const i = TD.items.findIndex((x) => x.id === r[1]); const x = i >= 0 ? TD.items.splice(i, 1)[0] : null; return { ok: true, label: x ? x.label : '', msg: '' }; }
      return dm(m, p, b);
    };
  }
})();
