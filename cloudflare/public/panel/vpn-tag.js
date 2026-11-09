/* Etichette privacy-safe per le connessioni VPN classificate dal Worker. */
(() => {
  const escapeHtml = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const tag = (value) => value === 'kairos'
    ? '<span class="kx-vpn-tag" style="display:inline-block;max-width:100%;box-sizing:border-box;padding:2px 7px;border:1px solid #22c55e55;border-radius:999px;background:#14532d55;color:#86efac;font-size:11px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">🛡 VPN KAIROS</span>'
    : value === 'app'
      ? '<span class="kx-vpn-tag" style="display:inline-block;max-width:100%;box-sizing:border-box;padding:2px 7px;border:1px solid #22c55e55;border-radius:999px;background:#14532d55;color:#86efac;font-size:11px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">🛡 VPN MirkoTeam</span>'
      : value === 'prob'
        ? '<span class="kx-vpn-tag" title="Il provider è un servizio VPN o di hosting: probabilmente usa una VPN" style="display:inline-block;max-width:100%;box-sizing:border-box;padding:2px 7px;border:1px solid #f59e0b66;border-radius:999px;background:#78350f55;color:#fcd34d;font-size:11px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">🛡 VPN?</span>'
        : '';
  const ip = (address, value) => `<span class="kx-vpn-ip-cell" style="display:flex;gap:5px;align-items:center;flex-wrap:wrap;min-width:0;max-width:100%;overflow:hidden"><span class="kx-vpn-address" style="min-width:0;overflow-wrap:anywhere">${escapeHtml(address || '—')}</span>${tag(value)}</span>`;
  const counter = (rows) => {
    const list = Array.isArray(rows) ? rows : [], count = list.filter((row) => row && row.vpn).length;
    if (!count) return '';
    const colors = list.some((row) => row && row.vpn === 'prob')
      ? 'border:1px solid #f59e0b66;background:#78350f55;color:#fcd34d'
      : 'border:1px solid #22c55e55;background:#14532d55;color:#86efac';
    return `<small class="kx-vpn-counter" style="display:inline-flex;align-items:center;max-width:100%;box-sizing:border-box;padding:3px 8px;border-radius:999px;font-size:11px;font-weight:700;white-space:nowrap;${colors}">🛡 ${count} con VPN</small>`;
  };
  window.KXVpn = { tag, ip, counter };
})();
