package com.kairos.player

import android.content.Context
import java.net.URL
import java.util.Locale

data class PortalServer(val id: String, val main: String, val alts: List<String>, val mode: String)

object Portals {
    const val BAD_MS = 30 * 60_000L

    private fun origin(value: String): String {
        return try {
            val raw = value.trim()
            if (raw.isEmpty()) "" else {
                val url = URL(if (raw.contains("://")) raw else "http://$raw")
                val scheme = url.protocol.lowercase(Locale.ROOT)
                if (scheme != "http" && scheme != "https") "" else {
                    val host = url.host.lowercase(Locale.ROOT)
                    val port = if (url.port >= 0 && url.port != url.defaultPort) ":${url.port}" else ""
                    "$scheme://$host$port"
                }
            }
        } catch (_: Exception) { "" }
    }

    private fun hostKey(value: String): String = origin(value).substringAfter("://").lowercase(Locale.ROOT)

    fun cands(server: PortalServer): List<String> =
        (listOf(server.main) + server.alts).map(::origin).filter { it.isNotEmpty() }.distinctBy(::hostKey)

    fun host(context: Context, server: PortalServer): String {
        val candidates = cands(server)
        val main = candidates.firstOrNull().orEmpty()
        return when (server.mode.lowercase(Locale.ROOT)) {
            "main" -> main
            "alt" -> candidates.getOrElse(1) { main }
            else -> {
                val prefs = context.getSharedPreferences("kairos", Context.MODE_PRIVATE)
                val chosen = prefs.getString("ptl_${server.id}", "").orEmpty()
                if (candidates.any { hostKey(it) == hostKey(chosen) && !isBad(context, it) }) candidates.first { hostKey(it) == hostKey(chosen) && !isBad(context, it) }
                else candidates.firstOrNull { !isBad(context, it) } ?: main
            }
        }
    }

    fun markBad(context: Context, value: String, ms: Long = BAD_MS) {
        val key = hostKey(value)
        if (key.isEmpty()) return
        context.getSharedPreferences("kairos", Context.MODE_PRIVATE).edit()
            .putLong("ptlbad_$key", System.currentTimeMillis() + ms).apply()
    }

    fun isBad(context: Context, value: String): Boolean {
        val key = hostKey(value)
        if (key.isEmpty()) return false
        val prefs = context.getSharedPreferences("kairos", Context.MODE_PRIVATE)
        val until = prefs.getLong("ptlbad_$key", 0L)
        if (until <= System.currentTimeMillis()) {
            if (until > 0L) prefs.edit().remove("ptlbad_$key").apply()
            return false
        }
        return true
    }

    fun canNext(context: Context, server: PortalServer): Boolean {
        if (!server.mode.equals("auto", true)) return false
        val candidates = cands(server)
        if (candidates.size < 2) return false
        val current = hostKey(host(context, server))
        return candidates.any { hostKey(it) != current && !isBad(context, it) }
    }

    fun next(context: Context, server: PortalServer): Pair<String, String>? {
        if (!server.mode.equals("auto", true)) return null
        val candidates = cands(server)
        if (candidates.size < 2) return null
        val old = host(context, server)
        val current = candidates.indexOfFirst { hostKey(it) == hostKey(old) }
        if (current < 0) return null
        markBad(context, old)
        val next = (1..candidates.size).asSequence()
            .map { candidates[(current + it) % candidates.size] }
            .firstOrNull { !isBad(context, it) } ?: return null
        context.getSharedPreferences("kairos", Context.MODE_PRIVATE).edit()
            .putString("ptl_${server.id}", next).apply()
        return old to next
    }

    fun re(context: Context, server: PortalServer, value: String): String {
        val source = origin(value)
        if (source.isEmpty() || cands(server).none { hostKey(it) == hostKey(source) }) return value
        val target = host(context, server)
        if (target.isEmpty() || hostKey(target) == hostKey(source)) return value
        return try {
            val url = URL(value)
            val base = URL(target)
            val rewritten = URL(base.protocol, base.host, base.port, url.file).toExternalForm()
            if (url.ref.isNullOrEmpty()) rewritten else "$rewritten#${url.ref}"
        } catch (_: Exception) { value }
    }
}
