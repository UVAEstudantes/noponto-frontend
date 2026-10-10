# Favoritos — Etapa A

Implementação e cobertura preparadas; nenhum teste/build/lint/Git foi executado.

## Auditoria e separação

`index.tsx` mantém linhas selecionadas e suas configurações na chave existente
`@linhasSelecionadas`, com hidratação protegida. `LinhasContainer` recebia somente
linhas do modal ativo. `app/favoritos.tsx` contém a funcionalidade reservada Rotinas
e foi preservado. O tema já usa um provider; para favoritos, uma coleção externa
única via `useSyncExternalStore` permite compartilhar estado sem mudar providers
ou navegação. Reutilizados AsyncStorage e `identidadeModalMapa`.

Favoritos têm UUID, código, nome, modal, modalId opcional e adicionadaEm ISO.
Chave separada: `@linhasFavoritas`. Não armazenam cor, ativa, sentido ou padrão
inventado. Não há limite de dez favoritos. Desfavoritar não chama remoção de linha;
remover do mapa não chama remoção de favorito. Não houve migração de dados antigos.

Hidratação deduplicada e sem gravação inicial. JSON/schema inválido ou erro de
leitura bloqueiam alterações, preservam a chave e oferecem retry. Falha de escrita
mantém a mudança otimista em memória com mensagem de pendência/retry. Gravações
serializadas garantem que snapshots antigos não terminem depois dos novos.
Encerrar o app antes de concluir a gravação ou com erro de escrita pode perder
somente mudanças ainda não salvas; validar esse cenário no aparelho.

## Comandos PowerShell na raiz do workspace

```powershell
Set-Location .\NoPonto
node --test src/services/favoritos.test.cjs
npm run start:local
```

O teste usa TypeScript já instalado e storage simulado. Cobre toggle/refavoritar,
deduplicação por UUID, códigos iguais, quatro modais, mais de dez favoritos,
reabertura, hidratação concorrente, JSON inválido, falhas de leitura/escrita,
retry, escrita lenta e atualização compartilhada. Não renderiza React Native.

## Roteiro manual

1. Em Linhas e Horários, escolher uma linha sem escolher percurso. Conferir
   estrela vazada; tocar e conferir preenchimento dourado/animação/área de 44 px.
   Desfavoritar e refavoritar: somente um item, sem exigir percurso.
2. Favoritar Ônibus, SV866/BRT e Santa Cruz/Trem. Incluir Metrô conforme a
   disponibilidade atual e linhas com códigos iguais e UUIDs diferentes.
   Conferir favoritos após fechar totalmente o app e reabrir.
3. No mapa, abrir Linhas no Mapa e Favoritos: todos os modais juntos, ícones/cores
   próprios, estrela preenchida e código/nome. Favorita ainda não selecionada deve
   indicar “Não adicionada ao mapa”, sem aparecer automaticamente no mapa.
4. Desfavoritar nessa lista e voltar para Linhas: estrela já vazada. Repetir
   entre telas sem reiniciar. Remover todos e conferir o estado vazio.
5. Selecionar e configurar uma favorita: cor, ativa/inativa, sentido e paradas.
   Desfavoritar: continua selecionada com configurações idênticas. Refavoritar
   e remover somente do mapa: continua na coleção de favoritos.
6. Alternar Favoritos/visualização normal tocando no botão e nos tabs de modal.
   Abrir/fechar Favoritos não muda o modal ativo, geometrias, realtime ou Radar.
   O seletor normal mantém sua seleção; tocar em um modal volta à lista normal.
7. Validar claro/escuro, fonte ampliada, nomes longos, rolagem, limite de dez
   selecionadas e quantidade de favoritos superior a dez. Favoritos não exibe
   o comando Limpar que remove linhas selecionadas.
8. Em ambiente local simulado, atrasar a leitura: nenhuma gravação inicial de []
   e estrela desabilitada até hidratar. Simular falha de getItem/JSON inválido:
   mensagem/retry e chave intacta; não resetar dados automaticamente.
9. Simular falha de setItem: estado compartilhado imediato, mensagem de mudanças
   não salvas e retry. Restaurar storage, tocar retry, encerrar/reabrir e conferir.
   Simular escrita lenta com vários toques rápidos: o último estado deve persistir.

## Etapa B

Usar a identidade favorita para resolver/adicionar explicitamente linhas ao mapa,
reutilizando as configurações já salvas e respeitando o limite de selecionadas.
Será necessário separar filtro visual da lista e contexto multimodal do mapa,
coordenar inscrições e filtros rodoviários/ferroviários e definir o contexto do
Radar. Nada disso foi ativado nesta etapa; favoritas não selecionadas não têm
geometria, sentido, versão ou assinatura realtime gerados pela coleção.

Arquivos de produção: `app/linhas.tsx`, `app/index.tsx`,
`src/components/mapaComponents/linhasContainer.tsx`, `src/services/favoritos.ts`,
`src/hooks/useFavoritos.ts`, `src/components/botaoFavorito.tsx` e
`src/components/estadoFavoritos.tsx`. Demais arquivos: este roteiro e o teste.
