# Validação do patch de Linhas e Horários

Testes preparados, não executados. Na pasta `NoPonto`:

```powershell
node --test src/services/tarifas.test.cjs
npm run start:local
```

O teste usa o TypeScript já instalado e um cliente HTTP simulado. Cobre campos
opcionais, ícones desconhecidos, cores inválidas, contraste 4,5:1 nos dois temas,
API antiga/futura, lista vazia, valores zero/nulo e uma consulta para valor e métodos.

## Validação visual e de ciclo de vida

1. Sem linha escolhida, verificar ausência de espaço reservado ao percurso.
   Pesquisar Ônibus/BRT/Santa Cruz: os resultados mantêm seu layout. Selecionar
   a linha e verificar 16 px entre a superfície da busca e a do percurso. Usar
   o inspetor de layout: margem nativa da View externa, sem alteração de dimensões.
2. Escolher e trocar percursos: sentido, versão, geometria, paradas e veículos
   continuam correspondentes. Confirmar nos dois temas e com fonte ampliada.
3. Comparar “Chegada Estimada” com “Tarifa”: ambos usam texto primário; o ícone
   de chegada usa ícone secundário. Conferir legibilidade clara/escura.
4. Na inspeção de rede, conferir `/tarifas/resolver?linhaId=<UUID>` e ausência
   de consulta adicional para pagamentos. Trocar de percurso dentro da mesma
   linha não deve consultar de novo. Retry faz uma nova consulta intencional.
5. Com os dados reais disponíveis, confirmar que somente os métodos retornados
   aparecem. Nomes iguais com IDs distintos devem continuar sendo duas tags.
6. Em ambiente de mock local, sem alterar backend/banco, preparar respostas:
   método só com `id`/`nome`; com `wallet`, `credit-card`, `banknote`, `landmark`,
   `smartphone` e `qr-code`; ícone desconhecido; cor ausente, `#FFF`, `#GGGGGG`;
   cores `#EA790F`, `#FFFFFF` e `#000000`. Confirmar fallback Wallet/cinza e
   contraste nos dois temas, sem inferências pelo nome.
7. Retornar `formasPagamento: []`: mostrar “Métodos de pagamento não informados”.
   Tarifa `0`: “R$ 0,00”; `null`: “Sem valor registrado”; `7.6`: “R$ 7,60”.
8. Simular rede lenta. Selecionar linha A, depois B com pagamentos diferentes;
   entregar a resposta A depois da B. Nenhum valor/tag de A deve aparecer em B.
   Repetir A → B → A e sair da tela com consulta pendente. O cancelamento e a
   proteção da geração anterior devem impedir atualizações antigas.
9. Simular HTTP 500 e erro de conexão: mostrar indisponibilidade para tarifa
   e métodos, nunca ausência de cadastro. Restaurar conexão e tocar “Tentar
   novamente”: loading substitui os dados antigos e a resposta atual preenche ambos.

Os passos de layout, interação e respostas atrasadas são manuais; o teste Node
não renderiza React Native nem comprova o ciclo de vida do componente no dispositivo.
