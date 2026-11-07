-- Note KAIROS sulle linee dei pannelli che non hanno un campo nota proprio (Armada, MirkoTeam/ORCP, MaxPlayer, OrbixPlay).
-- panel: 'armada' | 'orcp' | 'mxp' | 'oxp' …; ref: utente della linea (o MAC / id dispositivo), minuscolo.
CREATE TABLE IF NOT EXISTS line_notes (
  panel TEXT NOT NULL,
  ref TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  owner_id INTEGER NOT NULL DEFAULT 0,
  updated INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (panel, ref)
);
