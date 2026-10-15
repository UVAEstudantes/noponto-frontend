# Abertura com vídeo ou logo

A preferência de animação continua na chave `@animacaoAbertura` do AsyncStorage. O padrão é vídeo; somente `false` persistido seleciona a logo estática. A alteração vale na próxima sessão completa. Falha de leitura mantém o fallback já existente e falha de gravação não troca silenciosamente a preferência.

## Comportamento da correção

- Navegação e mapa continuam montados pelo layout existente. O callback de prontidão do mapa e a proteção contra replay na mesma sessão não mudam.
- A splash nativa é ocultada no layout do overlay React Native, sem esperar o primeiro frame. A logo também cobre a leitura pendente da preferência.
- Vídeo local: `assets/vids/splash.mp4`, cerca de cinco segundos, sem áudio, loop, controles ou PiP. `textureView` permanece fixa; não há seletor experimental de superfície nesta candidata.
- O player fica em um componente próprio. Fim, falha de criação, erro nativo ou timeout encerram a tentativa e desmontam esse filho; `useVideoPlayer` controla a liberação nativa, sem `release` manual duplicado.
- Eventos são registrados antes de `play()`. A prontidão e uma transição real de volta ao foreground solicitam reprodução idempotente, preservando a posição. Não há seek, substituição do asset ou retry periódico.
- Background/inactive suspendem o watchdog. No retorno ao foreground, a tentativa inacabada retoma; sem primeiro frame o limite de 3 segundos é rearmado. Após o frame, o limite usa a duração restante mais 2 segundos, com metadados inválidos limitados pelos cinco segundos conhecidos do clipe. Eventos tardios não reiniciam uma tentativa encerrada.
- O orçamento do mapa é independente e corre em paralelo: 8 segundos desde a montagem do overlay. Vídeo encerrado com mapa pendente mostra a logo e o indicador existente; prontidão ou vencimento do orçamento permitem o fade de 220 ms. Mapa pronto não corta o vídeo em andamento.
- Modo estático não monta player nem impõe duração mínima. A chave e o fluxo de persistência da preferência não são alterados por erro de reprodução.

## Diagnósticos e separação do laboratório

Os eventos internos `[Startup]` só são emitidos em desenvolvimento ou com `EXPO_PUBLIC_STARTUP_DIAGNOSTICS=1` explicitamente definida na build. Em release, variável ausente ou `0` não emite esses logs. A amostragem de progresso a cada segundo só existe com diagnóstico habilitado e é limpa com os demais listeners/timers.

Não habilitar essa variável permanentemente na distribuição. Os logs adicionais do layout/provedor de tema usados para medir o cold start não foram transportados. Também ficaram no laboratório: override de superfície, perfis experimentais EAS, Android gerado, pacote `.startuptest`, assinatura debug, endpoints locais, limites Gradle/Metro, APKs, caches e capturas ADB. Nenhuma dependência, asset, app.json, eas.json ou workflow é alterado por este patch.

## Evidência e limites

A investigação descartou ausência do MP4 no APK inspecionado: o arquivo embarcado tem SHA-256 `ce6d3d5a13072a18c3fa3866012595982af94797677e8ded3a532008e9530178`, igual ao asset do projeto. A splash antiga aguardava o primeiro frame enquanto o código nativo mantinha o pre-draw bloqueado. A recuperação desse bloqueio foi preservada.

No APK de teste release/arm64-v8a, a reprodução ainda era pausada por uma transição de lifecycle. O Android registrou GrantPermissionsActivity, embora o operador não tenha percebido uma janela. A captura corrigida demonstrou background → active → play foreground, avanço até 5,005s e `playToEnd`, sem timeout. O operador confirmou reprodução completa no Xiaomi, com leve engasgo inicial; fluidez perfeita não foi demonstrada.

O APK local era um pacote separado, com assinatura de teste; não é um artefato de distribuição. A homologação nativa cobre o núcleo funcional transportado. Nesta preparação foram retirados apenas diagnósticos externos ao startup e a opção experimental de superfície, mantendo o mesmo valor homologado. Não foi gerado novo APK nesta etapa. Persistência, opção OFF, falhas, lifecycle e limites são cobertos também por testes offline; estes não substituem medição nativa de frames.
