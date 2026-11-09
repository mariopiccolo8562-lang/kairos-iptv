(() => {
  const palette = ['#2563eb', '#06b6d4', '#ec4899', '#22c55e', '#8b5cf6', '#f97316', '#14b8a6', '#eab308', '#6366f1', '#ef4444'];
  const targetColor = (key) => ({ kairos: '#2563eb', max: '#8b5cf6', orbix: '#f97316', orcp: '#0d9488' })[key] || (() => {
    let hash = 0;
    for (const char of String(key)) hash = (hash * 31 + char.charCodeAt(0)) | 0;
    return palette[Math.abs(hash) % palette.length];
  })();
  const targetIcon = (key, label) => ({ kairos: 'K', max: 'M', orbix: 'O', orcp: 'MT' })[key] || String(label || '').trim().split(/\s+/).slice(0, 2).map((x) => x[0] || '').join('').toUpperCase();
  const dynamicApps = (apps, agent, perms = {}) => (apps || []).filter((x) => x.enabled && (!agent || (perms.actApps || []).includes(x.key)));
  async function loadOrcpConfig(agent) {
    if (agent) {
      const cfg = await api('GET', '/admin/agent/orcp');
      return { ...cfg, servers: (cfg.servers || []).map((x) => ({ n: x.n, name: x.name })) };
    }
    const r = await (window.KXOrcpCfg ? window.KXOrcpCfg() : api('GET', '/admin/orcp/cfg'));
    const cfg = r && (r.cfg || r);
    if (!cfg) return null;
    const list = (cfg.portalNames || []).map((x, i) => ({ n: +(String(x.k || '').replace('portal', '') || 1), name: x.name || `SERVER-${i + 1}` })).filter((x) => x.name);
    return { ...cfg, servers: list.length ? list : (r.servers || []).map((name, i) => ({ n: i + 1, name })) };
  }
  async function submitOrcp({ cfg, serverNumber, username, password, registerLinked = true }) {
    const server = (cfg && cfg.servers || []).find((x) => String(x.n) === String(serverNumber));
    if (!server) throw new Error('Scegli un server MirkoTeam assegnato');
    if (registerLinked) await api('POST', '/admin/linked-lines', { app: cfg.name || 'MirkoTeam', username, password, dns: '', mac: '', note: `Server ${server.n}` });
    const download = cfg.apk ? `Downloader ${cfg.dl || '8128314'} (oppure ${cfg.apk})` : `Downloader ${cfg.dl || '8128314'}`;
    const message = `Scarica l'app ${cfg.name || 'MirkoTeam'}: ${download}. Apri l'app, scegli il server «${server.name}» ed entra con utente ${username} e password ${password}.`;
    return { message, copyText: message };
  }
  async function submitApp({ app, agent, username, password, mac, deviceKey = '', serverId = '', dns = '' }) {
    const note = deviceKey ? `key: ${deviceKey}` : '';
    let playlist = '';
    if (agent) {
      const response = await api('POST', '/admin/agent/act-request', { appKey: app.key, username, password, mac, deviceKey, serverId });
      if (response.pending) return { message: `Richiesta inviata: il tuo fornitore attiverà ${app.name} sul dispositivo ${mac}.` };
      dns = response.dns || '';
      playlist = response.m3u || '';
    } else {
      await api('POST', '/admin/linked-lines', { app: app.name, username, password, dns, mac, note });
    }
    if (!playlist && dns) playlist = `${String(dns).replace(/\/$/, '')}/get.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&type=m3u_plus&output=ts`;
    const copyItems = [{ label: 'MAC', value: mac }, ...(playlist ? [{ label: 'M3U', value: playlist }] : []), ...(dns ? [{ label: 'DNS', value: dns }] : []), { label: 'utente', value: username }, { label: 'password', value: password }];
    return { message: `${app.name} registrata per ${mac}.`, activationUrl: app.link || '', copyItems };
  }
  window.KXActApps = { targetColor, targetIcon, dynamicApps, loadOrcpConfig, submitOrcp, submitApp };
})();
