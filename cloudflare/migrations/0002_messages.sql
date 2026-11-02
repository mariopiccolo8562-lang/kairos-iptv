-- KAIROS — messaggi dal fornitore ai dispositivi
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target TEXT NOT NULL DEFAULT 'all',   -- 'all' oppure id del dispositivo
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  level TEXT NOT NULL DEFAULT 'info',   -- info | warn | urgent
  created INTEGER NOT NULL,
  until INTEGER NOT NULL DEFAULT 0      -- 0 = senza scadenza
);
CREATE INDEX IF NOT EXISTS idx_messages_target ON messages(target);
