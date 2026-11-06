const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function carregar({ granted = true, canAskAgain = true, aceitar = true,
  dev = true, os = 'android', falha } = {}) {
  const chamadas = [];
  let handler;
  const notifications = {
    AndroidImportance: { DEFAULT: 3 },
    setNotificationHandler(value) { handler = value; chamadas.push(['handler']); },
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
      return 'notification-id';
    },
  };
  const filename = path.join(__dirname, 'notificacaoLocalTeste.ts');
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(output, { exports, __DEV__: dev,
    require(id) {
      if (id === 'react-native') return { Platform: { OS: os } };
      if (id === 'expo-notifications') return notifications;
      throw Error(`Dependencia inesperada: ${id}`);
    },
  }, { filename });
  return { api: exports, chamadas, handler: () => handler };
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
  assert.deepEqual(h.chamadas.map(c => c[0]), ['handler', 'canal', 'verificar', 'exibir']);
  const canal = h.chamadas.find(c => c[0] === 'canal');
  assert.equal(canal[1], h.api.CANAL_RADAR_TESTE);
  assert.equal(canal[2].name, 'Radar de chegada');
  assert.equal(canal[2].sound, null);
  assert.equal(canal[2].enableVibrate, false);
  const pedido = h.chamadas.find(c => c[0] === 'exibir')[1];
  assert.equal(pedido.content.title, 'NoPonto · Radar');
  assert.equal(pedido.content.body, '838 chegando em aproximadamente 5 minutos');
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
  assert.deepEqual(h.chamadas.map(c => c[0]), ['handler', 'canal', 'verificar', 'solicitar', 'exibir']);
});

test('negacao nao exibe nem repete pedido bloqueado', async () => {
  for (const canAskAgain of [true, false]) {
    const h = carregar({ granted: false, canAskAgain, aceitar: false });
    assert.equal(await h.api.testarNotificacaoLocal(), 'negada');
    assert.equal(h.chamadas.some(c => c[0] === 'exibir'), false);
    assert.equal(h.chamadas.filter(c => c[0] === 'solicitar').length, canAskAgain ? 1 : 0);
  }
});

test('falhas nativas retornam erro sem propagar', async () => {
  for (const falha of ['canal', 'permissao', 'solicitar', 'exibir']) {
    const h = carregar({ falha, granted: falha !== 'solicitar' });
    assert.equal(await h.api.testarNotificacaoLocal(), 'erro', falha);
    assert.equal(h.chamadas.filter(c => c[0] === 'exibir').length, falha === 'exibir' ? 1 : 0);
  }
});

test('producao e outras plataformas nao executam teste', async () => {
  for (const options of [{ dev: false }, { os: 'ios' }, { os: 'web' }]) {
    const h = carregar(options);
    assert.equal(await h.api.testarNotificacaoLocal(), 'indisponivel');
    assert.deepEqual(h.chamadas, []);
  }
});
