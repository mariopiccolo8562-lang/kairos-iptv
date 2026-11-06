-- Kairos Adaptive: cosa l'app ha misurato della linea e del lettore (battito «stats»)
ALTER TABLE presence ADD COLUMN bw REAL NOT NULL DEFAULT 0;          -- banda stimata (Mbps, solo campioni validi: HLS/VOD)
ALTER TABLE presence ADD COLUMN line TEXT NOT NULL DEFAULT '';       -- classe della linea: weak | normal | good
ALTER TABLE presence ADD COLUMN dev_class TEXT NOT NULL DEFAULT '';  -- classe del dispositivo: D | N | O
ALTER TABLE presence ADD COLUMN fill REAL NOT NULL DEFAULT 0;        -- riempimento del buffer nei primi 10 s (>1 = la linea ha margine)
ALTER TABLE presence ADD COLUMN ttff INTEGER NOT NULL DEFAULT 0;     -- ms al primo fotogramma
ALTER TABLE presence ADD COLUMN stall_ms INTEGER NOT NULL DEFAULT 0; -- secondi totali di blocco nella sessione (ms)
ALTER TABLE presence ADD COLUMN var TEXT NOT NULL DEFAULT '';        -- versione in uso (full/HD/SD…)
ALTER TABLE presence ADD COLUMN fmt TEXT NOT NULL DEFAULT '';        -- formato effettivo (ts/hls)
