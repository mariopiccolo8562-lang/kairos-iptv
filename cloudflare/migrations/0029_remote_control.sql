-- Controllo remoto delle app: configurazione imposta dal pannello e comandi eseguiti dall'app al battito successivo.
-- devices.rc: impostazioni imposte a quel singolo cliente (JSON; vuoto = vale il profilo della sua app)
-- presence.app_cfg: impostazioni attuali dell'app come le riporta il dispositivo; presence.rcv: versione della configurazione applicata
-- remote_cmds: coda dei comandi (ricarica, svuota cache, apri impostazioni, aggiorna liste, speed test, chiudi)
ALTER TABLE devices ADD COLUMN rc TEXT NOT NULL DEFAULT '';
ALTER TABLE presence ADD COLUMN app_cfg TEXT NOT NULL DEFAULT '';
ALTER TABLE presence ADD COLUMN rcv TEXT NOT NULL DEFAULT '';
CREATE TABLE IF NOT EXISTS remote_cmds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL,
  cmd TEXT NOT NULL,
  args TEXT NOT NULL DEFAULT '',
  created INTEGER NOT NULL,
  by TEXT NOT NULL DEFAULT '',
  sent INTEGER NOT NULL DEFAULT 0,
  done INTEGER NOT NULL DEFAULT 0,
  ok INTEGER NOT NULL DEFAULT 0,
  info TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS remote_cmds_dev ON remote_cmds (device_id, done, created);
