package expo.modules.radarnativenotification

import android.app.Notification
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.core.app.NotificationManagerCompat
import java.util.UUID

internal object RadarNotificationSession {
  private const val PREFERENCES = "radar_native_notification_session"
  private const val KEY_ACTIVE = "active"
  private const val KEY_SESSION_ID = "session_id"
  private const val KEY_REVISION = "revision"
  private const val KEY_INVALIDATED_SESSIONS = "invalidated_sessions"
  private const val KEY_REMOTE_REVISION = "remote_revision"
  private const val KEY_PREDICTION_VERSION = "prediction_version"
  private const val KEY_CONTEXT_KEY = "context_key"
  private const val KEY_PARADA_ID = "parada_id"
  const val NOTIFICATION_ID = 748200
  private const val LOG_TAG = "RadarNativeProbe"

  private val lock = Any()

  private fun isRemoteSession(sessionId: String) = runCatching {
    UUID.fromString(sessionId).toString().equals(sessionId, ignoreCase = true)
  }.getOrDefault(false)

  fun isActive(context: Context, sessionId: String) = synchronized(lock) {
    val preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
    preferences.getBoolean(KEY_ACTIVE, false) && preferences.getString(KEY_SESSION_ID, null) == sessionId
  }

  fun start(context: Context, sessionId: String, notification: Notification) = synchronized(lock) {
    require(sessionId.isNotBlank()) { "Identificador de sessão ausente" }
    val preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
    val previousSession = preferences.getString(KEY_SESSION_ID, null)
    val invalidated = preferences.getStringSet(KEY_INVALIDATED_SESSIONS, emptySet()).orEmpty().toMutableSet()
    previousSession?.takeIf { it != sessionId && isRemoteSession(it) }?.let(invalidated::add)
    if (previousSession != null && previousSession != sessionId) RadarVoicePlaybackService.stopForSession(context, previousSession)
    RadarVoicePlaybackService.clearSessionState(context, sessionId)
    invalidated.remove(sessionId)
    preferences
      .edit()
      .putBoolean(KEY_ACTIVE, true)
      .putString(KEY_SESSION_ID, sessionId)
      .putInt(KEY_REVISION, 0)
      .putStringSet(KEY_INVALIDATED_SESSIONS, invalidated)
      .remove(KEY_REMOTE_REVISION)
      .remove(KEY_PREDICTION_VERSION)
      .remove(KEY_CONTEXT_KEY)
      .remove(KEY_PARADA_ID)
      .apply()
    val manager = NotificationManagerCompat.from(context)
    listOf(748201, 748202, 748203, 748204).forEach { manager.cancel(it) }
    manager.notify(NOTIFICATION_ID, notification)
  }

  fun update(context: Context, sessionId: String, revision: Int, notification: Notification) = synchronized(lock) {
    val preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
    if (!preferences.getBoolean(KEY_ACTIVE, false) || preferences.getString(KEY_SESSION_ID, null) != sessionId) return@synchronized false
    if (revision <= preferences.getInt(KEY_REVISION, 0)) return@synchronized true
    preferences.edit().putInt(KEY_REVISION, revision).apply()
    val manager = NotificationManagerCompat.from(context)
    manager.notify(NOTIFICATION_ID, notification)
    true
  }

  fun updateRemote(context: Context, sessionId: String, revision: Long, predictionVersion: Long,
    contextKey: String, paradaId: String, notification: Notification) = synchronized(lock) {
    val preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
    val invalidated = preferences.getStringSet(KEY_INVALIDATED_SESSIONS, emptySet()).orEmpty().toMutableSet()
    if (sessionId in invalidated) {
      Log.w(LOG_TAG, "remote_discard reason=session_invalidated")
      return@synchronized false
    }

    val previousSession = preferences.getString(KEY_SESSION_ID, null)
    if (previousSession == sessionId && preferences.contains(KEY_REMOTE_REVISION)) {
      val previousRevision = preferences.getLong(KEY_REMOTE_REVISION, 0)
      if (revision < previousRevision) {
        Log.w(LOG_TAG, "remote_discard reason=revision_regression")
        return@synchronized false
      }
      if (preferences.getString(KEY_CONTEXT_KEY, null) != contextKey && revision == previousRevision) {
        Log.w(LOG_TAG, "remote_discard reason=context_key_mismatch")
        return@synchronized false
      }
      if (preferences.getString(KEY_PARADA_ID, null) != paradaId) {
        Log.w(LOG_TAG, "remote_discard reason=stop_id_mismatch")
        return@synchronized false
      }
      val previousPredictionVersion = preferences.getLong(KEY_PREDICTION_VERSION, 0)
      if (predictionVersion < previousPredictionVersion) {
        Log.w(LOG_TAG, "remote_discard reason=prediction_version_regression")
        return@synchronized false
      }
      if (revision == previousRevision && predictionVersion == previousPredictionVersion) {
        Log.w(LOG_TAG, "remote_discard reason=duplicate")
        return@synchronized false
      }
    } else if (previousSession != null && previousSession != sessionId && isRemoteSession(previousSession)) {
      invalidated.add(previousSession)
    }

    try {
      NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, notification)
    } catch (error: Exception) {
      Log.e(LOG_TAG, "notify_exception type=${error.javaClass.simpleName}")
      return@synchronized false
    }
    Log.i(LOG_TAG, "notify_success id=$NOTIFICATION_ID")

    val committed = preferences.edit()
      .putBoolean(KEY_ACTIVE, true)
      .putString(KEY_SESSION_ID, sessionId)
      .remove(KEY_REVISION)
      .putLong(KEY_REMOTE_REVISION, revision)
      .putLong(KEY_PREDICTION_VERSION, predictionVersion)
      .putString(KEY_CONTEXT_KEY, contextKey)
      .putString(KEY_PARADA_ID, paradaId)
      .putStringSet(KEY_INVALIDATED_SESSIONS, invalidated)
      .commit()
    if (!committed) {
      Log.w(LOG_TAG, "remote_discard reason=session_state_commit_failed")
      return@synchronized false
    }
    if (previousSession != sessionId) {
      previousSession?.let { RadarVoicePlaybackService.stopForSession(context, it) }
      RadarVoicePlaybackService.clearSessionState(context, sessionId)
    }
    true
  }

  fun stop(context: Context, sessionId: String? = null) = synchronized(lock) {
    val preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
    if (sessionId != null && (!preferences.getBoolean(KEY_ACTIVE, false)
        || preferences.getString(KEY_SESSION_ID, null) != sessionId)) return@synchronized false
    val stoppedSession = preferences.getString(KEY_SESSION_ID, null) ?: sessionId
    val invalidated = preferences.getStringSet(KEY_INVALIDATED_SESSIONS, emptySet()).orEmpty().toMutableSet()
    preferences.getString(KEY_SESSION_ID, null)?.takeIf(::isRemoteSession)?.let(invalidated::add)
    sessionId?.takeIf(::isRemoteSession)?.let(invalidated::add)
    val committed = preferences
      .edit()
      .putBoolean(KEY_ACTIVE, false)
      .putStringSet(KEY_INVALIDATED_SESSIONS, invalidated)
      .remove(KEY_SESSION_ID)
      .remove(KEY_REVISION)
      .remove(KEY_REMOTE_REVISION)
      .remove(KEY_PREDICTION_VERSION)
      .remove(KEY_CONTEXT_KEY)
      .remove(KEY_PARADA_ID)
      .commit()
    if (!committed) return@synchronized false
    RadarVoicePlaybackService.stopForSession(context, stoppedSession)
    val manager = NotificationManagerCompat.from(context)
    listOf(NOTIFICATION_ID, 748201, 748202, 748203, 748204).forEach { manager.cancel(it) }
    true
  }
}

class RadarStopReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    val action = intent?.action ?: return
    if (action != ACTION_STOP && action != ACTION_MUTE_VOICE && action != ACTION_UNMUTE_VOICE) return
    val sessionId = intent.getStringExtra(EXTRA_SESSION_ID)
      ?.takeIf { it.isNotBlank() && it.length <= 128 } ?: return
    if (action == ACTION_STOP) {
      RadarNotificationSession.stop(context, sessionId)
      return
    }
    if (!RadarNotificationSession.isActive(context, sessionId)) return
    val muted = action == ACTION_MUTE_VOICE
    if (RadarVoicePreferencesStore.setMuted(context, muted)) {
      RadarVoicePlaybackService.preferencesChanged(context, RadarVoicePreferencesStore.load(context))
      RadarNativeNotificationModule.refreshVoiceAction(context, sessionId, muted)
      Log.i(TAG, "voice_muted=$muted")
    } else Log.e(TAG, "voice_mute_save_failed")
  }

  companion object {
    private const val TAG = "RadarNativeProbe"
    const val ACTION_STOP = "expo.modules.radarnativenotification.STOP_RADAR"
    const val ACTION_MUTE_VOICE = "expo.modules.radarnativenotification.MUTE_VOICE"
    const val ACTION_UNMUTE_VOICE = "expo.modules.radarnativenotification.UNMUTE_VOICE"
    const val EXTRA_SESSION_ID = "session_id"
  }
}
