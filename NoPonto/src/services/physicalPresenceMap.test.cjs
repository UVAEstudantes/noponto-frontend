const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Module = require('node:module');
const ts = require('typescript');

function runtime() {
  const filename = path.join(__dirname, '../components/mapOSM/webview/mapScript.ts');
  const mod = new Module(filename, module);
  mod.require = (name) => {
    if (name.endsWith('/indicadores')) return { familiasIndicadores: [] };
    if (name.endsWith('/indicadoresSvg.generated')) return { codigoRenderizadorIndicadores: '' };
    if (name.endsWith('/roadPresence')) return {
      DEAD_RECKONING_MS: 0, ROAD_PROJECTION_HORIZON_MS: 0, ROAD_PRESENCE_ENABLED: false };
    throw new Error(name);
  };
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
  const script = mod.exports.buildMapWebViewScript({ latInicial: 0, lngInicial: 0,
    estilosJS: '', filtrosMapaJS: '', estiloMapaPadrao: 'fixture' });
  const start = script.indexOf('window.updatePhysicalPresence=function(vehicles){');
  const end = script.indexOf('window.updateUser=updateUser;', start);
  assert.ok(start > 0 && end > start);
  const markers = {};
  const state = { now: Date.parse('2026-10-28T12:00:00Z') };
  class FakeDate extends Date { static now() { return state.now; } }
  class Marker {
    constructor({ element }) { this.element = element; }
    setLngLat(value) { this.coordinate = value; return this; }
    addTo() { return this; }
    getElement() { return this.element; }
    remove() { this.removed = true; }
  }
  const context = { window: {}, map: {}, maplibregl: { Marker },
    document: { createElement: () => ({ style: {}, addEventListener() {} }) },
    vehicleIndexByOrder: {}, vehicleMarkers: {}, physicalMarkers: markers,
    lastPhysicalPresence: [], Date: FakeDate };
  vm.runInNewContext(script.slice(start, end), context);
  return { update: context.window.updatePhysicalPresence, markers, context, state };
}

test('physical MapLibre marker has fixed coordinates, age opacity and operational deduplication', () => {
  const f = runtime();
  const vehicle = { key: 'Sppo:ZIRIX:0012', originalVehicleId: '0012', modal: 'onibus',
    latitude: -22.9, longitude: -43.2, physicalAt: new Date(f.state.now).toISOString(),
    serviceCode: null, lineState: 'Unknown' };
  f.state.now += 299000;
  f.update([vehicle]);
  assert.deepEqual(Array.from(f.markers[vehicle.key].coordinate), [-43.2, -22.9]);
  assert.equal(f.markers[vehicle.key].getElement().style.opacity, '1');
  f.state.now += 1000;
  f.update([vehicle]);
  assert.equal(f.markers[vehicle.key].getElement().style.opacity, '0.55');
  f.state.now += 300000;
  f.update([vehicle]);
  assert.equal(Object.keys(f.markers).length, 0);

  f.state.now = Date.parse(vehicle.physicalAt);
  f.context.vehicleIndexByOrder['0012'] = 'active';
  f.context.vehicleMarkers.active = {};
  f.update([vehicle]);
  assert.equal(Object.keys(f.markers).length, 0);
});
