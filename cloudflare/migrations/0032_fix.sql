-- «Risolvi»: quando il pannello ha sistemato l'ultima volta i problemi dell'app (gli errori prima di questo momento non contano più)
ALTER TABLE devices ADD COLUMN fix_t INTEGER NOT NULL DEFAULT 0;
