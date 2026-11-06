import assert from 'node:assert/strict';
import test from 'node:test';
import {originPath,originDestination} from './originDeparture';
import {createHybridComposer} from './hybridContext';
import type {TerminalCorridor} from './terminalTracking';
import type {LinhaParaMostrar} from '../components/mapOSM/types';
import type {UnifiedSnapshot} from './unifiedLocationContract';
const m=111195;
function family():TerminalCorridor[]{
 const common={originId:'origin',originName:'Terminal A',destinationId:'destination',destinationName:'Terminal Rodoviário de Destino :: Plataforma A',stops:[{id:'one',rank:1,metres:100},{id:'two',rank:2,metres:180}],maxMetres:1500};
 return [{...common,pattern:'a',coords:[[0,0],[0,.002],[.004,.006]]},{...common,pattern:'b',coords:[[0,0],[0,.001],[0,.002],[-.004,.006],[.004,.006]]}];
}
test('common prefix ignores vertex density and ends before a branch without choosing a version',()=>{
 const variants=family(),path=originPath(variants)!;
 assert.equal(originDestination(variants),'Destino');assert.deepEqual(path.patterns,['a','b']);
 assert.ok(path.metres>=220&&path.metres<=225);assert.ok(path.coords.every(c=>Math.abs(c[0])<.00003));
 assert.equal(originPath(variants),path);assert.deepEqual(path.stops.map(s=>s.id),['one','two']);
 assert.equal(originDestination([variants[0],{...variants[1],destinationId:'other',destinationName:'Other'}]),undefined);
 assert.equal(originPath([{...variants[0],coords:[[0,0],[.004,0]]},variants[1]]),null);
});
test('shared physical prefix projects before trip identification and never supplies a stop after the branch',()=>{
 const variants=family(),base=Date.parse('2026-11-02T12:00:00Z');
 const origin={paradaId:'origin',nome:'Terminal A',ordem:1,latitude:0,longitude:0,posicaoLinha:0,distanciaMetros:0};
 const stops=[origin,{...origin,paradaId:'one',nome:'Primeira',ordem:2,longitude:100/m,distanciaMetros:100},{...origin,paradaId:'two',nome:'Segunda',ordem:3,longitude:180/m,distanciaMetros:180},{...origin,paradaId:'destination',nome:variants[0].destinationName!,ordem:4,latitude:.004,longitude:.006,distanciaMetros:850}];
 const line:LinhaParaMostrar={nome:'838',linhaId:'line',modal:'onibus',modoSentido:'ambos',terminaisOficiais:['Terminal A',variants[0].destinationName!],segmentos:variants.map(v=>v.coords),itinerarioSegmentoMap:{a:0,b:1},paradasPorPadrao:{a:stops,b:stops.map(s=>({...s}))}};
 const snapshot:UnifiedSnapshot={schemaVersion:1,enabled:true,lineCode:'838',revision:0,composedAt:new Date(base).toISOString(),vehicles:[{key:'D86150',order:'D86150',line:{lineId:'line',serviceCode:'838',state:1},location:{latitude:0,longitude:0,physicalAt:new Date(base).toISOString(),validUntil:new Date(base+600000).toISOString(),speedKmh:0,source:'ITS_CURRENT',provider:'ITS',uncertain:false,reason:'valid'},operational:null,spatial:{facilityStopId:null,state:'Outside'},motionEligible:false}]};
 const compose=createHybridComposer();
 const tick=(seconds:number,metres:number,speed=9,latitude=0)=>{snapshot.revision++;snapshot.vehicles[0].location={...snapshot.vehicles[0].location,latitude,physicalAt:new Date(base+seconds*1000).toISOString(),longitude:metres/m,speedKmh:speed};return compose([line],[snapshot],base+seconds*1000)[0].posicoes![0];};
 tick(0,0,0);tick(20,0,0);const first=tick(40,50);
 assert.equal(first.sentidoNome,'Destino');assert.equal(first.padraoVersaoId,null);assert.equal(first.routeConfidence,'shared');assert.equal(first.backendMotionEligible,true);assert.equal(first.proximaParadaNome,'Primeira');assert.ok(Math.abs(first.distanciaProximaParadaMetros!-50)<1);
 assert.ok(first.projectionMaxMetres!<=175);assert.equal(first.sentidoId,null);
 const nearBranch=tick(60,190);assert.equal(nearBranch.proximaParadaNome,null);assert.equal(nearBranch.distanciaProximaParadaMetros,null);assert.equal(nearBranch.padraoVersaoId,null);assert.ok(nearBranch.projectionMaxMetres!<=35);
 const chosen=tick(80,.0027*m,18,-.0007);assert.equal(chosen.padraoVersaoId??chosen.physicalRoutePattern,'b');assert.equal(chosen.backendMotionEligible,true);assert.ok(chosen.motionRemainingMetres!>100);assert.equal(chosen.operationConfirmed,false);
 assert.equal(tick(100,.0033*m,18,-.0013).backendMotionEligible,true);
});
