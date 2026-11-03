-- 2.3: agenti (reseller) con accesso al pannello: ruolo, gerarchia, limite di clienti, permessi, server assegnati
ALTER TABLE admins ADD COLUMN role TEXT NOT NULL DEFAULT 'owner';
ALTER TABLE admins ADD COLUMN parent_id INTEGER NOT NULL DEFAULT 0;
ALTER TABLE admins ADD COLUMN email TEXT NOT NULL DEFAULT '';
ALTER TABLE admins ADD COLUMN max_clients INTEGER NOT NULL DEFAULT 10;
ALTER TABLE admins ADD COLUMN can_agents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE admins ADD COLUMN perms TEXT NOT NULL DEFAULT '';
ALTER TABLE admins ADD COLUMN servers TEXT NOT NULL DEFAULT '';
ALTER TABLE admins ADD COLUMN active INTEGER NOT NULL DEFAULT 1;
ALTER TABLE admins ADD COLUMN notes TEXT NOT NULL DEFAULT '';
ALTER TABLE admins ADD COLUMN last_seen INTEGER NOT NULL DEFAULT 0;
-- chi l'ha disattivato (-1 = proprietario): un agente può riattivare solo chi ha disattivato lui o qualcuno sotto di lui
ALTER TABLE admins ADD COLUMN disabled_by INTEGER NOT NULL DEFAULT 0;
-- cliente di un agente (0 = tuo)
ALTER TABLE devices ADD COLUMN owner_id INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_devices_owner ON devices(owner_id);
CREATE INDEX IF NOT EXISTS idx_admins_parent ON admins(parent_id);
