-- Store: ogni richiesta sa a quale venditore appartiene (0 = titolare), così gli avvisi arrivano solo a lui;
-- ogni agente ha un codice venditore corto da dare ai clienti (o da mettere nel link dello store).
ALTER TABLE store_requests ADD COLUMN seller INTEGER NOT NULL DEFAULT 0;
ALTER TABLE admins ADD COLUMN store_code TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_admins_store_code ON admins (store_code);
CREATE INDEX IF NOT EXISTS idx_store_req_seller ON store_requests (seller, status);
