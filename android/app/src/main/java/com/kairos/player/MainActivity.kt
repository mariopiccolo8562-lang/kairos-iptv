package com.kairos.player

import android.annotation.SuppressLint
import android.content.Intent
import android.content.SharedPreferences
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.lifecycle.Lifecycle
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.FileProvider
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

/**
 * KAIROS Player — contenitore Android.
 * - interfaccia web locale (assets/www) oppure la versione aggiornata scaricata dal pannello (files/www)
 * - player nativo a schermo intero (PlayerActivity) e anteprima nativa nel riquadro della Live TV
 * - aggiornamento dell'APK, speed test e richieste HTTP native
 */
class MainActivity : ComponentActivity() {

    private lateinit var web: WebView
    private lateinit var root: FrameLayout
    private lateinit var previewBox: FrameLayout
    private lateinit var prefs: SharedPreferences
    private val ui = Handler(Looper.getMainLooper())
    private var lastBack = 0L
    @Volatile private var uiOk = false
    private var isResumed = false
    /** splash nativo (chiavetta da 1 GB): sopra la WebView finché l'interfaccia non ha disegnato la Home */
    @Volatile private var splash: SplashOverlay? = null

    companion object {
        private const val HOME = "file:///android_asset/www/index.html"
    }

    private val otaDir: File get() = File(filesDir, "www")
    private val otaFile: File get() = File(otaDir, "index.html")

    /** ritorno dal player nativo: posizione, durata, motore scelto, risoluzione */
    private val playerLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { res ->
        adoptBack() // se il player non l'ha già restituito mentre si chiudeva
        Handoff.engine?.let { Handoff.engine = null; it.release() } // mai preso dal player (avvio fallito): niente audio orfano
        endHandoff()
        uncoverUi()
        val r = res.data?.getStringExtra(PlayerActivity.RESULT) ?: return@registerForActivityResult
        js("window.kxPlayerClosed && window.kxPlayerClosed(${JSONObject.quote(r)})")
    }

    /**
     * Il video tornato dallo schermo intero continua nel riquadro dell'anteprima senza ricaricarsi.
     * Una nuova vista nasce nel riquadro, sotto la finestra (trasparente) del player che mostra ancora l'ultimo
     * fotogramma nello stesso punto; quando la nuova ha disegnato il video, la vecchia viene tolta e [onShown]
     * chiude il player. Nessun buco tra le due.
     */
    private fun adoptBack(onShown: Runnable? = null) {
        val b = Handoff.back ?: return
        Handoff.back = null
        endHandoff()
        val box = Handoff.box
        if (previewEngine != null && previewEngine !== b) { previewEngine?.release(); previewBox.removeAllViews() }
        previewEngine = b
        b.l = previewListener
        b.feed = false // tornato anteprima: niente campioni di banda
        previewId = Handoff.id
        previewAlt = ""
        previewTriedAlt = false
        if (box != null) {
            previewBox.layoutParams = FrameLayout.LayoutParams(box[2], box[3]).apply { leftMargin = box[0]; topMargin = box[1] }
            previewBox.visibility = View.VISIBLE
        }
        if (b.view.parent !== previewBox) {
            val v = b.moveTo(this, true, if (SurfaceFix.needed(this)) 3500L else 1200L) { b.dropOldView(); onShown?.run() }
            previewBox.addView(v, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        } else onShown?.run()
        // se entro pochi secondi la pagina non chiede di nuovo l'anteprima (utente uscito dalla Live), si ferma
        ui.postDelayed({ if (previewEngine === b && !previewWanted) stopPreview() }, 4000)
        previewWanted = false
    }
    @Volatile private var previewWanted = false

    /* passaggio anteprima ↔ schermo intero: il player (finestra trasparente sopra) chiama questi metodi */
    private var handoffBusy = false
    private val handoffHost = object : Handoff.Host {
        override fun adoptNow(onShown: Runnable): Boolean {
            if (isFinishing || isDestroyed || Handoff.back == null) return false
            adoptBack(onShown)
            return true
        }
        override fun fullShown() { endHandoff() }
        override fun coverUi() { if (!isDestroyed) coverUiNow(false) }
    }

    /** lo schermo intero mostra il video: via l'anteprima ingrandita rimasta sotto (ormai coperta) */
    private fun endHandoff() {
        if (!handoffBusy) return
        handoffBusy = false
        val keep = previewEngine?.view
        for (i in previewBox.childCount - 1 downTo 0) if (previewBox.getChildAt(i) !== keep) previewBox.removeViewAt(i)
        if (previewEngine == null) previewBox.visibility = View.GONE
    }

    /* velo nero sopra l'interfaccia: niente lampi della pagina tra schermo intero e app (film, VLC, altro canale) */
    private var uiVeil: View? = null
    private fun coverUiNow(fade: Boolean) {
        val v = uiVeil ?: View(this).apply { setBackgroundColor(Color.BLACK); alpha = 0f; isFocusable = false }.also {
            uiVeil = it
            root.addView(it, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        }
        v.animate().cancel()
        v.bringToFront()
        v.visibility = View.VISIBLE
        if (fade && v.alpha < 1f) v.animate().alpha(1f).setStartDelay(0).setDuration(140).start() else v.alpha = 1f
    }
    private fun uncoverUi() {
        val v = uiVeil ?: return
        if (v.visibility != View.VISIBLE) return
        v.animate().cancel()
        v.animate().alpha(0f).setStartDelay(160).setDuration(260).withEndAction { v.visibility = View.GONE }.start()
    }

    /** WebView pronta: non ancora creata (WebView di sistema in aggiornamento) o morta (processo grafico chiuso) → niente chiamate */
    private var webDead = false
    private val webOk: Boolean get() = ::web.isInitialized && !webDead
    private fun js(code: String) { runOnUiThread { if (webOk) web.evaluateJavascript(code, null) } }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        prefs = getSharedPreferences("kairos", MODE_PRIVATE)
        Quiet.watch(application) // Android 12+: aggiornamento senza conferma quando il cliente esce dall'app
        applyOrientation(prefs.getString("orient", "auto") ?: "auto")
        Watch.start(this, prefs) // perché l'app si è chiusa l'ultima volta (errore, uccisa dal sistema, memoria): lo legge l'interfaccia e lo manda al pannello

        root = FrameLayout(this).apply { setBackgroundColor(Color.BLACK) }
        // ispezione remota (chrome://inspect) solo nelle build di debug, mai nell'APK pubblicato
        try { WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG) } catch (_: Exception) {}
        web = try { WebView(this) } catch (e: Throwable) {
            // WebView di sistema assente o in aggiornamento (capita dopo un aggiornamento di Fire OS): messaggio invece di un crash
            setContentView(TextView(this).apply {
                setBackgroundColor(Color.BLACK); setTextColor(Color.WHITE); textSize = 22f; gravity = android.view.Gravity.CENTER; setPadding(60, 60, 60, 60)
                text = "Il sistema sta aggiornando un suo componente (WebView).\nAttendi un minuto e riapri l'app."
            })
            return
        }
        web.setBackgroundColor(Color.BLACK)
        // nessun layer forzato: la WebView disegna direttamente (un layer hardware aggiunge una copia a schermo intero per ogni frame, pesante su Fire TV)
        root.addView(web, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        previewBox = FrameLayout(this).apply { setBackgroundColor(Color.BLACK); visibility = View.GONE; isFocusable = false }
        root.addView(previewBox, FrameLayout.LayoutParams(1, 1))
        setContentView(root)
        hideSystemUi()
        // chiavetta da 1 GB (stessa soglia della classe D dell'interfaccia): splash nativo dal primo fotogramma, anche sopra
        // lo schermo nero d'avvio della WebView; lo toglie l'interfaccia (splashDone) o, mai bloccati, un tempo di sicurezza
        if (SplashOverlay.wanted(this)) splash = SplashOverlay(this, root, prefs) { js("window.kxSplashGone && kxSplashGone()") }.also { it.show() }

        // Android uccide il motore web per primo quando manca memoria (Fire Stick): con la priorità alta lo fa molto meno
        if (Build.VERSION.SDK_INT >= 26) try { web.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false) } catch (_: Throwable) {}
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = true
            @Suppress("DEPRECATION")
            allowFileAccessFromFileURLs = true
            @Suppress("DEPRECATION")
            allowUniversalAccessFromFileURLs = true // consente al player di leggere playlist da qualsiasi server
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            useWideViewPort = true
            loadWithOverviewMode = true
            textZoom = 100
            cacheMode = WebSettings.LOAD_DEFAULT
            userAgentString = "$userAgentString KairosPlayer/${BuildConfig.VERSION_NAME}"
            // sicurezza: niente content://, niente finestre/popup aperti da script, niente posizione
            allowContentAccess = false
            javaScriptCanOpenWindowsAutomatically = false
            setSupportMultipleWindows(false)
            setGeolocationEnabled(false)
            if (Build.VERSION.SDK_INT >= 26) safeBrowsingEnabled = true
        }
        web.isFocusable = true
        web.isFocusableInTouchMode = true
        // con il riconoscimento vocale il ponte ha anche voiceStart (senza, la funzione non esiste e l'interfaccia non mostra il microfono)
        web.addJavascriptInterface(if (voiceOk()) VoiceBridge() else Bridge(), "KairosNative")
        // il lettore nativo avvisa la pagina del canale in onda dopo lo zapping (window.kxNowPlaying)
        UiBridge.js = { code -> js(code) }
        web.webChromeClient = WebChromeClient()
        web.webViewClient = object : WebViewClient() {
            // il player non deve mai navigare fuori dai propri file (il ponte KairosNative è esposto a ogni pagina caricata)
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (isAppUrl(request.url.toString())) return false
                // link esterno toccato dall'utente nella pagina principale: si apre nel browser, mai dentro l'app
                if (request.isForMainFrame && request.hasGesture()) openExternal(request.url)
                return true
            }

            @Deprecated("Deprecated in Java")
            override fun shouldOverrideUrlLoading(view: WebView, url: String): Boolean = !isAppUrl(url)

            /** pagine esterne dentro un iframe: bloccate (vedrebbero anche il ponte KairosNative) */
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): android.webkit.WebResourceResponse? {
                if (request.isForMainFrame) return null
                val s = request.url.scheme ?: return null
                if (!s.equals("http", true) && !s.equals("https", true)) return null
                val accept = request.requestHeaders?.entries?.firstOrNull { it.key.equals("Accept", true) }?.value ?: return null
                if (!accept.startsWith("text/html")) return null // immagini, script, XHR/fetch passano come sempre
                return android.webkit.WebResourceResponse("text/plain", "utf-8", 403, "Forbidden", emptyMap<String, String>(), java.io.ByteArrayInputStream(ByteArray(0)))
            }

            /** la pagina dell'interfaccia non si carica: via lo splash nativo (si vede il messaggio della WebView) */
            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: android.webkit.WebResourceError) {
                if (request.isForMainFrame) splash?.hide(true)
            }
            @Deprecated("Deprecated in Java")
            override fun onReceivedError(view: WebView, errorCode: Int, description: String?, failingUrl: String?) {
                if (failingUrl != null && failingUrl == view.url) splash?.hide(true)
            }

            override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
                // la WebView morta non si può più usare: tolta e distrutta, poi la schermata si ricrea.
                // Succede quasi sempre per poca memoria (Fire Stick): si annota, così l'interfaccia passa da sola alla modalità
                // leggerissima e il pannello lo vede in «Errori delle app»
                noteRenderGone(if (Build.VERSION.SDK_INT >= 26 && detail.didCrash()) "crash" else "memoria")
                webDead = true
                try { (view.parent as? ViewGroup)?.removeView(view); view.destroy() } catch (_: Throwable) {}
                ui.post { if (!isFinishing && !isDestroyed) recreate() }
                return true
            }
        }

        thread(name = "kx-clean") {
            try { netDir.listFiles()?.forEach { it.delete() } } catch (_: Exception) {}
            try {
                for (d in listOfNotNull(File(cacheDir, "apk"), externalCacheDir)) {
                    val f = File(d, "kairos-update.apk")
                    if (f.exists() && System.currentTimeMillis() - f.lastModified() > 10 * 60_000L && !apkBusy.get()) f.delete()
                    // APK pronto in background: resta una settimana (poi la versione nuova si riscarica)
                    val g = File(d, "kairos-ready.apk")
                    if (g.exists() && (System.currentTimeMillis() - g.lastModified() > 7 * 86_400_000L || ApkCheck.verify(this, g) != null) && !apkBusy.get()) { g.delete(); File(d, "kairos-ready.url").delete() }
                }
            } catch (_: Exception) {}
        }
        // registrazioni e VPN: notifiche verso la pagina; le registrazioni programmate vengono riattivate
        Recorder.ua = userAgent()
        Recorder.listener = recListener
        KxVpn.listener = vpnListener
        Recorder.initAsync(this)
        // autopilota: decoder del dispositivo letti in sottofondo dopo l'avvio (la prima richiesta dell'interfaccia è subito pronta)
        ui.postDelayed({ thread(name = "kx-caps") { try { DevCaps.json(applicationContext) } catch (_: Throwable) {} } }, 8000)
        loadUi()
        web.requestFocus()

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (!webOk) { finish(); return }
                web.evaluateJavascript("(window.kxBack && window.kxBack()) ? 1 : 0") { r ->
                    if (r != "1") {
                        val now = System.currentTimeMillis()
                        if (now - lastBack < 2000) finish()
                        else {
                            lastBack = now
                            Toast.makeText(this@MainActivity, "Premi di nuovo Indietro per uscire", Toast.LENGTH_SHORT).show()
                        }
                    }
                }
            }
        })
    }

    /* ------------------------------------------------------------------ */
    /* Interfaccia aggiornabile (OTA)                                      */
    /* ------------------------------------------------------------------ */
    private fun loadUi() {
        val fails = prefs.getInt("ui_fail", 0)
        val sameApk = prefs.getInt("ui_apk", -1) == BuildConfig.VERSION_CODE
        val useOta = otaFile.exists() && sameApk && fails < 2
        if (otaFile.exists() && !useOta) resetOta(markBad = fails >= 2 && sameApk)
        uiOk = false
        if (useOta) {
            prefs.edit().putInt("ui_fail", fails + 1).apply()
            web.loadUrl("file://" + otaFile.absolutePath)
            // se la versione scaricata non parte entro 15 secondi, torna a quella inclusa nell'APK
            ui.postDelayed({ if (!uiOk) { resetOta(markBad = true); web.loadUrl(HOME) } }, 15_000)
        } else web.loadUrl(HOME)
    }

    /** [markBad]: la versione scaricata non partiva → non va più riapplicata (evita un ciclo di riavvii) */
    private fun resetOta(markBad: Boolean = false) {
        if (markBad) prefs.getString("ui_ver", null)?.let { prefs.edit().putString("ui_bad", it).apply() }
        otaDir.deleteRecursively()
        prefs.edit().remove("ui_ver").remove("ui_apk").putInt("ui_fail", 0).apply()
    }

    /* ------------------------------------------------------------------ */
    /* Anteprima nativa nel riquadro della Live TV                         */
    /* ------------------------------------------------------------------ */
    private var previewEngine: ExoEngine? = null
    @Volatile private var previewId = ""
    private var previewAlt = ""
    private var previewTriedAlt = false

    private val previewListener = object : EngineListener {
        override fun onBuffering(buffering: Boolean) { js("window.kxPreviewState && kxPreviewState('${if (buffering) "loading" else "ready"}')") }
        override fun onReady() {
            val h = previewEngine?.videoHeight() ?: 0
            js("window.kxPreviewState && kxPreviewState('ready'); window.kxPreviewInfo && kxPreviewInfo(${JSONObject.quote(previewId)}, $h)")
        }
        override fun onError(message: String) {
            ui.post {
                if (!previewTriedAlt && previewAlt.isNotEmpty()) { previewTriedAlt = true; previewEngine?.play(previewAlt, 0) }
                else js("window.kxPreviewState && kxPreviewState('error')")
            }
        }
        override fun onEnded() {}
    }

    private fun showPreview(json: String) {
        if (handoffBusy) return // il video sta passando allo schermo intero: nessuna seconda connessione
        val o = try { JSONObject(json) } catch (e: Exception) { return }
        val vw = o.optDouble("vw", 0.0)
        if (vw <= 0 || web.width == 0) return
        val scale = web.width / vw
        val lp = FrameLayout.LayoutParams((o.optInt("w") * scale).toInt(), (o.optInt("h") * scale).toInt())
        lp.leftMargin = (o.optInt("x") * scale).toInt()
        lp.topMargin = (o.optInt("y") * scale).toInt()
        previewBox.layoutParams = lp
        previewBox.visibility = View.VISIBLE
        previewWanted = true
        Handoff.box = intArrayOf(lp.leftMargin, lp.topMargin, lp.width, lp.height)
        // feed = false: l'anteprima non alimenta la memoria della linea (misurerebbe il bitrate della versione leggera)
        val e = previewEngine ?: ExoEngine(this, previewListener, userAgent(), PlayPrefs("auto", "fast", "fit", live = true, feed = false), overlay = true).also {
            previewEngine = it
            previewBox.addView(it.view, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        }
        val id = o.optString("id")
        if (id == previewId && e.isActive()) { js("window.kxPreviewState && kxPreviewState('ready')"); return } // già in onda
        previewId = id
        previewAlt = o.optString("a")
        previewTriedAlt = false
        e.play(o.optString("u"), 0)
    }

    private fun stopPreview() {
        boxAnim?.cancel()
        previewEngine?.stop()
        previewId = ""
        // durante il passaggio allo schermo intero il riquadro ingrandito (ultimo fotogramma) deve restare visibile
        // finché il player non mostra il video: nasconderlo qui (es. onPause) faceva comparire la pagina web
        if (!handoffBusy) previewBox.visibility = View.GONE
    }

    /* il riquadro dell'anteprima si allarga fino a riempire lo schermo (come nelle app TV) */
    private var boxAnim: android.animation.ValueAnimator? = null
    private fun growBox(cancelled: () -> Unit = {}, done: () -> Unit) {
        val lp0 = previewBox.layoutParams as FrameLayout.LayoutParams
        val x0 = lp0.leftMargin; val y0 = lp0.topMargin; val w0 = lp0.width; val h0 = lp0.height
        val W = root.width; val H = root.height
        if (W <= 0 || w0 <= 0) { done(); return }
        boxAnim?.cancel()
        boxAnim = android.animation.ValueAnimator.ofFloat(0f, 1f).apply {
            duration = 300
            interpolator = android.view.animation.DecelerateInterpolator(1.6f)
            addUpdateListener { a ->
                val f = a.animatedValue as Float
                previewBox.layoutParams = FrameLayout.LayoutParams((w0 + (W - w0) * f).toInt(), (h0 + (H - h0) * f).toInt()).apply {
                    leftMargin = (x0 * (1 - f)).toInt(); topMargin = (y0 * (1 - f)).toInt()
                }
            }
            addListener(object : android.animation.AnimatorListenerAdapter() {
                private var c = false
                override fun onAnimationCancel(animation: android.animation.Animator) { c = true }
                override fun onAnimationEnd(animation: android.animation.Animator) { if (c) cancelled() else done() }
            })
            start()
        }
    }

    private val multiLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { res ->
        val r = res.data?.getStringExtra(MultiActivity.RESULT)
        js("window.kxMultiClosed && window.kxMultiClosed(${JSONObject.quote(r ?: "")})")
    }

    private fun launchPlayer(noAnim: Boolean) {
        Handoff.host = handoffHost
        val i = Intent(this@MainActivity, PlayerActivity::class.java)
        if (noAnim) playerLauncher.launch(i, androidx.core.app.ActivityOptionsCompat.makeCustomAnimation(this, 0, 0))
        else playerLauncher.launch(i)
    }

    /** schermo intero: se l'anteprima mostra già quel canale, lo stesso video si allarga e continua */
    /** OK premuto due volte di fila: un solo player (due istanze sovrapposte = due video e doppio audio) */
    private var playerAskT = 0L
    private fun startPlayer(o: JSONObject) {
        val t = android.os.SystemClock.elapsedRealtime()
        if (t - playerAskT < 900) return
        playerAskT = t
        val e = previewEngine
        var handed = false
        try {
            if (o.optString("kind") == "live" && o.optString("engine") != "vlc" && e != null && previewBox.visibility == View.VISIBLE && e.isActive()) {
                if (o.optString("id") == previewId) {
                    handed = true
                    growBox(cancelled = {
                        // animazione interrotta (riquadro chiuso o app in pausa): il player parte comunque, oppure si rinuncia
                        if (isResumed) { Handoff.box = null; stopPreview(); coverUiNow(true); launchPlayer(false) }
                        else { PlayerActivity.pending = null; PlayerActivity.pendingJson = null }
                    }) {
                        try {
                            // Il riquadro, ora a tutto schermo, resta qui con il video (poi con l'ultimo fotogramma)
                            // finché il player sopra non ha disegnato il video sulla sua superficie: solo allora
                            // chiama fullShown() e il riquadro sparisce. Prima la vista veniva staccata subito e
                            // onPause nascondeva il riquadro: si vedeva la pagina/il nero fino al primo fotogramma.
                            e.l = NoopListener
                            Handoff.engine = e
                            Handoff.id = previewId
                            handoffBusy = true
                            previewEngine = null
                            previewId = ""
                            launchPlayer(noAnim = true)
                        } catch (x: Exception) {
                            handoffBusy = false
                            if (Handoff.engine === e) { Handoff.engine = null; previewEngine = e; e.l = previewListener }
                            stopPreview(); coverUiNow(true); launchPlayer(false)
                        }
                    }
                }
            }
        } catch (x: Exception) { handed = false }
        // uscendo, nessun riquadro in cui tornare; velo nero: la pagina non lampeggia prima del player
        if (!handed) { Handoff.box = null; stopPreview(); coverUiNow(true); launchPlayer(false) }
    }

    /** layout orizzontale fisso (telefoni e tablet); sulle TV non cambia nulla */
    private fun applyOrientation(mode: String) {
        requestedOrientation = if (mode == "land") android.content.pm.ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE else android.content.pm.ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
    }

    private fun userAgent(): String = KxUa.get(this)

    /* ------------------------------------------------------------------ */
    /* Aggiornamento APK                                                   */
    /* ------------------------------------------------------------------ */
    private val apkBusy = java.util.concurrent.atomic.AtomicBoolean(false)

    /** APK scaricato e verificato in background, pronto da installare al primo OK (aggiornamento in background) */
    /** riavvii forzati del motore web (ultimi 10, con il motivo): li legge l'interfaccia con renderGone() */
    private fun noteRenderGone(why: String) {
        try {
            val a = org.json.JSONArray(prefs.getString("rgone", "[]") ?: "[]")
            a.put(JSONObject().put("t", System.currentTimeMillis()).put("why", why))
            while (a.length() > 10) a.remove(0)
            prefs.edit().putString("rgone", a.toString()).apply()
        } catch (_: Exception) {}
    }

    @Volatile private var readyApk: File? = null
    @Volatile private var readyUrl = ""

    private fun apkDir(): File = (if (Build.VERSION.SDK_INT >= 24) File(cacheDir, "apk") else (externalCacheDir ?: cacheDir)).apply { mkdirs() }

    /** scarica [url] in [out] seguendo i redirect sicuri; [progress] riceve 0-99 */
    private fun fetchApk(url: String, out: File, progress: ((Int) -> Unit)?) {
        var target = URL(url)
        var conn = target.openConnection() as HttpURLConnection
        var hops = 0
        while (true) {
            conn.instanceFollowRedirects = false
            conn.connectTimeout = 20_000
            conn.readTimeout = 30_000
            val code = conn.responseCode
            val loc = conn.getHeaderField("Location")
            if (code in 300..399 && loc != null && hops < 8) {
                val next = URL(target, loc)
                if (target.protocol == "https" && next.protocol != "https") throw Exception("il link dell'APK rimanda a un indirizzo non sicuro (http)")
                conn.disconnect(); target = next; hops++
                conn = target.openConnection() as HttpURLConnection
                continue
            }
            if (code != 200) throw Exception(if (code == 404) "file non trovato (HTTP 404): il link dell'APK non è pubblico o è sbagliato" else "HTTP $code")
            break
        }
        val total = conn.contentLength.toLong()
        var done = 0L
        var last = -1
        conn.inputStream.use { input ->
            FileOutputStream(out).use { fo ->
                val buf = ByteArray(64 * 1024)
                while (true) {
                    val n = input.read(buf)
                    if (n < 0) break
                    fo.write(buf, 0, n)
                    done += n
                    if (total > 0 && progress != null) {
                        val p = ((done * 100) / total).toInt().coerceAtMost(99)
                        if (p != last) { last = p; progress(p) }
                    }
                }
            }
        }
        conn.disconnect()
        if (total > 0 && done != total) { out.delete(); throw Exception("download interrotto: controlla la connessione e riprova") }
        // deve essere davvero un APK (un link sbagliato spesso scarica una pagina web)
        val head = ByteArray(2)
        java.io.FileInputStream(out).use { it.read(head) }
        if (out.length() < 500_000 || head[0] != 'P'.code.toByte() || head[1] != 'K'.code.toByte()) {
            out.delete(); throw Exception("il link non porta a un file APK")
        }
        // stessa versione (o più vecchia) o firma diversa: l'installer non va aperto (evita il ciclo di aggiornamenti)
        ApkCheck.verify(this, out)?.let { msg -> out.delete(); throw Exception(msg) }
    }

    /** rete a consumo (dati mobili, hotspot): niente download non richiesti */
    private fun metered(): Boolean = try {
        val cm = getSystemService(CONNECTIVITY_SERVICE) as android.net.ConnectivityManager
        cm.isActiveNetworkMetered
    } catch (_: Exception) { false }

    /** aggiornamento in background: l'APK si scarica e si verifica in silenzio; la pagina riceve kxApkReady(url) quando è pronto */
    /** APK già pronto da un'apertura precedente (file + link salvato accanto), ancora valido */
    private fun apkReadyFor(url: String): Boolean {
        if (readyUrl == url && readyApk?.exists() == true) return true
        return try {
            val f = File(apkDir(), "kairos-ready.apk"); val u = File(apkDir(), "kairos-ready.url")
            if (f.exists() && u.exists() && u.readText().trim() == url && ApkCheck.verify(this, f) == null) { readyApk = f; readyUrl = url; true } else false
        } catch (_: Exception) { false }
    }

    /** scaricamento rinviato perché c'è una visione in corso: si riprova dopo */
    @Volatile private var apkDeferred: Runnable? = null
    private fun prefetchApk(url: String) {
        if (apkReadyFor(url)) { js("window.kxApkReady && kxApkReady(${JSONObject.quote(url)})"); return }
        // niente lavoro di fondo durante la visione (schermo intero, multischermo o anteprima): si riprova tra un minuto
        if (PlayerActivity.current != null || MultiActivity.open || previewId.isNotEmpty()) {
            apkDeferred?.let { ui.removeCallbacks(it) }
            val r = Runnable { apkDeferred = null; thread(name = "kx-apk-defer") { prefetchApk(url) } } // fuori dal thread dell'interfaccia (verifica dell'APK)
            apkDeferred = r
            ui.postDelayed(r, 60_000L)
            return
        }
        if (metered() || !apkBusy.compareAndSet(false, true)) return
        thread(name = "kx-apk-bg") {
            try {
                val out = File(apkDir(), "kairos-ready.apk")
                fetchApk(url, out, null)
                try { File(apkDir(), "kairos-ready.url").writeText(url) } catch (_: Exception) {}
                readyApk = out; readyUrl = url
                js("window.kxApkReady && kxApkReady(${JSONObject.quote(url)})")
            } catch (_: Exception) {
                // si riproverà al prossimo controllo
            } finally { apkBusy.set(false) }
        }
    }

    private fun downloadAndInstall(url: String) {
        // già scaricato in background: si passa subito all'installazione
        val r = readyApk
        if (r != null && readyUrl == url && r.exists()) { js("window.kxApkCb && kxApkCb(100)"); runOnUiThread { launchInstaller(r) }; return }
        if (!apkBusy.compareAndSet(false, true)) return // un solo download alla volta
        thread(name = "kx-apk") {
            try {
                val out = File(apkDir(), "kairos-update.apk")
                fetchApk(url, out) { p -> js("window.kxApkCb && kxApkCb($p)") }
                js("window.kxApkCb && kxApkCb(100)")
                runOnUiThread { launchInstaller(out) }
            } catch (e: Exception) {
                js("window.kxApkCb && kxApkCb(-1, ${JSONObject.quote(e.message ?: e.javaClass.simpleName)})")
            } finally {
                apkBusy.set(false)
            }
        }
    }

    private fun launchInstaller(apk: File) {
        if (Build.VERSION.SDK_INT >= 26 && !packageManager.canRequestPackageInstalls()) {
            Toast.makeText(this, "Consenti a ${getString(R.string.app_name)} di installare app, poi premi Indietro", Toast.LENGTH_LONG).show()
            pendingApk = apk
            js("window.kxApkCb && kxApkCb(-2)")
            // Fire TV: la schermata per singola app non sempre esiste → si apre quella generale
            val tries = listOf(
                Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:$packageName")),
                Intent(Settings.ACTION_SECURITY_SETTINGS),
                Intent(Settings.ACTION_SETTINGS),
            )
            for (i in tries) { try { startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); return } catch (_: Exception) {} }
            return
        }
        val uri: Uri = if (Build.VERSION.SDK_INT >= 24) FileProvider.getUriForFile(this, "$packageName.files", apk) else Uri.fromFile(apk)
        val i = Intent(Intent.ACTION_VIEW)
            .setDataAndType(uri, "application/vnd.android.package-archive")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        try { startActivity(i) } catch (e: Exception) { Toast.makeText(this, "Installazione non disponibile su questo dispositivo", Toast.LENGTH_LONG).show() }
    }

    private var pendingApk: File? = null

    /* ------------------------------------------------------------------ */
    /* Speed test                                                          */
    /* ------------------------------------------------------------------ */
    /** ping+jitter, download (6 connessioni) e upload (4 invii): vedi SpeedTest.kt. Una nuova chiamata annulla la precedente. */
    private fun runSpeedTest() {
        SpeedTest.start(userAgent()) { s -> js("window.kxSpeedCb && kxSpeedCb(${JSONObject.quote(s)})") }
    }

    /* ------------------------------------------------------------------ */
    /* Download su file (playlist grandi) + cache dei contenuti            */
    /* ------------------------------------------------------------------ */
    private val netDir: File get() = File(cacheDir, "net").apply { mkdirs() }
    private val libDir: File get() = File(filesDir, "lib").apply { mkdirs() }
    private val httpPool = java.util.concurrent.Executors.newFixedThreadPool(6)

    /** scarica [url] in un file e restituisce (stato, percorso). Il testo non passa dal ponte JS: molto più veloce. */
    private fun fetchToFile(id: String, url: String, ua: String) {
        httpPool.execute {
            var status = -1
            var path = ""
            var err = ""
            try {
                var target = URL(url)
                var hops = 0
                var conn = target.openConnection() as HttpURLConnection
                while (true) {
                    conn.instanceFollowRedirects = false
                    conn.connectTimeout = 15_000
                    conn.readTimeout = 45_000
                    conn.setRequestProperty("User-Agent", ua.ifBlank { userAgent() })
                    conn.setRequestProperty("Accept", "*/*")
                    conn.setRequestProperty("Accept-Encoding", "gzip")
                    val code = conn.responseCode
                    val loc = conn.getHeaderField("Location")
                    if (code in 300..399 && loc != null && hops < 6) {
                        conn.disconnect(); target = URL(target, loc); hops++
                        conn = target.openConnection() as HttpURLConnection
                        continue
                    }
                    status = code
                    break
                }
                val raw = (if (status >= 400) conn.errorStream else conn.inputStream)
                val input = if (raw != null && "gzip".equals(conn.contentEncoding, true)) java.util.zip.GZIPInputStream(raw, 64 * 1024) else raw
                val out = File(netDir, id.replace(Regex("[^A-Za-z0-9_-]"), "_") + ".txt")
                input?.use { inp -> FileOutputStream(out).use { fo -> inp.copyTo(fo, 128 * 1024) } }
                conn.disconnect()
                path = "file://" + out.absolutePath
            } catch (e: Exception) {
                status = -1
                err = e.javaClass.simpleName + (e.message?.let { ": $it" } ?: "")
            }
            js("window.kxFileCb && window.kxFileCb(${JSONObject.quote(id)}, $status, ${JSONObject.quote(path)}, ${JSONObject.quote(err)})")
        }
    }


    /* ------------------------------------------------------------------ */
    /* Guida TV completa (XMLTV): letta in streaming, si tengono solo i     */
    /* canali della lista e le prossime ore → file JSON piccolo per l'app   */
    /* ------------------------------------------------------------------ */
    @Volatile private var epgRunning = false
    private val epgFile: File get() = File(filesDir, "epg.json")
    private val RX_CC = Regex("^[\\s|\\[\\](){}#*.]*([A-Z]{2}|ITA|UK|USA|ESP|FRA|GER|DEU|ALB|POR|NLD|POL|ROM|TUR|SUI|AUT|BEL|GRE)\\s*[|:\\])-]+\\s*")
    private val RX_BR = Regex("\\([^)]*\\)|\\[[^\\]]*\\]|\\{[^}]*\\}")
    private val RX_QUAL = Regex("(?<![a-z0-9_])(fhd|uhd|hd|sd|4k|8k|hevc|h ?26[45]|1080[pi]?|720p?|576[pi]?|480p?|2160p?|[0-9]{2}fps|fps|backup|bkp|raw|multi|vip|hq|lq|low|high|test|new|nuovo|orig|original|feed|direct|dash)(?![a-z0-9_])")
    private val RX_MARKS = Regex("\\p{M}+")
    private val RX_NONALNUM = Regex("[^a-z0-9+]+")

    /** stessa normalizzazione dei nomi usata dall'app (logoKey): "IT| RAI 1 HD" → "rai1" */
    private fun epgKey(name: String): String {
        var s = java.text.Normalizer.normalize(name, java.text.Normalizer.Form.NFKD).replace(RX_MARKS, "")
        RX_CC.find(s)?.let { s = s.substring(it.range.last + 1) }
        s = s.lowercase(java.util.Locale.ROOT).replace(RX_BR, " ").replace("&", " and ").replace(RX_QUAL, " ").replace(RX_NONALNUM, "")
        return if (s.length >= 2) s else ""
    }

    /** "20261102033500 +0100" → secondi UTC */
    private fun xmltvTime(v: String?): Long {
        if (v == null || v.length < 12) return 0
        return try {
            val c = java.util.Calendar.getInstance(java.util.TimeZone.getTimeZone("UTC"))
            c.clear()
            c.set(v.substring(0, 4).toInt(), v.substring(4, 6).toInt() - 1, v.substring(6, 8).toInt(), v.substring(8, 10).toInt(), v.substring(10, 12).toInt(), if (v.length >= 14 && v[12].isDigit()) v.substring(12, 14).toInt() else 0)
            var t = c.timeInMillis / 1000
            val si = (12 until v.length).firstOrNull { v[it] == '+' || v[it] == '-' }
            val tz = if (si != null) v.substring(si).trim() else ""
            if (tz.length >= 5 && (tz[0] == '+' || tz[0] == '-')) {
                val sign = if (tz[0] == '-') -1 else 1
                t -= sign * (tz.substring(1, 3).toInt() * 3600 + tz.substring(3, 5).toInt() * 60)
            }
            t
        } catch (e: Exception) { 0 }
    }

    private fun downloadTo(url: String, out: File) {
        var target = URL(url)
        var hops = 0
        var conn = target.openConnection() as HttpURLConnection
        while (true) {
            conn.instanceFollowRedirects = false
            conn.connectTimeout = 20_000
            conn.readTimeout = 60_000
            conn.setRequestProperty("User-Agent", userAgent())
            conn.setRequestProperty("Accept-Encoding", "gzip")
            val code = conn.responseCode
            val loc = conn.getHeaderField("Location")
            if (code in 300..399 && loc != null && hops < 6) { conn.disconnect(); target = URL(target, loc); hops++; conn = target.openConnection() as HttpURLConnection; continue }
            if (code != 200) throw Exception("HTTP $code")
            break
        }
        val raw = conn.inputStream
        val input = if ("gzip".equals(conn.contentEncoding, true)) java.util.zip.GZIPInputStream(raw, 64 * 1024) else raw
        input.use { inp -> FileOutputStream(out).use { fo -> inp.copyTo(fo, 256 * 1024) } }
        conn.disconnect()
    }

    private class Prog(val s: Long, val e: Long, val t: String, val d: String)
    private val EPG_MAX_TOTAL = 90_000
    private val EPG_MAX_CH = 48

    private fun parseXmltv(f: File, ids: Set<String>, names: Set<String>, map: JSONObject, progs: HashMap<String, ArrayList<Prog>>, from: Long, to: Long, already: Int): Int {
        val raw = java.io.BufferedInputStream(java.io.FileInputStream(f), 256 * 1024)
        raw.mark(4)
        val b1 = raw.read(); val b2 = raw.read()
        raw.reset()
        val input: java.io.InputStream = if (b1 == 0x1f && b2 == 0x8b) java.util.zip.GZIPInputStream(raw, 256 * 1024) else raw // file .xml.gz
        var n = 0
        input.use { stream ->
            val p = android.util.Xml.newPullParser()
            p.setFeature(org.xmlpull.v1.XmlPullParser.FEATURE_PROCESS_NAMESPACES, false)
            p.setInput(stream, null)
            val matched = HashSet<String>()
            var chId: String? = null
            var chKeys = ArrayList<String>()
            var inProg = false
            var pCh = ""; var pStart = 0L; var pStop = 0L; var title = ""; var desc = ""
            var ev = p.eventType
            while (ev != org.xmlpull.v1.XmlPullParser.END_DOCUMENT) {
                if (ev == org.xmlpull.v1.XmlPullParser.START_TAG) {
                    when (p.name) {
                        "channel" -> { chId = p.getAttributeValue(null, "id"); chKeys = ArrayList() }
                        "display-name" -> if (chId != null) { val k = epgKey(p.nextText() ?: ""); if (k.isNotEmpty()) chKeys.add(k) }
                        "programme" -> {
                            pCh = p.getAttributeValue(null, "channel") ?: ""
                            inProg = false
                            if (pCh in matched) {
                                pStart = xmltvTime(p.getAttributeValue(null, "start")); pStop = xmltvTime(p.getAttributeValue(null, "stop"))
                                inProg = pStop > from && pStart < to && pStop > pStart
                                title = ""; desc = ""
                            }
                        }
                        "title" -> if (inProg && title.isEmpty()) title = (p.nextText() ?: "").trim()
                        "desc" -> if (inProg && desc.isEmpty()) desc = (p.nextText() ?: "").trim().take(200)
                    }
                } else if (ev == org.xmlpull.v1.XmlPullParser.END_TAG) {
                    when (p.name) {
                        "channel" -> {
                            val id = chId
                            if (id != null) {
                                val keys = ArrayList<String>()
                                val low = id.lowercase(java.util.Locale.ROOT)
                                if (low in ids) keys.add("id:$low")
                                for (k in chKeys) if (k in names) keys.add("n:$k")
                                val k2 = epgKey(id.substringBeforeLast('.'))
                                if (k2.isNotEmpty() && k2 in names) keys.add("n:$k2")
                                if (keys.isNotEmpty()) { matched.add(id); map.put(id, org.json.JSONArray(keys.distinct())) }
                            }
                            chId = null
                        }
                        "programme" -> if (inProg) {
                            inProg = false
                            val list = progs.getOrPut(pCh) { ArrayList() }
                            // niente doppioni (due sorgenti con lo stesso canale) e limiti per non esaurire la memoria
                            if (list.size < EPG_MAX_CH && already + n < EPG_MAX_TOTAL && list.none { it.s == pStart }) { list.add(Prog(pStart, pStop, title, desc)); n++ }
                        }
                    }
                }
                ev = p.next()
            }
        }
        return n
    }

    private fun buildEpg(id: String, urlsJson: String, wantJson: String, hoursAhead: Int) {
        fun cb(ok: Boolean, n: Int, err: String) = js("window.kxEpgCb && kxEpgCb(${JSONObject.quote(id)}, $ok, ${JSONObject.quote(if (ok) "file://" + epgFile.absolutePath else "")}, $n, ${JSONObject.quote(err)})")
        if (epgRunning) { cb(false, 0, "già in corso"); return }
        epgRunning = true
        thread(name = "kx-epg") {
            var n = 0
            val errs = ArrayList<String>()
            try {
                val urls = org.json.JSONArray(urlsJson)
                val want = JSONObject(wantJson)
                val ids = HashSet<String>(); val names = HashSet<String>()
                want.optJSONArray("ids")?.let { a -> for (i in 0 until a.length()) ids.add(a.optString(i).lowercase(java.util.Locale.ROOT)) }
                want.optJSONArray("names")?.let { a -> for (i in 0 until a.length()) names.add(a.optString(i)) }
                val now = System.currentTimeMillis() / 1000
                val map = JSONObject()
                val progs = HashMap<String, ArrayList<Prog>>()
                for (u in 0 until urls.length()) {
                    val f = File(cacheDir, "epg_$u.xml")
                    try { downloadTo(urls.getString(u), f); n += parseXmltv(f, ids, names, map, progs, now - 2 * 3600, now + hoursAhead * 3600L, n) }
                    catch (e: Throwable) { errs.add(if (e is OutOfMemoryError) "guida troppo grande" else e.message ?: e.javaClass.simpleName) }
                    finally { f.delete() }
                }
                if (n > 0) {
                    // scrittura in streaming: nessuna stringa gigante in memoria
                    val tmp = File(filesDir, "epg.tmp")
                    android.util.JsonWriter(java.io.BufferedWriter(java.io.OutputStreamWriter(FileOutputStream(tmp), Charsets.UTF_8), 128 * 1024)).use { w ->
                        w.beginObject()
                        w.name("t").value(now)
                        w.name("map").beginObject()
                        val it = map.keys()
                        while (it.hasNext()) { val k = it.next(); val a = map.getJSONArray(k); w.name(k).beginArray(); for (i in 0 until a.length()) w.value(a.getString(i)); w.endArray() }
                        w.endObject()
                        w.name("p").beginObject()
                        for ((k, list) in progs) {
                            if (list.isEmpty()) continue
                            w.name(k).beginArray()
                            for (pr in list.sortedBy { it.s }) { w.beginArray(); w.value(pr.s); w.value(pr.e); w.value(pr.t); w.value(pr.d); w.endArray() }
                            w.endArray()
                        }
                        w.endObject()
                        w.endObject()
                    }
                    tmp.renameTo(epgFile)
                    cb(true, n, "")
                } else cb(false, 0, errs.firstOrNull() ?: "nessun programma trovato per i tuoi canali")
            } catch (e: Throwable) { cb(false, 0, if (e is OutOfMemoryError) "guida troppo grande per questo dispositivo" else e.message ?: e.javaClass.simpleName) }
            finally { epgRunning = false }
        }
    }

    private fun libFile(key: String) = File(libDir, key.replace(Regex("[^A-Za-z0-9_-]"), "_").take(80) + ".json")

    /* ------------------------------------------------------------------ */
    /* Registrazioni, VPN e sicurezza della WebView                        */
    /* ------------------------------------------------------------------ */
    private val recListener: (String) -> Unit = { s -> js("window.kxRecCb && kxRecCb(${JSONObject.quote(s)})") }
    private val vpnListener: (String, String) -> Unit = { st, msg -> js("window.kxVpnCb && kxVpnCb(${JSONObject.quote(st)}, ${JSONObject.quote(msg)})") }

    /** Android 13+: permesso per la notifica "Registrazione in corso" (se negato la registrazione funziona lo stesso) */
    private val notifLauncher = registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    private fun askNotifications() {
        if (Build.VERSION.SDK_INT < 33 || prefs.getBoolean("notif_asked", false)) return
        if (checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) == android.content.pm.PackageManager.PERMISSION_GRANTED) return
        prefs.edit().putBoolean("notif_asked", true).apply()
        try { notifLauncher.launch(android.Manifest.permission.POST_NOTIFICATIONS) } catch (_: Exception) {}
    }

    /** consenso di Android per la VPN (VpnService.prepare): la configurazione resta solo in memoria */
    private var vpnConf: String? = null
    private val vpnLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { res ->
        val c = vpnConf
        vpnConf = null
        if (c != null && res.resultCode == RESULT_OK) KxVpn.start(this, c) else KxVpn.denied()
    }

    /** risposta di Android alla richiesta del DNS cifrato (stessa finestra della VPN) */
    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == DnsShield.REQ) DnsShield.onConsent(applicationContext, resultCode == RESULT_OK)
    }

    private fun startVpn(conf: String) {
        val bad = KxVpn.check(conf)
        if (bad != null) { KxVpn.fail(bad); return }
        val consent = try { android.net.VpnService.prepare(this) } catch (e: Exception) {
            KxVpn.fail("Questo dispositivo non permette di usare una VPN"); return
        }
        if (consent == null) { KxVpn.start(this, conf); return }
        vpnConf = conf
        KxVpn.waitingConsent()
        try { vpnLauncher.launch(consent) } catch (e: Exception) {
            vpnConf = null
            KxVpn.fail("Questo dispositivo non permette di usare una VPN")
        }
    }

    /** solo i file dell'app: asset dell'APK o interfaccia aggiornata in files/www (percorso canonico, niente "..") */
    private fun isAppUrl(u: String): Boolean {
        if (u.startsWith("file:///android_asset/")) return !u.contains("..")
        if (!u.startsWith("file://")) return false
        return try {
            val p = Uri.parse(u).path ?: return false
            File(p).canonicalPath.startsWith(otaDir.canonicalPath + File.separator)
        } catch (_: Exception) { false }
    }

    private fun openExternal(u: Uri) {
        val s = u.scheme?.lowercase() ?: return
        if (s != "http" && s != "https") return
        try {
            startActivity(Intent(Intent.ACTION_VIEW, u).addCategory(Intent.CATEGORY_BROWSABLE).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (_: Exception) {
            Toast.makeText(this, "Nessun browser disponibile su questo dispositivo", Toast.LENGTH_SHORT).show()
        }
    }

    /* ------------------------------------------------------------------ */

    /** Tasti canale +/- del telecomando → zapping nel player */
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        val key = when (event.keyCode) {
            KeyEvent.KEYCODE_CHANNEL_UP -> "ChannelUp"
            KeyEvent.KEYCODE_CHANNEL_DOWN -> "ChannelDown"
            KeyEvent.KEYCODE_MENU -> "ContextMenu"
            else -> null
        }
        if (key != null) {
            if (event.action == KeyEvent.ACTION_DOWN && webOk) {
                web.evaluateJavascript("document.dispatchEvent(new KeyboardEvent('keydown',{key:'$key',bubbles:true}))", null)
            }
            return true
        }
        return super.dispatchKeyEvent(event)
    }

    @Suppress("DEPRECATION")
    private fun hideSystemUi() {
        window.decorView.systemUiVisibility = (View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            or View.SYSTEM_UI_FLAG_FULLSCREEN
            or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN)
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemUi()
    }

    /**
     * Player nativo davanti all'interfaccia: la WebView è nascosta e Android/Chromium rallenta i suoi timer, così il
     * battito per «Online ora» del pannello poteva saltare per minuti. Ogni 20 s l'app lo sveglia da sé.
     * Si ferma quando si torna all'interfaccia o quando non c'è più un player sullo schermo.
     */
    private val hbTick = object : Runnable {
        override fun run() {
            if (isResumed) return
            val p = PlayerActivity.current
            val shown = (p != null && p.lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)) || MultiActivity.open
            if (shown) js("window.kxHbTick && kxHbTick()")
            else if (p != null) js("window.kxHbBye && kxHbBye()") // lettore aperto ma non visibile (Home durante la visione): il pannello lo sa subito
            if (p != null || MultiActivity.open) ui.postDelayed(this, 20_000)
        }
    }

    override fun onPause() {
        isResumed = false
        if (voiceOn) { try { recognizer?.cancel() } catch (_: Throwable) {}; voiceErr("annullato") } // app in sfondo: niente ascolto
        stopPreview()
        if (webOk) web.onPause()
        ui.removeCallbacks(hbTick)
        ui.postDelayed(hbTick, 20_000)
        super.onPause()
    }

    override fun onResume() {
        isResumed = true
        ui.removeCallbacks(hbTick)
        super.onResume()
        if (!webOk) return
        web.onResume()
        web.requestFocus()
        js("window.kxResume && kxResume()")
        // tornando dalle impostazioni "installa app sconosciute"
        val apk = pendingApk
        if (apk != null && (Build.VERSION.SDK_INT < 26 || packageManager.canRequestPackageInstalls())) { pendingApk = null; launchInstaller(apk) }
    }

    override fun onTrimMemory(level: Int) {
        super.onTrimMemory(level)
        // Android chiede memoria: l'interfaccia libera le sue cache prima che il sistema chiuda l'app
        if (level >= TRIM_MEMORY_RUNNING_LOW) {
            val p = prefs
            thread(name = "kx-note") { Watch.note(p, "trim", "livello $level") } // scrittura su disco (commit) fuori dal thread dell'interfaccia
            LogoMem.trim(level)
            if (webOk) {
                js("window.kxTrim && kxTrim($level)")
                // immagini e file non più usati dalla pagina (cache in RAM della WebView; quella su disco resta)
                try { web.clearCache(false) } catch (_: Throwable) {}
            }
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onLowMemory() {
        @Suppress("DEPRECATION") super.onLowMemory()
        LogoMem.trim(TRIM_MEMORY_COMPLETE)
    }

    override fun onDestroy() {
        if (isFinishing) Watch.clean(prefs) // chiusura voluta (tasto indietro, «Esci»): non è un'anomalia
        if (Recorder.listener === recListener) Recorder.listener = null
        if (KxVpn.listener === vpnListener) KxVpn.listener = null
        if (isFinishing) {
            SpeedTest.stop()
            // uscendo dall'app la VPN (che riguarda solo questa app) si spegne, salvo registrazioni in corso o programmate
            if (KxVpn.active() && !Recorder.hasWork()) KxVpn.stop()
            // video passato tra le schermate e non più ripreso da nessuno: niente audio orfano dopo la chiusura
            Handoff.back?.let { Handoff.back = null; if (it !== previewEngine) it.release() }
            Handoff.engine?.let { Handoff.engine = null; if (it !== previewEngine) it.release() }
            if (Handoff.host === handoffHost) Handoff.host = null
        }
        ui.removeCallbacksAndMessages(null)
        try { recognizer?.destroy() } catch (_: Throwable) {}
        recognizer = null
        EngineMemo.flush(applicationContext); ZapMemo.flush(applicationContext)
        UiBridge.js = null
        previewEngine?.release()
        previewEngine = null
        httpPool.shutdownNow()
        if (webOk) { (web.parent as? ViewGroup)?.removeView(web); web.destroy() }
        super.onDestroy()
    }

    /* ------------------------------------------------------------------ */
    /* Ricerca a voce (SpeechRecognizer di Android, in italiano)            */
    /* ------------------------------------------------------------------ */
    private var recognizer: android.speech.SpeechRecognizer? = null
    private var voiceOn = false
    private val micLauncher = registerForActivityResult(ActivityResultContracts.RequestPermission()) { ok -> if (ok) voiceListen() else voiceErr("permesso negato") }
    private fun voiceOk(): Boolean = try { android.speech.SpeechRecognizer.isRecognitionAvailable(this) } catch (_: Throwable) { false }
    private fun voiceErr(why: String) { voiceOn = false; js("window.kxVoiceErr && kxVoiceErr(${JSONObject.quote(why)})") }
    /** il permesso del microfono si chiede solo al primo uso; se il cliente lo nega non si richiede più (lo concede dalle impostazioni di Android) */
    private fun voiceBegin() {
        if (Build.VERSION.SDK_INT >= 23 && checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            if (prefs.getBoolean("mic_asked", false)) { voiceErr("permesso negato"); return }
            prefs.edit().putBoolean("mic_asked", true).apply()
            try { micLauncher.launch(android.Manifest.permission.RECORD_AUDIO) } catch (_: Exception) { voiceErr("permesso negato") }
            return
        }
        voiceListen()
    }
    private fun voiceListen() {
        try {
            val r = recognizer ?: android.speech.SpeechRecognizer.createSpeechRecognizer(this).also { recognizer = it }
            r.setRecognitionListener(object : android.speech.RecognitionListener {
                override fun onReadyForSpeech(params: Bundle?) {}
                override fun onBeginningOfSpeech() {}
                override fun onRmsChanged(rmsdB: Float) {}
                override fun onBufferReceived(buffer: ByteArray?) {}
                override fun onEndOfSpeech() {}
                override fun onPartialResults(partialResults: Bundle?) {}
                override fun onEvent(eventType: Int, params: Bundle?) {}
                override fun onError(error: Int) {
                    // codici di SpeechRecognizer: rete/server, annullato, niente parlato o non capito, occupato, permesso, audio, lingua
                    voiceErr(when (error) { 1, 2, 4, 11 -> "rete"; 5 -> "annullato"; 6, 7 -> "non capito"; 8, 10 -> "occupato"; 9 -> "permesso negato"; 3 -> "audio"; 12, 13 -> "lingua non disponibile"; else -> "errore" })
                }
                override fun onResults(results: Bundle?) {
                    voiceOn = false
                    val t = results?.getStringArrayList(android.speech.SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()?.trim().orEmpty()
                    if (t.isEmpty()) voiceErr("non capito") else js("window.kxVoice && kxVoice(${JSONObject.quote(t.take(200))})")
                }
            })
            r.cancel()
            voiceOn = true
            r.startListening(Intent(android.speech.RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
                .putExtra(android.speech.RecognizerIntent.EXTRA_LANGUAGE_MODEL, android.speech.RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                .putExtra(android.speech.RecognizerIntent.EXTRA_LANGUAGE, "it-IT")
                .putExtra(android.speech.RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "it-IT")
                .putExtra(android.speech.RecognizerIntent.EXTRA_MAX_RESULTS, 1)
                .putExtra(android.speech.RecognizerIntent.EXTRA_PARTIAL_RESULTS, false)
                .putExtra(android.speech.RecognizerIntent.EXTRA_CALLING_PACKAGE, packageName))
        } catch (_: Throwable) { voiceErr("errore") }
    }

    /** autopilota: con «Automatico» il lettore parte con il motore che su questo dispositivo va meglio per il formato del canale */
    private fun learnEngine(j: JSONObject) {
        if (!j.optBoolean("engLearn")) return
        try {
            val it0 = j.optJSONArray("items")?.optJSONObject(j.optInt("index")) ?: return
            val cur = j.optString("engine", "exo")
            val allow = j.optJSONArray("engAllow")?.let { a -> (0 until a.length()).map { a.optString(it) }.toSet() }
            val best = EngineMemo.best(applicationContext, EngineMemo.key(it0.optString("u"), it0.optString("t")), allow)
            j.put("engDef", cur)
            if (best != null && best != cur) j.put("engine", best)
        } catch (_: Exception) {}
    }

    /** ponte con la ricerca a voce: esiste solo se il dispositivo ha il riconoscimento vocale */
    inner class VoiceBridge : Bridge() {
        /** ascolta in italiano: risultato in window.kxVoice(testo), errore in window.kxVoiceErr(motivo) */
        @JavascriptInterface fun voiceStart() { runOnUiThread { if (!isFinishing && !isDestroyed) voiceBegin() } }
    }

    /** Funzioni esposte al player come window.KairosNative */
    open inner class Bridge {
        /** autopilota: cosa sa decodificare il dispositivo (HEVC, 4K, 10 bit, 50/60 fps) e altezza massima dello schermo */
        @JavascriptInterface fun caps(): String = DevCaps.json(applicationContext)
        /** autopilota: formati in cui il lettore usa di base VLC perché su questo dispositivo ExoPlayer fallisce di più (es. "ts:vlc") */
        @JavascriptInterface fun engMemo(): String = try { EngineMemo.summary(applicationContext) } catch (_: Throwable) { "" }
        /** autopilota: spazio libero e totale (MB) */
        @JavascriptInterface fun storage(): String = DiskCare.json(applicationContext)
        /** autopilota: pulisce le cache dell'app (download e guide temporanei, APK vecchi, immagini della WebView) */
        @JavascriptInterface fun trimDisk() { DiskCare.trim(applicationContext, apkBusy.get()); runOnUiThread { if (webOk) try { web.clearCache(true) } catch (_: Throwable) {} } }
        @JavascriptInterface fun version(): String = BuildConfig.VERSION_NAME
        /** chiusure anomale dell'app (errore, uccisa dal sistema, memoria scarsa): elenco JSON, poi azzerato */
        @JavascriptInterface fun deaths(): String = Watch.drain(prefs)
        /** memoria libera adesso (MB) e se il sistema è in riserva */
        @JavascriptInterface fun memInfo(): String = Watch.mem(this@MainActivity).toString()
        /** riavvii forzati del motore web: {n30, last, why, total} (n30 = negli ultimi 30 minuti) */
        @JavascriptInterface fun renderGone(): String = try {
            val a = org.json.JSONArray(prefs.getString("rgone", "[]") ?: "[]"); val t = System.currentTimeMillis()
            var n30 = 0; var last = 0L; var why = ""
            for (i in 0 until a.length()) { val o = a.optJSONObject(i) ?: continue; val tt = o.optLong("t"); if (t - tt < 30 * 60_000L) n30++; if (tt > last) { last = tt; why = o.optString("why") } }
            JSONObject().put("n30", n30).put("last", last).put("why", why).put("total", a.length()).toString()
        } catch (_: Exception) { "{}" }
        @JavascriptInterface fun versionCode(): Int = BuildConfig.VERSION_CODE
        @JavascriptInterface fun model(): String = "${Build.MANUFACTURER} ${Build.MODEL}".trim().take(70)
        /** rete (wifi/eth/mobile, segnale Wi-Fi) e dati della visione in corso, per il pannello "Online ora" */
        @JavascriptInterface fun netInfo(): String = NetInfo.json(applicationContext)
        @JavascriptInterface fun playStats(): String = PlayStats.json()
        /** problemi della visione per «Errori applicazione» (letti e svuotati) */
        @JavascriptInterface fun playEvents(): String = PlayStats.drainEvents()
        @JavascriptInterface fun playYoutube(id: String, title: String) { runOnUiThread { TrailerActivity.start(this@MainActivity, id, title) } }
        @JavascriptInterface fun openUrl(url: String) { runOnUiThread { try { openExternal(Uri.parse(url)) } catch (_: Exception) {} } }
        /** TV (Android TV / Google TV / Fire TV): la pagina non usa l'interfaccia touch anche se il puntatore è "coarse" */
        @JavascriptInterface fun isTv(): Boolean = try {
            (getSystemService(UI_MODE_SERVICE) as android.app.UiModeManager).currentModeType == android.content.res.Configuration.UI_MODE_TYPE_TELEVISION ||
                packageManager.hasSystemFeature(android.content.pm.PackageManager.FEATURE_LEANBACK) ||
                packageManager.hasSystemFeature("amazon.hardware.fire_tv")
        } catch (_: Exception) { false }
        @JavascriptInterface fun exit() { runOnUiThread { finish() } }

        /** l'interfaccia è partita correttamente */
        @JavascriptInterface fun uiReady() { uiOk = true; prefs.edit().putInt("ui_fail", 0).apply(); runOnUiThread { splash?.onUiReady() } }
        /** splash nativo davanti (chiavetta da 1 GB): true se è mostrato; da qui in poi lo toglie l'interfaccia con splashDone */
        @JavascriptInterface fun nativeSplash(): Boolean { val s = splash ?: return false; s.asked = true; return s.shown }
        /** l'interfaccia ha disegnato la Home (o deve mostrare qualcosa al cliente): dissolvenza e via */
        @JavascriptInterface fun splashDone() { runOnUiThread { splash?.hide(false) } }
        /** marchio e colore del tema per lo splash nativo della prossima apertura */
        @JavascriptInterface fun splashBrand(name: String, accent: String) { prefs.edit().putString("sp_brand", name.trim().take(24)).putString("sp_accent", accent.trim().take(16)).apply() }
        @JavascriptInterface fun uiVersion(): String = prefs.getString("ui_ver", "") ?: ""

        /** installa una nuova versione dell'interfaccia scaricata dal pannello e la ricarica */
        @JavascriptInterface fun uiBad(): String = prefs.getString("ui_bad", "") ?: ""
        @JavascriptInterface fun applyUi(html: String, version: String) {
            if (version == prefs.getString("ui_bad", "")) return
            try {
                otaDir.mkdirs()
                File(otaDir, "index.tmp").writeText(html, Charsets.UTF_8)
                val cfg = try { assets.open("www/config.js").bufferedReader().use { it.readText() } } catch (e: Exception) { "" }
                File(otaDir, "config.js").writeText(cfg, Charsets.UTF_8)
                File(otaDir, "index.tmp").renameTo(otaFile)
                prefs.edit().putString("ui_ver", version).putInt("ui_apk", BuildConfig.VERSION_CODE).putInt("ui_fail", 0).apply()
                runOnUiThread { loadUi() }
            } catch (e: Exception) { resetOta() }
        }

        /** prepara la nuova interfaccia senza ricaricare: verrà usata al prossimo avvio */
        @JavascriptInterface fun stageUi(html: String, version: String) {
            if (version == prefs.getString("ui_bad", "")) return
            try {
                otaDir.mkdirs()
                File(otaDir, "index.tmp").writeText(html, Charsets.UTF_8)
                val cfg = try { assets.open("www/config.js").bufferedReader().use { it.readText() } } catch (e: Exception) { "" }
                File(otaDir, "config.js").writeText(cfg, Charsets.UTF_8)
                File(otaDir, "index.tmp").renameTo(otaFile)
                prefs.edit().putString("ui_ver", version).putInt("ui_apk", BuildConfig.VERSION_CODE).putInt("ui_fail", 0).apply()
            } catch (e: Exception) { resetOta() }
        }
        @JavascriptInterface fun setOrientation(mode: String) {
            prefs.edit().putString("orient", mode).apply()
            runOnUiThread { applyOrientation(mode) }
        }
        @JavascriptInterface fun canInstall(): Boolean = Build.VERSION.SDK_INT < 26 || packageManager.canRequestPackageInstalls()
        /** comando «Chiedi il permesso» dal pannello: apre la schermata di Android «Installa app sconosciute» */
        @JavascriptInterface fun openInstallPerm() {
            runOnUiThread {
                for (i in listOf(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:$packageName")), Intent(Settings.ACTION_SECURITY_SETTINGS), Intent(Settings.ACTION_SETTINGS))) { try { startActivity(i); break } catch (_: Exception) {} }
            }
        }

        /** Avvia il player nativo (ExoPlayer / VLC) */
        @JavascriptInterface fun play(payload: String) {
            // la lista (anche migliaia di canali) si analizza qui, sul thread del ponte JS: il thread dell'interfaccia non si blocca
            val j = try { JSONObject(payload) } catch (e: Exception) { return }
            learnEngine(j) // autopilota: motore imparato (solo con «Automatico»)
            PlayerActivity.pendingJson = j
            PlayerActivity.pending = null
            // al thread dell'interfaccia servono solo tipo, motore e id del canale
            val head = JSONObject().put("kind", j.optString("kind")).put("engine", j.optString("engine"))
                .put("id", j.optJSONArray("items")?.optJSONObject(j.optInt("index"))?.optString("id") ?: "")
            runOnUiThread { startPlayer(head) }
        }

        /** multi-schermo (2 o 4 canali insieme) */
        @JavascriptInterface fun multi(payload: String) {
            val j = try { JSONObject(payload) } catch (e: Exception) { return }
            MultiActivity.pending = j
            runOnUiThread { previewWanted = false; stopPreview(); try { multiLauncher.launch(Intent(this@MainActivity, MultiActivity::class.java)) } catch (_: Throwable) {} }
        }
        @JavascriptInterface fun preview(json: String) { runOnUiThread { showPreview(json) } }
        @JavascriptInterface fun previewStop() { runOnUiThread { previewWanted = false; stopPreview() } }
        /** «Disconnetti» dal pannello: chiude il player a schermo intero, se aperto */
        @JavascriptInterface fun playerClose() { runOnUiThread { PlayerActivity.current?.killByPanel() } }
        @JavascriptInterface fun installApk(url: String) { downloadAndInstall(url) }
        /** aggiornamento in background: scarica e verifica l'APK senza disturbare; poi kxApkReady(url) */
        @JavascriptInterface fun prefetchApk(url: String) { this@MainActivity.prefetchApk(url) }
        /** true se l'APK di [url] è già scaricato e verificato */
        @JavascriptInterface fun apkReady(url: String): Boolean = apkReadyFor(url)
        /** Android 12+: la versione [code] si installa da sola quando il cliente esce dall'app, l'interfaccia non la propone (Quiet.kt) */
        @JavascriptInterface fun quietOk(code: Int): Boolean = Quiet.ok(this@MainActivity, code)
        /** l'installazione senza conferma di [code] è stata bloccata su un Samsung: la proposta spiega il «Blocco automatico» */
        @JavascriptInterface fun quietBlocked(code: Int): Boolean = Quiet.blocked(this@MainActivity, code)
        @JavascriptInterface fun speedTest() { runSpeedTest() }
        /** ferma lo speed test in corso (es. finestra chiusa) */
        @JavascriptInterface fun speedStop() { SpeedTest.stop() }

        /** registrazione: json {chId, name, url, at?, until?} (epoch ms) → id, "" se non valida. Aggiornamenti in window.kxRecCb(lista JSON) */
        @JavascriptInterface fun recStart(json: String): String {
            val o = try { JSONObject(json) } catch (e: Exception) { return "" }
            val id = Recorder.start(this@MainActivity, o.optString("chId"), o.optString("name"), o.optString("url"), o.optLong("at", 0L), o.optLong("until", 0L))
            if (id.isNotEmpty()) runOnUiThread { askNotifications() }
            return id
        }
        @JavascriptInterface fun recStop(id: String) { Recorder.stop(this@MainActivity, id) }
        @JavascriptInterface fun recList(): String = Recorder.listJson()
        @JavascriptInterface fun recDelete(id: String): Boolean = Recorder.delete(this@MainActivity, id)
        @JavascriptInterface fun recFree(): String = Recorder.freeJson(this@MainActivity)

        /** VPN WireGuard (testo wg-quick dal pannello). Stato in window.kxVpnCb(state, message) */
        @JavascriptInterface fun vpnSupported(): Boolean = KxVpn.supported(this@MainActivity)
        @JavascriptInterface fun vpnStart(conf: String) { runOnUiThread { startVpn(conf) } }
        @JavascriptInterface fun vpnStop() { KxVpn.stop() }
        @JavascriptInterface fun vpnState(): String = KxVpn.state
        // DNS cifrato (voce «sdns» del pannello): l'interfaccia lo accende solo senza la VPN del fornitore (vedi DnsShield.kt)
        @JavascriptInterface fun dnsStart() { runOnUiThread { if (!isFinishing && !isDestroyed) DnsShield.start(this@MainActivity) } }
        @JavascriptInterface fun dnsStop() { DnsShield.stop(applicationContext) }
        @JavascriptInterface fun dnsState(): String = DnsShield.state
        /** il cliente tocca il lucchetto «DNS» dopo un rifiuto o un errore: si può chiedere di nuovo subito (dalla 2.7.9) */
        @JavascriptInterface fun dnsRetry() { DnsShield.retry() }

        /** scarica un indirizzo in un file locale; risposta in window.kxFileCb(id, status, path, error) */
        @JavascriptInterface fun httpFile(id: String, url: String, ua: String) { fetchToFile(id, url, ua) }
        /** cancella un file scaricato con httpFile */
        @JavascriptInterface fun dropFile(path: String) {
            try { val f = File(Uri.parse(path).path ?: return).canonicalFile; if (f.path.startsWith(netDir.canonicalPath + File.separator)) f.delete() } catch (_: Exception) {}
        }
        /** cache della libreria (canali, film, serie) per un avvio istantaneo */
        @JavascriptInterface fun cachePut(key: String, data: String) {
            // scrittura fuori dal thread del ponte (la pagina non resta bloccata) e in streaming (nessuna seconda copia in memoria)
            httpPool.execute {
                try {
                    val f = libFile(key); val t = File(f.path + ".tmp")
                    java.io.OutputStreamWriter(java.io.FileOutputStream(t), Charsets.UTF_8).buffered(64 * 1024).use { it.write(data) }
                    if (!t.renameTo(f)) { f.delete(); t.renameTo(f) }
                } catch (_: Exception) {}
            }
        }
        @JavascriptInterface fun cachePath(key: String): String { val f = libFile(key); return if (f.exists()) "file://" + f.absolutePath else "" }
        /** guida TV completa: urls = sorgenti XMLTV, want = {ids:[tvg-id], names:[nomi normalizzati]} */
        @JavascriptInterface fun epgBuild(id: String, urls: String, want: String, hours: Int) { buildEpg(id, urls, want, hours.coerceIn(6, 72)) }
        @JavascriptInterface fun epgPath(): String = if (epgFile.exists()) "file://" + epgFile.absolutePath else ""
        @JavascriptInterface fun cacheClear() { try { libDir.deleteRecursively() } catch (_: Exception) {} }

        /** Richiesta HTTP fatta dall'app (senza limiti CORS). Risposta in window.kxHttpCb(id, status, body). */
        @JavascriptInterface fun http(id: String, method: String, url: String, body: String, ua: String) {
            httpPool.execute { // al massimo 6 richieste insieme (prima un thread nuovo per ogni chiamata)
                var status = -1
                var text: String
                try {
                    var target = URL(url)
                    var hops = 0
                    var conn: HttpURLConnection = target.openConnection() as HttpURLConnection
                    while (true) {
                        conn.instanceFollowRedirects = false
                        conn.connectTimeout = 15_000
                        conn.readTimeout = 30_000
                        conn.requestMethod = if (method == "POST") "POST" else "GET"
                        conn.setRequestProperty("User-Agent", ua.ifBlank { "KairosPlayer/" + BuildConfig.VERSION_NAME })
                        conn.setRequestProperty("Accept", "application/json, text/plain, */*")
                        if (method == "POST") {
                            conn.doOutput = true
                            conn.setRequestProperty("Content-Type", "application/json")
                            conn.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
                        }
                        val code = conn.responseCode
                        val loc = conn.getHeaderField("Location")
                        if (code in 300..399 && loc != null && hops < 5 && method != "POST") {
                            conn.disconnect()
                            target = URL(target, loc)
                            hops++
                            conn = target.openConnection() as HttpURLConnection
                            continue
                        }
                        status = code
                        break
                    }
                    val stream = if (status >= 400) conn.errorStream else conn.inputStream
                    val out = ByteArrayOutputStream()
                    stream?.use { input ->
                        val buf = ByteArray(64 * 1024)
                        var total = 0
                        while (true) {
                            val n = input.read(buf)
                            if (n < 0) break
                            total += n
                            if (total > 80 * 1024 * 1024) break
                            out.write(buf, 0, n)
                        }
                    }
                    conn.disconnect()
                    text = out.toString("UTF-8")
                } catch (e: Throwable) {
                    status = -1
                    // dispositivi con poca memoria: una risposta enorme non deve chiudere l'app
                    text = if (e is OutOfMemoryError) "risposta troppo grande per la memoria del dispositivo" else e.javaClass.simpleName + (e.message?.let { ": $it" } ?: "")
                }
                val js = try { "window.kxHttpCb && window.kxHttpCb(${JSONObject.quote(id)}, $status, ${JSONObject.quote(text)})" }
                    catch (e: OutOfMemoryError) { "window.kxHttpCb && window.kxHttpCb(${JSONObject.quote(id)}, -1, 'risposta troppo grande per la memoria del dispositivo')" }
                runOnUiThread { if (webOk) web.evaluateJavascript(js, null) }
            }
        }
    }
}

/**
 * Sorveglianza delle chiusure anomale. Il pannello non può vedere un'app che muore: qui si lascia una traccia e la prossima
 * apertura la consegna all'interfaccia (NATIVE.deaths()), che la manda in «Errori delle app».
 * - errore non gestito → "crash" con il tipo e la prima riga utile dello stack
 * - l'app era viva (battito ogni 20 s), in primo piano e con lo schermo acceso, non è stata chiusa dall'utente e il dispositivo
 *   non si è riavviato → "killed" (uccisa dal sistema mentre il cliente la usava: quasi sempre memoria), con la memoria libera
 *   vista all'ultimo battito. In sfondo (tasto Home, un'altra app), con lo schermo spento o dopo uno spegnimento (TV spenta,
 *   chiavetta alimentata dalla TV) Android chiude le app normalmente, e così quando si installa un aggiornamento: non è
 *   un'anomalia e non si segnala (prima sì: il pannello mostrava «si è chiusa da sola» a chi aveva solo spento la TV)
 * - richieste di memoria del sistema (onTrimMemory) → "trim"
 */
object Watch {
    private const val MAX = 12
    private var started = false
    private val h = Handler(Looper.getMainLooper())
    private var pingPrefs: android.content.SharedPreferences? = null
    private var ctx: android.content.Context? = null
    @Volatile private var shown = 0 // schermate dell'app visibili (fra onStart e onStop): 0 = app in sfondo

    /** numero dell'avvio del dispositivo: cambia a ogni riavvio o spegnimento (-1 dove il sistema non lo dà, prima di Android 7) */
    private fun bootCount(c: android.content.Context): Int =
        try { if (Build.VERSION.SDK_INT >= 24) Settings.Global.getInt(c.contentResolver, Settings.Global.BOOT_COUNT, -1) else -1 } catch (_: Throwable) { -1 }
    /** ora in cui il dispositivo si è acceso (ora di sistema meno il tempo dall'accensione): serve dove manca il numero dell'avvio */
    private fun bootAt(): Long = System.currentTimeMillis() - android.os.SystemClock.elapsedRealtime()
    private fun screenOn(c: android.content.Context): Boolean =
        try { (c.getSystemService(android.content.Context.POWER_SERVICE) as android.os.PowerManager).isInteractive } catch (_: Throwable) { true }

    /**
     * L'apertura precedente è finita senza una chiusura voluta: va segnalata come «uccisa dal sistema»? Solo se all'ultimo
     * battito l'app era in primo piano con lo schermo acceso e da allora il dispositivo non si è riavviato.
     * Senza il numero dell'avvio si confronta l'ora dell'accensione: si sposta di molto solo se il dispositivo è ripartito.
     */
    fun killedInUse(fg: Boolean, screen: Boolean, bootThen: Int, bootNow: Int, bootAtThen: Long, bootAtNow: Long): Boolean {
        if (!fg || !screen) return false
        if (bootThen >= 0 && bootNow >= 0) return bootThen == bootNow
        return bootAtThen <= 0L || Math.abs(bootAtNow - bootAtThen) < 5 * 60_000L
    }

    fun mem(c: android.content.Context): JSONObject {
        val o = JSONObject()
        try {
            val am = c.getSystemService(android.content.Context.ACTIVITY_SERVICE) as android.app.ActivityManager
            val mi = android.app.ActivityManager.MemoryInfo(); am.getMemoryInfo(mi)
            o.put("freeMb", mi.availMem / 1048576L).put("totalMb", mi.totalMem / 1048576L).put("low", mi.lowMemory)
        } catch (_: Exception) {}
        return o
    }

    fun note(p: android.content.SharedPreferences, kind: String, info: String, t: Long = System.currentTimeMillis()) {
        try {
            val a = org.json.JSONArray(p.getString("deaths", "[]") ?: "[]")
            a.put(JSONObject().put("t", t).put("kind", kind).put("info", info.take(200)))
            while (a.length() > MAX) a.remove(0)
            p.edit().putString("deaths", a.toString()).commit() // commit: deve restare anche se il processo muore subito dopo
        } catch (_: Exception) {}
    }

    fun drain(p: android.content.SharedPreferences): String {
        val v = p.getString("deaths", "[]") ?: "[]"
        if (v != "[]") p.edit().putString("deaths", "[]").apply()
        return v
    }

    /** l'app è stata chiusa in modo pulito: niente traccia */
    fun clean(p: android.content.SharedPreferences) { p.edit().putBoolean("alive", false).apply() }

    fun start(c: android.content.Context, p: android.content.SharedPreferences) {
        ctx = c.applicationContext; pingPrefs = p
        if (started) return
        started = true
        // l'apertura precedente era ancora «viva» e non è stata chiusa dall'utente: è un'anomalia solo se è successo mentre il
        // cliente la usava (in primo piano, schermo acceso, dispositivo mai spento da allora). I dati mancanti (versione
        // precedente) valgono come «in uso»: il primo avvio dopo l'aggiornamento si comporta come prima
        if (p.getBoolean("alive", false)) {
            val inUse = killedInUse(p.getBoolean("aliveFg", true), p.getBoolean("aliveOn", true), p.getInt("aliveBoot", -1), bootCount(c), p.getLong("aliveBootAt", 0L), bootAt())
            // l'installazione di un aggiornamento chiude l'app: versione diversa da quella dell'ultimo battito = niente anomalia
            val updated = p.getInt("aliveVer", BuildConfig.VERSION_CODE) != BuildConfig.VERSION_CODE
            if (inUse && !updated) {
                val last = p.getLong("aliveT", 0L); val free = p.getLong("aliveFree", -1L); val low = p.getBoolean("aliveLow", false)
                note(p, "killed", "memoria libera all'ultimo battito: " + (if (free >= 0) "$free MB" else "?") + (if (low) " (sistema in riserva)" else ""), if (last > 0) last else System.currentTimeMillis())
            }
        }
        // schermate dell'app visibili: quando non ce n'è più nessuna l'app è in sfondo, e si scrive subito (una chiusura un
        // attimo dopo non deve sembrare «in uso»)
        try {
            (c.applicationContext as? android.app.Application)?.registerActivityLifecycleCallbacks(object : android.app.Application.ActivityLifecycleCallbacks {
                override fun onActivityStarted(a: android.app.Activity) { shown++; if (shown == 1) mark(true) }
                override fun onActivityStopped(a: android.app.Activity) { if (shown > 0) shown--; if (shown == 0) mark(false) }
                override fun onActivityCreated(a: android.app.Activity, b: Bundle?) {}
                override fun onActivityResumed(a: android.app.Activity) {}
                override fun onActivityPaused(a: android.app.Activity) {}
                override fun onActivitySaveInstanceState(a: android.app.Activity, b: Bundle) {}
                override fun onActivityDestroyed(a: android.app.Activity) {}
            })
        } catch (_: Throwable) {}
        // errori non gestiti: traccia, poi il gestore di Android fa il suo (l'app si chiude)
        val prev = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { th, e ->
            try {
                val top = e.stackTrace.firstOrNull { it.className.startsWith("com.kairos") } ?: e.stackTrace.firstOrNull()
                note(p, "crash", (e.javaClass.simpleName + (e.message?.let { ": " + it.take(80) } ?: "") + (top?.let { " @ " + it.className.substringAfterLast('.') + "." + it.methodName + ":" + it.lineNumber } ?: "")).take(200))
                p.edit().putBoolean("alive", false).commit()
            } catch (_: Throwable) {}
            prev?.uncaughtException(th, e)
        }
        ping()
    }

    /** app passata in primo piano o in sfondo: scritto subito, senza aspettare il prossimo battito */
    private fun mark(fg: Boolean) {
        val p = pingPrefs ?: return
        try { p.edit().putBoolean("aliveFg", fg).apply() } catch (_: Exception) {}
    }

    private fun ping() {
        val p = pingPrefs ?: return
        try {
            val c = ctx
            val m = c?.let { mem(it) } ?: JSONObject()
            p.edit().putBoolean("alive", true).putLong("aliveT", System.currentTimeMillis()).putLong("aliveFree", m.optLong("freeMb", -1L)).putBoolean("aliveLow", m.optBoolean("low", false))
                .putBoolean("aliveFg", shown > 0).putBoolean("aliveOn", c?.let { screenOn(it) } ?: true)
                .putInt("aliveBoot", c?.let { bootCount(it) } ?: -1).putLong("aliveBootAt", bootAt()).putInt("aliveVer", BuildConfig.VERSION_CODE).apply()
        } catch (_: Exception) {}
        h.postDelayed({ ping() }, 20_000L)
    }
}
