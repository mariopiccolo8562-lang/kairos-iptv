package com.kairos.player

import android.app.AlertDialog
import android.content.Intent
import android.content.res.ColorStateList
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.StateListDrawable
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.text.TextUtils
import android.util.TypedValue
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.WebSettings
import android.widget.AbsListView
import android.widget.BaseAdapter
import android.widget.FrameLayout
import android.widget.HorizontalScrollView
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ListView
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import org.json.JSONObject
import java.util.Locale

/**
 * Player nativo a schermo intero (ExoPlayer o VLC).
 * Riceve dal player web: lista canali/titolo, indice, posizione di partenza e preferenze.
 */
class PlayerActivity : ComponentActivity(), EngineListener {

    companion object {
        /** payload passato in memoria (le liste canali possono essere troppo grandi per un Intent) */
        @Volatile var pending: String? = null
        /** lista già analizzata (dal thread del ponte JS, non da quello dell'interfaccia) */
        @Volatile var pendingJson: JSONObject? = null
        /** player aperto in questo momento (per «Disconnetti» dal pannello) */
        @Volatile var current: PlayerActivity? = null
        const val RESULT = "kx_result"
        private val ACCENT = Color.parseColor("#E5202B")
    }

    /** e = guida: [titolo ora, inizio, fine (secondi), titolo dopo, inizio dopo]; logo = indirizzo del logo (può mancare) */
    private data class Item(val id: String, val title: String, val url: String, val alt: String, val num: Int, val group: String, val epg: org.json.JSONArray?, val logo: String = "", val lite: List<Pair<String, String>> = emptyList())

    private val ui = Handler(Looper.getMainLooper())
    private lateinit var root: FrameLayout
    private lateinit var spinner: ProgressBar
    private lateinit var osd: LinearLayout
    private lateinit var brandView: TextView
    private lateinit var tBadge: TextView
    private lateinit var tTitle: TextView
    private lateinit var tSub: TextView
    private lateinit var tTime: TextView
    private lateinit var progress: ProgressBar
    private lateinit var bar: LinearLayout
    private lateinit var bPause: TextView
    private lateinit var bEngine: TextView
    private lateinit var zapView: TextView
    private lateinit var msgView: TextView
    private lateinit var veil: View
    private lateinit var tEpg: TextView

    private var engine: Engine? = null
    private var items: List<Item> = emptyList()
    private var index = 0
    private var kind = "live"
    private var engineName = "exo"
    private var engAllow: Set<String>? = null
    private var engLock = false
    private var engAuto = false
    private var userChangedEngine = false
    private var aspect = "fit"
    private var brand = "KAIROS"
    private var portal: PortalServer? = null
    private lateinit var prefs: PlayPrefs
    private var currentUrl = ""
    private var triedAlt = false
    private var triedFallback = false
    private var retries = 0

    /* ---------------- salta intro (serie) e immagine nell'immagine ---------------- */
    private var introKey = ""
    private var intro: LongArray? = null
    private var introAuto = false
    private var introChanged = false
    private var introDoneFor = ""
    private var introStartMark = -1L
    private lateinit var skipView: TextView

    /** ogni secondo: mostra «Salta intro» (o la salta da solo) mentre si è dentro l'intro segnata */
    private fun introTick() {
        if (!::skipView.isInitialized) return
        val iv = intro; val e = engine
        if (iv == null || isLive || e == null || !e.isPlaying() || zapPending) { if (skipView.visibility == View.VISIBLE) skipView.visibility = View.GONE; return }
        val pos = e.position()
        val inside = pos >= iv[0] && pos < iv[1] - 3000
        if (inside && introAuto && introDoneFor != item.id) { introDoneFor = item.id; skipIntro(); toast("Intro saltata"); return }
        if (inside && introDoneFor != item.id) { if (skipView.visibility != View.VISIBLE) { skipView.visibility = View.VISIBLE; skipView.alpha = 0f; skipView.animate().alpha(1f).setDuration(200).start() } }
        else if (skipView.visibility == View.VISIBLE) skipView.visibility = View.GONE
    }
    private fun skipIntro() {
        val iv = intro ?: return
        introDoneFor = item.id
        skipView.visibility = View.GONE
        engine?.seekTo(iv[1])
    }
    private fun fmtT(ms: Long): String { val t = ms / 1000; return if (t >= 3600) String.format(Locale.ITALIAN, "%d:%02d:%02d", t / 3600, t / 60 % 60, t % 60) else String.format(Locale.ITALIAN, "%d:%02d", t / 60, t % 60) }
    private fun menuIntro() {
        val pos = engine?.position() ?: 0L
        val iv = intro
        val opts = mutableListOf(
            Track("start", "Segna INIZIO intro qui (${fmtT(pos)})", false),
            Track("end", "Segna FINE intro qui (${fmtT(pos)})" + (if (introStartMark < 0 && iv == null) " · dall'inizio" else ""), false),
            Track("auto", "Salta automaticamente: " + if (introAuto) "Sì" else "No", false),
        )
        if (iv != null) opts.add(0, Track("info", "Intro: ${fmtT(iv[0])} – ${fmtT(iv[1])} (vale per tutti gli episodi)", false))
        if (iv != null) opts.add(Track("del", "Cancella l'intro segnata", false))
        choose("Salta intro", opts, "") {
            when (it.id) {
                "start" -> { introStartMark = pos; toast("Inizio intro segnato: ora vai alla fine e scegli «Segna FINE»") }
                "end" -> {
                    val st = if (introStartMark in 0 until pos) introStartMark else if (iv != null && iv[0] < pos) iv[0] else 0L
                    if (pos - st < 5000) { toast("L'intro deve durare almeno 5 secondi"); return@choose }
                    intro = longArrayOf(st, pos); introChanged = true; introStartMark = -1L; introDoneFor = item.id
                    toast("Intro segnata: ${fmtT(st)} – ${fmtT(pos)}. Negli altri episodi comparirà «Salta intro»")
                }
                "auto" -> { introAuto = !introAuto; introChanged = true; toast(if (introAuto) "L'intro verrà saltata da sola" else "Comparirà il pulsante «Salta intro»") }
                "del" -> { intro = null; introChanged = true; toast("Intro cancellata") }
            }
        }
    }
    /* ---------------- recupero automatico ---------------- */
    /** qualità adattiva: passa da solo alla versione più leggera del canale se la linea non regge */
    private var adapt = true
    private var drainEnabled = true
    /** decodifica software forzata dal recupero (problemi del decoder hardware): vale per tutta la visione */
    private var hwOff = false
    /** passi già provati sul contenuto in onda */
    private val recDone = HashSet<String>()
    private var recCooldownUntil = 0L
    private var lastActionAt = 0L
    /** variante in uso: -1 = originale, 0.. = item.lite[i] */
    private var varIdx = -1
    private var stayDown = false
    private var upAt = 0L
    /** dopo un calo, i canali successivi partono già nella versione più leggera per 10 minuti */
    private var weakUntil = 0L
    private var startAt = 0L
    private var readyOnce = false
    private var isBuffering = false
    private var bufferingSince = 0L
    private val stallTimes = java.util.ArrayDeque<Long>()
    private var lastFrames = -1L
    private var lastQueued = -1L
    private var lastPos = -1L
    private var freezeSec = 0
    /** video mai partito: l'audio va (la posizione avanza) ma nessun fotogramma dopo 10 s dall'avvio */
    private var nvPos = -1L
    private var nvSec = 0
    /** immagine «a scatti» con l'audio che va: fotogrammi mostrati/buttati nell'ultimo secondo (decoder che non ce la fa) */
    private var slowSec = 0
    private var slN = -1L
    private var slD = -1L
    private var slT = 0L
    /** chiavetta da 1 GB (classe D): CPU troppo debole per decodificare in software oltre la SD */
    private val lowDev by lazy { DeviceClass.of(this) == "D" }
    /** primo fotogramma arrivato dall'ultimo avvio / cambio di superficie (prima non si controlla l'immagine ferma) */
    private var frameSeen = false
    private var stallCounted = false
    /** player fermo (app in secondo piano): nessun controllo */
    private var stopped = false
    /** nuovo tentativo programmato (va annullato se si cambia canale o si esce) */
    private var retryRun: Runnable? = null
    /** motore e decodifica scelti all'apertura: il recupero li cambia solo per il contenuto in onda */
    private var baseEngine = ""
    private var recEngineChanged = false
    /** eventi dei motori: quelli di un motore sostituito o di un caricamento precedente vengono ignorati */
    private var engineGen = 0
    @Volatile private var playTok = 0
    private inner class GenL(val g: Int) : EngineListener {
        override fun onBuffering(buffering: Boolean) = evBuffering(g, playTok, buffering)
        override fun onReady() = evReady(g, playTok)
        override fun onError(message: String) = evError(g, playTok, message)
        override fun onEnded() = evEnded(g, playTok)
        override fun onFirstFrame() = evFirstFrame(g, playTok)
        override fun onAudioDisabled() = evAudioOff(g)
        override fun onAudioFail(code: String): Boolean = evAudioFail(g, playTok, code)
    }
    private fun live(g: Int, t: Int) = g == engineGen && t == playTok && !closing
    private fun cancelRetry() { retryRun?.let { ui.removeCallbacks(it) }; retryRun = null }
    private var okSince = 0L
    /** problema in corso, mandato al pannello quando si sa com'è finita */
    private var pendingEvt: JSONObject? = null
    /* ---- politica Kairos Adaptive ---- */
    /** classe della linea indicata dall'interfaccia web per questo avvio (vince su quella misurata qui) */
    private var uiLine = ""
    /** cuscinetto crescente: numero di blocchi recenti da compensare al prossimo READY (0 = nessuno) */
    private var cushionN = 0
    private var cushionRun: Runnable? = null
    /** fill-ratio dei primi 10 s (TS in diretta): Δ posizione scaricata / Δ tempo, dal watchdog; -1 = non ancora misurato */
    private var fillT0 = 0L
    private var fillP0 = -1L
    private var fillLowSec = 0
    private var fillDoneFor = ""
    private val drainSamples = java.util.ArrayDeque<Pair<Long, Long>>()
    private var drainCooldownUntil = 0L
    /** ENDED in diretta: istanti dei riavvii (al più 5 in 5 minuti) · ENDED precoce nei film ritentato (al più 2) */
    private val endTimes = java.util.ArrayDeque<Long>()
    private var endRetries = 0
    /** film/serie: ultima posizione buona (ogni secondo), usata quando il motore non la sa più (VLC dopo un errore) */
    private var lastGoodPos = 0L
    /** errore arrivato durante il cooldown di un recupero: rimandato alla fine del cooldown, non scartato */
    private var deferredErr: Runnable? = null
    private fun curClass(): String = NetMem.effectiveClass(this, uiLine)
    /* ---- autopilota: motore imparato per formato e zapping ---- */
    /** l'interfaccia dice che la scelta del lettore è «Automatico» (mai contro il pannello o il cliente) e qual era il motore di base */
    private var engLearn = false
    private var engDef = ""
    /** motore lasciato dal recupero e formato del contenuto: se con l'altro il problema si risolve, quello lasciato ha fallito */
    private var engLeft = ""
    private var engLeftKey = ""
    /** questa visione è già stata contata come riuscita per il suo motore */
    private var engOkDone = false
    /** verso dell'ultimo CH+/CH− e quando: serve a indovinare il canale successivo */
    private var zapDir = 0
    private var zapDirAt = 0L
    private val itemIds by lazy { items.map { it.id } }

    private fun liteOf(a: org.json.JSONArray?): List<Pair<String, String>> {
        if (a == null) return emptyList()
        val out = ArrayList<Pair<String, String>>()
        for (i in 0 until a.length()) { val x = a.optJSONArray(i) ?: continue; val u = x.optString(0); if (u.isNotEmpty()) out.add(u to x.optString(1)) }
        return out
    }

    private fun closeEvt(outcome: String) {
        val e = pendingEvt ?: return
        pendingEvt = null
        if (outcome == "risolto") engResolved()
        try { e.put("outcome", outcome); PlayStats.event(e) } catch (_: Exception) {}
    }

    /** problema risolto dopo un cambio di motore: per questo formato il motore lasciato ha fallito e quello in uso è riuscito */
    private fun engResolved() {
        val left = engLeft; engLeft = ""
        if (left.isEmpty() || left == engineName || engLeftKey.isEmpty()) return
        try { EngineMemo.fail(this, left, engLeftKey); EngineMemo.ok(this, engineName, engLeftKey) } catch (_: Throwable) {}
        engOkDone = true
    }

    /** con «Automatico»: ogni canale parte con il motore che su questo dispositivo va meglio per il suo formato (o con quello di base) */
    private fun autoEngine() {
        val learned = try { EngineMemo.best(this, EngineMemo.key(item.url, item.title), engAllow) } catch (_: Throwable) { null }
        val want = learned ?: engDef
        if ((want != "exo" && want != "vlc") || want == engineName) return
        val allow = engAllow
        if (allow != null && want !in allow && "auto" !in allow) return
        startEngine(want)
        baseEngine = engineName
    }

    /** dopo un cambio di canale: il canale successivo più probabile (sequenze imparate o verso dello zapping) risolve il DNS in anticipo */
    private val warmRun = Runnable {
        if (closing || stopped || !isLive || items.size < 2) return@Runnable
        val dir = if (System.currentTimeMillis() - zapDirAt < 30_000L) zapDir else 0
        val i = try { ZapMemo.predict(this, itemIds, index, dir) } catch (_: Throwable) { -1 }
        if (i in items.indices && i != index) { val u = items[i].url; ZapMemo.warm(portal?.let { Portals.re(this, it, u) } ?: u) }
    }

    private fun newEvt(problem: String, action: String, err: String, srv: String = "") {
        closeEvt("non risolto")
        pendingEvt = try {
            JSONObject().put("t", System.currentTimeMillis()).put("problem", problem).put("action", action).put("err", err.take(120))
                .put("title", item.title.take(120)).put("id", item.id.take(60)).put("k", kind).put("engine", engineName)
                .put("codec", PlayStats.codec).put("dec", if (PlayStats.decoder.isEmpty()) "" else if (isSoftware(PlayStats.decoder)) "sw" else "hw")
                .put("res", if (PlayStats.height > 0) "${PlayStats.height}p" else "").put("var", if (varIdx >= 0) item.lite.getOrNull(varIdx)?.second ?: "" else "")
                // stessi campi del battito (§9)
                .put("bw", PlayStats.bw).put("line", PlayStats.line).put("dev", PlayStats.dev).put("cls", PlayStats.cls).put("fill", PlayStats.fill).put("fmt", PlayStats.fmt)
                .apply { if (srv.isNotEmpty()) put("srv", srv) }
        } catch (_: Exception) { null }
    }

    private fun resetRecovery() {
        closeEvt("chiuso")
        engLeft = ""; engOkDone = false
        recDone.clear(); recCooldownUntil = 0L; varIdx = -1; stayDown = false; upAt = 0L
        readyOnce = false; isBuffering = false; bufferingSince = 0L; stallTimes.clear(); stallCounted = false
        drainSamples.clear()
        lastFrames = -1L; lastQueued = -1L; lastPos = -1L; freezeSec = 0; nvPos = -1L; nvSec = 0; okSince = 0L; frameSeen = false; slowSec = 0; slN = -1L
        cancelRetry()
        cancelCushion(); cushionN = 0
        deferredErr?.let { ui.removeCallbacks(it) }; deferredErr = null
        startAt = System.currentTimeMillis()
        PlayStats.recovery = ""; PlayStats.reduced = ""
    }

    private fun curPos(): Long = if (isLive) 0L else if (seekTarget >= 0) seekTarget else (engine?.position() ?: 0L).let { if (it <= 0L) lastGoodPos else it }

    /**
     * Cuscinetto crescente (§6.1): dopo un blocco, al ritorno in READY si resta in pausa tecnica finché la scorta non
     * raggiunge «ripresa + 2 s × blocchi» (al più +6 s), per al massimo 15 s (controllo ogni 250 ms); poi si riparte.
     * Niente riavvio del flusso: il buffer continua a riempirsi.
     */
    private fun startCushion(e: ExoEngine, n: Int) {
        cancelCushion()
        val target = e.rebufferMs() + minOf(2000L * n, 6000L)
        if (e.bufferedMs() >= target) return
        val until = System.currentTimeMillis() + 15_000L
        e.hold(true)
        spinner.visibility = View.VISIBLE
        val r = object : Runnable {
            override fun run() {
                if (closing || engine !== e) { cushionRun = null; return }
                if (e.bufferedMs() >= target || System.currentTimeMillis() >= until || stopped || zapPending) {
                    cushionRun = null; e.hold(false); spinner.visibility = View.GONE; return
                }
                ui.postDelayed(this, 250)
            }
        }
        cushionRun = r
        ui.postDelayed(r, 250)
    }

    private fun cancelCushion() {
        val r = cushionRun ?: return
        ui.removeCallbacks(r); cushionRun = null
        (engine as? ExoEngine)?.hold(false)
    }

    /** rango di qualità da un'etichetta di variante (4K/FHD/HD/SD) o dal nome di un canale; 0 = sconosciuto/base */
    private fun rankOf(s: String): Int {
        val u = s.uppercase(Locale.ROOT)
        return when {
            Regex("\\b(4K|UHD)\\b").containsMatchIn(u) -> 4
            Regex("\\b(FHD|1080P?)\\b").containsMatchIn(u) -> 3
            Regex("\\bHD\\b").containsMatchIn(u) -> 2
            Regex("\\bSD\\b").containsMatchIn(u) -> 1
            else -> 0
        }
    }

    /**
     * Variante di partenza secondo la classe effettiva (§5, allo zapping dentro il lettore; il canale iniziale lo sceglie
     * già l'interfaccia): debole ⇒ al più HD (SD sotto 2,5 Mbps misurati); normale ⇒ niente 4K; ottima ⇒ piena.
     * Dopo un calo recente ([weakUntil]) si riparte comunque un gradino sotto. «Massima» scelta dall'utente: sempre piena.
     * Ritorna l'indice in [Item.lite] (dalla più pesante alla più leggera) oppure -1 = versione originale.
     */
    private fun startVarIdx(): Int {
        val v = item.lite
        if (!adapt || v.isEmpty() || prefs.quality == "max") return -1
        val r = rankOf(item.title)
        val bw = NetMem.bwMbps(this)
        val cap = when (curClass()) { "weak" -> if (bw > 0 && bw < 2.5) 1 else 2; "normal" -> 3; else -> 4 }
        // rango noto e sopra il tetto: la più pesante entro il tetto, altrimenti la più leggera che c'è
        val pick = if (r > cap) (v.indexOfFirst { rankOf(it.second) in 1..cap }.takeIf { it >= 0 } ?: v.size - 1) else -1
        return if (pick < 0 && System.currentTimeMillis() < weakUntil) 0 else pick
    }

    private fun codecProblem(err: String): Boolean =
        err.startsWith("AUDIO_", true) || err.contains("DECOD", true) || err.contains("CODEC", true) ||
            PlayStats.lastCodecError.contains("DECOD", true) || PlayStats.lastCodecError.contains("CODEC", true)

    private fun networkSourceError(err: String): Boolean =
        err.contains("_IO_", true) || err.contains("HTTP", true) || err.contains("TIMEOUT", true) ||
            err.contains("NETWORK", true) || err.contains("CONNECTION", true)

    private fun canServer(err: String): Boolean {
        val p = portal ?: return false
        if (p.mode != "auto" || Portals.cands(p).size < 2 || codecProblem(err) ||
            (NetMem.lineClass(this) == "weak" || uiLine == "weak") || !Portals.canNext(this, p)) return false
        val type = try { JSONObject(NetInfo.json(this)).optString("type") } catch (_: Exception) { "" }
        return type.isNotEmpty() && type != "none"
    }

    private fun canEngine(): Boolean {
        val other = if (engineName == "vlc") "exo" else "vlc"
        return !triedFallback && (!engLock || engAuto) && (engAllow == null || other in engAllow!!)
    }

    /**
     * Prova da sola una soluzione quando la visione ha un problema, senza far uscire l'utente.
     * freeze = immagine ferma con l'audio che va · stall = caricamento che si ripete · error = errore del lettore
     * Ritorna false se non c'è più niente da provare.
     */
    private fun recover(problem: String, err: String = ""): Boolean {
        if (closing || zapPending) return true
        drainSamples.clear()
        val now = System.currentTimeMillis()
        if (now < recCooldownUntil) return true
        val canAlt = item.alt.isNotEmpty() && currentUrl != item.alt && !triedAlt
        val canSw = engine is ExoEngine && !hwOff && prefs.hw != "off" && !(lowDev && (PlayStats.height == 0 || PlayStats.height > 576))
        val canLite = adapt && varIdx + 1 < item.lite.size
        // scale per problema e per famiglia di errore (§6): mai il riavvio come primo passo per i blocchi
        val ladder = when (problem) {
            // decoder che non ce la fa («a scatti»): mai la decodifica software (più lenta), prima la versione più leggera
            "freeze" -> if (err == "SLOW_VIDEO" || lowDev) listOf("reload", "lite", "engine", "sw") else listOf("reload", "sw", "engine", "lite")
            "stall" -> listOf("lite", "alt", "reload", "server", "engine")
            "long" -> listOf("reload", "server", "alt", "lite", "engine")
            "fill" -> listOf("lite")
            "drain" -> listOf("lite")
            else -> when {
                // decoder audio mancante (AC-3, E-AC-3, MP2): l'altro motore li decodifica via software; poi il formato alternativo
                err.startsWith("AUDIO_") -> listOf("engine", "alt")
                // decoder video (avvio o decodifica): prima la decodifica software, poi l'altro motore
                err.contains("DECOD", true) || err.contains("CODEC", true) -> listOf("sw", "engine", "alt", "retry")
                // contenitore/manifest illeggibili o non supportati: l'altro motore subito
                err.contains("PARSING", true) || err.contains("UNSUPPORTED", true) -> listOf("engine", "alt", "retry", "lite")
                // rete/HTTP (404, 503, timeout): un riavvio, server di riserva, formato alternativo e altri tentativi
                networkSourceError(err) -> listOf("reload", "server", "alt", "retry", "retry2", "retry3", "lite", "engine")
                else -> listOf("alt", "engine", "retry", "retry2", "retry3", "lite")
            }
        }
        // «lite» si può ripetere (FHD → HD → SD) finché ci sono versioni più leggere; gli altri passi una volta per contenuto
        val step = ladder.firstOrNull { st ->
            (st == "lite" || !recDone.contains(st)) && when (st) {
                "alt" -> canAlt; "sw" -> canSw; "lite" -> canLite; "server" -> canServer(err)
                "engine" -> canEngine()
                else -> true
            }
        } ?: return false
        recDone.add(step)
        recCooldownUntil = now + 8000L; lastActionAt = now
        freezeSec = 0; stallTimes.clear(); okSince = 0L; slowSec = 0; slN = -1L
        val pos = curPos()
        val what = when (problem) { "freeze" -> "Immagine ferma"; "stall" -> "Caricamento continuo"; "long" -> "Caricamento lungo"; "fill" -> "Linea insufficiente"; "drain" -> "Buffer in calo"; else -> "Errore" }
        when (step) {
            "reload", "retry", "retry2", "retry3" -> {
                newEvt(problem, "ricaricato", err)
                PlayStats.recovery = "$what → ricaricato"
                if (step == "reload") toast("Problema di riproduzione: riparto…")
                val delay = when (step) { "retry" -> 1500L; "retry2" -> 3000L; "retry3" -> 6000L; else -> 0L }
                val u = currentUrl; val idx = index
                cancelRetry()
                if (delay == 0L) startUrl(u, pos)
                else { val r = Runnable { retryRun = null; if (!closing && !stopped && !zapPending && index == idx && currentUrl == u) startUrl(u, pos) }; retryRun = r; ui.postDelayed(r, delay) }
            }
            "sw" -> {
                newEvt(problem, "decodifica software", err)
                PlayStats.recovery = "$what → decodifica software"
                toast("Problema di riproduzione: provo la decodifica software…")
                hwOff = true; recEngineChanged = true
                startEngine("exo")
                if (engine != null) startUrl(currentUrl, pos)
                updateInfo()
            }
            "engine" -> {
                triedFallback = true; recEngineChanged = true
                val other = if (engineName == "vlc") "exo" else "vlc"
                engLeft = engineName; engLeftKey = EngineMemo.key(currentUrl, item.title, PlayStats.codec) // autopilota
                newEvt(problem, "passato a ${engineLabel(other)}", err)
                PlayStats.recovery = "$what → ${engineLabel(other)}"
                toast("Problema di riproduzione: provo con ${engineLabel(other)}…")
                startEngine(other)
                if (engine != null) startUrl(currentUrl, pos)
                updateInfo()
            }
            "alt" -> {
                triedAlt = true
                newEvt(problem, "formato alternativo", err)
                PlayStats.recovery = "$what → formato alternativo"
                startUrl(item.alt, pos)
            }
            "server" -> {
                val (old, _) = Portals.next(this, portal ?: return false) ?: return false
                newEvt(problem, "server di riserva", err, old)
                PlayStats.recovery = "$what → server di riserva"
                toast("Passo a un altro server…")
                startUrl(currentUrl, pos)
            }
            "lite" -> {
                val v = item.lite[varIdx + 1]
                newEvt(if (problem == "drain") "stall" else problem, if (problem == "drain") "qualità ridotta in anticipo" else "qualità ridotta" + (if (v.second.isNotEmpty()) " (${v.second})" else ""), err)
                varIdx++
                PlayStats.recovery = "$what → qualità ridotta"
                PlayStats.reduced = v.second.ifEmpty { "ridotta" }
                // i canali successivi partono leggeri solo se è la linea (misurata debole o blocchi su più canali), non il singolo canale
                if (NetMem.lineClass(this) == "weak" || NetMem.multiStalls(this)) weakUntil = now + 10 * 60_000L
                toast((if (problem == "freeze") "Qualità ridotta per questo dispositivo" else "Qualità ridotta per la tua connessione") + (if (v.second.isNotEmpty()) " (${v.second})" else ""))
                startUrl(v.first, pos)
            }
        }
        return true
    }

    /** controllo ogni secondo: immagine ferma, blocchi lunghi, ritorno alla qualità piena */
    private val watchRunnable = object : Runnable {
        override fun run() {
            if (closing) return
            try { watchdog() } catch (_: Throwable) {}
            ui.postDelayed(this, 1000)
        }
    }

    private fun watchdog() {
        try { introTick() } catch (_: Throwable) {}
        if (zapPending || stopped) { drainSamples.clear(); return }
        val now = System.currentTimeMillis()
        val e = engine
        while (stallTimes.isNotEmpty() && now - stallTimes.first > 90_000L) stallTimes.removeFirst()
        // film/serie: posizione buona aggiornata ogni secondo (dopo un errore alcuni motori riportano 0)
        if (!isLive && e != null && readyOnce && !isBuffering && seekTarget < 0) { val p = e.position(); if (p > 0) lastGoodPos = p }
        // fill-ratio (§1, §5): nei primi 10 s dopo il READY di un TS in diretta, Δ posizione scaricata / Δ tempo = velocità di
        // download ÷ bitrate. Sotto 1 per 10 s di fila la linea non regge questa versione: si scende alla più leggera PRIMA
        // dello stallo, una volta per canale. (Il solo Δ buffer misurerebbe «download ÷ bitrate − 1»: soglie senza senso.)
        if (e is ExoEngine && readyOnce && isLive && fillT0 > 0 && fillP0 >= 0 && now - fillT0 <= 15_000L && !e.isHls()) {
            val dt = now - fillT0
            if (dt >= 1500L) {
                val fill = (e.bufferedPos() - fillP0).toDouble() / dt
                PlayStats.fill = fill
                if (fill < 1.0) fillLowSec++ else fillLowSec = 0
                if (fillLowSec >= 10 && adapt && fillDoneFor != item.id && varIdx + 1 < item.lite.size && seekTarget < 0 && now >= recCooldownUntil) {
                    fillDoneFor = item.id; fillLowSec = 0
                    recover("fill")
                }
            }
        }
        if (drainEnabled && e is ExoEngine && readyOnce && isLive && e.isPlaying() && !isBuffering && seekTarget < 0 &&
            now >= recCooldownUntil && now >= drainCooldownUntil) {
            checkDrain(e, now)
        } else drainSamples.clear()
        // immagine ferma: il tempo avanza ma non arriva nessun fotogramma nuovo (solo ExoPlayer espone i contatori).
        // Solo dopo il primo fotogramma e 8 s dall'avvio; per i video quasi fermi (radio con immagine, slide) serve che il
        // decoder stia ricevendo dati, altrimenti un fotogramma ogni tanto è normale.
        if (e is ExoEngine && frameSeen && now - startAt > 8000L && e.playingVideo()) {
            val fr = e.renderedFrames(); val q = e.queuedFrames(); val pos = e.rawPosition()
            val fed = q > lastQueued && lastQueued >= 0 || e.frameRate() >= 5f
            if (fr >= 0 && lastFrames >= 0 && fr == lastFrames && pos != lastPos && lastPos >= 0 && fed) freezeSec++ else freezeSec = 0
            lastFrames = fr; lastQueued = q; lastPos = pos
            if (freezeSec >= 4) { freezeSec = 0; if (!recover("freeze", PlayStats.lastCodecError)) closeEvt("non risolto") }
        } else { freezeSec = 0; lastFrames = -1L; lastQueued = -1L; lastPos = -1L }
        // nero con l'audio: dopo 10 s dall'avvio il tempo avanza (si sente) ma non è mai arrivato un fotogramma → stessa scala dell'immagine ferma
        if (e is ExoEngine && !frameSeen && readyOnce && !isBuffering && now - startAt > 10_000L && e.playingVideo() && seekTarget < 0) {
            val pos = e.rawPosition()
            if (nvPos >= 0 && pos != nvPos) nvSec++ else nvSec = 0
            nvPos = pos
            if (nvSec >= 4) { nvSec = 0; nvPos = -1L; if (!recover("freeze", "NO_VIDEO")) closeEvt("non risolto") }
        } else { nvSec = 0; nvPos = -1L }
        // immagine «a scatti» con l'audio che va (il controllo sopra vede solo lo zero assoluto): per 6 s di fila meno del 35% dei
        // fotogrammi del canale, oppure più fotogrammi buttati che mostrati → stessa scala, senza la decodifica software
        if (e is ExoEngine && frameSeen && now - startAt > 10_000L && e.playingVideo() && !isBuffering && seekTarget < 0) {
            val fr = e.renderedFrames(); val dr = e.droppedFrames(); val t = SystemClock.elapsedRealtime()
            if (fr >= 0 && slN >= 0 && fr >= slN && dr >= slD && t - slT >= 500L) {
                val secs = (t - slT) / 1000f
                val shown = (fr - slN) / secs; val lost = (dr - slD) / secs; val want = e.frameRate()
                val slow = shown > 0f && ((want >= 10f && shown < want * 0.35f) || (lost >= 5f && lost > shown))
                if (slow) slowSec++ else slowSec = 0
            }
            if (fr >= 0) { slN = fr; slD = dr; slT = t }
            if (slowSec >= 6) { slowSec = 0; slN = -1L; if (!recover("freeze", "SLOW_VIDEO")) closeEvt("non risolto") }
        } else { slowSec = 0; slN = -1L }
        // blocco vero: caricamento di almeno 1 s durante la visione (non all'avvio né dopo un salto)
        if (isBuffering && !stallCounted && readyOnce && bufferingSince > 0 && now - bufferingSince >= 1000L && bufferingSince - startAt >= 4000L && seekTarget < 0) {
            stallCounted = true
            PlayStats.buffers++
            PlayStats.stall()
            NetMem.stall(this, item.id) // solo il lettore principale alimenta la memoria della linea (per canale)
            stallTimes.addLast(now)
            // tornati alla qualità piena da poco e di nuovo blocchi: si resta su quella ridotta
            if (upAt > 0 && now - upAt < 120_000L) stayDown = true
            // 1º-2º blocco in 90 s: nessun riavvio, al ritorno in READY si aspetta un cuscinetto più grande; dal 3º si interviene
            cushionN = stallTimes.size
            if (stallTimes.size >= 3 && !recover("stall")) closeEvt("non risolto")
        }
        // caricamento che non finisce
        val longMs = if (isLive) 12_000L else 20_000L
        if (readyOnce && isBuffering && bufferingSince > 0 && now - bufferingSince > longMs && now - startAt > longMs) { bufferingSince = now; if (!recover("long")) closeEvt("non risolto") }
        // tutto regolare da un po': il problema è risolto
        val fine = readyOnce && !isBuffering && freezeSec == 0
        if (fine) { if (okSince == 0L) okSince = now } else okSince = 0L
        if (fine && pendingEvt != null && now - okSince > 25_000L) closeEvt("risolto")
        // autopilota: un minuto di visione regolare (mezzo minuto senza problemi) = riuscita di questo motore per questo formato
        if (fine && !engOkDone && pendingEvt == null && okSince > 0 && now - okSince > 30_000L && now - startAt > 60_000L) {
            engOkDone = true
            try { EngineMemo.ok(this, engineName, EngineMemo.key(currentUrl, item.title, PlayStats.codec)) } catch (_: Throwable) {}
        }
        if (fine && recDone.isNotEmpty() && now - lastActionAt > 120_000L && now - okSince > 60_000L && varIdx < 0) recDone.clear()
        // qualità ridotta: dopo 6 minuti senza blocchi si riprova quella piena (una volta; se torna a bloccarsi resta ridotta)
        if (fine && varIdx >= 0 && !stayDown && now - lastActionAt > 6 * 60_000L && stallTimes.isEmpty() && now - okSince > 6 * 60_000L) {
            varIdx = -1; upAt = now; lastActionAt = now
            PlayStats.reduced = ""; PlayStats.recovery = "qualità piena ripristinata"
            recDone.remove("lite")
            toast("Connessione migliorata: qualità piena")
            startUrl(item.url, curPos())
        }
    }

    private fun checkDrain(e: ExoEngine, now: Long) {
        val t = SystemClock.elapsedRealtime()
        val ahead = (e.bufferedPos() - e.position()).coerceAtLeast(0L)
        while (drainSamples.isNotEmpty() && t - drainSamples.first.first > 20_000L) drainSamples.removeFirst()
        drainSamples.addLast(t to ahead)
        val old = drainSamples.firstOrNull { t - it.first >= 10_000L }
        if (adapt && varIdx + 1 < item.lite.size && seekTarget < 0 && now >= recCooldownUntil &&
            ahead < e.rebufferMs().toLong() + 2_000L && old != null && old.second - ahead >= 3_000L) {
            drainCooldownUntil = now + 60_000L
            drainSamples.clear()
            if (!recover("drain", "buffer in calo")) drainCooldownUntil = 0L
        }
    }

    private var resumeMs = 0L
    private var numBuf = ""
    private var subScale = 1f
    private var showRes = true
    // «Riquadro qualità nel lettore» del pannello (rc qbox = noq): risoluzione e FPS senza la sigla 4K/FHD/HD/SD
    private var showResTag = true
    private var autoNext = false
    private var engineKey = ""
    private lateinit var resView: TextView
    private lateinit var tRec: TextView
    private var bRec: TextView? = null
    private var dialog: AlertDialog? = null
    /** canale in onda (per «canale precedente») e quello visto prima */
    private var playingIndex = -1
    private var prevIndex = -1

    private val item: Item get() = items[index]
    private val hmFmt by lazy { java.text.SimpleDateFormat("HH:mm", Locale.ITALIAN) }
    /** numeri dei canali come testo (per la digitazione diretta), calcolati una volta */
    private val numStrs by lazy { items.map { if (it.num > 0) it.num.toString() else "" } }
    private val isLive: Boolean get() = kind == "live"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val handed = Handoff.engine
        Handoff.engine = null
        val payload = pending; val pre = pendingJson
        pending = null; pendingJson = null
        // chiusura immediata: nessun tasto o evento deve toccare l'interfaccia mai costruita
        if (payload == null && pre == null) { closing = true; handed?.release(); finish(); return }
        try {
            val j = pre ?: JSONObject(payload!!)
            kind = j.optString("kind", "live")
            index = j.optInt("index", 0)
            engineName = j.optString("engine", "exo")
            engLock = j.optBoolean("engLock", false)
            engAuto = j.optBoolean("engAuto", false)
            engAllow = j.optJSONArray("engAllow")?.let { a ->
                val allowed = mutableSetOf<String>()
                for (i in 0 until a.length()) {
                    val value = a.optString(i)
                    if (value == "auto" || value == "exo" || value == "vlc") allowed.add(value)
                }
                allowed.takeIf { it.isNotEmpty() }
            }
            aspect = j.optString("aspect", "fit")
            brand = j.optString("brand", "KAIROS")
            prefs = PlayPrefs(j.optString("quality", "auto"), j.optString("buffer", "balanced"), aspect, live = kind == "live", hw = j.optString("hw", "auto"))
            j.optJSONObject("srv")?.let { s ->
                val alts = s.optJSONArray("alts")
                val altHosts = if (alts == null) emptyList() else (0 until alts.length()).map { alts.optString(it) }.filter { it.isNotBlank() }
                val id = s.optString("id")
                val main = s.optString("main")
                val mode = s.optString("mode", "auto").lowercase(Locale.ROOT).takeIf { it in listOf("auto", "main", "alt") } ?: "auto"
                if (id.isNotBlank() && main.isNotBlank() && altHosts.isNotEmpty()) {
                    s.optJSONArray("bad")?.let { bad ->
                        for (i in 0 until bad.length()) Portals.markBad(this, bad.optString(i), Portals.BAD_MS)
                    }
                    portal = PortalServer(id, main, altHosts, mode)
                }
            }
            subScale = when (j.optString("sub", "medium")) { "small" -> 0.8f; "large" -> 1.3f; "xl" -> 1.6f; else -> 1f }
            showRes = j.optBoolean("res", true)
            showResTag = j.optBoolean("resTag", true)
            autoNext = j.optBoolean("autoNext", false)
            adapt = j.optBoolean("adapt", true)
            drainEnabled = j.optBoolean("drain", true)
            // indizi dall'interfaccia web (politica §1): classe della linea per questo avvio e banda (seme se qui manca una misura)
            uiLine = j.optString("line", "").let { if (it == "weak" || it == "normal" || it == "good") it else "" }
            j.optDouble("bw", 0.0).let { if (it > 0.0) NetMem.seed(this, it) }
            introKey = j.optString("introKey", "")
            introAuto = j.optBoolean("introAuto", false)
            j.optJSONArray("intro")?.let { a -> if (a.length() == 2 && a.optLong(1) > a.optLong(0)) intro = longArrayOf(a.optLong(0) * 1000, a.optLong(1) * 1000) }
            engineKey = j.optString("engineKey", "")
            engLearn = j.optBoolean("engLearn", false)
            engDef = j.optString("engDef", engineName)
            baseEngine = engineName
            resumeMs = j.optLong("start", 0L)
            val arr = j.getJSONArray("items")
            items = (0 until arr.length()).map {
                val o = arr.getJSONObject(it)
                Item(o.optString("id"), o.optString("t"), o.optString("u"), o.optString("a"), o.optInt("n"), o.optString("g"), o.optJSONArray("e"), o.optString("l"), liteOf(o.optJSONArray("v")))
            }
        } catch (e: Exception) { closing = true; handed?.release(); finish(); return }
        if (items.isEmpty()) { closing = true; handed?.release(); finish(); return }
        index = index.coerceIn(0, items.size - 1)
        playingIndex = index
        // contatori di sessione per il pannello
        PlayStats.stallMs = 0L; PlayStats.ttff = 0; PlayStats.fill = 0.0; PlayStats.nowId = item.id; PlayStats.variant = ""; PlayStats.fmt = ""
        lastGoodPos = if (isLive) 0L else resumeMs

        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        @Suppress("DEPRECATION") overridePendingTransition(0, 0)
        buildUi()
        hideSystemUi()
        // stesso video dell'anteprima: nessun nuovo caricamento, continua senza interruzioni
        val h = handed
        if (h != null && isLive && engineName != "vlc" && Handoff.id == item.id) {
            h.l = GenL(++engineGen)
            engine = h
            adopted = h
            if (prefs.quality != "auto") h.selectQuality(prefs.quality) // rispetta la qualità scelta nelle impostazioni
            h.feed = true; h.chanKey = item.id // da schermo intero le misure di banda valgono (nell'anteprima no)
            engineName = h.name
            currentUrl = h.playingUrl.ifEmpty { item.url }
            PlayStats.fmt = h.format(); PlayStats.variant = "full"
            statsStart()
            markPlaying()
            resetRecovery(); readyOnce = h.isActive()
            ui.postDelayed(watchRunnable, 1000)
            // Questa finestra è trasparente: sotto resta l'anteprima ingrandita a tutto schermo con il video.
            // La nuova vista parte minuscola (la sua superficie, finché è vuota, sarebbe nera: tendina del player
            // e sfondo nero delle SurfaceView da Android 10) e si allarga solo quando ha disegnato il primo
            // fotogramma; allora l'anteprima sotto viene tolta. Niente sparizione/ricomparsa del video.
            root.setBackgroundColor(Color.TRANSPARENT)
            handoffPending = true
            val v = h.moveTo(this, false, if (SurfaceFix.needed(this)) 3500L else 1500L) { completeHandoff(false) }
            h.setAspect(aspect)
            h.setSubtitleScale(subScale)
            root.addView(v, 0, FrameLayout.LayoutParams(4, 4, Gravity.TOP or Gravity.START))
        } else {
            if (h != null) {
                h.release()
                // l'anteprima ingrandita resta sotto questa finestra (nera): la si toglie quando questa è sullo schermo
                ui.postDelayed({ Handoff.host?.fullShown() }, 400)
            }
            startEngine(engineName)
            playCurrent(resumeMs)
            setOpaque(true)
        }
        showOsd(false)
        current = this

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                when {
                    closing -> {}
                    listOpen -> closeList()
                    osd.visibility == View.VISIBLE && bar.hasFocus() -> hideOsd()
                    else -> finishWithResult()
                }
            }
        })
    }

    /* ------------------------------------------------------------------ */
    /* Passaggio dall'anteprima                                            */
    /* ------------------------------------------------------------------ */
    private var handoffPending = false
    private var dropPending: Runnable? = null

    /** il video è visibile qui (o è scaduta l'attesa): vista a tutto schermo, poi via l'anteprima che sta sotto.
     *  [now] = subito (chiusura, cambio motore, uscita dall'app), senza attendere il disegno del fotogramma. */
    /** finestra opaca durante la visione: la WebView sotto non viene più composta a ogni frame (meno lavoro per la GPU della Fire TV);
     *  traslucida solo per le animazioni di entrata e uscita (Android 8+; prima non c'è l'API) */
    private fun setOpaque(opaque: Boolean) { if (Build.VERSION.SDK_INT >= 26) try { setTranslucent(!opaque) } catch (_: Throwable) {} }
    private fun completeHandoff(now: Boolean) {
        if (handoffPending) {
            handoffPending = false
            val e = adopted
            val v = e?.view
            if (v != null && v.parent === root) v.layoutParams = FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT, Gravity.CENTER)
            root.setBackgroundColor(Color.BLACK)
            setOpaque(true)
            val r = Runnable { dropPending = null; e?.dropOldView(); Handoff.host?.fullShown() }
            dropPending = r
            // un attimo per far arrivare sullo schermo questa finestra a tutto schermo, poi l'anteprima (coperta) sparisce
            if (!now) { ui.postDelayed(r, 150); return }
        }
        if (now) dropPending?.let { ui.removeCallbacks(it); it.run() }
    }

    /* ------------------------------------------------------------------ */
    /* Interfaccia                                                         */
    /* ------------------------------------------------------------------ */
    private fun dp(v: Int): Int = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v.toFloat(), resources.displayMetrics).toInt()

    private fun text(sizeSp: Float, color: Int = Color.WHITE, bold: Boolean = false): TextView = TextView(this).apply {
        setTextSize(TypedValue.COMPLEX_UNIT_SP, sizeSp)
        setTextColor(color)
        if (bold) typeface = Typeface.DEFAULT_BOLD
        setShadowLayer(8f, 0f, 2f, Color.argb(160, 0, 0, 0))
    }

    private fun button(label: String, onClick: () -> Unit): TextView = TextView(this).apply {
        text = label
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
        typeface = Typeface.DEFAULT_BOLD
        setPadding(dp(18), dp(10), dp(18), dp(10))
        isFocusable = true
        isFocusableInTouchMode = false
        isClickable = true
        val normal = GradientDrawable().apply { cornerRadius = dp(8).toFloat(); setColor(Color.argb(70, 255, 255, 255)) }
        val focused = GradientDrawable().apply { cornerRadius = dp(8).toFloat(); setColor(Color.WHITE) }
        background = StateListDrawable().apply {
            addState(intArrayOf(android.R.attr.state_focused), focused)
            addState(intArrayOf(android.R.attr.state_pressed), focused)
            addState(intArrayOf(), normal)
        }
        setTextColor(ColorStateList(arrayOf(intArrayOf(android.R.attr.state_focused), intArrayOf(android.R.attr.state_pressed), intArrayOf()), intArrayOf(Color.BLACK, Color.BLACK, Color.WHITE)))
        setOnClickListener { onClick(); touchOsd() }
        layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { marginEnd = dp(10) }
    }

    private fun buildUi() {
        root = FrameLayout(this).apply { setBackgroundColor(Color.BLACK) }
        setContentView(root)
        root.setOnClickListener { if (listOpen) closeList() else if (osd.visibility == View.VISIBLE) hideOsd() else showOsd(true) }

        spinner = ProgressBar(this).apply {
            isIndeterminate = true
            indeterminateTintList = ColorStateList.valueOf(ACCENT)
            layoutParams = FrameLayout.LayoutParams(dp(64), dp(64), Gravity.CENTER)
            visibility = View.GONE
        }
        msgView = text(18f, Color.WHITE, true).apply {
            gravity = Gravity.CENTER
            setPadding(dp(24), dp(16), dp(24), dp(16))
            background = GradientDrawable().apply { cornerRadius = dp(12).toFloat(); setColor(Color.argb(200, 20, 20, 24)) }
            layoutParams = FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER)
            visibility = View.GONE
        }
        zapView = text(64f, Color.WHITE, true).apply {
            layoutParams = FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP or Gravity.END).apply { setMargins(0, dp(64), dp(40), 0) }
            visibility = View.GONE
        }
        // niente "overlapping rendering": l'alpha del velo non crea un layer a schermo intero a ogni frame (pesante su Fire TV)
        veil = object : View(this) { override fun hasOverlappingRendering(): Boolean = false }.apply {
            setBackgroundColor(Color.BLACK)
            alpha = 0f
            layoutParams = FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        }
        resView = text(13f, Color.WHITE, true).apply {
            setPadding(dp(10), dp(4), dp(10), dp(4))
            background = GradientDrawable().apply { cornerRadius = dp(6).toFloat(); setColor(Color.argb(150, 0, 0, 0)); setStroke(dp(1), Color.argb(90, 255, 255, 255)) }
            layoutParams = FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP or Gravity.END).apply { setMargins(0, dp(28), dp(40), 0) }
            visibility = View.GONE
        }
        brandView = text(26f, ACCENT, true).apply {
            text = brand.uppercase(Locale.ROOT)
            letterSpacing = 0.18f
            layoutParams = FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP or Gravity.START).apply { setMargins(dp(40), dp(26), 0, 0) }
        }

        // pannello in basso
        osd = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(40), dp(80), dp(40), dp(28))
            background = GradientDrawable(GradientDrawable.Orientation.BOTTOM_TOP, intArrayOf(Color.argb(235, 0, 0, 0), Color.argb(150, 0, 0, 0), Color.TRANSPARENT))
            layoutParams = FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM)
        }
        tBadge = text(12f, Color.WHITE, true).apply {
            letterSpacing = 0.2f
            setPadding(dp(8), dp(3), dp(8), dp(3))
            background = GradientDrawable().apply { cornerRadius = dp(4).toFloat(); setColor(ACCENT) }
        }
        // registrazione in corso del canale in onda
        tRec = text(12f, Color.WHITE, true).apply {
            text = "● REC"
            letterSpacing = 0.2f
            setPadding(dp(8), dp(3), dp(8), dp(3))
            background = GradientDrawable().apply { cornerRadius = dp(4).toFloat(); setColor(Color.argb(200, 0, 0, 0)); setStroke(dp(1), Color.parseColor("#FF3B3B")) }
            setTextColor(Color.parseColor("#FF3B3B"))
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { marginStart = dp(10) }
            visibility = View.GONE
        }
        val badgeRow = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; addView(tBadge); addView(tRec) }
        tTitle = text(30f, Color.WHITE, true).apply { maxLines = 1; setPadding(0, dp(8), 0, 0) }
        tSub = text(16f, Color.argb(200, 255, 255, 255))
        tEpg = text(17f, Color.WHITE).apply { setPadding(0, dp(8), 0, 0); maxLines = 3 }
        progress = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            max = 1000
            progressTintList = ColorStateList.valueOf(ACCENT)
            progressBackgroundTintList = ColorStateList.valueOf(Color.argb(90, 255, 255, 255))
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(6)).apply { topMargin = dp(16) }
        }
        tTime = text(13f, Color.argb(190, 255, 255, 255)).apply { setPadding(0, dp(6), 0, dp(14)) }

        bar = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        bPause = button("Pausa") { commitSeek(); cancelCushion(); engine?.togglePause(); ui.postDelayed({ updatePauseLabel() }, 150) }
        if (!isLive) bar.addView(bPause)
        if (isLive) {
            bar.addView(button("Lista canali") { openList() })
            bRec = button("Registra") { toggleRecording() }.also { bar.addView(it) }
        }
        bar.addView(button("Audio") { menuAudio() })
        bar.addView(button("Qualità") { menuQuality() })
        bar.addView(button("Sottotitoli") { menuSubtitles() })
        bar.addView(button("Formato") { menuAspect() })
        bEngine = button("") { menuEngine() }
        bar.addView(bEngine)
        if (!isLive) {
            bar.addView(button("−10 s") { seekAdd(-10_000) })
            bar.addView(button("+30 s") { seekAdd(30_000) })
            if (introKey.isNotEmpty()) bar.addView(button("Intro") { menuIntro() })
        }
        val scroller = HorizontalScrollView(this).apply { isHorizontalScrollBarEnabled = false; addView(bar) }

        osd.addView(badgeRow)
        osd.addView(tTitle)
        osd.addView(tSub)
        osd.addView(tEpg)
        osd.addView(progress)
        osd.addView(tTime)
        osd.addView(scroller)

        root.addView(veil)
        root.addView(osd)
        root.addView(brandView)
        root.addView(resView)
        root.addView(zapView)
        root.addView(spinner)
        root.addView(msgView)
        skipView = button("Salta intro  ›") { skipIntro() }.apply {
            visibility = View.GONE
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 17f)
            layoutParams = FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM or Gravity.END).apply { setMargins(0, 0, dp(48), dp(64)) }
        }
        root.addView(skipView)
    }

    @Suppress("DEPRECATION")
    private fun hideSystemUi() {
        window.decorView.systemUiVisibility = (View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or View.SYSTEM_UI_FLAG_FULLSCREEN
            or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN)
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemUi()
    }

    private val hideRunnable = Runnable { hideOsd() }
    // dati della visione per il pannello ("Online ora"): letti ogni 5 secondi sul thread principale
    private val statsRunnable = object : Runnable {
        override fun run() {
            val e = engine
            if (e != null) {
                PlayStats.engine = e.name
                if (e is ExoEngine) { e.fillStats(); PlayStats.fmt = e.format() } else { PlayStats.width = 0; PlayStats.height = e.videoHeight() }
            }
            // classi e banda per il pannello (§9)
            try { PlayStats.bw = NetMem.bwMbps(this@PlayerActivity); PlayStats.line = NetMem.lineClass(this@PlayerActivity); PlayStats.dev = DeviceClass.of(this@PlayerActivity); PlayStats.cls = (e as? ExoEngine)?.cls ?: curClass() } catch (_: Throwable) {}
            ui.postDelayed(this, 5000)
        }
    }
    private fun statsStart() { PlayStats.start(engineName); ui.removeCallbacks(statsRunnable); ui.postDelayed(statsRunnable, 1500) }
    private val tickRunnable = object : Runnable {
        override fun run() { updateTime(); updateRes(); updateRec(); ui.postDelayed(this, 1000) }
    }

    private fun showOsd(focusBar: Boolean) {
        if (closing) return
        if (listOpen) closeList()
        updateInfo()
        ui.postDelayed({ updateRes() }, 30)
        // annulla una chiusura in corso (altrimenti al termine lo nasconderebbe)
        osd.animate().cancel(); brandView.animate().cancel()
        if (osd.visibility == View.VISIBLE && osd.alpha < 1f) { osd.alpha = 1f; osd.translationY = 0f; brandView.alpha = 1f }
        if (osd.visibility != View.VISIBLE) {
            osd.visibility = View.VISIBLE
            osd.alpha = 0f; osd.translationY = dp(40).toFloat()
            osd.animate().alpha(1f).translationY(0f).setDuration(220).setInterpolator(android.view.animation.DecelerateInterpolator()).start()
            brandView.alpha = 0f
            brandView.animate().alpha(1f).setDuration(220).start()
        }
        brandView.visibility = View.VISIBLE
        if (focusBar && bar.childCount > 0 && !bar.hasFocus()) bar.getChildAt(0).requestFocus()
        ui.removeCallbacks(tickRunnable); ui.post(tickRunnable)
        touchOsd()
    }

    private fun touchOsd() {
        ui.removeCallbacks(hideRunnable)
        ui.postDelayed(hideRunnable, if (bar.hasFocus()) 8000L else 4500L)
    }

    private fun hideOsd() {
        ui.removeCallbacks(tickRunnable)
        root.requestFocus()
        if (osd.visibility != View.VISIBLE) return
        osd.animate().alpha(0f).translationY(dp(30).toFloat()).setDuration(180).withEndAction { osd.visibility = View.GONE; osd.alpha = 1f; osd.translationY = 0f }.start()
        brandView.animate().alpha(0f).setDuration(180).withEndAction { brandView.visibility = View.GONE; brandView.alpha = 1f }.start()
        // durante i secondi del riquadro all'apertura o al cambio di risoluzione resta visibile (testo corto al prossimo giro)
        if (System.currentTimeMillis() >= resFlashUntil) resView.visibility = View.GONE
    }

    private fun engineLabel(n: String) = if (n == "vlc") "VLC" else "ExoPlayer"

    /* riquadro in alto a destra con risoluzione e FPS (permesso «Vedere risoluzione e FPS» del pannello → showRes):
       sui canali in diretta si vede ~6 s all'apertura e ~4 s a ogni cambio di risoluzione (qualità adattiva);
       con la barra informazioni aperta resta visibile (anche per film e serie) con bitrate e codec */
    private var resFlashUntil = 0L
    private var resLastH = 0
    private var fpsN = -1L
    private var fpsT = 0L
    private var fpsMeas = 0f
    private val resRunnable = object : Runnable {
        override fun run() {
            if (closing || stopped) return
            measureFps()
            val h = engine?.videoHeight() ?: 0
            if (h > 0 && resLastH > 0 && h != resLastH && isLive) flashRes(4000)
            if (h > 0) resLastH = h
            updateRes()
            ui.postDelayed(this, 1000)
        }
    }
    private fun flashRes(ms: Long) {
        if (!showRes) return
        resFlashUntil = maxOf(resFlashUntil, System.currentTimeMillis() + ms)
        updateRes()
    }
    /** canale nuovo: misura da capo e riquadro per qualche secondo */
    private fun resOnFirstFrame() {
        ui.removeCallbacks(resRunnable)
        resLastH = 0; fpsN = -1L; fpsMeas = 0f; resFlashUntil = 0L
        if (!showRes || !isLive) return
        flashRes(6000)
        ui.postDelayed(resRunnable, 1000)
    }
    /** fotogrammi al secondo misurati dal decoder (molti canali TS non li dichiarano nel formato) */
    private fun measureFps() {
        val e = engine as? ExoEngine ?: run { fpsN = -1L; return }
        val n = e.renderedFrames(); val t = SystemClock.elapsedRealtime()
        if (n < 0) { fpsN = -1L; return }
        if (fpsN >= 0 && n >= fpsN && t > fpsT) {
            val f = (n - fpsN) * 1000f / (t - fpsT)
            if (f in 5f..130f) fpsMeas = if (fpsMeas <= 0f) f else fpsMeas * 0.6f + f * 0.4f
        }
        fpsN = n; fpsT = t
    }
    private fun fpsLabel(e: Engine?): String {
        val d = when (e) { is ExoEngine -> e.frameRate(); is VlcEngine -> e.frameRate(); else -> 0f }
        val v = if (d > 0f) d else fpsMeas
        if (v <= 0f) return ""
        val std = floatArrayOf(24f, 25f, 30f, 48f, 50f, 60f, 100f, 120f)
        val near = std.minByOrNull { kotlin.math.abs(it - v) } ?: v
        return (if (kotlin.math.abs(near - v) < 1.5f) near.toInt() else Math.round(v)).toString() + " fps"
    }
    private fun updateRes() {
        if (!showRes) { resView.visibility = View.GONE; return }
        val osdOn = osd.visibility == View.VISIBLE
        if (!osdOn && System.currentTimeMillis() >= resFlashUntil) { resView.visibility = View.GONE; return }
        val e = engine
        val h = e?.videoHeight() ?: 0
        val tag = if (!showResTag) "" else when { h >= 2000 -> "4K"; h >= 1000 -> "FHD"; h >= 700 -> "HD"; h > 0 -> "SD"; else -> "" }
        val fps = fpsLabel(e)
        val text = if (osdOn && e is ExoEngine && e.videoInfo().isNotBlank()) {
            val parts = e.videoInfo().split(" · ").toMutableList()
            if (fps.isNotEmpty() && parts.none { it.endsWith("fps") }) parts.add(minOf(1, parts.size), fps)
            (if (tag.isNotEmpty()) "$tag  ·  " else "") + parts.joinToString(" · ")
        } else listOf(tag, if (h > 0) "${h}p" else "", fps).filter { it.isNotEmpty() }.joinToString("  ·  ")
        if (text.isBlank()) { resView.visibility = View.GONE; return }
        resView.text = text
        resView.visibility = View.VISIBLE
    }

    private fun updateInfo() {
        tBadge.text = if (isLive) "● IN DIRETTA" else "FILM · SERIE"
        tTitle.text = if (isLive && item.num > 0) "${item.num}  ${item.title}" else item.title
        tSub.text = listOf(item.group, engineLabel(engineName)).filter { it.isNotBlank() }.joinToString("  ·  ")
        val e = item.epg
        if (isLive && e != null && e.length() >= 3 && e.optString(0).isNotBlank()) {
            val f = hmFmt
            val s0 = e.optLong(1) * 1000; val e0 = e.optLong(2) * 1000
            val now = System.currentTimeMillis()
            var t = "Ora  ${f.format(java.util.Date(s0))}–${f.format(java.util.Date(e0))}   ${e.optString(0)}"
            if (e.length() >= 5 && e.optString(3).isNotBlank()) t += "\nDopo  ${f.format(java.util.Date(e.optLong(4) * 1000))}   ${e.optString(3)}"
            tEpg.text = t; tEpg.visibility = View.VISIBLE
            if (e0 > s0) { progress.visibility = View.VISIBLE; progress.progress = (((now - s0) * 1000) / (e0 - s0)).toInt().coerceIn(0, 1000) }
            else progress.visibility = View.GONE
        } else tEpg.visibility = View.GONE
        bEngine.text = "Motore: ${engineLabel(engineName)}"
        updateRec()
        if (!isLive) progress.visibility = View.VISIBLE else if (tEpg.visibility != View.VISIBLE) progress.visibility = View.GONE
        updatePauseLabel()
        updateTime()
    }

    private fun updatePauseLabel() { bPause.text = if (engine?.isPlaying() == false) "Riproduci" else "Pausa" }

    private fun fmt(ms: Long): String {
        val s = ms / 1000
        return if (s >= 3600) String.format(Locale.ROOT, "%d:%02d:%02d", s / 3600, (s / 60) % 60, s % 60) else String.format(Locale.ROOT, "%02d:%02d", s / 60, s % 60)
    }

    private fun updateTime() {
        val e = engine ?: return
        if (isLive) {
            tTime.text = "▲▼ cambia canale   ·   OK menu   ·   OK a schermo pulito: lista canali   ·   Indietro per uscire"
        } else {
            val d = e.duration()
            val cur = e.position()
            val pending = seekTarget >= 0
            var p = if (pending) seekTarget else cur
            // subito dopo il salto alcuni motori riportano ancora la posizione vecchia: si mostra quella scelta
            if (!pending && seekHold >= 0) { if (SystemClock.uptimeMillis() < seekHoldUntil && kotlin.math.abs(cur - seekHold) > 3000) p = seekHold else seekHold = -1L }
            progress.progress = if (d > 0) ((p * 1000) / d).toInt().coerceIn(0, 1000) else 0
            val jump = if (pending) "   (${if (seekTarget >= cur) "▶▶ +" else "◀◀ −"}${fmt(kotlin.math.abs(seekTarget - cur))})" else ""
            tTime.text = "${fmt(p)} / ${if (d > 0) fmt(d) else "--:--"}$jump   ·   ◀ ▶ cerca (tieni premuto: più veloce)   ·   OK menu"
        }
    }

    private fun toast(msg: String) { Toast.makeText(this, msg, Toast.LENGTH_SHORT).show() }

    private fun showMsg(msg: String?) {
        if (msg == null) { msgView.visibility = View.GONE; return }
        msgView.text = msg; msgView.visibility = View.VISIBLE
    }

    /* ------------------------------------------------------------------ */
    /* Riproduzione                                                        */
    /* ------------------------------------------------------------------ */
    private fun userAgent(): String = KxUa.get(this)

    private fun startEngine(name: String) {
        completeHandoff(true) // il video dell'anteprima viene sostituito: l'anteprima sotto va tolta subito
        ui.removeCallbacks(seekCommit); seekTarget = -1L; seekHold = -1L
        engine?.let { root.removeView(it.view); it.release() }
        engine = null
        cancelRetry()
        val gl = GenL(++engineGen)
        // classe effettiva calcolata adesso: buffer, ABR e offset della diretta del nuovo lettore seguono la tabella della politica
        val p = prefs.copy(aspect = aspect, hw = if (hwOff) "off" else prefs.hw, cls = curClass())
        fun make(n: String): Engine = if (n == "vlc") VlcEngine(this, gl, "", p) else ExoEngine(this, gl, userAgent(), p)
        val e: Engine? = try { make(name) } catch (t: Throwable) {
            // se un motore non si avvia su questo dispositivo, usa l'altro
            try { make(if (name == "vlc") "exo" else "vlc") } catch (t2: Throwable) { null }
        }
        if (e == null) { spinner.visibility = View.GONE; showMsg("Impossibile avviare il player su questo dispositivo"); return }
        engineName = e.name
        engine = e
        (e as? ExoEngine)?.setSubtitleScale(subScale)
        root.addView(e.view, 0, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT, Gravity.CENTER))
        statsStart()
    }

    /** segna il canale [index] come quello in onda (il precedente diventa «canale precedente») */
    private fun markPlaying() {
        if (playingIndex != index) {
            if (playingIndex in items.indices) prevIndex = playingIndex
            playingIndex = index
        }
        listChanged()
    }

    /** il numero di righe della lista dipende da canale scelto/precedente (riga «↩»): l'adattatore va avvisato
     *  a ogni cambio, altrimenti ListView lancia IllegalStateException al primo ridisegno (es. mentre si chiude) */
    private fun listChanged() { if (::listPanel.isInitialized) listAdapter.notifyDataSetChanged() }

    private fun playCurrent(startMs: Long) {
        val fromId = if (isLive && playingIndex in items.indices && playingIndex != index) items[playingIndex].id else ""
        markPlaying()
        triedAlt = false; triedFallback = false; retries = 0; endRetries = 0; endTimes.clear()
        lastGoodPos = if (isLive) 0L else startMs
        resetRecovery()
        // il recupero aveva cambiato lettore o decodifica per il contenuto precedente: il nuovo riparte con quelli scelti
        if (recEngineChanged && !userChangedEngine && baseEngine.isNotEmpty()) { recEngineChanged = false; hwOff = false; startEngine(baseEngine) }
        // autopilota: motore imparato per il formato di questo canale (solo con «Automatico» e se il cliente non l'ha cambiato qui)
        if (engLearn && !userChangedEngine && !closing) autoEngine()
        if (fromId.isNotEmpty()) try { ZapMemo.learn(this, fromId, item.id) } catch (_: Throwable) {}
        ui.removeCallbacks(warmRun); if (isLive) ui.postDelayed(warmRun, 1500)
        ui.removeCallbacks(watchRunnable); ui.postDelayed(watchRunnable, 1000)
        // l'interfaccia web (e quindi il pannello) vede il canale in onda anche dopo lo zapping dentro il lettore
        PlayStats.nowId = item.id
        UiBridge.call("window.kxNowPlaying && kxNowPlaying(${JSONObject.quote(item.id)})")
        // versione di partenza per classe effettiva / linea debole di recente: si parte già leggeri (nessun blocco iniziale)
        val sv = startVarIdx()
        if (sv >= 0 && sv < item.lite.size) {
            varIdx = sv
            PlayStats.reduced = item.lite[sv].second.ifEmpty { "ridotta" }
            startUrl(item.lite[sv].first, startMs)
            return
        }
        startUrl(item.url, startMs)
    }

    private fun startUrl(url: String, startMs: Long) {
        // la classe effettiva si ricalcola a ogni avvio: se è cambiata, il lettore (buffer immutabili) si ricrea prima di partire
        val e0 = engine
        if (e0 is ExoEngine && e0.cls != curClass()) startEngine(engineName)
        val playUrl = portal?.let { Portals.re(this, it, url) } ?: url
        currentUrl = playUrl
        playTok++
        startAt = System.currentTimeMillis() // i primi secondi di caricamento non sono «blocchi»
        frameSeen = false; isBuffering = false; bufferingSince = 0L; stallCounted = false
        cancelCushion(); cushionN = 0
        fillT0 = 0L; fillP0 = -1L; fillLowSec = 0
        drainSamples.clear()
        PlayStats.lastCodecError = ""; PlayStats.ttff = 0; PlayStats.fmt = fmtOf(playUrl)
        PlayStats.variant = if (varIdx >= 0) (item.lite.getOrNull(varIdx)?.second ?: "").ifEmpty { "ridotta" } else "full"
        showMsg(null)
        spinner.visibility = View.VISIBLE
        (engine as? ExoEngine)?.chanKey = item.id
        engine?.play(playUrl, startMs)
    }

    /** cambio canale: numero e nome cambiano subito, il video parte quando smetti di premere (più veloce) */
    private var zapPending = false
    private val zapPlay = Runnable { zapPending = false; playCurrent(0) }
    private fun zap(delta: Int) {
        if (items.size < 2) return
        zapDir = if (delta > 0) 1 else -1; zapDirAt = System.currentTimeMillis()
        index = (index + delta + items.size) % items.size
        listChanged()
        veil.animate().cancel()
        veil.animate().alpha(0.55f).setDuration(120).start()
        ui.removeCallbacks(zapPlay)
        zapPending = true
        ui.postDelayed(zapPlay, 150)
        showOsd(false)
        osd.translationY = (if (delta > 0) dp(18) else -dp(18)).toFloat()
        osd.animate().translationY(0f).setDuration(200).start()
        flashNumber(if (item.num > 0) item.num.toString() else "")
    }

    private fun flashNumber(t: String) {
        if (t.isEmpty()) return
        zapView.text = t; zapView.visibility = View.VISIBLE
        zapView.scaleX = 1.35f; zapView.scaleY = 1.35f; zapView.alpha = 0.4f
        zapView.animate().scaleX(1f).scaleY(1f).alpha(1f).setDuration(200).start()
        ui.removeCallbacks(hideZap); ui.postDelayed(hideZap, 1500)
    }
    private val hideZap = Runnable { zapView.visibility = View.GONE }

    private val numRunnable = Runnable {
        val n = numBuf.toIntOrNull(); numBuf = ""
        zapView.visibility = View.GONE
        val i = items.indexOfFirst { it.num == n }
        if (i >= 0 && i != index) jumpTo(i) else if (n != null && i < 0) toast("Canale $n non trovato")
    }

    /** salto diretto a un canale (numero, lista canali, canale precedente): parte subito, stessa strada dello zapping */
    private fun jumpTo(i: Int) {
        if (i !in items.indices || closing) return
        ui.removeCallbacks(zapPlay); zapPending = false
        index = i
        listChanged()
        veil.animate().cancel()
        veil.animate().alpha(0.55f).setDuration(120).start()
        playCurrent(0)
        showOsd(false)
        flashNumber(if (item.num > 0) item.num.toString() else "")
    }

    private fun hasPrev(): Boolean = prevIndex in items.indices && prevIndex != index

    /** tasto «canale precedente» (LAST): alterna tra gli ultimi due canali visti */
    private fun previousChannel() {
        if (!isLive) return
        // durante uno zapping non ancora partito, «precedente» è il canale ancora in onda
        val t = if (zapPending && playingIndex in items.indices && playingIndex != index) playingIndex else prevIndex
        if (t in items.indices && t != index) jumpTo(t) else toast("Nessun canale precedente")
    }

    private fun switchEngine(name: String, byUser: Boolean) {
        if (byUser && engLock) { toast("Motore scelto dal tuo fornitore"); return }
        if (byUser && engAllow?.contains(name) == false) { toast("Motore non disponibile per il tuo profilo"); return }
        val pos = if (isLive) 0L else if (seekTarget >= 0) seekTarget else engine?.position() ?: 0L
        if (byUser) userChangedEngine = true
        startEngine(name)
        if (engine != null) startUrl(currentUrl, pos)
        updateInfo()
    }

    /* EngineListener */
    // l'activity resta l'ascoltatore «di riserva» (motori creati altrove): eventi del caricamento attuale
    override fun onBuffering(buffering: Boolean) = evBuffering(engineGen, playTok, buffering)
    override fun onReady() = evReady(engineGen, playTok)
    override fun onFirstFrame() = evFirstFrame(engineGen, playTok)
    override fun onEnded() = evEnded(engineGen, playTok)
    override fun onError(message: String) = evError(engineGen, playTok, message)
    override fun onAudioDisabled() = evAudioOff(engineGen)

    private fun evBuffering(g: Int, t: Int, buffering: Boolean) {
        ui.post {
            if (!live(g, t)) return@post
            spinner.visibility = if (buffering || cushionRun != null) View.VISIBLE else View.GONE
            if (buffering == isBuffering) return@post
            isBuffering = buffering
            if (!buffering) {
                // durata del blocco appena finito (totale di sessione per il pannello)
                if (stallCounted && bufferingSince > 0) PlayStats.stallMs += System.currentTimeMillis() - bufferingSince
                bufferingSince = 0L; return@post
            }
            bufferingSince = System.currentTimeMillis(); stallCounted = false
        }
    }

    private fun evReady(g: Int, t: Int) {
        ui.post {
            if (!live(g, t)) return@post
            spinner.visibility = View.GONE; showMsg(null); retries = 0; readyOnce = true; isBuffering = false; bufferingSince = 0L
            veil.animate().alpha(0f).setDuration(260).start()
            val e = engine
            // primo READY dell'avvio: da qui il watchdog misura il fill-ratio dei primi 10 s
            if (fillT0 == 0L && e is ExoEngine) { fillT0 = System.currentTimeMillis(); fillP0 = e.bufferedPos() }
            // ritorno da un blocco: cuscinetto crescente invece di ripartire con la scorta minima
            if (cushionN > 0 && e is ExoEngine && !stopped && !zapPending) startCushion(e, cushionN)
            cushionN = 0
        }
    }
    private fun evFirstFrame(g: Int, t: Int) {
        ui.post {
            if (g != engineGen || closing) return@post
            if (!frameSeen && startAt > 0 && PlayStats.ttff == 0) PlayStats.ttff = (System.currentTimeMillis() - startAt).toInt().coerceAtLeast(1)
            frameSeen = true; veil.animate().alpha(0f).setDuration(260).start()
            resOnFirstFrame()
        }
    }
    /** decoder audio mancante: prova l'altro motore (e poi il formato alternativo); false = nessuna strada, resta il video senza audio */
    private fun evAudioFail(g: Int, t: Int, code: String): Boolean {
        if (!live(g, t) || android.os.Looper.myLooper() != android.os.Looper.getMainLooper()) return false
        val now = System.currentTimeMillis()
        if (now < recCooldownUntil) return false
        return recover("error", "AUDIO_$code")
    }
    private fun evAudioOff(g: Int) {
        ui.post {
            if (g != engineGen || closing) return@post
            newEvt("error", "traccia audio disattivata (decoder mancante)", "AUDIO_DECODER")
            PlayStats.recovery = "audio non supportato → disattivato"
            toast("Audio non supportato dal dispositivo: il video continua senza audio")
        }
    }

    /** film/serie: ENDED vale come fine solo con durata nota e posizione ≥ 90 %; altrimenti il server ha chiuso il flusso (si riprende, al più 2 volte) */
    private fun endedEarly(): Boolean {
        val e = engine ?: return false
        val d = e.duration(); val p = maxOf(lastGoodPos, e.position())
        return d > 0 && p > 0 && p < d * 9 / 10 && endRetries < 2
    }

    private fun evEnded(g: Int, t: Int) {
        ui.post {
            if (!live(g, t)) return@post
            val now = System.currentTimeMillis()
            if (isLive) {
                // la diretta non finisce: riavvio con attesa crescente 1-2-4 s, al più 5 volte in 5 minuti, poi gli altri rimedi
                while (endTimes.isNotEmpty() && now - endTimes.first > 5 * 60_000L) endTimes.removeFirst()
                if (endTimes.size < 5) {
                    endTimes.addLast(now)
                    val delay = 1000L shl minOf(endTimes.size - 1, 2)
                    val u = currentUrl; val idx = index
                    cancelRetry()
                    val r = Runnable { retryRun = null; if (!closing && !stopped && !zapPending && index == idx && currentUrl == u) startUrl(u, 0) }
                    retryRun = r; ui.postDelayed(r, delay)
                } else if (!recover("error", "ENDED")) { spinner.visibility = View.GONE; showMsg("Il canale si è interrotto\n(riprova tra poco)") }
            } else if (endedEarly()) {
                endRetries++
                PlayStats.recovery = "flusso interrotto dal server → ripreso"
                val u = currentUrl; val idx = index; val pos = lastGoodPos
                cancelRetry()
                val r = Runnable { retryRun = null; if (!closing && !stopped && !zapPending && index == idx && currentUrl == u) startUrl(u, pos) }
                retryRun = r; ui.postDelayed(r, 1500L)
            } else if (autoNext && index < items.size - 1) {
                index++
                toast("Episodio successivo: ${item.title}")
                veil.animate().alpha(0.7f).setDuration(150).start()
                playCurrent(0)
                showOsd(false)
            } else finishWithResult()
        }
    }

    private fun evError(g: Int, t: Int, message: String) {
        ui.post {
            if (!live(g, t)) return@post
            val now = System.currentTimeMillis()
            // errore subito dopo un recupero (dentro il suo cooldown): non si scarta, si rimanda alla fine del cooldown
            if (now < recCooldownUntil && now - lastActionAt <= 1500L) {
                if (deferredErr == null) {
                    val r = Runnable { deferredErr = null; if (live(g, t)) { recCooldownUntil = 0L; evError(g, t, message) } }
                    deferredErr = r
                    ui.postDelayed(r, (recCooldownUntil - now).coerceAtLeast(0L) + 50L)
                }
                return@post
            }
            recCooldownUntil = 0L
            if (!recover("error", message)) {
                if (pendingEvt != null) closeEvt("non risolto") else PlayStats.event(try { JSONObject().put("t", System.currentTimeMillis()).put("problem", "error").put("action", "nessuna soluzione").put("err", message.take(120)).put("title", item.title.take(120)).put("id", item.id.take(60)).put("k", kind).put("engine", engineName).put("codec", PlayStats.codec).put("outcome", "non risolto") } catch (_: Exception) { JSONObject() })
                spinner.visibility = View.GONE; showMsg("Impossibile riprodurre questo contenuto\n($message)")
            }
        }
    }

    /* ------------------------------------------------------------------ */
    /* Menu                                                                */
    /* ------------------------------------------------------------------ */
    private fun choose(title: String, list: List<Track>, empty: String, onPick: (Track) -> Unit) {
        if (list.isEmpty()) { toast(empty); return }
        if (closing || isFinishing) return
        val labels = list.map { it.label }.toTypedArray()
        val checked = list.indexOfFirst { it.selected }
        try { dialog?.dismiss() } catch (_: Exception) {}
        dialog = AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
            .setTitle(title)
            .setSingleChoiceItems(labels, checked) { d, which -> d.dismiss(); if (!closing && which in list.indices) { onPick(list[which]); touchOsd() } }
            .setNegativeButton("Chiudi", null)
            .show()
    }

    private fun menuAudio() {
        val list = engine?.audioTracks().orEmpty()
        if (list.size == 1) { toast("Questo contenuto ha una sola traccia audio: ${list[0].label}"); return }
        choose("Traccia audio", list, "Nessuna traccia audio disponibile (attendi l'avvio del video)") { engine?.selectAudio(it.id); toast("Audio: ${it.label}") }
    }

    private fun menuQuality() = choose("Qualità video", engine?.qualities().orEmpty(), "Qualità non disponibile") {
        engine?.selectQuality(it.id); toast("Qualità: ${it.label}")
    }

    private fun menuSubtitles() = choose("Sottotitoli", engine?.subtitles().orEmpty(), "Nessun sottotitolo disponibile") {
        engine?.selectSubtitle(it.id)
    }

    private fun menuAspect() {
        val opts = listOf(Track("fit", "Adatta allo schermo", aspect == "fit"), Track("fill", "Riempi (deforma)", aspect == "fill"), Track("zoom", "Zoom (taglia i bordi)", aspect == "zoom"))
        choose("Formato immagine", opts, "") { aspect = it.id; engine?.setAspect(it.id) }
    }

    private fun menuEngine() {
        if (engLock) { toast("Motore scelto dal tuo fornitore"); return }
        val opts = listOf(Track("exo", "ExoPlayer — più fluido (consigliato)", engineName == "exo"), Track("vlc", "VLC — legge più formati", engineName == "vlc"))
            .filter { engAllow == null || it.id in engAllow!! }
        if (opts.isEmpty()) { toast("Motore non disponibile per il tuo profilo"); return }
        choose("Motore di riproduzione", opts, "") { if (it.id != engineName) { switchEngine(it.id, true); toast("Motore: ${engineLabel(it.id)}") } }
    }

    /* ------------------------------------------------------------------ */
    /* Telecomando                                                         */
    /* ------------------------------------------------------------------ */
    override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
        if (closing) return true
        if (listOpen && listKey(keyCode, event)) return true
        if (::skipView.isInitialized && skipView.visibility == View.VISIBLE && osd.visibility != View.VISIBLE &&
            (keyCode == KeyEvent.KEYCODE_DPAD_CENTER || keyCode == KeyEvent.KEYCODE_ENTER || keyCode == KeyEvent.KEYCODE_NUMPAD_ENTER)) { skipIntro(); return true }
        val barFocused = osd.visibility == View.VISIBLE && bar.hasFocus()
        if (barFocused) {
            touchOsd()
            when (keyCode) {
                KeyEvent.KEYCODE_DPAD_UP -> { hideOsd(); return true }
                KeyEvent.KEYCODE_DPAD_DOWN -> return true
            }
            return super.onKeyDown(keyCode, event)
        }
        when (keyCode) {
            KeyEvent.KEYCODE_DPAD_UP, KeyEvent.KEYCODE_CHANNEL_UP, KeyEvent.KEYCODE_PAGE_UP -> if (isLive) zap(-1) else showOsd(false)
            KeyEvent.KEYCODE_DPAD_DOWN, KeyEvent.KEYCODE_CHANNEL_DOWN, KeyEvent.KEYCODE_PAGE_DOWN -> if (isLive) zap(1) else showOsd(true)
            // film: le pressioni si sommano e il salto avviene quando smetti di premere (un solo caricamento)
            KeyEvent.KEYCODE_DPAD_LEFT, KeyEvent.KEYCODE_MEDIA_REWIND -> if (isLive) showOsd(false) else seekStep(-1, event)
            KeyEvent.KEYCODE_DPAD_RIGHT, KeyEvent.KEYCODE_MEDIA_FAST_FORWARD -> if (isLive) showOsd(false) else seekStep(1, event)
            // diretta a schermo pulito: OK apre la lista canali (come nelle app TV); con le info visibili apre il menu
            KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER, KeyEvent.KEYCODE_NUMPAD_ENTER -> if (isLive && osd.visibility != View.VISIBLE) openList() else showOsd(true)
            KeyEvent.KEYCODE_MENU, KeyEvent.KEYCODE_INFO -> showOsd(true)
            KeyEvent.KEYCODE_GUIDE -> if (isLive) openList() else showOsd(true)
            KeyEvent.KEYCODE_LAST_CHANNEL -> previousChannel()
            KeyEvent.KEYCODE_PROG_RED, KeyEvent.KEYCODE_MEDIA_RECORD -> if (isLive) { toggleRecording(); showOsd(false) }
            KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE, KeyEvent.KEYCODE_MEDIA_PLAY, KeyEvent.KEYCODE_MEDIA_PAUSE, KeyEvent.KEYCODE_SPACE -> { commitSeek(); cancelCushion(); engine?.togglePause(); showOsd(false) }
            KeyEvent.KEYCODE_CAPTIONS -> menuSubtitles()
            KeyEvent.KEYCODE_MEDIA_AUDIO_TRACK -> menuAudio()
            in KeyEvent.KEYCODE_0..KeyEvent.KEYCODE_9 -> {
                if (!isLive) return true
                if (numBuf.length >= 5) numBuf = ""
                numBuf += (keyCode - KeyEvent.KEYCODE_0).toString()
                zapView.text = numBuf; zapView.visibility = View.VISIBLE
                ui.removeCallbacks(numRunnable)
                // se nessun canale ha un numero più lungo che inizia così, si parte quasi subito
                val b = numBuf
                val more = numStrs.any { s -> s.length > b.length && s.startsWith(b) }
                ui.postDelayed(numRunnable, if (more) 1500L else 400L)
            }
            else -> return super.onKeyDown(keyCode, event)
        }
        return true
    }

    /* ------------------------------------------------------------------ */
    /* Ricerca nei film: pressioni accumulate, un solo salto               */
    /* ------------------------------------------------------------------ */
    private var seekTarget = -1L
    private var seekDir = 0
    private var seekStreak = 0
    private var seekLastPress = 0L
    private var seekHold = -1L
    private var seekHoldUntil = 0L
    private val seekCommit = Runnable { commitSeek() }

    /** Sinistra/Destra (anche tenuti premuti): il passo cresce 10 s → 30 s → 1 min → 3 min */
    private fun seekStep(dir: Int, event: KeyEvent?) {
        val e = engine ?: return
        val now = SystemClock.uptimeMillis()
        val repeat = event != null && event.repeatCount > 0
        if (repeat && now - seekLastPress < 140) return // tasto tenuto: un passo ogni 140 ms circa
        if (dir != seekDir || now - seekLastPress > 1500) seekStreak = 0
        seekDir = dir
        seekLastPress = now
        seekStreak++
        val step = when {
            seekStreak <= 3 -> 10_000L
            seekStreak <= 6 -> 30_000L
            seekStreak <= 10 -> 60_000L
            else -> 180_000L
        }
        seekAdd(dir * step, e)
    }

    /** aggiunge [delta] alla posizione scelta (mostrata subito); il salto vero parte 450 ms dopo l'ultima pressione */
    private fun seekAdd(delta: Long, eng: Engine? = engine) {
        val e = eng ?: return
        if (closing) return
        val d = e.duration()
        val base = if (seekTarget >= 0) seekTarget else e.position()
        var t = maxOf(0L, base + delta)
        if (d > 0) t = minOf(t, maxOf(0L, d - 2000))
        seekTarget = t
        drainSamples.clear()
        ui.removeCallbacks(seekCommit)
        ui.postDelayed(seekCommit, 450)
        showOsd(false)
    }

    private fun commitSeek() {
        ui.removeCallbacks(seekCommit)
        val t = seekTarget
        seekTarget = -1L
        if (t < 0) return
        val e = engine ?: return
        drainSamples.clear()
        startAt = System.currentTimeMillis() // il caricamento dopo un salto non è un «blocco»
        e.seekTo(t)
        seekHold = t
        seekHoldUntil = SystemClock.uptimeMillis() + 1500
        if (::osd.isInitialized && osd.visibility == View.VISIBLE) updateTime()
    }

    /* ------------------------------------------------------------------ */
    /* Registrazione                                                       */
    /* ------------------------------------------------------------------ */
    private fun recIdOf(chId: String): String? = try { Recorder.activeFor(chId) } catch (_: Throwable) { null }

    private fun toggleRecording() {
        if (!isLive || closing) return
        val ch = item
        try {
            val active = recIdOf(ch.id)
            if (active != null) {
                Recorder.stop(this, active)
                toast("Registrazione fermata: ${ch.title}")
            } else {
                val id = Recorder.start(this, ch.id, ch.title, ch.url)
                toast(if (id.isNotEmpty()) "Registrazione avviata: ${ch.title}" else "Impossibile avviare la registrazione")
            }
        } catch (t: Throwable) {
            toast("Registrazione non disponibile")
        }
        updateRec()
    }

    private fun updateRec() {
        if (!::tRec.isInitialized) return
        val on = isLive && recIdOf(item.id) != null
        tRec.visibility = if (on) View.VISIBLE else View.GONE
        bRec?.text = if (on) "Ferma registrazione" else "Registra"
    }

    /* ------------------------------------------------------------------ */
    /* Lista canali (OK durante la diretta)                                */
    /* ------------------------------------------------------------------ */
    private var listOpen = false
    private var listSel = 0
    private lateinit var listPanel: LinearLayout
    private lateinit var listTitle: TextView
    private lateinit var listView: ListView
    private val listAdapter = ChannelAdapter()
    private val listHide = Runnable { closeList() }
    private val rowH: Int get() = dp(66)

    /** riga dell'elenco ↔ canale: con un canale precedente, la prima riga è «↩ Canale precedente» */
    private fun listOffset(): Int = if (hasPrev()) 1 else 0
    private fun idxOf(pos: Int): Int = if (hasPrev() && pos == 0) prevIndex else pos - listOffset()

    private fun buildList() {
        if (::listPanel.isInitialized) return
        val w = (resources.displayMetrics.widthPixels * 0.40f).toInt().coerceIn(dp(300), dp(560))
        listPanel = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(22), dp(12), dp(14))
            background = GradientDrawable(GradientDrawable.Orientation.LEFT_RIGHT, intArrayOf(Color.argb(246, 8, 8, 12), Color.argb(228, 10, 10, 14)))
            layoutParams = FrameLayout.LayoutParams(w, ViewGroup.LayoutParams.MATCH_PARENT, Gravity.START)
            visibility = View.GONE
            isClickable = true // i tocchi sul pannello non arrivano allo schermo sotto
        }
        listTitle = text(14f, Color.argb(220, 255, 255, 255), true).apply {
            letterSpacing = 0.14f
            maxLines = 1
            ellipsize = TextUtils.TruncateAt.END
            setPadding(dp(10), 0, dp(6), dp(12))
        }
        listView = ListView(this).apply {
            divider = null
            dividerHeight = 0
            isVerticalScrollBarEnabled = false
            setSelector(ColorDrawable(Color.TRANSPARENT))
            cacheColorHint = Color.TRANSPARENT
            isFocusable = false
            isFocusableInTouchMode = false
            itemsCanFocus = false
            overScrollMode = View.OVER_SCROLL_NEVER
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f)
            adapter = listAdapter
            setOnItemClickListener { _, _, pos, _ -> pickList(pos) }
            setOnScrollListener(object : AbsListView.OnScrollListener {
                override fun onScrollStateChanged(view: AbsListView?, scrollState: Int) { if (listOpen) touchList() }
                override fun onScroll(view: AbsListView?, firstVisibleItem: Int, visibleItemCount: Int, totalItemCount: Int) {}
            })
        }
        listPanel.addView(listTitle)
        listPanel.addView(listView)
        root.addView(listPanel, root.indexOfChild(spinner).coerceAtLeast(0))
    }

    private fun openList() {
        if (!isLive || items.isEmpty() || closing) return
        buildList()
        hideOsd()
        currentFocus?.clearFocus()
        listOpen = true
        listSel = index + listOffset()
        listTitle.text = (if (item.group.isNotBlank()) item.group.uppercase(Locale.ITALIAN) + "  ·  " else "") + "${items.size} CANALI"
        listAdapter.notifyDataSetChanged()
        listPanel.animate().cancel()
        listPanel.visibility = View.VISIBLE
        listPanel.alpha = 0f
        listPanel.translationX = -dp(36).toFloat()
        listPanel.animate().alpha(1f).translationX(0f).setStartDelay(0).setDuration(170).start()
        centerList()
        listView.post { if (listOpen) centerList() } // dopo la prima misura la posizione è esatta
        touchList()
    }

    private fun closeList() {
        ui.removeCallbacks(listHide)
        if (!listOpen) return
        listOpen = false
        listPanel.animate().cancel()
        listPanel.animate().alpha(0f).translationX(-dp(36).toFloat()).setStartDelay(0).setDuration(140)
            .withEndAction { if (!listOpen) { listPanel.visibility = View.GONE; listPanel.alpha = 1f; listPanel.translationX = 0f } }.start()
    }

    private fun touchList() { ui.removeCallbacks(listHide); ui.postDelayed(listHide, 8000) }

    /** la riga scelta resta al centro: scorrimento immediato anche con migliaia di canali */
    private fun centerList() {
        val h = listView.height.takeIf { it > 0 } ?: (root.height - dp(70)).coerceAtLeast(rowH)
        listView.setSelectionFromTop(listSel.coerceIn(0, maxOf(0, listAdapter.count - 1)), ((h - rowH) / 2).coerceAtLeast(0))
    }

    private fun moveSel(delta: Int) {
        val n = listAdapter.count
        if (n == 0) return
        listSel = ((listSel + delta) % n + n) % n
        listAdapter.notifyDataSetChanged()
        centerList()
        touchList()
    }

    private fun pickList(pos: Int) {
        val i = idxOf(pos)
        closeList()
        if (i !in items.indices) return
        if (i == index && !zapPending) { showOsd(false); return }
        jumpTo(i)
    }

    /** tasti con la lista aperta; false = il tasto prosegue normalmente */
    private fun listKey(keyCode: Int, event: KeyEvent): Boolean {
        when (keyCode) {
            KeyEvent.KEYCODE_DPAD_UP -> { logoHold(event.repeatCount > 0); moveSel(if (event.repeatCount > 15) -3 else -1) }
            KeyEvent.KEYCODE_DPAD_DOWN -> { logoHold(event.repeatCount > 0); moveSel(if (event.repeatCount > 15) 3 else 1) }
            KeyEvent.KEYCODE_PAGE_UP, KeyEvent.KEYCODE_CHANNEL_UP -> moveSel(-8)
            KeyEvent.KEYCODE_PAGE_DOWN, KeyEvent.KEYCODE_CHANNEL_DOWN -> moveSel(8)
            KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER, KeyEvent.KEYCODE_NUMPAD_ENTER -> { if (event.repeatCount == 0) pickList(listSel) }
            KeyEvent.KEYCODE_DPAD_LEFT -> closeList()
            KeyEvent.KEYCODE_DPAD_RIGHT -> touchList()
            KeyEvent.KEYCODE_MENU, KeyEvent.KEYCODE_INFO -> { closeList(); showOsd(true) }
            KeyEvent.KEYCODE_BACK -> return false // chiude la lista tramite il gestore di Indietro
            KeyEvent.KEYCODE_VOLUME_UP, KeyEvent.KEYCODE_VOLUME_DOWN, KeyEvent.KEYCODE_VOLUME_MUTE, KeyEvent.KEYCODE_MUTE -> return false
            else -> { closeList(); return false }
        }
        return true
    }

    /** programma in onda: titolo e avanzamento 0..1000 (-1 = sconosciuto) */
    private fun nowOf(it: Item): Pair<String, Int> {
        val e = it.epg ?: return "" to -1
        val now = System.currentTimeMillis() / 1000
        val t0 = e.optString(0)
        val s0 = e.optLong(1); val e0 = e.optLong(2)
        if (t0.isNotBlank() && (e0 <= 0 || now < e0)) {
            val f = if (e0 > s0 && s0 > 0) (((now - s0) * 1000) / (e0 - s0)).toInt().coerceIn(0, 1000) else -1
            return t0 to f
        }
        // il programma indicato è finito: ora va in onda il successivo
        val t1 = if (e.length() >= 4) e.optString(3) else ""
        return t1 to -1
    }

    private class Row(val root: LinearLayout, val num: TextView, val logo: ImageView, val letter: TextView, val name: TextView, val prog: TextView, val bar: ProgressBar, val selBg: GradientDrawable)

    private fun makeRow(): Row {
        val r = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(6), 0, dp(12), 0)
            layoutParams = AbsListView.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, rowH)
        }
        val num = TextView(this).apply {
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
            typeface = Typeface.DEFAULT_BOLD
            gravity = Gravity.END or Gravity.CENTER_VERTICAL
            maxLines = 1
            layoutParams = LinearLayout.LayoutParams(dp(48), ViewGroup.LayoutParams.WRAP_CONTENT).apply { marginEnd = dp(12) }
        }
        val box = FrameLayout(this).apply {
            background = GradientDrawable().apply { cornerRadius = dp(8).toFloat(); setColor(Color.argb(34, 255, 255, 255)) }
            layoutParams = LinearLayout.LayoutParams(dp(60), dp(44)).apply { marginEnd = dp(14) }
        }
        val letter = TextView(this).apply {
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 18f)
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.argb(210, 255, 255, 255))
            gravity = Gravity.CENTER
            layoutParams = FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        }
        val logo = ImageView(this).apply {
            scaleType = ImageView.ScaleType.FIT_CENTER
            setPadding(dp(5), dp(4), dp(5), dp(4))
            layoutParams = FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
            visibility = View.GONE
        }
        box.addView(letter)
        box.addView(logo)
        val col = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
        }
        val name = TextView(this).apply {
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
            typeface = Typeface.DEFAULT_BOLD
            maxLines = 1
            ellipsize = TextUtils.TruncateAt.END
        }
        val prog = TextView(this).apply {
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
            setTextColor(Color.argb(175, 255, 255, 255))
            maxLines = 1
            ellipsize = TextUtils.TruncateAt.END
        }
        val bar = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            max = 1000
            progressTintList = ColorStateList.valueOf(ACCENT)
            progressBackgroundTintList = ColorStateList.valueOf(Color.argb(60, 255, 255, 255))
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(3)).apply { topMargin = dp(5) }
        }
        col.addView(name)
        col.addView(prog)
        col.addView(bar)
        r.addView(num)
        r.addView(box)
        r.addView(col)
        val sel = GradientDrawable().apply { cornerRadius = dp(10).toFloat(); setColor(Color.argb(52, 255, 255, 255)); setStroke(dp(2), ACCENT) }
        return Row(r, num, logo, letter, name, prog, bar, sel).also { r.tag = it }
    }

    private fun bindRow(row: Row, pos: Int) {
        val prevRow = hasPrev() && pos == 0
        val i = idxOf(pos)
        val it = items.getOrNull(i) ?: return
        val playing = !prevRow && i == index
        row.num.text = if (prevRow) "↩" else if (it.num > 0) it.num.toString() else ""
        row.num.setTextColor(if (playing) ACCENT else Color.argb(170, 255, 255, 255))
        row.name.text = if (prevRow) "Canale precedente: ${it.title}" else it.title
        row.name.setTextColor(if (playing) ACCENT else Color.WHITE)
        val (title, frac) = nowOf(it)
        row.prog.text = title.ifBlank { it.group }
        row.prog.visibility = if (row.prog.text.isNullOrBlank()) View.GONE else View.VISIBLE
        if (frac >= 0) { row.bar.visibility = View.VISIBLE; row.bar.progress = frac } else row.bar.visibility = View.INVISIBLE
        row.root.background = if (pos == listSel) row.selBg else null
        // logo (scaricato in sottofondo e tenuto in memoria) oppure l'iniziale del nome
        val clean = it.title.substringAfter('|', it.title).trim()
        row.letter.text = (clean.firstOrNull { c -> c.isLetterOrDigit() } ?: '?').uppercaseChar().toString()
        val bmp = if (it.logo.isNotEmpty()) logos.get(it.logo) else null
        if (bmp != null) {
            row.logo.setImageBitmap(bmp); row.logo.visibility = View.VISIBLE; row.letter.visibility = View.INVISIBLE
        } else {
            row.logo.setImageDrawable(null); row.logo.visibility = View.GONE; row.letter.visibility = View.VISIBLE
        }
    }

    private inner class ChannelAdapter : BaseAdapter() {
        override fun getCount(): Int = if (items.isEmpty()) 0 else items.size + listOffset()
        override fun getItem(position: Int): Any = position
        override fun getItemId(position: Int): Long = position.toLong()
        override fun getView(position: Int, convertView: View?, parent: ViewGroup?): View {
            val row = (convertView?.tag as? Row) ?: makeRow()
            bindRow(row, position)
            return row.root
        }
    }

    /* loghi: piccolo scaricatore con cache in memoria (2 thread, prima i più recenti = quelli visibili) */
    private val logosLazy = lazy { LogoCache(userAgent()) }
    private val logos: LogoCache get() = logosLazy.value

    /* tasto tenuto premuto nella lista: nessun nuovo download di loghi finché lo scorrimento non si ferma (quelli in memoria restano) */
    private val logoResume = Runnable { if (logosLazy.isInitialized()) { logos.paused = false; if (listOpen) listAdapter.notifyDataSetChanged() } }
    private fun logoHold(repeat: Boolean) {
        if (!repeat || !logosLazy.isInitialized()) return
        logos.paused = true
        ui.removeCallbacks(logoResume); ui.postDelayed(logoResume, 250)
    }

    private inner class LogoCache(private val ua: String) {
        // condivisa tra le aperture del player: i loghi non si riscaricano e non si ridecodificano ogni volta
        private val mem = LogoMem.mem
        private val failed = LogoMem.failed
        private val loading = HashSet<String>()
        private var refreshQueued = false
        /** scorrimento veloce in corso: niente nuove richieste */
        @Volatile var paused = false
        // il logo sta in un riquadro di 50×36 dp (FIT_CENTER): si decodifica a quella misura, mai all'originale
        private val boxW = dp(50)
        private val boxH = dp(36)
        private val lowMem = DeviceClass.of(this@PlayerActivity) == "D"
        private val pool = java.util.concurrent.ThreadPoolExecutor(
            2, 2, 30L, java.util.concurrent.TimeUnit.SECONDS,
            object : java.util.concurrent.LinkedBlockingDeque<Runnable>() {
                override fun offer(e: Runnable): Boolean = offerFirst(e)
            },
        )

        /** sul thread principale: il logo se è già pronto, altrimenti lo chiede e restituisce null */
        fun get(url: String): Bitmap? {
            mem.get(url)?.let { return it }
            if (paused || url in failed || url in loading || loading.size >= 40) return null
            if (!url.startsWith("http://", true) && !url.startsWith("https://", true)) { failed.add(url); return null }
            loading.add(url)
            try {
                pool.execute {
                    val b = fetch(url)
                    ui.post {
                        loading.remove(url)
                        if (b != null) mem.put(url, b) else failed.add(url)
                        refresh()
                    }
                }
            } catch (_: Exception) { loading.remove(url) }
            return null
        }

        private fun refresh() {
            if (refreshQueued || !listOpen) return
            refreshQueued = true
            ui.postDelayed({ refreshQueued = false; if (listOpen) listAdapter.notifyDataSetChanged() }, 150)
        }

        private fun fetch(url: String): Bitmap? {
            var conn: java.net.HttpURLConnection? = null
            try {
                var target = java.net.URL(url)
                var hops = 0
                while (true) {
                    val c = target.openConnection() as java.net.HttpURLConnection
                    conn = c
                    c.connectTimeout = 6000
                    c.readTimeout = 8000
                    c.instanceFollowRedirects = false
                    c.setRequestProperty("User-Agent", ua)
                    val code = c.responseCode
                    val loc = c.getHeaderField("Location")
                    if (code in 300..399 && loc != null && hops < 4) { c.disconnect(); target = java.net.URL(target, loc); hops++; continue }
                    if (code != 200) return null
                    break
                }
                val bytes = conn!!.inputStream.use { input ->
                    val out = java.io.ByteArrayOutputStream()
                    val buf = ByteArray(16 * 1024)
                    var total = 0
                    while (true) {
                        val n = input.read(buf)
                        if (n < 0) break
                        total += n
                        if (total > 2_000_000) return null // non è un logo
                        out.write(buf, 0, n)
                    }
                    out.toByteArray()
                }
                val o = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size, o)
                val w = o.outWidth; val h = o.outHeight
                if (w <= 0 || h <= 0) return null
                // misura mostrata (dentro il riquadro, proporzioni invariate); i loghi più piccoli restano come sono
                val k = minOf(boxW.toFloat() / w, boxH.toFloat() / h, 1f)
                val tw = maxOf(1, (w * k).toInt()); val th = maxOf(1, (h * k).toInt())
                var s = 1
                while (w / (s * 2) >= tw && h / (s * 2) >= th) s *= 2
                val opts = BitmapFactory.Options().apply {
                    inSampleSize = s
                    // chiavette con poca memoria: i JPEG (nessuna trasparenza) a 16 bit, metà memoria; PNG e simili restano a 32 bit
                    if (lowMem && o.outMimeType == "image/jpeg") inPreferredConfig = Bitmap.Config.RGB_565
                }
                val b = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, opts) ?: return null
                // ancora molto più grande del riquadro (il campionamento va a potenze di 2): si riduce alla misura esatta
                if (b.width > tw * 3 / 2 || b.height > th * 3 / 2) {
                    val r = Bitmap.createScaledBitmap(b, tw, th, true)
                    if (r !== b) b.recycle()
                    return r
                }
                return b
            } catch (_: Throwable) {
                return null
            } finally {
                try { conn?.disconnect() } catch (_: Exception) {}
            }
        }

        fun shutdown() { try { pool.shutdownNow() } catch (_: Exception) {} }
    }

    /* ------------------------------------------------------------------ */
    /* Ciclo di vita                                                       */
    /* ------------------------------------------------------------------ */
    private var stoppedAt = -1L

    override fun onStop() {
        super.onStop()
        if (!::osd.isInitialized) return // chiusa prima di costruire l'interfaccia
        completeHandoff(true)
        stopped = true
        ui.removeCallbacks(watchRunnable); cancelRetry()
        cancelCushion(); deferredErr?.let { ui.removeCallbacks(it) }; deferredErr = null
        // in secondo piano niente lavoro inutile ogni secondo (statistiche, orologio dell'OSD)
        ui.removeCallbacks(statsRunnable); ui.removeCallbacks(tickRunnable); ui.removeCallbacks(resRunnable)
        PlayStats.stop()
        isBuffering = false; bufferingSince = 0L; freezeSec = 0; lastFrames = -1L; okSince = 0L
        if (zapPending) { ui.removeCallbacks(zapPlay); zapPending = false; markPlaying(); resetRecovery(); currentUrl = item.url }
        val pendingSeek = seekTarget
        ui.removeCallbacks(seekCommit); seekTarget = -1L
        val e = engine ?: return
        stoppedAt = if (isLive) 0L else if (pendingSeek >= 0) pendingSeek else e.position()
        e.stop()
    }

    override fun onRestart() {
        super.onRestart()
        stopped = false
        if (stoppedAt >= 0 && currentUrl.isNotEmpty()) startUrl(currentUrl, stoppedAt)
        stoppedAt = -1L
        ui.removeCallbacks(watchRunnable); ui.postDelayed(watchRunnable, 1000)
        if (engine != null) statsStart()
        if (::osd.isInitialized && osd.visibility == View.VISIBLE) { ui.removeCallbacks(tickRunnable); ui.post(tickRunnable) }
    }

    private var closing = false
    /** il player arrivato dall'anteprima: solo questo può tornare nel riquadro (gli altri appartengono a questa schermata) */
    private var adopted: ExoEngine? = null
    private fun finishWithResult() {
        if (closing) return
        closing = true
        cancelRetry()
        ui.removeCallbacks(zapPlay)
        ui.removeCallbacks(listHide)
        val pendingSeek = seekTarget
        ui.removeCallbacks(seekCommit); seekTarget = -1L
        try { dialog?.dismiss() } catch (_: Exception) {}
        completeHandoff(true)
        val e = engine
        val r = JSONObject()
            .put("kind", kind)
            .put("id", item.id)
            .put("pos", (if (pendingSeek >= 0) pendingSeek else e?.position() ?: 0L) / 1000)
            .put("dur", (e?.duration() ?: 0L) / 1000)
            .put("height", e?.videoHeight() ?: 0)
        if (userChangedEngine) { r.put("engine", engineName); r.put("engineKey", engineKey) }
        if (introChanged && introKey.isNotEmpty()) { r.put("introKey", introKey); r.put("introAuto", introAuto); intro?.let { r.put("intro", org.json.JSONArray().put(it[0] / 1000).put(it[1] / 1000)) } ?: r.put("intro", org.json.JSONArray()) }
        setResult(android.app.Activity.RESULT_OK, Intent().putExtra(RESULT, r.toString()))
        val box = Handoff.box
        val v = e?.view
        if (isLive && !zapPending && e is ExoEngine && e === adopted && e.isActive() && box != null && v != null && v.parent === root && root.width > 0) {
            // il video torna nel riquadro dell'anteprima e continua lì
            osd.visibility = View.GONE; brandView.visibility = View.GONE; zapView.visibility = View.GONE; spinner.visibility = View.GONE; veil.alpha = 0f; resView.visibility = View.GONE
            if (::listPanel.isInitialized) listPanel.visibility = View.GONE
            msgView.visibility = View.GONE
            setOpaque(false)
            root.setBackgroundColor(Color.TRANSPARENT)
            val W = root.width; val H = root.height
            android.animation.ValueAnimator.ofFloat(0f, 1f).apply {
                duration = 280
                interpolator = android.view.animation.AccelerateDecelerateInterpolator()
                addUpdateListener { a ->
                    val f = a.animatedValue as Float
                    v.layoutParams = FrameLayout.LayoutParams((W + (box[2] - W) * f).toInt(), (H + (box[3] - H) * f).toInt()).apply {
                        gravity = Gravity.TOP or Gravity.START; leftMargin = (box[0] * f).toInt(); topMargin = (box[1] * f).toInt()
                    }
                }
                addListener(object : android.animation.AnimatorListenerAdapter() {
                    override fun onAnimationEnd(animation: android.animation.Animator) {
                        try {
                            if (engine === e && !isDestroyed) {
                                e.l = NoopListener
                                Handoff.id = item.id
                                Handoff.back = e
                                engine = null
                                // La schermata principale crea subito la sua vista nel riquadro, sotto questa finestra:
                                // il video passa lì, e solo quando vi è visibile la nostra (ferma sull'ultimo
                                // fotogramma, nello stesso punto) viene tolta e questa schermata si chiude.
                                val host = Handoff.host
                                if (host != null && host.adoptNow(Runnable { finishNow() })) {
                                    ui.postDelayed({ finishNow() }, 1800) // sicurezza
                                    return
                                }
                                // altrimenti la riprende al ritorno (risultato dell'activity)
                            }
                        } catch (_: Exception) {}
                        finishNow()
                    }
                })
                // un frame perché la finestra sotto torni visibile (è stata resa traslucida ora), poi l'animazione
                root.post { start() }
            }
            return
        }
        // nessun ritorno nel riquadro: l'interfaccia sotto viene coperta di nero e poi sfuma, niente lampi
        try { Handoff.host?.coverUi() } catch (_: Exception) {}
        finishNow()
    }

    private var done = false
    private fun finishNow() {
        if (done) return
        done = true
        finish()
        @Suppress("DEPRECATION") overridePendingTransition(0, 0)
    }

    /** «Disconnetti» dal pannello: chiusura immediata, il video non torna nell'anteprima */
    fun killByPanel() {
        if (closing || done) return
        closing = true
        ui.removeCallbacks(zapPlay)
        ui.removeCallbacks(listHide)
        try { dialog?.dismiss() } catch (_: Exception) {}
        completeHandoff(true)
        setResult(android.app.Activity.RESULT_OK, Intent().putExtra(RESULT, JSONObject().put("kind", kind).put("id", item.id).put("kicked", true).toString()))
        finishNow()
    }

    override fun onDestroy() {
        if (current === this) current = null
        closeEvt("chiuso")
        closing = true // un errore tardivo del motore non deve crearne un altro su un'activity distrutta
        ui.removeCallbacksAndMessages(null)
        PlayStats.stop()
        if (::osd.isInitialized) completeHandoff(true)
        try { dialog?.dismiss() } catch (_: Exception) {}
        dialog = null
        if (logosLazy.isInitialized()) logos.shutdown()
        engine?.release()
        engine = null
        try { EngineMemo.flush(this); ZapMemo.flush(this) } catch (_: Throwable) {}
        super.onDestroy()
    }
}

/** cache dei loghi dei canali per tutto il processo (solo bitmap, nessun riferimento alle activity) */
object LogoMem {
    val mem = object : android.util.LruCache<String, Bitmap>(6 * 1024 * 1024) {
        override fun sizeOf(key: String, value: Bitmap): Int = value.byteCount
    }
    val failed: MutableSet<String> = java.util.Collections.synchronizedSet(HashSet())

    /** memoria scarsa (onTrimMemory/onLowMemory): metà dei loghi; tutti se è critica o l'app è in sfondo (si riscaricano quando servono) */
    fun trim(level: Int) {
        try {
            if (level >= android.content.ComponentCallbacks2.TRIM_MEMORY_RUNNING_CRITICAL) mem.evictAll() else mem.trimToSize(mem.maxSize() / 2)
        } catch (_: Throwable) {}
    }
}
