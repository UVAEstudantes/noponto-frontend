// app.json continua sendo a base de produção; selecione development também no Metro.
module.exports = ({ config }) => {
  const development = process.env.APP_VARIANT === 'development';
  return {
    ...config,
    ...(development ? {
      name: 'NoPonto Dev',
      scheme: 'noponto-dev',
      android: { ...config.android, package: 'com.guilhermedesales.nononto.dev',
        ...(process.env.NOPONTO_DEV_GOOGLE_SERVICES_FILE ? { googleServicesFile: process.env.NOPONTO_DEV_GOOGLE_SERVICES_FILE } : {}) },
    } : {}),
    plugins: [
      ...(config.plugins ?? []),
      ['expo-dev-client', { addGeneratedScheme: development }],
      ...(development ? ['expo-secure-store'] : []),
    ],
  };
};
