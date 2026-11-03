# Mantiene i metodi esposti al JavaScript del player
-keepattributes JavascriptInterface
-keepclassmembers class com.kairos.player.MainActivity$Bridge {
    @android.webkit.JavascriptInterface <methods>;
}

# VLC usa codice nativo (JNI): le sue classi non vanno rinominate
-keep class org.videolan.libvlc.** { *; }
-dontwarn org.videolan.**

# WireGuard: GoBackend usa metodi nativi (JNI, nomi Java_com_wireguard_android_backend_GoBackend_*),
# il VpnService è dichiarato nel manifest della libreria. La libreria è piccola: si tiene tutta.
-keep class com.wireguard.** { *; }
# annotazioni JSR-305 usate dalla libreria solo in compilazione (compileOnly)
-dontwarn javax.annotation.**
-dontwarn com.google.errorprone.annotations.**

# OkHttp (speed test M-Lab): avvisi su classi opzionali (Conscrypt, BouncyCastle, OpenJSSE) non presenti
-dontwarn okhttp3.internal.platform.**
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**
