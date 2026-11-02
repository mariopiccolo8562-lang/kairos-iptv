package com.kairos.player

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity

/**
 * Trailer da YouTube a schermo intero dentro l'app.
 * Telecomando: OK pausa/riprendi, ◀ ▶ ±10 s, Indietro chiude.
 * Se il video non si può incorporare (o non parte entro 15 s) si apre l'app YouTube, se c'è.
 */
class TrailerActivity : ComponentActivity() {

    companion object {
        private const val ORIGIN = "https://kairos.player"
        fun start(ctx: Context, id: String, title: String) {
            if (!Regex("^[A-Za-z0-9_-]{11}$").matches(id)) return
            ctx.startActivity(Intent(ctx, TrailerActivity::class.java).putExtra("id", id).putExtra("title", title.take(120)))
        }
    }

    private lateinit var web: WebView
    private lateinit var msg: TextView
    private val ui = Handler(Looper.getMainLooper())
    private var ready = false
    private var leaving = false
    private var vid = ""

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        @Suppress("DEPRECATION")
        window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_FULLSCREEN or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
        vid = intent.getStringExtra("id") ?: ""
        if (!Regex("^[A-Za-z0-9_-]{11}$").matches(vid)) { finish(); return }
        val root = FrameLayout(this).apply { setBackgroundColor(Color.BLACK) }
        web = WebView(this).apply {
            setBackgroundColor(Color.BLACK)
            settings.javaScriptEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            settings.domStorageEnabled = true
            webChromeClient = WebChromeClient()
            webViewClient = object : WebViewClient() {}
            addJavascriptInterface(Bridge(), "Kx")
            isFocusable = true
        }
        msg = TextView(this).apply {
            setTextColor(Color.WHITE); textSize = 20f
            text = "Caricamento trailer…\n" + (intent.getStringExtra("title") ?: "")
            gravity = android.view.Gravity.CENTER
        }
        root.addView(web, FrameLayout.LayoutParams(-1, -1))
        root.addView(msg, FrameLayout.LayoutParams(-1, -1))
        setContentView(root)
        web.loadDataWithBaseURL("$ORIGIN/", page(vid), "text/html", "utf-8", null)
        ui.postDelayed({ if (!ready && !leaving) openYoutubeApp() }, 15_000)
    }

    private fun page(id: String) = """<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden}#p{position:fixed;inset:0;width:100%;height:100%}</style></head>
<body><div id="p"></div><script src="https://www.youtube.com/iframe_api"></script><script>
var pl;function onYouTubeIframeAPIReady(){pl=new YT.Player('p',{videoId:'$id',host:'https://www.youtube-nocookie.com',
playerVars:{autoplay:1,controls:1,rel:0,playsinline:1,modestbranding:1,fs:0,iv_load_policy:3,hl:'it',cc_lang_pref:'it',origin:'$ORIGIN'},
events:{onReady:function(e){Kx.ready();e.target.playVideo();},onError:function(e){Kx.error(String(e.data));},onStateChange:function(e){if(e.data===1)Kx.ready();if(e.data===0)Kx.ended();}}});}
function kx(k){try{if(!pl||!pl.getPlayerState)return;if(k==='ok'){pl.getPlayerState()===1?pl.pauseVideo():pl.playVideo();}else if(k==='l'){pl.seekTo(Math.max(0,pl.getCurrentTime()-10),true);}else if(k==='r'){pl.seekTo(pl.getCurrentTime()+10,true);}}catch(e){}}
</script></body></html>"""

    inner class Bridge {
        @JavascriptInterface fun ready() { ui.post { if (!ready) { ready = true; msg.visibility = View.GONE } } }
        @JavascriptInterface fun ended() { ui.post { if (!leaving) { leaving = true; finish() } } }
        // 2/5/100/101/150/153: video non incorporabile o non disponibile → app YouTube
        @JavascriptInterface fun error(code: String) { ui.post { if (!leaving) openYoutubeApp() } }
    }

    private fun openYoutubeApp() {
        if (leaving) return
        leaving = true
        val tries = listOf(
            Intent(Intent.ACTION_VIEW, Uri.parse("vnd.youtube:$vid")),
            Intent(Intent.ACTION_VIEW, Uri.parse("https://www.youtube.com/watch?v=$vid")).setPackage("com.google.android.youtube.tv"),
            Intent(Intent.ACTION_VIEW, Uri.parse("https://www.youtube.com/watch?v=$vid")).setPackage("com.amazon.firetv.youtube"),
            Intent(Intent.ACTION_VIEW, Uri.parse("https://www.youtube.com/watch?v=$vid")),
        )
        for (i in tries) {
            try { startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); finish(); return } catch (_: Exception) {}
        }
        Toast.makeText(this, "Trailer non disponibile su questo dispositivo", Toast.LENGTH_LONG).show()
        finish()
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.action == KeyEvent.ACTION_DOWN) {
            val k = when (event.keyCode) {
                KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER, KeyEvent.KEYCODE_NUMPAD_ENTER, KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE,
                KeyEvent.KEYCODE_MEDIA_PLAY, KeyEvent.KEYCODE_MEDIA_PAUSE -> "ok"
                KeyEvent.KEYCODE_DPAD_LEFT, KeyEvent.KEYCODE_MEDIA_REWIND -> "l"
                KeyEvent.KEYCODE_DPAD_RIGHT, KeyEvent.KEYCODE_MEDIA_FAST_FORWARD -> "r"
                KeyEvent.KEYCODE_BACK, KeyEvent.KEYCODE_ESCAPE -> { leaving = true; finish(); return true }
                else -> null
            }
            if (k != null) { web.evaluateJavascript("kx('$k')", null); return true }
        } else if (event.keyCode == KeyEvent.KEYCODE_BACK) return true
        return super.dispatchKeyEvent(event)
    }

    override fun onDestroy() {
        ui.removeCallbacksAndMessages(null)
        if (::web.isInitialized) { try { web.loadUrl("about:blank"); web.destroy() } catch (_: Exception) {} }
        super.onDestroy()
    }
}
