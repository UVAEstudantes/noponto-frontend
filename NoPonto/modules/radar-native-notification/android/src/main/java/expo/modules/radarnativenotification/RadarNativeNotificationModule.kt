package expo.modules.radarnativenotification

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import android.view.View
import android.widget.RemoteViews
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONArray
import org.json.JSONObject
import java.text.ParsePosition
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone
import java.util.UUID

internal data class RadarLinePresentation(
  val code: String,
  val priority: Boolean,
  val departure: Boolean,
  val eta: String,
  val next: List<String>,
  val detail: String? = null,
  val headsUp: Boolean = false,
  val deadline: Long? = null,
  val dataUntil: Long? = null,
)

internal data class RadarPresentation(
  val stopName: String,
  val lines: List<RadarLinePresentation>,
  val moreLines: Int,
  val morePredictions: Int,
)

internal data class RadarRemoteItem(
  val eventId: String,
  val vehicleId: String?,
  val code: String,
  val departure: Boolean,
  val etaSeconds: Long,
  val predictedAt: Long?,
  val priority: Boolean,
  val modal: String? = null,
  val routeType: String? = null,
  val operationalStatus: String? = null,
  val trainCode: String? = null,
  val railVehicleId: String? = null,
  val expectedRunId: String? = null,
  val scheduledStopId: String? = null,
  val destinationName: String? = null,
  val lineName: String? = null,
) {
  val isRail get() = modal?.equals("trem", ignoreCase = true) == true
    || routeType?.equals("trem", ignoreCase = true) == true
  val railStatus get() = operationalStatus ?: "Scheduled"
}

internal data class RadarRemotePayload(
  val sessionId: String,
  val revision: Long,
  val predictionVersion: Long,
  val contextKey: String,
  val paradaId: String,
  val validUntil: Long,
  val items: List<RadarRemoteItem>,
  val presentation: RadarPresentation,
)

internal data class RadarVoicePreferences(
  val enabled: Boolean,
  val voiceId: String,
  val announcementStyle: String,
  val advanceMinutes: Int,
  val announceArriving: Boolean,
  val vehicleSelection: String,
  val announcementFrequency: String,
  val headphonesOnly: Boolean,
  val soundBeforeSpeech: Boolean,
)

internal object RadarVoicePreferencesStore {
  private const val PREFERENCES = "noponto_radar_voice_preferences_v1"
  private const val SETTINGS = "settings"
  private const val KEY_MUTED = "voice_muted"
  private val voiceIds = setOf("lia", "caio", "device")
  private val styles = setOf("brief", "standard", "detailed")
  private val vehicleSelections = setOf("nearest", "nextAndFavorites", "allRelevant")
  private val frequencies = setOf("essential", "balanced", "eachUpdate")

  fun isMuted(context: Context) = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
    .getBoolean(KEY_MUTED, false)

  fun setMuted(context: Context, muted: Boolean) = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
    .edit().putBoolean(KEY_MUTED, muted).commit()

  fun save(context: Context, value: String): Boolean {
    if (value.length > 512) return false
    val json = runCatching { JSONObject(value) }.getOrNull() ?: return false
    val enabled = json.opt("enabled") as? Boolean ?: return false
    val voiceId = json.opt("voiceId") as? String ?: return false
    val announcementStyle = json.opt("announcementStyle") as? String ?: return false
    val vehicleSelection = json.opt("vehicleSelection") as? String ?: return false
    val advanceValue = (json.opt("advanceMinutes") as? Number)?.toDouble() ?: return false
    val announceArriving = json.opt("announceArriving") as? Boolean ?: return false
    val frequency = json.opt("announcementFrequency") as? String ?: return false
    val headphonesOnly = json.opt("headphonesOnly") as? Boolean ?: return false
    val soundBeforeSpeech = when (val sound = json.opt("soundBeforeSpeech")) {
      null -> false
      is Boolean -> sound
      else -> return false
    }
    if (voiceId !in voiceIds || announcementStyle !in styles || vehicleSelection !in vehicleSelections
      || advanceValue.toInt().toDouble() != advanceValue || advanceValue.toInt() !in 1..15
      || frequency !in frequencies) return false

    val normalized = JSONObject()
      .put("enabled", enabled)
      .put("voiceId", voiceId)
      .put("announcementStyle", announcementStyle)
      .put("advanceMinutes", advanceValue.toInt())
      .put("announceArriving", announceArriving)
      .put("vehicleSelection", vehicleSelection)
      .put("announcementFrequency", frequency)
      .put("headphonesOnly", headphonesOnly)
      .put("soundBeforeSpeech", soundBeforeSpeech)
    return context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
      .edit().putString(SETTINGS, normalized.toString()).commit()
  }

  fun load(context: Context): RadarVoicePreferences {
    val value = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE).getString(SETTINGS, null)
      ?: return defaultPreferences()
    val json = runCatching { JSONObject(value) }.getOrNull()
      ?: return defaultPreferences()
    val voiceId = (json.opt("voiceId") as? String)?.takeIf { it in voiceIds } ?: "lia"
    val announcementStyle = (json.opt("announcementStyle") as? String)?.takeIf { it in styles } ?: "standard"
    val legacyThresholds = json.optJSONArray("alertAtMinutes")?.let { array ->
      (0 until array.length()).mapNotNull { index -> array.optInt(index, -1).takeIf { it in 0..30 } }
    }.orEmpty()
    val advanceMinutes = json.optInt("advanceMinutes", legacyThresholds.filter { it > 0 }.maxOrNull() ?: 7).coerceIn(1, 15)
    val announceArriving = json.opt("announceArriving") as? Boolean
      ?: if (json.has("alertAtMinutes")) legacyThresholds.contains(0) else true
    val vehicleSelection = when (json.opt("vehicleSelection") as? String) {
      "nearest" -> "nearest"
      "nextAndFavorites", "preferPriority", "priorityOnly" -> "nextAndFavorites"
      "allRelevant", "all" -> "allRelevant"
      else -> "allRelevant"
    }.takeIf { it in vehicleSelections } ?: "allRelevant"
    val frequency = (json.opt("announcementFrequency") as? String)?.takeIf { it in frequencies }
      ?: if (json.has("repeatIntervalMinutes") && json.optInt("repeatIntervalMinutes", -1) == 0) "essential" else "balanced"
    return RadarVoicePreferences(
      json.opt("enabled") as? Boolean ?: false,
      voiceId,
      announcementStyle,
      advanceMinutes,
      announceArriving,
      vehicleSelection,
      frequency,
      json.opt("headphonesOnly") as? Boolean ?: true,
      json.opt("soundBeforeSpeech") as? Boolean ?: false,
    )
  }

  private fun defaultPreferences() = RadarVoicePreferences(false, "lia", "standard", 7, true, "allRelevant", "balanced", true, false)
}
class RadarNativeNotificationModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("RadarNativeNotification")

    AsyncFunction("showTestNotification") { scenario: String, headsUp: Boolean, traceId: String ->
      require(scenario == "multiple-lines" || scenario == "empty") { "Cenário inválido" }
      require(traceId.isNotBlank() && traceId.length <= 64) { "Identificador inválido" }
      val startedAt = SystemClock.elapsedRealtime()
      Log.i(LOG_TAG, "test_kotlin_entry")
      val context = appContext.reactContext ?: error("Contexto Android indisponível")
      val channelId = if (headsUp) CHANNEL_HEADS_UP else CHANNEL_NORMAL
      ensureChannel(context, channelId, headsUp)
      val presentation = testPresentation(scenario)
      val notification = buildNotification(context, presentation, channelId, headsUp, traceId)
      requireNotificationsEnabled(context)
      Log.i(LOG_TAG, "test_notify_start_ms=${SystemClock.elapsedRealtime() - startedAt}")
      RadarNotificationSession.start(context, traceId, notification)
      Log.i(LOG_TAG, "test_notify_return_ms=${SystemClock.elapsedRealtime() - startedAt}")
    }

    AsyncFunction("startRadarNotification") { sessionId: String, presentationJson: String ->
      require(sessionId.isNotBlank() && sessionId.length <= 128) { "Identificador de sessão inválido" }
      val startedAt = SystemClock.elapsedRealtime()
      Log.i(LOG_TAG, "local_session_start_entry")
      val context = appContext.reactContext ?: error("Contexto Android indisponível")
      ensureChannel(context, CHANNEL_NORMAL, false)
      val notification = buildNotification(context, parsePresentation(presentationJson), CHANNEL_NORMAL, false, sessionId)
      requireNotificationsEnabled(context)
      Log.i(LOG_TAG, "local_session_notify_start_ms=${SystemClock.elapsedRealtime() - startedAt}")
      RadarNotificationSession.start(context, sessionId, notification)
      Log.i(LOG_TAG, "local_session_notify_return_ms=${SystemClock.elapsedRealtime() - startedAt}")
    }

    AsyncFunction("updateRadarNotification") { sessionId: String, revision: Int, presentationJson: String ->
      require(sessionId.isNotBlank() && sessionId.length <= 128) { "Identificador de sessão inválido" }
      require(revision > 0) { "Revisão de atualização inválida" }
      val startedAt = SystemClock.elapsedRealtime()
      Log.i(LOG_TAG, "local_session_update_entry")
      val context = appContext.reactContext ?: error("Contexto Android indisponível")
      val notification = buildNotification(context, parsePresentation(presentationJson), CHANNEL_NORMAL, false, sessionId, true)
      requireNotificationsEnabled(context)
      Log.i(LOG_TAG, "local_session_update_notify_start_ms=${SystemClock.elapsedRealtime() - startedAt}")
      val updated = RadarNotificationSession.update(context, sessionId, revision, notification)
      Log.i(LOG_TAG, "local_session_update_notify_return_ms=${SystemClock.elapsedRealtime() - startedAt} active=$updated")
      updated
    }

    AsyncFunction("stopRadarNotification") { sessionId: String? ->
      val context = appContext.reactContext ?: error("Contexto Android indisponível")
      RadarNotificationSession.stop(context, sessionId?.takeIf(String::isNotBlank))
    }

    AsyncFunction("isRadarNotificationSessionActive") { sessionId: String ->
      require(sessionId.isNotBlank() && sessionId.length <= 128) { "Identificador de sessão inválido" }
      val context = appContext.reactContext ?: error("Contexto Android indisponível")
      RadarNotificationSession.isActive(context, sessionId)
    }

    AsyncFunction("saveVoicePreferences") { preferencesJson: String ->
      val context = appContext.reactContext ?: error("Contexto Android indisponível")
      if (!RadarVoicePreferencesStore.save(context, preferencesJson)) {
        throw IllegalArgumentException("Preferências de voz inválidas ou não puderam ser salvas")
      }
      RadarVoicePlaybackService.preferencesChanged(context, RadarVoicePreferencesStore.load(context))
      true
    }
    AsyncFunction("isVoiceMuted") {
      val context = appContext.reactContext ?: error("Contexto Android indisponível")
      RadarVoicePreferencesStore.isMuted(context)
    }
    AsyncFunction("setVoiceMuted") { muted: Boolean ->
      val context = appContext.reactContext ?: error("Contexto Android indisponível")
      if (!RadarVoicePreferencesStore.setMuted(context, muted)) {
        throw IllegalStateException("Não foi possível salvar o silêncio da voz")
      }
      RadarVoicePlaybackService.preferencesChanged(context, RadarVoicePreferencesStore.load(context))
      true
    }
    AsyncFunction("getVoiceOutputRouteStatus") {
      val context = appContext.reactContext ?: error("Contexto Android indisponível")
      RadarVoicePlaybackService.currentVoiceOutputRoute(context)
    }
    AsyncFunction("authorizeCurrentBluetoothOutput") {
      val context = appContext.reactContext ?: error("Contexto Android indisponível")
      RadarVoicePlaybackService.authorizeCurrentBluetoothOutput(context)
    }
    AsyncFunction("clearTestNotifications") {
      val context = appContext.reactContext ?: error("Contexto Android indisponível")
      RadarNotificationSession.stop(context)
    }
  }

  fun receiveRemote(context: Context, data: Map<String, String>, effectivePriority: Int, sentTime: Long, ttlSeconds: Int) {
    val payload = try {
      parseRemotePayload(data, sentTime)
    } catch (error: Exception) {
      logRemoteDiscard("payload_parse_exception type=${error.javaClass.simpleName}")
      return
    } ?: return
    if (payload.validUntil <= System.currentTimeMillis()) {
      logRemoteDiscard("valid_until_elapsed_before_render")
      return
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
      context.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
      logRemoteDiscard("post_notifications_permission_denied")
      return
    }
    if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) {
      logRemoteDiscard("notifications_disabled")
      return
    }
    val firstLine = payload.presentation.lines.firstOrNull()
    val headsUp = firstLine?.headsUp == true || firstLine?.eta?.contains("Chegando") == true
    val channelId = if (headsUp) CHANNEL_HEADS_UP else CHANNEL_NORMAL
    try {
      ensureChannel(context, channelId, headsUp)
    } catch (error: Exception) {
      Log.e(LOG_TAG, "notification_channel_exception type=${error.javaClass.simpleName}")
      return
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
        .getNotificationChannel(channelId)
      if (channel?.importance == NotificationManager.IMPORTANCE_NONE) {
        logRemoteDiscard("notification_channel_disabled")
        return
      }
    }
    val notification = try {
      buildNotification(context, payload.presentation, channelId, false, payload.sessionId,
        onlyAlertOnce = true, nativeHeadsUp = headsUp, showVoiceAction = true)
    } catch (error: Exception) {
      Log.e(LOG_TAG, "notification_build_exception type=${error.javaClass.simpleName}")
      return
    }
    try {
      val updated = RadarNotificationSession.updateRemote(context, payload.sessionId, payload.revision, payload.predictionVersion,
        payload.contextKey, payload.paradaId, notification)
      if (updated) RadarVoicePlaybackService.startIfEligible(context, payload, notification, effectivePriority, sentTime, ttlSeconds)
      if (updated) scheduleLocalRefresh(context, payload)
    } catch (error: Exception) {
      Log.e(LOG_TAG, "remote_publish_exception type=${error.javaClass.simpleName}")
    }
  }

  private fun parseRemotePayload(data: Map<String, String>, sentTime: Long): RadarRemotePayload? {
    if (data["mode"] != "remote-radar-native-v1") return rejectRemotePayload("mode_mismatch")
    val sessionId = data["sessionId"]?.let(::canonicalGuid) ?: return rejectRemotePayload("session_id_invalid")
    val revision = data["revision"]?.toLongOrNull()?.takeIf { it > 0 }
      ?: return rejectRemotePayload("revision_invalid")
    val predictionVersion = data["predictionVersion"]?.toLongOrNull()?.takeIf { it >= 0 }
      ?: return rejectRemotePayload("prediction_version_invalid")
    val contextKey = data["contextKey"]?.takeIf { it.matches(Regex("[0-9A-Fa-f]{64}")) }
      ?.lowercase(Locale.ROOT) ?: return rejectRemotePayload("context_key_invalid")
    val paradaId = data["paradaId"]?.let(::canonicalGuid) ?: return rejectRemotePayload("stop_id_invalid")
    val validUntil = data["validUntil"]?.let(::parseValidUntil) ?: return rejectRemotePayload("valid_until_invalid")
    if (validUntil <= System.currentTimeMillis()) return rejectRemotePayload("valid_until_expired")
    val stopName = data["paradaNome"]?.trim()?.takeIf(String::isNotEmpty)?.take(60)
      ?: return rejectRemotePayload("stop_name_invalid")
    val additionalVehicles = data["additionalVehicles"]?.toIntOrNull()?.takeIf { it in 0..999 }
      ?: return rejectRemotePayload("additional_vehicles_invalid")
    val additionalLines = data["additionalLines"]?.toIntOrNull()?.takeIf { it in 0..999 }
      ?: return rejectRemotePayload("additional_lines_invalid")
    val itemsJson = data["items"]?.takeIf { it.length <= 8192 }
      ?: return rejectRemotePayload("items_missing_or_oversized")
    val array = JSONArray(itemsJson)
    if (array.length() > 3) return rejectRemotePayload("too_many_items")
    val eventIds = mutableSetOf<String>()
    val items = mutableListOf<RadarRemoteItem>()
    for (index in 0 until array.length()) {
      val item = array.optJSONObject(index) ?: return rejectRemotePayload("item_not_object")
      val eventId = (item.opt("eventId") as? String)?.takeIf { it.isNotBlank() && it.length <= 128 }
        ?: return rejectRemotePayload("event_id_invalid")
      if (!eventIds.add(eventId)) return rejectRemotePayload("duplicate_event_id")
      val vehicleId = (item.opt("vehicleId") as? String)?.trim()?.takeIf { it.isNotEmpty() && it.length <= 128 }
      val modal = safeOptionalText(item, "modal", 16)
      val routeType = safeOptionalText(item, "tipoRota", 16)
      val isRail = modal?.equals("trem", ignoreCase = true) == true
        || routeType?.equals("trem", ignoreCase = true) == true
      val maxLineCodeLength = if (isRail) 80 else 12
      val code = (item.opt("codigoLinha") as? String)?.trim()
        ?.takeIf { it.isNotEmpty() && it.length <= maxLineCodeLength }
        ?: return rejectRemotePayload(if (isRail) "rail_line_code_invalid" else "line_code_invalid")
      val departure = when (item.opt("type") as? String) {
        "ARRIVAL" -> false
        "DEPARTURE" -> true
        else -> return rejectRemotePayload("item_type_invalid")
      }
      val etaValue = item.opt("etaSeconds") as? Number ?: return rejectRemotePayload("eta_seconds_invalid")
      val etaSeconds = etaValue.toLong()
      if (!etaValue.toDouble().isFinite() || etaValue.toDouble() != etaSeconds.toDouble() || etaSeconds < 0) {
        return rejectRemotePayload("eta_seconds_invalid")
      }
      val predictedAt = (item.opt("predictedAt") as? String)?.let(::parseValidUntil)
      val priority = item.opt("priority") as? Boolean ?: return rejectRemotePayload("item_priority_invalid")
      val status = (item.opt("operationalStatus") as? String)?.takeIf { it in RAIL_STATES }
      items += RadarRemoteItem(eventId, vehicleId, code, departure, etaSeconds, predictedAt, priority,
        modal, routeType, status, safeOptionalText(item, "trainCode", 40),
        optionalGuid(item, "railVehicleId"), optionalGuid(item, "expectedRunId"),
        optionalGuid(item, "scheduledStopId"), safeOptionalText(item, "destinationName", 80),
        safeOptionalText(item, "lineName", 80))
    }

    val groups = items.sortedWith(compareBy<RadarRemoteItem> { it.etaSeconds }
      .thenByDescending { it.priority }.thenBy { it.eventId })
      .groupBy { if (it.isRail) "rail:${it.eventId}" else "road:${it.code}:${it.departure}" }.values.toList()
    val visibleGroups = groups.take(MAX_LINES)
    val now = System.currentTimeMillis()
    // O payload não traz o instante da observação ferroviária. O carimbo de envio do FCM é o
    // proxy mais próximo (o push nasce junto da coleta) e não infla com atraso de entrega.
    // Sem ele, o recebimento local é o fallback — que pode superestimar o frescor.
    // shortcut: sentTime como proxy de observação; trocar quando o payload trouxer observedAt/consultadoEm.
    val observedAt = sentTime.takeIf { it > 0 && it <= now + 60_000 } ?: now
    val lines = visibleGroups.map { group ->
      val first = group.first()
      val shown = group.take(3)
      // Horário absoluto derivado do envio; não depende de quando o FCM chegou ao aparelho.
      val sentPredictedAt = observedAt + first.etaSeconds * 1000
      val predicted = first.predictedAt
      val deadline = when {
        predicted == null -> sentPredictedAt
        // Já vencido: preserva o absoluto antigo para não ressuscitar um ETA futuro.
        predicted < now - LOCAL_STALE_AFTER_MS -> predicted
        predicted <= sentPredictedAt + LOCAL_PREDICTED_SLACK_MS -> predicted
        else -> sentPredictedAt // incoerente com o ETA do envio: conserva o ETA, não o desloca
      }
      val dataUntil = when {
        !first.isRail -> null
        first.operationalStatus == "Scheduled" -> Long.MAX_VALUE
        first.operationalStatus == "Live" -> observedAt + LOCAL_LIVE_FRESH_MS
        else -> observedAt + LOCAL_ESTIMATE_FRESH_MS // Estimated ou estado desconhecido
      }
      val railExpired = first.isRail &&
        ((dataUntil != null && now > dataUntil) || now > deadline + LOCAL_STALE_AFTER_MS)
      val railEta = if (railExpired) "desatualizado"
        else etaText(((deadline - now) / 1000).coerceAtLeast(0))
      RadarLinePresentation(
        if (first.isRail) railDestination(first) else first.code,
        group.any { it.priority },
        first.departure,
        if (first.isRail) railEta else (if (first.departure) "Saída em " else "") + etaText(first.etaSeconds),
        if (first.isRail) emptyList() else shown.drop(1).map { etaText(it.etaSeconds) },
        if (first.isRail) railDetail(first) else null,
        first.isRail && !first.departure && first.railStatus != "Scheduled" && !railExpired && deadline - now < 60_000,
        deadline.takeIf { first.isRail },
        dataUntil,
      )
    }
    val hiddenGroups = groups.drop(MAX_LINES)
    val hiddenRoadLines = hiddenGroups.count { !it.first().isRail }
    val hiddenRailItems = hiddenGroups.filter { it.first().isRail }.sumOf { it.size }
    val hiddenGroupedPredictions = visibleGroups.sumOf { (it.size - 3).coerceAtLeast(0) }
    val presentation = RadarPresentation(stopName, lines,
      (additionalLines + hiddenRoadLines).coerceAtMost(999),
      (additionalVehicles + hiddenRailItems + hiddenGroupedPredictions).coerceAtMost(999))
    return RadarRemotePayload(sessionId, revision, predictionVersion, contextKey, paradaId, validUntil, items, presentation)
  }

  private fun rejectRemotePayload(reason: String): RadarRemotePayload? {
    logRemoteDiscard(reason)
    return null
  }

  private fun safeOptionalText(item: JSONObject, key: String, maxLength: Int): String? =
    (item.opt(key) as? String)?.filterNot { it.isISOControl() }?.trim()?.take(maxLength)
      ?.takeIf(String::isNotEmpty)

  private fun optionalGuid(item: JSONObject, key: String): String? =
    (item.opt(key) as? String)?.let(::canonicalGuid)

  private fun logRemoteDiscard(reason: String) {
    Log.w(LOG_TAG, "remote_discard reason=$reason")
  }

  private fun canonicalGuid(value: String): String? {
    val canonical = runCatching { UUID.fromString(value).toString() }.getOrNull() ?: return null
    return canonical.takeIf { it.equals(value, ignoreCase = true) }
  }

  private fun parseValidUntil(value: String): Long? {
    val match = Regex("""^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})$""")
      .matchEntire(value) ?: return null
    val millis = match.groupValues[2].take(3).padEnd(3, '0')
    val normalized = match.groupValues[1] + "." + millis + match.groupValues[3]
    val parser = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSXXX", Locale.US).apply {
      isLenient = false
      timeZone = TimeZone.getTimeZone("UTC")
    }
    val position = ParsePosition(0)
    return parser.parse(normalized, position)?.time?.takeIf { position.index == normalized.length }
  }

  private fun railDestination(item: RadarRemoteItem) = item.destinationName?.take(32) ?: "Destino não informado"

  private fun railDetail(item: RadarRemoteItem): String = listOfNotNull(
    when (item.railStatus) {
      "Live" -> "Ao vivo"
      "Estimated" -> "Estimado"
      else -> "Programado"
    },
    if (item.departure) "partida" else "chegada",
    item.predictedAt?.let { SimpleDateFormat("HH:mm", Locale("pt", "BR")).format(java.util.Date(it)) },
    item.lineName,
  ).joinToString(" · ").take(120)

  private fun requireNotificationsEnabled(context: Context) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
      context.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
      throw SecurityException("Permissão POST_NOTIFICATIONS não concedida")
    }
    if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) {
      throw SecurityException("Notificações desativadas para este aplicativo")
    }
  }

  private fun ensureChannel(context: Context, channelId: String, headsUp: Boolean) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      val importance = if (headsUp) NotificationManager.IMPORTANCE_HIGH else NotificationManager.IMPORTANCE_DEFAULT
      manager.createNotificationChannel(NotificationChannel(channelId,
        if (headsUp) "Protótipo · heads-up" else "Protótipo · normal", importance))
    }
  }

  private fun buildNotification(context: Context, data: RadarPresentation, channelId: String,
    headsUp: Boolean, sessionId: String, onlyAlertOnce: Boolean = true,
    nativeHeadsUp: Boolean = false, showVoiceAction: Boolean = false): Notification {
    val builder = NotificationCompat.Builder(context, channelId)
      .setSmallIcon(R.drawable.ic_stat_noponto)
      .setColor(Color.rgb(255, 193, 7))
      .setContentTitle(if (headsUp) "838 chegando em 1 min" else title(data))
      .setContentText(if (headsUp) "Radar · Fragoso · TESTE" else summary(data))
      .setCategory(NotificationCompat.CATEGORY_STATUS)
      .setPriority(if (headsUp || nativeHeadsUp) NotificationCompat.PRIORITY_HIGH else NotificationCompat.PRIORITY_DEFAULT)
      .setAutoCancel(false)
      .setOngoing(true)
      .setOnlyAlertOnce(onlyAlertOnce)

    if (headsUp) {
      builder.addAction(0, "Parar radar", stopPendingIntent(context, sessionId))
    } else {
      builder.setStyle(NotificationCompat.DecoratedCustomViewStyle())
        .setCustomContentView(collapsedView(context, data))
        .setCustomBigContentView(expandedView(context, data, sessionId, showVoiceAction))
      if (nativeHeadsUp) builder.setCustomHeadsUpContentView(headsUpView(context, data))
    }
    return builder.build()
  }

  private fun parsePresentation(json: String): RadarPresentation {
    require(json.length <= 8192) { "Payload de notificação muito grande" }
    val root = JSONObject(json)
    val array = root.optJSONArray("linhas") ?: JSONArray()
    val lines = (0 until minOf(array.length(), MAX_LINES)).mapNotNull { index ->
      val line = array.optJSONObject(index) ?: return@mapNotNull null
      val code = line.optString("codigo").trim().take(12)
      val eta = line.optString("principal").trim().take(24)
      if (code.isEmpty() || eta.isEmpty()) return@mapNotNull null
      val next = line.optJSONArray("proximas") ?: JSONArray()
      RadarLinePresentation(code, line.optBoolean("prioritaria"), line.optString("eventType") == "DEPARTURE", eta,
        (0 until minOf(next.length(), 2)).mapNotNull { next.optString(it).trim().take(24).takeIf(String::isNotEmpty) })
    }
    return RadarPresentation(root.optString("paradaNome", "Parada").trim().take(60).ifEmpty { "Parada" },
      lines, root.optInt("maisLinhas").coerceIn(0, 999), root.optInt("maisPrevisoes").coerceIn(0, 999))
  }

  private fun testPresentation(scenario: String) = if (scenario == "empty") {
    RadarPresentation("Fragoso · TESTE", emptyList(), 0, 0)
  } else {
    RadarPresentation("Fragoso · TESTE", listOf(
      RadarLinePresentation("838", true, false, "1 min", listOf("2 min", "8 min")),
      RadarLinePresentation("855", false, false, "7 min", emptyList())), 0, 0)
  }

  private fun title(data: RadarPresentation) = "Radar · ${data.stopName}"

  private fun summary(data: RadarPresentation) = data.lines.firstOrNull()?.let { "${it.code} · ${it.eta}" }
    ?: "Sem previsões válidas"

  private fun moreText(data: RadarPresentation): String? {
    val parts = mutableListOf<String>()
    if (data.moreLines > 0) parts += "+${data.moreLines} linhas"
    if (data.morePredictions > 0) parts += "+${data.morePredictions} outras previsões"
    return parts.takeIf { it.isNotEmpty() }?.joinToString(" · ")
  }

  private fun stopPendingIntent(context: Context, sessionId: String): PendingIntent {
    val intent = Intent(context, RadarStopReceiver::class.java)
      .setAction(RadarStopReceiver.ACTION_STOP)
      .setData(Uri.parse("noponto://radar/stop/${Uri.encode(sessionId)}"))
      .putExtra(RadarStopReceiver.EXTRA_SESSION_ID, sessionId)
    return PendingIntent.getBroadcast(context, REQUEST_CODE_STOP, intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }

  private fun setBadge(view: RemoteViews, priorityId: Int, normalId: Int, line: RadarLinePresentation) {
    val priorityView = if (line.priority) View.VISIBLE else View.GONE
    view.setTextViewText(priorityId, line.code)
    view.setTextViewText(normalId, line.code)
    view.setViewVisibility(priorityId, priorityView)
    view.setViewVisibility(normalId, if (line.priority) View.GONE else View.VISIBLE)
  }

  private fun collapsedView(context: Context, data: RadarPresentation) =
    RemoteViews(context.packageName, R.layout.radar_notification_collapsed).apply {
      setTextViewText(R.id.collapsed_title, title(data))
      val first = data.lines.getOrNull(0)
      val second = data.lines.getOrNull(1)
      setViewVisibility(R.id.collapsed_lines, if (first == null) View.GONE else View.VISIBLE)
      setViewVisibility(R.id.collapsed_empty, if (first == null) View.VISIBLE else View.GONE)
      setViewVisibility(R.id.collapsed_line_one, if (first == null) View.GONE else View.VISIBLE)
      setViewVisibility(R.id.collapsed_line_two, if (second == null) View.GONE else View.VISIBLE)
      setViewVisibility(R.id.collapsed_separator, if (second == null) View.GONE else View.VISIBLE)
      first?.let {
        setBadge(this, R.id.collapsed_badge_one_priority, R.id.collapsed_badge_one_normal, it)
        setTextViewText(R.id.collapsed_eta_one, it.eta)
      }
      second?.let {
        setBadge(this, R.id.collapsed_badge_two_priority, R.id.collapsed_badge_two_normal, it)
        setTextViewText(R.id.collapsed_eta_two, it.eta)
      }
      val contextText = data.lines.mapNotNull { it.detail }.distinct().take(2).joinToString(" · ").take(120)
      setTextViewText(R.id.collapsed_context, contextText)
      setViewVisibility(R.id.collapsed_context, if (contextText.isEmpty()) View.GONE else View.VISIBLE)
      setTextViewText(R.id.collapsed_empty, "Sem previsões válidas no momento")
    }

  private fun headsUpView(context: Context, data: RadarPresentation) =
    RemoteViews(context.packageName, R.layout.radar_notification_heads_up).apply {
      val first = data.lines.firstOrNull()
      setViewVisibility(R.id.heads_up_lines, if (first == null) View.GONE else View.VISIBLE)
      setViewVisibility(R.id.heads_up_empty, if (first == null) View.VISIBLE else View.GONE)
      setTextViewText(R.id.heads_up_stop_name, "Radar · ${data.stopName}")
      first?.let {
        setTextViewText(R.id.heads_up_badge, it.code)
        setInt(R.id.heads_up_badge, "setBackgroundResource",
          if (it.priority) R.drawable.radar_route_badge else R.drawable.radar_route_badge_normal)
        setTextViewText(R.id.heads_up_eta, it.eta)
        val detail = it.detail ?: nextText(it)
        setTextViewText(R.id.heads_up_next, detail)
        setViewVisibility(R.id.heads_up_next, if (detail.isEmpty()) View.GONE else View.VISIBLE)
      }
    }

  private fun expandedView(context: Context, data: RadarPresentation, sessionId: String,
    showVoiceAction: Boolean): RemoteViews =
    RemoteViews(context.packageName, R.layout.radar_notification_expanded).apply {
      setTextViewText(R.id.expanded_title, title(data))
      val first = data.lines.getOrNull(0)
      val second = data.lines.getOrNull(1)
      setViewVisibility(R.id.route_one, if (first == null) View.GONE else View.VISIBLE)
      setViewVisibility(R.id.route_separator, if (first == null || second == null) View.GONE else View.VISIBLE)
      setViewVisibility(R.id.route_two, if (second == null) View.GONE else View.VISIBLE)
      setViewVisibility(R.id.empty_state, if (first == null) View.VISIBLE else View.GONE)
      first?.let {
        setBadge(this, R.id.route_one_badge_priority, R.id.route_one_badge_normal, it)
        setTextViewText(R.id.route_one_eta, it.eta)
        val detail = it.detail ?: nextText(it)
        setTextViewText(R.id.route_one_next, detail)
        setViewVisibility(R.id.route_one_next, if (detail.isEmpty()) View.GONE else View.VISIBLE)
      }
      second?.let {
        setBadge(this, R.id.route_two_badge_priority, R.id.route_two_badge_normal, it)
        setTextViewText(R.id.route_two_eta, it.eta)
        val detail = it.detail ?: nextText(it)
        setTextViewText(R.id.route_two_next, detail)
        setViewVisibility(R.id.route_two_next, if (detail.isEmpty()) View.GONE else View.VISIBLE)
      }
      setTextViewText(R.id.expanded_more, moreText(data) ?: "")
      setViewVisibility(R.id.expanded_more, if (moreText(data) == null) View.GONE else View.VISIBLE)
      setTextViewText(R.id.empty_state, "Sem previsões válidas no momento")
      setOnClickPendingIntent(R.id.stop_action, stopPendingIntent(context, sessionId))
      setViewVisibility(R.id.voice_action, if (showVoiceAction) View.VISIBLE else View.GONE)
      if (showVoiceAction) {
        val muted = RadarVoicePreferencesStore.isMuted(context)
        val actionLabel = if (muted) "Ativar voz" else "Silenciar voz"
        setTextViewText(R.id.voice_action_label, actionLabel)
        setImageViewResource(R.id.voice_action_icon, if (muted) R.drawable.radar_voice_on else R.drawable.radar_voice_mute)
        setContentDescription(R.id.voice_action, actionLabel)
        setOnClickPendingIntent(R.id.voice_action, voicePendingIntent(context, sessionId, muted))
      }
    }

  private fun nextText(line: RadarLinePresentation) = if (line.next.isEmpty()) "" else "${if (line.departure) "Próximas saídas" else "Próximos"}: ${line.next.mapIndexed { i, eta ->
    if (i < line.next.lastIndex) eta.removeSuffix(" min") else eta
  }.joinToString(" e ")}"

  companion object {
    private const val LOG_TAG = "RadarNativeProbe"
    private const val REQUEST_CODE_STOP = 748205
    private const val REQUEST_CODE_VOICE = 748206
    private const val MAX_LINES = 2
    private val RAIL_STATES = setOf("Scheduled", "Estimated", "Live")
    private const val CHANNEL_NORMAL = "radar-native-probe-normal-v1"
    private const val CHANNEL_HEADS_UP = "radar-native-probe-heads-up-v1"
    private const val LOCAL_REFRESH_INTERVAL_MS = 30_000L
    private const val LOCAL_STALE_AFTER_MS = 90_000L
    // predictedAt é comparado com o ETA calculado no envio (sentTime), não com o recebimento.
    private const val LOCAL_PREDICTED_SLACK_MS = 120_000L
    // Live envelhece mais rápido; Estimated usa o mesmo teto de evidência do seletor do backend (300 s).
    private const val LOCAL_LIVE_FRESH_MS = 120_000L
    private const val LOCAL_ESTIMATE_FRESH_MS = 300_000L
    private val LOCAL_COLLAPSED_ETA = intArrayOf(R.id.collapsed_eta_one, R.id.collapsed_eta_two)
    private val LOCAL_EXPANDED_ETA = intArrayOf(R.id.route_one_eta, R.id.route_two_eta)

    private data class LocalLine(val index: Int, val deadline: Long, val dataUntil: Long)

    private val localHandler = Handler(Looper.getMainLooper())
    private val localTick = Runnable { refreshLocal() }
    private var localContext: Context? = null
    private var localSessionId: String? = null
    private var localLines: List<LocalLine> = emptyList()
    private var localText: Array<String?> = arrayOfNulls(MAX_LINES)

    private fun etaText(seconds: Long): String = if (seconds < 60) "Chegando"
      else "${seconds / 60 + if (seconds % 60 == 0L) 0 else 1} min"

    // Atualização visual local: recalcula o minuto a partir do instante absoluto previsto.
    // Só re-renderiza o RemoteViews já publicado; não altera canal, voz, som ou estado da sessão.
    private fun scheduleLocalRefresh(context: Context, payload: RadarRemotePayload) {
      val app = context.applicationContext
      localHandler.post {
        val now = System.currentTimeMillis()
        val lines = payload.presentation.lines.take(MAX_LINES).mapIndexedNotNull { index, line ->
          val deadline = line.deadline ?: return@mapIndexedNotNull null
          val dataUntil = line.dataUntil ?: return@mapIndexedNotNull null
          deadline.takeIf { it > now }?.let { LocalLine(index, it, dataUntil) }
        }
        localHandler.removeCallbacks(localTick)
        localContext = app
        localSessionId = payload.sessionId
        localLines = lines
        localText = arrayOfNulls(MAX_LINES)
        if (lines.isNotEmpty()) localHandler.postDelayed(localTick, LOCAL_REFRESH_INTERVAL_MS)
      }
    }

    private fun refreshLocal() {
      val context = localContext ?: return
      val sessionId = localSessionId ?: return
      if (!RadarNotificationSession.isActive(context, sessionId) || Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
        clearLocalRefresh()
        return
      }
      val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      val notification = manager.activeNotifications
        .firstOrNull { it.id == RadarNotificationSession.NOTIFICATION_ID }?.notification
      val content = notification?.contentView
      val big = notification?.bigContentView
      if (notification == null || big == null) {
        clearLocalRefresh()
        return
      }
      val now = System.currentTimeMillis()
      var changed = false
      var live = 0
      for (line in localLines) {
        val expired = now > line.dataUntil || now > line.deadline + LOCAL_STALE_AFTER_MS
        val text = if (expired) "desatualizado"
          else etaText(((line.deadline - now) / 1000).coerceAtLeast(0))
        if (!expired) live++
        if (text == localText.getOrNull(line.index)) continue
        localText[line.index] = text
        content?.setTextViewText(LOCAL_COLLAPSED_ETA[line.index], text)
        big.setTextViewText(LOCAL_EXPANDED_ETA[line.index], text)
        changed = true
      }
      localHandler.removeCallbacks(localTick)
      if (changed) {
        try {
          NotificationManagerCompat.from(context).notify(RadarNotificationSession.NOTIFICATION_ID, notification)
        } catch (error: Exception) {
          Log.e(LOG_TAG, "local_refresh_failed type=${error.javaClass.simpleName}")
        }
      }
      if (live > 0) localHandler.postDelayed(localTick, LOCAL_REFRESH_INTERVAL_MS) else clearLocalRefresh()
    }

    private fun clearLocalRefresh() {
      localHandler.removeCallbacks(localTick)
      localContext = null
      localSessionId = null
      localLines = emptyList()
      localText = arrayOfNulls(MAX_LINES)
    }

    private fun voicePendingIntent(context: Context, sessionId: String, muted: Boolean): PendingIntent {
      val action = if (muted) RadarStopReceiver.ACTION_UNMUTE_VOICE else RadarStopReceiver.ACTION_MUTE_VOICE
      val mode = if (muted) "unmute" else "mute"
      val intent = Intent(context, RadarStopReceiver::class.java)
        .setAction(action)
        .setData(Uri.parse("noponto://radar/voice/$mode/${Uri.encode(sessionId)}"))
        .putExtra(RadarStopReceiver.EXTRA_SESSION_ID, sessionId)
      return PendingIntent.getBroadcast(context, REQUEST_CODE_VOICE, intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    internal fun refreshVoiceAction(context: Context, sessionId: String, muted: Boolean) {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M || !RadarNotificationSession.isActive(context, sessionId)) return
      val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      val notification = manager.activeNotifications.firstOrNull { it.id == RadarNotificationSession.NOTIFICATION_ID }?.notification
        ?: return
      val expanded = notification.bigContentView ?: return
      val actionLabel = if (muted) "Ativar voz" else "Silenciar voz"
      expanded.setTextViewText(R.id.voice_action_label, actionLabel)
      expanded.setImageViewResource(R.id.voice_action_icon, if (muted) R.drawable.radar_voice_on else R.drawable.radar_voice_mute)
      expanded.setContentDescription(R.id.voice_action, actionLabel)
      expanded.setOnClickPendingIntent(R.id.voice_action, voicePendingIntent(context, sessionId, muted))
      NotificationManagerCompat.from(context).notify(RadarNotificationSession.NOTIFICATION_ID, notification)
    }
  }
}
