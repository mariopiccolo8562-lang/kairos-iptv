# KAIROS — App IPTV + Pannello

| Parte | Dove gira | Cartella |
|---|---|---|
| **App** per Fire TV, Android TV, Google TV, telefoni e tablet (APK) | Compilata da **GitHub** | `android/` + `player/` |
| **Pannello** di gestione + API per le app | **Cloudflare** (Worker + database D1) | `cloudflare/` |

Ogni volta che modifichi qualcosa e la carichi su GitHub:
- l'**APK** viene ricompilato da solo (scheda *Actions*);
- il **pannello** viene ripubblicato da solo su Cloudflare.

---

## 1. Carica il progetto su GitHub

1. Crea un repository **privato** su GitHub, ad esempio `kairos-iptv`.
2. Carica tutti i file di questa cartella: *Add file → Upload files*, oppure con `git push`.

## 2. Prepara i segreti (una volta sola)

1. Su GitHub apri **Actions → "Prepara segreti" → Run workflow**.
2. A fine esecuzione scarica l'allegato `segreti-kairos-DA-ELIMINARE` e apri `LEGGIMI-SEGRETI.txt`.
3. Vai su **Settings → Secrets and variables → Actions → New repository secret** e crea:

| Secret | Valore |
|---|---|
| `ANDROID_KEYSTORE_B64` | il contenuto del file `ANDROID_KEYSTORE_B64.txt` |
| `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_PASSWORD`, `ANDROID_KEY_ALIAS` | i valori del file |
| `ENC_KEY` | dal file (cifra le playlist nel database) |
| `ADMIN_BOOTSTRAP_PASS` | dal file (password del primo accesso al pannello) |

4. Conserva una copia di `release.jks` e del file dei segreti in un posto sicuro, poi **elimina l'esecuzione** del workflow.

> ⚠️ Se perdi la chiave di firma non potrai più aggiornare l'app sui dispositivi dei clienti. Se cambi `ENC_KEY` le playlist salvate non saranno più leggibili.

## 3. Collega Cloudflare

1. Su Cloudflare: **My Profile → API Tokens → Create Token**, modello **"Edit Cloudflare Workers"**. Aggiungi anche il permesso **Account → D1 → Edit** e crea il token.
2. Copia l'**Account ID** (lo trovi nella home del tuo account Cloudflare, colonna a destra).
3. Su GitHub crea i secret `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID`.
4. **Actions → "Pannello Cloudflare" → Run workflow**. Il workflow crea il database, le tabelle e pubblica il pannello.
5. Il pannello sarà su `https://kairos-panel.<tuo-sottodominio>.workers.dev/panel/`.
6. Primo accesso: utente `admin`, password = `ADMIN_BOOTSTRAP_PASS`. **Subito dopo:**
   - cambia la password da *Impostazioni → Account amministratore*;
   - attiva la **verifica in due passaggi** da *Impostazioni → Sicurezza*.

**Dominio personalizzato (consigliato).** Se hai un dominio su Cloudflare, togli il `#` dalla riga `routes` in `cloudflare/wrangler.toml` e metti il tuo indirizzo, ad esempio `tv.tuodominio.it`. Ti serve anche per Cloudflare Access (punto 5).

## 4. Compila l'app

1. Su GitHub: **Settings → Secrets and variables → Actions → Variables**, crea:
   - `KAIROS_SERVER_URL` = l'indirizzo del pannello **senza** `/panel`, ad esempio `https://tv.tuodominio.it`;
   - facoltative: `APP_NAME` (nome sotto l'icona, predefinito "KAIROS") e `APP_ID` (es. `it.miotv.player`, da non cambiare più dopo la prima pubblicazione).
2. Per pubblicare una versione: **Releases → Draft a new release**, tag `v1.0.0`, poi *Publish*. Dopo pochi minuti l'APK `kairos.apk` compare allegato alla release.
3. Il link fisso all'ultima versione è sempre:
   `https://github.com/TUO-UTENTE/kairos-iptv/releases/latest/download/kairos.apk`

   > Se il repository è **privato**, i clienti non possono scaricare da GitHub. In quel caso carica l'APK sul tuo store Kairos o su un hosting pubblico, e metti quel link in *Impostazioni → Link download APK*.
4. Crea il codice **Downloader** (su aftv.news) che punta a quel link, e scrivilo in *Impostazioni → Codice Downloader* del pannello.

## 5. Protezioni Cloudflare (dashboard)

Il pannello ha già le sue protezioni interne (vedi `SICUREZZA.md`). Queste aggiungono un secondo muro davanti:

1. **Cloudflare Access (Zero Trust)**. Richiede un dominio personalizzato.
   - Zero Trust → Access → Applications → *Add application → Self-hosted*.
   - Domini: `tv.tuodominio.it/panel` **e** `tv.tuodominio.it/api/admin` (aggiungi anche `tv.tuodominio.it/api/public`).
   - ⚠️ Non proteggere tutto il dominio: le app dei clienti usano `/api/player`.
   - Policy: *Allow* solo la tua email, con codice via email o login Google.
   - Copia l'**Application Audience (AUD) Tag**. Su GitHub crea le variabili `ACCESS_AUD` (quel valore) e `ACCESS_TEAM_DOMAIN` (es. `tuoteam.cloudflareaccess.com`).
   - Rilancia "Pannello Cloudflare". Da quel momento il Worker verifica anche lui il token di Access: chi aggira Cloudflare viene comunque bloccato.
2. **Turnstile** (anti-bot sulla pagina di accesso).
   - Dashboard → Turnstile → *Add widget* con il dominio del pannello.
   - Variabile `TURNSTILE_SITEKEY` = la Site Key; secret `TURNSTILE_SECRET` = la Secret Key. Poi rilancia il workflow.
3. **Security → WAF** del dominio:
   - ⚠️ **Bot Fight Mode: SPENTO.** Blocca anche le richieste delle app (che non possono risolvere le sfide anti-bot) e l'app non si collega più al pannello.
   - Security Level **Medium** (non High, per lo stesso motivo).
   - regola personalizzata 1 — *se URI Path inizia con `/api/player` → **Skip*** (salta: Security Level, Browser Integrity Check, regole successive): così le app non vengono mai bloccate;
   - regola personalizzata 2 — *se URI Path contiene `/panel` e Paese non è Italia → Block* (adatta i paesi alle tue esigenze).
4. **SSL/TLS**: modalità *Full (strict)*, **Always Use HTTPS** attivo, **HSTS** attivo, TLS minimo 1.2.

## 6. Aggiornamento automatico dell'app (una volta sola)

Così ogni nuova versione arriva da sola su tutte le TV, senza scrivere nulla nel pannello.

1. Su GitHub: foto profilo → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
   - Nome: `kairos-store`, scadenza: 1 anno
   - Repository access: **Only select repositories** → `kairos-store`
   - Permissions → Repository permissions → **Contents: Read and write**
   - Genera e copia il token
2. Nel repository **kairos-iptv** → Settings → Secrets and variables → Actions → **New repository secret**: nome `STORE_TOKEN`, valore il token copiato.
3. (Solo se lo store ha un nome diverso da `kairos-store`) nella scheda *Variables* crea `STORE_REPO` = `tuo-utente/nome-store`.

Da quel momento, quando pubblichi una versione (tag `v1.5.0`, `v1.6.0`, …):
- l'APK viene copiato nella release fissa **kairos-tv** dello store (pubblica) con il file `kairos-tv.json`;
- il pannello lo legge da solo (Impostazioni mostra "Aggiornamento automatico attivo");
- le app installate propongono l'aggiornamento all'avvio e ogni 3 ore se restano accese.

Link fisso dell'APK da usare ovunque (Downloader, store, sito):
`https://github.com/TUO-UTENTE/kairos-store/releases/download/kairos-tv/kairos-tv.apk`

L'interfaccia (grafica e funzioni) si aggiorna comunque da sola a ogni pubblicazione, anche senza nuovo APK.

## 7. Kairos Store aperto (come IBO Player)

Lo store è **aperto**: chi installa Kairos Store vede subito tutte le app, preme **Installa** e il download parte. Non c'è più il codice del venditore all'avvio, non c'è più «Richiedi autorizzazione», non ci sono blocchi dopo codici sbagliati, né per te né per gli agenti.

**Come si lavora con un cliente nuovo** (vale per te e per gli agenti)
1. Il cliente installa **Kairos Store** (codice Downloader in alto nel pannello, oppure `https://panel-kairos.com/get/store.apk`).
2. Apre lo store e installa subito le app che vuole.
3. Apre l'app Kairos e ti manda la **foto del codice** che vede sulla TV.
4. Tu (o l'agente) attivi quel codice dal pannello con **+ Nuovo cliente**: l'attivazione delle app Kairos è quella di sempre.

**Riepilogo store** (pannello → *App e Store* → **Riepilogo store**, solo tu): store installati (quelli che si sono aperti almeno una volta), store usati negli ultimi 30/7 giorni e oggi, download degli ultimi 30 giorni (anche per giorno e per app), ultimi download con dispositivo e paese, elenco degli store con versione, e le regole dell'**App consigliata** (il pulsante dello store che propone l'app adatta al dispositivo). I numeri arrivano da soli: lo store avvisa il pannello quando si apre e quando parte un download; se il pannello non risponde, lo store scarica lo stesso.

**Store già installati con la versione vecchia** (fino alla 1.0.129, quelli che chiedevano il codice): funzionano subito, senza aspettare l'aggiornamento.
- La pagina dello store la prendono da GitHub Pages a ogni apertura: vedono subito quella nuova, senza codice, e la pagina spegne anche il blocco dei download che l'APK vecchio ricordava.
- Se un APK vecchio mostra comunque la sua copia interna (per esempio GitHub non raggiungibile), il pannello approva **all'istante** ogni richiesta, accetta **qualunque codice** (anche nella schermata «Attiva lo store») e non blocca nessuno store; le richieste rimaste «in attesa» da prima si approvano da sole appena lo store le ricontrolla.
- In più lo store si aggiorna da solo alla versione nuova (controlla le release su GitHub a ogni apertura e ogni 30 minuti).

**Cosa è sparito dal pannello**: la pagina «App da approvare / Download store» (richieste, Autorizza/Rifiuta/Revoca, dispositivi bloccati, «senza limiti», codici e tetti degli store per agente, orari di chiusura dello store, avvisi email/SMS/Telegram delle richieste), le richieste dello store nella campanella, l'interruttore «Approvazione download store» nella Panoramica, il codice venditore nella barra in alto e nella scheda degli agenti, i permessi «Download store» degli agenti e il tempo di attesa tra un download e l'altro. Gli agenti non vedono più nulla dello store: i download non sono intestati a nessuno.

> Le impostazioni vecchie (codici venditore, tetti, email, numeri SMS, dispositivi bloccati) restano salvate nel database ma non vengono più usate. I segreti `RESEND_KEY`, `TWILIO_*` e `TELEGRAM_BOT_TOKEN` non servono più allo store: puoi lasciarli o toglierli.

**Se usi le regole WAF del punto 5**, lascia `/api/store` nella regola 1 (*URI Path inizia con `/api/player` **oppure** inizia con `/api/store` → Skip*): serve allo store per i conteggi e all'App consigliata.

## 8. Account dei clienti: più dispositivi, profili, VPN, privacy

Tutto dal pannello, nella scheda del dispositivo (**Dispositivi → matita**):
- **Connessioni massime**: quanti dispositivi può usare lo stesso abbonamento (il principale compreso). Il cliente collega una nuova TV dall'app: sul dispositivo già attivo genera un **codice a 6 cifre** (vale 10 minuti, una sola volta) e lo scrive sulla nuova TV, che mostra il suo codice di attivazione. In alternativa apri tu la nuova TV "in attesa" e premi **Collega a un cliente**. Le TV collegate usano scadenza, playlist e profili del principale; **Scollega** le rimette "in attesa".
- **Profili massimi** e **Profili personali** (nome, avatar 1–12, profilo bambini, playlist): i clienti li creano dall'app dopo l'attivazione, oppure li crei tu. **Blocca modifica profili** impedisce al cliente di cambiarli.
- **VPN**: *Disattivata*, *Consentita* (il cliente la accende dall'app) o *Sempre attiva*. La configurazione **WireGuard** si incolla in *Impostazioni* (vale per tutti) oppure nella scheda del singolo dispositivo; dopo il salvataggio resta cifrata e non viene più mostrata. Meglio una configurazione (chiave) diversa per ogni dispositivo: la stessa chiave usata da due TV insieme fa cadere la connessione.

In **Impostazioni** trovi anche il **prezzo** mostrato ai clienti e il testo **Privacy e condizioni**, che l'app mostra prima del codice di attivazione ed è pubblicato su `https://IL-TUO-PANNELLO/privacy`. Se lasci il testo vuoto viene usato un **modello predefinito generico**: fallo verificare da un professionista (avvocato o consulente privacy) e completalo con i tuoi dati ("Usa il modello" lo copia nel campo per modificarlo).

**Film e serie di tendenza** nell'app: arrivano da soli dalle classifiche Apple iTunes Italia (nessuna chiave). Facoltativo: per le tendenze di TMDB crea una chiave gratuita su themoviedb.org (*Impostazioni → API*) e salvala su GitHub come secret `TMDB_KEY`, poi rilancia "Pannello Cloudflare".

**Aggiornamenti**: con l'aggiornamento automatico (punto 6) non serve scrivere nulla. Se scrivi a mano una versione in *Impostazioni*, il pannello calcola da solo il codice (1.5.0 → 10500, come la build) e la usa solo se è **più nuova** di quella automatica; se è più vecchia ti avvisa e la ignora.

## 9. Novità 1.8 nel pannello

- **Online ora**: chi ha l'app aperta e cosa guarda (canale, programma, film/serie), risoluzione, fps, bitrate, interruzioni, rete (Wi-Fi con segnale, cavo, mobile), ultimo speed test, IP, città e paese, versione dell'app, modello, profilo, VPN (con **Spegni VPN**). Avvisi se lo stesso cliente cambia IP o si collega da un paese diverso. In fondo i contenuti più visti oggi. I dati di rete e riproduzione arrivano dall'APK 1.8.
- **Segnalazioni** e **Richieste contenuti**: sezioni separate con il numero delle nuove nel menu (non più solo in *Attività*). Segna come vista/fatta o elimina.
- **Videoteca**: film e serie delle playlist Xtream, con locandine, categorie e ricerca.
- **Server DNS e VPN**: l'elenco dei server usati dai clienti. *Cambia per tutti* sposta tutti i clienti di un server su un nuovo indirizzo; *Seleziona i clienti* ti fa scegliere un gruppo (es. 1-5 su X, 6-8 su Y). Cambia solo l'indirizzo: utente, password e playlist restano uguali e l'app aggiorna gli indirizzi da sola entro un minuto, **senza ricaricare la lista**. Nella stessa pagina aggiungi le **località VPN** (una configurazione WireGuard per località); poi nella scheda del cliente scegli quale usa.
- **Scheda del cliente**: *Visioni contemporanee* (quanti video insieme sullo stesso abbonamento, 0 = nessun limite), *Località VPN*, **Permessi** (segnalazioni, richieste, profili, collegare dispositivi, registrazioni, speed test, VPN, guida TV personale, playlist locali) e **Genera codice di collegamento** per collegare tu una nuova TV.
- **Home**: i riquadri (attivi, in attesa, in scadenza, visti) aprono la pagina corrispondente.
- **Profili obbligatori**: dopo l'attivazione il cliente deve creare un profilo prima di entrare. Se non ci riesce (o gli hai tolto il permesso), crealo tu nella scheda: l'app entra da sola appena è pronto.
- **Trailer**: nella scheda di film e serie c'è il pulsante *Trailer* (anteprime ufficiali trovate online, nessuna chiave da configurare).

## 10. Novità 1.9

- **Accesso al pannello**: resta valido 30 giorni dall'ultimo uso e si rinnova da solo; ricaricando la pagina non chiede più la password. *Impostazioni → Chiudi le altre sessioni* scollega gli altri browser.
- **Server DNS**: in *Server DNS e VPN* salvi i DNS dei tuoi fornitori anche se nessun cliente li usa. Per cambiarli: **1** scegli il DNS da sostituire, **2** spunta i clienti (o «Seleziona tutti»), **3** scegli il nuovo DNS. Prima di confermare vedi chi cambia. Cambia solo l'indirizzo del server: utente, password e playlist restano uguali. Se un cliente ha più playlist su server diversi, cambia solo quella sul DNS scelto.
- **Più playlist per cliente** (scheda del cliente): *Unite* (tutto insieme, ogni contenuto ha la **sigla colorata** della sua playlist; la sigla si scrive accanto al nome della playlist) oppure *Divise* (una alla volta, con la *Playlist da usare*). Permessi: **Cambiare playlist** (pulsante vicino a «Guida TV») e **Aggiungere, modificare ed eliminare playlist** (le sue nell'app, e nascondere le tue).
- **API e integrazioni**: crei chiavi API (complete o di sola lettura) per collegare gestionali, bot o siti a `https://IL-TUO-PANNELLO/api/v1`, con le stesse funzioni del pannello (attivare, rinnovare, disattivare per codice, DNS, messaggi, segnalazioni…). Le password delle playlist non escono mai dall'API. Il **webhook** avvisa il tuo server (nuovo dispositivo, attivazione, segnalazione, richiesta) con firma HMAC. La guida è nella pagina stessa.
- **Trailer**: cercati su TMDB (se hai il segreto `TMDB_KEY`), poi YouTube, poi Apple. Con l'APK 1.9 i trailer di YouTube si guardano dentro l'app (OK pausa, ◀ ▶ ±10 s); se un video non si può incorporare si apre l'app YouTube.
- **App**: nuovo marchio vettoriale che si disegna all'avvio; scadenza dell'abbonamento sempre in alto; dopo un canale scelto da un evento si torna alla lista «Dove vederla».
- **Fluidità (Fire TV)**: la playlist viene analizzata in un thread separato (l'interfaccia non si blocca più durante il caricamento), le righe della home e la lista canali tengono nel DOM solo ciò che serve, i tasti tenuti premuti vengono accorpati (niente ritardo accumulato), il player apre la lista canali senza analizzarla due volte, la finestra del player è opaca durante la visione e VLC non blocca più l'interfaccia al cambio canale. Per avere tutto serve l'APK 1.9.

## 11. Novità 2.0

- **Dispositivi a schede**: in alto i riquadri *Tutti, Attivi, In scadenza (entro 14 giorni), Da attivare, Scaduti, Disattivati* con il numero e il filtro con un clic. Ogni cliente è una scheda con iniziale colorata, stato, barra della scadenza (gialla/rossa quando manca poco), modello, ultimo accesso, connessioni usate, playlist, dispositivi collegati e note, più i pulsanti **+1 mese**, **+12 mesi**, **Disattiva/Riattiva**. I codici in attesa stanno in un riquadro a parte con **Attiva** e **Collega a un cliente**. Ricerca per nome, codice, note o modello e ordinamento (scadenza, nome, ultimo accesso, aggiunti di recente). Con *Elenco* torni alla tabella di prima; la scelta resta ricordata.
- **Scheda del cliente a sezioni numerate**: *1 Cliente, 2 Abbonamento, 3 Playlist, 4 Lettore, 5 Account e profili, 6 VPN, 7 Permessi, 8 Note*, con la barra in alto che salta alla sezione e si illumina mentre scorri.
- **Lettore per cliente** (sezione *Lettore*): per *TV in diretta*, *Film* e *Serie TV* scegli **Sceglie il cliente** (come prima), **Automatico**, **ExoPlayer** o **VLC**. L'app lo applica entro un minuto, senza riavviare; nelle impostazioni dell'app quella voce appare bloccata con «scelto dal fornitore». Se durante la visione il cliente cambia lettore dal menu del player vale solo per quella visione.
- **Impostazioni a schede**: *Aspetto, App, Aggiornamenti, Prezzo e privacy, VPN generale, Sicurezza*. Ogni campo ha la sua spiegazione; le schede con modifiche non salvate hanno un pallino e la barra **Salva impostazioni** resta sempre in fondo. Le voci tecniche (versione manuale, indirizzo del server) sono in *Opzioni avanzate*.
- Il database si aggiorna da solo al primo deploy (migrazione `0007_player.sql`). Il lettore scelto dal pannello funziona già con l'APK 1.9.1 (è nell'interfaccia che si aggiorna da sola); la release 2.0.0 serve per avere tutto nell'APK.

### 2.0.1 — Fire TV: immagine ferma con audio che continua; scorrimento rapido

- **Fire TV Stick 3ª gen (AFTSSS), Stick Lite 2020 e Stick HD 2024 (AFTSS), Stick 4K 2018 (AFTMM)**: all'apertura di un canale l'immagine restava ferma mentre l'audio proseguiva. Il video passa dall'anteprima allo schermo intero cambiando la superficie del decoder senza ricrearlo e il chip MediaTek MT8695 di queste chiavette non lo regge. ExoPlayer ha il rimedio (decoder ricreato nel passaggio) ma lo applica solo a modelli Amazon più vecchi: ora vale anche per questi tre. Il rimedio costa 1-3 s all'apertura (si aspetta il keyframe successivo), perciò **non** viene applicato alle chiavette nuove (4K Max, 4K/4K Max 2ª gen, Cube) né ad altri dispositivi.
- **Rete di sicurezza che impara**: su qualsiasi dispositivo, se dopo il passaggio a schermo intero il video non si disegna entro 2,5 s mentre l'audio va, l'app ricarica il canale e **si ricorda** che quel dispositivo ha il problema: dalle aperture successive applica il rimedio solo lì.
- **Scorrimento rapido in film e serie**: con il tasto tenuto premuto le righe scorrono senza animazione, il riquadro grande in alto aspetta che ci si fermi prima di caricare l'immagine di sfondo, e i dettagli del titolo (trama, cast) vengono chiesti al server solo dopo una sosta vera, non a raffica a ogni titolo attraversato.
- **Speed test M-Lab**: il test usa ora i server di M-Lab (protocollo NDT7, lo stesso del test "velocità internet" di Google): il server più vicino lo sceglie il servizio pubblico `locate.measurementlab.net`, senza chiavi né pagine esterne. Un solo flusso, come prevede il protocollo: sulle chiavette con poca CPU la cifratura non abbassa più il risultato. Se M-Lab non risponde, riserva su Cloudflare con poche connessioni sulle chiavette lente (AFTSSS, AFTSS, AFTMM, AFTT). Nuova schermata: quadrante circolare con scala, numero grande, fasi evidenziate, riquadri latenza/jitter/download/upload, etichetta del server (es. «M-Lab · Milan (IT)»); su telefono si dispone in colonna. La libreria OkHttp è usata solo per il WebSocket del test.
- Serve l'APK 2.0.1 (lo scorrimento e la nuova schermata sono già nell'interfaccia che si aggiorna da sola; il motore M-Lab è nell'APK).

### 2.0.2 — Disconnetti e vista Tabella

- **Disconnetti** (pannello → *Dispositivi*, scheda del cliente, *Online ora*, azioni di gruppo, API `POST /api/v1/devices/{codice}/kick`): interrompe la visione in corso su quel dispositivo entro una ventina di secondi; l'app chiude il player, torna alla home e mostra «Visione interrotta dal tuo fornitore». L'abbonamento **resta attivo** (per bloccarlo c'è *Disattiva*). Dal cliente principale vale anche per i suoi dispositivi collegati. L'ordine vale 3 minuti: chi riapre l'app più tardi non viene buttato fuori. Durante la visione l'app ora controlla ogni 20 s (nei menu ogni 60 s); il server riscrive i dati di presenza al massimo una volta al minuto se non cambia niente, quindi le scritture sul database restano quelle di prima. Il player a schermo intero si chiude da solo con l'APK 2.0.2; con APK precedenti si interrompe al ritorno nell'app.
- **Vista Tabella** in *Dispositivi* (oltre a *Schede* ed *Elenco*, la scelta resta ricordata): una riga per cliente con i dispositivi collegati sotto, codice copiabile con un clic, stato, scadenza con giorni mancanti, connessioni usate, modello e ultimo accesso, playlist, **nota modificabile direttamente nella riga**, e azioni rapide (+1 mese, +12 mesi, Disconnetti, Disattiva/Riattiva, Scheda, Elimina). Con le caselle selezioni più clienti (o tutti) e applichi in un colpo +1 mese, +12 mesi, Disconnetti, Disattiva o Riattiva. Comoda quando i clienti sono tanti; le *Schede* restano per quando sono pochi.

### 2.0.3 — Recupero automatico, qualità adattiva, diagnostica ed «Errori applicazione»

- **Recupero automatico durante tutta la visione** (APK 2.0.3): l'app si accorge da sola di tre situazioni — *immagine ferma con l'audio che va avanti* (ExoPlayer: nessun fotogramma nuovo per 4 secondi mentre il tempo avanza), *caricamento che si ripete* (3 blocchi in 75 secondi o un blocco di oltre 12 secondi) ed *errore del lettore* — e prova le soluzioni in ordine senza far uscire il cliente: ricarica, decodifica software, l'altro lettore (ExoPlayer ↔ VLC), formato alternativo (HLS/TS), versione più leggera del canale. Un piccolo avviso dice cosa sta facendo; film e serie ripartono dal punto in cui erano. Sui dispositivi che non hanno problemi non cambia nulla: niente secondi in più all'apertura, il controllo scatta solo quando il problema c'è davvero.
- **Qualità adattiva** (*Impostazioni → Lettore → Qualità adattiva automatica*, accesa di base): l'app riconosce lo stesso canale nelle sue versioni (4K / FHD / HD / SD) nella stessa playlist; se la linea non regge passa da sola alla versione più leggera («Qualità ridotta per la tua connessione»), e dopo 6 minuti senza blocchi riprova quella piena (se torna a bloccarsi resta ridotta). Dopo un calo, per 10 minuti i canali partono già nella versione più leggera. Le versioni HEVC non vengono mai usate come ripiego per canali che non lo sono (sono più pesanti da decodificare). Se il canale arriva in HLS con più qualità, ExoPlayer si adatta già da solo senza pause.
- **Diagnostica in *Online ora***: per chi sta guardando, codec del canale (H.264, HEVC, MPEG-2…), decodifica hardware o software, blocchi nell'ultima ora, fotogrammi persi, qualità ridotta in corso, ultimo recupero automatico e un'indicazione del **probabile problema**: *dispositivo* (immagine ferma o errori del decoder), *canale* (lo stesso contenuto ha problemi su più dispositivi), *linea* (Wi-Fi debole, velocità vicina a quella del canale, rete mobile) o *linea o server*.
- **Nuova voce «Errori applicazione»** nel menu del pannello, con il numero di quelli nuovi: ogni problema con data, cliente, dispositivo, contenuto, lettore, codec, errore, cosa ha fatto l'app ed esito (*risolto da solo*, *non risolto*, *il cliente è uscito*). Filtri per tipo ed esito, ricerca, riepiloghi *contenuti con più problemi* (segnati «canale» se su più dispositivi) e *dispositivi con più problemi* (segnati «dispositivo» se su più contenuti). Si svuota a mano e si cancella da solo dopo 7 giorni. Anche via API: `GET /api/v1/app-errors`.

## 12. Novità 2.1

**Contenuti**
- **Età consigliata** su film e serie (T, 6+, 14+, 18+, con colore): nel riquadro grande della home e nella scheda del titolo. Viene dalla playlist (Xtream) o da TMDB (classificazione italiana, altrimenti quella americana convertita).
- **Contenuti speciali** nella scheda: dietro le quinte, clip, speciali, papere e teaser da YouTube, aperti a schermo intero nell'app.
- **Già guardato**: spunta su poster ed episodi (si segna da solo a fine visione o dal menu del tasto OK tenuto premuto). **Coda di riproduzione** («La tua coda» in home: i titoli partono uno dopo l'altro). **Consigliati per te** in base a cosa guardi.
- **Tag personali** (righe in home e categorie in TV), **nomi delle categorie personalizzati**, **ordine personalizzato** di categorie e preferiti (*Impostazioni → Organizza*), canali dalla A alla Z, dalla Z alla A o per data di aggiunta, **informazioni modificabili** (titolo, anno, copertina, trama) con ritorno agli originali.
- **Cerca per attore**: nella ricerca compaiono i titoli della playlist in cui ha recitato.
- **Guida TV**: **assegnazione EPG manuale** per i canali senza guida, **promemoria** sui programmi (avviso con *Guarda* quando iniziano).
- **PIN per singola playlist** (*Impostazioni → PIN delle playlist*).

**Lettore (APK 2.1.0)**
- **Salta intro** sulle serie: segni una volta inizio e fine della sigla (pulsante *Intro* nel lettore) e vale per tutti gli episodi; pulsante «Salta intro» o salto automatico.
- **Immagine nell'immagine** (PiP) con il tasto Home, dove il dispositivo lo supporta.
- **Multi-schermo**: 2 o 4 canali insieme (menu del tasto OK su un canale); l'audio segue il riquadro selezionato, OK cambia canale o lo apre a schermo intero. Permesso *Multi-schermo* nel pannello.
- **Assistente IA** (menu del tasto OK e Guida TV): domande sul titolo («di cosa parla?», «è adatto ai bambini?») senza anticipazioni, con Claude. Permesso *Assistente IA* nel pannello, massimo 40 domande al giorno per dispositivo.
- **Temi nuovi**: oro, smeraldo, oceano, tramonto, viola, rosa.

**Da impostare (facoltativo)**
- Età consigliata, contenuti speciali e ricerca per attore usano lo stesso segreto `TMDB_KEY` dei trailer: senza, quelle voci semplicemente non compaiono.
- Assistente IA: vedi la sezione **15** (Cloudflare Workers AI; Gemini resta solo come riserva facoltativa con il segreto `GEMINI_API_KEY`).
- **Google Cast non è incluso**: le Fire TV non hanno i Google Play Services, quindi il pulsante non funzionerebbe sui dispositivi dei clienti.

**Controllo e fluidità**
- Interfaccia più leggera: i lettori web (hls.js, mpegts.js) e i caratteri non bloccano più l'avvio (nell'app non servono), ordinamenti e filtri calcolati una volta sola e riusati, copertina della home senza ordinare tutta la libreria, impostazioni lette dalla memoria, archivi locali (posizioni, durate, loghi) con un limite, attivazione controllata ogni 12 s senza richieste sovrapposte, effetti di vetro tolti anche dai badge in modalità leggera.
- Correzioni: nomi strani nel menu del tasto OK, scheda che perdeva gli episodi quando arrivava l'età consigliata, contenuti dimostrativi mai mandati al lettore, guida XMLTV rovinata che bloccava lo stato «Scarico…», anteprima che copriva la finestra di uscita in Guida TV.
- App Android: WebView di sistema in aggiornamento o chiusa dal sistema → messaggio o ripartenza invece di un crash; trailer in pausa con il tasto Home; OK premuto due volte non apre più due lettori; in secondo piano il lettore non fa più lavoro ogni secondo; aggiornamento APK: download interrotto, file rovinato o di un'altra app rifiutati con un messaggio chiaro, niente passaggio da https a http, il vecchio file viene cancellato.
- Server: la cache di trailer, età e attori salva i «non trovato» solo per dispositivi registrati (titoli inventati non riempiono il database); l'API non restituisce mai password delle playlist (anche dopo *Cambia DNS* o una modifica) e un `PUT` con le playlist **conserva password e indirizzi** delle playlist esistenti invece di cancellarli; corpo `null` → errore 400 invece di 500; limite degli errori dell'app contato per problema; meno query in *Online ora* e nel controllo delle visioni contemporanee; il pannello non interroga il server con la scheda nascosta.
- Serve la release **2.1.0** per la parte nativa (salta intro, PiP, multi-schermo, correzioni Android); il resto arriva da solo con l'interfaccia.

### 2.1.1 — Pacchetti avatar e più playlist

- **48 avatar in 4 pacchetti**: *Classici*, *Animali* (gatto, cane, volpe, gufo, pesce, farfalla, coniglio, tartaruga, pinguino, leone, balena, ape), *Sport* (calcio, basket, tennis, coppa, bici, auto da corsa, medaglia, bersaglio, golf, pesi, scarpa, ping pong) e *Spazio* (razzo, pianeta, luna, astronauta, disco volante, stella cadente, satellite, sole, costellazione, telescopio, alieno, scintille). Nell'app si scelgono a schede nella modifica del profilo; nel pannello l'elenco degli avatar è diviso per pacchetto. Disegnati dentro l'app: niente da scaricare.
- **Fino a 100 playlist per cliente** (prima 20).
- Arriva da sola con l'interfaccia e il pannello: non serve un APK nuovo.

## 13. Novità 2.2 — Store add-on

**Nell'app** (*Impostazioni → Store add-on*), come uno store vero: elenco diviso in *Film e serie TV*, *Festività ed eventi*, *Skin colorate*, *Pacchetti avatar*, con filtri, emblema, descrizione e a destra lo stato (**✓ Tuo**, **● In uso**, il **prezzo** o 🔒). Aprendo un add-on: anteprima della scena, colori, avatar inclusi e **Applica il tema** (se è tuo) oppure **Richiedi al fornitore** (la richiesta arriva nel pannello in *Richieste*, tipo «🧩 Add-on»).
- **24 temi speciali** (colori di tutta l'app + scena di sfondo disegnata + 4 avatar esclusivi): Regno di Ghiaccio, Terra dei Draghi, Accademia di Magia, Lega degli Eroi, Città Cyber, Saga Vichinga, Dei dell'Olimpo, Notti al Neon, Mari dei Pirati, Frontiera Western; Halloween, Día de los Muertos, Natale, Capodanno, San Valentino, Carnevale; e 8 in stile **Videogiochi**: Regni Fantasy (gioco di ruolo), Gran Premio (corse), Galassia Arcade (sparatutto spaziale), Pixel Retrò (8 bit), Isola della Sfida (battle royale), Città Abbandonata (horror di sopravvivenza), Torneo dei Campioni (picchiaduro), Giungla Perduta (avventura). Sono **originali**, ispirati ai generi: nessun personaggio, attore o immagine di film e serie (sono protetti da diritti).
- **8 skin colorate**: Rubino, Zaffiro, Ambra, Giada, Lavanda, Corallo, Grafite, Menta. Si scelgono anche da *Generali → Colore*.
- **Pacchetti avatar**: Animali, Sport, Spazio (12 ciascuno) + i 4 avatar di ogni tema. Nella modifica del profilo compaiono solo i pacchetti che il cliente ha.
- **I temi si scaricano solo se il cliente li ha**: scena e avatar di ogni tema stanno sul server (un file per tema in `cloudflare/public/privato/temi/`, letto dal Worker solo quando serve e mai raggiungibile dal web) e l'app li chiede solo per i temi che le hai dato (il server controlla codice, abbonamento e assegnazione). Se togli un tema, l'app lo cancella dal dispositivo. Nello store i temi non posseduti mostrano solo nome, descrizione, colori e prezzo. Skin colorate (3 colori) e pacchetti avatar Animali/Sport/Spazio restano nell'app.
- **Immagini realistiche** (generate dal fornitore con Gemini, personaggi inventati): sfondo e avatar dove ci sono, al posto dei disegni; dove mancano restano i disegni. Sfondi fotografici per Regno di Ghiaccio, Terra dei Draghi, Accademia di Magia, Lega degli Eroi, Città Cyber, Saga Vichinga, Dei dell'Olimpo, Frontiera Western, Halloween; avatar per quasi tutti i temi. Sul dispositivo stanno nella memoria interna dell'app (IndexedDB). Il server accetta anche immagini caricate per tema (API `PUT /api/admin/addon-media/{tema}/{bg|a1..a4}`, tabella `addon_media`, migrazione `0011`), che hanno la precedenza su quelle incluse.
- La scena è un'immagine fissa (al posto delle luci animate dello sfondo), quindi non pesa durante lo scorrimento.

**Nel pannello**
- *Impostazioni → Store add-on*: per ogni add-on **Tutti i clienti / Solo a chi lo assegno / Nascosto**, il **prezzo** da mostrare (facoltativo) e quanti clienti lo hanno. Pulsante proprio **Salva add-on**.
- Scheda del cliente, nuova sezione **Add-on**: interruttori per dare o togliere ogni add-on (quelli «per tutti» sono già accesi). I dispositivi collegati usano quelli del cliente principale.
- Vista *Tabella* in *Dispositivi*: seleziona più clienti → **🧩 Add-on** → per ognuno *Dai* o *Togli*.
- API: campo `addons` (elenco di id) in `GET/PUT /api/v1/devices/{codice}`.
- Il cliente vede le modifiche entro un minuto (il battito dell'app se ne accorge). Se togli un tema in uso, l'app torna al colore base.
- Il database si aggiorna da solo al primo deploy (migrazione `0010_addons.sql`). Arriva con l'interfaccia: non serve un APK nuovo.
- Non incluso: **cambio dell'icona dell'app** (serve un APK nuovo e su Fire TV il launcher non sempre la aggiorna).

**Correzioni**: icona mancante della voce «Organizza» nelle impostazioni dell'app; *Permessi a gruppi* con più di 50 dispositivi non superava più il limite di query del piano gratuito.

### 2.2.1 — Pannello più semplice, niente PiP

- **Dispositivi**: schede dei clienti senza quadratini colorati con l'iniziale (anche in tabella e nella scheda), una sola riga di dettagli e due pulsanti: **Rinnova** (mostra +1, +3, +6, +12 mesi) e **Modifica** (scheda completa). Clic sulla scheda = modifica veloce laterale; *Disconnetti* e *Servizio attivo* sono lì. Riquadri in alto senza emoji.
- **Scheda cliente** a pagina intera per creare e modificare tutto; la finestra laterale resta per le modifiche veloci (nome, attivo, scadenza, note).
- **Anteprima dei temi**: aprendo un tema non ancora attivo, il cliente vede in piccolo lo sfondo e i 4 avatar (miniature a bassa risoluzione, endpoint `/api/player/addon-preview`, mai per i temi nascosti). Il tema completo si scarica e si applica solo dopo che il fornitore l'ha assegnato, come prima.
- **Immagine nell'immagine (PiP) tolta**: sparisce l'opzione dalle impostazioni dell'app e il lettore non la usa più (subito con l'interfaccia; dall'APK 2.2.1 anche nel lettore).

## 14. Novità 2.3 — Agenti (reseller) e pannello più sobrio

Solo server e pannello: **non serve un nuovo APK**.

- **Agenti**: nuova voce *Utenti → Agenti*. Crei un agente con nome utente, password ed email; scegli **clienti massimi**, **connessioni per cliente**, **accesso** (*Solo clienti* oppure *Gestisce agenti*, cioè può creare sotto-agenti), i **server** che può usare e i **permessi** (attivare, rinnovare, attivare/disattivare, cambiare linea, disconnettere, eliminare, permessi dell'app, VPN) e quali **add-on** può assegnare.
- L'agente entra dallo stesso indirizzo del pannello con le sue credenziali e vede solo **Clienti**, **Agenti** (se può gestirli) e **Sicurezza**. Gestisce **solo i suoi clienti** (e quelli dei suoi sotto-agenti). Per attivare scrive il codice che il cliente vede sulla TV, sceglie uno dei server assegnati e scrive utente e password della linea: **non vede mai gli indirizzi dei server**. Scadenza obbligatoria (massimo 3 anni).
- Un sotto-agente non può mai avere più permessi, server o clienti di chi lo crea; se togli qualcosa a un agente vale subito anche per tutti quelli sotto di lui. Il limite di clienti conta per tutta la catena.
- **Verifica in due passaggi facoltativa** per gli agenti (la attivano da *Sicurezza*); dalla scheda dell'agente puoi azzerarla se perde il telefono. Disattivando un agente esce subito dal pannello insieme ai suoi sotto-agenti; i clienti continuano a funzionare. Un agente non può riattivare chi hai disattivato tu.
- **Responsabile**: nella scheda di ogni cliente scegli a quale agente appartiene; schede e tabella dei clienti mostrano il responsabile. Eliminando un agente, i suoi clienti e sotto-agenti passano a chi stava sopra di lui.
- **Pannello più serio**: menu a gruppi (Utenti, Monitoraggio, Contenuti, Impostazioni), grigio scuro piatto con accento blu, niente bagliori; *Dispositivi* si chiama *Clienti*.
- Le chiavi API non vedono né gestiscono gli agenti.

### 2.3.1 — Richieste temi, anteprime, codici Downloader, avviso «altro dispositivo»

- **Richieste temi**: nuova voce del menu (Monitoraggio → *Richieste temi*), separata dalle richieste di film e serie. Ogni richiesta mostra quale tema, skin o pacchetto avatar vuole il cliente, con **Anteprima**, **Assegna** (lo attiva subito sul cliente e chiude la richiesta), *Vista*, *Rifiuta*. Il cliente può chiedere un add-on anche se gli hai tolto le richieste di contenuti; la stessa richiesta non si duplica.
- **Anteprime degli add-on** (solo da vedere, non si applicano): nell'app anche i pacchetti avatar non posseduti mostrano gli avatar e le skin i colori; nel pannello il pulsante 👁 accanto a ogni add-on (Impostazioni → Store add-on, scheda cliente, schede agente) apre l'anteprima. Le autorizzazioni restano tue: tema completo e uso solo a chi lo assegni.
- **Codici Downloader in evidenza** in alto nel pannello, con *Copia*: quello dell'app e quello del **Kairos Store** (nuovo campo in Impostazioni → App e aggiornamenti). Li vedono anche gli agenti.
- **Linea già in uso**: prima di avviare una visione l'app controlla le connessioni della linea Xtream; se sono tutte occupate da altri dispositivi la visione non parte e compare l'avviso *«C'è già un altro dispositivo collegato»* (invece dell'errore o dello schermo nero). Non controlla mentre cambi canale o episodio, e se la linea non risponde la visione parte comunque. Lo stesso avviso vale per il limite di visioni contemporanee impostato dal pannello.
- Tutto arriva con l'interfaccia che si aggiorna da sola: **non serve un nuovo APK**.

## 15. Novità 2.4 — Assistente IA con Cloudflare Workers AI

- L'assistente ora usa **Cloudflare Workers AI** (modello **Gemma 4**, molto più veloce di Gemini): nessuna chiave da copiare, gratis fino a **10.000 neuroni al giorno** (circa 900 domande), che ripartono a mezzanotte UTC (01:00 in Italia). Se il limite gratuito finisce e hai messo anche `GEMINI_API_KEY`, risponde Gemini come riserva.
- **Come attivarlo (una volta sola)**:
  1. Cloudflare → in alto a destra **My Profile → API Tokens** → accanto al token che usi per GitHub (quello salvato come `CLOUDFLARE_API_TOKEN`) premi **⋯ → Edit**.
  2. In *Permissions* premi **+ Add more** → scegli **Account** → **Workers AI** → **Edit**. Premi **Continue to summary → Update token**. Il token resta lo stesso: non devi ricopiarlo su GitHub.
  3. GitHub → **Actions → Pannello Cloudflare → Run workflow** (oppure aspetta la prossima pubblicazione). Nel pannello, *Assistente IA* deve dire **Servizio: Attivo**.
  Se il token non ha ancora il permesso, il pannello si pubblica lo stesso (senza assistente) e GitHub mostra un avviso giallo.
- **Pannello → Monitoraggio → Assistente IA**: stato del servizio, domande di oggi, quanta parte del gratuito di Cloudflare è stata usata (con le domande che restano), grafico degli ultimi 14 giorni, clienti che l'hanno usato oggi, impostazioni (**domande al giorno per cliente**, modello) e le **richieste di altre domande** dei clienti con **+10 / +25 / +50** o *Rifiuta*.
- **Domande al giorno per singolo cliente**: nella scheda del cliente (sezione Permessi). Vuoto = valore predefinito, 0 = niente assistente. Le domande extra concesse si usano dopo quelle del giorno e non scadono.
- **App**: quando le domande finiscono (o finisce il gratuito di Cloudflare) compare il pulsante **«Chiedi altre domande al fornitore»**; sotto ogni risposta c'è quante domande restano oggi. Le finestre dell'assistente e del menu (tasto OK lungo) sono più piccole e non escono più dallo schermo della TV (menu su due colonne).
- Tutto arriva con l'aggiornamento automatico dell'interfaccia: **non serve un nuovo APK**.

### 2.4.1 — Assistente IA anche con Claude

- Nel pannello (**Monitoraggio → Assistente IA → Chi risponde ai clienti**) scegli **Cloudflare** (gratis, veloce), **Claude** (a pagamento, risposte più precise) o **Gemini** (gratis, più lento). Se il servizio scelto non risponde (limite, credito finito, chiave sbagliata) risponde l'altro, se è collegato. Modelli Claude: **Haiku 5.5** (veloce, costa pochissimo) o **Sonnet 5.5** (più preciso, circa 20 volte più caro).
- **Collegare Claude**: console.anthropic.com → **Billing** (carta e un piccolo credito) → **API Keys → Create Key** → copia la chiave `sk-ant-…` → Cloudflare → Workers → kairos-panel → Impostazioni → Variabili e segreti → **Aggiungi**, tipo **Segreto**, nome **`ANTHROPIC_API_KEY`** (in alternativa: segreto di GitHub con lo stesso nome). Puoi mettere un tetto di spesa mensile su console.anthropic.com → Limits.
- La pagina mostra la **spesa stimata** di Claude (oggi e ultimi 30 giorni); chiave sbagliata o credito finito compaiono in *Attività*.

### 2.4.2 — Solo Claude e Gemini, IA scelta per cliente

- **Cloudflare Workers AI tolto** (rispondeva male): l'assistente usa **Claude** (a pagamento, più preciso) o **Gemini** (gratis). Il permesso «Workers AI» sul token di Cloudflare non serve più (puoi lasciarlo o toglierlo).
- **Pannello → Assistente IA**: IA predefinita per tutti (Claude o Gemini), modello Claude (Haiku 5.5 / Sonnet 5.5), modello Gemini (3.8 Flash / 3.5 Flash-Lite più veloce), domande al giorno. Se l'IA scelta non risponde (credito finito, limite, chiave sbagliata) risponde l'altra, se collegata; il motivo compare in *Attività*.
- **Scheda cliente → Permessi**: per ogni cliente scegli **quale IA** usa (o quella predefinita) e **quante domande al giorno**.
- Gemini ora risponde più in fretta (ragionamento ridotto).
- Nell'app, sotto la risposta, si vede **chi ha risposto** (Claude o Gemini) e quante domande restano.
- **Claude risponde solo se** su Cloudflare c'è il segreto `ANTHROPIC_API_KEY` **e** su console.anthropic.com c'è del credito; altrimenti risponde Gemini.

### 2.4.3 — Manutenzione e «Prova Claude / Gemini»

- **🔧 Manutenzione** (pulsante in alto nel pannello): blocca l'app a tutti i clienti tranne quelli che scegli (per provare le novità). Chi sta guardando viene fermato entro circa 20 secondi e vede il tuo messaggio; finita la manutenzione l'app si riapre da sola. Le connessioni collegate seguono il loro cliente. Una barra rossa nel pannello ricorda che è attiva, con *Termina manutenzione*.
- **Assistente IA → «Prova Claude» / «Prova Gemini»**: una domanda di prova che dice subito se funziona o perché no (credito finito, chiave sbagliata, modello non disponibile, servizio sovraccarico). Ogni errore di Claude finisce anche in *Attività*.

## 16. Novità 2.5 — Agenti: tutte le funzioni a scelta

- Nella scheda dell'agente, oltre ai permessi sui clienti (ora anche **collegare dispositivi**, **profili/lettore/visioni**, **assistente IA dei clienti**), c'è **«Pagine del pannello»**: Dashboard, Online ora, Errori applicazione, Segnalazioni, Richieste contenuti, Richieste temi, Messaggi, Videoteca, Attività (la pagina dello store non c'è più per gli agenti: lo store è aperto, vedi punto 7). Ogni pagina mostra **solo i dati dei suoi clienti** (messaggi solo ai suoi clienti, mai a tutti; videoteca solo con le linee dei suoi clienti; attività solo sue). Impostazioni, Server DNS, API, Manutenzione e impostazioni dell'assistente restano solo tue perché valgono per tutti.
- **Server nascosti agli agenti**: se un DNS salvato non ha un nome (o il nome è l'indirizzo), l'agente vede «Server 1», «Server 2»… Dai un nome ai DNS in *Server DNS e VPN* per mostrarne uno tuo.
- **Password degli agenti**: nella scheda dell'agente vedi la password attuale con l'occhio 👁 (mostra/nascondi) e *Copia*. È conservata cifrata; per gli agenti creati prima della 2.5 compare dopo che imposti (o l'agente cambia) la password.

## Come funziona per i clienti

1. Installano l'app (codice Downloader) e la aprono: compare un **codice** tipo `KXAB-7Q2M`.
2. Nel pannello il dispositivo appare in **"In attesa"**: premi **Attiva**, scegli la durata e assegni la playlist (M3U o Xtream).
3. L'app si sblocca da sola in pochi secondi.

Il codice resta **legato a quel dispositivo**: se qualcuno lo copia su un'altra TV, non funziona. Se un cliente cambia TV o reinstalla l'app, apri il dispositivo nel pannello e premi **Sblocca**.

## 17. Kairos Lite separata nel pannello

- **Clienti**: filtro *Tutte le app / Kairos Pro / Kairos Lite* e badge **LITE** sui clienti dell'app Lite. Il tipo di app si riconosce in automatico al primo collegamento dopo l'aggiornamento (la Lite invia la versione «lite x.y.z»).
- **Scheda di un cliente Lite**: restano solo le funzioni che la Lite ha (link, cambio playlist, profili, VPN). Spariscono Lettore, Add-on, Assistente IA, registrazioni, speed test e multischermo.
- **Impostazioni → App e aggiornamenti → Kairos Lite**: link dell'APK (vuoto = ultima release di `kairos-lite`), codice Downloader e versione pubblicata letta dalla release.
- Il codice Downloader della Lite compare anche in alto nel pannello, accanto a quello di Kairos Pro e dello store.
- **Scelta dell'app**: nella scheda del cliente (e per gli agenti nel modulo del cliente) scegli *Kairos Pro* o *Kairos Lite*, anche quando lo crei. L'app viene comunque riconosciuta da sola appena si collega (dalla prima registrazione, non solo dal battito).

## 18. Agenti: store, clienti e manutenzione come permessi

Nella scheda di ogni agente (Agenti → apri l'agente):
- *(non più: «App dello store che può approvare» e «Download store: vedere anche i download degli altri» non esistono più, lo store è aperto — punto 7)*
- **Vedere i clienti dei suoi sotto-agenti**: acceso di base; spento vede e gestisce solo i clienti attivati da lui. I tuoi clienti e quelli degli altri agenti non li vede mai.
- **Manutenzione dei suoi clienti**: spento di base. Se acceso, l'agente ha il pulsante 🔧 Manutenzione che blocca l'app solo ai suoi clienti. La manutenzione generale resta solo tua; se un agente l'ha accesa lo vedi in alto e puoi spegnerla.
- **Attività**: l'agente vede solo le sue azioni.

## 19. Altre app: OrbixPlay (e MaxPlayer)

- **Impostazioni → App e aggiornamenti → OrbixPlay e MaxPlayer**: scrivi il tuo **DNS personale** per ogni app (anche più di uno, con un nome). Per OrbixPlay puoi aggiungere il «codice host» che ti dà OrbixPlay: se c'è, l'indirizzo non viene inviato.
- **Scheda del cliente → Altre app**: scrivi l'ID del dispositivo OrbixPlay, utente e password (proposti dalla linea del cliente) e premi **Attiva**. Il DNS lo mette il pannello: sotto il pulsante scegli quale. **Riattiva** sostituisce senza doppioni, **Togli** cancella. Se l'ID è sbagliato non viene cancellato niente.
- **DNS nascosto**: gli agenti vedono solo il nome del DNS. Puoi decidere tu di mostrargli l'indirizzo («Gli agenti vedono l'indirizzo dei DNS»). Gli agenti possono usare solo utente e password delle linee dei loro clienti.
- Collegamento: segreto GitHub `ORBIX_KEY` = la tua customer key OrbixPlay. L'abbonamento OrbixPlay si attiva/rinnova dal loro pannello: la loro API non lo prevede.
- **MaxPlayer** (API pubblica ufficiale, chiave nel segreto `MAXPLAYER_KEY`, creata in MaxPlayer → API pubblica → Accesso → Crea chiave): nella scheda del cliente scrivi utente e password della linea, scegli il DNS e premi **Attiva**. Il pannello crea l'account MaxPlayer del cliente: entra nell'app con gli stessi utente e password. **Riattiva** aggiorna la lista (senza creare un altro account), **Togli** cancella l'account.
- I DNS di MaxPlayer sono i **Domini** del tuo pannello MaxPlayer: li vedi in Impostazioni → App e aggiornamenti e puoi aggiungerne da lì. A MaxPlayer va solo l'ID del dominio, mai l'indirizzo; gli agenti vedono solo il nome.

## 20. Codici downloader

- Nel menu, sotto **Server DNS e VPN**, c'è **Codici downloader**: tutte le app da far installare ai clienti, a gruppi (Android TV, ORA HUB Family…).
- Ogni app ha **Copia codice** e **Copia link** separati (il link è `aftv.news/<codice>`, oppure quello che scrivi tu), più gli altri link (sito, APK telefono, Google Play, iPhone, Windows) ognuno con il suo **Copia**.
- **Modifica elenco** (solo tu): aggiungi, cambia o togli app, codici, etichette («Nuova», «Solo con codici di attivazione») e link.
- Agenti: permesso «Codici downloader» (acceso di base), solo da copiare.

## 21. Gestione app terzi e scheda cliente a tendina

- Nel menu, sotto **Server DNS e VPN**, c'è **Gestione app terzi**: i DNS di OrbixPlay (modifica e ✕ per cancellare, poi «Salva DNS OrbixPlay») e i DNS di MaxPlayer (rinomina, cambia indirizzo con «Salva», ✕ per cancellare scegliendo su quale DNS spostare i clienti), più la guida per le chiavi. MaxPlayer non permette di cancellare l'ultimo DNS.
- **Link diretti e codici cliente = «slot»** (App terzi): uno per fornitore, con app (OrbixPlay o MaxPlayer), link (DNS) e codice cliente, tutti con «Copia». Di base: NKI OrbixPlay (`orbx.nki-orbx.download`), NKI MaxPlayer (`maxplayer.nki-max.stream`) e Armada MaxPlayer (`maxplayer-armada.chasertv2.stream`), codice 265847. **+ Nuovo slot**, **Modifica** ed ✕ li gestisci tu; «Aggiungi ai DNS» / «Aggiungi a MaxPlayer» li rende pronti per le attivazioni. Nella scheda del cliente («Altre app») il codice cliente segue il DNS scelto. Gli agenti vedono nomi e codici, non i link (salvo «Gli agenti vedono l'indirizzo dei DNS»).
- **Liste create sulle app terzi** (stessa pagina): tutte le attivazioni fatte su OrbixPlay e MaxPlayer con cliente, lista, data e stato, ognuna con **Rimuovi**. «Inattiva» = abbonamento scaduto, o cliente disattivato e fermo, da più dei giorni scelti (di base 60). **Rimuovi le inattive** le toglie tutte insieme; **Rimuovi da sole ogni notte** lo fa in automatico. Eliminando un cliente dal pannello si tolgono anche le sue liste dalle app terzi.
- **Scheda del cliente a tendina**: ogni sezione (1 Cliente, 2 Abbonamento…) si apre e si chiude toccando il titolo; il menu a sinistra apre la sezione scelta; ci sono «Apri tutte» e «Chiudi tutte». All'apertura è aperta solo «Cliente».

## 22. Pannello riorganizzato (2.11)

- **Menu in due parti**. *Operatività*: Panoramica · Clienti (Clienti, Agenti, Online ora) · Da gestire (Segnalazioni, Richieste contenuti, Richieste temi, Richieste IA) · Contenuti e comunicazione (Messaggi, Videoteca) · App e distribuzione (App Kairos, Codici downloader, App terzi) · Controllo (Errori applicazione, Attività). *Impostazioni*: Aspetto e marchio (con prezzo e privacy) · Funzioni dell'app · Store add-on · Assistente IA · Server DNS e VPN (con la VPN generale) · Manutenzione · Sicurezza e account · API e integrazioni.
- **Barra in alto**: ricerca, pillola *Manutenzione ON/OFF* (accende e spegne al volo; messaggio ed esclusi in Impostazioni → Manutenzione), campanella con tutte le richieste in attesa, *Nuovo cliente*.
- **Panoramica**: Azioni rapide (nuovo cliente, rinnova in scadenza, messaggio a tutti, copia codice downloader, attiva su OrbixPlay/MaxPlayer, manutenzione) e Interruttori rapidi (manutenzione, playlist personali, eventi sportivi, assistente IA, pulizia automatica app terzi, agenti che vedono i DNS), più i riquadri e i grafici di prima.
- **Clienti → ⋯ Altre opzioni → Elimina clienti inattivi** (come su MaxPlayer): giorni senza aprire l'app, «Includi clienti che non hanno mai effettuato l'accesso», «Solo scaduti o disattivati», numero di clienti idonei, fino a 500 per volta. Si conservano sempre i clienti con liste su OrbixPlay/MaxPlayer e quelli con una connessione collegata usata di recente.
- **App terzi → Elimina liste inattive**: la stessa finestra per le liste di OrbixPlay e MaxPlayer.
- Assistente IA spento dall'interruttore: il pulsante sparisce dall'app per tutti.

## 23. Telefono, tablet e app installabile (2.12)

- Il pannello si usa bene da **telefono e tablet** (Android e iOS): barra in alto compatta, menu a scomparsa (anche scorrendo dal bordo sinistro), **barra in basso** sul telefono (Panoramica · Clienti · ＋ Nuovo · Richieste · Menu), schede e finestre a tutto schermo, tabelle che scorrono di lato, niente zoom automatico sui campi su iPhone.
- **App installabile**: in Panoramica → Azioni rapide c'è «Installa l'app» (Android/Chrome/Edge: installa direttamente; iPhone/iPad: Safari → Condividi → Aggiungi alla schermata Home). Si apre a tutto schermo con l'icona KAIROS.
- **Server DNS e VPN → Verifica DNS e connessione**: pulsanti per dns.gtechgroup.it (propagazione DNS) e mio-ip.it (IP pubblico); accanto a ogni DNS «🔍 Verifica» copia il dominio e apre il sito.

## 24. «Incolla linea»

Nella scheda del cliente, sezione **Playlist**, c'è **«Incolla linea»**: la linea la crei tu sul pannello del tuo fornitore (Kairos non ci entra mai), poi incolli qui il **link M3U** (es. `http://server/get.php?username=…&password=…&type=m3u_plus`) oppure il **messaggio con server, utente e password**. Kairos riconosce da solo il formato (Xtream o M3U, link `get.php`/`player_api`, forma stream `/live/utente/password`, o testo con etichette) e lo mette nella playlist del cliente. Da lì scegli l'app, carichi la lista su Kairos Pro/Lite/OrbixPlay/MaxPlayer e mandi il messaggio al cliente — tutto da un pannello.

## 25. Kairos TV nel pannello (repository separato kairos-tv)

Kairos TV è l'app **nativa** stile Netflix per chiavette datate (veloce come la Lite: niente WebView), con il suo codice nel repository **kairos-tv** e il logo blu.
- **Clienti**: filtro *Kairos TV* e badge **TV**; l'app si riconosce da sola (si presenta con `KairosTV/x.y`).
- **Scheda del cliente Kairos TV**: come per la Lite restano collegamento TV, cambio playlist, profili e VPN; spariscono Lettore, Add-on, Assistente IA, registrazioni, speed test e multi-schermo.
- **Impostazioni → App e aggiornamenti → Kairos TV**: link dell'APK (vuoto = ultima release di `kairos-tv`), codice Downloader e versione pubblicata. Il codice Downloader compare anche in alto.
- **Aggiornamenti**: Kairos TV riceve solo il proprio APK e non scarica l'interfaccia della Pro (la sua è dentro l'APK).

## 26. Modifica in massa, Home dal pannello, permessi «modalità leggera» e «risoluzione e FPS»

- **Clienti → «⚙ Modifica in massa»** (solo titolare): in alto vale per *tutti i clienti attivi* o *tutti* (esclusi quelli da attivare); in vista **Tabella**, dalla barra della selezione, solo per i clienti scelti. Si cambiano insieme: lettore di diretta, film e serie (ExoPlayer, VLC, automatico o «lo sceglie il cliente»), permessi, VPN, visioni contemporanee, e si tolgono le impostazioni del Controllo remoto imposte solo a loro. Le voci su «Non cambiare» restano come sono; le app si riallineano al battito successivo. Endpoint: `POST /api/admin/devices/mass` `{ scope: 'ids'|'active'|'all', ids?, player?, perms?, vpn?, maxStreams?, rcClear? }`.
- **Controllo remoto → «Home dei clienti · tutte le app»**: *categorie in primo piano* (`home.top`) e *categorie nascoste dalla Home* (`home.hide`), nomi o parti di nome separati da virgola (maiuscole e accenti non contano; pulsante «＋ categorie per adulti»). Si salvano per tutte le app insieme (`PUT /api/admin/rctl/all`) e si possono poi cambiare per una sola app (profilo) o per un singolo cliente. Nelle app: quelle in primo piano compaiono per prime nella Home e in cima agli elenchi; quelle nascoste spariscono dalla Home (anche dalle righe automatiche) e negli elenchi restano in fondo.
- **Permessi per cliente** nuovi: *Cambiare la modalità leggera* (`lite`: se spento la decide il pannello o resta automatica) e *Vedere risoluzione e FPS* (`resInd`: riquadro in alto a destra all'apertura di un canale e a ogni cambio di risoluzione).
- **«Modalità leggera: Spenta»** decisa dal titolare (sul cliente o sul profilo dell'app) vince sempre: «Risolvi» non la riaccende (la segnala tra le cose da fare) e «Risolvi da solo» non cambia mai una voce già impostata su quel cliente. La modalità leggera non scende mai (da «Leggerissima» a «Sempre attiva»). Nel Pro (dalla UI di novembre) anche le pulizie di memoria di Android e l'avvio sulle chiavette da 1 GB rispettano «Spenta».
- **Controllo remoto → Aspetto → «Locandine»** (solo Kairos Pro, profilo dell'app o singolo cliente): *Automatiche* (predefinito: sulle chiavette da 1 GB locandine w185 e sfondi w780, sugli altri w342/w1280) o *Sempre nitide* (misura piena anche sulle chiavette da 1 GB, più memoria). Voce `posters` (`auto`|`hi`); l'app la applica subito ridisegnando la schermata e la riferisce al pannello («Nell'app»).
- **Controllo remoto → Aspetto → «Animazione d'avvio»** (solo Kairos Pro): *Automatica* (completa sui dispositivi forti, senza effetti di sfondo pesanti su quelli deboli), *Semplice* (logo, scritta e barra) o *Spenta* (logo fermo e barra). Voce `intro` (`auto`|`simple`|`off`); l'app la ricorda e la usa dall'apertura successiva (lo splash parte prima della risposta del pannello).
- **Modifica in massa → «Controllo remoto · solo per questi clienti»**: *Modalità leggera*, *Locandine*, *Animazione d'avvio* per i clienti scelti (o «Come il profilo» per togliere la voce). Ogni cliente prende solo le voci che la sua app capisce. API: `rcSet: { lite?, posters?, intro? }` in `POST /api/admin/devices/mass` (`''` = tolta).
- **Presenza**: le app mandano `vis:false` quando vanno in sfondo e risultano subito non in linea (prima restavano «online» fino a 4 minuti); quel battito non conta per il limite dei 15 secondi.

## 27. Clienti divisi: i miei e quelli degli agenti

- In cima a **Clienti** (quando ci sono agenti): **I miei clienti** (attivati dal titolare, più quelli da attivare) e **Clienti degli agenti**, con un pulsante per ogni agente (i sotto-agenti subito dopo il loro capo) e **Tutti insieme** per l'elenco unico con la colonna *Responsabile*. Riquadri, conteggi delle app, ricerca e modifica in massa seguono la sezione scelta (ricordata nel browser, `kc_own`).
- Se si cerca un cliente che sta in un'altra sezione compare «c'è N clienti in … · Mostra».
- **Agenti → «👥 Vedi i suoi clienti»** apre Clienti sul solo quell'agente; la riga in alto ha «Apri la scheda dell'agente».
- **Modifica in massa** da una sezione: di base vale per *quella sezione* (attivi o tutti); restano le scelte «tutti i clienti (tuoi e degli agenti)».
- L'agente con sotto-agenti vede allo stesso modo «I miei clienti» / «Dei sotto-agenti».

## 28. Richieste «da attivare» (i «— senza nome —»)

- Cestino su ogni richiesta (tabella e schede) ed **«Elimina tutte (N)»** nella barra delle richieste: tolgono solo dispositivi mai attivati (`POST /api/admin/devices/pending/delete { ids }`, solo titolare, senza cestino). Se l'app è ancora aperta su quel dispositivo, la richiesta ricompare da sola con lo stesso codice.
- **«Se non le accetti si annullano dopo…»**: 1 ora, 6 ore, 24 ore, 3 giorni, 7 giorni o 30 giorni (predefinito, come prima). Impostazione `pendTtl` (ore). Si conta dalla richiesta, mai mentre l'app mostra il codice (vista negli ultimi 10 minuti); restano quelle a cui hai dato un nome o una nota. Controllo all'apertura del pannello (al più ogni 5 minuti), nella pulizia notturna e subito quando scegli il tempo.

## 29. Eventi sportivi di tutti gli sport (Kairos Pro)

Nella Home della Pro la riga **«In corso e prossimi eventi sportivi»** e il riquadro grande non mostrano più solo il calcio:

| Sport | Cosa compare | Fonte ESPN (`site.api.espn.com/apis/site/v2/sports/…/scoreboard`) | Giorni chiesti |
|---|---|---|---|
| Calcio | Serie A, Champions, Europa e Conference League, Coppa Italia, Premier, LaLiga, Bundesliga, Ligue 1 | `soccer/<campionato>` | oggi + 7 (come prima) |
| Formula 1 | ogni sessione del weekend: Libere, Qualifiche, Qualifiche Sprint, Sprint, Gara («GP del Brasile · Gara»), con i primi tre durante la sessione | `racing/f1` (senza data: il weekend in corso o il prossimo) | — |
| Tennis | ATP e WTA, solo tabellone principale di singolare, con bandiere, teste di serie e set | `tennis/atp`, `tennis/wta` | oggi + 1 |
| Basket | NBA | `basketball/nba` | oggi + 1 |
| Football americano | NFL | `football/nfl` | oggi + 2 |
| UFC | la serata («UFC 320») con l'incontro principale | `mma/ufc` | oggi + 2 |
| Rugby | Sei Nazioni, Nations Championship, URC, Champions Cup, test match (nazionali in italiano) | `rugby/180659`, `17567`, `270557`, `271937`, `289234` | oggi + 2 |

- **Scelta degli eventi** (al massimo 30, entro 8 giorni): prima quelli in diretta, poi i più vicini; ogni sport presente ha 2 posti garantiti e un massimo (F1 5, tennis 6, NBA 4, NFL 4, UFC 2, rugby 5; il calcio riempie il resto). **Tennis**: con tante partite in contemporanea si tengono quelle in corso, poi quelle con italiani, poi teste di serie, turni avanzati e tornei maggiori (Slam, Finals, Masters 1000); doppi, qualificazioni, juniores e «TBD» non entrano.
- **Pannello → Impostazioni → Funzioni dell'app**: «Eventi sportivi nella Home» resta l'interruttore generale (anche tra gli Interruttori rapidi della Panoramica); sotto, **«Sport da mostrare»** con una casella per sport, di base tutte attive, salvate con «Salva». Impostazione `sports` (`['calcio','f1','tennis','basket','nfl','ufc','rugby']`; non impostata = tutti). Gli sport spenti non vengono nemmeno scaricati.
- **API**: `GET /api/player/events` senza parametri risponde **come prima** (solo calcio, stessa forma `{ events, updated }`: le interfacce vecchie leggono `home`/`away`). Con **`?v=2`** (la Pro aggiornata): `{ v: 2, events, sports, updated }`, ogni evento con `id` (`<sport>:<id ESPN>`), `sport`, `league`, `start`, `live`, `state`, `clock`, `venue`, `round`; `home`/`away` quando ci sono due lati (`name`, `logo` o bandiera, `score`; nel tennis anche `sets`, `seed`), altrimenti `title` (gare e sessioni, con `gp`, `session` e `top`).
- **Cache**: in D1 (tabella `settings`), una riga per «fonte + giorno» (`ev:<fonte>:<giorno>`; il calcio con le stesse chiavi di prima). Validità: oggi 5 minuti, domani 1 ora, gli altri giorni 6 ore; giorni senza eventi oggi 30 minuti e domani 2 ore; F1 5 minuti nel weekend di gara, 1 ora negli altri giorni; una fonte in errore si riprova dopo 15 minuti (oggi) o 1 ora, una fonte rifiutata da ESPN dopo 6 ore. Al massimo **40 richieste a ESPN per giro** (prima oggi), sotto il limite di 50 del piano gratuito: a cache vuota servono 3 giri per riempirla tutta (100 righe). Ritardo dei risultati in diretta: fino a circa 8 minuti (5 di cache più 3 di memoria del Worker), più i 10 minuti tra un aggiornamento e l'altro dell'app.
- **«Dove vederla»** per ogni sport: guida TV intorno all'orario con i nomi delle squadre, i cognomi di giocatori e lottatori o il Gran Premio (le parole corte come «F1» solo come parola intera), poi i canali delle emittenti: F1 *Sky Sport F1, TV8*; MotoGP *Sky Sport MotoGP, TV8*; tennis *Sky Sport Tennis, SuperTennis*; NBA *Sky Sport NBA*; NFL e UFC *DAZN*; rugby *Sky Sport* (Sei Nazioni e Nations Championship 2026 sono in esclusiva Sky). «Cerca tra tutti i canali» cerca il nome dello sport (F1, Tennis, NBA…).
- **Non disponibili**: MotoGP, Eurolega, volley e ciclismo. ESPN non li ha; per MotoGP ed Eurolega esistono solo le API interne dei siti ufficiali (non documentate e senza garanzie per chi le usa da fuori), per il volley italiano e il ciclismo nessuna fonte pubblica gratuita senza chiavi (servirebbe leggere le pagine dei siti, cosa che il pannello non fa).

## 30. Kairos Pro «intelligente»: assistente IA in tutta l'app

Arriva con l'aggiornamento automatico dell'interfaccia (**non serve un nuovo APK**; solo la ricerca a voce vuole l'APK con il microfono).

**Cosa vede il cliente**
- **Cerca con una frase**: nella pagina *Cerca* si scrive un nome come prima oppure una frase («film d'azione anni 90 con Stallone», «la partita dell'Inter stasera», «qualcosa per bambini», «chi è l'attore di Rambo?»). Con una frase compare **«✦ Cerca con l'assistente»**: OK (o Invio) e l'IA trasforma la frase in criteri (tipo, generi, anni, attori, titoli, squadre, sport, quando). L'app li cerca **da sola** nella libreria del cliente (film e serie: categorie, generi, anno; attori con la filmografia TMDB), nella **guida TV** (titolo e descrizione, nella finestra «adesso / stasera / oggi / domani») e negli **eventi sportivi** della Home. In cima: la frase capita, i criteri in chiaro e i risultati apribili; sotto, i risultati per nome di sempre. Pagina vuota: esempi da provare, «Cosa guardo stasera?» e «Chiedi all'assistente». Scrivere non costa nulla: si usa una domanda solo premendo OK.
- **Ricerca a voce**: il pulsante 🎤 accanto al campo (e nella finestra dell'assistente) compare **solo** se l'APK ha `NATIVE.voiceStart()`. Contratto con l'app nativa: `NATIVE.voiceStart()` → l'app chiama `window.kxVoice(testo)` (il testo va nel campo e parte la ricerca con le frasi) oppure `window.kxVoiceErr(motivo)` (messaggio semplice: permesso del microfono, occupato, rete, annullata, «non ho capito»). Senza risposta entro 20 secondi il pulsante torna normale.
- **«Cosa guardo stasera?»**: seconda riga della Home (una card) e anche in *Cerca*. L'app prepara da sola circa 20 proposte (serie lasciate a metà, film e serie non visti dei generi e delle categorie che il profilo guarda, classifiche e novità, eventi sportivi e prima serata dei canali che guarda o dei generalisti, rispettando controllo genitori e profilo bambini); l'IA ne sceglie **da 3 a 5** e scrive **una riga sul perché**. OK su una proposta: scheda del titolo, canale (con l'orario se inizia dopo) o «Dove vederla». **Senza IA** (spenta, domande finite, nessuna risposta) le proposte le sceglie l'app, sempre con il perché.
- **Assistente esteso** (✦ nella scheda del titolo, menu del tasto OK, «Chiedi all'assistente»): oltre alle domande sul titolo, domande libere («chi è l'attore di…», «film simili a quelli che guardo», «a che ora c'è la F1?»). Sotto la risposta, **«Nella tua libreria ci sono:»** con i titoli (e i programmi della guida) apribili. Orari e programmi non li inventa l'IA: li prende l'app dalla guida e dagli eventi.
- Testi brevi, tutto con le frecce del telecomando (selezione sempre visibile), anche nella **leggerissima** (niente animazioni né sfocature, risultati limitati). Errori con un messaggio semplice («L'assistente non risponde adesso: riprova tra poco», «Per oggi le domande all'assistente sono finite: riprendono domani»), mai «fornitore» né dettagli tecnici (sotto le risposte non compare più quale IA ha risposto, solo le domande rimaste quando sono poche); con le domande finite resta «Chiedi altre domande».

**Cosa sceglie il titolare (pannello)** — vince la scelta più vicina al cliente:
1. **Scheda del cliente → Permessi → «Assistente IA»: Gemini (predefinito) | Claude | Spento** (sostituisce l'interruttore del permesso; «Spento» = permesso spento). Sotto, le domande al giorno come prima.
2. **Controllo remoto → profilo di Kairos Pro → «Assistente IA»** (Predefinito | Gemini | Claude | Spento): vale per tutti i clienti Pro con «predefinito» nella scheda. Nella finestra del singolo cliente non si ripete (si sceglie nella scheda).
3. **Assistente IA** (pagina): IA predefinita per tutti (Gemini di serie), modelli, domande al giorno; **Panoramica → Interruttori rapidi → Assistente IA** la spegne per tutti.
4. **Modifica in massa**: riga «Assistente IA» (Non cambiare | Gemini | Claude | Spento).
Spenta in qualunque modo (o 0 domande al giorno), l'app nasconde ✦, esempi e «Cerca con l'assistente» entro un minuto (permesso `ai` nel battito); «Cosa guardo stasera?» resta, senza IA.

**Costi e limiti**: ogni richiesta all'IA (ricerca con una frase, «Cosa guardo stasera?», domanda) usa **una domanda del giorno** del cliente (20 di serie, cambiabili per cliente; poi le domande extra). Gemini è gratis (con il limite giornaliero di Google). Claude lo paga il titolare: con **Haiku 5.5** circa **0,10–0,20 $ ogni 1.000 richieste** (risposte corte, JSON), con Sonnet 5.5 circa 20 volte di più; la spesa stimata è nella pagina Assistente IA. Se l'IA scelta non risponde (credito finito, chiave, limite) risponde l'altra, se collegata; se nessuna risponde la domanda non si scala. **Privacy**: all'IA vanno solo la frase o la domanda e il minimo dei titoli (per «Cosa guardo stasera?» titolo, tipo, anno, genere, canale, orario e un indizio come «serie in corso»; i gusti come generi), mai nome, codice o dati del cliente; i segreti `GEMINI_API_KEY` e `ANTHROPIC_API_KEY` restano su Cloudflare.

**API** — `POST /api/player/ai` (codice e segreto del dispositivo, come prima), oltre alla domanda classica (`q`, `ctx`: risposta `{ answer, left, by }`, invariata per le app vecchie):
- `{ mode: 'search', q }` → `{ find, label, left }`; `find` ripulito dal server: `type` (`movie|series|live|any`), `genres` (vocabolario fisso: azione, avventura, animazione, commedia, crimine, documentario, drammatico, famiglia, fantascienza, fantasy, guerra, horror, musica, mistero, romantico, storico, thriller, western, sport, reality, notizie, bambini), `years` `[da, a]`, `people`, `titles`, `words`, `sport`, `when` (`now|tonight|today|tomorrow`), `kids`; `null` se la frase non dà criteri.
- `{ mode: 'tonight', cands: [{ k: 'film'|'serie'|'tv'|'sport', t, y, g, c, h, w }], taste, hm, kids }` (da 3 a 24 proposte) → `{ picks: [{ i, why }], left }` (indici delle proposte della app, da 0 a 5 scelte valide).
- `{ v: 2, q, ctx? }` → `{ answer, titles, find, left }` (domanda libera o sul titolo, con i titoli da cercare nella libreria).
- `GET /api/player/person?q=` ora dà anche i generi TMDB dei titoli (`g`), per «film d'azione con …».

## 31. Kairos Pro «intelligente»: autopilota (si adatta, si controlla da sola, impara le abitudini)

Riusa quello che c'era già (classe del dispositivo D/N/O, modalità leggera automatica, **Kairos Adaptive v1** con versioni più leggere, fill, drain e server di riserva, recupero automatico del lettore, consigliati) senza cambiarne i valori. Mai lavoro durante la visione; sulle chiavette da 1 GB solo le parti leggerissime.

**Dove arriva**: l'interfaccia (`player/index.html`) e il pannello si aggiornano da soli con il push su `main`. Le parti native sono nell'**APK** (`android/`, file nuovo `Auto.kt`): arrivano ai clienti solo con il **tag di una nuova versione** (oggi l'ultima release Pro è la 2.7.1; la 2.7.2 è in attesa: questi cambiamenti entrano nella prima versione taggata da `main` dopo il commit dell'APK). Con l'APK vecchio l'interfaccia nuova funziona come prima: ogni funzione nativa nuova è facoltativa.

| Punto | Cosa fa | Cosa vede il cliente | Cosa vede il titolare | Dove |
|---|---|---|---|---|
| **Dispositivo** | `NATIVE.caps()` legge una volta da MediaCodecList i decoder **hardware** (HEVC, 4K, 10 bit, 1080p a 50 fps) e l'altezza massima dello schermo. Su un canale che il dispositivo non regge l'interfaccia parte da sola dalla versione sorella giusta (4K su TV 1080p o senza decoder 4K → FHD; HEVC senza decoder HEVC → la versione H.264; HDR/10 bit senza Main10 → l'altra). «Massima» scelta dal cliente resta piena | il canale parte subito nella versione che regge | «Dati» › Auto-controlli › *Decodifica del dispositivo* | interfaccia + APK |
| **Motore migliore** | per formato (TS, HLS, MP4, MKV e le varianti HEVC): una visione di un minuto senza problemi conta come riuscita; quando il recupero passa all'altro motore e lì il problema si risolve, il primo ha fallito (immagine ferma, errori, non risolti). Si passa di base all'altro motore solo con prove sufficienti e un vantaggio chiaro, e si torna indietro se l'altro comincia a fallire. Memoria sul dispositivo, **azzerata a ogni versione dell'app**. Solo con la scelta **«Automatico»** (`engLearn`): mai con il lettore scelto dal cliente, imposto dal pannello o cambiato nel lettore | niente: parte meglio dove prima si bloccava | «Dati» › *Lettore imparato* (es. «TS → VLC») | APK (l'interfaccia manda `engLearn`) |
| **Auto-controlli** | all'avvio (dopo 45 s, 90 s sui dispositivi lenti) e ogni 30 minuti, solo nei menu: server della lista e linea Xtream (`player_api.php` senza azione: raggiungibile, utente rifiutato, scaduta, sospesa, connessioni piene, giorni alla scadenza), **server di riserva** se il principale non risponde (il lettore parte direttamente da quello), guida TV vecchia o file della guida illeggibile (**si riscarica da sola**), spazio libero sotto 300 MB (**pulisce le cache**: download e guide temporanei, APK vecchi, immagini della WebView; mai registrazioni), orologio (ora del pannello misurata nel battito, altrimenti quella del server della lista) | **nessun avviso**, salvo quando serve una sua azione, con parole neutre: linea scaduta o sospesa («Abbonamento da rinnovare», al più una volta al giorno) e orologio sbagliato di oltre 15 minuti (un avviso ogni 3 giorni) | «Salute delle app» e «Dati» con la **causa probabile in italiano** e la soluzione; sezione «🤖 Auto-controlli dell'app» con server, linea, guida, spazio, orologio, avvio, lettore imparato, decodifica, riparazioni fatte | interfaccia (spazio e pulizia: APK) |
| **Avvio più veloce** | a ogni apertura dalla memoria senza tasti premuti si misura il lavoro del dispositivo (lettura della libreria salvata + costruzione della Home, senza la rete) e gli scatti dei primi 1,5 s; vale la mediana delle ultime 5 aperture. Lento (oltre 2,5 s o scatti oltre il 25%) → animazione d'avvio semplice (solo con «Automatica»), attesa del logo più corta, loghi, guida e classifiche rimandati; molto lento (oltre 6 s o scatti oltre il 50%) → leggerissima (mai con «Spenta») | parte prima e più fluida | «Dati» › *Avvio* (secondi di lavoro, lento/molto lento) | interfaccia |
| **Cambio canale** | il lettore impara le sequenze (canale → canale successivo) e il verso di CH+/CH−; dopo ogni cambio prepara il canale più probabile risolvendo in anticipo il suo DNS (leggerissimo: vale anche sulle chiavette). L'interfaccia passa al lettore le connessioni libere della linea (`pre.free`) | cambio un po' più rapido sui canali con server diversi | — | APK |
| **«Adesso per te»** | prima riga della Home: canali aperti di solito a quell'ora (3 minuti di fila sullo stesso canale = un'abitudine di quell'ora; giorni feriali, sabato e domenica separati; le abitudini vecchie contano meno), lo sport con l'evento in corso se è la sua abitudine a quell'ora, titoli nuovi dei generi visti in quella fascia e le serie già iniziate. Cambia da sola con l'ora (a Home ferma). Abitudini **per profilo, solo sul dispositivo** | la riga «Adesso per te · quello che guardi di solito la domenica pomeriggio» (almeno 3 contenuti, altrimenti non compare) | — | interfaccia |
| **Canali non funzionanti** | le app mandano con ogni errore il canale (`ck` = «server della lista\|numero del flusso», uguale per tutti i clienti dello stesso server). Il pannello segnala un canale che non parte per **almeno 2 clienti diversi da almeno 10 minuti**, senza nessuna visione riuscita dopo (esclusi gli errori del decoder e i clienti con la linea scaduta, piena o rifiutata). L'app lo riceve nel battito (solo quando l'elenco cambia) | il canale va **in fondo** alle liste e allo zapping con **«non disponibile»**; torna da solo appena qualcuno lo vede bene, o dopo 12 ore senza errori nuovi | **Errori delle app › «📵 Canali non funzionanti»** (solo titolare): canale, server (nome DNS), clienti, errori, da quando; «✓ Funziona» lo rimette subito al suo posto | pannello + interfaccia |
| **Versioni FHD/HD/SD in una voce** | con **Controllo remoto › TV in diretta › «Versioni dello stesso canale in una voce sola: Sì»** le versioni dello stesso canale diventano una voce, con la versione giusta per linea e dispositivo. **Spenta di serie**: le versioni si riconoscono dal nome, e due canali diversi con nomi quasi uguali potrebbero finire insieme | liste più corte, zapping senza doppioni | voce nel Controllo remoto e nella Modifica in massa | interfaccia |
| **Promemoria automatici** | programmi visti in almeno 2 giorni diversi (titolo senza numeri di puntata) e squadre seguite (eventi aperti dalla Home o programmi con le due squadre nel titolo) → avviso 10 minuti prima (15 per le partite) | «🔔 Tra poco» con **«Guarda»** (porta al canale), «Ignora», «Non avvisarmi più»; si spengono da **Impostazioni › TV in diretta › Promemoria automatici** | voce «Promemoria automatici» nel Controllo remoto (per imporla) | interfaccia |
| **Ricerca a voce** | `NATIVE.voiceStart()` (solo se il dispositivo ha il riconoscimento vocale: altrimenti la funzione non esiste e l'interfaccia non mostra 🎤) avvia SpeechRecognizer in italiano: risultato in `window.kxVoice(testo)`, errore in `window.kxVoiceErr(motivo)` (`permesso negato`, `occupato`, `rete`, `annullato`, `non capito`…). Permesso del microfono chiesto **solo al primo uso** | 🎤 nella pagina Cerca | — | APK (l'interfaccia è dell'assistente IA, §30) |

**API**
- Battito `POST /api/player/heartbeat`: `chk` (esito degli auto-controlli: `srv` ok/down/alt/auth, `acc` ok/exp/full/off, `exp` giorni, `con` «attive/massime», `epg` ok/old/fix/none/err, `dsk` ok/low/fix, `mb`, `clk` minuti, `boot` ms, `slow` 0-2, `eng`, `cap`, `fix`; mandato quando cambia e ogni 15 minuti, il server tiene solo voci e valori noti più l'istante del server → colonna `presence.chk`), `dv` (impronta dell'elenco dei canali non funzionanti che l'app ha), `ck` (canale in onda). Risposta: `dead: { v, l: ["host|flusso", …] }` solo quando l'elenco del cliente cambia.
- Errori `POST /api/player/errors`: ogni problema dei canali può avere `ck` (colonna `app_errors.ck`, migrazione `0042_autopilota.sql`).
- Pannello (solo titolare): `GET /api/admin/dead-channels[?fresh=1]` e `DELETE /api/admin/dead-channels/<ck>`; `GET /api/admin/insight/<id>` ha `chk`.
- Lettore nativo (payload di `NATIVE.play`): `engLearn`, `pre: { free }`; il lettore aggiunge `engDef`. Ponte: `caps()`, `engMemo()`, `storage()`, `trimDisk()`, `voiceStart()` (solo con il riconoscimento vocale).

**Limiti e scelte prudenti**
- **Preparare qualche secondo del canale successivo con un secondo lettore** è rimandato: con le linee a una connessione (le più comuni) il server lo conterebbe come un altro dispositivo e potrebbe rifiutarlo o chiudere quello in visione; e il secondo lettore andrebbe creato con buffer più piccoli che media3 1.4 non permette di cambiare dopo. Oggi si prepara solo il DNS (senza rischi); l'interfaccia passa già al lettore le connessioni libere (`pre.free`) per farlo più avanti solo con almeno 2 connessioni libere, dispositivo O e linea ottima.
- I canali non funzionanti si riconoscono dal numero del flusso: funziona con Xtream e con le liste M3U di tipo Xtream (`/live/utente/password/numero.ts`); per le altre M3U il canale non viene mai segnalato.
- «Adesso per te» e i promemoria hanno bisogno di qualche giorno di visioni per comparire; il motore imparato di qualche cambio di motore riuscito.

## 32. Kairos XC «intelligente» (interruttore «Funzioni intelligenti»)

> **Per ora non attivo.** Il titolare ha deciso di lasciare Kairos XC alla 3.4.0 (leggera, per le chiavette da 1 GB): la versione intelligente è nel ramo `xc-intelligente` del repo `kairos-xc`, non pubblicata. Finché resta così, nel Controllo remoto di Kairos XC non compaiono «Funzioni intelligenti» né «Assistente IA» (l'app le ignorerebbe). Quando si pubblica quella versione basta rimettere `'xc'` nelle due voci del catalogo `RC_CAT` in `cloudflare/src/worker.js`.

- **Controllo remoto › Kairos XC › «Funzioni intelligenti»: Accese | Spente** (profilo di tutti i clienti XC o singolo cliente, che vince sul profilo). **Spente di serie**: Kairos XC fa quello che faceva prima.
- Accese, Kairos XC porta le funzioni della Kairos Pro (§30 e §31) in versione leggera per le chiavette da 1 GB: lettore imparato per formato (solo con «Automatico»), auto-controlli silenziosi nei menu con l'esito nel battito (`chk`: «Salute delle app» e «Dati» › Auto-controlli), DNS del canale successivo, promemoria dei programmi e delle squadre seguiti, pagine «Per te» e «Stasera» (due pulsanti discreti nella Home), assistente IA in Cerca (frasi, domande libere) e ricerca a voce.
- Sempre attive anche con l'interruttore spento (non costano nulla e correggono soltanto): **decoder del dispositivo** (letti una volta: 4K → FHD, HEVC → H.264 fra le versioni dello stesso canale) e **canali non funzionanti** (stesso contratto della Pro: `ck` negli errori, anche da VLC, `dv`/`dead` nel battito; il canale va in fondo alla lista con «non disponibile»).
- **Assistente IA** per i clienti XC: stessi endpoint della Pro (`/api/player/ai`); il motore lo sceglie il titolare come per la Pro: scheda del cliente, poi **profilo Kairos XC › «Assistente IA»** (nuova voce, solo profilo), poi la pagina Assistente IA (Gemini di serie); stesse domande al giorno e «Chiedi altre domande».
- Arriva ai clienti con il **prossimo APK di Kairos XC** (repo `kairos-xc`); il pannello è già pronto.

## Struttura

```
android/            progetto Android (Kotlin, WebView) — Fire TV / Android TV / telefoni
player/index.html   interfaccia dell'app (stile Netflix), copiata nell'APK durante la build
cloudflare/
  src/worker.js     API + sicurezza
  src/store.js      store aperto: conteggi di store e download, compatibilità con gli store vecchi (/api/store)
  migrations/       tabelle del database D1
  public/panel/     pannello (HTML + JS)
  wrangler.toml     configurazione Cloudflare
.github/workflows/  compilazione APK, pubblicazione pannello, generazione segreti
```

L'app è solo un lettore e non contiene canali: i contenuti arrivano dalle playlist che assegni. Assicurati di avere i diritti per distribuirli.

## 33. Adulti fuori dalla Home in tutte le app (9 novembre 2026)

Richiesta del titolare: nella Home dei clienti non devono uscire contenuti per adulti, in nessuna app.

- **Pannello → Richieste e controllo → «Home dei clienti · tutte le app»**: spunta **«Nascondi gli adulti dalla Home»**. Mette la voce `adult` = `off` nei profili di tutte e 7 le app (Pro, TV, Premium, Lite, XC, Plus, Nova) e il cliente non la può riattivare. Se le app hanno valori diversi, la spunta è «a metà». Togliendola, la voce viene tolta: nella Pro decide il cliente (di base nascosti), nelle altre app restano nascosti.
- **Profilo di ogni app (sezione Home)**: voce «Contenuti per adulti nella Home» con *Nascosti* o *Visibili*. Si può cambiare anche per il singolo cliente.
- **Riconoscimento**, uguale in tutte le app e provato con gli stessi 94 esempi in ognuna:
  - nomi normalizzati: NFKD, senza accenti, minuscolo;
  - **categorie** con xxx, adult/adulti, +18 / 18+, porn, erotic/erotico/erotik, hentai, playboy, brazzers, hustler, dorcel, OnlyFans, red light, x-rated, VM18, sexy, hot club, private tv, milf, nsfw, «vietato ai minori». «Adult Swim» è escluso;
  - **titoli e canali** solo con parole forti: xxx, porn, hentai, brazzers, playboy tv, hustler tv, dorcel, OnlyFans, +18/18+. Così «Sex Education» o «The Hustler» restano;
  - flag Xtream `is_adult`.
- **Cosa sparisce dalla Home**: righe delle categorie, categorie in primo piano, titolo in evidenza (che sceglie fra gli altri titoli), novità, tendenze e top 10, consigliati, «Adesso per te», «La mia lista», coda, registrazioni, continua a guardare, canali recenti e in onda (dove l'app li ha). Negli elenchi le categorie per adulti restano in fondo e raggiungibili, con il PIN invariato. Ricerca e guida completa non cambiano.
- **Versioni già installate**: TV, Premium, Lite, XC, Plus e Nova conoscono solo «Categorie nascoste dalla Home» (`home.hide`). Per loro il Worker aggiunge da solo le parole per adulti (`ADULT_HOME_WORDS`) a `home.hide` nel battito e all'apertura (`rcSent`), quando `adult` non è `on`. Così già oggi spariscono dalla Home le righe delle categorie per adulti e i loro titoli. Il pannello mostra sempre la lista scritta dal titolare. L'impronta «applicata» si calcola uguale in `remote-panel.js` (`sentOf`): se cambia il calcolo in un posto va cambiato anche nell'altro. Le versioni nuove delle app fanno il riconoscimento completo.
- **Liste «Categorie in primo piano» e «Categorie nascoste»**: fino a 40 nomi (prima 20). Il pulsante «＋ categorie per adulti» aggiunge anche +18, onlyfans, brazzers, x-rated…
- **Prove**: v250 (server: voce, parole, impronta, spunta, singolo cliente, 40 nomi), v251 (interfaccia: spunta, «a metà», cliente «applicata»), Pro nel browser (94 esempi, tutte le righe della Home, «La mia lista», titolo in evidenza, voce del pannello che vince sul cliente, adulti in fondo agli elenchi).

## 34. Download dal pannello e repo privati

Obiettivo: poter rendere **privati** i repository GitHub delle app (kairos-iptv, kairos-tv, kairos-premium, kairos-lite, kairos-xc, kairos-flutter, Lairos-nova, kairos-store) senza rompere download e aggiornamenti. Il pannello è il **punto unico di download**; funziona già oggi con i repository pubblici.

**Indirizzi (contratto con le app nuove)**
- `GET /get/<id>.json`, id = `tv`, `premium`, `lite`, `xc`, `plus`, `nova`, `store`, `pro`: il feed dell'ultima release **com'è nel file della release** (`kairos-tv.json`, `kairos-premium.json`, `kairos-lite.json`, `kairos-xc.json`, `kairos-plus.json`, `kairos-nova.json` della release «latest»; per la Pro `kairos-tv.json` della release «kairos-tv» di kairos-store). Ogni link GitHub diventa `<dominio>/get/<id>.apk` (Nova: `urlArm32` → `/get/nova-arm32.apk`); nessun github.com né nome del titolare. Release vuota (Premium 1.7.0/1.7.1): la più recente che ha il file. Store: `{version, versionCode, url, date}` dalla sua release (v1.0.131 → versionCode 131, come nella build). Cache di 5 minuti; se GitHub non risponde resta l'ultimo feed letto, altrimenti **502** (per le app: nessun aggiornamento). JSON, CORS aperto.
  - Solo **Nova** (non si registra): il feed porta anche `policy` = `bgupd` e `force` del profilo «nova» del controllo remoto, come `/api/player/update`; in memoria 60 s (niente lettura del database a ogni richiesta). Database non raggiungibile: l'ultima letta, altrimenti nessun campo (l'app tiene la politica salvata). Test v264.
- `GET/HEAD /get/<id>.apk`: APK **in streaming dal Worker**, mai un rimando a GitHub. **Range** (206, `Content-Range`, 416) e `If-Range`: i download interrotti riprendono; se intanto è uscita una versione nuova si riparte da zero.
- `/store/…`: la pagina dello store.
- `/api/player/update` (lo usano già Kairos Pro e Kairos Nova installate): il link dell'APK ora è `/get/<id>.apk` (solo se è lo stesso file; i link scritti a mano nel pannello restano com'erano).
- I link usano il dominio della richiesta: funzionano su qualunque dominio collegato al Worker.

**Senza token** (come prima): link pubblici delle release (nessun limite di richieste) e GitHub Pages.
**Con il token**: API GitHub autenticata per release, feed, APK (GitHub dà un indirizzo firmato che il Worker scarica **senza** token) e file di `docs/` di kairos-store (ramo main, al più ogni minuto, con l'ETag: le risposte «non cambiato» non consumano il limite di 5000 richieste all'ora). Se l'API rifiuta il token o non risponde si torna ai link pubblici (finché i repository sono pubblici). Il token resta nel Worker: mai in risposte, log o errori.

**Creare il token** (una volta)
1. GitHub → foto profilo → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. Nome `kairos-download`, *Resource owner* il tuo account, scadenza (es. 1 anno: rinnovalo prima, GitHub avvisa per email).
3. *Repository access* → **Only select repositories** → gli 8 repository: kairos-iptv, kairos-tv, kairos-premium, kairos-lite, kairos-xc, kairos-flutter, Lairos-nova, kairos-store.
4. *Permissions* → *Repository permissions* → **Contents: Read-only** (Metadata: Read-only si aggiunge da solo). Nient'altro.
5. **Generate token** e copialo (`github_pat_…`).
6. Repository **kairos-iptv** → Settings → Secrets and variables → Actions → **New repository secret**: nome `GH_RELEASES_TOKEN`, valore il token.
7. Actions → **Pannello Cloudflare** → *Run workflow* (o il prossimo push su main): il token arriva al Worker come segreto `GH_TOKEN`. Senza il segreto la pubblicazione va avanti come prima.
Per toglierlo: revoca il token su GitHub, oppure Cloudflare → Workers → kairos-panel → Settings → Variables and Secrets → `GH_TOKEN` → Delete (togliere solo il segreto da GitHub non basta: il Worker tiene l'ultimo valore).

**Quando rendere privati i repository** (passo 3, più avanti): quando quasi tutti i clienti hanno le app nuove che chiedono `/get/<id>.json`, e dopo aver messo il token e controllato che i link sopra rispondano uguale. Con i repository privati:
- TV, Premium, Lite, XC e Plus **vecchie** leggono il feed direttamente da GitHub: non trovano più aggiornamenti (si aggiornano solo installando la versione nuova). Pro e Nova installate passano già dal pannello e continuano ad aggiornarsi.
- Kairos Store attuale controlla i propri aggiornamenti dall'API GitHub: smette di aggiornarsi da solo; la sua pagina chiede a GitHub solo il numero di versione del piè di pagina.
- GitHub Pages sparisce: gli store e i link devono usare `/store/` del pannello. Anche codici Downloader e link condivisi che puntano a github.com vanno cambiati con `/get/<id>.apk`.

**Dominio dei download: store-k.download**
- In `wrangler.toml` → `[vars]`: `DL_HOSTS = "store-k.download,www.store-k.download"`. Su questi host il Worker risponde solo a `/get/<id>.json`, `/get/<id>.apk`, `/store/…` e `/` (→ `/store/`); tutto il resto (pannello, `/admin`, `/app`, API, accesso) è **404** e nessuna intestazione nomina panel-kairos.com o workers.dev.
- **Collegato** (9 novembre 2026): `store-k.download` e `www.store-k.download` sono nella riga `routes` di `wrangler.toml`, accanto a panel-kairos.com. Requisiti (già soddisfatti):
  1. il dominio è nello **stesso account Cloudflare** del pannello ed è **Active**, senza record DNS sullo stesso nome (DNS e certificato li crea Cloudflare quando collega il dominio);
  2. il token `CLOUDFLARE_API_TOKEN` ha *Zone → Workers Routes → Edit* su **All zones**, quindi copre anche la nuova zona.
  - La riga `routes` deve restare **su una sola riga**: se Cloudflare rifiuta un dominio, il workflow la toglie con `sed` e pubblica senza cambiare i domini già collegati (avviso nel log): ricontrolla zona, record DNS e token.
- **Prove**: v260 (feed senza token, release vuote, cache, 502, CORS, altro dominio, `/api/player/update`), v261 (APK con Range, If-Range, 416, HEAD, nessun rimando), v262 (token e repository privati: API, indirizzi firmati senza token, store da `docs/`, ETag, token mai in risposte e log, ritorno ai link pubblici), v263 (store-k.download: solo download e store, tutto il resto 404).
