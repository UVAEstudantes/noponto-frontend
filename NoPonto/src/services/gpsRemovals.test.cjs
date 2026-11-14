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

function fixture({presence = true, dev = false, trace = false, traceOrder = '', unified,motionTrace=false,motionOrders='' } = {}) {
  const diagnostics = [];
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
    state:'Disconnected', stop:async()=>{hub.state='Disconnected';callbacks.close?.();}, start:async () => {hub.state = 'Connected';},
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
  let gatewayActive = 0, gatewayFailures = 0; const gatewayListeners = new Set();
  const gatewayMock = { snapshot: () => ({active: gatewayActive, status: 'online'}), subscribe: fn => { gatewayListeners.add(fn); return () => gatewayListeners.delete(fn); }, hubConnected() {}, hubFailure() { gatewayFailures++; } };
  const mocks = {
    './gateway': { gateway: gatewayMock, gatewayHubUrl: () => gatewayActive ? 'https://reserve.test/hub/gps' : 'https://primary.test/hub/gps' },
    ...(unified?{'@/src/services/unifiedLocation':{useUnifiedLocation:()=>({snapshots:unified,now:clock.now})}}:{}),
    '@/src/config/env':{config:{GPS_HUB_URL:'fixture'}},
    '@microsoft/signalr':{HubConnectionBuilder, HubConnectionState:{Connected:'Connected',Connecting:'Connecting',Disconnected:'Disconnected',Disconnecting:'Disconnecting',Reconnecting:'Reconnecting'}},
    'react-native':{AppState:appState,Platform:{OS:'android'}},
    '@/src/services/estruturaV2':{obterTerminaisOficiaisV2:async()=>[],listarPadroesV2:async () => [], listarSentidosV2:async () => [], obterItinerarioPadraoVersaoV2:async id => structures.get(id) ?? null},
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
    new Function('require','module','exports','Date','setInterval','clearInterval','process','__DEV__','console',js)(
      requireLocal,module,module.exports,ClockDate,(fn, ms) => {fn.fixtureIntervalMs = ms; intervals.set(++timer, fn); return timer;},
      id => intervals.delete(id),{env:{EXPO_PUBLIC_ROAD_PRESENCE_ENABLED:String(presence),
        EXPO_PUBLIC_R28_MOVEMENT_TRACE:String(motionTrace),EXPO_PUBLIC_R28_MOVEMENT_ORDERS:motionOrders,
        EXPO_PUBLIC_ROAD_PRESENCE_TRACE_ENABLED:String(trace),EXPO_PUBLIC_ROAD_PRESENCE_TRACE_ORDEM:traceOrder}},dev,
      {...console,debug:(...args)=>diagnostics.push(args)});
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
  return {load, service, hub, handlers, callbacks, calls, clock, intervals, appState, hook, api, raw, structures, bridge, diagnostics,
    gatewayFailures: () => gatewayFailures,
    switchGateway() { gatewayActive = 1; gatewayListeners.forEach(fn => fn()); },
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
      f.clock.now = Date.parse(old.timestampGps)+(presence?300_000:180_000); expire();
      assert.equal(h.render().veiculos.length,1);
      f.clock.now++; expire(); assert.equal(h.render().veiculos.length,0);
      f.hub.state = 'Connected'; f.callbacks.reconnected(); await f.flush();
      assert.ok(f.calls.filter(([method,code]) => method === 'InscreverseLinha' && code === '006').length >= 2);
      const newer = f.raw(); f.emit('PosicaoAtualizada',[newer]); assert.equal(h.render().veiculos.length,1);
      f.appState.emit('background'); f.clock.now += 300_001; expire();
      assert.equal(h.render().veiculos.length,1);
      f.appState.emit('active'); assert.equal(h.render().veiculos.length,0);
      assert.equal(newer.timestampGps,new Date(f.clock.now-310_001).toISOString());
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

function webViewRuntime(script,clock={now:Date.now()}) {
  const removed = []; const cancelled = []; let frame = 0;
  const frames=new Map(),ticks=[];
  class ClockDate extends Date {static now(){return clock.now;}}
  const domById=new Map();
  // Small DOM fixture for the popup card, retaining node identities across patches.
  function card(html,register=false){
    const nodes={};
    for(const cls of ['popup-card','popup-header','popup-sub','popup-meta','popup-stats','popup-details','popup-toggle','toggle-label']){
      const start=new RegExp('<(div|span)[^>]*class="'+cls+'"[^>]*>').exec(html);
      if(!start)continue;
      const offset=start.index+start[0].length;
      const tags=new RegExp('</?'+start[1]+'\\b[^>]*>','g');tags.lastIndex=offset;
      let depth=1,end=offset,tag;
      while((tag=tags.exec(html))){depth+=tag[0].startsWith('</')?-1:1;if(!depth){end=tag.index;break;}}
      const classes=new Set([cls]);
      const attributes=new Map();
      const node={innerHTML:html.slice(offset,end),textContent:html.slice(offset,end),
        classList:{add:c=>classes.add(c),remove:c=>classes.delete(c),contains:c=>classes.has(c)},
        getAttribute:name=>attributes.has(name)?attributes.get(name):new RegExp(name+'="([^"]*)"').exec(start[0])?.[1],
        setAttribute:(name,value)=>attributes.set(name,value),
        querySelector:selector=>nodes[selector]??null};
      nodes['.'+cls]=node;
      const id=node.getAttribute('id');if(id&&register)domById.set(id,node);
    }
    return {querySelector:selector=>nodes[selector]??null};
  }
  const element = () => {
    const attributes = new Map();
    let html='',parsed;
    return {style:{setProperty() {}},className:'',get innerHTML(){return html;},set innerHTML(value){html=value;parsed=undefined;},classList:{add() {},remove() {},toggle() {}},
      setAttribute(key,value) {attributes.set(key,value);},getAttribute:key => attributes.get(key),
      querySelector:selector => html.includes('popup-card')?(parsed??=card(html)).querySelector(selector):element(),appendChild() {},addEventListener() {}};
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
    constructor(){this.events={};this.writes=0;}
    setHTML(html) {this.html = html;this.root=card(html,true);this.writes++;return this;}
    getElement(){return this.root;}
    on(name,fn){this.events[name]=fn;} isOpen(){return Boolean(this.open);}
    remove(){this.open=false;const root=this.root;this.root=undefined;this.events.close?.();this.root=root;this.removed=true;}
  }
  const context = vm.createContext({window:{},document:{createElement:element,getElementById:id => domById.get(id)??null,querySelectorAll:() => [],body:element()},
    maplibregl:{Marker,Popup},console,Date:ClockDate,performance:{now:()=>clock.now},setTimeout:() => 0,clearTimeout() {},
    setInterval:fn => {ticks.push(fn);return ticks.length;},clearInterval(){},
    requestAnimationFrame:fn => {frames.set(++frame,fn);return frame;},cancelAnimationFrame:id => {cancelled.push(id);frames.delete(id);}});
  new vm.Script(script).runInContext(context);
  const sources = new Map(); let writes = 0;
  context.map = {getLayer:() => null,getSource:key => sources.get(key),addSource(key) {sources.set(key,{setData(){writes++;}});},
    addLayer() {},setPaintProperty() {},getZoom:() => 15,getBearing:() => 0,
    getCanvas:() => ({style:{}}),getBounds:() => ({contains:() => true})};
  context.mapReady = true;
  return {context,removed,cancelled,frames,ticks,writes:() => writes,run:code => new vm.Script(code).runInContext(context)};
}

test('SignalR hook and native bridge remove real WebView markers without reloading HTML', async () => {
  const f = fixture({presence:false});
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
    const boundary = adapt(f.raw('006','BOUNDARY',-300_000));
    assert.equal(guard.filtrarSnapshot([boundary]).length,1);
    const token = guard.capturarLeitura('006');
    f.clock.now += 1;
    assert.deepEqual(guard.filtrarSnapshot([boundary]),[]);
    const invalid = [f.raw('006','BAD-TIME'),f.raw('006','BAD-COORD'),f.raw('006','FUTURE',1)];
    invalid[0].timestampGps = 'invalid'; invalid[1].latitude = NaN;
    assert.deepEqual(guard.filtrarSnapshot(invalid.map(adapt)),[]);
    f.clock.now += 300_001;
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
    f.clock.now += 300_001;
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

for(const presence of [true,false]) {
test(`snapshot acceptance uses physical GPS age and preserves removals ON=${presence}`,()=>{
  const f=fixture({presence});
  try{
    const {GpsSnapshotGuard}=f.load('gpsSnapshotGuard.ts');
    const adapt=f.load('veiculosMapa.ts').adaptarPosicaoRodoviariaV2;
    const start=f.clock.now;
    for(const seconds of [60,120,179,180,181,299,300,301]){
      const guard=new GpsSnapshotGuard(),raw=f.raw('006','BOUNDARY',-seconds*1000);
      const sample=adapt(raw),retained=seconds<=(presence?300:180);
      assert.equal(guard.filtrarSnapshot([sample]).length,retained?1:0);
      guard.registrarVazio('006');
      assert.deepEqual(guard.filtrarSnapshot([adapt({...raw,timestampServidor:new Date(start+1000).toISOString()})]),[]);
      assert.deepEqual(guard.filtrarSnapshot([adapt({...raw,timestampGps:new Date(start-seconds*1000-1).toISOString()})]),[]);
      const fresh=adapt({...raw,timestampGps:new Date(start).toISOString()});
      assert.equal(guard.filtrarSnapshot([fresh])[0].atualizadoEm,new Date(start).toISOString());
    }
  }finally{f.dispose();}
});
test(`hook and WebView apply GPS boundaries at 60 120 179 180 181 299 300 301 seconds ON=${presence}`,async()=>{
  const f=fixture({presence});
  try {
    const h=f.hook(['006']);h.render();await f.flush();
    const start=f.clock.now,raw=f.raw('006','CLOCK',0);
    f.emit('PosicaoAtualizada',[raw]);
    const web=webViewRuntime(f.load('../components/mapOSM/webview/mapScript.ts').buildMapWebViewScript({latInicial:-22.9,lngInicial:-43.2,estilosJS:'',filtrosMapaJS:'',estiloMapaPadrao:'fixture'}),f.clock);
    const native=f.bridge(),key='onibus:006:CLOCK';
    const props=()=>({location:null,linhasParaMostrar:[{structureKey:'fixed',nome:'006',modal:'onibus',
      posicoes:h.render().getVeiculosPorCodigo('006',null,'line-006')}]});
    let view=native.render(props());const source=view.props.source;
    view.props.ref.current={injectJavaScript:code=>web.run(code)};
    view.props.onMessage({nativeEvent:{data:'map_ready'}});native.render(props());
    for(const seconds of [60,120,179,180,181,299,300,301]) {
      f.clock.now=start+seconds*1000;
      for(const tick of f.intervals.values()) if(tick.fixtureIntervalMs===(presence?1000:15000))tick();
      const vehicles=h.render().getVeiculosPorCodigo('006',null,'line-006');
      view=native.render(props());assert.equal(view.props.source,source);
      const marker=web.context.vehicleMarkers[key];
      if(seconds>(presence?300:180)){
        assert.deepEqual(vehicles,[]);assert.equal(marker,undefined);
      }
      else {
        assert.equal(vehicles.length,1);
        assert.equal(vehicles[0].atualizadoEm,raw.timestampGps);
        assert.equal(vehicles[0].latitude,raw.latitude);
        assert.equal(vehicles[0].longitude,raw.longitude);
        assert.equal(marker.el.style.opacity||'1',presence&&seconds>=180?'0.55':'1');
        const meta=web.context.vehiclePopups[key].getElement().querySelector('.popup-meta').innerHTML;
        assert.ok(meta.includes('data-ts="'+start+'"'));
        if(presence){
          assert.equal(vehicles[0].presencaIdadeSegundos,seconds);
          assert.equal(vehicles[0].gpsAtrasado,seconds>=180);
          assert.equal(vehicles[0].presencaEstado,'indeterminado');
          assert.equal(meta.includes('GPS atrasado'),seconds>=180);
        }else assert.equal(vehicles[0].gpsAtrasado,undefined);
      }
    }
  }finally{f.dispose();}
});
}

test('explicit backend empty at 240 seconds overrides visual retention and late HTTP',async()=>{
  const f=fixture();
  try{
    const h=f.hook(['006']);h.render();await f.flush();
    const raw=f.raw('006','REMOVED',0);f.emit('PosicaoAtualizada',[raw]);
    const present=()=>h.render().getVeiculosPorCodigo('006',null,'line-006');
    f.clock.now+=240000;
    for(const tick of f.intervals.values())if(tick.fixtureIntervalMs===1000)tick();
    assert.equal(present()[0].presencaIdadeSegundos,240);
    assert.equal(present()[0].gpsAtrasado,true);
    let resolve;f.api.get=()=>new Promise(done=>{resolve=done;});
    const pending=f.load('mobilidadeRio.ts').buscarVeiculosPorLinha('006');
    f.emit('LinhaEsvaziada',{codigoLinha:'006'});assert.deepEqual(present(),[]);
    resolve({ok:true,data:{posicoes:[{...raw,timestampServidor:new Date(f.clock.now).toISOString()}]}});
    assert.deepEqual(await pending,[]);
    for(const seconds of [240,299,300,301]){
      f.clock.now=Date.parse(raw.timestampGps)+seconds*1000;
      f.emit('PosicaoAtualizada',[{...raw,timestampServidor:new Date(f.clock.now).toISOString()}]);
      assert.deepEqual(present(),[]);
    }
    const fresh={...raw,timestampGps:new Date(f.clock.now).toISOString()};
    f.emit('PosicaoAtualizada',[fresh]);
    assert.equal(present()[0].atualizadoEm,fresh.timestampGps);
    assert.equal(present()[0].presencaIdadeSegundos,0);assert.equal(present()[0].gpsAtrasado,false);
  }finally{f.dispose();}
});

test('unselect and reselect cannot resurrect the removed observation in one consumer',async()=>{
  const f=fixture();
  try {
    const h=f.hook(['006']),other=f.hook(['006']);
    h.render();other.render();await f.flush();
    const raw=f.raw();f.emit('PosicaoAtualizada',[raw]);assert.equal(h.render().veiculos.length,1);
    const selected=h.options.linhasRealtime;
    h.options.linhasRealtime=[];h.render();assert.deepEqual(h.render().veiculos,[]);
    h.options.linhasRealtime=selected;h.render();await f.flush();
    f.emit('PosicaoAtualizada',[raw]);assert.deepEqual(h.render().veiculos,[]);
    assert.equal(other.render().veiculos.length,1);
    f.emit('PosicaoAtualizada',[{...raw,timestampGps:new Date(Date.parse(raw.timestampGps)+1000).toISOString()}]);
    assert.equal(h.render().veiculos.length,1);
  }finally{f.dispose();}
});

test('GPS batch accepts one newest observation and freezes conflicting equal timestamps',()=>{
  const f=fixture();
  try {
    const guard=new (f.load('gpsSnapshotGuard.ts').GpsSnapshotGuard)();
    const adapt=f.load('veiculosMapa.ts').adaptarPosicaoRodoviariaV2;
    const old=adapt(f.raw('006','DUP',-30000)),newer=adapt(f.raw('006','DUP',-10000));
    assert.deepEqual(guard.filtrarSnapshot([newer,old,newer]),[newer]);
    assert.deepEqual(guard.filtrarSnapshot([old]),[]);
    assert.deepEqual(guard.filtrarSnapshot([{...newer,longitude:-44,sentidoId:'opposite'}]),[newer]);
    guard.registrarVazio('006');
    assert.deepEqual(guard.filtrarSnapshot([old,newer]),[]);
    assert.equal(guard.filtrarSnapshot([adapt(f.raw('006','DUP',-9000))]).length,1);
  }finally{f.dispose();}
});

test('retained old GPS is held without renewing observation time',()=>{
  const f=fixture();
  try {
    const script=f.load('../components/mapOSM/webview/mapScript.ts').buildMapWebViewScript({latInicial:-22.9,lngInicial:-43.2,estilosJS:'',filtrosMapaJS:'',estiloMapaPadrao:'fixture'});
    const web=webViewRuntime(script,f.clock),native=f.bridge();const raw=f.raw('006','BUS-1',-180000);
    let position={...f.load('veiculosMapa.ts').adaptarPosicaoRodoviariaV2(raw),
      posicaoNaRota:.5,comprimentoRotaMetros:1000,velocidade:30,presencaEstado:'em_viagem',gpsAtrasado:true,presencaRotulo:'Em viagem'};
    const props=()=>({location:null,linhasParaMostrar:[{structureKey:'fixed',nome:'006',modal:'onibus',cor:'#2196F3',
      segmentos:[[[-22.9,-43.3],[-22.9,-43.1]]],modoSentido:'ambos',mostrarParadas:false,posicoes:[position]}]});
    let view=native.render(props());const source=view.props.source;
    view.props.ref.current={injectJavaScript:code=>web.run(code)};
    view.props.onMessage({nativeEvent:{data:'map_ready'}});native.render(props());
    const key='onibus:006:BUS-1',marker=web.context.vehicleMarkers[key];
    const projected=marker.getLngLat().lng;
    assert.ok(Math.abs(projected-raw.longitude)<1e-10);
    position={...position,longitude:-43.201,gpsAtrasado:true,presencaRotulo:'Última observação: em viagem • GPS atrasado'};
    view=native.render(props());
    assert.equal(view.props.source,source);
    assert.equal(marker.getLngLat().lng,projected);
    assert.equal(web.context.animFrames[key],undefined);
    assert.equal(web.context.drState[key].gpsTimestamp,Date.parse(raw.timestampGps));
    assert.equal(marker.el.style.opacity,'0.55');
    assert.match(web.context.vehiclePopups[key].getElement().querySelector('.popup-meta').innerHTML,/Última observação: em viagem/);
    assert.match(web.context.vehiclePopups[key].html,/GPS h/);
  }finally{f.dispose();}
});

for (const presence of [true,false]) {
  test(`popup details survive consecutive updates and close on identity removal ON=${presence}`,()=>{
    const f=fixture({presence});
    try{
      const web=webViewRuntime(f.load('../components/mapOSM/webview/mapScript.ts').buildMapWebViewScript({latInicial:-22.9,lngInicial:-43.2,estilosJS:'',filtrosMapaJS:'',estiloMapaPadrao:'fixture'}));
      let p={id:'BUS-1',latitude:-22.9,longitude:-43.2,timestamp:Date.now(),velocidade:20,sentidoId:'A',
        ...(presence?{presencaEstado:'indeterminado',presencaRotulo:'Estado indeterminado'}:{})};
      const send=()=>web.context.window.updateMap({linhas:[{nome:'006',modal:'onibus',posicoes:[p]}]});
      const key='onibus:006:BUS-1';send();
      const popup=web.context.vehiclePopups[key];popup.open=true;popup.events.open?.();
      const root=popup.getElement(),button=root.querySelector('.popup-toggle'),details=root.querySelector('.popup-details');
      assert.match(popup.html,/toggleDetails\(this,event\)/);
      let stopped=0;
      const click=()=>web.context.toggleDetails(button,{stopPropagation(){stopped++;}});
      click();assert.equal(stopped,1);assert.equal(details.classList.contains('open'),true);
      const writes=popup.writes;
      send();assert.equal(popup.writes,writes);
      for(let i=1;i<=5;i++){
        p={...p,timestamp:p.timestamp+1000,longitude:p.longitude+.0001,velocidade:20+i,
          ...(presence?{presencaRotulo:i===5?'Última observação: em viagem · GPS atrasado':'Em viagem',gpsAtrasado:i===5,presencaIdadeSegundos:i}:{})};
        send();assert.equal(popup.getElement().querySelector('.popup-details'),details);
        assert.equal(details.classList.contains('open'),true);assert.equal(popup.writes,writes);
      }
      assert.match(root.querySelector('.popup-stats').innerHTML,/25 km\/h/);
      if(presence)assert.match(root.querySelector('.popup-meta').innerHTML,/GPS atrasado/);
      click();assert.equal(details.classList.contains('open'),false);
      click();popup.remove();assert.equal(details.classList.contains('open'),false);
      assert.equal(button.querySelector('.toggle-label').textContent,'Mais detalhes');
      popup.open=true;click();p={...p,sentidoId:'B',timestamp:p.timestamp+1};send();
      assert.equal(popup.removed,true);assert.notEqual(web.context.vehiclePopups[key],popup);
      assert.equal(web.context.vehiclePopups[key].getElement().querySelector('.popup-details').classList.contains('open'),false);
      const other=web.context.vehiclePopups[key];p={...p,id:'BUS-2'};send();
      assert.equal(other.removed,true);assert.equal(web.context.vehiclePopups[key],undefined);
      const next=web.context.vehiclePopups['onibus:006:BUS-2'];
      assert.equal(next.getElement().querySelector('.popup-details').classList.contains('open'),false);
      next.open=true;next.events.open();
      const nextDetails=next.getElement().querySelector('.popup-details');
      web.context.toggleDetails(next.getElement().querySelector('.popup-toggle'));
      assert.equal(nextDetails.classList.contains('open'),true);
      web.context.window.updateMap({linhas:[{nome:'006',modal:'onibus',posicoes:[p,{...p,id:'BUS-3'}]}]});
      const third=web.context.vehiclePopups['onibus:006:BUS-3'];third.open=true;third.events.open();
      assert.equal(next.removed,true);assert.equal(nextDetails.classList.contains('open'),false);
      assert.equal(third.getElement().querySelector('.popup-details').classList.contains('open'),false);
      web.context.window.updateMap({linhas:[]});assert.equal(next.removed,true);
    }finally{f.dispose();}
  });
  test(`fresh moving sample animates and age updates preserve animation ON=${presence}`,()=>{
    const f=fixture({presence});
    try {
      const web=webViewRuntime(f.load('../components/mapOSM/webview/mapScript.ts').buildMapWebViewScript({latInicial:-22.9,lngInicial:-43.2,estilosJS:'',filtrosMapaJS:'',estiloMapaPadrao:'fixture'}));
      const key='onibus:006:BUS-1';
      let p={id:'BUS-1',latitude:-22.9,longitude:-43.2,timestamp:Date.now(),velocidade:30,
        ...(presence?{presencaEstado:'indeterminado',gpsAtrasado:false}: {})};
      const send=()=>web.context.window.updateMap({linhas:[{nome:'006',modal:'onibus',posicoes:[p]}]});
      send();p={...p,longitude:-43.199,timestamp:p.timestamp+1};send();
      const frame=web.context.animFrames[key];assert.ok(frame,'moving GPS must animate');
      for(let age=1;age<=5;age++){p={...p,presencaIdadeSegundos:age};send();assert.equal(web.context.animFrames[key],frame);}
      web.frames.get(frame)(Date.now()+2000);
      assert.equal(web.context.vehicleMarkers[key].getLngLat().lng,-43.199);
      if(presence){p={...p,gpsAtrasado:true};send();assert.equal(web.context.animFrames[key],undefined);assert.equal(web.context.vehicleMarkers[key].getLngLat().lng,-43.199);}
    }finally{f.dispose();}
  });
  test(`new physical GPS clears delay through SignalR and hook ON=${presence}`,async()=>{
    const f=fixture({presence});
    try{
      const h=f.hook(['006']);h.render();await f.flush();
      const raw=f.raw('006','BUS-1',0);f.emit('PosicaoAtualizada',[raw]);
      const present=()=>h.render().getVeiculosPorCodigo('006',null,'line-006')[0];
      const web=webViewRuntime(f.load('../components/mapOSM/webview/mapScript.ts').buildMapWebViewScript({latInicial:-22.9,lngInicial:-43.2,estilosJS:'',filtrosMapaJS:'',estiloMapaPadrao:'fixture'}),f.clock);
      const send=()=>web.context.window.updateMap({linhas:[{nome:'006',modal:'onibus',posicoes:[present()]}]});
      const key='onibus:006:BUS-1';send();
      assert.equal(present().atualizadoEm,raw.timestampGps);
      f.clock.now+=180000;
      for(const tick of f.intervals.values())if(tick.fixtureIntervalMs===(presence?1000:15000))tick();
      if(presence)assert.equal(present().gpsAtrasado,true);
      send();assert.equal(web.context.vehicleMarkers[key].el.style.opacity,presence?'0.55':'1');
      f.emit('PosicaoAtualizada',[{...raw,timestampServidor:new Date(f.clock.now).toISOString()}]);
      assert.equal(present().atualizadoEm,raw.timestampGps);
      if(presence)assert.equal(present().gpsAtrasado,true);
      const fresh={...raw,timestampGps:new Date(f.clock.now).toISOString()};
      f.emit('PosicaoAtualizada',[fresh]);
      assert.equal(present().atualizadoEm,fresh.timestampGps);
      if(presence)assert.equal(present().gpsAtrasado,false);
      send();assert.equal(web.context.vehicleMarkers[key].el.style.opacity,'1');
      if(presence)assert.equal(present().presencaIdadeSegundos,0);
      const meta=web.context.vehiclePopups[key].getElement().querySelector('.popup-meta').innerHTML;
      assert.equal(meta.includes('GPS atrasado'),false);
      assert.ok(meta.includes('data-ts="'+f.clock.now+'"'));
      f.emit('PosicaoAtualizada',[raw]);assert.equal(present().atualizadoEm,fresh.timestampGps);
    }finally{f.dispose();}
  });
}

for(const presence of [true,false]){
test(`DTO with zero instantaneous speed and route progress keeps legacy movement ON=${presence}`,()=>{
  const f=fixture({presence});
  try{
    f.clock.now=Date.parse('2026-10-23T12:00:00Z');
    const adapt=f.load('veiculosMapa.ts').adaptarPosicaoRodoviariaV2;
    const raw={...f.raw('006','REAL-SHAPE',-40000),longitude:-43.208,velocidade:0,velocidadeMedia:18,posicaoNaRota:.1};
    let p=adapt(raw);
    if(presence)p={...p,...f.load('roadPresence.ts').projectRoadPresence(p,undefined,undefined,f.clock.now).presentation};
    assert.equal(p.sentidoId,null);assert.equal(p.padraoOperacionalId,null);
    const web=webViewRuntime(f.load('../components/mapOSM/webview/mapScript.ts').buildMapWebViewScript({latInicial:-22.9,lngInicial:-43.2,estilosJS:'',filtrosMapaJS:'',estiloMapaPadrao:'fixture'}),f.clock);
    const send=()=>web.context.window.updateMap({linhas:[{nome:'006',modal:'onibus',segmentos:[[[-22.9,-43.21],[-22.9,-43.19]]],posicoes:[p]}]});
    const key='onibus:006:REAL-SHAPE';send();web.context.startDR();
    const marker=web.context.vehicleMarkers[key];const initial=marker.getLngLat().lng;
    f.clock.now+=1000;web.ticks[0]();assert.ok(marker.getLngLat().lng>initial,'legacy average speed must still move an unmatched vehicle');
    const heading=web.context.vehicleHeadings[key],before=marker.getLngLat().lng;
    p={...p,presencaEstado:'indeterminado',presencaIdadeSegundos:41,presencaRotulo:'Estado indeterminado'};send();
    assert.equal(marker.getLngLat().lng,before);assert.equal(web.context.vehicleHeadings[key],heading,'presentation must not point back at old GPS');
  }finally{f.dispose();}
});
}

for(const presence of [true,false]){
test(`imperfect DTO replay survives intermittent GPS native clocks empty and recovery ON=${presence}`,async()=>{
  const f=fixture({presence});
  try{
    const h=f.hook(['006']);h.render();await f.flush();
    const start=f.clock.now;
    let raw={...f.raw('006','REPLAY',-40000),latitude:-22.9,longitude:-43.208,velocidade:0,velocidadeMedia:18,posicaoNaRota:.1};
    f.emit('PosicaoAtualizada',[raw]);
    const web=webViewRuntime(f.load('../components/mapOSM/webview/mapScript.ts').buildMapWebViewScript({latInicial:-22.9,lngInicial:-43.2,estilosJS:'',filtrosMapaJS:'',estiloMapaPadrao:'fixture'}),f.clock);
    const native=f.bridge(),key='onibus:006:REPLAY';
    const props=()=>({location:null,linhasParaMostrar:[{nome:'006',modal:'onibus',structureKey:'replay',
      segmentos:[[[-22.9,-43.21],[-22.9,-43.19]]],posicoes:h.render().getVeiculosPorCodigo('006',null,'line-006')}]});
    let view=native.render(props());const source=view.props.source;
    view.props.ref.current={injectJavaScript:code=>web.run(code)};
    view.props.onMessage({nativeEvent:{data:'map_ready'}});native.render(props());web.context.startDR();
    const marker=web.context.vehicleMarkers[key],popup=web.context.vehiclePopups[key];
    popup.open=true;popup.events.open();const details=popup.getElement().querySelector('.popup-details');
    web.context.toggleDetails(popup.getElement().querySelector('.popup-toggle'));
    let last=marker.getLngLat().lng;
    for(let second=1;second<=120;second++){
      f.clock.now=start+second*1000;
      if([30,60,120].includes(second)){
        raw={...raw,posicaoNaRota:.1+second*.003,longitude:-43.21+.02*(.1+second*.003),timestampGps:new Date(f.clock.now-40000).toISOString()};
        f.emit('PosicaoAtualizada',[raw]);
      }else if(second%10===0)f.emit('PosicaoAtualizada',[{...raw,timestampServidor:new Date(f.clock.now).toISOString()}]);
      for(const tick of f.intervals.values())if(tick.fixtureIntervalMs===(presence?1000:15000))tick();
      view=native.render(props());assert.equal(view.props.source,source);
      const afterPresentation=marker.getLngLat().lng;
      // Presentation alone may schedule a physical reconciliation, but cannot write coordinates.
      assert.equal(afterPresentation,last);
      web.ticks[0]();
      const frame=web.context.animFrames[key];
      if(frame){
        const held=marker.getLngLat().lng;web.ticks[0]();assert.equal(marker.getLngLat().lng,held,'DR must wait for RAF completion');
        web.frames.get(frame)(f.clock.now+350);
        assert.ok(marker.getLngLat().lng>=held);
        const half=marker.getLngLat().lng;
        const next=web.context.animFrames[key];web.frames.get(next)(f.clock.now+700);
        assert.ok(marker.getLngLat().lng>half,'RAF must interpolate rather than jump');
      }
      assert.ok(marker.getLngLat().lng>=last);last=marker.getLngLat().lng;
      assert.equal(web.context.vehicleMarkers[key],marker);
      assert.equal(details.classList.contains('open'),true);
      assert.equal(h.render().veiculos[0].atualizadoEm,raw.timestampGps);
    }
    assert.ok(last> -43.208);
    f.emit('LinhaEsvaziada',{codigoLinha:'006'});native.render(props());web.ticks[0]();
    assert.equal(web.context.vehicleMarkers[key],undefined);
    f.emit('PosicaoAtualizada',[raw]);native.render(props());assert.equal(web.context.vehicleMarkers[key],undefined);
    f.clock.now+=1000;raw={...raw,timestampGps:new Date(f.clock.now).toISOString()};
    f.emit('PosicaoAtualizada',[raw]);native.render(props());assert.ok(web.context.vehicleMarkers[key]);
  }finally{f.dispose();}
});
}

test('loss of optional matching fields preserves marker popup and movement',()=>{
  const f=fixture();
  try{
    const adapt=f.load('veiculosMapa.ts').adaptarPosicaoRodoviariaV2;
    let raw={...f.raw('006','MATCH',-40000),velocidade:0,velocidadeMedia:18,posicaoNaRota:.1,sentidoId:'A',padraoVersaoId:'v1'};
    const web=webViewRuntime(f.load('../components/mapOSM/webview/mapScript.ts').buildMapWebViewScript({latInicial:-22.9,lngInicial:-43.2,estilosJS:'',filtrosMapaJS:'',estiloMapaPadrao:'fixture'}),f.clock);
    const send=()=>web.context.window.updateMap({linhas:[{nome:'006',modal:'onibus',itinerarioSegmentoMap:{v1:0},
      segmentos:[[[-22.9,-43.21],[-22.9,-43.19]]],posicoes:[adapt(raw)]}]});
    const key='onibus:006:MATCH';send();const marker=web.context.vehicleMarkers[key],popup=web.context.vehiclePopups[key];
    for(const missing of [true,false,true]){
      f.clock.now+=1000;raw={...raw,timestampGps:new Date(f.clock.now).toISOString(),sentidoId:missing?null:'A',padraoVersaoId:missing?null:'v1'};
      send();assert.equal(web.context.vehicleMarkers[key],marker);assert.equal(web.context.vehiclePopups[key],popup);
      assert.equal(web.removed.length,0);
    }
  }finally{f.dispose();}
});

test('structural metadata hydration cannot clear live markers and expanded popup',()=>{
  const f=fixture();
  try{
    const web=webViewRuntime(f.load('../components/mapOSM/webview/mapScript.ts').buildMapWebViewScript({latInicial:-22.9,lngInicial:-43.2,estilosJS:'',filtrosMapaJS:'',estiloMapaPadrao:'fixture'}),f.clock);
    const native=f.bridge();let structureKey='before-hydration';
    const p=f.load('veiculosMapa.ts').adaptarPosicaoRodoviariaV2({...f.raw(),posicaoNaRota:.1,velocidadeMedia:18});
    const props=()=>({location:null,linhasParaMostrar:[{structureKey,nome:'006',modal:'onibus',
      segmentos:[[[-22.9,-43.21],[-22.9,-43.19]]],posicoes:[p]}]});
    let view=native.render(props());const source=view.props.source;
    view.props.ref.current={injectJavaScript:code=>web.run(code)};
    view.props.onMessage({nativeEvent:{data:'map_ready'}});native.render(props());web.context.startDR();
    const key='onibus:006:BUS-1',marker=web.context.vehicleMarkers[key],popup=web.context.vehiclePopups[key];
    popup.open=true;popup.events.open();const details=popup.getElement().querySelector('.popup-details');
    web.context.toggleDetails(popup.getElement().querySelector('.popup-toggle'));
    f.clock.now+=1000;web.ticks[0]();const coordinate=marker.getLngLat().lng;
    structureKey='after-hydration';view=native.render(props());
    assert.equal(view.props.source,source);assert.equal(web.context.vehicleMarkers[key],marker);
    assert.equal(marker.getLngLat().lng,coordinate);assert.equal(web.context.vehiclePopups[key],popup);
    assert.equal(details.classList.contains('open'),true);assert.equal(web.removed.length,0);
  }finally{f.dispose();}
});

test('partial terminal DTO survives SignalR hook selected-version filtering and WebView retention',async()=>{
  const f=fixture();
  try{
    f.structures.set('old-known',{padraoVersaoId:'old-known',linhaId:'line-006',sentidoId:'old-direction',
      padraoOperacionalId:'old-pattern',topologia:'LINEAR',ocorrencias:[],geometria:{tipo:'LineString',coordenadas:[[-43.21,-22.9],[-43.19,-22.9]]}});
    const h=f.hook(['006']);h.render();await f.flush();
    const raw={...f.raw('006','TERMINAL',0),padraoVersaoId:'old-known',sentidoId:null};
    f.emit('PosicaoAtualizada',[raw]);h.render();await f.flush();
    assert.ok(h.render().estruturasRealtimePorVersao['old-known']);
    const visible=()=>h.render().getVeiculosPorCodigo('006',new Set(['selected-version']),'line-006');
    assert.equal(visible().length,1);assert.equal(visible()[0].presencaEstado,'indeterminado');
    const web=webViewRuntime(f.load('../components/mapOSM/webview/mapScript.ts').buildMapWebViewScript({latInicial:-22.9,lngInicial:-43.2,estilosJS:'',filtrosMapaJS:'',estiloMapaPadrao:'fixture'}),f.clock);
    const native=f.bridge(),key='onibus:006:TERMINAL';
    const props=()=>({location:null,linhasParaMostrar:[{nome:'006',modal:'onibus',structureKey:'selected-version',posicoes:visible()}]});
    let view=native.render(props());view.props.ref.current={injectJavaScript:code=>web.run(code)};
    view.props.onMessage({nativeEvent:{data:'map_ready'}});native.render(props());
    const marker=web.context.vehicleMarkers[key];assert.ok(marker);
    f.clock.now+=181000;
    for(const tick of f.intervals.values())if(tick.fixtureIntervalMs===1000)tick();
    native.render(props());assert.equal(web.context.vehicleMarkers[key],marker);
    assert.equal(marker.getLngLat().lng,raw.longitude);assert.equal(marker.el.style.opacity,'0.55');
    assert.equal(visible()[0].atualizadoEm,raw.timestampGps);
    f.emit('LinhaEsvaziada',{codigoLinha:'006'});native.render(props());
    assert.equal(web.context.vehicleMarkers[key],undefined);
  }finally{f.dispose();}
});

for(const enabled of [true,false]){
test(`movement diagnostics are aggregate bounded and opt in enabled=${enabled}`,()=>{
  const f=fixture();
  try{
    const web=webViewRuntime(f.load('../components/mapOSM/webview/mapScript.ts').buildMapWebViewScript({latInicial:-22.9,lngInicial:-43.2,estilosJS:'',filtrosMapaJS:'',estiloMapaPadrao:'fixture'}),f.clock);
    const messages=[];web.context.window.ReactNativeWebView={postMessage:value=>messages.push(JSON.parse(value))};
    const data={movementDiagnostics:enabled,linhas:[{nome:'006',modal:'onibus',posicoes:[{id:'NO-IDS-IN-METRICS',latitude:-22.9,longitude:-43.2,timestamp:f.clock.now,velocidade:18}]}]};
    web.context.window.updateMap(data);web.context.startDR();
    for(let second=1;second<=60;second++){
      f.clock.now+=1000;web.context.window.updateMap(data);web.ticks[0]();
    }
    assert.equal(messages.length,enabled?2:0);
    if(enabled){
      assert.equal(messages[0].type,'movement_metrics');assert.equal(messages[0].metrics.repeated,30);
      assert.equal(messages[0].metrics.linear,1);
      assert.equal(JSON.stringify(messages).includes('NO-IDS-IN-METRICS'),false);
      assert.ok(Object.values(messages[0].metrics).every(value=>typeof value==='number'));
    }
  }finally{f.dispose();}
});
}

function roadScenario(presence=true,overrides={},mode='ambos'){
  const f=fixture({presence});f.clock.now=Date.parse('2026-10-23T12:00:00Z');
  const web=webViewRuntime(f.load('../components/mapOSM/webview/mapScript.ts').buildMapWebViewScript({latInicial:0,lngInicial:-43.2,estilosJS:'',filtrosMapaJS:'',estiloMapaPadrao:'fixture'}),f.clock);
  const key='onibus:006:TRAJECTORY',length=2223.901604670658;
  let p={id:'TRAJECTORY',latitude:0,longitude:-43.198,timestamp:f.clock.now-40000,
    velocidade:18,velocidadeMedia:25,posicaoNaRota:.1,comprimentoRotaMetros:length,
    sentidoId:'A',padraoVersaoId:'version-A',...(presence?{presencaEstado:'indeterminado',gpsAtrasado:false}:{}),...overrides};
  const start=p.timestamp;
  const send=()=>web.context.window.updateMap({linhas:[{nome:'006',modal:'onibus',modoSentido:mode,itinerarioSegmentoMap:{'version-A':0,'version-B':1},
    segmentos:[[[0,-43.2],[0,-43.18]],[[0,-43.18],[0,-43.2]]],posicoes:[p]}]});
  send();web.context.startDR();
  return {f,web,key,length,start,get p(){return p;},set p(value){p=value;},send,
    marker:()=>web.context.vehicleMarkers[key],state:()=>web.context.drState[key],
    tick(age){f.clock.now=start+age*1000;web.ticks[0]();},
    metres:()=> (web.context.vehicleMarkers[key].getLngLat().lng+43.2)/.02*length};
}
for(const presence of [true,false]){
  test(`legacy DR holds delayed repeats and visual-only updates ON=${presence}`,()=>{
    const r=roadScenario(presence);
    try{
      const initial=r.metres(),state=r.state();
      const popup=r.web.context.vehiclePopups[r.key];popup.open=true;popup.events.open();
      const details=popup.getElement().querySelector('.popup-details');
      r.web.context.toggleDetails(popup.getElement().querySelector('.popup-toggle'));
      for(const seconds of [41,42,43,44,45]){
        r.tick(seconds);const current=r.metres();assert.ok(current>initial);
        const heading=r.web.context.vehicleHeadings[r.key];
        r.p={...r.p,presencaEstado:seconds%2?'indeterminado':'em_viagem',presencaIdadeSegundos:seconds};r.send();
        assert.equal(r.metres(),current);assert.equal(r.state(),state);
        assert.equal(r.web.context.vehicleHeadings[r.key],heading);
        assert.equal(details.classList.contains('open'),true);
        assert.equal(r.web.context.animFrames[r.key],undefined);
      }
      assert.equal(r.state().gpsTimestamp,r.start);
      r.web.context.startDR();assert.equal(r.web.ticks.length,1,'one timer per map');
      for(const age of [60,120,180,300]){
        const before=r.metres();r.tick(age);r.send();assert.ok(r.metres()>=before);
        if(age>(presence?180:60))assert.equal(r.metres(),before);
      }
    }finally{r.f.dispose();}
  });
  test(`delayed route progress behind DR does not repeatedly rewind ON=${presence}`,()=>{
    const r=roadScenario(presence);
    try{
      r.tick(60);const before=r.metres();
      r.p={...r.p,timestamp:r.start+20000,posicaoNaRota:.101,longitude:-43.19798};r.send();
      assert.equal(r.metres(),before);assert.equal(r.web.context.animFrames[r.key],undefined);
      r.f.clock.now+=1000;r.web.ticks[0]();assert.ok(r.metres()>before);
      const current=r.metres();for(let i=0;i<5;i++)r.send();assert.equal(r.metres(),current);
      assert.equal(r.state().gpsTimestamp,r.start+20000);
    }finally{r.f.dispose();}
  });
}

for(const presence of [true,false]){
test(`explicit removal deletes projected trajectory and blocks replay ON=${presence}`,async()=>{
  const f=fixture({presence});
  try{
    const h=f.hook(['006']);h.render();await f.flush();
    const raw={...f.raw('006','MOVING',-40000),velocidade:18,posicaoNaRota:.1,longitude:-43.198};
    f.emit('PosicaoAtualizada',[raw]);
    const web=webViewRuntime(f.load('../components/mapOSM/webview/mapScript.ts').buildMapWebViewScript({latInicial:-22.9,lngInicial:-43.2,estilosJS:'',filtrosMapaJS:'',estiloMapaPadrao:'fixture'}),f.clock);
    const native=f.bridge(),key='onibus:006:MOVING';
    const props=()=>({location:null,linhasParaMostrar:[{nome:'006',modal:'onibus',structureKey:'fixed',
      segmentos:[[[-22.9,-43.2],[-22.9,-43.18]]],posicoes:h.render().getVeiculosPorCodigo('006',null,'line-006')}]});
    let view=native.render(props());const source=view.props.source;
    view.props.ref.current={injectJavaScript:code=>web.run(code)};
    view.props.onMessage({nativeEvent:{data:'map_ready'}});native.render(props());web.context.startDR();
    const marker=web.context.vehicleMarkers[key];
    f.clock.now+=1000;web.ticks[0]();
    assert.ok(marker.getLngLat().lng>raw.longitude);assert.ok(web.context.drState[key].lineCoords);
    f.emit('LinhaEsvaziada',{codigoLinha:'006'});view=native.render(props());
    assert.equal(view.props.source,source);assert.ok(web.removed.includes(marker));
    const last=marker.getLngLat().lng;
    f.clock.now+=1000;web.ticks[0]();
    f.emit('PosicaoAtualizada',[raw]);native.render(props());web.ticks[0]();
    assert.equal(web.context.vehicleMarkers[key],undefined);assert.equal(web.context.drState[key],undefined);
    assert.equal(web.context.vehiclePopups[key],undefined);assert.equal(marker.getLngLat().lng,last);
  }finally{f.dispose();}
});
}

test('missing route version never borrows the opposite geometry',()=>{
  const r=roadScenario();
  try{
    r.p={...r.p,timestamp:r.f.clock.now,padraoVersaoId:'not-loaded'};r.send();
    assert.equal(r.state().lineCoords,null);
    r.f.clock.now+=60000;r.web.ticks[0]();assert.equal(r.state().lineCoords,null);
  }finally{r.f.dispose();}
});

test('direction display filtering preserves the canonical route version index',()=>{
  const r=roadScenario(true,{sentidoId:'B',padraoVersaoId:'version-B',longitude:-43.182},'volta');
  try{
    assert.ok(r.state().lineCoords);assert.ok(Math.abs(r.marker().getLngLat().lng-r.p.longitude)<1e-10);
    const initial=r.marker().getLngLat().lng;r.tick(60);
    assert.ok(r.marker().getLngLat().lng<initial);
  }finally{r.f.dispose();}
});

test('legacy DR freezes at its horizon and clamps the route end',()=>{
  const r=roadScenario();
  try{
    r.tick(180);const frozen=r.metres();assert.ok(frozen>r.length*.1);
    r.tick(300);assert.equal(r.metres(),frozen);
  }finally{r.f.dispose();}
  const end=roadScenario(true,{posicaoNaRota:.999,longitude:-43.18002});
  try{end.tick(180);assert.ok(Math.abs(end.metres()-end.length)<.01);}finally{end.f.dispose();}
});

test('terminal remains stationary and confirmed direction reanchors correct geometry',()=>{
  const r=roadScenario();
  try{
    r.tick(60);const priorStop=r.marker().getLngLat().lng;
    r.p={...r.p,timestamp:r.f.clock.now,velocidade:0,velocidadeMedia:35,presencaEstado:'fim_percurso'};r.send();
    r.f.clock.now+=3000;r.web.ticks[0]();const stopped=r.marker().getLngLat().lng;
    assert.equal(stopped,priorStop);
    r.f.clock.now+=120000;r.web.ticks[0]();assert.equal(r.marker().getLngLat().lng,stopped);
    const old=r.marker(),popup=r.web.context.vehiclePopups[r.key];popup.open=true;popup.events.open();
    r.web.context.toggleDetails(popup.getElement().querySelector('.popup-toggle'));
    r.p={...r.p,timestamp:r.f.clock.now,sentidoId:'B',padraoVersaoId:'version-B',posicaoNaRota:0,longitude:-43.18};r.send();
    assert.notEqual(r.marker(),old);assert.ok(r.web.removed.includes(old));assert.equal(popup.removed,true);
    r.f.clock.now+=1000;r.web.ticks[0]();assert.equal(r.marker().getLngLat().lng,-43.18);
    assert.equal(r.web.context.vehiclePopups[r.key].getElement().querySelector('.popup-details').classList.contains('open'),false);
    r.p={...r.p,timestamp:r.f.clock.now,velocidade:18,presencaEstado:'indeterminado',posicaoNaRota:.01,longitude:-43.1802};r.send();
    r.f.clock.now+=3000;
    const frame=r.web.context.animFrames[r.key];if(frame)r.web.frames.get(frame)(r.f.clock.now);
    r.web.ticks[0]();assert.ok(r.marker().getLngLat().lng< -43.18);
  }finally{r.f.dispose();}
});

test('new confirmed stationary terminal sample stops a pending reconciliation without moving it',()=>{
  const r=roadScenario();
  try{
    r.p={...r.p,timestamp:r.f.clock.now,posicaoNaRota:.2,longitude:-43.196};r.send();
    const frame=r.web.context.animFrames[r.key];assert.ok(frame);
    r.web.frames.get(frame)(r.f.clock.now+350);const frozen=r.marker().getLngLat().lng;
    r.f.clock.now+=1000;r.p={...r.p,timestamp:r.f.clock.now,velocidade:0,velocidadeMedia:35,presencaEstado:'fim_percurso'};r.send();
    assert.equal(r.web.context.animFrames[r.key],undefined);
    r.f.clock.now+=1000;r.web.ticks[0]();assert.equal(r.marker().getLngLat().lng,frozen);
  }finally{r.f.dispose();}
});

test('projection expiration freezes the advanced marker instead of restoring old GPS',()=>{
  const f=fixture();
  try{
    const web=webViewRuntime(f.load('../components/mapOSM/webview/mapScript.ts').buildMapWebViewScript({latInicial:-22.9,lngInicial:-43.2,estilosJS:'',filtrosMapaJS:'',estiloMapaPadrao:'fixture'}),f.clock);
    let p={id:'BUS-1',latitude:-22.9,longitude:-43.2,timestamp:f.clock.now,velocidade:30,velocidadeMedia:35,
      presencaEstado:'indeterminado',posicaoNaRota:.5,gpsAtrasado:false};
    const send=()=>web.context.window.updateMap({linhas:[{nome:'006',modal:'onibus',
      segmentos:[[[-22.9,-43.21],[-22.9,-43.19]]],posicoes:[p]}]});
    const key='onibus:006:BUS-1';send();web.context.startDR();
    const marker=web.context.vehicleMarkers[key];const initial=marker.getLngLat().lng;
    f.clock.now+=1000;web.ticks[0]();assert.ok(marker.getLngLat().lng>initial);
    const advanced=marker.getLngLat().lng;
    for(const seconds of [60,61,120,180,300]){
      f.clock.now=p.timestamp+seconds*1000;send();web.ticks[0]();
      assert.ok(marker.getLngLat().lng>=advanced,'clock expiration must not rewind to observed GPS');
    }
    const frozen=marker.getLngLat().lng;
    f.clock.now+=1000;send();web.ticks[0]();assert.equal(marker.getLngLat().lng,frozen);
  }finally{f.dispose();}
});

for(const dev of [true,false]) {
  test('GPS diagnostics are bounded and development only dev='+dev,async()=>{
    const f=fixture({dev});
    try {
      const h=f.hook(['006']);h.render();await f.flush();
      const raw=f.raw('006','DIAG',0);f.emit('PosicaoAtualizada',[raw]);
      const start=f.clock.now;
      const present=()=>h.render().getVeiculosPorCodigo('006',null,'line-006');present();
      for(let seconds=1;seconds<=61;seconds++) {
        f.clock.now=start+seconds*1000;
        for(const tick of f.intervals.values())if(tick.fixtureIntervalMs===1000)tick();
        present();
      }
      assert.equal(f.diagnostics.length,dev?3:0);
      if(dev) {
        const last=f.diagnostics.at(-1)[1];
        assert.equal(last.amostra.length,1);assert.equal(last.amostra[0].idadeSegundos,60);
        assert.equal(last.amostra[0].gpsEm,raw.timestampGps);
        assert.equal(last.amostra[0].estado,'indeterminado');
        assert.equal(Object.hasOwn(last.amostra[0],'raw'),false);
      }
    }finally{f.dispose();}
  });
}

for(const settings of [{dev:false,trace:true},{dev:true,trace:false},{dev:true,trace:true}]){
test(`selected identity trace reports pipeline reasons without raw coordinates dev=${settings.dev} enabled=${settings.trace}`,async()=>{
  const f=fixture({...settings,traceOrder:'TRACE-ONLY'});
  try{
    const h=f.hook(['838']);h.render();await f.flush();
    const raw={...f.raw('838','TRACE-ONLY',0),latitude:-22.912345678,longitude:-43.298765432};
    const other=f.raw('838','OTHER',0);f.emit('PosicaoAtualizada',[raw,other]);
    const web=webViewRuntime(f.load('../components/mapOSM/webview/mapScript.ts').buildMapWebViewScript({latInicial:-22.9,lngInicial:-43.2,estilosJS:'',filtrosMapaJS:'',estiloMapaPadrao:'fixture'}),f.clock);
    const native=f.bridge(),key='onibus:838:TRACE-ONLY';
    const props=()=>({location:null,linhasParaMostrar:[{nome:'838',modal:'onibus',structureKey:'838',
      posicoes:h.render().getVeiculosPorCodigo('838',null,'line-838')}]});
    let view=native.render(props());
    web.context.window.ReactNativeWebView={postMessage:message=>view.props.onMessage({nativeEvent:{data:message}})};
    view.props.ref.current={injectJavaScript:code=>web.run(code)};
    view.props.onMessage({nativeEvent:{data:'map_ready'}});view=native.render(props());
    const marker=web.context.vehicleMarkers[key];assert.ok(marker);
    f.emit('PosicaoAtualizada',[raw]);view=native.render(props());
    f.emit('PosicaoAtualizada',[{...raw,timestampGps:new Date(f.clock.now-1000).toISOString()}]);
    f.emit('PosicaoAtualizada',[{...raw,timestampGps:new Date(f.clock.now+1000).toISOString()}]);
    f.emit('PosicaoAtualizada',[{...raw,codigoLinha:''}]);
    f.clock.now+=30000;f.emit('PosicaoAtualizada',[{...other,timestampGps:new Date(f.clock.now).toISOString()}]);view=native.render(props());
    assert.equal(web.context.vehicleMarkers[key],marker);
    f.emit('LinhaEsvaziada',{codigoLinha:'838'});view=native.render(props());
    f.emit('PosicaoAtualizada',[raw]);view=native.render(props());assert.equal(web.context.vehicleMarkers[key],undefined);
    const events=f.diagnostics.filter(([,event])=>event.order==='TRACE-ONLY').map(([,event])=>event);
    if(!settings.dev||!settings.trace){assert.deepEqual(events,[]);return;}
    for(const stage of ['signalr_received','shared_gps_guard','consumer_gps_guard','hook_received','hook_reconciliation','frontend_filter','classifier','native_payload','webview'])
      assert.ok(events.some(event=>event.stage===stage),stage);
    for(const reason of ['same_gps_observation_reused','regressive_gps','invalid_physical_observation','invalid_identity_or_line','retained_after_feed_omission','explicit_line_empty','explicit_removal_blocks_equal_gps','marker_present','marker_absent'])
      assert.ok(events.some(event=>event.reason===reason),reason);
    const classification=events.find(event=>event.stage==='classifier');
    assert.ok(classification.failures.includes('matching_incomplete'));assert.ok(classification.failures.includes('structure_not_loaded'));
    assert.ok(events.find(event=>event.reason==='marker_absent').lastRecognizedStage);
    assert.equal(events.find(event=>event.reason==='marker_present').gpsAt,raw.timestampGps);
    const serialized=JSON.stringify(events);
    assert.equal(serialized.includes(String(raw.latitude)),false);assert.equal(serialized.includes(String(raw.longitude)),false);
    assert.equal(serialized.includes('OTHER'),false);
    assert.equal(/"latitude"|"longitude"/.test(serialized),false);
  }finally{f.dispose();}
});
}

test('selected trace distinguishes REST omission stale HTTP expiry and line transfer',async()=>{
  const f=fixture({dev:true,trace:true,traceOrder:'TRACE-ONLY'});
  try{
    const h=f.hook(['838']);h.render();await f.flush();
    const raw=f.raw('838','TRACE-ONLY',0);f.emit('PosicaoAtualizada',[raw]);h.render();
    const api=f.load('mobilidadeRio.ts');
    f.api.get=async()=>({ok:true,data:{posicoes:[raw]}});await api.buscarVeiculosPorLinha('838');
    f.api.get=async()=>({ok:true,data:{posicoes:[{...raw,codigoLinha:'999'}]}});
    assert.deepEqual(await api.buscarVeiculosPorLinha('838'),[]);
    f.api.get=async()=>({ok:true,data:{posicoes:[]}});await api.buscarVeiculosPorLinha('838');
    let resolve;f.api.get=()=>new Promise(done=>{resolve=done;});const pending=api.buscarVeiculosPorLinha('838');
    f.emit('LinhaEsvaziada',{codigoLinha:'838'});resolve({ok:true,data:{posicoes:[raw]}});assert.deepEqual(await pending,[]);
    f.clock.now+=1000;
    f.emit('PosicaoAtualizada',[{...raw,codigoLinha:'999',linhaId:'line-999',timestampGps:new Date(f.clock.now).toISOString()}]);h.render();
    f.clock.now+=1000;
    f.emit('PosicaoAtualizada',[{...raw,timestampGps:new Date(f.clock.now).toISOString()}]);h.render();
    f.clock.now+=301000;
    for(const tick of f.intervals.values())if(tick.fixtureIntervalMs===1000)tick();h.render();
    const events=f.diagnostics.filter(([,event])=>event.order==='TRACE-ONLY').map(([,event])=>event);
    assert.ok(events.some(event=>event.stage==='rest_received'&&event.reason==='physical_identity_received'));
    assert.ok(events.some(event=>event.reason==='empty_http_snapshot_not_explicit_removal'));
    assert.ok(events.some(event=>event.stage==='rest_line_filter'&&event.reason==='different_requested_line'));
    assert.ok(events.some(event=>event.reason==='late_read_invalidated'));
    assert.ok(events.some(event=>event.line==='999'&&event.stage==='hook_received'&&event.consumerVisible===false));
    assert.ok(events.some(event=>event.line==='838'&&event.previousLine==='999'));
    assert.ok(events.some(event=>event.stage==='hook_reconciliation'&&event.reason==='gps_retention_expired'));
    assert.equal(h.render().veiculos.length,0);
  }finally{f.dispose();}
});

test('selected identity trace bounds repeated clock diagnostics without changing observations',()=>{
  const f=fixture({dev:true,trace:true,traceOrder:'TRACE-ONLY'});
  try{
    const diagnostics=f.load('roadPresenceDiagnostics.ts');
    const v=f.load('veiculosMapa.ts').adaptarPosicaoRodoviariaV2(f.raw('838','TRACE-ONLY',0));
    const original=JSON.stringify(v),start=f.clock.now;
    for(let seconds=0;seconds<=61;seconds++){
      f.clock.now=start+seconds*1000;
      diagnostics.traceRoadPresence('classifier','same_observation',v,{present:true,gpsAgeSeconds:seconds});
      diagnostics.traceRoadPresence('classifier','same_observation',{...v,idVisual:'road:OTHER'},{present:true});
    }
    const events=f.diagnostics.filter(([,e])=>e.order==='TRACE-ONLY').map(([,e])=>e);
    assert.equal(events.length,3);assert.deepEqual(events.map(e=>e.gpsAgeSeconds),[0,30,60]);
    assert.equal(JSON.stringify(v),original);
    diagnostics.traceRoadPresence('classifier','context_changed',v,{present:true});
    assert.equal(f.diagnostics.at(-1)[1].reason,'context_changed','changed decisions are immediate');
  }finally{f.dispose();}
});

test('Magarca discovery suggests identities only from nearby published endpoints without confirming terminals',()=>{
  const f=fixture({dev:true,trace:true});
  try{
    const diagnostics=f.load('roadPresenceDiagnostics.ts'),adapt=f.load('veiculosMapa.ts').adaptarPosicaoRodoviariaV2;
    const v=adapt(f.raw('838','DISCOVERY',0));
    diagnostics.discoverRoadTerminal([v],{},f.clock.now);
    assert.equal(f.diagnostics.at(-1)[1].reason,'published_magarca_endpoint_not_loaded');
    f.clock.now+=30000;
    const structure={ocorrencias:[{ordem:1,nome:'Terminal Magarça',latitude:v.latitude,longitude:v.longitude},
      {ordem:2,nome:'Outro terminal',latitude:-22,longitude:-43}]};
    diagnostics.discoverRoadTerminal([v],{version:structure},f.clock.now);
    const result=f.diagnostics.at(-1)[1];
    assert.equal(result.reason,'select_physical_order');assert.equal(result.terminalConfirmation,false);
    assert.equal(result.candidates[0].order,'DISCOVERY');assert.equal(result.candidates[0].distanceMetres,0);
    assert.equal(diagnostics.roadPresenceWebViewProbe(),null,'discovery does not silently select a vehicle');
    assert.equal(JSON.stringify(result).includes('latitude'),false);
    f.clock.now+=30000;
    diagnostics.discoverRoadTerminal([{...v,longitude:-40}],{version:structure},f.clock.now);
    assert.equal(f.diagnostics.at(-1)[1].reason,'no_observed_vehicle_within_discovery_radius');
  }finally{f.dispose();}
});


test('838 handoff keeps the bus model and line color without replaying older ITS or snapping', () => {
  const f=fixture({presence:false});
  try {
    const web=webViewRuntime(f.load('../components/mapOSM/webview/mapScript.ts').buildMapWebViewScript({latInicial:0,lngInicial:0,estilosJS:'',filtrosMapaJS:'',estiloMapaPadrao:'fixture'}),f.clock);
    const line={linhaId:'line-838',nome:'838',modal:'onibus',cor:'#aabbcc',segmentos:[[[0,0],[0,.01]]]};
    const p={id:'PILOT',latitude:0,longitude:.001,timestamp:f.clock.now,velocidade:0};
    const update=positions=>web.context.window.updateMap({linhas:[{...line,posicoes:positions}]});
    update([p]);
    const op=web.context.vehicleMarkers['onibus:838:PILOT'];
    const art=op.getElement().querySelector('.bus-inner').querySelector('.vehicle-art').src;
    const physical={key:'physical-pilot',modal:'onibus',originalVehicleId:'PILOT',lineId:'line-838',lineState:'Inherited',serviceCode:'838',
      latitude:.003,longitude:.004,location:'NearTerminal',physicalAt:new Date(f.clock.now-1000).toISOString()};
    web.context.window.updatePhysicalPresence([physical]);assert.equal(Object.keys(web.context.physicalMarkers).length,0);
    update([]);assert.equal(Object.keys(web.context.vehicleMarkers).length,0);
    web.context.window.updatePhysicalPresence([physical]);assert.equal(Object.keys(web.context.physicalMarkers).length,0);
    f.clock.now+=1000;physical.physicalAt=new Date(f.clock.now).toISOString();
    web.context.window.updatePhysicalPresence([physical]);
    const marker=web.context.physicalMarkers[physical.key];
    assert.equal(marker.getElement().className,op.getElement().className);
    assert.equal(marker.getElement().querySelector('.bus-inner').querySelector('.vehicle-art').src,art);
    assert.equal(marker.getLngLat().lng,.004);assert.equal(marker.getLngLat().lat,.003);
    update([{...p,timestamp:f.clock.now+1000}]);assert.equal(Object.keys(web.context.physicalMarkers).length,0);
  } finally { f.dispose(); }
});


test('ITS newer coordinates update one operational marker without projection and GTFS can reclaim it',()=>{
 const f=fixture({presence:false});
 try {
  const web=webViewRuntime(f.load('../components/mapOSM/webview/mapScript.ts').buildMapWebViewScript({latInicial:0,lngInicial:0,estilosJS:'',filtrosMapaJS:'',estiloMapaPadrao:'fixture'}),f.clock);
  const line={linhaId:'line-838',nome:'838',modal:'onibus',cor:'#aabbcc',segmentos:[[[0,0],[0,.01]]]};
  const p={id:'A12345',latitude:0,longitude:.001,timestamp:f.clock.now-155000,velocidade:18};
  const update=positions=>web.context.window.updateMap({linhas:[{...line,posicoes:positions}]});
  update([p]);web.context.startDR();const key='onibus:838:A12345',marker=web.context.vehicleMarkers[key];
  const v={key:'alt',originalVehicleId:'A12345',modal:'onibus',lineId:'line-838',lineState:'Informed',serviceCode:'838',latitude:.002,longitude:.003,physicalAt:new Date(f.clock.now-48000).toISOString(),location:'Outside',facilityStopId:''};
  web.context.window.updatePhysicalPresence([v]);
  assert.equal(web.context.vehicleMarkers[key],marker);assert.equal(Object.keys(web.context.physicalMarkers).length,0);
  assert.equal(marker.getLngLat().lng,.003);assert.equal(marker.getLngLat().lat,.002);
  f.clock.now+=20000;web.ticks[0]();assert.equal(marker.getLngLat().lng,.003);
  update([{...p,timestamp:f.clock.now-100000,longitude:.0015}]);assert.equal(marker.getLngLat().lng,.003);
  assert.equal(web.context.vehiclePopups[key].getElement().querySelector('.popup-stats').innerHTML,'');
  assert.equal(web.context.vehiclePopups[key].getElement().querySelector('.popup-card').getAttribute('data-empty-details'),'true');
  f.clock.now+=600000;web.ticks[0]();assert.equal(marker.getElement().style.opacity,'0');
  update([{...p,timestamp:f.clock.now,longitude:.004}]);assert.equal(web.context.drState[key].alternative,null);
  assert.equal(web.context.drState[key].gpsTimestamp,f.clock.now);
  web.context.window.updatePhysicalPresence([v]);assert.equal(web.context.drState[key].alternative,null);
 }finally{f.dispose();}
});


test('unified backend owns one 838 marker rejects legacy physical competition and keeps ITS stationary',()=>{
 const f=fixture({presence:false});
 try {
  const web=webViewRuntime(f.load('../components/mapOSM/webview/mapScript.ts').buildMapWebViewScript({latInicial:0,lngInicial:0,estilosJS:'',filtrosMapaJS:'',estiloMapaPadrao:'fixture'}),f.clock);
  const line={linhaId:'line-838',nome:'838',modal:'onibus',cor:'#aabbcc',segmentos:[[[0,0],[0,.01]]]};
  const p={id:'A12345',latitude:.002,longitude:.003,timestamp:f.clock.now-48000,backendUnified:true,backendMotionEligible:false,backendValidUntil:f.clock.now+552000,velocidade:0};
  const update=pos=>web.context.window.updateMap({unified838:true,linhas:[{...line,posicoes:pos}]});
  update([p]);web.context.startDR();const key='onibus:838:A12345',marker=web.context.vehicleMarkers[key];
  web.context.window.updatePhysicalPresence([{key:'legacy',modal:'onibus',originalVehicleId:'A12345',serviceCode:'838',lineId:'line-838',lineState:'Informed',latitude:1,longitude:1,physicalAt:new Date(f.clock.now).toISOString()}]);
  assert.equal(Object.keys(web.context.physicalMarkers).length,0);assert.equal(marker.getLngLat().lng,.003);
  f.clock.now+=20000;web.ticks[0]();assert.equal(marker.getLngLat().lng,.003);assert.equal(marker.getLngLat().lat,.002);
  assert.ok(Number(marker.getElement().style.opacity) > .9);
  update([{...p,timestamp:f.clock.now,longitude:.004,backendMotionEligible:true,velocidade:18,posicaoNaRota:.4}]);
  assert.equal(web.context.vehicleMarkers[key],marker);assert.equal(web.context.drState[key].alternative,null);
  assert.equal(web.context.drState[key].backendMotionEligible,true);
 }finally{f.dispose();}
});


test('843 ITS-only composition reaches MapLibre exactly once without ETA direction or DR',()=>{
 const f=fixture({presence:false});
 try{
  const compose=f.load('unifiedLocationContract.ts').composeUnifiedSnapshots;
  const web=webViewRuntime(f.load('../components/mapOSM/webview/mapScript.ts').buildMapWebViewScript({latInicial:0,lngInicial:0,estilosJS:'',filtrosMapaJS:'',estiloMapaPadrao:'fixture'}),f.clock);
  const at=new Date(f.clock.now-20000).toISOString();
  const line={linhaId:'line-843',nome:'843',modal:'onibus',cor:'#163ff3',segmentos:[[[0,0],[0,.01]]],posicoes:[]};
  const vehicle={key:'onibus:SPPO:D86066',order:'D86066',line:{lineId:'line-843',serviceCode:'843',state:1,validatedAt:at},
   location:{latitude:.002,longitude:.003,physicalAt:at,validUntil:new Date(f.clock.now+580000).toISOString(),source:'ITS_CURRENT',provider:'ZIRIX',uncertain:false,reason:'newest_validated'},
   operational:null,spatial:{facilityStopId:null,state:'Outside'},motionEligible:false};
  const snapshot={schemaVersion:1,enabled:true,lineCode:'843',revision:1,composedAt:new Date(f.clock.now).toISOString(),vehicles:[vehicle]};
  const update=()=>web.context.window.updateMap({unifiedCodes:['843'],linhas:compose([line],[snapshot],f.clock.now)});
  update();const key='onibus:843:D86066',marker=web.context.vehicleMarkers[key];assert.ok(marker);
  assert.equal(marker.getLngLat().lng,.003);assert.equal(marker.getLngLat().lat,.002);
  web.context.startDR();f.clock.now+=20000;web.ticks[0]();assert.equal(marker.getLngLat().lng,.003);
  web.context.window.updatePhysicalPresence([{key:'legacy',originalVehicleId:'D86066',modal:'onibus',serviceCode:'843',lineState:'Informed',latitude:1,longitude:1,physicalAt:new Date(f.clock.now).toISOString()}]);
  assert.equal(Object.keys(web.context.physicalMarkers).length,0);assert.equal(Object.keys(web.context.vehicleMarkers).length,1);
  assert.equal(web.context.vehiclePopups[key].getElement().querySelector('.popup-stats').innerHTML,'');
  assert.equal(web.context.vehiclePopups[key].getElement().querySelector('.popup-card').getAttribute('data-empty-details'),'true');
  snapshot.revision=2;vehicle.location.longitude=.004;vehicle.location.physicalAt=new Date(f.clock.now-1000).toISOString();update();
  assert.equal(web.context.vehicleMarkers[key],marker);
  assert.ok(web.frames.size>0);assert.equal(marker.getLngLat().lng,.003);
  f.clock.now+=1600;for(const [id,fn] of [...web.frames]){web.frames.delete(id);fn(f.clock.now);}
  assert.equal(marker.getLngLat().lng,.004);
  f.clock.now+=600000;update();assert.equal(Object.keys(web.context.vehicleMarkers).length,0);
 }finally{f.dispose();}
});

test('hybrid retained itinerary projects continuously between GPS samples and stops at freshness horizon',()=>{
 const f=fixture({presence:false});
 try {
  const compose=f.load('hybridContext.ts').createHybridComposer();
  const web=webViewRuntime(f.load('../components/mapOSM/webview/mapScript.ts').buildMapWebViewScript({latInicial:0,lngInicial:0,estilosJS:'',filtrosMapaJS:'',estiloMapaPadrao:'fixture'}),f.clock);
  const line={nome:'838',modal:'onibus',linhaId:'line',segmentos:[[[0,0],[0,.02]]],itinerarioSegmentoMap:{out:0},itinerarioSentidoMap:{out:'Destino'},paradasPorPadrao:{out:[{nome:'Seguinte',latitude:0,longitude:.01,ordem:1,paradaId:'stop'}]}};
  const at=f.clock.now;
  const v={key:'bus',order:'D86023',line:{lineId:'line',serviceCode:'838',state:1},location:{latitude:0,longitude:.001,physicalAt:new Date(at).toISOString(),validUntil:new Date(at+600000).toISOString(),source:'GTFSRT_BUS',provider:'GTFS',speedKmh:20,uncertain:false,reason:'valid'},operational:{timestampGps:new Date(at).toISOString(),latitude:0,longitude:.001,status:0,linhaId:'line',codigoLinha:'838',padraoVersaoId:'out',sentidoId:'direction',posicaoNaRota:.05},spatial:{facilityStopId:null,state:'Outside'},motionEligible:true};
  const s={schemaVersion:1,enabled:true,lineCode:'838',revision:1,composedAt:new Date(at).toISOString(),vehicles:[v]};
  const update=()=>web.context.window.updateMap({unifiedCodes:['838'],linhas:compose([line],[s],f.clock.now)});
  update();web.context.startDR();const key='onibus:838:D86023',marker=web.context.vehicleMarkers[key];
  f.clock.now+=30000;v.location.source='ITS_CURRENT';v.location.physicalAt=new Date(f.clock.now).toISOString();v.location.longitude=.002;v.operational=null;v.motionEligible=false;s.revision++;update();
  web.ticks[0]();
  f.clock.now+=1700;for(const [id,fn] of [...web.frames]){web.frames.delete(id);fn(f.clock.now);}
  web.ticks[0]();
  const before=marker.getLngLat().lng;
  f.clock.now+=10000;web.ticks[0]();const after=marker.getLngLat().lng;
  assert.ok(after>before);assert.ok(after-before<.001);
  assert.equal(web.context.drState[key].gpsTimestamp,at+30000);
  assert.equal(web.context.vehicleMarkers[key],marker);
  assert.match(web.context.vehiclePopups[key].getElement().querySelector('.popup-header').innerHTML,/estimado/);
  assert.match(web.context.vehiclePopups[key].getElement().querySelector('.popup-stats').innerHTML,/Seguinte/);
  f.clock.now=at+91000;web.ticks[0]();const stopped=marker.getLngLat().lng;
  f.clock.now+=30000;web.ticks[0]();assert.equal(marker.getLngLat().lng,stopped);
  v.location.source='GTFSRT_BUS';v.location.physicalAt=new Date(f.clock.now).toISOString();v.location.longitude=.008;
  v.operational={timestampGps:v.location.physicalAt,latitude:0,longitude:.008,status:0,linhaId:'line',codigoLinha:'838',padraoVersaoId:'out',sentidoId:'direction'};s.revision++;update();
  assert.equal(web.context.vehicleMarkers[key],marker);assert.doesNotMatch(web.context.vehiclePopups[key].getElement().querySelector('.popup-header').innerHTML,/estimado/);
 }finally{f.dispose();}
});

test('popup local clock keeps terminal state and labels last speed before the delayed warning',()=>{
 const f=fixture({presence:false});try{
  const web=webViewRuntime(f.load('../components/mapOSM/webview/mapScript.ts').buildMapWebViewScript({latInicial:0,lngInicial:0,estilosJS:'',filtrosMapaJS:'',estiloMapaPadrao:'fixture'}),f.clock);
  const ts=f.clock.now-8000,status={style:{},textContent:'No terminal'},speed={textContent:'Velocidade'},warning={textContent:''};
  const root={querySelector:s=>s==='.popup-status'?status:s==='[data-speed-label]'?speed:s==='.gps-warning'?warning:null};
  const age={getAttribute:()=>String(ts),closest:()=>root,textContent:''};web.context.document.querySelectorAll=()=>[age];
  web.context.updateTimeAgo();assert.equal(age.textContent,'8 s');
  f.clock.now+=127000;web.context.updateTimeAgo();assert.equal(age.textContent,'2 min 15 s');
  assert.equal(status.textContent,'No terminal');assert.equal(status.style.color,undefined);assert.equal(speed.textContent,'Última velocidade');assert.equal(warning.textContent,'');
  f.clock.now+=46000;web.context.updateTimeAgo();assert.equal(warning.textContent,'GPS atrasado');assert.equal(status.style.color,'#b7791f');assert.equal(status.textContent,'No terminal');
  f.clock.now+=120000;web.context.updateTimeAgo();assert.equal(warning.textContent,'Última posição conhecida');assert.equal(age.getAttribute(),String(ts));
 }finally{f.dispose();}
});

test('parent renders without GPS do not send realtime payloads or reload the map',()=>{
 const f=fixture({presence:false});try{
  const native=f.bridge(),sent=[];
  const line={nome:'855',modal:'onibus',structureKey:'fixed',posicoes:[{id:'D86222',latitude:0,longitude:0,timestamp:f.clock.now,velocidade:20}]};
  const props=(age=0)=>({location:null,linhasParaMostrar:[{...line,posicoes:line.posicoes.map(p=>({...p,presencaIdadeSegundos:age}))}]});
  let view=native.render(props());const html=view.props.source;
  view.props.ref.current={injectJavaScript:code=>sent.push(code)};
  view.props.onMessage({nativeEvent:{data:'map_ready'}});native.render(props());
  const count=sent.length;
  for(let i=0;i<10;i++){view=native.render(props(i));assert.equal(view.props.source,html);}
  assert.equal(sent.length,count);
 }finally{f.dispose();}
});

test('road popup keeps passenger fields compact and technical context out of the normal card',()=>{
 const f=fixture({presence:false});try{
  const web=webViewRuntime(f.load('../components/mapOSM/webview/mapScript.ts').buildMapWebViewScript({latInicial:0,lngInicial:0,estilosJS:'',filtrosMapaJS:'',estiloMapaPadrao:'fixture'}),f.clock);
  const p={id:'D86222',timestamp:f.clock.now,backendUnified:true,unifiedSource:'ITS_CURRENT',contextConfidence:'retained',velocidade:22,velocidadeMedia:40,proximaParadaNome:'Parada seguinte',distanciaProximaParadaMetros:211,presencaRotulo:'Perto do terminal',sentidoNome:'Destino muito longo '.repeat(20)};
  const html=web.context.buildPopup({nome:'855'},p,p.id,0);
  assert.match(html,/22 km\/h/);assert.doesNotMatch(html,/40 km\/h|Fonte GPS|Contexto GTFS|identificador|ITS_CURRENT/);
  assert.match(html,/Parada seguinte/);assert.match(html,/211 m/);assert.match(html,/data-road="true"/);
  const previousSpeed=web.context.buildPopup({nome:'855'},{...p,velocidade:undefined,lastObservedSpeedKmh:22,speedObservedAt:f.clock.now-30000},p.id,0);
  assert.match(previousSpeed,/Última velocidade/);assert.match(previousSpeed,/22 km\/h/);
  const css=f.load('../components/mapOSM/webview/mapStyles.ts').MAP_WEBVIEW_STYLES;
  assert.match(css,/max-height:min\(48vh,300px\)/);assert.match(css,/overflow-y:auto/);assert.match(css,/text-overflow:ellipsis/);
 }finally{f.dispose();}
});

test('road popup restores the visible details button and the original adaptive three column grid',()=>{
 const f=fixture({presence:false});try{
  const css=f.load('../components/mapOSM/webview/mapStyles.ts').MAP_WEBVIEW_STYLES;
  assert.doesNotMatch(css,/\.popup-card\[data-road\] \.popup-toggle\{display:none\}/);
  assert.doesNotMatch(css,/\.popup-card\[data-road\] \.popup-details\{[^}]*opacity:1/);
  assert.match(css,/\.popup-details\{max-height:0;opacity:0;overflow:hidden/);
  assert.match(css,/\.popup-card\[data-road\] \.popup-details\.open\{[^}]*overflow-y:auto/);
  assert.match(css,/grid-template-columns:repeat\(auto-fit,minmax\(75px,1fr\)\)/);
  assert.doesNotMatch(css,/\.popup-card\[data-road\] \.popup-stats\{grid-template-columns:repeat\(2/);
  assert.doesNotMatch(css,/\[data-field="next-stop"\]\{grid-column:1\/-1\}/);
 }finally{f.dispose();}
});

test('hybrid popup preserves open and closed details and labels across GPS and local age updates',()=>{
 const f=fixture({presence:false});try{
  const web=webViewRuntime(f.load('../components/mapOSM/webview/mapScript.ts').buildMapWebViewScript({latInicial:0,lngInicial:0,estilosJS:'',filtrosMapaJS:'',estiloMapaPadrao:'fixture'}),f.clock);
  let p={id:'D86222',timestamp:f.clock.now,latitude:0,longitude:.001,backendUnified:true,backendMotionEligible:false,backendValidUntil:f.clock.now+600000,unifiedSource:'GTFSRT_BUS',velocidade:22,contextConfidence:'retained',sentidoNome:'Destino',proximaParadaNome:'Seguinte',distanciaProximaParadaMetros:211,presencaRotulo:'Em movimento'};
  const send=()=>web.context.window.updateMap({unifiedCodes:['855'],linhas:[{nome:'855',modal:'onibus',posicoes:[p]}]});
  send();const popup=web.context.vehiclePopups['onibus:855:D86222'];popup.open=true;popup.events.open();
  const root=popup.getElement(),details=root.querySelector('.popup-details'),button=root.querySelector('.popup-toggle'),label=button.querySelector('.toggle-label');
  assert.equal(details.classList.contains('open'),false);assert.equal(label.textContent,'Mais detalhes');
  web.context.toggleDetails(button);assert.equal(label.textContent,'Menos detalhes');assert.equal(details.classList.contains('open'),true);
  const writes=popup.writes;
  f.clock.now+=30000;p={...p,timestamp:f.clock.now,longitude:.002,unifiedSource:'ITS_CURRENT',velocidade:24,distanciaProximaParadaMetros:180};send();
  assert.equal(popup.getElement(),root);assert.equal(root.querySelector('.popup-details'),details);assert.equal(popup.writes,writes);
  assert.equal(details.classList.contains('open'),true);assert.equal(label.textContent,'Menos detalhes');
  assert.match(root.querySelector('.popup-stats').innerHTML,/24 km\/h/);assert.match(root.querySelector('.popup-stats').innerHTML,/180 m/);
  assert.match(root.querySelector('.popup-stats').innerHTML,/provável/);assert.doesNotMatch(root.querySelector('.popup-stats').innerHTML,/ITS_CURRENT|Contexto GTFS/);
  const age={getAttribute:()=>String(p.timestamp),textContent:''};
  web.context.document.querySelectorAll=()=>[age];
  const physicalAt=p.timestamp;f.clock.now+=2000;web.context.updateTimeAgo();
  assert.equal(age.textContent,'2 s');assert.equal(p.timestamp,physicalAt);
  assert.equal(popup.writes,writes);assert.equal(details.classList.contains('open'),true);
  web.context.toggleDetails(button);assert.equal(label.textContent,'Mais detalhes');assert.equal(details.classList.contains('open'),false);
  f.clock.now+=30000;p={...p,timestamp:f.clock.now,longitude:.003,velocidade:undefined,distanciaProximaParadaMetros:120};send();
  assert.equal(details.classList.contains('open'),false);assert.equal(label.textContent,'Mais detalhes');assert.equal(popup.writes,writes);
  assert.doesNotMatch(root.querySelector('.popup-stats').innerHTML,/data-live-speed|km\/h/);assert.equal((root.querySelector('.popup-stats').innerHTML.match(/class="popup-stat"/g)||[]).length,2);
  web.context.toggleDetails(button);
  f.clock.now+=1000;p={...p,timestamp:f.clock.now,proximaParadaNome:null,distanciaProximaParadaMetros:null};send();
  assert.equal(root.querySelector('.popup-card').getAttribute('data-empty-details'),'true');
  assert.equal(root.querySelector('.popup-stats').innerHTML,'');assert.equal(details.classList.contains('open'),true);
  f.clock.now+=1000;p={...p,timestamp:f.clock.now,velocidade:16};send();
  assert.equal(root.querySelector('.popup-card').getAttribute('data-empty-details'),'false');
  assert.equal((root.querySelector('.popup-stats').innerHTML.match(/class="popup-stat"/g)||[]).length,1);
  assert.equal(details.classList.contains('open'),true);assert.equal(label.textContent,'Menos detalhes');assert.equal(popup.writes,writes);
 }finally{f.dispose();}
});

test('coherent WebView projection passes 60 seconds but respects 90 seconds 250 metres and public expiry',()=>{
 const f=fixture({presence:false});try{
  const web=webViewRuntime(f.load('../components/mapOSM/webview/mapScript.ts').buildMapWebViewScript({latInicial:0,lngInicial:0,estilosJS:'',filtrosMapaJS:'',estiloMapaPadrao:'fixture'}),f.clock);
  const at=f.clock.now,p={id:'D86286',latitude:0,longitude:.001,timestamp:at,backendUnified:true,backendMotionEligible:true,backendValidUntil:at+480001,projectionUntil:at+90000,projectionSpeedKmh:10,projectionMaxMetres:250,comprimentoRotaMetros:2223.9,posicaoNaRota:.05,padraoVersaoId:'out',velocidade:10,lastObservedSpeedKmh:10};
  web.context.window.updateMap({unifiedCodes:['855'],linhas:[{nome:'855',modal:'onibus',segmentos:[[[0,0],[0,.02]]],itinerarioSegmentoMap:{out:0},posicoes:[p]}]});
  const key='onibus:855:D86286',marker=web.context.vehicleMarkers[key];web.context.startDR();let sixty;
  for(let i=1;i<=89;i++){f.clock.now=at+i*1000;web.ticks[0]();if(i===60)sixty=marker.getLngLat().lng;}
  assert.ok(marker.getLngLat().lng>sixty);assert.ok(web.context.drState[key].projectedMetres<=250);
  const last=marker.getLngLat().lng;f.clock.now=at+91000;web.ticks[0]();assert.equal(marker.getLngLat().lng,last);
  for(const [age,opacity] of [[180000,'1'],[300000,'0.55'],[480000,'0.55']]){f.clock.now=at+age;web.ticks[0]();assert.equal(marker.getElement().style.opacity,opacity);assert.equal(web.context.drState[key].gpsTimestamp,at);}
  f.clock.now=at+480001;web.ticks[0]();assert.equal(web.context.vehicleMarkers[key],undefined);
 }finally{f.dispose();}
});

test('canonical terminal evidence reaches radar callback without duplicating geometry in WebView payloads',()=>{
 const at=Date.now(),snapshot={schemaVersion:1,enabled:true,lineCode:'855',revision:1,composedAt:new Date(at).toISOString(),vehicles:[{key:'bus',order:'D86286',line:{lineId:'line',serviceCode:'855',state:1},location:{latitude:0,longitude:0,physicalAt:new Date(at).toISOString(),validUntil:new Date(at+600000).toISOString(),source:'ITS_CURRENT',provider:'ITS',speedKmh:0,uncertain:false,reason:'valid'},operational:null,spatial:{facilityStopId:null,state:'Outside'},motionEligible:false}]};
 const f=fixture({presence:false,unified:[snapshot]});try{
  f.clock.now=at;const native=f.bridge(),sent=[],evidence=[];
  const callback=rows=>evidence.push(rows);
  const line={nome:'855',modal:'onibus',linhaId:'line',structureKey:'stable',terminaisOficiais:['Terminal A','Terminal B'],segmentos:[[[0,0],[0,.01]]],itinerarioSegmentoMap:{out:0},paradasPorPadrao:{out:[{paradaId:'a',nome:'Terminal A',ordem:1,latitude:0,longitude:0,posicaoLinha:0},{paradaId:'s1',nome:'Primeira',ordem:2,latitude:0,longitude:.001,posicaoLinha:.1},{paradaId:'b',nome:'Terminal B',ordem:3,latitude:0,longitude:.01,posicaoLinha:1}]}};
  const props={location:null,linhasParaMostrar:[line],onTerminalVehiclesChange:callback};let view=native.render(props);
  view.props.ref.current={injectJavaScript:code=>sent.push(code)};view.props.onMessage({nativeEvent:{data:'map_ready'}});native.render(props);
  f.clock.now+=20000;snapshot.revision++;snapshot.vehicles[0].location.physicalAt=new Date(f.clock.now).toISOString();native.render(props);
  assert.equal(evidence.at(-1).length,1);assert.equal(evidence.at(-1)[0].state,'No terminal');assert.equal(evidence.at(-1)[0].corridors[0].stops[0].id,'s1');
  for(const command of sent)assert.doesNotMatch(command,/"terminalPresence"|"corridors"|"originId"/);
 }finally{f.dispose();}
});

test('official terminal metadata is scoped to exact line identity cached and retryable after absence',async()=>{
 const f=fixture({presence:false});try{
  const service=f.load('estruturaV2.ts');let calls=0;
  f.api.get=async(path,options)=>{calls++;assert.equal(path,'/linhas');assert.equal(options.params.nome,'855');return {ok:true,data:{itens:[{linhaId:'foreign',codigo:'855',terminalA:'Wrong terminal'},{linhaId:'line',codigo:'855',terminalA:'Terminal A',terminalB:'Terminal B'}]}};};
  const [a,b]=await Promise.all([service.obterTerminaisOficiaisV2('855','line'),service.obterTerminaisOficiaisV2('855','line')]);
  assert.deepEqual(a,['Terminal A','Terminal B']);assert.deepEqual(b,a);assert.equal(calls,1);
  service.limparCacheEstruturalV2ParaTestes();
  let attempt=0;f.api.get=async()=>({ok:true,data:{itens:++attempt===1?[]:[{linhaId:'line',codigo:'855',terminalA:'Recovered terminal'}]}});
  assert.deepEqual(await service.obterTerminaisOficiaisV2('855','line'),[]);
  assert.deepEqual(await service.obterTerminaisOficiaisV2('855','line'),['Recovered terminal']);assert.equal(attempt,2);
 }finally{f.dispose();}
});

test('D86286 unknown ITS acquires a GTFS route and returns to ITS without recreating marker or popup',()=>{
 const f=fixture({presence:false});try{
  const web=webViewRuntime(f.load('../components/mapOSM/webview/mapScript.ts').buildMapWebViewScript({latInicial:0,lngInicial:0,estilosJS:'',filtrosMapaJS:'',estiloMapaPadrao:'fixture'}),f.clock);
  let p={id:'D86286',linhaId:'line',latitude:0,longitude:.001,timestamp:f.clock.now,backendUnified:true,backendMotionEligible:false,backendValidUntil:f.clock.now+480001,velocidade:20,unifiedSource:'ITS_CURRENT',physicalOnly:true};
  const send=()=>web.context.window.updateMap({unifiedCodes:['855'],linhas:[{nome:'855',linhaId:'line',modal:'onibus',segmentos:[[[0,0],[0,.02]]],itinerarioSegmentoMap:{out:0},posicoes:[p]}]});
  send();const key='onibus:855:D86286',marker=web.context.vehicleMarkers[key],popup=web.context.vehiclePopups[key];
  popup.open=true;popup.events.open();const details=popup.getElement().querySelector('.popup-details');web.context.toggleDetails(popup.getElement().querySelector('.popup-toggle'));
  for(const source of ['GTFSRT_BUS','ITS_CURRENT']){
   f.clock.now+=30000;p={...p,timestamp:f.clock.now,longitude:p.longitude+.001,backendMotionEligible:true,projectionUntil:f.clock.now+60000,projectionSpeedKmh:20,projectionMaxMetres:250,comprimentoRotaMetros:2223.9,padraoVersaoId:'out',sentidoId:'sense',padraoOperacionalId:source==='GTFSRT_BUS'?'pattern':null,posicaoNaRota:(p.longitude+.001)/.02,physicalOnly:false,contextConfidence:source==='GTFSRT_BUS'?'confirmed':'retained',unifiedSource:source};
   send();assert.equal(web.context.vehicleMarkers[key],marker);assert.equal(web.context.vehiclePopups[key],popup);assert.ok(web.frames.size>0);assert.equal(details.classList.contains('open'),true);
   f.clock.now+=1700;for(const [id,fn] of [...web.frames]){web.frames.delete(id);fn(f.clock.now);}
   assert.ok(Math.abs(marker.getLngLat().lng-p.longitude)<1e-8);
  }
 }finally{f.dispose();}
});

test('expired context stops projection on metadata-only updates without renewing GPS time',()=>{
 const f=fixture({presence:false});try{
  const web=webViewRuntime(f.load('../components/mapOSM/webview/mapScript.ts').buildMapWebViewScript({latInicial:0,lngInicial:0,estilosJS:'',filtrosMapaJS:'',estiloMapaPadrao:'fixture'}),f.clock);
  const at=f.clock.now,p={id:'D86286',latitude:0,longitude:.001,timestamp:at,backendUnified:true,backendMotionEligible:true,backendValidUntil:at+480001,projectionUntil:at+90000,projectionSpeedKmh:10,projectionMaxMetres:250,comprimentoRotaMetros:2223.9,posicaoNaRota:.05,padraoVersaoId:'out'};
  const send=()=>web.context.window.updateMap({unifiedCodes:['855'],linhas:[{nome:'855',modal:'onibus',segmentos:[[[0,0],[0,.02]]],itinerarioSegmentoMap:{out:0},posicoes:[p]}]});
  send();web.context.startDR();f.clock.now+=10000;web.ticks[0]();const marker=web.context.vehicleMarkers['onibus:855:D86286'],before=marker.getLngLat().lng;
  p.backendMotionEligible=false;p.projectionUntil=undefined;p.padraoVersaoId=null;send();
  f.clock.now+=10000;web.ticks[0]();assert.equal(marker.getLngLat().lng,before);assert.equal(web.context.drState['onibus:855:D86286'].gpsTimestamp,at);
 }finally{f.dispose();}
});

test('D86150 origin geometry projects continuously without a trip and stops before a shared branch',()=>{
 const f=fixture({presence:false});try{
  const web=webViewRuntime(f.load('../components/mapOSM/webview/mapScript.ts').buildMapWebViewScript({latInicial:0,lngInicial:0,estilosJS:'',filtrosMapaJS:'',estiloMapaPadrao:'fixture'}),f.clock);
  const at=f.clock.now,route=[[0,0],[0,.002],[.004,.006]],other=[[0,0],[0,.002],[-.004,.006],[.004,.006]];
  const base={paradaId:'origin',nome:'Terminal A',ordem:1,latitude:0,longitude:0,posicaoLinha:0,distanciaMetros:0};
  const stops=[base,{...base,paradaId:'next',nome:'Próxima',ordem:2,longitude:.001,distanciaMetros:111.195},{...base,paradaId:'end',nome:'Terminal B',ordem:3,latitude:.004,longitude:.006,distanciaMetros:850}];
  const line={nome:'838',modal:'onibus',linhaId:'line',modoSentido:'ambos',terminaisOficiais:['Terminal A','Terminal B'],segmentos:[route,other],itinerarioSegmentoMap:{a:0,b:1},paradasPorPadrao:{a:stops,b:stops.map(s=>({...s}))}};
  const snapshot={schemaVersion:1,enabled:true,lineCode:'838',revision:0,composedAt:new Date(at).toISOString(),vehicles:[{key:'D86150',order:'D86150',line:{lineId:'line',serviceCode:'838',state:1},location:{latitude:0,longitude:0,physicalAt:new Date(at).toISOString(),validUntil:new Date(at+600000).toISOString(),source:'ITS_CURRENT',provider:'ITS',speedKmh:0,uncertain:false,reason:'valid'},operational:null,spatial:{facilityStopId:null,state:'Outside'},motionEligible:false}]};
  const compose=f.load('hybridContext.ts').createHybridComposer();let p;
  const send=(seconds,metres,speed)=>{f.clock.now=at+seconds*1000;snapshot.revision++;snapshot.vehicles[0].location={...snapshot.vehicles[0].location,physicalAt:new Date(f.clock.now).toISOString(),longitude:metres/111195,speedKmh:speed};const lines=compose([line],[snapshot],f.clock.now);p=lines[0].posicoes[0];web.context.window.updateMap({unifiedCodes:['838'],linhas:lines});};
  send(0,0,0);const key='onibus:838:D86150',marker=web.context.vehicleMarkers[key],popup=web.context.vehiclePopups[key];
  send(20,0,0);send(40,50,36);assert.equal(p.padraoVersaoId,null);assert.equal(p.physicalRoutePattern,'a');assert.equal(p.backendMotionEligible,true);
  assert.equal(web.context.vehicleMarkers[key],marker);assert.equal(web.context.vehiclePopups[key],popup);
  f.clock.now+=1000;for(const [id,fn]of [...web.frames]){web.frames.delete(id);fn(f.clock.now);}
  const observed=marker.getLngLat().lng;web.context.startDR();
  for(let i=0;i<20;i++){f.clock.now+=1000;web.ticks[0]();}
  assert.ok(marker.getLngLat().lng>observed);assert.equal(marker.getLngLat().lat,0);
  for(let i=0;i<80;i++){f.clock.now+=1000;web.ticks[0]();}
  assert.ok(marker.getLngLat().lng<.002);assert.equal(marker.getLngLat().lat,0);assert.equal(web.context.drState[key].gpsTimestamp,at+40000);
 }finally{f.dispose();}
});

test('hybrid WebView temporal sequence keeps one moving marker through ITS zero stop GTFS and operational expiry',()=>{
 const f=fixture({presence:false});try{
  const web=webViewRuntime(f.load('../components/mapOSM/webview/mapScript.ts').buildMapWebViewScript({latInicial:0,lngInicial:0,estilosJS:'',filtrosMapaJS:'',estiloMapaPadrao:'fixture'}),f.clock),start=f.clock.now,m=111195;
  const stops=[0,100,1000,5000].map((d,i)=>({paradaId:'s'+i,nome:i===0?'Terminal A':i===3?'Terminal B':'Next '+i,latitude:0,longitude:d/m,ordem:i+1,posicaoLinha:d/5000,distanciaMetros:d}));
  const line={nome:'838',modal:'onibus',linhaId:'line',modoSentido:'ambos',terminaisOficiais:['Terminal A','Terminal B'],segmentos:[[[0,0],[0,5000/m]],[[0,5000/m],[0,0]]],itinerarioSegmentoMap:{out:0,back:1},itinerarioSentidoMap:{out:'B',back:'A'},paradasPorPadrao:{out:stops,back:[...stops].reverse().map((s,i)=>({...s,ordem:i+1,distanciaMetros:5000-s.distanciaMetros}))}};
  const snapshot={schemaVersion:1,enabled:true,lineCode:'838',revision:0,composedAt:new Date(start).toISOString(),vehicles:[{key:'D86089',order:'D86089',line:{lineId:'line',serviceCode:'838',state:1},location:{latitude:0,longitude:0,physicalAt:new Date(start).toISOString(),validUntil:new Date(start+1000000).toISOString(),source:'ITS_CURRENT',provider:'ITS',speedKmh:0,uncertain:false,reason:'valid'},operational:null,spatial:{facilityStopId:null,state:'Outside'},motionEligible:false}]};
  const compose=f.load('hybridContext.ts').createHybridComposer(),v=snapshot.vehicles[0],key='onibus:838:D86089';let p;
  const send=(seconds,d,speed,confirmed=false)=>{
   f.clock.now=start+seconds*1000;v.location={...v.location,physicalAt:new Date(f.clock.now).toISOString(),longitude:d/m,speedKmh:speed,source:confirmed?'GTFSRT_BUS':'ITS_CURRENT'};v.operational=confirmed?{timestampGps:v.location.physicalAt,latitude:0,longitude:d/m,status:0,linhaId:'line',codigoLinha:'838',padraoVersaoId:'out',sentidoId:'out'}:null;snapshot.revision++;
   const lines=compose([line],[snapshot],f.clock.now);p=lines[0].posicoes[0];web.context.window.updateMap({unifiedCodes:['838'],linhas:lines});
  };
  const advance=(n)=>{web.context.startDR();for(let i=0;i<n;i++){f.clock.now+=1000;for(const [id,fn]of [...web.frames]){web.frames.delete(id);fn(f.clock.now);}web.ticks[0]();}};
  send(0,0,0);const marker=web.context.vehicleMarkers[key],popup=web.context.vehiclePopups[key];send(20,0,0);send(40,50,9);advance(5);assert.ok(marker.getLngLat().lng>50/m);
  send(60,100,0);advance(5);assert.equal(p.lastObservedSpeedKmh,0);assert.ok(marker.getLngLat().lng>100/m);
  send(80,100,0);advance(5);const stopped=marker.getLngLat().lng;advance(10);assert.equal(marker.getLngLat().lng,stopped);assert.ok(p.padraoVersaoId||p.physicalRoutePattern);
  send(110,100,0);advance(5);assert.equal(p.backendMotionEligible,false);
  for(const [seconds,d,confirmed]of [[140,200,false],[170,350,true],[200,500,false],[230,650,false],[260,800,false],[290,950,false],[320,1100,false],[350,1250,false],[380,1400,false],[410,1550,true]]){
   send(seconds,d,18,confirmed);advance(5);assert.equal(web.context.vehicleMarkers[key],marker);assert.equal(web.context.vehiclePopups[key],popup);assert.ok(marker.getLngLat().lng>d/m,`render advances after ${seconds}`);assert.equal(web.context.drState[key].gpsTimestamp,start+seconds*1000);
  }
  const last=marker.getLngLat().lng;advance(100);assert.ok(marker.getLngLat().lng>=last);const frozen=marker.getLngLat().lng;advance(30);assert.equal(marker.getLngLat().lng,frozen);
 }finally{f.dispose();}
});

test('canonical marker reconciles newer GPS behind a projected route end and visual labels never gate motion',()=>{
 const f=fixture({presence:false});try{
  const web=webViewRuntime(f.load('../components/mapOSM/webview/mapScript.ts').buildMapWebViewScript({latInicial:0,lngInicial:0,estilosJS:'',filtrosMapaJS:'',estiloMapaPadrao:'fixture'}),f.clock),at=f.clock.now;
  let p={id:'D86131',linhaId:'line',latitude:0,longitude:.009,timestamp:at,backendUnified:true,backendValidUntil:at+480001,backendMotionEligible:true,projectionUntil:at+90000,projectionMaxMetres:250,projectionSpeedKmh:36,comprimentoRotaMetros:1111.95,posicaoNaRota:.9,padraoVersaoId:'out',sentidoId:'out'};
  const send=()=>web.context.window.updateMap({unifiedCodes:['838'],linhas:[{nome:'838',modal:'onibus',segmentos:[[[0,0],[0,.01]]],itinerarioSegmentoMap:{out:0,other:0},posicoes:[p]}]});
  send();const key='onibus:838:D86131',marker=web.context.vehicleMarkers[key],popup=web.context.vehiclePopups[key];
  web.context.startDR();for(let i=0;i<30;i++){f.clock.now+=1000;web.ticks[0]();}assert.equal(marker.getLngLat().lng,.01);
  p={...p,timestamp:f.clock.now,longitude:.0093,posicaoNaRota:.93,projectionUntil:f.clock.now+60000,padraoVersaoId:'other',presencaRotulo:'Localização incerta'};send();assert.equal(web.context.vehicleMarkers[key],marker);assert.equal(web.context.vehiclePopups[key],popup);assert.ok(web.frames.size>0);
  f.clock.now+=1000;for(const [id,fn]of [...web.frames]){web.frames.delete(id);fn(f.clock.now);}assert.ok(Math.abs(marker.getLngLat().lng-.0093)<1e-8);
  f.clock.now+=1000;web.ticks[0]();assert.ok(marker.getLngLat().lng>.0093);
 }finally{f.dispose();}
});

for(const enabled of [false,true])test(`WebView movement trace is observation-scoped opt-in and resolves physical routes enabled=${enabled}`,()=>{
 const f=fixture({presence:false});try{
  const web=webViewRuntime(f.load('../components/mapOSM/webview/mapScript.ts').buildMapWebViewScript({latInicial:0,lngInicial:0,estilosJS:'',filtrosMapaJS:'',estiloMapaPadrao:'fixture'}),f.clock),messages=[];
  web.context.window.ReactNativeWebView={postMessage:s=>messages.push(JSON.parse(s))};
  let p={id:'D86150',latitude:0,longitude:.001,timestamp:f.clock.now,backendUnified:true,backendMotionEligible:true,backendValidUntil:f.clock.now+480001,projectionUntil:f.clock.now+5000,projectionMaxMetres:250,projectionSpeedKmh:18,comprimentoRotaMetros:2223.9,posicaoNaRota:.05,physicalRoutePattern:'out',routeConfidence:'origin',lastObservedSpeedKmh:18,speedObservedAt:f.clock.now,unifiedSource:'ITS_CURRENT'};
  const send=()=>web.context.window.updateMap({movementDiagnostics:true,movementTraceOrders:enabled?['D86150']:[],unifiedCodes:['838'],linhas:[{nome:'838',modal:'onibus',segmentos:[[[0,0],[0,.02]],[[0,.02],[0,0]]],itinerarioSegmentoMap:{out:0,back:1},posicoes:[p]}]});
  send();web.context.startDR();for(let i=0;i<20;i++){f.clock.now+=1000;web.ticks[0]();}
  p={...p,longitude:.002,posicaoNaRota:.1,timestamp:f.clock.now,speedObservedAt:f.clock.now,projectionUntil:f.clock.now+5000};send();
  f.clock.now+=1000;for(const [id,fn]of [...web.frames]){web.frames.delete(id);fn(f.clock.now);}
  for(let i=0;i<20;i++){f.clock.now+=1000;web.ticks[0]();}
  const events=messages.filter(e=>e.type==='movement_trace');assert.equal(events.length,enabled?4:0);
  if(enabled){const observed=events.filter(e=>e.stage==='marker');assert.deepEqual(observed.map(e=>e.reused),[false,true]);assert.ok(observed.every(e=>e.effective&&e.physicalRoutePattern==='out'));assert.ok(events.filter(e=>e.stage==='stop').every(e=>e.reason==='projection_horizon'));assert.equal(observed[1].timestamp,p.timestamp);}
 }finally{f.dispose();}
});
for(const dev of [false,true])for(const enabled of [false,true])test(`native motion trace is bounded identity-filtered and does not renew GPS dev=${dev} enabled=${enabled}`,()=>{
 const f=fixture({dev,motionTrace:enabled,motionOrders:'D86089,D86131,D86150,D86241'});try{
  const diagnostic=f.load('movementDiagnostics.ts'),p={id:'D86089',timestamp:f.clock.now,unifiedSource:'ITS_CURRENT',backendMotionEligible:true};
  for(let i=0;i<10;i++)diagnostic.recordMovementTrace('hybrid',p);
  diagnostic.recordMovementTrace('hybrid',{...p,id:'UNSELECTED'});diagnostic.recordMovementTrace('hybrid',{...p,timestamp:p.timestamp+30000});
  const logs=f.diagnostics.filter(e=>e[0]==='[R28Motion]');assert.equal(logs.length,dev&&enabled?2:0);
  if(logs.length){assert.equal(logs[0][1].physicalAt,p.timestamp);assert.equal(logs[1][1].physicalAt,p.timestamp+30000);}
  if(dev&&enabled){for(let i=2;i<202;i++)diagnostic.recordMovementTrace('hybrid',{...p,timestamp:p.timestamp+i*30000});assert.equal(globalThis.__nopontoMovementTrace.length,120);assert.ok(globalThis.__nopontoMovementTrace.every(e=>e.order==='D86089'));}
 }finally{f.dispose();}
});

test('popup labels displacement speed as estimated while preserving the original zero observation',()=>{
 const f=fixture({presence:false});try{
  const web=webViewRuntime(f.load('../components/mapOSM/webview/mapScript.ts').buildMapWebViewScript({latInicial:0,lngInicial:0,estilosJS:'',filtrosMapaJS:'',estiloMapaPadrao:'fixture'}),f.clock);
  const p={id:'D86089',timestamp:f.clock.now,backendUnified:true,velocidade:0,lastObservedSpeedKmh:0,speedObservedAt:f.clock.now,estimatedSpeedKmh:12,projectionSpeedKind:'displacement'};
  const html=web.context.buildPopup({nome:'838'},p,p.id,0);assert.match(html,/12 km\/h/);assert.match(html,/Velocidade estimada/);assert.equal(p.lastObservedSpeedKmh,0);
 }finally{f.dispose();}
});

test('empty rail feed schedules no frames and clears the last train only once',()=>{
 const f=fixture({presence:false});try{
 const web=f.load('../components/mapOSM/webview/mapScript.ts');const runtime=webViewRuntime(web.buildMapWebViewScript({latInicial:0,lngInicial:0,estilosJS:'',filtrosMapaJS:'',estiloMapaPadrao:'fixture'}));
 runtime.context.map.addSource('rail-vehicles');runtime.run('startRailAnimation();setRailRuns([]);updateRailVehicles(Date.now())');
 assert.equal(runtime.frames.size,0);assert.equal(runtime.writes(),0);
 runtime.run('setRailRuns([{idVisual:"train",geometry:{coordinates:[[0,0],[.01,0]]},state:"InSegment",distanceAtReferenceMetres:0,targetDistanceMetres:500,referenceTimeUtc:new Date(Date.now()-1000).toISOString(),targetTimeUtc:new Date(Date.now()+60000).toISOString(),freshUntilUtc:new Date(Date.now()+120000).toISOString()}])');
 assert.equal(runtime.frames.size,1);runtime.run('updateRailVehicles(Date.now())');const marker=runtime.context.railMarkers.train;assert.ok(marker);assert.equal(runtime.writes(),1);
 runtime.run('updateRailVehicles(Date.now()+10000)');assert.equal(runtime.context.railMarkers.train,marker);assert.ok(marker.coords[0]>0);
 runtime.run('setRailRuns([])');assert.equal(runtime.frames.size,0);assert.ok(runtime.removed.includes(marker));const cleared=runtime.writes();assert.equal(cleared,3);
 runtime.run('setRailRuns([]);startRailAnimation();updateRailVehicles(Date.now())');assert.equal(runtime.writes(),cleared);assert.equal(runtime.frames.size,0);
 }finally{f.dispose();}
});

test('public popup replaces provisional origin wording without promoting or mutating terminal evidence',()=>{const f=fixture({presence:false});try{const web=webViewRuntime(f.load('../components/mapOSM/webview/mapScript.ts').buildMapWebViewScript({latInicial:0,lngInicial:0,estilosJS:'',filtrosMapaJS:'',estiloMapaPadrao:'fixture'}),f.clock);const p={id:'bus',timestamp:f.clock.now,backendUnified:true,presencaRotulo:'Na região da origem',vehicleState:'Na região da origem'};const html=web.context.buildPopup({nome:'838'},p,p.id,0);assert.match(html,/Localização aproximada/);assert.doesNotMatch(html,/Na região da origem|No terminal/);assert.equal(p.presencaRotulo,'Na região da origem');}finally{f.dispose();}});

test('gateway switch preserves listeners and restores owned lines without duplicate subscriptions', async () => {
  const f = fixture(); let updates = 0;
  f.service.iniciarGpsHub(() => updates++);
  const owner = Symbol('gateway-test');
  await f.service.atualizarInscricoesGps(owner, ['006', '010']);
  f.calls.length = 0;
  f.switchGateway(); await f.flush();
  assert.equal(f.hub.baseUrl, 'https://reserve.test/hub/gps');
  assert.equal(f.hub.state, 'Connected');
  assert.deepEqual(f.calls.filter(x => x[0] === 'InscreverseLinha').map(x => x[1]).sort(), ['006', '010']);
  f.emit('PosicaoAtualizada', [f.raw()]); assert.equal(updates, 1);
  f.dispose();
});
test('intentional GPS stop without owners does not report gateway failure', async () => {
  const f = fixture(); const owner = Symbol('intentional-stop');
  f.service.iniciarGpsHub(() => {});
  await f.service.atualizarInscricoesGps(owner, ['006']);
  await f.service.atualizarInscricoesGps(owner, []); await f.flush();
  assert.equal(f.hub.state, 'Disconnected'); assert.equal(f.gatewayFailures(), 0);
  f.dispose();
});
