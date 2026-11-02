package com.kairos.player

import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.util.Random
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicLong
import kotlin.concurrent.thread

/**
 * Speed test su speed.cloudflare.com:
 * - latenza: 13 richieste vuote in sequenza sulla stessa connessione (la prima la apre e non conta);
 *   ping = mediana, jitter = media delle differenze tra misure consecutive
 * - download: 6 connessioni in parallelo per 8 s; i primi 1,5 s (avvio) non contano
 * - upload: 4 invii in parallelo da 2 MB ripetuti per 6 s; i primi 1,5 s non contano
 * Ogni messaggio va a [cb] come stringa JSON (contratto di window.kxSpeedCb).
 * Una nuova chiamata a [start] annulla quella in corso.
 */
object SpeedTest {
    private const val HOST = "https://speed.cloudflare.com"
    private const val WARM_MS = 1500.0
    private const val DL_MS = 8000.0
    private const val UL_MS = 6000.0
    private val lock = Any()
    private var current: Run? = null

    fun start(ua: String, cb: (String) -> Unit) {
        val r = Run(ua, cb)
        val prev = synchronized(lock) { val p = current; current = r; p }
        prev?.cancel()
        thread(name = "kx-speed", isDaemon = true) {
            // si aspetta che il test precedente abbia chiuso le sue connessioni
            try { prev?.done?.await(3, TimeUnit.SECONDS) } catch (_: InterruptedException) {}
            r.run()
            synchronized(lock) { if (current === r) current = null }
        }
    }

    fun stop() {
        val p = synchronized(lock) { val p = current; current = null; p }
        p?.cancel()
    }

    private class Run(val ua: String, val cb: (String) -> Unit) {
        @Volatile var cancelled = false
        val done = CountDownLatch(1)
        private val conns = ConcurrentLinkedQueue<HttpURLConnection>()
        private val rnd = Random()
        @Volatile private var colo = ""
        private var ping = -1.0
        private var jitter = -1.0
        private var dl = -1.0
        private var ul = -1.0

        fun cancel() {
            cancelled = true
            dropAll()
        }

        private fun dropAll() {
            while (true) {
                val c = conns.poll() ?: break
                try { c.disconnect() } catch (_: Throwable) {}
            }
        }

        private fun open(u: String, timeout: Int): HttpURLConnection {
            val c = URL(u).openConnection() as HttpURLConnection
            c.connectTimeout = timeout
            c.readTimeout = timeout
            c.useCaches = false
            c.setRequestProperty("User-Agent", ua)
            c.setRequestProperty("Accept-Encoding", "identity")
            conns.add(c)
            if (cancelled) { release(c, true); throw IOException("annullato") }
            return c
        }

        private fun release(c: HttpURLConnection?, kill: Boolean) {
            if (c == null) return
            conns.remove(c)
            if (kill) try { c.disconnect() } catch (_: Throwable) {}
        }

        private fun q(): String = "r=" + java.lang.Long.toHexString(rnd.nextLong())

        private fun send(o: JSONObject) {
            if (cancelled) return
            try { cb(o.toString()) } catch (_: Throwable) {}
        }

        private fun r1(x: Double): Double = if (x.isNaN() || x.isInfinite()) 0.0 else Math.round(x * 10.0) / 10.0

        private fun progress(phase: String, p: Double, mbps: Double) {
            val o = JSONObject().put("phase", phase).put("p", p.coerceIn(0.0, 100.0).toInt()).put("mbps", r1(mbps))
            if (ping >= 0) o.put("ping", r1(ping)).put("jitter", r1(jitter))
            if (dl >= 0) o.put("dl", r1(dl))
            if (ul >= 0) o.put("ul", r1(ul))
            send(o)
        }

        fun run() {
            try {
                measurePing()
                if (cancelled) return
                dl = measureDownload()
                if (cancelled) return
                ul = try { measureUpload() } catch (e: Exception) { -1.0 }
                if (cancelled) return
                send(
                    JSONObject().put("done", true).put("mbps", r1(dl)).put("dl", r1(dl))
                        .put("ul", if (ul < 0) -1.0 else r1(ul))
                        .put("ping", r1(ping)).put("jitter", r1(jitter))
                        .put("server", if (colo.isNotEmpty()) "Cloudflare $colo" else "Cloudflare")
                )
            } catch (e: Throwable) {
                if (!cancelled) send(JSONObject().put("error", e.message ?: "errore di rete"))
            } finally {
                dropAll()
                done.countDown()
            }
        }

        /* ---------------- latenza ---------------- */
        private fun measurePing() {
            val samples = ArrayList<Double>()
            var fails = 0
            val n = 13
            for (i in 0 until n) {
                if (cancelled) return
                var c: HttpURLConnection? = null
                try {
                    val cc = open("$HOST/__down?bytes=0&${q()}", 8000)
                    c = cc
                    val t0 = System.nanoTime()
                    val code = cc.responseCode
                    val ms = (System.nanoTime() - t0) / 1e6
                    if (colo.isEmpty()) colo = coloOf(cc)
                    val srv = serverMs(cc)
                    val s = if (code >= 400) cc.errorStream else cc.inputStream
                    s?.use { st -> val b = ByteArray(1024); while (st.read(b) >= 0) { } }
                    release(cc, false) // connessione lasciata aperta: le misure successive non rifanno TCP/TLS
                    if (code in 200..299 && i > 0) samples.add(if (srv > 0 && srv < ms * 0.8) ms - srv else ms)
                } catch (e: Exception) {
                    release(c, true)
                    fails++
                    if (fails >= 5 && samples.isEmpty()) throw IOException("server di misura non raggiungibile")
                }
                if (samples.isNotEmpty()) {
                    ping = median(samples)
                    jitter = jitterOf(samples)
                }
                progress("ping", (i + 1) * 10.0 / n, 0.0)
            }
            if (samples.size < 3) throw IOException("server di misura non raggiungibile")
        }

        private fun median(s: List<Double>): Double {
            val a = s.sorted()
            val m = a.size / 2
            return if (a.size % 2 == 1) a[m] else (a[m - 1] + a[m]) / 2.0
        }

        private fun jitterOf(s: List<Double>): Double {
            if (s.size < 2) return 0.0
            var sum = 0.0
            for (i in 1 until s.size) sum += Math.abs(s[i] - s[i - 1])
            return sum / (s.size - 1)
        }

        /** tempo di elaborazione del server (header server-timing), da togliere alla latenza */
        private fun serverMs(c: HttpURLConnection): Double {
            val h = c.getHeaderField("server-timing") ?: return 0.0
            return RX_CF_DUR.find(h)?.groupValues?.get(1)?.toDoubleOrNull() ?: 0.0
        }

        /** sigla del data center Cloudflare (es. MXP = Milano) */
        private fun coloOf(c: HttpURLConnection): String {
            val m = c.getHeaderField("cf-meta-colo")?.trim().orEmpty()
            if (m.length in 3..5 && m.all { it.isLetter() }) return m.uppercase()
            val ray = c.getHeaderField("cf-ray") ?: return ""
            val k = ray.substringAfterLast('-', "").trim()
            return if (k.length in 3..4 && k.all { it.isLetter() }) k.uppercase() else ""
        }

        /* ---------------- download ---------------- */
        private fun measureDownload(): Double {
            val total = AtomicLong(0)
            val errors = AtomicInteger(0)
            val stop = AtomicBoolean(false)
            val workers = (1..6).map { k ->
                thread(name = "kx-dl-$k", isDaemon = true) {
                    val buf = ByteArray(64 * 1024)
                    while (!stop.get() && !cancelled) {
                        var c: HttpURLConnection? = null
                        var kill = false
                        try {
                            val cc = open("$HOST/__down?bytes=25000000&${q()}", 10_000)
                            c = cc
                            val code = cc.responseCode
                            if (code != 200) throw IOException("HTTP $code")
                            if (colo.isEmpty()) colo = coloOf(cc)
                            val s = cc.inputStream
                            while (true) {
                                if (stop.get() || cancelled) { kill = true; break }
                                val n = s.read(buf)
                                if (n < 0) break
                                total.addAndGet(n.toLong())
                            }
                            if (!kill) s.close()
                        } catch (e: Exception) {
                            kill = true
                            if (!stop.get() && !cancelled) {
                                errors.incrementAndGet()
                                try { Thread.sleep(150) } catch (_: InterruptedException) {}
                            }
                        } finally {
                            release(c, kill)
                        }
                    }
                }
            }
            val t0 = System.nanoTime()
            var warmB = -1L
            var warmT = 0L
            var endB = 0L
            var endT = t0
            while (!cancelled) {
                try { Thread.sleep(200) } catch (_: InterruptedException) {}
                val now = System.nanoTime()
                val b = total.get()
                val el = (now - t0) / 1e6
                if (warmB < 0 && el >= WARM_MS) { warmB = b; warmT = now }
                endB = b
                endT = now
                if (el >= DL_MS || errors.get() > 18) break
                val live = if (warmB >= 0 && now - warmT > 300_000_000L) (b - warmB) * 8.0 / ((now - warmT) / 1e9) / 1e6
                    else b * 8.0 / (el / 1e3) / 1e6
                progress("download", 10.0 + 55.0 * el / DL_MS, live)
            }
            stop.set(true)
            dropAll()
            for (w in workers) { try { w.join(2000) } catch (_: InterruptedException) {} }
            if (cancelled) return 0.0
            if (total.get() == 0L) throw IOException("nessun dato ricevuto")
            return if (warmB >= 0 && endT - warmT > 500_000_000L) (endB - warmB) * 8.0 / ((endT - warmT) / 1e9) / 1e6
                else endB * 8.0 / ((endT - t0) / 1e9) / 1e6
        }

        /* ---------------- upload ---------------- */
        private fun measureUpload(): Double {
            val sent = AtomicLong(0)
            val errors = AtomicInteger(0)
            val oks = AtomicInteger(0)
            val stop = AtomicBoolean(false)
            val chunk = ByteArray(64 * 1024).also { rnd.nextBytes(it) } // dati casuali: non comprimibili
            val size = 2_000_000
            val workers = (1..4).map { k ->
                thread(name = "kx-ul-$k", isDaemon = true) {
                    while (!stop.get() && !cancelled) {
                        var c: HttpURLConnection? = null
                        var kill = false
                        try {
                            val cc = open("$HOST/__up?${q()}", 10_000)
                            c = cc
                            cc.requestMethod = "POST"
                            cc.doOutput = true
                            cc.setFixedLengthStreamingMode(size) // invio diretto, senza copia in memoria
                            cc.setRequestProperty("Content-Type", "application/octet-stream")
                            val os = cc.outputStream
                            var left = size
                            while (left > 0) {
                                if (stop.get() || cancelled) { kill = true; break }
                                val n = minOf(left, chunk.size)
                                os.write(chunk, 0, n)
                                sent.addAndGet(n.toLong())
                                left -= n
                            }
                            if (!kill) {
                                os.close()
                                val code = cc.responseCode
                                val s = if (code >= 400) cc.errorStream else cc.inputStream
                                s?.use { st -> val b = ByteArray(4096); while (st.read(b) >= 0) { } }
                                if (code in 200..299) oks.incrementAndGet() else throw IOException("HTTP $code")
                            }
                        } catch (e: Exception) {
                            kill = true
                            if (!stop.get() && !cancelled) {
                                errors.incrementAndGet()
                                try { Thread.sleep(150) } catch (_: InterruptedException) {}
                            }
                        } finally {
                            release(c, kill)
                        }
                    }
                }
            }
            val t0 = System.nanoTime()
            var warmB = -1L
            var warmT = 0L
            var endB = 0L
            var endT = t0
            while (!cancelled) {
                try { Thread.sleep(200) } catch (_: InterruptedException) {}
                val now = System.nanoTime()
                val b = sent.get()
                val el = (now - t0) / 1e6
                if (warmB < 0 && el >= WARM_MS) { warmB = b; warmT = now }
                endB = b
                endT = now
                if (el >= UL_MS || errors.get() > 12) break
                val live = if (warmB >= 0 && now - warmT > 300_000_000L) (b - warmB) * 8.0 / ((now - warmT) / 1e9) / 1e6
                    else b * 8.0 / (el / 1e3) / 1e6
                progress("upload", 65.0 + 35.0 * el / UL_MS, live)
            }
            stop.set(true)
            dropAll()
            for (w in workers) { try { w.join(2000) } catch (_: InterruptedException) {} }
            if (cancelled) return -1.0
            // nessun invio accettato dal server: upload non misurabile
            if (sent.get() == 0L || (oks.get() == 0 && errors.get() > 0)) return -1.0
            return if (warmB >= 0 && endT - warmT > 500_000_000L) (endB - warmB) * 8.0 / ((endT - warmT) / 1e9) / 1e6
                else endB * 8.0 / ((endT - t0) / 1e9) / 1e6
        }
    }

    private val RX_CF_DUR = Regex("cfReq(?:uest)?Dur(?:ation)?;\\s*dur=([0-9.]+)", RegexOption.IGNORE_CASE)
}
