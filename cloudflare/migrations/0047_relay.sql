CREATE TABLE IF NOT EXISTS relay_jobs (
  id TEXT PRIMARY KEY,
  method TEXT NOT NULL DEFAULT 'GET',
  path TEXT NOT NULL,
  headers TEXT,
  body TEXT,
  state TEXT NOT NULL DEFAULT 'pending',
  status INTEGER,
  res_body TEXT,
  trunc INTEGER NOT NULL DEFAULT 0,
  err TEXT,
  created INTEGER NOT NULL,
  taken INTEGER,
  done INTEGER
);
CREATE INDEX IF NOT EXISTS relay_jobs_state ON relay_jobs (state, created);
