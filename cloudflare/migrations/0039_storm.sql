-- Pannello Storm (storm-panel.pro): stessa API di Armada. Le tabelle di Armada ora dicono a quale pannello
-- appartiene ogni riga (prov = 'armada' | 'storm'): le righe esistenti sono tutte di Armada.
ALTER TABLE armada_own ADD COLUMN prov TEXT NOT NULL DEFAULT 'armada';
ALTER TABLE armada_spend ADD COLUMN prov TEXT NOT NULL DEFAULT 'armada';
CREATE INDEX IF NOT EXISTS armada_own_prov ON armada_own (prov, agent_id);
CREATE INDEX IF NOT EXISTS armada_spend_prov ON armada_spend (prov, month, agent_id);
