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
