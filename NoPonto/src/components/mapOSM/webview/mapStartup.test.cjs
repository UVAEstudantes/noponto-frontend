const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const vm = require('node:vm');
const ts = require('typescript');

function build(production = false, opaqueBody = '[native code]') {
  const filename = __dirname + '/mapScript.ts';
  const location = require('./userLocation.ts');
  // Native/bytecode runtimes need not retain the executable source of functions.
  const opaque = function createUserLocationFilter() {};
  opaque.toString = () => `function createUserLocationFilter() { ${opaqueBody} }`;
  const mocks = {
    './userLocation': {...location, createUserLocationFilter: opaque},
    './tutorialBridge': {TUTORIAL_MAP_BRIDGE: ''},
    '../../../services/physicalPresenceContract': {physicalLocationLabels: {}},
    '../../../constants/indicadores': {familiasIndicadores: []},
    '../../../constants/indicadoresSvg.generated': {codigoRenderizadorIndicadores: 'function criarRenderizadorIndicadores(){return function(){}}'},
    '../../../services/roadPresence': {DEAD_RECKONING_MS: 0, ROAD_PROJECTION_HORIZON_MS: 0, ROAD_PRESENCE_ENABLED: false},
    '../../../services/gpsPresentationPolicy': {GPS_POLICY: {publicMs: 480000}},
  };
  const m = new Module(filename, module);
  m.require = id => {assert.ok(id in mocks, id); return mocks[id];};
  const code = production
    ? require('@babel/core').transformFileSync(filename, {
      envName: 'production', caller: {name: 'metro', platform: 'android', isDev: false, supportsStaticESM: false},
    }).code
    : ts.transpileModule(fs.readFileSync(filename, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS}}).outputText;
  m._compile(code, filename);
  return m.exports.buildMapWebViewScript({latInicial: -22, lngInicial: -43, estilosJS: '', filtrosMapaJS: '', estiloMapaPadrao: 'fixture'});
}

function assertStartup(script) {
  assert.doesNotThrow(() => new vm.Script(script));
  let options;
  const handlers = {}, messages = [];
  const map = {
    on: (event, ...args) => {handlers[event] = args.at(-1);},
    getCanvas: () => ({style: {}}), getSource: () => true, getLayer: () => true,
    setPaintProperty() {}, setLayoutProperty() {},
  };
  class Marker {
    setLngLat(value) {this.value = value; return this;}
    addTo() {return this;}
    getLngLat() {return {lng: this.value[0], lat: this.value[1]};}
  }
  const element = {style: {}, classList: {add() {}, remove() {}}};
  const c = {
    window: {ReactNativeWebView: {postMessage: value => messages.push(value)}},
    document: {createElement: () => ({}), getElementById: () => element, body: {style: {}}},
    maplibregl: {Map: class {constructor(value) {options = value; return map;}}, Marker},
    setInterval() {}, requestAnimationFrame() {}, console,
  };
  vm.createContext(c);
  vm.runInContext(script, c);
  assert.equal(typeof c.filterUserLocation, 'function');
  assert.equal(typeof c.window.onload, 'function');
  // A premature location update must not prevent map initialization.
  c.window.updateUser({userLocation: [-22, -43], timestamp: Date.now(), accuracy: 5});
  c.window.onload();
  assert.equal(options.container, 'map');
  assert.equal(options.style, 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json');
  assert.equal(typeof handlers.load, 'function');
  // External layers/animation loops are separate from MapLibre's load lifecycle.
  c.ensureLayers = () => {};
  c.startDR = () => {};
  c.startRailAnimation = () => {};
  handlers.load();
  assert.equal(c.mapReady, true);
  assert.deepEqual(messages, ['map_ready']);
}

test('complete WebView script starts MapLibre without native function source', () => assertStartup(build()));
test('bytecode function representation cannot interrupt map startup', () => assertStartup(build(false, '[bytecode]')));
test('production Babel output preserves WebView initialization and GPS filter', () => assertStartup(build(true)));
