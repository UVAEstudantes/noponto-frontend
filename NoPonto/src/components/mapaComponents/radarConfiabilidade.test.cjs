const assert = require("node:assert/strict");
const test = require("node:test");
const { criarHarness } = require("../../hooks/radarTestHarness.cjs");
const { temas } = require("../../constants/tema.ts");

function nodes(value) {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== "object") return [];
  return [value, ...nodes(value.props?.children)];
}
function texto(value) {
  if (Array.isArray(value)) return value.map(texto).join("");
  if (value == null || typeof value === "boolean") return "";
  if (typeof value !== "object") return String(value);
  return texto(value.props?.children);
}
function ui(h) {
  const pan = {};
  for (const key of ["activeOffsetY", "onStart", "onUpdate", "onEnd"]) pan[key] = () => pan;
  const mocks = {
    "react-native": { View: "View", Text: "Text", Pressable: "Pressable", ScrollView: "ScrollView", Modal: "Modal",
      Platform: { OS: "android" }, StyleSheet: { absoluteFillObject: {} },
      Dimensions: { get: () => ({ height: 800, width: 400 }) },
      useWindowDimensions: () => ({ height: 800, width: 400 }) },
    "lucide-react-native": Object.fromEntries(["BusFront", "ChevronDown", "ChevronRight", "ChevronLeft", "ChevronUp",
      "Clock3", "Map", "MapPin", "RefreshCw", "TrainFront", "X", "Check"].map((id) => [id, id])),
    "react-native-gesture-handler": { GestureDetector: "GestureDetector", Gesture: { Pan: () => pan } },
    "react-native-reanimated": { __esModule: true, default: { View: "Animated.View" },
      Easing: { out: (value) => value, cubic: "cubic" }, runOnJS: (fn) => fn,
      useSharedValue: (value) => h.react.useRef({ value }).current,
      useAnimatedStyle: (fn) => fn(), withTiming: (value) => value },
    "react-native-safe-area-context": { useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) },
    "@/src/hooks/useTema": { useTema: () => ({ cores: temas.claro.cores, temaAtual: "claro" }) },
    "@/src/constants/modaisMapa": { identidadeModalMapa: () => ({ Icon: "Bus", cor: "#123456" }) },
    "expo-blur": { BlurView: "BlurView" },
  };
  mocks["./radarVehicleCardView"]=h.carregar("../components/mapaComponents/radarVehicleCardView.tsx",mocks);
  mocks["./previaNotificacaoRadarSection"]=h.carregar("../components/mapaComponents/previaNotificacaoRadarSection.tsx",mocks);
  return { ...mocks, "./physicalPresenceSection":
    h.carregar("../components/mapaComponents/physicalPresenceSection.tsx", mocks),
    "./terminalPresenceSection":h.carregar("../components/mapaComponents/terminalPresenceSection.tsx",mocks) };
}
const vazio = "Nenhum próximo veículo previsto nesta seleção.";

test('Radar encaminha previa N3-A somente em desenvolvimento', () => {
  const anterior = global.__DEV__;
  try {
    for (const dev of [true, false]) {
      global.__DEV__ = dev;
      const h = criarHarness(), mocks = ui(h);
      const Section = mocks['./previaNotificacaoRadarSection'].default;
      const Component = h.carregar('../components/mapaComponents/radarParada.tsx', mocks).default;
      const previa = { contexto: { paradaId: 'A' }, candidatos: [],
        conteudo: { chaveContexto: 'A', destaque: null, prioridades: [], alternativas: [] } };
      const radar = { eventos: [], parada: null, metadados: {}, contextoConsulta: 'A',
        statusConsulta: 'sucesso', carregando: false, atualizadoEm: h.now, agora: h.now,
        recebidoEm: h.now, consultaConcluida: true, candidatos: [], previaNotificacao: previa,
        atualizar() {}, selecionar() {}, selecaoAutomatica() {}, carregarMetadados() {} };
      const render = () => h.render(() => Component({ radar, linhas: [], modal: 'onibus',
        lateralidade: 'destro', visivel: true, viewportHeight: 800, onControlsBottomChange() {},
        onVerTodos() {}, onEvento() {}, localizavel: () => false }));
      render();
      const sections = () => nodes(h.output).filter(n => n.type === Section);
      assert.equal(sections().length, dev ? 1 : 0);
      if (dev) {
        assert.equal(sections()[0].props.previa, previa);
        radar.previaNotificacao = null;
        render();
        assert.equal(sections()[0].props.previa, null);
      }
      h.unmount();
    }
  } finally {
    if (anterior === undefined) delete global.__DEV__;
    else global.__DEV__ = anterior;
  }
});

test('radar closes on first press and incoming updates cannot reopen its touch overlay',()=>{
 const h=criarHarness();const Component=h.carregar('../components/mapaComponents/radarParada.tsx',ui(h)).default;
 const radar={eventos:[],parada:null,metadados:{},contextoConsulta:'same',statusConsulta:'sucesso',carregando:false,atualizadoEm:h.now,agora:h.now,recebidoEm:h.now,consultaConcluida:true,candidatos:[],atualizar(){},selecionar(){},selecaoAutomatica(){},carregarMetadados(){}};
 const render=()=>h.render(()=>Component({radar,linhas:[],modal:'onibus',lateralidade:'destro',visivel:true,viewportHeight:800,onControlsBottomChange(){},onVerTodos(){},onEvento(){},localizavel:()=>false}));
 render();const close=nodes(h.output).find(n=>n.type==='Pressable'&&/Recolher/.test(n.props.accessibilityLabel??''));
 assert.ok(close);close.props.onPress();render();
 const panel=()=>nodes(h.output).find(n=>n.type==='Animated.View'&&n.props.importantForAccessibility);
 assert.equal(panel().props.pointerEvents,'none');
 for(let i=1;i<=10;i++){radar.recebidoEm+=1000;radar.eventos=[{eventId:'event'+i,eventType:'ARRIVAL',linhaId:'line',codigo:'855',etaSeg:60}];render();assert.equal(panel().props.pointerEvents,'none');}
 const open=nodes(h.output).find(n=>n.type==='Pressable'&&/Abrir painel/.test(n.props.accessibilityLabel??''));open.props.onPress();render();assert.equal(panel().props.pointerEvents,'auto');h.unmount();
});

test('stop sheet closes on first touch during updates and hidden overlays release touches',()=>{
 const {h,render}=sheet();let closed=0;
 const close=()=>closed++;
 render({onFechar:close});
 const backdrop=nodes(h.output).find(n=>n.type==='Pressable'&&n.props.style?.flex===1);
 assert.ok(backdrop);backdrop.props.onPress();assert.equal(closed,1);
 for(let i=0;i<10;i++){render({visivel:false,chegadas:[{...chegada,id:'event'+i}],atualizadoEm:h.now+i*1000});
 const overlays=nodes(h.output).filter(n=>n.type==='Animated.View'&&n.props.pointerEvents);assert.ok(overlays.length>=2);assert.ok(overlays.every(n=>n.props.pointerEvents==='none'));}
 h.unmount();
});
const chegada = { id: "evento", linhaId: "linha", codigo: "084", cor: "#123456",
  eventType: "ARRIVAL", nextVehiclesMode: "Arrivals", referenciaDisponivel: true,
  qualidade: "Ao vivo", etaSeg: 120, horarioPrevistoLocal: "12:02", destino: "Destino", distanciaMetros: null };
function sheet() {
  const h = criarHarness();
  const Component = h.carregar("../components/mapaComponents/paradaSheet.tsx", ui(h)).default;
  let props = { visivel: true, parada: { paradaId: "A", nome: "Parada A" }, linhas: [], chegadas: [],
    statusConsulta: "carregando", carregandoChegadas: true, expandido: true,
    onToggleExpandir() {}, onFechar() {}, onAtualizar() {} };
  return { h, render(changes = {}) { props = { ...props, ...changes }; return h.render(() => Component(props)); } };
}

test("sheet não mostra vazio na primeira carga e confirma vazio somente após sucesso", () => {
  const { h, render } = sheet();
  assert.match(texto(render()), /Consultando próximos veículos/);
  assert.equal(texto(h.output).includes(vazio), false);
  assert.equal(texto(render({ statusConsulta: "sucesso", carregandoChegadas: false, atualizadoEm: h.now })).includes(vazio), true);
  h.unmount();
});

test("sheet permite retry no erro e mantém cards durante atualização e falha", () => {
  const { h, render } = sheet();
  let retries = 0;
  render({ statusConsulta: "erro", carregandoChegadas: false, erroChegadas: "offline", onAtualizar: () => retries++ });
  assert.equal(texto(h.output).includes(vazio), false);
  const retry = nodes(h.output).find((n) => n.type === "Pressable" && texto(n).includes("Tentar novamente"));
  assert.equal(retry.props.disabled, false);
  retry.props.onPress(); assert.equal(retries, 1);
  render({ statusConsulta: "atualizando", carregandoChegadas: true, erroChegadas: null,
    chegadas: [chegada], atualizadoEm: h.now });
  assert.match(texto(h.output), /084/);
  assert.match(texto(h.output), /Atualizando/);
  render({ statusConsulta: "erro", carregandoChegadas: false, erroChegadas: "offline" });
  assert.match(texto(h.output), /084/);
  assert.match(texto(h.output), /Exibindo dados da consulta anterior/);
  assert.equal(texto(h.output).includes(vazio), false);
  h.unmount();
});

test("sheet mantém título e oferece recuperação explícita ao perder contexto", () => {
  const { h, render } = sheet();
  let recuperacoes = 0;
  render({ statusConsulta: "indisponivel", contextoIndisponivel: true, carregandoChegadas: false,
    onRecuperarContexto: () => recuperacoes++ });
  assert.match(texto(h.output), /Parada A/);
  assert.match(texto(h.output), /não está disponível nas linhas, sentidos ou modal/);
  assert.equal(texto(h.output).includes(vazio), false);
  const recuperar = nodes(h.output).find((n) => n.type === "Pressable" && texto(n).includes("Voltar à seleção automática"));
  recuperar.props.onPress(); assert.equal(recuperacoes, 1);
  h.unmount();
});

test("compacto distingue consulta carregando sucesso e erro e oferece atualização", () => {
  const h = criarHarness();
  const Component = h.carregar("../components/mapaComponents/radarParada.tsx", ui(h)).default;
  let atualizacoes = 0;
  const radar = { eventos: [], parada: null, metadados: {}, contextoConsulta: "chave",
    statusConsulta: "carregando", carregando: true, atualizadoEm: null, agora: h.now,
    recebidoEm: h.now, consultaConcluida: false, atualizar: () => atualizacoes++, candidatos: [],
    selecionar() {}, selecaoAutomatica() {}, carregarMetadados() {} };
  const render = () => h.render(() => Component({ radar, linhas: [], modal: "brt", lateralidade: "destro",
    visivel: true, viewportHeight: 800, onControlsBottomChange() {}, onVerTodos() {}, onEvento() {}, localizavel: () => false }));
  const ponto = () => nodes(h.output).find((n) => n.type === "View" && n.props.style?.width === 7);
  render(); assert.equal(ponto().props.style.backgroundColor, temas.claro.cores.textoSecundario);
  const botao = () => nodes(h.output).find((n) => n.type === "Pressable" && /Atualizar próximos|Tentar atualizar/.test(n.props.accessibilityLabel ?? ""));
  assert.equal(botao().props.disabled, true);
  Object.assign(radar, { statusConsulta: "sucesso", carregando: false, atualizadoEm: h.now });
  render(); assert.equal(ponto().props.style.backgroundColor, temas.claro.cores.sucesso);
  assert.match(texto(h.output), /Última consulta às/);
  botao().props.onPress(); assert.equal(atualizacoes, 1);
  Object.assign(radar, { statusConsulta: "erro", erro: "offline" });
  render(); assert.equal(ponto().props.style.backgroundColor, temas.claro.cores.perigo);
  assert.match(texto(h.output), /Falha ao atualizar/);
  botao().props.onPress(); assert.equal(atualizacoes, 2);
  h.unmount();
});

const physicalFixture = (now) => ({ key:'physical',modal:'onibus',provider:'ZIRIX',originalVehicleId:'A12345',latitude:0,longitude:0,
  physicalAt:new Date(now).toISOString(),speedKmh:0,lineId:'line-x',serviceCode:'838',lineState:'Informed',lineValidatedAt:new Date(now).toISOString(),location:'UncertainLocation',facilityStopId:'5144O00424T9' });
const terminalFixture=(now,stop='served-stop')=>({key:'terminal-bus',order:'D86286',lineId:'line-x',code:'855',physicalAt:now,validUntil:now+480001,terminalId:'terminal',terminalName:'Terminal A',state:'No terminal',knownPattern:null,operationalConfirmed:false,corridors:[{pattern:'out',originId:'terminal',originName:'Terminal A',stops:[{id:stop,rank:1,metres:300}],coords:[[0,0],[0,.01]]}]});

test('radar remains first-touch responsive with 50 terminal vehicles and ongoing physical updates',async()=>{
 const {geometryWork}=require('../../services/hybridGps.ts');
 const h=criarHarness(),Component=h.carregar('../components/mapaComponents/radarParada.tsx',ui(h)).default;
 let presence=Array.from({length:50},(_,i)=>({...terminalFixture(h.now),key:'bus'+i,order:'D'+i}));
 const radar={eventos:[],parada:{parada:{paradaId:'served-stop',nome:'Primeira'},vinculos:[{linhaId:'line-x',padraoVersaoId:'out'}]},metadados:{},contextoConsulta:'served',statusConsulta:'sucesso',carregando:false,atualizadoEm:h.now,agora:h.now,recebidoEm:h.now,consultaConcluida:true,candidatos:[],atualizar(){},selecionar(){},selecaoAutomatica(){},carregarMetadados(){}};
 const render=()=>h.render(()=>Component({radar,terminalPresence:presence,linhas:[],modal:'onibus',lateralidade:'destro',visivel:true,viewportHeight:800,onControlsBottomChange(){},onVerTodos(){},onEvento(){},localizavel:()=>false}));
 const panel=()=>nodes(h.output).find(n=>n.type==='Animated.View'&&n.props.importantForAccessibility);
 const button=label=>nodes(h.output).find(n=>n.type==='Pressable'&&n.props.accessibilityLabel?.startsWith(label));
 const work=geometryWork.projections;render();assert.match(texto(h.output),/Em espera/);assert.equal(nodes(h.output).filter(n=>n.props?.accessibilityLabel==='Localizar linha 855 no mapa').length,2);
 button('Recolher painel').props.onPress();render();assert.equal(panel().props.pointerEvents,'none');
 for(let i=0;i<3;i++){
  await h.avancar(20000);Object.assign(radar,{agora:h.now,atualizadoEm:h.now,recebidoEm:h.now});
  presence=presence.map(v=>({...v,physicalAt:h.now}));render();assert.equal(panel().props.pointerEvents,'none');
 }
 button('Abrir painel').props.onPress();render();assert.equal(panel().props.pointerEvents,'auto');
 radar.eventos=[{eventId:'arrival',linhaId:'line-x',codigoVeiculo:'D0',eventType:'ARRIVAL',codigoLinha:'855',secondsUntilEvent:100}];render();
 assert.equal(nodes(h.output).some(n=>n.type==='Text'&&texto(n)==='855 · D0'),false);
 assert.equal(geometryWork.projections,work);h.unmount();
});
test('physical-only radar stays accessible after two empty arrival polls', () => {
 const h=criarHarness();const Component=h.carregar('../components/mapaComponents/radarParada.tsx',ui(h)).default;
 const radar={eventos:[],parada:{parada:{paradaId:'served-stop',nome:'Outra parada'},vinculos:[{linhaId:'line-x'}]},metadados:{},contextoConsulta:'served',
  statusConsulta:'sucesso',carregando:false,atualizadoEm:h.now,agora:h.now,recebidoEm:h.now,consultaConcluida:true,candidatos:[],atualizar(){},selecionar(){},selecaoAutomatica(){},carregarMetadados(){}};
 const render=()=>h.render(()=>Component({radar,linhas:[],modal:'onibus',lateralidade:'destro',visivel:true,viewportHeight:800,onControlsBottomChange(){},onVerTodos(){},onEvento(){},localizavel:()=>false,terminalPresence:[terminalFixture(h.now)]}));
 render();radar.atualizadoEm++;render();
 const panel=nodes(h.output).find(n=>n.type==='Animated.View');assert.equal(panel.props.pointerEvents,'auto');h.unmount();
});
test('expanded stop sheet exposes physical vehicles separately from arrivals', () => {
 const {h,render}=sheet();const output=render({statusConsulta:'sucesso',carregandoChegadas:false,
  linhas:[{linhaId:'line-x',codigo:'838',nomeExibicao:'838',ativa:true,cor:'#123456'}],physicalModal:'onibus',terminalPresence:[terminalFixture(h.now,'A')]});
 assert.match(texto(output),/Em espera/);assert.doesNotMatch(texto(output),/Partida não confirmada|Atendimento à parada não confirmado/);
 assert.doesNotMatch(texto(output),/Nenhum próximo veículo previsto/);h.unmount();
});

test('stop sheet keeps GPS estimate separate expires old speed and replaces a placeholder only with a valid arrival',async()=>{
 const {h,render}=sheet();
 const presence={...terminalFixture(h.now,'A'),state:'A caminho',knownPattern:'out',contextAt:h.now,progressMetres:100,speedKmh:20,speedAt:h.now,historySpeedKmh:18};
 const placeholder={...chegada,linhaId:'line-x',ordem:'D86286',codigo:'855',etaSeg:null,horarioPrevistoLocal:null,referenciaDisponivel:true,padraoVersaoId:'out',paradaId:'A'};
 const props={statusConsulta:'sucesso',carregandoChegadas:false,linhas:[{linhaId:'line-x',codigo:'855',nomeExibicao:'855',ativa:true,cor:'#123456'}],physicalModal:'onibus',terminalPresence:[presence],chegadas:[placeholder]};
 render(props);assert.match(texto(h.output),/Chega em 1–3 minEstimativa GPS/);
 assert.equal(nodes(h.output).filter(n=>n.type==='Pressable'&&n.props.accessibilityLabel==='Detalhes da linha 855').length,1);
 assert.doesNotMatch(texto(h.output),/Chega em --/);
 await h.avancar(60001);render(props);assert.match(texto(h.output),/A caminho/);assert.doesNotMatch(texto(h.output),/Estimativa GPS/);
 render({...props,chegadas:[{...placeholder,etaSeg:120}]});assert.doesNotMatch(texto(h.output),/Ônibus na origem e a caminho/);assert.match(texto(h.output),/2m 00s/);
 h.unmount();
});
test('origin radar cards precede operational arrivals reuse the line badge and locate only a valid physical position',()=>{
 const h=criarHarness(),Component=h.carregar('../components/mapaComponents/radarParada.tsx',ui(h)).default;
 const vehicle={...terminalFixture(h.now),latitude:-22.9,longitude:-43.6,state:'Saindo do terminal',directionName:'Campo Grande',knownPattern:'out',progressMetres:100};
 const radar={eventos:[{eventId:'arrival',linhaId:'line-x',codigoVeiculo:'OTHER',codigoLinha:'855',eventType:'ARRIVAL',secondsUntilEvent:120}],parada:{parada:{paradaId:'served-stop',nome:'Primeira'},vinculos:[{linhaId:'line-x',padraoVersaoId:'out'}]},metadados:{},contextoConsulta:'served',statusConsulta:'sucesso',carregando:false,atualizadoEm:h.now,agora:h.now,recebidoEm:h.now,consultaConcluida:true,candidatos:[],atualizar(){},selecionar(){},selecaoAutomatica(){},carregarMetadados(){}};
 const focused=[];let presence=[vehicle];
 const render=()=>h.render(()=>Component({radar,terminalPresence:presence,onTerminalVehicle:v=>focused.push(v),linhas:[],modal:'onibus',lateralidade:'destro',visivel:true,viewportHeight:800,onControlsBottomChange(){},onVerTodos(){},onEvento(){},localizavel:()=>true}));
 render();assert.ok(texto(h.output).indexOf('Saindo')<texto(h.output).indexOf('Chega em 2 min'));
 assert.ok(nodes(h.output).some(n=>n.type==='Text'&&texto(n)==='855'));
 const button=()=>nodes(h.output).find(n=>n.type==='Pressable'&&n.props.accessibilityLabel==='Localizar linha 855 no mapa');
 assert.equal(button().props.disabled,false);button().props.onPress();assert.equal(focused[0].key,vehicle.key);assert.equal(focused[0].latitude,vehicle.latitude);assert.equal(focused[0].physicalAt,vehicle.physicalAt);
 assert.match(texto(h.output),/Campo Grande/);assert.match(texto(h.output),/Saindo/);
 presence=[{...vehicle,latitude:undefined}];render();assert.equal(button().props.disabled,true);button().props.onPress();assert.equal(focused.length,1);
 h.unmount();
});


test("stop sheet restricts terminal corridors and applies 180 300 480 second visual rules", () => {
  const { h, render } = sheet();
  const parked = terminalFixture(h.now,'A');
  const props = { statusConsulta: "sucesso", carregandoChegadas: false,chegadas:[],
    linhas: [{ linhaId: "line-x", codigo: "838", nomeExibicao: "838", ativa: true, cor: "#123456" }],
    physicalModal: "onibus", terminalPresence: [parked] };
  for (const change of [
    { chegadas:[{...chegada,linhaId:parked.lineId,ordem:parked.order,referenciaDisponivel:true}] },
    { terminalPresence: [{ ...parked, corridors:[] }] },
    { terminalPresence: [{ ...parked, lineId: "other-line" }] },
    { terminalPresence: [],physicalVehicles:[physicalFixture(h.now)] },
    { physicalModal: "brt" }, { contextoIndisponivel: true },
    { linhas: [{ ...props.linhas[0], ativa: false }] },
  ]) {
    assert.doesNotMatch(texto(render({ ...props, contextoIndisponivel: false, ...change })), /Ônibus na origem e a caminho/);
  }
  for (const seconds of [60,120,179,180,299,300,301,480,600]) {
    const output=render({...props,contextoIndisponivel:false,terminalPresence:[{...parked,physicalAt:h.now-seconds*1000}]});
    const row=nodes(output).find(n=>n.type==='Pressable'&&n.props.accessibilityLabel==='Detalhes da linha 855');
    assert.equal(!!row,seconds<=300);assert.equal(texto(output).includes('GPS atrasado'),seconds>=180&&seconds<=300);
    if(row)assert.equal(row.props.style.opacity,seconds>=180?.65:1);
    assert.doesNotMatch(texto(output),/Partida não confirmada|Atendimento à parada não confirmado|GPS há/);
  }
  h.unmount();
});

test('physical and operational radar cards share exact frame spacing and typography tokens',()=>{
 const {h,render}=sheet();
 render({statusConsulta:'sucesso',carregandoChegadas:false,physicalModal:'onibus',linhas:[{linhaId:'line-x',codigo:'855',ativa:true,cor:'#123456'}],terminalPresence:[terminalFixture(h.now,'A')],chegadas:[{...chegada,linhaId:'line-x',ordem:'OTHER'}]});
 const physical=nodes(h.output).find(n=>n.type==='Pressable'&&n.props.accessibilityLabel?.startsWith('Detalhes da linha 855'));
 const operational=nodes(h.output).find(n=>n.type==='Pressable'&&n.props.style?.borderRadius===12&&n.props.style?.paddingVertical===10&&n!==physical);
 for(const property of ['paddingVertical','paddingHorizontal','borderRadius','backgroundColor','borderColor'])assert.equal(physical.props.style[property],operational.props.style[property],property);
 const heading=nodes(physical).find(n=>n.type==='Text'&&texto(n)==='855'),operationalHeading=nodes(operational).find(n=>n.type==='Text'&&texto(n)==='084');
 assert.equal(heading.props.style.fontSize,operationalHeading.props.style.fontSize);assert.equal(heading.props.style.fontWeight,operationalHeading.props.style.fontWeight);
 h.unmount();
});

for(const sheetStyle of [false,true])test('terminal cards reuse arrival hierarchy without technical caveats sheet='+sheetStyle,()=>{
 const h=criarHarness();const section=ui(h)['./terminalPresenceSection'].renderTerminalPresenceSection;
 const vehicle={...terminalFixture(h.now),state:'Saindo do terminal',directionName:'Campo Grande',latitude:-22.9,longitude:-43.6};
 const before=JSON.stringify(vehicle);const output=section([vehicle],h.now,temas.claro.cores,()=>{}, {sheet:sheetStyle,accent:'#123456'});
 const copy=texto(output);assert.doesNotMatch(copy,/Partida não confirmada|Atendimento à parada não confirmado|Viagem confirmada|ITS_CURRENT|pela origem/);
 assert.doesNotMatch(copy,/D86286|GPS há/);assert.match(copy,/Saindo/);assert.match(copy,/Campo Grande/);assert.doesNotMatch(copy,/Chegada|Estimativa GPS/);
 const button=nodes(output).find(n=>n.type==='Pressable');assert.equal(button.props.disabled,false);
 const body=nodes(button).find(n=>n.type==='View'&&n.props.style?.flex===1);assert.equal(nodes(body).filter(n=>n.type==='Text').length,sheetStyle?3:2);
 assert.equal(JSON.stringify(vehicle),before);h.unmount();
});

test('shared arrival card preserves expansion and locate action after physical card compaction',()=>{
 const {h,render}=sheet();const focused=[];render({statusConsulta:'sucesso',carregandoChegadas:false,chegadas:[{...chegada,distanciaMetros:120}],onFocarVeiculo:c=>focused.push(c.id)});
 const row=nodes(h.output).find(n=>n.type==='Pressable'&&n.props.style?.borderRadius===12&&nodes(n).some(t=>t.type==='Text'&&texto(t)==='084'));
 assert.ok(row);assert.doesNotMatch(texto(h.output),/Mostrar no mapa/);row.props.onPress();render();
 const locate=nodes(h.output).find(n=>n.type==='Pressable'&&texto(n)==='Mostrar no mapa');assert.ok(locate);locate.props.onPress();assert.deepEqual(focused,['evento']);
 row.props.onPress();render();assert.doesNotMatch(texto(h.output),/Mostrar no mapa/);h.unmount();
});

test('closed line sheet releases its card tree only after closing animation and reopens with current lines',()=>{
 const h=criarHarness();h.react.memo=component=>component;const mocks=ui(h),finishes=[];mocks['react-native'].StyleSheet.create=s=>s;
 mocks['@/src/hooks/useFavoritos']={useFavoritos:()=>({linhas:[],status:'pronto',alternar(){}})};mocks['@/src/components/botaoFavorito']={__esModule:true,default:'Favorite'};mocks['@/src/components/estadoFavoritos']={__esModule:true,default:'FavoritesState'};mocks['react-native-svg']={__esModule:true,default:'Svg',Circle:'Circle',Path:'Path'};
 mocks['react-native-reanimated']={...mocks['react-native-reanimated'],withSpring:v=>v,withTiming:(v,config,finish)=>{if(finish)finishes.push(finish);return v}};
 const Component=h.carregar('../components/mapaComponents/linhasContainer.tsx',mocks).default;
 const line={linhaId:'838',linhaCodigo:'838',nomeExibicao:'838',subtitulo:'Magarça',modal:'onibus',cor:'#123456',ativa:true,modoSentido:'ambos',mostrarParadas:true};
 let open=false,lines=[line];const render=()=>h.render(()=>Component({linhasSelecionadas:lines,todasLinhasSelecionadas:lines,sentidosPorLinha:{},aberto:open,modalAtivo:'onibus',mostrarBotaoToggle:false,aoToggleAberto(){},aoRemoverLinha(){},aoToggleAtiva(){},aoToggleSentido(){},aoToggleParadas(){},aoAtualizarCor(){}}));
 render();assert.doesNotMatch(texto(h.output),/Linhas no Mapa/);
 open=true;render();assert.match(texto(h.output),/Linhas no Mapa/);assert.equal(nodes(h.output).filter(n=>n.type?.name==='LinhaCard').length,1);
 open=false;render();assert.match(texto(h.output),/Linhas no Mapa/);finishes.at(-1)(true);render();assert.doesNotMatch(texto(h.output),/Linhas no Mapa/);
 lines=[line,{...line,linhaId:'855',linhaCodigo:'855'}];render();assert.equal(nodes(h.output).filter(n=>n.type?.name==='LinhaCard').length,0);
 open=true;render();assert.deepEqual(nodes(h.output).filter(n=>n.type?.name==='LinhaCard').map(n=>n.props.linha.linhaId),['838','855']);assert.equal(line.ativa,true);h.unmount();
});

test('collapsed radar stops rendering offscreen cards after its exit animation and opens current arrivals',()=>{
 const h=criarHarness(),mocks=ui(h),finishes=[];mocks['react-native-reanimated']={...mocks['react-native-reanimated'],withTiming:(v,c,finish)=>{if(finish)finishes.push(finish);return v}};
 const Component=h.carregar('../components/mapaComponents/radarParada.tsx',mocks).default;const radar={eventos:[{eventId:'e1',linhaId:'l',codigoLinha:'838',eventType:'ARRIVAL',secondsUntilEvent:120}],parada:{parada:{paradaId:'p',nome:'Primeira'},vinculos:[]},metadados:{},contextoConsulta:'p',statusConsulta:'sucesso',carregando:false,atualizadoEm:h.now,agora:h.now,recebidoEm:h.now,consultaConcluida:true,candidatos:[],atualizar(){},selecionar(){},selecaoAutomatica(){},carregarMetadados(){}};
 const render=()=>h.render(()=>Component({radar,linhas:[],modal:'onibus',lateralidade:'destro',visivel:true,viewportHeight:800,onControlsBottomChange(){},onVerTodos(){},onEvento(){},localizavel:()=>true}));
 render();assert.match(texto(h.output),/Chega em 2 min/);nodes(h.output).find(n=>n.type==='Pressable'&&n.props.accessibilityLabel?.startsWith('Recolher painel')).props.onPress();render();
 assert.match(texto(h.output),/Chega em 2 min/);if(finishes.length)finishes.at(-1)(true);render();assert.doesNotMatch(texto(h.output),/Chega em 2 min/);
 radar.eventos=[{...radar.eventos[0],eventId:'e2',secondsUntilEvent:180}];render();assert.doesNotMatch(texto(h.output),/Chega em 3 min/);
 nodes(h.output).find(n=>n.type==='Pressable'&&n.props.accessibilityLabel?.startsWith('Abrir painel')).props.onPress();render();assert.match(texto(h.output),/Chega em 3 min/);h.unmount();
});
test('hidden stop sheet releases its card tree after closing without losing expansion state',()=>{
 const h=criarHarness(),mocks=ui(h),finishes=[];mocks['react-native-reanimated']={...mocks['react-native-reanimated'],withTiming:(v,c,finish)=>{if(finish)finishes.push(finish);return v}};
 const Component=h.carregar('../components/mapaComponents/paradaSheet.tsx',mocks).default;let visible=true;const props={parada:{paradaId:'A',nome:'Primeira'},linhas:[],chegadas:[chegada],statusConsulta:'sucesso',carregandoChegadas:false,expandido:true,onToggleExpandir(){},onFechar(){},onAtualizar(){}};
 const render=()=>h.render(()=>Component({...props,visivel:visible}));render();assert.match(texto(h.output),/Próximos ônibus/);
 visible=false;render();assert.match(texto(h.output),/Próximos ônibus/);if(finishes.length)finishes.at(-1)(true);render();assert.equal(nodes(h.output).filter(n=>n.type==='Text').length,0);
 props.chegadas=[{...chegada,id:'next',codigo:'855'}];visible=true;render();assert.match(texto(h.output),/855/);assert.match(texto(h.output),/Próximos ônibus/);assert.equal(props.expandido,true);h.unmount();
});

test('full radar incrementally reveals results while quick radar stays at two individual vehicles',()=>{
 const {h,render}=sheet();const vehicles=Array.from({length:50},(_,i)=>({...terminalFixture(h.now,'A'),key:'v'+i,order:'V'+i}));
 const props={statusConsulta:'sucesso',carregandoChegadas:false,linhas:[{linhaId:'line-x',codigo:'855',ativa:true,cor:'#123456'}],physicalModal:'onibus',terminalPresence:vehicles};
 render(props);const count=()=>nodes(h.output).filter(n=>n.props?.accessibilityLabel==='Detalhes da linha 855').length;assert.equal(count(),20);
 const scrolls=nodes(h.output).filter(n=>n.type==='ScrollView');assert.equal(scrolls.some(n=>n.props.horizontal&&texto(n).includes('Mostrar mais ônibus')),false);assert.equal(scrolls.some(n=>!n.props.horizontal&&texto(n).includes('Mostrar mais ônibus')),true);
 nodes(h.output).find(n=>n.type==='Pressable'&&texto(n)==='Mostrar mais ônibus').props.onPress();render(props);assert.equal(count(),40);
 nodes(h.output).find(n=>n.type==='Pressable'&&texto(n)==='Mostrar mais ônibus').props.onPress();render(props);assert.equal(count(),50);assert.doesNotMatch(texto(h.output),/Mostrar mais ônibus/);h.unmount();
});

test('physical details preserve identity GPS dwell and map focus across a new observation',async()=>{
 const {h,render}=sheet(),focused=[];let presence={...terminalFixture(h.now,'A'),latitude:-22.9,longitude:-43.6,dwellSince:h.now-300000};
 const props={statusConsulta:'sucesso',carregandoChegadas:false,linhas:[{linhaId:'line-x',codigo:'855',ativa:true,cor:'#123456'}],physicalModal:'onibus',onTerminalVehicle:v=>focused.push(v.order)};
 const update=()=>render({...props,terminalPresence:[presence]});update();assert.match(texto(h.output),/No terminal há 5 min/);assert.doesNotMatch(texto(h.output),/D86286|GPS há/);
 nodes(h.output).find(n=>n.props?.accessibilityLabel==='Detalhes da linha 855').props.onPress();update();assert.match(texto(h.output),/VeículoD86286Atualização GPShá 0 s/);
 await h.avancar(30000);presence={...presence,physicalAt:h.now};update();assert.match(texto(h.output),/D86286/);assert.match(texto(h.output),/No terminal há 5 min/);
 nodes(h.output).find(n=>n.props?.accessibilityLabel==='Localizar D86286 no mapa').props.onPress();assert.deepEqual(focused,['D86286']);
 nodes(h.output).find(n=>n.props?.accessibilityLabel==='Detalhes da linha 855').props.onPress();update();assert.doesNotMatch(texto(h.output),/D86286|GPS há/);h.unmount();
});
test('shared stop header never presents an itinerary occurrence as a global stop number',()=>{const {h,render}=sheet();const out=render({parada:{paradaId:'shared',nome:'Itapecuru-Mirim',ordem:39}});assert.match(texto(out),/Itapecuru-Mirim/);assert.match(texto(out),/Ponto de embarque/);assert.doesNotMatch(texto(out),/Parada #39/);h.unmount();});

for(const dark of [false,true])test('passenger physical details keep shared theme and accessible secondary information dark='+dark,()=>{
 const h=criarHarness(),mocks=ui(h),cores=temas[dark?'escuro':'claro'].cores;
 mocks['@/src/hooks/useTema']={useTema:()=>({cores,temaAtual:dark?'escuro':'claro'})};
 mocks['react-native'].Dimensions.get=()=>({height:800,width:400,fontScale:1.3});
 const Component=h.carregar('../components/mapaComponents/paradaSheet.tsx',mocks).default;
 let vehicle={...terminalFixture(h.now,'A'),dwellSince:h.now-180000,state:'Saindo do terminal',directionName:'Magarça',latitude:-22.9,longitude:-43.6};
 const props={visivel:true,parada:{paradaId:'A',nome:'Primeira'},linhas:[{linhaId:'line-x',codigo:'855',ativa:true,cor:'#123456'}],chegadas:[],terminalPresence:[vehicle],statusConsulta:'sucesso',expandido:true,physicalModal:'onibus',onToggleExpandir(){},onFechar(){}};
 const render=()=>h.render(()=>Component(props));render();assert.match(texto(h.output),/Saindo do terminal/);assert.match(texto(h.output),/Sentido Magarça/);assert.equal(nodes(h.output).some(n=>n.type==='Text'&&texto(n)==='Saindo'),false);assert.doesNotMatch(texto(h.output),/D86286|Atualização GPS|Contado desde/);
 let row=nodes(h.output).find(n=>n.props?.accessibilityLabel==='Detalhes da linha 855');assert.equal(row.props.accessibilityState.expanded,false);row.props.onPress();render();
 assert.match(texto(h.output),/VeículoD86286Atualização GPShá 0 s/);assert.doesNotMatch(texto(h.output),/Contado desde/);
 const info=nodes(h.output).find(n=>n.props?.accessibilityLabel==='Como contamos o tempo no terminal');let stopped=0;info.props.onPress({stopPropagation(){stopped++}});render();assert.equal(stopped,1);assert.match(texto(h.output),/Contado desde/);
 row=nodes(h.output).find(n=>n.props?.accessibilityLabel==='Detalhes da linha 855');assert.equal(row.props.accessibilityState.expanded,true);assert.ok(nodes(row).filter(n=>n.type==='Text').every(n=>n.props.allowFontScaling!==false));assert.ok(nodes(row).some(n=>n.type==='Text'&&n.props.style?.color===cores.textoPrimario));h.unmount();
});
