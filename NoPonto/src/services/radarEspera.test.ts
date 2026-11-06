import test from 'node:test';
import assert from 'node:assert/strict';
import { criarSessaoRadarEspera, textoNotificacaoRadar,
  type PortaRadarEspera, type SnapshotRadarEspera } from './radarEspera';
import { filtrarCandidatosNotificacao, produzirConteudoNotificacao, type ContextoNotificacaoRadar } from './notificacoesRadar';
import type { EventoParadaDto } from './eventosParada';
import { normalizarPreferenciasRadar } from './preferenciasRadarEspera';

const agora = Date.parse('2026-11-06T12:00:00Z');
const contexto: ContextoNotificacaoRadar = { paradaId: 'stop', linhasPrioritarias: ['C'],
  vinculos: ['A', 'B', 'C'].map(linhaId => ({ linhaId, sentidoId: 'ida', padraoVersaoId: 'v', padraoOperacionalId: 'op' })) };
const evento = (eventId: string, linhaId = 'A', secondsUntilEvent = 120): EventoParadaDto => ({
  eventId, linhaId, vehicleId: `bus-${eventId}`, codigoLinha: linhaId, secondsUntilEvent,
  paradaId: 'stop', sentidoId: 'ida', padraoVersaoId: 'v', padraoOperacionalId: 'op',
  ocorrenciaParadaPadraoId: 'oc', modal: 'onibus', tipoRota: 'onibus', eventType: 'ARRIVAL',
  source: 'RealtimeEstimated', quality: 'OperationalEstimate', isEstimated: true,
});
function snapshot(eventos = [evento('a')], ctx = contexto, relogio = agora): SnapshotRadarEspera {
  const candidatos = filtrarCandidatosNotificacao(eventos, ctx, agora, relogio);
  return { chave: JSON.stringify(ctx), ativo: true,
    previa: { contexto: ctx, candidatos, conteudo: produzirConteudoNotificacao(ctx, candidatos, agora, relogio) } };
}
function preparar(overrides: Partial<PortaRadarEspera> = {}) {
  const envios: string[][] = [], remocoes: number[] = [], permissoes: number[] = [];
  const porta: PortaRadarEspera = {
    async autorizar() { permissoes.push(1); return 'exibida'; },
    async publicar(c, vigente) { if (!vigente()) return 'cancelada'; envios.push([c.destaque!.id, ...c.alternativas.filter(i => i.id !== c.destaque!.id).map(i => i.id)]); return 'exibida'; },
    async remover() { remocoes.push(1); return 'encerrada'; }, invalidar() {}, ...overrides,
  };
  return { sessao: criarSessaoRadarEspera(porta), envios, remocoes, permissoes };
}

test('ativar encerrar e nova instancia nao restaura sessao', async () => {
  const h = preparar();
  await h.sessao.observar(snapshot());
  assert.equal(h.sessao.situacao.estado, 'encerrado'); assert.equal(h.envios.length, 0);
  await h.sessao.ativar(); assert.equal(h.sessao.situacao.estado, 'ativo');
  assert.deepEqual(h.envios, [['a']]); assert.equal(h.permissoes.length, 1);
  await h.sessao.encerrar(); assert.equal(h.sessao.situacao.estado, 'encerrado'); assert.equal(h.remocoes.length, 1);
  await h.sessao.observar(snapshot()); assert.equal(h.envios.length, 1);
  const nova = preparar(); await nova.sessao.observar(snapshot());
  assert.equal(nova.sessao.situacao.estado, 'encerrado'); assert.equal(nova.envios.length, 0);
});

test('prioritaria posterior duas prioridades e veiculos distintos seguem N1', async () => {
  const eventos = [evento('a1', 'A', 60), evento('a2', 'A', 180), evento('c', 'C', 300)];
  const h = preparar(); await h.sessao.observar(snapshot(eventos)); await h.sessao.ativar();
  assert.deepEqual(h.envios[0], ['c', 'a1', 'a2']);
  const multiplas = snapshot(eventos, { ...contexto, linhasPrioritarias: ['A', 'C'] });
  const conteudo = multiplas.previa!.conteudo;
  assert.deepEqual(conteudo.prioridades.map(i => i.id), ['a1', 'a2', 'c']);
  const texto = textoNotificacaoRadar(conteudo);
  assert.match(texto.body, /bus-a1[\s\S]*bus-a2[\s\S]*bus-c/);
  assert.equal(texto.data.simulacao, false); assert.match(texto.body, /prevista às/);
});

test('comparacao ignora relogio e pequena oscilacao mas publica mudanca relevante', async () => {
  const h = preparar(); await h.sessao.observar(snapshot([evento('a', 'A', 300)])); await h.sessao.ativar();
  await h.sessao.observar(snapshot([evento('a', 'A', 300)], contexto, agora + 30000));
  await h.sessao.observar(snapshot([evento('a', 'A', 359)])); assert.equal(h.envios.length, 1);
  await h.sessao.observar(snapshot([evento('a', 'A', 360)])); assert.equal(h.envios.length, 2);
  await h.sessao.observar(snapshot([evento('a', 'A', 360)])); assert.equal(h.envios.length, 2);
});

test('troca de parada sentido padrao ou linhas encerra e remove previsao anterior', async () => {
  for (const contextoNovo of [{ ...contexto, paradaId: 'outro' },
    { ...contexto, vinculos: contexto.vinculos.map(v => ({ ...v, sentidoId: 'volta' })) },
    { ...contexto, vinculos: contexto.vinculos.map(v => ({ ...v, padraoVersaoId: 'v2' })) },
    { ...contexto, vinculos: contexto.vinculos.filter(v => v.linhaId !== 'A') }]) {
    const h = preparar(); await h.sessao.observar(snapshot()); await h.sessao.ativar();
    await h.sessao.observar(snapshot([], contextoNovo));
    assert.equal(h.sessao.situacao.estado, 'encerrado'); assert.equal(h.remocoes.length, 1);
    assert.equal(h.envios.length, 1);
  }
});

test('consulta pausada e dados vencidos removem previsao sem solicitar permissao novamente', async () => {
  const h = preparar(); const dados = snapshot([evento('a', 'A', 600)]);
  await h.sessao.observar(dados); await h.sessao.ativar();
  await h.sessao.observar({ ...dados, ativo: false, previa: null });
  assert.equal(h.sessao.situacao.estado, 'pausado'); assert.equal(h.remocoes.length, 1);
  await h.sessao.observar(dados); assert.equal(h.envios.length, 2);
  await h.sessao.observar(snapshot([evento('a', 'A', 600)], contexto, agora + 300001));
  assert.equal(h.sessao.situacao.estado, 'sem previsões'); assert.equal(h.remocoes.length, 2);
  assert.equal(h.permissoes.length, 1);
});

test('permissao negada nao ativa nem envia notificacao', async () => {
  const h = preparar({ async autorizar() { return 'negada'; } });
  await h.sessao.observar(snapshot()); await h.sessao.ativar();
  assert.equal(h.sessao.situacao.estado, 'encerrado'); assert.match(h.sessao.situacao.mensagem!, /negada/);
  assert.equal(h.envios.length, 0); assert.equal(h.remocoes.length, 1);
});

test('pausa durante permissao invalida ativacao tardia', async () => {
  let liberar!: () => void;
  const espera = new Promise<void>(resolve => { liberar = resolve; });
  const h = preparar({ async autorizar() { await espera; return 'exibida'; } });
  const dados = snapshot(); await h.sessao.observar(dados); const ativacao = h.sessao.ativar();
  await h.sessao.observar({ ...dados, ativo: false }); liberar(); await ativacao;
  assert.equal(h.envios.length, 0); assert.equal(h.sessao.situacao.estado, 'encerrado');
});

test('atualizacao em voo e encerramento nao ressuscitam notificacao antiga', async () => {
  let liberar!: () => void, vigente!: () => boolean;
  const espera = new Promise<void>(resolve => { liberar = resolve; });
  const h = preparar({ async publicar(_c, validade) { vigente = validade; await espera; return validade() ? 'exibida' : 'cancelada'; } });
  await h.sessao.observar(snapshot()); const ativacao = h.sessao.ativar();
  for (let i = 0; i < 10; i++) await Promise.resolve();
  await h.sessao.encerrar(); assert.equal(vigente(), false);
  liberar(); await ativacao; assert.equal(h.sessao.situacao.estado, 'encerrado');
});

test('falha nativa pausa limpa e exige retomada sem repetir a cada tick', async () => {
  const h = preparar({ async publicar() { return 'erro'; } });
  await h.sessao.observar(snapshot()); await h.sessao.ativar();
  assert.equal(h.sessao.situacao.estado, 'pausado'); assert.match(h.sessao.situacao.mensagem!, /Falha/);
  const remocoes = h.remocoes.length;
  await h.sessao.observar(snapshot()); await h.sessao.observar(snapshot());
  assert.equal(h.remocoes.length, remocoes);
});

test('preferencias validam limites e descartam qualquer sessao persistida', () => {
  assert.deepEqual(normalizarPreferenciasRadar(null), { prioritarias: [], janelaMinutos: 10 });
  for (const janela of [2, 15]) assert.equal(normalizarPreferenciasRadar({ janelaMinutos: janela }).janelaMinutos, janela);
  for (const janela of [1, 16, 2.5, NaN]) assert.equal(normalizarPreferenciasRadar({ janelaMinutos: janela }).janelaMinutos, 10);
  assert.deepEqual(normalizarPreferenciasRadar({ prioritarias: ['A', 'A', 7, ''], janelaMinutos: 5, ativa: true }),
    { prioritarias: ['A'], janelaMinutos: 5 });
});

test('duas ativacoes concorrentes pedem permissao e publicam uma vez', async () => {
  const h = preparar(); await h.sessao.observar(snapshot());
  await Promise.all([h.sessao.ativar(), h.sessao.ativar()]);
  assert.equal(h.permissoes.length, 1); assert.equal(h.envios.length, 1);
});

test('sem previsoes mantem sessao sem notificacao e novos dados retomam', async () => {
  const h = preparar(); await h.sessao.observar(snapshot([])); await h.sessao.ativar();
  assert.equal(h.sessao.situacao.estado, 'sem previsões'); assert.equal(h.envios.length, 0);
  await h.sessao.observar(snapshot());
  assert.equal(h.sessao.situacao.estado, 'ativo'); assert.equal(h.envios.length, 1);
  assert.equal(h.permissoes.length, 1);
});

test('erro de porta rejeitada vira estado controlado sem rejeicao ao usuario', async () => {
  const h = preparar({ async autorizar() { throw new Error('native'); } });
  await h.sessao.observar(snapshot()); await h.sessao.ativar();
  assert.equal(h.sessao.situacao.estado, 'encerrado');
  assert.match(h.sessao.situacao.mensagem!, /indisponíveis/);
});

test('encerrar durante limpeza de falha nao deixa retorno tardio reabrir sessao', async () => {
  let liberar!: () => void;
  const espera = new Promise<void>(resolve => { liberar = resolve; });
  const h = preparar({ async publicar() { return 'erro'; }, async remover() { await espera; return 'encerrada'; } });
  await h.sessao.observar(snapshot()); const ativacao = h.sessao.ativar();
  for (let i = 0; i < 20; i++) await Promise.resolve();
  const encerramento = h.sessao.encerrar(); liberar();
  await Promise.all([ativacao, encerramento]); assert.equal(h.sessao.situacao.estado, 'encerrado');
});

test('atualizacoes concorrentes coalescem ultimo snapshot sem publicar fora de ordem', async () => {
  let liberar!: () => void;
  const espera = new Promise<void>(resolve => { liberar = resolve; }), publicadas: number[] = [];
  const h = preparar({ async publicar(c, vigente) {
    publicadas.push(c.destaque!.previstoEm);
    if (publicadas.length === 1) await espera;
    return vigente() ? 'exibida' : 'cancelada';
  } });
  await h.sessao.observar(snapshot([evento('a', 'A', 120)])); const ativacao = h.sessao.ativar();
  for (let i = 0; i < 10; i++) await Promise.resolve();
  const intermediaria = h.sessao.observar(snapshot([evento('a', 'A', 180)]));
  const ultima = h.sessao.observar(snapshot([evento('a', 'A', 300)]));
  liberar(); await Promise.all([ativacao, intermediaria, ultima]);
  assert.deepEqual(publicadas, [agora + 120000, agora + 300000]);
});
