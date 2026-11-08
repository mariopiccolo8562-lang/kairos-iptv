(() => {
  const cache = { t: 0, items: [], busy: null };
  const can = (k) => D.role !== 'agent' || !!(((D.me || {}).perms || {})[k]);
  const expiredAt = (v) => {
    if (v == null || v === '') return false;
    const n = Number(v), t = Number.isFinite(n) && n > 0 ? (n < 1e12 ? n * 1000 : n) : Date.parse(String(v));
    return Number.isFinite(t) && t > 0 && t < Date.now();
  };
  const statusOf = (l) => {
    const s = String(l.status || '').toLowerCase();
    if (l.expired || /scadut|expired/.test(s) || expiredAt(l.exp)) return 'scaduta';
    if (l.enabled === false || l.enabled === 0 || l.enabled === '0' || l.enabled === 'false' || /disattiv|sospes|disabled|bann/.test(s)) return 'disattivata';
    return '';
  };
  const add = (out, p, tag, l, host) => {
    const username = String(l.username || ''), password = String(l.password || '');
    if (!username.trim() || !password) return;
    out.push({ p, tag, username, password, host: String(host || ''), note: String(l.note || l.notes || ''), status: statusOf(l) });
  };
  function load() {
    if (cache.busy) return cache.busy;
    if (Date.now() - cache.t < 180e3) return Promise.resolve(cache.items);
    cache.busy = (async () => {
      const out = [], tasks = [];
      if (can('wolf')) tasks.push(api('GET', '/admin/wolf/lines').then((r) => (r.lines || []).forEach((l) => add(out, 'wolf', 'WOLF', l, l.dns || r.dns))).catch(() => {}));
      for (const [p, tag] of [['armada', 'ARMADA'], ['storm', 'STORM']]) if (can(p)) {
        tasks.push(Promise.all([api('GET', `/admin/${p}/lines`).catch(() => null), api('GET', `/admin/${p}/state`).catch(() => null)]).then(([r, s]) => {
          (r && Array.isArray(r.lines) ? r.lines : []).filter((l) => D.role !== 'agent' || l.self === true).forEach((l) => add(out, p, tag, l, s && s.dns));
        }).catch(() => {}));
      }
      for (const [p, tag] of [['ro', 'REALOTT'], ['slt', 'SLT']]) if (can(p)) tasks.push(api('GET', `/admin/${p}/lines`).then((r) => (r.rows || []).forEach((l) => add(out, p, tag, l, r.dns))).catch(() => {}));
      await Promise.all(tasks);
      cache.items = out; cache.t = Date.now();
      return out;
    })().finally(() => { cache.busy = null; });
    return cache.busy;
  }
  const find = (items, q) => {
    const tokens = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
    return (items || []).filter((x) => {
      const hay = [x.username, x.note, x.tag].join(' ').toLowerCase();
      return tokens.every((t) => hay.includes(t));
    }).slice(0, 8);
  };
  if (!document.getElementById('kx-line-pick-style')) {
    const style = document.createElement('style');
    style.id = 'kx-line-pick-style';
    style.textContent = '.wz-fp-wrap{position:relative;flex:1;min-width:220px;margin:0 0 8px}.wz-fp-list{position:absolute;top:calc(100% + 5px);left:0;right:0;max-height:320px;overflow:auto;z-index:70;background:#0e1320;border:1px solid var(--line);border-radius:12px;box-shadow:0 18px 50px #000a;padding:5px;display:none}.wz-fp-list.on{display:block}.wz-fp-item{width:100%;display:flex;flex-direction:column;align-items:stretch;gap:3px;padding:9px 10px;border:0;border-radius:8px;background:transparent;color:var(--txt);text-align:left;cursor:pointer}.wz-fp-item:hover{background:#202a3b}.wz-fp-head{display:flex;align-items:center;gap:8px;min-width:0}.wz-fp-head>b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.wz-fp-tag{font-style:normal;font-size:10px;font-weight:700;letter-spacing:.04em;color:#9dc6ff;background:#22324b;border-radius:5px;padding:2px 5px;flex:none}.wz-fp-note,.wz-fp-used{font-size:11px;color:var(--mut);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.wz-fp-status{font-size:11px;font-style:normal;color:#ff7d86}.wz-fp-empty{padding:11px 10px;color:var(--mut);font-size:12px}.line-pick-controls{display:flex;align-items:flex-start;gap:8px;flex-wrap:wrap}.line-pick-dest{display:flex;align-items:center;gap:6px}.line-pick-dest>span{font-size:12px;color:var(--mut);white-space:nowrap}.line-pick-target{width:auto;min-width:150px;max-width:220px;margin:0}';
    document.head.appendChild(style);
  }
  function mount(wrapEl, onPick) {
    if (!wrapEl) return Promise.resolve([]);
    const placeholder = wrapEl.dataset.placeholder || '🔎 Cerca una linea sui pannelli disponibili';
    const loading = wrapEl.dataset.loading || 'Carico le tue linee…';
    wrapEl.innerHTML = '<div class="wz-fp-wrap"><input class="inp" data-kx-line-find autocomplete="off" aria-label="Cerca una linea"><div class="wz-fp-list"></div></div>';
    const input = wrapEl.querySelector('[data-kx-line-find]'), list = wrapEl.querySelector('.wz-fp-list');
    input.placeholder = placeholder;
    let items = [], loaded = false;
    const draw = (show) => {
      if (!show) { list.classList.remove('on'); return; }
      list.classList.add('on');
      if (!loaded) { list.innerHTML = `<div class="wz-fp-empty">${loading}</div>`; return; }
      if (!items.length) { list.innerHTML = '<div class="wz-fp-empty">Nessuna linea trovata sui pannelli disponibili</div>'; return; }
      const rows = find(items, input.value);
      if (!rows.length) { list.innerHTML = '<div class="wz-fp-empty">Nessuna linea corrisponde alla ricerca</div>'; return; }
      list.innerHTML = rows.map((line, i) => {
        const used = (D.devices || []).find((d) => (d.playlists || []).some((p) => String(p.username || '').toLowerCase() === String(line.username).toLowerCase()));
        return `<button type="button" class="wz-fp-item" data-line-pick="${i}"><span class="wz-fp-head"><i class="wz-fp-tag">${esc(line.tag)}</i><b>${esc(line.username)}</b>${line.status ? `<em class="wz-fp-status">${esc(line.status)}</em>` : ''}</span>${line.note ? `<span class="wz-fp-note">${esc(line.note)}</span>` : ''}${used ? `<span class="wz-fp-used">già su ${esc(used.name || used.code || 'cliente')}</span>` : ''}</button>`;
      }).join('');
      list.querySelectorAll('[data-line-pick]').forEach((button) => {
        button.onclick = async () => {
          const line = rows[+button.dataset.linePick];
          list.classList.remove('on');
          if (line && onPick) {
            try { await onPick(line); } catch (e) { toast(e.message || 'Linea non inserita', 1); }
          }
        };
      });
    };
    input.onfocus = () => draw(true);
    input.oninput = () => draw(true);
    input.onblur = () => setTimeout(() => draw(false), 160);
    return load().then((lines) => {
      items = lines || []; loaded = true;
      if (list.classList.contains('on')) draw(true);
      return items;
    }).catch(() => {
      items = []; loaded = true;
      if (list.classList.contains('on')) draw(true);
      return items;
    });
  }
  window.KXLinePick = { load, find, mount };
})();
