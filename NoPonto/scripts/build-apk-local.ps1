[CmdletBinding()]
param(
    [switch]$CheckOnly,
    [switch]$RegenerateNative,
    [string]$GoogleServicesFile = "$env:LOCALAPPDATA/NoPonto/build/google-services.json",
    [string]$Keystore = "$env:LOCALAPPDATA/NoPonto/build/debug.keystore"
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$root = Split-Path $PSScriptRoot -Parent
function Write-LocalProperties($localProperties, $sdkDir, $cmakeDir) {
    $properties = if (Test-Path $localProperties) { @(Get-Content -LiteralPath $localProperties | Where-Object { $_ -notmatch '^\s*(sdk\.dir|cmake\.dir)\s*=' }) } else { @() }
    $properties = @($properties)
    $properties += "sdk.dir=$sdkDir"
    $properties += "cmake.dir=$cmakeDir"
    Set-Content -LiteralPath $localProperties -Value ($properties -join [Environment]::NewLine)
    $written = @(Get-Content -LiteralPath $localProperties | Where-Object { $_ -ne '' })
    if (@($written | Where-Object { $_ -eq "sdk.dir=$sdkDir" }).Count -ne 1 -or @($written | Where-Object { $_ -eq "cmake.dir=$cmakeDir" }).Count -ne 1 -or @($written | Where-Object { $_ -match '^\s*(sdk\.dir|cmake\.dir)\s*=.*\s+(sdk\.dir|cmake\.dir)\s*=' }).Count) { throw 'android/local.properties invalido apos gravacao.' }
}
Push-Location $root
$savedEnv = @{}
try {
    foreach ($name in @('APP_VARIANT','NODE_ENV','EXPO_NO_DOTENV','NOPONTO_DEV_GOOGLE_SERVICES_FILE','ANDROID_HOME','PATH') + @('EXPO_PUBLIC_RADAR_REMOTE_ENABLED','EXPO_PUBLIC_RADAR_API_BASE_URL','EXPO_PUBLIC_API_BASE_URL','EXPO_PUBLIC_GPS_HUB_URL','EXPO_PUBLIC_GPS_HUB_ROUTE')) {
        $savedEnv[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
    }
    foreach ($command in @('git','node','pnpm')) { Get-Command $command -ErrorAction Stop | Out-Null }
    $branch = (& git branch --show-current).Trim()
    if ($LASTEXITCODE) { throw 'Nao foi possivel consultar Git.' }
    if (!$branch) { $branch = 'detached' }
    $commit = (& git rev-parse --short=12 HEAD).Trim()
    $dirty = @(& git status --porcelain).Count -gt 0
    Write-Host "Branch: $branch | commit: $commit | alteracoes locais: $dirty"
    if ($dirty) { Write-Warning 'O APK incluira alteracoes locais; nao representa apenas o commit.' }
    if (!(Test-Path node_modules/expo/bin/cli)) { throw 'Dependencias ausentes. Este script nao instala dependencias.' }
    if (!$env:JAVA_HOME -or !(Test-Path "$env:JAVA_HOME/bin/javac.exe")) { throw 'Configure JAVA_HOME para um JDK 17 ou superior.' }
    $javaVersion = (& $env:ComSpec /d /c "`"$env:JAVA_HOME\bin\java.exe`" -version 2>&1" | Out-String)
    if ($javaVersion -notmatch 'version "(\d+)' -or [int]$Matches[1] -lt 17) { throw 'JDK 17 ou superior necessario.' }
    $env:PATH = "$env:JAVA_HOME/bin;$env:PATH"
    $sdk = $env:ANDROID_HOME
    if (!$sdk) { $sdk = $env:ANDROID_SDK_ROOT }
    if (!$sdk) { $sdk = "$env:LOCALAPPDATA/Android/Sdk" }
    $env:ANDROID_HOME = $sdk
    $cmake = Join-Path $sdk 'cmake/3.31.6'
    if (!(Test-Path "$cmake/bin/cmake.exe") -or !(Test-Path "$cmake/bin/ninja.exe")) { throw "CMake 3.31.6/Ninja ausentes em $cmake" }
    $cmakeVersion = (& "$cmake/bin/cmake.exe" --version | Select-Object -First 1)
    if ($cmakeVersion -notmatch '3\.31\.6') { throw "Versao CMake inesperada: $cmakeVersion" }
    $ninjaVersion = (& "$cmake/bin/ninja.exe" --version).Trim()
    if ($ninjaVersion -notmatch '^(\d+)\.(\d+)' -or [int]$Matches[1] -lt 1 -or ([int]$Matches[1] -eq 1 -and [int]$Matches[2] -lt 12)) { throw "Ninja 1.12+ necessario; encontrado: $ninjaVersion" }
    foreach ($path in @('platforms/android-36/android.jar','build-tools/36.0.0/apksigner.bat','ndk/27.1.12297006/source.properties')) {
        if (!(Test-Path (Join-Path $sdk $path))) { throw "SDK incompleto: $path em $sdk" }
    }
    foreach ($file in @($GoogleServicesFile,$Keystore)) { if (!(Test-Path -LiteralPath $file)) { throw "Arquivo local necessario: $file" } }
    $GoogleServicesFile = (Resolve-Path -LiteralPath $GoogleServicesFile).Path
    $Keystore = (Resolve-Path -LiteralPath $Keystore).Path
    $firebase = Get-Content -Raw -LiteralPath $GoogleServicesFile | ConvertFrom-Json
    if ($firebase.project_info.project_id -ne 'noponto-2d820' -or !($firebase.client | Where-Object { $_.client_info.android_client_info.package_name -eq 'com.guilhermedesales.nononto.dev' })) {
        throw 'Firebase incompativel com o pacote Radar .dev.'
    }
    # Usa o perfil versionado, sem herdar destinos antigos do terminal ou dotenv.
    $profile = (Get-Content eas.json -Raw | ConvertFrom-Json).build.radar.env
    foreach ($prop in $profile.PSObject.Properties) { [Environment]::SetEnvironmentVariable($prop.Name, [string]$prop.Value, 'Process') }
    $env:NODE_ENV = 'production'
    $env:EXPO_NO_DOTENV = '1'
    $env:NOPONTO_DEV_GOOGLE_SERVICES_FILE = $GoogleServicesFile
    $configJson = & node node_modules/expo/bin/cli config --type prebuild --json
    if ($LASTEXITCODE) { throw 'Falha ao avaliar configuracao Expo.' }
    $config = ($configJson -join "`n") | ConvertFrom-Json
    if ($config.android.package -ne 'com.guilhermedesales.nononto.dev' -or !$config.extra.nativeRadarV1Enabled) { throw 'Configuracao Radar/Firebase incompleta.' }
    # Inclui arquivos de plugins/modulos/assets e configuracao resolvida, mas nunca caches.
    $inputs = @('package.json','pnpm-lock.yaml','app.json','app.config.js','eas.json')
    $inputs += @(Get-ChildItem plugins,modules,assets -File -Recurse | Where-Object { $_.FullName -notmatch '[\\/](build|\.gradle|node_modules|\.cxx)[\\/]' } | ForEach-Object { $_.FullName })
    $hashes = @($inputs | Sort-Object | ForEach-Object { (Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash })
    $hashes += ($config | ConvertTo-Json -Depth 100 -Compress)
    $hashes += (Get-FileHash -LiteralPath $GoogleServicesFile).Hash
    $sha = [Security.Cryptography.SHA256]::Create()
    try { $fingerprint = [BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes(($hashes -join "`n")))).Replace('-','') } finally { $sha.Dispose() }
    $statePath = 'android/.noponto-local-build.json'
    $state = if (Test-Path $statePath) { Get-Content $statePath -Raw | ConvertFrom-Json } else { $null }
    $needsNative = !(Test-Path android/gradlew.bat) -or !$state -or $state.fingerprint -ne $fingerprint
    Write-Host "Java: $env:JAVA_HOME | SDK: $sdk"
    $cache = if ($env:GRADLE_USER_HOME) { $env:GRADLE_USER_HOME } else { "$env:USERPROFILE/.gradle" }
    Write-Host "Cache Gradle: $cache | regeneracao necessaria: $needsNative"
    if ($CheckOnly) {
        Write-Host "CMake: $cmakeVersion | Ninja: $ninjaVersion"
        if ($needsNative -and (Test-Path android)) { Write-Warning 'android/ existente sem estado compativel. Proximo build requer -RegenerateNative; pasta anterior sera preservada.' }
        Write-Host 'Preflight concluido. Nenhum prebuild ou build executado.'
        return
    }
    if ($needsNative -and (Test-Path android) -and !$RegenerateNative) { throw 'Configuracao nativa mudou ou android/ nao gerenciado. Revise e use -RegenerateNative para preservar a pasta anterior e gerar outra.' }
    New-Item .local-apks -ItemType Directory -Force | Out-Null
    if ($RegenerateNative -and (Test-Path android)) {
        $backup = Join-Path $root ('.local-apks/android-backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff'))
        Write-Warning "Regeneracao explicita: android/ sera movido para $backup. Nenhum backup sera apagado."
        $nativePath = (Resolve-Path android).Path
        if ($nativePath -ne (Join-Path $root 'android')) { throw 'Caminho android inesperado.' }
        Move-Item -LiteralPath $nativePath -Destination $backup
        $needsNative = $true
    }
    if ($needsNative) {
        $packageBytes = [IO.File]::ReadAllBytes((Join-Path $root 'package.json'))
        try {
            & node node_modules/expo/bin/cli prebuild --platform android --no-install
            if ($LASTEXITCODE) { throw 'Expo Prebuild falhou; backup anterior preservado.' }
        } finally {
            # Expo pode ajustar scripts do package.json mesmo com --no-install.
            [IO.File]::WriteAllBytes((Join-Path $root 'package.json'), $packageBytes)
        }
        @{ fingerprint = $fingerprint } | ConvertTo-Json | Set-Content $statePath
    }
    $gradle = Get-Content android/app/build.gradle -Raw
    if ($gradle -notmatch 'applicationId [''"]com\.guilhermedesales\.nononto\.dev[''"]' -or $gradle -notmatch 'development\s*\{' -or $gradle -notmatch 'signingConfig signingConfigs.debug' -or $gradle -notmatch 'export:embed') {
        throw 'Gradle inesperado: revise flavor development, pacote .dev, assinatura debug e bundle standalone.'
    }
    Copy-Item -LiteralPath $Keystore -Destination android/app/debug.keystore -Force
    if ((Get-FileHash $Keystore).Hash -ne (Get-FileHash android/app/debug.keystore).Hash) { throw 'Assinatura local nao preservada.' }
    $localProperties = 'android/local.properties'
    $sdkDir = $sdk.Replace('\','/')
    $cmakeDir = $cmake.Replace('\','/')
    $previousCmake = if (Test-Path $localProperties) { (Get-Content $localProperties | Where-Object { $_ -match '^\s*cmake\.dir\s*=' } | Select-Object -Last 1) -replace '^\s*cmake\.dir\s*=\s*','' } else { $null }
    if ((Test-Path 'android/app/.cxx') -and (!$previousCmake -or $previousCmake.TrimEnd('/') -ne $cmakeDir.TrimEnd('/'))) { Remove-Item 'android/app/.cxx' -Recurse -Force }
    Write-LocalProperties $localProperties $sdkDir $cmakeDir
    $output = 'android/app/build/outputs/apk/development/release/app-development-release.apk'
    # Impede que um APK antigo seja aceito apos falha do Gradle.
    if (Test-Path $output) { Remove-Item -LiteralPath $output }
    Push-Location android
    try {
        & ./gradlew.bat :app:assembleDevelopmentRelease --build-cache
        if ($LASTEXITCODE) { throw 'Gradle assembleDevelopmentRelease falhou.' }
    } finally { Pop-Location }
    if (!(Test-Path $output) -or (Get-Item $output).Length -eq 0) { throw 'Build nao produziu APK.' }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [IO.Compression.ZipFile]::OpenRead((Resolve-Path $output).Path)
    try {
        foreach ($entry in @('AndroidManifest.xml','classes.dex','assets/index.android.bundle')) {
            if (!$zip.GetEntry($entry)) { throw "APK invalido/sem bundle standalone: $entry" }
        }
    } finally { $zip.Dispose() }
    & "$sdk/build-tools/36.0.0/apksigner.bat" verify $output
    if ($LASTEXITCODE) { throw 'Assinatura do APK invalida.' }
    $label = $branch -replace '[^a-zA-Z0-9._-]', '-'
    $suffix = if ($dirty) { '-dirty' } else { '' }
    $destination = ".local-apks/NoPonto-$label-$commit$suffix-$(Get-Date -Format 'yyyyMMdd-HHmmss-fff').apk"
    Copy-Item -LiteralPath $output -Destination $destination
    Write-Host "APK: $root/$destination"
} finally {
    foreach ($name in $savedEnv.Keys) {
        if ($null -eq $savedEnv[$name]) { Remove-Item "Env:$name" -ErrorAction SilentlyContinue }
        else { [Environment]::SetEnvironmentVariable($name, $savedEnv[$name], 'Process') }
    }
    Pop-Location
}
