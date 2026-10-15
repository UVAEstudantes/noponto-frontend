# Histórico do frontend

## 2026-10-10 — Radar da parada próxima

- Adicionado painel compacto com até dois eventos reais, seleção automática/manual, histerese de 60 m, raio de 1 km e recolhimento lateral conforme lateralidade.
- Reutilizados eventos de parada, identidade dos veículos e ParadaSheet; contexto estrito de linha, sentido, versão e parada, sem agrupar plataformas próximas.
- Metadata de plataforma/estação utiliza o GET /paradas/{id} existente, em cache e sob demanda, sem polling adicional.
- Ocorrências V2 permanecem disponíveis independentemente da visibilidade dos marcadores. Apenas novas linhas começam com mostrarParadas=true; preferências existentes são preservadas.
- Polling controlado, suspensão fora da tela/foreground, timeout de 12 s, compartilhamento de consultas simultâneas e descarte de respostas antigas.
- Preparados testes de elegibilidade, plataformas, estabilidade, eventos, apresentação e requisições. Roteiro em VALIDACAO_RADAR_PARADA.md.
- Nenhum teste, build, lint, deploy ou comando Git executado. Aparência e integração precisam de validação no dispositivo.
- Não alterados backend, runtime ferroviário, GPS, busca/dropdown, catálogo BRT, lista de linhas, tema, tarifas, favoritos, POIs ou navegação.

## 2026-10-10 — Favoritos Etapa B: mapa multimodal e busca Todos

- Estrelas movidas para resultados de Linhas e adicionadas aos cards do mapa, compartilhando a coleção da Etapa A e isolando os toques.
- Favoritos integrado ao seletor rolável; visualização, modal normal persistido e categoria de busca separados. Todos consulta /linhas sem filtros de transporte e conserva identidades individuais e histórico.
- Linhas efetivas multimodais reutilizam configurações salvas e apresentação temporária das demais favoritas; nenhum acréscimo automático à lista normal. Adição explícita disponível.
- Limite operacional de dez favoritas visíveis, com escolha explícita acima dele e sem limitar a coleção armazenada.
- Inscrições rodoviárias reconciliadas no hub compartilhado, com limpeza/reconexão; polling ferroviário por linhas visíveis, snapshot agregado e deduplicação. Radar único usa contexto efetivo multimodal e plataformas específicas.
- Preparada suíte favoritosEtapaB.test.cjs e roteiro com 24 regressões em VALIDACAO_FAVORITOS_ETAPA_B.md. Nenhum teste, build, lint, deploy ou Git executado.
- Backend, GPS/ETA/ML, tarifas, pagamentos, POIs, tema global, navegação e Rotinas preservados. Integração e aparência aguardam validação manual.

## 2026-10-14 — Presença física BUS/BRT nos terminais (OFF por padrão)
- Corrigido filtro visual demonstrado por teste RED para posição recente da linha selecionada sem versão estrutural. Separada presença de identidade/ETA sob EXPO_PUBLIC_ROAD_PRESENCE_ENABLED=true; default OFF. App mapa/Linhas, hook, reconciliação, payload e popup adaptados sem inventar linha/sentido/execução ou alterar Radar/backend operacional.
- Apresentação conservadora: em viagem; terminal/fim com duas observações; aguardando saída apenas após chegada observada e confirmação do novo sentido, parado; estado indeterminado e GPS desatualizado. Posição GPS bruta quando indisponível para projeção, sem dead reckoning nesses estados; idade real, 60s frescor visual e180s retenção máxima, sem renovação do GPS ou persistência. Histerese 50m/100m e evidências limitadas a5000 veículos.
- 24 testes Node aprovados (12 de presença e12 de Favoritos/SignalR/Radar), incluindo filtro real, troca falsa de sentido, jitter, expiração e duplicação entre linhas; TypeScript --noEmit e sintaxe do script WebView aprovados. Backend validado separadamente em HTTP local/cache em memória, sem bancos existentes.
- Novos src/services/roadPresence.ts e terminalPresence.test.cjs. Modificados app/index.tsx, app/linhas.tsx, useMobilidadeRio.ts, veiculosMapa.ts, types/veiculoMapa.ts, components/mapOSM/types.ts e webview/mapScript.ts, antes limpos. WIP de startup/theme/eas preservado integralmente. Não executado build mobile, deploy, commit/push/merge nem alteração de CI/CD. Relatório no backend: docs/09-validacao/11-visibilidade-terminais-20261014.md. Aparência e limiares aguardam homologação no dispositivo; causa real do terminal não afirmada.


### 2026-10-14 — F1 candidata — presença isolada
- Nove arquivos aprovados e somente histórico terminal transportados. WIP startup/theme/EAS ficou no original. Flag visual OFF, nenhum build APK ou workflow executado.

### 2026-10-14 — Correções pontuais de popup e título do Radar na candidata
- Reproduzidas nove falhas RED e dois casos aprovados antes da correção. Atualizações de HTML descartavam a expansão de Mais detalhes; preservado somente o estado do DOM do mesmo popup atualmente aberto, renovando todo o conteúdo. Consumidores rodoviário e ferroviário reutilizam o helper, sem estado global, timer ou retenção de veículo removido. Fechamento manual permanece funcional.
- Removido somente o limite de uma linha/reticências do título do Radar; nome completo quebra dentro da coluna flexível e do painel rolável já existente. Sem alteração de eventos, API, ETA ou escolha da parada.
- Novos popupDetails.test.cjs (7 casos) e radarStopTitle.test.cjs (5 casos), com fluxo WebView real em VM e renderização TSX com hosts/hooks simulados. Validam GPS/timestamp/repetição, conteúdo renovado, fechamento, veículos distintos/removidos, consumidor ferroviário e nome completo de fixture/metadados/nomes longos em layouts de 320/480. Não são medição nativa de pixels nem homologação visual pós-patch.
- GREEN: 53 testes direcionados (12 novos, 12 presença, 9 indicadores, 10 Radar e 10 eventos), TypeScript --noEmit e git diff --check aprovados. Node 20 exigiu transpilar TypeScript para executar as regressões antigas; tentativas iniciais sem loader/esModuleInterop falharam na inicialização, corrigidas apenas no comando de teste. Nenhuma suíte backend, infraestrutura, Expo ou APK executados.
- Alterações apenas nesta candidata frontend, inicialmente limpa, HEAD 30072b4a4597 preservado. Originais, startup/splash/tema/EAS, backend, ML e CI/CD não editados. Sem stage, commit, push, PR, merge ou deploy. Diff pronto para revisão; aparência pós-patch ainda não reconferida no Android.

### 2026-10-14 — Validação visual final e remoção do pulso do ícone
- Operador confirmou no Android: detalhes estáveis após atualizações realtime, fechamento manual preservado, outro veículo inicia recolhido e título completo do Radar legível. Fixture próxima FIXRADAR criada somente no banco descartável externo à candidata.
- Corrigido replay da transição inserindo o HTML já expandido antes de setHTML; 54 testes direcionados e TypeScript aprovados nessa revisão.
- A pedido do operador, removida apenas a animação contínua do pseudo-elemento do ícone no popup, mantendo o contorno estático e os movimentos do mapa. Adicionada regressão específica; 14 testes de popup/título aprovados após essa alteração. Sem alterações de GPS, ETA, backend, CI/CD ou workspaces originais. Commit local ainda depende de autorização.
- Fechamento visual: operador confirmou também o ícone sem pulso e autorizou explicitamente commit local dos seis arquivos e encerramento da sessão, sem push.

### 2026-10-15 — Preparação do patch de abertura Android para PR32
- Transportado o conjunto funcional recuperado e homologado, não apenas a última retomada: SplashVideoOverlay, SplashVideoBoundary, StartupOverlay, useStartupTransition, StartupLogo, helper diagnóstico e testes. Layout, provedor de tema, preferência persistida e commits de presença/popup/Radar preservados.
- Splash liberada no layout; fallback com logo, primeiro frame com limite de 3s em foreground, watchdog retomado pela duração restante e orçamento paralelo de mapa de 8s. Player retoma após lifecycle e encerra em playToEnd/erro/timeout, sem seek, retry periódico ou replay tardio.
- Diagnósticos de release OFF quando variável ausente/0; nenhum sampler ativo sem diagnóstico. Logs de medição do layout/tema e override de superfície ficaram no laboratório; textureView mantida fixa como no APK homologado. Não transportados Android gerado, assinatura, pacote de teste, endpoints, EAS, caches, APK ou limites de build.
- Evidência anterior: release local completou playToEnd em 5,005s, sem timeout; operador confirmou vídeo completo com leve engasgo inicial. Essa ressalva permanece. Sem novo build ou nova homologação nesta preparação.
- Diff e validação desta candidata serão registrados antes da autorização de commit. Nenhum stage, commit, push, atualização remota da PR, merge, backend, ML ou Docker nesta etapa.

- Validação desta preparação: 40/40 testes direcionados (14 startup, 9 popup, 5 título do Radar e 12 presença), TypeScript `--noEmit` e `git diff --check` aprovados. Laboratório preservado por status e SHA-256; candidata sem stage ou commit. Nenhum novo APK ou teste visual nesta revisão.
