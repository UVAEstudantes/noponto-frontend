const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const plugin = require('../plugins/withLocalAndroidVariants');

test('Gradle flavor configuration is idempotent and keeps production signing guarded', () => {
  const fixture = 'react {\n    // Use Expo CLI to bundle the app, this ensures the Metro config\n}\nandroid {\n    buildTypes {\n    }\n}\napply plugin: \'com.google.gms.google-services\'\n';
  const transformed = plugin.addLocalFlavors(fixture);
  assert.match(transformed, /flavorDimensions "environment"/);
  assert.match(transformed, /applicationId nativeProbeBuild \? "com\.guilhermedesales\.nononto\.nativeprobe" : "com\.guilhermedesales\.nononto\.dev"/);
  assert.match(transformed, /applicationId "com\.guilhermedesales\.nononto"/);
  assert.match(transformed, /debuggableVariants = \["developmentDebug"\]/);
  assert.match(transformed, /productionRelease local requires a production keystore/);
  assert.equal(plugin.addLocalFlavors(transformed), transformed);
});

test('manifest flavor placeholders route Dev and release to distinct schemes', () => {
  const manifest = { manifest: { application: [{ activity: [{
    $: { 'android:name': '.MainActivity' },
    'intent-filter': [
      { category: [{ $: { 'android:name': 'android.intent.category.BROWSABLE' } }], data: [{ $: { 'android:scheme': 'noponto-dev' } }] },
      { category: [{ $: { 'android:name': 'android.intent.category.BROWSABLE' } }], data: [{ $: { 'android:scheme': 'noponto-radar' } }] },
    ],
  }] }] } };
  plugin.flavorizeSchemes(manifest);
  const schemes = manifest.manifest.application[0].activity[0]['intent-filter'].map(filter => filter.data[0].$['android:scheme']);
  assert.deepEqual(schemes, ['${nopontoScheme}', '${nopontoRadarScheme}']);
  const gradle = plugin.addLocalFlavors('android {\n    buildTypes {\n    }\n}\n');
  assert.match(gradle, /nopontoScheme: "noponto-dev"/);
  assert.match(gradle, /nopontoScheme: "noponto"/);
});

test('app config installs the persistent native flavor plugin', () => {
  const configure = require('../app.config');
  const output = configure({ config: structuredClone(require('../app.json').expo) });
  assert.ok(output.plugins.includes('./plugins/withLocalAndroidVariants'));
});

test('EAS chooses explicit flavor tasks and local scripts select their exact variants', () => {
  const eas = require('../eas.json').build;
  assert.equal(eas.development.android.gradleCommand, ':app:assembleDevelopmentDebug');
  assert.equal(eas.preview.android.gradleCommand, ':app:assembleProductionRelease');
  assert.equal(eas.production.android.gradleCommand, ':app:bundleProductionRelease');
  assert.match(fs.readFileSync(path.join(__dirname, 'build-dev-local.ps1'), 'utf8'), /:app:assembleDevelopmentDebug/);
  assert.match(fs.readFileSync(path.join(__dirname, 'build-release-local.ps1'), 'utf8'), /:app:assembleProductionRelease/);
});

test('local release requires its own Firebase client and external production signing key', () => {
  const release = fs.readFileSync(path.join(__dirname, 'build-release-local.ps1'), 'utf8');
  const common = fs.readFileSync(path.join(__dirname, 'android-local-build-common.ps1'), 'utf8');
  for (const name of ['NOPONTO_PRODUCTION_KEYSTORE', 'NOPONTO_PRODUCTION_STORE_PASSWORD',
    'NOPONTO_PRODUCTION_KEY_ALIAS', 'NOPONTO_PRODUCTION_KEY_PASSWORD']) assert.ok(release.includes(name));
  assert.match(release, /android\/app\/src\/production\/google-services\.json/);
  assert.match(release, /EXPO_PUBLIC_RADAR_REMOTE_ENABLED = 'true'/);
  assert.match(release, /Assert-ProductionExpoConfig/);
  assert.match(release, /com\.guilhermedesales\.nononto/);
  assert.match(common, /Test-Path 'android\/app\/\.cxx'.*[\s\S]*?previous\.TrimEnd/);
  assert.match(common, /Remove-Item 'android\/app\/\.cxx'/);
});
