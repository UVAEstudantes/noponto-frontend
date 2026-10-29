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
