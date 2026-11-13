import assert from 'node:assert/strict';
import test from 'node:test';
import { composeUnifiedLines, type UnifiedSnapshot } from './unifiedLocationContract';
import { projectPhysical,geometryForMap,stopsForMap,routeStopProjections,geometryWork } from './hybridGps';
const now = Date.parse('2026-11-02T12:00:00Z');
test('ITS preserves a current compatible operational itinerary without copying old next stop', () => {
  const s: UnifiedSnapshot = {schemaVersion:1,enabled:true,lineCode:'838',revision:1,composedAt:new Date(now).toISOString(),vehicles:[{
    key:'road:D86023',order:'D86023',line:{lineId:'line',serviceCode:'838',state:1},
    location:{latitude:0,longitude:.005,physicalAt:new Date(now-8000).toISOString(),validUntil:new Date(now+500000).toISOString(),source:'ITS_CURRENT',provider:'ITS',uncertain:false,reason:'newest'},
    operational:{timestampGps:new Date(now-30000).toISOString(),status:0,linhaId:'line',codigoLinha:'838',padraoVersaoId:'out',sentidoId:'direction',latitude:0,longitude:.004,velocidade:25,proximaParadaNome:'old'},
    spatial:{facilityStopId:null,state:'Outside'},motionEligible:false}]};
  const p=composeUnifiedLines([{nome:'838',modal:'onibus',linhaId:'line',itinerarioSegmentoMap:{out:0},segmentos:[[[0,0],[0,.01]]]}],s,now)[0].posicoes![0];
  assert.equal(p.padraoVersaoId,'out'); assert.equal(p.sentidoId,'direction');
  assert.equal(p.proximaParadaNome,null); assert.equal(p.timestamp,now-8000);
  assert.equal(p.backendMotionEligible,false);
});

test('physical projection measures remaining route through bends rather than straight line', () => {
  const shape: [number,number][] = [[0,0],[0,.001],[.001,.001]];
  const current=projectPhysical(shape,0,.0005)!;
  const stop=projectPhysical(shape,.001,.001)!;
  assert.ok(Math.abs(stop.metres-current.metres-166.79)<1);
  assert.ok(current.gap<1); assert.equal(stop.progress,1);
});

test('indexed geometry preserves exact nearest projection for near far and crossing points',()=>{
 const shape:[number,number][]=[[0,0],[0,.005],[.005,.005],[.005,0],[0,0]];
 for(const [lat,lon] of [[0,.002],[.003,.005],[.002,.002],[.02,.02],[0,0]]){
  const actual=projectPhysical(shape,lat,lon)!;
  let walked=0,bestGap=Infinity,bestMetres=0;
  for(let i=1;i<shape.length;i++){
   const a=shape[i-1],b=shape[i],dx=b[1]-a[1],dy=b[0]-a[0],length=Math.hypot(dx,dy);
   const t=Math.max(0,Math.min(1,((lon-a[1])*dx+(lat-a[0])*dy)/(length*length)));
   const gap=Math.hypot(lon-a[1]-dx*t,lat-a[0]-dy*t)*111195;
   if(gap<bestGap){bestGap=gap;bestMetres=(walked+length*t)*111195;}walked+=length;
  }
  assert.ok(Math.abs(actual.gap-bestGap)<1e-7);assert.ok(Math.abs(actual.metres-bestMetres)<1e-7);
 }
});

test('realtime structure adapters preserve references and source order across GPS-only renders',()=>{
 const coords:[number,number][]=[[-43,-22],[-43.01,-22.01]];
 const first=geometryForMap(coords);assert.equal(geometryForMap(coords),first);assert.deepEqual(first[0],[-22,-43]);assert.deepEqual(coords[0],[-43,-22]);
 const occurrences=[{ocorrenciaId:'b',ordem:2,paradaId:'b',codigoParada:'B',nome:'B',latitude:0,longitude:.001,posicaoLinha:1,distanciaMetros:100},{ocorrenciaId:'a',ordem:1,paradaId:'a',codigoParada:'A',nome:'A',latitude:0,longitude:0,posicaoLinha:0,distanciaMetros:0}];
 const stops=stopsForMap(occurrences);assert.equal(stopsForMap(occurrences),stops);assert.equal(stops[0].paradaId,'a');assert.equal(stops[1].distanciaMetros,100);assert.equal(occurrences[0].paradaId,'b');
});

for (const speed of [0,24,undefined,NaN,150]) test(`ITS observed speed remains independent of itinerary ${String(speed)}`, () => {
  const s: UnifiedSnapshot={schemaVersion:1,enabled:true,lineCode:'855',revision:1,composedAt:new Date(now).toISOString(),vehicles:[{
    key:'road:D86152',order:'D86152',line:{lineId:'line',serviceCode:'855',state:1},
    location:{latitude:0,longitude:0,physicalAt:new Date(now-8000).toISOString(),validUntil:new Date(now+500000).toISOString(),source:'ITS_CURRENT',provider:'ITS',uncertain:false,reason:'newest',speedKmh:speed},
    operational:null,spatial:{facilityStopId:null,state:'Outside'},motionEligible:false}]};
  const line={nome:'855',modal:'onibus',linhaId:'line'};
  const p=composeUnifiedLines([line],s,now)[0].posicoes![0];
  assert.equal(p.velocidade,speed===0||speed===24?speed:undefined);
  assert.equal(p.presencaRotulo,speed===0?'Parado':speed===24?'Em movimento':'GPS disponível');
  assert.equal(p.padraoVersaoId,null); assert.equal(p.proximaParadaNome,null);
  const delayed=composeUnifiedLines([line],s,now+60000)[0].posicoes![0];
  assert.equal(delayed.velocidade,undefined);assert.equal(delayed.presencaRotulo,'GPS disponível');assert.equal(delayed.gpsAtrasado,false);
});

test('prepared stops preserve raw and authoritative progress and invalidate new route or stop data',()=>{
 const coords:[number,number][]=[[0,0],[0,.01]];const stops=[{paradaId:'far',nome:'Far',ordem:2,posicaoLinha:.8,latitude:0,longitude:.008,distanciaMetros:200},{paradaId:'near',nome:'Near',ordem:1,posicaoLinha:.2,latitude:0,longitude:.002,distanciaMetros:800}];
 const raw=routeStopProjections(coords,stops);const work=geometryWork.cacheHits+geometryWork.projections;const authoritative=routeStopProjections(coords,stops,true);
 assert.equal(routeStopProjections(coords,stops),raw);assert.equal(routeStopProjections(coords,stops,true),authoritative);assert.equal(geometryWork.cacheHits+geometryWork.projections,work);
 assert.deepEqual(raw.map(s=>s.stop.paradaId),['near','far']);assert.deepEqual(authoritative.map(s=>s.stop.paradaId),['far','near']);assert.equal(authoritative[0].point!.metres,200);assert.ok(raw[0].point!.metres>220&&raw[0].point!.metres<225);assert.deepEqual(stops.map(s=>s.paradaId),['far','near']);
 const changedRoute=routeStopProjections([[0,0],[0,.02]],stops);assert.notEqual(changedRoute,raw);assert.ok(Math.abs(changedRoute[0].point!.progress-.1)<.000001);
 const changedStops=routeStopProjections(coords,[{...stops[1],longitude:.003}]);assert.notEqual(changedStops,raw);assert.ok(changedStops[0].point!.metres>330&&changedStops[0].point!.metres<335);
});
test('prepared stops retain ambiguity off-route gaps and invalid supplied distances',()=>{
 const loop:[number,number][]=[[0,0],[0,.01],[0,0]];const stop={paradaId:'loop',nome:'Loop',ordem:1,posicaoLinha:.5,latitude:0,longitude:.005};
 assert.equal(routeStopProjections(loop,[stop])[0].point!.ambiguous,true);
 for(const distanciaMetros of [-1,NaN,99999])assert.equal(routeStopProjections(loop,[{...stop,distanciaMetros}],true)[0].point!.ambiguous,true);
 const far=routeStopProjections(loop,[{...stop,latitude:.005}])[0];assert.ok(far.point!.gap>60);
 assert.equal(routeStopProjections([[0,0]],[stop])[0].point,null);assert.deepEqual(routeStopProjections(loop,[]),[]);
});

test('physical projection rejects absent geometry during 838 and 855 return-direction hydration', () => {
  for (const coords of [undefined, null, [], [[0,0]], [[0,0], undefined]]) {
    assert.equal(projectPhysical(coords as any, -22.9, -43.5), null);
  }
});
