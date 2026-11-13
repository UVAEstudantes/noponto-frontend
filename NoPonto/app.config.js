// app.json continua sendo a base de produção; os perfis usam Firebase separado por app.
const fs = require('node:fs');

const DEV_PACKAGE = 'com.guilhermedesales.nononto.dev';
const NATIVE_PROBE_PACKAGE = 'com.guilhermedesales.nononto.nativeprobe';

module.exports = ({ config }) => {
  const development = process.env.APP_VARIANT === 'development'
    || (!process.env.APP_VARIANT && process.env.EAS_BUILD !== 'true');
  const radar = process.env.APP_VARIANT === 'radar';
  const nativeprobe = process.env.APP_VARIANT === 'nativeprobe';
  const productionRadar = process.env.APP_VARIANT === 'production'
    && process.env.EAS_BUILD !== 'true'
    && process.env.EXPO_PUBLIC_RADAR_REMOTE_ENABLED === 'true';
  const googleServicesFile = nativeprobe
    ? process.env.NOPONTO_NATIVE_PROBE_GOOGLE_SERVICES_FILE || './android/app/google-services.json'
    : productionRadar
      ? process.env.NOPONTO_PRODUCTION_GOOGLE_SERVICES_FILE || './android/app/src/production/google-services.json'
      : process.env.NOPONTO_DEV_GOOGLE_SERVICES_FILE;
  let radarOrigin;
  const firebasePackage = nativeprobe ? NATIVE_PROBE_PACKAGE
    : productionRadar ? config.android?.package : DEV_PACKAGE;
  let firebaseConfigured = false;

  if ((nativeprobe || radar || productionRadar) && googleServicesFile) {
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
  const remoteRadar = radar || productionRadar || (nativeprobe && remoteRequested);
  const remoteEnabled = remoteRequested && (!(nativeprobe || radar || productionRadar) || firebaseConfigured);

  if (remoteRadar) {
    let url;
    try { url = new URL(process.env.EXPO_PUBLIC_RADAR_API_BASE_URL || ''); }
    catch { throw new Error('EXPO_PUBLIC_RADAR_API_BASE_URL deve ser uma origem HTTPS pública válida.'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
      || url.pathname !== '/' || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
      throw new Error('Radar remoto requer EXPO_PUBLIC_RADAR_API_BASE_URL com origem HTTPS pública.');
    }
    radarOrigin = url.origin;
    if (!remoteRequested) throw new Error('EXPO_PUBLIC_RADAR_REMOTE_ENABLED deve ser "true" para habilitar o Radar remoto.');
    if (process.env.EXPO_PUBLIC_API_BASE_URL !== radarOrigin) {
      throw new Error('EXPO_PUBLIC_API_BASE_URL deve usar a mesma origem HTTPS de EXPO_PUBLIC_RADAR_API_BASE_URL.');
    }
    if (process.env.EXPO_PUBLIC_GPS_HUB_URL !== `${radarOrigin.replace('https:', 'wss:')}/hub/gps`) {
      throw new Error('EXPO_PUBLIC_GPS_HUB_URL deve usar wss://<mesma-origem>/hub/gps.');
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(config.extra?.eas?.projectId || '')) {
      throw new Error('extra.eas.projectId em app.json deve conter o UUID do projeto Expo existente.');
    }
  }
  if (radar && process.env.EAS_BUILD === 'true' && !firebaseConfigured) {
    throw new Error('Build Radar requer NOPONTO_DEV_GOOGLE_SERVICES_FILE válido para ' + DEV_PACKAGE + '.');
  }
  if (nativeprobe && process.env.EAS_BUILD === 'true' && !firebaseConfigured) {
    throw new Error(`Build Native Probe requer NOPONTO_NATIVE_PROBE_GOOGLE_SERVICES_FILE válido para ${NATIVE_PROBE_PACKAGE} no ambiente EAS development.`);
  }
  if (productionRadar && !firebaseConfigured) {
    throw new Error('Radar local de produção requer um cliente Firebase para com.guilhermedesales.nononto em android/app/src/production/google-services.json.');
  }

  return {
    ...config,
    ...(development || radar || nativeprobe ? {
      name: development || radar ? 'No Ponto Dev' : 'No Ponto',
      scheme: radar ? ['noponto-radar', 'noponto-dev'] : nativeprobe ? 'noponto-nativeprobe'
        : ['noponto-dev', 'noponto-radar'],
      android: { ...config.android,
        package: nativeprobe
          ? NATIVE_PROBE_PACKAGE
          : 'com.guilhermedesales.nononto.dev',
        ...(googleServicesFile && (!(nativeprobe || radar) || firebaseConfigured) ? { googleServicesFile } : {}) },
    } : {}),
    ...(productionRadar ? {
      android: { ...config.android, googleServicesFile },
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
      ...(productionRadar ? {
        radarStandalone: true,
        radarApiOrigin: radarOrigin,
        nativeRadarV1Enabled: firebaseConfigured,
      } : {}),
    },
    plugins: [
      ...(config.plugins ?? []),
      ['expo-dev-client', { addGeneratedScheme: development }],
      './plugins/withLocalAndroidVariants',
      ...((radar || nativeprobe || productionRadar) ? ['./plugins/withRadarNativeMessaging'] : []),
      ...(development || radar || nativeprobe || productionRadar ? ['expo-secure-store'] : []),
    ],
  };
};
