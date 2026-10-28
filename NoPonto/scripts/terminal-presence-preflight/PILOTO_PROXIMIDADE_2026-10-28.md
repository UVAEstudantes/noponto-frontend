# Piloto exploratório de proximidade ITS_CURRENT × GTFS-RT BUS — 28/10/2026

Execução única autorizada do laboratório no commit `0c1ba31c6d236a814febd7d123d3d13b6a37848c`, em modo `--execute-authorized`. Foram usados apenas a ITS centralizada e o GTFS-RT BUS oficial. O programa emitiu somente agregados; nenhum identificador individual, coordenada bruta, timestamp físico individual, payload ou credencial é preservado neste relatório. Nenhuma segunda coleta foi feita.

## Orçamento e completude

| Medida | Resultado | Teto |
|---|---:|---:|
| GETs ITS | 2 | 10 |
| GETs GTFS | 4 | 4 |
| GETs totais | 6 | 14 |
| Corpos HTTP | 2.705.764 bytes | 50.331.648 bytes (48 MiB) |
| Duração da sonda | 106,526 s | 240 s |

`status=completed_preflight`; `trustedGeometryAvailable=false`. Cada rodada recebeu uma página ITS e terminou a paginação; as leituras ITS foram aceitas pelo laboratório como completas, inclusive o estado exigido dos dois fornecedores da ITS centralizada. Cada rodada recebeu os snapshots GTFS anterior e posterior, também aceitos como completos pelo parser do laboratório. O rótulo de rodada `complete_reads_check_alignment` **não** significa que todos os registros individuais passaram na comparação temporal. Nenhum registro foi classificado como `not_observed_in_aligned_gtfs`.

| Rodada | ITS bruto | ITS físico aceito | Rejeitado: GPS físico >180 s | GTFS antes | GTFS depois |
|---|---:|---:|---:|---:|---:|
| 1 | 538 | 529 | 9 | 2.104 | 2.103 |
| 2 | 2.104 | 2.064 | 40 | 2.088 | 2.078 |

A variação entre 538 e 2.104 registros ITS brutos em minutos distintos merece investigação posterior; o piloto não determina sua causa. Os contadores GTFS são entidades por snapshot, não veículos únicos entre snapshots.

## Recortes espaciais e identidade global

Sem `trustedPolygon`, **não há classificação de interior**. `near_terminal` significa até 200 m de uma âncora GTFS; `uncertain_location` significa posição até 1 km da âncora ou próxima de borda de perímetro, caso existisse. As contagens abaixo são **observações por rodada e instalação**, não veículos distintos no período; categorias como `trip_missing` e `route_missing` podem se sobrepor e não devem ser somadas a elas.

| Instalação | Rodada 1: próximas sem GTFS global, inconclusivas | Rodada 2: próximas sem GTFS global, inconclusivas | Outras observações relevantes |
|---|---:|---:|---|
| Campo Grande | 1 | 12 | Rodada 2: uma próxima também presente no GTFS global; uma das 12 inconclusivas trazia `servico=838`. Em localização incerta, uma observação por rodada foi vista no GTFS sob outra linha. |
| Magarça | 0 | 0 | Rodada 1: uma observação próxima com `servico=838` também presente no GTFS global; nenhuma próxima registrada na rodada 2. |
| Deodoro | 7 | 15 | Registros em localização incerta incluem correspondências globais GTFS e ausências inconclusivas. |

Para os recortes de **localização incerta**, Campo Grande teve 1 e 7 observações sem GTFS global mas inconclusivas nas rodadas 1 e 2; 2 e 7 presentes no GTFS global; e 1 por rodada presente no GTFS sob outra linha. Deodoro teve 2 e 3 inconclusivas e 5 e 8 presentes no GTFS global. Os contadores `trip_missing`/`route_missing` por instalação foram, respectivamente, 5/5 e 13/13 em Campo Grande, 1/1 e 0/0 em Magarça, 6/6 e 12/12 em Deodoro. Uma identidade ambígua foi registrada na segunda rodada fora dos agrupamentos por instalação.

Somadas como **observações por rodada**, há 35 posições ITS próximas sem identidade correspondente nos pares de snapshots GTFS consultados: 13 em Campo Grande e 22 em Deodoro. Todas passaram o filtro físico do laboratório de até 180 s, mas a saída agregada não separa quantas tinham GPS até 60 s. Logo, **zero exclusividades próximas foram confirmadas com alinhamento temporal suficiente**, e não é possível informar um número de veículos únicos ou de exclusivos próximos com GPS físico até 60 s. Nenhuma observação próxima foi rotulada `inside_trusted`.

Houve ainda uma classificação `present_other_gtfs_line` em Campo Grande em cada rodada, ambas de localização incerta. Isso confirma que a comparação procurou a identidade no GTFS global antes de alegar ausência na linha informada pela ITS. Não comprova que o mesmo veículo mudou de linha entre as rodadas. A rodada 2 incluiu uma observação SV866 em localização incerta e presente no GTFS global. Não houve linha 884 ou 866 explicitamente classificada nas contagens próximas; os agregados não permitem concluir ausência dessas linhas na instalação.

Entre as duas rodadas, o laboratório contou **317 chaves fornecedor + identidade com `datetime` físico crescente** no conjunto geral e **73** dessas com deslocamento de até 10 m. Esses são contadores globais; a saída não associa essa renovação aos candidatos próximos de Campo Grande, Magarça ou Deodoro. `datetime_servidor` não foi usado como renovação física. Não há evidência agregada de duas leituras físicas crescentes do **mesmo candidato próximo**.

## Interpretação e decisão

**Comprovado:** a ITS entregou observações físicas válidas; os dois ciclos ITS e quatro snapshots GTFS foram aceitos como completos; a comparação global detectou identidades GTFS em outra linha; houve renovação física global; e existem candidatos ITS próximos das âncoras que não foram encontrados nos pares GTFS observados.

**Hipótese ainda aberta:** alguns candidatos próximos podem representar ônibus fora de viagem ativa que o GTFS público deixa de serializar. O piloto não comprova isso para veículo específico, nem continuidade de GPS estacionado em terminal. A diferença de volume ITS entre as rodadas e os critérios individuais de alinhamento exigem cuidado.

**Inconclusivo:** nenhuma ausência GTFS perto dos terminais passou todos os critérios temporais; a idade até 60 s dos candidatos próximos não está no agregado; e não há perímetro confiável para afirmar presença dentro das instalações. Proximidade não comprova embarque, próxima saída, serviço ativo nem presença no pátio.

**Recomendação:** ainda não há evidência suficiente para iniciar a camada produtiva de presença física. A próxima coleta, se autorizada separadamente, deve produzir contadores agregados que cruzem por **mesma identidade** proximidade, `datetime` físico até 60 s, renovação física entre rodadas e ausência GTFS global temporalmente comparável. Para demonstrar presença *dentro* de terminais, primeiro revisar perímetros reais de plataformas e pátios em Campo Grande, Magarça e Deodoro. Não alterar matching, CAS, Redis, SignalR, ETA, TTL ou fonte operacional a partir deste piloto.

## Adendo posterior: limites dos dados históricos

Este relatório preserva integralmente as métricas da **única coleta realizada**. A revisão posterior do laboratório adicionou motivos agregados de inconclusão, faixas de idade e cruzamento de identidades entre rodadas para uma eventual coleta futura. **Nenhuma nova consulta foi feita.** Como os IDs e tempos individuais do primeiro piloto foram descartados, é impossível atribuir retroativamente a cada um dos 35 candidatos próximos um motivo exato ou determinar quais dos 73 avanços físicos quase estacionários ocorreram perto dos terminais. Continua sendo **zero o número de exclusividades temporalmente qualificadas comprovadas** pelo primeiro piloto; isso não afirma que a ITS não possua veículos adicionais nesses locais.
