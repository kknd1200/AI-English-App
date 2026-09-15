package com.mycatatan.simple1

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.google.mlkit.common.model.DownloadConditions
import com.google.mlkit.common.model.RemoteModelManager
import com.google.mlkit.nl.translate.TranslateLanguage
import com.google.mlkit.nl.translate.TranslateRemoteModel
import com.google.mlkit.nl.translate.Translation
import com.google.mlkit.nl.translate.Translator
import com.google.mlkit.nl.translate.TranslatorOptions
import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale

class MainActivity : AppCompatActivity(), TextToSpeech.OnInitListener {
    private lateinit var webView: WebView
    private lateinit var tts: TextToSpeech
    private var ttsReady = false
    private var pendingSpeak: Triple<String, String, Double>? = null
    private var speechRecognizer: SpeechRecognizer? = null
    private val micRequestCode = 1001
    private val siteUrl = "https://yeohaeng-translator.vercel.app/"

    private val modelManager by lazy { RemoteModelManager.getInstance() }
    private val translators = mutableMapOf<String, Translator>()
    private val offlineLanguages = linkedMapOf(
        "ko" to TranslateLanguage.KOREAN,
        "en" to TranslateLanguage.ENGLISH,
        "ja" to TranslateLanguage.JAPANESE,
        "vi" to TranslateLanguage.VIETNAMESE
    )

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        tts = TextToSpeech(this, this)
        webView = WebView(this)
        setContentView(webView)

        with(webView.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            cacheMode = WebSettings.LOAD_DEFAULT
            loadWithOverviewMode = true
            useWideViewPort = true
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
            mediaPlaybackRequiresUserGesture = false
            allowContentAccess = true
            allowFileAccess = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        }

        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)
        webView.addJavascriptInterface(AndroidBridge(), "AndroidBridge")

        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                val url = request.url
                if (
                    request.method.equals("GET", ignoreCase = true) &&
                    url.host == "yeohaeng-translator.vercel.app" &&
                    (url.path.isNullOrEmpty() || url.path == "/" || url.path == "/index.html")
                ) {
                    return try {
                        WebResourceResponse("text/html", "UTF-8", assets.open("index.html"))
                    } catch (_: Exception) {
                        super.shouldInterceptRequest(view, request)
                    }
                }
                return super.shouldInterceptRequest(view, request)
            }

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                return if (request.url.host == "yeohaeng-translator.vercel.app") {
                    false
                } else {
                    try {
                        startActivity(Intent(Intent.ACTION_VIEW, request.url))
                    } catch (_: Exception) {}
                    true
                }
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                runOnUiThread {
                    val wantsMic = request.resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)
                    val hasMic = ContextCompat.checkSelfPermission(
                        this@MainActivity,
                        Manifest.permission.RECORD_AUDIO
                    ) == PackageManager.PERMISSION_GRANTED

                    if (wantsMic && hasMic) {
                        request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
                    } else {
                        request.deny()
                        if (wantsMic && !hasMic) requestMicrophonePermission()
                    }
                }
            }
        }

        if (savedInstanceState == null) {
            webView.loadUrl(siteUrl)
        } else {
            webView.restoreState(savedInstanceState)
        }

        requestMicrophonePermission()

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) webView.goBack() else finish()
            }
        })
    }

    inner class AndroidBridge {
        @JavascriptInterface
        fun available(): Boolean = true

        @JavascriptInterface
        fun speak(text: String, lang: String, rate: Double) {
            runOnUiThread { speakNative(text, lang, rate) }
        }

        @JavascriptInterface
        fun startListening(lang: String) {
            runOnUiThread { startNativeRecognition(lang) }
        }

        @JavascriptInterface
        fun stopListening() {
            runOnUiThread {
                try { speechRecognizer?.stopListening() } catch (_: Exception) {}
            }
        }

        @JavascriptInterface
        fun getOfflineModelStatus() {
            queryOfflineModelStatus()
        }

        @JavascriptInterface
        fun downloadOfflineModels(wifiOnly: Boolean) {
            downloadAllOfflineModels(wifiOnly)
        }

        @JavascriptInterface
        fun translateOffline(requestId: String, text: String, from: String, to: String) {
            translateWithMlKit(requestId, text, from, to)
        }
    }

    private fun queryOfflineModelStatus() {
        modelManager.getDownloadedModels(TranslateRemoteModel::class.java)
            .addOnSuccessListener { models ->
                val downloaded = models.map { it.language }.toSet()
                val codes = offlineLanguages.filterValues { downloaded.contains(it) }.keys.toList()
                val payload = JSONObject()
                    .put("downloaded", JSONArray(codes))
                    .put("ready", codes.size == offlineLanguages.size)
                    .toString()
                sendNative("ml-model-status", payload)
            }
            .addOnFailureListener { e ->
                sendNative(
                    "ml-model-error",
                    JSONObject().put("message", e.localizedMessage ?: "언어팩 상태를 확인하지 못했어요").toString()
                )
            }
    }

    private fun downloadAllOfflineModels(wifiOnly: Boolean) {
        val conditionsBuilder = DownloadConditions.Builder()
        if (wifiOnly) conditionsBuilder.requireWifi()
        val conditions = conditionsBuilder.build()
        val entries = offlineLanguages.entries.toList()

        modelManager.getDownloadedModels(TranslateRemoteModel::class.java)
            .addOnSuccessListener { existingModels ->
                val already = existingModels.map { it.language }.toMutableSet()

                fun next(index: Int) {
                    if (index >= entries.size) {
                        val codes = offlineLanguages.filterValues { already.contains(it) }.keys.toList()
                        val payload = JSONObject()
                            .put("downloaded", JSONArray(codes))
                            .put("ready", codes.size == offlineLanguages.size)
                            .toString()
                        sendNative("ml-model-complete", payload)
                        return
                    }

                    val entry = entries[index]
                    val code = entry.key
                    val language = entry.value
                    val doneBefore = offlineLanguages.values.count { already.contains(it) }

                    sendNative(
                        "ml-model-progress",
                        JSONObject()
                            .put("done", doneBefore)
                            .put("total", entries.size)
                            .put("current", code)
                            .put("downloaded", JSONArray(offlineLanguages.filterValues { already.contains(it) }.keys.toList()))
                            .toString()
                    )

                    if (already.contains(language)) {
                        next(index + 1)
                        return
                    }

                    val model = TranslateRemoteModel.Builder(language).build()
                    modelManager.download(model, conditions)
                        .addOnSuccessListener {
                            already.add(language)
                            sendNative(
                                "ml-model-progress",
                                JSONObject()
                                    .put("done", offlineLanguages.values.count { already.contains(it) })
                                    .put("total", entries.size)
                                    .put("current", code)
                                    .put("downloaded", JSONArray(offlineLanguages.filterValues { already.contains(it) }.keys.toList()))
                                    .toString()
                            )
                            next(index + 1)
                        }
                        .addOnFailureListener { e ->
                            val msg = if (wifiOnly) {
                                "언어팩 다운로드에 실패했어요. Wi-Fi 연결을 확인해 주세요. ${e.localizedMessage ?: ""}".trim()
                            } else {
                                "언어팩 다운로드에 실패했어요. ${e.localizedMessage ?: ""}".trim()
                            }
                            sendNative(
                                "ml-model-error",
                                JSONObject().put("message", msg).put("current", code).toString()
                            )
                        }
                }

                next(0)
            }
            .addOnFailureListener { e ->
                sendNative(
                    "ml-model-error",
                    JSONObject().put("message", e.localizedMessage ?: "언어팩 목록을 읽지 못했어요").toString()
                )
            }
    }

    private fun translateWithMlKit(requestId: String, text: String, from: String, to: String) {
        if (text.isBlank()) {
            sendMlTranslateError(requestId, "번역할 문장이 비어 있어요")
            return
        }
        if (from == to) {
            sendMlTranslateResult(requestId, text)
            return
        }

        val source = offlineLanguages[from.substringBefore('-').lowercase(Locale.ROOT)]
        val target = offlineLanguages[to.substringBefore('-').lowercase(Locale.ROOT)]
        if (source == null || target == null) {
            sendMlTranslateError(requestId, "지원하지 않는 언어예요")
            return
        }

        modelManager.getDownloadedModels(TranslateRemoteModel::class.java)
            .addOnSuccessListener { models ->
                val downloaded = models.map { it.language }.toSet()
                if (!downloaded.contains(source) || !downloaded.contains(target)) {
                    sendMlTranslateError(requestId, "오프라인 언어팩이 아직 없어요. 설정에서 4개 언어팩을 먼저 다운로드해 주세요")
                    return@addOnSuccessListener
                }

                val key = "$source>$target"
                val translator = translators.getOrPut(key) {
                    val options = TranslatorOptions.Builder()
                        .setSourceLanguage(source)
                        .setTargetLanguage(target)
                        .build()
                    Translation.getClient(options)
                }

                translator.translate(text)
                    .addOnSuccessListener { translated ->
                        sendMlTranslateResult(requestId, translated)
                    }
                    .addOnFailureListener { e ->
                        sendMlTranslateError(requestId, e.localizedMessage ?: "기기 AI 번역에 실패했어요")
                    }
            }
            .addOnFailureListener { e ->
                sendMlTranslateError(requestId, e.localizedMessage ?: "언어팩 상태를 확인하지 못했어요")
            }
    }

    private fun sendMlTranslateResult(requestId: String, translated: String) {
        sendNative(
            "ml-translate-result",
            JSONObject().put("id", requestId).put("text", translated).toString()
        )
    }

    private fun sendMlTranslateError(requestId: String, message: String) {
        sendNative(
            "ml-translate-error",
            JSONObject().put("id", requestId).put("message", message).toString()
        )
    }

    override fun onInit(status: Int) {
        ttsReady = status == TextToSpeech.SUCCESS
        if (!ttsReady) {
            sendNative("tts-error", "init")
            return
        }
        pendingSpeak?.let {
            pendingSpeak = null
            speakNative(it.first, it.second, it.third)
        }
    }

    private fun localeFor(lang: String): Locale {
        return when (lang.substringBefore('-').lowercase(Locale.ROOT)) {
            "ko" -> Locale.KOREA
            "vi" -> Locale.forLanguageTag("vi-VN")
            "en" -> Locale.US
            "ja" -> Locale.JAPAN
            else -> Locale.forLanguageTag(lang)
        }
    }

    private fun speakNative(text: String, lang: String, rate: Double) {
        if (text.isBlank()) return
        if (!ttsReady) {
            pendingSpeak = Triple(text, lang, rate)
            return
        }

        val locale = localeFor(lang)
        val availability = tts.isLanguageAvailable(locale)
        if (availability == TextToSpeech.LANG_MISSING_DATA || availability == TextToSpeech.LANG_NOT_SUPPORTED) {
            sendNative("tts-missing", lang.substringBefore('-').lowercase(Locale.ROOT))
            return
        }

        val languageResult = tts.setLanguage(locale)
        if (languageResult == TextToSpeech.LANG_MISSING_DATA || languageResult == TextToSpeech.LANG_NOT_SUPPORTED) {
            sendNative("tts-missing", lang.substringBefore('-').lowercase(Locale.ROOT))
            return
        }

        tts.setSpeechRate(rate.toFloat().coerceIn(0.5f, 2.0f))
        val result = tts.speak(
            text,
            TextToSpeech.QUEUE_FLUSH,
            null,
            "bunbun-tts-${System.currentTimeMillis()}"
        )
        if (result == TextToSpeech.ERROR) sendNative("tts-error", "speak")
    }

    private fun startNativeRecognition(lang: String) {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestMicrophonePermission()
            sendNative("stt-error", "not-allowed")
            sendNative("stt-end", "")
            return
        }

        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            sendNative("stt-error", "unavailable")
            sendNative("stt-end", "")
            return
        }

        if (speechRecognizer == null) {
            speechRecognizer = SpeechRecognizer.createSpeechRecognizer(this).also { recognizer ->
                recognizer.setRecognitionListener(object : RecognitionListener {
                    override fun onReadyForSpeech(params: Bundle?) {}
                    override fun onBeginningOfSpeech() {}
                    override fun onRmsChanged(rmsdB: Float) {}
                    override fun onBufferReceived(buffer: ByteArray?) {}
                    override fun onEndOfSpeech() {}

                    override fun onError(error: Int) {
                        val code = when (error) {
                            SpeechRecognizer.ERROR_NO_MATCH,
                            SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "no-speech"
                            SpeechRecognizer.ERROR_NETWORK,
                            SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "network"
                            SpeechRecognizer.ERROR_AUDIO -> "audio-capture"
                            SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "busy"
                            SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "not-allowed"
                            else -> "error-$error"
                        }
                        sendNative("stt-error", code)
                        sendNative("stt-end", "")
                    }

                    override fun onResults(results: Bundle?) {
                        val resultText = results
                            ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                            ?.firstOrNull()
                            .orEmpty()
                        if (resultText.isNotBlank()) sendNative("stt-result", resultText)
                        sendNative("stt-end", "")
                    }

                    override fun onPartialResults(partialResults: Bundle?) {
                        val resultText = partialResults
                            ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                            ?.firstOrNull()
                            .orEmpty()
                        if (resultText.isNotBlank()) sendNative("stt-partial", resultText)
                    }

                    override fun onEvent(eventType: Int, params: Bundle?) {}
                })
            }
        }

        val bcp = when (lang.substringBefore('-').lowercase(Locale.ROOT)) {
            "ko" -> "ko-KR"
            "vi" -> "vi-VN"
            "en" -> "en-US"
            "ja" -> "ja-JP"
            else -> lang
        }

        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, bcp)
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
        }

        try {
            speechRecognizer?.cancel()
            speechRecognizer?.startListening(intent)
        } catch (_: Exception) {
            sendNative("stt-error", "unavailable")
            sendNative("stt-end", "")
        }
    }

    private fun sendNative(type: String, data: String) {
        if (!::webView.isInitialized) return
        runOnUiThread {
            val payload = JSONObject()
                .put("type", type)
                .put("data", data)
                .toString()
            val js = "if(window.__native){window.__native(${JSONObject.quote(payload)})}"
            webView.evaluateJavascript(js, null)
        }
    }

    private fun requestMicrophonePermission() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(
                this,
                arrayOf(Manifest.permission.RECORD_AUDIO),
                micRequestCode
            )
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        webView.saveState(outState)
        super.onSaveInstanceState(outState)
    }

    override fun onDestroy() {
        try { speechRecognizer?.destroy() } catch (_: Exception) {}
        translators.values.forEach { translator ->
            try { translator.close() } catch (_: Exception) {}
        }
        translators.clear()
        if (::tts.isInitialized) {
            try { tts.stop() } catch (_: Exception) {}
            try { tts.shutdown() } catch (_: Exception) {}
        }
        if (::webView.isInitialized) {
            webView.removeJavascriptInterface("AndroidBridge")
            webView.stopLoading()
            webView.destroy()
        }
        super.onDestroy()
    }
}
