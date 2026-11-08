package com.kairos.player

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Environment
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.io.InputStream
import java.io.InterruptedIOException
import java.io.OutputStream
import java.net.HttpURLConnection
import java.net.SocketTimeoutException
import java.net.URL
import java.net.UnknownHostException
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import javax.crypto.Cipher
import javax.crypto.spec.IvParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * Registrazioni dei canali (come il PVR di TiviMate).
 * - flussi MPEG-TS / progressivi: i byte vengono copiati nel file
 * - HLS: variante con BANDWIDTH più alto, segmenti nuovi accodati in ordine (TS → .ts, fMP4 → .mp4)
 * - riconnessione automatica fino alla fine prevista, si ferma se lo spazio libero scende sotto 300 MB
 * - le registrazioni programmate attendono nel servizio in primo piano; l'indice (filesDir/recordings.json)
 *   sopravvive al riavvio dell'app: MainActivity chiama [init] e le riprogramma.
 */
object Recorder {
    private const val MAX_MS = 6L * 3600_000L          // durata massima di una registrazione
    internal const val MIN_FREE = 300L * 1024 * 1024    // spazio minimo da lasciare libero
    private const val GIVE_UP_MS = 10L * 60_000L        // senza fine prevista: 10 minuti senza dati → stop
    private const val LATE_MS = 30L * 60_000L           // programmata senza fine: avvio in ritardo consentito

    internal class Rec(val id: String, val chId: String, val name: String, val url: String, val at: Long, val until: Long) {
        @Volatile var start = 0L
        @Volatile var end = 0L
        @Volatile var path = ""
        @Volatile var bytes = 0L
        @Volatile var state = "scheduled" // scheduled | rec | done | error
        @Volatile var err = ""

        fun json(disk: Boolean): JSONObject {
            val o = JSONObject()
                .put("id", id).put("chId", chId).put("name", name)
                .put("path", path).put("url", if (path.isNotEmpty()) "file://$path" else "")
                .put("at", at).put("until", until).put("start", start).put("end", end)
                .put("bytes", bytes).put("state", state).put("err", err)
            if (disk) o.put("src", url) // l'indirizzo del flusso resta solo sul disco dell'app
            return o
        }
    }

    internal class Snap(val active: List<Rec>, val nextAt: Long, val nextName: String)

    private val lock = Any()
    private val recs = LinkedHashMap<String, Rec>()
    private val workers = HashMap<String, Worker>()
    private var loaded = false
    private var saveTick = 0
    @Volatile private var app: Context? = null
    internal val main = Handler(Looper.getMainLooper())
    @Volatile internal var svc: RecService? = null

    /** User-Agent usato per i flussi (lo imposta MainActivity, uguale a quello del player) */
    @Volatile var ua: String = ""

    /** riceve l'elenco aggiornato (JSON) a ogni cambiamento e ogni ~10 s durante le registrazioni */
    @Volatile var listener: ((String) -> Unit)? = null

    internal fun userAgent(): String = ua.ifEmpty { "Mozilla/5.0 (Linux; Android ${Build.VERSION.RELEASE}) KairosPlayer/${BuildConfig.VERSION_NAME}" }

    /* ------------------------------------------------------------------ */
    /* API pubblica                                                         */
    /* ------------------------------------------------------------------ */

    /**
     * Avvia (at = 0 o nel passato) o programma (at = epoch ms) una registrazione.
     * until = fine prevista in epoch ms (0 = fino allo stop manuale, massimo 6 ore).
     * Restituisce l'id della registrazione oppure "" se non è valida.
     */
    fun start(ctx: Context, chId: String, name: String, url: String, at: Long = 0L, until: Long = 0L): String {
        val a = ctx.applicationContext
        ensure(a)
        val u = url.trim()
        if (!u.startsWith("http://", true) && !u.startsWith("https://", true)) return ""
        val now = System.currentTimeMillis()
        val later = at > now + 5_000
        if (until in 1..now) return ""
        if (later && until in 1..at) return ""
        val id = synchronized(lock) {
            if (!later) recs.values.firstOrNull { it.chId == chId && it.state == "rec" }?.let { return it.id }
            var nid: String
            do { nid = "r" + now.toString(36) + (Math.random() * 46656).toInt().toString(36) } while (recs.containsKey(nid))
            val r = Rec(nid, chId, name.trim().take(120).ifEmpty { "Canale" }, u, if (later) at else now, until)
            r.state = if (later) "scheduled" else "rec"
            recs[nid] = r
            saveLocked()
            nid
        }
        kick(a)
        changed()
        return id
    }

    /** ferma una registrazione in corso (il file resta) o annulla una programmata */
    fun stop(ctx: Context, recId: String) {
        ensure(ctx.applicationContext)
        val w = synchronized(lock) {
            val r = recs[recId] ?: return
            var found: Worker? = null
            if (r.state == "scheduled") {
                recs.remove(recId)
                saveLocked()
            } else if (r.state == "rec") {
                found = workers[recId]
                if (found == null) {
                    r.end = System.currentTimeMillis()
                    r.state = if (r.bytes > 0) "done" else "error"
                    if (r.bytes == 0L) r.err = "Annullata"
                    saveLocked()
                }
            }
            found
        }
        w?.cancel()
        changed()
        evaluateLater()
    }

    /** id della registrazione in corso per quel canale, se c'è */
    fun activeFor(chId: String): String? = synchronized(lock) {
        recs.values.firstOrNull { it.chId == chId && it.state == "rec" }?.id
    }

    /** elenco per l'interfaccia (JSON array) */
    fun listJson(): String {
        app?.let { try { ensure(it) } catch (_: Throwable) {} } // indice ancora in caricamento (initAsync): si aspetta la fine
        return synchronized(lock) {
            val a = JSONArray()
            recs.values.sortedByDescending { if (it.start > 0) it.start else it.at }.forEach { a.put(it.json(false)) }
            a.toString()
        }
    }

    /** elimina la registrazione (e il file); se è in corso viene prima fermata */
    fun delete(ctx: Context, id: String): Boolean {
        val a = ctx.applicationContext
        ensure(a)
        val p = synchronized(lock) {
            val r = recs.remove(id) ?: return false
            val w = workers.remove(id)
            saveLocked()
            Pair(r, w)
        }
        p.second?.cancel()
        deleteFile(a, p.first.path)
        changed()
        evaluateLater()
        return true
    }

    fun freeJson(ctx: Context): String {
        val d = dir(ctx)
        return JSONObject().put("free", d.usableSpace).put("total", d.totalSpace).toString()
    }

    /** chiamato all'avvio dell'app: carica l'indice e riprogramma le registrazioni in attesa */
    fun init(ctx: Context) {
        val a = ctx.applicationContext
        ensure(a)
        if (hasWork()) kick(a)
    }

    /** come init, ma il file dell'indice si legge in sottofondo (avvio dell'app senza I/O sul thread dell'interfaccia);
     *  chi legge la lista prima della fine aspetta il caricamento (ensure è sincronizzato) */
    fun initAsync(ctx: Context) {
        val a = ctx.applicationContext
        if (app == null) app = a
        Thread({ try { init(a) } catch (_: Throwable) {} }, "kx-rec-init").start()
    }

    /** carica l'indice (servizio riavviato dalla sveglia in un processo nuovo, prima della prima notifica) */
    internal fun prepare(ctx: Context) = ensure(ctx.applicationContext)

    fun hasWork(): Boolean = synchronized(lock) { recs.values.any { it.state == "scheduled" || it.state == "rec" } }

    /** cartella delle registrazioni: Movies/Registrazioni della memoria dell'app (in alternativa filesDir) */
    fun dir(ctx: Context): File {
        val a = ctx.applicationContext
        val ext = try { a.getExternalFilesDir(Environment.DIRECTORY_MOVIES) } catch (_: Throwable) { null }
        val base: File = if (ext != null && mounted(ext)) ext else a.filesDir
        val d = File(base, "Registrazioni")
        if (!d.exists()) d.mkdirs()
        if (d.isDirectory) return d
        return File(a.filesDir, "Registrazioni").apply { mkdirs() }
    }

    private fun mounted(f: File): Boolean = try { Environment.MEDIA_MOUNTED == Environment.getExternalStorageState(f) } catch (_: Throwable) { false }

    /* ------------------------------------------------------------------ */
    /* Interno                                                              */
    /* ------------------------------------------------------------------ */

    private fun ensure(a: Context) {
        if (app == null) app = a
        synchronized(lock) {
            if (loaded) return
            loaded = true
            load(a)
            // indice di un avvio precedente: nessuna registrazione è davvero in corso in questo processo
            val now = System.currentTimeMillis()
            var dirty = false
            for (r in recs.values) {
                if (r.state == "rec") {
                    if (r.path.isNotEmpty()) { val len = File(r.path).length(); if (len > 0) r.bytes = len }
                    r.state = if (r.bytes > 0) "done" else "error"
                    if (r.end == 0L) r.end = now
                    r.err = "Interrotta: l'app è stata chiusa"
                    dirty = true
                } else if (r.state == "scheduled" && r.at <= now) {
                    val ok = if (r.until > 0) r.until > now + 60_000 else now - r.at < LATE_MS
                    if (!ok) {
                        r.state = "error"; r.end = now
                        r.err = "Non avviata: l'app era chiusa all'orario previsto"
                        dirty = true
                    }
                }
            }
            if (dirty) saveLocked()
        }
    }

    private fun load(a: Context) {
        try {
            val f = File(a.filesDir, "recordings.json")
            if (!f.exists()) return
            val arr = JSONArray(f.readText())
            for (i in 0 until arr.length()) {
                val o = arr.optJSONObject(i) ?: continue
                val id = o.optString("id")
                if (id.isEmpty()) continue
                val r = Rec(id, o.optString("chId"), o.optString("name"), o.optString("src"), o.optLong("at"), o.optLong("until"))
                r.start = o.optLong("start"); r.end = o.optLong("end"); r.path = o.optString("path")
                r.bytes = o.optLong("bytes"); r.state = o.optString("state", "error"); r.err = o.optString("err")
                recs[id] = r
            }
        } catch (_: Exception) {}
    }

    private val saveIo = java.util.concurrent.Executors.newSingleThreadExecutor { r -> Thread(r, "kx-rec-io").apply { isDaemon = true } }
    /** istantanea sotto il lock, scrittura su disco fuori dal thread chiamante (il tasto Registra non aspetta la memoria del dispositivo) */
    private fun saveLocked() {
        val a = app ?: return
        val text = try { JSONArray().also { arr -> for (r in recs.values) arr.put(r.json(true)) }.toString() } catch (_: Exception) { return }
        saveIo.execute {
            try {
                val f = File(a.filesDir, "recordings.json")
                val t = File(a.filesDir, "recordings.json.tmp")
                t.writeText(text, Charsets.UTF_8)
                if (!t.renameTo(f)) { f.delete(); t.renameTo(f) }
            } catch (_: Exception) {}
        }
    }

    private fun deleteFile(a: Context, path: String) {
        if (path.isEmpty()) return
        try {
            val f = File(path).canonicalFile
            val ok = listOf(dir(a), File(a.filesDir, "Registrazioni")).any { f.path.startsWith(it.canonicalPath + File.separator) }
            if (ok) f.delete()
        } catch (_: Exception) {}
    }

    /** avvisa il servizio (o lo avvia) sul thread principale */
    private fun kick(a: Context) {
        main.post {
            val s = svc
            if (s != null && !s.stopping) s.evaluate() else startService(a)
        }
    }

    private fun startService(a: Context) {
        val i = Intent(a, RecService::class.java)
        try {
            if (Build.VERSION.SDK_INT >= 26) a.startForegroundService(i) else a.startService(i)
        } catch (e: Exception) {
            // Android 12+: con l'app in secondo piano il servizio in primo piano non può partire
            failPending("Apri l'app per avviare la registrazione")
        }
    }

    private fun failPending(msg: String) {
        synchronized(lock) {
            val now = System.currentTimeMillis()
            for (r in recs.values) if (r.state == "rec" && workers[r.id] == null) { r.state = "error"; r.err = msg; r.end = now }
            saveLocked()
        }
        changed()
    }

    internal fun evaluateLater() { main.post { svc?.evaluate() } }

    internal fun changed() {
        val l = listener ?: return
        try { l(listJson()) } catch (_: Throwable) {}
    }

    /** avvia i lavori dovuti (servizio, thread principale) */
    internal fun pump(a: Context) {
        ensure(a.applicationContext) // il servizio può ripartire da solo (sveglia) in un processo nuovo
        val now = System.currentTimeMillis()
        val toStart = ArrayList<Worker>()
        synchronized(lock) {
            var dirty = false
            for (r in recs.values) {
                if (r.state == "scheduled" && r.at <= now) { r.state = "rec"; dirty = true }
                if (r.state == "rec" && workers[r.id] == null) {
                    if (dir(a).usableSpace < MIN_FREE) {
                        r.state = "error"; r.err = "Spazio insufficiente sul dispositivo"; r.end = now
                        dirty = true
                        continue
                    }
                    r.start = now
                    val w = Worker(a.applicationContext, r) // non trattiene il servizio dopo la sua chiusura
                    workers[r.id] = w
                    toStart.add(w)
                    dirty = true
                }
            }
            if (dirty) saveLocked()
        }
        for (w in toStart) w.start()
        if (toStart.isNotEmpty()) changed()
    }

    internal fun snap(): Snap = synchronized(lock) {
        val act = recs.values.filter { it.state == "rec" }
        val next = recs.values.filter { it.state == "scheduled" }.minByOrNull { it.at }
        Snap(act, next?.at ?: 0L, next?.name ?: "")
    }

    /** ogni 10 s dal servizio: aggiorna l'interfaccia (dimensione dei file) e ogni minuto salva l'indice */
    internal fun tick() {
        val active = synchronized(lock) {
            val act = workers.isNotEmpty()
            if (act && ++saveTick % 6 == 0) saveLocked()
            act
        }
        if (active) changed()
    }

    internal fun pathKnown() {
        synchronized(lock) { saveLocked() }
        changed()
    }

    /** "Ferma" nella notifica: ferma quelle in corso; se non ce ne sono annulla le programmate */
    internal fun stopFromNotification() {
        val ws = synchronized(lock) {
            val act = workers.values.toList()
            if (act.isEmpty()) {
                val iter = recs.values.iterator()
                while (iter.hasNext()) if (iter.next().state == "scheduled") iter.remove()
                saveLocked()
            }
            act
        }
        for (w in ws) w.cancel()
        changed()
    }

    /** il sistema non permette di continuare: si ferma tutto */
    internal fun stopEverything(msg: String) {
        val ws = synchronized(lock) {
            val now = System.currentTimeMillis()
            for (r in recs.values) {
                if (r.state == "scheduled" || (r.state == "rec" && workers[r.id] == null)) { r.state = "error"; r.err = msg; r.end = now }
            }
            saveLocked()
            workers.values.toList()
        }
        for (w in ws) w.cancel(msg)
        changed()
    }

    internal fun finished(w: Worker, err: String, info: String) {
        val r = w.r
        val gone = synchronized(lock) {
            if (workers[r.id] === w) workers.remove(r.id)
            if (recs[r.id] !== r) true
            else {
                r.end = System.currentTimeMillis()
                if (r.path.isNotEmpty()) { val len = File(r.path).length(); if (len > 0) r.bytes = len }
                if (r.bytes > 0) {
                    r.state = "done"
                    r.err = info
                } else {
                    r.state = "error"
                    r.err = err.ifEmpty { info }.ifEmpty { "Nessun dato ricevuto dal canale" }
                    if (r.path.isNotEmpty()) { try { File(r.path).delete() } catch (_: Exception) {}; r.path = "" }
                }
                saveLocked()
                false
            }
        }
        if (gone) deleteFile(w.app, r.path) // eliminata mentre registrava
        changed()
        evaluateLater()
    }

    /* ------------------------------------------------------------------ */
    /* Registrazione di un flusso                                           */
    /* ------------------------------------------------------------------ */
    internal class Worker(val app: Context, val r: Rec) : Thread("kx-rec") {
        @Volatile private var stopFlag = false
        @Volatile private var conn: HttpURLConnection? = null
        @Volatile private var info = ""
        private val dir = Recorder.dir(app)
        private var out: OutputStream? = null
        private var fmt = ""
        private var deadline = 0L
        private var lastData = 0L
        private var backoff = 1000L
        private var hls = false
        private var ended = false
        private var spaceOut = false
        private var fatal = ""
        // HLS: stato mantenuto tra le riconnessioni (niente segmenti doppi)
        private var hlsStarted = false
        private var lastSeq = -1L
        private var lastUri = ""
        private var useSeq = true
        private var initDone = false
        private var lastNew = 0L
        private val keys = HashMap<String, ByteArray>()

        init { isDaemon = true }

        fun cancel(msg: String = "") {
            if (msg.isNotEmpty()) info = msg
            stopFlag = true
            try { conn?.disconnect() } catch (_: Throwable) {}
        }

        private fun now() = System.currentTimeMillis()

        override fun run() {
            var err = ""
            try {
                val begin = if (r.start > 0) r.start else now()
                deadline = if (r.until > 0) minOf(r.until, begin + MAX_MS) else begin + MAX_MS
                lastData = now()
                while (!stopFlag && now() < deadline && !ended && !spaceOut && fatal.isEmpty()) {
                    if (dir.usableSpace < MIN_FREE) { spaceOut = true; break }
                    try {
                        if (hls) runHls(null, null) else connect()
                    } catch (e: Throwable) {
                        if (e is OutOfMemoryError) { fatal = "Memoria insufficiente"; break }
                        if (stopFlag) break
                        err = describe(e)
                    }
                    if (stopFlag || ended || spaceOut || fatal.isNotEmpty() || now() >= deadline) break
                    if (r.until <= 0 && now() - lastData > GIVE_UP_MS) { info = "Il canale ha smesso di trasmettere"; break }
                    pause(backoff)
                    backoff = (backoff * 2).coerceAtMost(30_000L)
                }
            } catch (t: Throwable) {
                err = if (t is OutOfMemoryError) "Memoria insufficiente" else describe(t)
            } finally {
                try { out?.flush() } catch (_: Throwable) {}
                try { out?.close() } catch (_: Throwable) {}
                try { conn?.disconnect() } catch (_: Throwable) {}
                if (fatal.isNotEmpty()) { err = fatal; if (info.isEmpty()) info = fatal }
                if (spaceOut) info = "Spazio esaurito: registrazione interrotta"
                else if (info.isEmpty() && !stopFlag && !ended && r.until <= 0 && now() >= deadline) info = "Durata massima di 6 ore raggiunta"
                Recorder.finished(this, err, info)
            }
        }

        /** primo collegamento (o riconnessione di un flusso progressivo) */
        private fun connect() {
            val c = open(r.url, null)
            val ct = (c.contentType ?: "").lowercase(Locale.ROOT)
            val path = (c.url.path ?: "").lowercase(Locale.ROOT)
            val input = BufferedInputStream(c.inputStream, 64 * 1024)
            input.mark(64)
            val head = ByteArray(8)
            val hn = readSome(input, head)
            input.reset()
            val isPlaylist = ct.contains("mpegurl") || path.endsWith(".m3u8") || path.endsWith(".m3u") ||
                (hn >= 7 && String(head, 0, 7, Charsets.ISO_8859_1) == "#EXTM3U")
            if (isPlaylist) {
                val text = readText(input, 4 * 1024 * 1024)
                conn = null
                hls = true
                runHls(text, c.url.toString())
                return
            }
            if (out == null) {
                if (stopFlag) return
                openOut(extFor(ct, path, head, hn))
            }
            copy(input)
            conn = null
            try { c.disconnect() } catch (_: Throwable) {}
        }

        private fun copy(input: InputStream) {
            val buf = ByteArray(64 * 1024)
            var since = 0L
            input.use { s ->
                while (!stopFlag && System.currentTimeMillis() < deadline) {
                    val n = s.read(buf)
                    if (n < 0) break
                    if (n == 0) continue
                    write(buf, 0, n)
                    since += n
                    if (since >= 16L * 1024 * 1024) {
                        since = 0
                        if (dir.usableSpace < MIN_FREE) { spaceOut = true; break }
                    }
                }
            }
        }

        /* ---------------- HLS ---------------- */
        private fun runHls(firstText: String?, firstBase: String?) {
            var text: String
            var base: String
            if (firstText != null && firstBase != null) { text = firstText; base = firstBase }
            else { val p = fetchText(r.url); text = p.first; base = p.second }
            var mediaReq = r.url
            if (text.contains("#EXT-X-STREAM-INF")) {
                val v = bestVariant(text, base) ?: throw IOException("playlist senza flussi video")
                mediaReq = v
                val p = fetchText(v); text = p.first; base = p.second
            }
            lastNew = now()
            while (!stopFlag && now() < deadline) {
                val pl = parseMedia(text, base)
                for (s in pickNew(pl)) {
                    if (stopFlag || now() >= deadline) return
                    if (dir.usableSpace < MIN_FREE) { spaceOut = true; return }
                    saveSegment(pl, s)
                    lastSeq = s.seq
                    lastUri = s.uri
                    lastNew = now()
                }
                if (pl.ended) { ended = true; return }
                // playlist ferma da troppo tempo: si ricollega dall'inizio (master compresa)
                if (now() - lastNew > maxOf(30_000L, (pl.target * 3000).toLong())) throw IOException("la playlist non si aggiorna")
                pause(((pl.target * 1000) / 2).toLong().coerceIn(1000L, 5000L))
                if (stopFlag) return
                val p = fetchText(mediaReq); text = p.first; base = p.second
            }
        }

        private fun pickNew(pl: MediaPl): List<Seg> {
            val segs = pl.segs
            if (segs.isEmpty()) return emptyList()
            if (!hlsStarted) {
                hlsStarted = true
                // diretta: si parte dal punto attuale (ultimi 3 segmenti); playlist chiusa: tutta
                return if (pl.ended) segs else segs.takeLast(3)
            }
            if (useSeq && pl.hasSeq) {
                if (segs.last().seq < lastSeq) return segs.takeLast(3) // numerazione ripartita (server riavviato)
                val p = segs.filter { it.seq > lastSeq }
                if (p.isNotEmpty() || segs.last().uri == lastUri) return p
                useSeq = false // numerazione ferma ma segmenti nuovi: si usano gli indirizzi
            }
            var i = segs.indexOfLast { it.uri == lastUri }
            if (i < 0) { val k = lastUri.substringBefore('?'); i = segs.indexOfLast { it.uri.substringBefore('?') == k } }
            return if (i >= 0) segs.subList(i + 1, segs.size) else segs.takeLast(3)
        }

        private fun saveSegment(pl: MediaPl, s: Seg) {
            val k = s.key
            if (k != null && k.method != "AES-128") { fatal = "Canale protetto (DRM): non registrabile"; throw IOException(fatal) }
            val su = s.uri.substringBefore('?').lowercase(Locale.ROOT)
            val mp4 = pl.mapUri != null || su.endsWith(".m4s") || su.endsWith(".mp4") || su.endsWith(".cmfv")
            if (out == null) {
                if (stopFlag) return
                openOut(if (mp4) "mp4" else if (su.endsWith(".aac")) "aac" else "ts")
            }
            val map = pl.mapUri
            if (map != null && !initDone) {
                val b = fetch(map, pl.mapLen, pl.mapOff)
                write(b.arr(), 0, b.len())
                initDone = true
            }
            if (k == null && !mp4) { stream(s); return } // TS in chiaro: direttamente nel file
            val b = fetch(s.uri, s.len, s.off)
            if (k != null) {
                val dec = decrypt(b, k, s.seq)
                write(dec, 0, dec.size)
            } else write(b.arr(), 0, b.len())
        }

        private fun stream(s: Seg) {
            val c = open(s.uri, range(s.len, s.off))
            val buf = ByteArray(64 * 1024)
            c.inputStream.use { inp ->
                while (true) {
                    if (stopFlag) throw InterruptedIOException("fermata")
                    val n = inp.read(buf)
                    if (n < 0) break
                    if (n > 0) write(buf, 0, n)
                }
            }
            conn = null
        }

        private fun fetch(u: String, len: Long, off: Long): RecBuf {
            val c = open(u, range(len, off))
            val cl = c.contentLength
            val b = RecBuf(if (cl in 1..(32 * 1024 * 1024)) cl else 512 * 1024)
            val tmp = ByteArray(64 * 1024)
            c.inputStream.use { inp ->
                while (true) {
                    if (stopFlag) throw InterruptedIOException("fermata")
                    val n = inp.read(tmp)
                    if (n < 0) break
                    b.write(tmp, 0, n)
                    if (b.len() > 64 * 1024 * 1024) throw IOException("segmento troppo grande")
                }
            }
            conn = null
            return b
        }

        private fun decrypt(b: RecBuf, k: HlsKey, seq: Long): ByteArray {
            if (k.uri.isEmpty()) throw IOException("chiave del flusso mancante")
            val key = keys[k.uri] ?: run {
                val kb = fetch(k.uri, -1L, 0L)
                if (kb.len() != 16) throw IOException("chiave del flusso non valida")
                if (keys.size > 64) keys.clear()
                val arr = kb.toByteArray()
                keys[k.uri] = arr
                arr
            }
            val iv = k.iv ?: ByteArray(16).also { a ->
                var v = seq
                for (i in 15 downTo 8) { a[i] = (v and 0xff).toByte(); v = v shr 8 }
            }
            val c = Cipher.getInstance("AES/CBC/PKCS5Padding")
            c.init(Cipher.DECRYPT_MODE, SecretKeySpec(key, "AES"), IvParameterSpec(iv))
            return c.doFinal(b.arr(), 0, b.len())
        }

        /* ---------------- rete e file ---------------- */
        private fun open(u: String, range: String?): HttpURLConnection {
            var target = URL(u)
            var hops = 0
            while (true) {
                if (stopFlag) throw InterruptedIOException("fermata")
                val c = target.openConnection() as HttpURLConnection
                c.instanceFollowRedirects = false
                c.connectTimeout = 15_000
                c.readTimeout = 20_000
                c.useCaches = false
                c.setRequestProperty("User-Agent", Recorder.userAgent())
                c.setRequestProperty("Accept", "*/*")
                c.setRequestProperty("Accept-Encoding", "identity")
                if (range != null) c.setRequestProperty("Range", range)
                conn = c
                val code = c.responseCode
                if (code in 300..399) {
                    val loc: String? = c.getHeaderField("Location")
                    try { c.disconnect() } catch (_: Throwable) {}
                    if (loc == null || loc.isEmpty() || ++hops > 8) throw IOException("HTTP $code")
                    target = URL(target, loc) // anche da http a https e viceversa
                    continue
                }
                if (code !in 200..299) {
                    try { c.disconnect() } catch (_: Throwable) {}
                    throw HttpError(code)
                }
                return c
            }
        }

        private fun fetchText(u: String): Pair<String, String> {
            val c = open(u, null)
            val t = readText(c.inputStream, 4 * 1024 * 1024)
            conn = null
            return Pair(t, c.url.toString())
        }

        private fun readText(i: InputStream, cap: Int): String {
            val bo = ByteArrayOutputStream()
            val buf = ByteArray(16 * 1024)
            var tot = 0
            i.use { s ->
                while (true) {
                    val n = s.read(buf)
                    if (n < 0) break
                    bo.write(buf, 0, n)
                    tot += n
                    if (tot > cap) throw IOException("playlist troppo grande")
                }
            }
            return bo.toString("UTF-8")
        }

        private fun readSome(i: InputStream, b: ByteArray): Int {
            var n = 0
            while (n < b.size) {
                val k = i.read(b, n, b.size - n)
                if (k < 0) break
                n += k
            }
            return n
        }

        private fun write(b: ByteArray, off: Int, len: Int) {
            val o = out ?: throw IOException("file non aperto")
            o.write(b, off, len)
            r.bytes += len
            lastData = System.currentTimeMillis()
            backoff = 1000L
        }

        private fun openOut(ext: String) {
            val day = SimpleDateFormat("yyyy-MM-dd_HH-mm", Locale.ITALY).format(Date(if (r.start > 0) r.start else now()))
            val base = safeName(r.name) + "_" + day
            var f = File(dir, "$base.$ext")
            var k = 2
            while (f.exists()) f = File(dir, base + "_" + (k++) + "." + ext)
            out = BufferedOutputStream(FileOutputStream(f, true), 256 * 1024)
            fmt = ext
            r.path = f.absolutePath
            Recorder.pathKnown()
        }

        private fun pause(ms: Long) {
            val end = System.currentTimeMillis() + ms
            while (!stopFlag && System.currentTimeMillis() < end && System.currentTimeMillis() < deadline) {
                try { Thread.sleep(250) } catch (_: InterruptedException) { return }
            }
        }

        private fun safeName(n: String): String {
            val s = java.text.Normalizer.normalize(n, java.text.Normalizer.Form.NFD)
                .replace(Regex("\\p{M}+"), "")
                .replace(Regex("[^A-Za-z0-9]+"), "_")
                .trim('_')
                .take(40)
            return s.ifEmpty { "Registrazione" }
        }

        private fun extFor(ct: String, path: String, head: ByteArray, hn: Int): String = when {
            hn > 0 && head[0] == 0x47.toByte() -> "ts"
            ct.contains("mp2t") || path.endsWith(".ts") -> "ts"
            ct.contains("mp4") || path.endsWith(".mp4") -> "mp4"
            ct.contains("matroska") || path.endsWith(".mkv") -> "mkv"
            ct.contains("flv") || path.endsWith(".flv") -> "flv"
            else -> "ts"
        }
    }
}

/* ---------------------------------------------------------------------- */
/* HLS: lettura delle playlist                                             */
/* ---------------------------------------------------------------------- */
private class HttpError(val code: Int) : IOException("HTTP $code")

private class HlsKey(val method: String, val uri: String, val iv: ByteArray?)

private class Seg(val uri: String, val seq: Long, val len: Long, val off: Long, val key: HlsKey?)

private class MediaPl(
    val segs: List<Seg>, val target: Double, val hasSeq: Boolean, val ended: Boolean,
    val mapUri: String?, val mapLen: Long, val mapOff: Long,
)

/** buffer che espone l'array interno (niente copie dei segmenti in memoria) */
private class RecBuf(size: Int) : ByteArrayOutputStream(size) {
    fun arr(): ByteArray = buf
    fun len(): Int = count
}

private val RX_ATTR = Regex("([A-Z0-9-]+)=(\"[^\"]*\"|[^,]*)")

private fun attrs(s: String): Map<String, String> {
    val m = HashMap<String, String>()
    for (x in RX_ATTR.findAll(s)) m[x.groupValues[1]] = x.groupValues[2].trim().removeSurrounding("\"")
    return m
}

private fun resolve(base: String, u: String): String = try { URL(URL(base), u).toString() } catch (_: Exception) { u }

private fun range(len: Long, off: Long): String? = if (len >= 0) "bytes=$off-${off + len - 1}" else null

private fun hexIv(s: String): ByteArray? {
    var h = s.trim()
    if (h.startsWith("0x") || h.startsWith("0X")) h = h.substring(2)
    if (h.isEmpty() || h.length > 32) return null
    h = h.padStart(32, '0')
    return try { ByteArray(16) { i -> h.substring(i * 2, i * 2 + 2).toInt(16).toByte() } } catch (_: Exception) { null }
}

/** variante con BANDWIDTH più alto */
private fun bestVariant(text: String, base: String): String? {
    var best: String? = null
    var bestBw = -1L
    var pending = false
    var bw = 0L
    for (raw in text.lines()) {
        val l = raw.trim()
        if (l.startsWith("#EXT-X-STREAM-INF:")) {
            pending = true
            bw = attrs(l.substringAfter(':'))["BANDWIDTH"]?.toLongOrNull() ?: 0L
        } else if (pending && l.isNotEmpty() && !l.startsWith("#")) {
            if (bw > bestBw) { bestBw = bw; best = resolve(base, l) }
            pending = false
        }
    }
    return best
}

private fun parseMedia(text: String, base: String): MediaPl {
    var target = 6.0
    var mediaSeq = 0L
    var hasSeq = false
    var ended = false
    var key: HlsKey? = null
    var mapUri: String? = null
    var mapLen = -1L
    var mapOff = 0L
    var pLen = -1L
    var pOff = -1L
    var lastEnd = 0L
    var lastU = ""
    var idx = 0
    val segs = ArrayList<Seg>()
    for (raw in text.lines()) {
        val l = raw.trim()
        if (l.isEmpty()) continue
        when {
            l.startsWith("#EXT-X-TARGETDURATION:") -> target = l.substringAfter(':').trim().toDoubleOrNull() ?: target
            l.startsWith("#EXT-X-MEDIA-SEQUENCE:") -> { mediaSeq = l.substringAfter(':').trim().toLongOrNull() ?: 0L; hasSeq = true }
            l.startsWith("#EXT-X-ENDLIST") -> ended = true
            l.startsWith("#EXT-X-KEY:") -> {
                val a = attrs(l.substringAfter(':'))
                val m = (a["METHOD"] ?: "NONE").uppercase(Locale.ROOT)
                key = if (m == "NONE") null else HlsKey(m, a["URI"]?.let { resolve(base, it) } ?: "", a["IV"]?.let { hexIv(it) })
            }
            l.startsWith("#EXT-X-MAP:") -> {
                val a = attrs(l.substringAfter(':'))
                mapUri = a["URI"]?.let { resolve(base, it) }
                val br = a["BYTERANGE"]
                if (br != null) {
                    mapLen = br.substringBefore('@').trim().toLongOrNull() ?: -1L
                    mapOff = if (br.contains('@')) br.substringAfter('@').trim().toLongOrNull() ?: 0L else 0L
                } else { mapLen = -1L; mapOff = 0L }
            }
            l.startsWith("#EXT-X-BYTERANGE:") -> {
                val v = l.substringAfter(':').trim()
                pLen = v.substringBefore('@').trim().toLongOrNull() ?: -1L
                pOff = if (v.contains('@')) v.substringAfter('@').trim().toLongOrNull() ?: 0L else -1L
            }
            l.startsWith("#") -> {}
            else -> {
                val u = resolve(base, l)
                var off = -1L
                if (pLen >= 0) {
                    off = if (pOff >= 0) pOff else if (u == lastU) lastEnd else 0L
                    lastEnd = off + pLen
                }
                segs.add(Seg(u, mediaSeq + idx, pLen, off, key))
                idx++
                lastU = u
                pLen = -1L
                pOff = -1L
            }
        }
    }
    return MediaPl(segs, if (target > 0) target else 6.0, hasSeq, ended, mapUri, mapLen, mapOff)
}

private fun describe(e: Throwable): String = when (e) {
    is HttpError -> when (e.code) {
        401, 403 -> "Accesso negato dal server (HTTP ${e.code})"
        404 -> "Canale non trovato (HTTP 404)"
        else -> "Errore del server (HTTP ${e.code})"
    }
    is UnknownHostException -> "Server non raggiungibile"
    is SocketTimeoutException -> "Il server non risponde"
    else -> "Errore di rete"
}

/* ---------------------------------------------------------------------- */
/* Servizio in primo piano: tiene viva l'app durante le registrazioni      */
/* ---------------------------------------------------------------------- */
class RecService : Service() {
    companion object {
        const val ACTION_STOP = "com.kairos.player.REC_STOP"
        const val ACTION_TICK = "com.kairos.player.REC_TICK"
        private const val CH = "kx_rec"
        private const val NID = 4242
    }

    private val h = Handler(Looper.getMainLooper())
    @Volatile var stopping = false
    private var isFg = false
    private var lastStart = 0
    private var wake: PowerManager.WakeLock? = null
    private val tick = object : Runnable {
        override fun run() {
            Recorder.tick()
            if (isFg && !stopping) { val s = Recorder.snap(); if (s.active.isNotEmpty()) refresh(s) }
            h.postDelayed(this, 10_000)
        }
    }
    private val due = Runnable { evaluate() }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        Recorder.svc = this
        try { Recorder.prepare(this) } catch (_: Throwable) {}
        h.postDelayed(tick, 10_000)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        lastStart = startId
        stopping = false
        // sempre: ogni startForegroundService() richiede startForeground() (se già in primo piano aggiorna solo la notifica)
        goForeground()
        if (intent?.action == ACTION_STOP) Recorder.stopFromNotification()
        evaluate()
        return START_NOT_STICKY
    }

    /** sul thread principale: avvia i lavori dovuti, aggiorna notifica/sveglia, si ferma se non c'è altro */
    internal fun evaluate() {
        if (stopping) return
        Recorder.pump(this)
        val s = Recorder.snap()
        if (s.active.isEmpty() && s.nextAt == 0L) { shutdown(); return }
        if (isFg) refresh(s)
        val now = System.currentTimeMillis()
        holdWake(s.active.isNotEmpty() || (s.nextAt > 0 && s.nextAt - now < 10 * 60_000L))
        h.removeCallbacks(due)
        if (s.nextAt > 0) h.postDelayed(due, (s.nextAt - now).coerceIn(500L, 30_000L))
        arm(s.nextAt)
    }

    private fun goForeground() {
        try {
            val n = build(Recorder.snap())
            when {
                Build.VERSION.SDK_INT >= 34 -> startForeground(NID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
                Build.VERSION.SDK_INT >= 29 -> startForeground(NID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
                else -> startForeground(NID, n)
            }
            isFg = true
        } catch (e: Exception) {
            // Android 12+ ricontrolla ogni nuova chiamata a startForeground(): con l'app in secondo piano può
            // rifiutarla anche se il servizio è GIÀ in primo piano (che resta tale). In quel caso le registrazioni
            // in corso non vanno fermate: si aggiorna solo la notifica.
            if (isFg) refresh(Recorder.snap())
            else Recorder.stopEverything("Registrazione non consentita dal sistema")
        }
    }

    private fun shutdown() {
        stopping = true
        h.removeCallbacks(due)
        arm(0L)
        holdWake(false)
        stopFg()
        if (!stopSelfResult(lastStart)) stopping = false // è arrivata un'altra richiesta: si continua
    }

    private fun stopFg() {
        try {
            @Suppress("DEPRECATION")
            stopForeground(true)
        } catch (_: Exception) {}
        isFg = false
    }

    /** Android 15+: limite di tempo dei servizi dataSync (qui usato solo fino ad Android 13) */
    override fun onTimeout(startId: Int, fgsType: Int) {
        Recorder.stopEverything("Tempo massimo consentito da Android raggiunto")
        stopping = true
        holdWake(false)
        stopFg()
        stopSelf()
    }

    override fun onDestroy() {
        h.removeCallbacksAndMessages(null)
        holdWake(false)
        if (Recorder.svc === this) Recorder.svc = null
        super.onDestroy()
    }

    private fun piFlags(): Int = PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= 23) PendingIntent.FLAG_IMMUTABLE else 0)

    private fun build(s: Recorder.Snap): Notification {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CH) == null) {
            val ch = NotificationChannel(CH, "Registrazioni", NotificationManager.IMPORTANCE_LOW)
            ch.setShowBadge(false)
            nm.createNotificationChannel(ch)
        }
        val hm = SimpleDateFormat("HH:mm", Locale.ITALY)
        val title: String
        val text: String
        if (s.active.isNotEmpty()) {
            title = (if (s.active.size == 1) "Registrazione in corso: " else "Registrazioni in corso: ") + s.active.joinToString(", ") { it.name }
            val mb = s.active.sumOf { it.bytes } / (1024L * 1024L)
            val endAt = s.active.map { it.until }.filter { it > 0 }.minOrNull()
            text = "$mb MB registrati" + (if (endAt != null) " · fine alle " + hm.format(Date(endAt)) else "")
        } else {
            title = "Registrazione programmata: " + s.nextName
            val far = s.nextAt - System.currentTimeMillis() > 20L * 3600_000L
            text = "Inizio " + (if (far) SimpleDateFormat("dd/MM 'alle' HH:mm", Locale.ITALY).format(Date(s.nextAt)) else "alle " + hm.format(Date(s.nextAt)))
        }
        val stopPi = PendingIntent.getService(this, 1, Intent(this, RecService::class.java).setAction(ACTION_STOP), piFlags())
        val b = NotificationCompat.Builder(this, CH)
            .setSmallIcon(R.drawable.ic_rec)
            .setContentTitle(title)
            .setContentText(text)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .addAction(0, "Ferma", stopPi)
        try {
            packageManager.getLaunchIntentForPackage(packageName)?.let { b.setContentIntent(PendingIntent.getActivity(this, 2, it, piFlags())) }
        } catch (_: Exception) {}
        return b.build()
    }

    private fun refresh(s: Recorder.Snap) {
        try {
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.notify(NID, build(s)) // senza il permesso notifiche (Android 13+) non viene mostrata, ma non è un errore
        } catch (_: Exception) {}
    }

    private fun holdWake(on: Boolean) {
        try {
            if (on) {
                val w = wake ?: (getSystemService(Context.POWER_SERVICE) as PowerManager)
                    .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "kairos:rec").also { it.setReferenceCounted(false); wake = it }
                if (!w.isHeld) w.acquire(7L * 3600_000L)
            } else {
                wake?.let { if (it.isHeld) it.release() }
            }
        } catch (_: Exception) {}
    }

    /** sveglia di riserva per le registrazioni programmate (il telefono può essere in sospensione) */
    private fun arm(nextAt: Long) {
        try {
            val am = getSystemService(Context.ALARM_SERVICE) as AlarmManager
            val i = Intent(this, RecService::class.java).setAction(ACTION_TICK)
            val exact = Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms()
            // sveglia esatta: se nel frattempo il processo è stato chiuso, riavvia il servizio in primo piano
            // (da Android 12 solo le sveglie esatte possono farlo). Non esatta: startForegroundService verrebbe
            // rifiutato con l'app in secondo piano; startService raggiunge comunque il servizio ancora attivo.
            val fgPi = if (Build.VERSION.SDK_INT >= 26) PendingIntent.getForegroundService(this, 3, i, piFlags()) else null
            val bgPi = PendingIntent.getService(this, 3, i, piFlags())
            val pi = if (exact && fgPi != null) fgPi else bgPi
            // il permesso per le sveglie esatte può cambiare: si toglie la sveglia dell'altro tipo
            if (fgPi != null && fgPi != pi) am.cancel(fgPi)
            if (bgPi != pi) am.cancel(bgPi)
            if (nextAt <= 0L) { am.cancel(pi); return }
            // mai nel passato: suonerebbe subito (ogni ~5 s, riarmata a ogni avvio del servizio) fino all'orario.
            // Vicino all'orario il servizio attivo parte da solo con il suo timer (blocco di sospensione attivo);
            // la sveglia, sempre ≥ 1 minuto avanti, serve solo se il processo nel frattempo è stato chiuso.
            val t = maxOf(nextAt - (if (exact) 20_000L else 10 * 60_000L), System.currentTimeMillis() + 60_000L)
            when {
                Build.VERSION.SDK_INT >= 23 && exact -> am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, t, pi)
                Build.VERSION.SDK_INT >= 23 -> am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, t, pi)
                else -> am.setExact(AlarmManager.RTC_WAKEUP, t, pi)
            }
        } catch (_: Exception) {}
    }
}
