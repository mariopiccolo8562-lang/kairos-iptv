-- Store aperto (come IBO Player): niente codice del venditore, niente attivazione, niente autorizzazione.
-- Ogni installazione dello store (did) si conta da sola quando si apre: quante ce ne sono, quando è stata vista
-- la prima e l'ultima volta, quante aperture e quanti download. Serve solo al titolare per vedere quanti scaricano.
CREATE TABLE IF NOT EXISTS store_seen (
  did TEXT PRIMARY KEY,
  device TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  version TEXT NOT NULL DEFAULT '',
  first_seen INTEGER NOT NULL DEFAULT 0,
  last_seen INTEGER NOT NULL DEFAULT 0,
  opens INTEGER NOT NULL DEFAULT 0,
  downloads INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_store_seen_last ON store_seen (last_seen);
