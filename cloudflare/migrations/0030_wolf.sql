-- WOLF: linee del pannello WOLF collegate ai clienti KAIROS (utente e password dell'ultima sincronizzazione, password cifrata)
CREATE TABLE IF NOT EXISTS wolf_links (
  line_id INTEGER PRIMARY KEY,
  device_id TEXT NOT NULL,
  username TEXT NOT NULL DEFAULT '',
  pass_seal TEXT NOT NULL DEFAULT '',
  updated INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS wolf_links_dev ON wolf_links (device_id);
