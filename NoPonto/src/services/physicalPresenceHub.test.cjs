/* global __dirname */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

function fixture(initialState = 'active') {
  let appState = initialState; let onAppState; let starts = 0; let stops = 0;
  const calls = [];
  const events = new Map();
  let builds = 0;
  const connection = {
    state: 'Disconnected',
    on: (name, handler) => events.set(name, handler),
    onreconnecting: (handler) => { connection.reconnecting = handler; },
    onreconnected: (handler) => { connection.reconnected = handler; },
    onclose: (handler) => { connection.closed = handler; },
    start: async () => { starts++; connection.state = 'Connected'; },
    stop: async () => { stops++; connection.state = 'Disconnected'; connection.closed?.(); },
    invoke: async (method, id) => { calls.push([method, id]); },
  };
  class Builder {
    withUrl() { return this; }
    withAutomaticReconnect() { return this; }
    build() { builds++; return connection; }
  }
  const filename = path.join(__dirname, 'gpsHub.ts');
  const mod = new Module(filename, module);
  mod.require = (name) => {
    if (name === 'react-native') return { Platform: { OS: 'android' }, AppState: { currentState: appState, addEventListener: (_, fn) => { onAppState = fn; } } };
    if (name === '@microsoft/signalr') return { HubConnectionBuilder: Builder,
      HubConnectionState: { Connected: 'Connected', Connecting: 'Connecting', Disconnected: 'Disconnected' } };
    if (name === '@/src/config/env') return { config: { GPS_HUB_URL: 'fixture://hub' } };
    if (name === './veiculosMapa') return { adaptarPosicaoRodoviariaV2: (item) => item };
    if (name === './gpsSnapshotGuard') return { gpsSnapshotGuard: {
      invalidarLeituras() {}, filtrarSnapshot: (items) => items, registrarVazio() {} },
      codigoLinhaEsvaziada: () => null };
    if (name === './roadPresenceDiagnostics') return {
      traceRoadBatch() {}, traceRoadLineEmpty() {}, traceRoadRaw() {} };
    throw new Error(`Unexpected import ${name}`);
  };
  global.__DEV__ = false;
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
  return { api: mod.exports, connection, calls, events, builds: () => builds, starts: () => starts, stops: () => stops, appState: state => { appState = state; onAppState(state); } };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

test('unified pilot shares the hub and restores its versioned subscription after reconnect', async () => {
  const f = fixture(); const received = [];
  const stop = f.api.observePhysicalPresence(Symbol('unified'), ['unified:838'], item => received.push(item));
  await tick(); await tick();
  assert.equal(f.builds(), 1); assert.deepEqual(f.calls, [['InscreverLocalizacaoUnificada','838']]);
  const snapshot = {schemaVersion:1,lineCode:'838',revision:2,vehicles:[]};
  f.events.get('LocalizacaoUnificadaAtualizada')(snapshot); assert.equal(received.at(-1), snapshot);
  f.connection.reconnected(); await tick(); await tick();
  assert.deepEqual(f.calls.at(-1), ['InscreverLocalizacaoUnificada','838']);
  stop(); await tick(); assert.deepEqual(f.calls.at(-1), ['CancelarLocalizacaoUnificada','838']);
});
test('rollback to a server without the unified method explicitly restores legacy capability', async () => {
  const f = fixture(); const seen=[];
  f.connection.invoke=async()=>{throw new Error("Unknown hub method 'InscreverLocalizacaoUnificada'");};
  const stop=f.api.observePhysicalPresence(Symbol('unified'),['unified:838'],x=>seen.push(x));
  await tick();await tick();
  assert.ok(seen.some(x=>x.unifiedLocationUnavailable===true));stop();await tick();
});

test('physical snapshots share the operational hub and reconcile after reconnect', async () => {
  const f = fixture();
  const received = [];
  const stop1 = f.api.observePhysicalPresence(Symbol('map'), ['terminal-a'], (x) => received.push(['map', x]));
  const stop2 = f.api.observePhysicalPresence(Symbol('radar'), ['terminal-a'], (x) => received.push(['radar', x]));
  await tick(); await tick();
  assert.equal(f.builds(), 1);
  assert.deepEqual(f.calls, [['InscreverPresencaFisica', 'terminal-a']]);
  const snapshot = { facilityStopId: 'terminal-a', generation: 1, vehicles: [] };
  f.events.get('PresencaFisicaAtualizada')(snapshot);
  assert.deepEqual(received, [['map', snapshot], ['radar', snapshot]]);

  f.connection.reconnecting();
  assert.equal(received.at(-1)[1].resetPhysicalPresence, true);
  f.connection.reconnected();
  await tick(); await tick();
  assert.deepEqual(f.calls[1], ['InscreverPresencaFisica', 'terminal-a']);
  stop1(); await tick();
  assert.equal(f.calls.filter(([method]) => method === 'CancelarPresencaFisica').length, 0);
  stop2(); await tick();
  assert.deepEqual(f.calls.at(-1), ['CancelarPresencaFisica', 'terminal-a']);
});


test('843 and 838 share one connection and resubscribe independently after reconnect',async()=>{
 const f=fixture(),seen=[];const stop=f.api.observePhysicalPresence(Symbol('two'),['unified:838','unified:843'],x=>seen.push(x));
 await tick();await tick();assert.equal(f.builds(),1);
 assert.deepEqual(f.calls,[['InscreverLocalizacaoUnificada','838'],['InscreverLocalizacaoUnificada','843']]);
 f.connection.reconnected();await tick();await tick();
 assert.deepEqual(f.calls.slice(-2),[['InscreverLocalizacaoUnificada','838'],['InscreverLocalizacaoUnificada','843']]);
 const s={schemaVersion:1,lineCode:'843',revision:1,vehicles:[]};f.events.get('LocalizacaoUnificadaAtualizada')(s);assert.equal(seen.at(-1),s);
 stop();await tick();assert.deepEqual(f.calls.slice(-2),[['CancelarLocalizacaoUnificada','838'],['CancelarLocalizacaoUnificada','843']]);
});

test('network subscriptions deduplicate owners and cancel only removed service',async()=>{
 const f=fixture(),a=f.api.observePhysicalPresence(Symbol('a'),['unified:SP864','unified:621'],()=>{}),
 b=f.api.observePhysicalPresence(Symbol('b'),['unified:621'],()=>{});
 await tick();await tick();assert.equal(f.builds(),1);
 assert.equal(f.calls.filter(([m,id])=>m==='InscreverLocalizacaoUnificada'&&id==='621').length,1);
 a();await tick();await tick();assert.ok(f.calls.some(([m,id])=>m==='CancelarLocalizacaoUnificada'&&id==='SP864'));
 assert.equal(f.calls.filter(([m,id])=>m==='CancelarLocalizacaoUnificada'&&id==='621').length,0);
 f.connection.reconnected();await tick();await tick();assert.deepEqual(f.calls.at(-1),['InscreverLocalizacaoUnificada','621']);
 b();await tick();await tick();assert.deepEqual(f.calls.at(-1),['CancelarLocalizacaoUnificada','621']);
});

test('838 855 stop radar shares map subscriptions and releases only its own lines and listeners',async()=>{
 const f=fixture(),mapFrames=[],radarFrames=[];
 const closeMap=f.api.observePhysicalPresence(Symbol('map'),['unified:838'],v=>mapFrames.push(v));
 const closeRadar=f.api.observePhysicalPresence(Symbol('stop-radar'),['unified:838','unified:855','unified:855'],v=>radarFrames.push(v));
 await tick();await tick();
 assert.equal(f.builds(),1);
 assert.deepEqual(f.calls,[['InscreverLocalizacaoUnificada','838'],['InscreverLocalizacaoUnificada','855']]);
 const frame={schemaVersion:1,lineCode:'855',revision:1,vehicles:[]};
 f.events.get('LocalizacaoUnificadaAtualizada')(frame);assert.equal(radarFrames.at(-1),frame);
 closeRadar();await tick();await tick();const size=radarFrames.length;
 f.events.get('LocalizacaoUnificadaAtualizada')({...frame,revision:2});assert.equal(radarFrames.length,size);
 assert.equal(f.calls.some(([m,id])=>m==='CancelarLocalizacaoUnificada'&&id==='838'),false);
 assert.deepEqual(f.calls.at(-1),['CancelarLocalizacaoUnificada','855']);
 f.connection.reconnected();await tick();await tick();assert.deepEqual(f.calls.at(-1),['InscreverLocalizacaoUnificada','838']);
 closeMap();await tick();await tick();assert.deepEqual(f.calls.at(-1),['CancelarLocalizacaoUnificada','838']);
 assert.equal(f.api.obterDiagnosticoGpsHub().subscribers,0);
});

test('background stops both registries and foreground restores retained owners', async () => {
  const f = fixture(), owner = Symbol('map');
  f.api.iniciarGpsHub(() => {});
  await f.api.atualizarInscricoesGps(owner, ['838']);
  const close = f.api.observePhysicalPresence(Symbol('physical'), ['terminal', 'unified:838'], () => {});
  await tick();
  f.appState('inactive'); await tick(); assert.equal(f.stops(), 0);
  f.appState('background'); await tick();
  assert.equal(f.connection.state, 'Disconnected'); assert.equal(f.stops(), 1);
  const before = f.calls.length;
  await f.api.atualizarInscricoesGps(owner, ['855']);
  f.connection.reconnected(); await tick(); assert.equal(f.calls.length, before);
  f.appState('active'); await tick(); await tick();
  assert.equal(f.starts(), 2);
  assert.deepEqual(f.calls.slice(before).sort(), [
    ['InscreverseLinha', '855'], ['InscreverPresencaFisica', 'terminal'], ['InscreverLocalizacaoUnificada', '838'],
  ].sort());
  close(); await f.api.atualizarInscricoesGps(owner, []); await tick();
  assert.equal(f.connection.state, 'Disconnected');
});

test('background mounting and direct subscriptions cannot open the connection', async () => {
  const f = fixture('background'); f.api.iniciarGpsHub(() => {});
  await f.api.inscreverLinha('838');
  const close = f.api.observePhysicalPresence(Symbol('u'), ['unified:838'], () => {});
  await tick(); await f.api.conectarGpsHub();
  assert.equal(f.starts(), 0); assert.deepEqual(f.calls, []);
  f.appState('active'); await tick(); await tick();
  assert.equal(f.starts(), 1); assert.equal(f.calls.length, 2);
  await f.api.cancelarLinha('838'); close(); await tick();
  assert.equal(f.connection.state, 'Disconnected');
});

test('multiple owners keep shared lines until the last owner leaves', async () => {
  const f = fixture(), a = Symbol('a'), b = Symbol('b'); f.api.iniciarGpsHub(() => {});
  await Promise.all([f.api.atualizarInscricoesGps(a, ['838']), f.api.atualizarInscricoesGps(b, ['838'])]);
  assert.deepEqual(f.calls, [['InscreverseLinha', '838']]);
  f.appState('background'); await tick();
  await f.api.atualizarInscricoesGps(a, []);
  f.appState('active'); await tick(); await tick();
  assert.deepEqual(f.calls.at(-1), ['InscreverseLinha', '838']);
  await f.api.inscreverLinha('838'); await f.api.cancelarLinha('838');
  assert.equal(f.calls.filter(([m]) => m === 'CancelarLinha').length, 0);
  await f.api.atualizarInscricoesGps(b, []); await tick();
  assert.equal(f.connection.state, 'Disconnected');
});

for (const physical of [false, true]) test(`pending ${physical ? 'physical' : 'GPS'} invoke cannot resurrect a background subscription`, async () => {
  const f = fixture(); let release;
  const original = f.connection.invoke;
  f.connection.invoke = async (method, id) => {
    await original(method, id);
    if (id === '838') await new Promise(resolve => { release = resolve; });
  };
  f.api.iniciarGpsHub(() => {});
  if (physical) f.api.observePhysicalPresence(Symbol('p'), ['838', '855'], () => {});
  else void f.api.atualizarInscricoesGps(Symbol('gps'), ['838', '855']);
  await tick(); assert.equal(typeof release, 'function');
  f.appState('background'); await tick(); release(); await tick();
  assert.equal(f.calls.some(([, id]) => id === '855'), false);
  assert.equal(f.connection.state, 'Disconnected');
  f.connection.invoke = original;
  f.appState('active'); await tick(); await tick();
  assert.deepEqual(f.calls.slice(-2).map(([, id]) => id), ['838', '855']);
});

test('foreground reconnect restores both registries and fresh frames only', async () => {
  const f = fixture(), frames = [];
  f.api.iniciarGpsHub(() => {});
  await f.api.atualizarInscricoesGps(Symbol('gps'), ['838']);
  f.api.observePhysicalPresence(Symbol('unified'), ['unified:838'], frame => frames.push(frame));
  await tick(); f.appState('background'); await tick();
  const before = frames.length;
  f.events.get('LocalizacaoUnificadaAtualizada')({ revision: 1 }); assert.equal(frames.length, before);
  f.appState('active'); await tick(); await tick();
  const snapshot = { revision: 2 }; f.events.get('LocalizacaoUnificadaAtualizada')(snapshot);
  assert.equal(frames.at(-1), snapshot);
  const count = f.calls.length;
  f.connection.reconnecting(); f.connection.reconnected(); await tick(); await tick();
  assert.deepEqual(f.calls.slice(count).sort(), [['InscreverseLinha', '838'], ['InscreverLocalizacaoUnificada', '838']].sort());
});

test('no owners means no connection even when listeners request a start', async () => {
  const f = fixture(); f.api.iniciarGpsHub(() => {}); await f.api.conectarGpsHub();
  await f.api.reconciliarInscricoesGps(); await tick();
  assert.equal(f.starts(), 0); assert.deepEqual(f.calls, []);
});

test('rapid foreground waits for stop before restoring both registries', async () => {
  const f = fixture(); f.api.iniciarGpsHub(() => {});
  await f.api.atualizarInscricoesGps(Symbol('gps'), ['838']);
  f.api.observePhysicalPresence(Symbol('u'), ['unified:838'], () => {}); await tick();
  const original = f.connection.stop; let release;
  f.connection.stop = async () => { await new Promise(resolve => { release = resolve; }); await original(); };
  f.appState('background'); await tick();
  f.appState('active'); await tick();
  assert.equal(f.starts(), 1);
  release(); await tick(); await tick();
  assert.equal(f.starts(), 2);
  assert.deepEqual(f.calls.slice(-2).sort(), [['InscreverseLinha', '838'], ['InscreverLocalizacaoUnificada', '838']].sort());
});

test('failed start retains owners and a later foreground retries', async () => {
  const f = fixture(); f.api.iniciarGpsHub(() => {});
  const original = f.connection.start;
  f.connection.start = async () => { throw new Error('fixture start failure'); };
  await f.api.atualizarInscricoesGps(Symbol('gps'), ['838']);
  assert.deepEqual(f.calls, []);
  f.connection.start = original;
  f.appState('background'); await tick(); f.appState('active'); await tick(); await tick();
  assert.deepEqual(f.calls, [['InscreverseLinha', '838']]);
});

test('physical subscription failure on foreground recovers after reconnect', async () => {
  const f = fixture('background');
  f.api.observePhysicalPresence(Symbol('u'), ['unified:838'], () => {});
  await tick();
  f.connection.invoke = async () => { throw new Error('fixture invoke failure'); };
  f.appState('active'); await tick(); await tick();
  assert.equal(f.connection.state, 'Connected'); assert.deepEqual(f.calls, []);
  f.connection.invoke = async (method, id) => { f.calls.push([method, id]); };
  f.connection.reconnected(); await tick(); await tick();
  assert.deepEqual(f.calls, [['InscreverLocalizacaoUnificada', '838']]);
});
