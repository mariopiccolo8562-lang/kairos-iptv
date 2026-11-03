-- 2.6: quale app usa il dispositivo ('' = non ancora visto, 'tv' = KAIROS TV, 'lite' = Kairos Lite)
ALTER TABLE devices ADD COLUMN app TEXT NOT NULL DEFAULT '';
