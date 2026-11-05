package com.kairos.player

import android.app.AlertDialog
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
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
import android.widget.ProgressBar
import android.widget.TextView
import androidx.activity.ComponentActivity
import org.json.JSONObject

/**
 * Multi-schermo: 2 o 4 canali in diretta insieme. Si sente l'audio solo del riquadro selezionato.
 * Frecce = cambia riquadro · OK = scegli il canale del riquadro (o guardalo a schermo intero) · Indietro = esci.
 * Ogni riquadro usa una connessione dell'abbonamento; dove c'è, si usa la versione più leggera del canale.
 */
class MultiActivity : ComponentActivity() {
    companion object {
        @Volatile var pending: JSONObject? = null
        /** multi-schermo sullo schermo (l'interfaccia sotto sveglia il battito per il pannello) */
        @Volatile var open = false
        const val RESULT = "kx_multi"
    }

    private data class Ch(val id: String, val title: String, val url: String, val alt: String, val num: Int)

    private inner class Tile(val idx: Int) {
        val box = FrameLayout(this@MultiActivity)
        val label = TextView(this@MultiActivity)
        val msg = TextView(this@MultiActivity)
        val spin = ProgressBar(this@MultiActivity)
        var engine: ExoEngine? = null
        var ch: Ch? = null
        var triedAlt = false
        var gen = 0
    }

    private val ui = Handler(Looper.getMainLooper())
    private lateinit var root: FrameLayout
    private val tiles = ArrayList<Tile>()
    private var chans: List<Ch> = emptyList()
    private var layoutN = 2
    private var focusIdx = 0
    private var quality = "auto"
    private var closing = false
    private var dialog: AlertDialog? = null

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()
    private val ua: String by lazy {
        try { WebSettings.getDefaultUserAgent(this) + " KairosPlayer/" + BuildConfig.VERSION_NAME } catch (e: Exception) { "Mozilla/5.0 (Linux; Android) KairosPlayer/" + BuildConfig.VERSION_NAME }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val j = pending; pending = null
        if (j == null) { finish(); return }
        try {
            layoutN = if (j.optInt("layout", 2) >= 4) 4 else 2
            quality = j.optString("quality", if (layoutN == 4) "480" else "720")
            val a = j.getJSONArray("chans")
            chans = (0 until a.length()).map { val o = a.getJSONObject(it); Ch(o.optString("id"), o.optString("t"), o.optString("u"), o.optString("a"), o.optInt("n")) }
        } catch (e: Exception) { finish(); return }
        if (chans.isEmpty()) { finish(); return }
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        root = FrameLayout(this).apply { setBackgroundColor(Color.BLACK) }
        setContentView(root)
        for (i in 0 until layoutN) tiles.add(buildTile(i))
        root.addView(TextView(this).apply {
            text = "◀ ▶ ▲ ▼ cambia riquadro · OK sceglie il canale · Indietro esce"
            setTextColor(Color.argb(150, 255, 255, 255)); setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
            layoutParams = FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL).apply { bottomMargin = dp(8) }
        })
        root.post { placeTiles() }
        val start = j.optJSONArray("start")
        for (i in 0 until layoutN) {
            val id = start?.optString(i) ?: ""
            val c = chans.firstOrNull { it.id == id } ?: chans.getOrNull(i)
            if (c != null) ui.postDelayed({ if (!closing) playIn(tiles[i], c) }, 250L * i) // avvii scaglionati: meno carico tutto insieme
        }
        setFocusTile(0)
    }

    private fun buildTile(i: Int): Tile {
        val t = Tile(i)
        t.box.setBackgroundColor(Color.rgb(14, 14, 18))
        t.label.apply {
            setTextColor(Color.WHITE); setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f); typeface = Typeface.DEFAULT_BOLD
            setPadding(dp(10), dp(4), dp(10), dp(4)); setShadowLayer(4f, 0f, 1f, Color.BLACK)
            background = GradientDrawable().apply { cornerRadius = dp(6).toFloat(); setColor(Color.argb(150, 0, 0, 0)) }
            layoutParams = FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP or Gravity.START).apply { setMargins(dp(8), dp(8), 0, 0) }
        }
        t.msg.apply {
            setTextColor(Color.argb(220, 255, 255, 255)); setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f); gravity = Gravity.CENTER; visibility = View.GONE
            layoutParams = FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER)
        }
        t.spin.layoutParams = FrameLayout.LayoutParams(dp(36), dp(36), Gravity.CENTER)
        t.box.addView(t.msg); t.box.addView(t.spin); t.box.addView(t.label)
        root.addView(t.box)
        return t
    }

    /** 2 riquadri affiancati (16:9) oppure una griglia 2 × 2 */
    private fun placeTiles() {
        val W = root.width; val H = root.height
        if (W <= 0 || H <= 0) return
        val gap = dp(6)
        if (layoutN == 2) {
            val w = (W - gap * 3) / 2; val h = w * 9 / 16; val top = (H - h) / 2
            tiles.forEachIndexed { i, t -> t.box.layoutParams = FrameLayout.LayoutParams(w, h).apply { leftMargin = gap + i * (w + gap); topMargin = top } }
        } else {
            val w = (W - gap * 3) / 2; val h = (H - gap * 3) / 2
            tiles.forEachIndexed { i, t -> t.box.layoutParams = FrameLayout.LayoutParams(w, h).apply { leftMargin = gap + (i % 2) * (w + gap); topMargin = gap + (i / 2) * (h + gap) } }
        }
        setFocusTile(focusIdx)
    }

    private fun setFocusTile(i: Int) {
        focusIdx = i.coerceIn(0, tiles.size - 1)
        tiles.forEachIndexed { k, t ->
            t.box.foreground = if (k == focusIdx) GradientDrawable().apply { setStroke(dp(3), Color.WHITE); cornerRadius = dp(4).toFloat() } else null
            try { t.engine?.setVolume(if (k == focusIdx) 1f else 0f) } catch (_: Throwable) {}
            t.label.alpha = if (k == focusIdx) 1f else 0.75f
        }
    }

    private fun playIn(t: Tile, c: Ch) {
        val g = ++t.gen
        t.ch = c; t.triedAlt = false
        t.label.text = (if (c.num > 0) "${c.num}  " else "") + c.title
        t.msg.visibility = View.GONE; t.spin.visibility = View.VISIBLE
        t.engine?.let { t.box.removeView(it.view); it.release() }
        t.engine = null
        val l = object : EngineListener {
            override fun onBuffering(buffering: Boolean) { ui.post { if (g == t.gen && !closing) t.spin.visibility = if (buffering) View.VISIBLE else View.GONE } }
            override fun onReady() { ui.post { if (g == t.gen && !closing) { t.spin.visibility = View.GONE; t.msg.visibility = View.GONE } } }
            override fun onEnded() { ui.post { if (g == t.gen && !closing) t.engine?.play(t.ch?.url ?: return@post, 0) } }
            override fun onError(message: String) {
                ui.post {
                    if (g != t.gen || closing) return@post
                    val ch = t.ch ?: return@post
                    if (!t.triedAlt && ch.alt.isNotEmpty()) { t.triedAlt = true; t.engine?.play(ch.alt, 0); return@post }
                    t.spin.visibility = View.GONE
                    t.msg.text = "Canale non disponibile\n(premi OK per cambiarlo)"; t.msg.visibility = View.VISIBLE
                }
            }
        }
        val e = try { ExoEngine(this, l, ua, PlayPrefs(quality, "balanced", "fit", live = true, hw = "auto")) } catch (x: Throwable) { null }
        if (e == null) { t.spin.visibility = View.GONE; t.msg.text = "Lettore non disponibile"; t.msg.visibility = View.VISIBLE; return }
        t.engine = e
        t.box.addView(e.view, 0, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        e.setVolume(if (t.idx == focusIdx) 1f else 0f)
        e.play(c.url, 0)
    }

    private fun pickChannel() {
        val t = tiles.getOrNull(focusIdx) ?: return
        if (closing || isFinishing) return
        val cur = t.ch
        val labels = ArrayList<String>()
        if (cur != null) labels.add("⛶  Guarda «${cur.title}» a schermo intero")
        chans.forEach { labels.add((if (it.num > 0) "${it.num}  " else "") + it.title) }
        val off = if (cur != null) 1 else 0
        try { dialog?.dismiss() } catch (_: Exception) {}
        dialog = AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
            .setTitle("Riquadro ${focusIdx + 1}: scegli il canale")
            .setItems(labels.toTypedArray()) { d, which ->
                d.dismiss()
                if (closing) return@setItems
                if (cur != null && which == 0) { finishWith(cur.id); return@setItems }
                chans.getOrNull(which - off)?.let { playIn(t, it) }
            }
            .setNegativeButton("Chiudi", null)
            .show()
        // la lista parte dal canale in onda nel riquadro
        if (cur != null) { val i = chans.indexOf(cur); if (i >= 0) try { dialog?.listView?.setSelection(i + off) } catch (_: Throwable) {} }
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
        if (closing) return true
        val cols = 2
        when (keyCode) {
            KeyEvent.KEYCODE_DPAD_LEFT -> { if (focusIdx % cols == 1) setFocusTile(focusIdx - 1); return true }
            KeyEvent.KEYCODE_DPAD_RIGHT -> { if (focusIdx % cols == 0 && focusIdx + 1 < tiles.size) setFocusTile(focusIdx + 1); return true }
            KeyEvent.KEYCODE_DPAD_UP -> { if (focusIdx >= cols) setFocusTile(focusIdx - cols); return true }
            KeyEvent.KEYCODE_DPAD_DOWN -> { if (focusIdx + cols < tiles.size) setFocusTile(focusIdx + cols); return true }
            KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER, KeyEvent.KEYCODE_NUMPAD_ENTER, KeyEvent.KEYCODE_MENU -> { pickChannel(); return true }
            KeyEvent.KEYCODE_BACK, KeyEvent.KEYCODE_ESCAPE -> { finishWith(""); return true }
        }
        return super.onKeyDown(keyCode, event)
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() { finishWith("") }

    private fun finishWith(fullId: String) {
        if (closing) return
        closing = true
        releaseAll()
        setResult(android.app.Activity.RESULT_OK, Intent().putExtra(RESULT, JSONObject().put("full", fullId).toString()))
        finish()
    }

    private fun releaseAll() {
        ui.removeCallbacksAndMessages(null)
        try { dialog?.dismiss() } catch (_: Exception) {}
        dialog = null
        for (t in tiles) { t.gen++; try { t.engine?.release() } catch (_: Throwable) {}; t.engine = null }
    }

    // fuori dallo schermo (tasto Home): niente audio né connessioni aperte in sottofondo
    override fun onStart() { super.onStart(); open = true }
    override fun onStop() { open = false; super.onStop(); if (!closing) { closing = true; releaseAll(); finish() } }
    override fun onDestroy() { open = false; closing = true; releaseAll(); super.onDestroy() }
}
