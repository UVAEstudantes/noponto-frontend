const { withAndroidManifest } = require('@expo/config-plugins');

const expoMessagingServices = [
  'expo.modules.notifications.service.ExpoFirebaseMessagingService',
  'com.google.firebase.messaging.FirebaseMessagingService',
];

module.exports = function withRadarNativeMessaging(config) {
  return withAndroidManifest(config, config => {
    const manifest = config.modResults.manifest;
    const application = manifest.application?.[0];
    if (!application) throw new Error('Android manifest has no application element.');

    manifest.$ ??= {};
    manifest.$['xmlns:tools'] ??= 'http://schemas.android.com/tools';
    application.service ??= [];

    for (const name of expoMessagingServices) {
      let service = application.service.find(item => item.$?.['android:name'] === name);
      if (!service) {
        service = { $: { 'android:name': name } };
        application.service.push(service);
      }
      service.$['tools:node'] = 'remove';
    }
    return config;
  });
};
