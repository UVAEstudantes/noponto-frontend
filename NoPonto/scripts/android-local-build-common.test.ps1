$ErrorActionPreference = 'Stop'
$helper = Join-Path $PSScriptRoot 'android-local-build-common.ps1'
$tokens = $null
$errors = $null
[System.Management.Automation.Language.Parser]::ParseFile($helper, [ref]$tokens, [ref]$errors) | Out-Null
if ($errors) { throw ($errors | Out-String) }
$tempRoot = (Resolve-Path $env:TEMP).Path.TrimEnd('\') + '\'
$temp = Join-Path $tempRoot ('noponto-android-local-' + [guid]::NewGuid())
New-Item -ItemType Directory -Path $temp | Out-Null
try {
    Push-Location $temp
    try {
        & git init --quiet
        Set-Content .gitignore 'android/local.properties'
        New-Item -ItemType Directory -Force android/app/.cxx/cache | Out-Null
        Set-Content android/local.properties @('sdk.dir=C:/Android/Sdk', 'cmake.dir=C:/Android/Sdk/cmake/3.22.1', 'other.setting=kept')
        . $helper
        Set-AndroidLocalBuildProperties 'C:\Android\Sdk' 'C:\Android\Sdk\cmake\3.31.6'
        if (Test-Path android/app/.cxx) { throw 'CMake cache was not invalidated after a version change.' }
        $lines = @(Get-Content android/local.properties | Where-Object { $_ -ne '' })
        if (!$lines.Contains('other.setting=kept') -or !$lines.Contains('sdk.dir=C:/Android/Sdk') -or !$lines.Contains('cmake.dir=C:/Android/Sdk/cmake/3.31.6')) {
            throw 'local.properties did not preserve or separate its properties.'
        }
        New-Item -ItemType Directory -Force android/app/.cxx/cache | Out-Null
        Set-AndroidLocalBuildProperties 'C:/Android/Sdk' 'C:/Android/Sdk/cmake/3.31.6'
        if (!(Test-Path android/app/.cxx)) { throw '.cxx was deleted even though CMake did not change.' }
        Write-Host 'PASS local.properties preserves properties; .cxx clears only on CMake change'
    } finally { Pop-Location }

    $firebase = Join-Path $temp 'google-services-production.json'
    $firebaseJson = '{"project_info":{"project_id":"noponto-2d820","project_number":"123"},"client":[{"client_info":{"android_client_info":{"package_name":"com.guilhermedesales.nononto"},"mobilesdk_app_id":"synthetic"}}]}'
    [IO.File]::WriteAllText($firebase, $firebaseJson, [Text.UTF8Encoding]::new($false))
    $envNames = @('APP_VARIANT', 'NODE_ENV', 'EAS_BUILD', 'EXPO_PUBLIC_RADAR_REMOTE_ENABLED', 'EXPO_PUBLIC_RADAR_API_BASE_URL',
        'EXPO_PUBLIC_API_BASE_URL', 'EXPO_PUBLIC_GPS_HUB_URL', 'NOPONTO_PRODUCTION_GOOGLE_SERVICES_FILE')
    $savedEnv = @{}
    foreach ($name in $envNames) { $savedEnv[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
    try {
        $env:APP_VARIANT = 'production'
        $env:NODE_ENV = 'production'
        Remove-Item Env:EAS_BUILD -ErrorAction SilentlyContinue
        $env:EXPO_PUBLIC_RADAR_REMOTE_ENABLED = 'true'
        $env:EXPO_PUBLIC_RADAR_API_BASE_URL = 'https://api.example.test'
        $env:EXPO_PUBLIC_API_BASE_URL = 'https://api.example.test'
        $env:EXPO_PUBLIC_GPS_HUB_URL = 'wss://api.example.test/hub/gps'
        $env:NOPONTO_PRODUCTION_GOOGLE_SERVICES_FILE = $firebase
        Push-Location (Split-Path $PSScriptRoot -Parent)
        try {
            . $helper
            Assert-ProductionExpoConfig
        } finally { Pop-Location }
        Write-Host 'PASS production Expo preflight inherits PowerShell environment in Node'
    } finally {
        foreach ($name in $envNames) {
            if ($null -eq $savedEnv[$name]) { Remove-Item "Env:$name" -ErrorAction SilentlyContinue }
            else { [Environment]::SetEnvironmentVariable($name, $savedEnv[$name], 'Process') }
        }
    }
} finally {
    $resolvedTemp = [IO.Path]::GetFullPath($temp)
    if (!$resolvedTemp.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Temporary test path escaped TEMP.' }
    Remove-Item -LiteralPath $resolvedTemp -Recurse -Force -ErrorAction SilentlyContinue
}
