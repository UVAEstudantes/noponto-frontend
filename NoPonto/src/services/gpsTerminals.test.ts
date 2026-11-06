import assert from 'node:assert/strict';
import test from 'node:test';
import { createHybridComposer } from './hybridContext';
import {GPS_POLICY,gpsPresentation,configureGpsPolicy} from './gpsPresentationPolicy';
import {geometryWork} from './hybridGps';
import {lineTerminals,terminalRadarVehicles} from './terminalTracking';
import type {LinhaParaMostrar} from '../components/mapOSM/types';
import type {UnifiedSnapshot} from './unifiedLocationContract';
const base=Date.parse('2026-11-02T12:00:00Z');
function fixture(){
 const compose=createHybridComposer();
 const stops=[0,100,400,750,1100,2200].map((metres,i)=>({paradaId:'s'+i,nome:i===0?'Terminal A':i===5?'Terminal B':'Parada '+i,ordem:i+1,latitude:0,longitude:metres/111195,posicaoLinha:metres/2200}));
 const coords:[number,number][]=[[0,0],[0,2200/111195]];
 const line:LinhaParaMostrar={nome:'855',modal:'onibus',linhaId:'line',terminaisOficiais:['Terminal A','Terminal B'],segmentos:[coords,[...coords].reverse()],itinerarioSegmentoMap:{out:0,back:1},paradasPorPadrao:{out:stops,back:[...stops].reverse().map((s,i)=>({...s,ordem:i+1}))},itinerarioSentidoMap:{out:'B',back:'A'}};
 const s:UnifiedSnapshot={schemaVersion:1,enabled:true,lineCode:'855',revision:1,composedAt:new Date(base).toISOString(),vehicles:[{key:'bus',order:'D86286',line:{lineId:'line',serviceCode:'855',state:1},location:{latitude:0,longitude:0,physicalAt:new Date(base).toISOString(),validUntil:new Date(base+600000).toISOString(),source:'ITS_CURRENT',provider:'ITS',speedKmh:0,uncertain:false,reason:'valid'},operational:null,spatial:{facilityStopId:'wrong-generic-anchor',state:'UncertainLocation'},motionEligible:false}]};
 const v=s.vehicles[0];
 const tick=(seconds:number,metres=0,speed=0)=>{s.revision++;v.location.physicalAt=new Date(base+seconds*1000).toISOString();v.location.longitude=metres/111195;v.location.speedKmh=speed;return compose([line],[s],base+seconds*1000)[0].posicoes![0];};
 return {compose,line,s,v,tick};
}
for(const seconds of [60,120,180,300,480,600])test(`GPS visual policy age ${seconds} separates appearance speed context and visibility`,()=>{
 const f=fixture();f.tick(0);const first=f.tick(20);
 assert.equal(first.vehicleState,'No terminal');
 const p=f.compose([f.line],[f.s],base+(20+seconds)*1000)[0].posicoes?.[0];
 const presentation=gpsPresentation(base+20000,base+(20+seconds)*1000);
 assert.equal(!!p,seconds<=480);assert.equal(presentation.delayed,seconds>=180);assert.equal(presentation.opacity,seconds>=300?.55:1);
 if(p){assert.equal(p.presencaRotulo,'No terminal');assert.equal(p.timestamp,base+20000);assert.equal(p.velocidade,undefined);assert.equal(p.lastObservedSpeedKmh,0);assert.equal(p.backendMotionEligible,false);assert.equal(p.gpsWarning,seconds>=300?'Última posição conhecida':seconds>=180?'GPS atrasado':null);}
});
test('terminal dwell does not renew on duplicates; zero-speed noise departure and return use hysteresis',()=>{
 const f=fixture();assert.equal(f.tick(0).vehicleState,'Na região da origem');
 for(let i=0;i<3;i++)assert.equal(f.tick(0).vehicleState,'Na região da origem');
 assert.equal(f.tick(20,1).vehicleState,'No terminal');
 assert.equal(f.tick(40,4,3).vehicleState,'No terminal');
 assert.equal(f.tick(60,25,6).vehicleState,'Saindo do terminal');
 assert.equal(f.tick(80,80,6).vehicleState,'Saindo do terminal');
 assert.equal(f.tick(100,1,0).vehicleState,'Na região da origem');
 assert.equal(f.tick(120,1,0).vehicleState,'No terminal');
});
test('foreign terminal anchor and missing official association cannot classify a bus',()=>{
 const f=fixture();f.line.terminaisOficiais=['Terminal B'];
 assert.equal(f.tick(0).terminalPresence,undefined);assert.equal(f.tick(20).terminalPresence,undefined);
 assert.notEqual(f.tick(40).presencaRotulo,'Perto do terminal');
 f.line.terminaisOficiais=[];assert.equal(f.tick(60).terminalPresence,undefined);
});
test('terminal radar intersects first three stops with 1500 metres and reconciles valid operational arrivals',()=>{
 const f=fixture();f.tick(0);const p=f.tick(20),v=p.terminalPresence!;
 for(const stop of ['s1','s2','s3'])assert.equal(terminalRadarVehicles([v],stop,[{linhaId:'line',padraoVersaoId:'out'}],[],base+20000).length,1);
 assert.equal(terminalRadarVehicles([v],'s0',[{linhaId:'line'}],[],base+20000).length,1);
 for(const stop of ['s4','s5','nearby-unrelated'])assert.equal(terminalRadarVehicles([v],stop,[{linhaId:'line'}],[],base+20000).length,0);
 assert.equal(terminalRadarVehicles([v],'s1',[{linhaId:'other'}],[],base+20000).length,0);
 assert.equal(terminalRadarVehicles([v],'s1',[{linhaId:'line',padraoVersaoId:'back'}],[],base+20000).length,0);
 assert.equal(v.knownPattern,null);
 assert.equal(terminalRadarVehicles([v],'s1',[{linhaId:'line'}],[{linhaId:'line',ordem:'D86286',secondsUntilEvent:60}],base+20000).length,1);
 assert.equal(terminalRadarVehicles([{...v,operationalConfirmed:true}],'s1',[{linhaId:'line'}],[],base+20000).length,1);
 assert.equal(terminalRadarVehicles([v],'s1',[{linhaId:'line'}],[],base+501000).length,0);
 // Compare alternatives: sequence alone admits a distant third stop, distance alone a fourth stop.
 const c=v.corridors[0];const modified={...v,corridors:[{...c,stops:[{id:'third-far',rank:3,metres:1515},{id:'fourth-near',rank:4,metres:700}]}]};
 for(const stop of ['third-far','fourth-near'])assert.equal(terminalRadarVehicles([modified],stop,[{linhaId:'line'}],[],base+20000).length,0);
});
test('two legitimate terminal origins stay separate and stale operational context cannot confirm a departure',()=>{
 const f=fixture();assert.equal(lineTerminals(f.line).length,2);
 f.tick(0,2200);const p=f.tick(20,2200);assert.equal(p.terminalPresence!.terminalId,'s5');
 assert.equal(terminalRadarVehicles([p.terminalPresence!],'s1',[{linhaId:'line',padraoVersaoId:'out'}],[],base+20000).length,0);
 f.v.operational={timestampGps:new Date(base-200000).toISOString(),status:0,latitude:0,longitude:2200/111195,linhaId:'line',codigoLinha:'855',padraoVersaoId:'back',sentidoId:'back'};
 assert.notEqual(f.tick(40,2200).contextConfidence,'confirmed');
});
test('D86286 ITS unknown to GTFS itinerary to ITS retains identity and bounds coherent projection',()=>{
 const f=fixture();assert.equal(f.tick(0,100,10).padraoVersaoId,null);
 f.v.operational={timestampGps:new Date(base+20000).toISOString(),status:0,latitude:0,longitude:155.6/111195,linhaId:'line',codigoLinha:'855',padraoVersaoId:'out',sentidoId:'out'};
 f.v.location.source='GTFSRT_BUS';const confirmed=f.tick(20,155.6,10);assert.equal(confirmed.contextConfidence,'confirmed');
 f.v.operational=null;f.v.location.source='ITS_CURRENT';const its=f.tick(40,211.2,10);assert.equal(its.contextConfidence,'retained');assert.equal(its.idVisual,confirmed.idVisual);
 assert.equal(its.projectionUntil,base+40000+GPS_POLICY.coherentProjectionMs);assert.equal(its.projectionMaxMetres,250);
 const observed=geometryWork.projections;
 assert.equal(f.compose([f.line],[f.s],base+45000)[0].posicoes![0],its);assert.equal(geometryWork.projections,observed);
 const seventy=f.compose([f.line],[f.s],base+110000)[0].posicoes![0];assert.equal(seventy.backendMotionEligible,true);assert.equal(seventy.velocidade,undefined);assert.equal(seventy.lastObservedSpeedKmh,10);
 const stopped=f.compose([f.line],[f.s],base+131000)[0].posicoes![0];assert.equal(stopped.backendMotionEligible,false);assert.notEqual(stopped.presencaRotulo,'Parado');
});

test('policy and per-pattern corridor overrides remain bounded and independent of GPS lifetime',()=>{
 assert.throws(()=>configureGpsPolicy({delayedMs:400000,attenuatedMs:300000}));
 assert.throws(()=>configureGpsPolicy({coherentProjectionMs:300000}));
 const p=configureGpsPolicy({delayedMs:200000,attenuatedMs:350000,publicMs:500000});
 assert.equal(gpsPresentation(base,base+180000,p).delayed,false);assert.equal(gpsPresentation(base,base+480000,p).visible,true);assert.equal(p.contextMs,180000);
 const f=fixture();f.line.terminalPatternPolicy={out:{initialStops:1,initialMetres:200}};
 f.tick(0);const row=f.tick(20).terminalPresence!;
 assert.equal(terminalRadarVehicles([row],'s1',[{linhaId:'line'}],[],base+20000).length,1);
 assert.equal(terminalRadarVehicles([row],'s2',[{linhaId:'line'}],[],base+20000).length,0);
});

test('terminal histories for 50 vehicles stay incremental and clock ticks do no geometric work',()=>{
 const f=fixture();f.s.vehicles=Array.from({length:50},(_,i)=>({...f.v,key:'bus'+i,order:'D'+i,location:{...f.v.location}}));
 f.compose([f.line],[f.s],base);
 const next={...f.s,revision:2,vehicles:f.s.vehicles.map(v=>({...v,location:{...v.location,physicalAt:new Date(base+20000).toISOString()}}))};
 const result=f.compose([f.line],[next],base+20000);assert.equal(result[0].posicoes!.filter(p=>p.vehicleState==='No terminal').length,50);
 const before=geometryWork.projections;
 for(let i=1;i<=20;i++)assert.equal(f.compose([f.line],[next],base+20000+i*1000),result);
 assert.equal(geometryWork.projections,before);
 const arrived={...next,revision:3,vehicles:next.vehicles.map((v,i)=>i? v:{...v,operational:{timestampGps:new Date(base+40000).toISOString(),latitude:0,longitude:0,status:0,linhaId:'line',codigoLinha:'855',padraoVersaoId:'out',sentidoId:'out'},location:{...v.location,source:'GTFSRT_BUS',physicalAt:new Date(base+40000).toISOString()}})};
 const rows=f.compose([f.line],[arrived],base+40000)[0].posicoes!.flatMap(p=>p.terminalPresence?[p.terminalPresence]:[]);
 assert.equal(terminalRadarVehicles(rows,'s1',[{linhaId:'line'}],[{linhaId:'line',ordem:'D0',secondsUntilEvent:60}],base+40000).some(v=>v.order==='D0'),true);
});

test('verified 838 Campo Grande origin admits its first two stops through a bounded 1500 metre corridor',()=>{
 const f=fixture();f.line.nome='838';f.s.lineCode='838';f.v.line.serviceCode='838';
 const stops=f.line.paradasPorPadrao!.out;stops[0].codigo='5144O00486P9';
 stops[1].longitude=914/111195;stops[2].longitude=1244/111195;stops[3].longitude=1665/111195;
 f.tick(0);const row=f.tick(20).terminalPresence!;
 assert.equal(row.corridors[0].maxMetres,1500);
 assert.equal(terminalRadarVehicles([row],'s1',[{linhaId:'line'}],[],base+20000).length,1);
 assert.equal(terminalRadarVehicles([row],'s2',[{linhaId:'line'}],[],base+20000).length,1);
 assert.equal(terminalRadarVehicles([row],'s3',[{linhaId:'line'}],[],base+20000).length,0);
});

test('terminal permanence survives a coherent sparse stationary GPS but not transfer conflict or impossible jump',()=>{
 const f=fixture();f.tick(0);f.tick(20);
 assert.equal(f.tick(180,1,0).vehicleState,'No terminal');
 f.line.nome='838';f.s.lineCode='838';f.v.line.serviceCode='838';f.v.line.lineId='new-line';f.line.linhaId='new-line';
 assert.equal(f.tick(200,1,0).vehicleState,'Na região da origem');assert.equal(f.tick(220,1,0).vehicleState,'No terminal');
 f.v.location.uncertain=true;assert.equal(f.tick(240,1,0).terminalPresence,undefined);
 f.v.location.uncertain=false;assert.equal(f.tick(260,1,0).vehicleState,'Na região da origem');f.tick(280,1,0);
 assert.equal(f.tick(300,2200,0).terminalPresence,undefined);
 assert.equal(f.tick(320,2200,0).vehicleState,'Na região da origem');assert.equal(f.tick(340,2200,0).vehicleState,'No terminal');
});

test('an itinerary ending at the terminal never confirms the outgoing corridor',()=>{
 const f=fixture();f.v.operational={timestampGps:new Date(base).toISOString(),latitude:0,longitude:0,status:0,linhaId:'line',codigoLinha:'855',padraoVersaoId:'back',sentidoId:'back'};
 f.tick(0);const arrival=f.tick(20).terminalPresence!;
 assert.equal(arrival.knownPattern,null);assert.equal(arrival.operationalConfirmed,true);
 f.v.operational=null;const generic=f.tick(40).terminalPresence!;
 assert.equal(generic.knownPattern,null);assert.equal(generic.operationalConfirmed,false);
 assert.equal(terminalRadarVehicles([generic],'s1',[{linhaId:'line',padraoVersaoId:'out'}],[],base+40000).length,1);
});

test('missing ITS speed keeps the last observation separately without renewing it or projecting',()=>{
 const f=fixture();f.v.operational={timestampGps:new Date(base).toISOString(),latitude:0,longitude:100/111195,status:0,linhaId:'line',codigoLinha:'855',padraoVersaoId:'out',sentidoId:'out'};
 f.tick(0,100,20);f.v.operational=null;f.v.location.speedKmh=null;f.v.location.physicalAt=new Date(base+20000).toISOString();f.v.location.longitude=200/111195;f.s.revision++;
 const p=f.compose([f.line],[f.s],base+20000)[0].posicoes![0];
 assert.equal(p.velocidade,undefined);assert.equal(p.lastObservedSpeedKmh,20);assert.equal(p.speedObservedAt,base);assert.equal(p.backendMotionEligible,false);
 const repeated=f.compose([f.line],[f.s],base+21000)[0].posicoes![0];assert.equal(repeated.speedObservedAt,base);
});

test('dwell duration uses distinct physical observations across ITS GTFS swaps and ends on departure or restart',()=>{
 const f=fixture();assert.equal(f.tick(0).terminalPresence?.dwellSince,undefined);
 const confirmed=f.tick(30).terminalPresence!;assert.equal(confirmed.state,'No terminal');assert.equal(confirmed.dwellSince,base);
 f.v.location.source='GTFS_RT';assert.equal(f.tick(60).terminalPresence!.dwellSince,base);
 f.v.location.source='ITS_CURRENT';const later=f.tick(90);assert.equal(later.terminalPresence!.dwellSince,base);
 const repeated=f.compose([f.line],[f.s],base+120000)[0].posicoes![0];assert.equal(repeated.terminalPresence!.physicalAt,base+90000);assert.equal(repeated.terminalPresence!.dwellSince,base);
 const moved=f.tick(120,60,10);assert.equal(moved.terminalPresence?.dwellSince,undefined);
 const fresh=createHybridComposer()([f.line],[f.s],base+120000)[0].posicoes![0];assert.equal(fresh.terminalPresence?.dwellSince,undefined);
});

test('expired terminal observations cannot bridge unobserved minutes into a new dwell',()=>{const f=fixture();f.tick(0);assert.equal(f.tick(30).terminalPresence!.dwellSince,base);const resumed=f.tick(400);assert.equal(resumed.terminalPresence!.dwellSince,undefined);assert.equal(resumed.vehicleState,'Na região da origem');const confirmed=f.tick(430);assert.equal(confirmed.vehicleState,'No terminal');assert.equal(confirmed.terminalPresence!.dwellSince,base+400000);});

test('stationary origin reference uses only eligible official route distances without geometry on radar ticks',()=>{
 const f=fixture();f.tick(0);const v=f.tick(20).terminalPresence!,stop='s2',links=[{linhaId:'line',padraoVersaoId:'out'}];
 const before=geometryWork.projections+geometryWork.cacheHits;const rows=terminalRadarVehicles([v],stop,links,[],base+20000);assert.ok(Math.abs(rows[0].originToStopMetres!-400)<.001);assert.equal(rows[0].distanceToStopMetres,undefined);assert.equal(rows[0].estimatedMinutes,undefined);
 for(let i=1;i<=20;i++)assert.equal(terminalRadarVehicles([v],stop,links,[],base+20000+i*1000)[0].originToStopMetres,rows[0].originToStopMetres);assert.equal(geometryWork.projections+geometryWork.cacheHits,before);
 const variants={...v,corridors:[v.corridors[0],{...v.corridors[0],pattern:'variant',stops:v.corridors[0].stops.map(s=>({...s,metres:s.metres+100}))}]};assert.equal(terminalRadarVehicles([variants],stop,[{linhaId:'line'}],[],base+20000)[0].originToStopMetres,undefined);
 assert.equal(terminalRadarVehicles([v],stop,[{linhaId:'line',padraoVersaoId:'back'}],[],base+20000).length,0);
});
