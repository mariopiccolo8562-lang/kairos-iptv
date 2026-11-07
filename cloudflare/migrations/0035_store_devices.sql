-- Store intestati ai venditori: ogni installazione dello store (did) può essere attivata con il codice di un
-- venditore; da quel momento i download sono suoi e, se il titolare sceglie «solo store attivati», partono senza
-- conferma. seller = id dell'agente (0 = titolare); active = 0 quando lo store viene scollegato dal pannello.
CREATE TABLE IF NOT EXISTS store_devices (
  did TEXT PRIMARY KEY,
  seller INTEGER NOT NULL DEFAULT 0,
  device TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  activated INTEGER NOT NULL DEFAULT 0,
  last INTEGER NOT NULL DEFAULT 0,
  downloads INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_store_devices_seller ON store_devices (seller, active);
-- tetto di store attivabili per agente: -1 = quello di serie deciso dal titolare nelle impostazioni dello Store
ALTER TABLE admins ADD COLUMN store_max INTEGER NOT NULL DEFAULT -1;
-- codici venditore sbagliati all'attivazione: pochi tentativi all'ora per IP e per dispositivo
CREATE TABLE IF NOT EXISTS store_act_fail (k TEXT PRIMARY KEY, n INTEGER NOT NULL DEFAULT 0, t INTEGER NOT NULL DEFAULT 0);
