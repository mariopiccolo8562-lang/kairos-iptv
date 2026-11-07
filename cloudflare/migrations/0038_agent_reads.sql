-- Cosa ha già letto ogni agente (es. l'avviso «Nuova guida da leggere»): k = 'guide', at = quando l'ha aperta.
CREATE TABLE IF NOT EXISTS agent_reads (
  agent_id INTEGER NOT NULL,
  k TEXT NOT NULL,
  at INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (agent_id, k)
);
