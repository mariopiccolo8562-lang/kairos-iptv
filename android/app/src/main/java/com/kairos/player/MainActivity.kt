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
import android.widget.Toast
import androidx.activity.ComponentActivity
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
    private var uiOk = false

    companion object {
        private const val HOME = "file:///android_asset/www/index.html"
    }

    private val otaDir: File get() = File(filesDir, "www")
    private val otaFile: File get() = File(otaDir, "index.html")

    /** ritorno dal player nativo: posizione, durata, motore scelto, risoluzione */
    private val playerLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { res ->
        adoptBack()
        val r = res.data?.getStringExtra(PlayerActivity.RESULT) ?: return@registerForActivityResult
        js("window.kxPlayerClosed && window.kxPlayerClosed(${JSONObject.quote(r)})")
    }

    /** il video tornato dallo schermo intero continua nel riquadro dell'anteprima senza ricaricarsi */
    private fun adoptBack() {
        val b = Handoff.back ?: return
        Handoff.back = null
        val box = Handoff.box
        if (previewEngine != null && previewEngine !== b) { previewEngine?.release(); previewBox.removeAllViews() }
        previewEngine = b
        b.l = previewListener
        previewId = Handoff.id
        previewAlt = ""
        previewTriedAlt = false
        if (b.view.parent == null) { b.setOverlay(true); previewBox.addView(b.view, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)) }
        if (box != null) {
            previewBox.layoutParams = FrameLayout.LayoutParams(box[2], box[3]).apply { leftMargin = box[0]; topMargin = box[1] }
            previewBox.visibility = View.VISIBLE
        }
        // se entro pochi secondi la pagina non chiede di nuovo l'anteprima (utente uscito dalla Live), si ferma
        ui.postDelayed({ if (previewEngine === b && !previewWanted) stopPreview() }, 4000)
        previewWanted = false
    }
    @Volatile private var previewWanted = false

    private fun js(code: String) { runOnUiThread { if (::web.isInitialized) web.evaluateJavascript(code, null) } }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        prefs = getSharedPreferences("kairos", MODE_PRIVATE)

        root = FrameLayout(this).apply { setBackgroundColor(Color.BLACK) }
        web = WebView(this)
        web.setBackgroundColor(Color.BLACK)
        web.setLayerType(View.LAYER_TYPE_HARDWARE, null)
        root.addView(web, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        previewBox = FrameLayout(this).apply { setBackgroundColor(Color.BLACK); visibility = View.GONE; isFocusable = false }
        root.addView(previewBox, FrameLayout.LayoutParams(1, 1))
        setContentView(root)
        hideSystemUi()

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
        }
        web.isFocusable = true
        web.isFocusableInTouchMode = true
        web.addJavascriptInterface(Bridge(), "KairosNative")
        web.webChromeClient = WebChromeClient()
        web.webViewClient = object : WebViewClient() {
            // il player non deve mai navigare fuori dai propri file
            private fun allowed(u: String) = u.startsWith("file:///android_asset/") || u.startsWith("file://" + otaDir.absolutePath)
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean = !allowed(request.url.toString())

            @Deprecated("Deprecated in Java")
            override fun shouldOverrideUrlLoading(view: WebView, url: String): Boolean = !allowed(url)

            override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
                recreate()
                return true
            }
        }

        thread(name = "kx-clean") { try { netDir.listFiles()?.forEach { it.delete() } } catch (_: Exception) {} }
        loadUi()
        web.requestFocus()

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
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
    private var previewId = ""
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
        val e = previewEngine ?: ExoEngine(this, previewListener, userAgent(), PlayPrefs("auto", "fast", "fit", live = true), overlay = true).also {
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
        previewBox.visibility = View.GONE
    }

    /* il riquadro dell'anteprima si allarga fino a riempire lo schermo (come nelle app TV) */
    private var boxAnim: android.animation.ValueAnimator? = null
    private fun growBox(done: () -> Unit) {
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
                private var cancelled = false
                override fun onAnimationCancel(animation: android.animation.Animator) { cancelled = true }
                override fun onAnimationEnd(animation: android.animation.Animator) { if (!cancelled) done() }
            })
            start()
        }
    }

    private fun launchPlayer(noAnim: Boolean) {
        val i = Intent(this@MainActivity, PlayerActivity::class.java)
        if (noAnim) playerLauncher.launch(i, androidx.core.app.ActivityOptionsCompat.makeCustomAnimation(this, 0, 0))
        else playerLauncher.launch(i)
    }

    /** schermo intero: se l'anteprima mostra già quel canale, lo stesso video si allarga e continua */
    private fun startPlayer(payload: String) {
        val o = try { JSONObject(payload) } catch (e: Exception) { null }
        val e = previewEngine
        var handed = false
        try {
            if (o != null && o.optString("kind") == "live" && o.optString("engine") != "vlc" && e != null && previewBox.visibility == View.VISIBLE && e.isActive()) {
                val it = o.optJSONArray("items")?.optJSONObject(o.optInt("index"))
                if (it != null && it.optString("id") == previewId) {
                    handed = true
                    growBox {
                        try {
                            previewBox.removeView(e.view)
                            e.setOverlay(false)
                            e.l = NoopListener
                            Handoff.engine = e
                            Handoff.id = previewId
                            previewEngine = null
                            previewId = ""
                            launchPlayer(noAnim = true)
                        } catch (x: Exception) { stopPreview(); launchPlayer(false) }
                    }
                }
            }
        } catch (x: Exception) { handed = false }
        if (!handed) { Handoff.box = null; stopPreview(); launchPlayer(false) } // uscendo, nessun riquadro in cui tornare
    }

    private fun userAgent(): String = try {
        WebSettings.getDefaultUserAgent(this) + " KairosPlayer/" + BuildConfig.VERSION_NAME
    } catch (e: Exception) { "Mozilla/5.0 (Linux; Android) KairosPlayer/" + BuildConfig.VERSION_NAME }

    /* ------------------------------------------------------------------ */
    /* Aggiornamento APK                                                   */
    /* ------------------------------------------------------------------ */
    private val apkBusy = java.util.concurrent.atomic.AtomicBoolean(false)

    private fun downloadAndInstall(url: String) {
        if (!apkBusy.compareAndSet(false, true)) return // un solo download alla volta
        thread(name = "kx-apk") {
            try {
                val dir = if (Build.VERSION.SDK_INT >= 24) File(cacheDir, "apk") else (externalCacheDir ?: cacheDir)
                dir.mkdirs()
                val out = File(dir, "kairos-update.apk")
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
                        conn.disconnect(); target = URL(target, loc); hops++
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
                            if (total > 0) {
                                val p = ((done * 100) / total).toInt().coerceAtMost(99)
                                if (p != last) { last = p; js("window.kxApkCb && kxApkCb($p)") }
                            }
                        }
                    }
                }
                conn.disconnect()
                // deve essere davvero un APK (un link sbagliato spesso scarica una pagina web)
                val head = ByteArray(2)
                java.io.FileInputStream(out).use { it.read(head) }
                if (out.length() < 500_000 || head[0] != 'P'.code.toByte() || head[1] != 'K'.code.toByte()) {
                    out.delete(); throw Exception("il link non porta a un file APK")
                }
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
    @Volatile private var speedRunning = false

    private fun runSpeedTest() {
        if (speedRunning) return
        speedRunning = true
        thread(name = "kx-speed") {
            fun send(o: JSONObject) = js("window.kxSpeedCb && kxSpeedCb(${JSONObject.quote(o.toString())})")
            val ua = userAgent()
            fun open(u: String, timeout: Int): HttpURLConnection = (URL(u).openConnection() as HttpURLConnection).apply {
                connectTimeout = timeout; readTimeout = timeout; useCaches = false
                setRequestProperty("User-Agent", ua)
                setRequestProperty("Accept-Encoding", "identity")
            }
            try {
                // latenza: la migliore di 4 richieste vuote (la prima apre la connessione)
                var best = Double.MAX_VALUE
                repeat(4) {
                    val t0 = System.nanoTime()
                    val c = open("https://speed.cloudflare.com/__down?bytes=0", 8000)
                    c.inputStream.use { it.readBytes() }
                    c.disconnect()
                    best = minOf(best, (System.nanoTime() - t0) / 1e6)
                }
                val ping = best
                send(JSONObject().put("phase", "download").put("ping", ping).put("mbps", 0))
                // download: 4 connessioni in parallelo per 8 secondi (misura più vicina alla velocità reale)
                val total = java.util.concurrent.atomic.AtomicLong(0)
                val stop = java.util.concurrent.atomic.AtomicBoolean(false)
                val errors = java.util.concurrent.atomic.AtomicInteger(0)
                val start = System.nanoTime()
                val workers = (1..4).map {
                    thread(name = "kx-speed-$it") {
                        val buf = ByteArray(128 * 1024)
                        while (!stop.get()) {
                            try {
                                val c = open("https://speed.cloudflare.com/__down?bytes=25000000", 10_000)
                                c.inputStream.use { input ->
                                    while (!stop.get()) {
                                        val n = input.read(buf)
                                        if (n < 0) break
                                        total.addAndGet(n.toLong())
                                    }
                                }
                                c.disconnect()
                            } catch (e: Exception) {
                                if (errors.incrementAndGet() > 6) break
                                Thread.sleep(200)
                            }
                        }
                    }
                }
                while (true) {
                    Thread.sleep(250)
                    val el = (System.nanoTime() - start) / 1e9
                    val mbps = total.get() * 8.0 / el / 1e6
                    if (el >= 8.0 || errors.get() > 6) { stop.set(true); break }
                    send(JSONObject().put("phase", "download").put("ping", ping).put("mbps", mbps).put("p", (el / 8.0 * 100).toInt()))
                }
                workers.forEach { it.join(3000) }
                val sec = (System.nanoTime() - start) / 1e9
                if (total.get() == 0L) throw Exception("nessun dato ricevuto")
                send(JSONObject().put("done", true).put("ping", ping).put("mbps", total.get() * 8.0 / sec / 1e6))
            } catch (e: Exception) {
                send(JSONObject().put("error", e.message ?: e.javaClass.simpleName))
            } finally {
                speedRunning = false
            }
        }
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

    /** Tasti canale +/- del telecomando → zapping nel player */
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        val key = when (event.keyCode) {
            KeyEvent.KEYCODE_CHANNEL_UP -> "ChannelUp"
            KeyEvent.KEYCODE_CHANNEL_DOWN -> "ChannelDown"
            KeyEvent.KEYCODE_MENU -> "ContextMenu"
            else -> null
        }
        if (key != null) {
            if (event.action == KeyEvent.ACTION_DOWN) {
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

    override fun onPause() {
        stopPreview()
        web.onPause()
        super.onPause()
    }

    override fun onResume() {
        super.onResume()
        web.onResume()
        web.requestFocus()
        js("window.kxResume && kxResume()")
        // tornando dalle impostazioni "installa app sconosciute"
        val apk = pendingApk
        if (apk != null && (Build.VERSION.SDK_INT < 26 || packageManager.canRequestPackageInstalls())) { pendingApk = null; launchInstaller(apk) }
    }

    override fun onDestroy() {
        ui.removeCallbacksAndMessages(null)
        previewEngine?.release()
        previewEngine = null
        httpPool.shutdownNow()
        web.destroy()
        super.onDestroy()
    }

    /** Funzioni esposte al player come window.KairosNative */
    inner class Bridge {
        @JavascriptInterface fun version(): String = BuildConfig.VERSION_NAME
        @JavascriptInterface fun versionCode(): Int = BuildConfig.VERSION_CODE
        @JavascriptInterface fun model(): String = "${Build.MANUFACTURER} ${Build.MODEL}".trim().take(70)
        @JavascriptInterface fun exit() { runOnUiThread { finish() } }

        /** l'interfaccia è partita correttamente */
        @JavascriptInterface fun uiReady() { uiOk = true; prefs.edit().putInt("ui_fail", 0).apply() }
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
        @JavascriptInterface fun canInstall(): Boolean = Build.VERSION.SDK_INT < 26 || packageManager.canRequestPackageInstalls()

        /** Avvia il player nativo (ExoPlayer / VLC) */
        @JavascriptInterface fun play(payload: String) {
            PlayerActivity.pending = payload
            runOnUiThread { startPlayer(payload) }
        }

        @JavascriptInterface fun preview(json: String) { runOnUiThread { showPreview(json) } }
        @JavascriptInterface fun previewStop() { runOnUiThread { previewWanted = false; stopPreview() } }
        @JavascriptInterface fun installApk(url: String) { downloadAndInstall(url) }
        @JavascriptInterface fun speedTest() { runSpeedTest() }

        /** scarica un indirizzo in un file locale; risposta in window.kxFileCb(id, status, path, error) */
        @JavascriptInterface fun httpFile(id: String, url: String, ua: String) { fetchToFile(id, url, ua) }
        /** cancella un file scaricato con httpFile */
        @JavascriptInterface fun dropFile(path: String) {
            try { val f = File(Uri.parse(path).path ?: return); if (f.absolutePath.startsWith(netDir.absolutePath)) f.delete() } catch (_: Exception) {}
        }
        /** cache della libreria (canali, film, serie) per un avvio istantaneo */
        @JavascriptInterface fun cachePut(key: String, data: String) {
            try { val f = libFile(key); val t = File(f.path + ".tmp"); t.writeText(data, Charsets.UTF_8); t.renameTo(f) } catch (_: Exception) {}
        }
        @JavascriptInterface fun cachePath(key: String): String { val f = libFile(key); return if (f.exists()) "file://" + f.absolutePath else "" }
        /** guida TV completa: urls = sorgenti XMLTV, want = {ids:[tvg-id], names:[nomi normalizzati]} */
        @JavascriptInterface fun epgBuild(id: String, urls: String, want: String, hours: Int) { buildEpg(id, urls, want, hours.coerceIn(6, 72)) }
        @JavascriptInterface fun epgPath(): String = if (epgFile.exists()) "file://" + epgFile.absolutePath else ""
        @JavascriptInterface fun cacheClear() { try { libDir.deleteRecursively() } catch (_: Exception) {} }

        /** Richiesta HTTP fatta dall'app (senza limiti CORS). Risposta in window.kxHttpCb(id, status, body). */
        @JavascriptInterface fun http(id: String, method: String, url: String, body: String, ua: String) {
            thread(name = "kx-http") {
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
                } catch (e: Exception) {
                    status = -1
                    text = e.javaClass.simpleName + (e.message?.let { ": $it" } ?: "")
                }
                val js = "window.kxHttpCb && window.kxHttpCb(${JSONObject.quote(id)}, $status, ${JSONObject.quote(text)})"
                runOnUiThread { if (::web.isInitialized) web.evaluateJavascript(js, null) }
            }
        }
    }
}
