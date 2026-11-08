// app.json continua sendo a base de produção. Dev e APK Radar são perfis separados.
module.exports = ({ config }) => {
  const development = process.env.APP_VARIANT === 'development';
  const radar = process.env.APP_VARIANT === 'radar';
  const nativeprobe = process.env.APP_VARIANT === 'nativeprobe';
  const googleServicesFile = process.env.NOPONTO_DEV_GOOGLE_SERVICES_FILE;
  let radarOrigin;
  if (radar) {
    const url = new URL(process.env.EXPO_PUBLIC_RADAR_API_BASE_URL || '');
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
      || url.pathname !== '/' || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
      throw new Error('APK Radar requer EXPO_PUBLIC_RADAR_API_BASE_URL com origem HTTPS pública.');
    }
    radarOrigin = url.origin;
    if (process.env.EXPO_PUBLIC_RADAR_REMOTE_ENABLED !== 'true'
      || process.env.EXPO_PUBLIC_API_BASE_URL !== radarOrigin
      || process.env.EXPO_PUBLIC_GPS_HUB_URL !== `${radarOrigin.replace('https:', 'wss:')}/hub/gps`
      || !config.extra?.eas?.projectId) {
      throw new Error('Perfil Radar requer opt-in, REST/SignalR da mesma API e projectId Expo existente.');
    }
    if (process.env.EAS_BUILD === 'true' && !googleServicesFile) {
      throw new Error('Build remoto Android requer NOPONTO_DEV_GOOGLE_SERVICES_FILE no ambiente EAS development.');
    }
  }
  return {
    ...config,
    ...(development || radar || nativeprobe ? {
      name: radar ? 'NoPonto Radar' : nativeprobe ? 'NoPonto Native Probe' : 'NoPonto Dev',
      scheme: radar ? 'noponto-radar' : nativeprobe ? 'noponto-nativeprobe' : 'noponto-dev',
      android: { ...config.android,
        package: nativeprobe
          ? 'com.guilhermedesales.nononto.nativeprobe'
          : 'com.guilhermedesales.nononto.dev',
        ...(!nativeprobe && googleServicesFile ? { googleServicesFile } : {}) },
    } : {}),
    ...(radar ? { extra: { ...config.extra, radarStandalone: true, radarApiOrigin: radarOrigin } } : {}),
    ...(nativeprobe ? { extra: { ...config.extra, nativeNotificationProbe: true } } : {}),
    plugins: [
      ...(config.plugins ?? []),
      ['expo-dev-client', { addGeneratedScheme: development }],
      ...(development || radar ? ['expo-secure-store'] : []),
    ],
  };
};
