# Abertura com vídeo

Na pasta `NoPonto`, execute `npx expo start --go --clear` e abra o QR code com um Expo Go compatível com SDK 55. Se precisar de túnel, acrescente `--tunnel`.

O vídeo é um asset local (`assets/vids/splash.mp4`), referenciado com `require`, sem download da API. O arquivo atual tem 5 segundos, 1080 × 1920, H.264 e aproximadamente 2,76 MB. A reprodução ocorre dentro do React Native, sem exigir development build. `contentFit="cover"` preserva a proporção e recorta as bordas conforme a tela.

O layout raiz mantém a navegação e os providers montados abaixo do overlay. Após a hidratação normal do tema, o mapa, as preferências e os serviços existentes iniciam normalmente, sem novas requisições ou remount no encerramento. `onReady` comunica o `map_ready` da WebView; GPS e veículos não bloqueiam a transição.

A status bar fica oculta durante a abertura e volta ao estilo do tema depois. A barra de navegação Android usa temporariamente o estilo escuro e retorna a `auto`, sem mudar sua visibilidade ou o tamanho da tela. O fundo preto é desenhado pelo overlay sob a barra transparente do modo edge-to-edge. O plugin `expo-navigation-bar` prepara `enforceContrast: false` para a build definitiva; o Expo Go pode manter o contraste imposto pelo próprio cliente/sistema.

A Splash nativa usa fundo preto e uma imagem transparente de 1 pixel para substituir qualquer imagem padrão gerada. `preventAutoHideAsync` é chamado no escopo do módulo; `hideAsync` espera o layout do overlay e o primeiro frame. Nas falhas, espera uma superfície preta montada. No Expo Go, a tela nativa inicial pertence ao cliente Expo e pode mostrar a identidade dele: a personalização nativa precisa de uma build posterior, mas isso não impede testar o vídeo.

`playToEnd` encerra a reprodução; o overlay troca o vídeo por preto e faz um fade de 220 ms quando o mapa está pronto. Sem mapa pronto, mostra um indicador discreto por no máximo 8 segundos e libera a interface para permitir recuperação. Erros de status, exceções do player e falhas de criação são tratados. Um watchdog de 45 segundos limita a espera caso não haja evento de conclusão. Os hooks limpam listeners e recursos nativos ao desmontar; effects limpam timers e a animação. Uma marca no runtime JS impede nova reprodução ao remontar o layout; uma nova sessão JS permite nova abertura. Reload completo do Expo Go reinicia essa sessão, enquanto navegação e retorno do background não a reiniciam.

Validação manual no celular:

- Reiniciar a sessão e confirmar autoplay sem som/controles, vídeo ocupando a tela e transição para mapa utilizável.
- Comparar telas 9:16 e mais altas: recorte proporcional, sem deformação.
- Navegar entre abas, abrir detalhes e voltar do background: nenhuma nova abertura.
- Testar sem rede: vídeo continua local; mapa pode depender dos serviços externos e o overlay deve liberar a interface após o limite.
- Validar falhas do player e background durante o vídeo; não deve bloquear o aplicativo.
- Na build definitiva Android/iOS, conferir a Splash preta, barras do sistema, permissões de localização e ausência de flashes. Exportar bundles não substitui esse teste visual em dispositivo.

## Validação no ambiente de implementação

- Exportação Metro/Hermes Android e iOS concluída, incluindo `assets/vids/splash.mp4` nos assets.
- TypeScript (`npx tsc --noEmit`) passou.
- 33 testes `.cjs` passaram; os testes de carregamento foram ampliados para verificar a notificação do mapa pronto antes de GPS e veículos.
- Os testes `.ts`, executados com um loader local de TypeScript no Node 20, tiveram 71 aprovações e 4 falhas: três assertions existentes de apresentação ferroviária/busca e um teste de hook impedido pelo parser de Flow do React Native no Node. Os arquivos dessas assertions não foram modificados.
- O lint geral tem cinco erros preexistentes de `__dirname` nos testes `.cjs` e quatro avisos de hooks. Os novos componentes e layout passaram na checagem direcionada.
- `expo install --check` identifica atualizações de patch disponíveis para dependências já existentes do SDK 55; não foi feita uma atualização geral do projeto.
- Não foi executada build nativa nem reprodução em dispositivo neste ambiente.
