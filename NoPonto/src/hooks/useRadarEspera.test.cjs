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
function montar(opcoes = {}) {
  const h = criarHarness(), chamadas = [], salvas = [];
  const client = { async autorizar() { chamadas.push('permissao'); return 'exibida'; },
    async publicar(c, _pedir, vigente) { if (!vigente()) return 'cancelada'; chamadas.push(c); return 'exibida'; },
    async remover() { chamadas.push('remover'); return 'encerrada'; }, invalidar() {} };
  const { useRadarEspera } = h.carregar('useRadarEspera.ts', {
    'react-native': { AppState: h.appState, Platform: { OS: 'android' } },
    'expo-constants': { __esModule: true, default: { expoConfig: { extra: {
      radarRemoteEnabled: !!opcoes.remoto } } } },
    '../services/storage': { async carregarPreferenciasRadarEspera() { return { prioritarias: ['C'], janelaMinutos: 5 }; },
      async salvarPreferenciasRadarEspera(p) { salvas.push(p); } },
    '../services/notificacaoRadarLocal': { clienteRadarEspera: client },
    ...(opcoes.remoto ? { '../services/radarRemotoAndroid': { radarRemotoAndroid: opcoes.remoto } } : {}),
  });
  const e = entrada(h.now);
  opcoes.preparar?.(e);
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

test('selecionar uma parada deixa a sessão encerrada até o usuário tocar em ativar', async () => {
  const m = montar(); await m.h.flush();
  m.e.selecaoDeliberada = true; m.render(); await m.h.flush();
  assert.equal(m.h.output.estado, 'encerrado');
  assert.equal(m.chamadas.filter(c => c === 'permissao').length, 0);
  assert.equal(m.chamadas.filter(c => typeof c === 'object').length, 0);
  await m.h.output.ativar(); await m.h.flush();
  assert.equal(m.h.output.estado, 'ativo');
  assert.equal(m.chamadas.filter(c => c === 'permissao').length, 1);
  m.h.unmount();
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

test('salvar configuracao aplica lote preserva sessao e persiste prioridades e janela sem permissao repetida',async()=>{
 const m=montar();await m.h.flush();await m.h.output.ativar();await m.h.flush();
 const permissoes=m.chamadas.filter(c=>c==='permissao').length;
 m.h.output.aplicarConfiguracao(['A','C','inexistente'],['A','inexistente'],11);m.render();await m.h.flush();
 assert.equal(m.h.output.estado,'ativo');assert.deepEqual(m.h.output.selecionadas,['A','C']);
 assert.deepEqual(m.h.output.preferencias,{prioritarias:['A'],janelaMinutos:11});
 assert.deepEqual(m.salvas.at(-1),{prioritarias:['A'],janelaMinutos:11});assert.equal(m.chamadas.filter(c=>c==='permissao').length,permissoes);
 m.h.output.aplicarConfiguracao(['C'],['A','C'],15);m.render();await m.h.flush();
 assert.deepEqual(m.h.output.preferencias.prioritarias,['C']);assert.equal(m.h.output.estado,'ativo');m.h.unmount();
});
test('configuracao de outra parada nao altera preferencias nem selecao do acompanhamento',async()=>{
 const m=montar();await m.h.flush();await m.h.output.ativar();await m.h.flush();
 m.e.parada={...m.e.parada,parada:{...m.e.parada.parada,paradaId:'outra'}};m.render();await m.h.flush();
 assert.equal(m.h.output.podeConfigurar,false);const antes=m.h.output.preferencias;
 m.h.output.aplicarConfiguracao(['A'],['A'],15);m.render();await m.h.flush();
 assert.deepEqual(m.h.output.preferencias,antes);assert.deepEqual(m.salvas,[]);assert.equal(m.h.output.paradaIdMonitorada,'stop');m.h.unmount();
});

test('ativacao usa rascunho salvo antes do efeito de observacao do pai',async()=>{
 const m=montar();await m.h.flush();
 m.h.output.aplicarConfiguracao(['A'],['A'],3);m.h.render(undefined,false);
 await m.h.output.ativar();
 const publicadas=m.chamadas.filter(c=>typeof c==='object');assert.equal(publicadas.length,1);
 assert.deepEqual(publicadas[0].data.candidatos.map(c=>c.linhaId),['A']);
 await m.h.flush();assert.equal(m.h.output.estado,'ativo');m.h.unmount();
});

test('hook inicializa sem parada e sem configuracao remota restaurada', async () => {
  const m = montar({ preparar: e => { e.parada = null; } });
  await m.h.flush();
  assert.equal(m.h.output.paradaIdMonitorada, null);
  assert.equal(m.h.output.podeConfigurar, false);
  assert.deepEqual(m.h.output.sentidosSelecionados, []);
  assert.equal(m.h.output.estado, 'encerrado');
  m.h.unmount();
});

test('transicao de nenhuma parada para estacao manual inicializa sem excecao', async () => {
  const m = montar({ preparar: e => { e.parada = null; } });
  await m.h.flush();
  m.e.parada = entrada(m.h.now).parada;
  m.e.selecaoDeliberada = true;
  m.render(); await m.h.flush();
  assert.equal(m.h.output.podeConfigurar, true);
  assert.equal(m.h.output.paradaNome, 'Parada');
  m.h.unmount();
});

test('configuracao remota restaurada preserva selecao e alvo da sessao', async () => {
  const ouvintes = [];
  const remoto = { assinar(fn) { ouvintes.push(fn); return () => {}; }, reconciliar() {},
    atualizar() { return Promise.resolve(); }, ativar() { return Promise.resolve(); },
    encerrar() { return Promise.resolve(); }, expirar() {}, confirmar() { return Promise.resolve(); } };
  const m = montar({ remoto });
  await m.h.flush();
  const sessao = { sessaoId: 's', instalacaoId: 'i', revisao: 1, estado: 'ativa',
    expiraEm: new Date(m.h.now + 3600000).toISOString(), paradaId: 'stop',
    contextos: [{ linhaId: 'A', sentidoId: 'ida' }], linhasSelecionadas: ['A'],
    linhasPrioritarias: [], antecedenciaMinutos: 10 };
  ouvintes.forEach(fn => fn({ modo: 'ativo', sessao, solicitando: false, operacao: null, mensagem: null }));
  await m.h.flush();
  assert.deepEqual(m.h.output.selecionadas, ['A']);
  assert.equal(m.h.output.paradaIdMonitorada, 'stop');
  assert.equal(m.h.output.paradaNome, 'Parada');
  assert.equal(m.h.output.preferencias.janelaMinutos, 10);
  assert.equal(m.h.output.estado, 'ativo');
  assert.equal(m.h.output.podeReativarRemoto, true);
  m.h.unmount();
});
