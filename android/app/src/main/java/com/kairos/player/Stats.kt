package com.kairos.player

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.wifi.WifiManager
import android.os.Build
import org.json.JSONObject

/** Dati della visione in corso: l'interfaccia li manda al pannello ("Online ora"). Scritti dal lettore, letti dal ponte JS. */
object PlayStats {
    @Volatile var active = false
    @Volatile var engine = ""
    @Volatile var width = 0
    @Volatile var height = 0
    @Volatile var fps = 0f
    @Volatile var bitrate = 0
    @Volatile var buffers = 0

    fun start(engineName: String) {
        active = true; engine = engineName; width = 0; height = 0; fps = 0f; bitrate = 0; buffers = 0
    }

    fun stop() { active = false }

    fun json(): String {
        if (!active) return ""
        return try {
            JSONObject().apply {
                put("res", if (width > 0 && height > 0) "${width}x$height" else if (height > 0) "${height}p" else "")
                put("fps", fps.toDouble())
                put("bitrate", bitrate)
                put("buffers", buffers)
                put("engine", engine)
            }.toString()
        } catch (t: Throwable) { "" }
    }
}

/** Tipo di rete (wifi | eth | mobile | none) e, sul Wi-Fi, potenza del segnale e velocità del collegamento. */
object NetInfo {
    fun json(ctx: Context): String = try {
        val o = JSONObject()
        val cm = ctx.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        var type = "none"
        if (Build.VERSION.SDK_INT >= 23) {
            val n = cm.activeNetwork
            val c = if (n != null) cm.getNetworkCapabilities(n) else null
            if (c != null) {
                type = when {
                    c.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "eth"
                    c.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "wifi"
                    c.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "mobile"
                    else -> ""
                }
                o.put("down", c.linkDownstreamBandwidthKbps)
            }
        } else {
            @Suppress("DEPRECATION")
            val ni = cm.activeNetworkInfo
            @Suppress("DEPRECATION")
            if (ni != null && ni.isConnected) type = when (ni.type) {
                ConnectivityManager.TYPE_ETHERNET -> "eth"
                ConnectivityManager.TYPE_WIFI -> "wifi"
                ConnectivityManager.TYPE_MOBILE -> "mobile"
                else -> ""
            }
        }
        if (type == "wifi") {
            try {
                val wm = ctx.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
                @Suppress("DEPRECATION")
                val wi = wm.connectionInfo
                if (wi != null && wi.rssi in -126..-1) { o.put("rssi", wi.rssi); o.put("link", wi.linkSpeed) }
            } catch (_: Throwable) { }
        }
        o.put("type", type)
        o.toString()
    } catch (t: Throwable) { "" }
}
