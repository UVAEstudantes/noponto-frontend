const test = require('node:test');
const assert = require('node:assert/strict');
const configure = require('../app.config.js');
const base = require('../app.json').expo;
const profiles = require('../eas.json').build;

test('nativeprobe tem pacote isolado e não herda arquivo Firebase Dev', () => {
  assert.equal(profiles.nativeprobe.developmentClient, false);
  assert.equal(profiles.nativeprobe.android.buildType, 'apk');
  assert.deepEqual(profiles.nativeprobe.env, { APP_VARIANT: 'nativeprobe' });
  const previous = process.env.APP_VARIANT;
  const firebase = process.env.NOPONTO_DEV_GOOGLE_SERVICES_FILE;
  process.env.APP_VARIANT = 'nativeprobe';
  process.env.NOPONTO_DEV_GOOGLE_SERVICES_FILE = 'google-services-dev.json';
  try {
    const output = configure({ config: structuredClone(base) });
    assert.equal(output.android.package, 'com.guilhermedesales.nononto.nativeprobe');
    assert.equal(output.android.googleServicesFile, undefined);
    assert.equal(output.extra.nativeNotificationProbe, true);
    assert.equal(output.extra.eas.projectId, base.extra.eas.projectId);
  } finally {
    if (previous === undefined) delete process.env.APP_VARIANT;
    else process.env.APP_VARIANT = previous;
    if (firebase === undefined) delete process.env.NOPONTO_DEV_GOOGLE_SERVICES_FILE;
    else process.env.NOPONTO_DEV_GOOGLE_SERVICES_FILE = firebase;
  }
});

test('perfis Dev, Radar e produção continuam com os applicationIds existentes', () => {
  const keys = ['APP_VARIANT', ...Object.keys(profiles.radar.env), 'NOPONTO_DEV_GOOGLE_SERVICES_FILE', 'EAS_BUILD'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  for (const key of keys) delete process.env[key];
  try {
    process.env.APP_VARIANT = 'development';
    assert.equal(configure({ config: structuredClone(base) }).android.package, 'com.guilhermedesales.nononto.dev');
    Object.assign(process.env, profiles.radar.env);
    assert.equal(configure({ config: structuredClone(base) }).android.package, 'com.guilhermedesales.nononto.dev');
    delete process.env.APP_VARIANT;
    assert.equal(configure({ config: structuredClone(base) }).android.package, base.android.package);
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
