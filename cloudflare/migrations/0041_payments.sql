CREATE TABLE IF NOT EXISTS payments (
  kind TEXT NOT NULL,
  panel TEXT NOT NULL DEFAULT '',
  ref TEXT NOT NULL,
  owner_id INTEGER NOT NULL DEFAULT 0,
  label TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('due', 'paid')),
  months INTEGER NOT NULL DEFAULT 0,
  amount REAL,
  note TEXT NOT NULL DEFAULT '',
  since INTEGER NOT NULL DEFAULT 0,
  paid_until TEXT NOT NULL DEFAULT '',
  remind INTEGER NOT NULL DEFAULT 1,
  updated INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (kind, panel, ref)
);
CREATE INDEX IF NOT EXISTS idx_payments_owner ON payments (owner_id, kind);
