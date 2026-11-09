(() => {
  const cache = { t: 0, items: [], busy: null };
  const dnsCache = { t: 0, rows: [] };
  const can = (k) => D.role !== 'agent' || !!(((D.me || {}).perms || {})[k]);
  const expiryTime = (v) => {
    if (v == null || v === '') return false;
    const n = Number(v), t = Number.isFinite(n) && n > 0 ? (n < 1e12 ? n * 1000 : n) : Date.parse(String(v));
    return Number.isFinite(t) && t > 0 ? t : 0;
  };
  const expiryDate = (v) => { const t = expiryTime(v), d = t ? new Date(t) : null; return d && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : ''; };
  const expiredAt = (v) => { const t = expiryTime(v); return !!t && t < Date.now(); };
  const lastSync = new Map();
  const syncExpiries = async (panel, rows, force, send) => {
    const t = Date.now();
    if (!force && t - (lastSync.get(panel) || 0) < 60000) return;
    if (!Array.isArray(rows) || !send || !can('renew')) return; // agente senza «Rinnovare»: il server la rifiuterebbe
    lastSync.set(panel, t);
    const lines = rows.slice(0, 5000).map((l) => ({ username: String(l.username || '').trim(), exp: expiryDate(l.exp || l.exp_date || l.expire_date || l.expTxt) })).filter((l) => l.username && l.exp);
    if (!lines.length) return;
    try { await send('POST', '/admin/line-sync/apply', { panel, lines }); } catch {}
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
    const status = statusOf(l), state = String(l.status || '').toLowerCase();
    const enabled = !(l.enabled === false || l.enabled === 0 || l.enabled === '0' || l.enabled === 'false' || /disattiv|sospes|disabled|bann/.test(state));
    const conns = l.conns == null && l.connections == null ? undefined : Number(l.conns ?? l.connections) || 0;
    out.push({ p, tag, username, password, host: String(host || ''), exp: expiryDate(l.exp || l.exp_date || l.expire_date || l.expTxt), note: String(l.note || l.notes || ''), status, enabled, expired: status === 'scaduta', conns });
  };
  function load(force = false) {
    if (cache.busy) return cache.busy;
    if (!force && Date.now() - cache.t < 180e3) return Promise.resolve(cache.items);
    cache.busy = (async () => {
      const out = [], tasks = [];
      if (can('wolf')) tasks.push(api('GET', '/admin/wolf/lines').then((r) => (r.lines || []).forEach((l) => add(out, 'wolf', 'WOLF', l, l.dns || r.dns))).catch(() => {}));
      for (const [p, tag] of [['armada', 'ARMADA'], ['storm', 'STORM']]) if (can(p)) {
        tasks.push(Promise.all([api('GET', `/admin/${p}/lines`).catch(() => null), api('GET', `/admin/${p}/state`).catch(() => null)]).then(([r, s]) => {
          (r && Array.isArray(r.lines) ? r.lines : []).filter((l) => D.role !== 'agent' || l.self === true).forEach((l) => add(out, p, tag, l, l.dns || l.host || (r && r.dns) || (s && s.dns)));
        }).catch(() => {}));
      }
      for (const [p, tag] of [['ro', 'REALOTT'], ['slt', 'SLT']]) if (can(p)) tasks.push(api('GET', `/admin/${p}/lines`).then((r) => (r.rows || []).forEach((l) => add(out, p, tag, l, r.dns))).catch(() => {}));
      if (D.role !== 'agent') tasks.push(api('GET', '/admin/atx/state').then((s) => s && s.connected ? api('GET', '/admin/atx/lines?all=1') : null).then((r) => {
        const rows = r && (r.rows || r.lines || r.items || []);
        (Array.isArray(rows) ? rows : []).forEach((l) => add(out, 'atx', 'ATLANTIX', l, l.dns || (r && r.dns)));
      }).catch(() => {}));
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
  async function mountDns(wrapEl, panel, tag, onPick) {
    if (!wrapEl) return;
    wrapEl.innerHTML = `<div class="kx-line-dns"><label>DNS di ${esc(tag || panel)} non ancora impostato: sceglilo<select class="inp" data-kx-line-dns><option value="">Carico i DNS salvati…</option></select></label></div>`;
    const select = wrapEl.querySelector('[data-kx-line-dns]');
    try {
      if (Date.now() - dnsCache.t >= 60000) {
        const data = await api('GET', '/admin/dns');
        dnsCache.rows = (data.saved || []).filter((x) => x && x.host);
        dnsCache.t = Date.now();
      }
      const rows = dnsCache.rows;
      select.innerHTML = `<option value="">${rows.length ? 'Scegli un DNS…' : 'Nessun DNS salvato'}</option>${rows.map((x) => `<option value="${esc(x.host)}">${esc(x.name || x.host)}${x.name ? ' — ' + esc(x.host) : ''}</option>`).join('')}`;
      select.disabled = !rows.length;
    } catch {
      select.innerHTML = '<option value="">Elenco DNS non disponibile</option>';
      select.disabled = true;
    }
    select.onchange = async () => {
      const host = select.value;
      if (!host) return;
      let saveError = '';
      const setting = panel === 'armada' ? 'armadaDns' : panel === 'storm' ? 'stormDns' : '';
      if (setting) {
        try { await api('PUT', '/admin/settings', { [setting]: host }); }
        catch (e) { saveError = e.message || 'impostazione non salvata'; }
      }
      try { if (onPick) await onPick(host); } catch (e) { toast(e.message || 'DNS non applicato', 1); }
      if (saveError) toast(`DNS inserito ma non salvato nelle impostazioni: ${saveError}`, 1);
    };
  }
  const linePickStyle = document.getElementById('kx-line-pick-style');
  if (linePickStyle) linePickStyle.textContent += '.kx-line-dns{margin:8px 0;padding:10px 12px;border:1px solid #705c32;border-radius:10px;background:#211d15}.kx-line-dns label{display:block;color:#f0c36a;font-size:12px;font-weight:600}.kx-line-dns .inp{margin-top:6px}';
  window.KXLinePick = { load, find, mount, mountDns, expiryDate };
  window.KXLineSync = { apply: syncExpiries };
})();
