import test from 'node:test';
import assert from 'node:assert/strict';
import { criarPreviaNotificacaoRadar as previa, type EntradaPreviaNotificacaoRadar } from './previaNotificacaoRadar';
import { chaveContextoRadar, type ParadaRadar } from './radarParada';
import { adaptarPreviaRadarNativa } from './notificacaoRadarNativa';
import { configurarRadarRemoto } from './radarRemotoContexto';
import type { EventoParadaDto } from './eventosParada';
import type { LinhaSelecionadaInfo } from '../hooks/useMobilidadeRio';
import type { ItinerarioLinha } from '../types/transporte';
import type { TerminalPresence } from './terminalTracking';
import type { ItinerarioPadraoVersaoV2 } from '../types/estruturaV2';

const agora = Date.parse('2026-11-06T12:00:00Z');
const linha = (linhaId: string): LinhaSelecionadaInfo => ({ linhaId, linhaCodigo: linhaId,
  nomeExibicao: linhaId, modal: 'onibus', cor: '#ffffff', ativa: true,
  modoSentido: 'ida', mostrarParadas: true });
const parada = (id = 'parada', sentidoId = 'ida'): ParadaRadar => ({
  parada: { paradaId: id, nome: id, latitude: 0, longitude: 0, ordem: 1, posicaoLinha: 0 },
  distancia: 0, vinculos: ['A', 'C'].map(linhaId => ({ linhaId, sentidoId,
    padraoVersaoId: `${linhaId}-${sentidoId}-v1`, destino: sentidoId })),
});
const itinerario = (linhaId: string, sentidoId = 'ida'): ItinerarioLinha => ({
  linha: linhaId, modal: 'onibus', segmentos: [], padroesV2: [{ sentidoId,
    sentidoNome: sentidoId, padraoVersaoId: `${linhaId}-${sentidoId}-v1`,
    padraoOperacionalId: `${linhaId}-${sentidoId}-op`, rotulo: linhaId,
    segmentoIndice: 0, paradas: [parada().parada, parada('outra').parada] }],
});
const evento = (eventId: string, linhaId = 'A', secondsUntilEvent: number | null = 120): EventoParadaDto => ({
  eventId, linhaId, codigoLinha: linhaId, vehicleId: `veiculo-${eventId}`, secondsUntilEvent,
  paradaId: 'parada', sentidoId: 'ida', padraoVersaoId: `${linhaId}-ida-v1`,
  padraoOperacionalId: `${linhaId}-ida-op`, ocorrenciaParadaPadraoId: `${linhaId}-oc`,
  modal: 'onibus', tipoRota: 'onibus', eventType: 'ARRIVAL', source: 'RealtimeEstimated',
  quality: 'OperationalEstimate', lastRealtimeEvidenceUtc: new Date(agora).toISOString(), isEstimated: true,
});
function entrada(eventos: EventoParadaDto[] = []): EntradaPreviaNotificacaoRadar {
  return { parada: parada(), modal: 'onibus', linhas: [linha('A'), linha('C')],
    itinerarios: { A: itinerario('A'), C: itinerario('C') }, realtime: {}, presencasFisicas: [],
    consulta: { eventos, recebidoEm: agora, agora, temResposta: true,
      contextoConsulta: chaveContextoRadar(parada(), 'onibus'), statusConsulta: 'sucesso' } };
}
const estrutura = (): ItinerarioPadraoVersaoV2 => ({ linhaId: 'A', codigoLinha: 'A', nomeLinha: 'A',
  sentidoId: 'ida', nomeSentido: 'ida', padraoOperacionalId: 'operacao-realtime', chavePadrao: 'p',
  tipoServico: 'regular', padraoVersaoId: 'versao-realtime', numeroVersao: 2, topologia: 'Linear',
  comprimentoMetros: 1000, ehVersaoAtual: true, geometria: { tipo: 'LineString', coordenadas: [] },
  ocorrencias: [{ ocorrenciaId: 'oc', ordem: 1, paradaId: 'parada', codigoParada: 'parada',
    nome: 'parada', latitude: 0, longitude: 0, posicaoLinha: 0 }] });
const fisico = (state: TerminalPresence['state'] = 'No terminal'): TerminalPresence => ({
  key: 'A:veiculo-a', lineId: 'A', code: 'A', order: 'veiculo-a', terminalId: 'origem',
  terminalName: 'Origem', physicalAt: agora, validUntil: agora + 60000, state,
  knownPattern: 'A-ida-v1', corridors: [], operationalConfirmed: false,
});

test('diagnostico distingue mapa sem evento metadado ausente e corte de vagas', () => {
  const e=entrada([evento('a','A',60),evento('c1','C',300),evento('c2','C',360),evento('c3','C',420)]);
  e.linhasPrioritarias=['C'];e.presencasFisicas=[{...fisico('A caminho'),order:'somente-mapa'}];
  const motivos=new Map<string,string>();e.diagnosticar=d=>motivos.set(d.eventoId,d.motivo);
  const p=previa(e)!;
  assert.equal(p.candidatos.length,4);assert.equal(motivos.get('a'),'incluido_na_notificacao');
  assert.equal(motivos.get('c3'),'elegivel_fora_das_tres_vagas');
  assert.equal(motivos.get('mapa:A:somente-mapa'),'mapa_estimativa_fisica_sem_evento_da_parada');
  e.itinerarios={A:{...itinerario('A'),padroesV2:itinerario('A').padroesV2!.map(p=>({...p,padraoOperacionalId:''}))},C:itinerario('C')};
  previa(e);assert.equal(motivos.get('a'),'metadado_operacional_ausente');
  // O callback registra a ausência de metadado antes do filtro N1; preserva ambos na auditoria direta.
  const registros:string[]=[];e.diagnosticar=d=>{if(d.eventoId==='a')registros.push(d.motivo);};previa(e);
  assert.ok(registros.includes('metadado_operacional_ausente'));
});

test('terminal apresenta espera observada sem misturar origem sentido idade ou ETA', () => {
  const e=entrada();const v={...fisico(),terminalId:'parada',terminalName:'Terminal',dwellSince:agora-120000,
    corridors:[{pattern:'A-ida-v1',originId:'parada',originName:'Terminal',stops:[],coords:[] as [number,number][]}]};
  e.presencasFisicas=[v,{...v,key:'segundo',order:'outro',dwellSince:undefined}];
  const p=previa(e)!;assert.equal(p.candidatos.length,0);assert.equal(p.conteudo.terminal!.length,2);
  assert.equal(p.conteudo.terminal![0].desde,agora-120000);assert.equal(p.conteudo.terminal![1].desde,undefined);
  for(const alteracao of [{terminalId:'outra'}, {physicalAt:agora-300001}, {knownPattern:'A-volta-v1'},
    {validUntil:agora-1}, {state:'A caminho' as const}, {state:'Na região da origem' as const}]){
    e.presencasFisicas=[{...v,...alteracao}];assert.equal(previa(e)!.conteudo.terminal!.length,0,JSON.stringify(alteracao));
  }
  e.presencasFisicas=[{...v,dwellSince:agora+1}];assert.equal(previa(e)!.conteudo.terminal![0].desde,undefined);
  e.presencasFisicas=[v];e.consulta.agora=agora+300001;assert.equal(previa(e)!.conteudo.terminal,undefined);
});

test('saida prevista e chegada ao terminal preservam categorias de eventos distintos', () => {
  const e=entrada([{...evento('saida','A',300),eventType:'DEPARTURE',stationRole:'Origin',scheduledAt:new Date(agora+300000).toISOString()},evento('chega','C',180)]);
  const p=previa(e)!;
  assert.deepEqual(p.candidatos.map(c=>c.evento.eventType),['ARRIVAL','DEPARTURE']);
  assert.equal(p.conteudo.terminal!.length,0);
});

test('integra dois veiculos de A e destaca C prioritaria sem alterar os eventos', () => {
  const eventos = [evento('a2', 'A', 180), evento('c', 'C', 300), evento('a1', 'A', 60)];
  const e = entrada(eventos);
  e.linhasPrioritarias = ['C', 'fora'];
  const original = JSON.stringify(e);
  const p = previa(e)!;
  assert.equal(p.conteudo.destaque?.id, 'c');
  assert.deepEqual(p.contexto.linhasPrioritarias, ['C']);
  assert.deepEqual(p.conteudo.alternativas.map(c => [c.id, c.veiculoId, c.etaSeg]),
    [['a1', 'veiculo-a1', 60], ['a2', 'veiculo-a2', 180]]);
  assert.equal(p.candidatos.find(c => c.evento.eventId === 'a2')?.evento, eventos[0]);
  assert.equal(p.candidatos.find(c => c.evento.eventId === 'a2')?.evento.ocorrenciaParadaPadraoId, 'A-oc');
  assert.equal(JSON.stringify(e), original);
});

test('troca de parada ou sentido descarta snapshot anterior e respeita novo contexto', () => {
  const inicial = entrada([evento('antigo')]);
  const original = previa(inicial)!;
  for (const alvo of [parada('outra'), parada('parada', 'volta')]) {
    const e = { ...inicial, parada: alvo };
    assert.equal(previa(e), null); // Consulta ainda pertence ao contexto anterior.
    e.consulta = { ...inicial.consulta, contextoConsulta: chaveContextoRadar(alvo, e.modal) };
    e.itinerarios = { A: itinerario('A', alvo.vinculos[0].sentidoId), C: itinerario('C', alvo.vinculos[0].sentidoId) };
    assert.equal(previa(e)!.conteudo.destaque, null);
    e.consulta = { ...e.consulta, eventos: [{ ...evento('novo'), paradaId: alvo.parada.paradaId,
      sentidoId: alvo.vinculos[0].sentidoId, padraoVersaoId: alvo.vinculos[0].padraoVersaoId,
      padraoOperacionalId: `A-${alvo.vinculos[0].sentidoId}-op` }] };
    const p = previa(e)!;
    assert.equal(p.conteudo.destaque?.id, 'novo');
    assert.notEqual(p.conteudo.chaveContexto, original.conteudo.chaveContexto);
    assert.equal(p.contexto.paradaId, alvo.parada.paradaId);
    assert.equal(p.contexto.vinculos[0].sentidoId, alvo.vinculos[0].sentidoId);
  }
});

test('preserva recebidoEm e rejeita idade antiga ETA ausente e evidencia vencida', () => {
  const e = entrada([evento('relativo', 'A', 180), { ...evento('absoluto'),
    estimatedAt: new Date(agora + 240000).toISOString() }, evento('sem-eta', 'C', null),
    { ...evento('evidencia-antiga'), lastRealtimeEvidenceUtc: new Date(agora - 300001).toISOString() }]);
  e.consulta.agora = agora + 30000;
  assert.deepEqual(previa(e)!.conteudo.alternativas.map(c => [c.id, c.etaSeg, c.previstoEm]),
    [['relativo', 150, agora + 180000], ['absoluto', 210, agora + 240000]]);
  const antigo = entrada([evento('a', 'A', 600)]);
  antigo.consulta.agora = agora + 300001;
  assert.deepEqual(previa(antigo)!.candidatos, []);
});

test('terminal e presenca nao confirmada nao viram previsao de chegada', () => {
  const e = entrada([evento('a'), evento('c', 'C')]);
  e.presencasFisicas = [fisico()];
  assert.deepEqual(previa(e)!.candidatos.map(c => c.evento.eventId), ['c']);
  e.presencasFisicas = [fisico('Na região da origem')];
  assert.deepEqual(previa(e)!.candidatos.map(c => c.evento.eventId), ['c']);
  e.presencasFisicas = [{ ...fisico('A caminho'), operationalConfirmed: true }];
  assert.deepEqual(previa(e)!.candidatos.map(c => c.evento.eventId), ['a', 'c']);
  e.consulta.eventos = [];
  assert.deepEqual(previa(e)!.candidatos, []);
});

test('sem linha elegivel ou sem metadados nao inventa vinculos', () => {
  const base = entrada([evento('a')]);
  for (const alteracao of [{ linhas: [] }, { linhas: base.linhas.map(l => ({ ...l, ativa: false })) },
    { linhas: base.linhas.map(l => ({ ...l, modal: 'brt' as const })) }, { itinerarios: {} },
    { parada: { ...base.parada!, vinculos: [] } }, { parada: null }]) {
    assert.equal(previa({ ...base, ...alteracao }), null);
  }
});

test('completa padrao por estrutura realtime sem admitir outra operacao ou versao', () => {
  const e = entrada();
  const r = estrutura();
  e.parada = { ...parada(), vinculos: [{ linhaId: 'A', sentidoId: 'ida',
    padraoVersaoId: r.padraoVersaoId, destino: 'ida' }] };
  e.realtime = { [r.padraoVersaoId]: r };
  e.itinerarios = {};
  // Sem itinerário estático, o Radar não inventa o mapeamento ida/volta.
  e.linhas = [{ ...linha('A'), modoSentido: 'ambos' }];
  e.consulta.contextoConsulta = chaveContextoRadar(e.parada, e.modal);
  const valido = { ...evento('certo'), padraoVersaoId: r.padraoVersaoId, padraoOperacionalId: r.padraoOperacionalId };
  e.consulta.eventos = [valido, { ...valido, eventId: 'outra-operacao', padraoOperacionalId: 'outra' },
    { ...valido, eventId: 'outra-versao', padraoVersaoId: 'outra' }];
  const p = previa(e)!;
  assert.equal(p.contexto.vinculos[0].padraoOperacionalId, 'operacao-realtime');
  assert.deepEqual(p.candidatos.map(c => c.evento.eventId), ['certo']);
});

test('pausa e ausencia de resposta limpam previa mas erro preserva cache valido', () => {
  const e = entrada([evento('a')]);
  for (const alteracao of [{ statusConsulta: 'pausado' as const }, { statusConsulta: 'indisponivel' as const },
    { temResposta: false }]) {
    assert.equal(previa({ ...e, consulta: { ...e.consulta, ...alteracao } }), null);
  }
  e.consulta.statusConsulta = 'erro';
  assert.equal(previa(e)!.conteudo.destaque?.id, 'a');
  e.consulta.statusConsulta = 'atualizando';
  assert.equal(previa(e)!.conteudo.destaque?.id, 'a');
});

test('encaminha politica N1 e conserva identidade ferroviaria sem vehicleId', () => {
  const e = entrada([{ ...evento('run', 'A', 700), modal: 'trem', tipoRota: 'trem',
    vehicleId: null, railVehicleId: 'rail-1', expectedRunId: 'run-1', eventType: 'DEPARTURE',
    source: 'ScheduledEstimated', quality: 'ScheduleOnly', lastRealtimeEvidenceUtc: null }]);
  e.modal = 'trem';
  e.linhas = [{ ...linha('A'), modal: 'trem' }];
  e.itinerarios = { A: { ...itinerario('A'), modal: 'trem' } };
  e.consulta.contextoConsulta = chaveContextoRadar(e.parada, e.modal);
  assert.equal(previa(e)!.conteudo.destaque, null);
  e.politica = { janelaSegundos: 900 };
  assert.equal(previa(e)!.conteudo.destaque?.veiculoId, 'rail-1');
  assert.equal(previa(e)!.conteudo.destaque?.tipo, 'DEPARTURE');
  assert.equal(previa(e)!.conteudo.destaque?.qualidade, 'Programado');
});

test('preserva nome ferroviario extenso e metadados do payload nativo sem truncar para codigo de onibus', () => {
  const codigoLinha = 'Ramal Santa Cruz - Serviço Expresso';
  const ferroviario: EventoParadaDto = { ...evento('rail-item', 'A', 300), codigoLinha,
    modal: 'trem', tipoRota: 'trem', vehicleId: null, railVehicleId: 'rail-vehicle',
    expectedRunId: 'expected-run', scheduledStopId: 'scheduled-stop', trainCode: 'T-12',
    lineName: 'Ramal Santa Cruz', destinationName: 'Central do Brasil', operationalStatus: 'Estimated' };
  const e = entrada([ferroviario]);
  e.modal = 'trem';
  e.linhas = [{ ...linha('A'), modal: 'trem' }];
  e.itinerarios = { A: { ...itinerario('A'), modal: 'trem' } };
  e.consulta.contextoConsulta = chaveContextoRadar(e.parada, 'trem');
  e.politica = { janelaSegundos: 900 };

  const result = previa(e)!;
  const native = adaptarPreviaRadarNativa(result, []);
  assert.equal(result.candidatos[0].evento.codigoLinha, codigoLinha);
  assert.equal(result.candidatos[0].evento.operationalStatus, 'Estimated');
  assert.equal(result.candidatos[0].evento.expectedRunId, 'expected-run');
  assert.equal(result.candidatos[0].evento.scheduledStopId, 'scheduled-stop');
  assert.equal(native.linhas[0].codigo, codigoLinha);
  assert.equal(native.linhas[0].eventType, 'ARRIVAL');
});

test('remove linha piloto nao selecionada e sentido ampliado pelo catalogo', () => {
  const e = entrada([evento('a'), evento('c', 'C'), { ...evento('a-volta'), sentidoId: 'volta',
    padraoVersaoId: 'A-volta-v1', padraoOperacionalId: 'A-volta-op' }]);
  e.parada!.vinculos.push({ linhaId: 'A', sentidoId: 'volta', padraoVersaoId: 'A-volta-v1', destino: 'volta' });
  e.consulta.contextoConsulta = chaveContextoRadar(e.parada, e.modal);
  e.itinerarios.A!.padroesV2!.push(...itinerario('A', 'volta').padroesV2!);
  e.linhas = [linha('A')];
  assert.deepEqual(previa(e)!.candidatos.map(c => c.evento.eventId), ['a']);
  e.linhas = [{ ...linha('A'), modoSentido: 'volta' }];
  assert.deepEqual(previa(e)!.candidatos.map(c => c.evento.eventId), ['a-volta']);
  e.linhas = [{ ...linha('A'), modoSentido: 'ambos' }];
  assert.deepEqual(previa(e)!.candidatos.map(c => c.evento.eventId).sort(), ['a', 'a-volta']);
});

test('BRT percorre o Radar remoto e a apresentação nativa sem perder linha, sentido, estação ou veículo', () => {
  const e = entrada([{ ...evento('brt-10'), codigoLinha: '10', tipoRota: 'brt', vehicleId: 'BRT-123' }]);
  e.modal = 'brt';
  e.linhas = e.linhas.map(l => ({ ...l, linhaCodigo: '10', modal: 'brt' }));
  e.itinerarios = Object.fromEntries(Object.entries(e.itinerarios).map(([id, route]) =>
    [id, route && { ...route, modal: 'brt' }]));
  e.consulta.contextoConsulta = chaveContextoRadar(e.parada, 'brt');

  const result = previa(e)!;
  const event = result.candidatos[0].evento;
  const native = adaptarPreviaRadarNativa(result, []);
  const remote = configurarRadarRemoto(e, ['A'], [], 10);

  assert.deepEqual(remote?.contextos, [{ linhaId: 'A', sentidoId: 'ida',
    padraoOperacionalId: 'A-ida-op', padraoVersaoId: 'A-ida-v1' }]);
  assert.equal(event.tipoRota, 'brt');
  assert.equal(event.codigoLinha, '10');
  assert.equal(event.sentidoId, 'ida');
  assert.equal(event.vehicleId, 'BRT-123');
  assert.equal(native.paradaNome, 'parada');
  assert.deepEqual(native.linhas.map(l => [l.codigo, l.principal]), [['10', '2 min']]);
});
