-- 2.2: add-on (temi speciali, skin colorate, pacchetti avatar) assegnati al cliente: elenco di id separati da virgola
ALTER TABLE devices ADD COLUMN addons TEXT NOT NULL DEFAULT '';
