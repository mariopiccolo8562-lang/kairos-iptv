-- 2.2: immagini dei temi caricate dal fornitore (sfondo + 4 avatar), mandate solo ai clienti che hanno il tema
CREATE TABLE IF NOT EXISTS addon_media (
  addon TEXT NOT NULL,
  slot TEXT NOT NULL,
  data TEXT NOT NULL,
  updated INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (addon, slot)
);
