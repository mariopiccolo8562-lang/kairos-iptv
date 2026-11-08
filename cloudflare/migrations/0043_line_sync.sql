CREATE TABLE IF NOT EXISTS line_sync (
  device_id TEXT PRIMARY KEY,
  panel TEXT NOT NULL,
  username TEXT NOT NULL,
  owner_id INTEGER NOT NULL DEFAULT 0,
  updated INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS line_sync_panel_username ON line_sync(panel, username);
