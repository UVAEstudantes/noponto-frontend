# Android de desenvolvimento — N2-A.1

## Configuração

`NoPonto/app.json` permanece como base. `app.config.js` aplica a variante quando
`APP_VARIANT=development`; o perfil EAS `development` também define essa variável.

| Configuração | Padrão / produção | Desenvolvimento Android |
| --- | --- | --- |
| Nome | No Ponto | NoPonto Dev |
| applicationId | com.guilhermedesales.nononto | com.guilhermedesales.nononto.dev |
| Scheme | noponto | noponto-dev |

Os plugins existentes são mantidos. O plugin `expo-dev-client` gera seu scheme
adicional somente em desenvolvimento. O cliente usa as mesmas configurações de
API já existentes; esta etapa não modifica backend, Radar, ETA ou notificações N1.
Não há configuração de FCM nem obtenção de push token.

## Investigação breve do Expo Go SDK 55

A documentação do SDK 55 informa que push remoto não é suportado no Expo Go
Android desde SDK 53, embora notificações locais continuem disponíveis.
No pacote instalado, `src/index.ts` avisa sobre suporte incompleto no Expo Go;
`src/warnOfExpoGoPushUsage.ts` lança erro no Android quando o caminho de push é
acionado. A N2-A importa a API pública do pacote e não solicita push token.
Essa API também importa `DevicePushTokenAutoRegistration.fx.ts`, que pode chamar
`addPushTokenListener` na inicialização quando o módulo nativo oferece
`getRegistrationInfoAsync`; esse listener aciona a verificação do Expo Go.
Uma execução isolada do verificador instalado, simulando os ambientes, confirmou
exceção no Expo Go Android e ausência dessa exceção no development client.
Sem o log original e reprodução no dispositivo, não é possível atribuir o erro
de carregamento especificamente a essa exceção ou a um módulo nativo ausente.
O development build inclui os módulos nativos da versão instalada e permite
validar o teste fora das limitações do Expo Go.

Referências:
- https://docs.expo.dev/versions/v55.0.0/sdk/notifications/
- https://docs.expo.dev/versions/v55.0.0/sdk/dev-client/
- https://docs.expo.dev/build-reference/variants/
- https://docs.expo.dev/more/expo-cli/

## Compilar e instalar futuramente (PowerShell / Windows)

Pré-requisitos: JDK 17, Android Studio com Android SDK e platform-tools,
`ANDROID_HOME` configurado, `adb` no PATH, dispositivo USB autorizado com
depuração USB (ou emulador iniciado), dependências instaladas via pnpm.

Nenhum build, prebuild ou instalação em aparelho foi executado nesta etapa.
Não existe pasta `NoPonto/android` no checkout no momento da preparação.

Na primeira compilação, execute:

```powershell
Set-Location D:\repositorio_github\NoPonto\noponto-frontend-principal\NoPonto
$env:APP_VARIANT = 'development'
pnpm exec expo config --type public
adb devices
if (Test-Path -LiteralPath .\android) {
  throw 'Pasta android já existe: revisar alterações e applicationId nativos antes de compilar.'
}
pnpm exec expo run:android --variant debug --device --no-bundler --app-id com.guilhermedesales.nononto.dev
```

Confira no resultado da configuração o nome `NoPonto Dev` e o package com `.dev`.
`run:android` gera o projeto Android automaticamente quando ele está ausente,
compila e instala o debug no dispositivo escolhido. Não use `prebuild --clean`.
`--app-id` seleciona o aplicativo a abrir; quem define o applicationId do build
é a configuração da variante, não essa opção de lançamento.

O APK esperado fica em `android\app\build\outputs\apk\debug\app-debug.apk`.
Para reinstalar apenas esse mesmo APK Dev posteriormente, com um único aparelho
conectado, use:

```powershell
adb install -r .\android\app\build\outputs\apk\debug\app-debug.apk
```

O identificador `.dev` permite coexistência com o APK funcional. Não execute
`adb uninstall` nem instale um APK de produção para este teste. Após a primeira
geração, revise `android/app/build.gradle` e confirme o applicationId `.dev`
antes de recompilar com `run:android`; pastas nativas existentes não são
regeneradas automaticamente para refletir mudanças de variante.

## Conectar ao Metro via tunnel

Em outro terminal PowerShell:

```powershell
Set-Location D:\repositorio_github\NoPonto\noponto-frontend-principal\NoPonto
$env:APP_VARIANT = 'development'
pnpm exec expo start --dev-client --tunnel
```

Abra **NoPonto Dev** e leia o QR code do Metro ou informe a URL exibida no
launcher do development client. O tunnel precisa de acesso à internet.
Em Configurações, toque **Exibir: 838 chegando em 5 min**, autorize notificações e confira
a bandeja Android com o app aberto. Os dados são simulados e a notificação é
silenciosa. Recusar a permissão deve apenas exibir a mensagem da N2-A.
Para atualizar e encerrar essa mesma simulação, veja
[o roteiro da N2-B](radar-notificacoes-n2b.md).

## Verificações sem build

Executadas nesta etapa: resolução da configuração pública e dos plugins para as
duas variantes (`expo config --type public --json` e
`expo config --type prebuild --json`), com comparação do nome, package, scheme e
preservação dos plugins originais; TypeScript sem emissão. `config --type prebuild`
apenas consulta a configuração, não executa o comando `expo prebuild` nem gera
pastas nativas.

```powershell
Remove-Item Env:APP_VARIANT -ErrorAction SilentlyContinue
pnpm exec expo config --type public
$env:APP_VARIANT = 'development'
pnpm exec expo config --type public
pnpm exec tsc --noEmit
```

Para voltar à configuração padrão no terminal, remova `Env:APP_VARIANT`.
