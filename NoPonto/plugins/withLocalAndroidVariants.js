const fs = require('node:fs/promises');
const path = require('node:path');
const { withAndroidManifest, withAppBuildGradle, withDangerousMod } = require('@expo/config-plugins');

const marker = '// NoPonto local Android flavors';

function addLocalFlavors(source) {
  if (source.includes(marker)) return source;
  const anchor = '    buildTypes {';
  if (!source.includes(anchor)) throw new Error('Android build.gradle has no buildTypes block.');
  const block = `    // NoPonto local Android flavors
    signingConfigs {
        production {
            def keyPath = System.getenv('NOPONTO_PRODUCTION_KEYSTORE')
            if (keyPath) {
                storeFile file(keyPath)
                storePassword System.getenv('NOPONTO_PRODUCTION_STORE_PASSWORD')
                keyAlias System.getenv('NOPONTO_PRODUCTION_KEY_ALIAS')
                keyPassword System.getenv('NOPONTO_PRODUCTION_KEY_PASSWORD')
            }
        }
    }

    flavorDimensions "environment"
    // Keep the existing EAS Native Probe profile on the development flavor.
    def nativeProbeBuild = System.getenv('APP_VARIANT') == 'nativeprobe'
    productFlavors {
        development {
            dimension "environment"
            applicationId nativeProbeBuild ? "com.guilhermedesales.nononto.nativeprobe" : "com.guilhermedesales.nononto.dev"
            signingConfig signingConfigs.debug
            manifestPlaceholders = nativeProbeBuild
                ? [nopontoScheme: "noponto-nativeprobe", nopontoRadarScheme: "noponto-disabled"]
                : [nopontoScheme: "noponto-dev", nopontoRadarScheme: "noponto-radar"]
        }
        production {
            dimension "environment"
            applicationId "com.guilhermedesales.nononto"
            manifestPlaceholders = [nopontoScheme: "noponto", nopontoRadarScheme: "noponto-disabled"]
            if (System.getenv('NOPONTO_PRODUCTION_KEYSTORE')) signingConfig signingConfigs.production
        }
    }

`;
  source = source.replace(anchor, `${block}${anchor}`);
  source = source.replace('    // Use Expo CLI to bundle the app, this ensures the Metro config',
    '    debuggableVariants = ["developmentDebug"]\n    // Use Expo CLI to bundle the app, this ensures the Metro config');
  const signingGuard = `
if (gradle.startParameter.taskNames.any { it.toLowerCase().contains('productionrelease') }
    && System.getenv('EAS_BUILD') != 'true') {
    def required = ['NOPONTO_PRODUCTION_KEYSTORE', 'NOPONTO_PRODUCTION_STORE_PASSWORD',
        'NOPONTO_PRODUCTION_KEY_ALIAS', 'NOPONTO_PRODUCTION_KEY_PASSWORD']
    if (required.any { !System.getenv(it) }) {
        throw new GradleException('productionRelease local requires a production keystore and signing env vars; debug signing is blocked.')
    }
}
`;
  source = source.replace("apply plugin: 'com.google.gms.google-services'", `${signingGuard}\napply plugin: 'com.google.gms.google-services'`);
  return source;
}

function flavorizeSchemes(manifest) {
  const activity = manifest.manifest.application?.[0]?.activity?.find(item =>
    item.$?.['android:name']?.endsWith('.MainActivity'));
  if (!activity) throw new Error('Android manifest has no MainActivity.');
  const filters = (activity['intent-filter'] ?? []).filter(filter =>
    filter.category?.some(category => category.$?.['android:name'] === 'android.intent.category.BROWSABLE')
    && filter.data?.some(data => ['noponto', 'noponto-dev', 'noponto-radar'].includes(data.$?.['android:scheme'])));
  if (!filters.length) throw new Error('Android manifest has no NoPonto deep-link schemes.');
  filters.forEach((filter, index) => {
    const data = filter.data.find(entry => ['noponto', 'noponto-dev', 'noponto-radar'].includes(entry.$?.['android:scheme']));
    data.$['android:scheme'] = index === 0 ? '${nopontoScheme}' : '${nopontoRadarScheme}';
  });
  return manifest;
}

function withLocalAndroidVariants(config) {
  config = withAppBuildGradle(config, mod => {
    mod.modResults.contents = addLocalFlavors(mod.modResults.contents);
    return mod;
  });
  config = withAndroidManifest(config, mod => {
    mod.modResults = flavorizeSchemes(mod.modResults);
    return mod;
  });
  return withDangerousMod(config, ['android', async mod => {
    for (const [flavor, label] of [['development', 'No Ponto Dev'], ['production', 'No Ponto']]) {
      const file = path.join(mod.modRequest.platformProjectRoot, 'app', 'src', flavor, 'res', 'values', 'strings.xml');
      const content = `<resources>\n  <string name="app_name">${label}</string>\n</resources>\n`;
      await fs.mkdir(path.dirname(file), { recursive: true });
      try {
        const existing = await fs.readFile(file, 'utf8');
        if (existing !== content) throw new Error(`Refusing to overwrite custom flavor label: ${file}`);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        await fs.writeFile(file, content, 'utf8');
      }
    }
    return mod;
  }]);
}

module.exports = withLocalAndroidVariants;
module.exports.addLocalFlavors = addLocalFlavors;
module.exports.flavorizeSchemes = flavorizeSchemes;
