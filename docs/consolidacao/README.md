# Consolidação funcional — 2026-11-05

Base: origin/ajustes `4dc7afccd9c7205803d9d1dd216a08a97fe9981e` (PR33), integrada à linhagem Radar `de43a67` por merge e ao estado funcional GPS27, preservado na worktree original. A árvore consolidada não depende do WIP para compilar. Dependências e lockfile inalterados; validação reutilizou instalação existente por junction local ignorada.

## Decisões de integração

- Startup, layout e testes preservados exatamente de origin/ajustes, incluindo retomada Android e fallback limitado. A alternativa WIP de startup não foi incorporada.
- Conflitos useMobilidadeRio, roadPresence, terminalPresence.test e veiculosMapa resolvidos com a implementação GPS27: identidade por modal/linha/sentido/versão, descarte temporal, remoção de linha vazia, reconexão e handoff físico preservados. Histórico de ambas as linhagens unido sem perder entradas.
- Entrada app/index.tsx restaurada byte a byte do backup `D:/r28-backups/input-lab-20261104-201400/index-anterior.tsx`; exporta Home, com navegação normal, mapa, Radar e linhas. Removidos imports/handlers r28Capture, R28InputLab e r28InteractionDiagnostics. Removidos sampler R28Perf, override R28_CONTEXT e chamadas de trace de movimento no aplicativo. Nenhum APK alterado.
- Mantidos Radar/GPS27 atual, cartões compartilhados, filtragem e prioridade por parada, terminais838/855, presença física/rede híbrida e separação entre evidência física e viagem/ETA. Título completo e indicador estático aprovados reintegrados.
- Popup conserva atualização parcial do DOM para evitar reconstrução de alvos de toque. Ramo de substituição de HTML e popup ferroviário recuperam expansão do popup aberto, sem compartilhá-la com outra identidade. Mesmo timestamp não move veículo; timestamp posterior legítimo atualiza sua posição.
- Oito verificações originais physicalPresenceMap continuam intactas e passam; não foi relaxado o loader para aceitar r28Capture. Harnesses mais antigos de startup/map_ready/popup/título foram compatibilizados com os módulos atuais; assertions funcionais preservadas. Teste de popup distingue atualização de dados do mesmo GPS de posição posterior e mantém a invariância de não reconstruir conteúdo idêntico.

## Exclusões e fixtures

PoCs terminal-presence-poc/preflight, laboratório de cliques, ferramentas/capturas R28 e .env não fazem parte desta árvore. Diagnóstico de movimento preservado apenas como módulo de suporte importado pelos testes; o aplicativo não o importa. Suportes diagnósticos legados continuam opt-in de desenvolvimento, sem nova coleta.

Fixture terminalRoutes.json contém somente catálogo público estático (geometria, paradas e IDs estruturais), sem veículos, timestamps ou posições observadas. terminalFixture.ts gera observações sintéticas com IDs TEST-* e tempo fixo. Três replays históricos mantêm assertions e são opcionais por NOPONTO_PRIVATE_REPLAY_DIR, com arquivos continuity.json/events.json/live.json fora do Git. Não foram versionados dados privados.

## Validação

- `node scripts/test-principal.cjs`: Passed405, Failed0, Skipped3, total408. Inclui R28/GPS, remoções, terminal, startup aprovado, favoritos, map_ready, popup, título e indicadores.
- `pnpm exec tsc --noEmit`: exit0.
- `pnpm lint`: exit0. Corrigidas apenas declarações ESLint de __dirname nos testes.
- `normal navigation exports Home and map panels have no capture or input lab dependency` fixa a entrada normal e os limites de dependência.
- `open details survive new GPS while speed, destination, distance and position refresh`, `realtime inserts already-expanded HTML instead of replaying the opening transition` e `rail popup consumer preserves its own details on changed data, not on another identity` validam popup, posição e expansão.
- `full Radar stop title has no truncation at width 320: FIXTURE ida parada 4` e variantes320/480 validam o título aprovado. `WebView reenvia estruturas em cada ready; estruturas antes=true, GPS tardio` e variantefalse validam handshake sem recarga por GPS.

Não executados: Android real, EAS/APK, live GPS/SignalR ou replays privados. Regiões de toque/medidas nativas não são provadas pelo harness; não houve pedido de aprovação visual nem mudança do APK instalado.

Main, worktrees originais, branches antigas e WIP preservados. Sem notificações, deploy, alterações de backend/infraestrutura ou credenciais. Workflows existentes disparam build automático apenas em push main; esta consolidação envia somente chore/principal e feat/radar-notificacoes.
