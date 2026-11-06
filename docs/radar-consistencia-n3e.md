# N3-E — Consistência dos Radares

Base auditada: `7e88d62`, branch `feat/radar-notificacoes`.
Esta etapa substitui a regra N3-D que tratava abrir qualquer detalhe de parada
como transferência deliberada do acompanhamento.

## Origem e consumidores

O endpoint continua sendo `GET /paradas/{paradaId}/eventos`, sem parâmetros de
sentido ou padrão na chamada HTTP. Os vínculos de linha, sentido, versão e
operação são aplicados no frontend. `buscarEventosParada` compartilha apenas
requisições HTTP simultâneas da mesma parada; não é um cache persistente de ETA.
`useConsultaEventosParada` faz o polling já existente, 30 segundos após concluir
o pedido anterior, e mantém o relógio de apresentação existente, de 1 segundo.
Não foram adicionados novos timers, ciclos de polling ou conexões. A comparação
DEV não faz requisições.

Antes, o mapa tinha `useRadarParada` com uma instância dessa consulta e o detalhe
tinha outra instância. Abrir “Ver todos” desativava/limpava a primeira e ativava
a segunda. Portanto, podia obter outra resposta, outro `recebidoEm` e outro
relógio. Um ETA relativo é ancorado no recebimento; um horário absoluto usa
`estimatedAt`/`scheduledAt`. Comparar capturas próximas sem esses timestamps e
identidades não garante comparação do mesmo evento/snapshot.

Agora, `useRadarParada` recebe opcionalmente a parada visualizada e mantém uma
única instância de `useConsultaEventosParada`. Abrir/fechar “Ver todos” na mesma
parada preserva contexto, resposta, recebimento e ciclo de consulta. Abrir outra
parada altera a chave e invalida respostas antigas antes de exibir eventos.

| Consumidor | Dados usados |
| --- | --- |
| Compacto | Eventos válidos da consulta única → `chegadasDoRadar` → `passengerRadar(..., 2)` |
| Completo | Mesmo snapshot, `recebidoEm`, `agora` e vínculos → `chegadasDoRadar` → `passengerRadar` sem limite de duas vagas |
| Espera | Mesmo snapshot → `previaNotificacaoRadar` → elegibilidade e seleção N1/N3-D |

`chegadasDoRadar` é o cálculo compartilhado do ETA apresentado. O compacto ainda
arredonda minutos para cima; o completo pode mostrar minutos e segundos. Isso é
precisão textual diferente, não uma segunda previsão.

## Divergências comprovadas e corrigidas

- **Ordem por distância antes de ETA:** uma previsão de 79 min e distância menor
  podia preceder uma de 1 min. As vagas operacionais agora seguem ETA; distância
  desempata, seguida da identidade. As categorias/posições físicas existentes
  foram preservadas. O compacto é um prefixo da mesma ordenação completa.
- **Ordenação de tempo bruto versus ajustado:** o compacto usava diretamente
  `secondsUntilEvent`, enquanto o completo recebia `etaSeg` já descontado do
  tempo decorrido. Misturar eventos relativos com horários absolutos podia mudar
  a ordem. Ambos agora entram na reconciliação/ordenação pela mesma apresentação.
- **Identidade perdida:** a apresentação completa preservava `codigoVeiculo`,
  mas descartava `vehicleId` quando aquele código não existia. Isso podia
  reconciliar a presença física de forma diferente. Agora preserva veículo,
  viagem esperada, ocorrência, sentido e operação, sem agrupar ônibus pela linha.
- **Contexto físico ampliado:** o completo passava só linhas à apresentação de
  terminal, enquanto o compacto passava vínculos de padrão. O completo agora
  recebe os mesmos vínculos e o mesmo relógio da consulta.
- **Validade desigual:** os painéis não limitavam idade da resposta/GPS como a
  N1. Agora usam o limite existente de cinco minutos, inclusive na fronteira;
  rejeitam evidência inválida/futura e operação incompatível quando conhecida.
  A operação também participa da chave de consulta.
- **Navegação versus acompanhamento:** visualizar outra parada não transfere a
  sessão de Espera. Sem consulta do alvo original, ela pausa e limpa a previsão.
  Voltar ao alvo com dados válidos retoma sem pedir permissão novamente. A seleção
  deliberada no seletor do Radar compacto continua podendo reconfigurar o alvo.

## Passagem, cache e ausência de previsão

O DTO de eventos atual não possui um estado explícito “passou pela parada” ou
uma exclusão/tombstone de passagem. Uma resposta bem-sucedida é um snapshot:
substitui integralmente a anterior, inclusive quando vazia. Se o servidor remove
um evento após a passagem, ele desaparece dos painéis, do mapa de IDs usado no
foco e da seleção N1. Não há união com eventos de viagens anteriores.

O relógio sozinho não comprova passagem. Quando o horário previsto vence, o
evento ainda fresco pode permanecer identificado, **sem ETA e sem horário de
chegada antigo apresentado**. O painel mostra “Sem previsão”; a N1 continua
excluindo esse evento da notificação. Não se inventa zero nem chegada confirmada.
Uma atualização válida pode restabelecer sua previsão normalmente.

Falha de atualização preserva apenas o snapshot ainda válido, sem renovar seu
recebimento ou GPS. Consulta/GPS vencidos removem os eventos elegíveis mesmo se
o horário futuro ainda for distante. Sair do primeiro plano invalida pedidos e
limpa o snapshot da consulta; o retorno exige resposta nova. Oscilação normal do
GPS ou ausência temporária do veículo no mapa não apaga uma previsão válida:
localização para foco e elegibilidade operacional são coisas distintas.

As posições rodoviárias têm próxima ocorrência e progresso de rota, mas não há
uma identidade de viagem rodoviária comum garantida com o evento que permita
deduzir passagem sem confundir próxima viagem, repetição de parada ou volta.
Não foram criadas heurísticas de passagem por geometria, nome da próxima parada,
distância negativa ou horário vencido.

Uma previsão de 79 min **não é automaticamente inválida**. Ela deixa de ocultar
chegadas próximas, mas não foi introduzido teto arbitrário no Radar completo.
A janela configurada continua restringindo apenas os candidatos da Espera.

## Diagnóstico DEV sob demanda

No NoPonto Dev, com Metro conectado, tocar **Comparar Radares · DEV** no compacto
ou completo. Uma única mensagem `[Radar comparação DEV]` aparece no Metro por
toque, sem consultas adicionais. Não há logs contínuos; o botão não existe em
produção. O diagnóstico conserva somente o último snapshot compacto disponível
e limita a saída a 12 eventos por representação e duas vagas compactas.

Inclui endpoint, contexto, parada/vínculos, eventId, vehicleId, viagem/ocorrência,
tipo chegada/saída, ETA original, ETA apresentado, horário previsto, recebimento,
relógio, última evidência, ETA recalculado em referência comum e motivos de
exclusão/diferença. Presenças físicas são uma categoria separada, sem ETA
operacional inventado. O alvo e os candidatos da Espera aparecem separadamente.

O snapshot compacto pode ser anterior ao atual: o relatório distingue contexto,
horário de referência e mudança de previsão entre respostas. Uma ausência fora
do limite de 12 eventos não é anunciada como prova de passagem.

Para reproduzir Bom Repouso:

1. Selecionar a parada e conferir eventId/veículo do compacto; abrir “Ver todos”.
2. Tocar Comparar e guardar o bloco DEV com os timestamps. Identificar se o card
   é evento operacional ou estimativa física de GPS, sem comparar categorias.
3. Repetir antes/depois da passagem e após a próxima resposta bem-sucedida.
4. Conferir se o servidor retirou o eventId ou alterou viagem/operação/versão,
   e se `estimatedAt`, `secondsUntilEvent` e última evidência são coerentes.
5. Abrir outra parada com a Espera ativa: ela deve manter seu alvo e pausar;
   voltar deve retomar somente com os dados corretos.

Sem os payloads/IDs/timestamps das capturas originais, não se atribui uma causa
única ao caso de Bom Repouso nem se afirma correção de um erro do modelo ETA.
Se o backend continuar enviando o mesmo evento como futuro, com evidência fresca
e contexto/viagem compatíveis após a passagem real, será necessária investigação
do backend. Guardar os snapshots e a sequência de posições com operação,
versão, ocorrência e identidade de viagem, além dos horários de servidor/GPS.

## Validação automatizada

Validados **181 testes distintos**, em execuções direcionadas N1/N2/N3, consulta, apresentação,
ordenação e diagnóstico, além de `npx --no-install tsc --noEmit` na pasta
`NoPonto`. A simulação e a hierarquia N3-D permanecem cobertas. Sem backend,
modelo ETA, SignalR, dependências, código nativo, APK, deploy ou D:\npdev.

Comandos reproduzíveis, na pasta `NoPonto`:

```powershell
node scripts/test-radar.cjs src/services/radarParada.test.ts src/hooks/useConsultaEventosParada.test.cjs src/services/diagnosticoConsistenciaRadar.test.ts src/services/radarEspera.test.ts src/services/notificacoesRadar.test.ts src/services/previaNotificacaoRadar.test.ts src/hooks/useRadarEspera.test.cjs src/components/mapaComponents/radarEsperaSection.test.cjs src/services/notificacaoLocalTeste.test.cjs src/components/mapaComponents/previaNotificacaoRadarSection.test.cjs src/components/mapaComponents/radarConfiabilidade.test.cjs src/services/radarPassenger.test.ts src/services/apresentacaoRadar.test.ts src/services/eventosParada.test.ts
npx --no-install tsc --noEmit
```

| Requisito | Teste exato |
| --- | --- |
| Mesma previsão e referência | `mesmo evento nos dois paineis usa instante recebido e ETA identicos` |
| Consulta única ao abrir completo | `ver todos na mesma parada conserva consulta timestamp e ciclo de polling` |
| Ordenação de ETA ajustado no componente | `compacto usa mesma apresentacao do completo antes de ordenar ETA relativo e absoluto` |
| Dois veículos da mesma linha | `dois veiculos da mesma linha permanecem distintos e compacto resume prefixo completo` |
| Remoção autoritativa e nova viagem | `resposta autoritativa apos passagem remove evento sem mistura com viagem nova` |
| ETA vencido não comprova passagem | `relogio sozinho nao comprova passagem e previsao vencida fica indisponivel` |
| Consulta/GPS vencidos | `consulta vencida e GPS vencido nao permanecem nos consumidores` |
| Falha sem renovar cache | `falha preserva snapshot fresco mas nao renova validade do GPS ou consulta` |
| Parada/sentido/operação/versão | `operacao sentido e versao incompatíveis invalidam eventos sem confundir viagem` |
| Chegada iminente e previsão distante | `chegada iminente precede previsao de 79 minutos mesmo com distancia maior` |
| Independência da Espera | `visualizar outra parada nao transfere acompanhamento e voltar retoma o alvo original` |
| Diagnóstico só por interação e só DEV | `comparacao DEV e acionada por toque nos dois paineis e nao existe em producao` |
| Limites de diagnóstico | `diagnostico limita comparacao a doze eventos e duas vagas compactas` |
| Separação da presença física | `diagnostico separa presenca fisica de ETA operacional` |
| Identidade na reconciliação | `reconciliacao fisica preserva vehicleId mesmo sem codigoVeiculo nos dois paineis` |
| N3-D | `884 iminente permanece entre tres veiculos da 838 prioritaria` e demais casos N3-D |
