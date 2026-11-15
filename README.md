# NoPonto Mobile

Aplicativo acadêmico NoPonto para consultar transporte público e acompanhar ônibus, BRT e trem. Integra mapas, linhas, favoritos e Radar de Espera com o backend do projeto.

## Funcionalidades e estado atual

- Mapa com MapLibre em WebView, localização do usuário, filtros de modal, linhas, percursos, paradas e veículos; atualizações rodoviárias via HTTP/SignalR.
- Consulta de linhas e paradas, seleção de linhas no mapa, favoritos e armazenamento local de preferências e percursos.
- Trem com consulta periódica de snapshots e refresh; as posições são estimativas do backend, com qualidade e idade próprias.
- Radar de Espera com seleção e acompanhamento por parada/linha, notificações e avisos por voz. O caminho remoto Android depende de API Radar, Firebase/FCM, build nativa compatível e permissões. Não depende de JavaScript executando continuamente em segundo plano.
- Perfil com nome/cor persistidos localmente. Indicadores de mobilidade e conteúdo demonstrativo não representam histórico real de viagens nem autenticação de conta no servidor.
- Rotinas com formulários, estados e percursos ilustrativos: funcionalidade demonstrativa, sem motor de rotas, agendamento real ou integração de viagem concluídos.
- Configurações de tema, indicadores, voz e abertura; tutorial e sinalização de conectividade, gateway e fontes de transporte.

Permissões, disponibilidade das fontes e configuração afetam os recursos oferecidos. Telas demonstrativas e notificações locais de teste não comprovam entrega push em produção.

## Stack e organização

Confirmado em `NoPonto/package.json`: Expo `~55.0.23`, React Native `0.83.6`, React `19.2.0`, TypeScript `~5.9.2`, Expo Router 55, NativeWind 4, React Native Paper, TanStack Query e SignalR. O app usa AsyncStorage/SecureStore, Expo Location, Notifications e Speech, além de plugins e módulos Android próprios.

| Caminho | Responsabilidade |
| --- | --- |
| `NoPonto/app/` | Rotas e layout Expo Router |
| `NoPonto/src/components/` | Mapa, Radar, navegação, tutorial e UI |
| `NoPonto/src/features/` | Perfil e Rotinas |
| `NoPonto/src/services/` | HTTP, gateway, SignalR, armazenamento e notificações |
| `NoPonto/src/hooks/`, `src/types/` | Estado integrado e contratos |
| `NoPonto/assets/` | Imagens, fontes e vídeo |
| `NoPonto/plugins/`, `modules/` | Configuração e recursos nativos |
| `NoPonto/scripts/` | Validação e builds locais |

## Desenvolvimento local

Use Node.js 22 e pnpm 10, como no workflow, e um Expo Dev Client compatível com as dependências nativas. Android requer SDK, Java e dispositivo/emulador configurados; scripts locais também validam CMake/Ninja e Firebase. Expo Go não cobre os módulos próprios nem valida o Radar remoto Android.

```sh
cd NoPonto
pnpm install --frozen-lockfile
```

Crie `NoPonto/.env` com valores do seu ambiente. Não há `.env.example` versionado para copiar. Não versione credenciais, arquivos Firebase privados ou chaves de assinatura. Variáveis `EXPO_PUBLIC_*` entram no bundle e devem conter somente configuração pública.

| Variável | Finalidade |
| --- | --- |
| `EXPO_PUBLIC_API_BASE_URL` | Origem principal da API |
| `EXPO_PUBLIC_API_FALLBACK_URL` | Origem alternativa da mesma API |
| `EXPO_PUBLIC_GPS_HUB_ROUTE` | Caminho do hub, normalmente `/hub/gps` |
| `EXPO_PUBLIC_GPS_HUB_URL` | URL completa do hub quando necessária |
| `EXPO_PUBLIC_RADAR_API_BASE_URL` | Origem do Radar remoto |
| `EXPO_PUBLIC_RADAR_REMOTE_ENABLED` | Habilitação do caminho remoto (`true`) |
| `EXPO_PUBLIC_REQUEST_TIMEOUT_MS` | Timeout HTTP |
| `APP_VARIANT` | Variante nativa; `development` para Dev Client |

Preencha as origens com os endereços do ambiente autorizado, acessíveis pelo dispositivo. O valor local padrão de API no código usa loopback, que não aponta para o computador quando executado em telefone físico.

O gerenciador compartilhado verifica liveness e alterna entre gateway principal e fallback; readiness e saúde das fontes não decidem essa troca. Operações de negócio não são repetidas automaticamente. SignalR acompanha a origem ativa. Radar acompanha a troca quando usa a mesma origem da API; uma origem própria permanece separada. Builds standalone exigem origens HTTPS autorizadas na configuração nativa.

Os perfis existentes em `eas.json` já definem origens e podem sobrepor o `.env`; revise-os antes de gerar um bundle/build. Alterações nas variáveis incorporadas exigem novo bundle ou build apropriado.

Com o Dev Client instalado, execute no diretório `NoPonto`:

```sh
pnpm exec expo start --dev-client --lan
```

Em PowerShell, selecione previamente a variante com `$env:APP_VARIANT = 'development'` quando necessário. Mudanças nativas exigem recompilar o cliente.

Scripts presentes: `pnpm start` (túnel), `pnpm start:local`, `pnpm android` e `pnpm ios` (Metro com túnel), `pnpm web` e `pnpm lint`. Os comandos Android/iOS do package não geram um binário nativo. O alvo principal é mobile; web não equivale à validação dos recursos Android.

## APK e CI/CD

Os scripts PowerShell em `NoPonto/scripts/` incluem `build-dev-local.ps1` e `build-release-local.ps1`. O primeiro gera Dev Client; o segundo exige Firebase de produção e keystore/chaves fornecidos pelo ambiente. Não crie ou substitua credenciais para executar uma build. Os scripts usam flavors Gradle, validam pré-requisitos e copiam APKs para `.local-apks/`.

No EAS, os perfis existentes incluem `development` (Dev Client), `radar`, `nativeprobe`, `preview` (APK interno) e `production` (AAB). Consulte os scripts e `eas.json` antes de escolher uma variante. Nenhum build local, EAS ou deploy foi executado nesta limpeza.

O workflow `.github/workflows/build.yaml` está **temporariamente desativado** por `if: ${{ false }}` no job `build`. Tanto pushes para `main` quanto `workflow_dispatch` mantêm seus gatilhos, mas pulam o job inteiro. Remover a condição reativa o fluxo EAS/APK existente. A alteração permanece em `chore/principal`, para revisão antes de futura integração à `main`.

## Validação e documentação

Há testes Node junto ao código (`*.test.ts`/`*.test.cjs`) e executores em `scripts/`. Não existe script `pnpm test` no package atual. Para verificações manuais, `pnpm exec tsc --noEmit` e `pnpm lint` estão disponíveis; testes específicos devem usar o executor apropriado. Nesta limpeza foram feitas apenas verificações estáticas de referências, preservação de arquivos, YAML e diff.

[Backend](https://github.com/UVAEstudantes/noponto-backend) · [Documentação](https://github.com/UVAEstudantes/noponto-docs) · [Índice documental](https://github.com/UVAEstudantes/noponto-docs/blob/main/INDICE.md) · [Releases](https://github.com/UVAEstudantes/noponto-frontend/releases)
