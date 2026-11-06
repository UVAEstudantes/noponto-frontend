const test = require('node:test');
const assert = require('node:assert/strict');
const { criarHarness } = require('./radarTestHarness.cjs');
const { chaveContextoRadar } = require('../services/radarParada.ts');

function entrada(now) {
  const stop = { paradaId: 'stop', nome: 'Parada', ordem: 1, posicaoLinha: 0, latitude: 0, longitude: 0 };
  const linhas = ['A', 'C'].map(linhaId => ({ linhaId, linhaCodigo: linhaId, ativa: true,
    modoSentido: 'ambos', modal: 'onibus', cor: '#123456', nomeExibicao: linhaId }));
  const parada = { parada: stop, distancia: 0, vinculos: linhas.map(l => ({ linhaId: l.linhaId,
    sentidoId: 'ida', padraoVersaoId: 'v', destino: 'Destino' })) };
  return { parada, modal: 'onibus', linhas,
    consulta: { contextoConsulta: chaveContextoRadar(parada, 'onibus'), statusConsulta: 'sucesso',
      temResposta: true, recebidoEm: now, agora: now, eventos: linhas.map(l => ({
        eventId: l.linhaId, vehicleId: `bus-${l.linhaId}`, linhaId: l.linhaId, codigoLinha: l.linhaId,
        paradaId: 'stop', sentidoId: 'ida', padraoVersaoId: 'v', padraoOperacionalId: 'op',
        eventType: 'ARRIVAL', secondsUntilEvent: l.linhaId === 'A' ? 120 : 240,
        source: 'RealtimeEstimated', quality: 'OperationalEstimate' })) },
    itinerarios: Object.fromEntries(linhas.map(l => [l.linhaId, { linha: l.linhaId, modal: 'onibus',
      segmentos: [], padroesV2: [{ sentidoId: 'ida', padraoVersaoId: 'v', padraoOperacionalId: 'op', paradas: [stop] }] }])),
    realtime: {}, presencasFisicas: [] };
}
function montar() {
  const h = criarHarness(), chamadas = [], salvas = [];
  const client = { async autorizar() { chamadas.push('permissao'); return 'exibida'; },
    async publicar(c, _pedir, vigente) { if (!vigente()) return 'cancelada'; chamadas.push(c); return 'exibida'; },
    async remover() { chamadas.push('remover'); return 'encerrada'; }, invalidar() {} };
  const { useRadarEspera } = h.carregar('useRadarEspera.ts', {
    'react-native': { AppState: h.appState, Platform: { OS: 'android' } },
    '../services/storage': { async carregarPreferenciasRadarEspera() { return { prioritarias: ['C'], janelaMinutos: 5 }; },
      async salvarPreferenciasRadarEspera(p) { salvas.push(p); } },
    '../services/notificacaoRadarLocal': { clienteRadarEspera: client },
  });
  const e = entrada(h.now);
  const render = () => h.render(() => useRadarEspera(e));
  render(); return { h, e, render, chamadas, salvas };
}

test('hook restaura preferencias sem restaurar sessao e limpa entrada anterior', async () => {
  const m = montar(); await m.h.flush();
  assert.equal(m.h.output.estado, 'encerrado');
  assert.deepEqual(m.h.output.preferencias, { prioritarias: ['C'], janelaMinutos: 5 });
  assert.equal(m.h.output.previa.conteudo.destaque.id, 'C');
  assert.deepEqual(m.chamadas, ['remover']);
  assert.equal(m.h.timerCount, 0); m.h.unmount();
});

test('hook limpa no background pausa e retoma somente com consulta ativa', async () => {
  const m = montar(); await m.h.flush(); await m.h.output.ativar(); await m.h.flush();
  assert.equal(m.h.output.estado, 'ativo');
  m.h.estado('background'); await m.h.flush();
  assert.equal(m.h.output.estado, 'pausado');
  const quantidade = m.chamadas.filter(c => typeof c === 'object').length;
  await m.h.avancar(60000); assert.equal(m.chamadas.filter(c => typeof c === 'object').length, quantidade);
  m.e.consulta.statusConsulta = 'pausado'; m.h.estado('active'); await m.h.flush();
  assert.equal(m.h.output.estado, 'pausado');
  m.e.consulta.statusConsulta = 'sucesso'; m.render(); await m.h.flush();
  assert.equal(m.h.output.estado, 'ativo');
  assert.equal(m.chamadas.filter(c => c === 'permissao').length, 1);
  assert.equal(m.h.timerCount, 0); m.h.unmount();
});

test('selecao de linhas e preferencias reconfiguram sessao e persistem somente preferencias', async () => {
  const m = montar(); await m.h.flush(); await m.h.output.ativar(); await m.h.flush();
  m.h.output.selecionarLinha('A'); m.render(); await m.h.flush();
  assert.equal(m.h.output.estado, 'ativo'); assert.deepEqual(m.h.output.selecionadas, ['C']);
  assert.deepEqual(m.h.output.previa.candidatos.map(c => c.evento.linhaId), ['C']);
  m.h.output.definirJanela(15); m.render(); await m.h.flush();
  m.h.output.priorizarLinha('C'); m.render(); await m.h.flush();
  assert.deepEqual(m.salvas.at(-1), { prioritarias: [], janelaMinutos: 15 });
  assert.equal(m.salvas.some(p => 'ativa' in p || 'parada' in p || 'selecionadas' in p), false);
  m.h.unmount();
});

test('storage faz roundtrip das preferencias e recusa sessao ou dados invalidos', async () => {
  const h = criarHarness(); let valor = null;
  const store = h.carregar('../services/storage.ts', {
    '@react-native-async-storage/async-storage': { __esModule: true, default: {
      async getItem(key) { assert.equal(key, '@radarEsperaPreferencias'); return valor; },
      async setItem(key, next) { assert.equal(key, '@radarEsperaPreferencias'); valor = next; },
    } },
  });
  await store.salvarPreferenciasRadarEspera({ prioritarias: ['C', 'A'], janelaMinutos: 2, ativa: true, sessao: 'stop' });
  assert.deepEqual(JSON.parse(valor), { prioritarias: ['C', 'A'], janelaMinutos: 2 });
  assert.deepEqual(await store.carregarPreferenciasRadarEspera(), JSON.parse(valor));
  valor = '{malformado'; assert.deepEqual(await store.carregarPreferenciasRadarEspera(), { prioritarias: [], janelaMinutos: 10 });
});

test('hook reconfigura selecao e pausa contexto sem dados correspondentes', async () => {
  for (const modificar of [e => { e.parada.parada.paradaId = 'outra'; },
    e => { e.linhas[0].modoSentido = 'ida'; }, e => { e.linhas = e.linhas.slice(1); },
    e => { e.itinerarios.A.padroesV2[0].padraoOperacionalId = 'op-nova'; }]) {
    const m = montar(); await m.h.flush(); await m.h.output.ativar(); await m.h.flush();
    assert.equal(m.h.output.estado, 'ativo');
    modificar(m.e); m.render(); await m.h.flush();
    assert.notEqual(m.h.output.estado, 'encerrado');
    assert.equal(m.chamadas.filter(c => c === 'permissao').length, 1);
    m.h.unmount();
  }
});

test('navegar mapa pausa alvo e selecao deliberada troca parada sem nova ativacao', async () => {
  const m=montar();await m.h.flush();await m.h.output.ativar();await m.h.flush();
  const original=m.e.parada.parada;
  m.e.parada={...m.e.parada,parada:{...original,paradaId:'nova',nome:'Nova parada'}};
  m.e.consulta={...m.e.consulta,contextoConsulta:chaveContextoRadar(m.e.parada,'onibus'),
    eventos:m.e.consulta.eventos.map(e=>({...e,paradaId:'nova'}))};
  m.e.itinerarios=Object.fromEntries(Object.entries(m.e.itinerarios).map(([id,it])=>[id,{...it,
    padroesV2:it.padroesV2.map(p=>({...p,paradas:[m.e.parada.parada]}))}]));
  m.render();await m.h.flush();assert.equal(m.h.output.estado,'pausado');assert.equal(m.h.output.paradaNome,'Parada');
  const antes=m.chamadas.filter(c=>typeof c==='object').length;
  m.e.selecaoDeliberada=true;m.render();await m.h.flush();
  assert.equal(m.h.output.estado,'ativo');assert.equal(m.h.output.paradaNome,'Nova parada');
  assert.equal(m.chamadas.filter(c=>typeof c==='object').length,antes+1);
  assert.equal(m.chamadas.filter(c=>c==='permissao').length,1);m.h.unmount();
});

test('visualizar outra parada nao transfere acompanhamento e voltar retoma o alvo original',async()=>{
 const m=montar();await m.h.flush();await m.h.output.ativar();await m.h.flush();
 const original=m.e.parada;
 m.e.selecaoDeliberada=false;m.e.parada={...original,parada:{...original.parada,paradaId:'visualizada'}};
 m.render();await m.h.flush();
 assert.equal(m.h.output.paradaIdMonitorada,'stop');assert.equal(m.h.output.estado,'pausado');assert.equal(m.h.output.previa,null);
 const quantidade=m.chamadas.filter(c=>typeof c==='object').length;
 m.e.parada=original;m.render();await m.h.flush();
 assert.equal(m.h.output.paradaIdMonitorada,'stop');assert.equal(m.h.output.estado,'ativo');
 assert.equal(m.chamadas.filter(c=>typeof c==='object').length,quantidade+1);
 assert.equal(m.chamadas.filter(c=>c==='permissao').length,1);m.h.unmount();
});
