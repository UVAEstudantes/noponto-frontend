/* global __dirname */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

function fixture() {
  const calls = [];
  const events = new Map();
  let builds = 0;
  const connection = {
    state: 'Disconnected',
    on: (name, handler) => events.set(name, handler),
    onreconnecting: (handler) => { connection.reconnecting = handler; },
    onreconnected: (handler) => { connection.reconnected = handler; },
    onclose: (handler) => { connection.closed = handler; },
    start: async () => { connection.state = 'Connected'; },
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
    if (name === '@microsoft/signalr') return { HubConnectionBuilder: Builder,
      HubConnectionState: { Connected: 'Connected', Connecting: 'Connecting' } };
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
  return { api: mod.exports, connection, calls, events, builds: () => builds };
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
