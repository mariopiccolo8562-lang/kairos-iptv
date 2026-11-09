const dnsCache = new Map();
const ispKeywords = ['vpn', 'proxy', 'nordvpn', 'surfshark', 'expressvpn', 'mullvad', 'proton', 'cyberghost', 'private internet access', 'windscribe', 'hide.me', 'ipvanish', 'purevpn', 'm247', 'datacamp', 'cdn77', 'ovh', 'hetzner', 'digitalocean', 'amazon', 'aws', 'google cloud', 'microsoft', 'azure', 'linode', 'akamai', 'vultr', 'choopa', 'leaseweb', 'contabo', 'hostinger', 'scaleway', 'ionos', 'oracle', 'alibaba', 'tencent', 'cloudflare'];

function ipValue(v) {
  const s = String(v || '').trim().replace(/^\[|\]$/g, '').toLowerCase();
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(s) && s.split('.').every((x) => +x <= 255)) return s;
  if (s.includes(':')) {
    try { return new URL(`http://[${s}]/`).hostname.replace(/^\[|\]$/g, '').toLowerCase(); } catch {}
  }
  return '';
}
function hostValue(v) {
  let s = String(v || '').trim();
  const bracket = s.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (bracket) return bracket[1];
  if (ipValue(s)) return s;
  if ((s.match(/:/g) || []).length === 1) s = s.replace(/:\d+$/, '');
  return /^[A-Za-z0-9.-]+$/.test(s) && !s.startsWith('.') && !s.endsWith('.') ? s.toLowerCase() : '';
}
async function resolveHost(host) {
  const ip = ipValue(host); if (ip) return [ip];
  const name = hostValue(host); if (!name) return [];
  const cached = dnsCache.get(name); if (cached && cached.until > Date.now()) return cached.promise;
  const promise = Promise.all(['A', 'AAAA'].map(async (type) => {
    try {
      const url = new URL('https://cloudflare-dns.com/dns-query'); url.searchParams.set('name', name); url.searchParams.set('type', type);
      const response = await fetch(url, { headers: { accept: 'application/dns-json' } }); if (!response.ok) return [];
      const data = await response.json();
      return (Array.isArray(data.Answer) ? data.Answer : []).filter((x) => +x.type === (type === 'A' ? 1 : 28)).map((x) => ipValue(x.data)).filter(Boolean);
    } catch { return []; }
  })).then((all) => [...new Set(all.flat())]).catch(() => []);
  dnsCache.set(name, { until: Date.now() + 3600e3, promise });
  return promise;
}
function wireguardHost(conf) {
  const endpoint = (String(conf || '').match(/^\s*Endpoint\s*=\s*(\S+)/im) || [])[1] || '';
  return hostValue(endpoint);
}

export async function vpnMark(env, rows, fields, H, services) {
  if (!Array.isArray(rows) || !rows.length) return rows || [];
  const pick = (row, key) => typeof fields?.[key] === 'function' ? fields[key](row) : '';
  const [locations, appHosts] = await Promise.all([
    services.wgLocs(env, H).catch(() => []),
    services.orcpRemoteHosts(env, H).catch(() => []),
  ]);
  const wgHosts = locations.map((x) => wireguardHost(x.conf)).filter(Boolean);
  const knownHosts = [...new Set([...wgHosts, ...appHosts.map(hostValue).filter(Boolean)])];
  const resolved = await Promise.all(knownHosts.map(async (host) => [host, await resolveHost(host)]));
  const ips = new Map(resolved);
  const wgIps = new Set(wgHosts.flatMap((host) => ips.get(host) || []));
  const appIps = new Set(appHosts.flatMap((host) => ips.get(hostValue(host)) || []));
  return rows.map((row) => {
    const address = ipValue(pick(row, 'ip'));
    const isp = String(pick(row, 'isp') || '').toLowerCase();
    const vpn = address && wgIps.has(address) ? 'kairos' : address && appIps.has(address) ? 'app' : ispKeywords.some((keyword) => isp.includes(keyword)) ? 'prob' : '';
    return { ...row, vpn };
  });
}
