/* global __dirname */
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
    if (name.endsWith('/physicalPresenceContract')) return require('./physicalPresenceContract.ts');
    if (name.endsWith('/gpsPresentationPolicy')) return require('./gpsPresentationPolicy.ts');
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
  const popups = [];
  class Popup {
    setLngLat(p) { this.coordinate=p; return this; }
    setText(text) { this.text=text; return this; }
    setHTML(html) { this.html=html; this.text=html.replace(/<[^>]+>/g,'');return this; }
    addTo() { this.open=true; popups.push(this); return this; }
    remove() { this.open=false; }
    isOpen() { return this.open; }
  }
  function element() {
    return { style: { setProperty(k,v){this[k]=v;} }, children: [], handlers: {}, attributes: {},
      appendChild(child) { this.children.push(child); },
      querySelector(selector) { return this.children.find(child => '.'+child.className===selector) || null; },
      addEventListener(name, fn) { this.handlers[name]=fn; },
      setAttribute(k,v) { this.attributes[k]=v; }, getAttribute(k) { return this.attributes[k]; } };
  }
  const contract = require('./physicalPresenceContract.ts');
  const context = { movementDiagnostics:false,gpsPolicy:require('./gpsPresentationPolicy.ts').GPS_POLICY,window: {}, map: {}, maplibregl: { Marker, Popup },
    document: { createElement: element },
    lastMapData: {linhas:[{linhaId:'line-838',modal:'onibus',cor:'#aabbcc'}]},
    renderIndicator: (style,modal,color) => ({uri:style+':'+modal+':'+color,largura:14,altura:42,ancoraY:21,orientacao:0}),
    indicatorStyles:{onibus:'padrao',brt:'padrao'}, railMarkers:{},
    physicalLocationLabels:contract.physicalLocationLabels, operationalPhysicalWatermarks:{},
    parseNum:v=>v==null?null:Number(v),safeId:v=>v,formatElapsed:()=>"5 min",
    modalIconSvg:()=>'<svg></svg>',escapeHtml:v=>String(v).replace(/</g,'&lt;'),refreshIcons(){},vehiclePopups:{},
    drState:{}, vehicleIndexByOrder: {}, vehicleMarkers: {}, physicalMarkers: markers,
    lastPhysicalPresence: [], Date: FakeDate };
  const run = (from,to) => vm.runInNewContext(script.slice(script.indexOf(from),script.indexOf(to,script.indexOf(from))),context);
  run('function rememberOperationalPhysicalGps(', 'var autoFollow=');
  run('function applyVehiclePresentation(', 'var railBranchColors=');
  run('function setHeading(', 'function busIcon(');
  run('function busIcon(', 'function stopIcon(');
  run('function passengerStatusLabel(', 'function escapeHtml(');
  run('function buildPopup(', 'function buildStopPopup(');
  run('function buildPhysicalPopup(', 'window.updatePhysicalPresence=function');
  vm.runInNewContext(script.slice(start, end), context);
  return { update: context.window.updatePhysicalPresence, markers, context, state, popups };
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

test('physical marker tap stays open after map bubbling and expiry closes its popup', () => {
  const f=runtime(); const v={key:'physical',originalVehicleId:'A12345',modal:'onibus',
    latitude:0,longitude:0,physicalAt:new Date(f.state.now).toISOString(),serviceCode:'838',lineState:'Informed'};
  f.update([v]);const el=f.markers.physical.getElement();
  const event={preventDefault(){},stopPropagation(){this.stopped=true;}};
  el.handlers.click(event);
  if(!event.stopped)f.popups.forEach(p=>p.remove());
  assert.equal(f.popups.at(-1).open,true);
  assert.equal(el.getAttribute('data-presence-kind'),'physical-vehicle');
  assert.match(f.popups.at(-1).text,/Sentido desconhecido/);assert.doesNotMatch(f.popups.at(-1).text,/ITS_CURRENT|Contexto GTFS/);
  f.state.now+=480000;f.update([v]);assert.equal(f.popups.at(-1).open,true);
  f.state.now++;f.update([v]);assert.equal(f.popups.at(-1).open,false);
});


test('physical marker reuses bus model line color preferences and exact ITS coordinate', () => {
  const f=runtime();
  const v={key:'pilot',originalVehicleId:'A12345',modal:'onibus',lineId:'line-838',serviceCode:'838',
    lineState:'Inherited',location:'NearTerminal',physicalAt:new Date(f.state.now).toISOString(),latitude:-22.901,longitude:-43.557};
  f.update([v]);const el=f.markers.pilot.getElement();
  assert.equal(el.className,'bus-marker');
  assert.equal(el.getAttribute('data-indicator-color'),'#aabbcc');
  const art=el.querySelector('.bus-inner').querySelector('.vehicle-art');
  assert.equal(art.src,'padrao:onibus:#aabbcc');assert.equal(art.style.height,'42px');
  assert.deepEqual(Array.from(f.markers.pilot.coordinate),[-43.557,-22.901]);
  f.context.window.updateIndicatorStyles({onibus:'realista',brt:'padrao'});
  assert.equal(art.src,'realista:onibus:#aabbcc');
  f.update([{...v,lineState:'Conflict'}]);assert.equal(el.getAttribute('data-indicator-color'),'#2196F3');
});

test('operational precedence rejects older ITS after trip removal and accepts newer physical GPS', () => {
  const f=runtime();const v={key:'pilot',originalVehicleId:'A12345',modal:'onibus',lineId:'line-838',lineState:'Informed',
    physicalAt:new Date(f.state.now).toISOString(),latitude:-22.9,longitude:-43.5};
  f.context.rememberOperationalPhysicalGps('onibus','A12345',f.state.now+1000);
  f.update([v]);assert.equal(Object.keys(f.markers).length,0);
  f.state.now+=2000;
  f.update([{...v,physicalAt:new Date(f.state.now).toISOString()}]);assert.ok(f.markers.pilot);
  f.context.vehicleIndexByOrder.A12345='active';f.context.vehicleMarkers.active={};
  f.update([{...v,physicalAt:new Date(f.state.now).toISOString()}]);assert.equal(Object.keys(f.markers).length,0);
});


test('legacy facility hints cannot assert a line terminal without official endpoint evidence', () => {
  const f=runtime();const v={key:'pilot',originalVehicleId:'A12345',modal:'onibus',serviceCode:'838',lineId:'line-838',lineState:'Inherited',
    physicalAt:new Date(f.state.now-300000).toISOString(),latitude:-22.9,longitude:-43.5};
  for (const [location,label] of [['InsideReviewedGeometry','No terminal'],['NearTerminal','Próximo ao terminal'],['UncertainLocation','Localização incerta']]) {
    f.update([{...v,location}]);
    f.markers.pilot.getElement().handlers.click({preventDefault(){},stopPropagation(){}});
    const text=f.popups.at(-1).text;
    assert.equal(text.includes(label),false);assert.match(text,/Última posição conhecida/);assert.match(text,/GPS há/);
    assert.doesNotMatch(text,/Em viagem|ETA|Saída em/);
  }
});

test('physical card uses normal layout and only one parked bus popup stays open',()=>{
 const f=runtime();const v={key:'a',originalVehicleId:'A12345',modal:'onibus',lineId:'line-838',serviceCode:'838',lineState:'Inherited',location:'NearTerminal',latitude:0,longitude:0,physicalAt:new Date(f.state.now).toISOString()};
 f.update([v,{...v,key:'b',originalVehicleId:'A54321'}]);
 const click=key=>f.markers[key].getElement().handlers.click({preventDefault(){},stopPropagation(){}});
 click('a');assert.match(f.popups.at(-1).html,/class="popup-card"/);assert.match(f.popups.at(-1).html,/class="popup-header"/);
 assert.doesNotMatch(f.popups.at(-1).text,/km\/h|Próxima parada|ETA|Sentido 1/);
 click('b');assert.equal(f.popups.filter(p=>p.open).length,1);
});


test('opt-in 843 disables legacy physical arbitration only for configured cohorts',()=>{
 const f=runtime();f.context.unified838Active=false;f.context.unifiedCodes=['843'];
 const v={key:'legacy843',originalVehicleId:'D86066',modal:'onibus',serviceCode:'843',lineState:'Informed',latitude:0,longitude:0,physicalAt:new Date(f.state.now).toISOString()};
 f.update([v,{...v,key:'legacy838',originalVehicleId:'A12345',serviceCode:'838'}]);
 assert.equal(f.markers.legacy843,undefined);assert.ok(f.markers.legacy838);
 f.context.unifiedCodes=['838','843'];f.update([v]);assert.equal(Object.keys(f.markers).length,0);
});

test('network variants disable legacy arbitration only for selected unified services',()=>{
 const f=runtime();f.context.unified838Active=false;f.context.unifiedCodes=['SP864','2110'];
 const v={key:'sp',originalVehicleId:'D86017',modal:'onibus',serviceCode:'SP864',lineState:'Informed',latitude:0,longitude:0,physicalAt:new Date(f.state.now).toISOString()};
 f.update([v,{...v,key:'other',originalVehicleId:'B58120',serviceCode:'621'}]);
 assert.equal(f.markers.sp,undefined);assert.ok(f.markers.other);
});
