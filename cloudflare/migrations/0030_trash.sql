-- Cestino: quello che si elimina dal pannello (clienti, agenti, DNS, linee, messaggi, chiavi, località VPN, liste sulle app terze)
-- resta qui 30 giorni e si può ripristinare. data = righe originali (JSON), extra = collegamenti da rimettere a posto.
CREATE TABLE IF NOT EXISTS trash (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  ref TEXT NOT NULL DEFAULT '',
  label TEXT NOT NULL DEFAULT '',
  data TEXT NOT NULL DEFAULT '',
  extra TEXT NOT NULL DEFAULT '',
  by TEXT NOT NULL DEFAULT '',
  t INTEGER NOT NULL,
  exp INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_trash_t ON trash (t);
