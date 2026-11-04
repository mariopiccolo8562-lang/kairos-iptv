plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

fun env(name: String): String? = System.getenv(name)?.takeIf { it.isNotBlank() }
val keystore = env("KS_PATH")?.let { file(it) }?.takeIf { it.exists() }

android {
    namespace = "com.kairos.player"
    compileSdk = 35

    defaultConfig {
        minSdk = 22
        targetSdk = 35
        versionCode = env("VERSION_CODE")?.toInt() ?: 1
        versionName = env("VERSION_NAME") ?: "1.0.0"
        // Fire TV / Android TV / telefoni usano processori ARM: escludere x86 riduce molto l'APK
        ndk { abiFilters += listOf("armeabi-v7a", "arm64-v8a") }
    }

    /* Due app dallo stesso codice:
       - pro = Kairos Pro (tutte le funzioni)
       - tv  = Kairos TV (stessa grafica, più leggera: niente registrazioni, multi-schermo, speed test;
               le altre funzioni tolte le nasconde l'interfaccia). Si installa accanto alla Pro. */
    flavorDimensions += "app"
    productFlavors {
        create("pro") {
            dimension = "app"
            applicationId = env("APP_ID") ?: "com.kairos.player"
            resValue("string", "app_name", env("APP_NAME") ?: "Kairos Pro")
            buildConfigField("boolean", "FULL", "true")
            buildConfigField("String", "EDITION", "\"pro\"")
        }
        create("tv") {
            dimension = "app"
            applicationId = env("TV_APP_ID") ?: "com.kairos.tv"
            resValue("string", "app_name", env("TV_APP_NAME") ?: "Kairos TV")
            buildConfigField("boolean", "FULL", "false")
            buildConfigField("String", "EDITION", "\"tv\"")
        }
    }

    signingConfigs {
        create("release") {
            if (keystore != null) {
                storeFile = keystore
                storePassword = env("KS_PASS")
                keyAlias = env("KEY_ALIAS")
                keyPassword = env("KEY_PASS")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = if (keystore != null) signingConfigs.getByName("release") else signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
        // la libreria WireGuard usa java.time / Optional / stream: servono anche su Android 5-7
        isCoreLibraryDesugaringEnabled = true
    }
    kotlinOptions { jvmTarget = "17" }
    buildFeatures { buildConfig = true }
    lint { abortOnError = false; checkReleaseBuilds = false }
}

dependencies {
    implementation("androidx.activity:activity-ktx:1.9.3")
    // player nativi
    implementation("androidx.media3:media3-exoplayer:1.4.1")
    implementation("androidx.media3:media3-exoplayer-hls:1.4.1")
    implementation("androidx.media3:media3-ui:1.4.1")
    implementation("org.videolan.android:libvlc-all:3.6.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0") // speed test M-Lab (WebSocket NDT7)
    // VPN WireGuard (libreria ufficiale). 1.0.20250531 = ultima con minSdk 21 (la 1.0.20260102 richiede
    // Android 7+, stesso motore wireguard-go): così la VPN funziona anche su Fire TV con Fire OS 5
    implementation("com.wireguard.android:tunnel:1.0.20250531")
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.5")
}
