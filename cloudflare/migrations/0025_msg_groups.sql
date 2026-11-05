-- 3.7: messaggi a gruppi di clienti (una riga per cliente, stesso «grp») e messaggi agli agenti
ALTER TABLE messages ADD COLUMN grp TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_messages_grp ON messages(grp);
CREATE TABLE IF NOT EXISTS agent_msgs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target TEXT NOT NULL,          -- 'all' = tutti gli agenti, altrimenti l'id dell'agente
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  level TEXT NOT NULL DEFAULT 'info',
  grp TEXT NOT NULL DEFAULT '',
  created INTEGER NOT NULL,
  until INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_agent_msgs_target ON agent_msgs(target);
