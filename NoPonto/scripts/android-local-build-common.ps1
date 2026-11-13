$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Get-AndroidLocalEnvironment {
    foreach ($command in @('node', 'git')) { Get-Command $command -ErrorAction Stop | Out-Null }
    if (!(Test-Path 'node_modules/expo/bin/cli') -or !(Test-Path 'android/gradlew.bat')) {
        throw 'Expo dependencies or android/ are missing. Run the explicit native setup first; this script never runs Prebuild.'
    }
    if (!$env:JAVA_HOME -or !(Test-Path "$env:JAVA_HOME/bin/java.exe")) { throw 'Set JAVA_HOME to JDK 17 or newer.' }
    $java = (& "$env:JAVA_HOME/bin/java.exe" -version 2>&1 | Out-String)
    if ($java -notmatch 'version "(\d+)' -or [int]$Matches[1] -lt 17) { throw 'JDK 17 or newer is required.' }

    $sdk = $env:ANDROID_HOME
    if (!$sdk) { $sdk = $env:ANDROID_SDK_ROOT }
    if (!$sdk) { $sdk = Join-Path $env:LOCALAPPDATA 'Android/Sdk' }
    if (!(Test-Path $sdk)) { throw "Android SDK not found: $sdk" }
    $cmake = Join-Path $sdk 'cmake/3.31.6'
    if (!(Test-Path "$cmake/bin/cmake.exe") -or !(Test-Path "$cmake/bin/ninja.exe")) { throw "CMake 3.31.6 / Ninja 1.12+ missing: $cmake" }
    $cmakeVersion = (& "$cmake/bin/cmake.exe" --version | Select-Object -First 1)
    $ninjaVersion = (& "$cmake/bin/ninja.exe" --version).Trim()
    if ($cmakeVersion -notmatch '3\.31\.6') { throw "Unexpected CMake version: $cmakeVersion" }
    if ($ninjaVersion -notmatch '^(\d+)\.(\d+)' -or [int]$Matches[1] -lt 1 -or ([int]$Matches[1] -eq 1 -and [int]$Matches[2] -lt 12)) { throw "Ninja 1.12+ required; found $ninjaVersion" }
    foreach ($path in @('platforms/android-36/android.jar', 'build-tools/36.0.0/apksigner.bat', 'ndk/27.1.12297006/source.properties')) {
        if (!(Test-Path (Join-Path $sdk $path))) { throw "Android SDK component missing: $path" }
    }
    $gradle = Get-Content android/app/build.gradle -Raw
    if ($gradle -notmatch 'flavorDimensions\s+"environment"' -or $gradle -notmatch 'development\s*\{[\s\S]*?com\.guilhermedesales\.nononto\.dev' -or $gradle -notmatch 'production\s*\{[\s\S]*?applicationId\s+"com\.guilhermedesales\.nononto"') {
        throw 'android/app/build.gradle does not contain the expected development/production flavors. Apply the persisted Expo config plugin explicitly.'
    }
    if ($gradle -match 'cmake\s*\{\s*version\s+["'']3\.22') { throw 'Conflicting explicit CMake version found in android/app/build.gradle.' }
    return @{ Sdk = $sdk; CMake = $cmake; Gradle = $gradle }
}

function Set-AndroidLocalBuildProperties([string]$sdk, [string]$cmake) {
    $file = 'android/local.properties'
    $sdkDir = $sdk.Replace('\', '/')
    $cmakeDir = $cmake.Replace('\', '/')
    $previous = if (Test-Path $file) {
        (Get-Content -LiteralPath $file | Where-Object { $_ -match '^\s*cmake\.dir\s*=' } | Select-Object -Last 1) -replace '^\s*cmake\.dir\s*=\s*', ''
    } else { $null }
    if ((Test-Path 'android/app/.cxx') -and (!$previous -or $previous.TrimEnd('/') -ne $cmakeDir.TrimEnd('/'))) {
        Remove-Item 'android/app/.cxx' -Recurse -Force
    }
    $properties = if (Test-Path $file) { @(Get-Content -LiteralPath $file | Where-Object { $_ -notmatch '^\s*(sdk\.dir|cmake\.dir)\s*=' }) } else { @() }
    $properties = @($properties)
    $properties += "sdk.dir=$sdkDir"
    $properties += "cmake.dir=$cmakeDir"
    Set-Content -LiteralPath $file -Value ($properties -join [Environment]::NewLine)
    $written = @(Get-Content -LiteralPath $file | Where-Object { $_ -ne '' })
    if (@($written | Where-Object { $_ -eq "sdk.dir=$sdkDir" }).Count -ne 1 -or @($written | Where-Object { $_ -eq "cmake.dir=$cmakeDir" }).Count -ne 1 -or @($written | Where-Object { $_ -match '^\s*(sdk\.dir|cmake\.dir)\s*=.*\s+(sdk\.dir|cmake\.dir)\s*=' }).Count) { throw 'android/local.properties is invalid after write.' }
    if ((& git check-ignore android/local.properties) -notmatch 'local\.properties') { throw 'android/local.properties must remain ignored by Git.' }
}

function Assert-FirebasePackage([string]$file, [string]$package) {
    if (!(Test-Path -LiteralPath $file)) { throw "Firebase configuration for $package missing: $file" }
    $firebase = Get-Content -Raw -LiteralPath $file | ConvertFrom-Json
    if (!($firebase.client | Where-Object { $_.client_info.android_client_info.package_name -eq $package })) {
        throw "Firebase configuration has no Android client for ${package}: $file"
    }
}

function Assert-ProductionExpoConfig {
    $nodeScript = @'
const { spawnSync } = require('node:child_process');
const result = spawnSync(process.execPath, ['node_modules/expo/bin/cli', 'config', '--json'], { encoding: 'utf8' });
if (result.status !== 0) {
  if (result.stderr) process.stderr.write(result.stderr);
  process.exit(result.status || 1);
}
let config;
try { config = JSON.parse(result.stdout); }
catch { console.error('Expo config preflight returned invalid JSON.'); process.exit(1); }
if (config.android?.package !== 'com.guilhermedesales.nononto') {
  console.error('android.package must be com.guilhermedesales.nononto for productionRelease.'); process.exit(1);
}
if (config.extra?.radarRemoteEnabled !== true || config.extra?.radarStandalone !== true) {
  console.error('Production Expo config did not enable standalone Radar.'); process.exit(1);
}
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(config.extra?.eas?.projectId || '')) {
  console.error('extra.eas.projectId must contain the UUID of the existing Expo project.'); process.exit(1);
}
console.log('Production Expo config validated: package, Radar, and Expo projectId.');
'@
    & node -e $nodeScript
    if ($LASTEXITCODE -ne 0) { throw 'Production Expo config preflight failed before Gradle.' }
}

function Get-LocalApkDestination([string]$label) {
    $branch = (& git branch --show-current).Trim()
    $commit = (& git rev-parse --short=12 HEAD).Trim()
    $dirty = @(& git status --porcelain).Count -gt 0
    if (!$branch) { $branch = 'detached' }
    $branch = $branch -replace '[^a-zA-Z0-9._-]', '-'
    $suffix = if ($dirty) { '-dirty' } else { '' }
    New-Item '.local-apks' -ItemType Directory -Force | Out-Null
    return ".local-apks/NoPonto-$label-$branch-$commit$suffix-$(Get-Date -Format 'yyyyMMdd-HHmmss-fff').apk"
}
