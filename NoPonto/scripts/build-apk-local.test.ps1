$ErrorActionPreference = 'Stop'
$script = Join-Path $PSScriptRoot 'build-apk-local.ps1'
$parseErrors = $null
[System.Management.Automation.Language.Parser]::ParseFile($script, [ref]$null, [ref]$parseErrors) | Out-Null
if ($parseErrors) { throw ($parseErrors | Out-String) }
Write-Host 'PASS sintaxe PowerShell'
$source = Get-Content $script -Raw
if ($source -match "android \{ externalNativeBuild \{ cmake \{ version") { throw 'Versao CMake nao deve ser injetada em build.gradle.' }
if ($source -notmatch 'cmake\.dir=\$cmakeDir' -or $source -notmatch "Remove-Item 'android/app/\.cxx'") { throw 'Selecao/invalidação de CMake ausente.' }
$ignore = (& git check-ignore android/local.properties)
if ($LASTEXITCODE -ne 0) { throw 'android/local.properties deve continuar ignorado pelo Git.' }
Write-Host 'PASS cmake.dir dinamico e local.properties ignorado'
$ast = [System.Management.Automation.Language.Parser]::ParseFile($script, [ref]$null, [ref]$null)
$writerAst = $ast.Find({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Write-LocalProperties' }, $true)
if (!$writerAst) { throw 'Rotina de gravação não encontrada.' }
. ([scriptblock]::Create($writerAst.Extent.Text))
$sdkDir = (Join-Path $env:LOCALAPPDATA 'Android/Sdk').Replace('\','/')
$cmakeDir = (Join-Path $sdkDir 'cmake/3.31.6').Replace('\','/')
if (!(Test-Path (Join-Path $sdkDir 'platform-tools')) -or !(Test-Path (Join-Path $cmakeDir 'bin/cmake.exe'))) { throw 'Caminhos reais de SDK/CMake ausentes para regressão.' }
$tempProperties = Join-Path $env:TEMP ('noponto-local-properties-' + [guid]::NewGuid() + '.properties')
try {
    foreach ($initial in @("sdk.dir=$sdkDir", '', "other.setting=kept`nonly.flag=yes`nsdk.dir=$sdkDir", "sdk.dir=${sdkDir}cmake.dir=$cmakeDir")) {
        Set-Content -LiteralPath $tempProperties -Value $initial -NoNewline
        Write-LocalProperties $tempProperties $sdkDir $cmakeDir
        $first = Get-Content -LiteralPath $tempProperties -Raw
        Write-LocalProperties $tempProperties $sdkDir $cmakeDir
        $second = Get-Content -LiteralPath $tempProperties -Raw
        $lines = @(Get-Content -LiteralPath $tempProperties | Where-Object { $_ -ne '' })
        if ($first.TrimEnd("`r", "`n") -ne $second.TrimEnd("`r", "`n") -or @($lines | Where-Object { $_ -eq "sdk.dir=$sdkDir" }).Count -ne 1 -or @($lines | Where-Object { $_ -eq "cmake.dir=$cmakeDir" }).Count -ne 1 -or @($lines | Where-Object { $_ -match '^\s*(sdk\.dir|cmake\.dir)\s*=.*\s+(sdk\.dir|cmake\.dir)\s*=' }).Count -gt 0) { throw 'Gravacao nao foi separada, preservada e idempotente.' }
        if ($initial -like 'other.setting*' -and (!$lines.Contains('other.setting=kept') -or !$lines.Contains('only.flag=yes'))) { throw 'Outras propriedades nao foram preservadas.' }
    }
} finally { Remove-Item -LiteralPath $tempProperties -Force -ErrorAction SilentlyContinue }
Write-Host 'PASS local.properties separado, preservado e idempotente'
$root = Split-Path $PSScriptRoot -Parent
$files = @('package.json','pnpm-lock.yaml','app.json','app.config.js','android/app/build.gradle','android/gradle.properties') |
    ForEach-Object { Join-Path $root $_ } | Where-Object { Test-Path $_ }
$before = @($files | ForEach-Object { (Get-FileHash $_).Hash }) -join ','
$envBefore = $env:APP_VARIANT
& $script -CheckOnly
if ((@($files | ForEach-Object { (Get-FileHash $_).Hash }) -join ',') -ne $before -or $env:APP_VARIANT -ne $envBefore) {
    throw 'Preflight alterou arquivos do projeto ou ambiente.'
}
Write-Host 'PASS preflight sem modificar arquivos/configuracao de ambiente'
$failed = $false
try { & $script -CheckOnly -Keystore (Join-Path $root 'nao-existe-4a.keystore') }
catch {
    if ($_.Exception.Message -notlike 'Arquivo local necessario:*nao-existe-4a.keystore') { throw }
    $failed = $true
}
if (!$failed) { throw 'Credencial ausente deveria bloquear o build.' }
Write-Host 'PASS credencial ausente bloqueada antes do prebuild/build'
