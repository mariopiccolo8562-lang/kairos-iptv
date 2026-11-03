package com.kairos.player

import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString
import okio.ByteString.Companion.toByteString
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.InetSocketAddress
import java.net.Socket
import java.net.URL
import java.util.Random
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicLong

/**
 * Speed test M-Lab (protocollo NDT7, lo stesso del test "velocità internet" di Google):
 * - il server più vicino lo indica locate.measurementlab.net (API pubblica, gratuita, nessuna chiave)
 * - latenza: tempo di apertura TCP verso quel server (8 misure; ping = mediana, jitter = media delle differenze)
 * - download: un flusso WebSocket per 10 s, misurato a livello applicativo come prevede il protocollo
 * - upload: messaggi binari casuali per 10 s; il risultato è quello ricevuto dal server (TCPInfo), se lo manda
 * Un solo flusso: sulle chiavette con poca CPU la cifratura non falsa il risultato come con molte connessioni insieme.
 */
object Ndt7 {
    private const val LOCATE = "https://locate.measurementlab.net/v2/nearest/ndt/ndt7"
    private const val PROTO = "net.measurementlab.ndt.v7"
    private const val TEST_MS = 10_000L
    private const val MIN_MSG = 1 shl 13
    private const val MAX_MSG = 1 shl 20
    private const val MAX_QUEUE = 8L shl 20

    class Server(val host: String, val dlUrl: String, val ulUrl: String, val label: String)
    class Result(val dl: Double, val ul: Double, val ping: Double, val jitter: Double, val server: String)

    private val client: OkHttpClient by lazy {
        OkHttpClient.Builder().connectTimeout(8, TimeUnit.SECONDS).readTimeout(15, TimeUnit.SECONDS).writeTimeout(15, TimeUnit.SECONDS).pingInterval(0, TimeUnit.SECONDS).build()
    }

    /** server più vicino, o null se il servizio non risponde (si passa alla riserva) */
    fun locate(ua: String): Server? {
        var c: HttpURLConnection? = null
        try {
            c = URL(LOCATE).openConnection() as HttpURLConnection
            c.connectTimeout = 5000; c.readTimeout = 5000; c.useCaches = false
            c.setRequestProperty("User-Agent", ua)
            if (c.responseCode !in 200..299) return null
            val j = JSONObject(c.inputStream.bufferedReader().readText())
            val r = j.optJSONArray("results")?.optJSONObject(0) ?: return null
            val urls = r.optJSONObject("urls") ?: return null
            val dl = urls.optString("wss:///ndt/v7/download"); val ul = urls.optString("wss:///ndt/v7/upload")
            if (dl.isEmpty() || ul.isEmpty()) return null
            val loc = r.optJSONObject("location")
            val city = loc?.optString("city").orEmpty(); val country = loc?.optString("country").orEmpty()
            val host = r.optString("machine").ifEmpty { URL(dl.replaceFirst("wss://", "https://")).host }
            val label = "M-Lab" + (if (city.isNotEmpty()) " · $city" else "") + (if (country.isNotEmpty()) " ($country)" else "")
            return Server(host, dl, ul, label)
        } catch (_: Exception) { return null } finally { try { c?.disconnect() } catch (_: Throwable) {} }
    }

    /** latenza pura (handshake TCP) verso il server: nessuna cifratura e nessun server HTTP di mezzo */
    fun ping(s: Server, cancelled: () -> Boolean, each: (ping: Double, jitter: Double, i: Int, n: Int) -> Unit): Pair<Double, Double> {
        val samples = ArrayList<Double>()
        val n = 8
        for (i in 0 until n) {
            if (cancelled()) break
            try {
                Socket().use { so ->
                    val t0 = System.nanoTime()
                    so.connect(InetSocketAddress(s.host, 443), 4000)
                    samples.add((System.nanoTime() - t0) / 1e6)
                }
            } catch (_: Exception) {}
            if (samples.isNotEmpty()) each(median(samples), jitterOf(samples), i + 1, n)
            if (i < n - 1) try { Thread.sleep(80) } catch (_: InterruptedException) {}
        }
        if (samples.size < 3) throw IOException("server di misura non raggiungibile")
        return median(samples) to jitterOf(samples)
    }

    /** download per 10 s; [tick] ogni ~250 ms con la velocità media finora e l'avanzamento 0..1 */
    fun download(s: Server, ua: String, cancelled: () -> Boolean, tick: (mbps: Double, frac: Double) -> Unit): Double {
        val total = AtomicLong(0)
        val done = CountDownLatch(1)
        var error: String? = null
        val t0 = System.nanoTime()
        val ws = client.newWebSocket(Request.Builder().url(s.dlUrl).header("Sec-WebSocket-Protocol", PROTO).header("User-Agent", ua).build(), object : WebSocketListener() {
            override fun onMessage(webSocket: WebSocket, bytes: ByteString) { total.addAndGet(bytes.size.toLong()) }
            override fun onMessage(webSocket: WebSocket, text: String) { total.addAndGet(text.length.toLong()) }
            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) { webSocket.close(1000, null); done.countDown() }
            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) { done.countDown() }
            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) { if (total.get() == 0L) error = t.message ?: "errore"; done.countDown() }
        })
        var last = 0.0
        while (!done.await(250, TimeUnit.MILLISECONDS)) {
            val el = (System.nanoTime() - t0) / 1e9
            if (cancelled() || el > 14.0) { ws.cancel(); break }
            if (el > 0.3) { last = total.get() * 8 / el / 1e6; tick(last, (el * 1000 / TEST_MS).coerceAtMost(1.0)) }
        }
        val el = (System.nanoTime() - t0) / 1e9
        if (error != null && total.get() == 0L) throw IOException(error)
        if (total.get() == 0L || el < 1.0) throw IOException("nessun dato ricevuto")
        return total.get() * 8 / el / 1e6
    }

    /** upload per 10 s: messaggi casuali di dimensione crescente, coda tenuta corta per non misurare la memoria */
    fun upload(s: Server, ua: String, cancelled: () -> Boolean, tick: (mbps: Double, frac: Double) -> Unit): Double {
        val done = CountDownLatch(1)
        val opened = CountDownLatch(1)
        var error: String? = null
        var serverBytes = -1L
        var serverElapsedUs = -1L
        val ws = client.newWebSocket(Request.Builder().url(s.ulUrl).header("Sec-WebSocket-Protocol", PROTO).header("User-Agent", ua).build(), object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) { opened.countDown() }
            override fun onMessage(webSocket: WebSocket, text: String) {
                // misura del server: {"TCPInfo":{"BytesReceived":…,"ElapsedTime":…}} (microsecondi)
                try {
                    val t = JSONObject(text).optJSONObject("TCPInfo") ?: return
                    val b = t.optLong("BytesReceived", -1); val e = t.optLong("ElapsedTime", -1)
                    if (b > 0 && e > 0) { serverBytes = b; serverElapsedUs = e }
                } catch (_: Exception) {}
            }
            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) { webSocket.close(1000, null); done.countDown() }
            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) { done.countDown() }
            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) { error = t.message ?: "errore"; opened.countDown(); done.countDown() }
        })
        if (!opened.await(8, TimeUnit.SECONDS) || error != null) { ws.cancel(); throw IOException(error ?: "connessione non aperta") }
        val rnd = Random()
        var size = MIN_MSG
        var msg = ByteArray(size).also { rnd.nextBytes(it) }.toByteString()
        var sent = 0L
        val t0 = System.nanoTime()
        var lastTick = 0L
        while (true) {
            val el = System.nanoTime() - t0
            if (cancelled() || el >= TEST_MS * 1_000_000L || done.count == 0L) break
            if (ws.queueSize() < MAX_QUEUE) {
                if (size < MAX_MSG && size.toLong() < sent / 16) { size *= 2; msg = ByteArray(size).also { rnd.nextBytes(it) }.toByteString() }
                if (!ws.send(msg)) break
                sent += size
            } else try { Thread.sleep(2) } catch (_: InterruptedException) {}
            if (el - lastTick > 250_000_000L) {
                lastTick = el
                val s0 = el / 1e9
                val onWire = sent - ws.queueSize()
                tick(onWire * 8 / s0 / 1e6, (s0 * 1000 / TEST_MS).coerceAtMost(1.0))
            }
        }
        ws.close(1000, null)
        done.await(2, TimeUnit.SECONDS)
        val el = (System.nanoTime() - t0) / 1e9
        if (serverBytes > 0 && serverElapsedUs > 0) return serverBytes * 8.0 / (serverElapsedUs / 1e6) / 1e6
        val onWire = sent - ws.queueSize()
        if (onWire <= 0 || el < 1.0) throw IOException("nessun dato inviato")
        return onWire * 8 / el / 1e6
    }

    private fun median(s: List<Double>): Double { val a = s.sorted(); val m = a.size / 2; return if (a.size % 2 == 1) a[m] else (a[m - 1] + a[m]) / 2.0 }
    private fun jitterOf(s: List<Double>): Double { if (s.size < 2) return 0.0; var sum = 0.0; for (i in 1 until s.size) sum += Math.abs(s[i] - s[i - 1]); return sum / (s.size - 1) }
}
