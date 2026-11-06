import assert from 'node:assert/strict';
import test from 'node:test';
import { createUnifiedCapabilityReader, parseUnifiedCapabilities, selectUnifiedCodes } from './unifiedNetwork';
import { acceptUnified, composeUnifiedSnapshots, type UnifiedSnapshot } from './unifiedLocationContract';
const cap={schemaVersion:1 as const,enabled:true,canonical:true,lineCodes:['838','843','621','2110','SP864','LECD135']};
test('network capability validates real code formats and rejects unsafe duplicate oversized lists',()=>{
 assert.deepEqual(parseUnifiedCapabilities(cap),cap);
 for(const lineCodes of [['../838'],['838','838'],Array(601).fill('838')])assert.equal(parseUnifiedCapabilities({...cap,lineCodes}),null);
 assert.deepEqual(selectUnifiedCodes(['621','621','SP864','unknown'],cap,[]),['621','SP864']);
 assert.deepEqual(selectUnifiedCodes([],cap,[]),[]);
 assert.deepEqual(selectUnifiedCodes(['621','838'],null,['838']),['838']);
 assert.deepEqual(selectUnifiedCodes(['838'],{...cap,enabled:false},['838']),[]);
});
test('shared capability load has one pending request bounded cache and bounded failure retry',async()=>{
 let now=1,calls=0;let resolve!:(value:unknown)=>void;const value=new Promise<unknown>(r=>{resolve=r;});
 const read=createUnifiedCapabilityReader(()=>{calls++;return value;},()=>now);
 const a=read(),b=read();await Promise.resolve();assert.equal(calls,1);resolve(cap);
 assert.equal(await a,await b);await read();assert.equal(calls,1);now+=30001;await read();assert.equal(calls,2);
 let attempts=0;const fail=createUnifiedCapabilityReader(async()=>{attempts++;throw new Error('offline');},()=>now);
 assert.equal(await fail(),null);await fail();assert.equal(attempts,1);now+=15001;await fail();assert.equal(attempts,2);
});
function point(code:string,at:number,id='A12345'):UnifiedSnapshot{
 return {schemaVersion:1,enabled:true,lineCode:code,revision:5,composedAt:new Date(at).toISOString(),vehicles:[{
 order:id,key:'onibus:SPPO:'+id,line:{lineId:'line-'+code,serviceCode:code,state:1,validatedAt:new Date(at).toISOString()},
 location:{latitude:-22.9,longitude:-43.5,physicalAt:new Date(at-20000).toISOString(),validUntil:new Date(at+580000).toISOString(),source:'ITS_CURRENT',provider:'ZIRIX',uncertain:false,reason:'newest_validated'},
 operational:null,spatial:{facilityStopId:null,state:'Outside'},motionEligible:false}]};
}
test('network marker exact ITS coordinate suppresses stale duplicate bus but preserves BRT',()=>{
 const now=Date.now(),s=point('SP864',now);assert.ok(acceptUnified(s,null));
 const lines=[{nome:'SP864',modal:'onibus',linhaId:'line-SP864',cor:'#ff5500',posicoes:[]},
 {nome:'843',modal:'onibus',posicoes:[{id:'A12345',timestamp:now-90000}]},
 {nome:'brt',modal:'brt',posicoes:[{id:'A12345',timestamp:now}]}];
 const result=composeUnifiedSnapshots(lines,[s],now);const p=result[0].posicoes![0];
 assert.equal(p.longitude,-43.5);assert.equal(p.backendMotionEligible,false);assert.equal(p.velocidade,undefined);
 assert.equal(p.sentidoId,null);assert.equal(p.proximaParadaNome,null);assert.equal(result[0].cor,'#ff5500');
 assert.equal(result[1].posicoes!.length,0);assert.equal(result[2].posicoes!.length,1);
 assert.equal(composeUnifiedSnapshots(lines,[s],now+600000)[0].posicoes!.length,0);
});
test('retained GTFS eligibility cannot exceed the unchanged 60 second horizon',()=>{
 const now=Date.now(),s=point('2110',now),v=s.vehicles[0];v.location.source='GTFSRT_BUS';v.motionEligible=true;
 v.location.physicalAt=new Date(now-60000).toISOString();v.operational={timestampGps:v.location.physicalAt,velocidade:22,padraoVersaoId:'confirmed'};
 const p=composeUnifiedSnapshots([{nome:'2110',modal:'onibus',linhaId:'line-2110'}],[s],now)[0].posicoes![0];
 assert.equal(p.backendMotionEligible,false);assert.equal(p.velocidade,undefined);assert.equal(p.gpsAtrasado,false);assert.equal(p.lastObservedSpeedKmh,22);assert.equal(p.padraoVersaoId,null);
});
test('460 independent network snapshots compose once per selected line without duplicate identity',()=>{
 const now=Date.now(),snaps=Array.from({length:460},(_,i)=>point('S'+i,now,'A'+(10000+i)));
 const lines=snaps.map(s=>({nome:s.lineCode,modal:'onibus',linhaId:'line-'+s.lineCode}));
 const result=composeUnifiedSnapshots(lines,snaps,now);const ids=result.flatMap(l=>l.posicoes??[]).map(v=>v.ordem);
 assert.equal(result.length,460);assert.equal(ids.length,460);assert.equal(new Set(ids).size,460);
});
