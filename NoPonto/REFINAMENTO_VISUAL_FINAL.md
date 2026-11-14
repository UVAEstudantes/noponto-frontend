# Refinamento visual final — 14/11/2026

## Seletor: investigação e correção
Comparado `HEAD:NoPonto/src/components/mapaComponents/linhasContainer.tsx` com o workspace. A referência usava estilo em objeto e largura numérica, enquanto a versão regressiva colocava largura percentual, fundo selecionado e geometria dentro de um callback de `Pressable.style`. O projeto aplica interop NativeWind a Pressable. Os sintomas Android indicam que essa geometria não estava sendo aplicada: faixa pai inteira, conteúdo sem distribuição e fundos ausentes. O mesmo padrão aparecia no botão das linhas e no botão destrutivo. Não houve execução do renderer Android nesta rodada; a confirmação causal no aparelho permanece pendente.

Removidos callbacks de estilo desses controles. O seletor usa estilos estáticos, linhas explícitas e segmentos com flex1/flexBasis0/minWidth0. Ícones21px acima dos rótulos12sp, toque mínimo64dp, fundo amarelo inequívoco na seleção. Sem percentuais, ScrollView, slider absoluto ou clipping. Fonte acima de1.25 ou faixa com menos de50dp por opção usa duas linhas equilibradas. Favoritos continua fora do grupo, dourado e com seleção mutuamente exclusiva; lógica de seleção existente preservada.

Testes estruturais calculam espaço útil em320/360/400dp e verificam estilos estáticos/flex e fallback2+2 para fonte ampliada. Não são prova de pixels renderizados; precisam ser conferidos no celular, em ambos os temas.

## Parada
Botão36dp, circular e com hitSlop6dp, igual ao sino existente; fundo suave de tema, ícone centralizado e ripple. Modal independente mantido, altura máxima derivada da tela/SafeArea e limitada a560dp. Cabeçalho fixo, ScrollView com flexShrink1/minHeight0 e24dp de espaço inferior. Itens sem grandes blocos cinza, com chip de código e separadores finos; nome até duas linhas. Linhas agrupadas por ID, sentidos distintos preservados sem repetição por caixa/espaços; sentido igual ao nome não é reapresentado. Contador corresponde a linhas únicas. Nenhuma cor de linha inventada. Estados e requisições existentes preservados.

## Confirmação
Lógica anterior preservada. Superfície destrutiva estática vermelha #B42332, texto branco; Cancelar neutro com borda. Altura48dp. Ações lado a lado a partir de360dp e fonte até1.25; caso contrário empilhadas. Card/ícone/intervalos mais compactos, fade/Back/trava de duplo toque preservados. Novo teste verifica superfície real em objeto para impedir repetir a regressão do callback de estilo.

## Rotinas
Estrutura e demonstração local preservadas. Superfícies fundoCard do tema, percurso vertical com origem/linha/destino, ícones de calendário/horário/voz, modais compactos e ação Editar com ícone. Formulário usa labels hierárquicas e fundoInput. Dias distribuídos em4+3 centralizados nas larguras comuns e com fonte ampliada, ou sete quando há espaço suficiente; nenhum domingo isolado. Voz com texto flexível. Sem motor de rota, persistência remota ou notificações reais.

## Arquivos desta rodada
- src/components/mapaComponents/linhasContainer.tsx e filtrosMapa.test.cjs
- src/components/mapaComponents/linhasDaParada.tsx e linhasDaParada.test.cjs
- src/components/Confirmacao.tsx e Confirmacao.test.cjs
- app/favoritos.tsx e src/components/rotinas.test.cjs
- HISTORICO.md e este relatório

Todos os caminhos acima são relativos a NoPonto/ no frontend. Backend não alterado nesta rodada. Demais diffs preexistentes preservados.

## Validação
10testes focados aprovados,0falhas/ignorados: seleção/Favoritos, dimensões320/360/400, fonte ampliada, cancelar/Back, confirmar/repetir/última linha, botão destrutivo, criar/validar/editar/excluir Rotinas, distribuição dos dias e agrupamento/contador de6linhas com sentidos duplicados. TypeScript sem erros e git diff --check aprovado. Testes usam harness React/AST e não renderizam Yoga/SystemUI. Uma tentativa inicial do teste de agrupamento usou target antigo do transpiler e não iterava Map; corrigido o target do teste para ES2022 e executado novamente com sucesso.

Comandos em NoPonto/:
node scripts/test-radar.cjs src/components/mapaComponents/filtrosMapa.test.cjs src/components/Confirmacao.test.cjs src/components/rotinas.test.cjs src/components/mapaComponents/linhasDaParada.test.cjs
node node_modules/typescript/bin/tsc --noEmit
git diff --check

Não executados backend, build Android, Metro, deploy, carga ou testes físicos. Sem preview ativo nas portas8081/8082/19006 verificadas. Não declaramos homologação visual. ESLint não executado nesta rodada; a rodada anterior registrou travamento do processo.

## Conferência Android
1.320/360/400dp, claro/escuro, fonte padrão/ampliada: nenhum segmento comprimido, quatro opções legíveis, destaque ativo e estrela independente. Alternar todos os filtros e voltar de Favoritos.
2.Parada com cinco ou mais linhas: botões da mesma família, contador correto, sentidos sem duplicação, último item inteiro após scroll; header fixo e Back/fechamento sem mudar a sheet.
3.Diálogo nos dois fluxos de remoção: botão vermelho com superfície, Cancelar neutro, fonte ampliada empilha; cancelar mantém card/mapa, múltiplos toques removem uma vez.
4.Rotinas: criar/editar/ativar/excluir, dias4+3, voz e teclado; conferir percurso, temas e barra inferior. Explicação continua distinguindo demonstração de recursos futuros.

## Git
Branch feat/otimizacoes-beta mantida, sem commits/push/deploy ou novas branches/worktrees/clones. Workspace continua com mudanças locais desta e das rodadas anteriores. Nenhum backend, endpoint, Radar, SignalR, localização, cache ou heads-up modificado nesta rodada.


# Evolução: mobilidade assistida e seletor animado

## Implementação desta continuação
- `linhasContainer.tsx`: grupo normal48dp com preenchimento (antes72dp), toque44dp; ativo expande para ícone+rótulo, inativos44dp apenas ícone. Indicador e larguras animados por Reanimated180ms; neutro em Favoritos com fade120ms. Sem callbacks de Pressable.style. Fallback de fonte/largura em duas colunas, uma coluna acima de fontScale1.8; altura aumenta somente nesse modo de acessibilidade. Toques rápidos atualizam o mesmo estado funcional e redirecionam as animações correntes.
- `linhasDaParada.tsx` / `paradaSheet.tsx`: família de ações40dp com hitSlop, ícone de lista reconhecível e linhas com espaçamento11dp. Fade nativo do painel preservado e desligado por movimento reduzido. Rede/contrato/agrupamento/scroll permanecem existentes.
- `app/favoritos.tsx`: tela com composição de trechos, cards com Configurar/Ver prévia, feedback local e transições leves de layout. Formulário único com quatro seções, inversão de locais, prévia do rascunho, dias4+3/7, recorrência semanal explícita e preferências agrupadas de avisos/voz/alternativas. Salvar fica fora do scroll em KeyboardAvoidingView+SafeArea.
- Seletor de horário leve: duas listas roláveis de24horas e60minutos, selecionados visualmente, botão Usar HH:MM. Rascunho de horário só aplicado ao confirmar; fechar/Back preserva o anterior. `rotinasDemo.ts` valida inteiros0..23/0..59 e formata com zero à esquerda. Não encontrado date/time picker instalado; não adicionada biblioteca.
- Prévia: timeline esquemática com caminhada/transporte/integração/destino, sem geometria no mapa real; estados Ainda não iniciada/Aguardando embarque/Em deslocamento/Próxima descida/Integração/Concluída. Exemplo de atraso e Ver alternativa substituem apenas um trecho ilustrativo; sem nomes de linhas reais ou alegação de cálculo válido.
- Explicação: seis blocos sobre planejamento, preparação antes de sair, acompanhamento por trechos, problemas com dados confiáveis, alternativas futuras e voz. Cada painel reforça que não existe monitoramento/agenda/notificação real.
- Movimento: seletor no runtime Reanimated com ReduceMotion.System; cards/dias usam transições curtas; explicação/prévia/horário usam fade nativo e formulário slide, desabilitados com preferência de movimento reduzido. Switches mantêm animação nativa. Diálogo de confirmação aprovado não alterado.

## Testes e limites
16testes focados aprovados (zero falhas/ignorados) via scripts/test-radar.cjs: filtrosMapa,rotinas,rotinasDemo,linhasDaParada e Confirmacao. Cobrem seleção/Favoritos,larguras e indicador,fonte ampliada,horários limítrofes/impossíveis/cancelamento,CRUD local,ativação,inversão,estados e alternativa,agrupamento e confirmação. TypeScript e git diff --check aprovados. Testes de React/AST não renderizam pixels nem executam animações na UI thread; não são homologação visual.

Nenhum preview local encontrado nas portas8081/8082/19006; não iniciado Metro ou buildAndroid. Ainda conferir no aparelho:3/4opções em320/360/400dp,rápidas trocas/Favoritos,fonte grande,temas,alinhamento dos botões,5+linhas/último item,formulário+teclado,horário,abertura da prévia sobre formulário,estados/alternativa e movimento reduzido. Não houve medição de quadros ou teste físico.

Arquivos de testes atualizados:src/components/mapaComponents/filtrosMapa.test.cjs,src/components/rotinas.test.cjs;novo src/services/rotinasDemo.test.ts. Novo modelo de demonstração:src/services/rotinasDemo.ts. Histórico atualizado por acréscimo.

Branch feat/otimizacoes-beta mantida,alterações anteriores preservadas,sem commits/push/merge/deploy/clones/worktrees. Backend,contratos,ngrok/zrok,SignalR,Radar,GPS e cache não modificados. O arquivo solto citado pelo usuário já não estava presente na inspeção do diretório/status; nenhum arquivo removido ou incorporado.


# Sprint UX — Perfil, Rotinas e diagnóstico Worklets — 14/11/2026

## Bugs e evidência do aparelho

ADB autorizado pelo usuário, utilizando exclusivamente o aplicativo instalado e o Metro preexistente na porta 8084. Não houve instalação, limpeza de dados, build Android ou reinício do Metro. O Metro permanece ativo.

O erro foi reproduzido no aparelho: `[Worklets] Tried to synchronously call a non-worklet function t9 on the UI thread`. O log não incluiu frames completos. A inspeção somente de leitura do bundle JavaScript já carregado pelo Dev Client permitiu identificar a função: no `SelectModalLinhas`, o React Compiler extraiu `t8 = useAnimatedStyle` e `t9 = () => ...`, passando `t9` ao hook sem `__workletHash`/transformação de worklet. O callback do indicador executava withTiming na UI thread como função JS comum. A única chamada de hook com callback t9 encontrada no bundle correspondia a esse indicador. Isso explica tanto o erro quanto a superfície amarela ausente. Não foi deduzido apenas pelo local do toque.

A correção localizada usa Animated do React Native no seletor, como a referência `selectTransporte.tsx` da tela de Linhas. Nenhuma configuração de compilador ou biblioteca foi alterada. Larguras e indicador animam por 180ms na JS thread, sem callbacks enviados a worklets; interrupção/redirecionamento ao trocar rapidamente. Preferência de movimento reduzido desliga a animação. O estado de seleção continua sendo o estado funcional existente. No ciclo físico de alternância Ônibus/BRT/Trem/Favoritos foram encontrados zero novos erros Worklets/TypeError/ReferenceError/texto fora de Text na janela de log observada. Isso não comprova todas as animações de todos os fluxos do aplicativo.

Corrigido também o aviso `Text strings must be rendered within a Text component`: um comentário do card em linhasContainer estava como texto JSX, sem chaves. Regressão coberta por teste localizado.

O teste físico de teclado revelou que o Modal edge-to-edge encobria o rodapé. O painel comum agora usa a posição superior do teclado Android para limitar a área útil, com ScrollView apenas no conteúdo e ações fora dele; no iOS mantém KeyboardAvoidingView. Confirmado no aparelho: Salvar rotina e Salvar perfil/Cancelar permanecem visíveis com teclado aberto. O comportamento iOS não foi testado fisicamente.

## Design e comportamento

- **Seletor:** 48dp de superfície normal e segmentos com toque44dp; ativo ícone+nome sobre amarelo #FFC107, inativos ícone21dp. Estrela separada dourada; Favoritos neutraliza o grupo. Mantidos fallback de duas colunas para fonte/largura reduzida e uma coluna para fonte muito ampliada. Testes estruturais 320/360/400dp, três/quatro opções; aparelho com aproximadamente393dp e três opções disponíveis no contexto. Não alteradas resolução, densidade ou fonte do celular.
- **Parada:** botão circular40dp menta/verde, ícone Route22dp, label “Ver linhas que passam nesta parada”. Alinhado ao sino e fechar. Ícone decorativo inicial oculto abaixo de360dp para liberar espaço para o nome. Cabeçalho do painel mais curto: nome + contador de linhas únicas. Código neutro, nome15sp, sentidos14sp com rótulo; modal só quando há mais de um no conjunto. Nenhuma cor/destino inventado. Header fixo, scroll interno, padding inferior36dp. No aparelho, consulta real retornou oito linhas e foi possível alcançar o último item inteiro, com espaço abaixo.
- **Rede da parada:** abertura vinculada ao ID, evitando iniciar consulta para outro ID durante a troca. Abort/ignorância de resposta obsoleta, cache durante a montagem, erro/retry/vazio preservados; rejeição inesperada da Promise agora vira estado de erro. Mesmo GET /paradas/{id}/linhas, sem backend ou novo contrato.
- **Rotinas:** introdução esquemática compacta, cards mais leves sem duplicar o desenho do percurso, título/status/configuração e ação Ver percurso. Estado vazio com criação. Formulário com trajeto conectado e inversão lateral, dias/horário, assistência agrupada e revisão. Salvar fixo, validação e feedback locais. Horário personalizado com HH:MM em destaque e duas linhas compactas Hora/Minuto com −/+, limites0–23/0–59; cancelar/Back não altera o horário anterior. Nenhum picker Android padrão.
- **Percurso:** esquema sem mapa geográfico falso; cinco etapas, detalhes expansíveis ao toque, controle anterior/próximo com seis estados demonstrativos, aviso e alternativa explicitamente ilustrativos. Quando aberto do formulário, troca o conteúdo do mesmo Modal e retorna ao rascunho. Explicação em timeline de seis seções: planejar, preparar, acompanhar, orientar/voz, problemas confiáveis e alternativas futuras. Sem motor, agenda, localização, notificações ou monitoramento reais.
- **Perfil:** avatar com iniciais do primeiro/último nome, nome opcional, padrão NP/Seu perfil, paleta de cinco cores escuras com texto branco. Edição customizada com prévia ao digitar. Somente nome e cor são persistidos em AsyncStorage na chave @noponto/perfil-local-v1. Validação no storage, trava de confirmação concorrente e publicação somente após gravar; cancelamento/falha preservam dados. Nenhuma conta ou chamada de rede do perfil.
- **Conteúdo pessoal:** favoritos reais pelo useFavoritos, estado vazio/erro/loading e acesso seguro à rota Linhas existente, sem inventar favoritas ou deep links por linha. Seção separada e sinalizada de demonstração: seis indicadores, ranking, atividade semanal/modais, conquistas bloqueadas/desbloqueadas no exemplo, retrospectiva e Comunidade. Nenhum compartilhamento/publicação real; relatos não são tratados como fatos confirmados.
- **Navegação:** Perfil | Rotinas | Mapa | Linhas | Mais. Curva preservada, Mapa amarelo fixo no centro; seleção das outras abas por ícone/texto/traço amarelo. Substituída a esfera móvel por posição central estável para acomodar cinco destinos. TutorialTarget de Linhas mantido. Rota /favoritos permanece sendo Rotinas, sem rota duplicada; /perfil acrescentada ao Expo Router. Ícone de usuário na navbar, iniciais somente no avatar.
- **Movimento:** fade nativo do painel comum com movimento reduzido; animação localizada de180ms do seletor e ripples de toque. Sem novos worklets em Rotinas/Perfil/navbar. Não alterado o diálogo Confirmacao aprovado.

## Organização e arquivos

Caminhos relativos a NoPonto/:

| Arquivo | Responsabilidade |
|---|---|
| app/favoritos.tsx | Reexporta Rotinas, preserva rota legada |
| app/perfil.tsx; app/_layout.tsx | Rota Perfil e registro |
| src/components/NavBar.tsx | Cinco posições, Mapa central e curva |
| src/components/demo/InterfaceDemo.tsx | Botões/campo/painel comuns, tema/contraste, movimento reduzido e teclado |
| src/features/rotinas/RotinasTela.tsx | Estado e navegação local entre os painéis |
| src/features/rotinas/FormularioRotina.tsx | Configuração, dias e seletor de horário |
| src/features/rotinas/PercursoRotina.tsx | Esquema, prévia expansível e explicação |
| src/services/rotinasDemo.ts | Tipos, mocks isolados, validação/atualização imutável e etapas |
| src/features/perfil/perfilLocal.ts | Modelo, paleta, iniciais, validação e persistência mínima |
| src/features/perfil/PerfilTela.tsx | Tela, edição e interação local |
| src/features/perfil/ConteudoPerfil.tsx | Avatar, indicadores, favoritos e vitrines demonstrativas |
| src/components/mapaComponents/linhasContainer.tsx | Seletor e comentário JSX corrigido |
| src/components/mapaComponents/linhasDaParada.tsx; paradaSheet.tsx | Ações de cabeçalho, painel e responsividade |
| scripts/interface-test-harness.cjs | Harness de hooks/eventos para testes focados |
| HISTORICO.md; REFINAMENTO_VISUAL_FINAL.md | Registros por acréscimo |

Testes criados/atualizados: src/components/rotinas.test.cjs, src/services/rotinasDemo.test.ts, src/features/perfil/perfilLocal.test.ts, src/features/perfil/PerfilTela.test.cjs, src/components/NavBar.test.cjs, src/components/demo/InterfaceDemo.test.cjs, src/components/mapaComponents/filtrosMapa.test.cjs e linhasDaParada.test.cjs. src/services/favoritosEtapaB.test.cjs recebeu somente atualização de fixture: enum Disconnected e gateway isolado; não houve mudança no serviço SignalR/GPS. Confirmacao.test.cjs e favoritos.test.cjs reutilizados sem alterar o componente aprovado.

## Validação e cobertura

50 testes aprovados, zero falhas/ignorados; TypeScript sem erros e git diff --check aprovado. ESLint focado não concluiu em40s, processo de lint encerrado pelo limite; Metro não foi interrompido. Formatação dos componentes novos/extraídos com Prettier local sem alterar configuração/dependências.

| Requisito | Evidência de teste |
|---|---|
| Seleção e Favoritos exclusivos | “Favoritos neutraliza superfície e modal marca apenas um segmento” |
| Dimensões/fonte/ausência de callback UI | “320/360/400dp: ativo expande…”; “fonte ampliada…”; “seletor não envia callbacks comuns…” |
| CRUD/ativação | “Rotinas: criar validar editar e remover preservam outras rotinas”; “ativação é local…” |
| Horário, limites, cancelar e único overlay | “horário e prévia substituem o painel…”; “seletor personalizado mantém limites…”; “horário aceita limites válidos…” |
| Dias, inversão, estados e alternativa | “dias equilibrados e inversão…”; “percurso expande etapas…” |
| Avatar/storage mínimo/releitura/falhas | “iniciais: vazio…”; “perfil persiste somente nome e cor…”; “perfil corrompido ou falha…” |
| Edição/cancelar/duplo toque/favoritos reais | Quatro testes em PerfilTela.test.cjs |
| Cinco rotas/legacy/larguras | “cinco abas: Perfil antes de Rotinas, Mapa central…” |
| Parada, sentidos, retry, cancelamento, obsoletas | “contador usa linhas únicas…”; “painel carrega uma vez; erro permite retry…” |
| Teclado e rodapé | “painel Android limita altura acima do teclado…” + captura física |
| Favoritos e confirmação existentes | Suítes favoritos, favoritosEtapaB e Confirmacao aprovadas |

Comando em NoPonto/:

```powershell
node scripts/test-radar.cjs src/components/demo/InterfaceDemo.test.cjs src/components/rotinas.test.cjs src/services/rotinasDemo.test.ts src/features/perfil/perfilLocal.test.ts src/features/perfil/PerfilTela.test.cjs src/components/NavBar.test.cjs src/components/mapaComponents/filtrosMapa.test.cjs src/components/mapaComponents/linhasDaParada.test.cjs src/components/Confirmacao.test.cjs src/services/favoritos.test.cjs src/services/favoritosEtapaB.test.cjs
node node_modules/typescript/bin/tsc --noEmit
git diff --check
```

Inspeção física real via ADB: seletor e exclusividade/Favoritos, três modais, ausência de erro no ciclo observado, cinco abas, Rotinas principal/formulário/horário/prévia, Perfil neutro/edição/atualização das iniciais/cancelamento e teclado, temas claro/escuro nas telas principais, botão da parada, painel com oito linhas e último item após scroll. O texto de teste do Perfil foi cancelado; não salvo como nome do usuário. Preferência de tema claro restaurada. Capturas durante a animação não foram usadas como aprovação da composição final.

Ainda não homologados fisicamente:320/360dp, quatro modais no mesmo contexto, fonte ampliada/movimento reduzido, todos os fluxos de criação/remoção/alternativa/explicação, favoritos reais preenchidos no Perfil, gravação seguida de reinício real do aplicativo e iOS. Cobertura automatizada de storage não equivale a teste físico de reinício. Nenhum ajuste de configuração do celular, resolução, densidade ou fonte foi feito.

## Git e limites

Branch feat/otimizacoes-beta mantida; HEAD4854478 preservado. Sem commits, push, merge, deploy, novas branches, clones ou worktrees. Workspace permanece sujo, com arquivos novos não rastreados desta etapa e alterações anteriores preservadas. A lista acima distingue os arquivos desta etapa dos diffs herdados. Sem backend, dependências, contratos, infraestrutura, Radar, GPS ou SignalR funcionais modificados. O arquivo solto semelhante a “melhora mapa, SignalR e interface” não estava presente e não foi incorporado. Artefatos de diagnóstico do aparelho ficam fora dos arquivos versionáveis; não incluir bundles, APK ou logs privados em commits.

## Checklist manual priorizado

1. Alternar modais/Favoritos rapidamente; conferir amarelo, texto e ausência de Worklets, principalmente com quatro modais e fonte grande.
2. Abrir parada com muitas linhas, rolar até a última, conferir dois sentidos, fechar e trocar de parada.
3. Criar/editar rotina, inverter percurso, alternar dias, ajustar/cancelar hora, abrir teclado e salvar. Abrir percurso do formulário e voltar sem perder o rascunho.
4. Explorar etapas, estados, aviso/alternativa e explicação. Desativar/remover exemplos e conferir estado vazio.
5. Perfil: salvar nome opcional/cor, fechar/reabrir o app, editar/cancelar e conferir iniciais. Comparar favoritas reais com os exemplos sinalizados de estatísticas.
6. Conferir cinco abas em320/360/400dp, ambos os temas e fonte ampliada. O Metro8084 foi deixado ligado para continuar seus testes.
