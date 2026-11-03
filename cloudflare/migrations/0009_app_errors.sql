-- 2.0.3: diagnostica della visione e «Errori applicazione»
ALTER TABLE presence ADD COLUMN codec TEXT NOT NULL DEFAULT '';
ALTER TABLE presence ADD COLUMN dec TEXT NOT NULL DEFAULT '';        -- hw | sw
ALTER TABLE presence ADD COLUMN stalls_h INTEGER NOT NULL DEFAULT 0;  -- blocchi nell'ultima ora
ALTER TABLE presence ADD COLUMN rec TEXT NOT NULL DEFAULT '';         -- ultimo recupero automatico
ALTER TABLE presence ADD COLUMN reduced TEXT NOT NULL DEFAULT '';     -- qualità ridotta in corso (HD, SD…)

-- problemi della visione inviati dalle app (si cancellano da soli dopo 7 giorni)
CREATE TABLE IF NOT EXISTS app_errors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  t INTEGER NOT NULL,                 -- quando è successo (orologio del server)
  device_id TEXT NOT NULL,
  problem TEXT NOT NULL DEFAULT '',   -- freeze | stall | error
  action TEXT NOT NULL DEFAULT '',    -- cosa ha fatto il recupero automatico
  outcome TEXT NOT NULL DEFAULT '',   -- risolto | non risolto | chiuso
  err TEXT NOT NULL DEFAULT '',       -- codice dell'errore del lettore
  title TEXT NOT NULL DEFAULT '',     -- canale, film o episodio
  item_id TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT '',      -- live | vod
  engine TEXT NOT NULL DEFAULT '',
  codec TEXT NOT NULL DEFAULT '',
  dec TEXT NOT NULL DEFAULT '',
  res TEXT NOT NULL DEFAULT '',
  variant TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  ver TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS app_errors_t ON app_errors (t);
CREATE INDEX IF NOT EXISTS app_errors_dev ON app_errors (device_id, t);
