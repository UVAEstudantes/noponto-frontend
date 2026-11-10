package expo.modules.radarnativenotification

import android.util.Log
import com.google.firebase.messaging.RemoteMessage
import expo.modules.notifications.service.ExpoFirebaseMessagingService
import org.json.JSONArray
import org.json.JSONObject

class RadarFirebaseMessagingService : ExpoFirebaseMessagingService() {
  override fun onMessageReceived(remoteMessage: RemoteMessage) {
    val directData = remoteMessage.data
    val bodyData = if (directData[MODE_KEY] == null) parseExpoBody(directData[BODY_KEY]) else null
    val data = bodyData ?: directData
    val modeSource = when {
      directData[MODE_KEY] != null -> "direct"
      bodyData != null && bodyData[MODE_KEY] != null -> "body"
      else -> "missing"
    }
    val receivedKeys = (directData.keys + bodyData.orEmpty().keys).distinct().sorted().joinToString(",")
    Log.i(TAG, "fcm_entry keys=$receivedKeys mode_source=$modeSource")
    val mode = data[MODE_KEY]
    if (mode != MODE_NATIVE_RADAR) {
      Log.i(TAG, "fcm_delegate=expo mode_source=$modeSource")
      super.onMessageReceived(remoteMessage)
      return
    }

    try {
      val priority = if (remoteMessage.priority == RemoteMessage.PRIORITY_HIGH) "high" else "normal"
      Log.i(TAG, "native_dispatch=start fcm_priority=$priority ttl_s=${remoteMessage.ttl}")
      RadarNativeNotificationModule().receiveRemote(
        this, data, remoteMessage.priority, remoteMessage.sentTime, remoteMessage.ttl,
      )
      Log.i(TAG, "native_dispatch=returned")
    } catch (error: Exception) {
      Log.e(TAG, "native_dispatch_exception type=${error.javaClass.simpleName}")
    }
  }

  private fun parseExpoBody(body: String?): Map<String, String>? {
    if (body == null) return null
    return try {
      val json = JSONObject(body)
      buildMap {
        val keys = json.keys()
        while (keys.hasNext()) {
          val key = keys.next()
          val value = json.get(key)
          put(key, when (value) {
            JSONObject.NULL -> "null"
            is JSONObject, is JSONArray -> value.toString()
            else -> value.toString()
          })
        }
      }
    } catch (_: Exception) {
      null
    }
  }

  companion object {
    private const val TAG = "RadarNativeProbe"
    private const val MODE_KEY = "mode"
    private const val BODY_KEY = "body"
    private const val MODE_NATIVE_RADAR = "remote-radar-native-v1"
  }
}
