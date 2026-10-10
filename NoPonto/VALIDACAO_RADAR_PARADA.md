# Radar de próximos veículos — validação manual

Nenhum build, teste, lint, deploy ou comando Git foi executado durante a implementação.

## PowerShell

A partir da raiz do frontend:

```powershell
Set-Location NoPonto
npm run start:local
```

Para executar os testes preparados separadamente:

```powershell
npx --yes tsx --test src/services/radarParada.test.ts src/services/apresentacaoRadar.test.ts src/services/radarRequests.test.ts src/services/eventosParada.test.ts
```

Os fixtures são usados somente pelos testes. O componente utiliza exclusivamente a API existente.

## Roteiro no dispositivo

1. Adicione uma linha nova: os marcadores começam visíveis. Oculte-os nas configurações; o radar deve continuar funcionando. Reabra o app e confirme a preferência salva. Linhas antigas não devem ter sua preferência alterada.
2. Com localização autorizada, selecione linhas ativas do modal em uso. Somente paradas dessas linhas, sentidos e padrões, dentro de 1 km, devem ser elegíveis. Desative uma linha e confira a retirada dos seus eventos.
3. Em BRT, abra Trocar parada: plataformas com IDs distintos devem permanecer em linhas separadas, com destinos/sentidos, código e plataforma reais quando retornados pela API. Escolha o sentido desejado e confirme que os eventos não se misturam com a plataforma oposta.
4. Em modo automático, pequenos movimentos entre paradas quase equidistantes não devem alternar a seleção. Uma parada nova precisa ganhar pelo menos 60 m para substituir a atual, salvo quando a atual deixa de ser elegível.
5. Escolha manualmente a outra plataforma. Atualize o GPS: a escolha deve permanecer. Afaste-se mais de 1 km ou retire suas linhas do contexto: deve aparecer o aviso de parada fora do contexto, sem substituir a plataforma. Use Seleção automática para retomar o acompanhamento.
6. Troque o modal durante uma consulta lenta. Nenhum evento da parada/modal anterior deve aparecer sob a seleção nova. Sem localização, sem linhas ou sem previsão, confira os estados discretos.
7. Confira as duas previsões compactas: ETA válido primeiro, preferência por linhas diferentes; horários vencidos devem desaparecer. Sem ETA, exibir indisponibilidade. Sem distância operacional, omitir a distância. A distância até a parada no seletor é distância do usuário; a distância no card é exclusivamente a fornecida pelo evento.
8. Em Trem, confira Santa Cruz: saídas continuam sendo saídas; programação não recebe o rótulo Ao vivo. Horários estimados usam estimatedAt; programação usa scheduledAt.
9. Toque em um evento com identidade renderizada: somente o veículo correspondente deve receber foco. Eventos sem referência continuam visíveis e não executam foco por aproximação de linha.
10. Use Ver todos: abrir o ParadaSheet existente, com a mesma parada e eventos do radar. Atualize o GPS com o sheet aberto; o cabeçalho não pode permanecer na parada antiga mostrando eventos de outra. Feche o sheet: o painel retorna ao estado anterior.
11. Recolha o painel: deve deslizar para a lateral correspondente à preferência destro/canhoto. A aba arredondada reabre o painel. Confira toques livres no restante do mapa.
12. Repita em light e dark, telas estreitas e orientação horizontal. Em telas de pouca altura, o compacto mostra apenas um evento. O painel fica acima da coluna dos controles para preservar os dois botões atuais, sem mover a navegação.
13. Confira que busca, dropdown e lista de linhas ocultam temporariamente o painel sem alterar esses componentes. Adicionar linha continua fechando a lista e focando a busca.
14. Inspecione a rede: uma parada monitorada por vez; próximo polling 30 s após concluir o anterior. Consultas simultâneas à mesma parada compartilham o pedido. Timeout de 12 s; falhas permitem nova tentativa. A contagem usa relógio local e não pedidos a cada segundo.
15. Mude de aba ou coloque o app em segundo plano: não devem iniciar novas consultas do radar. Pedidos já em andamento podem concluir até o timeout, mas respostas de contexto anterior são ignoradas. Ao voltar, deve ocorrer atualização imediata.

## Limitações e decisões

- Escolha manual dura enquanto esta instância da tela está montada; não foi criada persistência adicional.
- O contrato de ocorrências V2 traz paradaId, codigoParada, nome e coordenadas. Plataforma, tipoLocal e paradaPaiId pertencem ao DTO separado ParadaV2, obtido pelo endpoint existente GET /paradas/{id}. A metadata tem cache limitado a 100 IDs; a parada monitorada é consultada individualmente e o seletor carrega até 12 candidatos próximos, dois por vez, ao abrir. Demais candidatos usam códigos/destinos reais; a plataforma é carregada quando selecionados. Não há polling de metadata, agrupamento por coordenadas ou nomes inventados.
- Metrô não foi habilitado e não há previsões demonstrativas.
- O novo painel não inicia outro acompanhamento GPS nem altera o runtime ferroviário.
- A posição aberta reserva espaço acima dos dois controles atuais; essa folga é necessária para preservar ambos sem redesenhar o mapa.
- Fidelidade visual, teclado, Safe Area, animação e rede precisam ser confirmados no dispositivo. Os testes preparados não substituem essa validação.
