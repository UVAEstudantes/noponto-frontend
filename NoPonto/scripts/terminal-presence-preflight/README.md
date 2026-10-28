# Preflight isolado ITS_CURRENT × GTFS-RT BUS

Estado em 28/10/2026: **pronto para pedir autorização de um piloto exploratório de proximidade; nenhuma aquisição real foi executada**. O usuário informou que executou manualmente no PowerShell o build sem restore e sem incremental (sucesso em 10,5 s), os dez testes HTTP simulados (**10/10 PASS**), `--plan` (14 GETs, 240 s, 48 MiB) e `--inspect-local` (494 rotas; 5 âncoras em Campo Grande, 1 em Magarça e 27 em Deodoro). Estes são resultados **informados pelo usuário**, não comandos ou evidências de execução produzidos por esta sessão do agente. O agente havia concluído o restore offline com uma única fonte local; sua tentativa de build foi bloqueada pela política da sessão. Não houve consulta ITS/GTFS real.

## Auditoria de prontidão local

Foram corrigidos: base absoluta ausente para o cliente ITS de URI relativa; espera GTFS de 31 s iniciando antes do cronômetro de 10 s do GET; checagem do prazo total depois da resposta; tratamento de linha ITS nula; herança indevida de ETag/Last-Modified depois de um novo HTTP 200; cópia de corpo sem cancelamento; validação de limites numéricos não finitos; rejeição de perímetro autointersectante; e saída segura para exceções inesperadas. O escopo das mudanças é exclusivamente esta pasta.

Foram escritos dez testes com `HttpMessageHandler` simulado e relógio controlado. Eles cobrem GETs, paginação, bytes, tempo, campos opcionais, identidade global, desalinhamento, 304/429/503/Retry-After, renovação física, geometria e privacidade. O resultado manual informado foi 10/10 PASS. A revisão de código nesta sessão confirmou que apenas `--execute-authorized` chega à construção do transporte HTTP; `--plan` retorna antes do carregamento de arquivos e `--inspect-local` retorna após ler somente o GTFS estático. A auditoria local do GTFS confirmou os quatro códigos de linha e grupos nomeados de cinco pontos em Campo Grande, um em Magarça e 27 em Deodoro; isto não valida perímetros.

Riscos restantes: `id_veiculo` igual nas duas fontes ainda exige equivalência operacional verificada para afirmar que é o mesmo ônibus; diferenças temporais, cache e cadências podem tornar o resultado inconclusivo; duas rodadas não demonstram cobertura contínua da ITS; `servico` informado não confirma viagem ativa nem próxima saída. O código conserva conflitos e não promove proximidade a interior. Sem `trustedPolygon`, o piloto pode mostrar apenas veículos **próximos** das âncoras GTFS ou com localização incerta. Qualquer inferência de presença dentro da instalação e qualquer camada produtiva exigem geometria revisada e evidência física adicional.

## Escopo e orçamento fechado

O modo padrão `--plan` apenas imprime o plano; `--inspect-local` lê o GTFS estático. Somente `--execute-authorized`, após autorização separada, cria o transporte HTTP. O laboratório reutiliza `GpsDatarioClient.BuscarPaginaLimitadaAsync`, DTO e validador existentes por vínculo de fonte local. Não registra serviço em host, não executa polling produtivo e não lê/escreve matching, CAS, Redis, SignalR, ETA ou escritor GPS.

| Limite | Valor e efeito |
|---|---|
| Aquisições ITS | 2 minutos UTC fechados, 1 por rodada; até 5 páginas de 5.000 registros por aquisição; máximo 10 GETs ITS. `next_cursor` após a quinta página torna a aquisição inconclusiva; não há sexta página. |
| GTFS-RT BUS | 4 GETs, antes e depois de cada aquisição ITS; início de GETs GTFS separado por pelo menos 31 s, além de `Cache-Control`/`Age` quando presentes. |
| Total | **14 GETs, 240 s, 48 MiB de corpos**. Cada página ITS até 4 MiB; cada corpo GTFS até 2 MiB. São tetos simultâneos, nunca metas de consumo. |
| Tempo por pedido | 10 s. Aquisição ITS até 30 s, com pelo menos 1 s entre GETs ITS e 60 s entre inícios de aquisições. Sem retry automático. |
| Falha | 429, 503, `Retry-After`, política de limite desconhecida, prazo, byte, cursor repetido, provedor incompleto e resposta inválida encerram ou invalidam a rodada; nenhum dado parcial prova ausência. |

A consulta ITS usa apenas `sistema=sppo`, `modo=onibus`, `minuto_utc` e `limit=5000`, mais cursor. Não filtra linha, veículo, fornecedor nem terminal. Os recortes 838, 884, 866 e SV866 apenas agrupam o relatório. Uma mesma aquisição cobre Campo Grande, Magarça e Deodoro. `ZIRIX` e `CONECTA` são rótulos de procedência dentro da ITS centralizada, sem chamada ZIRIX_DIRECT.

## Interpretação

O registro bruto ITS conserva em memória `id_veiculo` original, forma canônica por trim/maiúsculas sem retirar zeros, fornecedor, coordenada, `datetime` físico, `datetime_servidor` e metadados opcionais. `servico`, `trip_id` e `route_id` vazios não eliminam a observação física. Velocidade ausente permanece desconhecida. A saída contém apenas contagens; não grava payload, identidade individual, coordenadas, timestamps individuais nem credenciais.

A identidade é procurada em **todo** o snapshot GTFS, inclusive outra linha e registros sem `Trip`/`RouteId`. Uma ausência comparável requer ambas as leituras GTFS completas, cobertura de identidade, gerações novas e crescentes, alinhamento com o `datetime` físico, aquisição ITS completa e proveniência esperada. `datetime_servidor` comprova a janela de consulta, **não** a renovação de GPS. Uma resposta 304 pode reutilizar bytes para observação, mas não conta como nova geração física. Contagem `not_observed_in_aligned_gtfs` é ausência naquelas duas leituras, não prova de omissão geral do feed ou de ônibus estacionado.

`facilities.json` referencia âncoras e plataformas do GTFS estático. **Nenhuma instalação tem `trustedPolygon` atualmente.** Assim, não haverá resultado `inside_trusted`: até 200 m de âncora é `near_terminal`, até 1 km é `uncertain_location`, e o resto fica fora do recorte. Um perímetro futuro precisa ter origem, revisão, data de revisão, fecho e geometria simples; a faixa de 20 m junto à borda fica incerta. Não inferir pátio de ponto, nome, fim de itinerário ou padrão circular. Revisar Campo Grande (plataformas e pátio junto à Xavier Marques), Magarça (sem `parent_station`) e Deodoro (múltiplas plataformas e pátios) antes de afirmar interior físico.

## Critérios de decisão para o piloto

**O piloto exploratório de proximidade está tecnicamente pronto para autorização específica dos GETs**, com build e testes manuais informados como aprovados, contrato/artefatos vinculados conferidos, limites revisados e geometria explicitamente rotulada como âncora. A autorização de aquisição real ainda não foi dada. Se o objetivo for demonstrar *interior* de terminal, o perímetro revisado é pré-requisito. Para proximidade, o perímetro pode continuar ausente, desde que todos os resultados sejam rotulados assim.

**Interromper** ao atingir qualquer orçamento, 429/503, `Retry-After`, nova política/intervalo de provedor incompatível, falha de cancelamento, página incompleta, erro de cache, falta de estado `ok` de ambos os provedores ou resposta inválida. Não repetir automaticamente.

**Inconclusivo** se não houver amostra física no local, só houver proximidade, não houver duas posições físicas novas do mesmo veículo, o GTFS não tiver snapshots comparáveis, a ITS estiver parcial, a identidade conflitar, ou houver mudança de serviço sem vínculo inequívoco. Um resultado positivo de proximidade e exclusividade ITS justifica ampliar a investigação, não lançar “No terminal”.

Para justificar a camada de presença física, requeremos veículo com identidade verificável, **duas leituras ITS com `datetime` físico crescente** e fix válido no **interior de perímetro revisado**, sem a mesma identidade em snapshots GTFS completos e temporalmente compatíveis, além de distinção explícita de viagem e saída. O piloto de duas rodadas pode revelar esse caso, mas não mede cobertura de toda a rede nem assegura recorrência; caso positivo pede validação adicional no celular e em mais episódios antes de implementação produtiva.

## Comandos para repetição controlada

Do diretório `noponto-frontend`. O usuário informou que já executou estes comandos manualmente; eles não foram repetidos pelo agente nesta revisão:

```powershell
dotnet build NoPonto/scripts/terminal-presence-preflight/Tests/TerminalPresencePreflight.Tests.csproj --no-restore --nologo
dotnet run --project NoPonto/scripts/terminal-presence-preflight/Tests/TerminalPresencePreflight.Tests.csproj --no-restore
dotnet run --project NoPonto/scripts/terminal-presence-preflight/TerminalPresencePreflight.csproj --no-restore -- --plan
dotnet run --project NoPonto/scripts/terminal-presence-preflight/TerminalPresencePreflight.csproj --no-restore -- --inspect-local --schedule ..\noponto-backend\artifacts\its-e2e-20261023\gtfs.zip --facilities NoPonto/scripts/terminal-presence-preflight/facilities.json
```

**Comando de aquisição futura, somente após autorização expressa dos GETs** (não executar como parte da preparação):

```powershell
dotnet run --project NoPonto/scripts/terminal-presence-preflight/TerminalPresencePreflight.csproj --no-restore -- --execute-authorized --schedule ..\noponto-backend\artifacts\its-e2e-20261023\gtfs.zip --facilities NoPonto/scripts/terminal-presence-preflight/facilities.json
```

Os vínculos locais de código usam o backend irmão `noponto-backend/NoPonto`, o Protobuf de `bin/Release/net9.0` e o C# gerado de `obj/Release/net9.0`. São dependências de laboratório que precisam existir e corresponder à revisão local antes da execução; não há instalação de pacotes prevista aqui.

Antes da aquisição futura: conferir que o checkout e os artefatos vinculados ainda são os mesmos, escolher uma janela operacional curta, registrar início UTC, manter os três terminais no mesmo lote e rodar o comando uma única vez. Conferir `status`, `itsGets`, `gtfsGets`, `bodyBytes` e completude das duas rodadas; se houver interrupção ou desalinhamento, registrar **inconclusivo** sem repetir automaticamente. Salvar apenas a saída agregada, sem payloads, IDs ou coordenadas individuais. Nunca interpretar `near_terminal` como `inside_trusted` nem como disponibilidade para embarque.
