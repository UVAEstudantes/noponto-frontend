import assert from 'node:assert/strict';
import test from 'node:test';
import { createHybridComposer } from './hybridContext';
import type { UnifiedSnapshot } from './unifiedLocationContract';
import type { LinhaParaMostrar } from '../components/mapOSM/types';
const base=Date.parse('2026-11-02T12:00:00Z');
function fixture(){
 const compose=createHybridComposer();
 const line:LinhaParaMostrar={nome:'838',modal:'onibus',linhaId:'line',segmentos:[[[0,0],[0,.02]],[[0,.02],[0,0]]],itinerarioSegmentoMap:{out:0,back:1},itinerarioSentidoMap:{out:'Destino',back:'Origem'},paradasPorPadrao:{out:[{paradaId:'next',nome:'Parada seguinte',ordem:1,latitude:0,longitude:.01,posicaoLinha:.5}]}};
 const s:UnifiedSnapshot={schemaVersion:1,enabled:true,lineCode:'838',revision:1,composedAt:new Date(base).toISOString(),vehicles:[{key:'bus',order:'D86023',line:{lineId:'line',serviceCode:'838',state:1},location:{latitude:0,longitude:.001,physicalAt:new Date(base).toISOString(),validUntil:new Date(base+600000).toISOString(),source:'GTFSRT_BUS',provider:'GTFS',speedKmh:20,uncertain:false,reason:'valid'},operational:{timestampGps:new Date(base).toISOString(),latitude:0,longitude:.001,status:0,linhaId:'line',codigoLinha:'838',padraoVersaoId:'out',sentidoId:'direction',posicaoNaRota:.05},spatial:{facilityStopId:null,state:'Outside'},motionEligible:true}]};
 const v=s.vehicles[0];
 const tick=(seconds:number,lon:number)=>{v.location.physicalAt=new Date(base+seconds*1000).toISOString();v.location.longitude=lon;s.revision++;return compose([line],[s],base+seconds*1000)[0].posicoes![0];};
 return {compose,line,s,v,tick};
}
test('GTFS ITS null GTFS retains direction next stop speed and immutable validation time',()=>{
 const f=fixture();assert.equal(f.tick(0,.001).contextConfidence,'confirmed');
 f.v.operational=null;f.v.location.source='ITS_CURRENT';f.v.motionEligible=false;
 for(const t of [30,60,90]){const p=f.tick(t,.001+t*.00003);assert.equal(p.contextConfidence,'retained');assert.equal(p.contextValidatedAt,base);assert.equal(p.sentidoNome,'Destino');assert.equal(p.proximaParadaNome,'Parada seguinte');assert.ok(p.distanciaProximaParadaMetros!>600);assert.equal(p.velocidade,20);assert.notEqual(p.presencaRotulo,'Em viagem');assert.equal(p.backendMotionEligible,true);}
 f.v.operational={timestampGps:new Date(base+120000).toISOString(),latitude:0,longitude:.005,status:0,linhaId:'line',codigoLinha:'838',padraoVersaoId:'out',sentidoId:'direction'};
 f.v.location.source='GTFSRT_BUS';assert.equal(f.tick(120,.005).contextConfidence,'confirmed');
});
test('ITS physical continuity can infer a route after GTFS expiry while restart cannot inherit a trip',()=>{
 const f=fixture();f.tick(0,.001);f.v.operational=null;f.v.location.source='ITS_CURRENT';
 f.tick(90,.003);const physical=f.tick(180,.005);assert.equal(physical.padraoVersaoId,'out');assert.equal(physical.contextConfidence,'inferred');assert.equal(physical.sentidoId,null);assert.equal(physical.padraoOperacionalId,null);assert.notEqual(physical.presencaRotulo,'Em viagem');
 const restart=createHybridComposer();assert.equal(restart([f.line],[f.s],base+180000)[0].posicoes![0].padraoVersaoId,null);
 assert.equal(f.compose([f.line],[f.s],base+361000)[0].posicoes![0].padraoVersaoId,null);
});
for(const reason of ['transfer','conflict','jump','reverse','new-trip','terminal'])test(`context invalidation ${reason}`,()=>{
 const f=fixture();f.tick(0,.001);f.v.operational=null;f.v.location.source='ITS_CURRENT';
 if(reason==='transfer') {f.line.linhaId='other';f.v.line.lineId='other';}
 if(reason==='conflict')f.v.location.uncertain=true;
 if(reason==='new-trip')f.v.operational={timestampGps:new Date(base+30000).toISOString(),status:0,linhaId:'line',codigoLinha:'838',padraoVersaoId:'missing',sentidoId:'new'};
 if(reason==='terminal') {f.v.spatial.facilityStopId='terminal';f.tick(30,.019);}
 const p=f.tick(60,reason==='jump'?.019:reason==='reverse'?0:reason==='terminal'?.001:.002);
 assert.equal(p.padraoVersaoId,null);assert.equal(p.proximaParadaNome,null);
});
test('four coherent real samples infer direction while shared routes and loops stay unknown',()=>{
 const f=fixture();f.v.operational=null;f.v.location.source='ITS_CURRENT';
 for(const [t,x] of [[0,.001],[20,.002],[40,.003]])assert.equal(f.tick(t,x).padraoVersaoId,null);
 const inferred=f.tick(60,.004);assert.equal(inferred.contextConfidence,'inferred');assert.equal(inferred.sentidoNome,'Destino');assert.equal(inferred.proximaParadaNome,'Parada seguinte');assert.notEqual(inferred.presencaRotulo,'Em viagem');
 const shared=fixture();shared.v.operational=null;shared.line.segmentos!.push([[0,0],[0,.02]]);shared.line.itinerarioSegmentoMap!.shared=2;
 for(const [t,x] of [[0,.001],[20,.002],[40,.003],[60,.004]])assert.equal(shared.tick(t,x).padraoVersaoId,null);
 const loop=fixture();loop.v.operational=null;loop.line.segmentos=[[[0,0],[0,.02],[0,0]]];loop.line.itinerarioSegmentoMap={loop:0};
 for(const [t,x] of [[0,.001],[20,.002],[40,.003],[60,.004]])assert.equal(loop.tick(t,x).padraoVersaoId,null);
});
test('duplicates do not create history and delayed GPS disables projection without changing physical time',()=>{
 const f=fixture();f.v.operational=null;
 for(let i=0;i<6;i++)assert.equal(f.tick(0,.001).padraoVersaoId,null);
 const active=fixture();active.tick(0,.001);active.v.operational=null;active.v.location.source='ITS_CURRENT';active.tick(30,.002);
 const p=active.compose([active.line],[active.s],base+125000)[0].posicoes![0];assert.equal(p.timestamp,base+30000);assert.equal(p.backendMotionEligible,false);assert.equal(p.presencaRotulo,'GPS disponível');assert.equal(p.velocidade,undefined);assert.equal(p.lastObservedSpeedKmh,20);
});

test('regressive GPS cannot move the physical timestamp backward or count toward inference',()=>{
 const f=fixture();f.tick(0,.001);f.v.operational=null;f.v.location.source='ITS_CURRENT';
 f.tick(30,.002);const replay=f.tick(20,.0015);
 assert.equal(replay.timestamp,base+30000);assert.equal(replay.longitude,.002);assert.equal(replay.contextValidatedAt,base);
});
test('direction-filtered geometry cannot promote a sole visible candidate to inferred direction',()=>{
 const f=fixture();f.v.operational=null;f.line.modoSentido='ida';
 for(const [t,x] of [[0,.001],[20,.002],[40,.003],[60,.004]])assert.equal(f.tick(t,x).padraoVersaoId,null);
});

for(const state of ['Em viagem','Em movimento','Parado','GPS atrasado','Localização incerta','GPS disponível'])test(`short state priority ${state}`,()=>{
 const f=fixture();
 if(state!=='Em viagem')f.v.operational=null;
 if(state==='Parado')f.v.location.speedKmh=0;
 if(state==='GPS disponível')f.v.location.speedKmh=undefined;
 if(state==='Perto do terminal')f.v.spatial.facilityStopId='anchor';
 if(state==='Localização incerta')f.v.location.uncertain=true;
 if(state==='GPS atrasado')f.v.spatial.facilityStopId='unrelated-anchor';
 const p=state==='GPS atrasado'?f.compose([f.line],[f.s],base+180000)[0].posicoes![0]:f.tick(0,.001);
 assert.equal(p.presencaRotulo,state);
});


test('zero speed requires distinct physical evidence and estimates never replace observed zero',()=>{
 const f=fixture();f.tick(0,.001);f.v.location.speedKmh=0;f.v.operational=null;
 const moving=f.tick(20,.002);assert.equal(moving.lastObservedSpeedKmh,0);assert.equal(moving.projectionSpeedKind,'displacement');assert.ok(moving.estimatedSpeedKmh!>0);assert.equal(moving.physicalMotionState,'moving');
 const pause=f.tick(40,.002);assert.equal(pause.physicalMotionState,'pause_pending');assert.equal(pause.backendMotionEligible,true);assert.ok(pause.projectionMaxMetres!<=25);
 for(let i=0;i<3;i++)assert.equal(f.tick(40,.002).physicalMotionState,'pause_pending');
 const stopped=f.tick(60,.002);assert.equal(stopped.physicalMotionState,'stopped');assert.equal(stopped.backendMotionEligible,false);assert.equal(stopped.estimatedSpeedKmh,undefined);
 assert.equal(f.tick(80,.003).physicalMotionState,'moving');
});
test('partial operational metadata retains validated context without renewing its age',()=>{
 const f=fixture();f.tick(0,.001);
 f.v.operational={...f.v.operational!,timestampGps:new Date(base+30000).toISOString(),padraoVersaoId:null,sentidoId:null,latitude:undefined,longitude:undefined};
 const p=f.tick(30,.002);assert.equal(p.padraoVersaoId,'out');assert.equal(p.contextValidatedAt,base);assert.equal(p.sentidoNome,'Destino');assert.equal(p.backendMotionEligible,true);
 const expired=f.compose([f.line],[f.s],base+180000)[0].posicoes![0];assert.equal(expired.contextValidatedAt,undefined);assert.equal(expired.backendMotionEligible,false);
});

for(const conflict of ['line','direction','status'])test(`partial context is revoked on explicit ${conflict} conflict`,()=>{
 const f=fixture();f.tick(0,.001);
 f.v.operational={...f.v.operational!,timestampGps:new Date(base+30000).toISOString(),padraoVersaoId:null,sentidoId:conflict==='direction'?'opposite':null,linhaId:conflict==='line'?'other':'line',status:conflict==='status'?1:0};
 const p=f.tick(30,.002);assert.equal(p.padraoVersaoId,null);assert.equal(p.backendMotionEligible,false);
});

test('default visual horizon crosses 60 seconds but ends at 90 and coherent fixes permit 120',()=>{
 const f=fixture();const p=f.tick(0,.001);assert.equal(p.projectionUntil,base+90000);
 const aged=f.compose([f.line],[f.s],base+61000)[0].posicoes![0];assert.equal(aged.backendMotionEligible,true);assert.equal(aged.timestamp,base);assert.equal(aged.velocidade,undefined);
 assert.equal(f.compose([f.line],[f.s],base+90000)[0].posicoes![0].backendMotionEligible,false);
 const c=fixture();c.tick(0,.001);c.tick(20,.002);const coherent=c.tick(40,.003);assert.equal(coherent.projectionUntil,base+40000+120000);
});

for(const speed of [30,40])test(`validated budget ${speed} is available immediately and zero removes the extension`,()=>{
 const f=fixture();f.line.paradasPorPadrao!.out[0].longitude=.015;f.line.paradasPorPadrao!.out[0].posicaoLinha=.75;f.v.location.speedKmh=speed;const step=speed/3.6*20/111195;
 assert.ok(f.tick(0,.001).projectionMaxMetres!>250);f.tick(20,.001+step);
 const p=f.tick(40,.001+step*2);assert.ok(p.projectionMaxMetres!>250);assert.ok(p.projectionMaxMetres!<=1000);
 f.v.location.speedKmh=0;const stopped=f.tick(60,.001+step*2);assert.equal(stopped.backendMotionEligible,true);assert.equal(stopped.projectionMaxMetres,25);assert.equal(stopped.projectionSpeedKind,'possible_stop');
});

test('ordinary stop proximity or missing stop list cannot manufacture a physical halt',()=>{
 for(const near of [true,false]){
  const f=fixture();f.v.location.speedKmh=40;if(!near)f.line.paradasPorPadrao={};
  const step=40/3.6*20/111195;f.tick(0,.001);f.tick(20,.001+step);
  assert.equal(f.tick(40,.001+step*2).projectionMaxMetres,1000);
 }
});

test('fresh ITS fixes outlive stale GTFS SemSinal without renewing validated operational context',()=>{
 const f=fixture();f.tick(0,.001);f.v.location.source='ITS_CURRENT';f.v.motionEligible=false;f.v.operational!.status=1;
 for(const t of [30,60,90]){
  const p=f.tick(t,.001+t*.00003);assert.equal(p.padraoVersaoId,'out');assert.equal(p.sentidoId,'direction');
  assert.equal(p.contextValidatedAt,base);assert.equal(p.contextConfidence,'retained');assert.equal(p.physicalOnly,false);
  assert.equal(p.backendMotionEligible,true);assert.ok(p.posicaoNaRota!>0);assert.equal(p.proximaParadaNome,'Parada seguinte');
  assert.equal(p.timestamp,base+t*1000);assert.equal(f.compose([f.line],[f.s],base+t*1000)[0].posicoes!.length,1);
 }
 f.v.operational={...f.v.operational!,status:0,timestampGps:new Date(base+120000).toISOString(),longitude:.0046};f.v.location.source='GTFSRT_BUS';
 assert.equal(f.tick(120,.0046).contextConfidence,'confirmed');
});
for(const conflict of ['line','direction','inactive','same-fix'])test(`ITS cannot override operational ${conflict} conflict with fresh physical speed`,()=>{
 const f=fixture();f.tick(0,.001);f.v.location.source='ITS_CURRENT';f.v.operational!.status=conflict==='inactive'?2:1;
 if(conflict==='line')f.v.operational!.linhaId='other';if(conflict==='direction')f.v.operational!.sentidoId='reverse';
 const p=f.tick(conflict==='same-fix'?0:30,conflict==='same-fix'?.001:.002);
 assert.equal(p.backendMotionEligible,false);assert.equal(p.padraoVersaoId,null);
});

test('observed zero cannot unlock extra budget even when displacement estimates a moving speed',()=>{
 const f=fixture();f.line.paradasPorPadrao!.out[0].longitude=.015;f.v.location.speedKmh=30;
 const step=30/3.6*20/111195;f.tick(0,.001);f.tick(20,.001+step);assert.ok(f.tick(40,.001+step*2).projectionMaxMetres!>250);
 f.v.location.speedKmh=0;const p=f.tick(60,.001+step*3);assert.ok(p.estimatedSpeedKmh!>0);assert.equal(p.lastObservedSpeedKmh,0);assert.equal(p.projectionMaxMetres,40);
});
test('stale GTFS signal cannot renew context at expiration without a new distinct physical sample',()=>{
 const f=fixture();f.tick(0,.001);f.v.location.source='ITS_CURRENT';f.v.operational!.status=1;f.tick(30,.002);
 const p=f.compose([f.line],[f.s],base+180000)[0].posicoes![0];assert.equal(p.contextValidatedAt,undefined);assert.equal(p.backendMotionEligible,false);assert.equal(p.padraoVersaoId,null);
});

for(const speed of [30,40])test(`one two and three validated fixes provide time-compatible ${speed} kmh road budget`,()=>{
 const f=fixture();f.v.location.speedKmh=speed;const step=speed/3.6*20/111195;
 for(const t of [0,20,40]){
  const p=f.tick(t,.001+step*t/20);assert.ok(Math.abs(p.projectionMaxMetres!-speed/3.6*90)<.01);assert.equal(p.backendMotionEligible,true);
 }
});

test('time-compatible budget ends before a known terminal and cannot cross route end',()=>{
 const f=fixture();f.v.location.speedKmh=30;f.v.operational!.longitude=.016;
 f.line.terminaisOficiais=['Terminal A','Terminal B'];
 f.line.paradasPorPadrao={out:[{paradaId:'origin',nome:'Terminal A',ordem:1,latitude:0,longitude:0,posicaoLinha:0},{paradaId:'end',nome:'Terminal B',ordem:2,latitude:0,longitude:.02,posicaoLinha:1}]};
 const p=f.tick(0,.016);assert.ok(p.projectionMaxMetres!>0);assert.ok(p.projectionMaxMetres!<=p.distanciaProximaParadaMetros!-9);assert.ok(p.projectionMaxMetres!<750);
});


test('stale same-trip SemSinal cannot revoke a coherent inferred corridor after operational expiry',()=>{
 const f=fixture();f.tick(0,.001);f.v.location.source='ITS_CURRENT';f.v.operational!.status=1;
 for(const t of [30,60,90,120,150,180,210,240]){
  const p=f.tick(t,.001+t*.00003);assert.equal(p.padraoVersaoId,'out',`corridor at ${t}`);assert.equal(p.backendMotionEligible,true,`motion at ${t}`);
  if(t>=180){assert.equal(p.contextConfidence,'inferred');assert.equal(p.sentidoId,null);assert.equal(p.padraoOperacionalId,null);assert.ok(p.projectionMaxMetres!<=250);}
 }
});


for(const conflict of ['direction','pattern','line','inactive','uncertain'])test(`inferred ITS corridor still rejects a confirmed ${conflict} conflict after GTFS expiry`,()=>{
 const f=fixture();f.tick(0,.001);f.v.location.source='ITS_CURRENT';f.v.operational!.status=1;
 for(const t of [30,60,90,120,150,180])f.tick(t,.001+t*.00003);
 if(conflict==='direction')f.v.operational!.sentidoId='reverse';
 if(conflict==='pattern')f.v.operational!.padraoVersaoId='back';
 if(conflict==='line')f.v.operational!.linhaId='other';
 if(conflict==='inactive')f.v.operational!.status=2;
 if(conflict==='uncertain')f.v.location.uncertain=true;
 const p=f.tick(210,.0073);assert.equal(p.backendMotionEligible,false);assert.equal(p.padraoVersaoId,null);assert.equal(p.proximaParadaNome,null);
});

test('GTFS can confirm an ITS inferred corridor again without inheriting an operational validation time',()=>{
 const f=fixture();f.tick(0,.001);f.v.location.source='ITS_CURRENT';f.v.operational!.status=1;
 for(const t of [30,60,90,120,150,180,210])f.tick(t,.001+t*.00003);
 f.v.location.source='GTFSRT_BUS';f.v.operational={...f.v.operational!,status:0,timestampGps:new Date(base+240000).toISOString(),longitude:.0082};
 const p=f.tick(240,.0082);assert.equal(p.contextConfidence,'confirmed');assert.equal(p.contextValidatedAt,base+240000);assert.equal(p.sentidoId,'direction');assert.equal(p.backendMotionEligible,true);assert.equal(f.compose([f.line],[f.s],base+240000)[0].posicoes!.length,1);
});


test('one zero after recent motion permits only a short labelled residual and repeated GPS cannot confirm a stop',()=>{
 const f=fixture();f.v.location.speedKmh=30;f.tick(0,.001);f.tick(20,.0025);f.v.location.speedKmh=0;
 const p=f.tick(30,.0025);assert.equal(p.lastObservedSpeedKmh,0);assert.equal(p.physicalMotionState,'pause_pending');assert.equal(p.backendMotionEligible,true);assert.equal(p.projectionSpeedKind,'possible_stop');assert.ok(p.estimatedSpeedKmh!>0);assert.ok(p.projectionMaxMetres!<=25);assert.ok(p.projectionUntil!<=base+60000);
 for(let i=0;i<3;i++){const same=f.tick(30,.0025);assert.equal(same.physicalMotionState,'pause_pending');assert.equal(same.timestamp,base+30000);assert.equal(same.projectionUntil,p.projectionUntil);}
 const second=f.tick(40,.0025);assert.equal(second.backendMotionEligible,false);const third=f.tick(50,.0025);assert.equal(third.physicalMotionState,'stopped');assert.equal(third.backendMotionEligible,false);
 f.v.location.speedKmh=30;const resumed=f.tick(60,.0033);assert.equal(resumed.backendMotionEligible,true);assert.equal(resumed.physicalMotionState,'moving');assert.equal(resumed.lastObservedSpeedKmh,30);
});

test('widely separated zeros do not manufacture a short continuous stop or renew residual movement',()=>{
 const f=fixture();f.v.location.speedKmh=30;f.tick(0,.001);f.v.location.speedKmh=0;
 for(const t of [30,120,210]){const p=f.tick(t,.001);assert.notEqual(p.physicalMotionState,'stopped');if(t>=120)assert.equal(p.backendMotionEligible,false);}
});


test('repeated physical zero with confirmed displacement preserves its bounded speed estimate without a new stop vote',()=>{
 const f=fixture();f.tick(0,.001);f.v.location.speedKmh=0;const moved=f.tick(30,.003);
 assert.equal(moved.projectionSpeedKind,'displacement');assert.equal(moved.backendMotionEligible,true);const deadline=moved.projectionUntil;
 for(let i=0;i<3;i++){const same=f.tick(30,.003);assert.equal(same.backendMotionEligible,true);assert.equal(same.projectionSpeedKind,'displacement');assert.equal(same.projectionUntil,deadline);assert.equal(same.physicalMotionState,'moving');assert.equal(same.lastObservedSpeedKmh,0);}
});


test('distinct zero readings with ten metre directed progress cannot simultaneously confirm a stop',()=>{
 const f=fixture();f.tick(0,.001);f.v.location.speedKmh=0;
 for(const t of [30,60,90]){const p=f.tick(t,.001+(t/30)*11/111195);assert.equal(p.physicalMotionState,'moving');assert.equal(p.lastObservedSpeedKmh,0);assert.equal(p.projectionSpeedKind,'displacement');assert.ok(p.projectionMaxMetres!<=40);}
});
