[CmdletBinding()]
param([switch]$Install)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Push-Location $root
$variantBefore = $env:APP_VARIANT
try {
    . (Join-Path $PSScriptRoot 'android-local-build-common.ps1')
    $env:APP_VARIANT = 'development'
    $native = Get-AndroidLocalEnvironment
    if (!(Test-Path android/app/debug.keystore)) { throw 'Existing android/app/debug.keystore is required to preserve the Dev Client signing identity.' }
    Assert-FirebasePackage 'android/app/google-services.json' 'com.guilhermedesales.nononto.dev'
    if ($Install) { Get-Command adb -ErrorAction Stop | Out-Null }
    Set-AndroidLocalBuildProperties $native.Sdk $native.CMake
    Push-Location android
    try {
        & ./gradlew.bat :app:assembleDevelopmentDebug --build-cache
        if ($LASTEXITCODE) { throw 'Gradle assembleDevelopmentDebug failed.' }
    } finally { Pop-Location }
    $apk = 'android/app/build/outputs/apk/development/debug/app-development-debug.apk'
    if (!(Test-Path $apk) -or (Get-Item $apk).Length -eq 0) { throw 'Development APK was not produced.' }
    $destination = Get-LocalApkDestination 'Dev'
    Copy-Item -LiteralPath $apk -Destination $destination
    Write-Host "APK Dev: $root/$destination"
    if ($Install) {
        & adb install -r $destination
        if ($LASTEXITCODE) { throw 'ADB install failed.' }
    }
} finally {
    if ($null -eq $variantBefore) { Remove-Item Env:APP_VARIANT -ErrorAction SilentlyContinue }
    else { $env:APP_VARIANT = $variantBefore }
    Pop-Location
}
