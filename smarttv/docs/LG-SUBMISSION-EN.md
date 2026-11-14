# Kairos Player 0.3.0 — LG Content Store submission kit

Texts in English, ready to paste into LG Seller Lounge (app registration, QA comments, test scenario, self-checklist).
Fill the fields in **[brackets]** before submitting.

---

## 1. App information

| Field | Value |
|---|---|
| App name | Kairos Player |
| App ID | `com.kairos.player` |
| Version | 0.3.0 |
| Package | `com.kairos.player_0.3.0_all.ipk` — web app + JS service `com.kairos.player.service` |
| Type | Web app (HTML/CSS/JavaScript ES5) |
| Resolution | 1920×1080 (layout scales to 1280×720) |
| Languages | English, Italian (follows the TV language; can be changed in Settings) |
| Input | Remote control (arrows, OK, BACK, media keys, CH+/CH−), Magic Remote pointer and wheel |
| Network | Required |
| Account / login | None |
| Payments, ads, analytics | None |
| Suggested category | Entertainment |
| Seller / support | [Your name or company] · [support e-mail] |
| Privacy policy URL | [https://… page with the text in section 8] |

**Short description (appinfo `appDescription`, 36 characters):** Media player for your own playlists

---

## 2. Store description

**English**
Kairos Player is a media player for your TV. Add your own playlist (M3U link or Xtream login) and watch channels, movies and series with a simple remote-friendly interface: categories, favourites, search, programme guide, resume for movies, parental PIN.
You can also add the playlist from your phone: the TV shows a code and the playlist is entered on a web page.
Kairos Player does not provide or include any channels, movies or other content: it only plays playlists added by the user, who must have the right to watch them.

**Italiano**
Kairos Player è un lettore multimediale per la tua TV. Aggiungi la tua lista (link M3U oppure accesso Xtream) e guarda canali, film e serie con un'interfaccia semplice pensata per il telecomando: categorie, preferiti, ricerca, guida dei programmi, ripresa dei film da dove eri arrivato, controllo genitori con PIN.
Puoi aggiungere la lista anche dal telefono: il TV mostra un codice e la lista si scrive su una pagina web.
Kairos Player non fornisce e non contiene canali, film o altri contenuti: riproduce solo le liste inserite dall'utente, che deve avere il diritto di guardarle.

---

## 3. Notes for the reviewer (QA comments)

Kairos Player is a media player for user-supplied playlists (M3U or Xtream Codes API). It ships with no content, no channel list and no provider list, and it connects only to the playlist server entered by the user.

**Test playlist:** `https://store-k.download/tv/demo.m3u`
It contains five titles by the Blender Foundation, licensed CC BY 3.0 (Big Buck Bunny and Tears of Steel as HLS test streams from Mux; Tears of Steel, the Sintel trailer and the Big Buck Bunny trailer from download.blender.org). No third-party channels or films.

How to add it: open the app → "M3U link" → Name: any → Playlist address: the link above → Save.
Alternatively: "From your phone" → open `https://store-k.download/tv` on a phone or PC → enter the code shown on the TV and the same link → the TV receives it within a few seconds. The playlist is relayed through our server only to reach the TV: it is stored encrypted for at most 15 minutes and deleted on delivery.

JS service: on webOS, packaged web apps are subject to CORS, and most playlist servers do not send CORS headers. The bundled JS service `com.kairos.player.service` therefore downloads the playlist text (only http/https URLs requested by the app, max 64 MB, 45 s timeout, max 5 redirects) and returns it to the app in 128 KB chunks; nothing is written to disk and unclaimed data is discarded after 120 s. Video, logos and posters are loaded directly by the media player and image elements.

Security notes: no credentials are hard-coded. The word "password" appears only as UI labels, as the `type="password"` attribute of the masked field and as the query parameter name required by the Xtream Codes API. Playlists saved on the TV are obfuscated with a random per-device key. No `eval`, no remote code.

Adult categories (by name) are hidden by default and can be shown only after the user sets a 4-digit parental PIN.

---

## 4. Test scenario

| # | Action | Expected result |
|---|---|---|
| 1 | Launch the app | Splash screen, then "Add a playlist" with focus on "M3U link" |
| 2 | DOWN on "Name" | Field highlighted; the virtual keyboard does **not** open |
| 3 | OK on "Name", type "Demo", OK on the keyboard | Keyboard opens on OK; after typing, OK moves to "Playlist address" |
| 4 | OK, type `https://store-k.download/tv/demo.m3u`, OK, OK on "Save" | Loading spinner, then Home with 7 tiles |
| 5 | Live TV → "Big Buck Bunny (HLS)" → OK | Full-screen playback, title and on-screen buttons (Previous channel, Next channel, Close) |
| 6 | UP/DOWN or CH+/CH− | Previous/next channel |
| 7 | Move the Magic Remote pointer, click "Next channel" | Buttons appear on pointer movement; click changes channel |
| 8 | BACK | Player closes, focus on the last channel watched |
| 9 | Movies → "Sintel (trailer)" → Watch | Playback with progress bar and buttons (Back 10 s, Pause, Forward 10 s, Close) |
| 10 | PLAY, then PAUSE on the remote | Each key toggles pause/resume; controls stay visible while paused |
| 11 | FF / RW, LEFT / RIGHT | Seek ±30 s / ±10 s |
| 12 | Settings → Adult categories | Asks to set a parental PIN first |
| 13 | My playlists → Add → "From your phone" | Code, page address and QR code; the TV waits and receives the playlist sent from the page |
| 14 | HOME during playback, then relaunch | Playback stops in background; the app reopens where it was |
| 15 | BACK on Home | Returns to the TV system (`webOS.platformBack()`: system exit popup on webOS 6+, launcher on older versions) |
| 16 | Wrong playlist address / network off | Clear error message, the user can retry or go back |

---

## 5. Self-checklist — how the app meets each requirement

**Remote control and focus**
- Every screen is fully usable with the 5-way keys and OK; the focused item is always visible (highlight + white border) and focus is restored when returning to a screen.
- Magic Remote: pointer hover moves the focus, click activates, the wheel scrolls lists; moving the pointer in the player shows on-screen controls.

**BACK key**
- `disableBackHistoryAPI: true` in `appinfo.json`; the app handles BACK (461) on every screen and goes one level up.
- On the entry screens (Home, first-run "Add a playlist" when no playlist exists) BACK calls `webOS.platformBack()` from the official webOSTV.js library — no custom exit dialog.
- BACK while typing closes the virtual keyboard only; BACK in the player closes the player.

**Virtual keyboard**
- Opens only when OK is pressed on a text field, never on focus; the keyboard's Enter moves to the next field.

**Media keys**
- PLAY (415) and PAUSE (19) both toggle play/pause; STOP (413) closes the player; FF (417) / RW (412) seek ±30 s; CH+/CH− (33/34) change channel.
- On-screen controls for Magic Remote users (no media keys needed).

**Visual design**
- Text ≥ 20 px and buttons/list items ≥ 75 px high at 1920×1080 (checked automatically on the first-run, Home, Live TV and player screens); 16:9 layout; loading spinner while content loads.

**Stability and lifecycle**
- Network/authentication errors show clear messages with a way back; no dead ends.
- Playback stops when the app goes to background (`visibilitychange`); state is kept on relaunch.

**Security and privacy**
- No hard-coded credentials; no variables named password/passwd/pwd/credential/token (see reviewer notes for the remaining string occurrences).
- Stored playlists obfuscated with a random per-device key; no personal data collected; no analytics, ads or third-party SDKs; no remote code, no `eval`.

**Package**
- `appinfo.json`: id, version (x.y.z), vendor, type, main, title, `appDescription`, icon 80×80, largeIcon 130×130, `splashBackground` 1920×1080, resolution, `requiredACG: ["activity.operation"]`.
- JS service `com.kairos.player.service` (name = app ID + `.service`), ES5 JavaScript for older webOS Node.js versions.
- Third-party code: webOSTV.js 1.2.13 by LG Electronics (Apache License 2.0, license file included). Nothing else.

---

## 6. Images

| File | Size | Use |
|---|---|---|
| `webos/icon.png` | 80×80 | App icon (appinfo `icon`) |
| `webos/largeIcon.png` | 130×130 | App icon (appinfo `largeIcon`) |
| `webos/splash.png` | 1920×1080 | Splash screen (appinfo `splashBackground`) |
| `lg/icon-400.png` | 400×400 | Store listing icon |
| `store-assets/screens/en-*.png/.jpg` | 1920×1080 | Screenshots (English) |
| `store-assets/screens/it-*.png/.jpg` | 1920×1080 | Screenshots (Italian) |

Screenshots use only the test playlist above. The player screenshot shows a computer-generated video (fractal) titled "Sample video (generated)".

---

## 7. Build, package, test

```
node build.mjs                                   # dist/webos, dist/webos-service, dist/tizen
ares-package dist/webos dist/webos-service -o dist
ares-setup-device                                # TV with the "Developer Mode" app
ares-install -d <tv> dist/com.kairos.player_0.3.0_all.ipk
ares-launch -d <tv> com.kairos.player
ares-inspect -d <tv> --app com.kairos.player     # debug in the browser
```

Before submitting, test on at least one real LG TV: HLS, MPEG-TS, MP4 and MKV playback; virtual keyboard; media keys; Magic Remote; BACK on every screen; background/relaunch.

---

## 8. Privacy policy (publish on a web page)

**Kairos Player — Privacy policy**
Kairos Player does not collect personal data. Playlists, favourites and settings are stored only on the user's TV and can be erased in Settings → Erase all data, or by uninstalling the app. The app has no advertising or analytics and sends no information to the developer. It connects only to the playlist server chosen by the user, to read the list of contents and play them; like any connection, that server receives the TV's IP address.
"From your phone" feature: if the user uses it, the playlist entered on the web page passes through our server to reach the TV. The server keeps it encrypted only for the time needed for delivery, at most 15 minutes, then deletes it; the IP address of whoever requests a code is used only to prevent abuse.
Data controller: [your name or company, address]. Contact: [support e-mail].

**Kairos Player — Informativa sulla privacy**
Kairos Player non raccoglie dati personali. Le liste, i preferiti e le impostazioni restano salvati solo sul TV dell'utente e si cancellano da Impostazioni → Cancella tutti i dati, oppure disinstallando l'app. L'app non usa pubblicità né strumenti di statistica e non invia informazioni a chi l'ha sviluppata. Si collega soltanto al server della lista scelta dall'utente, per leggere l'elenco dei contenuti e riprodurli; quel server riceve, come per ogni collegamento, l'indirizzo IP del TV.
Funzione «Dal telefono»: se l'utente la usa, la lista che scrive sulla pagina web passa dal nostro server per arrivare al TV. Il server la tiene cifrata per il tempo della consegna, al massimo 15 minuti, poi la cancella; l'indirizzo IP di chi chiede il codice serve solo a impedire gli abusi.
Titolare del trattamento: [nome o ditta, indirizzo]. Contatto: [email di assistenza].
