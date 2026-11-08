const test = require('node:test');
const assert = require('node:assert/strict');
const { criarHarness } = require('../hooks/radarTestHarness.cjs');
const { criarRadarRemoto, ErroRadarRemoto } = require('./radarRemotoCore.ts');

function fixture() {
  const h = criarHarness(), calls = [];
  let listener, native = 'synthetic-first', emissions = 0, failNext = false;
  const secure = new Map([
    ['radar.installation.v1', JSON.stringify({ credencial: 'synthetic', instalacaoId: 'test', credencialExpiraEm: '2027-12-01T00:00:00Z' })],
    ['radar.token.v1', 'ExpoPushToken[synthetic-first]'],
  ]);
  const session = { sessaoId: 'test', revisao: 1, estado: 'ativa', expiraEm: '2027-12-01T00:00:00Z' };
  const remote = h.carregar('../services/radarRemotoAndroid.ts', {
    'react-native': { AppState: h.appState, Platform: { OS: 'android' } },
    'expo-notifications': {
      AndroidImportance: { LOW: 1 }, setNotificationChannelAsync: async () => {},
      getPermissionsAsync: async () => ({ granted: true }),
      // Installed Expo Android emits onNewToken even when merely reading the same token.
      getDevicePushTokenAsync: async () => {
        const token = { type: 'android', data: native };
        // Bound the old loop so a regression fails instead of hanging the test runner.
        if (emissions++ < 6) listener(token);
        return token;
      },
      getExpoPushTokenAsync: async ({ devicePushToken }) => ({ data: `ExpoPushToken[${devicePushToken.data}]` }),
      addPushTokenListener: fn => { listener = fn; },
      addNotificationReceivedListener() {}, addNotificationResponseReceivedListener() {},
      getPresentedNotificationsAsync: async () => [],
    },
    'expo-secure-store': { getItemAsync: async key => secure.get(key) ?? null,
      setItemAsync: async (key, value) => { secure.set(key, value); }, deleteItemAsync: async key => { secure.delete(key); } },
    'expo-crypto': { randomUUID: () => 'synthetic-enrollment' },
    'expo-constants': { __esModule: true, default: { easConfig: { projectId: 'test' } } },
    './notificacaoLocalCanal': { configurarRecebimentoRemoto() {} },
    './notificacaoRadarLocal': { clienteRadarEspera: { invalidar() {}, remover: async () => {} } },
    './radarRemotoCore': { ErroRadarRemoto, criarRadarRemoto: port => criarRadarRemoto({ ...port,
      async request(method, route) {
        calls.push({ method, route });
        if (failNext) { failNext = false; throw new Error('Synthetic network failure'); }
        if (route === '/radar/instalacao') return { credencialExpiraEm: '2027-12-01T00:00:00Z' };
        if (route === '/radar/sessao') return session;
        if (route === '/radar/instalacao/push') return { registered: true, possessionConfirmed: true };
        if (route.endsWith('/confirmacoes')) return {};
        throw new Error('Unexpected request');
      },
    }) },
  }).radarRemotoAndroid;
  return { h, calls, remote,
    event: () => listener({ type: 'android', data: native }),
    rotate: () => { native = 'synthetic-second'; },
    fail: () => { failNext = true; },
  };
}
async function settle() { for (let i = 0; i < 600; i++) await Promise.resolve(); }
const installations = f => f.calls.filter(c => c.route === '/radar/instalacao').length;

test('native token reads stop reconciling when Expo repeats the same token', async () => {
  const f = fixture();
  await f.remote.reconciliar(); await settle();
  // Initial reconciliation plus at most the first native token notification; no self-sustaining loop.
  assert.equal(installations(f), 2);
  assert.equal(f.calls.length, 6);
  for (let i = 0; i < 62; i++) f.event();
  await settle();
  assert.equal(f.calls.length, 6);
  assert.equal(f.remote.estado.modo, 'ativo');
});

test('real token rotation reconciles and enrolls once despite repeated concurrent notifications', async () => {
  const f = fixture(); await f.remote.reconciliar(); await settle();
  const before = installations(f);
  f.rotate(); for (let i = 0; i < 20; i++) f.event();
  await settle();
  assert.equal(installations(f), before + 1);
  assert.equal(f.calls.filter(c => c.route.endsWith('/confirmacoes')).length, 1);
  assert.equal(f.remote.estado.modo, 'pendente');
});

test('background token change defers network and foreground reconciliation still reads session', async () => {
  const f = fixture(); await f.remote.reconciliar(); await settle();
  const before = f.calls.length;
  f.h.appState.currentState = 'background'; f.rotate(); f.event(); await settle();
  assert.equal(f.calls.length, before);
  f.h.appState.currentState = 'active';
  await f.remote.reconciliar(); await settle();
  assert.equal(f.calls.filter(c => c.route === '/radar/sessao').length, 3);
  assert.equal(f.calls.filter(c => c.route.endsWith('/confirmacoes')).length, 1);
});

test('failed reconciliation can recover explicitly with unchanged native token', async () => {
  const f = fixture(); await f.remote.reconciliar(); await settle();
  f.fail(); await f.remote.reconciliar();
  assert.match(f.remote.estado.mensagem, /Confira a conexão/);
  await f.remote.reconciliar(); await settle();
  assert.equal(f.remote.estado.modo, 'ativo');
  assert.equal(f.remote.estado.mensagem, null);
  assert.equal(installations(f), 4);
});

test('duplicate token events do not enqueue reads behind a concurrent configuration update', async () => {
  const f = fixture(); await f.remote.reconciliar(); await settle();
  const before = f.calls.length;
  const update = f.remote.atualizar({ paradaId: 'test', contextos: [],
    linhasSelecionadas: ['838'], linhasPrioritarias: [], antecedenciaMinutos: 5 });
  for (let i = 0; i < 20; i++) f.event();
  await update; await settle();
  assert.deepEqual(f.calls.slice(before), [
    { method: 'GET', route: '/radar/sessao' },
    { method: 'PUT', route: '/radar/sessao' },
  ]);
  assert.equal(f.remote.estado.modo, 'ativo');
});
