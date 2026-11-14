const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => {resolve = done;}); return {promise, resolve}; };
function compile(filename, mocks) {
  const m = new Module(filename, module);
  m.require = id => {assert.ok(id in mocks, id); return mocks[id];};
  m._compile('const __DEV__ = false;\n' + ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true},
  }).outputText, filename);
  return m.exports;
}
function button(props, pending = {current: null}) {
  return compile(__dirname + '/../components/mapaComponents/localButton.tsx', {
    react: {...React, useRef: () => pending}, 'react-native': {Pressable: 'Pressable'}, 'lucide-react-native': {LocateFixed: 'Icon'},
    '@/src/hooks/useTema': {useTema: () => ({cores: {}})},
  }).default(props);
}
function fixture() {
  let starts = 0, stops = 0, overlaps = 0, failures = 0, active = 0, appState, onGateway;
  const events = {}, calls = [];
  const hub = {
    state: 'Disconnected', startGate: null, stopGate: null,
    on: (key, fn) => {events[key] = fn;},
    onclose: fn => {hub.closed = fn;}, onreconnecting: fn => {hub.reconnecting = fn;}, onreconnected: fn => {hub.reconnected = fn;},
    async start() {if (hub.state !== 'Disconnected') overlaps++; starts++;hub.state = 'Connecting';await hub.startGate?.promise;hub.state = 'Connected';},
    async stop() {if (hub.state === 'Connecting') overlaps++;stops++;hub.state = 'Disconnecting';await hub.stopGate?.promise;hub.state = 'Disconnected';hub.closed?.();},
    async invoke(method, id) {assert.equal(hub.state, 'Connected');calls.push([method, id]);},
  };
  class Builder {withUrl() {return this;} withAutomaticReconnect() {return this;} build() {return hub;}}
  const mocks = {
    'react-native': {Platform: {OS: 'android'}, AppState: {currentState: 'active', addEventListener: (_, fn) => {appState = fn;}}},
    '@microsoft/signalr': {HubConnectionBuilder: Builder, HubConnectionState: Object.fromEntries(['Disconnected','Connecting','Connected','Disconnecting','Reconnecting'].map(x=>[x,x]))},
    './gateway': {gatewayHubUrl: () => `https://${active ? 'reserve' : 'primary'}.test/hub/gps`, gateway: {
      snapshot: () => ({active, status: 'online'}), subscribe: fn => {onGateway = fn;}, hubFailure: () => {failures++;}, hubConnected() {},
    }},
    './veiculosMapa': {adaptarPosicaoRodoviariaV2: x => x},
    './gpsSnapshotGuard': {codigoLinhaEsvaziada: x => x?.linha ?? null, gpsSnapshotGuard: {invalidarLeituras() {}, filtrarSnapshot: x => x, registrarVazio() {}}},
    './roadPresenceDiagnostics': {traceRoadBatch() {}, traceRoadLineEmpty() {}, traceRoadRaw() {}},
  };
  const api = compile(__dirname + '/gpsHub.ts', mocks);
  return {api, hub, calls, state: state => appState(state), switchGateway: () => {active = 1;onGateway();},
    metrics: () => ({starts, stops, overlaps, failures}), emit: () => events.PosicaoAtualizada([{ordem:'bus',linha:'838'}]),
    emitUnified: () => events.LocalizacaoUnificadaAtualizada({lineCode:'838',revision:1})};
}

test('rapid locate presses with a position move camera without requesting GPS or restarting hub', async () => {
  const f = fixture(), owner = Symbol('map'); let positions = 0, requests = 0, centers = 0;
  f.api.iniciarGpsHub(() => positions++); await f.api.atualizarInscricoesGps(owner, ['838']);
  for (let i = 0; i < 30; i++) button({location:{coords:{latitude:-22,longitude:-43}}, mapRef:{current:{centerOnUser:()=>centers++}}, onRequestLocation:async()=>{requests++;}}).props.onPress();
  assert.equal(requests, 0);assert.equal(centers, 30);assert.deepEqual(f.metrics(), {starts:1,stops:0,overlaps:0,failures:0});
  f.emit();assert.equal(positions, 1);assert.equal(f.api.obterDiagnosticoGpsHub().subscribers, 1);
});
test('background during negotiation serializes stop and foreground restores subscribed positions', async () => {
  const f=fixture();let positions=0;f.api.iniciarGpsHub(()=>positions++);f.hub.startGate=deferred();
  const pending=f.api.atualizarInscricoesGps(Symbol('map'),['838']);await tick();assert.equal(f.hub.state,'Connecting');
  let centers=0;const locate=button({location:{coords:{}},mapRef:{current:{centerOnUser:()=>centers++}},onRequestLocation:async()=>{throw Error('unexpected GPS request');}});
  for(let i=0;i<20;i++)locate.props.onPress();assert.equal(centers,20);assert.equal(f.metrics().starts,1);
  f.state('background');await tick();assert.equal(f.metrics().overlaps,0);assert.equal(f.metrics().stops,0);
  f.state('active');f.hub.startGate.resolve();await pending;await tick();await tick();
  assert.equal(f.hub.state,'Connected');assert.equal(f.metrics().overlaps,0);assert.equal(f.metrics().failures,0);
  f.emit();assert.equal(positions,1);assert.equal(f.calls.at(-1)[0],'InscreverseLinha');
});
test('remount during pending start keeps one hub and deduplicates owned line subscriptions', async () => {
  const f=fixture(), owner=Symbol('map');let received=0;
  const old=()=>{throw Error('removed listener received a frame');};f.api.iniciarGpsHub(old);f.hub.startGate=deferred();
  const initial=f.api.atualizarInscricoesGps(owner,['838']);await tick();
  f.api.removerGpsHubListener(old);const removing=f.api.atualizarInscricoesGps(owner,[]);
  for(let i=0;i<20;i++){const temp=()=>{};f.api.iniciarGpsHub(temp);f.api.removerGpsHubListener(temp);}
  const fresh=()=>received++;f.api.iniciarGpsHub(fresh);const restored=f.api.atualizarInscricoesGps(owner,['838']);
  f.hub.startGate.resolve();await Promise.all([initial,removing,restored]);await tick();
  assert.deepEqual(f.metrics(),{starts:1,stops:0,overlaps:0,failures:0});assert.equal(f.calls.filter(x=>x[0]==='InscreverseLinha').length,1);
  f.emit();assert.equal(received,1);assert.equal(f.api.obterDiagnosticoGpsHub().subscribers,1);
});
test('requests while disconnecting wait for stop then restore one subscription', async()=>{
 const f=fixture(),owner=Symbol('map');let received=0;f.api.iniciarGpsHub(()=>received++);await f.api.atualizarInscricoesGps(owner,['838']);
 f.hub.stopGate=deferred();f.state('background');await tick();assert.equal(f.hub.state,'Disconnecting');
 let centers=0;const locate=button({location:{coords:{}},mapRef:{current:{centerOnUser:()=>centers++}},onRequestLocation:async()=>{throw Error('unexpected GPS request');}});
 for(let i=0;i<20;i++)locate.props.onPress();assert.equal(centers,20);
 f.state('active');const pending=Array.from({length:20},()=>f.api.conectarGpsHub());await tick();assert.equal(f.metrics().starts,1);
 f.hub.stopGate.resolve();await Promise.all(pending);await tick();await tick();
 assert.equal(f.hub.state,'Connected');assert.deepEqual(f.metrics(),{starts:2,stops:1,overlaps:0,failures:0});f.emit();assert.equal(received,1);
});
test('gateway change waits for negotiation and restores owners on reserve',async()=>{
 const f=fixture();let received=0;f.api.iniciarGpsHub(()=>received++);f.hub.startGate=deferred();
 const pending=f.api.atualizarInscricoesGps(Symbol('map'),['838']);await tick();f.switchGateway();await tick();
 assert.equal(f.metrics().stops,0);f.hub.startGate.resolve();await pending;await tick();await tick();
 assert.equal(f.hub.baseUrl,'https://reserve.test/hub/gps');assert.equal(f.hub.state,'Connected');assert.equal(f.metrics().overlaps,0);assert.equal(f.metrics().failures,0);
 f.emit();assert.equal(received,1);
});

test('initial position acquisition is shared across presses and location rerenders use camera only',async()=>{
 const gate=deferred(),pending={current:null};let requests=0,centers=0;
 const props={location:null,mapRef:{current:{centerOnUser:()=>centers++}},onRequestLocation:async()=>{requests++;await gate.promise;}};
 for(let i=0;i<20;i++)button(props,pending).props.onPress();await tick();assert.equal(requests,1);
 gate.resolve();await tick();assert.equal(pending.current,null);
 button({...props,location:{coords:{latitude:1,longitude:1}}},pending).props.onPress();assert.equal(centers,1);assert.equal(requests,1);
});
test('failed initial position request can be retried without leaving a rejected pending request',async()=>{
 const pending={current:null};let requests=0;
 const props={location:null,mapRef:{current:{}},onRequestLocation:async()=>{requests++;throw Error('GPS unavailable');}};
 button(props,pending).props.onPress();await tick();assert.equal(pending.current,null);
 button(props,pending).props.onPress();await tick();assert.equal(requests,2);assert.equal(pending.current,null);
});
test('automatic reconnect owns reconnecting state and restores both registries once',async()=>{
 const f=fixture();let gps=0,physical=0;f.api.iniciarGpsHub(()=>gps++);
 await f.api.atualizarInscricoesGps(Symbol('map'),['838']);
 const close=f.api.observePhysicalPresence(Symbol('physical'),['unified:838'],()=>physical++);await tick();
 f.hub.state='Reconnecting';f.hub.reconnecting();const baseline=physical;
 await Promise.all(Array.from({length:20},()=>f.api.conectarGpsHub()));assert.equal(f.metrics().starts,1);
 f.calls.length=0;f.hub.state='Connected';f.hub.reconnected();await tick();await tick();
 assert.deepEqual(f.calls.sort(),[['InscreverLocalizacaoUnificada','838'],['InscreverseLinha','838']].sort());
 f.emit();f.emitUnified();assert.equal(gps,1);assert.equal(physical,baseline+1);close();await tick();assert.equal(f.metrics().stops,0);
});
test('last owner unmount still stops the connection and later mount receives positions',async()=>{
 const f=fixture(),old=()=>{},owner=Symbol('old');f.api.iniciarGpsHub(old);await f.api.atualizarInscricoesGps(owner,['838']);
 f.api.removerGpsHubListener(old);await f.api.atualizarInscricoesGps(owner,[]);await tick();assert.equal(f.hub.state,'Disconnected');
 let received=0;f.api.iniciarGpsHub(()=>received++);await f.api.atualizarInscricoesGps(Symbol('new'),['838']);f.emit();
 assert.equal(received,1);assert.equal(f.api.obterDiagnosticoGpsHub().subscribers,1);assert.deepEqual(f.metrics(),{starts:2,stops:1,overlaps:0,failures:0});
});
test('owner replacement after cancellation retains the active connection',async()=>{
 const f=fixture(),owner=Symbol('map');let received=0;f.api.iniciarGpsHub(()=>received++);await f.api.atualizarInscricoesGps(owner,['838']);
 const cancelled=f.api.atualizarInscricoesGps(owner,[]);let restored;
 await new Promise(resolve=>{cancelled.then(()=>{restored=f.api.atualizarInscricoesGps(owner,['838']);resolve();});});
 await restored;await tick();assert.deepEqual(f.metrics(),{starts:1,stops:0,overlaps:0,failures:0});f.emit();assert.equal(received,1);
});
test('real start failure still reports gateway health and retains owners for recovery',async()=>{
 const f=fixture();let received=0;f.api.iniciarGpsHub(()=>received++);const start=f.hub.start;
 f.hub.start=async()=>{throw Error('network unavailable');};await f.api.atualizarInscricoesGps(Symbol('map'),['838']);
 assert.equal(f.metrics().failures,1);assert.deepEqual(f.calls,[]);
 f.hub.start=start;await f.api.reconciliarInscricoesGps();f.emit();assert.equal(received,1);assert.equal(f.calls.at(-1)[0],'InscreverseLinha');
});
