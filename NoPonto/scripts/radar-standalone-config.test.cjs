// node:test puro: sem Expo, EAS, runtime Android, rede ou build.
const test = require('node:test');
const assert = require('node:assert/strict');
const configure = require('../app.config.js');
const base = require('../app.json').expo;
const profiles = require('../eas.json').build;
const keys = ['APP_VARIANT', 'EXPO_PUBLIC_RADAR_REMOTE_ENABLED', 'EXPO_PUBLIC_RADAR_API_BASE_URL',
  'EXPO_PUBLIC_API_BASE_URL', 'EXPO_PUBLIC_GPS_HUB_URL', 'NOPONTO_DEV_GOOGLE_SERVICES_FILE', 'EAS_BUILD'];

function withEnv(env, action) {
  const previous = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  for (const k of keys) delete process.env[k];
  Object.assign(process.env, env);
  try { return action(); }
  finally {
    for (const k of keys) {
      if (previous[k] === undefined) delete process.env[k];
      else process.env[k] = previous[k];
    }
  }
}
const config = () => configure({ config: structuredClone(base) });

test('perfil Radar gera APK sem development client e declara URLs para build remoto', () => {
  assert.equal(profiles.radar.developmentClient, false);
  assert.equal(profiles.radar.distribution, 'internal');
  assert.equal(profiles.radar.android.buildType, 'apk');
  assert.equal(profiles.radar.environment, 'development');
  withEnv(profiles.radar.env, () => {
    const output = config();
    assert.equal(output.name, 'NoPonto Radar');
    assert.equal(output.android.package, 'com.guilhermedesales.nononto.dev');
    assert.equal(output.scheme, 'noponto-radar');
    assert.equal(output.extra.radarStandalone, true);
    assert.equal(output.extra.radarApiOrigin, profiles.radar.env.EXPO_PUBLIC_RADAR_API_BASE_URL);
    assert.equal(output.extra.eas.projectId, base.extra.eas.projectId);
    assert.ok(output.plugins.includes('expo-secure-store'));
    assert.equal(output.plugins.find(p => Array.isArray(p) && p[0] === 'expo-dev-client')[1].addGeneratedScheme, false);
  });
});

test('Dev preserva pacote scheme e Metro sem habilitar metadados standalone', () => {
  assert.equal(profiles.development.developmentClient, true);
  assert.deepEqual(profiles.development.env, { APP_VARIANT: 'development' });
  withEnv({ APP_VARIANT: 'development', NOPONTO_DEV_GOOGLE_SERVICES_FILE: '/synthetic/google-services.json' }, () => {
    const output = config();
    assert.equal(output.name, 'NoPonto Dev');
    assert.equal(output.scheme, 'noponto-dev');
    assert.equal(output.android.package, 'com.guilhermedesales.nononto.dev');
    assert.equal(output.android.googleServicesFile, '/synthetic/google-services.json');
    assert.equal(output.extra.radarStandalone, undefined);
    assert.equal(output.plugins.find(p => Array.isArray(p) && p[0] === 'expo-dev-client')[1].addGeneratedScheme, true);
  });
});

test('producao padrao preserva identificador e configuracao original', () => {
  withEnv({}, () => {
    const output = config();
    assert.equal(output.name, base.name);
    assert.equal(output.android.package, base.android.package);
    assert.equal(output.scheme, base.scheme);
    assert.equal(output.extra.radarStandalone, undefined);
    assert.equal(output.android.googleServicesFile, base.android.googleServicesFile);
  });
});

test('standalone rejeita URL ausente HTTP localhost credenciais e parametros', () => {
  for (const url of ['', 'http://public.example', 'https://localhost', 'https://127.0.0.1',
    'https://[::1]', 'https://user:synthetic@public.example', 'https://public.example/path',
    'https://public.example?query=1', 'https://public.example#fragment']) {
    withEnv({ ...profiles.radar.env, EXPO_PUBLIC_RADAR_API_BASE_URL: url }, () => assert.throws(config));
  }
});

test('standalone rejeita opt-in ausente REST ou SignalR de outra API', () => {
  for (const changed of [
    { EXPO_PUBLIC_RADAR_REMOTE_ENABLED: 'false' },
    { EXPO_PUBLIC_API_BASE_URL: 'https://other.example' },
    { EXPO_PUBLIC_GPS_HUB_URL: 'ws://localhost:8080/hub/gps' },
  ]) {
    withEnv({ ...profiles.radar.env, ...changed }, () => assert.throws(config));
  }
});

test('build remoto exige arquivo Firebase e preserva referencia externa sem ler segredos', () => {
  withEnv({ ...profiles.radar.env, EAS_BUILD: 'true' }, () => {
    assert.throws(config, /NOPONTO_DEV_GOOGLE_SERVICES_FILE/);
  });
  withEnv({ ...profiles.radar.env, EAS_BUILD: 'true', NOPONTO_DEV_GOOGLE_SERVICES_FILE: '/synthetic/google-services.json' }, () => {
    assert.equal(config().android.googleServicesFile, '/synthetic/google-services.json');
  });
});
