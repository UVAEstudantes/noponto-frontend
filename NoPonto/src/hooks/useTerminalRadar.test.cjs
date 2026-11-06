const assert=require('node:assert/strict'),test=require('node:test');
const {criarHarness}=require('./radarTestHarness.cjs');
const capture=require('../services/fixtures/terminalFixture.ts').terminalFixture;
const {geometryWork}=require('../services/hybridGps.ts');
const {terminalRadarVehicles}=require('../services/terminalTracking.ts');

test('stop scoped hook follows real Magarca vehicles without map selection and releases scope on close',()=>{
 const h=criarHarness(),prior=global.__DEV__;global.__DEV__=false;
 try{
  const catalog={maps:capture.lines.map(l=>l.map),lines:[],itineraries:{}};
  const map=catalog.maps[0],stops=Object.values(map.paradasPorPadrao)[0];
  let stop={parada:stops[2],vinculos:catalog.maps.map(l=>({linhaId:l.linhaId,padraoVersaoId:Object.keys(l.paradasPorPadrao)[0]}))};
  let enabled=true,now=Math.max(...capture.lines.map(l=>Date.parse(l.snapshot.composedAt))),codes=[];
  const snapshots=capture.lines.map(l=>l.snapshot);
  const {useTerminalRadarPresence}=h.carregar('./useTerminalRadar.ts',{
   '../services/unifiedLocation':{useUnifiedLocation:input=>{codes=input;return {snapshots:input.length?snapshots:[],now};}},
   '../services/estruturaV2':{},
  });
  const render=()=>h.render(()=>useTerminalRadarPresence(catalog,stop,enabled));
  let rows=render();assert.deepEqual(codes,['838','855']);
  assert.equal(terminalRadarVehicles(rows,stop.parada.paradaId,stop.vinculos,[],now).some(v=>v.order==='TEST-MAGARCA-855'),true);
  const work=geometryWork.projections;
  for(let i=0;i<10;i++){now+=10;assert.equal(render(),rows);}
  assert.equal(geometryWork.projections,work);
  enabled=false;assert.deepEqual(render(),[]);assert.deepEqual(codes,[]);
  enabled=true;stop={...stop,parada:{...stop.parada,paradaId:'unserved'}};assert.deepEqual(render(),[]);assert.deepEqual(codes,[]);
  h.unmount();
 }finally{global.__DEV__=prior;}
});

test('pilot catalog reads exact identities for two lines caches structure and never changes map configuration',async()=>{
 const h=criarHarness(),calls=[];
 const api={
  listarLinhasV2:async code=>{calls.push('line:'+code);const map=capture.lines.find(l=>l.map.nome===code).map;return [{linhaId:'wrong',codigo:code,modal:'BRT'}, {linhaId:map.linhaId,codigo:code,modal:'Ônibus',terminalA:map.terminaisOficiais[0],terminalB:map.terminaisOficiais[1]}];},
  listarSentidosV2:async code=>{const {map}=capture.lines.find(l=>l.map.nome===code);return Object.keys(map.paradasPorPadrao).map(id=>({id,linhaId:map.linhaId}));},
  listarPadroesV2:async id=>[{versaoAtualId:id}],
  obterItinerarioPadraoVersaoV2:async id=>{const {map}=capture.lines.find(l=>id in l.map.paradasPorPadrao);calls.push('route:'+id);return {linhaId:map.linhaId,codigoLinha:map.nome,sentidoId:id,padraoVersaoId:id,padraoOperacionalId:'pattern',chavePadrao:'regular',geometria:{coordenadas:map.segmentos[map.itinerarioSegmentoMap[id]].map(([lat,lon])=>[lon,lat])},ocorrencias:map.paradasPorPadrao[id].map(s=>({...s,codigoParada:s.codigo}))};},
 };
 const {useTerminalRadarCatalog}=h.carregar('./useTerminalRadar.ts',{'../services/estruturaV2':api,'../services/unifiedLocation':{}});
 let enabled=false;h.render(()=>useTerminalRadarCatalog(enabled));assert.equal(calls.length,0);
 enabled=true;h.render();for(let i=0;i<8;i++)await h.flush();
 assert.deepEqual(h.output.lines.map(l=>l.linhaCodigo),['838','855']);assert.equal(h.output.maps.length,2);
 assert.equal(calls.filter(c=>c.startsWith('line:')).length,2);assert.equal(calls.filter(c=>c.startsWith('route:')).length,4);
 const cached=h.output;enabled=false;h.render();enabled=true;h.render();await h.flush();assert.equal(h.output,cached);assert.equal(calls.length,6);h.unmount();
});

test('real unified hook cancels stop subscriptions ignores late frames and bounds a changed stop to one line',async()=>{
 const h=criarHarness(),prior=global.__DEV__;global.__DEV__=false;
 const owners=new Set(),subscriptions=[];
 try{
  const network=require('../services/unifiedNetwork.ts');
  const unified=h.carregar('../services/unifiedLocation.ts',{
   '@/src/config/env':{config:{API_BASE_URL:'fixture://no-rest-gps'}},
   './unifiedNetwork':{...network,createUnifiedCapabilityReader:()=>async()=>({schemaVersion:1,enabled:true,canonical:true,lineCodes:['838','855']})},
   './gpsHub':{observePhysicalPresence:(owner,ids,onFrame)=>{const s={owner,ids,onFrame};owners.add(s);subscriptions.push(s);return()=>owners.delete(s);}},
  });
  const {useTerminalRadarPresence}=h.carregar('./useTerminalRadar.ts',{'../services/unifiedLocation':unified,'../services/estruturaV2':{}});
  const catalog={maps:capture.lines.map(l=>l.map),lines:[],itineraries:{}};
  const maps=catalog.maps;
  let enabled=true,stop={parada:Object.values(maps[0].paradasPorPadrao)[0][2],vinculos:maps.map(l=>({linhaId:l.linhaId,padraoVersaoId:Object.keys(l.paradasPorPadrao)[0]}))};
  const render=()=>h.render(()=>useTerminalRadarPresence(catalog,stop,enabled));
  render();await h.flush();assert.equal(owners.size,1);assert.deepEqual(subscriptions.at(-1).ids,['unified:838','unified:855']);
  const stale=subscriptions.at(-1).onFrame;
  enabled=false;render();assert.equal(owners.size,0);assert.equal(h.timerCount,0);
  stale(capture.lines[1].snapshot);await h.flush();assert.deepEqual(h.output,[]);
  enabled=true;stop={parada:Object.values(maps[0].paradasPorPadrao)[1][2],vinculos:[{linhaId:maps[0].linhaId,padraoVersaoId:Object.keys(maps[0].paradasPorPadrao)[1]}]};
  render();await h.flush();assert.equal(owners.size,1);assert.deepEqual(subscriptions.at(-1).ids,['unified:838']);
  h.unmount();assert.equal(owners.size,0);assert.equal(h.timerCount,0);
 }finally{global.__DEV__=prior;}
});

test('missing official metadata retries at a bounded interval and cancels retry on leave',async()=>{
 const h=criarHarness(),prior=global.__DEV__;global.__DEV__=false;
 try{
  let enabled=true,attempts=0;
  const {useTerminalRadarCatalog}=h.carregar('./useTerminalRadar.ts',{'../services/unifiedLocation':{},'../services/estruturaV2':{listarLinhasV2:async()=>{attempts++;return [];}}});
  h.render(()=>useTerminalRadarCatalog(enabled));await h.flush();assert.equal(attempts,1);assert.equal(h.timerCount,1);assert.deepEqual(h.output.maps,[]);
  await h.avancar(29999);assert.equal(attempts,1);await h.avancar(1);assert.equal(attempts,2);assert.equal(h.timerCount,1);
  enabled=false;h.render();assert.equal(h.timerCount,0);await h.avancar(60000);assert.equal(attempts,2);h.unmount();
 }finally{global.__DEV__=prior;}
});
