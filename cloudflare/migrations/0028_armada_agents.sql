-- Pannello Armada anche per gli agenti (solo con il permesso del titolare).
-- armada_own: chi ha creato ogni linea/MAG su Armada (0 = titolare), così l'agente vede e gestisce solo le sue.
-- armada_spend: crediti del titolare usati dagli agenti, per mese (ora italiana), per il tetto mensile di ognuno.
CREATE TABLE IF NOT EXISTS armada_own (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER NOT NULL DEFAULT 0,
  type TEXT NOT NULL DEFAULT 'm3u',
  line_id TEXT NOT NULL DEFAULT '',
  username TEXT NOT NULL DEFAULT '',
  mac TEXT NOT NULL DEFAULT '',
  created INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS armada_own_agent ON armada_own (agent_id);
CREATE INDEX IF NOT EXISTS armada_own_user ON armada_own (username);
CREATE TABLE IF NOT EXISTS armada_spend (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER NOT NULL,
  t INTEGER NOT NULL,
  month TEXT NOT NULL,
  day TEXT NOT NULL DEFAULT '',
  credits REAL NOT NULL DEFAULT 0,
  action TEXT NOT NULL DEFAULT '',
  ref TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS armada_spend_month ON armada_spend (month, agent_id);
CREATE INDEX IF NOT EXISTS armada_spend_day ON armada_spend (agent_id, day, action);
