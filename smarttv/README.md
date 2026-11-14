# Kairos Player per TV LG (webOS) e Samsung (Tizen)

Lettore neutro per le liste dell'utente: link M3U oppure accesso Xtream (server, utente, password).
**L'app non contiene canali, film o indirizzi di contenuti** e non è collegata a nessun servizio: mostra solo ciò che l'utente inserisce.

Versione 0.3.0, messa in regola con la lista di controllo LG. Provata in un browser con server finti: `tv_player.mjs` (28 controlli), `tv_webos.mjs` (TV LG simulato con la libreria ufficiale e il servizio vero, 33), `tv_service.mjs` (16), `tv_lg_rules.mjs` (regole del pacchetto, 14); lato server `srv_tv_pair.mjs` (24). **Non ancora provata su un TV vero.**

## Cosa fa
- Prima apertura: «Aggiungi una lista» (link M3U o accesso Xtream). Un link `get.php?username=…&password=…` viene riconosciuto come accesso Xtream.
- **Dal telefono (0.2.0):** il TV mostra un codice di 6 caratteri, l'indirizzo della pagina e un QR. Chi ha il codice apre la pagina, scrive il codice e la lista, e il TV la riceve in pochi secondi. La pagina è `KP.PAIR + '/tv'` (oggi `store-k.download/tv`).
- Home: TV in diretta, Film, Serie TV, Preferiti, Cerca, Le mie liste, Impostazioni.
- Diretta: categorie, canali, guida «ora / a seguire» (solo Xtream), cambio canale con ▲ ▼ o CH+ / CH−.
- Film e serie: locandine, scheda con trama, stagioni ed episodi, ripresa dal punto in cui si era arrivati.
- Le mie liste: aggiungi, usa, aggiorna, elimina. Più liste, una in uso alla volta.
- Impostazioni: lingua (italiano, inglese), categorie per adulti nascoste finché non si sceglie un PIN, cancellazione di tutti i dati, informazioni e privacy.
- Telecomando: frecce, OK, Indietro, tasti multimediali, puntatore LG. Nella Home, Indietro: sui TV LG torna al sistema del TV (`webOS.platformBack`: da webOS 6 compare la finestra di uscita del TV), sui Samsung chiede conferma e chiude l'app.
- La tastiera del TV si apre solo premendo OK sul campo; l'OK della tastiera passa al campo sotto; Indietro chiude la tastiera.
- Lettore: pulsanti a schermo (diretta: canale prima, canale dopo, chiudi; film: 10 s indietro, pausa/riprendi, 10 s avanti, chiudi) che compaiono muovendo il puntatore; Play e Pausa del telecomando fanno entrambi pausa e ripresa; tempo del film aggiornato ogni secondo.
- Misure da TV: testi di almeno 20 px e pulsanti alti almeno 75 px a 1080p; cerchio di attesa mentre si carica.
- Le liste salvate sul TV non sono in chiaro (mascherate con una chiave casuale del TV).
- In secondo piano la riproduzione si ferma.

## Cosa non fa, di proposito
- Nessun contenuto incluso, nessun elenco di fornitori, nessun codice di attivazione verso un servizio.
- Nessun codice scaricato da fuori, nessuna statistica, nessuna pubblicità, nessun componente di terzi.
- Nessuna funzione che si accende dopo la revisione o che si comporta in modo diverso per chi controlla l'app.
- Si collega solo al server della lista scritta dall'utente (canali, locandine e loghi vengono da lì) e, solo quando si usa «Dal telefono», al server che consegna la lista al TV.

## «Dal telefono»: come passa la lista
- Il TV chiede un codice (`POST /api/tv/pair`) e tiene per sé un segreto.
- La pagina `/tv` manda codice e lista (`POST /api/tv/send`).
- Il TV la ritira una volta sola con il suo segreto (`POST /api/tv/poll`) e la salva su di sé.
- Sul server la lista resta cifrata, al massimo 15 minuti, e si cancella alla consegna. Non crea clienti né dispositivi nel pannello: è solo un passaggio.
- Codice del server: `cloudflare/src/tvpair.js`, tabella `tv_pair` (migrazione 0057).

## Perché sui TV LG c'è un «servizio»
Sui TV LG le app web impacchettate seguono le regole CORS del browser: quasi nessun server di liste le permette, quindi la pagina non potrebbe leggere né la lista M3U né le risposte Xtream. Per questo il pacchetto LG contiene un piccolo servizio JavaScript che gira sul TV (`webos-service/`, nome `com.kairos.player.service`): l'app gli chiede l'indirizzo con la libreria ufficiale LG `webOSTV.js` e lui lo scarica e lo passa all'app a pezzi da 128 KB (fino a 64 MB, segue i reindirizzamenti, decomprime gzip/deflate). Se il servizio non risponde, l'app prova la richiesta diretta. Video, loghi e locandine non passano dal servizio (il lettore e le immagini non seguono le regole CORS). Sui Samsung (privilegio internet) la richiesta è diretta.

## Cartelle
- `app/` — l'app (HTML, CSS, JavaScript ES5: gira anche sui TV meno recenti; controllato da `tv_lg_rules.mjs`)
- `webos/` — `appinfo.json`, icone, schermata di avvio (1920×1080) e libreria ufficiale `webOSTVjs-1.2.13` (licenza Apache 2.0) per LG
- `webos-service/` — il servizio che scarica la lista sui TV LG
- `lg/icon-400.png` — icona 400×400 per la scheda dello store LG
- `store-assets/screens/` — schermate 1920×1080 (inglese e italiano) con la lista di prova dei revisori
- `tizen/` — `config.xml` e icona per Samsung
- `build.mjs` — prepara `dist/webos`, `dist/webos-service` e `dist/tizen`, controlla versioni e nome del servizio
- `docs/STORE.md` — testi e passi per i due store

## Preparare i pacchetti (sul tuo computer)
1. `node build.mjs` (per un altro dominio della pagina «Dal telefono»: `node build.mjs --pair https://tuodominio`)
2. **LG:** installa la webOS CLI di LG, poi `ares-package dist/webos dist/webos-service -o dist` → file `com.kairos.player_0.3.0_all.ipk` (app e servizio insieme). Per provarlo: sul TV installa l'app «Developer Mode», poi `ares-setup-device`, `ares-install` e `ares-launch com.kairos.player`.
3. **Samsung:** installa Tizen Studio con l'estensione TV, crea il certificato Samsung (autore e distributore) con il tuo account, sostituisci `AAAAAAAAAA` in `tizen/config.xml` con l'ID del pacchetto che Tizen Studio genera, poi impacchetta `dist/tizen` come `.wgt`. Per provarlo: TV in «Developer mode» e installazione da Tizen Studio.

## Versione
Il numero va cambiato insieme in quattro punti: `webos/appinfo.json`, `webos-service/package.json`, `tizen/config.xml`, `app/js/core.js` (`build.mjs` lo controlla).

## Lista di prova per i revisori
`https://store-k.download/tv/demo.m3u` (servita da `cloudflare/src/tvpair.js`): cinque titoli della Blender Foundation con licenza Creative Commons Attribuzione 3.0 (Big Buck Bunny e Tears of Steel in HLS dai flussi di prova di Mux; Tears of Steel, trailer di Sintel e di Big Buck Bunny dai server della Blender Foundation). Nessun canale o film di terzi.
