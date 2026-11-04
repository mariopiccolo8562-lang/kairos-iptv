-- MaxPlayer: account creato per il cliente ({"uid":"…","u":"utente di accesso","dom":"id dominio","t":…})
ALTER TABLE devices ADD COLUMN maxp TEXT NOT NULL DEFAULT '';
