-- KAIROS 1.9 — uso delle playlist per cliente e API di integrazione

-- playlist unite (merge, predefinito) o divise (split) e playlist da usare ('' = la prima)
ALTER TABLE devices ADD COLUMN pl_mode TEXT NOT NULL DEFAULT '';
ALTER TABLE devices ADD COLUMN pl_default TEXT NOT NULL DEFAULT '';

-- chiavi API per collegare altri programmi (si salva solo l'impronta della chiave)
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  hash TEXT NOT NULL UNIQUE,
  prefix TEXT NOT NULL DEFAULT '',        -- primi caratteri, per riconoscerla nel pannello
  scope TEXT NOT NULL DEFAULT 'full',     -- full | read
  created INTEGER NOT NULL,
  last_used INTEGER NOT NULL DEFAULT 0,
  last_ip TEXT NOT NULL DEFAULT '',
  uses INTEGER NOT NULL DEFAULT 0
);
