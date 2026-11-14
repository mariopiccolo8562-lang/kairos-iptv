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
2. Per pubblicare una versione basta cambiare il numero in `android/versione.txt` su `main` (per esempio da `2.7.4` a `2.7.5`): la compilazione di quella modifica crea il tag e pubblica la release, senza passare da GitHub. La regola sta in `.github/scripts/versione.sh` (provata a ogni compilazione): pubblica solo da `main` e solo se la versione è nuova e più alta dell'ultima; con un numero non valido, più basso o già pubblicato esce solo l'APK di prova, e le altre modifiche a `main` non pubblicano nulla. Vale ancora anche il modo a mano: **Releases → Draft a new release**, tag `v1.0.0`, poi *Publish*. Dopo pochi minuti l'APK `kairos.apk` compare allegato alla release.
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
- Nel modulo **Nuovo sotto-agente** (anche quando entri per assistenza nel pannello di un agente) chi lo crea vede **solo quello che gli hai dato**: permessi, pagine, pannelli (Armada, Storm, WOLF, Atlantix…), voci della Sezione App, DNS di OrbixPlay/MaxPlayer e add-on che non ha non compaiono più (prima restavano grigi e sembravano assegnabili). Sono solo nascosti: salvando, gli elenchi del sub restano com'erano. Attivare, rinnovare, disattivare, disconnettere, playlist, collegare dispositivi, dashboard, clienti dei sotto-agenti e codici Downloader sono **accesi di serie**: se non vuoi che un reseller li dia, spegnili nella sua scheda.
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

## 35. Riquadro della qualità nel lettore, deciso dal pannello (9 novembre 2026)

Il riquadro in alto a destra del lettore, «FHD · 1080p · 50 fps», compare quando il cliente apre un canale in diretta, cambia risoluzione o apre la barra informazioni. Ora lo decide il titolare, per tutte le app insieme.

- **Pannello → Controllo remoto → card «Riquadro della qualità nel lettore · tutte le app»**. Le scelte:
  - **Completo**: `FHD · 1080p · 50 fps`.
  - **Senza sigla**: `1080p · 50 fps`, senza HD, FHD, 4K e SD.
  - **Nascosto**.
  - **Non imposto**: come prima.
  
  Il valore va nei profili di tutte e 7 le app (`PUT /api/admin/rctl/all {rc:{qbox}}`). Poi si può cambiare per una sola app (profilo, sezione *Aspetto*) o per un solo cliente.
- **Voce rc `qbox`**: `"full"` | `"noq"` | `"off"`. Vuota o assente vale «completo». Arriva con il battito e la registrazione, come `adult`. È nel gruppo *Aspetto*, non *Lettore*, quindi non ha `:allow`: decide il titolare, non il cliente.
- **Regole comuni a tutte le app:**
  - **`off`**: niente riquadro (all'apertura, al cambio di risoluzione, con la barra informazioni). L'interruttore del cliente sparisce dove c'è: Pro «Indicatore risoluzione», Nova.
  - **`noq`**: il riquadro resta, ma senza la sigla.
  - Il permesso «Vedere risoluzione e FPS» (`resInd`) bloccato sul singolo cliente vince sempre.
  - Non cambiano nomi dei canali, avvisi, qualità adattiva e dati mandati al pannello («Online ora»).
- **Kairos Pro:**
  - **Interfaccia (OTA)**: al lettore nativo passa `res:false` con `off` e `resTag:false` con `noq`. Con `noq` e `off` spariscono anche le sigle HD/FHD/4K/SD accanto ai canali (lista, anteprima, guida, Home).
  - **Lettore nativo (`android/`)**: con `resTag:false` scrive solo risoluzione e FPS. Serve la prossima versione della Pro: le versioni installate ignorano `resTag` e, con `noq`, mostrano ancora il riquadro completo. `off` funziona subito.
- **TV, Premium, Lite, XC, Plus, Nova**: leggono `rc["qbox"]` dalla prossima versione di ciascuna. Le versioni installate continuano a mostrare il riquadro completo.
- **Test**:
  - `v270` (pannello): catalogo, «per tutte le app», battito e registrazione, valori non validi, voce tolta, profilo di una sola app e del singolo cliente, impronta.
  - `ui_qbox` (card del pannello in Chromium).
  - `p_qbox_pro` (interfaccia Pro).

## 36. Aspetto del pannello: Futuro, Misto, Classico (10 novembre 2026)

Cambia **solo la grafica** del pannello. Server, database, clienti, linee, crediti, agenti, permessi, impostazioni e attivazione restano uguali. Il file è `cloudflare/public/panel/look.js`, caricato per ultimo.

- **Come si sceglie**: ci sono due punti, il pulsante **«Aspetto»** sotto il logo (nella barra a icone si chiama «Stile») e il cerchio con l'iniziale in alto a destra. Il pulsante sotto il logo c'è anche nel Classico, così si torna sempre indietro. Ci sono tre scelte:
  - **Futuro** (predefinito): barra a icone (il nome compare passandoci sopra), in alto «KAIROS» con ruolo e orologio, titoli con scritte spaziate, sfondo con aurora, griglia e stelle (fermo: vedi §37).
  - **Misto**: stessi colori e stessa console, menu con le scritte, sfondo calmo.
  - **Classico**: il pannello com'era prima, identico (verificato pixel per pixel).
  
  La scelta vale per il dispositivo (`localStorage` `kxLook`) e resta dopo il ricaricamento. Anche gli agenti partono da Futuro e possono cambiarla.
- **Home, console di attivazione**: si scrive il codice della TV e si preme *Attiva*. Si apre la stessa attivazione di «Nuovo cliente», con il codice già nel suo campo; la ricerca della linea collegata ai pannelli è quella di sempre. Attorno al logo compaiono i pannelli delle linee già caricate.
  - Sul telefono, in Futuro, c'è un grande pulsante rotondo «ATTIVA» che apre l'attivazione.
  - La console compare solo a chi può attivare clienti. Il campo del codice compare solo a chi ha il permesso «Creare».
- **Home, stato del servizio**:
  - Mostra clienti attivi, online adesso e linee attive, con i numeri che il pannello ha già.
  - *Energia crediti* mostra i crediti dei pannelli già presenti nel riepilogo delle linee.
  - Non fa nessuna chiamata nuova al server.
- **Pulsanti animati** (Futuro e Misto):
  - si alzano e si illuminano al passaggio del mouse e si schiacciano al clic;
  - un'onda di luce parte dal punto toccato;
  - un lampo attraversa i pulsanti principali;
  - le icone dei riquadri e del menu si muovono;
  - il pulsante centrale del telefono «respira».
  
  Il Classico non ha animazioni.
- **Soldi da incassare subito in Home** (Futuro e Misto): sopra la console c'è la riga «Da incassare».
  - Mostra i clienti che devono pagare, con il totale e il più vecchio, e gli agenti che ti devono euro o crediti, presi dal registro.
  - Il pulsante *Apri Soldi* porta alla pagina dei pagamenti.
  - Quando nessuno deve niente compare «✓ Nessuno ti deve soldi».
  - L'agente vede i suoi clienti e quanto deve al fornitore.
  
  Anche il riquadro *Soldi* della Home, in tutti gli aspetti, mostra gli agenti che ti devono. Sono solo dati già caricati: `KXPay.agentDebtSummary`, `KXPay.ready`.
- **«Riduci movimento»** del sistema: tutte le animazioni restano ferme.
- **Colori dei pannelli IPTV** (solo Futuro e Misto), per un contrasto giusto. Prima i riquadri erano blocchi pieni con testo bianco su azzurro, verde acqua e arancio, con contrasto fra 2,7:1 e 4:1.
  - I riquadri delle statistiche (WOLF, Armada, Storm, Atlantix, Realott, SLT e il riepilogo «Linee attivate») ora sono in vetro scuro, con numeri ed etichette a contrasto da 7:1 in su.
  - Il colore dice cosa significa il numero: verde attivi, ciano online, ambra in scadenza, rosa scadute, grigio totali e disattivate, viola prove.
  - I riquadri dei pannelli nel riepilogo tengono il colore del pannello.
  - «💰 da pagare» è ambra e diventa grigio quando è 0.
  - «Nuova attivazione: App e Linea IPTV» usa un rosso più profondo (testo bianco 4,7:1 e più).
  - Nelle righe WOLF, sotto i 1920 px, i pulsanti vanno sotto i dati, così utente, scadenza e stato non si accavallano.
- **Copia del pannello di prima**: ramo `backup-pannello-classico`. Per togliere tutto basta eliminare la riga `<script src="look.js">` da `index.html`.
- **Test**: `ui_look` (68 controlli: Classico identico, console, scelta dell'aspetto e pulsante sotto il logo, soldi in Home, pulsanti animati, contrasto dei riquadri WOLF, telefono, «riduci movimento») e tutti i test UI precedenti passano anche in Futuro.

## 37. Controllo del 10 novembre 2026: sicurezza, velocità, telefono

Controllo completo del pannello come titolare, reseller e sub reseller, su computer, tablet e telefono: 252 pagine visitate, 89 indirizzi del server provati da ogni agente.

- **Reseller e sub reseller non vedono dati altrui**.
  - Il server non dà a un agente DNS, server, clienti, messaggi, pagamenti o pannelli del titolare o di un altro agente. L'unica eccezione voluta è il codice che l'agente stesso scrive nella ricerca del codice.
  - **WOLF**: all'agente non arrivano più né l'indirizzo del pannello WOLF del titolare né il suo DNS. Prima l'indirizzo compariva nel modulo «collega il tuo account» e il DNS tornava indietro dopo il collegamento. Il server usa comunque l'indirizzo del titolare.
  - **Stessa scheda del browser**: se esce un account ed entra un altro senza ricaricare, la pagina si ricarica da sola. Così in memoria non resta nulla del primo, per esempio le linee dei pannelli o la ricerca.
- **Sicurezza**:
  - **Link di accesso rigenerato**: chi era entrato con il link vecchio viene scollegato subito. Prima restava dentro fino a 30 giorni. Si scollegano anche le altre sessioni dell'agente, che rientra con il link nuovo o con la password.
  - Già presenti e verificati:
    - sessione con cookie `HttpOnly`, `Secure` e `SameSite=Strict`, che scade dopo 30 giorni senza uso;
    - protezione CSRF;
    - blocco dell'IP dopo 5 errori;
    - Turnstile, se configurato, e 2FA;
    - intestazioni di sicurezza (CSP, HSTS, frame vietati);
    - agenti che vedono solo ciò che è loro permesso;
    - service worker senza cache dei dati.
- **Velocità**, misurata con 1500 clienti e un telefono lento simulato (processore 4 volte più lento):
  - **Futuro fluido**: lo sfondo (aurora, griglia, stelle) ora è fermo. Il bordo della console gira solo mentre scrivi il codice, sul computer. L'anello del pulsante «ATTIVA» del telefono gira con la scheda grafica. Risultato: da 27-37 a 60 fotogrammi al secondo; l'aspetto è lo stesso.
  - **Pagina Clienti**: la vecchia tabella nascosta non si riempie più. Con le schede si vedono comunque le prime 60, poi «Mostra altri». Prima c'erano 37.000 elementi in più. Apertura sul telefono lento da 0,9-1,4 s a 0,3-0,4 s; scorrimento da 46 a 60 fotogrammi al secondo.
  - **Errori delle app**: con la pagina chiusa, il controllo ogni 30 secondi chiede solo quanti sono i nuovi (`/admin/app-errors?count=1`). Prima scaricava l'elenco completo, fino a 2000 righe. L'elenco si scarica aprendo la pagina.
  - **Ricerca globale**: i pannelli che rispondono «non collegato» non si richiedono più per 10 minuti. Prima erano 6 richieste a vuoto ogni volta.
  - All'avvio, il grafico nascosto non si anima più e l'orologio in alto non ricalcola la pagina.
- **Telefono**:
  - Nessuna pagina scorre più di lato. Prima scorrevano di lato *Codici downloader*, il *Riepilogo store*, *Clienti* (barra delle app), *API* e la *Videoteca*.
  - Le schede dei codici Downloader non escono dallo schermo: i link lunghi finiscono con «…» e il pulsante «Copia» copia il testo completo.
  - La barra dei codici in alto parte dal primo codice. Prima partiva tagliata a metà.
- **Test**:
  - `v300`: WOLF senza indirizzo né DNS per l'agente, link rigenerato che scollega, numero dei nuovi errori uguale all'elenco per titolare e agente.
  - `ui_audit` (19 controlli): tabella nascosta vuota, Futuro fermo e fluido, nessuna pagina più larga del telefono, controllo errori leggero, ricarica al cambio di account.
  - Passano tutti i test dell'interfaccia e del server, tranne 5 test vecchi che aspettano risultati superati da modifiche precedenti: v26, v32, v45, v55, v161.

## 38. Store nel menu: tutto lo store in un posto (10 novembre 2026)

- **Voce «Store»** nel menu, fra Agenti e Solo Master; c'è anche il riquadro in Home. La vede solo il titolare. Dentro ci sono tre schede:
  - **App dello store**, che si apre per prima;
  - **Riepilogo store**;
  - **App Kairos**.
  
  Le ultime due prima stavano fra le 18 schede di «Solo Master».
- **App dello store** è il pannello a parte dello store (Worker `kairos-store`) portato dentro Kairos Control. Usa lo stesso elenco, `docs/apps.json` del repository kairos-store, con le stesse voci e regole.
  - **Per ogni app**: nome, etichetta, colore, descrizione, link all'APK, codice Downloader, pacchetto, icona (caricata e ridotta a 144×144), logo trasparente, nascondi, ordine con le frecce, elimina.
  - **Per lo store**: nome, contatto e frasi in alto.
  - **Salva** scrive su GitHub con il commit «Aggiorna app dal pannello Kairos Control»; lo store mostra le app nuove entro un minuto.
  - Se l'elenco è cambiato altrove nel frattempo, il pannello avvisa e tiene le modifiche. Un'app incompleta non si salva: il pannello la apre e dice cosa manca.
  - Il registro attività segna «app dello store salvate (N visibili su M)».
- **Per salvare serve `STORE_GH_TOKEN`**, un segreto del repository kairos-iptv. Va passato al Worker dal workflow «Pannello Cloudflare».
  - Il token è a grana fine: solo kairos-store, «Contents: Read and write».
  - Resta sul server e non arriva mai al browser.
  - Senza il token la pagina mostra l'elenco solo da vedere, con i tre passaggi per aggiungerlo.
- **Sicurezza**:
  - `GET/PUT /api/admin/store-apps` e `POST /api/admin/store-apps/icon` sono solo del titolare. Agenti, sub e titolare in assistenza ricevono 403 e non parte nessuna richiesta a GitHub.
  - Le icone devono essere PNG o WEBP vere, al massimo di 400 KB.
  - I dati sono controllati come nel pannello dello store.
  - Uscendo dal pannello la pagina si svuota.
- **Il pannello a parte dello store** continua a funzionare. Vale l'ultimo salvataggio: se uno dei due salva sopra l'altro, il secondo avvisa. Quando non serve più si può spegnere da Cloudflare.
- **Futuro**: sugli schermi bassi dei portatili la barra a icone è più compatta, così entrano tutte le voci con «Esci».
- **Test**: `v301` (server, GitHub finto), `ui_store_apps` (19 controlli), `ui_store_menu` (35).

## 39. Verifica in due passaggi facile anche da iPhone (10 novembre 2026)

- **Problema**: a ogni clic su «Attiva» nasceva una chiave nuova. Il telefono restava con quella vecchia e il codice risultava «non valido». La chiave andava anche scritta a mano, 32 caratteri.
- **Ora**, in Sicurezza e account (Solo Master per il titolare, Sicurezza per gli agenti):
  - **QR da inquadrare**: app Password dell'iPhone → *Imposta codice di verifica* → *Scansiona codice QR*, oppure Google Authenticator. Il QR è disegnato nel browser da `qr.js` (standard ISO 18004, versioni 1–10): la chiave non va a servizi esterni.
  - **«Aggiungi al telefono»**: è un link `otpauth://`. Sul telefono compare per primo e apre l'app dei codici; il QR resta in «QR per un altro telefono».
  - **«Copia chiave»** copia la chiave senza spazi; la chiave mostrata va a capo solo fra i gruppi di 4.
  - **La chiave resta la stessa** finché non confermi (`/admin/totp/setup` la riusa). «Chiave nuova» (`fresh: true`) la cambia.
  - Gli aggiornamenti automatici del pannello non chiudono più il riquadro né cancellano il codice scritto.
  - Il campo del codice ha `autocomplete="one-time-code"`: l'iPhone suggerisce il codice sopra la tastiera.
  - Se il codice è sbagliato, il pannello spiega cosa controllare: la chiave di adesso sul telefono e l'ora automatica.
- **Telefono**: la barra dei codici Downloader resta sul primo codice anche cambiando pagina.
- **Test**:
  - `v302`: chiave riusata, «Chiave nuova», codice vecchio rifiutato, per titolare e agente.
  - `ui_totp`, 17 controlli: il QR si legge con OpenCV e contiene il link giusto, poi copia, riquadro stabile, attivazione e accesso con il codice.
  - In più, 62 QR di prova da 1 a 213 caratteri, tutti letti.

## 40. Codici di recupero della verifica in due passaggi (10 novembre 2026)

Funzionano come nel pannello a parte dello store, per il titolare e per gli agenti.

- **Quando si attiva la verifica** compaiono **10 codici di recupero**: 8 caratteri senza lettere che si confondono, nella forma `K7M4-P3XZ`.
  - Si vedono una volta sola, con «Copia», «Scarica» (file `kairos-codici-recupero.txt`) e «Li ho salvati».
  - Gli aggiornamenti del pannello non li nascondono.
  - Nel database c'è solo l'impronta (HMAC con `ENC_KEY`), in `settings`, chiave `totprec:<id>`.
- **All'accesso**, sotto il campo del codice c'è «Hai perso il telefono? Usa un codice di recupero».
  - Ogni codice vale una volta, anche con il link personale dell'agente.
  - Il registro attività segna «accesso con un codice di recupero (ne restano N)».
  - Un codice sbagliato conta come errore di accesso, quindi c'è il blocco dell'IP dopo 5.
- **Sicurezza e account** mostra quanti codici restano: con 2 o meno compare un avviso.
  - «Nuovi codici di recupero» chiede password e codice dell'app, e i vecchi smettono di valere: `POST /admin/totp/recovery`.
  - Disattivando la verifica, o quando il titolare la azzera a un agente, i codici spariscono. In assistenza non si possono creare.
- **Test**:
  - `v303`, 22 controlli: titolare, agente, link personale, codice usato due volte, nuovi codici, azzeramento, assistenza.
  - `ui_totp`, 27 controlli.


## 41. Codici Downloader nello store, nome e ruolo sotto il logo (10 novembre 2026)

- **App dello store** (Store → App dello store), solo per il titolare:
  - **Ogni app mostra il suo codice** nell'intestazione: `DL 618101`, oppure «SENZA CODICE».
  - **Una riga in cima all'elenco** dice quante app hanno il codice. Elenca:
    - quelle di cui il pannello lo conosce già;
    - quelle da scrivere a mano, con il link a go.aftvnews.com dove si crea;
    - quelle con un codice diverso da quello del pannello.
  - **«Aggiungi i N codici»** riempie le app senza codice con i codici del pannello. Poi si preme «Salva».
    - App Kairos: codici di Impostazioni → App e aggiornamenti. L'app si riconosce dal link `/get/<app>.apk` o dal nome.
    - Altre app: «Codici Downloader», con lo stesso nome o lo stesso link.
    - Se due voci hanno lo stesso nome e codici diversi (per esempio «IBO Pro» e «IBO-PRO»), il pannello non sceglie.
  - **Nella scheda dell'app**, se il pannello ha un altro codice, compare «Nel pannello è … · usa questo».
  - Il codice resta un promemoria: lo store non lo mostra ai clienti.
- **Nome e ruolo sotto il logo che gira**: «KAIROS» e poi il ruolo. Il titolare vede «Master»; un agente creato dal titolare «Reseller»; un agente creato da un agente «Sub reseller».
  - **Futuro su computer**: il ruolo sta in una pillola sotto il logo. In alto resta l'orologio, così «KAIROS» non compare due volte.
  - **Tablet, in tutti gli aspetti**: la barra stretta mostra nome e ruolo sotto il logo. Sugli schermi bassi il logo si rimpicciolisce.
  - «Esci» non si schiaccia più: se non c'è spazio, la barra scorre.
- **Piccole correzioni**:
  - La pagina di accesso non mostra più «Sessione scaduta» alla prima visita.
  - Entrando in assistenza, l'aggiornamento in sottofondo dei debiti non dà più errore.
- **Test**:
  - `ui_store_dlcodes`, 17 controlli.
  - `ui_logo_role` (tablet: KAIROS e ruolo interi sotto il logo).
  - `ui_look` (Futuro: KAIROS e «Master» sotto il logo, niente doppione in alto).

## 42. «Nuova attivazione» per i reseller: solo i loro pannelli (10 novembre 2026)

- **«⚡ Nuova attivazione: App e Linea IPTV» funziona già per i reseller**, ma solo con i pannelli che il titolare gli accende. I pannelli sono spenti di base. Si accendono da Agenti → l'agente → «Pannello WOLF», «Pannello Armada», «Pannello Storm», «Pannello Realott», «Pannello SLT».
- **Il reseller trova il pulsante rosso** nella pagina di ogni pannello acceso: WOLF nella scheda Linee; Armada e Storm in «Nuova linea»; Realott e SLT accanto a «+ Nuova linea».
- **Nel passo «App»**:
  - MaxPlayer e OrbixPlay chiedono «Attivare OrbixPlay e MaxPlayer dal pannello»;
  - il cliente Kairos chiede «Attivare clienti nuovi».
- **Cambiato**: il reseller vede **solo** i suoi pannelli. Prima vedeva anche gli altri in grigio, con il nome («Non disponibile per te»).
- **Atlantix**: nella procedura rapida resta solo del titolare. Il reseller con Atlantix crea le linee dalla sua pagina Atlantix; lì il pulsante rosso non compare più, perché non portava a niente.
- Il titolare vede tutto come prima. Il DNS non compare mai al reseller.
- **Test**: `ui_quick_agent`, 13 controlli.

## 43. Scadenze a 4 giorni, nomi colorati e mesi pagati nel rinnovo di massa (10 novembre 2026)

- **Menu «Tutte le scadenze»** delle linee: c'è anche **«Scadono entro 4 giorni»** (2, 3, 4, 5, 7). I giorni ora sono di calendario, come «tra N g».
- **Riquadro cliccabile «Scadono entro 4 giorni»** in WOLF, Armada, Storm, Realott e SLT: mostra solo quelle linee.
  - Atlantix ha solo il menu, perché i suoi riquadri arrivano da Atlantix.
  - Gli altri riquadri tolgono il filtro dei giorni.
- **Colore del nome** (utente e nota o cliente) in WOLF, Armada, Storm, Atlantix, Realott e SLT:
  - **rosso** se la linea è scaduta;
  - **giallo** se mancano 4 giorni o meno;
  - **grigio** se è disattivata;
  - bianco tutte le altre.
  
  Le note KAIROS di Armada e Storm ora sono bianche (prima erano gialline): così il giallo vuol dire solo «quasi scaduta».
- **Clienti → «In scadenza»**: c'è la scelta «Scadono entro 4 · 7 · 14 · 30 giorni», predefinita 14 e ricordata sul dispositivo. La seguono anche il numero in Home e il filtro delle sezioni agenti.
- **Rinnova tutte** (WOLF, Armada, Storm), per chi rinnova di 1 mese ma incassa 3 o 6 mesi:
  - c'è **«💰 Mesi pagati (per tutte)»**, più una scelta per ogni linea: 1, 3, 6 o 12 mesi;
  - dopo il rinnovo, per ogni linea segna **«Pagato fino al»** con il servizio dei pagamenti di sempre;
  - la data parte dalla scadenza di prima del rinnovo, o da oggi se la linea era già scaduta;
  - nella nota compare `[K: PAGATO fino al …]` e sulla linea il bollino verde;
  - quando la data passa, la linea va in «Deve pagare», con il promemoria;
  - il riepilogo dice «💰 pagato fino al …» per ogni linea; la nota libera di ogni riga resta.
  
  Il pulsante compare solo a chi può gestire i pagamenti.
- **Test**: `ui_scadenze`, 31 controlli.

## 44. «Tutti i pannelli» e ricerca che porta alla scheda della linea (10 novembre 2026)

- **Linee IPTV → «🌐 Tutti i pannelli»**: è la prima scheda, prima di WOLF, e la vede solo il titolare (`allpanels.js`).
  - **Riquadri da cliccare**:
    - **Online ora** (collegate adesso);
    - **Quasi scadute** (4 giorni o meno);
    - **Scadute**;
    - **Tutte le linee**.
  - **Sotto c'è un elenco unico** con le linee di WOLF, Armada, Storm, Atlantix, Realott e SLT. Per ogni linea:
    - pannello;
    - utente e nome del cliente, colorati come nelle liste;
    - scadenza con «tra N g»;
    - stato, e per chi è collegato cosa sta guardando;
    - bollino del pagamento.
  - Ci sono anche la ricerca e il filtro per pannello.
  - **Toccando una riga** si apre la linea nel suo pannello: la lista si restringe su di lei e la riga si evidenzia.
  - **Solo letture**, le stesse delle schede dei pannelli e di «Online ora terzi». Per Armada e Storm «collegato» è il controllo delle connessioni attive di sempre. Black IPTV non c'è.
  - I dati restano 2 minuti; «Aggiorna» li rilegge. Gli agenti non vedono la scheda.
- **Ricerca «presente in N pannelli»** (sotto la casella di ricerca dei pannelli):
  - il nome del pannello aperto ora si può toccare: la lista si restringe su quella linea e la sua riga si evidenzia;
  - i nomi degli altri pannelli aprono quel pannello e evidenziano la riga.
  
  Vale anche per «Cerca ovunque».
- **Clienti**: la riga «Scadono entro 4 · 7 · 14 · 30 giorni» ora sta sotto i riquadri, anche sul telefono.
- **Non fatto, per scelta**: note e scadenze scritte in KAIROS non vengono copiate da sole su WOLF, Atlantix, Realott e SLT. Quei pannelli non hanno un'API ufficiale, e per la scadenza servirebbe rinnovare, cioè spendere crediti. Il verso opposto c'è già: il cliente KAIROS «allineato» prende la scadenza dal pannello.
- **Test**: `ui_allpanels` (20 controlli), `ui_scadenze` (32).

## 45. «Tutti i pannelli» come WOLF: barra completa, spunte, riquadro di ricerca fisso (10 novembre 2026)

- **Barra in alto, come in WOLF** (`allpanels.js`):
  - cerca per utente, ID o nota;
  - stato: Tutte, Attive, Quasi scadute (4 giorni), In scadenza (7 giorni), Scadute, Disattivate, Collegate ora, Scollegate;
  - ordine del pannello e le altre 8 voci di ordinamento (scadenza, nome, connessioni, stato, reseller, create);
  - scadenze: tutte, entro 2 · 3 · 4 · 5 · 7 giorni, «💰 Deve pagare»;
  - reseller (compare solo se le linee hanno un reseller), con il nome del reseller sotto l'utente.
  - I riquadri e i pannelli contano con il reseller scelto; il riquadro sceglie anche lo stato nel menu.
- **Spunte e «Seleziona tutte (N)»**: prende tutte le linee filtrate, anche oltre le prime 200 mostrate. Con le linee spuntate:
  - **Consulta**: le schede delle linee, divise per pannello (scadenza, nota, password con Mostra/Copia, connessioni e canale, reseller, ID, creata, pacchetto, prova), con «Apri», «Modifica», «Rinnova». Esc o ✕ chiudono.
  - **Rinnova**: se le linee sono tutte di WOLF, Armada o Storm si apre il **rinnovo di massa di quel pannello con quelle linee già scelte** (note e mesi pagati come sempre). Una sola linea di Atlantix, Realott o SLT: si apre il suo «Rinnova». Linee di pannelli diversi: le schede, con «Rinnova tutte le N su WOLF/Armada/Storm» per gruppo e «Rinnova» linea per linea.
  - **Modifica**: una linea apre la sua finestra «Modifica» (per Armada e Storm la nota, che è l'unica cosa modificabile); più linee: le schede, una alla volta.
  - Nessuna conferma è saltata: ogni rinnovo o modifica passa dalla finestra di sempre del pannello, dove si annulla o si conferma. Qui non si scrive niente sui pannelli.
- **Riquadro rosso della ricerca fisso** (`xsearch.js`): dopo il primo clic su un nome il riquadro resta con la ricerca di partenza (es. «pers») anche cambiando pannello.
  - le linee già aperte hanno la ✓;
  - «↺ Torna a «…»» rimette la ricerca intera nella casella;
  - ✕ lo chiude;
  - una nuova ricerca scritta a mano, o l'uscita dalle schede dei pannelli, lo fa ripartire.
- **Correzione**: aprendo una linea da un'altra scheda, l'evidenziazione cadeva sul nome nel riquadro rosso invece che sulla riga della lista (`omni.js`). Ora salta il riquadro, e «Modifica»/«Rinnova» premono il pulsante della riga giusta.
- **Telefono**: barra a due colonne, riquadri 2×2, spunta a sinistra di ogni riga, schede di «Consulta» su due colonne.
- **Test**: `ui_allpanels` (57 controlli; ogni finestra viene annullata e il test verifica che non parta nessuna scrittura verso i pannelli).

## 46. «🟢 Online nelle app»: chi usa le app, con canale e IP (10 novembre 2026)

- **Attivazione app → «Online nelle app»** è la prima scheda e la vede solo il titolare (`appsonline.js`; agli agenti il server risponde comunque 403 su presenza e ORCP).
- **Le app dentro**, solo con letture che il pannello fa già:
  - **app KAIROS** (Pro, TV, XC, Lite, Premium, Plus, Nova, Vega): i dati della presenza che mandano le app.
    - L'app si riconosce dalla versione, come fa il server; se manca la versione vale quella salvata nel cliente.
    - Per ogni utente: cosa guarda (canale, programma e gruppo, film, serie) o «nei menu», IP con città e paese, «⚠ 2 IP» e «⚠ paese diverso».
    - Anche versione, dispositivo, rete (Wi-Fi/cavo/mobile, segnale), velocità, linea del cliente, video (risoluzione, fps, bitrate, codec, decodifica), blocchi, qualità ridotta, VPN, cliente, scadenza e reseller.
    - Ci sono anche gli offline delle ultime 24 ore, con l'ultima visione.
  - **MirkoTeam (ORCP)**: le installazioni raccolte per utente.
    - Online su N dispositivi: lo stesso dispositivo conta una volta, come in «Online ora terzi».
    - IP con VPN, dispositivo, versione e ultimo accesso; nella scheda, la tabella delle installazioni.
    - Gli offline da più di 24 ore restano fuori. ORCP non dice il canale.
  - **MaxPlayer e OrbixPlay**: le loro API non dicono chi è online né l'IP.
    - «Collegato» è il controllo delle connessioni attive della linea, lo stesso di «Online ora terzi»; compaiono tutti i loro clienti.
    - Il canale c'è se la stessa linea è anche su WOLF, Atlantix, Realott o SLT.
    - C'è il cliente KAIROS collegato, se c'è.
  - **ORA** resta fuori: non ha un'API ufficiale e non dice chi è online.
- **Riquadri**: Online ora · Stanno guardando · Offline (24 ore) · Da controllare (2 IP, paese diverso, 3+ blocchi in un'ora, qualità ridotta, più dispositivi o connessioni, probabile VPN) · Tutti.
- **Barra**:
  - ricerca per nome, codice, utente, IP, canale, città, dispositivo o versione;
  - stato: online, stanno guardando, nei menu, offline, più connessioni, da controllare, non verificabili;
  - ordine: prima chi è online, ultimo collegamento, nome, app, cosa guarda, IP;
  - reseller: «Tu» o l'agente del cliente.
  - **Ricerca per app**: un pulsante per ogni app trovata, con i conteggi.
- **Clic su una riga**: la scheda con tutti i dati.
  - **App KAIROS**: «Apri cliente» e «📊 Dati». Poi «Disconnetti» se sta guardando, e «Spegni VPN» se il cliente ha la VPN prevista. Le ultime due chiedono la conferma di sempre e la scheda resta sotto la finestra di conferma.
  - **MirkoTeam, MaxPlayer, OrbixPlay**: «Apri in …» porta alla loro scheda con la ricerca già fatta.
- **Aggiornamento**: segue il pulsante «Auto» (la pagina è nell'elenco di quelle che si rileggono da sole). Presenza KAIROS e connessioni ORCP si rileggono a ogni giro; le liste di MaxPlayer e OrbixPlay al massimo ogni 2 minuti; il controllo delle linee ha la sua cache di 90 secondi.
- **Telefono**: barra a due colonne, riquadri 2 per riga, righe a due colonne, scheda nello schermo.
- **Test**: `ui_appsonline` (43 controlli; «Disconnetti» e «Spegni VPN» vengono annullati e il test verifica che non parta niente).

## 47. Promemoria dei pagamenti con più opzioni, decisi dal titolare; «📋 Incolla» nello store (10 novembre 2026)

- **Finestra 💰 Pagamento → 🔔 Promemoria**: al posto dell'interruttore «ogni 2 giorni» ci sono **Spento · Una volta sola · Ogni giorno · Ogni 2 giorni · Ogni 3 giorni · Ogni settimana** e **Da quando**: da oggi (o «da adesso») oppure **dal giorno…** scelto, es. «paga il 15». «Una volta sola» vuole un giorno (proposto domani). Il riepilogo lo scrive per esteso («Ti ricordo ogni 3 giorni dal 20 dic 2026 finché non paga»).
- **Dove arriva** (nel pannello): la fascia in alto mostra i clienti il cui promemoria è arrivato e che su quel browser non sono ancora comparsi (ogni cliente col suo ritmo; prima un solo avviso ogni 48 ore per tutti). In **Pagamenti** ci sono l'elenco **«🔔 Da ricordare oggi»** e, sotto ogni cliente, ogni quanto e il prossimo promemoria. Rinnovi automatici non riusciti e debito verso il fornitore restano ogni 48 ore.
- **Solo Master → Impostazioni → «🔔 Promemoria pagamenti»** (`pay-remind.js`), si salva a ogni scelta:
  - **Per te**: il promemoria proposto quando segni «deve pagare» (anche «Spento»). Tu hai sempre tutte le opzioni.
  - **Per gli agenti, uguale per tutti**: interruttore generale e un interruttore per ogni opzione (una volta, ogni giorno, ogni 2, ogni 3, ogni settimana, «dal giorno…»), ognuno con «Se lo accendi / Se lo spegni». **Partono tutti spenti**; ⭐ consigliati: ogni 2 giorni, ogni settimana, «dal giorno…» (pulsante «Attiva le consigliate»). La pagina dice quanti agenti hanno il permesso «Gestire i pagamenti» e riassume cosa possono usare.
  - **Il server controlla**: un agente non usa mai un'opzione spenta (si adatta alla prima accesa, o niente promemoria). Senza indicazioni vale quello proposto. Gli agenti non possono cambiare queste impostazioni.
  - **Da sapere**: da ora gli agenti non hanno promemoria finché non li accendi (prima avevano sempre «ogni 2 giorni»).
- **Database**: migrazione `0048_pay_remind.sql` (`remind_days`, `remind_from`); i promemoria già salvati restano «ogni 2 giorni».
- **Store → App dello store**: **📋 Incolla** accanto al link dell'APK e al codice Downloader. Dal link prende solo l'indirizzo, dal codice solo le cifre, anche da un messaggio intero; se negli appunti non c'è niente di utile la casella non cambia e lo dice.
- **Test**: `srv_pay_remind` (20 controlli sul server), `ui_pay_remind` (33).

## 48. «Responsabile» quando crei un cliente da zero (10 novembre 2026)

- **Dove**: «➕ Nuovo cliente» (procedura «Attiva un cliente Kairos», `agents.js`) e «⚡ Nuova attivazione: App e Linea IPTV» → «Nuovo cliente» (`quick-act.js`).
- **Cosa fa**: c'è la tendina **Responsabile** con «Tu (nessun agente)» e gli agenti attivi. Con un agente il cliente Kairos è subito suo: lo vede e lo gestisce nel suo pannello. La linea sul pannello IPTV resta sul tuo account.
- **Solo titolare**: gli agenti non vedono la tendina (i loro clienti sono già loro). Senza scelta il cliente resta tuo, come prima.
- **Corretto**: in «Nuova attivazione» la conferma «Confermare l'attivazione?» finiva sotto la finestra e non si poteva premere (livello 41 contro 40 della conferma). Ora la finestra sta a 39 e la conferma resta sopra.
- **Test**: `ui_owner_pick` (10 controlli: tendina nei due flussi, `ownerId` mandato solo se scelto, conferma raggiungibile, niente tendina per l'agente).

## 49. Linee selezionate in primo piano: server, IP e app che le usano (10 novembre 2026)

- **Barra «presente in N pannelli»** (`xsearch.js`):
  - ogni linea ha una casella; il clic sul nome la apre come prima, la casella la spunta e rende il riquadro fisso;
  - «Tutte» spunta tutte le linee trovate (massimo 60), «Togli» le toglie;
  - **«👁 Vedi le N selezionate»** apre la schermata in primo piano (`linecard.js`, livello 38: sotto le finestre di conferma).
- **Una scheda per linea**:
  - **Server**: pannello e DNS (il DNS solo al titolare; Armada e Storm lo prendono dalla loro scheda).
  - **Stato e scadenza**, **collegata ora** (connessioni, canale in onda).
  - **IP** con provider e segno VPN: dalle connessioni di Realott, SLT e Atlantix, da MirkoTeam e dalle app KAIROS che usano la stessa linea. WOLF, Armada, Storm, MaxPlayer e OrbixPlay l'IP non lo danno.
  - **App che la usano**: clienti Kairos (con pallino online e canale), MaxPlayer, OrbixPlay, MirkoTeam («Per linea» e liste dei pannelli).
  - Nota, password nascosta (Mostra/Copia), reseller, creata, pacchetto, ID; per MirkoTeam dispositivo, versione e ultimo accesso; per MaxPlayer le liste.
  - Pulsanti «Apri in …», «Modifica», «Rinnova» (gli stessi delle schede dei pannelli); «↻ Aggiorna» rilegge connessioni e presenza.
- **«Tutti i pannelli» → «Consulta»**: la stessa scheda ha in più Server, IP e App che la usano.
- **Chi la vede**: il titolare. Agenti solo con il permesso nuovo **«Linee selezionate in primo piano»** (`lineView`), spento per tutti.
- **Niente di nuovo sui pannelli**: usa solo le letture che il pannello fa già (liste, connessioni, presenza delle app).
- **Test**: `ui_linecard` (26 controlli).

## 50. «Collega a un cliente»: elenco con ricerca e «aumenta i dispositivi» (10 novembre 2026)

- **Elenco al posto della tendina** (`cli-pick.js`): si apre sempre, con la ricerca in alto (nome, codice, nota, linea, agente; frecce e Invio). Ogni riga: nome, dispositivi usati («1 di 1 · pieno»), codice, scadenza e, per il titolare, l'agente. Scelto il cliente, il pulsante mostra nome, codice e dispositivi.
- **Dove**:
  - scheda di un dispositivo in attesa → «🔗 Collega a un cliente»; dalla lista dei dispositivi in attesa «Collega» apre la scheda con l'elenco già aperto;
  - scheda di un cliente → «↪ Metti sotto un altro cliente»;
  - «➕ Nuovo cliente» con il codice di una TV nuova → **«È la TV di un cliente che hai già? Collegala a lui»**.
- **Cliente pieno**: si può scegliere. Compare la voce **«Vuoi aumentare i dispositivi a N per collegare questo cliente?»**, accesa. La conferma lo ripete («Aumenta a 2 e collega») e il server aumenta i dispositivi insieme al collegamento (`grow`), senza aprire il cliente principale. Spenta la voce, «Collega» non parte. Nel registro: «dispositivi portati da 1 a 2».
- **Chi**:
  - il titolare, fino a 20 dispositivi;
  - gli agenti con «Collegare altri dispositivi», solo con i loro clienti e solo fino a «Connessioni per cliente» che decide il titolare; oltre vedono «chiedi al titolare» (anche il server rifiuta);
  - l'agente collega con il codice della TV: il server lo accetta solo per le TV nuove, e «cerca codice» non gli dà l'id.
- **Test**: `srv_link_grow` (13 controlli sul server), `ui_link_pick` (28).

## 51. «⚽ Eventi ora»: sport in diretta, dove vederli e striscia che scorre (10 novembre 2026)

- **Voce del menu** subito dopo lo Store (`events.js`, `menu4.js`).
- **Pagina**:
  - gli stessi eventi della Pro (`/api/player/events`) per **tutti** gli sport: calcio (Serie A, Champions, Europa e Conference League, Coppa Italia, Premier, LaLiga, Bundesliga, Ligue 1), F1, **MotoGP**, tennis ATP/WTA, NBA, NFL, UFC, rugby;
  - sezioni **🔴 In diretta** (minuto e risultato), **Più tardi** (entro 36 ore), **Finiti da poco**; filtri per sport con i conteggi;
  - **«Di solito su»**: le emittenti italiane, le stesse di «Dove vederla» della Pro (es. Serie A → DAZN, Sky Sport);
  - **«Sulla tua lista»**: i canali della lista più usata dai clienti con quel nome o gruppo, prima FHD; esclusi quelli di un altro sport (Sky Sport MotoGP non va per una partita);
  - **«🔍 Guida TV»** legge cosa va in onda su quei canali e mette ✓ dove il titolo cita le squadre o il GP.
  - Si aggiorna da sola ogni minuto.
- **Striscia in alto su ogni pagina**:
  - gli eventi in diretta e delle prossime 12 ore scorrono da destra a sinistra;
  - col mouse sopra si ferma; con la **rotellina**, trascinando col mouse o **col dito** si va avanti e indietro, poi riparte da sola;
  - clic → la pagina; ✕ la nasconde (resta nascosta), «Striscia in alto» nella pagina la riaccende;
  - con «riduci movimento» del sistema non scorre da sola.
- **MotoGP**: dall'API pubblica del sito ufficiale (`api.motogp.pulselive.com`, senza chiavi e senza documentazione: se cambia, sparisce solo la MotoGP). Si legge il GP in corso o il prossimo, con prove, pre-qualifiche, qualifiche, sprint, warm up e gara. Nelle app la MotoGP è **spenta** finché il titolare non la accende in Impostazioni → Eventi sportivi nella Home; la Pro è già pronta a mostrarla.
- **Server**:
  - `GET /admin/events`, `/admin/events/chans` (solo nome e gruppo dei canali, mai indirizzi o credenziali), `/admin/events/epg?ids=` (al massimo 12 canali);
  - le app e il pannello usano le stesse righe di cache, che non si cancellano più a vicenda;
  - la MotoGP conta 4 richieste nel limite di 40 per giro.
- **Chi**: il titolare; gli agenti solo con il permesso nuovo **«Eventi ora»**, spento per tutti.
- **Test**: `srv_events` (18 controlli sul server), `ui_events` (27).

## 52. «🔒 Repo privati» nella Home, solo per il titolare (10 novembre 2026)

- **Cosa**: promemoria per rendere privati i repository GitHub delle app (`repo-ready.js`, `GET /admin/repo-ready`, solo titolare).
- **Per ogni app**: quanti clienti visti negli ultimi 30 giorni hanno già l'ultima versione, con la barra, e **«Chi manca»** (nome, codice, versione, ultimo accesso; clic → la sua scheda).
  - Repository: Kairos Pro → kairos-store (lì c'è il suo APK), Kairos TV → kairos-tv, Premium → kairos-premium, Lite → kairos-lite, XC → kairos-xc, Plus → kairos-flutter, Nova → Lairos-nova.
  - Quando un'app è aggiornata da tutti: **«✅ Ora puoi rendere privato …»**.
  - **Kairos Store** (aggiunto il 10 novembre): riga a parte, subito dopo la Pro, con gli store visti negli ultimi 30 giorni e la versione che mandano all'apertura (`store_seen`; i browser, «web», non contano). Chi manca: modello, paese, versione, ultima apertura (nessuna scheda da aprire). Serve perché gli store più vecchi della 1.0.132 si aggiornano solo dalle release di GitHub.
  - Un repository con più righe (kairos-store: Pro e Store) è pronto solo quando lo sono tutte: la riga pronta dice «✅ Aggiornata da tutti · per kairos-store aspetta …».
- **Token**: in alto lo stato di `GH_RELEASES_TOKEN`. Senza token, con un repo privato, store-k.download non legge più gli APK.
- **Passi**: token e cambio di visibilità, nella parte che si apre. Nota sui minuti: 2.000 al mese gratis per tutti i repo privati insieme; il pannello per ultimo.
- **«Riduci»** lascia solo il titolo (resta ridotto); gli agenti non lo vedono e il server glielo nega.
- **Test**: `ui_repo_ready` (19 controlli).

## 53. Aggiornamenti delle app solo dal dominio dei download, con riserve (10 novembre 2026)

- **Richiesta del titolare**: negli aggiornamenti delle app niente più pannello (panel-kairos.com) né GitHub. Resta store-k.download, più la possibilità di un secondo dominio di riserva quando lo compra.
- **Server**:
  - **«mirrors»**: i file `/get/<id>.json` portano i domini dei download (`DL_HOSTS`, il principale per primo, senza «www.» doppio). Le app li ricordano e li provano se store-k.download non risponde. Così un dominio di riserva comprato dopo arriva anche alle app già installate, senza una versione nuova.
  - **Link dell'APK**: nei feed chiesti al pannello e in `/api/player/update` (Pro e le altre) il link è sul dominio dei download. Se la richiesta arriva da un dominio dei download resta su quello.
  - **Senza `DL_HOSTS`** (prove locali) resta tutto come prima.
- **App Kotlin** (Kairos TV, Premium, XC, Lite; `UpdFeed.kt`): le basi sono `DL_BASE` (store-k.download), poi `DL_BASE2` (variabile `KAIROS_DL_BASE2` del repository, vuota finché non c'è), poi i «mirrors» ricordati (`Store.dlMirrors`), al massimo 4. Tolti `PANEL`, `UPDATE_URL_FALLBACK` e `APK_URL_FALLBACK` (GitHub).
- **Kairos Plus e Nova** (`app_updater.dart`): stessa logica; `KAIROS_DL_BASE2` arriva con `--dart-define`, i «mirrors» restano in `dl_mirrors`. Plus 0.1.26 e Nova 1.0.25.
- **Kairos Store** (`StoreLinks.java`, 1.0.133): pagina, `/get/store.json` e app Kairos solo dalle basi dei download (le riserve imparate valgono dall'apertura dopo); tolti il pannello e la release di GitHub. Nella pagina (`docs/index.html`) i link `/get/…` delle app Kairos sono relativi sul dominio dei download e sulle riserve, di `https://store-k.download` dal pannello, da GitHub Pages e dalla copia nell'APK.
- **Kairos Pro**: nessuna versione nuova, l'APK arriva già dal link di `/api/player/update` (store-k.download).
- **Quando compri il dominio di riserva**:
  1. aggiungilo a Cloudflare;
  2. va aggiunto a `routes` e a `DL_HOSTS` in `wrangler.toml` (`routes` resta su una riga);
  3. dal deploy dopo, i feed lo annunciano e le app lo imparano al primo controllo;
  4. facoltativo: mettilo anche nella variabile `KAIROS_DL_BASE2` dei repository delle app, per le installazioni nuove.
- **Test**: `srv_dl_mirrors` (7 controlli); `UpdFeedTest` nelle quattro app (gira a ogni build su GitHub).

## 54. Scelta del cliente con la ricerca nei pannelli e ricerca in tutti i pannelli con Black IPTV (11 novembre 2026)

- **WOLF «Collega cliente»**: al posto della tendina l'elenco con la ricerca (`cli-pick.js`, come in «Collega a un cliente»). Si apre già aperto, con la ricerca pronta; in cima «— nessuno —» per togliere il collegamento; ci sono anche le TV collegate e quelle in attesa, come prima.
- **Armada «Aggiungila a un cliente»** (dopo «Crea linea»): stesso elenco con la ricerca al posto del campo con suggerimenti; «Apri la scheda» apre il cliente con la linea già tra le playlist.
- Il titolare vede tutti i clienti, l'agente solo i suoi (`D.devices` arriva già filtrato dal server).
- **Ricerca in tutti i pannelli**: la barra «Trovato anche su…» sotto le caselle di ricerca dei pannelli (`xsearch.js`) e «Cerca ovunque» (`omni.js`) ora comprendono **Black IPTV** (solo titolare): le sue linee sono quelle già lette e salvate dalla sua pagina (`GET /admin/blk/lines`), nessuna richiesta in più a Black. Anche la casella di Black IPTV cerca negli altri pannelli.
- **Test**: `ui_panel_cli_pick` (16 controlli), `ui_xsearch_blk` (8).

## 55. «➕ Dispositivo» su ogni cliente e «🏠 Casa di …» (11 novembre 2026)

- **Pulsante «➕ Dispositivo»** nella riga di ogni cliente (tabella e schede), per il titolare e per gli agenti con «Collegare altri dispositivi» (`add-dev.js`). La finestra ha tre strade:
  - **TV in attesa adesso**: le TV che hanno appena aperto l'app; un clic su «Collega». Si aggiorna da sola ogni 5 secondi. Quelle della stessa rete del cliente sono in cima con «🏠 stessa rete»;
  - **Codice della TV** (KXAB-12CD, anche in minuscolo e senza trattino);
  - **Codice a 6 cifre** se la TV è a casa del cliente.
  - Cliente pieno: «Aumenta i dispositivi a N» acceso, fino a 20 per il titolare e fino a «Connessioni per cliente» per l'agente. Nome della TV facoltativo.
- **«🏠 Casa di …»** nell'elenco «Da attivare» (solo titolare): una TV in attesa collegata dallo stesso IP di un cliente (IPv6: stessa rete /64) mostra «Collega a …», un clic. Se il cliente è pieno chiede prima di aumentare.
- **Server**: `GET /admin/devices/near` (titolare: suggerimenti per tutte le TV in attesa) e `GET /admin/devices/near?for=<cliente>` (TV in attesa delle ultime 48 ore, quelle della stessa rete prima). L'agente: solo per un suo cliente, solo TV della stessa rete viste nelle ultime 6 ore. Con più di 2 clienti sullo stesso IP (rete condivisa) nessun suggerimento. Gli IP restano sul server.
- **Test**: `srv_add_dev` (13 controlli), `ui_add_dev` (20).

## 56. «Online ora Kairos»: «Attivato da» e schede per chi ha attivato (11 novembre 2026)

- Ogni utente mostra **«Attivato da te»** o **«Attivato da <agente>»** (l'agente del cliente principale).
- Sopra «Collegati ora / Offline» le schede **Tutti · 👤 I miei clienti · 🤝 Clienti agenti** (con il filtro e il numero per ogni agente) **· 🧩 App terze**.
- **App terze**: MaxPlayer, OrbixPlay e MirkoTeam, tuoi e degli agenti, con le stesse righe e la stessa scheda di «Online nelle app». Si leggono solo aprendo questa scheda.
- **Chi ha attivato un'app terza** (`appsonline.js`): il cliente KAIROS collegato, poi chi ha creato la lista («Crea lista», `/admin/ext-lists`), poi il cliente KAIROS con la stessa linea; altrimenti «attivato da: ?». Vale anche in «Online nelle app» (filtro reseller e scheda).
- **Test**: `ui_live_groups` (16 controlli); `ui_appsonline` aggiornato.

## 57. «App consigliata» dello Store: scheda del dispositivo, app per memoria e XC sulle chiavette deboli (11 novembre 2026)

- **Pannello** (Download store → App consigliata): l'app per le chiavette deboli di serie è **Kairos-XC** (dove era salvata Kairos Tv, una volta sola diventa Kairos-XC; poi vale la scelta del titolare). Nuova voce **«Memoria richiesta da ogni app»**: di serie XC 512 MB · Tv 1 GB · Lite 1 GB · Premium 1,5 GB · Plus 1,5 GB · Pro 2 GB (`store.js`, `recommend.mem`).
- **Store** (kairos-store, 1.0.134, pubblicato come 1.0.135): sotto l'app consigliata la scheda del dispositivo e le app Kairos dalla più leggera, con ✓/✗ secondo la memoria.
- **Test**: `srv_store_rec` (7 controlli), `ui_store_rec` (5).

## 58. Dispositivi scelti dal titolare e «Illimitati» (11 novembre 2026)

- **«➕ Aggiungi un dispositivo»** (`add-dev.js`): al posto della spunta «Aumenta i dispositivi a N» c'è **«📱 Dispositivi di …»** con l'elenco: dal minimo che serve (cliente pieno) o da quelli di adesso fino a 20, più **«♾️ Illimitati»**. La scelta si applica dopo il collegamento (se il collegamento non riesce non cambia nulla) oppure subito, prima del codice a 6 cifre. L'agente sceglie solo fino al suo tetto («Connessioni per cliente»), senza «Illimitati».
- **Illimitati = 999** nel server (`CONN_UNLIM`, `connIn`): `maxConn` accetta da 1 a 20, 999 o `'unlim'`; i controlli «usati + 1 > massimo» restano quelli di sempre. Solo il titolare (anche con la chiave API); per l'agente 999 si ferma al suo tetto. Nei registri «(23, illimitati)» invece di «23 di 999».
- **Scheda del cliente** (`app.js`): «Connessioni massime» è un elenco 1-20 più «Illimitate»; nelle righe, nelle schede e nella scelta del cliente compare **∞** («2/∞», «2 dispositivi · illimitati»).
- **Agente**: se il titolare ha deciso connessioni oltre il suo tetto (anche illimitate), nella scheda le vede come «decise dal titolare» e può salvare il resto (prima il salvataggio veniva rifiutato).
- **App**: mostrano ancora «2 di 999» finché non arriva la versione che scrive «illimitati».
- **Test**: `srv_conn_unlim` (15 controlli); `ui_add_dev` aggiornato (24).

## 59. Aggiornamenti senza conferma (Android 12+) in tutte le app e nello Store (11 novembre 2026)

- **Come funziona**: la versione nuova si scarica in background come prima; quando il cliente **esce dall'app** (nessuna schermata visibile da 10 secondi) si installa da sola con `PackageInstaller` e `USER_ACTION_NOT_REQUIRED`, senza nessuna schermata. Android lo permette se l'app aggiorna se stessa, ha «Installa app sconosciute», dichiara `UPDATE_PACKAGES_WITHOUT_USER_ACTION` ed è costruita per un Android recente (targetSdk 35: fino ad Android 17).
- **Mai** durante la visione, con una registrazione in corso (Pro) o con una VPN che serve anche ad altre app; in Nova mai mentre si sente audio. Un tentativo per versione: se Android chiede comunque la conferma o non riesce, torna la proposta di sempre; dopo 3 giorni senza uscire dall'app torna la proposta; l'aggiornamento obbligatorio resta com'era.
- **Pro** (`android/.../Quiet.kt`): conta le schermate dell'app; l'interfaccia chiede `kx.quietOk(versione)` prima di proporre l'aggiornamento e `kx.quietBlocked(versione)` per la riga sul «Blocco automatico» dei Samsung. «Connessioni usate: N · illimitate».
- **App native** (TV, Premium, Lite, XC: `Quiet.kt`, `QuietTest`), **Plus e Nova** (`Quiet.kt` nativo, `quiet`/`quietBlocked` in `updateStatus`, `AppUpdater` senza proposta), **Store** (`Quiet.java`: si aggiorna da solo quando il cliente esce dallo store; targetSdk 35 con il tema che lascia la pagina tra le barre di sistema).
- **Limiti**: il primo aggiornamento chiede ancora la conferma (lo installa la versione vecchia); Fire TV e Android 11 o precedenti restano con un clic; la prima installazione dallo Store chiede sempre la conferma.

## 60. Codici usa e getta per lo Store e limite agli scaricamenti in massa (11 novembre 2026)

- **Riepilogo store → «🔑 Codici per lo Store»** (`store-codes.js`, solo titolare): interruttore **«Download solo con codice»** (spento di serie = Store aperto come prima), durata **30 minuti, 2 ore o 24 ore**, «Genera codice» ed elenco dei codici degli ultimi 30 giorni (chi l'ha generato, stato «da usare / in uso / usato / scaduto», dispositivo, app scaricate). Con l'interruttore acceso il riquadro verde «Store aperto» diventa «Download solo con codice».
- **Il codice**: 6 cifre, va scritto nello Store entro la durata; al primo uso si lega a quel Kairos Store, che per la stessa durata scarica **tutte le app** (anche quelle di Google Play/Amazon). Su un altro store non vale più. Dopo 5 codici sbagliati il dispositivo (20 per indirizzo) aspetta un'ora; al massimo 60 codici all'ora per chi li genera.
- **Chi li genera**: il titolare e gli agenti con il nuovo permesso **«Codici per lo Store»** (spento di serie). La voce **«🔑 Codice usa e getta · Kairos Store · Genera»** compare nella riga dei codici Downloader, subito dopo Kairos Store (anche in Clienti), solo con l'interruttore acceso. Finestra con il codice grande, il tempo che resta, «Copia», «Nuovo codice» e gli ultimi codici.
- **Chi l'ha usato**: «Ultimi download» dice «🔑 col tuo codice / col codice di …»; la TV in attesa sulla rete dove si è usato il codice da meno di 48 ore mostra **«📥 Scaricata col codice di …»** (`add-dev.js`); in Attività «Store: codice di … usato su …» e «… · codice di …» per ogni download.
- **Server** (`store.js`, migrazione 0049): `POST /api/store/code`, `/api/store/download` risponde 403 `need:'code'` senza una finestra aperta (e dice `codes` acceso/spento), `/hello` e `/config` dicono se serve il codice; le pagine vecchie (`/request`) passano solo con la finestra aperta. Pannello: `GET/POST /api/admin/store/codes` (titolare tutti, agente i suoi), `PUT /api/admin/store/settings { codes: { on, ttl } }`, `storeCodesOn` nello stato.
- **Pagina dello Store** (repo kairos-store, `docs/index.html`): prima di ogni download chiede il via libera al pannello; serve il codice → finestra con tastierino per il telecomando (frecce, OK, tasti numerici, Indietro chiude). Nel browser con lo Store aperto il link parte subito come sempre. Pannello irraggiungibile: si scarica lo stesso, tranne quando l'ultima risposta diceva che serve il codice.
- **Limite agli scaricamenti in massa** da `/get/*.apk` (anche store-k.download): per indirizzo (IPv6: la rete /64) al massimo 20 download che partono al minuto (`RL_APK`) e 120 all'ora (`dl_hits`), poi 429 con Retry-After 300. Il seguito di un download (Range) e HEAD non contano: aggiornamenti e negozi restano molto sotto.
- **Cosa non fa**: il codice protegge lo Store, non i file. Gli APK restano raggiungibili dai link diretti, che servono agli aggiornamenti delle app.
- **Test**: `srv_store_codes` (68 controlli), `ui_store_codes`, `store_page_codes` (la pagina vera contro il Worker vero, 33 controlli).

## 61. Accesso degli agenti: 7 giorni, 2 dispositivi, Paesi, avvisi, 2FA obbligatoria (11 novembre 2026)

- **Dove**: Impostazioni → Sicurezza e account → **«Accesso degli agenti»** (`sec-agents.js`, solo titolare). Cinque interruttori spenti di serie, ognuno con conferma prima di accenderlo, e i **Paesi consentiti** (Italia di serie; «+ Aggiungi un Paese», × per toglierne uno; almeno uno resta).
- **Accesso di 7 giorni**: la sessione di un agente vale 7 giorni da quando è entrato (non si rinnova con l'uso), poi rientra con link e codice o utente e password. Spento: 30 giorni dall'ultimo uso, come prima.
- **Massimo 2 dispositivi per agente**: al terzo accesso (utente e password o link e codice) si chiude la sessione entrata per prima; in Attività «Agente …: entrato da un altro dispositivo · scollegato quello entrato il … (Chrome su Android)». Accendendola, chi ne ha di più resta sui 2 più recenti (la risposta dice quanti `kicked`).
- **Solo da questi Paesi**: `request.cf.country` all'accesso (dopo le credenziali giuste, prima della 2FA) e a ogni richiesta dell'agente; fuori dai Paesi la sessione si chiude. Il messaggio non elenca i Paesi consentiti.
- **Il motivo all'agente**: la sessione chiusa da una regola lascia il motivo in `ses_out` (migrazione 0050, 8 giorni); il pannello lo mostra sotto il modulo di accesso (anche riaprendo la pagina) invece di «Sessione scaduta».
- **Non toccati**: il titolare (da qualunque Paese, nessun limite di dispositivi) e la sua «Entra per assistenza».
- **Server** (`worker.js`): `agSecNorm`, `agGeoLogin`, `agTwoAfterLogin`, `agSecCheck`, `agTrim`, `sesOut`; `PUT /api/admin/settings { agSec: { week, two, geo, cc } }`; `settings.agSec` sempre completo nello stato. Dettagli in SICUREZZA.md.
- **Avvisami su Telegram** (`tg`): messaggio al titolare (il suo Telegram collegato al pannello) quando un agente con link o password giusti viene fermato dall'estero, viene scollegato perché lavora da un altro Paese o entra da un terzo dispositivo («📱 Nuovo dispositivo … è stato scollegato quello entrato il …»). In sottofondo, non rallenta l'accesso.
- **Verifica in due passaggi obbligatoria** (`tfa`): l'agente senza 2FA riceve 403 `mustTotp` su tutto tranne attivazione e uscita; il pannello mostra la schermata «🔐 Verifica in due passaggi obbligatoria» con QR, chiave, codice e i 10 codici di recupero, poi si apre. Mentre è obbligatoria non la può spegnere. La conferma dice quanti agenti oggi ne sono senza.
- **Dispositivi dell'agente** (Agenti → «🔗 Link accesso»): sotto link e codice l'elenco **«📱 Dispositivi collegati»** (browser e sistema, città e Paese dell'accesso, quando è entrato, ultimo uso indicativo) con **«Scollega»**; il dispositivo scollegato vede «Il titolare ti ha scollegato da questo dispositivo». Server: `GET/DELETE /api/admin/agents/:id/sessions[/:sid]` (solo titolare, niente IP nell'elenco); la provenienza si salva all'accesso (`sessions.geo`, migrazione 0051).
- **Test**: `srv_agent_sec` (67 controlli), `ui_agent_sec`.

## 62. Il tuo accesso: codice, dispositivi ricordati, impronta o Face ID, avvisi; pagina di accesso nuova (11 novembre 2026)

- **Solo per il titolare** (Impostazioni → Sicurezza e account → **«Il tuo accesso»**, `owner-sec.js`). Gli agenti restano con le regole di «Accesso degli agenti».
- **Codice di accesso** (`admins.acc_seal`, cifrato; si attiva, cambia o spegne con la password attuale): dopo la password giusta, su un dispositivo che il pannello non ricorda, il server risponde `needCode` e la pagina mostra «Codice di accesso». Codice sbagliato = tentativo fallito (5 → IP fermo 15 minuti). Viene prima della 2FA.
- **«Ricorda questo dispositivo»** (spuntato di serie): cookie `__Host-kxtd` (HttpOnly, Secure, SameSite=Strict, 90 giorni, non si rinnova) e la sua impronta in `trusted_devices`. Sui dispositivi ricordati il codice non serve; uscire non li dimentica. In «Il tuo accesso» l'elenco (browser, città, fino a quando, ultimo accesso) con «Dimentica» e «Dimentica tutti». Attivando il codice, il dispositivo da cui lo attivi resta ricordato.
- **Impronta o Face ID** (passkey, WebAuthn, `src/passkey.js`): «Aggiungi questo dispositivo» crea una passkey (ES256 o RS256, impronta o volto obbligatori, chiave residente). Nella pagina di accesso **«Entra con impronta o Face ID»** entra senza password, codice e 2FA. Il server verifica sfida usa e getta (5 minuti), origine, dominio, impronta o volto, firma e contatore (contro le copie). Al massimo 10 passkey; niente passkey dall'indirizzo degli agenti. Tabelle `passkeys` e `pk_chal`.
- **Avvisami su Telegram** (`admins.acc_tg`): accesso da un dispositivo nuovo, codice sbagliato dopo la password giusta, passkey aggiunta (serve il Telegram del titolare collegato al pannello).
- **Pagina di accesso** (index.html, `#lxLoginCss`): due colonne futuristiche, a sinistra il pannello con **«KAIROS CONTROL»** sotto al logo, a destra l'accesso con etichette e icone; su telefono una colonna con logo e nome in alto. ID dei campi come prima (`#lu`, `#lp`, `#lt`, `#lerr`); `#lc` codice, `#lrem` «Ricorda», `#lpk` impronta. Con il link personale dell'agente resta solo «Codice di accesso».
- **Se dimentichi il codice**: entra da un dispositivo ricordato o con impronta/Face ID e cambialo; se non ne hai, dalla console D1 di Cloudflare: `UPDATE admins SET acc_seal = '' WHERE username = '…'`.
- **Server**: `GET/PUT /api/admin/own-sec`, `DELETE /api/admin/own-sec/devices[/:id]`, `POST /api/admin/passkey/options|register`, `DELETE /api/admin/passkey/:id`; senza sessione `POST /api/admin/passkey/login-options|login`; `/api/public/config` dice `pk`. Migrazione 0052.
- **Test**: `srv_owner_access` (65 controlli, con un autenticatore finto: firme, contatore, origine, sfida riusata), `ui_owner_access` (la pagina, il codice, l'impronta con l'autenticatore virtuale di Chrome, il link dell'agente).
- **«KAIROS CONTROL» anche nella barra laterale**: sotto il nome (`.brandName`, che resta quello delle impostazioni) una riga `.brandSub` «CONTROL» larga quanto il nome, poi il ruolo (Master, Reseller, Sub reseller). In tutti gli aspetti: Futuro e barre strette centrata e ciano, Classico/Misto larghi e telefono allineata a sinistra; sugli schermi bassi più piccola e più vicina. Test `ui_brand_control` (tre aspetti, tablet, telefono, schermo basso, nome personalizzato).

## 63. Barra dell'assistenza sistemata; «Chi può generarli» per i codici dello Store (11 novembre 2026)

- **Barra dell'assistenza** («Entra per assistenza», `agents.js` → `assistBanner`, stile `#assistCss`):
  - **telefono (≤ 700 px)**: «🛟 Assistenza: nome», sotto «Ogni modifica agisce sul suo pannello», e **«Esci»** sempre in vista. Prima il testo si spezzava in colonne, «Esci dall'assistenza» finiva fuori dallo schermo e la barra copriva l'intestazione. Il nome lungo si taglia con i puntini.
  - **iPhone con il pannello sulla schermata Home**: la barra lascia libera la zona dell'orologio (`env(safe-area-inset-top)`) e sotto non la si lascia una seconda volta: `html.kx-assist{--kx-sat:0px}`, usata da `mobile.js` come `var(--kx-sat,env(safe-area-inset-top))` (fuori dall'assistenza vale `env()` come prima).
  - **tutti gli schermi**: testo di sempre su una riga. L'altezza vera della barra è in `--kxa` (misurata, anche quando cambia): la pagina (`body{padding-top}`), il menu del telefono, le pagine a tutta altezza (`#agPage`, `#mtPage`, `#drawer`) e le finestre (`ASSIST_UNDER`) partono da lì. Prima nome e ✕ della scheda del cliente finivano sotto la barra, anche sul computer.
  - Uscendo (o a sessione scaduta) spariscono barra, classe `kx-assist` e `--kxa`.
- **Codici per lo Store → «Chi può generarli»** (`store-codes.js`): nel riquadro «🔑 Codici per lo Store» la riga dice «Tu e N agenti su M: …» e **«Scegli agenti»** apre l'elenco con le spunte (sotto-agenti rientrati sotto chi li gestisce, «Tutti gli agenti», ricerca oltre gli 8). Salva con `POST /api/admin/agents/bulk { ids, flags: { stcodes } }`: cambia solo quel permesso. Un sotto-agente conta solo se lo ha anche chi lo gestisce («Vale quando lo dai anche a …»). Resta anche in Agenti → scheda dell'agente e in «👥 Applica a più agenti».
- **In assistenza** il titolare vede «🔑 Codice usa e getta · Genera» se l'agente ha il permesso (prima era sempre nascosto). Il codice generato così risulta dell'agente; nel registro «Assistenza di … · agente: Store — codice per scaricare generato».
- **Telefono**: «Genera» è il primo della riga dei codici Downloader (prima era il terzo, fuori dallo schermo: andava cercato scorrendo). Sul computer resta dopo il codice dello Store.
- **Test**: `ui_assist_bar` (telefono con e senza zona dell'orologio, nome lungo, tablet, computer, tre aspetti, menu, scheda del cliente, finestre, uscita), `ui_store_who` («Scegli agenti», sotto-agenti, telefono, assistenza), `srv_store_codes` (+5: codice in assistenza).

## 64. Salute delle app senza falsi allarmi; nota della linea nella scheda del cliente (11 novembre 2026)

- **«Server della lista: non raggiungibile» smentito dalla visione** (`worker.js`): il controllo dell'app non si rifà mentre il cliente guarda, quindi un «non raggiungibile» visto all'avvio restava rosso per ore con il cliente che guardava. Ora l'allarme cade se **dopo** quel controllo (3 minuti di margine) il dispositivo ha guardato qualcosa (`watch_dev`) e da allora non ci sono errori di riproduzione non risolti: `chkSeenAfter`, usata da `chkIssues` (elenco «Salute delle app», scheda, «Risolvi»). Il battito conserva in `chk.dn` da quando il server risulta giù (l'app rimanda lo stesso esito ogni 15 minuti: senza `dn` l'ora del controllo sembrerebbe sempre nuova). Nella finestra «Dati» la riga diventa «✓ raggiunto: ha guardato … · il controllo di prima non era riuscito».
- **«Si è chiusa da sola» contata una volta**: `killed` e `crash` con la stessa ora sono lo stesso fatto. `playerErrors` non li salva due volte (righe delle ultime 24 ore e doppioni nello stesso invio) e `healthIssues` conta le chiusure distinte (5 minuti di distanza, `distinctTimes`).
- **Kairos Pro, interfaccia** (`player/index.html`, arriva da sola a tutti con la pubblicazione del pannello): il controllo del server della lista riprova una volta dopo 4 secondi prima di dire «non raggiungibile»; se nemmeno il pannello risponde (`/api/player/ping`) è la rete del cliente e non dà un verdetto sul server; se un video è partito da quel server negli ultimi 30 minuti non lo dichiara giù; un video che parte (`acPlayed`, da `kxPlayerClosed` con altezza > 0) corregge subito un «non raggiungibile» e fa rifare il controllo a visione finita.
- **Kairos Pro, APK** (`MainActivity.kt` → `Watch`, dalla prossima versione): «uccisa dal sistema» si segna solo se all'ultimo battito l'app era **in primo piano** (schermate visibili, `ActivityLifecycleCallbacks`), con lo **schermo acceso** e il dispositivo **non si è riavviato** (`BOOT_COUNT`; prima di Android 7 l'ora dell'accensione) e la versione è la stessa (un aggiornamento chiude l'app). Prima bastava che il processo sparisse: tasto Home, TV spenta, chiavetta alimentata dalla TV finivano tutti come «si è chiusa da sola». Decide `Watch.killedInUse`, funzione pura; i dati mancanti (versione precedente) valgono come prima.
- **Nota della linea nella scheda del cliente** (`line-note-box.js`, titolare `#eSyncInfo` e agente `#cSyncInfo`): sotto «🔗 Allineata alla linea …» compare la nota che la linea ha nel suo pannello (WOLF, Atlantix, Realott, SLT; per Armada e Storm la nota tenuta in KAIROS) e tre date a confronto: scadenza della linea, data scritta nella nota (`[K: PAGATO fino al …]`, altrimenti l'ultima data messa a mano: `21/02/2027`, `21/02/27`, `21/02`, `21-02-2027`, `21.02.2027`, `2027-02-21`, «21 febbraio»), scadenza che il cliente vede nell'app. **«⚠️ Date diverse»** quando nota e linea differiscono di più di un giorno. Legge solo liste e note che il pannello ha già (`KXLinePick`, `KXLineNotes`); non modifica nulla.
- **Telefono**: il selettore «App del cliente» (7 app) va a capo (`#eApp{flex-wrap:wrap}`): allargava l'intera scheda del cliente oltre lo schermo.
- **Test**: `srv_health_false` (32), `ui_line_note` (22), `p_chk.js` per l'interfaccia Pro (15).

## 65. Data che il cliente vede quando la linea si rinnova un mese alla volta (11 novembre 2026)

Il cliente «🔗 allineato a una linea» prendeva sempre la scadenza della linea. Chi incassa più mesi e rinnova la linea ogni mese gli mostrava nell'app la data sbagliata (quella del mese). Ora il cliente vede **la più avanti** fra tre date (`worker.js` → `lineSyncTarget`, usata da `applyLineSync`, cioè da tutti gli allineamenti: pagine delle linee, programmato ogni 6 ore, tasti della scheda):

1. la scadenza della linea sul pannello;
2. il **«Pagato fino al»** registrato per quella linea (💶): vale **da solo**. `linePaidMap`/`linePaidFor` lo leggono ogni volta da `payments` (niente copie): solo pagamenti «pagato» non ancora passati; la linea si riconosce dal nome utente (etichetta del pagamento; su Armada, Storm, Realott e SLT anche il riferimento; su WOLF e Atlantix il riferimento è il numero della linea e non si usa come nome); fra più pagamenti con lo stesso nome vale quello di chi ha il cliente, e se sono di persone diverse e nessuno è suo non vale nessuno. Appena si salva il pagamento il cliente sale subito a quella data (`linePaidApplyNow`, risposta `clientDate`); a scendere (data abbassata, pagamento tolto, «deve pagare») ci pensa il prossimo allineamento, che conosce la scadenza della linea;
3. la **data fissata per quel cliente** (`line_sync.hold`, migrazione `0053`): per le date scritte a mano nella nota, che non si applicano da sole (una data a mano può essere «richiamare il 20/12»).

Quando la linea raggiunge quella data si torna a seguire la linea. Clienti illimitati e dispositivi aggiunti non si toccano; agenti: solo i propri clienti, massimo 3 anni.

- **`PUT /api/admin/line-sync/hold`** `{ deviceId, date?, lineExp? }`: `date` = giorno futuro (titolare fino a 10 anni, agente 3), `''` = torna a seguire la linea, assente = non cambia la data fissata e rimette solo la data giusta. Con `lineExp` (la scadenza della linea, che il pannello ha già) la data del cliente si ricalcola subito. Risponde `{ hold, paid, expires }`. Agenti: serve «Rinnovare» (collegare a una linea resta possibile anche con il solo «Creare»). `GET /api/admin/line-sync?deviceId=` riporta anche `hold` e `paid`. Ricollegare la stessa linea conserva la data fissata, un'altra linea la toglie.
- **Scheda del cliente** (`line-note-box.js`; `app.js` e `agents.js` mettono solo l'id del cliente accanto al nome della linea, `data-ls-dev`):
  - nota a mano più avanti della linea → «⚠️ Date diverse» con **«Usa il gg/mm/aaaa per il cliente»**;
  - data fissata → «📌 Il cliente nell'app vede il …: data fissata per questo cliente. La linea scade il …: continua a rinnovarla» con **«Torna alla data della linea»** (e «La nota dice …: usa quella» se la nota è cambiata);
  - «Pagato fino al» → «✓ Il cliente nell'app vede il …: è il «Pagato fino al» della linea»; se il cliente è rimasto indietro (pagamento registrato prima di questa novità, data cambiata a mano) lo dice e offre **«Metti il …»**;
  - nota con una data precedente alla linea → solo l'avviso.
  I tasti salvano subito e aggiornano il campo «Scadenza» e il riquadro in cima: «Salva» non rimette la data di prima.
- **Registro**: «Scadenza di … allineata alla linea …: data (pagato fino al; la linea scade il …)», «data del cliente … fissata al …», «… torna a seguire la scadenza», «… portata al «Pagato fino al» della linea …».
- **Test**: `srv_line_hold` (65), `ui_line_hold` (33: titolare, telefono Classico, agente).

## 66. DNS cifrato deciso dal pannello (11 novembre 2026)

- **Voce «DNS cifrato»** nel catalogo del controllo remoto (`RC_CAT`, chiave `sdns`: `on` | `off`, vuota = spento; sezione «Rete», niente «lascia scegliere al cliente»). Si imposta per tutte le app, per una sola o per il singolo cliente, come le altre voci.
- **Tutte le app** (dal 12 novembre 2026): Kairos TV 2.4.7, Premium 1.7.6, Lite 1.5.7, XC 3.4.6; Kairos Pro dalla 2.7.6 (le più vecchie ignorano la voce); Kairos Plus e Kairos Nova dalla versione del 12 novembre; KAIROS Ultimate dalla prima versione pubblicata; Kairos Portal e Smart (stesso motore di XC).
- **Nelle app** (`DnsShield.kt`, `DnsWire.kt`): un'interfaccia locale di Android (`VpnService`) che vale solo per l'app e instrada solo l'indirizzo finto del DNS. Ci passano le domande DNS, inoltrate così come sono su https (RFC 8484) a `1.1.1.1`, poi `8.8.8.8`, poi `9.9.9.9`; video, liste e immagini vanno diretti come prima. Vale per tutto quello che l'app apre, VLC compreso.
- **A prova di guasto**: dopo 6 domande di fila senza risposta l'interfaccia si chiude e torna il DNS normale, con un nuovo tentativo dopo 10 minuti. Con la VPN del fornitore accesa resta spento (il DNS passa già nel tunnel); se sul dispositivo c'è un'altra VPN non la tocca. Android chiede il permesso una volta, con la finestra della VPN.
- L'app mostra lo stato nelle Impostazioni («DNS cifrato · scelto dal tuo fornitore») e lo manda nel battito (`sdns`: `on`, `asking`, `denied`, `error`, `other`, `off`, `vpn`).
- **Pro, Plus e Nova** hanno un'interfaccia propria: lì `DnsShield.kt` è la versione autonoma (`start`, `stop`, `state`) e quando accenderlo lo decide l'interfaccia (in Kairos Pro `dnsApply()` in `player/index.html`, solo senza la VPN del fornitore; in Plus e Nova la parte Flutter).
- **Nel pannello è un menu semplice** («Non imposto (spento)», «Acceso», «Spento»): non ha il selettore «Chi decide» delle voci che il cliente può scegliere nell'app (`isReader` in `remote-panel.js` esclude `sdns`), perché non è una scelta del cliente.
- **Test**: `srv_sdns` (34), `ui_sdns` (10); nelle app `DnsWireTest` (lettura della domanda, costruzione della risposta, somma di controllo).

## 67. Kairos Portal e Kairos Smart: indirizzi di scarico (11 novembre 2026)

- Due app nuove in un solo repository **privato** (`kairos-portal-smart`): stesso motore di Kairos XC, due interfacce.
- **Indirizzi**: `/get/portal.apk` e `/get/smart.apk`, file degli aggiornamenti `/get/portal.json` e `/get/smart.json`
  (tabelle `GET_APK` e `GET_FEED` in `worker.js`). Le due app si aggiornano da sole da lì, come le altre.
- Il repository è privato: serve il segreto `GH_TOKEN` del Worker con **`kairos-portal-smart` aggiunto al token dei download**.
  Finché manca (o finché non c'è una release) gli indirizzi rispondono 502, senza dettagli.
- Per ora è solo lo scarico: il pannello non riconosce ancora le due app (si presentano come una Kairos XC, di cui hanno il
  motore), non hanno schede di impostazioni né riquadri nello Store.
- **Test**: `srv_get_portal` (17).

## 68. App nascoste nello Store, per clienti e agenti (12 novembre 2026)

- **Dove**: Store → App dello store. Ogni riga ha l'**occhio** («Visibile» / «Nascosta»): un tocco e poi «Salva».
  La casella dentro la scheda fa la stessa cosa. L'app resta nell'elenco del titolare e si rimette con un altro tocco.
- **Clienti e agenti nello Store**: un'app nascosta non arriva più allo Store. `/store/apps.json` (da `store-k.download` e
  `panel-kairos.com`) esce senza le app nascoste (`storeAppsPublic` in `worker.js`): prima arrivavano e la pagina non le
  disegnava. Lo Store ricorda l'ultimo elenco arrivato, così le nascoste non tornano quando l'elenco non arriva.
- **Agenti nel pannello**: un'app **Kairos** nascosta nello Store sparisce anche dal pannello degli agenti: voce in
  «App Kairos», link e codice Downloader (`storeHiddenKeys`, letta da `docs/apps.json` di kairos-store e tenuta in memoria
  60 secondi; dopo un «Salva» vale subito). L'app si riconosce dal link `/get/<app>.apk` o dal nome «Kairos …».
  Con due voci della stessa app, una visibile basta a tenerla. I permessi dell'agente (`kAllow`) non vengono toccati.
  Nella riga dei codici in alto l'agente non vede più nemmeno il nome di un'app che non ha (nascosta o non concessa):
  prima compariva «non impostato».
- **Cosa non cambia**: gli indirizzi `/get/<app>.apk` e i file di aggiornamento (chi ha già l'app continua ad aggiornarla),
  le attivazioni, i «Codici Downloader» delle app di terzi, tutto quello che vede il titolare.
- **Limite**: finché il repository kairos-store è pubblico, il file `apps.json` su GitHub contiene anche le voci nascoste.
- GitHub non risponde: per gli agenti vale l'ultimo elenco letto (all'avvio a freddo: niente di nascosto).
- **Test**: `srv_store_hidden` (32), `ui_store_hide` (33), `store_page_list` (25, pagina dello Store).

## 69. Loghi nuovi delle app Kairos (12 novembre 2026)

- Un simbolo per app dentro la stessa cornice luminosa, con «KAIROS» e il nome: `strumenti/loghi/loghi.py` li disegna
  tutti (nessuna immagine presa da internet; carattere Chakra Petch, licenza OFL, dalla cartella dei caratteri di
  kairos-portal-smart). Esce il foglio con tutti i loghi e, per ogni app: icona di avvio (48–192 px), banner TV 320×180,
  icona 192×192 per l'elenco dello Store.
- **Store**: `docs/icons/kairos-<app>-2026.webp` nel repository kairos-store, per Pro, Premium, Tv, Plus, XC e Lite.
- **App**: icona di avvio (`mipmap-*/ic_launcher.png`) e banner TV (`drawable-xhdpi/banner.png`) in Kairos Pro, TV,
  Premium, Lite, XC, Plus e Nova. Il logo dentro le app non cambia.
- Non toccati: KAIROS Ultimate (lavoro di Devin), l'app Kairos Store (il suo marchio è anche nell'animazione di apertura),
  Kairos Portal e Kairos Smart (già in questo stile; si allineano alla prossima versione).

## 70. Eventi futuri: nazionali, due settimane avanti, «Prossimi giorni» (12 novembre 2026)

- **Perché**: nelle soste dei campionati il calcio spariva dagli eventi (app e pannello). I campionati seguiti erano solo di club
  e la finestra era di 8 giorni: durante la sosta di novembre non c'era niente, mentre giocava la Nazionale.
- **Nazionali** (`LEAGUES` in `worker.js`): Nations League (`uefa.nations`), Qualificazioni Europei (`uefa.euroq`) e
  Amichevoli (`fifa.friendly`, **solo quelle dell'Italia**). Nomi delle nazionali in italiano (`NAT_IT`).
- **Più avanti**: Serie A a 14 giorni (`LEAGUE_DAYS`), NFL e UFC a 7, NBA a 3. Le risposte arrivano fino a due settimane
  (`EV_AHEAD`): `/api/player/events` (app) e `/api/admin/events` («Eventi ora», prima 36 ore).
- **Costo**: stesso limite di 40 richieste a ESPN per giro; le righe di cache in più sono circa 40. Mai intervalli di date.
- **Pannello → Eventi ora**: «Più tardi» resta per le prossime 36 ore; sotto **«📅 Prossimi giorni»** in ordine di data, i primi
  30 e poi «Mostra tutti». «Di solito su» per la Nazionale italiana: Rai 1; per le altre nazionali non si indovina.
- **App**: la forma delle risposte non cambia (v1 e v2). Portal e Smart leggevano l'orario come numero mentre arriva come
  testo: corretto nel ramo `aspetto-0.5` di kairos-portal-smart.
- **Emittenti alle app** (stessa giornata): ogni evento di `/api/player/events?v=2` porta anche `tv`, le emittenti italiane
  «di solito» (le stesse di «Eventi ora»), solo quando si sanno. Portal e Smart le usano per aprire subito i canali
  dell'evento scelto, senza tastiera.
- **Test**: `srv_events_future` (18), `ui_events_future` (9); restano verdi `srv_events` (18) e `ui_events` (27).

## 71. «Adesso» nell'elenco Clienti: cosa guardano, IP, DNS cifrato (12 novembre 2026)

- **Dove**: Clienti → vista Tabella, colonna **«Adesso»** dopo «Dispositivo». Solo il titolare (non in assistenza, non gli agenti).
- **Cosa mostra**, per chi è collegato adesso: canale, film o serie (al passaggio del mouse anche il programma), oppure «nei
  menu»; IP con città e paese; **DNS cifrato** (verde «🔒 DNS cifrato», «DNS non cifrato», oppure in attesa, permesso negato,
  altra VPN, errore); VPN accesa; «altro paese»; linea debole; rete (Wi-Fi, cavo), risoluzione e versione dell'app.
  Chi non è collegato ha un trattino: niente dati vecchi. Nelle schede il «collegato adesso» dice anche cosa guarda.
- **DNS cifrato**: l'app lo dichiarava già nel battito (`sdns`) ma il server non lo salvava. Ora colonna `presence.sdns`
  (migrazione `0054_presence_sdns.sql`); un cambio di stato si scrive subito.
- **Dati**: `presenceNow` legge solo le righe dei collegati (ultimi 4 minuti), una lettura per aggiornamento del pannello;
  `withNow` li mette in `device.now`. Agli agenti non arriva niente di nuovo (né IP né «adesso»).
- Sotto i 900 px la colonna si nasconde insieme a Dispositivo, Playlist e Note.
- **Test**: `srv_now` (14), `ui_now` (15).

## 72. Temi di Portal e Smart dal pannello; priorità al calcio (12 novembre 2026)

**Priorità al calcio** (`evPick`): dopo i posti garantiti a ogni sport, i posti rimasti vanno prima agli eventi in diretta,
poi al calcio (per orario), poi agli altri sport; tetto del tennis da 6 a 4. Il calcio e gli sport grossi non restano fuori
per i tornei minori. Le emittenti «di solito su» ora arrivano anche alle app (campo `tv` in `/api/player/events`).

**Portal e Smart comandate dal pannello** (nessuna nuova versione delle app):
- Il pannello le **riconosce come app a sé** (`appFrom`/`appOfVer` dal battito «portal x.y» / «smart x.y»): nel Controllo
  remoto compaiono «Kairos Portal» e «Kairos Smart».
- **Voce «Tema»** con i temi Skin (Nero, Neon, Oro, Smeraldo, Rubino, Artico, Tramonto, Terminale, Classico) più
  **«Effetti»** (`fx`) e **«Scritte neon»** (`neon`). L'app legge già queste voci (`Remote.theme/fx/neon`): niente rebuild.
- Il **«Tema» della Pro** resta separato (i suoi colori: cinema, aurora…): due voci con la stessa chiave `theme`, il
  pannello sceglie quella dell'app (`rcCatFor`).
- **Eredità da Kairos XC** (`RC_PARENT`): Portal e Smart partono dal profilo di «Kairos XC» (stesso motore), poi il loro
  profilo lo sovrascrive. Così il DNS cifrato e le altre voci messe su XC valgono anche per loro, finché il titolare non
  sceglie qualcosa di diverso. Il vero Kairos XC non ha temi: la voce «Tema» non compare per lui.
- Portal e Smart ereditano **ogni voce di «xc»** nel catalogo (preview, lettore, qualità, DNS cifrato…): `c[4]` espanso
  automaticamente. Aggiunte a `RC_APPS`, `RC_LINKED`, `ADULT_MERGE_APPS` e alle schede dell'interfaccia.
- **Limite**: la modalità «il cliente sceglie tra questi» (`theme:allow`) non è supportata dall'app per il tema; con
  «Decido io» il tema è imposto (è ciò che serve).
- **Test**: `srv_theme_portal` (23), `ui_theme_portal` (10); `srv_sdns` e la suite restano verdi.

## 73. Scadenza dell'app dalla linea o dalla nota; «Remoto» e DNS cifrato nell'elenco Clienti (12 novembre 2026)

**Scadenza dell'app: «Dalla linea» oppure «Dalla nota»**

- Nella scheda del cliente allineato a una linea, in cima al riquadro della nota: «Scadenza nell'app: Dalla linea | Dalla nota», ognuna con la sua data.
- «Dalla linea»: la regola del §65 (linea, «Pagato fino al», data fissata).
- «Dalla nota»: il cliente vede la data scritta nella nota della linea, anche se è prima della scadenza della linea, e la segue da solo quando la nota cambia (pagina delle linee aperta o controllo ogni 6 ore).
- Nota senza una data: vale la regola di sempre. Data della nota già passata: non si applica da sola, il riquadro lo dice.
- Linea appena collegata e non ancora salvata: la scelta c'è già e parte con «Salva». Collegamento già salvato: si salva subito.
- Per Armada e Storm vale la nota tenuta in KAIROS.
- Agenti: serve «Rinnovare», solo i propri clienti, massimo 3 anni. Clienti illimitati e dispositivi aggiunti non si toccano.
- Tecnica: `line_sync.src` (migrazione `0055_line_src.sql`), `PUT /api/admin/line-sync/src` `{ deviceId, src, lineExp, note }`, `PUT /api/admin/line-sync` accetta `src`, `/line-sync/apply` riceve anche `note` per ogni linea; `noteDatesIn`/`noteDateOf` nel worker hanno le stesse regole di `line-note-box.js`.

**Elenco Clienti (solo titolare)**

- Tasto «Remoto» accanto a «➕ Dispositivo», anche sui dispositivi aggiunti: apre subito il Controllo remoto di quel cliente. Sotto 1650 px resta la sola icona.
- Sotto il dispositivo: «🔒 DNS cifrato attivo» oppure «DNS cifrato spento», come lo ha dichiarato l'app all'ultimo battito (ultimi 30 giorni), anche per chi non è collegato. Permesso negato, altra VPN ed errore compaiono in giallo.
- Una sola pastiglia dell'app accanto al nome: quella vecchia (`.app-chip` di `lite-panel.js`) non si aggiunge più dove c'è già la nuova.

Prove: `srv_line_src` 59, `ui_line_src` 36, `ui_list_rc_dns` 15.

## 74. «Scaricata col codice di …» sulle schede «Da attivare» (12 novembre 2026)

Quando una TV nuova si presenta in attesa, sotto il modello compare **«📥 Scaricata dal codice di \<agente\>»** (o «con il tuo codice»), in tabella e nelle schede. Lo si scrive sul dispositivo al register, cercando il codice dello Store usato da poco dallo **stesso IP** (la stessa TV): così resta anche se l'IP cambia poi. Scaricata senza codice → nessuna dicitura (non c'è un agente). Si segna una volta sola, finché il dispositivo è in attesa; una volta attivato non si tocca.

Tecnica: `devices.rec_by`, `rec_name`, `rec_t` (migrazione `0056_dev_rec.sql`); `recStamp()` al register; `deviceOut` espone `dl: { by, mine }`. Pannello: `dlWho()` in `kc.js`, `add-dev.js` non ripete «via» dal vivo quando c'è già la dicitura scritta. Prove: `srv_dl_who` 13, `ui_dl_who` 6.

## 75. Codice dello Store ricordato accanto a «Genera» e durate da 10, 15 e 20 minuti (12 novembre 2026)

- Chiusa la finestra del codice, il codice **resta nella riga dei codici Downloader** al posto di «Genera»: codice, «scade tra …», «Copia» e «Nuovo». Sparisce quando scade o quando il cliente lo usa.
- Arriva dall'elenco del server, quindi c'è anche dopo aver ricaricato la pagina o da un altro computer. Ognuno vede solo il proprio: il titolare il suo, l'agente il suo.
- «Nuovo» genera un altro codice; quello di prima resta valido finché non scade.
- Durate (Store → «🔑 Codici per lo Store» → «Il codice vale»): **10, 15, 20** o 30 minuti, 2 ore, 24 ore. La durata vale per scrivere il codice e poi per scaricare su quel dispositivo.

Tecnica: `CODE_TTLS` in `store.js`; in `store-codes.js` `recall()` (rilegge l'elenco ogni 30 secondi solo mentre c'è un codice in vista e la scheda è visibile) e `pillPaint()`.

Prove: `srv_store_codes` (durate nuove), `ui_store_code_rem` 19.

## 76. Lingua dei trailer e ricerca di Apple riparata (12 novembre 2026)

- Impostazioni → Funzioni dell'app → **«🎬 Trailer» → Lingua dei trailer**: Italiano (di serie) o Inglese. Solo il titolare; si salva da sola (`PUT /api/admin/settings { trailerLang }`, nel registro).
- Vale per i trailer che cerca il pannello (`/api/player/trailer`): oggi Kairos Pro.
- **Italiano**: come prima — TMDB (se c'è la chiave), YouTube «trailer ita», Apple.
- **Inglese**: Apple (catalogo americano, poi inglese), TMDB in inglese (se c'è la chiave), YouTube «official trailer» (un trailer dichiarato italiano perde punti). Cache separata per lingua.
- **Apple riparata**: la ricerca con `media=movie` oggi restituisce 0 risultati per qualsiasi titolo, quindi questa fonte non trovava più niente. Ora si cerca senza filtro e si tengono solo i film, con il titolo uguale e l'anno uguale o vicino. Le serie non si cercano più su Apple (hanno solo l'anteprima di un episodio).
- **Limite misurato** (12 novembre, catalogo americano, titolo inglese esatto): 4 film trovati su 12 famosi (Dune: Part Two, Barbie, Interstellar, Gladiator II sì; Inception, The Godfather, Top Gun: Maverick, The Dark Knight, Joker, Finding Nemo, Wicked, Home Alone no). Con i titoli italiani delle liste ne trova meno. Apple resta un di più, non la fonte principale.

Prove: `srv_trailer_lang` 21, `ui_trailer_lang` 7.

## 77. Scudo VPN sempre visibile quando la VPN la gestisce il fornitore (13 novembre 2026)

- Lo stato mandato alle app ha una voce in più, `vpn.shield`: vera quando nel pannello c'è una VPN (configurazione generale, di una località o del cliente). Le versioni vecchie delle app la ignorano.
- Con `shield` le app mostrano lo scudo **sempre**: VPN «Sempre attiva», «Consentita» senza il permesso «Accendere/spegnere la VPN», e anche «Spenta». Acceso o spento secondo il pannello.
- Al tocco, quando il cliente non può cambiarla: **«VPN gestita dal fornitore»**. Il cliente la accende e la spegne solo con «Consentita» + permesso.
- Con VPN «Spenta» la configurazione non viene mandata: arriva solo la voce dello scudo.
- App: Kairos Pro 2.7.8, XC 3.4.12, TV 2.5.1, Lite 1.6.1, STB e Smarters 0.5.7. Premium, Plus e Nova non hanno lo scudo nella barra.

Prove: `srv_vpn_state` (stato per ogni modo e per ogni app).

## 78. KAIROS Ultimate: APK leggeri per ABI e anteprima del trailer (13 novembre 2026)

- **APK per ABI.** Dalla 1.0.1 ogni release di KAIROS Ultimate ha tre file: quello unico (`kairos-ultimate.apk`, circa 45 MB) e due leggeri, `kairos-ultimate-arm32.apk` e `kairos-ultimate-arm64.apk` (circa 24 MB: senza le librerie di VLC dell'altra ABI).
- `/get/ult.apk?abi=arm64-v8a` o `?abi=armeabi-v7a` dà l'APK leggero **solo se l'ultima release ce l'ha**; senza `abi`, con un valore diverso, senza token GitHub o con una release senza quei file arriva l'APK unico (`apkForAbi`). Gli indirizzi diretti `/get/ult-arm32.apk` e `/get/ult-arm64.apk` esistono ma non li usa nessuno.
- Lo chiedono l'app (aggiornamenti, dalla 1.0.1) e la pagina dello Store dentro l'app Store, che conoscono l'ABI del dispositivo. Browser, pannello degli agenti e «Copia link APK» restano sull'APK unico.
- Vale per ogni app che in `GET_APK` ha le voci `<id>-arm32` / `<id>-arm64`; per le altre `abi` si ignora.
- **Controllo remoto**, gruppo «KAIROS Ultimate»: voce `u.heroTrailer` «Anteprima del trailer nella Home» (Automatica / Spenta). L'anteprima parte solo sui dispositivi potenti (2 GB o più, Android 9+).

Prove: `srv_get_abi` (scelta dell'APK), `store_page_abi` (link dello Store).

## 79. DNS cifrato: perché non è attivo (elenco Clienti) e lucchetto nella Home di Kairos Pro (13 novembre 2026)

- **Elenco Clienti.** Prima un dispositivo che non dichiarava niente risultava sempre «DNS cifrato spento». Ora dice il motivo:
  - «DNS cifrato non acceso»: il pannello non lo ha acceso per quel cliente (né sul cliente né sul profilo dell'app);
  - «DNS: app da aggiornare» (giallo): acceso dal pannello, ma l'app è più vecchia della prima versione che lo ha (Pro 2.7.6, TV 2.4.7, Premium 1.7.6, Lite 1.5.7, XC 3.4.6, Plus 0.1.29);
  - «DNS: app da riaprire» (giallo): acceso dal pannello, app aggiornata, ma non l'ha ancora dichiarato: parte alla prossima apertura;
  - «DNS cifrato spento»: resta solo per il dispositivo che dichiara «spento».
- `/api/admin/state`: ogni dispositivo ha in più `sdnsWant` (il pannello lo vuole acceso: `sdnsWanted`, stessa regola di `rcEffective` per la voce `sdns`) e `ver` (versione dell'ultimo battito, ultimi 30 giorni).
- **Kairos Pro.** Nella barra in alto, accanto allo scudo della VPN, c'è il lucchetto «DNS» quando il fornitore ha acceso il DNS cifrato: verde = attivo (o protetto dalla VPN del fornitore), giallo = non partito (permesso da confermare o negato, altra VPN, errore), grigio = in avvio. Al tocco dice lo stato; dopo un rifiuto o un errore riprova (`NATIVE.dnsRetry`, dall'app 2.7.9; con le app più vecchie riprova alla prossima apertura). È nell'interfaccia: arriva alle Pro dalla 2.7.6 senza un APK nuovo. Pubblicato con Kairos Pro **2.7.9**.

Prove: `ui_list_rc_dns` (motivi nell'elenco), `pro_dns_badge` (lucchetto e tocco). In `ui_list_rc_dns` il controllo «a 1700 px la tabella entra senza scorrere» fallisce anche con il codice di prima: va guardato a parte.

## 80. Modifica in massa: dispositivi collegati, DNS cifrato e avviso sulla VPN (13 novembre 2026)

- **Dispositivi collegati.** Un dispositivo collegato (riga «dal principale») non ha VPN, permessi e visioni suoi: sono del cliente principale. Prima, scelto nella tabella, restava fuori dalla modifica: la finestra perdeva «Solo i clienti selezionati» e passava a «tutti i clienti attivi», e il collegato non cambiava. Ora la scelta passa al suo cliente principale (una volta sola se sono scelti tutti e due), la finestra lo dice, e il server fa lo stesso (`massEdit`, scope `ids`).
- **DNS cifrato in massa.** Tra le voci del Controllo remoto «solo per questi clienti» c'è «DNS cifrato» (Acceso, Spento, Come il profilo): si scrive sul cliente principale e sui suoi collegati, quindi arriva a ogni dispositivo. Vale anche per Portal e Smart (contano come Kairos XC).
- **VPN.** Se nel pannello non c'è una VPN (né configurazione generale né località) la riga della VPN e il riepilogo avvisano: «Consentita» e «Sempre attiva» accendono solo chi ha una configurazione sua.
- Solo clienti ancora da attivare nella scelta: la finestra non si apre e lo dice.

Prove: `srv_mass_linked`, `ui_mass_linked`. `v64.test` fallisce su «Animazione d'avvio (solo Pro)» anche con il codice di prima (la voce ora vale anche per Ultimate): va aggiornata la prova.

## 81. Backup dei dati dal pannello e «DNS cifrato · tutte le app» (13 novembre 2026)

- **Backup dei dati.** Impostazioni → Sicurezza → «💾 Backup dei dati»: solo il titolare, con la sua password. Scarica un file `kairos-backup-AAAA-MM-GG-HHMM.json` con tutte le tabelle del pannello (clienti, dispositivi, scadenze, agenti, crediti, pagamenti, linee, pannelli, store, impostazioni, registro). Restano fuori solo i dati di passaggio (sessioni aperte, tentativi di accesso, codici temporanei). Il file contiene dati riservati: va tenuto in un posto sicuro.
- **Ripristino.** Stessa scheda, «Ripristina da un backup»: file, parola `RIPRISTINA` e password. Prima di scrivere, il pannello salva da solo una copia dello stato attuale (`kairos-backup-prima-del-ripristino-…json`). Le tabelle del file sostituiscono quelle del pannello; quelle che il file non ha restano come sono.
- **Fuori dal backup** (li conserva il titolare): le chiavi di firma delle app (`.jks` e password) e i segreti di Cloudflare (`ENC_KEY` e gli altri). Senza `ENC_KEY` le password cifrate nel backup non si leggono.
- **Rotte**: `POST /admin/backup/start|page|end`, `POST /admin/restore/start|table|end` (titolare, gettone a tempo, pagine da 500 righe).
- **DNS cifrato · tutte le app.** Controllo remoto: una scheda con «Acceso» e «Spento» scrive la voce nel profilo di tutte le app in una volta (`PUT /admin/rctl/all`). Le scelte fatte sul singolo cliente restano.

Prove: `srv_backup`, `ui_backup`, `srv_sdns_all`, `ui_sdns_all`.

## 82. Home «Plancia» di Ultimate e titoli di tendenza nelle Home (13 novembre 2026)

- **KAIROS Ultimate · Home «Plancia»**: al posto della ruota e delle righe, cinque riquadri vivi: In onda ora (evento in corso o in arrivo, oppure l'ultimo canale con il programma), Film e Serie di tendenza con le locandine che girano, Riprendi, Eventi con il conto alla rovescia, e la striscia «Adesso» in basso. Voce **«Home»** (`u.home`: `plancia` | `classic`) nel Controllo remoto, gruppo KAIROS Ultimate: «Classica» rimette la Home di prima con la ruota.
- **Titoli di tendenza nella Home** (`o.homeArt`: `on` | `off`, gruppo Home): locandine dei film e delle serie di tendenza della settimana che la linea ha davvero (classifica `/api/player/trending`). XC: dentro i cerchi Film e Serie, a rotazione; Lite: tre locandine nelle tessere; TV, Premium, Plus, Nova: righe «Film / Serie di tendenza questa settimana». Di serie accesa; «No» la spegne.

Prove: `srv_home_rc`.

## 83. Agenti «a colpo d'occhio» (13 novembre 2026)

- Nell'elenco **Agenti** (solo titolare), sotto il nome di ogni agente: i suoi account sui pannelli esterni con **crediti rimasti** e **DNS** (WOLF, Realott, SLT; Atlantix solo i crediti), il **tetto del mese di Armada/Storm** con quanto resta, e i **server (DNS) delle sue linee** KAIROS. Giallo = meno di 10 crediti (o meno del 10 % del tetto), rosso = il pannello non risponde.
- I crediti si leggono dai pannelli con `GET /admin/agents/glance` (al massimo 4 alla volta, 15 s ciascuno) e restano in memoria 10 minuti (settings `agGlance`); «↻ Crediti» li rilegge subito.
- La voce `o.homeArt` vale anche per Kairos STB e Smarters (dalla 0.5.8).

Prove: `ui_agents_glance`, `srv_agents_glance`.

## 84. DNS tolto: esce anche dagli agenti (13 novembre 2026)

- Togliendo un DNS da «DNS e server» ora esce anche dai **Server delle linee** di ogni agente. Prima restava scritto (nascosto) nell'agente e, se il DNS si ripristinava dal Cestino, tornava **assegnato da solo** a chi lo aveva avuto.
- Non c'è nessun'altra strada che assegni un server a un agente: solo le spunte «LINEE» nella sua scheda (e lo spostamento sotto un altro agente, che può solo toglierne).

Prova: `srv_dns_del_agents`.

## 85. Agenti: Atlantix solo a chi ce l'ha, codice del Kairos Store in ogni pagina (13 novembre 2026)

- La voce «Pannello Atlantix» mancava dalle voci riservate: ogni agente la vedeva. Ora compare solo con il permesso Atlantix **e** un account Atlantix collegato dal titolare (stessa regola per Realott e SLT; WOLF resta com'è, perché l'agente si collega da solo).
- Lo stato dell'agente porta `me.panelAcc` (quali pannelli esterni hanno un suo account).
- Il codice Downloader del **Kairos Store** arriva sempre agli agenti (anche se il titolare non ha messo lo Store tra le sue «App Kairos») e la barra in alto lo mostra in **ogni pagina** del pannello, per titolare e agenti; la barra completa (Pro + Store) resta in Home, Codici Downloader, Impostazioni e Store.
- Test: `ui_agent_st_atx` (30), `ui_store_code_orcp` e `ui_atx_agent` aggiornati.

## 86. Separatori del fornitore nascosti (voce «o.sep»), codice HTTP negli errori, Ultimate 1.1.2 (13 novembre 2026)

- **Controllo remoto → gruppo «Liste» → «Nascondi i separatori del fornitore»** (`o.sep`, on di base): i titoli «----SPORT----», «##### FILM #####», «★★★ CINEMA ★★★» non si vedono in diretta, film e serie in tutte le app (Pro, TV, Premium, Lite, XC, Ultimate, STB, Smarters, Plus, Nova). Stessa regola ovunque (quella di Kairos Pro, senza «.» e «:» in apertura, così «...E giustizia per tutti» resta). Vale dal prossimo aggiornamento della lista.
- Errori del lettore: al nome si aggiunge il codice del server (« · HTTP 404»): 401/403 linea, 404 contenuto che non c'è, 5xx server del fornitore.
- KAIROS Ultimate 1.1.2: «Scia di luce» nella Plancia (solo spostamento, adatta alle chiavette da 1 GB), otto temi in più (Tricolore, Cyber, Corallo, Notte, Menta, Fucsia, Sabbia, Carbonio); la voce `u.theme` del pannello ora li elenca tutti e 18.

## 87. Controllo remoto per gli agenti, aggiornamento obbligatorio in un tocco, rete e linea di tutte le app (13 novembre 2026)

- **Agenti, voce per voce**: nella scheda dell'agente → sezione App → «Controllo remoto delle app» il titolare spunta le singole voci (`perms.rcKeys`; un sotto-agente mai più voci di chi lo crea). L'agente trova «Richieste e controllo → Controllo remoto» con le sole voci concesse: «Salva per tutti i tuoi clienti» (`PUT /rctl/mine`) o per un cliente solo (`PUT /rctl/device/:id`). Cambia solo quelle voci: le altre impostate dal titolare sul dispositivo restano; profili delle app e comandi restano del titolare.
- **Aggiornamento obbligatorio · tutte le app**: riquadro in cima a Controllo remoto (Subito / Dopo 3 giorni / Dopo 7 giorni / No) = voce `force` in tutti i profili, con `bgupd` acceso perché l'APK sia già pronto. L'app blocca solo quando la versione nuova è già scaricata e verificata.
- **Rete e linea**: il battito prende linea, banda e classe del dispositivo anche da `net` (Kairos Pro li manda lì, anche fuori dalla visione). Le app Kotlin li mandano sempre in `net`; Premium calcola linea e banda dalle misure del lettore; Plus e Nova mandano tipo di rete e segnale Wi-Fi.
- KAIROS Ultimate: voce `u.bg` (Sfondo: HUD, Nero puro, Blu notte, Grafite), anche dall'app (Impostazioni → Sfondo).
- Test: `srv_agent_rctl` (12), `ui_agent_rctl` (7), `ui_force_upd` (4), `srv_net_line` (3).
- **Controllo remoto → «Tutte le app»** (prima linguetta): ogni voce comune a più app, con «Valori diversi: non cambiare» dove le app oggi differiscono; «Salva per tutte le app» manda solo le voci cambiate (`PUT /rctl/all`). Test `ui_rc_allapps` (4).
- Kairos Pro 2.8.1: tolta la scritta che scorre (annuncio) da Home e barra in alto; manda la classe del dispositivo nel battito.

## 88. Disattiva agente / Disattiva agente e le sue linee (13 novembre 2026)

- Nell'elenco Agenti, sotto lo stato di ogni agente: «Disattiva» (non entra più; i clienti continuano a vedere), «Disattiva con le linee» (anche tutti i suoi clienti attivi e quelli dei suoi sotto-agenti vengono disattivati e ricordati in `settings agoff:<id>`), «Riattiva» / «Riattiva con N linee» (tornano attive proprio quelle). `POST /agents/:id/off|on {lines}`; `offLines` nell'elenco. Le linee sui pannelli esterni non si toccano.
- Test: `srv_agent_off_lines` (9), `ui_agent_off` (4).
- Tre pulsanti: «Disattiva agente» (fuori lui e i suoi sotto-agenti), «Disattiva solo agente» (fuori solo lui: i sotto-agenti continuano; `settings agsolo`, letto da `agentChainActive`), «Disattiva agente con le sue linee». In tutti e tre l'agente viene buttato fuori subito (sessioni cancellate); nei primi due le linee restano attive. Test `srv_agent_off_lines` (15).
- Disattivando o riattivando un agente si fa lo stesso sui pannelli esterni dove ha un account sotto quello del titolare (`agentExtSync`): WOLF (reseller; «con le linee» = disable-client, le linee non si riattivano da qui), Atlantix (sub-reseller e blocco/sblocco linee), Realott (sub-reseller). SLT no. L'esito di ogni pannello torna in `ext` e si vede nel messaggio.
- Agente già disattivato: pulsante «Disattiva anche le linee» (`linesOnly`): spegne solo le linee (KAIROS e, dove si può, pannelli esterni), l'agente resta com'era (anche «solo lui»).
- Assistenza anche su un agente disattivato (lui resta fuori): pulsante «Assistenza» nell'elenco accanto a «Riattiva» e nella scheda.
- WOLF: le linee attive spente insieme all'agente si ricordano (`agoffw:<id>`) e riattivandolo tornano attive una per una (anche se il reseller era già spento: linee spente una per una dal tuo account).

## 89. Agenti: linea presa da un pannello → server scelto da solo (13 novembre 2026)

- Nel Nuovo cliente dell'agente («Cerca una linea già creata») la linea di WOLF/Atlantix/… arriva con il DNS del pannello del titolare, che spesso è un altro indirizzo rispetto al DNS assegnato all'agente: prima `match-server` non trovava corrispondenza e chiedeva «Scegli il server».
- Ora, se la linea viene da un pannello e l'agente ha un solo server assegnato, `match-server` restituisce quello. Con più server si cerca ancora la corrispondenza del DNS; se non c'è, l'agente sceglie. Un indirizzo incollato a mano senza pannello non viene mai indovinato.
- Prova: `test-qbox/srv_agent_matchpanel.mjs`.

## 90. «Da attivare» anche per l'agente del codice, avvisi dei download dello Store (13 novembre 2026)

- Una TV nuova scaricata con il codice dello Store di un agente («📥 Scaricata dal codice di …», `rec_by`) ora compare anche nel «Da attivare» di quell'agente (e di chi sta sopra di lui), non solo del titolare. «Attiva» la rende sua cliente (il `PUT` su una TV libera con il suo `rec_by` diventa un «Nuovo cliente» con il codice della TV); «Collega a un cliente» c'era già. Gli altri agenti non la vedono.
- Con lo Store aperto le richieste da autorizzare non esistono più, quindi le notifiche del pannello e Telegram non partivano mai. Ora ogni download avvisa: con il codice di un agente lui (se il titolare gli ha dato il consenso alle notifiche/Telegram) e il titolare solo se lo chiede; senza codice il titolare. Il service worker legge il testo da `/notify/peek` (`dl`). Un solo avviso ogni 2 minuti per lo stesso download.
- Prove: `srv_agent_recpend.mjs`, `srv_store_dl_notify.mjs`.

## 91. Pagina «KAIROS HEAVY» (14 novembre 2026)

- Nuova voce di menu «KAIROS HEAVY» (solo titolare, `public/panel/heavy-panel.js`): tutte le funzioni della app 3D si accendono e spengono da lì, ognuna con la spiegazione. Gruppi: Aspetto (effetti 3D, logo di luci, stelle, scintille), Home (Top 10, Ultimi visti, monolite «Ultimo canale», monolite «Scegli per me»), Diretta e film (anteprima dei canali, trailer automatici e quando partono), Stabilità (canale che non si spegne mai, buffer automatico secondo la linea, audio universale con i decoder FFmpeg di VLC).
- Le voci sono nel catalogo del controllo remoto (`RC_CAT`, chiavi `h.*`, app `heavy`) e si salvano nel profilo `heavy` (`PUT /admin/rctl/app/heavy`).
- Per il pannello la HEAVY resta una Ultimate (user agent KairosUltimate, codici, linee, DNS cifrato): l'app manda la versione «heavy x.y» e `rcEffective(..., heavy)` aggiunge il profilo `heavy` sopra quello della Ultimate, all'apertura e al battito (stessa impronta: niente riavvii). Una Ultimate normale non riceve le voci `h.*`.
- Prove: `srv_heavy_rc.mjs`, `ui_heavy_page.mjs`.
- Prova 9 (14 novembre): voci nuove «Solo canali funzionanti» (`h.liveCheck`: nascondi / segna / spento), «Consigliati per te» (`h.rec`), «Appena arrivati» (`h.fresh`); «Ultimo canale» diventa «Ultimi canali» (ultimi 5, si sceglie dal menu).
- Prova 11 (14 novembre): `GET /api/player/news?f=ansa|ultimaora|sport|calcio` legge i titoli dal feed RSS pubblico (ANSA), li tiene 10 minuti (memoria + `settings` `news:<feed>`) e, se la fonte non risponde, serve gli ultimi salvati (fino a 12 ore) oppure un elenco vuoto; mai errori. Voci nuove della pagina: tema dei colori (`h.theme`), sfondo (`h.bg`), animazione fra le schermate (`h.trans`), suggerimenti dei tasti (`h.hints`), Wi-Fi e velocità (`h.net`), notizie del giorno (`h.news`, con la prova in diretta della fonte sotto la voce), anteprima che si allarga a schermo intero (`h.zoom`); «Solo canali funzionanti» ha in più «Nessuna prova: impara solo dai canali aperti». Nota: fino alla prova 10 l'app scartava le chiavi `h.*` (mancavano dal suo elenco `Remote.playerValues`): le voci della pagina hanno effetto dalla prova 11. Prove: `srv_heavy_news.mjs`.
- Prova 12 (14 novembre): notizie con doppia fonte (ANSA ⇄ RaiNews: se il primo feed non risponde o è vuoto si legge il secondo, `backup: true` nella risposta; voce nuova «RaiNews · tutte le notizie»); voci nuove «Canali doppi in fila» (`h.group`) e «Guida TV di riserva» (`h.epg2`: due guide XMLTV pubbliche italiane, solo per i canali rimasti senza guida, lette dall'app).
- Nello Store (14 novembre): KAIROS HEAVY è una scheda di `docs/apps.json` del repository `kairos-store` (dopo KAIROS Ultimate, visibile a tutti, link `/get/heavy.apk`, pacchetto `com.kairos.heavy`, stessa scheda nell'elenco di riserva di `docs/index.html`). La HEAVY non ha un file degli aggiornamenti (`/get/heavy.json` → 404): si aggiorna dallo Store, dove «Installa» scarica la versione di prova indicata in `HEAVY_REL` (worker.js) anche sopra quella già installata (stesso pacchetto, stessa firma, numero di versione più alto a ogni prova). A ogni nuova prova: cambiare il numero in `HEAVY_REL` e in «Anteprima N» nella descrizione della scheda dello Store. Con `?abi=` (lo manda lo Store) `/get/heavy.apk` dà l'APK leggero della ABI (`heavy-arm32`, `heavy-arm64` in `GET_APK`), circa metà del peso. Prova: `srv_get_heavy.mjs`.
- Prova 14 (14 novembre): scheda del film o della serie con pulsante «▶ Trailer» (quando il trailer c'è) e gettone della qualità (4K, UHD, FHD, HD) dopo l'anno; la parete di Film e Serie carica tutta la categoria (`Db.vod`) invece dei primi 30 titoli; tenendo premuto ◀ ▶ scorre a 5 e poi a 20 titoli. Nessuna voce nuova nel pannello: il trailer segue la voce «Trailer» che c'è già. `HEAVY_REL` punta a `heavy-prova-14`.
- Prova 15 (14 novembre): tre sfere nuove in alto nella Home, accanto a Cerca, La mia lista, Impostazioni e Profilo: «Aggiungi playlist» (apre subito il modulo; nel campo del server si può incollare il link M3U intero; permesso `localPl`), «Cambia playlist» (menu ad anello con tutte le playlist caricate dal pannello più quelle del dispositivo, aperto su quella in uso; con le playlist «Unite» anche «Tutte insieme»; permesso `plSwitch`) e «Aggiorna canali». Voce nuova del pannello «Playlist nella Home» (`h.plHome`, Mostra/Nascondi, gruppo Home). `HEAVY_REL` punta a `heavy-prova-15`.
- Prova 16 (14 novembre): la HEAVY si usa anche con il dito, su telefono e tablet, con lo stesso APK (nessuna voce nuova nel pannello). `HeavyTouch` traduce il dito in tasti (trascinare = frecce a passi con la rincorsa, tocco = zona toccata oppure OK, tocco lungo = MENU) e `HeavyHits` registra mentre si disegna le zone toccabili: monoliti, sfere, mensole e menu ad anello nella Home; cartelle, canali e anteprima in Diretta; locandine, pulsanti e freccette nella parete; pulsanti, stagioni ed episodi nella scheda. `HEAVY_REL` punta a `heavy-prova-16`.

## 92. Pulizia scadute, pagina «Info», spiegazioni delle voci, loghi neon (14 novembre 2026)

- **Linee IPTV → «🧹 Pulizia scadute»** (`public/panel/line-clean.js`, subito dopo «Tutti i pannelli», con scorciatoia da lì): cancella in blocco le linee scadute da più di 7, 10 o 20 giorni (giorni di calendario) oppure prima di una data scelta; di chi (tutti o un reseller), quali pannelli (WOLF, Atlantix, Realott, SLT), le linee «Deve pagare» restano (casella), elenco con le spunte, conferma scrivendo il numero di linee. Usa le cancellazioni di sempre dei pannelli (`DELETE /admin/wolf/lines/<id>`, `POST /admin/atx/lines/action`, `POST /admin/<ro|slt>/lines/action` con `action: delete`), una alla volta, tre errori di fila fermano quel pannello. Niente parte da solo. Titolare e agenti con almeno un pannello linee (i diritti li decide il server). Armada e Storm non hanno la cancellazione dal pannello. Prova: `ui_line_clean.mjs`.
- **Pagina «Info»** (`public/panel/info-panel.js`, in «Oggi»): comunicazioni del titolare e guida «quale app su quale dispositivo» per fasce di RAM (fino a 1 GB, 1–1,5, 1,5–2, 2 o più). `GET/PUT /admin/info` (il titolare scrive, l'agente legge e ha il pallino «nuova»); `GET /api/store/info` pubblico con le sole parti «Mostra anche nello Store»; lo Store le mostra dal pulsante «INFO» (`docs/index.html` di kairos-store). Testi nella riga `info` di `settings`, guida iniziale in `INFO_APPS_DEF`. Lato agente la chiamata è nell'elenco `AG_OK` di `agents.js`. Prove: `srv_info.mjs`, `ui_info.mjs`, `store_page_info.mjs`.
- **Spiegazioni**: ogni voce di `RC_CAT` ha la sua (cosa fa, quando conviene, cosa cambia per il cliente): 50 scritte da capo; `srv_heavy_rc.mjs` controlla che nessuna resti sotto gli 80 caratteri. Più chiare anche le pagine concesse agli agenti (`FP` in `agents.js`).
- **Loghi neon**: un marchio diverso per ogni app (Pro scudo, Premium gemma, XC lama, STB box con le onde, Smarters tre lame, Tv, Lite, Plus, Nova, Store esagono; Ultimate e HEAVY tengono il loro). Su Fire TV le app installate a mano mostrano l'icona e non il banner, con due fasce ai lati: ogni app ora ha l'icona `mipmap-television-xhdpi/ic_launcher.png` 16:9 (640×360) a tutto riquadro, con il marchio in alto e il nome sotto, e lo stesso disegno come banner. Kairos Pro: lo splash usa `drawable-nodpi/splash_logo.png` (quadrato). Sorgenti: `/home/claude/loghi2` (gen.py → logos.html → shot.mjs → apply.py). Versioni: Pro 2.8.4, Premium 1.8.7, XC 3.4.19, TV 2.5.8, Lite 1.6.7, STB e Smarters 0.6.5, Ultimate 1.1.9, HEAVY prova 13, Plus, Nova e Store con la loro compilazione automatica.
- **Permessi per agente (stesso giorno):** due voci nuove tra le pagine dell'agente (`AGENT_FLAGS`): `info` («Info e comunicazioni», accesa di serie: spenta, `GET /admin/info` risponde 403 e la voce sparisce dal menu) e `lineClean` («Pulizia linee scadute», spenta di serie: la pagina compare solo con il permesso e almeno un pannello linee). La cancellazione di una linea alla volta resta regolata dai permessi dei pannelli. Prove: `srv_info.mjs`, `ui_info.mjs`, `ui_agent_info_perm.mjs`.
- **«Info» a due voci separate (stesso giorno, richiesta del titolare: «non devono essere collegati»):** «Per i tuoi agenti» (`news`, `apps`: solo nel pannello) e «Per lo Store» (`sNews`, `sApps`: pubblicate da `GET /api/store/info`; vuote = lo Store non mostra quella parte e, se sono vuote tutte e due, il pulsante INFO non compare). Niente più interruttori «Mostra anche nello Store». I dati della prima stesura si leggono ancora (`infoNorm`: quello che lo Store mostrava resta) e una pagina rimasta aperta con il vecchio script, salvando, cambia solo la parte degli agenti (`infoPut`).
- **Store «intelligente» (stesso giorno):** la tabella «Memoria richiesta da ogni app» (`MEM_DEF` in `store.js`) ha ora tutte le app Kairos dello Store (XC 512 · STB, Smarters, Tv, Lite 1024 · Premium, Ultimate, Plus 1536 · Pro, HEAVY 2048), con le stesse fasce della guida della pagina Info; `memNorm` aggiunge da sola alla tabella salvata dal titolare le app che mancano. Nella pagina dello Store (`docs/index.html` di kairos-store): dentro l'app Store ogni scheda dice da sola «★ consigliata / ✓ adatta / ✗ qui serve più memoria» (`fitSet`, `fitApply`); «App consigliata» scrive in chiaro le app adatte (anche più di una) e quelle da non installare; le app con etichetta ANTEPRIMA non vengono mai consigliate da sole (`recBest`); la comunicazione dello Store sta in primo piano in cima alla pagina (`#newsTop`), con «LEGGI TUTTO» se è lunga. Prove: `store_page_fit.mjs`, `store_page_info.mjs`, `srv_store_rec.mjs`, `ui_store_rec.mjs`.
- **Clienti → filtro per app (stesso giorno):** voci nuove «KAIROS HEAVY», «Kairos STB» e «Kairos Smarters» (`lite-panel.js`). La HEAVY per il pannello è una Ultimate (`devices.app = 'ult'`): filtro e pastiglia la riconoscono dalla versione «heavy x.y» dell'ultimo battito (`d.now.ver` o `d.ver`); un cliente HEAVY che non si è mai collegato dopo l'attivazione resta contato tra le Ultimate. Prima STB e Smarters finivano nel conto di Kairos Pro. Pastiglie in `kc.js`: HEAVY, STB, SMARTERS. Prova: `ui_clients_app_filter.mjs`.
- **Armada e Storm → «Copia M3U» (stesso giorno):** il pulsante che copia il link M3U della linea si chiamava «Copia link» (il titolare non lo riconosceva): ora è «Copia M3U», con la spiegazione al passaggio del mouse. Per il titolare c'è sempre: il DNS trovato dal server con l'elenco delle linee vale subito (prima serviva ricaricare lo stato) e, se manca del tutto, il pulsante dice di scriverlo in «Indirizzi». Agli agenti il DNS resta riservato (niente pulsante), come prima. Prova: `ui_armada_m3u.mjs`.
- **Clienti → le richieste «Da attivare» si vedono sempre (stesso giorno, segnalazione del titolare: «non arriva più il codice di attivazione»):** il filtro per app, che resta salvato nel browser, nascondeva anche le richieste nuove delle altre app (in alto «3 da attivare», ma riquadro a 0 e nessuna scheda). I codici arrivavano al pannello: non si vedevano. Ora le richieste in attesa restano in vista con qualunque app scelta (`lite-panel.js`), per il titolare e per gli agenti. Prova: `ui_pending_arrives.mjs`.
- **Riconoscimento dell'app: Kairos STB, Smarters, HEAVY (stesso giorno, segnalazione del titolare con «Monny-STB» mostrata come XC):** STB e Smarters usano il motore di Kairos XC: all'apertura (`/api/player/register`) si presentano come «KairosXC/x.y» senza versione, mentre i battiti dicono «portal x.y» / «smart x.y». Quindi a ogni apertura tornavano «XC» (pastiglia sbagliata e, per un attimo, le impostazioni di XC) finché non arrivava un battito in primo piano. Ora `regAppOf` lascia STB o Smarters una TV già riconosciuta dai battiti; per una TV nuova `storeAppGuess` guarda l'ultimo download dello Store dalla stessa rete (o stesso IP) nelle ultime 48 ore (STB, Smarters o XC), così è giusta già nella richiesta «Da attivare». La HEAVY all'apertura usa la versione dell'ultimo battito (riceve subito le sue voci). Nella scheda del cliente «App del cliente» ha anche Kairos STB, Smarters e Nova (`APPS` accetta `portal` e `smart`). Una TV rimasta segnata male si corregge da sola al prossimo battito con l'app in primo piano. Prova: `srv_app_recog.mjs`.

## 93. Kairos Player per TV LG e Samsung: «invia la lista dal telefono» (14 novembre 2026)

- Cartella `smarttv/`: lettore neutro per webOS e Tizen (l'utente inserisce la sua lista; nessun contenuto, nessun legame con clienti, codici o linee del pannello). Vedi `smarttv/README.md` e `smarttv/docs/STORE.md`.
- Server (`src/tvpair.js`, pubblico, anche sul dominio dei download): `POST /api/tv/pair` dà al TV un codice di 6 caratteri e un segreto; la pagina `GET /tv` manda codice e lista con `POST /api/tv/send`; il TV la ritira una volta sola con `POST /api/tv/poll`. Tabella `tv_pair` (migrazione 0057): lista cifrata, 15 minuti al massimo, cancellata alla consegna. Limiti per IP (`RL_DEVICE`), al più 4000 codici aperti.
- Prove: `srv_tv_pair.mjs`, `tv_player.mjs`.
