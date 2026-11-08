# Auditoria de banda NoPonto — 07/11/2026

## Conclusão para decisão

O código contém mecanismos suficientes para explicar consumo elevado com poucos usuários: snapshots completos periódicos, coexistência de contratos de localização e polling ferroviário de 5 segundos. Isso é uma explicação tecnicamente plausível, **não uma atribuição medida do 1 GB consumido**. Não há nesta auditoria captura de tráfego do Debian, painel de consumo da conta nem perfil de uso dos sete dias.

Para cinco usuários usando 2 h/dia, um cenário ilustrativo de uma linha com 20 veículos, GPS legado, unificado e eventos de Radar chega a **3,96 GB/mês de corpos de aplicação**, antes de cabeçalhos e demais operações. Só o legado desse cenário já representa 1,40 GB/mês. É necessário medir e reduzir redundância e volume, não apenas diminuir alguns pedidos pequenos.

O Radar remoto usa consultas internas por parada, não HTTP pelo túnel. **Não recomendo aumentar sua cadência nem reduzir validade de evidências para economizar ngrok.** A prioridade é remover transferências dispensáveis preservando aquisição GPS, expirações, reconciliação e notificações.

## Escopo, método e limites

- Inspeção somente leitura do frontend neste checkout e do backend irmão `../noponto-backend-principal`, HEAD backend `99856ba`, com alterações locais presentes. Não foi comprovada equivalência com o APK instalado ou o backend publicado.
- Nenhum comportamento foi alterado. Nenhum deploy, build, Docker, migração, teste, commit ou push foi executado. O único arquivo criado é este relatório. As alterações e a instrumentação de diagnóstico existentes do Radar foram preservadas.
- Leituras de código, buscas de referências e uma serialização sintética offline em Python. Sem acessar endpoints públicos, abrir sessões de Radar ou gerar tráfego de teste no túnel.
- A skill `diagnosing-bugs` orientou a separação de evidências e hipóteses. O pedido explícito de auditoria sem mudanças limita as etapas de reprodução/instrumentação: não foi reproduzido nem declarado corrigido o esgotamento da franquia.
- Não foram inspecionadas credenciais nem presumidos valores de variáveis de produção. Frequências são configurações/defaults do código, não frequências observadas no Debian. Flags físicas/unificadas/remotas podem mudar o cenário.
- Unidades decimais: 1 kB = 1.000 bytes; 1 MB = 1.000.000; orçamento de planejamento = 1.000.000.000 bytes em 30 dias. O painel da conta é a referência operacional.

## Evidências por caminho

As referências abaixo são relativas às raízes de cada repositório; números de linha referem-se ao estado local auditado.

### 1. SignalR GPS rodoviário: grupos corretos, conteúdo repetido

Backend:

- `NoPonto/1-API/Hubs/GpsHub.cs`: `InscreverseLinha` normaliza código com trim/maiúsculas, entra em `linha:{codigo}` e mantém conjunto por conexão. `CancelarLinha` e `OnDisconnectedAsync` removem assinaturas. Não é broadcast global.
- `NoPonto/2-Application/Services/GPS/GpsSignalRPublisher.cs:24`: retorna sem trabalho quando não existem assinaturas GPS. Filtra veículos pelo código da linha antes de enviar ao respectivo grupo (`:97`). Índices antigos de outra linha não devem vazar veículos transferidos.
- `:66`: qualquer lista não vazia é publicada inteira. Não compara assinatura/hash de conteúdo anterior nem exige posições novas. O parâmetro `aceitos` não limita o envio aos alterados: ativos/recentes do cache também entram.
- `GpsPollingService.cs:277`, `:321` e `:665`: chama o publicador inclusive nos caminhos sem posições novas/válidas. Assim, deduplicar ingestão GPS não elimina reenvio de snapshots ativos/recentes.
- `GpsPoolingOptions.cs:7` e `appsettings.json:11`: intervalo GPS nominal de 20 s. O ciclo considera duração e pode despertar antecipadamente com snapshot SPPO (`GpsPollingService.cs:179`); 20 s **não é teto garantido de frequência**. Medir intervalo real entre mensagens.
- Listas vazias usam `LinhaEsvaziada`, deduplicada por geração. Uma nova assinatura incrementa a geração da linha; pode fazer clientes já inscritos receberem novamente o vazio. Pequeno volume, necessário analisar sem confundir com tempestade de posições.
- `FrontendLegacyDtos.cs:34`: DTO SignalR tem 28 campos, com GUIDs, timestamps, coordenadas anteriores, rota, próxima parada e ETA. `itinerarioId` repete `padraoVersaoId` por compatibilidade. Não eliminar sem verificar consumidores do APK.

Frontend:

- `NoPonto/src/services/gpsHub.ts:15`: uma conexão singleton. Donos de inscrições formam uma união de linhas, reconciliada serialmente. Conexão pendente e conjuntos de inscritos evitam repetir `invoke` em cada renderização.
- `:121`: `withUrl(...).withAutomaticReconnect()`, sem seleção exclusiva de transporte. WebSocket é esperado, mas fallback precisa ser observado em execução.
- Reconexão limpa conjuntos e reinscreve; comportamento necessário porque grupos pertencem à conexão. Não há evidência estática de múltiplos sockets deliberados por hook.
- `removerGpsHubListener` remove callback, não chama `connection.stop()`. Após remover todos os consumidores, pode restar conexão ociosa com keepalive. Não confundir quantidade de callbacks locais com multiplicação de bytes na rede.
- `useMobilidadeRio.ts:348`: recuperação a cada 30 s só tenta itinerários em erro e reconcilia assinaturas. **Não é polling HTTP de todos os itinerários a cada 30 s.**

### 2. Localização unificada e presença física

- `src/services/unifiedLocation.ts:18`: posições chegam pelo mesmo hub, com inscrições `unified:{linha}`. **Não há polling HTTP periódico dos snapshots de localização unificada nesse hook.** Há GET de `capabilities`, a cada 30 s quando existem linhas rodoviárias.
- `src/services/unifiedNetwork.ts`: cache compartilhado de capabilities por 30 s em sucesso/15 s em falha e promessa em voo deduplicada. Dois hooks não implicam necessariamente dois GETs; timers defasados, falhas e expiração exigem contagem real.
- `src/components/mapOSM/mapOSM.tsx:61` e `src/hooks/useTerminalRadar.ts:57`: mapa e Radar de terminal podem demandar unificado. A união por dono evita duplicar inscrição da mesma linha; o Radar pode legitimamente ampliar o conjunto.
- `app/index.tsx:129` continua passando rodoviárias visíveis para o GPS legado, enquanto o mapa assina unificado. **Há possibilidade concreta de receber legado e unificado para uma mesma linha.** A seleção de quais mensagens viram marcadores não evita seu download. Confirmar flags e sobreposição por conexão.
- Backend `UnifiedLocation.cs:60`: cada veículo inclui posição física, vínculo de linha, estado espacial e `Operational` opcional com um `PosicaoVeiculoDto` completo. Há duplicação semântica de identidade, localização e metadados; não significa que todos os campos sejam dispensáveis.
- `UnifiedLocation.cs:354`: no caminho multicohort não canônico, publica snapshot de todas as coortes após observações. `CanonicalPhysicalLocation.cs:178` publica snapshots inteiros das linhas alteradas. Caminhos controlados por flags: não somar como se ambos sempre publicassem simultaneamente.
- `PhysicalPresenceMvp.cs:309`: envia snapshots por grupo de instalação/parada; `GpsHub` usa caller para snapshot inicial e grupo nos posteriores. Enviar a grupo vazio não gera fan-out para clientes, embora custe processamento.
- `src/services/physicalPresence.ts:10`: quando habilitado, assina quatro escopos fixos (`line:838` e três instalações) independentemente da seleção individual. Pode sobrepor presença física e unificado; auditar a necessidade por tela antes de restringir.
- Cadência física default de 180 s (`PhysicalPresenceMvp.cs:54`), com modos de aquisição global, observações e manutenção. Não presumir que cada publicação unificada ocorra exatamente a cada 20 s ou 180 s.

### 3. Polling ferroviário: alta frequência e filtro amplo

- `src/config/env.ts:17`: `RAIL_POLL_INTERVAL_MS` default 5.000 ms.
- `src/hooks/useRailRealtime.ts:124`: uma consulta por ciclo; agenda a próxima após concluir. Sem sobreposição normal. Pula a consulta se AppState não estiver ativo.
- `app/index.tsx:575`: quando há exatamente uma linha ferroviária, envia `linhaId`; com duas ou mais, envia `undefined`.
- `src/services/railRealtime.ts:58` transmite apenas `linhaId`/`sentidoId`; `linhaIds` é filtrado **depois do download** no hook.
- Backend `RailVehiclesController.cs:25`: sem `linhaId`, retorna todos os veículos públicos elegíveis. Assim, selecionar duas linhas pode baixar também linhas não selecionadas.
- Geometria ferroviária tem cache por versão em memória (`railRealtime.ts:56`). É rota diferente da estrutura V2; pode haver download de coordenadas da mesma versão por dois caches diferentes.

### 4. Paradas, itinerários e geometrias

- `src/services/estruturaV2.ts:7`: cache de promessa por versão para itinerários; deduplica requisições simultâneas e conserva sucessos até encerrar runtime. Falhas/nulos são retirados para permitir recuperação. Não há persistência em disco implementada ali.
- `useMobilidadeRio.ts:232`: carregar linha solicita terminais, sentidos, padrões por sentido e itinerários de **todos os padrões publicados**. Cada itinerário contém geometria e ocorrências, mesmo quando a UI só precisa de parte dos dados. `incluirParadas` não evita baixar ocorrências neste fluxo.
- Recarregar linha no mesmo runtime reaproveita itinerários por versão. Sentidos e padrões não têm cache global equivalente nesse serviço; remount/retry pode repetir metadados.
- `useTerminalRadar.ts:11`: catálogo de terminal é carregado e memoizado por promessa global, sem polling de sucesso; repete após 30 s em falha. Pode carregar estruturas além da linha visível por necessidade do Radar.
- `src/services/radarParadaMetadata.ts:4`: metadados de parada têm cache em memória, até 100 entradas, falhas removidas. Não há evidência de download geral de paradas a cada segundo.
- Backend `PadroesVersoesController.cs`: itinerário retorna `Ok` sem ETag/Cache-Control explícito nesse controller. Capabilities tem `public, max-age=30`; snapshot unificado HTTP tem `no-store`.
- Não foi encontrada configuração `AddResponseCompression`/`UseResponseCompression` ou MessagePack no backend auditado; há `AddSignalR()` em `Program.cs:593`. Proxy e negociação reais não foram observados.
- `api.ts` não implementa cache persistente/revalidação ETag. Requisições diretas de capabilities e Radar usam `fetch`, fora desse wrapper: uma instrumentação só nele ficaria incompleta.

### 5. Radar local e remoto

- `useConsultaEventosParada.ts:7`: consulta imediatamente e a cada **30 s após a resposta**, apenas com contexto habilitado e AppState ativo. Trava pedido pendente, limpa timer no cleanup. Relógio local de 1 s apenas atualiza apresentação.
- `src/services/eventosParada.ts:40`: deduplica somente consultas simultâneas da mesma parada; não mantém resultado por TTL. Dois consumidores defasados poderiam repetir GET, mas `app/index.tsx:521` reaproveita `radarConsultado` no detalhe. Não há segundo polling independente comprovado entre compacto e detalhe nessa tela.
- Eventos são retornados para a parada e filtrados no cliente por contexto. Estações com muitos eventos podem produzir corpos grandes; não truncar sem provar que preserva linhas prioritárias e contextos válidos.
- `useRadarEspera.ts:107`/`:126`: reconcilia remoto ao voltar ao foreground e ao montar. `radarRemotoAndroid.ts:256`: troca do token também pode reconciliar.
- `radarRemotoCore.ts:138`: reconciliação com credencial faz GET instalação + GET sessão; pode renovar credencial e realizar enrollment. A fila serializa, **mas não agrupa chamadas reconciliar equivalentes**. Montagem/foreground/token próximos podem resultar em rodadas sequenciais redundantes. Volume provável pequeno, medir antes de priorizar.
- Não há timer de polling de sessão remota nesses arquivos. Ativar/alterar/cancelar/confirmar são operações por ação ou evento; timer de expiração apenas muda estado local.
- Backend `RadarWorker.cs`: ciclo default 30 s após concluir, independente do GPS. `RadarEngine.cs` impede ciclos sobrepostos e cria escopo por parada.
- `RadarStopProcessor.cs:34`: chama **diretamente** `IEventosParadaService.ListarAsync`, uma vez por parada com sessões aceitas por ciclo, compartilhando resultado entre sessões. Não acessa `/paradas/.../eventos` via ngrok. Cinco usuários na mesma parada não significam cinco GETs pelo túnel.
- Validação estrutural busca parada e versões distintas por processamento; pode ter custo de banco/CPU e carregar geometrias desnecessárias internamente. Isso não é banda de saída do ngrok.
- Push usa HttpClient para gateway Expo; receipts também são saída direta do servidor, salvo uma configuração externa de roteamento não observada. Notificação entregue via Expo/FCM não passa pelo túnel da API. Callbacks de confirmação no app podem fazer HTTP na API.
- `RadarPushCoordinator.cs` já compara conteúdo relevante e prazos; preserve revisão, CAS, confirmações, TTL, prioridade e limites de evidência. Cache estrutural leve pode ser estudado sem cachear cegamente decisão temporal.

## Medições offline e estimativas de bytes

**Nenhum número abaixo é medição de bytes efetivamente transferidos pelo ngrok.** Medido offline significa tamanho exato de uma amostra artificial em memória. Faixas são hipóteses de dimensionamento a validar.

Medição executada: Python extraiu os 28 nomes/tipos do DTO legado, montou campos não nulos com GUIDs e timestamps fictícios, codificou JSON compacto camelCase/ASCII, envelope SignalR e separador `0x1e`. Repetiu com N veículos, variando ordem e latitude. Não executou serializer .NET nem código da API. Diferenças de escaping, precisão, nulos e enum podem mudar o tamanho real.

| Operação/amostra | Bytes UTF-8 offline | gzip nível 6 offline |
|---|---:|---:|
| `PosicaoAtualizada`, 1 veículo artificial | 1.060 | 417 |
| Mesmo formato, 10 veículos | 10.132 | 552 |
| Mesmo formato, 20 veículos | 20.208 | 672 |
| Mesmo formato, 50 veículos | 50.445 | 1.009 |
| `LinhaEsvaziada` artificial, linha de 3 caracteres | 73 | não calculado |
| Ping SignalR JSON `{"type":6}` + separador | 11 | não aplicável |

O gzip artificial comprime especialmente bem porque quase todos os campos se repetem. **Não usar essa taxa como promessa de economia, nem como tamanho de WebSocket comprimido.** Compressão HTTP não comprime automaticamente frames WebSocket.

| Operação | Estimativa de corpo por transferência | Frequência pelo código | Confiança/variáveis |
|---|---:|---|---|
| GPS legado | 0,8–1,6 kB/veículo + ~60 B/envelope | nominal 20 s; pode antecipar | DTO inspecionado; veículos e cadência reais desconhecidos |
| Unificado | 0,5–2,5 kB/veículo + ~200 B/snapshot | por publicação/observação/manutenção + inscrição | `Operational` nulo ou completo muda bastante |
| Presença física | 0,3–0,8 kB/veículo + envelope | publicação física + inscrição | múltiplos escopos podem repetir veículo |
| Ferroviário | 0,8–2 kB/veículo + envelope | 5 s + duração HTTP | payload e quantidade publicados variam |
| Eventos de parada | 0,7–1,5 kB/evento | 30 s + duração HTTP | 10 eventos ≈7–15 kB; não supor número fixo |
| Capabilities | 0,2–8 kB | até ~1/30 s por cache compartilhado em sucesso | lista de linhas; cache HTTP pode evitar rede, validar no RN |
| Itinerário V2 | ~20–40 B por coordenada + ~0,2–0,6 kB por ocorrência + metadados | carregamento frio/versão nova/falha | exemplo 2.000 pontos/50 ocorrências ≈50–110 kB por versão |
| Geometria ferroviária | ~20–40 B por coordenada + metadados | primeira necessidade por versão/runtime | cache separado da estrutura V2 |
| Metadados de parada/linhas/sentidos/padrões | ~0,5–30 kB/resposta | navegação/busca/carregamento/retry | depende de paginação e vínculos |
| Reconciliação remota | ~1–10 kB somando corpos/respostas de uma rodada | montagem/foreground/token; não polling | normalmente ≥2 GETs com credencial; fluxo condicional |

Cabeçalhos HTTP de resposta: reservar inicialmente **0,3–1,5 kB por resposta**, hipótese, sem incluir requests. WebSocket não repete cabeçalhos HTTP por mensagem: frame servidor acrescenta normalmente 2/4/10 bytes por frame, mas fragmentação, compressão e camadas inferiores mudam a conta. TLS/TCP e retransmissões precisam ser separados do medidor de cobrança. Negociação, handshake e reconexões somam tráfego adicional.

Keepalive SignalR default documentado: 15 s. Em ociosidade, o ping JSON de 11 B seria ~2.640 B/h ou 1,90 MB em 720 h, antes de framing. Mensagens de dados podem tornar pings dispensáveis naquele intervalo. Não somar automaticamente ping máximo a todos os snapshots nem alterar timeouts para buscar economia pequena.

## Ranking provisório de consumidores

Ranking por potencial em tela ativa, condicionado às funcionalidades usadas; não representa ranking medido da conta:

1. **Snapshots ferroviários completos a cada 5 s**, especialmente com filtro de linha ausente. Exemplo 20 kB/ciclo = 14,4 MB/h por usuário.
2. **GPS legado + unificado simultâneos**, multiplicados por linhas, veículos, frequência e destinatários. Exemplo 26 + 40 kB a cada 20 s = 11,88 MB/h por usuário.
3. **Unificado isolado / legado isolado** com muitas posições e reenvios sem mudança. No exemplo, 7,2 / 4,68 MB/h.
4. **Eventos de parada**, sobretudo paradas com muitas linhas. Exemplo 10 kB/30 s = 1,2 MB/h; com 100 eventos, pode ultrapassar os anteriores.
5. **Estruturas/geometrias em início frio**, catálogo de terminal e variantes numerosas. Podem dominar em muitas aberturas de app, apesar de não serem polling contínuo.
6. Capabilities, reconciliações remotas, inscrições e keepalive. Em geral menores em bytes, mas capabilities/polling pressionam a franquia de requisições.

Tráfego de terceiros como estilo Carto e tiles de trânsito Google é chamado diretamente pela WebView (`mapScript.ts:878`, `:1190`) e não deve ser atribuído ao túnel da API. Downloads GPS de provedores, PostgreSQL/Redis e Expo também não passam automaticamente pelo ngrok. Tráfego administrativo, outros endpoints/túneis da conta, robôs, erros e downloads fora deste checkout ainda precisam ser contabilizados.

## Projeções mensais

Fórmula por operação: `bytes_por_resposta × (segundos_ativos / intervalo) × destinatários`. Acrescentar carregamentos frios, cabeçalhos, negociação, erros e tráfego não modelado. Grupo compartilhado reduz trabalho de serialização/consulta, **não o download de cinco destinatários**.

Premissas ilustrativas: 30 dias; todos os usuários com mesmo tempo diário; uma linha rodoviária com 20 veículos; legado 26.000 B/ciclo (1,3 kB/veículo), unificado 40.000 B/ciclo; ambos a 20 s apenas como cenário; ferroviário 20.000 B/5 s; eventos 10.000 B/30 s; capabilities 1.000 B/30 s. GPS unificado não tem intervalo garantido de 20 s. Valores de corpos sem compressão, não totais faturados.

| Operação isolada | 1 usuário, 2 h/dia | 5 usuários, 2 h/dia cada | 1 usuário, 24 h/dia |
|---|---:|---:|---:|
| Legado | 280,8 MB | 1.404 MB | 3.369,6 MB |
| Unificado | 432 MB | 2.160 MB | 5.184 MB |
| Ferroviário | 864 MB | 4.320 MB | 10.368 MB |
| Eventos Radar | 72 MB | 360 MB | 864 MB |
| Capabilities | 7,2 MB | 36 MB | 86,4 MB |
| Legado + eventos + capabilities | **360 MB** | **1.800 MB** | **4.320 MB** |
| Legado + unificado + eventos + capabilities | **792 MB** | **3.960 MB** | **9.504 MB** |

Não somar trem e rodoviário quando não estiverem ativos juntos. Cinco usuários 24 h/dia representam cinco vezes a última coluna, caso extremo, não inferência sobre o experimento. Cada 1 MB de carga fria por usuário/dia acrescenta 30 MB/mês por usuário ou 150 MB para cinco.

Uma extrapolação simples do relato **1 GB em sete dias** dá **4,29 GB/30 dias** para a mesma carga agregada; seria necessário reduzir **76,7%** para chegar a 1 GB. O relato não informa usuários-hora nem distribuição de operações e não permite extrapolar empiricamente 1 versus 5 usuários.

Orçamento médio para 1 GB: ~386 B/s agregados continuamente. Para cinco usuários a 2 h/dia, permite ~926 B/s por usuário durante uso; com reserva de 20%, ~741 B/s. A 20 s, isso equivale a ~14,8 kB por usuário/ciclo **para todas as operações combinadas**. Limitar apenas simultaneidade não limita usuários-hora.

### Limite independente de requisições

Documentação atual consultada: Free tem 1 GB de **Data Transfer Out** e 20.000 requisições HTTP/mês. A saída deve ser priorizada na comparação com a franquia; registrar entrada separadamente. Não presumir que soma de JSON, bytes TCP ou interface de rede reproduza o faturamento.

| Polling HTTP | Pedidos/mês, 1 usuário × 2 h/dia | 5 usuários × 2 h/dia |
|---|---:|---:|
| 30 s | 7.200 | 36.000 |
| 5 s | 43.200 | 216.000 |
| Eventos + capabilities, ambos 30 s | 14.400 | 72.000 |

São aproximações com resposta rápida e cada tick atingindo a rede; cache HTTP pode reduzir capabilities, duração aumenta intervalo efetivo. Negotiate, estruturas e ações somam pedidos. Mensagens dentro de um WebSocket não são novos GETs HTTP. Mesmo o cenário ferroviário de um usuário pode esgotar pedidos antes da banda. Para cinco usuários no perfil indicado, **redução de payload sozinha não assegura o plano gratuito**: considerar assinaturas de eventos e snapshots com fallback confiável.

## Aberto, minimizado e fechado

| Estado | Evidência do código e implicação |
|---|---|
| Aberto, mapa focado | GPS das linhas visíveis; unificado conforme capabilities/flags; eventos se Radar habilitado; trem se linhas ferroviárias visíveis; caches reduzem carga quente. |
| Aberto, outra tela | `useIsFocused` controla GPS do mapa; tela de linhas também usa `useMobilidadeRio`. WebView e hooks unificados precisam de contagem de assinaturas efetivas. Remover listener não fecha socket. |
| Minimizado | Eventos e trem verificam AppState e pausam suas consultas. `telaAtiva` é foco de navegação, não AppState; GPS legado e unificado não têm pausa global equivalente nas inscrições. Capabilities também não verifica AppState. Podem continuar até suspensão/desconexão pelo SO; não prometer consumo zero. |
| Processo encerrado | JS, timers e socket desse processo cessam. Radar remoto continua no servidor enquanto sessão for válida, sem polling do app. Push por Expo/FCM pode chegar conforme permissões e estado do SO; force-stop não equivale a simples fechamento e pode impedir entrega. |
| Reabertura/retorno | Pode haver snapshot inicial, reinscrições, GETs de reconciliação e carga fria se processo foi recriado. Não eliminar reconciliação para economizar. |

Para segundo plano não existe projeção única defensável: medir a duração efetiva da conexão. O limite superior de planejamento é manter a taxa GPS/unificada enquanto conectado, retirando trem/eventos pausados. Notificação local depende de frontend ativo; Radar remoto não deve depender de manter o socket aberto.

## Plano priorizado, sem implementação nesta etapa

Economias são por componente, condicionais e **não aditivas**.

| Prioridade | Proposta | Economia esperada | Risco | Complexidade |
|---|---|---|---|---|
| P0 | Medir HTTP, frames e fan-out; confrontar consumo da conta e configuração publicada | não economiza diretamente; permite atribuição | baixo com agregação | média |
| P1 | Evitar legado + unificado para mesma linha quando unificado cobre integralmente requisitos; fallback explícito e verificável | até 100% do canal legado sobreposto; 39% do volume GPS do exemplo 26+40 kB | médio/alto: operacional/ETA e cobertura | média |
| P1 | Comparar estado público por linha e não reenviar snapshots idênticos; primeiro snapshot para novo assinante e recuperação obrigatórios | próximo à fração de mensagens idênticas; 0–90% conforme atividade | médio: validade, remoções e novos assinantes | média |
| P1 | Pausar inscrições do mapa sem consumidores e em background após validar independência do Radar remoto; restaurar com snapshot ao voltar | até 100% da banda desses canais durante período dispensável | médio: transição e notificações locais | média |
| P1 | Enviar lista de linhas ferroviárias ao servidor e filtrar antes de serializar | proporcional aos veículos não selecionados; 0–90% | baixo/médio: contrato compatível | baixa/média |
| P1 | Compressão HTTP negociada para JSON grande e cache persistente por versão em itinerários/geometrias | hipótese 50–85% de corpos JSON elegíveis; cache quente até 100% do download estrutural repetido | baixo/médio: negociação, armazenamento e invalidação | média |
| P2 | DTO público unificado/legado compacto: referências por versão, remover aliases apenas em contrato novo, campos opcionais ausentes, precisão justificada | hipótese 20–50% por veículo | médio/alto: interpolação, identidade e ETA | média |
| P2 | Deltas versionados por linha, removals explícitos e ressincronização | hipótese 30–90% se poucos veículos mudam; pouco ganho se todos mudam | alto: ordem, perda, expiração, troca de linha | alta |
| P2 | Migrar snapshots ferroviários/eventos de parada para grupos SignalR por escopo, com HTTP de carga inicial/recuperação | elimina grande parte de GETs periódicos; bytes só caem com mudanças/deltas | alto: equivalência Radar e fallback | alta |
| P2 | Capabilities com validade maior e invalidação/revalidação; agrupar reconciliações remotas equivalentes em voo | 30→300 s ≈90% de GETs do componente; Radar economiza rodadas redundantes | baixo/médio: descoberta de capacidade | baixa/média |
| P3 | MessagePack ou compressão WebSocket negociada | ganho a medir em payload representativo | médio/alto: Hermes, protocolo, segurança e intermediários | média/alta |
| P3 | Cache leve de vínculos estruturais do worker Radar, evitando geometria interna | praticamente zero na franquia ngrok; melhora CPU/DB | médio: revisão/publicação | média |

Não aumentar indiscriminadamente intervalo GPS ou Radar; não alongar validade de posição para parecer atualizado; não eliminar tombstones, timestamps ou vínculos necessários ao cálculo. Comparar payload sem `timestampServidor`/`composedAt` pode ajudar a detectar equivalência semântica, mas esses campos podem carregar validade: definir regra, não simplesmente ignorá-los.

ETag evita corpo em 304, mas continua sendo requisição HTTP. Cache persistente com versão pode evitar também o pedido. `max-age` longo só é correto se o recurso de versão for imutável; validar semântica de publicação e a validade de `EhVersaoAtual` antes de usar `immutable`. Separar dado geométrico imutável de metadados mutáveis.

Critérios para aceitar correções futuras: mesmo conjunto correto de veículos e próximos eventos, sem evidência mais velha aceita indevidamente; remoções/transferências respeitadas; Radar prioritário e encerramento/revisão preservados; recuperação após offline/reconexão; metas de bytes **e** pedidos por usuário-hora. Meta inicial: ≤800 MB/30 dias para o perfil acordado, com margem para tráfego não modelado.

## Instrumentação proposta: bytes reais, incluindo WebSocket

Nenhuma das sondas abaixo foi instalada nesta etapa.

### Camada 1 — referência da conta ngrok

Registrar antes/depois de cada janela o contador de Data Transfer Out e de HTTP Requests do painel, horário, endpoints participantes e tráfego de terceiros na mesma conta. Não registrar URL pública completa nem credenciais em relatório compartilhado. Aguardar atualização do painel antes de comparar. Medidor agregado identifica cobrança real, mas não distribui sozinho por operação.

Não depender apenas do inspector HTTP do ngrok: um upgrade `101` não descreve todos os bytes posteriores do WebSocket. Confirmar capacidade de medir frames da versão/ferramenta antes de usá-la como total.

### Camada 2 — transporte entre agente ngrok e API: medição sem payload

No Debian, observar somente o fluxo local agente↔porta 8080, validando interface/protocolo efetivamente usados. Um coletor de metadados com libpcap/eBPF pode contar tamanhos por direção/conexão, instante, flags TCP, número de sequência e ACK, descartando corpo e cabeçalhos de aplicação em memória. Não salvar PCAP bruto nem reconstruir JSON/token/localização. Não expor painel de captura na rede.

- Separar bytes TCP de aplicação únicos por intervalos de sequência e retransmissões; não somar loopback duas vezes, requests e responses indiscriminadamente ou pacotes ACK como corpo.
- Contagem de interface `lo` ou NIC inteira mistura outros serviços e não serve como atribuição da API. Captura no túnel externo criptografado mistura overhead e eventualmente conexões multiplexadas.
- Porta 8080 pode incluir chamadas locais que não vieram do agente: atribuir ao processo/socket do agente e calibrar. Se houver HTTP/2/hop diferente, adaptar a medição.
- Essa camada inclui tráfego WebSocket real, framing e transporte daquele hop. Não equivale necessariamente ao hop cliente↔ngrok ou ao contador faturado; reconciliar com a camada 1.

### Camada 3 — contagem por operação no servidor

HTTP: middleware contador em stream/body writer de resposta que preserve streaming, cancelamento e backpressure, conte bytes realmente escritos, inclusive quando `Content-Length` não existe, e conte entrada separadamente. Se houver compressão, posicionar contador para ver a saída comprimida e opcionalmente outro para corpo lógico. Não bufferizar nem serializar novamente apenas para medir.

Dimensões: rota normalizada (`/paradas/{id}/eventos`), método, status, content-encoding, estado agregado da sessão, faixa de tamanho, janela de minuto; total, média e p95. Incluir erros, 304, OPTIONS e negotiate. Não usar URL/query completa como rótulo.

WebSocket: middleware HTTP comum e `Content-Length` **não bastam após upgrade**. Para medir mensagens de aplicação, observar serialização `IHubProtocol` com contador de bytes no writer (incluindo separadores), sem duplicar serialização. Essa métrica é lógica; considerar que serialização pode ser compartilhada entre destinatários.

Para bytes enviados por conexão e fan-out, instrumentar a fronteira efetiva de transporte por conexão ou decorar a feature de aceitação WebSocket/`WebSocket.SendAsync` e `ReceiveAsync`, preservando todas as sobrecargas usadas pela versão .NET, fragmentação e fechamento. Registrar contagem/comprimento somente, sem conteúdo. Esses métodos medem payload entregue ao WebSocket, **antes** de eventual compressão/framing do transporte; cruzar com captura da camada 2 para wire bytes. Não apresentar esse contador como wire-compressed bytes.

Registrar transportes WebSocket/SSE/LongPolling e reconexões. Nos publicadores, agregar evento, grupo lógico, tamanho serializado, quantidade de destinatários e quantidade de veículos. Um `SendAsync` para grupo não prova que houve tantos bytes na rede; cruzar envio lógico com conexões e conclusão do transporte, sem multiplicar duas vezes.

Métricas úteis:

- `api_response_body_bytes_total{route,status,encoding}` e requests/erros;
- `realtime_payload_bytes_total{event,transport,direction}`;
- mensagens/s, tamanho p50/p95, veículos por mensagem, destinatários;
- snapshots semanticamente idênticos, proporção alterados/total;
- contagem agregada de conexões nos dois grupos legado/unificado da mesma linha;
- inscrições/cancelamentos/reconexões e duração em foreground/background;
- Radar: ciclos, paradas, sessões, consultas internas, tempo, saturações, pushes suprimidos/enviados/confirmados, falhas. Vários desses contadores já aparecem nos logs do worker.

### Camada 4 — observação no aplicativo

Cobrir `api.ts`, fetch de capabilities, fetch do Radar e transporte SignalR. Contar bytes UTF-8 de amostra em laboratório ou usar metadados nativos; `.length` de string JavaScript não mede bytes UTF-8. `JSON.stringify` do objeto recebido mede representação reconstruída, não transferência real; fetch pode entregar conteúdo já descomprimido. `Content-Length` pode faltar ou representar formato comprimido.

No SignalR cliente, uma implementação decorada de WebSocket pode contar mensagens recebidas/enviadas antes do parsing; não captura automaticamente SSE/LongPolling nem necessariamente framing/compressão. Preferir medição externa para wire bytes. Evitar ativar logs `Trace` com conteúdo, HAR bruto e dump de payloads.

### Privacidade e execução do experimento

Somente contadores e histogramas. Não registrar coordenadas, nomes de parada, ordens de veículo, GUIDs de sessão/instalação, tokens Expo, Authorization, cookies, payloads, querystrings ou identificadores persistentes. Usar rotas templadas e evento de vocabulário fechado. Se necessário correlacionar conexão durante o ensaio, identificador aleatório efêmero sem vínculo com usuário, removido ao agregar; linhas em buckets ou agregação global para evitar cardinalidade/rastreio. Manter a instrumentação existente do Radar intacta.

Plano de ensaio futuro:

1. Janela ociosa do túnel sem apps para estimar tráfego de fundo da conta.
2. Um aparelho, 10 min por cenário: mapa rodoviário com 1 linha e depois múltiplas; trem com 1 e 2 linhas; parada de poucos/muitos eventos; abertura fria/quente; Radar remoto ativo.
3. Minimizado por 30 min e processo encerrado por 30 min, acompanhando conexões e entrega remota sem ampliar TTL.
4. Repetir cenário de referência com 5 aparelhos; incluir retorno ao app e interrupção/reconexão controlada em ambiente de ensaio.
5. Registrar tempo, bytes HTTP/WS separados, requests, veículos/eventos, linhas e flags em quantidades agregadas. Extrapolar por usuários-hora e confrontar delta do painel; repetir apenas se discrepância material exigir explicação.

Entregável dessa medição: ranking **observado**, custo por operação p50/p95, MB/usuário-hora em cada estado e projeção usando tempo de uso real. A auditoria estática atual já permite priorizar, mas não garante 1 GB/mês sem esse perfil.

## Fontes externas consultadas

- [ngrok — Free Plan Limits](https://ngrok.com/docs/pricing-limits/free-plan-limits): franquias de saída e requisições, orientação de painel e header de interstitial. O número de usuários da tabela ngrok refere-se à conta, não ao número de passageiros do app.
- [ngrok — Pricing and Limits](https://ngrok.com/docs/pricing-limits): Data Transfer Out e medição de uso; confirmar ciclo aplicável no painel da conta.
- [Microsoft — configuração do SignalR](https://learn.microsoft.com/en-us/aspnet/core/signalr/configuration): keepalive padrão de 15 s.
- [Microsoft — WebSockets](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/websockets): compressão negociada e características de transporte. Compressão HTTP e WebSocket são mecanismos distintos.
