-- Promemoria dei pagamenti (10 novembre 2026): ogni quanto ricordare chi deve pagare e da quale giorno.
-- remind_days: 0 = una volta sola, 1 = ogni giorno, 2 = ogni 2 giorni (come prima), 3 = ogni 3 giorni, 7 = ogni settimana.
-- remind_from: giorno (AAAA-MM-GG) da cui partono i promemoria; vuoto = da quando il cliente deve pagare.
-- «remind» resta l'interruttore (0 = nessun promemoria).
ALTER TABLE payments ADD COLUMN remind_days INTEGER NOT NULL DEFAULT 2;
ALTER TABLE payments ADD COLUMN remind_from TEXT NOT NULL DEFAULT '';
