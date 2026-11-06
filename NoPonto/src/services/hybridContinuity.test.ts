import assert from 'node:assert/strict';
import test from 'node:test';
import {createHybridComposer} from './hybridContext';
import {lineTerminals,terminalRadarVehicles} from './terminalTracking';
import {terminalRadarScope} from './terminalRadarContext';
import {projectPhysical} from './hybridGps';
import type {LinhaParaMostrar} from '../components/mapOSM/types';
import type {UnifiedSnapshot} from './unifiedLocationContract';
import { terminalFixture as capture, privateReplay } from './fixtures/terminalFixture';
const base=Date.parse('2026-11-02T12:00:00Z'),m=111195;
function fixture(){
 const stops=[0,100,500,1000,3000,5000].map((d,i)=>({paradaId:'s'+i,nome:i===0?'Terminal A':i===5?'Terminal B':'Stop '+i,latitude:0,longitude:d/m,ordem:i+1,posicaoLinha:d/5000,distanciaMetros:d}));
 const line:LinhaParaMostrar={linhaId:'line',nome:'838',modal:'onibus',modoSentido:'ambos',terminaisOficiais:['Terminal A','Terminal B'],segmentos:[[[0,0],[0,5000/m]],[[0,5000/m],[0,0]]],itinerarioSegmentoMap:{out:0,back:1},itinerarioSentidoMap:{out:'Terminal B',back:'Terminal A'},paradasPorPadrao:{out:stops,back:[...stops].reverse().map((s,i)=>({...s,ordem:i+1,distanciaMetros:5000-s.distanciaMetros}))}};
 const snapshot:UnifiedSnapshot={schemaVersion:1,enabled:true,lineCode:'838',revision:1,composedAt:new Date(base).toISOString(),vehicles:[{key:'D86089',order:'D86089',line:{lineId:'line',serviceCode:'838',state:1},location:{latitude:0,longitude:0,physicalAt:new Date(base).toISOString(),validUntil:new Date(base+1000000).toISOString(),source:'ITS_CURRENT',provider:'ITS',speedKmh:0,uncertain:false,reason:'valid'},operational:null,spatial:{facilityStopId:null,state:'Outside'},motionEligible:false}]};
 const compose=createHybridComposer(),v=snapshot.vehicles[0];
 const tick=(seconds:number,d:number,speed:number)=>{snapshot.revision++;v.location={...v.location,longitude:d/m,speedKmh:speed,physicalAt:new Date(base+seconds*1000).toISOString()};return compose([line],[snapshot],base+seconds*1000)[0].posicoes![0];};
 return {line,snapshot,v,compose,tick};
}
test('continuous ITS progress preserves inferred route beyond origin corridor and operational expiry',()=>{
 const f=fixture();f.v.operational={timestampGps:new Date(base).toISOString(),status:0,latitude:0,longitude:100/m,linhaId:'line',codigoLinha:'838',padraoVersaoId:'out',sentidoId:'out'};
 assert.equal(f.tick(0,100,12).contextConfidence,'confirmed');f.v.operational=null;
 for(let t=30;t<=360;t+=30){const p=f.tick(t,100+t*12/3.6,12);assert.equal(p.padraoVersaoId,'out',`route at ${t}`);assert.ok(p.proximaParadaNome,`next at ${t}`);assert.equal(p.backendMotionEligible,true,`motion at ${t}`);}
});
test('one zero speed during real ITS displacement preserves departure route and derives motion without rewriting observed speed',()=>{
 const f=fixture();f.tick(0,0,0);f.tick(20,0,0);f.tick(40,50,9);
 const zero=f.tick(60,100,0);assert.equal(zero.sentidoNome,'B');assert.equal(zero.backendMotionEligible,true);assert.equal(zero.lastObservedSpeedKmh,0);assert.ok(zero.projectionSpeedKmh!>0);
 const resumed=f.tick(80,150,9);assert.equal(resumed.backendMotionEligible,true);assert.ok(resumed.proximaParadaNome);
});
test('a real multi-fix stop pauses projection keeps itinerary and resumes on displacement',()=>{
 const f=fixture();f.tick(0,0,0);f.tick(20,0,0);f.tick(40,50,9);f.tick(60,100,9);
 assert.equal(f.tick(80,100,0).backendMotionEligible,false);const stopped=f.tick(100,100,0);assert.equal(stopped.padraoVersaoId,'out');assert.equal(stopped.backendMotionEligible,false);
 assert.equal(f.tick(120,150,9).backendMotionEligible,true);
});
test('positive reported speed without real displacement cannot renew visual movement or assert a physical stop',()=>{
 const f=fixture();f.v.operational={timestampGps:new Date(base).toISOString(),status:0,latitude:0,longitude:100/m,linhaId:'line',codigoLinha:'838',padraoVersaoId:'out',sentidoId:'out'};
 f.tick(0,100,18);f.v.operational=null;f.tick(30,250,18);
 for(const t of [60,90]){const p=f.tick(t,250,18);assert.equal(p.backendMotionEligible,false);assert.equal(p.motionReason,'speed_without_displacement');assert.equal(p.lastObservedSpeedKmh,18);assert.equal(p.padraoVersaoId,'out');assert.notEqual(p.physicalMotionState,'stopped');}
});
test('unusable same-trip GTFS metadata cannot erase a still-valid validated route carried by newer ITS',()=>{
 const f=fixture();f.v.operational={timestampGps:new Date(base).toISOString(),status:0,latitude:0,longitude:100/m,linhaId:'line',codigoLinha:'838',padraoVersaoId:'out',sentidoId:'out'};
 f.tick(0,100,12);f.v.operational={...f.v.operational,timestampGps:new Date(base+30000).toISOString(),latitude:undefined,longitude:undefined};
 const carried=f.tick(30,200,12);assert.equal(carried.padraoVersaoId,'out');assert.equal(carried.contextValidatedAt,base);assert.equal(carried.backendMotionEligible,true);
});
test('loading missing geometry revalidates the same original GTFS timestamp without waiting for another GPS',()=>{
 const f=fixture();f.v.operational={timestampGps:new Date(base).toISOString(),status:0,latitude:0,longitude:100/m,linhaId:'line',codigoLinha:'838',padraoVersaoId:'out',sentidoId:'out'};
 const segments=f.line.segmentos;f.line.segmentos=[];assert.equal(f.tick(0,100,12).padraoVersaoId,null);
 const p=f.compose([{...f.line,segmentos:segments}],[f.snapshot],base+1000)[0].posicoes![0];assert.equal(p.contextConfidence,'confirmed');assert.equal(p.padraoVersaoId,'out');assert.equal(p.timestamp,base);
});
test('a fresh valid GTFS return trip supersedes the previous route without waiting for a second operational update',()=>{
 const f=fixture();f.v.operational={timestampGps:new Date(base).toISOString(),status:0,latitude:0,longitude:4900/m,linhaId:'line',codigoLinha:'838',padraoVersaoId:'out',sentidoId:'out'};
 assert.equal(f.tick(0,4900,18).contextConfidence,'confirmed');
 f.v.operational={timestampGps:new Date(base+30000).toISOString(),status:0,latitude:0,longitude:5000/m,linhaId:'line',codigoLinha:'838',padraoVersaoId:'back',sentidoId:'back'};
 const p=f.tick(30,5000,0);assert.equal(p.padraoVersaoId,'back');assert.equal(p.contextConfidence,'confirmed');assert.equal(p.backendMotionEligible,false);
});
test('a recent incoming bus switches terminal evidence to its actual destination and is visible at the platform',()=>{
 const f=fixture();f.tick(0,0,0);f.tick(20,0,0);
 for(let d=500;d<=5000;d+=500)f.tick(20+d/500*30,d,60);
 f.tick(350,5000,0);const p=f.tick(380,5000,0);assert.equal(p.vehicleState,'No terminal');assert.equal(p.terminalPresence!.terminalId,'s5');
 assert.equal(terminalRadarVehicles([p.terminalPresence!],'s5',[{linhaId:'line',padraoVersaoId:'back'}],[],base+380000).length,1);
});
test('recent GPS near a closing route endpoint uses physical progress instead of the overlapping origin',()=>{
 const f=fixture(),coords:[number,number][]=[[0,0],[0,.01],[.001,.01],[.001,0],[0,.00002]];
 f.line.segmentos=[coords,[...coords].reverse()];
 const total=projectPhysical(coords,.001,.008)!.totalMetres;
 const stops=f.line.paradasPorPadrao!.out;stops.splice(0,stops.length,{...stops[0],paradaId:'A',nome:'Terminal A',latitude:0,longitude:0,ordem:1,distanciaMetros:0},{...stops[1],paradaId:'B',nome:'Terminal B',latitude:0,longitude:.00002,ordem:2,distanciaMetros:total});
 f.v.operational={timestampGps:new Date(base).toISOString(),status:0,latitude:.001,longitude:.008,linhaId:'line',codigoLinha:'838',padraoVersaoId:'out',sentidoId:'out'};
 f.v.location.latitude=.001;assert.equal(f.tick(0,.008*m,18).contextConfidence,'confirmed');f.v.operational=null;
 f.tick(30,.004*m,18);f.tick(60,0,18);f.v.location.latitude=.0001;
 const arriving=f.tick(90,0,12);assert.equal(arriving.padraoVersaoId,'out');assert.equal(arriving.proximaParadaNome,'Terminal B');assert.equal(arriving.backendMotionEligible,true);assert.ok(arriving.posicaoNaRota!>.95);assert.ok(arriving.distanciaProximaParadaMetros!<30);
});
test('recorded real 838 and 855 source handoffs keep route and physical timestamps for the four monitored identities',{skip: !privateReplay('continuity.json')},()=>{
 const real=privateReplay('continuity.json') as {rounds:{at:string;snapshots:UnifiedSnapshot[]}[]};
 const lines=capture.lines.map(l=>l.map as unknown as LinhaParaMostrar),compose=createHybridComposer();
 const frames=real.rounds.map(r=>compose(lines,r.snapshots,Date.parse(r.at)));
 for(let i=0;i<frames.length;i++)for(const id of ['D86089','D86131','D86150','D86241']){
  const physical=real.rounds[i].snapshots.flatMap(s=>s.vehicles).find(v=>v.order===id),p=frames[i].flatMap(l=>l.posicoes??[]).find(p=>p.ordem===id);
  assert.ok(physical);assert.ok(p);assert.equal(p.timestamp,Date.parse(physical.location.physicalAt));assert.equal(p.unifiedSource,physical.location.source);
 }
 for(const id of ['D86150','D86241']){
  const positions=frames.map(f=>f.flatMap(l=>l.posicoes??[]).find(p=>p.ordem===id)!);
  assert.equal(positions[0].unifiedSource,'GTFSRT_BUS');assert.equal(positions[1].unifiedSource,'ITS_CURRENT');assert.equal(positions[1].padraoVersaoId,positions[0].padraoVersaoId);assert.ok(positions[1].proximaParadaNome);
 }
});
test('Deodoro E5 platform subscribes 855 and shows a physically stationary TEST-MAGARCA-855 without a departure ETA',()=>{
 const source=structuredClone(capture.lines.find(l=>l.map.nome==='855')!),line=source.map as unknown as LinhaParaMostrar;
 const endpoint=lineTerminals(line).find(e=>e.stop.codigo==='o25h')!,pattern=endpoint.corridors[0].pattern;
 const snapshot=source.snapshot as UnifiedSnapshot,v=snapshot.vehicles[0];snapshot.vehicles=[v];v.key=v.order='TEST-MAGARCA-855';v.operational=null;v.line.validatedAt=new Date(base).toISOString();
 v.location={...v.location,latitude:endpoint.stop.latitude,longitude:endpoint.stop.longitude,physicalAt:new Date(base).toISOString(),validUntil:new Date(base+600000).toISOString(),source:'ITS_CURRENT',speedKmh:0,uncertain:false};
 const compose=createHybridComposer();compose([line],[snapshot],base);v.location.physicalAt=new Date(base+30000).toISOString();snapshot.revision++;
 const p=compose([line],[snapshot],base+30000)[0].posicoes![0];assert.equal(p.vehicleState,'No terminal');
 const stop={parada:endpoint.stop,distancia:0,vinculos:[{linhaId:line.linhaId!,padraoVersaoId:pattern,sentidoId:'out',destino:'Magarça'}]};
 assert.deepEqual(terminalRadarScope({maps:[line],lines:[],itineraries:{}},stop).map(l=>l.nome),['855']);
 const rows=terminalRadarVehicles([p.terminalPresence!],endpoint.stop.paradaId,stop.vinculos,[],base+30000);
 assert.deepEqual(rows.map(v=>v.order),['TEST-MAGARCA-855']);assert.equal(rows[0].estimatedMinutes,undefined);
 assert.equal(terminalRadarVehicles([{...p.terminalPresence!,state:'Saindo do terminal'}],endpoint.stop.paradaId,stop.vinculos,[],base+30000).length,0);
});
