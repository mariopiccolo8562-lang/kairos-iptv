package com.kairos.player

import android.annotation.SuppressLint
import android.os.Build
import android.os.Bundle
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback

/**
 * KAIROS Player — contenitore Android del player.
 * Il player (assets/www/index.html) gira in una WebView locale: le richieste verso
 * playlist e flussi partono dal dispositivo, senza passare da alcun server.
 */
class MainActivity : ComponentActivity() {

    private lateinit var web: WebView
    private var lastBack = 0L

    companion object {
        private const val HOME = "file:///android_asset/www/index.html"
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        web = WebView(this)
        web.setBackgroundColor(0xFF000000.toInt())
        setContentView(web)
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
            cacheMode = WebSettings.LOAD_DEFAULT
            userAgentString = "$userAgentString KairosPlayer/${BuildConfig.VERSION_NAME}"
        }
        web.isFocusable = true
        web.isFocusableInTouchMode = true
        web.addJavascriptInterface(Bridge(), "KairosNative")
        web.webChromeClient = WebChromeClient()
        web.webViewClient = object : WebViewClient() {
            // il player non deve mai navigare fuori dai propri file
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
                !request.url.toString().startsWith("file:///android_asset/")

            @Deprecated("Deprecated in Java")
            override fun shouldOverrideUrlLoading(view: WebView, url: String): Boolean =
                !url.startsWith("file:///android_asset/")

            override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
                recreate()
                return true
            }
        }

        if (savedInstanceState == null || web.restoreState(savedInstanceState) == null) web.loadUrl(HOME)
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

    override fun onPause() { web.onPause(); super.onPause() }
    override fun onResume() { super.onResume(); web.onResume() }
    override fun onSaveInstanceState(outState: Bundle) { web.saveState(outState); super.onSaveInstanceState(outState) }
    override fun onDestroy() { web.destroy(); super.onDestroy() }

    /** Funzioni esposte al player come window.KairosNative */
    inner class Bridge {
        @JavascriptInterface fun version(): String = BuildConfig.VERSION_NAME
        @JavascriptInterface fun model(): String = "${Build.MANUFACTURER} ${Build.MODEL}".trim().take(70)
        @JavascriptInterface fun exit() { runOnUiThread { finish() } }
    }
}
