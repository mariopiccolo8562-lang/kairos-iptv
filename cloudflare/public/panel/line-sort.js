/* KAIROS Control — ordinamento e filtro «in scadenza entro N giorni» per le liste linee dei pannelli IPTV
   (WOLF, Armada, Atlantix, Realott, SLT). Ogni pannello passa la sua lista e come leggere i campi; qui si
   ordina e si filtra. Lo stato (sort, days) vive nel pannello. Usa app.js ($, $$, esc). */
(() => {
  const SORTS = [['', 'Ordine del pannello'], ['exp', 'Scadenza: prima le più vicine'], ['exp-desc', 'Scadenza: prima le più lontane'], ['name', 'Nome: A → Z'], ['name-desc', 'Nome: Z → A'], ['conns', 'Connessioni: più attive prima'], ['status', 'Stato: attive, in scadenza, scadute'], ['owner', 'Reseller: A → Z'], ['new', 'Create: più recenti prima']];
  const DAYS = [[0, 'Tutte le scadenze'], [2, 'Scadono entro 2 giorni'], [3, 'Scadono entro 3 giorni'], [5, 'Scadono entro 5 giorni'], [7, 'Scadono entro 7 giorni']];
  const DAY = 86400e3;
  const cmpStr = (a, b) => String(a || '').localeCompare(String(b || ''), 'it', { sensitivity: 'base', numeric: true });
  /** acc: { exp(x) → ms (0 = illimitata), name(x), enabled(x) → bool, conns(x) → n, owner(x), created(x) → ms } */
  const apply = (list, S, acc) => {
    const now = Date.now(), exp = (x) => +(acc.exp ? acc.exp(x) : x.exp) || 0;
    let L = list;
    if (+S.days > 0) L = L.filter((x) => { const e = exp(x); return e && e > now && e - now <= +S.days * DAY && (acc.enabled ? acc.enabled(x) : x.enabled !== false); });
    const k = S.sort || ''; if (!k) return L;
    const nm = (x) => (acc.name ? acc.name(x) : x.username), en = (x) => (acc.enabled ? acc.enabled(x) : x.enabled !== false), cn = (x) => +(acc.conns ? acc.conns(x) : x.conns) || 0;
    const st = (x) => (!en(x) ? 3 : exp(x) && exp(x) < now ? 2 : exp(x) && exp(x) - now < 7 * DAY ? 1 : 0);
    const big = 8.64e15, byExp = (a, b) => (exp(a) || big) - (exp(b) || big);
    const C = {
      exp: byExp, 'exp-desc': (a, b) => byExp(b, a), name: (a, b) => cmpStr(nm(a), nm(b)), 'name-desc': (a, b) => cmpStr(nm(b), nm(a)),
      conns: (a, b) => cn(b) - cn(a) || byExp(a, b), status: (a, b) => st(a) - st(b) || byExp(a, b),
      owner: (a, b) => cmpStr(acc.owner ? acc.owner(a) : a.owner, acc.owner ? acc.owner(b) : b.owner) || cmpStr(nm(a), nm(b)),
      new: (a, b) => (+(acc.created ? acc.created(b) : b.created) || 0) - (+(acc.created ? acc.created(a) : a.created) || 0),
    }[k];
    return C ? [...L].sort(C) : L;
  };
  /** i due menu (ordina / in scadenza entro); p = prefisso degli id, unico per pannello */
  const ui = (S, p, o = {}) => `<select class="inp kx-sort" id="${p}Sort" title="Ordina" style="max-width:${o.w || 230}px;margin:0">${SORTS.filter(([k]) => !o.skip || !o.skip.includes(k)).map(([k, t]) => `<option value="${k}"${(S.sort || '') === k ? ' selected' : ''}>${t}</option>`).join('')}</select><select class="inp kx-days" id="${p}Days" title="In scadenza entro" style="max-width:190px;margin:0">${DAYS.map(([d, t]) => `<option value="${d}"${+S.days === d ? ' selected' : ''}>${t}</option>`).join('')}</select>`;
  const bind = (V, S, p, onChange) => { const a = $('#' + p + 'Sort', V), b = $('#' + p + 'Days', V); if (a) a.onchange = () => { S.sort = a.value; onChange(); }; if (b) b.onchange = () => { S.days = +b.value; onChange(); }; };
  /** titolo di colonna cliccabile: alterna A→Z / Z→A per quel campo */
  const th = (S, key, label, p) => `<span class="kx-th" data-ks="${key}" style="cursor:pointer;user-select:none">${label}${S.sort === key ? ' ▲' : S.sort === key + '-desc' ? ' ▼' : ''}</span>`;
  const bindTh = (V, S, onChange) => $$('.kx-th', V).forEach((e) => (e.onclick = () => { const k = e.dataset.ks; S.sort = S.sort === k ? (k === 'exp' || k === 'name' ? k + '-desc' : '') : k; onChange(); }));
  window.KXSort = { apply, ui, bind, th, bindTh, SORTS, DAYS };
})();
