CREATE TABLE IF NOT EXISTS agent_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER NOT NULL,
  t INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('debt','pay')),
  eur REAL NOT NULL DEFAULT 0,
  credits REAL NOT NULL DEFAULT 0,
  panel TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  "by" TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS agent_ledger_agent ON agent_ledger (agent_id, t);
INSERT INTO agent_ledger (agent_id, t, type, eur, credits, panel, note, "by")
SELECT CAST(ref AS INTEGER), CASE WHEN since > 0 THEN since ELSE updated END, 'debt', COALESCE(amount, 0), 0, '', note, 'import'
FROM payments
WHERE kind = 'agent' AND status = 'due';
DELETE FROM payments WHERE kind = 'agent';
