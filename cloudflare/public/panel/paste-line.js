/* KAIROS Control 2.13 — «Incolla linea»: incolli il link M3U o i dati che ti dà il pannello IPTV del fornitore
   (server, utente, password) e Kairos riconosce tutto e lo mette nella playlist del cliente. Da lì scegli l'app,
   carichi la lista su Kairos Pro/Lite/OrbixPlay/MaxPlayer e mandi il messaggio al cliente — tutto da un pannello.
   La linea la crei TU sul pannello del fornitore: Kairos non ci entra mai. */
(() => {
  const css = document.createElement('style');
  css.textContent = `
#pasteLine{margin:0 0 14px;padding:14px;border-radius:12px;border:1px dashed rgba(61,124,245,.5);background:rgba(61,124,245,.06)}
#pasteLine .pl-h{display:flex;align-items:center;gap:8px;font-size:13.5px;font-weight:600;margin-bottom:4px}
#pasteLine small{display:block;color:var(--mut);font-size:12px;margin-bottom:10px}
#pasteLine textarea{width:100%;min-height:56px;font-family:'JetBrains Mono',monospace;font-size:12.5px;resize:vertical}
#pasteLine .pl-a{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;align-items:center}
#pasteLine .pl-ok{font-size:12.5px;color:var(--ok)}`;
  document.head.appendChild(css);

  const origin = (x) => x.protocol + '//' + x.hostname + (x.port ? ':' + x.port : '');
  function urlParse(u) {
    try {
      const x = new URL(u);
      const us = x.searchParams.get('username'), pw = x.searchParams.get('password');
      if (us && pw) return { type: 'xtream', host: origin(x), username: us, password: pw };
      // forma stream Xtream: /live/utente/password/… oppure /utente/password/123.ts
      if (!/get\.php|player_api|xmltv/i.test(x.pathname)) {
        const segs = x.pathname.split('/').filter(Boolean);
        const i = ['live', 'movie', 'series'].includes((segs[0] || '').toLowerCase()) ? 1 : 0;
        if (segs.length - i >= 3) return { type: 'xtream', host: origin(x), username: decodeURIComponent(segs[i]), password: decodeURIComponent(segs[i + 1]) };
      }
      return { type: 'm3u', url: u };
    } catch { return null; }
  }
  /** riconosce una linea IPTV da un link M3U/Xtream o da un testo con server, utente e password */
  function parse(raw) {
    const t = String(raw || '').trim();
    if (!t) return null;
    const m = t.match(/https?:\/\/[^\s'"<>]+/i);
    const url = m ? m[0].replace(/[)\]>.,;'"]+$/, '') : '';
    if (url && /^https?:\/\/\S+$/i.test(t)) return urlParse(url); // una sola URL incollata
    const pick = (re) => { const r = t.match(re); return r ? r[r.length - 1].trim().replace(/[,;]+$/, '') : ''; };
    let host = pick(/(?:real[\s_-]*url|server|host|dns|portale?|url|linea)\s*[:=]\s*(\S+)/i);
    const user = pick(/(?:user\s*name|username|utente|user)\s*[:=]\s*(\S+)/i);
    const pass = pick(/(?:pass\s*word|password|psw|pass)\s*[:=]\s*(\S+)/i);
    if (host) { try { host = origin(new URL(/^https?:\/\//i.test(host) ? host : 'http://' + host)); } catch {} }
    if (host && user && pass) return { type: 'xtream', host, username: user, password: pass };
    if (url) return urlParse(url); // ripiego sul link trovato nel testo
    return null;
  }
  window.KXPaste = { parse };

  const hostName = (h) => { try { return new URL(/^https?:\/\//i.test(h) ? h : 'http://' + h).hostname; } catch { return (h || '').replace(/^https?:\/\//, '').split(/[:/]/)[0]; } };
  const isEmpty = (p) => !p || (!p.host && !p.url && !p.username);

  const rdw = renderDrawer;
  window.renderDrawer = renderDrawer = function () {
    rdw();
    if (typeof edit === 'undefined' || !edit || edit.parent) return; // i collegati usano la linea del principale
    const sec = $('#ds-pl'), pls = $('#pls'); if (!sec || !pls || $('#pasteLine')) return;
    pls.insertAdjacentHTML('beforebegin', `<div id="pasteLine"><div class="pl-h">📋 Incolla la linea del fornitore<span class="mut" style="font-weight:400">— si riconosce da sola appena incolli</span></div>
      <small>Incolla il link M3U o il messaggio con server, utente e password. Kairos li mette qui sotto; la linea la crei tu sul pannello del fornitore.</small>
      <textarea id="plIn" placeholder="Incolla qui… es. http://server.tv/get.php?username=UTENTE&password=PASSWORD&type=m3u_plus"></textarea>
      <div class="pl-a"><button class="btn" id="plGo">Aggiungi</button><span id="plMsg" class="pl-ok"></span></div></div>`);
    const recognize = (quiet) => {
      const r = parse($('#plIn').value);
      if (!r) { if (!quiet) toast('Non ho riconosciuto la linea: incolla il link M3U o server, utente e password', 1); return; }
      window.__dsync && window.__dsync();
      const name = r.type === 'xtream' ? (hostName(r.host) || 'Linea') : 'Playlist';
      const slot = { id: 'p' + Date.now(), name, type: r.type, url: r.url || '', host: r.host || '', username: r.username || '', password: r.password || '', tag: '' };
      const i = edit.playlists.findIndex(isEmpty);
      if (i >= 0) { slot.id = edit.playlists[i].id || slot.id; slot.name = edit.playlists[i].name || name; edit.playlists[i] = slot; } else edit.playlists.push(slot);
      renderDrawer();
      const s = $('#plMsg'); if (s) s.textContent = r.type === 'xtream' ? `✓ Linea riconosciuta · ${hostName(r.host)} · utente ${r.username}` : '✓ Playlist M3U riconosciuta';
      toast('Linea aggiunta alla playlist del cliente');
    };
    $('#plGo').onclick = () => recognize(false);
    $('#plIn').addEventListener('paste', () => setTimeout(() => recognize(true), 0)); // riconosce da sola appena incolli
  };
})();
