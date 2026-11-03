-- 2.4: assistente IA con Cloudflare Workers AI: domande al giorno per cliente, domande extra, consumo giornaliero
ALTER TABLE devices ADD COLUMN ai_limit INTEGER NOT NULL DEFAULT -1; -- -1 = valore predefinito delle impostazioni
ALTER TABLE devices ADD COLUMN ai_extra INTEGER NOT NULL DEFAULT 0; -- domande in più concesse (si usano dopo il limite del giorno)
CREATE TABLE IF NOT EXISTS ai_usage (
  day TEXT NOT NULL,           -- AAAA-MM-GG (UTC, come il conteggio gratuito di Cloudflare)
  device_id TEXT NOT NULL,     -- abbonamento (cliente principale); '_cf' = stato del servizio Cloudflare
  n INTEGER NOT NULL DEFAULT 0,
  cf INTEGER NOT NULL DEFAULT 0,
  gm INTEGER NOT NULL DEFAULT 0,
  neu REAL NOT NULL DEFAULT 0, -- neuroni Cloudflare stimati
  PRIMARY KEY (day, device_id)
);
