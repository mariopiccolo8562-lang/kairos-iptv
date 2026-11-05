/* KAIROS Control — pannello più veloce: l'elenco dei Clienti (la parte più pesante, con migliaia di clienti)
   si ridisegna solo quando lo stai guardando; se cambia mentre sei altrove si aggiorna appena lo apri. */
(() => {
  const vis = () => { const v = document.getElementById('v-devices'); return !!v && v.classList.contains('on'); };
  let dirty = false;
  const rd = renderDevices;
  window.renderDevices = renderDevices = function () { if (!vis()) { dirty = true; return; } dirty = false; return rd.apply(this, arguments); };
  const v0 = view;
  window.view = view = function () { const r = v0.apply(this, arguments); if (dirty && vis()) renderDevices(); return r; };
})();
