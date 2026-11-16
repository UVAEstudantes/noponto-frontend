const test=require('node:test'),assert=require('node:assert/strict');
const {criarHarness}=require('../hooks/radarTestHarness.cjs');
function loadIndicator(h){return h.carregar('../components/gpsFreshnessIndicator.tsx',{'react-native':{Text:'Text',View:'View'},'react-native-svg':{__esModule:true,default:'Svg',Rect:'Rect'}});}
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


test('native five bar SVG preserves gray inactive bars and separates operational uncertainty',()=>{
 const h=criarHarness(),{GpsFreshnessIndicator}=loadIndicator(h),at=Date.parse('2026-11-16T12:00:00Z');
 for(const [seconds,bars] of [[0,5],[46,4],[61,3],[91,2],[121,1],[181,0]]){
  for(const textColor of ['black','white']){
   const view=GpsFreshnessIndicator({at,now:at+seconds*1000,uncertain:true,textColor}),svg=view.props.children[0],rects=svg.props.children.flat();
   assert.equal(svg.props.width,20);assert.equal(rects.length,5);assert.equal(rects.filter(r=>r.props.fill!=='#a3a3a3').length,bars);assert.ok(rects.slice(bars).every(r=>r.props.fill==='#a3a3a3'));assert.match(view.props.accessibilityLabel,/Localização incerta/);
  }
 }
});

test('five GPS bars and temporal color ignore operational uncertainty at every boundary',()=>{
 const h=criarHarness(),{gpsFreshness}=h.carregar('../services/gpsPresentationPolicy.ts'),at=Date.parse('2026-11-16T12:00:00Z');
 for(const [seconds,bars,color] of [[0,5,'#16a34a'],[45,5,'#16a34a'],[46,4,'#16a34a'],[60,4,'#16a34a'],[61,3,'#b7791f'],[90,3,'#b7791f'],[91,2,'#d97706'],[120,2,'#d97706'],[121,1,'#b45309'],[180,1,'#b45309'],[181,0,'#737373']]){
  const q=gpsFreshness(at,at+seconds*1000,true);assert.equal(q.bars,bars);assert.equal(q.color,color);
 }
});
