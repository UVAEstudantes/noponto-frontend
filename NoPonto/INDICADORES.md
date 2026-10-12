# Indicadores de veículos

O sistema atende **Ônibus, BRT e Trem**. Em Configurações → Indicadores dos veículos, a pessoa escolhe Clássico, Padrão ou Realista com prévias dos SVGs reais. O padrão inicial é modo global ligado e estilo Padrão. Desligar o modo global recupera as escolhas individuais, que permanecem armazenadas.

## Arquivos desta implementação

Criados:

- `src/constants/indicadores.ts`
- `src/constants/indicadoresSvg.generated.ts`
- `src/services/apresentacaoIndicadores.ts`
- `src/services/apresentacaoIndicadores.test.cjs`
- `src/context/ProvedorIndicadores.tsx`
- `src/components/indicadoresConfiguracao.tsx`
- `scripts/gerar-indicadores.cjs`
- `scripts/test-indicadores.cjs`
- `INDICADORES.md`

Modificados:

- `app/_layout.tsx`: provedor compartilhado.
- `app/configuracao.tsx`: seção de personalização.
- `app/index.tsx` e `src/components/mapOSM/types.ts`: identificação da linha para aplicar cor ferroviária.
- `src/components/mapOSM/mapOSM.tsx`: envio independente de preferências.
- `src/components/mapOSM/webview/mapScript.ts`: apresentação centralizada em elementos existentes.
- `src/components/mapOSM/webview/mapStyles.ts`: dimensões, rotação e estados visuais.
- `src/components/mapOSM/webview/railPresentation.test.ts`: expectativas atualizadas para a nova apresentação; alinhamento de uma expressão antiga com a condição atual de evidência ferroviária.

## Arquivos e catálogo

- `assets/indicadores/classico/pin.svg`: único desenho universal; frente para baixo, `viewBox="0 0 64 72"`.
- `assets/indicadores/{padrao,realista}/{onibus,brt,trem}.svg`: frente para cima, `viewBox="0 0 80 240"`.
- `src/constants/indicadores.ts`: famílias, nomes, modais, referências aos assets, tamanho de apresentação, orientação original e ponto de ancoragem. A interface deriva suas opções deste catálogo.
- `src/services/apresentacaoIndicadores.ts`: renderizador compartilhado pelas prévias React Native (`SvgXml`) e pela WebView (`img` com data URI).
- `src/constants/indicadoresSvg.generated.ts`: conteúdo local dos SVGs e código JavaScript do renderizador. Não editar à mão.

Os arquivos originais não são modificados durante a renderização. Para empacotar alterações nos SVGs ou no renderizador, execute na pasta `NoPonto`:

```sh
node scripts/gerar-indicadores.cjs
node scripts/gerar-indicadores.cjs --check
```

O módulo gerado é versionado junto dos fontes. Assim o Metro empacota os desenhos como texto, sem transformer de SVG, fetch de assets, servidor de imagens ou dependência nativa nova. O JavaScript da WebView é compilado no desenvolvimento, sem depender de `Function.toString()` no Hermes. As imagens data URI isolam os IDs dos gradientes e referências `use` entre marcadores.

## Recoloração e composição

Cada SVG define a carroceria no grupo `id="carroceria"`, com seu próprio `fill`. O renderizador substitui esse preenchimento pela cor da linha. Sobreposições brancas/pretas com transparência continuam dando volume sobre a nova cor. Os acentos ocre dos SVGs realistas são convertidos em tons escuros proporcionais à cor selecionada. Vidros, articulação, rodas e lanternas mantêm as cores originais.

São aceitas cores hex de três ou seis dígitos, compatíveis com a paleta atual. Uma cor inválida usa amarelo. Trens procuram a cor personalizada da linha pelo `linhaId`; a identidade existente do ramal continua disponível quando não há cor personalizada.

O Clássico reutiliza o mesmo pin para os três modais. Pictogramas vetoriais locais são compostos no SVG em memória, sem novos arquivos. O contraste do pictograma é calculado pela luminância: branco ou escuro. Seu centro original é `(32, 30)`, na região arredondada. O pictograma gira junto com o marcador.

## Direção e ancoragem

O bearing existente continua sendo usado, incluindo o calculado pelas tangentes das rotas. A camada `.bus-inner` recebe `heading - map.getBearing()`, com continuidade ao cruzar 0°/360°. O desenho recebe uma compensação adicional igual ao negativo de sua orientação original: 0° para Padrão/Realista e −180° para Clássico. Assim heading 0° aponta para o norte em todas as famílias.

O elemento externo tem 40 × 40 pixels e ancora no centro GPS. Padrão e Realista usam 14 × 42 pixels, preservando a proporção, com o centro do desenho no GPS. Clássico usa 32 × 36 pixels, com a região arredondada, centro `(16, 15)` em pixels de apresentação, no GPS. A compensação gira em torno desse mesmo ponto, sem fazer o marcador orbitar a coordenada. Os tamanhos não variam com o zoom, seguindo o comportamento DOM existente. Sem orientação disponível, a apresentação neutra aponta para o norte; permanecem as regras existentes de retenção/cálculo de heading.

## Atualização e desempenho

`MapaOSM` observa as preferências e injeta apenas `window.updateIndicatorStyles(...)` após `map_ready`. Esse comando atualiza os elementos de imagem existentes; não altera coordenadas, popups, câmera, seleção, listeners, fontes do mapa ou conexões de GPS/SignalR. O HTML/source da WebView permanece memoizado independentemente das preferências.

O renderizador mantém até 256 combinações de família/modal/cor em cache. A assinatura de apresentação por marcador evita regenerar ou reatribuir a imagem durante atualizações de posição. Cor e estilo fazem parte da chave para evitar conteúdo antigo. Estados ferroviários e destaque da seleção permanecem no elemento externo.

## Persistência e recuperação

`ProvedorIndicadores` compartilha as preferências entre configurações e mapa. O AsyncStorage usa exclusivamente `@preferenciasIndicadores:v1`, com `global`, `estiloGlobal` e `individuais` para os três modais. Não modifica as preferências de linhas, filtros ou tema.

A seleção é aplicada imediatamente em memória, e as escritas são serializadas para preservar a ordem de toques rápidos. Erros de gravação aparecem na configuração e no log; uma nova seleção tenta salvar novamente. Preferências corrompidas ou estilos removidos usam Padrão com aviso no log. Os seletores aguardam a leitura inicial para evitar sobrescrever preferências antes da hidratação.

## Adicionar uma família

1. Adicione os SVGs em `assets/indicadores/<familia>/`.
2. Registre a família em `familiasIndicadores`, incluindo assets dos três modais e metadados adequados. `asset()` atende aos enquadramentos atuais; amplie os metadados se uma família tiver outro canvas/orientação.
3. Mantenha a convenção do grupo `carroceria` e sombras relativas (branco/preto com transparência). Se os SVGs tiverem acentos fixos próprios, adapte a recoloração centralizada.
4. Execute o gerador e as verificações abaixo. O seletor passa a listar a família automaticamente; as funções de GPS não precisam mudar.

Um futuro modal deve ser registrado explicitamente no catálogo, nos tipos e na composição de pictogramas, quando sua funcionalidade for implementada. Não há seletores, persistência, assets ou fallback de metrô nesta entrega. O fallback atual trata somente preferências inválidas (Padrão) e cores inválidas (amarelo).

## Verificação

```sh
node scripts/test-indicadores.cjs
node scripts/gerar-indicadores.cjs --check
npx tsc --noEmit
npx eslint src/constants/indicadores.ts src/services/apresentacaoIndicadores.ts src/context/ProvedorIndicadores.tsx src/components/indicadoresConfiguracao.tsx src/components/mapOSM app/configuracao.tsx app/_layout.tsx
npx expo start -c --tunnel
```

Os testes executam o script real da WebView em um DOM simulado e verificam as nove combinações, recoloração/contraste/cache, ancoragem, orientação, troca em elementos existentes, preservação de cliques e popups, persistência e geometria ferroviária. Eles não substituem testes no celular.

Validação da implementação: 22 testes passaram (incluindo troca com 600 marcadores simulados e recuperação de falha no armazenamento); TypeScript, lint direcionado e sincronização do módulo gerado passaram. Os desenhos foram conferidos no navegador em tamanho de mapa e ampliado, com amarelo, azul e cor escura. A exportação Android com Expo SDK 55 concluiu com sucesso, compilando 3.572 módulos e gerando bundle Hermes em uma pasta temporária fora do repositório.

No Expo Go, confira a legibilidade em tela pequena/temas claro e escuro, diferentes zooms, cliques em veículos, troca de estilos com veículo selecionado, cores das linhas e retomada após fechar/reabrir. Confirme também animações, carga com muitos veículos e a renderização nativa das prévias.
