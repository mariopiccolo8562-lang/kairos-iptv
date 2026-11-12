/* KAIROS Control — nota della linea nella scheda del cliente (11 novembre 2026).
   Quando il cliente è «🔗 Allineato alla linea …» (scheda del titolare #eSyncInfo, scheda dell'agente #cSyncInfo), sotto compare
   la nota che quella linea ha nel suo pannello IPTV (WOLF, Atlantix, Realott, SLT: la nota del pannello; Armada e Storm: la
   nota tenuta in KAIROS), con tre date a confronto:
   - la scadenza della linea sul pannello;
   - la data scritta nella nota (es. «[K: PAGATO fino al 21/02/27]» oppure una data messa a mano: 21/02/2027, 21/02, 21 febbraio);
   - la scadenza del cliente, cioè quella che vede nell'app.
   Se la data della nota e quella della linea sono diverse lo segnala: chi rinnova la linea un mese alla volta ma ha incassato
   più mesi tiene la data vera nella nota, e il cliente (allineato alla linea) nell'app ne vede un'altra.
   Legge solo dati che il pannello ha già: le liste delle linee (line-pick.js) e le note (line-notes.js).
   DATA CHE IL CLIENTE VEDE (stesso giorno): il server gli mostra la più avanti fra scadenza della linea, «Pagato fino al»
   della linea (da solo) e data fissata per quel cliente. Qui:
   - «Usa il … per il cliente» accanto a «Date diverse», quando la data più avanti è scritta a mano nella nota (non si applica
     da sola: una data a mano può essere anche «richiamare il 20/12»);
   - «Torna alla data della linea» per toglierla;
   - «Metti il …» se il cliente non ha ancora la data giusta (altrimenti arriva da sola con il prossimo allineamento).
   SCELTA DELLA SCADENZA DELL'APP (12 novembre 2026): in cima al riquadro «Scadenza nell'app: Dalla linea | Dalla nota».
   - «Dalla linea»: la regola di sempre (linea, «Pagato fino al», data fissata).
   - «Dalla nota»: il cliente vede la data scritta nella nota della linea, anche se è prima della scadenza della linea, e la
     segue da solo quando la nota cambia. Una data già passata non si applica da sola.
   Collegamento già salvato: la scelta si salva subito (PUT /admin/line-sync/src). Linea appena scelta e non ancora salvata:
   la scelta resta in attesa e parte con «Salva» (srcTake, letto da app.js e agents.js).
   Sono le uniche cose che modifica (PUT /admin/line-sync/hold e /src); il resto è sola lettura.
   Va dopo line-pick.js, line-notes.js e agents.js. */
(() => {
  const css = document.createElement('style');
  css.textContent = `.lnc{margin-top:8px;padding:10px 12px;border:1px solid var(--line);border-radius:12px;background:rgba(255,255,255,.025);font-size:12.5px;line-height:1.45}
.lnc .lnc-n{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}.lnc .lnc-n span{color:var(--mut);white-space:nowrap}.lnc .lnc-n b{font-weight:600;color:var(--txt);overflow-wrap:anywhere;white-space:pre-wrap}
.lnc .lnc-d{display:flex;gap:6px 14px;flex-wrap:wrap;margin-top:7px;color:var(--mut)}.lnc .lnc-d b{color:var(--txt);font-weight:600}
.lnc .lnc-w{margin-top:8px;padding:8px 10px;border-radius:10px;border:1px solid rgba(245,158,11,.5);background:rgba(245,158,11,.1);color:#fcd34d}.lnc .lnc-w b{color:#fde68a}
.lnc .lnc-ok{margin-top:7px;color:#86efac}.lnc .lnc-ok b{color:#bbf7d0}.lnc .lnc-m{margin-top:7px;color:var(--mut)}
.lnc .lnc-b{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px}.lnc .lnc-b .btn{white-space:normal;text-align:left}
.lnc .lnc-s{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:9px;padding-bottom:9px;border-bottom:1px dashed var(--line)}
.lnc .lnc-s>span{color:var(--mut);white-space:nowrap}.lnc .lnc-s>em{flex-basis:100%;font-style:normal;color:var(--mut);font-size:11.5px}
.lnc .lnc-o{display:inline-flex;flex-direction:column;align-items:flex-start;gap:1px;padding:6px 12px 6px 30px;position:relative;border-radius:10px;border:1px solid var(--line);background:transparent;color:var(--txt);cursor:pointer;font:inherit;line-height:1.25;text-align:left}
.lnc .lnc-o::before{content:'';position:absolute;left:10px;top:50%;width:12px;height:12px;margin-top:-7px;border-radius:50%;border:2px solid var(--mut)}
.lnc .lnc-o b{font-weight:600}.lnc .lnc-o small{color:var(--mut);font-size:11.5px}
.lnc .lnc-o.on{border-color:var(--a1);background:color-mix(in srgb,var(--a1) 13%,transparent)}
.lnc .lnc-o.on::before{border-color:var(--a1);background:radial-gradient(circle,var(--a1) 0 45%,transparent 50%)}
.lnc .lnc-o:disabled{opacity:.5;cursor:not-allowed}.lnc .lnc-o:not(:disabled):not(.on):hover{border-color:var(--mut)}`;
  document.head.appendChild(css);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const ms = (ymd) => Date.parse(ymd + 'T00:00:00Z');
  const it = (ymd) => (/^\d{4}-\d{2}-\d{2}$/.test(ymd || '') ? `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}` : '');
  const ymdOf = (y, m, d) => { const t = new Date(Date.UTC(y, m - 1, d)); return m >= 1 && m <= 12 && d >= 1 && t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : ''; };
  const MON = { gen: 1, feb: 2, mar: 3, apr: 4, mag: 5, giu: 6, lug: 7, ago: 8, set: 9, ott: 10, nov: 11, dic: 12 };
  const PANELS = { wolf: 'WOLF', armada: 'Armada', storm: 'Storm', atx: 'Atlantix', ro: 'Realott', slt: 'SLT' };

  /** date scritte in una nota, come AAAA-MM-GG. ref = scadenza della linea (o oggi): serve per l'anno quando manca («21/02»).
      Valgono: gg/mm/aaaa, gg/mm/aa, gg/mm, gg-mm-aaaa, gg.mm.aaaa, aaaa-mm-gg, «21 febbraio [2027]». Con «-» e «.» l'anno è
      obbligatorio (20.30 è un'ora, 1-2 un punteggio). Numeri di telefono, prezzi e ore non sono date. */
  function datesIn(note, ref) {
    const s = String(note || ''), out = [], base = ms(/^\d{4}-\d{2}-\d{2}$/.test(ref || '') ? ref : today());
    const yr = (v) => (v.length === 2 ? 2000 + +v : +v);
    // senza anno: la prima volta che quel giorno cade da un mese prima del riferimento in poi
    const noYear = (m, d) => { const y0 = new Date(base).getUTCFullYear(); for (const y of [y0 - 1, y0, y0 + 1]) { const v = ymdOf(y, m, d); if (v && ms(v) >= base - 31 * 864e5) return v; } return ''; };
    let m;
    const iso = /(^|[^\d])(\d{4})-(\d{2})-(\d{2})(?!\d)/g;
    while ((m = iso.exec(s))) { const v = ymdOf(+m[2], +m[3], +m[4]); if (v) out.push(v); }
    const num = /(^|[^\d\/.-])(\d{1,2})([\/.-])(\d{1,2})(?:\3(\d{4}|\d{2}))?(?![\d\/.-])/g;
    while ((m = num.exec(s))) {
      if (!m[5] && m[3] !== '/') continue;
      const v = m[5] ? ymdOf(yr(m[5]), +m[4], +m[2]) : noYear(+m[4], +m[2]);
      if (v) out.push(v);
    }
    const txt = /(^|[^\d])(\d{1,2})°?\s*(gen|feb|mar|apr|mag|giu|lug|ago|set|ott|nov|dic)[a-zà]*\.?(?:\s+(\d{4}|\d{2}))?(?![\d])/gi;
    while ((m = txt.exec(s))) { const mo = MON[m[3].toLowerCase()], v = m[4] ? ymdOf(yr(m[4]), mo, +m[2]) : noYear(mo, +m[2]); if (v) out.push(v); }
    const lo = ms(today()) - 400 * 864e5, hi = ms(today()) + (3 * 366 + 31) * 864e5;
    return [...new Set(out)].filter((v) => ms(v) >= lo && ms(v) <= hi);
  }
  /** la data «pagato fino al» di una nota: prima il segno dei pagamenti di KAIROS «[K: PAGATO fino al gg/mm/aa]», altrimenti
      la data più avanti fra quelle scritte a mano; '' se non ce n'è */
  function dateOf(note, ref) {
    const s = String(note || ''), k = s.match(/PAGATO\s+fino\s+al\s+(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})/i);
    if (k) { const d = datesIn(k[1], ref); if (d.length) return d[0]; }
    const all = datesIn(s.replace(/\[K:[^\]]*\]/g, ' '), ref);
    return all.length ? all.sort().pop() : '';
  }
  const daysApart = (a, b) => Math.round(Math.abs(ms(a) - ms(b)) / 864e5);

  /** la linea nelle liste già scaricate (line-pick.js); la nota di Armada e Storm sta in KAIROS (line-notes.js) */
  async function lineOf(panel, username) {
    if (!window.KXLinePick) return null;
    const u = String(username || '').trim().toLowerCase();
    const items = await KXLinePick.load().catch(() => []);
    const l = (items || []).find((x) => x.p === panel && String(x.username || '').trim().toLowerCase() === u) || null;
    let note = l ? String(l.note || '') : '';
    if (!note && window.KXLineNotes && (panel === 'armada' || panel === 'storm')) { try { note = (await KXLineNotes.get(panel, username)) || ''; } catch {} }
    return l ? { exp: l.exp || '', note, status: l.status || '' } : (note ? { exp: '', note, status: '', missing: true } : null);
  }

  /** K = quello che il server sa del collegamento: { dev, hold, paid, can }. hold = data fissata per il cliente,
      paid = «Pagato fino al» della linea, can = chi guarda può cambiare la data del cliente */
  function html(panel, username, L, cli, K) {
    const pn = PANELS[panel] || String(panel || '').toUpperCase();
    if (!L) return `<div class="lnc-n"><span>📝 Nota della linea</span><b style="color:var(--mut);font-weight:500">non trovo <span class="mono">${esc(username)}</span> tra le linee di ${esc(pn)} (eliminata, o il pannello non risponde adesso)</b></div>`;
    K = K || {};
    const nd = dateOf(L.note, L.exp), cliTxt = cli ? it(cli) : 'illimitata', le = L.exp || '';
    const dates = `<div class="lnc-d"><span>Linea su ${esc(pn)}: <b>${le ? it(le) : '—'}</b></span><span>Data nella nota: <b>${nd ? it(nd) : 'nessuna'}</b></span><span>Cliente, nell'app: <b>${esc(cliTxt)}</b></span></div>`;
    const act = K.dev && K.can && le;
    const btn = (attr, txt) => `<button type="button" class="btn sm" ${attr}>${txt}</button>`;
    // da dove viene la scadenza dell'app: scelta in cima al riquadro (chi non può rinnovare la legge soltanto)
    const from = K.src === 'note' ? 'note' : 'line';
    const seg = (v, label, date, off) => `<button type="button" class="lnc-o${from === v ? ' on' : ''}" data-lnc-src="${v}" aria-pressed="${from === v}"${off ? ' disabled title="Nella nota non c\'è una data"' : ''}><b>${label}</b><small>${date}</small></button>`;
    const pick = !le ? '' : K.can
      ? `<div class="lnc-s" data-lnc-pick="${from}"><span>Scadenza nell'app:</span>${seg('line', 'Dalla linea', it(le))}${seg('note', 'Dalla nota', nd ? it(nd) : 'nessuna data', !nd && from !== 'note')}${K.saved ? '' : '<em>La scelta si salva con «Salva».</em>'}</div>`
      : from === 'note' ? `<div class="lnc-s" data-lnc-pick="note"><span>Scadenza nell'app: <b style="color:var(--txt)">dalla nota della linea</b></span></div>` : '';
    // la data che il server dà al cliente: la più avanti fra linea, «Pagato fino al» e data fissata
    let T = le, src = 'line';
    if (le && K.paid && ms(K.paid) > ms(T)) { T = K.paid; src = 'paid'; }
    if (le && K.hold && ms(K.hold) > ms(T)) { T = K.hold; src = 'hold'; }
    const keep = `La linea scade il <b>${it(le)}</b>: continua a rinnovarla, la data del cliente non cambia.`;
    const wait = cli && T && cli !== T; // il cliente non ha ancora quella data (o nella scheda è stata cambiata a mano)
    let tail = '';
    if (from === 'note') {
      // scadenza dell'app dalla nota: vale la data della nota finché non è passata; senza data si segue la linea
      const again = act && K.saved ? `<div class="lnc-b">${btn('data-lnc-src="note"', 'Metti il ' + it(nd))}</div>` : '';
      if (!nd) tail = `<div class="lnc-w" data-lnc-warn="1" data-lnc-state="note-none">⚠️ Hai scelto la data della nota, ma nella nota non c'è una data: il cliente segue la scadenza della linea${le ? ` (<b>${it(le)}</b>)` : ''}. Scrivila nella nota, per esempio «pagato fino al 21/02/2027».</div>`;
      else if (ms(nd) < ms(today())) tail = `<div class="lnc-w" data-lnc-warn="1" data-lnc-state="note-past">⚠️ La data della nota (<b>${it(nd)}</b>) è già passata: non la applico da sola. Il cliente resta al <b>${esc(cliTxt)}</b>.</div>`;
      else if (!cli) tail = `<div class="lnc-m" data-lnc-state="note-inf">Il cliente è illimitato: la data della nota (<b>${it(nd)}</b>) non si applica finché resta illimitato.</div>`;
      else if (cli !== nd) tail = `<div class="lnc-w" data-lnc-warn="1" data-lnc-state="note-wait">⚠️ Il cliente dovrebbe vedere il <b>${it(nd)}</b> (data della nota), ma nella scheda c'è il <b>${it(cli)}</b>. ${K.saved ? `Si sistema da sola entro qualche ora${again ? ', oppure subito:' : '.'}` : 'Scegli di nuovo «Dalla nota» per rimettere la data.'}${again}</div>`;
      else tail = `<div class="lnc-ok" data-lnc-state="note">📝 Il cliente nell'app vede il <b>${it(nd)}</b>: è la data della nota. Se cambi la data nella nota, il cliente la segue da solo.${le && le !== nd ? ` La linea scade il <b>${it(le)}</b>: continua a rinnovarla.` : ''}</div>`;
    } else if (src !== 'line') {
      const why = src === 'paid' ? 'è il «Pagato fino al» della linea' : 'data fissata per questo cliente';
      tail = wait
        ? `<div class="lnc-w" data-lnc-warn="1" data-lnc-state="${src}-wait">⚠️ Il cliente dovrebbe vedere il <b>${it(T)}</b> (${why}), ma nella scheda c'è il <b>${it(cli)}</b>. Si sistema da sola entro qualche ora${act ? ', oppure subito:' : '.'}${act ? `<div class="lnc-b">${btn('data-lnc-now="1"', 'Metti il ' + it(T))}</div>` : ''}</div>`
        : `<div class="lnc-ok" data-lnc-state="${src}">${src === 'paid' ? '✓' : '📌'} Il cliente nell'app vede il <b>${it(T)}</b>: ${why}. ${keep}</div>`;
      const more = [];
      // la nota a mano adesso dice un'altra data, più avanti della linea: si può passare a quella
      if (src === 'hold' && nd && ms(nd) > ms(le) && daysApart(nd, T) > 1 && act) more.push(btn(`data-lnc-use="${nd}"`, 'La nota dice ' + it(nd) + ': usa quella'));
      if (K.hold && act) more.push(btn('data-lnc-clear="1"', src === 'hold' ? 'Torna alla data della linea' : 'Togli la data fissata (' + it(K.hold) + ')'));
      if (more.length) tail += `<div class="lnc-b">${more.join('')}</div>`;
    } else if (nd && le && daysApart(nd, le) > 1) {
      const later = ms(nd) > ms(le);
      const seen = !cli ? 'Il cliente nell\'app non vede una scadenza (illimitata).' : daysApart(cli, nd) <= 1 ? `Il cliente nell'app vede già il <b>${it(cli)}</b>, la data della nota.` : `Il cliente nell'app vede il <b>${it(cli)}</b>${daysApart(cli, le) <= 1 ? ', quello della linea' : ''}.`;
      const use = later && act && cli && ms(nd) > ms(today()) ? `<div class="lnc-b">${btn(`data-lnc-use="${nd}"`, 'Usa il ' + it(nd) + ' per il cliente')}</div>` : '';
      tail = `<div class="lnc-w" data-lnc-warn="1" data-lnc-state="diff">⚠️ <b>Date diverse</b>: la linea scade il <b>${it(le)}</b>, la nota dice <b>${it(nd)}</b> (${later ? 'più avanti' : 'prima'}). ${seen}${use}</div>`;
    } else if (nd && le) tail = `<div class="lnc-ok">✓ La data della nota coincide con la scadenza della linea</div>`;
    else if (L.note) tail = `<div class="lnc-m">Nella nota non c'è una data.</div>`;
    return `${pick}<div class="lnc-n"><span>📝 Nota della linea</span><b>${L.note ? esc(L.note) : '<span style="color:var(--mut);font-weight:500">nessuna nota</span>'}</b></div>${dates}${tail}`;
  }

  /* dove compare: sotto «🔗 Allineata alla linea PANNELLO utente» delle due schede; il collegamento si legge da lì */
  const SPOTS = [['#eSyncInfo', '#eExp'], ['#cSyncInfo', '#cExp']];
  const CODES = { WOLF: 'wolf', ARMADA: 'armada', STORM: 'storm', ATX: 'atx', RO: 'ro', SLT: 'slt' };
  let seq = 0;
  const info = new Map(); // cliente → { hold, paid, src, panel, user } dal server
  /* scelta «linea | nota» fatta su una linea appena collegata e non ancora salvata: parte con «Salva» (srcTake). Dopo
     mezz'ora non vale più (scheda chiusa senza salvare) */
  const pending = new Map(), pkey = (panel, username) => panel + '|' + String(username || '').trim().toLowerCase();
  const pendingOf = (panel, username) => { const k = pkey(panel, username), x = pending.get(k); if (x && Date.now() - x.t > 30 * 60e3) { pending.delete(k); return ''; } return x ? x.v : ''; };
  const srcTake = (panel, username) => { const v = pendingOf(String(panel || '').toLowerCase(), username); pending.delete(pkey(String(panel || '').toLowerCase(), username)); return v; };
  const canRenew = () => typeof D === 'undefined' || !D || D.role !== 'agent' || !!(((D.me || {}).perms || {}).renew);
  const say = (m, bad) => { try { toast(m, bad); } catch {} };
  function linkInfo(dev) {
    if (!dev) return null;
    if (info.has(dev)) return info.get(dev);
    info.set(dev, { hold: '', paid: '', loading: true });
    api('GET', '/admin/line-sync?deviceId=' + encodeURIComponent(dev)).then((r) => { const l = (r && r.link) || {}; info.set(dev, { hold: l.hold || '', paid: l.paid || '', src: l.src === 'note' ? 'note' : 'line', panel: String(l.panel || ''), user: String(l.username || '').trim().toLowerCase() }); later(); }).catch(() => { info.set(dev, { hold: '', paid: '', failed: true }); });
    return info.get(dev);
  }
  function sync() {
    for (const [sel, expSel] of SPOTS) {
      const host = document.querySelector(sel);
      if (!host) continue;
      let box = host.nextElementSibling && host.nextElementSibling.classList.contains('lnc') ? host.nextElementSibling : null;
      const b = host.querySelector('b'), pm = b && (host.textContent || '').match(/linea\s+([A-Z]+)\s/), panel = pm && CODES[pm[1]], username = b ? b.textContent.trim() : '';
      if (!panel || !username) { if (box) box.remove(); continue; }
      const expEl = document.querySelector(expSel), cli = expEl && /^\d{4}-\d{2}-\d{2}$/.test(expEl.value) ? expEl.value : '';
      const dev = (b.dataset && b.dataset.lsDev) || '';
      if (!box) { box = document.createElement('div'); box.className = 'lnc'; box.setAttribute('data-lnc', sel); host.after(box); info.delete(dev); /* scheda appena aperta: dati freschi */ }
      const I = linkInfo(dev) || {}, K = { dev, hold: I.hold || '', paid: I.paid || '', can: canRenew() };
      // saved = il server ha già questo collegamento (stessa linea): la scelta si salva subito; altrimenti aspetta «Salva»
      K.saved = !!dev && I.panel === panel && I.user === username.toLowerCase();
      if (K.saved) pending.delete(pkey(panel, username)); // il server conosce già la scelta: una rimasta in attesa non vale più
      K.src = (K.saved ? I.src : pendingOf(panel, username)) || 'line';
      if (!K.saved) { K.hold = ''; K.paid = ''; } // dati di un'altra linea: non valgono per questa
      const key = [panel, username.toLowerCase(), cli, dev, K.hold, K.paid, K.can ? 1 : 0, K.src, K.saved ? 1 : 0, I.loading ? 1 : 0].join('|');
      if (box.dataset.key === key) continue;
      const first = box.dataset.line !== panel + '|' + username.toLowerCase();
      box.dataset.key = key; box.dataset.line = panel + '|' + username.toLowerCase();
      box.dataset.panel = panel; box.dataset.user = username; box.dataset.dev = dev; box.dataset.exp = expSel;
      if (first) box.innerHTML = '<div class="lnc-n"><span>📝 Nota della linea</span><b style="color:var(--mut);font-weight:500">carico…</b></div>';
      const my = ++seq; box.dataset.seq = String(my);
      box.dataset.saved = K.saved ? '1' : '';
      lineOf(panel, username).then((L) => { if (box.isConnected && box.dataset.seq === String(my)) { box.dataset.le = (L && L.exp) || ''; box.dataset.note = (L && L.note) || ''; box.dataset.nd = L ? dateOf(L.note, L.exp) : ''; box.innerHTML = html(panel, username, L, cli, K); } }).catch(() => {});
    }
  }
  /* i tasti: fissano (o tolgono) la data del cliente e la mettono subito, anche nel campo della scheda: così «Salva» non
     rimette quella di prima */
  document.addEventListener('click', async (e) => {
    const bt = e.target && e.target.closest && e.target.closest('.lnc [data-lnc-use], .lnc [data-lnc-clear], .lnc [data-lnc-now], .lnc [data-lnc-src]');
    if (!bt) return;
    e.preventDefault();
    const box = bt.closest('.lnc'), dev = box.dataset.dev, le = box.dataset.le || '';
    const setExp = (v) => { const expEl = document.querySelector(box.dataset.exp); if (expEl && /^\d{4}-\d{2}-\d{2}$/.test(v || '')) { expEl.value = v; expEl.dispatchEvent(new Event('input', { bubbles: true })); expEl.dispatchEvent(new Event('change', { bubbles: true })); } };
    if (bt.hasAttribute('data-lnc-src') && !bt.disabled && !box.dataset.saved) {
      // linea appena collegata, non ancora salvata: la scelta resta in attesa e parte con «Salva»; intanto la data nella scheda
      const v = bt.getAttribute('data-lnc-src') === 'note' ? 'note' : 'line', nd = box.dataset.nd || '';
      pending.set(pkey(box.dataset.panel, box.dataset.user), { v, t: Date.now() });
      const d = v === 'note' && nd && ms(nd) >= ms(today()) ? nd : le;
      setExp(d);
      say(v === 'note' ? `Scadenza dalla nota${d === nd && nd ? ': ' + it(nd) : ''}. Premi Salva` : `Scadenza dalla linea${le ? ': ' + it(le) : ''}. Premi Salva`);
      box.dataset.key = ''; later();
      return;
    }
    if (!dev || bt.disabled) return;
    if (bt.hasAttribute('data-lnc-src')) {
      const v = bt.getAttribute('data-lnc-src') === 'note' ? 'note' : 'line';
      bt.disabled = true;
      try {
        const r = await api('PUT', '/admin/line-sync/src', { deviceId: dev, src: v, lineExp: le, note: box.dataset.note || '' });
        info.set(dev, { hold: r.hold || '', paid: r.paid || '', src: r.src === 'note' ? 'note' : 'line', panel: box.dataset.panel, user: String(box.dataset.user || '').trim().toLowerCase() });
        pending.delete(pkey(box.dataset.panel, box.dataset.user));
        setExp(r.expires);
        try { const d = typeof D !== 'undefined' && D && Array.isArray(D.devices) ? D.devices.find((x) => x.id === dev) : null; if (d && r.expires) d.expires = r.expires; } catch {}
        headDate(r.expires);
        say(v === 'note' ? `Scadenza dalla nota della linea${r.expires ? ': il cliente vede il ' + it(r.expires) : ''} (già salvato)` : `Scadenza dalla linea${r.expires ? ': il cliente vede il ' + it(r.expires) : ''} (già salvato)`);
      } catch (err) { say((err && err.message) || 'Non riuscito', 1); bt.disabled = false; }
      box.dataset.key = ''; later();
      return;
    }
    const body = { deviceId: dev, lineExp: le };
    if (bt.hasAttribute('data-lnc-use')) body.date = bt.getAttribute('data-lnc-use');
    else if (bt.hasAttribute('data-lnc-clear')) body.date = '';
    bt.disabled = true;
    try {
      const r = await api('PUT', '/admin/line-sync/hold', body);
      info.set(dev, { ...(info.get(dev) || {}), hold: r.hold || '', paid: r.paid || '' });
      const expEl = document.querySelector(box.dataset.exp);
      if (expEl && r.expires && /^\d{4}-\d{2}-\d{2}$/.test(r.expires)) { expEl.value = r.expires; expEl.dispatchEvent(new Event('input', { bubbles: true })); expEl.dispatchEvent(new Event('change', { bubbles: true })); }
      try { const d = typeof D !== 'undefined' && D && Array.isArray(D.devices) ? D.devices.find((x) => x.id === dev) : null; if (d && r.expires) d.expires = r.expires; } catch {}
      headDate(r.expires);
      say(r.expires ? `Fatto: il cliente ora vede il ${it(r.expires)} (già salvato)` : 'Fatto');
    } catch (err) { say((err && err.message) || 'Non riuscito', 1); bt.disabled = false; }
    box.dataset.key = ''; later();
  });
  /** il riquadro «Scadenza» in cima alla scheda (si ridisegna solo riaprendola): lo si porta alla data nuova */
  function headDate(exp) {
    try {
      const sm = exp && [...document.querySelectorAll('#dBody .qsum small, #agPage .qsum small')].find((x) => x.textContent.trim() === 'Scadenza');
      if (!sm) return;
      const bb = sm.parentElement.querySelector('b'), em = sm.parentElement.querySelector('em'), n = Math.round((ms(exp) - ms(today())) / 864e5);
      if (bb) bb.textContent = typeof fmtD === 'function' ? fmtD(exp) : it(exp);
      if (em) { em.textContent = n < 0 ? 'scaduto da ' + -n + ' g' : n + ' giorni'; em.style.color = n < 0 ? 'var(--bad)' : n <= 14 ? 'var(--warn)' : ''; }
    } catch {}
  }
  let t = 0;
  const later = () => { clearTimeout(t); t = setTimeout(sync, 80); };
  new MutationObserver(later).observe(document.body, { childList: true, subtree: true });
  // la data del cliente cambia senza toccare la pagina (campo data, «+1 mese», «Rendi illimitato»)
  for (const ev of ['input', 'change', 'click']) document.addEventListener(ev, (e) => { if (e.target && e.target.closest && e.target.closest('#drawer, #agPage')) setTimeout(later, 60); }, true);
  window.KXLineNote = { dateOf, datesIn, sync, srcTake };
})();
