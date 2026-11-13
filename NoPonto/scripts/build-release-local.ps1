
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent

Push-Location $root
$saved = @{}

try {
    . (Join-Path $PSScriptRoot 'android-local-build-common.ps1')

    $native = Get-AndroidLocalEnvironment

    Assert-FirebasePackage `
        'android/app/src/production/google-services.json' `
        'com.guilhermedesales.nononto'

    # Preservar variaveis originais da sessao.
    foreach ($name in @(
        'NOPONTO_PRODUCTION_KEYSTORE',
        'NOPONTO_PRODUCTION_STORE_PASSWORD',
        'NOPONTO_PRODUCTION_KEY_ALIAS',
        'NOPONTO_PRODUCTION_KEY_PASSWORD',
        'APP_VARIANT',
        'NODE_ENV',
        'EAS_BUILD',
        'EXPO_PUBLIC_RADAR_REMOTE_ENABLED',
        'NOPONTO_PRODUCTION_GOOGLE_SERVICES_FILE',
        'EXPO_PUBLIC_API_BASE_URL',
        'EXPO_PUBLIC_RADAR_API_BASE_URL',
        'EXPO_PUBLIC_GPS_HUB_URL',
        'EXPO_PUBLIC_GPS_HUB_ROUTE'
    )) {
        $saved[$name] = [Environment]::GetEnvironmentVariable(
            $name, 'Process'
        )
    }

    # ------------------------------------------
    # 1. Carregar credenciais automaticamente
    # ------------------------------------------

    $credFile = Join-Path $root 'credentials.json'

    if (!(Test-Path -LiteralPath $credFile)) {
        throw 'credentials.json nao encontrado na raiz do frontend.'
    }

    $cred = Get-Content -Raw -LiteralPath $credFile |
        ConvertFrom-Json

    $key = $cred.android.keystore

    if (!$key -or !$key.keystorePath) {
        throw 'Keystore invalida no credentials.json.'
    }

    $keystorePath = [string]$key.keystorePath

    if (![System.IO.Path]::IsPathRooted($keystorePath)) {
        $keystorePath = Join-Path $root $keystorePath
    }

    if (!(Test-Path -LiteralPath $keystorePath)) {
        throw "Keystore de producao nao encontrada: $keystorePath"
    }

    $env:NOPONTO_PRODUCTION_KEYSTORE = (
        Resolve-Path -LiteralPath $keystorePath
    ).Path

    $env:NOPONTO_PRODUCTION_STORE_PASSWORD = $key.keystorePassword
    $env:NOPONTO_PRODUCTION_KEY_ALIAS = $key.keyAlias
    $env:NOPONTO_PRODUCTION_KEY_PASSWORD = $key.keyPassword

    foreach ($name in @(
        'NOPONTO_PRODUCTION_STORE_PASSWORD',
        'NOPONTO_PRODUCTION_KEY_ALIAS',
        'NOPONTO_PRODUCTION_KEY_PASSWORD'
    )) {
        if (![Environment]::GetEnvironmentVariable($name, 'Process')) {
            throw "Credencial de assinatura incompleta: $name"
        }
    }

    Write-Host '[OK] Credenciais de producao carregadas.' -ForegroundColor Green

    # ------------------------------------------
    # 2. Configurar URLs de producao
    # ------------------------------------------

    $envFile = Join-Path $root '.env'

    if (!(Test-Path -LiteralPath $envFile)) {
        throw 'Arquivo .env nao encontrado.'
    }

    # Ler apenas a URL principal do backend.
    # As demais URLs sao calculadas automaticamente.
    $linha = Get-Content -LiteralPath $envFile |
        Where-Object {
            $_ -match '^\s*EXPO_PUBLIC_API_BASE_URL\s*='
        } |
        Select-Object -Last 1

    if (!$linha) {
        throw 'EXPO_PUBLIC_API_BASE_URL nao encontrada no .env.'
    }

    $origem = ($linha -split '=', 2)[1].Trim()
    $origem = $origem.Trim([char[]]@('"', "'")).TrimEnd('/')

    $uri = $null

    $urlValida = [System.Uri]::TryCreate(
        $origem,
        [System.UriKind]::Absolute,
        [ref]$uri
    )

    if (
        !$urlValida -or
        $uri.Scheme -ne 'https' -or
        $uri.UserInfo -or
        $uri.AbsolutePath -ne '/' -or
        $uri.Query -or
        $uri.Fragment -or
        $uri.Host -in @('localhost', '127.0.0.1', '::1')
    ) {
        throw 'EXPO_PUBLIC_API_BASE_URL deve ser uma origem HTTPS publica valida.'
    }

    $origem = $uri.GetLeftPart([System.UriPartial]::Authority)

    $env:EXPO_PUBLIC_API_BASE_URL = $origem
    $env:EXPO_PUBLIC_RADAR_API_BASE_URL = $origem
    $env:EXPO_PUBLIC_GPS_HUB_URL = (
        $origem.Replace('https:', 'wss:') + '/hub/gps'
    )
    $env:EXPO_PUBLIC_GPS_HUB_ROUTE = '/hub/gps'

    Write-Host '[OK] URLs de producao configuradas.' -ForegroundColor Green
    Write-Host "Backend: $origem"

    # ------------------------------------------
    # 3. Preparar variante Release
    # ------------------------------------------

    $env:APP_VARIANT = 'production'
    $env:NODE_ENV = 'production'
    $env:EXPO_PUBLIC_RADAR_REMOTE_ENABLED = 'true'

    $env:NOPONTO_PRODUCTION_GOOGLE_SERVICES_FILE = (
        Resolve-Path 'android/app/src/production/google-services.json'
    ).Path

    Remove-Item Env:EAS_BUILD -ErrorAction SilentlyContinue

    # ------------------------------------------
    # 4. Validar configuracao Expo
    # ------------------------------------------

    Write-Host ''
    Write-Host 'Validando configuracao de producao...' -ForegroundColor Cyan

    Assert-ProductionExpoConfig

    # ------------------------------------------
    # 5. Preparar ambiente Android
    # ------------------------------------------

    Set-AndroidLocalBuildProperties $native.Sdk $native.CMake

    # ------------------------------------------
    # 6. Compilar APK Release
    # ------------------------------------------

    Write-Host ''
    Write-Host 'Iniciando build Android ProductionRelease...' -ForegroundColor Cyan

    Push-Location android

    try {
        & ./gradlew.bat :app:assembleProductionRelease --build-cache

        if ($LASTEXITCODE -ne 0) {
            throw 'Gradle assembleProductionRelease failed.'
        }
    }
    finally {
        Pop-Location
    }

    # ------------------------------------------
    # 7. Verificar APK produzido
    # ------------------------------------------

    $apk = 'android/app/build/outputs/apk/production/release/app-production-release.apk'

    if (
        !(Test-Path -LiteralPath $apk) -or
        (Get-Item -LiteralPath $apk).Length -eq 0
    ) {
        throw 'Production APK was not produced.'
    }

    # Verificar conteudo standalone.
    Add-Type -AssemblyName System.IO.Compression.FileSystem

    $zip = [IO.Compression.ZipFile]::OpenRead(
        (Resolve-Path -LiteralPath $apk).Path
    )

    try {
        foreach ($entry in @(
            'AndroidManifest.xml',
            'classes.dex',
            'assets/index.android.bundle'
        )) {
            if (!$zip.GetEntry($entry)) {
                throw "Production APK missing standalone content: $entry"
            }
        }
    }
    finally {
        $zip.Dispose()
    }

    # Verificar assinatura Android.
    & (Join-Path $native.Sdk 'build-tools/36.0.0/apksigner.bat') verify $apk

    if ($LASTEXITCODE -ne 0) {
        throw 'Production APK signature validation failed.'
    }

    # ------------------------------------------
    # 8. Salvar APK na pasta .local-apks
    # ------------------------------------------

    $destination = Get-LocalApkDestination 'Release'

    Copy-Item -LiteralPath $apk -Destination $destination

    Write-Host ''
    Write-Host '========================================' -ForegroundColor Green
    Write-Host '       BUILD RELEASE CONCLUIDO!' -ForegroundColor Green
    Write-Host '========================================' -ForegroundColor Green
    Write-Host ''
    Write-Host "APK: $root/$destination" -ForegroundColor Cyan
}
finally {
    # Restaurar as variaveis anteriores da sessao.
    foreach ($name in $saved.Keys) {
        if ($null -eq $saved[$name]) {
            Remove-Item "Env:$name" -ErrorAction SilentlyContinue
        }
        else {
            [Environment]::SetEnvironmentVariable(
                $name,
                $saved[$name],
                'Process'
            )
        }
    }

    Pop-Location
}
