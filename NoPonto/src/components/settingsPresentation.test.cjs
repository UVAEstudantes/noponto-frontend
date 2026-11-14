/* global __dirname */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');

function hooks() {
  const slots = []; let cursor = 0, effects = [];
  const same = (a,b) => a && b && a.length === b.length && a.every((v,i) => Object.is(v,b[i]));
  const react = {...React,
    forwardRef: fn => fn,
    useState(initial) {const i=cursor++; if (!(i in slots)) slots[i]=initial; return [slots[i],v => {slots[i]=typeof v==='function'?v(slots[i]):v;}];},
    useRef(initial) {const i=cursor++; return slots[i] ??= {current:initial};},
    useMemo(fn,deps) {const i=cursor++; if (!same(slots[i]?.deps,deps)) slots[i]={deps,value:fn()}; return slots[i].value;},
    useCallback(fn,deps) {return react.useMemo(() => fn,deps);},
    useEffect(fn,deps) {const i=cursor++; if (!same(slots[i]?.deps,deps)) {const old=slots[i]; slots[i]={deps}; effects.push(() => {old?.cleanup?.(); slots[i].cleanup=fn();});}},
    useImperativeHandle() {}, useSyncExternalStore: (_,snapshot) => snapshot(),
  };
  return {react, render(fn) {cursor=0; const tree=fn(); const pending=effects; effects=[]; pending.forEach(fn=>fn()); return tree;}};
}
function load(relative, mocks) {
  const filename=path.resolve(__dirname,relative), m=new Module(filename,module);
  m.require=id => {assert.ok(id in mocks,id); return mocks[id];};
  m._compile('const __DEV__ = false;\n'+ts.transpileModule(fs.readFileSync(filename,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText, filename);
  return m.exports;
}
function nodes(tree,type) {
  if(!tree || typeof tree!=='object')return [];
  return [...(tree.type===type?[tree]:[]), ...React.Children.toArray(tree.props?.children).flatMap(child=>nodes(child,type))];
}
const palette={textoSecundario:'#888',textoPrimario:'#123',fundoCard:'#fff',iconeSecundario:'#777'};

test('GitHub footer opens supplied external URL and preserves compact themed connection labels', async () => {
  for(const color of ['#888','#bbb']) for(const state of [{status:'online',active:0},{status:'online',active:1},{status:'offline',active:0}]) {
    const opened=[],h=hooks();
    const {GatewayFooter}=load('./GatewayStatus.tsx',{
      react:h.react,'react-native':{View:'View',Text:'Text',Pressable:'Pressable',Linking:{openURL:async url=>opened.push(url)},Alert:{alert:assert.fail}},
      'react-native-svg':{__esModule:true,default:'Svg',Path:'Path'},'@expo/vector-icons':{Ionicons:'Icon'},
      './HealthToast':{},'../services/gateway':{gateway:{subscribe(){},snapshot:()=>state}},'../hooks/useTema':{useTema:()=>({cores:{...palette,textoSecundario:color}})},
    });
    const tree=h.render(()=>GatewayFooter()),link=nodes(tree,'Pressable')[0];
    assert.equal(link.props.accessibilityRole,'link'); await link.props.onPress();
    assert.deepEqual(opened,['https://github.com/UVAEstudantes']);
    const svg=nodes(tree,'Svg')[0]; assert.equal(svg.props.width,24); assert.equal(svg.props.fill,color);
    assert.equal(tree.props.style.paddingBottom,0);
    const copy=nodes(tree,'Text').map(n=>React.Children.toArray(n.props.children).join('')).join(' ');
    assert.match(copy,/NoPonto™ · Beta \(Em Desenvolvimento\)/);
    assert.ok(copy.includes(state.status==='offline'?'Indisponível':state.active===0?'zrok · Principal':'ngrok · Reserva'));
  }
});

test('tutorial starts collapsed and replay actions preserve progress through repeated expansion', () => {
  const h=hooks(), calls=[], progress={seen:true,chapters:[1,5],radarSections:['5A']};
  const icons=Object.fromEntries(['BookOpen','Bell','ChevronDown','ChevronUp','ArrowRight','Check','Hand','Map','Monitor','Moon','Palette','Radar','Sun','Volume2'].map(x=>[x,x]));
  const {default:Settings}=load('../../app/configuracao.tsx',{
    react:h.react,'react-native':{View:'View',Text:'Text',Pressable:'Pressable',ScrollView:'ScrollView',Switch:'Switch'},
    '../src/components/GatewayStatus':{GatewayFooter:'Footer'},'@/src/components/tutorial/TutorialProvider':{useTutorial:()=>({progress,replay:(...a)=>calls.push(a)})},
    '@/src/constants/estilosMapa':{estilosMapaDisponiveis:[]},'@/src/hooks/useTema':{useTema:()=>({cores:palette,temaAtual:'claro'})},
    'lucide-react-native':icons,'react-native-safe-area-context':{SafeAreaView:'SafeArea'},'@/src/components/indicadoresConfiguracao':{__esModule:true,default:'Indicators'},
  });
  const render=()=>h.render(()=>Settings());
  const toggle=tree=>nodes(tree,'Pressable').find(n=>n.props.accessibilityLabel==='Primeiros passos, etapas do tutorial');
  let tree=render(); assert.equal(toggle(tree).props.accessibilityState.expanded,false);
  const before=nodes(tree,'Pressable').length;
  const full=nodes(tree,'Pressable').find(n=>nodes(n,'Text').some(t=>t.props.children==='Assistir tutorial completo'));
  full.props.onPress(); assert.deepEqual(calls,[[]]); assert.equal(toggle(tree).props.accessibilityState.expanded,false);
  toggle(tree).props.onPress(); tree=render();
  assert.equal(toggle(tree).props.accessibilityState.expanded,true);
  assert.equal(nodes(tree,'ChevronUp').length,1);
  assert.equal(nodes(tree,'Pressable').length,before+9);
  const buttons=nodes(tree,'Pressable');
  const named=title=>buttons.find(n=>nodes(n,'Text').some(t=>t.props.children===title));
  named('Buscar e visualizar linhas').props.onPress();
  buttons.find(n=>n.props.accessibilityLabel==='Tutorial: Voz').props.onPress();
  assert.deepEqual(calls,[[],[1],[5,'5C']]);
  const texts=nodes(tree,'Text').map(n=>String(n.props.children)).join(' ');
  assert.doesNotMatch(texts,/Concluído|concluídos|✓/);
  toggle(tree).props.onPress();tree=render();assert.equal(nodes(tree,'Pressable').length,before);
  toggle(tree).props.onPress();tree=render();assert.equal(nodes(tree,'Pressable').length,before+9);
  assert.deepEqual(progress,{seen:true,chapters:[1,5],radarSections:['5A']});
  full.props.onPress(); assert.equal(toggle(tree).props.accessibilityState.expanded,true);
});

test('direction preference bridge changes without remounting WebView or republishing positions', () => {
  const h=hooks(),injected=[],preferences={global:true,estiloGlobal:'padrao',individuais:{},mostrarDirecao:true};
  const lines=[], snapshots=[],calls={html:0,composition:0};
  const mocks={react:h.react,'react-native':{View:'View'},'react-native-webview':{WebView:'WebView'},
    '../tutorial/tutorialMapContract':{},'@/src/constants/estilosMapa':{ESTILO_MAPA_PADRAO:'normal',estilosMapaDisponiveis:[]},
    './webview/mapHtml':{buildMapHtml:()=>{calls.html++;return 'stable-map';}},
    '@/src/services/unifiedLocation':{useUnifiedLocation:()=>({snapshots,now:0})},
    '@/src/services/hybridContext':{createHybridComposer:()=>value=>{calls.composition++;return value;}},
    '@/src/services/gpsPresentationPolicy':{GPS_POLICY:{contextMs:180000,publicMs:480000}},
    '@/src/services/veiculosMapa':{adaptarRailParaMapa:x=>x},'@/src/context/ProvedorIndicadores':{useIndicadores:()=>({preferencias:preferences})},
    '@/src/constants/indicadores':{estilosEfetivos:()=>({onibus:'padrao',brt:'padrao',trem:'padrao'})},
    '@/src/services/roadPresenceDiagnostics':{traceRoadNativePayload(){},roadPresenceWebViewProbe(){return '';},traceRoadWebViewResult(){}},
  };
  const {default:Map}=load('./mapOSM/mapOSM.tsx',mocks);
  const render=()=>h.render(()=>Map({linhasParaMostrar:lines},null));
  let tree=render(),web=nodes(tree,'WebView')[0];
  web.props.ref.current={injectJavaScript:script=>injected.push(script)};
  const source=web.props.source;
  web.props.onMessage({nativeEvent:{data:'map_ready'}});render();
  assert.ok(injected.some(x=>x.includes('updateVehicleDirections(true)')));
  injected.length=0; const compositions=calls.composition;
  preferences.mostrarDirecao=false;tree=render();
  assert.strictEqual(nodes(tree,'WebView')[0].props.source,source);
  assert.equal(calls.html,1); assert.equal(calls.composition,compositions);
  assert.deepEqual(injected,['if(window.updateVehicleDirections) window.updateVehicleDirections(false);']);
  preferences.mostrarDirecao=true;render();
  assert.equal(injected.at(-1),'if(window.updateVehicleDirections) window.updateVehicleDirections(true);');
});


test('direction switch updates existing provider preference without changing indicator selection', () => {
  const h=hooks(),changes=[],preferences={mostrarDirecao:true,global:true,estiloGlobal:'padrao',individuais:{}};
  const {default:Indicators}=load('./indicadoresConfiguracao.tsx',{
    react:h.react,'react-native':{View:'View',Text:'Text',Pressable:'Pressable',Switch:'Switch'},
    'lucide-react-native':{Check:'Check',ChevronDown:'Down',ChevronUp:'Up',MapPin:'Pin'},'react-native-svg':{SvgXml:'SVG'},
    '../hooks/useTema':{useTema:()=>({cores:palette})},
    '../context/ProvedorIndicadores':{useIndicadores:()=>({preferencias:preferences,carregando:false,atualizar:value=>changes.push(value)})},
    '../constants/indicadores':{estilosIndicadores:[],familiasIndicadores:{},modaisIndicadores:[]},'../services/apresentacaoIndicadores':{},
  });
  const tree=h.render(()=>Indicators()),toggle=nodes(tree,'Switch')[0];
  assert.equal(toggle.props.accessibilityLabel,'Mostrar direção dos veículos');
  assert.equal(toggle.props.value,true);toggle.props.onValueChange(false);
  assert.deepEqual(changes,[{mostrarDirecao:false}]);
  assert.equal(preferences.estiloGlobal,'padrao');
});
