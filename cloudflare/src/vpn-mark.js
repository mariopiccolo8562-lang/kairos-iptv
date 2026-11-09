const KNOWN_IP_TTL = 600e3;
const MARK_BUDGET = 2500;
let knownIpCache = null;
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
  const promise = Promise.all(['A', 'AAAA'].map(async (type) => {
    try {
      const url = new URL('https://cloudflare-dns.com/dns-query'); url.searchParams.set('name', name); url.searchParams.set('type', type);
      const response = await fetch(url, { headers: { accept: 'application/dns-json' }, signal: AbortSignal.timeout(2000) }); if (!response.ok) return [];
      const data = await response.json();
      return (Array.isArray(data.Answer) ? data.Answer : []).filter((x) => +x.type === (type === 'A' ? 1 : 28)).map((x) => ipValue(x.data)).filter(Boolean);
    } catch { return []; }
  })).then((all) => [...new Set(all.flat())]).catch(() => []);
  return promise;
}
function wireguardHost(conf) {
  const endpoint = (String(conf || '').match(/^\s*Endpoint\s*=\s*(\S+)/im) || [])[1] || '';
  return hostValue(endpoint);
}

function withEmptyVpn(rows) {
  return Array.isArray(rows) ? rows.map((row) => row && typeof row === 'object' ? { ...row, vpn: '' } : row) : rows || [];
}

function knownIps(env, H, services) {
  if (knownIpCache && knownIpCache.until > Date.now()) return knownIpCache.promise || Promise.resolve(knownIpCache.value);
  const entry = { until: Date.now() + KNOWN_IP_TTL, value: null, promise: null };
  entry.promise = Promise.resolve().then(async () => {
    const [locations, appHosts] = await Promise.all([services.wgLocs(env, H), services.orcpRemoteHosts(env, H)]);
    const wgHosts = (Array.isArray(locations) ? locations : []).map((x) => wireguardHost(x && x.conf)).filter(Boolean);
    const ovpnHosts = appHosts.map(hostValue).filter(Boolean);
    const hosts = [...new Set([...wgHosts, ...ovpnHosts])];
    const resolved = await Promise.all(hosts.map(async (host) => [host, await resolveHost(host)]));
    const ips = new Map(resolved);
    const result = {
      wg: new Set(wgHosts.flatMap((host) => ips.get(host) || [])),
      app: new Set(ovpnHosts.flatMap((host) => ips.get(host) || [])),
    };
    if (knownIpCache === entry) {
      entry.value = result;
      entry.promise = null;
      entry.until = Date.now() + KNOWN_IP_TTL;
    }
    return result;
  }).catch((error) => {
    if (knownIpCache === entry) knownIpCache = null;
    throw error;
  });
  knownIpCache = entry;
  return entry.promise;
}

async function classify(env, rows, fields, H, services) {
  const pick = (row, key) => typeof fields?.[key] === 'function' ? fields[key](row) : '';
  const known = await knownIps(env, H, services);
  return rows.map((row) => {
    const address = ipValue(pick(row, 'ip'));
    const isp = String(pick(row, 'isp') || '').toLowerCase();
    const vpn = address && known.wg.has(address) ? 'kairos' : address && known.app.has(address) ? 'app' : ispKeywords.some((keyword) => isp.includes(keyword)) ? 'prob' : '';
    return { ...row, vpn };
  });
}

export async function vpnMark(env, rows, fields, H, services) {
  if (!Array.isArray(rows) || !rows.length) return rows || [];
  let timer;
  try {
    return await Promise.race([
      classify(env, rows, fields, H, services),
      new Promise((resolve) => {
        timer = setTimeout(() => {
          if (knownIpCache && knownIpCache.promise) knownIpCache = null;
          resolve(withEmptyVpn(rows));
        }, MARK_BUDGET);
      }),
    ]);
  } catch {
    return withEmptyVpn(rows);
  } finally {
    clearTimeout(timer);
  }
}
