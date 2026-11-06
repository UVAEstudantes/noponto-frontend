const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function carregar({ granted = true, canAskAgain = true, aceitar = true,
  dev = true, os = 'android', falha, apresentar = true } = {}) {
  const chamadas = [];
  const apresentadas = new Map([['outra-notificacao', { request: {
    identifier: 'outra-notificacao', content: { body: 'Não pertence ao teste' },
  } }]]);
  const pedidos = [];
  const temporizadores = [];
  let pausarTemporizadores = false;
  let liberarConsulta;
  let consultaBloqueada;
  let handler;
  const notifications = {
    AndroidImportance: { DEFAULT: 3 },
    setNotificationHandler(value) {
      chamadas.push(['handler']);
      if (falha === 'handler') throw Error('native');
      handler = value;
    },
    async setNotificationChannelAsync(...args) {
      chamadas.push(['canal', ...args]);
      if (falha === 'canal') throw Error('native');
    },
    async getPermissionsAsync() {
      chamadas.push(['verificar']);
      if (falha === 'permissao') throw Error('native');
      return { granted, canAskAgain };
    },
    async requestPermissionsAsync() {
      chamadas.push(['solicitar']);
      if (falha === 'solicitar') throw Error('native');
      return { granted: aceitar, canAskAgain: false };
    },
    async scheduleNotificationAsync(value) {
      chamadas.push(['exibir', value]);
      if (falha === 'exibir') throw Error('native');
      pedidos.push(value);
      if (apresentar) apresentadas.set(value.identifier, { request: value });
      return value.identifier;
    },
    async getPresentedNotificationsAsync() {
      chamadas.push(['consultar']);
      if (falha === 'consultar') throw Error('native');
      if (consultaBloqueada) await consultaBloqueada;
      return [...apresentadas.values()];
    },
    async dismissNotificationAsync(id) {
      chamadas.push(['encerrar', id]);
      if (falha === 'encerrar') throw Error('native');
      if (falha !== 'remocao-ignorada') apresentadas.delete(id);
    },
    dismissAllNotificationsAsync() { assert.fail('Remoção global proibida'); },
    cancelAllScheduledNotificationsAsync() { assert.fail('Cancelamento global proibido'); },
  };
  const cache = new Map();
  const sandbox = { __DEV__: dev,
    // Sem espera real: o teste de timeout percorre deterministicamente as tentativas.
    setTimeout(callback) {
      if (pausarTemporizadores) temporizadores.push(callback);
      else Promise.resolve().then(callback);
    },
    require(id) {
      if (id === 'react-native') return { Platform: { OS: os } };
      if (id === 'expo-notifications') return notifications;
      if (id === './notificacaoLocalCanal') return carregarModulo('notificacaoLocalCanal.ts');
      throw Error(`Dependencia inesperada: ${id}`);
    },
  };
  function carregarModulo(nome) {
    if (cache.has(nome)) return cache.get(nome);
    const filename = path.join(__dirname, nome), exports = {};
    cache.set(nome, exports);
    const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInNewContext(output, { ...sandbox, exports }, { filename });
    return exports;
  }
  const api = carregarModulo('notificacaoLocalTeste.ts');
  return { api, criarCanal: carregarModulo('notificacaoLocalCanal.ts').criarCanalNotificacaoLocal,
    real: carregarModulo('notificacaoRadarLocal.ts'),
    chamadas, pedidos, apresentadas, handler: () => handler,
    falhar(value) { falha = value; },
    adiarApresentacao() { apresentar = false; pausarTemporizadores = true; },
    avancarConsulta() { temporizadores.shift()(); },
    bloquearConsulta() { consultaBloqueada = new Promise(resolve => { liberarConsulta = resolve; }); },
    liberarConsulta() { consultaBloqueada = null; liberarConsulta(); },
    apresentarUltima() {
      const pedido = pedidos.at(-1);
      apresentadas.set(pedido.identifier, { request: pedido });
      apresentar = true;
    },
  };
}

test('consulta sem solicitar permissao', async () => {
  const h = carregar({ granted: false });
  assert.deepEqual(h.chamadas, []);
  assert.equal((await h.api.verificarPermissaoNotificacao()).granted, false);
  assert.deepEqual(h.chamadas.map(c => c[0]), ['verificar']);
});

test('simulacao imediata silenciosa com canal e handler', async () => {
  const h = carregar();
  assert.equal(await h.api.testarNotificacaoLocal(), 'exibida');
  assert.deepEqual(h.chamadas.map(c => c[0]), ['handler', 'canal', 'verificar', 'exibir', 'consultar']);
  const canal = h.chamadas.find(c => c[0] === 'canal');
  assert.equal(canal[1], h.api.CANAL_RADAR_TESTE);
  assert.equal(canal[2].name, 'Radar de chegada');
  assert.equal(canal[2].sound, null);
  assert.equal(canal[2].enableVibrate, false);
  const pedido = h.chamadas.find(c => c[0] === 'exibir')[1];
  assert.equal(pedido.content.title, 'NoPonto · Radar');
  assert.equal(pedido.content.body, '838 chegando em 5 min');
  assert.equal(pedido.identifier, h.api.IDENTIFICADOR_RADAR_TESTE);
  assert.equal(pedido.content.sound, false);
  assert.equal(pedido.content.data.simulacao, true);
  assert.equal(pedido.content.data.dadosReais, false);
  assert.equal(pedido.content.data.origem, 'teste-local-n2a');
  assert.equal(pedido.trigger.channelId, canal[1]);
  assert.deepEqual(Object.keys(pedido.trigger), ['channelId']);
  const behavior = await h.handler().handleNotification({ request: pedido });
  assert.equal(behavior.shouldShowBanner, true);
  assert.equal(behavior.shouldShowList, true);
  assert.equal(behavior.shouldPlaySound, false);
  assert.equal(behavior.shouldSetBadge, false);
  assert.equal((await h.handler().handleNotification({ request: { content: { data: {} } } })).shouldShowBanner, false);
});

test('solicita apos acao e aceita autorizacao', async () => {
  const h = carregar({ granted: false });
  assert.deepEqual(h.chamadas, []);
  assert.equal(await h.api.testarNotificacaoLocal(), 'exibida');
  assert.deepEqual(h.chamadas.map(c => c[0]), ['handler', 'canal', 'verificar', 'solicitar', 'exibir', 'consultar']);
});

test('negacao nao exibe nem repete pedido bloqueado', async () => {
  for (const canAskAgain of [true, false]) {
    const h = carregar({ granted: false, canAskAgain, aceitar: false });
    assert.equal(await h.api.testarNotificacaoLocal(), 'negada');
    assert.equal(await h.api.testarNotificacaoLocal('atualizar'), 'negada');
    assert.equal(h.chamadas.some(c => c[0] === 'exibir'), false);
    assert.equal(h.chamadas.filter(c => c[0] === 'solicitar').length, canAskAgain ? 2 : 0);
  }
});

test('falhas nativas retornam erro sem propagar', async () => {
  for (const falha of ['handler', 'canal', 'permissao', 'solicitar', 'exibir', 'consultar']) {
    const h = carregar({ falha, granted: falha !== 'solicitar' });
    assert.equal(await h.api.testarNotificacaoLocal(), 'erro', falha);
    assert.equal(h.chamadas.filter(c => c[0] === 'exibir').length, ['exibir', 'consultar'].includes(falha) ? 1 : 0);
    h.falhar(undefined);
    assert.equal(await h.api.testarNotificacaoLocal('atualizar'), 'exibida', `recupera ${falha}`);
  }
});

test('producao e outras plataformas nao executam teste', async () => {
  for (const options of [{ dev: false }, { os: 'ios' }, { os: 'web' }]) {
    const h = carregar(options);
    assert.equal(await h.api.testarNotificacaoLocal(), 'indisponivel');
    assert.equal(await h.api.testarNotificacaoLocal('atualizar'), 'indisponivel');
    assert.equal(await h.api.encerrarNotificacaoLocal(), 'indisponivel');
    assert.deepEqual(h.chamadas, []);
  }
});

test('identidade estavel em atualizacoes sequenciais', async () => {
  const h = carregar();
  for (const cenario of ['exibir', 'atualizar', 'atualizarNovamente', 'exibir']) {
    assert.equal(await h.api.testarNotificacaoLocal(cenario), 'exibida');
    assert.equal(h.apresentadas.size, 2); // A simulação e a entrada alheia.
    assert.equal(h.apresentadas.get(h.api.IDENTIFICADOR_RADAR_TESTE).request.content.body,
      h.api.CENARIOS_NOTIFICACAO_TESTE[cenario]);
  }
  assert.equal(new Set(h.pedidos.map(p => p.identifier)).size, 1);
  assert.equal(new Set(h.pedidos.map(p => p.content.data.revisaoTeste)).size, 4);
  assert.deepEqual(h.pedidos.map(p => p.content.body), [
    '838 chegando em 5 min', '855 chegando em 3 min', '838 chegando em 2 min', '838 chegando em 5 min',
  ]);
  assert.equal(h.chamadas.some(c => c[0] === 'encerrar'), false);
});

test('concorrencia aguarda apresentacao e preserva ordem ate encerrar', async () => {
  const h = carregar({ apresentar: false });
  h.bloquearConsulta();
  const resultados = [h.api.testarNotificacaoLocal(), h.api.testarNotificacaoLocal('atualizar'),
    h.api.testarNotificacaoLocal('atualizarNovamente'), h.api.encerrarNotificacaoLocal()];
  for (let i = 0; i < 20; i++) await Promise.resolve();
  assert.equal(h.pedidos.length, 1);
  assert.equal(h.chamadas.some(c => c[0] === 'encerrar'), false);
  assert.equal(h.apresentadas.has(h.api.IDENTIFICADOR_RADAR_TESTE), false);
  h.apresentarUltima();
  h.liberarConsulta();
  assert.deepEqual(await Promise.all(resultados), ['exibida', 'exibida', 'exibida', 'encerrada']);
  assert.deepEqual(h.chamadas.filter(c => ['exibir', 'encerrar'].includes(c[0])).map(c =>
    c[0] === 'exibir' ? c[1].content.body : c[0]),
  ['838 chegando em 5 min', '855 chegando em 3 min', '838 chegando em 2 min', 'encerrar']);
  assert.deepEqual([...h.apresentadas.keys()], ['outra-notificacao']);
  assert.equal((await h.handler().handleNotification({ request: h.pedidos.at(-1) })).shouldShowList, false);
});

test('encerramento individual idempotente sem solicitar permissao', async () => {
  const h = carregar({ granted: false });
  assert.equal(await h.api.encerrarNotificacaoLocal(), 'encerrada');
  assert.equal(await h.api.encerrarNotificacaoLocal(), 'encerrada');
  assert.deepEqual(h.chamadas.filter(c => c[0] !== 'consultar'),
    [['encerrar', h.api.IDENTIFICADOR_RADAR_TESTE], ['encerrar', h.api.IDENTIFICADOR_RADAR_TESTE]]);
  assert.deepEqual([...h.apresentadas.keys()], ['outra-notificacao']);
});

test('encerramento seguido de exibicao concorrente respeita nova simulacao', async () => {
  const h = carregar();
  assert.equal(await h.api.testarNotificacaoLocal(), 'exibida');
  const primeiro = h.pedidos[0];
  assert.deepEqual(await Promise.all([h.api.encerrarNotificacaoLocal(),
    h.api.testarNotificacaoLocal('atualizar')]), ['encerrada', 'exibida']);
  assert.equal(h.apresentadas.get(h.api.IDENTIFICADOR_RADAR_TESTE).request.content.body, '855 chegando em 3 min');
  assert.equal((await h.handler().handleNotification({ request: primeiro })).shouldShowList, false);
});

test('timeout e falha ao encerrar retornam erro e permitem nova tentativa', async () => {
  const h = carregar({ apresentar: false });
  assert.equal(await h.api.testarNotificacaoLocal(), 'erro');
  assert.equal(h.chamadas.filter(c => c[0] === 'consultar').length, 50);
  h.apresentarUltima();
  assert.equal(await h.api.testarNotificacaoLocal('atualizar'), 'exibida');
  h.falhar('encerrar');
  assert.equal(await h.api.encerrarNotificacaoLocal(), 'erro');
  assert.equal(h.apresentadas.has(h.api.IDENTIFICADOR_RADAR_TESTE), true);
  h.falhar('remocao-ignorada');
  assert.equal(await h.api.encerrarNotificacaoLocal(), 'erro');
  h.falhar(undefined);
  assert.equal(await h.api.encerrarNotificacaoLocal(), 'encerrada');
  assert.deepEqual([...h.apresentadas.keys()], ['outra-notificacao']);
});

test('fila continua apos falha nativa em chamada concorrente', async () => {
  const h = carregar({ falha: 'exibir' });
  const primeira = h.api.testarNotificacaoLocal();
  const segunda = h.api.encerrarNotificacaoLocal();
  assert.deepEqual(await Promise.all([primeira, segunda]), ['erro', 'encerrada']);
  assert.deepEqual([...h.apresentadas.keys()], ['outra-notificacao']);
});

test('revisao antiga na bandeja nao libera atualizacao nem encerramento', async () => {
  const h = carregar();
  assert.equal(await h.api.testarNotificacaoLocal(), 'exibida');
  h.adiarApresentacao();
  let concluida = false;
  const atualizacao = h.api.testarNotificacaoLocal('atualizar').then(r => { concluida = true; return r; });
  const encerramento = h.api.encerrarNotificacaoLocal();
  for (let i = 0; i < 30; i++) await Promise.resolve();
  assert.equal(h.pedidos.length, 2);
  assert.equal(h.apresentadas.get(h.api.IDENTIFICADOR_RADAR_TESTE).request.content.body, '838 chegando em 5 min');
  assert.equal(concluida, false);
  assert.equal(h.chamadas.some(c => c[0] === 'encerrar'), false);
  h.apresentarUltima();
  h.avancarConsulta();
  assert.equal(await atualizacao, 'exibida');
  assert.equal(await encerramento, 'encerrada');
  assert.deepEqual([...h.apresentadas.keys()], ['outra-notificacao']);
});

test('Radar real e simulacao coexistem e encerramento nao modifica outra identidade', async () => {
  const h = carregar();
  await h.api.testarNotificacaoLocal();
  const idSimulacao = h.api.IDENTIFICADOR_RADAR_TESTE, sim = h.apresentadas.get(idSimulacao);
  const real = h.real.clienteRadarEspera;
  assert.notEqual(h.real.IDENTIFICADOR_RADAR_ESPERA, idSimulacao);
  assert.equal(await real.autorizar(), 'exibida');
  for (const body of ['A chegando', 'C chegando']) {
    assert.equal(await real.publicar({ title: 'Radar real', body, data: { simulacao: false } }), 'exibida');
  }
  assert.equal(h.apresentadas.size, 3);
  assert.equal(h.apresentadas.get(idSimulacao), sim);
  assert.equal((await h.handler().handleNotification(sim)).shouldShowList, true);
  assert.equal((await h.handler().handleNotification(h.apresentadas.get(h.real.IDENTIFICADOR_RADAR_ESPERA))).shouldShowList, true);
  await real.remover();
  assert.equal(h.apresentadas.get(idSimulacao), sim);
  assert.equal(h.apresentadas.has(h.real.IDENTIFICADOR_RADAR_ESPERA), false);
  await real.publicar({ body: 'novo real' });
  await h.api.encerrarNotificacaoLocal();
  assert.equal(h.apresentadas.has(h.real.IDENTIFICADOR_RADAR_ESPERA), true);
});

test('atualizacao automatica real nunca solicita permissao e validade impede envio', async () => {
  const h = carregar({ granted: false });
  assert.equal(await h.real.clienteRadarEspera.publicar({ body: 'real' }), 'negada');
  assert.equal(h.chamadas.some(c => c[0] === 'solicitar'), false);
  const autorizado = carregar();
  assert.equal(await autorizado.real.clienteRadarEspera.publicar({ body: 'cancelado' }, false, () => false), 'cancelada');
  assert.equal(autorizado.pedidos.length, 0);
});

test('pausa durante confirmacao nativa cancela somente publicacao real em voo', async () => {
  const h = carregar(); await h.api.testarNotificacaoLocal();
  const sim = h.apresentadas.get(h.api.IDENTIFICADOR_RADAR_TESTE);
  h.adiarApresentacao(); h.bloquearConsulta();
  let vigente = true;
  const real = h.real.clienteRadarEspera;
  const publicacao = real.publicar({ body: 'real' }, false, () => vigente);
  for (let i = 0; i < 20; i++) await Promise.resolve();
  vigente = false; real.invalidar(); const encerramento = real.remover();
  h.apresentarUltima(); h.liberarConsulta();
  assert.equal(await publicacao, 'cancelada'); assert.equal(await encerramento, 'encerrada');
  assert.equal(h.apresentadas.get(h.api.IDENTIFICADOR_RADAR_TESTE), sim);
  assert.equal(h.apresentadas.has(h.real.IDENTIFICADOR_RADAR_ESPERA), false);
});
