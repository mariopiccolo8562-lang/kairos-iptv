-- KAIROS 2.0 — lettore scelto dal pannello per ogni cliente
-- JSON con le sole scelte fatte: {"live":"exo","movie":"vlc","series":"auto"} ('' = decide il cliente dall'app)
ALTER TABLE devices ADD COLUMN player TEXT NOT NULL DEFAULT '';
