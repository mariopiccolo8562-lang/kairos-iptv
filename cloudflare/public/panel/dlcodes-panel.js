/* KAIROS Control 2.9 — Codici downloader: l'elenco delle app da far installare ai clienti, con «Copia codice» e «Copia link».
   Il titolare lo modifica; gli agenti (con il permesso) lo vedono e copiano. Usa le funzioni di app.js ($, $$, esc, api, toast, D, load…). */
(() => {
  const css = document.createElement('style');
  css.textContent = `
.dlc-top{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:18px}.dlc-top .inp{margin:0;flex:1;min-width:220px;max-width:420px}
.dlc-g{margin-bottom:24px}.dlc-g h3{font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--mut);margin:0 0 10px}
.dlc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px}
.dlc-c{background:var(--glass);border:1px solid var(--line);border-radius:12px;padding:14px 16px;display:flex;flex-direction:column;gap:10px}
.dlc-h{display:flex;align-items:center;gap:6px 8px;flex-wrap:wrap}.dlc-h b{font-size:15px;white-space:nowrap}.dlc-tag{font-size:11px;font-weight:700;padding:2px 7px;border-radius:5px;background:rgba(224,164,49,.16);color:#ecc06f}
.dlc-tag.new{background:rgba(52,199,123,.15);color:#6ee3a6}
.dlc-warn,.app-warn{display:inline-flex;align-items:center;gap:4px;width:max-content;max-width:100%;padding:3px 8px;border:1px solid rgba(245,176,65,.48);border-radius:999px;background:rgba(245,176,65,.14);color:#f2c46c;font-size:11.5px;font-weight:600;line-height:1.35}
.dlc-code{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.dlc-code .n{font-family:'JetBrains Mono',monospace;font-size:22px;font-weight:700;letter-spacing:.06em;flex:1;min-width:120px}
.dlc-code small{display:block;font-family:'JetBrains Mono',monospace;font-size:11.5px;color:var(--mut);font-weight:400;letter-spacing:0;margin-top:2px;word-break:break-all}
.dlc-l{display:flex;align-items:center;gap:8px;padding:7px 9px;border-radius:7px;background:#1a1d22;border:1px solid var(--line);font-size:12.5px}
.dlc-l span{color:var(--mut);flex:0 0 auto}.dlc-l a{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#8fb3ff;text-decoration:none}
.dlc-e{display:grid;grid-template-columns:130px 1fr 110px 1fr auto;gap:8px;align-items:start;padding:10px;border:1px solid var(--line);border-radius:10px;margin-bottom:8px;background:var(--glass)}
.dlc-e .inp,.dlc-e textarea{margin:0}.dlc-e textarea{grid-column:2/5;min-height:54px;font-family:'JetBrains Mono',monospace;font-size:12px}
@media (max-width:900px){.dlc-e{grid-template-columns:1fr 1fr}.dlc-e textarea{grid-column:1/-1}}`;
  document.head.appendChild(css);

  const IC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3v12m0 0-4.5-4.5M12 15l4.5-4.5"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>';
  if (!$('.nav[data-v="dlc"]')) {
    const b = document.createElement('button'); b.className = 'nav'; b.dataset.v = 'dlc'; b.innerHTML = IC + 'Codici downloader'; b.onclick = () => view('dlc');
    const dns = $('.nav[data-v="dns"]'); dns ? dns.after(b) : $('#side').appendChild(b);
    const sec = document.createElement('section'); sec.className = 'view'; sec.id = 'v-dlc'; $('#v-dash').after(sec);
  }
  TITLES.dlc = 'Codici downloader';

  const list = () => D.dlCodes || [];
  const linkOf = (x) => x.link || (x.code ? 'https://aftv.news/' + x.code : '');
  const copy = (t, what) => navigator.clipboard.writeText(t).then(() => toast(what + ' copiato'), () => toast('Copia non consentita dal browser', 1));
  let q = '', editing = null;
  const isOwner = () => D.role !== 'agent';

  function card(x, i) {
    const l = linkOf(x), nw = /^nuova$/i.test(x.note);
    return `<div class="dlc-c"><div class="dlc-h"><b>${esc(x.name)}</b>${x.note ? `<span class="dlc-tag ${nw ? 'new' : ''}">${esc(x.note)}</span>` : ''}</div>${x.warn ? `<span class="dlc-warn">⚠ ${esc(x.warn)}</span>` : ''}
      ${x.code ? `<div class="dlc-code"><div class="n">${esc(x.code)}<small>${esc(l.replace(/^https?:\/\//, ''))}</small></div><button class="btn sm pri" data-cc="${i}">Copia codice</button><button class="btn sm" data-cl="${i}">Copia link</button></div>` : ''}
      ${(x.links || []).map((k, j) => `<div class="dlc-l"><span>${esc(k.label)}</span><a href="${esc(k.url)}" target="_blank" rel="noopener">${esc(k.url.replace(/^https?:\/\//, ''))}</a><button class="btn sm" data-ck="${i}:${j}">Copia</button></div>`).join('')}</div>`;
  }
  function render() {
    const el = $('#v-dlc'); if (!el) return;
    if (editing) return renderEdit(el);
    const all = list(), ql = q.toLowerCase();
    const shown = all.map((x, i) => [x, i]).filter(([x]) => !ql || [x.name, x.code, x.note, x.group].join(' ').toLowerCase().includes(ql));
    const groups = [...new Set(shown.map(([x]) => x.group || 'Altre app'))];
    el.innerHTML = `<div class="dlc-top"><input class="inp" id="dlcQ" placeholder="Cerca app o codice" value="${esc(q)}">${isOwner() ? '<button class="btn" id="dlcEdit">Modifica elenco</button>' : ''}<span class="mut" style="font-size:12.5px">${all.length} app · il link è quello da aprire con Downloader (o nel browser)</span></div>`
      + (groups.length ? groups.map((g) => `<div class="dlc-g"><h3>${esc(g)}</h3><div class="dlc-grid">${shown.filter(([x]) => (x.group || 'Altre app') === g).map(([x, i]) => card(x, i)).join('')}</div></div>`).join('') : '<div class="emptyc">Nessuna app trovata</div>');
    $('#dlcQ').oninput = (e) => { q = e.target.value; const pos = e.target.selectionStart; render(); const n = $('#dlcQ'); n.focus(); n.setSelectionRange(pos, pos); };
    $('#dlcEdit') && ($('#dlcEdit').onclick = () => { editing = list().map((x) => ({ ...x, links: (x.links || []).map((l) => ({ ...l })) })); render(); });
    $$('[data-cc]', el).forEach((b) => (b.onclick = () => copy(all[+b.dataset.cc].code, 'Codice')));
    $$('[data-cl]', el).forEach((b) => (b.onclick = () => copy(linkOf(all[+b.dataset.cl]), 'Link')));
    $$('[data-ck]', el).forEach((b) => (b.onclick = () => { const [i, j] = b.dataset.ck.split(':'); copy(all[+i].links[+j].url, 'Link'); }));
  }
  const linksTxt = (x) => (x.links || []).map((l) => `${l.label} | ${l.url}`).join('\n');
  function readEdit() {
    editing = $$('#v-dlc .dlc-e').map((r) => {
      const v = (k) => $(`[data-k="${k}"]`, r).value.trim();
      return { group: v('group'), name: v('name'), code: v('code'), note: v('note'), warn: v('warn'), link: v('link'), links: v('links').split('\n').map((s) => s.trim()).filter(Boolean).map((s) => { const k = s.indexOf('|'); return k < 0 ? { label: 'Link', url: s } : { label: s.slice(0, k).trim(), url: s.slice(k + 1).trim() }; }) };
    });
  }
  function renderEdit(el) {
    el.innerHTML = `<div class="dlc-top"><b style="flex:1">Modifica elenco</b><button class="btn" id="dlcAdd">+ Aggiungi app</button><button class="btn" id="dlcNo">Annulla</button><button class="btn pri" id="dlcOk">Salva</button></div>
      <p class="mut" style="font-size:12.5px;margin:-6px 0 14px">Per ogni app: gruppo, nome, codice downloader, etichetta (es. «Nuova»), avviso facoltativo, link del codice (vuoto = aftv.news/codice) e, sotto, gli altri link uno per riga nel formato <span class="mono">Etichetta | https://…</span></p>`
      + editing.map((x, i) => `<div class="dlc-e"><input class="inp" data-k="group" placeholder="Gruppo" value="${esc(x.group || '')}"><input class="inp" data-k="name" placeholder="Nome app" value="${esc(x.name)}"><input class="inp mono" data-k="code" placeholder="Codice" value="${esc(x.code || '')}"><input class="inp" data-k="note" placeholder="Etichetta (facoltativa)" value="${esc(x.note || '')}"><button class="icb" data-del="${i}" title="Togli">✕</button>
        <input class="inp" data-k="warn" maxlength="120" placeholder="Avviso (facoltativo)" value="${esc(x.warn || '')}" style="grid-column:1/5">
        <input class="inp mono" data-k="link" placeholder="Link del codice (vuoto = aftv.news/codice)" value="${esc(x.link || '')}" style="grid-column:2/5"><span></span><textarea class="inp" data-k="links" placeholder="Sito | https://…">${esc(linksTxt(x))}</textarea></div>`).join('');
    $('#dlcAdd').onclick = () => { readEdit(); editing.unshift({ group: (editing[0] || {}).group || '', name: '', code: '', note: '', warn: '', link: '', links: [] }); render(); };
    $('#dlcNo').onclick = () => { editing = null; render(); };
    $$('[data-del]', el).forEach((b) => (b.onclick = () => { readEdit(); editing.splice(+b.dataset.del, 1); render(); }));
    $('#dlcOk').onclick = async () => {
      readEdit();
      try { await api('PUT', '/admin/settings', { dlCodes: editing }); editing = null; await load(); toast('Codici downloader salvati'); } catch (e) { toast(e.message, 1); }
    };
    // ha il suo pulsante: non conta tra le «modifiche non salvate» delle impostazioni
    for (const ev of ['input', 'change']) el.addEventListener(ev, (e) => e.stopPropagation());
  }

  const ra = renderAll;
  window.renderAll = renderAll = function () { ra(); if (!editing) render(); };
  const api0 = api;
  window.api = api = async function (m, p, b) { const r = await api0(m, p, b); if (p === '/admin/state' && m === 'GET' && r) D.dlCodes = r.dlCodes || []; return r; };
  if (typeof DEMO !== 'undefined') {
    const dm = demoApi;
    window.demoApi = demoApi = async function (m, p, b) {
      const r = await dm(m, p, b);
      if (p === '/admin/state' && r && !r.dlCodes) r.dlCodes = DEMO.settings.dlCodes || [
        { group: 'Android TV', name: 'IBO Player (Default)', code: '1171959', note: '', links: [] }, { group: 'Android TV', name: 'IBO Player Pro', code: '923441', note: 'Nuova', links: [] },
        { group: 'Android TV', name: 'IBO Pro', code: '474637', note: 'Solo con codici di attivazione', links: [] }, { group: 'Android TV', name: 'OrbixPlay', code: '618101', note: '', links: [] },
        { group: 'ORA HUB Family', name: 'ORA Player', code: '8408809', note: 'Su tutti i Samsung e LG, anche Apple TV e Roku', links: [{ label: 'Sito', url: 'https://oraplayers.com/' }, { label: 'APK telefono', url: 'http://aftv.news/3819491' }, { label: 'Google Play', url: 'https://play.google.com/store/apps/details?id=org.ora.player' }] },
        { group: 'ORA HUB Family', name: 'Hot ORA IPTV', code: '', note: 'Su tutti i Samsung e LG', links: [{ label: 'Gestione dispositivo', url: 'https://euser.hotoraiptv.com/manage-device' }] }];
      return r;
    };
  }
})();
