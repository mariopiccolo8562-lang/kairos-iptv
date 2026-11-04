-- SMS inviati per ogni richiesta dello store (per il tetto giornaliero)
ALTER TABLE store_requests ADD COLUMN sms INTEGER NOT NULL DEFAULT 0;
