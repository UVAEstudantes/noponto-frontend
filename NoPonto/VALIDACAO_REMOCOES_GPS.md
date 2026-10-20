# Validação local — remoções GPS BUS/BRT

Data: 2026-10-20. Branch exclusiva: `ajustes`.
Base inicial `139859b`; base WIP de presença/terminal versionada separadamente em `fc79729`, com autorização do usuário.
Contrato backend de referência: `204caef`, evento `LinhaEsvaziada({ codigoLinha })`.
Sem mudanças no backend, main, PR, push, EAS/APK, deploy, workflows ou dependências.

## Antes e depois

Antes, o serviço escutava somente `PosicaoAtualizada`. Um array vazio não identificava a linha e a retenção do WIP podia manter a presença anterior. Ao isolar o contexto de cada consumidor, foi necessário tratar também a identidade transferida observada para outra linha, antes do filtro visual.

Depois, o callback adicional opcional do hub compartilhado informa o código normalizado da linha. O hook remove apenas suas posições e evidências de presença, atualizando a lista derivada de linhas disponíveis sem alterar favoritos, seleções, filtros ou estruturas. Os listeners de posições existentes continuam com a assinatura anterior.

O novo `gpsSnapshotGuard.ts` compartilha a ordenação entre SignalR e o helper REST:
- valida código string não vazio, até128 caracteres, sem controles; trim/uppercase preservam zeros e códigos alfanuméricos;
- conserva timestamp GPS por identidade física e linha: após vazio, GPS igual/menor não restaura aquela observação; GPS estritamente maior permite reaparecimento, mesmo anterior à hora de recebimento do vazio;
- rejeita observações inválidas, futuras ou além da retenção física já existente;
- invalida REST iniciado antes do vazio, de um snapshot da mesma linha ou de uma mudança de conexão; um evento de outra linha não invalida o pedido;
- cobre reconexão automática e reinício manual após onclose; não persiste tombstones, coordenadas ou relógios novos de GPS;
- mantém marcas por no máximo a janelaGPS180s e5000 identidades. Se cheio, rejeita identidades novas até liberar espaço, sem esquecer uma remoção ainda válida. Tokens REST são limitados e sua remoção invalida pedidos pendentes.

`buscarVeiculosPorLinha` continua exportado, mas não tem chamadores internos atuais; o fluxo do hook é SignalR. A proteção no helper cobre respostas atrasadas de quem o utilizar, sem introduzir polling REST ou uma segunda fonte de posições no mapa.

A reconciliação existente recebe também as identidades observadas fora das linhas visíveis daquele hook. Assim, um veículo confirmado em outra linha sai do consumidor anterior, inclusive quando sua linha antiga ainda tem outros veículos. Omissões temporárias sem prova de transferência continuam respeitando a retenção WIP.

O timer existente foi reaproveitado para expirar posições pela idadeGPS, inclusive durante desconexão e com a apresentação de presença OFF. Não renova timestamps. Verifica em foreground a cada1s com presençaON e15s com presençaOFF; remove no próximo tick após exceder180s, com limpeza imediata ao retornar ao foreground. Não trabalha em background/inactive. O limite visual de frescor60s, as regras de terminal, o limite de retenção180s e a flag OFF por padrão foram preservados.

## WebView

`mapOSM.tsx` foi revisado e não exigiu alteração. `mapScript.ts` foi apenas incluído, sem mudanças adicionais, no commit da base WIP autorizada. As posições vazias seguem o caminho existente de props para `updateRealtime`, preservando a linha estrutural e o handshake `map_ready`.

O teste executa handlers e serviços TS reais, o hook com executor de hooks em memória, o componente nativo real e o JavaScript realmente injetado pelo componente. O builder real da WebView roda em VM com DOM e MapLibre simulados. São verificadas exclusão do Marker, Popup, heading, dead reckoning e índice por ordem, cancelamento da animação e preservação da instância do marcador BRT restante. Não recarrega o HTML nem reescreve a geometria na remoção; uma observação nova recria o marcador removido pelo mesmo caminho.

Isso comprova a composição lógica local. Não substitui smoke em React Native/Android, browser real, background nativo ou transporte WebSocket real nesta etapa.

## Regressões demonstradas antes de cada correção

1. `LinhaEsvaziada removes only its line across shared consumers`: falhou porque o handler não existia, depois de receber duas posições reais pelo serviço.
2. `transfer to another owner removes old presence even when old line stays nonempty`: durante o isolamento dos consumidores, falhou mantendo TRANSFER e STAY na linha anterior, quando somente STAY deveria permanecer.
3. `manual connection restart rejects REST started while disconnected`: durante a integração do guard, falhou devolvendo uma posição de REST iniciado durante desconexão após start manual. A mesma invalidação usada na reconexão automática foi aplicada ao start bem-sucedido.

Falhas intermediárias do simulador de hooks/DOM foram corrigidas sem remover asserções; não foram usadas como prova de falha do produto.

## Testes e resultados

Executados de NoPonto/, com dependências locais já existentes:

~~~text
pnpm.cmd exec node --test --test-reporter=tap src/services/gpsRemovals.test.cjs src/services/terminalPresence.test.cjs src/services/favoritosEtapaB.test.cjs
45 aprovados, 0 falhas, 0 ignorados/cancelados (21 novos + 24 existentes).

pnpm.cmd exec node scripts/test-indicadores.cjs
22 aprovados, 0 falhas, 0 ignorados/cancelados.

pnpm.cmd exec tsc --noEmit
Aprovado, exit0.

pnpm.cmd exec eslint src/services/gpsHub.ts src/services/gpsSnapshotGuard.ts src/services/gpsRemovals.test.cjs src/services/mobilidadeRio.ts src/services/veiculosMapa.ts src/services/roadPresence.ts src/services/terminalPresence.test.cjs src/hooks/useMobilidadeRio.ts --no-cache
Aprovado, zero erros/avisos.

pnpm.cmd lint
Bloqueado por 5 erros e 3 avisos preexistentes, fora da correção.
~~~

O lint global exige declarar __dirname em carregamentoInicial.test.cjs, favoritos.test.cjs, favoritosEtapaB.test.cjs (2ocorrências) e tarifas.test.cjs. Avisos anteriores: normalModal em app/index.tsx e local/parada em useRadarParada.ts. Não foram alterados. A primeira tentativa também encontrou bloqueio de cache .expo pelo sandbox; a execução autorizada fora dele confirmou os problemas listados.

| Requisito | Testes exatos de gpsRemovals.test.cjs |
|---|---|
| Vazio por linha, consumidores compartilhados e outra linha preservada | LinhaEsvaziada removes only its line across shared consumers |
| BUS/BRT, retenção ON/OFF, repetição/ordem e GPS novo | BUS empty overrides retention and only newer GPS may reappear presence=true / presence=false; BRT empty overrides retention and only newer GPS may reappear presence=true / presence=false |
| Transferência e identidade física | transfer keeps one physical identity and rejects old-line replay presence=true / presence=false |
| Consumidores de linhas diferentes e linha antiga ainda não vazia | transfer to another owner removes old presence even when old line stays nonempty |
| Reconciliação direta e omissão temporária preservada | reconciler removes observed transfer outside visible lines while retaining temporary omissions |
| Payloads inválidos e normalização | invalid empty payloads cannot clear any line |
| REST atrasado, linha incorreta, GPS repetido e GPS novo | late REST is invalidated only for its line and cannot undo an empty |
| Reconexão automática e REST pendente | disconnect invalidates pending REST and reconnect keeps removed GPS blocked |
| Reconexão manual e reinscrição | manual connection restart rejects REST started while disconnected |
| Cancelamento, múltiplos donos e frames de linha não selecionada | cancel and resubscribe preserve other owners and ignore late unselected frames |
| Expiração, fronteira180s, desconexão e foreground | disconnect expires at existing retention and foreground prunes without GPS presence=true / presence=false |
| Terminal não herda chegada removida | empty clears terminal arrival evidence before opposite direction reappears |
| Props, handshake, script injetado e marcadores reais do script | SignalR hook and native bridge remove real WebView markers without reloading HTML |
| ValidadeGPS, fronteiras e expiração de tokens | GPS guard enforces retention boundaries and rejects invalid observations |
| Limite de memória sem esquecer remoção viva | GPS guard bounds tracked identities without forgetting live removal evidence |
| Ordenação REST isolada por linha | REST ordering tokens change for same-line snapshots but not for another line |

As suítes anteriores ainda verificam favoritos, Radar, identidade estrutural, terminais, retenção e apresentação de indicadores. Total desta rodada:67 casos aprovados. Testes não executados: APK/dispositivo, Expo web/browser real, E2E com backend e WebSocket reais, CI ou carga de pico. Nenhuma nova dependência instalada.

## Git e preservação do WIP

A cópia inicial contém23 caminhos WIP. Os13 não relacionados permaneceram byte a byte iguais por SHA256. Cinco arquivos da base de presença (app/index, app/linhas, mapOSM/types, mapScript e types/veiculoMapa) também permaneceram iguais ao conteúdo inicial. O restante recebeu apenas as alterações relacionadas desta integração. O histórico anterior é preservado como prefixo exato; a entrada WIP de18/10 sobre documentação local continua fora dos commits.

Base autorizada em commit separado: app/index.tsx, app/linhas.tsx, src/hooks/useMobilidadeRio.ts, src/services/veiculosMapa.ts, src/services/roadPresence.ts, src/services/terminalPresence.test.cjs, src/types/veiculoMapa.ts, src/components/mapOSM/types.ts, src/components/mapOSM/webview/mapScript.ts e somente sua entrada do histórico.

Integração: gpsHub.ts, gpsSnapshotGuard.ts (novo), mobilidadeRio.ts, veiculosMapa.ts, roadPresence.ts, useMobilidadeRio.ts, gpsRemovals.test.cjs (novo), declaração de __dirname no teste de terminal, esta validação e somente a nova entrada do histórico. Startup, tema, EAS, lockfile, package.json, AGENTS.md e README preexistentes ficam fora desses commits. Backend conferido limpo em204caef.

## Limites restantes

- Proteção em memória e baseada no GPS observado; o evento não contém cursor global nem timestamp do servidor. Não há ordenação durável entre processos/fontes nem garantia sobre mensagens perdidas antes de uma nova sincronização. O fluxo assume o contrato ordenado da conexão SignalR e leitura REST do backend.
- GPS de identidades conhecidas só reaparece com timestamp maior após vazio. Um novo veículo desconhecido depende do snapshot autoritativo recebido; não se inventa um corte pelo relógio de chegada do evento que bloquearia GPS novo legítimo.
- Limite5000 por janela e idade baseada no relógio do dispositivo: validar carga representativa e relógio real na homologação.
- A remoção por evento ocorre na próxima atualização React/WebView; fallback por expiração depende do tick/foreground, sem promessa de temporização exata em background.
- Fazer smoke em dispositivo já instalado/dev client quando disponível, sem iniciar EAS Build nesta tarefa. A PR existente segue intocada e os commits não foram enviados.
