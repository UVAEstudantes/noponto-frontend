# Gateways

Implementado em `chore/gateway`, sem deploy, commits ou mudanças no backend.

`gateway.ts` mantém um estado compartilhado e uma verificação por vez. Duas tentativas de 2,5 s na abertura; durante o uso, três verificações malsucedidas antes de testar a alternativa. Intervalo de 60 s em foreground, limitação de 10 s para verificações provocadas por erros. Retorno ao primário após 180 s na reserva e pelo menos duas verificações positivas. A inicialização visual não espera esse processo.

Liveness usa `GET /health/live`, JSON `{ "status": "healthy", "checkedAt": "...UTC..." }`. Apenas HTTP 404 nesse endpoint habilita o caminho temporário `GET /`, exigindo o texto exato `Hello World!`. HTML dos túneis não é aceito como saúde. Cada chamada tem timeout de 2,5 s incluindo leitura do corpo; o caminho legado pode consumir duas chamadas por tentativa. A rota antiga pode ser removida da sondagem após o deploy e adoção do novo backend.

401/403/404 não provocam fallback. Erros de rede, timeout e 502/503/504 solicitam health; não bastam sozinhos para trocar. Nenhuma operação é repetida automaticamente, inclusive POST/PUT/DELETE. A próxima chamada usa a origem ativa. Chamadas já em andamento mantêm a origem e o cancelamento original. O cliente acrescenta o header anti-interstitial do ngrok.

SignalR mantém a mesma instância e listeners. A troca aguarda `stop`, muda `baseUrl` e usa as filas existentes para restaurar inscrições de linhas e presença física/unificada. Suspensão e saída do mapa preservam a economia atual. O reconnect automático existente permanece. Depois de encerramento definitivo, o monitor permite nova tentativa somente com demanda e conexão desconectada. Três falhas de conexão com demanda permitem testar REST e handshake WebSocket da alternativa. Na recuperação desse tipo de falha, o primário também precisa passar handshake WebSocket. Esses probes não fazem inscrições e são encerrados em até 2,5 s.

Radar remoto continua usando o mesmo cliente, credenciais, notificações e processamento no servidor. A origem acompanha o gateway somente quando a configuração Radar corresponde à API principal. Deploy separado permanece separado. APK standalone aceita somente origens HTTPS declaradas em `extra.radarApiOrigins` pelo build. O fallback não depende de timers JavaScript em background; o monitor pausa suas sondagens periódicas fora do foreground e verifica novamente ao retornar. Não foi alterado o processamento nativo/push.

`expo-network` é a única dependência adicionada, para evidência de ausência de rede no Android. APK/Dev Client anterior sem esse módulo precisa de um futuro build nativo; o carregamento é protegido e, na ausência do módulo, a mensagem permanece neutra. Não foi executado build. A mensagem de falha dos dois gateways não afirma que o servidor está desligado. Toast global flutuante dura 8 s, pode ser fechado e é limitado por ocorrência; avisos pendentes aparecem após abertura/retorno ao foreground. Configurações lê versão real de `Constants.expoConfig.version` e estado do mesmo gerenciador.

## Readiness e fontes de transporte

Contrato conferido em `noponto-backend-health/HEALTH_STATUS.md`, `HealthController.cs` e `HealthResponses.cs`. Nenhuma alteração no backend nesta integração.

Após liveness positiva, o mesmo ciclo consulta em paralelo `/health/ready` e `/health/fontes`, no máximo uma vez por 60 s. Verificações concorrentes compartilham a promessa do gerenciador; não há outro timer. O ciclo periódico só roda em foreground, retomando ao retornar. Respostas atrasadas após perda de rede ou mudança de origem são descartadas. Nenhum desses dois endpoints participa da decisão de fallback. Não há retry de operações de negócio.

- Readiness: lê `status` (`healthy`, `degraded`, `unhealthy`); o contrato inclui `checkedAt` e `dependencies.postgres/redis`, cada qual com `status`/`reason`. HTTP 503 com JSON `unhealthy` gera **Serviço temporariamente indisponível**, sem mudar de gateway. `degraded` fica disponível no estado sem afirmar queda. Falha de transporte, JSON inválido ou 404 => `unknown`.
- Fontes: lê `sources.sppo.status` e `sources.brt.status`, preservando `healthy`, `degraded`, `unavailable`, `unknown`. O contrato também fornece timestamps, idades, falhas, motivos e `providers.its/gtfsRt`; estes campos diagnósticos não são usados para inventar alertas. `lastError` histórico não indica incidente atual. 404/erro de consulta => `unknown`.
- Dois snapshots consecutivos `unavailable`, separados pelo ciclo de 60 s, confirmam aviso específico do modal. `unknown`, warmup, `degraded` e ausência de veículos não geram alerta de queda. O backend já aplica tolerâncias aos coletores; frontend não infere saúde por GPS ou horário.
- Toast global no topo via Portal existente: 8 s, Fechar, Safe Area e movimento reduzido; não bloqueia navegação. Entrada de 300 ms, saída de 240 ms, sem nova dependência. Prioridade: sem internet/ambos os gateways inacessíveis, dependências, fontes, reserva. Cada modal avisa uma vez por ocorrência; rearmar requer duas leituras saudáveis e pelo menos dez minutos desde o aviso anterior. Alertas confirmados em segundo plano aguardam foreground. O monitor não depende de execução contínua em background.
- Rodapé: `NoPonto™ · Beta · v<versão real>` e gateway dinâmico; aparência compacta e cores do tema preservadas.

Validação direcionada desta integração: `node --test src/services/gateway.test.cjs`; `pnpm exec tsc --noEmit`; integração de hub com o filtro indicado abaixo. Sem deploy dos endpoints, readiness/fontes permanecem desconhecidos e o app usa liveness legada. Sem validação visual em dispositivo, notificações push ou falhas reais de infraestrutura nesta tarefa.

## Ambiente e produção

```dotenv
EXPO_PUBLIC_API_BASE_URL=https://noponto-api.shares.zrok.io
EXPO_PUBLIC_API_FALLBACK_URL=https://ununionized-suzanne-nonliterary.ngrok-free.dev
EXPO_PUBLIC_RADAR_API_BASE_URL=https://noponto-api.shares.zrok.io
EXPO_PUBLIC_GPS_HUB_ROUTE=/hub/gps
EXPO_PUBLIC_GPS_HUB_URL=wss://noponto-api.shares.zrok.io/hub/gps
EXPO_PUBLIC_REQUEST_TIMEOUT_MS=10000
```

`.env` e `.env.local` locais atualizados somente nesses gateways; são ignorados pelo Git. Não existia `.env.example`. EAS radar/nativeprobe (por herança), preview e production possuem as duas URLs públicas. Expo incorpora referências estáticas `process.env.EXPO_PUBLIC_*` ao bundle; mudar o gateway em runtime não exige reiniciar. Alterar os endereços configurados exige novo bundle/build. Variáveis remotas EAS devem corresponder a essas origens; não foram alteradas remotamente.

## Validação manual (PowerShell)

```powershell
Set-Location D:\repositorio_github\NoPonto\noponto-frontend\NoPonto
pnpm exec tsc --noEmit
node --test src/services/gateway.test.cjs
node --test --test-name-pattern="gateway switch|cancel and resubscribe|disconnect invalidates" src/services/gpsRemovals.test.cjs
$env:APP_VARIANT = 'development'
pnpm exec expo start --dev-client --lan --clear
```

No dispositivo: acompanhar duas linhas, abrir Configurações, voltar ao mapa, desligar/religar internet, fechar aviso, colocar em background e retornar. Para simular túnel sem tocar no servidor, temporariamente usar uma origem HTTPS inválida como primário no ambiente local e reiniciar apenas o bundle de teste; a reserva deve assumir. Restaurar ambiente depois. Testar Radar remoto em dispositivo com Firebase/Dev Client correspondente. Não usar Expo Go como validação de notificações remotas Android. Não foram exercitados failover real de túneis, Radar push/narração, renderização do toast ou troca prolongada em dispositivo.

Testes do gerenciador e integração focada do hub passaram. TypeScript passou. A execução mais ampla de `gpsRemovals.test.cjs` encontrou falhas `view.props.onMessage is not a function`; `radar-standalone-config.test.cjs` encontrou falha no contrato do script productionRelease. Não foram corrigidos componentes WebView/scripts de build fora do escopo; origem dessas falhas ainda não foi isolada.
