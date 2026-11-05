-- 3.6: «Crea lista» — liste caricate su OrbixPlay / MaxPlayer senza un cliente Kairos (titolare o agenti)
CREATE TABLE IF NOT EXISTS ext_lists (
  id TEXT PRIMARY KEY,
  owner_id INTEGER NOT NULL DEFAULT 0,   -- 0 = titolare, altrimenti l'agente che l'ha creata
  app TEXT NOT NULL,                     -- 'orbix' | 'max'
  name TEXT NOT NULL DEFAULT '',
  ref TEXT NOT NULL DEFAULT '',          -- OrbixPlay: ID dispositivo · MaxPlayer: utente di accesso
  ext TEXT NOT NULL DEFAULT '',          -- OrbixPlay: ID delle playlist · MaxPlayer: user_id
  username TEXT NOT NULL DEFAULT '',
  pass_seal TEXT NOT NULL DEFAULT '',
  dns TEXT NOT NULL DEFAULT '',          -- nome del DNS / dominio scelto
  note TEXT NOT NULL DEFAULT '',
  created INTEGER NOT NULL,
  updated INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ext_lists_owner ON ext_lists(owner_id, created);
