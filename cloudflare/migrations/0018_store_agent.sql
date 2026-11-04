-- chi ha deciso una richiesta dello store (0 = titolare o automatica, altrimenti l'id dell'agente)
ALTER TABLE store_requests ADD COLUMN by_admin INTEGER NOT NULL DEFAULT 0;
