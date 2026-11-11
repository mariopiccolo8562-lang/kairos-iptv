# Protezioni attive

## Accesso al pannello
- **Password con hash PBKDF2-SHA256** (100.000 iterazioni, sale casuale): nel database la password non c'è mai in chiaro.
- **Verifica in due passaggi (TOTP)**: funziona con Google Authenticator, Microsoft Authenticator e Authy. Ogni codice è usabile una sola volta (anti-replay).
- **Blocco dei tentativi**:
  - massimo 5 tentativi al minuto per IP, con il rate limiting nativo di Cloudflare;
  - dopo 5 errori consecutivi l'IP resta bloccato per 15 minuti (contano sia le password sbagliate sia i codici 2FA sbagliati).
- **Turnstile** anti-bot sul login (se configurato).
- **Cloudflare Access / Zero Trust** davanti a `/panel` e `/api/admin` (se configurato). Il Worker verifica anche la firma del token di Access (RS256), quindi non basta aggirare il proxy.
- **Messaggi neutri**: la risposta non rivela se un nome utente esiste. Anche i tempi di risposta sono uniformi, quindi non lo rivelano neppure quelli.

## Sessione
- Cookie `__Host-` con `Secure`, `HttpOnly` e `SameSite=Strict`, valido 12 ore. JavaScript non lo può leggere.
- Nel database si salva solo l'**hash** del token di sessione.
- **Protezione CSRF**: ogni modifica richiede un header dedicato e controlla l'origine (`Origin` / `Sec-Fetch-Site`).
- Cambiando la password si chiudono le altre sessioni. C'è anche il pulsante "Chiudi le altre sessioni".
- A ogni accesso viene creato un token nuovo e quello vecchio eventualmente presente nel browser viene annullato.

## Accesso degli agenti (Impostazioni → Sicurezza e account)
Regole che il titolare accende quando vuole (spente di serie). Valgono per agenti e sotto-agenti, mai per il titolare né per la sua «Entra per assistenza».
- **Accesso di 7 giorni**: 7 giorni dopo l'accesso l'agente deve rientrare con il link e il codice (o utente e password). Senza, l'accesso resta valido 30 giorni dall'ultimo uso.
- **Massimo 2 dispositivi per agente**: al terzo accesso si chiude la sessione entrata per prima. Rientrare dallo stesso browser non conta come dispositivo nuovo. Accendendola, chi ha più di 2 dispositivi resta collegato solo sui 2 più recenti.
- **Solo da questi Paesi** (di serie l'Italia): conta il Paese che Cloudflare vede per la connessione, all'accesso e a ogni richiesta. Le reti Tor e i Paesi sconosciuti sono rifiutati. All'agente si dice solo che il suo Paese non è consentito, non quali Paesi lo sono. Una password sbagliata dall'estero riceve sempre «Credenziali errate».
- **Avvisami su Telegram**: un messaggio al titolare quando un agente con link o password giusti viene fermato dall'estero, viene scollegato perché lavora da un altro Paese o entra da un terzo dispositivo.
- **Verifica in due passaggi obbligatoria**: finché non la attiva, l'agente può solo attivarla (o uscire); mentre è obbligatoria non la può spegnere. Nota: chi entra per primo con link e codice di un agente senza 2FA la attiva sul proprio telefono, quindi conviene accenderla subito e controllare i dispositivi.
- **Dispositivi dell'agente** (Agenti → Link accesso): elenco dei dispositivi collegati (browser, città e Paese dell'accesso, quando è entrato) con «Scollega». Nessun indirizzo IP nell'elenco.
- Il dispositivo scollegato da una regola o dal titolare mostra all'agente il motivo («sono passati 7 giorni», «il tuo account è entrato da un altro dispositivo», «Paese non consentito», «il titolare ti ha scollegato»); i motivi restano 8 giorni (tabella `ses_out`). Accessi rifiutati e dispositivi scollegati finiscono in Attività.

## Dati
- **Le credenziali delle playlist sono cifrate con AES-256-GCM** nel database D1. La chiave `ENC_KEY` è un segreto del Worker.
- Gli URL delle playlist vengono controllati: sono ammessi solo `http` e `https`.
- Il registro **Attività** traccia accessi, accessi falliti (con IP) e modifiche. Le voci più vecchie di 90 giorni vengono cancellate da sole.
- Le **configurazioni VPN (WireGuard)** sono cifrate come le playlist e non vengono mai rimandate al pannello: si vede solo "configurata". Ogni app riceve solo la configurazione del proprio account.

## App dei clienti
- Ogni installazione genera un **segreto casuale da 256 bit**. Il codice dispositivo resta legato a quel segreto, quindi un codice copiato non funziona su un'altra TV.
- **Rate limiting** sulle richieste delle app e limite massimo di dispositivi "in attesa", contro chi prova a riempire il database. Se il limite si riempie, vengono tolti per primi i dispositivi in attesa non più visti da 2 ore (un'app vera che mostra il codice si ricollega ogni pochi secondi).
- **Codici di collegamento a 6 cifre** (per aggiungere una TV a un account): validi 10 minuti, usabili una volta, salvati solo come hash. Contro chi li prova a caso: 5 tentativi ogni 10 minuti per IP e per dispositivo, e collegamenti sospesi per tutti se in 10 minuti si superano 100 errori. Ogni collegamento e ogni codice sbagliato finiscono nell'Attività.
- Le connessioni e i profili si possono modificare solo dall'app che conosce codice **e** segreto del dispositivo, e solo con abbonamento attivo; il fornitore può bloccare la modifica dei profili.
- L'app riceve solo le **sue** playlist, e solo se l'abbonamento è attivo e non scaduto.
- L'app non può navigare fuori dai propri file.

## Header HTTP
- `Content-Security-Policy` restrittiva: niente script inline; il pannello si collega solo a sé stesso, a Turnstile e ai font Google.
- `Strict-Transport-Security` (HSTS), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`.
- `X-Robots-Tag: noindex`: il pannello non finisce su Google.
- Le API non vengono mai messe in cache.

## Manutenzione automatica
- Ogni notte un cron del Worker cancella sessioni scadute, blocchi vecchi, log oltre 90 giorni, codici di collegamento scaduti e dispositivi mai attivati e non visti da 30 giorni (non quelli collegati a un cliente né quelli a cui hai dato un nome o una nota).
