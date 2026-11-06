# N3-F — Radar de Espera

Base inspecionada: `35d8fb1`, branch `feat/radar-notificacoes`. Sem consulta à main.

## Referências

As seis imagens em `D:\repositorio_github\NoPonto\_referencias-stitch\radar` foram abertas e analisadas visualmente:

- 01-radar-mapa: chegadas permanecem principais, acompanhamento vira uma linha compacta. Busca e navegação reais preservadas.
- 02-alertas-voz: referência futura. Apenas entrada estática “Alertas por voz no fone · Em breve”, sem ação nem configuração fictícia.
- 03-configuracoes-radar: cabeçalho com parada/status, cartões de linhas, seleção amarela própria, estrela separada, antecedência e ações no rodapé.
- 04-notificacao-expandida, 05-notificacao-compacta, 06-notificacao-terminal: registradas como referências futuras. Notificação Android não foi alterada nesta entrega.

## Componentes e decisões

`radarEsperaSection.tsx` reutiliza o controlador e apresenta um Modal fullScreen, sem nova rota principal nem Configurações globais. Cabeçalho/rodapé fora do ScrollView, áreas seguras, StatusBar dinâmica e voltar Android via onRequestClose. Voltar descarta rascunho; salvar aplica configuração em lote. Ativação inicial permanece aberta para mostrar permissão/estado/erro; falha nativa conserva Retomar.

Disponíveis continuam sendo as linhas já selecionadas no mapa e compatíveis com a parada. Destinos vêm dos vínculos atuais; cores individuais de LinhaSelecionadaInfo.cor; ETA resumido vem somente dos candidatos elegíveis já calculados. Linhas fora da prévia mostram “Sem previsão elegível”. Não há novas consultas ou cálculo paralelo de ETA.

Opções rápidas 2/5/10/15 e controles −/+ preservam todos os inteiros 2..15 e padrão 10. Desmarcar remove prioridade; salvamento valida o subconjunto. Sessão ativa reconfigura sem nova permissão. O hook aplica o snapshot atual antes de ativar, independentemente da ordem dos efeitos pai/filho.

Prioridades e janela usam o armazenamento existente; linhas continuam em memória. Sessão ativa não é persistida. Visualizar outra parada não transfere o alvo: edição incompatível fica bloqueada. Troca deliberada permanece no seletor do Radar. Mudança de contexto durante edição bloqueia salvar até reabrir.

Todos os estilos usam useTema/tema.ts. Único token compartilhado novo: textoSobrePrimario, escuro sobre amarelo em ambos os temas. Sem paleta paralela ou fundo branco fixo. Badge mantém cor na moldura e texto sobre superfície do tema para contraste com cores arbitrárias. Checkbox View + Check, sem glifo/nativo de fundo preto; estrela independente. Papéis e estados acessíveis, áreas mínimas 44 dp, rodapé 48 dp.

## Notificações futuras: possibilidades e limites

Inspeção da API/implementação instalada do expo-notifications SDK 55:

- Notifications.types.ts expõe título, body, subtitle, cor de destaque, payload e categoryIdentifier.
- ExpoNotificationBuilder.kt usa setContentTitle, setContentText, setSubText e BigTextStyle com o MESMO body expandido. Cor aplicada ao template do sistema. Categorias oferecem ações padrão via setNotificationCategoryAsync.
- JavaScript permite texto curto, quebras, horários, símbolos e identidades no payload. Ações padrão precisariam de handlers/validação em etapa posterior.
- Não existe API pública instalada de RemoteViews, cartões por veículo, badges individuais coloridos, progresso personalizado ou conteúdos distintos para compacto/expandido como nos desenhos. Fidelidade a esses detalhes exige implementação Android nativa e nova compilação.
- Android/fabricante controla truncamento, expansão e aparência dos botões. Não há garantia de reprodução exata das referências pelo template atual.
- Terminal deve continuar distinguindo chegada, saída prevista e presença física, sem ETA inventado.

Nenhuma alteração foi feita em notificações, canais, identificadores, ações ou código nativo nesta etapa.

## Validação e roteiro no NoPonto Dev

Dentro de NoPonto: `npx --no-install tsc --noEmit` e testes direcionados de UI, configuração/persistência, hook/sessão e regressões N1/N2/N3/E. O harness valida interações e estilos, não rasterização nativa. Fidelidade final, texto grande e barras do sistema precisam de conferência em aparelho.

Com development build existente:

```powershell
$env:APP_VARIANT = 'development'
pnpm exec expo start --dev-client --tunnel
```

1. Abra uma parada com linhas selecionadas. Confira chegadas e a única linha de acompanhamento; toque Configurar/Gerenciar.
2. Confira destinos/ETAs, cores, checkbox e estrela independente. Voz deve estar sem ação, marcada Em breve.
3. Escolha linhas, prioridades e janela (inclusive 11 min com +); ative e conceda permissão.
4. Edite e volte sem salvar: nada muda. Edite/salve: acompanhamento permanece e a mesma notificação atualiza.
5. Alterne claro/escuro durante edição: rascunho deve permanecer. Confira rolamento, fonte grande, rodapé e voltar Android.
6. Visualize outra parada: nome monitorado permanece, edição incompatível bloqueada. Volte ao alvo; transfira somente pelo seletor explícito.
7. Negue permissão e confira erro sem quebra do app. Encerre explicitamente e confira remoção individual. Ao sair do primeiro plano, a previsão é removida conforme regra existente.

Sem validação visual em aparelho nesta execução, sem APK, deploy, áudio, push, mudanças nativas ou acesso a D:\npdev. Não há promessa de funcionamento com aplicativo fechado.
