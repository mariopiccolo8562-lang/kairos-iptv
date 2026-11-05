-- Connessioni collegate con «gestione indipendente»: la TV collegata ha playlist e lettore suoi
-- (abbonamento, scadenza, profili, permessi e limiti restano quelli del cliente principale)
ALTER TABLE devices ADD COLUMN own INTEGER NOT NULL DEFAULT 0;
