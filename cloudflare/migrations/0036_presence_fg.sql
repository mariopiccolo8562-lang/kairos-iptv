-- Presenza: quale app è in primo piano sul dispositivo e da quando. Se due app Kairos (es. Pro e Premium) usano lo stesso
-- codice cliente, i battiti «di sfondo» dell'app non visibile non devono far risultare in linea quella sbagliata.
ALTER TABLE presence ADD COLUMN fg_app TEXT NOT NULL DEFAULT '';
ALTER TABLE presence ADD COLUMN fg_t INTEGER NOT NULL DEFAULT 0;
