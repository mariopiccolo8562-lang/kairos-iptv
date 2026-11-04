-- Avvisi delle richieste dello store: Telegram e notifiche del pannello
CREATE TABLE IF NOT EXISTS notify_links (
  admin_id INTEGER PRIMARY KEY,
  tg_chat TEXT NOT NULL DEFAULT '',
  tg_name TEXT NOT NULL DEFAULT '',
  tg_linked INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS tg_codes (
  code TEXT PRIMARY KEY,
  admin_id INTEGER NOT NULL,
  created INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS tg_msgs (
  req_id TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  msg_id INTEGER NOT NULL,
  created INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (req_id, chat_id)
);
CREATE TABLE IF NOT EXISTS push_subs (
  id TEXT PRIMARY KEY,
  admin_id INTEGER NOT NULL,
  endpoint TEXT NOT NULL,
  ua TEXT NOT NULL DEFAULT '',
  created INTEGER NOT NULL,
  last_ok INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS push_subs_admin ON push_subs (admin_id);
