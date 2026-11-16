const test=require('node:test'),assert=require('node:assert/strict');
const {criarHarness}=require('../hooks/radarTestHarness.cjs');
function loadIndicator(h){return h.carregar('../components/gpsFreshnessIndicator.tsx',{'react-native':{Text:'Text',View:'View'},'lucide-react-native':Object.fromEntries(['Signal','SignalHigh','SignalMedium','SignalLow','SignalZero','WifiOff'].map(k=>[k,k]))});}
const flatten=x=>x==null||typeof x==='boolean'||typeof x==='function'?'':typeof x==='string'||typeof x==='number'?String(x):Array.isArray(x)?x.map(flatten).join(' '):typeof x.type==='function'?flatten(x.type(x.props)):flatten(x.props?.children);
test('physical stop list displays freshness from GPS time without changing arrival predictions',()=>{
 const h=criarHarness(),now=Date.parse('2026-11-16T12:00:00Z');const indicator=loadIndicator(h);
 const {renderPhysicalPresenceSection}=h.carregar('../components/mapaComponents/physicalPresenceSection.tsx',{'../gpsFreshnessIndicator':indicator});
 const cores={textoPrimario:'black',textoSecundario:'gray',bordaSuave:'gray'};
 const v={key:'bus',modal:'onibus',originalVehicleId:'BUS',physicalAt:new Date(now-100000).toISOString(),facilityStopId:'terminal',location:'AtTerminal',lineState:'Informed',serviceCode:'855'};
 assert.match(flatten(renderPhysicalPresenceSection([v],now,cores)),/Muito atrasado/);
 assert.match(flatten(renderPhysicalPresenceSection([v],now+81000,cores)),/Sem atualização confiável/);
 assert.equal(v.physicalAt,new Date(now-100000).toISOString());
});


test('stop terminal card adds temporal freshness without changing physical presence or its forecasts',()=>{
 const h=criarHarness(),now=Date.parse('2026-11-16T12:00:00Z');const indicator=loadIndicator(h);
 const {renderTerminalPresenceSection}=h.carregar('../components/mapaComponents/terminalPresenceSection.tsx',{'../gpsFreshnessIndicator':indicator,
  '@/src/services/terminalTracking':{terminalVehicleFocus:()=>null},'@/src/services/radarPassenger':{physicalPassengerLabel:()=> 'Localização aproximada'},
  './radarVehicleCardView':{renderRadarVehicleCard:p=>p},'./radarVehicleCard':{fundoIdentificador:x=>x,textoSobreCor:()=> 'white'},'lucide-react-native':{BusFront:'Bus',MapPin:'Map',ChevronRight:'Right',ChevronDown:'Down'}});
 const v={key:'bus',order:'BUS',code:'855',lineId:'line',state:'Na região da origem',physicalAt:now-100000,validUntil:now+600000,corridors:[]};
 const tree=renderTerminalPresenceSection([v],now,{textoPrimario:'black',textoSecundario:'gray',bordaSuave:'gray'}),cards=tree.props.children.flat();
 assert.equal(cards.length,1);assert.match(flatten(cards[0].trailing),/GPS: Muito atrasado/);assert.equal(cards[0].title,'Localização aproximada');assert.equal(v.physicalAt,now-100000);assert.equal(v.estimatedMinutes,undefined);
});


test('native signal family represents physical age and overrides green for uncertain locations',()=>{
 const h=criarHarness(),{GpsFreshnessIndicator}=loadIndicator(h),at=Date.parse('2026-11-16T12:00:00Z');
 for(const [seconds,name] of [[0,'Signal'],[30,'SignalHigh'],[60,'SignalMedium'],[90,'SignalLow'],[120,'SignalZero'],[181,'WifiOff']]){
  const view=GpsFreshnessIndicator({at,now:at+seconds*1000,textColor:'gray'});assert.equal(view.props.children[0].type,name);assert.match(view.props.accessibilityLabel,/idade da localização, não a intensidade de rede/);assert.equal(view.props.children[0].props.size,16);
 }
 const good=GpsFreshnessIndicator({at,now:at,textColor:'white'}),uncertain=GpsFreshnessIndicator({at,now:at,uncertain:true,textColor:'white'});
 assert.notEqual(good.props.children[0].props.color,uncertain.props.children[0].props.color);assert.match(uncertain.props.accessibilityLabel,/Localização incerta/);
});
