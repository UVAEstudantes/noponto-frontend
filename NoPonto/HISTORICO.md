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


<!-- Histórico paralelo GPS27 preservado, após ancestral comum 139859ba2078 -->

## 2026-10-14 — Presença física BUS/BRT nos terminais (OFF por padrão)
- Corrigido filtro visual demonstrado por teste RED para posição recente da linha selecionada sem versão estrutural. Separada presença de identidade/ETA sob EXPO_PUBLIC_ROAD_PRESENCE_ENABLED=true; default OFF. App mapa/Linhas, hook, reconciliação, payload e popup adaptados sem inventar linha/sentido/execução ou alterar Radar/backend operacional.
- Apresentação conservadora: em viagem; terminal/fim com duas observações; aguardando saída apenas após chegada observada e confirmação do novo sentido, parado; estado indeterminado e GPS desatualizado. Posição GPS bruta quando indisponível para projeção, sem dead reckoning nesses estados; idade real, 60s frescor visual e180s retenção máxima, sem renovação do GPS ou persistência. Histerese 50m/100m e evidências limitadas a5000 veículos.
- 24 testes Node aprovados (12 de presença e12 de Favoritos/SignalR/Radar), incluindo filtro real, troca falsa de sentido, jitter, expiração e duplicação entre linhas; TypeScript --noEmit e sintaxe do script WebView aprovados. Backend validado separadamente em HTTP local/cache em memória, sem bancos existentes.
- Novos src/services/roadPresence.ts e terminalPresence.test.cjs. Modificados app/index.tsx, app/linhas.tsx, useMobilidadeRio.ts, veiculosMapa.ts, types/veiculoMapa.ts, components/mapOSM/types.ts e webview/mapScript.ts, antes limpos. WIP de startup/theme/eas preservado integralmente. Não executado build mobile, deploy, commit/push/merge nem alteração de CI/CD. Relatório no backend: docs/09-validacao/11-visibilidade-terminais-20261014.md. Aparência e limiares aguardam homologação no dispositivo; causa real do terminal não afirmada.

## 2026-10-18 — Instruções locais do Codex e documentação do frontend
- Criado AGENTS.md na raiz com orientações sobre comandos pnpm, mapa/WebView, SignalR, identidades V2, coordenadas, timestamps, respostas tardias, persistência, SVGs, abertura Android, builds release e proteção de credenciais.
- README.md alinhado às versões e scripts presentes em NoPonto/package.json; corrigidas a estrutura de exemplo, a referência inexistente a .env.example e a distinção entre desenvolvimento local, APK preview e AAB de produção.
- Preservado integralmente o histórico anterior. Nenhum código do aplicativo ou configuração de build foi alterado nesta etapa.

## 2026-10-20 — Remoções GPS BUS/BRT por linha no SignalR

- Trabalho somente na ajustes, base139859b. Base WIP de presença/terminal versionada separadamente emfc79729 com autorização explícita, após24testes e TypeScript aprovados. WIP de startup/tema/EAS/README/AGENTS preservado; entrada local de18/10 do histórico continua fora dos commits.
- Novo callback opcional para LinhaEsvaziada({codigoLinha}) no hub compartilhado, validando código e removendo somente veículos/evidências da linha no hook. Preservados evento PosicaoAtualizada, donos das inscrições, cancelamento/reinscrição, seleção, filtros, favoritos e identidades V2.
- gpsSnapshotGuard compartilha timestamps GPS observados e tokens de leitura entre SignalR e o helperREST existente: vazio bloqueia GPS igual/menor, observação nova legítima reaparece, pedidos anteriores ao vazio/snapshot/conexão são descartados por linha. Reconexão automática e start manual invalidam leituras pendentes. Sem novo polling, persistência, ETA ou inferência de identidade.
- Reconciliação WIP reaproveitada para remover identidade transferida mesmo quando o consumidor antigo não observa a nova linha e a linha anterior ainda tem outros veículos. Presença mantém suas regras de terminal, chegada confirmada e retenção180s; evidência ganha código para limpeza seletiva. Timer existente expira GPS em foreground também com flagOFF, sem renovar timestamps:1sON/15sOFF, limpeza na volta ao foreground e remoção no próximo tick após180s.
- Regressões RED comprovadas para handler ausente, transferência entre consumidores e REST atravessando reinício manual. Final:45testes GPS/presença/Favoritos (21novos+24existentes) e22indicadores/geometria aprovados, zero falhas/ignorados; TypeScript --noEmit e ESLint dos8arquivos da integração aprovados. Lintglobal com5erros__dirname em4testes anteriores e3avisos fora da correção; sem alterações nesses arquivos.
- Validado fluxo de handlers/hook/componente nativo/script injetado reais com transporte, executor React, DOM e MapLibre simulados: Marker/Popup/heading/DR/índice removidos e animação cancelada; outro marcador, HTML, geometria e handshake map_ready preservados. mapOSM.tsx revisado e inalterado; mapScript.ts só versionado na base autorizada. Smoke Android/browser/WebSocket real não executado; nenhum APK gerado.
- Comparação com cópia inicial dos23caminhosWIP:13não relacionados idênticos porSHA256; cinco arquivos da base visual também byte a byte iguais; histórico anterior preservado integralmente como prefixo. Backend limpo em204caef. Sem alteração de main/PR, push, merge/rebase/reset/checkout, EAS, deploy, CI/CD, lockfile ou dependências.
- VALIDACAO_REMOCOES_GPS.md documenta contrato, antes/depois, comandos/testes exatos, limites de memória/relógio e pendência de smoke. Guard em memória limitado a5000identidades/janelaGPS180s; evento sem cursor global não oferece ordenação durável entre fontes/processos. Commit da integração separado da base WIP.


### 2026-10-28 — PhysicalPresence no mapa e radar
- Coleção física independente, conexão SignalR compartilhada, flag EXPO_PUBLIC_PHYSICAL_PRESENCE_ENABLED OFF. Coordenadas fixas, idade física 300/600 s e deduplicação por namespace operacional; radar exige parada/modal/linha compatíveis. Sem ETA ou confirmação de partida.
- Typecheck e testes de contrato/hub/WebView executados; WIP anterior preservado fora do commit. Aquisição SPPO real ainda excede o teto de 12 páginas: não há promessa de marcadores reais SPPO neste checkpoint.


### 2026-10-28 — Radar por linha e checkout PhysicalPresence reproduzível
- Corrigida a prop física que o commit anterior passava ao MapControls; agora chega ao RadarParada. Verificado em worktree limpo sem WIP: typecheck aprovado. Radar aceita velocidade zero de linha realmente atendida em qualquer parada da linha, filtra modal/associação e mantém instalação de origem nomeada, separado de chegadas/ETA.
- Desconexão limpa coleção física; ordenação aceita reinício do servidor e rejeita publicação antiga. Runner scripts/test-physical-presence.cjs independente do harness WIP: nove testes. Transporte SignalR backend testado em loopback; recepção/aparência em Expo real ainda pendentes por ausência de dispositivo/ADB. WIP e laboratórios preservados.


### 2026-10-29 — Correções de toque e radar PhysicalPresence no Expo
- Somente branch feat/radar-confiabilidade-entrega-1, preservando WIP. Marcador físico passa a interceptar o clique antes de chegar ao mapa, com alvo de toque 44 px, identificação de origem no DOM e fechamento do popup ao remover/expirar o marcador. Posição e idade continuam físicas; nenhuma projeção adicional.
- Radar compacto considera veículos físicos elegíveis ao observar conteúdo para recolhimento automático, sem alterar o recolhimento manual. Detalhe da parada recebe a mesma coleção e modal do mapa/radar e compartilha a seção separada de chegadas. Filtros preservados: velocidade exatamente zero, linha ativa realmente atendida, modal, associação validada e contexto disponível; sem ETA ou confirmação de partida. Linha informada/herdada e origem da instalação continuam visíveis.
- Regressões inicialmente vermelhas reproduziram popup fechado pelo clique, recolhimento após duas consultas vazias mesmo com presença e ausência da seção no detalhe. Final: node scripts/test-physical-presence.cjs 10/10; node scripts/test-radar.cjs 52/52; node src/services/gpsRemovals.test.cjs 64/64; pnpm exec tsc --noEmit aprovado. Casos incluem toque/expiração/deduplicação, linhas/modais incompatíveis, velocidade 6 ou desconhecida rejeitada e limites 299/300/599/600 s no detalhe.
- Limite de dead-reckoning e GPS operacional inalterados. Sem mudanças no backend, novas consultas reais, deploy, commit, merge, rebase ou push. Main frontend preservada em c69a92ea161e749b77842d35f82e14a86cbfc66e. Validação por harness determinístico; toque/layout no Expo Go físico ainda requer recarregar o aplicativo com EXPO_PUBLIC_PHYSICAL_PRESENCE_ENABLED=true e abrir uma parada atendida pela 838 quando houver veículo elegível.


### 2026-10-29 — Identidade visual compartilhada de veículos físicos
- PhysicalPresence reutiliza busIcon/applyVehiclePresentation/renderIndicator, mesmas dimensões e preferências Padrão/Clássico/Realista dos veículos operacionais. Cor por linhaId validado e modal no catálogo já enviado ao mapa; sem associação válida usa o fallback existente do mapa. Eliminada a bolinha roxa. Cor não deriva de viagem nem apenas do código 838.
- Popup e seção compartilhada do radar/detalhe distinguem InsideReviewedGeometry (No terminal), NearTerminal (Próximo ao terminal), UncertainLocation (Localização incerta/precisão não confirmada); campo desconhecido nunca confirma interior. GPS físico com 300–599 s continua translúcido/com aviso e com 600 s oculto. Não se declara viagem ativa/partida/ETA a partir de presença. Coordenada ITS não passa por snap nem projeção.
- Precedência operacional preservada; memória transitória limitada a 5000 timestamps por modal/ID, com limpeza após 600 s, impede replay físico igual/mais antigo depois da retirada do operacional. Somente GPS físico posterior pode reaparecer. Fluxo operacional de posição/matching/DR inalterado, inclusive limite de segurança de 60 s.
- Testes: scripts/test-physical-presence.cjs 14/14; scripts/test-radar.cjs 52/52; src/services/gpsRemovals.test.cjs 65/65; scripts/test-indicadores.cjs 22/22; pnpm exec tsc --noEmit e diff --check aprovados. Regressão 838 handoff keeps the bus model and line color without replaying older ITS or snapping percorre updateMap/MapLibre simulados e confirma transição, cor/desenho iguais, coordenada externa à rota e supressão ao retorno operacional. Sem novas consultas reais; aparência/toque no Expo Go físico pendentes de recarregar a branch com flag PhysicalPresence habilitada e acompanhar a 838/Campo Grande.
- Trabalho apenas em feat/radar-confiabilidade-entrega-1, WIP preservado; main continua c69a92ea161e749b77842d35f82e14a86cbfc66e. Sem alteração de backend, deploy, commit, merge, rebase ou push.


### 2026-10-29 — Cartão físico compartilhado e cobertura 838
- Popup físico chama buildPopup dos ônibus normais, com as mesmas classes/header/ordem/cor/espaçamento/toggle. Ramo físico omite velocidade, próxima parada, sentido/ETA; mostra idade original, localização, origem da linha e partida não confirmada. Atualiza cartão aberto com GPS posterior e fecha outros cartões físicos/operacionais ao abrir. Radar explicita instalação observada e sentido/próxima viagem não confirmados, sem alterar chegadas.
- Nova coleta real limitada: seis GETs (duas rodadas REST/ITS/GTFS, teto 512 KiB por resposta, timeout 6 s, intervalo 31 s). Em 2026-10-29T16:29:35Z, registros ITS com idade inferior a 600 s: três IDs distintos até 200 m de Campo Grande e um de Magarça. Não comprova interior/embarque/elegibilidade pública. Catálogo local da 838: Campo Grande instalação 5144O00424T9 (-22.901912,-43.555331), embarque Plat.A 5144O00486P9 (-22.901600,-43.555350); Magarça parada alimentadora 5151O00177C0 (-22.968440,-43.622120), sem perímetro revisado.
- Caso real GPS operacional 155 s versus ITS 48 s/280 m, GTFS bruto sem essa identidade nas duas leituras. Outros registros brutos tinham 22–48 s e API 52–79 s: coleta/cache/processamento ainda exigem correlação alinhada por geração, sem atribuir todo o atraso ao matching. PhysicalPresence atual limita publicação a âncoras e suprime caches ativo/recente, portanto não resolve esse caso ao longo do itinerário. Nenhuma alteração de matching/ETA/viagem, limite 60 s, backend ou produção aplicada.
- Validação: PhysicalPresence 15/15; radar 52/52; GPS 65/65 e typecheck aprovados. Cartão testado no script real com DOM/MapLibre simulados, sem confirmação de tela Expo Go. Branch de desenvolvimento/WIP e main preservados, sem commit/push/deploy.


### 2026-10-29 — Arbitragem de coordenadas ITS/GTFS no mesmo marcador
- Hook físico assina line:838 pela conexão compartilhada, além das instalações; aceita positivos fora do terminal, reconcilia duplicatas dos escopos pelo modal/ID oficial e timestamp físico. App preserva somente alternativas posteriores e da mesma linha se houver operacional. Objetos operacionais, chegadas/ETA ematching não recebem dados ITS.
- WebView aplica GPS físico mais recente no próprio marcador operacional, interrompe animação antiga e suspende DR enquanto localização ITS estiver selecionada. Atualizações operacionais anteriores à evidência ITS não rebobinam posição; GTFSigual/maisnovo reassume. Sem snap/heading/velocidade inferidos de ITS. Idade300/600 aplica opacidade/ocultação mesmo se não houver novo GPS. Modelo/cor compartilhados e cartão normal preservados; fonte ITS_CURRENT indicada no detalhe, instalação separada de sentido/próxima viagem.
- Testes:15PhysicalPresence,66GPS,52radar aprovados; typecheck aprovado. Caso ITS newer coordinates update one operational marker without projection and GTFS can reclaim it verifica mesma instância, nenhum segundo marcador, GPS antigo ignorado, coordenada ITS fixa no relógio, sem sinal após600s e retorno GTFSnovo. Backendnovo validado com WebSocketrealemloopback; versão produtiva158 ainda não fornece o canal e não houve novo deploy nem confirmação visual do novo fluxo no celular. Duas consultasITSreais mostraram minuto corrente completo/GPSmínimo5s; não garantem atualização universal.
- Manter EXPO_PUBLIC_PHYSICAL_PRESENCE_ENABLED=true e API/SignalR no mesmo backend atualizado. Configuração completa e ativação/rollback em backend tools/PHYSICAL_PRESENCE_838_ALTERNATIVE.md. Main c69a92ea161e749b77842d35f82e14a86cbfc66e e WIP preservados; sem commit/merge/rebase/push.


### 2026-10-29 — Localização unificada 838 selecionada no backend, canário 160
- Novo opt-in EXPO_PUBLIC_UNIFIED_LOCATION_838_ENABLED, padrãoOFF no código/ON somente no Expo local. Hook usa hub compartilhado/inscrições por consumidor, envelope versionado/revisão/tempo de composição, reconexão e rollback explícito quando o servidor não oferece o método. Nenhuma consulta externa de GPS por usuário.
- Mapa838 recebe uma posição por identidade escolhida no backend, mantendo estrutura/cor/ícone/popup/map_ready. Nesse caminho a WebView ignora presença física legada da838, aplica ITS exata e estática, sem snap/DR ou fração GTFS antiga. GTFS elegível usa projeção operacional do mesmo timestamp; limite60s preservado. Demais linhas e fluxo legado permanecem disponíveis.
- Testes finais20presença/contrato/hub e67GPS/WebView, zero falhas; pnpm exec tsc --noEmit aprovado. Inclui contrato inválido/regressivo, expiração, um marcador, coordenadaITS fixa, retomadaGTFS, reconexão e servidor antigo sem método. Sem atualização de pacotes/lockfile ou buildEAS.
- Canário backend160 publicado e mantido com Redis isolado/REST/SignalR; recuperação real após reiniciarAPI confirmada. Expo Go doM2101K6G conectado ao Metro com flagtrue; diagnóstico de desenvolvimento limitado a20eventos confirmou Marker.getLngLat igual à seleção real, inclusive ITS31s versusGTFS/operacional61s. Usuário confirmou atualizaçõesITS/GTFS; relatou veículos lateralizados/saltos e preferiu tratar depois. Não houve captura automática de tela, poisADB não reconheceuUSB; não confundir runtime confirmado com aceite visual completo.
- Metro reiniciado com flag explícita após valorfalse permanecer no runtime anterior; projeto reaberto pelo usuário/838selecionada. Mainc69a92ea161e749b77842d35f82e14a86cbfc66e e branch/WIP preservados, sem commit/merge/rebase/push. Detalhes/rollback no relatório backend docs/02-arquitetura/10-gps-multifonte-publicacao-838-20261029.md. Orientação/suavização, conflitos submétricos e descoberta sem serviço ficam pendentes.


### 2026-10-29 — Piloto unificado 843 ao lado da 838, backend165
- Hook/contrato/hub/mapa passam a manter snapshots e inscrições independentes 838/843, com flags opt-in distintas; flag pública843 acrescida ao .env.local sem alterar outros valores. Mesmo ícone/cor/shape/popup, uma identidade por veículo durante troca, expiração por GPS/vínculo e campos de sentido/padrão/parada limpos quando sem projeção operacional. WebView ignora árbitro físico legado só nas coortes opt-in; ITS sem DR/snap, horizonte operacional60s preservado; orientação/suavização não alteradas.
-25testesdirecionadospresença/contrato/hub,67GPS/WebViewanterioresenovocaso843fimafimisoladoaprovados;typecheckaprovado. Backend224testes/canário165realcom4veículos843/33avançosrecentes;runtimeExpoGoconfirmou11posiçõesdistintasexatasem4veículos,usuárioconfirmouvisual/cartãoITS/viagemnãoconfirmada,838preservada. Bufferdiagnósticoamostrado,nãocensodetodasaspublicações;semscreenshotautomatizado.
-843semGTFSoperacionalválidonajanela(dependênciasestruturaisagência/origemausentes),semETA/sentidoinventados. Rollback162exercitadoporerrodeordemnoverificadorderestart,mesmo165restauradocomrevisõespreservadas/aparelhoreconectado. Frontendmainc69a92ea161e749b77842d35f82e14a86cbfc66eintocada,branchfeat/radar-confiabilidade-entrega-1eWIPpreservados,semcommit/push/merge/rebase/EASbuild/update. Detalhesnorelatóriobackend15-gps-piloto-publico-843-20261029.md.


### 2026-11-03 — R28: Android USB, evidência real e correção visual dos cards
- Validação no M2101K6G/Android 13/Expo Go por ADB reverse: saída real de D86111 em Magarça, avanço visual sem confirmação operacional, confirmação GTFS posterior; alternâncias ITS/GTFS e popup com identidade/expansão preservadas. Pausas medidas por horizonte, teto espacial e source_conflict, sem ampliar projeção. Há latência residual na sessão de desenvolvimento; não declarar fluidez integral aprovada.
- Design anterior do terminal explicitamente rejeitado pelo usuário, reproduzido após cache Metro vazio. Radar compacto e painel expandido passam a usar o mesmo renderizador completo dos cards operacionais. Textos técnicos repetitivos removidos do layout, evidências internas e lógica GPS preservadas. Antes/depois conferidos no Android; aceite visual humano pendente.
- 289 testes, TypeScript e ESLint aprovados; benchmark P0 com zero projeções em ticks. API/Redis/Postgres somente observados, sem deploy ou alterações de produção. Branch/main e WIP preservados, sem commit/push. Relatório: docs/02-arquitetura/28-validacao-android-usb-20261103.md.

### R28 candidata — 03/11/2026: desempenho e radar para passageiros

Cache compartilhado das projeções de paradas, conteúdo de painéis ocultos desmontado após animação e loop ferroviário suspenso sem trens. Radar rápido limitado a dois cards; prioridade comum por parada, permanência observada, detalhes e GPS físico até cinco minutos. Ordens de itinerário deixam de ser números globais da parada. 310 testes R28 aprovados; medições e limitações em `docs/02-arquitetura/28-auditoria-desempenho-android-20261103.md`. Sem publicação.


R28 candidata — 03/11/2026: radar prioriza permanência confirmada e progresso comparável pelo itinerário; preserva histórico no mesmo GPS entre trackers, eventos operacionais e detalhes compartilhados. 324 testes aprovados; TypeScript/lint limpos. Android USB e pendências no relatório 28 de auditoria; proposta de permanência persistente documentada separadamente, sem backend/publicação.


## 2026-11-05 — Consolidação Git funcional e preparação do Radar

Worktree isolada chore/principal: origem origin/ajustes4dc7afc com linhagem de43a67 e Radar/GPS27 funcional; cinco conflitos resolvidos preservando reconciliação/identidade/remoções. Startup aprovado PR33 preservado; Home restaurado do backup anterior ao laboratório. Captura/input-lab/perf R28 retirados do fluxo normal; popups/título completo aprovados reintegrados. Testes405aprovados/0falhas/3replays privados opcionais, TypeScript e lint aprovados. Fixtures só catálogo público+GPS sintético, sem captura privada. Sem alterar APK. Relatório docs/consolidacao/README.md. Após validação, criar feat/radar-notificacoes do commit chore/principal. WIP original e main preservados;sem deploy, alteração de infraestrutura/produção/credenciais, exclusão ou notificações implementadas.

## 2026-11-06 — Radar N5-C0: checkpoint local da integração Android N5-B

Consolidado o WIP sobre3c035ac em feat/radar-notificacoes: cliente remoto serializado sem polling de chegadas, credencial/enrollment/token em SecureStore, confirmação de posse via Push, contexto operacional, recuperação e expiração explícita de uma hora. Preservados hook/tela Radar, suspensão do publisher local no modo remoto, handler compartilhado, testes existentes e timeout compatível com React Native/Hermes usando AbortController + setTimeout/clearTimeout, sem AbortSignal.timeout. Adicionados somente expo-crypto/expo-secure-store compatíveis com SDK55; lock existente preservado.

Modo remoto continua opt-in por EXPO_PUBLIC_RADAR_REMOTE_ENABLED=true, com EXPO_PUBLIC_RADAR_API_BASE_URL separada, HTTPS obrigatório salvo localhost/127.0.0.1 em desenvolvimento e bloqueio explícito ao pacote com.guilhermedesales.nononto.dev. app.config referencia arquivo Google externo via NOPONTO_DEV_GOOGLE_SERVICES_FILE; nenhum JSON privado, credencial FCM ou chave incluído. .easignore exclui fontes nativas geradas e arquivos sensíveis do upload. Usar outro pacote exige revisão deliberada do bloqueio, configuração Firebase/FCM/EAS e perfil Android; não basta alterar URL.

Operador confirmou no Redmi Note11 enrollment, sessão de uma hora e recebimento real em segundo plano com previsões838/884 pelo DevHost. Persistem acúmulo em vez de substituição, comportamento ao tocar/abrir, conteúdo repetitivo e mensagem sem chegadas seguida de ETA. Tag/collapse não comprovaram apresentação única; TTL não remove notificação já exibida. Sem métricas consolidadas nem homologação física dos demais cenários. Referência técnica: docs/radar-n5b.md no repositório backend.

Checkpoint sem alteração de código funcional, builds ou testes novos; validações anteriores não repetidas. Nenhuma execução Expo/ADB/Docker/SSH, reinício, mudança de credenciais, main, push Git, merge ou deploy. Arquivos privados/artefatos permanecem fora do checkpoint. Pendências não foram corrigidas nesta etapa.

## 2026-11-06 — Radar N5-C4: perfil APK standalone conectado à API HTTPS

Baseaacad2b em feat/radar-notificacoes. Novo perfil EASradar, developmentClient=false/distributioninternal/buildTypeapk, APP_VARIANT=radar e ambiente EASdevelopment para reutilizar a variável de arquivo Firebase já provisionada. APK NoPonto Radar reutiliza applicationIdcom.guilhermedesales.nononto.dev/projectExpooriginal, sem alterar perfis Dev/production nem dependências/SDK. Compartilha identidade com Dev instalado, não pode coexistir com ele; não houve desinstalação ou alteração do aparelho. Arquivo cliente externo confirmou projetoFirebase noponto-2d820 e pacoteDev; sem ler chave privada FCM nem exibir/copiar APIkeys/segredos ao Git. Credencial FCMV1 remota foi confirmada pelo operador anteriormente, não reconsultada agora.

URL confirmada pelo operador em variáveis do perfil: https://duplicity-wisplike-friend.ngrok-free.dev para REST/Radar e wss correspondente no SignalR. Cliente continua lendo EXPO_PUBLIC_RADAR_API_BASE_URL, sem hardcode da URL nele; standalone valida HTTPS/origem incorporada pelo build/pacote autorizado, Dev mantém exceção HTTPloopback. app.config valida coerência REST/SignalR/opt-in, inclui SecureStore e exige variável Firebase durante EAS_BUILD. Timeout AbortController e contratos individuais de enrollment/permissões/sessões/expiração preservados. .easignore reforçado para dotenvs; nenhum JSON privado versionado.

GETs HTTPS sem credencial às rotas instalação/push/sessão responderam401JSON, sem criar instalação/sessão ou alterar backend. Seis testes Node puros da configuração aprovados/zero falhas; sem Expo/EAS/runtime nativo ou build. Documentação e comandos manuais em docs/radar-n5c4-apk.md na raiz do repositório. Diff/segredos revisados; sem TypeScript completo, suites extensas, APK, teste físico, build, Expo/EAS/Docker/ADB/SSH, alteração de servidor/Metro/backend ou pushGit. Problemas visuais continuam pendentes; disponibilidade contínua do túnel e recebimento real nessa variante precisam de validação posterior.
