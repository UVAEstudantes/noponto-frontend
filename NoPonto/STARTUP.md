# Abertura com vídeo ou logo

Na pasta `NoPonto`, execute `npx expo start -c --tunnel` e abra o QR code com um Expo Go compatível com SDK 55.

Em Configurações → Animação de abertura, o controle “Exibir animação ao iniciar o aplicativo.” salva a preferência no AsyncStorage pela chave `@animacaoAbertura`. O padrão é `true`; somente o valor persistido `false` escolhe a logo estática. A mudança vale na próxima inicialização completa. Falha de gravação mantém o valor anterior e mostra uma mensagem para tentar novamente.

O contexto existente de preferências recupera esse valor em paralelo à hidratação do tema. Até resolver a leitura, o layout mantém uma superfície preta, sem montar nenhum player. Falhas de leitura usam `true` e registram o problema; leitura que não responde tem limite de 8 segundos. O controlador `StartupOverlay` fixa a escolha ao montar, evitando troca de abertura por rerenders ou alterações posteriores de configurações.

No modo desativado, `assets/images/iconeNovoSemFundo.png` aparece centralizada sobre preto, com `resizeMode="contain"`, tamanho proporcional e limite de 250 pontos. Não há player, textos, indicador ou animação na logo. Após o layout e carregamento da imagem, a Splash nativa é ocultada. A camada estática termina assim que o mapa sinaliza prontidão, sem duração mínima; em caso de demora ou erro, libera a interface após no máximo 8 segundos desde sua montagem. Ambos os modos compartilham `useStartupTransition`, com fade de 220 ms e limpeza de timer/animação.

O vídeo é um asset local (`assets/vids/splash.mp4`), referenciado com `require`, sem download da API. O arquivo atual tem 5 segundos, 1080 × 1920, H.264 e aproximadamente 2,76 MB. A reprodução ocorre dentro do React Native, sem exigir development build. `contentFit="cover"` preserva a proporção e recorta as bordas conforme a tela.

O layout raiz mantém a navegação e os providers montados abaixo do overlay. Após a hidratação normal do tema, o mapa, as preferências e os serviços existentes iniciam normalmente, sem novas requisições ou remount no encerramento. `onReady` comunica o `map_ready` da WebView; GPS e veículos não bloqueiam a transição.

A status bar fica oculta durante a abertura e volta ao estilo do tema depois. A barra de navegação Android usa temporariamente o estilo escuro e retorna a `auto`, sem mudar sua visibilidade ou o tamanho da tela. O fundo preto é desenhado pelo overlay sob a barra transparente do modo edge-to-edge. O plugin `expo-navigation-bar` prepara `enforceContrast: false` para a build definitiva; o Expo Go pode manter o contraste imposto pelo próprio cliente/sistema.

A Splash nativa continua usando fundo preto e uma imagem transparente de 1 pixel; a logo estática pertence apenas ao React Native. `preventAutoHideAsync` é chamado no escopo do módulo; `hideAsync` espera o layout do overlay e o primeiro frame no modo vídeo, ou a imagem no modo estático. Nas falhas, libera a interface com a superfície preta montada. No Expo Go, a tela nativa inicial pertence ao cliente Expo e pode mostrar a identidade dele: a personalização nativa precisa de uma build posterior, mas isso não impede testar os dois modos.

`playToEnd` encerra a reprodução; o overlay troca o vídeo por preto e faz um fade de 220 ms quando o mapa está pronto. Sem mapa pronto, mostra um indicador discreto por no máximo 8 segundos e libera a interface para permitir recuperação. Erros de status, exceções do player e falhas de criação são tratados. Um watchdog de 45 segundos limita a espera caso não haja evento de conclusão. Os hooks limpam listeners e recursos nativos ao desmontar; effects limpam timers e a animação. Uma marca no runtime JS impede nova reprodução ao remontar o layout; uma nova sessão JS permite nova abertura. Reload completo do Expo Go reinicia essa sessão, enquanto navegação e retorno do background não a reiniciam.

Validação manual no celular:

- Reiniciar a sessão e confirmar autoplay sem som/controles, vídeo ocupando a tela e transição para mapa utilizável.
- Desativar a opção e recarregar completamente o aplicativo: conferir apenas a logo, sem trecho do MP4, e saída imediata quando o mapa estiver pronto.
- Fechar e abrir novamente para verificar a persistência; reativar e reiniciar para conferir o retorno do vídeo.
- Comparar telas 9:16 e mais altas: recorte proporcional, sem deformação.
- Navegar entre abas, abrir detalhes e voltar do background: nenhuma nova abertura.
- Testar sem rede: vídeo continua local; mapa pode depender dos serviços externos e o overlay deve liberar a interface após o limite.
- Validar falhas do player e background durante o vídeo; não deve bloquear o aplicativo.
- Na build definitiva Android/iOS, conferir a Splash preta, barras do sistema, permissões de localização e ausência de flashes. Exportar bundles não substitui esse teste visual em dispositivo.

## Validação no ambiente de implementação

- Na implementação original do vídeo, exportação Metro/Hermes Android e iOS concluída, incluindo `assets/vids/splash.mp4` nos assets. A extensão de preferência não refez essa exportação.
- TypeScript (`npx tsc --noEmit`) passou.
- 37 testes `.cjs` passaram, incluindo quatro testes novos de preferência, seleção sem player, erros de armazenamento e transição compartilhada. Os testes existentes foram preservados.
- Os testes `.ts`, executados com um loader local de TypeScript no Node 20, tiveram 71 aprovações e 4 falhas: três assertions existentes de apresentação ferroviária/busca e um teste de hook impedido pelo parser de Flow do React Native no Node. Os arquivos dessas assertions não foram modificados.
- O lint geral da implementação original tinha cinco erros preexistentes de `__dirname` nos testes `.cjs` e quatro avisos de hooks. Nesta extensão, o lint direcionado passou em todos os arquivos de código criados ou modificados.
- `expo install --check` identifica atualizações de patch disponíveis para dependências já existentes do SDK 55; não foi feita uma atualização geral do projeto.
- Não foi executada build nativa nem reprodução em dispositivo neste ambiente.
