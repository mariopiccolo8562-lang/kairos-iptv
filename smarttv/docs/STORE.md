# Kairos Player — pubblicazione su LG Content Store e Samsung Apps

Regola di fondo: l'app va presentata **per quello che è**, un lettore per le liste dell'utente. Niente descrizioni di comodo,
niente funzioni tenute nascoste a chi fa la revisione. È anche il modo più sicuro di passarla e di non vedersela togliere dopo.

## Cosa copre già l'app (controlli tipici dei due store)
Per LG, dalla 0.3.0, ogni voce della lista di controllo è spiegata in inglese in `docs/LG-SUBMISSION-EN.md` (testi da incollare, scenario di prova, risposte alla lista di autocontrollo, informativa).
- Si usa tutta con il telecomando; il fuoco è sempre visibile; Indietro funziona in ogni schermata. Nella Home: sui TV LG torna al sistema del TV (regola LG), sui Samsung chiede conferma prima di uscire.
- Tastiera del TV solo premendo OK sul campo (regola LG); Indietro mentre si scrive chiude solo la tastiera.
- Puntatore LG (Magic Remote): clic e rotella; nel lettore, muovendo il puntatore compaiono i pulsanti a schermo (canale prima/dopo, 10 s indietro/avanti, pausa, chiudi).
- Play e Pausa del telecomando fanno entrambi pausa e ripresa (regola LG).
- Testi di almeno 20 px e pulsanti alti almeno 75 px a 1080p; cerchio di attesa durante i caricamenti.
- Sui TV LG la lista la scarica il servizio interno dell'app (le app web di webOS seguono le regole CORS): senza, quasi nessuna lista si aprirebbe.
- Le liste salvate sul TV non sono in chiaro.
- 1920×1080, con le stesse proporzioni a 1280×720.
- In secondo piano la riproduzione si ferma; alla riapertura l'app è dove era.
- Errori di rete e di accesso con messaggi chiari, senza schermate bloccate.
- Categorie per adulti nascoste di serie; per mostrarle serve un PIN scelto dall'utente.
- Informazioni e privacy dentro l'app (Impostazioni → Informazioni e privacy).
- Nessun componente di terzi, nessun codice scaricato a distanza, nessuna raccolta di dati.

## Fatto (0.3.0)
- **Lista di prova per i revisori:** `https://store-k.download/tv/demo.m3u` — cinque titoli della Blender Foundation con licenza CC BY 3.0, presi dai loro server e dai flussi di prova di Mux. Nessuna linea del servizio.
- **Schermate** 1920×1080 in inglese e italiano: `store-assets/screens/` (fatte con la lista di prova; nel lettore un video generato).
- **Immagini LG:** icona 80×80 e 130×130, schermata di avvio 1920×1080, icona 400×400 per la scheda (`lg/icon-400.png`).
- **Documenti LG in inglese:** `docs/LG-SUBMISSION-EN.md` (scheda, note per i revisori, scenario di prova, risposte alla lista di autocontrollo, informativa).

## Cosa manca prima dell'invio
1. **Prova su almeno un TV LG vero** con la modalità sviluppatore: riproduzione di HLS, MPEG-TS, MP4 e MKV, tastiera a schermo, tasti multimediali, Magic Remote, uscita e rientro. È l'unico punto che da qui non si può fare.
2. **Account venditore su LG Seller Lounge** e i modelli dei documenti di LG, da compilare con i testi del kit.
3. **Informativa sulla privacy su una pagina web** e un'email di assistenza: servono il tuo nome o la ditta e l'email (il testo è pronto, mancano solo questi dati).
4. **Dominio consigliato:** la pagina «Dal telefono» e la lista di prova oggi sono su `store-k.download`, lo stesso dominio dello Store Kairos. Meglio un dominio neutro solo per il lettore (stesso server, si collega in pochi minuti), poi `node build.mjs --pair https://nuovodominio`.
5. **Samsung:** stato di Partner per pubblicare fuori dagli Stati Uniti (contratto con Samsung, poi richiesta dal portale).

## Descrizione per gli store
**Italiano**
Kairos Player è un lettore multimediale per la tua TV. Aggiungi la tua lista (link M3U oppure accesso Xtream) e guarda canali, film e serie con un'interfaccia semplice pensata per il telecomando: categorie, preferiti, ricerca, guida dei programmi, ripresa dei film da dove eri arrivato, controllo genitori con PIN.
Puoi aggiungere la lista anche dal telefono: il TV mostra un codice e la lista si scrive su una pagina web.
Kairos Player non fornisce e non contiene canali, film o altri contenuti: riproduce solo le liste inserite dall'utente, che deve avere il diritto di guardarle.

**English**
Kairos Player is a media player for your TV. Add your own playlist (M3U link or Xtream login) and watch channels, movies and series with a simple remote-friendly interface: categories, favourites, search, programme guide, resume for movies, parental PIN.
You can also add the playlist from your phone: the TV shows a code and the playlist is entered on a web page.
Kairos Player does not provide or include any channels, movies or other content: it only plays playlists added by the user, who must have the right to watch them.

## Note per i revisori (da incollare nel modulo)
The app is a media player for user-supplied playlists. It ships with no content and connects only to the playlist server entered by the user.
To test: open the app, choose "M3U link", enter the test playlist address below and press Save. The test playlist contains only content licensed for free distribution (Blender Foundation, CC BY 3.0).
Test playlist: https://store-k.download/tv/demo.m3u
(Per LG c'è una versione più completa, con le note sul servizio interno: `docs/LG-SUBMISSION-EN.md`, sezione 3.)
The playlist can also be sent from another device: choose "From your phone", open the page shown on the TV, enter the code and the playlist. The playlist is relayed through our server only to reach the TV: it is stored encrypted for at most 15 minutes and deleted on delivery.
Adult categories are hidden by default and can be shown only after the user sets a parental PIN.
No account is required. No personal data is collected.

## Informativa sulla privacy (da pubblicare su una pagina web)
Kairos Player non raccoglie dati personali. Le liste, i preferiti e le impostazioni restano salvati solo sul TV dell'utente e si cancellano da Impostazioni → Cancella tutti i dati, oppure disinstallando l'app. L'app non usa pubblicità né strumenti di statistica e non invia informazioni a chi l'ha sviluppata. Si collega soltanto al server della lista scelta dall'utente, per leggere l'elenco dei contenuti e riprodurli; quel server riceve, come per ogni collegamento, l'indirizzo IP del TV.
Funzione «Dal telefono»: se l'utente la usa, la lista che scrive sulla pagina web passa dal nostro server per arrivare al TV. Il server la tiene cifrata per il tempo della consegna, al massimo 15 minuti, poi la cancella; l'indirizzo IP di chi chiede il codice serve solo a impedire gli abusi. Titolare del trattamento: (il tuo nome o la tua ditta). Contatto: (la tua email di assistenza). Versione inglese in `docs/LG-SUBMISSION-EN.md`, sezione 8.

## «Dal telefono» va dichiarata
La funzione è scritta nella descrizione, nelle note per i revisori e nell'informativa: chi controlla l'app deve trovarla descritta così com'è. Nell'informativa va indicato chi gestisce il server che consegna la lista.

## Cosa non va fatto
- Mettere nell'app, o far arrivare dopo l'approvazione, liste, codici o indirizzi di un servizio.
- Mostrare ai revisori un comportamento diverso da quello che vedranno gli utenti.
- Scrivere nella scheda che l'app è una cosa diversa da quella che è.
Chi usa l'app con una lista resta responsabile dei contenuti di quella lista: l'app non cambia questo punto.
