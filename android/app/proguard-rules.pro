# Mantiene i metodi esposti al JavaScript del player
-keepattributes JavascriptInterface
-keepclassmembers class com.kairos.player.MainActivity$Bridge {
    @android.webkit.JavascriptInterface <methods>;
}
