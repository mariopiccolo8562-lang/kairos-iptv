-- Dispositivi dell'agente (11 novembre 2026, Agenti → Link accesso): da dove è entrata ogni sessione (città e Paese visti da
-- Cloudflare all'accesso), per l'elenco dei dispositivi collegati con «Scollega». Niente indirizzo IP nell'elenco.
ALTER TABLE sessions ADD COLUMN geo TEXT NOT NULL DEFAULT '';
