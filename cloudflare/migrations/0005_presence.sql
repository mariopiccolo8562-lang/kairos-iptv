-- KAIROS — utenti online, permessi per dispositivo, segnalazioni e richieste di contenuti

-- permessi del dispositivo: JSON con le sole funzioni spente, es. {"rec":false} ('' = tutto consentito)
ALTER TABLE devices ADD COLUMN perms TEXT NOT NULL DEFAULT '';

-- presenza: una riga per dispositivo, aggiornata dal "battito" dell'app (ogni ~30 s) e dal register
CREATE TABLE IF NOT EXISTS presence (
  device_id TEXT PRIMARY KEY,
  t INTEGER NOT NULL,                     -- ultimo segnale
  hb_t INTEGER NOT NULL DEFAULT 0,        -- ultimo battito (limite di frequenza)
  ip TEXT NOT NULL DEFAULT '',
  ip2 TEXT NOT NULL DEFAULT '',           -- IP precedente (diverso) e quando è stato visto l'ultima volta
  ip2_t INTEGER NOT NULL DEFAULT 0,
  country TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  home_country TEXT NOT NULL DEFAULT '',  -- primo paese visto: serve a segnalare collegamenti da un paese diverso
  ver TEXT NOT NULL DEFAULT '',           -- versione APK
  ui TEXT NOT NULL DEFAULT '',            -- versione interfaccia
  model TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL DEFAULT 'idle',     -- idle | live | movie | series | rec
  title TEXT NOT NULL DEFAULT '',
  ch TEXT NOT NULL DEFAULT '',
  ch_id TEXT NOT NULL DEFAULT '',
  grp TEXT NOT NULL DEFAULT '',
  pl TEXT NOT NULL DEFAULT '',            -- id playlist
  prof TEXT NOT NULL DEFAULT '',          -- nome profilo
  screen TEXT NOT NULL DEFAULT '',
  net TEXT NOT NULL DEFAULT '',           -- wifi | eth | mobile | none | ''
  rssi INTEGER NOT NULL DEFAULT 0,
  speed_dl REAL NOT NULL DEFAULT 0,
  speed_ul REAL NOT NULL DEFAULT 0,
  speed_ping REAL NOT NULL DEFAULT 0,
  speed_jit REAL NOT NULL DEFAULT 0,
  speed_t INTEGER NOT NULL DEFAULT 0,
  res TEXT NOT NULL DEFAULT '',
  fps REAL NOT NULL DEFAULT 0,
  bitrate REAL NOT NULL DEFAULT 0,
  buffers INTEGER NOT NULL DEFAULT 0,
  dropped INTEGER NOT NULL DEFAULT 0,
  engine TEXT NOT NULL DEFAULT '',
  vpn TEXT NOT NULL DEFAULT ''            -- on | off | ''
);
CREATE INDEX IF NOT EXISTS idx_presence_t ON presence(t);

-- contenuti più guardati: +1 ogni volta che un dispositivo inizia a guardare qualcosa (sessioni, non minuti)
CREATE TABLE IF NOT EXISTS watch (
  day TEXT NOT NULL,                      -- AAAA-MM-GG (ora italiana)
  kind TEXT NOT NULL,                     -- live | movie | series | rec
  title TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, kind, title)
);

-- segnalazioni di problemi e richieste di contenuti dall'app
CREATE TABLE IF NOT EXISTS requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL,
  kind TEXT NOT NULL,                     -- report | content
  ctype TEXT NOT NULL DEFAULT '',         -- movie | series | live | ''
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  info TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new',     -- new | seen | done
  created INTEGER NOT NULL,
  ip TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_requests_kind ON requests(kind, status, id);

-- limite di visioni contemporanee (0 = nessun limite oltre alle connessioni) e località VPN scelta dal pannello
ALTER TABLE devices ADD COLUMN max_streams INTEGER NOT NULL DEFAULT 0;
ALTER TABLE devices ADD COLUMN vpn_loc TEXT NOT NULL DEFAULT '';
