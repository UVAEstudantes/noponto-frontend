# PoC isolada de última posição física

Abra [`index.html`](index.html) diretamente no navegador, sem servidor. A página usa apenas `core.js`, `fixtures.js`, `app.js` e `style.css` locais. Todos os veículos, linhas, coordenadas e instalações são **sintéticos**. Nenhum cliente ITS/GTFS, serviço operacional, armazenamento ou polling é carregado. A política CSP bloqueia conexões da página.

Para validar offline, a partir da raiz `noponto-frontend`:

```powershell
node --check NoPonto/scripts/terminal-presence-poc/core.js
node --check NoPonto/scripts/terminal-presence-poc/fixtures.js
node --check NoPonto/scripts/terminal-presence-poc/app.js
node --check NoPonto/scripts/terminal-presence-poc/temporal-study.cjs
node --test NoPonto/scripts/terminal-presence-poc/poc.test.cjs
```

## Modelo e cenários

`core.js` recebe um contrato v1 com `{ identity: {source, provider, vehicleId}, point: {latitude, longitude}, physicalTimestamp, receivedTimestamp?, reportedLine: {service?, routeId?}, quality: {accuracyMetres?, method?, sourceStatus?} }`. O horário físico original e a coordenada são preservados; `receivedTimestamp` nunca renova a idade. A chave da identidade usa origem + fornecedor + identificador **exatamente como recebidos**, sem igualar textos de fornecedores diferentes nem normalizar caixa/espaços do ID. Serviço só aparece como **informado** quando corresponde unicamente ao catálogo sintético e não contradiz `routeId`. Não há campo que confirme viagem ativa, próxima saída ou embarque: a apresentação mantém “Saída não confirmada”.

O relógio avança apenas a idade. “Avançar 30 s” permite observar a passagem de uma posição recente para antiga (>180 s, apenas um alerta de interface, **sem TTL**). Os botões simulam GPS repetido, regressivo, GPS físico novo com troca de serviço, serviço ausente e conflito de identidade no mesmo horário físico. O marcador fica nas coordenadas do último fix aceito; em conflito, ele é ocultado até reiniciar. Não há movimento artificial, projeção no itinerário ou ETA.

Inicialmente, a instalação fictícia só possui uma âncora: até 200 m com precisão compatível é `near_terminal`; até 1 km ou precisão/borda incerta é `uncertain_location`; além disso é `outside`. O botão **Exibir perímetro sintético revisado** demonstra `inside_trusted` apenas para uma zona inteiramente fictícia com origem, revisão, papel e precisão declarados. Ele não representa Campo Grande, Magarça, Deodoro ou qualquer instalação real. Uma zona candidata, precisão desconhecida ou fix próximo da borda não sustenta `inside_trusted`. O esquema SVG é local, não um mapa geográfico operacional.

## Estudo temporal offline

`temporal-study.cjs` usa entradas simuladas e replica os gates conservadores de `AbsenceReasons` do laboratório: idade física de 0 a 60 s no instante de comparação; ITS completa; fornecedor verificado; horário de servidor no minuto solicitado; dois snapshots GTFS completos com cobertura global da identidade; geração presente, crescente, não futura e não mais antiga que 90 s; distância entre **cada geração** e o GPS físico de até 60 s. Acrescenta diagnóstico explícito para minuto solicitado inválido e identidade ambígua. Uma geração repetida, inclusive por cache 304, não comprova ausência. Encontrar a identidade no GTFS em **qualquer linha** impede afirmar exclusividade ITS.

Os pilotos históricos mostram que as 43 observações locais ausentes dos snapshots consultados na segunda coleta já tinham GPS físico com 61–120 s e falharam também o alinhamento da geração posterior. Quatro chaves de mesma origem perto de Campo Grande/Magarça tiveram GPS físico crescente e deslocamento ≤10 m nas duas rodadas, sem correspondência global nos snapshots, mas **nenhuma ausência temporalmente qualificada**. A PoC demonstra como exibir uma *última posição observada* com idade honesta; ela não transforma essa posição em presença atual comprovada nem em omissão permanente do GTFS. Cadências, cache e atrasos diferentes das fontes exigem nova observação alinhada; os limites de 60 s não foram relaxados.

Os resultados originais permanecem em [`PILOTO_PROXIMIDADE_2026-10-28.md`](../terminal-presence-preflight/PILOTO_PROXIMIDADE_2026-10-28.md) e [`PILOTO_2_PROXIMIDADE_2026-10-28.md`](../terminal-presence-preflight/PILOTO_2_PROXIMIDADE_2026-10-28.md), com agregado JSON ao lado do segundo relatório.

## Evolução necessária

O backend já distingue `Parada` com `Localizacao`, `ParadaPaiId`, `TipoLocal` e `Plataforma`, e possui associação `PoiParada`. Esses pontos e vínculos podem identificar instalações e plataformas candidatas, inclusive locais sem `parent_station`; **não formam perímetros confiáveis**. Um cadastro separado e revisado precisaria associar cada instalação a polígonos versionados de plataforma e pátio, com origem, revisão, validade, papel, limites e revisão humana. Múltiplas zonas e padrões circulares exigem vínculos explícitos; proximidade ou serviço histórico não atribuem automaticamente linha a um veículo. Geometrias com buracos ou topologia mais complexa exigiriam validação espacial própria antes de qualquer uso operacional. Esta PoC só aceita polígonos locais simples e não altera o cadastro nem os fluxos existentes.

Validação em 28/10/2026: `node --check` dos arquivos JavaScript alterados sem erros e `node --test` com **24/24 testes aprovados** (22 anteriores e duas regressões). Em Chromium headless real, o perímetro alternou de `hidden`/`display:none` para visível/`display:inline` e voltou a ficar oculto; a classificação acompanhou as duas transições. Os rótulos próximos à âncora não se sobrepuseram nessa fixture. Uma captura local da página inicial também foi inspecionada. Reavalie aparência e acessibilidade antes de qualquer uso além desta demonstração.
