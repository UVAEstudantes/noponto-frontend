/* global __dirname */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');

function reactRuntime() {
  const slots = []; let cursor = 0; let effects = [];
  const same = (a, b) => a && b && a.length === b.length && a.every((x, i) => Object.is(x, b[i]));
  const react = {
    useRef(value) { const i = cursor++; return slots[i] ??= { current: value }; },
    useState(initial) {
      const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], update => { slots[i] = typeof update === 'function' ? update(slots[i]) : update; }];
    },
    useMemo(fn, deps) {
      const i = cursor++; if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = {deps, value: fn()};
      return slots[i].value;
    },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps); },
    createElement(type, props, ...children) { return {type, props:{...props, children}}; },
    useImperativeHandle(ref, fn) { react.useEffect(() => {if(ref) ref.current = fn();}); },
    useEffect(fn, deps) {
      const i = cursor++; const previous = slots[i];
      if (!previous || !same(previous.deps, deps)) {
        slots[i] = {deps};
        effects.push(() => { previous?.cleanup?.(); slots[i].cleanup = fn(); });
      }
    },
  };
  react.default = react;
  return {
    react,
    render(fn) { cursor = 0; const result = fn(); const pending = effects; effects = []; pending.forEach(fn => fn()); return result; },
    dispose() { slots.forEach(slot => slot?.cleanup?.()); },
  };
}

function fixture({presence = true} = {}) {
  const clock = {now: Date.now()}; const intervals = new Map(); let timer = 0;
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [clock.now])); }
    static now() { return clock.now; }
  }
  const callbacks = {}; const handlers = {}; const calls = []; const cache = new Map();
  const stateListeners = new Set();
  const appState = {currentState:'active', addEventListener: (_, fn) => {
    stateListeners.add(fn); return {remove() {stateListeners.delete(fn);}};
  }, emit(state) {appState.currentState = state; stateListeners.forEach(fn => fn(state));}};
  const hub = {
    state:'Disconnected', start:async () => {hub.state = 'Connected';},
    invoke:async (...args) => {calls.push(args);},
    on:(name, fn) => {handlers[name] = fn;},
    onreconnecting:fn => {callbacks.reconnecting = fn;},
    onreconnected:fn => {callbacks.reconnected = fn;},
    onclose:fn => {callbacks.close = fn;},
  };
  class HubConnectionBuilder {
    withUrl() {return this;} withAutomaticReconnect() {return this;} build() {return hub;}
  }
  let currentReact;
  const reactFacade = new Proxy({}, {get: (_, key) => {
    if (key === '__esModule') return true;
    if (key === 'default') return reactFacade;
    if (key === 'forwardRef') return fn => fn;
    return (...args) => currentReact[key](...args);
  }});
  const api = {get:async () => ({ok:true, data:{posicoes:[]}})};
  const structures = new Map();
  const mocks = {
    '@/src/config/env':{config:{GPS_HUB_URL:'fixture'}},
    '@microsoft/signalr':{HubConnectionBuilder, HubConnectionState:{Connected:'Connected',Connecting:'Connecting'}},
    'react-native':{AppState:appState},
    '@/src/services/estruturaV2':{listarPadroesV2:async () => [], listarSentidosV2:async () => [], obterItinerarioPadraoVersaoV2:async id => structures.get(id) ?? null},
    '@/src/context/ProvedorIndicadores':{useIndicadores:() => ({preferencias:{global:true,estiloGlobal:'padrao',individuais:{onibus:'padrao',brt:'padrao',trem:'padrao'}}})},
    'react-native-webview':{WebView:() => null},
    './api':{api}, '@/src/services/api':{api},
  };
  function load(relative) {
    let filename = path.isAbsolute(relative) ? relative : path.resolve(__dirname, relative);
    if (!fs.existsSync(filename)) filename += fs.existsSync(filename + '.ts') ? '.ts' : '.tsx';
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = {exports:{}}; cache.set(filename, module);
    const requireLocal = id => {
      if (id === 'react') return reactFacade;
      if (Object.hasOwn(mocks, id)) return mocks[id];
      if (id.startsWith('@/')) return load(path.resolve(__dirname, '../..', id.slice(2)));
      if (id.startsWith('.')) return load(path.resolve(path.dirname(filename), id));
      throw Error('Unexpected dependency: ' + id);
    };
    const js = ts.transpileModule(fs.readFileSync(filename,'utf8'), {compilerOptions:{
      module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true,
    }}).outputText;
    new Function('require','module','exports','Date','setInterval','clearInterval','process','__DEV__',js)(
      requireLocal,module,module.exports,ClockDate,(fn, ms) => {fn.fixtureIntervalMs = ms; intervals.set(++timer, fn); return timer;},
      id => intervals.delete(id),{env:{EXPO_PUBLIC_ROAD_PRESENCE_ENABLED:String(presence)}},false);
    return module.exports;
  }
  const service = load('gpsHub.ts');
  const runtimes = [];
  function hook(lines = ['006','010']) {
    const runtime = reactRuntime(); runtimes.push(runtime);
    const options = {linhasRealtime:lines.map(code => ({linhaId:'line-' + code, linhaCodigo:code, modal:code === '010' ? 'brt' : 'onibus'}))};
    const useHook = load('../hooks/useMobilidadeRio.ts').useMobilidadeRio;
    const render = () => {currentReact = runtime.react; return runtime.render(() => useHook(options));};
    return {render, options, dispose:() => runtime.dispose()};
  }
  function raw(code='006', id='BUS-1', offset=-10_000) {
    return {ordem:id,codigoLinha:code,tipoRota:code === '010' ? 'brt' : 'onibus',linhaId:'line-' + code,
      sentidoId:null,padraoVersaoId:null,latitude:-22.9,longitude:-43.2,velocidade:0,
      timestampGps:new ClockDate(clock.now + offset).toISOString(),timestampServidor:new ClockDate().toISOString()};
  }
  function bridge() {
    const runtime = reactRuntime(); runtimes.push(runtime);
    const component = load('../components/mapOSM/mapOSM.tsx').default;
    const ref = {current:null};
    return {render(props) {currentReact = runtime.react; return runtime.render(() => component(props, ref));}};
  }
  return {load, service, hub, handlers, callbacks, calls, clock, intervals, appState, hook, api, raw, structures, bridge,
    emit(name, payload) {assert.equal(typeof handlers[name], 'function', name + ' handler must be registered'); handlers[name](payload);},
    async flush() {await new Promise(setImmediate); await new Promise(setImmediate);},
    dispose() {runtimes.forEach(r => r.dispose());},
  };
}

test('LinhaEsvaziada removes only its line across shared consumers', async () => {
  const f = fixture();
  try {
    const first = f.hook(); const second = f.hook(['006']);
    first.render(); second.render(); await f.flush();
    const bus = f.raw(); const brt = f.raw('010','BRT-1');
    f.emit('PosicaoAtualizada',[bus,brt]);
    assert.equal(first.render().veiculos.length,2);
    f.emit('LinhaEsvaziada',{codigoLinha:' 006 '});
    assert.deepEqual(first.render().veiculos.map(v => v.ordem),['BRT-1']);
    assert.deepEqual(second.render().veiculos,[]);
    f.emit('PosicaoAtualizada',[bus]);
    assert.deepEqual(first.render().veiculos.map(v => v.ordem),['BRT-1']);
  } finally {f.dispose();}
});


for (const presence of [true, false]) {
  for (const modal of ['BUS','BRT']) {
    test(modal + ' empty overrides retention and only newer GPS may reappear presence=' + presence, async () => {
      const f = fixture({presence});
      try {
        const code = modal === 'BUS' ? '006' : '010';
        const h = f.hook(); h.render(); await f.flush();
        const removed = f.raw(code, modal + '-1', -30_000);
        const other = f.raw(code === '006' ? '010' : '006','OTHER');
        f.emit('PosicaoAtualizada',[removed,other]);
        assert.equal(h.render().veiculos.length,2);
        const choices = JSON.stringify(h.options);
        f.emit('LinhaEsvaziada',{codigoLinha:' ' + code.toLowerCase() + ' '});
        assert.deepEqual(h.render().veiculos.map(v => v.ordem),['OTHER']);
        assert.equal(h.render().linhasDisponiveis.some(l => l.nome === code),false);
        assert.equal(h.render().getVeiculosPorCodigo(code,null,'line-' + code).length,0);
        f.emit('PosicaoAtualizada',[removed,{...removed,timestampGps:new Date(Date.parse(removed.timestampGps)-1000).toISOString()}]);
        assert.deepEqual(h.render().veiculos.map(v => v.ordem),['OTHER']);
        const newer = {...removed,timestampGps:new Date(Date.parse(removed.timestampGps)+1000).toISOString()};
        f.emit('PosicaoAtualizada',[newer]);
        assert.equal(h.render().veiculos.find(v => v.ordem === removed.ordem).atualizadoEm,newer.timestampGps);
        f.emit('PosicaoAtualizada',[removed]);
        assert.equal(h.render().veiculos.find(v => v.ordem === removed.ordem).atualizadoEm,newer.timestampGps);
        assert.equal(JSON.stringify(h.options),choices);
      } finally {f.dispose();}
    });
  }

  test('transfer keeps one physical identity and rejects old-line replay presence=' + presence, async () => {
    const f = fixture({presence});
    try {
      const h = f.hook(); h.render(); await f.flush();
      const old = f.raw('006','TRANSFER',-30_000);
      const stay = f.raw('006','STAY',-20_000);
      f.emit('PosicaoAtualizada',[old,stay]);
      const moved = {...old,codigoLinha:'010',linhaId:'line-010',tipoRota:'brt',
        timestampGps:new Date(Date.parse(old.timestampGps)+2000).toISOString()};
      f.emit('PosicaoAtualizada',[moved]);
      assert.equal(h.render().veiculos.filter(v => v.ordem === 'TRANSFER').length,1);
      assert.equal(h.render().veiculos.find(v => v.ordem === 'TRANSFER').linha,'010');
      f.emit('PosicaoAtualizada',[{...old,timestampGps:new Date(Date.parse(old.timestampGps)+1000).toISOString()}]);
      assert.equal(h.render().veiculos.find(v => v.ordem === 'TRANSFER').linha,'010');
      f.emit('LinhaEsvaziada',{codigoLinha:'006'});
      assert.deepEqual(h.render().veiculos.map(v => v.ordem),['TRANSFER']);
      assert.equal(h.render().veiculos[0].linha,'010');
    } finally {f.dispose();}
  });

  test('disconnect expires at existing retention and foreground prunes without GPS presence=' + presence, async () => {
    const f = fixture({presence});
    try {
      const h = f.hook(); h.render(); await f.flush();
      const old = f.raw(); f.emit('PosicaoAtualizada',[old]); h.render();
      f.hub.state = 'Reconnecting'; f.callbacks.reconnecting();
      const expire = [...f.intervals.values()].find(fn => fn.fixtureIntervalMs === (presence ? 1000 : 15000));
      f.clock.now = Date.parse(old.timestampGps)+180_000; expire();
      assert.equal(h.render().veiculos.length,1);
      f.clock.now++; expire(); assert.equal(h.render().veiculos.length,0);
      f.hub.state = 'Connected'; f.callbacks.reconnected(); await f.flush();
      assert.ok(f.calls.filter(([method,code]) => method === 'InscreverseLinha' && code === '006').length >= 2);
      const newer = f.raw(); f.emit('PosicaoAtualizada',[newer]); assert.equal(h.render().veiculos.length,1);
      f.appState.emit('background'); f.clock.now += 180_001; expire();
      assert.equal(h.render().veiculos.length,1);
      f.appState.emit('active'); assert.equal(h.render().veiculos.length,0);
      assert.equal(newer.timestampGps,new Date(f.clock.now-190_001).toISOString());
    } finally {f.dispose();}
  });
}

test('invalid empty payloads cannot clear any line', async () => {
  const f = fixture();
  try {
    const h = f.hook(); h.render(); await f.flush();
    f.emit('PosicaoAtualizada',[f.raw(),f.raw('010','BRT-1')]);
    for (const payload of [null,undefined,[],{},'',42,{codigoLinha:null},{codigoLinha:7},
      {codigoLinha:''},{codigoLinha:'   '},{codigoLinha:'0\u00006'},{codigoLinha:'X'.repeat(129)}]) {
      f.emit('LinhaEsvaziada',payload);
      assert.equal(h.render().veiculos.length,2);
    }
    f.emit('LinhaEsvaziada',{codigoLinha:'NOT-SUBSCRIBED'});
    assert.equal(h.render().veiculos.length,2);
    const normalize = f.load('gpsSnapshotGuard.ts').normalizarCodigoLinha;
    assert.equal(normalize('  brt-010  '),'BRT-010'); assert.equal(normalize('006'),'006');
  } finally {f.dispose();}
});

test('late REST is invalidated only for its line and cannot undo an empty', async () => {
  const f = fixture();
  try {
    const h = f.hook(); h.render(); await f.flush();
    const bus = f.raw(); const brt = f.raw('010','BRT-1');
    f.emit('PosicaoAtualizada',[bus,brt]); h.render();
    const pending = new Map();
    f.api.get = url => new Promise(resolve => pending.set(url,resolve));
    const api = f.load('mobilidadeRio.ts');
    const a = api.buscarVeiculosPorLinha('006'); const b = api.buscarVeiculosPorLinha('010');
    f.emit('LinhaEsvaziada',{codigoLinha:'006'});
    // Even a previously unseen vehicle must not pass a pre-removal request token.
    pending.get('/veiculos/linha/006')({ok:true,data:{posicoes:[f.raw('006','UNSEEN')]}});
    pending.get('/veiculos/linha/010')({ok:true,data:{posicoes:[brt]}});
    assert.deepEqual(await a,[]); assert.equal((await b)[0].ordem,'BRT-1');
    f.api.get = async () => ({ok:true,data:{posicoes:[bus]}});
    assert.deepEqual(await api.buscarVeiculosPorLinha('006'),[]);
    const fresh = {...bus,timestampGps:new Date(Date.parse(bus.timestampGps)+1000).toISOString()};
    f.api.get = async () => ({ok:true,data:{posicoes:[fresh,brt]}});
    assert.deepEqual((await api.buscarVeiculosPorLinha('006')).map(v => v.ordem),[bus.ordem]);
    f.emit('PosicaoAtualizada',[fresh]);
    assert.equal(h.render().veiculos.find(v => v.ordem === bus.ordem).atualizadoEm,fresh.timestampGps);
    f.api.get = () => {throw Error('invalid code must not reach HTTP');};
    assert.deepEqual(await api.buscarVeiculosPorLinha('  '),[]);
  } finally {f.dispose();}
});

test('disconnect invalidates pending REST and reconnect keeps removed GPS blocked', async () => {
  const f = fixture();
  try {
    const h = f.hook(); h.render(); await f.flush();
    const bus = f.raw(); f.emit('PosicaoAtualizada',[bus]); h.render();
    let resolve;
    f.api.get = () => new Promise(done => {resolve = done;});
    const api = f.load('mobilidadeRio.ts');
    const pending = api.buscarVeiculosPorLinha('006');
    f.callbacks.reconnecting();
    resolve({ok:true,data:{posicoes:[f.raw('006','UNSEEN')]}});
    assert.deepEqual(await pending,[]);
    f.emit('LinhaEsvaziada',{codigoLinha:'006'}); h.render();
    f.hub.state = 'Connected'; f.callbacks.reconnected(); await f.flush();
    f.emit('PosicaoAtualizada',[bus]); assert.deepEqual(h.render().veiculos,[]);
    f.emit('PosicaoAtualizada',[{...bus,timestampGps:new Date(Date.parse(bus.timestampGps)+1000).toISOString()}]);
    assert.equal(h.render().veiculos.length,1);
  } finally {f.dispose();}
});

test('cancel and resubscribe preserve other owners and ignore late unselected frames', async () => {
  const f = fixture();
  try {
    const first = f.hook(); const second = f.hook(['006']);
    first.render(); second.render(); await f.flush();
    const bus = f.raw(); const brt = f.raw('010','BRT-1');
    f.emit('PosicaoAtualizada',[bus,brt]); first.render(); second.render();
    first.options.linhasRealtime = first.options.linhasRealtime.filter(l => l.linhaCodigo === '010');
    first.render(); await f.flush();
    assert.deepEqual(first.render().veiculos.map(v => v.ordem),['BRT-1']);
    assert.deepEqual(second.render().veiculos.map(v => v.ordem),['BUS-1']);
    assert.ok(!f.calls.some(([method,code]) => method === 'CancelarLinha' && code === '006'));
    second.dispose(); await f.flush();
    assert.ok(f.calls.some(([method,code]) => method === 'CancelarLinha' && code === '006'));
    f.emit('PosicaoAtualizada',[{...bus,timestampGps:new Date(Date.parse(bus.timestampGps)+1000).toISOString()}]);
    assert.deepEqual(first.render().veiculos.map(v => v.ordem),['BRT-1']);
    first.options.linhasRealtime = [...first.options.linhasRealtime,{linhaId:'line-006',linhaCodigo:'006',modal:'onibus'}];
    first.render(); await f.flush();
    f.emit('PosicaoAtualizada',[{...bus,timestampGps:new Date(Date.parse(bus.timestampGps)+2000).toISOString()}]);
    assert.equal(first.render().veiculos.length,2);
  } finally {f.dispose();}
  assert.equal(f.service.obterDiagnosticoGpsHub().subscribers,0);
});

test('empty clears terminal arrival evidence before opposite direction reappears', async () => {
  const f = fixture();
  try {
    const h = f.hook(['006']); h.render(); await f.flush();
    const structure = direction => ({
      linhaId:'line-006',sentidoId:direction,padraoOperacionalId:'pattern-' + direction,padraoVersaoId:'version-' + direction,
      topologia:'LINEAR',ocorrencias:[
        {ordem:1,posicaoLinha:0,latitude:-22.9,longitude:direction === 'A' ? -43.21 : -43.2},
        {ordem:2,posicaoLinha:.5,latitude:-22.9,longitude:-43.205},
        {ordem:3,posicaoLinha:.999,latitude:-22.9,longitude:direction === 'A' ? -43.2 : -43.21},
      ],
    });
    f.structures.set('version-A',structure('A')); f.structures.set('version-B',structure('B'));
    const incoming = {...f.raw(),sentidoId:'A',padraoOperacionalId:'pattern-A',padraoVersaoId:'version-A',posicaoNaRota:.99};
    const present = () => h.render().getVeiculosPorCodigo('006',new Set(['version-A','version-B']),'line-006')[0];
    f.emit('PosicaoAtualizada',[incoming]); h.render(); await f.flush(); assert.equal(present().presencaEstado,'indeterminado');
    const next = {...incoming,timestampGps:new Date(Date.parse(incoming.timestampGps)+1000).toISOString()};
    f.emit('PosicaoAtualizada',[next]); assert.equal(present().presencaEstado,'fim_percurso');
    f.emit('LinhaEsvaziada',{codigoLinha:'006'}); assert.equal(present(),undefined);
    const outgoing = {...incoming,sentidoId:'B',padraoOperacionalId:'pattern-B',padraoVersaoId:'version-B',
      posicaoNaRota:0,timestampGps:new Date(Date.parse(incoming.timestampGps)+2000).toISOString()};
    f.emit('PosicaoAtualizada',[outgoing]); h.render(); await f.flush(); assert.equal(present().presencaEstado,'indeterminado');
    f.emit('PosicaoAtualizada',[{...outgoing,timestampGps:new Date(Date.parse(incoming.timestampGps)+3000).toISOString()}]);
    assert.equal(present().presencaEstado,'indeterminado'); // No inherited arrival -> no fabricated waiting departure.
  } finally {f.dispose();}
});

function webViewRuntime(script) {
  const removed = []; const cancelled = []; let frame = 0;
  const element = () => {
    const attributes = new Map();
    return {style:{setProperty() {}},className:'',innerHTML:'',classList:{add() {},remove() {},toggle() {}},
      setAttribute(key,value) {attributes.set(key,value);},getAttribute:key => attributes.get(key),
      querySelector:() => element(),appendChild() {},addEventListener() {}};
  };
  class Marker {
    constructor({element:el}) {this.el = el;}
    setLngLat(coords) {this.coords = coords; return this;}
    getLngLat() {return {lng:this.coords[0],lat:this.coords[1]};}
    setPopup(popup) {this.popup = popup; return this;}
    addTo() {return this;} getElement() {return this.el;}
    remove() {removed.push(this);}
  }
  class Popup {
    setHTML(html) {this.html = html;return this;}
    on() {} isOpen() {return false;} remove() {this.removed = true;}
  }
  const context = vm.createContext({window:{},document:{createElement:element,getElementById:() => null,querySelectorAll:() => [],body:element()},
    maplibregl:{Marker,Popup},console,performance,setTimeout:() => 0,clearTimeout() {},setInterval:() => 0,
    requestAnimationFrame:() => ++frame,cancelAnimationFrame:id => cancelled.push(id)});
  new vm.Script(script).runInContext(context);
  const sources = new Map(); let writes = 0;
  context.map = {getLayer:() => null,getSource:key => sources.get(key),addSource(key) {sources.set(key,{setData(){writes++;}});},
    addLayer() {},setPaintProperty() {},getZoom:() => 15,getBearing:() => 0,
    getCanvas:() => ({style:{}}),getBounds:() => ({contains:() => true})};
  context.mapReady = true;
  return {context,removed,cancelled,writes:() => writes,run:code => new vm.Script(code).runInContext(context)};
}

test('SignalR hook and native bridge remove real WebView markers without reloading HTML', async () => {
  const f = fixture();
  try {
    const h = f.hook(); h.render(); await f.flush();
    const bus = f.raw(); const brt = f.raw('010','BRT-1');
    f.emit('PosicaoAtualizada',[bus,brt]);
    const web = f.load('../components/mapOSM/webview/mapScript.ts');
    const script = web.buildMapWebViewScript({latInicial:-22.9,lngInicial:-43.2,estilosJS:'',filtrosMapaJS:'',estiloMapaPadrao:'fixture'});
    const runtime = webViewRuntime(script); const native = f.bridge(); const injections = [];
    const props = () => ({location:null,linhasParaMostrar:['006','010'].map(code => ({
      structureKey:'fixture-' + code,nome:code,modal:code === '006' ? 'onibus' : 'brt',cor:'#2196F3',
      modoSentido:'ambos',mostrarParadas:false,posicoes:h.render().getVeiculosPorCodigo(code,null,'line-' + code),
    }))});
    let view = native.render(props()); const source = view.props.source;
    view.props.ref.current = {injectJavaScript(code) {injections.push(code); runtime.run(code);}};
    assert.equal(injections.length,0); // Preserve map_ready handshake.
    view.props.onMessage({nativeEvent:{data:'map_ready'}});
    view = native.render(props());
    assert.equal(Object.keys(runtime.context.vehicleMarkers).length,2);
    const busKey = 'onibus:006:BUS-1', brtKey = 'brt:010:BRT-1';
    const oldBus = runtime.context.vehicleMarkers[busKey], keptBrt = runtime.context.vehicleMarkers[brtKey];
    const moving = {...bus,longitude:bus.longitude + .0001,timestampGps:new Date(Date.parse(bus.timestampGps)+1000).toISOString()};
    f.emit('PosicaoAtualizada',[moving]);
    native.render(props()); const animation = runtime.context.animFrames[busKey]; assert.ok(animation);
    const structuralWrites = runtime.writes();
    f.emit('LinhaEsvaziada',{codigoLinha:'006'}); const before = injections.length;
    view = native.render(props());
    assert.equal(view.props.source,source);
    assert.ok(injections.slice(before).every(code => !code.startsWith('window.updateMap(')));
    assert.deepEqual(Object.keys(runtime.context.vehicleMarkers),[brtKey]);
    assert.equal(runtime.context.vehicleMarkers[brtKey],keptBrt);
    assert.ok(runtime.removed.includes(oldBus)); assert.ok(runtime.cancelled.includes(animation));
    assert.equal(runtime.context.drState[busKey],undefined);
    assert.equal(runtime.context.vehiclePopups[busKey],undefined);
    assert.equal(runtime.context.vehicleIndexByOrder['BUS-1'],undefined);
    assert.equal(runtime.writes(),structuralWrites);
    f.emit('PosicaoAtualizada',[bus]); native.render(props());
    assert.equal(runtime.context.vehicleMarkers[busKey],undefined);
    f.emit('PosicaoAtualizada',[{...bus,timestampGps:new Date(Date.parse(bus.timestampGps)+2000).toISOString()}]);
    view = native.render(props()); assert.ok(runtime.context.vehicleMarkers[busKey]);
    assert.equal(runtime.context.vehicleMarkers[brtKey],keptBrt); assert.equal(view.props.source,source);
  } finally {f.dispose();}
});


test('transfer to another owner removes old presence even when old line stays nonempty', async () => {
  const f = fixture();
  try {
    const oldOwner = f.hook(['006']); const newOwner = f.hook(['010']);
    oldOwner.render(); newOwner.render(); await f.flush();
    const bus = f.raw('006','TRANSFER'); const stay = f.raw('006','STAY');
    f.emit('PosicaoAtualizada',[bus,stay]);
    assert.equal(oldOwner.render().veiculos.length,2);
    const moved = {...bus,codigoLinha:'010',linhaId:'line-010',tipoRota:'brt',
      timestampGps:new Date(Date.parse(bus.timestampGps)+1000).toISOString()};
    f.emit('PosicaoAtualizada',[moved]);
    assert.deepEqual(oldOwner.render().veiculos.map(v => v.ordem),['STAY']);
    assert.deepEqual(newOwner.render().veiculos.map(v => v.ordem),['TRANSFER']);
  } finally {f.dispose();}
});


test('reconciler removes observed transfer outside visible lines while retaining temporary omissions', () => {
  const f = fixture();
  try {
    const maps = f.load('veiculosMapa.ts');
    const old = maps.adaptarPosicaoRodoviariaV2(f.raw('006','TRANSFER'));
    const stay = maps.adaptarPosicaoRodoviariaV2(f.raw('006','STAY'));
    const moved = {...old,linha:'010',codigoLinha:'010',linhaId:'line-010'};
    for (const enabled of [true,false]) {
      const result = maps.reconciliarSnapshotsRodoviarios([old,stay],[],{enabled,now:f.clock.now},[moved]);
      assert.deepEqual(result.map(v => v.ordem),['STAY']);
    }
    const unrelated = {...moved,idVisual:'road:OTHER',ordem:'OTHER'};
    assert.deepEqual(maps.reconciliarSnapshotsRodoviarios([old,stay],[],{enabled:true,now:f.clock.now},[unrelated]),
      [old,stay]);
  } finally {f.dispose();}
});

test('GPS guard enforces retention boundaries and rejects invalid observations', () => {
  const f = fixture();
  try {
    const guard = new (f.load('gpsSnapshotGuard.ts').GpsSnapshotGuard)();
    const adapt = f.load('veiculosMapa.ts').adaptarPosicaoRodoviariaV2;
    const boundary = adapt(f.raw('006','BOUNDARY',-180_000));
    assert.equal(guard.filtrarSnapshot([boundary]).length,1);
    const token = guard.capturarLeitura('006');
    f.clock.now += 1;
    assert.deepEqual(guard.filtrarSnapshot([boundary]),[]);
    const invalid = [f.raw('006','BAD-TIME'),f.raw('006','BAD-COORD'),f.raw('006','FUTURE',1)];
    invalid[0].timestampGps = 'invalid'; invalid[1].latitude = NaN;
    assert.deepEqual(guard.filtrarSnapshot(invalid.map(adapt)),[]);
    f.clock.now += 180_001;
    assert.equal(guard.leituraAtual(token),false);
    assert.deepEqual(guard.filtrarSnapshot([boundary]),[]);
    assert.equal(guard.filtrarSnapshot([adapt(f.raw('006','BOUNDARY'))]).length,1);
  } finally {f.dispose();}
});

test('GPS guard bounds tracked identities without forgetting live removal evidence', () => {
  const f = fixture();
  try {
    const guard = new (f.load('gpsSnapshotGuard.ts').GpsSnapshotGuard)();
    const adapt = f.load('veiculosMapa.ts').adaptarPosicaoRodoviariaV2;
    const positions = Array.from({length:5000},(_,i) => adapt(f.raw('006','CAP-' + i)));
    assert.equal(guard.filtrarSnapshot(positions).length,5000);
    guard.registrarVazio('006');
    assert.deepEqual(guard.filtrarSnapshot([positions[0],adapt(f.raw('010','EXTRA'))]),[]);
    f.clock.now += 180_001;
    assert.equal(guard.filtrarSnapshot([adapt(f.raw('010','EXTRA'))]).length,1);
  } finally {f.dispose();}
});

test('REST ordering tokens change for same-line snapshots but not for another line', () => {
  const f = fixture();
  try {
    const guard = new (f.load('gpsSnapshotGuard.ts').GpsSnapshotGuard)();
    const adapt = f.load('veiculosMapa.ts').adaptarPosicaoRodoviariaV2;
    const oldRead = guard.capturarLeitura('006');
    assert.equal(guard.capturarLeitura('006'),oldRead);
    guard.filtrarSnapshot([adapt(f.raw('010','OTHER'))]); assert.equal(guard.leituraAtual(oldRead),true);
    guard.filtrarSnapshot([adapt(f.raw())]); assert.equal(guard.leituraAtual(oldRead),false);
    const next = guard.capturarLeitura('006'); guard.registrarVazio('010'); assert.equal(guard.leituraAtual(next),true);
    guard.registrarVazio('006'); assert.equal(guard.leituraAtual(next),false);
  } finally {f.dispose();}
});


test('manual connection restart rejects REST started while disconnected', async () => {
  const f = fixture();
  try {
    const h = f.hook(); h.render(); await f.flush();
    f.hub.state = 'Disconnected'; f.callbacks.close();
    let resolve; f.api.get = () => new Promise(done => {resolve = done;});
    const api = f.load('mobilidadeRio.ts');
    const pending = api.buscarVeiculosPorLinha('006');
    await f.service.conectarGpsHub();
    resolve({ok:true,data:{posicoes:[f.raw('006','UNSEEN')]}});
    assert.deepEqual(await pending,[]);
    await f.service.reconciliarInscricoesGps();
    assert.ok(f.calls.filter(([method,code]) => method === 'InscreverseLinha' && code === '006').length >= 2);
  } finally {f.dispose();}
});
