const test = require('node:test');
const assert = require('node:assert/strict');
const { criarHarness } = require('./radarTestHarness.cjs');
const { criarRadarRemoto } = require('../services/radarRemotoCore.ts');

function mount() {
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
      if (route === '/radar/instalacao') return { credencialExpiraEm: '2027-05-01T00:00:00Z' };
      if (route === '/radar/instalacao/push') return { registered: true, possessionConfirmed: true };
      if (method === 'GET' && route === '/radar/sessao') return session;
      if (method === 'PUT') { session = { ...session, ...body, revisao: session.revisao + 1 }; return session; }
      if (method === 'DELETE') { session = null; return null; }
      throw new Error('Unexpected request');
    },
  });
  const oldFlag = process.env.EXPO_PUBLIC_RADAR_REMOTE_ENABLED;
  process.env.EXPO_PUBLIC_RADAR_REMOTE_ENABLED = 'true';
  const { useRadarEspera } = h.carregar('useRadarEspera.ts', {
    'react-native': { AppState: h.appState, Platform: { OS: 'android' } },
    '../services/storage': { carregarPreferenciasRadarEspera: async () => ({ prioritarias: [], janelaMinutos: 10 }), salvarPreferenciasRadarEspera: async () => {} },
    '../services/radarRemotoAndroid': { radarRemotoAndroid: remote },
    '../services/notificacaoRadarLocal': { clienteRadarEspera: { invalidar() {}, remover: async () => { local.push('remove-local'); return 'encerrada'; },
      autorizar: async () => { local.push('authorize-local'); return 'exibida'; }, publicar: async () => { local.push('publish-local'); return 'exibida'; } } },
  });
  if (oldFlag === undefined) delete process.env.EXPO_PUBLIC_RADAR_REMOTE_ENABLED; else process.env.EXPO_PUBLIC_RADAR_REMOTE_ENABLED = oldFlag;
  const render = () => h.render(() => useRadarEspera(input)); render();
  return { h, input, render, calls, local, remote };
}

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
