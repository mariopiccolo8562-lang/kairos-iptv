-- Data del cliente quando la linea si rinnova un mese alla volta (11 novembre 2026).
-- Il cliente allineato a una linea vede nell'app la scadenza della linea; chi ha incassato più mesi e rinnova la linea ogni
-- mese gli mostrerebbe la data sbagliata. hold = data fissata dal titolare o dall'agente per quel cliente (di solito quella
-- scritta a mano nella nota della linea): vale finché è più avanti della scadenza della linea. '' = segue la linea.
-- Il «Pagato fino al» non si salva qui: si legge ogni volta dai pagamenti (payments).
ALTER TABLE line_sync ADD COLUMN hold TEXT NOT NULL DEFAULT '';
