# N5-C4 — APK standalone do Radar

Base frontend `aacad2b`, branch `feat/radar-notificacoes`. Perfil novo **radar**, independente do perfil development. Nenhum build, Expo/EAS, instalação Android, alteração de backend/servidor ou acesso a credencial privada FCM executado nesta etapa.

## Escolha de pacote e Firebase

APK interna chamada **NoPonto Radar**, scheme `noponto-radar`, applicationId **com.guilhermedesales.nononto.dev**. Reutiliza o único pacote confirmado no arquivo cliente Firebase externo, projeto `noponto-2d820`, e o projeto Expo existente `ab3db7e8-2478-49d6-a339-e639dcce1a34`. Apenas nomes de projeto/pacote foram conferidos; nenhuma API key ou chave privada foi exibida ou copiada para Git. A chave FCM V1 desse pacote foi cadastrada no EAS pelo operador na N5-B; não foi consultada novamente por CLI nesta etapa.

O perfil development e o pacote de produção original `com.guilhermedesales.nononto` permanecem inalterados. A APK Radar compartilha a identidade Android do Dev: não coexiste com o Dev instalado, podendo substituí-lo quando a assinatura permitir. Não desinstalar automaticamente; se Android indicar conflito de assinatura, decidir manualmente sobre remover o Dev, considerando perda da credencial local. Instalações novas em outros aparelhos geram suas próprias credenciais, tokens e sessões; nenhuma identidade/token é embutida na APK.

Usar o mesmo pacote evita inventar configuração Firebase para outro applicationId. Migrar ao pacote de loja exige posteriormente seu arquivo Firebase/FCM e revisão deliberada do bloqueio; isso não foi feito aqui.

## Build remoto e destinos

`NoPonto/eas.json` define no próprio perfil radar:

- `developmentClient=false`, `distribution=internal`, Android `buildType=apk`: aplicativo release com bundle JS incorporado, sem Metro/USB.
- `environment=development`: reutiliza a variável EAS de arquivo **NOPONTO_DEV_GOOGLE_SERVICES_FILE** já provisionada nesse ambiente. O nome do ambiente não transforma a APK em development client.
- `APP_VARIANT=radar`, `EXPO_PUBLIC_RADAR_REMOTE_ENABLED=true`.
- `EXPO_PUBLIC_RADAR_API_BASE_URL` e `EXPO_PUBLIC_API_BASE_URL` iguais a `https://duplicity-wisplike-friend.ngrok-free.dev`, URL confirmada pelo operador.
- `EXPO_PUBLIC_GPS_HUB_URL=wss://duplicity-wisplike-friend.ngrok-free.dev/hub/gps`, rota `/hub/gps`, evitando fallback localhost do SignalR.

São variáveis públicas de configuração, disponíveis via `env` do perfil tanto na avaliação da configuração quanto no build remoto; não são segredos. Alterar a URL no perfil exige gerar nova APK. Não há URL de produção hardcoded no cliente. `app.config.js` valida origem HTTPS sem localhost/userinfo/query/path, opt-in, REST/SignalR coerentes e projectId existente; embute a origem validada em extra. O cliente standalone aceita somente essa origem HTTPS e o applicationId autorizado. Exceção HTTP localhost permanece exclusiva do Dev com `__DEV__`, nunca do standalone.

Em EAS_BUILD=true, ausência da variável de arquivo Firebase interrompe a configuração em vez de gerar silenciosamente uma APK sem ela. O arquivo é referenciado pelo caminho fornecido pelo EAS; não copiado ao repositório. SecureStore é incluído também na variante radar. `AbortController` com timeout10s, permissões, canal silencioso e enrollment existentes foram preservados. Dotenvs e arquivos privados/nativos gerados continuam excluídos do upload EAS; `.easignore` agora também cobre `.env.*`.

Checagem HTTPS sem credenciais: `/radar/instalacao`, `/radar/instalacao/push` e `/radar/sessao` responderam **401 application/problem+json**, confirmando alcance das rotas e proteção. Foram requisições GET, sem cadastro ou sessão criada; não comprovam enrollment, push físico ou todas as flags públicas. O túnel da URL confirmada deve continuar disponível sem o PC; sua localização/disponibilidade no Debian não foi inspecionada nesta etapa.

## Gerar a APK — executar pelo operador

No PowerShell, usando a conta `guilhermedesales` com acesso ao projeto existente:

```powershell
Set-Location D:\repositorio_github\NoPonto\noponto-frontend-principal\NoPonto
eas whoami
eas project:info
eas build --platform android --profile radar
```

Confirmar projeto `@guilhermedesales/NoPonto` / ID original. Não criar outro projeto nem enviar a chave privada FCM ao chat. Antes do build, conferir no painel EAS que a variável de arquivo `NOPONTO_DEV_GOOGLE_SERVICES_FILE` existe em **development** e que FCM V1 continua associado ao pacote **nononto.dev**. Não imprimir valores de variáveis/tokens. Se já existem, não recriar credenciais/keystore desnecessariamente. O perfil contém as URLs remotas explicitamente; variáveis antigas do terminal/Metro não são a configuração deste build.

Baixar o APK do build finalizado e distribuir **o mesmo arquivo** para os aparelhos autorizados. O artefato da N5-B ou a APK Radar anterior não incorpora essas alterações automaticamente. Instalar, permitir notificações, selecionar parada/linhas e ativar Radar; cada aparelho realiza enrollment próprio no backend público, sem allowlist manual. Ao atualizar um Dev que guardava credencial do laboratório, 401 limpa a credencial inválida; ativação intencional registra a instalação na API de produção.

Validar depois, em pelo menos dois aparelhos: instalação sem Metro/USB, REST/SignalR, permissões, enrollment, sessão individual, push em segundo plano, encerramento e expiração de uma hora. Nenhum token/credencial deve ser compartilhado. Doze/force-stop e falhas de rede continuam limitações Android; tickets/receipts não provam apresentação física. Problemas de acúmulo/substituição/toque/conteúdo repetitivo permanecem para a etapa visual.

## Verificação desta etapa

Seis testes Node puros de configuração aprovados, incluindo perfil standalone, preservação Dev/produção, HTTPS/destinos e variável Firebase no build remoto. Comando, sem Expo/EAS/build:

```powershell
node --test scripts/radar-standalone-config.test.cjs
```

`git diff --check` e revisão de segredos realizados. Não executados TypeScript completo, suites do app, EAS/config CLI, build nativo/APK, Firebase remoto, instalação ou teste físico desta variante. Dependências/SDK mantidos; nenhuma correção de apresentação de notificações antecipada.
