# N3-C — Radar de Espera local Android

## Uso e decisões

No painel existente do Radar, expanda **Radar de Espera**. Escolha as linhas a
acompanhar dentre as selecionadas no mapa que atendem à parada, marque uma ou mais
como prioritárias e ajuste a antecedência entre 2 e 15 minutos (padrão 10).
**Ativar acompanhamento** solicita permissão após essa interação. **Encerrar**
remove apenas a notificação do acompanhamento.

Estados: ativo, pausado, sem previsões e encerrado. Alterar as linhas, prioridades,
janela, parada, sentido ou padrões encerra/invalida a sessão; é necessário ativar
novamente. Na pausa de primeiro plano/consulta, a sessão fica apenas em memória,
sem previsão na bandeja, e pode retomar quando o mesmo contexto voltar a ter uma
consulta ativa. Falha nativa exige **Retomar**; não é repetida a cada tick.

Preferências de prioridades e janela são gravadas por `storage.ts`, no AsyncStorage
existente, em `@radarEsperaPreferencias`. Uma whitelist impede persistir sessão,
parada, estado ativo, conteúdo ou linhas acompanhadas. Na próxima inicialização,
as preferências voltam, a sessão continua encerrada e a entrada real anterior é
limpa. O conjunto de linhas acompanhadas é uma seleção apenas da sessão.

## Integração

- `useRadarEspera` deriva entradas do mesmo snapshot usado pela prévia N3-A,
  filtra as linhas escolhidas e passa prioridades e janela ao adaptador existente.
- `radarEspera.ts` contém o controlador com porta injetada. Mantém a última
  publicação aceita como referência de `compararConteudoNotificacao` da N1.
  Não há relógio próprio, nova consulta, polling HTTP ou conexão SignalR.
- `notificacaoLocalCanal.ts` extrai a infraestrutura N2-B: handler único com
  registro por identidade, canal silencioso, fila, permissão, revisão e confirmação
  nativa limitada. Não usa remoção/cancelamento global.
- `notificacaoLocalTeste.ts` continua com a mesma API, identidade, conteúdo e
  dados de simulação. O acompanhamento usa outra identidade,
  `noponto:radar:acompanhamento-local`, no canal silencioso `radar-chegada-local`.
- Uma única sessão é mantida por runtime. Atualizações em voo são invalidadas
  por geração ao encerrar, pausar ou trocar contexto. A fila nativa evita
  duplicação e operações fora de ordem no caminho normal.
- A notificação mostra primeiro o destaque N1 e até duas outras entradas,
  incluindo veículos/eventos distintos. Mostra **horário absoluto previsto**;
  isso evita manter um texto relativo como “em 5 minutos” enquanto a N1 ignora
  a passagem normal do relógio. Chegada e saída permanecem previsões.
- A UI usa o tema existente, sem nova tela. A seleção de sessão e a porta de
  entrega são separadas para permitir uma futura implementação remota.

## Limites explícitos

Somente Android com cliente nativo compatível, app em primeiro plano e consulta
do Radar ativa. Sem FCM, push, background fetch, serviço permanente ou persistência
de sessão. AppState pausa e invalida imediatamente o envio, solicita a remoção
individual e não faz novas apresentações enquanto estiver inativo.

Fechamento forçado, falha do SO ou interrupção abrupta do processo podem impedir
a execução da limpeza JS/nativa. Não há garantia de remoção nesses casos nem
funcionamento com tela bloqueada/app fechado. A próxima abertura tenta limpar a
entrada real anterior. A independência do app depende de uma etapa futura com
backend/push. Falha ou timeout nativo é exibido, sem alegar confirmação visual.

Permissão do Android e configurações do canal podem impedir apresentação. A
confirmação de `getPresentedNotificationsAsync` não equivale a verificar o layout
no aparelho. O handler não interfere na identidade de simulação; os testes de
coexistência verificam ambas as ordens de encerramento.

## Validação e roteiro no NoPonto Dev

Não foi gerado APK nem modificada a worktree `D:\npdev`. No checkout principal,
em `NoPonto`, use o cliente Dev já instalado:

```powershell
$env:APP_VARIANT = 'development'
pnpm exec expo start --dev-client --tunnel
```

1. Selecione linhas e sentido no mapa, encontre uma parada e expanda Radar de Espera.
2. Marque duas linhas, priorize a que chega depois, configure 10 min e ative.
   Autorize o Android. Confira uma única entrada com destaque e alternativas.
3. Priorize duas linhas e reative. Com dois veículos de uma linha, confira as
   identidades distintas. Faça também o teste com janela 2 min e 15 min.
4. Aguarde atualizações reais: contagem regressiva/oscilações pequenas não devem
   republicar. Mudanças relevantes e entrada/saída de candidatos atualizam a entrada.
5. Troque parada, sentido ou linhas: a entrada anterior deve ser removida e o
   acompanhamento ficar encerrado. Sem dados confiáveis, nenhuma previsão antiga
   deve permanecer como atual.
6. Saia para outro app/bloqueie a tela: confira a pausa e remoção no caminho normal.
   Volte ao mesmo contexto; só deve retomar com a consulta ativa. Não espere alertas
   independentes do aplicativo.
7. Encerre e reabra o app: prioridades/janela devem voltar, sessão ativa não.
   Teste recusa/revogação de permissão e confira a mensagem sem quebrar o app.
8. Gere a simulação N2-B nas Configurações. Ative/encerre o Radar real: a simulação
   deve permanecer. Encerre a simulação e confira que a real não foi removida.

Testes direcionados: controlador N3-C, hook/lifecycle, armazenamento e UI; núcleo
N1 e adaptador N3-A; infraestrutura N2-B com coexistência e corridas nativas;
regressões do painel e do armazenamento de abertura. TypeScript com `--noEmit`.
A validação visual/funcional da N3-C em aparelho continua pendente.
Resultado: 92 testes direcionados distintos passaram; TypeScript sem erros.

Arquivos principais: `app/index.tsx`, `radarParada.tsx`, `radarEsperaSection.tsx`,
`useRadarEspera.ts`, `radarEspera.ts`, `preferenciasRadarEspera.ts`, `storage.ts`,
`notificacaoLocalCanal.ts`, `notificacaoRadarLocal.ts` e o adaptador preservado
`notificacaoLocalTeste.ts`. Os testes correspondentes e os mocks de regressão do
painel/startup acompanham essas alterações.
