/* KAIROS Control — sezione «App» per gli agenti: le stesse voci del titolare, ognuna concessa da lui.
   «OrbixPlay e MaxPlayer» (codici cliente e liste dei suoi clienti, senza DNS né impostazioni) e
   «App Kairos» (link e codice Downloader delle sole app Kairos scelte). Il titolare usa le sue pagine. */
(() => {
  const css = document.createElement('style');
  css.textContent = `.ak-g{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px}
.ak-c{border:1px solid var(--line);border-radius:14px;padding:14px;background:rgba(255,255,255,.025);display:flex;flex-direction:column;gap:8px}
.ak-c b.n{font-size:15px}.ak-c .cd{font-family:ui-monospace,monospace;font-size:22px;font-weight:700;letter-spacing:.06em}
.ak-c .row2{display:flex;gap:6px;flex-wrap:wrap}.ak-c a.btn{color:#eef1f8!important;text-decoration:none!important}
.ak-ic{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;font-weight:800;font-size:12px;background:rgba(79,140,255,.18);color:#8fb3ff}
.ak-ic.mx{background:rgba(251,113,133,.18);color:#fda4af}`;
  document.head.appendChild(css);
  const isAg = () => D.role === 'agent';
  const perm = (k) => !!(((D.me || {}).perms) || {})[k];
  Object.assign(TITLES, { agop: 'OrbixPlay e MaxPlayer', agk: 'App Kairos' });
  const side = $('#side'), dash = $('#v-dash');
  for (const [v, l] of [['agop', 'OrbixPlay e MaxPlayer'], ['agk', 'App Kairos']]) {
    if (!$(`.nav[data-v="${v}"]`) && side) { const b = document.createElement('button'); b.className = 'nav'; b.dataset.v = v; b.style.display = 'none'; b.textContent = l; b.onclick = () => view(v); side.appendChild(b); }
    if (!$('#v-' + v) && dash) { const sec = document.createElement('section'); sec.className = 'view'; sec.id = 'v-' + v; dash.after(sec); }
  }
  const copy = (t, what) => navigator.clipboard.writeText(t).then(() => toast(what + ' copiato'), () => toast('Copia non consentita', 1));

  /* ---------- OrbixPlay e MaxPlayer (agente) ---------- */
  let L = null, f = 'all', busy = false;
  async function loadLists() { if (busy) return; busy = true; try { L = await api('GET', '/admin/apps3/lists?days=60'); } catch (e) { L = { lists: [], err: e.message }; } busy = false; drawOp(); }
  function drawOp() {
    const V = $('#v-agop'); if (!V) return;
    const P = D.players || null, slots = (P && P.slots) || [];
    const codes = !P ? '<p class="mut">Per vedere i codici cliente e attivare le app dal pannello serve il permesso «Attivare OrbixPlay e MaxPlayer dal pannello».</p>'
      : slots.length ? `<div class="ak-g">${slots.map((x) => `<div class="ak-c"><div style="display:flex;gap:10px;align-items:center"><span class="ak-ic ${x.app === 'max' ? 'mx' : ''}">${x.app === 'max' ? 'MX' : 'OP'}</span><div><b class="n">${esc(x.name || '')}</b><br><small class="mut">${x.app === 'max' ? 'MaxPlayer' : 'OrbixPlay'}</small></div></div><small class="mut">Codice cliente</small><span class="cd">${esc(x.code || '—')}</span><div class="row2">${x.code ? `<button class="btn sm pri" data-akc="${esc(x.code)}">Copia codice</button>` : ''}${x.link ? `<button class="btn sm" data-akl="${esc(x.link)}">Copia link</button>` : ''}</div></div>`).join('')}</div>` : '<p class="mut">Nessun codice impostato dal titolare.</p>';
    const all = (L && L.lists) || [], ina = all.filter((x) => x.inactive), show = f === 'ina' ? ina : all, canRm = perm('players');
    const fmt = (t) => (t ? new Date(t).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
    V.innerHTML = `<div class="card glass"><div class="hd"><h3>Codici cliente<small>Il codice da dare al cliente per ogni fornitore. Le liste le attivi dalla scheda del cliente (parte «App»).</small></h3></div>${codes}</div>
      <div class="card glass" style="margin-top:16px"><div class="hd"><h3>Liste create su OrbixPlay e MaxPlayer<small>Solo quelle dei tuoi clienti. Inattiva = abbonamento scaduto o cliente disattivato da più di 60 giorni.</small></h3>
        <div class="seg"><button data-akf="all" class="${f === 'all' ? 'on' : ''}">Tutte <span style="opacity:.6">${all.length}</span></button><button data-akf="ina" class="${f === 'ina' ? 'on' : ''}">Solo inattive <span style="opacity:.6">${ina.length}</span></button></div></div>
        ${!L ? '<p class="mut">Carico…</p>' : L.err ? `<p class="mut">${esc(L.err)}</p>` : show.length ? `<div class="tbl-wrap"><table class="tbl" style="width:100%"><thead><tr><th>Cliente</th><th>App</th><th>Lista</th><th>Inviata</th><th>Stato</th><th></th></tr></thead><tbody>${show.map((x) => `<tr><td><b>${esc(x.name || '—')}</b><br><small class="mono mut">${esc(x.code)}</small></td><td><span class="ak-ic ${x.app === 'max' ? 'mx' : ''}" style="width:30px;height:30px;font-size:11px;display:inline-grid">${x.app === 'max' ? 'MX' : 'OP'}</span></td><td class="mono" style="font-size:12.5px">${esc(x.app === 'max' ? 'utente ' + x.ref : 'ID ' + x.ref)}</td><td>${esc(fmt(x.t))}</td><td>${x.inactive ? `<span style="color:var(--bad)">${x.why === 'scaduto' ? 'Scaduto' : 'Disattivato'}</span>` : x.status === 'expired' ? '<span style="color:var(--warn)">Scaduto da poco</span>' : x.status === 'disabled' ? '<span style="color:var(--warn)">Disattivato</span>' : '<span style="color:var(--ok)">Attivo</span>'}</td><td>${canRm ? `<button class="btn sm" data-akrm="${esc(x.app)}:${esc(x.id)}">Rimuovi</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : `<div class="emptyc">${f === 'ina' ? 'Nessuna lista inattiva' : 'Nessuna lista creata per i tuoi clienti'}</div>`}</div>`;
    $$('[data-akc]', V).forEach((b) => (b.onclick = () => copy(b.dataset.akc, 'Codice')));
    $$('[data-akl]', V).forEach((b) => (b.onclick = () => copy(b.dataset.akl, 'Link')));
    $$('[data-akf]', V).forEach((b) => (b.onclick = () => { f = b.dataset.akf; drawOp(); }));
    $$('[data-akrm]', V).forEach((b) => (b.onclick = async () => {
      const [app, id] = b.dataset.akrm.split(':'), NAME = app === 'max' ? 'MaxPlayer' : 'OrbixPlay', x = all.find((y) => y.id === id && y.app === app) || {};
      if (!(await askDanger(`Rimuovere la lista da ${NAME}?`, `${esc(x.name || x.code || '')}: la lista sparisce da ${NAME}. L'abbonamento Kairos non cambia.`, 'ELIMINA', 'Rimuovi', false))) return;
      try { await api('DELETE', (app === 'max' ? '/admin/maxplayer/' : '/admin/orbix/') + id); toast('Lista rimossa da ' + NAME); await load(); loadLists(); } catch (e) { toast(e.message, 1); }
    }));
  }

  /* ---------- App Kairos (agente) ---------- */
  function drawK() {
    const V = $('#v-agk'); if (!V) return;
    const A = Array.isArray(D.kairosApps) ? D.kairosApps : [];
    V.innerHTML = `<div class="card glass"><div class="hd"><h3>App Kairos<small>Le app da far installare ai clienti: codice Downloader e link per scaricarle.</small></h3></div>
      ${A.length ? `<div class="ak-g">${A.map((x) => `<div class="ak-c"><b class="n">${esc(x.name)}</b><small class="mut">Codice Downloader</small><span class="cd">${esc(x.code || '—')}</span><div class="row2">${x.code ? `<button class="btn sm pri" data-akc="${esc(x.code)}">Copia codice</button>` : ''}${x.apk ? `<button class="btn sm" data-akl="${esc(x.apk)}">Copia link APK</button><a class="btn sm" href="${esc(x.apk)}" target="_blank" rel="noopener noreferrer">Scarica ↗</a>` : ''}</div></div>`).join('')}</div>` : '<p class="mut">Nessuna app Kairos concessa dal titolare.</p>'}</div>`;
    $$('[data-akc]', V).forEach((b) => (b.onclick = () => copy(b.dataset.akc, 'Codice')));
    $$('[data-akl]', V).forEach((b) => (b.onclick = () => copy(b.dataset.akl, 'Link')));
  }

  function navs() {
    const ag = isAg(), a = $('.nav[data-v="agop"]'), k = $('.nav[data-v="agk"]');
    const on = (el, ok) => { if (el && el.style.display !== (ok ? '' : 'none')) el.style.display = ok ? '' : 'none'; };
    on(a, ag && perm('appsOp')); on(k, ag && perm('appk'));
    if ($('#v-agop.on')) drawOp(); if ($('#v-agk.on')) drawK();
  }
  const ra = renderAll;
  window.renderAll = renderAll = function () { ra(); navs(); };
  const v0 = view;
  window.view = view = function (v) { const r = v0.apply(this, arguments); if (v === 'agop') { drawOp(); loadLists(); } if (v === 'agk') drawK(); return r; };
})();
