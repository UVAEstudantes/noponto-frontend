# Banda NoPonto — primeira etapa, 07/11/2026

## Resultado e limites

Implementada somente a restrição ferroviária por múltiplas linhas, do hook ao controller, e a proteção contra consulta com seleção explicitamente vazia. Instrumentação, deduplicação GPS e suspensão de inscrições ficam com desenho e critérios de validação abaixo, sem mudança de comportamento nesta etapa. Aquisição, validade GPS, interpolação, contratos de posição e Radar remoto não foram modificados.

Sem deploy, EAS Build, Docker, migrações, commit, push, alteração de credenciais, infraestrutura ou Firebase. Os testes .NET compilaram o projeto local normalmente; não executaram o bootstrap da API nem suas migrações. Fontes locais anteriores do Radar e o relatório de auditoria foram preservados por comparação SHA256.

## Estado inicial e correspondência com produção

| Item | Evidência desta execução |
|---|---|
| Frontend | HEAD `046365d`; sete arquivos rastreados com alterações anteriores do Radar; cinco arquivos não rastreados incluindo auditoria e diagnóstico/transporte/testes do Radar. Doze arquivos preexistentes protegidos por manifesto SHA256 em diretório temporário. |
| Backend | HEAD `99856ba`, o mesmo auditado. Sem diff rastreado inicial; mantidos `.deploy/__pycache__/` e diretórios de artefatos N4-A/N4-B/N5-A/N5-B não rastreados. |
| Base de fontes produtiva documentada | `6955389dbe86560fa9538021ae072707bda504ba` reconstrói network-27 + ETA `823057c`. Comparação das 613 entradas de `docs/consolidacao/backend-proveniencia.json` contra **HEAD anterior à correção**: 612 hashes normalizados iguais, zero ausentes; única diferença `Program.cs`. Este coincide com a base removendo somente uma linha `AddRadar`. |
| Componentes relevantes | `git diff 6955389... HEAD` sem diferenças em controller ferroviário, GPS, hub, presença física e eventos. A correção ferroviária deste trabalho passa a ser uma diferença intencional posterior. |
| Imagem publicada documentada | `docs/radar-n5c3-deploy.md` e `artifacts/eta-hybrid-v1-step2i/report.md` registram a imagem `noponto-api:eta-hybrid-2i-823057cd2a88`, ID `sha256:946a0bb63230681bd31397718d483a3c3bb759310c941fba10d8c58346112ce7`. Evidência histórica, não inspeção ao vivo. |
| Cadência publicada histórica | O relatório de 05/11 registra 65 ciclos normais, intervalo entre inícios mediano 15 s, configuração 15 s. Portanto o default local de 20 s da auditoria **não comprova cadência operacional**. A taxa de bytes de snapshots iguais a cada 15 s seria 33,3% maior que a cada 20 s, mantidas as demais premissas. |
| Produção atual | Não confirmada ao vivo. Nenhum SSH/Docker/consulta ao túnel foi executado. A API auditada não expõe aqui um endpoint de identidade de release. Não inferir imagem/flags atuais a partir do histórico ou da branch. |

Para confirmar futuramente sem deploy: extrair no servidor apenas revisão/digest e hash da DLL dos metadados ativos já existentes, sem exportar env/configuração privada; compará-los ao manifesto da release efetiva. Essa identidade deve ser combinada com flags/cadências agregadas e versão do APK. Não substituir produção pelo Compose genérico do checkout para obter essa evidência.

Os diffs anteriores do Radar incluem estado de operação, restauração de configuração, proteção contra ações duplicadas e diagnóstico HTTP/push. Não foram reaplicados, sobrescritos ou incorporados às mudanças ferroviárias.

## Correção ferroviária implementada

Arquivos de produção:

- Backend `NoPonto/1-API/Controllers/RailVehiclesController.cs`.
- Frontend `NoPonto/src/services/railRealtime.ts` e `NoPonto/src/hooks/useRailRealtime.ts`.

Contrato aditivo:

```text
GET /rail/vehicles/snapshot?linhaIds=<guid-A>&linhaIds=<guid-B>
```

O array usa parâmetros repetidos, formato padrão do model binding MVC. O controller converte a seleção em conjunto e a aplica **antes de `Select(RailVehicleSnapshotDto.From)` e `ToArray()`**. O resultado `Ok` já contém somente DTOs elegíveis, antes da serialização. Não filtra ou modifica o snapshot global do provider.

`linhaId` e `sentidoId` continuam opcionais; quando combinados com `linhaIds`, todos são interseccionados. Array ausente ou vazio no backend conserva o contrato antigo, inclusive binders que representem ausência por array vazio. Não inventamos uma semântica de negação para chamadas antigas sem filtro. Validação de GUID usa o binding normal de `[ApiController]`, sem parse manual permissivo.

O hook passa o conjunto selecionado ao service, mantém a filtragem defensiva do retorno antes de carregar geometrias e preserva deduplicação por veículo, interpolações e intervalo de 5 s após concluir a consulta. Uma seleção explicitamente vazia não cria timer nem HTTP; o service também recusa esse pedido devolvendo `null`. O fluxo normal da tela já desabilitava polling sem linhas ferroviárias, portanto essa proteção não representa economia adicional garantida nesse fluxo.

O service usa `URLSearchParams` para os parâmetros repetidos e mantém o wrapper `api.ts` intacto. Teste com o construtor real de URL comprova que filtros antigos de direção coexistem com o array. Não houve mudança de cache, tempos ou geometria.

Compatibilidade operacional: backend novo atende clientes antigos. Cliente novo contra backend antigo mantém a proteção visual no cliente, mas o servidor antigo pode ignorar `linhaIds` e transferir a rede inteira. A economia de seleção múltipla requer as duas pontas atualizadas; a ordem recomendada para uma publicação futura é backend primeiro, sem publicação nesta execução.

## Medição e economia

Teste `MultipleLines_FilterBeforeSerializationAndKeepSnapshot` serializou com `System.Text.Json` e opções Web dois resultados da mesma amostra artificial, sem HTTP nem compressão:

| Corpo JSON sintético | Bytes UTF-8 |
|---|---:|
| Três veículos de três linhas | 3.654 |
| Dois veículos das duas linhas selecionadas | 2.459 |
| Diferença medida | **1.195 (32,7%)** |

Essa é medição do corpo de teste, não de bytes ngrok, headers ou wire bytes. O resultado do controller é verificado antes e depois da serialização; o veículo excluído não consta do contrato público e o snapshot de origem permanece íntegro.

**Estimativa condicional:** se essa economia de 1.195 bytes se repetisse a cada 5 s, durante 2 h/dia por 30 dias, seriam 51,624 MB/mês por usuário ou 258,12 MB/mês para cinco. Não é previsão produtiva: depende da proporção de veículos fora das linhas escolhidas. A seleção múltipla não economiza se já abranger toda a frota publicada.

Esta correção reduz corpos de respostas, mas mantém a quantidade de pedidos com seleção ativa. Não resolve sozinha a franquia independente de requisições HTTP identificada na auditoria. A proteção de array vazio pode evitar até 720 pedidos/hora de um consumidor que incorretamente mantivesse polling ativo sem linhas, cenário que não foi observado na tela principal.

## Instrumentação leve projetada, ainda não instalada

Priorizar contadores sem armazenar payloads e sem serializar respostas uma segunda vez. Reaproveitar o padrão local de `Interlocked` + snapshot agregado por minuto (`EstadoCausalPosicaoMetrics`/reporter e métricas Radar), ou expor esses mesmos agregados via `System.Diagnostics.Metrics` se já houver coletor. Não adicionar endpoint público de métricas nem exporter externo nesta etapa. O desenho não altera intervalos GPS.

### Contrato proposto de métricas

| Métrica | Significado e fronteira |
|---|---|
| `http.responses` | Respostas concluídas por operação/método/classe de status; abortadas separadas. |
| `http.body.bytes` | Bytes realmente escritos na feature de resposta HTTP; identificar `identity`/compressão e ponto de observação. Não somar estimativa de Content-Length com contagem real. |
| `http.body.size` / `http.duration` | Histogramas com buckets fixos, por operação; p50/p95 derivados do histograma. |
| `signalr.publications` | Publicações lógicas do evento pelo servidor, inclusive grupos vazios; não chamar de entregas. |
| `signalr.serialized.bytes` | Bytes produzidos pelo protocolo real, com envelope/separador, sem estimar a partir de objetos/quantidade de veículos. Serialização compartilhada não mede fan-out. |
| `signalr.transport.bytes` / `signalr.messages` | Payload por conexão entregue à fronteira do transporte, por direção/transporte e evento conhecido quando correlacionável. Separar frames/fragmentos de mensagens. |
| `signalr.connections` / `signalr.reconnections` | Quantidades e duração agregadas, transporte efetivo e número de assinaturas; sem IDs. |
| `gps.identical.candidates` | Observação de igualdade exata em modo sombra, sem suprimir mensagens; apenas contador exportado. |

Dimensões fechadas: famílias de operações (`rail.snapshot`, `stop.events`, `structure.itinerary`, `structure.metadata`, `unified.capabilities`, `radar.control`, `signalr.negotiate`, `other`); método; classe de status; enum de evento; transporte; direção. Não usar códigos de linha, rota completa, query, IP, IDs, GUIDs, tokens, coordenadas, nomes ou hashes de payload como labels/logs. Qualquer chave necessária para reconciliação fica apenas na memória transitória e não é exportada. Limitar séries e usar buckets fixos, sem coleção de amostras individuais.

### Onde contar sem interferir no fluxo

1. **HTTP:** middleware após identificação da operação, decorando `IHttpResponseBodyFeature` para cobrir Stream/PipeWriter/SendFile sem contagem dupla. Somar bytes efetivamente encaminhados e contar conclusão/aborto no ciclo correto; preservar `StartAsync`, `CompleteAsync`, flush, cancelamento, exceções e backpressure. Excluir o corpo posterior ao upgrade da contagem HTTP. Não bufferizar resposta ou consumir request body para medir. Content-Length é somente metadado auxiliar.
2. **Protocolo SignalR:** decoração compatível de `IHubProtocol`/writer na serialização existente (`WriteMessage` e caminho de `GetMessageBytes`), sem substituir JSON por protocolo diferente. Contabiliza uma codificação, não cada cliente servido por bytes em cache. HubFilter de invocações do cliente não captura automaticamente os envios de IHubContext, portanto não é suficiente.
3. **Transporte:** decoração da fronteira de envio por conexão para confirmar fan-out e tamanho entregue, cobrindo WebSocket, SSE/LongPolling e todas as sobrecargas/caminhos usados pela versão .NET. Decorar somente `WebSocket.SendAsync` não mede automaticamente frame/compressão/TLS nem os demais transportes. Correlacionar apenas enums de eventos e totais; não ler/logar conteúdo para rotular.
4. **Wire bytes:** uma captura agregada de comprimentos/direção/sequências do fluxo agente↔8080, sem salvar pacotes/corpos, serve para calibrar framing, compressão e retransmissões. Deduplicar loopback e separar bytes TCP únicos de retransmissões. Não instalar coletor nem alterar rede sem revisão específica.
5. **Cobrança:** comparar as janelas agregadas com Data Transfer Out e pedidos do painel ngrok, descontando ociosidade/tráfego de outros consumidores da conta. Payload lógico, bytes no hop local e faturamento são três métricas distintas.

Frequência por operação: diferença dos contadores por janela monotônica de 60 s; para cadência de publicações, histograma de intervalo entre envios da mesma assinatura mantido em memória e exportado sem chave de linha. Não calcular frequência a partir de timestamps GPS, que medem aquisição e podem não coincidir com publicação.

Proposta de implantação futura da instrumentação: opt-in desativado por padrão; uma linha agregada por minuto, sem fila ilimitada, exportação assíncrona incapaz de bloquear a API. Alvos de aceitação a medir: ausência de alterações em resposta/headers/ordem; contagem correta de UTF-8, corpo vazio, erros, aborto, streaming e compressão; nenhuma duplicação em PipeWriter/Stream; fan-out 0/1/5; fragments/ping/close; todos os labels dentro da allowlist; comparação instrumentado/desativado de alocação e duração. Sem prometer overhead antes de medir.

Não implementei wrappers de transporte nesta etapa: isso exige testes específicos de pipeline/streaming e uma fronteira compatível com a versão SignalR. Um contador superficial de `.Length` ou uma serialização JSON adicional daria precisão falsa e custo evitável.

## Investigação: deduplicação GPS

Confirmado: o publicador legado recarrega ativos/recentes e transmite snapshot não vazio a cada publicação, mesmo sem novos `aceitos`. Já existe deduplicação de vazios por geração de assinatura. O hub incrementa a geração da linha em nova inscrição; no legado, o primeiro snapshot depende do ciclo, não de um envio imediato ao caller. Uma comparação só de conteúdo impediria que um novo assinante recebesse o estado inicial de uma linha que já tenha clientes.

Igualdade de coordenadas ou `timestampGps` é insuficiente. A transição ativo→recente muda status para `SemSinal` em `VeiculosLinhaRuntimeReader.Decode`; mudanças operacionais/ETA/linha, retirada de veículo e esvaziamento também precisam gerar envio. O guard frontend reaproveita observação física de timestamp igual; deduplicar payload no servidor não é o mesmo que essa regra de apresentação. Não apagar timestamps ou estender validade para obter igualdade.

Plano de menor alcance para revisão antes de implementação:

1. Medir, em modo sombra, a fração de snapshots **integralmente idênticos** usando o contrato público real. O identificador fica somente em memória. Manter ordem atual no primeiro experimento: mudanças apenas de ordem reduzem oportunidade de economia, mas não introduzem regressão.
2. Candidato a gate legado: estado por linha ativa contendo geração de assinatura, conteúdo público anterior e resultado de envio bem-sucedido. Suprimir somente se geração e conteúdo completos coincidirem; qualquer falha de envio não avança o estado. Se usar hash, não tratá-lo como prova absoluta de igualdade: confirmar com comparação exata ou documentar explicitamente o risco residual.
3. Continuar executando aquisição, leituras de cache, decisões de expiração/status e transferência em cada ciclo; o gate fica depois da decisão pública. Nunca retornar cedo antes dessas decisões. Remover estado de linhas sem assinantes e limitar cache ao conjunto ativo.
4. Nova geração/reconexão/reinscrição força snapshot. Continuar `LinhaEsvaziada` e seus retries. Remoção parcial muda o corpo; transição para vazio usa o mecanismo existente. Não alterar política de retenção do cliente para interpretar ausência como remoção nova.
5. Validar o papel de repetição de snapshots na recuperação de mensagens perdidas: `SendAsync` concluído não confirma aplicação no aparelho. Se for necessário ack/checkpoint/resync adicional para equivalência, isso exige um plano de protocolo, não um hash isolado. Nenhuma arquitetura nova foi aplicada nesta execução.
6. Tratar unificado separadamente: `revision`, `composedAt`, prazos físicos e manutenção fazem parte da semântica aceita por `acceptUnified`. Não ignorar campos temporais ou combinar gate legado/unificado sem prova.

Matriz obrigatória futura: primeiro assinante; segundo assinante enquanto corpo é igual; reconexão; cancelamento/reinscrição; falha/retry; mudança de ETA/status sem movimento; ativo→SemSinal→vazio; remoção parcial; transferência A→B com índice antigo; expiração sem novas observações; publicação de geração antiga em voo; flags de presença e clocks de retenção. A economia é `bytes idênticos efetivamente suprimíveis / bytes GPS`, não uma porcentagem arbitrária. **Zero economia por deduplicação aplicada nesta etapa.**

Os 22 testes existentes de `GpsSignalRPublisherTests` foram executados como baseline, incluindo expiração, índice transferido, erro de envio e geração de vazio. Eles não demonstram equivalência de uma deduplicação que ainda não existe.

## Investigação: inscrições em segundo plano

Confirmado: foco da navegação não equivale a AppState. O GPS legado e o mapa unificado podem continuar inscritos ao minimizar. O hook de eventos e o de trem já pausam consultas HTTP em background. O socket singleton é compartilhado entre donos; parar a conexão ao desmontar um consumidor pode afetar outro.

Radar remoto calcula previsões no servidor e entrega push por Expo/FCM. Não exige socket GPS do mapa nem polling de sessão no app. Os testes do modo remoto confirmam recuperação sem consulta local, ausência de publicação local em background e preservação da sessão; não substituem teste físico de push Android.

Plano antes de implementação:

- Cada dono declara necessidade `foreground-ui` ou uma necessidade de background **explicitamente comprovada**. Ao minimizar, somente donos de UI retiram demanda efetiva, mantendo a seleção desejada em memória. União continua incluindo qualquer dono ainda necessário.
- Abranger `useMobilidadeRio`, `usePhysicalPresence`, `useUnifiedLocation` do mapa e do Radar de terminal, além de capabilities. Suspender apenas legado deixaria unificado/presença transferindo dados.
- Serializar reconciliador de inscrições; tratar background/foreground/reconexão concorrentes e mudanças de seleção enquanto minimizado. No retorno, obter snapshot atual e restaurar geração; não reaplicar estado vencido nem invalidar sessão Radar.
- Não cancelar/renovar sessão Radar, reenrolar push, limpar token ou desligar listeners de notificação. Não usar notificações locais para substituir remoto.
- Parar socket somente com prova de ausência de todos os donos e política explícita de reabertura, evitando oscilação de foco. Uma primeira versão pode apenas desassinar grupos de UI; keepalive ocioso restante deve ser medido separadamente.

Validação futura: UI ativa→background→ativa com mesma linha, troca de linha em background, dois donos compartilhando linha, último dono removido, retorno durante reconnect, falha de cancelamento e push remoto recebendo com socket parado. Rodada física exige APK/Android e envio controlado em etapa posterior. **Nenhuma suspensão nova de GPS foi aplicada nesta etapa.**

## Testes e verificações executados

Backend: SDK 9.0.306, net9.0, xUnit 2/VSTest. Resultados TRX locais foram parseados e têm execução não vazia, sem ignorados.

```powershell
dotnet test NoPonto/NoPonto.csproj --no-restore --filter FullyQualifiedName~NoPonto.Tests.TremRealtime.RailVehiclesControllerTests --logger 'trx;LogFileName=rail-selection.trx' --results-directory C:/Users/guilh/AppData/Local/Temp/noponto-bandwidth-20261107/results --verbosity minimal
dotnet test NoPonto/NoPonto.csproj --no-build --no-restore --filter FullyQualifiedName~NoPonto.Tests.GpsSignalRPublisherTests --logger 'trx;LogFileName=gps-publication-baseline.trx' --results-directory C:/Users/guilh/AppData/Local/Temp/noponto-bandwidth-20261107/results --verbosity minimal
```

- Controller: **Passed: 15, Failed: 0, Skipped: 0**.
- GPS baseline: **Passed: 22, Failed: 0, Skipped: 0**.
- Compilação transitiva dos testes: seis avisos preexistentes (CS8981, CS7022 e xUnit2031), sem erros.

Frontend, diretório `NoPonto`:

```powershell
node scripts/test-radar.cjs src/services/railSelection.test.cjs src/services/favoritosEtapaB.test.cjs src/hooks/useRadarEspera.test.cjs src/hooks/useRadarRemoto.test.cjs src/services/radarRemotoCore.test.ts src/services/radarRemotoDiagnostico.test.ts src/services/radarRemotoHttp.test.ts
pnpm exec tsc --noEmit
pnpm exec eslint src/services/railRealtime.ts src/hooks/useRailRealtime.ts src/services/railSelection.test.cjs src/services/favoritosEtapaB.test.cjs
```

- **Passed: 62, Failed: 0, Skipped: 0**; TypeScript sem erros; lint dos arquivos alterados sem erros/avisos.
- Antes da correção, o teste direcionado `snapshot ferroviário agregado filtra linhas antes de hidratar, deduplica e desliga sem favoritas ferroviárias` falhou: `linhaIds` não chegava ao service. Depois passou com a lista selecionada, mantendo verificação visual/deduplicação anterior.
- Uma tentativa adicional com `node --test` diretamente em hooks Radar falhou no carregamento TS (import sem extensão e parameter properties); corrigida a invocação para o runner existente `scripts/test-radar.cjs`. Nenhum teste Radar precisou de edição para passar.
- Não executados: suíte completa com Redis/PostgreSQL, API HTTP real/model binding por socket, Android, push externo, captura ngrok e comparação wire bytes. O teste do builder usa fetch simulado; o de serialização usa DTO real, sem inicializar Program.cs.

| Requirement | Evidence |
|---|---|
| Filtragem backend antes da serialização e snapshot fonte íntegro | `MultipleLines_FilterBeforeSerializationAndKeepSnapshot` |
| Respeitar sentido, estados visuais e filtro escalar existente | `MultipleLines_IntersectWithDirectionAndVisualStates`, `MultipleLines_IntersectWithLegacySingleLineFilter` |
| Compatibilidade sem array, repetidos e linhas inexistentes | `MissingOrEmptyLineArray_PreservesLegacyUnfilteredRequests`, `MultipleLines_DuplicatesDoNotDuplicateVehiclesAndUnknownLinesReturnEmpty` |
| Seleção transmitida pelo cliente e preservada no builder real | `rail request sends repeated selected lines and preserves legacy filters`, `rail selection survives the real API URL builder alongside direction filters` |
| Seleção vazia não gera pedidos e retomada funciona | `rail request with empty selection performs no HTTP request`, `rail hook empty selection skips polling and resumes when selected` |
| Cadência, pausa existente e limpeza de timer preservadas | `rail hook keeps five second polling, background pause and cleanup` |
| Plano de instrumentação sem informações sensíveis | Seção de instrumentação deste documento; não instalada |
| Deduplicação e suspensão GPS investigadas antes de alterar comportamento | Planos e matrizes acima; baseline GPS 22/22, sem mudança nesses caminhos |

## Riscos restantes e próximo incremento

A correção é local e ainda não beneficia o túnel publicado. A identidade/configuração ativa de produção precisa de confirmação. A filtragem depende de suporte ao array na API e não reduz frequência HTTP. Medidas de franquia continuam sem captura real. Quantidade de linhas selecionadas influencia URL e custo; o fluxo normal é pequeno, sem novo limite arbitrário introduzido.

Próximo incremento recomendado: revisar o desenho e implementar primeiro contagem HTTP de corpo e publicação/protocolo SignalR com opt-in e testes de streaming/fan-out. Depois obter uma janela representativa para decidir gate de igualdade. A suspensão global por ciclo de vida exige coordenar donos de vários hooks e validar push físico; o plano está apresentado antes de qualquer implementação desse alcance.
