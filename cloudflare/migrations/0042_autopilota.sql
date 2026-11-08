-- Kairos Pro «intelligente» (autopilota):
-- 1) esito degli auto-controlli silenziosi dell'app (campo «chk» del battito): server, linea Xtream, guida TV, spazio,
--    orologio, motore imparato, avvio. JSON piccolo (al massimo 400 caratteri), lo mostrano «Dati» e «Salute delle app».
ALTER TABLE presence ADD COLUMN chk TEXT NOT NULL DEFAULT '';
-- 2) canale dell'errore di riproduzione: «server della lista|numero del flusso» (es. «prov.tv:8080|12345»).
--    Lo stesso numero sullo stesso server è lo stesso canale per tutti i clienti: così si trovano i canali che non
--    funzionano per nessuno («Canali non funzionanti»). Vuoto per film, serie e app vecchie.
ALTER TABLE app_errors ADD COLUMN ck TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS app_errors_ck ON app_errors (ck, t);
