import assert from 'node:assert/strict';
import test from 'node:test';
import { createHybridComposer } from './hybridContext';
import { geometryWork } from './hybridGps';
import type { LinhaParaMostrar } from '../components/mapOSM/types';
import type { UnifiedSnapshot } from './unifiedLocationContract';
const now=Date.parse('2026-11-02T12:00:00Z');
for(const count of [10,50,100,200])test(`render load ${count}: no geometry or new payload on clock ticks; incremental GPS remains bounded`,()=>{
 const coords:[number,number][]=Array.from({length:1001},(_,i)=>[0,i*.00002]);
 const line:LinhaParaMostrar={nome:'855',modal:'onibus',linhaId:'line',segmentos:[coords],itinerarioSegmentoMap:{out:0},paradasPorPadrao:{out:Array.from({length:30},(_,i)=>({paradaId:String(i),nome:'Parada '+i,ordem:i,latitude:0,longitude:.005+i*.0004,posicaoLinha:.25+i*.02}))}};
 const snapshot:UnifiedSnapshot={schemaVersion:1,enabled:true,lineCode:'855',revision:1,composedAt:new Date(now).toISOString(),vehicles:Array.from({length:count},(_,i)=>({key:'bus'+i,order:'D'+i,line:{lineId:'line',serviceCode:'855',state:1},location:{latitude:0,longitude:.001+i*.00001,physicalAt:new Date(now).toISOString(),validUntil:new Date(now+600000).toISOString(),source:'ITS_CURRENT',provider:'ITS',speedKmh:20,uncertain:false,reason:'valid'},operational:{timestampGps:new Date(now).toISOString(),latitude:0,longitude:.001+i*.00001,status:0,linhaId:'line',codigoLinha:'855',padraoVersaoId:'out',sentidoId:'direction'},spatial:{facilityStopId:null,state:'Outside'},motionEligible:false}))};
 const metrics={calls:0,processing:0,cached:0,lastMs:0,maxMs:0};const compose=createHybridComposer({metrics});
 const first=compose([line],[snapshot],now);const initial=geometryWork.projections;
 for(let i=1;i<=5;i++)assert.equal(compose([{...line}],[snapshot],now+i*1000),first);
 assert.equal(geometryWork.projections,initial);assert.equal(metrics.processing,1);assert.equal(metrics.cached,5);
 const v=snapshot.vehicles[0];const changed={...snapshot,revision:2,vehicles:[{...v,location:{...v.location,physicalAt:new Date(now+30000).toISOString(),longitude:.002}},...snapshot.vehicles.slice(1)]};
 const updated=compose([line],[changed],now+30000);
 assert.equal(updated[0].posicoes![0].longitude,.002);assert.ok(geometryWork.projections-initial<=3);
 const metres=updated[0].posicoes![0].distanciaProximaParadaMetros;
 const stale=compose([line],[changed],now+91000)[0].posicoes![0];
 assert.equal(stale.timestamp,now+30000);assert.equal(stale.distanciaProximaParadaMetros,metres);
 assert.equal(stale.padraoVersaoId,'out');assert.equal(stale.velocidade,undefined);assert.equal(stale.backendMotionEligible,false);
 const beforeA=geometryWork.projections;
 const basic=createHybridComposer({enabled:false})([line],[snapshot],now);
 assert.equal(geometryWork.projections,beforeA);assert.equal(basic[0].posicoes![0].longitude,.001);
 assert.equal(basic[0].posicoes![0].padraoVersaoId,null);
});

test('metadata-only snapshots reuse stop geometry for 200 vehicles without changing physical information',()=>{
 const coords:[number,number][]=[[0,0],[0,.02]];
 const stops=Array.from({length:60},(_,i)=>({paradaId:'s'+i,nome:'Stop '+i,ordem:i,posicaoLinha:i/60,latitude:0,longitude:.005+i*.0002}));
 const line:LinhaParaMostrar={nome:'855',modal:'onibus',linhaId:'line',segmentos:[coords],itinerarioSegmentoMap:{out:0},paradasPorPadrao:{out:stops}};
 const snapshot:UnifiedSnapshot={schemaVersion:1,enabled:true,lineCode:'855',revision:1,composedAt:new Date(now).toISOString(),vehicles:Array.from({length:200},(_,i)=>({key:'v'+i,order:'V'+i,line:{lineId:'line',serviceCode:'855',state:1},location:{latitude:0,longitude:.001+i*.00001,physicalAt:new Date(now).toISOString(),validUntil:new Date(now+600000).toISOString(),source:'ITS_CURRENT',provider:'ITS',speedKmh:20,uncertain:false,reason:'valid'},operational:{timestampGps:new Date(now).toISOString(),latitude:0,longitude:.001+i*.00001,status:0,linhaId:'line',codigoLinha:'855',padraoVersaoId:'out',sentidoId:'out'},spatial:{facilityStopId:null,state:'Outside'},motionEligible:false}))};
 const compose=createHybridComposer();const first=compose([line],[snapshot],now);
 const before=geometryWork.cacheHits+geometryWork.projections;
 const updated=compose([{...line}],[{...snapshot,revision:2,composedAt:new Date(now+1000).toISOString()}],now+1000);
 const queries=geometryWork.cacheHits+geometryWork.projections-before;assert.ok(queries<=810,'static stops must not be reprojected per bus: '+queries);
 assert.equal(updated[0].posicoes!.length,200);
 for(let i=0;i<200;i++){const p=updated[0].posicoes![i],old=first[0].posicoes![i];assert.equal(p.timestamp,now);assert.equal(p.proximaParadaNome,'Stop 0');assert.equal(p.distanciaProximaParadaMetros,old.distanciaProximaParadaMetros);assert.equal(p.padraoVersaoId,'out');assert.equal(p.backendMotionEligible,true);}
});
