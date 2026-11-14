# Kairos Player per TV LG (webOS) e Samsung (Tizen)

Lettore neutro per le liste dell'utente: link M3U oppure accesso Xtream (server, utente, password).
**L'app non contiene canali, film o indirizzi di contenuti** e non è collegata a nessun servizio: mostra solo ciò che l'utente inserisce.

Versione 0.1.0 — prima stesura. Provata in un browser con un server finto (`tv_player.mjs`, 23 controlli); **non ancora provata su un TV vero**.

## Cosa fa
- Prima apertura: «Aggiungi una lista» (link M3U o accesso Xtream). Un link `get.php?username=…&password=…` viene riconosciuto come accesso Xtream.
- Home: TV in diretta, Film, Serie TV, Preferiti, Cerca, Le mie liste, Impostazioni.
- Diretta: categorie, canali, guida «ora / a seguire» (solo Xtream), cambio canale con ▲ ▼ o CH+ / CH−.
- Film e serie: locandine, scheda con trama, stagioni ed episodi, ripresa dal punto in cui si era arrivati.
- Le mie liste: aggiungi, usa, aggiorna, elimina. Più liste, una in uso alla volta.
- Impostazioni: lingua (italiano, inglese), categorie per adulti nascoste finché non si sceglie un PIN, cancellazione di tutti i dati, informazioni e privacy.
- Telecomando: frecce, OK, Indietro (con conferma prima di uscire), tasti multimediali, puntatore LG.
- In secondo piano la riproduzione si ferma.

## Cosa non fa, di proposito
- Nessun contenuto incluso, nessun elenco di fornitori, nessun codice di attivazione verso un servizio.
- Nessun codice scaricato da fuori, nessuna statistica, nessuna pubblicità, nessun componente di terzi.
- Nessuna funzione che si accende dopo la revisione o che si comporta in modo diverso per chi controlla l'app.
- Si collega solo al server della lista scritta dall'utente (canali, locandine e loghi vengono da lì).

## Cartelle
- `app/` — l'app (HTML, CSS, JavaScript ES5: gira anche sui TV meno recenti)
- `webos/` — `appinfo.json` e icone per LG
- `tizen/` — `config.xml` e icona per Samsung
- `build.mjs` — prepara `dist/webos` e `dist/tizen`
- `docs/STORE.md` — testi e passi per i due store

## Preparare i pacchetti (sul tuo computer)
1. `node build.mjs`
2. **LG:** installa la webOS CLI di LG, poi `ares-package dist/webos -o dist` → file `.ipk`. Per provarlo: sul TV installa l'app «Developer Mode», poi `ares-setup-device` e `ares-install`.
3. **Samsung:** installa Tizen Studio con l'estensione TV, crea il certificato Samsung (autore e distributore) con il tuo account, sostituisci `AAAAAAAAAA` in `tizen/config.xml` con l'ID del pacchetto che Tizen Studio genera, poi impacchetta `dist/tizen` come `.wgt`. Per provarlo: TV in «Developer mode» e installazione da Tizen Studio.

## Versione
Il numero va cambiato insieme in tre punti: `webos/appinfo.json`, `tizen/config.xml`, `app/js/core.js` (`build.mjs` lo controlla).
