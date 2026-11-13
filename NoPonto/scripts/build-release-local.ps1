[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Push-Location $root
$saved = @{}
try {
    . (Join-Path $PSScriptRoot 'android-local-build-common.ps1')
    $native = Get-AndroidLocalEnvironment
    Assert-FirebasePackage 'android/app/src/production/google-services.json' 'com.guilhermedesales.nononto'
    foreach ($name in @('NOPONTO_PRODUCTION_KEYSTORE', 'NOPONTO_PRODUCTION_STORE_PASSWORD', 'NOPONTO_PRODUCTION_KEY_ALIAS', 'NOPONTO_PRODUCTION_KEY_PASSWORD', 'APP_VARIANT', 'NODE_ENV', 'EAS_BUILD', 'EXPO_PUBLIC_RADAR_REMOTE_ENABLED', 'NOPONTO_PRODUCTION_GOOGLE_SERVICES_FILE')) {
        $saved[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
    }
    if (!$env:NOPONTO_PRODUCTION_KEYSTORE -or !(Test-Path -LiteralPath $env:NOPONTO_PRODUCTION_KEYSTORE)) { throw 'Production keystore is missing. Set NOPONTO_PRODUCTION_KEYSTORE to the existing release key file.' }
    $env:NOPONTO_PRODUCTION_KEYSTORE = (Resolve-Path -LiteralPath $env:NOPONTO_PRODUCTION_KEYSTORE).Path
    foreach ($name in @('NOPONTO_PRODUCTION_STORE_PASSWORD', 'NOPONTO_PRODUCTION_KEY_ALIAS', 'NOPONTO_PRODUCTION_KEY_PASSWORD')) {
        if (![Environment]::GetEnvironmentVariable($name, 'Process')) { throw "Production signing is incomplete: set $name." }
    }
    $env:APP_VARIANT = 'production'
    $env:NODE_ENV = 'production'
    $env:EXPO_PUBLIC_RADAR_REMOTE_ENABLED = 'true'
    $env:NOPONTO_PRODUCTION_GOOGLE_SERVICES_FILE = (Resolve-Path 'android/app/src/production/google-services.json').Path
    Remove-Item Env:EAS_BUILD -ErrorAction SilentlyContinue
    Assert-ProductionExpoConfig
    Set-AndroidLocalBuildProperties $native.Sdk $native.CMake
    Push-Location android
    try {
        & ./gradlew.bat :app:assembleProductionRelease --build-cache
        if ($LASTEXITCODE) { throw 'Gradle assembleProductionRelease failed.' }
    } finally { Pop-Location }
    $apk = 'android/app/build/outputs/apk/production/release/app-production-release.apk'
    if (!(Test-Path $apk) -or (Get-Item $apk).Length -eq 0) { throw 'Production APK was not produced.' }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [IO.Compression.ZipFile]::OpenRead((Resolve-Path $apk).Path)
    try {
        foreach ($entry in @('AndroidManifest.xml', 'classes.dex', 'assets/index.android.bundle')) {
            if (!$zip.GetEntry($entry)) { throw "Production APK missing standalone content: $entry" }
        }
    } finally { $zip.Dispose() }
    & (Join-Path $native.Sdk 'build-tools/36.0.0/apksigner.bat') verify $apk
    if ($LASTEXITCODE) { throw 'Production APK signature validation failed.' }
    $destination = Get-LocalApkDestination 'Release'
    Copy-Item -LiteralPath $apk -Destination $destination
    Write-Host "APK Release: $root/$destination"
} finally {
    foreach ($name in $saved.Keys) {
        if ($null -eq $saved[$name]) { Remove-Item "Env:$name" -ErrorAction SilentlyContinue }
        else { [Environment]::SetEnvironmentVariable($name, $saved[$name], 'Process') }
    }
    Pop-Location
}
