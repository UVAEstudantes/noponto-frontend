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
 const p=active.compose([active.line],[active.s],base+95000)[0].posicoes![0];assert.equal(p.timestamp,base+30000);assert.equal(p.backendMotionEligible,false);assert.equal(p.presencaRotulo,'GPS disponível');assert.equal(p.velocidade,undefined);assert.equal(p.lastObservedSpeedKmh,20);
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
