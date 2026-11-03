-- 2.5: password degli agenti visibile al proprietario (cifrata con ENC_KEY, come le playlist)
ALTER TABLE admins ADD COLUMN pw_seal TEXT NOT NULL DEFAULT '';
