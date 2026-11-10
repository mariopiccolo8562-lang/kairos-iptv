/* KAIROS Control — «Nuova attivazione»: in un solo passaggio crei la linea su WOLF, Armada o Atlantix e la metti subito
   sulle app scelte (MaxPlayer, OrbixPlay, un cliente Kairos nuovo o esistente, le altre app negli Appunti App).
   Usa solo le funzioni già esistenti del pannello: ogni attivazione segue i permessi e i DNS di chi la fa
   (gli agenti vedono solo i pannelli e le app che il titolare gli ha concesso, mai i DNS). Usa app.js. */
(() => {
  const css = document.createElement('style');
  css.textContent = `
#qaOv{position:fixed;inset:0;z-index:41;display:none;place-items:center;background:rgba(3,4,10,.62);backdrop-filter:blur(8px);padding:16px}#qaOv.on{display:grid}
#qaOv .qa-box{width:min(760px,100%);max-height:94vh;overflow:auto;padding:22px 24px;background:rgba(14,15,34,.94);border:1px solid var(--line);border-radius:18px;animation:pop .35s}
.qa-steps{display:flex;gap:6px;margin:0 0 14px;flex-wrap:wrap}.qa-steps span{font-size:12px;font-weight:700;padding:4px 10px;border-radius:999px;background:#ffffff10;color:var(--mut)}.qa-steps span.on{background:rgba(79,140,255,.22);color:#9dbcff}.qa-steps span.ok{background:rgba(34,197,94,.16);color:#6ee3a6}
.qa-pn{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-bottom:14px}
.qa-pn button{display:flex;flex-direction:column;align-items:flex-start;gap:3px;padding:12px 14px;border-radius:14px;border:1px solid var(--line);background:rgba(255,255,255,.03);color:#eef1f8;font:inherit;font-weight:700;cursor:pointer;text-align:left}
.qa-pn button small{font-weight:500;color:var(--mut);font-size:11.5px}.qa-pn button.on{border-color:#4f8cff;background:rgba(79,140,255,.14)}.qa-pn button:disabled{opacity:.45;cursor:not-allowed}
.btn.qa-red{background:linear-gradient(100deg,#ef4444,#b91c1c)!important;color:#fff!important;border:0!important;box-shadow:0 10px 30px -12px #ef4444}.btn.qa-red:disabled{opacity:.55}
.qa-a.qa-red-c{border-color:rgba(239,68,68,.55)!important;background:rgba(239,68,68,.12)!important}.qa-a.qa-red-c i{color:#ef4444}
.qa-f{display:grid;grid-template-columns:1fr 1fr;gap:10px}.qa-f .inp{margin:0}.qa-f label,.qa-app label.l{display:flex;flex-direction:column;gap:5px;font-size:11.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--mut)}
.qa-f .w{grid-column:1/-1}@media (max-width:560px){.qa-f{grid-template-columns:1fr}}
.qa-app{border:1px solid var(--line);border-radius:14px;padding:10px 12px;margin-bottom:8px;background:rgba(255,255,255,.02)}.qa-app.on{border-color:#22c55e;background:rgba(34,197,94,.08)}
.qa-app .h{display:flex;align-items:center;gap:10px;cursor:pointer}.qa-app .h input{width:18px;height:18px;accent-color:#22c55e}.qa-app .h b{flex:1}.qa-app .h small{color:var(--mut)}
.qa-app .b{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}.qa-app .b .inp{margin:0}@media (max-width:560px){.qa-app .b{grid-template-columns:1fr}}
.qa-ic{width:28px;height:28px;border-radius:8px;display:grid;place-items:center;font-size:10.5px;font-weight:800;background:rgba(79,140,255,.2);color:#8fb3ff;flex:none}.qa-ic.mx{background:rgba(251,113,133,.2);color:#fda4af}.qa-ic.kx{background:rgba(34,211,238,.18);color:#67e8f9}.qa-ic.ot{background:#ffffff14;color:var(--mut)}
.qa-res{display:grid;gap:8px}.qa-res .r{display:flex;gap:10px;align-items:center;padding:10px 12px;border-radius:12px;background:rgba(255,255,255,.03);border:1px solid var(--line)}.qa-res .r.ok{border-color:rgba(34,197,94,.4)}.qa-res .r.ko{border-color:rgba(255,107,107,.45)}
.qa-res .r i{font-style:normal;flex:none;width:26px;height:26px;border-radius:50%;display:grid;place-items:center;font-weight:800;font-size:14px;background:#ffffff14;color:var(--mut)}.qa-res .r.ok i{background:rgba(34,197,94,.2);color:#6ee3a6}.qa-res .r.ko i{background:rgba(255,107,107,.2);color:#ff8b8b}.qa-res .r div{flex:1;min-width:0}.qa-res .r small{display:block;color:var(--mut);word-break:break-word}
.qa-kv{display:grid;grid-template-columns:auto 1fr auto;gap:6px 12px;align-items:center;font-size:13.5px;margin:10px 0}.qa-kv .mono{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.qa-ft{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:16px}.qa-ft .sp{flex:1}
.qa-msg{white-space:pre-wrap;font-size:13px;background:#0b0c1c;border:1px solid var(--line);border-radius:12px;padding:12px;line-height:1.5;max-height:220px;overflow:auto}`;
  document.head.appendChild(css);

  const isAg = () => D.role === 'agent';
  const PM = () => (isAg() ? ((D.me || {}).perms || {}) : null);
  const can = (k) => !isAg() || !!PM()[k];
  const PL = () => D.players || {};
  const gen = (n) => { const a = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'; const r = crypto.getRandomValues(new Uint8Array(n)); return [...r].map((x) => a[x % a.length]).join(''); };
  const v = (id) => { const e = $('#' + id); return e ? (e.type === 'checkbox' ? e.checked : e.value) : ''; };
  const copy = (t, w) => navigator.clipboard.writeText(t).then(() => toast(w + ' copiato'), () => toast('Copia non consentita dal browser', 1));
  const SUBS = [[1, '1 mese'], [3, '3 mesi'], [6, '6 mesi'], [12, '12 mesi'], [0, 'Prova']];
  const APP_NAME = { max: 'MaxPlayer', orbix: 'OrbixPlay', kairos: 'Cliente Kairos', orcp: 'App ORCP' };
  const orcpName = () => (S.orcp && S.orcp.name) || (window.KXOrcpName ? KXOrcpName() : APP_NAME.orcp);
  const LS = 'kx.qa.apps';
  const remembered = () => { try { return JSON.parse(localStorage.getItem(LS) || '[]'); } catch { return []; } };
  const appLinks = () => { const a = isAg() ? D.appLinks : D.settings && D.settings.appLinks; return (Array.isArray(a) ? a : []).map((x) => x && x.name).filter((n) => n && !/maxplayer|orbix/i.test(n)); };

  const S = { tok: 0, step: 1, panel: '', name: '', wolf: null, arm: null, atx: null, apps: new Set(remembered()), o: {}, line: null, res: null, busy: false };
  const FX = { atx: 'Atlantix', ro: 'Realott', slt: 'SLT' }, ARM = { armada: 'Armada', storm: 'Storm' }; // Armada e Storm: stessa API
  const panels = () => [
    ['wolf', 'WOLF', 'Linea con utente e password', can('wolf')],
    ['armada', 'Armada', 'Linea M3U / Xtream', can('armada')],
    ['storm', 'Storm', 'Linea M3U / Xtream', can('storm')],
    ['atx', 'Atlantix', 'Il modulo «Crea linea» di Atlantix', !isAg()],
    ['ro', 'Realott', 'Pacchetto Realott (usa crediti)', can('ro')],
    ['slt', 'SLT', 'Pacchetto SLT (usa crediti)', can('slt')],
  ];

  function overlay() {
    let o = $('#qaOv');
    if (!o) { o = document.createElement('div'); o.id = 'qaOv'; o.innerHTML = '<div class="qa-box" id="qaBox"></div>'; document.body.appendChild(o); o.addEventListener('mousedown', (e) => { if (e.target === o && !S.busy) close(); }); }
    return o;
  }
  const close = () => { const o = $('#qaOv'); if (o) o.classList.remove('on'); };

  async function open(pre) {
    pre = pre || {};
    Object.assign(S, { step: 1, panel: '', name: '', line: null, res: null, busy: false, wolf: null, arm: null, atx: null, mxDoms: null, dns: null, o: { srv: '', months: 12, mode: 'new', code: '', dev: '', orbixId: '', host: '', mxDom: '', oxDns: '0', note: '' } });
    const ok = panels().filter((p) => p[3]);
    if (!ok.length) return toast('Nessun pannello IPTV disponibile per te', 1);
    S.panel = ok.some((p) => p[0] === pre.panel) ? pre.panel : ok[0][0];
    const allowed = (k) => k === 'max' ? !!PL().max && can('players') : k === 'orbix' ? !!PL().orbix && can('players') : k === 'kairos' ? can('create') : k === 'orcp' ? !isAg() && !!S.orcp : k.startsWith('app:') ? can('lines') && appLinks().includes(k.slice(4)) : false;
    S.apps = new Set(remembered().filter(allowed));
    overlay().classList.add('on');
    draw(); loadPanel();
  }

  async function loadPanel() {
    const p = S.panel, tok = ++S.tok;
    const stale = () => tok !== S.tok;
    try {
      if (p === 'wolf' && !S.wolf) { const cfg = await api('GET', '/admin/wolf/config'); const pk = cfg.set ? await api('GET', '/admin/wolf/packages') : { packages: [] }; if (stale()) return; S.wolf = { cfg, pk: pk.packages || [], credits: pk.credits }; if (!S.o.host && cfg.dns) S.o.host = cfg.dns; }
      if (ARM[p] && !(S.arm && S.arm.p === p)) { const st = await api('GET', '/admin/' + p + '/state'); const pk = st.connected ? (await api('GET', '/admin/' + p + '/packages')).packages || [] : []; if (stale()) return; S.arm = { p, st, pk }; if (!S.o.host && st.dns) S.o.host = st.dns; }
      if (FX[p] && !S.atx) { const r = await api('GET', '/admin/' + p + '/createform'); if (stale()) return; S.atx = { fields: r.fields || [] }; }
    } catch (e) { if (!stale()) S[ARM[p] ? 'arm' : FX[p] ? 'atx' : p] = { err: e.message }; }
    if (!stale()) draw();
  }
  async function loadApps() {
    if (PL().max && can('players') && !S.mxDoms) { try { S.mxDoms = (await api('GET', '/admin/maxplayer/domains')).domains || []; } catch (e) { S.mxDoms = []; S.mxDoms.err = e.message; } draw(); }
    if (!isAg() && !S.dns) { try { S.dns = (await api('GET', '/admin/dns')).saved || []; } catch { S.dns = []; } draw(); }
    if (!isAg() && S.orcp === undefined && window.KXOrcpCfg) { S.orcp = null; try { S.orcp = await KXOrcpCfg(); } catch { S.orcp = null; } if (S.orcp && S.apps.has('orcp') === false && remembered().includes('orcp')) S.apps.add('orcp'); draw(); }
  }

  /* ---------- passo 1: pannello e linea ---------- */
  function step1() {
    const p = S.panel, W = S.wolf, A = S.arm, X = S.atx;
    let f = '<p class="mut">Carico…</p>';
    if (p === 'wolf' && W) f = W.err ? `<p class="mut">${esc(W.err)}</p>` : !W.cfg.set ? '<p class="mut">WOLF non è collegato: aprilo da Pannelli IPTV → WOLF.</p>' : `<div class="qa-f">
      <label>Utente<input class="inp mono" id="qaU" value="${esc(S.o.u || gen(10))}"></label><label>Password<input class="inp mono" id="qaP" value="${esc(S.o.p || gen(10))}"></label>
      <label class="w">Pacchetto (usa crediti WOLF)<select class="inp" id="qaK">${W.pk.map((x) => `<option value="${esc(x.id)}"${String(S.o.pk) === String(x.id) ? ' selected' : ''}>${esc(x.name)} · ${x.credits} credit${x.credits === 1 ? 'o' : 'i'}</option>`).join('')}</select></label></div>
      <p class="mut" style="font-size:12.5px;margin:8px 0 0">Crediti WOLF: <b>${W.credits ?? '—'}</b></p>`;
    if (ARM[p] && A) f = A.err ? `<p class="mut">${esc(A.err)}</p>` : !A.st.connected ? `<p class="mut">${ARM[p]} non è collegato${isAg() ? ': chiedi a chi ti gestisce' : ''}.</p>` : `<div class="qa-f">
      <label class="w">Durata<div style="display:flex;gap:6px;flex-wrap:wrap">${SUBS.filter(([s]) => s || !(A.st.budget && !A.st.budget.trial)).map(([s, l]) => `<button type="button" class="btn sm${(S.o.sub ?? 12) === s ? ' pri' : ''}" data-qasub="${s}">${l}</button>`).join('')}</div></label>
      <label>Pacchetto di canali<select class="inp" id="qaK"><option value="">Scegli…</option>${A.pk.map((x) => `<option value="${esc(x.id)}"${String(S.o.pk) === String(x.id) ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
      <label>Paese (facoltativo)<input class="inp" id="qaCo" maxlength="3" value="${esc(S.o.co || '')}" placeholder="IT, oppure ALL"></label>
      <label class="w" style="flex-direction:row;align-items:center;text-transform:none;letter-spacing:0;font-size:13px"><input type="checkbox" id="qaAd"${S.o.adult ? ' checked' : ''}> Contenuti per adulti</label></div>
      <p class="mut" style="font-size:12.5px;margin:8px 0 0">${A.st.budget ? `Crediti del tuo tetto ancora disponibili: <b>${A.st.budget.left}</b>` : A.st.reseller ? `Crediti Armada: <b>${esc(A.st.reseller.credits)}</b>` : ''}</p>`;
    if (FX[p] && X) {
      const inp = (x, i) => { const id = 'qaX' + i, req = x.required ? ' *' : '', val = S.o.atx && S.o.atx[x.name] != null ? S.o.atx[x.name] : x.value;
        if (x.type === 'select') return `<label>${esc(x.label)}${req}<select class="inp" id="${id}">${x.options.map((o) => `<option value="${esc(o.v)}"${(S.o.atx ? val === o.v : o.sel) ? ' selected' : ''}>${esc(o.t)}</option>`).join('')}</select></label>`;
        if (x.type === 'checkbox' || x.type === 'radio') return `<label style="flex-direction:row;align-items:center;text-transform:none;letter-spacing:0;font-size:13px"><input type="checkbox" id="${id}"${(S.o.atx ? val : x.checked) ? ' checked' : ''}> ${esc(x.label)}</label>`;
        if (x.type === 'textarea') return `<label class="w">${esc(x.label)}${req}<textarea class="inp" id="${id}" rows="2">${esc(val || '')}</textarea></label>`;
        return `<label>${esc(x.label)}${req}<input class="inp" id="${id}" type="${x.type === 'number' ? 'number' : 'text'}" value="${esc(val || '')}" placeholder="${esc(x.ph || '')}"></label>`; };
      f = X.err ? `<p class="mut">${esc(X.err)}</p>` : `<p class="mut" style="font-size:12.5px;margin:0 0 10px">Le stesse opzioni del modulo «Crea linea» di ${FX[p]} (usa i tuoi crediti ${FX[p]}).</p><div class="qa-f">${X.fields.map(inp).join('')}</div>`;
    }
    return `<div class="qa-pn">${panels().filter((x) => x[3] || !isAg()).map(([k, n, s, ok]) => `<button type="button" data-qapn="${k}" class="${S.panel === k ? 'on' : ''}" ${ok ? '' : 'disabled'}>${n}<small>${ok ? s : 'Non disponibile per te'}</small></button>`).join('')}</div>
      <div class="qa-f" style="margin-bottom:12px"><label class="w">Nome del cliente<input class="inp" id="qaN" maxlength="60" value="${esc(S.name)}" placeholder="es. Mario Rossi — va nella nota della linea e sulle app"></label></div>${f}
      <div class="qa-ft"><button class="btn" id="qaX0">Annulla</button><span class="sp"></span><button class="btn pri" id="qaNext">Avanti: scegli le app →</button></div>`;
  }
  function read1() {
    S.name = v('qaN').trim();
    if (S.panel === 'wolf') Object.assign(S.o, { u: v('qaU').trim(), p: v('qaP'), pk: v('qaK') });
    if (ARM[S.panel]) Object.assign(S.o, { pk: v('qaK'), co: v('qaCo').trim(), adult: !!v('qaAd') });
    if (FX[S.panel] && S.atx && S.atx.fields) { S.o.atx = {}; S.atx.fields.forEach((x, i) => { S.o.atx[x.name] = v('qaX' + i); }); }
  }
  function check1() {
    if (S.panel === 'wolf') { if (!S.wolf || !S.wolf.cfg || !S.wolf.cfg.set) return 'WOLF non è collegato'; if (!S.o.u || !S.o.p) return 'Scrivi utente e password'; if (!S.o.pk) return 'Scegli il pacchetto'; }
    if (ARM[S.panel]) { if (!S.arm || S.arm.p !== S.panel || !S.arm.st || !S.arm.st.connected) return ARM[S.panel] + ' non è collegato'; if (!S.o.pk) return 'Scegli il pacchetto di canali'; }
    if (FX[S.panel]) { if (!S.atx || S.atx.err) return FX[S.panel] + ' non è collegato'; const miss = S.atx.fields.find((x) => x.required && x.type !== 'checkbox' && !String(S.o.atx[x.name] || '').trim()); if (miss) return 'Compila «' + miss.label + '»'; }
    return '';
  }

  /* ---------- passo 2: app ---------- */
  const srvList = () => (Array.isArray(D.servers) ? D.servers : []).filter((x) => x && x.id);
  const devList = () => (Array.isArray(D.devices) ? D.devices : []).filter((d) => d && d.id && !d.parent && d.status !== 'pending');
  function step2() {
    const on = (k) => S.apps.has(k);
    const card = (k, ic, title, sub, body, ok, why) => `<div class="qa-app${on(k) && ok ? ' on' : ''}"><label class="h"><input type="checkbox" data-qaapp="${esc(k)}"${on(k) && ok ? ' checked' : ''}${ok ? '' : ' disabled'}><span class="qa-ic ${ic}">${ic === 'mx' ? 'MX' : ic === 'kx' ? 'KX' : ic === 'ot' ? 'APP' : 'OP'}</span><b>${esc(title)}</b><small>${ok ? sub : why}</small></label>${on(k) && ok ? `<div class="b">${body}</div>` : ''}</div>`;
    const mxOk = !!PL().max && can('players'), oxOk = !!PL().orbix && can('players');
    const doms = S.mxDoms;
    const mx = card('max', 'mx', 'MaxPlayer', 'Crea l\'account del cliente: entra con utente e password della linea', `<label class="l" style="grid-column:1/-1">DNS di MaxPlayer${!doms ? '<small class="mut">Carico…</small>' : doms.length ? `<select class="inp" id="qaMxD">${doms.map((x) => `<option value="${esc(x.id)}"${x.id === S.o.mxDom ? ' selected' : ''}>${esc(x.label || x.domain || 'DNS ' + x.id)}</option>`).join('')}</select>` : `<small class="mut">${esc(doms.err || 'Nessun DNS di MaxPlayer disponibile')}</small>`}</label>`, mxOk, isAg() ? 'Serve il permesso «Attivare OrbixPlay e MaxPlayer»' : 'MaxPlayer non è collegato');
    const oxd = (PL().dns || {}).orbix || [];
    const ox = card('orbix', 'op', 'OrbixPlay', 'Carica la lista sul dispositivo del cliente', `<label class="l">ID del dispositivo (dall\'app OrbixPlay)<input class="inp mono" id="qaOxI" data-mac maxlength="64" autocomplete="off" value="${esc(S.o.orbixId)}" placeholder="es. 00:1A:79:AA:BB:CC"></label>
      <label class="l">DNS di OrbixPlay${oxd.length ? `<select class="inp" id="qaOxD">${oxd.map((x, i) => `<option value="${i}"${String(i) === String(S.o.oxDns) ? ' selected' : ''}>${esc(x.name)}${x.host && !isAg() ? ' — ' + esc(String(x.host).replace(/^https?:\/\//, '')) : ''}</option>`).join('')}</select>` : '<small class="mut">Nessun DNS di OrbixPlay impostato</small>'}</label>`, oxOk, isAg() ? 'Serve il permesso «Attivare OrbixPlay e MaxPlayer»' : 'OrbixPlay non è collegato');
    const orc = S.orcp ? card('orcp', 'ot', orcpName(), "Il cliente apre l'app, sceglie il server e scrive utente e password della linea", `<label class="l" style="grid-column:1/-1">Server che il cliente sceglie nell'app<select class="inp" id="qaOrS">${(S.orcp.servers || []).map((x) => `<option${(S.o.orcpSrv || S.orcp.map[S.panel] || S.orcp.servers[0]) === x ? ' selected' : ''}>${esc(x)}</option>`).join('') || `<option value="">(nessun server: impostali nel Pannello ${esc(orcpName())})</option>`}</select></label>`, true, '') : '';
    const hostField = () => isAg()
      ? `<label class="l">Server della linea${srvList().length ? `<select class="inp" id="qaH">${srvList().map((x) => `<option value="${esc(x.id)}"${x.id === S.o.srv ? ' selected' : ''}>${esc(x.name || 'Server')}</option>`).join('')}</select>` : '<small class="mut">Nessun server assegnato: chiedi a chi ti gestisce</small>'}</label>`
      : `<label class="l">DNS della linea<input class="inp mono" id="qaH" list="qaHL" value="${esc(S.o.host)}" placeholder="${ARM[S.panel] ? 'lo dà ' + ARM[S.panel] + ' alla creazione' : 'http://dns.esempio.com:8080'}"><datalist id="qaHL">${(S.dns || []).map((x) => `<option value="${esc(x.host)}">${esc(x.name || '')}</option>`).join('')}</datalist></label>`;
    const kx = card('kairos', 'kx', 'Cliente Kairos', 'App Kairos Pro, TV, Lite, XC…: cliente nuovo o linea aggiunta a uno esistente', `<label class="l">Cliente<select class="inp" id="qaMode"><option value="new"${S.o.mode === 'new' ? ' selected' : ''}>Nuovo cliente</option><option value="ex"${S.o.mode === 'ex' ? ' selected' : ''}>Cliente esistente</option></select></label>
      ${S.o.mode === 'new' ? `<label class="l">Codice sulla TV${isAg() ? '' : ' (vuoto = lo genera KAIROS)'}<input class="inp mono" id="qaCode" maxlength="9" value="${esc(S.o.code)}" placeholder="KXAB-12CD"></label><label class="l">Durata<select class="inp" id="qaMo">${[1, 3, 6, 12].map((m) => `<option value="${m}"${!S.o.date && +S.o.months === m ? ' selected' : ''}>${m} ${m === 1 ? 'mese' : 'mesi'}</option>`).join('')}<option value="date"${S.o.date ? ' selected' : ''}>Data precisa…</option></select></label>${S.o.date ? `<label class="l" style="grid-column:1/-1">Scade il<input class="inp" id="qaDate" type="date" value="${esc(S.o.date)}" min="${new Date().toISOString().slice(0, 10)}"></label>` : ''}`
        : `<label class="l">Quale cliente<input class="inp" id="qaDev" list="qaDevL" value="${esc(S.o.dev)}" placeholder="nome o codice"><datalist id="qaDevL">${devList().slice(0, 3000).map((d) => `<option value="${esc((d.name || 'Senza nome') + ' · ' + d.code)}">`).join('')}</datalist></label><div></div>`}
      ${hostField()}`, can('create'), 'Serve il permesso «Attivare clienti»');
    const others = appLinks();
    const ot = others.length ? `<div class="qa-app${others.some((n) => on('app:' + n)) ? ' on' : ''}"><div class="h" style="cursor:default"><span class="qa-ic ot">APP</span><b>Altre app</b><small>${can('lines') ? 'Si segnano in «Appunti App» con i dati della linea' : 'Serve il permesso «Appunti App»'}</small></div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px">${others.map((n) => `<label class="btn sm${on('app:' + n) ? ' pri' : ''}" style="cursor:pointer"><input type="checkbox" data-qaapp="app:${esc(n)}"${on('app:' + n) ? ' checked' : ''}${can('lines') ? '' : ' disabled'} style="display:none">${esc(n)}</label>`).join('')}</div>
      ${others.some((n) => on('app:' + n)) && !S.apps.has('kairos') ? `<div class="b">${hostField()}</div>` : ''}</div>` : '';
    return `<p class="mut" style="margin:0 0 12px;font-size:13px">La linea <b>${esc(S.panel === 'wolf' ? 'WOLF' : ARM[S.panel] || FX[S.panel] || S.panel)}</b>${S.name ? ' per <b>' + esc(S.name) + '</b>' : ''} va su: (puoi sceglierne più di una)</p>${mx}${ox}${orc}${kx}${ot}
      <div class="qa-ft"><button class="btn" id="qaBack">← Indietro</button><span class="sp"></span><button class="btn qa-red" id="qaGo">⚡ Crea e attiva${S.apps.size ? ' (' + S.apps.size + ')' : ''}</button></div>`;
  }
  function read2() {
    const g = (id) => ($('#' + id) ? $('#' + id).value : undefined);
    if (g('qaMxD') !== undefined) S.o.mxDom = g('qaMxD');
    if (g('qaOxI') !== undefined) S.o.orbixId = g('qaOxI').trim();
    if (g('qaOrS') !== undefined) S.o.orcpSrv = g('qaOrS');
    if (g('qaOxD') !== undefined) S.o.oxDns = g('qaOxD');
    if (g('qaMode') !== undefined) S.o.mode = g('qaMode');
    if (g('qaCode') !== undefined) S.o.code = g('qaCode').trim().toUpperCase();
    if (g('qaMo') !== undefined) { if (g('qaMo') === 'date') { if (!S.o.date) S.o.date = addMonths('', 12); } else { S.o.months = +g('qaMo'); S.o.date = ''; } }
    if (g('qaDate') !== undefined) S.o.date = g('qaDate');
    if (g('qaDev') !== undefined) S.o.dev = g('qaDev').trim();
    if (g('qaH') !== undefined) { if (isAg()) S.o.srv = g('qaH'); else S.o.host = g('qaH').trim(); }
  }
  function check2() {
    if (S.apps.has('orbix') && !S.o.orbixId) return 'Scrivi l\'ID del dispositivo OrbixPlay';
    if (S.apps.has('kairos')) {
      if (S.o.mode === 'new' && isAg() && !/^KX[A-Z0-9]{2}-[A-Z0-9]{4}$/.test(S.o.code)) return 'Scrivi il codice che il cliente vede sulla TV (es. KXAB-12CD)';
      if (S.o.mode === 'ex' && !findDev()) return 'Scegli il cliente esistente dall\'elenco';
      if (isAg() && !S.o.srv) return 'Scegli il server della linea';
      if (S.o.mode === 'new' && S.o.date && !(/^\d{4}-\d{2}-\d{2}$/.test(S.o.date) && new Date(S.o.date) > new Date())) return 'Scegli una data di scadenza futura';
    }
    return '';
  }
  const findDev = () => { const t = S.o.dev.toLowerCase(); return devList().find((d) => ((d.name || 'Senza nome') + ' · ' + d.code).toLowerCase() === t || String(d.code).toLowerCase() === t); };

  /* ---------- passo 3: esecuzione e riepilogo ---------- */
  async function createLine() {
    const note = S.name;
    if (S.panel === 'wolf') { const r = await api('POST', '/admin/wolf/lines', { username: S.o.u, password: S.o.p, package: S.o.pk, note }); return { username: S.o.u, password: S.o.p, host: S.o.host || '', ref: r.id ? 'WOLF #' + r.id : 'WOLF' }; }
    if (ARM[S.panel]) { const sub = S.o.sub ?? 12; const r = await api('POST', '/admin/' + S.panel + '/new', { type: 'm3u', sub, htime: sub ? undefined : 24, pack: S.o.pk, country: S.o.co || '', adult: !!S.o.adult, notes: note }); if (!r.username) throw new Error(ARM[S.panel] + ' non ha restituito utente e password'); if (r.host) S.o.host = r.host; return { username: r.username, password: r.password, host: r.host || S.o.host || '', ref: ARM[S.panel] + (r.userId ? ' #' + r.userId : ''), url: r.url }; }
    const r = await api('POST', '/admin/' + S.panel + '/lines/create', { fields: S.o.atx }); if (!r.username) throw new Error(FX[S.panel] + ' non ha restituito utente e password'); return { username: r.username, password: r.password, host: S.o.host || '', ref: FX[S.panel] };
  }
  async function runApp(k) {
    const L = S.line, name = S.name || L.username;
    if (k === 'max') { const r = await api('POST', '/admin/ext-lists', { app: 'max', name, username: L.username, password: L.password, domain: S.o.mxDom, note: L.ref }); return `Account creato${r.dns ? ' · DNS ' + r.dns : ''}: il cliente entra in MaxPlayer con utente e password della linea`; }
    if (k === 'orbix') { const r = await api('POST', '/admin/ext-lists', { app: 'orbix', name, orbixId: S.o.orbixId, username: L.username, password: L.password, dns: +S.o.oxDns || 0, note: L.ref }); return `Lista caricata sul dispositivo ${r.ref || S.o.orbixId}${r.dns ? ' · DNS ' + r.dns : ''}`; }
    if (k === 'orcp') { const srv = S.o.orcpSrv || (S.orcp && (S.orcp.map[S.panel] || (S.orcp.servers || [])[0])) || ''; await api('POST', '/admin/linked-lines', { app: orcpName(), username: L.username, password: L.password, dns: '', note: [name !== L.username ? name : '', L.ref, srv ? 'Server ' + srv : ''].filter(Boolean).join(' · ') }); S.o.orcpSrvUsed = srv; return `Segnata in Appunti App${srv ? ' · il cliente sceglie «' + srv + '» nell\'app' : ''}`; }
    if (k === 'kairos') {
      const plName = L.ref.split(' ')[0] || 'Linea';
      // agente: solo il server assegnato (serverId), mai il DNS; titolare: host della linea
      const pl = isAg() ? { serverId: S.o.srv, name: plName, username: L.username, password: L.password } : { id: 'p' + Date.now(), name: plName, type: 'xtream', url: '', host: L.host, username: L.username, password: L.password };
      if (isAg() ? !S.o.srv : !L.host) throw new Error(isAg() ? 'Scegli il server della linea' : 'Scrivi il DNS della linea (es. http://dns.esempio.com:8080)');
      if (S.o.mode === 'ex') {
        const d = findDev(); if (!d) throw new Error('Cliente non trovato'); S.o.exDev = d;
        if (!isAg()) return `Linea pronta per ${d.name || d.code}: premi «Apri la scheda» e salva`;
        const keep = (d.playlists || []).map((x) => ({ id: x.id, serverId: x.serverId, username: x.username, password: x.password }));
        await api('PUT', '/admin/devices/' + d.id, { playlists: [...keep, pl] }); S.o.exDev = null;
        return `Linea aggiunta a ${d.name || d.code}`;
      }
      const r = await api('POST', '/admin/devices', { code: S.o.code, name, notes: L.ref, expires: S.o.date || addMonths('', +S.o.months || 12), active: true, playlists: [pl] });
      S.o.newCode = (r && r.code) || S.o.code; return `Cliente creato${S.o.newCode ? ' · codice ' + S.o.newCode : ''} · scade ${S.o.date ? 'il ' + S.o.date.split('-').reverse().join('/') : 'tra ' + S.o.months + ' mesi'}`;
    }
    if (k.startsWith('app:')) { await api('POST', '/admin/linked-lines', { app: k.slice(4), username: L.username, password: L.password, dns: isAg() ? '' : L.host || '', note: [name, L.ref].filter(Boolean).join(' · ') }); return 'Segnata in Appunti App'; }
    throw new Error('App sconosciuta');
  }
  async function go() {
    read2(); const e = check2(); if (e) return toast(e, 1);
    const panelName = S.panel === 'wolf' ? 'WOLF' : ARM[S.panel] || FX[S.panel] || S.panel;
    const destinations = [...S.apps].map((k) => k === 'orcp' ? orcpName() : APP_NAME[k] || k.replace(/^app:/, '')).join(' · ');
    if (!(await ask('Confermare l’attivazione?', `<p>Verrà creata una linea su <b>${esc(panelName)}</b>${S.name ? ` per <b>${esc(S.name)}</b>` : ''}${destinations ? ` e registrata su <b>${esc(destinations)}</b>` : ''}.</p>`, 'Crea e attiva'))) return;
    localStorage.setItem(LS, JSON.stringify([...S.apps]));
    S.busy = true; S.step = 3; S.res = { line: null, apps: [] }; draw();
    try { S.line = await createLine(); S.res.line = { ok: true }; }
    catch (err) { S.res.line = { ok: false, msg: err.message }; S.busy = false; return draw(); }
    for (const k of [...S.apps]) { S.res.apps.push({ k, ok: null }); draw(); const it = S.res.apps[S.res.apps.length - 1]; try { it.msg = await runApp(k); it.ok = true; } catch (err) { it.ok = false; it.msg = err.message; } }
    S.busy = false; draw();
    if (window.KXRefresh) try { KXRefresh(); } catch {}
  }
  async function retry(i) {
    const it = S.res.apps[i]; if (!it || S.busy) return;
    const label = it.k === 'orcp' ? orcpName() : APP_NAME[it.k] || it.k.replace(/^app:/, '');
    if (!(await ask(`Riprova su ${label}?`, `<p>Verrà ripetuta l'operazione per <b>${esc(S.name || S.line?.username || 'questa linea')}</b>.</p>`, 'Riprova'))) return;
    read2(); it.ok = null; S.busy = true; draw();
    try { it.msg = await runApp(it.k); it.ok = true; } catch (err) { it.ok = false; it.msg = err.message; }
    S.busy = false; draw();
  }
  function waText() {
    const L = S.line, out = [`Ciao${S.name ? ' ' + S.name : ''}! Ecco i dati della tua linea:`, `Utente: ${L.username}`, `Password: ${L.password}`];
    if (L.host && !isAg()) out.push(`Server: ${L.host}`);
    const okApps = (S.res.apps || []).filter((x) => x.ok).map((x) => x.k);
    if (okApps.length) out.push('');
    for (const k of okApps) {
      if (k === 'max') out.push('• MaxPlayer: apri l\'app ed entra con utente e password qui sopra.');
      if (k === 'orbix') out.push(`• OrbixPlay: la lista è già caricata sul tuo dispositivo (${S.o.orbixId}). Apri l'app e basta.`);
      if (k === 'kairos') out.push(S.o.mode === 'new' ? `• App Kairos: all'avvio scrivi il codice ${S.o.newCode || S.o.code || 'che vedi sulla TV'}.` : '• App Kairos: la nuova linea è nel tuo abbonamento.');
      if (k === 'orcp') out.push(`• ${orcpName()}: apri l'app, scegli il server «${S.o.orcpSrvUsed || 'indicato'}» ed entra con utente e password qui sopra.`);
      if (k.startsWith('app:')) out.push(`• ${k.slice(4)}: carica la lista con utente e password qui sopra.`);
    }
    out.push('', 'Buona visione!');
    return out.join('\n');
  }
  function step3() {
    const R = S.res, L = S.line, lbl = (k) => k === 'orcp' ? orcpName() : APP_NAME[k] || k.replace(/^app:/, '');
    const kv = (k, val) => val ? `<span class="mut">${k}</span><span class="mono" title="${esc(val)}">${esc(val)}</span><button class="btn sm" data-qacp="${esc(val)}">Copia</button>` : '';
    const lineRow = !R.line ? '<div class="r"><i>…</i><div><b>Creo la linea…</b></div></div>'
      : R.line.ok ? `<div class="r ok"><i>✓</i><div><b>Linea creata su ${esc(L.ref)}</b><div class="qa-kv">${kv('Utente', L.username)}${kv('Password', L.password)}${isAg() ? '' : kv('DNS', L.host)}</div></div></div>`
      : `<div class="r ko"><i>✕</i><div><b>Linea non creata</b><small>${esc(R.line.msg)}</small></div><button class="btn sm" id="qaBack">Correggi</button></div>`;
    const apps = R.apps.map((x, i) => `<div class="r ${x.ok === null ? '' : x.ok ? 'ok' : 'ko'}"><i>${x.ok === null ? '…' : x.ok ? '✓' : '✕'}</i><div><b>${esc(lbl(x.k))}</b><small>${esc(x.msg || (x.ok === null ? 'In corso…' : ''))}</small></div>${x.ok === false ? `<button class="btn sm" data-qare="${i}">Riprova</button>` : x.ok && x.k === 'kairos' && S.o.mode === 'ex' && !isAg() && S.o.exDev ? '<button class="btn sm pri" id="qaOpenDev">Apri la scheda</button>' : ''}</div>`).join('');
    const done = R.line && R.line.ok && R.apps.every((x) => x.ok !== null) && !S.busy;
    return `<div class="qa-res">${lineRow}${apps}</div>
      ${done ? `<details style="margin-top:14px"><summary style="cursor:pointer;font-weight:700;font-size:13.5px">Messaggio per il cliente (WhatsApp)</summary><div class="qa-msg" style="margin-top:8px">${esc(waText())}</div></details>` : ''}
      <div class="qa-ft">${done ? '<button class="btn" id="qaWa">Copia messaggio</button><button class="btn" id="qaAgain">Un\'altra attivazione</button>' : ''}<span class="sp"></span><button class="btn pri" id="qaX0"${S.busy ? ' disabled' : ''}>Chiudi</button></div>`;
  }

  function draw() {
    const B = $('#qaBox'); if (!B) return;
    const st = ['Pannello e linea', 'App', 'Attivazione'];
    B.innerHTML = `<h3 style="margin:0 0 4px">⚡ Nuova attivazione: App e Linea IPTV</h3><p class="mut" style="margin:0 0 12px;font-size:13px">Crei la linea sul pannello IPTV e la metti subito sulle app del cliente.</p>
      <div class="qa-steps">${st.map((s, i) => `<span class="${S.step === i + 1 ? 'on' : S.step > i + 1 ? 'ok' : ''}">${i + 1}. ${s}</span>`).join('')}</div>${S.step === 1 ? step1() : S.step === 2 ? step2() : step3()}`;
    bind(B);
  }
  function bind(B) {
    $$('[data-qapn]', B).forEach((b) => (b.onclick = () => { read1(); S.panel = b.dataset.qapn; S.atx = null; S.o.atx = null; S.o.pk = ''; S.o.host = ''; draw(); loadPanel(); }));
    $$('[data-qasub]', B).forEach((b) => (b.onclick = () => { read1(); S.o.sub = +b.dataset.qasub; draw(); }));
    $$('[data-qaapp]', B).forEach((c) => (c.onchange = () => { read2(); c.checked ? S.apps.add(c.dataset.qaapp) : S.apps.delete(c.dataset.qaapp); draw(); }));
    ['qaMode', 'qaMo'].forEach((id) => { const el = $('#' + id); if (el) el.onchange = () => { read2(); draw(); }; });
    $$('[data-qacp]', B).forEach((b) => (b.onclick = () => copy(b.dataset.qacp, 'Testo')));
    $$('[data-qare]', B).forEach((b) => (b.onclick = () => retry(+b.dataset.qare)));
    $('#qaX0') && ($('#qaX0').onclick = close);
    $('#qaNext') && ($('#qaNext').onclick = () => { read1(); const e = check1(); if (e) return toast(e, 1); S.step = 2; draw(); loadApps(); });
    $('#qaBack') && ($('#qaBack').onclick = () => { if (S.step === 2) read2(); S.step = 1; S.res = null; draw(); });
    $('#qaGo') && ($('#qaGo').onclick = go);
    $('#qaWa') && ($('#qaWa').onclick = () => copy(waText(), 'Messaggio'));
    $('#qaAgain') && ($('#qaAgain').onclick = () => open({ panel: S.panel }));
    $('#qaOpenDev') && ($('#qaOpenDev').onclick = () => {
      const d = S.o.exDev, L = S.line; if (!d) return;
      close(); openDrawer(d, false);
      setTimeout(() => { try { edit.playlists.push({ id: 'p' + Date.now(), name: L.ref.split(' ')[0] || 'Linea', type: 'xtream', url: '', host: L.host, username: L.username, password: L.password }); renderDrawer(); toast('Linea aggiunta alle playlist: controlla e premi Salva'); } catch { toast('Aggiungila a mano con «Incolla linea»', 1); } }, 60);
    });
  }

  window.KXQuick = { open };
  const BTN = '<button class="btn sm qa-red" data-kxquick title="Crea la linea e mettila subito sulle app">⚡ Nuova attivazione: App e Linea IPTV</button>';
  const usable = (panel) => { try { return panels().some((x) => x[0] === panel && x[3]); } catch { return true; } };
  window.KXQuick.button = (panel) => (usable(panel) ? BTN.replace('data-kxquick', `data-kxquick="${panel}"`) : '');
  document.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('[data-kxquick]'); if (b) { e.preventDefault(); open({ panel: b.dataset.kxquick }); } });
})();
