-- 3.8: «Dati» del cliente e salute delle app — tempo di visione per dispositivo e richiesta di aggiornamento
CREATE TABLE IF NOT EXISTS watch_dev (
  device_id TEXT NOT NULL,
  day TEXT NOT NULL,                 -- giorno (ora italiana) AAAA-MM-GG
  kind TEXT NOT NULL,                -- live | movie | series
  title TEXT NOT NULL,
  secs INTEGER NOT NULL DEFAULT 0,   -- secondi guardati
  last INTEGER NOT NULL DEFAULT 0,   -- ultima volta
  PRIMARY KEY (device_id, day, kind, title)
);
CREATE INDEX IF NOT EXISTS watch_dev_dev ON watch_dev (device_id, day);
ALTER TABLE devices ADD COLUMN upd_req INTEGER NOT NULL DEFAULT 0;  -- «Invia aggiornamento» dal pannello
