# Radar de Espera — N3-D

Esta etapa refina a N3-C (550076c). As instruções anteriores sobre encerrar ao
editar preferências foram substituídas pelo comportamento descrito aqui.

## Seleção e atualização

`selecionarItensNotificacao` pertence à N1 e decide as três vagas separadamente
de `compararConteudoNotificacao`. A elegibilidade continua exigindo contexto,
padrão operacional/versão, consulta e evidência válidos, ETA disponível e janela.

1. Reserva o veículo elegível mais próximo, independentemente da prioridade.
2. Reserva o mais próximo de uma linha prioritária, se ainda não representado.
3. Preenche por horário previsto, favorecendo outra linha no empate de horário.
4. Ordena os escolhidos por horário e identidade; não repete evento nem veículo
   da mesma linha. Com apenas uma linha útil, permite vários veículos dela.
5. Informa quantas alternativas distintas ficaram fora das três vagas.

Antes: a montagem concatenava todas as prioridades antes das alternativas.
838 prioritária em 5, 6 e 7 min ocultava 884 em 1 min. Depois: aparecem 884 em
1 min e 838 em 5 e 6 min, com uma alternativa adicional. Duas chegadas iminentes
de linhas não prioritárias permanecem ao lado de uma prioridade posterior.
O destaque semântico da N1 continua disponível para consumidores anteriores;
a seleção das vagas não usa esse destaque como exclusão.

Pequenas oscilações e a contagem regressiva continuam usando a comparação N1,
sem republicar por tick. O último conteúdo efetivamente aceito é a referência.

## Sessão e seleção deliberada

Editar linhas, prioridades ou antecedência reconfigura a sessão já autorizada.
Prioridade/janela com o mesmo alvo e conteúdo elegível atualizam a entrada
existente. Troca de parada, sentido ou vínculos invalida a geração anterior e
remove a previsão anterior antes de enfileirar a nova. Atualizações em voo são
descartadas e a fila compartilha a infraestrutura N2-B sem alterar a simulação.

Em `app/index.tsx`, `paradaSelecionada` é a seleção explícita do Radar/folha de
parada. Abrir outra parada nessa seleção troca o acompanhamento. A sugestão
automática de `useRadarParada` não transfere o alvo: se mudar, o acompanhamento
pausa, remove a previsão e aguarda o retorno ao alvo ou nova seleção explícita.
Fechar a folha não seleciona por si só outra parada. Sem consulta daquele alvo,
não há novas requisições para mantê-lo: a sessão aguarda pausada.

As linhas escolhidas são conservadas em memória e cruzadas com as disponíveis
no novo contexto. Sem linhas/dados elegíveis, a sessão permanece configurada,
sem previsão antiga. Consulta pausada, saída do primeiro plano ou desmontagem
do consumidor pausam a sessão; o retorno válido retoma sem nova permissão.
Falha nativa limpa e pausa com ação Retomar; permissão revogada encerra.
Encerrar é explícito. Uma nova instância do aplicativo começa encerrada e limpa
uma eventual notificação órfã; não restaura acompanhamento de AsyncStorage.
Só prioridades e janela continuam persistidas, no formato já existente.

## Diagnóstico de veículo ausente

Em desenvolvimento, abrir **Editar/Configurar** no Radar de Espera para ler o
diagnóstico por veículo/evento. O painel tem rolagem limitada e não existe em
produção. Não há logs contínuos nem requisições adicionais.

- `incluido_na_notificacao`: ocupa uma das três vagas.
- `elegivel_fora_das_tres_vagas`: passou pela N1, ficou no resumo de alternativas.
- `eta_indisponivel`, `previsao_passada`, `fora_da_janela`: validade temporal.
- `consulta_vencida_ou_invalida`, `gps_vencido_ou_invalido`: frescor.
- `metadado_operacional_ausente`: falta metadado confiável do padrão.
- `parada_incompativel`, `sentido_incompativel`, `versao_incompativel`,
  `padrao_operacional_incompativel`, `linha_nao_selecionada`: contexto.
- `viagem_nao_confirmada`, `presenca_terminal_sem_previsao_operacional`:
  evidência física não autoriza anunciar chegada.
- `mapa_estimativa_fisica_sem_evento_da_parada`: “A caminho” pode mostrar a faixa
  GPS de `terminalRadarVehicles`, sem possuir evento/ETA do contrato da parada.
  Essa faixa não foi convertida em ETA de notificação.
- `mapa_sem_evento_da_parada_ETA_nao_comparavel`: veículo observado nos dados do
  mapa, sem evento correspondente; não se pode afirmar equivalência de previsão.
- `parada_visualizada_nao_e_alvo_do_acompanhamento`: navegação automática,
  sem transferência deliberada da sessão.

Foi reproduzida e corrigida a exclusão por preenchimento das vagas prioritárias.
Foi comprovado no código que a faixa GPS física e o ETA do evento são caminhos
distintos. Sem o snapshot do caso observado no aparelho, não é possível atribuir
uma causa única àquele veículo. Os demais filtros não foram relaxados.

## Terminal

A presença confiável `No terminal` é uma categoria separada de espera. Usa
`terminalRadarVehicles` e exige origem igual à parada acompanhada, padrão
compatível e GPS válido. Padrões/direções ambíguos não ganham direção inferida.
O resumo informa a quantidade; a área de edição mostra a linha e, quando
existente e coerente, o início de espera observado (`dwellSince`). Isso não é
horário oficial de entrada. Sem esse registro, não mostra permanência inventada.

Chegadas e saídas continuam dependendo de eventos elegíveis. A reconciliação
física da N1 agora distingue ARRIVAL de DEPARTURE: um evento explícito de saída
pode ser apresentado como saída para um veículo operacionalmente confirmado no
terminal, sem virar chegada. Viagem não confirmada continua bloqueada. Presença
sem evento nunca cria previsão de saída. Aproximação ao terminal só entra como
chegada prevista quando existe evento válido para aquela parada/sentido.

## Interface e Android

Cabeçalho compacto com estado, parada e quantidade de linhas; edição recolhida
por padrão. Chips em uma faixa horizontal, estrelas com alvo de toque mínimo de
44 px e rótulos de acessibilidade. Antecedência compacta de 2–15 min. Ações de
ativar/retomar e encerrar permanecem acessíveis com a edição recolhida. Reutiliza
os tokens de tema e ScrollView nativo; não adiciona modal nem biblioteca.

Título: `Radar de Espera`; parada em `subtitle`; corpo com até três previsões,
estrela nas prioridades, horário absoluto e resumo das alternativas/espera.
Identidades de eventos e veículos permanecem no payload. O horário absoluto
evita um “em 2 min” parado na bandeja. Não há som, vibração ou canal novo.

Na versão instalada, `ExpoNotificationBuilder.kt` chama `setSubText` e
`NotificationCompat.BigTextStyle().bigText(content.text)`. O corpo já pode ser
expandido pelo sistema. Não há API JS instalada para textos distintos entre
estado recolhido/expandido ou limite de linhas garantido por fabricante.
Truncamento, posição do subtítulo e expansão dependem do Android/aparelho.
Layouts customizados exigiriam trabalho nativo separado e não foram feitos.
Referência: [Expo Notifications SDK 55](https://docs.expo.dev/versions/v55.0.0/sdk/notifications/).

## Validação no NoPonto Dev

Validação automatizada: **153 testes direcionados passaram**, incluindo N1,
adaptador N3-A, prévia N3-B, sessão/hook/interface, infraestrutura/simulação N2-B
e regressões de apresentação/passenger/eventos/storage. TypeScript passou com
`npx --no-install tsc --noEmit`. Comando dos testes, na pasta `NoPonto`:

```powershell
node scripts/test-radar.cjs src/services/radarEspera.test.ts src/services/notificacoesRadar.test.ts src/services/previaNotificacaoRadar.test.ts src/hooks/useRadarEspera.test.cjs src/components/mapaComponents/radarEsperaSection.test.cjs src/services/notificacaoLocalTeste.test.cjs src/components/mapaComponents/previaNotificacaoRadarSection.test.cjs src/components/mapaComponents/radarConfiabilidade.test.cjs src/services/startup.test.cjs src/services/radarPassenger.test.ts src/services/apresentacaoRadar.test.ts src/services/eventosParada.test.ts
```

| Requisito | Teste de regressão exato |
| --- | --- |
| 884 em 2 min e duas 838 prioritárias | `884 em dois minutos permanece com 838 prioritaria em cinco e seis` |
| Três veículos prioritários e 884 iminente | `884 iminente permanece entre tres veiculos da 838 prioritaria` |
| Três linhas prioritárias e outra iminente | `tres linhas prioritarias preservam nao prioritaria em um minuto` |
| Prioridade ausente | `prioridade sem veiculo elegivel libera todas as vagas gerais` |
| Duas iminentes e prioridade posterior | `duas chegadas iminentes e prioridade posterior ocupam tres vagas` |
| Empate, diversidade e identidade | `mesmo ETA desempata identidade e diversidade sem duplicar veiculo` |
| Mesma linha como única opção | `somente uma linha util preserva seus tres veiculos distintos` |
| Eventos repetindo o mesmo veículo | `mesmo veiculo em eventos diferentes nao ocupa duas vagas` |
| Filtros, frescor, ETA e contexto | `diagnostico explica cada filtro sem modificar elegibilidade` |
| Mapa sem evento, metadado e corte | `diagnostico distingue mapa sem evento metadado ausente e corte de vagas` |
| Sessão após edição e notificação única | `mudar prioridade e janela mantem notificacao unica com ultima selecao` |
| Prioridade em voo | `edicao durante envio invalida revisao anterior sem nova permissao` |
| Trocas rápidas e resultado atrasado | `troca rapida de parada invalida envio antigo e publica somente ultimo contexto` |
| Relógio/oscilação versus alteração relevante | `comparacao ignora relogio e pequena oscilacao mas publica mudanca relevante` |
| Pausa/retorno ao primeiro plano | `hook limpa no background pausa e retoma somente com consulta ativa` |
| Navegação versus seleção explícita | `navegar mapa pausa alvo e selecao deliberada troca parada sem nova ativacao` |
| Permissão perdida | `revogacao de permissao encerra e nao republica automaticamente` |
| Preferências sem restaurar sessão | `hook restaura preferencias sem restaurar sessao e limpa entrada anterior` |
| Espera, origem, sentido, idade e permanência | `terminal apresenta espera observada sem misturar origem sentido idade ou ETA` |
| Saída prevista de veículo operacionalmente confirmado não vira chegada | `terminal confirmado separa saida prevista de chegada e presenca` |
| Aproximação com evento e saída prevista | `saida prevista e chegada ao terminal preservam categorias de eventos distintos` |
| Conteúdo compacto e payload | `conteudo compacto identifica parada veiculos e alternativas sem repetir marca` |
| Tema, toque, rolagem e diagnóstico só DEV | `controles de espera expandem selecionam priorizam configuram e encerram` |
| Simulação isolada | `Radar real e simulacao coexistem e encerramento nao modifica outra identidade` |

Na pasta `NoPonto`, com o development build já instalado:

```powershell
$env:APP_VARIANT = 'development'
pnpm exec expo start --dev-client --tunnel
```

1. Selecionar linhas/parada no Radar. Conferir cabeçalho compacto em ambos os
   temas, expandir Editar/Configurar e percorrer os chips com TalkBack.
2. Ativar. Priorizar uma linha posterior e verificar que o veículo mais próximo
   continua visível. Verificar dois veículos da mesma linha e resumo adicional.
3. Editar prioridades, linhas e janela com a sessão ativa: não deve pedir nova
   ativação ou criar outra identidade de notificação.
4. Selecionar rapidamente duas outras paradas. A primeira não pode reaparecer
   após a segunda; sem dados válidos, deve aguardar sem previsão antiga.
5. Apenas mover o mapa/mudar sugestão automática: não transferir o alvo. Voltar
   à parada original ou selecioná-la explicitamente para retomar.
6. Reproduzir “A caminho” ausente e anotar veículo/evento e motivo DEV. Distinguir
   faixa física GPS de previsão do evento antes de concluir que há divergência.
7. Em terminal, conferir espera física separada de chegada/saída prevista,
   ausência de ETA inventado e início observado apenas quando disponível.
8. Sair do primeiro plano e voltar: limpar/retomar com dados válidos. Encerrar e
   verificar remoção só da entrada real. Testar simulação N2-B simultaneamente.
9. Reiniciar o aplicativo: preferências voltam; sessão ativa não. Revogar
   permissão e provocar mudança relevante para conferir encerramento controlado.

N3-C foi validada em aparelho pelo usuário; a apresentação/refinamentos N3-D
ainda precisam dessa validação visual. Não há funcionamento garantido com app
fechado/bloqueado. Encerramento abrupto do processo pode impedir a limpeza JS;
o próximo início tenta remover a entrada órfã. Sem polling, backend, push,
serviço permanente, dependências novas, build/APK ou alterações em D:\npdev.
