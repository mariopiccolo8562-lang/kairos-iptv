-- KAIROS — autorizzazione dei download dello Store (richieste dei clienti, decise dal venditore)
CREATE TABLE IF NOT EXISTS store_requests (
  id TEXT PRIMARY KEY,                    -- casuale, lo conosce solo il dispositivo che ha chiesto
  app TEXT NOT NULL,                      -- nome dell'app richiesta
  app_url TEXT NOT NULL DEFAULT '',       -- link dell'APK: l'autorizzazione vale solo per questo
  did TEXT NOT NULL,                      -- codice casuale dell'installazione dello store
  device TEXT NOT NULL DEFAULT '',        -- modello del dispositivo
  note TEXT NOT NULL DEFAULT '',          -- nome scritto dal cliente (facoltativo)
  ip TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  code TEXT NOT NULL,                     -- codice di 6 cifre inviato al venditore
  status TEXT NOT NULL DEFAULT 'pending', -- pending | approved | denied
  token TEXT NOT NULL DEFAULT '',         -- consegnato al dispositivo dopo l'ok
  via TEXT NOT NULL DEFAULT '',           -- email | panel | code | auto | tries
  tries INTEGER NOT NULL DEFAULT 0,       -- codici errati
  uses INTEGER NOT NULL DEFAULT 0,        -- download avviati con l'autorizzazione
  mailed INTEGER NOT NULL DEFAULT 0,
  created INTEGER NOT NULL,
  decided INTEGER NOT NULL DEFAULT 0,
  used INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_store_req_created ON store_requests(created);
CREATE INDEX IF NOT EXISTS idx_store_req_did ON store_requests(did, app);
CREATE INDEX IF NOT EXISTS idx_store_req_ip ON store_requests(ip, created);
