/* Panoramica — riquadro «MirkoTeam: online ora» (solo titolare): chi ha l'app aperta adesso e chi è stato
   collegato nelle ultime 24 ore (offline). La scheda completa resta in Pannelli attivazione → MirkoTeam. */
(() => {
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const S = { st: null, list: null, err: '', q: '', off: true, busy: false, at: 0, timer: 0 };
  const isMaster = () => typeof D !== 'undefined' && D.role && D.role !== 'agent';
  const name = () => (S.st && S.st.app && S.st.app.name) || 'MirkoTeam';
  const when = (v) => { if (!v) return '—'; const d = new Date(v.replace(' ', 'T')); if (isNaN(d)) return esc(v); const m = Math.round((Date.now() - d) / 60000); if (m < 1) return 'adesso'; if (m < 60) return `${m} min fa`; if (m < 48 * 60) return `${Math.round(m / 60)} h fa`; return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }); };
  const box = () => {
    const V = $('#v-dash'); if (!V) return null;
    let c = V.querySelector(':scope > [data-orcphome]');
    if (!c) { c = document.createElement('div'); c.dataset.orcphome = '1'; c.className = 'card glass'; c.style.marginTop = '18px'; const k = $('#kpis', V); if (k && k.nextSibling) V.insertBefore(c, k.nextSibling); else V.append(c); }
    return c;
  };
  const dot = (on) => `<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${on ? '#2dd4bf' : '#5b6372'};box-shadow:${on ? '0 0 8px #2dd4bf' : 'none'};margin-right:7px;vertical-align:1px"></span>`;
  /* ORCP tiene una scheda per ogni installazione dell'app e lascia «online» anche quelle vecchie: lo stesso dispositivo
     di un utente (stesso ID, oppure stesso modello sulla stessa rete) compare una volta sola, con la scheda più recente */
  function uniqDev(list) {
    const seen = new Set(), out = [];
    for (const x of [...list].sort((a, b) => (b.online ? 1 : 0) - (a.online ? 1 : 0) || String(b.last || '').localeCompare(String(a.last || '')))) {
      const u = String(x.user || '').toLowerCase(), hw = String(x.device || '').toLowerCase().trim(), ip = String(x.ip || '').trim();
      const ids = [x.did ? 'id:' + x.did : '', hw && ip ? 'hw:' + hw + '|' + ip : ''].filter(Boolean).map((i) => u + '|' + i);
      if (ids.length && ids.some((i) => seen.has(i))) continue;
      ids.forEach((i) => seen.add(i)); out.push(x);
    }
    return out;
  }
  function draw() {
    const c = box(); if (!c) return;
    const L = uniqDev(S.list || []), on = L.filter((x) => x.online), off = L.filter((x) => !x.online);
    const q = S.q.trim().toLowerCase();
    let rows = [...on.sort((a, b) => (b.last || '').localeCompare(a.last || '')), ...(S.off ? off.sort((a, b) => (b.last || '').localeCompare(a.last || '')) : [])];
    if (q) rows = rows.filter((x) => (x.user + ' ' + x.device + ' ' + x.ip).toLowerCase().includes(q));
    const head = `<div class="hd" style="align-items:center;gap:10px;flex-wrap:wrap"><h3>${esc(name())}: online ora<small>${S.st && S.st.connected && !S.list ? 'Connessioni delle ultime 24 ore' : S.st && S.st.connected ? `${on.length} online · ${off.length} offline nelle ultime 24 ore${S.at ? ' · aggiornato ' + new Date(S.at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : ''}` : 'App ORCP'}</small></h3>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-left:auto">${S.st && S.st.connected ? `<input class="inp" data-oq placeholder="Cerca utente…" value="${esc(S.q)}" style="width:150px;padding:6px 10px;font-size:13px"><label class="mut" style="font-size:12.5px;display:flex;gap:6px;align-items:center;cursor:pointer"><input type="checkbox" data-ooff ${S.off ? 'checked' : ''}> Anche offline</label><button class="btn sm" data-orel ${S.busy ? 'disabled' : ''}>${S.busy ? 'Aggiorno…' : '⟳'}</button>` : ''}<button class="btn sm" data-oopen>Apri ${esc(name())}</button></div></div>`;
    let body;
    if (!S.st) body = `<p class="mut" style="margin:6px 0 0">Controllo il collegamento con ${esc(name())}…</p>`;
    else if (!S.st.connected) body = `<p class="mut" style="margin:6px 0 0">${esc(name())} non è collegato: vai in Pannelli attivazione → ${esc(name())} → Collega.</p>`;
    else if (S.err) body = `<p style="color:#ff8f8f;margin:6px 0 0">${esc(S.err)}</p>`;
    else if (!S.list) body = `<p class="mut" style="margin:6px 0 0">Carico le connessioni da ORCP (la prima volta ci vogliono 20-30 secondi)…</p>`;
    else if (!rows.length) body = `<p class="mut" style="margin:6px 0 0">${q ? 'Nessun utente corrisponde alla ricerca.' : S.off ? 'Nessuna connessione nelle ultime 24 ore.' : 'Nessuno online adesso.'}</p>`;
    else {
      const top = rows.slice(0, 400);
      body = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:8px;margin-top:10px;max-height:340px;overflow:auto;padding-right:4px">${top.map((x) => `<div style="padding:9px 11px;border-radius:10px;background:rgba(255,255,255,${x.online ? '.06' : '.025'});border:1px solid ${x.online ? 'rgba(45,212,191,.25)' : 'transparent'};min-width:0">
        <div style="display:flex;align-items:center;gap:6px"><b style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">${dot(x.online)}${esc(x.user || '—')}</b><span class="mut" style="font-size:11.5px;white-space:nowrap">${x.online ? 'online' : when(x.last)}</span></div>
        <div class="mut" style="font-size:12px;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(x.device || '')}${x.version ? ' · ' + esc(x.version) : ''}</div></div>`).join('')}</div>
        ${rows.length > top.length ? `<p class="mut" style="font-size:12.5px;margin:10px 0 0">Mostro ${top.length} di ${rows.length}: l'elenco completo è in Pannelli attivazione → ${esc(name())}.</p>` : ''}`;
    }
    c.innerHTML = head + body;
    const qi = $('[data-oq]', c); if (qi) { qi.oninput = () => { S.q = qi.value; const pos = qi.selectionStart; draw(); const n = $('[data-oq]', c); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch {} } }; }
    const of = $('[data-ooff]', c); if (of) of.onchange = () => { S.off = of.checked; draw(); };
    const rl = $('[data-orel]', c); if (rl) rl.onclick = () => load(true);
    const op = $('[data-oopen]', c); if (op) op.onclick = () => { if (typeof view === 'function') view('orcp'); };
  }
  async function load(fresh) {
    if (!isMaster()) return;
    try {
      if (!S.st || fresh) S.st = await api('GET', '/admin/orcp/state');
      if (!S.st.connected) { S.list = null; draw(); return; }
      S.busy = true; S.err = ''; draw();
      { const r = await api('GET', '/admin/orcp/data?w=conns' + (fresh ? '&fresh=1' : '')); S.list = (r && r.list) || []; S.at = Date.now(); }
    } catch (e) { S.err = e.message || 'Errore'; if (/scaduto|non è collegato/.test(S.err)) { S.st = { connected: false }; S.err = ''; } }
    S.busy = false; draw();
  }
  const visible = () => { const v = $('#v-dash'); return v && v.classList.contains('on') && !document.hidden; };
  /* parte quando il ruolo è noto; poi si aggiorna ogni 2 minuti finché la Panoramica è aperta (il server risponde subito con l'ultima lista e la rinnova in sottofondo) */
  const tick = setInterval(() => { if (typeof D === 'undefined' || !D.role) return; clearInterval(tick); if (!isMaster()) return; draw(); load(); S.timer = setInterval(() => { if (visible() && !S.busy && Date.now() - S.at > 115000) load(); }, 10000); }, 800);
  window.KXOrcpHome = { reload: () => load(true) };
})();
