-- DNS cifrato come lo dichiara l'app nel battito (12 novembre 2026): on, off, asking, denied, error, other, vpn.
-- '' = l'app non lo manda (versione vecchia) oppure il pannello non l'ha acceso per quel cliente.
-- Serve all'elenco Clienti del titolare: «DNS cifrato attivo» oppure no, accanto a cosa guarda e all'IP.
ALTER TABLE presence ADD COLUMN sdns TEXT NOT NULL DEFAULT '';
