-- 2.4.2: per ogni cliente si sceglie quale intelligenza artificiale usa ('' = quella predefinita del pannello)
ALTER TABLE devices ADD COLUMN ai_provider TEXT NOT NULL DEFAULT '';
