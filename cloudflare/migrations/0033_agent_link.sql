-- Link di accesso personale degli agenti: apre il pannello solo con quell'account, insieme a un codice di accesso.
-- link_hash = SHA-256 del token (per trovarlo), link_seal e code_seal = token e codice cifrati (il titolare li può rivedere).
ALTER TABLE admins ADD COLUMN link_hash TEXT NOT NULL DEFAULT '';
ALTER TABLE admins ADD COLUMN link_seal TEXT NOT NULL DEFAULT '';
ALTER TABLE admins ADD COLUMN code_seal TEXT NOT NULL DEFAULT '';
ALTER TABLE admins ADD COLUMN link_t INTEGER NOT NULL DEFAULT 0;
ALTER TABLE admins ADD COLUMN link_used INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_admins_link ON admins (link_hash);
