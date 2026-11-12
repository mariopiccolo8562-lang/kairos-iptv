-- Da dove viene la scadenza che il cliente vede nell'app quando è allineato a una linea (12 novembre 2026).
-- src = '' : dalla scadenza della linea (con «Pagato fino al» e data fissata, come sempre).
-- src = 'note' : dalla data scritta nella nota della linea; se cambi la data nella nota, il cliente la segue da solo.
-- La scelta si fa nella scheda del cliente, anche subito quando si collega la linea.
ALTER TABLE line_sync ADD COLUMN src TEXT NOT NULL DEFAULT '';
