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
