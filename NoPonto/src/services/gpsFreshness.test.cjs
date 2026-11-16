const test=require('node:test'),assert=require('node:assert/strict');
const {criarHarness}=require('../hooks/radarTestHarness.cjs');
const flatten=x=>x==null||typeof x==='boolean'||typeof x==='function'?'':typeof x==='string'||typeof x==='number'?String(x):Array.isArray(x)?x.map(flatten).join(' '):flatten(x.props?.children);
test('physical stop list displays freshness from GPS time without changing arrival predictions',()=>{
 const h=criarHarness(),now=Date.parse('2026-11-16T12:00:00Z');
 const {renderPhysicalPresenceSection}=h.carregar('../components/mapaComponents/physicalPresenceSection.tsx');
 const cores={textoPrimario:'black',textoSecundario:'gray',bordaSuave:'gray'};
 const v={key:'bus',modal:'onibus',originalVehicleId:'BUS',physicalAt:new Date(now-100000).toISOString(),facilityStopId:'terminal',location:'AtTerminal',lineState:'Informed',serviceCode:'855'};
 assert.match(flatten(renderPhysicalPresenceSection([v],now,cores)),/Muito atrasado/);
 assert.match(flatten(renderPhysicalPresenceSection([v],now+81000,cores)),/Sem atualização confiável/);
 assert.equal(v.physicalAt,new Date(now-100000).toISOString());
});


test('stop terminal card adds temporal freshness without changing physical presence or its forecasts',()=>{
 const h=criarHarness(),now=Date.parse('2026-11-16T12:00:00Z');
 const {renderTerminalPresenceSection}=h.carregar('../components/mapaComponents/terminalPresenceSection.tsx',{
  '@/src/services/terminalTracking':{terminalVehicleFocus:()=>null},'@/src/services/radarPassenger':{physicalPassengerLabel:()=> 'Localização aproximada'},
  './radarVehicleCardView':{renderRadarVehicleCard:p=>p},'./radarVehicleCard':{fundoIdentificador:x=>x,textoSobreCor:()=> 'white'},'lucide-react-native':{BusFront:'Bus',MapPin:'Map',ChevronRight:'Right',ChevronDown:'Down'}});
 const v={key:'bus',order:'BUS',code:'855',lineId:'line',state:'Na região da origem',physicalAt:now-100000,validUntil:now+600000,corridors:[]};
 const tree=renderTerminalPresenceSection([v],now,{textoPrimario:'black',textoSecundario:'gray',bordaSuave:'gray'}),cards=tree.props.children.flat();
 assert.equal(cards.length,1);assert.match(flatten(cards[0].trailing),/GPS: Muito atrasado/);assert.equal(cards[0].title,'Localização aproximada');assert.equal(v.physicalAt,now-100000);assert.equal(v.estimatedMinutes,undefined);
});
