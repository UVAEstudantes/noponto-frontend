import assert from 'node:assert/strict';
import test from 'node:test';
import { terminalFixture as capture, privateReplay } from './fixtures/terminalFixture';
import {createHybridComposer} from './hybridContext';
import {lineTerminals,terminalRadarVehicles,terminalRadarReason,reconcileTerminalPlaceholders} from './terminalTracking';
import {geometryWork} from './hybridGps';
import {mergeTerminalEvidence,terminalRadarScope,mergeTerminalRadarLines,type TerminalRadarCatalog} from './terminalRadarContext';
import {diagnoseTerminalInputs} from './terminalTrackingDiagnostics';
import type {LinhaParaMostrar} from '../components/mapOSM/types';
import type {UnifiedSnapshot} from './unifiedLocationContract';
import {eventosValidosRadar,type ParadaRadar} from './radarParada';
import type {EventoParadaDto} from './eventosParada';

test('synthetic Magarca snapshot reaches Itapecuru without a platform dwell or GTFS trip',()=>{
 const {map,snapshot}=capture.lines.find(l=>l.map.nome==='855')!;
 const result=createHybridComposer()([map as unknown as LinhaParaMostrar],[snapshot as UnifiedSnapshot],Date.parse(snapshot.composedAt));
 const p=result[0].posicoes!.find(p=>p.ordem==='TEST-MAGARCA-855')!;
 assert.equal(p.vehicleState,'Na região da origem');
 const rows=terminalRadarVehicles(p.terminalPresence?[p.terminalPresence]:[],'81d26796-2248-4081-babd-508fbcfe5a95',[{linhaId:map.linhaId}],[],Date.parse(snapshot.composedAt));
 assert.deepEqual(rows.map(v=>v.order),['TEST-MAGARCA-855']);
 assert.equal(rows[0].operationalConfirmed,false);
});
test('public Campo Grande second stop is inside the bounded early corridor',()=>{
 const {map,snapshot}=capture.lines.find(l=>l.map.nome==='838')!;
 const result=createHybridComposer()([map as unknown as LinhaParaMostrar],[snapshot as UnifiedSnapshot],Date.parse(snapshot.composedAt));
 const p=result[0].posicoes!.find(p=>p.ordem==='TEST-MAGARCA-838')!;
 const rows=terminalRadarVehicles(p.terminalPresence?[p.terminalPresence]:[],'e1842938-155e-4166-bd0d-19d738686595',[{linhaId:map.linhaId}],[],Date.parse(snapshot.composedAt));
 assert.deepEqual(rows.map(v=>v.order),['TEST-MAGARCA-838']);
});

function atMetres(coords:[number,number][],metres:number):[number,number]{
 for(let i=1;i<coords.length;i++){
  const a=coords[i-1],b=coords[i],length=Math.hypot(b[0]-a[0],(b[1]-a[1])*Math.cos(a[0]*Math.PI/180))*111195;
  if(metres<=length){const t=length?metres/length:0;return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];}metres-=length;
 }return coords.at(-1)!;
}
function sequence(code='855',origin='5151O00177C0'){
 const captured=structuredClone(capture.lines.find(l=>l.map.nome===code)!);
 const line=captured.map as unknown as LinhaParaMostrar;
 const endpoint=lineTerminals(line).find(e=>e.stop.codigo===origin)!;
 const corridor=endpoint.corridors[0],snapshot=captured.snapshot as UnifiedSnapshot;
 const vehicle=snapshot.vehicles[0];vehicle.order='TEST-EARLY';vehicle.key='TEST-EARLY';vehicle.operational=null;
 snapshot.vehicles=[vehicle];const base=Date.parse(snapshot.composedAt),composer=createHybridComposer();
 vehicle.line.validatedAt=new Date(base).toISOString();
 const tick=(seconds:number,metres:number,speed:number|null,source='ITS_CURRENT')=>{
  const [latitude,longitude]=atMetres(corridor.coords,metres),at=base+seconds*1000;
  vehicle.location={...vehicle.location,latitude,longitude,physicalAt:new Date(at).toISOString(),validUntil:new Date(at+600000).toISOString(),source,speedKmh:speed,uncertain:false};
  snapshot.revision++;snapshot.composedAt=new Date(at).toISOString();
  return composer([line],[snapshot],at)[0].posicoes![0];
 };
 return {line,endpoint,corridor,snapshot,vehicle,base,composer,tick};
}
for(const [code,origin] of [['838','5151O00177C0'],['855','5151O00177C0'],['838','5144O00486P9'],['855','o25h']])test(`official ${code} ${origin} supports sparse origin presence beyond 35 metres`,()=>{
 const f=sequence(code,origin),first=f.tick(0,40,0);
 assert.equal(first.vehicleState,'Na região da origem');
 const p=f.tick(180,40,0);assert.equal(p.vehicleState,'No terminal');
 for(const stop of f.corridor.stops.filter(s=>s.rank<=3&&s.metres<=1500))assert.equal(terminalRadarVehicles([p.terminalPresence!],stop.id,[{linhaId:f.line.linhaId!}],[],f.base+180000).length,1);
 const before=geometryWork.projections;
 for(let i=1;i<10;i++)f.composer([f.line],[f.snapshot],f.base+180000+i*1000);
 assert.equal(geometryWork.projections,before);
});
for(const [code,origin] of [['838','5151O00177C0'],['855','5151O00177C0'],['838','5144O00486P9'],['855','o25h']])test(`physical departure on real ${code} ${origin} geometry keeps early stop presence`,()=>{
 const f=sequence(code,origin);f.tick(0,40,0);f.tick(30,40,0);f.tick(60,70,7.2);f.tick(90,130,7.2);
 const p=f.tick(120,190,7.2);
 assert.ok(p.terminalPresence);assert.equal(p.terminalPresence.operationalConfirmed,false);
 assert.equal(terminalRadarVehicles([p.terminalPresence],f.corridor.stops[1].id,[{linhaId:f.line.linhaId!}],[],f.base+120000).length,1);
 assert.equal(f.vehicle.operational,null);
});
test('origin ITS departure recovers physical itinerary and estimate before GTFS then reconciles a real arrival',()=>{
 const f=sequence();assert.equal(f.tick(0,40,0).vehicleState,'Na região da origem');assert.equal(f.tick(30,40,0).vehicleState,'No terminal');
 assert.equal(f.tick(60,70,7.2).vehicleState,'Saindo do terminal');const p=f.tick(90,130,7.2);
 assert.equal(p.contextConfidence,'inferred');assert.equal(p.padraoVersaoId,f.corridor.pattern);
 assert.equal(p.sentidoId,null);assert.equal(p.padraoOperacionalId,null);assert.equal(f.vehicle.operational,null);
 assert.equal(p.vehicleState,'Saindo do terminal');assert.ok(p.proximaParadaNome);assert.ok(p.distanciaProximaParadaMetros!>0);
 const stop='81d26796-2248-4081-babd-508fbcfe5a95',links=[{linhaId:f.line.linhaId!}];
 const rows=terminalRadarVehicles([p.terminalPresence!],stop,links,[],f.base+90000);
 assert.equal(rows.length,1);assert.deepEqual(rows[0].estimatedMinutes,[4,8]);
 assert.equal(terminalRadarVehicles([p.terminalPresence!],stop,links,[],f.base+151000)[0].estimatedMinutes,undefined);
 const next=f.tick(120,190,7.2);assert.equal(next.vehicleState,'A caminho');
 f.vehicle.operational={timestampGps:new Date(f.base+150000).toISOString(),status:0,latitude:atMetres(f.corridor.coords,250)[0],longitude:atMetres(f.corridor.coords,250)[1],linhaId:f.line.linhaId,codigoLinha:'855',padraoVersaoId:f.corridor.pattern,sentidoId:'gtfs-direction'};
 const confirmed=f.tick(150,250,7.2,'GTFSRT_BUS');assert.equal(confirmed.contextConfidence,'confirmed');assert.equal(confirmed.presencaRotulo,'Em viagem');assert.equal(confirmed.idVisual,p.idVisual);assert.equal(confirmed.unifiedSource,'GTFSRT_BUS');
 const placeholder={codigoVeiculo:'TEST-EARLY',linhaId:f.line.linhaId!,secondsUntilEvent:null,estimatedAt:null,referenciaDisponivel:true};
 assert.equal(terminalRadarVehicles([confirmed.terminalPresence!],stop,links,[placeholder],f.base+150000).length,1);
 assert.deepEqual(reconcileTerminalPlaceholders([placeholder],[confirmed.terminalPresence!]),[]);
 assert.equal(terminalRadarVehicles([confirmed.terminalPresence!],stop,links,[{...placeholder,secondsUntilEvent:120}],f.base+150000).length,0);
 f.vehicle.operational=null;const resumed=f.tick(180,310,7.2);assert.equal(resumed.contextConfidence,'retained');assert.equal(resumed.unifiedSource,'ITS_CURRENT');
});
test('shared departures infer the official destination and common geometry without inventing a version or estimate',()=>{
 const f=sequence();const pattern='shared';
 f.line.itinerarioSegmentoMap![pattern]=f.line.itinerarioSegmentoMap![f.corridor.pattern];
 f.line.paradasPorPadrao![pattern]=[...f.line.paradasPorPadrao![f.corridor.pattern]];
 f.tick(0,40,0);f.tick(30,40,0);f.tick(60,70,7.2);const p=f.tick(90,110,7.2);
 assert.equal(p.padraoVersaoId,null);assert.equal(p.contextConfidence,'inferred');assert.equal(p.routeConfidence,'shared');assert.equal(p.sentidoNome,'Deodoro');
 assert.equal(p.terminalPresence?.knownPattern,null);
 const row=terminalRadarVehicles([p.terminalPresence!],f.corridor.stops[1].id,[{linhaId:f.line.linhaId!}],[],f.base+90000)[0];assert.equal(row.estimatedMinutes,undefined);
});
for(const [code,origin,destination] of [['838','5151O00177C0','Campo Grande'],['855','5151O00177C0','Deodoro'],['838','5144O00486P9','Magarça'],['855','o25h','Magarça']])test(`early origin direction ${code} ${origin} names ${destination} before an exact itinerary`,()=>{
 const f=sequence(code,origin);f.tick(0,40,0);f.tick(30,40,0);
 const p=f.tick(60,70,7.2);
 assert.equal(p.sentidoNome,destination);assert.equal(p.directionConfidence,'origin');assert.equal(p.padraoVersaoId,null);assert.equal(p.sentidoId,null);assert.equal(p.operationConfirmed,false);
 assert.equal(p.backendMotionEligible,true);assert.equal(p.routeConfidence,'origin');assert.equal(p.physicalRoutePattern,f.corridor.pattern);
 const returned=f.tick(90,40,0);assert.equal(returned.sentidoNome,undefined);assert.equal(returned.backendMotionEligible,false);
});
test('return conflict transfer expiry and passed stops invalidate departure without reviving old evidence',()=>{
 const f=sequence();f.tick(0,40,0);f.tick(30,40,0);f.tick(60,70,7.2);f.tick(90,130,7.2);
 const moving=f.tick(120,700,40),stop=f.corridor.stops[1].id,links=[{linhaId:f.line.linhaId!}];
 assert.equal(terminalRadarReason(moving.terminalPresence!,stop,links,[],f.base+120000),'stop_already_passed');
 const returned=f.tick(150,40,0);assert.equal(returned.padraoVersaoId,null);
 assert.equal(f.tick(180,40,0).vehicleState,'No terminal');
 const count=f.composer([f.line],[f.snapshot],f.base+661000)[0].posicoes!.length;assert.equal(count,0);
 const g=sequence();g.tick(0,40,0);g.tick(30,40,0);g.line.linhaId='transfer';g.vehicle.line.lineId='transfer';
 assert.equal(g.tick(60,40,0).vehicleState,'Na região da origem');
 g.vehicle.location.uncertain=true;g.snapshot.revision++;assert.equal(g.composer([g.line],[g.snapshot],g.base+60000)[0].posicoes![0].terminalPresence,undefined);
});
test('radar scope works with no selected map lines and subscribes only the eligible stop lines',()=>{
 const maps=capture.lines.map(l=>l.map as unknown as LinhaParaMostrar);
 const catalog:TerminalRadarCatalog={maps,itineraries:{},lines:maps.map(l=>({linhaId:l.linhaId!,linhaCodigo:l.nome,nomeExibicao:l.nome,ativa:true,modal:'onibus',cor:'#fff',modoSentido:'ambos',mostrarParadas:false}))};
 const selected:Parameters<typeof mergeTerminalRadarLines>[0]=[];
 assert.deepEqual(mergeTerminalRadarLines(selected,catalog).map(l=>l.linhaCodigo),['838','855']);assert.deepEqual(selected,[]);
 const stop={parada:{...maps[0].paradasPorPadrao![Object.keys(maps[0].paradasPorPadrao!)[0]][2]},distancia:0,vinculos:maps.map(l=>({linhaId:l.linhaId!,padraoVersaoId:lineTerminals(l)[0].corridors[0].pattern,sentidoId:'sense',destino:'destination'}))};
 assert.equal(stop.parada.nome,'Itapecuru-Mirim');assert.equal(stop.parada.ordem,3);
 assert.deepEqual(terminalRadarScope(catalog,stop).map(l=>l.nome),['838','855']);
 assert.deepEqual(terminalRadarScope({...catalog,maps:[...Array(50).fill(maps[0]),...Array(50).fill(maps[1]),{...maps[0],nome:'unrelated'}]},stop).map(l=>l.nome),['838','855']);
 assert.deepEqual(terminalRadarScope(catalog,{...stop,parada:{...stop.parada,paradaId:'far-away'}}),[]);
 assert.deepEqual(terminalRadarScope(catalog,null),[]);
});

test('real radar events reject incompatible Campo Grande service and preserve Magarca origin without an ETA',{skip: !privateReplay('events.json')},()=>{
 const evidence=privateReplay('events.json') as {rounds:{at:string;events:Record<string,EventoParadaDto[]>;snapshots:UnifiedSnapshot[]}[]};
 const round=evidence.rounds[0],maps=capture.lines.map(l=>l.map as unknown as LinhaParaMostrar),now=Date.parse(round.at);
 const result=createHybridComposer()(maps,round.snapshots,now),presence=result.flatMap(l=>l.posicoes??[]).find(p=>p.ordem==='D86235')!.terminalPresence!;
 const context=(line:LinhaParaMostrar,id:string):ParadaRadar=>{
  const entry=Object.entries(line.paradasPorPadrao!).find(([,stops])=>stops.some(s=>s.paradaId===id))!;
  const actual=round.events[id];const sense=actual.find(e=>e.padraoVersaoId===entry[0])?.sentidoId??'eligible-sense';
  return {parada:entry[1].find(s=>s.paradaId===id)!,distancia:0,vinculos:[{linhaId:line.linhaId!,padraoVersaoId:entry[0],sentidoId:sense,destino:'destination'}]};
 };
 const cg='e1842938-155e-4166-bd0d-19d738686595',itap='81d26796-2248-4081-babd-508fbcfe5a95';
 assert.equal(round.events[cg].some(e=>e.codigoLinha==='855'&&e.codigoVeiculo==='D86286'&&e.secondsUntilEvent==null&&e.estimatedAt==null),true);
 assert.deepEqual(eventosValidosRadar(round.events[cg],context(maps[0],cg),now,now),[]);
 assert.deepEqual(eventosValidosRadar(round.events[itap],context(maps[1],itap),now,now),[]);
 const rows=terminalRadarVehicles([presence],itap,[{linhaId:maps[1].linhaId!}],round.events[itap],now);
 assert.deepEqual(rows.map(v=>v.order),['D86235']);assert.equal(rows[0].estimatedMinutes,undefined);
 const timed={linhaId:presence.lineId,codigoVeiculo:presence.order,padraoVersaoId:'incompatible-pattern',paradaId:itap,secondsUntilEvent:120};
 assert.equal(terminalRadarVehicles([presence],itap,[{linhaId:presence.lineId}], [timed],now).length,1);
 const valid={...timed,padraoVersaoId:presence.corridors[0].pattern};
 assert.equal(terminalRadarVehicles([presence],itap,[{linhaId:presence.lineId}], [valid],now).length,0);
 assert.equal(terminalRadarVehicles([presence],itap,[{linhaId:presence.lineId}], [{...valid,estimatedAt:new Date(now-1).toISOString()}],now).length,1);
});
test('canonical diagnostics expose unloaded lines expired fixes and identity conflicts without garage guesses',()=>{
 const f=sequence(),now=f.base;
 assert.equal(diagnoseTerminalInputs([], [f.snapshot],now)[0].reason,'line_not_loaded_or_subscribed');
 assert.equal(diagnoseTerminalInputs([f.line],[f.snapshot],now+481000)[0].reason,'gps_expired');
 f.vehicle.line.lineId='wrong';assert.equal(diagnoseTerminalInputs([f.line],[f.snapshot],now)[0].reason,'invalid_line_or_identity');
 // Synthetic distant parked cluster are kept physically visible, not declared garages.
 const real=capture.lines[0];const rows=createHybridComposer()([real.map as unknown as LinhaParaMostrar],[real.snapshot as UnifiedSnapshot],Date.parse(real.snapshot.composedAt))[0].posicoes!;
 const parked=rows.find(p=>p.ordem==='TEST-DISTANT-PARKED')!;assert.equal(parked.lastObservedSpeedKmh,0);assert.equal(parked.terminalPresence,undefined);assert.equal(parked.ordem,'TEST-DISTANT-PARKED');
});

test('actual live canonical sequence keeps Magarca presence through repeated snapshots and sparse real fixes',{skip: !privateReplay('live.json')},()=>{
 // Captured read-only at 19:35:56, 19:36:26 and 19:36:57 UTC. No GPS times edited.
 const live=privateReplay('live.json') as {rounds:{at:string;snapshots:UnifiedSnapshot[]}[]};
 const maps=capture.lines.map(l=>l.map as unknown as LinhaParaMostrar),compose=createHybridComposer();
 const phases=live.rounds.map(round=>{
  const now=Date.parse(round.at),p=compose(maps,round.snapshots,now).flatMap(l=>l.posicoes??[]).find(p=>p.ordem==='D86241')!;
  assert.equal(terminalRadarVehicles([p.terminalPresence!],'81d26796-2248-4081-babd-508fbcfe5a95',[{linhaId:maps[1].linhaId!}],[],now).length,1);
  return {state:p.vehicleState,at:p.timestamp};
 });
 assert.deepEqual(phases.map(p=>p.state),['Na região da origem','Na região da origem','No terminal']);
 assert.equal(phases[0].at,phases[1].at);assert.notEqual(phases[2].at,phases[1].at);
});
test('missing speed stationary observations and conflict replay do not manufacture departure evidence',()=>{
 const f=sequence();assert.equal(f.tick(0,40,null).vehicleState,'Na região da origem');
 assert.equal(f.tick(180,41,null).vehicleState,'No terminal');
 for(let i=0;i<5;i++)assert.equal(f.tick(180,41,null).vehicleState,'No terminal');
 f.vehicle.location.longitude+=.02;f.snapshot.revision++;
 assert.equal(f.composer([f.line],[f.snapshot],f.base+180000)[0].posicoes![0].terminalPresence,undefined);
 f.snapshot.revision++;assert.equal(f.composer([f.line],[f.snapshot],f.base+180000)[0].posicoes![0].terminalPresence,undefined);
});
test('new physical progress renews inferred corridor evidence but repeated coordinates invalidate its GPS estimate',()=>{
 const f=sequence();f.tick(0,40,0);f.tick(30,40,0);f.tick(60,70,7.2);f.tick(90,130,7.2);
 for(let t=120;t<=330;t+=30){const p=f.tick(t,130+(t-90)*2,7.2);assert.equal(p.contextConfidence,'inferred');assert.equal(p.padraoVersaoId,f.corridor.pattern);assert.equal(p.padraoOperacionalId,null);}
 const p=f.tick(360,610,7.2),rows=terminalRadarVehicles([p.terminalPresence!],f.corridor.stops[1].id,[{linhaId:f.line.linhaId!}],[],f.base+360000);
 assert.equal(rows.length,1);assert.equal(rows[0].estimatedMinutes,undefined);assert.equal(p.terminalPresence!.contextAt,f.base+330000);
 const expired=f.composer([f.line],[f.snapshot],f.base+541000)[0].posicoes![0];assert.equal(expired.contextConfidence,undefined);assert.equal(expired.terminalPresence,undefined);
});
test('a fresh conflicting GTFS itinerary invalidates the inferred departure instead of reversing it',()=>{
 const f=sequence();f.tick(0,40,0);f.tick(30,40,0);f.tick(60,70,7.2);assert.equal(f.tick(90,130,7.2).contextConfidence,'inferred');
 const reverse=Object.keys(f.line.paradasPorPadrao!).find(id=>id!==f.corridor.pattern)!;
 const [latitude,longitude]=atMetres(f.corridor.coords,190);
 f.vehicle.operational={timestampGps:new Date(f.base+120000).toISOString(),status:0,latitude,longitude,linhaId:f.line.linhaId,codigoLinha:'855',padraoVersaoId:reverse,sentidoId:'conflicting-direction'};
 const conflict=f.tick(120,190,7.2,'GTFSRT_BUS');assert.equal(conflict.padraoVersaoId,null);assert.equal(conflict.contextConfidence,undefined);assert.equal(conflict.terminalPresence,undefined);assert.equal(conflict.backendMotionEligible,false);
});
test('a 855 physically near Campo Grande is never assigned the 838 operational origin',()=>{
 const f=sequence(),cg=capture.lines[0].map.paradasPorPadrao['59292df0-1e21-4bf1-a3ca-bd1f7b11ebbe']![0];
 f.vehicle.location={...f.vehicle.location,latitude:cg.latitude,longitude:cg.longitude,physicalAt:new Date(f.base).toISOString(),validUntil:new Date(f.base+600000).toISOString(),speedKmh:0};
 const result=f.composer([f.line],[f.snapshot],f.base)[0].posicoes![0];assert.equal(result.terminalPresence,undefined);assert.equal(result.vehicleState,undefined);
});
for(const count of [10,50,100,200])test(`early origin load ${count} keeps cached clock ticks and incremental simultaneous departures`,()=>{
 const f=sequence();f.tick(0,40,0);
 f.snapshot.vehicles=Array.from({length:count},(_,i)=>{const [lat,lon]=atMetres(f.corridor.coords,40+i*.05);return {...f.vehicle,order:'TEST-'+i,key:'TEST-'+i,location:{...f.vehicle.location,latitude:lat,longitude:lon}};});
 f.snapshot.revision++;f.composer([f.line],[f.snapshot],f.base);
 const update=(seconds:number,metres:number,speed:number)=>{
  for(const [i,v] of f.snapshot.vehicles.entries()){const [lat,lon]=atMetres(f.corridor.coords,metres+i*.05);v.location={...v.location,latitude:lat,longitude:lon,speedKmh:speed,physicalAt:new Date(f.base+seconds*1000).toISOString()};}
  f.snapshot.revision++;return f.composer([f.line],[f.snapshot],f.base+seconds*1000);
 };
 const stationary=update(30,40,0);assert.equal(stationary[0].posicoes!.filter(p=>p.vehicleState==='No terminal').length,count);
 let work=geometryWork.projections;
 for(let i=1;i<15;i++)assert.equal(f.composer([f.line],[f.snapshot],f.base+30000+i*1000),stationary);
 assert.equal(geometryWork.projections,work);
 update(60,70,7.2);const departing=update(90,130,7.2);
 assert.equal(departing[0].posicoes!.filter(p=>p.contextConfidence==='inferred').length,count);
 work=geometryWork.projections;
 for(let i=1;i<15;i++)assert.equal(f.composer([f.line],[f.snapshot],f.base+90000+i*1000),departing);
 assert.equal(geometryWork.projections,work);
 const rows=departing[0].posicoes!.flatMap(p=>p.terminalPresence?[p.terminalPresence]:[]);
 assert.equal(terminalRadarVehicles(rows,f.corridor.stops[1].id,[{linhaId:f.line.linhaId!}],[],f.base+90000).length,count);
});


test('official Campo Grande Sul accepts 838 origin presence but never treats 855 passing service as a Campo Grande origin',()=>{
 const stop='76cb0cef-0559-455c-9499-84fb3a02431c',cg=sequence('838','5144O00486P9');cg.tick(0,40,0);const v=cg.tick(30,40,0).terminalPresence!;const rows=terminalRadarVehicles([v],stop,[{linhaId:cg.line.linhaId!}],[],cg.base+30000);assert.equal(rows.length,1);assert.ok(Math.abs(rows[0].originToStopMetres!-913.76)<.01);
 const deodoro=sequence('855','o25h');deodoro.tick(0,40,0);const d=deodoro.tick(30,40,0).terminalPresence!;assert.equal(terminalRadarVehicles([d],stop,[{linhaId:deodoro.line.linhaId!}],[],deodoro.base+30000).length,0);assert.equal(d.corridors.some(c=>c.originId===v.terminalId),false);
});

test('radar catalog retains configured line color without inheriting map visibility or direction filters',()=>{const line={linhaId:'838',linhaCodigo:'838',nomeExibicao:'838',modal:'onibus' as const,cor:'#2979ff',ativa:true,modoSentido:'ambos' as const,mostrarParadas:false};const selected={...line,cor:'#ff8800',ativa:false,modoSentido:'ida' as const};const result=mergeTerminalRadarLines([selected],{lines:[line],maps:[],itineraries:{}});assert.equal(result.length,1);assert.equal(result[0].cor,selected.cor);assert.equal(result[0].ativa,true);assert.equal(result[0].modoSentido,'ambos');assert.equal(line.cor,'#2979ff');});

test('opening a stop cannot downgrade confirmed map dwell using the exact same canonical GPS in a fresh scoped tracker',()=>{
 const f=sequence('838');f.tick(0,40,0);const map=f.tick(30,40,0).terminalPresence!;
 const scoped=createHybridComposer()([f.line],[f.snapshot],f.base+30000)[0].posicoes![0].terminalPresence!;
 assert.equal(map.state,'No terminal');assert.equal(scoped.state,'Na região da origem');assert.equal(map.physicalAt,scoped.physicalAt);
 const merged=mergeTerminalEvidence([map],[scoped]);assert.equal(merged.length,1);assert.equal(merged[0].state,'No terminal');assert.equal(merged[0].dwellSince,map.dwellSince);assert.equal(merged[0].physicalAt,map.physicalAt);
});

test('equal GPS evidence retains observed dwell duration but newer departure transfer pattern and position conflicts replace it',()=>{
 const f=sequence('838');f.tick(0,40,0);const old=f.tick(60,40,0).terminalPresence!;const shorter={...old,dwellSince:old.physicalAt-15000};assert.equal(mergeTerminalEvidence([old],[shorter])[0].dwellSince,old.dwellSince);
 const provisional={...old,state:'Na região da origem' as const,dwellSince:undefined};for(const fresh of [{...provisional,physicalAt:old.physicalAt+30000},{...provisional,lineId:'different-line'},{...provisional,terminalId:'different-terminal'},{...provisional,latitude:old.latitude!+.001},{...provisional,corridors:[]},{...provisional,knownPattern:'new-pattern'}]){const previous={...old,knownPattern:old.corridors[0].pattern};assert.equal(mergeTerminalEvidence([previous],[fresh])[0],fresh);}
 const limited=mergeTerminalEvidence([old],[{...provisional,validUntil:old.validUntil-1000}])[0];assert.equal(limited.physicalAt,old.physicalAt);assert.equal(limited.validUntil,old.validUntil-1000);
 const departure=f.tick(90,90,10).terminalPresence!;assert.equal(departure.state,'Saindo do terminal');assert.equal(mergeTerminalEvidence([old],[departure])[0],departure);
 const scoped=createHybridComposer()([f.line],[f.snapshot],f.base+90000)[0].posicoes![0].terminalPresence!;assert.equal(scoped.state,'Na região da origem');assert.equal(mergeTerminalEvidence([departure],[scoped])[0],departure);
});
