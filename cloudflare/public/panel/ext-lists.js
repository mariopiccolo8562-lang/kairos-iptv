/* KAIROS Control — App → «Crea lista»: carichi una lista su OrbixPlay o MaxPlayer scrivendo utente e password
   (e l'ID del dispositivo per OrbixPlay), senza creare un cliente Kairos. Titolare e agenti con il permesso
   «Attivare OrbixPlay e MaxPlayer dal pannello». Il DNS si sceglie per nome; chiavi e indirizzi restano nel pannello. */
(() => {
  const css = document.createElement('style');
  css.textContent = `.xl-apps{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}
.xl-apps button{display:flex;align-items:center;gap:10px;padding:10px 16px;border-radius:14px;border:1px solid var(--line);background:rgba(255,255,255,.03);color:#eef1f8;font:inherit;font-weight:700;cursor:pointer}
.xl-apps button i{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;font-style:normal;font-size:11px;font-weight:800;background:rgba(79,140,255,.2);color:#8fb3ff}
.xl-apps button.mx i{background:rgba(251,113,133,.2);color:#fda4af}
.xl-apps button.on{border-color:#22c55e;background:rgba(34,197,94,.14);box-shadow:0 8px 22px -14px #22c55e}
.xl-apps button:disabled{opacity:.45;cursor:not-allowed}
.xl-g{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}.xl-g .inp{margin:0}
.xl-g label{display:block;font-size:12px;color:var(--mut);font-weight:600;letter-spacing:.04em;text-transform:uppercase;margin-bottom:5px}`;
  document.head.appendChild(css);
  const isAg = () => D.role === 'agent';
  const canUse = () => !isAg() || !!(((D.me || {}).perms) || {}).players;
  TITLES.xlist = 'Crea lista';
  const side = $('#side'), dash = $('#v-dash');
  if (side && !$('.nav[data-v="xlist"]')) { const b = document.createElement('button'); b.className = 'nav'; b.dataset.v = 'xlist'; b.textContent = 'Crea lista'; b.style.display = 'none'; b.onclick = () => view('xlist'); side.appendChild(b); }
  if (dash && !$('#v-xlist')) { const s = document.createElement('section'); s.className = 'view'; s.id = 'v-xlist'; dash.after(s); }

  const F = { app: 'orbix', name: '', id: '', u: '', p: '', dns: '', note: '' };
  let L = null, doms = null, domsT = 0, domsK = '', busy = false;
  const P = () => D.players || {};
  // DNS di MaxPlayer: si rileggono se sono passati più di 60 s o se il titolare ha cambiato quelli concessi all'agente
  const domsKey = () => JSON.stringify([D.role, ((D.me || {}).perms || {}).mxDns || null]);
  async function loadDoms() { if (!P().max || (doms && !doms.err && Date.now() - domsT < 60e3 && domsK === domsKey())) return; const k = domsKey(); if (!doms || domsK !== k) doms = null; try { const l = (await api('GET', '/admin/maxplayer/domains')).domains || []; doms = l; } catch (e) { doms = []; doms.err = e.message; } domsT = Date.now(); domsK = k; draw(); }
  async function loadL() { try { L = await api('GET', '/admin/ext-lists'); } catch (e) { L = { lists: [], err: e.message }; } draw(); }
  const read = () => { const v = (id) => ($('#' + id) || {}).value || ''; Object.assign(F, { name: v('xlN').trim(), id: v('xlI').trim(), u: v('xlU').trim(), p: v('xlP'), dns: v('xlD'), note: v('xlNo').trim() }); };
  function draw() {
    const V = $('#v-xlist'); if (!V || !V.classList.contains('on')) return;
    const ok = { orbix: !!P().orbix, max: !!P().max };
    if (!ok[F.app] && ok.max) F.app = 'max';
    const orbDns = ((P().dns || {}).orbix) || [];
    const dnsHtml = F.app === 'orbix'
      ? (orbDns.length ? `<select class="inp" id="xlD">${orbDns.map((x, i) => `<option value="${i}" ${String(i) === String(F.dns || 0) ? 'selected' : ''}>${esc(x.name)}${x.host ? ' — ' + esc(x.host.replace(/^https?:\/\//, '')) : ''}</option>`).join('')}</select>` : '<small class="mut">Nessun DNS di OrbixPlay impostato</small>')
      : (!doms ? '<small class="mut">Carico i DNS di MaxPlayer…</small>' : doms.length ? `<select class="inp" id="xlD">${doms.map((x) => `<option value="${esc(x.id)}" ${x.id === F.dns ? 'selected' : ''}>${esc(x.label || x.domain || 'DNS ' + x.id)}</option>`).join('')}</select>` : `<small class="mut">${esc(doms.err || 'Nessun DNS su MaxPlayer')}</small>`);
    const all = (L && L.lists) || [];
    const fmt = (t) => (t ? new Date(t).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
    V.innerHTML = `<div class="card glass"><div class="hd"><h3>Crea lista su OrbixPlay o MaxPlayer<small>Scrivi utente e password della linea${F.app === 'orbix' ? ' e l\'ID che il cliente vede nell\'app OrbixPlay' : ''}: premi «Crea e attiva» e la lista arriva sull'app. Non serve un cliente Kairos.</small></h3></div>
      <div class="xl-apps"><button type="button" data-xla="orbix" class="${F.app === 'orbix' ? 'on' : ''}" ${ok.orbix ? '' : 'disabled title="OrbixPlay non è collegato"'}><i>OP</i>OrbixPlay</button><button type="button" data-xla="max" class="mx ${F.app === 'max' ? 'on' : ''}" ${ok.max ? '' : 'disabled title="MaxPlayer non è collegato"'}><i>MX</i>MaxPlayer</button></div>
      ${!ok.orbix && !ok.max ? `<p class="mut">${isAg() ? 'OrbixPlay e MaxPlayer non sono disponibili: chiedi al titolare.' : 'Collega prima OrbixPlay o MaxPlayer (chiavi ORBIX_KEY / MAXPLAYER_KEY su GitHub, guida in App → OrbixPlay e MaxPlayer).'}</p>` : `
      <label class="lbl">Incolla la linea (facoltativo)</label><input class="inp" id="xlPaste" placeholder="Incolla il link M3U o il messaggio con server, utente e password" autocomplete="off">
      <div class="xl-g" style="margin-top:10px">
        <div><label>Nome (cliente)</label><input class="inp" id="xlN" maxlength="60" value="${esc(F.name)}" placeholder="es. Mario Rossi"></div>
        ${F.app === 'orbix' ? `<div><label>ID dispositivo OrbixPlay</label><input class="inp mono" id="xlI" data-mac maxlength="64" value="${esc(F.id)}" placeholder="es. 00:1A:79:AA:BB:CC"></div>` : ''}
        <div><label>Utente</label><input class="inp" id="xlU" maxlength="120" value="${esc(F.u)}" autocomplete="off"></div>
        <div><label>Password</label><input class="inp" id="xlP" maxlength="200" value="${esc(F.p)}" autocomplete="off"></div>
        <div><label>DNS</label>${dnsHtml}</div>
        <div><label>Note (facoltative)</label><input class="inp" id="xlNo" maxlength="200" value="${esc(F.note)}"></div>
      </div>
      <div style="display:flex;gap:10px;align-items:center;margin-top:14px"><button class="btn pri" id="xlGo" ${busy ? 'disabled' : ''}>${busy ? 'Invio…' : '⚡ Crea e attiva'}</button><span class="mut" id="xlMsg" style="font-size:13px"></span></div>`}</div>
      <div class="card glass" style="margin-top:16px"><div class="hd"><h3>Liste create<small>${isAg() ? 'Le tue e quelle dei tuoi sotto-agenti' : 'Tutte, anche quelle create dagli agenti'}. «Rimuovi» la toglie anche dall'app.</small></h3></div>
      ${!L ? '<p class="mut">Carico…</p>' : L.err ? `<p class="mut">${esc(L.err)}</p>` : all.length ? `<div class="tbl-wrap"><table class="tbl" style="width:100%"><thead><tr><th>Nome</th><th>App</th><th>ID / utente</th><th>DNS</th><th>Creata</th><th>Da</th><th></th></tr></thead><tbody>${all.map((x) => `<tr><td><b>${esc(x.name || '—')}</b>${x.note ? `<br><small class="mut">${esc(x.note)}</small>` : ''}</td><td>${x.app === 'max' ? 'MaxPlayer' : 'OrbixPlay'}</td><td class="mono" style="font-size:12.5px">${esc(x.app === 'max' ? x.ref : x.ref + ' · ' + x.username)}</td><td>${esc(x.dns)}</td><td>${esc(fmt(x.created))}</td><td>${esc(x.by)}</td><td><button class="btn sm" data-xlrm="${esc(x.id)}">Rimuovi</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="emptyc">Nessuna lista creata da qui</div>'}</div>`;
    $$('[data-xla]', V).forEach((b) => (b.onclick = () => { read(); F.app = b.dataset.xla; F.dns = ''; draw(); if (F.app === 'max') loadDoms(); }));
    const pi = $('#xlPaste');
    if (pi) { const go = () => { const r = window.KXPaste && window.KXPaste.parse(pi.value); if (!r || !r.username) { $('#xlMsg').textContent = pi.value.trim() ? 'Non riconosco la linea: scrivi utente e password a mano' : ''; return; } read(); F.u = r.username; F.p = r.password || ''; draw(); $('#xlMsg').innerHTML = `✓ Riconosciuta: utente <b>${esc(r.username)}</b>`; }; pi.addEventListener('paste', () => setTimeout(go, 0)); pi.addEventListener('change', go); }
    if ($('#xlGo')) $('#xlGo').onclick = async () => {
      read();
      if (F.app === 'orbix' && !F.id) return toast('Scrivi l\'ID del dispositivo OrbixPlay', 1);
      if (!F.u || !F.p) return toast('Scrivi utente e password della linea', 1);
      const body = F.app === 'max' ? { app: 'max', name: F.name, username: F.u, password: F.p, domain: F.dns, note: F.note } : { app: 'orbix', name: F.name, orbixId: F.id, username: F.u, password: F.p, dns: +F.dns || 0, note: F.note };
      busy = true; draw();
      try { const r = await api('POST', '/admin/ext-lists', body); toast(`${F.app === 'max' ? 'MaxPlayer' : 'OrbixPlay'}: lista creata ✓ (${r.dns})`); Object.assign(F, { name: '', id: '', u: '', p: '', note: '' }); await loadL(); }
      catch (e) { toast(e.message, 1); } finally { busy = false; draw(); }
    };
    $$('[data-xlrm]', V).forEach((b) => (b.onclick = async () => {
      const x = all.find((y) => y.id === b.dataset.xlrm) || {}, NAME = x.app === 'max' ? 'MaxPlayer' : 'OrbixPlay';
      if (!(await ask(`Rimuovere la lista da ${NAME}?`, `${esc(x.name || x.ref || '')}: ${x.app === 'max' ? 'l\'account MaxPlayer viene cancellato' : 'la lista sparisce dall\'app OrbixPlay'}.`, 'Rimuovi'))) return;
      try { await api('DELETE', '/admin/ext-lists/' + x.id); toast('Lista rimossa da ' + NAME); loadL(); } catch (e) { toast(e.message, 1); }
    }));
  }
  const ra = renderAll;
  window.renderAll = renderAll = function () { ra(); const n = $('.nav[data-v="xlist"]'); if (n) { const d = canUse() ? '' : 'none'; if (n.style.display !== d) n.style.display = d; } };
  const v0 = view;
  window.view = view = function (v) { const r = v0.apply(this, arguments); if (v === 'xlist') { draw(); loadL(); if (F.app === 'max') loadDoms(); } return r; };
  if (typeof DEMO !== 'undefined') {
    const XL = [{ id: 'xl1demo', app: 'orbix', name: 'Bar Roma', ref: '00:1A:79:12:34:56', username: 'barroma', dns: 'Principale', note: 'TV del locale', created: Date.now() - 3 * 864e5, by: 'Tu', mine: true }];
    const dm = demoApi;
    window.demoApi = demoApi = async function (m, p, b) {
      if (p === '/admin/ext-lists' && m === 'GET') return { lists: XL.slice() };
      if (p === '/admin/ext-lists' && m === 'POST') { if (!b.username || !b.password) throw new Error('Scrivi utente e password della linea'); XL.unshift({ id: 'xl' + Date.now().toString(36), app: b.app, name: b.name || '', ref: b.app === 'max' ? b.username : b.orbixId, username: b.username, dns: b.app === 'max' ? 'NKI' : 'Principale', note: b.note || '', created: Date.now(), by: D.role === 'agent' ? 'mario.rossi' : 'Tu', mine: true }); return { ok: true, dns: b.app === 'max' ? 'NKI' : 'Principale' }; }
      const dm2 = p.match(/^\/admin\/ext-lists\/(.+)$/); if (dm2 && m === 'DELETE') { const i = XL.findIndex((x) => x.id === dm2[1]); if (i >= 0) XL.splice(i, 1); return { ok: true }; }
      return dm(m, p, b);
    };
  }
})();
