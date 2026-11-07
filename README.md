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

## 7. Approvazione download dello store

Con questa funzione nessuno scarica un'app dal tuo Kairos Store senza il tuo ok. Quando un cliente preme **Installa**, lo store chiede l'autorizzazione: a te arriva un'**email** con app, dispositivo, ora, paese e un **codice di 6 cifre**, e la richiesta compare nel pannello alla pagina **Download store**. Premi **Autorizza** (nell'email o nel pannello) e il download sul dispositivo parte da solo; oppure detti il codice al cliente, che lo scrive nello store.

**1. Chiave gratuita per le email (Resend)** — una volta sola
1. Vai su **resend.com** → *Sign up* e registrati **con la tua email**, quella dove vuoi ricevere gli avvisi (il piano gratuito basta: 100 email al giorno).
2. Nel menu **API Keys** → *Create API Key* → nome `kairos`, permesso **Sending access** → *Add*. Copia la chiave (inizia con `re_`): viene mostrata una volta sola.
3. Su GitHub, repository **kairos-iptv** → *Settings → Secrets and variables → Actions* → **New repository secret**: nome `RESEND_KEY`, valore la chiave copiata. Non incollarla da nessun'altra parte e non condividerla con nessuno.
4. (Facoltativo) nella scheda **Variables** crea `OWNER_EMAIL` = la tua email. Puoi anche scriverla direttamente nel pannello.
5. **Actions → "Pannello Cloudflare" → Run workflow**: crea la tabella delle richieste e carica la chiave sul Worker.

> Il mittente di prova `onboarding@resend.dev` funziona senza dominio, ma **solo verso l'email con cui ti sei registrato su Resend**. Se un giorno verifichi un tuo dominio su Resend, crea la variabile `MAIL_FROM` (es. `Kairos Store <store@tuodominio.it>`) e potrai usare qualsiasi indirizzo. Se la prima email finisce nello spam, segnala "Non è spam".

**2. Pannello** → pagina **Download store**: controlla che *Chiedi la mia autorizzazione* sia acceso, scrivi la tua email e premi **Salva**. Se lo spegni i download partono subito, ma restano registrati nello storico.

**3. Collega lo store** — nel repository **kairos-store** apri `docs/apps.json` e, dentro `"store"`, scrivi l'indirizzo del pannello **senza** `/panel`:
```json
"approval": { "server": "https://kairos-panel.TUO-SOTTODOMINIO.workers.dev", "on": true }
```
Salva (Commit): lo store si aggiorna da solo in un minuto. Con `"server": ""` oppure `"on": false` lo store torna a scaricare senza chiedere nulla.

**4. App dello store** — la nuova versione di Kairos Store (si aggiorna da sola) blocca anche lei ogni download non autorizzato, non solo la pagina.

**Se usi le regole WAF del punto 5**, aggiungi `/api/store` alla regola 1 (*URI Path inizia con `/api/player` **oppure** inizia con `/api/store` → Skip*), altrimenti lo store sulle TV non riesce a chiedere l'autorizzazione.

**Da sapere**
- La richiesta resta valida 24 ore; dopo l'ok il cliente ha 30 minuti per scaricare. **Ogni autorizzazione vale per una sola app e un solo download**: per installare di nuovo (o un'altra app) serve un nuovo codice. 5 codici sbagliati annullano la richiesta.
- Nel pannello (*Download store*) puoi **Revocare** un'autorizzazione non ancora usata e **Bloccare un dispositivo**: non potrà più chiederti download e le sue richieste in corso decadono.
- Senza `RESEND_KEY` non arrivano email, ma le richieste compaiono comunque nel pannello (con il codice) e puoi autorizzarle da lì.
- Il link **Autorizza** dell'email apre una pagina di conferma con il pulsante: così i programmi antivirus della posta che "aprono" i link da soli non possono autorizzare nulla al posto tuo.
- I link degli APK e i codici Downloader in `apps.json` restano pubblici su GitHub: chi li copia può scaricare fuori dallo store. L'autorizzazione controlla i download **dallo store**; la tua app Kairos resta comunque protetta dall'attivazione nel pannello.

**Store intestati ai venditori (senza conferma a ogni download)** — in alternativa all'autorizzazione a ogni download, il pannello può chiedere che **ogni installazione dello store venga attivata una volta** con il codice di un venditore (il tuo o quello di un agente):
- Pannello → **App da approvare → Approvazione** → scegli **Solo store attivati, senza conferma** e imposta il **tetto di store attivabili per agente** (di serie 50; lo cambi per il singolo agente in *Agenti → scheda → Store attivabili*; tu non hai tetto). Premi **Salva**.
- Alla prima apertura dello store compare **«Attiva lo store»**: chi lo installa (di solito l'agente, a casa del cliente) scrive il suo **codice venditore** una volta sola. Da quel momento lo store scarica **senza finestre** e ogni download è **intestato a quel venditore**; nello header dello store si legge *«Store di <nome>»* (toccandolo si può cambiare venditore con un altro codice).
- Uno store **non attivato non scarica nulla** (vede *«Store da attivare»*). Il link `?v=CODICE` continua solo a precompilare il codice nelle richieste: **non attiva** lo store.
- Dopo 8 codici sbagliati (per dispositivo o per IP) l'attivazione si ferma per un'ora. Il pulsante **Nuovo** (nuovo codice venditore) impedisce altre attivazioni con il vecchio codice, senza scollegare gli store già attivati.
- Chi vede cosa: tu vedi ogni store in **Dispositivi** (*«store di …»*, con **Scollega**) e tutto insieme in **Riepilogo store** (store attivati, download, dispositivi e utenti, per agente e per app, ultimi 30 giorni); l'agente vede i suoi in **I tuoi store** e li può scollegare; a ogni attivazione gli arriva un messaggio Telegram (se collegato). Uno store scollegato torna «da attivare».
- Con **Chiedi la mia autorizzazione** gli store attivati contano lo stesso: la richiesta va al venditore dello store senza che il cliente scriva nessun codice; con **Download liberi** l'intestazione si spegne.

**Avvisi gratis su Telegram e sul telefono** — ogni richiesta arriva con i pulsanti **Autorizza** e **Rifiuta**; quando qualcuno decide, il messaggio si aggiorna per tutti con l'esito e il nome di chi ha deciso.

*Telegram*
1. In Telegram apri **@BotFather** → `/newbot` → scegli un nome (es. *Kairos Store*) e un nome utente che finisce con `bot`. Copia il **token** che ti dà (tipo `123456789:AA…`).
2. Su GitHub, repository **kairos-iptv** → *Settings → Secrets and variables → Actions* → **New repository secret**: `TELEGRAM_BOT_TOKEN` = il token. Poi **Actions → "Pannello Cloudflare" → Run workflow**.
3. Pannello → **Download store** → **Avvisi su Telegram e sul telefono** → **Collega Telegram**: si apre il bot, premi **Avvia**. Fatto (il bot si collega al pannello da solo la prima volta).
4. Per gli agenti: nella stessa scheda accendi **Telegram** accanto al loro nome e premi **Salva consensi**; ognuno poi preme **Collega Telegram** dal proprio pannello. Ricevono solo le richieste delle app che gestiscono (permesso *Download store*). Scrivendo `/stop` al bot la chat si scollega.

*Notifiche del pannello (web push)* — niente da configurare su GitHub.
- **Android / PC**: apri il pannello con Chrome, Edge o Firefox (sul telefono conviene *menu → Installa app*), poi **Attiva notifiche su questo dispositivo** e consenti. Dalla notifica puoi autorizzare o rifiutare direttamente.
- **iPhone / iPad** (iOS 16.4 o successivo): apri il pannello con Safari → **Condividi → Aggiungi a schermata Home**, apri **Kairos** dalla Home e attiva le notifiche da lì. Tocca la notifica per aprire la richiesta.
- La notifica arriva senza dati: il testo lo legge il telefono dal pannello con il tuo accesso, quindi su un telefono scollegato non compare niente. Per gli agenti accendi **Notifiche** accanto al loro nome.

**Codici via SMS (facoltativo)** — il codice di ogni richiesta arriva anche per SMS a te e agli agenti che scegli tu. Gli SMS si pagano: con Twilio circa 8-10 centesimi l'uno verso numeri italiani (controlla il prezzo aggiornato su twilio.com).
1. Registrati su **twilio.com**, aggiungi credito (*Billing*) e compra un numero che possa inviare SMS in Italia (*Phone Numbers → Buy a number*), oppure crea un *Messaging Service*.
2. Nella home della console copia **Account SID** (inizia con `AC`) e **Auth Token**.
3. Su GitHub, repository **kairos-iptv** → *Settings → Secrets and variables → Actions*:
   - **Secrets**: `TWILIO_SID` = Account SID, `TWILIO_TOKEN` = Auth Token;
   - **Variables**: `TWILIO_FROM` = il numero Twilio con il prefisso (es. `+12025550123`) oppure il SID del Messaging Service (inizia con `MG`).
4. **Actions → "Pannello Cloudflare" → Run workflow**.
5. Pannello → **Download store** → scheda **Codici via SMS**: accendi *Invia il codice via SMS*, scrivi il tuo numero e, per ogni agente a cui lo consenti, il suo numero con *Consenti* acceso. Premi **Salva** e poi **Invia SMS di prova**.

Gli agenti ricevono gli SMS solo se il loro account è attivo e hanno il permesso **Download store** per quell'app; i numeri li decidi solo tu. Il **tetto giornaliero** (predefinito 50) evita spese impreviste: raggiunto il tetto, le richieste arrivano solo via email e nel pannello. Con l'account di prova di Twilio gli SMS arrivano solo ai numeri verificati nella console Twilio.

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
- **I temi si scaricano solo se il cliente li ha**: scena e avatar di ogni tema stanno sul server (`cloudflare/src/addon-assets.js`) e l'app li chiede solo per i temi che le hai dato (il server controlla codice, abbonamento e assegnazione). Se togli un tema, l'app lo cancella dal dispositivo. Nello store i temi non posseduti mostrano solo nome, descrizione, colori e prezzo. Skin colorate (3 colori) e pacchetti avatar Animali/Sport/Spazio restano nell'app.
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

- Nella scheda dell'agente, oltre ai permessi sui clienti (ora anche **collegare dispositivi**, **profili/lettore/visioni**, **assistente IA dei clienti**), c'è **«Pagine del pannello»**: Dashboard, Online ora, Errori applicazione, Segnalazioni, Richieste contenuti, Richieste temi, Messaggi, **Download store (accettare le richieste)**, Videoteca, Attività. Ogni pagina mostra **solo i dati dei suoi clienti** (messaggi solo ai suoi clienti, mai a tutti; videoteca solo con le linee dei suoi clienti; attività solo sue). Impostazioni, Server DNS, API, Manutenzione e impostazioni dell'assistente restano solo tue perché valgono per tutti.
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
- **App dello store che può approvare**: *Tutte le app* oppure solo quelle che spunti (l'elenco si riempie con le app richieste dallo store; puoi aggiungerne a mano). Un sotto-agente non può mai averne più di chi lo crea.
- **Download store: vedere anche i download degli altri**: spento di base. L'agente vede le richieste in attesa delle sue app e, nello storico, solo i download approvati da lui (e dai suoi sotto-agenti). Può revocare solo i suoi. Tu vedi tutto, con il nome dell'agente accanto a ogni download.
- **Vedere i clienti dei suoi sotto-agenti**: acceso di base; spento vede e gestisce solo i clienti attivati da lui. I tuoi clienti e quelli degli altri agenti non li vede mai.
- **Manutenzione dei suoi clienti**: spento di base. Se acceso, l'agente ha il pulsante 🔧 Manutenzione che blocca l'app solo ai suoi clienti. La manutenzione generale resta solo tua; se un agente l'ha accesa lo vedi in alto e puoi spegnerla.
- **Attività**: l'agente vede solo le sue azioni (anche le approvazioni dello store).

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

- **Menu in due parti**. *Operatività*: Panoramica · Clienti (Clienti, Agenti, Online ora) · Da gestire (Segnalazioni, Richieste contenuti, Richieste temi, Richieste IA, Download store) · Contenuti e comunicazione (Messaggi, Videoteca) · App e distribuzione (App Kairos, Codici downloader, App terzi) · Controllo (Errori applicazione, Attività). *Impostazioni*: Aspetto e marchio (con prezzo e privacy) · Funzioni dell'app · Store add-on · Assistente IA · Server DNS e VPN (con la VPN generale) · Manutenzione · Sicurezza e account · API e integrazioni.
- **Barra in alto**: ricerca, pillola *Manutenzione ON/OFF* (accende e spegne al volo; messaggio ed esclusi in Impostazioni → Manutenzione), campanella con tutte le richieste in attesa, *Nuovo cliente*.
- **Panoramica**: Azioni rapide (nuovo cliente, rinnova in scadenza, messaggio a tutti, copia codice downloader, attiva su OrbixPlay/MaxPlayer, manutenzione) e Interruttori rapidi (manutenzione, approvazione download store, playlist personali, eventi sportivi, assistente IA, pulizia automatica app terzi, agenti che vedono i DNS), più i riquadri e i grafici di prima.
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

## Struttura

```
android/            progetto Android (Kotlin, WebView) — Fire TV / Android TV / telefoni
player/index.html   interfaccia dell'app (stile Netflix), copiata nell'APK durante la build
cloudflare/
  src/worker.js     API + sicurezza
  src/store.js      autorizzazione dei download dello store (/api/store)
  migrations/       tabelle del database D1
  public/panel/     pannello (HTML + JS)
  wrangler.toml     configurazione Cloudflare
.github/workflows/  compilazione APK, pubblicazione pannello, generazione segreti
```

L'app è solo un lettore e non contiene canali: i contenuti arrivano dalle playlist che assegni. Assicurati di avere i diritti per distribuirli.
