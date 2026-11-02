package com.kairos.player

import android.app.AlertDialog
import android.content.Intent
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.StateListDrawable
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.TypedValue
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.WebSettings
import android.widget.FrameLayout
import android.widget.HorizontalScrollView
import android.widget.LinearLayout
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
        const val RESULT = "kx_result"
        private val ACCENT = Color.parseColor("#E5202B")
    }

    /** e = guida: [titolo ora, inizio, fine (secondi), titolo dopo, inizio dopo] */
    private data class Item(val id: String, val title: String, val url: String, val alt: String, val num: Int, val group: String, val epg: org.json.JSONArray?)

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
    private var userChangedEngine = false
    private var aspect = "fit"
    private var brand = "KAIROS"
    private lateinit var prefs: PlayPrefs
    private var currentUrl = ""
    private var triedAlt = false
    private var triedFallback = false
    private var retries = 0
    private var resumeMs = 0L
    private var numBuf = ""

    private val item: Item get() = items[index]
    private val isLive: Boolean get() = kind == "live"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val handed = Handoff.engine
        Handoff.engine = null
        val payload = pending
        pending = null
        if (payload == null) { handed?.release(); finish(); return }
        try {
            val j = JSONObject(payload)
            kind = j.optString("kind", "live")
            index = j.optInt("index", 0)
            engineName = j.optString("engine", "exo")
            aspect = j.optString("aspect", "fit")
            brand = j.optString("brand", "KAIROS")
            prefs = PlayPrefs(j.optString("quality", "auto"), j.optString("buffer", "balanced"), aspect, live = kind == "live")
            resumeMs = j.optLong("start", 0L)
            val arr = j.getJSONArray("items")
            items = (0 until arr.length()).map {
                val o = arr.getJSONObject(it)
                Item(o.optString("id"), o.optString("t"), o.optString("u"), o.optString("a"), o.optInt("n"), o.optString("g"), o.optJSONArray("e"))
            }
        } catch (e: Exception) { handed?.release(); finish(); return }
        if (items.isEmpty()) { handed?.release(); finish(); return }
        index = index.coerceIn(0, items.size - 1)

        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        @Suppress("DEPRECATION") overridePendingTransition(0, 0)
        buildUi()
        hideSystemUi()
        // stesso video dell'anteprima: nessun nuovo caricamento, continua senza interruzioni
        val h = handed
        if (h != null && isLive && engineName != "vlc" && Handoff.id == item.id) {
            h.l = this
            engine = h
            adopted = h
            if (prefs.quality != "auto") h.selectQuality(prefs.quality) // rispetta la qualità scelta nelle impostazioni
            engineName = h.name
            currentUrl = h.playingUrl.ifEmpty { item.url }
            h.setAspect(aspect)
            root.addView(h.view, 0, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT, Gravity.CENTER))
        } else {
            h?.release()
            startEngine(engineName)
            playCurrent(resumeMs)
        }
        showOsd(false)

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (osd.visibility == View.VISIBLE && bar.hasFocus()) hideOsd() else finishWithResult()
            }
        })
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
        root.setOnClickListener { if (osd.visibility == View.VISIBLE) hideOsd() else showOsd(true) }

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
            layoutParams = FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP or Gravity.END).apply { setMargins(0, dp(28), dp(40), 0) }
            visibility = View.GONE
        }
        veil = View(this).apply {
            setBackgroundColor(Color.BLACK)
            alpha = 0f
            layoutParams = FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
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
        val badgeRow = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; addView(tBadge) }
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
        bPause = button("Pausa") { engine?.togglePause(); ui.postDelayed({ updatePauseLabel() }, 150) }
        if (!isLive) bar.addView(bPause)
        bar.addView(button("Audio") { menuAudio() })
        bar.addView(button("Qualità") { menuQuality() })
        bar.addView(button("Sottotitoli") { menuSubtitles() })
        bar.addView(button("Formato") { menuAspect() })
        bEngine = button("") { menuEngine() }
        bar.addView(bEngine)
        if (!isLive) {
            bar.addView(button("−10 s") { engine?.seekBy(-10_000) })
            bar.addView(button("+30 s") { engine?.seekBy(30_000) })
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
        root.addView(zapView)
        root.addView(spinner)
        root.addView(msgView)
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
    private val tickRunnable = object : Runnable {
        override fun run() { updateTime(); ui.postDelayed(this, 500) }
    }

    private fun showOsd(focusBar: Boolean) {
        if (closing) return
        updateInfo()
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
    }

    private fun engineLabel(n: String) = if (n == "vlc") "VLC" else "ExoPlayer"

    private fun updateInfo() {
        tBadge.text = if (isLive) "● IN DIRETTA" else "FILM · SERIE"
        tTitle.text = if (isLive && item.num > 0) "${item.num}  ${item.title}" else item.title
        tSub.text = listOf(item.group, engineLabel(engineName)).filter { it.isNotBlank() }.joinToString("  ·  ")
        val e = item.epg
        if (isLive && e != null && e.length() >= 3 && e.optString(0).isNotBlank()) {
            val f = java.text.SimpleDateFormat("HH:mm", Locale.ITALIAN)
            val s0 = e.optLong(1) * 1000; val e0 = e.optLong(2) * 1000
            val now = System.currentTimeMillis()
            var t = "Ora  ${f.format(java.util.Date(s0))}–${f.format(java.util.Date(e0))}   ${e.optString(0)}"
            if (e.length() >= 5 && e.optString(3).isNotBlank()) t += "\nDopo  ${f.format(java.util.Date(e.optLong(4) * 1000))}   ${e.optString(3)}"
            tEpg.text = t; tEpg.visibility = View.VISIBLE
            if (e0 > s0) { progress.visibility = View.VISIBLE; progress.progress = (((now - s0) * 1000) / (e0 - s0)).toInt().coerceIn(0, 1000) }
        } else tEpg.visibility = View.GONE
        bEngine.text = "Motore: ${engineLabel(engineName)}"
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
            tTime.text = "▲▼ cambia canale  ·  OK menu  ·  Indietro per uscire"
        } else {
            val d = e.duration(); val p = e.position()
            progress.progress = if (d > 0) ((p * 1000) / d).toInt() else 0
            tTime.text = "${fmt(p)} / ${if (d > 0) fmt(d) else "--:--"}   ·   ◀ −10 s   ▶ +30 s   ·   OK menu"
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
    private fun userAgent(): String = try {
        WebSettings.getDefaultUserAgent(this) + " KairosPlayer/" + BuildConfig.VERSION_NAME
    } catch (e: Exception) { "Mozilla/5.0 (Linux; Android) KairosPlayer/" + BuildConfig.VERSION_NAME }

    private fun startEngine(name: String) {
        engine?.let { root.removeView(it.view); it.release() }
        val e: Engine = try {
            if (name == "vlc") VlcEngine(this, this, "", prefs.copy(aspect = aspect)) else ExoEngine(this, this, userAgent(), prefs.copy(aspect = aspect))
        } catch (t: Throwable) {
            // se un motore non si avvia su questo dispositivo, usa l'altro
            if (name == "vlc") ExoEngine(this, this, userAgent(), prefs.copy(aspect = aspect)) else VlcEngine(this, this, "", prefs.copy(aspect = aspect))
        }
        engineName = e.name
        engine = e
        root.addView(e.view, 0, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT, Gravity.CENTER))
    }

    private fun playCurrent(startMs: Long) {
        triedAlt = false; triedFallback = false; retries = 0
        startUrl(item.url, startMs)
    }

    private fun startUrl(url: String, startMs: Long) {
        currentUrl = url
        showMsg(null)
        spinner.visibility = View.VISIBLE
        engine?.play(url, startMs)
    }

    /** cambio canale: numero e nome cambiano subito, il video parte quando smetti di premere (più veloce) */
    private var zapPending = false
    private val zapPlay = Runnable { zapPending = false; playCurrent(0) }
    private fun zap(delta: Int) {
        if (items.size < 2) return
        index = (index + delta + items.size) % items.size
        veil.animate().cancel()
        veil.animate().alpha(0.55f).setDuration(120).start()
        ui.removeCallbacks(zapPlay)
        zapPending = true
        ui.postDelayed(zapPlay, 280)
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
        if (i >= 0 && i != index) { index = i; veil.animate().alpha(0.55f).setDuration(120).start(); playCurrent(0); showOsd(false) } else if (n != null) toast("Canale $n non trovato")
    }

    private fun switchEngine(name: String, byUser: Boolean) {
        val pos = if (isLive) 0L else engine?.position() ?: 0L
        if (byUser) userChangedEngine = true
        startEngine(name)
        startUrl(currentUrl, pos)
        updateInfo()
    }

    /* EngineListener */
    override fun onBuffering(buffering: Boolean) { ui.post { spinner.visibility = if (buffering) View.VISIBLE else View.GONE } }

    override fun onReady() { ui.post { spinner.visibility = View.GONE; showMsg(null); retries = 0; veil.animate().alpha(0f).setDuration(260).start() } }
    override fun onFirstFrame() { ui.post { veil.animate().alpha(0f).setDuration(260).start() } }

    override fun onEnded() {
        ui.post {
            if (closing) return@post
            if (isLive) { if (retries < 3) { retries++; startUrl(currentUrl, 0) } }
            else finishWithResult()
        }
    }

    override fun onError(message: String) {
        ui.post {
            if (closing) return@post
            val pos = if (isLive) 0L else engine?.position() ?: 0L
            when {
                !triedAlt && item.alt.isNotEmpty() && currentUrl != item.alt -> { triedAlt = true; startUrl(item.alt, pos) }
                !triedFallback -> {
                    triedFallback = true
                    val other = if (engineName == "vlc") "exo" else "vlc"
                    toast("Provo con ${engineLabel(other)}…")
                    startEngine(other)
                    startUrl(currentUrl, pos)
                    updateInfo()
                }
                isLive && retries < 3 -> { retries++; ui.postDelayed({ startUrl(currentUrl, 0) }, 1500L * retries) }
                else -> { spinner.visibility = View.GONE; showMsg("Impossibile riprodurre questo contenuto\n($message)") }
            }
        }
    }

    /* ------------------------------------------------------------------ */
    /* Menu                                                                */
    /* ------------------------------------------------------------------ */
    private fun choose(title: String, list: List<Track>, empty: String, onPick: (Track) -> Unit) {
        if (list.isEmpty()) { toast(empty); return }
        val labels = list.map { it.label }.toTypedArray()
        val checked = list.indexOfFirst { it.selected }
        AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
            .setTitle(title)
            .setSingleChoiceItems(labels, checked) { d, which -> onPick(list[which]); d.dismiss(); touchOsd() }
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
        val opts = listOf(Track("exo", "ExoPlayer — più fluido (consigliato)", engineName == "exo"), Track("vlc", "VLC — legge più formati", engineName == "vlc"))
        choose("Motore di riproduzione", opts, "") { if (it.id != engineName) { switchEngine(it.id, true); toast("Motore: ${engineLabel(it.id)}") } }
    }

    /* ------------------------------------------------------------------ */
    /* Telecomando                                                         */
    /* ------------------------------------------------------------------ */
    override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
        if (closing) return true
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
            KeyEvent.KEYCODE_DPAD_LEFT, KeyEvent.KEYCODE_MEDIA_REWIND -> if (isLive) showOsd(false) else { engine?.seekBy(-10_000); showOsd(false) }
            KeyEvent.KEYCODE_DPAD_RIGHT, KeyEvent.KEYCODE_MEDIA_FAST_FORWARD -> if (isLive) showOsd(false) else { engine?.seekBy(30_000); showOsd(false) }
            KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER, KeyEvent.KEYCODE_NUMPAD_ENTER, KeyEvent.KEYCODE_MENU, KeyEvent.KEYCODE_INFO -> showOsd(true)
            KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE, KeyEvent.KEYCODE_MEDIA_PLAY, KeyEvent.KEYCODE_MEDIA_PAUSE, KeyEvent.KEYCODE_SPACE -> { engine?.togglePause(); showOsd(false) }
            KeyEvent.KEYCODE_CAPTIONS -> menuSubtitles()
            KeyEvent.KEYCODE_MEDIA_AUDIO_TRACK -> menuAudio()
            in KeyEvent.KEYCODE_0..KeyEvent.KEYCODE_9 -> {
                if (!isLive) return true
                numBuf += (keyCode - KeyEvent.KEYCODE_0).toString()
                zapView.text = numBuf; zapView.visibility = View.VISIBLE
                ui.removeCallbacks(numRunnable); ui.postDelayed(numRunnable, 1500)
            }
            else -> return super.onKeyDown(keyCode, event)
        }
        return true
    }

    /* ------------------------------------------------------------------ */
    /* Ciclo di vita                                                       */
    /* ------------------------------------------------------------------ */
    private var stoppedAt = -1L

    override fun onStop() {
        super.onStop()
        if (zapPending) { ui.removeCallbacks(zapPlay); zapPending = false; currentUrl = item.url }
        val e = engine ?: return
        stoppedAt = if (isLive) 0L else e.position()
        e.stop()
    }

    override fun onRestart() {
        super.onRestart()
        if (stoppedAt >= 0 && currentUrl.isNotEmpty()) startUrl(currentUrl, stoppedAt)
        stoppedAt = -1L
    }

    private var closing = false
    /** il player arrivato dall'anteprima: solo questo può tornare nel riquadro (gli altri appartengono a questa schermata) */
    private var adopted: ExoEngine? = null
    private fun finishWithResult() {
        if (closing) return
        closing = true
        ui.removeCallbacks(zapPlay)
        val e = engine
        val r = JSONObject()
            .put("kind", kind)
            .put("id", item.id)
            .put("pos", (e?.position() ?: 0L) / 1000)
            .put("dur", (e?.duration() ?: 0L) / 1000)
            .put("height", e?.videoHeight() ?: 0)
        if (userChangedEngine) r.put("engine", engineName)
        setResult(android.app.Activity.RESULT_OK, Intent().putExtra(RESULT, r.toString()))
        val box = Handoff.box
        val v = e?.view
        if (isLive && !zapPending && e is ExoEngine && e === adopted && e.isActive() && box != null && v != null && root.width > 0) {
            // il video torna nel riquadro dell'anteprima e continua lì
            osd.visibility = View.GONE; brandView.visibility = View.GONE; zapView.visibility = View.GONE; spinner.visibility = View.GONE; veil.alpha = 0f
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
                                root.removeView(v)
                                e.l = NoopListener
                                Handoff.id = item.id
                                Handoff.back = e
                                engine = null
                            }
                        } catch (_: Exception) {}
                        finish()
                        @Suppress("DEPRECATION") overridePendingTransition(0, 0)
                    }
                })
                start()
            }
            return
        }
        finish()
        @Suppress("DEPRECATION") overridePendingTransition(0, 0)
    }

    override fun onDestroy() {
        ui.removeCallbacksAndMessages(null)
        engine?.release()
        engine = null
        super.onDestroy()
    }
}
