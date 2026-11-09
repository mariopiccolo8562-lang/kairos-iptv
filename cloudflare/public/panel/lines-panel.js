/* KAIROS Control — «Linee collegate»: registro delle linee IPTV collegate alle app (OraPlayer, IboOne, Kemet…).
   Incolli la linea (si compilano utente, password e DNS), scegli l'app e salvi. Le attivazioni OrbixPlay/MaxPlayer fatte
   dal pannello compaiono da sole. Titolare: tutte, con filtro per agente. Agente (se gliela dai): solo le sue.
   Usa le funzioni di app.js ($, $$, esc, api, toast, ask, D, view, TITLES, renderAll, openQuick, ago). */
(() => {
  const css = document.createElement('style');
  css.textContent = `
.ll-f{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.ll-f .inp{margin:0}
.ll-f label{display:flex;flex-direction:column;gap:5px;font-size:11.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--mut)}
.ll-paste{width:100%;min-height:58px;font-family:'JetBrains Mono',monospace;font-size:12.5px;margin:0 0 6px}
.ll-msg{font-size:12.5px;color:var(--ok,#6ee3a6);min-height:18px;margin-bottom:10px}
.ll-apps{display:flex;flex-wrap:wrap;gap:6px;margin:4px 0 12px}
.ll-apps button{border:1px solid var(--line);background:none;color:var(--txt,#fff);border-radius:999px;padding:5px 12px;font:inherit;font-size:12.5px;cursor:pointer}
.ll-apps button.on{background:var(--acc,#3b82f6);border-color:transparent;color:#fff;font-weight:600}
.ll-top{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px}.ll-top .inp{margin:0}
.ll-row{display:grid;grid-template-columns:150px minmax(0,1.2fr) minmax(0,1fr) minmax(0,1.3fr) minmax(0,1.1fr) auto;gap:10px;align-items:center;padding:10px 0;border-top:1px solid var(--line);font-size:13px}
.ll-row .k{font-size:11px;color:var(--mut);display:block}
.ll-v{display:flex;align-items:center;gap:6px;min-width:0}.ll-v span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ll-v button{background:none;border:0;color:var(--mut);cursor:pointer;padding:2px 4px;border-radius:5px;font-size:12px}.ll-v button:hover{color:var(--txt,#fff);background:#ffffff14}
.ll-app{font-weight:700}.ll-tag{display:inline-block;font-size:10.5px;font-weight:700;padding:1px 6px;border-radius:5px;margin-top:3px;background:rgba(52,199,123,.15);color:#6ee3a6}
.ll-tag.ag{background:rgba(224,164,49,.16);color:#ecc06f}
.ll-tag.pending{background:rgba(239,68,68,.18);color:#ff8f8f}
.ll-act{display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap}
@media (max-width:1000px){.ll-f{grid-template-columns:1fr 1fr}.ll-row{grid-template-columns:1fr 1fr}.ll-act{grid-column:1/-1;justify-content:flex-start}}
@media (max-width:560px){.ll-f{grid-template-columns:1fr}}`;
  document.head.appendChild(css);

  const IC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>';
  if (!$('.nav[data-v="lines"]')) {
    const b = document.createElement('button'); b.className = 'nav'; b.dataset.v = 'lines'; b.innerHTML = IC + 'Appunti App'; b.onclick = () => view('lines');
    const anchor = $('.nav[data-v="apps3"]') || $('.nav[data-v="dlc"]'); anchor ? anchor.after(b) : $('#side').appendChild(b);
    const sec = document.createElement('section'); sec.className = 'view'; sec.id = 'v-lines'; $('#v-dash').after(sec);
  }
  TITLES.lines = 'Appunti App';

  const isOwner = () => D.role !== 'agent';
  const mineId = () => (isOwner() ? 0 : +((D.me || {}).id || 0));
  let items = null, busy = false, F = { app: '', q: '', ow: '', pending: false }, form = null, show = new Set();
  const blank = () => ({ id: 0, app: '', username: '', password: '', dns: '', mac: '', client: '', note: '' });
  const appList = () => {
    const src = isOwner() ? ((D.settings && D.settings.appLinks) || []) : (D.appLinks || []);
    return [...new Set([...src.map((x) => x.name), ...((items || []).map((x) => x.app))].filter(Boolean))];
  };
  const appUrl = (name) => { const l = (isOwner() ? (D.settings && D.settings.appLinks) : D.appLinks) || []; const x = l.find((y) => y.name.toLowerCase() === String(name).toLowerCase()); return x ? x.url : ''; };
  const clients = () => (D.devices || []).filter((d) => !d.parent);
  const clientLabel = (d) => `${d.name || 'Senza nome'} · ${d.code}`;
  const clientFrom = (v) => { const t = String(v || '').trim().toLowerCase(); if (!t) return ''; const d = clients().find((x) => clientLabel(x).toLowerCase() === t || String(x.code).toLowerCase() === t); return d ? d.id : null; };
  const copy = (t, w) => navigator.clipboard.writeText(t).then(() => toast(w + ' copiato'), () => toast('Copia non consentita dal browser', 1));
  const agName = (id) => { if (!id || id === mineId()) return ''; const a = (D.agents || []).find((x) => x.id === id); return a ? a.username : 'agente #' + id; };

  async function loadItems() {
    try { items = (await api('GET', '/admin/linked-lines')).items || []; } catch (e) { items = []; items.err = e.message; }
    render();
  }

  function formHtml() {
    const f = form || (form = blank()), apps = appList();
    return `<div class="card glass" id="llForm"><div class="hd"><h3>${f.id ? 'Modifica linea' : 'Registra una linea'}<small>Hai creato la linea sul pannello IPTV e l'hai collegata a un'app? Incollala qui: utente, password e DNS si compilano da soli. Poi scegli l'app e salva.</small></h3></div>
      ${f.id ? '' : '<textarea class="inp ll-paste" id="llPaste" placeholder="📋 Incolla la linea: link M3U / Xtream, oppure il testo con server, utente e password"></textarea><div class="ll-msg" id="llMsg"></div>'}
      <div class="mut" style="font-size:11.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase">App collegata</div>
      <div class="ll-apps" id="llApps">${apps.map((a) => `<button type="button" data-lla="${esc(a)}" class="${f.app.toLowerCase() === a.toLowerCase() ? 'on' : ''}">${esc(a)}</button>`).join('')}<input class="inp" id="llApp" placeholder="Altra app…" value="${esc(apps.some((a) => a.toLowerCase() === f.app.toLowerCase()) ? '' : f.app)}" style="width:160px;margin:0;padding:5px 10px;font-size:12.5px"></div>
      <div class="ll-f">
        <label>Nome utente<input class="inp" id="llU" maxlength="120" value="${esc(f.username)}" autocomplete="off"></label>
        <label>Password<input class="inp" id="llP" maxlength="200" value="${esc(f.password)}" autocomplete="off"></label>
        <label>DNS<input class="inp mono" id="llD" maxlength="300" placeholder="http://dns.esempio.com:8080" value="${esc(f.dns)}"></label>
        <label>MAC / ID dispositivo<input class="inp mono" id="llM" data-mac maxlength="64" autocomplete="off" placeholder="facoltativo" value="${esc(f.mac)}"></label>
        <label>Cliente Kairos<input class="inp" id="llC" list="llCl" placeholder="facoltativo: nome o codice" value="${esc(f.client)}"></label>
        <label>Nota<input class="inp" id="llN" maxlength="200" placeholder="facoltativa" value="${esc(f.note)}"></label>
      </div>
      <datalist id="llCl">${clients().slice(0, 3000).map((d) => `<option value="${esc(clientLabel(d))}">`).join('')}</datalist>
      <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">${f.id ? '<button class="btn" id="llCancel">Annulla</button>' : ''}<button class="btn pri" id="llSave">${f.id ? 'Salva modifiche' : 'Registra linea'}</button></div></div>`;
  }

  function rowsHtml() {
    if (!items) return '<p class="mut">Caricamento…</p>';
    if (items.err) return `<p class="mut">${esc(items.err)}</p>`;
    const AG = isOwner() ? (D.agents || []) : [];
    if (F.ow !== '' && F.ow !== '0' && !AG.some((a) => String(a.id) === F.ow)) F.ow = '';
    const base = F.ow === '' ? items : items.filter((x) => String(x.ownerId || 0) === F.ow);
    const apps = [...new Set(base.map((x) => x.app))].sort((a, b) => a.localeCompare(b));
    if (F.app && !apps.includes(F.app)) F.app = '';
    const q = F.q.toLowerCase().trim();
    const list = base.filter((x) => (!F.app || x.app === F.app) && (!F.pending || /\bDA ATTIVARE\b/i.test(x.note || '')) && (!q || [x.app, x.username, x.dns, x.dnsName, x.mac, x.deviceName, x.deviceCode, x.note, agName(x.ownerId)].join(' ').toLowerCase().includes(q)));
    const nOf = (id) => items.filter((x) => (x.ownerId || 0) === id).length;
    const owSel = AG.length ? `<select class="inp" id="llOw" style="width:auto"><option value="">Tutte (${items.length})</option><option value="0" ${F.ow === '0' ? 'selected' : ''}>Le mie (${nOf(0)})</option>${AG.map((a) => `<option value="${a.id}" ${F.ow === String(a.id) ? 'selected' : ''}>Agente ${esc(a.username)} (${nOf(a.id)})</option>`).join('')}</select>` : '';
    const row = (x) => {
      const vis = show.has(x.id), url = appUrl(x.app), dnsTxt = x.dns || (x.dnsName ? x.dnsName : '—'), cl = x.deviceId ? (x.deviceGone ? '<span class="mut">cliente eliminato</span>' : `<a href="#" data-llopen="${esc(x.deviceId)}">${esc(x.deviceName || 'Cliente')}</a> <span class="mono mut">${esc(x.deviceCode)}</span>`) : '<span class="mut">—</span>';
      const pending = /\bDA ATTIVARE\b/i.test(x.note || ''), note = String(x.note || '').replace(/\s*·?\s*DA ATTIVARE\b/ig, '').trim();
      return `<div class="ll-row">
        <div><span class="ll-app">${esc(x.app)}</span><br>${pending ? `<span class="ll-tag pending">Da attivare${agName(x.ownerId) ? ` · agente ${esc(agName(x.ownerId))}` : ''}</span> ` : ''}${x.source ? `<span class="ll-tag">${x.source.startsWith('p-') ? 'dal pannello' : 'dalla scheda'}</span> ` : ''}${agName(x.ownerId) ? `<span class="ll-tag ag">${esc(agName(x.ownerId))}</span>` : ''}</div>
        <div><span class="k">Utente</span><div class="ll-v"><span class="mono">${esc(x.username)}</span><button data-llcu="${x.id}" title="Copia">⧉</button></div>
             <span class="k" style="margin-top:4px">Password</span><div class="ll-v"><span class="mono">${x.password ? (vis ? esc(x.password) : '••••••••') : '—'}</span>${x.password ? `<button data-lleye="${x.id}" title="Mostra / nascondi">👁</button><button data-llcp="${x.id}" title="Copia">⧉</button>` : ''}</div></div>
        <div><span class="k">DNS</span><div class="ll-v"><span class="mono" title="${esc(x.dns)}">${esc(dnsTxt.replace(/^https?:\/\//, ''))}</span>${x.dns ? `<button data-llcd="${x.id}" title="Copia">⧉</button>` : ''}</div>${x.mac ? `<span class="k" style="margin-top:4px">MAC / ID</span><div class="ll-v"><span class="mono">${esc(x.mac)}</span><button data-llcm="${x.id}" title="Copia">⧉</button></div>` : ''}</div>
        <div><span class="k">Cliente</span>${cl}${note ? `<span class="k" style="margin-top:4px">Nota</span><span>${esc(note)}</span>` : ''}</div>
        <div><span class="k">Aggiornata</span>${esc(typeof ago === 'function' ? ago(x.updated) : new Date(x.updated).toLocaleString('it-IT'))}</div>
        <div class="ll-act">${pending && isOwner() ? `<button class="btn sm" data-lldone="${x.id}">Fatto</button>` : ''}${url ? `<a class="btn sm act-app-link" href="${esc(url)}" target="_blank" rel="noopener">Apri app ↗</a>` : ''}${x.source === 'orbix' || x.source === 'max' ? '' : `<button class="btn sm" data-lled="${x.id}">Modifica</button>`}<button class="btn sm danger" data-lldel="${x.id}">Togli</button></div></div>`;
    };
    return `<div class="ll-top"><input class="inp" id="llQ" placeholder="Cerca utente, cliente, MAC, DNS, nota…" value="${esc(F.q)}" style="flex:1;min-width:220px">${owSel}</div>
      <div class="filters" style="margin:0 0 6px">${[['', 'Tutte le app', base.length], ...apps.map((a) => [a, a, base.filter((x) => x.app === a).length])].map(([k, l, n]) => `<button class="fchip ${F.app === k ? 'on' : ''}" data-llf="${esc(k)}">${esc(l)}<span>${n}</span></button>`).join('')}${isOwner() ? `<button class="fchip ${F.pending ? 'on' : ''}" data-llpending>Da attivare<span>${base.filter((x) => /\bDA ATTIVARE\b/i.test(x.note || '')).length}</span></button>` : ''}</div>
      ${list.length ? list.slice(0, 500).map(row).join('') : `<p class="mut" style="padding:12px 0">${items.length ? 'Nessuna linea con questi filtri.' : 'Nessun appunto ancora: ogni attivazione da WOLF, Armada, Atlantix, MaxPlayer, OrbixPlay o dalla scheda del cliente compare qui da sola. Puoi anche incollarne una qui sopra.'}</p>`}
      ${list.length > 500 ? `<p class="mut">Mostrate 500 su ${list.length}: usa la ricerca.</p>` : ''}`;
  }

  function readForm() {
    const app = (($('#llApp') || {}).value || '').trim() || (($('#llApps button.on') || {}).dataset || {}).lla || '';
    form = { ...form, app, username: $('#llU').value.trim(), password: $('#llP').value, dns: $('#llD').value.trim(), mac: $('#llM').value.trim(), client: $('#llC').value.trim(), note: $('#llN').value.trim() };
  }

  let manual = false;
  function render() {
    const V = $('#v-lines'); if (!V) return;
    if (!isOwner() && !((D.me || {}).perms || {}).lines) { V.innerHTML = '<div class="emptyc">Funzione non disponibile</div>'; return; }
    const y = window.scrollY;
    const fo = manual || form.id;
    V.innerHTML = `<div class="card glass"><div class="hd"><h3>Appunti App<small>Quale app hai attivato a ogni cliente: le attivazioni da WOLF, Armada, Atlantix, MaxPlayer e OrbixPlay si segnano da sole${isOwner() ? ' — tue e dei tuoi agenti' : ''}</small></h3><div style="display:flex;gap:6px">${fo ? '' : '<button class="btn sm pri" id="llAdd">+ Aggiungi a mano</button>'}<button class="btn sm" id="llRe">Aggiorna</button></div></div>${rowsHtml()}</div>` + (fo ? `<div style="margin-top:16px">${formHtml()}</div>` : '');
    window.scrollTo(0, y);
    bind(V);
  }

  function bind(V) {
    const pi = $('#llPaste');
    if (pi) {
      const go = () => {
        const r = window.KXPaste && window.KXPaste.parse(pi.value);
        if (!r || !r.username) { $('#llMsg').textContent = pi.value.trim() ? 'Non riconosco la linea: compila i campi a mano' : ''; $('#llMsg').style.color = 'var(--warn,#ecc06f)'; return; }
        readForm(); form.username = r.username; form.password = r.password || ''; form.dns = r.host || ''; render();
        const m = $('#llMsg'); m.style.color = ''; m.innerHTML = `✓ Riconosciuta · utente <b>${esc(r.username)}</b>${r.host ? ` · DNS <b>${esc(r.host.replace(/^https?:\/\//, ''))}</b>` : ''} — ora scegli l'app`;
      };
      pi.addEventListener('paste', () => setTimeout(go, 0)); pi.addEventListener('change', go);
    }
    $$('[data-lla]', V).forEach((b) => (b.onclick = () => { readForm(); form.app = b.dataset.lla; $('#llApp').value = ''; $$('[data-lla]', V).forEach((x) => x.classList.toggle('on', x === b)); }));
    const ai = $('#llApp'); if (ai) ai.oninput = () => { if (ai.value.trim()) $$('[data-lla]', V).forEach((x) => x.classList.remove('on')); };
    $('#llCancel') && ($('#llCancel').onclick = () => { form = blank(); manual = false; render(); });
    $('#llAdd') && ($('#llAdd').onclick = () => { manual = true; render(); const f = $('#llForm'); if (f) f.scrollIntoView({ behavior: 'smooth' }); });
    if ($('#llSave')) $('#llSave').onclick = async () => {
      if (busy) return; readForm();
      if (!form.app) return toast('Scegli l\'app a cui hai collegato la linea', 1);
      if (!form.username) return toast('Scrivi il nome utente della linea', 1);
      const deviceId = clientFrom(form.client); if (deviceId === null) return toast('Cliente non trovato: sceglilo dall\'elenco o lascia vuoto', 1);
      const body = { app: form.app, username: form.username, password: form.password, dns: form.dns, mac: form.mac, deviceId, note: form.note };
      busy = true;
      try { if (form.id) await api('PUT', '/admin/linked-lines/' + form.id, body); else await api('POST', '/admin/linked-lines', body); toast(form.id ? 'Linea aggiornata' : 'Linea registrata'); form = blank(); await loadItems(); }
      catch (e) { toast(e.message, 1); }
      busy = false;
    };
    for (const ev of ['input', 'change']) { const fm = $('#llForm'); if (fm) fm.addEventListener(ev, (e) => { e.stopPropagation(); if (e.target.id !== 'llPaste') readForm(); }); }
    $('#llRe') && ($('#llRe').onclick = () => loadItems());
    const qi = $('#llQ'); if (qi) qi.oninput = () => { F.q = qi.value; const pos = qi.selectionStart; render(); const n = $('#llQ'); n.focus(); n.setSelectionRange(pos, pos); };
    $('#llOw') && ($('#llOw').onchange = (e) => { F.ow = e.target.value; render(); });
    $$('[data-llf]', V).forEach((b) => (b.onclick = () => { F.app = b.dataset.llf; render(); }));
    $('[data-llpending]', V) && ($('[data-llpending]', V).onclick = () => { F.pending = !F.pending; render(); });
    const byId = (id) => items.find((x) => x.id === +id) || {};
    $$('[data-llcu]', V).forEach((b) => (b.onclick = () => copy(byId(b.dataset.llcu).username, 'Nome utente')));
    $$('[data-llcp]', V).forEach((b) => (b.onclick = () => copy(byId(b.dataset.llcp).password, 'Password')));
    $$('[data-llcd]', V).forEach((b) => (b.onclick = () => copy(byId(b.dataset.llcd).dns, 'DNS')));
    $$('[data-llcm]', V).forEach((b) => (b.onclick = () => copy(byId(b.dataset.llcm).mac, 'MAC')));
    $$('[data-lleye]', V).forEach((b) => (b.onclick = () => { const id = +b.dataset.lleye; show.has(id) ? show.delete(id) : show.add(id); render(); }));
    $$('[data-llopen]', V).forEach((a) => (a.onclick = (e) => { e.preventDefault(); const d = (D.devices || []).find((x) => x.id === a.dataset.llopen); d ? openQuick(d) : toast('Cliente non trovato', 1); }));
    $$('[data-lled]', V).forEach((b) => (b.onclick = () => { const x = byId(b.dataset.lled); const d = (D.devices || []).find((y) => y.id === x.deviceId); manual = true; form = { id: x.id, app: x.app, username: x.username, password: x.password, dns: x.dns, mac: x.mac, client: d ? clientLabel(d) : '', note: x.note }; render(); const f = $('#llForm'); if (f) f.scrollIntoView({ behavior: 'smooth' }); }));
    $$('[data-lldone]', V).forEach((b) => (b.onclick = async () => { const x = byId(b.dataset.lldone); if (!(await askDanger('Segnare come attivata?', `${esc(x.username)} · ${esc(x.app)}`, 'FATTO', 'Fatto'))) return; try { await api('POST', `/admin/linked-lines/${x.id}/done`, {}); toast('Richiesta completata'); await loadItems(); } catch (e) { toast(e.message, 1); } }));
    $$('[data-lldel]', V).forEach((b) => (b.onclick = async () => {
      const x = byId(b.dataset.lldel);
      if (!(await askDanger('Togliere la linea dal registro?', `${esc(x.username)} su ${esc(x.app)}. ${x.source && x.source.startsWith('p-') ? 'È solo un appunto: la linea sul pannello e sull\'app non cambia.' : x.source ? 'È registrata dall\'attivazione: l\'app resta attiva finché non la togli dalla scheda del cliente.' : 'La linea sul pannello IPTV e sull\'app non cambia: sparisce solo da qui.'}`, 'ELIMINA', 'Togli'))) return;
      try { await api('DELETE', '/admin/linked-lines/' + x.id); toast('Tolta dal registro'); await loadItems(); } catch (e) { toast(e.message, 1); }
    }));
  }

  const v0 = view;
  window.view = view = function (v) { v0(v); if (v === 'lines') { if (!form) form = blank(); render(); loadItems(); } };
  // niente ridisegno sull'aggiornamento automatico: si perderebbe ciò che stai scrivendo (l'elenco si ricarica all'apertura e dopo ogni salvataggio)

  // demo: registro di esempio (comprese due attivazioni automatiche)
  if (typeof DEMO !== 'undefined') {
    const dm = demoApi, t = Date.now();
    DEMO.lines = DEMO.lines || null;
    const seed = () => { if (DEMO.lines) return; const dv = DEMO.devices.filter((d) => !d.parent); DEMO.lines = [
      { id: 1, ownerId: 0, app: 'Ora Player', username: 'rossi_ora', password: 'Or4-8812', dns: 'http://line.armada.example:8080', dnsName: '', mac: '00:1A:79:4B:22:10', deviceId: (dv[0] || {}).id || '', note: 'TV salotto', source: '', created: t - 3 * 864e5, updated: t - 3 * 864e5 },
      { id: 2, ownerId: 0, app: 'Ibo One', username: 'bianchi01', password: 'ib0-551', dns: 'http://nki-general.example', dnsName: '', mac: '', deviceId: '', note: '', source: '', created: t - 864e5, updated: t - 864e5 },
      { id: 3, ownerId: 0, app: 'OrbixPlay', username: 'mario', password: 'pw1', dns: 'http://orbx.nki-orbx.download', dnsName: 'NKI OrbixPlay', mac: 'AA11BB22', deviceId: (dv[2] || {}).id || '', note: '', source: 'orbix', created: t - 20 * 864e5, updated: t - 20 * 864e5 },
      { id: 5, ownerId: 0, app: 'WOLF', username: 'verdi_tv', password: 'w0lf-221', dns: 'http://wolf.example:8080', dnsName: '', mac: '', deviceId: '', note: 'Prova 12 mesi', source: 'p-wolf', created: t - 3600e3, updated: t - 3600e3 },
      { id: 4, ownerId: ((D.agents || [])[1] || {}).id || 0, app: 'Kemet', username: 'luca_k77', password: 'k-7781', dns: 'http://k.example:25461', dnsName: '', mac: '', deviceId: '', note: '', source: '', created: t - 7200e3, updated: t - 7200e3 }]; };
    window.demoApi = demoApi = async function (m, p, b) {
      if (!p.startsWith('/admin/linked-lines')) return dm(m, p, b);
      seed();
      const dec = (x) => { const d = DEMO.devices.find((y) => y.id === x.deviceId); return { ...x, deviceName: d ? d.name : '', deviceCode: d ? d.code : '', deviceGone: !!x.deviceId && !d, ownerName: '' }; };
      if (p === '/admin/linked-lines' && m === 'GET') return { items: DEMO.lines.filter((x) => D.role !== 'agent' || x.ownerId === mineId()).map(dec).sort((a, c) => c.updated - a.updated) };
      if (p === '/admin/linked-lines' && m === 'POST') { if (!b.app) throw new Error('Scegli l\'app a cui hai collegato la linea'); if (!b.username) throw new Error('Scrivi il nome utente della linea'); const id = Math.max(0, ...DEMO.lines.map((x) => x.id)) + 1; DEMO.lines.push({ id, ownerId: mineId(), app: b.app, username: b.username, password: b.password || '', dns: b.dns && !/^https?:\/\//i.test(b.dns) ? 'http://' + b.dns : b.dns || '', dnsName: '', mac: b.mac || '', deviceId: b.deviceId || '', note: b.note || '', source: '', created: Date.now(), updated: Date.now() }); return { id }; }
      const mm = p.match(/^\/admin\/linked-lines\/(\d+)$/); const x = mm && DEMO.lines.find((y) => y.id === +mm[1]);
      if (!x) throw new Error('Linea non trovata');
      if (m === 'DELETE') { DEMO.lines = DEMO.lines.filter((y) => y !== x); return { ok: true }; }
      if (x.source === 'orbix' || x.source === 'max') throw new Error('Questa linea è registrata in automatico dall\'attivazione: la modifichi dalla scheda del cliente');
      Object.assign(x, { app: b.app, username: b.username, password: typeof b.password === 'string' ? b.password : x.password, dns: b.dns || '', mac: b.mac || '', deviceId: b.deviceId || '', note: b.note || '', updated: Date.now() }); return { ok: true };
    };
  }
})();
