/* Guida in fondo alla Panoramica: «Attivare una linea IPTV e metterla sulle app». Il titolare la scrive e decide
   se la vedono tutti gli agenti, solo alcuni o nessuno; l'agente la legge soltanto. */
(() => {
  const isAg = () => D.role === 'agent';
  const G = { data: null, edit: false, busy: false, loaded: false };
  const css = document.createElement('style');
  css.textContent = `#kxGuide{margin-top:18px}#kxGuide .gd-h{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:8px}
#kxGuide .gd-b{font-size:14px;line-height:1.55}#kxGuide .gd-b h4{margin:14px 0 6px;font-size:15px}#kxGuide .gd-b h4:first-child{margin-top:0}
#kxGuide .gd-b ol,#kxGuide .gd-b ul{margin:4px 0 8px 22px;padding:0}#kxGuide .gd-b li{margin:3px 0}#kxGuide .gd-b p{margin:6px 0}
#kxGuide textarea.inp{min-height:320px;font-family:inherit;line-height:1.5;resize:vertical}
#kxGuide .gd-ag{display:flex;flex-wrap:wrap;gap:6px 14px;margin-top:8px}#kxGuide .gd-ag label{display:flex;gap:6px;align-items:center;font-size:13px}
#kxGuide .gd-sh label{display:flex;gap:8px;align-items:center;margin:6px 0;font-size:13.5px}`;
  document.head.appendChild(css);

  /* testo semplice → HTML: «# Titolo», «1. passo», «- punto», **grassetto**, righe vuote = paragrafo */
  function md(t) {
    const inl = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<span class="mono">$1</span>');
    const out = []; let list = null;
    const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
    for (const raw of String(t || '').split(/\r?\n/)) {
      const l = raw.trim();
      if (!l) { close(); continue; }
      let m;
      if ((m = l.match(/^#+\s*(.+)$/))) { close(); out.push(`<h4>${inl(m[1])}</h4>`); continue; }
      if ((m = l.match(/^(\d+)[.)]\s+(.+)$/))) { if (list !== 'ol') { close(); out.push('<ol>'); list = 'ol'; } out.push(`<li>${inl(m[2])}</li>`); continue; }
      if ((m = l.match(/^[-•*]\s+(.+)$/))) { if (list !== 'ul') { close(); out.push('<ul>'); list = 'ul'; } out.push(`<li>${inl(m[1])}</li>`); continue; }
      close(); out.push(`<p>${inl(l)}</p>`);
    }
    close(); return out.join('');
  }

  function box() {
    let el = $('#kxGuide');
    if (!el) { const dash = $('#v-dash'); if (!dash) return null; el = document.createElement('div'); el.id = 'kxGuide'; el.className = 'card glass'; dash.appendChild(el); }
    return el;
  }

  function render() {
    const el = box(); if (!el) return;
    const g = G.data;
    if (!g) { el.style.display = 'none'; return; }
    el.style.display = '';
    const shareTxt = { all: 'la vedono tutti gli agenti', some: `la vedono ${(g.agents || []).length} agenti`, none: 'la vedi solo tu' }[g.share || 'none'];
    const noticeTxt = g.noticeAt && g.share !== 'none' ? ` · 📣 avviso del ${new Date(g.noticeAt).toLocaleDateString('it-IT')}: aperta da ${(g.readBy || []).length} ${(g.readBy || []).length === 1 ? 'venditore' : 'venditori'}` : '';
    if (!G.edit) {
      el.innerHTML = `<div class="gd-h"><div><b style="font-size:16px">📘 ${esc(g.title || 'Guida')}</b>${isAg() ? '' : `<div class="mut" style="font-size:12.5px;margin-top:2px">Guida per te e per i venditori · ${shareTxt}${noticeTxt}</div>`}</div>
        ${isAg() ? '' : `<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn sm pri" data-g="share">👥 Mostra ai venditori</button><button class="btn sm" data-g="edit">✏️ Modifica</button></div>`}</div>
        <div class="gd-b">${md(g.text)}</div>`;
      const b = el.querySelector('[data-g="edit"]'); if (b) b.onclick = () => { G.edit = true; render(); };
      const sh = el.querySelector('[data-g="share"]'); if (sh) sh.onclick = shareDlg;
      return;
    }
    const ags = (D.agents || []).slice().sort((a, b) => String(a.username || '').localeCompare(String(b.username || '')));
    const sel = new Set((g.agents || []).map(String));
    el.innerHTML = `<div class="gd-h"><b style="font-size:16px">✏️ Modifica la guida</b><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn sm" data-g="reset">Testo iniziale</button><button class="btn sm" data-g="cancel">Annulla</button><button class="btn pri sm" data-g="save">Salva</button></div></div>
      <label>Titolo<input class="inp" id="gdTitle" maxlength="120" value="${esc(g.title || '')}"></label>
      <label style="display:block;margin-top:10px">Testo <small class="mut">(«# Titolo» per i paragrafi, «1.» per i passi, «-» per gli elenchi, **grassetto**)</small><textarea class="inp" id="gdText" maxlength="20000">${esc(g.text || '')}</textarea></label>
      <div class="gd-sh" style="margin-top:12px"><b style="font-size:14px">Chi la vede</b>
        <label><input type="radio" name="gdShare" value="none" ${g.share === 'none' || !g.share ? 'checked' : ''}> Solo io</label>
        <label><input type="radio" name="gdShare" value="all" ${g.share === 'all' ? 'checked' : ''}> Tutti gli agenti</label>
        <label><input type="radio" name="gdShare" value="some" ${g.share === 'some' ? 'checked' : ''}> Solo questi agenti</label>
        <div class="gd-ag" id="gdAg" style="${g.share === 'some' ? '' : 'display:none'}">${ags.length ? ags.map((a) => `<label><input type="checkbox" value="${esc(String(a.id))}" ${sel.has(String(a.id)) ? 'checked' : ''}> ${esc(a.username || a.name || a.id)}</label>`).join('') : '<span class="mut">Non hai ancora agenti</span>'}</div></div>
      <label style="display:flex;gap:8px;align-items:center;margin-top:10px;font-size:13.5px"><input type="checkbox" id="gdNotify"> 📣 Avvisa i venditori all'apertura del pannello («Nuova guida da leggere»)</label>
      <div class="mut" style="font-size:12.5px;margin-top:10px">L'agente la vede in fondo alla sua Panoramica, solo in lettura. Puoi cambiarla quando vuoi.</div>`;
    el.querySelectorAll('[name="gdShare"]').forEach((r) => { r.onchange = () => { $('#gdAg').style.display = r.value === 'some' && r.checked ? '' : 'none'; }; });
    el.querySelector('[data-g="cancel"]').onclick = () => { G.edit = false; render(); };
    el.querySelector('[data-g="reset"]').onclick = () => { if (!confirm('Rimettere il testo iniziale della guida? Il tuo testo attuale va perso.')) return; $('#gdText').value = g.defText || ''; $('#gdTitle').value = g.defTitle || ''; };
    el.querySelector('[data-g="save"]').onclick = save;
  }

  /* «Mostra ai venditori»: scegli a chi mostrare la guida senza aprire l'editor (Tutti / solo alcuni, con le spunte) */
  async function shareDlg() {
    const g = G.data; if (!g || G.busy) return;
    if (!(D.agents || []).length) { try { const r = await api('GET', '/admin/agents'); D.agents = r.agents || r.items || r || []; } catch { D.agents = []; } }
    const ags = (D.agents || []).slice().sort((a, b) => String(a.username || '').localeCompare(String(b.username || ''))), sel = new Set((g.agents || []).map(String));
    const ck = (v, on) => `<input type="checkbox" value="${esc(String(v))}" ${on ? 'checked' : ''}>`;
    const html = `<div style="display:grid;gap:8px">
      <label><input type="radio" name="gsM" value="none" ${!g.share || g.share === 'none' ? 'checked' : ''}> Solo io</label>
      <label><input type="radio" name="gsM" value="all" ${g.share === 'all' ? 'checked' : ''}> <b>Tutti i venditori</b> (anche quelli che aggiungerai)</label>
      <label><input type="radio" name="gsM" value="some" ${g.share === 'some' ? 'checked' : ''}> Solo questi venditori:</label>
      <div id="gsAg" style="display:grid;gap:5px;max-height:240px;overflow:auto;padding-left:22px">${ags.length ? ags.map((a) => `<label style="display:flex;gap:8px;align-items:center">${ck(a.id, sel.has(String(a.id)))}<span class="mono">${esc(a.username || a.name || a.id)}</span>${a.name && a.username ? `<small class="mut">${esc(a.name)}</small>` : ''}</label>`).join('') : '<small class="mut">Non hai ancora venditori: creali in Agenti.</small>'}</div>
      <label style="display:flex;gap:8px;align-items:flex-start;margin-top:6px;padding-top:8px;border-top:1px solid var(--line,rgba(255,255,255,.08))"><input type="checkbox" id="gsN" checked style="margin-top:3px"><span>📣 <b>Avvisali all'apertura del pannello</b><br><small class="mut">Al prossimo accesso vedono «Nuova guida da leggere» con il pulsante per aprirla, finché non la aprono.</small></span></label>
      <p class="mut" style="font-size:12px;margin:0">I venditori vedono la guida nella loro Panoramica, senza il pulsante Modifica.</p></div>`;
    if (!(await ask('Chi vede la guida', html, 'Salva'))) return;
    const share = (document.querySelector('[name="gsM"]:checked') || {}).value || 'none', agents = [...document.querySelectorAll('#gsAg input:checked')].map((x) => x.value), notify = !!($('#gsN') && $('#gsN').checked);
    G.busy = true;
    try { const r = await api('PUT', '/admin/guide', { title: g.title, text: g.text, share: share === 'some' && !agents.length ? 'none' : share, agents, notify }); G.data = r.guide; toast(share === 'none' ? 'Guida visibile solo a te' : (share === 'all' ? 'Guida mostrata a tutti i venditori' : `Guida mostrata a ${agents.length} venditori`) + (notify ? ', avviso al prossimo accesso' : '')); }
    catch (e) { toast(e.message, 1); }
    G.busy = false; render();
  }

  async function save() {
    if (G.busy) return; G.busy = true;
    const share = (el => el ? el.value : 'none')(document.querySelector('[name="gdShare"]:checked'));
    const body = { title: $('#gdTitle').value.trim(), text: $('#gdText').value, share, agents: [...document.querySelectorAll('#gdAg input:checked')].map((x) => x.value), notify: !!($('#gdNotify') && $('#gdNotify').checked) };
    try { const r = await api('PUT', '/admin/guide', body); G.data = r.guide; G.edit = false; toast('Guida salvata'); render(); }
    catch (e) { toast(e.message, 1); }
    G.busy = false;
  }

  async function load() {
    if (G.loaded || G.busy) return; G.busy = true;
    try { const r = await api('GET', '/admin/guide'); G.data = r.guide || null; G.loaded = true; } catch (e) { G.data = null; }
    G.busy = false; render();
    if (isAg() && G.data && G.data.notice) notice();
  }
  /* agente: «Nuova guida da leggere» all'apertura del pannello, finché non la apre («Più tardi» la ripresenta al prossimo accesso) */
  async function notice() {
    const g = G.data; if (!g || G.noticed) return; G.noticed = true;
    const no = $('#mNo'), oldNo = no ? no.textContent : ''; if (no) no.textContent = 'Più tardi';
    const ok = await ask('📘 Nuova guida da leggere', `Il titolare ti chiede di leggere la guida <b>«${esc(g.title || 'Guida')}»</b>: la trovi in fondo alla Panoramica.`, 'Apri la guida');
    if (no) no.textContent = oldNo || 'Annulla';
    if (!ok) return;
    try { await api('POST', '/admin/guide/read'); } catch {}
    G.data.notice = false;
    if (typeof view === 'function') view('dash');
    const el = $('#kxGuide'); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); el.animate([{ boxShadow: '0 0 0 3px var(--pri,#4f7cff)' }, { boxShadow: '0 0 0 0 transparent' }], { duration: 2200 }); }
  }
  /* parte quando la Panoramica è visibile e il ruolo è noto */
  const tick = setInterval(() => { if (!D.role) return; if (!G.loaded) load(); else clearInterval(tick); }, 800);
  window.KXGuide = { reload: () => { G.loaded = false; load(); } };
})();
