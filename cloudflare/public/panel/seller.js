/* KAIROS Control — «pagina venditore»: la testata che gli agenti vedono in cima alle pagine dei pannelli (Atlantix, WOLF).
   Saluto con l'account, credito, azioni rapide, riquadri cliccabili e «Prossime scadenze» con «Rinnova».
   Solo HTML e stile: i numeri li passa la pagina del pannello con i dati che ha (nessuna richiesta in più ai pannelli).
   Clic: data-sx = chiave dell'azione o del riquadro, data-sxr = indice della scadenza da rinnovare (KXSeller.bind). Usa app.js. */
(() => {
  const CSS = `.axs{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr) minmax(0,1fr);gap:14px;margin-bottom:14px}
.axs-hero{grid-row:span 2;display:flex;flex-direction:column;gap:18px;padding:22px 24px;border-radius:16px;border:1px solid var(--line);background:radial-gradient(120% 140% at 0% 0%,rgba(123,92,255,.20),transparent 55%),var(--glass)}
.axs-top{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:18px;align-items:start}.axs-hi{font-size:30px;font-weight:800;letter-spacing:-.02em;line-height:1.15;margin:0;overflow-wrap:anywhere}.axs-hi span{color:#8f7dff}
.axs-sub{margin:6px 0 0;color:var(--mut);font-size:13px}.axs-cred{border-left:1px solid var(--line);padding-left:18px;min-width:160px}.axs-cred b{display:block;font-size:34px;font-weight:800;margin:6px 0 2px}
.axs-k{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--mut)}
.axs-acts{display:grid;grid-template-columns:repeat(auto-fit,minmax(175px,1fr));gap:10px;margin-top:auto}
.axs-act{all:unset;box-sizing:border-box;cursor:pointer;display:flex;gap:11px;align-items:center;padding:12px 14px;border-radius:12px;border:1px solid var(--line);background:rgba(255,255,255,.03);transition:background .15s}
.axs-act:hover,.axs-tile:hover{background:rgba(255,255,255,.07)}.axs-act i{font-style:normal;display:grid;place-items:center;width:34px;height:34px;border-radius:9px;background:rgba(123,92,255,.2);font-size:16px;flex:none}
.axs-act b{display:block;font-size:13.5px}.axs-act small{display:block;color:var(--mut);font-size:12px;margin-top:2px}
.axs-tile{all:unset;box-sizing:border-box;cursor:pointer;display:flex;flex-direction:column;gap:6px;padding:16px 18px;border-radius:16px;border:1px solid var(--line);background:var(--glass);min-height:120px;transition:background .15s}
.axs-tile .n{display:block;font-size:30px;font-weight:800;line-height:1.1}.axs-tile small{color:var(--mut);font-size:12.5px}
.axs-two{display:grid;grid-template-columns:1fr 1fr;gap:10px}.axs-two>div{display:flex;flex-direction:column;gap:2px}.axs-two>div+div{border-left:1px solid var(--line);padding-left:12px}
.axs-exp{margin-bottom:14px}.axs-row{display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid var(--line)}.axs-row:last-child{border-bottom:0}
@media (max-width:1100px){.axs{grid-template-columns:1fr 1fr}.axs-hero{grid-column:1/-1;grid-row:auto}}
@media (max-width:620px){.axs{grid-template-columns:1fr}.axs-top{grid-template-columns:1fr}.axs-hi{font-size:24px}.axs-cred{border-left:0;padding-left:0}}`;
  const css = () => { if (document.getElementById('kxSellerCss')) return; const s = document.createElement('style'); s.id = 'kxSellerCss'; s.textContent = CSS; document.head.appendChild(s); };
  const hello = () => { const h = new Date().getHours(); return h >= 5 && h < 13 ? 'Buongiorno' : h >= 13 && h < 18 ? 'Buon pomeriggio' : 'Buonasera'; };
  /** data in secondi (accetta anche millisecondi) */
  const sec = (t) => { const n = Number(t); return n ? (n > 1e11 ? n / 1000 : n) : 0; };
  /** giorni di calendario da oggi alla data: scade il 15, oggi è il 10 → 5 */
  const daysTo = (t) => { const s = sec(t); if (!s) return null; const e = new Date(s * 1000), d0 = new Date(); return Math.round((Date.UTC(e.getFullYear(), e.getMonth(), e.getDate()) - Date.UTC(d0.getFullYear(), d0.getMonth(), d0.getDate())) / 864e5); };
  const when = (t) => { const d = daysTo(t); return d == null ? '' : ' · ' + (d < 0 ? 'scaduta' : d === 0 ? 'oggi' : d === 1 ? 'domani' : 'tra ' + d + ' giorni'); };
  const val = (v) => (v === undefined || v === null || v === '' ? '—' : esc(String(v)));
  /** m = { user, sub, credits, creditsNote, actions: [[chiave, icona, titolo, descrizione]], tiles, exp, expMore }
      tiles: { go, label, value, color, note } oppure { label, two: [{ go, value, color, note }, …] }
      exp: null = carico, false = niente riquadro, [{ name, exp (secondi o ms), note }] = prossime scadenze */
  function html(m) {
    css();
    const qa = ([k, ic, t, d]) => `<button type="button" class="axs-act" data-sx="${esc(k)}"><i>${ic}</i><span><b>${esc(t)}</b><small>${esc(d)}</small></span></button>`;
    const color = (c) => (c ? ` style="color:${esc(c)}"` : '');
    const tile = (x) => (x.two
      ? `<div class="axs-tile" style="cursor:default"><span class="axs-k">${esc(x.label)}</span><div class="axs-two">${x.two.map((y) => `<div${y.go ? ` data-sx="${esc(y.go)}" style="cursor:pointer"` : ''}><span class="n"${color(y.color)}>${val(y.value)}</span><small>${esc(y.note || '')}</small></div>`).join('')}</div></div>`
      : `<button type="button" class="axs-tile"${x.go ? ` data-sx="${esc(x.go)}"` : ' style="cursor:default"'}><span class="axs-k">${esc(x.label)}</span><span class="n"${color(x.color)}>${val(x.value)}</span><small>${esc(x.note || '')}</small></button>`);
    const exp = Array.isArray(m.exp) ? m.exp : [];
    const box = m.exp === false ? '' : `<div class="card glass axs-exp"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:6px"><b>⏳ Prossime scadenze</b>${exp.length && m.expMore ? `<button class="btn sm" data-sx="${esc(m.expMore)}">Vedi tutte</button>` : ''}</div>
      ${m.exp == null ? '<p class="mut" style="margin:8px 0">Carico…</p>' : exp.length ? exp.slice(0, 6).map((r, i) => `<div class="axs-row"><div style="flex:1;min-width:0"><b>${esc(r.name || '')}</b><div class="mut" style="font-size:12px">scade il ${esc(new Date(sec(r.exp) * 1000).toLocaleDateString('it-IT'))}${when(r.exp)}${r.note ? ' · ' + esc(String(r.note).slice(0, 60)) : ''}</div></div><button class="btn sm act-renew" data-sxr="${i}">Rinnova</button></div>`).join('') : '<p class="mut" style="margin:8px 0">Nessuna linea in scadenza. 🎉</p>'}</div>`;
    return `<div class="axs">
      <div class="axs-hero">
        <div class="axs-top"><div><h2 class="axs-hi">${hello()}, <span>${esc(m.user || '')}</span></h2><p class="axs-sub">${esc(m.sub || '')}</p></div>
          <div class="axs-cred"><div class="axs-k">Credito disponibile</div><b>${val(m.credits)}</b><small class="mut">${esc(m.creditsNote || 'crediti per attivare e rinnovare')}</small></div></div>
        <div class="axs-acts">${(m.actions || []).map(qa).join('')}</div>
      </div>${(m.tiles || []).map(tile).join('')}
    </div>${box}`;
  }
  /** clic su azioni e riquadri → go(chiave); «Rinnova» → renew(indice della scadenza) */
  function bind(root, go, renew) {
    root.querySelectorAll('[data-sx]').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); go(b.dataset.sx); }));
    root.querySelectorAll('[data-sxr]').forEach((b) => (b.onclick = () => renew(+b.dataset.sxr)));
  }
  window.KXSeller = { html, bind, sec, daysTo };
})();
