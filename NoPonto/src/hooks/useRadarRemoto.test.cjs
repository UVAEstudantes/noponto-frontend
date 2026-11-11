const test = require('node:test');
const assert = require('node:assert/strict');
const { criarHarness, adiada } = require('./radarTestHarness.cjs');
const { criarRadarRemoto } = require('../services/radarRemotoCore.ts');

function mount(opcoes = {}) {
  const h = criarHarness(), local = [], calls = [], secure = new Map([
    ['radar.installation.v1', JSON.stringify({ credencial: 'owner.secret', instalacaoId: 'owner', credencialExpiraEm: '2027-05-01T00:00:00Z' })],
    ['radar.token.v1', 'ExpoPushToken[synthetic]'],
  ]);
  const stop = { paradaId: 'stop', nome: 'Bom Repouso', ordem: 1, posicaoLinha: 0, latitude: 0, longitude: 0 };
  const lines = ['838', '884'].map(linhaId => ({ linhaId, linhaCodigo: linhaId, ativa: true, modoSentido: 'ambos', modal: 'onibus' }));
  const input = { parada: { parada: stop, distancia: 0, vinculos: lines.map(l => ({ linhaId: l.linhaId, sentidoId: 'ida', padraoVersaoId: 'v', destino: 'Destino' })) },
    modal: 'onibus', linhas: lines, consulta: { eventos: [], recebidoEm: h.now, agora: h.now, temResposta: false, statusConsulta: 'indisponivel' },
    itinerarios: Object.fromEntries(lines.map(l => [l.linhaId, { linha: l.linhaId, modal: 'onibus', segmentos: [],
      padroesV2: [{ sentidoId: 'ida', padraoVersaoId: 'v', padraoOperacionalId: 'op', paradas: [stop] }] }])), realtime: {}, presencasFisicas: [] };
  let session = { sessaoId: 'session', instalacaoId: 'owner', revisao: 3, estado: 'ativa', paradaId: 'stop',
    expiraEm: new Date(h.now + 3600000).toISOString(), contextos: [], linhasSelecionadas: ['838', '884'], linhasPrioritarias: ['838'], antecedenciaMinutos: 5 };
  const remote = criarRadarRemoto({ projectId: 'project', now: () => h.now, id: () => 'enrollment',
    read: async key => secure.get(key) ?? null, write: async (key, value) => { secure.set(key, value); }, remove: async key => { secure.delete(key); },
    clearNotifications: async () => { local.push('clear'); }, token: async () => 'ExpoPushToken[synthetic]',
    async request(method, route, _credential, body) {
      calls.push({ method, route, body });
      if (opcoes.antesDeRequisitar) await opcoes.antesDeRequisitar(method, route);
      if (route === '/radar/instalacao') return { credencialExpiraEm: '2027-05-01T00:00:00Z' };
      if (route === '/radar/instalacao/push') return { registered: true, possessionConfirmed: true };
      if (method === 'GET' && route === '/radar/sessao') return session;
      if (method === 'POST' && route === '/radar/sessao') {
        session = { ...(body), sessaoId: `session-${calls.length}`, instalacaoId: 'owner', revisao: 1,
          estado: 'ativa', expiraEm: new Date(h.now + 3600000).toISOString() };
        return session;
      }
      if (method === 'PUT') { session = { ...session, ...body, revisao: session.revisao + 1 }; return session; }
      if (method === 'DELETE') { session = null; return null; }
      throw new Error('Unexpected request');
    },
  });
  const oldFlag = process.env.EXPO_PUBLIC_RADAR_REMOTE_ENABLED;
  process.env.EXPO_PUBLIC_RADAR_REMOTE_ENABLED = 'true';
  const { useRadarEspera } = h.carregar('useRadarEspera.ts', {
    'react-native': { AppState: h.appState, Platform: { OS: 'android' } },
    'expo-constants': { __esModule: true, default: { expoConfig: { extra: { radarRemoteEnabled: true } } } },
    '../services/storage': { carregarPreferenciasRadarEspera: async () => ({ prioritarias: [], janelaMinutos: 10 }), salvarPreferenciasRadarEspera: async () => {} },
    '../services/radarRemotoAndroid': { radarRemotoAndroid: remote },
    '../services/notificacaoRadarLocal': { clienteRadarEspera: { invalidar() {}, remover: async () => { local.push('remove-local'); return 'encerrada'; },
      autorizar: async () => { local.push('authorize-local'); return 'exibida'; }, publicar: async () => { local.push('publish-local'); return 'exibida'; } } },
  });
  if (oldFlag === undefined) delete process.env.EXPO_PUBLIC_RADAR_REMOTE_ENABLED; else process.env.EXPO_PUBLIC_RADAR_REMOTE_ENABLED = oldFlag;
  const render = () => h.render(() => useRadarEspera(input)); render();
  return { h, input, render, calls, local, remote, useRadarEspera };
}

test('renders e abrir fechar modal nao reconciliam novamente', async () => {
  const f = mount(); await f.h.flush(); await f.h.flush();
  const Component = f.h.carregar('../components/mapaComponents/radarEsperaSection.tsx', {
    'react-native': Object.fromEntries(['ActivityIndicator', 'Modal', 'View', 'Text', 'Pressable', 'ScrollView', 'StatusBar'].map(n => [n, n])),
    'lucide-react-native': Object.fromEntries(['ArrowLeft', 'Bell', 'Check', 'ChevronRight', 'Headphones', 'Star'].map(n => [n, n])),
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    './radarVehicleCard': { textoSobreCor: () => '#FFFFFF', fundoIdentificador: c => c },
    './radarAvisosPorVoz': { __esModule: true, default: () => null },
    '@/src/hooks/useTema': { useTema: () => ({ cores: require('../constants/tema.ts').temas.claro.cores, temaAtual: 'claro' }) },
  }).default;
  const nodes = v => Array.isArray(v) ? v.flatMap(nodes) : v && typeof v === 'object' ? [v, ...nodes(v.props?.children)] : [];
  const render = () => f.h.render(() => Component({ controle: f.useRadarEspera(f.input) }));
  render(); const before = f.calls.length;
  assert.equal(before, 3);
  for (let i = 0; i < 20; i++) {
    render();
    nodes(f.h.output).find(n => n.props?.accessibilityLabel === 'Gerenciar Radar de Espera').props.onPress();
    render();
    nodes(f.h.output).find(n => n.props?.accessibilityLabel === 'Voltar do Radar de Espera').props.onPress();
    render(); await f.h.flush();
  }
  assert.equal(f.calls.length, before);
  assert.equal(f.remote.estado.modo, 'ativo');
  f.h.unmount();
});

test('AppState preserva reconciliacao ao retornar e recuperacao apos desconexao', async () => {
  const f = mount(); await f.h.flush(); await f.h.flush();
  assert.equal(f.calls.length, 3);
  f.h.estado('background'); await f.h.flush();
  assert.equal(f.calls.length, 3);
  f.h.estado('active'); await f.h.flush(); await f.h.flush();
  assert.equal(f.calls.length, 6);
  // Explicit recovery is not suppressed by token equality or a time-based cache.
  await f.remote.reconciliar(); await f.h.flush();
  assert.equal(f.calls.length, 9);
  assert.equal(f.remote.estado.modo, 'ativo');
  f.h.unmount();
});

test('hook remoto recupera alvo preferencias e sessao sem consulta local e nunca publica local no background', async () => {
  const f = mount(); await f.h.flush(); await f.h.flush();
  assert.equal(f.h.output.estado, 'ativo'); assert.equal(f.h.output.estadoRemoto, 'ativo');
  assert.deepEqual(f.h.output.preferencias, { prioritarias: ['838'], janelaMinutos: 5 });
  assert.equal(f.h.output.paradaIdMonitorada, 'stop');
  f.h.estado('background'); await f.h.flush(); assert.equal(f.h.output.estado, 'ativo');
  await f.h.avancar(60000);
  assert.equal(f.calls.some(c => c.route.includes('eventos')), false);
  assert.equal(f.local.includes('publish-local'), false); assert.equal(f.local.includes('authorize-local'), false);
  assert.equal(f.calls.some(c => c.method === 'POST' || c.method === 'DELETE'), false);
  f.h.unmount();
});

test('hook remoto salva preferencias e troca deliberada sem renovar prazo nem transferir alvo automaticamente', async () => {
  const f = mount(); await f.h.flush(); await f.h.flush();
  f.h.output.aplicarConfiguracao(['838', '884'], ['838', '884'], 15); f.render(); await f.h.flush();
  assert.equal(f.calls.filter(c => c.method === 'PUT').length, 1);
  assert.deepEqual(f.calls.find(c => c.method === 'PUT').body.linhasPrioritarias, ['838', '884']);
  f.input.parada = { ...f.input.parada, parada: { ...f.input.parada.parada, paradaId: 'other' } };
  f.render(); await f.h.flush(); assert.equal(f.h.output.outraParada, true);
  assert.equal(f.calls.filter(c => c.method === 'PUT').length, 1);
  f.input.selecaoDeliberada = true;
  for (const route of Object.values(f.input.itinerarios)) route.padroesV2[0].paradas = [f.input.parada.parada];
  f.render(); await f.h.flush();
  assert.equal(f.calls.filter(c => c.method === 'PUT').at(-1).body.paradaId, 'other');
  assert.equal(f.local.includes('publish-local'), false); f.h.unmount();
});

test('hook remoto informa expiracao e nao reativa silenciosamente apos uma hora', async () => {
  const f = mount(); await f.h.flush(); await f.h.flush(); await f.h.avancar(3600000);
  assert.equal(f.h.output.estadoRemoto, 'expirado'); assert.equal(f.h.output.estado, 'encerrado');
  assert.match(f.h.output.mensagem, /renovar intencionalmente/);
  assert.equal(f.calls.some(c => c.method === 'POST'), false); f.h.unmount();
});

test('BRT reativa apos expiracao com duas linhas e sem previsao elegivel, apos trocar da selecao de onibus', async () => {
  const f = mount(); await f.h.flush(); await f.h.flush(); await f.h.avancar(3600000);
  const stop = f.input.parada.parada;
  const brt = ['brt-10', 'brt-12'].map((linhaId, i) => ({ linhaId, linhaCodigo: String(10 + i * 2),
    ativa: true, modoSentido: 'ambos', modal: 'brt' }));
  f.input.modal = 'brt'; f.input.linhas = brt;
  f.input.parada = { ...f.input.parada, vinculos: brt.map(l => ({ linhaId: l.linhaId,
    sentidoId: 'ida', padraoVersaoId: `${l.linhaId}-v1`, destino: `Destino ${l.linhaCodigo}` })) };
  f.input.itinerarios = Object.fromEntries(brt.map(l => [l.linhaId, { linha: l.linhaId, modal: 'brt', segmentos: [],
    padroesV2: [{ linhaId: l.linhaId, sentidoId: 'ida', padraoVersaoId: `${l.linhaId}-v1`,
      padraoOperacionalId: `${l.linhaId}-op`, ehVersaoAtual: true, paradas: [stop] }] }]));
  f.render(); await f.h.flush();

  assert.deepEqual(f.h.output.selecionadas, ['brt-10', 'brt-12']);
  assert.equal(f.h.output.previa, null);
  assert.equal(f.h.output.podeConfigurar, true);
  assert.equal(f.h.output.podeSolicitarAtivacao, true);
  const config = f.h.output.aplicarConfiguracao(['brt-10', 'brt-12'], [], 10);
  assert.deepEqual(config?.contextos.map(c => [c.linhaId, c.sentidoId, c.padraoOperacionalId, c.padraoVersaoId]), [
    ['brt-10', 'ida', 'brt-10-op', 'brt-10-v1'], ['brt-12', 'ida', 'brt-12-op', 'brt-12-v1'],
  ]);
  await f.h.output.ativar(config); await f.h.flush();
  const activation = f.calls.filter(c => c.method === 'POST' && c.route === '/radar/sessao').at(-1);
  assert.deepEqual(activation.body.linhasSelecionadas, ['brt-10', 'brt-12']);
  assert.equal(f.h.output.estadoRemoto, 'ativo');
  f.h.unmount();
});

test('BRT aceita rascunho apos trocar da selecao de onibus explicitamente vazia', async () => {
  const f = mount(); await f.h.flush(); await f.h.flush(); await f.h.avancar(3600000);
  f.h.output.selecionarLinha('838'); f.h.render();
  f.h.output.selecionarLinha('884'); f.h.render();
  const stop = f.input.parada.parada;
  const brt = ['brt-10', 'brt-12'].map((linhaId, i) => ({ linhaId, linhaCodigo: String(10 + i * 2),
    ativa: true, modoSentido: 'ambos', modal: 'brt' }));
  f.input.modal = 'brt'; f.input.linhas = brt;
  f.input.parada = { ...f.input.parada, vinculos: brt.map(l => ({ linhaId: l.linhaId,
    sentidoId: 'ida', padraoVersaoId: `${l.linhaId}-v1`, destino: `Destino ${l.linhaCodigo}` })) };
  f.input.itinerarios = Object.fromEntries(brt.map(l => [l.linhaId, { linha: l.linhaId, modal: 'brt', segmentos: [],
    padroesV2: [{ linhaId: l.linhaId, sentidoId: 'ida', padraoVersaoId: `${l.linhaId}-v1`,
      padraoOperacionalId: `${l.linhaId}-op`, ehVersaoAtual: true, paradas: [stop] }] }]));
  f.render(); await f.h.flush();

  assert.deepEqual(f.h.output.selecionadas, []);
  assert.equal(f.h.output.podeConfigurar, true);
  assert.equal(f.h.output.podeSolicitarAtivacao, true);
  const config = f.h.output.aplicarConfiguracao(['brt-10', 'brt-12'], [], 10);
  assert.deepEqual(config?.linhasSelecionadas, ['brt-10', 'brt-12']);
  assert.deepEqual(config?.contextos.map(c => [c.linhaId, c.padraoOperacionalId, c.padraoVersaoId]), [
    ['brt-10', 'brt-10-op', 'brt-10-v1'], ['brt-12', 'brt-12-op', 'brt-12-v1'],
  ]);
  f.h.unmount();
});

test('hook remoto reativa sessao expirada de outra parada sem transferir o alvo', async () => {
  const f = mount(); await f.h.flush(); await f.h.flush(); await f.h.avancar(3600000);
  f.input.parada = { ...f.input.parada, parada: { ...f.input.parada.parada, paradaId: 'other', nome: 'Outra parada' } };
  f.render(); await f.h.flush();
  assert.equal(f.h.output.outraParada, true); assert.equal(f.h.output.podeConfigurar, false);
  assert.equal(f.h.output.podeReativarRemoto, true); assert.equal(f.h.output.podeSolicitarAtivacao, true);
  await f.h.output.ativar(); await f.h.flush();
  assert.equal(f.h.output.estadoRemoto, 'ativo'); assert.equal(f.h.output.paradaIdMonitorada, 'stop');
  const activation = f.calls.find(c => c.method === 'POST' && c.route === '/radar/sessao');
  assert.ok(activation); assert.equal(activation.body.paradaId, 'stop');
  assert.equal(activation.body.revisaoEsperada, 0);
  assert.deepEqual(f.h.output.selecionadas, ['838', '884']);
  f.h.unmount();
});

test('hook remoto bloqueia reativacao duplicada enquanto aguarda reconciliacao', async () => {
  const portao = adiada();
  const f = mount({ antesDeRequisitar: async (method, route) => {
    if (method === 'GET' && route === '/radar/instalacao') await portao.promise;
  }});
  await f.h.flush();
  assert.equal(f.h.output.solicitando, true); assert.equal(f.h.output.operacaoRemota, 'reconciliar');
  const originalAtivar = f.remote.ativar.bind(f.remote);
  let ativacoes = 0;
  f.remote.ativar = (...args) => { ativacoes++; return originalAtivar(...args); };
  const primeira = f.h.output.ativar();
  const segunda = f.h.output.ativar();
  f.render();
  assert.equal(ativacoes, 1);
  assert.equal(f.h.output.solicitando, true);
  assert.equal(f.h.output.operacaoRemota, 'ativar');
  portao.resolve();
  await Promise.all([primeira, segunda]); await f.h.flush();
  assert.equal(ativacoes, 1);
  assert.equal(f.h.output.estadoRemoto, 'ativo');
  assert.equal(f.h.output.solicitando, false); assert.equal(f.h.output.operacaoRemota, null);
  f.h.unmount();
});

test('hook remoto ignora salvamentos duplicados e usa a configuracao aplicada', async () => {
  const f = mount(); await f.h.flush(); await f.h.flush();
  const originalAtualizar = f.remote.atualizar.bind(f.remote);
  let atualizacoes = 0;
  f.remote.atualizar = (...args) => { atualizacoes++; return originalAtualizar(...args); };
  const configuracao = f.h.output.aplicarConfiguracao(['838'], ['838'], 15);
  const duplicada = f.h.output.aplicarConfiguracao(['838', '884'], ['884'], 2);
  f.render();
  assert.equal(configuracao.antecedenciaMinutos, 15);
  assert.equal(duplicada, null);
  assert.equal(atualizacoes, 1);
  assert.equal(f.h.output.solicitando, true); assert.equal(f.h.output.operacaoRemota, 'atualizar');
  await f.h.flush(); await f.h.flush();
  assert.equal(f.h.output.solicitando, false); assert.equal(f.h.output.operacaoRemota, null);
  const put = f.calls.filter(c => c.method === 'PUT').at(-1);
  assert.equal(put.body.antecedenciaMinutos, 15);
  assert.deepEqual(put.body.linhasSelecionadas, ['838']);
  assert.equal(atualizacoes, 1); f.h.unmount();
});

test('hook remoto ativa com a configuracao aplicada antes de novo render', async () => {
  const f = mount(); await f.h.flush(); await f.h.flush(); await f.h.avancar(3600000);
  const configuracao = f.h.output.aplicarConfiguracao(['838'], ['838'], 15);
  await f.h.output.ativar(configuracao); await f.h.flush();
  const ativacao = f.calls.filter(c => c.method === 'POST' && c.route === '/radar/sessao').at(-1);
  assert.ok(ativacao);
  assert.equal(ativacao.body.antecedenciaMinutos, 15);
  assert.deepEqual(ativacao.body.linhasSelecionadas, ['838']);
  assert.equal(f.h.output.estadoRemoto, 'ativo'); f.h.unmount();
});

test('hook remoto ignora encerramentos duplicados', async () => {
  const f = mount(); await f.h.flush(); await f.h.flush();
  const originalEncerrar = f.remote.encerrar.bind(f.remote);
  let encerramentos = 0;
  f.remote.encerrar = (...args) => { encerramentos++; return originalEncerrar(...args); };
  const primeira = f.h.output.encerrar();
  const segunda = f.h.output.encerrar();
  f.render();
  assert.equal(encerramentos, 1);
  assert.equal(f.h.output.solicitando, true); assert.equal(f.h.output.operacaoRemota, 'encerrar');
  await Promise.all([primeira, segunda]); await f.h.flush();
  assert.equal(f.h.output.estadoRemoto, 'inativo');
  assert.equal(f.h.output.solicitando, false); assert.equal(f.h.output.operacaoRemota, null);
  assert.equal(encerramentos, 1); f.h.unmount();
});
