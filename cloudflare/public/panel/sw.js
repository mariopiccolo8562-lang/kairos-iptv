/* KAIROS Control — service worker: solo per le notifiche delle richieste di download dello store.
   La notifica arriva senza contenuto: il testo si legge dal pannello con la sessione di questo dispositivo,
   così su un telefono scollegato non compare nessun dato. Nessuna cache: il pannello resta sempre aggiornato. */
const ICON = '/panel/icon-192.png';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

const get = (p) => fetch(p, { credentials: 'include', cache: 'no-store' });

async function showPush() {
  try {
    const t = await get('/api/admin/notify/peek');
    if (t.ok && (await t.json()).test) return self.registration.showNotification('🔔 Prova riuscita', { body: 'Le notifiche del pannello funzionano su questo dispositivo.', tag: 'kairos-test', icon: ICON, badge: ICON });
    const r = await get('/api/admin/store');
    if (r.ok) {
      const d = await r.json();
      const p = (d.requests || []).filter((x) => x.status === 'pending').sort((a, b) => b.created - a.created);
      if (p.length) {
        const x = p[0];
        const body = [x.app, x.device, x.note, x.code ? 'codice ' + x.code : ''].filter(Boolean).join(' · ') + (p.length > 1 ? ` (+${p.length - 1} in attesa)` : '');
        return self.registration.showNotification('📥 Richiesta di download', {
          body, tag: 'kairos-req-' + x.id, renotify: true, requireInteraction: true, icon: ICON, badge: ICON, data: { id: x.id },
          actions: [{ action: 'approve', title: '✅ Autorizza' }, { action: 'deny', title: '❌ Rifiuta' }],
        });
      }
      // già gestita da qualcun altro: avviso discreto che si chiude subito
      await self.registration.showNotification('Richiesta già gestita', { tag: 'kairos-done', silent: true, icon: ICON });
      const n = await self.registration.getNotifications({ tag: 'kairos-done' }); n.forEach((x) => x.close());
      return;
    }
  } catch (e) {}
  return self.registration.showNotification('📥 Nuova richiesta di download', { body: 'Apri il pannello per vederla', tag: 'kairos-req', icon: ICON, badge: ICON, data: {} });
}
self.addEventListener('push', (e) => e.waitUntil(showPush()));

async function openPanel() {
  const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const c of list) if (c.url.includes('/panel/')) { await c.focus(); try { c.postMessage({ kairos: 'store' }); } catch (e) {} return; }
  return self.clients.openWindow('/panel/#store');
}
self.addEventListener('notificationclick', (e) => {
  const n = e.notification, id = n.data && n.data.id;
  n.close();
  if (id && (e.action === 'approve' || e.action === 'deny')) {
    e.waitUntil(fetch('/api/admin/store/' + encodeURIComponent(id) + '/' + e.action, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-Kairos': '1' }, body: '{}',
    }).then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (r.status === 401) return self.registration.showNotification('⚠️ Accedi al pannello', { body: 'La sessione è scaduta: apri il pannello per decidere', icon: ICON, tag: 'kairos-res', data: {} });
      return self.registration.showNotification(r.ok ? (e.action === 'approve' ? '✅ Download autorizzato' : '❌ Download rifiutato') : '⚠️ ' + (j.error || 'Azione non riuscita'), { body: r.ok && e.action === 'approve' ? 'Sul dispositivo il download parte da solo' : '', icon: ICON, tag: 'kairos-res', silent: true, data: {} });
    }).catch(() => self.registration.showNotification('⚠️ Nessuna connessione', { body: 'Apri il pannello per decidere', icon: ICON, tag: 'kairos-res', data: {} })));
    return;
  }
  e.waitUntil(openPanel());
});
