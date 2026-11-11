-- Il tuo accesso (11 novembre 2026, Impostazioni → Sicurezza e account), solo per il titolare:
-- codice di accesso chiesto sui dispositivi che il pannello non ricorda, «Ricorda questo dispositivo» per 90 giorni,
-- avvisi su Telegram e accesso con impronta o Face ID (passkey, WebAuthn).
ALTER TABLE admins ADD COLUMN acc_seal TEXT NOT NULL DEFAULT '';      -- codice di accesso cifrato ('' = spento)
ALTER TABLE admins ADD COLUMN acc_tg INTEGER NOT NULL DEFAULT 0;      -- avvisi su Telegram per i suoi accessi

-- dispositivi ricordati: impronta del cookie __Host-kxtd (il cookie in chiaro sta solo nel browser)
CREATE TABLE IF NOT EXISTS trusted_devices (
  id TEXT PRIMARY KEY,
  admin_id INTEGER NOT NULL,
  ua TEXT NOT NULL DEFAULT '',
  geo TEXT NOT NULL DEFAULT '',
  created INTEGER NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  expires INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_td_admin ON trusted_devices (admin_id, expires);

-- passkey: solo la chiave pubblica (la chiave privata resta nel telefono o nel computer)
CREATE TABLE IF NOT EXISTS passkeys (
  id TEXT PRIMARY KEY,                     -- identificativo della credenziale (base64url)
  admin_id INTEGER NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  jwk TEXT NOT NULL,
  alg INTEGER NOT NULL,                    -- -7 ES256, -257 RS256
  count INTEGER NOT NULL DEFAULT 0,        -- contatore delle firme (contro le copie)
  created INTEGER NOT NULL,
  used INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_pk_admin ON passkeys (admin_id);

-- sfide usa e getta per registrare o usare una passkey (5 minuti)
CREATE TABLE IF NOT EXISTS pk_chal (
  id TEXT PRIMARY KEY,
  admin_id INTEGER NOT NULL DEFAULT 0,
  kind TEXT NOT NULL,                      -- 'reg' | 'auth'
  t INTEGER NOT NULL
);
