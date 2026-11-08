package expo.modules.radarnativenotification

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.graphics.Color
import android.os.Build
import android.view.View
import android.widget.RemoteViews
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class RadarNativeNotificationModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("RadarNativeNotification")

    AsyncFunction("showTestNotification") { scenario: String, headsUp: Boolean ->
      require(scenario == "multiple-lines" || scenario == "empty") { "Cenário inválido" }
      val context = appContext.reactContext ?: error("Contexto Android indisponível")
      val channelId = if (headsUp) CHANNEL_HEADS_UP else CHANNEL_NORMAL
      ensureChannel(context, channelId, headsUp)
      val notification = buildNotification(context, scenario, channelId, headsUp)
      NotificationManagerCompat.from(context).notify(
        notificationId(scenario, headsUp),
        notification
      )
    }

    AsyncFunction("clearTestNotifications") {
      val context = appContext.reactContext ?: error("Contexto Android indisponível")
      val manager = NotificationManagerCompat.from(context)
      listOf(ID_LINES_NORMAL, ID_LINES_HEADS_UP, ID_EMPTY_NORMAL, ID_EMPTY_HEADS_UP)
        .forEach { manager.cancel(it) }
    }
  }

  private fun ensureChannel(context: Context, channelId: String, headsUp: Boolean) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      val importance = if (headsUp) NotificationManager.IMPORTANCE_HIGH else NotificationManager.IMPORTANCE_DEFAULT
      manager.createNotificationChannel(NotificationChannel(channelId, if (headsUp) "Protótipo · heads-up" else "Protótipo · normal", importance))
    }
  }

  private fun buildNotification(context: Context, scenario: String, channelId: String, headsUp: Boolean) =
    NotificationCompat.Builder(context, channelId)
      .setSmallIcon(R.drawable.ic_stat_noponto)
      .setColor(Color.rgb(255, 193, 7))
      .setContentTitle("Radar · Fragoso · TESTE")
      .setContentText(if (scenario == "empty") "Sem previsões no momento" else "838 em 1 min · 855 em 7 min")
      .setCategory(NotificationCompat.CATEGORY_STATUS)
      .setPriority(if (headsUp) NotificationCompat.PRIORITY_HIGH else NotificationCompat.PRIORITY_DEFAULT)
      .setAutoCancel(false)
      .setOnlyAlertOnce(false)
      .setStyle(NotificationCompat.DecoratedCustomViewStyle())
      .setCustomContentView(collapsedView(context, scenario))
      .setCustomBigContentView(expandedView(context, scenario))
      .setHeadsUpContentView(collapsedView(context, scenario))
      .build()

  private fun collapsedView(context: Context, scenario: String) =
    RemoteViews(context.packageName, R.layout.radar_notification_collapsed).apply {
      setTextViewText(R.id.collapsed_body,
        if (scenario == "empty") "Sem previsões no momento" else "838 em 1 min · 855 em 7 min")
    }

  private fun expandedView(context: Context, scenario: String): RemoteViews {
    val view = RemoteViews(context.packageName, R.layout.radar_notification_expanded)
    val isEmpty = scenario == "empty"
    view.setViewVisibility(R.id.route_one, if (isEmpty) View.GONE else View.VISIBLE)
    view.setViewVisibility(R.id.arrivals_one, if (isEmpty) View.GONE else View.VISIBLE)
    view.setViewVisibility(R.id.route_two, if (isEmpty) View.GONE else View.VISIBLE)
    view.setViewVisibility(R.id.arrivals_two, if (isEmpty) View.GONE else View.VISIBLE)
    view.setViewVisibility(R.id.empty_state, if (isEmpty) View.VISIBLE else View.GONE)
    view.setTextViewText(R.id.empty_state, "Sem previsões no momento")
    return view
  }

  private fun notificationId(scenario: String, headsUp: Boolean) = when {
    scenario == "empty" && headsUp -> ID_EMPTY_HEADS_UP
    scenario == "empty" -> ID_EMPTY_NORMAL
    headsUp -> ID_LINES_HEADS_UP
    else -> ID_LINES_NORMAL
  }

  companion object {
    private const val CHANNEL_NORMAL = "radar-native-probe-normal-v1"
    private const val CHANNEL_HEADS_UP = "radar-native-probe-heads-up-v1"
    private const val ID_LINES_NORMAL = 748201
    private const val ID_LINES_HEADS_UP = 748202
    private const val ID_EMPTY_NORMAL = 748203
    private const val ID_EMPTY_HEADS_UP = 748204
  }
}
