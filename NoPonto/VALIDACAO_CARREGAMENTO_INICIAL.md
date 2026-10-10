# Carregamento inicial, percursos V2 e estado do Radar

Implementação e testes preparados em 2026-10-10. Nenhum build, teste, lint,
deploy ou comando Git foi executado. A confirmação dos bugs depende do aplicativo.

## Causas identificadas no código anterior

- `mapOSM.tsx` recalculava `latInicial/lngInicial` quando o primeiro GPS chegava.
  Isso mudava `mapHTML/source`, recarregando o documento. `mapReady` permanecia
  true; um segundo `map_ready` executava `setMapReady(true)`, sem mudança de estado.
  Se a assinatura das linhas não mudasse, o efeito estrutural não reenviava as
  geometrias para o novo documento. Os scripts reinicializam suas fontes no load.
- `index.tsx` salvava o modal default no efeito inicial antes de concluir
  `carregarModalSelecionado()`. As linhas já tinham guarda de hidratação; o modal não.
- `CacheEstruturalPorVersao` mantinha a Promise mesmo após resolver null/rejeitar.
  O endpoint de itinerário convertia falhas para null; sentidos e padrões
  convertiam falhas HTTP/rede para []. O hook aceitava estruturas parciais e não
  oferecia estado por linha nem recuperação automática de falhas. Na tela Linhas,
  a seleção só disparava uma tentativa, sem retry apresentado ao usuário.

## Correções

- Âncora HTML imutável por montagem, source memoizado, GPS via updateUser.
  onLoadStart suspende envios; cada map_ready incrementa uma geração, provocando
  reenvio estrutural, de veículos e de localização, mesmo se ready já estiver true.
- Persistência do modal somente após hidratação. Leitura tardia não sobrescreve
  uma escolha já feita pelo usuário. Preferências das linhas não são modificadas.
- Cache mantém apenas sucesso ou pedido pendente; null/rejeição é removido.
  HTTP/rede não vira lista vazia de sentidos/padrões. Estrutura incompleta falha
  sem publicar um subconjunto como itinerário completo. Não seleciona padrões.
- Estados por UUID: carregando, pronto, indisponivel (sem padrões publicados), erro.
  Requests em andamento são compartilhados; refs não são sobrescritas por um
  efeito atrasado. Falhas têm retry manual, ao retornar ao foreground/foco e
  a cada 30 s no foreground. Esse intervalo é recuperação de falhas, não espera
  pela inicialização. Configurações salvas são mantidas; estado informativo no mapa.
- Tela Linhas carrega pela linha/modal/foco atuais. Respostas alimentam apenas
  o cache do UUID correspondente; não alteram sentido/versão de outra escolha.
  Retry aparece junto ao seletor quando há erro; ausência legítima é diferenciada.

## Radar

Estado: aberto / manual / automatico. Duas observações concluídas distintas
sem eventos válidos recolhem automaticamente; duas com eventos abrem novamente.
Isso pode adiar a transição por um ciclo do polling já existente (30 s).
Re-renders/contagem regressiva com a mesma amostra não incrementam contadores.
Mudança de contexto reinicia contadores; loading/erro não são amostras vazias.
O filtro existente continua eliminando ETA vencido antes da avaliação.

Recolhimento manual nunca abre sozinho. Abrir pela aba protege o painel vazio
enquanto o usuário consulta/troca parada; a proteção termina quando há eventos.
A aba permanece disponível. Não troca a parada por ausência de eventos nem
modifica ETA, cadência de polling, sentidos, padrões ou seleção manual de parada.

## Comandos PowerShell, na raiz do workspace

```powershell
Set-Location .\NoPonto
node --test src/services/carregamentoInicial.test.cjs
npm run start:local
```

O teste usa TypeScript já instalado e HTTP simulado: cache de falhas, deduplicação,
HTTP versus vazio, máquina de estados, ETA vencido e efeitos do wrapper WebView
com estruturas antes/depois de ready, GPS tardio e reenvio após reload/ready repetido.
O harness de efeitos não substitui React Native/MapLibre/SignalR reais.

## Validação no aplicativo

1. Salvar Ônibus, BRT e Santa Cruz com cores, ativa/inativa, sentido e marcadores
   distintos. Encerrar completamente o app e reabrir no modal salvo. Verificar
   geometrias sem alternar modal, veículos quando disponíveis e preferências intactas.
2. Atrasar GPS/permissão. Repetir com GPS negado. Atrasar API com WebView pronta;
   depois atrasar WebView com itinerários prontos. Conferir reenvios ao receber ready.
3. Recarregar a WebView já com linhas carregadas. Verificar geometria, paradas,
   localização e veículos no novo documento, sem remount artificial por GPS.
4. Abrir offline com linhas salvas. Conferir estados e configuração preservada.
   Restaurar conexão sem trocar modal: retry manual/foreground ou recuperação
   em até um ciclo de 30 s. Repetir em Ônibus/BRT e Trem (sem alterar runtime ferroviário).
5. Tela Linhas: selecionar Ônibus, SV866 e Santa Cruz. Conferir loading, todas
   as opções publicadas, sentido/versão correspondentes e múltiplos padrões.
   Simular 500/erro de rede, recuperar e usar retry sem alternar modal.
6. Atrasar resposta de A; selecionar B e concluir A após B. Fazer o mesmo entre
   modais. A nunca deve substituir as opções/seleção de B. Repetir retorno de foco.
7. Resposta V2 200 com []: ausência legítima. Falha/incompleta: erro e retry,
   sem cache permanente de falha. Em cenário sem linhas selecionadas não há
   mensagem de carregamento permanente após concluir a hidratação.
8. Radar: duas respostas vazias válidas → aba; duas positivas → abertura.
   Alternar zero/um a cada resposta → não oscilar a cada polling. Loading/erro
   não deve recolher. Expirar ETA e confirmar que não conta como evento válido.
9. Recolher manualmente e receber eventos → manter aba. Abrir vazio pela aba,
   interagir com Trocar parada/Ver todos e aguardar respostas vazias → continuar
   acessível. Escolha manual de parada permanece; troca não mistura contadores.
10. Nos dois temas e lateralidades, conferir os controles acima do Radar aberto
    e posição normal recolhida. Conferir busca, tarifas e pagamentos como regressão,
    pois não foram modificados neste patch.

## Limitações e riscos a validar

- Sem execução em dispositivo, não há confirmação de reprodução/correção dos bugs.
- Uma versão publicada sem geometria LineString válida impede a publicação parcial
  da linha e aparece como falha recuperável; investigar dados reais nesse cenário.
- O endpoint 200 com lista vazia é considerado ausência legítima, sem retry periódico.
- Reconexão ferroviária permanece no runtime existente; testar offline/reabertura
  de Santa Cruz. Reconexão de WebView e inscrições SignalR exigem ambiente nativo.
- O modo manual do painel dura a montagem atual, como no comportamento anterior;
  não foi adicionada persistência dessa preferência.
