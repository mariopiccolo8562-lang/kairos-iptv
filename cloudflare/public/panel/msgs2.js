/* KAIROS Control — Messaggi: ai clienti (tutti, uno o un gruppo scelto) e, solo per il titolare, agli agenti
   (tutti, uno o un gruppo). Gli agenti scrivono solo ai loro clienti (uno, un gruppo o tutti i loro) e vedono
   in alto i messaggi che il titolare manda a loro. */
(() => {
  const css = document.createElement('style');
  css.textContent = `.ms-seg{display:flex;gap:6px;flex-wrap:wrap;margin:2px 0 12px}
.ms-seg button{padding:8px 14px;border-radius:12px;border:1px solid var(--line);background:rgba(255,255,255,.03);color:#eef1f8;font:inherit;font-weight:700;cursor:pointer}
.ms-seg button.on{background:var(--c,#4f8cff);border-color:transparent;color:#fff;box-shadow:0 8px 22px -14px var(--c,#4f8cff)}
.ms-seg.who button{--c:#a78bfa}.ms-seg.mode button{--c:#22c55e}
.ms-pick{border:1px solid var(--line);border-radius:12px;padding:10px;margin-bottom:6px;background:rgba(255,255,255,.02)}
.ms-pick .ms-tools{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:8px}.ms-pick .ms-tools .inp{flex:1;min-width:160px;margin:0}
.ms-list{max-height:260px;overflow:auto;display:flex;flex-direction:column;gap:2px}
.ms-list label{display:flex;align-items:center;gap:10px;padding:7px 9px;border-radius:9px;cursor:pointer;font-size:13.5px}.ms-list label:hover{background:rgba(255,255,255,.04)}
.ms-list label small{color:var(--mut);margin-left:auto;font-size:12px}.ms-list input{width:16px;height:16px;accent-color:#22c55e}
.ms-cnt{font-size:13px;font-weight:700;color:#86efac}
.ms-tag{display:inline-block;font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px;margin-right:6px;background:rgba(79,140,255,.18);color:#9cc0ff}.ms-tag.ag{background:rgba(167,139,250,.2);color:#c4b5fd}
#msLt{flex-direction:row!important;flex-wrap:nowrap!important;flex-shrink:0}
#agInbox{display:flex;flex-direction:column;gap:8px;margin:0 0 14px}
#agInbox .ib{display:flex;gap:12px;align-items:flex-start;padding:12px 14px;border-radius:14px;border:1px solid color-mix(in srgb,var(--c) 50%,transparent);border-left:4px solid var(--c);background:color-mix(in srgb,var(--c) 12%,transparent)}
#agInbox .ib b{display:block}#agInbox .ib small{display:block;color:var(--mut);font-size:12px;margin-top:3px}#agInbox .ib .sp{flex:1}`;
  document.head.appendChild(css);
  const isAg = () => D.role === 'agent';
  const LV = { info: ['Informazione', '#4f8cff'], warn: ['Avviso', '#f5b041'], urgent: ['Urgente', '#ef4444'] };
  const st = { who: 'cli', mode: 'all', one: '', sel: new Set(), q: '', f: 'all' };
  const card = $('#mTo') && $('#mTo').closest('.card');
  if (!card) return;
  const prims = () => (D.devices || []).filter((d) => !d.parent);
  const daysLeft2 = (d) => (d.expires ? Math.ceil((new Date(d.expires) - Date.now()) / 864e5) : null);
  const CF = [['all', 'Tutti'], ['active', 'Attivi'], ['soon', 'In scadenza'], ['expired', 'Scaduti']];
  const fitC = (d) => st.f === 'all' || (st.f === 'soon' ? d.status === 'active' && daysLeft2(d) !== null && daysLeft2(d) <= 14 : d.status === st.f);
  const items = () => (st.who === 'ag' ? (D.agents || []).map((a) => ({ id: String(a.id), n: a.username, s: a.active ? 'attivo' : 'disattivato' }))
    : prims().filter(fitC).map((d) => ({ id: d.id, n: d.name || d.code, s: d.code })));
  const qf = (x) => !st.q || (x.n + ' ' + x.s).toLowerCase().includes(st.q);
  function draw() {
    const ag = isAg(); if (ag) st.who = 'cli';
    const toAg = st.who === 'ag';
    const modes = toAg ? [['all', 'Tutti gli agenti'], ['one', 'Un agente'], ['grp', 'Gruppo di agenti']] : [['all', ag ? 'Tutti i miei clienti' : 'Tutti i clienti'], ['one', 'Un cliente'], ['grp', 'Gruppo di clienti']];
    const list = items().filter(qf);
    const pick = st.mode === 'one'
      ? `<div class="ms-pick"><div class="ms-tools"><input class="inp" id="msQ" placeholder="Cerca ${toAg ? 'agente' : 'nome o codice'}" value="${esc(st.q)}"></div><select class="inp" id="msOne" size="7" style="height:auto;margin:0">${list.map((x) => `<option value="${esc(x.id)}" ${x.id === st.one ? 'selected' : ''}>${esc(x.n)} · ${esc(x.s)}</option>`).join('')}</select></div>`
      : st.mode === 'grp'
        ? `<div class="ms-pick"><div class="ms-tools"><input class="inp" id="msQ" placeholder="Cerca ${toAg ? 'agente' : 'nome o codice'}" value="${esc(st.q)}">${toAg ? '' : `<select class="inp" id="msF" style="width:auto;min-width:0;flex:0">${CF.map(([k, l]) => `<option value="${k}" ${st.f === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`}<button class="btn sm" id="msAll">Seleziona visibili</button><button class="btn sm" id="msNone">Nessuno</button></div>
          <div class="ms-list" id="msList">${list.map((x) => `<label><input type="checkbox" data-msx="${esc(x.id)}" ${st.sel.has(x.id) ? 'checked' : ''}>${esc(x.n)}<small>${esc(x.s)}</small></label>`).join('') || '<p class="mut" style="margin:6px">Nessuno</p>'}</div>
          <div class="ms-cnt" id="msCnt">${st.sel.size} selezionati</div></div>` : '';
    card.innerHTML = `<div class="hd"><h3>Nuovo messaggio<small>${toAg ? 'Compare in alto nel pannello dell\'agente' : 'Compare sulle TV dei clienti all\'avvio e mentre usano l\'app'}</small></h3></div>
      ${ag ? '' : `<div class="ms-seg who"><button data-msw="cli" class="${!toAg ? 'on' : ''}">📺 Ai clienti</button><button data-msw="ag" class="${toAg ? 'on' : ''}">🧑‍💼 Agli agenti</button></div>`}
      <label class="lbl">Destinatari</label><div class="ms-seg mode">${modes.map(([k, l]) => `<button data-msm="${k}" class="${st.mode === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      ${pick}
      <label class="lbl">Titolo</label><input class="inp" id="mTitle" maxlength="80" placeholder="es. Manutenzione stasera" value="${esc(st.title || '')}">
      <label class="lbl">Testo</label><textarea class="inp" id="mBody" rows="4" maxlength="600" placeholder="${toAg ? 'es. Da lunedì nuovi prezzi per i rinnovi.' : 'es. Dalle 23 alle 24 alcuni canali potrebbero non funzionare.'}">${esc(st.body || '')}</textarea>
      <div class="row"><div><label class="lbl">Tipo</label><select class="inp" id="mLvl">${Object.entries(LV).map(([k, [l]]) => `<option value="${k}" ${st.lvl === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div><label class="lbl">Visibile per</label><select class="inp" id="mDays">${[[1, '1 giorno'], [3, '3 giorni'], [7, '7 giorni'], [30, '30 giorni'], [0, 'Sempre']].map(([v, l]) => `<option value="${v}" ${String(st.days ?? 7) === String(v) ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
      <button class="btn pri" id="mSend2" style="margin-top:14px">Invia messaggio</button>
      ${toAg ? '' : '<p class="mut" style="font-size:12px;margin-top:10px">I clienti ricevono anche da soli un avviso 2 giorni prima della scadenza dell\'abbonamento.</p>'}`;
    const keep = () => { st.title = $('#mTitle').value; st.body = $('#mBody').value; st.lvl = $('#mLvl').value; st.days = $('#mDays').value; };
    $$('[data-msw]', card).forEach((b) => (b.onclick = () => { keep(); st.who = b.dataset.msw; st.mode = 'all'; st.sel.clear(); st.one = ''; st.q = ''; draw(); }));
    $$('[data-msm]', card).forEach((b) => (b.onclick = () => { keep(); st.mode = b.dataset.msm; st.q = ''; draw(); }));
    const q = $('#msQ'); if (q) q.oninput = () => { keep(); st.q = q.value.toLowerCase().trim(); const p = q.selectionStart; draw(); const q2 = $('#msQ'); q2.focus(); q2.setSelectionRange(p, p); };
    if ($('#msF')) $('#msF').onchange = (e) => { keep(); st.f = e.target.value; draw(); };
    if ($('#msOne')) $('#msOne').onchange = (e) => (st.one = e.target.value);
    $$('[data-msx]', card).forEach((c) => (c.onchange = () => { c.checked ? st.sel.add(c.dataset.msx) : st.sel.delete(c.dataset.msx); $('#msCnt').textContent = st.sel.size + ' selezionati'; }));
    if ($('#msAll')) $('#msAll').onclick = () => { keep(); list.forEach((x) => st.sel.add(x.id)); draw(); };
    if ($('#msNone')) $('#msNone').onclick = () => { keep(); st.sel.clear(); draw(); };
    $('#mSend2').onclick = async () => {
      keep();
      const base = { title: st.title.trim(), body: st.body.trim(), level: st.lvl || 'info', days: +st.days || 0 };
      if (!base.title && !base.body) return toast('Scrivi il titolo o il testo', 1);
      let b;
      if (st.mode === 'one') { if (!st.one) return toast(toAg ? 'Scegli l\'agente' : 'Scegli il cliente', 1); b = toAg ? { target: st.one } : { target: st.one }; }
      else if (st.mode === 'grp') { if (!st.sel.size) return toast('Seleziona almeno un destinatario', 1); b = { targets: [...st.sel] }; }
      else b = { target: ag ? 'mine' : 'all' };
      const n = st.mode === 'all' ? (toAg ? (D.agents || []).length : prims().length) : st.mode === 'one' ? 1 : st.sel.size;
      if (st.mode !== 'one' && !(await ask('Inviare il messaggio?', `Lo ricevono <b>${n}</b> ${toAg ? 'agenti' : 'clienti'}${st.mode === 'all' ? ` (${toAg ? 'tutti gli agenti' : ag ? 'tutti i tuoi clienti' : 'tutti i clienti'})` : ''}.`, 'Invia'))) return;
      try {
        const r = await api('POST', toAg ? '/admin/agent-msgs' : '/admin/messages', { ...base, ...b });
        st.title = st.body = ''; st.sel.clear(); st.one = '';
        await load(); toast(toAg ? `Messaggio inviato a ${r && r.sent && b.target !== 'all' ? r.sent + ' agenti' : 'tutti gli agenti'}` : `Messaggio inviato${r && r.sent > 1 ? ' a ' + r.sent + ' clienti' : ''}: comparirà sulle TV entro pochi minuti`);
      } catch (e) { toast(e.message, 1); }
    };
  }
  // elenco dei messaggi attivi
  let lt = 'cli';
  function list() {
    const box = $('#mList'); if (!box) return;
    const ag = isAg(), now = Date.now();
    // nomi cercati in una tabella fatta una volta (prima: tutto l'elenco dei clienti scorso per ogni messaggio)
    let dm = null, am = null;
    const devName = (id) => { if (!dm) { dm = new Map(); for (const x of D.devices || []) if (!dm.has(x.id)) dm.set(x.id, x); } const d = dm.get(id); return d ? d.name || d.code : 'cliente eliminato'; };
    const agName = (id) => { if (!am) { am = new Map(); for (const x of D.agents || []) { const k = String(x.id); if (!am.has(k)) am.set(k, x); } } const a = am.get(String(id)); return a ? a.username : 'agente eliminato'; };
    const rows = (lt === 'ag' && !ag ? D.agentMsgs || [] : D.messages || []).filter((m) => !m.until || m.until > now);
    const to = (m) => lt === 'ag' && !ag ? (m.target === 'all' ? '<span class="ms-tag ag">Tutti gli agenti</span>' : m.target === 'group' ? `<span class="ms-tag ag">Gruppo · ${m.targets.length} agenti</span>${esc(m.targets.slice(0, 4).map(agName).join(', '))}${m.targets.length > 4 ? '…' : ''}` : `<span class="ms-tag ag">Agente</span>${esc(agName(m.target))}`)
      : (m.target === 'all' ? '<span class="ms-tag">Tutti i clienti</span>' : m.target === 'group' ? `<span class="ms-tag">Gruppo · ${m.targets.length} clienti</span>${esc(m.targets.slice(0, 4).map(devName).join(', '))}${m.targets.length > 4 ? '…' : ''}` : `<span class="ms-tag">Cliente</span>${esc(devName(m.target))}`);
    const head = box.closest('.card').querySelector('.hd');
    if (head && !ag && !$('#msLt')) head.insertAdjacentHTML('beforeend', '<div class="ms-seg who" id="msLt" style="margin:0"><button data-mlt="cli" class="on">Clienti</button><button data-mlt="ag">Agenti</button></div>');
    $$('[data-mlt]').forEach((b) => { b.classList.toggle('on', b.dataset.mlt === lt); b.onclick = () => { lt = b.dataset.mlt; list(); }; });
    box.innerHTML = rows.length ? rows.map((m) => `<div class="mini"><div class="ic" style="color:${(LV[m.level] || LV.info)[1]}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 5h16v11H8l-4 4z"/></svg></div><div class="tx"><b>${esc(m.title || '(senza titolo)')}</b><small style="display:block">${esc(String(m.body || '').slice(0, 140))}</small><small style="display:block;margin-top:4px">${to(m)} · ${new Date(m.created).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })}${m.until ? ' · fino al ' + new Date(m.until).toLocaleDateString('it-IT') : ''}</small></div><button class="icb" title="Elimina" data-mdel2="${m.id}">✕</button></div>`).join('') : '<p class="mut">Nessun messaggio attivo.</p>';
    $$('[data-mdel2]', box).forEach((b) => (b.onclick = async () => { if (!(await ask('Eliminare il messaggio?', lt === 'ag' && !isAg() ? 'Il messaggio all\'agente viene tolto.' : 'Finisce nel Cestino: puoi ripristinarlo entro 30 giorni.', 'Elimina'))) return; try { await api('DELETE', (lt === 'ag' && !isAg() ? '/admin/agent-msgs/' : '/admin/messages/') + b.dataset.mdel2); await load(); toast('Messaggio eliminato'); } catch (e) { toast(e.message, 1); } }));
  }
  // messaggi del titolare in alto nel pannello dell'agente
  const readSet = () => { try { return new Set(JSON.parse(localStorage.getItem('kc_inbox_read') || '[]')); } catch { return new Set(); } };
  function inbox() {
    let box = $('#agInbox');
    const show = isAg() && !window.__assist ? (D.inbox || []).filter((m) => !readSet().has(m.id)) : [];
    if (!show.length) { if (box) box.remove(); return; }
    if (!box) { box = document.createElement('div'); box.id = 'agInbox'; const anchor = $('#hubBar') || $('.topbar'); anchor.after(box); }
    const html = show.slice(0, 5).map((m) => `<div class="ib" style="--c:${(LV[m.level] || LV.info)[1]}"><span style="font-size:18px">📩</span><div><b>${esc(m.title || 'Messaggio dal titolare')}</b>${m.body ? `<div style="font-size:13.5px;margin-top:2px;white-space:pre-wrap">${esc(m.body)}</div>` : ''}<small>Dal titolare · ${new Date(m.created).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })}</small></div><span class="sp"></span><button class="btn sm" data-ibok="${m.id}">Ho letto</button></div>`).join('');
    if (box.innerHTML !== html) box.innerHTML = html;
    $$('[data-ibok]', box).forEach((b) => (b.onclick = () => { const s = readSet(); s.add(+b.dataset.ibok); try { localStorage.setItem('kc_inbox_read', JSON.stringify([...s].slice(-200))); } catch {} inbox(); }));
  }
  window.renderMsgs = renderMsgs = function () { if (!$('#mSend2') || !card.contains(document.activeElement)) draw(); list(); };
  const ra = renderAll;
  window.renderAll = renderAll = function () { ra(); inbox(); };
  const a0 = api;
  window.api = api = async function (m, p, b) { const r = await a0(m, p, b); if (p === '/admin/state' && m === 'GET' && r) { D.agentMsgs = r.agentMsgs || []; D.inbox = r.inbox || []; } return r; };
  if (typeof DEMO !== 'undefined') {
    DEMO.agentMsgs = DEMO.agentMsgs || [];
    const dm = demoApi;
    window.demoApi = demoApi = async function (m, p, b) {
      if (p === '/admin/messages' && m === 'POST' && (Array.isArray(b.targets) || b.target === 'mine')) { const ids = b.targets || DEMO.devices.filter((d) => !d.parent).map((d) => d.id); const g = 'g' + Date.now(); DEMO.messages = [...ids.map((t, i) => ({ id: Date.now() + i, target: t, grp: ids.length > 1 ? g : '', title: b.title, body: b.body, level: b.level, created: Date.now(), until: b.days ? Date.now() + b.days * 864e5 : 0 })), ...(DEMO.messages || [])]; return { ok: true, sent: ids.length }; }
      if (p === '/admin/agent-msgs' && m === 'POST') { const ids = b.target === 'all' ? ['all'] : (b.targets || [b.target]).map(String); const g = ids.length > 1 ? 'g' + Date.now() : ''; ids.forEach((t, i) => DEMO.agentMsgs.unshift({ id: Date.now() + i, target: t, grp: g, title: b.title, body: b.body, level: b.level, created: Date.now(), until: b.days ? Date.now() + b.days * 864e5 : 0 })); return { ok: true, sent: ids.length }; }
      const da = p.match(/^\/admin\/agent-msgs\/(\d+)$/); if (da && m === 'DELETE') { const x = DEMO.agentMsgs.find((y) => String(y.id) === da[1]); DEMO.agentMsgs = DEMO.agentMsgs.filter((y) => x && x.grp ? y.grp !== x.grp : String(y.id) !== da[1]); return { ok: true }; }
      const dmm = p.match(/^\/admin\/messages\/(\d+)$/); if (dmm && m === 'DELETE') { const x = (DEMO.messages || []).find((y) => String(y.id) === dmm[1]); if (x && x.grp) { DEMO.messages = DEMO.messages.filter((y) => y.grp !== x.grp); return { ok: true }; } }
      const r = await dm(m, p, b);
      if (p === '/admin/state' && m === 'GET' && r) {
        const grp = (rows) => { const out = [], by = new Map(); for (const x of rows) { if (!x.grp) { out.push({ ...x, targets: [x.target] }); continue; } const g = by.get(x.grp); if (g) { g.targets.push(x.target); continue; } const y = { ...x, target: 'group', targets: [x.target] }; by.set(x.grp, y); out.push(y); } return out; };
        if (r.role === 'agent') { r.messages = grp((DEMO.messages || []).filter((x) => (r.devices || []).some((d) => d.id === x.target))); r.inbox = DEMO.agentMsgs.filter((x) => x.target === 'all' || x.target === '2').map(({ id, title, body, level, created }) => ({ id, title, body, level, created })); }
        else { r.messages = grp(DEMO.messages || []); r.agentMsgs = grp(DEMO.agentMsgs); }
      }
      return r;
    };
  }
  for (const ev of ['input', 'change']) card.addEventListener(ev, (e) => e.stopPropagation()); // non conta tra le «modifiche non salvate»
  draw();
})();
