# Builds Android locais no Windows

## Variantes Dev e produção

Os scripts locais usam os flavors Gradle persistidos por
`plugins/withLocalAndroidVariants.js`:

- `developmentDebug`: `com.guilhermedesales.nononto.dev`, nome **No Ponto Dev**,
  Dev Client. Usa `android/app/google-services.json` e a chave debug já existente.
- `productionRelease`: `com.guilhermedesales.nononto`, nome **No Ponto**,
  JavaScript embutido e sem dependência do Metro. Requer o Firebase de produção
  em `android/app/src/production/google-services.json` e uma chave de release
  existente e compatível. A chave debug nunca é usada pelo script de release.

```powershell
# Na raiz noponto-frontend/NoPonto:
.\scripts\build-dev-local.ps1
.\scripts\build-dev-local.ps1 -Install
.\scripts\build-release-local.ps1
```

Antes do release, configure no processo PowerShell:
`NOPONTO_PRODUCTION_KEYSTORE`, `NOPONTO_PRODUCTION_STORE_PASSWORD`,
`NOPONTO_PRODUCTION_KEY_ALIAS` e `NOPONTO_PRODUCTION_KEY_PASSWORD`. Os scripts
não pedem, imprimem nem gravam esses segredos. O script também habilita o Radar
remoto V1 automaticamente; configure `EXPO_PUBLIC_RADAR_API_BASE_URL`,
`EXPO_PUBLIC_API_BASE_URL` e `EXPO_PUBLIC_GPS_HUB_URL` para a mesma API pública
HTTPS. Se faltarem, o script para antes de chamar Gradle. O Firebase de produção
deve conter cliente para o package de produção; não copie o JSON `.dev`. Não use
uma chave debug para distribuir a release. A compatibilidade da chave deve ser
confirmada com a assinatura da release instalada/publicada antes de substituir
o APK.

Os APKs são copiados para `.local-apks/` com nome, branch, commit e timestamp.
Ambos os scripts validam Java, Android SDK, CMake 3.31.6, Ninja 1.12+, flavor e
Firebase antes do Gradle; preservam Gradle, `node_modules` e `android/app/build`.
Só removem `android/app/.cxx` se `cmake.dir` mudar. Não executam clean ou
Prebuild. Se `android/` for recriado, o plugin do app config volta a instalar
flavors, nomes e schemes; revise primeiro mudanças manuais no Android gerado,
que é ignorado pelo Git.

Metro/Fast Refresh continua separado do build do Dev Client:

```powershell
# Terminal 1; com o telefone na mesma rede ou ADB reverse configurado:
$env:APP_VARIANT = 'development'
npx expo start --dev-client --port 8084
# Para conexão USB:
adb reverse tcp:8084 tcp:8084
```

Após instalar `developmentDebug` uma vez, mudanças JS/TS atualizam pelo Metro;
só mudanças nativas exigem executar novamente `build-dev-local.ps1`. Instale os
APK gerados com `adb install -r <caminho-do-apk>`; os applicationIds distintos
permitem manter Dev e produção simultaneamente.

Os perfis EAS usam tarefas flavor explícitas para desenvolvimento, Radar,
preview e production; as credenciais EAS continuam sob controle do EAS.

## APK local de Radar `.dev` legado

Este script continua reservado ao app Radar `.dev` para testes locais. Ele nao
gera a release de producao: usa `google-services.json` e assinatura debug do
app Dev. Para distribuir o No Ponto, use os perfis EAS persistidos no projeto:

```powershell
# APK standalone de produção para distribuição interna/teste em aparelho:
eas build --platform android --profile preview
# AAB de produção para Google Play:
eas build --platform android --profile production
# Dev Client com Metro/Fast Refresh:
$env:APP_VARIANT = 'development'
npx expo run:android --device
```

Os perfis `preview` e `production` fixam `APP_VARIANT=production`; o app usa
`com.guilhermedesales.nononto` e o nome `No Ponto`. O perfil `development` usa
`com.guilhermedesales.nononto.dev` e `No Ponto Dev`. Nenhum flavor Gradle é
necessário para os builds EAS, pois cada build resolve o app config da variante.

Executar em `noponto-frontend/NoPonto`, PowerShell:

```powershell
.\scripts\build-apk-local.ps1 -CheckOnly
# Primeiro build: preserva android/ anterior em .local-apks/android-backup-*
.\scripts\build-apk-local.ps1 -RegenerateNative
# Builds seguintes, sem mudancas nativas:
.\scripts\build-apk-local.ps1
```

Nao instala dependencias, nao faz clean, nao inicia Metro nem instala no aparelho.
Seleciona CMake 3.31.6 em `android/local.properties` (`cmake.dir`) e exige
Ninja 1.12 ou superior do mesmo diretório do SDK. Preserva as demais linhas de
`local.properties`; apaga somente `android/app/.cxx` se o `cmake.dir` anterior
existir e apontar para outra versão. O cache Gradle e `android/app/build` ficam
intactos. `local.properties` permanece ignorado pelo Git.
Usa o perfil `radar.env` de `eas.json`, ignorando dotenv e destinos herdados do
terminal. Confira as URLs desse perfil antes do build; tunel indisponivel deixa
o APK sem acesso a API. Java vem de JAVA_HOME (JDK >=17), SDK de ANDROID_HOME,
ANDROID_SDK_ROOT ou `%LOCALAPPDATA%/Android/Sdk`. Requer plataforma/build-tools
36 e NDK 27.1.12297006, conforme React Native instalado.

Este script gera um APK do tipo Gradle `release` para o app Radar `.dev`,
assinado com a chave debug local; não é o pacote/assinatura da release EAS
(`com.guilhermedesales.nononto`). O bundle JS é embutido por `export:embed`,
sem depender do Metro.

Chave debug e Firebase foram preservados de D:\r30 em
`%LOCALAPPDATA%/NoPonto/build/{debug.keystore,google-services.json}`.
Parametros `-Keystore` e `-GoogleServicesFile` permitem outros caminhos locais.
Nao envie esses arquivos ao Git. Guarde backup da chave: pacote `.dev` e mesma
assinatura permitem atualizar o APK local anterior sem desinstalar. Essa chave
debug e para testes; nao representa a assinatura de producao/EAS. O script nao
desinstala aplicativos nem contorna conflito de assinatura/versionCode.

`android/` e incremental; cache compartilhado usa GRADLE_USER_HOME existente
(nesta maquina D:\DevCaches\Gradle) ou `%USERPROFILE%/.gradle`. Nenhum cache de
D:\r30 e copiado. APKs recebem branch, commit, `dirty` quando houver mudancas
locais e timestamp em `.local-apks/`. Nao sao sobrescritos ao trocar de branch.

Depois de trocar de branch, execute o script presente nessa branch. O fingerprint
de dependencias, lockfile, configuracao Expo resolvida, plugins, modulos, assets
e Firebase bloqueia uso de android/ incompativel. Mudanca apenas de JS reutiliza
o projeto nativo. Se bloqueado, revise os ajustes nativos e use -RegenerateNative;
o projeto anterior fica em backup para comparacao/manual, sem exclusao automatica.
Plugins que leem arquivos adicionais fora desses diretorios exigem regeneracao
explicita. Nao execute dois builds simultaneos no mesmo checkout.

Inspecao de D:\r30: Gradle wrapper 9, Hermes/nova arquitetura, quatro ABIs,
release .dev com assinatura debug e export:embed; tambem havia saida debug
nativeprobe. Remocao dos servicos Firebase padrao ja esta no plugin versionado,
assim como o modulo de notificacoes/voz. Nao foi encontrado script local de build
dedicado. Nao e possivel reconstruir o comando historico exato so pelos artefatos.

O preflight verifica binários e versões de CMake/Ninja sem compilar. A escolha
efetiva pelo Android Gradle Plugin só pode ser confirmada durante uma tarefa
Gradle; esta validação não executa build.
