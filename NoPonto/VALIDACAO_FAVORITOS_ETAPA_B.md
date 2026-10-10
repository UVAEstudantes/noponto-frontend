# Favoritos — Etapa B

Implementação preparada em 10/10/2026. Nenhum teste, build, lint, deploy ou comando Git executado. A revisão foi por leitura do código; aparência, contratos em ambiente real e integração precisam de validação no dispositivo.

## Auditoria e implementação

- `app/index.tsx`: antes, geometria, eventos e lista dependiam do modal selecionado; o ferroviário só era habilitado em Trem. Agora `viewMode`, `normalModal` e `searchCategory` são separados. Somente `normalModal` usa a persistência de modal existente. Favoritos e Todos são categorias de interface, sem novos registros no backend.
- `SearchSections`: a ação de favorito é opcional e fica em uma área irmã da seleção do resultado. Habilitada em Linhas e Horários; removida a estrela redundante dos detalhes. Busca do mapa conserva seu consumidor sem estrela. `BotaoFavorito` também interrompe propagação de toque e pressão longa nos cards.
- `LinhasContainer`: estrelas nos cards normais; Favoritos integrado ao seletor com largura mínima de 104 px e rolagem horizontal. Removido botão separado. Todos os favoritos têm identificação do modal, estrela, controle de participação no mapa e acesso às configurações. “Adicionar à lista normal” é uma ação explícita e respeita o limite normal de dez.
- `mobilidadeRio`: Todos consulta `GET /linhas?nome=...&page=...&pageSize=...`, sem `modalId`, `tipoRota` ou `excluirTipoRota`. Demais categorias continuam resolvendo o ID persistido em `/modais`. Resultados usam a identidade individual de `categoriaLinhaV2`, preservando UUID e modalId. Histórico Todos reúne categorias; debounce, AbortController e paginação do serviço são mantidos. A tela do mapa continua solicitando a primeira página de 20, como antes.
- `linhasEfetivas`: configuração salva prevalece sobre temporária, incluindo cor, ativa, sentido e marcadores. Favorita não selecionada recebe apresentação em memória com ambos os sentidos e paradas visíveis; Santa Cruz conserva a cor de ramal. Nenhum ID de sentido/versão é criado. Os padrões publicados V2 e suas ocorrências continuam carregados pelo serviço existente e cacheados por versão.
- Limite operacional: até dez favoritas elegíveis são exibidas automaticamente. Com mais de dez, a escolha deve ser explícita: nenhuma primeira dez é escolhida silenciosamente. O mapa apresenta ação para abrir a lista e escolher; cada olho controla participação nessa visualização. Configuração inativa permanece oculta até ativação explícita nas configurações. A coleção persistida de favoritos continua ilimitada. Escolha de participação e configurações temporárias são apenas desta sessão.
- `useMobilidadeRio`/`gpsHub`: inscrições rodoviárias independentes do carregamento estrutural, usando somente linhas ativas efetivas. Um hub compartilhado, um listener por consumidor ativo, união de inscrições por consumidor, reconciliação serial, cancelamento das inscrições sem consumidor e restauração após reconexão. O contrato SignalR continua por código; a renderização confere também UUID, sentido e versão.
- `useRailRealtime`: habilitado quando há Trem/Metrô efetivamente visível e tela focada. Uma linha usa filtro por UUID; várias usam snapshot agregado e filtragem local antes de hidratar geometria. Deduplicação pela identidade ferroviária existente. Polling suspenso sem linhas ferroviárias visíveis ou fora de foco; falhas continuam agendando recuperação. Favoritos não habilita veículos de demonstração. Não alterado runtime backend.
- Radar único e ParadaSheet recebem linhas efetivas. O contexto Todos aceita diferentes modais, mas continua separado por paradaId/plataforma, linha, sentido e versão. Escolha manual permanece enquanto a plataforma é elegível; fora do contexto mantém aviso e opção automática. Mantidos histerese, ETA, polling de eventos e recolhimento existentes.
- `MapControls` e `BuscaMapa` foram inspecionados e reutilizados sem alterações de layout: identidades adicionadas ao catálogo de apresentação habilitam estrela e camadas. O dropdown recebe Todos por props. Metrô aparece quando identificado no catálogo ou nas favoritas/modal restaurado; dados somente se houver integração operacional.

## Arquivos desta etapa

- `app/index.tsx`, `app/linhas.tsx`
- `src/components/searchSections.tsx`, `src/components/botaoFavorito.tsx`
- `src/components/mapaComponents/linhasContainer.tsx`
- `src/constants/modaisMapa.ts`
- `src/hooks/useMobilidadeRio.ts`, `src/hooks/useRailRealtime.ts`, `src/hooks/useRadarParada.ts`
- `src/services/gpsHub.ts`, `src/services/mobilidadeRio.ts`, `src/services/searchHistory.ts`, `src/services/radarParada.ts`
- Novo `src/services/linhasEfetivas.ts`
- Novo `src/services/favoritosEtapaB.test.cjs`
- Este roteiro e atualização incremental de `HISTORICO.md`.

Preservados `app/favoritos.tsx` (Rotinas), `useFavoritos`, serviço/persistência da Etapa A, storage de linhas normais, percursos da tela Linhas, tarifas/pagamentos, POIs, tema global, navegação, algoritmos GPS/ETA/ML, inicialização e regeneração da WebView. Essas funcionalidades precisam ser incluídas na regressão manual, sem presumir validação de execução.

## Comandos PowerShell para execução pelo usuário

```powershell
Set-Location 'D:\repositorio_github\NoPonto\noponto-frontend\NoPonto'
node --test .\src\services\favoritosEtapaB.test.cjs
node --test .\src\services\favoritos.test.cjs .\src\services\carregamentoInicial.test.cjs
npm run start:local
```

A suíte nova prepara verificações de configurações temporárias/salvas/inativas, limite e escolha explícita, restauração normal, Radar multimodal e plataformas, requisição Todos/paginação/signal, BRT isolado, histórico, hub compartilhado/limpeza/reconexão, snapshot agregado/deduplicação/suspensão e áreas de toque da busca. Ela usa mocks e transpilação em memória; não substitui validação de integração ou verificação de tipos no projeto.

## Roteiro manual — 24 regressões

1. Linhas e Horários: pesquisar 838, 10 e Santa Cruz nos respectivos modais; conferir estrela nos resultados e ausência de estrela nos detalhes.
2. Tocar estrela: atualizar imediatamente sem selecionar resultado, abrir percurso ou registrar nova seleção de busca. Tocar restante: selecionar normalmente. Pressão longa na estrela não deve abrir remoção/configuração.
3. Cards selecionados: estrela, configuração ao tocar restante, Limpar, lixeira e configurações continuam funcionando.
4. Favoritar em Linhas, navegar ao mapa: conferir sincronização imediata. Desfavoritar no mapa e conferir Linhas.
5. Abrir lista: Favoritos deve estar dentro do seletor; rolar horizontalmente em tela estreita e conferir todos os textos.
6. Escolher BRT normal, entrar Favoritos, sair para BRT: recuperar linhas/configurações normais e modal salvo. Repetir abrindo Favoritos antes de terminar hidratação.
7. Em Favoritos, iniciar busca Todos: inspecionar rede para ausência dos três filtros no GET /linhas.
8. Buscar termo compartilhado por diferentes modais: conferir resultados Ônibus, BRT e Trem quando existentes; códigos, nomes e UUIDs reais.
9. Escolher BRT na busca de Favoritos: mapa continua em Favoritos, busca usa ID persistido exclusivo de BRT, sem filtro misto de Ônibus.
10. Conferir ícones e cores individuais em Todos, sugestões e histórico. Trocar categoria com pedido pendente: descartar resposta antiga, manter termo e debounce.
11. Favoritar uma linha não selecionada: ela aparece em Favoritos sem ser adicionada à lista normal. Sair e conferir lista normal inalterada.
12. Favorita já selecionada: mudar cor/sentido/marcadores, entrar e sair de Favoritos; configurações permanecem.
13. Favorita selecionada inativa: permanece oculta, inclusive após GPS/realtime. Ativação exige ação explícita nas configurações.
14. Favoritar 838, SV866, 10 e Santa Cruz, entrar Favoritos: conferir geometrias e veículos simultâneos quando houver dados reais.
15. Alternar ida/volta/ambos: conferir linhaId, sentidoId e padraoVersaoId dos veículos e geometrias. Sentido inexistente não deve liberar ambos silenciosamente.
16. Conferir ausência de geometrias e veículos duplicados; IDs road:/rail: permanecem distintos.
17. Conferir um hub rodoviário e polling ferroviário simultâneos. Ocultar rodoviária cancela inscrição sem afetar Trem; ocultar última ferroviária suspende polling. Desconectar/reconectar rede restaura inscrições visíveis.
18. Fechar/reabrir aplicativo: favoritos persistem, lista normal e último modal preservados; ao entrar Favoritos recria apresentação temporária sem gravá-la na lista normal.
19. GPS atrasado e WebView recarregada: mapa carrega sem aguardar localização; dados e linhas reaparecem quando WebView pronta; Radar acompanha GPS posterior.
20. Trocar normal/Favoritos repetidamente: sem listeners adicionais, dados de linhas ocultas ou perda de configurações. Categoria da busca não deve ser reescrita ao sair.
21. Radar: monitorar plataforma automática/manual, trocar categoria de busca sem mudar plataforma, ocultar linha, manter aviso de escolha manual fora de contexto; Ver todos deve usar somente eventos elegíveis.
22. Criar mais de dez favoritas elegíveis: nenhuma primeira dez automática; aviso no mapa e todos os cards presentes; escolher até dez, tentar décima primeira, substituir escolhida; favoritas inativas não contam. Não apagar itens persistidos.
23. Simular API/offline e falha de storage: mostrar erro/recuperação sem apagar favoritos, manter configs e descartar respostas antigas após mudança de contexto.
24. Repetir em claro/escuro e tela estreita; conferir estrelas douradas, seletor legível, contraste, dropdown, controles e Radar. Validar também Santa Cruz, percursos de Linhas, Rotinas, tarifas, pagamentos e POIs.

## Riscos e pendências de validação

- Resultados e veículos dependem dos dados publicados/realtime do ambiente; ausência legítima de eventos não cria previsões.
- Metrô usa integração ferroviária existente; catálogo não garante disponibilidade de snapshot operacional.
- SignalR continua recebendo códigos conforme contrato existente. Colisão de códigos entre UUIDs é evitada na renderização pelo filtro de linhaId, mas o servidor pode enviar dados adicionais para o mesmo código.
- Aparência, toque em Android/iOS, reconexão real, snapshot agregado, bootstrap/GPS e regressão normal ainda precisam ser validados. Nenhuma execução de teste ou compilador foi realizada.
