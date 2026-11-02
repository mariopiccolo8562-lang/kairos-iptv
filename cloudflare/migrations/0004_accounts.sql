-- KAIROS — account dei clienti: connessioni (più dispositivi), profili personali, VPN
-- Un dispositivo "collegato" (parent <> '') usa stato, scadenza, playlist, profili e limiti del principale.
ALTER TABLE devices ADD COLUMN max_conn INTEGER NOT NULL DEFAULT 1;        -- dispositivi ammessi, principale compreso
ALTER TABLE devices ADD COLUMN max_profiles INTEGER NOT NULL DEFAULT 3;    -- profili personali ammessi
ALTER TABLE devices ADD COLUMN profiles TEXT NOT NULL DEFAULT '';          -- JSON [{id,name,avatar,kids,pl}]
ALTER TABLE devices ADD COLUMN parent TEXT NOT NULL DEFAULT '';            -- id del dispositivo principale
ALTER TABLE devices ADD COLUMN lock_profiles INTEGER NOT NULL DEFAULT 0;   -- 1 = il cliente non può modificare i profili
ALTER TABLE devices ADD COLUMN vpn INTEGER NOT NULL DEFAULT 0;             -- 0 spenta, 1 consentita, 2 sempre attiva
ALTER TABLE devices ADD COLUMN vpn_conf TEXT NOT NULL DEFAULT '';          -- configurazione WireGuard cifrata (facoltativa)
CREATE INDEX IF NOT EXISTS idx_devices_parent ON devices(parent);

-- codici a 6 cifre per collegare un nuovo dispositivo a un account (validi 10 minuti, usabili una volta)
CREATE TABLE IF NOT EXISTS link_pins (
  pin_hash TEXT PRIMARY KEY,           -- hash del codice (il codice in chiaro non viene salvato)
  device_id TEXT NOT NULL,             -- dispositivo principale
  until INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_link_pins_dev ON link_pins(device_id);

-- contatori anti-abuso con finestre lunghe (il rate limiting nativo arriva al massimo a 60 secondi)
CREATE TABLE IF NOT EXISTS throttle (
  k TEXT PRIMARY KEY,
  n INTEGER NOT NULL DEFAULT 0,
  until INTEGER NOT NULL
);
