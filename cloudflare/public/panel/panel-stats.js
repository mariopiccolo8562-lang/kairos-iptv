/* KAIROS Control — riquadri statistiche in testa ai pannelli IPTV (come la dashboard di WOLF):
   online ora, create oggi, create questo mese, abbonamenti attivi, connessioni aperte, linee totali, scadute, in scadenza.
   Calcolati da KAIROS sulla lista linee che il pannello restituisce (così valgono anche per l'agente: solo le sue). */
(function () {
  'use strict';
  const DAY = 864e5;
  /* data in ms da: numero (s o ms), «07-11-2026 17:44» (WOLF), «2026-11-07 …» / ISO */
  function ts(v) {
    if (v == null || v === '') return 0;
    if (typeof v === 'number' || /^\d+$/.test(String(v))) { const n = +v; return n > 0 ? (n < 1e12 ? n * 1000 : n) : 0; }
    const s = String(v).trim(), m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})(?:[ T](\d{1,2}):(\d{2}))?/);
    if (m) return new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0)).getTime() || 0;
    const d = Date.parse(s); return Number.isFinite(d) ? d : 0;
  }
  /* L: linee; f: come leggere i campi (default: campi WOLF/Armada/Realott). Ritorna i conteggi. */
  function calc(L, f) {
    f = Object.assign({ exp: (l) => l.exp, created: (l) => l.created, enabled: (l) => l.enabled !== false, conns: (l) => +l.conns || 0, trial: (l) => !!l.trial }, f || {});
    const now = Date.now(), d0 = new Date(); d0.setHours(0, 0, 0, 0); const day = d0.getTime(), month = new Date(d0.getFullYear(), d0.getMonth(), 1).getTime();
    const o = { total: 0, online: 0, conns: 0, today: 0, month: 0, active: 0, expired: 0, soon: 0, soon4: 0, trial: 0, off: 0, hasConns: false, hasCreated: false };
    const cal = window.KXSort && KXSort.calDays, lim = (window.KXSort && KXSort.SOON) || 4; // come il giallo dei nomi: giorni di calendario
    for (const l of L || []) {
      o.total++;
      const exp = ts(f.exp(l)), cr = ts(f.created(l)), en = !!f.enabled(l), c = f.conns(l);
      if (l.conns != null || c) o.hasConns = true; if (cr) o.hasCreated = true;
      if (c > 0) { o.online++; o.conns += c; }
      if (cr >= day) o.today++; if (cr >= month) o.month++;
      if (!en) o.off++; else if (exp && exp < now) o.expired++; else { o.active++; if (exp && exp - now < 7 * DAY) o.soon++; if (exp && (cal ? cal(exp) <= lim : exp - now <= lim * DAY)) o.soon4++; }
      if (f.trial(l)) o.trial++;
    }
    return o;
  }
  const C = { blue: '#2f7fd6', teal: '#1fa0b6', orange: '#e08a1e', red: '#e0524f', dark: '#0d1117', green: '#2a9d5c' };
  /* tiles: [{k, label, v, c, hint}] → riquadri colorati; data-ks="k" per agganciare il filtro del pannello */
  function strip(tiles, opt) {
    const T = (tiles || []).filter((t) => t && t.v != null && t.v !== '');
    if (!T.length) return '';
    return `<div class="ks-strip" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:${(opt && opt.margin) || '12px 0 0'}">${T.map((t) => `<div class="ks-tile${t.k ? ' ks-act' : ''}" ${t.k ? `data-ks="${t.k}" role="button" tabindex="0"` : ''} style="background:${C[t.c] || t.c || C.dark};color:#fff;border-radius:10px;padding:12px 14px;min-height:62px;display:flex;flex-direction:column;justify-content:center;box-shadow:0 2px 10px rgba(0,0,0,.25);${t.k ? 'cursor:pointer' : ''}" title="${t.hint ? String(t.hint).replace(/"/g, '&quot;') : ''}"><div style="font-size:24px;font-weight:800;line-height:1.1">${t.v}</div><div style="font-size:12px;opacity:.9;margin-top:3px">${t.label}</div></div>`).join('')}</div>`;
  }
  /* riquadri standard da calc(); omette online/connessioni e create se il pannello non dà quei dati */
  function tiles(o, opt) {
    opt = opt || {}; const n = (k) => opt.noun ? opt.noun[k] : null;
    const T = [];
    if (o.hasConns) T.push({ k: 'online', label: n('online') || 'Online ora', v: o.online, c: 'blue', hint: 'Linee con almeno una connessione aperta adesso' });
    if (o.hasCreated) T.push({ k: 'today', label: 'Create oggi', v: o.today, c: 'teal' }, { k: 'month', label: 'Create questo mese', v: o.month, c: 'orange' });
    T.push({ k: 'active', label: n('active') || 'Abbonamenti attivi', v: o.active, c: 'red', hint: 'Attive e non scadute' });
    if (o.hasConns && o.conns !== o.online) T.push({ k: 'conns', label: 'Connessioni aperte', v: o.conns, c: 'blue', hint: 'Somma delle connessioni aperte adesso (più di una per linea)' });
    T.push({ k: 'total', label: n('total') || 'Linee totali', v: o.total, c: 'dark' }, { k: 'soon4', label: 'Scadono entro 4 giorni', v: o.soon4, c: 'dark', hint: 'Mancano 4 giorni o meno (nomi in giallo)' }, { k: 'soon', label: 'Scadono entro 7 giorni', v: o.soon, c: 'dark' }, { k: 'expired', label: 'Scadute', v: o.expired, c: 'dark' });
    if (o.off) T.push({ k: 'off', label: 'Disattivate', v: o.off, c: 'dark' });
    if (o.trial) T.push({ k: 'trial', label: 'Prove', v: o.trial, c: 'dark' });
    return T;
  }
  /* click su un riquadro → fn(k) (es. imposta il filtro della lista) */
  function bind(root, fn) {
    (root || document).querySelectorAll('.ks-tile[data-ks]').forEach((el) => { el.onclick = () => fn(el.dataset.ks); el.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(el.dataset.ks); } }; });
  }
  window.KXStats = { ts, calc, strip, tiles, bind, C };
})();
