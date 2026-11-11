/* KAIROS Control — scelta del cliente per «Collega a un cliente» (10 novembre 2026).
   Al posto della tendina un elenco che si apre sempre, con la ricerca in alto (nome, codice, nota, linea, agente).
   Ogni riga: nome, codice, dispositivi usati («1 di 1»), scadenza e, per il titolare, l'agente. Un cliente pieno si può
   scegliere: sotto compare la voce «Aumenta i dispositivi a N», accesa; con «Collega» il server li aumenta insieme al
   collegamento (grow). Titolare fino a 20; agente con «Collegare altri dispositivi» fino a «Connessioni per cliente».
   Usato nella scheda del titolare (dispositivo in attesa → «Collega a un cliente», «Metti sotto un altro cliente») e in
   «Nuovo cliente» quando il codice è di una TV nuova (agents.js).
   Dall'11 novembre 2026 anche per scegliere il cliente di una linea dei pannelli (WOLF «Collega cliente», Armada
   «Aggiungila a un cliente»): opzioni grow:false (niente dispositivi né «Aumenta»), all:true (anche le TV collegate e
   quelle in attesa, come la tendina di prima) e none:true (riga «— nessuno —» per togliere il collegamento).
   Il titolare vede tutti i clienti; l'agente solo i suoi (D.devices arriva già filtrato dal server). */
(() => {
  const css = document.createElement('style');
  css.textContent = `.cp{margin-top:8px}.cp-btn{display:flex;align-items:center;gap:8px;width:100%;text-align:left;cursor:pointer;min-height:44px}
.cp-btn>span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.cp-btn>span small{color:var(--mut);font-weight:400;margin-left:6px}.cp-btn>i{font-style:normal;color:var(--mut)}
.cp-dd{margin-top:6px;border:1px solid var(--line);border-radius:12px;background:var(--pane,#0e1424);padding:8px}.cp-dd[hidden]{display:none}
.cp-q{margin:0 0 6px}.cp-list{max-height:300px;overflow:auto;display:flex;flex-direction:column;gap:2px}
.cp-it{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 10px;align-items:center;text-align:left;padding:8px 10px;border-radius:9px;border:1px solid transparent;background:none;color:var(--txt,#e6e9f2);cursor:pointer;font:inherit}
.cp-it:hover,.cp-it.kb{background:rgba(79,140,255,.12);border-color:rgba(79,140,255,.35)}.cp-it.on{border-color:var(--a1,#4f8cff);background:rgba(79,140,255,.18)}
.cp-it b{font-size:14px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.cp-it small{color:var(--mut);font-size:12px}
.cp-it .cp-n{font-size:12px;font-weight:700;padding:1px 8px;border-radius:999px;background:rgba(34,197,94,.15);color:#86efac;white-space:nowrap}.cp-it .cp-n.full{background:rgba(245,158,11,.16);color:#fcd34d}
.cp-it .cp-s{grid-column:1/-1}.cp-more{color:var(--mut);font-size:12px;padding:6px 10px}
.cp-grow{margin-top:8px}.cp-grow .tog{margin:0}.cp-warn{padding:10px 12px;border-radius:12px;border:1px solid rgba(245,158,11,.45);background:rgba(245,158,11,.1);color:#fcd34d;font-size:13px}`;
  document.head.appendChild(css);

  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const isAg = () => typeof D === 'object' && D && D.role === 'agent';
  const MAX = 20; // come MAX_CONN del server
  /** quanti dispositivi può dare chi collega: il titolare 20, l'agente il suo «Connessioni per cliente» */
  const cap = () => (isAg() ? Math.max(1, +((((D.me || {}).perms) || {}).maxConn) || 1) : MAX);
  const day = (d) => { if (!d) return 'senza scadenza'; const t = new Date(d + 'T00:00:00'); return isNaN(t) ? d : t.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' }); };
  const agName = (id) => { const a = ((typeof D === 'object' && D && D.agents) || []).find((x) => +x.id === +id); return a ? a.username : ''; };
  const plUsers = (x) => (x.playlists || []).map((p) => p.username || (() => { try { return new URL(p.url || '').searchParams.get('username') || ''; } catch { return ''; } })()).filter(Boolean);

  /** clienti a cui si può collegare: con abbonamento, non collegati a loro volta ([wide]: anche le TV collegate e in attesa) */
  function list(exclude, wide) {
    const all = (typeof D === 'object' && D && D.devices) || [], kids = new Map(), byId = new Map(all.map((x) => [x.id, x]));
    for (const x of all) if (x.parent) kids.set(x.parent, (kids.get(x.parent) || 0) + 1);
    return all.filter((x) => x && x.id && x.id !== exclude && (wide || (!x.parent && x.status !== 'pending'))).map((x) => {
      const used = 1 + (kids.get(x.id) || 0), max = +x.maxConn || 1, main = x.parent ? byId.get(x.parent) : null;
      const ag = !isAg() && +(main || x).ownerId ? agName((main || x).ownerId) : '';
      return { id: x.id, name: x.name || x.code, code: x.code, used, max, exp: (main || x).expires || '', st: x.status, ag, kid: x.parent ? (main ? main.name || main.code : 'un altro cliente') : '',
        hay: [x.name, x.code, x.notes, ag, main && main.name, ...plUsers(x)].filter(Boolean).join(' ').toLowerCase() };
    }).sort((a, b) => a.name.localeCompare(b.name, 'it', { sensitivity: 'base', numeric: true }));
  }

  const S = {}; // stato di ogni casella: { value, q, open, add, exclude, growOn, kb, onPick, grow, all, none }
  const st = (id) => (S[id] = S[id] || { value: '', q: '', open: false, add: 1, exclude: '', growOn: true, kb: -1, grow: true, all: false, none: false });
  /** opzioni della casella (grow, all, none): valgono finché non si rifà la casella da capo con reset */
  const opts = (s, o) => { if (o.grow !== undefined) s.grow = o.grow !== false; if (o.all !== undefined) s.all = !!o.all; if (o.none !== undefined) s.none = !!o.none; };
  function info(id) {
    const s = st(id); if (!s.value) return null;
    const c = list(s.exclude, s.all).find((x) => x.id === s.value); if (!c) return null;
    const need = c.used + s.add, full = need > c.max, lim = cap();
    const canGrow = full && need <= lim && (!isAg() || c.max <= lim);
    const why = !full ? '' : need > lim ? (isAg() ? `${c.name} ha già ${c.used} di ${c.max} dispositivi e il tuo limite è ${lim} per cliente: chiedi al titolare di aumentarlo, oppure scegli un altro cliente.` : `${c.name} avrebbe ${need} dispositivi: il massimo è ${MAX}.`) : isAg() && c.max > lim ? `I dispositivi di ${c.name} li ha decisi il titolare: chiedi a lui.` : '';
    return { c, used: c.used, max: c.max, need, full, canGrow, growOn: s.growOn, why, cap: lim };
  }
  const label = (c, s) => c ? `${esc(c.name)}<small>${esc(c.code)}${s && !s.grow ? (c.kid ? ' · collegato a ' + esc(c.kid) : '') : ` · ${c.max >= 999 ? `${c.used} ${c.used === 1 ? 'dispositivo' : 'dispositivi'} · illimitati` : `${c.used} di ${c.max} ${c.max === 1 ? 'dispositivo' : 'dispositivi'}`}`}</small>`
    : s && s.none ? '— nessuno —' : 'Scegli il cliente…';
  function growHtml(id) {
    if (!st(id).grow) return '';
    const g = info(id); if (!g || !g.full) return '';
    if (!g.canGrow) return `<div class="cp-warn">⚠️ ${esc(g.why)}</div>`;
    const more = g.need - g.max;
    return `<div class="tog${g.growOn ? ' on' : ''}" data-cpgrow="${id}"><div><b>Vuoi aumentare i dispositivi a ${g.need} per collegare questo cliente?</b><small>${esc(g.c.name)} ha già ${g.used} di ${g.max} ${g.max === 1 ? 'dispositivo' : 'dispositivi'}: ne ${more === 1 ? 'serve 1' : 'servono ' + more} in più. Lo faccio insieme al collegamento, senza aprire il cliente principale.</small></div><i></i></div>`;
  }
  function rows(id) {
    const s = st(id), q = s.q.trim().toLowerCase(), toks = q.split(/\s+/).filter(Boolean);
    const L = list(s.exclude, s.all).filter((x) => toks.every((t) => x.hay.includes(t))), cut = L.slice(0, 200);
    // «— nessuno —» (togli il collegamento): solo senza ricerca, in cima; conta come prima riga per le frecce
    const none = s.none && !q ? [{ id: '', none: true }] : [];
    if (!L.length && !none.length) return `<div class="cp-more">${q ? 'Nessun cliente con «' + esc(s.q.trim()) + '»' : 'Nessun cliente con abbonamento'}</div>`;
    const stTxt = (x) => x.st === 'pending' ? 'in attesa di attivazione' : x.st === 'expired' ? 'scaduto il ' + esc(day(x.exp)) : x.st === 'disabled' ? 'disattivato · ' + esc(day(x.exp)) : 'scade ' + esc(day(x.exp));
    return [...none, ...cut].map((x, i) => {
      if (x.none) return `<button type="button" class="cp-it${!s.value ? ' on' : ''}${i === s.kb ? ' kb' : ''}" role="option" data-cp="" aria-selected="${!s.value}"><b>— nessuno —</b><small class="cp-s">togli il collegamento</small></button>`;
      const full = s.grow && x.used + s.add > x.max;
      const badge = s.grow ? `<span class="cp-n${full ? ' full' : ''}">${x.max >= 999 ? `${x.used} · ∞` : `${x.used} di ${x.max}`}${full ? ' · pieno' : ''}</span>` : x.kid ? '<span class="cp-n">collegato</span>' : '<span></span>';
      return `<button type="button" class="cp-it${x.id === s.value ? ' on' : ''}${i === s.kb ? ' kb' : ''}" role="option" data-cp="${esc(x.id)}" aria-selected="${x.id === s.value}"><b>${esc(x.name)}</b>${badge}<small class="cp-s"><span class="mono">${esc(x.code)}</span> · ${x.kid ? 'collegato a ' + esc(x.kid) + ' · ' : ''}${stTxt(x)}${x.ag ? ' · 👤 ' + esc(x.ag) : ''}</small></button>`;
    }).join('') + (L.length > cut.length ? `<div class="cp-more">… altri ${L.length - cut.length}: scrivi per cercare</div>` : '');
  }
  /** la casella: input nascosto con l'id del cliente (stesso id di prima: chi la legge non cambia) */
  function html(id, o = {}) {
    const s = st(id);
    // un altro dispositivo (la scheda si è aperta su un altro): si riparte da capo
    if (o.exclude !== undefined && o.exclude !== s.exclude) { s.value = ''; s.q = ''; s.open = false; s.growOn = true; s.kb = -1; s.exclude = o.exclude; }
    opts(s, o);
    if (o.value !== undefined && o.value !== s.value && !s.open) s.value = o.value;
    if (o.add !== undefined) s.add = o.add;
    const c = s.value ? list(s.exclude, s.all).find((x) => x.id === s.value) : null;
    return `<div class="cp" id="${id}Box"><input type="hidden" id="${id}" value="${esc(c ? c.id : '')}"><button type="button" class="inp cp-btn" id="${id}Btn" aria-haspopup="listbox" aria-expanded="${s.open}"><span>${label(c, s)}</span><i>${s.open ? '▴' : '▾'}</i></button>
      <div class="cp-dd" id="${id}Dd"${s.open ? '' : ' hidden'}><input class="inp cp-q" id="${id}Q" placeholder="Cerca nome, codice, nota, linea o agente…" autocomplete="off" value="${esc(s.q)}"><div class="cp-list" id="${id}List" role="listbox">${s.open ? rows(id) : ''}</div></div>
      <div class="cp-grow" id="${id}Grow">${growHtml(id)}</div></div>`;
  }
  function paint(id) {
    const s = st(id), box = $('#' + id + 'Box'); if (!box) return;
    const c = s.value ? list(s.exclude, s.all).find((x) => x.id === s.value) : null;
    $('#' + id).value = c ? c.id : '';
    const b = $('#' + id + 'Btn'); b.querySelector('span').innerHTML = label(c, s); b.querySelector('i').textContent = s.open ? '▴' : '▾'; b.setAttribute('aria-expanded', s.open);
    const dd = $('#' + id + 'Dd'); dd.hidden = !s.open; if (s.open) $('#' + id + 'List').innerHTML = rows(id);
    $('#' + id + 'Grow').innerHTML = growHtml(id);
  }
  function choose(id, v) { const s = st(id); s.value = v; s.open = false; s.kb = -1; s.growOn = true; paint(id); if (s.onPick) s.onPick(info(id) ? info(id).c : null); }
  function open(id) {
    const s = st(id); if (!$('#' + id + 'Box')) return;
    s.open = true; s.kb = -1; paint(id);
    const q = $('#' + id + 'Q'); if (q) { q.focus(); q.select(); }
    const on = $('#' + id + 'List .cp-it.on'); if (on) on.scrollIntoView({ block: 'nearest' });
  }
  function bind(id, o = {}) {
    const s = st(id); s.add = o.add || 1; s.exclude = o.exclude || ''; s.onPick = o.onPick || null; opts(s, o);
    const box = $('#' + id + 'Box'); if (!box || box.dataset.cpb === '1') return; box.dataset.cpb = '1';
    $('#' + id + 'Btn').onclick = () => { if (s.open) { s.open = false; paint(id); } else open(id); };
    const q = $('#' + id + 'Q');
    q.oninput = () => { s.q = q.value; s.kb = -1; $('#' + id + 'List').innerHTML = rows(id); };
    q.onkeydown = (e) => {
      const its = [...box.querySelectorAll('.cp-it')];
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!its.length) return; s.kb = (s.kb + (e.key === 'ArrowDown' ? 1 : its.length - 1) + (s.kb < 0 && e.key === 'ArrowUp' ? 1 : 0)) % its.length; its.forEach((x, i) => x.classList.toggle('kb', i === s.kb)); its[s.kb].scrollIntoView({ block: 'nearest' }); }
      else if (e.key === 'Enter') { e.preventDefault(); const it = its[s.kb >= 0 ? s.kb : 0]; if (it) choose(id, it.dataset.cp || ''); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); s.open = false; paint(id); $('#' + id + 'Btn').focus(); }
    };
    box.addEventListener('click', (e) => {
      const it = e.target.closest('[data-cp]'); if (it) return choose(id, it.dataset.cp || '');
      const g = e.target.closest('[data-cpgrow]'); if (g) { s.growOn = !s.growOn; g.classList.toggle('on', s.growOn); }
    });
  }
  window.KXCliPick = { list, html, bind, open, info, cap, reset: (id) => { delete S[id]; } };
})();
