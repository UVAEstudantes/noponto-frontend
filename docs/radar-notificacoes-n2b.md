# N2-B — uma notificação Android de simulação

## Estratégia e investigação

Versão inspecionada: `expo-notifications 55.0.27`, instalada no checkout principal.
Nenhum arquivo de `D:\npdev` foi alterado.

O serviço reutiliza o canal silencioso `radar-chegada-simulacao` e reserva o
identifier `noponto:radar:simulacao-local` para exibir e atualizar a mesma entrada.
Os dados continuam marcados como simulação, sem Radar real, backend ou push.

Caminho observado no código instalado, relativo a `NoPonto/node_modules/expo-notifications/`:

1. `src/scheduleNotificationAsync.ts` encaminha `request.identifier` ao nativo;
   só gera UUID quando o chamador não fornece identidade.
2. `android/src/main/java/expo/modules/notifications/notifications/scheduling/NotificationScheduler.kt`
   monta `NotificationRequest` com essa identidade.
3. `android/src/main/java/expo/modules/notifications/service/delegates/ExpoSchedulingDelegate.kt`
   entrega imediatamente os triggers `ChannelAwareTrigger`, sem gravar alarme futuro.
4. `android/src/main/java/expo/modules/notifications/service/delegates/ExpoPresentationDelegate.kt`
   chama `NotificationManagerCompat.notify(request.identifier, getNotifyId(request), notification)`;
   a implementação padrão de `getNotifyId` retorna `0`.
5. O contrato Android de `notify(tag, id, notification)` substitui a entrada já
   publicada com o mesmo par tag/ID para o aplicativo. Portanto, a estratégia
   escolhida é reenviar com identifier fixo, sem dismiss intermediário.
6. O encerramento usa `dismissNotificationAsync` apenas com a identidade reservada.
   O mesmo delegate Android cancela apenas o par correspondente. Nenhuma API de
   remoção global ou cancelamento global é usada.

Referências:
- [Expo SDK 55 — Notifications](https://docs.expo.dev/versions/v55.0.0/sdk/notifications/)
- [Android — NotificationManager.notify](https://developer.android.com/reference/android/app/NotificationManager#notify(java.lang.String,int,android.app.Notification))

Não foi necessário implementar o fallback de remover e reapresentar. A atualização
visual, eventual piscar, reposicionamento ou reaparecimento ainda precisam ser
observados no aparelho; esta etapa não executou build nem teste visual.

## Ordem e tratamento de erros

Uma fila de promessas no serviço serializa exibição, atualizações e encerramento.
As três apresentações usam o mesmo identifier. Uma revisão por operação, nos dados
de simulação, permite distinguir o conteúdo atual do que já estava na bandeja.

No Android instalado, a promessa de `scheduleNotificationAsync` confirma o
encaminhamento, mas `ExpoPresentationDelegate` ainda constrói/publica a notificação
em coroutine. Por isso, antes de avançar a fila, o serviço consulta
`getPresentedNotificationsAsync` até encontrar a revisão esperada. O encerramento
também confirma a ausência da identidade. São no máximo 50 consultas, com intervalo
de 100 ms, além da latência nativa. Leituras de outras entradas não as modificam.

O handler permanece silencioso e aceita apenas a identidade/revisão ativa da
simulação; revisões antigas e apresentações posteriores ao encerramento não são
autorizadas pelo handler. Permissão só é solicitada após ação do usuário e quando
`canAskAgain` permite. Encerrar não solicita permissão. Erros e falta de confirmação
retornam `erro` sem rejeitar a fila, permitindo nova tentativa.

Limitações:
- A fila vale para a instância JavaScript atual; não é um serviço persistente nem
  sincronização entre processos ou recargas do runtime.
- Timeout, falha nativa ou descarte manual durante a confirmação tornam o resultado
  indeterminado. Uma coroutine nativa já iniciada não pode ser interrompida pelo
  serviço JS; não há garantia de ordenação visual após falhas desse tipo.
- Atualizar após descarte manual ou após encerrar apresenta novamente a simulação.
- Notificações antigas da N2-A com UUID aleatório não são removidas automaticamente.
  Descarte-as manualmente antes de avaliar a entrada única da N2-B.
- Os testes automatizados usam um adaptador nativo simulado. Eles provam identidade,
  ordem das chamadas e isolamento, não o comportamento visual do Android/OEM.

## Roteiro manual no NoPonto Dev

Com um cliente de desenvolvimento já compatível, conecte o Metro conforme
[o guia Android](android-development-notificacoes.md). Em Configurações:

1. **Exibir: 838 chegando em 5 min** — autorize a permissão e confira a simulação.
2. **Atualizar: 855 chegando em 3 min** — confira o novo texto na mesma entrada.
3. **Atualizar novamente: 838 chegando em 2 min** — confira novamente texto e quantidade.
4. **Encerrar** — confira que só a simulação desaparece; outras notificações permanecem.
5. Repita a sequência e teste permissão negada; o aplicativo deve continuar utilizável.

Observe a bandeja com o app aberto. Verifique manualmente se permanece uma única
entrada, se há piscar/reaparecimento e se o encerramento é mantido. O canal não tem
som nem vibração. Os botões ficam desabilitados enquanto uma operação é confirmada.

## Validação direcionada

Em `NoPonto`:

```powershell
node --test src/services/notificacaoLocalTeste.test.cjs
npx --no-install tsc --noEmit
```

Sem alterações de configuração nativa, dependências, N1 ou ambiente de build.
Resultado desta etapa: 13 testes direcionados passaram; TypeScript concluiu sem
erros. A substituição visual e o encerramento no aparelho permanecem pendentes.
