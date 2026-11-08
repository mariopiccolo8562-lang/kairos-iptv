package com.kairos.player

import android.content.Context
import android.media.MediaCodecInfo
import android.media.MediaCodecList
import android.os.Build
import android.os.StatFs
import org.json.JSONObject
import java.io.File
import java.util.Locale
import kotlin.concurrent.thread

/*
 * Kairos Pro «intelligente» (autopilota), parte nativa:
 *  - DevCaps: cosa sa decodificare il dispositivo (HEVC, 4K, 10 bit, 50/60 fps) e lo schermo → NATIVE.caps()
 *  - EngineMemo: ExoPlayer o VLC, quale va meglio su questo dispositivo per formato → usato solo con «Automatico»
 *  - DiskCare: spazio libero e pulizia delle cache (mai le registrazioni) → NATIVE.storage() / NATIVE.trimDisk()
 *  - ZapMemo: sequenze di zapping imparate e canale successivo più probabile preparato (solo DNS: leggerissimo)
 */

/** Decoder video del dispositivo (solo hardware: quelli software sui box TV non reggono HEVC o 4K) e altezza massima dello schermo. */
object DevCaps {
    @Volatile private var cached: String? = null

    private fun software(ci: MediaCodecInfo): Boolean {
        if (Build.VERSION.SDK_INT >= 29) return ci.isSoftwareOnly
        val n = ci.name.lowercase(Locale.ROOT)
        return n.startsWith("omx.google.") || n.startsWith("c2.android.") || n.contains(".sw.") || n.contains("ffmpeg")
    }

    /** altezza massima fra le modalità dello schermo (0 = non nota: prima di Android 6 la TV può dichiarare meno di quel che regge) */
    private fun displayHeight(ctx: Context): Int = try {
        if (Build.VERSION.SDK_INT >= 23) {
            val dm = ctx.getSystemService(Context.DISPLAY_SERVICE) as android.hardware.display.DisplayManager
            val d = dm.getDisplay(android.view.Display.DEFAULT_DISPLAY)
            d?.supportedModes?.maxOfOrNull { minOf(it.physicalWidth, it.physicalHeight) } ?: 0
        } else 0
    } catch (_: Throwable) { 0 }

    fun json(ctx: Context): String {
        cached?.let { return it }
        val o = JSONObject()
        try {
            var hevc = false; var b10 = false; var uhd = false; var fps60 = false; var maxH = 0
            for (ci in MediaCodecList(MediaCodecList.REGULAR_CODECS).codecInfos) {
                if (ci.isEncoder || software(ci)) continue
                for (t in ci.supportedTypes) {
                    val type = t.lowercase(Locale.ROOT)
                    if (type != "video/hevc" && type != "video/avc") continue
                    val caps = try { ci.getCapabilitiesForType(t) } catch (_: Throwable) { null } ?: continue
                    val vc = caps.videoCapabilities ?: continue
                    try { maxH = maxOf(maxH, vc.supportedHeights.upper) } catch (_: Throwable) {}
                    try { if (vc.isSizeSupported(3840, 2160)) uhd = true } catch (_: Throwable) {}
                    // canali a 50 fps (sport europei): 1080p a 50 fotogrammi al secondo
                    try { if (vc.areSizeAndRateSupported(1920, 1080, 50.0)) fps60 = true } catch (_: Throwable) {}
                    if (type == "video/hevc") {
                        hevc = true
                        if (caps.profileLevels.any { it.profile == MediaCodecInfo.CodecProfileLevel.HEVCProfileMain10 || it.profile == MediaCodecInfo.CodecProfileLevel.HEVCProfileMain10HDR10 }) b10 = true
                    }
                }
            }
            o.put("hevc", hevc).put("b10", b10).put("uhd", uhd).put("fps60", fps60).put("maxH", maxH)
        } catch (_: Throwable) {}
        try { o.put("disp", displayHeight(ctx)) } catch (_: Throwable) {}
        return o.toString().also { cached = it }
    }
}

/**
 * Motore che funziona meglio su questo dispositivo, per formato: ts, hls, mp4, mkv e le varianti «hevc» (es. tshevc).
 * Prove: ogni visione che arriva a 60 s senza problemi conta come riuscita per il suo motore; quando il recupero lascia un
 * motore per l'altro e con l'altro il problema si risolve, il primo ha fallito (immagine ferma, errori, non risolto) e il
 * secondo è riuscito. Si passa di base all'altro motore solo con prove sufficienti e un vantaggio chiaro; si torna indietro
 * da soli se l'altro comincia a fallire. Si azzera a ogni versione dell'app. Si applica solo con la scelta «Automatico».
 */
object EngineMemo {
    private const val PREF = "engmemo"
    private val RX_HEVC = Regex("\\b(HEVC|H\\.?265|X265)\\b", RegexOption.IGNORE_CASE)
    /** formato → [riuscite ExoPlayer, fallite ExoPlayer, riuscite VLC, fallite VLC] */
    private val m = HashMap<String, IntArray>()
    @Volatile private var loaded = false
    private var dirtyAt = 0L

    private fun prefs(ctx: Context) = ctx.applicationContext.getSharedPreferences(PREF, Context.MODE_PRIVATE)

    @Synchronized private fun load(ctx: Context) {
        if (loaded) return
        loaded = true
        try {
            val p = prefs(ctx)
            // versione dell'app diversa: motori e decoder possono essere cambiati, si ricomincia da capo
            if (p.getInt("ver", -1) != BuildConfig.VERSION_CODE) { p.edit().clear().putInt("ver", BuildConfig.VERSION_CODE).apply(); return }
            val o = JSONObject(p.getString("m", "{}") ?: "{}")
            for (k in o.keys()) { val a = o.optJSONArray(k) ?: continue; if (a.length() == 4) m[k] = IntArray(4) { a.optInt(it) } }
        } catch (_: Exception) {}
    }

    @Synchronized private fun save(ctx: Context, force: Boolean = false) {
        val now = System.currentTimeMillis()
        if (!force && now - dirtyAt < 30_000L) return
        dirtyAt = now
        try {
            val o = JSONObject(); for ((k, v) in m) o.put(k, org.json.JSONArray(v.toList()))
            prefs(ctx).edit().putInt("ver", BuildConfig.VERSION_CODE).putString("m", o.toString()).apply()
        } catch (_: Exception) {}
    }

    /** chiave del formato dall'indirizzo, dal nome del canale e (se noto) dal codec in onda; "" = formato che non si impara */
    fun key(url: String, title: String, codec: String = ""): String {
        val f = fmtOf(url); if (f.isEmpty()) return ""
        return if (codec.equals("HEVC", true) || RX_HEVC.containsMatchIn(title)) f + "hevc" else f
    }

    private fun add(ctx: Context, engine: String, key: String, slot: Int) {
        if (key.isEmpty() || (engine != "exo" && engine != "vlc")) return
        load(ctx)
        synchronized(this) {
            val a = m.getOrPut(key) { IntArray(4) }
            val i = (if (engine == "vlc") 2 else 0) + slot
            a[i] = minOf(a[i] + 1, 500)
            // si tengono le ultime prove: oltre 200 in tutto si dimezza (conta di più quello che succede adesso)
            if (a.sum() > 200) for (j in 0..3) a[j] = a[j] / 2
            if (m.size > 12) m.keys.firstOrNull { it != key }?.let { m.remove(it) }
        }
        save(ctx)
    }
    fun ok(ctx: Context, engine: String, key: String) = add(ctx, engine, key, 0)
    fun fail(ctx: Context, engine: String, key: String) { add(ctx, engine, key, 1); save(ctx, true) }
    fun flush(ctx: Context) { if (loaded) save(ctx, true) }

    private fun rate(ok: Int, ko: Int): Double = (ko + 0.5) / (ok + ko + 2.0)

    /** motore da usare di base per [key] se uno è chiaramente migliore dell'altro (null = nessuna prova sufficiente) */
    fun best(ctx: Context, key: String, allowed: Set<String>? = null): String? {
        if (key.isEmpty()) return null
        load(ctx)
        val a = synchronized(this) { m[key]?.copyOf() } ?: return null
        val rExo = rate(a[0], a[1]); val rVlc = rate(a[2], a[3])
        val pick = when {
            a[1] >= 2 && a[2] + a[3] >= 2 && rVlc + 0.15 < rExo -> "vlc"
            a[3] >= 2 && a[0] + a[1] >= 2 && rExo + 0.15 < rVlc -> "exo"
            else -> null
        } ?: return null
        return if (allowed == null || pick in allowed || "auto" in allowed) pick else null
    }

    /** riassunto per il pannello: solo i formati dove si usa VLC di base (es. "ts:vlc,tshevc:vlc") */
    fun summary(ctx: Context): String {
        load(ctx)
        val ks = synchronized(this) { m.keys.toList() }
        return ks.mapNotNull { k -> best(ctx, k)?.let { if (it == "vlc") "$k:vlc" else null } }.sorted().joinToString(",").take(40)
    }
}

/** Spazio libero e pulizia delle cache dell'app: download temporanei, guide temporanee, APK d'aggiornamento vecchi.
 *  Mai le registrazioni, l'APK pronto da installare, la libreria salvata o un file in uso (solo file fermi da 10 minuti). */
object DiskCare {
    fun json(ctx: Context): String = try {
        val s = StatFs(ctx.filesDir.path)
        JSONObject().put("free", s.availableBytes / 1048576L).put("total", s.totalBytes / 1048576L).toString()
    } catch (_: Throwable) { "" }

    /** pulizia leggera in un thread; la cache della WebView (immagini) la svuota chi chiama, sul thread dell'interfaccia */
    fun trim(ctx: Context, apkBusy: Boolean) {
        thread(name = "kx-trim") {
            val old = System.currentTimeMillis() - 10 * 60_000L
            val gone = { f: File -> f.isFile && f.lastModified() < old && f.delete() }
            try {
                File(ctx.cacheDir, "net").listFiles()?.forEach { gone(it) }
                ctx.cacheDir.listFiles()?.forEach { if (it.name.startsWith("epg_") || it.name.endsWith(".tmp")) gone(it) }
                if (!apkBusy) for (d in listOfNotNull(File(ctx.cacheDir, "apk"), ctx.externalCacheDir, ctx.cacheDir)) gone(File(d, "kairos-update.apk"))
            } catch (_: Throwable) {}
        }
    }
}

/**
 * Zapping: impara le sequenze (canale → canale successivo) e il verso dei tasti CH+/CH−; dopo ogni cambio prepara il canale
 * più probabile risolvendo il suo indirizzo (DNS) in anticipo, così la connessione parte prima. È leggerissimo (nessun dato
 * del canale scaricato, nessuna connessione in più verso il server della linea): vale anche sulle chiavette da 1 GB.
 */
object ZapMemo {
    private const val PREF = "zapmemo"
    private val trans = LinkedHashMap<String, HashMap<String, Int>>()
    @Volatile private var loaded = false
    private var savedAt = 0L
    private val warmed = HashMap<String, Long>()

    private fun prefs(ctx: Context) = ctx.applicationContext.getSharedPreferences(PREF, Context.MODE_PRIVATE)
    @Synchronized private fun load(ctx: Context) {
        if (loaded) return
        loaded = true
        try {
            val o = JSONObject(prefs(ctx).getString("t", "{}") ?: "{}")
            for (k in o.keys()) { val x = o.optJSONObject(k) ?: continue; val mm = HashMap<String, Int>(); for (j in x.keys()) mm[j] = x.optInt(j); trans[k] = mm }
        } catch (_: Exception) {}
    }
    @Synchronized fun flush(ctx: Context) {
        if (!loaded) return
        savedAt = System.currentTimeMillis()
        try { val o = JSONObject(); for ((k, v) in trans) o.put(k, JSONObject(v as Map<*, *>)); prefs(ctx).edit().putString("t", o.toString()).apply() } catch (_: Exception) {}
    }

    /** passaggio da [from] a [to] (canali in diretta) */
    fun learn(ctx: Context, from: String, to: String) {
        if (from.isEmpty() || to.isEmpty() || from == to) return
        load(ctx)
        synchronized(this) {
            val mm = trans.remove(from) ?: HashMap()
            mm[to] = minOf((mm[to] ?: 0) + 1, 1000)
            if (mm.size > 6) mm.minByOrNull { it.value }?.let { mm.remove(it.key) }
            trans[from] = mm // in fondo = usato da poco
            while (trans.size > 200) trans.remove(trans.keys.first())
        }
        if (System.currentTimeMillis() - savedAt > 60_000L) flush(ctx)
    }

    /** posizione del canale successivo più probabile: sequenza imparata forte, altrimenti il verso dello zapping in corso */
    fun predict(ctx: Context, ids: List<String>, index: Int, dir: Int): Int {
        if (index !in ids.indices) return -1
        load(ctx)
        val best = synchronized(this) { trans[ids[index]]?.let { mm -> val tot = mm.values.sum(); mm.maxByOrNull { it.value }?.takeIf { it.value >= 3 && it.value * 10 >= tot * 4 }?.key } }
        if (best != null) { val i = ids.indexOf(best); if (i >= 0) return i }
        if (dir != 0 && ids.size > 1) return (index + dir + ids.size) % ids.size
        return -1
    }

    /** risolve in anticipo l'host del canale probabile (al più una volta al minuto per host, in un thread) */
    fun warm(url: String) {
        val host = try { java.net.URL(url).host } catch (_: Exception) { "" }
        if (host.isEmpty()) return
        val now = System.currentTimeMillis()
        synchronized(warmed) {
            if (now - (warmed[host] ?: 0L) < 60_000L) return
            warmed[host] = now
            if (warmed.size > 30) warmed.keys.firstOrNull()?.let { warmed.remove(it) }
        }
        thread(name = "kx-dns", isDaemon = true) { try { java.net.InetAddress.getAllByName(host) } catch (_: Throwable) {} }
    }
}
