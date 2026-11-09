/* Etichette privacy-safe per le connessioni VPN classificate dal Worker. */
(() => {
  const tag = (value) => value === 'kairos'
    ? '<span class="kx-vpn-tag" style="display:inline-block;margin-left:5px;padding:2px 7px;border:1px solid #22c55e55;border-radius:999px;background:#14532d55;color:#86efac;font-size:11px;font-weight:700;white-space:nowrap">🛡 VPN KAIROS</span>'
    : value === 'app'
      ? '<span class="kx-vpn-tag" style="display:inline-block;margin-left:5px;padding:2px 7px;border:1px solid #22c55e55;border-radius:999px;background:#14532d55;color:#86efac;font-size:11px;font-weight:700;white-space:nowrap">🛡 VPN MirkoTeam</span>'
      : value === 'prob'
        ? '<span class="kx-vpn-tag" title="Il provider è un servizio VPN o di hosting: probabilmente usa una VPN" style="display:inline-block;margin-left:5px;padding:2px 7px;border:1px solid #f59e0b66;border-radius:999px;background:#78350f55;color:#fcd34d;font-size:11px;font-weight:700;white-space:nowrap">🛡 VPN?</span>'
        : '';
  const counter = (rows) => {
    const count = (Array.isArray(rows) ? rows : []).filter((row) => row && row.vpn).length;
    return count ? `<small class="mut" style="display:block;margin:4px 0 8px;font-size:12px">🛡 ${count} con VPN</small>` : '';
  };
  window.KXVpn = { tag, counter };
})();
