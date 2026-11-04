-- Linee collegate: registro delle linee IPTV collegate alle app (OraPlayer, IboOne, OrbixPlay, MaxPlayer…)
-- owner_id: 0 = titolare, altrimenti l'agente a cui appartiene. La password è cifrata (pass_seal).
-- source: '' = inserita a mano; 'orbix' / 'max' = registrata in automatico dall'attivazione via API.
CREATE TABLE IF NOT EXISTS linked_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL DEFAULT 0,
  app TEXT NOT NULL DEFAULT '',
  username TEXT NOT NULL DEFAULT '',
  pass_seal TEXT NOT NULL DEFAULT '',
  dns TEXT NOT NULL DEFAULT '',
  dns_name TEXT NOT NULL DEFAULT '',
  mac TEXT NOT NULL DEFAULT '',
  device_id TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT '',
  created INTEGER NOT NULL DEFAULT 0,
  updated INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS linked_lines_owner ON linked_lines (owner_id);
CREATE INDEX IF NOT EXISTS linked_lines_dev ON linked_lines (device_id, source);
