# Protótipo de notificações nativas do Radar

## Implementação

O módulo Expo local `NoPonto/modules/radar-native-notification` registra o módulo Kotlin `RadarNativeNotification` pelo autolinking padrão em `modules/`. Ele cria dois canais próprios (`normal` e `heads-up`) e publica notificações com IDs fixos e reservados ao protótipo. O canal remoto `radar-espera-updates-v1` e os IDs de notificação existentes não são usados.

O Kotlin monta as notificações com `NotificationCompat.DecoratedCustomViewStyle` e `RemoteViews`: uma apresentação curta para a bandeja recolhida/heads-up e outra expandida. Há cenários de múltiplas linhas (838 e 855, incluindo dois veículos na linha 838) e de ausência de previsões. Todas as apresentações dizem `TESTE` e a expandida explica que os dados são fictícios.

`src/services/notificacaoNativaTeste.ts` solicita a permissão quando necessário e chama o módulo nativo. A tela Configurações oferece testes de várias linhas normal/heads-up, sem previsões e limpeza. A interface só aparece em Android de desenvolvimento ou no APK explicitamente marcado como `nativeprobe`. O protótipo não importa nem modifica o serviço do Radar remoto.

## Variante isolada

O perfil EAS `nativeprobe` produz APK interno com `com.guilhermedesales.nononto.nativeprobe` e scheme `noponto-nativeprobe`. Dev e Radar continuam com `com.guilhermedesales.nononto.dev`; produção continua com o identificador de `app.json`.

O perfil não referencia `google-services.json` e ignora `NOPONTO_DEV_GOOGLE_SERVICES_FILE`. Notificações locais não precisam de Firebase. Push remoto/token FCM não faz parte deste APK de teste; o serviço remoto existente só é ligado quando `EXPO_PUBLIC_RADAR_REMOTE_ENABLED=true`, variável ausente no perfil.

## Verificações feitas

Executado em `NoPonto/`:

```powershell
node --test scripts/nativeprobe-config.test.cjs scripts/radar-standalone-config.test.cjs
```

Resultado: 8 testes passaram, incluindo o pacote Firebase-independente de `nativeprobe` e a preservação dos IDs Dev, Radar e produção.

```powershell
git diff --check
```

## Compilação e teste no Xiaomi (ainda pendentes)

Não foi executado prebuild, Gradle, EAS, ADB, instalação nem configuração do aparelho. Depois da revisão, a compilação local recomendada no PowerShell é:

```powershell
Set-Location 'D:\repositorio_github\NoPonto\noponto-frontend-notificacoes-nativas\NoPonto'
pnpm install --frozen-lockfile
$env:APP_VARIANT = 'nativeprobe'
pnpm exec expo config --type public
pnpm exec expo prebuild --platform android
Push-Location android
.\gradlew.bat :app:assembleDebug --no-daemon --max-workers=1 "-Dorg.gradle.jvmargs=-Xmx1536m -XX:MaxMetaspaceSize=512m -Dfile.encoding=UTF-8"
Pop-Location
```

O APK de debug esperado fica em `NoPonto/android/app/build/outputs/apk/debug/app-debug.apk`. O `applicationId` distinto permite coexistir com o NoPonto Dev. Após instalar manualmente, verificar permissão Android, aparência recolhida/expandida e heads-up; MIUI/HyperOS pode suprimir heads-up ou alterar espaçamento conforme permissões e preferências dos canais.

## Pendências e riscos

- A integração Kotlin, o autolinking do Expo SDK 55 e os layouts `RemoteViews` ainda precisam de compilação Android e inspeção no Redmi Note 10 Pro. Testes TypeScript não foram executados porque `NoPonto/node_modules` não está presente.
- O Android/MIUI controla cabeçalho, altura de layouts personalizados, permissão de notificações e importância dos canais; o heads-up é apenas solicitado pelo canal de alta importância, nunca garantido.
- Sem credenciais Firebase próprias para o applicationId `nativeprobe`, push remoto não é esperado nem necessário para validar este protótipo.
