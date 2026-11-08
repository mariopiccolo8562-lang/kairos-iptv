package com.kairos.player

import android.app.Activity
import android.content.SharedPreferences
import android.content.res.ColorStateList
import android.graphics.BlurMaskFilter
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Shader
import android.graphics.drawable.Animatable
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ProgressBar

/**
 * Splash nativo per le chiavette da 1 GB (stessa soglia della classe D dell'interfaccia: memoria totale ≤ 1200 MB).
 * Copre la WebView dal primo fotogramma (anche il suo schermo nero d'avvio) finché l'interfaccia non ha disegnato la Home.
 * - logo K: AnimatedVectorDrawable con le stesse forme e colori dell'SVG dell'interfaccia; da API 25 l'animazione gira sul
 *   RenderThread (fluida anche mentre il thread dell'interfaccia o la WebView lavorano); sotto API 25 logo fermo
 * - sotto, il marchio con il carattere vettoriale dell'interfaccia (marchio e colore dell'ultima apertura, predefinito KAIROS)
 * - barra sottile indeterminata
 * Mai bloccati: via con splashDone() dell'interfaccia; se l'interfaccia è vecchia (non ha chiesto nativeSplash) 1,5 s dopo
 * il primo uiReady; all'errore della pagina; comunque dopo un tetto di 12 s (la pagina lo sa da window.kxSplashGone).
 */
class SplashOverlay(private val act: Activity, private val root: ViewGroup, private val prefs: SharedPreferences, private val onGone: () -> Unit) {
    companion object {
        const val MAX_MS = 12_000L
        /** stessa soglia di devClass() dell'interfaccia (memInfo.totalMb ≤ 1200) */
        fun wanted(a: Activity): Boolean = try {
            val am = a.getSystemService(android.content.Context.ACTIVITY_SERVICE) as android.app.ActivityManager
            val mi = android.app.ActivityManager.MemoryInfo(); am.getMemoryInfo(mi)
            val mb = mi.totalMem / 1048576L
            mb in 1..1200
        } catch (_: Throwable) { false }
    }

    private var view: View? = null
    private var logo: ImageView? = null
    @Volatile var shown = false
        private set
    /** l'interfaccia sa del splash nativo (l'ha chiesto con nativeSplash): lo toglie lei con splashDone */
    @Volatile var asked = false
    private var readySeen = false
    private val capRun = Runnable { hide(true) }

    fun show() {
        if (view != null) return
        val dm = act.resources.displayMetrics
        val H = maxOf(1, dm.heightPixels).toFloat(); val W = maxOf(1, dm.widthPixels).toFloat()
        val accent = try { Color.parseColor(prefs.getString("sp_accent", "") ?: "") } catch (_: Exception) { Color.parseColor("#e5202b") }
        val brand = (prefs.getString("sp_brand", "") ?: "").ifBlank { "KAIROS" }
        val box = FrameLayout(act).apply { setBackgroundColor(0xFF030305.toInt()); isFocusable = false; isClickable = false; clipChildren = false; importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO }
        val col = LinearLayout(act).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL; clipChildren = false; clipToPadding = false }
        // logo (28% dell'altezza, come lo splash dell'interfaccia) con il bagliore rosso dietro (gradiente fermo, niente costo)
        val ls = (0.28f * H).toInt(); val gs = (0.6f * minOf(W, H)).toInt()
        val holder = FrameLayout(act).apply { clipChildren = false }
        val glow = View(act).apply {
            background = GradientDrawable().apply {
                gradientType = GradientDrawable.RADIAL_GRADIENT; gradientRadius = gs * 0.44f
                colors = intArrayOf(Color.argb(115, Color.red(accent), Color.green(accent), Color.blue(accent)), Color.argb(0, Color.red(accent), Color.green(accent), Color.blue(accent)))
            }
        }
        holder.addView(glow, FrameLayout.LayoutParams(gs, gs, Gravity.CENTER))
        val anim = Build.VERSION.SDK_INT >= 25
        val iv = ImageView(act).apply { setImageResource(if (anim) R.drawable.kx_logo_anim else R.drawable.kx_logo); scaleType = ImageView.ScaleType.FIT_CENTER }
        holder.addView(iv, FrameLayout.LayoutParams(ls, ls, Gravity.CENTER))
        col.addView(holder, LinearLayout.LayoutParams(gs, gs).apply { topMargin = -(gs - ls) / 2 - (0.04f * H).toInt(); bottomMargin = -(gs - ls) / 2 })
        // marchio
        val word = KxWordView(act, brand, accent)
        col.addView(word, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, (0.105f * H).toInt()).apply { topMargin = (0.036f * H).toInt() })
        // barra indeterminata (da API 25 anche lei sul RenderThread)
        val bar = ProgressBar(act, null, android.R.attr.progressBarStyleHorizontal).apply {
            isIndeterminate = true; indeterminateTintList = ColorStateList.valueOf(accent); isFocusable = false
        }
        col.addView(bar, LinearLayout.LayoutParams((0.21f * W).toInt(), maxOf(3, (0.0045f * H).toInt())).apply { topMargin = (0.07f * H).toInt() })
        box.addView(col, FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER))
        root.addView(box, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        view = box; logo = iv; shown = true
        if (anim) iv.post { try { (iv.drawable as? Animatable)?.start() } catch (_: Throwable) {} }
        root.postDelayed(capRun, MAX_MS)
    }

    /** primo uiReady(): un'interfaccia che non sa del splash nativo non lo toglierà mai → via dopo 1,5 s */
    fun onUiReady() {
        if (readySeen) return
        readySeen = true
        if (shown && !asked) root.postDelayed({ if (!asked) hide(true) }, 1500)
    }

    /** [notify]: tolto dall'app (non dall'interfaccia) → la pagina lo sa e mostra il suo splash */
    fun hide(notify: Boolean) {
        val v = view ?: return
        view = null; shown = false
        root.removeCallbacks(capRun)
        try { (logo?.drawable as? Animatable)?.stop() } catch (_: Throwable) {}
        logo = null
        v.animate().cancel()
        v.animate().alpha(0f).setDuration(260).withEndAction { try { (v.parent as? ViewGroup)?.removeView(v) } catch (_: Throwable) {} }.start()
        if (notify) onGone()
    }
}

/** marchio con il carattere vettoriale dell'interfaccia (kxWord): tratti cromati con bagliore del colore del tema; disegnato una volta */
class KxWordView(ctx: android.content.Context, text: String, private val accent: Int) : View(ctx) {
    private class G(val w: Float, val lines: Array<FloatArray>)
    private companion object {
        const val SP = 3.1f
        val KXG: Map<Char, G> = mapOf(
        '0' to G(7.0f, arrayOf(floatArrayOf(1.6f, 0.0f, 5.4f, 0.0f, 7.0f, 1.6f, 7.0f, 8.4f, 5.4f, 10.0f, 1.6f, 10.0f, 0.0f, 8.4f, 0.0f, 1.6f, 1.6f, 0.0f), floatArrayOf(2.2f, 7.4f, 4.8f, 2.6f))),
        '1' to G(3.4f, arrayOf(floatArrayOf(0.0f, 2.2f, 2.2f, 0.0f, 2.2f, 10.0f))),
        '2' to G(7.0f, arrayOf(floatArrayOf(0.0f, 1.6f, 1.6f, 0.0f, 5.4f, 0.0f, 7.0f, 1.6f, 7.0f, 3.6f, 0.0f, 10.0f, 7.0f, 10.0f))),
        '3' to G(7.0f, arrayOf(floatArrayOf(0.0f, 1.6f, 1.6f, 0.0f, 5.4f, 0.0f, 7.0f, 1.6f, 7.0f, 3.4f, 5.4f, 5.0f, 2.4f, 5.0f), floatArrayOf(5.4f, 5.0f, 7.0f, 6.6f, 7.0f, 8.4f, 5.4f, 10.0f, 1.6f, 10.0f, 0.0f, 8.4f))),
        '4' to G(7.0f, arrayOf(floatArrayOf(5.4f, 10.0f, 5.4f, 0.0f, 0.0f, 7.0f, 7.0f, 7.0f))),
        '5' to G(7.0f, arrayOf(floatArrayOf(7.0f, 0.0f, 0.0f, 0.0f, 0.0f, 4.6f, 5.4f, 4.6f, 7.0f, 6.2f, 7.0f, 8.4f, 5.4f, 10.0f, 1.6f, 10.0f, 0.0f, 8.4f))),
        '6' to G(7.0f, arrayOf(floatArrayOf(6.4f, 0.0f, 1.6f, 0.0f, 0.0f, 1.6f, 0.0f, 8.4f, 1.6f, 10.0f, 5.4f, 10.0f, 7.0f, 8.4f, 7.0f, 6.6f, 5.4f, 5.0f, 0.0f, 5.0f))),
        '7' to G(7.0f, arrayOf(floatArrayOf(0.0f, 0.0f, 7.0f, 0.0f, 2.4f, 10.0f))),
        '8' to G(7.0f, arrayOf(floatArrayOf(1.6f, 5.0f, 0.0f, 3.4f, 0.0f, 1.6f, 1.6f, 0.0f, 5.4f, 0.0f, 7.0f, 1.6f, 7.0f, 3.4f, 5.4f, 5.0f, 1.6f, 5.0f, 0.0f, 6.6f, 0.0f, 8.4f, 1.6f, 10.0f, 5.4f, 10.0f, 7.0f, 8.4f, 7.0f, 6.6f, 5.4f, 5.0f))),
        '9' to G(7.0f, arrayOf(floatArrayOf(0.6f, 10.0f, 5.4f, 10.0f, 7.0f, 8.4f, 7.0f, 1.6f, 5.4f, 0.0f, 1.6f, 0.0f, 0.0f, 1.6f, 0.0f, 3.4f, 1.6f, 5.0f, 7.0f, 5.0f))),
        'A' to G(7.0f, arrayOf(floatArrayOf(0.0f, 10.0f, 3.5f, 0.0f, 7.0f, 10.0f), floatArrayOf(2.25f, 6.9f, 4.75f, 6.9f))),
        'B' to G(7.0f, arrayOf(floatArrayOf(0.0f, 5.0f, 0.0f, 0.0f, 5.2f, 0.0f, 6.6f, 1.4f, 6.6f, 3.6f, 5.2f, 5.0f, 0.0f, 5.0f), floatArrayOf(0.0f, 5.0f, 0.0f, 10.0f, 5.6f, 10.0f, 7.0f, 8.6f, 7.0f, 6.4f, 5.6f, 5.0f))),
        'C' to G(7.0f, arrayOf(floatArrayOf(7.0f, 1.6f, 5.4f, 0.0f, 1.6f, 0.0f, 0.0f, 1.6f, 0.0f, 8.4f, 1.6f, 10.0f, 5.4f, 10.0f, 7.0f, 8.4f))),
        'D' to G(7.0f, arrayOf(floatArrayOf(0.0f, 0.0f, 0.0f, 10.0f, 5.0f, 10.0f, 7.0f, 8.0f, 7.0f, 2.0f, 5.0f, 0.0f, 0.0f, 0.0f))),
        'E' to G(6.6f, arrayOf(floatArrayOf(6.6f, 0.0f, 0.0f, 0.0f, 0.0f, 10.0f, 6.6f, 10.0f), floatArrayOf(0.0f, 5.0f, 4.8f, 5.0f))),
        'F' to G(6.6f, arrayOf(floatArrayOf(6.6f, 0.0f, 0.0f, 0.0f, 0.0f, 10.0f), floatArrayOf(0.0f, 5.0f, 4.8f, 5.0f))),
        'G' to G(7.0f, arrayOf(floatArrayOf(7.0f, 1.6f, 5.4f, 0.0f, 1.6f, 0.0f, 0.0f, 1.6f, 0.0f, 8.4f, 1.6f, 10.0f, 5.4f, 10.0f, 7.0f, 8.4f, 7.0f, 5.4f, 3.8f, 5.4f))),
        'H' to G(7.0f, arrayOf(floatArrayOf(0.0f, 0.0f, 0.0f, 10.0f), floatArrayOf(7.0f, 0.0f, 7.0f, 10.0f), floatArrayOf(0.0f, 5.0f, 7.0f, 5.0f))),
        'I' to G(0.0f, arrayOf(floatArrayOf(0.0f, 0.0f, 0.0f, 10.0f))),
        'J' to G(7.0f, arrayOf(floatArrayOf(7.0f, 0.0f, 7.0f, 8.4f, 5.4f, 10.0f, 1.6f, 10.0f, 0.0f, 8.4f, 0.0f, 7.2f))),
        'K' to G(6.8f, arrayOf(floatArrayOf(0.0f, 0.0f, 0.0f, 10.0f), floatArrayOf(6.8f, 0.0f, 2.5f, 5.0f, 6.8f, 10.0f))),
        'L' to G(6.4f, arrayOf(floatArrayOf(0.0f, 0.0f, 0.0f, 10.0f, 6.4f, 10.0f))),
        'M' to G(8.4f, arrayOf(floatArrayOf(0.0f, 10.0f, 0.0f, 0.0f, 4.2f, 5.2f, 8.4f, 0.0f, 8.4f, 10.0f))),
        'N' to G(7.0f, arrayOf(floatArrayOf(0.0f, 10.0f, 0.0f, 0.0f, 7.0f, 10.0f, 7.0f, 0.0f))),
        'O' to G(7.0f, arrayOf(floatArrayOf(1.6f, 0.0f, 5.4f, 0.0f, 7.0f, 1.6f, 7.0f, 8.4f, 5.4f, 10.0f, 1.6f, 10.0f, 0.0f, 8.4f, 0.0f, 1.6f, 1.6f, 0.0f))),
        'P' to G(7.0f, arrayOf(floatArrayOf(0.0f, 10.0f, 0.0f, 0.0f, 5.4f, 0.0f, 7.0f, 1.6f, 7.0f, 3.8f, 5.4f, 5.4f, 0.0f, 5.4f))),
        'Q' to G(7.0f, arrayOf(floatArrayOf(1.6f, 0.0f, 5.4f, 0.0f, 7.0f, 1.6f, 7.0f, 8.4f, 5.4f, 10.0f, 1.6f, 10.0f, 0.0f, 8.4f, 0.0f, 1.6f, 1.6f, 0.0f), floatArrayOf(4.4f, 7.4f, 7.3f, 10.3f))),
        'R' to G(7.0f, arrayOf(floatArrayOf(0.0f, 10.0f, 0.0f, 0.0f, 5.4f, 0.0f, 7.0f, 1.6f, 7.0f, 3.8f, 5.4f, 5.4f, 0.0f, 5.4f), floatArrayOf(3.9f, 5.4f, 7.0f, 8.6f, 7.0f, 10.0f))),
        'S' to G(7.0f, arrayOf(floatArrayOf(7.0f, 1.6f, 5.4f, 0.0f, 1.6f, 0.0f, 0.0f, 1.6f, 0.0f, 3.4f, 1.6f, 5.0f, 5.4f, 5.0f, 7.0f, 6.6f, 7.0f, 8.4f, 5.4f, 10.0f, 1.6f, 10.0f, 0.0f, 8.4f))),
        'T' to G(7.0f, arrayOf(floatArrayOf(0.0f, 0.0f, 7.0f, 0.0f), floatArrayOf(3.5f, 0.0f, 3.5f, 10.0f))),
        'U' to G(7.0f, arrayOf(floatArrayOf(0.0f, 0.0f, 0.0f, 8.4f, 1.6f, 10.0f, 5.4f, 10.0f, 7.0f, 8.4f, 7.0f, 0.0f))),
        'V' to G(7.4f, arrayOf(floatArrayOf(0.0f, 0.0f, 3.7f, 10.0f, 7.4f, 0.0f))),
        'W' to G(9.0f, arrayOf(floatArrayOf(0.0f, 0.0f, 1.9f, 10.0f, 4.5f, 3.8f, 7.1f, 10.0f, 9.0f, 0.0f))),
        'X' to G(7.0f, arrayOf(floatArrayOf(0.0f, 0.0f, 7.0f, 10.0f), floatArrayOf(7.0f, 0.0f, 0.0f, 10.0f))),
        'Y' to G(7.0f, arrayOf(floatArrayOf(0.0f, 0.0f, 3.5f, 5.0f, 7.0f, 0.0f), floatArrayOf(3.5f, 5.0f, 3.5f, 10.0f))),
        'Z' to G(7.0f, arrayOf(floatArrayOf(0.0f, 0.0f, 7.0f, 0.0f, 0.0f, 10.0f, 7.0f, 10.0f))),
        '-' to G(4.6f, arrayOf(floatArrayOf(0.0f, 5.0f, 4.6f, 5.0f))),
        '.' to G(0.0f, arrayOf(floatArrayOf(0.0f, 9.3f, 0.0f, 10.0f))),
        '+' to G(6.0f, arrayOf(floatArrayOf(0.0f, 5.0f, 6.0f, 5.0f), floatArrayOf(3.0f, 2.0f, 3.0f, 8.0f))),
        ' ' to G(3.4f, arrayOf()),
        )
    }
    private val path = Path()
    private var units = 1f
    private val glowP = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = 2.6f; strokeJoin = Paint.Join.MITER; strokeMiter = 2.3f; strokeCap = Paint.Cap.BUTT }
    private val haloP = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = 2.6f; strokeJoin = Paint.Join.MITER; strokeMiter = 2.3f; strokeCap = Paint.Cap.BUTT }
    private val chromeP = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = 1.45f; strokeJoin = Paint.Join.MITER; strokeMiter = 2.3f; strokeCap = Paint.Cap.BUTT }
    init {
        setLayerType(LAYER_TYPE_SOFTWARE, null) // bagliori sfocati (BlurMaskFilter): disegnati una sola volta, la vista è ferma
        importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO
        val t = java.text.Normalizer.normalize(text.uppercase(), java.text.Normalizer.Form.NFD).replace(Regex("\\p{Mn}+"), "")
        var x = 0f
        for (ch in t) {
            val g = KXG[ch] ?: KXG.getValue(' ')
            for (pl in g.lines) {
                if (pl.size < 2) continue
                path.moveTo(pl[0] + x, pl[1])
                var k = 2; while (k + 1 < pl.size) { path.lineTo(pl[k] + x, pl[k + 1]); k += 2 }
            }
            x += g.w + SP
        }
        units = maxOf(1f, x - SP)
        val a = Color.red(accent); val gg = Color.green(accent); val b = Color.blue(accent)
        haloP.color = Color.argb(140, a, gg, b); haloP.maskFilter = BlurMaskFilter(5f, BlurMaskFilter.Blur.NORMAL)   // come drop-shadow 22px
        glowP.color = Color.argb(128, a, gg, b); glowP.maskFilter = BlurMaskFilter(1.6f, BlurMaskFilter.Blur.NORMAL) // come il tratto .kg sfocato
        chromeP.shader = LinearGradient(0f, 0f, 0f, 10f, intArrayOf(Color.WHITE, 0xFFEEF0FF.toInt(), 0xFF9EA6D6.toInt(), Color.WHITE, accent), floatArrayOf(0f, .46f, .5f, .62f, 1f), Shader.TileMode.CLAMP)
    }
    override fun onMeasure(wSpec: Int, hSpec: Int) {
        val h = MeasureSpec.getSize(hSpec)
        setMeasuredDimension(((units + 2.4f) / 12.8f * h).toInt(), h)
    }
    override fun onDraw(c: Canvas) {
        val s = height / 12.8f
        c.save(); c.scale(s, s); c.translate(1.2f, 1.4f)
        c.drawPath(path, haloP); c.drawPath(path, glowP); c.drawPath(path, chromeP)
        c.restore()
    }
}
