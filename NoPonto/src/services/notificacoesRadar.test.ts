import test from 'node:test';
import assert from 'node:assert/strict';
import { filtrarCandidatosNotificacao as filtrar, produzirConteudoNotificacao as produzir,
  compararConteudoNotificacao as comparar, selecionarItensNotificacao, type ContextoNotificacaoRadar } from './notificacoesRadar';
import type { EventoParadaDto } from './eventosParada';
import type { TerminalRadarVehicle } from './terminalTracking';

const now = Date.parse('2026-11-05T12:00:00Z');
const contexto: ContextoNotificacaoRadar = { paradaId: 'stop', linhasPrioritarias: ['C'],
  vinculos: ['A', 'B', 'C', 'D'].map(linhaId => ({ linhaId, sentidoId: 'ida',
    padraoVersaoId: 'v1', padraoOperacionalId: 'p1' })) };
const evento = (id: string, linhaId: string, secondsUntilEvent: number | null = 120): EventoParadaDto => ({
  eventId: id, linhaId, codigoLinha: linhaId, vehicleId: id, secondsUntilEvent,
  paradaId: 'stop', sentidoId: 'ida', padraoVersaoId: 'v1', padraoOperacionalId: 'p1',
  ocorrenciaParadaPadraoId: 'oc', modal: 'onibus', tipoRota: 'onibus', eventType: 'ARRIVAL',
  source: 'RealtimeEstimated', quality: 'OperationalEstimate', isEstimated: true,
});
const conteudo = (eventos: EventoParadaDto[], ctx = contexto, recebido = now, agora = now) =>
  produzir(ctx, filtrar(eventos, ctx, recebido, agora), recebido, agora);

test('C permanece em destaque e alternativas A B D preservam veiculos e ETA', () => {
  const eventos = [evento('d', 'D', 400), evento('a2', 'A', 180), evento('c', 'C', 300),
    evento('b', 'B', 90), evento('a1', 'A', 60), evento('fora', 'X', 10)];
  const resultado = conteudo(eventos);
  assert.equal(resultado.destaque?.id, 'c');
  assert.deepEqual(resultado.alternativas.map(c => [c.id, c.veiculoId, c.etaSeg]),
    [['a1', 'a1', 60], ['b', 'b', 90], ['a2', 'a2', 180], ['d', 'd', 400]]);
  assert.deepEqual(conteudo([...eventos].reverse()), resultado);
  const multiplas = conteudo(eventos, { ...contexto, linhasPrioritarias: ['A', 'C'] });
  assert.deepEqual(multiplas.prioridades.map(c => c.id), ['a1', 'a2', 'c']);
  assert.equal(multiplas.destaque?.id, 'a1');
});

test('ETA ausente antigo invalido e evidencia obsoleta nao sao candidatos', () => {
  for (const e of [evento('sem', 'A', null), evento('passado', 'A', -1),
    evento('nan', 'A', NaN), { ...evento('antigo', 'A'), lastRealtimeEvidenceUtc: new Date(now - 300001).toISOString() },
    { ...evento('invalido', 'A'), lastRealtimeEvidenceUtc: 'invalid' }]) {
    assert.deepEqual(filtrar([e], contexto, now, now), [], e.eventId);
  }
  assert.deepEqual(filtrar([evento('a', 'A')], contexto, now - 300001, now), []);
  assert.deepEqual(filtrar([evento('a', 'A')], contexto, now + 1, now), []);
  assert.equal(filtrar([evento('a', 'A')], contexto, now - 300000, now - 180000).length, 1);
});

test('janela inclui dez minutos permite configuracao e detecta saida', () => {
  assert.equal(filtrar([evento('a', 'A', 600)], contexto, now, now).length, 1);
  assert.deepEqual(filtrar([evento('a', 'A', 601)], contexto, now, now), []);
  assert.equal(filtrar([evento('a', 'A', 601)], contexto, now, now, { janelaSegundos: 900 }).length, 1);
  assert.equal(comparar(conteudo([evento('a', 'A', 600)]), conteudo([evento('a', 'A', 601)])).motivo, 'candidatos');
});

test('rejeita parada sentido padrao e versao incompativeis', () => {
  for (const alteracao of [{ paradaId: 'outra' }, { sentidoId: 'volta' },
    { padraoVersaoId: 'v2' }, { padraoOperacionalId: 'p2' }]) {
    assert.deepEqual(filtrar([{ ...evento('a', 'A'), ...alteracao }], contexto, now, now), []);
  }
  const ctx = { ...contexto, vinculos: [...contexto.vinculos, { ...contexto.vinculos[0], padraoVersaoId: 'v2' }] };
  assert.equal(filtrar([evento('a', 'A'), { ...evento('b', 'A'), padraoVersaoId: 'v2' }], ctx, now, now).length, 2);
  for (const ctx of [{ ...contexto, paradaId: 'outra' }, { ...contexto,
    vinculos: contexto.vinculos.map(v => ({ ...v, sentidoId: 'volta' })) }]) {
    assert.equal(comparar(conteudo([]), conteudo([], ctx)).motivo, 'contexto');
  }
});

test('terminal presenca isolada e viagem nao confirmada nao anunciam chegada', () => {
  const fisico: TerminalRadarVehicle = { key: 'A:a', order: 'a', lineId: 'A', code: 'A',
    physicalAt: now, validUntil: now + 60000, terminalId: 'origin', terminalName: 'Terminal',
    state: 'No terminal', knownPattern: 'p1', corridors: [], operationalConfirmed: false };
  assert.deepEqual(filtrar([], contexto, now, now, {}, [fisico]), []);
  assert.deepEqual(filtrar([evento('a', 'A')], contexto, now, now, {}, [fisico]), []);
  assert.deepEqual(filtrar([evento('a', 'A')], contexto, now, now, {}, [{ ...fisico, state: 'A caminho' }]), []);
  assert.equal(filtrar([evento('a', 'A')], contexto, now, now, {},
    [{ ...fisico, state: 'A caminho', operationalConfirmed: true }]).length, 1);
  const saida = conteudo([{ ...evento('a', 'A', 0), eventType: 'DEPARTURE',
    stationRole: 'Origin', source: 'ScheduledEstimated', quality: 'ScheduleOnly' }]);
  assert.equal(saida.destaque?.tipo, 'DEPARTURE');
  assert.equal(saida.destaque?.qualidade, 'Programado');
  assert.equal(saida.destaque?.confirmacao, 'previsao');
});

test('comparacao ignora oscilacao e contagem regressiva mas detecta mudanca relevante', () => {
  const antes = conteudo([evento('a', 'A', 300)]);
  assert.equal(comparar(null, antes).relevante, true);
  assert.equal(comparar(null, conteudo([])).relevante, false);
  assert.equal(comparar(antes, conteudo([evento('a', 'A', 359)])).relevante, false);
  assert.equal(comparar(antes, conteudo([evento('a', 'A', 360)])).motivo, 'previsao');
  assert.equal(comparar(antes, conteudo([evento('a', 'A', 300)], contexto, now, now + 30000)).relevante, false);
  assert.equal(comparar(antes, conteudo([evento('novo', 'A', 300)])).motivo, 'candidatos');
  assert.equal(comparar(antes, conteudo([])).relevante, true);
  assert.equal(comparar(antes, conteudo([evento('a', 'A', 330)]), { mudancaMinimaSegundos: 30 }).relevante, true);
});

test('troca pequena na ordem de alternativas nao dispara alerta', () => {
  const antes = conteudo([evento('a', 'A', 100), evento('b', 'B', 110)]);
  const depois = conteudo([evento('a', 'A', 115), evento('b', 'B', 105)]);
  assert.deepEqual(depois.alternativas.map(c => c.id), ['b', 'a']);
  assert.equal(comparar(antes, depois).relevante, false);
});

const cenarios: [string, [string, string, number][], string[], string[], number][] = [
  ['884 em dois minutos permanece com 838 prioritaria em cinco e seis', [['884a','884',120],['838a','838',300],['838b','838',360]], ['838'], ['884a','838a','838b'], 0],
  ['884 iminente permanece entre tres veiculos da 838 prioritaria', [['838a','838',300],['838b','838',360],['838c','838',420],['884a','884',60]], ['838'], ['884a','838a','838b'], 1],
  ['tres linhas prioritarias preservam nao prioritaria em um minuto', [['a','838',300],['b','855',360],['c','777',420],['d','884',60]], ['838','855','777'], ['d','a','b'], 1],
  ['prioridade sem veiculo elegivel libera todas as vagas gerais', [['a','884',60],['b','855',120],['c','855',180]], ['838'], ['a','b','c'], 0],
  ['duas chegadas iminentes e prioridade posterior ocupam tres vagas', [['a','884',60],['b','855',120],['c','838',540]], ['838'], ['a','b','c'], 0],
  ['mesmo ETA desempata identidade e diversidade sem duplicar veiculo', [['a','838',120],['b','838',120],['c','884',120],['d','855',120]], ['838'], ['a','c','d'], 1],
  ['somente uma linha util preserva seus tres veiculos distintos', [['a','838',60],['b','838',120],['c','838',180]], ['838'], ['a','b','c'], 0],
];
for (const [nome, dados, prioridades, esperados, adicionais] of cenarios) test(nome, () => {
  const ctx = { ...contexto, linhasPrioritarias: prioridades,
    vinculos: [...new Set(dados.map(d => d[1]))].map(linhaId => ({ ...contexto.vinculos[0], linhaId })) };
  const eventos = dados.map(([id, linha, eta]) => evento(id, linha, eta));
  const c = conteudo(eventos, ctx);
  const r = selecionarItensNotificacao(c);
  assert.deepEqual(r.itens.map(i => i.id), esperados); assert.equal(r.adicionais, adicionais);
  assert.deepEqual(selecionarItensNotificacao(conteudo(eventos.reverse(), ctx)), r);
});

test('mesmo veiculo em eventos diferentes nao ocupa duas vagas', () => {
  const c = conteudo([evento('a','A',60), {...evento('b','A',90), vehicleId:'a'}, evento('c','B',120)]);
  assert.deepEqual(selecionarItensNotificacao(c).itens.map(i => i.id), ['a','c']);
});

test('diagnostico explica cada filtro sem modificar elegibilidade', () => {
  const eventos = [evento('ok','A'),evento('sem','A',null),evento('fora','A',601),
    {...evento('parada','A'),paradaId:'outra'}, {...evento('sentido','A'),sentidoId:'volta'},
    {...evento('versao','A'),padraoVersaoId:'v2'}, {...evento('padrao','A'),padraoOperacionalId:'outro'},
    {...evento('gps','A'),lastRealtimeEvidenceUtc:new Date(now-300001).toISOString()}, evento('linha','X')];
  const motivos = new Map<string,string>();
  const resultado = filtrar(eventos, contexto, now, now, {}, [], d => motivos.set(d.eventoId,d.motivo));
  assert.deepEqual(resultado, filtrar(eventos,contexto,now,now));
  assert.deepEqual(Object.fromEntries(motivos), { linha:'linha_nao_selecionada',versao:'versao_incompativel',
    parada:'parada_incompativel',sentido:'sentido_incompativel',padrao:'padrao_operacional_incompativel',gps:'gps_vencido_ou_invalido',
    ok:'elegivel',sem:'eta_indisponivel',fora:'fora_da_janela' });
});

test('terminal confirmado separa saida prevista de chegada e presenca', () => {
  const fisico: TerminalRadarVehicle = { key:'A:a',lineId:'A',order:'a',code:'A',physicalAt:now,validUntil:now+60000,
    terminalId:'stop',terminalName:'Terminal',state:'No terminal',knownPattern:'v1',corridors:[],operationalConfirmed:true };
  const chegada=evento('a','A'), saida={...chegada,eventType:'DEPARTURE' as const,scheduledAt:new Date(now+120000).toISOString()};
  assert.equal(filtrar([chegada],contexto,now,now,{},[fisico]).length,0);
  assert.equal(filtrar([saida],contexto,now,now,{},[fisico])[0].evento.eventType,'DEPARTURE');
  assert.equal(filtrar([saida],contexto,now,now,{},[{...fisico,operationalConfirmed:false}]).length,0);
});
