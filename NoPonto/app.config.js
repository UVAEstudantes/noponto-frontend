// app.json continua sendo a base de produção; os perfis usam Firebase separado por app.
const fs = require('node:fs');

const DEV_PACKAGE = 'com.guilhermedesales.nononto.dev';
const NATIVE_PROBE_PACKAGE = 'com.guilhermedesales.nononto.nativeprobe';

module.exports = ({ config }) => {
  const development = process.env.APP_VARIANT === 'development';
  const radar = process.env.APP_VARIANT === 'radar';
  const nativeprobe = process.env.APP_VARIANT === 'nativeprobe';
  const googleServicesFile = nativeprobe
    ? process.env.NOPONTO_NATIVE_PROBE_GOOGLE_SERVICES_FILE || './android/app/google-services.json'
    : process.env.NOPONTO_DEV_GOOGLE_SERVICES_FILE;
  let radarOrigin;
  const firebasePackage = nativeprobe ? NATIVE_PROBE_PACKAGE : DEV_PACKAGE;
  let firebaseConfigured = false;

  if ((nativeprobe || radar) && googleServicesFile) {
    try {
      const firebase = JSON.parse(fs.readFileSync(googleServicesFile, 'utf8'));
      firebaseConfigured = firebase.project_info?.project_id === 'noponto-2d820'
        && !!firebase.project_info?.project_number
        && firebase.client?.some(client =>
          client.client_info?.android_client_info?.package_name === firebasePackage
          && !!client.client_info?.mobilesdk_app_id);
    } catch { /* Sem Firebase válido para o pacote, Radar remoto permanece desligado. */ }
  }

  const remoteRequested = process.env.EXPO_PUBLIC_RADAR_REMOTE_ENABLED === 'true';
  const remoteRadar = radar || (nativeprobe && remoteRequested);
  const remoteEnabled = remoteRequested && (!(nativeprobe || radar) || firebaseConfigured);

  if (remoteRadar) {
    const url = new URL(process.env.EXPO_PUBLIC_RADAR_API_BASE_URL || '');
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
      || url.pathname !== '/' || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
      throw new Error('Radar remoto requer EXPO_PUBLIC_RADAR_API_BASE_URL com origem HTTPS pública.');
    }
    radarOrigin = url.origin;
    if (!remoteRequested
      || process.env.EXPO_PUBLIC_API_BASE_URL !== radarOrigin
      || process.env.EXPO_PUBLIC_GPS_HUB_URL !== `${radarOrigin.replace('https:', 'wss:')}/hub/gps`
      || !config.extra?.eas?.projectId) {
      throw new Error('Perfil remoto requer opt-in, REST/SignalR da mesma API e projectId Expo existente.');
    }
  }
  if (radar && process.env.EAS_BUILD === 'true' && !firebaseConfigured) {
    throw new Error('Build Radar requer NOPONTO_DEV_GOOGLE_SERVICES_FILE válido para ' + DEV_PACKAGE + '.');
  }
  if (nativeprobe && process.env.EAS_BUILD === 'true' && !firebaseConfigured) {
    throw new Error(`Build Native Probe requer NOPONTO_NATIVE_PROBE_GOOGLE_SERVICES_FILE válido para ${NATIVE_PROBE_PACKAGE} no ambiente EAS development.`);
  }

  return {
    ...config,
    ...(development || radar || nativeprobe ? {
      name: 'No Ponto',
      scheme: radar ? 'noponto-radar' : nativeprobe ? 'noponto-nativeprobe' : 'noponto-dev',
      android: { ...config.android,
        package: nativeprobe
          ? NATIVE_PROBE_PACKAGE
          : 'com.guilhermedesales.nononto.dev',
        ...(googleServicesFile && (!(nativeprobe || radar) || firebaseConfigured) ? { googleServicesFile } : {}) },
    } : {}),
    extra: {
      ...config.extra,
      radarRemoteEnabled: remoteEnabled,
      ...(radar ? {
        radarStandalone: true,
        radarApiOrigin: radarOrigin,
        nativeRadarV1Enabled: firebaseConfigured,
      } : {}),
      ...(nativeprobe ? {
        nativeNotificationProbe: true,
        nativeRadarV1Enabled: firebaseConfigured,
        ...(remoteEnabled ? { radarStandalone: true, radarApiOrigin: radarOrigin } : {}),
      } : {}),
    },
    plugins: [
      ...(config.plugins ?? []),
      ['expo-dev-client', { addGeneratedScheme: development }],
      ...((radar || nativeprobe) ? ['./plugins/withRadarNativeMessaging'] : []),
      ...(development || radar || nativeprobe ? ['expo-secure-store'] : []),
    ],
  };
};
