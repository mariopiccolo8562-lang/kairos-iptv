-- Kairos Player per TV LG e Samsung: «invia la lista dal telefono» (14 novembre 2026). Il TV chiede un codice breve, chi lo ha
-- scrive la lista sulla pagina /tv, il TV la ritira una volta sola. La riga dura 15 minuti e si cancella alla consegna;
-- la lista sta cifrata (payload). Nessun legame con i clienti o le linee del pannello.
CREATE TABLE IF NOT EXISTS tv_pair (
  code TEXT PRIMARY KEY,
  secret_hash TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '',
  created INTEGER NOT NULL,
  ip TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS tv_pair_created ON tv_pair (created);
