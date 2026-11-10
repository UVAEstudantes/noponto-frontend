package expo.modules.radarnativenotification

import android.app.Notification
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.speech.tts.Voice
import android.util.Log
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import org.json.JSONObject
import java.security.MessageDigest
import java.util.Locale

private val RADAR_VOICE_AUDIO_ATTRIBUTES = AudioAttributes.Builder()
  .setUsage(AudioAttributes.USAGE_MEDIA)
  .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
  .build()

internal object RadarVoiceRouteAuthorization {
  private const val TAG = "RadarNativeProbe"
  private val headphoneName = Regex("(?i)(\\bearbuds?\\b|\\bearphones?\\b|\\bheadphones?\\b|\\bheadset\\b|\\bairpods?\\b|\\bbuds\\b|\\btws\\b|in[- ]?ear|\\bfones?\\s+de\\s+ouvido\\b|\\bfone\\s+(?:bluetooth|tws)\\b|\\bauriculares?\\b)")
  private val lock = Any()
  private var authorizedA2dpDeviceId: Int? = null
  private var lastRouteIdentity: List<Pair<Int, Int>>? = null
  private var lastRouteTypes = "unavailable"
  private var deviceCallback: AudioDeviceCallback? = null
  private var callbackContext: Context? = null

  private data class Snapshot(
    val devices: List<AudioDeviceInfo>?,
    val identity: List<Pair<Int, Int>>?,
    val routeType: String,
    val deviceName: String?,
    val automaticHeadphone: Boolean,
    val authorized: Boolean,
    val requiresConfirmation: Boolean,
  )

  fun status(context: Context): Map<String, Any> {
    val route = inspect(context, "settings", false)
    return mapOf(
      "routeType" to route.routeType,
      "deviceName" to (route.deviceName ?: ""),
      "automaticHeadphone" to route.automaticHeadphone,
      "authorized" to route.authorized,
      "requiresConfirmation" to route.requiresConfirmation,
    )
  }

  fun authorizeCurrentBluetoothRoute(context: Context): Boolean {
    val route = inspect(context, "confirmation", true)
    val device = route.devices?.singleOrNull() ?: return false
    if (device.type != AudioDeviceInfo.TYPE_BLUETOOTH_A2DP || route.automaticHeadphone) return false
    synchronized(lock) {
      if (lastRouteIdentity != route.identity) return false
      authorizedA2dpDeviceId = device.id
    }
    Log.i(TAG, "bluetooth_route_authorized type=bluetooth_a2dp scope=current_connection")
    return true
  }

  fun isAllowed(context: Context, stage: String, logRoute: Boolean = true): Boolean =
    inspect(context, stage, logRoute).let { it.automaticHeadphone || it.authorized }

  private fun inspect(context: Context, stage: String, logRoute: Boolean): Snapshot {
    val appContext = context.applicationContext
    val manager = appContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    ensureDeviceCallback(appContext, manager)
    val routed = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU)
      runCatching { manager.getAudioDevicesForAttributes(RADAR_VOICE_AUDIO_ATTRIBUTES) }.getOrNull() else null
    val connected = if (logRoute) runCatching { manager.getDevices(AudioManager.GET_DEVICES_OUTPUTS).toList() }.getOrDefault(emptyList()) else emptyList()
    val identity = routed?.map { it.id to it.type }?.sortedWith(compareBy<Pair<Int, Int>> { it.first }.thenBy { it.second })
    val routeType = routed?.let(::audioTypes) ?: "unavailable"
    val route = routed?.singleOrNull()
    val automatic = routed != null && routed.isNotEmpty() && routed.all(::isAutomaticallyRecognizedHeadphone)
    val nameInfo = route?.let(::nameClassification)
    var routeChanged = false
    val isAuthorized = synchronized(lock) {
      val previousIdentity = lastRouteIdentity
      val previousTypes = lastRouteTypes
      val authorizedId = authorizedA2dpDeviceId
      val authorizedForThisRoute = route?.type == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP && route.id == authorizedId
      val changed = previousIdentity != null && previousIdentity != identity
      routeChanged = changed
      val clearAuthorization = authorizedId != null && (!authorizedForThisRoute || changed)
      if (clearAuthorization) authorizedA2dpDeviceId = null
      if (changed) {
        Log.i(TAG, "bluetooth_route_changed from=$previousTypes to=$routeType authorization_cleared=$clearAuthorization")
      }
      lastRouteIdentity = identity
      lastRouteTypes = routeType
      if (logRoute) Log.i(TAG, "audio_routes stage=$stage routed_types=$routeType connected_output_types=${audioTypes(connected)}")
      if (route?.type == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP && (logRoute || changed)) {
        Log.i(TAG, "bluetooth_route_detected type=bluetooth_a2dp automatic_headphone=${isAutomaticallyRecognizedHeadphone(route)} name_available=${nameInfo?.first == true} name_match=${nameInfo?.second == true} authorized=${authorizedForThisRoute && !clearAuthorization}")
      }
      if (route != null && (route.type == AudioDeviceInfo.TYPE_USB_DEVICE || route.type == AudioDeviceInfo.TYPE_USB_ACCESSORY)
        && (logRoute || changed)) {
        Log.i(TAG, "usb_route_detected type=${audioType(route.type)} name_available=${nameInfo?.first == true} name_match=${nameInfo?.second == true} automatic_headphone=${isAutomaticallyRecognizedHeadphone(route)}")
      }
      authorizedForThisRoute && !clearAuthorization
    }
    if (routeChanged) RadarVoicePlaybackService.onAudioOutputRouteChanged()
    val needsConfirmation = route?.type == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP && !automatic && !isAuthorized
    return Snapshot(routed, identity, routeType, route?.let(::productName), automatic, isAuthorized, needsConfirmation)
  }

  private fun ensureDeviceCallback(context: Context, manager: AudioManager) {
    synchronized(lock) {
      if (deviceCallback != null) return
      val callback = object : AudioDeviceCallback() {
        override fun onAudioDevicesAdded(addedDevices: Array<out AudioDeviceInfo>) {
          callbackContext?.let { inspect(it, "device_added", false) }
        }

        override fun onAudioDevicesRemoved(removedDevices: Array<out AudioDeviceInfo>) {
          val removedAuthorizedRoute = synchronized(lock) {
            val authorizedId = authorizedA2dpDeviceId
            if (authorizedId != null && removedDevices.any { it.id == authorizedId }) {
              authorizedA2dpDeviceId = null
              true
            } else false
          }
          if (removedAuthorizedRoute) Log.i(TAG, "bluetooth_route_changed from=bluetooth_a2dp to=disconnected authorization_cleared=true")
          callbackContext?.let { inspect(it, "device_removed", false) }
        }
      }
      callbackContext = context.applicationContext
      deviceCallback = callback
      manager.registerAudioDeviceCallback(callback, Handler(Looper.getMainLooper()))
    }
  }

  private fun nameClassification(device: AudioDeviceInfo): Pair<Boolean, Boolean> {
    val name = productName(device)
    return (name != null) to (name?.let(headphoneName::containsMatchIn) == true)
  }

  private fun productName(device: AudioDeviceInfo): String? =
    runCatching { device.productName.toString().trim() }.getOrNull()?.takeIf(String::isNotEmpty)

  private fun isAutomaticallyRecognizedHeadphone(device: AudioDeviceInfo): Boolean = when (device.type) {
    AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
    AudioDeviceInfo.TYPE_WIRED_HEADSET,
    AudioDeviceInfo.TYPE_USB_HEADSET,
    AudioDeviceInfo.TYPE_BLE_HEADSET -> true
    AudioDeviceInfo.TYPE_BLUETOOTH_A2DP,
    AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
    AudioDeviceInfo.TYPE_USB_DEVICE,
    AudioDeviceInfo.TYPE_USB_ACCESSORY -> nameClassification(device).second
    else -> false
  }

  private fun audioTypes(devices: List<AudioDeviceInfo>) = devices.map { audioType(it.type) }
    .distinct().sorted().joinToString(",").ifEmpty { "none" }

  private fun audioType(type: Int) = when (type) {
    AudioDeviceInfo.TYPE_BUILTIN_EARPIECE -> "built_in_earpiece"
    AudioDeviceInfo.TYPE_BUILTIN_SPEAKER -> "built_in_speaker"
    AudioDeviceInfo.TYPE_WIRED_HEADPHONES -> "wired_headphones"
    AudioDeviceInfo.TYPE_WIRED_HEADSET -> "wired_headset"
    AudioDeviceInfo.TYPE_USB_HEADSET -> "usb_headset"
    AudioDeviceInfo.TYPE_USB_DEVICE -> "usb_device"
    AudioDeviceInfo.TYPE_USB_ACCESSORY -> "usb_accessory"
    AudioDeviceInfo.TYPE_BLUETOOTH_A2DP -> "bluetooth_a2dp"
    AudioDeviceInfo.TYPE_BLUETOOTH_SCO -> "bluetooth_sco"
    AudioDeviceInfo.TYPE_BLE_HEADSET -> "ble_headset"
    AudioDeviceInfo.TYPE_BLE_SPEAKER -> "ble_speaker"
    AudioDeviceInfo.TYPE_BLE_BROADCAST -> "ble_broadcast"
    else -> "other"
  }
}

internal class RadarVoicePlaybackService : Service() {
  private data class SpeechItem(
    val eventId: String,
    val vehicleId: String?,
    val code: String,
    val departure: Boolean,
    val priority: Boolean,
    val etaSeconds: Long,
    val predictedAt: Long,
    val kind: String,
  )

  private data class Request(
    val sessionId: String,
    val items: List<SpeechItem>,
    val stopName: String,
    val validUntil: Long,
    val reservationKeys: List<String>,
    val predictionSignature: String,
  )

  private val handler = Handler(Looper.getMainLooper())
  private val audioAttributes = RADAR_VOICE_AUDIO_ATTRIBUTES
  private var request: Request? = null
  private var tts: TextToSpeech? = null
  private var cuePlayer: MediaPlayer? = null
  private var focusRequest: AudioFocusRequest? = null
  private var foreground = false
  private var finished = false
  private var speechStarted = false
  private var focusHeld = false
  private var utteranceId: String? = null
  private var startId = 0
  private val routeMonitor = object : Runnable {
    override fun run() {
      if (finished) return
      checkAudioRoute()
      if (!finished) handler.postDelayed(this, ROUTE_CHECK_INTERVAL_MS)
    }
  }

  private val timeout = Runnable { finish(false, "speech_watchdog_timeout") }
  private val cueWatchdog = Runnable {
    if (cuePlayer != null) {
      releaseCue(true)
      Log.w(TAG, "voice_cue=timeout")
      startSpeechAfterCue()
    }
  }
  private val initializationTimeout = Runnable { finish(false, "tts_init_timeout") }
  private val focusListener = AudioManager.OnAudioFocusChangeListener { change ->
    if (change == AudioManager.AUDIOFOCUS_LOSS
      || change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT
      || change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK) {
      handler.post { finish(false, "audio_focus_interrupted") }
    }
  }

  override fun onCreate() {
    super.onCreate()
    instance = this
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    this.startId = startId
    if (request != null || finished) {
      Log.w(TAG, "voice_discard reason=service_busy")
      releaseReservations(intent?.getStringArrayListExtra(EXTRA_RESERVATION_KEYS))
      if (finished) stopSelf(startId)
      return START_NOT_STICKY
    }
    val parsed = parseRequest(intent) ?: run {
      Log.w(TAG, "voice_discard reason=request_invalid")
      releaseReservations(intent?.getStringArrayListExtra(EXTRA_RESERVATION_KEYS))
      stopSelf(startId)
      return START_NOT_STICKY
    }
    if (!RadarNotificationSession.isActive(this, parsed.sessionId)) {
      Log.w(TAG, "voice_discard reason=session_inactive_before_service")
      releaseReservations(parsed.reservationKeys)
      stopSelf(startId)
      return START_NOT_STICKY
    }
    if (RadarVoicePreferencesStore.isMuted(this)) {
      Log.i(TAG, "voice_discard reason=voice_muted")
      releaseReservations(parsed.reservationKeys)
      stopSelf(startId)
      return START_NOT_STICKY
    }
    val notification = intent?.parcelableNotification() ?: run {
      Log.w(TAG, "voice_discard reason=foreground_notification_missing")
      releaseReservations(parsed.reservationKeys)
      stopSelf(startId)
      return START_NOT_STICKY
    }
    request = parsed
    try {
      val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q)
        ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK else 0
      ServiceCompat.startForeground(this, RadarNotificationSession.NOTIFICATION_ID, notification, type)
      foreground = true
      Log.i(TAG, "voice_service=foreground")
      handler.postDelayed(initializationTimeout, INIT_TIMEOUT_MS)
      val engine = TextToSpeech(this) { status -> handler.post { onTtsReady(status) } }
      tts = engine
      if (engine.setAudioAttributes(audioAttributes) != TextToSpeech.SUCCESS) {
        finish(false, "audio_attributes_rejected")
      }
    } catch (error: Exception) {
      Log.e(TAG, "voice_service_exception type=${error.javaClass.simpleName}")
      finish(false, "foreground_start_failed")
    }
    return START_NOT_STICKY
  }

  private fun onTtsReady(status: Int) {
    if (finished) return
    handler.removeCallbacks(initializationTimeout)
    val item = request ?: return finish(false, "request_missing")
    if (status != TextToSpeech.SUCCESS) return finish(false, "tts_init_failed")
    if (!validBeforeSpeech(item)) return finish(false, "payload_expired_before_speech")

    val preferences = RadarVoicePreferencesStore.load(this)
    if (RadarVoicePreferencesStore.isMuted(this)) return finish(false, "voice_muted")
    if (!preferences.enabled) return finish(false, "voice_disabled_before_speech")
    if (!item.items.all { eligibleAtStart(it, preferences, System.currentTimeMillis()) }) {
      return finish(false, "voice_window_changed_before_speech")
    }
    if (preferences.headphonesOnly && !RadarVoiceRouteAuthorization.isAllowed(this, "before_speech")) {
      return finish(false, "headphone_route_unconfirmed")
    }

    val engine = tts ?: return finish(false, "tts_engine_missing")
    if (!configureVoice(engine, preferences.voiceId)) return finish(false, "no_usable_voice")
    if (isCallAudioActive()) return finish(false, "call_audio_active")
    if (!requestFocus()) return finish(false, "audio_focus_denied")
    if (isCallAudioActive()) return finish(false, "call_audio_active")
    if (preferences.headphonesOnly && !RadarVoiceRouteAuthorization.isAllowed(this, "after_focus")) {
      return finish(false, "headphone_route_unconfirmed")
    }
    if (!validBeforeSpeech(item)) return finish(false, "payload_expired_before_speech")
    if (item.items.any { it.predictedAt <= System.currentTimeMillis() }) return finish(false, "eta_elapsed_before_speech")
    if (preferences.headphonesOnly) observeAudioRoute()
    if (preferences.soundBeforeSpeech) {
      if (item.validUntil - System.currentTimeMillis() <= CUE_DURATION_MS + CUE_START_MARGIN_MS) {
        return finish(false, "insufficient_validity_for_voice_cue")
      }
      playCueThenSpeak()
    } else startSpeechAfterCue()
  }

  private fun playCueThenSpeak() {
    if (finished) return
    val player = runCatching { MediaPlayer.create(this, R.raw.radar_voice_chime, audioAttributes, 0) }.getOrNull()
    if (player == null) {
      Log.w(TAG, "voice_cue=unavailable fallback=speech")
      startSpeechAfterCue()
      return
    }
    cuePlayer = player
    player.setOnCompletionListener { completed ->
      handler.post {
        if (finished || cuePlayer !== completed) return@post
        releaseCue(false)
        Log.i(TAG, "voice_cue=completed")
        startSpeechAfterCue()
      }
    }
    player.setOnErrorListener { failed, _, _ ->
      handler.post {
        if (finished || cuePlayer !== failed) return@post
        releaseCue(true)
        Log.w(TAG, "voice_cue=error fallback=speech")
        startSpeechAfterCue()
      }
      true
    }
    try {
      val item = request ?: return finish(false, "request_missing_before_voice_cue")
      val preferences = RadarVoicePreferencesStore.load(this)
      if (RadarVoicePreferencesStore.isMuted(this)) return finish(false, "voice_muted")
      if (!preferences.enabled) return finish(false, "voice_disabled_before_cue")
      if (!validBeforeSpeech(item) || !item.items.all { eligibleAtStart(it, preferences, System.currentTimeMillis()) }) {
        return finish(false, "payload_expired_before_voice_cue")
      }
      if (!focusHeld || isCallAudioActive()) return finish(false, "audio_focus_interrupted_before_voice_cue")
      if (item.validUntil - System.currentTimeMillis() <= CUE_DURATION_MS + CUE_START_MARGIN_MS) {
        return finish(false, "insufficient_validity_for_voice_cue")
      }
      if (!preferences.soundBeforeSpeech) {
        releaseCue(true)
        startSpeechAfterCue()
        return
      }
      if (preferences.headphonesOnly && !RadarVoiceRouteAuthorization.isAllowed(this, "before_voice_cue")) {
        releaseCue(true)
        finish(false, "headphone_route_unconfirmed")
        return
      }
      player.start()
      handler.postDelayed(cueWatchdog, CUE_WATCHDOG_MS)
      Log.i(TAG, "voice_cue=started")
    } catch (error: Exception) {
      releaseCue(true)
      Log.w(TAG, "voice_cue=error fallback=speech type=${error.javaClass.simpleName}")
      startSpeechAfterCue()
    }
  }

  private fun startSpeechAfterCue() {
    if (finished) return
    val item = request ?: return finish(false, "request_missing")
    if (!validBeforeSpeech(item)) return finish(false, "payload_expired_before_speech")
    val preferences = RadarVoicePreferencesStore.load(this)
    if (RadarVoicePreferencesStore.isMuted(this)) return finish(false, "voice_muted")
    if (!preferences.enabled) return finish(false, "voice_disabled_before_speech")
    if (!item.items.all { eligibleAtStart(it, preferences, System.currentTimeMillis()) }) {
      return finish(false, "voice_window_changed_before_speech")
    }
    if (preferences.headphonesOnly && !RadarVoiceRouteAuthorization.isAllowed(this, "before_speech")) {
      return finish(false, "headphone_route_unconfirmed")
    }
    if (isCallAudioActive()) return finish(false, "call_audio_active")
    if (!focusHeld) return finish(false, "audio_focus_lost_before_speech")
    val engine = tts ?: return finish(false, "tts_engine_missing")
    if (!configureVoice(engine, preferences.voiceId)) return finish(false, "no_usable_voice")
    val speech = speechText(item.items, item.stopName, preferences.announcementStyle, System.currentTimeMillis())
    val utterance = "radar-voice"
    utteranceId = utterance
    engine.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
      override fun onStart(id: String) {
        handler.post {
          if (finished) return@post
          val current = request
          if (current == null || !RadarNotificationSession.isActive(this@RadarVoicePlaybackService, current.sessionId)) {
            finish(false, "session_inactive_at_synthesis_start")
          }
          else {
            speechStarted = true
            Log.i(TAG, "voice_synthesis=started items=${current.items.size}")
          }
        }
      }

      override fun onDone(id: String) {
        handler.post { finish(true, "done") }
      }

      override fun onError(id: String) {
        handler.post { finish(false, "tts_error") }
      }

      override fun onError(id: String, errorCode: Int) {
        handler.post { finish(false, "tts_error_$errorCode") }
      }
    })
    if (preferences.headphonesOnly) {
      if (!RadarVoiceRouteAuthorization.isAllowed(this, "before_speak")) return finish(false, "headphone_route_unconfirmed")
      observeAudioRoute()
    }
    handler.postDelayed(timeout, SPEECH_WATCHDOG_MS)
    Log.i(TAG, "voice_attempt voice=${preferences.voiceId} items=${item.items.size}")
    if (engine.speak(speech, TextToSpeech.QUEUE_FLUSH, null, utterance) == TextToSpeech.ERROR) {
      finish(false, "tts_queue_failed")
    }
  }

  private fun configureVoice(engine: TextToSpeech, requested: String): Boolean {
    val voices = runCatching { engine.voices.orEmpty().filter(::isPtBr) }.getOrDefault(emptyList())
    val fallback = voices.sortedWith(compareBy<Voice> { it.isNetworkConnectionRequired }
      .thenByDescending { it.quality }).firstOrNull()
    val family = when (requested) {
      "lia" -> "pt-br-x-pte"
      "caio" -> "pt-br-x-ptd"
      else -> null
    }
    val preferred = if (family == null) null else voices
      .filter { it.name.lowercase(Locale.ROOT).contains(family) }
      .sortedWith(compareBy<Voice> { it.isNetworkConnectionRequired }.thenByDescending { it.quality })
      .firstOrNull()
    val defaultVoice = runCatching { engine.defaultVoice }.getOrNull()
    val selected = when {
      requested == "device" && defaultVoice?.let(::isPtBr) == true -> defaultVoice
      preferred != null -> preferred
      fallback != null -> fallback
      else -> defaultVoice
    }
    if (selected != null && engine.setVoice(selected) == TextToSpeech.SUCCESS) {
      val source = when {
        preferred === selected -> "family"
        requested == "device" && defaultVoice === selected -> "device_default"
        isPtBr(selected) -> "pt_br_fallback"
        else -> "device_fallback"
      }
      Log.i(TAG, "voice_resolution=$source local=${!selected.isNetworkConnectionRequired}")
      return true
    }
    val languageStatus = engine.setLanguage(Locale.forLanguageTag("pt-BR"))
    if (languageStatus < TextToSpeech.LANG_AVAILABLE) return false
    Log.i(TAG, "voice_resolution=engine_language_fallback")
    return true
  }

  private fun isPtBr(voice: Voice) =
    voice.locale.language.equals("pt", ignoreCase = true) && voice.locale.country.equals("BR", ignoreCase = true)

  private fun requestFocus(): Boolean {
    val manager = audioManager()
    val result = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
        .setAudioAttributes(audioAttributes)
        .setAcceptsDelayedFocusGain(false)
        .setOnAudioFocusChangeListener(focusListener, handler)
        .build()
      focusRequest = request
      manager.requestAudioFocus(request)
    } else {
      @Suppress("DEPRECATION")
      manager.requestAudioFocus(focusListener, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
    }
    focusHeld = result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
    return focusHeld
  }

  private fun isCallAudioActive() = audioManager().mode == AudioManager.MODE_IN_CALL
    || audioManager().mode == AudioManager.MODE_IN_COMMUNICATION

  private fun observeAudioRoute() {
    handler.removeCallbacks(routeMonitor)
    handler.postDelayed(routeMonitor, ROUTE_CHECK_INTERVAL_MS)
  }

  private fun checkAudioRoute() {
    if (!finished && request?.let { RadarVoicePreferencesStore.load(this).headphonesOnly } == true
      && !RadarVoiceRouteAuthorization.isAllowed(this, "route_change", false)) finish(false, "headphone_route_lost")
  }

  private fun validBeforeSpeech(item: Request): Boolean =
    RadarNotificationSession.isActive(this, item.sessionId)
      && item.validUntil > System.currentTimeMillis()
      && item.items.all { it.predictedAt > System.currentTimeMillis() }

  private fun eligibleAtStart(item: SpeechItem, preferences: RadarVoicePreferences, now: Long): Boolean {
    val remainingMs = item.predictedAt - now
    return when (item.kind) {
      "arriving" -> preferences.announceArriving && remainingMs in 1 until 60_000L
      else -> remainingMs in 1..(preferences.advanceMinutes * 60_000L)
    }
  }

  private fun speechText(items: List<SpeechItem>, stopName: String, style: String, now: Long): String {
    fun eta(item: SpeechItem): String {
      val remaining = item.predictedAt - now
      if (remaining < 60_000L) return "menos de um minuto"
      val minutes = kotlin.math.ceil(remaining / 60_000.0).toInt()
      return "$minutes ${if (minutes == 1) "minuto" else "minutos"}"
    }
    fun description(item: SpeechItem, capitalize: Boolean = false): String {
      val line = pronounceLine(item.code)
      val departure = if (capitalize) "Saída" else "saída"
      if (item.kind == "arriving") return if (item.departure) "$departure da linha $line chegando" else "${if (capitalize) "Linha" else "linha"} $line chegando"
      val time = eta(item)
      return if (item.departure) "$departure da linha $line em $time" else "${if (capitalize) "Linha" else "linha"} $line em $time"
    }

    val first = items.first()
    val second = items.getOrNull(1)
    val brief = if (second == null) description(first, true) else {
      val secondText = if (first.code == second.code) {
        val secondTime = if (second.kind == "arriving") "chegando" else "em ${eta(second)}"
        "outro da mesma linha $secondTime"
      } else description(second)
      "${description(first, true)} e $secondText"
    }
    if (style == "brief") return "$brief."

    fun clause(item: SpeechItem, includeArticle: Boolean): String {
      val line = pronounceLine(item.code)
      val subject = if (item.departure) "saída da linha $line" else "linha $line"
      val article = if (includeArticle) "A " else if (item.departure) "a " else "a "
      return when {
        item.kind == "arriving" -> "$article$subject está chegando"
        item.departure -> "$article$subject está prevista para sair em ${eta(item)}"
        else -> "$article$subject está prevista para chegar em ${eta(item)}"
      }
    }
    val text = if (second == null) {
      "${clause(first, true)} à parada $stopName"
    } else {
      val sameLine = first.code == second.code
      when {
        sameLine && !first.departure && !second.departure && first.kind == "window" && second.kind == "window" ->
          "A linha ${pronounceLine(first.code)} chega em ${eta(first)} e outro da mesma linha chega em ${eta(second)} à parada $stopName"
        sameLine && !first.departure && !second.departure && first.kind == "arriving" && second.kind == "arriving" ->
          "A linha ${pronounceLine(first.code)} está chegando e outro da mesma linha também, à parada $stopName"
        else -> "${clause(first, true)} e ${clause(second, false)} à parada $stopName"
      }
    }
    return when (style) {
      "detailed" -> "Atenção. $text. Prepare-se para o embarque."
      else -> "$text."
    }
  }

  private fun pronounceLine(code: String): String {
    if (!code.matches(Regex("\\d{3,}"))) return code
    return code.map { DIGITS[it.digitToInt()] }.joinToString(" ")
  }

  private fun audioManager() = getSystemService(AUDIO_SERVICE) as AudioManager

  private fun parseRequest(intent: Intent?): Request? {
    if (intent == null) return null
    val sessionId = intent.getStringExtra(EXTRA_SESSION_ID)?.takeIf(String::isNotBlank) ?: return null
    val reservationKeys = intent.getStringArrayListExtra(EXTRA_RESERVATION_KEYS)?.takeIf { it.isNotEmpty() } ?: return null
    val itemsJson = intent.getStringExtra(EXTRA_ITEMS)?.takeIf(String::isNotBlank) ?: return null
    val stopName = intent.getStringExtra(EXTRA_STOP_NAME)?.takeIf(String::isNotBlank) ?: return null
    val validUntil = intent.getLongExtra(EXTRA_VALID_UNTIL, 0).takeIf { it > 0 } ?: return null
    val predictionSignature = intent.getStringExtra(EXTRA_PREDICTION_SIGNATURE)?.takeIf(String::isNotBlank) ?: return null
    val items = runCatching {
      val array = org.json.JSONArray(itemsJson)
      if (array.length() !in 1..MAX_ANNOUNCED_ITEMS || array.length() != reservationKeys.size) return null
      (0 until array.length()).map { index ->
        val json = array.getJSONObject(index)
        SpeechItem(
          json.getString("eventId").takeIf(String::isNotBlank) ?: return null,
          json.optString("vehicleId").takeIf(String::isNotBlank),
          json.getString("code").takeIf(String::isNotBlank) ?: return null,
          json.optBoolean("departure"), json.optBoolean("priority"),
          json.getLong("etaSeconds").takeIf { it >= 0 } ?: return null,
          json.getLong("predictedAt").takeIf { it > 0 } ?: return null,
          json.optString("kind").takeIf { it == "window" || it == "arriving" } ?: return null,
        )
      }
    }.getOrNull() ?: return null
    return Request(sessionId, items, stopName, validUntil, reservationKeys, predictionSignature)
  }

  private fun finish(success: Boolean, reason: String) {
    if (finished) return
    finished = true
    handler.removeCallbacks(timeout)
    handler.removeCallbacks(initializationTimeout)
    releaseCue(true)
    val current = request
    if (success && current != null) {
      val completedAt = System.currentTimeMillis()
      current.reservationKeys.forEachIndexed { index, key ->
        RadarVoiceAnnouncementStore.complete(this, key, completedAt, current.items[index].etaSeconds, current.predictionSignature)
      }
      Log.i(TAG, "voice_synthesis=completed items=${current.items.size}")
    } else {
      current?.let { releaseReservations(it.reservationKeys) }
      if (speechStarted) Log.i(TAG, "voice_synthesis=cancelled reason=$reason")
      if (reason.startsWith("tts_")) Log.e(TAG, "voice_error reason=$reason")
      else Log.w(TAG, "voice_discard reason=$reason")
    }
    tts?.stop()
    tts?.shutdown()
    tts = null
    releaseFocus()
    handler.removeCallbacks(routeMonitor)
    if (foreground) ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_DETACH)
    stopSelf(startId)
  }

  private fun releaseFocus() {
    if (!focusHeld) return
    val manager = audioManager()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) focusRequest?.let(manager::abandonAudioFocusRequest)
    else {
      @Suppress("DEPRECATION")
      manager.abandonAudioFocus(focusListener)
    }
    focusHeld = false
    focusRequest = null
  }

  private fun releaseCue(stop: Boolean) {
    handler.removeCallbacks(cueWatchdog)
    val player = cuePlayer ?: return
    cuePlayer = null
    if (stop) runCatching { if (player.isPlaying) player.stop() }
    runCatching { player.release() }
  }

  private fun releaseReservations(keys: List<String>?) = keys.orEmpty().forEach { RadarVoiceAnnouncementStore.release(this, it) }

  override fun onDestroy() {
    if (!finished) {
      request?.let { releaseReservations(it.reservationKeys) }
      handler.removeCallbacks(timeout)
      handler.removeCallbacks(initializationTimeout)
      releaseCue(true)
      tts?.stop()
      tts?.shutdown()
      releaseFocus()
      handler.removeCallbacks(routeMonitor)
      if (foreground) ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_DETACH)
    }
    if (instance === this) instance = null
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  companion object {
    private const val TAG = "RadarNativeProbe"
    private const val INIT_TIMEOUT_MS = 10_000L
    private const val SPEECH_WATCHDOG_MS = 45_000L
    private const val CUE_DURATION_MS = 380L
    private const val CUE_START_MARGIN_MS = 500L
    private const val CUE_WATCHDOG_MS = 1_500L
    private const val BALANCED_REPEAT_MS = 120_000L
    private const val MIN_ETA_CHANGE_SECONDS = 60L
    private const val MAX_ANNOUNCED_ITEMS = 2
    private const val ROUTE_CHECK_INTERVAL_MS = 200L
    private const val EXTRA_SESSION_ID = "session_id"
    private const val EXTRA_ITEMS = "items_json"
    private const val EXTRA_RESERVATION_KEYS = "reservation_keys"
    private const val EXTRA_PREDICTION_SIGNATURE = "prediction_signature"
    private const val EXTRA_STOP_NAME = "stop_name"
    private const val EXTRA_VALID_UNTIL = "valid_until"
    private const val EXTRA_NOTIFICATION = "foreground_notification"
    private val DIGITS = listOf("zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove")
    private val sessionServiceLock = Any()
    @Volatile private var instance: RadarVoicePlaybackService? = null
    private data class VoiceCandidate(
      val item: RadarRemoteItem,
      val predictedAt: Long,
      val kind: String,
      val role: String,
    )

    private fun sameVehicle(first: RadarRemoteItem, second: RadarRemoteItem): Boolean =
      first.eventId == second.eventId || (first.vehicleId != null && first.vehicleId == second.vehicleId)

    internal fun currentVoiceOutputRoute(context: Context) = RadarVoiceRouteAuthorization.status(context)

    internal fun authorizeCurrentBluetoothOutput(context: Context) =
      RadarVoiceRouteAuthorization.authorizeCurrentBluetoothRoute(context)

    internal fun onAudioOutputRouteChanged() {
      instance?.let { service -> service.handler.post { service.checkAudioRoute() } }
    }

    internal fun startIfEligible(
      context: Context,
      payload: RadarRemotePayload,
      notification: Notification,
      effectivePriority: Int,
      sentTime: Long,
      ttlSeconds: Int,
    ) {
      val preferences = RadarVoicePreferencesStore.load(context)
      Log.i(TAG, "voice_enabled=${preferences.enabled}")
      if (!preferences.enabled) return
      if (RadarVoicePreferencesStore.isMuted(context)) {
        Log.i(TAG, "voice_muted=true")
        return
      }
      if (instance?.let { !it.finished } == true) {
        Log.i(TAG, "voice_discard reason=speech_in_progress")
        return
      }
      if (effectivePriority != com.google.firebase.messaging.RemoteMessage.PRIORITY_HIGH) {
        Log.w(TAG, "voice_discard reason=fcm_priority_not_high")
        return
      }
      val now = System.currentTimeMillis()
      if (ttlSeconds > 0 && sentTime > 0 && now - sentTime > ttlSeconds * 1000L) {
        Log.w(TAG, "voice_discard reason=fcm_message_stale")
        return
      }
      if (payload.validUntil <= now || !RadarNotificationSession.isActive(context, payload.sessionId)) {
        Log.w(TAG, "voice_discard reason=session_or_payload_expired")
        return
      }
      if (preferences.headphonesOnly && !RadarVoiceRouteAuthorization.isAllowed(context, "before_service")) {
        Log.w(TAG, "voice_discard reason=headphone_route_unconfirmed")
        return
      }

      if (payload.items.isEmpty()) {
        Log.i(TAG, "voice_discard reason=no_items")
        return
      }
      val preferenceKey = "v2|${preferences.advanceMinutes}|${preferences.announceArriving}|${preferences.vehicleSelection}|${preferences.announcementFrequency}"
      val predictionSignature = "${payload.revision}:${payload.predictionVersion}"
      val eligible = payload.items.mapNotNull { item ->
        val predictedAt = item.predictedAt ?: return@mapNotNull null
        val remaining = predictedAt - now
        if (item.eventId.isBlank() || item.code.isBlank() || item.etaSeconds < 0 || remaining <= 0) return@mapNotNull null
        val kind = when {
          preferences.announceArriving && remaining < 60_000L -> "arriving"
          remaining <= preferences.advanceMinutes * 60_000L -> "window"
          else -> return@mapNotNull null
        }
        VoiceCandidate(item, predictedAt, kind, "summary")
      }
      if (eligible.isEmpty()) {
        Log.i(TAG, "voice_discard reason=no_item_inside_voice_window")
        return
      }

      val byNearest = compareBy<VoiceCandidate> { it.predictedAt }
        .thenByDescending { it.item.priority }.thenBy { it.item.eventId }
      val nearest = eligible.sortedWith(byNearest).first()
      val ordered = when (preferences.vehicleSelection) {
        "nearest" -> listOf(nearest.copy(role = "lead"))
        "nextAndFavorites" -> listOfNotNull(
          nearest.copy(role = "lead"),
          eligible.asSequence().filter { !sameVehicle(it.item, nearest.item) && it.item.priority }
            .sortedWith(byNearest).firstOrNull()?.copy(role = "favorite"),
        )
        else -> {
          val remainder = eligible.filter { !sameVehicle(it.item, nearest.item) }.sortedWith(
            compareBy<VoiceCandidate> { candidate ->
              val stableVehicleId = candidate.item.vehicleId ?: candidate.item.eventId
              RadarVoiceAnnouncementStore.lastSpokenAt(context, payload.sessionId, stableVehicleId,
                candidate.item.eventId, candidate.kind, if (candidate.item.priority) "favorite" else "summary", preferenceKey)
            }.thenByDescending { it.item.priority }.thenBy { it.predictedAt }.thenBy { it.item.eventId },
          ).map { it.copy(role = if (it.item.priority) "favorite" else "summary") }
          listOf(nearest.copy(role = "lead")) + remainder
        }
      }
      val maxItems = if (preferences.vehicleSelection == "nearest") 1 else MAX_ANNOUNCED_ITEMS
      val selected = mutableListOf<Pair<VoiceCandidate, RadarVoiceAnnouncementStore.Reservation>>()
      for (candidate in ordered) {
        if (selected.size >= maxItems) break
        val item = candidate.item
        val stableVehicleId = item.vehicleId ?: item.eventId
        val reservation = RadarVoiceAnnouncementStore.reserve(context, payload.sessionId, stableVehicleId,
          item.eventId, candidate.kind, candidate.role, preferenceKey, preferences.announcementFrequency,
          item.etaSeconds, predictionSignature, now)
        if (reservation.key == null) {
          Log.i(TAG, "voice_discard reason=${reservation.reason}")
          continue
        }
        selected += candidate to reservation
      }
      if (selected.isEmpty()) return
      val itemsJson = org.json.JSONArray().apply {
        selected.forEach { (candidate, _) ->
          val item = candidate.item
          put(JSONObject()
            .put("eventId", item.eventId)
            .put("vehicleId", item.vehicleId)
            .put("code", item.code)
            .put("departure", item.departure)
            .put("priority", item.priority)
            .put("etaSeconds", item.etaSeconds)
            .put("predictedAt", candidate.predictedAt)
            .put("kind", candidate.kind))
        }
      }.toString()
      val reservations = ArrayList(selected.map { it.second.key!! })
      val intent = Intent(context, RadarVoicePlaybackService::class.java)
        .putExtra(EXTRA_SESSION_ID, payload.sessionId)
        .putExtra(EXTRA_ITEMS, itemsJson)
        .putStringArrayListExtra(EXTRA_RESERVATION_KEYS, reservations)
        .putExtra(EXTRA_PREDICTION_SIGNATURE, predictionSignature)
        .putExtra(EXTRA_STOP_NAME, payload.presentation.stopName)
        .putExtra(EXTRA_VALID_UNTIL, payload.validUntil)
        .putExtra(EXTRA_NOTIFICATION, notification)
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) ContextCompat.startForegroundService(context, intent)
        else context.startService(intent)
        Log.i(TAG, "voice_eligible items=${selected.size} mode=${preferences.vehicleSelection} frequency=${preferences.announcementFrequency}")
      } catch (error: Exception) {
        selected.forEach { (_, reservation) -> reservation.key?.let { RadarVoiceAnnouncementStore.release(context, it) } }
        Log.e(TAG, "voice_service_start_error type=${error.javaClass.simpleName}")
      }
    }

    internal fun stopForSession(context: Context, sessionId: String?) = synchronized(sessionServiceLock) {
      val service = instance
      if (service == null) {
        if (sessionId == null) context.stopService(Intent(context, RadarVoicePlaybackService::class.java))
      } else if (sessionId == null || service.request?.sessionId == sessionId) {
        service.handler.post {
          if (!service.finished) service.finish(false, "session_stopped")
        }
      }
      if (sessionId == null) RadarVoiceAnnouncementStore.clearAll(context)
      else RadarVoiceAnnouncementStore.clearSession(context, sessionId)
    }

    internal fun clearSessionState(context: Context, sessionId: String) =
      RadarVoiceAnnouncementStore.clearSession(context, sessionId)

    internal fun preferencesChanged(context: Context, preferences: RadarVoicePreferences) {
      val service = instance ?: return
      service.handler.post {
        if (RadarVoicePreferencesStore.isMuted(context)) service.finish(false, "voice_muted")
        else if (!preferences.enabled) service.finish(false, "voice_disabled")
        else if (preferences.headphonesOnly) {
          if (!RadarVoiceRouteAuthorization.isAllowed(context, "preferences_changed")) service.finish(false, "headphone_route_unconfirmed")
          else service.observeAudioRoute()
        }
      }
    }

    @Suppress("DEPRECATION")
    private fun Intent.parcelableNotification(): Notification? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      getParcelableExtra(EXTRA_NOTIFICATION, Notification::class.java)
    } else {
      getParcelableExtra(EXTRA_NOTIFICATION) as? Notification
    }
  }

  private object RadarVoiceAnnouncementStore {
    private const val TAG_PREFIX = "entry_"
    private const val RESERVATION_MS = 60_000L
    private const val STATE_PREFS = "noponto_radar_voice_delivery_v1"
    data class Reservation(val key: String?, val reason: String?)
    private fun hash(value: String): String = MessageDigest.getInstance("SHA-256")
      .digest(value.toByteArray(Charsets.UTF_8)).take(12).joinToString("") { "%02x".format(it) }
    private fun key(sessionId: String, vehicleId: String, eventId: String, kind: String, role: String, policyKey: String) =
      "${TAG_PREFIX}${hash(sessionId)}_${hash("$vehicleId|$eventId|$kind|$role|$policyKey")}"

    @Synchronized
    fun lastSpokenAt(context: Context, sessionId: String, vehicleId: String, eventId: String,
      kind: String, role: String, policyKey: String): Long {
      val entryKey = key(sessionId, vehicleId, eventId, kind, role, policyKey)
      val stored = runCatching {
        JSONObject(context.getSharedPreferences(STATE_PREFS, Context.MODE_PRIVATE).getString(entryKey, null) ?: "{}")
      }.getOrNull()
      return stored?.optLong("lastSpokenAt", 0) ?: 0
    }

    @Synchronized
    fun reserve(context: Context, sessionId: String, vehicleId: String, eventId: String, kind: String,
      role: String, policyKey: String, frequency: String, etaSeconds: Long, predictionSignature: String,
      now: Long): Reservation {
      val entryKey = key(sessionId, vehicleId, eventId, kind, role, policyKey)
      val preferences = context.getSharedPreferences(STATE_PREFS, Context.MODE_PRIVATE)
      val stored = runCatching { JSONObject(preferences.getString(entryKey, null) ?: "{}") }.getOrNull()
      val pendingUntil = stored?.optLong("pendingUntil", 0) ?: 0
      val lastSpokenAt = stored?.optLong("lastSpokenAt", 0) ?: 0
      if (pendingUntil > now) return Reservation(null, "announcement_pending")
      if (lastSpokenAt > 0) {
        when (frequency) {
          "essential" -> return Reservation(null, "important_event_already_announced")
          "balanced" -> {
            if (now - lastSpokenAt < BALANCED_REPEAT_MS) return Reservation(null, "repeat_interval_active")
            if (kotlin.math.abs(etaSeconds - (stored?.optLong("lastEtaSeconds", 0) ?: 0)) < MIN_ETA_CHANGE_SECONDS) {
              return Reservation(null, "prediction_not_changed")
            }
          }
          "eachUpdate" -> if (stored?.optString("lastPushSignature") == predictionSignature) {
            return Reservation(null, "duplicate_update")
          }
        }
      }
      val value = JSONObject().put("pendingUntil", now + RESERVATION_MS)
        .put("lastSpokenAt", lastSpokenAt)
        .put("lastEtaSeconds", stored?.optLong("lastEtaSeconds", 0) ?: 0)
        .put("lastPushSignature", stored?.optString("lastPushSignature").orEmpty())
      if (!preferences.edit().putString(entryKey, value.toString()).commit()) return Reservation(null, "dedup_state_unavailable")
      return Reservation(entryKey, null)
    }

    @Synchronized
    fun complete(context: Context, key: String, now: Long, etaSeconds: Long, predictionSignature: String) {
      val preferences = context.getSharedPreferences(STATE_PREFS, Context.MODE_PRIVATE)
      preferences.edit().putString(key, JSONObject().put("pendingUntil", 0).put("lastSpokenAt", now)
        .put("lastEtaSeconds", etaSeconds).put("lastPushSignature", predictionSignature).toString()).commit()
    }

    @Synchronized
    fun release(context: Context, key: String) {
      val preferences = context.getSharedPreferences(STATE_PREFS, Context.MODE_PRIVATE)
      val stored = runCatching { JSONObject(preferences.getString(key, null) ?: "{}") }.getOrNull() ?: return
      if (stored.optLong("lastSpokenAt", 0) > 0) {
        preferences.edit().putString(key, JSONObject().put("pendingUntil", 0)
          .put("lastSpokenAt", stored.optLong("lastSpokenAt", 0))
          .put("lastEtaSeconds", stored.optLong("lastEtaSeconds", 0))
          .put("lastPushSignature", stored.optString("lastPushSignature")).toString()).commit()
      } else preferences.edit().remove(key).commit()
    }

    @Synchronized
    fun clearSession(context: Context, sessionId: String) {
      val prefix = "$TAG_PREFIX${hash(sessionId)}_"
      val preferences = context.getSharedPreferences(STATE_PREFS, Context.MODE_PRIVATE)
      preferences.edit().also { editor -> preferences.all.keys.filter { it.startsWith(prefix) }.forEach(editor::remove) }.commit()
    }

    @Synchronized
    fun clearAll(context: Context) = context.getSharedPreferences(STATE_PREFS, Context.MODE_PRIVATE).edit().clear().commit()
  }
}
