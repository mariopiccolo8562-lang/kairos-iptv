package com.kairos.player

import android.content.Context
import android.graphics.Color
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.view.SurfaceHolder
import android.view.SurfaceView
import android.view.View
import android.view.ViewGroup
import androidx.annotation.OptIn
import androidx.media3.common.C
import androidx.media3.common.Format
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.TrackSelectionOverride
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.SeekParameters
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.exoplayer.trackselection.AdaptiveTrackSelection
import androidx.media3.exoplayer.trackselection.DefaultTrackSelector
import androidx.media3.extractor.DefaultExtractorsFactory
import androidx.media3.extractor.ts.DefaultTsPayloadReaderFactory
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import org.videolan.libvlc.LibVLC
import org.videolan.libvlc.Media
import org.videolan.libvlc.MediaPlayer
import org.videolan.libvlc.util.VLCVideoLayout
import java.util.Locale

/** Una voce di menu (traccia audio, qualità, sottotitoli). */
data class Track(val id: String, val label: String, val selected: Boolean)

interface EngineListener {
    fun onBuffering(buffering: Boolean)
    fun onReady()
    fun onError(message: String)
    fun onEnded()
    /** primo fotogramma disegnato (per le animazioni del cambio canale) */
    fun onFirstFrame() {}
}

/** Passaggio del video tra anteprima e schermo intero senza interruzioni (stesso player, nessun nuovo caricamento). */
object Handoff {
    /** anteprima → schermo intero */
    @Volatile var engine: ExoEngine? = null
    /** schermo intero → anteprima */
    @Volatile var back: ExoEngine? = null
    @Volatile var id: String = ""
    /** riquadro dell'anteprima sullo schermo (x, y, larghezza, altezza) */
    @Volatile var box: IntArray? = null

    /** La schermata principale (sotto lo schermo intero, che è trasparente). Tutto sul thread principale. */
    interface Host {
        /** riprende subito [back] nel riquadro; [onShown] quando il video è visibile lì. false = non possibile ora */
        fun adoptNow(onShown: Runnable): Boolean
        /** lo schermo intero mostra il video: l'anteprima ingrandita (ormai coperta) può sparire */
        fun fullShown()
        /** chiusura senza ritorno nel riquadro: l'interfaccia viene coperta di nero (poi sfuma), niente lampi */
        fun coverUi()
    }
    /** riferimento debole: non trattiene l'activity dopo la chiusura */
    @Volatile private var hostRef: java.lang.ref.WeakReference<Host>? = null
    var host: Host?
        get() = hostRef?.get()
        set(v) { hostRef = if (v == null) null else java.lang.ref.WeakReference(v) }
}

object NoopListener : EngineListener {
    override fun onBuffering(buffering: Boolean) {}
    override fun onReady() {}
    override fun onError(message: String) {}
    override fun onEnded() {}
}

/** Impostazioni di riproduzione scelte nell'app. */
data class PlayPrefs(val quality: String, val buffer: String, val aspect: String, val live: Boolean = false, val hw: String = "auto") {
    /** millisecondi di video da accumulare prima di partire / dopo un'interruzione.
     *  In diretta si parte prima: il cambio canale è molto più rapido. */
    // film/serie: dopo un salto (avanti/indietro) la riproduzione riparte con poco video pronto → ricerca veloce
    val startMs: Int get() = if (live) when (buffer) { "fast" -> 350; "stable" -> 1800; else -> 650 } else when (buffer) { "fast" -> 800; "stable" -> 2500; else -> 1000 }
    val rebufferMs: Int get() = if (live) when (buffer) { "fast" -> 2500; "stable" -> 8000; else -> 4000 } else when (buffer) { "fast" -> 1500; "stable" -> 5000; else -> 2000 }
    /** video già visto tenuto in memoria (film): «indietro di 10 s» è immediato, senza ricaricare */
    val backMs: Int get() = if (live) 0 else 12_000
    val maxMs: Int get() = when (buffer) { "fast" -> 30000; "stable" -> 90000; else -> 50000 }
    val vlcCacheMs: Int get() = if (live) when (buffer) { "fast" -> 600; "stable" -> 3000; else -> 1200 } else when (buffer) { "fast" -> 1000; "stable" -> 5000; else -> 2500 }
    val maxHeight: Int get() = quality.toIntOrNull() ?: 0
}

/** Motore di riproduzione: ExoPlayer oppure VLC. */
interface Engine {
    val name: String
    val view: View
    fun play(url: String, startMs: Long)
    fun stop()
    fun togglePause()
    fun isPlaying(): Boolean
    fun position(): Long
    fun duration(): Long
    fun seekBy(ms: Long)
    /** salto a una posizione assoluta (ms); i salti lunghi usano il fotogramma chiave più vicino (più rapido) */
    fun seekTo(ms: Long)
    fun audioTracks(): List<Track>
    fun selectAudio(id: String)
    fun qualities(): List<Track>
    fun selectQuality(id: String)
    fun subtitles(): List<Track>
    fun selectSubtitle(id: String)
    fun setAspect(mode: String)
    fun videoHeight(): Int
    fun release()
}

private fun mimeOf(url: String): String? {
    val u = url.lowercase(Locale.ROOT).substringBefore('?')
    return when {
        u.endsWith(".m3u8") || u.contains("/hls/") -> MimeTypes.APPLICATION_M3U8
        u.endsWith(".ts") -> MimeTypes.VIDEO_MP2T
        u.endsWith(".mkv") -> MimeTypes.VIDEO_MATROSKA
        u.endsWith(".mp4") || u.endsWith(".m4v") -> MimeTypes.VIDEO_MP4
        else -> null
    }
}

private fun langName(code: String?): String {
    if (code.isNullOrBlank() || code == "und") return ""
    val n = Locale(code).getDisplayLanguage(Locale.ITALIAN)
    return if (n.isBlank()) code else n.replaceFirstChar { it.uppercase() }
}

/* ======================================================================= */
/* ExoPlayer                                                               */
/* ======================================================================= */
@OptIn(UnstableApi::class)
class ExoEngine(ctx: Context, @Volatile var l: EngineListener, ua: String, private val prefs: PlayPrefs, overlay: Boolean = false) : Engine {
    override val name = "exo"
    private val selector = DefaultTrackSelector(
        ctx,
        // passa a una qualità più alta solo dopo 10s stabili, scende solo se davvero necessario:
        // evita i cali improvvisi di qualità
        AdaptiveTrackSelection.Factory(10_000, 25_000, 25_000, 0.75f),
    )
    private var currentQuality = "auto"
    private val player: ExoPlayer
    private var resize = AspectRatioFrameLayout.RESIZE_MODE_FIT
    private var subFactor = 1f
    /** vista attuale del video (cambia quando il video passa a un'altra schermata, vedi [moveTo]) */
    private var pv: PlayerView
    override val view: View get() = pv
    private val main = Handler(Looper.getMainLooper())
    private var released = false
    /** viste lasciate da [moveTo]: mostrano ancora l'ultimo fotogramma finché non chiami [dropOldView] */
    private val oldViews = ArrayList<PlayerView>()
    private var moveCb: (() -> Unit)? = null
    private var moveArmed = false
    private val moveTimeout = Runnable { fireMoved() }

    init {
        val http = DefaultHttpDataSource.Factory()
            .setUserAgent(ua)
            .setAllowCrossProtocolRedirects(true)
            .setConnectTimeoutMs(15_000)
            .setReadTimeoutMs(20_000)
        val extractors = DefaultExtractorsFactory()
            .setTsExtractorFlags(DefaultTsPayloadReaderFactory.FLAG_ALLOW_NON_IDR_KEYFRAMES or DefaultTsPayloadReaderFactory.FLAG_DETECT_ACCESS_UNITS)
        val sources = DefaultMediaSourceFactory(DefaultDataSource.Factory(ctx, http), extractors)
        val load = DefaultLoadControl.Builder()
            .setBufferDurationsMs(maxOf(15_000, prefs.startMs + 1000, prefs.rebufferMs), prefs.maxMs, prefs.startMs, prefs.rebufferMs)
            .setBackBuffer(prefs.backMs, true)
            .setPrioritizeTimeOverSizeThresholds(true)
            .build()
        val renderers = DefaultRenderersFactory(ctx)
            .setEnableDecoderFallback(true)
            .setExtensionRendererMode(DefaultRenderersFactory.EXTENSION_RENDERER_MODE_OFF)
        // accelerazione hardware: "off" preferisce i decoder software, "on" quelli hardware
        if (prefs.hw == "off" || prefs.hw == "on") {
            val wantSw = prefs.hw == "off"
            renderers.setMediaCodecSelector { mime, secure, tunneling ->
                androidx.media3.exoplayer.mediacodec.MediaCodecUtil.getDecoderInfos(mime, secure, tunneling)
                    .sortedBy { if (it.softwareOnly == wantSw) 0 else 1 }
            }
        }
        player = ExoPlayer.Builder(ctx, renderers)
            .setTrackSelector(selector)
            .setLoadControl(load)
            .setMediaSourceFactory(sources)
            .build()
        // allinea la frequenza dello schermo a quella del video (50/60 fps fluidi) quando possibile
        player.setVideoChangeFrameRateStrategy(C.VIDEO_CHANGE_FRAME_RATE_STRATEGY_ONLY_IF_SEAMLESS)
        applyQuality(prefs.quality)

        resize = resizeOf(prefs.aspect)
        pv = makeView(ctx, overlay)
        pv.player = player

        player.addListener(object : Player.Listener {
            override fun onPlaybackStateChanged(state: Int) {
                when (state) {
                    Player.STATE_BUFFERING -> l.onBuffering(true)
                    Player.STATE_READY -> { l.onBuffering(false); l.onReady() }
                    Player.STATE_ENDED -> l.onEnded()
                    else -> {}
                }
            }

            // arriva di nuovo dopo ogni cambio di superficie (solo per la superficie attuale):
            // è il segnale che il video è davvero visibile nella nuova schermata
            override fun onRenderedFirstFrame() { if (moveArmed) fireMoved(); l.onFirstFrame() }

            override fun onPlayerError(error: PlaybackException) {
                if (error.errorCode == PlaybackException.ERROR_CODE_BEHIND_LIVE_WINDOW) {
                    player.seekToDefaultPosition(); player.prepare(); return
                }
                l.onError(error.errorCodeName)
            }
        })
    }

    /* ---------------- vista del video ---------------- */
    private fun resizeOf(mode: String) = when (mode) {
        "fill" -> AspectRatioFrameLayout.RESIZE_MODE_FILL
        "zoom" -> AspectRatioFrameLayout.RESIZE_MODE_ZOOM
        else -> AspectRatioFrameLayout.RESIZE_MODE_FIT
    }

    private fun makeView(ctx: Context, overlay: Boolean): PlayerView = PlayerView(ctx).apply {
        useController = false
        setShutterBackgroundColor(Color.BLACK)
        setKeepContentOnPlayerReset(true)
        resizeMode = resize
        // anteprima sopra la pagina web: va impostato prima che la vista entri nella finestra
        if (overlay) (videoSurfaceView as? SurfaceView)?.setZOrderMediaOverlay(true)
        subtitleView?.setFractionalTextSize(androidx.media3.ui.SubtitleView.DEFAULT_TEXT_SIZE_FRACTION * subFactor)
    }

    /**
     * Sposta il video in una nuova vista (per un'altra schermata) senza fermarlo né ricaricarlo.
     * Il player passa alla nuova superficie appena questa esiste; la vista precedente resta dov'è con
     * l'ultimo fotogramma. [onShown] viene chiamato (thread principale) al primo fotogramma disegnato sulla
     * nuova superficie, o dopo [timeoutMs]: solo allora conviene togliere la vecchia con [dropOldView].
     */
    fun moveTo(ctx: Context, overlay: Boolean, timeoutMs: Long, onShown: () -> Unit): View {
        fireMoved() // un passaggio precedente non ancora concluso
        val n = makeView(ctx, overlay)
        oldViews.add(pv)
        pv = n
        moveCb = onShown
        val sv = n.videoSurfaceView as? SurfaceView
        if (sv == null) bindView(n)
        else sv.holder.addCallback(object : SurfaceHolder.Callback {
            override fun surfaceCreated(holder: SurfaceHolder) {
                holder.removeCallback(this)
                // passaggio diretto vecchia → nuova superficie: nessun buco nero nel mezzo
                if (!released && pv === n) bindView(n)
            }
            override fun surfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) {}
            override fun surfaceDestroyed(holder: SurfaceHolder) {}
        })
        main.removeCallbacks(moveTimeout)
        main.postDelayed(moveTimeout, timeoutMs)
        return n
    }

    private fun bindView(n: PlayerView) {
        if (n.player === player) return
        if (moveCb != null) moveArmed = true
        n.player = player
    }

    private fun fireMoved() {
        main.removeCallbacks(moveTimeout)
        moveArmed = false
        val cb = moveCb ?: return
        moveCb = null
        if (!released && pv.player !== player) pv.player = player
        try { cb() } catch (_: Exception) {}
    }

    /** toglie le viste lasciate da [moveTo] (anche dalla schermata che le contiene) */
    fun dropOldView() {
        if (oldViews.isEmpty()) return
        val list = ArrayList(oldViews)
        oldViews.clear()
        for (v in list) {
            try {
                // il player disegna già altrove: qui si staccano solo gli ascoltatori della vecchia vista
                if (v.player != null) v.player = null
                (v.parent as? ViewGroup)?.removeView(v)
            } catch (_: Exception) {}
        }
    }

    override fun play(url: String, startMs: Long) {
        val b = MediaItem.Builder().setUri(Uri.parse(url))
        mimeOf(url)?.let { b.setMimeType(it) }
        playingUrl = url
        // senza posizione: si parte da quella predefinita (in diretta HLS vicino al presente, come indica la
        // playlist) e non dall'inizio della finestra, dove i segmenti stanno per scadere
        if (startMs > 0) player.setMediaItem(b.build(), startMs) else player.setMediaItem(b.build())
        player.setSeekParameters(SeekParameters.DEFAULT)
        player.prepare()
        player.playWhenReady = true
    }

    /** indirizzo in riproduzione (serve per passare lo stesso video dall'anteprima allo schermo intero) */
    @Volatile var playingUrl: String = ""
    fun isActive(): Boolean = player.playbackState == Player.STATE_READY || player.playbackState == Player.STATE_BUFFERING
    /** la superficie video va sopra (anteprima) o sotto (schermo intero, con i menu sopra) la finestra */
    fun setOverlay(on: Boolean) { (pv.videoSurfaceView as? SurfaceView)?.setZOrderMediaOverlay(on) }

    override fun stop() { player.stop(); playingUrl = "" }
    override fun togglePause() { player.playWhenReady = !player.playWhenReady }
    override fun isPlaying(): Boolean = player.playWhenReady
    override fun position(): Long = maxOf(0L, player.currentPosition)
    override fun duration(): Long = player.duration.let { if (it == C.TIME_UNSET || it < 0) 0L else it }
    override fun seekBy(ms: Long) = seekTo(position() + ms)
    override fun seekTo(ms: Long) {
        val d = duration()
        var t = maxOf(0L, ms)
        if (d > 0) t = minOf(t, maxOf(0L, d - 1000))
        // salti lunghi: si riparte dal fotogramma chiave più vicino (niente decodifica a vuoto fino al punto esatto)
        player.setSeekParameters(if (kotlin.math.abs(t - position()) > 30_000) SeekParameters.CLOSEST_SYNC else SeekParameters.DEFAULT)
        player.seekTo(t)
    }

    private fun tracksOf(type: Int): List<Triple<Int, Int, Format>> {
        val out = mutableListOf<Triple<Int, Int, Format>>()
        val groups = player.currentTracks.groups
        for (gi in groups.indices) {
            val g = groups[gi]
            if (g.type != type) continue
            for (i in 0 until g.length) if (g.isTrackSupported(i)) out.add(Triple(gi, i, g.getTrackFormat(i)))
        }
        return out
    }

    private fun isSelected(gi: Int, i: Int): Boolean = player.currentTracks.groups[gi].isTrackSelected(i)

    override fun audioTracks(): List<Track> = tracksOf(C.TRACK_TYPE_AUDIO).mapIndexed { n, (gi, i, f) ->
        val parts = mutableListOf<String>()
        langName(f.language).takeIf { it.isNotBlank() }?.let { parts.add(it) }
        f.label?.takeIf { it.isNotBlank() }?.let { parts.add(it) }
        when (f.channelCount) { 1 -> parts.add("Mono"); 2 -> parts.add("Stereo"); 6 -> parts.add("5.1"); 8 -> parts.add("7.1") }
        Track("$gi:$i", if (parts.isEmpty()) "Traccia ${n + 1}" else parts.joinToString(" · "), isSelected(gi, i))
    }

    // le tracce possono cambiare mentre il menu è aperto (cambio canale, nuovo flusso): mai un crash per questo
    override fun selectAudio(id: String) {
        try {
            val (gi, i) = id.split(":").map { it.toInt() }
            val g = player.currentTracks.groups[gi]
            player.trackSelectionParameters = player.trackSelectionParameters.buildUpon()
                .setOverrideForType(TrackSelectionOverride(g.mediaTrackGroup, i))
                .build()
        } catch (_: Exception) {}
    }

    override fun qualities(): List<Track> {
        val q = currentQuality
        val out = mutableListOf(
            Track("auto", "Automatica (consigliata)", currentQuality == "auto"),
            Track("max", "Massima disponibile", currentQuality == "max"),
        )
        tracksOf(C.TRACK_TYPE_VIDEO)
            .filter { it.third.height > 0 }
            .sortedByDescending { it.third.height * 100_000L + it.third.bitrate.coerceAtLeast(0) }
            .distinctBy { it.third.height }
            .forEach { (gi, i, f) ->
                val mbps = if (f.bitrate > 0) " · %.1f Mbps".format(Locale.ITALIAN, f.bitrate / 1_000_000.0) else ""
                val fps = if (f.frameRate > 0) " · ${f.frameRate.toInt()} fps" else ""
                out.add(Track("t:$gi:$i", "${f.height}p$fps$mbps", currentQuality == "t:$gi:$i"))
            }
        if (out.size == 2 && q.toIntOrNull() != null) out.add(Track(q, "Fino a ${q}p", true))
        return out
    }

    private fun applyQuality(q: String) {
        val b = player.trackSelectionParameters.buildUpon().clearOverridesOfType(C.TRACK_TYPE_VIDEO)
        when {
            q == "max" -> b.setForceHighestSupportedBitrate(true).clearVideoSizeConstraints()
            q.toIntOrNull() != null -> b.setForceHighestSupportedBitrate(true).setMaxVideoSize(Int.MAX_VALUE, q.toInt())
            else -> b.setForceHighestSupportedBitrate(false).clearVideoSizeConstraints()
        }
        player.trackSelectionParameters = b.build()
        currentQuality = q
    }

    override fun selectQuality(id: String) {
        if (id.startsWith("t:")) {
            try {
                val (_, gi, i) = id.split(":")
                val g = player.currentTracks.groups[gi.toInt()]
                player.trackSelectionParameters = player.trackSelectionParameters.buildUpon()
                    .clearVideoSizeConstraints()
                    .setOverrideForType(TrackSelectionOverride(g.mediaTrackGroup, i.toInt()))
                    .build()
                currentQuality = id
            } catch (_: Exception) {}
        } else applyQuality(id)
    }

    override fun subtitles(): List<Track> {
        val disabled = player.trackSelectionParameters.disabledTrackTypes.contains(C.TRACK_TYPE_TEXT)
        val list = tracksOf(C.TRACK_TYPE_TEXT)
        val out = mutableListOf(Track("off", "Disattivati", disabled || list.none { isSelected(it.first, it.second) }))
        list.forEachIndexed { n, (gi, i, f) ->
            val name = listOf(langName(f.language), f.label ?: "").filter { it.isNotBlank() }.joinToString(" · ")
            out.add(Track("$gi:$i", name.ifBlank { "Sottotitoli ${n + 1}" }, !disabled && isSelected(gi, i)))
        }
        return out
    }

    override fun selectSubtitle(id: String) {
        try {
            val b = player.trackSelectionParameters.buildUpon()
            if (id == "off") b.setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true)
            else {
                val (gi, i) = id.split(":").map { it.toInt() }
                b.setTrackTypeDisabled(C.TRACK_TYPE_TEXT, false)
                    .setOverrideForType(TrackSelectionOverride(player.currentTracks.groups[gi].mediaTrackGroup, i))
            }
            player.trackSelectionParameters = b.build()
        } catch (_: Exception) {}
    }

    override fun setAspect(mode: String) {
        resize = resizeOf(mode)
        pv.resizeMode = resize
    }

    override fun videoHeight(): Int = player.videoSize.height
    /** dimensione dei sottotitoli (1 = normale) */
    fun setSubtitleScale(f: Float) {
        subFactor = f
        pv.subtitleView?.setFractionalTextSize(androidx.media3.ui.SubtitleView.DEFAULT_TEXT_SIZE_FRACTION * f)
    }
    /** descrizione del video in onda, es. "1080p · 50 fps · 6,2 Mbps" */
    fun videoInfo(): String {
        val f = player.videoFormat ?: return ""
        val parts = mutableListOf<String>()
        if (f.height > 0) parts.add("${f.height}p")
        if (f.frameRate > 0) parts.add("${f.frameRate.toInt()} fps")
        if (f.bitrate > 0) parts.add(String.format(Locale.ITALIAN, "%.1f Mbps", f.bitrate / 1_000_000.0))
        f.sampleMimeType?.substringAfter('/')?.uppercase(Locale.ROOT)?.let { if (it.isNotBlank()) parts.add(it.replace("AVC", "H.264").replace("HEVC", "H.265")) }
        return parts.joinToString(" · ")
    }
    override fun release() {
        if (released) return
        released = true
        main.removeCallbacks(moveTimeout)
        moveCb = null; moveArmed = false
        dropOldView()
        pv.player = null
        player.release()
    }
}

/* ======================================================================= */
/* VLC                                                                     */
/* ======================================================================= */
class VlcEngine(ctx: Context, private val l: EngineListener, ua: String, private val prefs: PlayPrefs) : Engine {
    override val name = "vlc"
    private val layout = VLCVideoLayout(ctx)
    override val view: View get() = layout
    private val lib: LibVLC
    private val mp: MediaPlayer
    private var url = ""
    private var maxH = prefs.maxHeight

    init {
        val opts = arrayListOf(
            "--network-caching=${prefs.vlcCacheMs}",
            "--live-caching=${prefs.vlcCacheMs}",
            "--file-caching=1500",
            "--http-reconnect",
            "--clock-jitter=0",
            "--clock-synchro=0",
            "--drop-late-frames",
            "--skip-frames",
            "--avcodec-skiploopfilter=1",
            "--audio-time-stretch",
            "--no-stats",
        )
        if (ua.isNotBlank()) opts.add("--http-user-agent=$ua")
        lib = LibVLC(ctx, opts)
        mp = MediaPlayer(lib)
        mp.attachViews(layout, null, true, false)
        mp.setEventListener { e ->
            when (e.type) {
                MediaPlayer.Event.Buffering -> l.onBuffering(e.buffering < 99.9f)
                MediaPlayer.Event.Playing -> { l.onBuffering(false); l.onReady() }
                MediaPlayer.Event.EncounteredError -> l.onError("VLC_ERROR")
                MediaPlayer.Event.EndReached -> l.onEnded()
                MediaPlayer.Event.Vout -> if (e.voutCount > 0) l.onFirstFrame()
                else -> {}
            }
        }
        setAspect(prefs.aspect)
    }

    override fun play(url: String, startMs: Long) {
        this.url = url
        val m = Media(lib, Uri.parse(url))
        m.setHWDecoderEnabled(prefs.hw != "off", false)
        if (maxH > 0) m.addOption(":adaptive-maxheight=$maxH")
        if (startMs > 0) m.addOption(":start-time=${startMs / 1000.0}")
        mp.media = m
        m.release()
        mp.play()
    }

    override fun stop() { mp.stop() }
    override fun togglePause() { if (mp.isPlaying) mp.pause() else mp.play() }
    override fun isPlaying(): Boolean = mp.isPlaying
    override fun position(): Long = maxOf(0L, mp.time)
    override fun duration(): Long = maxOf(0L, mp.length)
    override fun seekBy(ms: Long) = seekTo(position() + ms)
    override fun seekTo(ms: Long) {
        val d = duration()
        if (d <= 2000) return
        val t = ms.coerceIn(0L, d - 1000)
        // salti lunghi: ricerca veloce di libVLC (al fotogramma chiave, come fa l'app VLC); brevi: precisa
        if (kotlin.math.abs(t - position()) > 30_000) mp.setTime(t, true) else mp.time = t
    }

    override fun audioTracks(): List<Track> {
        val cur = mp.audioTrack
        return (mp.audioTracks ?: emptyArray()).filter { it.id >= 0 }.map { Track(it.id.toString(), it.name ?: "Traccia ${it.id}", it.id == cur) }
    }
    override fun selectAudio(id: String) { id.toIntOrNull()?.let { mp.setAudioTrack(it) } }

    override fun qualities(): List<Track> = listOf(
        Track("auto", "Automatica (consigliata)", maxH == 0),
        Track("1080", "Fino a 1080p", maxH == 1080),
        Track("720", "Fino a 720p", maxH == 720),
        Track("480", "Fino a 480p (connessioni lente)", maxH == 480),
    )
    override fun selectQuality(id: String) {
        val h = if (id == "max" || id == "auto") 0 else id.toIntOrNull() ?: 0
        if (h == maxH) return
        maxH = h
        if (url.isNotEmpty()) { val t = position(); play(url, t) }
    }

    override fun subtitles(): List<Track> {
        val cur = mp.spuTrack
        val list = (mp.spuTracks ?: emptyArray()).filter { it.id >= 0 }
        return listOf(Track("-1", "Disattivati", cur < 0)) + list.map { Track(it.id.toString(), it.name ?: "Sottotitoli ${it.id}", it.id == cur) }
    }
    override fun selectSubtitle(id: String) { mp.setSpuTrack(id.toIntOrNull() ?: -1) }

    override fun setAspect(mode: String) {
        mp.setVideoScale(
            when (mode) {
                "fill" -> MediaPlayer.ScaleType.SURFACE_FILL
                "zoom" -> MediaPlayer.ScaleType.SURFACE_FIT_SCREEN
                else -> MediaPlayer.ScaleType.SURFACE_BEST_FIT
            },
        )
    }

    override fun videoHeight(): Int = try { mp.currentVideoTrack?.height ?: 0 } catch (_: Exception) { 0 }

    private var released = false
    override fun release() {
        if (released) return
        released = true
        try { mp.setEventListener(null) } catch (_: Exception) {} // nessun evento verso una schermata già chiusa
        try { mp.stop() } catch (_: Exception) {}
        try { mp.detachViews() } catch (_: Exception) {}
        mp.release()
        lib.release()
    }
}
