-- Codici usa e getta per lo Store (11 novembre 2026): con «Download solo con codice» acceso nel Riepilogo store, il
-- cliente scrive nello Store un codice di 6 cifre generato dal titolare o da un agente con il permesso «Codici per lo
-- Store». Il codice va scritto entro la durata scelta (30 minuti, 2 ore o 24 ore); al primo uso si lega a quel
-- dispositivo, che per la stessa durata può scaricare tutte le app che vuole. Poi non vale più.
CREATE TABLE IF NOT EXISTS store_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL,                      -- 6 cifre
  created INTEGER NOT NULL,
  expires INTEGER NOT NULL,                -- entro quando va scritto nello Store
  ttl INTEGER NOT NULL,                    -- durata (ms): per scriverlo e, dopo il primo uso, per scaricare
  by_id INTEGER NOT NULL DEFAULT 0,        -- 0 = titolare, altrimenti l'agente che l'ha generato
  by_name TEXT NOT NULL DEFAULT '',
  did TEXT NOT NULL DEFAULT '',            -- Kairos Store che l'ha usato
  device TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  ip TEXT NOT NULL DEFAULT '',             -- serve solo a riconoscere la TV nuova («📥 col codice di …»), 30 giorni come i download
  used INTEGER NOT NULL DEFAULT 0,         -- primo uso
  until INTEGER NOT NULL DEFAULT 0,        -- fine della finestra di download su quel dispositivo
  apps TEXT NOT NULL DEFAULT '[]',         -- app scaricate con il codice
  dls INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_store_codes_code ON store_codes (code, expires);
CREATE INDEX IF NOT EXISTS idx_store_codes_did ON store_codes (did, until);
CREATE INDEX IF NOT EXISTS idx_store_codes_by ON store_codes (by_id, created);
CREATE INDEX IF NOT EXISTS idx_store_codes_ip ON store_codes (ip, used);

-- codici sbagliati: dopo troppi tentativi quel dispositivo (o quell'indirizzo) resta fermo un'ora
CREATE TABLE IF NOT EXISTS store_code_fail (
  k TEXT PRIMARY KEY,                      -- 'd:<dispositivo>' oppure 'i:<indirizzo>'
  n INTEGER NOT NULL DEFAULT 0,
  t INTEGER NOT NULL DEFAULT 0
);

-- scaricamenti degli APK per indirizzo e ora (limite agli scaricamenti in massa da /get/*.apk)
CREATE TABLE IF NOT EXISTS dl_hits (
  ip TEXT NOT NULL,
  h INTEGER NOT NULL,                      -- ora (ms / 3.600.000)
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (ip, h)
);
