# N3-A — prévia N1 com os dados já consultados pelo Radar

`NoPonto/src/services/previaNotificacaoRadar.ts` exporta o adaptador puro
`criarPreviaNotificacaoRadar` e os tipos de entrada/saída. Não consulta dados, não
cria timers, não envia notificações e não importa o serviço de simulação N2-B.

## Integração atual

Em `NoPonto/app/index.tsx`, o resultado fica em `radar.previaNotificacao`:

- Parada aberta: usa `contextoDetalhe` e `consultaDetalhe`.
- Sem parada aberta: usa o contexto e a consulta de `useRadarParada`.
- Parada manual fora do contexto, consulta pausada/indisponível, ausência de
  resposta, chave de contexto divergente ou nenhum vínculo elegível: retorna `null`.
- Contexto válido sem candidatos: mantém a prévia com listas vazias e destaque nulo.

Os eventos, `recebidoEm` e `agora` são os mesmos de `useConsultaEventosParada`.
O adaptador cruza os vínculos consultados com `paradaDetalhadaRadar`, usando as
linhas efetivamente selecionadas. Assim, as linhas piloto e os sentidos extras
adicionados pelo catálogo de terminal não ampliam a seleção das notificações.
Os metadados de itinerário das linhas selecionadas têm precedência sobre o
catálogo de terminal na composição da entrada.

O ID do padrão operacional é obtido das estruturas realtime já carregadas ou do
itinerário existente, por linha/sentido/versão. Não é inferido dos eventos. Sem
metadado verificável, o vínculo não participa da prévia. Os DTOs de eventos são
encaminhados sem reconstrução ou alteração de identidade.

As evidências físicas já mescladas em `radarTerminalPresence` seguem para N1 sem
converter localização ou estimativa física em ETA. Elegibilidade temporal,
terminal, prioridade, ordenação e conteúdo continuam em `notificacoesRadar.ts`.
Erros de atualização não renovam `recebidoEm`: o cache só participa enquanto N1
o considerar válido.

## Pontos disponíveis para a próxima etapa

- `radar.previaNotificacao.contexto`: contexto efetivamente elegível.
- `.candidatos`: DTO original, instante previsto e ETA calculados por N1.
- `.conteudo`: destaque, prioridades, alternativas e chave de contexto.
- Entrada `linhasPrioritarias`: aceita IDs explícitos; a integração atual fornece
  `[]`, pois ainda não há seleção de prioridade para notificações na aplicação.
  Favoritas do mapa não são automaticamente tratadas como prioritárias.
- Entrada `politica`: encaminhada a N1 para configuração futura.

Uma etapa futura poderá consumir `.conteudo` e `compararConteudoNotificacao` de
N1. Esta etapa não guarda um resultado anterior, não decide envio e não conecta
o conteúdo real ao serviço N2-B. Nenhuma interface nova foi adicionada.

## Validação

Executado em `NoPonto`:

```powershell
node scripts/test-radar.cjs src/services/previaNotificacaoRadar.test.ts src/services/notificacoesRadar.test.ts src/hooks/useConsultaEventosParada.test.cjs
npx --no-install tsc --noEmit
```

Resultado: 29 testes direcionados passaram (9 do adaptador, 7 N1 e 13 da
consulta existente); TypeScript sem erros. Nenhum build/APK ou alteração em
`D:\npdev`, N1, N2-B, backend, ETA ou SignalR.
