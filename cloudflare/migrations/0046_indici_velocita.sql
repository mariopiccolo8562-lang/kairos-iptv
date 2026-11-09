-- Pannello più veloce: indici per le letture più frequenti (non cambia nessun dato, solo il modo di cercarli)

-- Battito delle app (la richiesta più frequente): «messaggi non letti» = messaggi per tutti, per il dispositivo
-- o per il suo principale arrivati dopo l'ultima apertura. Con il solo indice su target ogni battito leggeva tutti i
-- messaggi «per tutti» mai inviati; con (target, created) legge solo quelli nuovi (di solito nessuno).
CREATE INDEX IF NOT EXISTS idx_messages_target_created ON messages(target, created);

-- Controllo remoto: clienti con impostazioni imposte dal pannello (pochi): prima si leggevano tutti i dispositivi
CREATE INDEX IF NOT EXISTS idx_devices_rc ON devices(id) WHERE rc <> '';
