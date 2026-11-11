-- Accesso degli agenti (11 novembre 2026), Impostazioni → Sicurezza: «Accesso di 7 giorni», «Massimo 2 dispositivi per
-- agente», «Solo da questi Paesi». Quando una sessione di un agente viene chiusa per una di queste regole, qui resta per
-- qualche giorno il motivo: il dispositivo scollegato mostra all'agente perché deve rientrare (non «Sessione scaduta»).
CREATE TABLE IF NOT EXISTS ses_out (
  id TEXT PRIMARY KEY,                     -- impronta della sessione chiusa (come sessions.id)
  why TEXT NOT NULL,                       -- 'week' | 'two' | 'geo'
  msg TEXT NOT NULL DEFAULT '',            -- frase mostrata all'agente
  t INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ses_out_t ON ses_out (t);
CREATE INDEX IF NOT EXISTS idx_sessions_admin ON sessions (admin_id, created_at);
