const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const vm = require('node:vm');
const ts = require('typescript');
const cache = new Map();
function load(filename) {
  filename = path.resolve(filename);
  if (cache.has(filename)) return cache.get(filename).exports;
  const m = new Module(filename, module); cache.set(filename, m); m.paths = module.paths;
  m.require = id => id.startsWith('.') ? load(path.resolve(path.dirname(filename), id) + '.ts') : require(id);
  m._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  }}).outputText, filename);
  return m.exports;
}
const { buildMapWebViewScript } = load(path.join(__dirname, '../components/mapOSM/webview/mapScript.ts'));

function element(classes = '') {
  const names = new Set(classes.split(' ').filter(Boolean));
  return { style: {}, textContent: '', classList: {
    contains: name => names.has(name), add: name => names.add(name), remove: name => names.delete(name),
  }};
}
function runtime() {
  const ids = new Map(); const moves = [];
  class Popup {
    constructor() { this.open = false; this.writes = 0; }
    setHTML(html) {
      // MapLibre setHTML replaces the content DOM, rather than mutating old nodes.
      this.html = html; this.writes++;
      this.details = element(/class="(popup-details[^"]*)"/.exec(html)[1]);
      this.toggle = element(/class="(popup-toggle[^"]*)"/.exec(html)[1]);
      this.label = element(); this.label.textContent = /class="toggle-label">([^<]*)/.exec(html)[1];
      const id = /class="popup-details[^"]*" id="([^"]+)"/.exec(html)[1];
      this.toggle.getAttribute = () => id;
      this.toggle.querySelector = selector => selector === '.toggle-label' ? this.label : null;
      ids.set(id, this.details);
      return this;
    }
    getElement() { return { querySelector: selector => {
      if (selector === '.popup-details.open') return this.details.classList.contains('open') ? this.details : null;
      return ({ '.popup-details': this.details, '.popup-toggle': this.toggle, '.toggle-label': this.label })[selector] ?? null;
    }}; }
    on() { return this; }
    setLngLat(coord) { this.coord = coord; return this; }
    isOpen() { return this.open; }
    addTo() { this.open = true; return this; }
    remove() { this.open = false; this.removed = true; return this; }
  }
  class Marker {
    constructor({ element }) { this.element = element; }
    setLngLat([lng, lat]) { this.position = { lng, lat }; return this; }
    getLngLat() { return this.position; }
    getElement() { return this.element; }
    setPopup(popup) { this.popup = popup; return this; }
    addTo() { return this; }
    remove() { this.removed = true; }
  }
  const c = { window: {}, document: { getElementById: id => ids.get(id) }, console, maplibregl: { Popup, Marker } };
  vm.createContext(c);
  vm.runInContext(buildMapWebViewScript({ latInicial: 0, lngInicial: 0, estilosJS: '', filtrosMapaJS: '', estiloMapaPadrao: 'light' }), c);
  c.map = {}; c.mapReady = true;
  for (const name of ['setMapStyle', 'setDark', 'setTraffic', 'setLineOpacity', 'setRailRuns', 'refreshIcons', 'applyVehiclePresentation', 'setHeading', 'stopAnim']) c[name] = () => {};
  c.busIcon = () => element();
  c.animateTo = (key, marker, target) => { moves.push(target); marker.setLngLat([target.lng, target.lat]); };
  const line = { nome: 'FIXBRT3', modal: 'brt', posicoes: [] };
  c.lastMapData = { linhas: [line] };
  return { c, moves,
    update: positions => c.window.updateRealtime({ linhas: [{ ...line, posicoes: positions }] }),
    popup: id => c.vehiclePopups['brt:FIXBRT3:' + id],
    marker: id => c.vehicleMarkers['brt:FIXBRT3:' + id],
    toggle: popup => c.toggleDetails(popup.toggle),
  };
}
const position = (id = 'SYNTHETIC') => ({ id, ordem: id, latitude: -22.9, longitude: -43.17,
  velocidade: 10, timestamp: 1_792_020_000_000, distanciaProximaParadaMetros: 100, proximaParadaNome: 'Parada anterior' });
function opened() {
  const r = runtime(); const p = position(); r.update([p]);
  const popup = r.popup(p.id); popup.addTo(r.c.map); r.toggle(popup);
  assert.equal(popup.details.classList.contains('open'), true);
  return { ...r, p, selected: popup };
}
test('open details survive new GPS while speed, destination, distance and position refresh', () => {
  const r = opened(), marker = r.marker(r.p.id);
  r.update([{ ...r.p, longitude: -43.169, velocidade: 25, distanciaProximaParadaMetros: 50, proximaParadaNome: 'Novo destino' }]);
  assert.equal(r.marker(r.p.id), marker);
  assert.equal(r.selected.details.classList.contains('open'), true);
  assert.equal(r.selected.toggle.classList.contains('open'), true);
  assert.equal(r.selected.label.textContent, 'Menos detalhes');
  assert.match(r.selected.html, /25 km\/h/); assert.match(r.selected.html, /50 m/); assert.match(r.selected.html, /Novo destino/);
  assert.equal(marker.getLngLat().lng, -43.169);
});
test('open details survive a timestamp-only update', () => {
  const r = opened(); r.update([{ ...r.p, timestamp: r.p.timestamp + 1000 }]);
  assert.equal(r.selected.details.classList.contains('open'), true);
  assert.ok(r.selected.html.includes('data-ts="' + (r.p.timestamp + 1000) + '"'));
});
test('unchanged realtime snapshot still updates HTML and preserves expansion', () => {
  const r = opened(), writes = r.selected.writes; r.update([r.p]);
  assert.equal(r.selected.writes, writes + 1);
  assert.equal(r.selected.details.classList.contains('open'), true);
});
test('realtime inserts already-expanded HTML instead of replaying the opening transition', () => {
  const r = opened(); r.update([{ ...r.p, timestamp: r.p.timestamp + 1000 }]);
  // MapLibre measures the new DOM during setHTML. Restoring classes afterwards
  // starts the CSS transition from collapsed again, producing a visible pulse.
  assert.match(r.selected.html, /class="popup-details open"/);
  assert.match(r.selected.html, /class="popup-toggle open"/);
  assert.match(r.selected.html, /class="toggle-label">Menos detalhes</);
});
test('manual collapse survives further realtime updates and can be reopened', () => {
  const r = opened(); r.toggle(r.selected); r.update([r.p]);
  assert.equal(r.selected.details.classList.contains('open'), false);
  assert.equal(r.selected.toggle.classList.contains('open'), false);
  assert.equal(r.selected.label.textContent, 'Mais detalhes');
  r.toggle(r.selected); assert.equal(r.selected.details.classList.contains('open'), true);
});
test('different vehicles do not share expansion; closed popup does not retain it on refresh', () => {
  const r = opened(), b = position('OTHER'); r.update([r.p, b]);
  const other = r.popup(b.id); other.addTo(r.c.map);
  assert.equal(other.details.classList.contains('open'), false);
  r.toggle(other); r.selected.remove(); r.update([r.p, b]);
  assert.equal(r.selected.details.classList.contains('open'), false);
  assert.equal(other.details.classList.contains('open'), true);
});
test('removed/expired vehicles lose marker and popup; returning identity starts collapsed', () => {
  const r = opened(), marker = r.marker(r.p.id); r.update([]);
  assert.equal(marker.removed, true); assert.equal(r.selected.removed, true);
  assert.equal(r.popup(r.p.id), undefined); assert.equal(r.marker(r.p.id), undefined);
  r.update([r.p]); assert.notEqual(r.popup(r.p.id), r.selected);
  assert.equal(r.popup(r.p.id).details.classList.contains('open'), false);
});
test('rail popup consumer preserves its own details on changed data, not on another identity', () => {
  const r = runtime();
  const run = { idVisual: 'rail:fixture', lineName: 'Linha sintética', operationalStatus: 'Live', trainCode: 'FIXTURE', nextStationName: 'Destino', secondsToNextStation: 60 };
  r.c.openRailPopup(run, [-43.17, -22.9]);
  const popup = r.c.activeRailPopup; r.toggle(popup);
  r.c.openRailPopup({ ...run, trainCode: 'UPDATED', secondsToNextStation: 120 }, [-43.16, -22.9]);
  assert.equal(r.c.activeRailPopup, popup);
  assert.equal(popup.details.classList.contains('open'), true);
  assert.match(popup.html, /UPDATED/);
  assert.match(popup.html, /2 min/);
  r.c.openRailPopup({ ...run, idVisual: 'rail:other' }, [-43.16, -22.9]);
  assert.equal(popup.removed, true);
  assert.equal(r.c.activeRailPopup.details.classList.contains('open'), false);
});

test('vehicle popup indicator stays static without a repeating pulse', () => {
  const { MAP_WEBVIEW_STYLES } = load(path.join(__dirname, '../components/mapOSM/webview/mapStyles.ts'));
  const rule = MAP_WEBVIEW_STYLES.match(/\.popup-indicator:after\{([^}]+)\}/)[1];
  assert.doesNotMatch(rule, /animation|transition/);
  assert.match(rule, /border:2px solid currentColor/);
});
