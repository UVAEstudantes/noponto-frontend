// node:test puro: sem Expo, EAS, runtime Android, rede ou build.
const test = require('node:test');
const assert = require('node:assert/strict');
const configure = require('../app.config.js');
const base = require('../app.json').expo;
const profiles = require('../eas.json').build;
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const keys = ['APP_VARIANT', 'EXPO_PUBLIC_RADAR_REMOTE_ENABLED', 'EXPO_PUBLIC_RADAR_API_BASE_URL',
  'EXPO_PUBLIC_API_BASE_URL', 'EXPO_PUBLIC_GPS_HUB_URL', 'NOPONTO_DEV_GOOGLE_SERVICES_FILE',
  'NOPONTO_PRODUCTION_GOOGLE_SERVICES_FILE', 'EAS_BUILD'];

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
    assert.equal(output.name, 'No Ponto Dev');
    assert.equal(output.android.package, 'com.guilhermedesales.nononto.dev');
    assert.ok(output.scheme.includes('noponto-radar'));
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
    assert.equal(output.name, 'No Ponto Dev');
    assert.ok(output.scheme.includes('noponto-dev'));
    assert.equal(output.android.package, 'com.guilhermedesales.nononto.dev');
    assert.equal(output.android.googleServicesFile, '/synthetic/google-services.json');
    assert.equal(output.extra.radarStandalone, undefined);
    assert.equal(output.plugins.find(p => Array.isArray(p) && p[0] === 'expo-dev-client')[1].addGeneratedScheme, true);
  });
});

test('config local sem perfil prepara o app Dev para expo run:android', () => {
  withEnv({}, () => {
    const output = config();
    assert.equal(output.name, 'No Ponto Dev');
    assert.equal(output.android.package, 'com.guilhermedesales.nononto.dev');
    assert.ok(output.scheme.includes('noponto-dev'));
  });
});

test('EAS producao preserva identificador e configuracao original', () => {
  assert.deepEqual(profiles.production.env, { APP_VARIANT: 'production' });
  withEnv({ EAS_BUILD: 'true' }, () => {
    const output = config();
    assert.equal(output.name, base.name);
    assert.equal(output.android.package, base.android.package);
    assert.equal(output.scheme, base.scheme);
    assert.equal(output.extra.radarStandalone, undefined);
    assert.equal(output.android.googleServicesFile, base.android.googleServicesFile);
  });
});

test('EAS preview gera APK standalone com o applicationId de produção', () => {
  assert.equal(profiles.preview.distribution, 'internal');
  assert.equal(profiles.preview.android.buildType, 'apk');
  assert.deepEqual(profiles.preview.env, { APP_VARIANT: 'production' });
  withEnv({ ...profiles.preview.env, EAS_BUILD: 'true' }, () => {
    const output = config();
    assert.equal(output.name, 'No Ponto');
    assert.equal(output.android.package, 'com.guilhermedesales.nononto');
    assert.equal(output.scheme, 'noponto');
  });
});

test('production local habilita Radar V1 com Firebase e origem de backend correspondentes', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'noponto-radar-prod-'));
  const firebaseFile = path.join(dir, 'google-services.json');
  fs.writeFileSync(firebaseFile, JSON.stringify({ project_info: { project_id: 'noponto-2d820', project_number: '123' },
    client: [{ client_info: { android_client_info: { package_name: 'com.guilhermedesales.nononto' }, mobilesdk_app_id: 'synthetic' } }] }));
  try {
    withEnv({ APP_VARIANT: 'production', EXPO_PUBLIC_RADAR_REMOTE_ENABLED: 'true',
      EXPO_PUBLIC_RADAR_API_BASE_URL: 'https://api.example', EXPO_PUBLIC_API_BASE_URL: 'https://api.example',
      EXPO_PUBLIC_GPS_HUB_URL: 'wss://api.example/hub/gps', NOPONTO_PRODUCTION_GOOGLE_SERVICES_FILE: firebaseFile }, () => {
      const output = config();
      assert.equal(output.android.package, 'com.guilhermedesales.nononto');
      assert.equal(output.android.googleServicesFile, firebaseFile);
      assert.equal(output.extra.radarRemoteEnabled, true);
      assert.equal(output.extra.nativeRadarV1Enabled, true);
      assert.equal(output.extra.radarStandalone, true);
      assert.equal(output.extra.radarApiOrigin, 'https://api.example');
      assert.equal(output.extra.eas.projectId, base.extra.eas.projectId);
      assert.ok(output.plugins.includes('./plugins/withRadarNativeMessaging'));
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('standalone rejeita URL ausente HTTP localhost credenciais e parametros', () => {
  for (const url of ['', 'http://public.example', 'https://localhost', 'https://127.0.0.1',
    'https://[::1]', 'https://user:synthetic@public.example', 'https://public.example/path',
    'https://public.example?query=1', 'https://public.example#fragment']) {
    withEnv({ ...profiles.radar.env, EXPO_PUBLIC_RADAR_API_BASE_URL: url }, () => assert.throws(config));
  }
});

test('standalone rejeita opt-in ausente REST ou SignalR de outra API', () => {
  for (const [changed, field] of [
    [{ EXPO_PUBLIC_RADAR_REMOTE_ENABLED: 'false' }, 'EXPO_PUBLIC_RADAR_REMOTE_ENABLED'],
    [{ EXPO_PUBLIC_API_BASE_URL: 'https://other.example' }, 'EXPO_PUBLIC_API_BASE_URL'],
    [{ EXPO_PUBLIC_GPS_HUB_URL: 'https://api.example/hub/gps' }, 'EXPO_PUBLIC_GPS_HUB_URL'],
  ]) {
    withEnv({ ...profiles.radar.env, ...changed }, () => assert.throws(config, new RegExp(field)));
  }
});

test('production reporta exatamente o campo SignalR ou projectId inválido', () => {
  const env = { APP_VARIANT: 'production', EXPO_PUBLIC_RADAR_REMOTE_ENABLED: 'true',
    EXPO_PUBLIC_RADAR_API_BASE_URL: 'https://api.example', EXPO_PUBLIC_API_BASE_URL: 'https://api.example',
    EXPO_PUBLIC_GPS_HUB_URL: 'https://api.example/hub/gps' };
  withEnv(env, () => assert.throws(config, /EXPO_PUBLIC_GPS_HUB_URL/));
  withEnv({ ...env, EXPO_PUBLIC_GPS_HUB_URL: 'wss://api.example/hub/gps' }, () => {
    assert.throws(() => configure({ config: { ...structuredClone(base), extra: {} } }), /extra\.eas\.projectId/);
  });
});

test('build remoto exige arquivo Firebase e preserva referencia externa sem ler segredos', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'noponto-radar-dev-'));
  const firebaseFile = path.join(dir, 'google-services.json');
  fs.writeFileSync(firebaseFile, JSON.stringify({ project_info: { project_id: 'noponto-2d820', project_number: '123' },
    client: [{ client_info: { android_client_info: { package_name: 'com.guilhermedesales.nononto.dev' }, mobilesdk_app_id: 'synthetic' } }] }));
  try {
    withEnv({ ...profiles.radar.env, EAS_BUILD: 'true' }, () => {
      assert.throws(config, /NOPONTO_DEV_GOOGLE_SERVICES_FILE/);
    });
    withEnv({ ...profiles.radar.env, EAS_BUILD: 'true', NOPONTO_DEV_GOOGLE_SERVICES_FILE: firebaseFile }, () => {
      assert.equal(config().android.googleServicesFile, firebaseFile);
    });
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('script productionRelease valida config Expo antes do Gradle e preserva URLs informadas', () => {
  const release = fs.readFileSync(path.join(__dirname, 'build-release-local.ps1'), 'utf8');
  const preflight = release.indexOf('Assert-ProductionExpoConfig');
  const gradle = release.indexOf(':app:assembleProductionRelease');
  assert.ok(preflight >= 0 && preflight < gradle);
  assert.match(release, /\$env:APP_VARIANT = 'production'/);
  assert.match(release, /\$env:NODE_ENV = 'production'/);
  assert.match(release, /\$env:EXPO_PUBLIC_RADAR_REMOTE_ENABLED = 'true'/);
  for (const key of ['EXPO_PUBLIC_RADAR_API_BASE_URL', 'EXPO_PUBLIC_API_BASE_URL', 'EXPO_PUBLIC_GPS_HUB_URL']) {
    assert.doesNotMatch(release, new RegExp(`\\$env:${key}\\s*=`));
    assert.doesNotMatch(release, new RegExp(`Remove-Item Env:${key}`));
  }
  assert.ok(fs.readFileSync(path.join(__dirname, 'android-local-build-common.ps1'), 'utf8')
    .includes('node_modules/expo/bin/cli'), 'preflight executes Expo CLI as a child process inheriting the process environment');
});
