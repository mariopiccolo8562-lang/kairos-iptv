-- Chi ha scaricato l'app di una TV nuova (12 novembre 2026): al register si cerca il codice dello Store usato da poco dalla
-- stessa rete e si segna l'agente (o il titolare) che l'aveva generato. Così la scheda «Da attivare» lo mostra sempre.
-- rec_t = 0: non ancora segnato (o scaricata senza codice). rec_by = 0 con rec_t > 0: codice del titolare.
ALTER TABLE devices ADD COLUMN rec_by INTEGER NOT NULL DEFAULT 0;
ALTER TABLE devices ADD COLUMN rec_name TEXT NOT NULL DEFAULT '';
ALTER TABLE devices ADD COLUMN rec_t INTEGER NOT NULL DEFAULT 0;
