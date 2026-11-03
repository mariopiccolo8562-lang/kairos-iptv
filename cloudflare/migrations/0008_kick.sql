-- 2.0.2: "Disconnetti" dal pannello — istante dell'ultimo ordine di interrompere la visione su questo dispositivo
ALTER TABLE devices ADD COLUMN kick_t INTEGER NOT NULL DEFAULT 0;
