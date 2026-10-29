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
